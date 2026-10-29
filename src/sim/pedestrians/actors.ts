// The people other modules place (actorDefs.ts): site workers, the band, playground kids, boat crews and
// passengers. Like riders.ts they are extra Members of the crowd renderer (no draw calls of their own), posed by
// animate.ts: standing ones use the idle poses, seated ones the rider's seated pose (`rideG` mode 2: hips on a
// seat, feet on a floor, hands at a target — an instrument, the knees, a swing's chains, an oar loom).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { Rng } from '../../core/rng';
import { composeMatrix } from '../rail/geo';
import type { RideGeom } from '../traffic/models';
import type { Boat } from '../boats/fleet';
import { ACTORS, CREW, RIDES, addActor, type ActorDef, type ActorRole, type CrewSeat } from './actorDefs';
import { Member, Party } from './crowd';
import { makeLook, type Persona } from './looks';
import { HAT_STYLES } from './shader';
import { F } from './figure';

/** landmark visibility groups (landmarks.ts uVis: x site / work hours, y concerts, z school, w playground) */
function visible(g: number, h: number): boolean {
  if (g < 0) return true;
  return g === 0 ? h >= 7 && h < 18 : g === 1 ? h >= 16 && h < 21 : g === 2 ? h >= 7.5 && h < 14.5 : h >= 8 && h < 19.5;
}

const PERSONA: Record<ActorRole, Persona> = {
  worker: 'worker',
  band: 'commuter',
  conductor: 'commuter',
  kid: 'family',
  crew: 'angler',
  passenger: 'tourist',
  rower: 'jogger',
  helm: 'angler',
  fisher: 'angler',
  shopper: 'shopper',
  traveller: 'commuter',
  farmer: 'worker',
};

/** cull distance (m): beyond this nobody is drawn (the pin LOD reads as a dot well before) */
const FAR = 170;

interface Static {
  d: ActorDef;
  m: Member;
  g: RideGeom | null;
}

interface Crew {
  boat: Boat;
  seats: CrewSeat[];
  ms: Member[];
  gs: (RideGeom | null)[];
}

const _m4 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Actors {
  private ctx: CityContext;
  private statics: Static[] = [];
  private crews = new Map<number, Crew>();
  private rides: { m: Member; g: RideGeom }[] = [];
  private nextUid = 950000;
  /** drawn this frame (stats) */
  n = 0;

  /** platform: sim seconds since the last train left / a train is standing at the platform */
  private sinceTrain = 1e9;
  private trainIn = false;

  constructor(ctx: CityContext) {
    this.ctx = ctx;
    this.placeCrowds();
    this.adopt();
  }

  /** the dense places' own people: shoppers at the market stalls, passengers waiting on the platform */
  private placeCrowds(): void {
    const ctx = this.ctx;
    const hash = (a: number) => {
      const q = Math.sin(a * 91.345 + 3.1) * 43758.5453;
      return q - Math.floor(q);
    };
    // market: one at the counter talking to the stallholder, one browsing beside, now and then a second
    // customer waiting behind (8–14:30, then the stalls pack up)
    for (const f of ctx.plan.features) {
      if (f.kind !== 'marketstall') continue;
      const yaw = f.yaw ?? 0;
      const fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      const slots: [number, number, number, number, number][] = [
        // front, lateral, presence, idle, yaw offset
        [1.15, -0.4 + 0.2 * hash(f.id), 0.8, 7, 0.1],
        [1.2, 0.55, 0.5, hash(f.id + 1) < 0.5 ? 0 : 2, -0.25],
        [1.95, -0.3, 0.35, hash(f.id + 2) < 0.5 ? 4 : 5, 0.05],
      ];
      for (let k = 0; k < slots.length; k++) {
        const [fw, lat, p, idle, dy] = slots[k];
        const x = f.x + fx * fw + fz * lat,
          z = f.z + fz * fw - fx * lat;
        addActor({ x, y: 0, z, yaw: yaw + Math.PI + dy, role: 'shopper', idle, h0: 8, h1: 14.5, p, carry: hash(f.id * 3 + k) < 0.4 ? 1 : 0 });
      }
    }
    // platform: passengers waiting behind the edge line facing the track, some on the benches (one beside the
    // wheeled case W7 left by the bench at x −8.8, one with the rucksack, one with the holdall)
    const st = ctx.plan.rail?.stations?.[0];
    if (st) {
      const P = st.platform,
        Y = st.platformY;
      const zN = P.z0,
        bz = (P.z0 + P.z1) / 2 + 0.85;
      const xs = [-38.5, -33.2, -26.4, -21.3, -13.1, -11.6, -4.2, -2.9, 3.6, 6.1, 12.4, 14.9, 21.7, 25.8, 34.1, 39.0];
      for (let k = 0; k < xs.length; k++) {
        const x = xs[k] + (hash(k) - 0.5) * 0.6,
          z = zN + 0.95 + hash(k + 40) * 0.7;
        addActor({ x, y: Y, z, yaw: Math.PI + (hash(k + 80) - 0.5) * 0.9, role: 'traveller', idle: [0, 5, 2, 1, 5, 4][k % 6], h0: 6, h1: 23.5, p: 0.75, carry: hash(k + 7) < 0.35 ? 2 : 0, group: 1, delay: 15 + hash(k + 11) * 260 });
      }
      for (const [x, carry] of [
        [-8.8 + 0.45, 0],
        [-17.6 - 0.5, 0],
        [17.6 + 0.35, 0],
        [8.8 - 0.3, 0],
        [30.5 + 0.4, 2],
      ] as [number, number][])
        addActor({ x, y: Y, z: bz - 0.05, yaw: Math.PI, role: 'traveller', seated: true, seatY: 0.47, h0: 6, h1: 23.5, p: 0.8, carry, group: 1, delay: 5 + hash(x) * 200 });
      // the wheeled case's owner, standing beside it
      addActor({ x: -8.8 + 1.45, y: Y, z: bz - 0.75, yaw: Math.PI - 0.5, role: 'traveller', idle: 5, h0: 6, h1: 23.5, p: 1, group: 1, delay: 0 });
    }
  }

  /** make the members of registered actors not seen yet (rail registers after us) */
  private adopt(): void {
    for (let i = this.statics.length; i < ACTORS.length; i++) {
      const d = ACTORS[i];
      const m = this.make(d.role, d.seed, d.shirt, d.child, d.carry);
      let g: RideGeom | null = null;
      if (d.seated) {
        g = seatGeom(d.role, d.seatY, d.child);
        if (d.child && d.rot) {
          // a swing (hung from a bar overhead): hands up on the chains beside the hips; a see-saw: on the handle
          // bar 0.2 m ahead at 0.82 m
          const swing = d.rot.py - d.y > 1;
          g.barY = swing ? d.seatY + 0.42 : 0.82 - d.y;
          g.barZ = swing ? 0.05 : 0.2;
          g.barX = swing ? 0.2 : 0.14;
        }
      }
      else if (d.idle >= 0) m.forceIdle = d.idle;
      else if (d.role === 'worker') m.forceIdle = [0, 3, 2, 4, 7][d.seed % 5];
      else if (d.role === 'conductor') m.forceIdle = 7;
      m.work = d.work;
      // the site's workers get on with it: stooped at the kerbs / pallets, or busy at a trestle, one looks on
      if (d.role === 'worker' && d.work === 0) m.work = [1, 2, 0, 2, 1][((d.seed / 7919) | 0) % 5];
      m.fade = 0;
      m.rideG = g;
      m.yaw = d.yaw;
      this.statics.push({ d, m, g });
    }
  }

  update(dt: number): void {
    if (!this.trainIn) this.sinceTrain += dt;
  }

  onTrain(arrive: boolean): void {
    this.trainIn = arrive;
    if (!arrive) this.sinceTrain = 0;
  }

  private make(role: ActorRole, seed: number, shirt: number, child: boolean, carry = 0): Member {
    const rng = new Rng(seed * 31 + 7);
    const persona = PERSONA[role];
    const p = new Party(-1000 - (this.nextUid - 950000), persona);
    const h = this.ctx.clock.hours;
    const look = makeLook(rng, { persona, warm: h > 9 && h < 20, age: child ? 'child' : 'adult' });
    look.dog = null;
    look.pram = null;
    look.umbrellaOwner = false;
    look.flags &= ~(F.BACKPACK | F.ROD | F.SHOPBAG | F.BRIEFCASE | F.CANE);
    if (carry === 1) look.flags |= F.SHOPBAG;
    else if (carry === 2) look.flags |= F.BACKPACK;
    const st = look.style;
    if (role === 'fisher') {
      // oilskins: a yellow / orange smock or bib-and-brace over a dark jumper, wellies
      look.top = rng.pick([0xe8a21c, 0xe0662a, 0xd9c21e, 0x2f5f3a]);
      look.bottom = rng.pick([0xe0662a, 0x2b3a55, 0x26272b, 0xe8a21c]);
      look.shoes = 0x1d1f1c;
    }
    if (shirt >= 0) look.top = shirt;
    if (st) {
      if (role === 'worker') {
        st.hat = HAT_STYLES.HARDHAT;
        look.hat = rng.pick([0xf2f2ec, 0xf2f2ec, 0xf0c419, 0xe0662a]);
        st.vest = true;
      } else if (role === 'band' || role === 'conductor') {
        // bandsmen: uniform jacket, dark trousers, peaked cap; the conductor in black
        st.hat = role === 'band' ? HAT_STYLES.CAP : HAT_STYLES.NONE;
        look.hat = 0x1f2226;
        look.bottom = 0x1f2226;
        st.tail = 0;
        st.sleeve = 1;
        st.trouserEnd = 1;
        st.lapels = true;
      } else if (role === 'crew' || role === 'helm' || role === 'fisher') {
        if (st.hat === HAT_STYLES.SUNHAT || st.hat === HAT_STYLES.FEDORA) st.hat = HAT_STYLES.BEANIE;
        st.tail = 0;
      } else if (role === 'farmer') {
        // overalls-blue or a work shirt, a flat cap
        st.hat = HAT_STYLES.CAP;
        look.hat = rng.pick([0x3b3a34, 0x4a5a3c, 0x2b3a55]);
        look.top = rng.pick([0x2f4f7a, 0x6a2e2a, 0x55603d, 0x8a8577]);
        look.bottom = rng.pick([0x2b3a55, 0x3a3a33]);
        st.vest = false;
        st.tail = 0;
      } else if (role === 'rower') {
        st.hat = HAT_STYLES.NONE;
        st.tail = 0;
        st.sleeve = 0.42;
      }
      if (role !== 'passenger' && st.tail === 3) st.tail = 0;
    }
    const m = new Member(this.nextUid++, p, 0, look, rng.next());
    p.members.push(m);
    m.fade = 1;
    m.present = true;
    return m;
  }

  /** per frame: append the visible actors to `list` from index n; returns the new count */
  sync(list: Member[], n: number): number {
    const h = this.ctx.clock.hours;
    const cam = this.ctx.camera.position;
    const t = this.ctx.uniforms.uTime.value;
    const far2 = FAR * FAR;
    const n0 = n;
    if (this.statics.length < ACTORS.length) this.adopt();
    for (let i = 0; i < this.statics.length; i++) {
      const s = this.statics[i];
      const d = s.d;
      // here now? (landmark group / hours / people coming and going by the 20-minute period); fade in and out
      // platform passengers board the train standing at the platform and gather again after it left
      let on = visible(d.vis, h) && h >= d.h0 && h < d.h1 && (d.group !== 1 || (!this.trainIn && this.sinceTrain > d.delay));
      if (on && d.p < 1) {
        const q = Math.sin(d.seed * 12.9898 + Math.floor(h * 3) * 78.233) * 43758.5453;
        on = q - Math.floor(q) < d.p;
      }
      const m0 = s.m;
      m0.fade = on ? Math.min(1, m0.fade + 0.04) : Math.max(0, m0.fade - 0.04);
      if (m0.fade <= 0) continue;
      let x = d.x,
        y = d.y,
        z = d.z;
      const r = d.rot;
      if (r !== null) {
        _v.set(x - r.px, y - r.py, z - r.pz);
        _q.setFromAxisAngle(_v.set(r.ax, r.ay, r.az), r.amp * Math.sin(r.freq * t + r.ph));
        _v.set(x - r.px, y - r.py, z - r.pz).applyQuaternion(_q);
        x = r.px + _v.x;
        y = r.py + _v.y;
        z = r.pz + _v.z;
      }
      if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > far2) continue;
      const f = m0.fade;
      place(m0, x, y, z, d.yaw, 0);
      m0.fade = f;
      list[n++] = m0;
    }
    // boat crews and passengers, carried by the boat (upright: people balance against the heel)
    const fleet = (this.ctx.services.boats as { fleet?: { boats: Boat[] } } | undefined)?.fleet;
    if (fleet) {
      const boats = fleet.boats;
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i];
        if ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 > far2) continue;
        const seats = CREW[b.dims.mesh]?.[b.dims.variant];
        if (!seats || seats.length === 0) continue;
        let c = this.crews.get(b.id);
        if (!c) {
          c = { boat: b, seats, ms: [], gs: [] };
          for (let k = 0; k < seats.length; k++) {
            const sk = seats[k];
            const role: ActorRole = sk.rower ? 'rower' : b.dims.mesh === 'big' && b.type !== 'fish' && b.type !== 'tug' ? 'passenger' : k === 0 ? 'helm' : 'crew';
            const m = this.make(role, b.id * 131 + k * 17, sk.shirt, false);
            const g = sk.seated ? seatGeom(role, sk.seatH, false) : standGeom();
            m.rideG = g;
            c.ms.push(m);
            c.gs.push(g);
          }
          this.crews.set(b.id, c);
        }
        const surge = b.type === 'row' && b.v > 0.3 ? 0.12 * Math.sin(b.rowPhase) : 0;
        composeMatrix(_m4, b.x + Math.sin(b.yaw) * surge, b.y, b.z + Math.cos(b.yaw) * surge, b.yaw, b.pitch + b.trim, b.roll + b.heel);
        for (let k = 0; k < seats.length; k++) {
          const sk = seats[k];
          const m = c.ms[k];
          const g = c.gs[k];
          _v.set(sk.x, sk.y, sk.z).applyMatrix4(_m4);
          if (sk.rower && g) {
            // the stroke: hands reach forward to the catch, pull in to the ribs at the finish; body swings
            const a = b.rowPhase;
            g.barZ = 0.2 + 0.24 * Math.cos(a);
            g.lean = 0.12 + 0.3 * Math.cos(a);
          }
          place(m, _v.x, _v.y - (sk.seated ? sk.seatH : 0), _v.z, b.yaw + sk.facing, b.v);
          list[n++] = m;
        }
      }
    }
    // drivers carried by moving models (the field tractor's cab)
    for (let i = 0; i < RIDES.length; i++) {
      const r = RIDES[i];
      if (!r.obj.visible) continue;
      r.obj.updateMatrixWorld();
      const e = r.obj.matrixWorld.elements;
      const fx = e[0] * r.x + e[4] * r.floorY + e[8] * r.z + e[12],
        fy = e[1] * r.x + e[5] * r.floorY + e[9] * r.z + e[13],
        fz = e[2] * r.x + e[6] * r.floorY + e[10] * r.z + e[14];
      if ((fx - cam.x) ** 2 + (fz - cam.z) ** 2 > far2) continue;
      let k = this.rides[i];
      if (!k) {
        // hands on the wheel rim (the root is the floor under the hips; +z = forward)
        const g: RideGeom = { mode: 2, seatY: r.y - r.floorY, seatZ: 0, barY: r.wheel[1] - r.floorY - 0.06, barZ: r.wheel[2] - r.z - 0.08, barX: 0.15, footY: 0, footZ: 0.42, footX: 0.12, crank: 0, lean: 0.06 };
        const m = this.make(r.role, 4517 + i * 31, -1, false);
        m.rideG = g;
        k = this.rides[i] = { m, g };
      }
      place(k.m, fx, fy, fz, Math.atan2(e[8], e[10]), 1);
      list[n++] = k.m;
    }
    this.n = n - n0;
    return n;
  }
}

function place(m: Member, x: number, y: number, z: number, yaw: number, v: number): void {
  m.px = m.x;
  m.pz = m.z;
  m.x = x;
  m.y = y;
  m.z = z;
  m.yaw = yaw;
  m.lean = 0;
  m.pedal = 0;
  m.stopped = false;
  m.speed = v;
  m.vx = 0;
  m.vz = 0;
  m.amp = 0;
  m.fade = 1;
  m.present = true;
}

/** seated (rider pose mode 2): seat top `seatY` over the floor, feet forward on it, hands at the role's target */
function seatGeom(role: ActorRole, seatY: number, child: boolean): RideGeom {
  const k = child ? 0.62 : 1;
  // band: hands up in front of the chest (instrument); kids: on the swing chains / seesaw handle; others: on the knees
  const barY = role === 'band' ? seatY + 0.5 : child ? seatY + 0.36 : role === 'rower' ? seatY + 0.2 : seatY + 0.12;
  const barZ = role === 'band' ? 0.3 : child ? 0.12 : role === 'rower' ? 0.3 : 0.32;
  const barX = role === 'band' ? 0.1 : child ? 0.19 : role === 'rower' ? 0.2 : 0.13;
  return { mode: 2, seatY, seatZ: 0, barY, barZ, barX, footY: child ? Math.max(0, seatY - 0.36) : 0, footZ: (child ? 0.22 : 0.42) * k + 0.08, footX: 0.12 * k, crank: 0, lean: role === 'rower' ? 0.2 : 0.04 };
}

/** standing on a deck: one foot ahead, hands on the rail / wheel in front */
function standGeom(): RideGeom {
  return { mode: 3, seatY: 0, seatZ: 0, barY: 1.0, barZ: 0.32, barX: 0.2, footY: 0, footZ: 0, footX: 0.1, crank: 0, lean: 0.04 };
}
