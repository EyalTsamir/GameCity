// The built cabin of a vehicle's close level (close-up round): what is really behind the glass from a metre away. Seats with
// bolsters and head rests, a dashboard with a hooded binnacle and centre stack, a steering wheel on its column, door cards,
// console, belts, visors, mirror, and a few things people leave in cars (each vehicle its own, part 91+). The same numbers as
// the ray-traced cabin of the farther levels (vehicleMaterial.ts class 2 / 5) and the seated figures (pedestrians/occupants.ts),
// so a driver's hands meet this wheel. Everything goes in as detail class 7: closeGlsl.ts shades it (trim colour per vehicle,
// fabric, the dark of a closed cabin).
//
// Vehicle frame as in models.ts: +Z forward, y up, left = +X (the driver sits on +X).

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** detail mode of a cabin part, what closeGlsl.ts does with its colour */
export const TRIM = { fixed: 0, seat: 1, plastic: 2, liner: 3, carpet: 4, card: 5, moquette: 6 } as const;

export interface CabinPart {
  color: string;
  rough?: number;
  finish?: 'plain' | 'coat' | 'chrome';
  part?: number;
  light?: number;
  trim?: number;
  /** centre of the seat a cushion or back belongs to: the stitching runs from here */
  seat?: readonly [number, number, number];
  decal?: 'cluster' | 'radio';
}
export type CabinAdd = (g: THREE.BufferGeometry, o: CabinPart) => void;

/** the cabin's numbers (Det of the glass, vehicleMaterial.ts) */
export interface CabinDims {
  hw: number;
  belt: number;
  roof: number;
  /** dash front, rear wall, front seat backs, rear seat backs (< rear wall: no bench) */
  zd: number;
  zr: number;
  fz: number;
  rz: number;
}

/** a subdivided box, its edges rounded with radius r, then bent by `fn` (x, y, z in units of the half sizes ±1 → offset in metres) */
export function softBox(
  w: number,
  h: number,
  d: number,
  nx: number,
  ny: number,
  nz: number,
  r: number,
  fn?: (p: THREE.Vector3, u: number, v: number, t: number) => void,
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, d, nx, ny, nz);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const g = mergeVertices(box, 1e-4);
  box.dispose();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const q = new THREE.Vector3();
  const ix = w / 2 - r,
    iy = h / 2 - r,
    iz = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const cx = Math.max(-ix, Math.min(ix, x)),
      cy = Math.max(-iy, Math.min(iy, y)),
      cz = Math.max(-iz, Math.min(iz, z));
    q.set(x - cx, y - cy, z - cz);
    const l = q.length();
    if (l > 1e-5) q.multiplyScalar(r / l);
    q.x += cx;
    q.y += cy;
    q.z += cz;
    if (fn) fn(q, (2 * x) / w, (2 * y) / h, (2 * z) / d);
    pos.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

/** a thin tube between two points */
function rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, n = 6): THREE.BufferGeometry {
  const a = new THREE.Vector3(ax, ay, az),
    b = new THREE.Vector3(bx, by, bz);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, n, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

/** a flat one-sided quad (corners counter-clockwise seen from the side it faces) */
export function flat(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const SEAT: Pick<CabinPart, 'color' | 'rough' | 'trim'> = { color: '#ffffff', rough: 0.95, trim: TRIM.seat };
const PLASTIC: Pick<CabinPart, 'color' | 'rough' | 'trim'> = { color: '#ffffff', rough: 0.72, trim: TRIM.plastic };
const CHROME = { color: '#a9aeb3', rough: 0.35, finish: 'chrome' as const };
const BLACK = { color: '#141517', rough: 0.8 };

/** one front seat: back reclining and bolstered, a dished cushion on a base, a head rest on two posts */
export function frontSeat(add: CabinAdd, cx: number, hw: number, z: number, cy: number, ty: number, hy: number): void {
  const seat = [cx, cy, z] as const;
  const cus = softBox(2 * hw, 0.14, 0.5, 6, 2, 6, 0.05, (p, u, v, t) => {
    // dished between its bolsters, the front edge lifted under the thigh
    p.y += 0.03 * Math.abs(u) ** 3 * (v > 0 ? 1 : 0.3) + 0.018 * Math.max(0, t) ** 2 * (v > 0 ? 1 : 0) - 0.01 * (1 - u * u) * (v > 0 ? 1 : 0);
    p.x *= 1 - 0.06 * Math.max(0, t);
  });
  cus.translate(cx, cy - 0.07, z + 0.24);
  add(cus, { ...SEAT, seat });
  const h = ty - cy + 0.06;
  const back = softBox(2 * hw * 0.98, h, 0.13, 6, 8, 2, 0.052, (p, u, v) => {
    const s = (v + 1) / 2;
    p.x *= 1 - 0.14 * s * s;
    p.z += 0.032 * Math.abs(u) ** 3 - 0.09 * s + 0.012 * Math.sin(s * 3.1);
  });
  back.translate(cx, cy - 0.04 + h / 2, z - 0.055);
  add(back, { ...SEAT, seat });
  // head rest: a soft block, two posts down into the back
  const hrZ = z - 0.09 - 0.04;
  const hr = softBox(0.24, hy - ty - 0.02, 0.09, 3, 3, 2, 0.038, (p, u) => {
    p.z -= 0.012 * u * u;
  });
  hr.translate(cx, ty + 0.03 + (hy - ty - 0.02) / 2, hrZ);
  add(hr, { ...SEAT, seat });
  for (const e of [-1, 1]) add(rod(cx + e * 0.06, ty - 0.03, hrZ + 0.005, cx + e * 0.06, ty + 0.05, hrZ + 0.005, 0.0065), CHROME);
  // base and runners on the floor
  add(softBox(2 * hw * 0.8, 0.09, 0.4, 1, 1, 1, 0.012).translate(cx, cy - 0.185, z + 0.22), BLACK);
}

/** rear bench: cushion, back with a seam per place, two head rests */
function rearBench(add: CabinAdd, hw: number, sx: number, z: number, cy: number, ty: number): void {
  const w = 2 * (hw - 0.03);
  const seat = [sx, cy, z] as const;
  add(
    softBox(w, 0.16, 0.46, 10, 2, 4, 0.055, (p, _u, v, t) => {
      p.y += v > 0 ? 0.016 * Math.cos(p.x * 8) * (1 - t * t) : 0;
    }).translate(0, cy - 0.08, z + 0.22),
    { ...SEAT, seat },
  );
  const h = ty - cy;
  add(
    softBox(w, h, 0.12, 10, 6, 2, 0.05, (p, _u, v) => {
      p.z += -0.08 * ((v + 1) / 2) + 0.01 * Math.cos(p.x * 8);
    }).translate(0, cy - 0.02 + h / 2, z - 0.06),
    { ...SEAT, seat },
  );
  for (const e of [-1, 1]) {
    add(
      softBox(0.22, 0.13, 0.075, 3, 2, 2, 0.03).translate(e * sx, ty + 0.08, z - 0.14),
      { ...SEAT, seat },
    );
    add(rod(e * sx - 0.05, ty - 0.03, z - 0.135, e * sx - 0.05, ty + 0.03, z - 0.135, 0.006), CHROME);
    add(rod(e * sx + 0.05, ty - 0.03, z - 0.135, e * sx + 0.05, ty + 0.03, z - 0.135, 0.006), CHROME);
  }
}

/** dashboard: top to the screen, hooded binnacle over the driver, centre stack, vents, glovebox line, wheel on its column */
function dashboard(add: CabinAdd, c: CabinDims, sx: number, x: number): void {
  const { belt, zd } = c;
  const yT = belt + 0.06,
    y0 = belt - 0.3,
    zb = zd - 0.45;
  const w = 2 * x;
  add(
    softBox(w, yT - y0, zd - zb + 0.02, 8, 4, 3, 0.04, (p, u, v, t) => {
      // the top falls towards the screen, the face rolls under towards the knees
      p.y -= 0.035 * Math.max(0, t) * (v > 0 ? 1 : 0);
      p.z += v < 0 && t < 0 ? 0.05 * (0.5 - v * 0.5) : 0;
      p.y += v > 0 ? 0.008 * (1 - u * u) : 0;
    }).translate(0, (yT + y0) / 2, (zb + zd) / 2),
    PLASTIC,
  );
  // binnacle hood
  add(
    softBox(0.44, 0.1, 0.22, 4, 2, 3, 0.04, (p, u, _v, t) => {
      p.y += -0.02 * u * u + 0.012 * (1 - t * t);
    }).translate(sx, yT + 0.025, zb + 0.05),
    PLASTIC,
  );
  // the dials under it
  add(flat([sx + 0.17, belt - 0.065, zb - 0.002], [sx - 0.17, belt - 0.065, zb - 0.002], [sx - 0.17, belt + 0.055, zb - 0.002], [sx + 0.17, belt + 0.055, zb - 0.002]), { color: '#ffffff', rough: 0.25, finish: 'coat', decal: 'cluster', light: 10 });
  // centre stack: a slab standing proud of the face, with radio, vents and switches
  add(softBox(0.3, 0.38, 0.05, 2, 3, 1, 0.012).translate(0, belt - 0.17, zb - 0.015), PLASTIC);
  add(flat([0.125, belt - 0.27, zb - 0.042], [-0.125, belt - 0.27, zb - 0.042], [-0.125, belt - 0.08, zb - 0.042], [0.125, belt - 0.08, zb - 0.042]), { color: '#ffffff', rough: 0.3, finish: 'coat', decal: 'radio', light: 10 });
  for (const vx of [-0.075, 0.075]) vent(add, vx, belt - 0.015, zb - 0.042, 0.1, 0.06);
  for (const vx of [sx + 0.34, -sx - 0.3]) if (Math.abs(vx) < x - 0.05) vent(add, vx, belt - 0.01, zb - 0.004, 0.12, 0.055);
  // glovebox shut line and catch, on the passenger's side
  const gx = -sx;
  for (const [ax, ay, bx, by] of [[0.2, -0.2, -0.2, -0.2], [0.2, -0.06, -0.2, -0.06], [0.2, -0.2, 0.2, -0.06], [-0.2, -0.2, -0.2, -0.06]] as const) {
    const dx = Math.abs(ax - bx) > 0.01 ? 0 : 0.002,
      dy = Math.abs(ax - bx) > 0.01 ? 0.002 : 0;
    const s = belt;
    add(flat([gx + ax + dx, s + ay - dy, zb - 0.0035], [gx + bx - dx, s + by - dy, zb - 0.0035], [gx + bx - dx, s + by + dy, zb - 0.0035], [gx + ax + dx, s + ay + dy, zb - 0.0035]), BLACK);
  }
  add(softBox(0.07, 0.022, 0.012, 1, 1, 1, 0.004).translate(gx, belt - 0.08, zb - 0.008), PLASTIC);
  // steering wheel, in the plane the driver's hands reach for (occupants.ts: wheel at belt + 0.04, zd − 0.6, hands at ±0.16)
  const wy = belt + 0.04,
    wz = zd - 0.6,
    tilt = 0.32;
  const rim = new THREE.TorusGeometry(0.17, 0.0165, 8, 28);
  rim.rotateX(tilt);
  rim.translate(sx, wy, wz);
  add(rim, { color: '#1a1b1d', rough: 0.68 });
  const hub = softBox(0.14, 0.11, 0.05, 3, 3, 1, 0.022);
  hub.rotateX(tilt);
  hub.translate(sx, wy - 0.008, wz + 0.018);
  add(hub, { color: '#1c1d20', rough: 0.72 });
  // three spokes: to the hub from the rim at 3, 9 and 6 o'clock
  for (const [ex, ey, w2, h2] of [[1, 0, 0.13, 0.038], [-1, 0, 0.13, 0.038], [0, -1, 0.038, 0.11]] as const) {
    const sp = softBox(w2, h2, 0.014, 1, 1, 1, 0.005);
    sp.translate((ex * 0.17) / 1.45, (ey * 0.17) / 1.55, 0.008);
    sp.rotateX(tilt);
    sp.translate(sx, wy, wz);
    add(sp, { color: '#232427', rough: 0.7 });
  }
  add(softBox(0.04, 0.02, 0.004, 1, 1, 1, 0.002).translate(0, 0, 0).rotateX(tilt).translate(sx, wy - 0.008, wz - 0.009), CHROME);
  // column shroud from the hub to the dash, stalks either side
  const ct = Math.tan(tilt);
  add(rod(sx, wy - 0.012, wz + 0.04, sx, wy - 0.012 - ct * (zb - wz), zb + 0.02, 0.042, 10), PLASTIC);
  const sy = wy - 0.03,
    sz = wz + 0.09;
  add(rod(sx + 0.03, sy, sz, sx + 0.14, sy - 0.015, sz - 0.01, 0.007), BLACK);
  add(rod(sx - 0.03, sy, sz, sx - 0.14, sy - 0.015, sz - 0.01, 0.007), BLACK);
}

/** an air vent: a dark surround and slats you could turn */
function vent(add: CabinAdd, x: number, y: number, z: number, w: number, h: number): void {
  add(flat([x + w / 2, y - h / 2, z - 0.001], [x - w / 2, y - h / 2, z - 0.001], [x - w / 2, y + h / 2, z - 0.001], [x + w / 2, y + h / 2, z - 0.001]), { color: '#08090a', rough: 1 });
  for (let k = 0; k < 4; k++) {
    const yy = y - h / 2 + ((k + 0.5) * h) / 4;
    add(flat([x + w / 2 - 0.004, yy - 0.002, z - 0.004], [x - w / 2 + 0.004, yy - 0.002, z - 0.004], [x - w / 2 + 0.004, yy + 0.002, z - 0.002], [x + w / 2 - 0.004, yy + 0.002, z - 0.002]), { color: '#2a2b2e', rough: 0.7 });
  }
}

/** a door's inner furniture on the flank at x (sign s): armrest, pull, handle, speaker, switches */
function doorFurniture(add: CabinAdd, s: number, x: number, belt: number, z0: number, z1: number, windowSwitch: boolean): void {
  const zc = (z0 + z1) / 2,
    len = z1 - z0;
  add(
    softBox(0.075, 0.05, len * 0.62, 1, 2, 3, 0.018, (p, _u, _v, t) => {
      p.y += 0.02 * t;
    }).translate(x - s * 0.03, belt - 0.21, zc - len * 0.08),
    PLASTIC,
  );
  // pull handle over the armrest, the release lever at the front of the door
  add(rod(x - s * 0.03, belt - 0.17, zc + len * 0.1, x - s * 0.03, belt - 0.1, zc + len * 0.2, 0.012), PLASTIC);
  add(softBox(0.018, 0.02, 0.11, 1, 1, 1, 0.006).translate(x - s * 0.012, belt - 0.085, z1 - 0.1), CHROME);
  if (windowSwitch) add(softBox(0.05, 0.012, 0.09, 1, 1, 1, 0.004).translate(x - s * 0.03, belt - 0.178, zc - len * 0.2), BLACK);
  // door pocket and speaker low on the card
  add(softBox(0.04, 0.09, len * 0.55, 1, 1, 1, 0.012).translate(x - s * 0.018, belt - 0.42, zc), PLASTIC);
  const sp = new THREE.CircleGeometry(0.07, 14);
  sp.rotateY((s * -Math.PI) / 2);
  sp.translate(x - s * 0.003, belt - 0.32, z1 - len * 0.22);
  add(sp, { color: '#0d0e10', rough: 1 });
}

/** visors, mirror and the belt hanging down each B pillar */
function overhead(add: CabinAdd, c: CabinDims, sx: number, wsTop: number, yTop: number, pillarX: number, pillarZ: number, lean: number): void {
  for (const e of [1, -1]) {
    add(softBox(0.36, 0.022, 0.16, 2, 1, 2, 0.01).translate(e * sx, yTop - 0.02, wsTop - 0.12), { color: '#ffffff', rough: 1, trim: TRIM.liner });
    // the belt: a webbing strip from the pillar's top down to the sill, a reel cover, a buckle on the seat's inner side
    const bx = e * pillarX;
    const yU = c.belt + 0.36;
    add(rod(bx, c.belt - 0.45, pillarZ, bx - e * lean * 0.75, yU, pillarZ, 0.009, 4).scale(1, 1, 2.4).translate(0, 0, -1.4 * pillarZ), { color: '#1b1b1d', rough: 1 });
    add(softBox(0.02, 0.05, 0.06, 1, 1, 1, 0.008).translate(bx - e * lean * 0.75, yU, pillarZ), BLACK);
    add(softBox(0.03, 0.09, 0.02, 1, 1, 1, 0.006).translate(e * (sx - 0.28), c.belt - 0.3, c.fz + 0.06), BLACK);
  }
  // mirror: a black back, a silver face looking aft, a stem to the screen
  const my = yTop - 0.08,
    mz = wsTop - 0.03;
  add(softBox(0.25, 0.07, 0.028, 3, 1, 1, 0.012).translate(0, my, mz), BLACK);
  add(flat([0.115, my - 0.028, mz - 0.0145], [-0.115, my - 0.028, mz - 0.0145], [-0.115, my + 0.028, mz - 0.0145], [0.115, my + 0.028, mz - 0.0145]), { color: '#aab3bb', rough: 0.15, finish: 'chrome' });
  add(rod(0, my + 0.03, mz + 0.008, 0, yTop + 0.01, mz + 0.05, 0.008), BLACK);
}

/** things people leave in cars, each behind its own hash (part 91 …, thHidden in vehicleMaterial.ts) */
function belongings(add: CabinAdd, c: CabinDims, sx: number, cy: number, floorY: number, yTop: number, wsTop: number, bootY: number, bootZ0: number, bootZ1: number): void {
  const { belt, zd, fz, rz } = c;
  const bench = rz > c.zr;
  // air freshener on the mirror
  add(flat([0.022, yTop - 0.19, wsTop - 0.03], [-0.022, yTop - 0.19, wsTop - 0.03], [-0.022, yTop - 0.135, wsTop - 0.03], [0.022, yTop - 0.135, wsTop - 0.03]), { color: '#2f8f4e', rough: 1, part: 94 });
  add(rod(0, yTop - 0.135, wsTop - 0.03, 0, yTop - 0.115, wsTop - 0.03, 0.001, 3), { color: '#dddddd', rough: 1, part: 94 });
  // a coat left on the passenger seat
  add(
    softBox(0.36, 0.05, 0.4, 3, 1, 3, 0.022, (p, u, _v, t) => {
      p.y += 0.018 * Math.sin(u * 5 + t * 3) + 0.012 * Math.cos(t * 7);
    }).translate(-sx, cy + 0.02, fz + 0.26),
    { color: '#3f4a5c', rough: 1, part: 92 },
  );
  // a paper cup in the holder
  const cup = new THREE.CylinderGeometry(0.038, 0.028, 0.11, 10);
  cup.translate(0.0, cy + 0.14, fz + 0.28);
  add(cup, { color: '#e9e4d6', rough: 0.9, part: 95 });
  // papers and a parking disc on the dash
  add(flat([sx - 0.32, belt + 0.075, zd - 0.28], [sx - 0.54, belt + 0.07, zd - 0.28], [sx - 0.54, belt + 0.058, zd - 0.12], [sx - 0.32, belt + 0.062, zd - 0.12]), { color: '#d9d5c8', rough: 1, part: 96 });
  if (bench) {
    // a cardboard box on the back seat
    add(softBox(0.34, 0.24, 0.28, 1, 1, 1, 0.006).translate(sx * 0.9, cy + 0.12, rz + 0.22), { color: '#a98a5e', rough: 1, part: 91 });
    // a child seat
    add(
      softBox(0.36, 0.2, 0.36, 3, 2, 3, 0.05).translate(-sx, cy + 0.09, rz + 0.2),
      { color: '#343a44', rough: 1, part: 93 },
    );
    add(
      softBox(0.36, 0.42, 0.1, 3, 3, 1, 0.045).translate(-sx, cy + 0.34, rz + 0.06),
      { color: '#343a44', rough: 1, part: 93 },
    );
    // a shopping bag in the foot well
    add(
      softBox(0.26, 0.26, 0.15, 2, 2, 1, 0.03, (p, u) => {
        p.x *= 1 - 0.1 * u;
        p.y += 0.01 * u * u;
      }).translate(sx, floorY + 0.14, rz + 0.62),
      { color: '#d7d3c6', rough: 1, part: 97 },
    );
  }
  // luggage where there is a boot to see into
  if (bootZ1 - bootZ0 > 0.35) {
    const z = (bootZ0 + bootZ1) / 2;
    add(softBox(0.55, 0.26, Math.min(0.42, bootZ1 - bootZ0 - 0.06), 3, 2, 2, 0.05).translate(sx * 0.55, bootY + 0.13, z), { color: '#26313f', rough: 0.8, part: 98 });
    add(softBox(0.42, 0.2, Math.min(0.3, bootZ1 - bootZ0 - 0.06), 2, 2, 2, 0.05).translate(-sx * 0.7, bootY + 0.1, z), { color: '#6a5740', rough: 1, part: 97 });
  }
}

/** floor, tunnel, console between the front seats (a gear lever, a brake lever, cup holders) */
function floorAndConsole(add: CabinAdd, c: CabinDims, x: number, floorY: number, zEnd: number, cy: number, tunnel: boolean): void {
  const { zd, fz } = c;
  add(flat([x, floorY, zEnd], [-x, floorY, zEnd], [-x, floorY, zd], [x, floorY, zd]).scale(1, 1, 1), { color: '#ffffff', rough: 1, trim: TRIM.carpet });
  if (!tunnel) return;
  const z0 = Math.max(zEnd + 0.1, c.rz - 0.1),
    z1 = zd - 0.3;
  add(
    softBox(0.28, 0.2, z1 - z0, 2, 2, 6, 0.06).translate(0, floorY + 0.09, (z0 + z1) / 2),
    { color: '#ffffff', rough: 1, trim: TRIM.carpet },
  );
  // console: from the dash back between the seats, a lid at its end
  const cz0 = fz + 0.02,
    cz1 = zd - 0.43;
  const ct = cy + 0.03;
  add(
    softBox(0.2, ct - floorY - 0.1, cz1 - cz0, 2, 2, 5, 0.022, (p, _u, v, t) => {
      p.y += v > 0 ? -0.05 * Math.max(0, -t) ** 2 + 0.07 * Math.max(0, t) : 0;
    }).translate(0, (ct + floorY + 0.1) / 2, (cz0 + cz1) / 2),
    PLASTIC,
  );
  // gear lever in a gaiter, the brake lever behind it, two cup holders
  const gz = cz0 + (cz1 - cz0) * 0.68;
  const gaiter = new THREE.ConeGeometry(0.045, 0.1, 8, 2);
  gaiter.translate(0, ct + 0.06, gz);
  add(gaiter, { color: '#161719', rough: 1 });
  add(rod(0, ct + 0.09, gz, 0, ct + 0.17, gz + 0.01, 0.009), BLACK);
  add(new THREE.SphereGeometry(0.024, 8, 6).translate(0, ct + 0.185, gz + 0.012), { color: '#1d1e20', rough: 0.45 });
  add(rod(0.035, ct + 0.02, cz0 + 0.1, 0.035, ct + 0.07, cz0 + 0.28, 0.012), BLACK);
  for (const dz of [0, 0.095]) {
    const h = new THREE.CircleGeometry(0.04, 10);
    h.rotateX(-Math.PI / 2);
    h.translate(-0.03, ct + 0.012 + 0.004, cz0 + 0.14 + dz);
    add(h, { color: '#060708', rough: 1 });
  }
}

/** seats, dash, console and everything loose: the part shared by cars and cab vehicles */
function cabinCore(add: CabinAdd, c: CabinDims, o: { pillarX: number; pillarZ: number; wsTop: number; yTop: number; bootY: number; bootZ0: number; bootZ1: number; zEnd: number; tunnel: boolean; doorsF: readonly [number, number]; doorsR?: readonly [number, number]; flankX: number; lean?: number }): void {
  const { hw, belt, roof, fz, rz, zr } = c;
  const floorY = belt - 0.62,
    sx = hw * 0.5,
    shw = Math.min(0.25, hw * 0.45),
    hy = roof - 0.12,
    ty = hy - 0.22,
    cy = belt - 0.36;
  for (const e of [1, -1]) frontSeat(add, e * sx, shw, fz, cy, ty, hy);
  if (rz > zr) rearBench(add, hw, sx, rz, cy, ty - 0.04);
  dashboard(add, c, sx, hw + 0.08);
  floorAndConsole(add, c, hw + 0.1, floorY, o.zEnd, cy, o.tunnel);
  overhead(add, c, sx, o.wsTop, o.yTop, o.pillarX, o.pillarZ, o.lean ?? 0);
  belongings(add, c, sx, cy, floorY, o.yTop, o.wsTop, o.bootY, o.bootZ0, o.bootZ1);
  for (const s of [1, -1]) {
    doorFurniture(add, s, s * o.flankX, belt, o.doorsF[0], o.doorsF[1], true);
    if (o.doorsR) doorFurniture(add, s, s * o.flankX, belt, o.doorsR[0], o.doorsR[1], false);
  }
}

/** the cabin of a lofted car; the liner round it (carBody.ts linerCar) is added by the caller */
export function carCabin(add: CabinAdd, c: CabinDims, o: { W: number; tumble: number; pillarB: number; pillarC?: number; wsTop: number; yTop: number; axR: number; ra: number; rwBase: number; L: number; doors4: boolean }): { zEnd: number } {
  const longTail = o.rwBase < -o.L / 2 + 0.5;
  const bench = c.rz > c.zr;
  const zEnd = longTail ? o.rwBase + 0.08 : bench ? c.rz - 0.14 : c.fz - 0.5;
  // the back of the cabin: a wall up to the shelf (saloon, hatch), or an open boot behind the bench
  const flankX = o.W / 2 - 0.045;
  cabinCore(add, c, {
    pillarX: o.W / 2 - 0.06,
    pillarZ: o.pillarB - 0.02,
    lean: o.tumble,
    wsTop: o.wsTop,
    yTop: c.roof + 0.04,
    bootY: c.belt - 0.34,
    bootZ0: longTail ? zEnd + 0.04 : 0,
    bootZ1: longTail ? c.rz - 0.16 : 0,
    zEnd,
    tunnel: true,
    doorsF: [o.pillarB + 0.04, c.zd - 0.1],
    doorsR: o.doors4 ? [Math.max(o.axR + o.ra + 0.04, (o.pillarC ?? o.pillarB - 0.9) + 0.03), o.pillarB - 0.04] : undefined,
    flankX,
  });
  return { zEnd };
}

/** the cabin of a van, lorry or ice-cream van: seats, dash and box walls below the windows, a bulkhead behind */
export function cabCabin(add: CabinAdd, c: CabinDims, o: { wsTop: number; x: number; liner: (g: THREE.BufferGeometry, trim: number) => void }): void {
  const { belt, roof, zd, zr, fz } = c;
  const x = o.x,
    floorY = belt - 0.62,
    yTop = roof + 0.02;
  cabinCore(add, c, {
    pillarX: x - 0.04,
    pillarZ: fz - 0.02,
    wsTop: o.wsTop,
    yTop,
    bootY: 0,
    bootZ0: 0,
    bootZ1: 0,
    zEnd: zr + 0.02,
    tunnel: false,
    doorsF: [fz + 0.1, zd - 0.2],
    flankX: x - 0.02,
  });
  // walls below the windows, roof, bulkhead (from inside: one-sided, facing in)
  o.liner(flat([x, floorY, zr], [x, floorY, zd], [x, belt, zd], [x, belt, zr]), TRIM.card);
  o.liner(flat([-x, floorY, zd], [-x, floorY, zr], [-x, belt, zr], [-x, belt, zd]), TRIM.card);
  o.liner(flat([x, yTop, zr], [-x, yTop, zr], [-x, yTop, zd], [x, yTop, zd]), TRIM.liner);
  o.liner(flat([-x, floorY, zr + 0.02], [x, floorY, zr + 0.02], [x, yTop, zr + 0.02], [-x, yTop, zr + 0.02]), TRIM.card);
  o.liner(flat([-x, floorY, zd - 0.05], [x, floorY, zd - 0.05], [x, belt, zd - 0.05], [-x, belt, zd - 0.05]).rotateY(Math.PI).translate(0, 0, 2 * (zd - 0.05)), TRIM.plastic);
}

/** a bus saloon: walls and coves round the panes, a ceiling with strip lamps, floor, rows of double seats (the rows and the
 *  doorways occupants.ts seats people in), yellow poles and rails, the driver's place behind a low screen */
export function busCabin(add: CabinAdd, c: CabinDims, W: number): void {
  const { hw, belt, roof, zd, zr, fz } = c;
  const x = W / 2 - 0.05;
  const fy = 0.36;
  const yC = roof;
  const CREAM = { color: '#b9b5a8', rough: 0.75 };
  const zF = zd + 0.1,
    zB = zr - 0.05;
  // floor, ceiling
  add(flat([x, fy, zB], [-x, fy, zB], [-x, fy, zF], [x, fy, zF]), { color: '#44484a', rough: 0.85 });
  add(flat([x, yC, zF], [-x, yC, zF], [-x, yC, zB], [x, yC, zB]), { color: '#c9c7bf', rough: 0.9 });
  for (const e of [-0.56, 0.56]) add(flat([e + 0.05, yC - 0.012, zF - 0.6], [e - 0.05, yC - 0.012, zF - 0.6], [e - 0.05, yC - 0.012, zB + 0.3], [e + 0.05, yC - 0.012, zB + 0.3]), { color: '#fff2d8', rough: 0.5, light: 11 });
  // wall below the windows and the cove above them; the doorways stay open
  const span = (s: number, z0: number, z1: number, y0: number, y1: number, o: CabinPart) => {
    const a = [s * x, y0, s > 0 ? z0 : z1],
      b = [s * x, y0, s > 0 ? z1 : z0],
      cc = [s * x, y1, s > 0 ? z1 : z0],
      d = [s * x, y1, s > 0 ? z0 : z1];
    add(flat(a, b, cc, d), o);
  };
  span(1, zB, zF, fy, belt, CREAM);
  span(-1, zB, -0.34, fy, belt, CREAM);
  span(-1, 0.84, 3.76, fy, belt, CREAM);
  span(-1, 4.94, zF, fy, belt, CREAM);
  span(1, zB, zF, 2.36, yC, { color: '#a9a69c', rough: 0.8 });
  span(-1, zB, zF, 2.42, yC, { color: '#a9a69c', rough: 0.8 });
  // the pillars between the panes
  const pillar = (s: number, z: number, w: number) => span(s, z - w / 2, z + w / 2, belt, 2.42, { color: '#57585a', rough: 0.8 });
  for (let k = 0; k <= 7; k++) pillar(1, -4.95 + k * 1.2857, 0.16);
  pillar(1, 5.12, 0.1);
  for (let k = 0; k <= 3; k++) pillar(-1, -4.95 + k * 1.51, 0.16);
  for (let k = 0; k <= 2; k++) pillar(-1, 0.92 + k * 1.39, 0.16);
  // ends of the saloon: under the rear pane, over it, the bulkhead over the windscreen
  add(flat([-x, fy, zB], [x, fy, zB], [x, 1.95, zB], [-x, 1.95, zB]), CREAM);
  add(flat([-x, 2.67, zB], [x, 2.67, zB], [x, yC, zB], [-x, yC, zB]), CREAM);
  add(flat([x, 2.56, zF], [-x, 2.56, zF], [-x, yC, zF], [x, yC, zF]), { color: '#2a2b2d', rough: 0.9 });
  // rows of double seats; the doorways keep their floor clear
  const cy = belt - 0.42,
    ty = belt + 0.12;
  const M = { color: '#ffffff', rough: 1, trim: TRIM.moquette };
  const STEEL = { color: '#9aa0a4', rough: 0.4, finish: 'chrome' as const };
  const YEL = { color: '#d9a81c', rough: 0.45, finish: 'coat' as const };
  for (let k = 0; k < 11; k++) {
    const z = fz - k * 0.82;
    if (z < zr + 0.5) break;
    for (const e of [1, -1]) {
      if (e < 0 && (Math.abs(z + 0.17 - 0.25) < 0.75 || Math.abs(z + 0.17 - 4.35) < 0.75)) continue;
      for (const m of [0.52, hw * 0.75]) {
        const sx = e * m;
        add(
          softBox(0.42, 0.11, 0.42, 3, 1, 2, 0.04, (p, _u, v, t) => {
            p.y += v > 0 ? 0.012 * Math.max(0, t) : 0;
          }).translate(sx, cy - 0.055, z + 0.2),
          M,
        );
        add(
          softBox(0.42, ty - cy + 0.1, 0.075, 3, 3, 1, 0.032, (p, _u, v) => {
            p.z -= 0.05 * ((v + 1) / 2);
          }).translate(sx, (cy - 0.05 + ty + 0.05) / 2, z - 0.015),
          M,
        );
      }
      const inner = e * 0.3,
        outer = e * (hw - 0.03);
      // a shell behind the backs, a grab rail along the top, one pedestal to the floor, a bracket to the wall
      add(softBox(0.88, ty - cy + 0.06, 0.018, 2, 1, 1, 0.008).translate(e * ((0.52 + hw * 0.75) / 2), (cy - 0.06 + ty + 0.02) / 2, z - 0.058), { color: '#6b7075', rough: 0.7 });
      add(rod(inner, ty + 0.1, z - 0.05, e * (hw - 0.06), ty + 0.1, z - 0.05, 0.012), YEL);
      add(rod(inner + e * 0.16, fy, z + 0.2, inner + e * 0.16, cy - 0.1, z + 0.2, 0.024), STEEL);
      add(rod(inner + e * 0.16, cy - 0.12, z + 0.2, outer, cy - 0.12, z + 0.2, 0.012), STEEL);
    }
  }
  // poles and rails down the aisle; a red stop button on every other pole
  for (let k = 0; k < 6; k++) {
    const z = fz + 0.2 - k * 1.64;
    for (const e of [0.34, -0.34]) {
      if (z < zr + 0.4) continue;
      add(rod(e, fy, z, e, yC - 0.01, z, 0.016), YEL);
      if (k % 2 === 0) add(softBox(0.05, 0.075, 0.04, 1, 1, 1, 0.012).translate(e, 1.42, z), { color: '#c93a28', rough: 0.5 });
    }
  }
  for (const e of [0.34, -0.34]) add(rod(e, 2.1, zr + 0.3, e, 2.1, zd - 1.5, 0.014), YEL);
  // rails beside the doorways
  for (const dz of [0.25, 4.35]) {
    for (const s of [-0.62, 0.62]) add(rod(-x + 0.04, 0.9, dz + s, -x + 0.3, 1.5, dz + s, 0.015), YEL);
    // the step's yellow nosing on the floor
    add(flat([-x + 0.2, fy + 0.004, dz - 0.58], [-x, fy + 0.004, dz - 0.58], [-x, fy + 0.004, dz + 0.58], [-x + 0.2, fy + 0.004, dz + 0.58]), { color: '#c39a1c', rough: 0.9 });
  }
  // the driver's place: dash across the front, a wheel lying nearly flat, the seat on its pedestal, a low screen behind
  const dz = zd - 0.95,
    wx = hw - 0.62;
  frontSeat(add, wx, 0.25, dz - 0.22, belt - 0.24, belt + 0.32, belt + 0.54);
  add(
    softBox(2 * x - 0.04, 0.72, 0.5, 6, 2, 2, 0.05, (p, _u, v, t) => {
      p.y -= 0.05 * Math.max(0, -t) * (v > 0 ? 1 : 0);
    }).translate(0, 0.86, zd - 0.12),
    { color: '#2c2e31', rough: 0.75 },
  );
  const rim = new THREE.TorusGeometry(0.2, 0.017, 8, 26);
  rim.rotateX(1.05);
  rim.translate(wx, belt - 0.02, zd - 0.42);
  add(rim, { color: '#17181a', rough: 0.68 });
  add(rod(wx, belt - 0.03, zd - 0.42, wx, 0.92, zd - 0.28, 0.035), { color: '#1d1e20', rough: 0.8 });
  add(softBox(0.1, 0.05, 0.1, 1, 1, 1, 0.015).rotateX(1.05).translate(wx, belt - 0.02, zd - 0.42), { color: '#1d1e20', rough: 0.8 });
  add(softBox(1.05, 0.95, 0.03, 1, 1, 1, 0.01).translate(wx - 0.02, fy + 0.72, dz - 0.46), { color: '#7d8287', rough: 0.6 });
  add(softBox(0.24, 0.3, 0.2, 1, 1, 1, 0.02).translate(wx - 0.62, 1.22, dz + 0.12), { color: '#25272a', rough: 0.6 });
  add(rod(wx - 0.62, 1.05, dz + 0.12, wx - 0.62, fy, dz + 0.12, 0.02), STEEL);
}
