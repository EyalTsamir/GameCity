// Plain bugs from the city sweep (docs/progress/sweep-bugs.md): switches. Each fix is on unless its own ?no<name> switch is present;
// ?nosweepbugs turns every one off (before/after).

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is fix `name` on (`?no<name>` / `?nosweepbugs` off)? */
export function bugOn(name: string): boolean {
  return !(params && (params.has('nosweepbugs') || params.has('no' + name)));
}
