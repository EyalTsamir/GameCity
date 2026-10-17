// Boat behaviour. Two kinds of pilots:
//   * RoutePilot — scripted, validated routes (smooth paths with curvature-limited speed
//     profiles, dwells, pivot turns, reversing): ferry loop + berthing, tug assisting the
//     cargo ship, river tour boat, the rowing club's training loop. Holds when a boat blocks
//     its path (or for custom rules, e.g. scullers waiting for the tour boat).
//   * FreePilot  — sailing yachts (tacking upwind, sail trim, heel, luffing) and motorboats
//     roaming a zone; a helm samples the navigation clearance and the predicted positions of
//     the other boats to pick a safe heading.

import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { NavField } from './nav';
import { DIMS, type BoatDims, type BoatType } from './models';

export interface Boat {
  id: number;
  type: BoatType;
  name: string;
  dims: BoatDims;
  x: number;
  z: number;
  yaw: number;
  v: number;
  /** signed speed along the heading (negative when going astern) */
  vSigned: number;
  yawRate: number;
  // presentation
  y: number;
  pitch: number;
  roll: number;
  heel: number;
  trim: number;
  boom: number;
  jib: number;
  luff: number;
  camber: number;
  rowPhase: number;
  sailMix: number;
  tint: THREE.Color;
  accent: THREE.Color;
  status: string;
  priority: number;
  /** prop wash strength 0..1 (manoeuvring / pushing) */
  wash: number;
  pilot: Pilot;
  /** set when the boat is holding for another */
  holding: boolean;
  /** seconds spent holding without interruption */
  holdT: number;
}

export interface Pilot {
  update(b: Boat, h: number, fleet: Fleet): void;
  describe(b: Boat): string[];
}

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export interface P2 {
  x: number;
  z: number;
}

// ───────────────────────────────────────────── paths

/** dense polyline through control points (centripetal-ish Catmull-Rom), with arc length + curvature speed limit */
export class SmoothPath {
  xs: number[] = [];
  zs: number[] = [];
  s: number[] = [];
  vmax: number[] = [];
  length = 0;

  constructor(ctrl: P2[], vCruise: number, aLat: number, closed = false, step = 0.5) {
    const n = ctrl.length;
    const P = (i: number): P2 => (closed ? ctrl[((i % n) + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1),
        p1 = P(i),
        p2 = P(i + 1),
        p3 = P(i + 2);
      const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const k = Math.max(2, Math.ceil(len / step));
      for (let j = 0; j < k; j++) {
        const t = j / k;
        const t2 = t * t,
          t3 = t2 * t;
        const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        const z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
        this.xs.push(x);
        this.zs.push(z);
      }
    }
    const last = closed ? ctrl[0] : ctrl[n - 1];
    this.xs.push(last.x);
    this.zs.push(last.z);
    let acc = 0;
    this.s.push(0);
    for (let i = 1; i < this.xs.length; i++) {
      acc += Math.hypot(this.xs[i] - this.xs[i - 1], this.zs[i] - this.zs[i - 1]);
      this.s.push(acc);
    }
    this.length = acc;
    // curvature speed limit: v ≤ sqrt(aLat / κ)
    const m = this.xs.length;
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 2),
        b = Math.min(m - 1, i + 2);
      const h1 = Math.atan2(this.xs[i] - this.xs[a], this.zs[i] - this.zs[a]);
      const h2 = Math.atan2(this.xs[b] - this.xs[i], this.zs[b] - this.zs[i]);
      const ds = Math.max(0.1, this.s[b] - this.s[a]);
      const kappa = Math.abs(wrap(h2 - h1)) / ds;
      this.vmax.push(Math.min(vCruise, kappa > 1e-4 ? Math.sqrt(aLat / kappa) : vCruise));
    }
  }

  private idx(s: number): number {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0,
      hi = this.s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  at(s: number, out: P2): P2 {
    const i = this.idx(s);
    const j = Math.min(this.s.length - 1, i + 1);
    const span = this.s[j] - this.s[i] || 1;
    const t = Math.max(0, Math.min(1, (s - this.s[i]) / span));
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * t;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * t;
    return out;
  }

  heading(s: number): number {
    const a = this.idx(Math.max(0, s - 0.6)),
      b = Math.min(this.s.length - 1, this.idx(Math.min(this.length, s + 0.6)) + 1);
    return Math.atan2(this.xs[b] - this.xs[a], this.zs[b] - this.zs[a]);
  }

  vLimit(s: number): number {
    return this.vmax[this.idx(s)];
  }
}

// ───────────────────────────────────────────── route pilot

export type Step =
  | { kind: 'path'; path: SmoothPath; vMax: number; vEnd: number; reverse?: boolean; status: string; wash?: number; /** crab: keep this yaw (sideways moves with thrusters) */ yaw?: number }
  | { kind: 'dwell'; t: number; status: string; wash?: number }
  | { kind: 'pivot'; to: number; t: number; status: string };

export interface RouteOpts {
  accel: number;
  decel: number;
  turnRate: number;
  /** extra hold rule (true = wait) */
  hold?: (b: Boat, step: Step, s: number, fleet: Fleet) => boolean;
  describe?: (b: Boat, step: Step, left: number) => string[];
}

export class RoutePilot implements Pilot {
  i = 0;
  s = 0;
  t = 0;
  pivotFrom = 0;
  private tmp: P2 = { x: 0, z: 0 };

  constructor(
    public steps: Step[],
    public opts: RouteOpts,
    /** loop the step list forever */
    public loop = true,
  ) {}

  get step(): Step {
    return this.steps[this.i];
  }

  /** place the boat at the start of step i (or s along it) */
  place(b: Boat, i: number, s = 0): void {
    this.i = i;
    this.s = s;
    this.t = 0;
    const st = this.steps[i];
    if (st.kind === 'path') {
      st.path.at(s, this.tmp);
      b.x = this.tmp.x;
      b.z = this.tmp.z;
      b.yaw = st.yaw ?? st.path.heading(s) + (st.reverse ? Math.PI : 0);
    }
    if (st.kind === 'pivot') this.pivotFrom = b.yaw;
    b.status = st.status;
  }

  private next(b: Boat): void {
    this.i = (this.i + 1) % this.steps.length;
    this.s = 0;
    this.t = 0;
    const st = this.steps[this.i];
    if (st.kind === 'pivot') this.pivotFrom = b.yaw;
    b.status = st.status;
  }

  /** remaining time of the current dwell/pivot (s) */
  get remaining(): number {
    const st = this.step;
    if (st.kind === 'dwell' || st.kind === 'pivot') return Math.max(0, st.t - this.t);
    return 0;
  }

  update(b: Boat, h: number, fleet: Fleet): void {
    const st = this.step;
    b.wash = 0;
    if (st.kind === 'dwell') {
      this.t += h;
      b.v = 0;
      b.vSigned = 0;
      b.wash = st.wash ?? 0;
      b.holding = false;
      if (this.t >= st.t) this.next(b);
      return;
    }
    if (st.kind === 'pivot') {
      const blocked = this.opts.hold?.(b, st, 0, fleet) ?? false;
      b.holding = blocked;
      if (!blocked) this.t += h;
      const u = Math.min(1, this.t / st.t);
      const e = u * u * (3 - 2 * u);
      b.yaw = this.pivotFrom + wrap(st.to - this.pivotFrom) * e;
      b.v = 0;
      b.vSigned = 0;
      b.wash = 0.25;
      if (u >= 1) {
        b.yaw = st.to;
        this.next(b);
      }
      return;
    }
    // path: speed profile = min(step vMax, curvature limit, braking to vEnd, hold)
    const left = st.path.length - this.s;
    let vT = Math.min(st.vMax, st.path.vLimit(this.s + Math.max(2, b.v * 2)), Math.sqrt(st.vEnd * st.vEnd + 2 * this.opts.decel * Math.max(0, left)));
    const blocked = (this.opts.hold?.(b, st, this.s, fleet) ?? false) || fleet.blockedAhead(b, st.reverse ? -1 : 1);
    b.holding = blocked;
    if (blocked) vT = 0;
    const dv = vT - b.v;
    b.v = Math.max(0, b.v + Math.max(-this.opts.decel * 1.8 * h, Math.min(this.opts.accel * h, dv)));
    this.s += b.v * h;
    st.path.at(Math.min(this.s, st.path.length), this.tmp);
    b.x = this.tmp.x;
    b.z = this.tmp.z;
    const want = st.yaw ?? st.path.heading(Math.min(this.s, st.path.length)) + (st.reverse ? Math.PI : 0);
    const dy = wrap(want - b.yaw);
    const rate = this.opts.turnRate * h;
    b.yaw = wrap(b.yaw + Math.max(-rate, Math.min(rate, dy)));
    b.yawRate = Math.max(-rate, Math.min(rate, dy)) / Math.max(h, 1e-4);
    b.vSigned = st.reverse ? -b.v : b.v;
    b.wash = st.wash ?? (b.v < 1.2 && b.v > 0.05 ? 0.6 : 0);
    if (this.s >= st.path.length - 0.02 && (st.vEnd > 0.05 || b.v < 0.06)) {
      if (st.vEnd <= 0.05) b.v = 0;
      this.next(b);
    }
  }

  describe(b: Boat): string[] {
    return this.opts.describe ? this.opts.describe(b, this.step, this.remaining) : [b.status];
  }
}

// ───────────────────────────────────────────── free pilot (sail / motor)

export interface Zone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const OFFS = [0, 0.18, -0.18, 0.38, -0.38, 0.62, -0.62, 0.92, -0.92, 1.3, -1.3, 1.8, -1.8, 2.5, -2.5];

export class FreePilot implements Pilot {
  tx = 0;
  tz = 0;
  tack = 1;
  tackT = 0;
  stuckT = 0;
  lastD = Infinity;
  helmT = 0;
  wantYaw = 0;
  private g = { x: 0, z: 0 };

  constructor(
    private rng: Rng,
    private nav: NavField,
    public zone: Zone,
    private wind: { value: THREE.Vector2 },
    /** cruising speed (motorboats) */
    private vCruise = 7,
  ) {}

  pickTarget(b: Boat): void {
    for (let k = 0; k < 40; k++) {
      const x = this.rng.range(this.zone.x0, this.zone.x1),
        z = this.rng.range(this.zone.z0, this.zone.z1);
      if (this.nav.clearance(x, z) < b.dims.L * 0.5 + 3) continue;
      if (Math.hypot(x - b.x, z - b.z) < 22) continue;
      this.tx = x;
      this.tz = z;
      this.stuckT = 0;
      this.lastD = Infinity;
      return;
    }
    this.tx = (this.zone.x0 + this.zone.x1) / 2;
    this.tz = (this.zone.z0 + this.zone.z1) / 2;
  }

  /** direction the wind comes FROM (yaw) and its strength 0..1.5 */
  private windFrom(): { yaw: number; k: number } {
    const w = this.wind.value;
    const k = Math.hypot(w.x, w.y);
    // uWind points where the wind blows to → upwind heading is the opposite
    return { yaw: Math.atan2(-w.x, -w.y), k };
  }

  update(b: Boat, h: number, fleet: Fleet): void {
    const sail = b.type === 'sail';
    const dx = this.tx - b.x,
      dz = this.tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 10) this.pickTarget(b);
    // stuck detection
    this.stuckT += h;
    if (this.stuckT > 12) {
      if (d > this.lastD - 4) this.pickTarget(b);
      this.lastD = d;
      this.stuckT = 0;
    }
    let want = Math.atan2(dx, dz);
    let vWant = b.type === 'motor' ? this.vCruise : 3.2;
    const wf = this.windFrom();
    if (sail) {
      // beat to windward on tacks of 45°, keep a tack for a while (hysteresis)
      const rel = wrap(want - wf.yaw);
      const NOGO = 0.8;
      this.tackT -= h;
      if (Math.abs(rel) < NOGO) {
        if (this.tackT <= 0) {
          const pref = rel >= 0 ? 1 : -1;
          if (pref !== this.tack) this.tack = pref;
          this.tackT = 18 + this.rng.next() * 14;
        }
        want = wf.yaw + this.tack * (NOGO + 0.05);
      } else this.tackT = Math.min(this.tackT, 2);
    }
    // helm (re-evaluated ~8× per second)
    this.helmT -= h;
    if (this.helmT <= 0) {
      this.helmT = 0.12;
      this.wantYaw = this.chooseHeading(b, want, Math.max(1.5, b.v), fleet, sail ? wf.yaw : null);
    }
    const dy = wrap(this.wantYaw - b.yaw);
    const rateMax = (b.type === 'motor' ? 0.75 : 0.32) * (0.35 + 0.65 * Math.min(1, b.v / 2));
    const turn = Math.max(-rateMax * h, Math.min(rateMax * h, dy));
    b.yaw = wrap(b.yaw + turn);
    b.yawRate = turn / Math.max(h, 1e-4);
    // speed
    if (sail) {
      const rel = Math.abs(wrap(b.yaw - wf.yaw));
      const polar = rel < 0.55 ? 0 : rel < 0.8 ? ((rel - 0.55) / 0.25) * 0.6 : rel < 1.57 ? 0.6 + ((rel - 0.8) / 0.77) * 0.4 : 1 - ((rel - 1.57) / 1.57) * 0.3;
      vWant = 3.4 * polar * Math.min(1.2, 0.45 + wf.k * 0.55);
      // sail state
      const lee = this.leeSide(b, wf.yaw);
      const trimMag = Math.max(0.08, Math.min(1.35, (rel - 0.6) * 0.75));
      b.boom += (-lee * trimMag - b.boom) * Math.min(1, h * 1.6);
      b.jib += (-lee * Math.min(0.62, trimMag * 0.7) - b.jib) * Math.min(1, h * 2.0);
      const luffWant = rel < 0.62 ? 1 : 0;
      b.luff += (luffWant - b.luff) * Math.min(1, h * 3);
      b.camber += (lee * (1 - b.luff * 0.8) - b.camber) * Math.min(1, h * 2);
      const heelWant = -lee * (1 - b.luff) * 0.3 * Math.min(1.2, wf.k) * Math.sin(Math.min(Math.PI / 2, rel)) * (rel > 2.2 ? 0.45 : 1);
      b.heel += (heelWant - b.heel) * Math.min(1, h * 0.9);
    }
    const slow = 1 - Math.min(0.75, Math.abs(dy) / 1.6);
    const target = vWant * slow * (b.holding ? 0.25 : 1);
    const acc = b.type === 'motor' ? 1.4 : 0.35;
    b.v += Math.max(-acc * 1.5 * h, Math.min(acc * h, target - b.v));
    b.v = Math.max(0, b.v);
    b.x += Math.sin(b.yaw) * b.v * h;
    b.z += Math.cos(b.yaw) * b.v * h;
    b.vSigned = b.v;
    // last-resort: never sit on a blocked cell — slide down the clearance gradient
    const c = this.nav.clearance(b.x, b.z);
    if (c < b.dims.B * 0.5 + 0.3) {
      this.nav.gradient(b.x, b.z, this.g);
      const gl = Math.hypot(this.g.x, this.g.z) || 1;
      const push = (b.dims.B * 0.5 + 0.3 - c) * Math.min(1, h * 3);
      b.x += (this.g.x / gl) * push;
      b.z += (this.g.z / gl) * push;
    }
    if (b.type === 'motor') {
      // planing: bow rises with speed
      b.trim += (-Math.min(0.1, b.v * 0.014) - b.trim) * Math.min(1, h * 2);
      b.heel += (-b.yawRate * b.v * 0.035 - b.heel) * Math.min(1, h * 3);
    }
    b.status = sail ? (b.luff > 0.5 ? 'Tacking' : this.pointOfSail(b, wf.yaw)) : b.v > 5 ? 'Cruising' : 'Pottering about';
  }

  private leeSide(b: Boat, windFromYaw: number): number {
    // wind blows toward (−sin(windFrom), −cos(windFrom)); local +X (port) = (cos yaw, −sin yaw)
    const wx = -Math.sin(windFromYaw),
      wz = -Math.cos(windFromYaw);
    const lx = wx * Math.cos(b.yaw) - wz * Math.sin(b.yaw);
    return lx >= 0 ? 1 : -1;
  }

  private pointOfSail(b: Boat, windFromYaw: number): string {
    const rel = Math.abs(wrap(b.yaw - windFromYaw));
    if (rel < 1.0) return 'Beating to windward';
    if (rel < 1.9) return 'Reaching';
    if (rel < 2.6) return 'Broad reach';
    return 'Running before the wind';
  }

  /** pick the safest heading close to `want` */
  private chooseHeading(b: Boat, want: number, v: number, fleet: Fleet, noGoFrom: number | null): number {
    let best = want,
      bestCost = Infinity;
    const L = b.dims.L;
    const halfB = b.dims.B * 0.5;
    for (const off of OFFS) {
      const yaw = wrap(want + off);
      if (noGoFrom !== null && Math.abs(wrap(yaw - noGoFrom)) < 0.62) continue;
      let cost = Math.abs(off) * 1.2;
      const sx = Math.sin(yaw),
        sz = Math.cos(yaw);
      // static clearance along the ray
      for (let k = 1; k <= 4; k++) {
        const dist = k * Math.max(L * 0.55, v * 1.3);
        const c = this.nav.clearance(b.x + sx * dist, b.z + sz * dist);
        const need = halfB + 1.6;
        if (c < need) cost += ((need - c) * 4) / k;
        if (c < halfB + 0.25) cost += 60 / k;
      }
      // other boats (predicted)
      for (const o of fleet.boats) {
        if (o === b) continue;
        const ddx = o.x - b.x,
          ddz = o.z - b.z;
        if (ddx * ddx + ddz * ddz > 60 * 60) continue;
        const rr = (b.dims.L + o.dims.L) * 0.5 + 3;
        const osx = Math.sin(o.yaw) * o.vSigned,
          osz = Math.cos(o.yaw) * o.vSigned;
        for (const t of [0.8, 2, 3.5, 5]) {
          const mx = b.x + sx * v * t,
            mz = b.z + sz * v * t;
          const ox = o.x + osx * t,
            oz = o.z + osz * t;
          const dd = Math.hypot(mx - ox, mz - oz);
          if (dd < rr) cost += ((rr - dd) * (o.priority >= b.priority ? 3 : 1.5)) / (0.6 + t * 0.4);
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = yaw;
      }
    }
    return best;
  }

  describe(b: Boat): string[] {
    return [b.status];
  }
}

// ───────────────────────────────────────────── fleet

export class Fleet {
  boats: Boat[] = [];
  private nextId = 1;

  constructor(readonly nav: NavField) {}

  add(type: BoatType, name: string, pilot: Pilot, tint: THREE.ColorRepresentation, accent: THREE.ColorRepresentation, priority: number): Boat {
    const b: Boat = {
      id: this.nextId++,
      type,
      name,
      dims: DIMS[type],
      x: 0,
      z: 0,
      yaw: 0,
      v: 0,
      vSigned: 0,
      yawRate: 0,
      y: -1.6,
      pitch: 0,
      roll: 0,
      heel: 0,
      trim: 0,
      boom: 0,
      jib: 0,
      luff: 0,
      camber: 0,
      rowPhase: 0,
      sailMix: 0,
      tint: new THREE.Color(tint),
      accent: new THREE.Color(accent),
      status: '',
      priority,
      wash: 0,
      pilot,
      holding: false,
      holdT: 0,
    };
    this.boats.push(b);
    return b;
  }

  /**
   * True if another boat sits in this boat's corridor ahead (dir +1) / astern (−1) and has
   * the same or higher priority, or is stopped (route boats then wait for it to clear).
   */
  blockedAhead(b: Boat, dir: number): boolean {
    const sx = Math.sin(b.yaw) * dir,
      sz = Math.cos(b.yaw) * dir;
    const look = b.dims.L * 0.5 + Math.max(6, b.v * 4);
    for (const o of this.boats) {
      if (o === b) continue;
      const dx = o.x - b.x,
        dz = o.z - b.z;
      const along = dx * sx + dz * sz;
      if (along <= 0 || along > look + o.dims.L * 0.5) continue;
      const lat = Math.abs(dx * sz - dz * sx);
      const half = halfSpan(b) + halfSpan(o) + 0.1;
      // the other boat's capsule extends along its own heading (ignore near-parallel boats)
      const ext = Math.max(0, Math.abs(Math.sin(o.yaw - b.yaw)) - 0.3) * o.dims.L * 0.5;
      if (lat < half + ext) {
        // deadlock breaker: after a long wait, only boats of higher priority still block
        if (b.holdT > 18 && o.priority < b.priority) continue;
        return true;
      }
    }
    return false;
  }

  /** diagnostics: boats currently in b's corridor ahead */
  blockers(b: Boat): string {
    const sx = Math.sin(b.yaw),
      sz = Math.cos(b.yaw);
    const out: string[] = [];
    for (const o of this.boats) {
      if (o === b) continue;
      const dx = o.x - b.x,
        dz = o.z - b.z;
      const along = dx * sx + dz * sz;
      const lat = Math.abs(dx * sz - dz * sx);
      if (along > 0 && along < 40 && lat < 8) out.push(`${o.name}@${along.toFixed(1)}/${lat.toFixed(1)}`);
    }
    return out.join(' ') || '-';
  }

  /** minimum distance between two boats' hull capsules (negative = overlap) */
  static gap(a: Boat, b: Boat): number {
    const seg = (o: Boat) => {
      const hl = Math.max(0, o.dims.L * 0.5 - o.dims.B * 0.5);
      const sx = Math.sin(o.yaw) * hl,
        sz = Math.cos(o.yaw) * hl;
      return [o.x - sx, o.z - sz, o.x + sx, o.z + sz];
    };
    const [ax0, az0, ax1, az1] = seg(a);
    const [bx0, bz0, bx1, bz1] = seg(b);
    const d = segSegDist(ax0, az0, ax1, az1, bx0, bz0, bx1, bz1);
    return d - (a.dims.B + b.dims.B) * 0.5;
  }

  update(h: number): void {
    for (const b of this.boats) {
      b.pilot.update(b, h, this);
      b.holdT = b.holding ? b.holdT + h : 0;
    }
  }
}

/** half width including oars (scullers) */
export function halfSpan(o: Boat): number {
  return o.type === 'row' ? ROW_HALF_SPAN : o.dims.B * 0.5;
}
export const ROW_HALF_SPAN = 2.72;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** distance between two 2-D segments */
export function segSegDist(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number {
  const ux = bx - ax,
    uz = bz - az,
    vx = dx - cx,
    vz = dz - cz,
    wx = ax - cx,
    wz = az - cz;
  const a = ux * ux + uz * uz,
    b = ux * vx + uz * vz,
    c = vx * vx + vz * vz,
    d = ux * wx + uz * wz,
    e = vx * wx + vz * wz;
  const D = a * c - b * b;
  let sc: number, tc: number;
  if (a < 1e-9 && c < 1e-9) return Math.hypot(wx, wz);
  if (a < 1e-9) {
    sc = 0;
    tc = clamp01(e / c);
  } else if (c < 1e-9) {
    tc = 0;
    sc = clamp01(-d / a);
  } else {
    sc = D > 1e-9 ? clamp01((b * e - c * d) / D) : 0;
    tc = (b * sc + e) / c;
    if (tc < 0) {
      tc = 0;
      sc = clamp01(-d / a);
    } else if (tc > 1) {
      tc = 1;
      sc = clamp01((b - d) / a);
    }
  }
  const px = wx + sc * ux - tc * vx,
    pz = wz + sc * uz - tc * vz;
  return Math.hypot(px, pz);
}
