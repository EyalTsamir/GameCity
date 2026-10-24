// Module "groundcover" — grass, meadows, wildflowers, unmown edges, pavement weeds, fallen leaves,
// reeds / cattails / shore grass and dune marram as an instanced blade field in camera-centred LOD
// rings (groundcover/field.ts), driven by cover maps baked at boot from the plan (groundcover/mask.ts).
// Everything bends with the one wind (core/wind.ts). The ground shader (world/terrain/ground.ts) shares
// the palette (groundcover/palette.ts) and the cover maps so the far field matches the blades.
//
// Service ctx.services.groundcover:
//   density(x, z)      grass density 0..1 at a world point (0 outside the slab / on hard surfaces)
//   flowerPatches      [{ x, z, r, density, species }] — wildflower patches (for butterflies / bees)
//   setDensity(k)      0.25..1 blade density (+ ring radii) — for the adaptive-quality ladder
//   getDensity()
//   palette            shared colour uniforms (console tuning)
//
// URL: ?nograss (no blades; ground shader only) · ?grass=<0.25..1> · ?gcrings=A,B,C · ?gcflowers=0 ·
//      ?nolitter · ?nolilies · ?nogcouter (no blades beyond the slab: no roaming landscape window)

import type * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { buildCoverMaps, type FlowerPatch } from './groundcover/mask';
import { createCoverWindow } from './groundcover/outer';
import { createField, type Field, type QualityLevel } from './groundcover/field';
import { gcPalette, type GcPalette } from './groundcover/palette';
import { setGroundCover } from './terrain/ground';
import { createLilies } from './groundcover/lily';

export interface GroundcoverService {
  density(x: number, z: number): number;
  flowerPatches: FlowerPatch[];
  setDensity(k: number): void;
  getDensity(): number;
  palette: GcPalette;
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const prm = ctx.debug.params;
  const maps = buildCoverMaps(ctx);
  // blades beyond the slab: a roaming cover window around the camera, built in the background from the
  // world's landscape (≈ 4 ms per frame at 60 fps), double-buffered — no boot cost, no hitch
  const cwin = prm.has('nogcouter') ? null : createCoverWindow(ctx);
  let lastFrameT = 0;

  let field: Field | null = null;
  let level = ctx.quality.level as QualityLevel;
  if (!prm.has('nograss')) {
    field = createField(ctx, maps, null, level, {
      rings: prm.get('gcrings') ?? undefined,
      flowers: prm.get('gcflowers') !== '0',
      litter: !prm.has('nolitter'),
    });
    ctx.scene.add(field.group);
    const g = Number(prm.get('grass'));
    if (Number.isFinite(g) && g > 0) field.setDensity(g);
  }

  // lily pads on the park pond
  const lilies = prm.has('nolilies') ? { mesh: null, pads: 0, flowers: 0 } : createLilies(ctx);
  if (lilies.mesh) ctx.scene.add(lilies.mesh);

  // tile selection with the final camera of this frame: chained scene.onBeforeRender, once per frame
  let frameNo = 0;
  let doneFrame = -1;
  const scene = ctx.scene;
  type Hook = (this: unknown, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, ...rest: unknown[]) => void;
  const prev = scene.onBeforeRender as unknown as Hook;
  const hook: Hook = function (this: unknown, renderer, sc, camera, ...rest) {
    if (field && camera === ctx.camera && doneFrame !== frameNo) {
      doneFrame = frameNo;
      const hpx = ctx.size.height * renderer.getPixelRatio() * (ctx.quality.renderScale || 1);
      field.update(camera as THREE.PerspectiveCamera, hpx);
    }
    prev.call(this, renderer, sc, camera, ...rest);
  };
  scene.onBeforeRender = hook as unknown as THREE.Scene['onBeforeRender'];

  const onQuality = () => {
    const lv = ctx.quality.level as QualityLevel;
    if (field && lv !== level) {
      level = lv;
      field.setQuality(lv);
    }
  };
  ctx.events.on('quality', onQuality);

  const service: GroundcoverService = {
    density: maps.densityAt,
    flowerPatches: maps.patches,
    setDensity: (k: number) => field?.setDensity(k),
    getDensity: () => field?.density() ?? 0,
    palette: gcPalette(),
  };
  ctx.services.groundcover = service;
  if (ctx.debug.enabled) (service as unknown as Record<string, unknown>)._debug = { maps, window: cwin, field: () => field };
  const buildMs = performance.now() - t0;

  return {
    name: 'groundcover',
    frame() {
      frameNo++;
      if (cwin && field) {
        // ~4 ms per frame at 60 fps; slow frames (software GL, heavy boot) take a proportional slice
        // (wall time between frames — realDt is clamped to 0.1 s by main.ts)
        const t0 = performance.now();
        const wall = lastFrameT > 0 ? t0 - lastFrameT : 16;
        lastFrameT = t0;
        const budget = Math.min(80, Math.max(4, wall * 0.12));
        const p = ctx.camera.position;
        const ready = cwin.update(p.x, p.z, budget);
        if (ready) field.setOuter(ready);
      }
      if (ctx.quality.level !== level) onQuality();
    },
    stats() {
      const s = field?.stats();
      return {
        tiles: s?.tiles ?? 'off',
        blades: s?.blades ?? 0,
        bladeVerts: s?.verts ?? 0,
        density: Math.round((field?.density() ?? 0) * 100) / 100,
        patches: maps.patches.length,
        lilyPads: lilies.pads,
        grassCells: maps.stats.grassCells,
        meadowCells: maps.stats.meadowCells,
        wetCells: maps.stats.wetCells,
        duneCells: maps.stats.duneCells,
        weedCells: maps.stats.weedCells,
        litterCells: maps.stats.litterCells,
        mapsMs: Math.round(maps.buildMs),
        mapsPhases: maps.phases,
        windowMs: cwin?.active() ? Math.round(cwin.active()!.workMs) : cwin ? 'building' : 'off',
        windowBuilds: cwin?.builds() ?? 0,
        windowCells: cwin?.active()?.cells ?? 0,
        buildMs: Math.round(buildMs),
      };
    },
    dispose() {
      scene.onBeforeRender = prev as unknown as THREE.Scene['onBeforeRender'];
      field?.dispose();
    },
  };
}
