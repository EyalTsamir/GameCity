// Rooftop plant for towers and offices — what a real high roof carries instead of a grey cuboid: a lift / stair
// room with a door, louvres and a ladder; air-handling units with fan shrouds and grilles, ducts on stands running
// into the plant room; condensers in rows; a louvred cooling tower; exhaust flues with rain caps; cable trays; a
// guard rail behind the parapet; on glass towers a slatted plant screen. The mix varies with the tower type.
//
// ?noroofplant = the previous simple rooftop (A/B); quality low builds the simple one as well.

import * as THREE from 'three';
import type { Builder } from './mesh';
import { Rng } from '../../core/rng';
import { Gen, LRect, setCol, shade, col, railing } from './gen';
import { RoofPlacer, woodTank, solarRows, southLocal } from './massing';

export type PlantKind = 'glass' | 'panel' | 'masonry';

let plantOn = true;
/** ?noroofplant / quality low: the simple rooftop (towers.ts) */
export function setRoofPlant(on: boolean): void {
  plantOn = on;
}
export function roofPlantOn(): boolean {
  return plantOn;
}

const STEEL = '#8c9296';
const DARK = '#2b2f33';

/** Lift / stair room: box, louvre bands, door with a canopy, ladder, roof slab with a lip, vents on top. */
function liftRoom(t: Builder, x0: number, z0: number, x1: number, z1: number, y: number, h: number, wall: THREE.Color, rng: Rng, cornice: boolean): void {
  setCol(t, wall);
  t.box(x0, y, z0, x1, y + h, z1);
  // louvre bands on the two short sides
  setCol(t, shade(wall, 0.6));
  const lz0 = z0 + (z1 - z0) * 0.25,
    lz1 = z1 - (z1 - z0) * 0.25;
  for (let k = 0; k < 5; k++) {
    const yy = y + h * 0.45 + k * 0.2;
    t.box(x1, yy, lz0, x1 + 0.06, yy + 0.1, lz1, 0b110101);
    t.box(x0 - 0.06, yy, lz0, x0, yy + 0.1, lz1, 0b110110);
  }
  // steel door with frame and a small canopy on the +z face
  const dx = x0 + Math.min(0.6, (x1 - x0) * 0.2);
  setCol(t, shade(wall, 0.75));
  t.box(dx - 0.08, y, z1, dx + 1.08, y + 2.25, z1 + 0.05, 0b110101 | 16);
  setCol(t, col('#4d5a63'));
  t.box(dx, y, z1 + 0.02, dx + 1.0, y + 2.15, z1 + 0.07, 0b110101 | 16);
  setCol(t, col(DARK));
  t.box(dx + 0.78, y + 1.0, z1 + 0.07, dx + 0.9, y + 1.05, z1 + 0.11, 0b111111);
  setCol(t, col(STEEL));
  t.box(dx - 0.25, y + 2.35, z1, dx + 1.25, y + 2.42, z1 + 0.7, 0b111111);
  // ladder up the -z face to the roof of the room
  setCol(t, col(STEEL));
  const lx = x1 - 0.6;
  t.box(lx - 0.22, y, z0 - 0.18, lx - 0.18, y + h + 0.9, z0 - 0.14, 0b110011);
  t.box(lx + 0.18, y, z0 - 0.18, lx + 0.22, y + h + 0.9, z0 - 0.14, 0b110011);
  for (let yy = y + 0.3; yy < y + h + 0.6; yy += 0.45) t.box(lx - 0.18, yy, z0 - 0.17, lx + 0.18, yy + 0.03, z0 - 0.15, 0b110011);
  // roof slab with a lip (or a moulded cornice on masonry towers)
  setCol(t, shade(wall, cornice ? 1.08 : 0.82));
  const o = cornice ? 0.22 : 0.1;
  t.box(x0 - o, y + h, z0 - o, x1 + o, y + h + (cornice ? 0.28 : 0.15), z1 + o);
  if (cornice) {
    setCol(t, shade(wall, 0.95));
    t.box(x0 - 0.1, y + h - 0.25, z0 - 0.1, x1 + 0.1, y + h, z1 + 0.1);
  }
  // on top: a vent or two and a small extract fan
  const yt = y + h + (cornice ? 0.28 : 0.15);
  setCol(t, col('#a3a9ad'));
  const vx = x0 + (x1 - x0) * rng.range(0.25, 0.45),
    vz = (z0 + z1) / 2;
  t.cylinder(vx, vz, 0.16, yt, yt + 0.6, 8, false);
  t.cone(vx, vz, 0.3, yt + 0.55, yt + 0.8, 8);
  fanBox(t, x0 + (x1 - x0) * 0.72, vz, yt, 0.9, 0.9, 1);
}

/** A fan shroud with a dark recessed disc and a cross guard (centre cx,cz on top surface y). */
function fan(t: Builder, cx: number, cz: number, y: number, r: number): void {
  setCol(t, col('#b9bec1'));
  t.cylinder(cx, cz, r, y, y + 0.22, 12, false);
  setCol(t, col('#1d2124'));
  t.cylinder(cx, cz, r * 0.93, y, y + 0.16, 12, true);
  setCol(t, col('#6d7377'));
  t.box(cx - r * 0.95, y + 0.17, cz - 0.025, cx + r * 0.95, y + 0.2, cz + 0.025, 0b110111);
  t.box(cx - 0.025, y + 0.17, cz - r * 0.95, cx + 0.025, y + 0.2, cz + r * 0.95, 0b110111);
  t.cylinder(cx, cz, 0.07, y + 0.16, y + 0.21, 6, true);
}

/** Condenser / air-handling unit: dark base frame, light casing, louvre stripes on the long faces, fans on top. */
function fanBox(t: Builder, cx: number, cz: number, y: number, w: number, d: number, nFans: number): void {
  const x0 = cx - w / 2,
    x1 = cx + w / 2,
    z0 = cz - d / 2,
    z1 = cz + d / 2;
  setCol(t, col(DARK));
  t.box(x0 + 0.05, y, z0 + 0.05, x1 - 0.05, y + 0.15, z1 - 0.05, 0b110111);
  const h = Math.max(0.8, Math.min(1.5, d * 0.85));
  setCol(t, col('#d3d6d6'));
  t.box(x0, y + 0.15, z0, x1, y + 0.15 + h, z1);
  setCol(t, col('#9da3a6'));
  for (let k = 0; k < 4; k++) {
    const yy = y + 0.3 + k * ((h - 0.3) / 4);
    t.box(x0 + 0.1, yy, z1, x1 - 0.1, yy + 0.06, z1 + 0.025, 0b110101 | 16);
    t.box(x0 + 0.1, yy, z0 - 0.025, x1 - 0.1, yy + 0.06, z0, 0b100111);
  }
  const r = Math.min(d * 0.38, (w / nFans) * 0.4);
  for (let k = 0; k < nFans; k++) fan(t, x0 + ((k + 0.5) * w) / nFans, cz, y + 0.15 + h, r);
}

/** Rectangular duct along local points at height y (with stands every ~2 m) ending in a drop into the roof. */
function duct(t: Builder, pts: number[][], y: number, roofY: number, w: number): void {
  setCol(t, col('#c4c8c9'));
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[i + 1];
    t.beam(ax, y, az, bx, y, bz, w, w * 0.75);
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(L / 2);
    setCol(t, col(DARK));
    for (let k = 1; k <= n; k++) {
      const f = k / (n + 1);
      const px = ax + (bx - ax) * f,
        pz = az + (bz - az) * f;
      t.box(px - 0.04, roofY, pz - 0.04, px + 0.04, y - w * 0.37, pz + 0.04, 0b110011);
    }
    setCol(t, col('#c4c8c9'));
    // flange rings at the joints
    t.beam(bx - (bx - ax) / (L || 1) * 0.04, y, bz - (bz - az) / (L || 1) * 0.04, bx, y, bz, w + 0.06, w * 0.75 + 0.06);
  }
  const [ex, ez] = pts[pts.length - 1];
  t.beam(ex, roofY, ez, ex, y + w * 0.37, ez, w, w * 0.75);
}

/** Louvred cooling-tower cell(s) with a fan stack on top. */
function coolingTower(t: Builder, cx: number, cz: number, y: number, s: number, cells: number): void {
  const w = s * cells;
  const x0 = cx - w / 2,
    x1 = cx + w / 2,
    z0 = cz - s / 2,
    z1 = cz + s / 2;
  const h = s * 0.95;
  setCol(t, col(DARK));
  t.box(x0 + 0.1, y, z0 + 0.1, x1 - 0.1, y + 0.3, z1 - 0.1, 0b110111);
  setCol(t, col('#d9dcd8'));
  t.box(x0, y + 0.3, z0, x1, y + h, z1);
  // louvre slats (air intake) on all four faces of the lower half
  setCol(t, col('#7d8588'));
  for (let k = 0; k < 5; k++) {
    const yy = y + 0.4 + k * 0.17;
    t.box(x0 - 0.04, yy, z0 - 0.04, x1 + 0.04, yy + 0.08, z1 + 0.04, 0b110011 | 32 | 16);
  }
  setCol(t, col('#c6cac7'));
  t.box(x0 - 0.08, y + h, z0 - 0.08, x1 + 0.08, y + h + 0.1, z1 + 0.08);
  for (let k = 0; k < cells; k++) {
    const fx = x0 + (k + 0.5) * s;
    setCol(t, col('#cfd2cf'));
    t.cylinder(fx, cz, s * 0.36, y + h + 0.1, y + h + 0.75, 14, false, s * 0.42);
    setCol(t, col('#1b1e20'));
    t.cylinder(fx, cz, s * 0.39, y + h + 0.1, y + h + 0.68, 14, true);
    setCol(t, col('#6d7377'));
    t.box(fx - s * 0.4, y + h + 0.69, cz - 0.03, fx + s * 0.4, y + h + 0.72, cz + 0.03, 0b110111);
  }
}

/** Exhaust flues with rain caps, tied together. */
function flues(t: Builder, cx: number, cz: number, y: number, n: number, h: number): void {
  for (let k = 0; k < n; k++) {
    const fx = cx + (k - (n - 1) / 2) * 0.6;
    const r = 0.15 + (k % 2) * 0.06;
    setCol(t, col('#9ea4a7'));
    t.cylinder(fx, cz, r, y, y + h - k * 0.3, 8, false);
    setCol(t, col('#7c8285'));
    t.cylinder(fx, cz, 0.02, y + h - k * 0.3, y + h - k * 0.3 + 0.18, 4, false);
    t.cone(fx, cz, r + 0.12, y + h - k * 0.3 + 0.12, y + h - k * 0.3 + 0.32, 8);
  }
  if (n > 1) {
    setCol(t, col(DARK));
    t.box(cx - (n - 1) * 0.3 - 0.2, y + h * 0.55, cz - 0.03, cx + (n - 1) * 0.3 + 0.2, y + h * 0.55 + 0.05, cz + 0.03, 0b111111);
  }
}

/** Cable tray on short legs between two points. */
function cableTray(t: Builder, ax: number, az: number, bx: number, bz: number, y: number): void {
  setCol(t, col('#7f8689'));
  t.beam(ax, y + 0.35, az, bx, y + 0.35, bz, 0.3, 0.08);
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.floor(L / 1.8));
  setCol(t, col(DARK));
  for (let k = 0; k <= n; k++) {
    const px = ax + ((bx - ax) * k) / n,
      pz = az + ((bz - az) * k) / n;
    t.box(px - 0.03, y, pz - 0.03, px + 0.03, y + 0.31, pz + 0.03, 0b110011);
  }
}

/** Slatted plant screen around a rect (horizontal louvres between posts). */
function plantScreen(t: Builder, x0: number, z0: number, x1: number, z1: number, y: number, h: number, c: THREE.Color): void {
  setCol(t, shade(c, 0.7));
  for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) t.box(px - 0.08, y, pz - 0.08, px + 0.08, y + h + 0.05, pz + 0.08, 0b110111);
  const nS = Math.max(4, Math.round(h / 0.32));
  setCol(t, c);
  for (let k = 0; k < nS; k++) {
    const yy = y + 0.25 + (k * (h - 0.3)) / nS;
    t.box(x0, yy, z0 - 0.03, x1, yy + 0.16, z0 + 0.03, 0b111111);
    t.box(x0, yy, z1 - 0.03, x1, yy + 0.16, z1 + 0.03, 0b111111);
    t.box(x0 - 0.03, yy, z0, x0 + 0.03, yy + 0.16, z1, 0b110011);
    t.box(x1 - 0.03, yy, z0, x1 + 0.03, yy + 0.16, z1, 0b110011);
  }
}

export interface PlantSpec {
  kind: PlantKind;
  wall: THREE.Color;
  /** the scheme wants a timber water tank */
  tank: boolean;
  /** curtain wall: window-cleaning gantry */
  curtain: boolean;
  H: number;
}

/**
 * Plant on a tower roof rect r at height y. Returns the lift room box (for the antenna mast) — the caller adds
 * masts / aviation lights / the cleaning gantry.
 */
export function towerPlant(g: Gen, r: LRect, y: number, s: PlantSpec): { x0: number; z0: number; x1: number; z1: number; h: number } {
  const t = g.trim;
  const rng = new Rng(((g.lot.seed * 40503) ^ 0x2c1b3c6d) >>> 0 || 3);
  const w = r.x1 - r.x0,
    d = r.z1 - r.z0;
  // guard rail behind the parapet
  const gi = 0.35;
  for (const [ax, az, bx, bz] of [[r.x0 + gi, r.z1 - gi, r.x1 - gi, r.z1 - gi], [r.x1 - gi, r.z0 + gi, r.x1 - gi, r.z1 - gi], [r.x0 + gi, r.z0 + gi, r.x1 - gi, r.z0 + gi], [r.x0 + gi, r.z0 + gi, r.x0 + gi, r.z1 - gi]])
    railing(t, ax, az, bx, bz, y, 1.05, col('#c9cdd0'), 1.8, 1);
  // lift / stair room
  const pw = Math.min(w * 0.36, Math.max(3.4, w * 0.3)),
    pd = Math.min(d * 0.34, Math.max(3.0, d * 0.26));
  const px = r.x0 + w * rng.range(0.3, 0.7),
    pz = r.z0 + d * rng.range(0.32, 0.68);
  const bx0 = Math.max(r.x0 + 1, px - pw / 2),
    bx1 = Math.min(r.x1 - 1, px + pw / 2),
    bz0 = Math.max(r.z0 + 1, pz - pd / 2),
    bz1 = Math.min(r.z1 - 1.6, pz + pd / 2);
  const ph = s.kind === 'masonry' ? rng.range(3.4, 4.2) : rng.range(3.0, 3.8);
  liftRoom(t, bx0, bz0, bx1, bz1, y, ph, s.kind === 'glass' ? shade(s.wall, 0.92) : s.kind === 'masonry' ? shade(s.wall, 1.02) : col('#c3c0b8'), rng, s.kind === 'masonry');
  const pl = new RoofPlacer({ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x1 - 0.5, z1: r.z1 - 0.5 }, rng, [
    { x0: bx0 - 1.0, x1: bx1 + 1.0, z0: bz0 - 0.9, z1: bz1 + 1.8 },
    // keep a strip along one edge for the cleaning gantry rails
    ...(s.curtain ? [{ x0: r.x0, x1: r.x0 + 2.2, z0: r.z0, z1: r.z1 }] : []),
  ]);
  const units: number[][] = [];
  if (s.kind === 'glass') {
    // screened plant yard: AHUs inside a slatted screen
    const sw = Math.min(w * 0.42, 7.5),
      sd = Math.min(d * 0.4, 5.5);
    const p = pl.place(sw + 0.4, sd + 0.4, 18, 0.5);
    if (p) {
      plantScreen(t, p[0] - sw / 2, p[1] - sd / 2, p[0] + sw / 2, p[1] + sd / 2, y, 2.4, shade(s.wall, 0.85));
      const n = sw > 5 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const ux = p[0] - sw / 2 + ((k + 0.5) * sw) / n;
        fanBox(t, ux, p[1], y, Math.min(2.6, sw / n - 0.6), Math.min(1.6, sd - 0.8), 2);
        units.push([ux, p[1] - Math.min(1.6, sd - 0.8) / 2]);
      }
    }
    if (rng.chance(0.6)) {
      const q = pl.place(2.6, 2.6, 10);
      if (q) coolingTower(t, q[0], q[1], y, 2.2, 1);
    }
  } else if (s.kind === 'panel') {
    // air-handling units with ducts into the plant room, condensers in a row, a cable tray, flues
    const nA = 1 + rng.int(1, 2);
    for (let k = 0; k < nA; k++) {
      const aw = rng.range(2.8, 3.8),
        ad = rng.range(1.4, 1.8);
      const p = pl.place(aw, ad, 14, 0.6);
      if (!p) continue;
      fanBox(t, p[0], p[1], y, aw, ad, 2);
      units.push([p[0], p[1] + (p[1] < (bz0 + bz1) / 2 ? ad / 2 : -ad / 2)]);
    }
    const row = pl.place(4.2, 1.1, 12, 0.4);
    if (row) for (let k = 0; k < 3; k++) fanBox(t, row[0] - 1.4 + k * 1.4, row[1], y, 1.15, 0.95, 1);
    if (rng.chance(0.55)) {
      const q = pl.place(2.4 * 2 + 0.3, 2.7, 10);
      if (q) coolingTower(t, q[0], q[1], y, 2.4, 2);
    }
    if (rng.chance(0.4)) {
      const sl = southLocal(g);
      const q = pl.place(5, 3.4, 8, 0.3);
      if (q) solarRows(t, q[0] - 2.5, q[1] - 1.7, q[0] + 2.5, q[1] + 1.7, y, sl.alongX, sl.sign);
    }
  } else {
    // masonry: timber tank on a stand, a cooling tower, flues, a couple of condensers
    if (s.tank || rng.chance(0.5)) {
      const q = pl.place(3.0, 3.0, 14, 0.4);
      if (q) woodTank(t, q[0], q[1], y, rng.range(1.0, 1.3), rng.range(2.0, 2.6), rng.range(1.8, 2.6));
    }
    if (rng.chance(0.6)) {
      const q = pl.place(2.6, 2.6, 10);
      if (q) coolingTower(t, q[0], q[1], y, 2.1, 1);
    }
    const nC = rng.int(1, 3);
    for (let k = 0; k < nC; k++) {
      const q = pl.place(1.3, 1.0, 8, 0.3);
      if (q) {
        fanBox(t, q[0], q[1], y, 1.2, 0.95, 1);
        units.push([q[0], q[1] - 0.48]);
      }
    }
  }
  // ducts from the units to the plant room wall
  for (const [ux, uz] of units.slice(0, 2)) {
    const wallZ = uz < bz0 ? bz0 : uz > bz1 ? bz1 : null;
    const wx = Math.min(bx1 - 0.6, Math.max(bx0 + 0.6, ux));
    if (wallZ === null || Math.abs(uz - wallZ) < 0.8) continue;
    duct(t, [[ux, uz], [ux, (uz + wallZ) / 2], [wx, (uz + wallZ) / 2], [wx, wallZ + (wallZ === bz0 ? -0.05 : 0.05)]], y + 1.1, y, 0.55);
  }
  // flues and a cable tray from the plant room to the far edge
  const f = pl.place(1.8, 0.8, 8, 0.3);
  if (f) flues(t, f[0], f[1], y, s.kind === 'masonry' ? 3 : 2, s.kind === 'masonry' ? 3.2 : 2.6);
  const tx = bx1 + 0.2,
    tz = (bz0 + bz1) / 2;
  const ex = Math.min(r.x1 - 0.9, tx + w * 0.3);
  if (ex - tx > 1.5 && pl.free(tx, ex, tz - 0.2, tz + 0.2)) cableTray(t, tx, tz, ex, tz, y);
  return { x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: ph + (s.kind === 'masonry' ? 0.28 : 0.15) };
}

/**
 * The roof itself (?noroofscape): membrane sheets laid in strips with a patch or two, concrete pavers from the plant
 * room door to the edge and along the plant, cast drain outlets with their stain, lightning conductors on the corners.
 * Membrane and pavers lie 3 cm / 6 cm over the roof slab.
 */
export function roofFloor(g: Gen, r: LRect, y: number, room: { x0: number; z0: number; x1: number; z1: number }): void {
  const t = g.trim;
  const rng = new Rng(((g.lot.seed * 2654435) ^ 0x51ed27) >>> 0 || 7);
  const base = rng.pick(['#7f7e79', '#8a8880', '#6f706e', '#918d84']);
  const w = r.x1 - r.x0;
  const yM = y + 0.05;
  const sheet = 1.9;
  const n = Math.max(1, Math.round(w / sheet));
  for (let i = 0; i < n; i++) {
    const x0 = r.x0 + (i * w) / n,
      x1 = r.x0 + ((i + 1) * w) / n - 0.025;
    setCol(t, shade(col(base), 0.92 + rng.next() * 0.16));
    t.hrect(x0, r.z0, x1, r.z1, yM);
  }
  // patches: somebody repaired it
  const nPatch = rng.int(1, 4);
  for (let k = 0; k < nPatch; k++) {
    const pw = rng.range(0.8, 2.2),
      pd = rng.range(0.6, 1.8);
    const px = r.x0 + rng.next() * Math.max(0.1, w - pw),
      pz = r.z0 + rng.next() * Math.max(0.1, r.z1 - r.z0 - pd);
    setCol(t, shade(col(base), rng.chance(0.5) ? 0.68 : 1.14));
    t.hrect(px, pz, px + pw, Math.min(r.z1, pz + pd), yM + 0.012);
  }
  // pavers from the door of the plant room towards the street edge, and along it
  const paver = (x: number, z: number, along: boolean) => {
    setCol(t, shade(col('#b2aea4'), 0.9 + rng.next() * 0.16));
    const hw = along ? 0.32 : 0.44,
      hd = along ? 0.44 : 0.32;
    t.box(x - hw, y + 0.05, z - hd, x + hw, y + 0.09, z + hd);
  };
  const dx = room.x0 + 0.55;
  for (let z = room.z1 + 0.4; z < r.z1 - 0.7; z += 0.72) paver(dx, z, false);
  for (let x = dx + 0.8; x < r.x1 - 0.8; x += 0.72) paver(x, Math.min(r.z1 - 0.9, room.z1 + 1.1), true);
  // drains with a dark stain round them
  for (const [ex, ez] of [[r.x0 + 0.75, r.z0 + 0.75], [r.x1 - 0.75, r.z1 - 0.75], [r.x1 - 0.75, r.z0 + 0.75]]) {
    setCol(t, shade(col(base), 0.62));
    t.hrect(ex - 0.55, ez - 0.55, ex + 0.55, ez + 0.55, yM + 0.012);
    setCol(t, col('#26282a'));
    t.cylinder(ex, ez, 0.14, yM, yM + 0.08, 8, true, 0.1);
  }
  // lightning conductors on the corners
  setCol(t, col('#b98a58'));
  for (const [ex, ez] of [[r.x0 + 0.2, r.z0 + 0.2], [r.x1 - 0.2, r.z0 + 0.2], [r.x1 - 0.2, r.z1 - 0.2], [r.x0 + 0.2, r.z1 - 0.2]]) t.cylinder(ex, ez, 0.018, y + 1.0, y + 2.3, 4, false);
}
