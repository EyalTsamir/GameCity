// Detail round, streets and ground level (docs/progress/detail-streets.md): switches for the road and pavement as
// built things, street furniture and shop-front life. Each family is built at boot when the quality tier allows it
// and its own ?no<name> switch is absent; ?nostreetdetail turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };

/** is street-detail family `name` on (`?no<name>` / `?nostreetdetail` off; below quality tier `min` off)? */
export function streetDetail(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q && (q.has('nostreetdetail') || q.has('no' + name))) return false;
  return RANK[ctx.quality.level] >= RANK[min];
}
