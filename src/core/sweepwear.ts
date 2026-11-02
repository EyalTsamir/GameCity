// Cracks and stains (docs/progress/sweep-wear.md): switches. Each fix is on when the quality tier allows it and its own ?no<name>
// switch is absent; ?nosweepwear turns every one off (before/after).
//   wearcrack   cracks that fork and thin out, a shadow side, no black line at a distance (close-up layer)
//   wearpave    pavement cracks that wander, stains with no outline (the paving's own shader)
//   wearquay    harbour stains and wet patches soak into the concrete instead of lying on it as cut-outs
//   wearwall    drips and rust on the stonework of quay and cutting run down the wall instead of being opaque quads on it
//   wearrock    rock: fractures along the bedding that die out, no black contour lines
//   wearrust    rust is rust-coloured, runs down from where it starts, not on every lap and screw
//   wearhand    hand-height stains broken by the surface, no polygon edge; what drips off a wall unit is a stain, not a dark strip
//   weartag     spray tags are letters from a can, not one clean stroke

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is fix `name` on regardless of tier (`?no<name>` / `?nosweepwear` off)? */
export function wearOn(name: string): boolean {
  return !(params && (params.has('nosweepwear') || params.has('no' + name)));
}

/** is fix `name` on (`?no<name>` / `?nosweepwear` off; below quality tier `min` off)? */
export function wearFix(level: QualityLevel, name: string, min: QualityLevel = 'medium'): boolean {
  return wearOn(name) && RANK[level] >= RANK[min];
}

/** a stain down a wall from something another module fixed there (`wearhand`): queued in ctx.services.wallStains, drawn by handheight */
export interface WallStain {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  y0: number;
  y1: number;
  /** half width */
  w: number;
  ink: number;
}
