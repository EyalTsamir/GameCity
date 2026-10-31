// Tinyhaven Central from inside (`?noherostation`: the old furnished hall). In through the middle door under the marquise,
// across a booking hall as tall as a nave under its glass vault, out through the far door towards the trains. The vault's
// ribs throw their grid across the floor and it swings with the sun; the great lunette windows glow at both ends; globes on
// long rods at dusk. Near-only (landmarks/rooms.ts).

import * as THREE from 'three';
import { M, PAT } from './builder';
import { archPoints, type V3 } from './kit';
import { Hole, RP, Room, Rooms } from './rooms';
import type { Env } from './env';
import { C } from './parts';
import { drawText } from './signs';
import { addActor } from '../../sim/pedestrians/actorDefs';

export interface StationDims {
  HX: number;
  zF: number;
  zB: number;
  ySpring: number;
  rise: number;
  cx: number;
  cz: number;
  yaw: number;
  winF: { w: number; y: number; h: number; arch: number };
  winB: { w: number; y: number; h: number; arch: number };
}

export function buildStationRoom(env: Env, rooms: Rooms, d: StationDims): Room {
  const room = rooms.add(new Room('station', 2048, 1536));
  room.frame(d.cx, d.cz, d.yaw);
  room.near = 34;
  const K = room.K;
  const { HX, ySpring, rise } = d;
  const IX = HX - 0.52;
  const ZF = d.zF - 0.57;
  const ZB = d.zB + 0.52;
  const yF = 0.03;
  const yTopWall = ySpring - 0.2;
  const R = (rise * rise + HX * HX) / (2 * rise);
  const yc = ySpring + rise - R;
  room.bounds = room.rectL(-IX, d.zB - 0.2, IX, d.zF + 0.2);

  // ── atlas: glazing tile, south wall sun mask, blank; then the lunettes and the pictures
  const CW = 512;
  const tile = room.atlas.add(CW, CW, (g, w, h) => {
    g.fillStyle = '#f4f2e6';
    g.fillRect(0, 0, w, h);
    // weather and soot on old roof glass, thicker towards one edge
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(90,90,80,${0.02 + (i % 5) * 0.012})`;
      g.fillRect((i * 97) % w, (i * 53) % h, 30 + (i % 9) * 8, 14 + (i % 7) * 6);
    }
    g.fillStyle = 'rgba(25,30,28,0.96)';
    g.fillRect(0, 0, w, 44); // the rib
    for (let i = 0; i < 2; i++) g.fillRect((i * w) / 2, 0, 16, h); // glazing bars across
    g.fillRect(0, h * 0.52, w, 7);
    g.fillRect(w * 0.25 - 3, 0, 6, h);
    g.fillRect(w * 0.75 - 3, 0, 6, h);
  });
  const SW = 15.2,
    SH = 14;
  const maskPts = archPoints(d.winF.w, d.winF.h, d.winF.arch, 16);
  room.atlas.add(CW, CW, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const X = (x: number) => ((x + SW / 2) / SW) * w,
      Y = (y: number) => h - (y / SH) * h;
    g.fillStyle = '#fff5e0';
    g.beginPath();
    maskPts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(d.winF.y + y)) : g.moveTo(X(x), Y(d.winF.y + y))));
    g.closePath();
    g.fill();
    // bars and the clock's shadow
    g.fillStyle = '#000';
    for (let i = -4; i <= 4; i++) g.fillRect(X((i * d.winF.w) / 9) - 2, 0, 4, h);
    for (let y = d.winF.y; y < d.winF.y + d.winF.h; y += 1.2) g.fillRect(0, Y(y) - 2, w, 4);
    g.beginPath();
    g.arc(X(0), Y(d.winF.y + d.winF.h - d.winF.w / 2 + 1), (1.6 / SW) * w, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // the open door
    g.fillStyle = '#fff5e0';
    g.fillRect(X(-1.2), Y(3.6), X(1.2) - X(-1.2), Y(0) - Y(3.6));
  });
  room.atlas.add(CW, CW, (g, w, h) => g.clearRect(0, 0, w, h));
  room.cellStride = (CW + 2) / room.atlas.W;
  room.cellW = CW / room.atlas.W;
  room.cellH = CW / room.atlas.H;
  room.cellV0 = tile.v0;
  room.row = { X: d.zF - 0.3, z0: 0, period: 60, count: 1, w: SW, y0: 0, h: SH };
  room.swapAxes = true;
  room.roof = { y: ySpring + rise * 0.75, hx: HX, z0: ZB, z1: ZF };
  room.roofOnly = [1e3, -1e3, 4.4, 2.15];
  room.zone = [ZB - 0.2, ZF + 0.2, -IX - 0.1, IX + 0.1];

  // ── materials
  const terrazzo = M('#b8a68c', RP.MOSAIC, 0.4, 0, 0, 0, 0.3);
  const band = M('#6b2f26', RP.MOSAIC, 0.4, 0, 0, 0, 0.7);
  const wall = M('#d9c8a6', RP.PLASTER, 0.9, 0, 0, 0, 0.15);
  const dadoM = M('#6c7a68', RP.MARBLE, 0.3);
  const stone = M('#cfc2a8', RP.MARBLE, 0.5);
  const white = M('#ece4d0', PAT.PLAIN, 0.85);
  const iron = M('#1f2a26', PAT.PLAIN, 0.55, 0.5);
  const oak = M('#5b3a22', RP.OAK, 0.45);
  const oakD = M('#37230f', RP.OAK, 0.45);
  const brass = M('#c79c48', RP.BRASS, 0.3, 1);
  const glass = M('#ffffff', RP.GLASS, 0.3);
  const marble = M('#ece6d8', RP.MARBLE, 0.3);
  const green = M('#2e5b44', PAT.PLAIN, 0.8);
  const globe = (s: number) => M('#ffe6bc', RP.EMIT, 0, 0, 2.2, 0, s * 0.49);

  // ── floor: terrazzo in bays, dark bands, a compass rose in mosaic in the middle
  room.grid(terrazzo, (u, v) => [u, yF, v], -IX, IX, ZB, ZF, 0.6, 0.6, true);
  for (const z of [ZB + 1.2, ZF - 1.2]) K.box(band, IX * 2, 0.006, 0.28, 0, yF, z);
  for (const s of [-1, 1]) K.box(band, 0.28, 0.006, ZF - ZB - 2.4, s * (IX - 1.2), yF, (ZF + ZB) / 2);
  const rose = room.atlas.add(512, 512, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#b8a68c';
    g.fillRect(0, 0, w, h);
    const ring = (r: number, col: string) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.fill();
    };
    ring(254, '#34493f');
    ring(236, '#d9c8a6');
    ring(214, '#6b2f26');
    ring(204, '#e8dcc0');
    const star = (n: number, r0: number, r1: number, a: string, b: string, off: number) => {
      for (let i = 0; i < n; i++) {
        const t = off + (i / n) * Math.PI * 2;
        for (const [sd, col] of [[1, a], [-1, b]] as [number, string][]) {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(c, c);
          g.lineTo(c + Math.cos(t) * r1, c + Math.sin(t) * r1);
          g.lineTo(c + Math.cos(t + (sd * Math.PI) / n) * r0, c + Math.sin(t + (sd * Math.PI) / n) * r0);
          g.fill();
        }
      }
    };
    star(8, 40, 150, '#8a7a56', '#c9b78c', Math.PI / 8);
    star(4, 46, 198, '#2c4a5e', '#d9b75a', -Math.PI / 2);
    ring(26, '#6b2f26');
    ring(12, '#d9b75a');
    g.fillStyle = '#20302a';
    drawText(g, 'N', c, 26, 'bold 30px Georgia, serif', '#e8dcc0', 0);
    // tesserae
    g.strokeStyle = 'rgba(40,30,20,0.18)';
    g.lineWidth = 1;
    for (let i = 0; i < w; i += 6) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, h);
      g.moveTo(0, i);
      g.lineTo(w, i);
      g.stroke();
    }
  });
  {
    const r = 2.9;
    const zc = (ZF + ZB) / 2;
    K.poly(
      M('#ffffff', RP.PIC, 0.4),
      [[-r, yF + 0.008, zc + r], [r, yF + 0.008, zc + r], [r, yF + 0.008, zc - r], [-r, yF + 0.008, zc - r]],
      [[rose.u0, rose.v0], [rose.u1, rose.v0], [rose.u1, rose.v1], [rose.u0, rose.v1]],
    );
  }

  // ── walls: green marble dado, plaster, pilasters, cornice
  for (const s of [-1, 1]) {
    room.wall(wall, (u, v) => [s * IX, v, u], ZB, ZF, yF, yTopWall, [], 0.7, 0.7, s < 0);
    K.box(dadoM, 0.05, 1.9, ZF - ZB, s * (IX - 0.02), yF, (ZF + ZB) / 2);
    K.box(stone, 0.09, 0.08, ZF - ZB, s * (IX - 0.04), yF + 1.9, (ZF + ZB) / 2);
    K.box(white, 0.5, 0.36, ZF - ZB, s * (IX - 0.2), yTopWall - 0.3, (ZF + ZB) / 2);
    for (const z of [ZB + 0.5, -2.45, 2.45, ZF - 0.5]) {
      K.box(stone, 0.28, yTopWall - 2.0 - 0.3, 0.6, s * (IX - 0.1), 2.0, z);
      K.box(brass, 0.32, 0.12, 0.66, s * (IX - 0.11), yTopWall - 0.42, z);
    }
    // iron brackets carrying the vault
    for (let z = ZB; z <= ZF + 0.01; z += (ZF - ZB) / 4) K.beam(iron, [s * (IX - 0.05), yTopWall - 2.0, z], [s * (IX - 1.1), yTopWall + 0.3, z], 0.1, 0.14);
  }
  // end walls round the door and the lunette; the panes glow from the atlas
  const door = archPoints(2.6, 4, 1.3, 10);
  const ends: [number, { w: number; y: number; h: number; arch: number }, boolean][] = [
    [ZF, d.winF, true],
    [ZB, d.winB, false],
  ];
  for (const [z, W, south] of ends) {
    const pts = archPoints(W.w, W.h, W.arch, 16);
    const holes: Hole[] = [{ u: 0, pts: door, v0: 0 }, { u: 0, pts, v0: W.y }];
    const sg = south ? 1 : -1;
    const top = yc + Math.sqrt(R * R);
    room.wall(wall, (u, v) => [u, v, z], -IX, IX, yF, top, holes, 0.7, 0.7, south, (v) => {
      if (v <= ySpring) return [-IX, IX];
      const hw = Math.sqrt(Math.max(0, R * R - (v - yc) * (v - yc)));
      return [Math.max(-IX, -hw), Math.min(IX, hw)];
    });
    const pz = z + sg * 0.12;
    const Ra = (W.arch * W.arch + (W.w / 2) * (W.w / 2)) / (2 * W.arch);
    const hwAt = (y: number): number => {
      const q = y - W.y;
      if (q < W.h - W.arch) return W.w / 2;
      const c = W.h - Ra;
      return Math.sqrt(Math.max(0, Ra * Ra - (q - c) * (q - c)));
    };
    for (let y = W.y + 0.02; y < W.y + W.h - 0.2; y += 1.15) {
      const hw = hwAt(y);
      K.box(iron, hw * 2, y === W.y + 0.02 ? 0.12 : 0.055, 0.06, 0, y, pz);
    }
    for (let i = -5; i <= 5; i++) {
      const x = (i * W.w) / 11;
      const tall = (y: number) => hwAt(y) >= Math.abs(x);
      let y1 = W.y + W.h;
      while (y1 > W.y && !tall(y1)) y1 -= 0.05;
      K.box(iron, i === 0 ? 0.1 : 0.05, y1 - W.y, 0.06, x, W.y, pz);
    }
    // the rim of the opening, and the back of the great clock on the south side
    room.reveal(white, (u, v, dep) => [u, v, z + sg * dep], { u: 0, pts: archPoints(W.w - 0.03, W.h - 0.03, W.arch, 16), v0: W.y + 0.015 }, 0, 0.22, !south);
    if (south) {
      K.disc(iron, 1.62, 0.06, 0, W.y + W.h - W.w / 2 + 1, pz + 0.06, 0, 32);
      K.disc(M('#fff4dc', RP.EMIT, 0, 0, 1.2, 0, 0.6), 1.45, 0.02, 0, W.y + W.h - W.w / 2 + 1, pz + 0.01, 0, 32);
    }
    room.wins.push({ x: 0, y: W.y + W.h / 2, z, nx: 0, nz: -sg, area: W.w * W.h * 0.8, trans: 0.75 });
    room.wins.push({ x: 0, y: 2, z, nx: 0, nz: -sg, area: 8, trans: 0.8 });
    // the door's thickness and the closed doors either side
    room.reveal(white, (u, v, dep) => [u, v, z + sg * dep], { u: 0, pts: archPoints(2.57, 3.98, 1.28, 10), v0: 0 }, 0, 0.5, !south);
    for (const s of [-1, 1]) {
      K.box(oakD, 2.5, 3.5, 0.08, s * 3.55, yF, z - sg * 0.05);
      for (const q of [-0.6, 0.6]) {
        K.box(oak, 1.0, 1.45, 0.03, s * 3.55 + q, yF + 0.15, z - sg * 0.1);
        K.box(oak, 1.0, 1.45, 0.03, s * 3.55 + q, yF + 1.85, z - sg * 0.1);
      }
      K.cyl(brass, 0.02, 0.02, 0.5, s * 3.55 + 0.08, yF + 1.2, z - sg * 0.13, 6);
      K.box(stone, 2.9, 0.22, 0.14, s * 3.55, yF + 3.5, z - sg * 0.08);
    }
    K.box(white, IX * 2, 0.3, 0.2, 0, W.y - 0.34, z - sg * 0.1);
  }
  // door leaves folded against the walls either side of the opening
  for (const z of [ZF, ZB])
    for (const s of [-1, 1]) K.box(oakD, 0.07, 3.1, 1.2, s * 1.34, yF, z + (z > 0 ? -0.62 : 0.62));

  // ── the vault in glass, seen from below
  const segs = 14;
  const th0 = Math.atan2(ySpring - yc, HX);
  const nb = Math.round((ZF - ZB) / 2.15);
  const pt = (i: number): [number, number] => {
    const th = Math.PI - th0 - (i / segs) * (Math.PI - 2 * th0);
    return [(R - 0.02) * Math.cos(th), yc + (R - 0.02) * Math.sin(th)];
  };
  for (let i = 0; i < segs; i++) {
    const [xa, ya] = pt(i),
      [xb, yb] = pt(i + 1);
    for (let k = 0; k < nb; k++) {
      const z0 = ZB + ((ZF - ZB) * k) / nb,
        z1 = ZB + ((ZF - ZB) * (k + 1)) / nb;
      const p: V3[] = [[xa, ya, z0], [xb, yb, z0], [xb, yb, z1], [xa, ya, z1]];
      K.poly(glass, p, [[tile.u0, tile.v0], [tile.u1, tile.v0], [tile.u1, tile.v1], [tile.u0, tile.v1]]);
    }
  }
  room.wins.push({ x: 0, y: ySpring + rise, z: 0, nx: 0, ny: -1, nz: 0, area: 110, trans: 0.72 });

  // ── booking office (west): oak screen, three windows with brass grilles, lit from inside
  const ox = -IX + 0.85;
  K.box(oak, 1.7, 3.0, 6.6, ox, yF, 0);
  K.box(oakD, 1.9, 0.26, 6.8, ox, yF + 3.0, 0);
  const fx = ox + 0.87;
  const clerkLamp = M('#ffe6bc', RP.EMIT, 0, 0, 1.6, 0, 0.3);
  for (let i = -1; i <= 1; i++) {
    const z = i * 2.05;
    K.box(oakD, 0.03, 1.2, 1.55, fx, yF + 1.0, z);
    K.box(M('#f3d48a', RP.EMIT, 0, 0, 0.8, 0, 0.3), 0.01, 0.95, 1.3, fx + 0.016, yF + 1.12, z);
    for (let k = -6; k <= 6; k++) K.rod(brass, [fx + 0.04, yF + 1.12, z + k * 0.1], [fx + 0.04, yF + 2.07, z + k * 0.1], 0.006, 4);
    K.box(brass, 0.04, 0.03, 1.32, fx + 0.04, yF + 2.07, z);
    K.box(marble, 0.42, 0.05, 1.7, fx + 0.14, yF + 0.98, z);
    K.sphere(clerkLamp, 0.05, fx + 0.03, yF + 2.25, z, 8, 6);
    room.lamps.push({ x: fx + 0.15, y: yF + 2.25, z, k: 0.3, r: 1.2 });
    const nameP = room.atlas.add(180, 40, (g, w, h) => {
      g.fillStyle = '#20302a';
      g.fillRect(0, 0, w, h);
      drawText(g, ['ENQUIRIES', 'TICKETS', 'SEASONS'][i + 1], w / 2, h / 2 + 1, 'bold 24px Georgia, serif', '#e6c56a', 2);
    });
    room.pic(nameP, 1.1, 0.24, fx + 0.03, yF + 2.35, z, Math.PI / 2);
  }
  room.block(-IX, -3.5, ox + 0.95, 3.5);
  // above the office: the railway map, enamel on steel
  const map = room.atlas.add(512, 320, (g, w, h) => {
    g.fillStyle = '#f2ead6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7fa9bd';
    g.fillRect(w * 0.76, 0, w * 0.24, h);
    g.strokeStyle = '#a8282c';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(14, h * 0.32);
    g.bezierCurveTo(w * 0.3, h * 0.2, w * 0.5, h * 0.62, w * 0.76, h * 0.42);
    g.stroke();
    g.strokeStyle = '#1f4f8f';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w * 0.42, h * 0.42);
    g.bezierCurveTo(w * 0.4, h * 0.64, w * 0.6, h * 0.74, w * 0.72, h * 0.9);
    g.stroke();
    for (const [x, y, n] of [[0.1, 0.27, 'Westbrook'], [0.42, 0.4, 'CENTRAL'], [0.64, 0.5, 'Harbour'], [0.73, 0.88, 'Sunny Beach'], [0.52, 0.72, 'Old Town']] as [number, number, string][]) {
      g.fillStyle = '#fff';
      g.strokeStyle = '#1c1c1c';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x * w, y * h, 8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.textAlign = 'left';
      g.fillStyle = '#1c1c1c';
      g.font = 'bold 19px Georgia, serif';
      g.fillText(n, x * w + 12, y * h - 12);
    }
    g.fillStyle = '#20302a';
    g.fillRect(0, 0, w, 40);
    drawText(g, 'TINYHAVEN & DISTRICT RAILWAY', w / 2, 21, 'bold 24px Georgia, serif', '#e6c56a', 1);
    g.strokeStyle = '#20302a';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  });
  K.box(brass, 0.05, 2.65, 4.1, -IX + 0.06, 4.15, 0);
  room.pic(map, 3.9, 2.44, -IX + 0.12, 4.25, 0, Math.PI / 2);

  // ── café (east): marble counter, machine, cake dome, striped awning, little tables
  const cx = IX - 0.72;
  K.box(oak, 0.72, 1.02, 4.2, cx, yF, 0);
  K.box(marble, 0.84, 0.05, 4.3, cx, yF + 1.02, 0);
  K.box(M('#a9aeb2', RP.BRASS, 0.25, 1), 0.45, 0.46, 0.7, cx + 0.05, yF + 1.07, -1.1);
  for (const q of [-0.2, 0.2]) K.cyl(brass, 0.03, 0.03, 0.16, cx - 0.2, yF + 1.2, -1.1 + q, 8);
  K.lathe(M('#d8ecf0', RP.BRASS, 0.05, 1), [[0.18, 0], [0.18, 0.2], [0.12, 0.28], [0.02, 0.31], [0, 0.34]], cx - 0.05, yF + 1.07, 0.7, 12);
  K.lathe(M('#c7824a', PAT.PLAIN, 0.8), [[0.13, 0], [0.13, 0.1], [0, 0.1]], cx - 0.05, yF + 1.07, 0.7, 12);
  K.box(oakD, 0.06, 1.5, 3.8, IX - 0.05, yF + 2.1, 0);
  for (let i = 0; i < 14; i++) K.box(i % 2 ? M('#2e5b44', PAT.PLAIN, 0.85) : M('#f0e6d0', PAT.PLAIN, 0.85), 1.4, 0.03, 0.3, IX - 0.7, yF + 2.52, -2.05 + i * 0.315, 0);
  const cafe = room.atlas.add(256, 48, (g, w, h) => {
    g.fillStyle = '#2e5b44';
    g.fillRect(0, 0, w, h);
    drawText(g, 'STATION CAFE', w / 2, h / 2 + 1, 'bold 26px Georgia, serif', '#f6efe0', 2);
  });
  room.pic(cafe, 2.4, 0.45, IX - 0.09, yF + 3.08, 0, -Math.PI / 2);
  room.block(cx - 0.45, -2.2, IX, 2.2);
  for (const tz of [-2.8, 2.8]) {
    const tx = IX - 1.5;
    K.cyl(iron, 0.04, 0.22, 0.72, tx, yF, tz, 10);
    K.cyl(marble, 0.38, 0.38, 0.035, tx, yF + 0.72, tz, 18);
    K.cyl(M('#f4efe4', PAT.PLAIN, 0.5), 0.04, 0.03, 0.05, tx + 0.1, yF + 0.755, tz, 8);
    room.blockDisc(tx, tz, 0.45);
    for (const a of [1.2, 1.2 + Math.PI]) {
      const chx = tx + Math.sin(a) * 0.62,
        chz = tz + Math.cos(a) * 0.62;
      K.cyl(oakD, 0.17, 0.17, 0.04, chx, yF + 0.45, chz, 10);
      for (const q of [0.6, 2.2, 3.8, 5.4]) K.rod(iron, [chx + Math.sin(q) * 0.13, yF, chz + Math.cos(q) * 0.13], [chx + Math.sin(q) * 0.1, yF + 0.45, chz + Math.cos(q) * 0.1], 0.01, 4);
      K.box(oakD, 0.34, 0.42, 0.03, chx + Math.sin(a) * 0.16, yF + 0.5, chz + Math.cos(a) * 0.16, a);
      room.blockDisc(chx, chz, 0.2);
    }
  }

  // ── departures over the far door, the hanging clock (real time) in the middle
  const bz = ZB + 1.7;
  const board = room.atlas.add(512, 200, (g, w, h) => {
    g.fillStyle = '#0d0f10';
    g.fillRect(0, 0, w, h);
    drawText(g, 'DEPARTURES', w / 2, 20, 'bold 24px Arial, sans-serif', '#f4f1e6', 3);
    const rows = [['10:42', 'Harbour & Beach', '1'], ['10:51', 'Westbrook', '2'], ['11:05', 'Riverside', '1'], ['11:12', 'Old Town', '2'], ['11:20', 'Stadium Halt', '1'], ['11:34', 'Northern Hills', '2']];
    g.font = 'bold 21px Consolas, monospace';
    g.textBaseline = 'middle';
    rows.forEach(([t, dest, pl], i) => {
      const y = 50 + i * 25;
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(10, y - 11, w - 20, 22);
      g.fillStyle = '#ffb43a';
      g.textAlign = 'left';
      g.fillText(t, 14, y);
      g.fillText(dest, 96, y);
      g.textAlign = 'right';
      g.fillText(pl, w - 16, y);
    });
    g.textAlign = 'left';
  });
  K.box(M('#151719', PAT.PLAIN, 0.5), 4.0, 1.7, 0.14, 0, 4.4, bz);
  room.pic(board, 3.8, 1.5, 0, 4.5, bz + 0.08, 0);
  for (const sx of [-1.7, 1.7]) K.rod(iron, [sx, 6.1, bz], [sx, ySpring + rise - 0.3 - (sx * sx) * 0.02, bz], 0.014, 5);
  const trains = room.atlas.add(256, 40, (g, w, h) => {
    g.fillStyle = '#1d2d4a';
    g.fillRect(0, 0, w, h);
    drawText(g, 'TO THE TRAINS', w / 2, h / 2 + 1, 'bold 22px Arial, sans-serif', '#ffffff', 2);
  });
  room.pic(trains, 2.6, 0.4, 0, 3.98, bz + 0.08, 0);
  const clockZ = (ZF + ZB) / 2 + 1.1;
  const clockY = 7.4;
  K.rod(iron, [0, clockY + 0.72, clockZ], [0, ySpring + rise - 0.2, clockZ], 0.02, 6);
  K.disc(brass, 0.74, 0.26, 0, clockY, clockZ, 0, 36);
  K.sphere(brass, 0.08, 0, clockY + 0.8, clockZ, 10, 8);
  for (const f of [1, -1]) {
    const face = new THREE.CircleGeometry(0.66, 36);
    env.S.geo(M(C.cream, PAT.CLOCK, 0.5, 0, 1.15), face, 0, clockY, clockZ + f * 0.135, f > 0 ? 0 : Math.PI, 'native');
    face.dispose();
  }

  // ── benches back to back, a luggage trolley with trunks, a weighing machine, posters
  for (const sx of [-2.5, 2.5]) {
    const bzc = clockZ - 2.2;
    for (const side of [-1, 1]) {
      const bx2 = sx + side * 0.3;
      for (let k = 0; k < 4; k++) K.box(oak, 0.09, 0.03, 2.8, bx2 + side * (k * 0.1 - 0.15), yF + 0.44, bzc);
      for (let k = 0; k < 3; k++) K.box(oak, 0.025, 0.09, 2.8, sx + side * 0.04, yF + 0.56 + k * 0.13, bzc);
    }
    for (const e of [-1.25, 0, 1.25]) K.box(iron, 0.76, 0.46, 0.05, sx, yF, bzc + e);
    room.block(sx - 0.55, bzc - 1.45, sx + 0.55, bzc + 1.45);
  }
  {
    const tx = 4.6,
      tz = ZF - 1.75;
    K.box(oakD, 0.85, 0.06, 1.6, tx, yF + 0.32, tz);
    for (const e of [-0.42, 0.42]) {
      K.cylX(iron, 0.17, 0.05, tx + e, yF + 0.17, tz - 0.55, 12);
      K.cylX(iron, 0.17, 0.05, tx + e, yF + 0.17, tz + 0.55, 12);
    }
    K.rod(iron, [tx - 0.38, yF + 0.36, tz + 0.8], [tx - 0.38, yF + 1.25, tz + 1.1], 0.014, 5);
    K.rod(iron, [tx + 0.38, yF + 0.36, tz + 0.8], [tx + 0.38, yF + 1.25, tz + 1.1], 0.014, 5);
    K.rod(iron, [tx - 0.38, yF + 1.25, tz + 1.1], [tx + 0.38, yF + 1.25, tz + 1.1], 0.014, 5);
    const trunk = (x: number, y: number, z: number, w: number, h: number, dd: number, col: string, ry: number) => {
      K.box(M(col, PAT.PLAIN, 0.65), w, h, dd, x, y, z, ry);
      K.box(M('#2a1c10', PAT.PLAIN, 0.6), w + 0.01, 0.02, dd * 0.25, x, y + h * 0.5, z, ry);
      for (const e of [-0.3, 0.3]) K.box(brass, 0.035, h + 0.008, dd + 0.008, x + Math.cos(ry) * w * e, y, z - Math.sin(ry) * w * e, ry);
    };
    trunk(tx, yF + 0.38, tz - 0.3, 0.75, 0.42, 0.55, '#6b3f25', 0.04);
    trunk(tx - 0.02, yF + 0.38, tz + 0.35, 0.7, 0.34, 0.5, '#2f4a3e', -0.05);
    trunk(tx + 0.03, yF + 0.8, tz - 0.25, 0.55, 0.3, 0.42, '#8a5a30', 0.2);
    trunk(tx, yF + 1.1, tz - 0.28, 0.36, 0.22, 0.24, '#7a1e22', -0.3);
    room.block(tx - 0.5, tz - 0.9, tx + 0.5, tz + 1.15);
  }
  const posters: [string, string, string, string, string][] = [
    ['#6fa8c7', '#2c6a8e', '#d9c28a', 'SUNNY BEACH', 'by the Harbour Line'],
    ['#e8a65a', '#3f5f6e', '#7c8a4e', 'OLD TOWN', 'bells and cobbles'],
    ['#8fb5a0', '#50706a', '#55704a', 'THE HILLS', 'walk the high road'],
    ['#d97a4e', '#2c4a5e', '#a8a06a', 'THE PIER', 'lights at dusk'],
  ];
  posters.forEach(([sky, sea, land, title, sub], i) => {
    const rect = room.atlas.add(140, 210, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h * 0.6);
      gr.addColorStop(0, sky);
      gr.addColorStop(1, '#fbe3b0');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe9a8';
      g.beginPath();
      g.arc(w * 0.68, h * 0.26, 18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = sea;
      g.fillRect(0, h * 0.5, w, h * 0.2);
      g.fillStyle = land;
      g.beginPath();
      g.moveTo(0, h * 0.72);
      g.quadraticCurveTo(w * 0.5, h * (0.44 + i * 0.03), w, h * 0.68);
      g.lineTo(w, h * 0.8);
      g.lineTo(0, h * 0.8);
      g.fill();
      g.fillStyle = '#20302a';
      g.fillRect(0, h * 0.8, w, h * 0.2);
      drawText(g, title, w / 2, h * 0.87, 'bold 17px Georgia, serif', '#f2d27a', 1);
      drawText(g, sub, w / 2, h * 0.94, 'italic 11px Georgia, serif', '#efe6d0', 0);
    });
    const px = [-5.9, 5.9, -5.9, 5.9][i],
      pz = i < 2 ? ZF - 0.09 : ZB + 0.09;
    K.box(brass, 1.02, 1.5, 0.05, px, 2.2, pz);
    room.pic(rect, 0.92, 1.38, px, 2.26, pz + (i < 2 ? -0.03 : 0.03), i < 2 ? Math.PI : 0);
  });

  // ── globes on long rods, and the sky through the glass does the rest
  for (const px of [-3.7, 3.7])
    for (const pz of [ZB + 2.3, 0, ZF - 2.3]) {
      K.rod(iron, [px, 5.8, pz], [px, yc + Math.sqrt(R * R - px * px) - 0.1, pz], 0.012, 4);
      K.sphere(globe(0.3), 0.27, px, 5.55, pz, 12, 10);
      K.torus(brass, 0.11, 0.012, px, 5.82, pz, 4, 12);
      room.halo(px, 5.55, pz, 1.5, '#ffdca8', 0.2);
      room.lamps.push({ x: px, y: 5.55, z: pz, k: 0.85, r: 3.6 });
    }

  // ── the walker: straight through, or wander
  room.walk(-IX, ZB, IX, ZF, yF);
  for (const s of [-1, 1]) for (const z of [ZF, ZB]) room.block(Math.min(s * 1.3, s * 1.4), z > 0 ? z - 1.25 : z, Math.max(s * 1.3, s * 1.4), z > 0 ? z : z + 1.25);
  room.walk(-1.25, ZF - 0.05, 1.25, d.zF + 0.2, yF);
  room.walk(-1.25, d.zB - 0.2, 1.25, ZB + 0.05, yF);

  // ── people waiting: office hours, a share of them at any time
  const Yw = yF;
  const P = (lx: number, lz: number, yaw: number, o: { seated?: boolean; idle?: number; p?: number; carry?: number } = {}) =>
    addActor({ x: room.wx(lx, lz), y: Yw, z: room.wz(lx, lz), yaw: yaw + d.yaw, role: 'traveller', h0: 6, h1: 23, p: o.p ?? 0.8, seated: o.seated, seatY: 0.47, idle: o.idle, carry: o.carry });
  P(fx + 0.75, -2.05, -Math.PI / 2, { carry: 2 });
  P(fx + 1.45, -2.05, -Math.PI / 2, { p: 0.6 });
  P(fx + 0.75, 2.05, -Math.PI / 2, { p: 0.6, carry: 1 });
  P(-2.5 - 0.34, clockZ - 2.9, -Math.PI / 2, { seated: true });
  P(2.5 + 0.34, clockZ - 1.6, Math.PI / 2, { seated: true, p: 0.7 });
  P(2.5 - 0.34, clockZ - 2.8, -Math.PI / 2, { seated: true, p: 0.5 });
  P(cx - 0.9, 0.5, Math.PI / 2, { p: 0.7 });
  P(0.6, bz + 2, Math.PI, { p: 0.7, carry: 2 });
  P(-1, bz + 2.4, Math.PI + 0.3, { p: 0.5 });

  // light from above, dust in it
  const q = env.ctx.quality.level === 'high' ? 4 : 2;
  room.addShafts([-HX * 0.9, ySpring + rise * 0.75, ZB], [HX * 0.9, ySpring + rise * 0.75, ZB], [-HX * 0.9, ySpring + rise * 0.75, ZF], [0, 1, 0], tile, q, [0, 0, 1]);
  const mr = room.rectL(-IX + 1, ZB + 0.5, IX - 1, ZF - 0.5);
  room.moteBox = new THREE.Box3(new THREE.Vector3(mr.x0, 0.3, mr.z0), new THREE.Vector3(mr.x1, 10, mr.z1));
  room.moteCount = q === 4 ? 340 : 160;
  room.ambient = 0.28;
  room.skyK = 1.05;
  room.lampK = 0.55;
  room.sunK = 0.85;
  room.shaftK = 0.7;
  return room;
}
