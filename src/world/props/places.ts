// W6 "dense real places": three spots dressed so densely with real, used, lived-in things that a visitor at eye
// level stops to look (NEXT-ROUND.md "Dense real places"):
//   • the market square — crate stacks behind the stalls, empty boxes and flattened cardboard, a sack truck and a
//     loaded platform trolley, an overflowing market bin, chalk boards at the aisle ends, sacks on a pallet,
//     dropped cabbage leaves / paper / fruit on the paving, pigeons pecking between the stalls;
//   • a café terrace (the biggest plaza café cluster) — a waiter station, box-hedge planters closing the
//     terrace, an A-board, stacked spare chairs, a dog bowl, cigarette stubs along the edge;
//   • a back yard (an old-town courtyard) — back door with a step and a mat, a wall light, downpipe into a water
//     butt, gas meter box, AC unit, wheelie bins + recycling boxes, a bicycle leaning on the wall, stacked
//     pallets, herb pots, a broom, a concrete apron with cracks and weeds, a washing line on two posts (the cloth
//     on it is animated by life/extras.ts from `service.lines`).
// Geometry goes into the props kits: big items into the fine furniture kit (< 300 m), small things into the
// near-detail cells (< ~30 m). Toggles: ?nomarketlife ?noterracelife ?nobackyard (all off on the low tier).

import type { CityContext } from '../../core/context';
import type { CityPlan as Plan, Area } from '../../core/plan';
import { OCC } from '../../core/occupancy';
import { Rng } from '../../core/rng';
import type { Kit } from './furniture';
import { aFrame } from './kit';
import { cbox, lathe } from './shapes';
import type { Cafe, PropsService } from './service';

const TAU = Math.PI * 2;

export interface PlacesEnv {
  ctx: CityContext;
  plan: Plan;
  /** ground height */
  H(x: number, z: number): number;
  /** fine furniture kit for world x (drawn < 300 m) */
  fine(x: number): Kit;
  /** near-detail kit of the cell at (x, z) (drawn < ~30 m) */
  near(x: number, z: number): Kit;
  /** is the disc (x, z, r) free of walkways, roads, buildings, water, features and furniture? */
  free(x: number, z: number, r: number, ignore?: { x: number; z: number }): boolean;
  /** claim a keep-clear disc */
  claim(x: number, z: number, r: number): void;
  /** contact grime under a footprint (frame x, z, yaw; local offset lx, lz; half extents hw × hd) */
  spot(x: number, y: number, z: number, yaw: number, lx: number, lz: number, hw: number, hd: number, r: number, pad: number, k: number): void;
  service: PropsService;
  inc(key: string): void;
}

export interface PlacesInfo {
  market?: { x: number; z: number; items: number };
  terrace?: { x: number; z: number; yaw: number; items: number };
  backyard?: { x: number; z: number; yaw: number; items: number };
}

// ───────────────────────────────────────────────────────────── objects ──

const WOOD = ['#b08a5a', '#a37c4c', '#c29c6a', '#9a7448', '#b89870'];
const PLASTIC_CRATE = ['#2f7a45', '#2b5f9a', '#2a2d30', '#c8452f', '#3b8a8a'];

/** Slatted wooden crate (w along x, d along z, h), open top; local origin = bottom centre. */
export function woodCrate(k: Kit, rng: Rng, w = 0.5, h = 0.3, d = 0.36, full?: string): void {
  const sh = k.sh;
  const wd = rng.pick(WOOD);
  // corner posts
  k.m('#8a6a44', 'wood');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.box(sx * (w / 2 - 0.018), h / 2, sz * (d / 2 - 0.018), 0.035, h, 0.035, 0);
  // two slats per long side + one per end, with gaps; end boards with a hand-hole band
  k.m(wd, 'wood');
  const sl = h * 0.36;
  for (const sz of [-1, 1]) {
    sh.box(0, sl / 2 + 0.01, sz * (d / 2 - 0.006), w, sl, 0.012, 0);
    sh.box(0, h - sl / 2, sz * (d / 2 - 0.006), w, sl, 0.012, 0);
  }
  for (const sx of [-1, 1]) {
    sh.box(sx * (w / 2 - 0.006), h * 0.32, 0, 0.012, h * 0.62, d - 0.02, 0);
    sh.box(sx * (w / 2 - 0.006), h - 0.025, 0, 0.012, 0.05, d - 0.02, 0);
  }
  // bottom slats (seen through the gaps)
  k.m('#7a5a38', 'wood');
  for (const x of [-w * 0.3, 0, w * 0.3]) sh.box(x, 0.006, 0, w * 0.22, 0.012, d - 0.02, 0);
  // stencilled mark on one side
  if (rng.chance(0.5)) {
    k.m('#3a2a20', 'wood');
    sh.box(rng.range(-0.08, 0.08), h - sl / 2, d / 2 + 0.001, 0.12, 0.04, 0.002, 0);
  }
  if (full) {
    // a few left-over pieces of produce / a crumpled paper lining
    k.m(full, 'plastic');
    for (let i = 0; i < 4; i++) sh.ellipsoid(rng.range(-w / 3, w / 3), 0.05, rng.range(-d / 4, d / 4), 0.04, 0.035, 0.04, 0);
  } else if (rng.chance(0.4)) {
    k.m('#e8e0cc', 'plastic');
    sh.box(0, 0.016, 0, w - 0.04, 0.004, d - 0.04, 1);
  }
}

/** Stackable plastic crate: walls with a grid of slots, hand holes, a rim; origin bottom centre. */
export function plasticCrate(k: Kit, rng: Rng, w = 0.6, h = 0.24, d = 0.4, col?: string): void {
  const sh = k.sh;
  const c = col ?? rng.pick(PLASTIC_CRATE);
  k.m(c, 'plastic');
  // rim + base frame
  sh.box(0, h - 0.015, 0, w, 0.03, d, 0);
  sh.box(0, 0.015, 0, w - 0.02, 0.03, d - 0.02, 0);
  // corner pillars + mid ribs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.box(sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02), 0.04, h, 0.04, 0);
  // walls: horizontal bars with slots between (dark inner wall reads as the openings)
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 3; i++) sh.box(0, 0.06 + i * 0.055, sz * (d / 2 - 0.008), w - 0.06, 0.018, 0.012, 0);
    for (const x of [-w / 4, 0, w / 4]) sh.box(x, h / 2, sz * (d / 2 - 0.008), 0.018, h - 0.04, 0.012, 0);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) sh.box(sx * (w / 2 - 0.008), 0.06 + i * 0.055, 0, 0.012, 0.018, d - 0.06, 0);
    sh.box(sx * (w / 2 - 0.008), h / 2, 0, 0.012, h - 0.04, 0.018, 0);
  }
  // floor
  sh.box(0, 0.008, 0, w - 0.04, 0.012, d - 0.04, 0);
}

/** Cardboard box (closed or with flaps open); origin bottom centre. */
export function cardBox(k: Kit, rng: Rng, w = 0.5, h = 0.32, d = 0.36, open = false): void {
  const sh = k.sh;
  const c = rng.pick(['#b8925e', '#c49c66', '#a88452', '#c8a878']);
  k.m(c, 'wood');
  if (!open) {
    cbox(sh, 0, h / 2, 0, w, h, d, 0.006, 1);
    // tape strip over the top seam + printed logo
    k.m('#c8b48a', 'plastic');
    sh.box(0, h + 0.001, 0, 0.05, 0.002, d + 0.004, 0);
    sh.box(0, h * 0.55, d / 2 + 0.001, 0.05, h * 0.9, 0.002, 0);
    k.m(rng.pick(['#2b4a7a', '#7a2b2b', '#2b5a3a', '#333333']), 'plastic');
    sh.box(rng.range(-0.08, 0.08), h * 0.6, d / 2 + 0.002, w * 0.36, h * 0.18, 0.002, 0);
  } else {
    // walls (thin) + open flaps tilted out
    for (const sz of [-1, 1]) sh.box(0, h / 2, (sz * d) / 2, w, h, 0.006, 0);
    for (const sx of [-1, 1]) sh.box((sx * w) / 2, h / 2, 0, 0.006, h, d, 0);
    sh.box(0, 0.003, 0, w, 0.006, d, 0);
    for (const sz of [-1, 1]) sh.push().local(0, h, (sz * d) / 2, sz * rng.range(0.5, 1.3)).box(0, 0, sz * d * 0.25, w - 0.01, 0.005, d * 0.5, 0).pop();
    for (const sx of [-1, 1]) sh.push().local((sx * w) / 2, h, 0, 0, 0, -sx * rng.range(0.4, 1.4)).box(sx * w * 0.15, 0, 0, w * 0.3, 0.005, d - 0.01, 0).pop();
    k.m('#5a4630', 'wood');
    sh.box(0, 0.008, 0, w - 0.02, 0.004, d - 0.02, 0);
  }
}

/** Flattened cardboard stack (tied with string), lying on the ground. */
export function flatCardboard(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    k.m(rng.pick(['#b8925e', '#c49c66', '#a88452', '#d0b080']), 'wood');
    sh.push().local(rng.range(-0.05, 0.05), 0.006 + i * 0.009, rng.range(-0.04, 0.04), 0, rng.range(-0.15, 0.15));
    sh.box(0, 0, 0, rng.range(0.7, 0.95), 0.008, rng.range(0.45, 0.6), 0);
    sh.pop();
  }
  k.m('#e8dcc0', 'plastic');
  sh.box(0, n * 0.009 + 0.004, 0, 0.012, 0.004, 0.62, 0);
}

/** Two-wheeled sack truck standing upright (nose plate on the ground, handles up), facing +Z. */
export function sackTruck(k: Kit, rng: Rng, load = true): void {
  const sh = k.sh;
  const c = rng.pick(['#c8452f', '#2b5f9a', '#3a3d40', '#d8b24a']);
  const lean = 0.18;
  sh.push().local(0, 0, 0, -lean);
  k.m(c, 'iron');
  for (const x of [-0.17, 0.17]) sh.tube(x, 0.05, 0, x, 1.15, 0, 0.014, 0.014, 6);
  sh.tube(-0.17, 1.15, 0, -0.12, 1.24, -0.03, 0.014, 0.014, 6);
  sh.tube(0.17, 1.15, 0, 0.12, 1.24, -0.03, 0.014, 0.014, 6);
  k.m('#1c1e20', 'plastic');
  sh.tube(-0.12, 1.24, -0.03, 0.12, 1.24, -0.03, 0.018, 0.018, 6);
  k.m(c, 'iron');
  for (const y of [0.35, 0.65, 0.95]) sh.tube(-0.17, y, 0, 0.17, y, 0, 0.009, 0.009, 5);
  k.m('#9aa2a6', 'iron');
  sh.box(0, 0.006, 0.12, 0.36, 0.012, 0.24, 0);
  sh.pop();
  // wheels (axle behind the frame foot)
  for (const x of [-0.22, 0.22]) {
    sh.push().local(x, 0.13, -0.1, 0, 0, Math.PI / 2);
    k.m('#1c1e20', 'plastic');
    sh.cyl(0, -0.03, 0, 0.13, 0.13, 0.06, 12, 3);
    k.m('#b8bcc0', 'iron');
    sh.cyl(0, -0.032, 0, 0.06, 0.06, 0.064, 8, 3);
    sh.pop();
  }
  if (load) {
    sh.push().local(0, 0.02, 0.1, -lean);
    cardBox(k, rng, 0.42, 0.34, 0.3);
    sh.push().local(0, 0.34, 0, 0, rng.range(-0.1, 0.1));
    cardBox(k, rng, 0.38, 0.28, 0.28);
    sh.pop();
    sh.pop();
  }
}

/** Platform trolley: plywood deck on four castors, a push handle at -Z; returns the deck height. */
export function platformTrolley(k: Kit, rng: Rng): number {
  const sh = k.sh;
  const L = 0.9,
    W = 0.6,
    dy = 0.17;
  k.m('#7a6a52', 'wood');
  cbox(sh, 0, dy - 0.012, 0, W, 0.024, L, 0.004, 0);
  k.m('#2a2d30', 'iron');
  sh.box(0, dy - 0.03, 0, W - 0.02, 0.02, L - 0.02, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.08),
        z = sz * (L / 2 - 0.08);
      k.m('#8a8f94', 'iron');
      sh.box(x, dy - 0.06, z, 0.05, 0.04, 0.05, 0);
      k.m('#2a2a2a', 'plastic');
      sh.push().local(x, 0.055, z + 0.02, 0, 0, Math.PI / 2).cyl(0, -0.016, 0, 0.055, 0.055, 0.032, 10, 3).pop();
    }
  k.m(rng.pick(['#2b5f9a', '#3a3d40', '#c8452f']), 'iron');
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) sh.tube(x, dy, -L / 2 + 0.03, x, dy + 0.85, -L / 2 + 0.01, 0.013, 0.013, 6);
  sh.tube(-W / 2 + 0.04, dy + 0.85, -L / 2 + 0.01, W / 2 - 0.04, dy + 0.85, -L / 2 + 0.01, 0.016, 0.016, 6);
  return dy;
}

/** Wooden pallet (1.2 × 0.8 EUR): top boards, blocks, bottom boards; origin bottom centre; returns height. */
export function pallet(k: Kit, rng: Rng, tint = 0): number {
  const sh = k.sh;
  const c = ['#b8a07a', '#a08868', '#9a8a70', '#c0a880'][tint & 3];
  k.m(c, 'wood');
  for (const z of [-0.33, 0, 0.33]) sh.box(0, 0.011, z, 1.2, 0.022, 0.1, 0);
  for (const x of [-0.55, 0, 0.55]) for (const z of [-0.33, 0, 0.33]) sh.box(x, 0.022 + 0.039, z, 0.1, 0.078, z === 0 ? 0.1 : 0.14, 0);
  for (const x of [-0.55, 0, 0.55]) sh.box(x, 0.1 + 0.011, 0, 0.1, 0.022, 0.8, 0);
  for (let i = 0; i < 5; i++) {
    k.m(rng.chance(0.15) ? '#8a7a60' : c, 'wood');
    sh.box(0, 0.122 + 0.011, -0.36 + i * 0.18, 1.2, 0.022, i % 4 === 0 ? 0.14 : 0.1, 0);
  }
  // EPAL stamp on the middle block
  k.m('#4a3a28', 'wood');
  sh.box(0, 0.06, 0.4 + 0.001, 0.06, 0.04, 0.002, 0);
  return 0.144;
}

/** Hessian sack, filled and slumped; origin bottom centre. */
export function sack(k: Kit, rng: Rng, lying = false): void {
  const sh = k.sh;
  k.m(rng.pick(['#b09a6e', '#a08a5e', '#c0a878']), 'wood');
  if (lying) {
    sh.ellipsoid(0, 0.13, 0, 0.26, 0.13, 0.4, 1);
    sh.ellipsoid(0, 0.12, 0.38, 0.14, 0.08, 0.1, 0);
  } else {
    sh.ellipsoid(0, 0.2, 0, 0.24, 0.21, 0.2, 1);
    sh.ellipsoid(0, 0.42, 0, 0.17, 0.13, 0.15, 1);
    sh.cyl(0, 0.5, 0, 0.06, 0.045, 0.12, 6, 2);
    k.m('#d8c8a0', 'wood');
    sh.cyl(0, 0.55, 0, 0.062, 0.062, 0.02, 6, 0);
  }
  k.m('#5a3a2a', 'wood');
  sh.box(0, lying ? 0.2 : 0.25, lying ? 0 : 0.2, 0.14, 0.08, 0.004, 0);
}

/** Pigeon (feral rock dove), standing or pecking; origin at the feet, facing +Z. ~33 cm long. */
export function pigeon(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const peck = rng.chance(0.45);
  const tone = rng.range(-0.06, 0.06);
  // morphs: blue-bar (common), chequer (darker), a pale one
  const morph = rng.next();
  const body = morph < 0.6 ? '#8c939c' : morph < 0.9 ? '#6e737a' : '#b8b2a8';
  k.m('#c46a6a', 'plastic');
  // legs
  for (const x of [-0.025, 0.025]) sh.tube(x, 0.0, 0.005, x, 0.05, 0.0, 0.005, 0.005, 4);
  sh.push().local(0, 0.11, 0, peck ? 0.35 : -0.12);
  k.m(body, 'plastic');
  sh.ellipsoid(0, 0, 0, 0.065 + tone * 0.1, 0.06, 0.12, 1);
  // wings folded over the back with two dark bars, primaries crossing over the tail
  k.m(morph < 0.6 ? '#9aa1aa' : '#7a8088', 'plastic');
  for (const s of [-1, 1]) sh.ellipsoid(s * 0.045, 0.012, -0.03, 0.03, 0.045, 0.11, 0);
  k.m('#2e3236', 'plastic');
  for (const s of [-1, 1]) {
    sh.box(s * 0.066, 0.02, -0.02, 0.006, 0.012, 0.05, 0);
    sh.box(s * 0.066, 0.002, -0.055, 0.006, 0.012, 0.05, 0);
  }
  // tail with a dark terminal band
  k.m('#7a8088', 'plastic');
  sh.push().local(0, 0.01, -0.14, -0.15).box(0, 0, 0, 0.07, 0.014, 0.1, 0).pop();
  k.m('#2e3236', 'plastic');
  sh.push().local(0, 0.003, -0.19, -0.15).box(0, 0, 0, 0.07, 0.016, 0.02, 0).pop();
  // neck with the green / purple sheen, head, white cere, dark beak, orange eye
  sh.push().local(0, 0.05, 0.08, peck ? 0.9 : -0.2);
  k.m('#5f7a6e', 'plastic');
  sh.ellipsoid(0, 0.02, 0, 0.042, 0.055, 0.045, 0);
  k.m('#6a5a7e', 'plastic');
  sh.ellipsoid(0, 0.005, 0.012, 0.044, 0.035, 0.04, 0);
  k.m('#6e747c', 'plastic');
  sh.ellipsoid(0, 0.075, 0.015, 0.03, 0.03, 0.035, 0);
  k.m('#e8e4dc', 'plastic');
  sh.ellipsoid(0, 0.078, 0.05, 0.008, 0.007, 0.01, 0);
  k.m('#2a2a2a', 'plastic');
  sh.box(0, 0.072, 0.06, 0.008, 0.008, 0.022, 0);
  k.m('#e08a2a', 'plastic');
  for (const s of [-1, 1]) sh.box(s * 0.027, 0.083, 0.03, 0.004, 0.009, 0.009, 0);
  sh.pop();
  sh.pop();
}

/** Litter that falls off a market: cabbage leaves, paper, a squashed tomato, orange peel, a receipt. */
export function litter(k: Kit, rng: Rng, n: number, R: number): void {
  const sh = k.sh;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU),
      r = Math.sqrt(rng.next()) * R;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    const kind = rng.next();
    sh.push().local(x, 0.004 + i * 0.0004, z, 0, rng.range(0, TAU));
    if (kind < 0.35) {
      // cabbage / lettuce leaf: a curled pair of quads
      k.m(rng.pick(['#7fa85a', '#9ac070', '#5f8a42', '#b8c890']), 'plastic');
      const s = rng.range(0.08, 0.16);
      sh.push().local(0, 0, 0, 0, 0, 0.25).box(-s * 0.3, 0.006, 0, s * 0.6, 0.004, s, 0).pop();
      sh.push().local(0, 0, 0, 0, 0, -0.25).box(s * 0.3, 0.006, 0, s * 0.6, 0.004, s * 0.95, 0).pop();
      k.m('#e8f0d0', 'plastic');
      sh.box(0, 0.003, 0, 0.012, 0.004, s * 0.9, 0);
    } else if (kind < 0.6) {
      // paper: a crumpled ball or a flat sheet
      k.m(rng.pick(['#efece4', '#e4ddc8', '#f4f2ee', '#d8d0bc']), 'plastic');
      if (rng.chance(0.4)) sh.ellipsoid(0, 0.025, 0, 0.035, 0.028, 0.032, 0);
      else sh.push().local(0, 0, 0, rng.range(-0.05, 0.05)).box(0, 0.002, 0, rng.range(0.1, 0.2), 0.002, rng.range(0.08, 0.28), 0).pop();
    } else if (kind < 0.72) {
      k.m('#a8281e', 'plastic');
      sh.ellipsoid(0, 0.006, 0, 0.035, 0.008, 0.03, 0);
      k.m('#c84a3a', 'plastic');
      sh.box(0.04, 0.002, 0.01, 0.05, 0.002, 0.03, 0);
    } else if (kind < 0.84) {
      k.m('#e8892a', 'plastic');
      for (let j = 0; j < 3; j++) sh.push().local(j * 0.03 - 0.03, 0.006, rng.range(-0.02, 0.02), 0, j, 0.3).box(0, 0, 0, 0.04, 0.006, 0.025, 0).pop();
    } else if (kind < 0.93) {
      // wooden lolly stick / a bit of string
      k.m('#d8c8a0', 'wood');
      sh.box(0, 0.003, 0, 0.012, 0.004, 0.11, 0);
    } else {
      // a flattened plastic cup
      k.m(rng.pick(['#f4f4f4', '#e8574f', '#3f73b0']), 'plastic');
      sh.box(0, 0.004, 0, 0.07, 0.008, 0.1, 0);
    }
    sh.pop();
  }
}

/** 1100 l wheeled container with the lid propped on overflowing bags; origin bottom centre, front +Z. */
export function marketBin(k: Kit, rng: Rng, kd?: Kit): void {
  const sh = k.sh;
  const c = rng.pick(['#3a5f4a', '#5a6066', '#2b4a6a']);
  const W = 1.26,
    D = 1.0,
    H = 1.2;
  k.m(c, 'paint');
  // tapered body (bottom narrower), seen as a chamfered box on a frame
  sh.push().local(0, 0.16, 0);
  cbox(sh, 0, (H - 0.16) / 2, 0, W, H - 0.16, D, 0.03, 1);
  // stiffening ribs and the front lifting comb
  k.m(c, 'paint');
  for (const x of [-0.42, 0, 0.42]) sh.box(x, (H - 0.16) / 2, D / 2 + 0.012, 0.06, H - 0.3, 0.024, 0);
  k.m('#2a2d30', 'iron');
  sh.box(0, H - 0.3, D / 2 + 0.04, W - 0.1, 0.08, 0.05, 0);
  // side handles
  for (const s of [-1, 1]) sh.tube(s * (W / 2 + 0.03), H - 0.45, -0.25, s * (W / 2 + 0.03), H - 0.45, 0.25, 0.014, 0.014, 5);
  sh.pop();
  // castors
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.m('#8a8f94', 'iron');
      sh.box(sx * 0.45, 0.13, sz * 0.32, 0.06, 0.06, 0.06, 0);
      k.m('#1c1e20', 'plastic');
      sh.push().local(sx * 0.45, 0.07, sz * 0.32, 0, 0, Math.PI / 2).cyl(0, -0.02, 0, 0.07, 0.07, 0.04, 10, 3).pop();
    }
  // lids: back one closed, front one propped open on the heap
  const y0 = H + 0.01;
  k.m(c, 'paint');
  sh.box(0, y0 + 0.02, -D / 4, W, 0.04, D / 2, 0);
  sh.push().local(0, y0 + 0.02, 0.0, -0.75).box(0, 0, D / 4, W, 0.04, D / 2, 0).pop();
  // bags heaped through the gap, one fallen next to the bin, a box on top
  for (let i = 0; i < 5; i++) {
    k.m(rng.pick(['#1e2022', '#2a2c2e', '#3a5a3a', '#1e2022', '#b8b8b0']), 'plastic');
    sh.ellipsoid(rng.range(-0.4, 0.4), y0 + rng.range(0.02, 0.15), rng.range(0.05, 0.35), rng.range(0.18, 0.25), rng.range(0.14, 0.2), rng.range(0.16, 0.22), 1);
  }
  k.m('#1e2022', 'plastic');
  sh.ellipsoid(W / 2 + 0.25, 0.18, 0.2, 0.22, 0.18, 0.24, 1);
  sh.cyl(W / 2 + 0.25, 0.32, 0.2, 0.04, 0.02, 0.1, 5, 2);
  sh.push().local(-W / 2 - 0.3, 0, 0.15, 0, 0.4);
  cardBox(k, rng, 0.5, 0.3, 0.38, true);
  sh.pop();
  if (kd) {
    // a sticker and the collection number on the front
    kd.m('#f0e8d0', 'plastic');
    kd.sh.box(0.3, 0.8, D / 2 + 0.026, 0.16, 0.1, 0.002, 0);
    kd.m('#e8c83a', 'plastic');
    kd.sh.box(-0.35, 0.95, D / 2 + 0.026, 0.12, 0.12, 0.002, 0);
  }
}

/** Dog water bowl (steel) on a little puddle. */
function dogBowl(k: Kit): void {
  const sh = k.sh;
  k.m('#3a4048', 'plastic');
  sh.cyl(0, 0.001, 0, 0.2, 0.2, 0.002, 12, 2);
  k.m('#c8ccd0', 'iron');
  lathe(sh, 0, 0, [[0.09, 0], [0.11, 0.05], [0.12, 0.055], [0.1, 0.05], [0.085, 0.012]], 14);
  k.m('#7a9aa8', 'glass');
  sh.cyl(0, 0.03, 0, 0.088, 0.088, 0.002, 12, 2);
}

/** Cigarette stubs + a bottle cap or two, scattered within R. */
function stubs(k: Kit, rng: Rng, n: number, R: number): void {
  const sh = k.sh;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU),
      r = Math.sqrt(rng.next()) * R;
    sh.push().local(Math.cos(a) * r, 0.005, Math.sin(a) * r, 0, rng.range(0, TAU));
    if (rng.chance(0.85)) {
      k.m('#f0ece4', 'plastic');
      sh.box(0, 0, 0.012, 0.008, 0.008, 0.02, 0);
      k.m('#d8a060', 'plastic');
      sh.box(0, 0, -0.008, 0.0085, 0.0085, 0.02, 0);
      k.m('#3a3430', 'plastic');
      sh.box(0, 0, 0.0225, 0.007, 0.007, 0.002, 0);
    } else {
      k.m(rng.pick(['#c8a040', '#b8b8b8', '#c83a2a']), 'iron');
      sh.cyl(0, -0.003, 0, 0.014, 0.014, 0.006, 8, 2);
    }
    sh.pop();
  }
}

/** Box-hedge planter (terrace divider): timber trough, clipped box hedge on top. Long axis x. */
function hedgePlanter(k: Kit, rng: Rng, L = 1.6): void {
  const sh = k.sh;
  const W = 0.45,
    H = 0.5;
  k.m(rng.pick(['#3a3f3c', '#5a4a3a', '#2c3033']), 'wood');
  cbox(sh, 0, H / 2, 0, L, H, W, 0.012, 1);
  k.m('#2a2622', 'wood');
  for (let i = 1; i < 6; i++) sh.box(-L / 2 + (L * i) / 6, H / 2, W / 2 + 0.001, 0.008, H - 0.06, 0.002, 0);
  k.m('#3a2a1c', 'wood');
  sh.box(0, H - 0.03, 0, L - 0.06, 0.02, W - 0.06, 0);
  // the hedge: clipped block with a slightly rounded top, darker inside
  k.m('#2f5a2a', 'plastic');
  cbox(sh, 0, H + 0.28, 0, L - 0.1, 0.56, W - 0.08, 0.07, 1);
  k.m('#3f6e34', 'plastic');
  for (let i = 0; i < 9; i++) sh.ellipsoid(rng.range(-L / 2 + 0.15, L / 2 - 0.15), H + 0.5 + rng.range(0, 0.06), rng.range(-0.1, 0.1), 0.12, 0.08, 0.12, 0);
}

/** Waiter station: cabinet with drawers, a tray of cutlery, menus, napkins, a water carafe; faces +Z. */
function waiterStation(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  const wood = rng.pick(['#5a3a24', '#3a2a20', '#7a5236']);
  k.m(wood, 'wood');
  cbox(sh, 0, 0.46, 0, 0.8, 0.88, 0.45, 0.012, 1);
  k.m('#2a2622', 'wood');
  sh.box(0, 0.06, 0, 0.76, 0.12, 0.42, 0);
  k.m(wood, 'wood');
  for (let i = 0; i < 3; i++) {
    sh.box(0, 0.73 - i * 0.2, 0.226, 0.72, 0.16, 0.012, 0);
    k.m('#c8a860', 'iron');
    sh.box(0, 0.73 - i * 0.2, 0.236, 0.12, 0.018, 0.012, 0);
    k.m(wood, 'wood');
  }
  k.m('#e9e4d8', 'stone');
  sh.box(0, 0.915, 0, 0.84, 0.03, 0.48, 0);
  const d = kd.sh;
  // cutlery tray with dividers and handles sticking up
  kd.m('#6a6058', 'plastic');
  d.box(-0.2, 0.95, 0.05, 0.3, 0.04, 0.22, 1);
  kd.m('#d0d4d8', 'iron');
  for (let i = 0; i < 9; i++) d.box(-0.32 + (i % 3) * 0.1 + rng.range(-0.02, 0.02), 0.975, -0.02 + Math.floor(i / 3) * 0.07, 0.012, 0.008, 0.16, 0);
  // stack of menus, napkin pile, carafe, glasses upside down
  kd.m('#2a3a2a', 'plastic');
  d.box(0.15, 0.935 + 0.012, 0.08, 0.24, 0.024, 0.34, 0);
  kd.m('#c8a860', 'plastic');
  d.box(0.15, 0.96, 0.08, 0.12, 0.002, 0.04, 0);
  kd.m('#f4f2ee', 'plastic');
  d.box(0.15, 0.935 + 0.05, -0.12, 0.16, 0.05, 0.16, 0);
  kd.m('#cfe3e8', 'glass');
  d.cyl(0.33, 0.93, -0.1, 0.045, 0.04, 0.2, 8, 2);
  for (const [x, z] of [[0.3, 0.1], [0.36, 0.06], [0.33, 0.16]]) d.cyl(x, 0.93, z, 0.032, 0.036, 0.09, 8, 2);
}

/** Stack of three spare bistro chairs. */
function chairStack(k: Kit, col: string): void {
  const sh = k.sh;
  for (let i = 0; i < 3; i++) {
    sh.push().local(0, i * 0.05, -i * 0.025, 0);
    k.m(col, 'iron');
    for (const x of [-0.18, 0.18]) {
      sh.tube(x, 0, 0.18, x, 0.44, 0.17, 0.011, 0.011, 5);
      sh.tube(x, 0, -0.18, x, 0.88, -0.22, 0.011, 0.011, 5);
    }
    sh.cyl(0, 0.43, 0, 0.21, 0.21, 0.025, 12, 2);
    sh.tube(-0.18, 0.86, -0.22, 0.18, 0.86, -0.22, 0.012, 0.012, 5);
    sh.tube(-0.18, 0.7, -0.2, 0.18, 0.7, -0.2, 0.01, 0.01, 5);
    sh.pop();
  }
}

/** Bicycle leaning on its right pedal / a wall: frame tubes, wheels as rings, saddle, bars; along x. */
function bicycle(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const col = rng.pick(['#2b5f9a', '#c8452f', '#2a2d30', '#3b6a4a', '#d8d4ca', '#8d6cab']);
  const R = 0.34;
  for (const x of [-0.52, 0.52]) {
    k.m('#1c1e20', 'plastic');
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * TAU,
        a1 = ((i + 1) / 18) * TAU;
      sh.tube(x + Math.cos(a0) * R, R + Math.sin(a0) * R, 0, x + Math.cos(a1) * R, R + Math.sin(a1) * R, 0, 0.018, 0.018, 4);
    }
    k.m('#b8bcc0', 'iron');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      sh.tube(x, R, 0, x + Math.cos(a) * (R - 0.02), R + Math.sin(a) * (R - 0.02), 0, 0.002, 0.002, 3);
    }
    sh.cyl(x, R - 0.025, 0, 0.025, 0.025, 0.05, 6, 2);
  }
  k.m(col, 'iron');
  const B = [-0.05, 0.3], S = [-0.16, 0.85], Hh = [0.4, 0.82];
  const seg = (a: number[], b: number[], r = 0.016) => sh.tube(a[0], a[1], 0, b[0], b[1], 0, r, r, 5);
  seg(B, S);
  seg(B, Hh, 0.019);
  seg(S, Hh);
  seg(B, [-0.52, R]);
  seg(S, [-0.52, R], 0.011);
  seg(Hh, [0.52, R], 0.014);
  k.m('#1c1e20', 'plastic');
  sh.box(-0.18, 0.9, 0, 0.24, 0.05, 0.12, 0);
  k.m('#9aa2a6', 'iron');
  sh.tube(-0.17, 0.85, 0, -0.18, 0.88, 0, 0.012, 0.012, 4);
  sh.tube(0.4, 0.82, 0, 0.36, 0.98, 0, 0.012, 0.012, 4);
  sh.tube(0.36, 0.98, -0.25, 0.36, 0.98, 0.25, 0.011, 0.011, 4);
  k.m('#1c1e20', 'plastic');
  for (const z of [-0.25, 0.25]) sh.tube(0.36, 0.98, z * 0.8, 0.36, 0.98, z, 0.016, 0.016, 5);
  // chain ring, mudguard, a basket on some
  k.m('#5a5e62', 'iron');
  sh.push().local(-0.05, 0.3, 0.03, Math.PI / 2).cyl(0, 0, 0, 0.09, 0.09, 0.006, 12, 3).pop();
  if (rng.chance(0.5)) {
    k.m('#8a6a44', 'wood');
    sh.box(0.6, 0.9, 0, 0.26, 0.18, 0.32, 1);
  }
}

/** Back door: frame, panelled leaf, step, mat, wall light, letter of the house number; door plane local z=0. */
function backDoor(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  const col = rng.pick(['#3a5a4a', '#7a2b2b', '#2b4a6a', '#5a4a3a', '#d8d0bc']);
  // frame (proud of the wall), leaf set back 4 cm in its own reveal, threshold
  k.m('#e8e2d4', 'paint');
  sh.box(-0.5, 1.05, 0.03, 0.08, 2.1, 0.06, 0);
  sh.box(0.5, 1.05, 0.03, 0.08, 2.1, 0.06, 0);
  sh.box(0, 2.14, 0.03, 1.08, 0.08, 0.06, 0);
  k.m('#141618', 'paint');
  sh.box(0, 1.05, -0.005, 0.92, 2.1, 0.01, 0);
  k.m(col, 'paint');
  sh.box(0, 1.02, 0.02, 0.9, 2.04, 0.04, 0);
  // four raised panels + glazed top light
  for (const [y, h] of [[0.45, 0.6], [1.2, 0.6]] as const) for (const x of [-0.2, 0.2]) cbox(sh, x, y, 0.045, 0.3, h, 0.02, 0.006, 0);
  k.m('#2a3438', 'glass');
  sh.box(0, 1.78, 0.042, 0.66, 0.36, 0.01, 0);
  k.m('#c8ccd0', 'iron');
  sh.box(0.34, 1.02, 0.06, 0.03, 0.14, 0.02, 0);
  sh.box(0.31, 1.06, 0.08, 0.1, 0.018, 0.018, 0);
  // concrete step with worn nosing, coir mat
  k.m('#a8a49a', 'stone');
  cbox(sh, 0, 0.09, 0.22, 1.2, 0.18, 0.42, 0.015, 1);
  k.m('#8a6a44', 'wood');
  cbox(sh, 0, 0.19, 0.22, 0.7, 0.02, 0.38, 0.006, 1);
  k.m('#6a4a2a', 'wood');
  sh.box(0, 0.201, 0.22, 0.56, 0.002, 0.26, 0);
  // wall light (bulkhead) above the frame
  k.m('#2a2d30', 'iron');
  sh.box(0, 2.38, 0.06, 0.24, 0.14, 0.1, 0);
  k.e('#f4ecd8', '#ffc979', 1.8);
  sh.box(0, 2.38, 0.112, 0.18, 0.09, 0.004, 0);
  // number, bell and a dangling cable
  kd.m('#c8a860', 'iron');
  kd.sh.box(-0.65, 1.55, 0.012, 0.08, 0.12, 0.006, 0);
  kd.m('#e8e4dc', 'plastic');
  kd.sh.box(-0.65, 1.25, 0.012, 0.05, 0.08, 0.02, 0);
}

/** Gas meter box on the wall (cream GRP cabinet, key slot, warning label). Plane local z = 0. */
function meterBox(k: Kit): void {
  const sh = k.sh;
  k.m('#e8e0c8', 'plastic');
  cbox(sh, 0, 0.6, 0.13, 0.55, 0.62, 0.26, 0.02, 0);
  k.m('#c8bca0', 'plastic');
  sh.box(0, 0.6, 0.262, 0.5, 0.56, 0.004, 0);
  k.m('#2a2a2a', 'iron');
  sh.box(0.18, 0.6, 0.266, 0.03, 0.03, 0.004, 0);
  k.m('#e8c83a', 'plastic');
  sh.box(0, 0.8, 0.266, 0.2, 0.06, 0.003, 0);
  k.m('#c8b81a', 'iron');
  sh.tube(-0.15, 0.29, 0.1, -0.15, 0.0, 0.1, 0.014, 0.014, 6);
}

/** AC condenser on wall brackets, with a condensate pipe and a stain below. Plane z = 0. */
function acUnit(k: Kit, kd: Kit): void {
  const sh = k.sh;
  k.m('#5a5e62', 'iron');
  for (const x of [-0.3, 0.3]) {
    sh.box(x, 1.8, 0.2, 0.04, 0.04, 0.42, 0);
    sh.tube(x, 1.82, 0.0, x, 2.05, 0.0, 0.015, 0.015, 4);
    sh.tube(x, 2.05, 0.0, x, 1.82, 0.38, 0.012, 0.012, 4);
  }
  k.m('#e4e4e0', 'paint');
  cbox(sh, 0, 2.12, 0.19, 0.8, 0.58, 0.3, 0.015, 0);
  k.m('#2a2d30', 'iron');
  sh.cyl(-0.1, 2.12, 0.345, 0.2, 0.2, 0.005, 16, 2, true);
  kd.m('#b8bcc0', 'iron');
  for (let i = 0; i < 5; i++) kd.sh.box(-0.1, 1.95 + i * 0.085, 0.352, 0.4, 0.008, 0.008, 0);
  for (let i = -2; i <= 2; i++) kd.sh.box(-0.1 + i * 0.085, 2.12, 0.353, 0.008, 0.4, 0.008, 0);
  kd.m('#d8d4cc', 'plastic');
  kd.sh.tube(0.32, 1.85, 0.2, 0.32, 0.2, 0.05, 0.012, 0.012, 5);
  kd.sh.tube(0.32, 2.0, 0.1, -0.5, 2.0, 0.02, 0.025, 0.025, 6);
  kd.m('#3a4040', 'stone');
  kd.sh.box(0.32, 0.6, 0.006, 0.1, 1.2, 0.002, 0);
}

/** Downpipe from the eaves to a water butt with a diverter. Plane z = 0, height top. */
function downpipeButt(k: Kit, rng: Rng, top: number): void {
  const sh = k.sh;
  k.m('#3a3d40', 'iron');
  sh.cyl(0, 1.1, 0.08, 0.04, 0.04, top - 1.1, 8, 0);
  for (let y = 1.6; y < top; y += 1.8) {
    sh.cyl(0, y, 0.08, 0.05, 0.05, 0.05, 8, 2);
    sh.box(0, y + 0.025, 0.03, 0.04, 0.03, 0.06, 0);
  }
  sh.cyl(0, 0.95, 0.08, 0.05, 0.05, 0.15, 8, 2);
  sh.tube(0, 1.0, 0.08, 0.0, 0.98, 0.32, 0.018, 0.018, 6);
  // butt (ribbed barrel), lid, tap, a watering can beside
  const c = rng.chance(0.5) ? '#3f6e4a' : '#2a2d30';
  k.m(c, 'plastic');
  sh.push().local(0, 0, 0.42);
  lathe(sh, 0, 0, [[0.27, 0], [0.3, 0.05], [0.32, 0.25], [0.33, 0.45], [0.32, 0.65], [0.3, 0.86], [0.31, 0.88]], 14);
  k.m('#1e2022', 'plastic');
  sh.cyl(0, 0.88, 0, 0.32, 0.31, 0.03, 14, 2);
  k.m('#c8a860', 'iron');
  sh.box(0, 0.16, 0.33, 0.03, 0.04, 0.06, 0);
  // the butt stands on two concrete blocks
  sh.pop();
  k.m(rng.pick(['#3f8a5a', '#c84a2a', '#5a6066']), 'plastic');
  sh.push().local(0.48, 0, 0.5, 0, 0.6);
  lathe(sh, 0, 0, [[0.09, 0], [0.1, 0.2], [0.07, 0.24]], 10);
  sh.tube(0.06, 0.12, 0, 0.26, 0.28, 0, 0.012, 0.008, 5);
  sh.tube(-0.07, 0.24, 0, -0.07, 0.1, 0, 0.01, 0.01, 4);
  sh.pop();
}

/** Herb pots on and beside a step: terracotta pots with rosemary / basil / chives / a geranium. */
function herbPots(k: Kit, rng: Rng, n: number): void {
  const sh = k.sh;
  let x = 0;
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.09, 0.16);
    x += r;
    const z = rng.range(-0.06, 0.06);
    k.m(rng.pick(['#b8653a', '#a85a32', '#c87848', '#8a7a6a']), 'stone');
    lathe(sh, x, z, [[r * 0.7, 0], [r * 0.95, r * 1.3], [r * 1.05, r * 1.32], [r * 1.05, r * 1.5], [r * 0.95, r * 1.5]], 12);
    k.m('#3a2a1c', 'stone');
    sh.cyl(x, r * 1.4, z, r * 0.95, r * 0.95, 0.002, 10, 2);
    const kind = rng.int(0, 3);
    if (kind === 0) {
      // rosemary: upright needles
      k.m('#4a6a4a', 'plastic');
      for (let j = 0; j < 9; j++) {
        const a = rng.range(0, TAU),
          rr = rng.range(0, r * 0.6);
        sh.tube(x + Math.cos(a) * rr, r * 1.4, z + Math.sin(a) * rr, x + Math.cos(a) * rr * 1.6, r * 1.4 + rng.range(0.15, 0.3), z + Math.sin(a) * rr * 1.6, 0.012, 0.004, 3);
      }
    } else if (kind === 1) {
      // basil: bright leaf mound
      k.m('#5a9a3a', 'plastic');
      for (let j = 0; j < 7; j++) sh.ellipsoid(x + rng.range(-r * 0.6, r * 0.6), r * 1.4 + rng.range(0.04, 0.12), z + rng.range(-r * 0.6, r * 0.6), 0.04, 0.025, 0.035, 0);
    } else if (kind === 2) {
      // chives with a few purple heads
      k.m('#4a7a3a', 'plastic');
      for (let j = 0; j < 12; j++) sh.tube(x + rng.range(-r * 0.4, r * 0.4), r * 1.4, z + rng.range(-r * 0.4, r * 0.4), x + rng.range(-r, r), r * 1.4 + rng.range(0.12, 0.22), z + rng.range(-r, r), 0.004, 0.003, 3);
      k.m('#b48ad0', 'plastic');
      for (let j = 0; j < 3; j++) sh.ellipsoid(x + rng.range(-r * 0.6, r * 0.6), r * 1.4 + 0.2, z + rng.range(-r * 0.6, r * 0.6), 0.015, 0.015, 0.015, 0);
    } else {
      // geranium: leaves + red umbels
      k.m('#4a7a34', 'plastic');
      for (let j = 0; j < 6; j++) sh.ellipsoid(x + rng.range(-r * 0.7, r * 0.7), r * 1.4 + rng.range(0.05, 0.12), z + rng.range(-r * 0.7, r * 0.7), 0.05, 0.02, 0.05, 0);
      k.m(rng.pick(['#d8343f', '#e8649a', '#f08a3c']), 'plastic');
      for (let j = 0; j < 3; j++) sh.ellipsoid(x + rng.range(-r * 0.5, r * 0.5), r * 1.4 + rng.range(0.18, 0.26), z + rng.range(-r * 0.5, r * 0.5), 0.035, 0.03, 0.035, 0);
    }
    x += r + rng.range(0.02, 0.08);
  }
}

/** Wheelie bin (240 l) with lid, wheels at the back, handle; origin bottom centre, front +Z. */
function wheelieBin(k: Kit, rng: Rng, col: string, lidOpen = false): void {
  const sh = k.sh;
  k.m(col, 'plastic');
  lathe(sh, 0, 0, [[0, 0.05], [0.33, 0.05], [0.41, 1.0], [0, 1.0]], 4, Math.PI / 4);
  k.m(col, 'plastic');
  sh.box(0, 1.0, -0.33, 0.56, 0.06, 0.08, 0);
  k.m('#1e2022', 'plastic');
  for (const x of [-0.25, 0.25]) sh.push().local(x, 0.1, -0.3, 0, 0, Math.PI / 2).cyl(0, -0.03, 0, 0.1, 0.1, 0.06, 10, 3).pop();
  sh.tube(-0.25, 0.1, -0.3, 0.25, 0.1, -0.3, 0.012, 0.012, 4);
  k.m(col, 'plastic');
  if (lidOpen) sh.push().local(0, 1.03, -0.33, -1.9).box(0, 0, 0.33, 0.62, 0.03, 0.66, 0).pop();
  else sh.box(0, 1.03, 0.0, 0.62, 0.03, 0.66, 0);
  k.m('#f0f0e8', 'plastic');
  sh.box(0, 0.75, 0.3, 0.12, 0.08, 0.004, 0);
  if (lidOpen || rng.chance(0.4)) {
    k.m('#1e2022', 'plastic');
    sh.ellipsoid(0, 1.0, 0.0, 0.22, 0.12, 0.22, 1);
  }
}

/** Recycling box (open crate) with bottles / paper / cans. */
function recycleBox(k: Kit, rng: Rng, what: number): void {
  const sh = k.sh;
  k.m(['#2b5f9a', '#2f7a45', '#3a3d40'][what % 3], 'plastic');
  const W = 0.55,
    D = 0.4,
    H = 0.32;
  for (const s of [-1, 1]) sh.box(0, H / 2, (s * D) / 2, W, H, 0.012, 0);
  for (const s of [-1, 1]) sh.box((s * W) / 2, H / 2, 0, 0.012, H, D, 0);
  sh.box(0, 0.006, 0, W, 0.012, D, 0);
  if (what % 3 === 0) {
    // glass bottles
    for (let i = 0; i < 7; i++) {
      k.m(rng.pick(['#3a6a3a', '#7a5a2a', '#cfe3e8', '#2a4a2a']), 'glass');
      const x = rng.range(-0.2, 0.2),
        z = rng.range(-0.13, 0.13);
      sh.push().local(x, 0.01, z, rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3));
      sh.cyl(0, 0, 0, 0.035, 0.035, 0.2, 8, 0).cyl(0, 0.2, 0, 0.035, 0.013, 0.06, 8, 0).cyl(0, 0.26, 0, 0.013, 0.013, 0.05, 6, 2);
      sh.pop();
    }
  } else if (what % 3 === 1) {
    // newspapers + a flattened cereal box
    for (let i = 0; i < 4; i++) {
      k.m(rng.pick(['#e4ddc8', '#d8d0bc', '#efece4']), 'plastic');
      sh.box(rng.range(-0.04, 0.04), 0.03 + i * 0.03, rng.range(-0.03, 0.03), 0.42, 0.028, 0.3, 0);
    }
    k.m('#d8a030', 'plastic');
    sh.push().local(0.05, 0.2, 0, 0.3).box(0, 0, 0, 0.3, 0.01, 0.2, 0).pop();
  } else {
    for (let i = 0; i < 9; i++) {
      k.m(rng.pick(['#c8ccd0', '#c8343a', '#e8c83a', '#3a6aa0']), 'iron');
      sh.push().local(rng.range(-0.2, 0.2), 0.05 + rng.range(0, 0.1), rng.range(-0.12, 0.12), rng.range(0, 3), 0, rng.range(0, 3));
      sh.cyl(0, -0.06, 0, 0.033, 0.033, 0.12, 8, 2);
      sh.pop();
    }
  }
}

/** Weeds in paving cracks / along a wall foot: small rosettes and grass tufts within a strip of length L. */
function weeds(k: Kit, rng: Rng, L: number, n: number): void {
  const sh = k.sh;
  for (let i = 0; i < n; i++) {
    const x = rng.range(-L / 2, L / 2),
      z = rng.range(-0.05, 0.05);
    if (rng.chance(0.5)) {
      k.m(rng.pick(['#5a8a3a', '#6a9a3a', '#4a7a2a']), 'plastic');
      for (let j = 0; j < 6; j++) {
        const a = rng.range(0, TAU);
        sh.tube(x, 0, z, x + Math.cos(a) * 0.06, rng.range(0.06, 0.16), z + Math.sin(a) * 0.06, 0.006, 0.002, 3);
      }
    } else {
      // dandelion rosette, maybe a yellow head
      k.m('#4a7a2a', 'plastic');
      for (let j = 0; j < 5; j++) sh.push().local(x, 0.008, z, 0, (j / 5) * TAU).box(0, 0, 0.05, 0.03, 0.004, 0.09, 0).pop();
      if (rng.chance(0.4)) {
        k.m('#e8c83a', 'plastic');
        sh.tube(x, 0, z, x + 0.02, 0.14, z, 0.003, 0.003, 3).ellipsoid(x + 0.02, 0.15, z, 0.02, 0.012, 0.02, 0);
      }
    }
  }
}

/** Broom leaning on a wall (head on the ground, handle against the wall at z = 0). */
function broom(k: Kit): void {
  const sh = k.sh;
  k.m('#8a6a44', 'wood');
  sh.tube(0, 0.1, 0.32, 0, 1.35, 0.03, 0.013, 0.013, 6);
  k.m('#c84a2a', 'plastic');
  sh.box(0, 0.08, 0.34, 0.32, 0.05, 0.06, 0);
  k.m('#3a3430', 'plastic');
  sh.box(0, 0.03, 0.35, 0.3, 0.06, 0.05, 0);
}

/** Washing-line post: a galvanised T with a hook and the line tensioner. Returns the line height. */
function linePost(k: Kit): number {
  const sh = k.sh;
  k.m('#a8b0b4', 'iron');
  sh.cyl(0, 0, 0, 0.03, 0.03, 1.95, 8, 2);
  sh.tube(-0.35, 1.9, 0, 0.35, 1.9, 0, 0.022, 0.022, 6);
  k.m('#8a8f94', 'stone');
  sh.cyl(0, 0, 0, 0.12, 0.1, 0.03, 10, 2);
  return 1.89;
}

// ───────────────────────────────────────────────────────────── places ──

/** sorted by distance to a point */
function nearestBy<T>(list: T[], f: (t: T) => number): T | undefined {
  let best: T | undefined,
    bd = Infinity;
  for (const t of list) {
    const d = f(t);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

export function buildPlaces(e: PlacesEnv): PlacesInfo {
  const info: PlacesInfo = {};
  const p = e.ctx.debug.params;
  const low = e.ctx.quality.level === 'low';
  if (low) return info;
  if (!p.has('nomarketlife')) {
    try {
      market(e, info);
    } catch (err) {
      console.error('props: market life failed', err);
    }
  }
  if (!p.has('noterracelife')) {
    try {
      terrace(e, info);
    } catch (err) {
      console.error('props: terrace life failed', err);
    }
  }
  if (!p.has('nobackyard')) {
    try {
      backyard(e, info);
    } catch (err) {
      console.error('props: back yard failed', err);
    }
  }
  return info;
}

/** world position of local (lx, lz) in the frame (x, z, yaw) */
function W(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  return [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
}

function market(e: PlacesEnv, info: PlacesInfo): void {
  const plan = e.plan;
  const area = plan.areas.find((a) => a.kind === 'market');
  if (!area) return;
  const r = area.rect;
  const stalls = plan.features.filter((f) => f.kind === 'marketstall' && f.x > r.x0 - 1 && f.x < r.x1 + 1 && f.z > r.z0 - 1 && f.z < r.z1 + 1);
  if (!stalls.length) return;
  const rng = new Rng('w6:market');
  let items = 0;
  let own: { x: number; z: number } | undefined;
  const put = (x: number, z: number, rad: number, yaw: number, build: (k: Kit, kd: Kit, y: number) => void, claim = true): boolean => {
    if (!e.free(x, z, rad, own)) return false;
    const y = e.H(x, z) + 0.02;
    const k = e.fine(x),
      kd = e.near(x, z);
    k.sh.frame(x, y, z, yaw);
    kd.sh.frame(x, y, z, yaw);
    build(k, kd, y);
    if (claim) e.claim(x, z, rad);
    items++;
    return true;
  };
  // stock builders (local frame at the item's foot)
  const crateStack = (sr: Rng) => (k: Kit, kd: Kit, y: number, x: number, z: number, yaw: number) => {
    // two or three columns of 1–4 crates, the top ones skewed, a plastic crate among them
    const cols = sr.int(2, 3);
    for (let c = 0; c < cols; c++) {
      const n = sr.int(1, 4);
      let h = 0;
      for (let i = 0; i < n; i++) {
        k.sh.push().local((c - (cols - 1) / 2) * 0.52, h, sr.range(-0.04, 0.04), 0, sr.range(-0.12, 0.12));
        if (sr.chance(0.3)) {
          plasticCrate(k, sr, 0.5, 0.24, 0.36);
          h += 0.235;
        } else {
          woodCrate(k, sr, 0.5, 0.3, 0.36, sr.chance(0.25) ? sr.pick(['#d84a2a', '#e8a83a', '#7fa85a']) : undefined);
          h += 0.29;
        }
        k.sh.pop();
      }
    }
    e.spot(x, y, z, yaw, 0, 0, cols * 0.27, 0.2, 0.05, 0.12, 0.45);
    litter(kd, sr, 3, 0.5);
  };
  const boxPile = (sr: Rng) => (k: Kit, kd: Kit) => {
    // stock boxes: closed cartons stacked two or three high, an open one on top, flattened card leaning
    let h = 0;
    for (let i = 0; i < sr.int(2, 3); i++) {
      const w = sr.range(0.4, 0.6);
      k.sh.push().local(sr.range(-0.05, 0.05), h, sr.range(-0.04, 0.04), 0, sr.range(-0.2, 0.2));
      cardBox(k, sr, w, sr.range(0.26, 0.36), sr.range(0.3, 0.4), false);
      k.sh.pop();
      h += 0.3;
    }
    k.sh.push().local(0.05, h, 0, 0, sr.range(-0.5, 0.5));
    cardBox(k, sr, 0.42, 0.26, 0.32, true);
    k.sh.pop();
    if (sr.chance(0.6)) {
      k.sh.push().local(0.55, 0, 0.05, 0, sr.range(-0.4, 0.4));
      cardBox(k, sr, 0.5, 0.32, 0.36, sr.chance(0.5));
      k.sh.pop();
    }
    litter(kd, sr, 2, 0.4);
  };
  const cardboard = (sr: Rng) => (k: Kit, kd: Kit) => {
    flatCardboard(k, sr);
    k.sh.push().local(0.55, 0, 0.1, 0, 0.5);
    cardBox(k, sr, 0.45, 0.3, 0.34, true);
    k.sh.pop();
    litter(kd, sr, 3, 0.4);
  };
  const sacks = (sr: Rng) => (k: Kit) => {
    const dy = pallet(k, sr, sr.int(0, 3));
    for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.2], [0.3, 0.2]]) {
      k.sh.push().local(x, dy, z, 0, sr.range(-0.4, 0.4));
      sack(k, sr);
      k.sh.pop();
    }
    k.sh.push().local(0, dy + 0.4, 0, 0, sr.range(0, 3));
    sack(k, sr, true);
    k.sh.pop();
  };
  const trolley = (sr: Rng) => (k: Kit) => {
    const dy = platformTrolley(k, sr);
    for (let i = 0; i < 2; i++) {
      k.sh.push().local(0, dy + i * 0.29, (i ? 0.05 : 0) + 0.15, 0, sr.range(-0.1, 0.1));
      woodCrate(k, sr, 0.5, 0.3, 0.36, sr.pick(['#e8a83a', '#7fa85a', '#c83a2a']));
      k.sh.pop();
    }
    k.sh.push().local(0, dy, -0.25, 0, Math.PI / 2);
    cardBox(k, sr, 0.36, 0.3, 0.3);
    k.sh.pop();
  };
  const emptyCrates = (sr: Rng) => (k: Kit) => {
    // empties: plastic crates nested in a leaning tower, a couple tipped on their side
    const col = sr.pick(['#2f7a45', '#c8452f', '#2b5f9a', '#3a3d40']);
    for (let i = 0; i < sr.int(3, 6); i++) {
      k.sh.push().local(sr.range(-0.02, 0.02) + i * 0.01, i * 0.12, sr.range(-0.02, 0.02), 0, sr.range(-0.05, 0.05));
      plasticCrate(k, sr, 0.5, 0.24, 0.36, col);
      k.sh.pop();
    }
    k.sh.push().local(0.6, 0.18, 0, Math.PI / 2, sr.range(-0.4, 0.4));
    plasticCrate(k, sr, 0.5, 0.24, 0.36, col);
    k.sh.pop();
  };
  for (const f of stalls) {
    const sr = new Rng(`w6:stall:${f.id}`);
    own = { x: f.x, z: f.z };
    // under the trestle table (local z ≈ 0.38, between the trestles): the day's stock in boxes and crates
    for (const lx of [-0.42, 0.42]) {
      if (!sr.chance(0.75)) continue;
      const [ux, uz] = W(f.x, f.z, f.yaw, lx + sr.range(-0.08, 0.08), 0.3);
      const kk = e.fine(ux);
      const y = e.H(ux, uz) + 0.02;
      kk.sh.frame(ux, y, uz, f.yaw + sr.range(-0.15, 0.15));
      if (sr.chance(0.5)) cardBox(kk, sr, 0.46, 0.3, 0.34, sr.chance(0.4));
      else woodCrate(kk, sr, 0.46, 0.28, 0.34, sr.chance(0.5) ? sr.pick(['#d84a2a', '#e8a83a', '#7fa85a']) : undefined);
      if (sr.chance(0.4)) {
        kk.sh.local(0.02, 0.3, 0, 0, sr.range(-0.3, 0.3));
        cardBox(kk, sr, 0.38, 0.22, 0.3, true);
      }
      items++;
    }
    // behind the stall (between its back drape at local z −0.64 and the next row): two or three stock groups
    const kinds = [crateStack, boxPile, cardboard, sacks, trolley, emptyCrates];
    const nBack = sr.int(2, 3);
    const slots = [-0.62, 0.62, 0];
    for (let i = 0; i < nBack; i++) {
      const kb = kinds[sr.int(0, kinds.length - 1)];
      const b = kb(sr);
      const rad = kb === sacks || kb === trolley ? 0.5 : 0.42;
      for (const dz of [-1.05, -1.3, -1.6, -1.9]) {
        const lx = slots[i] + sr.range(-0.12, 0.12);
        const [bx, bz] = W(f.x, f.z, f.yaw, lx, dz);
        const yaw = f.yaw + sr.range(-0.3, 0.3) + (kb === trolley ? Math.PI / 2 : 0);
        if (put(bx, bz, rad, yaw, (k, kd, y) => b(k, kd, y, bx, bz, yaw))) break;
      }
    }
    // in front, at the aisle edge (just outside the stall radius, not on the walkway): dropped leaves / paper
    const [fx, fz] = W(f.x, f.z, f.yaw, sr.range(-0.6, 0.6), 1.45);
    const kd = e.near(fx, fz);
    kd.sh.frame(fx, e.H(fx, fz) + 0.02, fz, sr.range(0, TAU));
    litter(kd, sr, sr.int(3, 6), 0.35);
    // beside the stall, between neighbours: a sack truck or a stack of boxes (most stalls)
    if (sr.chance(0.75)) {
      const side = sr.chance(0.5) ? 1 : -1;
      for (const dz of [-0.6, -0.9, -0.3]) {
        const [sx, sz] = W(f.x, f.z, f.yaw, side * 1.45, dz);
        const ok = sr.chance(0.45)
          ? put(sx, sz, 0.3, f.yaw + sr.range(-0.5, 0.5), (k) => sackTruck(k, sr, sr.chance(0.6)))
          : put(sx, sz, 0.3, f.yaw + sr.range(-0.5, 0.5), (k, kd) => boxPile(sr)(k, kd));
        if (ok) break;
      }
    }
  }
  own = undefined;
  // the square's own furniture: market bins at the two aisle heads, chalk boards, pigeons
  const cx = (r.x0 + r.x1) / 2;
  const heads: [number, number][] = [
    [r.x0 + 2.2, r.z1 - 2.4],
    [r.x1 - 2.2, r.z1 - 2.4],
    [cx, r.z0 + 1.6],
  ];
  for (const [x, z] of heads) {
    for (let t = 0; t < 12; t++) {
      const xx = x + rng.range(-2, 2),
        zz = z + rng.range(-2, 2);
      if (put(xx, zz, 0.95, rng.chance(0.5) ? 0 : Math.PI, (k, kd, y) => {
        marketBin(k, rng, kd);
        e.spot(xx, y, zz, 0, 0, 0, 0.7, 0.55, 0.1, 0.2, 0.6);
        litter(kd, rng, 6, 0.9);
      }))
        break;
    }
  }
  // chalk boards at the aisle mouths (south edge), facing the street
  for (const x of [r.x0 + 5.5, r.x1 - 5.5]) {
    for (const dx of [1.9, -1.9, 2.4, -2.4]) {
      if (put(x + dx, r.z1 - 1.2, 0.4, 0, (k) => aFrame(k, rng))) break;
    }
  }
  // pigeons: a few flocks of 4–9 on open paving (near kit only — they are 30 cm birds)
  const flocks = 4;
  for (let fl = 0; fl < flocks; fl++) {
    const fx = rng.range(r.x0 + 2, r.x1 - 2),
      fz = rng.range(r.z0 + 2, r.z1 - 2);
    const n = rng.int(4, 9);
    for (let i = 0; i < n; i++) {
      const x = fx + rng.range(-1.6, 1.6),
        z = fz + rng.range(-1.6, 1.6);
      if (!e.free(x, z, 0.15) && !e.free(x, z, 0.05)) continue;
      const kd = e.near(x, z);
      kd.sh.frame(x, e.H(x, z) + 0.02, z, rng.range(0, TAU));
      pigeon(kd, rng);
      items++;
    }
    // a few crumbs / bread they peck at
    const kd = e.near(fx, fz);
    kd.sh.frame(fx, e.H(fx, fz) + 0.02, fz, 0);
    kd.m('#e8c890', 'plastic');
    for (let i = 0; i < 8; i++) kd.sh.box(rng.range(-0.6, 0.6), 0.004, rng.range(-0.6, 0.6), 0.02, 0.008, 0.015, 0);
  }
  e.inc('place_market');
  info.market = { x: cx, z: (r.z0 + r.z1) / 2, items };
}

function terrace(e: PlacesEnv, info: PlacesInfo): void {
  // the biggest plaza café cluster (tables within 3.2 m chain together)
  const cafes = e.service.cafes.filter((c) => c.source === 'plaza');
  if (!cafes.length) return;
  const seen = new Set<Cafe>();
  let best: Cafe[] = [];
  for (const c of cafes) {
    if (seen.has(c)) continue;
    const cl: Cafe[] = [c];
    seen.add(c);
    for (let i = 0; i < cl.length; i++)
      for (const o of cafes)
        if (!seen.has(o) && Math.hypot(o.x - cl[i].x, o.z - cl[i].z) < 3.2) {
          seen.add(o);
          cl.push(o);
        }
    if (cl.length > best.length) best = cl;
  }
  if (best.length < 3) return;
  const rng = new Rng('w6:terrace');
  // terrace frame: facing = mean yaw (away from the facade), axis along the facade
  let sx = 0,
    sz = 0,
    fx = 0,
    fz = 0;
  for (const c of best) {
    sx += c.x;
    sz += c.z;
    fx += Math.sin(c.yaw);
    fz += Math.cos(c.yaw);
  }
  const cx = sx / best.length,
    cz = sz / best.length;
  // snap the facing to the nearest axis (terraces front plaza edges)
  const yaw = Math.round(Math.atan2(fx, fz) / (Math.PI / 2)) * (Math.PI / 2);
  const ux = Math.cos(yaw),
    uz = -Math.sin(yaw); // along the facade (local +x)
  const nx = Math.sin(yaw),
    nz = Math.cos(yaw); // out to the plaza (local +z)
  let a0 = Infinity,
    a1 = -Infinity,
    d0 = Infinity,
    d1 = -Infinity;
  for (const c of best) {
    const a = (c.x - cx) * ux + (c.z - cz) * uz,
      d = (c.x - cx) * nx + (c.z - cz) * nz;
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    d0 = Math.min(d0, d);
    d1 = Math.max(d1, d);
  }
  let items = 0;
  const at = (la: number, ld: number): [number, number] => [cx + ux * la + nx * ld, cz + uz * la + nz * ld];
  const put = (la: number, ld: number, rad: number, ry: number, build: (k: Kit, kd: Kit, x: number, y: number, z: number) => void): boolean => {
    const [x, z] = at(la, ld);
    if (!e.free(x, z, rad)) return false;
    const y = e.H(x, z) + 0.02;
    const k = e.fine(x),
      kd = e.near(x, z);
    k.sh.frame(x, y, z, yaw + ry);
    kd.sh.frame(x, y, z, yaw + ry);
    build(k, kd, x, y, z);
    e.claim(x, z, rad);
    items++;
    return true;
  };
  const tryPut = (cands: [number, number][], rad: number, ry: number, build: (k: Kit, kd: Kit, x: number, y: number, z: number) => void) => {
    for (const [la, ld] of cands) if (put(la, ld, rad, ry, build)) return true;
    return false;
  };
  // hedge planters closing the two ends of the terrace (and one at the front corner)
  for (const s of [-1, 1]) {
    const la = s > 0 ? a1 + 1.35 : a0 - 1.35;
    tryPut([[la, (d0 + d1) / 2], [la, d0], [la, d1], [la + s * 0.5, (d0 + d1) / 2]], 0.85, Math.PI / 2, (k, _kd, x, y, z) => {
      hedgePlanter(k, rng, 1.6);
      e.spot(x, y, z, yaw + Math.PI / 2, 0, 0, 0.82, 0.25, 0.05, 0.12, 0.5);
    });
  }
  // waiter station against the facade side, at one end
  tryPut([[a1 + 0.2, d0 - 1.2], [a0 - 0.2, d0 - 1.2], [a1 + 1.2, d0 - 0.5], [a0 - 1.2, d0 - 0.5], [a1 + 1.3, d1 + 1.2]], 0.5, 0, (k, kd, x, y, z) => {
    waiterStation(k, kd, rng);
    e.spot(x, y, z, yaw, 0, 0, 0.42, 0.25, 0.04, 0.12, 0.5);
  });
  // A-board at the front corner, facing out
  tryPut([[a0 - 0.6, d1 + 1.3], [a1 + 0.6, d1 + 1.3], [(a0 + a1) / 2, d1 + 1.5]], 0.4, Math.PI / 2, (k) => aFrame(k, rng));
  // spare chairs stacked beside the station
  tryPut([[a1 + 1.0, d0 - 1.0], [a0 - 1.0, d0 - 1.0], [a1 + 1.4, d0], [a0 - 1.4, d0]], 0.35, rng.range(-0.4, 0.4), (k) => chairStack(k, rng.pick(['#2c3033', '#3b4a40', '#c9473f'])));
  // dog bowl by the door, stubs along the front edge
  tryPut([[(a0 + a1) / 2 + 0.8, d0 - 1.3], [(a0 + a1) / 2 - 0.8, d0 - 1.3], [a0 - 0.6, d0]], 0.2, 0, (_k, kd) => dogBowl(kd));
  for (let i = 0; i < 4; i++) {
    const la = rng.range(a0 - 0.5, a1 + 0.5),
      ld = d1 + rng.range(0.8, 1.6);
    const [x, z] = at(la, ld);
    const kd = e.near(x, z);
    kd.sh.frame(x, e.H(x, z) + 0.02, z, 0);
    stubs(kd, rng, rng.int(2, 5), 0.5);
  }
  // under the tables: a dropped napkin, a sugar sachet, a stub
  for (const c of best) {
    if (!rng.chance(0.6)) continue;
    const kd = e.near(c.x, c.z);
    kd.sh.frame(c.x, e.H(c.x, c.z) + 0.02, c.z, rng.range(0, TAU));
    kd.m('#f4f2ee', 'plastic');
    kd.sh.push().local(rng.range(-0.5, 0.5), 0.003, rng.range(-0.5, 0.5), 0, rng.range(0, 3)).box(0, 0, 0, 0.14, 0.003, 0.14, 0).pop();
    stubs(kd, rng, rng.int(0, 2), 0.6);
  }
  e.inc('place_terrace');
  info.terrace = { x: cx, z: cz, yaw, items };
}

function backyard(e: PlacesEnv, info: PlacesInfo): void {
  const plan = e.plan;
  const occ = e.ctx.occupancy;
  const old = plan.pois.find((q) => q.id === 'oldtown');
  const courts = plan.areas.filter((a) => a.kind === 'courtyard' && plan.blocks[a.blockId]?.kind === 'oldtown');
  if (!courts.length) return;
  const tx = old?.target.x ?? 82,
    tz = old?.target.z ?? 10;
  const court = nearestBy(courts, (a: Area) => Math.hypot((a.rect.x0 + a.rect.x1) / 2 - tx, (a.rect.z0 + a.rect.z1) / 2 - tz) - Math.min(a.rect.x1 - a.rect.x0, a.rect.z1 - a.rect.z0) * 2);
  if (!court) return;
  const r = court.rect;
  // the back wall: the longest edge with buildings right behind it
  type Edge = { x: number; z: number; ux: number; uz: number; L: number; yaw: number; walled: number };
  const edges: Edge[] = [
    { x: (r.x0 + r.x1) / 2, z: r.z0, ux: 1, uz: 0, L: r.x1 - r.x0, yaw: 0, walled: 0 },
    { x: (r.x0 + r.x1) / 2, z: r.z1, ux: -1, uz: 0, L: r.x1 - r.x0, yaw: Math.PI, walled: 0 },
    { x: r.x0, z: (r.z0 + r.z1) / 2, ux: 0, uz: -1, L: r.z1 - r.z0, yaw: Math.PI / 2, walled: 0 },
    { x: r.x1, z: (r.z0 + r.z1) / 2, ux: 0, uz: 1, L: r.z1 - r.z0, yaw: -Math.PI / 2, walled: 0 },
  ];
  for (const ed of edges) {
    const nx = Math.sin(ed.yaw),
      nz = Math.cos(ed.yaw);
    for (let s = -ed.L / 2 + 0.5; s < ed.L / 2 - 0.5; s += 0.5) if (occ.has(ed.x + ed.ux * s - nx * 0.6, ed.z + ed.uz * s - nz * 0.6, OCC.BUILDING)) ed.walled += 0.5;
  }
  edges.sort((a, b) => b.walled - a.walled);
  const ed = edges[0];
  if (ed.walled < 4) return;
  const rng = new Rng('w6:backyard');
  const yaw = ed.yaw;
  const nx = Math.sin(yaw),
    nz = Math.cos(yaw);
  let items = 0;
  /** local frame on the wall: s along it (local x = wall direction), d out into the yard */
  const at = (s: number, d: number): [number, number] => [ed.x + ed.ux * s + nx * d, ed.z + ed.uz * s + nz * d];
  // the real back walls: townhouse footprints of this block whose yard-facing side lies on the edge line
  // (the rendered wall stands 0.16 m inside the footprint — buildings/anchors.ts). Spans in edge coordinates s.
  const nLine = ed.x * nx + ed.z * nz;
  const sOf = (x: number, z: number) => (x - ed.x) * ed.ux + (z - ed.z) * ed.uz;
  const walls: { s0: number; s1: number; a0: number; a1: number; eave: number }[] = [];
  for (const l of plan.lots) {
    if (l.blockId !== court.blockId || l.kind !== 'townhouse') continue;
    const f = l.footprint;
    if (Math.abs(Math.max(f.x0 * nx + f.z0 * nz, f.x1 * nx + f.z1 * nz) - nLine) > 0.3) continue;
    const a = sOf(f.x0, f.z0),
      b = sOf(f.x1, f.z1);
    const s0 = Math.max(Math.min(a, b) + 0.35, -ed.L / 2 + 0.3),
      s1 = Math.min(Math.max(a, b) - 0.35, ed.L / 2 - 0.3);
    if (s1 - s0 > 1.5) walls.push({ s0, s1, a0: Math.min(a, b), a1: Math.max(a, b), eave: l.floors * 3.3 + 0.2 });
  }
  // the rear ground-floor windows (facade grid, probed on these walls — the buildings service does not export
  // windows yet, see real-requests.md): bay = L / 3.4, three windows at a0 + bay·(0.48 + i), 1.1 m wide + 0.11
  // surrounds. Wall things go in the gaps between them (gap i) or the wide corner gap after the last one.
  const bay = (w: (typeof walls)[number]) => (w.a1 - w.a0) / 3.4;
  const gapAt = (w: (typeof walls)[number], i: number) => w.a0 + bay(w) * (0.98 + i);
  const cornerGap = (w: (typeof walls)[number]): [number, number] => {
    const e0 = w.a0 + bay(w) * 2.48 + 0.66;
    return [(e0 + w.a1) / 2, w.a1 - e0];
  };
  const wallOf = (s: number) => walls.find((w) => s >= w.s0 && s <= w.s1);
  const wallAt = (s: number) => !!wallOf(s) && occ.has(at(s, -0.6)[0], at(s, -0.6)[1], OCC.BUILDING);
  const WALL = -0.16;
  const place = (s: number, d: number, ry: number, rad: number, build: (k: Kit, kd: Kit, x: number, y: number, z: number) => void, check = true): boolean => {
    const [x, z] = at(s, d);
    if (check && (!wallAt(s) || !e.free(x, z, rad))) return false;
    const y = e.H(x, z) + 0.02;
    const k = e.fine(x),
      kd = e.near(x, z);
    k.sh.frame(x, y, z, yaw + ry);
    kd.sh.frame(x, y, z, yaw + ry);
    build(k, kd, x, y, z);
    if (rad > 0) e.claim(x, z, rad);
    items++;
    return true;
  };
  // local x along the wall = (cos yaw, -sin yaw); edges run (ux, uz) — keep builders in the wall frame
  const L = ed.L;
  const s0 = -L / 2 + 1.0;
  const side = rng.chance(0.5) ? 1 : -1;
  // the door goes on the longest stretch of real back wall; meter, downpipe + butt and AC beside it
  const main = walls.reduce<(typeof walls)[number] | undefined>((m, w) => (!m || w.s1 - w.s0 > m.s1 - m.s0 ? w : m), undefined);
  const [sCorner, wCorner] = main ? cornerGap(main) : [0, 0];
  const sDoor = !main ? 0 : wCorner > 1.35 ? sCorner + 0.12 : gapAt(main, 1);
  /** a wall-mounted item at s: real wall behind it and room in front of it */
  const onWall = (s: number, r = 0.3): boolean => {
    if (!wallAt(s)) return false;
    const [x, z] = at(s, r + 0.1);
    return e.free(x, z, r);
  };
  if (main) {
    // a concrete apron along the back walls (1.4 m), cracked, weeds at the wall foot and in the joints
    {
      const aS0 = Math.max(-L / 2 + 0.2, Math.min(...walls.map((w) => w.s0)) - 0.35),
        aS1 = Math.min(L / 2 - 0.2, Math.max(...walls.map((w) => w.s1)) + 0.35);
      const La = aS1 - aS0;
      const [x, z] = at((aS0 + aS1) / 2, WALL + 0.7);
      const y = e.H(x, z) + 0.02;
      const k = e.fine(x),
        kd = e.near(x, z);
      k.sh.frame(x, y, z, yaw);
      kd.sh.frame(x, y, z, yaw);
      const segs = Math.max(2, Math.round(La / 1.4));
      const sl = La / segs;
      for (let i = 0; i < segs; i++) {
        k.m(['#a8a49a', '#9e9a90', '#b0aca2'][i % 3], 'stone');
        k.sh.box(-La / 2 + sl * (i + 0.5), 0.015, 0, sl - 0.02, 0.03, 1.4, 1);
      }
      // hairline cracks: thin dark lines lying on a few slabs
      kd.m('#4a4740', 'stone');
      for (let i = 0; i < Math.floor(La / 2); i++) {
        const cx2 = rng.range(-La / 2 + 0.4, La / 2 - 0.4);
        kd.sh.push().local(cx2, 0.031, rng.range(-0.4, 0.4), 0, rng.range(-0.8, 0.8)).box(0, 0, 0, 0.005, 0.002, rng.range(0.25, 0.6), 0).pop();
      }
      // weeds along the wall foot and in the slab joints
      kd.sh.push().local(0, 0.03, -0.64);
      weeds(kd, rng, La - 0.3, Math.floor(La * 2.2));
      kd.sh.pop();
      for (let i = 1; i < segs; i++) {
        kd.sh.push().local(-La / 2 + sl * i, 0.03, 0, 0, Math.PI / 2);
        weeds(kd, rng, 1.2, 3);
        kd.sh.pop();
      }
      // the apron's front edge into the grass: damp dark line; splash dirt at the wall foot
      e.spot(x, y, z, yaw, 0, 0.7, La / 2, 0.05, 0.02, 0.1, 0.4);
      e.spot(x, y, z, yaw, 0, -0.62, La / 2, 0.08, 0.02, 0.12, 0.45);
      items++;
    }
    const top = 0.03;
    const wallItem = (s: number, build: (k: Kit, kd: Kit, x: number, y: number, z: number) => void, r = 0.3): boolean => {
      if (!onWall(s, r)) return false;
      place(s, WALL, 0, 0, (k, kd, x, y, z) => {
        k.sh.local(0, top, 0);
        kd.sh.local(0, top, 0);
        build(k, kd, x, y, z);
      }, false);
      e.claim(...at(s, r + 0.1), r);
      return true;
    };
    // back door with step + mat in the corner gap, herb pots on the window side of the step
    wallItem(sDoor, (k, kd) => {
      backDoor(k, kd, rng);
      k.sh.push().local(-0.85, 0, 0.2);
      herbPots(k, rng, 3);
      k.sh.pop();
      k.sh.push().local(0.38, 0.2, 0.34);
      herbPots(k, rng, 1);
      k.sh.pop();
    }, 0.6);
    // gas meter box below the sills between two windows, a broom in the other gap, the downpipe + water butt at
    // the far end of the house (small margin before the party wall), the AC unit high between two windows
    wallItem(gapAt(main, 1), (k) => meterBox(k), 0.3);
    wallItem(gapAt(main, 0) + 0.1, (k) => broom(k), 0.2);
    if (!wallItem(Math.max(main.s0, main.a0 + 0.3), (k) => downpipeButt(k, rng, main.eave), 0.4)) wallItem(gapAt(main, 0) - 0.3, (k) => downpipeButt(k, rng, main.eave), 0.4);
    const other = walls.find((w) => w !== main);
    wallItem(other ? gapAt(other, 1) : gapAt(main, 0), (k, kd) => {
      k.sh.local(0, 0.5, 0);
      acUnit(k, kd);
    }, 0.2);
  }
  // bins + recycling boxes in a row along the wall at one end, a bike leaning beyond them
  const sBins = side > 0 ? s0 + 0.5 : -s0 - 0.5 - 2.2;
  place(sBins + 1.1, 0.45, 0, 1.2, (k, kd, x, y, z) => {
    const cols = ['#2a2d30', '#3f6e4a', '#2b5f9a', '#6a4a2a'];
    for (let i = 0; i < 3; i++) {
      k.sh.push().local(-0.75 + i * 0.72, 0, rng.range(-0.05, 0.05), 0, Math.PI + rng.range(-0.15, 0.15));
      wheelieBin(k, rng, cols[i], i === 1 && rng.chance(0.6));
      k.sh.pop();
    }
    for (let i = 0; i < 2; i++) {
      k.sh.push().local(-0.5 + i * 0.75, 0, 0.75, 0, rng.range(-0.2, 0.2));
      recycleBox(k, rng, i + rng.int(0, 1));
      k.sh.pop();
    }
    e.spot(x, y, z, yaw, 0, 0, 1.15, 0.4, 0.05, 0.15, 0.55);
    litter(kd, rng, 3, 0.8);
  });
  place(sBins + side * 3.0 + 1.1, 0.32, 0, 0.9, (k) => {
    k.sh.local(0, 0, 0, -0.12);
    bicycle(k, rng);
  });
  // stacked pallets at the other end, a crate of empty bottles on top
  place(-sBins - side * 0.4, 0.75, rng.range(-0.15, 0.15), 0.8, (k) => {
    let h = 0;
    for (let i = 0; i < rng.int(3, 5); i++) {
      k.sh.push().local(rng.range(-0.04, 0.04), h, rng.range(-0.04, 0.04), 0, rng.range(-0.06, 0.06));
      h += pallet(k, rng, i);
      k.sh.pop();
    }
    k.sh.push().local(0.2, h, 0, 0, 0.3);
    plasticCrate(k, rng, 0.45, 0.3, 0.3, '#2f7a45');
    k.sh.pop();
  });
  // the washing line: two posts out in the yard, parallel to the wall
  let dLine = Math.min(4.5, Math.max(2.6, (Math.abs((r.x1 - r.x0) * nx) + Math.abs((r.z1 - r.z0) * nz)) * 0.45));
  const span = Math.min(6, L - 2.5);
  const ends: [number, number, number][] = [];
  // keep the line and its washing out of the yard tree (F4 bug 6): try a few offsets from the wall / along it,
  // reject one whose segment passes within crown radius + 0.6 m of a tree
  const trees = (e.ctx.services.vegetation as { trees?: { x: number; z: number; r: number }[] } | undefined)?.trees ?? [];
  const clear = (s0: number, d: number) => {
    const [ax, az] = at(s0 - span / 2, d),
      [bx, bz] = at(s0 + span / 2, d);
    const vx = bx - ax,
      vz = bz - az,
      vv = vx * vx + vz * vz;
    for (const t of trees) {
      if (Math.abs(t.x - ax) > span + 8 || Math.abs(t.z - az) > span + 8) continue;
      const u = Math.max(0, Math.min(1, ((t.x - ax) * vx + (t.z - az) * vz) / vv));
      if (Math.hypot(ax + vx * u - t.x, az + vz * u - t.z) < t.r + 0.6) return false;
    }
    return e.free(ax, az, 0.2) && e.free(bx, bz, 0.2);
  };
  let lineS = 0;
  search: for (const d of [dLine, dLine - 1, dLine + 1.2, dLine - 1.8, dLine + 2.2])
    for (const s0 of [0, -1.5, 1.5, -3, 3])
      if (d > 1.8 && clear(s0, d)) {
        dLine = d;
        lineS = s0;
        break search;
      }
  for (const s of [lineS - span / 2, lineS + span / 2]) {
    const [x, z] = at(s, dLine);
    if (!e.free(x, z, 0.2)) continue;
    const y = e.H(x, z);
    const k = e.fine(x);
    k.sh.frame(x, y, z, yaw);
    const h = linePost(k);
    e.spot(x, y + 0.02, z, 0, 0, 0, 0.12, 0.12, 0.12, 0.15, 0.5);
    e.claim(x, z, 0.25);
    ends.push([x, y + h, z]);
  }
  if (ends.length === 2) {
    const off = 0.25;
    for (const o of [-off, off]) {
      e.service.lines.push({ ax: ends[0][0] + nx * o, ay: ends[0][1], az: ends[0][2] + nz * o, bx: ends[1][0] + nx * o, by: ends[1][1], bz: ends[1][2] + nz * o });
    }
    items++;
  }
  // a plastic chair and an upturned crate as a side table, a cup on it (somebody's spot in the sun)
  place(sDoor + side * 2.6, 2.0, Math.PI + rng.range(-0.6, 0.6), 0.6, (k) => {
    k.m('#f0f0e8', 'plastic');
    k.sh.cyl(0, 0.42, 0, 0.23, 0.22, 0.03, 12, 2);
    for (const [x, z] of [[-0.19, 0.18], [0.19, 0.18], [-0.19, -0.18], [0.19, -0.18]]) k.sh.tube(x, 0, z, x * 0.9, 0.42, z * 0.9, 0.018, 0.022, 5);
    k.sh.push().local(0, 0.6, -0.21, -0.15).box(0, 0, 0, 0.42, 0.34, 0.025, 0).pop();
    k.sh.push().local(0.6, 0, 0.1, 0, 0.3);
    plasticCrate(k, rng, 0.45, 0.3, 0.3, '#c8452f');
    k.m('#f2efe6', 'ceramic');
    k.sh.cyl(0.05, 0.3, 0, 0.04, 0.035, 0.09, 8, 2);
    k.sh.pop();
  });
  // ── F4 (judge 2 "the back yard is not a place"): enclosure, a patio, a shed, pots, children's things
  const Dy = Math.abs((r.x1 - r.x0) * nx) + Math.abs((r.z1 - r.z0) * nz);
  const placeFree = (s: number, d: number, ry: number, rad: number, build: (k: Kit, x: number, y: number, z: number) => void): boolean => {
    const [x, z] = at(s, d);
    if (!e.free(x, z, rad)) return false;
    const y = e.H(x, z) + 0.01;
    const k = e.fine(x);
    k.sh.frame(x, y, z, yaw + ry);
    build(k, x, y, z);
    e.claim(x, z, rad);
    items++;
    return true;
  };
  // close-board timber fence (1.6 m) round the yard's open sides: posts every 1.8 m, gravel board, feather-edge
  // boards, a capping rail; a panel is left out where a path, building or furniture is in the way (gates)
  for (const fe of edges) {
    if (fe === ed) continue;
    const fyaw = Math.atan2(-fe.uz, fe.ux);
    const inN = [Math.sin(fe.yaw), Math.cos(fe.yaw)]; // into the yard
    const n = Math.floor((fe.L - 0.4) / 1.8);
    for (let i = 0; i < n; i++) {
      const sm = -fe.L / 2 + 0.2 + 0.9 + i * 1.8;
      const x = fe.x + fe.ux * sm + inN[0] * 0.25,
        z = fe.z + fe.uz * sm + inN[1] * 0.25;
      if (occ.has(x - inN[0] * 0.85, z - inN[1] * 0.85, OCC.BUILDING) || occ.has(x, z, OCC.BUILDING)) continue;
      let ok = true;
      for (const t of [-0.8, 0, 0.8]) if (!e.free(x + fe.ux * t, z + fe.uz * t, 0.08)) ok = false;
      if (!ok) continue;
      const y = e.H(x, z);
      const k = e.fine(x);
      k.sh.frame(x, y, z, fyaw);
      k.m('#6f5a43', 'wood');
      for (const px of [-0.9, 0.9]) k.sh.box(px, 0.8, 0, 0.1, 1.6, 0.1, 1);
      k.m('#5f5a52', 'stone');
      k.sh.box(0, 0.075, -0.02, 1.7, 0.15, 0.05, 1);
      const tone = ['#8a7258', '#7d684f', '#93795c'][i % 3];
      for (let b = 0; b < 14; b++) {
        k.m(b % 5 === 2 ? '#75604a' : tone, 'wood');
        k.sh.box(-0.81 + b * 0.125, 0.86, 0.035 + (b % 2) * 0.008, 0.135, 1.42, 0.018, 1);
      }
      k.m('#5e4c39', 'wood');
      k.sh.box(0, 1.6, 0.0, 1.8, 0.04, 0.12, 0);
      for (const ry of [0.45, 1.25]) k.sh.box(0, ry, -0.03, 1.7, 0.08, 0.04, 0);
      e.spot(x, y + 0.02, z, fyaw, 0, 0, 0.9, 0.08, 0.1, 0.2, 0.5);
      e.claim(x, z, 0.3);
      items++;
    }
  }
  // patio of riven flags in front of the door (out past the apron), joints with moss, one slab cracked
  {
    const [px, pz] = at(sDoor, 2.3);
    const py = e.H(px, pz);
    const k = e.fine(px);
    k.sh.frame(px, py, pz, yaw);
    for (let i = -1; i <= 1; i++)
      for (let j = 0; j < 3; j++) {
        k.m(['#a8a196', '#b3ab9e', '#9d968a', '#aea595'][(i + 2 + j * 3) % 4], 'stone');
        k.sh.box(i * 0.62 + rng.range(-0.01, 0.01), 0.018 + rng.range(0, 0.008), -0.6 + j * 0.6 + rng.range(-0.01, 0.01), 0.58, 0.035, 0.56, 1);
      }
    k.m('#55663a', 'stone');
    for (const jx of [-0.31, 0.31]) k.sh.box(jx, 0.004, 0, 0.04, 0.008, 1.8, 1);
    items++;
  }
  // timber shed in the far corner: boarded walls, felt pent roof, ledged door with a hasp, a cobwebbed window
  for (const sc of [L / 2 - 1.7, -L / 2 + 1.7]) {
    const ok = placeFree(sc, Dy - 1.5, Math.PI, 1.35, (k) => {
      const W = 2.0,
        D = 1.5,
        Hf = 2.1,
        Hb = 1.85;
      k.m('#7a6650', 'stone');
      k.sh.box(0, 0.05, 0, W + 0.1, 0.1, D + 0.1, 1);
      k.m('#6e5843', 'wood');
      for (let b = 0; b < 13; b++) k.sh.box(0, 0.25 + b * 0.13, -D / 2, W, 0.14, 0.03, 0);
      for (const sx of [-1, 1]) for (let b = 0; b < 12; b++) k.sh.box(sx * W / 2, 0.25 + b * 0.13, 0, 0.03, 0.14, D, 0);
      // front boards either side of the door
      for (let b = 0; b < 12; b++) {
        k.sh.box(-0.7, 0.25 + b * 0.13, D / 2, 0.6, 0.14, 0.03, 0);
        k.sh.box(0.65, 0.25 + b * 0.13, D / 2, 0.7, 0.14, 0.03, 0);
      }
      // door (ledged and braced), hasp + padlock
      k.m('#4f6b5a', 'paint');
      k.sh.box(-0.05, 0.98, D / 2 + 0.015, 0.68, 1.76, 0.03, 0);
      for (const yy of [0.3, 1.65]) k.sh.box(-0.05, yy, D / 2 + 0.035, 0.62, 0.1, 0.02, 0);
      k.sh.push().local(-0.05, 0.98, D / 2 + 0.035, 0, 0, 0.95).box(0, 0, 0, 0.09, 1.45, 0.02, 0).pop();
      k.m('#2a2a2a', 'iron');
      k.sh.box(0.22, 1.05, D / 2 + 0.05, 0.12, 0.03, 0.01, 0);
      k.sh.box(0.27, 1.0, D / 2 + 0.055, 0.04, 0.05, 0.02, 0);
      // window on the side
      k.m('#e8e2d2', 'paint');
      k.sh.box(W / 2 + 0.02, 1.35, 0.1, 0.03, 0.55, 0.65, 0);
      k.m('#262c30', 'glass');
      k.sh.box(W / 2 + 0.035, 1.35, 0.1, 0.01, 0.45, 0.55, 0);
      // corner battens, roof: felt over boards with drip-edge fascia
      k.m('#5e4c39', 'wood');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.sh.box(sx * (W / 2 + 0.02), 1.05, sz * (D / 2 + 0.02), 0.06, 1.7, 0.06, 0);
      k.m('#2b2c2e', 'rubber');
      k.sh.push().local(0, (Hf + Hb) / 2 + 0.05, 0, Math.atan2(Hf - Hb, D + 0.4)).box(0, 0, 0, W + 0.3, 0.04, D + 0.45, 0).pop();
      k.m('#5e4c39', 'wood');
      k.sh.box(0, Hf + 0.0, D / 2 + 0.21, W + 0.3, 0.12, 0.025, 0);
      // gable-ish infill between the wall tops and the sloping roof
      k.m('#6e5843', 'wood');
      for (const sx of [-1, 1]) k.sh.box(sx * W / 2, (Hb + Hf) / 2 - 0.05, 0, 0.03, Hf - Hb + 0.1, D, 0);
      // a water butt off the gutterless corner, a stack of flower pots by the door
      k.m('#2f4f3a', 'plastic');
      k.sh.cyl(W / 2 + 0.38, 0, D / 2 - 0.2, 0.27, 0.3, 0.85, 12, 2);
      k.m('#b8653d', 'ceramic');
      for (let i = 0; i < 4; i++) k.sh.cyl(0.62, 0.0 + i * 0.07, D / 2 + 0.28, 0.08, 0.11, 0.12, 8, 2);
    });
    if (ok) break;
  }
  // pots along the fence: terracotta of mixed sizes with geraniums, a lavender, a small bay tree
  for (let i = 0; i < 5; i++) {
    const sp = -L / 2 + 2.6 + i * 0.55 + rng.range(-0.1, 0.1);
    placeFree(sp, Dy - 0.65, 0, 0.25, (k) => {
      const big = i % 2 === 0;
      k.m(i === 3 ? '#8a8f8c' : '#b8653d', 'ceramic');
      const r0 = big ? 0.14 : 0.1,
        h = big ? 0.3 : 0.2;
      k.sh.cyl(0, 0, 0, r0, r0 * 1.3, h, 10, 1);
      k.sh.cyl(0, h - 0.035, 0, r0 * 1.38, r0 * 1.38, 0.04, 10, 2);
      k.m('#3b2c20', 'stone');
      k.sh.disc(0, h - 0.03, 0, r0 * 1.25, 10, 1);
      if (i === 4) {
        k.m('#5a4632', 'wood');
        k.sh.tube(0, h, 0, 0, h + 0.55, 0, 0.015, 0.012, 5);
        k.m('#3e5b2c', 'plastic');
        k.sh.ellipsoid(0, h + 0.75, 0, 0.24, 0.26, 0.24, 1);
      } else {
        k.m(i === 1 ? '#6f7f5a' : '#3f6a30', 'plastic');
        for (let j = 0; j < 5; j++) k.sh.ellipsoid(Math.cos(j * 1.3) * r0 * 0.6, h + 0.08 + (j % 2) * 0.05, Math.sin(j * 1.3) * r0 * 0.6, 0.07, 0.06, 0.07, 0);
        k.m(i === 1 ? '#8f7bc4' : ['#d8322a', '#e85d8a', '#f2f0ea'][i % 3], 'plastic');
        for (let j = 0; j < 4; j++) k.sh.ellipsoid(Math.cos(j * 1.7 + 0.4) * r0 * 0.7, h + (i === 1 ? 0.3 : 0.17), Math.sin(j * 1.7 + 0.4) * r0 * 0.7, 0.035, i === 1 ? 0.08 : 0.03, 0.035, 0);
      }
    });
  }
  // children's things: a sandpit with bucket and spade, a ball in the grass, a little bike on its side
  placeFree(L / 2 - 2.2, Dy * 0.55, 0.3, 0.8, (k) => {
    k.m('#8a7258', 'wood');
    for (const [x, z, w, d] of [[0, -0.6, 1.3, 0.1], [0, 0.6, 1.3, 0.1], [-0.6, 0, 0.1, 1.1], [0.6, 0, 0.1, 1.1]] as const) k.sh.box(x, 0.11, z, w, 0.22, d, 1);
    k.m('#d9c79a', 'stone');
    k.sh.box(0, 0.08, 0, 1.12, 0.06, 1.12, 1);
    k.sh.ellipsoid(0.2, 0.11, -0.15, 0.25, 0.06, 0.2, 0);
    k.m('#e8443a', 'plastic');
    k.sh.cyl(-0.25, 0.11, 0.2, 0.07, 0.085, 0.13, 10, 1);
    k.m('#2f7fd0', 'plastic');
    k.sh.push().local(0.3, 0.16, 0.25, 0, 0.6, 0.4).box(0, 0, 0, 0.3, 0.015, 0.06, 0).pop();
  });
  placeFree(-L / 2 + 3.2, Dy * 0.6, 0, 0.2, (k) => {
    k.m('#d8322a', 'plastic');
    k.sh.ellipsoid(0, 0.11, 0, 0.11, 0.105, 0.11, 1);
    k.m('#f2f0ea', 'plastic');
    k.sh.ellipsoid(0, 0.12, 0, 0.112, 0.03, 0.112, 0);
  });
  placeFree(0.5, Dy * 0.7, 1.1, 0.5, (k, x, y, z) => {
    k.sh.frame(x, y + 0.13, z, yaw + 1.1, 0.55);
    k.sh.local(0, 0, 0, 0, 0, Math.PI / 2 - 0.12);
    bicycle(k, rng);
  });
  e.inc('place_backyard');
  const [bx, bz] = at(0, 2.5);
  info.backyard = { x: bx, z: bz, yaw, items };
}
