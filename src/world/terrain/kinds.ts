// Shared constants for the masonry shader (aMas.x) and quay-wall ladder spots.

export const KIND = { plain: 0, ashlar: 1, coping: 2, rock: 3, dark: 4, lamp: 5, cliff: 6 } as const;

export interface LadderSpot {
  x: number;
  z: number;
  /** outward (water) normal of the wall face */
  nx: number;
  nz: number;
  top: number;
}
