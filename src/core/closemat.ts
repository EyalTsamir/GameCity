// Close-up materials (close round 2026-10, docs/progress/close-materials.md): what every surface looks like from a metre
// away. Switches for each family of surfaces. Each is built when the quality tier allows it and its own ?no<name> switch
// is absent; ?noclosemat turns all of them off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is close material `name` on (`?no<name>` / `?noclosemat` off; below quality tier `min` off)? */
export function closeMat(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return !(params && (params.has('noclosemat') || params.has('no' + name))) && RANK[ctx.quality.level] >= RANK[min];
}
