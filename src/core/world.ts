// Presentation mode of the city.
//
//   'world'   (default) — the city is a place in a landscape that continues to the horizon: no slab,
//              plinth, table or cyclorama; real sky and aerial perspective; natural lens optics.
//   'diorama' (?diorama) — the original tabletop model: soil slab on a wooden plinth on an oak table,
//              cyclorama backdrop, tilt-shift DOF. Kept as an optional view and as the A/B baseline.
//
// Modules read DIORAMA once at creation (switching mode = reload with/without ?diorama).

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

export const DIORAMA: boolean = params.has('diorama');
export const WORLD_MODE: boolean = !DIORAMA;
