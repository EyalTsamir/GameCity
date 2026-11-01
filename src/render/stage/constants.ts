// Shared numbers of the studio set (kept free of three.js / world imports so the sky module
// can use them before the terrain module exists).

import { SLAB_BOTTOM } from '../../core/constants';

/** world y of the plinth's underside = the table top (see world/terrain/slab.ts PLINTH.bottom) */
export const PLINTH_BOTTOM_Y = SLAB_BOTTOM - 6.6;
