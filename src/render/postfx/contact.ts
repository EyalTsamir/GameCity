// Contact shadows (close-up round, ?nocontact): whatever touches the ground, a wall or a person's foot closes the light right
// at the contact, where the sun's map (a texel of 10 cm at best) can't. A short ray per half-res pixel in the depth N8AO has
// already downsampled: from the point towards the light, a little way, in steps that bunch up near the start. By day the light
// is the sun, and a hit counts only where the sun's map says the point is lit, so a shadow never doubles. At night it is
// the virtual lamp of the lamp map at that point: bins, benches and people get a short lamp shadow.
//
// One half-res pass of its own (RG: contact, distance), then a small blur that respects depth in aoApply's prep pass; it comes out in
// the blue channel of the pack and upsamples with the AO, on the same fetches. No noise: the steps are fixed and the blur smooths them.
// A hit counts less the further along the ray it lies, so the shadow dies away from the contact instead of ending in an edge.
// With the camera above the range (`uCOn.x` 0) neither pass runs: far views pay one compare per pixel.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { LAMP_MAP } from '../../core/lampLight';
import { nearLens } from '../../core/nearDetail';

export function contactUniforms() {
  return {
    /** xyz view-space direction to the sun, w its share of the light on a sunlit surface (0: the lamps instead) */
    uCKey: new THREE.Uniform(new THREE.Vector4(0, 1, 0, 0)),
    /** x fade start, y fade end (m), z lamp gain, w half-res pixel size in m at 1 m */
    uCFar: new THREE.Uniform(new THREE.Vector4(11, 20, 0, 0.002)),
    uCProj: new THREE.Uniform(new THREE.Matrix4()),
    uCV2W: new THREE.Uniform(new THREE.Matrix4()),
    uCW2V: new THREE.Uniform(new THREE.Matrix4()),
    uCV2S: new THREE.Uniform(new THREE.Matrix4()),
    tCShadow: new THREE.Uniform<THREE.Texture | null>(null),
    uLampMap: new THREE.Uniform<THREE.Texture | null>(null),
    uLampXf: new THREE.Uniform(new THREE.Vector4(0, 0, 1, 1)),
    /** x fade end (m), 0 = nothing in range this frame */
    uCOn: new THREE.Uniform(new THREE.Vector2(0, 0)),
    /** the contact pass's output: r contact, g distance */
    tCPack: new THREE.Uniform<THREE.Texture | null>(null),
  };
}
export type ContactUniforms = ReturnType<typeof contactUniforms>;

const f = (v: number) => v.toFixed(8);

/** the prep pass reads the contact pass through this: five bilinear taps, each only as far as the distance agrees */
export const CONTACT_BLUR_GLSL = /* glsl */ `
#ifdef CONTACT
uniform vec2 uCOn;
uniform sampler2D tCPack;
float thContactBlur(ivec2 c, float z) {
  vec2 px = 1.0 / vec2(textureSize(tCPack, 0));
  vec2 uv = (vec2(c) + 0.5) * px;
  vec2 s = texture2D(tCPack, uv).rg;
  float iz = 16.0 / z;
  float acc = s.r * 2.0, wt = 2.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i < 2 ? -1.2 : 1.2, (i == 0 || i == 2) ? -1.2 : 1.2);
    s = texture2D(tCPack, uv + o * px).rg;
    float dz = (s.g - z) * iz;
    float w = 1.0 / (1.0 + dz * dz);
    acc += s.r * w;
    wt += w;
  }
  return acc / wt;
}
#endif
`;

const CONTACT_GLSL = /* glsl */ `
#ifdef CONTACT
uniform vec4 uCKey;
uniform vec4 uCFar;
uniform mat4 uCProj;
uniform mat4 uCV2W;
uniform mat4 uCW2V;
uniform mat4 uCV2S;
uniform highp sampler2DShadow tCShadow;
uniform sampler2D uLampMap;
uniform vec4 uLampXf;
float thCZ(float d) {
  return d >= 1.0 ? 6e4 : abs(uAOProjInv[3][2] / (uAOProjInv[2][3] * (d * 2.0 - 1.0) + uAOProjInv[3][3]));
}
float thContact(ivec2 c, float d, float zc, vec3 n) {
  if (d >= 1.0) return 0.0;
  vec2 sz = vec2(textureSize(tAODepth, 0));
  vec2 ndc = (vec2(c) + 0.5) / sz * 2.0 - 1.0;
  vec3 P = vec3(uAOProjInv[0][0] * ndc.x, uAOProjInv[1][1] * ndc.y, -1.0) * zc;
  vec3 L = uCKey.xyz;
  float k = uCKey.w;
  float reach = 1.0;
  if (k <= 0.0) {
    // night: towards the lamp this point mostly sees
    if (uCFar.z < 0.05) return 0.0;
    vec3 W = (uCV2W * vec4(P, 1.0)).xyz;
    vec2 uv = (W.xz - uLampXf.xy) * uLampXf.zw;
    if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;
    vec2 uvA = vec2(uv.x * ${f(LAMP_MAP.pw / LAMP_MAP.width)}, uv.y);
    vec4 a = textureLod(uLampMap, uvA, 0.0);
    float E = dot(a.rgb, vec3(0.3, 0.5, 0.2));
    E *= E;
    if (E < 0.004) return 0.0;
    vec4 b = textureLod(uLampMap, uvA + vec2(${f((LAMP_MAP.pw + LAMP_MAP.gap) / LAMP_MAP.width)}, 0.0), 0.0);
    vec2 D = b.rg * 2.0 - 1.0;
    float dk = min(length(D), 1.0);
    vec2 dir = D / max(dk, 1e-3);
    float v = a.a * 50.0 - 10.0 - W.y;
    if (v < 0.2) return 0.0;
    L = normalize(mat3(uCW2V) * vec3(dir.x * b.b * 20.0, v, dir.y * b.b * 20.0));
    k = uCFar.z * smoothstep(0.004, 0.05, E) * mix(0.45, 1.0, dk);
    reach = 1.7;
  }
  float nl = dot(n, L);
  if (nl < 0.03) return 0.0;
  vec3 V = -P / zc;
  float nv = max(abs(dot(n, normalize(V))), 0.04);
  // how much the depth of this surface changes over one half-res pixel: below that a hit says nothing
  float eps = 0.012 + 0.75 * uCFar.w * zc * sqrt(max(1.0 - nv * nv, 0.0)) / nv;
  float len = min(0.25 + 0.08 * zc, 1.2) * reach;
  float thick = 0.3 + 0.04 * zc + eps;
  float hit = 0.0;
  P += n * (0.01 + 0.001 * zc);
  for (int i = 1; i <= 6; i++) {
    float s = float(i) / 6.0;
    vec3 Q = P + L * (len * s * sqrt(s));
    float w = -Q.z;
    if (w <= 0.05) break;
    vec2 q = vec2(uCProj[0][0] * Q.x + uCProj[2][0] * Q.z, uCProj[1][1] * Q.y + uCProj[2][1] * Q.z) / w;
    ivec2 t = ivec2((q * 0.5 + 0.5) * sz);
    if (t.x < 0 || t.y < 0 || t.x >= int(sz.x) || t.y >= int(sz.y)) break;
    float dz = w - thCZ(texelFetch(tAODepth, t, 0).x);
    if (dz > eps && dz < thick) {
      hit = (1.0 - s) * (1.0 - s * 0.5) * 1.15;
      break;
    }
  }
  if (hit <= 0.0) return 0.0;
  if (uCKey.w > 0.0) {
    // only where the sun actually arrives
    vec4 S = uCV2S * vec4(P + n * 0.05, 1.0);
    if (S.x > 0.0 && S.y > 0.0 && S.x < 1.0 && S.y < 1.0 && S.z < 1.0) hit *= texture(tCShadow, vec3(S.xy, S.z - 0.0006));
  }
  return hit * k * smoothstep(0.03, 0.2, nl) * (1.0 - smoothstep(uCFar.x, uCFar.y, zc));
}
#endif
`;

export const CONTACT_FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform highp sampler2D tAODepth;
uniform mat4 uAOProjInv;
varying vec2 vUv;
${CONTACT_GLSL}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float d = texelFetch(tAODepth, c, 0).x;
  float z = thCZ(d);
  float cs = z < uCFar.y ? thContact(c, d, z, texelFetch(tAO, c, 0).gba * 2.0 - 1.0) : 0.0;
  gl_FragColor = vec4(cs, min(z, 6e4), 0.0, 1.0);
}
`;

const _L = new THREE.Vector3();
const _T = new THREE.Vector3();
let _sun: THREE.DirectionalLight | null = null;

/** per frame, right before the prep pass */
export function updateContact(u: ContactUniforms, tint: THREE.Vector3, ctx: CityContext, resY: number): void {
  const cam = ctx.camera;
  _sun ??= ctx.scene.getObjectByName('sun') as THREE.DirectionalLight | null;
  const zoom = nearLens.zoom;
  const key = (ctx.services.sky as { keyShare?: number } | undefined)?.keyShare ?? 0;
  const gain = Math.min(1, ctx.uniforms.uLampGain.value);
  u.uCProj.value.copy(cam.projectionMatrix);
  u.uCV2W.value.copy(cam.matrixWorld);
  u.uCW2V.value.copy(cam.matrixWorldInverse);
  const h = u.uCFar.value;
  h.x = 11 * zoom;
  h.y = 20 * zoom;
  u.uCOn.value.x = cam.position.y > h.y + 12 ? 0 : h.y;
  h.z = key > 0.02 ? 0 : gain;
  // half-res pixel at 1 m
  h.w = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5))) / resY;
  if (_sun && key > 0.02) {
    _L.setFromMatrixPosition(_sun.matrixWorld);
    _T.setFromMatrixPosition(_sun.target.matrixWorld);
    _L.sub(_T).normalize().transformDirection(cam.matrixWorldInverse);
    u.uCKey.value.set(_L.x, _L.y, _L.z, key);
    u.tCShadow.value = _sun.shadow.map?.depthTexture ?? null;
    u.uCV2S.value.multiplyMatrices(_sun.shadow.matrix, cam.matrixWorld);
    tint.set(0.3, 0.33, 0.42);
  } else {
    u.uCKey.value.w = 0;
    tint.set(0.42, 0.4, 0.42);
  }
  u.uLampMap.value = ctx.uniforms.uLampMap.value;
  u.uLampXf.value.copy(ctx.uniforms.uLampXf.value);
}
