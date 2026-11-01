// The close level of the rolling stock (close-up round): the parts that replace or add to a car's far model when it stands beside
// the camera. Three geometries per car type: `body` (outside, casts shadows), `inner` (the saloon and cab behind real openings, no
// shadow caster) and `glass` (the panes, a blended pass of their own). trainModels.ts assembles them through CloseHooks; only the few
// cars beside the camera ever draw any of this (trainRender.ts), and the city-wide program does not grow (closeGlsl.ts).
//
// Car frame as in trainModels.ts: +Z = model front, y up, rail head at y = 0, floor 1.13, ceiling 3.2, inner walls |x| = 1.36: the
// numbers of the ray-traced saloon the farther levels show (trainMaterial.ts trInterior), and of the seated passengers
// (pedestrians/occupants.ts seatCar: x ±0.62 / ±1.06, seat backs on the z = k·1.9 planes, facing away from them).

import * as THREE from 'three';
import { softBox, frontSeat, type CabinAdd } from '../traffic/cabin';
import { Geo, type V3 } from './geo';
import { T } from './tags';
import { FIN, MODE } from './closeGlsl';

export const FL = 1.13;
export const CE = 3.2;
export const WX = 1.36;

// ───────────────────────────────────────────── small helpers

/** a BufferGeometry (softBox, …) written into a Geo with its current kind, colour and extra */
export function addBG(g: Geo, bg: THREE.BufferGeometry): void {
  const pos = bg.attributes.position,
    nor = bg.attributes.normal;
  const base = g.vertexCount;
  for (let i = 0; i < pos.count; i++) g.vert(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
  if (bg.index) for (let i = 0; i < bg.index.count; i++) g.I.push(base + bg.index.getX(i));
  else for (let i = 0; i < pos.count; i++) g.I.push(base + i);
  bg.dispose();
}

/** quad facing the side of hint h, whatever the order of its corners */
function oq(g: Geo, a: V3, b: V3, c: V3, d: V3, h: V3): void {
  g.quadFacing(a, b, c, d, h);
}

/** a strip of quads between two contours with one normal per point; closed: back round to the first */
function strip(g: Geo, A: V3[], B: V3[], N: V3[], closed: boolean): void {
  const base = g.vertexCount;
  for (let i = 0; i < A.length; i++) {
    g.vert(A[i][0], A[i][1], A[i][2], N[i][0], N[i][1], N[i][2]);
    g.vert(B[i][0], B[i][1], B[i][2], N[i][0], N[i][1], N[i][2]);
  }
  const n = A.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n;
    const a0 = base + i * 2, a1 = a0 + 1, b0 = base + j * 2, b1 = b0 + 1;
    const ux = B[i][0] - A[i][0], uy = B[i][1] - A[i][1], uz = B[i][2] - A[i][2];
    const vx = A[j][0] - A[i][0], vy = A[j][1] - A[i][1], vz = A[j][2] - A[i][2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * N[i][0] + cy * N[i][1] + cz * N[i][2] >= 0) g.I.push(a0, a1, b1, a0, b1, b0);
    else g.I.push(a0, b1, a1, a0, b0, b1);
  }
}

/** surface of revolution round the local x axis through (cy, cz): prof = [x, r] in order, outward on the left of the travel (see
 *  below); side −1 mirrors it in x. Written with the frame's transforms, so a turned frame gives other axes. */
function rev(g: Geo, side: number, cy: number, cz: number, prof: [number, number][], seg: number): void {
  const p = side > 0 ? prof : prof.map(([x, r]) => [-x, r] as [number, number]).reverse();
  for (let k = 0; k < p.length - 1; k++) {
    const [x0, r0] = p[k], [x1, r1] = p[k + 1];
    const dx = x1 - x0, dr = r1 - r0;
    const l = Math.hypot(dx, dr) || 1;
    const nx = dr / l, nr = -dx / l;
    const base = g.vertexCount;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      g.vert(x0, cy + r0 * c, cz + r0 * s, nx, nr * c, nr * s);
      g.vert(x1, cy + r1 * c, cz + r1 * s, nx, nr * c, nr * s);
    }
    for (let i = 0; i < seg; i++) {
      const a0 = base + i * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
      g.I.push(a0, a1, b1, a0, b1, b0);
    }
  }
}

/** a helical spring standing on y0 */
function coil(g: Geo, cx: number, y0: number, cz: number, R: number, rw: number, h: number, turns: number, segT = 9, sides = 5): void {
  const n = Math.round(turns * segT);
  const base = g.vertexCount;
  for (let i = 0; i <= n; i++) {
    const a = (i / segT) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const yc = y0 + rw + ((h - 2 * rw) * i) / n;
    for (let b = 0; b <= sides; b++) {
      const t = (b / sides) * Math.PI * 2;
      const cb = Math.cos(t), sb = Math.sin(t);
      const nx = cb * ca, ny = sb, nz = cb * sa;
      g.vert(cx + R * ca + rw * nx, yc + rw * ny, cz + R * sa + rw * nz, nx, ny, nz);
    }
  }
  const row = sides + 1;
  for (let i = 0; i < n; i++)
    for (let b = 0; b < sides; b++) {
      const a0 = base + i * row + b, a1 = a0 + 1, d0 = a0 + row, d1 = a1 + row;
      g.I.push(a0, a1, d1, a0, d1, d0);
    }
}

/** a cable or hose hanging between two points */
function hose(g: Geo, a: V3, b: V3, sag: number, r: number, n = 5, sides = 4): void {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    g.rod(prev, q, r, sides);
    prev = q;
  }
}

const steel = (g: Geo, fin: number, color: string): Geo => g.kind(T.STEEL).extra(fin, 0, 0, 0).color(color);

// ───────────────────────────────────────────── running gear

/** one wheelset as it left the lathe: hub, dished web, rim, tread, flange; a brake disc bolted to the web (or none on block-braked
 *  stock), nuts on the hub. All T.WHEEL, so it all turns; closeGlsl.ts finds the tread, the web and the disc by radius. */
function closeWheelset(g: Geo, z: number, r: number, disc: boolean, gaugeHalf = 0.717): void {
  const seg = 36;
  g.kind(T.WHEEL).extra(r, z, 0, 0);
  const xo = gaugeHalf + 0.065, xi = gaugeHalf - 0.065;
  for (const side of [-1, 1]) {
    // hub boss and axle end
    g.color('#34312e');
    rev(g, side, r, z, [[xo + 0.05, 0.001], [xo + 0.05, 0.075], [xo + 0.016, 0.1], [xo + 0.012, 0.155], [xo - 0.02, 0.19]], seg);
    // web, dished in from the hub to the rim
    g.color('#5e564f');
    rev(g, side, r, z, [[xo - 0.02, 0.19], [xo - 0.044, r * 0.62], [xo - 0.026, r * 0.8], [xo - 0.004, r * 0.87]], seg);
    // rim face and the chamfer to the tread
    g.color('#3d3935');
    rev(g, side, r, z, [[xo - 0.004, r * 0.87], [xo, r * 0.95], [xo - 0.004, r * 0.985]], seg);
    // tread, coned, polished where it runs
    g.color('#8e8b86');
    rev(g, side, r, z, [[xo - 0.004, r * 0.985], [xi + 0.02, r]], seg);
    // the flange, and the back of the rim down to the axle
    g.color('#3a3632');
    rev(g, side, r, z, [[xi + 0.02, r], [xi + 0.012, r + 0.004], [xi + 0.003, r + 0.03], [xi - 0.01, r + 0.03], [xi - 0.016, r * 0.93], [xi - 0.024, r * 0.6], [xi - 0.024, 0.09]], seg);
    // nuts round the hub (they make the turning read)
    g.color('#6d6a65');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const y = r + Math.cos(a) * 0.128, zz = z + Math.sin(a) * 0.128;
      g.rod([side * (xo + 0.012), y, zz], [side * (xo + 0.028), y, zz], 0.012, 6, 1);
    }
    if (disc) {
      // a brake disc on the wheel: the friction ring proud of the web, slots through it, a ring of bolts
      g.color('#7c7670');
      rev(g, side, r, z, [[xo - 0.01, r * 0.5], [xo + 0.012, r * 0.52], [xo + 0.012, r * 0.82], [xo - 0.012, r * 0.84]], seg);
      g.color('#3f3b37');
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const y = r + Math.cos(a) * r * 0.57, zz = z + Math.sin(a) * r * 0.57;
        g.rod([side * (xo + 0.012), y, zz], [side * (xo + 0.022), y, zz], 0.0095, 5, 1);
      }
    }
  }
  // the axle with a machined seat at each wheel
  g.color('#2b2724');
  g.rod([-xi + 0.024, r, z], [xi - 0.024, r, z], 0.075, 10);
  g.extra(0, 0, 0, 0);
}

/**
 * A bogie seen from a metre: welded frame with flanges and stiffeners, axle boxes with covers and bolts, real helical springs, air
 * springs in rubber bellows (or coil nests on the heavy kinds), brake gear at every wheel, dampers with bright rods, an anti-roll bar,
 * cables and sand pipes. Same outline and numbers as the far bogie() in trainModels.ts.
 */
export function closeBogie(g: Geo, z: number, r: number, wheelbase: number, heavy = false, bodyY = 0.95, coiled = heavy): void {
  const disc = !heavy && !coiled;
  for (const dz of [-wheelbase / 2, wheelbase / 2]) closeWheelset(g, z + dz, r, disc);
  const fx = 0.93,
    hw = wheelbase / 2,
    len = wheelbase + (heavy ? 1.1 : 0.9),
    yHi = r + 0.17,
    yLo = r - 0.03,
    fh = heavy ? 0.3 : 0.24;
  const paint = '#23262a',
    edge = '#2b2e32';
  for (const s of [-1, 1]) {
    const x = s * fx;
    const web = 0.09,
      fw = 0.2,
      ft = 0.016;
    const part = (ax: number, ay: number, az: number, by: number, bz: number) => {
      steel(g, FIN.paint, paint);
      g.beam([ax, ay, az], [ax, by, bz], web, fh - 2 * ft);
      // flanges top and bottom, standing proud of the web: this edge is what reads as a fabricated frame
      g.color(edge);
      g.beam([ax, ay + fh / 2 - ft / 2, az], [ax, by + fh / 2 - ft / 2, bz], fw, ft);
      g.beam([ax, ay - fh / 2 + ft / 2, az], [ax, by - fh / 2 + ft / 2, bz], fw, ft);
    };
    part(x, yHi, z - len / 2, yHi, z - hw + 0.28);
    part(x, yHi, z - hw + 0.26, yLo, z - 0.42);
    part(x, yLo, z - 0.44, yLo, z + 0.44);
    part(x, yLo, z + 0.42, yHi, z + hw - 0.26);
    part(x, yHi, z + hw - 0.28, yHi, z + len / 2);
    // stiffeners welded across the web, the end plate of each arm
    g.color(edge);
    for (const dz of [-0.38, -0.13, 0.13, 0.38]) g.box(x + s * 0.03, yLo, z + dz, 0.07, fh - 0.04, 0.012, 0);
    // a lightening hole in the web either side of the middle: a ring welded round a dark oval
    for (const dz of [-0.255, 0.255]) {
      const xw = x + s * (web / 2 + 0.002);
      g.push().at(xw, yLo, z + dz).rotZ(s > 0 ? -Math.PI / 2 : Math.PI / 2);
      steel(g, FIN.paint, edge);
      g.cyl(0, 0, 0, 0.062, 0.058, 0.006, 14, 1);
      steel(g, FIN.grease, '#0a0a0b');
      g.cyl(0, 0.006, 0, 0.046, 0.046, 0.0005, 14, 1);
      g.pop();
    }
    for (const e of [-1, 1]) {
      g.box(x, yHi, z + e * (len / 2), fw, fh, 0.014, 0);
      g.box(x + s * 0.03, yHi, z + e * (len / 2 - 0.25), 0.07, fh - 0.04, 0.012, 0);
    }
    for (const dz of [-hw, hw]) {
      const zb = z + dz;
      const out = dz > 0 ? 1 : -1;
      // axle box: body, a cover with six bolts, the rocker arm up into the frame
      steel(g, FIN.cast, '#454a4e');
      g.rod([s * (fx - 0.12), r, zb], [s * (fx + 0.09), r, zb], 0.13, 16, 1);
      g.color('#50565a');
      g.rod([s * (fx + 0.09), r, zb], [s * (fx + 0.13), r, zb], 0.102, 14, 1);
      g.color('#64696d');
      g.rod([s * (fx + 0.13), r, zb], [s * (fx + 0.14), r, zb], 0.06, 10, 1);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        g.color(k === 1 ? '#caa42a' : '#26292b'); // one nut carries the fitter's paint mark
        g.rod([s * (fx + 0.13), r + Math.cos(a) * 0.082, zb + Math.sin(a) * 0.082], [s * (fx + 0.142), r + Math.cos(a) * 0.082, zb + Math.sin(a) * 0.082], 0.0115, 6, 1);
      }
      steel(g, FIN.paint, paint);
      g.beam([x, r + 0.1, zb - out * 0.05], [x, yHi - 0.02, zb - out * 0.3], 0.1, 0.09);
      // the wet of an old oil leak under the cover
      steel(g, FIN.grease, '#1a1a19');
      g.box(s * (fx + 0.112), r - 0.09, zb, 0.012, 0.09, 0.05, 0);
      // twin primary springs: real coils on seats, with a rubber stop in the middle
      for (const k of [-1, 1]) {
        const zs = zb + k * 0.2;
        const y0 = r + 0.03,
          h = yHi - fh / 2 - y0 + 0.01;
        steel(g, FIN.paint, '#2d4a3d');
        coil(g, x, y0, zs, 0.052, 0.013, h, 3.6);
        steel(g, FIN.rubber, '#17181a');
        g.cyl(x, y0 + 0.02, zs, 0.026, 0.026, h - 0.05, 8, 0);
        steel(g, FIN.cast, '#3e4347');
        g.cyl(x, y0 - 0.012, zs, 0.074, 0.074, 0.014, 12, 1);
      }
      if (disc) {
        // disc brake: caliper over the friction ring on the side towards the bogie centre, its actuator, a hose
        const zc = zb - out * (r * 0.66);
        steel(g, FIN.cast, '#2c2f31');
        g.box(s * 0.845, r + 0.02, zc, 0.12, 0.27, 0.13, 0);
        steel(g, FIN.cast, '#3a3e41');
        g.rod([s * 0.79, r + 0.1, zc], [s * 0.61, r + 0.1, zc], 0.055, 10, 1);
        steel(g, FIN.bright, '#a7aaad');
        g.rod([s * 0.61, r + 0.1, zc], [s * 0.57, r + 0.1, zc], 0.016, 6);
        steel(g, FIN.rubber, '#141517');
        hose(g, [s * 0.68, r + 0.15, zc], [x, yLo + fh / 2 + 0.03, z + out * 0.3], 0.06, 0.0095);
      } else {
        // block brake: a shoe on the tread, the hanger and a pull rod
        const zc = zb - out * (r + 0.05);
        steel(g, FIN.cast, '#2a2d30');
        g.box(s * 0.72, r + 0.03, zc, 0.12, 0.3, 0.07, 0);
        g.color('#3a3e41');
        g.beam([s * 0.72, r + 0.18, zc - out * 0.02], [s * 0.72, yHi + 0.02, zc - out * 0.1], 0.04, 0.03);
        g.beam([s * 0.6, r - 0.06, zc - out * 0.03], [s * 0.6, r - 0.03, z], 0.03, 0.03);
      }
      // sand pipe ahead of the wheel on the leading axles' outside; the speed sensor's cable into the cover
      steel(g, FIN.rubber, '#1b1c1e');
      hose(g, [x, yHi - fh / 2, zb + out * 0.32], [s * 0.74, 0.1, zb + out * (r + 0.05)], -0.02, 0.012, 4);
      hose(g, [s * (fx + 0.142), r + 0.03, zb], [x + s * 0.08, yHi + 0.02, zb - out * 0.34], 0.07, 0.009, 5);
    }
    // secondary suspension up to the body
    if (coiled) {
      for (const k of [-1, 1]) {
        steel(g, FIN.paint, '#3b4f45');
        coil(g, s * 1.0, yLo + fh / 2, z + k * 0.22, 0.078, 0.022, bodyY - yLo - fh / 2, 3.2, 9, 5);
        steel(g, FIN.cast, '#3e4347');
        g.cyl(s * 1.0, yLo + fh / 2 - 0.01, z + k * 0.22, 0.115, 0.115, 0.016, 12, 1);
        g.cyl(s * 1.0, bodyY - 0.02, z + k * 0.22, 0.115, 0.115, 0.016, 12, 1);
      }
    } else {
      // air spring: a rubber bellows with two bulges between a steel piston and a top plate
      const y0 = yLo + fh / 2,
        H = bodyY - y0 - 0.02,
        n = 10;
      steel(g, FIN.cast, '#2f3234');
      g.cyl(s * 1.0, y0, z, 0.17, 0.17, 0.03, 16, 1);
      steel(g, FIN.rubber, '#17181a');
      for (let k = 0; k < n; k++) {
        const b = (t: number) => 0.215 + 0.022 * Math.abs(Math.sin(t * Math.PI * 2));
        g.cyl(s * 1.0, y0 + 0.03 + (k / n) * (H - 0.03), z, b(k / n), b((k + 1) / n), (H - 0.03) / n, 16, 0);
      }
      steel(g, FIN.cast, '#2b2d30');
      g.cyl(s * 1.0, bodyY - 0.05, z, 0.2, 0.2, 0.03, 16, 1);
    }
    // vertical damper: dark body, dust boot, a bright rod, an eye at each end
    const d0: V3 = [s * 1.12, yLo - 0.02, z + 0.55],
      d1: V3 = [s * 1.12, yLo + 0.26, z + 0.59],
      d2: V3 = [s * 1.12, bodyY - 0.02, z + 0.63];
    steel(g, FIN.paint, '#18191b');
    g.rod(d0, d1, 0.04, 10, 1);
    steel(g, FIN.bright, '#c4c8cb');
    g.rod(d1, d2, 0.016, 8);
    steel(g, FIN.cast, '#2c2f31');
    g.rod([d0[0] - 0.03, d0[1], d0[2]], [d0[0] + 0.03, d0[1], d0[2]], 0.024, 8, 1);
    g.rod([d2[0] - 0.03, d2[1], d2[2]], [d2[0] + 0.03, d2[1], d2[2]], 0.024, 8, 1);
    // yaw damper from the frame's end towards the body
    const y0: V3 = [s * 1.08, yHi + 0.05, z - len / 2 + 0.15],
      y1: V3 = [s * 1.08, bodyY - 0.12, z - len / 2 - 0.45];
    steel(g, FIN.paint, '#18191b');
    g.rod(y0, [(y0[0] + y1[0]) / 2, (y0[1] + y1[1]) / 2, (y0[2] + y1[2]) / 2], 0.036, 10, 1);
    steel(g, FIN.bright, '#b9bdc0');
    g.rod([(y0[0] + y1[0]) / 2, (y0[1] + y1[1]) / 2, (y0[2] + y1[2]) / 2], y1, 0.015, 6);
    // the anti-roll link
    steel(g, FIN.cast, '#3a3e41');
    g.rod([s * 0.78, yLo + 0.02, z - 0.62], [s * 0.78, bodyY - 0.03, z - 0.62], 0.016, 6);
  }
  // transom: two tubes across, the pivot block between them
  steel(g, FIN.paint, paint);
  for (const dz of [-0.3, 0.3]) g.rod([-fx, yLo + 0.02, z + dz], [fx, yLo + 0.02, z + dz], 0.085, 12);
  steel(g, FIN.cast, '#3b3f42');
  g.box(0, yLo + 0.04, z, 0.55, 0.26, 0.38, 0);
  // traction links
  g.color('#2c2f31');
  for (const e of [-1, 1]) g.beam([e * 0.22, yLo + 0.08, z], [e * 0.45, yLo + 0.1, z + 0.5], 0.05, 0.05);
  // anti-roll bar
  g.color('#3a3e41');
  g.rod([-0.78, yLo + 0.02, z - 0.62], [0.78, yLo + 0.02, z - 0.62], 0.024, 8);
  // motors with their fins and gearboxes (the heavy kinds, and one in two axles of the EMU)
  if (heavy || disc) {
    for (const dz of [-hw + 0.55, hw - 0.55]) {
      if (!heavy && dz < 0) continue;
      steel(g, FIN.cast, '#3a3f43');
      g.rod([-0.48, r + 0.03, z + dz], [0.48, r + 0.03, z + dz], heavy ? 0.24 : 0.2, 16, 1);
      g.color('#2b2e31');
      for (let k = -4; k <= 4; k++) g.rod([k * 0.1 - 0.01, r + 0.03, z + dz], [k * 0.1 + 0.01, r + 0.03, z + dz], (heavy ? 0.24 : 0.2) + 0.012, 16, 0);
      g.color('#34383b');
      g.box(0.5, r + 0.0, z + dz + (dz > 0 ? 0.22 : -0.22), 0.14, 0.34, 0.5, 0);
    }
  }
  // earth return brush on one axle end
  steel(g, FIN.cast, '#4a4f53');
  g.box(fx + 0.17, r, z - hw, 0.05, 0.1, 0.1, 0);
  steel(g, FIN.rubber, '#231a10');
  hose(g, [fx + 0.19, r + 0.04, z - hw], [fx + 0.12, yHi + 0.02, z - hw + 0.4], 0.05, 0.012, 5);
}

// ───────────────────────────────────────────── doors

/** double-leaf plug door with thickness: a panel round a real window on the outside, a lined panel on the inside, rubber noses that meet
 *  in the door line, a track above and a guide below; a real opening behind it in body and lining (closeSaloon sets the jambs).
 *  Tags slide as the far level's do (aExtra = 0, 0, leaf, side). */
export function closeDoors(g: Geo, glass: Geo, z: number, color: string): void {
  const w = 0.66,
    y0 = 1.13,
    y1 = 3.12;
  const X = 1.468;
  for (const side of [-1, 1] as const) {
    for (const leaf of [-1, 1] as const) {
      const za = leaf < 0 ? z - w : z + 0.005,
        zb = leaf < 0 ? z - 0.005 : z + w;
      const wa = za + 0.12,
        wb = zb - 0.12,
        wy0 = 2.2,
        wy1 = 2.95;
      g.extra(0, 0, leaf, side);
      const xo = side * (X + 0.006),
        xi = side * 1.44;
      // outside face round the window
      g.kind(T.DOOR).color(color);
      const out = (ya: number, yb: number, zaa: number, zbb: number) => oq(g, [xo, ya, zaa], [xo, ya, zbb], [xo, yb, zbb], [xo, yb, zaa], [side, 0, 0]);
      out(y0, wy0 - 0.03, za, zb);
      out(wy1 + 0.03, y1, za, zb);
      out(wy0 - 0.03, wy1 + 0.03, za, wa - 0.03);
      out(wy0 - 0.03, wy1 + 0.03, wb + 0.03, zb);
      // inside face, lined
      g.kind(T.LEAF).color('#a9a79d');
      const ins = (ya: number, yb: number, zaa: number, zbb: number) => oq(g, [xi, ya, zaa], [xi, ya, zbb], [xi, yb, zbb], [xi, yb, zaa], [-side, 0, 0]);
      ins(y0, wy0 - 0.03, za, zb);
      ins(wy1 + 0.03, y1, za, zb);
      ins(wy0 - 0.03, wy1 + 0.03, za, wa - 0.03);
      ins(wy0 - 0.03, wy1 + 0.03, wb + 0.03, zb);
      // the yellow band up the meeting edge, inside, and the handle pull
      g.color('#d9a81c');
      const mz = leaf < 0 ? zb - 0.05 : za,
        mz1 = leaf < 0 ? zb : za + 0.05;
      oq(g, [xi - side * 0.001, y0, mz], [xi - side * 0.001, y0, mz1], [xi - side * 0.001, y1, mz1], [xi - side * 0.001, y1, mz], [-side, 0, 0]);
      g.color('#6e7174');
      const hz = leaf < 0 ? zb - 0.14 : za + 0.14;
      g.rod([xi - side * 0.03, 1.72, hz], [xi - side * 0.03, 2.08, hz], 0.012, 6);
      g.rod([xi - side * 0.03, 1.72, hz], [xi, 1.72, hz], 0.008, 4);
      g.rod([xi - side * 0.03, 2.08, hz], [xi, 2.08, hz], 0.008, 4);
      // the window: rubber gasket proud of the panel, a reveal back through the leaf; the pane sits in the middle
      g.kind(T.DOOR).color('#121416');
      const gx = side * (X + 0.008);
      const gm = 0.03;
      oq(g, [gx, wy0 - gm, wa - gm], [gx, wy0 - gm, wb + gm], [gx, wy0, wb + gm], [gx, wy0, wa - gm], [side, 0, 0]);
      oq(g, [gx, wy1, wa - gm], [gx, wy1, wb + gm], [gx, wy1 + gm, wb + gm], [gx, wy1 + gm, wa - gm], [side, 0, 0]);
      oq(g, [gx, wy0, wa - gm], [gx, wy0, wa], [gx, wy1, wa], [gx, wy1, wa - gm], [side, 0, 0]);
      oq(g, [gx, wy0, wb], [gx, wy0, wb + gm], [gx, wy1, wb + gm], [gx, wy1, wb], [side, 0, 0]);
      // reveal round the opening, seen from either side
      oq(g, [gx, wy0, wa], [gx, wy0, wb], [xi, wy0, wb], [xi, wy0, wa], [0, 1, 0]);
      oq(g, [gx, wy1, wa], [gx, wy1, wb], [xi, wy1, wb], [xi, wy1, wa], [0, -1, 0]);
      oq(g, [gx, wy0, wa], [gx, wy1, wa], [xi, wy1, wa], [xi, wy0, wa], [0, 0, 1]);
      oq(g, [gx, wy0, wb], [gx, wy1, wb], [xi, wy1, wb], [xi, wy0, wb], [0, 0, -1]);
      // the pane
      glass.kind(T.DOORWIN).color('#26323b').extra(0, 0, leaf, side);
      const px = side * 1.458;
      oq(glass, [px, wy0, wa], [px, wy0, wb], [px, wy1, wb], [px, wy1, wa], [side, 0, 0]);
      // the rubber nose on the meeting edge, a thin seal on the outer one, the leaf's edges top and bottom
      g.kind(T.DOOR).color('#0f1012');
      const nz = leaf < 0 ? zb - 0.012 : za + 0.012;
      g.rod([xo + side * 0.002, y0 + 0.01, nz], [xo + side * 0.002, y1 - 0.01, nz], 0.016, 7);
      oq(g, [xi, y0, leaf < 0 ? zb : za], [xo, y0, leaf < 0 ? zb : za], [xo, y1, leaf < 0 ? zb : za], [xi, y1, leaf < 0 ? zb : za], [0, 0, -leaf]);
      const oz = leaf < 0 ? za : zb;
      oq(g, [xi, y0, oz], [xo, y0, oz], [xo, y1, oz], [xi, y1, oz], [0, 0, leaf]);
      oq(g, [xi, y1, za], [xo, y1, za], [xo, y1, zb], [xi, y1, zb], [0, 1, 0]);
      oq(g, [xi, y0, za], [xo, y0, za], [xo, y0, zb], [xi, y0, zb], [0, -1, 0]);
      const xs = side * (X + 0.009);
      oq(g, [xs, y0, oz - leaf * 0.015], [xs, y0, oz], [xs, y1, oz], [xs, y1, oz - leaf * 0.015], [side, 0, 0]);
      oq(g, [xs, y0, za], [xs, y0, zb], [xs, y0 + 0.02, zb], [xs, y0 + 0.02, za], [side, 0, 0]);
      // a grab recess, the passenger button with a ring lit green once the doors are released
      g.color('#2b2f33');
      const rz0 = leaf < 0 ? zb - 0.09 : za + 0.05,
        rz1 = leaf < 0 ? zb - 0.05 : za + 0.09;
      oq(g, [xs + side * 0.001, 1.75, rz0], [xs + side * 0.001, 1.75, rz1], [xs + side * 0.001, 2.0, rz1], [xs + side * 0.001, 2.0, rz0], [side, 0, 0]);
      if (leaf > 0) {
        const bz = za + 0.16;
        const ring = (r: number, off: number) => {
          const pts: V3[] = [];
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2 * -side;
            pts.push([side * (X + off), 2.05 + r * Math.sin(a), bz + r * Math.cos(a)]);
          }
          g.fan(pts, [side, 0, 0]);
        };
        g.kind(T.DOORBTN).color('#1c1e20');
        ring(0.056, 0.0105);
        g.color('#2fa84f');
        ring(0.042, 0.012);
        g.color('#cfd3d6');
        ring(0.028, 0.0135);
      }
      g.extra(0, 0, 0, 0);
    }
    // the portal: a dark frame round the opening, the release button by it
    g.kind(T.PLAIN).color('#1a1c1f');
    const pf = side * (X + 0.003);
    oq(g, [pf, y0, z - w - 0.06], [pf, y0, z - w], [pf, y1 + 0.05, z - w], [pf, y1 + 0.05, z - w - 0.06], [side, 0, 0]);
    oq(g, [pf, y0, z + w], [pf, y0, z + w + 0.06], [pf, y1 + 0.05, z + w + 0.06], [pf, y1 + 0.05, z + w], [side, 0, 0]);
    oq(g, [pf, y1, z - w], [pf, y1, z + w], [pf, y1 + 0.05, z + w], [pf, y1 + 0.05, z - w], [side, 0, 0]);
    g.color('#2fa84f');
    oq(g, [side * (X + 0.004), 1.95, z + w + 0.012], [side * (X + 0.004), 1.95, z + w + 0.05], [side * (X + 0.004), 2.03, z + w + 0.05], [side * (X + 0.004), 2.03, z + w + 0.012], [side, 0, 0]);
    // the track over the door and the guide under it, each as long as the door's whole travel
    g.color('#2a2d30');
    g.box(side * 1.482, 3.185, z, 0.022, 0.035, 2.62, 0);
    g.color('#34373a');
    g.box(side * 1.47, 1.1, z, 0.03, 0.03, 2.62, 0);
    // door step and threshold, chequer plate
    steel(g, FIN.bright, '#7a7e80');
    g.box(side * 1.41, 1.075, z, 0.12, 0.05, w * 2 + 0.04, 8);
    g.kind(T.PLAIN).color('#d9a81c');
    g.box(side * 1.466, 1.1, z, 0.015, 0.012, w * 2, 0);
    g.extra(0, 0, 0, 0);
  }
}

// ───────────────────────────────────────────── lamps

/** the moulded plate a pair of lamps sits on: edges that catch the light, four screws */
export function closeLampPlate(g: Geo, x: number, y: number, z: number, w: number, h: number): void {
  g.kind(T.PLAIN).extra(0, 0, 0, 0).color('#1b1d1f');
  addBG(g, softBox(w, h, 0.034, 2, 1, 1, 0.013).translate(x, y, z));
  g.color('#4a4d50');
  for (const ex of [-1, 1]) for (const ey of [-1, 1]) g.rod([x + ex * (w / 2 - 0.022), y + ey * (h / 2 - 0.022), z + 0.015], [x + ex * (w / 2 - 0.022), y + ey * (h / 2 - 0.022), z + 0.021], 0.0065, 6, 1);
}

/** a lamp with a domed clear cover in a chrome bezel, facing +Z. T.HEAD / T.TAIL with aExtra = (centre, radius): closeGlsl.ts draws
 *  what is behind the cover by a ray from the eye, so the bowl and the bulb move against the cover as you walk past. */
export function closeLamp(g: Geo, tag: number, x: number, y: number, z: number, r: number): void {
  // bezel: a turned ring, set proud of the panel
  g.push().at(x, y, z).rotY(-Math.PI / 2);
  steel(g, FIN.bright, '#8d9194');
  rev(g, 1, 0, 0, [[0.016, r * 1.0], [0.028, r * 1.04], [0.03, r * 1.12], [0.012, r * 1.26], [0.002, r * 1.26]], 24);
  // the cover: a shallow dome
  g.kind(tag).color(tag === T.TAIL ? '#6a1712' : '#b9c0c5').extra(x, y, z + 0.016, r);
  rev(g, 1, 0, 0, [[0.03, 0.001], [0.029, r * 0.35], [0.026, r * 0.7], [0.016, r]], 24);
  g.extra(0, 0, 0, 0);
  g.pop();
}

// ───────────────────────────────────────────── the saloon

const inner = (g: Geo, mode: number, color: string, a = 0, cab = 0): Geo => g.kind(T.INNER).extra(mode, a, 0, cab).color(color);

/** the wall inside one side, pierced like the outside: columns, strips and fillets round the openings */
function liner(g: Geo, side: number, x: number, z0: number, z1: number, y0: number, y1: number, wins: [number, number][], wy0: number, wy1: number, rrect: RRect, cab = 0): void {
  const m = 0.045,
    R = 0.13,
    N = 4;
  const sorted = wins.slice().sort((u, v) => u[0] - v[0]);
  const P = (ya: number, yb: number, za: number, zb: number) => oq(g, [side * x, ya, za], [side * x, ya, zb], [side * x, yb, zb], [side * x, yb, za], [-side, 0, 0]);
  let z = z0;
  for (const [wa, wb] of sorted) {
    const ha = wa - m,
      hb = wb + m,
      ya = wy0 - m,
      yb = wy1 + m;
    inner(g, MODE.wall, '#ffffff', 0, cab);
    if (ha > z + 1e-4) P(y0, y1, z, ha);
    P(yb, y1, ha, hb);
    P(y0, ya, ha, hb);
    const o = rrect(ha, hb, ya, yb, R, N);
    const corners: [number, number][] = [[hb, yb], [ha, yb], [ha, ya], [hb, ya]];
    for (let c = 0; c < 4; c++)
      for (let i = 0; i < N; i++) {
        const p = o.p[c * (N + 1) + i],
          q = o.p[c * (N + 1) + i + 1];
        const A: V3 = [side * x, corners[c][1], corners[c][0]],
          B: V3 = [side * x, p[1], p[0]],
          C: V3 = [side * x, q[1], q[0]];
        // facing into the car
        const cx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
        if (cx * -side >= 0) g.tri(A, B, C);
        else g.tri(A, C, B);
      }
    // the reveal back to the glass (a dark seal at its bottom on the shader's side of things)
    inner(g, MODE.plastic, '#8f8e87', 0, cab);
    const A: V3[] = o.p.map(([pz, py]) => [side * x, py, pz]);
    const B: V3[] = o.p.map(([pz, py]) => [side * 1.428, py, pz]);
    const Nr: V3[] = o.d.map(([dz, dy]) => [0, -dy, -dz]);
    strip(g, A, B, Nr, true);
    // the roller blind's cassette over the window
    inner(g, MODE.plastic, '#5c5e5e', 0, cab);
    const zc = (wa + wb) / 2;
    g.box(side * (x - 0.018), wy1 + 0.075, zc, 0.04, 0.05, wb - wa - 0.02, 0);
    g.color('#3a3b3c');
    g.box(side * (x - 0.012), wy1 + 0.04, zc, 0.03, 0.02, wb - wa - 0.06, 0);
    z = hb;
  }
  inner(g, MODE.wall, '#ffffff', 0, cab);
  if (z1 > z + 1e-4) P(y0, y1, z, z1);
}

type RRect = (za: number, zb: number, ya: number, yb: number, r: number, n: number) => { p: [number, number][]; d: [number, number][] };

/** one seat of a double: cushion and back, moquette, the top of the back in a darker cover (shader, by height) */
function seatOne(g: Geo, x: number, zn: number, f: number): void {
  inner(g, MODE.moquette, '#ffffff', 0.5 + 0.5 * Math.sin(x * 31 + zn * 17));
  const cus = softBox(0.43, 0.1, 0.47, 3, 1, 3, 0.036, (p, _u, v, t) => {
    // the front edge of the cushion lifts under the thigh, the seat dishes a little
    if (v > 0) p.y += 0.012 * Math.max(0, t * f) ** 2 - 0.008 * (1 - t * t);
  });
  cus.translate(x, FL + 0.4, zn + f * (0.085 + 0.235));
  addBG(g, cus);
  const back = softBox(0.43, 0.73, 0.09, 3, 5, 1, 0.032, (p, _u, v) => {
    const s = (v + 1) / 2;
    // leaning away from the sitter, with a lumbar swell
    p.z += -f * 0.05 * s + f * 0.014 * Math.sin(s * 3.14) * (s < 0.6 ? 1 : 0.2);
    p.x *= 1 - 0.05 * s * s;
  });
  back.translate(x, FL + 0.8, zn + f * 0.07);
  addBG(g, back);
}

/** the seats either side of the aisle on one face of a seat-back plane */
function seatRow(g: Geo, zn: number, f: number): void {
  for (const s of [-1, 1]) {
    seatOne(g, s * 0.62, zn, f);
    seatOne(g, s * 1.06, zn, f);
    const zc = zn + f * 0.32;
    // under the cushion: the beam off the wall, a pedestal at its wall end
    inner(g, MODE.metal, '#8c9093', 1);
    g.rod([s * 1.36, FL + 0.335, zc], [s * 0.46, FL + 0.335, zc], 0.018, 6);
    inner(g, MODE.plastic, '#44474a');
    addBG(g, softBox(0.07, 0.34, 0.11, 1, 1, 1, 0.012).translate(s * 1.2, FL + 0.17, zc));
    // the aisle-end arm of the seat
    inner(g, MODE.plastic, '#6a6d70');
    addBG(g, softBox(0.024, 0.12, 0.3, 1, 1, 2, 0.01).translate(s * 0.4, FL + 0.6, zn + f * 0.3));
  }
}

/** what stands between the two faces of a plane: the moulded shell, a grab handle at the aisle end */
function seatPlane(g: Geo, zn: number): void {
  for (const s of [-1, 1]) {
    inner(g, MODE.plastic, '#55585b');
    addBG(g, softBox(0.9, 0.7, 0.03, 2, 2, 1, 0.012).translate(s * 0.84, FL + 0.78, zn));
    inner(g, MODE.metal, '#a9adb0', 1);
    const xa = s * 0.42,
      xb = s * 0.62;
    g.rod([xa, FL + 1.1, zn], [xa, FL + 1.22, zn], 0.012, 6);
    g.rod([xb, FL + 1.1, zn], [xb, FL + 1.22, zn], 0.012, 6);
    g.rod([xa, FL + 1.22, zn], [xb, FL + 1.22, zn], 0.012, 6);
  }
}

/** an end of the saloon: wall, the gangway door with its window, two posters, a display over the door */
function saloonEnd(g: Geo, glass: Geo, z: number, f: number): void {
  inner(g, MODE.wall, '#ffffff');
  const Y1 = 2.98;
  oq(g, [-WX, FL, z], [-0.5, FL, z], [-0.5, CE, z], [-WX, CE, z], [0, 0, f]);
  oq(g, [0.5, FL, z], [WX, FL, z], [WX, CE, z], [0.5, CE, z], [0, 0, f]);
  oq(g, [-0.5, Y1, z], [0.5, Y1, z], [0.5, CE, z], [-0.5, CE, z], [0, 0, f]);
  // the door: a leaf in a frame, a pane in the leaf, its handle
  inner(g, MODE.plastic, '#7c7e7c');
  const zd = z + f * 0.012;
  oq(g, [-0.46, FL, zd], [0.46, FL, zd], [0.46, 2.1, zd], [-0.46, 2.1, zd], [0, 0, f]);
  oq(g, [-0.46, 2.82, zd], [0.46, 2.82, zd], [0.46, Y1 - 0.03, zd], [-0.46, Y1 - 0.03, zd], [0, 0, f]);
  oq(g, [-0.46, 2.1, zd], [-0.3, 2.1, zd], [-0.3, 2.82, zd], [-0.46, 2.82, zd], [0, 0, f]);
  oq(g, [0.3, 2.1, zd], [0.46, 2.1, zd], [0.46, 2.82, zd], [0.3, 2.82, zd], [0, 0, f]);
  inner(g, MODE.fixed, '#090a0b');
  oq(g, [-0.3, 2.1, z], [0.3, 2.1, z], [0.3, 2.82, z], [-0.3, 2.82, z], [0, 0, f]);
  glass.kind(T.WINDOW).color('#26323b').extra(0, 0, 0, 0);
  oq(glass, [-0.3, 2.1, zd], [0.3, 2.1, zd], [0.3, 2.82, zd], [-0.3, 2.82, zd], [0, 0, f]);
  inner(g, MODE.rubber, '#1a1b1d');
  g.box(-0.5, (FL + Y1) / 2, z + f * 0.012, 0.04, Y1 - FL, 0.024, 0);
  g.box(0.5, (FL + Y1) / 2, z + f * 0.012, 0.04, Y1 - FL, 0.024, 0);
  g.box(0, Y1, z + f * 0.012, 1.04, 0.04, 0.024, 0);
  inner(g, MODE.metal, '#a9adb0', 1);
  g.rod([0.38, 1.85, zd + f * 0.04], [0.38, 2.05, zd + f * 0.04], 0.012, 6);
  // posters in frames on the wall either side
  for (const s of [-1, 1]) {
    inner(g, MODE.metal, '#8c9093', 1);
    g.box(s * 0.92, 2.45, z + f * 0.006, 0.58, 0.82, 0.012, 0);
    inner(g, MODE.poster, '#ffffff', s > 0 ? 0.2 : 0.7);
    const zp = z + f * 0.0135;
    oq(g, [s * 0.92 - 0.27, 2.08, zp], [s * 0.92 + 0.27, 2.08, zp], [s * 0.92 + 0.27, 2.82, zp], [s * 0.92 - 0.27, 2.82, zp], [0, 0, f]);
  }
  // the display over the door
  inner(g, MODE.rubber, '#17181a');
  g.box(0, 3.08, z + f * 0.05, 0.92, 0.16, 0.08, 0);
  inner(g, MODE.led, '#000000').extra(MODE.led, 3.08, 0.05, 0);
  const zl = z + f * 0.091;
  oq(g, [-0.42, 3.03, zl], [0.42, 3.03, zl], [0.42, 3.13, zl], [-0.42, 3.13, zl], [0, 0, f]);
}

/** poles, rails and screens of a door vestibule */
function vestibule(g: Geo, glass: Geo, d: number): void {
  const YEL = '#d9a81c';
  inner(g, MODE.metal, YEL, 0);
  g.rod([0, FL, d], [0, CE, d], 0.02, 10);
  for (const s of [-1, 1]) {
    for (const e of [-1, 1]) g.rod([s * 1.12, FL, d + e * 0.705], [s * 1.12, CE, d + e * 0.705], 0.02, 10);
    // the rail overhead along the doorway, carried on the two poles
    g.rod([s * 1.12, 2.96, d - 0.705], [s * 1.12, 2.96, d + 0.705], 0.016, 8);
    g.rod([s * 1.12, 2.96, d], [0, 2.96, d], 0.016, 8);
    // draught screens: a pane in a light frame, standing from the wall beside the doorway
    for (const e of [-1, 1]) {
      const zs = d + e * 0.68 + e * 0.04;
      inner(g, MODE.metal, '#a9adb0', 1);
      g.rod([s * 0.86, FL + 0.28, zs], [s * 0.86, 2.62, zs], 0.016, 8);
      g.rod([s * 0.86, 2.62, zs], [s * 1.36, 2.62, zs], 0.016, 8);
      g.rod([s * 0.86, FL + 0.28, zs], [s * 1.36, FL + 0.28, zs], 0.016, 8);
      glass.kind(T.WINDOW).color('#26323b').extra(0, 0, 0, 0);
      oq(glass, [s * 0.86, FL + 0.28, zs], [s * 1.36, FL + 0.28, zs], [s * 1.36, 2.62, zs], [s * 0.86, 2.62, zs], [0, 0, -e]);
    }
    // by the doorway inside: emergency release under its flap, the door-open button on a plate, wheelchair and bike pictograms
    const xw = s * (WX - 0.003);
    inner(g, MODE.plastic, '#c8211b');
    g.box(s * (WX - 0.014), 1.78, d + 0.8, 0.028, 0.15, 0.09, 0);
    inner(g, MODE.pilot, '#2fa84f', 0);
    g.box(s * (WX - 0.006), 1.95, d - 0.8, 0.012, 0.05, 0.05, 0);
    inner(g, MODE.fixed, '#1b1c1e');
    oq(g, [xw, 1.9, d - 0.84], [xw, 1.9, d - 0.76], [xw, 2.0, d - 0.76], [xw, 2.0, d - 0.84], [-s, 0, 0]);
  }
  // a low display in the ceiling above the aisle
  for (const e of [-1, 1]) {
    inner(g, MODE.rubber, '#17181a');
    g.box(0, 3.13, d + e * 0.95, 0.72, 0.11, 0.06, 0);
    inner(g, MODE.led, '#000000').extra(MODE.led, 3.1275, 0.0375, 0);
    const zl = d + e * (0.95 + 0.031);
    oq(g, [-0.33, 3.09, zl], [0.33, 3.09, zl], [0.33, 3.165, zl], [-0.33, 3.165, zl], [0, 0, e]);
  }
}

/** the door jambs and head between the outside and the lining, thresholds in the floor */
function doorway(g: Geo, d: number, w: number): void {
  for (const s of [-1, 1]) {
    inner(g, MODE.plastic, '#8a8c8c');
    for (const e of [-1, 1]) oq(g, [s * WX, FL, d + e * w], [s * 1.452, FL, d + e * w], [s * 1.452, 3.12, d + e * w], [s * WX, 3.12, d + e * w], [0, 0, -e]);
    inner(g, MODE.fixed, '#1b1c1e');
    oq(g, [s * WX, 3.12, d - w], [s * 1.452, 3.12, d - w], [s * 1.452, 3.12, d + w], [s * WX, 3.12, d + w], [0, -1, 0]);
    // above the opening the header faces out; the lining's cove carries on over it inside
    oq(g, [s * WX, 3.02, d - w], [s * WX, 3.12, d - w], [s * WX, 3.12, d + w], [s * WX, 3.02, d + w], [s, 0, 0]);
    inner(g, MODE.plate, '#8a8e90');
    oq(g, [s * WX, FL + 0.002, d - w], [s * 1.452, FL + 0.002, d - w], [s * 1.452, FL + 0.002, d + w], [s * WX, FL + 0.002, d + w], [0, 1, 0]);
    // a yellow strip marking the edge of the floor, the sensor above the door
    inner(g, MODE.fixed, '#d9a81c');
    oq(g, [s * (WX - 0.14), FL + 0.003, d - w], [s * (WX - 0.09), FL + 0.003, d - w], [s * (WX - 0.09), FL + 0.003, d + w], [s * (WX - 0.14), FL + 0.003, d + w], [0, 1, 0]);
  }
}

/** floor, walls, coves, lamps and seats of the run z0..z1 of a saloon; parts = the wall spans with their window openings */
export function saloonPart(g: Geo, rrect: RRect, z0: number, z1: number, parts: { z0: number; z1: number; wins: [number, number][] }[], planes: [number, number][], tables: number[]): void {
  const zStart = z0,
    zStop = z1;
  // floor
  inner(g, MODE.floor, '#ffffff');
  oq(g, [-WX, FL, zStart], [WX, FL, zStart], [WX, FL, zStop], [-WX, FL, zStop], [0, 1, 0]);
  // walls
  for (const s of [-1, 1]) for (const p of parts) liner(g, s, WX, p.z0, p.z1, FL, 3.02, p.wins, 2.2, 2.98, rrect);
  // heater duct along the foot of the wall (not across the doorways), coves, ceiling panels; the lamp band down the middle
  for (const s of [-1, 1]) {
    for (const p of parts) {
      inner(g, MODE.plastic, '#3c3e40');
      const zc = (p.z0 + p.z1) / 2,
        L = p.z1 - p.z0;
      if (L > 0.3) {
        g.box(s * (WX - 0.03), FL + 0.1, zc, 0.06, 0.2, L, 8);
        g.color('#2a2b2d');
        g.box(s * (WX - 0.061), FL + 0.15, zc, 0.002, 0.05, L - 0.1, 0);
      }
    }
    const pts: [number, number][] = [[WX, 3.02], [WX, 3.075], [1.28, 3.15], [1.05, 3.2], [0.16, 3.2]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k],
        [x1, y1] = pts[k + 1];
      inner(g, k < 3 ? MODE.ceiling : MODE.ceiling, '#ffffff', k < 3 ? 1 : 0);
      oq(g, [s * x0, y0, zStart], [s * x1, y1, zStart], [s * x1, y1, zStop], [s * x0, y0, zStop], [-s * 0.5, -1, 0]);
    }
  }
  // the lamp band, slightly proud in a metal edge
  inner(g, MODE.lamp, '#fff4e0');
  oq(g, [-0.16, 3.192, zStart], [0.16, 3.192, zStart], [0.16, 3.192, zStop], [-0.16, 3.192, zStop], [0, -1, 0]);
  inner(g, MODE.metal, '#9a9c9c', 1);
  for (const s of [-1, 1]) oq(g, [s * 0.16, 3.2, zStart], [s * 0.16, 3.192, zStart], [s * 0.16, 3.192, zStop], [s * 0.16, 3.2, zStop], [-s, 0, 0]);
  // seats
  const done = new Set<number>();
  for (const [zn, f] of planes) {
    seatRow(g, zn, f);
    if (!done.has(zn)) {
      done.add(zn);
      seatPlane(g, zn);
    }
  }
  // wall tables in the facing bays, a bin under each
  for (const zc of tables)
    for (const s of [-1, 1]) {
      inner(g, MODE.plastic, '#55585b');
      addBG(g, softBox(0.2, 0.024, 0.42, 1, 1, 2, 0.01).translate(s * 1.25, FL + 0.74, zc));
      g.color('#6a6d70');
      g.box(s * 1.345, FL + 0.67, zc, 0.03, 0.12, 0.06, 0);
      addBG(g, softBox(0.05, 0.16, 0.14, 1, 1, 1, 0.01).translate(s * 1.335, FL + 0.5, zc));
      // the coat hook on the pillar
      inner(g, MODE.metal, '#a9adb0', 1);
      g.rod([s * WX, 2.96, zc - 0.02], [s * (WX - 0.05), 2.98, zc - 0.02], 0.006, 4);
    }
}


// ───────────────────────────────────────────── the cab

/** a CabinAdd for the shared seat builder: everything dark and dull */
function cabAdd(g: Geo): CabinAdd {
  return (bg, o) => {
    const c = new THREE.Color(o.color);
    if (o.finish === 'chrome') inner(g, MODE.metal, '#a9adb0', 1, 1);
    else if (o.trim === 1) inner(g, MODE.moquette, '#ffffff', 0.3, 1);
    else inner(g, MODE.plastic, '#' + c.getHexString(), 0, 1);
    addBG(g, bg);
  };
}

/** the driver's place: side walls with their window openings, ceiling, rear bulkhead with door, the sloped desk with screens, controllers and
 *  buttons, the seat on its pedestal, the roller blind. zFront(y) = z of the windscreen plane at y, cz the bulkhead */
export interface CabSpec {
  zFront: (y: number) => number;
  cz: number;
  zNose: number;
  yScreen: number;
  /** floor of the cab, half width of its walls, height of its ceiling */
  yf: number;
  X: number;
  yC: number;
  /** windscreen opening's half widths at its foot and head, and its top */
  hx0: number;
  hx1: number;
  yTop: number;
  /** a side window: y0..y1, rear z, its front edge at y; null = plain wall */
  win: { y0: number; y1: number; zr: number; zw: (y: number) => number } | null;
}

export function emuCab(g: Geo, spec: CabSpec): void {
  const { zFront, cz, zNose, yScreen, yf, X, yC, hx0, hx1, yTop, win } = spec;
  const zf = (y: number) => zFront(y) - 0.015;
  const hxAt = (y: number) => hx0 + ((hx1 - hx0) * (y - yScreen)) / (yTop - yScreen);
  // floor, raised on a platform over the bogie
  inner(g, MODE.floor, '#3a3a3a', 0, 1);
  oq(g, [-X, yf, cz], [X, yf, cz], [X, yf, zNose], [-X, yf, zNose], [0, 1, 0]);
  // the ceiling, with its lamp and a vent
  inner(g, MODE.ceiling, '#ffffff', 2, 1);
  oq(g, [-X, yC, cz], [X, yC, cz], [X, yC, zf(yC)], [-X, yC, zf(yC)], [0, -1, 0]);
  inner(g, MODE.lamp, '#fff4e0', 1, 1);
  oq(g, [-0.2, yC - 0.01, cz + 0.2], [0.2, yC - 0.01, cz + 0.2], [0.2, yC - 0.01, cz + 0.32], [-0.2, yC - 0.01, cz + 0.32], [0, -1, 0]);
  // the walls: below the windscreen's foot, the side walls round their window, the inside of the screen's frame
  inner(g, MODE.plastic, '#34363a', 0, 1);
  oq(g, [-X, yf, zNose], [X, yf, zNose], [X, yScreen, zNose], [-X, yScreen, zNose], [0, 0, -1]);
  oq(g, [-X, yScreen, zNose], [X, yScreen, zNose], [X, yScreen, zf(yScreen)], [-X, yScreen, zf(yScreen)], [0, -1, -1]);
  oq(g, [-X, yTop, zf(yTop)], [X, yTop, zf(yTop)], [X, yC, zf(yC)], [-X, yC, zf(yC)], [0, -0.3, -1]);
  for (const s of [-1, 1]) oq(g, [s * hxAt(yScreen), yScreen, zf(yScreen)], [s * X, yScreen, zf(yScreen)], [s * X, yTop, zf(yTop)], [s * hxAt(yTop), yTop, zf(yTop)], [0, -0.3, -1]);
  for (const s of [-1, 1]) {
    inner(g, MODE.wall, '#c7c5ba', 0, 1);
    const q = (ya: number, yb: number, za: number, zb: number, zc: number, zd: number) => oq(g, [s * X, ya, za], [s * X, ya, zb], [s * X, yb, zc], [s * X, yb, zd], [-s, 0, 0]);
    if (win) {
      q(yf, yScreen, cz, zNose, zNose, cz);
      q(yScreen, win.y0 - 0.04, cz, zf(yScreen), zf(win.y0 - 0.04), cz);
      q(win.y0 - 0.04, win.y1 + 0.04, cz, win.zr - 0.04, win.zr - 0.04, cz);
      q(win.y0 - 0.04, win.y1 + 0.04, win.zw(win.y0 - 0.04) + 0.05, zf(win.y0 - 0.04), zf(win.y1 + 0.04), win.zw(win.y1 + 0.04) + 0.05);
      q(win.y1 + 0.04, yC, cz, zf(win.y1 + 0.04), zf(yC), cz);
      // the reveal out to the pane
      inner(g, MODE.rubber, '#16181a', 0, 1);
      const o = s * 1.452;
      const a: V3 = [s * X, win.y0 - 0.04, win.zr - 0.04], b: V3 = [s * X, win.y0 - 0.04, win.zw(win.y0 - 0.04) + 0.05], c: V3 = [s * X, win.y1 + 0.04, win.zw(win.y1 + 0.04) + 0.05], d: V3 = [s * X, win.y1 + 0.04, win.zr - 0.04];
      const out = (p: V3): V3 => [o, p[1], p[2]];
      oq(g, a, b, out(b), out(a), [0, 1, 0]);
      oq(g, d, c, out(c), out(d), [0, -1, 0]);
      oq(g, a, d, out(d), out(a), [0, 0, 1]);
      oq(g, b, c, out(c), out(b), [0, 0, -1]);
    } else {
      q(yf, yScreen, cz, zNose, zNose, cz);
      q(yScreen, yC, cz, zf(yScreen), zf(yC), cz);
    }
  }
  // bulkhead with its door and a small pane into the saloon
  inner(g, MODE.plastic, '#3b3f44', 0, 1);
  oq(g, [-X, yf, cz], [X, yf, cz], [X, yC, cz], [-X, yC, cz], [0, 0, 1]);
  inner(g, MODE.plastic, '#2b2e32', 0, 1);
  oq(g, [-0.42, yf, cz + 0.008], [0.42, yf, cz + 0.008], [0.42, 3.1, cz + 0.008], [-0.42, 3.1, cz + 0.008], [0, 0, 1]);
  inner(g, MODE.fixed, '#141a20', 1, 1);
  oq(g, [-0.2, 2.5, cz + 0.012], [0.2, 2.5, cz + 0.012], [0.2, 2.95, cz + 0.012], [-0.2, 2.95, cz + 0.012], [0, 0, 1]);
  inner(g, MODE.metal, '#a9adb0', 1, 1);
  g.rod([0.34, 2.05, cz + 0.05], [0.34, 2.3, cz + 0.05], 0.012, 6, 1);
  // the breaker cabinet on the bulkhead: a grey door with rows of switches and a warning label
  inner(g, MODE.plastic, '#55595d', 0, 1);
  g.box(-0.92, 2.55, cz + 0.03, 0.72, 1.0, 0.06, 0);
  for (let r = 0; r < 5; r++)
    for (let k = 0; k < 8; k++) {
      inner(g, MODE.fixed, '#141517', 0, 1);
      g.box(-1.17 + k * 0.07, 2.84 - r * 0.13, cz + 0.065, 0.032, 0.05, 0.012, 0);
      if ((r * 3 + k * 5) % 7 === 0) {
        inner(g, MODE.pilot, '#2fa84f', 0.75, 1);
        g.box(-1.17 + k * 0.07, 2.875 - r * 0.13, cz + 0.062, 0.009, 0.009, 0.006, 0);
      }
    }
  inner(g, MODE.fixed, '#d9a81c', 0, 1);
  g.box(-0.92, 2.22, cz + 0.062, 0.2, 0.1, 0.004, 0);
  // a fire extinguisher, its bracket
  inner(g, MODE.plastic, '#b0241c', 0, 1);
  g.cyl(0.9, yf + 0.06, cz + 0.1, 0.06, 0.06, 0.42, 10, 1);
  inner(g, MODE.fixed, '#17181a', 0, 1);
  g.cyl(0.9, yf + 0.48, cz + 0.1, 0.02, 0.02, 0.05, 6, 1);
  g.box(0.82, yf + 0.5, cz + 0.1, 0.11, 0.02, 0.02, 0);
  // desk: a sloped top towards the screen over a front panel, returns at the walls
  const yd0 = yf + 0.74,
    zd0 = zf(yScreen) - 0.5;
  const yd1 = yScreen - 0.015,
    zd1 = zf(yScreen);
  const slope: V3 = [0, zd1 - zd0, -(yd1 - yd0)];
  const sl = Math.hypot(slope[1], slope[2]);
  const dn: V3 = [0, slope[1] / sl, slope[2] / sl];
  const onDesk = (x: number, t: number, off = 0): V3 => [x, yd0 + (yd1 - yd0) * t + dn[1] * off, zd0 + (zd1 - zd0) * t + dn[2] * off];
  inner(g, MODE.plastic, '#26282b', 0, 1);
  oq(g, onDesk(-X, 0), onDesk(X, 0), onDesk(X, 1), onDesk(-X, 1), [0, 1, 0]);
  // the slab over the driver's knees, the panel behind them
  oq(g, [-X, yd0 - 0.05, zd0], [X, yd0 - 0.05, zd0], [X, yd0 - 0.05, zd0 + 0.32], [-X, yd0 - 0.05, zd0 + 0.32], [0, -1, 0]);
  oq(g, [-X, yf, zd0 + 0.32], [X, yf, zd0 + 0.32], [X, yd0 - 0.05, zd0 + 0.32], [-X, yd0 - 0.05, zd0 + 0.32], [0, 0, -1]);
  oq(g, [-X, yd0 - 0.05, zd0], [X, yd0 - 0.05, zd0], [X, yd0, zd0], [-X, yd0, zd0], [0, 0, -1]);
  g.color('#1a1b1e');
  // a padded front edge you rest your wrists on
  addBG(g, softBox(2 * X - 0.02, 0.05, 0.07, 3, 1, 1, 0.02).translate(0, yd0 + 0.01, zd0 - 0.015));
  // the two screens in hoods
  for (const [cx, w] of [[-0.42, 0.42], [0.42, 0.42]] as const) {
    inner(g, MODE.rubber, '#101113', 0, 1);
    const box = (a: number, b: number, off: number): V3[] => [onDesk(cx - w / 2 - a, b, off), onDesk(cx + w / 2 + a, b, off), onDesk(cx + w / 2 + a, b + 0.62, off), onDesk(cx - w / 2 - a, b + 0.62, off)];
    const b0 = box(0.02, 0.22, 0.012);
    oq(g, b0[0], b0[1], b0[2], b0[3], dn);
    inner(g, MODE.tft, '#000000', cx < 0 ? 0 : 1, 1);
    const s0 = box(0, 0.26, 0.016);
    oq(g, s0[0], s0[1], s0[2], s0[3], dn);
  }
  // on the desk's far edge, seen from outside through the screen: the backs of two monitors on their arms, the vent over the demister
  inner(g, MODE.rubber, '#15161a', 0, 1);
  for (const cx of [-0.62, 0.62]) {
    const b = onDesk(cx, 0.8, 0.02);
    addBG(g, softBox(0.36, 0.26, 0.05, 2, 2, 1, 0.012, (p, _u, v) => {
      p.z += 0.04 * v;
    }).translate(cx, b[1] + 0.2, b[2] - 0.06));
    g.rod([cx, b[1], b[2]], [cx, b[1] + 0.12, b[2] - 0.04], 0.018, 6);
  }
  inner(g, MODE.plastic, '#1c1e21', 0, 1);
  const vent = onDesk(0, 0.97, 0.01);
  addBG(g, softBox(2 * hx0 - 0.1, 0.03, 0.09, 4, 1, 1, 0.01).translate(0, vent[1] + 0.012, vent[2] - 0.02));
  // the speed dial between them: a ring of LEDs, a real needle
  inner(g, MODE.pilot, '#d9a81c', 0.5, 1);
  for (let k = 0; k < 18; k++) {
    const a = -2.3 + (k / 17) * 4.6;
    const px = Math.sin(a) * 0.075,
      pt = 0.52 + (Math.cos(a) * 0.075) / 0.42;
    const c = onDesk(px, pt, 0.016);
    g.box(c[0], c[1], c[2], 0.008, 0.006, 0.006, 0);
  }
  // rows of buttons and pilot lights on the desk's wings
  const cols = ['#2fa84f', '#d9a81c', '#c8211b', '#3f7fd8', '#2a2b2d', '#2a2b2d', '#d9a81c', '#2a2b2d'];
  for (const s of [-1, 1])
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 7; k++) {
        const c = cols[(k * 3 + r * 5 + (s > 0 ? 1 : 0)) % cols.length];
        const lit = c !== '#2a2b2d';
        inner(g, lit ? MODE.pilot : MODE.plastic, c, 0.7 + 0.04 * k, 1);
        const p = onDesk(s * (0.82 + k * 0.058), 0.3 + r * 0.17, 0.008);
        g.box(p[0], p[1], p[2], 0.03, 0.012, 0.03, 8);
      }
  // master controller on the left of the driver, brake lever on the right, each in a slotted quadrant
  for (const s of [-1, 1]) {
    const q = onDesk(s * 0.2, 0.12, 0.005);
    inner(g, MODE.rubber, '#0f1012', 0, 1);
    addBG(g, softBox(0.1, 0.03, 0.24, 1, 1, 1, 0.012).translate(q[0], q[1] + 0.01, q[2]));
    inner(g, MODE.metal, '#a9adb0', 1, 1);
    g.rod([q[0], q[1] + 0.02, q[2]], [q[0], q[1] + 0.13, q[2] - 0.05], 0.009, 6);
    inner(g, MODE.plastic, s < 0 ? '#16171a' : '#b0241c', 0, 1);
    addBG(g, softBox(0.05, 0.04, 0.045, 1, 1, 1, 0.016).translate(q[0], q[1] + 0.145, q[2] - 0.055));
  }
  // the radio handset on its cradle with a coiled cord
  inner(g, MODE.plastic, '#141518', 0, 1);
  const hs = onDesk(-(X - 0.3), 0.82, 0.02);
  addBG(g, softBox(0.05, 0.03, 0.2, 1, 1, 2, 0.012).translate(hs[0], hs[1], hs[2]));
  hose(g, [hs[0], hs[1], hs[2] - 0.1], [hs[0] + 0.1, hs[1] - 0.2, hs[2] - 0.36], 0.05, 0.005, 6);
  // the seat, central, on a pedestal
  frontSeat(cabAdd(g), 0, 0.25, cz + 0.2, yf + 0.55, yf + 1.12, yf + 1.33);
  inner(g, MODE.metal, '#55585a', 1, 1);
  g.cyl(0, yf, cz + 0.42, 0.05, 0.04, 0.3, 10, 0);
  // the roller blind drawn a third of the way down the screen on the driver's side, its cassette
  inner(g, MODE.rubber, '#1a1b1d', 0, 1);
  const yb = yTop - 0.02;
  g.box(0, yb, zf(yb) - 0.03, 2 * hx1, 0.05, 0.05, 0);
  inner(g, MODE.fixed, '#20201c', 0, 1);
  oq(g, [-1.1, yb - 0.02, zf(yb - 0.02) - 0.02], [-0.04, yb - 0.02, zf(yb - 0.02) - 0.02], [-0.04, yb - 0.3, zf(yb - 0.3) - 0.02], [-1.1, yb - 0.3, zf(yb - 0.3) - 0.02], [0, 0, -1]);
  // the wiper motors' covers behind the screen's foot
  inner(g, MODE.plastic, '#1d1f22', 0, 1);
  for (const s of [-1, 1]) addBG(g, softBox(0.16, 0.05, 0.1, 1, 1, 1, 0.012).translate(s * 1.0, yScreen + 0.04, zf(yScreen) - 0.06));
}

// ───────────────────────────────────────────── assembly

export interface ClosePartsIn {
  wins2: [number, number][];
  wins3: [number, number][];
  winsM: [number, number][];
  winsC: [number, number][];
  doorZ: number[];
  zr: number;
  zF: number;
  cab: CabSpec;
  rrect: RRect;
}

/** everything behind the openings of an EMU car: variant 0 shared, 2 the middle car's far end, 1 the cab car's saloon end and cab */
export function emuInterior(g: Geo, glass: Geo, o: ClosePartsIn): void {
  const w = 0.66;
  const [d0, d1] = o.doorZ;
  const cz = o.cab.cz;
  g.variant(0);
  glass.variant(0);
  saloonPart(
    g,
    o.rrect,
    o.zr,
    d1 - w,
    [
      { z0: o.zr, z1: d0 - w, wins: o.wins2 },
      { z0: d0 + w, z1: d1 - w, wins: o.wins3 },
    ],
    [[-7.6, 1], [-5.7, -1], [-5.7, 1], [-1.9, -1], [-1.9, 1], [0, -1], [0, 1], [1.9, -1], [1.9, 1], [5.7, -1], [5.7, 1]],
    [-6.65, -0.95, 0.95],
  );
  doorway(g, d0, w);
  doorway(g, d1, w);
  vestibule(g, glass, d0);
  vestibule(g, glass, d1);
  saloonEnd(g, glass, o.zr + 0.03, 1);
  g.variant(2);
  glass.variant(2);
  saloonPart(g, o.rrect, d1 - w, o.zF, [{ z0: d1 + w, z1: o.zF, wins: o.winsM }], [[7.6, -1]], [6.65]);
  saloonEnd(g, glass, o.zF - 0.03, -1);
  g.variant(1);
  glass.variant(1);
  saloonPart(g, o.rrect, d1 - w, cz, [{ z0: d1 + w, z1: cz, wins: o.winsC }], [], []);
  saloonEnd(g, glass, cz - 0.01, -1);
  emuCab(g, o.cab);
  g.variant(0);
  glass.variant(0);
}

/** what trainModels.ts calls to build a car's close level instead of its far parts */
export interface CloseHooks {
  glass: Geo;
  inner: Geo;
  bogie: typeof closeBogie;
  doors: typeof closeDoors;
  lamp: typeof closeLamp;
  plate: typeof closeLampPlate;
  saloon: typeof emuInterior;
  cab: typeof emuCab;
}

export function makeHooks(): CloseHooks {
  return { glass: new Geo(), inner: new Geo(), bogie: closeBogie, doors: closeDoors, lamp: closeLamp, plate: closeLampPlate, saloon: emuInterior, cab: emuCab };
}
