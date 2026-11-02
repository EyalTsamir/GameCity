// No naked shapes (docs/progress/sweep-shape.md): switches. Each fix is on when the quality tier allows it and its own ?no<name>
// switch is absent; ?nosweepshape turns every one off (before/after).

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is fix `name` on regardless of tier (`?no<name>` / `?nosweepshape` off)? */
export function shapeOn(name: string): boolean {
  return !(params && (params.has('nosweepshape') || params.has('no' + name)));
}

/** is fix `name` on (`?no<name>` / `?nosweepshape` off; below quality tier `min` off)? */
export function shapeFix(level: QualityLevel, name: string, min: QualityLevel = 'medium'): boolean {
  return shapeOn(name) && RANK[level] >= RANK[min];
}
