// The trembling (docs/progress/sweep-flicker.md): switches. Each fix is on when the quality tier allows it and its own ?no<name>
// switch is absent; ?nosweepflicker turns every one off (before/after, scripts/flicker.mjs).

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is fix `name` on regardless of tier (`?no<name>` / `?nosweepflicker` off)? */
export function flickerOn(name: string): boolean {
  return !(params && (params.has('nosweepflicker') || params.has('no' + name)));
}

/** is fix `name` on (`?no<name>` / `?nosweepflicker` off; below quality tier `min` off)? */
export function flickerFix(level: QualityLevel, name: string, min: QualityLevel = 'medium'): boolean {
  return flickerOn(name) && RANK[level] >= RANK[min];
}
