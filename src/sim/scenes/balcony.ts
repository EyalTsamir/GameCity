// Life on the facades. Balconies: someone comes out to hang the washing in the morning and takes it in at dusk (the
// cloth pieces appear and go by the same hours: world/life/decor.ts laundryWindow), waters the plants morning and evening,
// or leans on the rail with a cup. Only the balconies near the camera get a person: a small pool walks from one to the
// next. And a window cleaner's cradle working down an office front, floor by floor, with two people wiping the glass.

import type { CityContext } from '../../core/context';
import type { Rng } from '../../core/rng';
import { laundryWindow } from '../../world/life/decor';
import type { Scene } from '../scenes';
import { Cast, dressWork, Person } from './cast';
import type { Kit } from './kit';

interface Balcony {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  w: number;
  d: number;
  rail: number;
  lot: number;
}
interface LaundryAnchor {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  lot: number;
}

/** a person's reason to come out, by balcony */
const enum Act {
  LAUNDRY_OUT,
  LAUNDRY_IN,
  WATER,
  LEAN,
}

interface Actor {
  p: Person;
  bal: Balcony | null;
  act: Act;
  t: number;
  /** can in hand */
  can: boolean;
  /** along the balcony when hanging washing */
  from: number;
  to: number;
  a: number;
}

const POOL = 7;
const CAM_R = 70;

export class BalconyLife implements Scene {
  readonly name = 'balcony';
  x = 0;
  z = 0;
  reach = 3000;
  private bals: Balcony[] = [];
  /** balconies with a washing line, with the washing's hours */
  private lines: { b: Balcony; out: number; in: number }[] = [];
  private busy = new Set<Balcony>();
  private actors: Actor[] = [];
  private cursor = 0;
  private nextT = 0;
  // the window cleaners
  private cradle: { x0: number; x1: number; z0: number; z1: number; nx: number; nz: number; top: number; yaw: number; col: number; y: number; ph: number; t: number; roofY: number; a: Person; b: Person } | null = null;

  constructor(private ctx: CityContext, cast: Cast, private rng: Rng) {
    const svc = ctx.services.buildings as { balconies?: Balcony[]; laundry?: LaundryAnchor[] } | undefined;
    this.bals = (svc?.balconies ?? []).filter((b: Balcony & { kind?: string }) => b.kind !== 'terrace' && b.d > 0.7);
    for (const l of svc?.laundry ?? []) {
      const mx = (l.ax + l.bx) / 2,
        mz = (l.az + l.bz) / 2;
      let best: Balcony | null = null,
        bd = 3;
      for (const b of this.bals) {
        if (b.lot !== l.lot || Math.abs(b.y + 1.5 - l.ay) > 2.2) continue;
        const d = Math.hypot(b.x - mx, b.z - mz);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (best) {
        const win = laundryWindow(l.lot, l.ax, l.az);
        this.lines.push({ b: best, out: win.out, in: win.in });
      }
    }
    for (let i = 0; i < POOL; i++) {
      const p = cast.add({ persona: i % 3 === 0 ? 'elderly' : i % 3 === 1 ? 'parent' : 'shopper' }, 7501 + i);
      this.actors.push({ p, bal: null, act: Act.LEAN, t: 0, can: false, from: 0, to: 0, a: 0 });
    }
    this.buildCradle(cast);
  }

  private buildCradle(cast: Cast): void {
    // a mid-rise office or apartment block with a plain front facing a street
    const lots = this.ctx.plan.lots.filter((l) => (l.kind === 'office' || l.kind === 'apartment') && l.height > 16 && l.height < 60);
    lots.sort((a, b) => b.height - a.height);
    const lot = lots[0];
    if (!lot) return;
    const f = lot.footprint;
    const dir = lot.front;
    const nx = dir === 'E' ? 1 : dir === 'W' ? -1 : 0,
      nz = dir === 'S' ? 1 : dir === 'N' ? -1 : 0;
    const x0 = nx === 0 ? f.x0 + 2.5 : nx > 0 ? f.x1 : f.x0,
      x1 = nx === 0 ? f.x1 - 2.5 : x0;
    const z0 = nz === 0 ? f.z0 + 2.5 : nz > 0 ? f.z1 : f.z0,
      z1 = nz === 0 ? f.z1 - 2.5 : z0;
    const a = cast.add({ persona: 'worker', dress: (L, r) => dressWork(L, r) }, 7521);
    const b = cast.add({ persona: 'worker', dress: (L, r) => dressWork(L, r) }, 7522);
    a.doing = b.doing = `Cleaning the windows of ${lot.name || 'the block'}`;
    this.cradle = { x0, x1, z0, z1, nx, nz, top: lot.height - 2.2, yaw: Math.atan2(nx, nz), col: 0, y: lot.height - 2.2, ph: 0, t: 0, roofY: lot.height, a, b };
  }

  private start(A: Actor, b: Balcony, act: Act): void {
    A.bal = b;
    A.act = act;
    this.busy.add(b);
    const fx = b.nx,
      fz = b.nz;
    const tx = -fz,
      tz = fx;
    // out of the balcony door (at the facade), to the rail
    const x = b.x - fx * (b.d / 2 - 0.2) + tx * this.rng.range(-0.3, 0.3),
      z = b.z - fz * (b.d / 2 - 0.2) + tz * this.rng.range(-0.3, 0.3);
    A.p.show(x, z, Math.atan2(fx, fz), b.y);
    A.p.speed = 0.7;
    const lat = this.rng.range(-0.55, 0.55) * Math.max(0.3, b.w / 2 - 0.5);
    A.p.walk(b.x + fx * (b.d / 2 - 0.42) + tx * lat, b.z + fz * (b.d / 2 - 0.42) + tz * lat);
    A.p.face(Math.atan2(fx, fz));
    A.can = act === Act.WATER;
    A.t = act === Act.LEAN ? this.rng.range(18, 40) : act === Act.WATER ? this.rng.range(11, 17) : this.rng.range(8, 13);
    A.from = -Math.max(0.3, b.w / 2 - 0.45);
    A.to = -A.from;
    A.p.doing = act === Act.WATER ? 'Watering the balcony plants' : act === Act.LEAN ? 'Out on the balcony with a coffee' : act === Act.LAUNDRY_OUT ? 'Hanging out the washing' : 'Taking in the washing';
  }

  private stepActor(A: Actor, dt: number): void {
    const b = A.bal;
    if (!b) return;
    const p = A.p;
    if (!p.walking) {
      const tx = -b.nz,
        tz = b.nx;
      if (A.act === Act.WATER) p.m.work = 2;
      else if (A.act === Act.LEAN) p.m.forceIdle = 6;
      else {
        // along the line, hands up to it
        p.m.work = 2;
        A.a += dt;
        const u = Math.sin(A.a * 0.5);
        const fx = b.nx,
          fz = b.nz;
        const lat = u * A.to;
        p.m.x = b.x + fx * (b.d / 2 - 0.42) + tx * lat;
        p.m.z = b.z + fz * (b.d / 2 - 0.42) + tz * lat;
      }
    }
    A.t -= dt;
    if (A.t <= 0) {
      p.m.work = 0;
      p.m.forceIdle = -1;
      p.hide();
      this.busy.delete(b);
      A.bal = null;
      A.a = 0;
      A.can = false;
    }
  }

  update(dt: number): void {
    const h = this.ctx.clock.hours;
    for (const A of this.actors) this.stepActor(A, dt);
    this.nextT -= dt;
    if (this.nextT <= 0) {
      this.nextT = 1.2;
      const free = this.actors.find((A) => A.bal === null);
      if (free) this.pick(free, h);
    }
    this.stepCradle(dt, h);
  }

  /** a balcony near the camera that wants someone now */
  private pick(A: Actor, h: number): void {
    const cam = this.ctx.camera.position;
    const near = (b: Balcony) => (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 < CAM_R * CAM_R && !this.busy.has(b);
    for (const l of this.lines) {
      if (!near(l.b)) continue;
      if (h >= l.out && h < l.out + 0.4) return this.start(A, l.b, Act.LAUNDRY_OUT);
      if (h >= l.in && h < l.in + 0.4) return this.start(A, l.b, Act.LAUNDRY_IN);
    }
    const watering = (h > 7.2 && h < 9.3) || (h > 17.8 && h < 19.8);
    const lean = (h > 8 && h < 21.5 && this.rng.chance(0.3)) || (h > 17.5 && h < 21.5);
    if (!watering && !lean) return;
    const n = this.bals.length;
    for (let k = 0; k < 24 && n > 0; k++) {
      const b = this.bals[(this.cursor = (this.cursor + 37) % n)];
      if (!near(b) || b.y > 22) continue;
      return this.start(A, b, watering && this.rng.chance(0.7) ? Act.WATER : Act.LEAN);
    }
  }

  private stepCradle(dt: number, h: number): void {
    const c = this.cradle;
    if (!c) return;
    const work = h >= 8.6 && h < 16.6 && this.ctx.uniforms.uRain.value < 0.3;
    const a = c.a,
      b = c.b;
    if (!work) {
      if (a.on) {
        a.hide();
        b.hide();
      }
      return;
    }
    const NC = 5;
    const t = (c.col + 0.5) / NC;
    const x = c.x0 + (c.x1 - c.x0) * t,
      z = c.z0 + (c.z1 - c.z0) * t;
    if (!a.on) {
      a.show(x, z, c.yaw + Math.PI, c.y, true);
      b.show(x, z, c.yaw + Math.PI, c.y, true);
      a.m.work = b.m.work = 2;
    }
    // down a floor, wipe a while, down again; at the bottom hauled back up, one bay along
    c.t -= dt;
    if (c.ph === 0) {
      c.y -= dt * 0.55;
      if (c.t <= -5.5) {
        c.ph = 1;
        c.t = 7;
      }
      if (c.y < 2.4) {
        c.ph = 2;
      }
    } else if (c.ph === 1) {
      if (c.t <= 0) {
        c.ph = 0;
        c.t = 0;
      }
    } else {
      c.y += dt * 1.7;
      if (c.y >= c.top) {
        c.y = c.top;
        c.col = (c.col + 1) % NC;
        c.ph = 1;
        c.t = 5;
      }
    }
    const wob = c.ph === 1 ? Math.sin(h * 900) * 0.22 : 0;
    const off = 0.85;
    const tx = -c.nz,
      tz = c.nx;
    a.floorY = b.floorY = c.y;
    a.m.x = x + c.nx * off + tx * (-0.6 + wob);
    a.m.z = z + c.nz * off + tz * (-0.6 + wob);
    b.m.x = x + c.nx * off + tx * (0.55 - wob);
    b.m.z = z + c.nz * off + tz * (0.55 - wob);
  }

  draw(kit: Kit): void {
    const cam = this.ctx.camera.position;
    for (const A of this.actors) {
      if (!A.bal || !A.can) continue;
      const m = A.p.m;
      kit.put('can', m.x + Math.sin(m.yaw) * 0.25, m.y + 0.72, m.z + Math.cos(m.yaw) * 0.25, m.yaw, 0xffffff, 1, 1, 1, 0.5);
    }
    const c = this.cradle;
    if (c && c.a.on && (c.x0 - cam.x) ** 2 + (c.z0 - cam.z) ** 2 < 300 * 300) {
      const t = (c.col + 0.5) / 5;
      const x = c.x0 + (c.x1 - c.x0) * t + c.nx * 0.8,
        z = c.z0 + (c.z1 - c.z0) * t + c.nz * 0.8;
      kit.put('cradle', x, c.y, z, c.yaw + Math.PI);
      const tx = -c.nz,
        tz = c.nx;
      const L = c.roofY + 0.5 - c.y;
      for (const s of [-1.3, 1.3]) {
        kit.put('cable', x + tx * s - c.nx * 0.45, c.y + 0.3, z + tz * s - c.nz * 0.45, 0, 0xffffff, 1, L, 1);
        // the outrigger on the roof
      }
      kit.put('squeegee', c.a.m.x - c.nx * 0.3, c.y + 1.0, c.a.m.z - c.nz * 0.3, 0, 0xffffff, 1, 1, 1, 0, Math.sin(this.ctx.uniforms.uTime.value * 1.8) * 0.5);
      kit.put('squeegee', c.b.m.x - c.nx * 0.3, c.y + 1.0, c.b.m.z - c.nz * 0.3, 0, 0xffffff, 1, 1, 1, 0, -Math.sin(this.ctx.uniforms.uTime.value * 2.1) * 0.5);
    }
  }

  timejump(): void {
    for (const A of this.actors) {
      if (A.bal) this.busy.delete(A.bal);
      A.bal = null;
      A.can = false;
      A.p.m.fade = 0;
      A.p.m.work = 0;
      A.p.m.forceIdle = -1;
      A.p.hide();
    }
    const c = this.cradle;
    if (c) {
      const h = this.ctx.clock.hours;
      c.a.m.fade = c.b.m.fade = 0;
      c.a.hide();
      c.b.hide();
      // where it has got to by this hour
      const prog = Math.max(0, Math.min(1, (h - 8.6) / 8));
      c.col = Math.floor(prog * 5) % 5;
      c.y = c.top - (c.top - 2.4) * ((prog * 5) % 1);
      c.ph = 0;
      c.t = 0;
    }
  }

  stats(): Record<string, number> {
    let n = 0;
    for (const A of this.actors) if (A.bal) n++;
    return { balconyPeople: n, cradleY: this.cradle ? Math.round(this.cradle.y) : -1 };
  }
}
