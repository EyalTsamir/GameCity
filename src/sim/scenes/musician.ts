// The street musician's audience. The busker (crowd 'serve' figure + guitar in the cart mesh, pedestrians/vendors.ts)
// plays from 11:00 to 21:30 with up to 4 listeners of the crowd. Here passers-by stop in a loose semicircle further out,
// singly and in twos; a song ends every ~50 s and they clap, someone drops a coin in the case, a few drift off and
// others join. The sound itself is in ui/audio.ts (services.scenes.musician: where, playing, applause).

import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import type { Stall } from '../pedestrians/vendors';
import type { Scene } from '../scenes';
import { Cast, Person } from './cast';
import type { Kit } from './kit';

/** two arcs round the musician (radius m, half-angle rad): beyond the crowd's own 2.3 m listeners */
const ROWS: [number, number, number][] = [
  [3.05, 1.15, 5],
  [3.95, 1.05, 6],
];
const SONG = 52;

interface Listener {
  p: Person;
  /** spot taken */
  spot: number;
  /** walking 0 off stage, 1 coming, 2 listening, 3 leaving */
  st: number;
  t: number;
  ex: number;
  ez: number;
}

export class Musician implements Scene {
  readonly name = 'musician';
  x = 0;
  z = 0;
  reach = 0;
  private stall: Stall;
  private spots: { x: number; z: number; yaw: number; free: boolean }[] = [];
  private people: Listener[] = [];
  private songT = 0;
  private clapT = 0;
  private wantN = 0;
  /** read by the audio module */
  readonly state = { x: 0, z: 0, playing: false, applause: 0, audience: 0 };

  constructor(private ctx: CityContext, cast: Cast, private rng: Rng) {
    const crowd = (ctx.services.pedestrians as { _crowd?: { places: { vendors: Stall[] } } } | undefined)?._crowd;
    const st = crowd?.places.vendors.find((v) => v.kind === 'busker');
    if (!st) throw new Error('no busker');
    this.stall = st;
    this.x = this.state.x = st.x;
    this.z = this.state.z = st.z;
    const hard = OCC.BUILDING | OCC.SOLID | OCC.ROAD | OCC.WATER | OCC.RAIL;
    const keep = ((ctx.services.props as { discs?: { x: number; z: number; r: number }[] } | undefined)?.discs ?? []).filter((d) => Math.hypot(d.x - st.x, d.z - st.z) < 8);
    for (const [r, a, n] of ROWS)
      for (let i = 0; i < n; i++) {
        const ang = st.yaw - a + (2 * a * i) / (n - 1) + rng.range(-0.05, 0.05);
        const rr = r + rng.range(-0.12, 0.12);
        const x = st.x + Math.sin(ang) * rr,
          z = st.z + Math.cos(ang) * rr;
        if (ctx.occupancy.anyInCircle(x, z, 0.3, hard)) continue;
        if (keep.some((d) => Math.hypot(d.x - x, d.z - z) < d.r + 0.35)) continue;
        // no spot on a walkway: walkers keep their way past
        this.spots.push({ x, z, yaw: Math.atan2(st.x - x, st.z - z) + rng.range(-0.12, 0.12), free: true });
      }
    const n = Math.min(9, this.spots.length);
    for (let i = 0; i < n; i++) {
      const p = cast.add({ persona: rng.pick(['tourist', 'stroller', 'student', 'shopper', 'couple', 'elderly']) }, 7301 + i);
      p.doing = 'Listening to a street musician';
      this.people.push({ p, spot: -1, st: 0, t: rng.range(0, 40), ex: 0, ez: 0 });
    }
  }

  private edgePoint(L: Listener): void {
    // they come from and go back to the walkway the stall faces
    const st = this.stall;
    const a = st.yaw + this.rng.range(-1.2, 1.2);
    L.ex = st.x + Math.sin(a) * 9.5;
    L.ez = st.z + Math.cos(a) * 9.5;
  }

  update(dt: number): void {
    const h = this.ctx.clock.hours;
    const st = this.stall;
    const playing = h >= st.open && h < st.close && this.ctx.uniforms.uRain.value < 0.4;
    this.state.playing = playing;
    // how full it is: most of a crowd at lunch and in the evening
    this.wantN = playing ? Math.round(this.people.length * (h > 12 && h < 14 ? 0.8 : h > 17 && h < 20.5 ? 1 : 0.5)) : 0;
    this.songT += dt;
    if (this.songT > SONG) {
      this.songT = 0;
      this.clapT = 3.5;
      // the song ended: applause, and the coins; some go on their way
      for (const L of this.people) {
        if (L.st !== 2) continue;
        L.p.m.waveT = 1.6 + this.rng.range(0, 0.9);
        if (this.rng.chance(0.3)) L.t = Math.min(L.t, 2 + this.rng.range(0, 3));
      }
    }
    if (this.clapT > 0) this.clapT -= dt;
    this.state.applause = this.clapT > 0 ? 1 : 0;
    let audience = 0;
    for (const L of this.people) if (L.st === 1 || L.st === 2) audience++;
    this.state.audience = audience;
    for (const L of this.people) {
      const p = L.p;
      L.t -= dt;
      switch (L.st) {
        case 0:
          if (!playing || L.t > 0 || audience >= this.wantN) break;
          {
            let sp = -1;
            const free: number[] = [];
            for (let i = 0; i < this.spots.length; i++) if (this.spots[i].free) free.push(i);
            if (free.length === 0) break;
            sp = free[this.rng.int(0, free.length - 1)];
            const S = this.spots[sp];
            S.free = false;
            L.spot = sp;
            this.edgePoint(L);
            p.show(L.ex, L.ez, Math.atan2(S.x - L.ex, S.z - L.ez));
            p.speed = this.rng.range(1.0, 1.3);
            p.walk(S.x, S.z);
            L.st = 1;
            audience++;
          }
          break;
        case 1:
          if (p.walking) break;
          p.face(this.spots[L.spot].yaw);
          p.m.forceIdle = this.rng.pick([0, 1, 2, 2, 4, 3, 6]);
          L.t = this.rng.range(35, 110);
          L.st = 2;
          break;
        case 2:
          if (L.t > 0 && playing) break;
          p.m.forceIdle = -1;
          this.edgePoint(L);
          p.speed = this.rng.range(1.1, 1.4);
          p.walk(L.ex, L.ez);
          this.spots[L.spot].free = true;
          L.st = 3;
          break;
        case 3:
          if (p.walking) break;
          p.hide();
          L.spot = -1;
          L.st = 0;
          L.t = this.rng.range(4, 26);
          break;
      }
    }
  }

  draw(_kit: Kit): void {}

  timejump(): void {
    for (const L of this.people) {
      if (L.spot >= 0) this.spots[L.spot].free = true;
      L.spot = -1;
      L.st = 0;
      L.t = this.rng.range(0, 8);
      L.p.m.fade = 0;
      L.p.m.forceIdle = -1;
      L.p.hide();
    }
  }

  stats(): Record<string, number> {
    return { audience: this.state.audience };
  }
}
