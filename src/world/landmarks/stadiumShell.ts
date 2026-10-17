// Haven Stadium exterior (audit item 10): the outer shell around the stands built in stadium.ts.
//   * brick facades between four corner stair towers: stone plinth, pilasters with stone bases and
//     caps, sill / string courses, a stepped cornice with brick parapet and coping;
//   * arched entrance gates with stone surrounds, keystones, iron gates and "GATE A…D" signs
//     (where the plan has doors), two exit gates and the club crest on the river (south) side;
//   * arched upper windows / louvred vents in every bay, glazed hospitality windows on the main stand;
//   * corner stair towers: quoins, stacked stair windows (lit at night), cornice, flags on the south
//     towers — the floodlight masts rise out of the north/south tower roofs;
//   * exposed lattice roof trusses ON the main-stand roof and the end-stand canopies (readable from above).
// Floodlight masts: lattice towers (legs + cut-out bracing) with a service platform and a tilted
// frame of 15 lamp housings. `?legacystadium` / `?legacyterrain` build the old shell.

import * as THREE from 'three';
import type { Feature } from '../../core/plan';
import { FLOOD, LM, LMODE, M, PAT, type Mat } from './builder';
import { wall, type Opening } from './facade';
import { C, flagpole, quoins, railing } from './parts';
import type { Env } from './env';
import { drawText, signQuad, type AtlasRect } from './signs';

export interface ShellSpec {
  /** outer wall plane (local, from the centre) */
  W: number;
  /** stand half length (towers start just beyond it) */
  LEN: number;
  facadeH: number[];
  standYaw: number[];
  /** plan doors in stadium-local coordinates */
  doors: { x: number; z: number; dir: string }[];
}

const SIDE_DIR = ['N', 'E', 'S', 'W'];

export function stadiumShell(env: Env, sp: ShellSpec): void {
  const K = env.S;
  const { W, standYaw, facadeH } = sp;
  const brick = M('#a14d36', PAT.BRICK, 0.9, 0, 0, FLOOD.WARM, 0.2);
  const brickD = M('#87402d', PAT.BRICK, 0.9, 0, 0, FLOOD.WARM, 0.55);
  const stone = M('#e2d6bd', PAT.PLAIN, 0.8, 0, 0, FLOOD.WARM, 0.1);
  const stoneD = M('#cdbfa3', PAT.STONE, 0.85, 0, 0, FLOOD.WARM, 0.4);
  const iron = M(C.iron, PAT.PLAIN, 0.5, 0.5);
  const TW0 = sp.LEN - 0.1; // tower inner edge
  const TW1 = W + 0.28; // tower outer face (lot footprint is W + 0.4)
  const WL = TW0 + 0.25; // facade half length: its ends disappear into the towers

  // ── atlas signs
  const gateSign = (txt: string): AtlasRect =>
    env.atlas.add(
      192,
      48,
      (g, w, h) => {
        g.fillStyle = '#7c1b20';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#e9d9a8';
        g.lineWidth = 3;
        g.strokeRect(4, 4, w - 8, h - 8);
        drawText(g, txt, w / 2, h / 2 + 2, 'bold 26px "Arial Black", Arial, sans-serif', '#f4e7c2', 3);
      },
      `stadium-gate:${txt}`,
    );
  const crest = env.atlas.add(
    160,
    160,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#e9dcc0';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b81d26';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#f4e7c2';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 20, 0, Math.PI * 2);
      g.stroke();
      drawText(g, 'HFC', w / 2, h / 2 - 4, 'bold 46px "Arial Black", Arial, sans-serif', '#ffffff', 2);
      drawText(g, '1897', w / 2, h / 2 + 34, 'bold 18px Arial, sans-serif', '#f4e7c2', 2);
      g.fillStyle = '#f2c94c';
      for (const dx of [-24, 0, 24]) {
        const cx = w / 2 + dx,
          cy = 34;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 7 : 3;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.fill();
      }
    },
    'stadium-crest',
  );

  // ── facades
  let gateNo = 0;
  for (let k = 0; k < 4; k++) {
    const ry = standYaw[k];
    const s = Math.sin(ry),
      c = Math.cos(ry);
    const H = facadeH[k];
    const main = k === 0;
    const south = k === 2;
    // local point from (u along the wall seen from outside, dep outward, y)
    const L = (u: number, dep: number): [number, number] => [u * c + dep * s, -u * s + dep * c];
    const box = (m: Mat, w: number, h: number, d: number, u: number, y: number, dep: number) => {
      const [x, z] = L(u, dep);
      K.box(m, w, h, d, x, y, z, ry);
    };
    const gates: number[] = [];
    for (const d of sp.doors) if (d.dir === SIDE_DIR[k]) gates.push(d.x * c - d.z * s);
    gates.sort((a, b) => a - b);
    const exits = south ? [-7.2, 7.2] : [];
    const gaps: [number, number][] = [...gates.map((u) => [u, 2.1] as [number, number]), ...exits.map((u) => [u, 1.65] as [number, number])];
    const blocked = (u: number, m: number) => gaps.some(([g, hw]) => Math.abs(u - g) < hw + m) || (south && Math.abs(u) < 1.9 + m);
    const ops: Opening[] = [];
    for (const u of gates) ops.push({ x: WL + u, y: 0, w: 3.4, h: 3.45, arch: 0.8, fill: 'dark', inset: 0.42, surround: stone, surroundW: 0.32, keystone: stone });
    for (const u of exits) ops.push({ x: WL + u, y: 0, w: 2.6, h: 2.9, arch: 0.6, fill: 'dark', inset: 0.38, surround: stone, surroundW: 0.26, keystone: stone });
    const bays = [-12, -7.2, -2.4, 2.4, 7.2, 12];
    for (let i = 0; i < bays.length; i++) {
      const bu = bays[i];
      if (blocked(bu, 0.55)) continue;
      const seed = 0.15 + (i % 4) * 0.2;
      if (main) {
        ops.push({ x: WL + bu, y: 5.35, w: 2.6, h: 2.15, fill: 'window', glow: 0.75, seed, surround: stone, surroundW: 0.14, sill: stone });
        ops.push({ x: WL + bu, y: 1.45, w: 1.5, h: 0.8, fill: 'louvre', inset: 0.18, surround: stone, surroundW: 0.1 });
      } else {
        ops.push({ x: WL + bu, y: 2.95, w: 1.7, h: 1.45, arch: 0.42, fill: 'window', glow: 0.35, seed, surround: stone, surroundW: 0.13, sill: stone });
        ops.push({ x: WL + bu, y: 1.25, w: 1.3, h: 0.7, fill: 'louvre', inset: 0.15 });
      }
    }
    wall(K, { w: 2 * WL, h: H, depth: 0.5, x: s * W, y: 0, z: c * W, ry, mat: brick, openings: ops });
    // horizontal courses broken at the gates
    const course = (m: Mat, y: number, h: number, proud: number, broken: boolean) => {
      let runs: [number, number][] = [[-WL, WL]];
      if (broken)
        for (const [g, hw] of gaps) {
          const next: [number, number][] = [];
          for (const [a, b] of runs) {
            if (g + hw <= a || g - hw >= b) next.push([a, b]);
            else {
              if (g - hw > a) next.push([a, g - hw]);
              if (g + hw < b) next.push([g + hw, b]);
            }
          }
          runs = next;
        }
      for (const [a, b] of runs) if (b - a > 0.2) box(m, b - a, h, 0.3 + proud, (a + b) / 2, y, W - 0.3 + (0.3 + proud) / 2);
    };
    course(stoneD, 0, 0.9, 0.07, true); // plinth
    course(stone, main ? 4.85 : 2.62, 0.2, 0.11, true); // string / sill course
    if (main) course(stone, 5.18, 0.14, 0.08, false);
    course(stone, H - 0.62, 0.22, 0.2, false); // cornice
    course(stone, H - 0.4, 0.22, 0.36, false);
    course(brickD, H - 0.18, 0.5, 0.0, false); // parapet
    course(stone, H + 0.32, 0.12, 0.08, false); // coping
    // pilasters (brick piers with stone bases and caps)
    for (const u of [-9.6, -4.8, 0, 4.8, 9.6]) {
      if (blocked(u, 0.5)) continue;
      box(stoneD, 0.98, 1.05, 0.42, u, 0, W + 0.12);
      box(brickD, 0.76, H - 1.75, 0.3, u, 1.05, W + 0.14);
      box(stone, 0.96, 0.3, 0.44, u, H - 1.0, W + 0.13);
    }
    // gates: iron gate inside the reveal, sign plate above, lanterns either side
    for (const u of gates) {
      const [ax, az] = L(u - 1.68, W - 0.3);
      const [bx, bz] = L(u + 1.68, W - 0.3);
      railing(env, [ax, 0, az], [bx, 0, bz], 3.2, '#2a3230');
      const letter = String.fromCharCode(65 + gateNo++);
      const [sx, sz] = L(u, W + 0.05);
      signQuad(env.T, gateSign(`GATE ${letter}`), 2.3, 0.58, sx, 4.68, sz, ry, 0.6);
      box(stone, 2.6, 0.82, 0.08, u, 4.56, W + 0.03);
      for (const side of [-1, 1]) {
        const [lx, lz] = L(u + side * 2.45, W + 0.02);
        lantern(env, lx, 3.0, lz, ry);
      }
    }
    for (const u of exits) {
      const [ax, az] = L(u - 1.3, W - 0.28);
      const [bx, bz] = L(u + 1.3, W - 0.28);
      railing(env, [ax, 0, az], [bx, 0, bz], 2.7, '#2a3230');
    }
    // the club crest in a stone roundel on the river facade
    if (south) {
      box(stone, 3.3, 3.3, 0.1, 0, 1.55, W + 0.05);
      const [cx, cz] = L(0, W + 0.11);
      signQuad(env.T, crest, 3.0, 3.0, cx, 1.7, cz, ry, 0.25);
    }
  }

  // ── corner stair towers (the floodlight masts rise out of their roofs)
  let flagN = 0;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const hw = (TW1 - TW0) / 2;
    const cx = (sx * (TW0 + TW1)) / 2,
      cz = (sz * (TW0 + TW1)) / 2;
    const north = sz < 0;
    const Ht = north ? facadeH[0] + 2.6 : facadeH[2] + 3.1;
    K.box(brick, 2 * hw, Ht, 2 * hw, cx, 0, cz);
    K.box(stoneD, 2 * hw + 0.1, 1.0, 2 * hw + 0.1, cx, 0, cz);
    K.box(stone, 2 * hw + 0.36, 0.26, 2 * hw + 0.36, cx, Ht - 0.95, cz);
    K.box(stone, 2 * hw + 0.6, 0.24, 2 * hw + 0.6, cx, Ht - 0.69, cz);
    K.box(brickD, 2 * hw + 0.1, 0.45, 2 * hw + 0.1, cx, Ht - 0.45, cz);
    K.box(stone, 2 * hw + 0.3, 0.14, 2 * hw + 0.3, cx, Ht, cz);
    // stone quoins on the outer corner and the two returns
    quoins(K, stone, sx * TW1, sz * TW1, sx, sz, 1.0, Ht - 1.0, 0.55);
    // stacked stair windows on both outer faces (lit at night)
    const nWin = north ? 4 : 3;
    for (const face of [0, 1]) {
      const ryF = face === 0 ? (sx > 0 ? Math.PI / 2 : -Math.PI / 2) : sz > 0 ? 0 : Math.PI;
      const fx = face === 0 ? sx * (TW1 + 0.02) : cx;
      const fz = face === 0 ? cz : sz * (TW1 + 0.02);
      const ox = Math.sin(ryF),
        oz = Math.cos(ryF);
      for (let i = 0; i < nWin; i++) {
        const y = 1.9 + i * 2.25 + (face === 1 ? 0.5 : 0);
        if (y + 1.6 > Ht - 1.15) continue;
        K.box(stone, 1.25, 1.95, 0.08, fx - ox * 0.03, y - 0.2, fz - oz * 0.03, ryF);
        K.panel(M('#e9e4d8', PAT.WINDOW, 0.3, 0, 0.8, 0, 0.3 + 0.17 * i + face * 0.1), 0.92, 1.55, fx + ox * 0.03, y, fz + oz * 0.03, ryF);
      }
      // doorway at the base of the face towards the street
      if (face === 1) {
        K.box(stone, 1.75, 2.75, 0.1, fx, 0, fz, ryF);
        K.panel(M('#3a2f28', PAT.DOOR, 0.6, 0, 0.5, 0, 0.6), 1.25, 2.35, fx + ox * 0.06, 0, fz + oz * 0.06, ryF);
      }
    }
    if (!north) flagpole(env, cx, Ht + 0.14, cz, 4.2, 1.9, flagN++ === 0 ? 5 : 6, flagN * 1.7, 0.05);
  }
}

/** small wall lantern (iron bracket + lit glass) used beside the gates */
function lantern(env: Env, x: number, y: number, z: number, ry: number): void {
  const K = env.S;
  const s = Math.sin(ry),
    c = Math.cos(ry);
  const iron = M(C.iron, PAT.PLAIN, 0.45, 0.5);
  const lx = x + s * 0.38,
    lz = z + c * 0.38;
  K.beam(iron, [x, y + 0.3, z], [lx, y + 0.3, lz], 0.05);
  K.box(iron, 0.3, 0.06, 0.3, lx, y + 0.34, lz);
  env.L.box(LM('#ffd9a0', LMODE.NIGHT, 3.0, 0, 0.1), 0.22, 0.34, 0.22, lx, y, lz);
  env.glow(lx, y + 0.17, lz, { size: 0.85, kind: 'halo', color: '#ffcf8a', intensity: 0.9 });
}

/** Exposed lattice truss in a vertical plane from (back) a to (front) b: bottom chord on a→b,
 *  depth hA at the back tapering to hB at the front (kinetic cut-out mesh). */
export function roofTruss(env: Env, a: [number, number, number], b: [number, number, number], hA: number, hB: number, color = '#e6e9eb'): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const Wm = (hA + hB) / 2;
  const m = M(color, PAT.LATTICE, 0.5, 0.5, Wm);
  env.K.quad(m, a, b, [b[0], b[1] + hB, b[2]], [a[0], a[1] + hA, a[2]], len, Wm, false);
  // solid top + bottom chords so the girder also reads from far away
  const steel = M(color, PAT.PLAIN, 0.5, 0.5);
  env.S.beam(steel, [a[0], a[1] + hA, a[2]], [b[0], b[1] + hB, b[2]], 0.16);
}

/** Floodlight mast: lattice tower, service platform, tilted head with 15 lamp housings. */
export function genFloodlightMast(env: Env, f: Feature, target: { x: number; z: number } | null): void {
  const h = Number(f.params?.height ?? 26);
  const yaw = target ? Math.atan2(target.x - f.x, target.z - f.z) : f.yaw;
  env.begin(f.x, 0, f.z, yaw);
  const K = env.S;
  const steel = M('#aeb7bd', PAT.PLAIN, 0.5, 0.6);
  const steelD = M('#78838b', PAT.PLAIN, 0.5, 0.6);
  K.cyl(M(C.concreteDark, PAT.CONCRETE, 0.9), 0.95, 1.05, 0.6, 0, 0, 0, 10);
  const y0 = 0.6,
    yT = h - 2.1;
  const b0 = 0.85,
    b1 = 0.34;
  // legs
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    K.beam(steel, [sx * b0, y0, sz * b0], [sx * b1, yT, sz * b1], 0.12);
  // cut-out bracing on the four faces + a few solid rings (they keep the mast legible far away)
  const L = Math.hypot(yT - y0, b0 - b1);
  const lat = M('#b9c1c7', PAT.LATTICE, 0.5, 0.6, b0 + b1);
  const P = (sx: number, sz: number, t: number): [number, number, number] => {
    const b = b0 + (b1 - b0) * t;
    return [sx * b, y0 + (yT - y0) * t, sz * b];
  };
  const faces: [number, number, number, number][] = [
    [1, -1, 1, 1],
    [1, 1, -1, 1],
    [-1, 1, -1, -1],
    [-1, -1, 1, -1],
  ];
  for (const [ax, az, bx, bz] of faces) env.K.quad(lat, P(ax, az, 0), P(ax, az, 1), P(bx, bz, 1), P(bx, bz, 0), L, b0 + b1);
  for (const t of [0.25, 0.5, 0.75]) {
    const q = [P(-1, -1, t), P(1, -1, t), P(1, 1, t), P(-1, 1, t)];
    for (let i = 0; i < 4; i++) K.beam(steelD, q[i], q[(i + 1) % 4], 0.08);
  }
  // service platform with railings under the head
  K.box(steelD, 3.4, 0.14, 2.0, 0, yT, 0.35);
  const rh = 1.0;
  railing(env, [-1.7, yT + 0.14, 1.35], [1.7, yT + 0.14, 1.35], rh, '#4b555c');
  railing(env, [-1.7, yT + 0.14, -0.65], [-1.7, yT + 0.14, 1.35], rh, '#4b555c');
  railing(env, [1.7, yT + 0.14, 1.35], [1.7, yT + 0.14, -0.65], rh, '#4b555c');
  // head: tilted frame facing the pitch
  const tilt = 0.55;
  const fw = 4.4,
    fh = 3.0;
  const cy = yT + 1.95,
    cz = 0.75;
  const fwd = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
  const up = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const at = (ox: number, oy: number, oz = 0): [number, number, number] => [ox + fwd.x * oz, cy + up.y * oy + fwd.y * oz, cz + up.z * oy + fwd.z * oz];
  const frame = M('#59626a', PAT.PLAIN, 0.5, 0.6);
  K.beam(frame, at(-fw / 2, -fh / 2), at(fw / 2, -fh / 2), 0.14);
  K.beam(frame, at(-fw / 2, fh / 2), at(fw / 2, fh / 2), 0.14);
  K.beam(frame, at(-fw / 2, -fh / 2), at(-fw / 2, fh / 2), 0.14);
  K.beam(frame, at(fw / 2, -fh / 2), at(fw / 2, fh / 2), 0.14);
  for (const oy of [-fh / 6, fh / 6]) K.beam(frame, at(-fw / 2, oy), at(fw / 2, oy), 0.08);
  // back struts to the mast top
  for (const sx of [-1, 1]) {
    K.beam(steelD, at(sx * fw * 0.35, fh / 2, -0.1), [sx * b1, yT, b1], 0.09);
    K.beam(steelD, at(sx * fw * 0.35, -fh / 2, -0.1), [sx * b1, yT + 0.1, -b1], 0.09);
  }
  // lamp housings (5 x 3) with lit lenses
  const housing = M('#4a525a', PAT.PLAIN, 0.45, 0.6);
  const lens = LM('#fffbe8', LMODE.FLOOD, 6.0, 0, 0);
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++) {
      const ox = -fw / 2 + 0.5 + (i * (fw - 1.0)) / 4;
      const oy = -fh / 2 + 0.55 + (j * (fh - 1.1)) / 2;
      const p = at(ox, oy, 0.12);
      K.boxC(housing, 0.62, 0.52, 0.42, p[0], p[1], p[2], tilt, 0, 0);
      const q = at(ox, oy, 0.34);
      const d = new THREE.CircleGeometry(0.22, 10);
      env.L.geo(lens, d, q[0], q[1], q[2], 0, 'native', 1, 1, tilt, 0);
      d.dispose();
    }
  // halos + beam + pool (FLOOD mode; the night module turns the pool into a spot light)
  const hc = at(0, 0, 0.5);
  env.glow(hc[0], hc[1], hc[2], { size: 3.4, kind: 'halo', color: '#fff6dc', intensity: 1.3, mode: 2 });
  const dist = target ? Math.hypot(target.x - f.x, target.z - f.z) : 25;
  env.glow(hc[0], hc[1] - 0.3, hc[2] + 0.2, { size: 1.5, kind: 'beam', color: '#fff4d6', intensity: 0.24, mode: 2, dir: [0, -hc[1] + 0.5, dist * 0.8], endSize: 7.5 });
  env.glow(0, 0.06, dist * 0.72, { size: 11.0, kind: 'pool', color: '#f4f2dc', intensity: 0.22, mode: 2 });
  env.endChecks();
}
