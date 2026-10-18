// Module "terrain": the diorama base (layered soil slab on a wooden plinth with a brass
// nameplate), the ground heightfield (grass, meadows, sand, rock, beds), the northern hills
// with tunnel portals, quay walls, railings and rock outcrops.
//
// Services: ctx.services.terrain = { height(x,z), rocks[], portals[] } (see TerrainService).

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { getTerrainModel } from './terrain/height';
import { createGround } from './terrain/ground';
import { createSlab } from './terrain/slab';
import { createMasonry, MOON_DIR } from './terrain/masonry';
import { createGlows, type GlowPoint } from './terrain/glow';

export interface TerrainService {
  /** rendered ground height (plan.heightAt + local refinements: pond, portals, river mouth, cliff) */
  height(x: number, z: number): number;
  /** rock outcrop footprints (vegetation should avoid them) */
  rocks: { x: number; z: number; r: number }[];
  portals: { kind: 'road' | 'rail'; x: number; z: number; yaw: number; width: number; height: number }[];
  /** ornamental promenade lamp heads (world positions) — for light pools / reflections */
  promenadeLamps: { x: number; z: number; y: number }[];
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const model = getTerrainModel(ctx.plan);
  const root = new THREE.Group();
  root.name = 'terrain';
  const masonry = createMasonry(ctx, model);
  const ground = createGround(ctx, model, masonry.cliffs?.feet ?? []);
  root.add(ground.mesh);
  const slab = createSlab(ctx, model, ground.edges);
  root.add(slab.faces, slab.plinth, slab.nameplate, slab.shadow);
  root.add(masonry.mesh, masonry.veils, masonry.railings.mesh);
  // night glows: promenade lamp halos + light pools, portal lanterns, tunnel lamps
  const glowPts: GlowPoint[] = [...masonry.lights];
  for (const l of masonry.railings.lampPosts) {
    glowPts.push({ x: l.x, y: l.y, z: l.z, size: 1.25, kind: 'halo', color: '#ffd08c', intensity: 1.05 });
    glowPts.push({ x: l.x, y: 0.2, z: l.z - 1.6, size: 4.2, kind: 'pool', color: '#ffbe72', intensity: 0.3 });
  }
  const glows = createGlows(ctx, glowPts);
  root.add(glows);
  ctx.scene.add(root);

  const service: TerrainService = {
    height: model.height,
    rocks: masonry.rocks,
    portals: model.portals.map((p) => ({ kind: p.kind, x: p.x, z: p.z, yaw: p.yaw, width: p.width, height: p.height })),
    promenadeLamps: masonry.railings.lampPosts,
  };
  ctx.services.terrain = service;
  if (ctx.debug.enabled) (service as unknown as Record<string, unknown>)._debug = { mask: ground.mask };
  const buildMs = performance.now() - t0;

  return {
    name: 'terrain',
    frame() {
      // moonlit-rock term in the masonry shader (no allocation)
      MOON_DIR.value.copy(ctx.clock.moonDir);
    },
    stats() {
      return {
        groundTris: ground.triangles,
        groundVerts: ground.vertices,
        slabTris: slab.triangles,
        masonryTris: masonry.triangles,
        railingTris: masonry.railings.triangles,
        rocks: masonry.rocks.length,
        cliffTris: masonry.cliffs?.triangles ?? 0,
        cliffBlocks: masonry.cliffs?.blocks ?? 0,
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      const out: string[] = [];
      // tunnel bores must stay buried inside the hill
      for (const s of masonry.boreSamples) {
        const h = model.height(s.x, s.z);
        if (h < s.roof + 0.2) out.push(`tunnel roof exposed at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}): ground ${h.toFixed(2)} < roof ${s.roof.toFixed(2)}`);
      }
      return out;
    },
  };
}
