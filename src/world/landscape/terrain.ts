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

export interface LandHeights {
  /** ground height per topology vertex (NaN beyond the land extent) */
  h: Float32Array;
  /** canopy height added on top (forest) */
  canopy: Float32Array;
  cover: Float32Array; // 8 floats per vertex
  landVerts: number;
  ms: number;
}

/** evaluate the model at every ring vertex up to `landMaxD` (heights) and `waterMaxD` (heights only) */
export function evalHeights(topo: RingTopology, model: LandscapeModel, landMaxD: number, waterMaxD: number, slabH: (x: number, z: number) => number): LandHeights {
  const t0 = performance.now();
  const n = topo.count;
  const h = new Float32Array(n).fill(NaN);
  const canopy = new Float32Array(n);
  const cover = new Float32Array(n * 8);
  const c: Cover = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
  let landVerts = 0;
  for (const ring of topo.rings) {
    if (ring.d > waterMaxD) break;
    const land = ring.d <= landMaxD;
    for (let i = 0; i < ring.n; i++) {
      const v = ring.start + i;
      const x = topo.x[v],
        z = topo.z[v];
      const y = ring.d === 0 ? slabH(x, z) : model.height(x, z);
      h[v] = y;
      if (!land) continue;
      landVerts++;
      if (ring.d === 0 || y < WL - 6) {
        // seam / deep water: no canopy; cover from the model where cheap
        cover[v * 8 + 1] = 0;
        cover[v * 8 + 5] = ring.d === 0 ? 1 : 0;
        cover[v * 8 + 6] = 1;
        continue;
      }
      model.cover(x, z, c);
      const k = v * 8;
      cover[k] = c.forest;
      cover[k + 1] = c.field;
      cover[k + 2] = c.sand;
      cover[k + 3] = c.rock;
      cover[k + 4] = c.wet;
      cover[k + 5] = c.meadow;
      cover[k + 6] = 1 - smooth(4, 30, ring.d); // seam zone
      // canopy: closed forest far from the slab becomes part of the terrain surface
      const cw = smooth(CANOPY_NEAR, CANOPY_FULL, ring.d) * smooth(0.3, 0.8, c.forest);
      if (cw > 0) {
        const ch = (9 + 5 * vnoise(x / 37, z / 37, 61) + 3 * vnoise(x / 11, z / 11, 62)) * cw;
        canopy[v] = ch;
        cover[k + 7] = cw;
      }
    }
  }
  return { h, canopy, cover, landVerts, ms: performance.now() - t0 };
}

export function buildLandGeometry(topo: RingTopology, H: LandHeights, landMaxD: number, slabNormal: (x: number, z: number, out: number[]) => void): THREE.BufferGeometry {
  // vertices of the land rings only (they come first in the topology)
  let nv = 0,
    lastRing = 0;
  for (let k = 0; k < topo.rings.length; k++) {
    if (topo.rings[k].d > landMaxD) break;
    lastRing = k;
    nv = topo.rings[k].start + topo.rings[k].n;
  }
  const pos = new Float32Array(nv * 3);
  const cov = new Float32Array(nv * 4);
  const cov2 = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    pos[v * 3] = topo.x[v];
    pos[v * 3 + 1] = H.h[v] + H.canopy[v];
    pos[v * 3 + 2] = topo.z[v];
    for (let q = 0; q < 4; q++) {
      cov[v * 4 + q] = H.cover[v * 8 + q];
      cov2[v * 4 + q] = H.cover[v * 8 + 4 + q];
    }
  }
  const triEnd = topo.triStart[lastRing];
  const idx = topo.tris.subarray(0, triEnd * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCov', new THREE.BufferAttribute(cov, 4));
  geo.setAttribute('aCov2', new THREE.BufferAttribute(cov2, 4));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeVertexNormals();
  // the seam ring takes the slab ground's own normals (same formula as terrain/ground.ts)
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const tmp = [0, 1, 0];
  const r0 = topo.rings[0];
  for (let i = 0; i < r0.n; i++) {
    const v = r0.start + i;
    slabNormal(topo.x[v], topo.z[v], tmp);
    nor.setXYZ(v, tmp[0], tmp[1], tmp[2]);
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
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
