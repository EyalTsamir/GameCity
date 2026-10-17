// Back-garden kit models (placed by gardenPlan.ts): patio table sets, parasols, BBQs, sheds,
// trampolines, pools, swing sets, washing lines, raised vegetable beds, greenhouses, compost,
// wheelie bins, play houses, sandpits, loungers, bird baths, toys, fire pits, kennels.
//
// Local frame as in furniture.ts: origin on the ground at the item centre, +Y up, +Z = the item's
// front. Items fit their planned footprint (w along local x, d along local z).
// `k` is the kit the item goes to; big silhouettes are built into `ks` (the shadow-casting kit)
// where a builder takes one. Glass panes go to `g`.

import type { Rng } from '../../core/rng';
import { Kit } from './furniture';

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
  if (round) {
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
  // something on the table
  k.m(rng.pick(['#e9e4d8', '#7aa0c8', '#d9473f']), 'ceramic');
  sh.cyl(rng.range(-0.15, 0.15), round ? 0.74 : 0.75, rng.range(-0.1, 0.1), 0.08, 0.06, 0.12, 6, 2);
}

/** Rattan corner sofa + armchair + coffee table (fits 2.6 x 1.9 m). */
export function loungeSet(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const rattan = rng.pick(['#5a4232', '#3f3a36', '#8c7a62']);
  const cush = rng.pick(CUSHION);
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
}

/** Kettle BBQ or a small gas grill. */
export function bbq(k: Kit, rng: Rng): void {
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
    return;
  }
  k.m('#3a3f44', 'steel');
  sh.box(0, 0.42, 0, 0.95, 0.84, 0.5, 1);
  k.m('#1f2225', 'iron');
  sh.push().local(0, 0.98, -0.05, -0.35).box(0, 0, 0, 0.9, 0.28, 0.42, 0).pop();
  k.m('#9aa3a8', 'steel');
  sh.box(0.65, 0.82, 0, 0.36, 0.03, 0.42, 0);
  sh.box(-0.65, 0.82, 0, 0.36, 0.03, 0.42, 0);
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
    sh.push().local((sx * w) / 4 + sx * 0.04, (H + R) / 2 + 0.04, 0, 0, 0, sx * pitch);
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
    sh.cyl(w / 2 + 0.32, 0, d / 2 - 0.35, 0.28, 0.3, 0.8, 8, 2);
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
  for (const sx of [-1, 1]) sh.push().local(sx * w * 0.2, (H + R) / 2 + 0.03, 0, 0, 0, sx * pitch).box(0, 0, 0, Math.hypot(w * 0.4, R - H) + 0.12, 0.05, d * 0.8 + 0.2, 0).pop();
  k.m('#ffffff', 'paint');
  sh.box(0, 0.45, d * 0.4 + 0.01, 0.42, 0.8, 0.02, 0);
  k.m(roof, 'paint');
  sh.box(0, 0.45, d * 0.4 + 0.02, 0.34, 0.72, 0.02, 0);
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
  for (const sx of [-1, 1]) sh.push().local(sx * 0.18, 0.79, 0, 0, 0, sx * 0.64).box(0, 0, 0, 0.5, 0.04, 0.95, 0).pop();
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
  // glass
  g.m('#dfeeee', 'glass');
  gs.box(0, 0.24 + (H - 0.24) / 2, 0, w - 0.02, H - 0.24, d - 0.02, 3);
  for (const sx of [-1, 1]) gs.push().local((sx * w) / 4, (H + R) / 2, 0, 0, 0, sx * pitch).box(0, 0, 0, Math.hypot(w / 2, R - H), 0.01, d, 0).pop();
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
  k.m('#7d868d', 'steel');
  sh.cyl(0, Y - 0.05, 0, R, R, 0.06, 16, 0);
  k.m(pad, 'plastic');
  sh.cyl(0, Y, 0, R + 0.08, R + 0.04, 0.07, 16, 2);
  k.m('#1d1f22', 'rubber');
  sh.disc(0, Y + 0.075, 0, R - 0.26, 16, 1);
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
    sh.box(0, 0.22, 0, 0.36, 0.2, 0.62, 1);
    sh.box(0, 0.38, -0.06, 0.3, 0.14, 0.26, 0);
    k.m('#1d1f22', 'rubber');
    for (const x of [-0.19, 0.19]) for (const z of [-0.2, 0.2]) sh.push().local(x, 0.08, z, 0, 0, Math.PI / 2).cyl(0, -0.03, 0, 0.08, 0.08, 0.06, 6, 3, false).pop();
    sh.pop();
  }
}

// ──────────────────────────────────────────────────────────── water ──

const WATER_DEEP = '#2d9fc0';
const WATER_EDGE = '#7fd6e2';

/** In-ground pool w x d: stone coping, tiled waterline, graded water (lit turquoise at night), ladder, maybe a float. */
export function pool(k: Kit, rng: Rng, w: number, d: number): void {
  const sh = k.sh,
    s = k.s;
  const cw = 0.32;
  const iw = w - 2 * cw,
    id = d - 2 * cw;
  // coping
  k.m(rng.pick(['#e9e4d8', '#d8d2c4', '#c9c4ba']), 'stone');
  sh.box(0, 0.05, -d / 2 + cw / 2, w, 0.1, cw, 1);
  sh.box(0, 0.05, d / 2 - cw / 2, w, 0.1, cw, 1);
  sh.box(-w / 2 + cw / 2, 0.05, 0, cw, 0.1, id, 1);
  sh.box(w / 2 - cw / 2, 0.05, 0, cw, 0.1, id, 1);
  // tile band just inside the coping
  k.m('#2f6f8f', 'ceramic');
  sh.box(0, 0.045, 0, iw, 0.01, id, 1);
  // water: outer ring light (shallow tile), centre deep; emissive at night (pool lights)
  const y = 0.06;
  const glow = 0.55;
  const bx = iw / 2 - 0.04,
    bz = id / 2 - 0.04;
  const ix = bx * 0.62,
    iz = bz * 0.45;
  const V = (x: number, z: number, deep: boolean) => {
    if (deep) k.e(WATER_DEEP, '#3fd0e0', glow, 0);
    else k.e(WATER_EDGE, '#7fe8f0', glow * 0.8, 0);
    s.setEx(0, 0.08, 0);
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
  k.e('#1f6f99', '#3fd0e0', glow * 0.6, 0);
  sh.box(0, y + 0.003, 0, iw * 0.7, 0.002, 0.12, 1);
  // ladder
  const lx = rng.chance(0.5) ? -iw / 2 + 0.6 : iw / 2 - 0.6;
  k.m('#c9cfd2', 'steel');
  for (const dx of [-0.22, 0.22]) {
    sh.tube(lx + dx, 0.1, -id / 2 - cw * 0.5, lx + dx, 0.75, -id / 2 - cw * 0.5 + 0.05, 0.02, 0.02, 4);
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
  k.e(WATER_EDGE, '#7fe8f0', 0.45, 0);
  k.s.setEx(0, 0.08, 0);
  sh.disc(0, 0.86, 0, R - 0.03, 16, 1);
  k.e(WATER_DEEP, '#3fd0e0', 0.5, 0);
  k.s.setEx(0, 0.08, 0);
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
  k.m(c, 'plastic');
  sh.cyl(0, 0, 0, R, R, 0.14, 14, 0);
  k.m('#f4efe4', 'plastic');
  sh.cyl(0, 0.14, 0, R, R, 0.1, 14, 0);
  k.m(c, 'plastic');
  sh.cyl(0, 0.24, 0, R, R - 0.02, 0.1, 14, 2);
  k.e(WATER_EDGE, '#7fe8f0', 0.3, 0);
  k.s.setEx(0, 0.08, 0);
  sh.disc(0, 0.25, 0, R - 0.16, 14, 1);
  k.m(rng.pick(PLAY), 'plastic');
  sh.ellipsoid(R * 0.3, 0.32, -R * 0.2, 0.1, 0.1, 0.1, 0);
}

// ─────────────────────────────────────────────────────────── chores ──

/** Rotary washing line with laundry. */
export function washing(k: Kit, rng: Rng): void {
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
    k.m(rng.pick(cols), 'rubber');
    sh.push().local(x, H - (big ? 0.42 : 0.22), z, 0, -along);
    sh.box(0, 0, 0, big ? 0.7 : 0.36, big ? 0.8 : 0.42, 0.012, 0);
    sh.pop();
  }
}

/** n raised vegetable beds (2.4 x 1.1) in a row along z. */
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
    const crop = rng.int(0, 3);
    if (crop === 0) {
      // lettuce / cabbage heads
      for (let i = 0; i < 7; i++)
        for (const zz of [-0.25, 0.25]) {
          k.m(rng.pick(['#7fb04a', '#5f9a3a', '#9cc45a', '#6f8f4a']), 'wood');
          sh.ellipsoid(-0.95 + i * 0.32, 0.34, z + zz, 0.13, 0.1, 0.13, 0);
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

/** Two or three wheelie bins (local x = the row). */
export function wheelieBins(k: Kit, rng: Rng, n = 2): void {
  const sh = k.sh;
  const cols = ['#3f4549', '#3f6e4a', '#2f5f9e', '#7a5232', '#b8443a'];
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * 0.68;
    const c = cols[(rng.int(0, cols.length - 1) + i) % cols.length];
    sh.push().local(0, 0, z, 0, rng.range(-0.08, 0.08));
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
  sh.cyl(0, 0, 0, 0.18, 0.14, 0.08, 8, 2);
  sh.cyl(0, 0.08, 0, 0.08, 0.1, 0.62, 8, 0);
  sh.cyl(0, 0.7, 0, 0.12, 0.3, 0.1, 10, 0);
  k.m('#7fb6c8', 'glass');
  sh.disc(0, 0.79, 0, 0.26, 10, 1);
}

/** Fire pit with log seats. */
export function firepit(k: Kit, rng: Rng): void {
  const sh = k.sh;
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
