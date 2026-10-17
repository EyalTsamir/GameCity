// IntersectionManager: the single arbiter for who may use an intersection.
// Shared by the traffic sim (vehicles) and the pedestrian sim (crosswalks).
//
// Vehicles:
//   1. While approaching (say within 45 m of the stop line) call approach() every
//      frame with the movement they intend to take and their ETA to the stop line.
//      When standing at the stop line pass `waitingSince` (sim time they stopped).
//   2. At the decision point ask canEnter(). If it returns true, call enter() and
//      drive through without stopping (the movement is now reserved for you).
//   3. Call leave() once the vehicle's rear has left the movement (fully on the
//      outgoing lane). Never hold a reservation while queued on a lane.
// Pedestrians:
//   canCross() → beginCross() → (walk the crosswalk) → endCross().
//
// Signalised junctions use an exclusive pedestrian ("scramble") phase, so
// pedestrians never share the junction with moving vehicles; turning traffic
// still checks the crosswalks for stragglers.

import type { RoadNetwork, Intersection, Movement } from './roadNetwork';
import type { Dir } from './geom';

export type Aspect = 'green' | 'yellow' | 'red';
export type PedAspect = 'walk' | 'flash' | 'dont';

export interface SignalPhase {
  name: string;
  dur: number;
  ns: Aspect;
  ew: Aspect;
  ped: PedAspect;
}

export const SIGNAL_PLAN: SignalPhase[] = [
  { name: 'NS green', dur: 13, ns: 'green', ew: 'red', ped: 'dont' },
  { name: 'NS yellow', dur: 3, ns: 'yellow', ew: 'red', ped: 'dont' },
  { name: 'all red', dur: 1.5, ns: 'red', ew: 'red', ped: 'dont' },
  { name: 'EW green', dur: 13, ns: 'red', ew: 'green', ped: 'dont' },
  { name: 'EW yellow', dur: 3, ns: 'red', ew: 'yellow', ped: 'dont' },
  { name: 'all red', dur: 1.5, ns: 'red', ew: 'red', ped: 'dont' },
  { name: 'walk', dur: 6, ns: 'red', ew: 'red', ped: 'walk' },
  { name: 'walk ending', dur: 6, ns: 'red', ew: 'red', ped: 'flash' },
  { name: 'all red', dur: 1, ns: 'red', ew: 'red', ped: 'dont' },
];
export const SIGNAL_CYCLE = SIGNAL_PLAN.reduce((s, p) => s + p.dur, 0); // 48 s

interface Approach {
  movement: number;
  eta: number;
  waitingSince: number; // NaN when not standing at the line
  exitBlocked: boolean;
  t: number;
}

interface Occupant {
  movement: number;
  since: number;
}

interface NodeState {
  approaches: Map<number, Approach>;
  occupants: Map<number, Occupant>;
  peds: Map<number, { arm: Dir; since: number }>;
}

export interface EnterInfo {
  /** vehicle has come to a (near) full stop at the stop line */
  stopped: boolean;
  /** sim time when the vehicle stopped at the line (NaN if not stopped) */
  waitingSince: number;
  /** free length on the outgoing lane from its start to the rear of the last vehicle (Infinity if empty) */
  exitFree: number;
  /** vehicle length */
  length: number;
  /** can the vehicle still stop comfortably before the line? (used for yellow) */
  canStop: boolean;
}

export class IntersectionManager {
  readonly net: RoadNetwork;
  /** sim seconds */
  time = 0;
  private state: NodeState[];
  private vehNode = new Map<number, number>();
  private pedNode = new Map<number, number>();
  /** diagnostics */
  stats = { expiredOccupants: 0, expiredPeds: 0 };

  constructor(net: RoadNetwork) {
    this.net = net;
    this.state = net.intersections.map(() => ({ approaches: new Map(), occupants: new Map(), peds: new Map() }));
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const s of this.state) {
      for (const [id, a] of s.approaches) if (t - a.t > 0.75) s.approaches.delete(id);
      for (const [id, o] of s.occupants)
        if (t - o.since > 45) {
          s.occupants.delete(id);
          this.vehNode.delete(id);
          this.stats.expiredOccupants++;
        }
      for (const [id, p] of s.peds)
        if (t - p.since > 60) {
          s.peds.delete(id);
          this.pedNode.delete(id);
          this.stats.expiredPeds++;
        }
    }
  }

  // ── signals ───────────────────────────────────────────────────────────

  /** Current signal phase of a signalised junction. */
  phase(nodeId: number): { index: number; phase: SignalPhase; t: number; remaining: number } {
    const I = this.net.intersections[nodeId];
    let tc = (((this.time + I.offset) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
    for (let i = 0; i < SIGNAL_PLAN.length; i++) {
      const p = SIGNAL_PLAN[i];
      if (tc < p.dur) return { index: i, phase: p, t: tc, remaining: p.dur - tc };
      tc -= p.dur;
    }
    const last = SIGNAL_PLAN.length - 1;
    return { index: last, phase: SIGNAL_PLAN[last], t: 0, remaining: 0 };
  }

  /** Signal aspect shown to vehicles approaching from `arm`. Stop-controlled → 'red' (stop first), uncontrolled → 'green'. */
  aspect(nodeId: number, arm: Dir): Aspect {
    const I = this.net.intersections[nodeId];
    if (I.control === 'signal') {
      const p = this.phase(nodeId).phase;
      return arm === 'N' || arm === 'S' ? p.ns : p.ew;
    }
    return I.control === 'stop' ? 'red' : 'green';
  }

  /** Pedestrian signal (signalised junctions only; elsewhere pedestrians use gap acceptance). */
  pedAspect(nodeId: number): PedAspect {
    const I = this.net.intersections[nodeId];
    if (I.control !== 'signal') return 'walk';
    return this.phase(nodeId).phase.ped;
  }

  // ── vehicles ──────────────────────────────────────────────────────────

  approach(veh: number, movement: number, eta: number, waitingSince = NaN): void {
    const node = this.net.movements[movement].node;
    const s = this.state[node];
    const prev = s.approaches.get(veh);
    if (prev) {
      prev.movement = movement;
      prev.eta = eta;
      prev.waitingSince = waitingSince;
      prev.t = this.time;
    } else s.approaches.set(veh, { movement, eta, waitingSince, exitBlocked: false, t: this.time });
  }

  withdraw(veh: number, node?: number): void {
    if (node !== undefined) this.state[node].approaches.delete(veh);
    else for (const s of this.state) s.approaches.delete(veh);
  }

  private conflicts(a: Movement, bId: number): boolean {
    return a.id !== bId && a.conflicts.includes(bId);
  }

  canEnter(veh: number, movementId: number, info: EnterInfo): boolean {
    const net = this.net;
    const m = net.movements[movementId];
    const I: Intersection = net.intersections[m.node];
    const s = this.state[m.node];
    const ap = s.approaches.get(veh);

    if (I.control === 'signal') {
      const a = this.aspect(I.id, m.fromArm);
      if (a === 'red') return false;
      if (a === 'yellow' && info.canStop) return false;
    } else if (I.control === 'stop') {
      if (!info.stopped) return false;
      // first come, first served among vehicles standing at the lines
      for (const [other, o] of s.approaches) {
        if (other === veh || isNaN(o.waitingSince) || o.exitBlocked) continue;
        if (o.waitingSince < info.waitingSince - 0.05 && (o.movement === m.id ? false : this.conflicts(m, o.movement))) return false;
      }
    }
    // reserved movements in the junction
    for (const [other, o] of s.occupants) {
      if (other === veh) continue;
      if (this.conflicts(m, o.movement)) return false;
    }
    // pedestrians on the crosswalks this movement crosses
    if (m.crosswalks.length) {
      for (const p of s.peds.values()) if (m.crosswalks.includes(p.arm)) return false;
    }
    // permissive left turns yield to oncoming straight/right traffic about to arrive
    if (m.priority > 0) {
      for (const [other, o] of s.approaches) {
        if (other === veh) continue;
        const om = net.movements[o.movement];
        if (om.priority >= m.priority || !this.conflicts(m, o.movement)) continue;
        if (I.control === 'signal' && this.aspect(I.id, om.fromArm) === 'red') continue;
        if (I.control === 'stop') continue; // FCFS handles stop junctions
        if (o.eta < 4.5) return false;
      }
    }
    // don't block the box: room for the whole vehicle on the exit lane
    const blocked = info.exitFree < info.length + 2.5;
    if (ap) ap.exitBlocked = blocked;
    if (blocked) return false;
    return true;
  }

  enter(veh: number, movementId: number): void {
    const node = this.net.movements[movementId].node;
    const prev = this.vehNode.get(veh);
    if (prev !== undefined && prev !== node) this.state[prev].occupants.delete(veh);
    this.state[node].occupants.set(veh, { movement: movementId, since: this.time });
    this.state[node].approaches.delete(veh);
    this.vehNode.set(veh, node);
  }

  leave(veh: number): void {
    const node = this.vehNode.get(veh);
    if (node === undefined) return;
    this.state[node].occupants.delete(veh);
    this.vehNode.delete(veh);
  }

  /** Drop every trace of a vehicle (despawn). */
  forgetVehicle(veh: number): void {
    this.leave(veh);
    this.withdraw(veh);
  }

  // ── pedestrians ───────────────────────────────────────────────────────

  canCross(ped: number, nodeId: number, arm: Dir): boolean {
    const net = this.net;
    const I = net.intersections[nodeId];
    const s = this.state[nodeId];
    if (I.control === 'signal' && this.pedAspect(nodeId) !== 'walk') return false;
    for (const o of s.occupants.values()) {
      if (net.movements[o.movement].crosswalks.includes(arm)) return false;
    }
    if (I.control !== 'signal') {
      for (const o of s.approaches.values()) {
        const om = net.movements[o.movement];
        if (!om.crosswalks.includes(arm)) continue;
        // a car about to arrive that can't be expected to stop
        if (isNaN(o.waitingSince) && o.eta < 2.2) return false;
        // let a vehicle that has been waiting long go first
        if (!isNaN(o.waitingSince) && this.time - o.waitingSince > 7 && !o.exitBlocked) return false;
      }
    }
    void ped;
    return true;
  }

  beginCross(ped: number, nodeId: number, arm: Dir): void {
    this.endCross(ped);
    this.state[nodeId].peds.set(ped, { arm, since: this.time });
    this.pedNode.set(ped, nodeId);
  }

  endCross(ped: number): void {
    const node = this.pedNode.get(ped);
    if (node === undefined) return;
    this.state[node].peds.delete(ped);
    this.pedNode.delete(ped);
  }

  pedsOn(nodeId: number, arm: Dir): number {
    let n = 0;
    for (const p of this.state[nodeId].peds.values()) if (p.arm === arm) n++;
    return n;
  }

  // ── debug ─────────────────────────────────────────────────────────────

  occupancy(nodeId: number): { vehicles: { id: number; movement: number }[]; peds: { id: number; arm: Dir }[]; approaching: number } {
    const s = this.state[nodeId];
    return {
      vehicles: [...s.occupants].map(([id, o]) => ({ id, movement: o.movement })),
      peds: [...s.peds].map(([id, p]) => ({ id, arm: p.arm })),
      approaching: s.approaches.size,
    };
  }
}
