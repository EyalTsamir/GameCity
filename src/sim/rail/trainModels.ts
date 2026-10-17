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
  const seg = 12;
  g.extra(r, z, 0, 0);
  for (const side of [-1, 1]) {
    const xo = side * (gaugeHalf + 0.065),
      xi = side * (gaugeHalf - 0.065);
    // tread
    g.kind(T.WHEEL).color(C.wheelTread);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const y0 = r + Math.cos(a0) * r,
        z0 = z + Math.sin(a0) * r;
      const y1 = r + Math.cos(a1) * r,
        z1 = z + Math.sin(a1) * r;
      const n0: V3 = [0, Math.cos(a0), Math.sin(a0)],
        n1: V3 = [0, Math.cos(a1), Math.sin(a1)];
      if (side > 0) withNormals(g, [xo, y0, z0], [xi, y0, z0], [xi, y1, z1], [xo, y1, z1], n0, n0, n1, n1);
      else withNormals(g, [xi, y0, z0], [xo, y0, z0], [xo, y1, z1], [xi, y1, z1], n0, n0, n1, n1);
    }
    // outer face: alternating sectors (spoke-like) + hub
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      g.color(i % 3 === 0 ? C.wheelDark : C.wheelFace);
      const p0: V3 = [xo, r, z],
        p1: V3 = [xo, r + Math.cos(a0) * r * 0.93, z + Math.sin(a0) * r * 0.93],
        p2: V3 = [xo, r + Math.cos(a1) * r * 0.93, z + Math.sin(a1) * r * 0.93];
      const i0 = g.vert(p0[0], p0[1], p0[2], side, 0, 0);
      g.vert(p1[0], p1[1], p1[2], side, 0, 0);
      g.vert(p2[0], p2[1], p2[2], side, 0, 0);
      if (side > 0) g.I.push(i0, i0 + 1, i0 + 2);
      else g.I.push(i0, i0 + 2, i0 + 1);
    }
    // rim ring on the outer face
    g.color(C.wheelTread);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const q0: V3 = [xo + side * 0.002, r + Math.cos(a0) * r * 0.93, z + Math.sin(a0) * r * 0.93];
      const q1: V3 = [xo + side * 0.002, r + Math.cos(a1) * r * 0.93, z + Math.sin(a1) * r * 0.93];
      const q2: V3 = [xo + side * 0.002, r + Math.cos(a1) * r, z + Math.sin(a1) * r];
      const q3: V3 = [xo + side * 0.002, r + Math.cos(a0) * r, z + Math.sin(a0) * r];
      if (side > 0) withNormals(g, q0, q3, q2, q1, [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]);
      else withNormals(g, q0, q1, q2, q3, [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]);
    }
  }
  // axle
  g.kind(T.WHEEL).color(C.wheelDark);
  g.rod([-gaugeHalf, r, z], [gaugeHalf, r, z], 0.07, 6);
  g.extra(0, 0, 0, 0);
}

/** two-axle bogie centred at z */
function bogie(g: Geo, z: number, r: number, wheelbase: number, heavy = false): void {
  for (const dz of [-wheelbase / 2, wheelbase / 2]) wheelset(g, z + dz, r);
  g.kind(T.PLAIN).color(C.bogie);
  const fx = 0.93;
  const len = wheelbase + (heavy ? 1.1 : 0.9);
  for (const s of [-1, 1]) {
    // side frame
    g.box(s * fx, r + 0.05, z, 0.14, heavy ? 0.42 : 0.32, len, 0);
    // axle boxes
    g.color(C.bogieLight);
    for (const dz of [-wheelbase / 2, wheelbase / 2]) g.box(s * fx, r, z + dz, 0.2, 0.26, 0.32, 0);
    // springs
    g.color(C.spring);
    for (const dz of [-wheelbase / 2, wheelbase / 2]) g.cyl(s * fx, r + 0.13, z + dz, 0.07, 0.07, 0.22, 6, 1);
    g.color(C.bogie);
  }
  // bolster / transom
  g.box(0, r + 0.12, z, fx * 2, 0.24, 0.5, 0);
  if (heavy) {
    // traction motors / brake cylinders
    g.color(C.bogieLight);
    for (const dz of [-wheelbase / 2 + 0.55, wheelbase / 2 - 0.55]) g.box(0, r + 0.02, z + dz, 1.1, 0.4, 0.45, 0);
  }
}

function boxRoofUnit(g: Geo, z: number, y: number, len: number, w = 1.5): void {
  g.kind(T.PLAIN).color(C.roofDark);
  g.box(0, y + 0.13, z, w, 0.26, len, 8);
  g.color('#6c7174');
  for (let k = -1; k <= 1; k++) g.box(0, y + 0.265, z + (k * len) / 3, w * 0.7, 0.01, 0.12, 8);
}

/** single-arm pantograph standing on the roof at (0, roofY, z); raised to the contact wire height */
function pantograph(g: Geo, z: number, roofY: number, raised: boolean, flip = false): void {
  const s = flip ? -1 : 1;
  // insulators + base frame
  g.kind(T.PLAIN).color(C.insulator);
  for (const dx of [-0.45, 0.45]) for (const dz of [-0.35, 0.35]) g.cyl(dx, roofY, z + dz, 0.06, 0.05, 0.24, 6, 1);
  g.color(C.panto);
  const by = roofY + 0.24;
  g.box(0, by + 0.04, z, 1.05, 0.08, 0.85, 0);
  const headY = raised ? 5.05 : by + 0.32;
  const hinge: V3 = [0, by + 0.1, z - s * 0.55];
  const knee: V3 = raised ? [0, (by + headY) / 2 + 0.12, z + s * 0.95] : [0, by + 0.2, z + s * 1.15];
  const head: V3 = [0, headY - 0.08, z - s * 0.08];
  for (const dx of [-0.24, 0.24]) g.rod([dx, hinge[1], hinge[2]], [dx * 0.4, knee[1], knee[2]], 0.035, 5);
  g.rod(knee, head, 0.03, 5);
  // push rod
  g.rod([0, by + 0.08, z - s * 0.25], [0, knee[1] - 0.05, knee[2] - s * 0.25], 0.018, 4);
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
}

function windowRow(g: Geo, zs: [number, number][], y0: number, y1: number): void {
  for (const side of [-1, 1]) {
    const x = side * 1.462;
    for (const [za, zb] of zs) {
      // rubber frame
      g.kind(T.PLAIN).color('#1d2226');
      if (side > 0) g.quad([x, y0 - 0.04, zb + 0.04], [x, y0 - 0.04, za - 0.04], [x, y1 + 0.04, za - 0.04], [x, y1 + 0.04, zb + 0.04]);
      else g.quad([x, y0 - 0.04, za - 0.04], [x, y0 - 0.04, zb + 0.04], [x, y1 + 0.04, zb + 0.04], [x, y1 + 0.04, za - 0.04]);
      g.kind(T.WINDOW).color(C.glass);
      const xx = x + side * 0.004;
      if (side > 0) g.quad([xx, y0, zb], [xx, y0, za], [xx, y1, za], [xx, y1, zb]);
      else g.quad([xx, y0, za], [xx, y0, zb], [xx, y1, zb], [xx, y1, za]);
    }
  }
}

/** double-leaf sliding door pair at z (both sides) */
function doors(g: Geo, z: number, color: string): void {
  const w = 0.66,
    y0 = 1.13,
    y1 = 3.12;
  for (const side of [-1, 1] as const) {
    const x = side * 1.468;
    // vestibule behind the leaves (visible when open, lit at night)
    g.kind(T.WINDOW).color('#6b645c');
    if (side > 0) g.quad([x - 0.01, y0, z + w + 0.02], [x - 0.01, y0, z - w - 0.02], [x - 0.01, y1, z - w - 0.02], [x - 0.01, y1, z + w + 0.02]);
    else g.quad([x + 0.01, y0, z - w - 0.02], [x + 0.01, y0, z + w + 0.02], [x + 0.01, y1, z + w + 0.02], [x + 0.01, y1, z - w - 0.02]);
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
      g.extra(0, 0, 0, 0);
    }
    // door step
    g.kind(T.PLAIN).color('#9a9ea1');
    g.box(side * 1.4, 1.0, z, 0.16, 0.06, w * 2 + 0.1, 0);
  }
}

function gangway(g: Geo, z: number, dir: 1 | -1): void {
  g.kind(T.PLAIN).color(C.bellows);
  g.box(0, 2.35, z + dir * 0.21, 1.9, 2.4, 0.42, 0);
  g.color('#1f2123');
  for (let k = 0; k < 4; k++) g.box(0, 2.35, z + dir * (0.06 + k * 0.1), 1.96, 2.46, 0.03, 0);
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
  shell(g, EMU_PROF, EMU_BANDS, zr, zJ, 5);
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
  windowRow(g, wins, 2.2, 2.98);
  boxRoofUnit(g, -3.2, ROOF_Y - 0.04, 2.4);

  // ── middle car only: body up to the front end, front gangway, front windows, pantograph
  g.variant(2);
  shell(g, EMU_PROF, EMU_BANDS, zJ, zF, 5);
  endWall(g, EMU_PROF, zF, 1, C.endWall);
  gangway(g, zF, 1);
  const winsM: [number, number][] = [];
  span(winsM, doorZ[1] + dw + 0.22, zF - 0.45, 2);
  windowRow(g, winsM, 2.2, 2.98);
  pantograph(g, 2.9, ROOF_Y - 0.03, true);
  g.kind(T.PLAIN).color(C.insulator);
  g.cyl(0, ROOF_Y - 0.03, 0.8, 0.07, 0.06, 0.3, 6, 1);
  g.color('#3a3d3f');
  g.rod([0, ROOF_Y + 0.25, 0.8], [0, ROOF_Y + 0.28, 2.4], 0.025, 4);

  // ── cab car only
  g.variant(1);
  const winsC: [number, number][] = [];
  span(winsC, doorZ[1] + dw + 0.22, zJ - 0.25, 1);
  windowRow(g, winsC, 2.2, 2.98);
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
    g.kind(T.PLAIN).color('#1f2224');
    g.box(0, 0.95, zF + 0.16, 0.3, 0.2, 0.34, 0);
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
  bogie(g, -5.2, FREIGHT.locoWheelR, 2.6, true);
  bogie(g, 5.2, FREIGHT.locoWheelR, 2.6, true);
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
  bogie(g, -4.55, FREIGHT.wagonWheelR, 1.8);
  bogie(g, 4.55, FREIGHT.wagonWheelR, 1.8);
  // loads
  container(g, -6.1, 6.1, T.CONT40);
  container(g, -6.1, -0.04, T.CONT20A);
  container(g, 0.04, 6.1, T.CONT20B);
  return g.build({ anim: false, extra: true });
}
