// World mode: the sea to the horizon and the river into the country, beyond the slab.
//
// Own ring topology (landscape/rings.ts) whose ring 0 samples the slab boundary every 2 m — exactly
// the boundary vertices of the slab's water grid (water/surface.ts domains: 2 m steps from the slab
// corners), so the two surfaces share their seam vertices and the swell displaces them identically.
// Triangles are kept where the landscape lies below (or just above) the water. Per-vertex field
// values (depth, shore distance, beachness, region) replace the slab field texture outside the slab
// (aFld.w ≥ 0; slab vertices carry w = −1 and keep sampling the texture).

import { SLAB, WATER_LEVEL } from '../../core/constants';
import { buildRings, uniformEdges } from '../landscape/rings';
import type { LandscapeModel } from '../landscape/model';
import type { WaterField } from './field';
import { ampFrom } from './field';
import { GROUND_DROP } from '../terrain/height';

/** the sea surface reaches this far beyond the slab (the horizon, fully hazed) */
export const WATER_MAX_D = 52000;

export interface WaterExtension {
  pos: Float32Array;
  wave: Float32Array;
  fld: Float32Array;
  index: Uint32Array;
  vertices: number;
  ms: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildWaterExtension(model: LandscapeModel, field: WaterField): WaterExtension {
  const t0 = performance.now();
  const topo = buildRings(uniformEdges(2), WATER_MAX_D, 1.6);
  const n = topo.count;
  const h = new Float32Array(n);
  const fld = new Float32Array(n * 4);
  const wave = new Float32Array(n * 2);
  const rv = { d: 0, halfW: 8, s: 0, tx: 1, tz: 0 };
  // ring distance per vertex (for the far fade)
  const dOf = new Float32Array(n);
  for (const r of topo.rings) for (let i = 0; i < r.n; i++) dOf[r.start + i] = r.d;
  for (let v = 0; v < n; v++) {
    const x = topo.x[v],
      z = topo.z[v];
    const d = dOf[v];
    if (d === 0) {
      // seam: the slab field, exactly as the slab water grid sees it
      const dep = field.sample(field.depth, x, z);
      const reg = field.sample(field.region, x, z);
      h[v] = WATER_LEVEL - dep - GROUND_DROP;
      fld[v * 4] = dep;
      fld[v * 4 + 1] = field.sample(field.shore, x, z);
      fld[v * 4 + 2] = field.sample(field.beach, x, z);
      fld[v * 4 + 3] = reg;
      wave[v * 2] = ampFrom(dep, reg);
      wave[v * 2 + 1] = reg;
      continue;
    }
    const y = model.height(x, z);
    h[v] = y;
    const dep = WATER_LEVEL - (y + GROUND_DROP);
    // river corridor (outside the slab the river only runs west)
    let region = 0,
      shore: number,
      beach: number;
    if (x < SLAB.x0 + 40 && model.river(x, z, rv) && rv.d < rv.halfW + 12) {
      region = 0.5;
      shore = Math.max(0, rv.halfW - rv.d);
      beach = 0;
    } else {
      const sd = model.coastSD(x, z);
      shore = Math.max(0, -sd);
      // gentle sandy shores break waves; the cliff coast north of the harbour does not
      beach = z > -150 ? 1 - smooth(560, 760, z) * (1 - smooth(1000, 1300, z)) : 0.15;
    }
    fld[v * 4] = Math.max(-2, dep);
    fld[v * 4 + 1] = Math.min(shore, 40);
    fld[v * 4 + 2] = beach;
    fld[v * 4 + 3] = region;
    // swell displacement fades out far away (sub-pixel, and the coarse rings would alias it)
    wave[v * 2] = ampFrom(dep, region) * (1 - smooth(1500, 6000, d));
    wave[v * 2 + 1] = region;
  }
  // wet triangles (any corner at most 0.3 m above the water)
  const wet = (v: number) => h[v] + GROUND_DROP < WATER_LEVEL + 0.3;
  const keep: number[] = [];
  const used = new Int32Array(n).fill(-1);
  const T = topo.tris;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t],
      b = T[t + 1],
      c = T[t + 2];
    if (!(wet(a) || wet(b) || wet(c))) continue;
    keep.push(a, b, c);
  }
  // compact the vertex set
  let m = 0;
  for (const v of keep) if (used[v] < 0) used[v] = m++;
  const pos = new Float32Array(m * 3);
  const fo = new Float32Array(m * 4);
  const wo = new Float32Array(m * 2);
  for (let v = 0; v < n; v++) {
    const k = used[v];
    if (k < 0) continue;
    pos[k * 3] = topo.x[v];
    pos[k * 3 + 1] = WATER_LEVEL;
    pos[k * 3 + 2] = topo.z[v];
    for (let q = 0; q < 4; q++) fo[k * 4 + q] = fld[v * 4 + q];
    wo[k * 2] = wave[v * 2];
    wo[k * 2 + 1] = wave[v * 2 + 1];
  }
  const index = new Uint32Array(keep.length);
  for (let i = 0; i < keep.length; i++) index[i] = used[keep[i]];
  return { pos, wave: wo, fld: fo, index, vertices: m, ms: performance.now() - t0 };
}
