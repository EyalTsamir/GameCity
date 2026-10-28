// CPU bake of the water "field" used by the water shader and the waveHeight service:
//   R = signed depth below the local water level (m; negative = dry ground above water)
//   G = distance to the nearest shore (m)
//   B = beachness (1 = gentle sloping shore -> breaking wave lines, 0 = walls / steep banks)
//   A = region (0 sea, 0.5 river, 1 pond)
// at 0.5 m resolution over the slab (half-float RGBA texture, linear filtering).

import * as THREE from 'three';
import { SLAB, WATER_LEVEL, RIVER } from '../../core/constants';
import { smoothstep } from '../../core/geom';
import type { TerrainModel } from '../terrain/height';
import { GROUND_DROP, RIVER_WALL_END_X } from '../terrain/height';

export interface WaterField {
  res: number;
  w: number;
  h: number;
  depth: Float32Array;
  shore: Float32Array;
  beach: Float32Array;
  region: Float32Array;
  tex: THREE.DataTexture;
  bakeMs: number;
  /** bilinear sample of one of the arrays at world (x, z) */
  sample(arr: Float32Array, x: number, z: number): number;
  /** local swell amplitude factor (0 on land/very shallow, 1 open sea, ~0.3 river, ~0.12 pond) */
  ampAt(x: number, z: number): number;
}

export const REGION_AMP = { sea: 1, river: 0.3, pond: 0.12 } as const;

export function regionAmp(region: number): number {
  if (region < 0.5) return REGION_AMP.sea + (REGION_AMP.river - REGION_AMP.sea) * (region / 0.5);
  return REGION_AMP.river + (REGION_AMP.pond - REGION_AMP.river) * ((region - 0.5) / 0.5);
}

export function ampFrom(depth: number, region: number): number {
  return regionAmp(region) * smoothstep(0.08, 1.8, depth);
}

const cache = new WeakMap<TerrainModel, WaterField>();

export function getWaterField(model: TerrainModel): WaterField {
  let f = cache.get(model);
  if (!f) {
    f = bake(model);
    cache.set(model, f);
  }
  return f;
}

function bake(model: TerrainModel): WaterField {
  const t0 = performance.now();
  const res = 0.5;
  const W = Math.round((SLAB.x1 - SLAB.x0) / res);
  const H = Math.round((SLAB.z1 - SLAB.z0) / res);
  const N = W * H;
  const depth = new Float32Array(N).fill(-1);
  const region = new Float32Array(N);
  const shore = new Float32Array(N);
  const beach = new Float32Array(N);
  const pond = model.pond;
  const rects: [number, number, number, number, 'sea' | 'river' | 'pond'][] = [
    [108, SLAB.z0, SLAB.x1, SLAB.z1, 'sea'],
    [SLAB.x0, RIVER.z0 - 3, 108, RIVER.z1 + 3, 'river'],
  ];
  if (pond) rects.push([pond.cx - pond.rx * 1.3, pond.cz - pond.rz * 1.3, pond.cx + pond.rx * 1.3, pond.cz + pond.rz * 1.3, 'pond']);
  for (const [x0, z0, x1, z1, kind] of rects) {
    const i0 = Math.max(0, Math.floor((x0 - SLAB.x0) / res)),
      i1 = Math.min(W - 1, Math.ceil((x1 - SLAB.x0) / res));
    const j0 = Math.max(0, Math.floor((z0 - SLAB.z0) / res)),
      j1 = Math.min(H - 1, Math.ceil((z1 - SLAB.z0) / res));
    for (let j = j0; j <= j1; j++) {
      const z = SLAB.z0 + (j + 0.5) * res;
      for (let i = i0; i <= i1; i++) {
        const x = SLAB.x0 + (i + 0.5) * res;
        const k = j * W + i;
        const level = kind === 'pond' ? pond!.level : WATER_LEVEL;
        const d = level - (model.height(x, z) + GROUND_DROP);
        if (kind === 'pond') {
          const ex = (x - pond!.cx) / pond!.rx,
            ez = (z - pond!.cz) / pond!.rz;
          if (ex * ex + ez * ez > 1.6) continue;
          depth[k] = d;
          region[k] = 1;
        } else {
          depth[k] = Math.max(depth[k], d);
          let r = 0;
          const dz = Math.abs(z - (RIVER.z0 + RIVER.z1) / 2),
            hz = (RIVER.z1 - RIVER.z0) / 2 + 3;
          if (x < RIVER_WALL_END_X) r = dz < hz ? 0.5 : 0;
          else {
            // past the walls the river water spreads into the sea as a widening plume, soft on every side
            // (a hard cut in z drew a straight dark band through the surf)
            const t = x - RIVER_WALL_END_X;
            r = 0.5 * (1 - smoothstep(RIVER_WALL_END_X, 152, x)) * (1 - smoothstep(hz - 1 + t * 0.2, hz + 2 + t * 0.8, dz));
          }
          region[k] = r;
        }
      }
    }
  }
  // shore distance: two-pass chamfer transform (wet cells -> distance to nearest dry cell),
  // carrying the bed slope found at that nearest shore (-> beachness)
  const INF = 1e6;
  const D = shore;
  for (let k = 0; k < N; k++) {
    D[k] = depth[k] > 0 ? INF : 0;
    beach[k] = 0;
  }
  // seed: dry cells bordering water get the local bed slope across the waterline
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      if (depth[k] > 0) continue;
      const nb = [k - 1, k + 1, k - W, k + W];
      let wet = false,
        maxd = depth[k];
      for (const q of nb)
        if (depth[q] > 0) {
          wet = true;
          maxd = Math.max(maxd, depth[q]);
        }
      if (!wet) continue;
      // slope estimate over 2 cells into the water
      let deeper = maxd;
      for (const q of [k - 2, k + 2, k - 2 * W, k + 2 * W]) if (q >= 0 && q < N) deeper = Math.max(deeper, depth[q]);
      const slope = (deeper - depth[k]) / (2 * res);
      beach[k] = region[k] > 0.75 ? 0 : 1 - smoothstep(0.18, 0.55, slope);
    }
  }
  const S2 = Math.SQRT2;
  const relax = (k: number, q: number, w: number) => {
    const v = D[q] + w;
    if (v < D[k]) {
      D[k] = v;
      beach[k] = beach[q];
    }
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (D[k] === 0) continue;
      if (i > 0) relax(k, k - 1, 1);
      if (j > 0) {
        relax(k, k - W, 1);
        if (i > 0) relax(k, k - W - 1, S2);
        if (i < W - 1) relax(k, k - W + 1, S2);
      }
    }
  }
  for (let j = H - 1; j >= 0; j--) {
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i;
      if (D[k] === 0) continue;
      if (i < W - 1) relax(k, k + 1, 1);
      if (j < H - 1) {
        relax(k, k + W, 1);
        if (i < W - 1) relax(k, k + W + 1, S2);
        if (i > 0) relax(k, k + W - 1, S2);
      }
    }
  }
  for (let k = 0; k < N; k++) {
    D[k] = Math.min(D[k], 80) * res;
    if (depth[k] <= 0) beach[k] = 0;
  }
  // texture
  const data = new Uint16Array(N * 4);
  const toH = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < N; k++) {
    data[k * 4] = toH(Math.max(-2, depth[k]));
    data[k * 4 + 1] = toH(D[k]);
    data[k * 4 + 2] = toH(beach[k]);
    data[k * 4 + 3] = toH(region[k]);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;

  const sample = (arr: Float32Array, x: number, z: number): number => {
    const fx = (x - SLAB.x0) / res - 0.5,
      fz = (z - SLAB.z0) / res - 0.5;
    const i = Math.max(0, Math.min(W - 2, Math.floor(fx))),
      j = Math.max(0, Math.min(H - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)),
      v = Math.max(0, Math.min(1, fz - j));
    const k = j * W + i;
    const a = arr[k] + (arr[k + 1] - arr[k]) * u;
    const b = arr[k + W] + (arr[k + W + 1] - arr[k + W]) * u;
    return a + (b - a) * v;
  };
  const ampAt = (x: number, z: number): number => ampFrom(sample(depth, x, z), sample(region, x, z));
  return { res, w: W, h: H, depth, shore: D, beach, region, tex, bakeMs: performance.now() - t0, sample, ampAt };
}
