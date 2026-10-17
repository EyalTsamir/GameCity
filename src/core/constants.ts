// Physical dimensions of the miniature world. Units are metres "in-world"
// (a car is ~4.3 m long, a person ~1.75 m tall). Y is up.

/** Width of one traffic lane. Roads are two-lane, two-way (right-hand traffic). */
export const LANE_W = 3.5;
/** Half-width of the asphalt carriageway (centre line to curb). */
export const ROAD_HALF = 3.5;
/** Sidewalk width (curb to block edge). */
export const SIDEWALK_W = 3.0;
/** Road centre line to block edge. */
export const CORRIDOR_HALF = ROAD_HALF + SIDEWALK_W; // 6.5
/** Lateral offset of a lane centre from the road centre line. */
export const LANE_OFFSET = LANE_W / 2; // 1.75

/** Height of the asphalt surface. */
export const ROAD_Y = 0.0;
/** Top of sidewalks / curbs. */
export const SIDEWALK_Y = 0.15;
/** Natural ground / lots / parks / plazas inside blocks. Buildings stand on this. */
export const GROUND_Y = 0.0;

/** Crosswalk zebra spans [CROSSWALK_IN, CROSSWALK_OUT] from the intersection centre along each arm. */
export const CROSSWALK_IN = 4.0;
export const CROSSWALK_OUT = 7.0;
/** Vehicles stop with their nose at this distance from the intersection centre. */
export const STOPLINE = 7.5;

/** The pedestrian walking band is the inner part of the sidewalk (next to the block edge). */
export const WALK_BAND = 2.2;
/** Street furniture (lamps, trees, benches…) lives in the curb-side band. */
export const FURN_BAND = SIDEWALK_W - WALK_BAND; // 0.8
/** Offset from the road centre line to the centre of the walking band. */
export const WALK_OFFSET = CORRIDOR_HALF - WALK_BAND / 2; // 5.4
/** Offset from the road centre line to the centre of the furniture band. */
export const FURN_OFFSET = ROAD_HALF + FURN_BAND / 2; // 3.9

export const WATER_LEVEL = -1.6;

/** The diorama slab (the finite piece of world on the plinth). */
export const SLAB = { x0: -200, x1: 200, z0: -190, z1: 150 } as const;
/** Depth of the soil cross-section below ground level. */
export const SLAB_BOTTOM = -16;

/** N-S road centre lines (constant x). */
export const XS = [-165, -110, -55, 0, 55, 110] as const;
/** E-W road centre lines (constant z). */
export const ZS = [-120, -65, -10, 45, 100] as const;

/** Rail track centre line z (straight section) and its extent. */
export const RAIL_Z = -155;
/** Sea: harbour quay wall line (north part) and beach (south part). */
export const QUAY_X = 136;
/** River channel (E-W), south of the southern ring road. */
export const RIVER = { z0: 110, z1: 126, bedY: -3.6 } as const;

export const SPEED_LIMIT = 11; // m/s in town (~40 km/h)
export const SPEED_LIMIT_FAST = 13.5; // tunnel approach roads

/** Default simulation: one in-game hour lasts this many real seconds at 1x. */
export const SECONDS_PER_GAME_HOUR = 40;

export const CITY_NAME = 'Tinyhaven';
