// Railway operations: timetable of services, train kinematics (jerk-limited, exact station
// stops), level-crossing protection (ETA-based closing, safety stop for occupied crossings),
// signal aspects and the events other modules listen to.
//
// The line is a single straight track along x. Every train runs in a 1-D coordinate
// u = dir · x (increasing in its travel direction); its head is at u = head, its tail at
// head − length. Trains are spawned well inside the (virtual) tunnel so the crossing next
// to a portal can close in time, and are clipped/despawned beyond the bore ends.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { LevelCrossing } from '../../core/roadNetwork';
import type { Rng } from '../../core/rng';
import { ROAD_HALF } from '../../core/constants';
import { EMU, FREIGHT } from './trainModels';

export type CarType = 'cab' | 'mid' | 'loco' | 'wagon';
export type TrainKind = 'regional' | 'freight';

/** half length over gangways / buffers (coupling extents) per car type */
const HALF: Record<CarType, number> = {
  cab: EMU.len / 2 + 0.42,
  mid: EMU.len / 2 + 0.42,
  loco: FREIGHT.locoLen / 2 + 0.47,
  wagon: FREIGHT.wagonLen / 2,
};
/** half distance between bogie centres (for pitch over the crossing dips) */
const BOGIE_HALF: Record<CarType, number> = { cab: EMU.len / 2 - 2.65, mid: EMU.len / 2 - 2.65, loco: 5.2, wagon: 4.55 };
const WHEEL_R: Record<CarType, number> = { cab: EMU.wheelR, mid: EMU.wheelR, loco: FREIGHT.locoWheelR, wagon: FREIGHT.wagonWheelR };

export interface Car {
  type: CarType;
  /** distance from the train's head to this car's centre */
  offset: number;
  half: number;
  /** 0 none, 1 leading (head lights), 2 trailing (tail lights) */
  role: number;
  /** model faces backwards (its +Z end points to the rear of the train) */
  flip: boolean;
  color: THREE.Color;
  color2: THREE.Color;
  load: number;
  // render state (world)
  x: number;
  y: number;
  pitch: number;
  roll: number;
  visible: boolean;
}

export interface Train {
  id: number;
  kind: TrainKind;
  dir: 1 | -1;
  cars: Car[];
  length: number;
  head: number;
  v: number;
  a: number;
  vLine: number;
  phase: 'approach' | 'dwell' | 'depart' | 'pass';
  braking: boolean;
  stopU: number;
  dwellLeft: number;
  doorOpen: number;
  dist: number;
  number: string;
  dest: string;
  origin: string;
  /** crossing the train is held at (−1 none) */
  holdFor: number;
  /** sim time at which the tail cleared each crossing (undefined = not yet) */
  cleared: (number | undefined)[];
  arrivedAt: number;
  service: Service;
  /** u of the clip boundaries (entry side, exit side) */
  uIn: number;
  uOut: number;
}

export interface Service {
  id: number;
  kind: TrainKind;
  dir: 1 | -1;
  nCars: number;
  spawnAt: number;
  /** expected departure from the station (regional), sim seconds */
  departAt: number;
  /** expected despawn time */
  doneAt: number;
  number: string;
  dest: string;
  origin: string;
  delayed: boolean;
}

type XState = 'open' | 'warn' | 'lower' | 'down' | 'raise';
interface XRun {
  lc: LevelCrossing;
  x: number;
  state: XState;
  t: number;
  p: number;
  flash: boolean;
  /** sim time until which the crossing must stay closed (tail passed + hold) */
  holdUntil: number;
  closures: number;
}

export interface RailSimOptions {
  stationX: number;
  /** clip range in world x (bore ends) */
  clipX0: number;
  clipX1: number;
  /** signals: id, x, governed direction */
  signals: { id: number; x: number; dir: number }[];
  /** world x of the platform ends */
  platformX0: number;
  platformX1: number;
}

const LIVERIES = ['#c8372d', '#c8372d', '#c8372d', '#2a8c82', '#2f5f9e'];
const CONTAINER_COLS = ['#b5452f', '#2f6e9e', '#2c8a5b', '#d9a432', '#6a6f75', '#a63a3a', '#e07a2e', '#3d5a80', '#7b4a8c', '#e9e2d0', '#1f6f78'];

const DEST = { west: 'Westport', east: 'Easton Bay' };
const XING_LEAD = 14; // s: close when a train is this close
const XING_WARN = 4; // s of flashing before the booms lower
const XING_LOWER = 5;
const XING_RAISE = 4.2;
const XING_HOLD = 2; // s after the tail cleared
const DWELL = 13.5;
const SVC_BRAKE = 0.62;

function smooth01(t: number): number {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

/** kinematic state used both by the live sim and the look-ahead predictor */
interface Kin {
  head: number;
  v: number;
  a: number;
  phase: Train['phase'];
  braking: boolean;
  dwellLeft: number;
}

export class RailSim {
  trains: Train[] = [];
  queue: Service[] = [];
  crossings: XRun[];
  /** signal aspects 0 red .. 1 green (eased) */
  sigAspect = [0, 0, 0, 0];
  private nextId = 1;
  private svcId = 1;
  private svcNo = 11;
  private lastDir: 1 | -1 = -1;
  private time = 0;
  private profileCache = new Map<string, { arrive: number; depart: number; done: number }>();
  stats = { spawned: 0, arrivals: 0, departures: 0, freight: 0, holds: 0, closures: 0 };
  readonly xs: number[];

  constructor(
    private ctx: CityContext,
    private rng: Rng,
    readonly opt: RailSimOptions,
    readonly top: (x: number) => number,
  ) {
    this.crossings = ctx.roads.crossings.map((lc) => ({ lc, x: lc.x, state: 'open', t: 0, p: 0, flash: false, holdUntil: -1, closures: 0 }));
    this.xs = this.crossings.map((c) => c.x);
    // start with a regional standing at the platform (doors open), then the planned queue.
    // Debug: ?railkind=regional|freight&railx=<head x>&raildir=1|-1 places the first train anywhere.
    const P = ctx.debug.params;
    const dKind = P.get('railkind') as TrainKind | null;
    const dX = P.get('railx');
    const dDir = P.get('raildir');
    const dir0: 1 | -1 = dDir ? (Number(dDir) < 0 ? -1 : 1) : this.rng.chance(0.5) ? 1 : -1;
    const kind0: TrainKind = dKind === 'freight' ? 'freight' : 'regional';
    const first = this.makeService(dir0, kind0, 0);
    const tr = this.build(first);
    const nom = this.nominal(first.kind, first.dir, first.nCars);
    if (dX !== null && Number.isFinite(Number(dX))) {
      tr.head = dir0 * Number(dX);
      const past = kind0 === 'regional' && tr.head > tr.stopU;
      tr.phase = kind0 === 'freight' ? 'pass' : past ? 'depart' : 'approach';
      tr.v = tr.phase === 'approach' ? Math.min(tr.vLine, Math.sqrt(2 * SVC_BRAKE * Math.max(0, tr.stopU - tr.head)) * 0.98) : tr.vLine * 0.8;
      first.departAt = kind0 === 'regional' && !past ? nom.depart - nom.arrive + (tr.stopU - tr.head) / Math.max(4, tr.v) : 0;
      first.doneAt = first.departAt + (nom.done - nom.depart);
    } else {
      tr.head = tr.stopU;
      tr.v = 0;
      tr.phase = 'dwell';
      tr.dwellLeft = this.rng.range(8, 11);
      tr.arrivedAt = -4;
      tr.doorOpen = 1;
      first.departAt = tr.dwellLeft;
      first.doneAt = tr.dwellLeft + (nom.done - nom.depart);
    }
    this.markPassed(tr);
    // crossings under the initial train start closed with the booms down
    for (const c of this.crossings) {
      const uc = tr.dir * c.x;
      if (tr.head >= uc - ROAD_HALF && tr.head - tr.length <= uc + ROAD_HALF) {
        c.state = 'down';
        c.p = 1;
        c.lc.closed = true;
        c.lc.gate = 1;
        c.flash = true;
      }
    }
    this.trains.push(tr);
    this.stats.spawned++;
    this.planAhead();
  }

  get now(): number {
    return this.time;
  }

  // ───────────────────────────────────────────── timetable

  private isNight(): boolean {
    const h = this.ctx.clock.hours;
    return h < 4.8 || h > 23.6;
  }

  private gap(): number {
    const h = this.ctx.clock.hours;
    let g = this.rng.range(25, 45);
    if (this.isNight()) g *= 1.9;
    else if ((h > 7 && h < 9.3) || (h > 16.3 && h < 18.8)) g *= 0.8;
    return g;
  }

  private makeService(dir: 1 | -1, kind: TrainKind, spawnAt: number): Service {
    const h = this.ctx.clock.hours;
    const rush = (h > 7 && h < 9.3) || (h > 16.3 && h < 18.8);
    const nCars = kind === 'regional' ? (rush || this.rng.chance(0.35) ? 4 : 3) : this.rng.int(6, 9);
    const prof = this.nominal(kind, dir, nCars);
    this.lastDir = dir;
    const no = kind === 'regional' ? `RE ${this.svcNo++}` : `FR ${400 + this.rng.int(10, 89)}`;
    if (this.svcNo > 98) this.svcNo = 11;
    return {
      id: this.svcId++,
      kind,
      dir,
      nCars,
      spawnAt,
      departAt: spawnAt + prof.depart,
      doneAt: spawnAt + prof.done,
      number: no,
      dest: dir > 0 ? DEST.east : DEST.west,
      origin: dir > 0 ? DEST.west : DEST.east,
      delayed: false,
    };
  }

  /** keep three services planned beyond the running train */
  private planAhead(): void {
    while (this.queue.length < 3) {
      const prev = this.queue[this.queue.length - 1];
      const after = prev ? prev.doneAt : (this.trains[0]?.service.doneAt ?? this.time);
      const night = this.isNight();
      const freight = this.rng.chance(night ? 0.45 : 0.22);
      const dir: 1 | -1 = (prev ? -prev.dir : -this.lastDir) as 1 | -1;
      this.queue.push(this.makeService(dir, freight ? 'freight' : 'regional', after + this.gap()));
    }
  }

  /** nominal timings of a service (simulated once per kind/dir/length) */
  private nominal(kind: TrainKind, dir: 1 | -1, nCars: number): { arrive: number; depart: number; done: number } {
    const key = `${kind}:${dir}:${nCars}`;
    const hit = this.profileCache.get(key);
    if (hit) return hit;
    const tr = this.build({ id: -1, kind, dir, nCars, spawnAt: 0, departAt: 0, doneAt: 0, number: '', dest: '', origin: '', delayed: false });
    const k: Kin = { head: tr.head, v: tr.v, a: 0, phase: tr.phase, braking: false, dwellLeft: DWELL };
    let t = 0,
      arrive = -1,
      depart = -1;
    const h = 0.1;
    for (let i = 0; i < 20000; i++) {
      const before = k.phase;
      this.stepKin(tr, k, h, false);
      t += h;
      if (before === 'approach' && k.phase === 'dwell') arrive = t;
      if (before === 'dwell' && k.phase === 'depart') depart = t;
      if (k.head - tr.length > tr.uOut + 0.5) break;
    }
    const res = { arrive: arrive < 0 ? t : arrive, depart: depart < 0 ? t * 0.5 : depart, done: t };
    this.profileCache.set(key, res);
    return res;
  }

  // ───────────────────────────────────────────── consist

  private build(s: Service): Train {
    const dir = s.dir;
    const cars: Car[] = [];
    const types: CarType[] = [];
    if (s.kind === 'regional') {
      types.push('cab');
      for (let i = 0; i < s.nCars - 2; i++) types.push('mid');
      types.push('cab');
    } else {
      types.push('loco');
      for (let i = 0; i < s.nCars; i++) types.push('wagon');
    }
    const livery = new THREE.Color(s.kind === 'regional' ? this.rng.pick(LIVERIES) : this.rng.chance(0.6) ? '#2b4d78' : '#2f6a4a');
    let off = 0;
    types.forEach((type, i) => {
      const half = HALF[type];
      off += half;
      const last = i === types.length - 1;
      const role = i === 0 ? 1 : last ? 2 : 0;
      let load = 0;
      const c1 = new THREE.Color(),
        c2 = new THREE.Color();
      if (type === 'wagon') {
        const r = this.rng.next();
        load = r < 0.38 ? 0 : r < 0.84 ? 1 : r < 0.95 ? 2 : 3;
        c1.set(this.rng.pick(CONTAINER_COLS));
        c2.set(this.rng.pick(CONTAINER_COLS));
      } else c1.copy(livery);
      cars.push({ type, offset: off, half, role, flip: last && types.length > 1, color: c1, color2: c2, load, x: 0, y: 0, pitch: 0, roll: 0, visible: false });
      off += half + 0.02;
    });
    const length = off - 0.02;
    const xIn = dir > 0 ? this.opt.clipX0 : this.opt.clipX1;
    const xOut = dir > 0 ? this.opt.clipX1 : this.opt.clipX0;
    const uIn = dir * xIn,
      uOut = dir * xOut;
    const vLine = s.kind === 'regional' ? 13.5 : 11.5;
    // regional: stop with the train centred slightly west of the platform centre
    const centre = this.opt.stationX - 4;
    const stopU = dir * centre + length / 2;
    return {
      id: s.id < 0 ? -1 : this.nextId++,
      kind: s.kind,
      dir,
      cars,
      length,
      head: uIn - 150,
      v: vLine,
      a: 0,
      vLine,
      phase: s.kind === 'regional' ? 'approach' : 'pass',
      braking: false,
      stopU,
      dwellLeft: DWELL,
      doorOpen: 0,
      dist: 0,
      number: s.number,
      dest: s.dest,
      origin: s.origin,
      holdFor: -1,
      cleared: [],
      arrivedAt: -1,
      service: s,
      uIn,
      uOut,
    };
  }

  /** crossings already behind a freshly placed train must not trigger a closure */
  private markPassed(tr: Train): void {
    const tail = tr.head - tr.length;
    this.crossings.forEach((c, i) => {
      if (tail > tr.dir * c.x + ROAD_HALF) tr.cleared[i] = -1e9;
    });
  }

  // ───────────────────────────────────────────── kinematics

  /**
   * Advance a kinematic state by h seconds. `live` = the real train (honours crossing
   * occupancy, emits nothing itself); the predictor passes live=false.
   */
  private stepKin(tr: Train, k: Kin, h: number, live: boolean): void {
    const aAccMax = tr.kind === 'regional' ? 0.55 : 0.32;
    const J = 0.65;
    if (k.phase === 'dwell') {
      k.v = 0;
      k.a = 0;
      k.dwellLeft -= h;
      if (k.dwellLeft <= 0) {
        k.phase = 'depart';
        k.braking = false;
      }
      return;
    }
    let aDes = Math.min(aAccMax * (1 - 0.45 * (k.v / tr.vLine)), (tr.vLine - k.v) * 0.8);
    // station stop: exact constant deceleration once the service brake rate is reached
    if (k.phase === 'approach') {
      const d = tr.stopU - k.head;
      if (d <= 0.03 || (d < 0.25 && k.v < 0.25)) {
        k.v = 0;
        k.a = 0;
        k.head = Math.min(k.head, tr.stopU);
        k.phase = 'dwell';
        k.dwellLeft = DWELL;
        return;
      }
      const need = (k.v * k.v) / (2 * Math.max(0.05, d));
      if (k.braking || need >= SVC_BRAKE) {
        k.braking = true;
        aDes = -need;
      }
    }
    // level crossings ahead: hold short of an occupied (or not yet closed) crossing
    if (live) {
      let hold = -1;
      let aHold = 0;
      for (let i = 0; i < this.crossings.length; i++) {
        const c = this.crossings[i];
        const edge = tr.dir * c.x - ROAD_HALF - 0.4;
        if (k.head > edge + 0.05) continue; // already on / past the road: keep going
        if (c.lc.occupied <= 0 && c.lc.closed) continue;
        const d = edge - 4.5 - k.head;
        const need = (k.v * k.v) / (2 * Math.max(0.05, d));
        if (tr.holdFor === i || need >= SVC_BRAKE || d < 1.5) {
          const a = d <= 0.05 ? -3 : -need;
          if (hold < 0 || a < aHold) {
            hold = i;
            aHold = a;
          }
        }
      }
      tr.holdFor = hold;
      if (hold >= 0) {
        if (k.v < 0.06 && aHold > -0.2) {
          k.v = 0;
          k.a = 0;
          return;
        }
        aDes = Math.min(aDes, aHold);
      }
    }
    // jerk limit (braking for an exact stop reacts immediately)
    if (aDes < k.a && (k.braking || (live && tr.holdFor >= 0))) k.a = aDes;
    else k.a += Math.max(-J * h, Math.min(J * h, aDes - k.a));
    const v0 = k.v;
    k.v = Math.max(0, k.v + k.a * h);
    k.head += ((v0 + k.v) / 2) * h;
  }

  /**
   * Time (s) until the train's head reaches world-x edge of crossing i, assuming free
   * running (Infinity beyond the horizon or if never).
   */
  private eta(tr: Train, edgeU: number, horizon: number): number {
    if (tr.head >= edgeU) return 0;
    // quick bound: even at line speed it is too far away
    if ((edgeU - tr.head) / tr.vLine > horizon + 25) return Infinity;
    const k: Kin = { head: tr.head, v: tr.v, a: tr.a, phase: tr.phase, braking: tr.braking, dwellLeft: tr.dwellLeft };
    const h = 0.2;
    for (let t = 0; t < horizon; t += h) {
      this.stepKin(tr, k, h, false);
      if (k.head >= edgeU) return t + h;
    }
    return Infinity;
  }

  // ───────────────────────────────────────────── main step

  update(dt: number, emit: (name: string, payload: unknown) => void): void {
    if (dt <= 0) return;
    let rem = Math.min(dt, 1.2);
    while (rem > 1e-6) {
      const h = Math.min(rem, 0.1);
      this.step(h, emit);
      rem -= h;
    }
  }

  private step(h: number, emit: (name: string, payload: unknown) => void): void {
    this.time += h;
    // spawn the next service when its time has come and the line is clear
    const next = this.queue[0];
    if (next && this.trains.length === 0 && this.time >= next.spawnAt) {
      this.queue.shift();
      const tr = this.build(next);
      this.trains.push(tr);
      this.stats.spawned++;
      if (tr.kind === 'freight') this.stats.freight++;
      this.planAhead();
    }
    for (const tr of this.trains) {
      const k: Kin = { head: tr.head, v: tr.v, a: tr.a, phase: tr.phase, braking: tr.braking, dwellLeft: tr.dwellLeft };
      const before = k.phase;
      const wasHeld = tr.holdFor;
      this.stepKin(tr, k, h, true);
      if (tr.holdFor >= 0 && wasHeld < 0) this.stats.holds++;
      tr.dist += k.head - tr.head;
      tr.head = k.head;
      tr.v = k.v;
      tr.a = k.a;
      tr.phase = k.phase;
      tr.braking = k.braking;
      tr.dwellLeft = k.dwellLeft;
      if (before === 'approach' && k.phase === 'dwell') {
        tr.arrivedAt = this.time;
        this.stats.arrivals++;
        emit('train:arrive', { station: 0, trainId: tr.id });
      }
      if (before === 'dwell' && k.phase === 'depart') {
        this.stats.departures++;
        emit('train:depart', { station: 0, trainId: tr.id });
      }
      // doors: open ~1.2 s after stopping, close 3 s before departure
      const wantOpen = tr.phase === 'dwell' && this.time - tr.arrivedAt > 1.2 && tr.dwellLeft > 3.0;
      tr.doorOpen = Math.max(0, Math.min(1, tr.doorOpen + (wantOpen ? h / 1.6 : -h / 1.4)));
    }
    // despawn trains whose tail is beyond the exit clip
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const tr = this.trains[i];
      if (tr.head - tr.length > tr.uOut + 1) {
        this.trains.splice(i, 1);
        // re-plan: the next service never starts earlier than a short gap after the line clears
        const n = this.queue[0];
        if (n) {
          const earliest = this.time + 12;
          if (n.spawnAt < earliest) {
            const shift = earliest - n.spawnAt;
            for (const s of this.queue) {
              s.spawnAt += shift;
              s.departAt += shift;
              s.doneAt += shift;
              s.delayed = shift > 6;
            }
          }
        }
      }
    }
    this.updateCrossings(h, emit);
    this.updateSignals(h);
  }

  private updateCrossings(h: number, emit: (name: string, payload: unknown) => void): void {
    for (let i = 0; i < this.crossings.length; i++) {
      const c = this.crossings[i];
      let need = this.time < c.holdUntil;
      for (const tr of this.trains) {
        const uc = tr.dir * c.x;
        const near = uc - ROAD_HALF;
        const far = uc + ROAD_HALF;
        const tail = tr.head - tr.length;
        if (tail > far) {
          // passed: remember when the tail cleared (once) and keep the crossing closed a little longer
          if (tr.cleared[i] === undefined) {
            tr.cleared[i] = this.time;
            c.holdUntil = Math.max(c.holdUntil, this.time + XING_HOLD);
            need = true;
          }
          continue;
        }
        if (tr.head >= near) {
          need = true;
          continue;
        }
        if (this.eta(tr, near, XING_LEAD + 0.5) <= XING_LEAD) need = true;
      }
      const prevClosed = c.lc.closed;
      c.t += h;
      switch (c.state) {
        case 'open':
          if (need) {
            c.state = 'warn';
            c.t = 0;
            c.lc.closed = true;
            c.closures++;
            this.stats.closures++;
          }
          break;
        case 'warn':
          if (!need) {
            c.state = 'open';
            c.lc.closed = false;
          } else if (c.t >= XING_WARN) {
            c.state = 'lower';
            c.t = 0;
          }
          break;
        case 'lower':
          c.p = Math.min(1, c.p + h / XING_LOWER);
          if (c.p >= 1) c.state = 'down';
          if (!need) {
            c.state = 'raise';
            c.lc.closed = false;
          }
          break;
        case 'down':
          c.p = 1;
          if (!need) {
            c.state = 'raise';
            c.t = 0;
            c.lc.closed = false;
          }
          break;
        case 'raise':
          c.p = Math.max(0, c.p - h / XING_RAISE);
          if (need) {
            c.state = 'lower';
            c.lc.closed = true;
          } else if (c.p <= 0) c.state = 'open';
          break;
      }
      c.flash = c.state === 'warn' || c.state === 'lower' || c.state === 'down';
      c.lc.gate = smooth01(c.p);
      if (c.lc.closed !== prevClosed) emit('crossing', { id: c.lc.id, closed: c.lc.closed });
    }
  }

  private updateSignals(h: number): void {
    for (const s of this.opt.signals) {
      let green = false;
      for (const tr of this.trains) {
        if (tr.dir !== s.dir) continue;
        const us = tr.dir * s.x;
        if (tr.head > us - 1) continue; // passed: back to danger
        if (s.id <= 1) green = true; // home signals: cleared into the station
        else green = tr.kind === 'freight' || tr.phase === 'depart' || (tr.phase === 'dwell' && tr.dwellLeft < 6);
      }
      const a = this.sigAspect[s.id];
      this.sigAspect[s.id] = a + ((green ? 1 : 0) - a) * Math.min(1, h * 6);
    }
  }

  // ───────────────────────────────────────────── queries

  /** world x of the train's head / tail */
  headX(tr: Train): number {
    return tr.dir * tr.head;
  }
  tailX(tr: Train): number {
    return tr.dir * (tr.head - tr.length);
  }

  /** update per-car world placement (centre x, height, pitch, visibility) */
  place(tr: Train): void {
    const clip0 = this.opt.clipX0,
      clip1 = this.opt.clipX1;
    for (let i = 0; i < tr.cars.length; i++) {
      const c = tr.cars[i];
      const u = tr.head - c.offset;
      const x = tr.dir * u;
      c.x = x;
      const b = BOGIE_HALF[c.type];
      const yE = this.top(x + b),
        yW = this.top(x - b);
      c.y = (yE + yW) / 2;
      // slope of the car body toward +x
      c.pitch = Math.atan2(yE - yW, 2 * b);
      const sway = Math.min(1, tr.v / 9);
      c.roll = 0.0045 * sway * Math.sin(tr.dist * 0.21 + i * 1.7) + 0.0025 * sway * Math.sin(tr.dist * 0.53 + i * 2.9);
      c.visible = x + c.half > clip0 && x - c.half < clip1;
    }
  }

  wheelRadius(type: CarType): number {
    return WHEEL_R[type];
  }

  /** human-readable status for the info card */
  describe(tr: Train): string[] {
    const kmh = Math.round(tr.v * 3.6);
    const out: string[] = [];
    if (tr.kind === 'regional') {
      out.push(`${tr.number} · ${tr.origin} → ${tr.dest}`);
      if (tr.phase === 'approach') out.push(tr.v < 0.1 && tr.holdFor >= 0 ? 'Waiting at the level crossing' : 'Arriving at Tinyhaven Central');
      else if (tr.phase === 'dwell') out.push(`Departing in ${Math.max(0, Math.ceil(tr.dwellLeft))} s`);
      else out.push(tr.holdFor >= 0 && tr.v < 0.1 ? 'Waiting at the level crossing' : `On the way to ${tr.dest}`);
      out.push(`${tr.cars.length} cars · ${kmh} km/h`);
    } else {
      out.push(`${tr.number} · container freight to ${tr.dest}`);
      out.push(`${tr.cars.length - 1} wagons · ${kmh} km/h`);
      if (tr.holdFor >= 0 && tr.v < 0.1) out.push('Waiting at the level crossing');
    }
    return out;
  }

  label(tr: Train): string {
    if (tr.kind === 'freight') return 'Freight train';
    if (tr.phase === 'dwell') return `Regional to ${tr.dest} · departing in ${Math.max(0, Math.ceil(tr.dwellLeft))} s`;
    return `Regional to ${tr.dest}`;
  }

  /** upcoming regional departures for the board: [service, departAt, status] */
  boardRows(): { time: number; dest: string; info: string; hot: boolean }[] {
    const rows: { time: number; dest: string; info: string; hot: boolean }[] = [];
    for (const tr of this.trains) {
      if (tr.kind !== 'regional') continue;
      if (tr.phase === 'depart') continue;
      const depAt = tr.phase === 'dwell' ? this.time + tr.dwellLeft : tr.service.departAt;
      const info = tr.phase === 'dwell' ? (tr.dwellLeft < 4 ? 'Departing' : 'Boarding') : 'Arriving';
      rows.push({ time: depAt, dest: tr.dest, info, hot: tr.phase === 'dwell' });
    }
    for (const s of this.queue) {
      if (s.kind !== 'regional') continue;
      rows.push({ time: s.departAt, dest: s.dest, info: s.delayed ? 'Delayed' : 'On time', hot: false });
    }
    return rows.slice(0, 3);
  }
}
