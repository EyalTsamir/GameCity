// Box hunt (2026-10, docs/progress/box-hunt.md): switches for the "de-boxing" round — objects that still read as
// a box with a triangle on top rebuilt with their real parts. Each feature is built at boot when the quality tier
// allows it and its own ?no<name> switch is absent; ?noboxhunt turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };

/** is box-hunt feature `name` on (`?no<name>` / `?noboxhunt` off; below quality tier `min` off)? */
export function boxHunt(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q && (q.has('noboxhunt') || q.has('no' + name))) return false;
  return RANK[ctx.quality.level] >= RANK[min];
}
