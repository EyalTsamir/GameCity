// Ambient occlusion applied inside the final effect pass.
//
// N8AO still computes the half-resolution AO (depth downsample → AO → 2x denoise), but
// its own full-resolution "compositer" pass (depth/normal-aware upsampling + tint) and the
// full-resolution copy after it are skipped (postfx.ts stubs them out). Instead:
//   1. a tiny half-res "prep" pass packs (AO, view distance) into one RG half-float texture;
//   2. this effect, one more step of the merged final shader, upsamples it with a 2x2
//      depth-aware bilinear filter (4 fetches of that texture: bilinear weights x relative
//      depth agreement with the full-res pixel), so AO never bleeds across silhouettes.
// Then the N8AO look: pow(ao, intensity), fade with the fog, tinted multiply.
// Saves two full-screen HalfFloat passes and N8AO's 27-tap compositer. `?aoexact` keeps
// N8AO's compositer maths (3x3 gather with a full-res normal) in this effect for comparison.
// The tilt-shift prefilter applies the same AO (bilinear, AO_HALF_GLSL) so the blurred far
// field matches the sharp image.

import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';
import { FS_VERT, FullscreenPass } from './fullscreen';

/** Shared with the tilt-shift prefilter. */
export function aoUniforms() {
  return {
    /** N8AO's denoised half-res AO: r = AO, gba = view normal * 0.5 + 0.5 */
    tAO: new THREE.Uniform<THREE.Texture | null>(null),
    /** N8AO's half-res depth (raw depth-buffer values) */
    tAODepth: new THREE.Uniform<THREE.Texture | null>(null),
    /** prep output: r = AO, g = view distance (m) */
    tAOPack: new THREE.Uniform<THREE.Texture | null>(null),
    uAOOn: new THREE.Uniform(0),
    uAOIntensity: new THREE.Uniform(2.4),
    uAOFalloff: new THREE.Uniform(1),
    uAOTint: new THREE.Uniform(new THREE.Color(0, 0, 0)),
    /** fog near / far (planar view depth); far <= near disables the fade */
    uAOFog: new THREE.Uniform(new THREE.Vector2(0, 0)),
    uAOProjInv: new THREE.Uniform(new THREE.Matrix4()),
    /** full-resolution size in pixels (as N8AO's `resolution`) */
    uAORes: new THREE.Uniform(new THREE.Vector2(1, 1)),
  };
}
export type AOUniforms = ReturnType<typeof aoUniforms>;

/** GLSL: uniforms + `vec3 aoMulHalf(vec2 uv, float viewDepth)` — cheap bilinear version for half-res passes. */
export const AO_HALF_GLSL = /* glsl */ `
uniform sampler2D tAO;
uniform float uAOOn;
uniform float uAOIntensity;
uniform vec3 uAOTint;
uniform vec2 uAOFog;
vec3 aoMulHalf(vec2 uv, float viewDepth) {
  if (uAOOn < 0.5) return vec3(1.0);
  float a = pow(texture2D(tAO, uv).r, uAOIntensity);
  if (uAOFog.y > uAOFog.x) a = mix(a, 1.0, smoothstep(uAOFog.x, uAOFog.y, viewDepth));
  return mix(vec3(1.0), uAOTint, 1.0 - a);
}
`;

const VIEWPOS_GLSL = /* glsl */ `
vec3 aoViewPos(float depth, vec2 coord) {
  vec2 ndc = coord * 2. - 1.;
  float ndcZ = depth * 2.0 - 1.0;
  mat4 Q = uAOProjInv;
  vec3 view = vec3(Q[0][0] * ndc.x + Q[3][0], Q[1][1] * ndc.y + Q[3][1], Q[3][2]);
  float invW = 1. / (Q[2][3] * ndcZ + Q[3][3]);
  return view * invW;
}
`;

/** half-res: (AO, view distance); the background gets the largest half-float distance */
const PREP_FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform highp sampler2D tAODepth;
uniform mat4 uAOProjInv;
varying vec2 vUv;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float d = texelFetch(tAODepth, c, 0).x;
  float z = d >= 1.0 ? 6e4 : uAOProjInv[3][2] / (uAOProjInv[2][3] * (d * 2.0 - 1.0) + uAOProjInv[3][3]);
  gl_FragColor = vec4(texelFetch(tAO, c, 0).r, abs(z), 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform sampler2D tAOPack;
uniform highp sampler2D tAODepth;
uniform float uAOOn;
uniform float uAOIntensity;
uniform float uAOFalloff;
uniform vec3 uAOTint;
uniform vec2 uAOFog;
uniform mat4 uAOProjInv;
uniform vec2 uAORes;
${VIEWPOS_GLSL}

#ifdef AO_EXACT
vec3 aoNormal(vec3 ce, vec2 uv) {
  ivec2 p = ivec2(uv * uAORes);
  float c0 = texelFetch(depthBuffer, p, 0).x;
  float l2 = texelFetch(depthBuffer, p - ivec2(2, 0), 0).x;
  float l1 = texelFetch(depthBuffer, p - ivec2(1, 0), 0).x;
  float r1 = texelFetch(depthBuffer, p + ivec2(1, 0), 0).x;
  float r2 = texelFetch(depthBuffer, p + ivec2(2, 0), 0).x;
  float b2 = texelFetch(depthBuffer, p - ivec2(0, 2), 0).x;
  float b1 = texelFetch(depthBuffer, p - ivec2(0, 1), 0).x;
  float t1 = texelFetch(depthBuffer, p + ivec2(0, 1), 0).x;
  float t2 = texelFetch(depthBuffer, p + ivec2(0, 2), 0).x;
  float dl = abs((2.0 * l1 - l2) - c0);
  float dr = abs((2.0 * r1 - r2) - c0);
  float db = abs((2.0 * b1 - b2) - c0);
  float dt = abs((2.0 * t1 - t2) - c0);
  vec3 dpdx = (dl < dr) ? ce - aoViewPos(l1, uv - vec2(1.0 / uAORes.x, 0.0)) : -ce + aoViewPos(r1, uv + vec2(1.0 / uAORes.x, 0.0));
  vec3 dpdy = (db < dt) ? ce - aoViewPos(b1, uv - vec2(0.0, 1.0 / uAORes.y)) : -ce + aoViewPos(t1, uv + vec2(0.0, 1.0 / uAORes.y));
  return normalize(cross(dpdx, dpdy));
}
#endif

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = inputColor;
  if (uAOOn < 0.5 || depth == 1.0) return;
  vec3 pos = aoViewPos(depth, uv);
#ifdef AO_EXACT
  // N8AO's compositer verbatim: full-res normal + 3x3 gather
  vec3 n = aoNormal(pos, uv);
  vec2 hres = uAORes * 0.5;
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (float x = -1.0; x <= 1.0; x++) {
    for (float y = -1.0; y <= 1.0; y++) {
      ivec2 p = ivec2(uv * hres + vec2(x, y));
      vec2 pUv = vec2(p) / hres;
      float sd = texelFetch(tAODepth, p, 0).x;
      vec4 s = texelFetch(tAO, p, 0);
      vec3 sn = s.gba * 2.0 - 1.0;
      vec3 sp = aoViewPos(sd, pUv);
      float w = exp(-abs(dot(sp - pos, n)) / uAOFalloff) * max(dot(n, sn), 0.0);
      wsum += w;
      acc += s * w;
    }
  }
  float a = wsum == 0.0 ? texture2D(tAO, uv).r : acc.r / wsum;
#else
  // 2x2 depth-aware bilinear: samples whose distance differs from this pixel's by more than
  // a few percent (another surface across a silhouette) drop out
  vec2 hsz = vec2(textureSize(tAOPack, 0));
  vec2 hp = uv * hsz - 0.5;
  vec2 f = fract(hp);
  ivec2 i0 = ivec2(floor(hp));
  ivec2 mx = ivec2(hsz) - 1;
  float zc = -pos.z;
  float iz = 40.0 / zc; // 1 / (2.5 % of the distance)
  vec2 s00 = texelFetch(tAOPack, clamp(i0, ivec2(0), mx), 0).rg;
  vec2 s10 = texelFetch(tAOPack, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).rg;
  vec2 s01 = texelFetch(tAOPack, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).rg;
  vec2 s11 = texelFetch(tAOPack, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).rg;
  vec4 dz = vec4(s00.y, s10.y, s01.y, s11.y) - zc;
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) / (1.0 + dz * dz * (iz * iz)) + 1e-5;
  float a = dot(w, vec4(s00.x, s10.x, s01.x, s11.x)) / dot(w, vec4(1.0));
#endif
  a = pow(a, uAOIntensity);
  if (uAOFog.y > uAOFog.x) a = mix(a, 1.0, smoothstep(uAOFog.x, uAOFog.y, -pos.z));
  outputColor = vec4(mix(inputColor.rgb, uAOTint * inputColor.rgb, 1.0 - a), inputColor.a);
}
`;

export class AOApplyEffect extends Effect {
  /** called at the start of the effect pass (after the AO pass has run): refresh the shared uniforms */
  onUpdate: (() => void) | null = null;
  private prep: FullscreenPass;
  private pack: THREE.WebGLRenderTarget;
  private exact: boolean;
  private u: AOUniforms;

  /** @param exact use N8AO's original 3x3 compositer maths (debug / comparison) */
  constructor(u: AOUniforms, exact = false) {
    super('AOApplyEffect', FRAG, {
      attributes: EffectAttribute.DEPTH,
      defines: exact ? new Map([['AO_EXACT', '1']]) : new Map<string, string>(),
      uniforms: new Map<string, THREE.Uniform>(Object.entries(u) as [string, THREE.Uniform][]),
    });
    this.u = u;
    this.exact = exact;
    this.pack = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.pack.texture.name = 'AO.Pack';
    u.tAOPack.value = this.pack.texture;
    this.prep = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'AOPrep',
        uniforms: { tAO: u.tAO, tAODepth: u.tAODepth, uAOProjInv: u.uAOProjInv },
        vertexShader: FS_VERT,
        fragmentShader: PREP_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
  }

  override update(renderer: THREE.WebGLRenderer): void {
    this.onUpdate?.();
    const ao = this.u.tAO.value;
    if (this.exact || this.u.uAOOn.value < 0.5 || !ao) return;
    const img = ao.image as { width: number; height: number };
    if (this.pack.width !== img.width || this.pack.height !== img.height) this.pack.setSize(img.width, img.height);
    this.prep.render(renderer, this.pack);
  }

  override dispose(): void {
    super.dispose();
    this.pack.dispose();
    this.prep.dispose();
  }
}
