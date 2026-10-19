// Hardscape scatter models (placed by scatter.ts): café sets + parasols, coffee kiosk, planters with
// flowers, bike racks, info boards, public art, station clock, vending machines, luggage trolleys,
// pallets (bare / loaded / wrapped), oil drums, skips, forklifts, crates, cable reels, gas cages,
// IBC tanks, dumpsters, fish boxes, nets, lobster pots, rope coils, ticket machines, EV chargers,
// bottle banks, a ping-pong table, sleeper stacks, ballast heaps, courtyard table, leaning bikes.
//
// Local frame as in furniture.ts (origin on the ground, +Y up, +Z = the item's front).
// `k` = the kit the small parts go to, `ks` = the shadow-casting kit for the big silhouettes.

import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import { Kit } from './furniture';
import { parasol, wheelieBins, CANVAS } from './garden';
import type { ChairOut } from './service';
import { GREEN, type GreenKit } from '../buildings/green';
import { sideGeom } from '../buildings/gen';

const _seat = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const TAU = Math.PI * 2;
const FLOWERS = ['#e8649a', '#f2c84b', '#e8574f', '#b46ad6', '#f5f0e6', '#f08a3c', '#8f9ee8'];
const BIKE_COLS = ['#e63946', '#2a9d8f', '#457b9d', '#e9c46a', '#264653', '#f1faee', '#8d6cab', '#f4a261', '#3d5a80', '#1d1f22'];

// ──────────────────────────────────────────────────────────── plazas ──

/**
 * Bistro table with 2-4 chairs (k); market parasol on most (ks). If `chairs` is given, every chair's
 * seat (world) is appended to it; returns whether a parasol was built.
 */
export function cafe(k: Kit, ks: Kit, rng: Rng, canvas?: [string, string], chairs?: ChairOut[]): boolean {
  const sh = k.sh;
  const metal = rng.pick(['#2c3033', '#3b4a40', '#5a3a2a', '#d8d4ca']);
  k.m(metal, 'iron');
  sh.cyl(0, 0, 0, 0.2, 0.04, 0.72, 6, 0);
  k.m(rng.pick(['#e9e4d8', '#c9b48a', '#2c3033', '#9a6a43']), rng.chance(0.5) ? 'wood' : 'stone');
  sh.cyl(0, 0.72, 0, 0.36, 0.36, 0.035, 10, 3);
  const n = rng.int(2, 4);
  const chairCol = rng.pick(['#2c3033', '#c9473f', '#3f7a8f', '#d8d4ca', '#8a5b3a', '#4f7a4a']);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.3, 0.3) + 0.4;
    sh.push().local(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62, 0, a + Math.PI + rng.range(-0.25, 0.25));
    k.m(chairCol, 'iron');
    for (const x of [-0.18, 0.18]) {
      sh.box(x, 0.21, 0.16, 0.03, 0.42, 0.03, 1);
      sh.box(x, 0.43, -0.18, 0.03, 0.86, 0.03, 1);
    }
    sh.box(0, 0.44, 0, 0.42, 0.035, 0.4, 0);
    sh.push().local(0, 0.68, -0.19, -0.1).box(0, 0, 0, 0.4, 0.26, 0.025, 0).pop();
    if (chairs) {
      sh.world(0, 0.4575, 0.02, _seat);
      sh.world(0, 0.4575, 1.02, _fwd);
      chairs.push({ sx: _seat.x, sy: _seat.y, sz: _seat.z, fx: _fwd.x, fz: _fwd.z });
    }
    sh.pop();
  }
  // cups
  k.m('#f2efe6', 'ceramic');
  if (rng.chance(0.6)) sh.cyl(rng.range(-0.12, 0.12), 0.755, rng.range(-0.12, 0.12), 0.045, 0.035, 0.07, 6, 2);
  // (the caller frames `ks` at the same spot)
  if (rng.chance(0.72)) {
    parasol(ks, rng, 1.25, 2.35, canvas);
    return true;
  }
  return false;
}

/**
 * Kerbside bistro table for two (furniture band of a sidewalk): small round table, two chairs facing each
 * other along local x (the street), cups / a carafe. Seats appended to `chairs`.
 */
export function kerbCafe(k: Kit, rng: Rng, chairs?: ChairOut[]): void {
  const sh = k.sh;
  k.m(rng.pick(['#2c3033', '#3b4a40', '#d8d4ca']), 'iron');
  sh.cyl(0, 0, 0, 0.17, 0.035, 0.72, 6, 0);
  k.m(rng.pick(['#e9e4d8', '#c9b48a', '#2c3033', '#b8b2a6']), rng.chance(0.5) ? 'stone' : 'wood');
  sh.cyl(0, 0.72, 0, 0.29, 0.29, 0.03, 10, 3);
  const chairCol = rng.pick(['#2c3033', '#c9473f', '#3f7a8f', '#d8d4ca', '#8a5b3a', '#4f7a4a', '#d8b24a']);
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    sh.push().local(Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55, 0, a + Math.PI + rng.range(-0.15, 0.15));
    k.m(chairCol, 'iron');
    for (const x of [-0.17, 0.17]) {
      sh.box(x, 0.21, 0.15, 0.028, 0.42, 0.028, 1);
      sh.box(x, 0.43, -0.17, 0.028, 0.86, 0.028, 1);
    }
    sh.box(0, 0.44, 0, 0.4, 0.035, 0.38, 0);
    sh.push().local(0, 0.68, -0.18, -0.1).box(0, 0, 0, 0.38, 0.24, 0.025, 0).pop();
    if (chairs) {
      sh.world(0, 0.4575, 0.02, _seat);
      sh.world(0, 0.4575, 1.02, _fwd);
      chairs.push({ sx: _seat.x, sy: _seat.y, sz: _seat.z, fx: _fwd.x, fz: _fwd.z });
    }
    sh.pop();
  }
  k.m('#f2efe6', 'ceramic');
  sh.cyl(0.1, 0.75, 0.05, 0.04, 0.032, 0.065, 6, 2);
  if (rng.chance(0.5)) sh.cyl(-0.1, 0.75, -0.04, 0.04, 0.032, 0.065, 6, 2);
  if (rng.chance(0.35)) {
    k.m('#cfe3e8', 'glass');
    sh.cyl(0.0, 0.75, -0.12, 0.035, 0.03, 0.2, 6, 2);
  }
}

/** A-frame chalkboard sign (café menu) standing on the pavement, boards facing ±Z. */
export function aFrame(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const wood = rng.pick(['#7a5236', '#3b2a20', '#2c3033']);
  for (const sgn of [1, -1]) {
    sh.push().local(0, 0, sgn * 0.17, sgn * 0.19);
    k.m(wood, 'wood');
    sh.box(0, 0.47, 0, 0.58, 0.94, 0.03, 0);
    k.m('#1f2421', 'stone');
    sh.box(0, 0.52, sgn * 0.017, 0.48, 0.72, 0.006, 0);
    // chalk: title + a few lines
    k.m('#e9e6dd', 'stone');
    sh.box(0, 0.78, sgn * 0.022, 0.3, 0.05, 0.004, 0);
    for (let i = 0; i < 4; i++) sh.box(rng.range(-0.06, 0.04), 0.64 - i * 0.1, sgn * 0.022, rng.range(0.18, 0.34), 0.018, 0.004, 0);
    if (rng.chance(0.6)) {
      k.m(rng.pick(['#e8574f', '#f2c84b', '#8fcf8a']), 'stone');
      sh.box(0.14, 0.34, sgn * 0.022, 0.08, 0.06, 0.004, 0);
    }
    sh.pop();
  }
}

/** Coffee kiosk: little cabin with a serving hatch, striped awning and a lit menu board. Faces +Z. */
export function kiosk(ks: Kit, k: Kit, rng: Rng): void {
  const sh = ks.sh;
  const body = rng.pick(['#2f6b4f', '#7a2f35', '#2b5d7a', '#e8d9b8', '#3a3f45']);
  const awn = rng.pick(CANVAS);
  ks.m(body, 'paint');
  sh.box(0, 1.2, 0, 2.6, 2.4, 2.0, 1);
  ks.m('#e9e4d8', 'paint');
  sh.box(0, 2.5, 0, 2.85, 0.2, 2.25, 0);
  // hatch + counter
  ks.e('#d8c9a0', '#ffd59a', 0.9);
  sh.box(0, 1.35, 1.005, 1.7, 0.85, 0.02, 0);
  ks.m('#c9b48a', 'wood');
  sh.box(0, 0.92, 1.12, 2.0, 0.06, 0.32, 0);
  // striped awning over the hatch
  const n = 7;
  for (let i = 0; i < n; i++) {
    ks.m(i % 2 ? '#f4efe4' : awn, 'plastic');
    sh.push().local(-1.0 + (i + 0.5) * (2.0 / n), 2.1, 1.35, 0.45).box(0, 0, 0, 2.0 / n, 0.03, 0.8, 0).pop();
  }
  // menu board + sign on the roof
  ks.e('#2a2e31', '#fff1d6', 0.4);
  sh.box(1.31, 1.5, 0.3, 0.02, 0.7, 0.9, 0);
  ks.e('#f4efe4', '#ffe2a8', 1.2);
  sh.box(0, 2.85, 0.4, 1.6, 0.42, 0.08, 0);
  ks.m(awn, 'paint');
  sh.box(0, 2.85, 0.45, 1.2, 0.16, 0.02, 0);
  // a bin beside it (the caller frames `k` at the same spot)
  k.m('#3a3f44', 'steel');
  k.sh.cyl(-1.6, 0, 0.7, 0.2, 0.2, 0.75, 8, 2);
}

/**
 * Large square concrete / corten planter with flowers and a shrub ball. With `green` (leaf cards framed at the
 * same spot) the planting is a lush mix of a shrub / palm / grass centre, flowering clumps round it and ivy or
 * petunias trailing over the rim instead of the blob shrub.
 */
export function planter(k: Kit, rng: Rng, round: boolean, green?: GreenKit): void {
  const sh = k.sh;
  const body = round ? rng.pick(['#c9c3b7', '#8a6a52', '#4f5a52']) : rng.pick(['#c4beb3', '#8a4a2e', '#3f4549', '#d8d0c0']);
  k.m(body, body === '#8a4a2e' ? 'iron' : 'stone');
  if (round) sh.cyl(0, 0, 0, 0.62, 0.58, 0.55, 12, 2);
  else sh.box(0, 0.3, 0, 1.3, 0.6, 1.3, 1);
  k.m('#4a3424', 'stone');
  if (round) sh.disc(0, 0.56, 0, 0.55, 10, 1);
  else sh.box(0, 0.6, 0, 1.18, 0.02, 1.18, 1);
  if (green) {
    const top = round ? 0.56 : 0.6;
    const centre = rng.weighted([GREEN.SHRUB, GREEN.PALM, GREEN.GRASS, GREEN.LAVENDER], [3, 2, 1.5, 1]);
    green.clump(0, top - 0.03, 0, centre === GREEN.PALM ? 0.65 : 0.5, centre === GREEN.PALM ? rng.range(1.3, 1.9) : rng.range(0.8, 1.25), centre, 3);
    const ring = rng.weighted([GREEN.GERANIUM, GREEN.LAVENDER, GREEN.JASMINE, GREEN.GRASS], [3, 1.5, 1, 1]);
    const m = round ? 5 : 6;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU + rng.range(-0.2, 0.2);
      const rr = round ? 0.4 : 0.45;
      green.clump(Math.cos(a) * rr, top - 0.02, Math.sin(a) * rr, 0.2, rng.range(0.3, 0.5), i % 3 === 2 ? GREEN.GERANIUM : ring, 2);
    }
    if (rng.chance(0.75)) {
      const trail = rng.chance(0.5) ? GREEN.IVY_HANG : GREEN.PETUNIA;
      const hw = round ? 0.45 : 0.62;
      for (const s of [0, 1, 2, 3] as const) {
        if (rng.chance(0.35)) continue;
        const sg = sideGeom({ x0: -hw, x1: hw, z0: -hw, z1: hw }, s);
        green.hang(sg, 0.08, sg.L - 0.08, round ? 0.12 : 0.02, top + 0.02, 0.15, rng.range(0.3, 0.5), trail, 0.04, 1, 0.08);
      }
    }
    return;
  }
  // shrub ball or low bush in the middle
  k.m(rng.pick(['#3f7a3a', '#4f8a3a', '#2f6a35']), 'wood');
  sh.ellipsoid(0, round ? 0.95 : 1.0, 0, 0.42, 0.42, 0.42, 1);
  // flower clumps around it (one blob each: blooms on a leafy base, coloured per vertex height)
  const fc = rng.pick(FLOWERS);
  const fc2 = rng.pick(FLOWERS);
  const m = round ? 5 : 6;
  for (let i = 0; i < m; i++) {
    const a = (i / m) * TAU + rng.range(-0.2, 0.2);
    const rr = round ? 0.42 : 0.47;
    const x = Math.cos(a) * rr * (round ? 1 : 1.12),
      z = Math.sin(a) * rr * (round ? 1 : 1.12);
    k.m(i % 3 ? fc : fc2, 'plastic');
    sh.ellipsoid(x, round ? 0.66 : 0.7, z, 0.17, 0.1, 0.17, 0);
  }
}

/** Low-poly bicycle along local x (front wheel at +x), for dense racks (~110 tris). */
export function bikeLite(k: Kit, color: string): void {
  const sh = k.sh;
  const r = 0.33;
  // tyres as open rings (spokes read as see-through)
  k.m('#1e1f21', 'rubber');
  for (const x of [-0.52, 0.52]) sh.push().local(x, r, 0, Math.PI / 2, 0, 0).cyl(0, -0.025, 0, r, r, 0.05, 8, 0, false).pop();
  const R = [-0.52, r],
    C = [-0.02, 0.3],
    S = [-0.17, 0.82],
    Hd = [0.36, 0.84],
    F = [0.52, r];
  k.m(color, 'paint');
  const bar = (a: number[], b: number[], w = 0.04) => sh.beam(a[0], a[1], 0, b[0], b[1], 0, w, w, false);
  bar(R, C);
  bar(C, S);
  bar(R, S);
  bar(C, Hd);
  bar(Hd, F, 0.03);
  k.m('#2a2a2a', 'plastic');
  sh.box(S[0] - 0.02, S[1] + 0.06, 0, 0.2, 0.04, 0.08, 1);
  sh.beam(Hd[0], Hd[1] + 0.08, -0.22, Hd[0], Hd[1] + 0.08, 0.22, 0.03, 0.03, false);
}

/** Steel hoop rack along local x with bikes; `fill` = probability per slot. */
export function bikeRow(k: Kit, rng: Rng, fill: number): void {
  const sh = k.sh;
  const hoops = [-1.05, -0.35, 0.35, 1.05];
  k.m('#9aa3a8', 'steel');
  for (const x of hoops) {
    sh.beam(x, 0, -0.32, x, 0.66, -0.32, 0.035, 0.035, false);
    sh.beam(x, 0, 0.32, x, 0.66, 0.32, 0.035, 0.035, false);
    sh.beam(x, 0.68, -0.34, x, 0.68, 0.34, 0.035, 0.035, false);
  }
  for (const x of hoops) {
    for (const side of [-1, 1]) {
      if (!rng.chance(fill)) continue;
      // bike along local z (perpendicular to the row), leaning on the hoop
      sh.push().local(x + side * 0.12, 0, rng.range(-0.08, 0.08), 0.06 * side, Math.PI / 2 + (rng.chance(0.5) ? 0 : Math.PI), 0.07 * side);
      bikeLite(k, rng.pick(BIKE_COLS));
      sh.pop();
    }
  }
}

/** City map / info board on two posts. */
export function infoBoard(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const frame = rng.pick(['#2f3a52', '#2f4a3e', '#3a3f45']);
  k.m(frame, 'paint');
  sh.box(-0.62, 1.0, 0, 0.08, 2.0, 0.08, 1);
  sh.box(0.62, 1.0, 0, 0.08, 2.0, 0.08, 1);
  sh.box(0, 1.35, 0, 1.36, 1.0, 0.07, 0);
  sh.box(0, 2.02, 0, 1.4, 0.14, 0.12, 0);
  // map faces: pale base + blue river + green park blocks + a red "you are here"
  for (const sz of [1, -1]) {
    const z = sz * 0.04;
    k.e('#ece6d6', '#fff4dc', 0.35);
    sh.box(0, 1.35, z, 1.2, 0.86, 0.01, 0);
    k.e('#7fa8c8', '#fff4dc', 0.3);
    sh.box(0, 1.08, z + sz * 0.004, 1.2, 0.08, 0.01, 0);
    k.e('#9cc48a', '#fff4dc', 0.3);
    sh.box(-0.25, 1.45, z + sz * 0.004, 0.3, 0.22, 0.01, 0);
    sh.box(0.33, 1.6, z + sz * 0.004, 0.2, 0.14, 0.01, 0);
    k.m('#d9473f', 'plastic');
    sh.box(0.1, 1.32, z + sz * 0.008, 0.05, 0.05, 0.01, 0);
  }
}

/** Public art: a big ring, stacked cubes or a stylised figure on a plinth (colourful accent). */
export function sculpture(ks: Kit, rng: Rng): void {
  const sh = ks.sh;
  ks.m('#cfc8ba', 'stone');
  sh.box(0, 0.25, 0, 1.6, 0.5, 1.6, 1);
  const kind = rng.int(0, 2);
  const col = rng.pick(['#d9473f', '#e8a33c', '#2f7fb8', '#e86a8a', '#3f8f5a']);
  if (kind === 0) {
    // ring on edge
    ks.m(col, 'paint');
    const n = 18,
      R = 1.05;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU,
        a1 = ((i + 1) / n) * TAU;
      sh.tube(Math.cos(a0) * R, 1.6 + Math.sin(a0) * R, 0, Math.cos(a1) * R, 1.6 + Math.sin(a1) * R, 0, 0.15, 0.15, 6);
    }
  } else if (kind === 1) {
    const cols = ['#d9473f', '#e8c35a', '#2f7fb8', '#f4efe4'];
    let y = 0.5;
    for (let i = 0; i < 4; i++) {
      const s = 1.0 - i * 0.17;
      ks.m(cols[(i + rng.int(0, 3)) % 4], 'paint');
      sh.push().local(rng.range(-0.12, 0.12), y + s / 2, rng.range(-0.12, 0.12), 0, rng.range(0, 1.5)).box(0, 0, 0, s, s, s, 0).pop();
      y += s;
    }
  } else {
    // abstract twisted column
    ks.m(col, 'paint');
    for (let i = 0; i < 6; i++) sh.push().local(0, 0.5 + i * 0.45 + 0.22, 0, 0, i * 0.35).box(0, 0, 0, 0.7 - i * 0.05, 0.42, 0.24, 0).pop();
  }
}

/** Station clock on a tall post (two faces, lit at night). */
export function clockPost(ks: Kit): void {
  const sh = ks.sh;
  ks.m('#2f3a33', 'iron');
  sh.cyl(0, 0, 0, 0.22, 0.18, 0.4, 8, 2);
  sh.cyl(0, 0.4, 0, 0.08, 0.07, 3.3, 8, 0);
  sh.box(0, 3.95, 0, 0.9, 0.9, 0.24, 0);
  for (const sz of [1, -1]) {
    sh.push().local(0, 3.95, sz * 0.125, Math.PI / 2 * sz, 0, 0);
    ks.e('#f4f1e8', '#fff1d6', 0.8);
    sh.cyl(0, 0, 0, 0.36, 0.36, 0.01, 16, 2);
    ks.m('#1d1f22', 'iron');
    sh.box(0.0, 0.012, 0.12, 0.03, 0.006, 0.24, 0);
    sh.box(0.09, 0.012, 0.0, 0.18, 0.006, 0.025, 0);
    sh.pop();
  }
  ks.m('#2f3a33', 'iron');
  sh.cone(0, 4.4, 0, 0.3, 0.25, 4, false, Math.PI / 4);
}

/** Taxi rank sign: post with a yellow TAXI box (lit at night). */
export function taxiSign(k: Kit): void {
  const sh = k.sh;
  k.m('#3a3f44', 'paint');
  sh.cyl(0, 0, 0, 0.06, 0.05, 2.5, 6, 0);
  k.e('#f2c84b', '#ffe08a', 1.1);
  sh.box(0, 2.6, 0, 0.7, 0.28, 0.16, 0);
  k.m('#1d1f22', 'paint');
  sh.box(0, 2.6, 0.082, 0.5, 0.1, 0.005, 0);
  sh.box(0, 2.6, -0.082, 0.5, 0.1, 0.005, 0);
}

/** Drinks / ticket vending machine pair. Faces +Z. */
export function vending(k: Kit, rng: Rng): void {
  const sh = k.sh;
  for (const x of [-0.26, 0.26]) {
    const c = rng.pick(['#c9302c', '#2f5f9e', '#2a7a4a', '#e8e4da']);
    k.m(c, 'paint');
    sh.box(x, 0.95, 0, 0.5, 1.9, 0.7, 1);
    k.e('#bcd4e0', '#e8f4ff', 0.9);
    sh.box(x - 0.06, 1.2, 0.351, 0.32, 1.0, 0.01, 0);
    k.m('#1d1f22', 'paint');
    sh.box(x + 0.17, 1.05, 0.352, 0.08, 0.3, 0.01, 0);
  }
}

/** A nest of luggage trolleys. */
export function trolleys(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const x = -1.0 + i * 0.38;
    k.m('#9aa3a8', 'steel');
    sh.box(x, 0.2, 0, 0.32, 0.03, 0.6, 0);
    sh.box(x, 0.55, -0.3, 0.32, 0.7, 0.03, 0);
    k.m('#d9473f', 'plastic');
    sh.box(x, 0.92, -0.3, 0.34, 0.05, 0.05, 0);
    k.m('#1d1f22', 'rubber');
    sh.box(x, 0.06, 0.2, 0.3, 0.12, 0.08, 1);
  }
}

// ───────────────────────────────────────────────────────────── yards ──

const PALLET = '#b08a5a';

function pallet(k: Kit, y: number, tint: number): void {
  const sh = k.sh;
  k.m(PALLET, 'wood');
  k.s.r *= tint;
  k.s.g *= tint;
  k.s.b *= tint;
  for (const z of [-0.45, 0, 0.45]) sh.box(0, y + 0.05, z, 1.2, 0.1, 0.1, 1);
  sh.box(0, y + 0.125, 0, 1.2, 0.025, 1.0, 1);
}

/** Stack of empty pallets (2-9). */
export function pallets(k: Kit, rng: Rng): void {
  const n = rng.int(2, 9);
  for (let i = 0; i < n; i++) {
    k.sh.push().local(rng.range(-0.04, 0.04), 0, rng.range(-0.04, 0.04), 0, rng.range(-0.06, 0.06));
    pallet(k, i * 0.145, 0.85 + rng.next() * 0.3);
    k.sh.pop();
  }
}

/** Pallet with goods: shrink-wrapped load, sacks or brick packs (sometimes double stacked). */
export function palletGoods(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const levels = rng.chance(0.35) ? 2 : 1;
  let y = 0;
  for (let l = 0; l < levels; l++) {
    pallet(k, y, 1);
    const kind = rng.int(0, 3);
    const h = rng.range(0.6, 1.0);
    if (kind === 0) {
      k.m(rng.pick(['#e6eef0', '#d7e3ea', '#2f5f9e', '#e8d9b8']), 'plastic');
      sh.box(0, y + 0.15 + h / 2, 0, 1.15, h, 0.95, 1);
    } else if (kind === 1) {
      k.m(rng.pick(['#e8dcc0', '#cfc3a8', '#b8b0a0']), 'rubber');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) sh.ellipsoid(-0.28 + c * 0.56, y + 0.24 + r * 0.17, rng.range(-0.05, 0.05), 0.3, 0.1, 0.45, 0);
    } else if (kind === 2) {
      k.m(rng.pick(['#a65d43', '#b8643f', '#c9c3b7']), 'stone');
      sh.box(0, y + 0.15 + h / 2, 0, 1.1, h, 0.9, 1);
      k.m('#3a3f44', 'steel');
      sh.box(0, y + 0.15 + h / 2, 0, 1.12, h * 0.9, 0.04, 0);
    } else {
      k.m(rng.pick(['#c9a46a', '#b8946a']), 'wood');
      sh.box(-0.29, y + 0.15 + 0.22, -0.24, 0.55, 0.44, 0.46, 1);
      sh.box(0.29, y + 0.15 + 0.22, -0.24, 0.55, 0.44, 0.46, 1);
      sh.box(-0.29, y + 0.15 + 0.22, 0.24, 0.55, 0.44, 0.46, 1);
      sh.box(0.2, y + 0.15 + 0.66, 0.0, 0.55, 0.44, 0.46, 1);
    }
    y += 0.15 + h;
  }
}

/** Cluster of oil drums (some on a pallet). */
export function drums(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const col = rng.pick(['#2f5f9e', '#c9302c', '#e8b23c', '#3f6e4a', '#3a3f44']);
  const onPallet = rng.chance(0.4);
  const y0 = onPallet ? 0.15 : 0;
  if (onPallet) pallet(k, 0, 1);
  const spots: [number, number][] = [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
    [0.62, 0.0],
  ];
  const n = rng.int(2, onPallet ? 4 : 5);
  for (let i = 0; i < n; i++) {
    const [x, z] = spots[i];
    k.m(rng.chance(0.8) ? col : rng.pick(['#2f5f9e', '#c9302c', '#e8b23c']), 'paint');
    sh.cyl(x, y0, z, 0.29, 0.29, 0.88, 8, 2);
    k.m('#2a2c2e', 'steel');
    sh.cyl(x, y0 + 0.3, z, 0.295, 0.295, 0.03, 8, 0);
    sh.cyl(x, y0 + 0.6, z, 0.295, 0.295, 0.03, 8, 0);
  }
  if (!onPallet && rng.chance(0.5)) {
    // one lying on its side
    k.m(col, 'paint');
    sh.push().local(-0.1, 0.29, 0.95, 0, rng.range(0, 3), Math.PI / 2).cyl(0, -0.44, 0, 0.29, 0.29, 0.88, 10, 3).pop();
  }
}

/** Open skip (trapezoid container) with rubble / scrap inside. */
export function skip(ks: Kit, rng: Rng): void {
  const sh = ks.sh;
  const c = rng.pick(['#e8b23c', '#3f6e4a', '#2f5f9e', '#c9302c']);
  const L0 = 2.6,
    L1 = 3.7,
    W = 1.75,
    H = 1.1;
  ks.m(c, 'paint');
  // floor + sloped ends + sides
  const s = ks.s;
  const P = (x: number, y: number, z: number) => [x, y, z];
  const quad = (a: number[], b: number[], cc: number[], d: number[]) => sh.quad4([...a, ...b, ...cc, ...d], true);
  quad(P(-L0 / 2, 0.08, -W / 2), P(L0 / 2, 0.08, -W / 2), P(L0 / 2, 0.08, W / 2), P(-L0 / 2, 0.08, W / 2));
  quad(P(-L0 / 2, 0.08, W / 2), P(L0 / 2, 0.08, W / 2), P(L1 / 2, H, W / 2), P(-L1 / 2, H, W / 2));
  quad(P(L0 / 2, 0.08, -W / 2), P(-L0 / 2, 0.08, -W / 2), P(-L1 / 2, H, -W / 2), P(L1 / 2, H, -W / 2));
  quad(P(L0 / 2, 0.08, W / 2), P(L0 / 2, 0.08, -W / 2), P(L1 / 2, H, -W / 2), P(L1 / 2, H, W / 2));
  quad(P(-L0 / 2, 0.08, -W / 2), P(-L0 / 2, 0.08, W / 2), P(-L1 / 2, H, W / 2), P(-L1 / 2, H, -W / 2));
  void s;
  ks.m('#2a2c2e', 'steel');
  sh.box(0, 0.04, 0, L0, 0.08, W - 0.2, 1);
  sh.box(0, H, W / 2, L1 + 0.04, 0.06, 0.06, 0);
  sh.box(0, H, -W / 2, L1 + 0.04, 0.06, 0.06, 0);
  // contents: rubble mound / timber / scrap
  const fill = rng.int(0, 2);
  if (fill === 0) {
    ks.m(rng.pick(['#8a8378', '#9a7a62', '#7a756c']), 'stone');
    sh.ellipsoid(0, 0.55, 0, 1.4, 0.55, 0.75, 1);
  } else if (fill === 1) {
    ks.m('#a8885a', 'wood');
    for (let i = 0; i < 7; i++) sh.push().local(rng.range(-0.8, 0.8), 0.6 + rng.range(0, 0.4), rng.range(-0.5, 0.5), rng.range(-0.3, 0.3), rng.range(-0.4, 0.4), rng.range(-0.2, 0.2)).box(0, 0, 0, 2.2, 0.06, 0.14, 0).pop();
  } else {
    ks.m('#6f6a62', 'steel');
    sh.ellipsoid(-0.3, 0.6, 0, 1.0, 0.45, 0.65, 0);
    ks.m('#a65d43', 'iron');
    sh.ellipsoid(0.7, 0.75, 0.1, 0.5, 0.35, 0.45, 0);
  }
}

/** Counterbalance forklift (forks towards +Z). */
export function forklift(ks: Kit, rng: Rng): void {
  const sh = ks.sh;
  const body = rng.pick(['#e8b23c', '#e86a2c', '#c9302c', '#3f6e4a']);
  // chassis + counterweight
  ks.m(body, 'paint');
  sh.box(0, 0.55, -0.15, 1.05, 0.7, 1.7, 1);
  ks.m('#2a2c2e', 'steel');
  sh.box(0, 0.62, -1.0, 1.05, 0.8, 0.35, 1);
  // seat + overhead guard
  ks.m('#1d1f22', 'rubber');
  sh.box(0, 1.0, -0.4, 0.5, 0.18, 0.45, 1);
  sh.box(0, 1.25, -0.6, 0.5, 0.45, 0.1, 0);
  ks.m('#2a2c2e', 'steel');
  for (const x of [-0.45, 0.45]) {
    sh.box(x, 1.55, 0.35, 0.06, 1.4, 0.06, 1);
    sh.box(x, 1.55, -0.85, 0.06, 1.4, 0.06, 1);
  }
  sh.box(0, 2.25, -0.25, 1.0, 0.06, 1.3, 0);
  // mast + forks
  ks.m('#3a3d40', 'steel');
  sh.box(-0.32, 1.25, 0.72, 0.1, 2.5, 0.12, 1);
  sh.box(0.32, 1.25, 0.72, 0.1, 2.5, 0.12, 1);
  sh.box(0, 0.45, 0.82, 0.8, 0.5, 0.06, 0);
  sh.box(-0.22, 0.08, 1.35, 0.1, 0.05, 1.05, 0);
  sh.box(0.22, 0.08, 1.35, 0.1, 0.05, 1.05, 0);
  // wheels
  ks.m('#1d1f22', 'rubber');
  for (const [z, r] of [
    [0.45, 0.3],
    [-0.75, 0.24],
  ])
    for (const x of [-0.5, 0.5]) sh.push().local(x, r, z, 0, 0, Math.PI / 2).cyl(0, -0.11, 0, r, r, 0.22, 8, 3, false).pop();
  ks.e('#ffe9b0', '#ffb84a', 1.4);
  sh.box(0, 2.32, -0.6, 0.1, 0.08, 0.1, 0);
}

/** Stack of wooden crates. */
export function crates(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const spots: [number, number, number][] = [
    [-0.4, 0, -0.2],
    [0.42, 0, -0.18],
    [-0.38, 0, 0.42],
    [0.0, 0.62, 0.0],
  ];
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = spots[i];
    const s = rng.range(0.55, 0.7);
    sh.push().local(x, y, z, 0, rng.range(-0.2, 0.2));
    k.m(rng.pick(['#b08a5a', '#a07a4a', '#c09a68']), 'wood');
    sh.box(0, s / 2, 0, s, s, s, 1);
    k.m('#7a5a38', 'wood');
    sh.box(0, s / 2, s / 2 + 0.005, s * 1.01, 0.06, 0.012, 0);
    sh.box(0, s / 2, -s / 2 - 0.005, s * 1.01, 0.06, 0.012, 0);
    sh.pop();
  }
}

/** Wooden cable reels (one standing, one on its side). */
export function cableReel(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const R = rng.range(0.45, 0.6);
  k.m('#a8885a', 'wood');
  sh.push().local(-0.25, R, 0, Math.PI / 2, 0, 0);
  sh.cyl(0, -0.4, 0, R, R, 0.06, 12, 3);
  sh.cyl(0, 0.34, 0, R, R, 0.06, 12, 3);
  k.m(rng.pick(['#1d1f22', '#c9302c', '#2f5f9e', '#3a3a3a']), 'rubber');
  sh.cyl(0, -0.34, 0, R * 0.8, R * 0.8, 0.68, 12, 0);
  sh.pop();
  if (rng.chance(0.6)) {
    k.m('#9a7a4a', 'wood');
    sh.cyl(0.5, 0, 0.1, 0.4, 0.4, 0.06, 10, 2);
    sh.cyl(0.5, 0.5, 0.1, 0.4, 0.4, 0.06, 10, 2);
    k.m('#1d1f22', 'rubber');
    sh.cyl(0.5, 0.06, 0.1, 0.28, 0.28, 0.44, 10, 0);
  }
}

/** Gas bottle cage. Faces +Z. */
export function gasCage(k: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m('#5a646b', 'steel');
  for (const x of [-0.68, 0.68]) for (const z of [-0.4, 0.4]) sh.box(x, 0.85, z, 0.05, 1.7, 0.05, 1);
  sh.box(0, 1.7, 0, 1.4, 0.04, 0.85, 0);
  for (const y of [0.05, 1.0]) {
    sh.box(0, y, -0.4, 1.4, 0.04, 0.04, 0);
    sh.box(0, y, 0.4, 1.4, 0.04, 0.04, 0);
  }
  const col = rng.pick(['#e8e4da', '#3f6e4a', '#c9302c', '#2f5f9e']);
  for (let i = 0; i < rng.int(3, 7); i++) {
    const x = -0.5 + (i % 5) * 0.25,
      z = i < 5 ? -0.12 : 0.18;
    k.m(rng.chance(0.75) ? col : '#e8b23c', 'paint');
    sh.cyl(x, 0.02, z, 0.11, 0.11, 1.2, 8, 0);
    sh.ellipsoid(x, 1.22, z, 0.11, 0.08, 0.11, 0);
    k.m('#3a3d40', 'steel');
    sh.cyl(x, 1.27, z, 0.03, 0.03, 0.08, 5, 2);
  }
}

/** Two IBC tanks (white tanks in steel cages on pallets). */
export function ibc(k: Kit, rng: Rng): void {
  const sh = k.sh;
  for (const x of [-0.62, 0.62]) {
    if (x > 0 && rng.chance(0.25)) continue;
    k.m('#4a4d50', 'steel');
    sh.box(x, 0.07, 0, 1.15, 0.14, 1.0, 1);
    const fill = rng.range(0.3, 0.95);
    k.m('#e6e2d6', 'plastic');
    sh.box(x, 0.14 + 0.5, 0, 1.0, 1.0, 0.92, 1);
    k.m(rng.pick(['#c8b88a', '#7a9a5a', '#b8a888', '#5a6a7a']), 'plastic');
    sh.box(x, 0.14 + fill * 0.5, 0.465, 0.9, fill, 0.005, 0);
    k.m('#8a9399', 'steel');
    for (const xx of [-0.5, 0, 0.5]) sh.box(x + xx, 0.66, 0.47, 0.03, 1.04, 0.03, 1);
    for (const y of [0.4, 0.9]) sh.box(x, y, 0.47, 1.04, 0.03, 0.03, 0);
    sh.box(x, 1.16, 0, 1.04, 0.03, 0.96, 0);
    k.m('#2a2c2e', 'plastic');
    sh.cyl(x, 1.17, 0, 0.1, 0.1, 0.05, 8, 2);
  }
}

/** Wheeled steel dumpster with lids. Faces +Z. */
export function dumpster(ks: Kit, rng: Rng): void {
  const sh = ks.sh;
  const c = rng.pick(['#3f6e4a', '#2f5f9e', '#3a3f44', '#7a5232']);
  ks.m(c, 'paint');
  sh.box(0, 0.75, 0, 1.9, 1.05, 1.05, 1);
  ks.m('#2a2c2e', 'plastic');
  sh.push().local(-0.48, 1.3, 0, -0.08).box(0, 0, 0, 0.92, 0.05, 1.1, 0).pop();
  sh.push().local(0.48, 1.3, 0, rng.chance(0.3) ? -0.9 : -0.06).box(0, 0, 0, 0.92, 0.05, 1.1, 0).pop();
  ks.m('#1d1f22', 'rubber');
  for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) sh.cyl(x, 0, z, 0.1, 0.1, 0.22, 6, 2);
}

// ─────────────────────────────────────────────────────────────── quay ──

/** Stacks of fish boxes (blue / orange / white). */
export function fishBoxes(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const cols = ['#2f6fb0', '#e8762c', '#e8e4da', '#3f8f6a'];
  const cA = rng.pick(cols),
    cB = rng.pick(cols);
  for (const [x, z] of [
    [-0.42, -0.28],
    [0.42, -0.28],
    [-0.42, 0.32],
    [0.42, 0.32],
  ]) {
    if (rng.chance(0.25)) continue;
    const n = rng.int(1, 5);
    for (let i = 0; i < n; i++) {
      k.m(rng.chance(0.7) ? cA : cB, 'plastic');
      sh.push().local(x, i * 0.26, z, 0, rng.range(-0.06, 0.06));
      sh.box(0, 0.13, 0, 0.78, 0.25, 0.52, 1);
      k.s.r *= 0.6;
      k.s.g *= 0.6;
      k.s.b *= 0.6;
      sh.box(0, 0.255, 0, 0.7, 0.01, 0.44, 1);
      sh.pop();
    }
  }
}

/** Heap of fishing net with floats. */
export function nets(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const c = rng.pick(['#2f5a46', '#3a4f6a', '#6a4a3a', '#2a3a3a']);
  k.m(c, 'rubber');
  sh.ellipsoid(0, 0.25, 0, 1.0, 0.32, 0.7, 1);
  sh.ellipsoid(0.45, 0.35, 0.1, 0.55, 0.3, 0.45, 1);
  k.m(rng.pick(['#e8762c', '#f2c84b', '#c9302c']), 'plastic');
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, TAU),
      r = rng.range(0.3, 0.9);
    sh.ellipsoid(Math.cos(a) * r, 0.3 + rng.range(0, 0.25), Math.sin(a) * r * 0.65, 0.09, 0.09, 0.09, 0);
  }
}

/** Lobster / crab pots. */
export function pots(k: Kit, rng: Rng): void {
  const sh = k.sh;
  for (let i = 0; i < rng.int(2, 5); i++) {
    const x = -0.55 + (i % 3) * 0.55,
      y = i < 3 ? 0 : 0.42,
      z = i < 3 ? 0 : 0.0;
    sh.push().local(x, y, z, 0, rng.range(-0.15, 0.15));
    k.m(rng.pick(['#3a3f44', '#2f5a46', '#6a5a3a']), 'iron');
    sh.box(0, 0.02, 0, 0.5, 0.04, 0.7, 1);
    for (let a = 0; a < 5; a++) {
      const t = (a / 4) * Math.PI;
      sh.box(0, 0.02 + Math.sin(t) * 0.36, -0.35 + (1 - Math.cos(t)) * 0.35, 0.5, 0.02, 0.02, 0);
    }
    k.m(rng.pick(['#e8762c', '#2f6fb0']), 'rubber');
    sh.box(0, 0.2, 0, 0.48, 0.3, 0.66, 3);
    sh.pop();
  }
}

/** Coiled mooring rope. */
export function rope(k: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m(rng.pick(['#d8c890', '#e8b23c', '#2f6fb0', '#e8e4da']), 'rubber');
  for (let i = 0; i < 3; i++) sh.cyl(0, i * 0.07, 0, 0.45 - i * 0.04, 0.45 - i * 0.04, 0.07, 12, 2);
  k.m('#1d1f22', 'rubber');
  sh.disc(0, 0.215, 0, 0.18, 8, 1);
}

// ─────────────────────────────────────────────────────────── car parks ──

/** Pay & display machine. Faces +Z. */
export function ticketMachine(k: Kit): void {
  const sh = k.sh;
  k.m('#3a3f44', 'paint');
  sh.box(0, 0.06, 0, 0.6, 0.12, 0.42, 1);
  k.m('#2f5f9e', 'paint');
  sh.box(0, 0.85, 0, 0.5, 1.5, 0.36, 1);
  k.e('#bcd4e0', '#e8f4ff', 0.8);
  sh.box(0, 1.25, 0.181, 0.32, 0.2, 0.01, 0);
  k.m('#f2c84b', 'paint');
  sh.box(0, 1.55, 0.181, 0.4, 0.12, 0.01, 0);
  k.m('#3a3f44', 'paint');
  sh.box(0, 1.64, 0, 0.56, 0.06, 0.42, 0);
}

/** EV charging post. Faces +Z. */
export function evCharger(k: Kit): void {
  const sh = k.sh;
  k.m('#e8e4da', 'paint');
  sh.box(0, 0.75, 0, 0.36, 1.5, 0.26, 1);
  k.m('#3fae5a', 'paint');
  sh.box(0, 1.25, 0.131, 0.36, 0.2, 0.01, 0);
  k.e('#bcd4e0', '#9fffb0', 0.6);
  sh.box(0, 0.95, 0.131, 0.18, 0.14, 0.01, 0);
  k.m('#1d1f22', 'rubber');
  sh.tube(0.12, 0.8, 0.14, 0.2, 0.3, 0.3, 0.025, 0.025, 4);
}

/** Bottle banks: three domed containers (green / white / brown glass) + a paper bank. */
export function bottleBank(ks: Kit, rng: Rng): void {
  const sh = ks.sh;
  const cols = ['#3f8f5a', '#e8e4da', '#8a5a3a', '#2f5f9e'];
  for (let i = 0; i < 4; i++) {
    const x = -1.65 + i * 1.1;
    ks.m(cols[i], 'plastic');
    sh.box(x, 0.65, 0, 1.0, 1.3, 1.25, 1);
    sh.ellipsoid(x, 1.3, 0, 0.5, 0.22, 0.62, 1);
    ks.m('#1d1f22', 'rubber');
    sh.cyl(x, 1.0, 0.63, 0.13, 0.13, 0.01, 8, 2, true);
  }
  // a paper bank lid open now and then
  if (rng.chance(0.4)) {
    ks.m('#2f5f9e', 'plastic');
    sh.box(1.65, 1.62, -0.2, 0.9, 0.06, 0.5, 0);
  }
}

/** Concrete outdoor ping-pong table with a steel net. */
export function pingpong(k: Kit): void {
  const sh = k.sh;
  k.m('#b9b3a8', 'stone');
  sh.box(0, 0.38, 0, 0.3, 0.76, 1.2, 1);
  k.m('#3f6e8f', 'stone');
  sh.box(0, 0.76, 0, 2.74, 0.06, 1.52, 0);
  k.m('#f2efe6', 'paint');
  sh.box(0, 0.792, 0, 2.74, 0.004, 0.03, 0);
  sh.box(0, 0.792, 0.745, 2.74, 0.004, 0.03, 0);
  sh.box(0, 0.792, -0.745, 2.74, 0.004, 0.03, 0);
  k.m('#5a646b', 'steel');
  sh.box(0, 0.86, 0, 0.03, 0.15, 1.6, 0);
}

/** Courtyard table with two benches. */
export function courtTable(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const wood = rng.pick(['#8a6240', '#a87f58', '#6f5a48']);
  k.m(wood, 'wood');
  sh.box(0, 0.73, 0, 1.5, 0.05, 0.75, 0);
  for (const x of [-0.6, 0.6]) sh.box(x, 0.36, 0, 0.06, 0.72, 0.6, 1);
  for (const z of [-0.68, 0.68]) {
    sh.box(0, 0.44, z, 1.5, 0.04, 0.28, 0);
    for (const x of [-0.6, 0.6]) sh.box(x, 0.21, z, 0.06, 0.42, 0.22, 1);
  }
  k.m(rng.pick(['#e9e4d8', '#7aa0c8', '#c95f4a']), 'ceramic');
  sh.cyl(0.2, 0.755, 0.05, 0.06, 0.05, 0.12, 6, 2);
}

/** Two bikes leaning against a wall (wall behind, at -Z). */
export function leaningBikes(k: Kit, rng: Rng): void {
  const sh = k.sh;
  for (const x of [-0.45, 0.45]) {
    if (x > 0 && rng.chance(0.3)) continue;
    sh.push().local(x, 0, -0.1, 0, rng.range(-0.1, 0.1), 0.12);
    bikeLite(k, rng.pick(BIKE_COLS));
    sh.pop();
  }
}

/** Wheelie bin row (courtyards). */
export function binRow(k: Kit, rng: Rng): void {
  wheelieBins(k, rng, 3);
}

/** 20 ft storage container (corrugated sides suggested by ribs), doors at +X end. */
export function container(ks: Kit, rng: Rng): void {
  const sh = ks.sh;
  const col = rng.pick(['#2f6fb0', '#c9442c', '#3f8f5a', '#e8a33c', '#8a5aa8', '#2a7a8a', '#b8b0a0', '#7a3b2e']);
  const L = 6.06,
    W = 2.44,
    H = 2.59;
  ks.m(col, 'paint');
  sh.box(0, H / 2, 0, L, H, W, 1);
  // ribs on the long sides + top rails (slightly darker)
  ks.m(col, 'paint');
  ks.s.r *= 0.8;
  ks.s.g *= 0.8;
  ks.s.b *= 0.8;
  for (let i = 0; i < 9; i++) {
    const x = -L / 2 + 0.45 + i * ((L - 0.9) / 8);
    sh.box(x, H / 2, W / 2 + 0.015, 0.1, H - 0.2, 0.03, 0);
    sh.box(x, H / 2, -W / 2 - 0.015, 0.1, H - 0.2, 0.03, 0);
  }
  sh.box(0, H - 0.05, 0, L + 0.02, 0.1, W + 0.02, 0);
  sh.box(0, 0.06, 0, L + 0.02, 0.12, W + 0.02, 1);
  // door end: lock bars
  ks.m('#2a2c2e', 'steel');
  for (const z of [-0.8, -0.35, 0.35, 0.8]) sh.box(L / 2 + 0.03, H / 2, z, 0.03, H - 0.3, 0.04, 0);
}

/** Steel pipes stacked on timber bearers. */
export function pipes(k: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m('#8a6a48', 'wood');
  for (const x of [-1.0, 1.0]) sh.box(x, 0.06, 0, 0.12, 0.12, 1.25, 1);
  const col = rng.pick(['#6f7478', '#8a4a2e', '#3a5f7d', '#c9c3b7', '#e8a33c']);
  const r = rng.range(0.13, 0.2);
  let row = 0;
  for (let n = 5; n > 0 && row < 4; n--, row++) {
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * r * 2.05;
      k.m(col, 'steel');
      sh.push().local(0, 0.12 + r + row * r * 1.75, z, 0, 0, Math.PI / 2).cyl(0, -1.45, 0, r, r, 2.9, 7, 0).pop();
      k.m('#1d1f22', 'steel');
      sh.push().local(1.451, 0.12 + r + row * r * 1.75, z, 0, 0, Math.PI / 2).disc(0, 0, 0, r * 0.82, 7, 1).pop();
    }
  }
}

/** Timber / board stack with spacer battens, sometimes wrapped. */
export function timber(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const layers = rng.int(4, 8);
  const wood = rng.pick(['#c9a46a', '#d8b47a', '#b8946a']);
  for (let l = 0; l < layers; l++) {
    k.m('#8a6a48', 'wood');
    for (const x of [-1.0, 0, 1.0]) sh.box(x, 0.04 + l * 0.18, 0, 0.06, 0.06, 1.15, 1);
    k.m(wood, 'wood');
    k.s.r *= 0.9 + 0.2 * rng.next();
    sh.box(0, 0.12 + l * 0.18, 0, 2.7, 0.1, 1.1, 1);
  }
  if (rng.chance(0.35)) {
    k.m('#2f6fb0', 'plastic');
    sh.box(0, 0.08 + layers * 0.09, 0, 2.74, layers * 0.18, 1.14, 1);
  }
}

// ───────────────────────────────────────────────────────── freight yard ──

/** Stack of railway sleepers. */
export function sleepers(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const layers = rng.int(3, 7);
  for (let l = 0; l < layers; l++) {
    const along = l % 2 === 0;
    for (let i = 0; i < 4; i++) {
      k.m(rng.pick(['#4a3a2e', '#3f3228', '#55463a']), 'wood');
      if (along) sh.box(0, 0.08 + l * 0.16, -0.54 + i * 0.36, 2.6, 0.15, 0.25, 1);
      else sh.box(-0.95 + i * 0.63, 0.08 + l * 0.16, 0, 0.25, 0.15, 1.4, 1);
    }
  }
}

/** Ballast / sand heap. */
export function heap(k: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m(rng.pick(['#8a8378', '#b8a27a', '#6f6a62']), 'stone');
  sh.ellipsoid(0, 0.0, 0, 1.55, 0.95, 1.4, 1);
  sh.ellipsoid(0.6, 0.0, 0.3, 0.9, 0.65, 0.8, 1);
}
