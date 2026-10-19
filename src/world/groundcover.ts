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
//      ?nolitter

import type * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { buildCoverMaps, type FlowerPatch } from './groundcover/mask';
import { createField, type Field, type QualityLevel } from './groundcover/field';
import { gcPalette, type GcPalette } from './groundcover/palette';
import { setGroundCover } from './terrain/ground';

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
  // hand the maps to the ground shader (far field: lengths, flowers, litter, blade presence)
  setGroundCover(maps.texCover, maps.texFlower);

  let field: Field | null = null;
  let level = ctx.quality.level as QualityLevel;
  if (!prm.has('nograss')) {
    field = createField(ctx, maps, level, {
      rings: prm.get('gcrings') ?? undefined,
      flowers: prm.get('gcflowers') !== '0',
      litter: !prm.has('nolitter'),
    });
    ctx.scene.add(field.group);
    const g = Number(prm.get('grass'));
    if (Number.isFinite(g) && g > 0) field.setDensity(g);
  }

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
  const buildMs = performance.now() - t0;

  return {
    name: 'groundcover',
    frame() {
      frameNo++;
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
        grassCells: maps.stats.grassCells,
        meadowCells: maps.stats.meadowCells,
        wetCells: maps.stats.wetCells,
        duneCells: maps.stats.duneCells,
        weedCells: maps.stats.weedCells,
        litterCells: maps.stats.litterCells,
        mapsMs: Math.round(maps.buildMs),
        mapsPhases: maps.phases,
        buildMs: Math.round(buildMs),
      };
    },
    dispose() {
      scene.onBeforeRender = prev as unknown as THREE.Scene['onBeforeRender'];
      field?.dispose();
    },
  };
}
