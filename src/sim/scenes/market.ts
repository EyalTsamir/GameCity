// The market's day. Before dawn the square is shrouded (life/nightmarket.ts). ~6:20 a van turns in off the south road
// and stops in the aisle, doors open, two porters carry crates to the stalls while the stallholders haul the tarps off
// one by one and stack their crates. At 7:30 it reverses out and trading starts. From 14:30 the stalls pack up (crates
// stacked up again), at ~16:00 the van is back, the porters clear the crates, tarps go back on 17:00–17:40, the
// van leaves. The tarp timing lives in nightmarket.ts (same hours); vendor hours in pedestrians/vendors.ts marketStalls.

import type { CityContext } from '../../core/context';
import { Path2, type P2 } from '../../core/geom';
import type { KerbStop, TrafficSim } from '../traffic/sim';
import { SPECS } from '../traffic/specs';
import type { Scene } from '../scenes';
import { Cast, dressWork, PUSHING, Person } from './cast';
import type { Kit } from './kit';
import { TARP_MORNING, TARP_EVENING, TARP_STAGGER } from '../../world/life/nightmarket';

const FRUIT = [0xd8402e, 0xf09a2a, 0x7ab648, 0xe8c83a, 0x8e3a6a, 0xc8562e, 0x3f8f3f, 0xe07050];
/** van: comes for the morning / evening shift at these hours */
const VAN_AM = 6.2,
  VAN_PM = 15.75;
const LEAVE_AM = 7.45,
  LEAVE_PM = 17.55;

interface Spot {
  x: number;
  z: number;
  yaw: number;
  /** front of the stall (customers' side) */
  fx: number;
  fz: number;
  /** crates at full stack */
  full: number;
  /** stagger order 0..1 */
  k: number;
}

interface Porter {
  p: Person;
  /** 0 at the van, 1 carrying out, 2 setting down, 3 walking back */
  st: number;
  t: number;
  target: number;
  crate: boolean;
}

function bez(a: P2, b: P2, c: P2, d: P2, n = 14): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    out.push({ x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, z: u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z });
  }
  return out;
}

export class MarketDay implements Scene {
  readonly name = 'market';
  x = 27;
  z = 80;
  reach = 240;
  private sim: TrafficSim | null;
  private stop: KerbStop | null = null;
  private spots: Spot[] = [];
  private porters: Porter[] = [];
  /** crates the porters have delivered / cleared (per stall) on top of the clock's own stacking */
  private carried: Int8Array;
  private shift = 0; // 0 none, 1 morning, 2 evening
  private sentFor = -1;
  private rearX = 24;
  private rearZ = 92.6;
  private rearYaw = 0;
  private doors = 0;
  private lastDay = -1;

  constructor(private ctx: CityContext, private cast: Cast, private low: boolean) {
    this.sim = (ctx.services.traffic as { sim?: TrafficSim } | undefined)?.sim ?? null;
    let k = 0;
    const stalls = ctx.plan.features.filter((f) => f.kind === 'marketstall');
    const n = stalls.length;
    for (const f of stalls) {
      const yaw = f.yaw ?? 0;
      const fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      // the stack stands in the gap next to the stall (stall half width 1.0; neighbours 4.2 m apart)
      const side = f.id % 2 ? 1 : -1;
      this.spots.push({ x: f.x + fz * side * 1.62 + fx * 0.05, z: f.z - fx * side * 1.62 + fz * 0.05, yaw, fx, fz, full: 2 + (f.id % 3), k: ((f.id * 7) % n) / n });
      k++;
    }
    void k;
    this.carried = new Int8Array(this.spots.length);
    this.buildStop();
    if (this.stop && !low) {
      for (let i = 0; i < 2; i++) {
        const p = cast.add({ persona: 'worker', dress: (L, r) => dressWork(L, r) }, 7001 + i);
        p.doing = 'Carrying crates to the market stalls';
        this.porters.push({ p, st: 0, t: i * 2.5, target: -1, crate: false });
      }
    }
  }

  /** the south road's lane to the market aisle at x = 24: turn in over the pavement, stop at the end of the stalls */
  private buildStop(): void {
    const sim = this.sim;
    if (!sim) return;
    const lane = this.ctx.roads.lanes.find((l) => {
      const a = l.path.at(0),
        b = l.path.at(l.length);
      return Math.abs(a.z - 98.3) < 1 && b.x < a.x && a.x > 40 && b.x < 15 && !l.crossing;
    });
    if (!lane) return;
    const sp = SPECS.delivery;
    // centre of the van at the start of the turn: 30.5; front = centre + half its length
    const cs = lane.path.at(0).x - 30.5;
    const s = cs + sp.len / 2;
    const A = { x: 30.5, z: lane.path.at(cs).z };
    const stand = { x: 24, z: 89.4 };
    const inPts = [...bez(A, { x: 26.2, z: A.z }, { x: 24, z: 96.2 }, { x: 24, z: 92.2 }), stand];
    const outPts = [stand, ...bez({ x: 24, z: 92.2 }, { x: 24, z: 96.2 }, { x: 26.2, z: A.z }, A)];
    this.stop = sim.addKerbStop({ lane: lane.id, s, pathIn: new Path2(inPts), pathOut: new Path2(outPts), outLane: lane.id, outS: s, roll: 0, speed: 2.4, reverseOut: true, model: 'market', holdMax: 200 });
    this.rearZ = stand.z + sp.len / 2 + 0.1;
    this.rearX = stand.x;
  }

  private hours(): number {
    return this.ctx.clock.hours;
  }

  /** how many crates stand at a stall by the clock: stacked while setting up, down to a few while trading, up again packing */
  private stackAt(i: number, h: number): number {
    const s = this.spots[i];
    const start = TARP_MORNING + s.k * TARP_STAGGER;
    if (h < start || h >= LEAVE_PM - 0.15) return 0;
    if (h < 8) return Math.min(s.full + 1, Math.floor(1 + (h - start) * 6) + this.carried[i]);
    if (h < 14.5) return 1 + (i % 2);
    // packing up: stacks grow; the porters clear them from ~16:30 (carried: crates taken back)
    const pack = Math.min(s.full + 1, 1 + (i % 2) + Math.floor((h - 14.5) * 1.8));
    return Math.max(0, pack - Math.max(0, this.carried[i]));
  }

  private crateAtStall(i: number, n: number, out: { x: number; y: number; z: number }): void {
    const s = this.spots[i];
    const lvl = n >> 1;
    const lat = n & 1 ? 0.2 : -0.2;
    out.x = s.x + s.fz * lat;
    out.z = s.z - s.fx * lat;
    out.y = 0.27 * lvl;
  }

  update(dt: number): void {
    const h = this.hours();
    const st = this.stop;
    const sim = this.sim;
    const dayChange = Math.floor(this.ctx.clock.day ?? 0);
    if (dayChange !== this.lastDay) {
      this.lastDay = dayChange;
      this.carried.fill(0);
      this.sentFor = -1;
    }
    if (!st || !sim) return;
    // send for the van
    const want = h >= VAN_AM && h < LEAVE_AM ? 1 : h >= VAN_PM && h < LEAVE_PM ? 2 : 0;
    if (want !== 0 && st.V === null && this.sentFor !== want) {
      if (sim.sendTo(st, SPECS.delivery, 0, '#f4f2ec')) {
        this.sentFor = want;
        this.shift = want;
      }
    }
    // too late for this shift (it got held up, or the clock was moved): it needn't come
    if (want === 0 && st.state === 1) sim.cancelKerb(st);
    // the van holds until its hour is up
    if (st.state === 3) {
      this.doors = Math.min(1, this.doors + dt / 2);
      const leave = this.shift === 1 ? LEAVE_AM : LEAVE_PM;
      if (h >= leave || (h > 20 && this.shift === 2)) {
        this.doors = 0;
        st.release = true;
        for (const P of this.porters) {
          P.crate = false;
          P.p.m.look.pram = null;
          P.p.hide();
        }
      }
    } else this.doors = 0;
    // porters: on stage while the van stands with its doors open
    if (st.state === 3 && this.doors >= 1 && h < (this.shift === 1 ? LEAVE_AM : LEAVE_PM) - 0.03) {
      for (const P of this.porters) this.stepPorter(P, dt, h);
    }
    // the van's flank for the crowd
    if (st.V && st.state >= 2 && st.state <= 3) {
      const V = st.V;
      const fx = Math.sin(V.yaw),
        fz = Math.cos(V.yaw);
      for (let k = -1; k <= 1; k++) this.cast.obstacle(V.x + fx * k * 1.9, V.z + fz * k * 1.9, 1.1);
    }
  }

  /** the nearest stall (of the ones along this aisle) still needing crates / with crates to clear */
  private pickStall(morning: boolean, h: number): number {
    let best = -1,
      bd = 1e9;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (Math.abs(s.x - 24) > 4.2) continue;
      if (morning && (this.carried[i] > 2 || h < TARP_MORNING + s.k * TARP_STAGGER - 0.15)) continue;
      if (!morning && this.stackAt(i, h) <= 0) continue;
      let taken = false;
      for (const P of this.porters) if (P.target === i && P.st > 0) taken = true;
      if (taken) continue;
      const d = Math.abs(s.z - 90) + this.carried[i] * 3 + (i % 3);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private stepPorter(P: Porter, dt: number, h: number): void {
    const p = P.p;
    const morning = this.shift === 1;
    const rx = this.rearX + (P === this.porters[0] ? -0.5 : 0.5),
      rz = this.rearZ + 0.7;
    if (!p.on) {
      p.show(rx, rz, Math.PI);
      P.st = 0;
      P.t = 0.8;
      P.crate = false;
      p.m.look.pram = null;
    }
    P.t -= dt;
    switch (P.st) {
      case 0:
        p.m.work = 2;
        p.face(Math.PI);
        if (P.t > 0) break;
        P.target = this.pickStall(morning, h);
        if (P.target < 0) {
          P.t = 1.5;
          break;
        }
        {
          const s = this.spots[P.target];
          P.crate = morning;
          p.m.look.pram = morning ? PUSHING : null;
          p.speed = morning ? 1.15 : 1.35;
          p.doing = morning ? 'Carrying crates to the market stalls' : 'Clearing the crates back to the van';
          // down the aisle past the van's flank (x 24 ± 1.05), then to the stack
          p.walk(p === this.porters[0].p ? 22.7 : 25.3, rz - 1, p === this.porters[0].p ? 22.7 : 25.3, s.z + 0.2, s.x + s.fx * 1.1, s.z + 0.2);
          P.st = 1;
        }
        break;
      case 1:
        if (p.walking) break;
        {
          const s = this.spots[P.target];
          p.faceTo(s.x, s.z);
          p.m.work = 1;
          P.t = 1.1;
          P.st = 2;
        }
        break;
      case 2:
        if (P.t > 0) break;
        // set down / picked up
        this.carried[P.target] = Math.min(8, this.carried[P.target] + 1);
        P.crate = !morning;
        p.m.look.pram = morning ? null : PUSHING;
        p.m.work = 0;
        p.walk(p === this.porters[0].p ? 22.7 : 25.3, this.spots[P.target].z + 0.2, p === this.porters[0].p ? 22.7 : 25.3, rz - 1, rx, rz);
        P.st = 3;
        break;
      case 3:
        if (p.walking) break;
        P.crate = false;
        p.m.look.pram = null;
        P.t = 0.9;
        P.st = 0;
        break;
    }
  }

  draw(kit: Kit): void {
    const h = this.hours();
    // crates at the stalls
    if (!this.low) {
      for (let i = 0; i < this.spots.length; i++) {
        const n = this.stackAt(i, h);
        const s = this.spots[i];
        for (let c = 0; c < n; c++) {
          this.crateAtStall(i, c, _o);
          const yaw = s.yaw + (c % 3) * 0.06;
          kit.put('crate', _o.x, _o.y, _o.z, yaw);
          // only the top ones show their fruit
          if (c >= n - 2) kit.put('produce', _o.x, _o.y, _o.z, yaw, FRUIT[(i * 3 + c) % FRUIT.length]);
        }
      }
    }
    // the van's rear doors, porters' crates
    const st = this.stop;
    if (st && st.V && st.state === 3 && this.doors > 0.3) {
      kit.put('vanrear', st.V.x - Math.sin(st.V.yaw) * (st.V.len / 2), 0, st.V.z - Math.cos(st.V.yaw) * (st.V.len / 2), st.V.yaw, 0xf4f2ec);
    }
    for (const P of this.porters) {
      if (!P.crate || !P.p.on) continue;
      const m = P.p.m;
      const fx = Math.sin(m.yaw),
        fz = Math.cos(m.yaw);
      kit.put('crate', m.x + fx * 0.46, m.y + 0.84, m.z + fz * 0.46, m.yaw + Math.PI / 2);
      kit.put('produce', m.x + fx * 0.46, m.y + 0.84, m.z + fz * 0.46, m.yaw + Math.PI / 2, FRUIT[(m.uid * 5) % FRUIT.length]);
    }
  }

  timejump(): void {
    const st = this.stop;
    this.carried.fill(0);
    this.sentFor = -1;
    for (const P of this.porters) {
      P.crate = false;
      P.p.m.look.pram = null;
      P.p.m.fade = 0;
      P.p.hide();
    }
    this.doors = 0;
    // a van still standing goes home with the jump
    if (st && st.state === 3) st.release = true;
    if (st) this.sim?.cancelKerb(st);
  }

  stats(): Record<string, number> {
    return { marketVan: this.stop ? this.stop.state : -1 };
  }
}
const _o = { x: 0, y: 0, z: 0 };
