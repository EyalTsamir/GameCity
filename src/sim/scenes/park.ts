// Life on the park lawn (scripted people on the grass; the crowd keeps to the paths): kids kicking a ball about in a
// ring and a game of tag from after school hours until dusk, and two picnics: a family arrives around 11:30, shakes
// out the rug, sits and eats for a couple of hours, packs up and leaves. The dog walkers and joggers are the crowd's.

import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import type { Scene } from '../scenes';
import { Cast, Person } from './cast';
import type { Kit } from './kit';

interface Spot {
  x: number;
  z: number;
}

/** free circles on the lawn: no trees, furniture, paths or water within r (m) */
function freeSpots(ctx: CityContext, rects: { x0: number; z0: number; x1: number; z1: number }[], r: number, n: number, rng: Rng, avoid: Spot[], minD: number): Spot[] {
  const trees = (ctx.services.vegetation as { trees?: { x: number; z: number; r?: number }[] } | undefined)?.trees ?? [];
  const discs = (ctx.services.props as { discs?: { x: number; z: number; r: number }[] } | undefined)?.discs ?? [];
  const hard = OCC.BUILDING | OCC.SOLID | OCC.ROAD | OCC.WATER | OCC.RAIL | OCC.PATH | OCC.SIDEWALK | OCC.PAVED;
  // not in the thick of the wildflowers (a patch's r is its whole 8 m cell: its heart is what shows)
  const patches = (ctx.services.groundcover as { flowerPatches?: { x: number; z: number; r: number }[] } | undefined)?.flowerPatches ?? [];
  const cands: (Spot & { k: number })[] = [];
  for (const R of rects)
    for (let z = R.z0 + r; z < R.z1 - r; z += 2)
      for (let x = R.x0 + r; x < R.x1 - r; x += 2) {
        if (ctx.occupancy.anyInCircle(x, z, r, hard)) continue;
        if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < r + 0.55)) continue;
        if (discs.some((d) => Math.hypot(d.x - x, d.z - z) < r + d.r)) continue;
        if (patches.some((d) => Math.hypot(d.x - x, d.z - z) < r * 0.6 + d.r * 0.4)) continue;
        cands.push({ x, z, k: rng.next() });
      }
  cands.sort((a, b) => a.k - b.k);
  const out: Spot[] = [];
  for (const c of cands) {
    if (out.length >= n) break;
    if (avoid.some((a) => Math.hypot(a.x - c.x, a.z - c.z) < minD) || out.some((a) => Math.hypot(a.x - c.x, a.z - c.z) < minD)) continue;
    out.push({ x: c.x, z: c.z });
  }
  return out;
}

const SHIRTS = [0xd8402e, 0x2f7fd0, 0xf2c23a, 0x3fae5a, 0xe86a8a, 0xf0f0ea, 0x7a5ac8];

class BallGame {
  kids: Person[] = [];
  ring: { x: number; z: number }[] = [];
  holder = 0;
  to = 1;
  t = 0;
  /** ball */
  bx = 0;
  bz = 0;
  by = 0.11;
  /** flight progress, -1 = at a kid's feet */
  fl = -1;
  dur = 1;
  on = false;
  constructor(cast: Cast, public c: Spot, n: number, base: number, rng: Rng) {
    for (let i = 0; i < n; i++) {
      const p = cast.add({ persona: 'family', age: 'child', dress: (L) => void (L.top = SHIRTS[(base + i) % SHIRTS.length]) }, base + i);
      p.doing = 'Playing football on the grass';
      this.kids.push(p);
      const a = (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const R = rng.range(2.4, 3.1);
      this.ring.push({ x: c.x + Math.cos(a) * R, z: c.z + Math.sin(a) * R });
    }
  }
  start(): void {
    this.on = true;
    for (let i = 0; i < this.kids.length; i++) {
      const q = this.ring[i];
      this.kids[i].show(q.x, q.z, Math.atan2(this.c.x - q.x, this.c.z - q.z));
    }
    this.bx = this.ring[0].x;
    this.bz = this.ring[0].z;
    this.holder = 0;
    this.fl = -1;
    this.t = 1;
  }
  stop(): void {
    this.on = false;
    for (const k of this.kids) k.hide();
  }
  update(dt: number, rng: Rng): void {
    if (!this.on) return;
    this.t -= dt;
    const K = this.kids;
    if (this.fl < 0) {
      // the holder takes a step up to the ball, looks up and kicks it to someone
      const h = K[this.holder];
      if (this.t <= 0) {
        let to = rng.int(0, K.length - 1);
        if (to === this.holder) to = (to + 1) % K.length;
        this.to = to;
        const q = K[to].m;
        const d = Math.hypot(q.x - this.bx, q.z - this.bz);
        this.dur = Math.max(0.6, d / 5.6);
        this.fl = 0;
        h.m.waveT = 0.2;
        h.faceTo(q.x, q.z);
      } else {
        h.faceTo(K[(this.holder + 1) % K.length].m.x, K[(this.holder + 1) % K.length].m.z);
      }
    } else {
      this.fl += dt / this.dur;
      const q = K[this.to];
      // the receiver moves to meet it
      if (!q.walking && this.fl < 0.7) {
        const tx = q.m.x + (this.bx - q.m.x) * 0.25,
          tz = q.m.z + (this.bz - q.m.z) * 0.25;
        q.speed = 2.4;
        q.walk(tx, tz);
      }
      const from = K[this.holder].m;
      const f = Math.min(1, this.fl);
      this.bx = from.x + (q.m.x - from.x) * f;
      this.bz = from.z + (q.m.z - from.z) * f;
      this.by = 0.11 + 0.9 * 4 * f * (1 - f) * (this.dur > 1 ? 1 : 0.2);
      if (this.fl >= 1) {
        this.holder = this.to;
        this.fl = -1;
        this.t = rng.range(0.6, 1.9);
        this.by = 0.11;
        // and they wander back into the ring now and then
        const home = this.ring[this.to];
        q.speed = 1.2;
        q.walk(home.x, home.z);
      }
    }
    for (const k of K) if (!k.walking) k.faceTo(this.bx, this.bz);
  }
}

class Tag {
  kids: Person[] = [];
  it = 0;
  t = 0;
  on = false;
  constructor(cast: Cast, public c: Spot, public R: number, n: number, base: number) {
    for (let i = 0; i < n; i++) {
      const p = cast.add({ persona: 'family', age: 'child', dress: (L) => void (L.top = SHIRTS[(base + i * 2) % SHIRTS.length]) }, base + i);
      p.doing = 'Playing tag';
      this.kids.push(p);
    }
  }
  start(): void {
    this.on = true;
    this.kids.forEach((k, i) => {
      const a = (i / this.kids.length) * 6.28;
      k.show(this.c.x + Math.cos(a) * this.R * 0.6, this.c.z + Math.sin(a) * this.R * 0.6, a);
    });
    this.it = 0;
    this.t = 2;
  }
  stop(): void {
    this.on = false;
    for (const k of this.kids) k.hide();
  }
  update(dt: number): void {
    if (!this.on) return;
    this.t -= dt;
    const K = this.kids;
    const I = K[this.it];
    // the chaser goes for the nearest; everyone else runs from the chaser, inside the circle; a tag: freeze a moment
    let nearest = -1,
      nd = 1e9;
    for (let i = 0; i < K.length; i++) {
      if (i === this.it) continue;
      const d = Math.hypot(K[i].m.x - I.m.x, K[i].m.z - I.m.z);
      if (d < nd) {
        nd = d;
        nearest = i;
      }
    }
    if (nd < 0.7 && this.t <= 0) {
      this.it = nearest;
      this.t = 1.6;
      K[nearest].m.waveT = 0.7;
    }
    const pause = this.t > 0;
    for (let i = 0; i < K.length; i++) {
      const k = K[i];
      if (k.walking) continue;
      const m = k.m;
      if (i === this.it) {
        if (pause) continue;
        const q = K[nearest].m;
        k.speed = 3.15;
        k.walk(q.x, q.z);
      } else {
        const dx = m.x - I.m.x,
          dz = m.z - I.m.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d > 5.5 && (i * 7 + Math.floor(m.fade * 3)) % 3 !== 0 && m.speed < 0.2) {
          k.faceTo(I.m.x, I.m.z);
          continue;
        }
        // away from the chaser with a swerve, turned back at the edge of the game
        const sw = Math.sin(this.t * 1.7 + i * 2.1) * 0.9;
        let tx = m.x + (dx / d) * 2.2 + (-dz / d) * sw,
          tz = m.z + (dz / d) * 2.2 + (dx / d) * sw;
        const rc = Math.hypot(tx - this.c.x, tz - this.c.z);
        if (rc > this.R) {
          tx = this.c.x + ((tx - this.c.x) / rc) * this.R * 0.82 - (dz / d) * 1.4;
          tz = this.c.z + ((tz - this.c.z) / rc) * this.R * 0.82 + (dx / d) * 1.4;
        }
        k.speed = 2.7 + (i % 3) * 0.2;
        k.walk(tx, tz);
      }
    }
  }
}

class Picnic {
  people: Person[] = [];
  /** 0 not here, 1 walking in, 2 laying out, 3 eating, 4 packing, 5 walking off */
  st = 0;
  t = 0;
  rug = 0;
  yaw = 0;
  from: Spot;
  doneDay = -1;
  constructor(cast: Cast, public c: Spot, public arrive: number, public leave: number, base: number, rng: Rng, from: Spot) {
    this.from = from;
    this.yaw = rng.range(0, 3.14);
    const parts: { persona: 'parent' | 'family' | 'couple'; age?: 'child' }[] = [{ persona: 'parent' }, { persona: 'parent' }, { persona: 'family', age: 'child' }, { persona: 'family', age: 'child' }];
    const n = base % 2 ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const p = cast.add(parts[i], base + i);
      p.doing = 'Having a picnic';
      this.people.push(p);
    }
  }
  /** place round the rug */
  seat(i: number): { x: number; z: number; yaw: number } {
    const cy = Math.cos(this.yaw),
      sy = Math.sin(this.yaw);
    const lx = [-0.55, 0.55, -0.5, 0.55][i],
      lz = [-0.42, -0.42, 0.42, 0.42][i];
    const x = this.c.x + lx * cy + lz * sy,
      z = this.c.z - lx * sy + lz * cy;
    return { x, z, yaw: Math.atan2(this.c.x - x, this.c.z - z) };
  }
  update(dt: number, h: number, day: number, wet: boolean): void {
    this.t -= dt;
    const P = this.people;
    switch (this.st) {
      case 0:
        if (h >= this.arrive && h < this.leave - 0.4 && this.doneDay !== day && !wet) {
          P.forEach((p, i) => {
            p.show(this.from.x + i * 0.6, this.from.z + i * 0.3, 0);
            p.speed = 1.15;
            const s = this.seat(i);
            p.walk(s.x + (this.c.x - s.x) * -0.7, s.z + (this.c.z - s.z) * -0.7);
          });
          this.rug = 0;
          this.st = 1;
        }
        break;
      case 1:
        if (P.some((p) => p.walking)) break;
        // the first one shakes out the rug
        P[0].m.work = 1;
        P[0].faceTo(this.c.x, this.c.z);
        P[1].faceTo(this.c.x, this.c.z);
        this.t = 3.2;
        this.st = 2;
        break;
      case 2:
        this.rug = Math.min(1, this.rug + dt / 2.6);
        if (this.t > 0) break;
        P.forEach((p, i) => {
          p.m.work = 0;
          const s = this.seat(i);
          p.m.x = s.x;
          p.m.z = s.z;
          p.face(s.yaw);
          p.m.groundGoal = 1;
        });
        this.st = 3;
        break;
      case 3:
        if ((h >= this.leave || wet) && this.t <= 0) {
          P.forEach((p) => {
            p.m.groundGoal = 0;
            p.m.forceIdle = -1;
          });
          this.t = 2.5;
          this.st = 4;
        } else if (this.t <= 0) {
          // someone reaches for food, a child gets up for a moment? keep it simple: heads and hands
          this.t = 5;
          P[Math.floor(h * 200) % P.length].m.waveT = 0.8;
          P[Math.floor(h * 317) % P.length].m.headGoal = (h * 91) % 1 > 0.5 ? 0.5 : -0.5;
        }
        break;
      case 4:
        this.rug = Math.max(0, this.rug - dt / 2.4);
        if (this.t > 2.4 - 1) P[0].m.work = 1;
        if (this.t > 0) break;
        P[0].m.work = 0;
        P.forEach((p, i) => {
          p.speed = 1.2;
          p.walk(this.from.x + i * 0.5, this.from.z - i * 0.4);
        });
        this.st = 5;
        break;
      case 5:
        if (P.some((p) => p.walking)) break;
        P.forEach((p) => p.hide());
        this.doneDay = day;
        this.st = 0;
        break;
    }
  }
  draw(kit: Kit): void {
    if (this.st === 0 || this.rug <= 0) return;
    const y = 0.02;
    const k = this.rug * this.rug * (3 - 2 * this.rug);
    kit.put('blanket', this.c.x, y, this.c.z, this.yaw, 0xffffff, Math.max(0.02, k), 1, 0.25 + 0.75 * k);
    if (this.rug >= 1) {
      const cy = Math.cos(this.yaw),
        sy = Math.sin(this.yaw);
      kit.put('basket', this.c.x + 0.05 * cy, y, this.c.z - 0.05 * sy, this.yaw + 0.3);
      kit.put('plate', this.c.x - 0.4 * cy + 0.15 * sy, y + 0.02, this.c.z + 0.4 * sy + 0.15 * cy, 0);
      kit.put('plate', this.c.x + 0.42 * cy - 0.2 * sy, y + 0.02, this.c.z - 0.42 * sy - 0.2 * cy, 1);
    }
  }
  reset(): void {
    this.st = 0;
    this.rug = 0;
    this.doneDay = -1;
    for (const p of this.people) {
      p.m.fade = 0;
      p.m.groundGoal = 0;
      p.m.ground = 0;
      p.hide();
    }
  }
}

/** ball and tag from these hours, wetter weather sends everyone home */
const GAME_0 = 9.5,
  GAME_1 = 18.6;

export class ParkLife implements Scene {
  readonly name = 'parklife';
  x = -55;
  z = 18;
  reach = 260;
  private balls: BallGame[] = [];
  private tags: Tag[] = [];
  private picnics: Picnic[] = [];

  constructor(private ctx: CityContext, cast: Cast, private rng: Rng) {
    const lawns = ctx.plan.areas.filter((a) => a.kind === 'lawn' && a.rect.x0 < -6 && a.rect.x1 > -110 && a.rect.z0 > -10 && a.rect.z1 < 45).map((a) => a.rect);
    if (!lawns.length) throw new Error('no park lawn');
    const big = freeSpots(ctx, lawns, 3.1, 3, rng, [], 9);
    const small = freeSpots(ctx, lawns, 1.9, 3, rng, big, 8);
    if (big[0]) this.balls.push(new BallGame(cast, big[0], 5, 7401, rng));
    if (big[1]) this.tags.push(new Tag(cast, big[1], 3.3, 4, 7421));
    if (big[2]) this.balls.push(new BallGame(cast, big[2], 4, 7431, rng));
    small.forEach((s, i) => {
      // they walk in from the nearest path node
      let from = { x: s.x, z: s.z - 8 },
        bd = 1e9;
      for (const nd of ctx.peds.nodes) {
        if (nd.kind === 'door') continue;
        const d = Math.hypot(nd.x - s.x, nd.z - s.z);
        if (d < bd && d > 4) {
          bd = d;
          from = { x: nd.x, z: nd.z };
        }
      }
      this.picnics.push(new Picnic(cast, s, 11.2 + i * 0.5, 14.3 + i * 0.6, 7441 + i * 10 + (i % 2), rng, from));
    });
    const R = lawns[0];
    this.x = (R.x0 + R.x1) / 2;
    this.z = (R.z0 + R.z1) / 2;
  }

  update(dt: number): void {
    const h = this.ctx.clock.hours;
    const wet = this.ctx.uniforms.uRain.value > 0.35;
    const on = h >= GAME_0 && h < GAME_1 && !wet;
    // only one ball game all the time: the other from 15:00, tag from after lunch
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const want = on && (i === 0 || h > 15);
      if (want && !b.on) b.start();
      else if (!want && b.on) b.stop();
      b.update(dt, this.rng);
    }
    for (const t of this.tags) {
      const want = on && h > 12.5;
      if (want && !t.on) t.start();
      else if (!want && t.on) t.stop();
      t.update(dt);
    }
    for (const p of this.picnics) p.update(dt, h, this.ctx.clock.day, wet);
  }

  draw(kit: Kit): void {
    for (const b of this.balls) if (b.on) kit.put('ball', b.bx, b.by + 0.0, b.bz, 0, 0xf4f0e6);
    for (const p of this.picnics) p.draw(kit);
  }

  timejump(): void {
    for (const b of this.balls) if (b.on) b.stop();
    for (const t of this.tags) if (t.on) t.stop();
    for (const p of this.picnics) p.reset();
  }

  stats(): Record<string, number> {
    return { parkGames: this.balls.filter((b) => b.on).length + this.tags.filter((t) => t.on).length, picnics: this.picnics.filter((p) => p.st >= 1).length };
  }
}
