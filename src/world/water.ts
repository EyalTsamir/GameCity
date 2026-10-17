// Module "water": sea, river and park-pond surfaces (one stylised animated shader, one draw
// call) plus the translucent cut-away water sections on the slab faces (second draw call).
//
// Service: ctx.services.water = WaterService (see below) — consistent with the rendered swell.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { getTerrainModel } from './terrain/height';
import { groundBands, slabEdges } from './terrain/layout';
import { getWaterField, ampFrom } from './water/field';
import { createSurface } from './water/surface';
import { createCutaway } from './water/cutaway';
import { swell } from './water/waves';

export interface WaterService {
  /** vertical displacement of the water surface at (x, z) at sim time t (seconds, = uniforms.uTime) */
  waveHeight(x: number, z: number, t: number): number;
  /** still-water level at (x, z): sea/river -1.6, pond -0.3 */
  level(x: number, z: number): number;
  /** surface height = level + waveHeight at the current sim time */
  surfaceY(x: number, z: number): number;
  /** water depth below the still level (<= 0 on land) */
  depth(x: number, z: number): number;
  /** distance to the nearest shore (m) */
  shoreDistance(x: number, z: number): number;
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const model = getTerrainModel(ctx.plan);
  const field = getWaterField(model);
  const edges = slabEdges(model, groundBands(model));
  const lamps = (ctx.services.terrain as { promenadeLamps?: { x: number; y: number; z: number }[] } | undefined)?.promenadeLamps ?? [];
  const surface = createSurface(ctx, model, field, lamps);
  const cut = createCutaway(ctx, model, field, edges);
  const root = new THREE.Group();
  root.name = 'water';
  root.add(surface.mesh, cut.mesh);
  ctx.scene.add(root);

  const waveHeight = (x: number, z: number, t: number): number => {
    const d = field.sample(field.depth, x, z);
    if (d <= 0) return 0;
    return swell(x, z, t) * ampFrom(d, field.sample(field.region, x, z));
  };
  const service: WaterService = {
    waveHeight,
    level: (x, z) => model.waterLevel(x, z),
    surfaceY: (x, z) => model.waterLevel(x, z) + waveHeight(x, z, ctx.uniforms.uTime.value),
    depth: (x, z) => field.sample(field.depth, x, z),
    shoreDistance: (x, z) => field.sample(field.shore, x, z),
  };
  ctx.services.water = service;
  const moonU = surface.uniforms.uMoonDir.value as THREE.Vector3;
  const buildMs = performance.now() - t0;

  return {
    name: 'water',
    frame() {
      moonU.copy(ctx.clock.moonDir);
    },
    stats() {
      return {
        surfaceTris: surface.triangles,
        cutawayTris: cut.triangles,
        cutawaySpans: cut.spans.length,
        fieldBakeMs: Math.round(field.bakeMs),
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      const out: string[] = [];
      const plan = ctx.plan;
      // every open-water point of the plan must be covered by a rendered water cell
      let missing = 0;
      for (let k = 0; k < 1500; k++) {
        const x = plan.slab.x0 + ((k * 7919) % 4000) / 10;
        const z = plan.slab.z0 + ((k * 104729) % 3400) / 10;
        if (!plan.isWater(x, z)) continue;
        if (model.height(x, z) > model.waterLevel(x, z) + 0.05) continue; // refined banks above water
        if (!surface.covered(x, z)) {
          if (missing++ < 8) out.push(`water point (${x.toFixed(1)}, ${z.toFixed(1)}) has no water surface`);
        }
      }
      // service sanity: finite, small, zero on land
      for (const [x, z] of [
        [170, -60],
        [-50, 118],
        [-78, 17.5],
        [0, 0],
      ]) {
        const h = waveHeight(x, z, 12.3);
        if (!Number.isFinite(h) || Math.abs(h) > 0.5) out.push(`waveHeight(${x}, ${z}) = ${h}`);
      }
      if (waveHeight(0, 0, 5) !== 0) out.push('waveHeight on dry land is not 0');
      if (cut.spans.length === 0) out.push('no cut-away water sections built');
      return out;
    },
  };
}
