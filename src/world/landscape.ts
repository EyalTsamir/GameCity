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
import { buildLand, makeSlabNormal, LAND_MAX_D, GROUND_DROP, type LandHeights } from './landscape/terrain';
import { landUniforms, landMaterial } from './landscape/shader';
import { buildMountains } from './landscape/mountains';
import { placeTrees, createLandTrees, type LandTrees } from './landscape/trees';
import { buildSettlements } from './landscape/settlements';
import { createShips, type Ships } from './landscape/ships';
import { LAYERS } from '../core/layers';
import { buildLandLights, type LandLights } from './landscape/lights';
import { createFarmLife, type FarmLife } from './landscape/farmlife';
import { buildCountryRoads, type CountryRoads } from './landscape/roads';
import type { SmokeService } from '../sim/ambient';

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
  /** countryside tree detail 0..1 (3D near-set radius; 0 = impostors only) — for the adaptive ladder */
  setTreeDetail(k: number): void;
  /** ring topology + heights of the land mesh */
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
    setTreeDetail: () => {},
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
  const topo = buildRings(edges, LAND_MAX_D);
  const built = buildLand(topo, model, LAND_MAX_D, slabH, makeSlabNormal(slabH));
  const heights = built.heights;
  const geo = built.geo;
  service.topo = topo;
  service.heights = heights;
  const ringMs = performance.now() - t1;

  // ── ground mesh
  const uniforms = landUniforms(ctx.uniforms) as unknown as Record<string, THREE.IUniform>;
  if (params.has('landdbg')) (uniforms.uLandDbg as { value: number }).value = 1;
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
  let mtnMat: THREE.Material | null = null;
  if (!params.has('nomountains')) {
    const m = buildMountains(model, uniforms, fog);
    root.add(m.mesh);
    mtnTris = m.triangles;
    mtnVerts = m.vertices;
    mtnMat = m.material;
  }
  // ── water reflection proxies (drawn only by the water module's reflection pass, LAYERS.REFLECT):
  // the coastal land + island (land triangles within 2.5 km of the sea, sharing the land mesh's
  // vertex buffers) and a coarse copy of the mountain layers
  let reflTris = 0;
  {
    const idx = geo.index!.array as Uint32Array;
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    const keep: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t];
      const x = P.getX(a),
        z = P.getZ(a);
      if (x < 0 && z < 2000) continue; // the river side is covered by the slab's own set + bank trees
      const sd = model.coastSD(x, z);
      if (sd > 2500 || sd < -1500) continue;
      keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const pg = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) pg.setAttribute(name, geo.getAttribute(name));
    pg.setIndex(new THREE.BufferAttribute(new Uint32Array(keep), 1));
    pg.boundingSphere = geo.boundingSphere!.clone();
    const proxy = new THREE.Mesh(pg, land.material);
    proxy.name = 'land-reflect';
    proxy.position.y = GROUND_DROP;
    proxy.matrixAutoUpdate = false;
    proxy.updateMatrix();
    proxy.layers.set(LAYERS.REFLECT);
    root.add(proxy);
    reflTris += keep.length / 3;
    if (mtnMat) {
      const mr = buildMountains(model, uniforms, fog, 4, mtnMat);
      mr.mesh.name = 'land-reflect-mtn';
      mr.mesh.layers.set(LAYERS.REFLECT);
      mr.mesh.matrixAutoUpdate = false;
      root.add(mr.mesh);
      reflTris += mr.triangles;
    }
  }
  // ── country roads, tunnel portals, bridge, cars
  let roads: CountryRoads | null = null;
  if (params.get('landroads') !== '0') {
    roads = buildCountryRoads(model, uniforms, fog, ctx.uniforms.uLights);
    root.add(roads.group);
  }
  // ── distant shipping
  let ships: Ships | null = null;
  if (params.get('landships') !== '0') {
    ships = createShips(model, fog, ctx.uniforms.uLights);
    root.add(ships.mesh);
  }
  // ── farmsteads, hamlets, villages
  let bldCount = 0;
  let beacon: { x: number; y: number; z: number } | null = null;
  if (params.get('landbld') !== '0') {
    const st = buildSettlements(model, uniforms, ctx.uniforms.uLights, ctx.uniforms.uNight, fog);
    root.add(st.group);
    bldCount = st.count;
    beacon = st.beacon;
  }
  // ── night lights of villages and farms
  let lamps: LandLights | null = null;
  if (params.get('landbld') !== '0') {
    lamps = buildLandLights(model, ctx.uniforms.uLights, beacon);
    root.add(lamps.points);
  }
  // ── farm life: herds, a working tractor; chimney smoke from villages and farms (ambient's smoke)
  let farm: FarmLife | null = null;
  if (params.get('landlife') !== '0') {
    farm = createFarmLife(model, uniforms, fog, ctx.quality.density);
    root.add(farm.group);
    ctx.events.on('modules:ready', () => {
      const smoke = ctx.services.smoke as SmokeService | undefined;
      if (!smoke) return;
      farm?.attachSmoke(smoke);
      // wood smoke from chimneys: mornings and evenings (cool hours), a few all day
      const clock = ctx.clock;
      let n = 0;
      for (const site of model.sites) {
        const k = site.kind === 'village' ? 6 : site.kind === 'hamlet' ? 2 : model.slabDist(site.x, site.z) < 1600 && (site.seed % 3 === 0) ? 1 : 0;
        for (let i = 0; i < k; i++) {
          const a = ((site.seed * 7 + i * 13) % 100) / 100 * Math.PI * 2;
          const r = site.kind === 'farm' ? 3 : site.r * (0.2 + 0.6 * (((site.seed + i * 31) % 17) / 17));
          const x = site.x + Math.cos(a) * r,
            z = site.z + Math.sin(a) * r;
          const y = model.height(x, z) + (site.kind === 'farm' ? 10 : 9.5);
          const allDay = (site.seed + i) % 4 === 0;
          smoke.addEmitter({
            getPosition: (out) => {
              const h = clock.hours;
              const cool = h < 10.5 || h > 17;
              if (!cool && !allDay) return false;
              out.set(x, y, z);
            },
            rate: 0.9,
            size: 0.9,
            color: '#a29c94',
            life: 14,
            rise: 1.2,
            opacity: 0.5,
          });
          n++;
        }
      }
      chimneys = n;
    });
  }
  let chimneys = 0;
  // ── countryside trees (near 3D set around the camera + far impostors)
  let trees: LandTrees | null = null;
  let treeMs = 0;
  if (params.get('landtrees') !== '0') {
    const placed = placeTrees(model, ctx.quality.density);
    treeMs = placed.ms;
    trees = createLandTrees(placed.list, uniforms, fog, ctx.quality.shadows && ctx.quality.level !== 'low');
    root.add(trees.group);
    const t = trees;
    const tierDetail = (lvl: string) => (lvl === 'low' ? 0 : lvl === 'medium' ? 0.7 : 1);
    let tier = tierDetail(ctx.quality.level);
    let adapt = 1;
    t.setDetail(tier * adapt);
    service.setTreeDetail = (k) => {
      adapt = Math.min(1, Math.max(0, k));
      t.setDetail(tier * adapt);
    };
    ctx.events.on('quality', (q: { level?: string }) => {
      if (!q || !q.level) return;
      tier = tierDetail(q.level);
      t.setDetail(tier * adapt);
    });
  }
  ctx.scene.add(root);
  const buildMs = performance.now() - t0;
  const landTris = (geo.index?.count ?? 0) / 3;
  const landVerts = geo.getAttribute('position').count;

  return {
    name: 'landscape',
    update(dt) {
      if (ships && dt > 0) ships.update(ctx.uniforms.uTime.value, dt);
      if (farm && dt > 0) farm.update(dt);
      if (roads && dt > 0) roads.update(dt);
    },
    frame() {
      trees?.update(ctx.camera);
      if (lamps) lamps.frame(ctx.size.height * ctx.renderer.getPixelRatio() * ctx.quality.renderScale);
    },
    stats() {
      return {
        active: 1,
        ...(trees ? trees.stats() : {}),
        treeMs: Math.round(treeMs),
        buildings: bldCount,
        animals: farm ? farm.animals : 0,
        roadTris: roads ? roads.triangles : 0,
        chimneys,
        landVerts,
        landTris,
        mtnVerts,
        mtnTris,
        reflTris,
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
