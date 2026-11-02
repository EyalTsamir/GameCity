// Wrong and stretched materials (docs/progress/sweep-materials.md): switches. Each fix is on when the quality tier allows it and its own ?no<name>
// switch is absent; ?nosweepmat turns every one off (before/after).
//   matclass    the close-up layer takes its material from what the mesh says it is, not from a guess at its colour (wood grain on sandstone and steel)
//   matportal   the road tunnel's ring is separate stones with joints, its lamps are fittings

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is fix `name` on regardless of tier (`?no<name>` / `?nosweepmat` off)? */
export function matOn(name: string): boolean {
  return !(params && (params.has('nosweepmat') || params.has('no' + name)));
}

/** is fix `name` on (`?no<name>` / `?nosweepmat` off; below quality tier `min` off)? */
export function matFix(level: QualityLevel, name: string, min: QualityLevel = 'medium'): boolean {
  return matOn(name) && RANK[level] >= RANK[min];
}
