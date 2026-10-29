// 'St. Mary's Church' — sandstone gothic-revival church: west tower with a pointed portal,
// rose window, clock faces (live time), louvred belfry, corner pinnacles and a tall slate
// spire with lucarnes and a gilded cross; a buttressed nave with stained-glass lancets, a
// steep slate roof and a polygonal apse. Night: glowing stained glass, uplit tower.

import * as THREE from 'three';
import type { Lot } from '../../core/plan';
import { DIR_YAW } from '../../core/geom';
import { FLOOD, M, PAT, Mat } from './builder';
import { V3, Kit, pointedPoints } from './kit';
import { wall as wallBase, moulding, Opening, WallSpec } from './facade';
import { C, S, finial } from './parts';
import type { Env } from './env';

export function genChurch(env: Env, lot: Lot): void {
  const fp = lot.footprint;
  const cx = (fp.x0 + fp.x1) / 2,
    cz = (fp.z0 + fp.z1) / 2;
  const yaw = DIR_YAW[lot.front];
  env.begin(cx, 0, cz, yaw);
  env.checkLot(fp, 'church');
  const K = env.S;
  // ?nochurchmould: no hood moulds / archivolts / rose tracery / gablet dressing (A/B); off on low quality
  const mould = !env.ctx.debug.params.has('nochurchmould') && env.ctx.quality.level !== 'low';
  const wall = (k: Kit, spec: WallSpec): void => {
    wallBase(k, spec);
    if (mould) for (const o of spec.openings ?? []) dressOpening(k, spec, o);
  };
  const ns = lot.front === 'N' || lot.front === 'S';
  const HW = (ns ? fp.x1 - fp.x0 : fp.z1 - fp.z0) / 2; // 7
  const HD = (ns ? fp.z1 - fp.z0 : fp.x1 - fp.x0) / 2; // 13

  const stone = M('#cdbf9f', PAT.STONE, 0.88, 0, 0, FLOOD.CHURCH, 0.3);
  const trim = M('#ddd0b2', PAT.PLAIN, 0.85, 0, 0, FLOOD.CHURCH);
  const dark = M('#a89a7e', PAT.STONE, 0.9, 0, 0, FLOOD.CHURCH, 0.6);
  const slate = M('#4b545f', PAT.SLATE, 0.6, 0, 0, 0, 0.3);
  const gold = S.gold();
  const stained = (seed: number) => M('#6b665c', PAT.STAINED, 0.5, 0, 0.9, 0, seed);

  // ── tower (front)
  const TW = 3.0; // half width
  const tz0 = HD - 6.1,
    tz1 = HD - 0.12;
  const tzc = (tz0 + tz1) / 2;
  const tTop = 24.6;
  const tD = tz1 - tz0;
  const towerOpen = (face: 'front' | 'side' | 'back'): Opening[] => {
    const w = face === 'side' ? tD : TW * 2;
    const c = w / 2;
    const o: Opening[] = [];
    if (face === 'front') {
      o.push({ x: c, y: 0, w: 2.3, h: 4.3, arch: 1.7, pointed: true, fill: 'door', inset: 0.45, surround: trim, surroundW: 0.32, infill: M('#5a3420', PAT.DOOR, 0.6, 0, 0.6, 0, 0.8) });
      o.push({ x: c, y: 6.1, w: 2.7, h: 2.7, round: true, fill: 'stained', inset: 0.3, surround: trim, surroundW: 0.26, infill: M('#d8ccb0', PAT.ROSE, 0.5, 0, 0.95, 0, 0.3) });
    } else if (face === 'side') {
      o.push({ x: c, y: 6.4, w: 0.65, h: 2.2, arch: 0.45, pointed: true, fill: 'stained', glow: 0.8, seed: 0.3, inset: 0.25, surround: trim, surroundW: 0.12, infill: stained(0.31) });
    }
    if (face !== 'back') o.push({ x: c, y: 11.3, w: 0.6, h: 1.9, arch: 0.4, pointed: true, fill: 'dark', inset: 0.25, surround: trim, surroundW: 0.1 });
    // clock (round opening holding the face) — not on the back (hidden by the nave roof)
    if (face !== 'back') o.push({ x: c, y: 15.4, w: 2.0, h: 2.0, round: true, fill: 'none' });
    // belfry louvres
    for (const dx of [-1.0, 1.0]) o.push({ x: c + dx, y: 19.4, w: 1.15, h: 3.6, arch: 0.95, pointed: true, fill: 'louvre', inset: 0.35, surround: trim, surroundW: 0.12 });
    return o;
  };
  wall(K, { w: TW * 2, h: tTop, depth: 0.7, x: 0, y: 0, z: tz1, ry: 0, mat: stone, openings: towerOpen('front') });
  wall(K, { w: TW * 2, h: tTop, depth: 0.7, x: 0, y: 0, z: tz0, ry: Math.PI, mat: stone, openings: towerOpen('back') });
  for (const s of [-1, 1]) wall(K, { w: tD, h: tTop, depth: 0.7, x: s * TW, y: 0, z: tzc, ry: (s * Math.PI) / 2, mat: stone, openings: towerOpen('side') });
  // floors inside the tower openings (hide the void behind the clock holes)
  K.coreBox(dark, TW * 2 - 1.4, tTop - 1.0, tD - 1.4, 0, 0.5, tzc);
  // clock faces (front + both sides + back)
  for (const [fx, fz, ry] of [
    [0, tz1, 0],
    [TW, tzc, Math.PI / 2],
    [-TW, tzc, -Math.PI / 2],
  ] as [number, number, number][]) {
    const s = Math.sin(ry),
      c = Math.cos(ry);
    const face = new THREE.CircleGeometry(0.95, 32);
    K.geo(M(C.cream, PAT.CLOCK, 0.5, 0, 0.95), face, fx - s * 0.2, 16.4, fz - c * 0.2, ry, 'native');
    face.dispose();
    K.torus(gold, 0.98, 0.05, fx - s * 0.18, 16.4, fz - c * 0.18, 6, 32, Math.PI * 2, 0, ry);
  }
  // portal: steps, gable over the door (gablet), statue niche
  K.box(M(C.granite, PAT.STONE, 0.8, 0, 0, 0, 0.1), 3.4, 0.16, 0.5, 0, 0, tz1 - 0.15);
  K.roofFace(trim, [
    [-1.75, 4.25, tz1 + 0.35],
    [0, 5.75, tz1 + 0.35],
    [0, 5.75, tz1 - 0.1],
    [-1.75, 4.25, tz1 - 0.1],
  ]);
  K.roofFace(trim, [
    [0, 5.75, tz1 + 0.35],
    [1.75, 4.25, tz1 + 0.35],
    [1.75, 4.25, tz1 - 0.1],
    [0, 5.75, tz1 - 0.1],
  ]);
  K.poly(stone, [
    [-1.7, 4.25, tz1 + 0.34],
    [1.7, 4.25, tz1 + 0.34],
    [0, 5.7, tz1 + 0.34],
  ]);
  finial(K, trim, 0, 5.75, tz1 + 0.12, 0.45, 0.08);
  if (mould) {
    // gablet dressing: a moulded base course, a trefoil oculus in the tympanum, crockets up both slopes
    const prev = K.b.forceDetail;
    K.b.forceDetail = true;
    K.box(trim, 3.3, 0.13, 0.1, 0, 4.25, tz1 + 0.38);
    K.box(trim, 3.1, 0.06, 0.05, 0, 4.38, tz1 + 0.36);
    const oz = tz1 + 0.36;
    K.torus(trim, 0.27, 0.04, 0, 4.88, oz, 4, 24, Math.PI * 2, 0);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
      K.torus(trim, 0.085, 0.022, Math.cos(a) * 0.12, 4.88 + Math.sin(a) * 0.12, oz, 4, 12, Math.PI * 2, 0);
    }
    const disc = new THREE.CircleGeometry(0.25, 16);
    K.geo(dark, disc, 0, 4.88, oz - 0.012, 0);
    disc.dispose();
    for (const sg of [-1, 1])
      for (const t of [0.3, 0.55, 0.8]) K.sphere(trim, 0.065, sg * 1.75 * (1 - t), 4.25 + 1.5 * t + 0.14, tz1 + 0.14, 6, 4);
    K.b.forceDetail = prev;
  }
  // portal door: boarded leaves (PAT.DOOR) dressed with wrought-iron strap hinges ending in fleur tips, a
  // meeting stile, ring pulls on round back plates, a stone threshold; a darker plinth course round the base
  const iron = M('#1f1d1b', PAT.PLAIN, 0.55, 0.6);
  const dz = tz1 - 0.45 + 0.013;
  K.box(M('#3e2516', PAT.PLAIN, 0.7), 0.07, 3.0, 0.03, 0, 0, dz + 0.004);
  for (const sgn of [-1, 1]) {
    for (const yy of [0.55, 1.55, 2.55]) {
      K.box(iron, 0.95, 0.075, 0.022, sgn * 0.6, yy, dz);
      K.box(iron, 0.07, 0.16, 0.024, sgn * 0.11, yy - 0.042, dz, Math.PI / 4);
      for (let k = 0; k < 3; k++) K.cyl(iron, 0.018, 0.018, 0.02, sgn * (1.0 - k * 0.28), yy + 0.028, dz + 0.012, 6);
    }
    K.cyl(iron, 0.07, 0.07, 0.02, sgn * 0.2, 1.2, dz + 0.004, 12, false, 'cyl', 0, Math.PI * 2, 0);
    K.torus(iron, 0.075, 0.012, sgn * 0.2, 1.1, dz + 0.03, 6, 16, Math.PI * 2, 0, 0);
  }
  K.box(M(C.granite, PAT.STONE, 0.8, 0, 0, 0, 0.1), 2.3, 0.05, 0.44, 0, 0, tz1 - 0.23);
  const plinth = M('#a39377', PAT.STONE, 0.92, 0, 0, FLOOD.CHURCH, 0.7);
  const plinthRun = (x: number, z: number, ry: number, len: number) => {
    moulding(K, plinth, x, z, ry, len, 0, 0.62, 0.08);
    moulding(K, trim, x, z, ry, len, 0.62, 0.07, 0.05);
  };
  for (const sgn of [-1, 1]) {
    const a = 1.55,
      b = TW + 0.1;
    plinthRun(sgn * (a + b) / 2, tz1, 0, b - a);
    plinthRun(sgn * TW, tzc, (sgn * Math.PI) / 2, tD + 0.16);
  }
  // string courses
  for (const yy of [4.9, 10.6, 15.0, 18.9]) {
    moulding(K, trim, 0, tz1, 0, TW * 2 + 0.2, yy, 0.22, 0.14);
    moulding(K, trim, 0, tz0, Math.PI, TW * 2 + 0.2, yy, 0.22, 0.14);
    for (const s of [-1, 1]) moulding(K, trim, s * TW, tzc, (s * Math.PI) / 2, tD + 0.2, yy, 0.22, 0.14);
  }
  // diagonal corner buttresses stepping in (front corners; kept inside the footprint)
  for (const sx of [-1, 1]) {
    const steps: [number, number, number][] = [
      [0, 6.0, 1.0],
      [6.0, 11.0, 0.7],
      [11.0, 15.4, 0.45],
    ];
    for (const [y0, y1, d] of steps) {
      const bx = sx * (TW + d * 0.32);
      const bz = tz1 - 0.6;
      K.box(stone, 0.8, y1 - y0, 0.8, bx, y0, bz, Math.PI / 4);
      K.box(trim, 0.9, 0.12, 0.9, bx, y1 - 0.12, bz, Math.PI / 4);
    }
  }
  // parapet with corner pinnacles
  K.box(trim, TW * 2 + 0.5, 0.35, tD + 0.5, 0, tTop, tzc);
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    for (const [px, pz, ry] of [
      [-TW - 0.1 + t * (TW * 2 + 0.2), tz1 + 0.1, 0],
      [-TW - 0.1 + t * (TW * 2 + 0.2), tz0 - 0.1, 0],
      [TW + 0.1, tz0 + t * tD, Math.PI / 2],
      [-TW - 0.1, tz0 + t * tD, Math.PI / 2],
    ] as [number, number, number][])
      if (i % 2 === 0) K.box(trim, 0.42, 0.55, 0.22, px, tTop + 0.35, pz, ry);
  }
  for (const [sx, sz] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    const px = sx * (TW - 0.15),
      pz = sz > 0 ? tz1 - 0.15 : tz0 + 0.15;
    K.box(trim, 0.55, 1.2, 0.55, px, tTop + 0.35, pz);
    K.spire(slate, 4, 0.42, tTop + 1.55, tTop + 3.5, px, pz, Math.PI / 4);
    finial(K, gold, px, tTop + 3.45, pz, 0.35, 0.06);
  }
  // octagonal spire with lucarnes, cross and weathercock
  const spB = tTop + 0.35;
  const spH = 18.5;
  K.cyl(trim, 2.55, 2.6, 0.5, 0, spB, tzc, 8, false, 'box', Math.PI / 8);
  K.spire(slate, 8, 2.62, spB + 0.5, spB + 0.5 + spH, 0, tzc, Math.PI / 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = Math.sin(a),
      c = Math.cos(a);
    const lx = s * 2.05,
      lz = tzc + c * 2.05;
    const P = (dx: number, dy: number, dz: number): V3 => [lx + dx * c + dz * s, spB + 2.4 + dy, lz - dx * s + dz * c];
    K.box(stone, 0.9, 1.5, 1.1, lx - s * 0.2, spB + 2.0, lz - c * 0.2, a);
    K.roofFace(slate, [P(-0.55, 1.1, -0.9), P(-0.55, 1.1, 0.25), P(0, 1.75, 0.25), P(0, 1.75, -0.9)]);
    K.roofFace(slate, [P(0.55, 1.1, 0.25), P(0.55, 1.1, -0.9), P(0, 1.75, -0.9), P(0, 1.75, 0.25)]);
    K.poly(stone, [P(-0.45, 1.1, 0.35), P(0.45, 1.1, 0.35), P(0, 1.68, 0.35)]);
    K.panel(M('#2a2622', PAT.LOUVRE, 0.9), 0.55, 0.85, lx + s * 0.38, spB + 2.15, lz + c * 0.38, a);
  }
  const apex = spB + 0.5 + spH;
  K.sphere(gold, 0.22, 0, apex + 0.1, tzc, 10, 8);
  K.box(gold, 0.12, 1.6, 0.12, 0, apex + 0.2, tzc);
  K.box(gold, 0.8, 0.12, 0.12, 0, apex + 1.25, tzc);
  // weathercock
  K.box(gold, 0.5, 0.28, 0.04, 0.05, apex + 1.75, tzc);
  K.cone(gold, 0.1, 0.25, 0.32, apex + 1.75, tzc, 6);

  // ── nave
  const NW = 5.4;
  const nz0 = -HD + 5.2,
    nz1 = tz0;
  const nL = nz1 - nz0;
  const eave = 9.2;
  const ridge = 16.2;
  const nBays = 4;
  const bayW = nL / nBays;
  for (const s of [-1, 1]) {
    const ops: Opening[] = [];
    for (let i = 0; i < nBays; i++) {
      // wall-local x runs from the wall's left end seen from outside
      ops.push({ x: bayW * (i + 0.5), y: 2.4, w: 1.35, h: 5.4, arch: 1.0, pointed: true, fill: 'stained', glow: 0.9, inset: 0.3, surround: trim, surroundW: 0.14, sill: trim, infill: stained(0.1 + i * 0.21 + (s > 0 ? 0.05 : 0)) });
    }
    wall(K, { w: nL, h: eave, depth: 0.6, x: s * NW, y: 0, z: (nz0 + nz1) / 2, ry: (s * Math.PI) / 2, mat: stone, openings: ops });
    plinthRun(s * NW, (nz0 + nz1) / 2, (s * Math.PI) / 2, nL);
    moulding(K, trim, s * NW, (nz0 + nz1) / 2, (s * Math.PI) / 2, nL, eave - 0.35, 0.35, 0.3);
    moulding(K, M(C.granite, PAT.STONE, 0.8, 0, 0, 0, 0.1), s * NW, (nz0 + nz1) / 2, (s * Math.PI) / 2, nL, 0, 0.6, 0.08);
    // buttresses between bays
    for (let i = 0; i <= nBays; i++) {
      const z = nz0 + bayW * i;
      if (i === nBays) continue;
      const bx = s * (NW + 0.4);
      K.box(stone, 0.8, 6.4, 0.7, bx, 0, z, 0);
      for (const e of [-1, 1]) {
        const ez = z + e * 0.35;
        const tri: V3[] = [
          [bx + s * 0.4, 6.4, ez],
          [s * NW, 6.4, ez],
          [s * NW, 7.6, ez],
        ];
        K.poly(stone, e * s > 0 ? tri : tri.reverse());
      }
      K.roofFace(trim, [
        [bx + s * 0.4, 6.4, z + 0.36 * s],
        [bx + s * 0.4, 6.4, z - 0.36 * s],
        [s * NW, 7.6, z - 0.36 * s],
        [s * NW, 7.6, z + 0.36 * s],
      ]);
    }
  }
  // nave front gable (beside the tower) and back gable
  const gableOutline = (w: number): [number, number][] => [
    [0, 0],
    [w, 0],
    [w, eave],
    [w / 2, ridge - 0.2],
    [0, eave],
  ];
  wall(K, {
    w: NW * 2,
    h: ridge,
    depth: 0.6,
    x: 0,
    y: 0,
    z: nz1 + 0.6,
    ry: 0,
    mat: stone,
    outline: gableOutline(NW * 2),
    openings: [
      { x: 1.2, y: 2.6, w: 0.8, h: 3.0, arch: 0.6, pointed: true, fill: 'stained', glow: 0.85, inset: 0.25, infill: stained(0.8) },
      { x: NW * 2 - 1.2, y: 2.6, w: 0.8, h: 3.0, arch: 0.6, pointed: true, fill: 'stained', glow: 0.85, inset: 0.25, infill: stained(0.66) },
    ],
  });
  wall(K, { w: NW * 2, h: ridge, depth: 0.6, x: 0, y: 0, z: nz0, ry: Math.PI, mat: stone, outline: gableOutline(NW * 2), openings: [{ x: NW, y: 9.8, w: 1.6, h: 1.6, round: true, fill: 'stained', glow: 0.85, inset: 0.25, surround: trim, surroundW: 0.15, infill: M('#d8ccb0', PAT.ROSE, 0.5, 0, 0.9, 0, 0.6) }] });
  K.coreBox(dark, NW * 2 - 1.2, eave - 0.3, nL - 1.2, 0, 0, (nz0 + nz1) / 2);
  K.gableRoof(slate, -NW, NW, nz0 - 0.15, nz1 + 0.45, eave, ridge, 'z', 0.45, 0.2, trim);
  // ridge cresting + gable crosses
  K.box(M('#3f4750', PAT.PLAIN, 0.5, 0.4), 0.12, 0.2, nL + 0.4, 0, ridge - 0.05, (nz0 + nz1) / 2);
  K.box(gold, 0.12, 1.4, 0.12, 0, ridge - 0.2, nz0 - 0.1);
  K.box(gold, 0.7, 0.12, 0.12, 0, ridge + 0.75, nz0 - 0.1);

  // ── chancel with a polygonal apse
  const CW = 4.0;
  const cz0 = -HD + 0.12,
    cz1 = nz0;
  const cEave = 8.0,
    cRidge = 12.6;
  const az = cz0 + 2.4; // where the apse polygon starts
  // straight side walls of the chancel
  for (const s of [-1, 1]) {
    const L = cz1 - az;
    wall(K, { w: L, h: cEave, depth: 0.6, x: s * CW, y: 0, z: (az + cz1) / 2, ry: (s * Math.PI) / 2, mat: stone, openings: [{ x: L / 2, y: 2.6, w: 1.1, h: 4.2, arch: 0.8, pointed: true, fill: 'stained', glow: 0.9, inset: 0.3, surround: trim, surroundW: 0.12, infill: stained(0.45 + s * 0.1) }] });
  }
  // apse faces
  const apsePts: [number, number][] = [
    [-CW, az],
    [-CW * 0.62, cz0 + 0.5],
    [0, cz0],
    [CW * 0.62, cz0 + 0.5],
    [CW, az],
  ];
  for (let i = 0; i < apsePts.length - 1; i++) {
    const [ax, azz] = apsePts[i],
      [bx, bz] = apsePts[i + 1];
    const L = Math.hypot(bx - ax, bz - azz);
    const ry = Math.atan2(-(bz - azz), bx - ax) + Math.PI; // outward normal yaw
    const mx = (ax + bx) / 2,
      mz = (azz + bz) / 2;
    // facing direction: outward from the apse centre
    const nx = Math.sin(ry),
      nzz = Math.cos(ry);
    const outward = nx * mx + nzz * (mz - az) > 0 ? ry : ry + Math.PI;
    wall(K, {
      w: L,
      h: cEave,
      depth: 0.6,
      x: mx,
      y: 0,
      z: mz,
      ry: outward,
      mat: stone,
      openings: i === 0 || i === 3 ? [] : [{ x: L / 2, y: 2.6, w: 1.0, h: 4.0, arch: 0.75, pointed: true, fill: 'stained', glow: 0.9, inset: 0.3, surround: trim, surroundW: 0.12, infill: stained(0.2 + i * 0.3) }],
    });
  }
  K.coreBox(dark, CW * 2 - 1.2, cEave - 0.3, cz1 - az, 0, 0, (az + cz1) / 2 - 0.3);
  K.cyl(dark, 2.1, 2.1, cEave - 0.3, 0, 0, az, 6);
  // chancel roof: gable part + apse fan
  K.gableRoof(slate, -CW, CW, az, cz1 + 0.2, cEave, cRidge, 'z', 0.35, 0.16, trim);
  const ridgeEnd: V3 = [0, cRidge, az];
  const eaveO = 0.35;
  const k = (cRidge - cEave) / CW;
  const ey = cEave - eaveO * k;
  const ap = apsePts.map(([x, z]) => {
    const dx = x,
      dz = z - az;
    const l = Math.hypot(dx, dz) || 1;
    return [x + (dx / l) * eaveO, ey, z + (dz / l) * eaveO] as V3;
  });
  for (let i = 0; i < ap.length - 1; i++) K.roofFace(slate, [ap[i + 1], ap[i], ridgeEnd]);
  K.box(gold, 0.1, 1.0, 0.1, 0, cRidge - 0.1, az);
  K.box(gold, 0.55, 0.1, 0.1, 0, cRidge + 0.55, az);

  // ── night: tower beams and ground pools
  for (const s of [-1, 1]) env.glow(s * 2.2, 0.3, tz1 + 1.2, { size: 0.6, kind: 'beam', color: '#ffe0b0', intensity: 0.2, dir: [s * -0.6, 22, -1.0], endSize: 3.0 });
  env.glow(0, 0.1, HD + 0.8, { size: 3.5, kind: 'pool', color: '#ffc27a', intensity: 0.3 });
  for (const s of [-1, 1]) for (const zz of [-4, 2]) env.glow(s * (NW + 1.4), 0.1, zz, { size: 2.6, kind: 'pool', color: '#ffbf75', intensity: 0.16 });

  env.endChecks();
  env.pick(lot.id, lot.name ?? 'St. Mary’s Church', env.boxLocal(-HW, 0, -HD, HW, apex + 2, HD), () => {
    const h = env.hours();
    const service = (h >= 9.5 && h < 11) || (h >= 18 && h < 19);
    return ['Gothic-revival parish church · 1868', service ? 'Service in progress' : 'Open for visitors 9:00–18:00', `Spire ${Math.round(apex + 2)} m · the bells ring on the hour`];
  });
}

const _wm = new THREE.Matrix4();
const _rm = new THREE.Matrix4();

/** Wall-local (u along from the left end seen outside, v up, z out) → landmark-local, as facade.ts wallMatrix. */
function wallMat(s: WallSpec): THREE.Matrix4 {
  _wm.makeRotationY(s.ry);
  _wm.setPosition(s.x - (s.w / 2) * Math.cos(s.ry), s.y, s.z + (s.w / 2) * Math.sin(s.ry));
  return _wm;
}

/**
 * Band following a pointed opening's outline, grown outward by g0..g1 (negative = into the opening), extruded
 * z0..z1 (wall-local, + = out). `jambs`: run down the jambs to the sill; else the arch only (from the springing).
 */
function archBand(K: Kit, m: Mat, wm: THREE.Matrix4, o: Opening, g0: number, g1: number, z0: number, z1: number, jambs: boolean): void {
  const ring = (g: number): [number, number][] => {
    const p = pointedPoints(o.w + 2 * g, o.h + g, (o.arch ?? 0) + g, 7);
    const arc = p.slice(jambs ? 1 : 2);
    if (jambs) arc.push([p[0][0], p[0][1]]);
    return arc.map(([x, y]) => [x + o.x, y + o.y]);
  };
  const outer = ring(g1),
    inner = ring(g0).reverse();
  const sh = new THREE.Shape([...outer, ...inner].map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 2 });
  geo.translate(0, 0, z0);
  K.geoM(m, geo, wm, 'box');
  geo.dispose();
}

function ringAt(K: Kit, m: Mat, wm: THREE.Matrix4, x: number, y: number, z: number, R: number, r: number, rs: number, ts: number): void {
  const geo = new THREE.TorusGeometry(R, r, rs, ts);
  geo.translate(x, y, z);
  K.geoM(m, geo, wm, 'box');
  geo.dispose();
}

/**
 * Stone dressing of one opening (near-detail mesh): pointed stained/door openings get a hood mould over the arch
 * (a back fillet + a proud roll) ending in label stops; the portal also gets two archivolt rolls stepping into
 * the reveal. Round rose windows get an outer roll and plate tracery: rim, hub, 12 spokes, cusped foils, matched to the painted glass.
 */
function dressOpening(K: Kit, s: WallSpec, o: Opening): void {
  const sur = o.surround;
  if (!sur || (o.fill !== 'stained' && o.fill !== 'door')) return;
  const sw = o.surroundW ?? 0.18;
  const wm = wallMat(s);
  const prev = K.b.forceDetail;
  K.b.forceDetail = true;
  if (o.pointed && o.arch) {
    const big = o.fill === 'door';
    const bw = big ? 0.16 : 0.1;
    archBand(K, sur, wm, o, sw - 0.01, sw + bw, 0, big ? 0.1 : 0.08, false);
    archBand(K, sur, wm, o, sw + bw * 0.25, sw + bw * 0.8, 0, big ? 0.16 : 0.12, false);
    // label stops: short blocks under the hood ends, chamfered by a smaller block below
    const spring = o.y + o.h - o.arch;
    const ux = o.w / 2 + sw + bw / 2;
    for (const sg of [-1, 1]) {
      const b1 = new THREE.BoxGeometry(bw + 0.04, 0.22, big ? 0.16 : 0.12);
      b1.translate(o.x + sg * ux, spring - 0.11, (big ? 0.16 : 0.12) / 2);
      K.geoM(sur, b1, wm, 'box');
      b1.dispose();
      const b2 = new THREE.BoxGeometry(bw - 0.02, 0.1, big ? 0.1 : 0.07);
      b2.translate(o.x + sg * ux, spring - 0.27, (big ? 0.1 : 0.07) / 2);
      K.geoM(sur, b2, wm, 'box');
      b2.dispose();
    }
    if (big) {
      const ins = o.inset ?? 0.3;
      archBand(K, sur, wm, o, -0.07, 0, -0.16, -0.06, true);
      archBand(K, sur, wm, o, -0.13, -0.06, -ins + 0.1, -ins + 0.18, true);
    }
  } else if (o.round && o.w > 1.2) {
    const R = o.w / 2,
      cx = o.x,
      cy = o.y + R;
    ringAt(K, sur, wm, cx, cy, 0.09, R + sw + 0.05, 0.065, 6, 40);
    const z = -(o.inset ?? 0.3) + 0.045;
    ringAt(K, sur, wm, cx, cy, z, R - 0.05, 0.055, 4, 40);
    // tracery radii follow the painted glass (landmarks/shaders.ts pat 19): hub ring 0.31, foils at 0.62 (r 0.19)
    ringAt(K, sur, wm, cx, cy, z, R * 0.31, 0.05, 4, 20);
    const hub = new THREE.CircleGeometry(R * 0.28, 16);
    hub.translate(cx, cy, z + 0.02);
    K.geoM(sur, hub, wm, 'box');
    hub.dispose();
    const n = 12;
    const r0 = R * 0.31,
      r1 = R - 0.05;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.065, r1 - r0, 0.07);
      sp.translate(0, (r0 + r1) / 2, 0);
      sp.applyMatrix4(_rm.makeRotationZ(a));
      sp.translate(cx, cy, z);
      K.geoM(sur, sp, wm, 'box');
      sp.dispose();
      const ah = a + Math.PI / n;
      const rf = R * 0.62;
      ringAt(K, sur, wm, cx + Math.sin(ah) * rf, cy + Math.cos(ah) * rf, z, R * 0.19, 0.03, 4, 16);
    }
  }
  K.b.forceDetail = prev;
}
