// Anchor points the buildings module exposes to other modules as `ctx.services.buildings`
// (life: chimney smoke, laundry lines, bunting, perching birds; streetlife: balconies).
//
// Generators record anchors in their LOCAL frame through the helpers below; the collector converts
// them to world space with the trim builder's current frame (all builders share the lot frame).
// Everything is plain data (three-free), built once at start-up.
//
// Conventions: world metres, Y up; normals are horizontal unit vectors pointing out of the facade.

import type { BuildingKind, DistrictKind, Lot } from '../../core/plan';
import type { Builder } from './mesh';

/** Top of a chimney flue (centre of the pot tops) — smoke starts here. */
export interface ChimneyTop {
  x: number;
  y: number;
  z: number;
  /** stack size (m) — wide stacks (hotels) smoke more */
  w: number;
  d: number;
  lot: number;
  district: DistrictKind;
  kind: BuildingKind;
}

/** A balcony / roof terrace floor. Railing runs along the outer edge, `rail` above the floor. */
export interface BalconyAnchor {
  /** centre of the floor slab (top surface) */
  x: number;
  y: number;
  z: number;
  /** outward facade normal */
  nx: number;
  nz: number;
  /** width along the facade, depth out of the facade (m) */
  w: number;
  d: number;
  /** railing / parapet height above the floor */
  rail: number;
  lot: number;
  district: DistrictKind;
  kind: 'balcony' | 'terrace';
}

/** An exposed, street-facing building facade (ground-level line + heights). */
export interface FacadeSpan {
  /** facade base line, left → right seen from outside */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** outward normal */
  nx: number;
  nz: number;
  /** eave / parapet-free top of the wall */
  top: number;
  /** floor height of the first upper storey (laundry / bunting must stay above it) */
  upper: number;
  floors: number;
  lot: number;
  district: DistrictKind;
  kind: BuildingKind;
}

/** A line between two facades (for bunting, festoon lights or laundry), both ends fixed on walls. */
export interface LineSpan {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** 'street' = across a street between facing fronts; 'court' = across a back courtyard / alley */
  kind: 'street' | 'court';
  district: DistrictKind;
  /** lots the two ends are fixed to */
  lotA: number;
  lotB: number;
}

/** Horizontal-ish perch line (roof ridge, parapet coping) for birds. */
export interface Perch {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  lot: number;
  kind: 'ridge' | 'parapet';
}

/** A rigid laundry line on a balcony (wire drawn by buildings; cloth hangs below it). */
export interface LaundryLine {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** outward facade normal of the balcony */
  nx: number;
  nz: number;
  lot: number;
}

/** Kitchen / bakery extract flue top (shopfront lots) — light steam / cooking smoke starts here. */
export interface VentTop {
  x: number;
  y: number;
  z: number;
  kind: 'bakery' | 'kitchen';
  /** the shop's name (sign text) */
  shop: string;
  lot: number;
}

/** A ground-floor shop front (old town / market): facade line, name and interior type. */
export interface ShopFront {
  /** facade base line, left → right seen from the street */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** outward normal (towards the street) */
  nx: number;
  nz: number;
  name: string;
  /** 1 café / bar, 2 bakery / deli, 3 books, 4 florist / grocer, 5 fashion, 6 pharmacy / hardware, 7 gallery / toys */
  type: number;
  /** door centre on the facade line */
  doorX: number;
  doorZ: number;
  lot: number;
}

/** Somewhere on a facade that lettering may go (world/lettering): a rectangle on a wall, a door, a sign board. */
export interface LetterSpot {
  kind: 'fascia' | 'band' | 'window' | 'door' | 'wall' | 'tenants' | 'number' | 'awning' | 'upper';
  lot: number;
  /** world position of the rectangle's lower left corner, seen from outside */
  x: number;
  y: number;
  z: number;
  /** world direction of its width, and out of the wall */
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  w: number;
  h: number;
  /** the generator's shop word */
  word?: string;
  /** paint and lettering colours, css hex */
  bg?: number;
  fg?: number;
  /** door: glazed */
  glass?: boolean;
  /** how far a door stands back from its wall */
  depth?: number;
  seed?: number;
  /** a number on the plate, floors of a building */
  num?: number;
  style?: number;
}

/** A place on a wall in the world, for the near fittings (world/handheight): u runs along the wall from here, o out of it. */
export interface HandFrame {
  lot: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

/** A door as doorNiche built it. u = 0 is the left edge of the opening; the leaf stands at o = -d. */
export interface HandDoor extends HandFrame {
  w: number;
  /** the opening's height and the leaf's (lower with a fanlight); the leaf starts on the threshold at 0.14 */
  h: number;
  leafH: number;
  d: number;
  /** how far the architrave stands out of the wall */
  fo: number;
  glass: boolean;
  plain: boolean;
  transom: boolean;
  seed: number;
  /** joinery: 0 four panels, 1 six panels, 2 half glazed, 3 ledged boards */
  v: number;
  /** panel rectangles u0, u1, y0, y1 */
  panels: number[];
  /** y of the letter plate's middle; 0 = this door has none */
  letterY: number;
  kick: boolean;
  doorCol: number;
  frameCol: number;
  metal: number;
  /** a step the generator built in front: its top and how deep it is out of the wall */
  stepY?: number;
  stepO?: number;
}

/** A stretch of wall standing on the ground. u = 0 is its left end. Its windows, if any, are given by the grid (in its own u). */
export interface HandWall extends HandFrame {
  L: number;
  y1: number;
  /** left edge of the first window cell, cell width, cells, rows' bottom, row height, rows; window inside a cell */
  grid: { u0: number; cw: number; n: number; v0: number; ch: number; m: number; wx0: number; wx1: number; wy0: number; wy1: number } | null;
  pattern: number;
  color: number;
}

/** A rainwater pipe on a wall: u = 0 at the pipe, po out of the wall. */
export interface HandPipe extends HandFrame {
  r: number;
  po: number;
  y0: number;
  y1: number;
  color: number;
  /** room out from the wall at the foot */
  room: number;
  /** draw a hopper head at the top (near only: world/handheight added this pipe) */
  hopper?: boolean;
}

/** A step a generator built in front of a door: its top, how deep it is. */
export interface HandStep {
  x: number;
  z: number;
  y: number;
  d: number;
}

/** A fitting a generator made that wants its hardware close up. */
export interface HandSpot extends HandFrame {
  kind: 'garage' | 'rollup' | 'lobby' | 'meter' | 'cabinet' | 'shutter' | 'riser' | 'winder';
  /** u = 0 at its left edge */
  w: number;
  h: number;
  /** bottom */
  y: number;
  /** where its face is, out of the wall */
  o: number;
  color: number;
  seed: number;
}

export interface BuildingsService {
  /** the far facades' atlas (farFacade.ts, scripts/bake.mjs): one pass, and the fingerprint of what it depends on */
  renderFarBake?: (pass: number) => import('three').WebGLRenderTarget;
  farBakeKey?: () => string;
  shops: ShopFront[];
  /** where lettering can go (world/lettering) */
  letterSpots: LetterSpot[];
  chimneys: ChimneyTop[];
  balconies: BalconyAnchor[];
  facades: FacadeSpan[];
  spans: LineSpan[];
  perches: Perch[];
  doorLamps: DoorLamp[];
  handDoors: HandDoor[];
  handWalls: HandWall[];
  handPipes: HandPipe[];
  handSpots: HandSpot[];
  handSteps: HandStep[];
  handTops: Map<number, number>;
  laundry: LaundryLine[];
  vents: VentTop[];
  /**
   * Show / hide the static cloth boxes on balcony laundry lines (a separate small mesh). Life calls
   * setStaticLaundry(false) once its animated cloth hangs on `laundry`, so there is never a bare state.
   */
  setStaticLaundry(on: boolean): void;
  /** diagnostics: 0 off, 1 weathering mask, 2 wall-quad info */
  setDebug(n: number): void;
  houses(): unknown;
  /** facade shader uniforms (perf harness: runtime A/B of uWinRefl, uWinDepth, uWallRelief …) */
  uniforms: Record<string, { value: unknown }>;
  /** setbacks per lot id: from height y0 up the volume is the world rect (sorted by y0) — explore rooms */
  massTiers: Map<number, { y0: number; x0: number; z0: number; x1: number; z1: number }[]>;
}

/** A lantern on a wall or porch beside a door (lamps: its light in the night light map). */
export interface DoorLamp {
  x: number;
  y: number;
  z: number;
  /** outward from the wall */
  nx: number;
  nz: number;
  /** the size of its lit box (m): across, high, out; 0 = no box of this shape (a flat light under a canopy) */
  w: number;
  h: number;
  d: number;
  /** from the box's back to the wall */
  back: number;
  lot: number;
}

/** Module-level collector (reset per module creation). */
class AnchorSink {
  doorLamps: DoorLamp[] = [];
  handDoors: HandDoor[] = [];
  handWalls: HandWall[] = [];
  handPipes: HandPipe[] = [];
  handSpots: HandSpot[] = [];
  handSteps: HandStep[] = [];
  /** the top of a lot's walls, without the gables: where a gutter can be */
  handTops = new Map<number, number>();
  chimneys: ChimneyTop[] = [];
  balconies: BalconyAnchor[] = [];
  perches: Perch[] = [];
  laundry: LaundryLine[] = [];
  vents: VentTop[] = [];
  shops: ShopFront[] = [];
  letterSpots: LetterSpot[] = [];
  private lot: Lot | null = null;
  private b: Builder | null = null;

  reset(): void {
    this.doorLamps = [];
    this.handDoors = [];
    this.handWalls = [];
    this.handPipes = [];
    this.handSpots = [];
    this.handSteps = [];
    this.handTops = new Map();
    this.chimneys = [];
    this.balconies = [];
    this.perches = [];
    this.laundry = [];
    this.vents = [];
    this.shops = [];
    this.letterSpots = [];
    this.lot = null;
    this.b = null;
  }

  /** current lot + the builder whose frame maps local → world */
  begin(lot: Lot, frameOf: Builder): void {
    this.lot = lot;
    this.b = frameOf;
  }

  end(): void {
    this.lot = null;
    this.b = null;
  }

  /** local position, local outward normal */
  doorLamp(x: number, y: number, z: number, nx: number, nz: number, w = 0, h = 0, d = 0, back = 0): void {
    const { b } = this;
    if (!b) return;
    const wx = b.toWorldX(x, z),
      wz = b.toWorldZ(x, z);
    this.doorLamps.push({ x: wx, y, z: wz, nx: b.toWorldX(x + nx, z + nz) - wx, nz: b.toWorldZ(x + nx, z + nz) - wz, w, h, d, back, lot: this.lot?.id ?? -1 });
  }

  /** a step in front of a door, local centre of its front edge on the wall */
  handStep(x: number, z: number, y: number, d: number): void {
    const { b } = this;
    if (b) this.handSteps.push({ x: b.toWorldX(x, z), z: b.toWorldZ(x, z), y, d });
  }

  /** the world frame of a side at u */
  handFrame(sg: { x0: number; z0: number; tx: number; tz: number; nx: number; nz: number }, u: number): HandFrame | null {
    const { lot, b } = this;
    if (!lot || !b) return null;
    const lx = sg.x0 + sg.tx * u,
      lz = sg.z0 + sg.tz * u;
    const ox = b.toWorldX(0, 0),
      oz = b.toWorldZ(0, 0);
    return { lot: lot.id, x: b.toWorldX(lx, lz), z: b.toWorldZ(lx, lz), tx: b.toWorldX(sg.tx, sg.tz) - ox, tz: b.toWorldZ(sg.tx, sg.tz) - oz, nx: b.toWorldX(sg.nx, sg.nz) - ox, nz: b.toWorldZ(sg.nx, sg.nz) - oz };
  }

  chimney(x: number, z: number, yTop: number, w: number, d: number): void {
    const { lot, b } = this;
    if (!lot || !b) return;
    this.chimneys.push({ x: b.toWorldX(x, z), y: yTop, z: b.toWorldZ(x, z), w, d, lot: lot.id, district: lot.district, kind: lot.kind });
  }

  /** local centre (x, z) of the floor top at y, local outward normal (nx, nz) */
  balcony(x: number, y: number, z: number, nx: number, nz: number, w: number, d: number, rail: number, kind: 'balcony' | 'terrace' = 'balcony'): void {
    const { lot, b } = this;
    if (!lot || !b) return;
    const wx = b.toWorldX(x, z),
      wz = b.toWorldZ(x, z);
    const ox = b.toWorldX(0, 0),
      oz = b.toWorldZ(0, 0);
    const wnx = b.toWorldX(nx, nz) - ox,
      wnz = b.toWorldZ(nx, nz) - oz;
    const l = Math.hypot(wnx, wnz) || 1;
    this.balconies.push({ x: wx, y, z: wz, nx: wnx / l, nz: wnz / l, w, d, rail, lot: lot.id, district: lot.district, kind });
  }

  /** laundry wire between two local points; (nx, nz) local outward normal */
  laundryLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number, nx: number, nz: number): void {
    const { lot, b } = this;
    if (!lot || !b) return;
    const ox = b.toWorldX(0, 0),
      oz = b.toWorldZ(0, 0);
    const wnx = b.toWorldX(nx, nz) - ox,
      wnz = b.toWorldZ(nx, nz) - oz;
    const l = Math.hypot(wnx, wnz) || 1;
    this.laundry.push({ ax: b.toWorldX(ax, az), ay, az: b.toWorldZ(ax, az), bx: b.toWorldX(bx, bz), by, bz: b.toWorldZ(bx, bz), nx: wnx / l, nz: wnz / l, lot: lot.id });
  }

  /** shop front between local points a and b (left → right), local outward normal, door at local (dx, dz) */
  shop(ax: number, az: number, bx: number, bz: number, nx: number, nz: number, dx: number, dz: number, name: string, type: number): void {
    const { lot, b } = this;
    if (!lot || !b) return;
    const ox = b.toWorldX(0, 0),
      oz = b.toWorldZ(0, 0);
    const wnx = b.toWorldX(nx, nz) - ox,
      wnz = b.toWorldZ(nx, nz) - oz;
    const l = Math.hypot(wnx, wnz) || 1;
    this.shops.push({ ax: b.toWorldX(ax, az), az: b.toWorldZ(ax, az), bx: b.toWorldX(bx, bz), bz: b.toWorldZ(bx, bz), nx: wnx / l, nz: wnz / l, name, type, doorX: b.toWorldX(dx, dz), doorZ: b.toWorldZ(dx, dz), lot: lot.id });
  }

  /** a rectangle [uA, uB] × [y0, y1] at offset o from the side's wall line, for the lettering module */
  spot(sg: { x0: number; z0: number; tx: number; tz: number; nx: number; nz: number }, kind: LetterSpot['kind'], uA: number, uB: number, y0: number, y1: number, o: number, extra?: Partial<LetterSpot>): void {
    const { lot, b } = this;
    if (!lot || !b) return;
    const lx = sg.x0 + sg.tx * uA + sg.nx * o,
      lz = sg.z0 + sg.tz * uA + sg.nz * o;
    const ox = b.toWorldX(0, 0),
      oz = b.toWorldZ(0, 0);
    this.letterSpots.push({
      kind,
      lot: lot.id,
      x: b.toWorldX(lx, lz),
      y: y0,
      z: b.toWorldZ(lx, lz),
      tx: b.toWorldX(sg.tx, sg.tz) - ox,
      tz: b.toWorldZ(sg.tx, sg.tz) - oz,
      nx: b.toWorldX(sg.nx, sg.nz) - ox,
      nz: b.toWorldZ(sg.nx, sg.nz) - oz,
      w: uB - uA,
      h: y1 - y0,
      ...extra,
    });
  }

  vent(x: number, y: number, z: number, kind: 'bakery' | 'kitchen', shop: string): void {
    const { lot, b } = this;
    if (!lot || !b) return;
    this.vents.push({ x: b.toWorldX(x, z), y, z: b.toWorldZ(x, z), kind, shop, lot: lot.id });
  }

  /** perch line between two local points */
  perch(ax: number, ay: number, az: number, bx: number, by: number, bz: number, kind: 'ridge' | 'parapet'): void {
    const { lot, b } = this;
    if (!lot || !b) return;
    if (Math.hypot(bx - ax, bz - az) < 1.5) return;
    this.perches.push({ ax: b.toWorldX(ax, az), ay, az: b.toWorldZ(ax, az), bx: b.toWorldX(bx, bz), by, bz: b.toWorldZ(bx, bz), lot: lot.id, kind });
  }
}

export const anchors = new AnchorSink();

// ───────────────────────────────────────────── facades + line spans ──

const FRONT_N: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/**
 * Street-facing facades of every lot (from the plan footprints): the front side of each footprint,
 * minus nothing (party walls are side walls). Heights from the lot.
 */
export function collectFacades(lots: Lot[]): FacadeSpan[] {
  const out: FacadeSpan[] = [];
  for (const l of lots) {
    const f = l.footprint;
    const [nx, nz] = FRONT_N[l.front] ?? [0, 1];
    let ax: number, az: number, bx: number, bz: number;
    // left → right seen from outside (outward normal n, tangent t = (-nz, nx) rotated so that t × n points up)
    if (l.front === 'S') [ax, az, bx, bz] = [f.x0, f.z1, f.x1, f.z1];
    else if (l.front === 'N') [ax, az, bx, bz] = [f.x1, f.z0, f.x0, f.z0];
    else if (l.front === 'E') [ax, az, bx, bz] = [f.x1, f.z1, f.x1, f.z0];
    else [ax, az, bx, bz] = [f.x0, f.z0, f.x0, f.z1];
    // the real wall sits inside the footprint line for some kinds (townhouse plaster inset, apartment stair cores)
    const ins = l.kind === 'apartment' ? 0.75 : l.kind === 'townhouse' ? 0.16 : 0;
    ax -= nx * ins;
    bx -= nx * ins;
    az -= nz * ins;
    bz -= nz * ins;
    const floors = Math.max(1, l.floors);
    const upper = l.kind === 'house' ? 2.9 : l.shopfront ? 4.0 : floors > 1 ? Math.min(4.2, l.height / floors + 0.4) : l.height;
    out.push({ ax, az, bx, bz, nx, nz, top: l.height, upper, floors, lot: l.id, district: l.district, kind: l.kind });
  }
  return out;
}

/**
 * Lines across streets between facing fronts (bunting / festoons), and across back courtyards between
 * facing rear walls (laundry), in the dense districts. Deterministic.
 */
export function collectSpans(lots: Lot[], facades: FacadeSpan[], dense: (d: DistrictKind) => boolean): LineSpan[] {
  const out: LineSpan[] = [];
  const byId = new Map(lots.map((l) => [l.id, l]));
  // street spans: pairs of front facades with opposite normals, overlapping along the street, 10–26 m apart
  const fr = facades.filter((f) => dense(f.district) && f.floors >= 2);
  const used = new Set<string>();
  for (let i = 0; i < fr.length; i++) {
    const A = fr[i];
    for (let j = i + 1; j < fr.length; j++) {
      const B = fr[j];
      if (A.nx * B.nx + A.nz * B.nz > -0.99) continue;
      // B must lie in front of A
      const mAx = (A.ax + A.bx) / 2,
        mAz = (A.az + A.bz) / 2;
      const mBx = (B.ax + B.bx) / 2,
        mBz = (B.az + B.bz) / 2;
      const gap = (mBx - mAx) * A.nx + (mBz - mAz) * A.nz;
      if (gap < 10 || gap > 26) continue;
      // overlap along the tangent
      const tx = -A.nz,
        tz = A.nx;
      const a0 = Math.min(A.ax * tx + A.az * tz, A.bx * tx + A.bz * tz),
        a1 = Math.max(A.ax * tx + A.az * tz, A.bx * tx + A.bz * tz);
      const b0 = Math.min(B.ax * tx + B.az * tz, B.bx * tx + B.bz * tz),
        b1 = Math.max(B.ax * tx + B.az * tz, B.bx * tx + B.bz * tz);
      const o0 = Math.max(a0, b0) + 1.0,
        o1 = Math.min(a1, b1) - 1.0;
      if (o1 - o0 < 1.5) continue;
      const key = `${Math.min(A.lot, B.lot)}:${Math.max(A.lot, B.lot)}`;
      if (used.has(key)) continue;
      used.add(key);
      const s = (o0 + o1) / 2;
      const y = Math.min(A.top, B.top) - 1.2;
      const yLo = Math.max(A.upper, B.upper) + 2.2;
      if (y < yLo) continue;
      const hy = Math.min(y, yLo + 1.8);
      // a point on A's facade line at tangent coordinate s
      const pA = projectOnLine(A, s, tx, tz);
      const pB = projectOnLine(B, s, tx, tz);
      out.push({ ax: pA[0], ay: hy, az: pA[1], bx: pB[0], by: hy + ((A.lot * 7 + B.lot) % 5) * 0.12, bz: pB[1], kind: 'street', district: A.district, lotA: A.lot, lotB: B.lot });
    }
  }
  // court spans: rear walls (opposite of the front) facing each other across a courtyard, 5–22 m apart
  const backs = lots
    .filter((l) => dense(l.district) && l.floors >= 2 && (l.kind === 'townhouse' || l.kind === 'apartment'))
    .map((l) => {
      const f = facades.find((x) => x.lot === l.id)!;
      const nx = -f.nx,
        nz = -f.nz;
      const fp = l.footprint;
      let ax: number, az: number, bx: number, bz: number;
      if (l.front === 'S') [ax, az, bx, bz] = [fp.x1, fp.z0, fp.x0, fp.z0];
      else if (l.front === 'N') [ax, az, bx, bz] = [fp.x0, fp.z1, fp.x1, fp.z1];
      else if (l.front === 'E') [ax, az, bx, bz] = [fp.x0, fp.z0, fp.x0, fp.z1];
      else [ax, az, bx, bz] = [fp.x1, fp.z1, fp.x1, fp.z0];
      const ins = l.kind === 'apartment' ? 0.8 : 0.16;
      ax -= nx * ins;
      bx -= nx * ins;
      az -= nz * ins;
      bz -= nz * ins;
      return { ...f, ax, az, bx, bz, nx, nz };
    });
  for (let i = 0; i < backs.length; i++) {
    const A = backs[i];
    let best: { B: typeof A; gap: number; s: number } | null = null;
    for (let j = 0; j < backs.length; j++) {
      if (i === j) continue;
      const B = backs[j];
      if (A.nx * B.nx + A.nz * B.nz > -0.99) continue;
      const mAx = (A.ax + A.bx) / 2,
        mAz = (A.az + A.bz) / 2;
      const mBx = (B.ax + B.bx) / 2,
        mBz = (B.az + B.bz) / 2;
      const gap = (mBx - mAx) * A.nx + (mBz - mAz) * A.nz;
      if (gap < 5 || gap > 22) continue;
      const tx = -A.nz,
        tz = A.nx;
      const a0 = Math.min(A.ax * tx + A.az * tz, A.bx * tx + A.bz * tz),
        a1 = Math.max(A.ax * tx + A.az * tz, A.bx * tx + A.bz * tz);
      const b0 = Math.min(B.ax * tx + B.az * tz, B.bx * tx + B.bz * tz),
        b1 = Math.max(B.ax * tx + B.az * tz, B.bx * tx + B.bz * tz);
      const o0 = Math.max(a0, b0) + 0.8,
        o1 = Math.min(a1, b1) - 0.8;
      if (o1 - o0 < 1.2) continue;
      if (!best || gap < best.gap) best = { B, gap, s: (o0 + o1) / 2 };
    }
    if (!best || best.B.lot < A.lot) continue; // one line per pair (from the lower id)
    const B = best.B;
    const tx = -A.nz,
      tz = A.nx;
    const la = byId.get(A.lot)!,
      lb = byId.get(B.lot)!;
    const yTop = Math.min(la.height, lb.height) - 1.0;
    const nLines = yTop > 9 ? 2 : 1;
    for (let k = 0; k < nLines; k++) {
      const y = Math.max(A.upper, B.upper) + 1.6 + k * 3.0;
      if (y > yTop) break;
      const s = best.s + (k - (nLines - 1) / 2) * 1.6;
      const pA = projectOnLine(A, s, tx, tz);
      const pB = projectOnLine(B, s, tx, tz);
      out.push({ ax: pA[0], ay: y, az: pA[1], bx: pB[0], by: y - 0.15, bz: pB[1], kind: 'court', district: A.district, lotA: A.lot, lotB: B.lot });
    }
  }
  return out;
}

function projectOnLine(F: { ax: number; az: number; bx: number; bz: number }, s: number, tx: number, tz: number): [number, number] {
  const sa = F.ax * tx + F.az * tz,
    sb = F.bx * tx + F.bz * tz;
  const t = Math.abs(sb - sa) < 1e-6 ? 0.5 : (s - sa) / (sb - sa);
  return [F.ax + (F.bx - F.ax) * t, F.az + (F.bz - F.az) * t];
}
