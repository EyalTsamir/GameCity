// The people of the scenes. Real crowd figures (Member) drawn as extras of the crowd renderer (no draw calls of their
// own; pedestrians.ts appends them with actors and riders), but scripted: a Person walks a list of points, faces where
// it is told, works, waves, sits on the ground. The crowd's walkers see them as obstacles (Crowd.extraObs), so a walker
// goes round a wedding guest or a trolley as round anyone else. Pooled: nobody is allocated while the city runs.

import * as THREE from 'three';
import type { CityContext, PickHit } from '../../core/context';
import { Rng } from '../../core/rng';
import { Member, Party } from '../pedestrians/crowd';
import { makeLook, type Look, type Persona } from '../pedestrians/looks';
import { gaitCycleOf, GC } from '../pedestrians/rig';
import { F } from '../pedestrians/figure';
import { HAT_STYLES } from '../pedestrians/shader';

const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** cull distance (m): as actors.ts */
const FAR = 170;

export class Person {
  readonly m: Member;
  /** the party it was made with (a scene may lend it to another's) */
  readonly party0: Party;
  on = false;
  /** walking: flat array x, z of the points still to reach */
  route: number[] = [];
  ri = 0;
  speed = 1.3;
  /** fixed floor height when set (balconies, cradle); else the ground */
  floorY: number | null = null;
  /** what the info card says */
  doing = '';
  /** free for the scene's script */
  t = 0;
  phase = 0;
  a = 0;
  b = 0;

  constructor(m: Member) {
    this.m = m;
    this.party0 = m.party;
  }

  get walking(): boolean {
    return this.ri < this.route.length;
  }

  /** appear at (x, z), facing yaw (fades in) */
  show(x: number, z: number, yaw: number, y: number | null = null, snap = false): this {
    const m = this.m;
    this.on = true;
    this.floorY = y;
    m.x = m.px = x;
    m.z = m.pz = z;
    m.yaw = m.faceYaw = yaw;
    m.faceHold = true;
    m.y = y ?? 0;
    this.route.length = 0;
    this.ri = 0;
    m.fade = snap ? 1 : Math.max(0, m.fade);
    m.present = true;
    m.vx = m.vz = m.speed = m.amp = 0;
    m.sit = m.ground = m.lie = 0;
    m.sitGoal = m.groundGoal = m.lieGoal = 0;
    m.work = 0;
    m.forceIdle = -1;
    m.moment = 0;
    m.momentK = 0;
    m.carry = 0;
    m.waveT = 0;
    m.headGoal = 0;
    return this;
  }

  hide(): void {
    this.on = false;
  }

  walk(...pts: number[]): this {
    this.route.length = 0;
    for (let i = 0; i < pts.length; i++) this.route.push(pts[i]);
    this.ri = 0;
    this.m.work = 0;
    return this;
  }

  face(yaw: number): this {
    this.m.faceYaw = yaw;
    return this;
  }

  faceTo(x: number, z: number): this {
    this.m.faceYaw = Math.atan2(x - this.m.x, z - this.m.z);
    return this;
  }
}

export interface PersonSpec {
  persona: Persona;
  kind?: 'man' | 'woman' | 'boy' | 'girl';
  age?: 'adult' | 'elderly' | 'teen' | 'child';
  dress?: (L: Look, rng: Rng) => void;
}

/** both hands forward on a bar or a crate: the pram pose, without the pram */
export const PUSHING = { fabric: -1 };

export class Cast {
  readonly people: Person[] = [];
  private next = 980000;
  private obs = new Float64Array(5 * 96);
  /** discs other than people (a van's flank, a trolley): set by the scenes every update */
  private nFixed = 0;
  private _ground: (x: number, z: number) => number;

  constructor(private ctx: CityContext) {
    const t = ctx.services.terrain as { height?(x: number, z: number): number } | undefined;
    this._ground = (x, z) => t?.height?.(x, z) ?? ctx.plan.heightAt(x, z);
    const crowd = (ctx.services.pedestrians as { _crowd?: { extraObs: Float64Array; nExtraObs: number } } | undefined)?._crowd;
    if (crowd) crowd.extraObs = this.obs;
  }

  ground(x: number, z: number): number {
    return this._ground(x, z);
  }

  /** make a figure (scene build time) */
  add(spec: PersonSpec, seed: number): Person {
    const rng = new Rng(seed * 131 + 11);
    const look = makeLook(rng, { persona: spec.persona, kind: spec.kind, age: spec.age, warm: true });
    look.dog = null;
    look.pram = null;
    look.umbrellaOwner = false;
    look.flags &= ~(F.ROD | F.BRIEFCASE | F.CANE | F.SHOPBAG);
    spec.dress?.(look, rng);
    const p = new Party(-4000 - this.people.length, spec.persona);
    const m = new Member(this.next++, p, 0, look, rng.next());
    p.members.push(m);
    const P = new Person(m);
    this.people.push(P);
    return P;
  }

  /** a disc the crowd walks round this update (call between beginObs and step) */
  obstacle(x: number, z: number, r: number, vx = 0, vz = 0): void {
    const k = this.nFixed;
    if (k >= 96) return;
    const o = this.obs;
    o[k * 5] = x;
    o[k * 5 + 1] = z;
    o[k * 5 + 2] = vx;
    o[k * 5 + 3] = vz;
    o[k * 5 + 4] = r;
    this.nFixed = k + 1;
  }

  beginObs(): void {
    this.nFixed = 0;
  }

  /** move everyone on stage (sim step) */
  step(dt: number): void {
    if (dt <= 0) return;
    const P = this.people;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.on || p.m.fade > 0) this.stepOne(p, dt);
      const m = p.m;
      if (m.fade > 0.2 && !(p.floorY !== null && p.floorY > 1)) this.obstacle(m.x, m.z, 0.24, m.vx, m.vz);
    }
    const crowd = (this.ctx.services.pedestrians as { _crowd?: { nExtraObs: number } } | undefined)?._crowd;
    if (crowd) crowd.nExtraObs = this.nFixed;
  }

  private stepOne(p: Person, h: number): void {
    const m = p.m;
    m.fade = p.on ? Math.min(1, m.fade + h / 0.7) : Math.max(0, m.fade - h / 0.7);
    m.present = m.fade > 0;
    if (!m.present) return;
    const x0 = m.x,
      z0 = m.z;
    let budget = p.speed * h;
    let ux = 0,
      uz = 0;
    while (budget > 0 && p.ri < p.route.length) {
      const dx = p.route[p.ri] - m.x,
        dz = p.route[p.ri + 1] - m.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-3) {
        p.ri += 2;
        continue;
      }
      ux = dx / d;
      uz = dz / d;
      const s = Math.min(budget, d);
      m.x += ux * s;
      m.z += uz * s;
      budget -= s;
      if (s >= d - 1e-6) p.ri += 2;
    }
    const dx = m.x - x0,
      dz = m.z - z0;
    const d = Math.hypot(dx, dz);
    m.px = x0;
    m.pz = z0;
    const gy = p.floorY ?? this._ground(m.x, m.z);
    m.y += (gy - m.y) * Math.min(1, h * 14);
    if (Math.abs(gy - m.y) > 0.4) m.y = gy;
    const k = Math.min(1, h * 8);
    m.vx += (dx / h - m.vx) * k;
    m.vz += (dz / h - m.vz) * k;
    m.speed = Math.hypot(m.vx, m.vz);
    if (d > 1e-4) {
      gaitCycleOf(m);
      m.phase += (d / GC.cycle) * Math.PI * 2;
    }
    if (d > 0.002) m.yaw += angleDiff(m.yaw, Math.atan2(dx, dz)) * Math.min(1, h * 9);
    else m.yaw += angleDiff(m.yaw, m.faceYaw) * Math.min(1, h * 4);
    // pose blends and the gait amplitude: as Crowd.animate
    let ampT = 0;
    if (m.speed > 0.05) ampT = m.speed > 2.1 ? 1 + Math.min(0.8, (m.speed - 2.1) / 1.0) : Math.min(1, m.speed / 1.25);
    if (m.sit > 0.05 || m.lie > 0.05 || m.ground > 0.05) ampT = 0;
    m.amp += (ampT - m.amp) * Math.min(1, h * 6);
    const rate = h * 1.25;
    m.sit += Math.max(-rate, Math.min(rate, m.sitGoal - m.sit));
    m.ground += Math.max(-rate * 1.4, Math.min(rate * 1.4, m.groundGoal - m.ground));
    m.lie += Math.max(-rate, Math.min(rate, m.lieGoal - m.lie));
    if (m.waveT > 0) {
      m.waveT -= h;
      m.wave = Math.min(1, m.wave + h * 4);
    } else m.wave = Math.max(0, m.wave - h * 3);
    m.headYaw += (m.headGoal - m.headYaw) * Math.min(1, h * 3);
  }

  /** per frame: append everyone visible to the crowd renderer's extra list; returns the new count */
  sync(list: Member[], n: number): number {
    const cam = this.ctx.camera.position;
    const far2 = FAR * FAR;
    const P = this.people;
    for (let i = 0; i < P.length; i++) {
      const m = P[i].m;
      if (m.fade <= 0.01 || !m.present) continue;
      if ((m.x - cam.x) ** 2 + (m.z - cam.z) ** 2 > far2) continue;
      list[n++] = m;
    }
    return n;
  }

  count(): number {
    let n = 0;
    for (let i = 0; i < this.people.length; i++) if (this.people[i].on) n++;
    return n;
  }

  pick(ray: THREE.Ray): PickHit | null {
    let best: Person | null = null;
    let bestT = Infinity;
    const c = new THREE.Vector3();
    for (const p of this.people) {
      const m = p.m;
      if (!p.on || m.fade < 0.3) continue;
      const sc = m.look.scale;
      c.set(m.x, m.y + (m.ground > 0.5 ? 0.4 : 0.9 * sc), m.z);
      const rad = 0.55 * sc + 0.15;
      const oc = c.sub(ray.origin);
      const tca = oc.dot(ray.direction);
      if (tca < 0) continue;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 > rad * rad) continue;
      const t = tca - Math.sqrt(rad * rad - d2);
      if (t < bestT) {
        bestT = t;
        best = p;
      }
    }
    if (!best) return null;
    const p = best;
    return {
      kind: 'pedestrian',
      id: p.m.uid,
      distance: bestT,
      label: `${p.m.look.name}, ${p.m.look.age}`,
      getPosition(out) {
        if (!p.on) return false;
        out.set(p.m.x, p.m.y + 0.9, p.m.z);
        return true;
      },
      getHeading: () => p.m.yaw,
      info: () => [p.doing],
    };
  }
}

/** dress helpers shared by the scenes */
export function dressWork(L: Look, rng: Rng, apron = false): void {
  L.flags &= F.HAIR | F.LONGHAIR | F.BUN | F.BEARD | F.SHORTSLEEVE;
  L.bottom = rng.pick([0x2b3a55, 0x3a3a33, 0x26272b, 0x4a4032]);
  const st = L.style;
  if (st) {
    st.tail = apron ? 1 : 0;
    if (apron) {
      st.tailHem = 0.42;
      st.tailFlare = 0.03;
    }
    st.hat = rng.chance(0.5) ? HAT_STYLES.CAP : HAT_STYLES.NONE;
    if (st.hat) L.hat = rng.pick([0x2b3a55, 0x3a5a3a, 0x6a2e2a]);
    st.vest = false;
    st.tie = false;
    st.lapels = false;
    st.jacketHem = -1;
    st.legwear = 0;
    st.trouserEnd = 0.08;
    st.trouserFit = 0.8;
  }
}
