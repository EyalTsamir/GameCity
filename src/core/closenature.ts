// Nature when you stand in it (close round 2026-11, docs/progress/close-nature.md): switches for trunks, fallen leaves,
// flowers, lawn, soil, weeds and the rest. Each one is built when the quality tier allows it and its own ?no<name> switch is
// absent; ?noclosenature turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is close nature feature `name` on regardless of tier (`?no<name>` / `?noclosenature` off)? For what is built before the tier matters. */
export function closeNatureOn(name: string): boolean {
  return !(params && (params.has('noclosenature') || params.has('no' + name)));
}

/** is close nature feature `name` on (`?no<name>` / `?noclosenature` off; below quality tier `min` off)? */
export function closeNature(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return closeNatureOn(name) && RANK[ctx.quality.level] >= RANK[min];
}
