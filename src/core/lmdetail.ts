// Detail round, landmarks and harbour (2026-10-31, docs/progress/detail-landmarks.md): one switch per family, in the
// style of core/boxhunt.ts. Each feature is built at boot when the quality tier allows it and its own ?no<name> switch
// is absent; ?nolmdetail turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };

/** is landmarks-detail feature `name` on (`?no<name>` / `?nolmdetail` off; below quality tier `min` off)? */
export function lmDetail(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q && (q.has('nolmdetail') || q.has('no' + name))) return false;
  return RANK[ctx.quality.level] >= RANK[min];
}
