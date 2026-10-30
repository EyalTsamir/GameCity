// Geometry hunt (2026-10, docs/progress/geometry-hunt.md): switches for the round that looks only at shape —
// triangles nobody can see removed, crude silhouettes improved. `?nogeomhunt` turns every switch off (the old
// geometry, for before/after and triangle / perf A/B), `?no<name>` one family. Pure bug fixes are always on.

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };

/** the same switch for builders without a context (no quality tier) */
export function geomOn(name: string): boolean {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  return !(q && (q.has('nogeomhunt') || q.has('no' + name)));
}

/** is geometry-hunt feature `name` on (`?no<name>` / `?nogeomhunt` off; below quality tier `min` off)? */
export function geomHunt(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'low'): boolean {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q && (q.has('nogeomhunt') || q.has('no' + name))) return false;
  return RANK[ctx.quality.level] >= RANK[min];
}
