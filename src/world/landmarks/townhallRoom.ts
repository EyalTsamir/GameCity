// The Town Hall from inside (`?noherotownhall`: the old furnished hall). Up the loggia steps and through the open doors into a
// marble hall: a top-lit atrium under a stained laylight with an imperial stair, column-lined wings with portraits and a table
// model of the city, and from the galleries the reception room whose middle French window opens onto the balcony over the
// square. Near-only (landmarks/rooms.ts). Floors overlap in plan, so the walker's floor is chosen by its feet.

import * as THREE from 'three';
import { M, PAT } from './builder';
import { archPoints, V3 } from './kit';
import { Hole, RP, Room, Rooms } from './rooms';
import type { Env } from './env';
import { drawText } from './signs';
import { OCC } from '../../core/occupancy';

export interface TownhallDims {
  HW: number;
  RX: number;
  zF: number;
  zR: number;
  y1: number;
  y2: number;
  cx: number;
  cz: number;
  yaw: number;
  fp: { x0: number; z0: number; x1: number; z1: number };
}

export function buildTownhallRoom(env: Env, rooms: Rooms, d: TownhallDims): Room {
  const room = rooms.add(new Room('townhall', 2048, 1536));
  room.frame(d.cx, d.cz, d.yaw);
  room.near = 30;
  // the balcony hangs outside the footprint; below it the square is still the city's (Rooms: no floor there, not in `core`)
  room.bounds = room.rectL(-d.HW, -d.fp.z1 + d.cz, d.HW, 7.6);
  room.core = { ...d.fp };
  const K = room.K;
  const { RX, y2 } = d;
  const IX = d.HW - 0.66; // inner face of the end walls
  const ZB = -5.74; // back wall
  const ZW = d.zF - 0.52; // front wall of the wings
  const ZC = 3.2; // front wall of the centre (behind the loggia)
  const yG = 0.45; // ground floor: the height of the loggia
  const yC = d.y1 - 0.25; // wing ceiling
  const yU = yG + 24 * 0.18; // first floor: the top of the stair
  const yTop = y2 - 0.25; // atrium ceiling

  // ── atlas: laylight tile, front wall sun mask, blank (equal cells, see glassAlong)
  const CWP = 512,
    CHP = 256;
  const tile = room.atlas.add(CWP, CHP, (g, w, h) => {
    g.fillStyle = '#e9dcae';
    g.fillRect(0, 0, w, h);
    const cx = w / 2,
      cy = h / 2;
    for (let r = 5; r > 0; r--) {
      g.fillStyle = r % 2 ? '#d9b75a' : '#f0e6c0';
      g.beginPath();
      g.ellipse(cx, cy, (w / 2) * (r / 5), (h / 2) * (r / 5), 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(30,20,10,0.9)';
      g.lineWidth = 3;
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillStyle = i % 2 ? '#2d62b0' : '#a8392c';
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * w * 0.33, cy + Math.sin(a) * h * 0.33, 22, 14, a, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.strokeStyle = 'rgba(25,18,10,0.95)';
    g.lineWidth = 6;
    g.strokeRect(0, 0, w, h);
  });
  const SW = 33.7,
    SH = 10;
  room.atlas.add(CWP, CHP, (g, w, h) => {
    // the front wall as seen by the sun: where its windows are
    g.clearRect(0, 0, w, h);
    const hole = (x: number, y0: number, ww: number, hh: number) => {
      const px = ((x + SW / 2) / SW) * w,
        pw = (ww / SW) * w,
        py = h - ((y0 + hh) / SH) * h,
        ph = (hh / SH) * h;
      g.fillStyle = '#fff4dc';
      g.fillRect(px - pw / 2, py, pw, ph);
      g.fillStyle = '#000';
      g.fillRect(px - 0.5, py, 1, ph);
      g.fillRect(px - pw / 2, py + ph * 0.42, pw, 1);
    };
    for (const s of [-1, 1]) {
      for (const x of [6.8, 9.2, 11.6]) hole(s * x, 1.05, 1.45, 2.7);
      hole(s * 14.82, 0.9, 1.6, 2.9);
      hole(s * 3.3, 5.15, 1.6, 3.6);
    }
    hole(0, 5.15, 1.6, 3.6);
  });
  room.atlas.add(CWP, CHP, (g, w, h) => g.clearRect(0, 0, w, h));
  room.cellStride = (CWP + 2) / room.atlas.W;
  room.cellW = CWP / room.atlas.W;
  room.cellH = CHP / room.atlas.H;
  room.cellV0 = tile.v0;
  room.row = { X: 5.9, z0: 0, period: 60, count: 1, w: SW, y0: 0, h: SH };
  room.swapAxes = true;
  room.roof = { y: yTop, hx: 3.4, z0: -3.7, z1: 1.7 };
  room.roofOnly = [RX, ZC, 6.8 / 4, 5.4 / 3];
  room.side = { X: IX + 0.3, period: 4.17, hw: 0.72, y0: 1.05, h: 2.7 };
  room.zone = [ZB - 0.1, 5.85, -IX - 0.1, IX + 0.1];

  // ── materials
  const marble = M('#ece6d8', RP.CHEQUER, 0.25);
  const wall = M('#e6dcc4', RP.PLASTER, 0.9, 0, 0, 0, 0.2);
  const dado = M('#7a5a3c', RP.OAK, 0.5, 0, 0, 0, 0.3);
  const dadoD = M('#4a321e', RP.OAK, 0.5, 0, 0, 0, 0.6);
  const stone = M('#d8cfbc', RP.MARBLE, 0.35);
  const white = M('#f3eee2', PAT.PLAIN, 0.85);
  const gilt = M('#d9ad4a', RP.BRASS, 0.3, 1);
  const iron = M('#1c1a18', PAT.PLAIN, 0.6, 0.5);
  const red = M('#7a1e22', PAT.PLAIN, 0.95);
  const boards = M('#8a6238', RP.PARQUET, 0.5);
  const glass = M('#ffffff', RP.GLASS, 0.3);
  const flame = (seed: number) => M('#ffd9a0', RP.EMIT, 0, 0, 4, 0, seed * 0.49);

  // ── ground floor
  room.grid(marble, (u, v) => [u, yG, v], -RX, RX, ZB, ZC, 0.6, 0.6, true);
  for (const s of [-1, 1]) room.grid(marble, (u, v) => [s * RX + s * u, yG, v], 0, IX - RX, ZB, ZW, 0.6, 0.6, s > 0);
  // ceilings of the wings: coffers
  for (const s of [-1, 1]) {
    room.grid(white, (u, v) => [s * RX + s * u, yC, v], 0, IX - RX, ZB, ZW, 0.8, 0.8, s < 0);
    for (let x = RX + 1.5; x < IX; x += 1.5) K.box(white, 0.2, 0.22, ZW - ZB, s * x, yC - 0.22, (ZB + ZW) / 2);
    for (let z = ZB + 1.5; z < ZW; z += 1.5) K.box(white, IX - RX, 0.22, 0.2, s * (RX + IX) * 0.5, yC - 0.22, z);
  }

  // ── walls: back and front with their windows, framed from inside
  const winG = archPoints(1.45, 2.7, 0.72, 6);
  // a reveal 1.5 cm inside the outer wall's own opening, or the two fight
  const inner = (h: Hole, w: number, ht: number): Hole => ({ ...h, pts: h.pts.map(([x, y]) => [x * (1 - 0.03 / w), 0.015 + y * (1 - 0.03 / ht)] as [number, number]) });
  const framed = (P: (u: number, v: number, dep: number) => V3, h: Hole, w: number, ht: number, flip = false) => {
    // the wall's thickness, then a glazing frame + bars
    room.reveal(white, P, inner(h, w, ht), 0.0, 0.5, flip);
    const c = P(h.u, h.v0 + ht * 0.46, 0.34);
    const a = P(h.u - w / 2, h.v0, 0.34),
      b = P(h.u + w / 2, h.v0, 0.34);
    const ry = Math.atan2(b[0] - a[0], b[2] - a[2]) - Math.PI / 2;
    K.box(iron, 0.04, ht * 0.92, 0.04, c[0], h.v0, c[2], ry);
    K.box(iron, w, 0.04, 0.04, c[0], h.v0 + ht * 0.42, c[2], ry);
    K.box(white, w + 0.2, 0.06, 0.14, c[0], h.v0 - 0.03, c[2], ry);
  };
  const backXs = [-14.98, -11.23, -7.49, 7.49, 11.23, 14.98];
  const holesBack: Hole[] = backXs.map((x) => ({ u: x, pts: winG, v0: 1.05 }));
  room.wall(wall, (u, v) => [u, v, ZB], -IX, IX, yG, yC, holesBack, 0.6, 0.4, false);
  for (const h of holesBack) {
    framed((u, v, dep) => [u, v, ZB - dep], h, 1.45, 2.7, true);
    room.wins.push({ x: h.u, y: 2.4, z: ZB, nx: 0, nz: 1, area: 3.6, trans: 1 });
  }
  for (const s of [-1, 1]) {
    const hs: Hole[] = [6.8, 9.2, 11.6].map((x) => ({ u: s * x, pts: winG, v0: 1.05 }));
    hs.push({ u: s * 14.82, pts: archPoints(1.6, 2.9, 0.8, 6), v0: 0.9 });
    const u0 = s > 0 ? RX : -IX,
      u1 = s > 0 ? IX : -RX;
    room.wall(wall, (u, v) => [u, v, ZW], u0, u1, yG, yC, hs, 0.6, 0.4, true);
    for (const h of hs) {
      framed((u, v, dep) => [u, v, ZW + dep], h, 1.45, 2.7);
      room.wins.push({ x: h.u, y: 2.4, z: ZW, nx: 0, nz: -1, area: 3.6, trans: 1 });
    }
    // end wall with three windows
    const he: Hole[] = [-4.17, 0, 4.17].map((z) => ({ u: z, pts: winG, v0: 1.05 }));
    room.wall(wall, (u, v) => [s * IX, v, u], ZB, ZW, yG, yC, he, 0.6, 0.4, s < 0);
    for (const h of he) {
      framed((u, v, dep) => [s * (IX + dep), v, u], h, 1.45, 2.7, s > 0);
      room.wins.push({ x: s * IX, y: 2.4, z: h.u, nx: -s, nz: 0, area: 3.6, trans: 1 });
    }
    // the return between wing and loggia
    room.grid(wall, (u, v) => [s * RX, v, u], ZC, ZW, yG, yC, 0.6, 0.5, s > 0);
    // dado all round the wing, below the sills
    for (const z of [ZB + 0.02, ZW - 0.02]) {
      K.box(dadoD, IX - RX, 0.42, 0.04, s * (RX + IX) * 0.5, yG, z);
      K.box(dado, IX - RX, 0.03, 0.07, s * (RX + IX) * 0.5, yG + 0.42, z);
    }
    K.box(dadoD, 0.04, 0.42, ZW - ZB, s * (IX - 0.02), yG, (ZB + ZW) / 2);
    K.box(dado, 0.07, 0.03, ZW - ZB, s * (IX - 0.02), yG + 0.42, (ZB + ZW) / 2);
    // cornice
    for (const z of [ZB + 0.06, ZW - 0.06]) K.box(white, IX - RX, 0.16, 0.14, s * (RX + IX) * 0.5, yC - 0.16, z);
  }

  // ── atrium: front wall with the door at the bottom, the reception doors above; plain back wall over the landing
  const doorH: Hole = { u: 0, pts: archPoints(1.9, 3.1, 0.95, 8), v0: yG };
  const winL = archPoints(1.2, 2.3, 0.6, 6);
  const lowers: Hole[] = [doorH, { u: -3.3, pts: winL, v0: 1.0 }, { u: 3.3, pts: winL, v0: 1.0 }];
  room.wall(wall, (u, v) => [u, v, ZC], -RX, RX, yG, yU, lowers, 0.5, 0.4, true);
  room.reveal(white, (u, v, dep) => [u, v, ZC + dep], inner(doorH, 1.9, 3.1), 0, 0.34);
  for (const x of [-3.3, 3.3]) {
    framed((u, v, dep) => [u, v, ZC + dep], { u: x, pts: winL, v0: 1.0 }, 1.2, 2.3);
    room.wins.push({ x, y: 2.1, z: ZC, nx: 0, nz: -1, area: 2.4, trans: 0.7 });
  }
  room.wins.push({ x: 0, y: 2, z: ZC, nx: 0, nz: -1, area: 5, trans: 0.9 });
  const upperDoor: Hole = { u: 0, pts: archPoints(1.8, 3.0, 0.9, 8), v0: yU };
  room.wall(wall, (u, v) => [u, v, ZC], -RX, RX, yU, yTop, [upperDoor], 0.5, 0.5, true);
  room.reveal(white, (u, v, dep) => [u, v, ZC + dep], upperDoor, 0, 0.3);
  // tall north windows over the landing, a painting of the town between landing and windows
  const winU = archPoints(1.45, 3.0, 0.2, 4);
  const holesU: Hole[] = [-3.74, 0, 3.74].map((x) => ({ u: x, pts: winU, v0: 5.45 }));
  room.wall(wall, (u, v) => [u, v, ZB], -RX, RX, yC, yTop, holesU, 0.5, 0.5, false);
  for (const h of holesU) {
    framed((u, v, dep) => [u, v, ZB - dep], h, 1.45, 3.0, true);
    room.wins.push({ x: h.u, y: 7, z: ZB, nx: 0, nz: 1, area: 4.3, trans: 1 });
  }
  const paint = room.atlas.add(420, 240, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#7f9bb3');
    sky.addColorStop(0.7, '#e8cf9e');
    sky.addColorStop(1, '#f2b777');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,245,225,0.65)';
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(40 + i * 62, 30 + ((i * 37) % 50), 44, 9 + (i % 3) * 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#50606a';
    g.fillRect(0, h * 0.62, w, h);
    g.fillStyle = '#e6b070';
    for (let i = 0; i < 26; i++) g.fillRect(170 + ((i * 53) % 90) - i, h * 0.62 + i * 3.4, 26 - i * 0.5, 1.5);
    // the town on the far shore: roofs, the church spire, the clock tower
    for (let i = 0; i < 24; i++) {
      const x = i * 13,
        hh = 12 + ((i * 29) % 22);
      g.fillStyle = i % 3 ? '#8a6a52' : '#a25a40';
      g.fillRect(x, h * 0.62 - hh, 12, hh);
    }
    g.fillStyle = '#4c4d55';
    g.fillRect(84, h * 0.62 - 56, 12, 56);
    g.beginPath();
    g.moveTo(82, h * 0.62 - 56);
    g.lineTo(90, h * 0.62 - 98);
    g.lineTo(98, h * 0.62 - 56);
    g.fill();
    // a square-rigged ship with her sails full
    g.fillStyle = '#2a1c14';
    g.beginPath();
    g.moveTo(255, 192);
    g.lineTo(355, 192);
    g.lineTo(340, 212);
    g.lineTo(268, 212);
    g.fill();
    g.fillRect(286, 110, 3, 84);
    g.fillRect(322, 118, 3, 76);
    g.fillStyle = '#efe4cc';
    for (const [x, y, ww, hh] of [[270, 122, 36, 26], [272, 152, 32, 30], [308, 128, 32, 24], [310, 156, 28, 28]]) g.fillRect(x, y, ww, hh);
    g.fillStyle = 'rgba(25,15,8,0.2)';
    g.fillRect(0, 0, w, h);
  });
  K.box(gilt, 3.8, 2.3, 0.1, 0, 3.08, ZB + 0.06);
  room.pic(paint, 3.5, 2.0, 0, 3.23, ZB + 0.12, 0);
  room.lamps.push({ x: 0, y: 5.3, z: ZB + 0.8, k: 0.5, r: 2.2 });
  // side walls above the wings: pilasters and blind arches
  for (const s of [-1, 1]) {
    room.wall(wall, (u, v) => [s * RX, v, u], ZB, ZC, yC, yTop, [], 0.5, 0.5, s < 0);
    K.box(white, 0.5, 0.3, ZC - ZB, s * RX, yC - 0.3, (ZB + ZC) / 2);
    for (let z = ZB + 0.9; z < ZC; z += 1.8) {
      K.box(white, 0.08, yTop - yU - 0.4, 0.34, s * (RX - 0.04), yU + 0.1, z);
      K.box(gilt, 0.1, 0.1, 0.42, s * (RX - 0.05), yTop - 0.42, z);
    }
    K.box(white, 0.2, 0.3, ZC - ZB, s * (RX - 0.1), yTop - 0.3, (ZB + ZC) / 2);
    // the screen of columns between atrium and wing, below the gallery
    for (const z of [-2.6, -0.6, 1.4]) column(room, s * RX, z, yG, yC - yG, stone, white);
  }
  // the ceiling: a coved frame round the laylight, the glass itself
  room.grid(white, (u, v) => [u, yTop, v], -RX, -3.4, ZB, ZC, 0.6, 0.6);
  room.grid(white, (u, v) => [u, yTop, v], 3.4, RX, ZB, ZC, 0.6, 0.6);
  room.grid(white, (u, v) => [u, yTop, v], -3.4, 3.4, ZB, -3.7, 0.6, 0.6);
  room.grid(white, (u, v) => [u, yTop, v], -3.4, 3.4, 1.7, ZC, 0.6, 0.6);
  {
    const nx = 4,
      nz = 3;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x0 = -3.4 + (6.8 * i) / nx,
          x1 = -3.4 + (6.8 * (i + 1)) / nx,
          z0 = -3.7 + (5.4 * j) / nz,
          z1 = -3.7 + (5.4 * (j + 1)) / nz;
        K.poly(
          glass,
          [
            [x0, yTop, z0],
            [x1, yTop, z0],
            [x1, yTop, z1],
            [x0, yTop, z1],
          ],
          [
            [tile.u0, tile.v1],
            [tile.u1, tile.v1],
            [tile.u1, tile.v0],
            [tile.u0, tile.v0],
          ],
        );
        K.box(gilt, 0.05, 0.08, z1 - z0, x0, yTop - 0.08, (z0 + z1) / 2);
      }
    for (let j = 0; j <= nz; j++) K.box(gilt, 6.8, 0.08, 0.05, 0, yTop - 0.08, -3.7 + (5.4 * j) / nz);
    room.wins.push({ x: 0, y: yTop, z: -1, nx: 0, ny: -1, nz: 0, area: 70, trans: 0.75 });
  }

  // ── the stair: centre flight to a landing, two flights back up to the galleries
  const N = 12;
  const rise = 0.18;
  const tread = 0.26;
  const zFoot = -0.6;
  const zLand = zFoot - N * tread;
  const yLand = yG + N * rise;
  const yTopStair = yLand + N * rise;
  const treads = M('#e4dccb', RP.MARBLE, 0.3);
  for (let i = 0; i < N; i++) {
    K.box(treads, 3.2, yG + (i + 1) * rise - yG, tread, 0, yG, zFoot - (i + 0.5) * tread);
    for (const s of [-1, 1]) {
      const y0 = yLand + i * rise;
      K.box(treads, 1.8, rise + 0.3, tread, s * 4.3, y0 - 0.3, zLand + (i + 0.5) * tread);
    }
  }
  K.box(red, 1.6, 0.012, ZC - zFoot, 0, yG, (ZC + zFoot) / 2);
  for (let i = 0; i < N; i++) {
    K.box(red, 1.6, 0.01, tread + 0.01, 0, yG + (i + 1) * rise, zFoot - (i + 0.5) * tread);
    K.box(red, 1.6, rise, 0.012, 0, yG + i * rise, zFoot - i * tread + 0.006);
    K.cylX(gilt, 0.008, 1.7, 0, yG + i * rise + 0.012, zFoot - i * tread + 0.02, 5);
  }
  K.box(treads, RX * 2 - 0.2, yLand - yG, zLand - ZB, 0, yG, (zLand + ZB) / 2);
  K.box(red, 1.6, 0.01, zLand - ZB - 0.5, 0, yLand, (zLand + ZB + 0.5) / 2);
  const bal = (a: V3, b: V3) => {
    K.beam(M('#3a2a1c', RP.OAK, 0.4), [a[0], a[1] + 0.92, a[2]], [b[0], b[1] + 0.92, b[2]], 0.08, 0.06);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.round(L / 0.16);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      K.cyl(iron, 0.012, 0.012, 0.9, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 0.02, a[2] + (b[2] - a[2]) * t, 5);
    }
  };
  for (const s of [-1, 1]) {
    bal([s * 1.62, yG, zFoot], [s * 1.62, yLand, zLand]);
    bal([s * 3.38, yLand, zLand], [s * 3.38, yTopStair, zFoot]);
    bal([s * 5.22, yLand, zLand], [s * 5.22, yTopStair, zFoot]);
    room.blockDisc(s * 1.72, zFoot + 0.08, 0.2);
    // the door leaves stand open against the wall
    K.box(M('#5b3b25', RP.OAK, 0.45), 0.07, 2.7, 0.95, s * 1.02, yG, ZC - 0.48);
    room.blockAt(Math.min(s * 0.98, s * 1.06), ZC - 0.96, Math.max(s * 0.98, s * 1.06), ZC, yG - 0.3, yG + 0.3);
    bal([s * 1.62, yLand, zLand], [s * 3.38, yLand, zLand]);
    bal([s * 3.38, yU, zFoot], [s * 3.38, yU, 1.7]);
    // newel with a lamp at the stair's foot
    K.box(stone, 0.3, 1.15, 0.3, s * 1.72, yG, zFoot + 0.08);
    K.lathe(gilt, [[0.1, 0], [0.04, 0.1], [0.03, 0.4], [0, 0.42]], s * 1.72, yG + 1.15, zFoot + 0.08, 8);
    K.sphere(M('#ffe9c4', RP.EMIT, 0, 0, 2.4, 0, 0.1), 0.11, s * 1.72, yG + 1.68, zFoot + 0.08, 10, 8);
    room.halo(s * 1.72, yG + 1.68, zFoot + 0.08, 0.7, '#ffdca8', 0.25);
    room.lamps.push({ x: s * 1.72, y: yG + 1.68, z: zFoot + 0.08, k: 0.35, r: 2 });
    // gallery floor
    room.grid(boards, (u, v) => [u, yU, v], Math.min(s * 3.4, s * RX), Math.max(s * 3.4, s * RX), zFoot, 1.7, 0.6, 0.6, true);
    K.box(white, RX - 3.4, 0.3, 1.7 - zFoot, s * (RX + 3.4) / 2, yU - 0.3, (1.7 + zFoot) / 2);
  }
  // the bridge across the front, with its balustrade
  room.grid(boards, (u, v) => [u, yU, v], -RX, RX, 1.7, ZC, 0.6, 0.6, true);
  K.box(white, RX * 2, 0.3, ZC - 1.7, 0, yU - 0.3, (1.7 + ZC) / 2);
  bal([-3.38, yU, 1.7], [3.38, yU, 1.7]);

  // ── the great chandelier, hanging in the well to eye level from the gallery
  const chY = 6.3;
  const chZ = -1;
  K.rod(M('#8a6d2e', RP.BRASS, 0.3, 1), [0, yTop - 0.02, chZ], [0, chY + 0.9, chZ], 0.018, 6);
  K.lathe(gilt, [[0, 0.9], [0.09, 0.7], [0.05, 0.4], [0.1, 0.2], [0.05, -0.1], [0.12, -0.3], [0, -0.5]], 0, chY, chZ, 12);
  for (const [R, n, y] of [
    [1.05, 16, chY],
    [0.62, 10, chY + 0.42],
  ] as [number, number, number][]) {
    K.torus(gilt, R, 0.022, 0, y, chZ, 6, 40);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.sin(a) * R,
        z = chZ + Math.cos(a) * R;
      K.rod(gilt, [x * 0.1, y + 0.2, chZ + (z - chZ) * 0.1], [x, y, z], 0.008, 4);
      K.cyl(gilt, 0.035, 0.02, 0.03, x, y + 0.02, z, 6);
      K.sphere(flame(((k * 37) % 19) / 19), 0.04, x, y + 0.1, z, 8, 6, 1.3);
      for (const dy of [-0.08, -0.16]) K.sphere(M('#f6efe0', RP.BRASS, 0.1, 1), 0.012, x, y + dy, z, 5, 4);
    }
  }
  room.halo(0, chY + 0.2, chZ, 2.8, '#ffd9a0', 0.16);
  room.lamps.push({ x: 0, y: chY, z: chZ, k: 1.7, r: 5 });

  // ── wings: columns, chandeliers, portraits, benches, palms
  for (const s of [-1, 1]) {
    for (const x of [9, 13.5]) for (const z of [-3.5, 3.3]) if (x < IX - 0.5) column(room, s * x, z, yG, yC - yG, stone, white);
    for (const x of [8.2, 13]) {
      K.rod(iron, [s * x, yC, 0], [s * x, yC - 0.7, 0], 0.012, 4);
      K.torus(gilt, 0.5, 0.02, s * x, yC - 0.72, 0, 5, 20);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        K.sphere(flame(k * 0.05), 0.045, s * x + Math.sin(a) * 0.5, yC - 0.66, Math.cos(a) * 0.5, 6, 5);
      }
      room.halo(s * x, yC - 0.66, 0, 1.4, '#ffd9a0', 0.14);
      room.lamps.push({ x: s * x, y: yC - 0.7, z: 0, k: 0.75, r: 3.4 });
    }
  }
  const portrait = (coat: string, hair: string, key: string) =>
    room.atlas.add(120, 150, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h * 0.35, 8, w / 2, h * 0.5, h * 0.7);
      gr.addColorStop(0, '#5a4630');
      gr.addColorStop(1, '#15100b');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = coat;
      g.beginPath();
      g.ellipse(w / 2, h * 1.02, w * 0.45, h * 0.46, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#efe6d6';
      g.beginPath();
      g.moveTo(w * 0.42, h * 0.58);
      g.lineTo(w * 0.58, h * 0.58);
      g.lineTo(w / 2, h * 0.78);
      g.fill();
      g.fillStyle = '#d9b394';
      g.beginPath();
      g.ellipse(w / 2, h * 0.42, w * 0.15, h * 0.16, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hair;
      g.beginPath();
      g.ellipse(w / 2, h * 0.33, w * 0.16, h * 0.09, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = 'rgba(40,25,15,0.8)';
      g.fillRect(w * 0.42, h * 0.41, w * 0.05, 2);
      g.fillRect(w * 0.53, h * 0.41, w * 0.05, 2);
      g.fillRect(w * 0.45, h * 0.51, w * 0.1, 2);
    }, key);
  const pics = [portrait('#20232a', '#3a2a1c', 'a'), portrait('#3a1d22', '#8d8d86', 'b'), portrait('#1d2f24', '#1c1510', 'c'), portrait('#23233a', '#b9b4a8', 'd')];
  [-13.1, -9.36, 9.36, 13.1].forEach((x, i) => {
    K.box(gilt, 1.3, 1.6, 0.06, x, 1.75, ZB + 0.05);
    room.pic(pics[i], 1.06, 1.33, x, 1.88, ZB + 0.09, 0);
    K.box(dado, 1.8, 0.05, 0.42, x, yG + 0.45, ZB + 0.4);
    for (const e of [-0.8, 0.8]) K.box(dadoD, 0.06, 0.45, 0.4, x + e, yG, ZB + 0.4);
    room.block(x - 0.95, ZB, x + 0.95, ZB + 0.68);
  });
  for (const s of [-1, 1]) {
    const px = s * 6.1,
      pz = ZW - 0.5;
    K.lathe(M('#8a5a3a', PAT.PLAIN, 0.7), [[0.2, 0], [0.3, 0.3], [0.32, 0.55], [0.28, 0.56]], px, yG, pz, 12);
    for (let k = 0; k < 12; k++) {
      const a = k * 2.4;
      const tilt = 0.5 + (k % 3) * 0.28;
      K.boxC(M('#3f6b35', PAT.PLAIN, 0.8), 0.14, 0.03, 1.1, px + Math.sin(a) * 0.42, yG + 1.2 - (k % 3) * 0.12, pz + Math.cos(a) * 0.42, tilt, a, 0);
    }
    room.blockDisc(px, pz, 0.45);
    // flags at the stair's foot
    const fx = s * 3.0;
    K.cyl(gilt, 0.02, 0.03, 2.9, fx, yG, 0.2, 6);
    const cloth = M(s > 0 ? '#1f4f8f' : '#a8282c', PAT.PLAIN, 0.9);
    for (let k = 0; k < 6; k++) {
      const a = 0.2 - k * 0.1;
      const xa = fx + (k % 2 ? 0.035 : -0.035),
        xb = fx + (k % 2 ? -0.035 : 0.035);
      K.quad(cloth, [xa, yG + 1.45, a], [xb, yG + 1.4, a - 0.1], [xb, yG + 2.8, a - 0.1], [xa, yG + 2.8, a], 0.1, 1.3, true);
    }
    K.sphere(gilt, 0.05, fx, yG + 2.94, 0.2, 8, 6);
    room.blockDisc(fx, 0.2, 0.1);
  }

  // ── the table model of the city: the plan itself at 1:220, printed base, every lot a block
  buildModel(env, room, -11.25, 1.0, yG);

  // ── the enquiries counter in the east wing: oak, a brass grille, a ledger, a green-shaded lamp
  {
    const cx = 11.25,
      cz = 1;
    K.box(M('#5a3820', RP.OAK, 0.45), 3.4, 1.02, 0.7, cx, yG, cz);
    K.box(M('#3b2414', RP.OAK, 0.35), 3.55, 0.05, 0.84, cx, yG + 1.02, cz);
    for (let x = -1.5; x <= 1.5; x += 0.5) K.box(M('#3b2414', RP.OAK, 0.5), 0.34, 0.76, 0.02, cx + x, yG + 0.12, cz - 0.36);
    K.box(M('#efe6d2', PAT.PLAIN, 0.9), 0.5, 0.04, 0.36, cx - 0.7, yG + 1.07, cz + 0.05, 0.2);
    K.box(M('#7a1e22', PAT.PLAIN, 0.8), 0.52, 0.015, 0.38, cx - 0.7, yG + 1.07, cz + 0.05, 0.2);
    K.cyl(gilt, 0.02, 0.06, 0.34, cx + 0.8, yG + 1.07, cz, 8);
    K.lathe(M('#1f5a3a', PAT.PLAIN, 0.35), [[0.17, 0], [0.13, 0.08], [0.05, 0.14], [0, 0.15]], cx + 0.8, yG + 1.4, cz, 12);
    K.sphere(M('#ffe6b0', RP.EMIT, 0, 0, 2.2, 0, 0.1), 0.04, cx + 0.8, yG + 1.41, cz, 8, 6);
    room.lamps.push({ x: cx + 0.8, y: yG + 1.4, z: cz, k: 0.3, r: 1.2 });
    for (let x = -1.5; x <= 1.5; x += 0.1) K.rod(gilt, [cx + x, yG + 1.07, cz - 0.26], [cx + x, yG + 1.62, cz - 0.26], 0.006, 4);
    K.box(gilt, 3.1, 0.03, 0.03, cx, yG + 1.62, cz - 0.26);
    room.block(cx - 1.8, cz - 0.45, cx + 1.8, cz + 0.45);
  }
  room.lamps.push({ x: -11.25, y: yC - 0.3, z: 1, k: 0.6, r: 2.6 });

  // ── reception room behind the balcony
  const RZ0 = ZC,
    RZ1 = d.zR - 0.6;
  const RX1 = RX - 0.3;
  room.grid(boards, (u, v) => [u, yU, v], -RX1, RX1, RZ0, RZ1, 0.5, 0.5, true);
  room.grid(white, (u, v) => [u, yTop, v], -RX1, RX1, RZ0, RZ1, 0.6, 0.6);
  for (const s of [-1, 1]) room.grid(wall, (u, v) => [s * RX1, v, u], RZ0, RZ1, yU, yTop, 0.5, 0.5, s < 0);
  room.wall(wall, (u, v) => [u, v, RZ0 + 0.3], -RX1, RX1, yU, yTop, [upperDoor], 0.5, 0.5, false);
  const fr = archPoints(1.6, 3.6, 0.8, 8);
  const hf: Hole[] = [
    { u: -3.3, pts: fr, v0: d.y1 + 0.45 },
    { u: 0, pts: archPoints(1.6, 3.83, 0.8, 8), v0: d.y1 + 0.22 },
    { u: 3.3, pts: fr, v0: d.y1 + 0.45 },
  ];
  room.wall(wall, (u, v) => [u, v, RZ1], -RX1, RX1, yU, yTop, hf, 0.5, 0.4, true);
  for (const h of hf) {
    room.reveal(white, (u, v, dep) => [u, v, RZ1 + dep], h, 0, 0.6);
    room.wins.push({ x: h.u, y: 7, z: RZ1, nx: 0, nz: -1, area: 5.4, trans: 1 });
    if (h.u !== 0) {
      K.box(iron, 0.05, 3.3, 0.05, h.u, h.v0, RZ1 + 0.3);
      K.box(iron, 1.6, 0.05, 0.05, h.u, h.v0 + 2.5, RZ1 + 0.3);
    }
  }
  K.box(stone, 1.6, d.y1 + 0.22 - yU, d.zR - RZ1, 0, yU, (RZ1 + d.zR) / 2);
  // curtains, a long table with papers, chairs, a small chandelier
  for (const x of [-3.3, 0, 3.3])
    for (const e of [-1, 1]) {
      const cc = M('#7a1e22', PAT.PLAIN, 0.9);
      for (let k = 0; k < 5; k++) K.box(cc, 0.12, 4.0, 0.06 + (k % 2) * 0.05, x + e * (0.95 + k * 0.11), yU + 0.1, RZ1 - 0.07);
    }
  K.box(dadoD, 3.2, 0.07, 0.8, 0, yU + 0.72, (RZ0 + RZ1) / 2 + 0.05);
  for (const e of [-1.4, 1.4]) for (const q of [-0.3, 0.3]) K.box(dadoD, 0.07, 0.72, 0.07, e, yU, (RZ0 + RZ1) / 2 + 0.05 + q);
  room.blockAt(-1.7, (RZ0 + RZ1) / 2 - 0.4, 1.7, (RZ0 + RZ1) / 2 + 0.5, yU - 0.3, yU + 0.3);
  room.lamps.push({ x: 0, y: 8, z: (RZ0 + RZ1) / 2, k: 0.7, r: 3.2 });
  K.torus(gilt, 0.55, 0.02, 0, 8, (RZ0 + RZ1) / 2, 5, 22);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    K.sphere(flame(k * 0.05), 0.05, Math.sin(a) * 0.55, 8.07, (RZ0 + RZ1) / 2 + Math.cos(a) * 0.55, 6, 5);
  }
  K.rod(iron, [0, yTop, (RZ0 + RZ1) / 2], [0, 8, (RZ0 + RZ1) / 2], 0.012, 4);
  const motto = room.atlas.add(512, 56, (g, w, h) => {
    g.fillStyle = '#26332a';
    g.fillRect(0, 0, w, h);
    drawText(g, 'FOR THE TOWN AND THE TIDE', w / 2, h / 2 + 1, 'bold 27px Georgia, serif', '#e6c56a', 2);
  });
  room.pic(motto, 4.4, 0.48, 0, 8.05, ZC - 0.02, Math.PI);

  // ── the walker
  const yStair = (z: number): number => yG + Math.min(N, Math.max(0, Math.ceil((zFoot - z) / tread))) * rise;
  const yFlight = (z: number): number => yLand + Math.min(N, Math.max(0, Math.ceil((z - zLand) / tread))) * rise;
  // the loggia: three treads between the square and the floor
  const yLog = (z: number): number => (z > 4.92 ? Math.max(0, yG - Math.ceil((z - 4.92) / 0.3) * 0.15) : yG);
  const W = (fn: (lz: number) => number) => (x: number, z: number): number => fn(room.lz(x, z));
  room.walk(-5.2, 3.55, 5.2, d.zR - 0.6, W(yLog));
  for (const ax of [-3.3, 0, 3.3]) room.walk(ax - 1.05, d.zR - 0.6, ax + 1.05, d.fp.z1 - d.cz + 0.05, 0);
  room.walk(-0.9, ZC - 0.02, 0.9, 3.56, yG);
  // ground floor: the well round the flight, the wings
  room.walk(-1.62, zFoot, 1.62, ZC, yG);
  for (const s of [-1, 1]) {
    room.walk(Math.min(s * 1.62, s * 5.7), zLand, Math.max(s * 1.62, s * 5.7), ZC, yG);
    room.walk(Math.min(s * 5.7, s * IX), ZB, Math.max(s * 5.7, s * IX), ZW, yG);
    for (const z of [-2.6, -0.6, 1.4]) room.blockDisc(s * RX, z, 0.3);
    for (const x of [9, 13.5]) for (const z of [-3.5, 3.3]) room.blockDisc(s * x, z, 0.3);
    room.blockAt(Math.min(s * 3.4, s * 5.7), zLand, Math.max(s * 3.4, s * 5.7), zFoot, yG - 0.3, yG + 0.3);
  }
  // up
  room.walk(-1.6, zLand, 1.6, zFoot, W(yStair));
  room.walk(-RX + 0.1, ZB + 0.05, RX - 0.1, zLand, yLand);
  for (const s of [-1, 1]) {
    room.walk(Math.min(s * 3.42, s * 5.2), zLand, Math.max(s * 3.42, s * 5.2), zFoot, W(yFlight));
    room.walk(Math.min(s * 3.42, s * 5.5), zFoot, Math.max(s * 3.42, s * 5.5), 1.72, yTopStair);
  }
  room.walk(-5.5, 1.72, 5.5, ZC, yTopStair);
  room.walk(-0.8, ZC, 0.8, ZC + 0.32, yTopStair);
  room.walk(-RX1 + 0.02, ZC + 0.3, RX1 - 0.02, RZ1, yTopStair);
  room.walk(-0.7, RZ1, 0.7, d.zR + 0.02, 4.92);
  room.walk(-RX + 0.5, d.zR, RX - 0.5, d.zR + 0.9, d.y1 + 0.38);

  // light from above, dust in it
  room.addShafts([-3.4, yTop, -3.7], [3.4, yTop, -3.7], [-3.4, yTop, 1.7], [0, 1, 0], tile, env.ctx.quality.level === 'high' ? 4 : 2, [0, 0, 1]);
  const mr = room.rectL(-5.4, ZB + 2, 5.4, ZC);
  room.moteBox = new THREE.Box3(new THREE.Vector3(mr.x0, yG + 0.2, mr.z0), new THREE.Vector3(mr.x1, yTop - 0.3, mr.z1));
  room.moteCount = env.ctx.quality.level === 'high' ? 300 : 140;
  room.ambient = 0.2;
  room.skyK = 1.0;
  room.lampK = 0.6;
  room.sunK = 0.9;
  return room;
}

function column(room: Room, x: number, z: number, y: number, h: number, shaft: ReturnType<typeof M>, cap: ReturnType<typeof M>): void {
  const K = room.K;
  K.box(cap, 0.66, 0.2, 0.66, x, y, z);
  K.lathe(shaft, [[0.3, 0.2], [0.26, 0.3], [0.225, 0.42], [0.19, h - 0.5], [0.24, h - 0.38], [0.3, h - 0.26]], x, y, z, 20);
  K.box(cap, 0.68, 0.26, 0.68, x, y + h - 0.26, z);
}

/** the plan as a table model: colours printed on the top from the occupancy grid, blocks for the lots */
function buildModel(env: Env, room: Room, x: number, z: number, yFloor: number): void {
  const K = room.K;
  const plan = env.ctx.plan;
  const s = plan.slab;
  const side = 2.6;
  const k = side / Math.max(s.x1 - s.x0, s.z1 - s.z0);
  const mx = (s.x0 + s.x1) / 2,
    mz = (s.z0 + s.z1) / 2;
  const top = yFloor + 0.88;
  // table
  K.box(M('#3b2414', RP.OAK, 0.5), side + 0.24, 0.08, side + 0.24, x, top - 0.08, z);
  for (const a of [-1, 1]) for (const b of [-1, 1]) K.lathe(M('#3b2414', RP.OAK, 0.5), [[0.05, 0], [0.09, 0.1], [0.05, 0.3], [0.07, 0.78], [0.1, 0.8]], x + a * (side / 2 - 0.05), yFloor, z + b * (side / 2 - 0.05), 8);
  K.box(M('#c79c48', RP.BRASS, 0.3, 1), side + 0.28, 0.03, 0.03, x, top + 0.05, z - side / 2 - 0.12);
  K.box(M('#c79c48', RP.BRASS, 0.3, 1), side + 0.28, 0.03, 0.03, x, top + 0.05, z + side / 2 + 0.12);
  K.box(M('#c79c48', RP.BRASS, 0.3, 1), 0.03, 0.03, side + 0.28, x - side / 2 - 0.12, top + 0.05, z);
  K.box(M('#c79c48', RP.BRASS, 0.3, 1), 0.03, 0.03, side + 0.28, x + side / 2 + 0.12, top + 0.05, z);
  room.block(x - side / 2 - 0.15, z - side / 2 - 0.15, x + side / 2 + 0.15, z + side / 2 + 0.15);
  // the printed base
  const N = 256;
  const base = room.atlas.add(N, N, (g) => {
    const occ = env.ctx.occupancy;
    const sd = Math.max(s.x1 - s.x0, s.z1 - s.z0);
    for (let j = 0; j < N; j++) {
      const wz = mz + ((j + 0.5) / N - 0.5) * sd;
      let run = 0;
      let col = '';
      for (let i = 0; i <= N; i++) {
        const wx = mx + ((i + 0.5) / N - 0.5) * sd;
        const o = wx >= s.x0 && wx <= s.x1 && wz >= s.z0 && wz <= s.z1 ? occ.get(wx, wz) : 0;
        const c = i === N ? '' : o & OCC.WATER ? '#5e8fb0' : o & OCC.ROAD ? '#5a5a5c' : o & OCC.SIDEWALK ? '#a8a294' : o & OCC.RAIL ? '#4a3f36' : o & (OCC.PATH | OCC.PAVED) ? '#b8ab8c' : '#7f9a5e';
        if (c !== col) {
          if (col) {
            g.fillStyle = col;
            g.fillRect(run, j, i - run, 1);
          }
          col = c;
          run = i;
        }
      }
    }
  });
  K.poly(
    M('#ffffff', RP.PIC, 0.5),
    [
      [x - side / 2, top + 0.004, z + side / 2],
      [x + side / 2, top + 0.004, z + side / 2],
      [x + side / 2, top + 0.004, z - side / 2],
      [x - side / 2, top + 0.004, z - side / 2],
    ],
    [
      [base.u0, base.v0],
      [base.u1, base.v0],
      [base.u1, base.v1],
      [base.u0, base.v1],
    ],
  );
  // the blocks: pale card, the landmarks picked out; a small gable reads better than a flat lid
  const card = M('#e9e2d0', PAT.PLAIN, 0.8);
  const hero = M('#c9a15a', RP.BRASS, 0.3, 1);
  const set = new Set(['church', 'townhall', 'station', 'stadium', 'tvtower']);
  for (const l of plan.lots) {
    const f = l.footprint;
    const h = Math.max(0.006, Math.min(l.height * k, 0.8));
    const lx = x + ((f.x0 + f.x1) / 2 - mx) * k,
      lz = z + ((f.z0 + f.z1) / 2 - mz) * k;
    K.box(set.has(l.kind) ? hero : card, Math.max(0.006, (f.x1 - f.x0) * k), h, Math.max(0.006, (f.z1 - f.z0) * k), lx, top, lz);
  }
}
