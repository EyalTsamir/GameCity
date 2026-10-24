// Ground-cover maps, baked once at boot from the plan, the props layout, the trees and the ground mask.
// They drive the blade field (vertex shader, texelFetch = nearest) and the ground shader (filtered).
//
// tCover   RGBA8, 0.25 m over the slab (CW × CH)
//   R density   where grass grows (0 none … 1 full): lawns, verges, meadows, unmown edges, pavement weeds
//   G length    0 mown lawn (5–9 cm) · ~0.3 rough / unmown tuft · ~0.65 meadow · 1 tall meadow
//   B habitat   0 normal · 1..100 wet shore (reeds, cattails, shore grass; value = strength) ·
//               120 pavement weed (leafy rosettes, dandelions) · 150..255 dune (marram; (v − 150) / 105)
//   A litter    fallen leaves under trees (also on paving)
// tFlower  RGBA8, 0.5 m (FW × FH)
//   R wildflower density (meadows) · G species band (see SPECIES) · B lawn flowers (daisy, dandelion,
//   clover heads) · A lawn tone (0.5 neutral: mowing stripes ±, darker edges −) copied from the ground mask
// tGH      R32F, 0.25 m: surface height where blades root (ground + GROUND_DROP; sidewalk tops)
//
// Shapes are drawn with a typed-array rasteriser (groundcover/raster.ts) — a 2D canvas with filters and
// getImageData round trips cost tens of seconds here. Deterministic, no per-frame work.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB, CORRIDOR_HALF, ROAD_HALF, RAIL_Z, SIDEWALK_Y } from '../../core/constants';
import { OCC } from '../../core/occupancy';
import { getLayout } from '../props/layout';
import { getTerrainModel, GROUND_DROP } from '../terrain/height';
import { noiseTexture, fbm, vnoise } from '../terrain/noise';
import { groundMaskInfo } from '../terrain/ground';
import { Raster } from './raster';

export const CRES = 0.25;
export const CW = Math.round((SLAB.x1 - SLAB.x0) / CRES); // 1600
export const CH = Math.round((SLAB.z1 - SLAB.z0) / CRES); // 1360
export const FRES = 0.5;
export const FW = Math.round((SLAB.x1 - SLAB.x0) / FRES); // 800
export const FH = Math.round((SLAB.z1 - SLAB.z0) / FRES); // 680

/** flower species bands in tFlower.G (value / 255 → band index = floor(v * 6)) */
export const SPECIES = ['poppy', 'cornflower', 'daisy', 'buttercup', 'cowparsley', 'knapweed'] as const;
export type Species = (typeof SPECIES)[number];

/** tile sizes of the three LOD rings (metres) */
export const RING_TILE = [2, 4, 8] as const;
/** tile grids sit on the global 8 m lattice (the roaming window's tiles coincide with the slab's) */
export const GRID_ALIGN = 8;

export interface TileGrid {
  /** world origin of tile (0, 0) — a multiple of GRID_ALIGN */
  x0: number;
  z0: number;
  size: number;
  nx: number;
  nz: number;
  /** per tile: bit 0 any blades · bit 1 long grass / edges / habitat · bit 2 flowers · bit 3 litter */
  flags: Uint8Array;
  /** per tile: min / max surface height (m) for frustum tests */
  ymin: Float32Array;
  ymax: Float32Array;
}

export interface FlowerPatch {
  x: number;
  z: number;
  /** radius (m) */
  r: number;
  /** 0..1 mean flower density */
  density: number;
  species: Species;
}

export interface CoverMaps {
  cover: Uint8Array;
  flower: Uint8Array;
  height: Float32Array;
  texCover: THREE.DataTexture;
  texFlower: THREE.DataTexture;
  texHeight: THREE.DataTexture;
  grids: TileGrid[];
  patches: FlowerPatch[];
  /** density at a world point (0..1), 0 outside the slab */
  densityAt(x: number, z: number): number;
  buildMs: number;
  /** boot cost per phase (ms) */
  phases: string;
  stats: { grassCells: number; meadowCells: number; wetCells: number; duneCells: number; weedCells: number; litterCells: number };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function hash2(i: number, j: number, s: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s + 7, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** bilinear RGBA sample (RepeatWrapping) of the shared 256² noise texture at texture uv → out[0..3] 0..1 */
function makeNoiseSampler(): (u: number, v: number, out: Float32Array) => void {
  const tex = noiseTexture();
  const d = tex.image.data as Uint8Array;
  const S = 256;
  return (u: number, v: number, out: Float32Array) => {
    const fx = u * S - 0.5,
      fy = v * S - 0.5;
    const ix = Math.floor(fx),
      iy = Math.floor(fy);
    const tx = fx - ix,
      ty = fy - iy;
    const x0 = ix & 255,
      y0 = iy & 255;
    const x1 = (x0 + 1) & 255,
      y1 = (y0 + 1) & 255;
    const a = (y0 * S + x0) * 4,
      b = (y0 * S + x1) * 4,
      e = (y1 * S + x0) * 4,
      f = (y1 * S + x1) * 4;
    for (let c = 0; c < 4; c++) out[c] = ((d[a + c] + (d[b + c] - d[a + c]) * tx) * (1 - ty) + (d[e + c] + (d[f + c] - d[e + c]) * tx) * ty) / 255;
  };
}

export function buildCoverMaps(ctx: CityContext): CoverMaps {
  const t0 = performance.now();
  let tp = t0;
  const phases: string[] = [];
  const mark = (name: string) => {
    const t = performance.now();
    phases.push(`${name} ${Math.round(t - tp)}`);
    tp = t;
  };
  const { plan } = ctx;
  const model = getTerrainModel(plan);
  const H = (ctx.services.terrain as { height?: (x: number, z: number) => number } | undefined)?.height ?? model.height;
  const layout = getLayout(ctx);
  const trees = ((ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined)?.trees ?? []).slice();
  const occ = ctx.occupancy;
  const noise = makeNoiseSampler();
  const R = () => new Raster(CW, CH, SLAB.x0, SLAB.z0, CRES);

  // ── 1. where grass may grow (255) ───────────────────────────────────────────────────────────
  const allow = new Raster(CW, CH, SLAB.x0, SLAB.z0, CRES, 255);
  for (const seg of plan.roadSegments) {
    const P = plan.roadNodes[seg.a],
      Q = plan.roadNodes[seg.b];
    const side = seg.sidewalks ? CORRIDOR_HALF : ROAD_HALF + 0.7;
    if (Math.abs(Q.x - P.x) > Math.abs(Q.z - P.z)) allow.rect(P.x, P.z - side, Q.x, P.z + side, 0);
    else allow.rect(P.x - side, P.z, P.x + side, Q.z, 0);
  }
  for (const n of plan.roadNodes) if (n.kind !== 'portal') allow.rect(n.x - CORRIDOR_HALF, n.z - CORRIDOR_HALF, n.x + CORRIDOR_HALF, n.z + CORRIDOR_HALF, 0);
  allow.rect(plan.rail.portalW - 4, RAIL_Z - 3.5, plan.rail.portalE + 4, RAIL_Z + 3.5, 0);
  // block interiors: top-most area surface wins (as roads/covers.ts draws them)
  for (const b of plan.blocks) if (b.surface !== 'grass') allow.rect(b.rect.x0, b.rect.z0, b.rect.x1, b.rect.z1, 0);
  const areas = plan.areas.slice().sort((p, q) => p.layer - q.layer || p.id - q.id);
  for (const a of areas) {
    const v = a.surface === 'grass' && a.kind !== 'pond' ? 255 : 0;
    if (a.ellipse) allow.ellipse(a.ellipse.cx, a.ellipse.cz, a.ellipse.rx, a.ellipse.rz, 0, v);
    else allow.rect(a.rect.x0, a.rect.z0, a.rect.x1, a.rect.z1, v);
  }
  for (const lot of plan.lots) {
    const f = lot.footprint;
    allow.rect(f.x0 - 0.12, f.z0 - 0.12, f.x1 + 0.12, f.z1 + 0.12, 0);
  }
  for (const p of plan.paths) allow.polyline(p.pts, p.width + (p.draw ? 0.12 : 0.3), 0);
  for (const f of plan.features) {
    if (f.kind === 'pondisland' || f.kind === 'umbrellas') continue;
    if (f.kind === 'sportscourt') {
      if (f.rect) allow.rect(f.rect.x0, f.rect.z0, f.rect.x1, f.rect.z1, 0);
      continue;
    }
    if (f.a && f.b) {
      allow.capsule(f.a.x, f.a.z, f.b.x, f.b.z, (Number(f.params?.width ?? 4) + 0.6) / 2, 0);
      continue;
    }
    if (f.rect) allow.rect(f.rect.x0 - 0.1, f.rect.z0 - 0.1, f.rect.x1 + 0.1, f.rect.z1 + 0.1, 0);
    if (f.radius > 0) allow.disc(f.x, f.z, f.radius + 0.12, 0);
    else if (f.kind === 'floodlight') allow.disc(f.x, f.z, 0.7, 0);
  }
  const soft = new Set(['pots', 'toys', 'washing', 'swing', 'trampoline', 'loungers', 'parasol', 'birdbath']);
  for (const gp of layout.gardens) {
    if (gp.patio) allow.rect(gp.patio.x0 - 0.05, gp.patio.z0 - 0.05, gp.patio.x1 + 0.05, gp.patio.z1 + 0.05, 0);
    for (const s of gp.stones) allow.disc(s.x, s.z, s.r + 0.03, 0);
    for (const it of gp.items) if (!soft.has(it.kind)) allow.rotRect(it.x, it.z, it.w + 0.16, it.d + 0.16, it.yaw, 0);
  }
  for (const p of layout.plots) allow.rect(p.rect.x0, p.rect.z0, p.rect.x1, p.rect.z1, 0);
  for (const b of layout.borders) allow.capsule(b.ax, b.az, b.bx, b.bz, b.style === 'hedge' ? 0.35 : b.style === 'wall' ? 0.23 : 0.05, 0);
  for (const p of model.portals) {
    // headwalls + approach cuts
    const c = p.cos,
      s = p.sin;
    const hw = p.halfW + 1,
      d0 = -p.thick - 1,
      d1 = 8;
    allow.poly(
      [
        [-hw, d0],
        [hw, d0],
        [hw, d1],
        [-hw, d1],
      ].map(([lx, lz]) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c] as [number, number]),
      0,
    );
  }
  mark('allow');

  // ── 2. unmown edge tufts (length boost): wall bases, fences, kerbs, tree bases, poles, features
  const edge = R();
  for (const lot of plan.lots) edge.rectStroke(lot.footprint.x0, lot.footprint.z0, lot.footprint.x1, lot.footprint.z1, 0.9, 120, 'max');
  for (const b of plan.blocks) edge.rectStroke(b.rect.x0, b.rect.z0, b.rect.x1, b.rect.z1, 0.55, 80, 'max');
  for (const b of layout.borders) edge.capsule(b.ax, b.az, b.bx, b.bz, b.style === 'hedge' ? 0.75 : 0.55, b.style === 'hedge' ? 110 : 150, 'max');
  for (const t of trees) edge.disc(t.x, t.z, 0.55 + Math.min(0.5, t.h * 0.03), 130, 'max');
  for (const l of layout.lamps) edge.disc(l.x, l.z, 0.42, 150, 'max');
  for (const f of plan.features) {
    if (f.radius <= 0 || f.radius > 8 || f.kind === 'pondisland') continue;
    edge.ellipse(f.x, f.z, f.radius + 0.8, f.radius + 0.8, 0, 100, 'max', (f.radius - 0.1) / (f.radius + 0.8));
  }
  for (const b of layout.benches) edge.disc(b.x, b.z, 0.9, 70, 'max');
  edge.blur(1);
  mark('edges');

  // ── 3. meadow zones and mown strips
  const meadow = R();
  const mown = R();
  // south bank: a wildflower meadow with mown strips along the riverbank paths and around picnic spots
  meadow.rect(SLAB.x0, 126.6, 117, SLAB.z1, 215);
  // railway embankment: rough meadow
  meadow.rect(plan.rail.portalW, RAIL_Z - 9, plan.rail.portalE, RAIL_Z - 3.4, 170);
  // park: an unmown shore band around the pond + a few wildflower islands away from the paths
  const pond = model.pond;
  if (pond) meadow.ellipse(pond.cx, pond.cz, pond.rx + 3.9, pond.rz + 3.9, 0, 175, 'max', 0.62);
  const park = plan.blocks.find((b) => b.kind === 'park');
  if (park) {
    const rng = ctx.rng('groundcover-meadow-islands');
    const islands: { x: number; z: number }[] = [];
    for (let tries = 0; tries < 400 && islands.length < 4; tries++) {
      const x = rng.range(park.rect.x0 + 8, park.rect.x1 - 8),
        z = rng.range(park.rect.z0 + 8, park.rect.z1 - 8);
      if (occ.anyInCircle(x, z, 4.5, OCC.PATH | OCC.SOLID | OCC.WATER | OCC.SIDEWALK)) continue;
      if (islands.some((q) => Math.hypot(q.x - x, q.z - z) < 14)) continue;
      islands.push({ x, z });
      meadow.ellipse(x, z, rng.range(3.5, 6.5), rng.range(2.8, 5), rng.range(0, Math.PI), 200, 'max');
    }
  }
  for (const p of plan.paths) if (p.kind === 'riverbank') mown.polyline(p.pts, p.width + 2.8, 255, 'max');
  for (const f of plan.features) if (f.kind === 'picnic') mown.disc(f.x, f.z, f.radius + 4.5, 255, 'max');
  meadow.blur(3);
  mown.blur(3);
  mark('meadow');

  // ── 4. pavement weeds: small spots along wall bases and kerbs, in tree pits and at pole feet
  const weed = R();
  const wr = ctx.rng('groundcover-weeds');
  const weedLine = (ax: number, az: number, bx: number, bz: number, prob: number, rMin: number, rMax: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(L / 0.9);
    for (let i = 0; i < n; i++) {
      if (wr.next() > prob) continue;
      const t = (i + wr.next()) / Math.max(1, n);
      weed.disc(ax + (bx - ax) * t, az + (bz - az) * t, wr.range(rMin, rMax), 255, 'max');
    }
  };
  for (const seg of plan.roadSegments) {
    if (!seg.sidewalks) continue;
    const P = plan.roadNodes[seg.a],
      Q = plan.roadNodes[seg.b];
    const horiz = Math.abs(Q.x - P.x) > Math.abs(Q.z - P.z);
    const a0 = (horiz ? Math.min(P.x, Q.x) : Math.min(P.z, Q.z)) + CORRIDOR_HALF;
    const a1 = (horiz ? Math.max(P.x, Q.x) : Math.max(P.z, Q.z)) - CORRIDOR_HALF;
    if (a1 <= a0) continue;
    for (const sg of [-1, 1]) {
      // wall / fence base (inner sidewalk edge) and the kerb joint (both sides of the kerb stone)
      const offs = [CORRIDOR_HALF - 0.16, ROAD_HALF + 0.42, ROAD_HALF - 0.32];
      const prob = [0.5, 0.26, 0.2];
      offs.forEach((o, qi) => {
        if (horiz) weedLine(a0, P.z + sg * o, a1, P.z + sg * o, prob[qi], 0.1, qi === 0 ? 0.3 : 0.17);
        else weedLine(P.x + sg * o, a0, P.x + sg * o, a1, prob[qi], 0.1, qi === 0 ? 0.3 : 0.17);
      });
    }
  }
  for (const s of plan.slots) {
    if (s.kind === 'tree') weed.ellipse(s.x, s.z, 0.66, 0.66, 0, 255, 'max', 0.68);
    else if ((s.kind === 'lamp' || s.kind === 'hydrant' || s.kind === 'bin') && wr.next() < 0.5) weed.disc(s.x + wr.range(-0.12, 0.12), s.z + wr.range(-0.12, 0.12), wr.range(0.1, 0.18), 255, 'max');
  }
  mark('weeds');

  // ── 5. leaf litter under the trees (additive radial falloff)
  const litter = R();
  const fall = (t: number) => (t < 0.55 ? 1 - (t / 0.55) * 0.4 : 0.6 * (1 - (t - 0.55) / 0.45));
  for (const t of trees) {
    const r = Math.max(1.2, t.r * 1.25);
    litter.disc(t.x, t.z, r, Math.round(Math.min(110, 40 + t.r * 12)), 'add', fall);
  }
  mark('litter');

  // ── 6. heights on a 0.5 m lattice (bilinear for the 0.25 m texels), sidewalk tops overridden
  const LW = Math.round((SLAB.x1 - SLAB.x0) / 0.5) + 1,
    LH = Math.round((SLAB.z1 - SLAB.z0) / 0.5) + 1;
  const lat = new Float32Array(LW * LH);
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) lat[j * LW + i] = H(SLAB.x0 + i * 0.5, SLAB.z0 + j * 0.5);
  mark('heights');

  // ── 7. ground mask (sand, wildness, wear, lawn tone) — warped exactly as the ground shader does
  const gmI = groundMaskInfo;
  const gmOut = new Float32Array(4);
  const gmSample = (u: number, v: number): Float32Array => {
    if (!gmI) {
      gmOut[0] = gmOut[1] = gmOut[2] = 0;
      gmOut[3] = 0.5;
      return gmOut;
    }
    const fx = Math.min(gmI.w - 1.001, Math.max(0, u * gmI.w - 0.5)),
      fy = Math.min(gmI.h - 1.001, Math.max(0, v * gmI.h - 0.5));
    const i = Math.floor(fx),
      j = Math.floor(fy);
    const tx = fx - i,
      ty = fy - j;
    const d = gmI.data,
      w = gmI.w;
    const a = (j * w + i) * 4,
      b = a + 4,
      e = a + w * 4,
      f = e + 4;
    for (let c = 0; c < 4; c++) gmOut[c] = ((d[a + c] + (d[b + c] - d[a + c]) * tx) * (1 - ty) + (d[e + c] + (d[f + c] - d[e + c]) * tx) * ty) / 255;
    return gmOut;
  };
  const SX = 1 / (SLAB.x1 - SLAB.x0),
    SZ = 1 / (SLAB.z1 - SLAB.z0);

  // ── 8. per-texel combine
  const cover = new Uint8Array(CW * CH * 4);
  const height = new Float32Array(CW * CH);
  const stats = { grassCells: 0, meadowCells: 0, wetCells: 0, duneCells: 0, weedCells: 0, litterCells: 0 };
  const boardwalkX = 118.2;
  const nA = new Float32Array(4),
    nB = new Float32Array(4);
  // noise-dependent ground-mask fields on the 0.5 m lattice (R/G warped like the shader, B straight);
  // the 0.25 m texels interpolate them (4× fewer noise / mask lookups)
  const Lsand = new Float32Array(LW * LH),
    Lwild = new Float32Array(LW * LH),
    Lwear = new Float32Array(LW * LH),
    LnB0 = new Float32Array(LW * LH),
    LnAg = new Float32Array(LW * LH);
  for (let j = 0; j < LH; j++) {
    const z = SLAB.z0 + j * 0.5;
    for (let i = 0; i < LW; i++) {
      const x = SLAB.x0 + i * 0.5;
      const k = j * LW + i;
      noise(x * 0.0104, z * 0.0104, nA);
      noise(x * 0.111, z * 0.111, nB);
      const u = (x - SLAB.x0) * SX,
        v = (z - SLAB.z0) * SZ;
      const gw = gmSample(u + ((nA[2] - 0.5) * 5 + (nB[0] - 0.5) * 0.9) * SX, v + ((nA[3] - 0.5) * 5 + (nB[1] - 0.5) * 0.9) * SZ);
      Lsand[k] = smooth(0.25, 0.75, gw[0]);
      Lwild[k] = gw[1];
      Lwear[k] = gmSample(u, v)[2];
      LnB0[k] = nB[0];
      LnAg[k] = nA[1];
    }
  }
  mark('lattice');
  const AD = allow.data,
    ED = edge.data,
    MD = meadow.data,
    WD = mown.data,
    KD = weed.data,
    LD = litter.data;
  const HARD = OCC.PATH | OCC.SOLID | OCC.BUILDING | OCC.ROAD | OCC.SIDEWALK | OCC.PAVED | OCC.RAIL;
  for (let j = 0; j < CH; j++) {
    const z = SLAB.z0 + (j + 0.5) * CRES;
    const fz = (z - SLAB.z0) * 2;
    const lj = Math.min(LH - 2, Math.floor(fz));
    const tz = fz - lj;
    for (let i = 0; i < CW; i++) {
      const x = SLAB.x0 + (i + 0.5) * CRES;
      const p = j * CW + i;
      const q = p * 4;
      // height + slope from the lattice cell
      const fx = (x - SLAB.x0) * 2;
      const li = Math.min(LW - 2, Math.floor(fx));
      const tx = fx - li;
      const la = lat[lj * LW + li],
        lb = lat[lj * LW + li + 1],
        lc = lat[(lj + 1) * LW + li],
        ld = lat[(lj + 1) * LW + li + 1];
      const h = (la + (lb - la) * tx) * (1 - tz) + (lc + (ld - lc) * tx) * tz;
      const o = occ.get(x, z);
      height[p] = (o & OCC.SIDEWALK) !== 0 && (o & OCC.ROAD) === 0 ? SIDEWALK_Y : h + GROUND_DROP;
      const al = AD[p] / 255,
        wk = KD[p] / 255,
        lt0 = LD[p] / 255;
      const wl = model.waterLevel(x, z);
      const above = h - wl;
      const pondish = pond ? ((x - pond.cx) / pond.rx) ** 2 + ((z - pond.cz) / pond.rz) ** 2 < 1.6 : false;
      const mouth = x > 121 && z > 104 && z < 132;
      const beachBack = x > boardwalkX && x < boardwalkX + 16 && z > -4 && z < 108;
      if (al < 0.01 && wk < 0.3 && !pondish && !mouth && !beachBack) {
        // nothing grows here: fallen leaves only (on paving under the trees)
        if (lt0 >= 0.03 && above > 0.05 && (o & OCC.BUILDING) === 0) {
          cover[q + 3] = Math.round(Math.min(1, lt0 * 1.6) * 255);
          stats.litterCells++;
        }
        continue;
      }
      // lattice fields (bilinear, same weights as the height)
      const k00 = lj * LW + li,
        k10 = k00 + 1,
        k01 = k00 + LW,
        k11 = k01 + 1;
      const w00 = (1 - tx) * (1 - tz),
        w10 = tx * (1 - tz),
        w01 = (1 - tx) * tz,
        w11 = tx * tz;
      const sand = Lsand[k00] * w00 + Lsand[k10] * w10 + Lsand[k01] * w01 + Lsand[k11] * w11;
      const wild = Lwild[k00] * w00 + Lwild[k10] * w10 + Lwild[k01] * w01 + Lwild[k11] * w11;
      const wear = Lwear[k00] * w00 + Lwear[k10] * w10 + Lwear[k01] * w01 + Lwear[k11] * w11;
      const nb0 = LnB0[k00] * w00 + LnB0[k10] * w10 + LnB0[k01] * w01 + LnB0[k11] * w11;
      const nag = LnAg[k00] * w00 + LnAg[k10] * w10 + LnAg[k01] * w01 + LnAg[k11] * w11;
      // slope → rock (same rule as the ground shader)
      const gx = ((lb - la) * (1 - tz) + (ld - lc) * tz) * 2,
        gz = ((lc - la) * (1 - tx) + (ld - lb) * tx) * 2;
      const ny = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      const rock = smooth(0.24, 0.46, 1 - ny + (nb0 - 0.5) * 0.22);
      // ── density
      let dens = al * (1 - sand) * (1 - rock * 0.95) * (1 - smooth(0.06, 0.8, wear) * 0.92);
      if (above < 0.03) dens = 0;
      // ── length
      let len = smooth(0.08, 0.75, wild) * 0.8;
      len = Math.max(len, (MD[p] / 255) * 0.86);
      const mw = WD[p] / 255;
      len = len * (1 - mw) + Math.min(len, 0.1) * mw;
      len = Math.max(len, Math.min(0.42, (ED[p] / 255) * 0.55));
      len *= 1 - smooth(0.1, 0.5, wear) * 0.7; // trampled grass stays short
      // the slab's west / south edges hand over to the landscape's meadows: unmown margin
      const dEdge = Math.min(x - SLAB.x0, SLAB.z1 - z);
      if (dEdge < 18) len = Math.max(len, 0.72 * (1 - smooth(4, 15, dEdge + (nag - 0.5) * 6)));
      // habitat: wet shores (natural banks only) and dunes
      let hab = 0;
      if ((pondish || mouth) && above > -0.5 && above < 0.6 && (o & HARD) === 0) {
        const wet = above < 0 ? smooth(-0.5, -0.12, above) : 1 - smooth(0.15, 0.6, above);
        // reeds come in stands, not a continuous fringe
        const stand = smooth(0.4, 0.6, fbm(x * 0.11, z * 0.11, 41));
        const sv = wet * (0.06 + 0.94 * stand) * (1 - sand * 0.6);
        if (sv > 0.04) {
          hab = Math.round(1 + sv * 99);
          dens = Math.max(dens, sv * 0.85);
          len = Math.max(len, 0.7 + 0.3 * stand);
          stats.wetCells++;
        }
      }
      if (sand > 0.35 && above > 0.25 && !pondish && (o & HARD) === 0) {
        // dunes: the back of the beach (boardwalk side) and the river-mouth banks
        const back = beachBack ? 1 - smooth(boardwalkX + 3, boardwalkX + 14, x) : 0;
        const mouthBank = mouth ? 1 - smooth(0.3, 1.6, Math.abs(above - 0.9)) : 0;
        const tuft = smooth(0.45, 0.7, fbm(x * 0.35, z * 0.35, 77));
        const dv = Math.max(back, mouthBank * 0.8) * tuft;
        if (dv > 0.05) {
          hab = Math.round(150 + dv * 105);
          dens = Math.max(dens, dv * 0.55);
          len = Math.max(len, 0.62);
          stats.duneCells++;
        }
      }
      // pavement weeds (on hard surfaces, sparse spots)
      if (wk > 0.3 && dens < 0.2 && (o & (OCC.BUILDING | OCC.WATER | OCC.SOLID)) === 0) {
        dens = Math.max(dens, wk * 0.9);
        len = Math.max(len, 0.22 + 0.18 * hash2(i >> 2, j >> 2, 5));
        if (hab === 0) hab = 120; // pavement weed habitat (leafy rosettes, dandelions)
        stats.weedCells++;
      }
      const lit = Math.min(1, lt0 * 1.6) * (above > 0.05 ? 1 : 0) * ((o & OCC.BUILDING) === 0 ? 1 : 0);
      if (lit > 0.08) stats.litterCells++;
      if (dens > 0.02) {
        stats.grassCells++;
        if (len > 0.5) stats.meadowCells++;
      }
      cover[q] = Math.round(clamp01(dens) * 255);
      cover[q + 1] = Math.round(clamp01(len) * 255);
      cover[q + 2] = hab;
      cover[q + 3] = Math.round(lit * 255);
    }
  }
  mark('combine');

  // ── 9. flowers (0.5 m): species fields on a 2 m grid, niches from the cover map
  const flower = new Uint8Array(FW * FH * 4);
  const SG = 2;
  const SPW = Math.ceil((SLAB.x1 - SLAB.x0) / SG) + 1,
    SPH = Math.ceil((SLAB.z1 - SLAB.z0) / SG) + 1;
  const spDen = new Float32Array(SPW * SPH);
  const spIdx = new Uint8Array(SPW * SPH);
  const lawnF = new Float32Array(SPW * SPH);
  const fs = new Float32Array(6);
  for (let j = 0; j < SPH; j++) {
    const z = SLAB.z0 + j * SG;
    for (let i = 0; i < SPW; i++) {
      const x = SLAB.x0 + i * SG;
      // one patch field per species (different scales → patches 15–60 m), the strongest wins
      fs[0] = fbm(x * 0.045, z * 0.045, 101); // poppy
      fs[1] = fbm(x * 0.06, z * 0.06, 202) * 0.96; // cornflower
      fs[2] = fbm(x * 0.03, z * 0.03, 303) * 1.04; // daisy
      fs[3] = fbm(x * 0.05, z * 0.05, 404); // buttercup
      fs[4] = fbm(x * 0.07, z * 0.07, 505) * 0.94; // cow parsley
      fs[5] = fbm(x * 0.055, z * 0.055, 606) * 0.92; // knapweed / loosestrife
      let best = 0;
      for (let s = 1; s < 6; s++) if (fs[s] > fs[best]) best = s;
      spIdx[j * SPW + i] = best;
      spDen[j * SPW + i] = smooth(0.44, 0.68, fs[best]);
      lawnF[j * SPW + i] = smooth(0.48, 0.72, fbm(x * 0.11, z * 0.11, 707)) * 0.85;
    }
  }
  for (let j = 0; j < FH; j++) {
    const z = SLAB.z0 + (j + 0.5) * FRES;
    for (let i = 0; i < FW; i++) {
      const x = SLAB.x0 + (i + 0.5) * FRES;
      const q = (j * FW + i) * 4;
      flower[q + 3] = Math.round(gmSample((x - SLAB.x0) * SX, (z - SLAB.z0) * SZ)[3] * 255);
      // cover texels under this flower texel (2×2): mean density + length, habitat, litter
      let dn = 0,
        ln = 0,
        wet = 0,
        lit = 0;
      for (let dj = 0; dj < 2; dj++)
        for (let di = 0; di < 2; di++) {
          const c = ((j * 2 + dj) * CW + i * 2 + di) * 4;
          dn += cover[c];
          ln += cover[c + 1];
          const hb = cover[c + 2];
          if (hb > 0 && hb <= 100) wet += hb / 100;
          lit += cover[c + 3];
        }
      if (dn === 0) continue;
      dn /= 4 * 255;
      ln /= 4 * 255;
      wet /= 4;
      lit /= 4 * 255;
      const sp = Math.round((z - SLAB.z0) / SG) * SPW + Math.round((x - SLAB.x0) / SG);
      let s = spIdx[sp];
      let fd = spDen[sp];
      // niches: blue / purple love the damp, cow parsley the shade and hedge feet
      if (wet > 0.2) {
        s = fd > 0.5 && s === 2 ? 2 : 5;
        fd = Math.max(fd, wet * 0.6);
      } else if (lit > 0.25 && s !== 4) fd *= 0.6;
      const mdw = smooth(0.42, 0.62, ln) * smooth(0.15, 0.5, dn);
      flower[q] = Math.round(clamp01(fd * mdw) * 255);
      flower[q + 1] = Math.round(((s + 0.5) / 6) * 255);
      // lawn flowers: daisy / dandelion / clover drifts in the mown grass
      const lawn = (1 - smooth(0.12, 0.3, ln)) * smooth(0.3, 0.7, dn);
      const lf = lawnF[sp] + smooth(0.62, 0.85, vnoise(x * 0.5, z * 0.5, 808)) * 0.25;
      flower[q + 2] = Math.round(clamp01(lf * lawn) * 255);
    }
  }
  mark('flowers');

  // ── 10. textures
  const mk = (data: Uint8Array, w: number, h: number) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.flipY = false; // row 0 = north (z0)
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const texCover = mk(cover, CW, CH);
  const texFlower = mk(flower, FW, FH);
  // R32F read with texelFetch only (no float filtering needed)
  const texHeight = new THREE.DataTexture(height, CW, CH, THREE.RedFormat, THREE.FloatType);
  texHeight.flipY = false;
  texHeight.colorSpace = THREE.NoColorSpace;
  texHeight.magFilter = THREE.NearestFilter;
  texHeight.minFilter = THREE.NearestFilter;
  texHeight.generateMipmaps = false;
  texHeight.needsUpdate = true;

  // ── 11. per-tile metadata for the CPU ring walker
  const grids: TileGrid[] = RING_TILE.map((size) => {
    const gx0 = Math.floor(SLAB.x0 / GRID_ALIGN) * GRID_ALIGN,
      gz0 = Math.floor(SLAB.z0 / GRID_ALIGN) * GRID_ALIGN;
    const nx = Math.ceil((SLAB.x1 - gx0) / size),
      nz = Math.ceil((SLAB.z1 - gz0) / size);
    return { x0: gx0, z0: gz0, size, nx, nz, flags: new Uint8Array(nx * nz), ymin: new Float32Array(nx * nz).fill(1e9), ymax: new Float32Array(nx * nz).fill(-1e9) };
  });

  for (let j = 0; j < CH; j++) {
    for (let i = 0; i < CW; i++) {
      const p = j * CW + i,
        q = p * 4;
      const d = cover[q],
        lt = cover[q + 3];
      if (d < 6 && lt < 20) continue;
      let fl = d >= 6 ? 1 : 0;
      if (d >= 6 && (cover[q + 1] > 70 || cover[q + 2] > 0)) fl |= 2;
      if (lt >= 20) fl |= 8;
      const fq = ((j >> 1) * FW + (i >> 1)) * 4;
      if (flower[fq] > 20 || flower[fq + 2] > 30) fl |= 4;
      const y = height[p];
      for (let gi = 0; gi < grids.length; gi++) {
        const g = grids[gi];
        const t = Math.floor((SLAB.z0 + (j + 0.5) * CRES - g.z0) / g.size) * g.nx + Math.floor((SLAB.x0 + (i + 0.5) * CRES - g.x0) / g.size);
        g.flags[t] |= fl;
        if (y < g.ymin[t]) g.ymin[t] = y;
        if (y > g.ymax[t]) g.ymax[t] = y;
      }
    }
  }
  mark('tiles');

  // ── 12. flower patches for life (butterflies, bees): 8 m cells with enough flowers
  const patches: FlowerPatch[] = [];
  const PC = 8;
  const pcx = Math.floor((SLAB.x1 - SLAB.x0) / PC),
    pcz = Math.floor((SLAB.z1 - SLAB.z0) / PC);
  const per = PC / FRES;
  const cnt = new Float32Array(6);
  for (let cj = 0; cj < pcz; cj++) {
    for (let ci = 0; ci < pcx; ci++) {
      let sum = 0;
      cnt.fill(0);
      for (let j = cj * per; j < (cj + 1) * per; j++) {
        for (let i = ci * per; i < (ci + 1) * per; i++) {
          const q = (j * FW + i) * 4;
          sum += flower[q] / 255 + (flower[q + 2] / 255) * 0.4;
          cnt[Math.min(5, Math.floor((flower[q + 1] / 255) * 6))] += flower[q] / 255;
        }
      }
      const mean = sum / (per * per);
      if (mean < 0.12) continue;
      let best = 0;
      for (let s = 1; s < 6; s++) if (cnt[s] > cnt[best]) best = s;
      patches.push({ x: SLAB.x0 + (ci + 0.5) * PC, z: SLAB.z0 + (cj + 0.5) * PC, r: PC * 0.6, density: Math.min(1, mean), species: SPECIES[best] });
    }
  }

  const densityAt = (x: number, z: number): number => {
    const i = Math.floor((x - SLAB.x0) / CRES),
      j = Math.floor((z - SLAB.z0) / CRES);
    if (i < 0 || j < 0 || i >= CW || j >= CH) return 0;
    return cover[(j * CW + i) * 4] / 255;
  };
  mark('patches');
  return { cover, flower, height, texCover, texFlower, texHeight, grids, patches, densityAt, buildMs: performance.now() - t0, phases: phases.join(' · '), stats };
}
