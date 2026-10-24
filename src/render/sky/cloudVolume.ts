// Raymarched cumulus deck (world mode): real 3D clouds with flat bases and domed, sunlit tops.
//
// The deck is a spherical slab (base ~1.5 km, ~1.1 km thick) over the earth's curve; its density is the
// 2D thickness field of sky/cloudLayer.ts (`cuField`) shaped by a height profile (`cuDens`). Every
// half-resolution pixel marches its view ray through the slab in 10 steps (start jittered per pixel),
// lighting each cloudy sample by the sun through the cloud above it (2 cheap taps toward the light,
// Beer + a multiple-scattering floor), a dual-lobe phase (silver lining toward the sun), sky ambient
// from above / ground bounce from below, and the town's glow at night; distant clouds fade into the
// horizon haze. The result (premultiplied colour, alpha) is composited by the sky dome (sky pixels only),
// so geometry needs no depth test against it.
//
// Rendered once per frame by post-processing right before the scene pass (final camera), or by the
// sky module itself when post-processing is off. Clear-sky rays cost 2 texture taps per step (the
// placement test), cloudy samples ~7.
//
// Clean edges: the march start is jittered per pixel AND per frame, and a half-res resolve pass blends
// it into a history (reprojected by view direction — at km distances camera rotation dominates — and
// clamped to the current frame's neighbourhood so moving clouds never ghost). A still view converges to
// a noise-free image within ~15 frames; the dome then upsamples it with a small filter.

import * as THREE from 'three';
import { FS_VERT, FullscreenPass } from '../postfx/fullscreen';
import { CLOUD_LAYER_GLSL, type CloudLayerUniforms } from './cloudLayer';
import { ATMO_FUNCS, ATMO_N, atmoData } from '../atmosphere';

const STEPS = 12;

const FRAG = /* glsl */ `
uniform vec4 thAtmo[${ATMO_N}];
${ATMO_FUNCS}
${CLOUD_LAYER_GLSL}
uniform vec3 uCloudSun;
uniform vec3 uCloudAmbTop;
uniform vec3 uCloudAmbBot;
uniform vec3 uCloudCity;
uniform vec3 uCloudL;
uniform mat4 uVProjInv;
uniform mat4 uVCamWorld;
uniform vec3 uVCamPos;
uniform float uSteps;
uniform float uFrame;
varying vec2 vUv;
const float RE = 6360e3;

float hg(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

void main() {
  vec4 vp = uVProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize((uVCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz);
  gl_FragColor = vec4(0.0);
  if (uCu.x <= 0.005 || dir.y < -0.03) return;
  vec3 cam = uVCamPos;
  float base = uCu.y, thick = uCuSlab.x;
  float t0 = clShell(cam.y, dir, base);
  float t1 = clShell(cam.y, dir, base + thick);
  if (t0 < 0.0 || t1 < 0.0) return;
  // grazing rays cross tens of km of deck: march only its first part (beyond, haze takes over)
  t1 = min(t1, t0 + 11000.0);
  float dt = (t1 - t0) / uSteps;
  // white-noise start offset, new every frame (interleaved-gradient noise varies almost only along x and
  // painted vertical bars); the temporal resolve averages it away
  vec3 jp = fract(vec3(gl_FragCoord.xy, uFrame) * vec3(0.1031, 0.1030, 0.0973));
  jp += dot(jp, jp.yzx + 33.33);
  float j = fract((jp.x + jp.y) * jp.z);
  float lod = clamp(log2(t0 / 2500.0), 0.0, 4.0);
  float mu = dot(dir, uCloudL);
  float phase = mix(hg(mu, 0.65), hg(mu, -0.2), 0.3) * 4.0 * 3.14159265;
  vec3 lstep = uCloudL / max(uCloudL.y, 0.15);
  float sigma = uCuSlab.y;
  float T = 1.0;
  vec3 S = vec3(0.0);
  float tw = 0.0, ww = 0.0;
  for (int i = 0; i < ${STEPS}; i++) {
    if (float(i) >= uSteps) break;
    float t = t0 + (float(i) + j) * dt;
    vec3 p = cam + dir * t;
    float dxz = length(p.xz - cam.xz);
    float alt = p.y + dxz * dxz / (2.0 * RE);
    float h01 = (alt - base) / thick;
    if (h01 < 0.0 || h01 > 1.0) continue;
    // placement first (cheap); the billowy rims only where a cloud can be
    float dc = cuDens(p.xz, h01, lod, false);
    if (dc <= 0.002) continue;
    float d = cuDens(p.xz, h01, lod, true);
    if (d <= 0.002) continue;
    // sunlight through the cloud between this sample and the sun (two cheap taps along the slant path)
    float up = (1.0 - h01) * thick;
    vec3 o1 = lstep * min(120.0, up * 0.35 + 30.0);
    vec3 o2 = lstep * min(380.0, up + 90.0);
    vec3 q1 = p + o1, q2 = p + o2;
    float h1 = clamp((q1.y - base) / thick, 0.0, 1.0), h2 = clamp((q2.y - base) / thick, 0.0, 1.0);
    float l1 = length(o1), l2 = length(o2);
    float od = cuDens(q1.xz, h1, lod + 0.5, false) * l1 + cuDens(q2.xz, h2, lod + 1.0, false) * (l2 - l1);
    // Beer + a multiple-scattering octave (light diffusing through the cloud keeps bases grey, not black)
    float Tl = exp(-sigma * od) + 0.32 * exp(-sigma * 0.08 * od);
    float tau = d * sigma * dt;
    float a = 1.0 - exp(-tau);
    vec3 amb = mix(uCloudAmbBot, uCloudAmbTop, smoothstep(0.0, 0.85, h01)) * (0.65 + 0.35 * h01);
    amb += uCloudCity * (1.0 - h01) * smoothstep(9000.0, 1500.0, dxz);
    vec3 L = uCloudSun * Tl * phase * (0.75 + 0.25 * h01) + amb;
    S += T * L * a;
    tw += t * T * a;
    ww += T * a;
    T *= 1.0 - a;
    if (T < 0.03) break;
  }
  float alpha = 1.0 - T;
  if (alpha <= 0.001) return;
  // aerial perspective: distant clouds melt into the horizon haze in their direction
  float tm = tw / max(ww, 1e-4);
  float far = 1.0 - exp(-tm / 38000.0);
  S = mix(S, thHazeColor(dir) * thAtmo[10].y * alpha, far * 0.85);
  alpha *= smoothstep(-0.03, 0.02, dir.y);
  gl_FragColor = vec4(S * smoothstep(-0.03, 0.02, dir.y), alpha);
}
`;

const RESOLVE_FRAG = /* glsl */ `
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform mat4 uVProjInv;
uniform mat4 uVCamWorld;
uniform mat4 uPrevVP;
uniform float uAlpha;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tCur, vUv);
  if (uAlpha >= 0.999) { gl_FragColor = c; return; }
  vec4 n1 = texture2D(tCur, vUv + vec2(uTexel.x, 0.0));
  vec4 n2 = texture2D(tCur, vUv - vec2(uTexel.x, 0.0));
  vec4 n3 = texture2D(tCur, vUv + vec2(0.0, uTexel.y));
  vec4 n4 = texture2D(tCur, vUv - vec2(0.0, uTexel.y));
  vec4 mn = min(c, min(min(n1, n2), min(n3, n4)));
  vec4 mx = max(c, max(max(n1, n2), max(n3, n4)));
  // reproject by direction: where was this sky direction on screen last frame?
  vec4 vp = uVProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = (uVCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz;
  vec4 pc = uPrevVP * vec4(dir, 0.0);
  if (pc.w <= 1e-5) { gl_FragColor = c; return; }
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  if (any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)))) { gl_FragColor = c; return; }
  vec4 h = texture2D(tHist, puv);
  // the jittered frame under-estimates the true local range a little: widen the box before clamping
  vec4 ext = (mx - mn) * 0.3;
  h = clamp(h, mn - ext, mx + ext);
  gl_FragColor = mix(h, c, uAlpha);
}
`;

export class CloudVolume {
  /** this frame's march (noisy) */
  readonly target: THREE.WebGLRenderTarget;
  /** resolved history ping-pong: the dome samples `texture` (the latest one) */
  private hist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private histIdx = 0;
  private pass: FullscreenPass;
  private resolve: FullscreenPass;
  private prevVP = new THREE.Matrix4();
  private prevPos = new THREE.Vector3();
  private prevFwd = new THREE.Vector3();
  private frame = 0;
  private valid = false;
  /** blend weight of the current frame (lower = smoother, more history) */
  blend = 0.14;
  private size = new THREE.Vector2();
  /** full drawing-buffer size the dome divides gl_FragCoord by */
  readonly fullRes = new THREE.Vector2(1, 1);
  renders = 0;
  /** drawing-buffer divisor (2 = half resolution) */
  private div = 2;

  /** quality tier: low ⅓ res / 6 steps, medium ½ / 8, high ½ / 10 */
  setQuality(level: string): void {
    this.div = level === 'low' ? 3 : 2;
    this.pass.material.uniforms.uSteps.value = level === 'low' ? 7 : level === 'medium' ? 9 : STEPS;
  }

  constructor(uniforms: CloudLayerUniforms) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
    this.target = new THREE.WebGLRenderTarget(1, 1, opts);
    this.target.texture.name = 'Clouds.Volume';
    this.hist = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.hist[0].texture.name = 'Clouds.HistA';
    this.hist[1].texture.name = 'Clouds.HistB';
    this.resolve = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'CloudResolve',
        uniforms: {
          tCur: { value: this.target.texture },
          tHist: { value: null },
          uVProjInv: { value: new THREE.Matrix4() },
          uVCamWorld: { value: new THREE.Matrix4() },
          uPrevVP: { value: new THREE.Matrix4() },
          uAlpha: { value: 1 },
          uTexel: { value: new THREE.Vector2() },
        },
        vertexShader: FS_VERT,
        fragmentShader: RESOLVE_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
    this.pass = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'CloudVolume',
        uniforms: {
          ...uniforms,
          thAtmo: { value: atmoData },
          uVProjInv: { value: new THREE.Matrix4() },
          uVCamWorld: { value: new THREE.Matrix4() },
          uVCamPos: { value: new THREE.Vector3() },
          uSteps: { value: STEPS },
          uFrame: { value: 0 },
        },
        vertexShader: FS_VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
  }

  /** the resolved (clean) cloud image of the latest frame */
  get texture(): THREE.Texture {
    return this.hist[this.histIdx].texture;
  }

  /** drop the history (time jumps, weather switches): the next frame starts clean */
  reset(): void {
    this.valid = false;
  }

  /** render the deck for `camera` at half the renderer's drawing-buffer resolution */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(this.size);
    this.fullRes.copy(this.size);
    const w = Math.max(1, Math.ceil(this.size.x / this.div)),
      h = Math.max(1, Math.ceil(this.size.y / this.div));
    if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
      this.hist[0].setSize(w, h);
      this.hist[1].setSize(w, h);
      this.valid = false;
    }
    const u = this.pass.material.uniforms;
    camera.updateMatrixWorld();
    (u.uVProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.uVCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (u.uVCamPos.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    this.frame = (this.frame + 1) % 4096;
    u.uFrame.value = this.frame;
    // camera cut (big jump in position or view direction): no history
    _pos.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(_fwd);
    if (this.valid && (_pos.distanceTo(this.prevPos) > 400 || _fwd.dot(this.prevFwd) < 0.8)) this.valid = false;
    const prev = renderer.getRenderTarget();
    this.pass.render(renderer, this.target);
    // resolve into the other history target
    const ru = this.resolve.material.uniforms;
    const src = this.hist[this.histIdx];
    const dst = this.hist[1 - this.histIdx];
    ru.tHist.value = src.texture;
    (ru.uVProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (ru.uVCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (ru.uPrevVP.value as THREE.Matrix4).copy(this.prevVP);
    (ru.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    ru.uAlpha.value = this.valid ? this.blend : 1;
    this.resolve.render(renderer, dst);
    this.histIdx = 1 - this.histIdx;
    renderer.setRenderTarget(prev);
    // this frame's direction → clip transform (rotation only) for the next frame's reprojection
    _rot.extractRotation(camera.matrixWorld).invert();
    this.prevVP.multiplyMatrices(camera.projectionMatrix, _rot);
    this.prevPos.copy(_pos);
    this.prevFwd.copy(_fwd);
    this.valid = true;
    this.renders++;
  }

  dispose(): void {
    this.target.dispose();
    this.hist[0].dispose();
    this.hist[1].dispose();
    this.pass.dispose();
    this.resolve.dispose();
  }
}

const _pos = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _rot = new THREE.Matrix4();
