// Hardscape scatter models (placed by scatter.ts): café sets + parasols, coffee kiosk, planters with
// flowers, bike racks, info boards, public art, station clock, vending machines, luggage trolleys,
// pallets (bare / loaded / wrapped), oil drums, skips, forklifts, crates, cable reels, gas cages,
// IBC tanks, dumpsters, fish boxes, nets, lobster pots, rope coils, ticket machines, EV chargers,
// bottle banks, a ping-pong table, sleeper stacks, ballast heaps, courtyard table, leaning bikes.
//
// Local frame as in furniture.ts (origin on the ground, +Y up, +Z = the item's front).
// `k` = the kit the small parts go to, `ks` = the shadow-casting kit for the big silhouettes.

import { shapeOn } from '../../core/sweepshape';
import { bugOn } from '../../core/sweepbugs';
import { markProp } from '../lettering/spots';
import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import { Kit, spokedWheel } from './furniture';
import { cbox, lathe, softBlob } from './shapes';
import { parasol, wheelieBins, CANVAS } from './garden';
import type { ChairOut } from './service';
import { GREEN, type GreenKit } from '../buildings/green';
import { sideGeom } from '../buildings/gen';

const _seat = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const TAU = Math.PI * 2;
const FLOWERS = ['#e8649a', '#f2c84b', '#e8574f', '#b46ad6', '#f5f0e6', '#f08a3c', '#8f9ee8'];
const BIKE_COLS = ['#e63946', '#2a9d8f', '#457b9d', '#e9c46a', '#264653', '#f1faee', '#8d6cab', '#f4a261', '#3d5a80', '#1d1f22'];


/** Bistro chair (bent steel tube frame, round slatted seat, hoop back with two rails); seat front +Z. */
function bistroChair(k: Kit, col: string, rng: Rng, woven: boolean): void {
  const sh = k.sh;
  k.m(col, 'iron');
  // front legs splay a little, back legs run up into the hoop
  for (const x of [-0.17, 0.17]) {
    sh.tube(x * 1.08, 0, 0.19, x, 0.44, 0.15, 0.011, 0.011, 6);
    sh.tube(x * 1.08, 0, -0.2, x, 0.44, -0.15, 0.011, 0.011, 6);
    sh.tube(x, 0.44, -0.15, x * 0.95, 0.86, -0.22, 0.011, 0.011, 6);
  }
  // hoop over the top
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI,
      a1 = ((i + 1) / 6) * Math.PI;
    sh.tube(Math.cos(a0) * 0.1615, 0.86 + Math.sin(a0) * 0.05, -0.22, Math.cos(a1) * 0.1615, 0.86 + Math.sin(a1) * 0.05, -0.22, 0.011, 0.011, 5);
  }
  sh.tube(-0.165, 0.7, -0.19, 0.165, 0.7, -0.19, 0.008, 0.008, 5);
  sh.tube(-0.165, 0.58, -0.17, 0.165, 0.58, -0.17, 0.008, 0.008, 5);
  // leg ring
  sh.tube(-0.18, 0.16, 0.17, 0.18, 0.16, 0.17, 0.006, 0.006, 4);
  sh.tube(-0.18, 0.16, -0.18, 0.18, 0.16, -0.18, 0.006, 0.006, 4);
  // seat: rim + rattan weave or slats
  sh.cyl(0, 0.425, 0, 0.215, 0.215, 0.022, 14, 2);
  if (woven) {
    k.m(rng.pick(['#c8a46a', '#b8945a', '#d8c08a']), 'wood');
    sh.cyl(0, 0.447, 0, 0.2, 0.2, 0.006, 14, 2);
    k.m('#8a6a3a', 'wood');
    for (let i = -3; i <= 3; i++) sh.box(i * 0.05, 0.4535, 0, 0.006, 0.002, Math.sqrt(0.04 - (i * 0.05) ** 2) * 2 - 0.02, 0);
  } else {
    for (let i = -3; i <= 3; i++) sh.box(i * 0.055, 0.452, 0, 0.042, 0.008, Math.sqrt(0.0441 - (i * 0.055) ** 2) * 2 - 0.02, 0);
  }
}

/** Pedestal bistro table: cast foot with four splayed feet, column with collar, top with a rim. */
function bistroTable(k: Kit, rng: Rng, R: number, metal: string): void {
  const sh = k.sh;
  k.m(metal, 'iron');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    sh.tube(0, 0.08, 0, Math.cos(a) * 0.26, 0.012, Math.sin(a) * 0.26, 0.022, 0.014, 6);
    sh.cyl(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26, 0.03, 0.025, 0.014, 8, 2);
  }
  lathe(sh, 0, 0, [[0.05, 0.06], [0.035, 0.12], [0.028, 0.2], [0.026, 0.62], [0.04, 0.66], [0.04, 0.68], [0.12, 0.7], [0.12, 0.715]], 10);
  const top = rng.pick(['#e9e4d8', '#c9b48a', '#2c3033', '#9a6a43', '#d8d4cc']);
  k.m(top, top === '#9a6a43' || top === '#c9b48a' ? 'wood' : 'stone');
  lathe(sh, 0, 0, [[0, 0.715], [R - 0.012, 0.715], [R, 0.725], [R, 0.745], [R - 0.008, 0.752], [0, 0.752]], 20);
}

// ──────────────────────────────────────────────────────────── plazas ──

/** ?noboardmap: plain info-board faces (no title, streets or legend) */
const BOARD_MAP = typeof location === 'undefined' || !new URLSearchParams(location.search).has('noboardmap');

/**
 * Bistro table with 2-4 chairs (k); market parasol on most (ks). If `chairs` is given, every chair's
 * seat (world) is appended to it; returns whether a parasol was built.
 */

export function cafe(k: Kit, ks: Kit, rng: Rng, canvas?: [string, string], chairs?: ChairOut[]): boolean {
  const sh = k.sh;
  const metal = rng.pick(['#2c3033', '#3b4a40', '#5a3a2a', '#d8d4ca']);
  bistroTable(k, rng, 0.36, metal);
  const n = rng.int(2, 4);
  const chairCol = rng.pick(['#2c3033', '#c9473f', '#3f7a8f', '#d8d4ca', '#8a5b3a', '#4f7a4a']);
  const woven = rng.chance(0.5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.35, 0.35) + 0.4;
    // chairs left where people got up: pulled out, turned, one swung right round
    const dist = rng.range(0.58, 0.78);
    const turn = rng.chance(0.15) ? rng.range(0.8, 1.4) * (rng.chance(0.5) ? 1 : -1) : rng.range(-0.35, 0.35);
    sh.push().local(Math.sin(a) * dist, 0, Math.cos(a) * dist, 0, a + Math.PI + turn);
    bistroChair(k, chairCol, rng, woven);
    if (chairs) {
      sh.world(0, 0.4575, 0.02, _seat);
      sh.world(0, 0.4575, 1.02, _fwd);
      chairs.push({ sx: _seat.x, sy: _seat.y, sz: _seat.z, fx: _fwd.x, fz: _fwd.z });
    }
    sh.pop();
  }
  // what lives on an empty table: a menu in a stand, sugar pot, salt + pepper, an ashtray on some
  k.m('#2a3a2a', 'plastic');
  sh.push().local(0.04, 0.752, -0.1, 0, rng.range(0, TAU));
  sh.push().local(0, 0, 0.012, 0.25).box(0, 0.06, 0, 0.1, 0.13, 0.004, 0).pop();
  sh.push().local(0, 0, -0.012, -0.25).box(0, 0.06, 0, 0.1, 0.13, 0.004, 0).pop();
  sh.pop();
  k.m('#f2efe6', 'ceramic');
  sh.cyl(-0.09, 0.752, 0.02, 0.03, 0.028, 0.05, 8, 2);
  sh.cyl(0.06, 0.752, 0.06, 0.012, 0.012, 0.06, 6, 2);
  k.m('#3a3430', 'ceramic');
  sh.cyl(0.085, 0.752, 0.06, 0.012, 0.012, 0.06, 6, 2);
  if (rng.chance(0.4)) {
    k.m('#cfd8dc', 'glass');
    sh.cyl(-0.05, 0.752, -0.16, 0.05, 0.045, 0.018, 10, 2);
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
  // the terrace set in miniature: pedestal table + two bent-tube bistro chairs, never quite square to it
  bistroTable(k, rng, 0.29, rng.pick(['#2c3033', '#3b4a40', '#5a3a2a', '#d8d4ca']));
  const chairCol = rng.pick(['#2c3033', '#c9473f', '#3f7a8f', '#d8d4ca', '#8a5b3a', '#4f7a4a', '#d8b24a']);
  const woven = rng.chance(0.5);
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    const dist = rng.range(0.5, 0.64);
    const off = rng.range(-0.08, 0.08);
    sh.push().local(Math.sin(a) * dist, 0, Math.cos(a) * dist + off, 0, a + Math.PI + rng.range(-0.25, 0.25));
    bistroChair(k, chairCol, rng, woven);
    if (chairs) {
      sh.world(0, 0.4575, 0.02, _seat);
      sh.world(0, 0.4575, 1.02, _fwd);
      chairs.push({ sx: _seat.x, sy: _seat.y, sz: _seat.z, fx: _fwd.x, fz: _fwd.z });
    }
    sh.pop();
  }
  // cups on saucers, a sugar pot, a menu card in a stand; a water glass on some
  for (const [x, z] of [[0.11, 0.03], [-0.11, -0.03]] as const) {
    if (x < 0 && rng.chance(0.4)) continue;
    k.m('#f2efe6', 'ceramic');
    sh.cyl(x, 0.752, z, 0.06, 0.055, 0.008, 10, 2);
    sh.cyl(x, 0.76, z, 0.038, 0.03, 0.058, 8, 2);
    k.m('#3a2418', 'ceramic');
    sh.cyl(x, 0.812, z, 0.033, 0.033, 0.004, 8, 2);
  }
  k.m('#f2efe6', 'ceramic');
  sh.cyl(0, 0.752, 0.12, 0.028, 0.026, 0.05, 8, 2);
  k.m(rng.pick(['#2a3a2a', '#6a2a2a', '#1f2a3a']), 'plastic');
  sh.push().local(-0.02, 0.752, -0.13, 0, rng.range(-0.6, 0.6));
  sh.push().local(0, 0, 0.01, 0.22).box(0, 0.055, 0, 0.09, 0.11, 0.004, 0).pop();
  sh.push().local(0, 0, -0.01, -0.22).box(0, 0.055, 0, 0.09, 0.11, 0.004, 0).pop();
  sh.pop();
  if (rng.chance(0.35)) {
    k.m('#cfe3e8', 'glass');
    sh.cyl(0.13, 0.752, -0.12, 0.032, 0.028, 0.11, 8, 2);
  }
}

/** A-frame chalkboard sign (café menu) standing on the pavement, boards facing ±Z. */
export function aFrame(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const wood = rng.pick(['#7a5236', '#3b2a20', '#2c3033']);
  // (?noaframelean) the leaves used to lean out from their feet: a V with the gap at the top, two black slabs falling apart on the pavement
  const lean = bugOn('aframelean') ? -0.178 : 0.19;
  for (const sgn of [1, -1]) {
    sh.push().local(0, 0, sgn * 0.17, sgn * lean);
    k.m(wood, 'wood');
    sh.box(0, 0.47, 0, 0.58, 0.94, 0.03, 0);
    k.m('#1f2421', 'stone');
    sh.box(0, 0.52, sgn * 0.017, 0.48, 0.72, 0.006, 0);
    // (the readable words: world/lettering. A side facing -Z is written in a frame turned round)
    sh.push().local(0, 0, 0, 0, sgn > 0 ? 0 : Math.PI);
    markProp(sh, 'aboard', 0, 0.52, 0.0245, 0.48, 0.72, rng.int(0, 1e6));
    sh.pop();
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
  k.m('#4a3233', 'stone');
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

/** box hunt (?noyardkit): EUR pallets (deck boards, stringers, blocks, bottom boards), drums with rolled chimes,
 *  hoops and bungs, a forklift with round tyres, mast channels, tilt rams, an LPG bottle, a steering wheel and
 *  lamps, and rack bicycles on rounder tyres; off = the earlier slabs, 8-sided wheels and 12-sided tyres */
let YARD = true;
export function setYardDetail(on: boolean): void {
  YARD = on;
}

/** Low-poly bicycle along local x (front wheel at +x), for dense racks (~110 tris). */
export function bikeLite(k: Kit, color: string): void {
  const sh = k.sh;
  const r = 0.33;
  // tyres: a ring of tube segments with a hub and spokes (F4 bug 4: the open-cylinder band was seen edge-on from
  // the side; judge 3 #8: thick polygon tyres, no spokes)
  for (const x of [-0.52, 0.52]) spokedWheel(k, x, r, YARD ? 16 : 12, 10, YARD ? 4 : 5);
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
  // map faces (?noboardmap: the old plain faces): a header band with the title, a street map (river, park,
  // building blocks between paler streets, a red "you are here"), and a legend column with printed lines
  const detail = BOARD_MAP;
  for (const sz of [1, -1]) {
    const z = sz * 0.04,
      d = (n: number) => z + sz * 0.004 * n;
    k.e('#ece6d6', '#fff4dc', 0.35);
    sh.box(0, 1.35, z, 1.2, 0.86, 0.01, 0);
    k.e('#7fa8c8', '#fff4dc', 0.3);
    sh.box(detail ? -0.17 : 0, 1.08, d(1), detail ? 0.86 : 1.2, 0.08, 0.01, 0);
    k.e('#9cc48a', '#fff4dc', 0.3);
    sh.box(-0.25, 1.45, d(1), 0.3, 0.22, 0.01, 0);
    sh.box(0.33, 1.6, d(1), 0.2, 0.14, 0.01, 0);
    if (detail) {
      // header band in the frame colour with the title and a subtitle line
      k.m(frame, 'paint');
      sh.box(0, 1.72, d(1), 1.2, 0.12, 0.01, 0);
      k.e('#f4efe4', '#fff4dc', 0.25);
      sh.box(-0.36, 1.735, d(2), 0.4, 0.045, 0.01, 0);
      sh.box(-0.42, 1.69, d(2), 0.28, 0.018, 0.01, 0);
      // building blocks (warm grey) in a street grid, avoiding river and park
      k.e('#d2c6ae', '#fff4dc', 0.3);
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 4; j++) {
          const bx = -0.52 + i * 0.17,
            by = 1.2 + j * 0.115;
          if (by < 1.14 || (bx > -0.42 && bx < -0.08 && by > 1.32 && by < 1.58)) continue;
          if (rng.chance(0.15)) continue;
          sh.box(bx, by, d(1), 0.13, 0.085, 0.01, 0);
        }
      // a main road (amber) and the rail line (dark dashes)
      k.e('#e8b04a', '#fff4dc', 0.25);
      sh.box(-0.17, 1.37, d(2), 0.86, 0.016, 0.01, 0);
      k.m('#3a3f45', 'paint');
      for (let i = 0; i < 9; i++) sh.box(-0.57 + i * 0.1, 1.15, d(2), 0.06, 0.008, 0.01, 0);
      // legend column: white panel, coloured keys with printed lines
      k.e('#f7f3ea', '#fff4dc', 0.3);
      sh.box(0.44, 1.31, d(1), 0.28, 0.66, 0.01, 0);
      const keys = ['#d9473f', '#2f7fb8', '#3f8f5a', '#e8b04a', '#7a5a9a', '#3a3f45'];
      for (let i = 0; i < 6; i++) {
        const y = 1.56 - i * 0.075;
        k.m(keys[i], 'plastic');
        sh.box(0.34, y, d(2), 0.03, 0.03, 0.01, 0);
        k.m('#5a5f66', 'paint');
        sh.box(0.46, y + 0.008, d(2), 0.16 - rng.range(0, 0.05), 0.01, 0.01, 0);
        sh.box(0.44, y - 0.012, d(2), 0.12 - rng.range(0, 0.04), 0.008, 0.01, 0);
      }
    }
    k.m('#d9473f', 'plastic');
    sh.box(0.1, 1.32, d(2), 0.05, 0.05, 0.01, 0);
    if (detail) sh.box(0.1, 1.3, d(3), 0.012, 0.09, 0.01, 0);
  }
}

/**
 * Public art: a big ring, stacked cubes or a stylised figure on a plinth (colourful accent).
 * Box hunt (`detail`, ?nosculpt): a moulded plinth (base step, chamfered die, capping, bronze plaque); the ring
 * stands in a cast shoe; the cubes become three balanced polished stones; the box stack a double-helix spiral.
 */
export function sculpture(ks: Kit, rng: Rng, detail = false): void {
  const sh = ks.sh;
  ks.m('#cfc8ba', 'stone');
  if (detail) {
    cbox(sh, 0, 0.04, 0, 1.72, 0.08, 1.72, 0.015);
    cbox(sh, 0, 0.26, 0, 1.5, 0.38, 1.5, 0.03);
    cbox(sh, 0, 0.475, 0, 1.64, 0.06, 1.64, 0.02);
    ks.m('#5a4a2e', 'steel');
    sh.box(0, 0.27, 0.752, 0.42, 0.13, 0.008, 0);
  } else sh.box(0, 0.25, 0, 1.6, 0.5, 1.6, 1);
  const kind = rng.int(0, 2);
  const col = rng.pick(['#d9473f', '#e8a33c', '#2f7fb8', '#e86a8a', '#3f8f5a']);
  if (detail && kind === 1) {
    // balanced stones: polished granite / marble boulders stacked off-centre, a slim steel pin between them
    const stones: [string, number][] = [['#3c3d40', 0.62], ['#d9d4ca', 0.46], ['#9a4a3a', 0.33]];
    let y = 0.505,
      x = 0;
    for (const [c, r] of stones) {
      const ry = r * 0.72;
      ks.m(c, 'stone');
      sh.ellipsoid(x, y + ry, 0, r, ry, r * 0.86, 2);
      y += ry * 1.86;
      x = rng.range(-0.1, 0.1);
    }
    return;
  }
  if (detail && kind === 2) {
    // double helix of painted steel tube rising from a turned foot, capped with a polished ball
    ks.m('#3a3d40', 'steel');
    sh.cyl(0, 0.5, 0, 0.2, 0.26, 0.12, 12, 0);
    ks.m(col, 'paint');
    const n = 26,
      H = 2.6;
    for (const ph of [0, Math.PI]) {
      for (let i = 0; i < n; i++) {
        const t0 = i / n,
          t1 = (i + 1) / n;
        const r0 = 0.42 - 0.18 * t0,
          r1 = 0.42 - 0.18 * t1;
        const a0 = ph + t0 * TAU * 1.25,
          a1 = ph + t1 * TAU * 1.25;
        sh.tube(Math.cos(a0) * r0, 0.62 + t0 * H, Math.sin(a0) * r0, Math.cos(a1) * r1, 0.62 + t1 * H, Math.sin(a1) * r1, 0.055, 0.055, 6);
      }
    }
    ks.m('#c9ccd0', 'steel');
    sh.ellipsoid(0, 0.62 + H + 0.12, 0, 0.13, 0.13, 0.13, 1);
    return;
  }
  if (kind === 0) {
    if (detail) {
      // the ring stands in a cast shoe bolted to the capping
      ks.m('#3a3d40', 'steel');
      cbox(sh, 0, 0.56, 0, 0.5, 0.12, 0.34, 0.03);
    }
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
  if (YARD) {
    // EUR pallet: bottom boards, nine blocks, three stringer boards, five deck boards with gaps between them
    for (const z of [-0.43, 0, 0.43]) sh.box(0, y + 0.011, z, 1.2, 0.022, 0.1, 1);
    for (const x of [-0.53, 0, 0.53]) for (const z of [-0.43, 0, 0.43]) if (x !== 0 || z !== 0) sh.box(x, y + 0.061, z, 0.14, 0.078, 0.14, 1 | 2);
    for (const x of [-0.53, 0, 0.53]) sh.box(x, y + 0.111, 0, 0.14, 0.022, 1.0, 1);
    for (const z of [-0.43, -0.215, 0, 0.215, 0.43]) sh.box(0, y + 0.133, z, 1.2, 0.022, 0.13, 1);
    return;
  }
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

/** the four faces of a block w × h × d standing at y: `face` draws one, given its width; origin at the middle of the face's foot, facing +Z */
function round4(kd: Kit, y: number, w: number, d: number, face: (W: number, side: number) => void): void {
  for (let i = 0; i < 4; i++) {
    const W = i & 1 ? d : w,
      out = i & 1 ? w / 2 : d / 2;
    kd.sh.push().local(0, y, 0, 0, (i * Math.PI) / 2);
    kd.sh.push().local(0, 0, out);
    face(W, i);
    kd.sh.pop();
    kd.sh.pop();
  }
}

/** one plate on a face: only its front is drawn */
const FRONT = 1 | 2 | 4 | 16 | 32;

/** a plate on a top: only its upper side is drawn */
const UP = 1 | 4 | 8 | 16 | 32;

/** cartons under stretch film: their joints show through, the film lies in paler overlapping bands, tight over the corners */
function wrapNear(kd: Kit, y: number, w: number, d: number, h: number, col: string, seed: number): void {
  const c = new THREE.Color(col);
  const joint = '#' + c.clone().multiplyScalar(0.58).getHexString(),
    film = '#' + c.clone().lerp(new THREE.Color('#f4f7f8'), 0.45).getHexString(),
    film2 = '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.7).getHexString();
  const rows = Math.max(2, Math.round(h / 0.27));
  round4(kd, y, w, d, (W, side) => {
    const sh = kd.sh;
    kd.m(joint, 'plastic');
    for (let r = 1; r < rows; r++) sh.box(0, (h * r) / rows, 0.0012, W - 0.01, 0.005, 0.0024, FRONT);
    const cols = Math.max(2, Math.round(W / 0.38));
    for (let r = 0; r < rows; r++)
      for (let i = 1; i < cols; i++) sh.box(-W / 2 + (W * (i + (r & 1 ? 0.5 : 0))) / cols, (h * (r + 0.5)) / rows, 0.0012, 0.005, h / rows - 0.004, 0.0024, FRONT);
    // the film: bands from the machine's turns
    let fy = 0.02 + ((seed + side) % 5) * 0.012;
    let n = 0;
    while (fy < h - 0.04) {
      const bh = Math.min(0.05 + ((seed * 3 + n * 7 + side) % 5) * 0.012, h - fy);
      kd.m(n % 2 ? film : film2, 'plastic');
      sh.box(0, fy + bh / 2, 0.003, W + 0.004, bh, 0.002, FRONT);
      fy += bh + 0.05 + ((seed + n * 5) % 7) * 0.016;
      n++;
    }
    // where the film goes tight round the corner
    kd.m(film2, 'plastic');
    for (const u of [-W / 2 + 0.008, W / 2 - 0.008]) sh.box(u, h / 2, 0.0044, 0.016, h - 0.01, 0.002, FRONT);
    // the delivery note, under the film on one side
    if (side === seed % 4) {
      kd.m('#f1efe6', 'plastic');
      sh.box(-W * 0.18, h * 0.62, 0.0052, 0.21, 0.15, 0.0012, FRONT);
      kd.m('#26282a', 'plastic');
      for (let i = 0; i < 4; i++) sh.box(-W * 0.18 - 0.02, h * 0.62 + 0.05 - i * 0.03, 0.0062, 0.14, 0.008, 0.0006, FRONT);
    }
  });
  // on top: the cartons' joints and tape under the last turns of film
  const sh = kd.sh;
  kd.m(joint, 'plastic');
  for (const x of [-w / 6, w / 6]) sh.box(x, y + h + 0.001, 0, 0.006, 0.002, d - 0.02, UP);
  sh.box(0, y + h + 0.001, 0, w - 0.02, 0.002, 0.006, UP);
  kd.m(film, 'plastic');
  for (const x of [-w / 3, 0, w / 3]) sh.box(x, y + h + 0.0024, 0, 0.05, 0.0012, d - 0.03, UP);
  kd.m(film2, 'plastic');
  sh.box(0, y + h + 0.0036, -d * 0.36, w - 0.01, 0.0012, 0.14, UP);
  sh.box(0, y + h + 0.0036, d * 0.36, w - 0.01, 0.0012, 0.14, UP);
}

/** a strapped pack of bricks or blocks: every one a little different, dark between them, two steel straps round it */
function packNear(kd: Kit, y: number, w: number, d: number, h: number, col: string, seed: number): void {
  const c = new THREE.Color(col);
  const block = col === '#c9c3b7';
  const bh = block ? 0.19 : 0.078,
    bl = block ? 0.39 : 0.232;
  round4(kd, y, w, d, (W, side) => {
    const sh = kd.sh;
    kd.m('#' + c.clone().multiplyScalar(0.34).getHexString(), 'stone');
    sh.box(0, h / 2, 0.0012, W, h, 0.0024, FRONT);
    const rows = Math.floor(h / bh);
    const cols = Math.floor(W / bl);
    const left = (-cols * bl) / 2;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const h0 = (seed * 31 + r * 17 + i * 13 + side * 5) >>> 0;
        const t = 0.82 + (h0 % 11) * 0.036;
        kd.m('#' + c.clone().multiplyScalar(t).getHexString(), 'stone');
        sh.box(left + (i + 0.5) * bl, (r + 0.5) * bh, 0.0036 + (h0 % 3) * 0.001, bl - 0.006, bh - 0.006, 0.002, FRONT);
      }
    }
    if (side & 1) return;
    kd.m('#31363a', 'steel');
    for (const u of [-W * 0.28, W * 0.28]) sh.box(u, h / 2, 0.0078, 0.016, h + 0.004, 0.0012, FRONT);
    kd.m('#8a8f92', 'steel');
    sh.box(-W * 0.28, h * 0.62, 0.0092, 0.024, 0.05, 0.0014, FRONT);
  });
  kd.m('#31363a', 'steel');
  for (const u of [-w * 0.28, w * 0.28]) kd.sh.box(u, y + h + 0.0014, 0, 0.016, 0.0014, d, 1);
}

/** a full sack: a pillow, its corners pulled out, sewn across each end */
function sackNear(kd: Kit, x: number, y: number, z: number, col: string, seed: number): void {
  const sh = kd.sh;
  kd.m(col, 'rubber');
  // what fills it presses out against the cloth and sags between the corners; it lies where the sack below let it
  softBlob(sh, x, y, z, 0.31, 0.108, 0.47, 0.42, 0.62, 0.045, seed, 9, 18);
  // the sewn ends, folded over
  kd.m('#8c8473', 'rubber');
  for (const e of [-1, 1]) sh.box(x, y + 0.06, z + e * 0.4, 0.38, 0.004, 0.007, 1);
}

/** a carton at (x, y, z), its foot at y: tape down its middle, the flap's edge, a printed square and a label */
function cartonNear(kd: Kit, x: number, y: number, z: number, w: number, h: number, d: number, seed: number): void {
  const sh = kd.sh;
  sh.push().local(x, y, z);
  round4(kd, 0, w, d, (W, side) => {
    kd.m('#8a6b45', 'wood');
    sh.box(0, h - 0.002, 0.001, W, 0.004, 0.002, FRONT);
    if (side === 0) {
      kd.m('#c2a578', 'plastic');
      sh.box(0, h - 0.035, 0.0022, 0.05, 0.07, 0.0012, FRONT);
    }
    if (side === seed % 4) {
      kd.m('#55412b', 'wood');
      sh.box(-W * 0.2, h * 0.5, 0.0016, 0.12, 0.12, 0.0008, FRONT);
      kd.m('#ecebe4', 'plastic');
      sh.box(W * 0.2, h * 0.5, 0.0016, 0.1, 0.07, 0.0008, FRONT);
    }
  });
  kd.m('#c2a578', 'plastic');
  sh.box(0, h + 0.0008, 0, 0.05, 0.0014, d, 1);
  kd.m('#8a6b45', 'wood');
  sh.box(0, h + 0.0005, 0, w, 0.001, 0.004, 1);
  sh.pop();
}

/** Pallet with goods: shrink-wrapped load, sacks or brick packs (sometimes double stacked). `kd` (same frame) = near-only cells for what they are made of. */
export function palletGoods(k: Kit, rng: Rng, kd?: Kit): void {
  const sh = k.sh;
  const levels = rng.chance(0.35) ? 2 : 1;
  let y = 0;
  for (let l = 0; l < levels; l++) {
    pallet(k, y, 1);
    const kind = rng.int(0, 3);
    const h = rng.range(0.6, 1.0);
    if (kind === 0) {
      const col = rng.pick(['#e6eef0', '#d7e3ea', '#2f5f9e', '#e8d9b8']);
      k.m(col, 'plastic');
      sh.box(0, y + 0.15 + h / 2, 0, 1.15, h, 0.95, 1);
      if (kd) wrapNear(kd, y + 0.15, 1.15, 0.95, h, col, Math.floor(h * 977));
    } else if (kind === 1) {
      const col = rng.pick(['#e8dcc0', '#cfc3a8', '#b8b0a0']);
      k.m(col, 'rubber');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
        const z = rng.range(-0.05, 0.05);
        sh.ellipsoid(-0.28 + c * 0.56, y + 0.24 + r * 0.17, z, 0.3, 0.1, 0.45, 0);
        if (kd) sackNear(kd, -0.28 + c * 0.56, y + 0.24 + r * 0.17, z, col, l * 7 + r * 3 + c + 1 + z * 40);
      }
    } else if (kind === 2) {
      const col = rng.pick(['#a65d43', '#b8643f', '#c9c3b7']);
      k.m(col, 'stone');
      sh.box(0, y + 0.15 + h / 2, 0, 1.1, h, 0.9, 1);
      if (kd) packNear(kd, y + 0.15, 1.1, 0.9, h, col, Math.floor(h * 977));
      k.m('#3a3f44', 'steel');
      sh.box(0, y + 0.15 + h / 2, 0, 1.12, h * 0.9, 0.04, 0);
    } else {
      k.m(rng.pick(['#c9a46a', '#b8946a']), 'wood');
      sh.box(-0.29, y + 0.15 + 0.22, -0.24, 0.55, 0.44, 0.46, 1);
      sh.box(0.29, y + 0.15 + 0.22, -0.24, 0.55, 0.44, 0.46, 1);
      sh.box(-0.29, y + 0.15 + 0.22, 0.24, 0.55, 0.44, 0.46, 1);
      sh.box(0.2, y + 0.15 + 0.66, 0.0, 0.55, 0.44, 0.46, 1);
      if (kd) {
        const sd = Math.floor(h * 977);
        cartonNear(kd, -0.29, y + 0.15, -0.24, 0.55, 0.44, 0.46, sd);
        cartonNear(kd, 0.29, y + 0.15, -0.24, 0.55, 0.44, 0.46, sd + 1);
        cartonNear(kd, -0.29, y + 0.15, 0.24, 0.55, 0.44, 0.46, sd + 2);
        cartonNear(kd, 0.2, y + 0.59, 0, 0.55, 0.44, 0.46, sd + 3);
      }
    }
    y += 0.15 + h;
  }
}

/** Cluster of oil drums (some on a pallet); `kd` (same frame) = near-only cells for the chimes, hoops and caps. */
export function drums(k: Kit, rng: Rng, kd?: Kit): void {
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
    const dc = rng.chance(0.8) ? col : rng.pick(['#2f5f9e', '#c9302c', '#e8b23c']);
    k.m(dc, 'paint');
    if (YARD) {
      // lid recessed inside a rolled chime, two rolling hoops, the bung and vent caps (the small parts near only)
      sh.cyl(x, y0, z, 0.29, 0.29, 0.865, 14, 2);
      const kk = kd ?? k,
        ds = kk.sh;
      kk.m(dc, 'paint');
      // up close a round skin over the 14 sides
      const seg = kd ? 36 : 14;
      if (kd) ds.cyl(x, y0, z, 0.2915, 0.2915, 0.8665, seg, 2);
      ds.cyl(x, y0 + 0.85, z, 0.297, 0.297, 0.04, seg, 0);
      ds.cyl(x, y0, z, 0.297, 0.297, 0.03, seg, 0);
      for (const hy of [0.29, 0.58]) ds.cyl(x, y0 + hy, z, 0.302, 0.302, 0.035, seg, 0);
      kk.m('#3a3d40', 'steel');
      ds.cyl(x + 0.17, y0 + 0.865, z + 0.05, 0.038, 0.038, 0.018, 8, 2);
      ds.cyl(x - 0.18, y0 + 0.865, z - 0.06, 0.026, 0.026, 0.018, 8, 2);
      continue;
    }
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

/** The forklift's bodywork for up close (?noshapeforklift): a pressed shell with soft edges over the far box, a bonnet with its seam and catch, vents, a step, wheel arches, a rounded cast counterweight, hazard stripes. */
function forkliftBody(kd: Kit, body: string): void {
  const sh = kd.sh;
  kd.m(body, 'paint');
  // shell over the far chassis, and a low bonnet the seat stands on
  cbox(sh, 0, 0.55, -0.15, 1.07, 0.72, 1.72, 0.045, 1);
  kd.s.r *= 0.92;
  kd.s.g *= 0.92;
  kd.s.b *= 0.92;
  cbox(sh, 0, 0.92, -0.34, 0.86, 0.05, 0.86, 0.018, 1);
  // seams, vents, catch, on both flanks
  kd.m('#141516', 'steel');
  for (const s of [-1, 1]) {
    const x = s * 0.5365;
    sh.box(x, 0.56, -0.15, 0.002, 0.008, 1.5, 0);
    for (const z of [-0.62, 0.34]) sh.box(x, 0.72, z, 0.002, 0.34, 0.008, 0);
    for (let i = 0; i < 5; i++) sh.box(x, 0.66 + i * 0.03, -0.32, 0.002, 0.012, 0.42, 0);
    // arches over the wheels
    for (const [z, r] of [[0.45, 0.33], [-0.75, 0.28]] as [number, number][]) {
      kd.m('#141516', 'steel');
      sh.box(x, r + 0.02, z, 0.003, 0.02, r * 1.9, 0);
    }
    // a step with its tread, a grab handle up to the guard
    kd.m('#34373a', 'steel');
    sh.box(s * 0.58, 0.3, -0.05, 0.1, 0.022, 0.32, 0);
    kd.m('#1d1f22', 'rubber');
    sh.tube(s * 0.46, 1.0, 0.36, s * 0.47, 1.5, 0.36, 0.014, 0.014, 6);
    // hazard stripes at the back corner
    for (let i = 0; i < 4; i++) {
      kd.m(i % 2 ? '#1a1a1a' : '#e8c21f', 'paint');
      sh.box(x * 1.0005, 0.4, -0.82 + i * 0.05, 0.002, 0.14, 0.05, 0);
    }
  }
  // the cast counterweight: a rounded tail with its lifting eyes, a towing pin
  kd.m('#3a3d40', 'iron');
  cbox(sh, 0, 0.62, -1.0, 1.08, 0.84, 0.42, 0.085, 1);
  cbox(sh, 0, 0.78, -1.2, 0.8, 0.36, 0.1, 0.04, 1);
  kd.m('#6a6d70', 'steel');
  for (const s of [-0.28, 0.28]) sh.box(s, 1.045, -1.0, 0.09, 0.02, 0.05, 0);
  sh.push().local(0, 0.42, -1.225, Math.PI / 2, 0, 0).cyl(0, -0.03, 0, 0.03, 0.03, 0.06, 8, 3).pop();
  // lamps either side, a number plate between
  kd.m('#b23a2e', 'plastic');
  for (const s of [-1, 1]) sh.box(s * 0.33, 0.8, -1.254, 0.12, 0.06, 0.012, 0);
  kd.m('#e9e6d8', 'plastic');
  sh.box(0, 0.8, -1.252, 0.22, 0.06, 0.008, 0);
}

/** Counterbalance forklift (forks towards +Z); `kd` (same frame) = near-only cells for the small box-hunt parts. */
export function forklift(ks: Kit, rng: Rng, kd?: Kit): void {
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
    for (const x of [-0.5, 0.5]) {
      if (!YARD) {
        sh.push().local(x, r, z, 0, 0, Math.PI / 2).cyl(0, -0.11, 0, r, r, 0.22, 8, 3, false).pop();
        continue;
      }
      // round tyre with a rounded shoulder and a painted rim + hub (rim and hub near only)
      ks.m('#1d1f22', 'rubber');
      sh.push().local(x, r, z, 0, 0, Math.PI / 2);
      sh.cyl(0, -0.1, 0, r, r, 0.2, 14, 0);
      sh.cyl(0, -0.11, 0, r * 0.9, r, 0.01, 14, 0);
      sh.cyl(0, 0.1, 0, r, r * 0.9, 0.01, 14, 0);
      sh.pop();
      const kk = kd ?? ks,
        ds = kk.sh;
      ds.push().local(x, r, z, 0, 0, Math.PI / 2);
      kk.m('#c8ccd0', 'steel');
      ds.cyl(0, x > 0 ? -0.112 : 0.11, 0, r * 0.6, r * 0.6, 0.002, 12, x > 0 ? 1 : 2);
      kk.m('#2a2c2e', 'steel');
      ds.cyl(0, x > 0 ? -0.13 : 0.112, 0, 0.06, 0.06, 0.018, 8, x > 0 ? 1 : 2);
      ds.pop();
    }
  if (kd && shapeOn('shapeforklift')) forkliftBody(kd, body);
  if (YARD) {
    // mast inner channels, carriage bars, LPG bottle on the counterweight, seat back (shadow casters); lift chain,
    // tilt rams, bottle valve, steering column + wheel, lamps on the guard posts (near only)
    ks.m('#4a4d50', 'steel');
    for (const x of [-0.22, 0.22]) sh.box(x, 1.3, 0.7, 0.08, 2.35, 0.08, 1);
    ks.m('#6a6d70', 'steel');
    for (const yy of [0.3, 0.62]) sh.box(0, yy, 0.86, 0.82, 0.05, 0.04, 0);
    ks.m('#d8d4cc', 'paint');
    sh.push().local(0, 1.2, -1.02, 0, 0, Math.PI / 2).cyl(0, -0.38, 0, 0.15, 0.15, 0.76, 12, 3).pop();
    ks.m('#1d1f22', 'rubber');
    sh.box(0, 1.25, -0.62, 0.48, 0.42, 0.06, 0);
    const kk = kd ?? ks,
      ds = kk.sh;
    kk.m('#1d1f22', 'steel');
    for (const x of [-0.08, 0.08]) ds.box(x, 1.4, 0.66, 0.025, 2.2, 0.02, 0);
    kk.m('#6a6d70', 'steel');
    for (const x of [-0.38, 0.38]) ds.tube(x, 0.75, 0.25, x, 1.15, 0.66, 0.035, 0.035, 6);
    kk.m('#c49a45', 'steel');
    ds.cyl(0.4, 1.32, -1.02, 0.03, 0.03, 0.06, 6, 2);
    kk.m('#1d1f22', 'rubber');
    ds.tube(0, 1.0, 0.2, 0, 1.38, 0.05, 0.022, 0.022, 6);
    ds.push().local(0, 1.4, 0.04, -0.75, 0, 0).cyl(0, -0.015, 0, 0.16, 0.16, 0.03, 12, 3).pop();
    kk.e('#ffe9b0', '#ffd27a', 1.6);
    for (const x of [-0.45, 0.45]) ds.box(x, 2.1, 0.4, 0.09, 0.09, 0.06, 0);
  }
  ks.e('#ffe9b0', '#ffb84a', 1.4);
  sh.box(0, 2.32, -0.6, 0.1, 0.08, 0.1, 0);
}

/** a crate up close: boards with dark between them, corner posts, a lid of boards, nails and sometimes a label */
function crateNear(kd: Kit, s: number, seed: number): void {
  const sh = kd.sh;
  const tones = ['#b08a5a', '#a07a4a', '#c09a68', '#9a7548', '#b89060', '#a5824f'];
  kd.m('#1d150e', 'wood');
  sh.box(0, s / 2, 0, s + 0.002, s - 0.004, s + 0.002, 1);
  const n = 4,
    gap = 0.012,
    bh = (s - 0.02 - gap * (n - 1)) / n;
  round4(kd, 0, s, s, (W, side) => {
    for (let r = 0; r < n; r++) {
      kd.m(tones[(seed + r * 5 + side * 3) % tones.length], 'wood');
      sh.box(0, 0.01 + bh / 2 + r * (bh + gap), 0.006, W - 0.004, bh, 0.012, 1 | 4);
      kd.m('#2a2622', 'iron');
      for (const u of [-W / 2 + 0.03, W / 2 - 0.03]) for (const dy of [-bh * 0.25, bh * 0.25]) sh.box(u, 0.01 + bh / 2 + r * (bh + gap) + dy, 0.0125, 0.006, 0.006, 0.001, FRONT);
    }
    if (side === seed % 4) {
      kd.m('#e9e6d8', 'plastic');
      sh.box(W * 0.12, s * 0.56, 0.0128, 0.15, 0.1, 0.0012, FRONT);
      kd.m('#222222', 'plastic');
      for (let i = 0; i < 3; i++) sh.box(W * 0.12 - 0.015, s * 0.56 + 0.028 - i * 0.026, 0.0136, 0.1, 0.007, 0.0006, FRONT);
    }
  });
  kd.m('#8d6d44', 'wood');
  for (const x of [-1, 1]) for (const z of [-1, 1]) sh.box((x * s) / 2 + x * 0.002, s / 2, (z * s) / 2 + z * 0.002, 0.042, s, 0.042, 1);
  const lid = 5;
  for (let i = 0; i < lid; i++) {
    kd.m(tones[(seed + i * 2) % tones.length], 'wood');
    sh.box(((i + 0.5) / lid - 0.5) * s, s + 0.006, 0, s / lid - 0.01, 0.012, s + 0.01, 1);
  }
}

/** Stack of wooden crates. `kd` (same frame) = near-only cells for their boards. */
export function crates(k: Kit, rng: Rng, kd?: Kit): void {
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
    const turn = rng.range(-0.2, 0.2);
    sh.push().local(x, y, z, 0, turn);
    k.m(rng.pick(['#b08a5a', '#a07a4a', '#c09a68']), 'wood');
    sh.box(0, s / 2, 0, s, s, s, 1);
    if (kd) {
      kd.sh.push().local(x, y, z, 0, turn);
      crateNear(kd, s, Math.floor(s * 977) + i);
      kd.sh.pop();
    }
    k.m('#7a5a38', 'wood');
    sh.box(0, s / 2, s / 2 + 0.005, s * 1.01, 0.06, 0.012, 0);
    sh.box(0, s / 2, -s / 2 - 0.005, s * 1.01, 0.06, 0.012, 0);
    sh.pop();
  }
}

/** Wooden cable reels (one standing, one on its side). */
export function cableReel(k: Kit, rng: Rng, kd?: Kit): void {
  const sh = k.sh;
  const R = rng.range(0.45, 0.6);
  k.m('#a8885a', 'wood');
  sh.push().local(-0.25, R, 0, Math.PI / 2, 0, 0);
  sh.cyl(0, -0.4, 0, R, R, 0.06, 12, 3);
  sh.cyl(0, 0.34, 0, R, R, 0.06, 12, 3);
  const cable = rng.pick(['#1d1f22', '#c9302c', '#2f5f9e', '#3a3a3a']);
  k.m(cable, 'rubber');
  sh.cyl(0, -0.34, 0, R * 0.8, R * 0.8, 0.68, 12, 0);
  sh.pop();
  // up close: round flanges with their bolts and the turns of the cable
  const reelNear = (x: number, y: number, z: number, r: number, wr: number, w: number, axis: boolean, col: string): void => {
    if (!kd) return;
    const ds = kd.sh;
    ds.push().local(x, y, z, axis ? Math.PI / 2 : 0, 0, 0);
    kd.m(axis ? '#ab8b5d' : '#9d7d4d', 'wood');
    ds.cyl(0, -w / 2 - 0.0605, 0, r + 0.0025, r + 0.0025, 0.061, 40, 3);
    ds.cyl(0, w / 2 - 0.0005, 0, r + 0.0025, r + 0.0025, 0.061, 40, 3);
    kd.m(col, 'rubber');
    const turns = Math.round(w / 0.028);
    for (let i = 0; i < turns; i++) ds.cyl(0, -w / 2 + (i * w) / turns, 0, wr + (i & 1 ? 0.0065 : 0.0015), wr + (i & 1 ? 0.0015 : 0.0065), w / turns, 28, 0);
    kd.m('#3f4245', 'steel');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ds.cyl(Math.cos(a) * r * 0.6, w / 2 + 0.0605, Math.sin(a) * r * 0.6, 0.012, 0.012, 0.006, 6, 2);
    }
    ds.pop();
  };
  reelNear(-0.25, R, 0, R, R * 0.8, 0.68, true, cable);
  if (rng.chance(0.6)) {
    k.m('#9a7a4a', 'wood');
    sh.cyl(0.5, 0, 0.1, 0.4, 0.4, 0.06, 10, 2);
    sh.cyl(0.5, 0.5, 0.1, 0.4, 0.4, 0.06, 10, 2);
    k.m('#1d1f22', 'rubber');
    sh.cyl(0.5, 0.06, 0.1, 0.28, 0.28, 0.44, 10, 0);
    reelNear(0.5, 0.28, 0.1, 0.4, 0.28, 0.44, false, '#1d1f22');
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

/** A parking meter up close (?noshapemachines): soft corners, a door with its gap and lock, a hood over the screen, keys, a card slot, a coin slot, the receipt tray, printed instructions, a P on a stalk with a solar panel. */
function ticketNear(kd: Kit): void {
  const sh = kd.sh;
  kd.m('#2f5f9e', 'paint');
  for (const x of [-1, 1]) for (const z of [-1, 1]) sh.cyl((x * 0.5) / 2, 0.1, (z * 0.36) / 2, 0.022, 0.022, 1.5, 8, 0);
  kd.m('#22477a', 'paint');
  // the door's gap, on the front face
  sh.box(0, 0.1 + 0.42, 0.1815, 0.44, 0.008, 0.002, 0);
  sh.box(0, 1.47, 0.1815, 0.44, 0.008, 0.002, 0);
  for (const x of [-0.22, 0.22]) sh.box(x, 0.995, 0.1815, 0.008, 0.95, 0.002, 0);
  // screen surround and a hood against the sun
  kd.m('#14161a', 'plastic');
  sh.box(0, 1.25, 0.1805, 0.36, 0.24, 0.003, 0);
  kd.m('#22477a', 'paint');
  sh.push().local(0, 1.385, 0.215, 0.5, 0, 0).box(0, 0, 0, 0.38, 0.012, 0.11, 0).pop();
  for (const x of [-0.185, 0.185]) sh.box(x, 1.335, 0.222, 0.008, 0.1, 0.075, 0);
  // the keys, and a big green and red one
  kd.m('#b9bec2', 'steel');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) sh.box(-0.13 + c * 0.04, 1.085 - r * 0.036, 0.1845, 0.03, 0.026, 0.006, 0);
  kd.m('#39a84e', 'plastic');
  sh.box(0.1, 1.07, 0.1845, 0.05, 0.03, 0.007, 0);
  kd.m('#c2362e', 'plastic');
  sh.box(0.1, 1.03, 0.1845, 0.05, 0.03, 0.007, 0);
  // card slot and coin slot on steel plates
  kd.m('#8f949a', 'steel');
  sh.box(0.1, 0.97, 0.182, 0.09, 0.04, 0.004, 0);
  sh.box(-0.09, 0.94, 0.182, 0.06, 0.06, 0.004, 0);
  kd.m('#0c0d0e', 'rubber');
  sh.box(0.1, 0.97, 0.1845, 0.066, 0.006, 0.002, 0);
  sh.box(-0.09, 0.94, 0.1845, 0.006, 0.034, 0.002, 0);
  // printed tariff, dark lines on a pale plate
  kd.m('#e9e6d8', 'plastic');
  sh.box(0, 0.76, 0.1815, 0.3, 0.2, 0.002, 0);
  kd.m('#2b2e33', 'plastic');
  for (let i = 0; i < 6; i++) sh.box(-0.02 * (i % 2), 0.83 - i * 0.027, 0.183, 0.24 - (i % 3) * 0.04, 0.008, 0.001, 0);
  // the tray where the ticket falls, a lock below it
  kd.m('#14161a', 'plastic');
  sh.box(0, 0.47, 0.18, 0.2, 0.09, 0.004, 0);
  kd.m('#8f949a', 'steel');
  sh.box(0, 0.425, 0.195, 0.21, 0.012, 0.035, 0);
  sh.cyl(0.17, 0.25, 0.181, 0.014, 0.014, 0.006, 8, 2);
  // base bolts
  kd.m('#7c7f80', 'steel');
  for (const x of [-0.26, 0.26]) for (const z of [-0.17, 0.17]) sh.cyl(x, 0.12, z, 0.012, 0.012, 0.012, 6, 2);
  // a round P on a stalk, a solar panel on the lid
  kd.m('#8f949a', 'steel');
  sh.cyl(-0.16, 1.67, -0.1, 0.014, 0.014, 0.36, 8, 0);
  sh.push().local(0.08, 1.74, 0, -0.5, 0, 0);
  sh.box(0, 0, 0, 0.3, 0.012, 0.24, 0);
  kd.m('#141c33', 'steel');
  sh.box(0, 0.0075, 0, 0.27, 0.002, 0.21, 0);
  sh.pop();
  sh.cyl(0.08, 1.67, 0.03, 0.012, 0.012, 0.06, 6, 0);
  sh.push().local(-0.16, 2.06, -0.1, Math.PI / 2, 0, 0);
  kd.m('#2466b8', 'paint');
  sh.cyl(0, -0.006, 0, 0.09, 0.09, 0.012, 16, 3);
  kd.m('#f4f2ea', 'paint');
  sh.box(-0.028, 0.008, 0, 0.022, 0.002, 0.11, 0);
  sh.box(0.012, 0.008, -0.04, 0.06, 0.002, 0.018, 0);
  sh.box(0.012, 0.008, -0.006, 0.06, 0.002, 0.018, 0);
  sh.box(0.04, 0.008, -0.023, 0.018, 0.002, 0.05, 0);
  sh.pop();
}

/** A charging post up close (?noshapemachines): soft corners, a plinth with its bolts, a dark fascia with a lit strip, the connector in its holster, the cable looping down and back. */
function chargerNear(kd: Kit): void {
  const sh = kd.sh;
  kd.m('#e8e4da', 'paint');
  for (const x of [-1, 1]) for (const z of [-1, 1]) sh.cyl((x * 0.36) / 2, 0, (z * 0.26) / 2, 0.025, 0.025, 1.5, 8, 0);
  sh.cyl(0, 1.5, 0, 0.17, 0.17, 0.015, 16, 2);
  kd.m('#a9a59c', 'stone');
  cbox(sh, 0, 0.03, 0, 0.5, 0.06, 0.4, 0.012, 1);
  kd.m('#7c7f80', 'steel');
  for (const x of [-0.2, 0.2]) for (const z of [-0.15, 0.15]) sh.cyl(x, 0.06, z, 0.011, 0.011, 0.012, 6, 2);
  kd.m('#1b1d20', 'plastic');
  sh.box(0, 0.98, 0.1315, 0.26, 0.26, 0.003, 0);
  kd.e('#bcd4e0', '#9fffb0', 0.6);
  sh.box(0, 0.95, 0.1335, 0.18, 0.14, 0.002, 0);
  kd.e('#3fae5a', '#7dffa0', 1.2);
  sh.box(0, 1.1, 0.1335, 0.2, 0.012, 0.002, 0);
  // holster, connector, cable
  kd.m('#2a2c2e', 'plastic');
  sh.box(0.1, 0.66, 0.15, 0.1, 0.13, 0.05, 0);
  kd.m('#1d1f22', 'rubber');
  sh.tube(0.1, 0.71, 0.17, 0.1, 0.6, 0.21, 0.024, 0.021, 8);
  sh.tube(0.1, 0.6, 0.21, 0.1, 0.52, 0.23, 0.021, 0.014, 8);
  const P: [number, number, number][] = [
    [0.1, 0.52, 0.23],
    [0.15, 0.32, 0.27],
    [0.2, 0.12, 0.32],
    [0.17, 0.04, 0.36],
    [0.06, 0.045, 0.36],
    [-0.03, 0.14, 0.3],
    [-0.08, 0.3, 0.2],
    [-0.1, 0.42, 0.14],
  ];
  for (let i = 0; i + 1 < P.length; i++) sh.tube(P[i][0], P[i][1], P[i][2], P[i + 1][0], P[i + 1][1], P[i + 1][2], 0.014, 0.014, 6);
  // a maker's plate, a warning label
  kd.m('#f2c84b', 'plastic');
  sh.box(0, 0.36, 0.131, 0.1, 0.09, 0.002, 0);
  kd.m('#1b1d20', 'plastic');
  sh.box(0, 0.36, 0.1322, 0.012, 0.06, 0.001, 0);
}

/** A glass bank up close (?noshapemachines): soft upright corners over a kerb frame, a lifting ring on the crown, a rubber flap with slits in the mouth, a label. */
function bankNear(kd: Kit, x: number, col: string, i: number): void {
  const sh = kd.sh;
  kd.m(col, 'plastic');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.cyl(x + sx * 0.5, 0, sz * 0.625, 0.045, 0.045, 1.3, 8, 0);
  kd.m('#35383a', 'steel');
  sh.box(x, 0.03, 0, 1.03, 0.06, 1.28, 1);
  kd.m('#8f949a', 'steel');
  sh.tube(x - 0.1, 1.5, 0, x - 0.1, 1.6, 0, 0.012, 0.012, 6);
  sh.tube(x + 0.1, 1.5, 0, x + 0.1, 1.6, 0, 0.012, 0.012, 6);
  sh.tube(x - 0.1, 1.6, 0, x - 0.05, 1.65, 0, 0.012, 0.012, 6);
  sh.tube(x - 0.05, 1.65, 0, x + 0.05, 1.65, 0, 0.012, 0.012, 6);
  sh.tube(x + 0.05, 1.65, 0, x + 0.1, 1.6, 0, 0.012, 0.012, 6);
  // the mouth: a raised rim and the flap's slits
  kd.m('#2a2c2e', 'rubber');
  sh.push().local(x, 1.0, 0.64, Math.PI / 2, 0, 0);
  sh.cyl(0, -0.012, 0, 0.16, 0.16, 0.024, 14, 3);
  kd.m('#0d0e0f', 'rubber');
  for (let a = 0; a < 4; a++) {
    sh.push().local(0, 0.014, 0, 0, (a * Math.PI) / 4, 0);
    sh.box(0, 0, 0, 0.22, 0.002, 0.008, 0);
    sh.pop();
  }
  sh.pop();
  // a sticker: what goes in here
  kd.m('#f4f2ea', 'plastic');
  sh.box(x, 0.56, 0.6265, 0.4, 0.3, 0.002, 0);
  kd.m(col, 'paint');
  sh.box(x, 0.65, 0.6278, 0.34, 0.07, 0.001, 0);
  kd.m('#2b2e33', 'plastic');
  for (let k = 0; k < 3; k++) sh.box(x, 0.57 - k * 0.04, 0.6278, 0.3 - ((k + i) % 2) * 0.08, 0.012, 0.001, 0);
}

/** Pay & display machine. Faces +Z. */
export function ticketMachine(k: Kit, kd?: Kit): void {
  const sh = k.sh;
  if (kd) ticketNear(kd);
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
export function evCharger(k: Kit, kd?: Kit): void {
  const sh = k.sh;
  if (kd) chargerNear(kd);
  k.m('#e8e4da', 'paint');
  sh.box(0, 0.75, 0, 0.36, 1.5, 0.26, 1);
  k.m('#3fae5a', 'paint');
  sh.box(0, 1.25, 0.131, 0.36, 0.2, 0.01, 0);
  k.e('#bcd4e0', '#9fffb0', 0.6);
  sh.box(0, 0.95, 0.131, 0.18, 0.14, 0.01, 0);
  k.m('#1d1f22', 'rubber');
  if (!kd) sh.tube(0.12, 0.8, 0.14, 0.2, 0.3, 0.3, 0.025, 0.025, 4);
}

/** Bottle banks: three domed containers (green / white / brown glass) + a paper bank. */
export function bottleBank(ks: Kit, rng: Rng, kd?: Kit): void {
  const sh = ks.sh;
  const cols = ['#3f8f5a', '#e8e4da', '#8a5a3a', '#2f5f9e'];
  for (let i = 0; i < 4; i++) {
    const x = -1.65 + i * 1.1;
    if (kd) bankNear(kd, x, cols[i], i);
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

/** box hunt (?nocourttable): the courtyard table built like one — a top of five planks with gaps on two cleats,
 *  splayed A-frame trestles with cross bars and a stretcher, carriage bolts; slatted benches on legs with foot bars */
let COURT = true;
export function setCourtTableDetail(on: boolean): void {
  COURT = on;
}

function courtTableKit(k: Kit, wood: string): void {
  const sh = k.sh;
  k.m(wood, 'wood');
  const pw = (0.75 - 4 * 0.01) / 5;
  for (let i = 0; i < 5; i++) sh.box(0, 0.735, -0.375 + pw / 2 + i * (pw + 0.01), 1.5, 0.04, pw, 0);
  for (const x of [-0.6, 0.6]) {
    sh.box(x, 0.695, 0, 0.05, 0.04, 0.7, 0);
    for (const s of [1, -1]) {
      sh.push().local(x, 0.3375, s * 0.22, -s * 0.288, 0, 0);
      sh.box(0, 0, 0, 0.05, 0.704, 0.07, 1);
      sh.pop();
    }
    sh.box(x, 0.25, 0, 0.05, 0.05, 0.5, 0);
  }
  sh.box(0, 0.3, 0, 1.15, 0.05, 0.05, 0);
  // benches: two seat planks on cleats, legs with foot bars and a stretcher
  for (const z of [-0.68, 0.68]) {
    for (const dz of [-0.07, 0.07]) sh.box(0, 0.43, z + dz, 1.5, 0.035, 0.13, 0);
    for (const x of [-0.6, 0.6]) {
      sh.box(x, 0.395, z, 0.05, 0.035, 0.26, 0);
      for (const dz of [-0.08, 0.08]) sh.box(x, 0.19, z + dz, 0.05, 0.38, 0.05, 1);
      sh.box(x, 0.07, z, 0.05, 0.04, 0.22, 0);
    }
    sh.box(0, 0.16, z, 1.15, 0.04, 0.04, 0);
  }
  // carriage bolts where the legs meet the cleats
  k.m('#3a3d40', 'iron');
  for (const x of [-0.625, 0.625]) for (const s of [1, -1]) sh.box(x + Math.sign(x) * 0.002, 0.64, s * 0.13, 0.012, 0.03, 0.03, 0);
}

/** Courtyard table with two benches. */
export function courtTable(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const wood = rng.pick(['#8a6240', '#a87f58', '#6f5a48']);
  if (COURT) {
    courtTableKit(k, wood);
    k.m(rng.pick(['#e9e4d8', '#7aa0c8', '#c95f4a']), 'ceramic');
    sh.cyl(0.2, 0.755, 0.05, 0.06, 0.05, 0.12, 6, 2);
    return;
  }
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
  // (?nobikepair) 0.9 m apart in one plane, 1.7 m long: the wheels ran through each other. The second leans on the first, a handlebar's width out
  const pair = bugOn('bikepair');
  for (const x of [-0.45, 0.45]) {
    if (x > 0 && rng.chance(0.3)) continue;
    sh.push().local(pair ? x * 0.5 : x, 0, pair && x > 0 ? 0.42 : -0.1, 0, rng.range(-0.1, 0.1), 0.12);
    bikeLite(k, rng.pick(BIKE_COLS));
    sh.pop();
  }
}

/** Wheelie bin row (courtyards). */
export function binRow(k: Kit, rng: Rng): void {
  wheelieBins(k, rng, 3);
}

/** 20 ft storage container (corrugated sides suggested by ribs), doors at +X end. */
export function container(ks: Kit, rng: Rng, kd?: Kit): void {
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
  if (kd) containerNear(kd, L, W, H, col, 7 + Math.floor(rng.next() * 900));
}

/**
 * What a shipping container is made of, for up close (`kd`, same frame as `container`, ?noshapecontainer): the walls are corrugated sheet,
 * the corners cast fittings with their holes, the doors have four locking bars with handles, hinges and a rubber seal, the sill forklift pockets.
 */
function containerNear(kd: Kit, L: number, W: number, H: number, col: string, seed: number): void {
  const sh = kd.sh;
  const paint = (k: number): void => {
    kd.m(col, 'paint');
    kd.s.r *= k;
    kd.s.g *= k;
    kd.s.b *= k;
  };
  const rust = (): void => {
    kd.m('#6b4a35', 'steel');
  };
  // a corrugated wall in the plane z = w (facing +z when dir = 1), from x0 to x1, y0 to y1; its valleys clear the far model's ribs
  const sheet = (x0: number, x1: number, y0: number, y1: number, w: number, dir: number): void => {
    const pitch = 0.278,
      deep = 0.036,
      flat = 0.07;
    const n = Math.round((x1 - x0) / pitch);
    const p = (x1 - x0) / n;
    const q = (p - 2 * flat) / 2;
    const slope = Math.hypot(deep, q);
    const quad = (a: number, az: number, b: number, bz: number, nx: number, nz: number): void => {
      const v0 = sh.v(a, y0, w + az * dir, nx, 0, nz * dir),
        v1 = sh.v(b, y0, w + bz * dir, nx, 0, nz * dir),
        v2 = sh.v(b, y1, w + bz * dir, nx, 0, nz * dir),
        v3 = sh.v(a, y1, w + az * dir, nx, 0, nz * dir);
      if (dir > 0) {
        sh.s.tri(v0, v1, v2);
        sh.s.tri(v0, v2, v3);
      } else {
        sh.s.tri(v0, v2, v1);
        sh.s.tri(v0, v3, v2);
      }
    };
    for (let i = 0; i < n; i++) {
      const x = x0 + i * p;
      quad(x, deep, x + flat, deep, 0, 1);
      quad(x + flat, deep, x + flat + q, 0, deep / slope, q / slope);
      quad(x + flat + q, 0, x + flat + q + flat, 0, 0, 1);
      quad(x + flat + q + flat, 0, x + p, deep, -deep / slope, q / slope);
    }
  };
  const rail = 0.12;
  paint(1);
  for (const d of [-1, 1]) sheet(-L / 2 + 0.16, L / 2 - 0.16, rail, H - rail, (d * W) / 2 + d * 0.031, d);
  // the blind end: the same sheet across
  sh.push().local(-L / 2 - 0.031, 0, 0, 0, -Math.PI / 2);
  sheet(-W / 2 + 0.16, W / 2 - 0.16, rail, H - rail, 0, 1);
  sh.pop();
  // the rails and posts, a shade darker, standing proud of the sheet
  paint(0.74);
  for (const d of [-1, 1]) {
    cbox(sh, 0, H - rail / 2, (d * W) / 2, L + 0.01, rail, 0.16, 0.012, 1);
    cbox(sh, 0, rail / 2, (d * W) / 2, L + 0.01, rail, 0.16, 0.012, 1);
    for (const e of [-1, 1]) cbox(sh, (e * (L - 0.16)) / 2, H / 2, (d * (W - 0.16)) / 2 + d * 0.012, 0.17, H, 0.18, 0.012, 3);
  }
  for (const e of [-1, 1]) {
    cbox(sh, (e * L) / 2, H - rail / 2, 0, 0.16, rail, W - 0.1, 0.012, 1);
    cbox(sh, (e * L) / 2, rail / 2, 0, 0.16, rail, W - 0.1, 0.012, 1);
  }
  // the cast corner fittings, with their oval holes
  paint(0.52);
  for (const d of [-1, 1])
    for (const e of [-1, 1])
      for (const y of [0.06, H - 0.06]) {
        const cx = (e * (L - 0.15)) / 2,
          cz = (d * (W - 0.15)) / 2;
        cbox(sh, cx, y, cz + d * 0.015, 0.178, 0.122, 0.18, 0.008, 0);
      }
  kd.m('#141516', 'steel');
  for (const d of [-1, 1])
    for (const e of [-1, 1])
      for (const y of [0.06, H - 0.06]) {
        sh.box((e * (L - 0.15)) / 2, y, (d * W) / 2 + d * 0.0955, 0.085, 0.05, 0.002, 0);
        sh.box((e * L) / 2 + e * 0.011, y, (d * (W - 0.15)) / 2 + d * 0.015, 0.002, 0.05, 0.085, 0);
      }
  // forklift pockets in the sill
  kd.m('#141516', 'steel');
  for (const d of [-1, 1]) for (const x of [-0.92, 0.92]) sh.box(x, 0.07, (d * W) / 2 + d * 0.081, 0.36, 0.09, 0.002, 0);
  // the door end: two leaves, a rubber seal, hinges on the posts, four locking bars with cams and handles
  const fx = L / 2 + 0.031;
  paint(0.92);
  cbox(sh, fx - 0.012, H / 2, 0.59, 0.024, H - 2 * rail, 1.13, 0.006, 3);
  cbox(sh, fx - 0.012, H / 2, -0.59, 0.024, H - 2 * rail, 1.13, 0.006, 3);
  // pressed panels in the leaves
  paint(0.84);
  for (const z of [0.59, -0.59]) for (const y of [0.62, 1.3, 1.98]) sh.box(fx + 0.0025, y, z, 0.002, 0.52, 0.92, 0);
  kd.m('#191a1b', 'rubber');
  sh.box(fx + 0.002, H / 2, 0, 0.008, H - 2 * rail, 0.03, 0);
  paint(0.6);
  for (const z of [-1.07, 1.07]) for (const y of [0.45, 1.0, 1.6, 2.15]) cbox(sh, fx + 0.012, y, z, 0.05, 0.09, 0.14, 0.006, 0);
  for (const z of [-0.84, -0.3, 0.3, 0.84]) {
    kd.m('#8f949a', 'steel');
    sh.push().local(fx + 0.045, 0, z);
    sh.cyl(0, 0.05, 0, 0.016, 0.016, H - 0.1, 8, 0);
    // keepers, cams top and bottom
    paint(0.55);
    for (const y of [0.1, 0.55, 1.5, 2.1, H - 0.1]) sh.box(-0.015, y, 0, 0.04, 0.03, 0.05, 0);
    kd.m('#8f949a', 'steel');
    sh.box(0, 0.075, 0, 0.05, 0.05, 0.05, 0);
    sh.box(0, H - 0.075, 0, 0.05, 0.05, 0.05, 0);
    // the handle, folded against the door
    sh.box(0.024, 1.14, Math.sign(z) * 0.14, 0.022, 0.03, 0.26, 0);
    sh.pop();
  }
  // the data plate; a scuff and rust along the sill
  kd.m('#d9d4c8', 'plastic');
  sh.box(fx + 0.002, 2.0, 0.59, 0.003, 0.16, 0.26, 0);
  rust();
  for (let i = 0; i < 6; i++) {
    const x = -L / 2 + 0.6 + ((seed * (i + 3) * 137) % 480) / 100;
    const w = 0.05 + ((seed * (i + 7)) % 12) / 100;
    for (const d of [-1, 1]) sh.box(x, 0.13 + ((seed + i) % 3) * 0.004, (d * W) / 2 + d * 0.082, w, 0.012 + (i % 3) * 0.006, 0.002, 0);
  }
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
