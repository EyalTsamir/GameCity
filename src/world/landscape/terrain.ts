// The landscape ground mesh: one indexed mesh over the ring topology (landscape/rings.ts) from the
// slab edge out to LAND_MAX_D. Heights from the landscape model; ring 0 = the slab ground's edge
// vertices with the slab ground's own normals (no lighting crease at the seam). Forest canopy is
// raised into the mesh beyond CANOPY_NEAR (closer to the slab the forest is made of instanced trees).

import * as THREE from 'three';
import { GROUND_DROP } from '../terrain/height';
import type { LandscapeModel, Cover } from './model';
import { WL } from './model';
import type { RingTopology } from './rings';
import { smooth, vnoise } from './noise';

/** the land mesh ends here (m outside the slab); the water extension goes further */
export const LAND_MAX_D = 21000;
/** forest canopy is raised into the terrain beyond this slab distance (instanced trees closer in) */
export const CANOPY_NEAR = 150;
export const CANOPY_FULL = 420;
/** floats per vertex in LandHeights.cover: forest, field, sand, rock | wet, meadow, seam, canopy | riverU, slabD, side, - */
const CW = 12;

export interface LandHeights {
  /** ground height per topology vertex (NaN beyond the land extent) */
  h: Float32Array;
  /** canopy height added on top (forest) */
  canopy: Float32Array;
  cover: Float32Array; // CW floats per vertex
  landVerts: number;
  ms: number;
}

/**
 * Heights, cover and the land geometry over the ring topology up to `landMaxD`: heights first, then
 * the mesh normals give the slope for the cover (no extra height evaluations), then the forest canopy
 * is raised and the normals recomputed; ring 0 keeps the slab ground's own normals.
 */
export function buildLand(
  topo: RingTopology,
  model: LandscapeModel,
  landMaxD: number,
  slabH: (x: number, z: number) => number,
  slabNormal: (x: number, z: number, out: number[]) => void,
): { geo: THREE.BufferGeometry; heights: LandHeights } {
  const t0 = performance.now();
  let nv = 0,
    lastRing = 0;
  for (let k = 0; k < topo.rings.length; k++) {
    if (topo.rings[k].d > landMaxD) break;
    lastRing = k;
    nv = topo.rings[k].start + topo.rings[k].n;
  }
  const h = new Float32Array(topo.count).fill(NaN);
  const canopy = new Float32Array(topo.count);
  const cover = new Float32Array(topo.count * CW);
  const ringD = new Float32Array(nv);
  for (let k = 0; k <= lastRing; k++) {
    const ring = topo.rings[k];
    for (let i = 0; i < ring.n; i++) {
      const v = ring.start + i;
      ringD[v] = ring.d;
      h[v] = ring.d === 0 ? slabH(topo.x[v], topo.z[v]) : model.height(topo.x[v], topo.z[v]);
    }
  }
  const pos = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    pos[v * 3] = topo.x[v];
    pos[v * 3 + 1] = h[v];
    pos[v * 3 + 2] = topo.z[v];
  }
  const triEnd = topo.triStart[lastRing];
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3);
  geo.setAttribute('position', pa);
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(topo.tris.subarray(0, triEnd * 3)), 1));
  geo.computeVertexNormals();
  const nor0 = (geo.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
  // ── cover
  const c: Cover = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
  const rq = { d: 0, halfW: 8, s: 0, tx: 1, tz: 0, side: 1 };
  for (let v = 0; v < nv; v++) {
    const x = topo.x[v],
      z = topo.z[v],
      y = h[v],
      d = ringD[v];
    const k = v * CW;
    if (d === 0 || y < WL - 6) {
      cover[k + 5] = d === 0 ? 1 : 0;
      cover[k + 6] = 1;
      cover[k + 8] = 60;
      continue;
    }
    const ny = Math.max(0.05, nor0[v * 3 + 1]);
    const slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / ny;
    model.cover(x, z, c, y, slope);
    cover[k] = c.forest;
    cover[k + 1] = c.field;
    cover[k + 2] = c.sand;
    cover[k + 3] = c.rock;
    cover[k + 4] = c.wet;
    cover[k + 5] = c.meadow;
    cover[k + 6] = 1 - smooth(4, 30, d); // seam zone
    // canopy: closed forest far from the slab becomes part of the terrain surface
    const cw = smooth(CANOPY_NEAR, CANOPY_FULL, d) * smooth(0.3, 0.8, c.forest);
    if (cw > 0) {
      canopy[v] = (9 + 5 * vnoise(x / 37, z / 37, 61) + 3 * vnoise(x / 11, z / 11, 62)) * cw;
      cover[k + 7] = cw;
    }
    // river bank coordinate (m from the waterline, < 0 in the water), bank side, slab distance
    if (x < -150 && model.river(x, z, rq) && rq.d < rq.halfW + 60) {
      cover[k + 8] = rq.d - rq.halfW;
      cover[k + 10] = rq.side ?? 1;
    } else cover[k + 8] = 60;
    cover[k + 9] = model.slabDist(x, z);
  }
  // ── raise the canopy, final normals
  for (let v = 0; v < nv; v++) pos[v * 3 + 1] = h[v] + canopy[v];
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const tmp = [0, 1, 0];
  const r0 = topo.rings[0];
  for (let i = 0; i < r0.n; i++) {
    const v = r0.start + i;
    slabNormal(topo.x[v], topo.z[v], tmp);
    nor.setXYZ(v, tmp[0], tmp[1], tmp[2]);
  }
  const cov = new Float32Array(nv * 4);
  const cov2 = new Float32Array(nv * 4);
  const cov3 = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    for (let q = 0; q < 4; q++) {
      cov[v * 4 + q] = cover[v * CW + q];
      cov2[v * 4 + q] = cover[v * CW + 4 + q];
      cov3[v * 4 + q] = cover[v * CW + 8 + q];
    }
  }
  geo.setAttribute('aCov', new THREE.BufferAttribute(cov, 4));
  geo.setAttribute('aCov2', new THREE.BufferAttribute(cov2, 4));
  geo.setAttribute('aCov3', new THREE.BufferAttribute(cov3, 4));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, heights: { h, canopy, cover, landVerts: nv, ms: performance.now() - t0 } };
}

/** slab ground normal at an edge vertex (terrain/ground.ts slopePick formula) */
export function makeSlabNormal(H: (x: number, z: number) => number): (x: number, z: number, out: number[]) => void {
  const pick = (m: number, c: number, p: number, e: number): number => {
    const dm = (c - m) / e,
      dp = (p - c) / e;
    const big = 9;
    if (Math.abs(dm) > big && Math.abs(dp) <= big) return dp;
    if (Math.abs(dp) > big && Math.abs(dm) <= big) return dm;
    if (Math.abs(dp) > big && Math.abs(dm) > big) return 0;
    return (dm + dp) * 0.5;
  };
  const e = 0.06;
  return (x, z, out) => {
    const h = H(x, z);
    const gx = pick(H(x - e, z), h, H(x + e, z), e);
    const gz = pick(H(x, z - e), h, H(x, z + e), e);
    const il = 1 / Math.hypot(gx, 1, gz);
    out[0] = -gx * il;
    out[1] = il;
    out[2] = -gz * il;
  };
}

export { GROUND_DROP };
