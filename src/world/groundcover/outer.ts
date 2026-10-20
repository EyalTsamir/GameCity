// Cover maps for a band of the landscape AROUND the slab (world mode): the blade rings reach up to
// ~70 m from the camera, so a camera near the slab edge sees meadows, reed banks and dunes of the
// world agent's landscape (ctx.services.landscape) carry on in blades, not just in its land shader.
//
// Same encodings as mask.ts (tCover RGBA8, tFlower RGBA8, tGH R32F) at 0.5 m (cover, height) and
// 1 m (flowers) over the rect SLAB ± OUTER_M. Texels inside the slab stay empty (the slab maps rule
// there). Landscape cover is sampled on a 2 m lattice and height on a 1 m lattice (boot cost).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB } from '../../core/constants';
import { fbm, vnoise } from '../terrain/noise';
import { GROUND_DROP } from '../terrain/height';
import { GRID_PAD } from './mask';

export const OUTER_M = GRID_PAD;

interface LandCover {
  water: number;
  sand: number;
  rock: number;
  forest: number;
  field: number;
  meadow: number;
  wet: number;
}
interface LandscapeLike {
  active: boolean;
  height(x: number, z: number): number;
  cover(x: number, z: number, out?: LandCover): LandCover;
}

export interface OuterMaps {
  x0: number;
  z0: number;
  res: number;
  w: number;
  h: number;
  fres: number;
  fw: number;
  fh: number;
  cover: Uint8Array;
  flower: Uint8Array;
  height: Float32Array;
  texCover: THREE.DataTexture;
  texFlower: THREE.DataTexture;
  texHeight: THREE.DataTexture;
  /** wall time from start to finish (spread over frames) */
  buildMs: number;
  cells: number;
  workMs: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Incremental builder (a generator that yields every few rows) so the band never delays the boot: the
 * module drives it from frame() with a small time budget; the result arrives a second or two later
 * (the band is only seen from near the slab edge).
 */
export function outerMapsBuilder(ctx: CityContext): Generator<void, OuterMaps | null, void> | null {
  const land = ctx.services.landscape as LandscapeLike | undefined;
  if (!land || !land.active) return null;
  return build(land);
}

function* build(land: LandscapeLike): Generator<void, OuterMaps | null, void> {
  const t0 = performance.now();
  const x0 = SLAB.x0 - OUTER_M,
    z0 = SLAB.z0 - OUTER_M;
  const W = SLAB.x1 - SLAB.x0 + 2 * OUTER_M,
    D = SLAB.z1 - SLAB.z0 + 2 * OUTER_M;
  const res = 0.5,
    fres = 1;
  const w = Math.round(W / res),
    h = Math.round(D / res);
  const fw = Math.round(W / fres),
    fh = Math.round(D / fres);
  const inSlab = (x: number, z: number, pad: number) => x > SLAB.x0 + pad && x < SLAB.x1 - pad && z > SLAB.z0 + pad && z < SLAB.z1 - pad;

  // ── landscape cover on a 2 m lattice (7 channels), height on a 1 m lattice
  const CG = 2;
  const cw = Math.round(W / CG) + 1,
    ch = Math.round(D / CG) + 1;
  const cov = new Float32Array(cw * ch * 7);
  const tmp: LandCover = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
  for (let j = 0; j < ch; j++) {
    yield;
    for (let i = 0; i < cw; i++) {
      const x = x0 + i * CG,
        z = z0 + j * CG;
      if (inSlab(x, z, 3)) continue;
      land.cover(x, z, tmp);
      const o = (j * cw + i) * 7;
      cov[o] = tmp.water;
      cov[o + 1] = tmp.sand;
      cov[o + 2] = tmp.rock;
      cov[o + 3] = tmp.forest;
      cov[o + 4] = tmp.field;
      cov[o + 5] = tmp.meadow;
      cov[o + 6] = tmp.wet;
    }
  }
  const HG = 2;
  const hw = Math.round(W / HG) + 1,
    hh = Math.round(D / HG) + 1;
  const lat = new Float32Array(hw * hh);
  for (let j = 0; j < hh; j++) {
    yield;
    for (let i = 0; i < hw; i++) {
    const x = x0 + i * HG,
      z = z0 + j * HG;
    lat[j * hw + i] = inSlab(x, z, 3) ? 0 : land.height(x, z);
    }
  }
  const cs = new Float32Array(7);
  const coverAt = (x: number, z: number) => {
    const fx = Math.min(cw - 1.001, Math.max(0, (x - x0) / CG)),
      fz = Math.min(ch - 1.001, Math.max(0, (z - z0) / CG));
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const tx = fx - i,
      tz = fz - j;
    const a = (j * cw + i) * 7,
      b = a + 7,
      c = a + cw * 7,
      d = c + 7;
    for (let k = 0; k < 7; k++) cs[k] = (cov[a + k] + (cov[b + k] - cov[a + k]) * tx) * (1 - tz) + (cov[c + k] + (cov[d + k] - cov[c + k]) * tx) * tz;
    return cs;
  };
  const heightAt = (x: number, z: number) => {
    const fx = Math.min(hw - 1.001, Math.max(0, (x - x0) / HG)),
      fz = Math.min(hh - 1.001, Math.max(0, (z - z0) / HG));
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const tx = fx - i,
      tz = fz - j;
    const a = lat[j * hw + i],
      b = lat[j * hw + i + 1],
      c = lat[(j + 1) * hw + i],
      d = lat[(j + 1) * hw + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };

  // ── per texel
  const cover = new Uint8Array(w * h * 4);
  const height = new Float32Array(w * h);
  let cells = 0;
  for (let j = 0; j < h; j++) {
    if ((j & 3) === 0) yield;
    const z = z0 + (j + 0.5) * res;
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * res;
      if (inSlab(x, z, -0.01)) continue;
      const p = j * w + i,
        q = p * 4;
      const c = coverAt(x, z);
      height[p] = heightAt(x, z) + GROUND_DROP;
      if (c[0] > 0.5) continue; // water
      const forest = c[3],
        rock = c[2],
        sand = c[1],
        meadow = c[5],
        wet = c[6],
        field = c[4];
      // meadow + field margins (the outer 4–6 m of a field is a grassy headland), thinned under forest
      const tuft = 0.75 + 0.25 * vnoise(x * 0.7, z * 0.7, 91);
      let dens = (meadow * 0.78 + field * 0.12) * (1 - forest * 0.92) * (1 - rock) * tuft;
      let len = 0.62 + 0.3 * smooth(0.35, 0.75, fbm(x * 0.05, z * 0.05, 92));
      let hab = 0;
      if (wet > 0.15) {
        const stand = smooth(0.4, 0.6, fbm(x * 0.11, z * 0.11, 41));
        const sv = wet * (0.08 + 0.92 * stand);
        hab = Math.round(1 + clamp01(sv) * 99);
        dens = Math.max(dens, sv * 0.85);
        len = Math.max(len, 0.75);
      }
      // dunes: the landscape's "half sand" belt behind the beach carries marram tussocks
      const dune = smooth(0.25, 0.4, sand) * (1 - smooth(0.62, 0.8, sand));
      if (dune > 0.05) {
        const tuftD = smooth(0.45, 0.7, fbm(x * 0.35, z * 0.35, 77));
        const dv = dune * tuftD;
        if (dv > 0.05) {
          hab = Math.round(150 + clamp01(dv) * 105);
          dens = Math.max(dens, dv * 0.55);
          len = Math.max(len, 0.62);
        }
      }
      if (dens < 0.02) continue;
      cells++;
      cover[q] = Math.round(clamp01(dens) * 255);
      cover[q + 1] = Math.round(clamp01(len) * 255);
      cover[q + 2] = hab;
    }
  }
  // ── flowers (1 m): same species fields as the slab (mask.ts) → patches continue across the edge
  const flower = new Uint8Array(fw * fh * 4);
  const fs = new Float32Array(6);
  for (let j = 0; j < fh; j++) {
    if ((j & 1) === 0) yield;
    const z = z0 + (j + 0.5) * fres;
    for (let i = 0; i < fw; i++) {
      const x = x0 + (i + 0.5) * fres;
      const q = (j * fw + i) * 4;
      flower[q + 3] = 128;
      if (inSlab(x, z, -0.01)) continue;
      const ci = Math.min(w - 1, Math.floor((x - x0) / res)),
        cj = Math.min(h - 1, Math.floor((z - z0) / res));
      const cq = (cj * w + ci) * 4;
      if (cover[cq] < 8) continue;
      fs[0] = fbm(x * 0.045, z * 0.045, 101);
      fs[1] = fbm(x * 0.06, z * 0.06, 202) * 0.96;
      fs[2] = fbm(x * 0.03, z * 0.03, 303) * 1.04;
      fs[3] = fbm(x * 0.05, z * 0.05, 404);
      fs[4] = fbm(x * 0.07, z * 0.07, 505) * 0.94;
      fs[5] = fbm(x * 0.055, z * 0.055, 606) * 0.92;
      let best = 0;
      for (let s = 1; s < 6; s++) if (fs[s] > fs[best]) best = s;
      const hb = cover[cq + 2];
      if (hb > 0 && hb <= 100) best = 5;
      const meadowF = smooth(0.42, 0.62, cover[cq + 1] / 255) * smooth(0.15, 0.5, cover[cq] / 255) * (hb >= 150 ? 0 : 1);
      flower[q] = Math.round(clamp01(smooth(0.5, 0.72, fs[best]) * meadowF) * 255);
      flower[q + 1] = Math.round(((best + 0.5) / 6) * 255);
    }
  }
  const mk = (data: Uint8Array, tw: number, th: number) => {
    const t = new THREE.DataTexture(data, tw, th, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  };
  const texHeight = new THREE.DataTexture(height, w, h, THREE.RedFormat, THREE.FloatType);
  texHeight.flipY = false;
  texHeight.magFilter = THREE.NearestFilter;
  texHeight.minFilter = THREE.NearestFilter;
  texHeight.generateMipmaps = false;
  texHeight.needsUpdate = true;
  return {
    x0,
    z0,
    res,
    w,
    h,
    fres,
    fw,
    fh,
    cover,
    flower,
    height,
    texCover: mk(cover, w, h),
    texFlower: mk(flower, fw, fh),
    texHeight,
    buildMs: performance.now() - t0,
    cells,
    workMs: 0,
  };
}
