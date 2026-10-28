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
// Rendering: sculpted figures (body.ts mesh, rig.ts anatomy, shader.ts posing, animate.ts poses)
// in three instanced levels of detail + a shadow proxy, prams, dogs and soft contact shadows —
// see pedestrians/render.ts. ?legacypeople restores the original figures (A/B, before/after).

import type { CityContext, CityModule } from '../core/context';
import { buildPlaces } from './pedestrians/places';
import { Crowd, type BusEvent } from './pedestrians/crowd';
import { CrowdRenderer } from './pedestrians/render';
import { setPedHairline, setPedFolds } from './pedestrians/shader';
import { CrowdRenderer as LegacyRenderer } from './pedestrians/legacy/render';
import { gaitConfig } from './pedestrians/rig';
import { Riders } from './pedestrians/riders';
import { buildStallMesh } from './pedestrians/vendors';

export default function create(ctx: CityContext): CityModule {
  const rng = ctx.rng('pedestrians');
  const legacy = ctx.debug.params.has('legacypeople');
  gaitConfig.legacy = legacy;
  const places = buildPlaces(ctx, rng.fork('places'));
  const crowd = new Crowd(ctx, places, rng.fork('crowd'));
  const renderer = legacy ? new LegacyRenderer(ctx.scene, 720, ctx.quality.shadows) : new CrowdRenderer(ctx.scene, 720, ctx.quality.shadows);
  // ?hide=pedestrians: simulate but draw nothing (isolates the rendering cost in perf runs)
  if ((ctx.debug.params.get('hide') ?? '').split(',').includes('pedestrians')) renderer.group.visible = false;
  if (ctx.debug.params.has('pedlod')) {
    // ?pedlod=0..3 near / lo / tiny / pin as before; ?pedlod=close the close level (new figures only)
    const v = ctx.debug.params.get('pedlod');
    const n = Math.max(0, Math.min(legacy ? 2 : 3, Number(v) || 0));
    renderer.forceLod = legacy ? n : v === 'close' ? 0 : n + 1;
  }
  // close level (sculpted face, fingers, fabric detail): 15 m on high, 11 on medium, 7 on low;
  // ?nopeopledetail turns it off
  if (ctx.debug.params.has('nohairline')) setPedHairline(false);
  if (ctx.debug.params.has('nofolds')) setPedFolds(false);
  if (!legacy) (renderer as CrowdRenderer).closeDist = ctx.debug.params.has('nopeopledetail') ? 0 : ctx.quality.level === 'low' ? 7 : ctx.quality.level === 'medium' ? 11 : 15;
  crowd.warmStart();
  // street vendors' carts (one static mesh)
  const stallMesh = buildStallMesh(places.vendors, rng.fork('stalls'));
  if (stallMesh) {
    stallMesh.castShadow = ctx.quality.shadows;
    renderer.group.add(stallMesh);
  }
  // riders of the traffic's two-wheelers (drawn with the crowd)
  const riders = legacy ? null : new Riders(ctx);

  const offs: (() => void)[] = [];
  offs.push(ctx.events.on('bus:stop', (e: BusEvent) => crowd.onBus(e)));
  offs.push(ctx.events.on('train:arrive', (e: { station: number; trainId: number }) => crowd.onTrain(e)));
  offs.push(ctx.events.on('timejump', () => crowd.onTimeJump()));
  offs.push(
    ctx.events.on('quality', () => {
      crowd.onQuality();
      renderer.setShadows(ctx.quality.shadows);
      if (stallMesh) stallMesh.castShadow = ctx.quality.shadows;
    }),
  );

  // `_crowd` / `_renderer` are debug handles for automated tests (window.__city.ctx.services.pedestrians._crowd)
  /** number of people (walkers, sitters, street actors) within r of (x, z) — read-only, allocation-free */
  const near = (x: number, z: number, r: number): number => {
    const r2 = r * r;
    let n = 0;
    const parties = crowd.parties;
    for (let i = 0; i < parties.length; i++) {
      const p = parties[i];
      if (p.state === 'gone') continue;
      const ms = p.members;
      for (let k = 0; k < ms.length; k++) {
        const m = ms[k];
        if (!m.present) continue;
        const dx = m.x - x,
          dz = m.z - z;
        if (dx * dx + dz * dz < r2) n++;
      }
    }
    return n;
  };
  const service = { count: () => crowd.count(), near, _crowd: crowd, _renderer: renderer };
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
      if (riders) riders.sync();
      if (renderer instanceof CrowdRenderer) renderer.tableware.lights.value = ctx.uniforms.uLights.value;
      if (renderer instanceof CrowdRenderer)
        renderer.write(crowd, ctx.camera, ctx.uniforms.uTime.value, ctx.uniforms.uRain.value, ctx.uniforms.uNight.value, ctx.size.height * ctx.renderer.getPixelRatio(), riders ? riders.list : null, riders ? riders.n : 0);
      else renderer.write(crowd, ctx.camera, ctx.uniforms.uTime.value, ctx.uniforms.uRain.value, ctx.uniforms.uNight.value, ctx.size.height * ctx.renderer.getPixelRatio());
    },
    stats() {
      const extra: Record<string, number> = renderer instanceof CrowdRenderer ? { pinLod: renderer.pin.n, figureVerts: renderer.vertices, shadowVerts: renderer.shadowVertices } : {};
      return { ...crowd.statsSummary(), riders: riders ? riders.n : 0, drawn: renderer.visible, ...(renderer instanceof CrowdRenderer ? { closeLod: renderer.close.n } : {}), nearLod: renderer.near.n, tinyLod: renderer.tiny.n, ...extra, figureTris: renderer.triangles, simMs: Math.round(ms * 100) / 100 };
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
