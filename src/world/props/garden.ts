// Back-garden kit models (placed by gardenPlan.ts): patio table sets, parasols, BBQs, sheds,
// trampolines, pools, swing sets, washing lines, raised vegetable beds, greenhouses, compost,
// wheelie bins, play houses, sandpits, loungers, bird baths, toys, fire pits, kennels.
//
// Local frame as in furniture.ts: origin on the ground at the item centre, +Y up, +Z = the item's
// front. Items fit their planned footprint (w along local x, d along local z).
// `k` is the kit the item goes to; big silhouettes are built into `ks` (the shadow-casting kit)
// where a builder takes one. Glass panes go to `g`.

import { shapeOn } from '../../core/sweepshape';
import * as CK from '../vegetation/cropkit';
import type { Rng } from '../../core/rng';
import { Kit } from './furniture';
import { cbox, lathe, smoothLathe, softBlob } from './shapes';

const TAU = Math.PI * 2;

export const CANVAS = ['#d9473f', '#2f7fb8', '#f0e6d2', '#3f8f5a', '#e8a33c', '#8a5aa8', '#e86a8a', '#2a9d8f'];
const CUSHION = ['#f1e7d3', '#7da3c4', '#c95f4a', '#8ab07a', '#e8c35a', '#5f6b74'];
const SHED_PAINT = ['#6f8f6a', '#5d7f99', '#a85a46', '#9a7650', '#d9cfb4', '#4f5b63', '#c9a35a'];
const PLAY = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e9c46a', '#8d6cab'];

// ────────────────────────────────────────────────────────────── seating ──

/** Garden chair facing +Z at (0,0,0). */
function chair(k: Kit, frame: string, mat: 'wood' | 'plastic' | 'iron', cushion: string | null): void {
  const sh = k.sh;
  k.m(frame, mat);
  if (shapeOn('shapegarden')) {
    // legs that splay, back legs that run on up and rake back into the uprights, a seat with soft edges, a shaped top rail and a slat
    for (const x of [-0.2, 0.2]) {
      sh.tube(x * 1.08, 0, 0.21, x, 0.42, 0.17, 0.016, 0.019, 6);
      sh.tube(x * 1.08, 0, -0.25, x, 0.42, -0.17, 0.016, 0.019, 6);
      sh.tube(x, 0.42, -0.17, x * 0.96, 0.9, -0.25, 0.019, 0.015, 6);
    }
    if (mat === 'wood') for (let i = 0; i < 5; i++) cbox(sh, 0, 0.43, -0.17 + i * 0.087, 0.44, 0.022, 0.078, 0.005, 1);
    else cbox(sh, 0, 0.43, 0, 0.45, 0.034, 0.43, 0.014, 1);
    sh.box(0, 0.385, 0.17, 0.38, 0.05, 0.016, 0);
    sh.box(0, 0.385, -0.17, 0.38, 0.05, 0.016, 0);
    sh.push().local(0, 0.84, -0.238, -0.16);
    cbox(sh, 0, 0, 0, 0.42, 0.1, 0.024, 0.01, 0);
    sh.pop();
    sh.push().local(0, 0.66, -0.208, -0.16).box(0, 0, 0, 0.39, 0.06, 0.016, 0).pop();
    if (cushion) {
      k.m(cushion, 'rubber');
      softBlob(sh, 0, 0.47, 0.01, 0.2, 0.03, 0.19, 0.32, 0.6, 0.02, 11, 5, 10);
    }
    return;
  }
  for (const x of [-0.2, 0.2]) {
    sh.box(x, 0.21, 0.17, 0.035, 0.42, 0.035, 1);
    sh.box(x, 0.46, -0.19, 0.035, 0.92, 0.035, 1);
  }
  sh.box(0, 0.43, 0, 0.44, 0.04, 0.42, 0);
  sh.push().local(0, 0.7, -0.2, -0.12);
  sh.box(0, 0, 0, 0.44, 0.34, 0.03, 0);
  sh.pop();
  if (cushion) {
    k.m(cushion, 'rubber');
    sh.box(0, 0.475, 0.01, 0.4, 0.05, 0.38, 1);
  }
}

/** Patio table with four chairs (fits 2 x 2 m). */
export function tableSet(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const style = rng.int(0, 2);
  const frame = style === 0 ? '#f2f0ea' : style === 1 ? '#8a5b3a' : '#2c3033';
  const mat = style === 0 ? 'plastic' : style === 1 ? 'wood' : 'iron';
  const round = rng.chance(0.5);
  k.m(frame, mat);
  const shaped = shapeOn('shapegarden');
  if (round && shaped) {
    // a turned pedestal on a spread foot, a top with a soft rim
    smoothLathe(sh, 0, 0, [[0.27, 0.0], [0.27, 0.02], [0.14, 0.05], [0.045, 0.12], [0.032, 0.35], [0.038, 0.66], [0.09, 0.7]], 12);
    smoothLathe(sh, 0, 0, [[0.47, 0.7], [0.5, 0.71], [0.505, 0.725], [0.495, 0.74], [0.0, 0.74]], 28);
  } else if (shaped) {
    for (const [x, z] of [
      [-0.5, -0.36],
      [0.5, -0.36],
      [0.5, 0.36],
      [-0.5, 0.36],
    ])
      sh.tube(x * 1.04, 0, z * 1.06, x, 0.7, z, 0.017, 0.024, 6);
    for (const z of [-0.36, 0.36]) sh.box(0, 0.67, z, 1.0, 0.06, 0.018, 0);
    for (const x of [-0.5, 0.5]) sh.box(x, 0.67, 0, 0.018, 0.06, 0.72, 0);
    if (mat === 'wood') for (let i = 0; i < 6; i++) cbox(sh, 0, 0.73, -0.36 + i * 0.144, 1.2, 0.03, 0.134, 0.006, 1);
    else cbox(sh, 0, 0.73, 0, 1.2, 0.036, 0.85, 0.014, 1);
  } else if (round) {
    sh.cyl(0, 0, 0, 0.22, 0.05, 0.7, 6, 0);
    sh.cyl(0, 0.7, 0, 0.5, 0.5, 0.04, 12, 3);
  } else {
    for (const [x, z] of [
      [-0.5, -0.36],
      [0.5, -0.36],
      [0.5, 0.36],
      [-0.5, 0.36],
    ])
      sh.box(x, 0.36, z, 0.05, 0.72, 0.05, 1);
    sh.box(0, 0.73, 0, 1.2, 0.04, 0.85, 0);
  }
  const cushion = style !== 0 && rng.chance(0.7) ? rng.pick(CUSHION) : null;
  const seats: [number, number, number][] = round
    ? [
        [0, 0.78, Math.PI],
        [0, -0.78, 0],
        [0.78, 0, -Math.PI / 2],
        [-0.78, 0, Math.PI / 2],
      ]
    : [
        [-0.3, 0.72, Math.PI],
        [0.32, 0.72, Math.PI],
        [-0.3, -0.72, 0],
        [0.3, -0.72, 0],
      ];
  for (const [x, z, yaw] of seats) {
    sh.push().local(x + rng.range(-0.04, 0.04), 0, z, 0, yaw + rng.range(-0.15, 0.15));
    chair(k, frame, mat, cushion);
    sh.pop();
  }
  // something on the table; a candle lantern on some (warm glow after dusk)
  k.m(rng.pick(['#e9e4d8', '#7aa0c8', '#d9473f']), 'ceramic');
  sh.cyl(rng.range(-0.15, 0.15), round ? 0.74 : 0.75, rng.range(-0.1, 0.1), 0.08, 0.06, 0.12, shaped ? 12 : 6, 2);
  if (rng.chance(0.55)) {
    const ty = round ? 0.74 : 0.75;
    k.m('#2c3033', 'iron');
    sh.box(0.12, ty + 0.01, 0.12, 0.12, 0.02, 0.12, 1);
    k.e('#ffe2a8', '#ffb35c', 2.2, 0);
    sh.box(0.12, ty + 0.09, 0.12, 0.09, 0.14, 0.09, 1);
    k.m('#2c3033', 'iron');
    sh.box(0.12, ty + 0.17, 0.12, 0.12, 0.02, 0.12, 0);
  }
}

/** Rattan corner sofa + armchair + coffee table (fits 2.6 x 1.9 m). */
export function loungeSet(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const rattan = rng.pick(['#5a4232', '#3f3a36', '#8c7a62']);
  const cush = rng.pick(CUSHION);
  if (shapeOn('shapegarden')) {
    // woven frames with soft edges on short feet, a band round the middle; cushions you could sit on
    const seat = (cx: number, cz: number, w: number, d: number, yaw: number) => {
      sh.push().local(cx, 0, cz, 0, yaw);
      k.m(rattan, 'wood');
      cbox(sh, 0, 0.23, 0, w, 0.32, d, 0.035);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.cyl(sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.022, 0.02, 0.08, 6, 0);
      cbox(sh, 0, 0.52, -d / 2 + 0.07, w, 0.42, 0.14, 0.04, 1);
      for (const s of [-1, 1]) cbox(sh, s * (w / 2 - 0.07), 0.3, 0, 0.14, 0.46, d, 0.04, 1);
      k.s.r *= 0.7;
      k.s.g *= 0.7;
      k.s.b *= 0.7;
      sh.box(0, 0.26, d / 2 + 0.001, w - 0.05, 0.012, 0.002, 0);
      k.m(cush, 'rubber');
      const seats = Math.max(1, Math.round((w - 0.3) / 0.55)),
        cw = (w - 0.3) / seats;
      for (let i = 0; i < seats; i++) {
        const x = (i - (seats - 1) / 2) * cw;
        softBlob(sh, x, 0.44, 0.05, cw * 0.5, 0.075, (d - 0.16) * 0.47, 0.32, 0.6, 0.012, i + cx * 9, 6, 12);
        sh.push().local(x, 0.66, -d / 2 + 0.2, -0.22);
        softBlob(sh, 0, 0, 0, cw * 0.47, 0.2, 0.07, 0.32, 0.6, 0.012, i * 3 + cz * 7, 6, 12);
        sh.pop();
      }
      sh.pop();
    };
    seat(-0.2, -0.6, 2.0, 0.75, 0);
    seat(1.05, 0.35, 0.8, 0.72, -Math.PI / 2);
    k.m(rattan, 'wood');
    cbox(sh, -0.2, 0.18, 0.35, 0.9, 0.36, 0.55, 0.03);
    k.m('#cfd6d8', 'glass');
    sh.box(-0.2, 0.37, 0.35, 0.86, 0.02, 0.5, 0);
    return;
  }
  // sofa along the back (-z), facing +z
  k.m(rattan, 'wood');
  sh.box(-0.2, 0.2, -0.6, 2.0, 0.4, 0.75, 1);
  sh.box(-0.2, 0.52, -0.92, 2.0, 0.42, 0.14, 1);
  sh.box(-1.13, 0.3, -0.6, 0.14, 0.6, 0.75, 1);
  sh.box(0.73, 0.3, -0.6, 0.14, 0.6, 0.75, 1);
  k.m(cush, 'rubber');
  sh.box(-0.2, 0.44, -0.56, 1.72, 0.1, 0.62, 1);
  for (const x of [-0.75, -0.2, 0.35]) sh.push().local(x, 0.66, -0.8, -0.25).box(0, 0, 0, 0.5, 0.36, 0.12, 0).pop();
  // armchair at the side, facing the table
  sh.push().local(1.05, 0, 0.35, 0, -Math.PI / 2);
  k.m(rattan, 'wood');
  sh.box(0, 0.2, 0, 0.75, 0.4, 0.72, 1);
  sh.box(0, 0.5, -0.3, 0.75, 0.4, 0.12, 1);
  k.m(cush, 'rubber');
  sh.box(0, 0.44, 0.03, 0.62, 0.1, 0.6, 1);
  sh.pop();
  // coffee table
  k.m(rattan, 'wood');
  sh.box(-0.2, 0.18, 0.35, 0.9, 0.36, 0.55, 1);
  k.m('#cfd6d8', 'glass');
  sh.box(-0.2, 0.37, 0.35, 0.86, 0.02, 0.5, 0);
}

/** Market parasol: pole + eight-panel canvas (alternating colours), radius r. */
export function parasol(k: Kit, rng: Rng, r = 1.3, h = 2.35, colors?: [string, string]): void {
  const sh = k.sh;
  const c0 = colors?.[0] ?? rng.pick(CANVAS);
  const c1 = colors?.[1] ?? (rng.chance(0.5) ? '#f4efe4' : c0);
  // wind sway pivot = the foot of the pole (only kits whose sink carries aSway — the props casters)
  const sway = k.s.ex.length > 2;
  if (sway) {
    const me = sh.m.elements;
    k.s.setEx(2, me[12], me[13], me[14], 0.0065);
  }
  if (shapeOn('shapegarden')) {
    parasolShaped(k, r, h, c0, c1);
    if (sway) k.s.setEx(2, 0, 0, 0, 0);
    return;
  }
  k.m('#3b3f42', 'iron');
  sh.cyl(0, 0, 0, 0.22, 0.2, 0.06, 8, 2);
  sh.cyl(0, 0.06, 0, 0.025, 0.025, h - 0.06, 5, 0);
  // canvas: 8 sloped triangles, each panel its own colour; plus a scalloped valance
  const n = 8,
    top = h + 0.32,
    rim = h - 0.02;
  const s = k.s;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU,
      a1 = ((i + 1) / n) * TAU,
      am = (a0 + a1) / 2;
    k.m(i % 2 ? c1 : c0, 'plastic');
    const nx = Math.cos(am) * 0.32,
      nz = Math.sin(am) * 0.32,
      ny = r;
    const l = Math.hypot(nx, ny, nz);
    const apex = sh.v(0, top, 0, nx / l, ny / l, nz / l);
    const pa = sh.v(Math.cos(a0) * r, rim, Math.sin(a0) * r, nx / l, ny / l, nz / l);
    const pb = sh.v(Math.cos(a1) * r, rim, Math.sin(a1) * r, nx / l, ny / l, nz / l);
    s.tri(apex, pb, pa);
    // underside (darker, facing down)
    k.m(i % 2 ? c1 : c0, 'plastic');
    s.color(i % 2 ? c1 : c0);
    s.r *= 0.55;
    s.g *= 0.55;
    s.b *= 0.55;
    const ua = sh.v(0, top - 0.02, 0, 0, -1, 0),
      ub = sh.v(Math.cos(a0) * r, rim - 0.02, Math.sin(a0) * r, 0, -1, 0),
      uc = sh.v(Math.cos(a1) * r, rim - 0.02, Math.sin(a1) * r, 0, -1, 0);
    s.tri(ua, ub, uc);
    // valance flap
    k.m(i % 2 ? c1 : c0, 'plastic');
    const ox = Math.cos(am),
      oz = Math.sin(am);
    const v0 = sh.v(Math.cos(a0) * r, rim, Math.sin(a0) * r, ox, 0, oz),
      v1 = sh.v(Math.cos(a1) * r, rim, Math.sin(a1) * r, ox, 0, oz),
      v2 = sh.v(Math.cos(a1) * r, rim - 0.16, Math.sin(a1) * r, ox, 0, oz),
      v3 = sh.v(Math.cos(a0) * r, rim - 0.16, Math.sin(a0) * r, ox, 0, oz);
    s.quad(v0, v3, v2, v1);
  }
  k.m('#3b3f42', 'iron');
  sh.cyl(0, top - 0.02, 0, 0.04, 0.02, 0.1, 5, 2);
  if (sway) k.s.setEx(2, 0, 0, 0, 0);
}

/** A parasol as it is made (?noshapegarden): cloth drawn in between eight ribs and belling down to the rim, ribs and stretchers on a runner under it, a scalloped valance, a turned base. */
function parasolShaped(k: Kit, r: number, h: number, c0: string, c1: string): void {
  const sh = k.sh,
    s = k.s;
  k.m('#3b3f42', 'iron');
  smoothLathe(sh, 0, 0, [[0.23, 0], [0.23, 0.025], [0.19, 0.05], [0.06, 0.08], [0.034, 0.12]], 14);
  sh.cyl(0, 0.08, 0, 0.022, 0.022, h - 0.08, 8, 0);
  sh.cyl(0, h - 0.5, 0, 0.034, 0.034, 0.1, 8, 3);
  const n = 8,
    top = h + 0.32,
    rim = h - 0.02,
    sag = 0.065;
  const P = (a: number, t: number, d: number): number[] => {
    const rr = r * t * (1 - d * t);
    return [Math.cos(a) * rr, top - (top - rim) * Math.pow(t, 1.7), Math.sin(a) * rr];
  };
  const V = (a: number, t: number, d: number): number => {
    const p = P(a, t, d);
    const sl = ((top - rim) * 1.7 * Math.pow(Math.max(t, 0.05), 0.7)) / r;
    const l = Math.hypot(sl, 1);
    return sh.v(p[0], p[1], p[2], (Math.cos(a) * sl) / l, 1 / l, (Math.sin(a) * sl) / l);
  };
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU,
      a1 = ((i + 1) / n) * TAU,
      am = (a0 + a1) / 2;
    const col = i % 2 ? c1 : c0;
    k.m(col, 'plastic');
    for (const [aL, dL, aR, dR] of [
      [a0, 0, am, sag],
      [am, sag, a1, 0],
    ]) {
      const apex = V(0, 0.001, 0);
      const A1 = V(aL, 0.55, dL),
        B1 = V(aR, 0.55, dR),
        A2 = V(aL, 1, dL),
        B2 = V(aR, 1, dR);
      s.tri(apex, B1, A1);
      s.tri(B1, B2, A2);
      s.tri(B1, A2, A1);
      // the valance, its lower edge scalloped
      const pL = P(aL, 1, dL),
        pR = P(aR, 1, dR);
      const nL = sh.v(pL[0], pL[1], pL[2], Math.cos(aL), 0, Math.sin(aL)),
        nR = sh.v(pR[0], pR[1], pR[2], Math.cos(aR), 0, Math.sin(aR)),
        bL = sh.v(pL[0], pL[1] - (dL ? 0.075 : 0.14), pL[2], Math.cos(aL), 0, Math.sin(aL)),
        bR = sh.v(pR[0], pR[1] - (dR ? 0.075 : 0.14), pR[2], Math.cos(aR), 0, Math.sin(aR));
      s.quad(nL, bL, bR, nR);
    }
    // the cloth from underneath
    s.color(col);
    s.r *= 0.55;
    s.g *= 0.55;
    s.b *= 0.55;
    const ua = sh.v(0, top - 0.02, 0, 0, -1, 0),
      ub = sh.v(Math.cos(a0) * r, rim - 0.02, Math.sin(a0) * r, 0, -1, 0),
      uc = sh.v(Math.cos(a1) * r, rim - 0.02, Math.sin(a1) * r, 0, -1, 0);
    s.tri(ua, ub, uc);
    // rib, stretcher
    k.m('#c7ccd0', 'steel');
    const ca = Math.cos(a0),
      sa = Math.sin(a0);
    sh.tube(0, top - 0.04, 0, ca * r * 0.98, rim - 0.035, sa * r * 0.98, 0.007, 0.006, 3);
    sh.tube(0, h - 0.42, 0, ca * r * 0.45, top - 0.04 - (top - rim) * 0.45, sa * r * 0.45, 0.006, 0.006, 3);
  }
  k.m('#3b3f42', 'iron');
  sh.cyl(0, top - 0.02, 0, 0.04, 0.012, 0.1, 8, 2);
}

/** Kettle BBQ or a small gas grill. */
/** Kettle or cart barbecue; returns the local height of the grill top (smoke origin). */
export function bbq(k: Kit, rng: Rng): number {
  const sh = k.sh;
  if (rng.chance(0.6)) {
    k.m('#202224', 'iron');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.3;
      sh.beam(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24, Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12, 0.025, 0.025);
    }
    sh.ellipsoid(0, 0.72, 0, 0.29, 0.17, 0.29, 1);
    sh.cyl(0, 0.84, 0, 0.03, 0.03, 0.06, 5, 2);
    k.m('#8a9399', 'steel');
    sh.box(0, 0.35, 0, 0.36, 0.015, 0.36, 0);
    return 0.86;
  }
  if (shapeOn('shapegarden')) {
    // a gas grill: a cabinet on castors with two doors, a control panel with knobs, a round hood with its handle and thermometer, shelves on brackets, the bottle's hose
    k.m('#3a3f44', 'steel');
    cbox(sh, 0, 0.45, 0, 0.92, 0.66, 0.48, 0.015);
    k.m('#23262a', 'iron');
    cbox(sh, 0, 0.84, 0.02, 0.96, 0.12, 0.54, 0.018, 0);
    k.m('#141618', 'plastic');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.cyl(sx * 0.38, 0, sz * 0.18, 0.045, 0.045, 0.12, 8, 1);
    k.m('#2a2d31', 'steel');
    for (const sx of [-1, 1]) {
      sh.box(sx * 0.225, 0.46, 0.243, 0.42, 0.58, 0.006, 0);
      k.m('#a6adb1', 'steel');
      sh.tube(sx * 0.05, 0.36, 0.265, sx * 0.05, 0.62, 0.265, 0.009, 0.009, 6);
      k.m('#2a2d31', 'steel');
    }
    k.m('#b4babd', 'steel');
    sh.box(0, 0.84, 0.293, 0.8, 0.07, 0.004, 0);
    k.m('#111214', 'plastic');
    for (let i = 0; i < 4; i++) {
      sh.push().local(-0.27 + i * 0.18, 0.84, 0.296, Math.PI / 2, 0, 0);
      sh.cyl(0, 0, 0, 0.022, 0.018, 0.025, 10, 2);
      sh.pop();
    }
    // the hood: a half round across the width, ends closed by the cylinder's caps
    k.m('#1f2225', 'iron');
    sh.push().local(0, 0.9, 0.0, 0, 0, Math.PI / 2);
    sh.cyl(0, -0.46, 0, 0.24, 0.24, 0.92, 20, 3, true);
    sh.pop();
    k.m('#8e9499', 'steel');
    sh.tube(-0.3, 1.04, 0.25, 0.3, 1.04, 0.25, 0.012, 0.012, 8);
    for (const sx of [-0.3, 0.3]) sh.tube(sx, 1.0, 0.2, sx, 1.04, 0.25, 0.008, 0.008, 6);
    k.m('#d8d4c6', 'plastic');
    sh.push().local(0, 1.08, 0.17, Math.PI / 3.4, 0, 0).cyl(0, 0, 0, 0.03, 0.03, 0.012, 12, 2).pop();
    k.m('#9aa3a8', 'steel');
    for (const sx of [-1, 1]) {
      cbox(sh, sx * 0.66, 0.84, 0, 0.36, 0.024, 0.42, 0.006, 0);
      sh.beam(sx * 0.48, 0.62, 0, sx * 0.72, 0.82, 0, 0.02, 0.012);
    }
    return 1.14;
  }
  k.m('#3a3f44', 'steel');
  sh.box(0, 0.42, 0, 0.95, 0.84, 0.5, 1);
  k.m('#1f2225', 'iron');
  sh.push().local(0, 0.98, -0.05, -0.35).box(0, 0, 0, 0.9, 0.28, 0.42, 0).pop();
  k.m('#9aa3a8', 'steel');
  sh.box(0.65, 0.82, 0, 0.36, 0.03, 0.42, 0);
  sh.box(-0.65, 0.82, 0, 0.36, 0.03, 0.42, 0);
  return 1.12;
}

// ─────────────────────────────────────────────────────────── buildings ──

/** Gable-roof garden shed (w x d), door on +Z. */
export function gardenShed(k: Kit, rng: Rng, w: number, d: number): void {
  const sh = k.sh;
  const paint = rng.pick(SHED_PAINT);
  const trim = rng.chance(0.6) ? '#efe9dc' : '#3e3a35';
  const roof = rng.pick(['#3b3a38', '#4a5550', '#7a3b2e', '#55504a']);
  const H = 1.95,
    R = 2.55;
  k.m(paint, 'wood');
  sh.box(0, H / 2, 0, w, H, d, 1);
  // gable ends
  const s = k.s;
  for (const sz of [1, -1]) {
    const z = (sz * d) / 2;
    const a = sh.v(-w / 2, H, z, 0, 0, sz),
      b = sh.v(w / 2, H, z, 0, 0, sz),
      c = sh.v(0, R, z, 0, 0, sz);
    if (sz > 0) s.tri(a, b, c);
    else s.tri(b, a, c);
  }
  // board battens on the front + corner trims
  k.m(trim, 'wood');
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) sh.box(x, H / 2, z, 0.07, H, 0.07, 1);
  // roof planes with overhang
  const pitch = Math.atan2(R - H, w / 2);
  const slope = Math.hypot(w / 2, R - H) + 0.18;
  k.m(roof, 'stone');
  for (const sx of [-1, 1]) {
    sh.push().local((sx * w) / 4 + sx * 0.04, (H + R) / 2 + 0.04, 0, 0, 0, -sx * pitch);
    sh.box(0, 0, 0, slope, 0.06, d + 0.3, 0);
    sh.pop();
  }
  k.m(trim, 'wood');
  sh.box(0, R + 0.03, 0, 0.1, 0.06, d + 0.32, 0);
  // double door + window
  const dx = rng.chance(0.5) ? -w * 0.18 : w * 0.18;
  k.m(trim, 'wood');
  sh.box(dx, 0.92, d / 2 + 0.012, 1.06, 1.84, 0.025, 0);
  k.m(paint, 'wood');
  sh.box(dx - 0.26, 0.9, d / 2 + 0.026, 0.46, 1.72, 0.02, 0);
  sh.box(dx + 0.26, 0.9, d / 2 + 0.026, 0.46, 1.72, 0.02, 0);
  k.m('#c9b26a', 'iron');
  sh.box(dx + 0.06, 0.95, d / 2 + 0.04, 0.03, 0.12, 0.02, 0);
  const wx = dx < 0 ? w * 0.28 : -w * 0.28;
  k.m(trim, 'wood');
  sh.box(wx, 1.35, d / 2 + 0.012, 0.62, 0.52, 0.025, 0);
  k.e('#8fa3ab', '#ffd59a', rng.chance(0.3) ? 0.6 : 0.0);
  sh.box(wx, 1.35, d / 2 + 0.026, 0.5, 0.4, 0.02, 0);
  // water butt at a corner, some shed have a log store
  if (rng.chance(0.55)) {
    k.m(rng.chance(0.5) ? '#3f6e4a' : '#2f3a42', 'plastic');
    if (shapeOn('shapegarden')) {
      // moulded, hooped, a lid with a grip; the shed's downpipe would feed it
      const bx = w / 2 + 0.32,
        bz = d / 2 - 0.35;
      lathe(sh, bx, bz, [[0, 0], [0.26, 0], [0.29, 0.05], [0.3, 0.2], [0.306, 0.22], [0.3, 0.26], [0.3, 0.46], [0.306, 0.48], [0.3, 0.52], [0.31, 0.76], [0.32, 0.8]], 20);
      k.m('#2c2f2e', 'plastic');
      lathe(sh, bx, bz, [[0.33, 0.79], [0.33, 0.83], [0.26, 0.86], [0.05, 0.875], [0, 0.875]], 20);
    } else sh.cyl(w / 2 + 0.32, 0, d / 2 - 0.35, 0.28, 0.3, 0.8, 8, 2);
  }
}

/** Child's play house (w x d). */
export function playhouse(k: Kit, rng: Rng, w: number, d: number): void {
  const sh = k.sh;
  const wall = rng.pick(['#f2d7a6', '#bfe0e8', '#f4c6c6', '#d6e8c0']);
  const roof = rng.pick(['#d9473f', '#2f7fb8', '#3f8f5a']);
  const H = 1.15,
    R = 1.7;
  k.m(wall, 'wood');
  sh.box(0, H / 2, 0, w * 0.8, H, d * 0.8, 1);
  const s = k.s;
  for (const sz of [1, -1]) {
    const z = (sz * d * 0.8) / 2;
    const a = sh.v((-w * 0.8) / 2, H, z, 0, 0, sz),
      b = sh.v((w * 0.8) / 2, H, z, 0, 0, sz),
      c = sh.v(0, R, z, 0, 0, sz);
    if (sz > 0) s.tri(a, b, c);
    else s.tri(b, a, c);
  }
  const pitch = Math.atan2(R - H, w * 0.4);
  k.m(roof, 'paint');
  for (const sx of [-1, 1]) sh.push().local(sx * w * 0.2, (H + R) / 2 + 0.03, 0, 0, 0, -sx * pitch).box(0, 0, 0, Math.hypot(w * 0.4, R - H) + 0.12, 0.05, d * 0.8 + 0.2, 0).pop();
  k.m('#ffffff', 'paint');
  sh.box(0, 0.45, d * 0.4 + 0.01, 0.42, 0.8, 0.02, 0);
  k.m(roof, 'paint');
  sh.box(0, 0.45, d * 0.4 + 0.02, 0.34, 0.72, 0.02, 0);
  if (!shapeOn('shapegarden')) return;
  // shiplap all round, a window with a sill and a pot in each side, a heart in the door, a knob, a ridge and a flag; it was a blank wall
  const hw = w * 0.4,
    hd = d * 0.4;
  k.m(wall, 'wood');
  k.s.r *= 0.72;
  k.s.g *= 0.72;
  k.s.b *= 0.72;
  for (let y = 0.14; y < H - 0.02; y += 0.14) {
    sh.box(hw + 0.002, y, 0, 0.004, 0.012, d * 0.8, 0);
    sh.box(-hw - 0.002, y, 0, 0.004, 0.012, d * 0.8, 0);
    sh.box(0, y, -hd - 0.002, w * 0.8, 0.012, 0.004, 0);
    for (const sx of [-1, 1]) sh.box(sx * (0.21 + (hw - 0.21) / 2), y, hd + 0.002, hw - 0.21, 0.012, 0.004, 0);
  }
  k.m('#ffffff', 'paint');
  for (const sx of [-1, 1]) {
    sh.box(sx * (hw + 0.008), 0.72, 0, 0.012, 0.42, 0.42, 0);
    sh.box(sx * (hw + 0.02), 0.5, 0, 0.05, 0.022, 0.48, 0);
    k.m('#39474e', 'glass');
    sh.box(sx * (hw + 0.016), 0.72, 0, 0.004, 0.34, 0.34, 0);
    k.m('#ffffff', 'paint');
    sh.box(sx * (hw + 0.02), 0.72, 0, 0.004, 0.34, 0.022, 0);
    sh.box(sx * (hw + 0.02), 0.72, 0, 0.004, 0.022, 0.34, 0);
    k.m('#b8643f', 'ceramic');
    sh.cyl(sx * (hw + 0.024), 0.512, 0.1, 0.028, 0.038, 0.05, 8, 2);
    k.m(rng.pick(['#d9473f', '#e8a33c', '#c65aa8']), 'plastic');
    sh.ellipsoid(sx * (hw + 0.024), 0.585, 0.1, 0.04, 0.035, 0.04, 0);
    k.m('#ffffff', 'paint');
  }
  k.m('#e8c44a', 'steel');
  sh.ellipsoid(0.12, 0.45, hd + 0.04, 0.018, 0.018, 0.012, 0);
  // a round window at the back
  k.m('#ffffff', 'paint');
  sh.ellipsoid(0, 0.72, -hd - 0.004, 0.17, 0.17, 0.004, 0);
  k.m('#39474e', 'glass');
  sh.ellipsoid(0, 0.72, -hd - 0.009, 0.135, 0.135, 0.003, 0);
  k.m('#ffffff', 'paint');
  sh.box(0, 0.72, -hd - 0.012, 0.27, 0.02, 0.004, 0);
  sh.box(0, 0.72, -hd - 0.012, 0.02, 0.27, 0.004, 0);
  // a heart cut in the door
  k.m('#1d1a18', 'paint');
  for (const sx of [-1, 1]) sh.ellipsoid(sx * 0.026, 0.68, hd + 0.03, 0.032, 0.032, 0.003, 0);
  sh.push().local(0, 0.65, hd + 0.03, 0, 0, Math.PI / 4).box(0, 0, 0, 0.045, 0.045, 0.004, 0).pop();
  // the ridge
  k.m(roof, 'paint');
  k.s.r *= 0.8;
  k.s.g *= 0.8;
  k.s.b *= 0.8;
  sh.tube(0, R + 0.075, -d * 0.45, 0, R + 0.075, d * 0.45, 0.028, 0.028, 8);
  // a flag on the gable
  k.m('#7d868d', 'steel');
  sh.tube(0, R + 0.08, hd + 0.03, 0, R + 0.45, hd + 0.03, 0.007, 0.007, 5);
  k.m(rng.pick(['#e8a33c', '#d9473f', '#2f7fb8']), 'plastic');
  const f0 = sh.v(0, R + 0.45, hd + 0.03, 0, 0, 1),
    f1 = sh.v(0, R + 0.32, hd + 0.03, 0, 0, 1),
    f2 = sh.v(0.17, R + 0.385, hd + 0.03, 0, 0, 1),
    f3 = sh.v(0, R + 0.45, hd + 0.03, 0, 0, -1),
    f4 = sh.v(0, R + 0.32, hd + 0.03, 0, 0, -1),
    f5 = sh.v(0.17, R + 0.385, hd + 0.03, 0, 0, -1);
  s.tri(f1, f2, f0);
  s.tri(f4, f3, f5);
}

/** Small dog kennel (faces +Z). */
export function kennel(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const c = rng.pick(['#9a6a43', '#c9a35a', '#a85a46', '#6f8f6a']);
  k.m(c, 'wood');
  sh.box(0, 0.32, 0, 0.7, 0.64, 0.85, 1);
  const s = k.s;
  for (const sz of [1, -1]) {
    const z = sz * 0.425;
    const a = sh.v(-0.35, 0.64, z, 0, 0, sz),
      b = sh.v(0.35, 0.64, z, 0, 0, sz),
      t = sh.v(0, 0.9, z, 0, 0, sz);
    if (sz > 0) s.tri(a, b, t);
    else s.tri(b, a, t);
  }
  k.m('#3b3a38', 'stone');
  for (const sx of [-1, 1]) sh.push().local(sx * 0.18, 0.79, 0, 0, 0, -sx * 0.64).box(0, 0, 0, 0.5, 0.04, 0.95, 0).pop();
  if (shapeOn('shapegarden')) {
    // weatherboards, an arched door with a frame, a name, a ridge, a bowl with something in it
    k.m(c, 'wood');
    k.s.r *= 0.68;
    k.s.g *= 0.68;
    k.s.b *= 0.68;
    for (let y = 0.1; y < 0.62; y += 0.1) {
      for (const sx of [-1, 1]) sh.box(sx * 0.352, y, 0, 0.004, 0.01, 0.85, 0);
      sh.box(0, y, -0.427, 0.7, 0.01, 0.004, 0);
      if (y > 0.56) sh.box(0, y, 0.427, 0.7, 0.01, 0.004, 0);
      else for (const sx of [-1, 1]) sh.box(sx * 0.26, y, 0.427, 0.18, 0.01, 0.004, 0);
    }
    k.m(c, 'wood');
    k.s.r *= 1.2;
    k.s.g *= 1.2;
    k.s.b *= 1.2;
    sh.box(-0.17, 0.2, 0.432, 0.03, 0.4, 0.012, 0);
    sh.box(0.17, 0.2, 0.432, 0.03, 0.4, 0.012, 0);
    sh.push().local(0, 0.4, 0.431, Math.PI / 2);
    sh.cyl(0, -0.008, 0, 0.185, 0.185, 0.014, 18, 2);
    sh.pop();
    k.m('#141414', 'rubber');
    sh.box(0, 0.2, 0.436, 0.31, 0.4, 0.006, 0);
    sh.push().local(0, 0.4, 0.436, Math.PI / 2);
    sh.cyl(0, -0.004, 0, 0.155, 0.155, 0.009, 18, 2);
    sh.pop();
    k.m('#d8cfb8', 'wood');
    sh.box(0, 0.68, 0.432, 0.26, 0.06, 0.012, 0);
    k.m('#2a2622', 'paint');
    for (let i = 0; i < 3; i++) sh.box(-0.07 + i * 0.07, 0.68, 0.439, 0.045, 0.022, 0.002, 0);
    k.m('#2d2c2a', 'stone');
    sh.tube(0, 0.905, -0.47, 0, 0.905, 0.47, 0.022, 0.022, 7);
    k.m('#b8643f', 'ceramic');
    lathe(sh, 0.22, 0.62, [[0.09, 0], [0.11, 0.05], [0.115, 0.065], [0.095, 0.065], [0.08, 0.02]], 16);
    k.m('#6b4a2c', 'plastic');
    sh.disc(0.22, 0.04, 0.62, 0.085, 14, 1);
    return;
  }
  k.m('#1b1b1b', 'rubber');
  sh.box(0, 0.25, 0.43, 0.3, 0.38, 0.01, 0);
  k.m('#b8643f', 'ceramic');
  sh.cyl(0.22, 0, 0.62, 0.1, 0.11, 0.06, 8, 2);
}

/** Greenhouse: aluminium frame (k), glass panes (g), plants inside. */
export function greenhouse(k: Kit, g: Kit, rng: Rng, w: number, d: number): void {
  const sh = k.sh,
    gs = g.sh;
  const H = 1.7,
    R = 2.3;
  k.m('#c9cfd2', 'steel');
  sh.box(0, 0.12, 0, w, 0.24, d, 1);
  for (const x of [-w / 2, -w / 6, w / 6, w / 2])
    for (const z of [-d / 2, d / 2]) sh.box(x, 0.24 + (H - 0.24) / 2, z, 0.04, H - 0.24, 0.04, 1);
  sh.box(0, R, 0, 0.05, 0.05, d, 0);
  const pitch = Math.atan2(R - H, w / 2);
  for (const sx of [-1, 1]) for (const z of [-d / 2, d / 2]) sh.beam(sx * w / 2, H, z, 0, R, z, 0.04, 0.04);
  for (const sx of [-1, 1]) sh.box(sx * w / 2, H, 0, 0.05, 0.05, d, 0);
  // plants (seen through the glass)
  for (let i = 0; i < 6; i++) {
    k.m(rng.pick(['#3f7a3a', '#55923f', '#2f6a35']), 'wood');
    sh.ellipsoid(rng.range(-w / 2 + 0.3, w / 2 - 0.3), 0.55, rng.range(-d / 2 + 0.3, d / 2 - 0.3), 0.22, 0.3, 0.22, 0);
  }
  k.m('#c43b2f', 'plastic');
  for (let i = 0; i < 4; i++) sh.box(rng.range(-w / 2 + 0.3, w / 2 - 0.3), 0.75, rng.range(-d / 2 + 0.3, d / 2 - 0.3), 0.07, 0.07, 0.07, 0);
  // glass (neutral-greenish tint: not lit at night like the bus-shelter panes)
  g.m('#e6ece2', 'glass');
  gs.box(0, 0.24 + (H - 0.24) / 2, 0, w - 0.02, H - 0.24, d - 0.02, 3);
  for (const sx of [-1, 1]) gs.push().local((sx * w) / 4, (H + R) / 2, 0, 0, 0, -sx * pitch).box(0, 0, 0, Math.hypot(w / 2, R - H), 0.01, d, 0).pop();
  const s = g.s;
  for (const sz of [1, -1]) {
    const z = (sz * d) / 2;
    const a = gs.v(-w / 2, H, z, 0, 0, sz),
      b = gs.v(w / 2, H, z, 0, 0, sz),
      c = gs.v(0, R, z, 0, 0, sz);
    if (sz > 0) s.tri(a, b, c);
    else s.tri(b, a, c);
  }
}

// ────────────────────────────────────────────────────────────── play ──

/** Round trampoline (diameter ~3.3 m) with a netting-pole enclosure on most. */
export function trampoline(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const R = 1.62;
  const pad = rng.pick(['#2f7fb8', '#3f8f5a', '#d9473f', '#2a9d8f', '#e8a33c']);
  const Y = 0.82;
  k.m('#9aa3a8', 'steel');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.cos(a) * (R - 0.05),
      z = Math.sin(a) * (R - 0.05);
    sh.tube(x * 1.04, 0, z * 1.04, x, Y, z, 0.03, 0.03, 4);
  }
  const roundTramp = shapeOn('shapegarden');
  k.m('#7d868d', 'steel');
  sh.cyl(0, Y - 0.05, 0, R, R, 0.06, roundTramp ? 36 : 16, 0);
  k.m(pad, 'plastic');
  if (roundTramp) {
    // the safety pad's soft roll over the springs, the mat inside it with its stitched ring
    smoothLathe(sh, 0, 0, [[R + 0.05, Y - 0.005], [R + 0.09, Y + 0.035], [R + 0.05, Y + 0.075], [R - 0.08, Y + 0.09], [R - 0.26, Y + 0.078]], 36);
    k.m('#1d1f22', 'rubber');
    sh.disc(0, Y + 0.075, 0, R - 0.25, 36, 1);
    k.m('#3a3d40', 'rubber');
    lathe(sh, 0, 0, [[R - 0.38, Y + 0.0775], [R - 0.36, Y + 0.0775]], 36);
  } else {
    sh.cyl(0, Y, 0, R + 0.08, R + 0.04, 0.07, 16, 2);
    k.m('#1d1f22', 'rubber');
    sh.disc(0, Y + 0.075, 0, R - 0.26, 16, 1);
  }
  if (rng.chance(0.75)) {
    k.m('#2d3236', 'steel');
    const n = 8,
      top = Y + 1.75;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      sh.tube(Math.cos(a) * (R + 0.06), Y, Math.sin(a) * (R + 0.06), Math.cos(a) * (R + 0.03), top, Math.sin(a) * (R + 0.03), 0.022, 0.022, 4);
    }
    k.m(pad, 'plastic');
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU,
        a1 = ((i + 1) / n) * TAU;
      sh.tube(Math.cos(a0) * (R + 0.03), top, Math.sin(a0) * (R + 0.03), Math.cos(a1) * (R + 0.03), top, Math.sin(a1) * (R + 0.03), 0.03, 0.03, 4);
    }
  }
}

/** A-frame swing set with two swings; half of them with a slide. Faces +Z (swings move along z). */
export function swingSet(k: Kit, rng: Rng, w: number): void {
  const sh = k.sh;
  const frame = rng.pick(['#2f7fb8', '#3f8f5a', '#d9473f', '#8a5b3a']);
  const H = 2.05,
    L = Math.min(2.8, w - 0.6);
  k.m(frame, frame === '#8a5b3a' ? 'wood' : 'paint');
  for (const sx of [-1, 1]) {
    const x = (sx * L) / 2;
    sh.tube(x + sx * 0.1, 0, -0.75, x, H, 0, 0.045, 0.045, 5);
    sh.tube(x + sx * 0.1, 0, 0.75, x, H, 0, 0.045, 0.045, 5);
  }
  sh.tube(-L / 2 - 0.05, H, 0, L / 2 + 0.05, H, 0, 0.055, 0.055, 6);
  const seats = [-L / 4, L / 4];
  for (const x of seats) {
    const sw = rng.range(-0.25, 0.25);
    const sy = 0.42,
      sz = Math.sin(sw) * (H - sy);
    k.m('#55595c', 'steel');
    sh.beam(x - 0.2, H, 0, x - 0.2, sy + 0.02, sz, 0.015, 0.015, false);
    sh.beam(x + 0.2, H, 0, x + 0.2, sy + 0.02, sz, 0.015, 0.015, false);
    k.m(rng.pick(PLAY), 'rubber');
    sh.box(x, sy, sz, 0.46, 0.04, 0.18, 0);
  }
  if (rng.chance(0.5)) {
    // slide off one end
    const sx = rng.chance(0.5) ? 1 : -1;
    const x0 = (sx * L) / 2 + sx * 0.3;
    k.m(frame, 'paint');
    sh.box(x0 + sx * 0.35, 1.25, 0, 0.7, 0.05, 0.6, 0);
    sh.tube(x0 + sx * 0.05, 0, -0.28, x0 + sx * 0.05, 1.25, -0.28, 0.03, 0.03, 4);
    sh.tube(x0 + sx * 0.05, 0, 0.28, x0 + sx * 0.05, 1.25, 0.28, 0.03, 0.03, 4);
    k.m('#e8c35a', 'plastic');
    sh.beam(x0 + sx * 0.7, 1.24, 0, x0 + sx * 2.0, 0.1, 0, 0.5, 0.04);
    k.m('#d9a63a', 'plastic');
    sh.beam(x0 + sx * 0.7, 1.31, 0.25, x0 + sx * 2.0, 0.17, 0.25, 0.04, 0.12, false);
    sh.beam(x0 + sx * 0.7, 1.31, -0.25, x0 + sx * 2.0, 0.17, -0.25, 0.04, 0.12, false);
  }
}

/** Timber sandpit with a bucket and a spade. */
export function sandpit(k: Kit, rng: Rng, w: number): void {
  const sh = k.sh;
  const s = w * 0.9;
  k.m('#9a7650', 'wood');
  sh.box(0, 0.12, -s / 2 + 0.06, s, 0.24, 0.12, 1);
  sh.box(0, 0.12, s / 2 - 0.06, s, 0.24, 0.12, 1);
  sh.box(-s / 2 + 0.06, 0.12, 0, 0.12, 0.24, s - 0.24, 1);
  sh.box(s / 2 - 0.06, 0.12, 0, 0.12, 0.24, s - 0.24, 1);
  k.m('#e3cf98', 'stone');
  sh.box(0, 0.09, 0, s - 0.24, 0.18, s - 0.24, 1);
  if (shapeOn('shapegarden')) {
    // the sand heaped and dug, a castle turned out of the bucket; the bucket with its handle, the spade with a blade
    k.m('#d9c58c', 'stone');
    softBlob(sh, rng.range(-0.2, 0.2), 0.17, rng.range(-0.2, 0.2), s * 0.26, 0.09, s * 0.22, 0.6, 0.8, 0.02, rng.int(0, 99), 6, 14);
    k.m('#d3bf84', 'stone');
    const cx = rng.range(-0.3, 0.3),
      cz = rng.range(-0.3, 0.3);
    lathe(sh, cx, cz, [[0.1, 0.18], [0.072, 0.31], [0, 0.31]], 10);
    k.m(rng.pick(PLAY), 'plastic');
    const bx = rng.range(-0.3, 0.3),
      bz = rng.range(-0.3, 0.3);
    lathe(sh, bx, bz, [[0, 0.18], [0.075, 0.18], [0.1, 0.33], [0.106, 0.34], [0.09, 0.34], [0.07, 0.2]], 14);
    sh.tube(bx - 0.1, 0.33, bz, bx, 0.42, bz, 0.005, 0.005, 4);
    sh.tube(bx, 0.42, bz, bx + 0.1, 0.33, bz, 0.005, 0.005, 4);
    k.m(rng.pick(PLAY), 'plastic');
    sh.push().local(rng.range(-0.3, 0.3), 0.2, rng.range(-0.3, 0.3), 0, rng.range(0, 3));
    sh.tube(-0.18, 0.01, 0, 0.1, 0.02, 0, 0.009, 0.009, 5);
    cbox(sh, 0.15, 0.015, 0, 0.13, 0.012, 0.09, 0.004, 0);
    sh.pop();
    return;
  }
  k.m(rng.pick(PLAY), 'plastic');
  sh.cyl(rng.range(-0.3, 0.3), 0.18, rng.range(-0.3, 0.3), 0.09, 0.11, 0.16, 6, 2);
  k.m(rng.pick(PLAY), 'plastic');
  sh.push().local(rng.range(-0.3, 0.3), 0.2, rng.range(-0.3, 0.3), 0, rng.range(0, 3)).box(0, 0, 0, 0.32, 0.02, 0.07, 0).pop();
}

/** Ball, ride-on car, a bucket. */
export function toys(k: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m(rng.pick(PLAY), 'plastic');
  sh.ellipsoid(rng.range(-0.4, 0.4), 0.12, rng.range(-0.4, 0.4), 0.12, 0.12, 0.12, 1);
  if (rng.chance(0.6)) {
    sh.push().local(rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2), 0, rng.range(0, TAU));
    k.m(rng.pick(['#d9473f', '#e8c35a', '#2f7fb8']), 'plastic');
    if (shapeOn('shapegarden')) {
      // a moulded ride-on: a soft body, a roof on pillars, eyes for lamps
      cbox(sh, 0, 0.22, 0, 0.36, 0.2, 0.62, 0.05);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.tube(sx * 0.14, 0.32, -0.06 + sz * 0.12, sx * 0.13, 0.48, -0.06 + sz * 0.1, 0.016, 0.016, 6);
      cbox(sh, 0, 0.49, -0.06, 0.32, 0.035, 0.32, 0.015, 0);
      k.m('#f4efe0', 'plastic');
      for (const sx of [-1, 1]) sh.ellipsoid(sx * 0.11, 0.25, 0.31, 0.035, 0.035, 0.012, 0);
    } else {
      sh.box(0, 0.22, 0, 0.36, 0.2, 0.62, 1);
      sh.box(0, 0.38, -0.06, 0.3, 0.14, 0.26, 0);
    }
    k.m('#1d1f22', 'rubber');
    for (const x of [-0.19, 0.19]) for (const z of [-0.2, 0.2]) sh.push().local(x, 0.08, z, 0, 0, Math.PI / 2).cyl(0, -0.03, 0, 0.08, 0.08, 0.06, 6, 3, false).pop();
    sh.pop();
  }
}

// ──────────────────────────────────────────────────────────── water ──

const WATER_DEEP = '#2d9fc0';
const WATER_EDGE = '#7fd6e2';

/**
 * In-ground pool w x d: stone coping, a tiled waterline band, graded water (deep centre, light edges),
 * lane line, ladder, sometimes a float. Only some pools have an underwater lamp (subtle night glow);
 * the others stay dark water that only picks up the street / window light (thLampLight).
 */
export function pool(k: Kit, rng: Rng, w: number, d: number): void {
  const sh = k.sh,
    s = k.s;
  const cw = 0.38;
  const iw = w - 2 * cw,
    id = d - 2 * cw;
  const lit = rng.chance(0.35);
  // coping (slightly raised, light stone with a darker outer kerb line)
  const stone = rng.pick(['#e9e4d8', '#d8d2c4', '#cfc8ba']);
  k.m(stone, 'stone');
  sh.box(0, 0.06, -d / 2 + cw / 2, w, 0.12, cw, 1);
  sh.box(0, 0.06, d / 2 - cw / 2, w, 0.12, cw, 1);
  sh.box(-w / 2 + cw / 2, 0.06, 0, cw, 0.12, id, 1);
  sh.box(w / 2 - cw / 2, 0.06, 0, cw, 0.12, id, 1);
  // tiled waterline band (dark blue mosaic) visible between the coping and the water
  k.m('#24597a', 'ceramic');
  sh.box(0, 0.05, 0, iw, 0.012, id, 1);
  // water: outer ring lighter (shallow tile showing through), centre deeper
  const y = 0.065;
  const bx = iw / 2 - 0.12,
    bz = id / 2 - 0.12;
  const ix = bx * 0.62,
    iz = bz * 0.45;
  const V = (x: number, z: number, deep: boolean) => {
    if (lit) {
      if (deep) k.e(WATER_DEEP, '#3fc8d8', 0.2, 0);
      else k.e(WATER_EDGE, '#6fdfe8', 0.1, 0);
    } else k.m(deep ? WATER_DEEP : WATER_EDGE, 'glass');
    s.setEx(0, 0.06, 0);
    return sh.v(x, y, z, 0, 1, 0);
  };
  const o = [V(-bx, -bz, false), V(bx, -bz, false), V(bx, bz, false), V(-bx, bz, false)];
  const i = [V(-ix, -iz, true), V(ix, -iz, true), V(ix, iz, true), V(-ix, iz, true)];
  for (let q = 0; q < 4; q++) {
    const a = o[q],
      b = o[(q + 1) % 4],
      c = i[(q + 1) % 4],
      dd = i[q];
    s.tri(a, c, b);
    s.tri(a, dd, c);
  }
  s.tri(i[0], i[2], i[1]);
  s.tri(i[0], i[3], i[2]);
  // lane line on the floor (seen through the water)
  if (lit) k.e('#1f6f99', '#3fc8d8', 0.12, 0);
  else k.m('#1f6f99', 'glass');
  sh.box(0, y + 0.003, 0, iw * 0.7, 0.002, 0.12, 1);
  // underwater lamp housings on the lit ones
  if (lit) {
    k.e('#f4f1e8', '#e8fbff', 1.2, 0);
    sh.box(-iw * 0.25, y + 0.004, -bz + 0.02, 0.16, 0.002, 0.05, 1);
    sh.box(iw * 0.25, y + 0.004, -bz + 0.02, 0.16, 0.002, 0.05, 1);
  }
  // ladder
  const lx = rng.chance(0.5) ? -iw / 2 + 0.6 : iw / 2 - 0.6;
  k.m('#c9cfd2', 'steel');
  for (const dx of [-0.22, 0.22]) {
    sh.tube(lx + dx, 0.12, -id / 2 - cw * 0.5, lx + dx, 0.75, -id / 2 - cw * 0.5 + 0.05, 0.02, 0.02, 4);
    sh.tube(lx + dx, 0.75, -id / 2 - cw * 0.5 + 0.05, lx + dx, 0.55, -id / 2 + 0.2, 0.02, 0.02, 4);
  }
  // inflatable ring floating
  if (rng.chance(0.6)) {
    k.m(rng.pick(['#f08bb0', '#f2c84b', '#f4efe4']), 'plastic');
    const cx = rng.range(-ix, ix),
      cz = rng.range(-iz, iz);
    const n = 8,
      rr = 0.36;
    for (let q = 0; q < n; q++) {
      const a0 = (q / n) * TAU,
        a1 = ((q + 1) / n) * TAU;
      sh.tube(cx + Math.cos(a0) * rr, y + 0.06, cz + Math.sin(a0) * rr, cx + Math.cos(a1) * rr, y + 0.06, cz + Math.sin(a1) * rr, 0.1, 0.1, 5);
    }
  }
}

/** Above-ground round pool (frame pool) with a ladder. */
export function roundPool(k: Kit, rng: Rng, dia: number): void {
  const sh = k.sh;
  const R = dia / 2 - 0.1;
  k.m(rng.pick(['#3f6f99', '#8a9399', '#5d7f99']), 'plastic');
  sh.cyl(0, 0, 0, R, R, 0.88, 16, 0);
  k.m('#e9e4d8', 'plastic');
  sh.cyl(0, 0.88, 0, R + 0.05, R + 0.05, 0.05, 16, 2);
  k.m(WATER_EDGE, 'glass');
  sh.disc(0, 0.86, 0, R - 0.03, 16, 1);
  k.m(WATER_DEEP, 'glass');
  sh.disc(0, 0.865, 0, R * 0.62, 12, 1);
  k.m('#c9cfd2', 'steel');
  sh.beam(R + 0.05, 0.95, -0.2, R + 0.5, 0, -0.2, 0.03, 0.03);
  sh.beam(R + 0.05, 0.95, 0.2, R + 0.5, 0, 0.2, 0.03, 0.03);
  for (let i = 1; i < 4; i++) sh.box(R + 0.05 + i * 0.11, 0.95 - i * 0.24, 0, 0.1, 0.03, 0.42, 0);
}

/** Inflatable paddling pool. */
export function paddling(k: Kit, rng: Rng, dia: number): void {
  const sh = k.sh;
  const R = dia / 2 - 0.1;
  const c = rng.pick(['#2f7fb8', '#2a9d8f', '#e86a8a', '#e8a33c']);
  if (shapeOn('shapegarden')) {
    // blown up: three fat rings, stacked, a little squashed, with a valve; water in it and a rubber duck on the water
    const ring = (y: number, rr: number, a0: number, a1: number): number[][] => {
      const out: number[][] = [];
      const steps = Math.round((a1 - a0) / 0.62);
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        out.push([R - rr + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.92]);
      }
      return out;
    };
    k.m(c, 'plastic');
    smoothLathe(sh, 0, 0, ring(0.065, 0.07, -1.57, 1.57), 22);
    k.m('#f4efe4', 'plastic');
    smoothLathe(sh, 0, 0, ring(0.18, 0.07, -1.57, 1.57), 22);
    k.m(c, 'plastic');
    smoothLathe(sh, 0, 0, ring(0.295, 0.075, -1.57, 3.6), 22);
    k.m('#f4efe4', 'plastic');
    sh.push().local(R + 0.002, 0.3, 0, 0, 0, Math.PI / 2).cyl(0, -0.02, 0, 0.012, 0.012, 0.03, 6, 3).pop();
    k.m(WATER_EDGE, 'glass');
    sh.disc(0, 0.25, 0, R - 0.1, 22, 1);
    // the duck
    const dx = R * 0.3,
      dz = -R * 0.2;
    k.m('#f2cf3a', 'plastic');
    sh.ellipsoid(dx, 0.27, dz, 0.075, 0.05, 0.1, 0);
    sh.ellipsoid(dx, 0.34, dz + 0.055, 0.042, 0.042, 0.042, 0);
    sh.push().local(dx, 0.285, dz - 0.09, 0.6, 0, 0).cyl(0, 0, 0, 0.022, 0.004, 0.05, 6, 0).pop();
    k.m('#e8732c', 'plastic');
    sh.ellipsoid(dx, 0.335, dz + 0.1, 0.018, 0.008, 0.016, 0);
    return;
  }
  k.m(c, 'plastic');
  sh.cyl(0, 0, 0, R, R, 0.14, 14, 0);
  k.m('#f4efe4', 'plastic');
  sh.cyl(0, 0.14, 0, R, R, 0.1, 14, 0);
  k.m(c, 'plastic');
  sh.cyl(0, 0.24, 0, R, R - 0.02, 0.1, 14, 2);
  k.m(WATER_EDGE, 'glass');
  sh.disc(0, 0.25, 0, R - 0.16, 14, 1);
  k.m(rng.pick(PLAY), 'plastic');
  sh.ellipsoid(R * 0.3, 0.32, -R * 0.2, 0.1, 0.1, 0.1, 0);
}

// ─────────────────────────────────────────────────────────── chores ──

/** Rotary washing line with laundry. */
/**
 * Rotary dryer; the hanging laundry goes to `cloth` (framed at the same spot by the caller) or to `k`.
 * Returns the local arm angle yaw0 (corners at (cos, sin)(yaw0 + i·π/2)·R), R and the line height H.
 */
export function washing(k: Kit, rng: Rng, cloth?: Kit): { yaw0: number; R: number; H: number } {
  const sh = k.sh;
  const H = 1.75,
    R = 1.1;
  k.m('#b8bec2', 'steel');
  sh.cyl(0, 0, 0, 0.03, 0.025, H + 0.05, 5, 2);
  const yaw0 = rng.range(0, TAU);
  for (let i = 0; i < 4; i++) {
    const a = yaw0 + (i / 4) * TAU;
    sh.beam(0, H - 0.25, 0, Math.cos(a) * R, H, Math.sin(a) * R, 0.02, 0.02, false);
  }
  k.m('#e9e4d8', 'plastic');
  for (const rr of [R, R * 0.65]) {
    for (let i = 0; i < 4; i++) {
      const a0 = yaw0 + (i / 4) * TAU,
        a1 = yaw0 + ((i + 1) / 4) * TAU;
      sh.beam(Math.cos(a0) * rr, H - 0.01, Math.sin(a0) * rr, Math.cos(a1) * rr, H - 0.01, Math.sin(a1) * rr, 0.008, 0.008, false);
    }
  }
  // laundry hanging from the outer square
  const cols = ['#f4efe4', '#7da3c4', '#e86a8a', '#e8c35a', '#3f8f5a', '#d9473f', '#2f3a52', '#f4efe4'];
  const n = rng.int(4, 9);
  const ck = cloth ?? k;
  for (let j = 0; j < n; j++) {
    const side = rng.int(0, 3);
    const t = rng.range(0.15, 0.85);
    const a0 = yaw0 + (side / 4) * TAU,
      a1 = yaw0 + ((side + 1) / 4) * TAU;
    const rr = rng.chance(0.6) ? R : R * 0.65;
    const x = Math.cos(a0) * rr * (1 - t) + Math.cos(a1) * rr * t,
      z = Math.sin(a0) * rr * (1 - t) + Math.sin(a1) * rr * t;
    const along = Math.atan2(Math.sin(a1) - Math.sin(a0), Math.cos(a1) - Math.cos(a0));
    const big = rng.chance(0.35);
    ck.m(rng.pick(cols), 'rubber');
    ck.sh.push().local(x, H - (big ? 0.42 : 0.22), z, 0, -along);
    ck.sh.box(0, 0, 0, big ? 0.7 : 0.36, big ? 0.8 : 0.42, 0.012, 0);
    ck.sh.pop();
  }
  return { yaw0, R, H: H - 0.01 };
}

/** n raised vegetable beds (2.4 x 1.1) in a row along z. */
/** the same beds, with what really grows in them (?noshapecrops: the earlier cones and bars) */
function shapedBed(k: Kit, rng: Rng, z: number, bd: number): void {
  const sh = k.sh;
  k.m('#4a3424', 'stone');
  CK.soilRidge(sh, -1.1, z, 1.1, z, 0.25, bd - 0.2, rng);
  const at = (x: number, zz: number, draw: () => void): void => {
    sh.push().local(x, 0.34, z + zz);
    draw();
    sh.pop();
  };
  const crop = rng.int(0, 3);
  k.m('#7fb04a', 'wood');
  if (crop === 0) {
    const kale = rng.chance(0.5);
    for (let i = 0; i < 5; i++) for (const zz of [-0.25, 0.25]) at(-0.9 + i * 0.45, zz, () => (kale ? CK.cabbage(sh, rng) : CK.lettuce(sh, rng)));
  } else if (crop === 1) {
    for (const x of [-0.6, 0.6]) at(x, 0, () => CK.beans(sh, rng));
  } else if (crop === 2) {
    const onions = rng.chance(0.5);
    for (const zz of [-0.3, 0, 0.3]) for (let x = -0.95; x < 1; x += onions ? 0.15 : 0.13) at(x + rng.range(-0.02, 0.02), zz + rng.range(-0.02, 0.02), () => (onions ? CK.onion(sh, rng) : CK.carrotTop(sh, rng)));
  } else {
    for (let i = 0; i < 4; i++) at(-0.85 + i * 0.57, 0, () => CK.tomato(sh, rng));
  }
}

export function vegBeds(k: Kit, rng: Rng, n: number, d: number): void {
  const sh = k.sh;
  const bd = 1.1,
    gap = (d - n * bd) / Math.max(1, n - 1);
  for (let b = 0; b < n; b++) {
    const z = -d / 2 + bd / 2 + b * (bd + gap);
    k.m('#8a6240', 'wood');
    sh.box(0, 0.16, z - bd / 2 + 0.04, 2.4, 0.32, 0.08, 1);
    sh.box(0, 0.16, z + bd / 2 - 0.04, 2.4, 0.32, 0.08, 1);
    sh.box(-1.16, 0.16, z, 0.08, 0.32, bd - 0.16, 1);
    sh.box(1.16, 0.16, z, 0.08, 0.32, bd - 0.16, 1);
    k.m('#4a3424', 'stone');
    sh.box(0, 0.14, z, 2.24, 0.28, bd - 0.16, 1);
    if (shapeOn('shapecrops')) {
      shapedBed(k, rng, z, bd);
      continue;
    }
    const crop = rng.int(0, 3);
    if (crop === 0) {
      // lettuce / cabbage heads
      for (let i = 0; i < 5; i++)
        for (const zz of [-0.25, 0.25]) {
          k.m(rng.pick(['#7fb04a', '#5f9a3a', '#9cc45a', '#6f8f4a']), 'wood');
          sh.ellipsoid(-0.9 + i * 0.45, 0.34, z + zz, 0.17, 0.11, 0.17, 0);
        }
    } else if (crop === 1) {
      // bean poles (teepees)
      for (const x of [-0.6, 0.6]) {
        k.m('#a88a5a', 'wood');
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.4;
          sh.beam(x + Math.cos(a) * 0.3, 0.3, z + Math.sin(a) * 0.3, x, 1.75, z, 0.025, 0.025, false);
        }
        k.m('#4f8a3a', 'wood');
        sh.cone(x, 0.3, z, 0.34, 1.3, 6, false);
      }
    } else if (crop === 2) {
      // rows (carrots / onions)
      k.m('#6a9a3f', 'wood');
      for (const zz of [-0.3, 0, 0.3]) sh.box(0, 0.33, z + zz, 2.0, 0.08, 0.12, 1);
    } else {
      // tomatoes on stakes
      for (let i = 0; i < 4; i++) {
        const x = -0.85 + i * 0.57;
        k.m('#a88a5a', 'wood');
        sh.box(x, 0.75, z, 0.03, 0.9, 0.03, 1);
        k.m('#4f8a3a', 'wood');
        sh.ellipsoid(x, 0.75, z, 0.18, 0.38, 0.18, 0);
        k.m('#d9473f', 'plastic');
        sh.ellipsoid(x + 0.12, 0.62, z + 0.1, 0.05, 0.05, 0.05, 0);
        sh.ellipsoid(x - 0.1, 0.85, z - 0.12, 0.05, 0.05, 0.05, 0);
      }
    }
  }
}

/** Compost: a slatted timber bay or a green plastic "dalek" bin. */
export function compost(k: Kit, rng: Rng): void {
  const sh = k.sh;
  if (shapeOn('shapegarden') && rng.chance(0.5)) {
    // moulded "dalek" bins: ribbed walls, a hatch at the foot, a domed lid with a grip
    const dalek = (x: number, z: number, k0: number): void => {
      k.m('#2f4a35', 'plastic');
      lathe(sh, x, z, [[0.42 * k0, 0], [0.41 * k0, 0.18], [0.392 * k0, 0.2], [0.385 * k0, 0.4], [0.367 * k0, 0.42], [0.36 * k0, 0.62], [0.342 * k0, 0.64], [0.335 * k0, 0.85]], 14);
      k.m('#29402f', 'plastic');
      smoothLathe(sh, x, z, [[0.36 * k0, 0.85], [0.36 * k0, 0.885], [0.3 * k0, 0.93], [0.13 * k0, 0.965], [0, 0.97]], 14);
      cbox(sh, x, 0.985, z, 0.14 * k0, 0.03, 0.03, 0.008, 1);
      cbox(sh, x, 0.15, z + 0.39 * k0, 0.3 * k0, 0.24, 0.03, 0.01, 0);
      cbox(sh, x, 0.21, z + 0.41 * k0, 0.1, 0.022, 0.02, 0.005, 0);
    };
    dalek(0, 0, 1);
    if (rng.chance(0.6)) dalek(0.62, 0.1, 0.92);
    return;
  }
  if (rng.chance(0.5)) {
    k.m('#2f4a35', 'plastic');
    sh.cyl(0, 0, 0, 0.42, 0.33, 0.85, 8, 0);
    sh.cyl(0, 0.85, 0, 0.36, 0.2, 0.1, 8, 2);
    if (rng.chance(0.6)) {
      k.m('#2f4a35', 'plastic');
      sh.cyl(0.62, 0, 0.1, 0.38, 0.3, 0.8, 8, 0);
      sh.cyl(0.62, 0.8, 0.1, 0.32, 0.18, 0.1, 8, 2);
    }
    return;
  }
  k.m('#8a6a48', 'wood');
  for (let i = 0; i < 4; i++) {
    sh.box(0, 0.12 + i * 0.2, -0.45, 1.1, 0.14, 0.04, 0);
    sh.box(-0.53, 0.12 + i * 0.2, 0, 0.04, 0.14, 0.9, 0);
    sh.box(0.53, 0.12 + i * 0.2, 0, 0.04, 0.14, 0.9, 0);
  }
  k.m('#4a3424', 'stone');
  sh.ellipsoid(0, 0.35, 0, 0.5, 0.35, 0.42, 1);
  k.m('#6f8f4a', 'wood');
  sh.ellipsoid(0.1, 0.62, 0.05, 0.25, 0.08, 0.2, 0);
}

/** box hunt (?nowheeliebin): garden / courtyard wheelie bins built as real 240 l bins instead of a box + lid */
let BIN_DETAIL = true;
export function setBinDetail(on: boolean): void {
  BIN_DETAIL = on;
}

/**
 * A 240 l wheelie bin, origin bottom centre, front +Z: tapered moulded body with a stiffening rim, a lid hinged
 * on a rear handle bar (overhang + front grip lip, a few left ajar), axle and two wheels under the handle,
 * the front lifting comb, a house-number label.
 */
function wheelieBin(k: Kit, rng: Rng, c: string): void {
  const sh = k.sh;
  k.m(c, 'plastic');
  lathe(sh, 0, 0, [[0, 0.06], [0.33, 0.06], [0.41, 0.95], [0, 0.95]], 4, Math.PI / 4);
  cbox(sh, 0, 0.965, 0, 0.6, 0.045, 0.6, 0.012);
  // lid: hinged at the back, ajar on some (a bag pokes out)
  const ajar = rng.chance(0.25) ? rng.range(0.08, 0.22) : 0;
  sh.push().local(0, 0.99, -0.3, -ajar);
  cbox(sh, 0, 0.017, 0.31, 0.63, 0.034, 0.66, 0.01);
  cbox(sh, 0, -0.012, 0.635, 0.28, 0.04, 0.03, 0.008);
  sh.pop();
  if (ajar) {
    k.m('#1e2022', 'plastic');
    sh.ellipsoid(0, 0.96, 0.05, 0.2, 0.08, 0.2, 1);
  }
  // rear handle bar between two moulded brackets, axle + wheels below it
  k.m(c, 'plastic');
  for (const x of [-0.25, 0.25]) cbox(sh, x, 0.9, -0.31, 0.05, 0.1, 0.07, 0.01);
  sh.tube(-0.27, 0.95, -0.35, 0.27, 0.95, -0.35, 0.017, 0.017, 6);
  k.m('#1e2022', 'rubber');
  for (const x of [-0.25, 0.25]) sh.push().local(x, 0.11, -0.3, 0, 0, Math.PI / 2).cyl(0, -0.03, 0, 0.11, 0.11, 0.06, 10, 3).pop();
  sh.tube(-0.25, 0.11, -0.3, 0.25, 0.11, -0.3, 0.012, 0.012, 4);
  if (shapeOn('shapegarden')) {
    // what a moulded lid has: a raised panel, a grip along the front, hinge knuckles; ribs down the body
    sh.push().local(0, 0.99, -0.3, -ajar);
    k.m(c, 'plastic');
    k.s.r *= 0.9;
    k.s.g *= 0.9;
    k.s.b *= 0.9;
    cbox(sh, 0, 0.041, 0.31, 0.5, 0.016, 0.52, 0.008, 1);
    cbox(sh, 0, 0.052, 0.595, 0.34, 0.012, 0.03, 0.005, 1);
    sh.pop();
    k.m(c, 'plastic');
    for (const x of [-0.17, 0, 0.17]) {
      sh.push().local(x, 0.985, -0.315, 0, 0, Math.PI / 2).cyl(0, -0.03, 0, 0.016, 0.016, 0.06, 6, 3).pop();
      sh.beam(x, 0.2, 0.235, x, 0.8, 0.27, 0.03, 0.012);
    }
    for (const s of [-1, 1]) for (const z of [-0.1, 0.1]) sh.beam(s * 0.235, 0.2, z, s * 0.27, 0.8, z, 0.012, 0.03);
    k.m('#8f949a', 'steel');
    for (const x of [-0.25, 0.25]) sh.push().local(x, 0.11, -0.3, 0, 0, Math.PI / 2).cyl(0, x > 0 ? 0.03 : -0.034, 0, 0.05, 0.05, 0.004, 8, x > 0 ? 2 : 1).pop();
  }
  // front lifting comb (a dark moulded bar under the rim) and the number label
  k.m(c, 'plastic');
  cbox(sh, 0, 0.84, 0.275, 0.42, 0.06, 0.04, 0.01);
  k.m('#f0f0e8', 'plastic');
  sh.box(0, 0.66, 0.262, 0.14, 0.09, 0.004, 0);
}

/** Two or three wheelie bins side by side along local x, lids / handles at the back (-Z). */
export function wheelieBins(k: Kit, rng: Rng, n = 2): void {
  const sh = k.sh;
  const cols = ['#3f4549', '#3f6e4a', '#2f5f9e', '#7a5232', '#b8443a'];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.68;
    const c = cols[(rng.int(0, cols.length - 1) + i) % cols.length];
    sh.push().local(x, 0, rng.range(-0.04, 0.04), 0, rng.range(-0.08, 0.08));
    if (BIN_DETAIL) {
      wheelieBin(k, rng, c);
      sh.pop();
      continue;
    }
    k.m(c, 'plastic');
    sh.box(0, 0.5, 0, 0.58, 1.0, 0.6, 1);
    sh.box(0, 1.02, 0.02, 0.62, 0.05, 0.66, 0);
    k.m('#1d1f22', 'rubber');
    for (const x of [-0.24, 0.24]) sh.push().local(x, 0.1, -0.3, 0, 0, Math.PI / 2).cyl(0, -0.03, 0, 0.1, 0.1, 0.06, 6, 3, false).pop();
    sh.pop();
  }
}

// ──────────────────────────────────────────────────────────── leisure ──

/** Two sun loungers with a little table. */
export function loungers(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const frame = rng.pick(['#f2f0ea', '#8a5b3a', '#3a3f44']);
  const cush = rng.pick(CUSHION);
  if (shapeOn('shapegarden')) {
    // a frame of rails on round legs and two wheels, a back on a strut, a thick cushion in sections with piped seams
    const wood = frame === '#8a5b3a';
    for (const x of [-0.55, 0.55]) {
      sh.push().local(x, 0, 0, 0, rng.range(-0.1, 0.1));
      k.m(frame, wood ? 'wood' : 'plastic');
      for (const s of [-1, 1]) cbox(sh, s * 0.29, 0.21, 0.2, 0.04, 0.05, 1.32, 0.012, 1);
      for (const z of [-0.42, 0.2, 0.84]) sh.box(0, 0.21, z, 0.58, 0.04, 0.03, 0);
      for (const s of [-1, 1]) sh.tube(s * 0.29, 0, 0.78, s * 0.29, 0.2, 0.78, 0.02, 0.018, 6);
      sh.push().local(0, 0.24, -0.44, 0.72, 0, 0);
      for (const s of [-1, 1]) cbox(sh, s * 0.29, 0, -0.32, 0.04, 0.04, 0.68, 0.012, 1);
      sh.box(0, 0, -0.63, 0.58, 0.036, 0.03, 0);
      k.m(cush, 'rubber');
      softBlob(sh, 0, 0.05, -0.32, 0.27, 0.045, 0.33, 0.3, 0.6, 0.012, 3, 5, 10);
      sh.pop();
      k.m('#2c2e30', 'rubber');
      for (const s of [-1, 1]) sh.push().local(s * 0.31, 0.09, -0.36, 0, 0, Math.PI / 2).cyl(0, -0.016, 0, 0.09, 0.09, 0.032, 12, 3).pop();
      k.m(cush, 'rubber');
      for (const z of [-0.2, 0.33, 0.73]) softBlob(sh, 0, 0.27, z, 0.27, 0.045, z === 0.33 ? 0.24 : z < 0 ? 0.26 : 0.15, 0.3, 0.6, 0.012, Math.round(z * 90) + 40, 5, 10);
      sh.pop();
    }
    k.m(frame, wood ? 'wood' : 'plastic');
    smoothLathe(sh, 0, 0.8, [[0.18, 0], [0.18, 0.02], [0.045, 0.05], [0.03, 0.2], [0.04, 0.37], [0.2, 0.38], [0.205, 0.395], [0.19, 0.41], [0, 0.41]], 14);
    return;
  }
  for (const x of [-0.55, 0.55]) {
    sh.push().local(x, 0, 0, 0, rng.range(-0.1, 0.1));
    k.m(frame, frame === '#8a5b3a' ? 'wood' : 'plastic');
    sh.box(0, 0.2, 0.15, 0.62, 0.06, 1.4, 1);
    for (const z of [-0.5, 0.75]) for (const xx of [-0.27, 0.27]) sh.box(xx, 0.09, z, 0.05, 0.18, 0.05, 1);
    sh.push().local(0, 0.42, -0.72, 0.85).box(0, 0, 0, 0.62, 0.06, 0.6, 0).pop();
    k.m(cush, 'rubber');
    sh.box(0, 0.26, 0.15, 0.56, 0.06, 1.3, 1);
    sh.push().local(0, 0.45, -0.7, 0.85).box(0, 0, 0.03, 0.56, 0.05, 0.56, 0).pop();
    sh.pop();
  }
  k.m(frame, 'plastic');
  sh.cyl(0, 0, 0.8, 0.18, 0.18, 0.4, 8, 2);
}

/** Stone bird bath. */
export function birdbath(k: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m(rng.pick(['#cfc6b4', '#b9b3a8', '#d8cdb8']), 'stone');
  if (shapeOn('shapegarden')) {
    // cast stone off a template: stepped foot, baluster, a shallow dished bowl with a rim, greener water
    smoothLathe(sh, 0, 0, [[0.2, 0], [0.2, 0.035], [0.15, 0.06], [0.1, 0.12], [0.07, 0.3], [0.09, 0.42], [0.075, 0.56], [0.1, 0.66], [0.26, 0.72], [0.325, 0.78], [0.325, 0.815], [0.29, 0.815], [0.25, 0.775]], 22);
    k.m('#6d8f7c', 'glass');
    sh.disc(0, 0.79, 0, 0.272, 22, 1);
    return;
  }
  sh.cyl(0, 0, 0, 0.18, 0.14, 0.08, 8, 2);
  sh.cyl(0, 0.08, 0, 0.08, 0.1, 0.62, 8, 0);
  sh.cyl(0, 0.7, 0, 0.12, 0.3, 0.1, 10, 0);
  k.m('#7fb6c8', 'glass');
  sh.disc(0, 0.79, 0, 0.26, 10, 1);
}

/** Fire pit with log seats. */
export function firepit(k: Kit, rng: Rng): void {
  const sh = k.sh;
  if (shapeOn('shapegarden')) {
    // a ring of split stones in two courses with caps, ash in the bottom, charred logs laid across, stumps round it
    const stones = 14;
    k.m('#34302c', 'stone');
    lathe(sh, 0, 0, [[0.48, 0], [0.47, 0.26]], 24);
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < stones; i++) {
        const a = ((i + c * 0.5) / stones) * TAU;
        k.m(rng.pick(['#6b665f', '#5f5a55', '#756f66', '#58534d']), 'stone');
        sh.push().local(Math.cos(a) * 0.46, 0.07 + c * 0.13, Math.sin(a) * 0.46, 0, -a);
        sh.box(0, 0, 0, 0.11, 0.115 + rng.range(-0.01, 0.01), 0.195, 1);
        sh.pop();
      }
    }
    for (let i = 0; i < stones; i++) {
      const a = ((i + 0.25) / stones) * TAU;
      k.m(rng.pick(['#7c776e', '#8a857b', '#6f6a62']), 'stone');
      sh.push().local(Math.cos(a) * 0.46, 0.27, Math.sin(a) * 0.46, 0, -a);
      sh.box(0, 0, 0, 0.17, 0.035, 0.205, 1);
      sh.pop();
    }
    k.m('#2a2725', 'stone');
    sh.disc(0, 0.12, 0, 0.39, 18, 1);
    k.m('#807b74', 'stone');
    softBlob(sh, 0, 0.12, 0, 0.27, 0.03, 0.27, 0.32, 0.6, 0.15, 3, 4, 10);
    const lit = rng.chance(0.6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      k.m('#1c1815', 'wood');
      sh.tube(Math.cos(a) * 0.27, 0.15, Math.sin(a) * 0.27, -Math.cos(a) * 0.1, 0.22, -Math.sin(a) * 0.1, 0.035, 0.03, 7);
    }
    if (lit) {
      k.e('#3a2a20', '#ff8a3a', 0.9, 0);
      sh.ellipsoid(0, 0.17, 0, 0.13, 0.035, 0.13, 0);
    }
    const seats = rng.int(3, 4);
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * TAU + rng.range(-0.2, 0.2);
      const x = Math.cos(a) * 1.05,
        z = Math.sin(a) * 1.05;
      k.m('#5e4632', 'wood');
      lathe(sh, x, z, [[0.21, 0], [0.185, 0.06], [0.18, 0.38]], 14);
      k.m('#c2a173', 'wood');
      sh.disc(x, 0.38, z, 0.17, 14, 1);
      k.m('#a5835a', 'wood');
      lathe(sh, x, z, [[0.1, 0.3815], [0.095, 0.3815]], 14);
    }
    return;
  }
  k.m('#5f5a55', 'stone');
  sh.cyl(0, 0, 0, 0.5, 0.48, 0.28, 10, 0);
  k.m('#1d1a18', 'stone');
  sh.disc(0, 0.27, 0, 0.4, 10, 1);
  k.e('#3a2a20', '#ff8a3a', rng.chance(0.6) ? 0.9 : 0, 0);
  sh.ellipsoid(0, 0.3, 0, 0.22, 0.06, 0.22, 0);
  const n = rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.2, 0.2);
    k.m('#8a6240', 'wood');
    sh.push().local(Math.cos(a) * 1.05, 0.2, Math.sin(a) * 1.05, 0, -a, Math.PI / 2);
    sh.cyl(0, -0.4, 0, 0.18, 0.18, 0.8, 6, 3, false);
    sh.pop();
  }
}

/** Stepping stone (flat disc). */
export function stone(k: Kit, r: number, tint: number): void {
  const c = 0.6 + tint * 0.12;
  k.m('#ffffff', 'stone');
  k.s.rgb(c * 0.62, c * 0.6, c * 0.56);
  k.sh.cyl(0, 0, 0, r, r * 0.96, 0.045, 7, 2, true, tint * 3);
}

/** Two or three terracotta pots with flowering plants. */
export function potPlants(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(0, 1);
    const x = Math.cos(a) * 0.17,
      z = Math.sin(a) * 0.17;
    const s = rng.range(0.75, 1.15);
    k.m(rng.pick(['#b8643f', '#a2553a', '#c9c3b7', '#3f4549']), 'ceramic');
    sh.cyl(x, 0, z, 0.1 * s, 0.14 * s, 0.24 * s, 7, 2);
    k.m(rng.pick(['#3f7a3a', '#4f8a3a', '#2f6a35']), 'wood');
    sh.ellipsoid(x, 0.3 * s, z, 0.15 * s, 0.13 * s, 0.15 * s, 0);
    k.m(rng.pick(['#e8649a', '#f2c84b', '#e8574f', '#b46ad6', '#f5f0e6']), 'plastic');
    sh.ellipsoid(x + 0.04, 0.39 * s, z, 0.07 * s, 0.05 * s, 0.07 * s, 0);
  }
}
