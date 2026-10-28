// W5 distance cut for fine street-object detail (lamp-post kit, signal/sign fixings, tree guards): the payload is
// bucketed into coarse world cells (one mesh per non-empty cell) and a cell is drawn only while the camera is within
// `cut` metres of its rectangle (plus the usual frustum test of the owner). At eye level that leaves 1–3 cells per
// owner in view instead of the whole city's detail; from the overview none.
//   const cells = new NearCells(() => new Kit(...));  cells.at(x, z) → the payload of that cell
//   for (const c of cells.list()) { mesh = build(c.item); gate: () => nearCell(ctx.camera, c) }

import type * as THREE from 'three';

/** cell size (m) and default draw distance (m from the camera to the cell rectangle) */
export const NEAR_CELL = 48;
export const NEAR_CUT = 30;

/** ?nonearcut: draw every cell (A/B of the distance cut) */
const NEAR_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nonearcut');

export interface NearCell<T> {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  item: T;
}

export class NearCells<T> {
  private readonly map = new Map<number, NearCell<T>>();
  constructor(
    private readonly make: () => T,
    readonly size = NEAR_CELL,
  ) {}
  at(x: number, z: number): T {
    const i = Math.floor(x / this.size),
      j = Math.floor(z / this.size);
    const key = (i + 512) * 1024 + (j + 512);
    let c = this.map.get(key);
    if (!c) this.map.set(key, (c = { x0: i * this.size, z0: j * this.size, x1: (i + 1) * this.size, z1: (j + 1) * this.size, item: this.make() }));
    return c.item;
  }
  list(): NearCell<T>[] {
    return [...this.map.values()];
  }
}

/** true while the camera is within `cut` m of the cell rectangle (height above the ground counts too) */
export function nearCell(cam: THREE.Camera, c: { x0: number; z0: number; x1: number; z1: number }, cut = NEAR_CUT): boolean {
  if (NEAR_OFF) return true;
  const p = cam.position;
  const dx = Math.max(c.x0 - p.x, 0, p.x - c.x1),
    dz = Math.max(c.z0 - p.z, 0, p.z - c.z1);
  const dy = Math.max(0, p.y - 4);
  return dx * dx + dz * dz + dy * dy < cut * cut;
}
