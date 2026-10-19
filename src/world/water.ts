// Module "water": sea, river and park-pond surfaces (one shader, one draw call), the translucent
// cut-away water sections on the slab faces (second draw call) and the planar reflection pass
// (high quality: one extra low-resolution scene pass drawing only LAYERS.REFLECT meshes).
//
// Service: ctx.services.water = WaterService (see below) — consistent with the rendered swell.
// URL switches: ?nowaterrefl (analytic sky only), ?waterrefl=0|1|2 (force a reflection level),
// ?nohullfoam (no hull contact shadow / foam line).

import * as THREE from 'three';
import type { CityContext, CityModule, QualityState } from '../core/context';
import { getTerrainModel } from './terrain/height';
import { groundBands, slabEdges } from './terrain/layout';
import { getWaterField, ampFrom } from './water/field';
import { createSurface, createSkyUniforms } from './water/surface';
import { createCutaway } from './water/cutaway';
import { swell } from './water/waves';
import { PlanarReflection, type ReflectionLevel } from './water/reflection';
import { HullContacts } from './water/hulls';
import { buildWaterExtension, type WaterExtension } from './water/extension';
import { WORLD_MODE } from '../core/world';
import type { LandscapeService } from './landscape';

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
  /**
   * planar reflection quality (the adaptive quality ladder calls this):
   * 0 = off (analytic sky only), 1 = low (base set, ~1/4.5 res), 2 = full (1/3 res, + bank trees while the river is in view).
   * Ignored while a URL switch (?nowaterrefl / ?waterrefl=n) forces the level.
   */
  setReflectionQuality(level: 0 | 1 | 2): void;
  /** current reflection level (0 | 1 | 2) */
  reflectionQuality(): number;
}

interface DomeUniforms {
  uZenith?: { value: THREE.Color };
  uHorizon?: { value: THREE.Color };
  uGlow?: { value: THREE.Color };
  uGlowI?: { value: number };
  uSunCol?: { value: THREE.Color };
  uSunVis?: { value: number };
  uMoonDir?: { value: THREE.Vector3 };
  uMoonVis?: { value: number };
  uOvercast?: { value: number };
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const params = ctx.debug.params;
  const model = getTerrainModel(ctx.plan);
  const field = getWaterField(model);
  const edges = slabEdges(model, groundBands(model));

  // ── reflection level: URL override > quality preset (high → full; medium/low → analytic only)
  const forcedParam = params.has('nowaterrefl') ? 0 : params.has('waterrefl') ? Number(params.get('waterrefl')) : NaN;
  const forced: ReflectionLevel | null = forcedParam === 0 || forcedParam === 1 || forcedParam === 2 ? (forcedParam as ReflectionLevel) : null;
  const presetLevel = (q: QualityState): ReflectionLevel => (q.level === 'high' ? 2 : 0);
  let wanted: ReflectionLevel = forced ?? presetLevel(ctx.quality);

  const reflection = new PlanarReflection(ctx, wanted);
  const hulls = new HullContacts(ctx);
  const sky = createSkyUniforms();
  // world mode: the sea to the horizon and the river into the country (needs the landscape model)
  const land = ctx.services.landscape as LandscapeService | undefined;
  let ext: WaterExtension | null = null;
  if (WORLD_MODE && land && land.active) ext = buildWaterExtension(land.model, field);
  const surface = createSurface(ctx, model, field, reflection.uniforms, hulls, sky, ext);
  // diorama: translucent cut-away sections where the water meets the slab faces
  const cut = WORLD_MODE ? null : createCutaway(ctx, model, field, edges);
  const root = new THREE.Group();
  root.name = 'water';
  root.add(surface.mesh);
  if (cut) root.add(cut.mesh);
  ctx.scene.add(root);
  const hullsOn = !params.has('nohullfoam');

  // the sky the water mirrors comes from the dome (render/sky/dome.ts), looked up once ready
  let dome: DomeUniforms | null = null;
  ctx.events.on('modules:ready', () => {
    const m = ctx.scene.getObjectByName('sky-dome') as THREE.Mesh | undefined;
    const u = (m?.material as THREE.ShaderMaterial | undefined)?.uniforms as DomeUniforms | undefined;
    if (u && u.uZenith && u.uHorizon) dome = u;
    reflection.attach();
  });
  ctx.events.on('quality', (q: QualityState) => {
    if (forced === null && q && q.level) {
      wanted = presetLevel(q);
      reflection.setLevel(wanted);
    }
  });

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
    setReflectionQuality(level) {
      if (forced !== null) return;
      const l = (level === 1 || level === 2 ? level : 0) as ReflectionLevel;
      wanted = l;
      reflection.setLevel(l);
    },
    reflectionQuality: () => reflection.getLevel(),
  };
  // debug only (harness): restrict the reflection pass to opted-in meshes matching a regex (null = all)
  (service as unknown as Record<string, unknown>)._debugReflectFilter = (re: string | null) => {
    reflection.filter = re ? new RegExp(re) : null;
  };
  ctx.services.water = service;
  const buildMs = performance.now() - t0;

  const copyDome = () => {
    const d = dome;
    if (!d) return;
    (sky.uSkyZen.value as THREE.Color).copy(d.uZenith!.value);
    (sky.uSkyHor.value as THREE.Color).copy(d.uHorizon!.value);
    if (d.uGlow) (sky.uSkyGlow.value as THREE.Color).copy(d.uGlow.value);
    if (d.uGlowI) sky.uSkyGlowI.value = d.uGlowI.value;
    if (d.uSunCol) (sky.uSkySunCol.value as THREE.Color).copy(d.uSunCol.value);
    if (d.uSunVis) sky.uSkySunVis.value = d.uSunVis.value;
    if (d.uMoonDir) (sky.uSkyMoonDir.value as THREE.Vector3).copy(d.uMoonDir.value);
    if (d.uMoonVis) sky.uSkyMoonVis.value = d.uMoonVis.value;
    if (d.uOvercast) sky.uSkyOvercast.value = d.uOvercast.value;
  };
  if (!ctx.services.sky) {
    // no sky module (?only=…): moon from the clock, fixed day colours
    sky.uSkyMoonVis.value = 0;
  }

  return {
    name: 'water',
    frame() {
      copyDome();
      if (!dome) (sky.uSkyMoonDir.value as THREE.Vector3).copy(ctx.clock.moonDir);
      if (hullsOn) hulls.update();
      reflection.request();
    },
    stats() {
      return {
        surfaceTris: surface.triangles,
        cutawayTris: cut ? cut.triangles : 0,
        cutawaySpans: cut ? cut.spans.length : 0,
        extVerts: ext ? ext.vertices : 0,
        extMs: ext ? Math.round(ext.ms) : 0,
        reflLevel: reflection.getLevel(),
        reflRes: reflection.getLevel() > 0 ? `${reflection.width}x${reflection.height}` : 'off',
        reflCalls: reflection.getLevel() > 0 ? reflection.calls : 0,
        reflTris: reflection.getLevel() > 0 ? reflection.tris : 0,
        reflMeshes: reflection.meshes,
        reflRenders: reflection.renders,
        hulls: hulls.count,
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
      if (cut && cut.spans.length === 0) out.push('no cut-away water sections built');
      if (reflection.getLevel() > 0 && reflection.meshes === 0) out.push('reflection pass has no meshes');
      return out;
    },
    dispose() {
      reflection.dispose();
    },
  };
}
