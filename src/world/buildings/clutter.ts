// Lived-in facade clutter shared by the building generators: window boxes and balconies full of
// plants (leaf cards from green.ts) with chairs, tables, drying racks, bikes and gas bottles, Juliet
// balconies, shutters in different positions (open, closed, one leaf, ajar), wall-mounted AC units
// with their pipes, satellite dishes, downpipes. All in the lot's LOCAL frame (trim / green builders).

import * as THREE from 'three';
import type { Gen, SideGeom } from './gen';
import { sideBox, sx, sz, setCol, col, shade } from './gen';
import { GREEN } from './green';
import { anchors } from './anchors';

/** ?noclutter (A/B): skip the lived-in clutter geometry (plants, balcony life, AC, dishes, pipes, roof kit) */
let clutterOn = true;
export function setClutter(on: boolean): void {
  clutterOn = on;
}

const POTS = ['#b5653f', '#a9573a', '#c47a52', '#e9e4d8', '#6f6a64', '#3a3f44', '#8a4a2e'];
const CHAIRS = ['#2c3033', '#e9e4d8', '#3f7a8f', '#c9473f', '#7a5a3a', '#4f7a4a', '#d8b24a'];

/** plant cells for pot plants, with relative weights */
const POT_PLANTS = [GREEN.SHRUB, GREEN.PALM, GREEN.GERANIUM, GREEN.SUCCULENT, GREEN.LAVENDER, GREEN.GRASS, GREEN.JASMINE];
const POT_W = [3, 2.2, 2.4, 1.4, 1.0, 1.0, 1.0];
const TRAIL = [GREEN.IVY_HANG, GREEN.PETUNIA, GREEN.POTHOS, GREEN.BOUGAIN];

/** Terracotta (or plastic) pot at side coordinates (u, o) on a floor at y, with a plant. */
export function potPlant(g: Gen, sg: SideGeom, u: number, o: number, y: number, scale = 1, cell?: number): void {
  if (!clutterOn) return;
  const t = g.trim;
  const r = g.rng;
  const pr = 0.14 * scale * r.range(0.85, 1.25);
  const ph = pr * r.range(1.4, 2.1);
  setCol(t, col(r.pick(POTS)));
  const px = sx(sg, u, o),
    pz = sz(sg, u, o);
  t.cylinder(px, pz, pr * 0.78, y, y + ph, 7, true, pr);
  const c = cell ?? r.weighted(POT_PLANTS, POT_W);
  const big = c === GREEN.PALM ? 1.6 : c === GREEN.SHRUB ? 1.25 : c === GREEN.SUCCULENT ? 0.8 : 1;
  const h = Math.min(1.9, (0.45 + r.next() * 0.45) * scale * big);
  // crown radius: stays within ~0.6 m (balconies are ≤ 1 m deep; overhangs must stay < 1.2 m)
  g.green.clump(px, y + ph - 0.04, pz, Math.min(0.6, Math.max(pr * 1.9, h * 0.42)), h, c, c === GREEN.PALM ? 3 : 2);
}

/** Window box below a window: box + flowers on top + trailing plants over the front. */
export function windowBox(g: Gen, sg: SideGeom, u: number, ww: number, y0: number, boxCol?: THREE.Color): void {
  if (!clutterOn) return;
  const t = g.trim;
  const r = g.rng;
  setCol(t, boxCol ?? (r.chance(0.5) ? col('#7a4b2a') : r.chance(0.5) ? col('#3f5f3a') : col('#b5653f')));
  sideBox(t, sg, u - ww / 2, u + ww / 2, 0.12, 0.36, y0 - 0.02, y0 + 0.2, true);
  setCol(t, col('#4a3424'));
  sideBox(t, sg, u - ww / 2 + 0.03, u + ww / 2 - 0.03, 0.14, 0.34, y0 + 0.2, y0 + 0.21);
  const top = r.weighted([GREEN.GERANIUM, GREEN.SHRUB, GREEN.LAVENDER, GREEN.JASMINE], [4, 1.2, 1, 0.8]);
  const n = Math.max(1, Math.round(ww / 0.45));
  for (let k = 0; k < n; k++) {
    const fu = u - ww / 2 + (ww * (k + 0.5)) / n;
    g.green.clump(sx(sg, fu, 0.24), y0 + 0.17, sz(sg, fu, 0.24), 0.2, r.range(0.28, 0.42), top, 2);
  }
  if (r.chance(0.7)) {
    const trail = r.weighted([GREEN.PETUNIA, GREEN.IVY_HANG, GREEN.POTHOS], [3, 1.5, 1]);
    g.green.hang(sg, u - ww / 2 + 0.02, u + ww / 2 - 0.02, 0.36, y0 + 0.2, 0.3, r.range(0.5, 0.95), trail, 0.06);
  }
}

export interface BalconyOpts {
  /** railing / parapet top above the floor */
  rail: number;
  /** solid parapet (apartments) rather than open railings */
  solid?: boolean;
  /** probability scale of plants (1 = Mediterranean balcony) */
  green?: number;
  /** wall-to-railing depth */
  depth: number;
}

/**
 * Life on a balcony floor spanning [uA, uB] on side sg, floor top at y: plants in pots along the
 * railing and the wall, trailing plants over the railing, chairs + a little table, a drying rack,
 * a bike, gas bottle or AC unit; sometimes a bougainvillea / ivy cascade down the facade.
 */
export function balconyLife(g: Gen, sg: SideGeom, uA: number, uB: number, y: number, o: BalconyOpts): void {
  if (!clutterOn) return;
  const t = g.trim;
  const r = g.rng;
  const W = uB - uA;
  const D = o.depth;
  const gp = o.green ?? 1;
  // occupancy of the floor in u (0.1 m cells) so things don't overlap
  const cells = new Uint8Array(Math.max(1, Math.ceil(W / 0.1)));
  const take = (a: number, b: number): boolean => {
    const i0 = Math.max(0, Math.floor((a - uA) / 0.1)),
      i1 = Math.min(cells.length - 1, Math.ceil((b - uA) / 0.1));
    for (let i = i0; i <= i1; i++) if (cells[i]) return false;
    for (let i = i0; i <= i1; i++) cells[i] = 1;
    return true;
  };
  // trailing plants over the railing (front) — the strongest Tel-Aviv / Mediterranean cue
  if (r.chance(Math.min(0.9, 0.72 * gp))) {
    const cell = r.weighted(TRAIL, [2, 1.5, 1.2, 1.4]);
    const a = uA + r.range(0, W * 0.3),
      b = uB - r.range(0, W * 0.3);
    const long = cell === GREEN.BOUGAIN || cell === GREEN.IVY_HANG ? r.range(0.8, 2.6) : r.range(0.5, 1.1);
    g.green.hang(sg, a, b, D + 0.03, y + o.rail, 0.35, long, cell, 0.1);
    // planter boxes along the inside of the railing
    setCol(t, col(r.pick(['#b5653f', '#3a3f44', '#e9e4d8'])));
    sideBox(t, sg, a + 0.05, b - 0.05, D - 0.32, D - 0.06, y, y + 0.32, true);
    const n = Math.max(1, Math.round((b - a) / 0.5));
    for (let k = 0; k < n; k++) {
      const fu = a + ((b - a) * (k + 0.5)) / n;
      g.green.clump(sx(sg, fu, D - 0.19), y + 0.28, sz(sg, fu, D - 0.19), 0.24, r.range(0.35, 0.6), r.weighted([GREEN.GERANIUM, GREEN.SHRUB, GREEN.JASMINE, GREEN.LAVENDER], [3, 2, 1, 1]), 2);
    }
  }
  // pot plants in the corners and along the wall
  const nPots = Math.round(r.range(1.2, 4.4) * gp);
  for (let k = 0; k < nPots; k++) {
    const end = k % 2 === 0;
    const u = end ? uA + 0.25 + r.next() * 0.2 : uB - 0.25 - r.next() * 0.2;
    if (!take(u - 0.2, u + 0.2)) continue;
    potPlant(g, sg, u, r.range(0.25, Math.max(0.3, D - 0.3)), y, r.range(1.0, 1.9));
  }
  // hanging pot on an iron wall bracket
  if (r.chance(0.22 * gp) && W > 1.2) {
    const u = r.chance(0.5) ? uA + 0.3 : uB - 0.3;
    const yb = y + 2.15;
    setCol(t, col('#2c3035'));
    t.beam(sx(sg, u, 0), yb, sz(sg, u, 0), sx(sg, u, 0.45), yb, sz(sg, u, 0.45), 0.025, 0.025);
    t.beam(sx(sg, u, 0), yb - 0.3, sz(sg, u, 0), sx(sg, u, 0.3), yb, sz(sg, u, 0.3), 0.02, 0.02);
    const hx = sx(sg, u, 0.4),
      hz = sz(sg, u, 0.4);
    setCol(t, col('#d8d4ca'));
    t.cylinder(hx, hz, 0.005, yb - 0.4, yb, 3, false);
    setCol(t, col(r.pick(['#e9e4d8', '#b5653f', '#3a3f44'])));
    t.cylinder(hx, hz, 0.12, yb - 0.6, yb - 0.4, 7, true, 0.15);
    g.green.clump(hx, yb - 0.45, hz, 0.22, 0.32, r.pick([GREEN.GERANIUM, GREEN.GRASS, GREEN.JASMINE]), 2);
    g.green.hang({ ...sg, x0: hx - sg.tx * 0.2, z0: hz - sg.tz * 0.2 }, 0, 0.4, 0.0, yb - 0.45, 0.3, 0.8, GREEN.POTHOS, 0.05, 1, 0.3);
  }
  // furniture: two chairs and a little table, or a single chair
  const roll = r.next();
  if (roll < 0.45 && D > 0.75 && W > 1.6) {
    const u = uA + W * r.range(0.3, 0.7);
    if (take(u - 0.6, u + 0.6)) {
      const cc = col(r.pick(CHAIRS));
      for (const du of [-0.42, 0.42]) chair(g, sg, u + du, D * 0.5, y, cc);
      if (r.chance(0.7)) {
        setCol(t, col(r.pick(['#e9e4d8', '#2c3033', '#9a6a43'])));
        const tx = sx(sg, u, D * 0.5),
          tz = sz(sg, u, D * 0.5);
        t.cylinder(tx, tz, 0.025, y, y + 0.68, 4, false);
        t.cylinder(tx, tz, 0.24, y + 0.68, y + 0.71, 8, true);
      }
    }
  } else if (roll < 0.62) {
    // drying rack with laundry (wire = rigid; cloth goes to the static-laundry mesh)
    const u = uA + W * r.range(0.3, 0.7);
    if (take(u - 0.5, u + 0.5) && D > 0.6) {
      setCol(t, col('#d8d8d4'));
      const ax = sx(sg, u - 0.45, D * 0.5),
        az = sz(sg, u - 0.45, D * 0.5),
        bx = sx(sg, u + 0.45, D * 0.5),
        bz = sz(sg, u + 0.45, D * 0.5);
      t.beam(ax, y + 0.95, az, bx, y + 0.95, bz, 0.02, 0.02);
      t.beam(ax, y, az, ax, y + 0.95, az, 0.02, 0.02);
      t.beam(bx, y, bz, bx, y + 0.95, bz, 0.02, 0.02);
      anchors.laundryLine(ax, y + 0.94, az, bx, y + 0.94, bz, sg.nx, sg.nz);
      const cl = g.cloth;
      const cols = ['#f4efe4', '#7da3c4', '#e86a8a', '#e8c35a', '#3f8f5a', '#2f3a52'];
      for (let k = 0; k < 3; k++) {
        const uu = u - 0.3 + k * 0.3;
        setCol(cl, col(r.pick(cols)));
        sideBox(cl, sg, uu - 0.12, uu + 0.12, D * 0.5 - 0.01, D * 0.5 + 0.01, y + 0.95 - r.range(0.3, 0.5), y + 0.94, false, true);
      }
    }
  } else if (roll < 0.72 && W > 1.6 && D > 0.7) {
    // bicycle parked against the wall
    const u = uA + W * r.range(0.25, 0.6);
    if (take(u - 0.6, u + 0.6)) bikeAlong(g, sg, u, 0.25, y);
  }
  // odds and ends: gas bottle / AC condenser / broom / dish on the railing
  const extra = r.next();
  if (extra < 0.25) {
    const u = r.chance(0.5) ? uA + 0.2 : uB - 0.2;
    if (take(u - 0.15, u + 0.15)) {
      setCol(t, col(r.pick(['#3a6fa8', '#c9473f', '#a9adb0'])));
      const bx = sx(sg, u, 0.2),
        bz = sz(sg, u, 0.2);
      t.cylinder(bx, bz, 0.13, y, y + 0.5, 7, true, 0.1);
    }
  } else if (extra < 0.5) {
    const u = r.chance(0.5) ? uA + 0.5 : uB - 0.5;
    if (take(u - 0.45, u + 0.45) && D > 0.6) acUnit(g, sg, u, y, 0.02, true);
  } else if (extra < 0.6) {
    dish(g, sg, r.chance(0.5) ? uA + 0.35 : uB - 0.35, y + o.rail - 0.1, D - 0.05);
  }
}

function chair(g: Gen, sg: SideGeom, u: number, o: number, y: number, c: THREE.Color): void {
  const t = g.trim;
  setCol(t, c);
  sideBox(t, sg, u - 0.2, u + 0.2, o - 0.2, o + 0.2, y + 0.42, y + 0.46, true, true);
  for (const du of [-0.17, 0.17]) for (const dv of [-0.17, 0.17]) sideBox(t, sg, u + du - 0.015, u + du + 0.015, o + dv - 0.015, o + dv + 0.015, y, y + 0.42, false, true);
  // back towards the wall (sitter faces out)
  sideBox(t, sg, u - 0.2, u + 0.2, o - 0.22, o - 0.18, y + 0.46, y + 0.86, true, true);
}

function bikeAlong(g: Gen, sg: SideGeom, u: number, o: number, y: number): void {
  const t = g.trim;
  const r = g.rng;
  const c = col(r.pick(['#c9473f', '#2a6f74', '#2c3033', '#d8b24a', '#3d5a80']));
  // wheels as thin rings of beams, frame as beams (all in the side plane)
  setCol(t, col('#1e1f21'));
  for (const du of [-0.5, 0.5]) {
    const cx = u + du,
      cy = y + 0.33;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      t.beam(sx(sg, cx + Math.cos(a0) * 0.32, o), cy + Math.sin(a0) * 0.32, sz(sg, cx + Math.cos(a0) * 0.32, o), sx(sg, cx + Math.cos(a1) * 0.32, o), cy + Math.sin(a1) * 0.32, sz(sg, cx + Math.cos(a1) * 0.32, o), 0.03, 0.03);
    }
  }
  setCol(t, c);
  const P = (du: number, h: number) => [sx(sg, u + du, o), y + h, sz(sg, u + du, o)] as const;
  const seg = (a: readonly number[], b: readonly number[]) => t.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.035, 0.035);
  seg(P(-0.5, 0.33), P(-0.05, 0.3));
  seg(P(-0.05, 0.3), P(-0.17, 0.8));
  seg(P(-0.17, 0.8), P(0.38, 0.82));
  seg(P(-0.05, 0.3), P(0.38, 0.82));
  seg(P(0.38, 0.82), P(0.5, 0.33));
  seg(P(-0.5, 0.33), P(-0.17, 0.8));
  setCol(t, col('#1e1f21'));
  seg(P(0.36, 0.95), P(0.38, 0.82));
  sideBox(t, sg, u - 0.27, u - 0.07, o - 0.06, o + 0.06, y + 0.84, y + 0.88, true, true);
}

/** Wall-mounted AC condenser (on brackets) at side position u, bottom y; `floor` = standing on a floor. */
export function acUnit(g: Gen, sg: SideGeom, u: number, y: number, o = 0, floor = false): void {
  if (!clutterOn) return;
  const t = g.trim;
  const r = g.rng;
  const w = r.range(0.72, 0.86),
    h = r.range(0.5, 0.58),
    d = 0.28;
  const y0 = floor ? y + 0.05 : y;
  if (!floor) {
    setCol(t, col('#6f6a64'));
    for (const du of [-w * 0.35, w * 0.35]) sideBox(t, sg, u + du - 0.02, u + du + 0.02, o, o + d + 0.04, y0 - 0.05, y0, true);
  } else {
    setCol(t, col('#3a3f44'));
    sideBox(t, sg, u - w / 2, u + w / 2, o + 0.02, o + d, y, y + 0.05);
  }
  setCol(t, col(r.chance(0.8) ? '#dcdcd6' : '#b9b9b2'));
  sideBox(t, sg, u - w / 2, u + w / 2, o + 0.02, o + d, y0, y0 + h, true);
  // fan grille (dark disc) on the front face
  setCol(t, col('#3a3f44'));
  const fx = sx(sg, u - w * 0.12, o + d + 0.005),
    fz = sz(sg, u - w * 0.12, o + d + 0.005);
  const fr = h * 0.36;
  const n = 10;
  const yc = y0 + h * 0.5;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2,
      a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [fx + sg.tx * Math.cos(a0) * fr, yc + Math.sin(a0) * fr, fz + sg.tz * Math.cos(a0) * fr];
    const p1 = [fx + sg.tx * Math.cos(a1) * fr, yc + Math.sin(a1) * fr, fz + sg.tz * Math.cos(a1) * fr];
    t.triangle(fx, yc, fz, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
  }
  setCol(t, col('#9a9a94'));
  sideBox(t, sg, u + w * 0.22, u + w * 0.42, o + d, o + d + 0.01, y0 + 0.08, y0 + h - 0.08);
  // refrigerant pipes (insulated, white) running up into the wall
  if (!floor) {
    setCol(t, col('#e9e6dd'));
    const px = sx(sg, u + w / 2 + 0.06, o + 0.06),
      pz = sz(sg, u + w / 2 + 0.06, o + 0.06);
    t.cylinder(px, pz, 0.025, y0 + 0.15, y0 + h + 0.45, 5, true);
  }
}

/** Satellite dish on a bracket at side position u, height y, offset o. */
export function dish(g: Gen, sg: SideGeom, u: number, y: number, o: number): void {
  if (!clutterOn) return;
  const t = g.trim;
  setCol(t, col('#8f9497'));
  const bx = sx(sg, u, o),
    bz = sz(sg, u, o);
  t.beam(bx, y, bz, sx(sg, u, o + 0.25), y + 0.12, sz(sg, u, o + 0.25), 0.03, 0.03);
  setCol(t, col('#e9e9e6'));
  // dish: shallow cone facing out-and-up
  const cx = sx(sg, u, o + 0.28),
    cz = sz(sg, u, o + 0.28);
  const R = 0.32;
  const n = 10;
  const ax = sg.nx * 0.85,
    ay = 0.5,
    az = sg.nz * 0.85; // axis
  // basis across the axis: tangent t and up-ish v = axis × t
  const tx = sg.tx,
    tz = sg.tz;
  const vx = ay * tz - az * 0,
    vy = az * tx - ax * tz,
    vz = ax * 0 - ay * tx;
  const apx = cx - ax * 0.12,
    apy = y + 0.12 - ay * 0.12,
    apz = cz - az * 0.12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2,
      a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [cx + (tx * Math.cos(a0) + vx * Math.sin(a0)) * R, y + 0.12 + vy * Math.sin(a0) * R, cz + (tz * Math.cos(a0) + vz * Math.sin(a0)) * R];
    const p1 = [cx + (tx * Math.cos(a1) + vx * Math.sin(a1)) * R, y + 0.12 + vy * Math.sin(a1) * R, cz + (tz * Math.cos(a1) + vz * Math.sin(a1)) * R];
    t.triangle(apx, apy, apz, p1[0], p1[1], p1[2], p0[0], p0[1], p0[2]);
    t.triangle(apx, apy, apz, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
  }
  setCol(t, col('#5a5f62'));
  t.beam(cx, y + 0.12, cz, cx + ax * 0.35, y + 0.12 + ay * 0.35, cz + az * 0.35, 0.025, 0.025);
}

/**
 * Downpipe at side position u from the eave gutter (yTop) to the ground, with a shoe and brackets; `oMax` = room
 * in front of the wall below 2.4 m (footprint rule).
 */
export function downpipe(g: Gen, sg: SideGeom, u: number, yTop: number, c?: THREE.Color, oMax = 0.2): void {
  if (!clutterOn) return;
  const t = g.trim;
  const pc = c ?? col(g.rng.pick(['#5a5f62', '#3a3f44', '#8a7a6a', '#6f4a3a', '#e9e6dd']));
  setCol(t, pc);
  const po = Math.min(0.09, oMax - 0.058);
  const px = sx(sg, u, po),
    pz = sz(sg, u, po);
  t.cylinder(px, pz, 0.05, 0.25, yTop, 6, false);
  // shoe at the bottom (kicks out over the gully)
  const so = Math.min(0.12, oMax - 0.055);
  t.beam(px, 0.32, pz, sx(sg, u, so), 0.08, sz(sg, u, so), 0.09, 0.09);
  setCol(t, shade(pc, 0.75));
  for (let y = 1.6; y < yTop - 0.4; y += 1.9) sideBox(t, sg, u - 0.07, u + 0.07, 0, Math.min(0.16, oMax - 0.01), y, y + 0.05, true);
  // hopper head under the gutter
  setCol(t, pc);
  sideBox(t, sg, u - 0.12, u + 0.12, 0.0, 0.2, yTop - 0.05, yTop + 0.18, true);
}

/** Half-round gutter along a side at the eave line (y), over [uA, uB], sticking out by o. */
export function gutter(g: Gen, sg: SideGeom, uA: number, uB: number, y: number, o: number, c?: THREE.Color): void {
  const t = g.trim;
  setCol(t, c ?? col('#5a5f62'));
  sideBox(t, sg, uA, uB, o - 0.08, o + 0.06, y - 0.12, y, true);
}

/**
 * Pair of louvred shutters at a window [u - ww/2, u + ww/2] × [y0, y1] in one of four states:
 * 0 open flat against the wall, 1 closed over the window, 2 one leaf closed, 3 ajar (angled out).
 */
export function shutterPair(g: Gen, sg: SideGeom, u: number, ww: number, y0: number, y1: number, c: THREE.Color, state: number, archTop = 0): void {
  const t = g.trim;
  const sw = ww * 0.5;
  const yt = y1 - archTop;
  const slats = shade(c, 0.7);
  const leaf = (side: -1 | 1, mode: 'open' | 'closed' | 'ajar') => {
    if (mode === 'open') {
      const a = side < 0 ? u - ww / 2 - sw - 0.05 : u + ww / 2 + 0.05;
      setCol(t, c);
      sideBox(t, sg, a, a + sw, 0, 0.05, y0 + 0.02, yt - 0.02);
      setCol(t, slats);
      for (let k = 1; k <= 3; k++) {
        const yy = y0 + ((yt - y0) * k) / 4;
        sideBox(t, sg, a + 0.02, a + sw - 0.02, 0.05, 0.065, yy - 0.025, yy + 0.025);
      }
    } else if (mode === 'closed') {
      const a = side < 0 ? u - ww / 2 : u;
      setCol(t, c);
      sideBox(t, sg, a, a + sw, 0.02, 0.07, y0 + 0.01, yt);
      setCol(t, slats);
      const n = Math.max(4, Math.round((yt - y0) / 0.09));
      for (let k = 1; k < n; k++) {
        const yy = y0 + ((yt - y0) * k) / n;
        sideBox(t, sg, a + 0.04, a + sw - 0.04, 0.07, 0.085, yy - 0.012, yy + 0.012);
      }
    } else {
      // ajar: hinged at the window edge, swung out by ~35–60°
      const ang = g.rng.range(0.6, 1.05);
      const hu = side < 0 ? u - ww / 2 : u + ww / 2;
      const ex = side * Math.cos(ang) * sw,
        eo = Math.sin(ang) * sw;
      const h0 = [sx(sg, hu, 0.04), sz(sg, hu, 0.04)];
      const h1 = [sx(sg, hu + ex, 0.04 + eo), sz(sg, hu + ex, 0.04 + eo)];
      setCol(t, c);
      // thin slab between the hinge and the free edge (two faces)
      t.quadAway(h0[0], y0 + 0.02, h0[1], h1[0], y0 + 0.02, h1[1], h1[0], yt - 0.02, h1[1], h0[0], yt - 0.02, h0[1], sx(sg, hu - side * 0.5, 0.9), (y0 + yt) / 2, sz(sg, hu - side * 0.5, 0.9));
      t.quadAway(h0[0], y0 + 0.02, h0[1], h1[0], y0 + 0.02, h1[1], h1[0], yt - 0.02, h1[1], h0[0], yt - 0.02, h0[1], sx(sg, hu + side * 0.5, -0.5), (y0 + yt) / 2, sz(sg, hu + side * 0.5, -0.5));
    }
  };
  switch (state) {
    case 1:
      leaf(-1, 'closed');
      leaf(1, 'closed');
      break;
    case 2:
      if (g.rng.chance(0.5)) {
        leaf(-1, 'closed');
        leaf(1, 'open');
      } else {
        leaf(-1, 'open');
        leaf(1, 'closed');
      }
      break;
    case 3:
      leaf(-1, g.rng.chance(0.5) ? 'ajar' : 'open');
      leaf(1, 'ajar');
      break;
    default:
      leaf(-1, 'open');
      leaf(1, 'open');
  }
}

/** Random shutter state: mostly open, some closed against the sun, some half, a few ajar. */
export function shutterState(g: Gen, sunny: boolean): number {
  return g.rng.weighted([0, 1, 2, 3], sunny ? [4.5, 2.5, 1.6, 1.2] : [6, 1.3, 1.2, 1]);
}

/** Juliet balcony: iron railing across a tall window + a couple of pots behind it. */
export function julietBalcony(g: Gen, sg: SideGeom, u: number, ww: number, y0: number): void {
  if (!clutterOn) return;
  const t = g.trim;
  setCol(t, col('#cfc8bb'));
  sideBox(t, sg, u - ww / 2 - 0.12, u + ww / 2 + 0.12, 0, 0.32, y0 - 0.1, y0, true);
  ironRail(g, sg, u - ww / 2 - 0.1, u + ww / 2 + 0.1, 0.29, y0, 0.85, col('#2c3035'), true);
  if (g.rng.chance(0.75)) {
    const c = g.rng.weighted([GREEN.GERANIUM, GREEN.PETUNIA, GREEN.IVY_HANG, GREEN.BOUGAIN], [3, 2, 1, 1]);
    if (c === GREEN.GERANIUM) {
      for (const du of [-ww * 0.25, ww * 0.25]) potPlant(g, sg, u + du, 0.16, y0, 0.8, GREEN.GERANIUM);
    } else {
      g.green.hang(sg, u - ww / 2, u + ww / 2, 0.33, y0 + 0.85, 0.35, c === GREEN.BOUGAIN ? 1.6 : 0.8, c, 0.08);
      potPlant(g, sg, u, 0.16, y0, 0.8, GREEN.SHRUB);
    }
  }
}

// ─────────────────────────────────────────────────────────── rooftops ──

/** local direction of world south (+Z) for the lot frame of builder `g.trim` */
function localSouth(g: Gen): [number, number] {
  const [cs, sn] = g.trim.getFrame();
  return [-sn, cs];
}

/**
 * Solar water heater (Mediterranean "dud shemesh"): tilted collector panel facing south and a white
 * horizontal storage tank on a steel frame behind it. Centre (x, z) local, roof at y.
 */
export function solarHeater(g: Gen, x: number, z: number, y: number): void {
  const t = g.trim;
  const [sx0, sz0] = localSouth(g);
  // across = perpendicular to south
  const ax = -sz0,
    az = sx0;
  const W = 1.0,
    L = 1.9,
    tilt = 0.75; // ~43°
  const P = (a: number, s: number, h: number) => [x + ax * a + sx0 * s, y + h, z + az * a + sz0 * s];
  // panel: low edge to the south
  const lo = 0.45,
    hi = lo + L * Math.sin(tilt);
  const s0 = 0.55,
    s1 = s0 - L * Math.cos(tilt);
  setCol(t, col('#1f2a3a'));
  const q = (p: number[][]) => t.quadAway(p[0][0], p[0][1], p[0][2], p[1][0], p[1][1], p[1][2], p[2][0], p[2][1], p[2][2], p[3][0], p[3][1], p[3][2], x - sx0 * 3, y - 2, z - sz0 * 3);
  q([P(-W / 2, s0, lo), P(W / 2, s0, lo), P(W / 2, s1, hi), P(-W / 2, s1, hi)]);
  // aluminium frame rim + back face
  setCol(t, col('#b9bfc3'));
  t.quadAway(...(P(-W / 2, s0, lo) as [number, number, number]), ...(P(W / 2, s0, lo) as [number, number, number]), ...(P(W / 2, s1, hi) as [number, number, number]), ...(P(-W / 2, s1, hi) as [number, number, number]), x + sx0 * 3, y + 6, z + sz0 * 3);
  // legs
  setCol(t, col('#8d9397'));
  for (const a of [-W / 2 + 0.05, W / 2 - 0.05]) {
    const b0 = P(a, s1, 0),
      b1 = P(a, s1, hi);
    t.beam(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], 0.04, 0.04);
    const c0 = P(a, s0, 0),
      c1 = P(a, s0, lo);
    t.beam(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], 0.04, 0.04);
  }
  // tank: horizontal cylinder across, above the top edge of the panel
  const tankY = hi + 0.32;
  const ts = s1 - 0.25;
  const e0 = P(-0.8, ts, tankY),
    e1 = P(0.8, ts, tankY);
  setCol(t, col(g.rng.pick(['#f1efe9', '#e9e6dd', '#d8d4ca'])));
  const n = 10,
    R = 0.3;
  // cylinder along the 'across' axis: rings of the (south, up) plane
  const ring = (c: number[]) => {
    const out: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push([c[0] + sx0 * Math.cos(a) * R, c[1] + Math.sin(a) * R, c[2] + sz0 * Math.cos(a) * R]);
    }
    return out;
  };
  const r0 = ring(e0),
    r1 = ring(e1);
  const mid = [(e0[0] + e1[0]) / 2, tankY, (e0[2] + e1[2]) / 2];
  for (let i = 0; i < n; i++) t.quadAway(r0[i][0], r0[i][1], r0[i][2], r1[i][0], r1[i][1], r1[i][2], r1[i + 1][0], r1[i + 1][1], r1[i + 1][2], r0[i + 1][0], r0[i + 1][1], r0[i + 1][2], mid[0], mid[1], mid[2]);
  for (const [rr, e] of [
    [r0, e0],
    [r1, e1],
  ] as [number[][], number[]][]) {
    for (let i = 0; i < n; i++) t.triangle(e[0], e[1], e[2], rr[i][0], rr[i][1], rr[i][2], rr[i + 1][0], rr[i + 1][1], rr[i + 1][2]);
    for (let i = 0; i < n; i++) t.triangle(e[0], e[1], e[2], rr[i + 1][0], rr[i + 1][1], rr[i + 1][2], rr[i][0], rr[i][1], rr[i][2]);
  }
  // tank stand
  setCol(t, col('#8d9397'));
  for (const a of [-0.6, 0.6]) {
    const b0 = P(a, ts, 0),
      b1 = P(a, ts, tankY - R);
    t.beam(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], 0.05, 0.05);
  }
  // pipe from the panel to the tank
  setCol(t, col('#2c3033'));
  const p0 = P(-W / 2 + 0.1, s1 + 0.02, hi - 0.05),
    p1 = P(-0.6, ts, tankY - 0.2);
  t.beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.035, 0.035);
}

/** Black / grey plastic water tank on a little stand. */
export function waterTankSmall(g: Gen, x: number, z: number, y: number): void {
  const t = g.trim;
  const r = g.rng;
  const R = r.range(0.45, 0.65),
    H = r.range(0.9, 1.3);
  setCol(t, col('#8d9397'));
  t.box(x - R, y, z - R, x + R, y + 0.35, z + R);
  setCol(t, col(r.pick(['#1e1f21', '#2c3033', '#5a6066', '#d8d4ca'])));
  t.cylinder(x, z, R, y + 0.35, y + 0.35 + H, 10, true, R * 0.96);
  t.cylinder(x, z, R * 0.3, y + 0.35 + H, y + 0.45 + H, 8, true);
}

/** TV aerial mast. */
export function aerial(g: Gen, x: number, z: number, y: number, h = 2.2): void {
  const t = g.trim;
  setCol(t, col('#b9bec2'));
  t.cylinder(x, z, 0.025, y, y + h, 4, false);
  for (let q = 0; q < 3; q++) t.box(x - 0.45 + q * 0.11, y + h - 0.5 + q * 0.14, z - 0.015, x + 0.45 - q * 0.11, y + h - 0.47 + q * 0.14, z + 0.015, 0b111111);
}

/**
 * Lived-in flat roof clutter inside local rect [x0,x1]×[z0,z1] at roof height y: solar water heaters,
 * water tanks, AC condensers, aerials, dishes, vent pipes; `keep` rects stay clear (hatches, terraces).
 */
export function roofClutter(g: Gen, x0: number, z0: number, x1: number, z1: number, y: number, opts: { heaters?: number; keep?: { x0: number; z0: number; x1: number; z1: number }[]; density?: number } = {}): void {
  if (!clutterOn) return;
  const r = g.rng;
  const keep = [...(opts.keep ?? [])];
  const free = (a: number, b: number, c: number, d: number) => a > x0 + 0.3 && b < x1 - 0.3 && c > z0 + 0.3 && d < z1 - 0.3 && keep.every((k) => b < k.x0 || a > k.x1 || d < k.z0 || c > k.z1);
  const place = (w: number, d: number, tries = 14): [number, number] | null => {
    for (let i = 0; i < tries; i++) {
      const cx = x0 + 0.4 + w / 2 + r.next() * Math.max(0.01, x1 - x0 - 0.8 - w),
        cz = z0 + 0.4 + d / 2 + r.next() * Math.max(0.01, z1 - z0 - 0.8 - d);
      if (free(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2)) {
        keep.push({ x0: cx - w / 2 - 0.25, x1: cx + w / 2 + 0.25, z0: cz - d / 2 - 0.25, z1: cz + d / 2 + 0.25 });
        return [cx, cz];
      }
    }
    return null;
  };
  const dens = opts.density ?? 1;
  const area = (x1 - x0) * (z1 - z0);
  const nH = opts.heaters ?? Math.max(0, Math.min(6, Math.round((area / 45) * r.range(0.5, 1.2))));
  for (let k = 0; k < nH; k++) {
    const p = place(2.1, 2.1);
    if (p) solarHeater(g, p[0], p[1], y);
  }
  const nT = Math.round(r.range(0, 2.4) * dens);
  for (let k = 0; k < nT; k++) {
    const p = place(1.3, 1.3);
    if (p) waterTankSmall(g, p[0], p[1], y);
  }
  // AC condensers, often in a little row
  const nA = Math.round(r.range(0.5, 3.5) * dens * Math.min(2, area / 60 + 0.5));
  for (let k = 0; k < nA; k++) {
    const p = place(0.9, 0.5);
    if (!p) continue;
    const t = g.trim;
    setCol(t, col('#3a3f44'));
    t.box(p[0] - 0.42, y, p[1] - 0.2, p[0] + 0.42, y + 0.06, p[1] + 0.2);
    setCol(t, col(r.chance(0.8) ? '#dcdcd6' : '#b9b9b2'));
    t.box(p[0] - 0.4, y + 0.06, p[1] - 0.17, p[0] + 0.4, y + 0.62, p[1] + 0.17);
    setCol(t, col('#3a3f44'));
    t.cylinder(p[0] - 0.08, p[1], 0.17, y + 0.62, y + 0.63, 8, true);
  }
  const nAe = Math.round(r.range(0, 2.2) * dens);
  for (let k = 0; k < nAe; k++) {
    const p = place(0.3, 0.3);
    if (p) aerial(g, p[0], p[1], y, r.range(1.6, 2.8));
  }
  // vent stacks
  const t = g.trim;
  setCol(t, col('#a9adb0'));
  for (let k = 0; k < Math.round(r.range(1, 3) * dens); k++) {
    const p = place(0.2, 0.2);
    if (p) t.cylinder(p[0], p[1], 0.08, y, y + r.range(0.5, 1.1), 6, true);
  }
}

/**
 * See-through iron railing along a side from uA to uB at offset o (balusters every ~0.12 m, thin), plus the two
 * returns back to the wall when `returns` is set. Top rail at y + h.
 */
export function ironRail(g: Gen, sg: SideGeom, uA: number, uB: number, o: number, y: number, h: number, c: THREE.Color, returns = true): void {
  const t = g.trim;
  setCol(t, c);
  const L = uB - uA;
  sideBox(t, sg, uA, uB, o - 0.025, o + 0.025, y + h - 0.05, y + h, true, true);
  sideBox(t, sg, uA, uB, o - 0.015, o + 0.015, y + 0.08, y + 0.11, true, true);
  const n = Math.max(2, Math.round(L / 0.12));
  for (let i = 0; i <= n; i++) {
    const u = uA + (L * i) / n;
    sideBox(t, sg, u - 0.011, u + 0.011, o - 0.011, o + 0.011, y, y + h - 0.05, false, true);
  }
  if (returns) {
    for (const u of [uA, uB]) {
      sideBox(t, sg, u - 0.02, u + 0.02, 0, o, y + h - 0.05, y + h, true, true);
      const m = Math.max(1, Math.round(o / 0.12));
      for (let k = 1; k < m; k++) sideBox(t, sg, u - 0.011, u + 0.011, (o * k) / m - 0.011, (o * k) / m + 0.011, y, y + h - 0.05, false, true);
    }
  }
}

/**
 * Climbing plant on a wall: ivy / bougainvillea / jasmine rising from the ground at u over width w to yTop
 * (ragged top, trailing tips), cards at offset ≤ oMax (stay inside the footprint below 2.4 m).
 */
export function climber(g: Gen, sg: SideGeom, u: number, w: number, yTop: number, oMax: number, cell: number = GREEN.IVY_WALL): void {
  if (!clutterOn) return;
  const r = g.rng;
  // keep the plant on this wall (no cards past the building corners) and inside the footprint (cards reach o + 0.1)
  w = Math.min(w, sg.L - 0.4);
  if (w < 0.5 || oMax < 0.1) return;
  u = Math.min(Math.max(u, 0.2 + w / 2 + 0.25), sg.L - 0.2 - w / 2 - 0.25);
  const o = Math.max(0.012, Math.min(oMax - 0.11, 0.07));
  // main mass: narrower at the base (a trunk), widening upward
  const base = Math.min(0.5, w * 0.35);
  g.green.wall(sg, u - base / 2, u + base / 2, 0.05, Math.min(1.4, yTop), o, cell, 0.75, 0.9);
  if (yTop > 1.4) {
    const rows = Math.max(1, Math.floor((yTop - 1.2) / 1.0));
    for (let k = 0; k < rows; k++) {
      const y0 = 1.2 + k * 1.0;
      const ww = Math.min(w, base + (w - base) * Math.min(1, (k + 1) / 2)) * r.range(0.85, 1.1);
      const cu = u + r.range(-0.2, 0.2);
      g.green.wall(sg, cu - ww / 2, cu + ww / 2, y0, y0 + 1.25, o, cell, r.range(1.0, 1.4), r.range(0.9, 1.05));
    }
  }
  // trailing tips over the top edge
  const tip = cell === GREEN.IVY_WALL ? GREEN.IVY_HANG : cell === GREEN.JASMINE ? GREEN.IVY_HANG : GREEN.BOUGAIN;
  g.green.hang(sg, u - w * 0.45, u + w * 0.45, o + 0.02, yTop + 0.35, 0.4, 0.9, tip, 0.03, 1, o + 0.08 < oMax ? 0.3 : 2.45);
}

/**
 * Cables run along a facade (power / telecom): a slightly sagging black cable on little brackets at height y
 * over [uA, uB], sometimes dropping down to a grey junction box. Kept above 2.4 m.
 */
export function facadeCable(g: Gen, sg: SideGeom, uA: number, uB: number, y: number): void {
  if (!clutterOn) return;
  const t = g.trim;
  const r = g.rng;
  y = Math.max(y, 2.5);
  const o = 0.05;
  setCol(t, col('#1c1d1f'));
  const n = Math.max(1, Math.round((uB - uA) / 1.6));
  let pu = uA,
    py = y;
  for (let i = 1; i <= n; i++) {
    const u = uA + ((uB - uA) * i) / n;
    const yy = y + (r.next() - 0.5) * 0.04;
    // two segments with a little sag between the brackets
    const mu = (pu + u) / 2,
      my = (py + yy) / 2 - 0.035;
    t.beam(sx(sg, pu, o), py, sz(sg, pu, o), sx(sg, mu, o), my, sz(sg, mu, o), 0.016, 0.016);
    t.beam(sx(sg, mu, o), my, sz(sg, mu, o), sx(sg, u, o), yy, sz(sg, u, o), 0.016, 0.016);
    sideBox(t, sg, u - 0.015, u + 0.015, 0, o + 0.02, yy - 0.03, yy + 0.02, true);
    pu = u;
    py = yy;
  }
  if (r.chance(0.45)) {
    const u = uA + (uB - uA) * r.range(0.15, 0.85);
    const yb = Math.max(2.5, y - r.range(0.5, 1.1));
    t.beam(sx(sg, u, o), y, sz(sg, u, o), sx(sg, u, o), yb + 0.3, sz(sg, u, o), 0.016, 0.016);
    setCol(t, col(r.pick(['#9ea3a6', '#c9c6bd', '#6f7579'])));
    sideBox(t, sg, u - 0.16, u + 0.16, 0, 0.12, yb - 0.1, yb + 0.3, true);
  }
}
