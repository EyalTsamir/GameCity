// Module "landscape" (world round): the world beyond the slab — countryside W and S, forested hills
// and a mountain range N, the river coming from the W, the sea to the horizon E (water module).
// In ?diorama mode nothing is built (the tabletop presentation), the service still answers.
//
// Service: ctx.services.landscape = LandscapeService (below) — height / isWater / cover for ANY
// point (inside the slab: the terrain's own height), exposed before any mesh is built.
// URL switches: ?noland (no landscape meshes), ?nomountains, ?landfog=0 (landscape materials without
// fog, to judge geometry independently of the atmosphere), ?landdbg (cover debug colours).

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { WORLD_MODE } from '../core/world';
import { getTerrainModel } from './terrain/height';
import { groundBands, slabEdges } from './terrain/layout';
import { createLandscapeModel, type Cover, type LandscapeModel } from './landscape/model';
import { buildRings, type RingTopology } from './landscape/rings';
import { evalHeights, buildLandGeometry, makeSlabNormal, LAND_MAX_D, GROUND_DROP, type LandHeights } from './landscape/terrain';
import { landUniforms, landMaterial } from './landscape/shader';
import { buildMountains } from './landscape/mountains';

/** the water extension (sea to the horizon) uses the same rings out to here */
export const WATER_MAX_D = 52000;

export interface LandscapeService {
  /** true when the world beyond the slab is rendered (world mode, not ?noland) */
  active: boolean;
  /** ground height anywhere (inside the slab = terrain.height) */
  height(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  /** ground cover at (x, z) (writes into `out` if given) */
  cover(x: number, z: number, out?: Cover): Cover;
  /** signed distance to the sea coast (> 0 land) */
  coastSD(x: number, z: number): number;
  model: LandscapeModel;
  /** ring topology + heights (water module: sea / river extension) */
  topo: RingTopology | null;
  heights: LandHeights | null;
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const params = ctx.debug.params;
  const tmodel = getTerrainModel(ctx.plan);
  const slabH = tmodel.height;
  const model = createLandscapeModel(slabH);
  const coverTmp: Cover = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
  const build = WORLD_MODE && !params.has('noland');
  const service: LandscapeService = {
    active: build,
    height: model.height,
    isWater: model.isWater,
    cover: (x, z, out) => model.cover(x, z, out ?? coverTmp),
    coastSD: model.coastSD,
    model,
    topo: null,
    heights: null,
  };
  ctx.services.landscape = service;
  const modelMs = performance.now() - t0;

  if (!build) {
    return {
      name: 'landscape',
      stats: () => ({ active: 0, modelMs: Math.round(modelMs) }),
    };
  }

  const fog = params.get('landfog') !== '0';
  const root = new THREE.Group();
  root.name = 'landscape';
  // ── rings + heights (shared with the water module)
  const t1 = performance.now();
  const edges = slabEdges(tmodel, groundBands(tmodel));
  const topo = buildRings(edges, WATER_MAX_D);
  const heights = evalHeights(topo, model, LAND_MAX_D, WATER_MAX_D, slabH);
  service.topo = topo;
  service.heights = heights;
  const ringMs = performance.now() - t1;

  // ── ground mesh
  const uniforms = landUniforms(ctx.uniforms) as unknown as Record<string, THREE.IUniform>;
  if (params.has('landdbg')) (uniforms.uLandDbg as { value: number }).value = 1;
  const geo = buildLandGeometry(topo, heights, LAND_MAX_D, makeSlabNormal(slabH));
  const land = new THREE.Mesh(geo, landMaterial(uniforms, fog));
  land.name = 'land-ground';
  land.position.y = GROUND_DROP;
  land.receiveShadow = true;
  land.castShadow = false;
  land.matrixAutoUpdate = false;
  land.updateMatrix();
  root.add(land);

  // ── mountains / distant hill layers
  let mtnTris = 0,
    mtnVerts = 0;
  if (!params.has('nomountains')) {
    const m = buildMountains(model, uniforms, fog);
    root.add(m.mesh);
    mtnTris = m.triangles;
    mtnVerts = m.vertices;
  }
  ctx.scene.add(root);
  const buildMs = performance.now() - t0;
  const landTris = (geo.index?.count ?? 0) / 3;
  const landVerts = geo.getAttribute('position').count;

  return {
    name: 'landscape',
    stats() {
      return {
        active: 1,
        landVerts,
        landTris,
        mtnVerts,
        mtnTris,
        rings: topo.rings.length,
        modelMs: Math.round(modelMs),
        heightMs: Math.round(heights.ms),
        ringMs: Math.round(ringMs),
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      const out: string[] = [];
      // the seam: landscape height on the slab boundary = terrain height
      for (const [x, z] of [
        [-200, 0],
        [200, -50],
        [0, -190],
        [0, 150],
        [-200, 118],
      ]) {
        const a = model.height(x, z),
          b = slabH(x, z);
        if (Math.abs(a - b) > 1e-6) out.push(`seam mismatch at (${x}, ${z}): ${a} vs ${b}`);
      }
      // continuity just outside the slab
      for (const [x, z] of [
        [-200.01, 40],
        [0, 150.01],
        [0, -190.01],
      ]) {
        const a = model.height(x, z),
          b = slabH(Math.max(-200, Math.min(200, x)), Math.max(-190, Math.min(150, z)));
        if (Math.abs(a - b) > 0.05) out.push(`seam step at (${x}, ${z}): ${a.toFixed(3)} vs ${b.toFixed(3)}`);
      }
      return out;
    },
  };
}
