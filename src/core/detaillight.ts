// Detail round, light / sky / water (docs/progress/detail-light.md): switches in the style of core/boxhunt.ts. Each feature
// is on when the quality tier allows it and its own ?no<name> switch is absent; ?nodetaillight turns every one off
// (before/after, perf A/B).

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };

/** is feature `name` on (`?no<name>` / `?nodetaillight` absent)? */
export function detailOn(name: string): boolean {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  return !(q && (q.has('nodetaillight') || q.has('no' + name)));
}

/** is feature `name` on, on this quality tier (below `min` off)? */
export function detailLight(ctx: { quality: { level: QualityLevel } }, name: string, min: QualityLevel = 'medium'): boolean {
  return detailOn(name) && RANK[ctx.quality.level] >= RANK[min];
}
