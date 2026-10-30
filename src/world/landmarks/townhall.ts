// 'Town Hall' — neo-renaissance civic palace on the Town Square: rusticated ground floor,
// piano nobile with pediments, a projecting centre bay with an arcaded loggia, balcony and
// crest, corner pavilions, a tiled hip roof and a clock tower (four live clock faces, an
// open belfry with a bell that swings on the hour, copper dome, lantern and flag).
// Night: lit windows, glowing clock faces, uplit stone, tower spotlights.

import * as THREE from 'three';
import type { Lot } from '../../core/plan';
import { DIR_YAW } from '../../core/geom';
import { ANIM, FLOOD, LM, LMODE, M, PAT } from './builder';
import { wall, bays, moulding, Opening } from './facade';
import { C, S, quoins, chimney, finial, dormer, wallLantern, flagpole, railing } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';
import { boxHunt } from '../../core/boxhunt';
import { lmDetail } from '../../core/lmdetail';
import { buildTownhallRoom } from './townhallRoom';

export function genTownHall(env: Env, lot: Lot): void {
  const fp = lot.footprint;
  const cx = (fp.x0 + fp.x1) / 2,
    cz = (fp.z0 + fp.z1) / 2;
  const yaw = DIR_YAW[lot.front];
  env.begin(cx, 0, cz, yaw);
  env.checkLot(fp, 'townhall');
  const K = env.S;
  const ns = lot.front === 'N' || lot.front === 'S';
  const HW = (ns ? fp.x1 - fp.x0 : fp.z1 - fp.z0) / 2; // 17
  const HD = (ns ? fp.z1 - fp.z0 : fp.x1 - fp.x0) / 2; // 6.5

  const stone = M(C.stoneWarm, PAT.STONE, 0.85, 0, 0, FLOOD.WARM, 0.25);
  const rust = M('#cdb48b', PAT.STONE, 0.88, 0, 0, FLOOD.WARM, 0.85);
  const trim = M('#efe4cc', PAT.PLAIN, 0.8, 0, 0, FLOOD.WARM);
  const plaster = M('#e9cf9a', PAT.PLAIN, 0.9, 0, 0, FLOOD.WARM, 0.4);
  const granite = M(C.granite, PAT.STONE, 0.8, 0, 0, FLOOD.WARM, 0.1);
  const tiles = M('#b0583c', PAT.TILES, 0.75, 0, 0, 0, 0.4);
  const copper = S.copper();
  const gold = S.gold();
  const iron = S.iron();
  const winGlow = 0.55;

  const zF = HD - 0.45; // main wall plane
  const zR = HD - 0.08; // centre risalit
  const zC = HD - 0.25; // corner pavilions
  const RX = 5.6; // centre bay half width
  const CX0 = HW - 4.2; // corner pavilion start
  const y1 = 4.7,
    y2 = 9.7,
    y3 = 13.0;

  const winSet = (w: number, x: number, storey: 0 | 1 | 2, ped: 0 | 1 | 2, seed: number): Opening[] => {
    if (storey === 0) return [{ x, y: 1.05, w: 1.45, h: 2.7, arch: 0.72, fill: 'window', glow: winGlow, seed, surround: trim, surroundW: 0.14, keystone: trim, sill: trim }];
    if (storey === 1) return [{ x, y: 0.75, w: 1.45, h: 3.0, fill: 'window', glow: winGlow, seed, surround: trim, surroundW: 0.16, sill: trim }];
    void w;
    void ped;
    return [{ x, y: 0.7, w: 1.25, h: 2.0, fill: 'window', glow: winGlow * 0.8, seed, surround: trim, surroundW: 0.12, sill: trim }];
  };
  const pediments = (xs: number[], z: number, yTop: number, kind: 'tri' | 'alt') => {
    xs.forEach((x, i) => {
      const tall = kind === 'tri' || i % 2 === 0;
      const ph = tall ? 0.5 : 0.3;
      K.box(trim, 1.95, 0.14, 0.24, x, yTop, z + 0.12);
      // little gabled cap: front triangle + two sloping tops
      K.poly(trim, [
        [x - 1.0, yTop + 0.14, z + 0.24],
        [x + 1.0, yTop + 0.14, z + 0.24],
        [x, yTop + 0.14 + ph, z + 0.24],
      ]);
      K.roofFace(trim, [
        [x - 1.02, yTop + 0.13, z + 0.25],
        [x, yTop + 0.15 + ph, z + 0.25],
        [x, yTop + 0.15 + ph, z],
        [x - 1.02, yTop + 0.13, z],
      ]);
      K.roofFace(trim, [
        [x, yTop + 0.15 + ph, z + 0.25],
        [x + 1.02, yTop + 0.13, z + 0.25],
        [x + 1.02, yTop + 0.13, z],
        [x, yTop + 0.15 + ph, z],
      ]);
    });
  };

  // ── main front wall segments (between centre bay and corner pavilions)
  for (const s of [-1, 1]) {
    const x0 = RX,
      x1 = CX0;
    const w = x1 - x0;
    const xc = s * (x0 + w / 2);
    const n = 3;
    const gx = (i: number) => (w / n) * (i + 0.5);
    const xsLocal = [0, 1, 2].map(gx);
    wall(K, { w, h: y1, depth: 0.5, x: xc, y: 0, z: zF, ry: 0, mat: rust, openings: xsLocal.flatMap((x, i) => winSet(w, x, 0, 0, 0.3 + i * 0.13)) });
    wall(K, { w, h: y2 - y1, depth: 0.5, x: xc, y: y1, z: zF, ry: 0, mat: plaster, openings: xsLocal.flatMap((x, i) => winSet(w, x, 1, 0, 0.21 + i * 0.17)) });
    wall(K, { w, h: y3 - y2, depth: 0.5, x: xc, y: y2, z: zF, ry: 0, mat: plaster, openings: xsLocal.flatMap((x, i) => winSet(w, x, 2, 0, 0.4 + i * 0.11)) });
    pediments(
      xsLocal.map((x) => s * x0 + (s > 0 ? x : -(w - x)) * 1),
      zF,
      y1 + 0.75 + 3.0 + 0.2,
      'alt',
    );
  }
  // ── corner pavilions (front + sides)
  for (const s of [-1, 1]) {
    const w = HW - 0.15 - CX0;
    const xc = s * (CX0 + w / 2);
    wall(K, { w, h: y1, depth: 0.5, x: xc, y: 0, z: zC, ry: 0, mat: rust, openings: [{ x: w / 2, y: 0.9, w: 1.6, h: 2.9, arch: 0.8, fill: 'window', glow: winGlow, seed: 0.55, surround: trim, surroundW: 0.16, keystone: trim, sill: trim }] });
    wall(K, { w, h: y2 - y1, depth: 0.5, x: xc, y: y1, z: zC, ry: 0, mat: stone, openings: [{ x: w / 2, y: 0.7, w: 1.6, h: 3.1, arch: 0.8, fill: 'window', glow: winGlow, seed: 0.33, surround: trim, surroundW: 0.18, keystone: trim, sill: trim }] });
    wall(K, { w, h: y3 - y2, depth: 0.5, x: xc, y: y2, z: zC, ry: 0, mat: stone, openings: [{ x: w / 2, y: 0.65, w: 1.3, h: 2.0, fill: 'window', glow: winGlow, seed: 0.47, surround: trim, surroundW: 0.14, sill: trim }] });
    // balconette under the piano nobile window
    K.box(trim, 2.2, 0.16, 0.55, xc, y1 + 0.55, zC + 0.27);
    railing(env, [xc - 1.05, y1 + 0.71, zC + 0.52], [xc + 1.05, y1 + 0.71, zC + 0.52], 0.85, C.stoneLight, true);
    quoins(K, trim, s * (HW - 0.15), zC, s, 1, 0.6, y3 - 0.1, 0.55);
    quoins(K, trim, s * CX0, zC, -s, 1, 0.6, y3 - 0.1, 0.55);
  }
  // ── side walls (end facades)
  const sideD = 2 * zC;
  for (const s of [-1, 1]) {
    const xs = (n: number) => bays(sideD, n, (bx) => [{ x: bx, y: 0, w: 0, h: 0 } as Opening]).map((o) => o.x);
    const pos = xs(3);
    wall(K, { w: sideD, h: y1, depth: 0.5, x: s * (HW - 0.15), y: 0, z: 0, ry: (s * Math.PI) / 2, mat: rust, openings: pos.flatMap((x, i) => winSet(sideD, x, 0, 0, 0.5 + i * 0.1)) });
    wall(K, { w: sideD, h: y2 - y1, depth: 0.5, x: s * (HW - 0.15), y: y1, z: 0, ry: (s * Math.PI) / 2, mat: stone, openings: pos.flatMap((x, i) => winSet(sideD, x, 1, 0, 0.25 + i * 0.2)) });
    wall(K, { w: sideD, h: y3 - y2, depth: 0.5, x: s * (HW - 0.15), y: y2, z: 0, ry: (s * Math.PI) / 2, mat: stone, openings: pos.flatMap((x, i) => winSet(sideD, x, 2, 0, 0.6 + i * 0.12)) });
    for (const yy of [y1, y2]) moulding(K, trim, s * (HW - 0.15), 0, (s * Math.PI) / 2, sideD, yy - 0.06, 0.24, 0.16);
  }
  // ── back facade (north, towards the street) with the rear door
  {
    const bw = 2 * (HW - 0.15);
    const n = 9;
    const mk = (storey: 0 | 1 | 2) =>
      bays(bw, n, (bx, i) => {
        if (storey === 0 && i === 4) return { x: bx, y: 0, w: 2.0, h: 3.4, arch: 1.0, fill: 'door', glow: 0.8, seed: 0.2, inset: 0.3, surround: trim, surroundW: 0.2, keystone: trim, infill: M('#5b3b25', PAT.DOOR, 0.55, 0, 0.8, 0, 0.2) };
        return winSet(bw, bx, storey, 0, 0.15 + ((i * 37) % 10) / 12);
      });
    wall(K, { w: bw, h: y1, depth: 0.5, x: 0, y: 0, z: -zC, ry: Math.PI, mat: rust, openings: mk(0) });
    wall(K, { w: bw, h: y2 - y1, depth: 0.5, x: 0, y: y1, z: -zC, ry: Math.PI, mat: plaster, openings: mk(1) });
    wall(K, { w: bw, h: y3 - y2, depth: 0.5, x: 0, y: y2, z: -zC, ry: Math.PI, mat: plaster, openings: mk(2) });
    for (const yy of [y1, y2]) moulding(K, trim, 0, -zC, Math.PI, bw, yy - 0.06, 0.24, 0.16);
    moulding(K, trim, 0, -zC, Math.PI, bw, y3 - 0.1, 0.5, 0.45);
    wallLantern(env, K, -1.6, 2.9, -zC - 0.02, Math.PI, 0.8);
    wallLantern(env, K, 1.6, 2.9, -zC - 0.02, Math.PI, 0.8);
  }
  // core volume (kept clear of the loggia behind the centre arcade); the walkable hall replaces it
  const hero = !!env.rooms && lmDetail(env.ctx, 'herotownhall');
  const coreF = 3.2;
  const coreB = -zC + 0.5;
  if (!hero) {
    K.coreBox(plaster, 2 * HW - 1.4, y3, coreF - coreB, 0, 0, (coreF + coreB) / 2);
    for (const s of [-1, 1]) K.coreBox(plaster, HW - 0.7 - RX, y3, zF - 0.5 - coreF, s * (RX + (HW - 0.7 - RX) / 2), 0, (zF - 0.5 + coreF) / 2);
    K.coreBox(plaster, 2 * RX, y3 - 4.5, zR - 0.6 - coreF, 0, 4.5, (zR - 0.6 + coreF) / 2);
    if (boxHunt(env.ctx, 'interiors')) townhallInterior(env, { HW, RX, coreB, coreF, zF, y1, y2 });
  } else buildTownhallRoom(env, env.rooms!, { HW, RX, zF, zR, y1, y2, cx, cz, yaw, fp });

  // ── centre bay: loggia, balcony, tall windows, crest, lettering
  {
    const w = RX * 2;
    const arches = [-3.3, 0, 3.3];
    const loggiaD = 2.3;
    wall(K, {
      w,
      h: y1,
      depth: 0.6,
      x: 0,
      y: 0,
      z: zR,
      ry: 0,
      mat: rust,
      openings: arches.map((ax) => ({ x: RX + ax, y: 0, w: 2.5, h: 3.75, arch: 1.25, fill: 'none' as const, surround: trim, surroundW: 0.2, keystone: trim })),
    });
    // loggia: floor + steps + back wall with doors + ceiling
    const lz0 = zR - 0.6 - loggiaD;
    K.box(granite, w - 0.6, 0.45, loggiaD - 0.9, 0, 0, lz0 + (loggiaD - 0.9) / 2);
    K.steps(granite, w - 0.6, 3, 0.15, 0.3, 0, 0, zR - 0.6);
    if (hero) for (const s of [-1, 1]) K.box(plaster, 0.06, 4.4, loggiaD, s * (RX - 0.09), 0, lz0 + loggiaD / 2);
    K.box(M('#efe2c6', PAT.PLAIN, 0.85), w - 0.6, 0.2, loggiaD, 0, 4.3, lz0 + loggiaD / 2);
    wall(K, {
      w: w - 0.6,
      h: 4.3,
      depth: 0.3,
      x: 0,
      y: 0,
      z: lz0,
      ry: 0,
      mat: M('#ead9b6', PAT.STONE, 0.85, 0, 0, FLOOD.SOFT, 0.2),
      openings: [
        hero
          ? { x: (w - 0.6) / 2, y: 0.45, w: 1.9, h: 3.1, arch: 0.95, fill: 'none' as const, surround: trim, surroundW: 0.15 }
          : { x: (w - 0.6) / 2, y: 0.45, w: 1.9, h: 3.1, arch: 0.95, fill: 'door', glow: 0.9, seed: 0.2, inset: 0.15, surround: trim, surroundW: 0.15, infill: M('#5b3b25', PAT.DOOR, 0.55, 0, 0.9, 0, 0.2) },
        { x: (w - 0.6) / 2 - 3.3, y: 1.0, w: 1.2, h: 2.3, arch: 0.6, fill: 'window', glow: 0.8, seed: 0.3, inset: 0.12 },
        { x: (w - 0.6) / 2 + 3.3, y: 1.0, w: 1.2, h: 2.3, arch: 0.6, fill: 'window', glow: 0.8, seed: 0.35, inset: 0.12 },
      ],
    });
    // lanterns in the loggia
    for (const ax of [-3.3, 0, 3.3]) {
      env.L.sphere(LM('#ffe0a8', LMODE.NIGHT, 3.0, 0, 0.1), 0.17, ax, 3.75, lz0 + loggiaD / 2, 8, 6);
      K.cyl(iron, 0.012, 0.012, 0.45, ax, 3.85, lz0 + loggiaD / 2, 4);
      env.glow(ax, 3.7, lz0 + loggiaD / 2 + 0.6, { size: 1.0, kind: 'halo', color: '#ffd28e', intensity: 0.6 });
    }
    // piano nobile: three tall French windows onto the balcony
    wall(K, {
      w,
      h: y2 - y1,
      depth: 0.6,
      x: 0,
      y: y1,
      z: zR,
      ry: 0,
      mat: stone,
      openings: arches.map((ax, i) =>
        hero && i === 1
          ? { x: RX + ax, y: 0.22, w: 1.6, h: 3.83, arch: 0.8, fill: 'none' as const, surround: trim, surroundW: 0.2, keystone: trim }
          : { x: RX + ax, y: 0.45, w: 1.6, h: 3.6, arch: 0.8, fill: 'window' as const, glow: 0.7, seed: 0.2 + i * 0.15, surround: trim, surroundW: 0.2, keystone: trim },
      ),
    });
    // balcony with stone balustrade (above 2.4 m, projecting into the allowance)
    K.box(trim, w - 0.4, 0.28, 1.15, 0, y1 + 0.1, zR + 0.5);
    for (const bx of [-4.2, -1.4, 1.4, 4.2]) K.boxC(trim, 0.35, 0.5, 0.35, bx, y1 - 0.15, zR + 0.82, 0, 0, 0);
    railing(env, [-RX + 0.3, y1 + 0.38, zR + 1.02], [RX - 0.3, y1 + 0.38, zR + 1.02], 0.9, C.stoneLight, true);
    railing(env, [-RX + 0.3, y1 + 0.38, zR + 0.0], [-RX + 0.3, y1 + 0.38, zR + 1.02], 0.9, C.stoneLight, true);
    railing(env, [RX - 0.3, y1 + 0.38, zR + 1.02], [RX - 0.3, y1 + 0.38, zR + 0.0], 0.9, C.stoneLight, true);
    // 2nd floor + frieze
    wall(K, {
      w,
      h: y3 - y2,
      depth: 0.6,
      x: 0,
      y: y2,
      z: zR,
      ry: 0,
      mat: stone,
      openings: arches.map((ax, i) => ({ x: RX + ax, y: 0.55, w: 1.3, h: 1.8, arch: 0.65, fill: 'window' as const, glow: 0.6, seed: 0.45 + i * 0.1, surround: trim, surroundW: 0.14 })),
    });
    // pilasters
    for (const px of [-RX + 0.3, -1.65, 1.65, RX - 0.3]) {
      K.box(trim, 0.55, y2 - y1 - 0.2, 0.14, px, y1 + 0.1, zR + 0.07);
      K.box(trim, 0.7, 0.25, 0.2, px, y2 - 0.35, zR + 0.1);
    }
    // name lettering
    const nameR = env.atlas.add(512, 64, (g, w2, h2) => {
      g.fillStyle = '#3a2f26';
      g.fillRect(0, 0, w2, h2);
      g.strokeStyle = '#c9a24a';
      g.lineWidth = 3;
      g.strokeRect(3, 3, w2 - 6, h2 - 6);
      drawText(g, 'TOWN HALL', w2 / 2, h2 / 2 + 2, 'bold 40px Georgia, "Times New Roman", serif', '#f0cf73', 10);
    });
    signQuad(env.T, nameR, 5.2, 0.62, 0, y3 - 0.76, zR + 0.03, 0, 1);
    // pediment with the coat of arms
    const py0 = y3 + 0.45;
    const ph = 2.6;
    K.box(trim, w + 0.6, 0.45, 0.9, 0, y3, zR - 0.3);
    K.poly(stone, [
      [-RX - 0.2, py0, zR - 0.1],
      [RX + 0.2, py0, zR - 0.1],
      [0, py0 + ph, zR - 0.1],
    ]);
    K.roofFace(trim, [
      [-RX - 0.45, py0 - 0.02, zR + 0.12],
      [0, py0 + ph + 0.25, zR + 0.12],
      [0, py0 + ph + 0.25, zR - 0.9],
      [-RX - 0.45, py0 - 0.02, zR - 0.9],
    ]);
    K.roofFace(trim, [
      [0, py0 + ph + 0.25, zR + 0.12],
      [RX + 0.45, py0 - 0.02, zR + 0.12],
      [RX + 0.45, py0 - 0.02, zR - 0.9],
      [0, py0 + ph + 0.25, zR - 0.9],
    ]);
    K.poly(stone, [
      [RX + 0.45, py0 - 0.02, zR - 0.9],
      [-RX - 0.45, py0 - 0.02, zR - 0.9],
      [0, py0 + ph + 0.25, zR - 0.9],
    ]);
    const arms = env.atlas.add(96, 112, (g, w2, h2) => {
      g.fillStyle = '#e9d9b6';
      g.fillRect(0, 0, w2, h2);
      g.beginPath();
      g.moveTo(10, 8);
      g.lineTo(w2 - 10, 8);
      g.lineTo(w2 - 10, h2 * 0.55);
      g.quadraticCurveTo(w2 - 12, h2 - 14, w2 / 2, h2 - 4);
      g.quadraticCurveTo(12, h2 - 14, 10, h2 * 0.55);
      g.closePath();
      g.fillStyle = '#2a5ea8';
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#d6a93c';
      g.stroke();
      // a little house + wave = Tinyhaven
      g.fillStyle = '#f4e7c3';
      g.fillRect(w2 / 2 - 16, 38, 32, 22);
      g.beginPath();
      g.moveTo(w2 / 2 - 21, 40);
      g.lineTo(w2 / 2, 22);
      g.lineTo(w2 / 2 + 21, 40);
      g.closePath();
      g.fillStyle = '#c8452f';
      g.fill();
      g.strokeStyle = '#f4e7c3';
      g.lineWidth = 4;
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const x = 18 + (i / 20) * (w2 - 36);
        const y = 76 + Math.sin(i * 0.9) * 4;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    });
    signQuad(env.T, arms, 1.1, 1.28, 0, py0 + 0.42, zR - 0.08, 0, 0.35);
    finial(K, gold, 0, py0 + ph + 0.25, zR - 0.4, 0.8, 0.13);
    for (const s of [-1, 1]) {
      K.box(trim, 0.5, 0.6, 0.5, s * (RX + 0.1), py0, zR - 0.3);
      K.sphere(trim, 0.25, s * (RX + 0.1), py0 + 0.85, zR - 0.3, 10, 8);
    }
  }
  // string courses + main cornice + plinth along the whole front
  for (const [x0, x1, z] of [
    [RX, CX0, zF],
    [-CX0, -RX, zF],
    [-RX, RX, zR],
    [CX0, HW - 0.15, zC],
    [-(HW - 0.15), -CX0, zC],
  ] as [number, number, number][]) {
    const xc = (x0 + x1) / 2,
      w = x1 - x0;
    if (z === zR) {
      // the plinth stops at the three loggia arches (the way in)
      let a = x0;
      for (const ax of [-3.3, 0, 3.3, Infinity]) {
        const b = Math.min(x1, ax - 1.25);
        if (b > a) moulding(K, granite, (a + b) / 2, z, 0, b - a, 0, 0.6, 0.06);
        a = ax + 1.25;
      }
    } else moulding(K, granite, xc, z, 0, w, 0, 0.6, 0.06);
    moulding(K, trim, xc, z, 0, w, y1 - 0.06, 0.26, 0.17);
    moulding(K, trim, xc, z, 0, w, y2 - 0.08, 0.24, 0.15);
    moulding(K, trim, xc, z, 0, w + 0.2, y3 - 0.1, 0.5, 0.5);
  }
  // attic balustrade on the corner pavilions
  for (const s of [-1, 1]) {
    const a = s * CX0,
      b = s * (HW - 0.15);
    railing(env, [Math.min(a, b), y3 + 0.4, zC + 0.3], [Math.max(a, b), y3 + 0.4, zC + 0.3], 0.85, C.stoneLight, true);
    for (const px of [a, b]) {
      K.box(trim, 0.5, 1.0, 0.5, px - s * 0.25, y3 + 0.4, zC + 0.05);
      K.sphere(trim, 0.2, px - s * 0.25, y3 + 1.6, zC + 0.05, 8, 6);
    }
  }

  // ── tiled hip roof, dormers, chimneys
  const eave = y3 + 0.4;
  K.hipRoof(tiles, -HW + 0.15, HW - 0.15, -zC, zC - 0.15, eave, eave + 3.7, 0.45);
  for (const dx of [-11.2, -8.0, 8.0, 11.2]) dormer(K, trim, M('#9b4a33', PAT.TILES, 0.75), dx, eave + 0.55, zC - 0.45, 1.0, 1.15, 1.0, 0, 0.45, 0.4);
  for (const dx of [-11.2, -8.0, 8.0, 11.2]) dormer(K, trim, M('#9b4a33', PAT.TILES, 0.75), dx, eave + 0.55, -zC + 0.45, 1.0, 1.15, 1.0, Math.PI, 0.45, 0.55);
  for (const dx of [-13.5, 13.5]) chimney(K, M(C.brick, PAT.BRICK, 0.9), dx, eave + 1.8, -1.0, 0.8, 0.6, 2.2);
  for (const s of [-1, 1]) flagpole(env, s * 12.5, eave + 2.45, 0, 3.4, 2.0, s > 0 ? 3 : 0, s * 2.1);

  // ── clock tower
  const tx = 0,
    tz = 1.4;
  const tw = 5.0;
  const tb = eave + 1.0;
  const tShaft = 25.2;
  K.box(stone, tw, tShaft - tb + 2.0, tw, tx, tb - 2.0, tz);
  quoins(K, trim, tx + tw / 2, tz + tw / 2, 1, 1, tb, tShaft - 0.2, 0.55);
  quoins(K, trim, tx - tw / 2, tz + tw / 2, -1, 1, tb, tShaft - 0.2, 0.55);
  for (let side = 0; side < 4; side++) {
    const ry = (side * Math.PI) / 2;
    const c = Math.cos(ry),
      s = Math.sin(ry);
    const fx = tx + s * (tw / 2),
      fz = tz + c * (tw / 2);
    // narrow window lower on the shaft
    K.panel(M('#e9e4d8', PAT.WINDOW, 0.3, 0, 0.5, 0, 0.35), 0.9, 1.9, fx + s * 0.03, tb + 1.6, fz + c * 0.03, ry);
    // clock face with a stone surround
    const cy = 23.0;
    K.disc(trim, 1.55, 0.18, fx + s * 0.1, cy, fz + c * 0.1, ry, 28);
    const face = new THREE.CircleGeometry(1.32, 36);
    K.geo(M(C.cream, PAT.CLOCK, 0.5, 0, 1.0), face, fx + s * 0.22, cy, fz + c * 0.22, ry, 'native');
    face.dispose();
    K.torus(gold, 1.36, 0.06, fx + s * 0.22, cy, fz + c * 0.22, 6, 36, Math.PI * 2, 0, ry);
  }
  K.box(trim, tw + 0.6, 0.4, tw + 0.6, tx, tShaft - 0.35, tz);
  // belfry: open arches on four sides
  const bf0 = tShaft + 0.05,
    bfH = 3.8;
  for (let side = 0; side < 4; side++) {
    const ry = (side * Math.PI) / 2;
    const c = Math.cos(ry),
      s = Math.sin(ry);
    wall(K, {
      w: tw - 0.4,
      h: bfH,
      depth: 0.45,
      x: tx + s * (tw / 2 - 0.2),
      y: bf0,
      z: tz + c * (tw / 2 - 0.2),
      ry,
      mat: stone,
      openings: [{ x: (tw - 0.4) / 2, y: 0.5, w: 2.1, h: 2.9, arch: 1.05, fill: 'none', surround: trim, surroundW: 0.16, keystone: trim }],
    });
  }
  // corner piers of the belfry (closing the wall joints)
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    K.box(trim, 0.6, bfH, 0.6, tx + sx * (tw / 2 - 0.3), bf0, tz + sz * (tw / 2 - 0.3));
  K.box(M('#4a3f35', PAT.PLAIN, 0.9), tw - 1.2, 0.2, tw - 1.2, tx, bf0, tz);
  railing(env, [tx - tw / 2 - 0.3, bf0, tz + tw / 2 + 0.3], [tx + tw / 2 + 0.3, bf0, tz + tw / 2 + 0.3], 0.75, C.stoneLight, true);
  railing(env, [tx + tw / 2 + 0.3, bf0, tz - tw / 2 - 0.3], [tx - tw / 2 - 0.3, bf0, tz - tw / 2 - 0.3], 0.75, C.stoneLight, true);
  railing(env, [tx + tw / 2 + 0.3, bf0, tz + tw / 2 + 0.3], [tx + tw / 2 + 0.3, bf0, tz - tw / 2 - 0.3], 0.75, C.stoneLight, true);
  railing(env, [tx - tw / 2 - 0.3, bf0, tz - tw / 2 - 0.3], [tx - tw / 2 - 0.3, bf0, tz + tw / 2 + 0.3], 0.75, C.stoneLight, true);
  // the bell (swings on the hour: uSpin.w), headstock + yoke
  const bellY = bf0 + bfH - 0.55;
  K.box(M(C.woodDark, PAT.PLAIN, 0.8), tw - 0.8, 0.22, 0.22, tx, bellY + 0.25, tz);
  env.anim({ mode: ANIM.SPIN_U, pivot: new THREE.Vector3(tx, bellY + 0.3, tz), axis: new THREE.Vector3(1, 0, 0), a: 1, b: 3, c: 0 });
  env.K.lathe(
    M('#b8863b', PAT.PLAIN, 0.35, 0.85),
    [
      [0.0, -1.45],
      [0.82, -1.45],
      [0.78, -1.3],
      [0.62, -1.05],
      [0.5, -0.6],
      [0.45, -0.2],
      [0.3, 0.0],
      [0.0, 0.05],
    ],
    tx,
    bellY + 0.25,
    tz,
    18,
  );
  env.K.box(M(C.woodDark, PAT.PLAIN, 0.8), 0.9, 0.3, 0.4, tx, bellY + 0.15, tz);
  env.anim(null);
  // cornice, drum, copper dome, lantern, spire, flag
  const dc = bf0 + bfH;
  K.box(trim, tw + 0.5, 0.45, tw + 0.5, tx, dc, tz);
  K.cyl(stone, 2.0, 2.15, 1.3, tx, dc + 0.45, tz, 8);
  K.cyl(trim, 2.3, 2.3, 0.22, tx, dc + 1.75, tz, 8);
  K.lathe(
    copper,
    [
      [2.25, 0],
      [2.15, 0.6],
      [1.85, 1.35],
      [1.35, 2.05],
      [0.75, 2.55],
      [0.45, 2.7],
    ],
    tx,
    dc + 1.95,
    tz,
    16,
  );
  const lan = dc + 4.6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.box(trim, 0.14, 1.15, 0.14, tx + Math.sin(a) * 0.48, lan, tz + Math.cos(a) * 0.48);
  }
  env.L.cyl(LM('#ffd89a', LMODE.NIGHT, 2.4, 0, 0.0), 0.36, 0.36, 0.95, tx, lan + 0.1, tz, 8);
  K.cyl(copper, 0.6, 0.6, 0.15, tx, lan + 1.15, tz, 12);
  K.cone(copper, 0.55, 2.4, tx, lan + 1.3, tz, 12);
  finial(K, gold, tx, lan + 3.65, tz, 0.6, 0.11);
  flagpole(env, tx, lan + 4.3, tz, 3.0, 2.6, 0, 0.4, 0.05);
  env.glow(tx, lan + 0.6, tz, { size: 2.2, kind: 'halo', color: '#ffd28e', intensity: 0.5 });
  // tower spotlights from the roof
  for (const s of [-1, 1]) {
    env.glow(tx + s * 1.6, eave + 1.1, tz + tw / 2 + 1.2, { size: 0.5, kind: 'beam', color: '#ffd9a0', intensity: 0.22, dir: [s * -0.4, 12.5, -0.6], endSize: 2.0 });
  }
  // ground uplight pools along the front
  for (const gx of [-14.6, -9, -3.3, 3.3, 9, 14.6]) env.glow(gx, 0.1, HD + 0.5, { size: 2.0, kind: 'pool', color: '#ffbf75', intensity: 0.2 });

  env.endChecks();
  env.pick(lot.id, lot.name ?? 'Town Hall', env.boxLocal(-HW, 0, -HD, HW, lan + 7, HD), () => {
    const h = env.hours();
    const open = h >= 8 && h < 18;
    return ['Seat of the city council · built 1902', open ? 'Open now · closes 18:00' : 'Closed · opens 8:00', 'The bell rings every hour'];
  });
}

/**
 * Box hunt (?nointeriors): the town hall furnished for the free camera — storey slabs (the hollow 13 m core read as
 * a void), an entrance hall with marble columns, a chequered floor, a red runner from the loggia doors to the
 * reception desk, painted portraits, benches, palms, flags and chandeliers; the council chamber upstairs with its
 * long table, chairs, green carpet and a chandelier.
 */
function townhallInterior(env: Env, o: { HW: number; RX: number; coreB: number; coreF: number; zF: number; y1: number; y2: number }): void {
  const { HW, RX, coreB, coreF, zF, y1, y2 } = o;
  const D = env.D;
  const iw = HW - 0.75;
  const zb = coreB + 0.05,
    zf = coreF - 0.05;
  const zm = (zb + zf) / 2;
  const dz = zf - zb;
  const wood = M('#5a3820', PAT.PLANKS, 0.65);
  const woodDark = M('#3b2414', PAT.PLAIN, 0.6);
  const plasterC = M('#efe6d2', PAT.PLAIN, 0.9);
  const marble = M('#e7e1d5', PAT.TILES, 0.4, 0, 0, 0, 0.8);
  const colM = M('#d8cfbd', PAT.PLAIN, 0.4);
  const gilt = S.gold();
  const red = M('#7a1e22', PAT.PLAIN, 0.95);
  // floors and ceilings: the centre between the cores, the wings out to the front wall
  for (const yy of [0, y1 - 0.25, y2 - 0.25]) {
    const m = yy === 0 ? marble : plasterC;
    const t = yy === 0 ? 0.03 : 0.25;
    D.box(m, iw * 2, t, dz, 0, yy, zm);
    for (const s of [-1, 1]) D.box(m, iw - RX, t, zF - 0.55 - zf, s * (RX + (iw - RX) / 2), yy, (zf + zF - 0.55) / 2);
  }
  // first-floor boards on top of the slab
  D.box(M('#7a5434', PAT.PLANKS, 0.7), iw * 2, 0.02, dz, 0, y1, zm);
  // entrance hall: two rows of columns with bases and capitals
  const colH = y1 - 0.25;
  for (const x of [-13.5, -9, -4.5, 4.5, 9, 13.5])
    for (const z of [zb + 2.2, zf - 2.2]) {
      if (Math.abs(x) > iw - 0.5) continue;
      D.box(colM, 0.7, 0.3, 0.7, x, 0, z);
      D.cyl(colM, 0.24, 0.28, colH - 0.6, x, 0.3, z, 14);
      D.box(colM, 0.66, 0.3, 0.66, x, colH - 0.3, z);
    }
  // runner from the loggia doors to the reception desk, the desk, two flags
  D.box(red, 2.0, 0.012, dz - 1.6, 0, 0.03, zm + 0.8);
  D.box(wood, 3.2, 1.0, 0.7, 0, 0, zb + 1.6);
  D.box(woodDark, 3.4, 0.05, 0.85, 0, 1.0, zb + 1.6);
  for (const s of [-1, 1]) {
    D.cyl(gilt, 0.025, 0.03, 2.6, s * 2.4, 0, zb + 0.9, 6);
    // the flag hangs from the pole in soft folds (pleated strips), a gilt ball on top
    const cloth = M(s > 0 ? '#1f4f8f' : '#c9a227', PAT.PLAIN, 0.9);
    for (let k = 0; k < 6; k++) {
      const za = zb + 0.88 - k * 0.12,
        zc2 = za - 0.12;
      const xa = s * 2.4 + (k % 2 ? 0.04 : -0.04),
        xc = s * 2.4 + (k % 2 ? -0.04 : 0.04);
      const ya = 1.35 + 0.05 * Math.sin(k * 0.9),
        yc = 1.35 + 0.05 * Math.sin((k + 1) * 0.9);
      D.quad(cloth, [xa, ya, za], [xc, yc, zc2], [xc, 2.45, zc2], [xa, 2.45, za], 0.12, 1.1, true);
    }
    D.sphere(gilt, 0.05, s * 2.4, 2.64, zb + 0.9, 8, 6);
  }
  // portraits on the back wall (painted: a dark ground, a lit face, a coat), benches below, palms in the corners
  const portrait = env.atlas.add(64, 80, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#3a2a1c');
    gr.addColorStop(1, '#1a120c');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#20232a';
    g.beginPath();
    g.ellipse(w / 2, h * 0.92, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9b394';
    g.beginPath();
    g.ellipse(w / 2, h * 0.4, w * 0.16, h * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efe8dc';
    g.fillRect(w * 0.44, h * 0.56, w * 0.12, h * 0.08);
  });
  for (const x of [-12, -6.5, 6.5, 12]) {
    if (Math.abs(x) > iw - 1) continue;
    D.box(gilt, 1.25, 1.55, 0.06, x, 1.65, zb + 0.03);
    signQuad(env.T, portrait, 1.0, 1.25, x, 2.42, zb + 0.07, 0, 0);
    D.box(wood, 1.8, 0.05, 0.42, x, 0.45, zb + 0.35);
    for (const e of [-0.8, 0.8]) D.box(woodDark, 0.06, 0.45, 0.4, x + e, 0, zb + 0.35);
  }
  for (const s of [-1, 1]) {
    const px = s * (iw - 0.6);
    D.cyl(M('#8a5a3a', PAT.PLAIN, 0.8), 0.28, 0.22, 0.55, px, 0, zb + 0.6, 10);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      D.boxC(M('#3f6b35', PAT.PLAIN, 0.8), 0.18, 0.04, 1.0, px + Math.sin(a) * 0.35, 1.2, zb + 0.6 + Math.cos(a) * 0.35, 0.7, a, 0);
    }
  }
  // chandeliers in the hall
  for (const x of [-9, 0, 9]) {
    D.box(woodDark, 0.025, 0.7, 0.025, x, colH - 0.7, zm);
    D.torus(gilt, 0.5, 0.025, x, colH - 0.75, zm, 4, 18);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      env.L.sphere(LM('#ffe0a8', LMODE.ALWAYS, 1.8, k * 0.31), 0.05, x + Math.sin(a) * 0.5, colH - 0.66, zm + Math.cos(a) * 0.5, 6, 4);
    }
    env.glow(x, colH - 0.68, zm, { size: 1.6, kind: 'halo', color: '#ffd89a', intensity: 0.32 });
    env.glow(x, 0.14, zm, { size: 4.2, kind: 'pool', color: '#ffcf8a', intensity: 0.18 });
  }
  // council chamber upstairs: green carpet, the long table with chairs both sides, a chandelier, portraits
  const fy = y1 + 0.02;
  D.box(M('#2f5a3e', PAT.PLAIN, 0.95), 11, 0.012, Math.min(5, dz - 1.2), 0, fy, zm);
  D.box(wood, 8.4, 0.07, 1.5, 0, fy + 0.72, zm);
  for (const lx of [-3.9, 0, 3.9]) for (const lz of [-0.55, 0.55]) D.box(woodDark, 0.1, 0.72, 0.1, lx, fy, zm + lz);
  for (let i = 0; i < 9; i++) {
    const x = -3.6 + i * 0.9;
    for (const s of [-1, 1]) {
      const z = zm + s * 1.05;
      D.box(red, 0.46, 0.06, 0.46, x, fy + 0.45, z);
      D.box(woodDark, 0.46, 0.6, 0.06, x, fy + 0.48, z + s * 0.22);
      for (const lx of [-0.19, 0.19]) for (const lz of [-0.19, 0.19]) D.box(woodDark, 0.04, 0.45, 0.04, x + lx, fy, z + lz);
    }
  }
  D.torus(gilt, 0.8, 0.03, 0, y2 - 1.3, zm, 4, 24);
  D.box(woodDark, 0.03, 1.0, 0.03, 0, y2 - 1.3, zm);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    env.L.sphere(LM('#ffe0a8', LMODE.ALWAYS, 1.8, k * 0.29), 0.05, Math.sin(a) * 0.8, y2 - 1.22, zm + Math.cos(a) * 0.8, 6, 4);
  }
  env.glow(0, y2 - 1.25, zm, { size: 2.2, kind: 'halo', color: '#ffd89a', intensity: 0.32 });
  for (const x of [-4, 0, 4]) {
    D.box(gilt, 1.25, 1.55, 0.06, x, fy + 1.4, zb + 0.03);
    signQuad(env.T, portrait, 1.0, 1.25, x, fy + 2.17, zb + 0.07, 0, 0);
  }
}
