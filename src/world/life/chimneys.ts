// Smoke from the town's daily life: house chimneys (heating at the cool hours, cooking at meal
// times, some cold), hotel boilers, works roof vents, bakery / kitchen flues and garden barbecues on
// summer evenings. Every source is a ctx.services.smoke emitter (one shared, lit, wind-driven puff
// pool in the ambient module); this file only decides WHEN and HOW MUCH each one smokes.
// Schedules are deterministic in (source, game day, hour), so a time jump lands in a consistent state,
// and they run whether or not the camera looks (off-screen emitters only cost a few puffs).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { hash01 } from '../../core/rng';
import type { SmokeHandle, SmokeService } from '../../sim/ambient/smoke';

interface ChimneyLike {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  lot: number;
  kind: string;
}
interface VentLike {
  x: number;
  y: number;
  z: number;
  kind: 'bakery' | 'kitchen';
  lot: number;
}
interface PointLike {
  x: number;
  y: number;
  z: number;
}

type Profile = 'heat' | 'cook' | 'cold' | 'boiler' | 'works' | 'bakery' | 'kitchen' | 'bbq';

interface Source {
  x: number;
  y: number;
  z: number;
  profile: Profile;
  /** puffs per second at full activity */
  base: number;
  seed: number;
  on: boolean;
  rate: number;
  handle: SmokeHandle | null;
}

/** smooth bump: 0 before a, ramps to 1 over [a,b], holds to c, ramps down to 0 at d (hours, may wrap past 24) */
function bump(h: number, a: number, b: number, c: number, d: number): number {
  const f = (x: number) => {
    if (x <= a || x >= d) return 0;
    if (x < b) {
      const t = (x - a) / (b - a);
      return t * t * (3 - 2 * t);
    }
    if (x <= c) return 1;
    const t = (d - x) / (d - c);
    return t * t * (3 - 2 * t);
  };
  return Math.max(f(h), f(h + 24), f(h - 24));
}

/** 0..1 how hard a source of this profile works at hour h (before the per-day dice) */
function activity(p: Profile, h: number): number {
  switch (p) {
    case 'heat':
      // fire lit for the cool morning, low through the day, built up in the evening, banked at night
      return Math.max(bump(h, 5.4, 6.8, 9.2, 11), 0.18 * bump(h, 10, 11, 15.5, 16.5), bump(h, 16, 18.2, 22.8, 24.6), 0.32 * bump(h, 0, 0.1, 4.8, 6.2));
    case 'cook':
      return Math.max(bump(h, 6.2, 6.9, 8.1, 9), bump(h, 11.6, 12.1, 13.2, 14), bump(h, 17.8, 18.5, 20.2, 21.2));
    case 'cold':
      return 0.8 * bump(h, 18, 19.5, 22, 23.5);
    case 'boiler':
      return Math.max(0.35, bump(h, 5, 6.5, 9.5, 11), bump(h, 17, 18.5, 22.5, 23.5));
    case 'works':
      return bump(h, 5.5, 6.5, 19.5, 21.5);
    case 'bakery':
      return bump(h, 3.2, 4.2, 8.5, 11.2);
    case 'kitchen':
      return Math.max(bump(h, 10.8, 11.8, 13.8, 14.8), bump(h, 17.6, 18.6, 21.8, 23));
    case 'bbq':
      return 0; // per-evening events, see below
  }
}

/** does this source smoke at all on game day `day`? (per-day dice so the town differs day to day) */
function lit(s: Source, day: number): boolean {
  const r = hash01(Math.floor(s.seed * 1e6), day, 17);
  switch (s.profile) {
    case 'heat':
      return r < 0.85;
    case 'cook':
      return r < 0.7;
    case 'cold':
      return r < 0.14;
    case 'kitchen':
    case 'bakery':
    case 'boiler':
      return true;
    case 'works':
      return r < 0.9;
    case 'bbq':
      return r < 0.5;
  }
}

/** an evening barbecue: lit at 17.4–19.6 h for 1.4–3 h (plus a rare lunchtime grill) */
function bbqActivity(s: Source, day: number, h: number): number {
  const r1 = hash01(Math.floor(s.seed * 1e6), day, 29),
    r2 = hash01(Math.floor(s.seed * 1e6), day, 31);
  const start = 17.4 + r1 * 2.2,
    end = start + 1.4 + r2 * 1.6;
  // the first minutes smoke hard (lighting the charcoal), then a steady thin smoke
  const ev = bump(h, start, start + 0.15, end - 0.3, end) * (1 + 1.4 * bump(h, start, start + 0.05, start + 0.35, start + 0.6));
  const lunch = r2 < 0.12 ? bump(h, 12, 12.2, 13.4, 13.8) : 0;
  return Math.max(ev, lunch);
}

export interface ChimneySmoke {
  update(dt: number): void;
  stats(): Record<string, number>;
}

export function createChimneySmoke(ctx: CityContext, chimneys: readonly ChimneyLike[], vents: readonly VentLike[], bbqs: readonly PointLike[]): ChimneySmoke | null {
  const smoke = ctx.services.smoke as SmokeService | undefined;
  if (!smoke) return null;
  const sources: Source[] = [];
  const add = (x: number, y: number, z: number, profile: Profile, base: number, seed: number) => sources.push({ x, y, z, profile, base, seed, on: false, rate: 0, handle: null });

  for (const c of chimneys) {
    const seed = hash01(Math.round(c.x * 10), Math.round(c.z * 10), c.lot);
    let p: Profile;
    if (c.kind === 'hotel') p = 'boiler';
    else if (c.kind === 'factory' || c.kind === 'warehouse' || c.kind === 'depot') p = 'works';
    else p = seed < 0.42 ? 'heat' : seed < 0.68 ? 'cook' : 'cold';
    const big = Math.max(c.w, c.d) > 0.9;
    add(c.x, c.y + 0.05, c.z, p, p === 'works' ? 2.8 : p === 'boiler' ? 2.8 : big ? 4.0 : 3.4, seed);
  }
  for (const v of vents) add(v.x, v.y + 0.05, v.z, v.kind, v.kind === 'bakery' ? 2.6 : 2.0, hash01(Math.round(v.x * 10), Math.round(v.z * 10), 77));
  for (const b of bbqs) add(b.x, b.y + 0.05, b.z, 'bbq', 3.2, hash01(Math.round(b.x * 10), Math.round(b.z * 10), 91));

  const style = (s: Source) => {
    const k = s.seed;
    switch (s.profile) {
      case 'heat':
      case 'cook':
      case 'cold': {
        // pale blue-grey wood smoke; a few coal / damp-wood fires are greyer and denser
        const coal = hash01(Math.floor(k * 1e6), 5) < 0.15;
        const col = new THREE.Color(coal ? '#a7a5a1' : '#c4c9d0').offsetHSL(0, 0, (k - 0.5) * 0.06);
        return { size: 0.3 + 0.1 * k, life: 11 + 4 * k, rise: 1.0 + 0.4 * k, color: col, opacity: coal ? 1.1 : 0.9, glow: 0.25 };
      }
      case 'boiler':
        return { size: 0.45, life: 9, rise: 1.8, color: new THREE.Color('#ecebe8'), opacity: 0.8, glow: 0.3 };
      case 'works':
        return { size: 0.5, life: 10, rise: 2.0, color: new THREE.Color('#e6e4e0'), opacity: 0.6, glow: 0.4 };
      case 'bakery':
        return { size: 0.3, life: 6.5, rise: 1.7, color: new THREE.Color('#e4e2de'), opacity: 0.75, glow: 0.3 };
      case 'kitchen':
        return { size: 0.28, life: 5.5, rise: 1.6, color: new THREE.Color('#dcd9d2'), opacity: 0.7, glow: 0.3 };
      case 'bbq':
        return { size: 0.22, life: 7, rise: 0.9, color: new THREE.Color('#cfd2d6'), opacity: 0.75, glow: 0.7 };
    }
  };

  for (const s of sources) {
    const st = style(s);
    s.handle = smoke.addEmitter({
      getPosition: (o) => {
        if (!s.on) return false;
        o.set(s.x, s.y, s.z);
      },
      rate: 0,
      ...st,
    });
  }

  let tick = 0;
  let active = 0;
  const evaluate = () => {
    const h = ctx.clock.hours;
    const day = ctx.clock.day;
    const t = ctx.clock.simTime;
    active = 0;
    for (const s of sources) {
      // the "day" of a night fire is the evening it was lit
      const d = h < 6 ? day - 1 : day;
      let a = s.profile === 'bbq' ? bbqActivity(s, d, h) : lit(s, d) ? activity(s.profile, h) : 0;
      // slow per-source swells (stoked, damped, a door opened…)
      a *= 0.65 + 0.35 * Math.sin(t * (0.011 + 0.02 * s.seed) + s.seed * 40);
      const on = a > 0.06;
      const rate = on ? s.base * (0.3 + 0.7 * a) : 0;
      if (on !== s.on || Math.abs(rate - s.rate) > 0.05) {
        s.on = on;
        s.rate = rate;
        s.handle?.set({ rate });
      }
      if (on) active++;
    }
  };
  evaluate();
  ctx.events.on('timejump', evaluate);

  return {
    update(dt) {
      tick -= dt;
      if (tick > 0) return;
      tick = 0.5;
      evaluate();
    },
    stats() {
      let ch = 0,
        bb = 0,
        vt = 0;
      for (const s of sources) {
        if (!s.on) continue;
        if (s.profile === 'bbq') bb++;
        else if (s.profile === 'bakery' || s.profile === 'kitchen') vt++;
        else ch++;
      }
      return { smokeSources: sources.length, smokingChimneys: ch, smokingVents: vt, bbqsLit: bb, smokeActive: active };
    },
  };
}
