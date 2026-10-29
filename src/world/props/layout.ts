// Shared, deterministic layout decisions for the "vegetation" and "props" modules.
//
// Both modules must agree on a few things (where path lamps stand, which garden edges get a
// picket fence / low wall / hedge, allotment plots and sheds, bench heights), so those are
// computed here from the plan + core graphs only, cached per plan, and read by both.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Lot, StreetSlot, WalkPath, DistrictKind } from '../../core/plan';
import { OCC, type OccupancyGrid } from '../../core/occupancy';
import { SIDEWALK_Y, WALK_OFFSET, FURN_OFFSET } from '../../core/constants';
import { hashString } from '../../core/rng';
import type { Rect } from '../../core/geom';
import { planGardens, itemDiscs, type GardenPlan } from './gardenPlan';

export type { GardenPlan, GardenItem, GardenItemKind } from './gardenPlan';

// ─────────────────────────────────────────────────────────────── raster ──

/** 0.5 m raster over the slab (same grid as the occupancy map) with 8 user bits. */
export class Mask {
  readonly res: number;
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(occ: OccupancyGrid) {
    this.res = occ.res;
    this.x0 = occ.x0;
    this.z0 = occ.z0;
    this.w = occ.w;
    this.h = occ.h;
    this.data = new Uint8Array(this.w * this.h);
  }

  get(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.res),
      j = Math.floor((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return this.data[j * this.w + i];
  }

  anyInCircle(x: number, z: number, r: number, bits: number): boolean {
    const s = this.res;
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / s)),
      i1 = Math.min(this.w - 1, Math.floor((x + r - this.x0) / s));
    const j0 = Math.max(0, Math.floor((z - r - this.z0) / s)),
      j1 = Math.min(this.h - 1, Math.floor((z + r - this.z0) / s));
    const rr = (r + s * 0.5) * (r + s * 0.5);
    for (let j = j0; j <= j1; j++) {
      const cz = this.z0 + (j + 0.5) * s - z;
      for (let i = i0; i <= i1; i++) {
        const cx = this.x0 + (i + 0.5) * s - x;
        if (cx * cx + cz * cz > rr) continue;
        if (this.data[j * this.w + i] & bits) return true;
      }
    }
    return false;
  }

  /** fill a capsule (segment a-b with radius r) */
  capsule(ax: number, az: number, bx: number, bz: number, r: number, bit: number): void {
    const s = this.res;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - this.x0) / s)),
      i1 = Math.min(this.w - 1, Math.floor((Math.max(ax, bx) + r - this.x0) / s));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - this.z0) / s)),
      j1 = Math.min(this.h - 1, Math.floor((Math.max(az, bz) + r - this.z0) / s));
    const dx = bx - ax,
      dz = bz - az;
    const L2 = dx * dx + dz * dz || 1e-9;
    for (let j = j0; j <= j1; j++) {
      const pz = this.z0 + (j + 0.5) * s;
      for (let i = i0; i <= i1; i++) {
        const px = this.x0 + (i + 0.5) * s;
        let t = ((px - ax) * dx + (pz - az) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px,
          qz = az + dz * t - pz;
        if (qx * qx + qz * qz <= r * r) this.data[j * this.w + i] |= bit;
      }
    }
  }
}

/** true if any occupancy cell whose centre lies within r (+ half a cell) of (x,z) has one of `flags` */
export function occAny(occ: OccupancyGrid, x: number, z: number, r: number, flags: number): boolean {
  const s = occ.res;
  const i0 = Math.max(0, Math.floor((x - r - occ.x0) / s)),
    i1 = Math.min(occ.w - 1, Math.floor((x + r - occ.x0) / s));
  const j0 = Math.max(0, Math.floor((z - r - occ.z0) / s)),
    j1 = Math.min(occ.h - 1, Math.floor((z + r - occ.z0) / s));
  const rr = (r + s * 0.5) * (r + s * 0.5);
  const d = occ.data;
  for (let j = j0; j <= j1; j++) {
    const cz = occ.z0 + (j + 0.5) * s - z;
    for (let i = i0; i <= i1; i++) {
      const cx = occ.x0 + (i + 0.5) * s - x;
      if (cx * cx + cz * cz > rr) continue;
      if (d[j * occ.w + i] & flags) return true;
    }
  }
  return false;
}

// ───────────────────────────────────────────────────────── shared types ──

export type LampStyle = 'modern' | 'classic' | 'simple' | 'suburb' | 'beach' | 'park' | 'plaza';

export interface LampSpot {
  x: number;
  z: number;
  /** ground height */
  y: number;
  /** model faces (sin yaw, cos yaw): street lamps face away from the road (arm reaches back over it) */
  yaw: number;
  style: LampStyle;
  /** street slot lamp (has an arm over the road for some styles) */
  street: boolean;
}

export interface BenchPlace {
  x: number;
  z: number;
  /** base height (matches the pedestrians' seat logic) */
  y: number;
  /** direction the sitter faces */
  yaw: number;
  style: 'classic' | 'modern' | 'wood';
  /** stands on a sidewalk (street furniture band) */
  sidewalk: boolean;
}

export type BorderStyle = 'picket' | 'wall' | 'hedge';

export interface Border {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  style: BorderStyle;
  /** front/street edge vs. side/back boundary */
  street: boolean;
  lot: number;
  /** palette index for fences/walls */
  paint: number;
  /** segment ends next to a gap (gate posts) */
  gateA: boolean;
  gateB: boolean;
}

export type CropKind = 'cabbage' | 'lettuce' | 'carrot' | 'beans' | 'corn' | 'sunflower' | 'pumpkin' | 'berry';

export interface Plot {
  rect: Rect;
  /** beds run along x ('x') or z ('z') */
  along: 'x' | 'z';
  crops: CropKind[];
  shed: { x: number; z: number; yaw: number; paint: number } | null;
  barrel: { x: number; z: number } | null;
  tree: { x: number; z: number } | null;
}

export interface Layout {
  walk: Mask;
  lamps: LampSpot[];
  benches: BenchPlace[];
  borders: Border[];
  plots: Plot[];
  /** keep-clear discs for anything standing at ground level (props + vegetation) */
  furniture: { x: number; z: number; r: number }[];
  /**
   * Back-garden kits per house lot (patio, shed, pool, trampoline…). Roads draws the patios and
   * stepping stones, props the furniture; every item is also in `furniture` (trees/bushes keep off).
   */
  gardens: GardenPlan[];
}

export const MASK_WALK = 1;

const cache = new WeakMap<object, Layout>();

/** Layout shared by vegetation & props (computed once per plan). */
export function getLayout(ctx: CityContext): Layout {
  let L = cache.get(ctx.plan);
  if (!L) {
    L = buildLayout(ctx);
    cache.set(ctx.plan, L);
  }
  return L;
}

// ─────────────────────────────────────────────────────────────── styles ──

export function streetLampStyle(d: DistrictKind): LampStyle {
  switch (d) {
    case 'downtown':
    case 'midtown':
    case 'station':
      return 'modern';
    case 'oldtown':
    case 'market':
    case 'civic':
    case 'riverside':
    case 'park':
      return 'classic';
    case 'industrial':
    case 'harbor':
      return 'simple';
    case 'beach':
      return 'beach';
    default:
      return 'suburb';
  }
}

export function benchStyleFor(d: DistrictKind | 'pier' | 'promenade'): BenchPlace['style'] {
  if (d === 'downtown' || d === 'midtown' || d === 'station' || d === 'stadium') return 'modern';
  if (d === 'pier' || d === 'beach') return 'wood';
  return 'classic';
}

/** Planter dimensions at 'planter' slots (props draws the box, vegetation fills it). */
export const PLANTER = { along: 1.5, across: 0.62, height: 0.5, soil: 0.42 };

/** Stable per-key random in [0,1). */
export function hrand(key: string): number {
  return (hashString(key) % 100003) / 100003;
}

// ─────────────────────────────────────────────────────────────── build ──

function buildLayout(ctx: CityContext): Layout {
  const plan = ctx.plan;
  const occ = ctx.occupancy;
  const walk = new Mask(occ);
  // pedestrian corridors (sidewalk walk bands, park paths, door walks, links, bench approaches)
  for (const e of ctx.peds.edges) {
    if (e.kind === 'crosswalk') continue;
    const A = ctx.peds.nodes[e.a],
      B = ctx.peds.nodes[e.b];
    // sidewalk bands stop exactly at the block edge (front fences stand right behind it)
    walk.capsule(A.x, A.z, B.x, B.z, e.kind === 'sidewalk' ? e.halfWidth : e.halfWidth + 0.3, MASK_WALK);
  }
  const benches = buildBenches(ctx);
  const lamps = buildLamps(ctx, benches);
  const furniture: { x: number; z: number; r: number }[] = [];
  for (const b of benches) furniture.push({ x: b.x, z: b.z, r: 1.1 });
  for (const l of lamps) furniture.push({ x: l.x, z: l.z, r: 0.35 });
  for (const s of plan.slots) {
    if (s.kind === 'empty' || s.kind === 'tree') continue;
    furniture.push({ x: s.x, z: s.z, r: s.kind === 'busstop' ? 2.6 : s.kind === 'bench' ? 1.1 : 0.6 });
  }
  const borders = buildBorders(ctx, walk);
  const plots = buildPlots(ctx);
  const gardens = ctx.debug.params.has('nogardens')
    ? []
    : planGardens({
        plan,
        occ,
        walkAt: (x, z) => (walk.get(x, z) & MASK_WALK) !== 0,
        borders: borders.map((b) => ({ ax: b.ax, az: b.az, bx: b.bx, bz: b.bz, half: b.style === 'hedge' ? (b.street ? 0.3 : 0.33) : b.style === 'wall' ? 0.21 : 0.07 })),
      });
  for (const g of gardens) {
    for (const it of g.items) for (const d of itemDiscs(it)) furniture.push(d);
    if (g.patio) {
      const p = g.patio;
      const w = p.x1 - p.x0,
        d = p.z1 - p.z0;
      const n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        furniture.push({ x: w >= d ? p.x0 + w * t : (p.x0 + p.x1) / 2, z: w >= d ? (p.z0 + p.z1) / 2 : p.z0 + d * t, r: Math.min(2.8, Math.min(w, d) / 2 + 0.3) });
      }
    }
    for (const s of g.stones) furniture.push({ x: s.x, z: s.z, r: 0.3 });
  }
  return { walk, lamps, benches, borders, plots, furniture, gardens };
}

function districtAt(ctx: CityContext, x: number, z: number): DistrictKind {
  return ctx.plan.districtAt(x, z)?.kind ?? 'riverside';
}

function buildBenches(ctx: CityContext): BenchPlace[] {
  const plan = ctx.plan,
    occ = ctx.occupancy,
    peds = ctx.peds;
  const yOf = new Map<string, number>();
  const key = (x: number, z: number) => `${Math.round(x * 20)},${Math.round(z * 20)}`;
  for (const b of peds.benches) {
    const onSide = occ.has(b.bench.x, b.bench.z, OCC.SIDEWALK);
    yOf.set(key(b.bench.x, b.bench.z), onSide ? SIDEWALK_Y : Math.max(0, peds.nodes[b.node].y - 0.03));
  }
  const out: BenchPlace[] = [];
  for (const b of plan.benches) {
    const onSide = occ.has(b.x, b.z, OCC.SIDEWALK);
    let y = yOf.get(key(b.x, b.z));
    if (y === undefined) y = onSide ? SIDEWALK_Y : Math.max(0, nearestPathY(plan.paths, b.ax, b.az) - 0.03);
    const pier = b.z < 62 && b.z > 50 && b.x > 121;
    const prom = b.z > 106.4 && b.z < 110.5;
    const style = benchStyleFor(pier ? 'pier' : prom ? 'promenade' : districtAt(ctx, b.ax, b.az));
    out.push({ x: b.x, z: b.z, y, yaw: b.yaw, style, sidewalk: onSide });
  }
  for (const s of plan.slots) {
    if (s.kind !== 'bench') continue;
    const nx = Math.sin(s.yaw),
      nz = Math.cos(s.yaw);
    out.push({ x: s.x, z: s.z, y: SIDEWALK_Y, yaw: Math.atan2(-nx, -nz), style: benchStyleFor(s.district), sidewalk: true });
  }
  return out;
}

function nearestPathY(paths: WalkPath[], x: number, z: number): number {
  let best = 1e9,
    y = 0;
  for (const p of paths) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const d = segDist(x, z, p.pts[i].x, p.pts[i].z, p.pts[i + 1].x, p.pts[i + 1].z);
      if (d < best) {
        best = d;
        y = p.y;
      }
    }
  }
  return y;
}

export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax,
    dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

function pathDist(p: WalkPath, x: number, z: number): number {
  let best = 1e9;
  for (let i = 0; i < p.pts.length - 1; i++) best = Math.min(best, segDist(x, z, p.pts[i].x, p.pts[i].z, p.pts[i + 1].x, p.pts[i + 1].z));
  return best;
}

// ─────────────────────────────────────────────────────────────── lamps ──

function buildLamps(ctx: CityContext, benches: BenchPlace[]): LampSpot[] {
  const plan = ctx.plan,
    occ = ctx.occupancy;
  const out: LampSpot[] = [];
  // street lamps at their slots
  for (const s of plan.slots) {
    if (s.kind !== 'lamp') continue;
    out.push({ x: s.x, z: s.z, y: SIDEWALK_Y, yaw: s.yaw, style: streetLampStyle(s.district), street: true });
  }
  // terrain's promenade lamps (only to keep distance)
  const prom = (ctx.services.terrain as { promenadeLamps?: { x: number; z: number }[] } | undefined)?.promenadeLamps ?? [];
  const placed: LampSpot[] = [];
  const kinds: Partial<Record<WalkPath['kind'], { spacing: number; style: (x: number, z: number) => LampStyle }>> = {
    park: { spacing: 20, style: () => 'park' },
    riverbank: { spacing: 23, style: () => 'park' },
    boardwalk: { spacing: 16, style: () => 'beach' },
    plaza: {
      spacing: 15,
      style: (x, z) => {
        const d = districtAt(ctx, x, z);
        return d === 'civic' || d === 'oldtown' || d === 'market' ? 'classic' : 'plaza';
      },
    },
  };
  for (const p of plan.paths) {
    const cfg = kinds[p.kind];
    if (!cfg) continue;
    let total = 0;
    const segs: { ax: number; az: number; bx: number; bz: number; L: number; s0: number }[] = [];
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i],
        b = p.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, L, s0: total });
      total += L;
    }
    if (total < 7) continue;
    const spacing = cfg.spacing;
    const n = Math.max(1, Math.floor(total / spacing));
    const start = (total - (n - 1) * spacing) / 2;
    for (let k = 0; k < n; k++) {
      const s = start + k * spacing;
      for (const shift of [0, 2.5, -2.5, 5, -5]) {
        const ss = Math.min(total - 1, Math.max(1, s + shift));
        const seg = segs.find((g) => ss >= g.s0 && ss <= g.s0 + g.L) ?? segs[segs.length - 1];
        const f = (ss - seg.s0) / Math.max(1e-6, seg.L);
        const px = seg.ax + (seg.bx - seg.ax) * f,
          pz = seg.az + (seg.bz - seg.az) * f;
        const tx = (seg.bx - seg.ax) / Math.max(1e-6, seg.L),
          tz = (seg.bz - seg.az) / Math.max(1e-6, seg.L);
        // side: boardwalk lamps on the sea side, riverbank walk on the meadow side, others alternate
        let side = k % 2 === 0 ? 1 : -1;
        if (p.kind === 'boardwalk') side = tz > 0 ? -1 : 1;
        if (p.kind === 'riverbank' && Math.abs(tz) < 0.3) side = tx > 0 ? 1 : -1;
        const nx = -tz * side,
          nz = tx * side; // left normal * side  (side 1 → right of travel? see below)
        const off = p.width / 2 + 0.45;
        const x = px + nx * off,
          z = pz + nz * off;
        if (!lampOk(ctx, occ, p, x, z, benches, placed, prom, spacing)) continue;
        const style = cfg.style(x, z);
        const y = p.kind === 'boardwalk' ? p.y : Math.max(0, p.y - 0.03);
        // face the path
        placed.push({ x, z, y, yaw: Math.atan2(-nx, -nz), style, street: false });
        break;
      }
    }
  }
  return out.concat(placed);
}

function lampOk(
  ctx: CityContext,
  occ: OccupancyGrid,
  p: WalkPath,
  x: number,
  z: number,
  benches: BenchPlace[],
  placed: LampSpot[],
  prom: { x: number; z: number }[],
  spacing: number,
): boolean {
  const plan = ctx.plan;
  if (x < plan.slab.x0 + 1 || x > plan.slab.x1 - 1 || z < plan.slab.z0 + 1 || z > plan.slab.z1 - 1) return false;
  const hard = OCC.ROAD | OCC.SIDEWALK | OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.RAIL | OCC.PAVED;
  if (occAny(occ, x, z, 0.4, hard)) return false;
  if (p.kind !== 'boardwalk' && occ.has(x, z, OCC.PATH)) return false;
  for (const q of plan.paths) {
    if (q === p) continue;
    if (pathDist(q, x, z) < q.width / 2 + 0.6) return false;
  }
  for (const b of benches) if (Math.hypot(b.x - x, b.z - z) < 2.4) return false;
  for (const l of placed) if (Math.hypot(l.x - x, l.z - z) < spacing * 0.55) return false;
  for (const l of prom) if (Math.hypot(l.x - x, l.z - z) < 5) return false;
  for (const s of plan.slots) if (s.kind !== 'empty' && Math.hypot(s.x - x, s.z - z) < 2) return false;
  for (const f of plan.features) {
    if (f.kind === 'pier' || f.kind === 'breakwater' || f.kind === 'umbrellas') continue;
    const r = f.radius > 0 ? f.radius : 0;
    if (r > 0 && Math.hypot(f.x - x, f.z - z) < r + 1.4) return false;
  }
  return true;
}

// ───────────────────────────────────────────────────── garden borders ──

const BORDER_STEP = 0.25;

function buildBorders(ctx: CityContext, walk: Mask): Border[] {
  const plan = ctx.plan,
    occ = ctx.occupancy;
  const houses = plan.lots.filter((l) => l.kind === 'house');
  const driveways = plan.areas.filter((a) => a.kind === 'driveway').map((a) => a.rect);
  const taken = new Set<string>();
  const out: Border[] = [];
  const styleOf = (lot: Lot): BorderStyle => {
    const r = hrand(`front:${lot.seed}`);
    return r < 0.44 ? 'picket' : r < 0.7 ? 'wall' : 'hedge';
  };
  interface Edge {
    lot: Lot;
    ax: number;
    az: number;
    bx: number;
    bz: number;
    /** inward normal (into the lot) */
    ix: number;
    iz: number;
    front: boolean;
  }
  const edges: Edge[] = [];
  for (const lot of houses) {
    const r = lot.rect;
    const e: Edge[] = [
      { lot, ax: r.x0, az: r.z0, bx: r.x1, bz: r.z0, ix: 0, iz: 1, front: lot.front === 'N' },
      { lot, ax: r.x0, az: r.z1, bx: r.x1, bz: r.z1, ix: 0, iz: -1, front: lot.front === 'S' },
      { lot, ax: r.x0, az: r.z0, bx: r.x0, bz: r.z1, ix: 1, iz: 0, front: lot.front === 'W' },
      { lot, ax: r.x1, az: r.z0, bx: r.x1, bz: r.z1, ix: -1, iz: 0, front: lot.front === 'E' },
    ];
    edges.push(...e);
  }
  // street-facing first so they win over shared boundaries
  const streetFacing = (ed: Edge): boolean => {
    if (ed.front) return true;
    const mx = (ed.ax + ed.bx) / 2 - ed.ix * 1.0,
      mz = (ed.az + ed.bz) / 2 - ed.iz * 1.0;
    return occ.has(mx, mz, OCC.SIDEWALK | OCC.ROAD);
  };
  const ordered = edges.map((e) => ({ e, street: streetFacing(e) })).sort((a, b) => Number(b.street) - Number(a.street));
  for (const { e, street } of ordered) {
    const lot = e.lot;
    const style: BorderStyle = street ? styleOf(lot) : 'hedge';
    // fences sit just inside the lot; shared hedges on the boundary itself
    const inset = street ? (style === 'hedge' ? 0.45 : 0.22) : 0;
    const L = Math.hypot(e.bx - e.ax, e.bz - e.az);
    const tx = (e.bx - e.ax) / L,
      tz = (e.bz - e.az) / L;
    const n = Math.floor(L / BORDER_STEP);
    const ok: boolean[] = [];
    const halfT = style === 'hedge' ? 0.4 : 0.2;
    for (let k = 0; k <= n; k++) {
      const u = Math.min(L, k * BORDER_STEP);
      const x = e.ax + tx * u + e.ix * inset,
        z = e.az + tz * u + e.iz * inset;
      const key = `${Math.round(x * 4)},${Math.round(z * 4)}`;
      let good = !taken.has(key);
      // keep clear of driveways, door walks, buildings and anything solid
      if (good) for (const d of driveways) if (x > d.x0 - halfT - 0.15 && x < d.x1 + halfT + 0.15 && z > d.z0 - halfT - 0.15 && z < d.z1 + halfT + 0.15) good = false;
      if (good && (walk.get(x, z) & MASK_WALK) !== 0) good = false;
      if (good && occAny(occ, x, z, halfT * 0.5, OCC.BUILDING | OCC.SOLID | OCC.ROAD | OCC.SIDEWALK | OCC.PATH)) good = false;
      ok.push(good);
    }
    // runs
    let k = 0;
    while (k <= n) {
      if (!ok[k]) {
        k++;
        continue;
      }
      let j = k;
      while (j + 1 <= n && ok[j + 1]) j++;
      const u0 = k * BORDER_STEP,
        u1 = Math.min(L, j * BORDER_STEP);
      if (u1 - u0 >= 0.7) {
        const ax = e.ax + tx * u0 + e.ix * inset,
          az = e.az + tz * u0 + e.iz * inset,
          bx = e.ax + tx * u1 + e.ix * inset,
          bz = e.az + tz * u1 + e.iz * inset;
        out.push({
          ax,
          az,
          bx,
          bz,
          style,
          street,
          lot: lot.id,
          paint: Math.floor(hrand(`paint:${lot.seed}`) * 6),
          gateA: k > 0,
          gateB: j < n,
        });
        for (let q = k; q <= j; q++) {
          const u = Math.min(L, q * BORDER_STEP);
          taken.add(`${Math.round((e.ax + tx * u + e.ix * inset) * 4)},${Math.round((e.az + tz * u + e.iz * inset) * 4)}`);
          // also mark the boundary line itself so the neighbour does not double it
          taken.add(`${Math.round((e.ax + tx * u) * 4)},${Math.round((e.az + tz * u) * 4)}`);
        }
      }
      k = j + 1;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────── allotments ──

function buildPlots(ctx: CityContext): Plot[] {
  const out: Plot[] = [];
  const crops: CropKind[] = ['cabbage', 'lettuce', 'carrot', 'beans', 'corn', 'sunflower', 'pumpkin', 'berry'];
  for (const a of ctx.plan.areas) {
    if (a.kind !== 'allotment') continue;
    const r = a.rect;
    const W = r.x1 - r.x0,
      D = r.z1 - r.z0;
    const cols = Math.max(1, Math.round(W / 7.5)),
      rows = Math.max(1, Math.round(D / 6.8));
    const gap = 1.3;
    const pw = (W - gap * (cols + 1)) / cols,
      pd = (D - gap * (rows + 1)) / rows;
    let k = 0;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x0 = r.x0 + gap + i * (pw + gap),
          z0 = r.z0 + gap + j * (pd + gap);
        const rect = { x0, z0, x1: x0 + pw, z1: z0 + pd };
        const h = (s: string) => hrand(`plot:${a.id}:${i}:${j}:${s}`);
        const nC = 2 + Math.floor(h('n') * 2);
        const cs: CropKind[] = [];
        for (let c = 0; c < nC; c++) cs.push(crops[Math.floor(h(`c${c}`) * crops.length)]);
        const hasShed = h('shed') < 0.55;
        const corner = Math.floor(h('corner') * 4);
        const sx = corner % 2 === 0 ? x0 + 1.1 : x0 + pw - 1.1;
        const sz = corner < 2 ? z0 + 1.0 : z0 + pd - 1.0;
        out.push({
          rect,
          along: h('along') < 0.5 ? 'x' : 'z',
          crops: cs,
          shed: hasShed ? { x: sx, z: sz, yaw: corner < 2 ? 0 : Math.PI, paint: Math.floor(h('paint') * 5) } : null,
          barrel: h('barrel') < 0.6 ? { x: corner % 2 === 0 ? x0 + pw - 0.5 : x0 + 0.5, z: corner < 2 ? z0 + 0.5 : z0 + pd - 0.5 } : null,
          tree: h('tree') < 0.3 && !hasShed ? { x: (x0 + x0 + pw) / 2 + (h('tx') - 0.5) * pw * 0.4, z: corner < 2 ? z0 + pd - 1.4 : z0 + 1.4 } : null,
        });
        k++;
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── LOD ──

/** Beyond this camera distance fine details (flowers, crops, benches, fences...) are sub-pixel. */
export const LOD_DIST = 300;

/**
 * Camera-distance switch shared by vegetation & props: the orbit distance (camera service) or the
 * distance along the view ray to the ground plane, with a little hysteresis so it never flickers.
 */
export class DistanceLod {
  private isNear = true;
  private readonly dir = new THREE.Vector3();
  constructor(private ctx: CityContext) {}
  distance(): number {
    const cam = this.ctx.camera;
    const svc = this.ctx.services.camera as { getState?: () => { distance: number } } | undefined;
    const st = svc?.getState?.();
    if (st && Number.isFinite(st.distance)) return st.distance;
    cam.getWorldDirection(this.dir);
    return this.dir.y < -0.05 ? cam.position.y / -this.dir.y : 1e4;
  }
  near(): boolean {
    const d = this.distance();
    if (this.isNear && d > LOD_DIST * 1.04) this.isNear = false;
    else if (!this.isNear && d < LOD_DIST * 0.96) this.isNear = true;
    return this.isNear;
  }
}

// ───────────────────────────────────────────────────────────── chunks ──

/**
 * Optional west/east split of the near meshes (x < CHUNK_X → chunk 0). Measured: from the diorama
 * camera angles nearly every view sees across the whole board, so the split never culled anything and
 * only added draw calls — it is disabled (all geometry in chunk 1; empty chunk meshes are not added).
 */
export const CHUNK_X = -1e9;
export const chunkOf = (x: number): number => (x < CHUNK_X ? 0 : 1);

/**
 * Per-frame AABB-vs-frustum culling of chunk meshes (three.js only culls by bounding sphere, which
 * is useless for half-city meshes). Boxes are expanded so trees just outside the view still cast
 * their shadows into it. Uses last frame's camera matrices (the margin covers the lag).
 */
export class ChunkCuller {
  private readonly frustum = new THREE.Frustum();
  private readonly m = new THREE.Matrix4();
  private readonly items: { mesh: THREE.Object3D; box: THREE.Box3; gate: () => boolean }[] = [];
  constructor(private ctx: CityContext) {}
  add(mesh: THREE.Mesh, gate: () => boolean = () => true, margin = 24): void {
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!.clone();
    if (!box.isEmpty()) box.expandByVector(new THREE.Vector3(margin, 6, margin));
    this.items.push({ mesh, box, gate });
  }
  update(): void {
    const cam = this.ctx.camera;
    this.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    for (const it of this.items) it.mesh.visible = it.gate() && !it.box.isEmpty() && this.frustum.intersectsBox(it.box);
  }
}

/**
 * Split a merged static geometry into square world cells by triangle centroid (shared vertex buffers, one index
 * per cell), so each cell is culled on its own. The west/east split above never culled from the aerial views, but
 * at street level a city-wide mesh of fine furniture drew every bench of the town each frame.
 */
export function splitByCells(geo: THREE.BufferGeometry, cell: number): THREE.BufferGeometry[] {
  const pos = geo.getAttribute('position');
  const index = geo.index;
  const n = index ? index.count : pos.count;
  const buckets = new Map<number, number[]>();
  for (let t = 0; t + 2 < n; t += 3) {
    const a = index ? index.getX(t) : t,
      b = index ? index.getX(t + 1) : t + 1,
      c = index ? index.getX(t + 2) : t + 2;
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3,
      cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const key = (Math.floor(cx / cell) + 512) * 1024 + (Math.floor(cz / cell) + 512);
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(a, b, c);
  }
  return [...buckets.values()].map((ids) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr);
    g.setIndex(ids);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
}

// ─────────────────────────────────────────────────────────────── misc ──

/** Point in the walking band behind a slot (useful for "facing the pedestrians"). */
export function slotWalkPoint(s: StreetSlot): { x: number; z: number } {
  const nx = Math.sin(s.yaw),
    nz = Math.cos(s.yaw);
  return { x: s.x + nx * (WALK_OFFSET - FURN_OFFSET), z: s.z + nz * (WALK_OFFSET - FURN_OFFSET) };
}
