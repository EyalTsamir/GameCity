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
// URL switches: ?nocloth (no cloth at all), ?nobunting, ?nolaundry, ?noflags, ?nochimneys, ?nodrift,
// ?lifedebug (counts in the console).

import type { CityContext, CityModule } from '../core/context';
import { ClothSystem } from './life/cloth';
import { decorate, type BuildingsLike, type DecorStats } from './life/decor';
import { addLampLights, lampLights, type LampLight } from '../core/lampLight';
import { PoleBuilder } from './life/poles';
import { buildExtras, type ExtraStats } from './life/extras';
import { Drift } from './life/drift';
import { createChimneySmoke, type ChimneySmoke } from './life/chimneys';

export default function create(ctx: CityContext): CityModule {
  const params = ctx.debug.params;
  const problems: string[] = [];
  const cloth = new ClothSystem(ctx);
  let decor: DecorStats | null = null;
  let extras: ExtraStats | null = null;
  const poles = new PoleBuilder();
  const buildings = ctx.services.buildings as BuildingsLike | undefined;

  if (!params.has('nocloth')) {
    const trees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined)?.trees ?? [];
    decor = decorate(ctx, cloth, buildings, { trees, lamps: lampLights() }, { bunting: !params.has('nobunting'), laundry: !params.has('nolaundry') });
    const extraLamps: LampLight[] = [];
    extras = buildExtras(ctx, cloth, poles, extraLamps, { bunting: !params.has('nobunting'), laundry: !params.has('nolaundry'), flags: !params.has('noflags') });
    if (extraLamps.length) addLampLights(extraLamps);
    cloth.build();
    const poleMesh = poles.build();
    if (poleMesh) cloth.group.add(poleMesh);
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

  // smoke from daily life: chimneys, kitchen / bakery flues, garden barbecues (emitters of the
  // ambient module's shared smoke pool)
  let chimneySmoke: ChimneySmoke | null = null;
  if (!params.has('nochimneys')) {
    const bs = ctx.services.buildings as { chimneys?: []; vents?: [] } | undefined;
    const ps = ctx.services.props as { bbqs?: [] } | undefined;
    chimneySmoke = createChimneySmoke(ctx, bs?.chimneys ?? [], bs?.vents ?? [], ps?.bbqs ?? []);
  }

  // leaves / petals in gusts, golden-hour motes, moths at the lamps (camera-local)
  let drift: Drift | null = null;
  if (!params.has('nodrift')) {
    const q = ctx.quality.level;
    const trees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined)?.trees ?? [];
    drift = new Drift(ctx, trees, { leaves: q === 'high' ? 320 : q === 'medium' ? 160 : 0, motes: q === 'high' ? 420 : q === 'medium' ? 220 : 0, moths: q === 'low' ? 0 : 60, butterflies: q === 'high' ? 14 : q === 'medium' ? 8 : 0, bees: q === 'high' ? 22 : q === 'medium' ? 10 : 0 });
    ctx.scene.add(drift.group);
    const d = drift;
    ctx.events.on('timejump', () => d.timejump());
  }
  let lastT = ctx.uniforms.uTime.value;

  return {
    name: 'life',
    update(dt) {
      if (dt > 0) {
        chimneySmoke?.update(dt);
        drift?.update(dt);
      }
    },
    frame(realDt) {
      cloth.frame();
      const t = ctx.uniforms.uTime.value;
      drift?.frame(realDt, Math.max(0, Math.min(1, t - lastT)));
      lastT = t;
    },
    stats() {
      return {
        lines: cloth.lines.length,
        pieces: cloth.pieceCount,
        bulbs: cloth.bulbCount,
        clothTris: cloth.tris,
        clothVerts: cloth.verts,
        ...(chimneySmoke ? chimneySmoke.stats() : {}),
        ...(extras ?? {}),
        poleTris: poles.tris,
        leaves: drift?.live ?? 0,
        insects: drift?.insectsVisible ?? 0,
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
