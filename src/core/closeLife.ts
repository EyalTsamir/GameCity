// Small life up close (close-up round 2026-11, docs/progress/close-life.md): switches for the birds, cats, gestures,
// dogs, leaves and paper that live only around the camera. Each one is built when the quality tier allows it and its
// own ?no<name> switch is absent; ?nosmalllife turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is small-life feature `name` on regardless of tier (`?no<name>` / `?nosmalllife` off)? Build-time, also for three-free data. */
export function closeLifeOn(name: string): boolean {
  return !(params && (params.has('nosmalllife') || params.has('no' + name)));
}

/** is small-life feature `name` on (`?no<name>` / `?nosmalllife` off; below quality tier `min` off)? */
export function closeLife(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return closeLifeOn(name) && RANK[ctx.quality.level] >= RANK[min];
}
