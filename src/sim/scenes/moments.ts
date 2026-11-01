// Street moments (close-up round, docs/progress/close-life.md): people who come out of a door near you and do some small thing
// and go back in. Someone sweeps the step, has a smoke by the door, paces with a phone at the ear, gets a breath of air and
// looks up and down the street, two neighbours talk on the pavement. Any door in the city can have one; only a few are out at a
// time, and only around the camera, so it costs nothing elsewhere (and people out are crowd figures, inside the same figure budget).
//
// Planned per near cell from the doors in it: what suits this door and how far there is room to pace. Started when a door is in
// sight and near enough to be noticed, and given a rest afterwards so that the same door does not do it again.
//
// Switch: ?nomoments (core/closeLife.ts). Arms: smalllife/gestures.ts momentPose.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { closeLife } from '../../core/closeLife';
import { DIR_VEC } from '../../core/geom';
import { nearOf, nearRandom, type NearCell } from '../../core/nearDetail';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import type { Scene } from '../scenes';
import type { SmokeService } from '../ambient/smoke';
import { broomEnds, BR, cigAt, CG, GI, G_HK, G_HY, G_HZ, G_SEED, G_T, G_WY, M_AIR, M_PHONE, M_SMOKE, M_SWEEP, M_TALK } from '../smalllife/gestures';
import { rigOf } from '../pedestrians/rig';
import { dressWork, type Cast, type Person } from './cast';
import type { Kit } from './kit';
import type { Persona } from '../pedestrians/looks';

const RADIUS = 38;
const CELL = 24;
/** out at once: a street has some of this, not all of it */
const OUT = 3;
const MIN_D = 7,
  MAX_D = 34;

interface Spot {
  x: number;
  z: number;
  /** outward from the door, and along the facade */
  nx: number;
  nz: number;
  ax: number;
  az: number;
  /** room along the facade: to the -a and +a side */
  room0: number;
  room1: number;
  office: boolean;
  /** not before this sim time */
  next: number;
  hash: number;
  busy: boolean;
}

const enum St {
  Out,
  Doing,
  Back,
}

interface Moment {
  kind: number;
  spot: Spot;
  a: Person;
  b: Person | null;
  st: St;
  t: number;
  dur: number;
  /** when the next thing happens: a turn, a look, a puff */
  next: number;
  x: number;
  z: number;
  side: number;
  smoked: number;
}

const smoothK = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const _v = new THREE.Vector3();

export class StreetMoments implements Scene {
  readonly name = 'moments';
  x = 0;
  z = 0;
  reach = 1e9;
  private spots: Spot[] = [];
  private live: Moment[] = [];
  private pool: Person[] = [];
  private byCell = new Map<number, { x: number; z: number; nx: number; nz: number; office: boolean }[]>();
  private time = 0;
  private pickT = 2;
  private started = 0;
  private on: boolean;
  /** test hook: every door does this (?momentforce=<M_*>) */
  force = +(new URLSearchParams(location.search).get('momentforce') ?? 0);

  constructor(
    private ctx: CityContext,
    private cast: Cast,
    rng: Rng,
  ) {
    this.on = closeLife(ctx, 'moments');
    if (!this.on) return;
    const personas: Persona[] = ['elderly', 'worker', 'commuter', 'parent', 'shopper', 'student', 'stroller', 'worker'];
    for (let i = 0; i < personas.length; i++) {
      const p = cast.add({ persona: personas[i], dress: personas[i] === 'worker' ? (L, r) => dressWork(L, r, i === 1) : undefined }, 7100 + i * 13 + Math.floor(rng.next() * 1000));
      this.pool.push(p);
    }
    for (const L of ctx.plan.lots) {
      for (const d of L.doors) {
        const v = DIR_VEC[d.dir];
        const k = this.key(d.x, d.z);
        let l = this.byCell.get(k);
        if (!l) this.byCell.set(k, (l = []));
        l.push({ x: d.x, z: d.z, nx: v.x, nz: v.z, office: L.kind === 'office' || L.kind === 'tower' });
      }
    }
    nearOf(ctx).addCells<Spot[]>({
      name: 'nearMoments',
      radius: RADIUS,
      cell: CELL,
      top: 5,
      make: (c) => this.plan(c),
      show: (list, on) => {
        for (const s of list) {
          if (on) this.spots.push(s);
          else this.spots.splice(this.spots.indexOf(s), 1);
        }
      },
      drop: () => {},
    });
  }

  private key(x: number, z: number): number {
    return (Math.floor(x / CELL) + 4096) * 8192 + (Math.floor(z / CELL) + 4096);
  }

  private free(x: number, z: number): boolean {
    return !this.ctx.occupancy.has(x, z, OCC.BUILDING | OCC.SOLID | OCC.WATER | OCC.RAIL | OCC.ROAD);
  }

  private plan(c: NearCell): Spot[] | null {
    const doors = this.byCell.get(this.key((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2));
    if (!doors) return null;
    const r = nearRandom(c.seed);
    const out: Spot[] = [];
    for (const d of doors) {
      const u = r(),
        hash = r();
      // not every door has this kind of life
      if (u > 0.55) continue;
      const ax = -d.nz,
        az = d.nx;
      // (1.2 m out: the walking space must be there)
      if (!this.free(d.x + d.nx * 0.6, d.z + d.nz * 0.6) || !this.free(d.x + d.nx * 1.3, d.z + d.nz * 1.3)) continue;
      let room0 = 0,
        room1 = 0;
      for (let s = 0.5; s <= 3; s += 0.5) {
        if (!this.free(d.x + d.nx * 1.1 - ax * s, d.z + d.nz * 1.1 - az * s)) break;
        room0 = s;
      }
      for (let s = 0.5; s <= 3; s += 0.5) {
        if (!this.free(d.x + d.nx * 1.1 + ax * s, d.z + d.nz * 1.1 + az * s)) break;
        room1 = s;
      }
      out.push({ x: d.x, z: d.z, nx: d.nx, nz: d.nz, ax, az, room0, room1, office: d.office, next: 0, hash, busy: false });
    }
    return out.length ? out : null;
  }

  /** what this door does at this hour, 0 = nothing */
  private kindFor(s: Spot, h: number): number {
    if (this.force) return this.force;
    const u = (s.hash * 7.13 + Math.floor(this.time / 300) * 0.37) % 1;
    const room = s.room0 + s.room1;
    if (s.office) {
      if (h < 8 || h > 22.5) return 0;
      // late: most doors are shut, someone still at work comes out for a smoke or a call
      if (h > 19.5) return u < 0.3 ? M_SMOKE : u < 0.42 && room >= 2 ? M_PHONE : 0;
      return u < 0.5 ? M_SMOKE : room >= 2 ? M_PHONE : M_AIR;
    }
    const morning = h > 6.8 && h < 11.5;
    const later = h > 15 && h < 18;
    if ((morning || later) && room >= 2 && u < 0.3) return M_SWEEP;
    if (h > 7.5 && h < 21.5 && u < 0.5) return M_TALK;
    if (h > 8 && h < 23 && u < 0.68) return M_SMOKE;
    if (h > 8 && h < 22 && room >= 2 && u < 0.84) return M_PHONE;
    if (h > 7 && h < 20.5) return M_AIR;
    return 0;
  }

  private takePerson(hash: number): Person | null {
    const n = this.pool.length;
    const i0 = Math.floor(hash * n) % n;
    for (let i = 0; i < n; i++) {
      const p = this.pool[(i0 + i) % n];
      if (!p.on && p.m.fade <= 0) return p;
    }
    return null;
  }

  private start(s: Spot, kind: number): void {
    const a = this.takePerson(s.hash);
    if (!a) return;
    a.show(s.x - s.nx * 0.1, s.z - s.nz * 0.1, Math.atan2(s.nx, s.nz));
    let b: Person | null = null;
    a.speed = 1.05;
    const side = s.room1 >= s.room0 ? 1 : -1;
    const room = side > 0 ? s.room1 : s.room0;
    const lat = Math.min(room, 0.7) * side;
    const out = kind === M_SWEEP ? 1.3 : 0.75 + 0.45 * s.hash;
    const x = s.x + s.nx * out + s.ax * lat,
      z = s.z + s.nz * out + s.az * lat;
    a.walk(x, z);
    if (kind === M_TALK) {
      b = this.takePerson(s.hash * 3.7 % 1);
      if (!b) {
        a.hide();
        return;
      }
      // the second comes out a moment later and stands facing the first
      b.show(s.x - s.nx * 0.1, s.z - s.nz * 0.1, Math.atan2(s.nx, s.nz));
      b.speed = 0.95;
      const bx = s.x + s.nx * (out + 0.95) + s.ax * (lat - 0.32 * side),
        bz = s.z + s.nz * (out + 0.95) + s.az * (lat - 0.32 * side);
      b.walk(bx, bz);
      b.a = 0.5;
      a.m.chat = b.m.chat = 1;
      // one conversation: the turns come from the first one's party
      (b.m as { party: unknown }).party = a.m.party;
      (b.m as { idx: number }).idx = 1;
      a.m.party.members.length = 1;
      a.m.party.members.push(b.m);
    }
    a.doing = kind === M_SWEEP ? 'Sweeping the step' : kind === M_SMOKE ? 'Having a smoke by the door' : kind === M_PHONE ? 'On the phone' : kind === M_TALK ? 'Talking with a neighbour' : 'Getting a breath of air';
    if (b) b.doing = a.doing;
    const r = (s.hash * 13.7 + this.time * 0.013) % 1;
    const dur = kind === M_SWEEP ? 35 + 30 * r : kind === M_SMOKE ? 45 + 40 * r : kind === M_PHONE ? 30 + 40 * r : kind === M_TALK ? 45 + 60 * r : 18 + 22 * r;
    s.busy = true;
    this.live.push({ kind, spot: s, a, b, st: St.Out, t: 0, dur, next: 2 + 3 * r, x, z, side, smoked: 0 });
    this.started++;
  }

  private finish(q: Moment): void {
    q.st = St.Back;
    const s = q.spot;
    const go = (p: Person) => {
      const m = p.m;
      m.moment = 0;
      m.forceIdle = -1;
      m.chat = 0;
      m.headGoal = 0;
      p.speed = 1.05;
      p.walk(s.x + s.nx * 0.5, s.z + s.nz * 0.5, s.x - s.nx * 0.1, s.z - s.nz * 0.1);
    };
    go(q.a);
    if (q.b) go(q.b);
  }

  /** let everything go at once (a cut, a time jump) */
  private release(q: Moment): void {
    const off = (p: Person) => {
      p.m.moment = 0;
      p.m.momentK = 0;
      p.m.forceIdle = -1;
      p.m.chat = 0;
      p.hide();
    };
    off(q.a);
    if (q.b) off(q.b);
    this.endOf(q);
  }

  private endOf(q: Moment): void {
    const s = q.spot;
    s.busy = false;
    s.next = this.time + 120 + 240 * s.hash;
    if (q.b) {
      // back to a conversation of one
      const pa = q.a.m.party;
      pa.members.length = 1;
      (q.b.m as { idx: number }).idx = 0;
      (q.b.m as { party: unknown }).party = q.b.party0;
    }
    const i = this.live.indexOf(q);
    if (i >= 0) this.live.splice(i, 1);
  }

  update(dt: number): void {
    if (!this.on) return;
    this.time += dt;
    const ctx = this.ctx;
    const cam = ctx.camera.position;
    const u = ctx.uniforms;
    const raining = (u.uRain.value as number) > 0.35;
    const low = cam.y < 30;
    for (let i = this.live.length - 1; i >= 0; i--) this.step(this.live[i], dt, cam, raining);
    this.pickT -= dt;
    if (this.pickT > 0) return;
    this.pickT = 1.2;
    if (!low || raining || this.live.length >= OUT) return;
    // a door in front of the camera, near enough to see and not so near that someone appears at your elbow
    const h = ctx.clock.hours;
    const e = ctx.camera.matrixWorld.elements;
    const fx = -e[8],
      fz = -e[10];
    let best: Spot | null = null;
    let bestV = -1e9;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (s.busy || s.next > this.time) continue;
      const dx = s.x - cam.x,
        dz = s.z - cam.z;
      const d = Math.hypot(dx, dz);
      if (d < MIN_D || d > MAX_D) continue;
      const front = (dx * fx + dz * fz) / (d || 1);
      const v = front * 12 - d * 0.25 + 10 * ((s.hash * 91.7 + this.time * 0.07) % 1);
      if (v > bestV) {
        bestV = v;
        best = s;
      }
    }
    if (!best) return;
    const kind = this.kindFor(best, h);
    if (kind) this.start(best, kind);
    else best.next = this.time + 60;
  }

  private step(q: Moment, dt: number, cam: THREE.Vector3, raining: boolean): void {
    q.t += dt;
    const m = q.a.m;
    const far = (q.x - cam.x) ** 2 + (q.z - cam.z) ** 2 > 52 * 52;
    if (far || (cam.y > 40 && q.st !== St.Back)) {
      this.release(q);
      return;
    }
    if (q.st === St.Out) {
      if (!q.a.walking && (!q.b || !q.b.walking)) {
        q.st = St.Doing;
        q.t = 0;
        this.begin(q);
      }
      return;
    }
    if (q.st === St.Back) {
      m.momentK = Math.max(0, m.momentK - dt * 2);
      if (!q.a.walking && q.a.on) q.a.hide();
      if (q.b && !q.b.walking && q.b.on) q.b.hide();
      if (!q.a.on && m.fade <= 0 && (!q.b || (!q.b.on && q.b.m.fade <= 0))) this.endOf(q);
      return;
    }
    if (m.moment) m.momentK = smoothK(m.momentK + dt * 1.6);
    if (q.t > q.dur || raining) {
      this.finish(q);
      return;
    }
    q.next -= dt;
    const s = q.spot;
    switch (q.kind) {
      case M_SWEEP:
      case M_PHONE: {
        // along the front of the house and back, stopping now and then
        if (q.a.walking) break;
        if (q.next > 0) break;
        q.side = -q.side;
        const room = q.side > 0 ? s.room1 : s.room0;
        const t = (0.3 + 0.7 * ((s.hash * 5.3 + q.t * 0.37) % 1)) * room * q.side;
        const out = q.kind === M_SWEEP ? 1.1 + 0.3 * ((q.t * 0.71) % 1) : 1 + 0.4 * ((q.t * 0.71) % 1);
        q.a.speed = q.kind === M_SWEEP ? 0.2 : 0.75;
        q.a.walk(s.x + s.nx * out + s.ax * t, s.z + s.nz * out + s.az * t);
        q.next = q.kind === M_SWEEP ? 0.5 : 2 + 5 * ((q.t * 0.53) % 1);
        break;
      }
      case M_SMOKE: {
        // a wisp from the end of it, and a breath out after each drag
        if (q.next <= 0) {
          q.next = 0.55;
          const smoke = this.ctx.services.smoke as SmokeService | undefined;
          const hk = rigOf(m.look).stature / 1.76;
          const r = rigOf(m.look);
          this.fillGI(m, r, hk);
          cigAt();
          const cy = Math.cos(m.yaw),
            sy = Math.sin(m.yaw);
          const breath = CG[3];
          if (smoke && (m.x - cam.x) ** 2 + (m.z - cam.z) ** 2 < 15 * 15) {
            _v.set(m.x + cy * CG[0] + sy * CG[2], m.y + CG[1] + 0.04, m.z - sy * CG[0] + cy * CG[2]);
            smoke.burst(_v, 1, { size: 0.012, life: 2.2, rise: 0.22, opacity: 0.16, color: '#c4c6c8' });
            if (breath > 0.5 && q.smoked < this.time) {
              q.smoked = this.time + 3;
              _v.set(m.x + sy * 0.2, m.y + 1.5 * hk, m.z + cy * 0.2);
              smoke.burst(_v, 3, { size: 0.03, life: 2.4, rise: 0.25, opacity: 0.22, color: '#d0d1d2' });
            }
          }
        }
        break;
      }
      case M_AIR: {
        // up the street, down the street, up at the sky, at whoever is about
        if (q.next <= 0) {
          q.next = 1.5 + 3.5 * ((q.t * 0.77 + s.hash) % 1);
          const v = (s.hash * 3.1 + q.t * 0.91) % 1;
          m.headGoal = v < 0.35 ? -0.95 : v < 0.7 ? 0.95 : (v - 0.85) * 1.2;
        }
        break;
      }
    }
  }

  private fillGI(m: Person['m'], r: ReturnType<typeof rigOf>, hk: number): void {
    GI[G_T] = this.ctx.uniforms.uTime.value as number;
    GI[G_SEED] = m.seed;
    GI[G_WY] = r.waist.y * r.s;
    GI[G_HY] = r.head.y * r.s;
    GI[G_HZ] = r.head.z * r.s;
    GI[G_HK] = hk;
  }

  private begin(q: Moment): void {
    const a = q.a,
      m = a.m;
    const s = q.spot;
    // back to the wall or facing the street
    const out = Math.atan2(s.nx, s.nz);
    if (q.kind === M_TALK && q.b) {
      a.faceTo(q.b.m.x, q.b.m.z);
      q.b.faceTo(m.x, m.z);
      return;
    }
    a.face(out + (s.hash - 0.5) * 1.4);
    switch (q.kind) {
      case M_SWEEP:
        m.moment = M_SWEEP;
        m.forceIdle = 0;
        q.next = 2 + 2 * s.hash;
        break;
      case M_SMOKE:
        m.moment = M_SMOKE;
        m.forceIdle = s.hash < 0.6 ? 1 : 0;
        q.next = 0.5;
        break;
      case M_PHONE:
        m.moment = M_PHONE;
        m.forceIdle = 1;
        q.next = 1 + 3 * s.hash;
        break;
      default:
        m.moment = M_AIR;
        m.forceIdle = [2, 3, 1, 4][Math.floor(s.hash * 4) % 4];
        q.next = 1;
    }
    m.momentK = 0;
  }

  draw(kit: Kit): void {
    for (let i = 0; i < this.live.length; i++) {
      const q = this.live[i];
      const m = q.a.m;
      if (m.momentK <= 0.02 || m.fade < 0.1) continue;
      if (q.kind === M_SWEEP) {
        const r = rigOf(m.look);
        this.fillGI(m, r, r.stature / 1.76);
        broomEnds();
        const cy = Math.cos(m.yaw),
          sy = Math.sin(m.yaw);
        const bx = m.x + cy * BR[0] + sy * BR[2],
          by = m.y + BR[1],
          bz = m.z - sy * BR[0] + cy * BR[2];
        const tx = m.x + cy * BR[3] + sy * BR[5],
          ty = m.y + BR[4],
          tz = m.z - sy * BR[3] + cy * BR[5];
        const dx = tx - bx,
          dy = ty - by,
          dz = tz - bz;
        const len = Math.hypot(dx, dy, dz);
        kit.put('broom', bx, by, bz, Math.atan2(dx, dz), 0xffffff, 1, len / 1.3, 1, Math.acos(dy / len));
      } else if (q.kind === M_SMOKE) {
        const r = rigOf(m.look);
        this.fillGI(m, r, r.stature / 1.76);
        cigAt();
        const cy = Math.cos(m.yaw),
          sy = Math.sin(m.yaw);
        kit.put('cig', m.x + cy * CG[0] + sy * CG[2], m.y + CG[1], m.z - sy * CG[0] + cy * CG[2], m.yaw + 1.2, 0xffffff, 1, 1, 1, 0.3 + 0.5 * CG[3]);
      }
    }
  }

  timejump(): void {
    for (let i = this.live.length - 1; i >= 0; i--) this.release(this.live[i]);
  }

  stats(): Record<string, number> {
    return { momentsOut: this.live.length, momentsStarted: this.started, momentSpots: this.spots.length };
  }
}
