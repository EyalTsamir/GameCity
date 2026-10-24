// High cloud sky for world mode: a cumulus deck (~1.6–2.4 km) and a cirrus veil (~8 km), drawn in the
// sky dome by intersecting the view ray from the REAL camera position with spherical shells (correct
// parallax when the camera moves; clouds converge to the horizon with the earth's curvature), and the
// same density field rendered into the world-space cloud-shadow map → shadows match the clouds above.
//
// Shapes come from one procedural, tileable 128² noise texture built at boot (R: gradient fbm,
// G: inverted Worley "billows", B: fine value noise, A: second gradient fbm) — no assets. Lighting is a
// cheap 2.5D model: optical thickness from density, self-shadowing by marching the density toward the
// sun along the layer, Beer–powder for puffy cores, silver lining toward the sun, darker undersides
// overhead, sky-coloured ambient, aerial perspective with distance. Night: moonlight + city glow.

import * as THREE from 'three';

const N = 128;

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** tileable gradient noise (period p cells) at (x, y) in cell units */
function gradNoise(x: number, y: number, p: number, seed: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const fx = x - x0,
    fy = y - y0;
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const a = hash2(((ix % p) + p) % p, ((iy % p) + p) % p, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10),
    v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = g(x0, y0, fx, fy),
    b = g(x0 + 1, y0, fx - 1, fy),
    c = g(x0, y0 + 1, fx, fy - 1),
    d = g(x0 + 1, y0 + 1, fx - 1, fy - 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 0.7 + 0.5;
}

/** tileable Worley F1 (period p cells), returns distance in cell units */
function worley(x: number, y: number, p: number, seed: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = x0 + i,
        cy = y0 + j;
      const wx = ((cx % p) + p) % p,
        wy = ((cy % p) + p) % p;
      const px = cx + hash2(wx, wy, seed),
        py = cy + hash2(wx, wy, seed + 17);
      const d = Math.hypot(px - x, py - y);
      if (d < best) best = d;
    }
  return best;
}

let cached: THREE.DataTexture | null = null;

/** the shared 128² tileable cloud noise (built once) */
export function cloudNoiseTexture(): THREE.DataTexture {
  if (cached) return cached;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N,
        v = y / N;
      // R: gradient fbm (4 / 8 / 16 cells)
      let r = 0,
        amp = 0.55,
        sum = 0;
      for (const p of [4, 8, 16, 32]) {
        r += gradNoise(u * p, v * p, p, 11 + p) * amp;
        sum += amp;
        amp *= 0.5;
      }
      r /= sum;
      // G: billows = inverted Worley (6 + 12 cells)
      const w1 = 1 - Math.min(1, worley(u * 6, v * 6, 6, 3) * 1.1);
      const w2 = 1 - Math.min(1, worley(u * 12, v * 12, 12, 5) * 1.15);
      const gch = w1 * 0.68 + w2 * 0.32;
      // B: fine detail (Worley 24 + gradient 32)
      const bch = (1 - Math.min(1, worley(u * 24, v * 24, 24, 9))) * 0.55 + gradNoise(u * 32, v * 32, 32, 21) * 0.45;
      // A: second gradient fbm (other seeds), for weather / cirrus
      let a = 0;
      amp = 0.6;
      sum = 0;
      for (const p of [2, 4, 8, 16]) {
        a += gradNoise(u * p, v * p, p, 41 + p) * amp;
        sum += amp;
        amp *= 0.5;
      }
      a /= sum;
      const o = (y * N + x) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[o + 1] = Math.round(Math.min(1, Math.max(0, gch)) * 255);
      data[o + 2] = Math.round(Math.min(1, Math.max(0, bch)) * 255);
      data[o + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.name = 'CloudNoise';
  t.needsUpdate = true;
  cached = t;
  return t;
}

/** Uniforms shared by the dome and the cloud-shadow map (same objects in both materials). */
export function cloudLayerUniforms() {
  return {
    tCloudNoise: { value: cloudNoiseTexture() as THREE.Texture },
    /** cumulus: x coverage 0..1, y base altitude (m), z feature scale (m per noise tile), w drift time (m) */
    uCu: { value: new THREE.Vector4(0.4, 1500, 5200, 0) },
    /** cumulus slab: x thickness (m), y extinction (1/m at density 1), z, w unused */
    uCuSlab: { value: new THREE.Vector4(1100, 0.03, 0, 0) },
    /** cirrus: x coverage, y altitude, z scale, w opacity */
    uCi: { value: new THREE.Vector4(0.3, 8500, 26000, 0.35) },
    /** drift direction (unit xz) */
    uCloudWind: { value: new THREE.Vector2(1, 0) },
    /** sun light reaching the clouds (colour × intensity, after the atmosphere at cloud height) */
    uCloudSun: { value: new THREE.Color(1, 1, 1) },
    /** ambient (sky) light on the clouds: top (sky) and bottom (ground bounce) */
    uCloudAmbTop: { value: new THREE.Color(0.5, 0.6, 0.8) },
    uCloudAmbBot: { value: new THREE.Color(0.3, 0.3, 0.3) },
    /** night: city glow under the clouds near the town */
    uCloudCity: { value: new THREE.Color(0, 0, 0) },
    /** light direction for the clouds (sun by day, moon by night) */
    uCloudL: { value: new THREE.Vector3(0, 1, 0) },
  };
}
export type CloudLayerUniforms = ReturnType<typeof cloudLayerUniforms>;

/** GLSL: uniforms + density functions (used by the dome and by the shadow map). */
export const CLOUD_LAYER_GLSL = /* glsl */ `
uniform sampler2D tCloudNoise;
uniform vec4 uCu;
uniform vec4 uCuSlab;
uniform vec4 uCi;
uniform vec2 uCloudWind;
const float CL_RG = 6360e3;
// cumulus thickness field 0..1 at world xz (m): which ~1.7 km noise cells host a cloud (coverage, varied by
// large weather patches), its rounded body (~1 km across), and (full) billowy cauliflower rims. Fair-weather
// cumulus are separate ~0.5–2 km clouds with clear gaps, never a scatter of tiny flakes.
float cuField(vec2 xz, float lod, bool full) {
  vec2 p = (xz - uCloudWind * uCu.w) / uCu.z;
  vec4 wx = textureLod(tCloudNoise, p * 0.13 + vec2(0.31, 0.77), lod + 1.0);
  vec2 warp = (vec2(wx.r, wx.a) - 0.5) * 0.3;
  vec4 c = textureLod(tCloudNoise, p * 0.42 + warp, lod);
  float cov = clamp(uCu.x * (0.4 + 1.2 * smoothstep(0.3, 0.72, wx.a)), 0.0, 1.0);
  float pick = smoothstep(1.0 - cov - 0.12, 1.0 - cov + 0.12, c.r * 0.75 + wx.a * 0.25);
  // dome cross-section over the (cone-like) Worley cell: r 0 at the centre → 1 at the rim
  float r = clamp((0.86 - c.g) / 0.52, 0.0, 1.0);
  float body = sqrt(max(0.0, 1.0 - r * r)) * pick;
  if (!full || body <= 0.0) return body;
  vec4 b = textureLod(tCloudNoise, p * 2.1 + warp * 1.6 + vec2(0.53, 0.19), lod + 0.3);
  return clamp(body * (0.62 + 0.55 * b.g) - (1.0 - body) * 0.4 * (1.0 - b.g) - 0.1 * (b.b - 0.5), 0.0, 1.0);
}
// cumulus density inside the slab: h01 = 0 at the (flat) base … 1 at the top; thick cells tower higher
float cuDens(vec2 xz, float h01, float lod, bool full) {
  float f = cuField(xz - uCloudWind * (h01 * 150.0), lod, full);
  // the field is dome-shaped per cell; with a linear height profile the top follows it (rounded, billowy
  // via the field's detail), the base stays flat, and small / partly picked clouds stay low and flat
  // (1.12: even the thickest cloud tops out below the slab ceiling — never box-clipped)
  float prof = 0.08 + 1.12 * h01;
  return clamp((f - prof) * 3.2, 0.0, 1.0) * smoothstep(0.0, 0.035, h01);
}
// cirrus: broad veils with fibres stretched along the wind (opacity texture, never thresholded detail)
float ciDensity(vec2 xz, float lod) {
  vec2 w = uCloudWind;
  vec2 q = vec2(dot(xz, w), dot(xz, vec2(-w.y, w.x)));
  q.x -= uCu.w * 1.8;
  vec2 p = q / uCi.z;
  vec4 n1 = textureLod(tCloudNoise, p * vec2(0.45, 1.1) + vec2(0.13, 0.41), lod);
  float veil = smoothstep(1.0 - uCi.x, 1.0 - uCi.x + 0.4, n1.a * 0.75 + n1.r * 0.25);
  if (veil <= 0.0) return 0.0;
  vec4 n2 = textureLod(tCloudNoise, p * vec2(1.1, 6.5) + n1.rg * 0.35, lod + 0.3);
  return veil * (0.45 + 0.55 * n2.r);
}
// distance from the camera (height camH) along unit dir to a shell at altitude alt; < 0: no hit
float clShell(float camH, vec3 d, float alt) {
  float r0 = CL_RG + camH;
  float b = r0 * d.y;
  float c = (camH - alt) * (2.0 * CL_RG + camH + alt);
  float h = b * b - c;
  if (h < 0.0) return -1.0;
  float s = sqrt(h);
  return camH < alt ? -b + s : (-b - s > 0.0 ? -b - s : -1.0);
}
`;

/** GLSL (dome): `vec4 thClouds(vec3 dir, vec3 skyCol)` → the cirrus veil (rgb premultiplied, a alpha); the
 *  cumulus come from the raymarched volume (sky/cloudVolume.ts). Needs CLOUD_LAYER_GLSL. */
export const CLOUD_SHADE_GLSL = /* glsl */ `
uniform vec3 uCloudSun;
uniform vec3 uCloudAmbTop;
uniform vec3 uCloudAmbBot;
uniform vec3 uCloudCity;
uniform vec3 uCloudL;
vec4 thClouds(vec3 d, vec3 skyCol) {
  vec3 cam = cameraPosition;
  vec4 acc = vec4(0.0);
  // cirrus (high and thin: cheap 2D veil; the cumulus volume is composited over it)
  if (uCi.x > 0.01 && d.y > -0.02) {
    float t = clShell(cam.y, d, uCi.y);
    if (t > 0.0) {
      vec2 xz = cam.xz + d.xz * t;
      float lod = clamp(log2(t / 9000.0), 0.0, 5.0);
      float a = ciDensity(xz, lod) * uCi.w;
      a *= smoothstep(0.0, 0.06, d.y); // thin to nothing toward the horizon
      float mu = dot(d, uCloudL);
      float ph = 0.6 + 1.6 * pow(max(mu, 0.0), 6.0);
      vec3 c = uCloudSun * ph * 0.55 + uCloudAmbTop * 0.9;
      float far = 1.0 - exp(-t / 140000.0);
      c = mix(c, skyCol, far * 0.7);
      acc = vec4(c * a, a);
    }
  }
  return acc;
}
`;

/** GLSL (shadow map): `float thCloudLit(vec2 groundXZ, vec3 L)` 1 = unshadowed. Needs CLOUD_LAYER_GLSL. */
export const CLOUD_SHADOW_FIELD_GLSL = /* glsl */ `
float thCloudLit(vec2 g, vec3 L) {
  vec2 slope = L.xz / max(L.y, 0.08);
  // the sun ray crosses the deck around its lower third; thickness there ≈ how much light it eats
  float d = cuField(g + slope * (uCu.y + uCuSlab.x * 0.3), 1.0, true);
  float c = ciDensity(g + slope * uCi.y, 2.0) * uCi.w;
  return exp(-d * 2.8) * (1.0 - c * 0.35);
}
`;
