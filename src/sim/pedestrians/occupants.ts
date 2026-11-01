// The people inside the traffic's cars, vans, lorries and buses (judge 2 #3): near the camera each cabin gets real
// seated figures of the crowd renderer (a driver with hands on the wheel, passengers with hands on the knees)
// instead of the glass shader's ray-traced ellipsoids. Presentation only: traffic marks such a vehicle `seated`,
// its glass then draws no occupants of its own and writes the depth of the cabin behind it
// (traffic/vehicleMaterial.ts), so the figures show through the windows. Seats come from the model's cabin
// description (traffic/models.ts CABIN, the same numbers the shader traces). ?nooccupants turns it off.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { Rng } from '../../core/rng';
import { CABIN, type RideGeom } from '../traffic/models';
import type { Vehicle } from '../traffic/sim';
import type { Car, Train } from '../rail/trains';
import { EMU } from '../rail/trainModels';
import { composeMatrix } from '../rail/geo';
import { Member, Party } from './crowd';
import { makeLook, type Persona } from './looks';
import { HAT_STYLES } from './shader';
import { F } from './figure';

interface TrafficSvc {
  vehicles(): Vehicle[];
}

/** the rail module loads after pedestrians: looked up lazily */
interface RailSvc {
  sim: { trains: Train[]; place(tr: Train): void };
}

/** one seat: the figure's root (vehicle frame, on the road plane under the hips) and its seated pose */
interface Seat {
  x: number;
  z: number;
  g: RideGeom;
  /** train seats: facing +z (1) or −z (−1) in the car frame */
  f: number;
}

interface Occ {
  seats: Seat[];
  ms: Member[];
}

const PERSONA: Persona[] = ['commuter', 'commuter', 'shopper', 'tourist', 'student', 'stroller'];

/** seated people are drawn only within this distance (m) of the camera; beyond, the shader's own occupants */
const NEAR = 38;
/** at most this many figures in all vehicles together (they share the crowd renderer's capacity) */
const MAX = 64;

const _e = new THREE.Euler();
const _m4 = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class Occupants {
  private ctx: CityContext;
  private svc: TrafficSvc | null;
  private nextUid = 980000;
  /** figures drawn this frame (stats) */
  n = 0;

  constructor(ctx: CityContext) {
    this.ctx = ctx;
    this.svc = (ctx.services.traffic as TrafficSvc | undefined) ?? null;
  }

  /** per frame: append the occupants of the nearby vehicles to `list` from index n; returns the new count */
  sync(list: Member[], n: number): number {
    const n0 = n;
    const svc = this.svc;
    if (!svc || typeof svc.vehicles !== 'function') return n;
    const cam = this.ctx.camera.position;
    const vs = svc.vehicles();
    for (let i = 0; i < vs.length; i++) {
      const V = vs[i];
      if (V.twoWheel) continue;
      const near = !V.dead && V.onScreen && (V.x - cam.x) ** 2 + cam.y * cam.y + (V.z - cam.z) ** 2 < NEAR * NEAR;
      let o = V.occupants as Occ | null;
      if (near && !o) {
        o = this.seat(V);
        V.occupants = o;
      }
      if (!near || !o || o.ms.length === 0 || n - n0 + o.ms.length > MAX) {
        V.seated = false;
        continue;
      }
      V.seated = true;
      _e.set(V.pitch, V.yaw, V.roll);
      _m4.makeRotationFromEuler(_e).setPosition(V.x, 0, V.z);
      for (let k = 0; k < o.ms.length; k++) {
        const s = o.seats[k],
          m = o.ms[k];
        _v.set(s.x, 0, s.z).applyMatrix4(_m4);
        m.px = m.x;
        m.pz = m.z;
        m.x = _v.x;
        m.y = _v.y;
        m.z = _v.z;
        m.yaw = V.yaw;
        m.lean = 0;
        m.pedal = 0;
        // (stopped = a rider's foot down on the road: never in a cabin)
        m.stopped = false;
        m.speed = 0;
        m.vx = 0;
        m.vz = 0;
        m.amp = 0;
        m.fade = 1;
        m.present = true;
        list[n++] = m;
      }
    }
    n = this.syncTrains(list, n, n0);
    this.n = n - n0;
    return n;
  }

  /** passengers in the saloons of the EMU cars near the camera (the shader's heads are skipped for those cars) */
  private syncTrains(list: Member[], n: number, n0: number): number {
    const rail = this.ctx.services.rail as RailSvc | undefined;
    if (!rail?.sim?.trains) return n;
    const cam = this.ctx.camera.position;
    const rz = this.ctx.plan.rail.z;
    for (const tr of rail.sim.trains) {
      if (tr.kind === 'freight') continue;
      rail.sim.place(tr);
      for (const c of tr.cars) {
        if (c.type !== 'cab' && c.type !== 'mid') continue;
        // nearest point of the car body to the camera
        const dx = Math.max(0, Math.abs(c.x - cam.x) - c.half);
        const near = c.visible && dx * dx + (rz - cam.z) ** 2 + (c.y + 2 - cam.y) ** 2 < NEAR * NEAR;
        let o = c.occupants as Occ | undefined;
        if (near && !o) {
          o = this.seatCar(c, tr.id);
          c.occupants = o;
        }
        if (!near || !o || o.ms.length === 0 || n - n0 + o.ms.length > MAX) {
          c.seated = false;
          continue;
        }
        c.seated = true;
        // the same frame as trainRender (model +Z along the direction of travel)
        const sd = tr.dir * (c.flip ? -1 : 1);
        const yaw = sd > 0 ? Math.PI / 2 : -Math.PI / 2;
        composeMatrix(_m4, c.x, c.y, rz, yaw, -sd * c.pitch, c.roll);
        for (let k = 0; k < o.ms.length; k++) {
          const s = o.seats[k],
            m = o.ms[k];
          _v.set(s.x, 0, s.z).applyMatrix4(_m4);
          m.px = m.x;
          m.pz = m.z;
          m.x = _v.x;
          m.y = _v.y;
          m.z = _v.z;
          // seats face both ways (back-to-back pairs on the seat-back planes)
          m.yaw = yaw + (s.f < 0 ? Math.PI : 0);
          m.lean = 0;
          m.pedal = 0;
          m.stopped = false;
          m.speed = 0;
          m.vx = 0;
          m.vz = 0;
          m.amp = 0;
          m.fade = 1;
          m.present = true;
          list[n++] = m;
        }
      }
    }
    return n;
  }

  /** saloon seats (trainMaterial.ts trInterior: floor 1.13, transverse seat backs on the z = k·1.9 planes,
   *  aisle |x| < 0.38): passengers sit back to back on both faces of each plane, outside the door vestibules */
  private seatCar(c: Car, trainId: number): Occ {
    const o: Occ = { seats: [], ms: [] };
    const rng = new Rng(trainId * 7919 + Math.round(c.offset * 10) * 13 + 5);
    const L = EMU.len;
    const doors = [-L / 4 - 0.1, L / 4 - 0.75];
    const z0 = -L / 2 + 0.45,
      z1 = c.type === 'cab' ? L / 2 - 1.55 : L / 2 - 0.45;
    const h = this.ctx.clock.hours;
    const busy = h > 7 && h < 9.5 ? 0.28 : h > 16 && h < 19 ? 0.26 : h > 6 && h < 22 ? 0.2 : 0.06;
    const FL = 1.13;
    for (let k = -5; k <= 5; k++) {
      const zn = k * 1.9;
      if (doors.some((d) => Math.abs(zn - d) < 0.9)) continue;
      for (const f of [1, -1]) {
        const hz = zn + f * 0.3;
        if (hz < z0 || hz > z1) continue;
        for (const x of [-1.06, -0.62, 0.62, 1.06]) {
          if (!rng.chance(busy)) continue;
          this.add(o, null, rng, x, hz, sit(FL + 0.45, 0, FL), false);
          o.seats[o.seats.length - 1].f = f;
        }
      }
    }
    return o;
  }

  /** who sits where in this vehicle (fixed per vehicle id) */
  private seat(V: Vehicle): Occ {
    const o: Occ = { seats: [], ms: [] };
    const cab = CABIN[V.spec.model as keyof typeof CABIN];
    if (!cab || !cab.a || !cab.b) return o;
    const rng = new Rng(V.id * 4241 + 29);
    const [hw, belt, , zd] = cab.a;
    const [zr, fz, rz] = cab.b;
    if (cab.c === 4) {
      // bus: the driver behind the left half of the windscreen, passengers on the double seats both sides
      const dz = zd - 0.95;
      this.add(o, V, rng, hw - 0.62, dz, drive(belt - 0.24, dz, belt - 0.02, zd - 0.42, 0.2, belt - 0.95, 0.5));
      const cy = belt - 0.42;
      const busy = this.ctx.clock.hours > 7 && this.ctx.clock.hours < 20 ? 0.32 : 0.14;
      for (let k = 0; k < 11; k++) {
        const z = fz - k * 0.82;
        if (z < zr + 0.5) break;
        for (const e of [1, -1]) {
          if (!rng.chance(busy)) continue;
          // nobody sits in the kerb-side (−X) doorways (traffic/models.ts bus doors at z 0.25 / 4.35, 1.16 m wide)
          if (e < 0 && (Math.abs(z + 0.17 - 0.25) < 0.75 || Math.abs(z + 0.17 - 4.35) < 0.75)) continue;
          // window or aisle place of the double seat
          const x = e * (rng.chance(0.6) ? hw * 0.62 : 0.52);
          this.add(o, V, rng, x, z + 0.17, sit(cy, z + 0.17, belt - 1.0), false);
        }
      }
      return o;
    }
    // cars, vans, lorry cabs: front seats at ±hw/2 with their backs at fz, cushion top belt − 0.36
    const sx = hw * 0.5,
      cy = belt - 0.36,
      hz = fz + 0.2,
      floor = belt - 0.62;
    this.add(o, V, rng, sx, hz, drive(cy, hz, belt + 0.04, zd - 0.6, 0.16, floor, 0.78));
    if (rng.chance(cab.c === 5 ? 0.25 : 0.35)) this.add(o, V, rng, -sx, hz, sit(cy, hz, floor));
    if (cab.c === 2 && rz > zr) {
      // rear bench (backs at rz): one or two now and then
      if (rng.chance(0.2)) this.add(o, V, rng, rng.chance(0.5) ? sx : -sx, rz + 0.18, sit(cy - 0.02, rz + 0.18, floor + 0.04));
    }
    return o;
  }

  private add(o: Occ, V: Vehicle | null, rng: Rng, x: number, z: number, g: RideGeom, shade = true): void {
    o.seats.push({ x, z, g, f: 1 });
    const persona = PERSONA[rng.int(0, PERSONA.length - 1)];
    const p = new Party(-2000 - (this.nextUid - 980000), persona);
    const h = this.ctx.clock.hours;
    const look = makeLook(rng, { persona, warm: h > 9 && h < 20, age: o.ms.length > 0 && rng.chance(0.15) ? 'teen' : rng.chance(0.15) ? 'elderly' : 'adult' });
    look.dog = null;
    look.pram = null;
    look.umbrellaOwner = false;
    // nothing carried, no hats with brims in a car (they would poke through the roof lining)
    look.flags &= ~(F.BACKPACK | F.ROD | F.SHOPBAG | F.BRIEFCASE | F.CANE);
    const st = look.style;
    if (st) {
      if (st.hat !== HAT_STYLES.BEANIE && st.hat !== HAT_STYLES.CAP) st.hat = HAT_STYLES.NONE;
      if (st.tail === 3) st.tail = 0;
    }
    if (V?.isBus && o.ms.length === 0) {
      // the bus driver in the operator's shirt
      look.top = 0x9fb8d6;
      look.bottom = 0x2a3140;
      if (st) st.hat = HAT_STYLES.NONE;
    }
    // in the cabin's shade and seen through tinted glass (the pane's own reflection is not drawn over them); a train
    // saloon is daylit through both window bands (only a light tint)
    if (shade) {
      look.skin = dim(look.skin);
      look.top = dim(look.top);
      look.bottom = dim(look.bottom);
      look.hair = dim(look.hair);
      look.hat = dim(look.hat);
      look.accent = dim(look.accent);
    }
    const m = new Member(this.nextUid++, p, 0, look, rng.next());
    p.members.push(m);
    m.rideG = g;
    m.fade = 1;
    m.present = true;
    o.ms.push(m);
  }
}

/** a driver: hips on the cushion (seatY over the road plane), feet forward on the pedals, hands on the wheel rim */
function drive(seatY: number, hipZ: number, wheelY: number, wheelZ: number, wheelR: number, floor: number, reach: number): RideGeom {
  return { mode: 2, seatY, seatZ: hipZ, barY: wheelY, barZ: wheelZ, barX: wheelR, footY: floor + 0.06, footZ: hipZ + reach, footX: 0.13, crank: 0, lean: 0.02 };
}

/** a passenger: hands on the thighs, feet on the floor in front */
function sit(seatY: number, hipZ: number, floor: number): RideGeom {
  return { mode: 2, seatY, seatZ: hipZ, barY: seatY + 0.13, barZ: hipZ + 0.3, barX: 0.13, footY: floor + 0.05, footZ: hipZ + 0.5, footX: 0.12, crank: 0, lean: 0.02 };
}

/** a colour as seen inside the cabin (≈ 0.6 × with a cool cast of the glass) */
function dim(c: number): number {
  const r = (c >> 16) & 255,
    g = (c >> 8) & 255,
    b = c & 255;
  return (Math.round(r * 0.56) << 16) | (Math.round(g * 0.6) << 8) | Math.round(b * 0.64);
}
