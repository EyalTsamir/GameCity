// Perf-deep round (2026-10, docs/progress/perf-deep.md): switches for the waste hunted in that round. `?noperfdeep`
// turns every switch off (the frame before the round, for A/B), `?no<name>` one change.

export function perfOn(name: string): boolean {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  return !(q && (q.has('noperfdeep') || q.has('no' + name)));
}

/** flat varyings come from a triangle's first vertex (WEBGL_provoking_vertex, set in main.ts before the modules load) */
export const flatConvention = { first: false };
