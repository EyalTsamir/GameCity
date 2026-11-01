// Track layout constants and the vertical profile of the line.
//
// The single track runs straight along z = plan.rail.z. On open track the rail head sits
// at RAIL_TOP on a low ballast bed; at the two level crossings the track sinks so the rail
// heads are flush with the (flat) asphalt drawn by the roads module, with smooth ramps.

import type { CityPlan } from '../../core/plan';

/** distance between the two rail centre lines (standard gauge + head width) */
export const GAUGE = 1.5;
/** nominal rail-head height on open track (and at the platform) */
export const RAIL_TOP = 0.3;
/** rail-head height inside a level crossing (flush with the crossing panels) */
export const XING_TOP = 0.062;
/** crossing deck top (rubber/concrete panels) */
export const PANEL_TOP = 0.05;
/** half length (along the track) of the flat crossing deck */
export const XING_HALF = 3.75;
/** ramp length from XING_TOP back up to RAIL_TOP */
export const XING_RAMP = 10.5;
/** rail head → sleeper top */
export const RAIL_H = 0.1;
/** ballast shoulder top below the rail head */
export const BALLAST_DROP = 0.125; // ballast filled almost to the sleeper tops (sleepers 2.5 cm proud)
/** contact wire height above the rail head */
export const WIRE_H = 5.05;
/** distance from track centre line to the train's body side */
export const BODY_HALF = 1.45;

export interface RailProfile {
  z: number;
  x0: number;
  x1: number;
  crossings: number[];
  /** rail-head height at x */
  top(x: number): number;
  /** 0 on open track .. 1 inside a crossing deck */
  sink(x: number): number;
}

function smooth(t: number): number {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

export function makeProfile(plan: CityPlan): RailProfile {
  const xs = plan.rail.crossings.map((c) => c.x);
  const sink = (x: number): number => {
    let s = 0;
    for (const xc of xs) {
      const d = Math.abs(x - xc);
      if (d <= XING_HALF) return 1;
      s = Math.max(s, 1 - smooth((d - XING_HALF) / XING_RAMP));
    }
    return s;
  };
  return {
    z: plan.rail.z,
    x0: plan.rail.x0,
    x1: plan.rail.x1,
    crossings: xs,
    sink,
    top: (x) => RAIL_TOP - (RAIL_TOP - XING_TOP) * sink(x),
  };
}
