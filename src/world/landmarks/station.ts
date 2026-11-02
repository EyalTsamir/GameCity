// 'Tinyhaven Central' — the grand station hall: a glazed barrel vault behind a stone
// frontispiece with a great arched window holding a big clock (live time), flanking
// towers with copper cupolas, mansarded wings and end pavilions, an iron-and-glass
// entrance marquise, name lettering, lanterns, and a warm glow at night.

import * as THREE from 'three';
import type { Lot } from '../../core/plan';
import { DIR_YAW } from '../../core/geom';
import { FLOOD, LM, LMODE, M, Mat, PAT, withM } from './builder';
import { Kit, V3 } from './kit';
import { wall, bays, moulding, Opening } from './facade';
import { C, S, mansard, quoins, chimney, finial, dormer, wallLantern, flagpole, railing } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';
import { boxHunt } from '../../core/boxhunt';
import { lmDetail } from '../../core/lmdetail';
import { buildStationRoom } from './stationRoom';
import { bugOn } from '../../core/sweepbugs';

/** Glazed segmental barrel vault spanning x0..x1 along z0..z1. */
export function barrelVault(K: Kit, glass: Mat, rib: Mat, x0: number, x1: number, z0: number, z1: number, ySpring: number, rise: number, segs: number, ribEvery: number): void {
  const span = x1 - x0;
  const xm = (x0 + x1) / 2;
  const R = (rise * rise + (span / 2) * (span / 2)) / (2 * rise);
  const yc = ySpring + rise - R;
  const th0 = Math.atan2(ySpring - yc, span / 2);
  const thL = Math.PI - th0;
  const n = segs + 1;
  const pos = new Float32Array(n * 2 * 3);
  const nrm = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const pts: [number, number, number][] = []; // x, y, theta
  for (let i = 0; i < n; i++) {
    const th = thL - (i / segs) * (thL - th0);
    const x = xm + R * Math.cos(th),
      y = yc + R * Math.sin(th);
    pts.push([x, y, th]);
    const s = R * (thL - th);
    pos.set([x, y, z1, x, y, z0], i * 6);
    nrm.set([Math.cos(th), Math.sin(th), 0, Math.cos(th), Math.sin(th), 0], i * 6);
    uv.set([s, z1, s, z0], i * 4);
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2,
      b = (i + 1) * 2;
    idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  K.geo(glass, g, 0, 0, 0, 0, 'native');
  g.dispose();
  // arched ribs
  const nr = Math.max(1, Math.round((z1 - z0) / ribEvery));
  for (let k = 0; k <= nr; k++) {
    const z = z0 + ((z1 - z0) * k) / nr;
    for (let i = 0; i < segs; i++) {
      const [ax, ay, ath] = pts[i];
      const [bx, by, bth] = pts[i + 1];
      const o = 0.07;
      K.beam(rib, [ax + Math.cos(ath) * o, ay + Math.sin(ath) * o, z], [bx + Math.cos(bth) * o, by + Math.sin(bth) * o, z], 0.16, 0.14);
    }
  }
  // edge purlins along the springing
  K.box(rib, 0.3, 0.25, z1 - z0, x0 + 0.1, ySpring - 0.1, (z0 + z1) / 2);
  K.box(rib, 0.3, 0.25, z1 - z0, x1 - 0.1, ySpring - 0.1, (z0 + z1) / 2);
}

/** Vertical outline of a segmental arch (for gables following the vault). */
function vaultOutline(span: number, ySpring: number, rise: number, extra: number, segs = 12): [number, number][] {
  const R = (rise * rise + (span / 2) * (span / 2)) / (2 * rise);
  const yc = ySpring + rise - R;
  const th0 = Math.atan2(ySpring - yc, span / 2);
  const out: [number, number][] = [
    [0, 0],
    [span, 0],
    [span, ySpring],
  ];
  for (let i = 0; i <= segs; i++) {
    const th = th0 + (i / segs) * (Math.PI - 2 * th0);
    out.push([span / 2 + (R + extra) * Math.cos(th), yc + (R + extra) * Math.sin(th)]);
  }
  out.push([0, ySpring]);
  return out;
}

export function genStation(env: Env, lot: Lot): void {
  const fp = lot.footprint;
  const cx = (fp.x0 + fp.x1) / 2,
    cz = (fp.z0 + fp.z1) / 2;
  const yaw = DIR_YAW[lot.front];
  env.begin(cx, 0, cz, yaw);
  env.checkLot(fp, 'station');
  const K = env.S;
  const ns = lot.front === 'N' || lot.front === 'S';
  const HW = (ns ? fp.x1 - fp.x0 : fp.z1 - fp.z0) / 2; // 24
  const HD = (ns ? fp.z1 - fp.z0 : fp.x1 - fp.x0) / 2; // 6.75
  const sx = HW / 24; // scale x if the footprint differs

  const stone = S.stone();
  const stoneRust = S.stoneRust();
  const trim = S.stoneTrim();
  const brick = S.brick();
  const slate = S.slate();
  const zinc = S.zinc();
  const copper = S.copper();
  const iron = S.iron();
  const gold = S.gold();
  const granite = M(C.granite, PAT.STONE, 0.8, 0, 0, FLOOD.WARM, 0.1);
  const winGlow = 0.85;

  const HX = 7.6 * sx; // hall half-span
  const TW = 2.3; // tower width
  const WX1 = 17 * sx; // wing end / pavilion start
  const zF = HD - 0.13; // frontispiece front plane
  const zW = HD - 0.33; // wing front plane
  const zP = HD - 0.16; // pavilion front plane (sills stay inside the footprint)
  const ySpring = 11.4,
    rise = 2.6;

  // ── central hall: frontispiece
  const fw = HX * 2;
  const winW = fw - 4.0;
  const winY = 5.6;
  const winH = 7.6;
  const arcadeX = [-3.5, 0, 3.5];
  const hero = !!env.rooms && lmDetail(env.ctx, 'herostation');
  const frontOpenings: Opening[] = arcadeX.map((ax, i) => ({
    x: fw / 2 + ax,
    y: 0,
    w: 2.6,
    h: 4.0,
    arch: 1.3,
    fill: hero && i === 1 ? ('none' as const) : ('door' as const),
    glow: 0.95,
    seed: 0.2,
    inset: 0.32,
    surround: trim,
    surroundW: 0.22,
    keystone: trim,
    infill: M('#3b4a3f', PAT.DOOR, 0.5, 0.1, 0.95, 0, i === 1 ? 0.1 : 0.3),
  }));
  frontOpenings.push({ x: fw / 2, y: winY, w: winW, h: winH, arch: winW / 2, fill: 'glass', glow: 0.95, inset: 0.3, surround: trim, surroundW: 0.42, keystone: trim, infill: M(C.ironGreen, PAT.GLAZING, 0.3, 0.3, 0.95, 0, 0.2) });
  const arcR = winW / 2 + 1.15;
  const arcCy = winY + winH - winW / 2;
  const outline: [number, number][] = [
    [0, 0],
    [fw, 0],
    [fw, arcCy],
  ];
  for (let i = 0; i <= 16; i++) {
    const th = (i / 16) * Math.PI;
    outline.push([fw / 2 + Math.cos(th) * arcR, arcCy + Math.sin(th) * arcR]);
  }
  outline.push([0, arcCy]);
  wall(K, { w: fw, h: arcCy + arcR, depth: 0.55, x: 0, y: 0, z: zF, ry: 0, mat: stone, openings: frontOpenings, outline });
  // archivolt crest + mouldings
  moulding(K, trim, 0, zF, 0, fw, 4.2, 0.22, 0.16);
  if (hero) for (const s of [-1, 1]) moulding(K, granite, (s * (fw / 2 + 1.3)) / 2, zF, 0, fw / 2 - 1.3, 0, 0.55, 0.1);
  else moulding(K, granite, 0, zF, 0, fw, 0, 0.55, 0.1);
  for (const s of [-1, 1]) {
    K.box(trim, 0.9, 0.3, 0.5, s * (fw / 2 - 0.45), arcCy, zF - 0.2);
    finial(K, gold, s * (fw / 2 - 0.45), arcCy + 0.3, zF - 0.2, 0.9, 0.12);
  }
  // crown ornament on top of the arch
  K.box(trim, 1.6, 0.5, 0.6, 0, arcCy + arcR - 0.15, zF - 0.28);
  K.sphere(gold, 0.32, 0, arcCy + arcR + 0.62, zF - 0.28, 10, 8);
  K.cone(gold, 0.07, 0.9, 0, arcCy + arcR + 0.85, zF - 0.28, 6);
  // name band
  const nameW = Math.min(fw - 2.4, 11.2);
  const nameRect = env.atlas.add(1024, 72, (g, w, h) => {
    g.fillStyle = '#20382f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    drawText(g, (lot.name ?? 'Tinyhaven Central').toUpperCase(), w / 2, h / 2 + 2, 'bold 46px Georgia, "Times New Roman", serif', '#f2d27a', 6);
  });
  signQuad(env.T, nameRect, nameW, nameW * (72 / 1024), 0, 4.46, zF + 0.03, 0, 1);
  // the great clock in the window (live time)
  const clockY = winY + winH - winW / 2 + 1.0;
  const clockR = 1.55;
  const face = new THREE.CircleGeometry(clockR, 40);
  K.geo(M(C.cream, PAT.CLOCK, 0.5, 0, 1.15), face, 0, clockY, zF - 0.14, 0, 'native');
  face.dispose();
  K.torus(gold, clockR + 0.04, 0.08, 0, clockY, zF - 0.12, 6, 40, Math.PI * 2, 0);
  K.box(iron, 0.12, winH * 0.38, 0.12, 0, winY, zF - 0.2);
  // entrance marquise (iron & glass), within the 1.2 m overhang allowance, above 2.4 m
  const cw = 13.2;
  const cy0 = 3.55;
  const cz1 = HD + 1.15;
  K.poly(M('#47584f', PAT.GLAZING, 0.25, 0.3, 0, 0, 0.7), [
    [-cw / 2, cy0 + 0.15, cz1],
    [cw / 2, cy0 + 0.15, cz1],
    [cw / 2, cy0 + 0.5, zF],
    [-cw / 2, cy0 + 0.5, zF],
  ]);
  K.poly(M('#56625c', PAT.PLAIN, 0.6, 0.3), [
    [-cw / 2, cy0 + 0.13, cz1],
    [-cw / 2, cy0 + 0.48, zF],
    [cw / 2, cy0 + 0.48, zF],
    [cw / 2, cy0 + 0.13, cz1],
  ]);
  K.box(iron, cw, 0.32, 0.1, 0, cy0 - 0.12, cz1 - 0.05);
  K.box(iron, cw, 0.08, 0.14, 0, cy0 + 0.12, cz1 - 0.07);
  for (let i = 0; i <= 6; i++) {
    const x = -cw / 2 + (cw * i) / 6;
    K.beam(iron, [x, 2.65, zF], [x, cy0 + 0.1, cz1 - 0.1], 0.07);
    K.beam(iron, [x, cy0 + 0.45, zF], [x, cy0 + 0.15, cz1 - 0.1], 0.07);
    // scalloped valance drops
    if (i < 6) for (let k = 0; k < 4; k++) K.box(iron, 0.06, 0.16, 0.05, x + (cw / 6) * ((k + 0.5) / 4), cy0 - 0.28, cz1 - 0.04);
  }
  // hanging lamps under the marquise
  for (const lx of [-4.4, 0, 4.4]) {
    K.cyl(iron, 0.015, 0.015, 0.5, lx, cy0 - 0.4, HD + 0.55, 4);
    env.L.sphere(LM('#ffe2b0', LMODE.NIGHT, 3.2, 0, 0.15), 0.2, lx, cy0 - 0.55, HD + 0.55, 10, 8);
    K.cone(iron, 0.22, 0.14, lx, cy0 - 0.42, HD + 0.55, 8);
    env.glow(lx, cy0 - 0.55, HD + 0.55, { size: 1.0, kind: 'halo', color: '#ffd59a', intensity: 1.0 });
    env.glow(lx, 0.12, HD + 1.6, { size: 3.4, kind: 'pool', color: '#ffc77e', intensity: 0.42 });
  }

  // ── hall side walls (clerestory above the wings) and glazed barrel vault
  const zB = -HD + 0.13;
  const hallLen = zF - 0.55 - zB;
  for (const s of [-1, 1]) {
    const nWin = 6;
    wall(K, {
      w: hallLen,
      h: ySpring,
      depth: 0.5,
      x: s * HX,
      y: 0,
      z: (zF - 0.55 + zB) / 2,
      ry: (s * Math.PI) / 2,
      mat: stone,
      openings: [],
    });
    void nWin;
    moulding(K, trim, s * HX, (zF - 0.55 + zB) / 2, (s * Math.PI) / 2, hallLen, ySpring - 0.25, 0.28, 0.22);
  }
  barrelVault(K, M('#3d4a45', PAT.GLAZING, 0.2, 0.35, 0.95, 0, 0.1), iron, -HX, HX, zB + 0.2, zF - 0.5, ySpring, rise, 14, 2.15);
  // ridge lantern (monitor roof)
  const crown = ySpring + rise;
  K.box(M('#3d4a45', PAT.GLAZING, 0.2, 0.3, 0.95, 0, 0.6), 1.9, 0.6, hallLen - 2.0, 0, crown - 0.05, (zF - 0.55 + zB) / 2);
  K.gableRoof(zinc, -1.05, 1.05, zB + 1.2, zF - 1.55, crown + 0.55, crown + 0.95, 'z', 0.15, 0.08, iron);

  // back gable (platform side) with a glazed lunette and a second clock
  const backOutline = vaultOutline(fw, ySpring, rise, 0.45);
  const backOpenings: Opening[] = [-3.6, 0, 3.6].map((ax) => ({ x: fw / 2 + ax, y: 0, w: hero && ax === 0 ? 2.6 : 2.8, h: hero && ax === 0 ? 4.0 : 4.2, arch: hero && ax === 0 ? 1.3 : 1.4, fill: hero && ax === 0 ? ('none' as const) : ('door' as const), glow: 0.95, inset: 0.3, surround: trim, surroundW: 0.2, infill: M('#3b4a3f', PAT.DOOR, 0.5, 0.1, 0.95, 0, 0.15) }));
  backOpenings.push({ x: fw / 2, y: 5.6, w: fw - 2.4, h: ySpring + rise - 0.7 - 5.6, arch: rise + 0.6, fill: 'glass', glow: 0.95, inset: 0.3, surround: trim, surroundW: 0.3, infill: M(C.ironGreen, PAT.GLAZING, 0.3, 0.3, 0.95, 0, 0.2) });
  wall(K, { w: fw, h: ySpring + rise + 0.45, depth: 0.5, x: 0, y: 0, z: zB, ry: Math.PI, mat: stone, openings: backOpenings, outline: backOutline });
  moulding(K, trim, 0, zB, Math.PI, fw, 4.5, 0.22, 0.15);
  const backFace = new THREE.CircleGeometry(1.1, 32);
  K.geo(M(C.cream, PAT.CLOCK, 0.5, 0, 1.15), backFace, 0, 9.7, zB - 0.12, Math.PI, 'native');
  backFace.dispose();
  K.torus(gold, 1.14, 0.06, 0, 9.7, zB - 0.1, 6, 32, Math.PI * 2, 0);
  const backName = env.atlas.add(512, 48, (g, w, h) => {
    g.fillStyle = '#20382f';
    g.fillRect(0, 0, w, h);
    drawText(g, (lot.name ?? 'Tinyhaven Central').toUpperCase(), w / 2, h / 2 + 1, 'bold 30px Georgia, serif', '#f2d27a', 3);
  });
  signQuad(env.T, backName, 7.0, 7.0 * (48 / 512), 0, 4.75, zB - 0.03, Math.PI, 1);

  // ── towers flanking the frontispiece
  for (const s of [-1, 1]) {
    const tx = s * (HX + TW / 2);
    const tz0 = HD - 2.4,
      tz1 = HD - 0.02;
    const tzc = (tz0 + tz1) / 2;
    const tH = 15.4;
    // body with openings on the front and the outer side
    const frontO: Opening[] = [
      { x: TW / 2, y: 5.2, w: 0.85, h: 2.8, arch: 0.42, fill: 'window', glow: winGlow, seed: 0.3, surround: trim, surroundW: 0.12 },
      { x: TW / 2, y: 12.9, w: 1.25, h: 2.0, arch: 0.62, fill: 'dark' },
    ];
    wall(K, { w: TW, h: tH, depth: 0.4, x: tx, y: 0, z: tz1, ry: 0, mat: stone, openings: frontO });
    wall(K, { w: tz1 - tz0, h: tH, depth: 0.4, x: tx + s * (TW / 2), y: 0, z: tzc, ry: (s * Math.PI) / 2, mat: stone, openings: [{ x: (tz1 - tz0) / 2, y: 12.9, w: 1.25, h: 2.0, arch: 0.62, fill: 'dark' }] });
    K.coreBox(stone, TW - 0.02, tH, tz1 - tz0 - 0.4, tx, 0, tzc - 0.2);
    // rusticated base + bands
    K.box(stoneRust, TW + 0.08, 4.2, tz1 - tz0 + 0.02, tx, 0, tzc);
    for (const yy of [4.2, 12.4, tH]) K.box(trim, TW + 0.3, 0.26, tz1 - tz0 + 0.24, tx, yy, tzc + 0.05);
    quoins(K, trim, tx + s * (TW / 2), tz1, s, 1, 4.4, 12.3, 0.5);
    // cupola: drum + copper dome + lantern + flag
    const dy = tH + 0.26;
    K.cyl(trim, 0.95, 1.0, 0.5, tx, dy, tzc, 16);
    K.lathe(
      copper,
      [
        [1.05, 0],
        [1.0, 0.35],
        [0.86, 0.85],
        [0.6, 1.3],
        [0.3, 1.6],
        [0.0, 1.72],
      ],
      tx,
      dy + 0.5,
      tzc,
      16,
    );
    K.cyl(trim, 0.22, 0.25, 0.5, tx, dy + 2.15, tzc, 8);
    finial(K, gold, tx, dy + 2.65, tzc, 0.5, 0.1);
    flagpole(env, tx, dy + 2.9, tzc, 1.9, 1.3, 0, s * 1.3, 0.04);
    // night: the belvedere glows faintly
    env.glow(tx, 13.8, tz1 + 0.2, { size: 1.6, kind: 'halo', color: '#ffcf8a', intensity: 0.35 });
  }

  // ── wings
  for (const s of [-1, 1]) {
    const x0 = HX,
      x1 = WX1;
    const wf0 = HX + TW; // visible front wall starts after the tower
    const wW = x1 - wf0;
    const wcx = s * (wf0 + wW / 2);
    const doorX = s * (HW * 0.56); // 13.44 in a 48 m footprint
    // ground floor openings (door at the plan door position)
    const localDoor = Math.abs(doorX) - wf0;
    const g: Opening[] = [];
    const winXs = [localDoor - 2.25, localDoor + 2.25];
    for (const wx of winXs) g.push({ x: s > 0 ? wx : wW - wx, y: 0.85, w: 1.45, h: 3.0, arch: 0.72, fill: 'window', glow: winGlow, seed: 0.62, surround: trim, surroundW: 0.14, keystone: trim, sill: trim });
    g.push({ x: s > 0 ? localDoor : wW - localDoor, y: 0, w: 2.0, h: 3.6, arch: 1.0, fill: 'door', glow: 0.95, seed: 0.2, inset: 0.3, surround: trim, surroundW: 0.2, keystone: trim, infill: M('#3b4a3f', PAT.DOOR, 0.5, 0.1, 0.95, 0, 0.2) });
    const up: Opening[] = [];
    for (const wx of [...winXs, localDoor]) up.push({ x: s > 0 ? wx : wW - wx, y: 0.8, w: 1.3, h: 2.1, fill: 'window', glow: winGlow, seed: 0.35, surround: trim, surroundW: 0.12, sill: trim });
    wall(K, { w: wW, h: 4.5, depth: 0.5, x: wcx, y: 0, z: zW, ry: 0, mat: stoneRust, openings: g });
    wall(K, { w: wW, h: 4.3, depth: 0.5, x: wcx, y: 4.5, z: zW, ry: 0, mat: brick, openings: up });
    moulding(K, trim, wcx, zW, 0, wW, 4.5, 0.25, 0.14);
    moulding(K, trim, wcx, zW, 0, wW, 8.55, 0.32, 0.32);
    moulding(K, granite, wcx, zW, 0, wW, 0, 0.5, 0.08);
    // back wall (platform side): continuous arcade of windows
    const bW = x1 - x0;
    wall(K, {
      w: bW,
      h: 8.8,
      depth: 0.5,
      x: s * (x0 + bW / 2),
      y: 0,
      z: -HD + 0.33,
      ry: Math.PI,
      mat: brick,
      openings: bays(bW, 3, (bx) => [
        { x: bx, y: 0.85, w: 1.5, h: 3.0, arch: 0.75, fill: 'window', glow: winGlow, seed: 0.62, surround: trim, surroundW: 0.12 },
        { x: bx, y: 5.3, w: 1.3, h: 2.1, fill: 'window', glow: winGlow, seed: 0.4, surround: trim, surroundW: 0.1, sill: trim },
      ]),
    });
    moulding(K, trim, s * (x0 + bW / 2), -HD + 0.33, Math.PI, bW, 8.55, 0.32, 0.32);
    moulding(K, trim, s * (x0 + bW / 2), -HD + 0.33, Math.PI, bW, 4.5, 0.25, 0.14);
    // core volume
    K.coreBox(brick, bW, 8.8, 2 * (HD - 0.33) - 1.0, s * (x0 + bW / 2), 0, 0);
    // mansard roof (front + back steep faces, zinc top)
    const rx0 = s > 0 ? x0 : -x1,
      rx1 = s > 0 ? x1 : -x0;
    mansard(K, slate, zinc, rx0, rx1, -HD + 0.0, zW + 0.3, 8.85, 10.9, 0.95, { n: true, s: true, e: false, w: false });
    for (const dx of [-1.6, 1.6]) dormer(K, trim, zinc, wcx + dx, 9.05, zW + 0.27, 1.0, 1.1, 0.9, 0, winGlow, 0.45);
    chimney(K, brick, s * (x0 + bW * 0.35), 10.9, -2.0, 0.7, 0.55, 1.4);
    railing(env, [rx0, 10.9, zW + 0.3 - 0.95], [rx1, 10.9, zW + 0.3 - 0.95], 0.45, C.iron);
    // wall lanterns beside the wing door
    wallLantern(env, K, doorX - 1.45, 2.9, zW + 0.02, 0, 0.8);
    wallLantern(env, K, doorX + 1.45, 2.9, zW + 0.02, 0, 0.8);
    // small canopy over the wing door
    K.poly(M('#47584f', PAT.GLAZING, 0.25, 0.3, 0, 0, 0.7), [
      [doorX - 1.7, 3.95, HD + 1.0],
      [doorX + 1.7, 3.95, HD + 1.0],
      [doorX + 1.7, 4.25, zW],
      [doorX - 1.7, 4.25, zW],
    ]);
    K.box(iron, 3.4, 0.2, 0.08, doorX, 3.78, HD + 0.97);
    // tie rods up to the wall over the arches: as props from below they ran through the lanterns and across the windows (?nocanopyties)
    if (bugOn('canopyties'))
      for (const dx of [-1.6, 1.6]) {
        K.beam(iron, [doorX + dx, 5.05, zW + 0.02], [doorX + dx, 3.98, HD + 0.95], 0.04);
        K.box(iron, 0.14, 0.2, 0.03, doorX + dx, 4.95, zW + 0.015);
      }
    else for (const dx of [-1.6, 1.6]) K.beam(iron, [doorX + dx, 3.0, zW], [doorX + dx, 3.9, HD + 0.95], 0.06);
  }

  // ── end pavilions
  for (const s of [-1, 1]) {
    const x0 = WX1,
      x1 = HW - 0.16;
    const pW = x1 - x0;
    const pcx = s * (x0 + pW / 2);
    const pH = 10.4;
    const po = (xx: number): number => (s > 0 ? xx : pW - xx);
    const front: Opening[] = [];
    for (const fx of [pW * 0.27, pW * 0.73]) {
      front.push({ x: po(fx), y: 0.85, w: 1.55, h: 3.1, arch: 0.78, fill: 'window', glow: winGlow, seed: 0.62, surround: trim, surroundW: 0.14, keystone: trim, sill: trim });
      front.push({ x: po(fx), y: 5.25, w: 1.3, h: 2.2, fill: 'window', glow: winGlow, seed: 0.4, surround: trim, surroundW: 0.12, sill: trim });
    }
    front.push({ x: pW / 2, y: 8.35, w: 1.0, h: 1.1, arch: 0.5, fill: 'window', glow: winGlow, seed: 0.5, surround: trim, surroundW: 0.1 });
    wall(K, { w: pW, h: pH, depth: 0.5, x: pcx, y: 0, z: zP, ry: 0, mat: stone, openings: front });
    // pediments over the first-floor windows
    for (const fx of [pW * 0.27, pW * 0.73]) {
      const wx = s * (x0 + fx);
      K.roofFace(trim, [
        [wx - 0.95, 7.62, zP + 0.14],
        [wx + 0.95, 7.62, zP + 0.14],
        [wx, 8.05, zP + 0.14],
      ]);
      K.box(trim, 1.9, 0.12, 0.16, wx, 7.5, zP + 0.07);
    }
    // outer side wall
    const sideD = 2 * zP;
    wall(K, {
      w: sideD,
      h: pH,
      depth: 0.5,
      x: s * x1,
      y: 0,
      z: 0,
      ry: (s * Math.PI) / 2,
      mat: stone,
      openings: bays(sideD, 4, (bx) => [
        { x: bx, y: 0.85, w: 1.45, h: 3.0, arch: 0.72, fill: 'window', glow: winGlow, seed: 0.62, surround: trim, surroundW: 0.12, sill: trim },
        { x: bx, y: 5.25, w: 1.25, h: 2.1, fill: 'window', glow: winGlow, seed: 0.4, surround: trim, surroundW: 0.1, sill: trim },
      ]),
    });
    // back wall
    wall(K, {
      w: pW,
      h: pH,
      depth: 0.5,
      x: pcx,
      y: 0,
      z: -zP,
      ry: Math.PI,
      mat: stone,
      openings: bays(pW, 2, (bx) => [
        { x: bx, y: 0.85, w: 1.5, h: 3.0, arch: 0.75, fill: 'window', glow: winGlow, seed: 0.62, surround: trim, surroundW: 0.12 },
        { x: bx, y: 5.25, w: 1.3, h: 2.1, fill: 'window', glow: winGlow, seed: 0.4, surround: trim, surroundW: 0.1, sill: trim },
      ]),
    });
    K.coreBox(stone, pW - 1.0, pH, sideD - 1.0, pcx, 0, 0);
    // bands, rustication, quoins, cornice
    K.box(stoneRust, pW + 0.04, 0.5, sideD + 0.04, pcx, 0, 0);
    for (const yy of [4.5, 7.95]) {
      moulding(K, trim, pcx, zP, 0, pW, yy, 0.22, 0.14);
      moulding(K, trim, s * x1, 0, (s * Math.PI) / 2, sideD, yy, 0.22, 0.14);
    }
    K.box(trim, pW + 0.7, 0.42, sideD + 0.7, pcx, pH - 0.15, 0);
    quoins(K, trim, s * x1, zP, s, 1, 0.5, pH - 0.2, 0.55);
    quoins(K, trim, s * x0, zP, -s, 1, 0.5, pH - 0.2, 0.55);
    // pavilion mansard + pyramid + cresting + lantern finial
    const ry0 = pH + 0.27;
    mansard(K, slate, slate, pcx - pW / 2 - 0.2, pcx + pW / 2 + 0.2, -zP - 0.25, zP + 0.25, ry0, ry0 + 2.5, 1.05, { n: true, s: true, e: true, w: true }, ry0 + 3.6);
    dormer(K, trim, zinc, pcx, ry0 + 0.35, zP + 0.12, 1.1, 1.2, 1.0, 0, winGlow, 0.5);
    dormer(K, trim, zinc, s * (x1 + 0.08), ry0 + 0.35, 0, 1.1, 1.2, 1.0, (s * Math.PI) / 2, winGlow, 0.5);
    finial(K, gold, pcx, ry0 + 3.55, 0, 1.0, 0.12);
    chimney(K, brick, pcx + s * 1.6, ry0 + 2.5, -3.2, 0.6, 0.6, 1.4);
    // date stone + wall lantern on the corner
    wallLantern(env, K, s * (x1 - 0.6), 3.2, zP + 0.02, 0, 0.75);
  }

  if (hero)
    buildStationRoom(env, env.rooms!, {
      HX, zF, zB, ySpring, rise, cx, cz, yaw,
      winF: { w: winW, y: winY, h: winH, arch: winW / 2 },
      winB: { w: fw - 2.4, y: 5.6, h: ySpring + rise - 0.7 - 5.6, arch: rise + 0.6 },
    });
  else if (boxHunt(env.ctx, 'interiors')) stationInterior(env, HX, zB, zF - 0.55, ySpring);

  // ── uplight pools in front of the facade (night)
  for (const gx of [-HW + 3.5, -11, 11, HW - 3.5]) env.glow(gx * sx, 0.1, HD + 0.6, { size: 2.6, kind: 'pool', color: '#ffbf75', intensity: 0.22 });
  env.glow(0, 9.2, HD + 0.3, { size: 6.0, kind: 'halo', color: '#ffcf8f', intensity: 0.16 });

  env.endChecks();
  const box = env.boxLocal(-HW, 0, -HD, HW, crown + 2, HD);
  env.pick(lot.id, lot.name ?? 'Central Station', box, () => {
    const h = env.hours();
    const open = h >= 5 && h < 24.5;
    const nextMin = 60 - Math.floor((h % 1) * 60);
    return ['Grand station hall · opened 1889', open ? `Departures every 15 min · next in ${nextMin % 15 || 15} min` : 'Closed for the night', 'The great clock keeps city time'];
  });
}


/**
 * Box hunt (?nointeriors): the booking hall furnished for the free camera — a mosaic floor with a compass rose, the
 * timber booking office with three windows under a TICKETS board, a departures board hanging over the platform
 * doors, a two-faced clock, back-to-back benches, the station café with its counter and tables, globe pendants.
 */
function stationInterior(env: Env, HX: number, zB: number, zFr: number, ySpring: number): void {
  const D = env.D;
  const iw = HX - 0.27;
  const z0 = zB + 0.27,
    z1 = zFr - 0.05;
  const zc = (z0 + z1) / 2;
  const L = z1 - z0;
  const wood = M('#5b3a22', PAT.PLANKS, 0.7);
  const woodDark = M('#3c2617', PAT.PLAIN, 0.7);
  const brass = M('#c49a45', PAT.PLAIN, 0.35, 0.8);
  const marble = M('#e3ddd0', PAT.PLAIN, 0.35);
  const glass = M('#2b3a3f', PAT.PLAIN, 0.1, 0.3);
  const iron = S.iron();
  // floor + compass rose
  D.box(M('#d3cab8', PAT.TILES, 0.6, 0, 0, 0, 0.5), iw * 2, 0.03, L, 0, 0, zc);
  D.cyl(M('#7d5a3c', PAT.PLAIN, 0.5), 1.7, 1.7, 0.012, 0, 0.03, zc, 32);
  D.cyl(M('#e9e1cf', PAT.PLAIN, 0.5), 1.45, 1.45, 0.014, 0, 0.03, zc, 32);
  D.cyl(M('#2f4a5a', PAT.PLAIN, 0.5), 0.5, 0.5, 0.016, 0, 0.03, zc, 24);
  for (let i = 0; i < 4; i++) D.box(M('#2f4a5a', PAT.PLAIN, 0.5), 0.18, 0.016, 2.7, 0, 0.03, zc, (i * Math.PI) / 4);
  // booking office along the west wall: timber front, three windows with brass grilles and marble ledges
  const ox = -iw + 0.85;
  D.box(wood, 1.7, 2.8, 5.2, ox, 0, zc);
  D.box(woodDark, 1.8, 0.2, 5.3, ox, 2.8, zc);
  const fx = ox + 0.86;
  for (let i = -1; i <= 1; i++) {
    const z = zc + i * 1.6;
    D.box(glass, 0.02, 0.85, 1.05, fx, 1.1, z);
    for (let k = -2; k <= 2; k++) D.box(brass, 0.015, 0.85, 0.012, fx + 0.015, 1.1, z + k * 0.2);
    D.box(marble, 0.34, 0.05, 1.2, fx + 0.1, 1.02, z);
    D.box(woodDark, 0.04, 0.06, 1.25, fx + 0.01, 1.98, z);
  }
  const tickets = env.atlas.add(256, 48, (g, w, h) => {
    g.fillStyle = '#1f3a2c';
    g.fillRect(0, 0, w, h);
    drawText(g, 'TICKETS', w / 2, h / 2 + 1, 'bold 32px Georgia, serif', '#f2d27a', 4);
  });
  signQuad(env.T, tickets, 2.4, 2.4 * (48 / 256), fx + 0.02, 2.45, zc, Math.PI / 2, 0.6);
  // departures board hanging over the platform doors, facing the entrance
  const bz = z0 + 1.6;
  D.box(M('#151719', PAT.PLAIN, 0.5), 3.6, 1.25, 0.14, 0, 3.9, bz);
  for (const sx of [-1.4, 1.4]) D.box(iron, 0.03, ySpring - 5.15, 0.03, sx, 5.15, bz);
  const board = env.atlas.add(512, 176, (g, w) => {
    g.fillStyle = '#0d0f10';
    g.fillRect(0, 0, w, 176);
    drawText(g, 'DEPARTURES', w / 2, 20, 'bold 24px Arial, sans-serif', '#f4f1e6', 2);
    const rows = [
      ['10:42', 'Harbour & Beach', '1'],
      ['10:51', 'Westbrook', '2'],
      ['11:05', 'Riverside', '1'],
      ['11:12', 'Old Town', '2'],
      ['11:20', 'Stadium', '1'],
    ];
    g.font = 'bold 21px Consolas, monospace';
    g.textBaseline = 'middle';
    rows.forEach(([t, dest, pl], i) => {
      const y = 50 + i * 26;
      g.fillStyle = '#ffb43a';
      g.textAlign = 'left';
      g.fillText(t, 14, y);
      g.fillText(dest, 96, y);
      g.textAlign = 'right';
      g.fillText(pl, w - 16, y);
    });
    g.textAlign = 'left';
  });
  signQuad(env.T, board, 3.4, 3.4 * (176 / 512), 0, 4.53, bz + 0.075, 0, 0.9);
  // two-faced clock hanging in the middle of the hall
  D.box(iron, 0.04, ySpring - 4.8, 0.04, 0, 4.8, zc);
  D.cyl(brass, 0.62, 0.62, 0.22, 0, 3.9, zc, 28);
  for (const f of [1, -1]) {
    const face = new THREE.CircleGeometry(0.56, 28);
    env.S.geo(M(C.cream, PAT.CLOCK, 0.5, 0, 1.15), face, 0, 4.15, zc + f * 0.115, f > 0 ? 0 : Math.PI, 'native');
    face.dispose();
  }
  // benches back to back between the door axes (wood slats on iron ends)
  for (const sx of [-1.75, 1.75])
    for (const side of [-1, 1]) {
      const bx2 = sx + side * 0.33;
      for (let k = 0; k < 4; k++) D.box(wood, 0.09, 0.03, 3.2, bx2 + side * (k * 0.1 - 0.15), 0.44, zc + 0.6);
      D.box(wood, 0.03, 0.42, 3.2, sx + side * 0.06, 0.5, zc + 0.6);
      for (const e of [-1.4, 0, 1.4]) D.box(iron, 0.5, 0.44, 0.05, bx2, 0, zc + 0.6 + e);
    }
  // station café on the east wall: counter with a marble top, coffee machine, cake dome, striped awning, tables
  const cx = iw - 0.75;
  D.box(wood, 0.7, 1.02, 3.4, cx, 0, zc);
  D.box(marble, 0.8, 0.05, 3.5, cx, 1.02, zc);
  D.box(M('#a9aeb2', PAT.PLAIN, 0.3, 0.8), 0.45, 0.45, 0.6, cx + 0.05, 1.07, zc - 1.0);
  D.cyl(glass, 0.22, 0.22, 0.3, cx - 0.05, 1.07, zc + 0.6, 12);
  D.box(M('#2e5b44', PAT.STRIPES, 0.8), 1.1, 0.04, 3.6, cx - 0.1, 2.55, zc, 0);
  D.box(woodDark, 0.06, 1.2, 3.5, iw - 0.05, 1.3, zc);
  const cafe = env.atlas.add(256, 48, (g, w, h) => {
    g.fillStyle = '#2e5b44';
    g.fillRect(0, 0, w, h);
    drawText(g, 'STATION CAFE', w / 2, h / 2 + 1, 'bold 26px Georgia, serif', '#f6efe0', 2);
  });
  signQuad(env.T, cafe, 2.2, 2.2 * (48 / 256), iw - 0.02, 2.9, zc, -Math.PI / 2, 0.6);
  for (const tz of [zc - 1.1, zc + 1.2]) {
    const tx = cx - 1.7;
    D.cyl(iron, 0.05, 0.2, 0.72, tx, 0, tz, 8);
    D.cyl(marble, 0.36, 0.36, 0.04, tx, 0.72, tz, 16);
    for (const a of [1.2, 1.2 + Math.PI]) {
      const chx = tx + Math.sin(a) * 0.6,
        chz = tz + Math.cos(a) * 0.6;
      D.box(woodDark, 0.38, 0.04, 0.38, chx, 0.45, chz, a);
      D.box(woodDark, 0.36, 0.45, 0.04, chx + Math.sin(a) * 0.18, 0.47, chz + Math.cos(a) * 0.18, a);
      for (const lx of [-0.15, 0.15]) for (const lz of [-0.15, 0.15]) D.box(iron, 0.025, 0.45, 0.025, chx + lx, 0, chz + lz);
    }
  }
  // globe pendants on long rods from the vault
  for (const px of [-3.6, 3.6])
    for (const pz of [z0 + 2.4, zc + 0.2, z1 - 2.2]) {
      D.box(iron, 0.02, ySpring - 5.4, 0.02, px, 5.4, pz);
      env.L.sphere(LM('#ffe2b0', LMODE.ALWAYS, 1.3, px * 0.1), 0.26, px, 5.2, pz, 10, 8);
      env.glow(px, 5.2, pz, { size: 1.5, kind: 'halo', color: '#ffe2b0', intensity: 0.35 });
      env.glow(px, 0.14, pz, { size: 4.0, kind: 'pool', color: '#ffd9a0', intensity: 0.16 });
    }
  // a direction sign over the platform doors
  const plat = env.atlas.add(256, 40, (g, w, h) => {
    g.fillStyle = '#1d2d4a';
    g.fillRect(0, 0, w, h);
    drawText(g, 'TO THE TRAINS', w / 2, h / 2 + 1, 'bold 22px Arial, sans-serif', '#ffffff', 2);
  });
  signQuad(env.T, plat, 2.0, 2.0 * (40 / 256), 3.6, 4.7, z0 + 0.05, 0, 0.5);
  // railway travel posters in gilt frames on the entrance wall, a WAY OUT sign over the doors
  const poster = (sky: string, sea: string, land: string, title: string, sub: string, sail: boolean) =>
    env.atlas.add(80, 120, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h * 0.6);
      gr.addColorStop(0, sky);
      gr.addColorStop(1, '#fbe3b0');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f7c948';
      g.beginPath();
      g.arc(w * 0.7, h * 0.3, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = sea;
      g.fillRect(0, h * 0.52, w, h * 0.2);
      g.fillStyle = land;
      g.beginPath();
      g.moveTo(0, h * 0.72);
      g.quadraticCurveTo(w * 0.35, h * 0.5, w * 0.55, h * 0.62);
      g.lineTo(w, h * 0.58);
      g.lineTo(w, h * 0.8);
      g.lineTo(0, h * 0.8);
      g.fill();
      if (sail) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(w * 0.3, h * 0.36);
        g.lineTo(w * 0.3, h * 0.55);
        g.lineTo(w * 0.42, h * 0.55);
        g.fill();
      } else {
        g.fillStyle = '#f4efe2';
        g.fillRect(w * 0.18, h * 0.38, 6, h * 0.2);
        g.fillStyle = '#c0392b';
        g.fillRect(w * 0.18, h * 0.44, 6, 4);
      }
      g.fillStyle = '#1d2d4a';
      g.fillRect(0, h * 0.8, w, h * 0.2);
      drawText(g, title, w / 2, h * 0.86, 'bold 11px Georgia, serif', '#f6efe0', 1);
      drawText(g, sub, w / 2, h * 0.95, '7px Arial, sans-serif', '#f2d27a', 1);
    });
  const posters = [
    poster('#7fb6d9', '#2f6f9e', '#d8c38a', 'TINYHAVEN', 'by the sea', true),
    poster('#9ac3cf', '#356b85', '#6f8f4e', 'LIGHTHOUSE', 'cliff walks', false),
  ];
  const pz = z1 - 0.03;
  [-1, 1].forEach((sx, i) => {
    const px = sx * (iw - 2.6);
    D.box(brass, 1.08, 1.56, 0.04, px, 1.25, pz);
    signQuad(env.T, posters[i], 0.96, 1.44, px, 2.03, pz - 0.03, Math.PI, 0);
  });
  const wayOut = env.atlas.add(192, 40, (g, w, h) => {
    g.fillStyle = '#f2c94c';
    g.fillRect(0, 0, w, h);
    drawText(g, 'WAY OUT', w / 2, h / 2 + 1, 'bold 24px Arial, sans-serif', '#1a1a1a', 2);
  });
  signQuad(env.T, wayOut, 1.5, 1.5 * (40 / 192), 0, 4.2, z1 - 0.06, Math.PI, 0.5);
  // ticket machines beside the booking office: housing, lit screen, card slot, a brass name plate
  for (const dz of [-3.3, 3.3]) {
    const mx = ox + 0.45,
      mz = zc + dz;
    D.box(M('#b8322b', PAT.PLAIN, 0.4, 0.2), 0.6, 1.65, 0.55, mx, 0, mz);
    D.box(M('#2a2d30', PAT.PLAIN, 0.3), 0.04, 0.4, 0.38, mx + 0.31, 1.15, mz);
    env.L.box(LM('#bfe3ff', LMODE.ALWAYS, 0.9, dz), 0.012, 0.32, 0.3, mx + 0.335, 1.19, mz);
    D.box(M('#1b1d20', PAT.PLAIN, 0.4), 0.05, 0.08, 0.2, mx + 0.31, 0.8, mz);
    D.boxC(M('#2a2d30', PAT.PLAIN, 0.4), 0.18, 0.05, 0.44, mx + 0.26, 1.45, mz, 0, 0, 0.4);
  }
}
