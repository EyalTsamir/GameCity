// Sky visibility ("sky view factor") of the town for the ambient light — the street-canyon gradient of
// real photographs: the bottom of a street between tall buildings sees a slice of the sky and is
// clearly darker in shade than the open square or the upper floors. N8AO (a few metres, screen space,
// first to go on the adaptive ladder) cannot produce it.
//
// At boot (sky module, before any material compiles) the lots' building heights are rasterised on a
// 2 m grid and, for every cell, the horizon is marched in 12 azimuths (11 steps to 64 m): the cosine-
// weighted sky fraction of a horizontal patch, 1 − mean(sin²(horizon elevation)), at 0 / 6 / 15 / 30 m
// above ground → one RGBA8 texture. A one-time patch of three's light chunks multiplies the hemisphere
// light and the diffuse IBL of every built-in lit material (Lambert / Phong / Standard / Physical and
// their onBeforeCompile variants) by it (sampled 1.5 m out along the normal, so a wall reads the street
// in front of it, not its own building), and adds a little warm sun bounce where the sky is blocked
// (sunlit pavement and facades light the shaded canyon). Outside the grid the factor is 1.
// ?noskyvis: off (and on the low tier). Cost: one texture fetch per lit fragment.

import * as THREE from 'three';
import type { CityPlan } from '../../core/plan';

const CELL = 2;
const MARGIN = 40;
const HEIGHTS = [0, 6, 15, 30];
const AZ = 12;
const DIST = [2, 3.5, 5.5, 8, 11, 15, 20, 27, 36, 48, 64];

export interface SkyVisStats {
  cells: number;
  ms: number;
  /** CPU copy of the factor (no strength applied): sky visibility of a horizontal patch at (x, y, z) — for metering */
  at(x: number, y: number, z: number): number;
}

let patched = false;

/** Build the visibility grid and patch the light chunks (idempotent). Returns null when not patched. */
export function installSkyVis(plan: CityPlan): SkyVisStats | null {
  if (patched) return null;
  const t0 = performance.now();
  const x0 = plan.slab.x0 - MARGIN,
    z0 = plan.slab.z0 - MARGIN;
  const nx = Math.ceil((plan.slab.x1 + MARGIN - x0) / CELL),
    nz = Math.ceil((plan.slab.z1 + MARGIN - z0) / CELL);
  const H = new Float32Array(nx * nz);
  for (const lot of plan.lots) {
    const f = lot.footprint;
    if (!f || !(lot.height > 0)) continue;
    const i0 = Math.max(0, Math.ceil((f.x0 - x0) / CELL - 0.5)),
      i1 = Math.min(nx - 1, Math.floor((f.x1 - x0) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((f.z0 - z0) / CELL - 0.5)),
      j1 = Math.min(nz - 1, Math.floor((f.z1 - z0) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) H[j * nx + i] = Math.max(H[j * nx + i], lot.height);
  }
  const dx = new Float32Array(AZ),
    dz = new Float32Array(AZ);
  for (let a = 0; a < AZ; a++) {
    dx[a] = Math.cos(((a + 0.5) / AZ) * Math.PI * 2);
    dz[a] = Math.sin(((a + 0.5) / AZ) * Math.PI * 2);
  }
  const NH = HEIGHTS.length;
  const tmax = new Float32Array(NH);
  const occ = new Float32Array(NH);
  const data = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const px = i + 0.5,
        pz = j + 0.5;
      occ.fill(0);
      for (let a = 0; a < AZ; a++) {
        tmax.fill(0);
        for (const d of DIST) {
          const si = Math.floor(px + (dx[a] * d) / CELL),
            sj = Math.floor(pz + (dz[a] * d) / CELL);
          if (si < 0 || sj < 0 || si >= nx || sj >= nz) break;
          const h = H[sj * nx + si];
          if (h <= 0) continue;
          for (let k = 0; k < NH; k++) {
            const t = (h - HEIGHTS[k]) / d;
            if (t > tmax[k]) tmax[k] = t;
          }
        }
        for (let k = 0; k < NH; k++) occ[k] += (tmax[k] * tmax[k]) / (1 + tmax[k] * tmax[k]);
      }
      const o = (j * nx + i) * 4;
      for (let k = 0; k < NH; k++) data[o + k] = Math.round((1 - occ[k] / AZ) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const box = new THREE.Vector4(x0, z0, 1 / (nx * CELL), 1 / (nz * CELL));
  if (!patchChunks(tex, box)) return null;
  patched = true;
  const at = (x: number, y: number, z: number): number => {
    const i = Math.floor((x - x0) / CELL),
      j = Math.floor((z - z0) / CELL);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 1;
    const o = (j * nx + i) * 4;
    const v = (k: number) => data[o + k] / 255;
    if (y < 6) return v(0) + (v(1) - v(0)) * Math.max(0, y / 6);
    if (y < 15) return v(1) + (v(2) - v(1)) * ((y - 6) / 9);
    if (y < 30) return v(2) + (v(3) - v(2)) * ((y - 15) / 15);
    const t = Math.min(1, (y - 30) / 30);
    return v(3) + (1 - v(3)) * t * t * (3 - 2 * t);
  };
  return { cells: nx * nz, ms: Math.round((performance.now() - t0) * 10) / 10, at };
}

const PARS = /* glsl */ `
uniform sampler2D thSkyVisTex;
uniform vec4 thSkyVisBox;
// sky visibility at world point wp (normal wn, both world space): 1 = open sky
float thSkyVis(vec3 wp, vec3 wn) {
  vec2 uv = (wp.xz + wn.xz * 1.5 - thSkyVisBox.xy) * thSkyVisBox.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
  vec4 v = texture2D(thSkyVisTex, uv);
  float y = wp.y;
  float s = y < 6.0 ? mix(v.r, v.g, clamp(y / 6.0, 0.0, 1.0)) : (y < 15.0 ? mix(v.g, v.b, (y - 6.0) / 9.0) : (y < 30.0 ? mix(v.b, v.a, (y - 15.0) / 15.0) : mix(v.a, 1.0, smoothstep(30.0, 60.0, y))));
  // (a sky view factor of 0.5 at the foot of a canyon reads ~0.6 in a photograph: the canyon walls are
  // themselves lit and bounce light down — the warm sun part of that is added below)
  return mix(1.0, s, 0.85);
}
`;

const BEGIN = /* glsl */ `
mat3 thSvM = mat3(viewMatrix);
vec3 thSvP = transpose(thSvM) * (geometryPosition - viewMatrix[3].xyz);
vec3 thSvN = transpose(thSvM) * geometryNormal;
float thSV = thSkyVis(thSvP, thSvN);
`;

function patchChunks(tex: THREE.Texture, box: THREE.Vector4): boolean {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const pars = chunks.lights_pars_begin;
  const begin = chunks.lights_fragment_begin;
  const maps = chunks.lights_fragment_maps;
  const anchor = 'vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );';
  const hemi = 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );';
  const hemiEnd = '#if ( NUM_HEMI_LIGHTS > 0 )';
  const ibl = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
  if (typeof pars !== 'string' || typeof begin !== 'string' || typeof maps !== 'string') return false;
  if (!begin.includes(anchor) || !begin.includes(hemi) || !begin.includes(hemiEnd) || !maps.includes(ibl)) return false;
  chunks.lights_pars_begin = pars + PARS;
  // the sun bounce: sunlit ground / facades (albedo ~0.2) light what the sky cannot reach, warm — at a low sun
  // mostly the facades that face it, so it does not vanish with the sun's height
  const bounce =
    '#if ( NUM_DIR_LIGHTS > 0 )\n' +
    '\t{ float thUp = 0.4 + 0.6 * max(dot(directionalLights[ 0 ].direction, thSvM[ 1 ]), 0.0);\n' +
    '\t  irradiance += directionalLights[ 0 ].color * (0.07 * thUp * (1.0 - thSV)); }\n' +
    '#endif\n';
  chunks.lights_fragment_begin = begin
    .replace(anchor, anchor + '\n' + BEGIN)
    .replace(hemi, 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * thSV;')
    .replace(hemiEnd, bounce + hemiEnd);
  chunks.lights_fragment_maps = maps.replace(ibl, 'iblIrradiance += getIBLIrradiance( geometryNormal ) * thSV;');
  // the uniforms: every built-in lit shader (cloned per material at its first compile — static values),
  // and UniformsLib.lights for ShaderMaterials that merge it later
  const u = { thSkyVisTex: { value: tex }, thSkyVisBox: { value: box } };
  const lib = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>;
  for (const k of ['lambert', 'phong', 'standard', 'physical', 'toon']) if (lib[k]) Object.assign(lib[k].uniforms, u);
  Object.assign(THREE.UniformsLib.lights as unknown as Record<string, THREE.IUniform>, u);
  return true;
}
