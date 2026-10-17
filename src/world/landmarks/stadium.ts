// 'Haven Stadium' — four tiered stands around the pitch (the pitch & its markings are the
// roads module's 'field' area): a roofed main stand with hospitality boxes and lattice
// trusses, canopies over the end stands, an open south stand with a two-sided LED
// scoreboard, perimeter advertising boards, goals with nets, brick facades with gates,
// banners and lettering. Floodlight masts (plan features) light the pitch in the evening.
// The crowd, players and match logic live in stadiumLife.ts.

import * as THREE from 'three';
import type { Feature, Lot } from '../../core/plan';
import { FLOOD, LM, LMODE, M, PAT } from './builder';
import { wall, Opening } from './facade';
import { C, flagpole } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';

export interface StandSeat {
  /** world position of the seat surface centre */
  x: number;
  y: number;
  z: number;
  /** yaw facing the pitch */
  yaw: number;
  /** 0..1 around the stadium (for the wave) */
  ang: number;
  /** stand index 0 N, 1 E, 2 S, 3 W */
  stand: number;
  row: number;
}

export interface StadiumInfo {
  cx: number;
  cz: number;
  /** pitch half size (local, square) */
  F: number;
  seats: StandSeat[];
  /** goal mouths (world): centre of the goal line (goals at the z ends), half width; +1 / -1 side */
  goals: { x: number; z: number; hw: number; side: number }[];
  name: string;
  lotId: number;
}

const ADS = [
  ['TINY COLA', '#c8102e', '#ffffff'],
  ['HAVEN BANK', '#0b3d6b', '#f4c542'],
  ['SEASIDE ICE CREAM', '#58c4dd', '#ffffff'],
  ['NORTHGATE BRICKS', '#8a3b22', '#f3e3c3'],
  ['PIER FISH & CHIPS', '#f2b705', '#1d2b4c'],
  ['RIVERSIDE TRAMS', '#1f7a4c', '#ffffff'],
  ['SKYLINE FM 101.7', '#5b2c83', '#ffd84a'],
  ['GRAND HOTEL', '#2b2b2b', '#e6c27a'],
] as const;

export function genStadium(env: Env, lot: Lot): StadiumInfo {
  const fp = lot.footprint;
  const cx = (fp.x0 + fp.x1) / 2,
    cz = (fp.z0 + fp.z1) / 2;
  env.begin(cx, 0, cz, 0);
  env.checkLot(fp, 'stadium');
  const K = env.S;
  const HX = (fp.x1 - fp.x0) / 2; // 20
  const HZ = (fp.z1 - fp.z0) / 2;
  const H = Math.min(HX, HZ);
  // pitch = roads 'field' area (block inset 9); fp is block inset 1 → pitch half = H - 8
  const F = H - 8;
  const S0 = F + 1.2; // first row
  const nRows = 8;
  const rowD = (H - 0.6 - 0.25 - S0) / nRows;
  const rise = 0.52;
  const W = H - 0.4; // outer wall plane
  const LEN = F + 2.5; // stand half length

  const concrete = M(C.concrete, PAT.CONCRETE, 0.9, 0, 0, 0, 0.3);
  const concreteD = M(C.concreteDark, PAT.CONCRETE, 0.9, 0, 0, 0, 0.5);
  const brick = M('#9e4b35', PAT.BRICK, 0.9, 0, 0, FLOOD.WARM, 0.2);
  const steel = M('#d9dde0', PAT.PLAIN, 0.5, 0.5);
  const roofM = M('#cfd5d9', PAT.CORRUGATED, 0.55, 0.45, 0, 0, 0.2);
  const red = '#c4202b';
  const white = '#f1efe9';
  const navy = '#203a6b';

  const seats: StandSeat[] = [];
  // stands: k = 0 N (outward -z), 1 E (+x), 2 S (+z), 3 W (-x)
  const standYaw = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
  const standLen = [LEN, LEN, LEN, LEN];
  // helper to place a box in a stand's frame: (u along, depth d outward, y)
  const sbox = (k: number, m: ReturnType<typeof M>, w: number, h: number, d: number, u: number, y: number, dep: number) => {
    const ry = standYaw[k];
    const s = Math.sin(ry),
      c = Math.cos(ry);
    // stand local: +X along, +Z outward → local landmark coords
    const x = u * c + dep * s;
    const z = -u * s + dep * c;
    K.box(m, w, h, d, x, y, z, ry);
  };
  for (let k = 0; k < 4; k++) {
    const L = standLen[k];
    const ry = standYaw[k];
    const s = Math.sin(ry),
      c = Math.cos(ry);
    // seat colours: home red with white sections; away navy block in the south-east
    for (let i = 0; i < nRows; i++) {
      const top = 0.7 + i * rise;
      const d0 = S0 + i * rowD;
      // tread-only box (the next row starts where this one ends → no hidden, overdrawn tops)
      const depth = i === nRows - 1 ? W - d0 : rowD + 0.02;
      // tread + mass below it (seats pattern on the top)
      const segs = 3;
      for (let sg = 0; sg < segs; sg++) {
        const u0 = -L + (2 * L * sg) / segs,
          u1 = -L + (2 * L * (sg + 1)) / segs;
        let col: string = red;
        if (sg === 1 && (i === 3 || i === 4)) col = white;
        if (k === 2 && sg === 2) col = navy;
        if (k === 0 && sg === 1 && i >= 5) col = white;
        sbox(k, M(col, PAT.SEATS, 0.6, 0, 0, 0, 0.1), u1 - u0, top, depth, (u0 + u1) / 2, 0, d0 + depth / 2);
      }
      // seat positions for the crowd (every 0.5 m)
      const n = Math.floor((2 * L) / 0.5);
      for (let j = 0; j < n; j++) {
        const u = -L + 0.25 + j * 0.5;
        const dep = d0 + rowD * 0.42;
        const lx = u * c + dep * s,
          lz = -u * s + dep * c;
        const [wx, wy, wz] = env.w(lx, top, lz);
        seats.push({ x: wx, y: wy, z: wz, yaw: ry + Math.PI, ang: (Math.atan2(lx, lz) / (Math.PI * 2) + 1) % 1, stand: k, row: i });
      }
    }
    // aisles (stairs) across the rows (detail mesh)
    K.b.forceDetail = true;
    for (const ua of [-L * 0.34, L * 0.34]) {
      for (let i = 0; i < nRows; i++) {
        const top = 0.7 + i * rise;
        const d0 = S0 + i * rowD;
        sbox(k, concrete, 0.9, 0.04, rowD, ua, top, d0 + rowD / 2);
        sbox(k, concrete, 0.9, rise / 2, rowD / 2, ua, top, d0 + rowD * 0.75);
      }
    }
    K.b.forceDetail = false;
    // back parapet
    const backTop = 0.7 + nRows * rise + 0.6;
    sbox(k, concreteD, 2 * L + 0.4, backTop, W - (S0 + nRows * rowD) + 0.02, 0, 0, (S0 + nRows * rowD + W) / 2);
    // front wall (perimeter) and advertising boards facing the pitch
    sbox(k, concrete, 2 * L, 0.9, 0.25, 0, 0, S0 - 0.12);
    for (let a = 0; a < 4; a++) {
      const ad = ADS[(k * 2 + a) % ADS.length];
      const r = adRect(env, ad[0], ad[1], ad[2]);
      const u = -L + (2 * L * (a + 0.5)) / 4;
      const dep = F + 0.55;
      signQuad(env.T, r, (2 * L) / 4 - 0.3, 0.75, u * c + dep * s, 0.02, -u * s + dep * c, ry + Math.PI, 0.6);
      // board body
      sbox(k, M('#2b2f33', PAT.PLAIN, 0.6), (2 * L) / 4 - 0.25, 0.8, 0.14, u, 0, dep + 0.08);
    }
  }
  // corner blocks (concourses) leaving room for the floodlight masts
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x0 = LEN,
      x1 = W;
    K.box(concreteD, x1 - x0 + 0.2, 3.2, x1 - x0 + 0.2, sx * (x0 + x1) / 2, 0, sz * (x0 + x1) / 2);
  }

  // ── outer facades with gates
  const doorsLocal = lot.doors.map((d) => ({ x: d.x - cx, z: d.z - cz, dir: d.dir }));
  const facadeH = [9.4, 6.4, 6.4, 6.4];
  for (let k = 0; k < 4; k++) {
    const ry = standYaw[k];
    const s = Math.sin(ry),
      c = Math.cos(ry);
    const len = 2 * W;
    const ops: Opening[] = [];
    // gates where the plan has doors on this side
    for (const d of doorsLocal) {
      const onSide = (k === 0 && d.dir === 'N') || (k === 1 && d.dir === 'E') || (k === 2 && d.dir === 'S') || (k === 3 && d.dir === 'W');
      if (!onSide) continue;
      // wall-local x: distance from the wall's left end (seen from outside)
      const along = d.x * c - d.z * s; // projection on the wall's +X axis
      ops.push({ x: W + along, y: 0, w: 3.0, h: 3.2, arch: 0.5, fill: 'dark', inset: 0.5, surround: M(C.stoneLight, PAT.PLAIN, 0.8), surroundW: 0.25 });
    }
    // high windows (ribbon) on the main stand facade, small vents elsewhere
    const nWin = 9;
    for (let i = 0; i < nWin; i++) {
      const x = (len * (i + 0.5)) / nWin;
      if (ops.some((o) => Math.abs(o.x - x) < 2.6)) continue;
      if (k === 0) ops.push({ x, y: 5.6, w: 2.6, h: 2.2, fill: 'window', glow: 0.7, seed: 0.2 + (i % 4) * 0.2, surround: M(C.stoneLight, PAT.PLAIN, 0.8), surroundW: 0.12 });
      else ops.push({ x, y: 4.0, w: 1.6, h: 0.9, fill: 'louvre', inset: 0.2 });
    }
    wall(K, { w: len, h: facadeH[k], depth: 0.5, x: s * W, y: 0, z: c * W, ry, mat: brick, openings: ops });
    // concrete band on top + fins
    K.box(concrete, len + 0.3, 0.5, 0.7, s * (W - 0.2), facadeH[k], c * (W - 0.2), ry);
    for (let i = 0; i <= 10; i++) {
      const u = -W + (2 * W * i) / 10;
      const fx = u * c + (W + 0.06) * s,
        fz = -u * s + (W + 0.06) * c;
      if (ops.some((o) => Math.abs(o.x - (u + W)) < 1.9)) continue;
      K.box(concrete, 0.3, facadeH[k] - 0.6, 0.12, fx, 0.6, fz, ry);
    }
    // banners between the fins
    for (const bu of [-W * 0.62, W * 0.62]) {
      const bx = bu * c + (W + 0.04) * s,
        bz = -bu * s + (W + 0.04) * c;
      const m = M('#ffffff', PAT.FLAG, 0.9, 0, 0, 0, (k % 2 === 0 ? 5.5 : 0.5) / 8);
      const g = new THREE.PlaneGeometry(1.3, 3.4);
      // vertical banner: flag uv rotated so stripes hang down
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getY(i), uv.getX(i));
      K.geo(m, g, bx, facadeH[k] - 3.9, bz, ry, 'native');
      g.dispose();
    }
  }
  // stadium name over the main gates (outside) + on the main stand roof fascia (inside)
  const nameR = env.atlas.add(1024, 96, (g, w, h) => {
    g.fillStyle = '#b81d26';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, h - 10, w, 4);
    g.fillRect(0, 6, w, 4);
    drawText(g, (lot.name ?? 'Haven Stadium').toUpperCase(), w / 2, h / 2 + 3, 'bold 62px "Arial Black", Impact, Arial, sans-serif', '#ffffff', 8);
  });
  signQuad(env.T, nameR, 16, 1.5, 0, facadeH[0] - 2.4, -W - 0.04, Math.PI, 1);

  // ── main stand roof (north): cantilever with lattice trusses, fascia lettering, boxes
  {
    const yB = facadeH[0] + 0.5,
      yF = 8.6;
    const zB = -W + 0.2,
      zF2 = -S0 + 0.6;
    const L = LEN + 1.0;
    K.poly(roofM, [
      [-L, yF, zF2],
      [L, yF, zF2],
      [L, yB, zB],
      [-L, yB, zB],
    ]);
    K.poly(M('#a9b0b5', PAT.PLAIN, 0.6, 0.3), [
      [-L, yF - 0.05, zF2],
      [-L, yB - 0.05, zB],
      [L, yB - 0.05, zB],
      [L, yF - 0.05, zF2],
    ]);
    // fascia with the name facing the pitch
    K.box(M(white, PAT.PLAIN, 0.6), 2 * L, 1.2, 0.3, 0, yF - 0.9, zF2 - 0.05);
    signQuad(env.T, nameR, 15, 1.0, 0, yF - 0.8, zF2 + 0.11, 0, 1);
    // trusses (cutout lattice) under the roof
    for (let i = 0; i <= 6; i++) {
      const x = -L + (2 * L * i) / 6;
      const len = Math.hypot(zF2 - zB, yF - yB);
      const ang = Math.atan2(yB - yF, zF2 - zB);
      const g = new THREE.PlaneGeometry(len, 1.0);
      g.rotateY(-Math.PI / 2);
      env.K.geo(M('#e3e6e8', PAT.LATTICE, 0.5, 0.5, 1.0), g, x, (yB + yF) / 2 - 0.55, (zB + zF2) / 2, 0, 'native', len, 1.0, ang);
      g.dispose();
    }
    // hospitality boxes: glazed band at the back of the main stand
    const gy = 0.7 + nRows * rise + 0.6;
    K.box(M('#40505a', PAT.GLAZING, 0.2, 0.3, 0.8, 0, 0.6), 2 * LEN - 2, yB - gy - 0.6, 0.3, 0, gy, zB + 0.75);
    K.box(concrete, 2 * LEN, 0.25, 1.2, 0, gy - 0.05, zB + 1.0);
    // roof lights at night (under the fascia)
    for (let i = 0; i < 8; i++) env.L.box(LM('#fff3dc', LMODE.NIGHT, 2.2, 0, 0), 1.2, 0.08, 0.2, -L + 1.5 + ((2 * L - 3) * i) / 7, yF - 1.0, zF2 + 0.3);
  }
  // end-stand canopies (east & west)
  for (const k of [1, 3]) {
    const ry = standYaw[k];
    const s = Math.sin(ry),
      c = Math.cos(ry);
    const yB = facadeH[k] + 0.6,
      yF = 6.9;
    const L = LEN - 1.5;
    const P = (u: number, y: number, d: number): [number, number, number] => [u * c + d * s, y, -u * s + d * c];
    K.poly(roofM, [P(L, yF, S0 + 1.6), P(-L, yF, S0 + 1.6), P(-L, yB, W - 0.2), P(L, yB, W - 0.2)]);
    K.poly(M('#a9b0b5', PAT.PLAIN, 0.6, 0.3), [P(L, yF - 0.05, S0 + 1.6), P(L, yB - 0.05, W - 0.2), P(-L, yB - 0.05, W - 0.2), P(-L, yF - 0.05, S0 + 1.6)]);
    const fz = P(0, 0, S0 + 1.55);
    K.box(M(red, PAT.PLAIN, 0.6), 2 * L, 0.6, 0.18, fz[0], yF - 0.45, fz[2], ry);
    for (const u of [-L + 0.6, 0, L - 0.6]) {
      const b = P(u, 0, W - 0.5);
      const f = P(u, 0, S0 + 1.8);
      env.K.rod(M('#e3e6e8', PAT.PLAIN, 0.5, 0.5), [b[0], yB - 0.2, b[2]], [f[0], yF - 0.1, f[2]], 0.08, 6);
    }
  }

  // ── scoreboard behind the south stand (two-sided LED display)
  {
    const zb = W - 1.1;
    const bw = 8.0,
      bh = 2.8,
      by = 8.4;
    for (const px of [-2.8, 2.8]) {
      K.box(steel, 0.35, by + 0.2, 0.35, px, 0, zb);
    }
    K.box(M('#1d2126', PAT.PANELS, 0.6, 0.3, 0, 0, 0.2), bw + 0.6, bh + 1.3, 0.55, 0, by - 0.3, zb);
    // displays: north face (pitch) and south face (city)
    for (const ry of [Math.PI, 0]) {
      const z = zb + (ry === 0 ? 0.29 : -0.29);
      env.L.panel(LM('#ffffff', LMODE.SCORE, 1, 0, 0), bw, bh * 0.82, 0, by, z, ry);
      const tr = env.atlas.add(
        512,
        40,
        (g, w, h) => {
          g.fillStyle = '#1d2126';
          g.fillRect(0, 0, w, h);
          drawText(g, 'HAVEN FC', w * 0.25, h / 2 + 2, 'bold 26px Arial, sans-serif', '#ff4a4a', 2);
          drawText(g, 'ROVERS', w * 0.75, h / 2 + 2, 'bold 26px Arial, sans-serif', '#7fb2ff', 2);
        },
        'scoreboard-teams',
      );
      signQuad(env.T, tr, bw, 0.62, 0, by + bh * 0.84, z + (ry === 0 ? 0.005 : -0.005), ry, 1);
    }
    K.box(steel, bw + 0.9, 0.18, 0.75, 0, by + bh + 1.0, zb);
    flagpole(env, -bw / 2 - 0.1, by + bh + 1.18, zb, 2.5, 1.8, 5, 0.3, 0.05);
    flagpole(env, bw / 2 + 0.1, by + bh + 1.18, zb, 2.5, 1.8, 6, 2.2, 0.05);
  }

  // ── goals on the north & south goal lines (the roads module paints the pitch with its goal
  //    boxes at the z ends, lines 1.2 m inside the field area) with nets
  const G = F - 1.2;
  const goals: StadiumInfo['goals'] = [];
  for (const side of [-1, 1]) {
    const gz = side * G;
    const hw = 1.55,
      gh = 1.6,
      gd = 1.0;
    const post = M('#ffffff', PAT.PLAIN, 0.4, 0.1);
    for (const gx of [-hw, hw]) K.cyl(post, 0.06, 0.06, gh, gx, 0, gz, 8);
    K.beam(post, [-hw - 0.06, gh, gz], [hw + 0.06, gh, gz], 0.11);
    // net (dithered mesh) — back, roof, sides; back frame bars
    const net = M('#f4f4f4', PAT.MESH, 0.9, 0, 0, 0, 0.8);
    const bz = gz + side * gd;
    env.K.quad(net, [-hw, 0, bz], [hw, 0, bz], [hw, gh * 0.8, bz], [-hw, gh * 0.8, bz], 2 * hw, gh * 0.8);
    env.K.quad(net, [-hw, gh, gz], [hw, gh, gz], [hw, gh * 0.8, bz], [-hw, gh * 0.8, bz], 2 * hw, 1.0);
    for (const gx of [-hw, hw]) env.K.quad(net, [gx, 0, gz], [gx, 0, bz], [gx, gh * 0.8, bz], [gx, gh, gz], gd, gh);
    for (const gx of [-hw, hw]) K.beam(M('#d8d8d8', PAT.PLAIN, 0.5, 0.2), [gx, gh, gz], [gx, gh * 0.8, bz], 0.04);
    K.beam(M('#d8d8d8', PAT.PLAIN, 0.5, 0.2), [-hw, 0.02, bz], [hw, 0.02, bz], 0.04);
    const [wx, , wz] = env.w(0, 0, gz);
    goals.push({ x: wx, z: wz, hw, side });
  }
  // corner flags at the pitch corners
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    K.cyl(M('#f2d22e', PAT.PLAIN, 0.6), 0.025, 0.025, 1.3, sx * G, 0, sz * G, 5);
    env.K.poly(M('#e8382f', PAT.PLAIN, 0.8), [
      [sx * G, 1.3, sz * G],
      [sx * G, 0.95, sz * G],
      [sx * G - sx * 0.4, 1.12, sz * G],
    ]);
  }

  // night: glow from the main-stand roof lights, pools on the concourse
  for (const [gx, gz] of [
    [-8, -W - 1.5],
    [8, -W - 1.5],
    [W + 1.5, 0],
    [-W - 1.5, 0],
  ])
    env.glow(gx, 0.1, gz, { size: 3.2, kind: 'pool', color: '#ffc77e', intensity: 0.28 });

  env.endChecks();
  const info: StadiumInfo = { cx, cz, F, seats, goals, name: lot.name ?? 'Haven Stadium', lotId: lot.id };
  return info;
}

function adRect(env: Env, text: string, bg: string, fg: string) {
  return env.atlas.add(
    256,
    26,
    (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      drawText(g, text, w / 2, h / 2 + 1, 'bold 17px Arial, sans-serif', fg, 1);
    },
    `ad:${text}`,
  );
}

/** Floodlight mast (plan feature) at a stadium corner: lattice-free tapered mast, a tilted
 *  lamp bank (emissive when uFlood), a light beam towards the pitch and a pool on the grass. */
export function genFloodlight(env: Env, f: Feature, target: { x: number; z: number } | null): void {
  const h = Number(f.params?.height ?? 26);
  // aim at the target (stadium centre) when known
  const yaw = target ? Math.atan2(target.x - f.x, target.z - f.z) : f.yaw;
  env.begin(f.x, 0, f.z, yaw);
  const K = env.S;
  const steel = M('#9aa4ab', PAT.PLAIN, 0.5, 0.6);
  K.cyl(M(C.concreteDark, PAT.CONCRETE, 0.9), 0.75, 0.85, 0.6, 0, 0, 0, 10);
  K.cyl(steel, 0.32, 0.55, h - 1.2, 0, 0.6, 0, 10);
  // service ladder rungs (thin) + platform under the head
  K.box(steel, 0.08, h - 2, 0.08, 0.45, 1.0, -0.15);
  const hy = h - 0.6;
  K.box(M('#7d878e', PAT.PLAIN, 0.5, 0.6), 2.6, 0.12, 1.4, 0, hy - 1.7, 0.2);
  // lamp bank: frame tilted down towards the pitch
  const tilt = 0.55;
  const bw = 3.6,
    bh = 2.6;
  const cyH = hy;
  const head = new THREE.BoxGeometry(bw, bh, 0.35);
  K.geo(M('#59626a', PAT.PANELS, 0.5, 0.6, 0, 0, 0.4), head, 0, cyH, 0.3, 0, 'box', 1, 1, tilt);
  head.dispose();
  // emissive lamp grid (4 x 3) on the front face
  const fwd = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
  const up = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const ox = -bw / 2 + 0.45 + (i * (bw - 0.9)) / 3;
      const oy = -bh / 2 + 0.45 + (j * (bh - 0.9)) / 2;
      const p = new THREE.Vector3(ox, cyH, 0.3).addScaledVector(up, oy).addScaledVector(fwd, 0.19);
      const d = new THREE.CircleGeometry(0.3, 10);
      env.L.geo(LM('#fffbe8', LMODE.FLOOD, 6.0, 0, 0), d, p.x, p.y, p.z, 0, 'native', 1, 1, tilt, 0);
      d.dispose();
    }
  // halos + beam + pool (FLOOD mode)
  env.glow(0, cyH, 0.55, { size: 3.2, kind: 'halo', color: '#fff6dc', intensity: 1.3, mode: 2 });
  const dist = target ? Math.hypot(target.x - f.x, target.z - f.z) : 25;
  env.glow(0, cyH - 0.3, 0.7, { size: 1.4, kind: 'beam', color: '#fff4d6', intensity: 0.24, mode: 2, dir: [0, -cyH + 0.5, dist * 0.8], endSize: 7.5 });
  env.glow(0, 0.06, dist * 0.72, { size: 11.0, kind: 'pool', color: '#f4f2dc', intensity: 0.22, mode: 2 });
  env.endChecks();
}
