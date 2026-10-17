// Module "pedestrians": the people of Tinyhaven.
//
// ~250–450 little model-railway figures (scaled by quality.density and the time
// of day) walk the pedestrian graph in parties of 1–3: commuters, shoppers,
// strollers, tourists, joggers, dog walkers, parents with prams, the elderly,
// families, beachgoers, anglers and night owls. They wait at kerbs and cross at
// crosswalks (IntersectionManager protocol), sit on benches, sunbathe on towels,
// admire fountains, queue at bus stops (and board when a bus arrives), pour out
// of the station when a train arrives and step into doors at the end of a trip.
//
// Rendering: one instanced figure mesh posed in the vertex shader (+ prams, dogs
// and soft contact shadows), see pedestrians/figure.ts and pedestrians/render.ts.

import type { CityContext, CityModule } from '../core/context';
import { buildPlaces } from './pedestrians/places';
import { Crowd, type BusEvent } from './pedestrians/crowd';
import { CrowdRenderer } from './pedestrians/render';

export default function create(ctx: CityContext): CityModule {
  const rng = ctx.rng('pedestrians');
  const places = buildPlaces(ctx, rng.fork('places'));
  const crowd = new Crowd(ctx, places, rng.fork('crowd'));
  const renderer = new CrowdRenderer(ctx.scene, 720, ctx.quality.shadows);
  // ?hide=pedestrians: simulate but draw nothing (isolates the rendering cost in perf runs)
  if ((ctx.debug.params.get('hide') ?? '').split(',').includes('pedestrians')) renderer.group.visible = false;
  if (ctx.debug.params.has('pedlod')) renderer.forceLod = Math.max(0, Math.min(2, Number(ctx.debug.params.get('pedlod')) || 0));
  crowd.warmStart();

  const offs: (() => void)[] = [];
  offs.push(ctx.events.on('bus:stop', (e: BusEvent) => crowd.onBus(e)));
  offs.push(ctx.events.on('train:arrive', (e: { station: number; trainId: number }) => crowd.onTrain(e)));
  offs.push(ctx.events.on('timejump', () => crowd.onTimeJump()));
  offs.push(
    ctx.events.on('quality', () => {
      crowd.onQuality();
      renderer.setShadows(ctx.quality.shadows);
    }),
  );

  // `_crowd` / `_renderer` are debug handles for automated tests (window.__city.ctx.services.pedestrians._crowd)
  const service = { count: () => crowd.count(), _crowd: crowd, _renderer: renderer };
  ctx.services.pedestrians = service;
  ctx.pickers.push({ name: 'pedestrians', pick: (ray) => crowd.pick(ray) });

  let ms = 0;
  return {
    name: 'pedestrians',
    update(dt) {
      const t0 = performance.now();
      crowd.update(dt);
      ms = ms * 0.9 + (performance.now() - t0) * 0.1;
    },
    frame() {
      renderer.write(crowd, ctx.camera, ctx.uniforms.uTime.value, ctx.uniforms.uRain.value, ctx.uniforms.uNight.value, ctx.size.height * ctx.renderer.getPixelRatio());
    },
    stats() {
      return { ...crowd.statsSummary(), drawn: renderer.visible, nearLod: renderer.near.n, tinyLod: renderer.tiny.n, figureTris: renderer.triangles, simMs: Math.round(ms * 100) / 100 };
    },
    invariants() {
      return crowd.invariants();
    },
    dispose() {
      for (const off of offs) off();
      renderer.dispose();
    },
  };
}
