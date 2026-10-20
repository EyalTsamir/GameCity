// Aerial perspective for the whole world (world mode; `?diorama` keeps three's linear fog).
//
// Every material that includes three's fog chunks (MeshStandard/Lambert/Basic/Phong/Physical,
// Sprite/Points/Line, and custom ShaderMaterials with `fog: true` + the four chunks) gets:
//
//   * haze  — aerosol (Mie, grey) + Rayleigh (blue) extinction with exponential height falloff,
//             integrated analytically along the camera ray (Quilez / UE height fog);
//   * in-scatter colour = the sky's own horizon colour in that azimuth (a ring of colours relative to
//             the sun, the same function the sky dome shows at and below the horizon → distant land
//             melts into the sky without a seam), plus a Mie sun lobe (warm glow toward a low sun);
//   * desaturation with distance (aerial perspective lowers saturation before it shifts hue);
//   * a ground mist layer (scale height of metres above the water level) at dawn / dusk, in patches
//             drifting with the wind.
//
// Plumbing: the sky module calls installAtmosphere() before any material compiles. The four fog
// chunks are replaced, and a uniform `thAtmo` (vec4[ATMO_N]) is added to every ShaderLib entry with
// fog uniforms and to UniformsLib.fog. Its value is ONE shared Float32Array: three's cloneUniforms
// keeps typed arrays by reference (they are neither three objects nor plain Arrays), so every
// material reads the same live data without any per-material bookkeeping.
//
// Shaders with hand-written legacy fog (`smoothstep(fogNear, fogFar, vFogDepth)`, `mix(c, fogColor, f)`,
// mostly additive glows of other areas) keep working unedited: fogNear / fogFar / fogColor / vFogDepth
// become macros that evaluate the new atmosphere per pixel (smoothstep(0, 1, invSmooth(1 − T)) = 1 − T).
// Additive materials that use the standard chunk can `#define TH_FOG_ADDITIVE` (light is only
// attenuated, never brightened by haze).
//
// The reflection pass of the water renders with a camera mirrored below the water plane: heights are
// folded about that plane, so the integral equals the real camera → water → object path.

import * as THREE from 'three';

/** number of vec4 slots in the shared atmosphere uniform */
export const ATMO_N = 12;

/**
 * Layout of `thAtmo` (vec4[ATMO_N]):
 *  [0] sun direction (unit, towards the sun).xyz, sun-lobe exponent
 *  [1] sun-lobe colour (in-scattered sunlight toward the sun).rgb, mist forward-scatter weight
 *  [2] Rayleigh-like (blue air) extinction at the reference height (rgb, 1/m), 1 / its scale height (1/m)
 *  [3] horizon ring a0.rgb (Fourier series in the azimuth relative to the sun), haze reference height (m)
 *  [4] ring a1.rgb, fold plane = water level (m)
 *  [5] ring a2.rgb, 1 / mist scale height (1/m)
 *  [6] ring a3.rgb, distance desaturation (0..1)
 *  [7] in-scattered colour of the blue air (cool, any direction).rgb, unused
 *  [8] mist colour.rgb, mist extinction at the water level (1/m)
 *  [9] mist drift offset x, z (m), patch frequency (1/m), patchiness (0..1)
 * [10] haze start distance (m), overall in-scatter gain, tight sun-lobe weight, tight sun-lobe exponent
 * [11] aerosol (grey haze) extinction at the reference height (1/m), 1 / aerosol scale height, 0, 0
 */
export const atmoData = new Float32Array(ATMO_N * 4);

/** GLSL: atmosphere functions (needs `uniform vec4 thAtmo[ATMO_N]` declared and `cameraPosition`). */
export const ATMO_FUNCS = /* glsl */ `
// optical depth of an exponential layer along a straight segment of length t whose ends are at
// heights ha, hb ABOVE the layer base (density = 1 at the base, scale 1/k); overflow-safe
float atmOD1(float ha, float hb, float t, float k) {
  float da = ha * k, db = hb * k;
  float d = db - da;
  return abs(d) > 1e-4 ? t * (exp(-da) - exp(-db)) / d : t * exp(-da) * (1.0 - 0.5 * d);
}
// same along camera (height ya) → point (yb); heights folded about the water plane (reflection pass)
float atmOD(float ya, float yb, float t, float base, float k) {
  float yf = thAtmo[4].w;
  float o = base - yf;
  float a = ya - yf, b = yb - yf;
  if (a * b < 0.0) {
    float s = a / (a - b);
    return atmOD1(abs(a) - o, -o, t * s, k) + atmOD1(-o, abs(b) - o, t * (1.0 - s), k);
  }
  return atmOD1(abs(a) - o, abs(b) - o, t, k);
}
// glow of the sunlit haze around the sun (broad + tight lobe); the dome adds the same above the horizon
vec3 thSunLobe(vec3 V) {
  float mu = max(dot(V, thAtmo[0].xyz), 0.0);
  return thAtmo[1].rgb * (pow(mu, max(thAtmo[0].w, 1.0)) + thAtmo[10].z * pow(mu, max(thAtmo[10].w, 1.0)));
}
// colour of the haze at infinity in direction V (= the sky dome at / below the horizon)
vec3 thHazeColor(vec3 V) {
  vec3 L = thAtmo[0].xyz;
  float hs = dot(V.xz, V.xz) * dot(L.xz, L.xz);
  float c = hs > 1e-10 ? dot(V.xz, L.xz) * inversesqrt(hs) : 0.0;
  float c2 = 2.0 * c * c - 1.0;
  float c3 = (2.0 * c2 - 1.0) * c;
  vec3 ring = max(thAtmo[3].rgb + thAtmo[4].rgb * c + thAtmo[5].rgb * c2 + thAtmo[6].rgb * c3, vec3(0.0));
  return ring + thSunLobe(V);
}
float atmHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float atmNoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(atmHash12(i), atmHash12(i + vec2(1.0, 0.0)), f.x), mix(atmHash12(i + vec2(0.0, 1.0)), atmHash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// transmittances along camera → camera + ray: blue air (Rayleigh-like, per channel, ~8 km scale height:
// far ridges turn blue) → TR; aerosol (grey, ~1 km: valleys haze, peaks clear) → TM; ground mist → Tmist
void thAtmoTs(vec3 ray, out vec3 TR, out float TM, out float Tmist) {
  float t = length(ray);
  float yc = cameraPosition.y, yp = yc + ray.y;
  float ts = max(t - thAtmo[10].x, 0.0) / max(t, 1e-3);
  TR = exp(-thAtmo[2].rgb * (atmOD(yc, yp, t, thAtmo[3].w, thAtmo[2].w) * ts));
  TM = exp(-thAtmo[11].x * (atmOD(yc, yp, t, thAtmo[3].w, thAtmo[11].y) * ts));
  float Tm = 1.0;
  if (thAtmo[8].w > 0.0) {
    vec2 q = (cameraPosition.xz + ray.xz + thAtmo[9].xy) * thAtmo[9].z;
    float n = atmNoise2(q) * 0.65 + atmNoise2(q * 2.7 + 5.3) * 0.35;
    float patchy = mix(1.0, smoothstep(0.25, 0.75, n) * 1.8, thAtmo[9].w);
    Tm = exp(-thAtmo[8].w * patchy * atmOD(yc, yp, t, thAtmo[4].w, thAtmo[5].w));
  }
  Tmist = Tm;
}
// combined transmittance (rgb) and mist (a) — for legacy / additive paths
vec4 thAtmoT(vec3 ray) {
  vec3 TR;
  float TM, Tmist;
  thAtmoTs(ray, TR, TM, Tmist);
  return vec4(TR * TM, Tmist);
}
// apply the atmosphere to a lit colour seen along ray (world space, camera → point). Each medium has its
// own in-scattered light: the blue air is cool in every direction (thAtmo[7]); the aerosol scatters
// mostly FORWARD — golden toward a low sun (ring + sun lobe), dim and cool away from it.
vec3 thAtmoApply(vec3 col, vec3 ray) {
  vec3 TR;
  float TM, Tmist;
  thAtmoTs(ray, TR, TM, Tmist);
  vec3 T = TR * TM;
  float Ta = dot(T, vec3(0.2126, 0.7152, 0.0722));
  vec3 V = ray * inversesqrt(max(dot(ray, ray), 1e-8));
  // aerial perspective takes saturation before it takes value
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(l), thAtmo[6].w * (1.0 - Ta));
  float g = thAtmo[10].y;
  // blue air nearer the object, aerosol (low, the valley haze) layered over it
  col = (col * TR + thAtmo[7].rgb * g * (1.0 - TR)) * TM + thHazeColor(V) * g * (1.0 - TM);
  if (Tmist < 1.0) {
    float mu = max(dot(V, thAtmo[0].xyz), 0.0);
    vec3 mc = thAtmo[8].rgb + thAtmo[1].rgb * thAtmo[1].w * mu * mu * mu * mu;
    col = mix(mc, col, Tmist);
  }
  return col;
}
// light-only attenuation (additive emitters): never brightened by the haze
vec3 thAtmoAttenuate(vec3 col, vec3 ray) {
  vec4 Tt = thAtmoT(ray);
  return col * Tt.rgb * Tt.a;
}
`;

const PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogView;
#endif
`;

const VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogView = mvPosition.xyz;
#endif
`;

const PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec4 thAtmo[${ATMO_N}];
  varying vec3 vFogView;
  ${ATMO_FUNCS}
  vec3 thFogRay() { return vFogView * mat3(viewMatrix); }
  // legacy hand-written fog (smoothstep(fogNear, fogFar, vFogDepth) / mix(c, fogColor, f)) → this atmosphere
  float thLegacyFogCoord() {
    vec4 Tt = thAtmoT(thFogRay());
    float y = clamp(1.0 - dot(Tt.rgb, vec3(0.2126, 0.7152, 0.0722)) * Tt.a, 0.0, 1.0);
    return 0.5 - sin(asin(1.0 - 2.0 * y) / 3.0); // inverse smoothstep
  }
  vec3 thLegacyFogColor() {
    vec3 r = thFogRay();
    return thHazeColor(r * inversesqrt(max(dot(r, r), 1e-8))) * thAtmo[10].y;
  }
  #define fogNear 0.0
  #define fogFar 1.0
  #define fogDensity 0.0
  #define fogColor thLegacyFogColor()
  #define vFogDepth thLegacyFogCoord()
#endif
`;

const FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef TH_FOG_ADDITIVE
    gl_FragColor.rgb = thAtmoAttenuate(gl_FragColor.rgb, thFogRay());
  #else
    gl_FragColor.rgb = thAtmoApply(gl_FragColor.rgb, thFogRay());
  #endif
#endif
`;

let installed = false;

/** true once the world atmosphere replaced three's fog chunks */
export function atmosphereInstalled(): boolean {
  return installed;
}

/**
 * Replace three's fog chunks and register the shared uniform (call before ANY material compiles —
 * the sky module does it first thing). Idempotent.
 */
export function installAtmosphere(): void {
  if (installed) return;
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  chunks.fog_pars_vertex = PARS_VERTEX;
  chunks.fog_vertex = VERTEX;
  chunks.fog_pars_fragment = PARS_FRAGMENT;
  chunks.fog_fragment = FRAGMENT;
  const uniform = () => ({ value: atmoData });
  (THREE.UniformsLib.fog as Record<string, { value: unknown }>).thAtmo = uniform();
  const libs = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, { value: unknown }> }>;
  for (const key of Object.keys(libs)) {
    const u = libs[key]?.uniforms;
    if (u && 'fogColor' in u) u.thAtmo = uniform();
  }
  installed = true;
}

// ───────────────────────────────────────────── CPU side ──

/** Parameters the sky module sets every frame (linear colours, metres). */
export interface AtmosphereParams {
  sunDir: THREE.Vector3;
  /** sun-lobe exponent (8 = broad glow … 32 = tight) */
  lobeExp: number;
  lobeColor: THREE.Color;
  /** aerosol (grey) extinction at the reference height (1/m) */
  haze: number;
  /** blue-air (Rayleigh-like) extinction per channel (1/m) */
  rayleigh: THREE.Vector3;
  /** aerosol scale height (m) */
  hazeScaleHeight: number;
  /** blue-air scale height (m) */
  rayleighScaleHeight: number;
  refY: number;
  waterY: number;
  /** horizon ring Fourier coefficients a0..a3 (colour = a0 + a1 cosφ + a2 cos2φ + a3 cos3φ) */
  ring: [THREE.Color, THREE.Color, THREE.Color, THREE.Color];
  /** in-scattered colour of the blue air (cool) */
  airColor: THREE.Color;
  desat: number;
  mistColor: THREE.Color;
  /** mist extinction at the water level (1/m); 0 = no mist */
  mist: number;
  mistScaleHeight: number;
  mistForward: number;
  mistDrift: THREE.Vector2;
  mistFreq: number;
  mistPatchiness: number;
  startDist: number;
  gain: number;
  /** tight sun lobe (aureole) weight relative to the broad one, and its exponent */
  lobe2: number;
  lobe2Exp: number;
}

export function createAtmosphereParams(): AtmosphereParams {
  return {
    sunDir: new THREE.Vector3(0, 1, 0),
    lobeExp: 12,
    lobeColor: new THREE.Color(0, 0, 0),
    haze: 5e-5,
    rayleigh: new THREE.Vector3(5.8e-6, 13.5e-6, 33.1e-6),
    hazeScaleHeight: 1000,
    rayleighScaleHeight: 8000,
    refY: 0,
    waterY: -1.6,
    ring: [new THREE.Color(0.7, 0.8, 0.9), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)],
    airColor: new THREE.Color(0.45, 0.6, 0.9),
    desat: 0.35,
    mistColor: new THREE.Color(0.8, 0.8, 0.8),
    mist: 0,
    mistScaleHeight: 10,
    mistForward: 0.6,
    mistDrift: new THREE.Vector2(0, 0),
    mistFreq: 1 / 90,
    mistPatchiness: 0.6,
    startDist: 0,
    gain: 1,
    lobe2: 0,
    lobe2Exp: 64,
  };
}

/** Pack the parameters into the shared uniform array. */
export function writeAtmosphere(p: AtmosphereParams): void {
  const d = atmoData;
  const set = (i: number, x: number, y: number, z: number, w: number) => {
    d[i * 4] = x;
    d[i * 4 + 1] = y;
    d[i * 4 + 2] = z;
    d[i * 4 + 3] = w;
  };
  set(0, p.sunDir.x, p.sunDir.y, p.sunDir.z, p.lobeExp);
  set(1, p.lobeColor.r, p.lobeColor.g, p.lobeColor.b, p.mistForward);
  set(2, p.rayleigh.x, p.rayleigh.y, p.rayleigh.z, 1 / Math.max(1, p.rayleighScaleHeight));
  set(3, p.ring[0].r, p.ring[0].g, p.ring[0].b, p.refY);
  set(4, p.ring[1].r, p.ring[1].g, p.ring[1].b, p.waterY);
  set(5, p.ring[2].r, p.ring[2].g, p.ring[2].b, 1 / Math.max(0.5, p.mistScaleHeight));
  set(6, p.ring[3].r, p.ring[3].g, p.ring[3].b, p.desat);
  set(7, p.airColor.r, p.airColor.g, p.airColor.b, 0);
  set(8, p.mistColor.r, p.mistColor.g, p.mistColor.b, p.mist);
  set(9, p.mistDrift.x, p.mistDrift.y, p.mistFreq, p.mistPatchiness);
  set(10, p.startDist, p.gain, p.lobe2, p.lobe2Exp);
  set(11, p.haze, 1 / Math.max(1, p.hazeScaleHeight), 0, 0);
}

/** optical depth factor of an exponential layer (CPU mirror of atmOD1; heights above the base) */
function od1(ha: number, hb: number, t: number, k: number): number {
  const da = ha * k,
    db = hb * k;
  const d = db - da;
  return Math.abs(d) > 1e-4 ? (t * (Math.exp(-da) - Math.exp(-db))) / d : t * Math.exp(-da) * (1 - 0.5 * d);
}

/**
 * Mean (luminance-weighted) haze transmittance between a camera at height `yc` and a point at
 * distance `t` and height `yp` (CPU mirror of the shader, no mist). Used by post effects that act
 * after the atmosphere (AO, cloud shadows) to fade with it.
 */
export function atmoTransmittance(p: AtmosphereParams, t: number, yc: number, yp: number): number {
  const o = p.refY - p.waterY;
  const ha = Math.abs(yc - p.waterY) - o,
    hb = Math.abs(yp - p.waterY) - o;
  const tt = Math.max(0, t - p.startDist);
  const odM = od1(ha, hb, tt, 1 / Math.max(1, p.hazeScaleHeight)) * p.haze;
  const odR = od1(ha, hb, tt, 1 / Math.max(1, p.rayleighScaleHeight));
  const r = Math.exp(-(odM + p.rayleigh.x * odR)),
    g = Math.exp(-(odM + p.rayleigh.y * odR)),
    b = Math.exp(-(odM + p.rayleigh.z * odR));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** distance at which the (horizontal, at height y) haze transmittance drops to `T` */
export function atmoDistanceFor(p: AtmosphereParams, T: number, y: number): number {
  const h = Math.abs(y - p.waterY) - (p.refY - p.waterY);
  const dens = p.haze * Math.exp(-h / Math.max(1, p.hazeScaleHeight)) + p.rayleigh.y * Math.exp(-h / Math.max(1, p.rayleighScaleHeight));
  return p.startDist - Math.log(Math.max(1e-4, Math.min(0.9999, T))) / Math.max(1e-9, dens);
}

const _fit = new Float32Array(3 * 4);

/**
 * Fit the horizon ring (a0..a3) to samples of a colour function of the azimuth φ ∈ [0, π] relative
 * to the sun (symmetric about the sun's vertical plane). `sample(phi, out)` writes a linear colour.
 */
export function fitRing(ring: [THREE.Color, THREE.Color, THREE.Color, THREE.Color], sample: (phi: number, out: THREE.Color) => void, n = 16): void {
  _fit.fill(0);
  for (let j = 0; j < n; j++) {
    const phi = ((j + 0.5) / n) * Math.PI;
    sample(phi, _sc);
    for (let k = 0; k < 4; k++) {
      const w = (k === 0 ? 1 : 2) * Math.cos(k * phi);
      _fit[k * 3] += _sc.r * w;
      _fit[k * 3 + 1] += _sc.g * w;
      _fit[k * 3 + 2] += _sc.b * w;
    }
  }
  for (let k = 0; k < 4; k++) ring[k].setRGB(_fit[k * 3] / n, _fit[k * 3 + 1] / n, _fit[k * 3 + 2] / n);
}

/** evaluate the fitted ring (CPU mirror of the shader's ring term) */
export function evalRing(ring: readonly THREE.Color[], phi: number, out: THREE.Color): THREE.Color {
  const c = Math.cos(phi),
    c2 = 2 * c * c - 1,
    c3 = (2 * c2 - 1) * c;
  out.setRGB(
    Math.max(0, ring[0].r + ring[1].r * c + ring[2].r * c2 + ring[3].r * c3),
    Math.max(0, ring[0].g + ring[1].g * c + ring[2].g * c2 + ring[3].g * c3),
    Math.max(0, ring[0].b + ring[1].b * c + ring[2].b * c2 + ring[3].b * c3),
  );
  return out;
}

const _sc = new THREE.Color();
