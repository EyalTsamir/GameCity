// Depth behind every window (close round 2026-11, docs/progress/close-windows.md). Switches of the near-only rooms: each is on when
// the quality tier allows it and its own ?no<name> switch is absent; ?noclosewin turns all of them off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is `name` on (`?no<name>` / `?noclosewin` off; below quality tier `min` off)? */
export function closeWin(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return !(params && (params.has('noclosewin') || params.has('no' + name))) && RANK[ctx.quality.level] >= RANK[min];
}
