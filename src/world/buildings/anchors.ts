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

export interface BuildingsService {
  shops: ShopFront[];
  chimneys: ChimneyTop[];
  balconies: BalconyAnchor[];
  facades: FacadeSpan[];
  spans: LineSpan[];
  perches: Perch[];
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
}

/** Module-level collector (reset per module creation). */
class AnchorSink {
  chimneys: ChimneyTop[] = [];
  balconies: BalconyAnchor[] = [];
  perches: Perch[] = [];
  laundry: LaundryLine[] = [];
  vents: VentTop[] = [];
  shops: ShopFront[] = [];
  private lot: Lot | null = null;
  private b: Builder | null = null;

  reset(): void {
    this.chimneys = [];
    this.balconies = [];
    this.perches = [];
    this.laundry = [];
    this.vents = [];
    this.shops = [];
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
