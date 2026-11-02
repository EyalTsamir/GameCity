// Sweep round, people (2026-11, docs/progress/sweep-people.md): hair, hats, arms, hands and clothes at the close level. Each fix is
// on unless its own ?no<name> is present; ?nosweeppeople turns every one off (before/after, perf A/B). Read at boot, never per figure.

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is sweep-people fix `name` on? */
export function sweepPeople(name: string): boolean {
  return !(q && (q.has('nosweeppeople') || q.has('no' + name)));
}
