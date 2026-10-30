// Detail round, people and vehicles (2026-10, docs/progress/detail-people.md): switches. Each feature is on when
// the quality tier allows it and its own ?no<name> switch is absent; ?nodetailpeople turns every one off
// (before/after, perf A/B). Read at boot or from hot paths through a cached flag, never per figure.

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is detail-people feature `name` on? (`level` omitted: no tier check) */
export function detailPeople(name: string, level?: QualityLevel, min: QualityLevel = 'low'): boolean {
  if (q && (q.has('nodetailpeople') || q.has('no' + name))) return false;
  return level === undefined || RANK[level] >= RANK[min];
}
