// `ctx.services.props` — what the props module exposes to other modules (streetlife: seated café
// patrons and waiters; life: parasols). Plain data, built once at start-up. World metres, Y up.

/** One café chair. A seated figure sits at (x, y, z) facing (sin yaw, cos yaw) — towards its table. */
export interface CafeSeat {
  x: number;
  /** world height of the seat surface */
  y: number;
  z: number;
  /** facing yaw (city convention: a +Z-facing model rotated by yaw faces (sin yaw, cos yaw)) */
  yaw: number;
  /** index into `cafeTables` */
  table: number;
}

/** A bistro table (with 2–4 chairs). */
export interface CafeTable {
  x: number;
  z: number;
  /** world height of the table top (cups, plates go here) */
  y: number;
  /** table-top radius */
  r: number;
  /** a market parasol stands in the middle */
  parasol: boolean;
  /** 'terrace' = outside a shop / tower on a plaza, 'kiosk' = around a coffee kiosk */
  kind: 'terrace' | 'kiosk';
  /** indices into `cafeSeats` */
  seats: number[];
}

export interface PropsService {
  cafeSeats: CafeSeat[];
  cafeTables: CafeTable[];
}

/** chair transform reported by the café kit: seat-top centre and a point 1 m in front of it (world) */
export interface ChairOut {
  sx: number;
  sy: number;
  sz: number;
  fx: number;
  fz: number;
}
