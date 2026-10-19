// Module "life" — the things that move with the air and make the town breathe (world round, see
// docs/progress/world-life.md):
//   • cloth (life/cloth.ts): bunting, prayer flags and festoon lights across the old-town and market
//     streets, laundry across back courtyards and on balconies, flags on poles — one instanced draw
//     (+ shadow), wires one draw, festoon bulbs one draw; all animated by the shared wind field
//     (core/wind.ts) on the GPU;
//   • (next milestones) house chimney smoke, kitchen / bakery vents, garden BBQs, falling leaves,
//     dust motes, moths at lamps.
// Anchors come from the buildings service (ctx.services.buildings: spans, facades, laundry).
//
// URL switches: ?nocloth (no cloth at all), ?nobunting, ?nolaundry, ?lifedebug (counts in the console).

import type { CityContext, CityModule } from '../core/context';
import { ClothSystem } from './life/cloth';
import { decorate, type BuildingsLike, type DecorStats } from './life/decor';

export default function create(ctx: CityContext): CityModule {
  const params = ctx.debug.params;
  const problems: string[] = [];
  const cloth = new ClothSystem(ctx);
  let decor: DecorStats | null = null;
  const buildings = ctx.services.buildings as BuildingsLike | undefined;

  if (!params.has('nocloth')) {
    decor = decorate(ctx, cloth, buildings, { bunting: !params.has('nobunting'), laundry: !params.has('nolaundry') });
    cloth.build();
    ctx.scene.add(cloth.group);
    // the animated cloth now hangs on the balcony lines: hide the buildings' static stand-ins
    if (decor.balcony > 0) buildings?.setStaticLaundry?.(false);
    const setShadows = () => {
      if (cloth.clothMesh) cloth.clothMesh.castShadow = ctx.quality.shadows && ctx.quality.level !== 'low';
    };
    setShadows();
    ctx.events.on('quality', setShadows);
    if (params.has('lifedebug')) console.info('[life] decor', decor, 'pieces', cloth.pieceCount, 'bulbs', cloth.bulbCount);
  }
  if (!buildings) problems.push('life: ctx.services.buildings missing — no bunting / laundry anchors');

  return {
    name: 'life',
    frame() {
      cloth.frame();
    },
    stats() {
      return {
        lines: cloth.lines.length,
        pieces: cloth.pieceCount,
        bulbs: cloth.bulbCount,
        clothTris: cloth.tris,
        clothVerts: cloth.verts,
        ...(decor ? { street: decor.street, court: decor.court, balcony: decor.balcony, bunting: decor.bunting, prayer: decor.prayer, festoon: decor.festoon, laundryItems: decor.laundryItems, lowestY: Math.round(decor.lowest * 100) / 100, festoonLights: decor.lights } : {}),
      };
    },
    invariants() {
      const out = [...problems];
      for (const l of cloth.lines) {
        if (!Number.isFinite(l.ax + l.ay + l.az + l.bx + l.by + l.bz + l.sag)) {
          out.push('life: line with non-finite ends');
          break;
        }
      }
      // street bunting must clear buses / lorries (4.2 m)
      if (decor && decor.street > 0 && decor.lowest < 4.2) out.push(`life: street bunting hangs down to ${decor.lowest.toFixed(2)} m (< 4.2 m clearance)`);
      return out;
    },
  };
}
