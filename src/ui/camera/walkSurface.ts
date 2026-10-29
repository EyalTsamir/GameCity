// Where a person can stand in Tinyhaven, and how high the ground is under their feet — for the
// first-person walk (./firstPerson.ts). Built once from plan data, no meshes:
//  * height = the rendered terrain (ctx.services.terrain / landscape beyond the slab), raised to the
//    sidewalk tops (0.15), the walkway decks (footbridge arches, boardwalk, pier, promenade — the same
//    profile the pedestrians walk on, see core/pedNetwork.ts) and the station platform with its stairs
//    and ramps (sim/rail/station.ts);
//  * solid  = buildings and solid props (occupancy grid), water without a deck over it, the fenced rail
//    corridor (level crossings stay open), tree trunks, street furniture, the stair cheek walls and the
//    ramp railings. Beyond the slab (world mode) only the landscape's water; the tabletop's edge in ?diorama.
// Queries are a few grid lookups: cheap enough for a handful of sub-steps per frame.

import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import { SIDEWALK_Y } from '../../core/constants';
import type { Rect } from '../../core/geom';

/** a walkway segment: centre line a→b, half width, height profile (bridges arch up to yMid) */
interface Seg {
  ax: number;
  az: number;
  ux: number;
  uz: number;
  len: number;
  half: number;
  yA: number;
  yB: number;
  yMid: number;
  /** may span water (bridge, pier, boardwalk) */
  deck: boolean;
}

interface Disc {
  x: number;
  z: number;
  r: number;
}

/** a raised rectangle with a fixed height (pier deck, boardwalk, platform) */
interface Slab {
  r: Rect;
  y: number;
  deck: boolean;
}

const CELL = 8;

export interface WalkSurfaceOpts {
  /** ground height anywhere (terrain inside the slab, the landscape beyond) */
  ground(x: number, z: number): number;
  /** water beyond the slab (world mode), null in the diorama (the tabletop ends at the slab) */
  outsideWater: ((x: number, z: number) => boolean) | null;
}

export class WalkSurface {
  private readonly ctx: CityContext;
  private readonly ground: (x: number, z: number) => number;
  private readonly outsideWater: ((x: number, z: number) => boolean) | null;
  private readonly x0: number;
  private readonly z0: number;
  private readonly x1: number;
  private readonly z1: number;
  private readonly cw: number;
  private readonly ch: number;
  private readonly segCells: Seg[][];
  private readonly slabs: Slab[] = [];
  /** solid thin boxes (stair cheek walls, ramp railings) */
  private readonly walls: Rect[] = [];
  private discCells: Disc[][] | null = null;
  private readonly platform: { r: Rect; y: number; zS: number; rise: number; tread: number; steps: number; stairX: number; rampLand: number; rampTop: number; rampEnd: number; rampW: number } | null;
  private readonly railFlags = OCC.ROAD | OCC.SIDEWALK;

  constructor(ctx: CityContext, opts: WalkSurfaceOpts) {
    this.ctx = ctx;
    this.ground = opts.ground;
    this.outsideWater = opts.outsideWater;
    const { plan } = ctx;
    const s = plan.slab;
    this.x0 = s.x0;
    this.z0 = s.z0;
    this.x1 = s.x1;
    this.z1 = s.z1;
    this.cw = Math.ceil((s.x1 - s.x0) / CELL) + 1;
    this.ch = Math.ceil((s.z1 - s.z0) / CELL) + 1;
    this.segCells = Array.from({ length: this.cw * this.ch }, () => []);

    // ── walkways: the same node heights / bridge arches as core/pedNetwork.ts
    for (const P of plan.paths) {
      const n = P.pts.length;
      const deck = P.kind === 'bridge' || P.kind === 'pier' || P.kind === 'boardwalk';
      const ys: number[] = [];
      for (let k = 0; k < n; k++) ys.push(P.kind === 'bridge' && k > 0 && k < n - 1 ? P.y + 0.45 : P.y);
      for (let k = 0; k < n - 1; k++) {
        const a = P.pts[k],
          b = P.pts[k + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.05) continue;
        const mid = P.kind === 'bridge' && P.yMid !== undefined && k > 0 && k < n - 2 ? P.yMid : NaN;
        // footbridge decks are a little wider than the walk on them (railings at the deck edge)
        const half = P.width / 2 + (P.kind === 'bridge' ? 0.15 : 0.1);
        this.addSeg({ ax: a.x, az: a.z, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, len, half, yA: ys[k], yB: ys[k + 1], yMid: mid, deck });
      }
    }
    // ── decks wider than their walk: the pier, the boardwalk strip
    for (const f of plan.features) {
      if (f.kind === 'pier' && f.a && f.b) {
        const w = Number(f.params?.width ?? 13) / 2;
        this.slabs.push({ r: { x0: Math.min(f.a.x, f.b.x), z0: f.a.z - w, x1: Math.max(f.a.x, f.b.x), z1: f.a.z + w }, y: Number(f.params?.deckY ?? 0.3), deck: true });
      }
    }
    for (const a of plan.areas) if (a.kind === 'boardwalk') this.slabs.push({ r: a.rect, y: 0.3, deck: true });

    // ── the station platform (sim/rail/station.ts): stairs in the middle, ramps at both ends, railings
    const st = plan.rail?.stations?.[0];
    if (st) {
      const P = st.platform;
      const Y = st.platformY;
      const risers = 6;
      this.platform = { r: P, y: Y, zS: P.z1, rise: Y / risers, tread: 0.31, steps: risers - 1, stairX: 3, rampLand: 31.8, rampTop: 33.5, rampEnd: 43.5, rampW: 1.7 };
      const pf = this.platform;
      const runEnd = pf.zS + (risers - 1) * pf.tread + 0.1;
      // stair cheek walls
      this.walls.push({ x0: pf.stairX, z0: pf.zS, x1: pf.stairX + 0.3, z1: runEnd }, { x0: -pf.stairX - 0.3, z0: pf.zS, x1: -pf.stairX, z1: runEnd });
      // south-edge railings between the stairs and the ramps, and across the platform ends
      const zr = pf.zS - 0.12;
      for (const [a, b] of [
        [-pf.rampLand, -pf.stairX - 0.3],
        [pf.stairX + 0.3, pf.rampLand],
        [P.x0, -pf.rampTop],
        [pf.rampTop, P.x1],
      ])
        this.walls.push({ x0: a, z0: zr - 0.06, x1: b, z1: zr + 0.06 });
      // the ramps' outer railing (south side)
      const zb = pf.zS + pf.rampW;
      this.walls.push({ x0: pf.rampTop, z0: zb - 0.1, x1: pf.rampEnd, z1: zb + 0.02 }, { x0: -pf.rampEnd, z0: zb - 0.1, x1: -pf.rampTop, z1: zb + 0.02 });
    } else this.platform = null;
  }

  private addSeg(s: Seg): void {
    const bx = s.ax + s.ux * s.len,
      bz = s.az + s.uz * s.len;
    const i0 = Math.max(0, Math.floor((Math.min(s.ax, bx) - s.half - this.x0) / CELL)),
      i1 = Math.min(this.cw - 1, Math.floor((Math.max(s.ax, bx) + s.half - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(s.az, bz) - s.half - this.z0) / CELL)),
      j1 = Math.min(this.ch - 1, Math.floor((Math.max(s.az, bz) + s.half - this.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.segCells[j * this.cw + i].push(s);
  }

  /** tree trunks + street furniture, collected lazily (vegetation / props may still be building at first) */
  private discs(): Disc[][] {
    if (this.discCells) return this.discCells;
    const cells: Disc[][] = Array.from({ length: this.cw * this.ch }, () => []);
    const add = (x: number, z: number, r: number) => {
      const i0 = Math.max(0, Math.floor((x - r - this.x0) / CELL)),
        i1 = Math.min(this.cw - 1, Math.floor((x + r - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((z - r - this.z0) / CELL)),
        j1 = Math.min(this.ch - 1, Math.floor((z + r - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * this.cw + i].push({ x, z, r });
    };
    const veg = this.ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined;
    // a trunk is a fraction of the crown (r = crown radius); shrubs and hedges are walked through
    for (const t of veg?.trees ?? []) if (t.h > 3.2) add(t.x, t.z, Math.min(0.45, Math.max(0.16, t.r * 0.09)));
    // keep-clear discs of lamps, benches, bins, café tables… are roomier than the objects themselves
    const props = this.ctx.services.props as { discs?: { x: number; z: number; r: number }[] } | undefined;
    for (const d of props?.discs ?? []) if (d.r <= 1.6) add(d.x, d.z, Math.min(0.55, d.r * 0.55));
    this.discCells = cells;
    return cells;
  }

  private cellIdx(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / CELL),
      j = Math.floor((z - this.z0) / CELL);
    return i < 0 || j < 0 || i >= this.cw || j >= this.ch ? -1 : j * this.cw + i;
  }

  inSlab(x: number, z: number): boolean {
    return x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1;
  }

  /** height of the station platform / its stairs / ramps at (x, z), or -Infinity */
  private platformY(x: number, z: number): number {
    const pf = this.platform;
    if (!pf) return -Infinity;
    const r = pf.r;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return pf.y;
    if (z > pf.zS && x > -pf.stairX && x < pf.stairX) {
      const i = Math.floor((z - pf.zS) / pf.tread);
      if (i < pf.steps) return pf.y - pf.rise * (i + 1);
      return -Infinity;
    }
    if (z > pf.zS && z < pf.zS + pf.rampW) {
      const ax = Math.abs(x);
      if (ax >= pf.rampLand && ax <= pf.rampTop) return pf.y;
      if (ax > pf.rampTop && ax < pf.rampEnd) return pf.y + (0.02 - pf.y) * ((ax - pf.rampTop) / (pf.rampEnd - pf.rampTop));
    }
    return -Infinity;
  }

  /** highest walkway deck / raised slab at (x, z) (-Infinity if none); `deck` → only those spanning water */
  private deckY(x: number, z: number, deckOnly: boolean): number {
    let y = -Infinity;
    const k = this.cellIdx(x, z);
    if (k >= 0) {
      for (const s of this.segCells[k]) {
        if (deckOnly && !s.deck) continue;
        const px = x - s.ax,
          pz = z - s.az;
        const along = px * s.ux + pz * s.uz;
        if (along < -s.half * 0.5 || along > s.len + s.half * 0.5) continue;
        const lat = Math.abs(px * s.uz - pz * s.ux);
        if (lat > s.half) continue;
        const t = Math.min(1, Math.max(0, along / s.len));
        let h = s.yA + (s.yB - s.yA) * t;
        if (s.yMid === s.yMid) h += (s.yMid - (s.yA + s.yB) / 2) * Math.sin(Math.PI * t);
        if (h > y) y = h;
      }
    }
    for (const sl of this.slabs) {
      if (deckOnly && !sl.deck) continue;
      const r = sl.r;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && sl.y > y) y = sl.y;
    }
    return y;
  }

  /** height of the walking surface under (x, z) */
  heightAt(x: number, z: number): number {
    let h = this.ground(x, z);
    if (!this.inSlab(x, z)) return h;
    const o = this.ctx.occupancy.get(x, z);
    if (o & OCC.SIDEWALK) h = Math.max(h, SIDEWALK_Y);
    const p = this.platformY(x, z);
    if (p > -Infinity) return p;
    const d = this.deckY(x, z, false);
    // walks lie on the ground (plazas 0.02, riverbank 0.03…): only decks lift the feet off it
    if (d > h + 0.05) h = d;
    return h;
  }

  /** a solid point (building, prop, water without a deck, rail corridor, out of the world)? */
  solidAt(x: number, z: number): boolean {
    if (!this.inSlab(x, z)) {
      if (!this.outsideWater) return true;
      return this.outsideWater(x, z);
    }
    if (this.platformY(x, z) > -Infinity) return false;
    const o = this.ctx.occupancy.get(x, z);
    if (o & (OCC.BUILDING | OCC.SOLID)) return true;
    if (o & OCC.WATER) return !(this.deckY(x, z, true) > -Infinity);
    if (o & OCC.RAIL && !(o & this.railFlags)) return true;
    return false;
  }

  /** is a body of radius r standing at (x, z) clear of every solid? */
  clear(x: number, z: number, r: number): boolean {
    if (this.solidAt(x, z)) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (this.solidAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
    }
    for (const w of this.walls) if (x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r) return false;
    if (this.inSlab(x, z)) {
      const k = this.cellIdx(x, z);
      if (k >= 0)
        for (const d of this.discs()[k]) {
          const rr = d.r + r;
          if ((x - d.x) ** 2 + (z - d.z) ** 2 < rr * rr) return false;
        }
    }
    return true;
  }

  /** debug (?camdebug → camera service walkProbe): what is at (x, z) for a body of radius r */
  probe(x: number, z: number, r: number): Record<string, unknown> {
    const k = this.inSlab(x, z) ? this.cellIdx(x, z) : -1;
    const discs = k >= 0 ? this.discs()[k].filter((d) => Math.hypot(x - d.x, z - d.z) < d.r + r + 1).map((d) => [d.x, d.z, d.r].map((v) => Math.round(v * 100) / 100)) : [];
    const walls = this.walls.filter((w) => x > w.x0 - r - 1 && x < w.x1 + r + 1 && z > w.z0 - r - 1 && z < w.z1 + r + 1);
    return { solid: this.solidAt(x, z), clear: this.clear(x, z, r), height: this.heightAt(x, z), ground: this.ground(x, z), flags: this.flags(x, z), deck: this.deckY(x, z, true), discs, walls };
  }

  /** occupancy bits at (x, z) (0 beyond the slab) */
  flags(x: number, z: number): number {
    return this.inSlab(x, z) ? this.ctx.occupancy.get(x, z) : 0;
  }

  /** what the feet are on (footstep sound) */
  material(x: number, z: number): 'deck' | 'paving' | 'grass' | 'sand' {
    if (!this.inSlab(x, z)) return 'grass';
    if (this.platformY(x, z) > -Infinity) return 'paving';
    if (this.deckY(x, z, true) > -Infinity) return 'deck';
    const o = this.ctx.occupancy.get(x, z);
    if (o & (OCC.ROAD | OCC.SIDEWALK | OCC.PAVED)) return 'paving';
    if (x > 121.2 && z > -6 && z < 110) return 'sand';
    return o & OCC.PATH ? 'paving' : 'grass';
  }
}
