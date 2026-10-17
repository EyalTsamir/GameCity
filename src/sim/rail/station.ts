// Tinyhaven Central — the platform (the station building itself belongs to the landmarks
// module): raised platform with brick walls, coping, tactile strip and safety line, stairs
// and ramps down to the concourse, a Victorian canopy on cast-iron columns with dagger-board
// valances and strip lights, benches, bins, lamp posts, a double-faced clock and the frames
// for the name signs / departure board (their faces are a separate canvas mesh, signs.ts).

import * as THREE from 'three';
import type { StationDef } from '../../core/plan';
import { Geo, type V3 } from './geo';
import { K, ANIM } from './staticMaterial';

export interface SignSlot {
  kind: 'name' | 'board' | 'number' | 'poster';
  x: number;
  y: number;
  z: number;
  /** width / height of the face */
  w: number;
  h: number;
  /** face normal along +z (1) or -z (-1); double sided when `both` */
  both: boolean;
  normal: 1 | -1;
}

export interface StationBuild {
  signs: SignSlot[];
  /** world positions of lamp heads (for night halos) */
  lamps: { x: number; y: number; z: number; size: number }[];
  /** clock centre */
  clock: { x: number; y: number; z: number };
  /** canopy extent */
  canopy: { x0: number; x1: number; z0: number; z1: number; y: number };
  /** canopy strip lights (world centres) */
  strips: { x: number; y: number; z: number }[];
}

const C = {
  brick: '#8e5040',
  coping: '#d3cec1',
  white: '#f2efe6',
  tactile: '#d4b448',
  paving: '#d2c9b8',
  step: '#c8c2b6',
  iron: '#2f4a3d',
  ironDark: '#243a30',
  roofTop: '#4c5860',
  roofUnder: '#ece3cf',
  valance: '#f1ebdf',
  gutter: '#3a4248',
  wood: '#8a5a3a',
  bin: '#2f4a3d',
  ticket: '#2f5f9e',
  frame: '#26292b',
};

export function buildStation(g: Geo, st: StationDef): StationBuild {
  const P = st.platform;
  const Y = st.platformY;
  const zN = P.z0,
    zS = P.z1;
  const xW = P.x0,
    xE = P.x1;
  const zMid = (zN + zS) / 2;
  const lamps: StationBuild['lamps'] = [];
  const strips: StationBuild['strips'] = [];
  const signs: SignSlot[] = [];

  // ── platform body: brick walls (track side, concourse side, ends)
  g.kind(K.BRICK).color(C.brick);
  g.quad([xE, 0, zN], [xW, 0, zN], [xW, Y - 0.12, zN], [xE, Y - 0.12, zN]); // north (faces -z)
  g.quad([xW, 0, zS], [xE, 0, zS], [xE, Y, zS], [xW, Y, zS]); // south (+z)
  g.quad([xW, 0, zN], [xW, 0, zS], [xW, Y, zS], [xW, Y, zN]); // west (-x)
  g.quad([xE, 0, zS], [xE, 0, zN], [xE, Y, zN], [xE, Y, zS]); // east (+x)
  // top surface layers
  const strip = (za: number, zb: number, y: number, kind: number, col: string) => {
    g.kind(kind).color(col);
    g.quad([xW, y, zb], [xE, y, zb], [xE, y, za], [xW, y, za]);
  };
  // coping stones with an overhanging lip toward the track
  g.kind(K.CONCRETE).color(C.coping);
  g.box(0, Y - 0.045, zN + 0.2, xE - xW + 0.02, 0.13, 0.52, 8);
  g.color(C.coping, 0.86);
  g.quad([xE, Y - 0.12, zN - 0.06], [xW, Y - 0.12, zN - 0.06], [xW, Y - 0.12, zN + 0.4], [xE, Y - 0.12, zN + 0.4]);
  strip(zN + 0.46, zN + 0.55, Y + 0.009, K.PLAIN, C.white);
  strip(zN + 0.55, zN + 0.95, Y + 0.009, K.TACTILE, C.tactile);
  strip(zN + 0.95, zS - 0.3, Y + 0.006, K.PAVING, C.paving);
  g.kind(K.CONCRETE).color(C.coping);
  g.box(0, Y - 0.02, zS - 0.15, xE - xW + 0.02, 0.06, 0.32, 8);
  // end copings
  for (const x of [xW + 0.15, xE - 0.15]) g.box(x, Y - 0.02, zMid + 0.2, 0.3, 0.07, zS - zN - 0.5, 8 | 16 | 32);

  // ── stairs (centre) and ramps (both ends) down to the concourse on the south side
  const stairs = [{ x: 0, w: 6 }];
  const risers = 6;
  const rise = Y / risers,
    tread = 0.31;
  const runEnd = zS + (risers - 1) * tread;
  for (const s of stairs) {
    for (let i = 0; i < risers - 1; i++) {
      const top = Y - rise * (i + 1);
      const z0 = zS + i * tread;
      g.kind(K.CONCRETE).color(C.step, i % 2 === 0 ? 1 : 0.96);
      g.box(s.x, top / 2, z0 + tread / 2, s.w, top, tread, 8 | 32);
      // yellow nosing line
      g.kind(K.PLAIN).color('#e9d27a');
      g.box(s.x, top + 0.004, z0 + 0.04, s.w, 0.01, 0.05, 8 | 32);
    }
    // cheek walls (brick, sloped coping)
    for (const sx of [-1, 1]) {
      const cx = s.x + sx * (s.w / 2 + 0.15);
      g.kind(K.BRICK).color(C.brick);
      g.push().at(cx, 0, 0, -Math.PI / 2);
      g.prism(
        [
          [zS, 0],
          [runEnd + 0.1, 0],
          [runEnd + 0.1, 0.25],
          [zS, Y + 0.25],
        ],
        -0.15,
        0.15,
        3,
      );
      g.pop();
    }
  }

  // ramps: top at the platform edge (x = ±rampTop), descending outward to x = ±rampEnd
  const rampTop = 33.5,
    rampEnd = 43.5,
    rampLand = 31.8,
    rw = 1.7;
  for (const sx of [-1, 1]) {
    const xt = sx * rampTop,
      xb = sx * rampEnd;
    const za = zS,
      zb = zS + rw;
    g.kind(K.CONCRETE).color(C.step);
    // level landing where the ramp leaves the platform
    g.box(sx * (rampLand + rampTop) / 2, Y / 2, zS + rw / 2, rampTop - rampLand, Y, rw, 8 | 32);
    // sloped deck
    if (sx > 0) g.quad([xt, Y, zb], [xb, 0.02, zb], [xb, 0.02, za], [xt, Y, za]);
    else g.quad([xb, 0.02, zb], [xt, Y, zb], [xt, Y, za], [xb, 0.02, za]);
    // outer side wall (south face, triangle) + a level landing at the top
    g.kind(K.BRICK).color(C.brick);
    if (sx > 0) g.tri([xt, 0, zb], [xb, 0, zb], [xt, Y, zb]);
    else g.tri([xb, 0, zb], [xt, 0, zb], [xt, Y, zb]);
    g.quad(sx > 0 ? [xt, 0, za] : [xt, 0, zb], sx > 0 ? [xt, 0, zb] : [xt, 0, za], sx > 0 ? [xt, Y, zb] : [xt, Y, za], sx > 0 ? [xt, Y, za] : [xt, Y, zb]);
    // railing along the ramp's outer edge
    g.kind(K.PLAIN).color(C.iron);
    const n = 5;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = xt + (xb - xt) * t;
      const y = Y + (0.02 - Y) * t;
      g.block(x, y, zb - 0.06, 0.05, 0.95, 0.05);
    }
    g.beam([xt, Y + 0.95, zb - 0.06], [xb, 0.97, zb - 0.06], 0.05, 0.05);
    g.beam([xt, Y + 0.5, zb - 0.06], [xb, 0.52, zb - 0.06], 0.03, 0.03);
  }

  // ── south-edge railings between stairs and ramps, and across the platform ends
  g.kind(K.PLAIN).color(C.iron);
  const rails: [number, number][] = [
    [-rampLand, -3.3],
    [3.3, rampLand],
    [xW + 0.1, -rampTop],
    [rampTop, xE - 0.1],
  ];
  for (const [a, b] of rails) {
    const n = Math.max(1, Math.round((b - a) / 2.2));
    for (let k = 0; k <= n; k++) g.block(a + ((b - a) * k) / n, Y, zS - 0.12, 0.05, 1.0, 0.05);
    g.box((a + b) / 2, Y + 1.0, zS - 0.12, b - a, 0.05, 0.05, 0);
    g.box((a + b) / 2, Y + 0.55, zS - 0.12, b - a, 0.03, 0.03, 0);
  }
  for (const x of [xW + 0.12, xE - 0.12]) {
    for (let k = 0; k <= 2; k++) g.block(x, Y, zN + 0.9 + k * 1.3, 0.05, 1.0, 0.05);
    g.box(x, Y + 1.0, zN + 2.2, 0.05, 0.05, 2.7, 0);
    g.box(x, Y + 0.55, zN + 2.2, 0.03, 0.03, 2.7, 0);
  }

  // ── canopy on cast-iron columns
  const cx0 = -22,
    cx1 = 22;
  const ov = 1.4;
  const rx0 = cx0 - ov,
    rx1 = cx1 + ov;
  const ridgeY = Y + 4.4,
    eaveY = Y + 3.8;
  const eN = zN - 0.3,
    eS = zS + 0.35;
  const colZ = zMid;
  const cols: number[] = [];
  const colStep = (cx1 - cx0) / 5;
  for (let x = cx0; x <= cx1 + 1e-6; x += colStep) cols.push(x);
  for (const x of cols) {
    g.kind(K.PLAIN).color(C.iron);
    g.block(x, Y, colZ, 0.36, 0.32, 0.36);
    g.color(C.ironDark);
    g.block(x, Y + 0.32, colZ, 0.3, 0.06, 0.3);
    g.color(C.iron);
    g.cyl(x, Y + 0.38, colZ, 0.105, 0.09, eaveY - 0.55 - Y - 0.38, 10, 0);
    // fluted capital
    g.cyl(x, eaveY - 0.55, colZ, 0.09, 0.2, 0.22, 10, 1);
    g.color(C.ironDark);
    g.block(x, eaveY - 0.33, colZ, 0.46, 0.08, 0.46);
    // brackets (diagonal struts with a ring) to both eaves
    g.color(C.iron);
    for (const ez of [eN + 0.5, eS - 0.5]) {
      const ey = eaveY + ((ridgeY - eaveY) * (1 - Math.abs(ez - colZ) / (colZ - eN))) - 0.1;
      g.beam([x, eaveY - 0.9, colZ + Math.sign(ez - colZ) * 0.1], [x, ey - 0.05, ez], 0.07, 0.06);
      // decorative ring
      const mz = colZ + (ez - colZ) * 0.42;
      const my = eaveY - 0.9 + (ey - eaveY + 0.9) * 0.42 + 0.05;
      g.push().at(x, my, mz).rotZ(Math.PI / 2);
      g.cyl(0, -0.03, 0, 0.17, 0.17, 0.06, 10, 0);
      g.pop();
    }
  }
  // longitudinal beam on the columns
  g.kind(K.PLAIN).color(C.iron);
  g.box(0, eaveY - 0.22, colZ, rx1 - rx0 - 1.2, 0.2, 0.22, 0);
  // rafters at every column: ridge → eaves
  for (const x of cols) {
    g.beam([x, ridgeY - 0.14, colZ], [x, eaveY - 0.08, eN + 0.15], 0.08, 0.14);
    g.beam([x, ridgeY - 0.14, colZ], [x, eaveY - 0.08, eS - 0.15], 0.08, 0.14);
  }
  // roof slabs: top (slate), underside (cream)
  const T = 0.1;
  const roofPlane = (za: number, zb: number) => {
    // za at the ridge, zb at the eave
    const ya = ridgeY,
      yb = eaveY;
    g.kind(K.PLAIN).color(C.roofTop);
    if (zb < za) g.quad([rx0, ya, za], [rx1, ya, za], [rx1, yb, zb], [rx0, yb, zb]);
    else g.quad([rx1, ya, za], [rx0, ya, za], [rx0, yb, zb], [rx1, yb, zb]);
    g.color(C.roofUnder);
    if (zb < za) g.quad([rx0, yb - T, zb], [rx1, yb - T, zb], [rx1, ya - T, za], [rx0, ya - T, za]);
    else g.quad([rx1, yb - T, zb], [rx0, yb - T, zb], [rx0, ya - T, za], [rx1, ya - T, za]);
    // eave edge
    g.color(C.gutter);
    const s = Math.sign(zb - za);
    g.box(0, yb - T / 2, zb + s * 0.06, rx1 - rx0, T + 0.06, 0.12, 0);
  };
  roofPlane(colZ, eN);
  roofPlane(colZ, eS);
  // ridge cap
  g.color(C.gutter);
  g.box(0, ridgeY + 0.02, colZ, rx1 - rx0 + 0.04, 0.08, 0.24, 8);
  // roof seams (standing seams every 0.6 m on the slate) — subtle darker lines
  g.color(C.roofTop, 0.8);
  for (let x = rx0 + 0.6; x < rx1 - 0.3; x += 1.2) {
    for (const ez of [eN, eS]) {
      const s = Math.sign(ez - colZ);
      const a: V3 = [x, ridgeY + 0.012, colZ + s * 0.13];
      const b: V3 = [x, eaveY + 0.012, ez];
      g.beam(a, b, 0.03, 0.02);
    }
  }
  // gable ends (cream boards) closing the roof triangle
  for (const x of [rx0, rx1]) {
    const s = x < 0 ? -1 : 1;
    g.kind(K.PLAIN).color(C.valance);
    const tri: [V3, V3, V3] = [
      [x, eaveY - T, eN],
      [x, eaveY - T, eS],
      [x, ridgeY - T, colZ],
    ];
    if (s > 0) g.tri(tri[1], tri[0], tri[2]);
    else g.tri(tri[0], tri[1], tri[2]);
  }
  // dagger-board valances (both long eaves and both ends)
  const tooth = 0.19,
    vh = 0.42,
    td = 0.15;
  const valanceRun = (ax: number, az: number, bx: number, bz: number, yTop: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / tooth));
    const ux = (bx - ax) / len,
      uz = (bz - az) / len;
    // board outline in (u, y): top edge straight, bottom edge sawtooth
    const poly: [number, number][] = [];
    poly.push([0, yTop]);
    for (let i = 0; i <= n; i++) {
      const u = (len * i) / n;
      poly.push([u, yTop - vh + td]);
      if (i < n) poly.push([u + len / n / 2, yTop - vh]);
    }
    poly.push([len, yTop]);
    // frame: u along (ux, uz), normal = (uz, -ux) horizontal
    g.push();
    g.frame.multiply(new THREE.Matrix4().set(ux, 0, -uz, ax, 0, 1, 0, 0, uz, 0, ux, az, 0, 0, 0, 1));
    g.kind(K.PLAIN).color(C.valance);
    g.shape(poly, 0.025, 1);
    g.shape(poly, -0.025, -1);
    g.pop();
  };
  valanceRun(rx0, eN - 0.02, rx1, eN - 0.02, eaveY - 0.02);
  valanceRun(rx1, eS + 0.02, rx0, eS + 0.02, eaveY - 0.02);
  valanceRun(rx0 - 0.02, eS, rx0 - 0.02, eN, eaveY - 0.02);
  valanceRun(rx1 + 0.02, eN, rx1 + 0.02, eS, eaveY - 0.02);
  // strip lights under the ridge
  for (let x = cx0 + colStep / 2; x < cx1; x += colStep) {
    strips.push({ x, y: ridgeY - T - 0.27, z: colZ });
    g.kind(K.PLAIN).color('#d8d8d2');
    g.box(x, ridgeY - T - 0.2, colZ, 1.5, 0.08, 0.2, 0);
    g.kind(K.STRIP).color('#fbf6e9');
    g.box(x, ridgeY - T - 0.25, colZ, 1.38, 0.03, 0.14, 0);
    g.kind(K.PLAIN).color('#4a4e50');
    g.box(x, ridgeY - T - 0.1, colZ, 0.04, 0.16, 0.04, 0);
  }

  // ── benches (facing the track) and bins
  const benchXs = [-30.5, -17.6, -8.8, 8.8, 17.6, 30.5];
  for (const x of benchXs) {
    const bz = zMid + 0.85;
    g.kind(K.WOOD).color(C.wood);
    for (let k = 0; k < 3; k++) g.box(x, Y + 0.45, bz - 0.15 + k * 0.14, 1.8, 0.04, 0.11, 0);
    for (let k = 0; k < 2; k++) g.box(x, Y + 0.62 + k * 0.16, bz + 0.2, 1.8, 0.11, 0.035, 0);
    g.kind(K.PLAIN).color(C.ironDark);
    for (const lx of [-0.75, 0.75]) {
      g.block(x + lx, Y, bz - 0.15, 0.06, 0.45, 0.06);
      g.block(x + lx, Y, bz + 0.18, 0.06, 0.95, 0.06);
      g.box(x + lx, Y + 0.43, bz, 0.06, 0.05, 0.42, 0);
    }
    // bin beside every other bench
    if (Math.abs(x) > 15) {
      g.color(C.bin);
      g.cyl(x + 1.35 * Math.sign(x), Y, bz + 0.05, 0.2, 0.22, 0.75, 10, 1);
      g.color('#1c2b24');
      g.cyl(x + 1.35 * Math.sign(x), Y + 0.75, bz + 0.05, 0.23, 0.2, 0.05, 10, 1);
    }
  }

  // ── lamp posts beyond the canopy
  for (const x of [-43.5, -36.5, -29.5, 29.5, 36.5, 43.5]) {
    const lz = zMid;
    g.kind(K.PLAIN).color(C.iron);
    g.cyl(x, Y, lz, 0.13, 0.11, 0.35, 8, 1);
    g.cyl(x, Y + 0.35, lz, 0.06, 0.045, 3.0, 8, 0);
    g.color(C.ironDark);
    g.cyl(x, Y + 3.35, lz, 0.1, 0.14, 0.12, 8, 1);
    g.kind(K.LAMP).color('#fff3d0');
    g.cyl(x, Y + 3.47, lz, 0.13, 0.17, 0.42, 8, 0);
    g.kind(K.PLAIN).color(C.ironDark);
    g.cyl(x, Y + 3.89, lz, 0.22, 0.04, 0.2, 8, 0);
    g.sphere(x, Y + 4.12, lz, 0.05, 6, 4);
    lamps.push({ x, y: Y + 3.68, z: lz, size: 1.0 });
  }

  // ── hanging double-faced clock between two columns
  const clock = { x: colStep / 2, y: eaveY - 0.95, z: colZ };
  {
    const { x, y, z } = clock;
    g.kind(K.PLAIN).color(C.ironDark);
    g.box(x, eaveY - 0.33 - 0.25, z, 0.05, 0.42, 0.05, 0);
    g.color('#1f2a24');
    g.push().at(x, y, z).rotX(Math.PI / 2);
    g.cyl(0, -0.11, 0, 0.42, 0.42, 0.22, 16, 3);
    g.pop();
    for (const s of [1, -1] as const) {
      g.kind(K.CLOCK).color('#f6f1e4');
      g.push().at(x, y, z + s * 0.112).rotX((s * Math.PI) / 2);
      g.cyl(0, 0, 0, 0.36, 0.36, 0.004, 16, 1);
      g.pop();
      // hour marks
      g.kind(K.PLAIN).color('#1b1b1b');
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        const r = 0.3;
        g.box(x + Math.sin(a) * r * s, y + Math.cos(a) * r, z + s * 0.118, h % 3 === 0 ? 0.035 : 0.02, h % 3 === 0 ? 0.07 : 0.045, 0.006, 0);
      }
      // hands (built pointing at 12, rotated in the shader)
      g.anim(s * ANIM.HOUR, x, y, z);
      g.box(x, y + 0.09, z + s * 0.124, 0.035, 0.2, 0.006, 0);
      g.anim(s * ANIM.MINUTE, x, y, z);
      g.box(x, y + 0.13, z + s * 0.13, 0.022, 0.28, 0.006, 0);
      g.anim(0);
      g.color('#8a1c1c');
      g.box(x, y, z + s * 0.134, 0.04, 0.04, 0.006, 0);
    }
  }

  // ── sign frames hung from the longitudinal beam (faces in signs.ts)
  const hang = (x: number, w: number, h: number, kind: SignSlot['kind'], yC: number) => {
    g.kind(K.PLAIN).color(C.frame);
    g.box(x, yC, colZ, w + 0.1, h + 0.1, 0.08, 0);
    for (const dx of [-w / 2 + 0.15, w / 2 - 0.15]) g.box(x + dx, (yC + h / 2 + eaveY - 0.32) / 2, colZ, 0.03, eaveY - 0.32 - yC - h / 2, 0.03, 0);
    signs.push({ kind, x, y: yC, z: colZ, w, h, both: true, normal: 1 });
  };
  hang(-colStep * 1.5, 3.0, 0.46, 'name', eaveY - 0.75);
  hang(colStep * 1.5, 3.0, 0.46, 'name', eaveY - 0.75);
  hang(-colStep / 2, 2.3, 0.74, 'board', eaveY - 0.9);
  // platform number on a post by the stairs; poster board on the south railing side
  g.kind(K.PLAIN).color(C.iron);
  g.block(4.2, Y, zS - 0.45, 0.07, 2.3, 0.07);
  g.color(C.frame);
  g.box(4.2, Y + 2.3, zS - 0.45, 0.62, 0.62, 0.06, 0);
  signs.push({ kind: 'number', x: 4.2, y: Y + 2.3, z: zS - 0.45, w: 0.55, h: 0.55, both: true, normal: 1 });
  // ticket machine near the stairs
  g.kind(K.PLAIN).color(C.ticket);
  g.block(-4.6, Y, zS - 0.6, 0.7, 1.6, 0.45);
  g.color('#d9dde0');
  g.box(-4.6, Y + 1.2, zS - 0.37, 0.5, 0.32, 0.02, 0);
  g.kind(K.WINDOW).color('#9fc3d9');
  g.box(-4.6, Y + 1.22, zS - 0.355, 0.36, 0.2, 0.01, 0);

  return { signs, lamps, clock, canopy: { x0: rx0, x1: rx1, z0: eN, z1: eS, y: ridgeY }, strips };
}
