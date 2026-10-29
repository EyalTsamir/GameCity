// Module "life" — the things that move with the air and make the town breathe (world round, see
// docs/progress/world-life.md):
//   • cloth (life/cloth.ts + decor.ts + extras.ts): bunting, prayer flags and festoon lights across the
//     old-town and market streets, a market "star" of lines from two masts, café string lights, laundry
//     across back courtyards / on balconies / on garden dryers, flags on lifeguard towers and hotels —
//     one instanced cloth draw (+ shadow), wires one draw, festoon bulbs one draw, poles one draw;
//     all animated on the GPU by the shared wind field (core/wind.ts);
//   • smoke of daily life (life/chimneys.ts): house chimneys at the cool hours, hotel boilers, works
//     vents, bakery / kitchen flues, evening garden barbecues — emitters of the ambient smoke pool;
//   • drift (life/drift.ts): leaves torn off by gusts, butterflies and bees at flower patches (one
//     instanced draw), golden-hour dust motes and moths at the lamps (one additive points draw) —
//     only around the camera.
// Anchors come from the buildings / props / vegetation / groundcover services. Every part is
// fault-isolated: one failing part never takes the others down.
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
import { buildNightMarket, type NightMarket } from './life/nightmarket';

type TreeList = { x: number; z: number; r: number; h: number }[];

export default function create(ctx: CityContext): CityModule {
  const params = ctx.debug.params;
  const problems: string[] = [];
  const fail = (part: string, err: unknown) => {
    problems.push(`life: ${part} failed (${err instanceof Error ? err.message : String(err)})`);
    console.error(`[life] ${part} failed`, err);
  };
  const cloth = new ClothSystem(ctx);
  let decor: DecorStats | null = null;
  let extras: ExtraStats | null = null;
  const poles = new PoleBuilder();
  const buildings = ctx.services.buildings as BuildingsLike | undefined;
  const trees = (ctx.services.vegetation as { trees?: TreeList } | undefined)?.trees ?? [];

  // ── cloth on lines and poles
  let clothOk = false;
  if (!params.has('nocloth')) {
    try {
      decor = decorate(ctx, cloth, buildings, { trees, lamps: lampLights() }, { bunting: !params.has('nobunting'), laundry: !params.has('nolaundry') });
      const extraLamps: LampLight[] = [];
      try {
        extras = buildExtras(ctx, cloth, poles, extraLamps, { bunting: !params.has('nobunting'), laundry: !params.has('nolaundry'), flags: !params.has('noflags') });
      } catch (err) {
        fail('extras', err);
      }
      if (extraLamps.length) addLampLights(extraLamps);
      cloth.build();
      const poleMesh = poles.build();
      if (poleMesh) cloth.group.add(poleMesh);
      ctx.scene.add(cloth.group);
      clothOk = true;
      // the animated cloth now hangs on the balcony lines / dryers: hide the static stand-ins
      if (decor.balcony > 0) buildings?.setStaticLaundry?.(false);
      if (extras && extras.dryerItems > 0) (ctx.services.props as { setStaticLaundry?(on: boolean): void } | undefined)?.setStaticLaundry?.(false);
      const setShadows = () => {
        for (const m of cloth.clothMeshes) m.castShadow = ctx.quality.shadows && ctx.quality.level !== 'low';
      };
      setShadows();
      ctx.events.on('quality', setShadows);
      if (params.has('lifedebug')) console.info('[life] decor', decor, extras, 'pieces', cloth.pieceCount, 'bulbs', cloth.bulbCount);
    } catch (err) {
      fail('cloth', err);
    }
  }
  if (!buildings) problems.push('life: ctx.services.buildings missing — no bunting / laundry / chimney anchors');

  // ── the market shrouded after closing time (?nonightmarket; off on low)
  let nightMarket: NightMarket | null = null;
  if (!params.has('nonightmarket') && ctx.quality.level !== 'low') {
    try {
      nightMarket = buildNightMarket(ctx);
      if (nightMarket) ctx.scene.add(nightMarket.mesh);
    } catch (err) {
      fail('nightmarket', err);
    }
  }

  // ── smoke from daily life (emitters of the ambient module's shared smoke pool)
  let chimneySmoke: ChimneySmoke | null = null;
  if (!params.has('nochimneys')) {
    try {
      const bs = ctx.services.buildings as { chimneys?: []; vents?: [] } | undefined;
      const ps = ctx.services.props as { bbqs?: [] } | undefined;
      chimneySmoke = createChimneySmoke(ctx, bs?.chimneys ?? [], bs?.vents ?? [], ps?.bbqs ?? []);
    } catch (err) {
      fail('chimneys', err);
    }
  }

  // ── leaves / insects / motes / moths (camera-local)
  let drift: Drift | null = null;
  if (!params.has('nodrift')) {
    try {
      const q = ctx.quality.level;
      drift = new Drift(ctx, trees, {
        leaves: q === 'high' ? 320 : q === 'medium' ? 160 : 0,
        motes: q === 'high' ? 1400 : q === 'medium' ? 700 : 0,
        moths: q === 'low' ? 0 : 60,
        butterflies: q === 'high' ? 14 : q === 'medium' ? 8 : 0,
        bees: q === 'high' ? 22 : q === 'medium' ? 10 : 0,
      });
      ctx.scene.add(drift.group);
      const d = drift;
      ctx.events.on('timejump', () => d.timejump());
    } catch (err) {
      fail('drift', err);
      drift = null;
    }
  }
  let lastT = ctx.uniforms.uTime.value;
  // debug handle for the harness: __city.ctx.services.lifeDebug
  ctx.services.lifeDebug = { cloth, get drift() { return drift; }, get smoke() { return chimneySmoke; } };

  // runtime isolation: a part that throws is switched off (and reported), the rest keeps running
  const guard = (part: string, fn: () => void, off: () => void) => {
    try {
      fn();
    } catch (err) {
      fail(part, err);
      off();
    }
  };

  return {
    name: 'life',
    update(dt) {
      if (dt <= 0) return;
      if (chimneySmoke) guard('chimneys', () => chimneySmoke!.update(dt), () => (chimneySmoke = null));
      if (drift) guard('drift', () => drift!.update(dt), () => (drift = null));
    },
    frame(realDt) {
      if (clothOk) guard('cloth', () => cloth.frame(), () => (clothOk = false));
      if (nightMarket) guard('nightmarket', () => nightMarket!.frame(), () => (nightMarket = null));
      const t = ctx.uniforms.uTime.value;
      if (drift) guard('drift', () => drift!.frame(realDt, Math.max(0, Math.min(1, t - lastT))), () => (drift = null));
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
