// Up the lighthouse (`?nolhroom`: a shut door, nothing inside). Along the breakwater, in at the green door, round and round an
// iron spiral past the little windows, up into the lantern beside the lens and out onto the gallery with the whole harbour
// below. The walker's floors are functions of the plan position and of its own feet: the stair is a helix, so the same spot
// has a floor on every turn. The walk along the breakwater goes through here too: the plan has only sea under it.
// Near-only (landmarks/rooms.ts).

import { BW, LH } from '../harbor/breakwater';
import { addActor } from '../../sim/pedestrians/actorDefs';
import { M, PAT } from './builder';
import type { V3 } from './kit';
import { Hole, RP, Room, Rooms } from './rooms';

const TAU = Math.PI * 2;

export function buildLighthouseRoom(rooms: Rooms, lx: number, lz: number, height: number, rootX: number): Room {
  const room = rooms.add(new Room('lighthouse', 512, 256));
  room.frame(lx, lz, 0);
  room.near = 60;
  const K = room.K;

  const y0 = BW.crest;
  const yTop = y0 + height * LH.ratio;
  const yd = y0 + 0.45;
  const yL = yTop + 0.05;
  const rAt = (y: number) => LH.r0 + (LH.r1 - LH.r0) * ((y - y0) / (yTop - y0));
  const rin = (y: number) => Math.max(rAt(y) - 0.22, 1.1);

  // ── the stair: rises in the direction of growing angle, starts just past the door, ends where the lantern door is reached
  const n = 85;
  const rise = (yL - yd) / n;
  const turns = 5.81;
  const T = n / turns;
  const pitch = T * rise;
  const dTh = TAU / T;
  const th0 = LH.doorTh + 0.15 * TAU;
  const fracOf = (th: number) => {
    const f = (th - th0) / TAU;
    return f - Math.floor(f);
  };
  const fEnd = turns - Math.floor(turns);
  const fHole = fEnd - 0.25;

  // ── materials
  const lime = M('#e8e0ca', PAT.STONE, 0.95, 0, 0, 0, 0.3);
  const lintel = M('#d8d0bc', PAT.PLAIN, 0.9);
  const flags = M('#a59a86', RP.FLAGS, 0.8, 0, 0, 0, 0.3);
  const iron = M('#2c3030', PAT.PLAIN, 0.55, 0.6);
  const ironD = M('#34393a', PAT.PLAIN, 0.7, 0.2);
  const brass = M('#c79c48', RP.BRASS, 0.25, 1);
  const oak = M('#5d3d22', RP.OAK, 0.6);
  const checker = M('#ddd6c8', RP.CHEQUER, 0.3);
  const red = M('#b63a34', PAT.PLAIN, 0.7);
  const lamp = M('#ffd9a0', RP.EMIT, 0, 0, 5, 0, 0.7);

  // ── ground floor
  room.grid(flags, (a, r) => [Math.sin(a) * r, yd, Math.cos(a) * r], 0, TAU, 0, rin(yd) + 0.02, 0.35, 0.5, true);
  K.box(flags, 0.5, 0.03, 1.04, -rAt(yd + 1) + 0.1, yd - 0.025, 0);

  // ── the wall, with the door and the four windows (same places as the outside, harbor/breakwater.ts)
  const wallP = (th: number, y: number): V3 => {
    const r = rin(y);
    return [Math.sin(th) * r, y, Math.cos(th) * r];
  };
  const mod = (a: number) => a - Math.floor(a / TAU) * TAU;
  const holes: Hole[] = [];
  const rect = (hw: number, h: number): [number, number][] => [
    [-hw, 0],
    [hw, 0],
    [hw, h],
    [-hw, h],
  ];
  holes.push({ u: mod(LH.doorTh), pts: rect(LH.doorHalf / rin(yd), LH.doorH), v0: yd });
  for (let k = 0; k < 4; k++) {
    const y = y0 + 4.2 + k * 3.1;
    const r = rin(y);
    holes.push({ u: mod(LH.windowAngle(k)), pts: rect(0.25 / r, 0.75), v0: y - 0.375 });
    const a = LH.windowAngle(k);
    room.wins.push({ x: Math.sin(a) * r, y, z: Math.cos(a) * r, nx: -Math.sin(a), nz: -Math.cos(a), area: 0.375, trans: 1.1 });
  }
  room.wall(lime, wallP, 0, TAU, yd, yL, holes, 0.2, 0.35, true);
  for (const h of holes) {
    room.reveal(lintel, (u, v, dep) => {
      const r = rin(v) + dep;
      return [Math.sin(u) * r, v, Math.cos(u) * r];
    }, h, 0, 0.24, true);
  }
  room.wins.push({ x: Math.sin(LH.doorTh) * rin(yd), y: yd + 1, z: Math.cos(LH.doorTh) * rin(yd), nx: 1, nz: 0, area: 2.1, trans: 0.9 });
  // light falling down the well from the lantern
  room.wins.push({ x: 0, y: yL + 1, z: 0, nx: 0, nz: 0, ny: -1, area: 5, trans: 1.2 });

  // ── a green dado, the colour of the door, round the foot of the wall and all the way up with the stair
  const dado = M('#2f4a3f', PAT.PLAIN, 0.55);
  const clearOf = (th: number, y0b: number, y1b: number) =>
    holes.every((h) => {
      const hw2 = Math.abs(h.pts[1][0]) + 0.06;
      let dt = Math.abs(mod(th) - h.u);
      if (dt > Math.PI) dt = TAU - dt;
      return dt > hw2 || y1b < h.v0! - 0.05 || y0b > h.v0! + h.pts[2][1] + 0.05;
    });
  const dadoQuad = (a: number, b: number, ya: number, yb: number, h: number) => {
    if (!clearOf((a + b) / 2, Math.min(ya, yb), Math.max(ya, yb) + h)) return;
    const pp = (th: number, y: number): V3 => {
      const r = rin(y) - 0.006;
      return [Math.sin(th) * r, y, Math.cos(th) * r];
    };
    K.poly(dado, [pp(a, ya), pp(a, ya + h), pp(b, yb + h), pp(b, yb)]);
  };
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    dadoQuad(a, a + TAU / 40, yd, yd, 1);
  }
  for (let i = 0; i < n; i++) {
    const a = th0 + i * dTh;
    const y = yd + (i + 1) * rise;
    if (y + 1 < yL) dadoQuad(a, a + dTh, y, y + rise, 1);
  }

  // ── newel, treads, nosings, the handrail on its brackets
  K.cyl(ironD, 0.1, 0.1, yL - yd, 0, yd, 0, 10, true);
  for (let i = 0; i < n; i++) {
    const a = th0 + i * dTh,
      b = a + dTh * 1.02;
    const y = yd + (i + 1) * rise;
    const ro = rin(y) + 0.02;
    const ri = 0.08;
    const pt = (th: number, r: number, h: number): V3 => [Math.sin(th) * r, h, Math.cos(th) * r];
    K.poly(iron, [pt(a, ri, y), pt(a, ro, y), pt(b, ro, y), pt(b, ri, y)]);
    K.poly(ironD, [pt(a, ri, y - rise), pt(a, ro, y - rise), pt(a, ro, y), pt(a, ri, y)]);
    K.poly(ironD, [pt(b, ri, y - 0.05), pt(b, ro, y - 0.05), pt(a, ro, y - 0.05), pt(a, ri, y - 0.05)]);
    K.rod(brass, pt(a, ri + 0.04, y + 0.006), pt(a, ro - 0.03, y + 0.006), 0.01, 4);
    const rr = rin(y) - 0.07;
    const rr2 = rin(y + rise) - 0.07;
    const hA: V3 = pt(a, rr, y + 0.92),
      hB: V3 = pt(a + dTh, rr2, y + rise + 0.92);
    K.rod(brass, hA, hB, 0.02, 6);
    if (i % 4 === 0) K.rod(iron, hA, pt(a, rin(y) + 0.02, y + 0.92), 0.012, 4);
    // caged lamps, one every turn, half way between windows
    if (i % 15 === 7 && y + 2.05 < yL) {
      const lx2 = Math.sin(a) * (rin(y + 1.6) - 0.1),
        lz2 = Math.cos(a) * (rin(y + 1.6) - 0.1);
      K.sphere(lamp, 0.05, lx2, y + 2.05, lz2, 8, 6);
      for (let q = 0; q < 4; q++) {
        const c = (q / 4) * TAU;
        K.rod(ironD, [lx2 + Math.sin(c) * 0.07, y + 1.97, lz2 + Math.cos(c) * 0.07], [lx2 + Math.sin(c) * 0.07, y + 2.13, lz2 + Math.cos(c) * 0.07], 0.006, 3);
      }
      room.lamps.push({ x: lx2, y: y + 2.05, z: lz2, k: 0.42, r: 2.1 });
      room.halo(lx2, y + 2.05, lz2, 0.17, '#ffcf96', 0.3, true);
    }
  }

  // ── the keeper's corner by the door: a chart, a chest, a coil of rope
  const chart = room.atlas.add(256, 180, (g, w, h) => {
    g.fillStyle = '#e8dfc4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c3d3cf';
    g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#d9c692';
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(120, 10);
    g.lineTo(96, 58);
    g.lineTo(112, 104);
    g.lineTo(80, 170);
    g.lineTo(10, 170);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,70,80,0.5)';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(190, 54, 16 + i * 17, 0, TAU);
      g.stroke();
    }
    g.fillStyle = '#7a2a24';
    g.beginPath();
    g.arc(190, 54, 5, 0, TAU);
    g.fill();
    g.fillStyle = '#2d2a24';
    g.font = 'italic 16px Georgia, serif';
    g.fillText('Tinyhaven Roads', 124, 156);
  });
  const chTh = mod(th0 + 0.68 * TAU);
  const cr = rin(yd + 1.6) - 0.03;
  const cx = Math.sin(chTh) * cr,
    cz = Math.cos(chTh) * cr;
  K.box(oak, 0.86, 0.66, 0.02, cx, yd + 1.26, cz, chTh + Math.PI);
  room.pic(chart, 0.8, 0.6, Math.sin(chTh) * (cr - 0.015), yd + 1.29, Math.cos(chTh) * (cr - 0.015), chTh + Math.PI);
  const ct = rin(yd) - 0.3;
  K.box(oak, 0.9, 0.42, 0.42, Math.sin(chTh) * ct, yd, Math.cos(chTh) * ct, chTh + Math.PI);
  K.box(iron, 0.92, 0.03, 0.44, Math.sin(chTh) * ct, yd + 0.42, Math.cos(chTh) * ct, chTh + Math.PI);
  const rTh = mod(th0 + 0.8 * TAU);
  for (let q = 0; q < 5; q++) K.torus(M('#b49a6a', PAT.PLAIN, 0.95), 0.2, 0.024, Math.sin(rTh) * (rin(yd) - 0.3), yd + 0.03 + q * 0.045, Math.cos(rTh) * (rin(yd) - 0.3), 5, 14);
  room.lamps.push({ x: Math.sin(chTh) * 1.1, y: yd + 2.2, z: Math.cos(chTh) * 1.1, k: 0.3, r: 2 });

  // ── the lantern: floor round the stairhead, the lens on its brass stand, a low wall, the underside of the dome
  const sector = fHole - fEnd + 1;
  room.grid(checker, (u, r) => {
    const th = th0 + (fEnd + u) * TAU;
    return [Math.sin(th) * r, yL, Math.cos(th) * r];
  }, 0, sector, 0.06, 1.16, 0.04, 0.35, true);
  K.cyl(brass, 0.2, 0.3, yTop + 1.05 - yL, 0, yL, 0, 14);
  // a Fresnel lens round the lamp: belts of prisms in a brass frame, a bull's-eye on each of the four faces. By night every
  // third prism carries the light of the lamp
  const yc = yTop + 1.7;
  const lensHalf = 0.66;
  const pale = M('#d9efe9', PAT.PLAIN, 0.08),
    mid = M('#bfe0da', PAT.PLAIN, 0.08),
    deep = M('#9cc4be', PAT.PLAIN, 0.08),
    lit = M('#fff0cf', RP.EMIT, 0, 0, 1.7, 0, 0.3);
  const prism = [pale, deep, mid, pale, lit, deep];
  const lensR = (dy: number) => 0.6 + 0.09 * Math.sqrt(Math.max(0, 1 - (dy / lensHalf) ** 2));
  const dBand = (2 * lensHalf) / 36;
  for (let j = 0; j < 36; j++) {
    const y = yc - lensHalf + j * dBand;
    K.cyl(prism[j % prism.length], lensR(y + dBand - yc), lensR(y - yc), dBand, 0, y, 0, 32, true);
  }
  for (const y of [yc - lensHalf - 0.02, yc - 0.2, yc + 0.2, yc + lensHalf + 0.02]) K.torus(brass, 0.71, 0.014, 0, y, 0, 5, 28);
  for (let q = 0; q < 8; q++) {
    const c = (q / 8) * TAU + TAU / 16;
    K.rod(brass, [Math.sin(c) * 0.71, yc - lensHalf - 0.02, Math.cos(c) * 0.71], [Math.sin(c) * 0.71, yc + lensHalf + 0.02, Math.cos(c) * 0.71], 0.012, 4);
  }
  const rings: [number, number, ReturnType<typeof M>][] = [
    [0, 0.05, lit],
    [0.05, 0.09, pale],
    [0.09, 0.125, deep],
    [0.125, 0.16, pale],
    [0.16, 0.19, mid],
    [0.19, 0.22, deep],
  ];
  for (let q = 0; q < 4; q++) {
    const c = (q / 4) * TAU;
    const nx = Math.sin(c),
      nz = Math.cos(c);
    const on = (rr: number, a: number): V3 => {
      const u = Math.cos(a) * rr;
      return [nx * 0.71 + nz * u, yc + Math.sin(a) * rr, nz * 0.71 - nx * u];
    };
    for (const [r0, r1, mt] of rings) {
      for (let s = 0; s < 24; s++) {
        const a = (s / 24) * TAU,
          b = ((s + 1) / 24) * TAU;
        K.poly(mt, [on(r0, a), on(r1, a), on(r1, b), on(r0, b)]);
      }
    }
  }
  K.cyl(ironD, 1.2, 1.2, 0.03, 0, yTop + 2.76, 0, 16);
  // the low wall of the lantern, from inside; the door is the open face
  room.grid(red, (th, y) => [Math.sin(th) * 1.13, y, Math.cos(th) * 1.13], LH.exitTh + 0.39, LH.exitTh + TAU - 0.39, yL, yL + 0.7, 0.4, 0.35, true);
  // the handrail round the stairhead
  for (const f of [fHole, fEnd]) {
    const th = th0 + f * TAU;
    for (const r of [0.15, 0.62, 1.1]) K.rod(iron, [Math.sin(th) * r, yL, Math.cos(th) * r], [Math.sin(th) * r, yL + 0.95, Math.cos(th) * r], 0.016, 4);
    K.rod(brass, [Math.sin(th) * 0.15, yL + 0.95, Math.cos(th) * 0.15], [Math.sin(th) * 1.1, yL + 0.95, Math.cos(th) * 1.1], 0.02, 6);
  }

  room.lamps.push({ x: 0, y: yc, z: 0, k: 1.3, r: 3 });

  room.ambient = 0.17;
  room.skyK = 1.3;
  room.lampK = 1.0;

  // ── where the walker can go. Everything inside the rectangle that no floor answers for is solid
  const half = 4.6;
  const hw = BW.half;
  const bx0 = rootX - lx;
  const sx0 = bx0 + LH.stairX0,
    sx1 = bx0 + LH.stairX1;
  const zS = hw + LH.stairRisers * LH.stairTread,
    zL = zS + LH.landing;
  room.bounds = room.rectL(bx0, -half, half, zL);
  room.core = room.bounds;
  // from the quay: its corner, the landing, the steel stair
  room.walk(bx0, zS, sx1, zL, 0);
  room.walk(sx0, hw - 0.12, sx1, zS + 0.02, (_x, z) => {
    const k = Math.floor((zS - (z - lz)) / LH.stairTread);
    return (Math.min(LH.stairRisers - 1, Math.max(0, k)) + 1) * (y0 / LH.stairRisers);
  });
  // the deck, wall to rail
  room.walk(bx0, -hw + 0.03, -half + 1.2, hw - 0.1, y0);
  const feet = (): number => (Number.isNaN(rooms.feet) ? yd : rooms.feet);
  const xd = -rAt(y0 + 1.2) + 0.1;
  const R = 0.05;
  const all: [number, number, number, number] = [-half, -half, half, half];
  // nobody walks through the lens: the walker's body keeps it out at r > lensClear + 0.42
  const lensClear = 0.33;
  const d = (x: number, z: number): [number, number, number] => {
    const dx = x - lx,
      dz = z - lz;
    return [dx, dz, Math.hypot(dx, dz)];
  };
  // the round head and the door steps
  room.walk(...all, (x, z) => {
    const [dx, dz, r] = d(x, z);
    if (r > 3.85) return NaN;
    if (Math.abs(dz) < 0.72 && dx < 0 && r < 3.2) {
      if (dx > xd - 0.3) return yd;
      if (dx > xd - 0.6) return y0 + 0.3;
      if (dx > xd - 1.05) return y0 + 0.15;
      return y0;
    }
    return r < 2.25 ? NaN : y0;
  });
  // the helix: the turn nearest the feet (clamped, so that a body's far side counts as standing on the same turn)
  room.walk(...all, (x, z) => {
    const [dx, dz, r] = d(x, z);
    const fe = feet();
    if (r < R) return NaN;
    if (fe > yL - 0.3 ? r > 1.3 : r > rin(fe) + 0.25) return NaN;
    const f = fracOf(Math.atan2(dx, dz));
    const t = Math.round((fe - yd) / pitch - f) + f;
    const y = t < 0 ? yd : t >= turns ? yL : yd + (Math.floor(t * T) + 1) * rise;
    if (y > yL - 0.01 && r < lensClear) return NaN;
    return Math.min(fe + 0.6, Math.max(fe - 0.6, y));
  });
  // the lantern floor, all but the stairhead; its door; the gallery
  room.walk(...all, (x, z) => {
    const [dx, dz, r] = d(x, z);
    if (r > 2.47) return NaN;
    const th = Math.atan2(dx, dz);
    let dt = Math.abs(mod(th) - LH.exitTh);
    if (dt > Math.PI) dt = TAU - dt;
    const door = dt < 0.55;
    if (r >= 1.32 || (door && r >= 0.9)) return yL;
    if (r > 1.3) return NaN;
    const f = fracOf(th);
    const inHole = fHole < fEnd ? f > fHole && f < fEnd : f > fHole || f < fEnd;
    return inHole || r < lensClear ? NaN : yL;
  });

  // the keeper, out on the gallery looking the weather over
  const kTh = LH.exitTh + 0.9;
  addActor({ x: lx + Math.sin(kTh) * 1.9, y: yL, z: lz + Math.cos(kTh) * 1.9, yaw: kTh, role: 'fisher', idle: 5, shirt: 0x24374f, h0: 7, h1: 21, p: 0.7 });
  return room;
}
