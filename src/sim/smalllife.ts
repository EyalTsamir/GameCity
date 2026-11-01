// Module "smalllife": small movements that make closeness feel alive, anywhere you happen to walk (close-up round,
// docs/progress/close-life.md). Birds on the pavement, cats on walls, leaves and paper stirred by the wind. All of it
// lives in the near-detail bubble (core/nearDetail.ts): nothing exists beyond it, so far views cost nothing but a test.
//
// Switches (core/closeLife.ts): ?nosmalllife, ?nostreetBirds.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { closeLife } from '../core/closeLife';
import { nearOf } from '../core/nearDetail';
import { Movers } from './smalllife/movers';
import { StreetBirds } from './smalllife/streetBirds';
import { Litter } from './smalllife/litter';
import { Cats } from './smalllife/cats';

export default function create(ctx: CityContext): CityModule {
  const empty: CityModule = { name: 'smalllife' };
  if (!nearOf(ctx)) return empty;
  const root = new THREE.Group();
  root.name = 'smalllife';
  ctx.scene.add(root);
  const movers = new Movers(ctx);
  const birds = closeLife(ctx, 'streetBirds') ? new StreetBirds(ctx, movers, root) : null;
  const litter = closeLife(ctx, 'nearLitter') ? new Litter(ctx, movers, root) : null;
  const cats = closeLife(ctx, 'nearCats') ? new Cats(ctx, movers, root) : null;
  ctx.events.on('timejump', () => birds?.timejump());
  ctx.events.on('quality', () => {
    birds?.setShadows(ctx.quality.shadows);
    cats?.setShadows(ctx.quality.shadows);
  });
  ctx.services.smalllife = { birds, litter, cats, movers };

  let ms = 0;
  return {
    name: 'smalllife',
    update(dt) {
      const t0 = performance.now();
      birds?.update(dt);
      litter?.update(dt);
      cats?.update(dt);
      ms = ms * 0.9 + (performance.now() - t0) * 0.1;
    },
    frame(realDt) {
      movers.update(realDt);
      birds?.frame();
      litter?.frame();
      cats?.frame();
    },
    stats() {
      return { ...(birds?.stats() ?? {}), ...(litter?.stats() ?? {}), ...(cats?.stats() ?? {}), simMs: Math.round(ms * 100) / 100 };
    },
  };
}
