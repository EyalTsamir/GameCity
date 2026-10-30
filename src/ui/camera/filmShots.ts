// The opening film's shot list (data only; ./film.ts plays it). Made for the default seed: ?seed=… skips the film.
//
// A shot is a camera spline through keys (`at` = seconds into the shot; eye and look are world points; `fov` is the
// vertical lens in degrees, `focus` the lens focus distance in metres, default = eye → look). The clock glides from
// hours[0] to hours[1] over the shot and across the `dip` (seconds of fade through black) in front of it.
// Paths are checked against the buildings by FilmDirector.check() (ui-test step `film`).

export type V3 = readonly [number, number, number];

export interface FilmKey {
  at: number;
  eye: V3;
  look: V3;
  fov: number;
  focus?: number;
}

export interface FilmShot {
  id: string;
  dur: number;
  hours: readonly [number, number];
  keys: readonly FilmKey[];
  /** fade through black in front of this shot (s, half before the cut, half after); 0 = continues the previous take */
  dip: number;
  /** lower-third place name */
  caption?: string;
  /** aperture f-number (default 1.6): lower = a stronger focus pull */
  lens?: number;
  /** the camera eases to rest at the last key (the end of the film) */
  settle?: boolean;
}

/** when the booked regional train stops at the platform (film seconds): its head passes the platform camera ~13 s before */
export const TRAIN_STOPS_AT = 63;
/** it runs eastwards: the platform camera looks west at its headlights */
export const TRAIN_DIR: 1 | -1 = 1;

export const SHOTS: readonly FilmShot[] = [
  {
    // dawn: in from the open sea, low over the water, the sun at our backs and the town waking up ahead
    id: 'dawn-sea',
    dur: 14,
    dip: 0,
    hours: [6.55, 7.0],
    keys: [
      { at: 0, eye: [1040, 58, -560], look: [140, 18, -70], fov: 28 },
      { at: 7, eye: [600, 36, -330], look: [135, 16, -72], fov: 30 },
      { at: 14, eye: [270, 20, -150], look: [128, 14, -78], fov: 36 },
    ],
  },
  {
    // the same take: down the moored cargo ship's flank, past her stern, in under the gantry cranes
    id: 'harbour',
    dur: 12,
    dip: 0,
    hours: [7.0, 7.5],
    caption: 'The harbour',
    keys: [
      { at: 0, eye: [270, 20, -150], look: [128, 14, -78], fov: 36 },
      { at: 5, eye: [186, 12, -86], look: [146, 10, -74], fov: 40 },
      { at: 9, eye: [170, 13, -44], look: [146, 11, -80], fov: 42 },
      { at: 12, eye: [124, 13, -36], look: [150, 12, -92], fov: 44 },
    ],
  },
  {
    // morning at eye level: from the avenue's pavement through the gatehouse arch into the old-town square
    id: 'archway',
    dur: 9,
    dip: 0.9,
    hours: [9.3, 9.8],
    caption: 'Old Town',
    lens: 1.2,
    keys: [
      { at: 0, eye: [83.7, 1.7, -13.4], look: [83.7, 2.2, -30], fov: 48, focus: 8 },
      { at: 4.5, eye: [83.7, 1.7, -22], look: [83.7, 2.0, -38], fov: 48, focus: 8 },
      { at: 9, eye: [83.7, 1.75, -31], look: [83.7, 2.2, -46], fov: 48, focus: 11 },
    ],
  },
  {
    // noon: the market from above the awnings, craning down between the stalls
    id: 'market',
    dur: 10,
    dip: 0.9,
    hours: [11.7, 12.4],
    caption: 'The market, noon',
    keys: [
      { at: 0, eye: [23.5, 9, 65.5], look: [27.5, 1.2, 78.5], fov: 42 },
      { at: 5, eye: [25, 6.2, 67], look: [28, 1.4, 79], fov: 42 },
      { at: 10, eye: [27, 3.4, 68.5], look: [28.5, 1.5, 79.5], fov: 44 },
    ],
  },
  {
    // the platform: the regional pulls in past the lens, the focus pulling from down the line to the cars
    id: 'platform',
    dur: 13,
    dip: 0.9,
    hours: [14.6, 15.4],
    caption: 'Central Station',
    lens: 1.2,
    keys: [
      { at: 0, eye: [-18, 2.55, -150.4], look: [-70, 2.4, -155], fov: 38, focus: 30 },
      { at: 6, eye: [-19, 2.55, -150.4], look: [-60, 2.4, -155], fov: 38, focus: 12 },
      { at: 13, eye: [-20.5, 2.55, -150.6], look: [-40, 2.4, -156.5], fov: 42, focus: 5 },
    ],
  },
  {
    // golden hour: low over the river, into the sun, under the footbridge
    id: 'quay',
    dur: 12,
    dip: 0.9,
    hours: [18.3, 18.8],
    caption: 'The river, golden hour',
    keys: [
      { at: 0, eye: [-62, 0.4, 119], look: [-110, 1.5, 117], fov: 44 },
      { at: 6, eye: [-80, 0.2, 118.6], look: [-125, 2, 117.5], fov: 44 },
      { at: 12, eye: [-100, 0.5, 118], look: [-150, 3, 118], fov: 44 },
    ],
  },
  {
    // blue hour: the churchyard as the candles and lanterns come on…
    id: 'churchyard',
    dur: 8,
    dip: 0.9,
    hours: [19.2, 19.9],
    caption: 'St Mary’s churchyard, blue hour',
    keys: [
      { at: 0, eye: [78.2, 3.1, 80.6], look: [85, 1.2, 72.3], fov: 46 },
      { at: 8, eye: [79.4, 3.4, 78.6], look: [85, 1.8, 72], fov: 46 },
    ],
  },
  {
    // …then one long crane up out of the walls and away over the lit town: the night overview
    id: 'night-rise',
    dur: 17,
    dip: 0,
    hours: [19.9, 21.2],
    settle: true,
    keys: [
      { at: 0, eye: [79.4, 3.4, 78.6], look: [85, 1.8, 72], fov: 46 },
      { at: 4, eye: [79, 20, 79], look: [86, 10, 66], fov: 44 },
      { at: 9, eye: [130, 75, 190], look: [50, 10, 20], fov: 38 },
      { at: 17, eye: [335, 150, 520], look: [-5, 0, -15], fov: 34 },
    ],
  },
];
