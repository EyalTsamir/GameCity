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
export const LAND_MAX_D = 45000;
/** forest canopy is raised into the terrain beyond this slab distance (instanced trees closer in) */
export const CANOPY_NEAR = 840;
export const CANOPY_FULL = 1100;
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
  hole?: LandHole,
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
  for (let v = 0; v < nv; v++) {
    const ny = Math.max(0.05, nor0[v * 3 + 1]);
    coverAt(model, topo.x[v], topo.z[v], h[v], ringD[v], Math.sqrt(Math.max(0, 1 - ny * ny)) / ny, cover, canopy, v);
  }
  // ── raise the canopy, final normals; inside the hole the rings sink under the sea (a finer patch
  // draws that land; heights.h keeps the true values for the water's depth field)
  for (let v = 0; v < nv; v++) {
    let y = h[v] + canopy[v];
    if (hole && topo.x[v] > hole.x0 && topo.x[v] < hole.x1 && topo.z[v] > hole.z0 && topo.z[v] < hole.z1) y = Math.min(y, WL - 8);
    pos[v * 3 + 1] = y;
  }
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const tmp = [0, 1, 0];
  const r0 = topo.rings[0];
  for (let i = 0; i < r0.n; i++) {
    const v = r0.start + i;
    slabNormal(topo.x[v], topo.z[v], tmp);
    nor.setXYZ(v, tmp[0], tmp[1], tmp[2]);
  }
  setCoverAttributes(geo, cover, nv);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, heights: { h, canopy, cover, landVerts: nv, ms: performance.now() - t0 } };
}

const _c: Cover = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
const _rq = { d: 0, halfW: 8, s: 0, tx: 1, tz: 0, side: 1 };
/** cover channels (CW floats at v·CW) + raised canopy of one land vertex */
function coverAt(model: LandscapeModel, x: number, z: number, y: number, d: number, slope: number, cover: Float32Array, canopy: Float32Array, v: number): void {
  const c = _c,
    rq = _rq;
  const k = v * CW;
  if (d === 0 || y < WL - 6) {
    cover[k + 5] = d === 0 ? 1 : 0;
    cover[k + 6] = 1;
    cover[k + 8] = 60;
    return;
  }
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
  cover[k + 11] = model.grazing(x, z);
  cover[k + 9] = model.slabDist(x, z);
}

function setCoverAttributes(geo: THREE.BufferGeometry, cover: Float32Array, nv: number): void {
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
}

/** a rectangle the ring mesh leaves to a finer patch (its vertices sink under the sea there) */
export interface LandHole {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** the island as its own fine grid (the far rings are 80–150 m apart out there: a faceted pyramid) */
export function buildIslandPatch(model: LandscapeModel, box: LandHole, step: number): THREE.BufferGeometry {
  const nx = Math.ceil((box.x1 - box.x0) / step) + 1,
    nz = Math.ceil((box.z1 - box.z0) / step) + 1;
  const nv = nx * nz;
  const pos = new Float32Array(nv * 3);
  const h = new Float32Array(nv);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      const x = box.x0 + ((box.x1 - box.x0) * i) / (nx - 1),
        z = box.z0 + ((box.z1 - box.z0) * j) / (nz - 1);
      h[v] = model.height(x, z);
      pos[v * 3] = x;
      pos[v * 3 + 1] = h[v];
      pos[v * 3 + 2] = z;
    }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        c = a + nx,
        d = c + 1;
      // alternate the diagonal (no directional grain)
      if ((i + j) & 1) {
        idx.set([a, c, b, b, c, d], t);
      } else {
        idx.set([a, c, d, a, d, b], t);
      }
      t += 6;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nor0 = (geo.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
  const cover = new Float32Array(nv * CW);
  const canopy = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const ny = Math.max(0.05, nor0[v * 3 + 1]);
    const x = pos[v * 3],
      z = pos[v * 3 + 2];
    coverAt(model, x, z, h[v], model.slabDist(x, z), Math.sqrt(Math.max(0, 1 - ny * ny)) / ny, cover, canopy, v);
  }
  for (let v = 0; v < nv; v++) pos[v * 3 + 1] = h[v] + canopy[v];
  geo.computeVertexNormals();
  setCoverAttributes(geo, cover, nv);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Field mask for per-plot field / meadow decisions: the land vertices' field cover splatted onto a
 * square grid round the town (holes filled from coarser levels), × a ramp away from the slab edge (the
 * plots next to the town are meadow, so the town's lawn never meets a crop along the slab's ruler-
 * straight edge). The shader samples it at each plot's CENTRE, so a field ends at a plot border (a
 * hedge / margin), never on a cover contour diagonally through a plot.
 */
export interface FieldMask {
  tex: THREE.DataTexture;
  /** x0, z0, 1/size, 1/size (world → uv) */
  xf: THREE.Vector4;
}
/** one cover channel of the land vertices splatted onto a square grid (holes push-pull filled) */
export interface CoverGrid {
  data: Float32Array;
  N: number;
  x0: number;
  z0: number;
  res: number;
  /** bilinear sample (0 outside) */
  at(x: number, z: number): number;
}
export function splatCover(topo: RingTopology, heights: LandHeights, channel: number, cx: number, cz: number, half: number, res: number): CoverGrid {
  const N = Math.round((2 * half) / res);
  const x0 = cx - half,
    z0 = cz - half;
  const sum = new Float32Array(N * N),
    cnt = new Float32Array(N * N);
  for (let v = 0; v < heights.landVerts; v++) {
    const i = Math.floor((topo.x[v] - x0) / res),
      j = Math.floor((topo.z[v] - z0) / res);
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    sum[j * N + i] += heights.cover[v * CW + channel];
    cnt[j * N + i] += 1;
  }
  // push-pull: average pyramid, then fill the empty texels from the coarser levels
  const levels: { s: Float32Array; c: Float32Array; n: number }[] = [{ s: sum, c: cnt, n: N }];
  while (levels[levels.length - 1].n > 1) {
    const L = levels[levels.length - 1];
    const n2 = Math.ceil(L.n / 2);
    const s2 = new Float32Array(n2 * n2),
      c2 = new Float32Array(n2 * n2);
    for (let j = 0; j < L.n; j++)
      for (let i = 0; i < L.n; i++) {
        const k = (j >> 1) * n2 + (i >> 1);
        s2[k] += L.s[j * L.n + i];
        c2[k] += L.c[j * L.n + i];
      }
    levels.push({ s: s2, c: c2, n: n2 });
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l],
      U = levels[l + 1];
    for (let j = 0; j < L.n; j++)
      for (let i = 0; i < L.n; i++) {
        const k = j * L.n + i;
        if (L.c[k] > 0) continue;
        const ku = (j >> 1) * U.n + (i >> 1);
        L.s[k] = U.c[ku] > 0 ? U.s[ku] / U.c[ku] : 0;
        L.c[k] = 1;
      }
  }
  const data = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) data[k] = cnt[k] > 0 ? sum[k] / cnt[k] : 0;
  return {
    data,
    N,
    x0,
    z0,
    res,
    at(x: number, z: number): number {
      const fx = (x - x0) / res - 0.5,
        fz = (z - z0) / res - 0.5;
      if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return 0;
      const i = Math.floor(fx),
        j = Math.floor(fz);
      const tx = fx - i,
        tz = fz - j;
      const a = data[j * N + i],
        b = data[j * N + i + 1],
        c = data[(j + 1) * N + i],
        d = data[(j + 1) * N + i + 1];
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    },
  };
}

export function buildFieldMask(topo: RingTopology, heights: LandHeights, model: LandscapeModel, cx: number, cz: number, half: number, res: number): FieldMask {
  const g = splatCover(topo, heights, 1, cx, cz, half, res);
  const N = g.N,
    x0 = g.x0,
    z0 = g.z0;
  const data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = x0 + (i + 0.5) * res,
        z = z0 + (j + 0.5) * res;
      const ramp = smooth(6, 70, model.slabDist(x, z));
      data[k] = Math.round(Math.min(1, Math.max(0, g.data[k] * ramp)) * 255);
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, xf: new THREE.Vector4(x0, z0, 1 / (2 * half), 1 / (2 * half)) };
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
