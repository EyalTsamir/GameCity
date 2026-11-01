// Detail round, buildings (docs/progress/detail-buildings.md): switches for what this round adds. Each family is built
// at boot when the quality tier allows it and its own ?no<name> switch is absent; ?nodetailb turns all of them off
// (before / after, perf A/B). Generators have no ctx, so the switches live here and buildings.ts sets them at boot.

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };

let params: URLSearchParams = new URLSearchParams();
let level: QualityLevel = 'high';

export function setDetailB(p: URLSearchParams, q: QualityLevel): void {
  params = p;
  level = q;
}

/** is detail family `name` on (`?no<name>` / `?nodetailb` off; below quality tier `min` off)? */
export function dB(name: string, min: QualityLevel = 'medium'): boolean {
  if (params.has('nodetailb') || params.has('no' + name)) return false;
  return RANK[level] >= RANK[min];
}
