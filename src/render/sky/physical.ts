// Physical clear sky (world mode): single scattering through a spherical atmosphere — Rayleigh,
// Mie (aerosol = the same haze as the fog), ozone absorption — with the earth's shadow (twilight:
// blue hour, Belt of Venus, glowing horizon after sunset) and a small isotropic multiple-scattering term.
//
// * GPU: a 64×64 HalfFloat sky-view LUT (azimuth relative to the sun × elevation, non-linear in
//   elevation so the horizon gets most texels), re-rendered only when the sun / haze / camera height
//   changed; the dome (and the environment bake) sample it.
// * CPU: the identical integral for a handful of directions (horizon ring for the fog colours, zenith,
//   the sun's own colour after the atmosphere) — no GPU read-back, same numbers by construction.
//
// Radiance is per unit solar irradiance; `skyScale` maps it into scene units once (calibrated so the
// noon horizon matches the authored key), so twilight darkens naturally and exposure does the rest.

import * as THREE from 'three';
import { FS_VERT, FullscreenPass } from '../postfx/fullscreen';

const RG = 6360e3;
const RT = 6460e3;
const HR = 8000;
const HM = 1200;
const BR = [5.802e-6, 13.558e-6, 33.1e-6];
const BO = [0.65e-6, 1.881e-6, 0.085e-6];
/** view / light samples (GPU and CPU identical) */
const NV = 24;
const NL = 8;

export interface PhysSkyParams {
  /** sin and cos of the sun's elevation */
  sunSin: number;
  sunCos: number;
  /** camera height above the ground (m) */
  camH: number;
  /** aerosol extinction at the ground (1/m) — the fog's haze */
  haze: number;
  /** Mie phase asymmetry */
  g: number;
  /** multiple scattering: strength of the re-scattered (blue) skylight term */
  ms: number;
}

const GLSL = /* glsl */ `

uniform vec2 uSun;      // (cos, sin) of the sun elevation; the sun lies in the x-y plane (+x)
uniform float uCamH;
uniform float uHaze;
uniform float uG;
uniform float uMs;
varying vec2 vUv;
// multiple scattering ≈ re-scattered SKYLIGHT (blue), not more sunlight: what keeps the zenith blue at a
// low sun (single scattering of reddened sunlight alone turns it grey)
vec3 msLight(float sunSin) {
  return vec3(0.55, 0.72, 1.0) * uMs * clamp(sunSin * 3.0 + 0.12, 0.0, 1.0);
}
const float RG = ${RG.toFixed(1)};
const float RT = ${RT.toFixed(1)};
const float HR = ${HR.toFixed(1)};
const float HM = ${HM.toFixed(1)};
const vec3 BR = vec3(${BR.map((v) => v.toExponential(4)).join(', ')});
const vec3 BO = vec3(${BO.map((v) => v.toExponential(4)).join(', ')});
const float PI = 3.14159265;

// altitude after travelling s from a point at altitude h (r0 = RG + h) along a ray with cosine c to
// the local vertical — written so no large numbers cancel
float alt(float h, float r0, float c, float s) {
  float q = r0 * r0 + 2.0 * s * r0 * c + s * s;
  return (h * (2.0 * RG + h) + 2.0 * s * r0 * c + s * s) / (sqrt(q) + RG);
}
vec3 extAt(float h) {
  float rO = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
  return BR * exp(-h / HR) + vec3(uHaze * exp(-h / HM)) + BO * rO;
}
// transmittance toward the sun from altitude h where the sun has cosine c to the local vertical
vec3 sunT(float h, float c) {
  float r0 = RG + h;
  // earth shadow (soft): lowest altitude along the sun ray
  float vis = 1.0;
  if (c < 0.0) {
    float s2 = max(1.0 - c * c, 0.0);
    float hmin = (h * (2.0 * RG + h) - r0 * r0 * c * c) / (r0 * sqrt(s2) + RG);
    vis = smoothstep(-2500.0, 2500.0, hmin);
    if (vis <= 0.0) return vec3(0.0);
  }
  float b = r0 * c;
  float len = -b + sqrt(max(b * b - (r0 - RT) * (r0 + RT), 0.0));
  vec3 od = vec3(0.0);
  float ds = len / float(${NL});
  for (int j = 0; j < ${NL}; j++) {
    float s = (float(j) + 0.5) * ds;
    od += extAt(max(alt(h, r0, c, s), 0.0)) * ds;
  }
  return exp(-od) * vis;
}
vec3 skyRadiance(vec3 V) {
  vec3 L = vec3(uSun.x, uSun.y, 0.0);
  float h0 = max(uCamH, 1.0);
  float r0 = RG + h0;
  float b = r0 * V.y;
  float dg = b * b - h0 * (2.0 * RG + h0);
  float tMax;
  if (V.y < 0.0 && dg >= 0.0) tMax = -b - sqrt(dg);
  else tMax = -b + sqrt(max(b * b - (r0 - RT) * (r0 + RT), 0.0));
  float mu = dot(V, L);
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = uG;
  float pM = 3.0 / (8.0 * PI) * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(max(1.0 + g * g - 2.0 * g * mu, 1e-4), 1.5));
  vec3 sum = vec3(0.0);
  vec3 od = vec3(0.0);
  vec3 ms = msLight(L.y);
  float invN2 = 1.0 / float(${NV * NV});
  for (int i = 0; i < ${NV}; i++) {
    float fi = float(i);
    float t = tMax * (fi + 0.5) * (fi + 0.5) * invN2;
    float dt = tMax * (2.0 * fi + 1.0) * invN2;
    float h = max(alt(h0, r0, V.y, t), 0.0);
    float rR = exp(-h / HR), rM = exp(-h / HM);
    vec3 e = extAt(h);
    vec3 Tv = exp(-(od + e * dt * 0.5));
    od += e * dt;
    // sun cosine at the sample (its local vertical tilts with the earth's curvature)
    float cs = (t * mu + r0 * L.y) / (RG + h);
    vec3 Ts = sunT(h, cs);
    vec3 sR = BR * rR;
    float sM = uHaze * 0.9 * rM;
    sum += Tv * (Ts * (sR * pR + sM * pM) + (sR + sM) * ms / (4.0 * PI)) * dt;
  }
  return sum;
}
`;

const LUT_FRAG = /* glsl */ `
${GLSL}
void main() {
  // u: azimuth from the sun 0..PI; v: elevation, non-linear (dense at the horizon)
  float az = vUv.x * PI;
  float v = vUv.y * 2.0 - 1.0;
  float el = sign(v) * v * v * 0.5 * PI;
  vec3 V = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  gl_FragColor = vec4(skyRadiance(V), 1.0);
}
`;

/** GLSL for samplers of the LUT: `vec3 thSkyLUT(sampler2D lut, vec3 dir, vec3 sunDir)` (unscaled radiance) */
export const SKY_LUT_GLSL = /* glsl */ `
vec3 thSkyLUT(sampler2D lut, vec3 d, vec3 s) {
  float hs = dot(d.xz, d.xz) * dot(s.xz, s.xz);
  float c = hs > 1e-12 ? clamp(dot(d.xz, s.xz) * inversesqrt(hs), -1.0, 1.0) : 1.0;
  float u = acos(c) / 3.14159265;
  float el = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963);
  // keep inside the texel centres (no wrap across the horizon / poles)
  vec2 sz = vec2(textureSize(lut, 0));
  vec2 uv = clamp(vec2(u, v), 0.5 / sz, 1.0 - 0.5 / sz);
  return texture2D(lut, uv).rgb;
}
`;

export class SkyLUT {
  readonly target: THREE.WebGLRenderTarget;
  private pass: FullscreenPass;
  private last = new Float32Array(6);
  renders = 0;

  constructor(size = 64) {
    this.target = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.target.texture.name = 'Sky.LUT';
    this.pass = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'SkyLUT',
        uniforms: {
          uSun: { value: new THREE.Vector2(1, 0) },
          uCamH: { value: 10 },
          uHaze: { value: 1e-4 },
          uG: { value: 0.75 },
          uMs: { value: 0.3 },
        },
        vertexShader: FS_VERT,
        fragmentShader: LUT_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
    this.last[0] = NaN;
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  /** re-render if the inputs changed noticeably (or `force`); returns true if rendered */
  update(renderer: THREE.WebGLRenderer, p: PhysSkyParams, force = false): boolean {
    const l = this.last;
    const changed = force || !(Math.abs(l[0] - p.sunSin) < 4e-4 && Math.abs(l[1] - p.camH) < Math.max(4, l[1] * 0.05) && Math.abs(l[2] - p.haze) < l[2] * 0.01 + 1e-8 && l[3] === p.g && l[4] === p.ms);
    if (!changed) return false;
    l[0] = p.sunSin;
    l[1] = p.camH;
    l[2] = p.haze;
    l[3] = p.g;
    l[4] = p.ms;
    const u = this.pass.material.uniforms;
    (u.uSun.value as THREE.Vector2).set(p.sunCos, p.sunSin);
    u.uCamH.value = p.camH;
    u.uHaze.value = p.haze;
    u.uG.value = p.g;
    u.uMs.value = p.ms;
    const prev = renderer.getRenderTarget();
    this.pass.render(renderer, this.target);
    renderer.setRenderTarget(prev);
    this.renders++;
    return true;
  }

  dispose(): void {
    this.target.dispose();
    this.pass.dispose();
  }
}

// ───────────────────────────────────────────── CPU twin ──

function extAt(h: number, haze: number, out: number[]): void {
  const rR = Math.exp(-h / HR),
    rM = Math.exp(-h / HM),
    rO = Math.max(0, 1 - Math.abs(h - 25000) / 15000);
  out[0] = BR[0] * rR + haze * rM + BO[0] * rO;
  out[1] = BR[1] * rR + haze * rM + BO[1] * rO;
  out[2] = BR[2] * rR + haze * rM + BO[2] * rO;
}

function alt(h: number, r0: number, c: number, s: number): number {
  const q = r0 * r0 + 2 * s * r0 * c + s * s;
  return (h * (2 * RG + h) + 2 * s * r0 * c + s * s) / (Math.sqrt(q) + RG);
}

const _e = [0, 0, 0];
const _od = [0, 0, 0];
const _ts = [0, 0, 0];
const _sum = [0, 0, 0];

/** sun transmittance from altitude h, sun cosine c to the local vertical (CPU twin of sunT) */
export function sunTransmittance(h: number, c: number, haze: number, out: number[]): number[] {
  const r0 = RG + h;
  let vis = 1;
  if (c < 0) {
    const s2 = Math.max(1 - c * c, 0);
    const hmin = (h * (2 * RG + h) - r0 * r0 * c * c) / (r0 * Math.sqrt(s2) + RG);
    const t = Math.min(1, Math.max(0, (hmin + 2500) / 5000));
    vis = t * t * (3 - 2 * t);
    if (vis <= 0) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
  }
  const b = r0 * c;
  const len = -b + Math.sqrt(Math.max(b * b - (r0 - RT) * (r0 + RT), 0));
  const ds = len / NL;
  let o0 = 0,
    o1 = 0,
    o2 = 0;
  for (let j = 0; j < NL; j++) {
    extAt(Math.max(alt(h, r0, c, (j + 0.5) * ds), 0), haze, _e);
    o0 += _e[0] * ds;
    o1 += _e[1] * ds;
    o2 += _e[2] * ds;
  }
  out[0] = Math.exp(-o0) * vis;
  out[1] = Math.exp(-o1) * vis;
  out[2] = Math.exp(-o2) * vis;
  return out;
}

/** unscaled sky radiance toward (vx, vy, vz) in the LUT frame (sun in the +x/y plane) — CPU twin */
export function skyRadiance(p: PhysSkyParams, vx: number, vy: number, vz: number, out: THREE.Color): THREE.Color {
  const h0 = Math.max(p.camH, 1);
  const r0 = RG + h0;
  const b = r0 * vy;
  const dg = b * b - h0 * (2 * RG + h0);
  const tMax = vy < 0 && dg >= 0 ? -b - Math.sqrt(dg) : -b + Math.sqrt(Math.max(b * b - (r0 - RT) * (r0 + RT), 0));
  const mu = vx * p.sunCos + vy * p.sunSin;
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g = p.g;
  const pM = ((3 / (8 * Math.PI)) * (1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(Math.max(1 + g * g - 2 * g * mu, 1e-4), 1.5));
  // multiple scattering: re-scattered (blue) skylight — CPU twin of msLight()
  const msK = (p.ms * Math.min(1, Math.max(0, p.sunSin * 3 + 0.12))) / (4 * Math.PI);
  const ms0 = 0.55 * msK,
    ms1 = 0.72 * msK,
    ms2 = 1.0 * msK;
  _sum[0] = _sum[1] = _sum[2] = 0;
  _od[0] = _od[1] = _od[2] = 0;
  const invN2 = 1 / (NV * NV);
  for (let i = 0; i < NV; i++) {
    const t = tMax * (i + 0.5) * (i + 0.5) * invN2;
    const dt = tMax * (2 * i + 1) * invN2;
    const h = Math.max(alt(h0, r0, vy, t), 0);
    const rR = Math.exp(-h / HR),
      rM = Math.exp(-h / HM);
    extAt(h, p.haze, _e);
    const tv0 = Math.exp(-(_od[0] + _e[0] * dt * 0.5)),
      tv1 = Math.exp(-(_od[1] + _e[1] * dt * 0.5)),
      tv2 = Math.exp(-(_od[2] + _e[2] * dt * 0.5));
    _od[0] += _e[0] * dt;
    _od[1] += _e[1] * dt;
    _od[2] += _e[2] * dt;
    const cs = (t * mu + r0 * p.sunSin) / (RG + h);
    sunTransmittance(h, cs, p.haze, _ts);
    const sM = p.haze * 0.9 * rM;
    _sum[0] += tv0 * (_ts[0] * (BR[0] * rR * pR + sM * pM) + (BR[0] * rR + sM) * ms0) * dt;
    _sum[1] += tv1 * (_ts[1] * (BR[1] * rR * pR + sM * pM) + (BR[1] * rR + sM) * ms1) * dt;
    _sum[2] += tv2 * (_ts[2] * (BR[2] * rR * pR + sM * pM) + (BR[2] * rR + sM) * ms2) * dt;
  }
  return out.setRGB(_sum[0], _sum[1], _sum[2]);
}
