// Delivery stops: a van on its way through town pulls half onto the pavement outside a shop (hazards on; a KerbStop, so
// traffic flows past and no junction or level crossing can ever be held up), the driver gets out, opens the back,
// wheels a trolley of crates to the shop door, goes in, comes back with the trolley empty, shuts up and drives off.
// Any delivery van passing an open stop takes it; if the town has been without a delivery for a while one is sent.

import type { CityContext } from '../../core/context';
import { Path2, type P2 } from '../../core/geom';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import type { KerbStop, TrafficSim } from '../traffic/sim';
import { SPECS } from '../traffic/specs';
import type { Scene } from '../scenes';
import { Cast, dressWork, PUSHING, Person } from './cast';
import type { Kit } from './kit';

const OPEN_H = 6.4,
  CLOSE_H = 16.5;
/** how far beside the lane centre a van stands (lane centre is 1.75 from the road centre: 4.05 = half on the kerb) */
const LAT = 2.3;
/** at most this many deliveries at once */
const MAX_LIVE = 3;
/** a stop rests this long (sim s) after a delivery, the town waits this long before sending for one */
const REST = 260,
  SEND_AFTER = 75;

const WHAT = ['bread', 'fresh fish', 'the post', 'flowers'];
const CARGO = [0xd8a860, 0xc0d8e0, 0xb88a50, 0xe07090];

interface Stop {
  st: KerbStop;
  lot: number;
  shop: string;
  /** centre of the van standing, unit heading, right-hand side */
  x: number;
  z: number;
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  doorX: number;
  doorZ: number;
  rest: number;
}

function curve(a: P2, b: P2, fx: number, fz: number, n = 12): P2[] {
  // S curve from a to b, both tangent to (fx, fz)
  const L = (b.x - a.x) * fx + (b.z - a.z) * fz;
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      k = t * t * (3 - 2 * t);
    const along = L * t;
    out.push({ x: a.x + fx * along + (b.x - a.x - fx * L) * k, z: a.z + fz * along + (b.z - a.z - fz * L) * k });
  }
  return out;
}

/** clear rectangle along a heading? (furniture discs, solid cells) */
function clearBox(ctx: CityContext, keep: { x: number; z: number; r: number }[], cx: number, cz: number, fx: number, fz: number, halfL: number, lat0: number, lat1: number): boolean {
  const rx = -fz,
    rz = fx;
  for (let a = -halfL; a <= halfL; a += 0.5)
    for (let l = lat0; l <= lat1; l += 0.4) {
      const x = cx + fx * a + rx * l,
        z = cz + fz * a + rz * l;
      if (ctx.occupancy.has(x, z, OCC.SOLID | OCC.BUILDING | OCC.WATER | OCC.RAIL)) return false;
    }
  for (const d of keep) {
    const dx = d.x - cx,
      dz = d.z - cz;
    const a = dx * fx + dz * fz,
      l = dx * rx + dz * rz;
    if (Math.abs(a) < halfL + d.r && l > lat0 - d.r && l < lat1 + d.r) return false;
  }
  return true;
}

/** Plan the stops: one lane per shop door that has a clear stretch of kerb outside. */
export function planDeliveryStops(ctx: CityContext, sim: TrafficSim, rng: Rng): Stop[] {
  const out: Stop[] = [];
  const keep: { x: number; z: number; r: number }[] = ((ctx.services.props as { discs?: { x: number; z: number; r: number }[] } | undefined)?.discs ?? []).slice();
  for (const t of (ctx.services.vegetation as { trees?: { x: number; z: number }[] } | undefined)?.trees ?? []) keep.push({ x: t.x, z: t.z, r: 0.6 });
  for (const s of ctx.plan.slots) if (s.kind !== 'empty') keep.push({ x: s.x, z: s.z, r: 0.5 });
  for (const p of (ctx.services.traffic as { parked2w?: { x: number; z: number }[] } | undefined)?.parked2w ?? []) keep.push({ x: p.x, z: p.z, r: 1.0 });
  const sp = SPECS.delivery;
  const shops = ctx.plan.lots.filter((l) => l.shopfront && l.doors.length > 0);
  const lanes = ctx.roads.lanes.filter((l) => !l.sink && !l.crossing && l.length > 34);
  // deterministic but not ordered by plan position
  rng.shuffle(shops);
  for (const lot of shops) {
    if (out.length >= 14) break;
    const door = lot.doors[0];
    let done = false;
    for (const lane of lanes) {
      if (done) break;
      // door on the lane's right, across the pavement
      const n = lane.dir;
      const rx = -n.z,
        rz = n.x;
      const p0 = lane.path.at(0);
      const a = (door.x - p0.x) * n.x + (door.z - p0.z) * n.z;
      const lat = (door.x - p0.x) * rx + (door.z - p0.z) * rz;
      if (lat < 3.5 || lat > 11 || a < 0 || a > lane.length) continue;
      // the van stands with its back a little before the door: try a few places along the kerb
      for (const shift of [2.6, -2.2, 5.4, -5, 8, -8, 10.5, -10.5]) {
        const cs = a + shift; // van centre along the lane, standing
        // room to brake + pull in behind it (8 m), to pull out again ahead of it (9 m), junctions clear both ways
        if (cs < 15 || cs > lane.length - 13) continue;
        if (lane.busStops.some((b) => Math.abs(b.s - cs) < 18)) continue;
        const c = lane.path.at(cs);
        const x = c.x + rx * LAT,
          z = c.z + rz * LAT;
        // the van on the kerb + the pull-in behind and pull-out ahead (narrower: it swings in)
        if (!clearBox(ctx, keep, c.x, c.z, n.x, n.z, 3.5, LAT - 1.0, LAT + 1.1)) continue;
        if (!clearBox(ctx, keep, c.x - n.x * 7, c.z - n.z * 7, n.x, n.z, 3, 0, 1.5)) continue;
        if (!clearBox(ctx, keep, c.x + n.x * 7, c.z + n.z * 7, n.x, n.z, 3, 0, 1.5)) continue;
        // far enough from the other stops
        if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 24 * 24)) continue;
        // walking room to the door: pavement all the way, clear of furniture (a straight walk from the back of the van)
        const bx = x - n.x * (sp.len / 2 + 1.5) + rx * 0.8,
          bz = z - n.z * (sp.len / 2 + 1.5) + rz * 0.8;
        const dd = Math.hypot(door.x - bx, door.z - bz);
        let ok = dd < 19;
        for (let t = 0.06; t < 0.95 && ok; t += 0.5 / dd) {
          const wx = bx + (door.x - bx) * t,
            wz = bz + (door.z - bz) * t;
          if (ctx.occupancy.has(wx, wz, OCC.SOLID | OCC.ROAD)) ok = false;
          for (const k of keep) if ((k.x - wx) ** 2 + (k.z - wz) ** 2 < (k.r + 0.25) ** 2) ok = false;
        }
        if (!ok) continue;
        const front = cs - 7 + sp.len / 2;
        const A = lane.path.at(cs - 7);
        const B = lane.path.at(cs + 9);
        const st = sim.addKerbStop({
          lane: lane.id,
          s: front,
          pathIn: new Path2(curve(A, { x, z }, n.x, n.z)),
          pathOut: new Path2(curve({ x, z }, B, n.x, n.z)),
          outLane: lane.id,
          outS: cs + 9 + sp.len / 2,
          roll: -0.075,
          speed: 2.6,
          reverseOut: false,
          model: 'delivery',
          holdMax: 90,
        });
        out.push({ st, lot: lot.id, shop: lot.name || 'the shop', x, z, fx: n.x, fz: n.z, rx, rz, doorX: door.x, doorZ: door.z, rest: rng.range(0, 200) });
        done = true;
        break;
      }
    }
  }
  return out;
}

export class Deliveries implements Scene {
  readonly name = 'delivery';
  x = 0;
  z = 0;
  reach = 2000;
  private stops: Stop[];
  private crew: { p: Person; stop: Stop | null; ph: number; t: number; crates: number; inside: boolean; cargo: number; on: boolean; tx: number; tz: number; yaw: number; variant: number; doors: boolean }[] = [];
  private since = 0;
  done = 0;

  constructor(private ctx: CityContext, private cast: Cast, rng: Rng) {
    const sim = (ctx.services.traffic as { sim?: TrafficSim } | undefined)?.sim;
    if (!sim) throw new Error('no traffic sim');
    this.sim = sim;
    this.stops = planDeliveryStops(ctx, sim, rng);
    for (let i = 0; i < MAX_LIVE; i++) {
      const p = cast.add({ persona: 'worker', dress: (L, r) => dressWork(L, r) }, 7101 + i);
      this.crew.push({ p, stop: null, ph: 0, t: 0, crates: 0, inside: false, cargo: 0, on: false, tx: 0, tz: 0, yaw: 0, variant: 0, doors: false });
    }
  }
  private sim: TrafficSim;

  update(dt: number): void {
    const h = this.ctx.clock.hours;
    const open = h >= OPEN_H && h < CLOSE_H;
    let live = 0;
    for (const c of this.crew) if (c.stop) live++;
    for (const s of this.stops) {
      if (s.rest > 0) s.rest -= dt;
      if (s.st.state === 0) s.st.open = open && s.rest <= 0 && live < MAX_LIVE;
      else s.st.open = false;
    }
    // nothing has called at a shop for a while: send a van out of sight
    this.since += dt;
    if (open && live === 0 && this.since > SEND_AFTER) {
      const cands = this.stops.filter((s) => s.st.state === 0 && s.rest <= 0);
      if (cands.length) {
        const s = cands[Math.floor(h * 1000) % cands.length];
        if (this.sim.sendTo(s.st, SPECS.delivery, Math.floor(h * 13) % 4, ['#f4f2ec', '#e63946', '#457b9d', '#2a9d8f'][Math.floor(h * 13) % 4])) this.since = 0;
      }
    }
    // a van has arrived: a free driver takes it
    for (const s of this.stops) {
      if (s.st.state !== 3 || !s.st.V || s.st.held > 80) continue;
      if (this.crew.some((c) => c.stop === s)) continue;
      const c = this.crew.find((q) => q.stop === null);
      if (!c) {
        s.st.release = true;
        continue;
      }
      c.stop = s;
      c.ph = 0;
      c.t = 1.2;
      c.crates = 3;
      c.inside = false;
      c.doors = false;
      c.variant = s.st.V.variant % 4;
      c.cargo = CARGO[c.variant];
      c.p.m.look.pram = null;
      this.since = 0;
    }
    for (const c of this.crew) if (c.stop) this.stepCrew(c, dt);
    // the van's flank on the pavement, for the crowd
    for (const s of this.stops) {
      if (s.st.state < 3 || s.st.state > 4 || !s.st.V) continue;
      for (let k = -1; k <= 1; k++) this.cast.obstacle(s.x + s.fx * k * 2 + s.rx * 0.75, s.z + s.fz * k * 2 + s.rz * 0.75, 0.42);
    }
  }

  private stepCrew(c: Deliveries['crew'][number], dt: number): void {
    const s = c.stop!;
    const p = c.p;
    const len = SPECS.delivery.len;
    // behind the van, on the pavement side
    const bx = s.x - s.fx * (len / 2 + 0.9) + s.rx * 0.6,
      bz = s.z - s.fz * (len / 2 + 0.9) + s.rz * 0.6;
    c.t -= dt;
    switch (c.ph) {
      case 0: // gets out on the pavement side of the cab and walks round to the back
        if (c.t > 0) return;
        p.show(s.x + s.fx * 1.6 + s.rx * 1.45, s.z + s.fz * 1.6 + s.rz * 1.45, Math.atan2(s.rx, s.rz));
        p.doing = `Delivering ${WHAT[c.variant]} to ${s.shop}`;
        p.speed = 1.3;
        p.walk(s.x - s.fx * 1 + s.rx * 1.5, s.z - s.fz * 1 + s.rz * 1.5, bx, bz);
        c.ph = 1;
        break;
      case 1:
        if (p.walking) return;
        p.faceTo(s.x, s.z);
        p.m.work = 2;
        c.doors = true;
        p.doing = 'Opening up the back of the van';
        c.t = 2.2;
        c.ph = 2;
        break;
      case 2: // trolley out, three crates on it
        if (c.t > 0) return;
        p.m.work = 0;
        p.m.look.pram = PUSHING;
        c.on = true;
        p.doing = `Unloading crates at ${s.shop}`;
        p.speed = 1.0;
        {
          // stop in front of the door: the trolley goes in first
          const d = Math.hypot(s.doorX - bx, s.doorZ - bz);
          const ux = (s.doorX - bx) / d,
            uz = (s.doorZ - bz) / d;
          p.walk(s.doorX - ux * 2.0, s.doorZ - uz * 2.0);
        }
        c.ph = 3;
        break;
      case 3: // through the door with it
        if (p.walking) return;
        p.hide();
        c.inside = true;
        c.t = 10;
        c.ph = 4;
        break;
      case 4: // inside; comes back out with the empty trolley
        if (c.t > 0) return;
        c.inside = false;
        c.crates = 0;
        p.doing = `Back to the van from ${s.shop}`;
        p.show(p.m.x, p.m.z, Math.atan2(bx - p.m.x, bz - p.m.z));
        p.m.look.pram = PUSHING;
        p.speed = 1.25;
        p.walk(bx, bz);
        c.ph = 5;
        break;
      case 5:
        if (p.walking) return;
        c.on = false;
        p.m.look.pram = null;
        p.faceTo(s.x, s.z);
        p.m.work = 2;
        p.doing = 'Shutting up the van';
        c.t = 2.4;
        c.ph = 6;
        break;
      case 6:
        if (c.t > 0) return;
        p.m.work = 0;
        c.doors = false;
        p.speed = 1.35;
        p.walk(s.x - s.fx * 1 + s.rx * 1.5, s.z - s.fz * 1 + s.rz * 1.5, s.x + s.fx * 1.6 + s.rx * 1.45, s.z + s.fz * 1.6 + s.rz * 1.45);
        c.ph = 7;
        break;
      case 7:
        if (p.walking) return;
        p.hide();
        s.st.release = true;
        s.rest = REST;
        c.stop = null;
        this.done++;
        break;
    }
  }

  draw(kit: Kit): void {
    const cam = this.ctx.camera.position;
    for (const c of this.crew) {
      const s = c.stop;
      if (!s || (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 > 230 * 230) continue;
      const V = s.st.V;
      if (c.doors && V) kit.put('vanrear', V.x - Math.sin(V.yaw) * (V.len / 2), V.offY, V.z - Math.cos(V.yaw) * (V.len / 2), V.yaw, new_col(V.color), 1, 1, 1, 0, V.offRoll);
      if (!c.on || !c.p.on) continue;
      const m = c.p.m;
      const fx = Math.sin(m.yaw),
        fz = Math.cos(m.yaw);
      const tx = m.x + fx * 0.36,
        tz = m.z + fz * 0.36;
      kit.put('trolley', tx, m.y, tz, m.yaw);
      // stacked on the platform
      for (let i = 0; i < c.crates; i++) {
        const cx = tx + fx * (i === 2 ? 0.5 : 0.28 + i * 0.44),
          cz = tz + fz * (i === 2 ? 0.5 : 0.28 + i * 0.44),
          y = m.y + 0.25 + (i === 2 ? 0.27 : 0);
        kit.put('crate', cx, y, cz, m.yaw + Math.PI / 2);
        kit.put('produce', cx, y, cz, m.yaw + Math.PI / 2, c.cargo);
      }
    }
  }

  timejump(): void {
    for (const s of this.stops) this.sim?.cancelKerb(s.st);
    for (const c of this.crew) {
      if (c.stop) {
        c.stop.st.release = true;
        c.stop = null;
      }
      c.on = false;
      c.doors = false;
      c.p.m.look.pram = null;
      c.p.m.fade = 0;
      c.p.hide();
    }
  }

  stats(): Record<string, number> {
    let live = 0;
    for (const c of this.crew) if (c.stop) live++;
    return { deliveryStops: this.stops.length, deliveriesLive: live, deliveriesDone: this.done };
  }
}

const new_col = (hex: string): number => parseInt(hex.slice(1), 16);
