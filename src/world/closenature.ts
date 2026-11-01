// Module "closenature" (close round, docs/progress/close-nature.md): nature when you stand in it, everywhere. All of it lives in
// the near-detail bubble: nothing is built or drawn from the air. Switches in core/closenature.ts: ?noclosenature all,
// ?no<feature> one (closetrunks ...).

import type * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { closeNature } from '../core/closenature';
import { makeBarkTiles } from './closenature/barkTiles';
import { addTrunks, type TrunkSpec } from './closenature/trunks';
import { addFlora, type CoverReader } from './closenature/flora';
import type { TreeList } from './landscape/trees';
import { addSprigs, type CloseTips, type UnderPlant } from './closenature/sprigs';
import { addEarth } from './closenature/earth';

export interface CloseTreeService {
  closeTrunks: TrunkSpec[];
  closeTips: CloseTips;
  setTrunkSwapped(id: number, on: boolean): void;
  flushTrunks(): void;
}

export default function create(ctx: CityContext): CityModule {
  const stats: Record<string, number | string> = {};
  if (!closeNature(ctx, 'closenature')) return { name: 'closenature', stats: () => stats };
  const veg = ctx.services.vegetation as Partial<CloseTreeService> | undefined;
  const tiles = makeBarkTiles();
  stats.barkMs = Math.round(tiles.ms);
  const specs = veg?.closeTrunks ?? [];
  stats.trunks = specs.length;
  const land = ctx.services.landscape as { treeList?: TreeList | null; closeUnder?: UnderPlant[] | null; closeGround?: { geometry: THREE.BufferGeometry; drop: number } | null } | undefined;
  const updateTrunks = addTrunks(ctx, tiles, specs, veg?.setTrunkSwapped ?? null, veg?.flushTrunks ?? null, land?.treeList ?? null);
  addFlora(ctx, (ctx.services.groundcover as { cover?: CoverReader } | undefined)?.cover ?? null);
  addSprigs(ctx, veg?.closeTips ?? null, land?.closeUnder ?? null);
  if (closeNature(ctx, 'closeearth')) {
    const t0 = performance.now();
    addEarth(ctx, land?.closeGround ?? null);
    stats.earthMs = Math.round(performance.now() - t0);
  }
  return {
    name: 'closenature',
    frame() {
      updateTrunks?.();
    },
    stats: () => stats,
  };
}
