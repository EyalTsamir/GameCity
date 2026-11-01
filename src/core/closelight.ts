// Light and shadow at walking distance (close-up round 2026-10, docs/progress/close-light.md): switches. Each feature is
// built when the quality tier allows it and its own ?no<name> switch is absent; ?noclosel turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is close-light feature `name` on regardless of tier (`?no<name>` / `?noclosel` off)? */
export function closeLightOn(name: string): boolean {
  return !(params && (params.has('noclosel') || params.has('no' + name)));
}

/** is close-light feature `name` on (`?no<name>` / `?noclosel` off; below quality tier `min` off)? */
export function closeLight(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return closeLightOn(name) && RANK[ctx.quality.level] >= RANK[min];
}
