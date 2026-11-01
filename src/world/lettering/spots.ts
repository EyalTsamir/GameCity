// Where street furniture has room for lettering: the kits note their printed faces here as they are built (a frame in the
// world), the lettering module writes on them. Plain data, and nothing else is kept of the kits.

import * as THREE from 'three';

export interface PropSpot {
  kind: 'notice' | 'bill' | 'timetable' | 'stopflag' | 'cover' | 'placard' | 'mailplate' | 'mailcrest' | 'plaque' | 'cablabel' | 'cabwarn' | 'signplate' | 'adpanel' | 'binlabel' | 'aboard' | 'pricecard' | 'bellplate' | 'wallsign';
  /** world position of the lower left corner */
  x: number;
  y: number;
  z: number;
  /** world unit vectors of the width and height */
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  w: number;
  h: number;
  seed: number;
  /** a second facet: a bill folded round a column */
  part?: number;
  word?: string;
}

export const propSpots: PropSpot[] = [];

const _o = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

/** the rectangle centred at (cx, cy) on the plane z of a shaper's current frame, facing its +Z */
export function markProp(sh: { world(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 }, kind: PropSpot['kind'], cx: number, cy: number, z: number, w: number, h: number, seed: number, part?: number, word?: string): void {
  sh.world(cx - w / 2, cy - h / 2, z, _o);
  sh.world(cx + w / 2, cy - h / 2, z, _r).sub(_o).normalize();
  sh.world(cx - w / 2, cy + h / 2, z, _u).sub(_o).normalize();
  propSpots.push({ kind, x: _o.x, y: _o.y, z: _o.z, rx: _r.x, ry: _r.y, rz: _r.z, ux: _u.x, uy: _u.y, uz: _u.z, w, h, seed, part, word });
}
