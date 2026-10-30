// Module "scenes": small stories with a beginning, a middle and an end, all running by themselves on the day clock
// (docs/progress/living-scenes.md): the market's morning and evening, delivery stops, a wedding at St. Mary's, the
// street musician's audience, games and picnics in the park, people on the balconies and a window cleaner.
//
// Data first: every scene plans its places from plan / pedNetwork / occupancy at build time. People are crowd figures
// (scenes/cast.ts), props one instanced mesh per kind drawn only while out (scenes/kit.ts), vehicles real traffic
// vehicles that leave their lane at a kerb stop (traffic/sim.ts KerbStop). A scene that throws is switched off.
//
// One game hour = 40 s at 1× : scenes are scheduled in hours and timed in sim seconds.
//
// URL switches: ?noscenes (all), ?nomarketday, ?nodelivery, ?nowedding, ?nomusician, ?noparklife, ?nobalconylife.
// Quality: low runs only the market (tarps + van, no crates) and deliveries.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { Cast } from './scenes/cast';
import { Kit } from './scenes/kit';
import { MarketDay } from './scenes/market';
import { Deliveries } from './scenes/delivery';
import { Wedding } from './scenes/wedding';
import { Musician } from './scenes/musician';
import { ParkLife } from './scenes/park';
import { BalconyLife } from './scenes/balcony';

export interface Scene {
  readonly name: string;
  update(dt: number): void;
  /** write this frame's props (only called while the camera is near enough to see them) */
  draw(kit: Kit): void;
  /** where the props are (draw() is skipped beyond `reach` metres) */
  x: number;
  z: number;
  reach: number;
  timejump?(): void;
  stats?(): Record<string, number>;
  invariants?(): string[];
}

export default function create(ctx: CityContext): CityModule {
  const params = ctx.debug.params;
  const empty: CityModule = { name: 'scenes' };
  if (params.has('noscenes')) return empty;
  const low = ctx.quality.level === 'low';
  const problems: string[] = [];
  const cast = new Cast(ctx);
  const kit = new Kit(ctx.quality.shadows);
  ctx.scene.add(kit.group);

  const scenes: Scene[] = [];
  const build = (toggle: string, onLow: boolean, make: () => Scene) => {
    if (params.has(toggle) || (low && !onLow)) return;
    try {
      scenes.push(make());
    } catch (err) {
      problems.push(`scenes: ${toggle} failed to build (${err instanceof Error ? err.message : String(err)})`);
      console.error('[scenes] build failed', toggle, err);
    }
  };
  build('nomarketday', true, () => new MarketDay(ctx, cast, low));
  build('nodelivery', true, () => new Deliveries(ctx, cast, ctx.rng('scenes-delivery')));
  build('nowedding', false, () => new Wedding(ctx, cast, ctx.rng('scenes-wedding')));
  let musician: Musician | null = null;
  build('nomusician', false, () => (musician = new Musician(ctx, cast, ctx.rng('scenes-musician'))));
  build('noparklife', false, () => new ParkLife(ctx, cast, ctx.rng('scenes-park')));
  build('nobalconylife', false, () => new BalconyLife(ctx, cast, ctx.rng('scenes-balcony')));

  const guard = (s: Scene, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      problems.push(`scenes: ${s.name} failed (${err instanceof Error ? err.message : String(err)})`);
      console.error('[scenes]', s.name, err);
      scenes.splice(scenes.indexOf(s), 1);
    }
  };

  ctx.pickers.push({ name: 'scenes', pick: (ray: THREE.Ray) => cast.pick(ray) });
  ctx.services.scenes = { sync: (list: unknown[], n: number) => cast.sync(list as never[], n), cast, scenes, get musician() { return musician?.state ?? null; } };
  ctx.events.on('timejump', () => {
    for (let i = scenes.length - 1; i >= 0; i--) {
      const s = scenes[i];
      guard(s, () => s.timejump?.());
    }
  });
  ctx.events.on('quality', () => kit.setShadows(ctx.quality.shadows));

  let ms = 0;
  return {
    name: 'scenes',
    update(dt) {
      if (dt <= 0) return;
      const t0 = performance.now();
      cast.beginObs();
      for (let i = scenes.length - 1; i >= 0; i--) {
        const s = scenes[i];
        guard(s, () => s.update(dt));
      }
      cast.step(dt);
      ms = ms * 0.9 + (performance.now() - t0) * 0.1;
    },
    frame() {
      const cam = ctx.camera.position;
      kit.begin();
      for (let i = scenes.length - 1; i >= 0; i--) {
        const s = scenes[i];
        if ((s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 > s.reach * s.reach) continue;
        guard(s, () => s.draw(kit));
      }
      kit.end();
    },
    stats() {
      const out: Record<string, number> = { people: cast.count(), props: kit.total, simMs: Math.round(ms * 100) / 100 };
      for (const s of scenes) if (s.stats) Object.assign(out, s.stats());
      return out;
    },
    invariants() {
      const out = [...problems];
      for (const s of scenes) if (s.invariants) out.push(...s.invariants());
      return out;
    },
  };
}
