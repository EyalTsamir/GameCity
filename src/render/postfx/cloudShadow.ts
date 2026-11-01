// Soft cloud shadows as a screen-space "deferred decal".
//
// Cloud coverage is first rasterised into a small world-space map indexed by the
// point where a sun ray hits the ground plane: for a parallel light, every point P
// on that ray (street, roof, wall) sees the same clouds, so
//     lit(P) = map( P.xz − L.xz · P.y / L.y )
// is exact for any height. The map (256², ~3.5 m texels — the shadows' soft edges are
// 6+ m wide, so this is indistinguishable from 512² at a quarter of the cost, ~0.1 ms)
// is rebuilt every frame; the per-pixel cost is one position reconstruction + one fetch.
// Data comes from the sky module (ctx.services.cloudShadows).

import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';
import { FS_VERT, FullscreenPass } from './fullscreen';
import { CLOUD_LAYER_GLSL, CLOUD_SHADOW_FIELD_GLSL, type CloudLayerUniforms } from '../sky/cloudLayer';

export const MAX_CLOUDS = 16;

/** Shared with the sky module: it writes, post-processing reads. */
export interface CloudShadowData {
  /** 8 floats per cloud: x, z, halfLen, halfWid, cos(yaw), sin(yaw), altitude, fade */
  data: Float32Array;
  count: number;
  /** unit vector towards the light */
  light: THREE.Vector3;
  /** 0..1 overall strength (sun visibility, overcast) */
  strength: number;
  /** colour multiplier deep inside a cloud shadow (direct light removed) */
  tint: THREE.Color;
  /** world mode: haze extinction (1/m) — distant shadows fade into the aerial perspective */
  haze?: number;
  /** world mode: the high cloud layer whose density field casts the shadows (ellipses unused) */
  field?: CloudLayerUniforms;
}

/** world mode: the map is rendered from the high cloud layer's density field around the camera */
const MAP_FIELD_FRAG = /* glsl */ `
${CLOUD_LAYER_GLSL}
${CLOUD_SHADOW_FIELD_GLSL}
uniform vec3 uL;
uniform vec4 uMapRect;
varying vec2 vUv;
void main() {
  vec2 g = uMapRect.xy + vUv * uMapRect.zw;
  float lit = thCloudLit(g, uL);
  gl_FragColor = vec4(lit, lit, lit, 1.0);
}
`;

const MAP_FRAG = /* glsl */ `
uniform vec4 uCloudA[${MAX_CLOUDS}];
uniform vec4 uCloudB[${MAX_CLOUDS}];
uniform int uCloudN;
uniform vec3 uL;
uniform vec4 uMapRect; // x0, z0, sizeX, sizeZ
varying vec2 vUv;
void main() {
  vec2 g = uMapRect.xy + vUv * uMapRect.zw; // ground point under the ray
  vec2 slope = uL.xz / max(uL.y, 0.08);
  float lit = 1.0;
  for (int i = 0; i < ${MAX_CLOUDS}; i++) {
    if (i >= uCloudN) break;
    vec4 a = uCloudA[i];
    vec4 b = uCloudB[i];
    if (b.w <= 0.001) continue;
    vec2 p = g + slope * b.z - a.xy;
    // cheap reject: outside the circle around the ellipse's long axis (r > 1.4 for sure)
    float rr = 1.4 * max(a.z, a.w);
    if (dot(p, p) > rr * rr) continue;
    vec2 q = vec2(p.x * b.x - p.y * b.y, p.x * b.y + p.y * b.x) / a.zw;
    float r = length(q);
    if (r > 1.4) continue;
    float ang = atan(q.y, q.x);
    float wob = 1.0 + 0.09 * sin(ang * 3.0 + a.x * 0.13) + 0.06 * sin(ang * 5.0 - a.y * 0.11);
    float cover = 1.0 - smoothstep(0.35, 1.0, r / wob);
    lit *= 1.0 - cover * b.w;
  }
  gl_FragColor = vec4(lit, lit, lit, 1.0);
}
`;

/** Shared uniforms (map + reconstruction), also bound by the tilt-shift prefilter. */
export function cloudShadowUniforms() {
  return {
    tCloudMap: new THREE.Uniform<THREE.Texture | null>(null),
    uCloudRect: new THREE.Uniform(new THREE.Vector4(-460, -450, 920, 860)),
    uCloudL: new THREE.Uniform(new THREE.Vector3(0, 1, 0)),
    uCloudStrength: new THREE.Uniform(0),
    uCloudTint: new THREE.Uniform(new THREE.Color(0.6, 0.65, 0.75)),
    uProjInv: new THREE.Uniform(new THREE.Matrix4()),
    uCamWorld: new THREE.Uniform(new THREE.Matrix4()),
    /** haze extinction (1/m) for the distance fade (0 = none) */
    uCloudHaze: new THREE.Uniform(0),
  };
}
export type CloudShadowUniforms = ReturnType<typeof cloudShadowUniforms>;

/** GLSL: uniforms + `vec3 cloudShadowMul(vec2 uv, float depth)` (1 = unshadowed). */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform sampler2D tCloudMap;
uniform vec4 uCloudRect;
uniform vec3 uCloudL;
uniform float uCloudStrength;
uniform vec3 uCloudTint;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform float uCloudHaze;
vec3 cloudShadowMul(vec2 uv, float depth) {
  if (uCloudStrength <= 0.001 || depth >= 0.999999) return vec3(1.0);
  vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 wp = (uCamWorld * vec4(vp.xyz / vp.w, 1.0)).xyz;
  vec2 g = wp.xz - uCloudL.xz * (wp.y / max(uCloudL.y, 0.08));
  vec2 m = (g - uCloudRect.xy) / uCloudRect.zw;
  float lit = texture2D(tCloudMap, m).r;
  float k = 1.0;
  if (uCloudHaze > 0.0) {
    // world mode: unshadowed outside the camera-centred map, and the shadow fades with the haze in front
    vec2 em = min(m, 1.0 - m);
    lit = mix(1.0, lit, smoothstep(0.0, 0.04, min(em.x, em.y)));
    k = exp(-uCloudHaze * length(wp - uCamWorld[3].xyz));
  }
  return mix(vec3(1.0), uCloudTint, (1.0 - lit) * uCloudStrength * k);
}
`;

const FRAG = /* glsl */ `
${CLOUD_SHADOW_GLSL}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * cloudShadowMul(uv, depth), inputColor.a);
}
`;

export class CloudShadowEffect extends Effect {
  private map: THREE.WebGLRenderTarget;
  private pass: FullscreenPass;
  private a: THREE.Vector4[] = [];
  private b: THREE.Vector4[] = [];
  /** set by the module each frame */
  source: CloudShadowData | undefined;
  enabled = true;

  /** world mode: the cloud layer field (map follows the camera) */
  private field: CloudLayerUniforms | null;
  private fieldPass: FullscreenPass | null = null;
  /** world map extent (m) */
  fieldSize = 9000;

  constructor(
    private u: CloudShadowUniforms,
    private camera: THREE.PerspectiveCamera,
    rect: { x0: number; z0: number; x1: number; z1: number },
    size = 256,
    field: CloudLayerUniforms | null = null,
  ) {
    super('CloudShadowEffect', FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>(Object.entries(u) as [string, THREE.Uniform][]),
    });
    this.map = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.map.texture.name = 'CloudShadow.Map';
    u.tCloudMap.value = this.map.texture;
    u.uCloudRect.value.set(rect.x0, rect.z0, rect.x1 - rect.x0, rect.z1 - rect.z0);
    for (let i = 0; i < MAX_CLOUDS; i++) {
      this.a.push(new THREE.Vector4(0, 0, 1, 1));
      this.b.push(new THREE.Vector4(1, 0, 100, 0));
    }
    this.pass = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'CloudShadowMap',
        uniforms: {
          uCloudA: { value: this.a },
          uCloudB: { value: this.b },
          uCloudN: { value: 0 },
          uL: u.uCloudL,
          uMapRect: u.uCloudRect,
        },
        vertexShader: FS_VERT,
        fragmentShader: MAP_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
    this.field = field;
    if (field) {
      this.fieldPass = new FullscreenPass(
        new THREE.ShaderMaterial({
          name: 'CloudShadowFieldMap',
          uniforms: { ...field, uL: u.uCloudL, uMapRect: u.uCloudRect },
          vertexShader: FS_VERT,
          fragmentShader: MAP_FIELD_FRAG,
          depthTest: false,
          depthWrite: false,
          blending: THREE.NoBlending,
          toneMapped: false,
        }),
      );
    }
  }

  override update(renderer: THREE.WebGLRenderer): void {
    const u = this.u;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(this.camera.matrixWorld);
    const src = this.source;
    if (this.fieldPass) {
      // world: shadows of the cloud layer in a camera-centred map (snapped to texels: no swimming)
      if (!src || !this.enabled || src.strength <= 0.001) {
        u.uCloudStrength.value = 0;
        return;
      }
      const size = this.fieldSize;
      const texel = size / this.map.width;
      const cx = Math.round(this.camera.position.x / texel) * texel,
        cz = Math.round(this.camera.position.z / texel) * texel;
      u.uCloudRect.value.set(cx - size / 2, cz - size / 2, size, size);
      u.uCloudL.value.copy(src.light);
      u.uCloudStrength.value = src.strength;
      u.uCloudTint.value.copy(src.tint);
      u.uCloudHaze.value = src.haze ?? 0;
      this.fieldPass.render(renderer, this.map);
      return;
    }
    if (!src || !this.enabled || src.strength <= 0.001 || src.count === 0) {
      u.uCloudStrength.value = 0;
      return;
    }
    const n = Math.min(MAX_CLOUDS, src.count);
    const d = src.data;
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      this.a[i].set(d[o], d[o + 1], d[o + 2], d[o + 3]);
      this.b[i].set(d[o + 4], d[o + 5], d[o + 6], d[o + 7]);
    }
    this.pass.material.uniforms.uCloudN.value = n;
    u.uCloudL.value.copy(src.light);
    u.uCloudStrength.value = src.strength;
    u.uCloudTint.value.copy(src.tint);
    this.pass.render(renderer, this.map);
  }

  /** resolution of the world-space coverage map (debug / tuning) */
  setMapSize(size: number): void {
    this.map.setSize(size, size);
  }

  override dispose(): void {
    super.dispose();
    this.map.dispose();
    this.pass.dispose();
    this.fieldPass?.dispose();
  }
}
