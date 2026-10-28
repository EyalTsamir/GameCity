// Back-garden kit layout for the house lots (plan areas of kind 'garden'), shared through
// layout.ts by three modules: roads draws the patio / path surfaces, props builds the furniture,
// vegetation keeps its trees and bushes off the reserved spots (layout.furniture discs).
//
// Everything is deterministic per lot (hash of the lot seed). A 0.25 m free-cell grid per parcel
// starts from what must stay clear — the house (+ eaves), the driveway (+ parked car), the front
// yard, door walks, garden hedges / fences on the parcel edges, anything in the occupancy map — and
// items are packed into it in priority order: patio against the back wall (table set, parasol, BBQ),
// a shed in a back corner, one "theme" feature (pool / trampoline / swing set / vegetable beds…),
// then the smaller things (washing line, compost, sandpit, toys, bird bath, wheelie bins).

import type { CityPlan, Lot } from '../../core/plan';
import { OCC, type OccupancyGrid } from '../../core/occupancy';
import type { Rect } from '../../core/geom';
import { hashString } from '../../core/rng';

export type GardenItemKind =
  | 'tableSet'
  | 'loungeSet'
  | 'parasol'
  | 'bbq'
  | 'shed'
  | 'trampoline'
  | 'pool'
  | 'roundPool'
  | 'paddling'
  | 'swing'
  | 'washing'
  | 'vegBeds'
  | 'greenhouse'
  | 'compost'
  | 'bins'
  | 'playhouse'
  | 'sandpit'
  | 'loungers'
  | 'birdbath'
  | 'toys'
  | 'firepit'
  | 'kennel'
  | 'pots';

export interface GardenItem {
  kind: GardenItemKind;
  /** centre (world) */
  x: number;
  z: number;
  /** model yaw: local +Z (its "front") faces (sin yaw, cos yaw) */
  yaw: number;
  /** footprint along local x / local z (m) */
  w: number;
  d: number;
  /** per-item variation seed */
  seed: number;
}

export interface GardenPlan {
  lot: number;
  /** paved terrace against the back wall (drawn by roads), null if none */
  patio: Rect | null;
  /** 0 sandstone slabs · 1 grey pavers · 2 timber decking · 3 brick */
  patioMat: number;
  /** front walk from the street edge (the gate in the front fence) to the door (drawn by roads), or null */
  front: Rect | null;
  /** stepping stones (flat discs) */
  stones: { x: number; z: number; r: number }[];
  items: GardenItem[];
  /** the usable back-garden rectangle (world) */
  back: Rect;
}

// ───────────────────────────────────────────────────────────── helpers ──

export const CELL = 0.25;

/** 0.25 m free-cell raster over a rectangle (1 = blocked). */
export class FreeGrid {
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  readonly c: Uint8Array;
  constructor(r: Rect) {
    this.x0 = r.x0;
    this.z0 = r.z0;
    this.w = Math.max(1, Math.round((r.x1 - r.x0) / CELL));
    this.h = Math.max(1, Math.round((r.z1 - r.z0) / CELL));
    this.c = new Uint8Array(this.w * this.h);
  }
  /** block every cell whose centre lies in the rect */
  block(x0: number, z0: number, x1: number, z1: number): void {
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / CELL - 0.5)),
      i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - this.z0) / CELL - 0.5)),
      j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.c[j * this.w + i] = 1;
  }
  blockIf(pred: (x: number, z: number) => boolean): void {
    for (let j = 0; j < this.h; j++) {
      const z = this.z0 + (j + 0.5) * CELL;
      for (let i = 0; i < this.w; i++) {
        if (this.c[j * this.w + i]) continue;
        if (pred(this.x0 + (i + 0.5) * CELL, z)) this.c[j * this.w + i] = 1;
      }
    }
  }
  /** all cells of the rect free (and inside the grid) */
  free(x0: number, z0: number, x1: number, z1: number): boolean {
    if (x0 < this.x0 - 1e-6 || z0 < this.z0 - 1e-6 || x1 > this.x0 + this.w * CELL + 1e-6 || z1 > this.z0 + this.h * CELL + 1e-6) return false;
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / CELL - 0.5)),
      i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - this.z0) / CELL - 0.5)),
      j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.c[j * this.w + i]) return false;
    return true;
  }
}

/** Garden-local frame: u across the parcel (left → right seen from the street), v depth from the street. */
interface Frame {
  /** world of (u, v) */
  wx(u: number, v: number): number;
  wz(u: number, v: number): number;
  /** yaw of a model whose local +Z points towards the street (front) */
  yawFront: number;
  /** parcel extent in u / v */
  u0: number;
  u1: number;
  /** v of the house front / back face, of the parcel back edge */
  vFront: number;
  vBack: number;
  vEnd: number;
  /** house extent in u */
  hu0: number;
  hu1: number;
}

function frameOf(lot: Lot): Frame {
  const r = lot.rect,
    f = lot.footprint;
  switch (lot.front) {
    case 'N': // street at z0, back towards +z; u = x
      return { wx: (u) => u, wz: (_u, v) => r.z0 + v, yawFront: Math.PI, u0: r.x0, u1: r.x1, vFront: f.z0 - r.z0, vBack: f.z1 - r.z0, vEnd: r.z1 - r.z0, hu0: f.x0, hu1: f.x1 };
    case 'S': // street at z1, back towards -z; u = -x (mirrored so u grows to the street-left)
      return { wx: (u) => -u, wz: (_u, v) => r.z1 - v, yawFront: 0, u0: -r.x1, u1: -r.x0, vFront: r.z1 - f.z1, vBack: r.z1 - f.z0, vEnd: r.z1 - r.z0, hu0: -f.x1, hu1: -f.x0 };
    case 'W': // street at x0, back towards +x; u = -z
      return { wx: (_u, v) => r.x0 + v, wz: (u) => -u, yawFront: -Math.PI / 2, u0: -r.z1, u1: -r.z0, vFront: f.x0 - r.x0, vBack: f.x1 - r.x0, vEnd: r.x1 - r.x0, hu0: -f.z1, hu1: -f.z0 };
    default: // 'E': street at x1, back towards -x; u = z
      return { wx: (_u, v) => r.x1 - v, wz: (u) => u, yawFront: Math.PI / 2, u0: r.z0, u1: r.z1, vFront: r.x1 - f.x1, vBack: r.x1 - f.x0, vEnd: r.x1 - r.x0, hu0: f.z0, hu1: f.z1 };
  }
}

// ───────────────────────────────────────────────────────────── planner ──

export interface GardenInputs {
  plan: CityPlan;
  occ: OccupancyGrid;
  /** pedestrian corridors (door walks…) */
  walkAt(x: number, z: number): boolean;
  /** garden borders (fences / walls / hedges) as segments with a half thickness */
  borders: { ax: number; az: number; bx: number; bz: number; half: number }[];
}

export function planGardens(inp: GardenInputs): GardenPlan[] {
  const { plan, occ } = inp;
  const out: GardenPlan[] = [];
  const driveways = plan.areas.filter((a) => a.kind === 'driveway');
  for (const lot of plan.lots) {
    if (lot.kind !== 'house') continue;
    out.push(planOne(lot, inp, driveways.map((d) => d.rect).filter((d) => d.x0 < lot.rect.x1 && d.x1 > lot.rect.x0 && d.z0 < lot.rect.z1 && d.z1 > lot.rect.z0), occ));
  }
  return out;
}

function planOne(lot: Lot, inp: GardenInputs, drives: Rect[], occ: OccupancyGrid): GardenPlan {
  const F = frameOf(lot);
  const seed = hashString(`garden:${lot.seed}`);
  let hs = seed;
  /** deterministic stream in [0, 1) */
  const rnd = () => {
    hs = (hs + 0x6d2b79f5) >>> 0;
    let t = hs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = lot.rect;
  const grid = new FreeGrid(r);
  const M = 0.62; // keep clear of the boundary hedges / fences
  // parcel margins
  grid.block(r.x0 - 1, r.z0 - 1, r.x0 + M, r.z1 + 1);
  grid.block(r.x1 - M, r.z0 - 1, r.x1 + 1, r.z1 + 1);
  grid.block(r.x0 - 1, r.z0 - 1, r.x1 + 1, r.z0 + M);
  grid.block(r.x0 - 1, r.z1 - M, r.x1 + 1, r.z1 + 1);
  // the house with its eaves, driveway + car door clearance
  const f = lot.footprint;
  grid.block(f.x0 - 0.35, f.z0 - 0.35, f.x1 + 0.35, f.z1 + 0.35);
  for (const d of drives) grid.block(d.x0 - 0.5, d.z0 - 0.5, d.x1 + 0.5, d.z1 + 0.5);
  // front yard stays open lawn (foundation planting lives there)
  grid.blockIf((x, z) => vOf(lot, x, z) < F.vFront + 0.5);
  // door walks, borders, anything solid
  grid.blockIf((x, z) => inp.walkAt(x, z) || occ.has(x, z, OCC.BUILDING | OCC.SOLID | OCC.ROAD | OCC.SIDEWALK | OCC.PATH | OCC.PAVED | OCC.WATER));
  for (const b of inp.borders) {
    if (b.ax < r.x0 - 1 && b.bx < r.x0 - 1) continue;
    if (b.ax > r.x1 + 1 && b.bx > r.x1 + 1) continue;
    if (b.az < r.z0 - 1 && b.bz < r.z0 - 1) continue;
    if (b.az > r.z1 + 1 && b.bz > r.z1 + 1) continue;
    const rr = b.half + 0.45;
    grid.blockIf((x, z) => segDist2(x, z, b.ax, b.az, b.bx, b.bz) < rr * rr);
  }

  const items: GardenItem[] = [];
  const W = (u: number, v: number): [number, number] => [F.wx(u, v), F.wz(u, v)];
  /** world rect of a local (u, v) rect */
  const wrect = (ua: number, va: number, ub: number, vb: number): Rect => {
    const [ax, az] = W(ua, va),
      [bx, bz] = W(ub, vb);
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
  };
  const isFree = (ua: number, va: number, ub: number, vb: number) => {
    const q = wrect(ua, va, ub, vb);
    return grid.free(q.x0, q.z0, q.x1, q.z1);
  };
  const take = (ua: number, va: number, ub: number, vb: number) => {
    const q = wrect(ua, va, ub, vb);
    grid.block(q.x0, q.z0, q.x1, q.z1);
  };
  /**
   * Place a local-axis-aligned item of size (sw along u, sd along v) with a clearance ring.
   * `yawOff` rotates the model relative to "front faces the house/street".
   */
  const place = (kind: GardenItemKind, cu: number, cv: number, sw: number, sd: number, clear: number, faceStreet: boolean, yawOff = 0): GardenItem | null => {
    const ua = cu - sw / 2 - clear,
      ub = cu + sw / 2 + clear,
      va = cv - sd / 2 - clear,
      vb = cv + sd / 2 + clear;
    if (!isFree(ua, va, ub, vb)) return null;
    take(ua, va, ub, vb);
    const [x, z] = W(cu, cv);
    const it: GardenItem = { kind, x, z, yaw: F.yawFront + (faceStreet ? 0 : Math.PI) + yawOff, w: sw, d: sd, seed: Math.floor(rnd() * 1e9) };
    items.push(it);
    return it;
  };
  /** try a list of candidate centres, first fit wins */
  const tryPlace = (kind: GardenItemKind, cands: [number, number][], sw: number, sd: number, clear: number, faceStreet: boolean, yawOff = 0): GardenItem | null => {
    for (const [cu, cv] of cands) {
      const it = place(kind, cu, cv, sw, sd, clear, faceStreet, yawOff);
      if (it) return it;
    }
    return null;
  };

  // usable back zone (local)
  const bu0 = F.u0 + M,
    bu1 = F.u1 - M,
    bv0 = F.vBack + 0.35,
    bv1 = F.vEnd - M;
  const depth = bv1 - bv0,
    width = bu1 - bu0;
  const back = wrect(bu0, bv0, bu1, bv1);

  // ── patio against the back wall
  let patio: Rect | null = null;
  const patioMat = Math.floor(rnd() * 4);
  const hw = F.hu1 - F.hu0;
  const pd = depth > 9 ? 3.2 + rnd() * 0.6 : 2.3 + rnd() * 0.5;
  const pw = Math.min(hw - 0.2, Math.max(3.6, hw * (0.62 + rnd() * 0.3)));
  const pAlign = rnd();
  const pu0 = pAlign < 0.33 ? F.hu0 + 0.1 : pAlign < 0.66 ? F.hu1 - 0.1 - pw : (F.hu0 + F.hu1) / 2 - pw / 2;
  if (depth > pd + 2.2 && isFree(pu0, bv0, pu0 + pw, bv0 + pd)) {
    patio = wrect(pu0, bv0 - 0.36, pu0 + pw, bv0 + pd);
    take(pu0 - 0.15, bv0 - 0.4, pu0 + pw + 0.15, bv0 + pd + 0.25);
    const pcu = pu0 + pw / 2,
      pcv = bv0 + pd / 2 + 0.1;
    const lounge = rnd() < 0.3;
    const setW = lounge ? 2.6 : 2.0,
      setD = lounge ? 1.9 : 2.0;
    const su = pw > setW + 1.6 ? (rnd() < 0.5 ? pu0 + setW / 2 + 0.25 : pu0 + pw - setW / 2 - 0.25) : pcu;
    const set: GardenItem = { kind: lounge ? 'loungeSet' : 'tableSet', ...xz(W(su, pcv)), yaw: F.yawFront + Math.PI, w: setW, d: setD, seed: Math.floor(rnd() * 1e9) };
    items.push(set);
    if (!lounge && rnd() < 0.72) items.push({ kind: 'parasol', ...xz(W(su, pcv)), yaw: 0, w: 2.6, d: 2.6, seed: Math.floor(rnd() * 1e9) });
    // potted plants on the outer patio corners
    for (const cu of [pu0 + 0.3, pu0 + pw - 0.3]) {
      if (Math.abs(cu - su) < setW / 2 + 0.5) continue;
      if (rnd() < 0.75) items.push({ kind: 'pots', ...xz(W(cu, bv0 + pd - 0.3)), yaw: rnd() * 6.28, w: 0.6, d: 0.6, seed: Math.floor(rnd() * 1e9) });
    }
    // BBQ at the far end of the patio
    if (rnd() < 0.62) {
      const bu = su < pcu ? pu0 + pw - 0.45 : pu0 + 0.45;
      if (Math.abs(bu - su) > 1.5) items.push({ kind: 'bbq', ...xz(W(bu, bv0 + pd - 0.45)), yaw: F.yawFront + Math.PI, w: 0.7, d: 0.7, seed: Math.floor(rnd() * 1e9) });
    }
  }

  // ── shed in a back corner (door towards the house)
  const leftFirst = rnd() < 0.5;
  const shedW = 2.2 + rnd() * 0.8,
    shedD = 1.7 + rnd() * 0.5;
  // candidates walk inward from a back corner (hedge clearance varies with the border style)
  const corner = (left: boolean, sw: number, sd: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let dv = 0; dv <= 1.5; dv += 0.25)
      for (let du = 0; du <= 2.5; du += 0.25) out.push([left ? bu0 + sw / 2 + du : bu1 - sw / 2 - du, bv1 - sd / 2 - dv]);
    out.sort((a, b) => Math.abs(a[0] - (left ? bu0 : bu1)) + 1.5 * Math.abs(a[1] - bv1) - (Math.abs(b[0] - (left ? bu0 : bu1)) + 1.5 * Math.abs(b[1] - bv1)));
    return out;
  };
  let shed: GardenItem | null = null;
  if (rnd() < 0.82 && depth > 3.6) {
    shed = tryPlace('shed', [...corner(leftFirst, shedW, shedD), ...corner(!leftFirst, shedW, shedD)], shedW, shedD, 0.05, true);
  }

  // ── theme feature
  const roomy = depth > 8.5 && width > 9.5;
  const t = rnd();
  const theme = roomy ? (t < 0.42 ? 'pool' : t < 0.64 ? 'family' : t < 0.84 ? 'gardener' : 'relax') : t < 0.52 ? 'family' : t < 0.76 ? 'gardener' : t < 0.9 ? 'splash' : 'relax';
  // candidate centres over the free back zone, nearest to the zone centre first (deterministic scan)
  const cands = (sw: number, sd: number, clear: number): [number, number][] => {
    const out: [number, number][] = [];
    const cu = (bu0 + bu1) / 2 + (rnd() - 0.5) * width * 0.3,
      cv = (bv0 + bv1) / 2 + depth * 0.1;
    for (let v = bv0 + sd / 2 + clear; v <= bv1 - sd / 2 - clear + 1e-6; v += 0.25)
      for (let u = bu0 + sw / 2 + clear; u <= bu1 - sw / 2 - clear + 1e-6; u += 0.25) out.push([u, v]);
    out.sort((a, b) => (a[0] - cu) ** 2 + (a[1] - cv) ** 2 - ((b[0] - cu) ** 2 + (b[1] - cv) ** 2));
    return out;
  };
  const feature = (kind: GardenItemKind, sw: number, sd: number, clear: number, faceStreet = false, yawOff = 0) => tryPlace(kind, cands(sw, sd, clear), sw, sd, clear, faceStreet, yawOff);
  switch (theme) {
    case 'pool': {
      const pl = Math.min(depth - 2.6, 6.5 + rnd() * 1.5),
        pwid = 3.2 + rnd() * 0.6;
      // long axis across the garden when it is wide, else along the depth
      const across = width - 2 > pl + 1.6;
      const p = across ? feature('pool', pl, pwid, 0.7, false) : feature('pool', pwid, pl, 0.7, false, Math.PI / 2);
      if (p) {
        if (!across) {
          p.w = pl;
          p.d = pwid;
        }
        feature('loungers', 2.3, 2.0, 0.15);
      } else feature('trampoline', 3.4, 3.4, 0.35);
      break;
    }
    case 'family': {
      const k = rnd();
      const first = k < 0.6 ? feature('trampoline', 3.35, 3.35, 0.25) : feature('swing', 3.6, 2.6, 0.3, false);
      if (!first) feature('swing', 3.6, 2.6, 0.3, false) ?? feature('sandpit', 1.8, 1.8, 0.3);
      if (rnd() < 0.6) feature('sandpit', 1.8, 1.8, 0.3) ?? feature('playhouse', 1.5, 1.5, 0.3);
      else feature('playhouse', 1.6, 1.4, 0.3);
      if (rnd() < 0.5) feature('paddling', 1.9, 1.9, 0.25);
      feature('toys', 1.2, 1.2, 0.1);
      break;
    }
    case 'splash': {
      if (rnd() < 0.5) feature('roundPool', 3.6, 3.6, 0.35) ?? feature('paddling', 2.0, 2.0, 0.3);
      else feature('paddling', 2.1, 2.1, 0.3);
      feature('loungers', 2.3, 2.0, 0.2);
      feature('toys', 1.2, 1.2, 0.1);
      break;
    }
    case 'gardener': {
      const n = 2 + Math.floor(rnd() * 2);
      const bw = 2.4,
        bd = 1.1;
      // a little row of raised beds
      const it = feature('vegBeds', bw, bd * n + 0.6 * (n - 1), 0.35, false, 0);
      if (it) it.seed = (it.seed & ~3) | (n - 2);
      if (rnd() < 0.6) feature('greenhouse', 2.4, 1.9, 0.3, true);
      feature('compost', 1.2, 1.0, 0.1);
      break;
    }
    default: {
      feature('firepit', 2.6, 2.6, 0.2);
      feature('loungers', 2.3, 2.0, 0.2);
      feature('birdbath', 0.7, 0.7, 0.4);
    }
  }
  // ── everyday things
  if (rnd() < 0.68) feature('washing', 2.4, 2.4, 0.2);
  if (rnd() < 0.45) feature('birdbath', 0.7, 0.7, 0.4);
  if (theme !== 'gardener' && rnd() < 0.5) feature('compost', 1.2, 1.0, 0.1);
  if (rnd() < 0.18) feature('kennel', 1.0, 1.2, 0.3);
  // wheelie bins beside the house on the driveway side (local u just outside the house)
  {
    const side = drives.length ? (centreU(F, drives[0]) < (F.hu0 + F.hu1) / 2 ? -1 : 1) : 1;
    const bu = side < 0 ? F.hu0 - 0.75 : F.hu1 + 0.75;
    for (const dv of [0.4, 1.4, 2.4, -0.6]) {
      // row runs along the side wall (local x ↔ depth), lids face away from the house
      const b = place('bins', bu, F.vBack - dv, 0.75, 1.5, 0.0, false, side < 0 ? -Math.PI / 2 : Math.PI / 2);
      if (b) {
        b.w = 1.5;
        b.d = 0.75;
        break;
      }
    }
  }

  // ── stepping stones from the patio towards the shed (or the furthest feature)
  const stones: { x: number; z: number; r: number }[] = [];
  const goal = shed ?? items.find((i) => i.kind === 'greenhouse' || i.kind === 'trampoline' || i.kind === 'swing');
  if (goal && patio) {
    const [, gv] = toLocal(F, goal.x, goal.z);
    const gu = toLocal(F, goal.x, goal.z)[0];
    const startU = clampN(gu, pu0 + 0.4, pu0 + pw - 0.4),
      startV = bv0 + pd + 0.45;
    const endV = gv - (goal.kind === 'shed' ? goal.d / 2 + 0.45 : goal.d / 2 + 0.5);
    const L = Math.hypot(gu - startU, endV - startV);
    const n = Math.floor(L / 0.62);
    for (let k = 0; k < n; k++) {
      const tt = (k + 0.5) / n;
      const u = startU + (gu - startU) * tt + (rnd() - 0.5) * 0.12,
        v = startV + (endV - startV) * tt;
      const [x, z] = W(u, v);
      if (!grid.free(x - 0.2, z - 0.2, x + 0.2, z + 0.2) && !onPatioPath(items, x, z)) continue;
      stones.push({ x, z, r: 0.2 + rnd() * 0.05 });
    }
  }
  // ── front walk: a paved path along the door walk, from the gate gap in the front border to the door
  let front: Rect | null = null;
  const door = lot.doors.find((d) => d.dir === lot.front);
  if (door) {
    const fp = lot.footprint,
      hw = 0.5;
    const fr: Rect =
      door.dir === 'N'
        ? { x0: door.x - hw, z0: r.z0, x1: door.x + hw, z1: fp.z0 }
        : door.dir === 'S'
          ? { x0: door.x - hw, z0: fp.z1, x1: door.x + hw, z1: r.z1 }
          : door.dir === 'W'
            ? { x0: r.x0, z0: door.z - hw, x1: fp.x0, z1: door.z + hw }
            : { x0: fp.x1, z0: door.z - hw, x1: r.x1, z1: door.z + hw };
    const len = Math.max(fr.x1 - fr.x0, fr.z1 - fr.z0);
    const hitsDrive = drives.some((d) => d.x0 < fr.x1 && d.x1 > fr.x0 && d.z0 < fr.z1 && d.z1 > fr.z0);
    if (len > 1 && !hitsDrive) front = fr;
  }
  return { lot: lot.id, patio, patioMat, front, stones, items, back };
}

function onPatioPath(items: GardenItem[], x: number, z: number): boolean {
  // stones may cross cells blocked only by an item's clearance ring, never the item itself
  for (const it of items) {
    const c = Math.cos(it.yaw),
      s = Math.sin(it.yaw);
    const dx = x - it.x,
      dz = z - it.z;
    const lx = dx * c - dz * s,
      lz = dx * s + dz * c;
    if (Math.abs(lx) < it.w / 2 + 0.15 && Math.abs(lz) < it.d / 2 + 0.15) return false;
  }
  return true;
}

function xz(p: [number, number]): { x: number; z: number } {
  return { x: p[0], z: p[1] };
}

function clampN(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function vOf(lot: Lot, x: number, z: number): number {
  const r = lot.rect;
  switch (lot.front) {
    case 'N':
      return z - r.z0;
    case 'S':
      return r.z1 - z;
    case 'W':
      return x - r.x0;
    default:
      return r.x1 - x;
  }
}

function toLocal(F: Frame, x: number, z: number): [number, number] {
  // invert the frame numerically from two probes (frames are axis permutations / mirrors)
  const ox = F.wx(0, 0),
    oz = F.wz(0, 0);
  const ux = F.wx(1, 0) - ox,
    uz = F.wz(1, 0) - oz,
    vx = F.wx(0, 1) - ox,
    vz = F.wz(0, 1) - oz;
  const dx = x - ox,
    dz = z - oz;
  return [dx * ux + dz * uz, dx * vx + dz * vz];
}

function centreU(F: Frame, d: Rect): number {
  return toLocal(F, (d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2)[0];
}

function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax,
    dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px,
    qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}

/** Keep-clear discs (for trees / bushes) covering an item footprint. */
export function itemDiscs(it: GardenItem): { x: number; z: number; r: number }[] {
  const tall = it.kind === 'shed' || it.kind === 'parasol' || it.kind === 'swing' || it.kind === 'greenhouse' || it.kind === 'washing' || it.kind === 'trampoline' || it.kind === 'playhouse';
  const pad = tall ? 0.6 : 0.2;
  const L = Math.max(it.w, it.d),
    S = Math.min(it.w, it.d);
  const r = S / 2 + pad;
  const n = Math.max(1, Math.ceil(L / Math.max(1.2, S)));
  const along = it.w >= it.d ? 0 : 1;
  const c = Math.cos(it.yaw),
    s = Math.sin(it.yaw);
  const out: { x: number; z: number; r: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * (L - S);
    const lx = along === 0 ? t : 0,
      lz = along === 1 ? t : 0;
    out.push({ x: it.x + lx * c + lz * s, z: it.z - lx * s + lz * c, r: Math.min(2.8, Math.hypot(r, (L - S) / (2 * n))) });
  }
  return out;
}
