// Roaming cover window: blades beyond the slab, wherever the camera goes (world mode).
//
// The blade rings reach ~66 m from the camera, so outside the slab they need cover / flower / height maps
// of the landscape around the camera. A 224 m square window (0.5 m texels, flowers 1 m) follows the
// camera: when the camera strays > REBUILD m from the window centre, the next window is built in the
// background from ctx.services.landscape (cover on a 2 m lattice, height on the same lattice) by a
// generator the module steps with a small per-frame time budget, into the second of two buffer sets
// (double-buffered: the active window keeps drawing meanwhile, no hitch, no per-frame allocation).
// Texels inside the slab stay empty (the slab maps rule there). Same encodings as mask.ts.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB } from '../../core/constants';
import { fbm, vnoise } from '../terrain/noise';
import { GROUND_DROP } from '../terrain/height';
import { RING_TILE, type TileGrid } from './mask';
import { natureOn } from '../../core/nature';

/** half size of the window (m); centre snapped to SNAP so tiles stay on the global 8 m lattice */
export const WIN_HALF = 112;
const SNAP = 32;
/** camera distance from the window centre that triggers the next window */
const REBUILD = 24;
const RES = 0.5;
const FRES = 1;
const N = Math.round((2 * WIN_HALF) / RES); // 448
const FN = Math.round((2 * WIN_HALF) / FRES); // 224
const CG = 2; // landscape lattice
const CN = Math.round((2 * WIN_HALF) / CG) + 1; // 113

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
  /** crop code at a field point (kind · 2 + row axis), −1 off the crop (fields.ts) */
  cropAt?(x: number, z: number): number;
}

/** one window's maps (the shader reads them as tCoverO / tFlowerO / tGHO) */
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
  /** tile metadata of the window for the ring walker (same layout as the slab's) */
  grids: TileGrid[];
  cells: number;
  /** CPU time of the last build (ms, spread over frames) */
  workMs: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function makeSet(): OuterMaps {
  const cover = new Uint8Array(N * N * 4);
  const flower = new Uint8Array(FN * FN * 4);
  const height = new Float32Array(N * N);
  const mk = (data: Uint8Array, n: number) => {
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  };
  const texHeight = new THREE.DataTexture(height, N, N, THREE.RedFormat, THREE.FloatType);
  texHeight.flipY = false;
  texHeight.magFilter = THREE.NearestFilter;
  texHeight.minFilter = THREE.NearestFilter;
  texHeight.generateMipmaps = false;
  const grids: TileGrid[] = RING_TILE.map((size) => {
    const n = Math.round((2 * WIN_HALF) / size);
    return { x0: 0, z0: 0, size, nx: n, nz: n, flags: new Uint8Array(n * n), ymin: new Float32Array(n * n), ymax: new Float32Array(n * n) };
  });
  return { x0: 0, z0: 0, res: RES, w: N, h: N, fres: FRES, fw: FN, fh: FN, cover, flower, height, texCover: mk(cover, N), texFlower: mk(flower, FN), texHeight, grids, cells: 0, workMs: 0 };
}

export interface CoverWindow {
  /** step the background build (call once per frame); returns the window that just became active */
  update(camX: number, camZ: number, budgetMs: number): OuterMaps | null;
  active(): OuterMaps | null;
  builds(): number;
}

export function createCoverWindow(ctx: CityContext): CoverWindow | null {
  const svc = ctx.services.landscape as LandscapeLike | undefined;
  if (!svc || !svc.active) return null;
  const land: LandscapeLike = svc;
  const sets = [makeSet(), makeSet()];
  let active: OuterMaps | null = null;
  let building: Generator<void, void, void> | null = null;
  let target: OuterMaps | null = null;
  let tcx = 0,
    tcz = 0;
  let work = 0;
  let builds = 0;
  // scratch (allocated once)
  const cov = new Float32Array(CN * CN * 7);
  const lat = new Float32Array(CN * CN);
  const spIdx = new Uint8Array(CN * CN);
  const spDen = new Float32Array(CN * CN);
  const tmp: LandCover = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
  const fs = new Float32Array(6);
  const cs = new Float32Array(7);
  const cropC = new Int8Array(FN * FN);
  const cropOn = !!land.cropAt && natureOn('cropblades');

  const inSlab = (x: number, z: number, pad: number) => x > SLAB.x0 + pad && x < SLAB.x1 - pad && z > SLAB.z0 + pad && z < SLAB.z1 - pad;

  function* build(o: OuterMaps, cx: number, cz: number): Generator<void, void, void> {
    const x0 = cx - WIN_HALF,
      z0 = cz - WIN_HALF;
    o.x0 = x0;
    o.z0 = z0;
    // ── landscape lattice: cover (7 channels), height, flower species
    for (let j = 0; j < CN; j++) {
      yield;
      for (let i = 0; i < CN; i++) {
        const x = x0 + i * CG,
          z = z0 + j * CG;
        const k = j * CN + i;
        const o7 = k * 7;
        if (inSlab(x, z, 3)) {
          cov.fill(0, o7, o7 + 7);
          cov[o7] = 1; // treat as "water": nothing grows (the slab maps rule there)
          lat[k] = 0;
          continue;
        }
        land.cover(x, z, tmp);
        cov[o7] = tmp.water;
        cov[o7 + 1] = tmp.sand;
        cov[o7 + 2] = tmp.rock;
        cov[o7 + 3] = tmp.forest;
        cov[o7 + 4] = tmp.field;
        cov[o7 + 5] = tmp.meadow;
        cov[o7 + 6] = tmp.wet;
        lat[k] = land.height(x, z);
        // flower species: the same fields as the slab (mask.ts) → patches continue across the edge
        fs[0] = fbm(x * 0.045, z * 0.045, 101);
        fs[1] = fbm(x * 0.06, z * 0.06, 202) * 0.96;
        fs[2] = fbm(x * 0.03, z * 0.03, 303) * 1.04;
        fs[3] = fbm(x * 0.05, z * 0.05, 404);
        fs[4] = fbm(x * 0.07, z * 0.07, 505) * 0.94;
        fs[5] = fbm(x * 0.055, z * 0.055, 606) * 0.92;
        let best = 0;
        for (let s = 1; s < 6; s++) if (fs[s] > fs[best]) best = s;
        spIdx[k] = best;
        spDen[k] = smooth(0.44, 0.68, fs[best]);
      }
    }
    const lerpAt = (x: number, z: number) => {
      const fx = Math.min(CN - 1.001, Math.max(0, (x - x0) / CG)),
        fz = Math.min(CN - 1.001, Math.max(0, (z - z0) / CG));
      const i = Math.floor(fx),
        j = Math.floor(fz);
      const tx = fx - i,
        tz = fz - j;
      const a = j * CN + i,
        b = a + 1,
        c = a + CN,
        d = c + 1;
      for (let k = 0; k < 7; k++) cs[k] = (cov[a * 7 + k] + (cov[b * 7 + k] - cov[a * 7 + k]) * tx) * (1 - tz) + (cov[c * 7 + k] + (cov[d * 7 + k] - cov[c * 7 + k]) * tx) * tz;
      return (lat[a] + (lat[b] - lat[a]) * tx) * (1 - tz) + (lat[c] + (lat[d] - lat[c]) * tx) * tz;
    };
    // ── what grows on the fields here (1 m lattice; the plot's own crop, the same parcels as the land shader)
    if (cropOn) {
      for (let j = 0; j < FN; j++) {
        if ((j & 7) === 0) yield;
        const z = z0 + (j + 0.5) * FRES;
        for (let i = 0; i < FN; i++) cropC[j * FN + i] = inSlab(x0 + (i + 0.5) * FRES, z, -0.01) ? -1 : land.cropAt!(x0 + (i + 0.5) * FRES, z);
      }
    }
    // ── texels
    const { cover, height } = o;
    cover.fill(0);
    let cells = 0;
    for (let j = 0; j < N; j++) {
      if ((j & 3) === 0) yield;
      const z = z0 + (j + 0.5) * RES;
      for (let i = 0; i < N; i++) {
        const x = x0 + (i + 0.5) * RES;
        const p = j * N + i,
          q = p * 4;
        if (inSlab(x, z, -0.01)) {
          height[p] = 0;
          continue;
        }
        height[p] = lerpAt(x, z) + GROUND_DROP;
        if (cs[0] > 0.5) continue; // water
        const sand = cs[1],
          rock = cs[2],
          forest = cs[3],
          field = cs[4],
          meadow = cs[5],
          wet = cs[6];
        // meadow + grassy field headlands, thinned under forest
        const tuft = 0.75 + 0.25 * vnoise(x * 0.7, z * 0.7, 91);
        let dens = (meadow * 0.78 + field * (cropOn ? 0.78 : 0.12)) * (1 - forest * 0.92) * (1 - rock) * tuft;
        let len = 0.62 + 0.3 * smooth(0.35, 0.75, fbm(x * 0.05, z * 0.05, 92));
        let hab = 0;
        const crop = cropOn && forest < 0.5 && sand < 0.5 ? cropC[(j >> 1) * FN + (i >> 1)] : -1;
        if (crop >= 0) {
          const ck = crop >> 1,
            ax = crop & 1;
          if (ck === 0) {
            // standing wheat: dense to the headland
            dens = 0.92 * (0.85 + 0.15 * tuft);
            len = 0.9;
            hab = 101 + ax;
          } else if (ck === 1) {
            dens = 0.72 * tuft;
            len = 0.28;
            hab = 103 + ax;
          } else if (ck === 2) {
            dens = 0.8;
            len = 0.3;
            hab = 105 + ax;
          } else if (ck === 4) {
            dens = 0.7 * tuft;
            len = 0.26;
            hab = 111 + ax;
          } else if (ck === 9) {
            dens = 0.85;
            len = 0.3;
            hab = 117 + ax;
          } else if (ck === 5) {
            dens = 0.04;
            len = 0.3;
          } else if (ck === 3 || ck === 8) {
            // grazed or mown: a short dense sward
            dens = 0.88 * tuft;
            len = ck === 3 ? 0.27 + 0.16 * smooth(0.5, 0.75, fbm(x * 0.09, z * 0.09, 93)) : 0.26;
          } else if (ck === 12 || ck === 10 || ck === 7) {
            // the alleys between rows: thin, worn grass
            dens = 0.3 * tuft;
            len = 0.27;
          }
          // (fallow keeps the long meadow)
        }
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
          const dv = dune * smooth(0.45, 0.7, fbm(x * 0.35, z * 0.35, 77));
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
    // ── flowers (1 m)
    const { flower } = o;
    for (let j = 0; j < FN; j++) {
      if ((j & 3) === 0) yield;
      const z = z0 + (j + 0.5) * FRES;
      for (let i = 0; i < FN; i++) {
        const x = x0 + (i + 0.5) * FRES;
        const q = (j * FN + i) * 4;
        flower[q] = 0;
        flower[q + 1] = 0;
        flower[q + 2] = 0;
        flower[q + 3] = 128;
        const cq = (Math.min(N - 1, j * 2) * N + Math.min(N - 1, i * 2)) * 4;
        if (cover[cq] < 8) continue;
        const k = Math.round((z - z0) / CG) * CN + Math.round((x - x0) / CG);
        const hb = cover[cq + 2];
        const best = hb > 0 && hb <= 100 ? 5 : spIdx[k];
        // (poppies among the wheat, not a meadow of them)
        const meadowF = smooth(0.42, 0.62, cover[cq + 1] / 255) * smooth(0.15, 0.5, cover[cq] / 255) * (hb >= 150 ? 0 : hb > 100 && hb < 120 ? 0.12 : 1);
        flower[q] = Math.round(clamp01(spDen[k] * meadowF) * 255);
        flower[q + 1] = Math.round(((best + 0.5) / 6) * 255);
      }
    }
    // ── tile metadata
    for (const g of o.grids) {
      g.x0 = x0;
      g.z0 = z0;
      g.flags.fill(0);
      g.ymin.fill(1e9);
      g.ymax.fill(-1e9);
    }
    for (let j = 0; j < N; j++) {
      if ((j & 15) === 0) yield;
      const z = z0 + (j + 0.5) * RES;
      for (let i = 0; i < N; i++) {
        const p = j * N + i,
          q = p * 4;
        if (cover[q] < 6) continue;
        const x = x0 + (i + 0.5) * RES;
        const fl = 1 | (cover[q + 1] > 70 || cover[q + 2] > 0 ? 2 | 4 : 0);
        const y = height[p];
        for (const g of o.grids) {
          const t = Math.floor((z - z0) / g.size) * g.nx + Math.floor((x - x0) / g.size);
          g.flags[t] |= fl;
          if (y < g.ymin[t]) g.ymin[t] = y;
          if (y > g.ymax[t]) g.ymax[t] = y;
        }
      }
    }
    o.cells = cells;
    o.texCover.needsUpdate = true;
    o.texFlower.needsUpdate = true;
    o.texHeight.needsUpdate = true;
  }

  return {
    update(camX: number, camZ: number, budgetMs: number): OuterMaps | null {
      if (!building) {
        const cx = Math.round(camX / SNAP) * SNAP,
          cz = Math.round(camZ / SNAP) * SNAP;
        const need = !active || Math.max(Math.abs(camX - (active.x0 + WIN_HALF)), Math.abs(camZ - (active.z0 + WIN_HALF))) > REBUILD;
        // a window that would be entirely inside the slab is useless
        const useful = !inSlab(cx - WIN_HALF, cz - WIN_HALF, -1) || !inSlab(cx + WIN_HALF, cz + WIN_HALF, -1);
        if (!need || !useful || (active && cx === active.x0 + WIN_HALF && cz === active.z0 + WIN_HALF)) return null;
        target = active === sets[0] ? sets[1] : sets[0];
        tcx = cx;
        tcz = cz;
        building = build(target, tcx, tcz);
        work = 0;
      }
      const t0 = performance.now();
      let r = building.next();
      while (!r.done && performance.now() - t0 < budgetMs) r = building.next();
      work += performance.now() - t0;
      if (!r.done) return null;
      building = null;
      active = target;
      if (active) active.workMs = work;
      builds++;
      return active;
    },
    active: () => active,
    builds: () => builds,
  };
}
