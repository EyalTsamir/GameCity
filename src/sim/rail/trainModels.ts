// Procedural rolling stock, built facing +Z with the rail head at y = 0:
//   * EMU cab car (wedge front, sloped windshield, head/tail lights, destination display)
//   * EMU middle car (pantograph)
//   * Bo-Bo electric freight locomotive (cabs both ends, one pantograph raised)
//   * container flat wagon (40 ft / 2×20 ft load variants chosen per instance)
// Tags (aKind) and pivots (aExtra) feed trainMaterial.ts.

import * as THREE from 'three';
import { Geo, type V3 } from './geo';
import { T } from './trainMaterial';

export const EMU = {
  /** body length (cab and middle cars share one geometry) */
  len: 15.5,
  wheelR: 0.43,
};
export const FREIGHT = {
  locoLen: 16.8,
  wagonLen: 13.9,
  gap: 0.75,
  locoWheelR: 0.6,
  wagonWheelR: 0.42,
};

const C = {
  skirt: '#363a3e',
  under: '#25282b',
  cream: '#efe6d2',
  roof: '#a6aaac',
  roofDark: '#7d8285',
  glass: '#26323b',
  door: '#efe6d2',
  doorEdge: '#2a2d30',
  bogie: '#33373a',
  bogieLight: '#4a4f53',
  wheelTread: '#2f2c29',
  wheelPolish: '#8e8b86',
  wheelFace: '#5e564f',
  wheelDark: '#2b2724',
  spring: '#6b6f72',
  bellows: '#2a2c2e',
  endWall: '#4b4f52',
  lampRim: '#1b1d1f',
  headOff: '#b9c0c5',
  tailOff: '#6a1712',
  dest: '#2b1a0c',
  panto: '#8c9194',
  insulator: '#8a4a35',
  white: '#f2f0ea',
  yellow: '#f2c230',
  frame: '#4b4542',
  buffer: '#2b2d2f',
  grille: '#26323e',
  corner: '#3b3d3f',
};

interface Band {
  color: string;
  tag: number;
}

// ───────────────────────────────────────────── generic shell

type Prof = [number, number][];

function withNormals(g: Geo, a: V3, b: V3, c: V3, d: V3, na: V3, nb: V3, nc: V3, nd: V3): void {
  const i0 = g.vert(a[0], a[1], a[2], na[0], na[1], na[2]);
  g.vert(b[0], b[1], b[2], nb[0], nb[1], nb[2]);
  g.vert(c[0], c[1], c[2], nc[0], nc[1], nc[2]);
  g.vert(d[0], d[1], d[2], nd[0], nd[1], nd[2]);
  g.I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}

/** segment outward normal (right side, x > 0) */
function segN(p: [number, number], q: [number, number]): [number, number] {
  const dx = q[0] - p[0],
    dy = q[1] - p[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}

/**
 * Side walls + roof of a car body from z0 to z1 (both sides). `bands[i]` paints profile
 * segment i; `smoothFrom` = first profile vertex index from which normals are averaged (roof).
 */
function shell(g: Geo, prof: Prof, bands: Band[], z0: number, z1: number, smoothFrom: number, zFront?: (y: number) => number): void {
  const n = prof.length;
  const segNs: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) segNs.push(segN(prof[i], prof[i + 1]));
  const vn = (i: number, seg: number): [number, number] => {
    if (prof[i][0] === 0) return [0, 1];
    if (i < smoothFrom || i === 0 || i === n - 1) return segNs[seg];
    const a = segNs[i - 1],
      b = segNs[i];
    const x = a[0] + b[0],
      y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  for (let i = 0; i < n - 1; i++) {
    const p = prof[i],
      q = prof[i + 1];
    if (bands[i].tag < 0) continue;
    const np = vn(i, i),
      nq = vn(i + 1, i);
    g.kind(bands[i].tag).color(bands[i].color);
    const zp = zFront ? zFront(p[1]) : z1;
    const zq = zFront ? zFront(q[1]) : z1;
    // right side (+x)
    withNormals(g, [p[0], p[1], zp], [p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], zq], [np[0], np[1], 0], [np[0], np[1], 0], [nq[0], nq[1], 0], [nq[0], nq[1], 0]);
    // left side (−x), mirrored
    withNormals(g, [-p[0], p[1], z0], [-p[0], p[1], zp], [-q[0], q[1], zq], [-q[0], q[1], z0], [-np[0], np[1], 0], [-np[0], np[1], 0], [-nq[0], nq[1], 0], [-nq[0], nq[1], 0]);
  }
}

/** flat end wall (profile polygon) at z facing ±z */
function endWall(g: Geo, prof: Prof, z: number, facing: 1 | -1, color: string, tag = T.PLAIN): void {
  const pts: V3[] = [];
  for (const [x, y] of prof) pts.push([x, y, z]);
  for (let i = prof.length - 2; i >= 0; i--) pts.push([-prof[i][0], prof[i][1], z]);
  // pts go up the right side then down the left: counter-clockwise seen from −z... fix orientation per facing
  g.kind(tag).color(color);
  const poly = facing > 0 ? pts : pts.slice().reverse();
  // fan around the centroid (profile is convex)
  let cx = 0,
    cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;
  const c0 = g.vert(cx, cy, z, 0, 0, facing);
  const base = g.vertexCount;
  for (const p of poly) g.vert(p[0], p[1], p[2], 0, 0, facing);
  for (let i = 0; i < poly.length; i++) g.I.push(c0, base + i, base + ((i + 1) % poly.length));
}

/** wheelset pair (both wheels of one axle) with sector-painted faces so rotation reads */
function wheelset(g: Geo, z: number, r: number, gaugeHalf = 0.717): void {
  // 24 sides: 12 read as a polygon at 3 m. A solid wheel as a real one is turned: rail-polished tread, the
  // flange on the inner side standing proud of it, a rim face, a dished web down to the hub boss.
  const seg = 24;
  g.extra(r, z, 0, 0);
  const ring = (x0: number, r0: number, x1: number, r1: number, side: number, outward: boolean) => {
    // a surface of revolution strip between (x0, r0) and (x1, r1); normal from the strip's meridian
    const dx = x1 - x0,
      dr = r1 - r0;
    const len = Math.hypot(dx, dr) || 1;
    // meridian normal: (dr, -dx) rotated so it points away from the axle (outward) or towards the face
    let nx = dr / len,
      nr = -dx / len;
    if ((outward && nr < 0) || (!outward && nx * side < 0)) {
      nx = -nx;
      nr = -nr;
    }
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0),
        s0 = Math.sin(a0),
        c1 = Math.cos(a1),
        s1 = Math.sin(a1);
      const A: V3 = [x0, r + c0 * r0, z + s0 * r0],
        B: V3 = [x1, r + c0 * r1, z + s0 * r1],
        Cc: V3 = [x1, r + c1 * r1, z + s1 * r1],
        D: V3 = [x0, r + c1 * r0, z + s1 * r0];
      const n0: V3 = [nx, c0 * nr, s0 * nr],
        n1: V3 = [nx, c1 * nr, s1 * nr];
      // winding: the triangle A B C must face along the normal (else the other way round)
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
      const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      if (gx * n0[0] + gy * (n0[1] + n1[1]) + gz * (n0[2] + n1[2]) >= 0) withNormals(g, A, B, Cc, D, n0, n0, n1, n1);
      else withNormals(g, A, D, Cc, B, n0, n1, n1, n0);
    }
  };
  for (const side of [-1, 1]) {
    const xo = side * (gaugeHalf + 0.065),
      xi = side * (gaugeHalf - 0.065);
    // tread (polished where it runs on the rail), its chamfer to the rim face, the flange inside
    g.kind(T.WHEEL).color(C.wheelPolish);
    ring(xo, r * 0.985, xi + side * 0.02, r, side, true);
    g.color(C.wheelTread);
    ring(xo, r * 0.93, xo, r * 0.985, side, false);
    ring(xi + side * 0.02, r, xi, r + 0.028, side, true);
    ring(xi, r + 0.028, xi - side * 0.012, r * 0.93, side, true);
    // web: dished from the rim in to the hub (brake dust on it), hub boss, axle end
    g.color(C.wheelFace);
    ring(xo, r * 0.93, xo - side * 0.035, r * 0.42, side, false);
    g.color(C.wheelDark);
    ring(xo - side * 0.035, r * 0.42, xo + side * 0.01, r * 0.3, side, false);
    ring(xo + side * 0.01, r * 0.3, xo + side * 0.01, 0.001, side, false);
  }
  // axle
  g.kind(T.WHEEL).color(C.wheelDark);
  g.rod([-gaugeHalf, r, z], [gaugeHalf, r, z], 0.07, 6);
  g.extra(0, 0, 0, 0);
}

/**
 * Two-axle bogie centred at z: welded side frames (high over the axle boxes, dropped in the middle), round axle
 * boxes with twin primary coil springs, brake units at each wheel, a transom, secondary suspension (air springs, or
 * coil nests on a heavy loco bogie) carrying the body, vertical and yaw dampers, sand pipes ahead of the wheels.
 */
function bogie(g: Geo, z: number, r: number, wheelbase: number, heavy = false, bodyY = 0.95, coil = heavy): void {
  for (const dz of [-wheelbase / 2, wheelbase / 2]) wheelset(g, z + dz, r);
  g.kind(T.PLAIN).color(C.bogie);
  const fx = 0.93;
  const hw = wheelbase / 2;
  const len = wheelbase + (heavy ? 1.1 : 0.9);
  const yHi = r + 0.17,
    yLo = r - 0.03,
    fh = heavy ? 0.3 : 0.24;
  for (const s of [-1, 1]) {
    const x = s * fx;
    // side frame: end arms over the axle boxes, sloping down to the dropped centre where the bolster sits
    g.color(C.bogie);
    g.beam([x, yHi, z - len / 2], [x, yHi, z - hw + 0.28], 0.14, fh);
    g.beam([x, yHi, z - hw + 0.26], [x, yLo, z - 0.42], 0.14, fh);
    g.beam([x, yLo, z - 0.44], [x, yLo, z + 0.44], 0.14, fh);
    g.beam([x, yLo, z + 0.42], [x, yHi, z + hw - 0.26], 0.14, fh);
    g.beam([x, yHi, z + hw - 0.28], [x, yHi, z + len / 2], 0.14, fh);
    // frame flange lips (lighter edge top and bottom read the I-section)
    g.color(C.bogieLight);
    g.box(x + s * 0.075, yHi + fh / 2 - 0.02, z - len / 2 + 0.3, 0.012, 0.04, 0.6, 0);
    g.box(x + s * 0.075, yHi + fh / 2 - 0.02, z + len / 2 - 0.3, 0.012, 0.04, 0.6, 0);
    for (const dz of [-hw, hw]) {
      // round axle box with an end cover and bolts, twin primary springs either side of it
      g.color(C.bogieLight);
      g.rod([s * (fx - 0.12), r, z + dz], [s * (fx + 0.11), r, z + dz], 0.13, 10, 1);
      g.color('#585d61');
      g.rod([s * (fx + 0.11), r, z + dz], [s * (fx + 0.14), r, z + dz], 0.09, 8, 1);
      for (const k of [-1, 1]) {
        g.color(C.spring);
        g.cyl(x, r + 0.04, z + dz + k * 0.2, 0.065, 0.065, yHi - fh / 2 - r - 0.03, 8, 0);
        g.color('#3c4043');
        for (let c = 0; c < 3; c++) g.cyl(x, r + 0.07 + c * 0.04, z + dz + k * 0.2, 0.071, 0.071, 0.014, 8, 0);
      }
      // brake unit (block / caliper) at the tread, inboard of the frame
      g.color('#2a2d30');
      g.box(s * 0.62, r + 0.02, z + dz + (dz > 0 ? 1 : -1) * (r * 0.72), 0.14, 0.22, 0.12, 0);
      // sand pipe ending ahead of the leading wheel
      g.color('#1f2123');
      g.rod([x, yHi, z + dz + (dz > 0 ? 1 : -1) * 0.32], [s * 0.72, 0.12, z + dz + (dz > 0 ? 1 : -1) * (r + 0.04)], 0.014, 4);
    }
    // secondary suspension on the bolster ends up to the body
    if (coil) {
      g.color(C.spring);
      for (const k of [-1, 1]) g.cyl(s * 1.0, yLo + fh / 2, z + k * 0.22, 0.1, 0.1, bodyY - yLo - fh / 2, 8, 0);
    } else {
      g.color('#1c1d1f');
      g.cyl(s * 1.0, yLo + fh / 2, z, 0.23, 0.26, bodyY - yLo - fh / 2 - 0.02, 12, 1);
      g.color('#2b2d30');
      g.cyl(s * 1.0, bodyY - 0.04, z, 0.2, 0.2, 0.04, 12, 1);
    }
    // vertical damper (black body, bright rod) and a yaw damper from the frame to the body
    g.color('#18191b');
    g.rod([s * 1.12, yLo, z + 0.55], [s * 1.12, yLo + 0.28, z + 0.6], 0.04, 6, 1);
    g.color('#b9bdc0');
    g.rod([s * 1.12, yLo + 0.28, z + 0.6], [s * 1.12, bodyY - 0.02, z + 0.63], 0.018, 5);
    g.color('#18191b');
    g.rod([s * 1.08, yHi + 0.05, z - len / 2 + 0.15], [s * 1.08, bodyY - 0.12, z - len / 2 - 0.45], 0.035, 6, 1);
  }
  // transom / bolster
  g.color(C.bogie);
  g.box(0, yLo + 0.05, z, fx * 2, 0.2, 0.46, 0);
  for (const dz of [-0.32, 0.32]) g.box(0, yLo + 0.06, z + dz, fx * 2, 0.14, 0.14, 0);
  if (heavy) {
    // traction motors / brake cylinders
    g.color(C.bogieLight);
    for (const dz of [-wheelbase / 2 + 0.55, wheelbase / 2 - 0.55]) g.box(0, r + 0.02, z + dz, 1.1, 0.4, 0.45, 0);
  }
}

/** roof air-conditioning pack: chamfered shroud, two condenser fans under round guards, louvred side intakes */
function boxRoofUnit(g: Geo, z: number, y: number, len: number, w = 1.5): void {
  const h = 0.28,
    c = 0.09;
  g.kind(T.PLAIN).color('#2b2e31');
  g.box(0, y + 0.02, z, w - 0.06, 0.04, len - 0.06, 0);
  g.color(C.roofDark);
  g.prism(
    [
      [-w / 2, y + 0.03],
      [w / 2, y + 0.03],
      [w / 2, y + h - c],
      [w / 2 - c, y + h],
      [-w / 2 + c, y + h],
      [-w / 2, y + h - c],
    ],
    z - len / 2,
    z + len / 2,
  );
  for (const dz of [-len / 4, len / 4]) {
    g.color('#16181a');
    g.cyl(0, y + h - 0.005, z + dz, 0.3, 0.3, 0.012, 16, 1);
    g.color('#8a8f93');
    g.cyl(0, y + h, z + dz, 0.33, 0.33, 0.03, 16, 0);
    g.color('#5c6164');
    for (const r of [0.1, 0.18, 0.26]) for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2,
        a1 = ((k + 1) / 8) * Math.PI * 2;
      g.rod([Math.cos(a0) * r, y + h + 0.02, z + dz + Math.sin(a0) * r], [Math.cos(a1) * r, y + h + 0.02, z + dz + Math.sin(a1) * r], 0.006, 3);
    }
    g.rod([-0.3, y + h + 0.02, z + dz], [0.3, y + h + 0.02, z + dz], 0.008, 3);
    g.rod([0, y + h + 0.02, z + dz - 0.3], [0, y + h + 0.02, z + dz + 0.3], 0.008, 3);
  }
  g.color('#202325');
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) g.box(s * (w / 2 + 0.004), y + 0.07 + k * 0.03, z, 0.008, 0.012, len * 0.6, 0);
}

/** single-arm pantograph standing on the roof at (0, roofY, z); raised to the contact wire height */
function pantograph(g: Geo, z: number, roofY: number, raised: boolean, flip = false): void {
  const s = flip ? -1 : 1;
  // insulators + base frame
  g.kind(T.PLAIN).color(C.insulator);
  for (const dx of [-0.45, 0.45])
    for (const dz of [-0.35, 0.35]) {
      // post insulator: a core with sheds (discs) up its length
      g.cyl(dx, roofY, z + dz, 0.045, 0.04, 0.24, 6, 1);
      for (let k = 0; k < 3; k++) g.cyl(dx, roofY + 0.04 + k * 0.065, z + dz, 0.085, 0.07, 0.025, 8, 1);
    }
  g.color(C.panto);
  const by = roofY + 0.24;
  g.box(0, by + 0.04, z, 1.05, 0.08, 0.85, 0);
  const headY = raised ? 5.05 : by + 0.32;
  const hinge: V3 = [0, by + 0.1, z - s * 0.55];
  const knee: V3 = raised ? [0, (by + headY) / 2 + 0.12, z + s * 0.95] : [0, by + 0.2, z + s * 1.15];
  const head: V3 = [0, headY - 0.08, z - s * 0.08];
  for (const dx of [-0.24, 0.24]) g.rod([dx, hinge[1], hinge[2]], [dx * 0.4, knee[1], knee[2]], 0.035, 5);
  g.rod(knee, head, 0.03, 5);
  // push rod, the raising (air) cylinder on the base frame and its damper
  g.rod([0, by + 0.08, z - s * 0.25], [0, knee[1] - 0.05, knee[2] - s * 0.25], 0.018, 4);
  g.color('#3c4043');
  g.rod([0.3, by + 0.09, z + s * 0.3], [0.3, by + 0.12, z - s * 0.35], 0.045, 8, 1);
  g.color('#b9bdc0');
  g.rod([0.3, by + 0.12, z - s * 0.35], [0.12, hinge[1] + 0.05, hinge[2] + s * 0.05], 0.015, 4);
  // flexible shunts across the hinges
  g.color('#7a5a3a');
  for (const dx of [-0.2, 0.2]) g.rod([dx, by + 0.09, z - s * 0.5], [dx * 0.6, by + 0.2, z - s * 0.2], 0.012, 4);
  // head: cross bar, collector strips, horns
  g.color('#55595c');
  g.box(0, head[1] + 0.02, head[2], 0.12, 0.06, 0.12, 0);
  g.color(C.panto);
  g.box(0, headY - 0.02, head[2], 1.55, 0.05, 0.06, 0);
  g.color('#3c3f41');
  for (const dz of [-0.13, 0.13]) g.box(0, headY - 0.005, head[2] + dz, 1.45, 0.035, 0.05, 0);
  g.color(C.panto);
  for (const sx of [-1, 1]) g.rod([sx * 0.77, headY - 0.02, head[2]], [sx * 0.98, headY - 0.22, head[2]], 0.02, 4);
}

// ───────────────────────────────────────────── EMU

const EMU_PROF: Prof = [
  [1.3, 0.95],
  [1.45, 1.15],
  [1.45, 2.05],
  [1.45, 3.15],
  [1.45, 3.35],
  [1.38, 3.55],
  [1.1, 3.78],
  [0.6, 3.9],
  [0, 3.93],
];
const EMU_BANDS: Band[] = [
  { color: C.skirt, tag: T.PLAIN },
  { color: '#ffffff', tag: T.LIVERY },
  { color: C.cream, tag: T.PLAIN },
  { color: '#ffffff', tag: T.LIVERY },
  { color: C.roof, tag: T.PLAIN },
  { color: C.roof, tag: T.PLAIN },
  { color: C.roof, tag: T.PLAIN },
  { color: C.roof, tag: T.PLAIN },
];
const ROOF_Y = 3.93;

function emuUnderframe(g: Geo, z0: number, z1: number): void {
  g.kind(T.PLAIN).color(C.under);
  g.quad([1.3, 0.95, z0], [1.3, 0.95, z1], [-1.3, 0.95, z1], [-1.3, 0.95, z0]);
  // equipment boxes between the bogies
  g.color('#2d3033');
  const L = z1 - z0;
  const mid = (z0 + z1) / 2;
  g.box(0, 0.78, mid - L * 0.12, 2.1, 0.36, L * 0.18, 4);
  g.box(0, 0.8, mid + L * 0.12, 1.8, 0.32, L * 0.14, 4);
  g.color('#3d4246');
  g.box(0.6, 0.72, mid, 0.8, 0.3, L * 0.08, 4);
  // lids on the equipment cases: shut lines (dark) and stiffening ribs, louvres on the converter
  for (const s of [-1, 1]) {
    for (const [zc, d, w] of [[mid - L * 0.12, L * 0.18, 2.1], [mid + L * 0.12, L * 0.14, 1.8]]) {
      g.color('#191b1d');
      for (const k of [-1, 0, 1]) g.box(s * (w / 2 + 0.003), 0.78, zc + (k * d) / 3, 0.006, 0.3, 0.02, 0);
      g.color('#363a3d');
      g.box(s * (w / 2 + 0.006), 0.92, zc, 0.012, 0.03, d - 0.05, 0);
    }
    g.color('#202225');
    for (let k = 0; k < 6; k++) g.box(s * 1.051, 0.66 + k * 0.045, mid + L * 0.12 - L * 0.05, 0.006, 0.02, L * 0.06, 0);
    // main air reservoirs and the cable trunking along the solebar
    g.color('#4a4f53');
    g.rod([s * 0.75, 0.68, mid - L * 0.31], [s * 0.75, 0.68, mid - L * 0.23], 0.17, 10, 1);
    g.color('#1d1f22');
    g.box(s * 1.2, 0.86, mid, 0.08, 0.08, L * 0.62, 0);
  }
}

/** rounded rectangle contour in the side plane (z, y), counter-clockwise in (z, y); n segments per corner.
 *  Also returns each point's outward direction (for offset contours and gasket normals). */
function rrect(za: number, zb: number, ya: number, yb: number, r: number, n: number): { p: [number, number][]; d: [number, number][] } {
  const p: [number, number][] = [],
    d: [number, number][] = [];
  const cs: [number, number, number][] = [
    [zb - r, yb - r, 0],
    [za + r, yb - r, Math.PI / 2],
    [za + r, ya + r, Math.PI],
    [zb - r, ya + r, Math.PI * 1.5],
  ];
  for (const [cz, cy, a0] of cs)
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      d.push([Math.cos(a), Math.sin(a)]);
      p.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  return { p, d };
}

/** triangle in the side plane facing outwards (side ±1) whatever the point order */
function sideTri(g: Geo, side: number, a: V3, b: V3, c: V3): void {
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  if (cx * side >= 0) g.tri(a, b, c);
  else g.tri(a, c, b);
}

/**
 * Body side band (flat, |x| = 1.45, y0..y1 over z0..z1) pierced by rounded window openings: the panel around each
 * opening (strips + corner fillets), a rubber gasket with a lip proud of the panel and a reveal sloping in, and the
 * glass set 2.5 cm back in it (ray-traced saloon behind). `wins` = glass [za, zb] spans, glass y wy0..wy1.
 */
function piercedSide(g: Geo, z0: number, z1: number, y0: number, y1: number, wins: [number, number][], wy0: number, wy1: number, color: string): void {
  const X = 1.45,
    m = 0.045, // gasket width round the glass
    R = 0.13, // opening corner radius
    N = 4;
  for (const side of [-1, 1]) {
    // panel: columns between openings, strips above / below each, fillets in its corners
    g.kind(T.PLAIN).color(color);
    let z = z0;
    const sorted = wins.slice().sort((u, v) => u[0] - v[0]);
    for (const [wa, wb] of sorted) {
      const ha = wa - m,
        hb = wb + m,
        ya = wy0 - m,
        yb = wy1 + m;
      if (ha > z + 1e-4) sideQuad(g, side, side * X, y0, y1, z, ha);
      sideQuad(g, side, side * X, yb, y1, ha, hb);
      sideQuad(g, side, side * X, y0, ya, ha, hb);
      const o = rrect(ha, hb, ya, yb, R, N);
      const corners: [number, number][] = [
        [hb, yb],
        [ha, yb],
        [ha, ya],
        [hb, ya],
      ];
      for (let c = 0; c < 4; c++)
        for (let i = 0; i < N; i++) {
          const p = o.p[c * (N + 1) + i],
            q = o.p[c * (N + 1) + i + 1];
          sideTri(g, side, [side * X, corners[c][1], corners[c][0]], [side * X, p[1], p[0]], [side * X, q[1], q[0]]);
        }
      z = hb;
      // gasket: three contours (lip edge on the panel, lip crown, reveal bottom at the glass) as strips
      g.color('#16191b');
      const sec: [number, number][] = [
        [0.018, X + 0.001],
        [0.0, X + 0.007],
        [-m, X - 0.024],
      ];
      const cont = sec.map(([off]) => rrect(ha - off, hb + off, ya - off, yb + off, Math.max(0.02, R + off), N));
      for (let k = 0; k < 2; k++) {
        const [d0, x0] = sec[k],
          [d1, x1] = sec[k + 1];
        // section normal (radial, x) pointing out of the body
        let nr = x1 - x0,
          nx = -(d1 - d0);
        if (nx < 0) {
          nr = -nr;
          nx = -nx;
        }
        const l = Math.hypot(nr, nx);
        nr /= l;
        nx /= l;
        const A = cont[k],
          B = cont[k + 1];
        const cnt = A.p.length;
        const base = g.vertexCount;
        for (let i = 0; i < cnt; i++) {
          const [dz, dy] = A.d[i];
          g.vert(side * x0, A.p[i][1], A.p[i][0], side * nx, dy * nr, dz * nr);
          g.vert(side * x1, B.p[i][1], B.p[i][0], side * nx, dy * nr, dz * nr);
        }
        for (let i = 0; i < cnt; i++) {
          const j = (i + 1) % cnt;
          const a0 = base + i * 2,
            a1 = a0 + 1,
            b0 = base + j * 2,
            b1 = b0 + 1;
          // contours run counter-clockwise in (z, y), outer → inner: (a0, b0, b1) faces −x
          if (side > 0) g.I.push(a0, b1, b0, a0, a1, b1);
          else g.I.push(a0, b0, b1, a0, b1, a1);
        }
      }
      // glass, set back in the gasket
      g.kind(T.WINDOW).color(C.glass);
      const gl = cont[2].p;
      const gx = side * (X - 0.024);
      const c0 = g.vert(gx, (wy0 + wy1) / 2, (wa + wb) / 2, side, 0, 0);
      const gb = g.vertexCount;
      for (const [pz, py] of gl) g.vert(gx, py, pz, side, 0, 0);
      for (let i = 0; i < gl.length; i++) {
        const j = (i + 1) % gl.length;
        if (side > 0) g.I.push(c0, gb + j, gb + i);
        else g.I.push(c0, gb + i, gb + j);
      }
      g.kind(T.PLAIN).color(color);
    }
    if (z1 > z + 1e-4) sideQuad(g, side, side * X, y0, y1, z, z1);
  }
}

/** a quad in the side plane x facing outwards (side ±1), spanning y0..y1 and za..zb */
function sideQuad(g: Geo, side: number, x: number, y0: number, y1: number, za: number, zb: number): void {
  if (side > 0) g.quad([x, y0, zb], [x, y0, za], [x, y1, za], [x, y1, zb]);
  else g.quad([x, y0, za], [x, y0, zb], [x, y1, zb], [x, y1, za]);
}

/** double-leaf sliding door pair at z (both sides) */
function doors(g: Geo, z: number, color: string): void {
  const w = 0.66,
    y0 = 1.13,
    y1 = 3.12;
  for (const side of [-1, 1] as const) {
    const x = side * 1.468;
    // vestibule behind the leaves (visible when open, lit at night): ray-traced floor / poles / far door (VESTIB)
    g.extra(z, 0, 0, 0);
    g.kind(T.VESTIB).color('#6b645c');
    if (side > 0) g.quad([x - 0.01, y0, z + w + 0.02], [x - 0.01, y0, z - w - 0.02], [x - 0.01, y1, z - w - 0.02], [x - 0.01, y1, z + w + 0.02]);
    else g.quad([x + 0.01, y0, z - w - 0.02], [x + 0.01, y0, z + w + 0.02], [x + 0.01, y1, z + w + 0.02], [x + 0.01, y1, z - w - 0.02]);
    g.extra(0, 0, 0, 0);
    for (const leaf of [-1, 1] as const) {
      const za = leaf < 0 ? z - w : z + 0.005,
        zb = leaf < 0 ? z - 0.005 : z + w;
      g.extra(0, 0, leaf, side);
      g.kind(T.DOOR).color(color);
      const xx = x + side * 0.006;
      if (side > 0) g.quad([xx, y0, zb], [xx, y0, za], [xx, y1, za], [xx, y1, zb]);
      else g.quad([xx, y0, za], [xx, y0, zb], [xx, y1, zb], [xx, y1, za]);
      // leaf window
      g.kind(T.DOORWIN).color(C.glass);
      const x2 = x + side * 0.011;
      const wa = za + 0.12,
        wb = zb - 0.12;
      if (side > 0) g.quad([x2, 2.2, wb], [x2, 2.2, wa], [x2, 2.95, wa], [x2, 2.95, wb]);
      else g.quad([x2, 2.2, wa], [x2, 2.2, wb], [x2, 2.95, wb], [x2, 2.95, wa]);
      // rubber: the window in its gasket, the thick nosing seal on the meeting edge, a thin one on the outer edge
      g.kind(T.DOOR).color('#121416');
      sideQuad(g, side, x + side * 0.0095, 2.17, 2.98, wa - 0.03, wb + 0.03);
      const xs = x + side * 0.009;
      if (leaf < 0) {
        sideQuad(g, side, xs, y0, y1, zb - 0.03, zb);
        sideQuad(g, side, xs, y0, y1, za, za + 0.015);
      } else {
        sideQuad(g, side, xs, y0, y1, za, za + 0.03);
        sideQuad(g, side, xs, y0, y1, zb - 0.015, zb);
      }
      sideQuad(g, side, xs, y0, y0 + 0.02, za, zb);
      // a grab-handle recess and the passenger button on the leading edge
      g.color('#2b2f33');
      sideQuad(g, side, xs + side * 0.001, 1.75, 2.0, leaf < 0 ? zb - 0.09 : za + 0.05, leaf < 0 ? zb - 0.05 : za + 0.09);
      // the illuminated open-door push button (ring lit green once the doors are released) on the right leaf
      if (leaf > 0) {
        g.kind(T.DOORBTN).color('#1c1e20');
        const bz = za + 0.16;
        const ring = (r: number, off: number) => {
          const pts: V3[] = [];
          for (let k = 0; k < 14; k++) {
            const a = (k / 14) * Math.PI * 2 * -side;
            pts.push([x + side * off, 2.05 + r * Math.sin(a), bz + r * Math.cos(a)]);
          }
          g.fan(pts, [side, 0, 0]);
        };
        ring(0.052, 0.012);
        g.color('#2fa84f');
        ring(0.04, 0.0135);
        g.color('#cfd3d6');
        ring(0.026, 0.0145);
      }
      g.extra(0, 0, 0, 0);
    }
    // the door portal: a dark surround round the opening (static), and the open-door button by the frame
    g.kind(T.PLAIN).color('#1a1c1f');
    sideQuad(g, side, x + side * 0.003, y0, y1 + 0.05, z - w - 0.06, z - w);
    sideQuad(g, side, x + side * 0.003, y0, y1 + 0.05, z + w, z + w + 0.06);
    sideQuad(g, side, x + side * 0.003, y1, y1 + 0.05, z - w, z + w);
    g.color('#2fa84f');
    sideQuad(g, side, x + side * 0.004, 1.95, 2.03, z + w + 0.012, z + w + 0.05);
    // door step
    g.kind(T.PLAIN).color('#9a9ea1');
    g.box(side * 1.4, 1.0, z, 0.16, 0.06, w * 2 + 0.1, 0);
  }
}

/** gangway: a steel frame on the end wall, bellows folds (alternately proud and set back), the face plate with its
 *  rubber buffer seal, and the semi-permanent drawbar coupling under it */
function gangway(g: Geo, z: number, dir: 1 | -1): void {
  g.kind(T.PLAIN).color('#3a3e41');
  g.box(0, 2.35, z + dir * 0.02, 2.06, 2.56, 0.04, 0);
  g.color(C.bellows);
  g.box(0, 2.35, z + dir * 0.21, 1.86, 2.36, 0.36, 0);
  for (let k = 0; k < 7; k++) {
    g.color(k % 2 ? '#1b1c1e' : '#323436');
    g.box(0, 2.35, z + dir * (0.07 + k * 0.045), k % 2 ? 1.88 : 1.97, k % 2 ? 2.38 : 2.47, 0.03, 0);
  }
  g.color('#45494c');
  g.box(0, 2.35, z + dir * 0.4, 1.94, 2.44, 0.025, 0);
  g.color('#151617');
  g.box(0, 2.35, z + dir * 0.415, 1.98, 2.48, 0.012, 0);
  // drawbar + coupler head under the gangway, air hoses either side
  g.color(C.buffer);
  g.box(0, 0.92, z + dir * 0.22, 0.2, 0.16, 0.44, 0);
  g.box(0, 0.92, z + dir * 0.4, 0.34, 0.26, 0.06, 0);
  g.color('#18191b');
  for (const sx of [-0.35, 0.35]) g.rod([sx, 0.95, z], [sx * 0.8, 0.78, z + dir * 0.38], 0.03, 5);
}

/**
 * One geometry for both EMU car types: shared body + cab-only parts (variant 1: nose, wedge
 * windshield, lamps) + middle-only parts (variant 2: front end/gangway, pantograph); the
 * shader collapses the parts of the other variant (aInst2.z = 1 for cab cars).
 */
export function buildEmu(): THREE.BufferGeometry {
  const g = new Geo();
  const L = EMU.len;
  const zr = -L / 2;
  const zF = L / 2;
  const zJ = zF - 1.3;
  g.variant(0);
  // the window band (band 2) is built per variant by piercedSide (rounded openings in rubber, glass set back)
  const bandsNoWin = EMU_BANDS.map((b, i) => (i === 2 ? { ...b, tag: -1 } : b));
  shell(g, EMU_PROF, bandsNoWin, zr, zJ, 5);
  emuUnderframe(g, zr, zF - 0.25);
  endWall(g, EMU_PROF, zr, -1, C.endWall);
  gangway(g, zr, -1);
  // bogies
  const bz = L / 2 - 2.6;
  bogie(g, -bz, EMU.wheelR, 2.3);
  bogie(g, bz - 0.1, EMU.wheelR, 2.3);
  // doors & windows (shared side layout; the front section differs per variant)
  const doorZ = [-L / 4 - 0.1, L / 4 - 0.75];
  for (const dz of doorZ) doors(g, dz, C.door);
  const pillar = 0.24;
  const span = (out: [number, number][], a: number, b: number, n: number) => {
    const w = (b - a - pillar * (n - 1)) / n;
    for (let i = 0; i < n; i++) out.push([a + i * (w + pillar), a + i * (w + pillar) + w]);
  };
  const dw = 0.72;
  const wins: [number, number][] = [];
  span(wins, doorZ[0] + dw + 0.22, doorZ[1] - dw - 0.22, 3);
  span(wins, zr + 0.45, doorZ[0] - dw - 0.22, 2);
  const zA = doorZ[1] + dw + 0.1;
  piercedSide(g, zr, zA, 2.05, 3.15, wins, 2.2, 2.98, C.cream);
  boxRoofUnit(g, -3.2, ROOF_Y - 0.04, 2.4);
  // rain gutters along the cant rail (a lip that catches the roof's run-off), roof drain spouts at the ends
  g.kind(T.PLAIN).color('#6e7375');
  for (const sx of [-1, 1]) {
    g.box(sx * 1.452, 3.36, (zr + zF) / 2, 0.024, 0.035, L - 0.1, 0);
    for (const ez of [zr + 0.25, zF - 0.25]) g.box(sx * 1.455, 3.2, ez, 0.03, 0.3, 0.04, 0);
  }

  // ── middle car only: body up to the front end, front gangway, front windows, pantograph
  g.variant(2);
  shell(g, EMU_PROF, bandsNoWin, zJ, zF, 5);
  endWall(g, EMU_PROF, zF, 1, C.endWall);
  gangway(g, zF, 1);
  const winsM: [number, number][] = [];
  span(winsM, doorZ[1] + dw + 0.22, zF - 0.45, 2);
  piercedSide(g, zA, zF, 2.05, 3.15, winsM, 2.2, 2.98, C.cream);
  pantograph(g, 2.9, ROOF_Y - 0.03, true);
  g.kind(T.PLAIN).color(C.insulator);
  g.cyl(0, ROOF_Y - 0.03, 0.8, 0.07, 0.06, 0.3, 6, 1);
  g.color('#3a3d3f');
  g.rod([0, ROOF_Y + 0.25, 0.8], [0, ROOF_Y + 0.28, 2.4], 0.025, 4);
  // main breaker + earthing switch housing, surge arrester, HV cable down to the roof bushing
  g.kind(T.PLAIN).color('#5b6064');
  g.box(0, ROOF_Y + 0.12, -0.55, 0.9, 0.32, 1.1, 8);
  g.color('#43474a');
  g.box(0, ROOF_Y + 0.29, -0.55, 0.7, 0.03, 0.9, 8);
  g.color(C.insulator);
  for (const iz of [-0.85, -0.25]) g.cyl(0.3, ROOF_Y + 0.27, iz, 0.05, 0.04, 0.22, 6, 1);
  g.color('#202224');
  g.rod([0.3, ROOF_Y + 0.48, -0.25], [0, ROOF_Y + 0.27, 0.8], 0.022, 4);
  g.rod([-0.35, ROOF_Y + 0.12, -1.1], [-0.6, ROOF_Y - 0.08, -2.0], 0.03, 4);
  // brake resistor grid box with louvred sides at the far end
  boxRoofUnit(g, 5.6, ROOF_Y - 0.04, 1.7, 1.3);

  // ── cab car only
  g.variant(1);
  const winsC: [number, number][] = [];
  span(winsC, doorZ[1] + dw + 0.22, zJ - 0.25, 1);
  piercedSide(g, zA, zJ, 2.05, 3.15, winsC, 2.2, 2.98, C.cream);
  boxRoofUnit(g, 3.4, ROOF_Y - 0.04, 1.3, 1.1);
  g.kind(T.PLAIN).color('#2a2d30');
  for (const [az, ax, ah] of [[1.2, 0.35, 0.26], [1.9, -0.3, 0.2], [0.4, 0.0, 0.42]] as const) {
    if (ah > 0.4) {
      g.rod([ax, ROOF_Y, az], [ax, ROOF_Y + ah, az], 0.012, 5); // whip
      g.box(ax, ROOF_Y + 0.01, az, 0.1, 0.03, 0.1, 8);
    } else {
      g.push().at(ax, ROOF_Y - 0.01, az).rotY(Math.PI / 2);
      g.prism([[-0.09, 0], [0.09, 0], [0.05, ah], [-0.02, ah]], -0.01, 0.01, 3); // blade
      g.pop();
    }
  }
  g.color('#3b3f42');
  g.box(0.55, ROOF_Y - 0.05, 4.9, 0.3, 0.16, 0.4, 8);
  g.color('#161819');
  for (const hx of [0.47, 0.63]) {
    g.push().at(hx, ROOF_Y - 0.05, 5.1).rotX(Math.PI / 2);
    g.cyl(0, 0, 0, 0.05, 0.05, 0.02, 8, 1); // horn bells facing forward
    g.pop();
  }
    // ── cab: lower nose block (with chamfered front corners) + wedge windshield above
    const yTop = 2.05;
    const ch = 0.24;
    const lower: Prof = [
      [1.3, 0.95],
      [1.45, 1.15],
      [1.45, yTop],
    ];
    shell(g, lower, EMU_BANDS.slice(0, 2), zJ, zF - ch, 99);
    // chamfers + front face, banded
    const bandsY: [number, number, string, number][] = [
      [0.95, 1.15, C.skirt, T.PLAIN],
      [1.15, yTop, '#ffffff', T.LIVERY],
    ];
    for (const [ya, yb, col, tag] of bandsY) {
      const xa = ya < 1.0 ? 1.3 : 1.45;
      g.kind(tag).color(col);
      for (const s of [-1, 1]) {
        const xFront = 1.2 * s;
        if (s > 0) g.quad([xFront * (xa / 1.45), ya, zF], [xa, ya, zF - ch], [1.45, yb, zF - ch], [xFront, yb, zF]);
        else g.quad([-xa, ya, zF - ch], [xFront * (xa / 1.45), ya, zF], [xFront, yb, zF], [-1.45, yb, zF - ch]);
      }
      g.quad([-1.2 * (xa / 1.45), ya, zF], [1.2 * (xa / 1.45), ya, zF], [1.2, yb, zF], [-1.2, yb, zF]);
    }
    // ledge on top of the lower nose
    g.kind(T.LIVERY).color('#ffffff');
    g.fan(
      [
        [-1.45, yTop, zF - ch],
        [-1.2, yTop, zF],
        [1.2, yTop, zF],
        [1.45, yTop, zF - ch],
      ],
      [0, 1, 0],
    );
    // upper wedge: body profile above yTop cut by the sloped windshield plane
    const upper: Prof = EMU_PROF.filter((p) => p[1] >= yTop);
    const yCrown = ROOF_Y;
    const zLow = zF - ch,
      zHigh = zJ + 0.05;
    const zFront = (y: number) => zLow + ((zHigh - zLow) * (y - yTop)) / (yCrown - yTop);
    const upperBands = EMU_BANDS.slice(EMU_BANDS.length - (upper.length - 1));
    shell(g, upper, upperBands, zJ, zJ, 3, zFront);
    // front plane polygon (livery), then windshield glass and fittings on it
    const fp: V3[] = [];
    for (const [x, y] of upper) fp.push([x, y, zFront(y)]);
    for (let i = upper.length - 2; i >= 0; i--) fp.push([-upper[i][0], upper[i][1], zFront(upper[i][1])]);
    const pn = new THREE.Vector3(0, zHigh - zLow, yCrown - yTop).normalize(); // plane normal (forward-up)
    // fan from the centroid; the list runs up the right side then down the left (clockwise seen from the front) → reverse
    {
      g.kind(T.LIVERY).color('#ffffff');
      const poly = fp.slice().reverse();
      let cx = 0,
        cy = 0,
        cz = 0;
      for (const p of poly) {
        cx += p[0];
        cy += p[1];
        cz += p[2];
      }
      cx /= poly.length;
      cy /= poly.length;
      cz /= poly.length;
      const c0 = g.vert(cx, cy, cz, pn.x, pn.y, pn.z);
      const b0 = g.vertexCount;
      for (const p of poly) g.vert(p[0], p[1], p[2], pn.x, pn.y, pn.z);
      for (let i = 0; i < poly.length; i++) g.I.push(c0, b0 + ((i + 1) % poly.length), b0 + i);
    }
    const onPlane = (x: number, y: number, off: number): V3 => [x, y + pn.y * off, zFront(y) + pn.z * off];
    // windshield (dark glass with a black surround)
    g.kind(T.PLAIN).color('#15191c');
    g.quad(onPlane(-1.3, 2.17, 0.008), onPlane(1.3, 2.17, 0.008), onPlane(1.27, 3.5, 0.008), onPlane(-1.27, 3.5, 0.008));
    g.kind(T.GLASS).color('#1f2b33');
    g.quad(onPlane(-1.22, 2.25, 0.016), onPlane(1.22, 2.25, 0.016), onPlane(1.18, 3.32, 0.016), onPlane(-1.18, 3.32, 0.016));
    // centre pillar
    g.kind(T.PLAIN).color('#15191c');
    g.quad(onPlane(-0.035, 2.25, 0.02), onPlane(0.035, 2.25, 0.02), onPlane(0.035, 3.32, 0.02), onPlane(-0.035, 3.32, 0.02));
    // destination display + top headlight
    g.kind(T.DEST).color(C.dest);
    g.quad(onPlane(-0.62, 3.36, 0.02), onPlane(0.62, 3.36, 0.02), onPlane(0.62, 3.47, 0.02), onPlane(-0.62, 3.47, 0.02));
    g.kind(T.PLAIN).color(C.lampRim);
    g.quad(onPlane(-0.12, 3.55, 0.012), onPlane(0.12, 3.55, 0.012), onPlane(0.12, 3.7, 0.012), onPlane(-0.12, 3.7, 0.012));
    g.kind(T.HEAD).color(C.headOff);
    g.quad(onPlane(-0.08, 3.58, 0.02), onPlane(0.08, 3.58, 0.02), onPlane(0.08, 3.67, 0.02), onPlane(-0.08, 3.67, 0.02));
    // wipers
    g.kind(T.PLAIN).color('#111315');
    for (const sx of [-0.55, 0.55]) g.quad(onPlane(sx - 0.02, 2.28, 0.024), onPlane(sx + 0.02, 2.28, 0.024), onPlane(sx + 0.25, 2.95, 0.024), onPlane(sx + 0.21, 2.95, 0.024));
    // cab side windows (dark, trapezoids following the slope)
    for (const side of [-1, 1]) {
      const x = side * 1.462;
      const zb0 = zFront(2.32) - 0.18,
        zb1 = zFront(3.0) - 0.15;
      g.kind(T.GLASS).color(C.glass);
      if (side > 0) g.quad([x, 2.32, zb0], [x, 2.32, zJ + 0.15], [x, 3.0, zJ + 0.15], [x, 3.0, zb1]);
      else g.quad([x, 2.32, zJ + 0.15], [x, 2.32, zb0], [x, 3.0, zb1], [x, 3.0, zJ + 0.15]);
    }
    // front lamps on the lower nose face: headlights inboard, tail lights outboard (dark surrounds)
    for (const sx of [-1, 1]) {
      g.kind(T.PLAIN).color(C.lampRim);
      g.box(sx * 0.9, 1.6, zF + 0.004, 0.62, 0.3, 0.01, 0);
      g.kind(T.HEAD).color(C.headOff);
      g.push().at(sx * 0.78, 1.6, zF + 0.01).rotX(Math.PI / 2);
      g.cyl(0, 0, 0, 0.1, 0.1, 0.012, 10, 1);
      g.pop();
      g.kind(T.TAIL).color(C.tailOff);
      g.push().at(sx * 1.08, 1.6, zF + 0.01).rotX(Math.PI / 2);
      g.cyl(0, 0, 0, 0.065, 0.065, 0.012, 8, 1);
      g.pop();
    }
    // coupler, skirt / snowplough
    // automatic (Scharfenberg-type) coupler: draft gear housing, shank, a square head with the cone and funnel
    // face, an electrical contact box under it and the hoses; the head cover hinged up
    g.kind(T.PLAIN).color('#1f2224');
    g.box(0, 0.95, zF + 0.06, 0.34, 0.24, 0.2, 0);
    g.color('#2a2d30');
    g.rod([0, 0.95, zF + 0.12], [0, 0.95, zF + 0.42], 0.06, 8, 1);
    g.color('#3a3e42');
    g.box(0, 0.95, zF + 0.47, 0.3, 0.3, 0.1, 0);
    g.color('#c9ccce');
    g.rod([0.07, 0.99, zF + 0.52], [0.07, 0.99, zF + 0.57], 0.03, 6, 1);
    g.color('#111214');
    g.rod([-0.07, 0.91, zF + 0.515], [-0.07, 0.91, zF + 0.525], 0.045, 8, 1);
    g.color('#26292c');
    g.box(0, 0.74, zF + 0.44, 0.26, 0.12, 0.12, 0);
    g.color('#c79a2c');
    g.box(0, 1.15, zF + 0.43, 0.32, 0.03, 0.16, 0);
    g.color('#18191b');
    for (const sx of [-0.28, 0.28]) g.rod([sx, 0.98, zF - 0.02], [sx * 0.6, 0.8, zF + 0.3], 0.025, 5);
    g.color('#2b2f32');
    g.quad([-1.15, 0.62, zF - 0.02], [1.15, 0.62, zF - 0.02], [1.2, 0.95, zF - 0.12], [-1.2, 0.95, zF - 0.12]);
    g.box(0, 0.78, zF - 0.4, 2.3, 0.34, 0.5, 4);
  g.variant(0);
  return g.build({ anim: false, extra: true });
}

// ───────────────────────────────────────────── electric locomotive

const LOCO_PROF: Prof = [
  [1.32, 1.05],
  [1.42, 1.2],
  [1.42, 2.0],
  [1.42, 2.16],
  [1.42, 3.45],
  [1.36, 3.64],
  [1.12, 3.78],
  [0, 3.82],
];
const LOCO_BANDS: Band[] = [
  { color: C.skirt, tag: T.PLAIN },
  { color: '#ffffff', tag: T.LIVERY },
  { color: C.white, tag: T.PLAIN },
  { color: '#ffffff', tag: T.LIVERY },
  { color: C.roof, tag: T.PLAIN },
  { color: C.roof, tag: T.PLAIN },
  { color: C.roof, tag: T.PLAIN },
];

export function buildLoco(): THREE.BufferGeometry {
  const g = new Geo();
  const L = FREIGHT.locoLen;
  const zF = L / 2;
  const cab = 1.0; // windshield setback
  const zJ = zF - cab;
  shell(g, LOCO_PROF, LOCO_BANDS, -zJ, zJ, 5);
  g.kind(T.PLAIN).color(C.under);
  g.quad([1.32, 1.05, -zF], [1.32, 1.05, zF], [-1.32, 1.05, zF], [-1.32, 1.05, -zF]);
  for (const end of [1, -1] as const) {
    // each end: lower front (yellow warning), sloped windshield plane up to the roof
    const yTop = 2.3;
    const zEnd = end * zF;
    const lower: Prof = LOCO_PROF.filter((p) => p[1] <= yTop).concat([[1.42, yTop]]);
    // lower block sides
    g.push();
    if (end < 0) g.rotY(Math.PI);
    shell(g, lower, [LOCO_BANDS[0], LOCO_BANDS[1], LOCO_BANDS[2], LOCO_BANDS[3]], zJ, zF - 0.05, 99);
    // front face (yellow) + top ledge
    g.kind(T.PLAIN).color(C.yellow);
    g.quad([-1.42, 1.2, zF - 0.05], [1.42, 1.2, zF - 0.05], [1.42, yTop, zF - 0.05], [-1.42, yTop, zF - 0.05]);
    g.color(C.skirt);
    g.quad([-1.32, 1.05, zF - 0.05], [1.32, 1.05, zF - 0.05], [1.42, 1.2, zF - 0.05], [-1.42, 1.2, zF - 0.05]);
    g.color(C.yellow);
    g.quad([-1.42, yTop, zF - 0.05], [1.42, yTop, zF - 0.05], [1.42, yTop, zF - 0.32], [-1.42, yTop, zF - 0.32]);
    // upper sloped plane
    const upper: Prof = LOCO_PROF.filter((p) => p[1] >= yTop);
    upper.unshift([1.42, yTop]);
    const zLow = zF - 0.32,
      zHigh = zJ;
    const yCrown = 3.82;
    const zFront = (y: number) => zLow + ((zHigh - zLow) * (y - yTop)) / (yCrown - yTop);
    shell(g, upper, [LOCO_BANDS[3], LOCO_BANDS[4], LOCO_BANDS[5], LOCO_BANDS[6]], zJ, zJ, 2, zFront);
    const pn = new THREE.Vector3(0, zHigh - zLow, yCrown - yTop).normalize();
    {
      const fp: V3[] = [];
      for (const [x, y] of upper) fp.push([x, y, zFront(y)]);
      for (let i = upper.length - 2; i >= 0; i--) fp.push([-upper[i][0], upper[i][1], zFront(upper[i][1])]);
      g.kind(T.PLAIN).color(C.yellow);
      const poly = fp.slice().reverse();
      let cx = 0,
        cy = 0,
        cz = 0;
      for (const p of poly) {
        cx += p[0];
        cy += p[1];
        cz += p[2];
      }
      cx /= poly.length;
      cy /= poly.length;
      cz /= poly.length;
      const c0 = g.vert(cx, cy, cz, pn.x, pn.y, pn.z);
      const b0 = g.vertexCount;
      for (const p of poly) g.vert(p[0], p[1], p[2], pn.x, pn.y, pn.z);
      for (let i = 0; i < poly.length; i++) g.I.push(c0, b0 + ((i + 1) % poly.length), b0 + i);
    }
    const onPlane = (x: number, y: number, off: number): V3 => [x, y + pn.y * off, zFront(y) + pn.z * off];
    g.kind(T.PLAIN).color('#15191c');
    g.quad(onPlane(-1.28, 2.42, 0.008), onPlane(1.28, 2.42, 0.008), onPlane(1.24, 3.42, 0.008), onPlane(-1.24, 3.42, 0.008));
    g.kind(T.GLASS).color('#1f2b33');
    g.quad(onPlane(-1.18, 2.5, 0.016), onPlane(-0.06, 2.5, 0.016), onPlane(-0.06, 3.32, 0.016), onPlane(-1.14, 3.32, 0.016));
    g.quad(onPlane(0.06, 2.5, 0.016), onPlane(1.18, 2.5, 0.016), onPlane(1.14, 3.32, 0.016), onPlane(0.06, 3.32, 0.016));
    // lamps (head inboard, tail outboard) on the yellow face
    for (const sx of [-1, 1]) {
      g.kind(T.PLAIN).color(C.lampRim);
      g.box(sx * 0.95, 1.72, zF - 0.045, 0.55, 0.26, 0.01, 0);
      g.kind(end > 0 ? T.HEAD : T.PLAIN).color(C.headOff);
      g.push().at(sx * 0.83, 1.72, zF - 0.04).rotX(Math.PI / 2);
      g.cyl(0, 0, 0, 0.09, 0.09, 0.012, 10, 1);
      g.pop();
      g.kind(end > 0 ? T.TAIL : T.PLAIN).color(C.tailOff);
      g.push().at(sx * 1.1, 1.72, zF - 0.04).rotX(Math.PI / 2);
      g.cyl(0, 0, 0, 0.06, 0.06, 0.012, 8, 1);
      g.pop();
    }
    g.kind(end > 0 ? T.HEAD : T.PLAIN).color(C.headOff);
    g.quad(onPlane(-0.09, 3.5, 0.02), onPlane(0.09, 3.5, 0.02), onPlane(0.09, 3.6, 0.02), onPlane(-0.09, 3.6, 0.02));
    // buffers + coupling hook + buffer beam
    g.kind(T.PLAIN).color('#2a2d30');
    g.box(0, 1.0, zF - 0.02, 2.7, 0.3, 0.12, 0);
    g.color(C.buffer);
    for (const sx of [-0.85, 0.85]) {
      g.push().at(sx, 1.05, zF).rotX(Math.PI / 2);
      g.cyl(0, 0, 0, 0.09, 0.09, 0.42, 8, 0);
      g.cyl(0, 0.42, 0, 0.19, 0.19, 0.05, 10, 1);
      g.pop();
    }
    g.color('#202224');
    g.box(0, 1.0, zF + 0.2, 0.18, 0.12, 0.3, 0);
    // cab side door + window
    for (const side of [-1, 1]) {
      const x = side * 1.432;
      g.kind(T.PLAIN).color('#20262b');
      const za = zJ - 0.95,
        zb = zJ - 0.15;
      if (side > 0) g.quad([x, 1.3, zb], [x, 1.3, za], [x, 3.05, za], [x, 3.05, zb]);
      else g.quad([x, 1.3, za], [x, 1.3, zb], [x, 3.05, zb], [x, 3.05, za]);
      g.kind(T.GLASS).color(C.glass);
      const xx = x + side * 0.004;
      if (side > 0) g.quad([xx, 2.45, zb - 0.08], [xx, 2.45, za + 0.08], [xx, 3.0, za + 0.08], [xx, 3.0, zb - 0.08]);
      else g.quad([xx, 2.45, za + 0.08], [xx, 2.45, zb - 0.08], [xx, 3.0, zb - 0.08], [xx, 3.0, za + 0.08]);
    }
    g.pop();
  }
  // side grilles (machine room)
  for (const side of [-1, 1]) {
    const x = side * 1.432;
    for (let k = -2; k <= 2; k++) {
      const zc = k * 2.0;
      g.kind(T.PLAIN).color(C.grille);
      const za = zc - 0.75,
        zb = zc + 0.75;
      if (side > 0) g.quad([x, 2.45, zb], [x, 2.45, za], [x, 3.25, za], [x, 3.25, zb]);
      else g.quad([x, 2.45, za], [x, 2.45, zb], [x, 3.25, zb], [x, 3.25, za]);
      g.color('#3e4d5c');
      for (let s = 0; s < 6; s++) {
        const zz = za + 0.1 + s * 0.26;
        const xx = x + side * 0.006;
        if (side > 0) g.quad([xx, 2.5, zz + 0.05], [xx, 2.5, zz], [xx, 3.2, zz], [xx, 3.2, zz + 0.05]);
        else g.quad([xx, 2.5, zz], [xx, 2.5, zz + 0.05], [xx, 3.2, zz + 0.05], [xx, 3.2, zz]);
      }
    }
  }
  // underframe tanks / boxes
  g.kind(T.PLAIN).color('#2d3033');
  g.box(0, 0.85, 0, 2.0, 0.42, 3.4, 4);
  bogie(g, -5.2, FREIGHT.locoWheelR, 2.6, true, 1.05);
  bogie(g, 5.2, FREIGHT.locoWheelR, 2.6, true, 1.05);
  // roof: two pantographs (rear raised), main breaker, roof line
  pantograph(g, -4.6, 3.79, true, true);
  pantograph(g, 4.6, 3.79, false);
  g.kind(T.PLAIN).color(C.insulator);
  for (const z of [-1.6, 1.6]) g.cyl(0, 3.79, z, 0.08, 0.07, 0.35, 6, 1);
  g.color('#3a3d3f');
  g.rod([0, 4.12, -3.8], [0, 4.12, 3.8], 0.03, 4);
  boxRoofUnit(g, 0, 3.78, 2.2, 1.6);
  return g.build({ anim: false, extra: true });
}

// ───────────────────────────────────────────── container wagon

function container(g: Geo, z0: number, z1: number, tag: number): void {
  const y0 = 1.27,
    h = 2.59,
    hw = 1.22;
  g.kind(tag).color('#ffffff');
  g.box(0, y0 + h / 2, (z0 + z1) / 2, hw * 2, h, z1 - z0, 8);
  // corner posts / castings (dark-ish, tinted) + door bars on the rear end
  g.color('#c9c9c9');
  for (const sx of [-1, 1]) {
    for (const z of [z0, z1]) g.box(sx * (hw - 0.04), y0 + h / 2, z + (z === z0 ? 0.04 : -0.04), 0.1, h + 0.01, 0.1, 8);
    g.box(sx * (hw - 0.02), y0 + h - 0.06, (z0 + z1) / 2, 0.06, 0.12, z1 - z0 - 0.1, 8);
    g.box(sx * (hw - 0.02), y0 + 0.06, (z0 + z1) / 2, 0.06, 0.12, z1 - z0 - 0.1, 8);
  }
  g.kind(tag).color('#4a4a48');
  for (const sx of [-0.75, -0.3, 0.3, 0.75]) g.box(sx, y0 + h / 2, z0 - 0.012, 0.04, h - 0.3, 0.02, 0);
}

export function buildWagon(): THREE.BufferGeometry {
  const g = new Geo();
  const L = FREIGHT.wagonLen;
  const zF = L / 2 - 0.45;
  // frame: deck sills + headstocks
  g.kind(T.PLAIN).color(C.frame);
  g.box(0, 1.08, 0, 0.5, 0.36, zF * 2, 0);
  for (const sx of [-1, 1]) g.box(sx * 1.25, 1.12, 0, 0.12, 0.3, zF * 2, 0);
  for (const z of [-zF, zF]) g.box(0, 1.08, z, 2.7, 0.38, 0.22, 0);
  // cross members
  g.color('#3f3a37');
  for (let k = -3; k <= 3; k++) g.box(0, 1.2, k * 1.75, 2.4, 0.1, 0.12, 0);
  // spigots
  g.color('#d0b23c');
  for (const sx of [-1, 1]) for (const z of [-6.05, -0.05, 0.05, 6.05]) g.box(sx * 1.15, 1.29, z, 0.1, 0.06, 0.1, 0);
  // buffers and hooks
  g.color(C.buffer);
  for (const z of [-zF, zF]) {
    const s = Math.sign(z);
    for (const sx of [-0.85, 0.85]) {
      g.push().at(sx, 1.05, z).rotX((s * Math.PI) / 2);
      g.cyl(0, 0, 0, 0.08, 0.08, 0.38, 8, 0);
      g.cyl(0, 0.38, 0, 0.18, 0.18, 0.05, 10, 1);
      g.pop();
    }
  }
  // end-of-train marker lamps (+Z end, lit when trailing)
  g.kind(T.TAIL).color(C.tailOff);
  for (const sx of [-1.05, 1.05]) g.box(sx, 1.42, zF + 0.12, 0.14, 0.14, 0.06, 0);
  g.kind(T.PLAIN).color('#2a2a2a');
  for (const sx of [-1.05, 1.05]) g.box(sx, 1.25, zF + 0.1, 0.04, 0.2, 0.04, 0);
  // brake cylinder / air tank
  g.color('#2d3033');
  g.push().at(0.6, 0.78, 0).rotX(Math.PI / 2);
  g.cyl(0, -1.0, 0, 0.18, 0.18, 2.0, 8, 3);
  g.pop();
  bogie(g, -4.55, FREIGHT.wagonWheelR, 1.8, false, 0.9, true);
  bogie(g, 4.55, FREIGHT.wagonWheelR, 1.8, false, 0.9, true);
  // loads
  container(g, -6.1, 6.1, T.CONT40);
  container(g, -6.1, -0.04, T.CONT20A);
  container(g, 0.04, 6.1, T.CONT20B);
  return g.build({ anim: false, extra: true });
}
