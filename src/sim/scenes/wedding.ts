// A wedding at St. Mary's, every day at 10:45: the car is waiting at the kerb when the guests come out of the church and
// line up either side of the door. The couple come out to confetti, the party gathers on the steps for the photographer,
// the bride throws her bouquet, the couple walk through the guests to the decorated car and drive off with tins
// rattling behind, the guests wave, then drift away along the pavement. Confetti stays on the ground for a while.
// Scripted in sim seconds from the start; a clock jump into the event fast-forwards it from the beginning.

import type { CityContext } from '../../core/context';
import { Path2, type P2 } from '../../core/geom';
import type { KerbStop, TrafficSim, Vehicle } from '../traffic/sim';
import { SPECS } from '../traffic/specs';
import type { Scene } from '../scenes';
import type { Look } from '../pedestrians/looks';
import type { Rng } from '../../core/rng';
import { HAT_STYLES } from '../pedestrians/shader';
import { Cast, Person } from './cast';
import type { Kit } from './kit';

const START = 10.75;
const CAR_AT = 10.2;
/** script times (s after START) */
const COUPLE = 16,
  PHOTO = 25,
  TOSS = 44,
  TO_CAR = 50,
  DRIVE = 60,
  DISPERSE = 66,
  END = 100;
const GUESTS = 16;
const CONFETTI_COLS = [0xf8f0e8, 0xf2c8d4, 0xc8dcf0, 0xf4e6a8, 0xd8c8f0, 0xffffff, 0xf0b8a8];
const SUITS = [0x23252b, 0x2f3a55, 0x4a4a50, 0x3a3048];
const DRESSES = [0xc84a6a, 0x4a7ab0, 0xe8a83c, 0x4f9d7b, 0x8e5aa8, 0xe07a5a, 0x7a9ad8, 0xd8688a];

function dressBride(L: Look): void {
  L.top = L.bottom = 0xf8f4ee;
  L.shoes = 0xf0ece4;
  const st = L.style;
  if (st) {
    st.hat = HAT_STYLES.NONE;
    st.sleeve = 0.9;
    st.tail = 3;
    st.tailHem = 0.03;
    st.tailFlare = 0.2;
    st.jacketHem = -1;
    st.lapels = false;
    st.tie = false;
    st.vest = false;
    st.legwear = 0;
  }
}
function dressGroom(L: Look): void {
  L.top = 0x1f2228;
  L.bottom = 0x1f2228;
  L.shoes = 0x151517;
  const st = L.style;
  if (st) {
    st.hat = HAT_STYLES.NONE;
    st.sleeve = 0;
    st.tail = 0;
    st.lapels = true;
    st.tie = true;
    st.jacketHem = 0.25;
    st.outer = 0x1f2228;
    st.collar = 1;
    st.trouserEnd = 0.08;
    st.trouserFit = 0.9;
  }
}
function dressGuest(L: Look, rng: Rng, man: boolean): void {
  const st = L.style;
  if (man) {
    const c = rng.pick(SUITS);
    L.top = L.bottom = c;
    L.shoes = 0x1a1a1c;
    if (st) {
      st.hat = HAT_STYLES.NONE;
      st.sleeve = 0;
      st.tail = 0;
      st.lapels = true;
      st.tie = rng.chance(0.7);
      st.jacketHem = 0.25;
      st.outer = c;
      st.trouserEnd = 0.08;
      st.trouserFit = 0.9;
    }
  } else {
    const c = rng.pick(DRESSES);
    L.top = L.bottom = c;
    L.shoes = rng.pick([0x2a2022, 0xc8a890, 0x8a3a3a]);
    if (st) {
      st.hat = rng.chance(0.3) ? HAT_STYLES.SUNHAT : HAT_STYLES.NONE;
      if (st.hat) L.hat = rng.pick([0xf0e8d8, c]);
      st.sleeve = rng.chance(0.5) ? 1.1 : 0.7;
      st.tail = 3;
      st.tailHem = rng.range(0.3, 0.42);
      st.tailFlare = 0.08;
      st.jacketHem = -1;
      st.lapels = false;
      st.tie = false;
      st.legwear = 0;
    }
  }
}

interface Guest {
  p: Person;
  /** place in the lines by the door */
  lx: number;
  lz: number;
  /** place in the photo */
  px: number;
  pz: number;
  /** direction it leaves */
  dir: number;
  /** comes out after this many seconds */
  at: number;
}

export class Wedding implements Scene {
  readonly name = 'wedding';
  x = 70;
  z = 95;
  reach = 240;
  private stop: KerbStop | null = null;
  private sim: TrafficSim | null;
  private door: P2 = { x: 70, z: 92.5 };
  private guests: Guest[] = [];
  private bride: Person;
  private groom: Person;
  private photographer: Person;
  private t = -1;
  private beat = 0;
  /** confetti: pool of pieces x, y, z, vx, vy, vz, spin (flat), colour */
  private c = new Float32Array(420 * 7);
  private cCol = new Int32Array(420);
  private cN = 0;
  private cLife = 0;
  /** bouquet flight */
  private bq = { on: false, t: 0, x0: 0, z0: 0, x1: 0, z1: 0 };
  private car: Vehicle | null = null;
  private carT = 0;
  private lastDay = -1;
  private ran = false;
  private catcher = 0;

  constructor(private ctx: CityContext, private cast: Cast, rng: Rng) {
    this.sim = (ctx.services.traffic as { sim?: TrafficSim } | undefined)?.sim ?? null;
    const lot = ctx.plan.lots.find((l) => l.kind === 'church');
    if (!lot || !lot.doors.length) throw new Error('no church');
    const d = lot.doors[0];
    this.door = { x: d.x, z: d.z };
    this.x = d.x;
    this.z = d.z + 2;
    this.bride = cast.add({ persona: 'couple', kind: 'woman', dress: (L) => dressBride(L) }, 7201);
    this.groom = cast.add({ persona: 'couple', kind: 'man', dress: (L) => dressGroom(L) }, 7202);
    this.photographer = cast.add({ persona: 'tourist', dress: (L) => void (L.top = 0x2a2c30) }, 7203);
    this.bride.doing = 'Just married!';
    this.groom.doing = 'Just married!';
    this.photographer.doing = 'Taking the wedding photos';
    // two loose lines from the door along the pavement, kerb side of the walkway left free (walkers pass behind them)
    for (let i = 0; i < GUESTS; i++) {
      const man = i % 2 === 0;
      const p = cast.add({ persona: 'stroller', kind: man ? 'man' : 'woman', dress: (L, r) => dressGuest(L, r, man) }, 7210 + i);
      p.doing = 'A guest at the wedding';
      const side = i % 4 < 2 ? -1 : 1;
      const row = Math.floor(i / 4);
      const lx = d.x + side * (1.05 + row * 0.8 + rng.range(-0.08, 0.08)),
        lz = d.z + 1.15 + (i % 2) * 0.62 + rng.range(-0.08, 0.08);
      // the photo: three rows in a fan on the steps behind the couple
      const prow = i < 6 ? 0 : i < 11 ? 1 : 2;
      const pcols = prow === 0 ? 6 : 5;
      const pi = prow === 0 ? i : prow === 1 ? i - 6 : i - 11;
      const px = d.x + (pi - (pcols - 1) / 2) * 0.72 + rng.range(-0.05, 0.05),
        pz = d.z + 1.75 - prow * 0.55;
      this.guests.push({ p, lx, lz, px, pz, dir: side, at: 0.5 + i * 0.85 });
    }
    this.buildStop();
  }

  /** on the door's side of the road (lane heading west), just past the door: half on the kerb */
  private buildStop(): void {
    const sim = this.sim;
    if (!sim) return;
    const d = this.door;
    const lane = this.ctx.roads.lanes.find((l) => {
      const a = l.path.at(0),
        b = l.path.at(l.length);
      return Math.abs(a.z - b.z) < 0.1 && Math.abs(a.z - 98.3) < 1 && a.x > d.x && b.x < d.x;
    });
    if (!lane) return;
    const sp = SPECS.sedan;
    // (the lamp 7 m east of the door and the bench 4 m west of it leave just this stretch of kerb)
    const stand = d.x + 3.4;
    const zLane = lane.path.at(0).z;
    const curve = (x0: number, z0: number, x1: number, z1: number): P2[] => {
      const out: P2[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12,
          k = t * t * (3 - 2 * t);
        out.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * k });
      }
      return out;
    };
    const zK = zLane - 2.3;
    const cs = lane.path.at(0).x - (stand + 6);
    this.stop = sim.addKerbStop({ lane: lane.id, s: cs + sp.len / 2, pathIn: new Path2(curve(stand + 6, zLane, stand, zK)), pathOut: new Path2(curve(stand, zK, stand - 6, zLane)), outLane: lane.id, outS: lane.path.at(0).x - (stand - 6) + sp.len / 2, roll: -0.075, speed: 2.2, reverseOut: false, model: 'wedding', holdMax: 400 });
  }

  private begin(): void {
    this.t = 0;
    this.beat = 0;
    this.ran = true;
    this.cN = 0;
    this.bq.on = false;
    for (const g of this.guests) g.p.hide();
  }

  update(dt: number): void {
    const h = this.ctx.clock.hours;
    const day = this.ctx.clock.day;
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.ran = false;
    }
    const raining = this.ctx.uniforms.uRain.value > 0.4;
    // the car comes ahead of time
    const st = this.stop;
    if (st && this.sim && h >= CAR_AT && h < START + 0.5 && st.V === null && !raining && !this.ran) {
      if (this.sim.sendTo(st, SPECS.sedan, 0, '#f6f4ee')) this.car = st.V;
    }
    if (this.t < 0 && !this.ran && !raining && h >= START && h < START + 0.25) this.begin();
    if (this.t >= 0) this.script(dt);
    this.stepConfetti(dt);
    // a car that never got its couple goes home; the decorations stay on the car while it is in view of the town
    if (this.car) {
      this.carT += this.t >= 0 ? 0 : dt;
      if (st && st.V !== this.car && (this.car.dead || this.carT > 120)) {
        this.car = null;
        this.carT = 0;
      }
    }
    // the party keeps a clear way past on the pavement's road side: the crowd sees each guest as a person (cast.step)
  }

  private script(dt: number): void {
    const t = (this.t += dt);
    const d = this.door;
    const st = this.stop;
    // guests come out of the door one by one and walk to their places in the lines
    for (const g of this.guests) {
      if (!g.p.on && t >= g.at && t < PHOTO) {
        g.p.show(d.x + (g.dir > 0 ? 0.3 : -0.3), d.z + 0.15, 0);
        g.p.speed = 1.05 + (g.at % 0.3);
        g.p.walk(d.x + (g.dir > 0 ? 0.5 : -0.5), d.z + 0.8, g.lx, g.lz);
      }
      if (g.p.on && !g.p.walking && t < PHOTO) {
        g.p.faceTo(d.x, d.z + 0.3);
        g.p.m.forceIdle = g.p.m.uid % 3 === 0 ? 7 : g.p.m.uid % 3 === 1 ? 4 : 2;
      }
    }
    const b = this.bride,
      g = this.groom;
    if (this.beat === 0 && t >= COUPLE - 1) {
      // the photographer is ready across the pavement, the couple come out arm in arm
      this.photographer.show(d.x + 0.4, d.z + 4.2, Math.PI).walk(d.x + 0.2, d.z + 3.55);
      b.show(d.x + 0.24, d.z + 0.1, 0);
      g.show(d.x - 0.24, d.z + 0.1, 0);
      b.speed = g.speed = 0.75;
      b.walk(d.x + 0.27, d.z + 1.15);
      g.walk(d.x - 0.27, d.z + 1.15);
      this.beat = 1;
    }
    if (this.beat === 1 && t >= COUPLE + 1) {
      // confetti! everyone's arms go up
      this.burst(d.x, 1.8, d.z + 1.1, 170, 1.7);
      for (const q of this.guests) q.p.m.waveT = 1.8 + (q.at % 0.8);
      this.beat = 2;
    }
    if (this.beat === 2 && t >= COUPLE + 3.4) {
      this.burst(d.x, 1.7, d.z + 1.4, 110, 1.5);
      this.beat = 3;
    }
    if (this.beat === 3 && t >= PHOTO) {
      // the photo: couple in front of the middle, guests in rows behind them, the photographer backs up
      for (const q of this.guests) {
        q.p.m.forceIdle = -1;
        q.p.speed = 1.0;
        q.p.walk(q.px, q.pz);
      }
      b.speed = g.speed = 0.8;
      b.walk(d.x + 0.27, d.z + 2.5);
      g.walk(d.x - 0.27, d.z + 2.5);
      this.photographer.m.forceIdle = 5;
      this.photographer.walk(d.x + 0.1, d.z + 4.25);
      this.photographer.face(Math.PI);
      b.face(0);
      g.face(0);
      this.beat = 4;
    }
    if (this.beat === 4 && t >= PHOTO + 7) {
      for (const q of this.guests) {
        q.p.face(0);
        q.p.m.forceIdle = q.p.m.uid % 2 ? 2 : 0;
      }
      b.face(0);
      g.face(0);
      this.photographer.faceTo(d.x, d.z + 1.5);
      this.beat = 5;
    }
    if (this.beat === 5 && t >= TOSS) {
      // the bouquet over her shoulder
      b.face(Math.PI);
      b.m.waveT = 1.2;
      this.catcher = 7 + (this.ctx.clock.day % 4);
      const q = this.guests[this.catcher];
      this.bq = { on: true, t: 0, x0: b.m.x, z0: b.m.z, x1: q.p.m.x, z1: q.p.m.z };
      this.beat = 6;
    }
    if (this.beat === 6 && !this.bq.on) {
      this.guests[this.catcher].p.m.waveT = 2.2;
      this.guests[this.catcher].p.doing = 'Caught the bouquet!';
      this.beat = 7;
    }
    if (this.beat === 7 && t >= TO_CAR) {
      // back to the lines: an aisle to the car, one more shower, the couple walk through it
      for (const q of this.guests) {
        q.p.m.forceIdle = -1;
        q.p.speed = 1.05;
        q.p.walk(q.lx, q.lz + 0.1);
      }
      this.photographer.m.forceIdle = 5;
      this.photographer.walk(d.x + 3.2, d.z + 3.6);
      this.beat = 8;
    }
    if (this.beat === 8 && t >= TO_CAR + 4) {
      for (const q of this.guests) {
        q.p.faceTo(b.m.x, b.m.z);
        q.p.m.waveT = 2.4;
      }
      this.burst(d.x, 1.8, d.z + 2.6, 140, 1.8);
      const V = st?.V;
      const cx = V ? V.x - 0.4 : d.x + 1.5,
        cz = V ? V.z - 1.3 : d.z + 3.4;
      b.speed = g.speed = 1.05;
      b.walk(cx + 0.3, cz);
      g.walk(cx - 0.4, cz);
      this.beat = 9;
    }
    if (this.beat === 9 && !b.walking && !g.walking) {
      // into the car
      b.hide();
      g.hide();
      if (st && st.V) this.car = st.V;
      this.beat = 10;
    }
    if (this.beat === 10 && t >= DRIVE) {
      if (st && st.state === 3) st.release = true;
      for (const q of this.guests) {
        q.p.m.waveT = 3;
        q.p.faceTo(d.x - 8, d.z + 4);
      }
      this.photographer.m.forceIdle = 7;
      this.beat = 11;
    }
    if (this.beat === 11 && t >= DISPERSE) {
      // chatting in twos, off along the pavement either way (or back in by the door)
      for (let i = 0; i < this.guests.length; i++) {
        const q = this.guests[i];
        q.p.m.forceIdle = -1;
        q.p.speed = 1.0 + (i % 4) * 0.07;
        const dir = i % 5 === 4 ? 0 : i % 2 ? 1 : -1;
        const far = 16 + (i % 6) * 3;
        q.at = t + 1 + (i % 7) * 1.4;
        q.p.a = dir;
        q.p.b = far;
      }
      this.photographer.m.forceIdle = -1;
      this.photographer.walk(d.x - 12, d.z + 2.1);
      this.beat = 12;
    }
    if (this.beat === 12) {
      for (const q of this.guests) {
        if (q.p.t === 0 && t >= q.at) {
          q.p.t = 1;
          const dir = q.p.a;
          if (dir === 0) q.p.walk(d.x + 0.3, d.z + 0.9, d.x + 0.3, d.z + 0.2);
          else q.p.walk(q.p.m.x + dir * 2, d.z + 2.1, d.x + dir * q.p.b, d.z + 2.1 + (q.p.m.uid % 3) * 0.2);
        }
        if (q.p.t === 1 && !q.p.walking) {
          q.p.t = 2;
          q.p.hide();
        }
      }
      if (!this.photographer.walking) this.photographer.hide();
    }
    if (t >= END || (this.beat === 12 && this.guests.every((q) => q.p.t === 2))) {
      for (let i = 0; i < this.guests.length; i++) {
        const q = this.guests[i];
        q.p.hide();
        q.p.t = 0;
        q.at = 0.5 + i * 0.85;
      }
      b.hide();
      g.hide();
      this.photographer.hide();
      this.t = -1;
    }
    // the bouquet
    const bq = this.bq;
    if (bq.on) {
      bq.t += dt / 1.3;
      if (bq.t >= 1) bq.on = false;
    }
  }

  private burst(x: number, y: number, z: number, n: number, spread: number): void {
    const c = this.c;
    for (let i = 0; i < n; i++) {
      const k = (this.cN + i) % 420;
      const a = Math.random() * Math.PI * 2,
        r = Math.random() * spread;
      c[k * 7] = x + Math.cos(a) * r * 0.5;
      c[k * 7 + 1] = y + Math.random() * 0.3;
      c[k * 7 + 2] = z + Math.sin(a) * r * 0.5;
      c[k * 7 + 3] = Math.cos(a) * r * 0.55;
      c[k * 7 + 4] = 1.6 + Math.random() * 2.2;
      c[k * 7 + 5] = Math.sin(a) * r * 0.55;
      c[k * 7 + 6] = Math.random() * 6.28;
      this.cCol[k] = CONFETTI_COLS[k % CONFETTI_COLS.length];
    }
    this.cN = Math.min(420, this.cN + n);
    this.cLife = 70;
  }

  private stepConfetti(dt: number): void {
    if (this.cLife <= 0) return;
    this.cLife -= dt;
    const c = this.c;
    const wind = this.ctx.uniforms.uWind.value;
    const w = wind.x !== undefined ? wind : { x: 0.3, y: 0.1 };
    const g = this.cast.ground(this.door.x, this.door.z + 2);
    const n = this.cN;
    const t = this.ctx.uniforms.uTime.value;
    for (let k = 0; k < n; k++) {
      const i = k * 7;
      if (c[i + 1] <= g + 0.16 && c[i + 4] <= 0) continue; // on the ground
      c[i + 4] = Math.max(c[i + 4] - 6 * dt, -0.75 - 0.3 * Math.sin(k * 1.7));
      c[i + 3] += (w.x * 0.5 - c[i + 3]) * Math.min(1, dt * 1.2);
      c[i + 5] += (w.y * 0.5 - c[i + 5]) * Math.min(1, dt * 1.2);
      c[i] += (c[i + 3] + 0.22 * Math.sin(t * 2.3 + k)) * dt;
      c[i + 1] += c[i + 4] * dt;
      c[i + 2] += (c[i + 5] + 0.22 * Math.cos(t * 1.9 + k * 1.3)) * dt;
      c[i + 6] += dt * (3 + (k % 5));
      if (c[i + 1] < g + 0.16) {
        c[i + 1] = g + 0.16;
        c[i + 4] = 0;
      }
    }
    if (this.cLife <= 0) this.cN = 0;
  }

  draw(kit: Kit): void {
    if (this.cLife > 0) {
      const c = this.c;
      const n = this.cN;
      const fade = Math.min(1, this.cLife / 8);
      for (let k = 0; k < n; k++) {
        const i = k * 7;
        const onGround = c[i + 4] === 0;
        // swept up as the time runs out
        if (onGround && k / n > fade) continue;
        kit.put('confetti', c[i], c[i + 1], c[i + 2], c[i + 6], this.cCol[k], 1, 1, 1, onGround ? 0 : c[i + 6] * 1.3, onGround ? 0 : c[i + 6] * 0.7);
      }
    }
    const bq = this.bq;
    if (bq.on) {
      const t = bq.t;
      kit.put('bouquet', bq.x0 + (bq.x1 - bq.x0) * t, 1.5 + 2.2 * 4 * t * (1 - t), bq.z0 + (bq.z1 - bq.z0) * t, t * 9, 0xffffff, 1, 1, 1, t * 11);
    } else if (this.t >= 0 && this.bride.on && this.beat <= 5) {
      const m = this.bride.m;
      kit.put('bouquet', m.x + Math.sin(m.yaw) * 0.28, m.y + 1.0, m.z + Math.cos(m.yaw) * 0.28, m.yaw);
    }
    // the car's ribbons, for as long as it is around
    const V = this.car;
    if (V && !V.dead) kit.put('ribbon', V.x, V.offLane ? V.offY : 0, V.z, V.yaw, 0xffffff, 1, 1, 1, V.pitch, V.roll);
  }

  timejump(): void {
    const h = this.ctx.clock.hours;
    this.car = null;
    this.carT = 0;
    this.cN = 0;
    this.cLife = 0;
    this.bq.on = false;
    this.t = -1;
    this.ran = false;
    for (const q of this.guests) {
      q.p.m.fade = 0;
      q.p.t = 0;
      q.p.hide();
    }
    for (const p of [this.bride, this.groom, this.photographer]) {
      p.m.fade = 0;
      p.hide();
    }
    const st = this.stop;
    if (st && st.state === 3) st.release = true;
    if (h >= START + 2) this.ran = true;
  }

  stats(): Record<string, number> {
    return { weddingT: this.t < 0 ? -1 : Math.round(this.t), weddingCar: this.stop ? this.stop.state : -1 };
  }
}
