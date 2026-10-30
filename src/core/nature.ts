// Nature and the horizon (detail round 2026-10, docs/progress/detail-nature.md): switches for the farmland, country
// tree, coast and skyline features. Each one is built when the quality tier allows it and its own ?no<name> switch is
// absent; ?nonature turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is nature feature `name` on regardless of tier (`?no<name>` / `?nonature` off)? Build-time, also for three-free data. */
export function natureOn(name: string): boolean {
  return !(params && (params.has('nonature') || params.has('no' + name)));
}

/** is nature feature `name` on (`?no<name>` / `?nonature` off; below quality tier `min` off)? */
export function nature(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return natureOn(name) && RANK[ctx.quality.level] >= RANK[min];
}
