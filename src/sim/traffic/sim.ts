// Traffic simulation: lane-following vehicles with IDM car-following,
// intersection reservations (src/core/intersections.ts protocol), level
// crossings, bus routes with stops, time-of-day population via the tunnel
// portals, and a deadlock watchdog.
//
// Positions are arc lengths along "elements": element e < NL is lane e, element
// e >= NL is movement e - NL. A vehicle's FRONT is at `s` on `elem`; its body
// may trail back over the two previous elements (prev1, prev2).

import type { CityContext } from '../../core/context';
import type { Lane, Movement, RoadNetwork, Intersection } from '../../core/roadNetwork';
import type { IntersectionManager } from '../../core/intersections';
import { Path2, P2 } from '../../core/geom';
import type { Rng } from '../../core/rng';
import { MIX, SPECS, SEDAN_POLICE, VehicleSpec, BODY_COLORS, TAXI_COLOR, POLICE_COLOR, ICECREAM_COLORS, LORRY_CAB_COLORS, DELIVERY_LOGOS, SEDAN_TAXI, MIX_2W, TWO_WHEELERS, COLORS_2W, isTwoWheeler } from './specs';

export const STEP = 0.05;
const S0 = 2.0; // jam distance (bumper to bumper)
const GAP_HARD = 0.3; // never closer than this
const B_MAX = 8.0; // emergency braking
const LOOKAHEAD = 80;
const APPROACH_RANGE = 45;
const RIGHT_BULGE = 0.55; // right turns swing a little wider than the core curve (keeps bodies off the kerb corner)
const RIGHT_BULGE_LONG = 1.35; // buses & lorries swing out further (their rear axle cuts the corner)
/** vehicles longer than this use the wide right-turn path */
export const LONG_VEHICLE = 6.5;

export const St = {
  Cruise: 0,
  Queue: 1,
  Red: 2,
  StopSign: 3,
  Yield: 4,
  LeftTurn: 5,
  Peds: 6,
  Blocked: 7,
  Crossing: 8,
  BusStop: 9,
  Turning: 10,
  Junction: 11,
  Tunnel: 12,
} as const;
export type St = (typeof St)[keyof typeof St];

const BASE_POPULATION = 128;
/** share of ordinary traffic on two wheels (?no2w: none) */
const SHARE_2W = 0.27;
const DAY_PROFILE: [number, number][] = [
  [0, 0.3],
  [4.5, 0.26],
  [6.0, 0.55],
  [7.5, 1.0],
  [9.0, 0.86],
  [12.0, 0.84],
  [14.0, 0.82],
  [16.5, 0.95],
  [18.0, 1.0],
  [19.5, 0.8],
  [21.5, 0.55],
  [24.0, 0.3],
];

export class Vehicle {
  id: number;
  spec: VehicleSpec;
  variant: number;
  color: string;
  len: number;
  hw: number;
  // kinematics
  elem = 0;
  s = 0;
  v = 0;
  a = 0;
  prev1 = -1;
  prev2 = -1;
  // plan
  m1 = -1;
  m2 = -1;
  entered = false;
  resNode = -1;
  resMove = -1;
  waitSince = NaN;
  lc = -1;
  leaving = false;
  planLeaving = false;
  trip = 20;
  hist = [-1, -1, -1, -1];
  histK = 0;
  // bus
  route = -1;
  ridx = 0;
  dwell = 0;
  dwellStop = -1;
  served = -1;
  departBlink = 0;
  // special roles
  police = false;
  siren = 0;
  sirenT = 0;
  icecream = false;
  // driver
  T: number;
  A: number;
  B: number;
  vf: number;
  // status / watchdog
  status: St = St.Cruise;
  progT = 0;
  progAcc = 0;
  odo = 0;
  dead = false;
  despawnReason = '';
  blockedSince = NaN;
  /** sim time of the last refused junction entry */
  deniedAt = NaN;
  leaderId = 0;
  leaderGapDbg = 0;
  /** when this vehicle started holding back for a waiting left-turner */
  courtesySince = NaN;
  // control outputs (per step)
  aCmd = 0;
  maxAdv = Infinity;
  maxAdvV = 0;
  // pose (render)
  x = 0;
  z = 0;
  yaw = 0;
  steer = 0;
  pitch = 0;
  roll = 0;
  brakeVis = 0;
  /** close enough to the camera that popping in/out would be noticed */
  visible = true;
  /** inside the view frustum */
  onScreen = true;
  phase: number;
  /** two-wheelers: pedal crank angle (bicycles), lean into turns (rad, + = right), lateral offset in use,
   * path curvature estimate (render) */
  readonly twoWheel: boolean;
  crank = 0;
  lean = 0;
  lat = 0;
  kappa = 0;
  lastYaw = 0;
  lastOdo = 0;
  /** the rider figure and a passenger (pedestrians/riders.ts keeps them here) */
  rider: unknown = null;
  pillion: unknown = null;
  /** people seated in the cabin (pedestrians/occupants.ts) and whether they are drawn (render: aInst2.w = 2) */
  occupants: unknown = null;
  seated = false;

  constructor(id: number, spec: VehicleSpec, variant: number, color: string, rng: Rng) {
    this.id = id;
    this.spec = spec;
    this.variant = variant;
    this.color = color;
    this.len = spec.len;
    this.hw = spec.width / 2;
    this.T = spec.headway * rng.range(0.85, 1.2);
    this.A = spec.accel * rng.range(0.85, 1.15);
    this.B = spec.decel * rng.range(0.9, 1.1);
    this.vf = spec.speedFactor * rng.range(0.9, 1.06);
    this.phase = rng.next();
    this.twoWheel = isTwoWheeler(spec);
    if (this.twoWheel) this.vf = spec.speedFactor * rng.range(0.85, 1.15);
  }

  get isBus(): boolean {
    return this.route >= 0;
  }
  get special(): boolean {
    return this.route >= 0 || this.police || this.icecream;
  }
}

interface Entry {
  v: Vehicle;
  front: number;
  rear: number;
}

export interface TrafficEvents {
  busStop(stopId: number, busId: number, phase: 'arrive' | 'depart'): void;
}

export class TrafficSim {
  readonly net: RoadNetwork;
  readonly mgr: IntersectionManager;
  readonly NL: number;
  readonly NM: number;
  readonly lanes: Lane[];
  readonly movs: Movement[];
  /** drive paths of movements (right turns bulged) */
  readonly mPath: Path2[];
  /** render paths for long vehicles (wider right turns), traversed by the same logical length */
  readonly mPathWide: Path2[];
  readonly elemLen: Float64Array;
  readonly distToSink: Float64Array;
  readonly stopRoute = new Map<number, number>();
  readonly stopName = new Map<number, string>();
  vehicles: Vehicle[] = [];
  private lists: Entry[][];
  private used: number[] = [];
  private pool: Entry[] = [];
  private poolK = 0;
  private nodeOcc: Vehicle[][];
  /** per node: left-turners that have been waiting at the line for a gap for a long time */
  private waitingLeft: Vehicle[][];
  private pairDistCache = new Map<number, number>();
  private chainBuf = new Int32Array(6);
  private rng: Rng;
  private ctx: CityContext;
  private nextId = 1;
  private spawnT: number[] = [];
  private hiddenT = 0;
  private busCountByRoute: number[] = [];
  private pendingBus: number[] = [];
  /** set by the renderer each frame: is a world point (with radius) on screen? */
  isVisible: (x: number, z: number, r: number) => boolean = () => true;
  events: TrafficEvents | null = null;
  target = 0;
  stats = { spawned: 0, despawned: 0, tunnelIn: 0, tunnelOut: 0, watchdog: 0, reroutes: 0, hiddenSpawns: 0, hiddenDespawns: 0, steps: 0 };
  private tNow = 0;
  private share2w: number;

  constructor(ctx: CityContext) {
    this.ctx = ctx;
    this.share2w = ctx.debug.params.has('no2w') ? 0 : SHARE_2W;
    this.net = ctx.roads;
    this.mgr = ctx.intersections;
    this.rng = ctx.rng('traffic');
    this.lanes = this.net.lanes;
    this.movs = this.net.movements;
    this.NL = this.lanes.length;
    this.NM = this.movs.length;
    this.mPath = this.movs.map((m) => this.drivePath(m, RIGHT_BULGE));
    this.mPathWide = this.movs.map((m, i) => (m.turn === 'right' ? this.drivePath(m, RIGHT_BULGE_LONG) : this.mPath[i]));
    this.elemLen = new Float64Array(this.NL + this.NM);
    for (let i = 0; i < this.NL; i++) this.elemLen[i] = this.lanes[i].length;
    for (let i = 0; i < this.NM; i++) this.elemLen[this.NL + i] = this.mPath[i].length;
    this.lists = [];
    for (let i = 0; i < this.NL + this.NM; i++) this.lists.push([]);
    this.nodeOcc = this.net.intersections.map(() => []);
    this.waitingLeft = this.net.intersections.map(() => []);
    this.distToSink = this.computeDistToSink();
    for (const bs of ctx.plan.busStops) {
      this.stopRoute.set(bs.id, bs.route);
      this.stopName.set(bs.id, bs.name);
    }
    this.spawnT = this.net.sourceLanes.map(() => 0);
    this.busCountByRoute = this.net.busRoutes.map(() => 0);
  }

  // ───────────────────────────────────────────────────────── geometry ──

  private drivePath(m: Movement, bulge: number): Path2 {
    if (m.turn !== 'right') return m.path;
    const I = this.net.intersections[m.node];
    const pts = m.path.pts;
    const n = pts.length;
    const out: P2[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = pts[i];
      const dx = I.x - p.x,
        dz = I.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      const k = bulge * Math.sin(Math.PI * t);
      out.push({ x: p.x + (dx / L) * k, z: p.z + (dz / L) * k });
    }
    return new Path2(out);
  }

  elemPath(e: number): Path2 {
    return e < this.NL ? this.lanes[e].path : this.mPath[e - this.NL];
  }

  private computeDistToSink(): Float64Array {
    const d = new Float64Array(this.NL).fill(Infinity);
    for (const l of this.lanes) if (l.sink) d[l.id] = l.length;
    for (let it = 0; it < 200; it++) {
      let changed = false;
      for (const l of this.lanes) {
        if (l.sink) continue;
        for (const mid of l.out) {
          const v = l.length + this.mPath[mid].length + d[this.movs[mid].toLane];
          if (v < d[l.id] - 1e-6) {
            d[l.id] = v;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return d;
  }

  /** minimal distance between two movement drive paths (cached); wide = long-vehicle variant */
  pairDist(a: number, aWide: boolean, b: number, bWide: boolean): number {
    if (a > b) return this.pairDist(b, bWide, a, aWide);
    const key = (a * this.NM + b) * 4 + (aWide ? 2 : 0) + (bWide ? 1 : 0);
    let d = this.pairDistCache.get(key);
    if (d === undefined) {
      d = polylineDist((aWide ? this.mPathWide : this.mPath)[a].pts, (bWide ? this.mPathWide : this.mPath)[b].pts);
      this.pairDistCache.set(key, d);
    }
    return d;
  }

  // ─────────────────────────────────────────────────────── population ──

  targetCount(hours: number): number {
    let f = DAY_PROFILE[0][1];
    for (let i = 0; i < DAY_PROFILE.length - 1; i++) {
      const [h0, v0] = DAY_PROFILE[i],
        [h1, v1] = DAY_PROFILE[i + 1];
      if (hours >= h0 && hours <= h1) {
        const t = (hours - h0) / (h1 - h0);
        f = v0 + (v1 - v0) * (t * t * (3 - 2 * t));
        break;
      }
    }
    return Math.round(BASE_POPULATION * this.ctx.quality.density * f);
  }

  private pickRegular(): { spec: VehicleSpec; variant: number; color: string } {
    const rng = this.rng;
    if (this.share2w > 0 && rng.chance(this.share2w)) {
      const t = rng.weighted(
        MIX_2W,
        MIX_2W.map((m) => m.w),
      ).type;
      const sp = TWO_WHEELERS[t];
      return { spec: sp, variant: sp.variant ?? 0, color: rng.pick(COLORS_2W[t]) };
    }
    const pick = rng.weighted(
      MIX,
      MIX.map((m) => m.w),
    );
    const spec = SPECS[pick.model];
    let variant = pick.variant;
    let color = rng.pick(BODY_COLORS);
    if (pick.model === 'sedan' && variant === SEDAN_TAXI) color = TAXI_COLOR;
    if (pick.model === 'delivery') {
      variant = rng.int(0, DELIVERY_LOGOS - 1);
      color = rng.pick(['#f4f2ec', '#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#3a3e45']);
    }
    if (pick.model === 'lorry') {
      variant = rng.chance(0.55) ? 0 : 1;
      color = rng.pick(LORRY_CAB_COLORS);
    }
    return { spec, variant, color };
  }

  private makeVehicle(spec: VehicleSpec, variant: number, color: string): Vehicle {
    const V = new Vehicle(this.nextId++, spec, variant, color, this.rng);
    V.trip = this.rng.int(18, 60);
    return V;
  }

  /** free span on a lane: true if [rear, front] (+margins) does not touch any vehicle */
  private laneFree(lane: number, rear: number, front: number): boolean {
    for (const V of this.vehicles) {
      // cheap: check the vehicle's spans on this lane
      if (V.elem === lane) {
        if (V.s > rear && V.s - V.len < front) return false;
      } else if (V.prev1 === lane) {
        const L1 = this.elemLen[lane];
        const f = L1 + V.s,
          r = f - V.len;
        if (f > rear && r < front) return false;
      } else if (V.prev2 === lane) {
        const L2 = this.elemLen[lane];
        const L1 = this.elemLen[V.prev1];
        const f = L2 + L1 + V.s,
          r = f - V.len;
        if (f > rear && r < front) return false;
      }
    }
    return true;
  }

  private placeOnLane(V: Vehicle, lane: number, s: number, v: number): void {
    V.elem = lane;
    V.s = s;
    V.v = v;
    V.prev1 = V.prev2 = -1;
    V.entered = false;
    V.resNode = -1;
    if (V.route >= 0) {
      const R = this.net.busRoutes[V.route];
      V.m1 = R.movements[V.ridx];
      V.m2 = R.movements[(V.ridx + 1) % R.movements.length];
    } else {
      V.m1 = this.plan(V, lane, -1);
      V.m2 = V.m1 >= 0 ? this.plan(V, this.movs[V.m1].toLane, this.movs[V.m1].node) : -1;
    }
  }

  /** Initial city: buses, specials, then regular traffic spread over the lanes. */
  populate(hours: number): void {
    this.target = this.targetCount(hours);
    // buses: two per route, spread around the loop
    this.net.busRoutes.forEach((R, ri) => {
      const n = R.lanes.length;
      for (let k = 0; k < 2; k++) {
        const idx = Math.floor((k * n) / 2 + 1) % n;
        this.spawnBusAt(ri, idx, false);
      }
    });
    // police + ice cream
    const police = this.ctx.quality.density >= 0.75 ? 2 : 1;
    for (let i = 0; i < police; i++) {
      const V = this.makeVehicle(SPECS.sedan, SEDAN_POLICE, POLICE_COLOR);
      V.police = true;
      V.sirenT = this.rng.range(20, 120);
      this.dropAnywhere(V);
    }
    if (hours > 8 && hours < 20.5) this.spawnIcecream(false);
    // regular traffic: fill lanes with random gaps until the target is reached
    const lanes = this.lanes.filter((l) => !l.sink).map((l) => l.id);
    this.rng.shuffle(lanes);
    let guard = 0;
    while (this.vehicles.length < this.target + this.specialCount() && guard++ < 4000) {
      const lid = lanes[guard % lanes.length];
      const { spec, variant, color } = this.pickRegular();
      const V = this.makeVehicle(spec, variant, color);
      if (!this.tryDrop(V, lid, false)) continue;
    }
    this.rebuildLists();
    for (const V of this.vehicles) this.computePose(V);
  }

  private regularCount(): number {
    return this.vehicles.length - this.specialCount();
  }

  private specialCount(): number {
    let n = 0;
    for (const V of this.vehicles) if (V.special) n++;
    return n;
  }

  /** Try to place a vehicle somewhere on a lane without overlap (random position). */
  private tryDrop(V: Vehicle, lid: number, hidden: boolean): boolean {
    const lane = this.lanes[lid];
    const L = lane.length;
    for (let attempt = 0; attempt < 4; attempt++) {
      const front = V.len + 0.5 + this.rng.next() * (L - V.len - 3);
      const rear = front - V.len;
      if (rear < 0.3) continue;
      if (lane.crossing && front > lane.crossing.stopS - 2 && rear < lane.crossing.s1 + 2) continue;
      if (lane.busStops.length && V.route < 0) {
        let bad = false;
        for (const bs of lane.busStops) if (front > bs.s - 13 && rear < bs.s + 1) bad = true;
        if (bad) continue;
      }
      if (!this.laneFree(lid, rear - 5, front + 6)) continue;
      if (hidden) {
        const p = lane.path.at(front - V.len / 2);
        if (this.isVisible(p.x, p.z, 8)) continue;
        if (this.laneCommitted(lid)) continue;
        // a follower close behind at speed would have to brake hard
        let ok = true;
        for (const W of this.vehicles) {
          if (W.elem === lid && W.s < rear && rear - W.s < 8 + W.v * 2) ok = false;
          if (W.elem >= this.NL && this.movs[W.elem - this.NL].toLane === lid && rear < 15) ok = false;
        }
        if (!ok) continue;
      }
      const dLine = L - front;
      const v = Math.min(lane.speed * 0.7, Math.max(0, (dLine - 3) * 0.35));
      this.placeOnLane(V, lid, front, v);
      this.vehicles.push(V);
      this.stats.spawned++;
      this.rebuildLists();
      return true;
    }
    return false;
  }

  /** is a junction reservation currently promising space on this lane? */
  private laneCommitted(lid: number): boolean {
    const lane = this.lanes[lid];
    for (const W of this.nodeOcc[lane.from]) if (W.resMove >= 0 && this.movs[W.resMove].toLane === lid) return true;
    return false;
  }

  private dropAnywhere(V: Vehicle): boolean {
    for (let k = 0; k < 60; k++) {
      const lid = this.rng.int(0, this.NL - 1);
      if (this.lanes[lid].sink) continue;
      if (this.tryDrop(V, lid, false)) return true;
    }
    return false;
  }

  private spawnBusAt(route: number, idx: number, hidden: boolean): boolean {
    const R = this.net.busRoutes[route];
    const n = R.lanes.length;
    for (let k = 0; k < n; k++) {
      const i = (idx + k) % n;
      const V = this.makeVehicle(SPECS.bus, route, this.net.busRoutes[route].color);
      V.route = route;
      V.ridx = i;
      V.variant = route;
      if (this.tryDrop(V, R.lanes[i], hidden)) {
        this.busCountByRoute[route]++;
        return true;
      }
    }
    return false;
  }

  private spawnIcecream(hidden: boolean): void {
    const V = this.makeVehicle(SPECS.icecream, 0, this.rng.pick(ICECREAM_COLORS));
    V.icecream = true;
    for (let k = 0; k < 40; k++) {
      const lid = this.rng.int(0, this.NL - 1);
      if (this.lanes[lid].sink) continue;
      if (this.tryDrop(V, lid, hidden)) return;
    }
  }

  private spawnFromTunnel(k: number): boolean {
    const lid = this.net.sourceLanes[k];
    const lane = this.lanes[lid];
    let minRear = Infinity,
      leaderV = 0;
    for (const en of this.lists[lid]) {
      if (en.rear < minRear) {
        minRear = en.rear;
        leaderV = en.v.v;
      }
    }
    const pick = this.pickRegular();
    if (minRear < pick.spec.len + 9) return false;
    const V = this.makeVehicle(pick.spec, pick.variant, pick.color);
    const front = pick.spec.len + 0.3;
    const gap = minRear - front;
    const v = Math.min(lane.speed * 0.8, leaderV + Math.sqrt(Math.max(0, 2 * 2.0 * (gap - S0 - 4))));
    this.placeOnLane(V, lid, front, Math.max(0, v));
    this.vehicles.push(V);
    this.stats.spawned++;
    this.stats.tunnelIn++;
    this.rebuildLists();
    return true;
  }

  despawn(V: Vehicle, reason: string): void {
    if (V.dead) return;
    V.dead = true;
    V.despawnReason = reason;
    this.mgr.forgetVehicle(V.id);
    V.resNode = -1;
    this.stats.despawned++;
    if (V.route >= 0) {
      this.busCountByRoute[V.route]--;
      this.pendingBus.push(V.route);
    }
  }

  // ─────────────────────────────────────────────────────── route plan ──

  private recent(V: Vehicle, node: number): boolean {
    const h = V.hist;
    return h[0] === node || h[1] === node || h[2] === node || h[3] === node;
  }

  /** choose the movement to take at the end of `laneId` */
  plan(V: Vehicle, laneId: number, viaNode: number): number {
    const lane = this.lanes[laneId];
    if (lane.sink) return -1;
    const outs = lane.out;
    if (V.route >= 0) return -1; // buses use their route
    if (V.leaving) {
      let best = -1,
        bd = Infinity;
      for (const mid of outs) {
        const d = this.mPath[mid].length + this.distToSink[this.movs[mid].toLane] + this.rng.next() * 14;
        if (d < bd) {
          bd = d;
          best = mid;
        }
      }
      return best;
    }
    let total = 0;
    const w: number[] = [];
    for (const mid of outs) {
      const m = this.movs[mid];
      const to = this.lanes[m.toLane];
      let x = m.turn === 'straight' ? 1 : m.turn === 'right' ? 0.55 : 0.42;
      if (to.sink) x = 0;
      if (this.recent(V, to.to) || to.to === viaNode) x *= 0.18;
      // long vehicles dislike tight right turns a little
      if (m.turn === 'right' && V.len > 7) x *= 0.6;
      w.push(x);
      total += x;
    }
    if (total <= 0) {
      for (let i = 0; i < outs.length; i++) if (!this.lanes[this.movs[outs[i]].toLane].sink) return outs[i];
      return outs[0] ?? -1;
    }
    let r = this.rng.next() * total;
    for (let i = 0; i < outs.length; i++) {
      r -= w[i];
      if (r <= 0) return outs[i];
    }
    return outs[outs.length - 1];
  }

  // ───────────────────────────────────────────────────────── lists ──

  private entry(V: Vehicle, front: number, rear: number): Entry {
    let en = this.pool[this.poolK];
    if (!en) {
      en = { v: V, front, rear };
      this.pool.push(en);
    } else {
      en.v = V;
      en.front = front;
      en.rear = rear;
    }
    this.poolK++;
    return en;
  }

  private addEntry(e: number, V: Vehicle, front: number, rear: number): void {
    const lst = this.lists[e];
    if (lst.length === 0) this.used.push(e);
    const en = this.entry(V, front, rear);
    // keep sorted by front, descending
    let i = lst.length;
    lst.push(en);
    while (i > 0 && lst[i - 1].front < front) {
      lst[i] = lst[i - 1];
      i--;
    }
    lst[i] = en;
  }

  rebuildLists(): void {
    for (const e of this.used) this.lists[e].length = 0;
    this.used.length = 0;
    this.poolK = 0;
    for (const occ of this.nodeOcc) occ.length = 0;
    for (const V of this.vehicles) {
      if (V.dead) continue;
      const rear = V.s - V.len;
      this.addEntry(V.elem, V, V.s, rear);
      if (rear < 0 && V.prev1 >= 0) {
        const L1 = this.elemLen[V.prev1];
        this.addEntry(V.prev1, V, L1 + V.s, L1 + rear);
        if (L1 + rear < 0 && V.prev2 >= 0) {
          const L2 = this.elemLen[V.prev2];
          this.addEntry(V.prev2, V, L2 + L1 + V.s, L2 + L1 + rear);
        }
      }
      if (V.resNode >= 0) this.nodeOcc[V.resNode].push(V);
    }
  }

  /** Elements ahead of the current one along the vehicle's plan. */
  private chain(V: Vehicle): number {
    const c = this.chainBuf;
    let n = 0;
    if (V.elem < this.NL) {
      if (V.m1 < 0) return 0;
      c[n++] = this.NL + V.m1;
      c[n++] = this.movs[V.m1].toLane;
      if (V.m2 >= 0) {
        c[n++] = this.NL + V.m2;
        c[n++] = this.movs[V.m2].toLane;
      }
    } else {
      const m = this.movs[V.elem - this.NL];
      c[n++] = m.toLane;
      if (V.m2 >= 0) {
        c[n++] = this.NL + V.m2;
        c[n++] = this.movs[V.m2].toLane;
      }
    }
    return n;
  }

  private leaderGap = 0;
  private leaderV = 0;
  private leaderVeh: Vehicle | null = null;

  /** nearest vehicle ahead along the plan (sets leaderGap/leaderV/leaderVeh) */
  private findLeader(V: Vehicle): void {
    let best = Infinity,
      bv = 0;
    let bveh: Vehicle | null = null;
    for (const en of this.lists[V.elem]) {
      if (en.v === V || en.front <= V.s) continue;
      const g = en.rear - V.s;
      if (g < best) {
        best = g;
        bv = en.v.v;
        bveh = en.v;
      }
    }
    if (bveh === null) {
      let dist = this.elemLen[V.elem] - V.s;
      const n = this.chain(V);
      for (let k = 0; k < n && dist < LOOKAHEAD; k++) {
        const e = this.chainBuf[k];
        if (e >= this.NL) {
          // all movements leaving the same lane start at the same stop line: a vehicle
          // still in the first part of a sibling movement physically blocks the way
          const from = this.lanes[this.movs[e - this.NL].fromLane];
          for (const mid of from.out) {
            for (const en of this.lists[this.NL + mid]) {
              if (en.v === V) continue;
              const g = dist + (mid === e - this.NL ? en.rear : Math.max(en.rear, 0) * 1.0 + (en.rear > 6 ? 30 : 0));
              if (g < best) {
                best = g;
                bv = mid === e - this.NL ? en.v.v : 0;
                bveh = en.v;
              }
            }
          }
        } else {
          for (const en of this.lists[e]) {
            if (en.v === V) continue;
            const g = dist + en.rear;
            if (g < best) {
              best = g;
              bv = en.v.v;
              bveh = en.v;
            }
          }
        }
        if (bveh !== null) break;
        dist += this.elemLen[e];
      }
    }
    this.leaderGap = best;
    this.leaderV = bv;
    this.leaderVeh = bveh;
  }

  private isHead(V: Vehicle): boolean {
    for (const en of this.lists[V.elem]) if (en.v !== V && en.v.elem === V.elem && en.v.s > V.s) return false;
    return true;
  }

  // ─────────────────────────────────────────────────── junction logic ──

  /** compact-queue estimate of free space at the start of the exit lane */
  private exitFree(V: Vehicle, mv: Movement): number {
    const lane = this.lanes[mv.toLane];
    const barrier = lane.crossing ? lane.crossing.stopS : lane.length;
    let pos = lane.sink && !lane.crossing ? Infinity : barrier;
    for (const en of this.lists[mv.toLane]) {
      const W = en.v;
      if (W === V || en.front > barrier + 0.01) continue;
      let f = pos;
      if (W.v < 0.3 || W.dwell > 0) f = Math.min(f, en.front);
      if (W.route >= 0) f = Math.min(f, this.busStopAhead(W, mv.toLane, en.front));
      pos = f - W.len - S0;
    }
    for (const en of this.lists[this.NL + mv.id]) {
      const W = en.v;
      if (W === V || W.elem !== this.NL + mv.id) continue;
      pos -= W.len + S0;
    }
    return pos + S0;
  }

  private busStopAhead(W: Vehicle, lid: number, front: number): number {
    for (const bs of this.lanes[lid].busStops) {
      if (this.stopRoute.get(bs.id) !== W.route || W.served === bs.id) continue;
      if (bs.s >= front - 0.2) return bs.s;
    }
    return Infinity;
  }

  /** room for V beyond position s1 on its lane (level crossings) */
  private roomBeyond(V: Vehicle, lane: Lane, s1: number): boolean {
    let pos = lane.sink ? Infinity : lane.length;
    for (const en of this.lists[lane.id]) {
      const W = en.v;
      if (W === V || en.front <= V.s || en.front > lane.length + 0.01) continue;
      let f = pos;
      if (W.v < 0.3 || W.dwell > 0) f = Math.min(f, en.front);
      pos = f - W.len - S0;
    }
    return pos - V.len - 0.8 >= s1;
  }

  /** swept-area clearance check against vehicles already inside the junction */
  private extraConflict(V: Vehicle, mv: Movement): boolean {
    for (const W of this.nodeOcc[mv.node]) {
      if (W === V || W.resMove < 0 || W.resMove === mv.id) continue;
      if (mv.conflicts.includes(W.resMove)) continue; // the manager arbitrates real conflicts
      const need = V.hw + V.spec.sweep + W.hw + W.spec.sweep + 0.15;
      if (need > 2.6 && this.pairDist(mv.id, V.len > LONG_VEHICLE, W.resMove, W.len > LONG_VEHICLE) < need) return true;
    }
    return false;
  }

  private decide(V: Vehicle, dLine: number): boolean {
    if (V.resNode >= 0) return false;
    const mv = this.movs[V.m1];
    const I = this.net.intersections[mv.node];
    const stopped = V.v < 0.3 && dLine < 1.2;
    if (stopped && isNaN(V.waitSince)) V.waitSince = this.tNow;
    if (I.control === 'stop' && (!stopped || this.tNow - V.waitSince < 0.9)) {
      V.status = St.StopSign;
      return false;
    }
    const exitFree = this.exitFree(V, mv);
    // a left-turner that has been waiting at the line clears the junction at the end of the phase
    const sneak = mv.turn === 'left' && stopped && this.tNow - V.waitSince > 2.5;
    const canStop = !sneak && (V.v < 0.6 || (V.v * V.v) / (2 * 3.2) <= dLine - 0.2);
    if (this.extraConflict(V, mv)) {
      V.deniedAt = this.tNow;
      V.status = St.Yield;
      return false;
    }
    if (mv.priority === 0 && I.control === 'signal' && canStop) {
      for (const W of this.waitingLeft[mv.node]) {
        if (W === V || !mv.conflicts.includes(W.m1)) continue;
        if (isNaN(V.courtesySince)) V.courtesySince = this.tNow;
        if (this.tNow - V.courtesySince < 6) {
          V.deniedAt = this.tNow;
          V.status = St.Yield;
          return false;
        }
      }
    }
    const ok = this.mgr.canEnter(V.id, mv.id, { stopped, waitingSince: stopped ? V.waitSince : NaN, exitFree, length: V.len, canStop });
    if (!ok) {
      V.deniedAt = this.tNow;
      V.status = this.reason(V, mv, I, exitFree);
      if (V.status === St.Blocked && stopped) {
        if (isNaN(V.blockedSince)) V.blockedSince = this.tNow;
        if (this.tNow - V.blockedSince > 14) this.reroute(V);
      } else V.blockedSince = NaN;
      return false;
    }
    this.mgr.enter(V.id, mv.id);
    V.deniedAt = NaN;
    V.courtesySince = NaN;
    V.entered = true;
    V.resNode = mv.node;
    V.resMove = mv.id;
    V.waitSince = NaN;
    V.blockedSince = NaN;
    this.nodeOcc[mv.node].push(V);
    return true;
  }

  private reason(V: Vehicle, mv: Movement, I: Intersection, exitFree: number): St {
    if (I.control === 'signal' && this.mgr.aspect(I.id, mv.fromArm) !== 'green') return St.Red;
    if (exitFree < V.len + 2.5) return St.Blocked;
    for (const arm of mv.crosswalks) if (this.mgr.pedsOn(I.id, arm) > 0) return St.Peds;
    if (I.control === 'stop') return St.StopSign;
    if (mv.turn === 'left') return St.LeftTurn;
    return St.Yield;
  }

  /** gridlock breaker: a head vehicle whose exit stays blocked picks another exit */
  private reroute(V: Vehicle): void {
    if (V.route >= 0 || V.elem >= this.NL) return;
    const lane = this.lanes[V.elem];
    const opts = lane.out.filter((m) => m !== V.m1);
    this.rng.shuffle(opts);
    for (const mid of opts) {
      const mv = this.movs[mid];
      if (this.lanes[mv.toLane].sink && !V.leaving && !V.special) {
        // escaping through a tunnel is fine for ordinary traffic
      } else if (this.lanes[mv.toLane].sink) continue;
      if (this.exitFree(V, mv) >= V.len + 4) {
        V.m1 = mid;
        if (this.lanes[mv.toLane].sink) V.leaving = true;
        V.m2 = this.plan(V, mv.toLane, mv.node);
        V.blockedSince = NaN;
        this.stats.reroutes++;
        return;
      }
    }
  }

  // ───────────────────────────────────────────────────────── control ──

  private control(V: Vehicle, h: number): void {
    const NL = this.NL;
    const e = V.elem;
    let v0: number;
    let dStop = Infinity;
    let hard = Infinity;
    let status: St = St.Cruise;
    const turnF = V.len > 6.5 ? 0.85 : 1.0;
    if (e < NL) {
      const lane = this.lanes[e];
      const L = lane.length;
      const dLine = L - V.s;
      v0 = lane.speed * V.vf;
      if (V.police && V.siren > 0) v0 *= 1.12;
      if (V.m1 >= 0) {
        const mv = this.movs[V.m1];
        const vm = Math.min(mv.speed * (mv.turn === 'straight' ? 1 : turnF), lane.speed);
        v0 = Math.min(v0, Math.sqrt(vm * vm + 2 * 1.4 * Math.max(0, dLine - 1.5)));
        if (!V.entered) {
          hard = dLine;
          if (this.isHead(V)) {
            const I = this.net.intersections[mv.node];
            const zone = (V.v * V.v) / (2 * 2.8) + 0.9 * V.v + 4;
            let mustStop = I.control === 'stop';
            if (dLine <= zone) {
              if (this.decide(V, dLine)) {
                hard = Infinity;
                mustStop = false;
              } else {
                mustStop = true;
                status = V.status;
              }
            }
            if (mustStop && !V.entered) dStop = dLine;
            if (I.control === 'stop' && !V.entered && dLine > zone) status = St.Cruise;
          } else V.waitSince = NaN;
        }
      } else if (lane.sink) {
        status = St.Tunnel;
      }
      // level crossing
      const c = lane.crossing;
      if (c && V.s < c.stopS + 0.01) {
        const dc = c.stopS - V.s;
        const zone = (V.v * V.v) / (2 * 2.5) + 0.8 * V.v + 6;
        if (dc <= zone) {
          const lc = this.net.crossings[c.id];
          const open = !lc.closed && lc.gate < 0.15;
          const room = this.roomBeyond(V, lane, c.s1);
          if (open && room) V.lc = c.id;
          else {
            const canStopC = V.v < 0.5 || (V.v * V.v) / (2 * 3.5) <= dc - 0.1;
            if (!(V.lc === c.id && !canStopC && room)) {
              V.lc = -1;
              dStop = Math.min(dStop, dc);
              hard = Math.min(hard, dc);
              if (dc < 15) status = St.Crossing;
            }
          }
        }
      }
      // bus stops
      if (V.route >= 0) {
        for (const bs of lane.busStops) {
          if (this.stopRoute.get(bs.id) !== V.route || V.served === bs.id) continue;
          const d = bs.s - V.s;
          if (d < -0.6) continue;
          if (V.dwell > 0) {
            dStop = 0;
            hard = 0;
            status = St.BusStop;
          } else {
            dStop = Math.min(dStop, Math.max(0, d));
            hard = Math.min(hard, Math.max(0, d));
            if (d < 0.7 && V.v < 0.35) {
              V.dwell = this.rng.range(6, 9);
              V.dwellStop = bs.id;
              status = St.BusStop;
              this.events?.busStop(bs.id, V.id, 'arrive');
            }
          }
          break;
        }
      }
    } else {
      const mv = this.movs[e - NL];
      v0 = Math.min(mv.speed * (mv.turn === 'straight' ? V.vf : turnF), this.lanes[mv.toLane].speed);
      status = mv.turn === 'straight' ? St.Junction : St.Turning;
    }

    // leader
    this.findLeader(V);
    const gap = this.leaderGap;
    V.leaderId = this.leaderVeh ? this.leaderVeh.id : 0;
    V.leaderGapDbg = gap;
    // IDM
    const vr = V.v / Math.max(v0, 0.3);
    const aFree = V.A * (1 - vr * vr * vr * vr);
    let aInt = 0;
    const sq = 2 * Math.sqrt(V.A * V.B);
    if (gap < LOOKAHEAD) {
      const dv = V.v - this.leaderV;
      const ss = S0 + Math.max(0, V.v * V.T + (V.v * dv) / sq);
      const g = Math.max(gap, 0.05);
      aInt = -V.A * (ss / g) * (ss / g);
      if (status === St.Cruise && gap < 12 && V.v < 2.5) status = St.Queue;
    }
    if (dStop < Infinity) {
      const ss = 0.4 + Math.max(0, V.v * V.T * 0.7 + (V.v * V.v) / sq);
      const g = Math.max(dStop + 0.4, 0.05);
      aInt = Math.min(aInt, -V.A * (ss / g) * (ss / g));
    }
    let a = aFree + aInt;
    if (a < -B_MAX) a = -B_MAX;
    if (a > V.A) a = V.A;
    V.aCmd = a;
    // hard limits on the advance this step
    let maxAdv = hard < dStop ? hard : dStop;
    let maxV = 0;
    if (gap - GAP_HARD < maxAdv) {
      maxAdv = gap - GAP_HARD;
      maxV = this.leaderV;
    }
    V.maxAdv = maxAdv;
    V.maxAdvV = maxV;
    V.status = status;
    void h;
  }

  // ─────────────────────────────────────────────────────── integrate ──

  private integrate(V: Vehicle, h: number): void {
    const a = V.aCmd;
    let v1 = V.v + a * h;
    let ds: number;
    if (v1 < 0) {
      ds = (V.v * V.v) / (2 * Math.max(-a, 1e-3));
      if (ds > V.v * h) ds = V.v * h;
      v1 = 0;
    } else ds = (V.v + v1) * 0.5 * h;
    if (ds > V.maxAdv) {
      ds = Math.max(0, V.maxAdv);
      if (v1 > V.maxAdvV) v1 = V.maxAdvV;
      if (V.maxAdv <= 0.02) v1 = Math.min(v1, V.maxAdvV);
    }
    V.a = (v1 - V.v) / h;
    V.v = v1;
    V.s += ds;
    V.odo += ds;
    // bicycles: pedal while riding on (≈ 0.42 crank turns per wheel turn), freewheel when braking
    if (V.spec.model === 'bike' && V.spec.variant !== 1 && V.a > -0.35) V.crank = (V.crank + (ds / V.spec.wheelR) * 0.42) % (Math.PI * 2);
    // watchdog progress
    if (V.dwell > 0) {
      V.dwell -= h;
      V.progT = 0;
      if (V.dwell <= 0) {
        V.dwell = 0;
        V.served = V.dwellStop;
        V.departBlink = 2.6;
        this.events?.busStop(V.dwellStop, V.id, 'depart');
      }
    } else {
      V.progAcc += ds;
      if (V.progAcc > 1.0) {
        V.progAcc = 0;
        V.progT = 0;
      } else V.progT += h;
    }
    if (V.departBlink > 0) V.departBlink -= h;
    if (V.police) {
      V.sirenT -= h;
      if (V.sirenT <= 0) {
        if (V.siren > 0) {
          V.siren = 0;
          V.sirenT = this.rng.range(60, 200);
        } else {
          V.siren = 1;
          V.sirenT = this.rng.range(25, 50);
        }
      }
    }
    // element transitions
    let guard = 0;
    while (V.s > this.elemLen[V.elem] && guard++ < 4) {
      const L = this.elemLen[V.elem];
      if (V.elem < this.NL) {
        const lane = this.lanes[V.elem];
        if (lane.sink) {
          this.despawn(V, 'tunnel');
          this.stats.tunnelOut++;
          return;
        }
        if (!V.entered || V.m1 < 0) {
          // must never happen (hard limit) — hold at the line
          V.s = L;
          V.v = 0;
          break;
        }
        V.s -= L;
        V.prev2 = V.prev1;
        V.prev1 = V.elem;
        V.elem = this.NL + V.m1;
        const node = this.movs[V.m1].node;
        V.hist[V.histK] = node;
        V.histK = (V.histK + 1) & 3;
        V.trip--;
        V.lc = -1;
      } else {
        const mv = this.movs[V.elem - this.NL];
        V.s -= L;
        V.prev2 = V.prev1;
        V.prev1 = V.elem;
        V.elem = mv.toLane;
        V.entered = false;
        V.served = -1;
        if (V.route >= 0) {
          const R = this.net.busRoutes[V.route];
          V.ridx = (V.ridx + 1) % R.lanes.length;
          if (R.lanes[V.ridx] !== mv.toLane) V.ridx = Math.max(0, R.lanes.indexOf(mv.toLane));
          V.m1 = R.movements[V.ridx];
          V.m2 = R.movements[(V.ridx + 1) % R.movements.length];
        } else {
          if (!V.leaving && !V.special && V.trip <= 0) {
            // leave town only if the city can spare a car; otherwise keep cruising a while
            if (this.regularCount() > this.target - 6) V.leaving = true;
            else V.trip = this.rng.int(6, 20);
          }
          if (!V.leaving && !V.special && this.regularCount() > this.target + 6) {
            const p = Math.min(0.12, ((this.regularCount() - this.target) / Math.max(10, this.target)) * 0.5);
            if (this.rng.chance(p)) V.leaving = true;
          }
          if (V.icecream && this.icecreamHome()) V.leaving = true;
          // m2 was planned for this lane; re-plan if the vehicle changed its mind
          V.m1 = V.leaving !== V.planLeaving || (V.m2 >= 0 && this.movs[V.m2].fromLane !== mv.toLane) ? this.plan(V, mv.toLane, mv.node) : V.m2;
          V.m2 = V.m1 >= 0 ? this.plan(V, this.movs[V.m1].toLane, this.movs[V.m1].node) : -1;
          V.planLeaving = V.leaving;
        }
      }
    }
    // release the junction once the rear has left the movement
    if (V.resNode >= 0 && !V.entered && V.elem < this.NL && V.s - V.len >= 0) {
      this.mgr.leave(V.id);
      V.resNode = -1;
      V.resMove = -1;
    }
  }

  private icecreamHome(): boolean {
    const h = this.ctx.clock.hours;
    return h > 20.5 || h < 8;
  }

  // ─────────────────────────────────────────────────────────── step ──

  update(dt: number): void {
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    const h = dt / n;
    const t0 = this.mgr.time - dt;
    for (let k = 0; k < n; k++) {
      this.tNow = t0 + k * h;
      this.step(h);
    }
    this.rebuildLists();
    this.population(dt);
    this.rebuildLists();
    this.updateCrossings();
  }

  private step(h: number): void {
    this.stats.steps++;
    this.rebuildLists();
    const NL = this.NL;
    // 0) report approaches. ETAs are propagated down each lane queue: a follower cannot
    //    reach the line before its leader (who may be refused / stopping).
    for (const e of this.used) {
      if (e >= NL) continue;
      const lane = this.lanes[e];
      const L = lane.length;
      let prevEta = -Infinity;
      for (const en of this.lists[e]) {
        const V = en.v;
        if (V.elem !== e) continue; // body overhang only
        const dLine = L - V.s;
        if (V.m1 < 0 || V.entered) {
          prevEta = dLine / Math.max(V.v, 0.5);
          continue;
        }
        const stopped = V.v < 0.3 && dLine < 1.2;
        // a vehicle whose entry was just refused is stopping at the line, not "about to arrive"
        // (otherwise it would block permissive left turns of the opposing approach forever)
        const refused = this.tNow - V.deniedAt < 0.6;
        let eta = refused ? 60 : dLine / Math.max(V.v, 0.5);
        if (eta < prevEta + 1.2) eta = prevEta + 1.2;
        prevEta = eta;
        if (dLine > APPROACH_RANGE) continue;
        this.mgr.approach(V.id, V.m1, eta, stopped && !isNaN(V.waitSince) ? V.waitSince : NaN);
      }
    }
    // patient left-turners (courtesy: opposing traffic lets them go first)
    for (const arr of this.waitingLeft) arr.length = 0;
    for (const V of this.vehicles) {
      if (V.elem >= NL || V.m1 < 0 || V.entered || V.status !== St.LeftTurn) continue;
      if (!(V.v < 0.3 && this.elemLen[V.elem] - V.s < 1.2) || this.tNow - V.waitSince < 8) continue;
      this.waitingLeft[this.movs[V.m1].node].push(V);
    }
    // 1) decisions + control (reads positions from the start of the step)
    for (const V of this.vehicles) this.control(V, h);
    // 2) integrate
    let anyDead = false;
    for (const V of this.vehicles) {
      this.integrate(V, h);
      if (V.dead) anyDead = true;
    }
    if (anyDead) this.vehicles = this.vehicles.filter((V) => !V.dead);
  }

  private updateCrossings(): void {
    for (const lc of this.net.crossings) {
      let n = 0;
      for (const cl of lc.lanes) {
        for (const en of this.lists[cl.lane]) if (en.front > cl.s0 && en.rear < cl.s1) n++;
      }
      lc.occupied = n;
    }
  }

  private population(dt: number): void {
    const hours = this.ctx.clock.hours;
    this.target = this.targetCount(hours);
    const regular = this.vehicles.length - this.specialCount();
    // tunnel spawns
    for (let k = 0; k < this.spawnT.length; k++) {
      this.spawnT[k] -= dt;
      if (this.spawnT[k] > 0) continue;
      if (regular < this.target + 6) {
        // below target: arrive in bunches; otherwise a steady trickle of visitors
        const deficit = regular < this.target - 3;
        if (this.spawnFromTunnel(k)) this.spawnT[k] = deficit ? this.rng.range(1.6, 3.2) : this.rng.range(7, 16);
        else this.spawnT[k] = 0.5;
      } else this.spawnT[k] = 2.0;
    }
    // hidden spawns / despawns to follow big swings of the target
    this.hiddenT -= dt;
    if (this.hiddenT <= 0) {
      this.hiddenT = 0.5;
      if (regular < this.target - 5) {
        for (let tries = 0; tries < 6; tries++) {
          const lid = this.rng.int(0, this.NL - 1);
          const lane = this.lanes[lid];
          if (lane.sink || lane.source) continue;
          const p = this.pickRegular();
          const V = this.makeVehicle(p.spec, p.variant, p.color);
          if (this.tryDrop(V, lid, true)) {
            this.stats.hiddenSpawns++;
            break;
          }
        }
      } else if (regular > this.target + 6) {
        for (const V of this.vehicles) {
          if (V.special || V.entered || V.resNode >= 0 || V.elem >= this.NL || V.visible) continue;
          const lane = this.lanes[V.elem];
          if (lane.crossing && V.s > lane.crossing.stopS - 1 && V.s - V.len < lane.crossing.s1 + 1) continue;
          this.despawn(V, 'hidden');
          this.stats.hiddenDespawns++;
          break;
        }
      }
      // buses that were removed by the watchdog come back on their route
      if (this.pendingBus.length) {
        const r = this.pendingBus[0];
        if (this.spawnBusAt(r, this.rng.int(0, this.net.busRoutes[r].lanes.length - 1), true)) this.pendingBus.shift();
      }
      // the ice-cream van works days
      const hasIce = this.vehicles.some((V) => V.icecream && !V.dead);
      if (!hasIce && !this.icecreamHome() && this.rng.chance(0.05)) this.spawnIcecream(true);
    }
    // watchdog
    for (const V of this.vehicles) {
      if (V.dead) continue;
      if (V.progT > 60 && (!V.visible || V.progT > 80)) {
        this.despawn(V, 'watchdog');
        this.stats.watchdog++;
      }
    }
    if (this.vehicles.some((V) => V.dead)) this.vehicles = this.vehicles.filter((V) => !V.dead);
  }

  // ─────────────────────────────────────────────────────────── pose ──

  private _p: P2 = { x: 0, z: 0 };
  private _q: P2 = { x: 0, z: 0 };
  private _f: P2 = { x: 0, z: 0 };

  /** point at logical arc length s on element e, as drawn for vehicle V */
  private pointOn(V: Vehicle, e: number, s: number, out: P2): P2 {
    if (e >= this.NL && V.len > LONG_VEHICLE) {
      const w = this.mPathWide[e - this.NL];
      return w.at((s * w.length) / this.elemLen[e], out);
    }
    return this.elemPath(e).at(s, out);
  }

  /** point at distance d behind the front along the travelled path */
  pointBehind(V: Vehicle, d: number, out: P2): P2 {
    let s = V.s - d;
    let e = V.elem;
    if (s < 0 && V.prev1 >= 0) {
      e = V.prev1;
      s += this.elemLen[e];
      if (s < 0 && V.prev2 >= 0) {
        e = V.prev2;
        s += this.elemLen[e];
      }
    }
    if (s >= 0) return this.pointOn(V, e, s, out);
    const path = this.elemPath(e);
    path.at(0, out);
    const t = path.tangent(0, this._q);
    out.x += t.x * s;
    out.z += t.z * s;
    return out;
  }

  /** point at distance d ahead of the front along the plan */
  pointAhead(V: Vehicle, d: number, out: P2): P2 {
    let s = V.s + d;
    let e = V.elem;
    if (s > this.elemLen[e]) {
      const n = this.chain(V);
      for (let k = 0; k < n && s > this.elemLen[e]; k++) {
        s -= this.elemLen[e];
        e = this.chainBuf[k];
      }
    }
    if (s <= this.elemLen[e]) return this.pointOn(V, e, s, out);
    const path = this.elemPath(e);
    path.at(this.elemLen[e], out);
    const t = path.tangent(this.elemLen[e] - 0.01, this._q);
    const over = s - this.elemLen[e];
    out.x += t.x * over;
    out.z += t.z * over;
    return out;
  }

  /** position/yaw/steer from the axle points on the path */
  computePose(V: Vehicle): void {
    const sp = V.spec;
    const F = this.pointBehind(V, sp.frontOverhang, this._f);
    const fx = F.x,
      fz = F.z;
    const R = this.pointBehind(V, sp.frontOverhang + sp.wheelbase, this._p);
    let ux = fx - R.x,
      uz = fz - R.z;
    const L = Math.hypot(ux, uz) || 1;
    ux /= L;
    uz /= L;
    const ro = sp.len - sp.frontOverhang - sp.wheelbase;
    const k = sp.len / 2 - ro;
    V.x = R.x + ux * k;
    V.z = R.z + uz * k;
    V.yaw = Math.atan2(ux, uz);
    if (V.twoWheel) {
      // ridden on the right of the lane: eases in after a junction, back to the centre line through the next
      const off = sp.offset ?? 0;
      const lk = V.elem < this.NL ? Math.min(1, V.s / 5) : Math.max(0, 1 - V.s / 5);
      V.lat = off * lk * lk * (3 - 2 * lk);
      V.x += -uz * V.lat;
      V.z += ux * V.lat;
    }
    // steering: direction from the front axle to a point a little further on
    const A = this.pointAhead(V, 1.6 - sp.frontOverhang, this._q);
    const sx = A.x - fx,
      sz = A.z - fz;
    if (sx * sx + sz * sz > 1e-4) {
      let d = Math.atan2(sx, sz) - V.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      V.steer = Math.max(-0.6, Math.min(0.6, d * 1.25));
    } else V.steer = 0;
  }

  // ─────────────────────────────────────────────────────── queries ──

  busCount(): number {
    let n = 0;
    for (const V of this.vehicles) if (V.route >= 0) n++;
    return n;
  }

  nextStopName(V: Vehicle): string {
    if (V.route < 0) return '';
    const R = this.net.busRoutes[V.route];
    const n = R.lanes.length;
    for (let k = 0; k < n; k++) {
      const lid = R.lanes[(V.ridx + k) % n];
      for (const bs of this.lanes[lid].busStops) {
        if (this.stopRoute.get(bs.id) !== V.route) continue;
        // skip stops already passed / served, and the one the bus is boarding at right now
        if (k === 0 && V.elem === lid && (V.served === bs.id || bs.s < V.s - 0.6 || (V.dwell > 0 && V.dwellStop === bs.id))) continue;
        return this.stopName.get(bs.id) ?? '';
      }
    }
    return '';
  }

  lanePortalName(V: Vehicle): string {
    // which tunnel the vehicle heads for (west / east)
    let lid = V.elem < this.NL ? V.elem : this.movs[V.elem - this.NL].toLane;
    let guard = 0;
    while (!this.lanes[lid].sink && guard++ < 30) {
      let best = -1,
        bd = Infinity;
      for (const mid of this.lanes[lid].out) {
        const d = this.distToSink[this.movs[mid].toLane];
        if (d < bd) {
          bd = d;
          best = this.movs[mid].toLane;
        }
      }
      if (best < 0) break;
      lid = best;
    }
    const x = this.lanes[lid].path.at(0).x;
    return x < 0 ? 'west' : 'east';
  }

  // ───────────────────────────────────────────────────── invariants ──

  invariants(occupancyHas: (x: number, z: number) => boolean): string[] {
    const out: string[] = [];
    const vs = this.vehicles;
    // overlaps (oriented boxes, slightly shrunk)
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i];
      for (let j = i + 1; j < vs.length; j++) {
        const b = vs[j];
        const dx = a.x - b.x,
          dz = a.z - b.z;
        const r = (a.len + b.len) / 2;
        if (dx * dx + dz * dz > r * r) continue;
        if (obbOverlap(a.x, a.z, a.yaw, a.len / 2 - 0.12, a.hw - 0.08, b.x, b.z, b.yaw, b.len / 2 - 0.12, b.hw - 0.08)) out.push(`vehicle ${a.id} (${a.spec.model}) overlaps vehicle ${b.id} (${b.spec.model}) at (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
      }
    }
    // off-road: body centre and both axle points must be on ROAD/PAVED
    const P: P2 = { x: 0, z: 0 };
    for (const V of vs) {
      const pts: [number, number][] = [[V.x, V.z]];
      this.pointBehind(V, V.spec.frontOverhang, P);
      pts.push([P.x, P.z]);
      this.pointBehind(V, V.spec.frontOverhang + V.spec.wheelbase, P);
      pts.push([P.x, P.z]);
      for (const [x, z] of pts) {
        if (!occupancyHas(x, z)) {
          out.push(`vehicle ${V.id} (${V.spec.model}) off-road at (${x.toFixed(1)}, ${z.toFixed(1)}) elem ${V.elem} s ${V.s.toFixed(1)}`);
          break;
        }
      }
    }
    // reservations: manager occupants must be live vehicles that are really in the junction
    const live = new Map<number, Vehicle>();
    for (const V of vs) live.set(V.id, V);
    for (const I of this.net.intersections) {
      const o = this.mgr.occupancy(I.id);
      for (const r of o.vehicles) {
        const V = live.get(r.id);
        if (!V) out.push(`reservation leak: dead vehicle ${r.id} holds node ${I.id}`);
        else if (V.resNode !== I.id) out.push(`reservation mismatch: vehicle ${r.id} holds node ${I.id} but thinks ${V.resNode}`);
      }
    }
    for (const V of vs) {
      if (V.resNode < 0) continue;
      const o = this.mgr.occupancy(V.resNode);
      if (!o.vehicles.some((r) => r.id === V.id)) out.push(`vehicle ${V.id} lost its reservation at node ${V.resNode} (expired?)`);
      if (V.elem < this.NL && !V.entered && V.s - V.len > 0.5) out.push(`vehicle ${V.id} still holds node ${V.resNode} after leaving it`);
    }
    if (this.mgr.stats.expiredOccupants > 0) out.push(`${this.mgr.stats.expiredOccupants} junction reservations expired (held > 45 s)`);
    // inside a movement without a reservation
    for (const V of vs) if (V.elem >= this.NL && V.resNode < 0) out.push(`vehicle ${V.id} inside junction without reservation`);
    // level crossings: nobody standing inside the danger zone
    for (const V of vs) {
      if (V.elem >= this.NL) continue;
      const c = this.lanes[V.elem].crossing;
      if (c && V.v < 0.1 && V.s > c.s0 && V.s - V.len < c.s1) out.push(`vehicle ${V.id} stopped on level crossing ${c.id}`);
    }
    // stuck
    for (const V of vs) if (V.progT > 90) out.push(`vehicle ${V.id} (${V.spec.model}) stuck for ${V.progT.toFixed(0)} s at (${V.x.toFixed(1)}, ${V.z.toFixed(1)}) status ${V.status}`);
    return out;
  }
}

// ───────────────────────────────────────────────────────────── helpers ──

function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax,
    dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function polylineDist(a: readonly P2[], b: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const A = a[i],
        B = a[i + 1],
        C = b[j],
        D = b[j + 1];
      best = Math.min(best, segDist(C.x, C.z, D.x, D.z, A.x, A.z), segDist(C.x, C.z, D.x, D.z, B.x, B.z), segDist(A.x, A.z, B.x, B.z, C.x, C.z), segDist(A.x, A.z, B.x, B.z, D.x, D.z));
      if (segsCross(A, B, C, D)) return 0;
    }
  }
  return best;
}

function segsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** 2D oriented box overlap (SAT). yaw: forward = (sin, cos). hl = half length, hw = half width */
export function obbOverlap(ax: number, az: number, ay: number, ahl: number, ahw: number, bx: number, bz: number, by: number, bhl: number, bhw: number): boolean {
  const axes = [
    [Math.sin(ay), Math.cos(ay)],
    [Math.cos(ay), -Math.sin(ay)],
    [Math.sin(by), Math.cos(by)],
    [Math.cos(by), -Math.sin(by)],
  ];
  const dx = bx - ax,
    dz = bz - az;
  const af = axes[0],
    ar = axes[1],
    bf = axes[2],
    br = axes[3];
  for (const [nx, nz] of axes) {
    const ra = Math.abs(ahl * (af[0] * nx + af[1] * nz)) + Math.abs(ahw * (ar[0] * nx + ar[1] * nz));
    const rb = Math.abs(bhl * (bf[0] * nx + bf[1] * nz)) + Math.abs(bhw * (br[0] * nx + br[1] * nz));
    if (Math.abs(dx * nx + dz * nz) > ra + rb) return false;
  }
  return true;
}

