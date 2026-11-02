// White where it should not be (docs/progress/sweep-white.md): switches. Each fix is on unless its own ?no<name> switch is present;
// ?nosweepwhite turns every one off (before/after).

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is fix `name` on (`?no<name>` / `?nosweepwhite` off)? */
export function whiteOn(name: string): boolean {
  return !(params && (params.has('nosweepwhite') || params.has('no' + name)));
}
