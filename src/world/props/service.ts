// `ctx.services.props` — what the props module exposes to other modules (streetlife: seated café
// patrons and waiters, keep-clear discs; life: barbecue smoke, rotary-dryer laundry). Plain data,
// built once at start-up. World metres, Y up. Yaw: city convention (a +Z-facing model rotated by yaw
// faces (sin yaw, cos yaw)).

/** One café chair: a seated figure sits on (x, seatY, z) facing `yaw` (towards its table). */
export interface CafeSeat {
  /** chair centre (seat-top centre) */
  x: number;
  z: number;
  /** direction the sitter faces (towards the table) */
  yaw: number;
  /** world height of the seat surface */
  seatY: number;
}

/** A bistro table with its 2–4 chairs. */
export interface Cafe {
  x: number;
  z: number;
  /** table (terrace) orientation */
  yaw: number;
  /** world height of the table top (cups / plates go here) */
  tableY: number;
  /** table-top radius */
  tableR: number;
  seats: CafeSeat[];
  /** a market parasol stands in the middle */
  parasol: boolean;
  /**
   * 'plaza' = terrace outside shops / towers on a plaza, 'kiosk' = round a coffee kiosk, 'station' = station
   * forecourt, 'sidewalk' = two-seat bistro table in the kerbside furniture band in front of a café / bakery
   */
  source: 'plaza' | 'kiosk' | 'station' | 'sidewalk';
}

/** Garden barbecue: smoke starts at the grill top. */
export interface Bbq {
  x: number;
  y: number;
  z: number;
}

/**
 * Rotary washing dryer: the four arms end at world (x + cos(yaw0 + k·π/2)·R, z + sin(yaw0 + k·π/2)·R),
 * k = 0..3; washing lines run as two squares between the arm ends (radius R and 0.65·R) at height H.
 */
export interface RotaryDryer {
  x: number;
  y: number;
  z: number;
  yaw0: number;
  R: number;
  /** world height of the lines */
  H: number;
}

export interface PropsService {
  cafes: Cafe[];
  /** keep-clear discs of every placed item (lamps, benches, slot furniture, scatter, garden items) */
  discs: { x: number; z: number; r: number }[];
  bbqs: Bbq[];
  washing: RotaryDryer[];
  /** straight washing lines between two posts (W6 back yard): life hangs animated laundry on them */
  lines: { ax: number; ay: number; az: number; bx: number; by: number; bz: number }[];
  /** W6 dense places (centres, for views / stats) */
  places?: import('./places').PlacesInfo;
  /**
   * Show / hide the static laundry on the rotary dryers (a separate small mesh). Life calls
   * setStaticLaundry(false) once its animated cloth hangs on `washing`, so there is never a bare state.
   */
  setStaticLaundry(on: boolean): void;
}

/** chair transform reported by the café kit: seat-top centre and a point 1 m in front of it (world) */
export interface ChairOut {
  sx: number;
  sy: number;
  sz: number;
  fx: number;
  fz: number;
}
