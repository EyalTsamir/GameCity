// Shared generator context + facade helpers used by every building kind.
//
// Local frame per building (see mesh.ts): x across the street facade, +z = front
// (street side), y up. A footprint of W (along the front) × D (depth) is centred
// on the origin. Sides: 0 front (+z), 1 right (+x), 2 back (−z), 3 left (−x);
// along each side `u` runs left → right as seen from outside.

import * as THREE from 'three';
import type { Lot } from '../../core/plan';
import type { Rng } from '../../core/rng';
import { Builder } from './mesh';
import { SignAtlas, SignRect } from './signs';
import { LIGHT_MODE, ROOFPAT, WIN } from './materials';

export type Side = 0 | 1 | 2 | 3;
export const FRONT: Side = 0,
  RIGHT: Side = 1,
  BACK: Side = 2,
  LEFT: Side = 3;

export interface LRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface SideGeom {
  x0: number;
  z0: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  L: number;
}

export interface Interval {
  a: number;
  b: number;
  /** height of the neighbour that covers this part (0 = exposed) */
  h: number;
}

export interface LocalDoor {
  side: Side;
  /** position along the footprint side */
  u: number;
}

export interface Gen {
  lot: Lot;
  rng: Rng;
  /** small stable seed for shaders (0..997) */
  seed: number;
  W: number;
  D: number;
  shell: Builder;
  trim: Builder;
  lights: Builder;
  signs: Builder;
  atlas: SignAtlas;
  /** neighbour coverage along each footprint side (sorted, merged) */
  cover: Interval[][];
  doors: LocalDoor[];
  /** neighbour-aware facade colour picked for this lot */
  wallColor: THREE.Color;
  /** count of door assemblies emitted (for invariants) */
  doorsBuilt: number;
  /** aviation lights etc. — notes for stats */
  notes: string[];
  /** houses: side of the footprint that faces the driveway (if any) */
  driveSide?: Side;
}

// ─────────────────────────────────────────────────────────── colours ──

const _c = new THREE.Color();
export function col(hex: THREE.ColorRepresentation): THREE.Color {
  return new THREE.Color(hex);
}
export function shade(c: THREE.Color, k: number): THREE.Color {
  return c.clone().multiplyScalar(k);
}
export function mixCol(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, t);
}
export function jit(hex: THREE.ColorRepresentation, rng: Rng, amt = 0.05): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + (rng.next() - 0.5) * amt * 0.25 + 1) % 1, THREE.MathUtils.clamp(hsl.s + (rng.next() - 0.5) * amt, 0, 1), THREE.MathUtils.clamp(hsl.l + (rng.next() - 0.5) * amt, 0, 1));
  return c;
}
export function setCol(b: Builder, c: THREE.ColorRepresentation): void {
  if (c instanceof THREE.Color) b.setRGB(c.r, c.g, c.b);
  else {
    _c.set(c);
    b.setRGB(_c.r, _c.g, _c.b);
  }
}

// ──────────────────────────────────────────────────────────── sides ──

export function sideGeom(r: LRect, s: Side): SideGeom {
  switch (s) {
    case 0:
      return { x0: r.x0, z0: r.z1, tx: 1, tz: 0, nx: 0, nz: 1, L: r.x1 - r.x0 };
    case 1:
      return { x0: r.x1, z0: r.z1, tx: 0, tz: -1, nx: 1, nz: 0, L: r.z1 - r.z0 };
    case 2:
      return { x0: r.x1, z0: r.z0, tx: -1, tz: 0, nx: 0, nz: -1, L: r.x1 - r.x0 };
    default:
      return { x0: r.x0, z0: r.z0, tx: 0, tz: 1, nx: -1, nz: 0, L: r.z1 - r.z0 };
  }
}

export function sx(sg: SideGeom, u: number, o: number): number {
  return sg.x0 + sg.tx * u + sg.nx * o;
}
export function sz(sg: SideGeom, u: number, o: number): number {
  return sg.z0 + sg.tz * u + sg.nz * o;
}

/** Box aligned with a side: u range, outward offset range o0..o1 (o1 > o0), heights. Back face skipped. */
export function sideBox(b: Builder, sg: SideGeom, uA: number, uB: number, o0: number, o1: number, y0: number, y1: number, bottom = false, back = false): void {
  const ax = sx(sg, uA, o0),
    az = sz(sg, uA, o0),
    bx = sx(sg, uB, o1),
    bz = sz(sg, uB, o1);
  let mask = 0b111111;
  if (!bottom) mask &= ~8;
  if (!back) {
    if (sg.nz > 0.5) mask &= ~32;
    else if (sg.nz < -0.5) mask &= ~16;
    else if (sg.nx > 0.5) mask &= ~2;
    else mask &= ~1;
  }
  b.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), mask);
}

/** Quad parallel to a side at outward offset o (facing outward). */
export function sideQuad(b: Builder, sg: SideGeom, uA: number, uB: number, o: number, y0: number, y1: number, u0 = 0, gu = 0, gw = 1, gv = 0, gh = 1): void {
  b.wall(sx(sg, uA, o), sz(sg, uA, o), sx(sg, uB, o), sz(sg, uB, o), y0, y1, u0 + uA, gu, gw, gv, gh);
}

// ──────────────────────────────────────────────────────── window grid ──

export interface Grid {
  /** u of the left edge of cell 0 */
  u0: number;
  cw: number;
  n: number;
  /** y of the bottom of row 0 */
  v0: number;
  ch: number;
  m: number;
  wx0: number;
  wx1: number;
  wy0: number;
  wy1: number;
}

export interface GridOpts {
  /** target cell width */
  spacing: number;
  winW: number;
  winH: number;
  /** window bottom above the row bottom */
  sill: number;
  margin?: number;
  cols?: number;
  minCols?: number;
  maxCols?: number;
}

export function makeGrid(uA: number, uB: number, v0: number, ch: number, m: number, o: GridOpts): Grid {
  const margin = o.margin ?? 0.5;
  const len = uB - uA - 2 * margin;
  let n = o.cols ?? Math.round(len / o.spacing);
  if (o.minCols !== undefined) n = Math.max(n, o.minCols);
  if (o.maxCols !== undefined) n = Math.min(n, o.maxCols);
  if (len < o.winW * 0.7 || n < 1) n = 0;
  const cw = n > 0 ? len / n : 1;
  const ww = Math.min(o.winW, cw - 0.25);
  const wx0 = (cw - ww) / 2;
  const wy0 = o.sill;
  const wy1 = Math.min(o.sill + o.winH, ch - 0.12);
  return { u0: uA + margin, cw, n, v0, ch, m: n > 0 ? m : 0, wx0, wx1: wx0 + ww, wy0, wy1 };
}

/** Centre u of window column i. */
export function gridU(gr: Grid, i: number): number {
  return gr.u0 + (i + 0.5) * gr.cw;
}
/** Bottom / top y of the window in row j. */
export function gridY0(gr: Grid, j: number): number {
  return gr.v0 + j * gr.ch + gr.wy0;
}
export function gridY1(gr: Grid, j: number): number {
  return gr.v0 + j * gr.ch + gr.wy1;
}

export interface WallLook {
  color: THREE.Color;
  pattern: number;
  frame: number;
  glass: number;
  style: number;
  profile: number;
  seed: number;
}

/** Set the shell builder's facade attributes for a wall (grid may be null = no windows). */
export function setWallAttrs(b: Builder, gr: Grid | null, look: WallLook | { color: THREE.Color; pattern: number; seed: number }): void {
  setCol(b, look.color);
  const w = look as WallLook;
  if (gr && gr.n > 0 && gr.m > 0) {
    b.A[0] = gr.wx0;
    b.A[1] = gr.wx1;
    b.A[2] = gr.wy0;
    b.A[3] = gr.wy1;
    b.B[0] = gr.n;
    b.B[1] = gr.m;
    b.B[3] = (w.style ?? 0) * 8 + (w.profile ?? 0);
    b.C[0] = gr.cw;
    b.C[1] = gr.ch;
    b.C[3] = (w.frame ?? 0) + 8 * (w.glass ?? 0);
  } else {
    b.A[0] = b.A[1] = b.A[2] = b.A[3] = 0;
    b.B[0] = 0;
    b.B[1] = 0;
    b.B[3] = 0;
    b.C[0] = 1;
    b.C[1] = 1;
    b.C[3] = 0;
  }
  b.B[2] = look.seed;
  b.C[2] = look.pattern;
}

/** Vertical wall between two arbitrary local points (p0 left, p1 right seen from outside). */
export function wallSeg(b: Builder, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, gr: Grid | null, look: WallLook | { color: THREE.Color; pattern: number; seed: number }): void {
  if (y1 - y0 < 1e-3 || Math.hypot(x1 - x0, z1 - z0) < 1e-3) return;
  setWallAttrs(b, gr, look);
  if (gr && gr.n > 0) b.wall(x0, z0, x1, z1, y0, y1, 0, gr.u0, gr.cw, gr.v0, gr.ch);
  else b.wall(x0, z0, x1, z1, y0, y1);
}

/** Emit a wall quad with a window grid on a side (offset `o` outward from the side line). */
export function wallGrid(b: Builder, sg: SideGeom, uA: number, uB: number, y0: number, y1: number, gr: Grid, look: WallLook, o = 0): void {
  if (uB - uA < 1e-3 || y1 - y0 < 1e-3) return;
  setCol(b, look.color);
  b.A[0] = gr.wx0;
  b.A[1] = gr.wx1;
  b.A[2] = gr.wy0;
  b.A[3] = gr.wy1;
  b.B[0] = gr.n;
  b.B[1] = gr.m;
  b.B[2] = look.seed;
  b.B[3] = look.style * 8 + look.profile;
  b.C[0] = gr.cw;
  b.C[1] = gr.ch;
  b.C[2] = look.pattern;
  b.C[3] = look.frame + 8 * look.glass;
  sideQuad(b, sg, uA, uB, o, y0, y1, 0, gr.u0, gr.cw, gr.v0, gr.ch);
}

/** Plain wall (no windows). */
export function wallPlain(b: Builder, sg: SideGeom, uA: number, uB: number, y0: number, y1: number, look: { color: THREE.Color; pattern: number; seed: number }, o = 0): void {
  if (uB - uA < 1e-3 || y1 - y0 < 1e-3) return;
  setCol(b, look.color);
  b.A[0] = b.A[1] = b.A[2] = b.A[3] = 0;
  b.B[0] = 0;
  b.B[1] = 0;
  b.B[2] = look.seed;
  b.B[3] = 0;
  b.C[0] = 1;
  b.C[1] = 1;
  b.C[2] = look.pattern;
  b.C[3] = 0;
  sideQuad(b, sg, uA, uB, o, y0, y1);
}

/** Plain wall triangle (gable ends) on a side: base u range at y0, apex at (uApex, y1). Optional grid. */
export function wallTri(b: Builder, sg: SideGeom, uA: number, uB: number, uApex: number, y0: number, y1: number, look: { color: THREE.Color; pattern: number; seed: number }, gr: Grid | null = null, style = 0, profile = 0, frame = 0, glass = 0, o = 0): void {
  setCol(b, look.color);
  if (gr) {
    b.A[0] = gr.wx0;
    b.A[1] = gr.wx1;
    b.A[2] = gr.wy0;
    b.A[3] = gr.wy1;
    b.B[0] = gr.n;
    b.B[1] = gr.m;
    b.B[3] = style * 8 + profile;
    b.C[0] = gr.cw;
    b.C[1] = gr.ch;
    b.C[3] = frame + 8 * glass;
  } else {
    b.A[0] = b.A[1] = b.A[2] = b.A[3] = 0;
    b.B[0] = 0;
    b.B[1] = 0;
    b.B[3] = 0;
    b.C[0] = 1;
    b.C[1] = 1;
    b.C[3] = 0;
  }
  b.B[2] = look.seed;
  b.C[2] = look.pattern;
  const gu = gr ? gr.u0 : 0,
    gw = gr ? gr.cw : 1,
    gv = gr ? gr.v0 : 0,
    gh = gr ? gr.ch : 1;
  b.triangle(
    sx(sg, uA, o), y0, sz(sg, uA, o),
    sx(sg, uB, o), y0, sz(sg, uB, o),
    sx(sg, uApex, o), y1, sz(sg, uApex, o),
    (uA - gu) / gw, (y0 - gv) / gh, (uB - gu) / gw, (y0 - gv) / gh, (uApex - gu) / gw, (y1 - gv) / gh,
  );
}

// ───────────────────────────────────────────────────────────── roofs ──

/** Set roof-mode attributes on the shell builder. */
export function roofLook(b: Builder, color: THREE.Color, pattern: number, seed: number): void {
  setCol(b, color);
  b.A[0] = pattern;
  b.A[1] = seed;
  b.A[2] = 0;
  b.A[3] = 0;
  b.B[0] = 0;
  b.B[1] = 0;
  b.B[2] = seed;
  b.B[3] = 64;
  b.C[0] = 1;
  b.C[1] = 1;
  b.C[2] = 0;
  b.C[3] = 0;
}

/**
 * Planar roof polygon (3 or 4 points, CCW seen from above/outside) with uv in
 * metres: u along `ax` (ridge direction), v along `ay` (up-slope direction).
 */
export function roofPoly(b: Builder, pts: number[][], ax: number[], ay: number[]): void {
  const o = pts[0];
  const uv = pts.map((p) => {
    const dx = p[0] - o[0],
      dy = p[1] - o[1],
      dz = p[2] - o[2];
    return [dx * ax[0] + dy * ax[1] + dz * ax[2], dx * ay[0] + dy * ay[1] + dz * ay[2]];
  });
  if (pts.length === 3) {
    b.triangle(pts[0][0], pts[0][1], pts[0][2], pts[1][0], pts[1][1], pts[1][2], pts[2][0], pts[2][1], pts[2][2], uv[0][0], uv[0][1], uv[1][0], uv[1][1], uv[2][0], uv[2][1]);
  } else {
    b.quad(
      pts[0][0], pts[0][1], pts[0][2], pts[1][0], pts[1][1], pts[1][2], pts[2][0], pts[2][1], pts[2][2], pts[3][0], pts[3][1], pts[3][2],
      uv[0][0], uv[0][1], uv[1][0], uv[1][1], uv[2][0], uv[2][1], uv[3][0], uv[3][1],
    );
  }
}

/** Flat roof slab top (roof mode) over a local rect at height y. */
export function flatRoof(b: Builder, r: LRect, y: number, color: THREE.Color, pattern: number, seed: number): void {
  roofLook(b, color, pattern, seed);
  b.hrect(r.x0, r.z0, r.x1, r.z1, y, true);
}

/**
 * Gable roof over rect r with the ridge along x (alongX) or z, eave height ye,
 * ridge height yr, overhangs: oe (eave sides), og (gable ends). Emits the two
 * slopes (roof mode) + soffits and fascia boards (trim). Returns nothing; gable
 * triangles are emitted by the caller (they belong to the walls).
 */
export function gableRoof(g: Gen, r: LRect, alongX: boolean, ye: number, yr: number, oe: number, og: number, color: THREE.Color, pattern: number, trimCol: THREE.Color, oeA = oe, oeB = oe, ogA = og, ogB = og): void {
  const b = g.shell;
  roofLook(b, color, pattern, g.seed);
  if (alongX) {
    const zc = (r.z0 + r.z1) / 2;
    const half = (r.z1 - r.z0) / 2;
    const pitch = (yr - ye) / half;
    const x0 = r.x0 - ogA,
      x1 = r.x1 + ogB;
    // front slope (faces +z): eave at z1 + oeA (lowered by overhang), ridge at zc
    const zf = r.z1 + oeA,
      yf = ye - oeA * pitch;
    const zb = r.z0 - oeB,
      yb = ye - oeB * pitch;
    const sF = Math.hypot(zf - zc, yr - yf);
    const sB = Math.hypot(zc - zb, yr - yb);
    roofPoly(b, [[x0, yf, zf], [x1, yf, zf], [x1, yr, zc], [x0, yr, zc]], [1, 0, 0], [0, (yr - yf) / sF, (zc - zf) / sF]);
    roofPoly(b, [[x1, yb, zb], [x0, yb, zb], [x0, yr, zc], [x1, yr, zc]], [-1, 0, 0], [0, (yr - yb) / sB, (zc - zb) / sB]);
    // soffits + fascia
    const t = g.trim;
    setCol(t, trimCol);
    if (oeA > 0.05) {
      t.quad(x0, yf, r.z1, x1, yf, r.z1, x1, yf, zf, x0, yf, zf); // facing down? (built CW from above -> faces down)
      t.box(x0, yf - 0.16, zf - 0.03, x1, yf + 0.02, zf + 0.03, 0b010111 | 8);
    }
    if (oeB > 0.05) {
      t.quad(x0, yb, zb, x1, yb, zb, x1, yb, r.z0, x0, yb, r.z0);
      t.box(x0, yb - 0.16, zb - 0.03, x1, yb + 0.02, zb + 0.03, 0b100111 | 8);
    }
    // barge boards along the gable edges
    if (ogA > 0.05 || ogB > 0.05) {
      for (const x of [x0 + 0.06, x1 - 0.06]) {
        t.beam(x, yf - 0.06, zf, x, yr - 0.06, zc, 0.12, 0.2);
        t.beam(x, yr - 0.06, zc, x, yb - 0.06, zb, 0.12, 0.2);
      }
    }
    // ridge cap
    t.setRGB(color.r * 0.8, color.g * 0.8, color.b * 0.8);
    t.box(x0, yr - 0.06, zc - 0.12, x1, yr + 0.1, zc + 0.12, 0b110111);
  } else {
    const xc = (r.x0 + r.x1) / 2;
    const half = (r.x1 - r.x0) / 2;
    const pitch = (yr - ye) / half;
    const z0 = r.z0 - ogA,
      z1 = r.z1 + ogB;
    const xr = r.x1 + oeA,
      yR = ye - oeA * pitch;
    const xl = r.x0 - oeB,
      yL = ye - oeB * pitch;
    const sR = Math.hypot(xr - xc, yr - yR);
    const sL = Math.hypot(xc - xl, yr - yL);
    roofPoly(b, [[xr, yR, z1], [xr, yR, z0], [xc, yr, z0], [xc, yr, z1]], [0, 0, -1], [(xc - xr) / sR, (yr - yR) / sR, 0]);
    roofPoly(b, [[xl, yL, z0], [xl, yL, z1], [xc, yr, z1], [xc, yr, z0]], [0, 0, 1], [(xc - xl) / sL, (yr - yL) / sL, 0]);
    const t = g.trim;
    setCol(t, trimCol);
    if (oeA > 0.05) {
      t.quad(r.x1, yR, z0, xr, yR, z0, xr, yR, z1, r.x1, yR, z1);
      t.box(xr - 0.03, yR - 0.16, z0, xr + 0.03, yR + 0.02, z1, 0b111101 | 8);
    }
    if (oeB > 0.05) {
      t.quad(xl, yL, z0, r.x0, yL, z0, r.x0, yL, z1, xl, yL, z1);
      t.box(xl - 0.03, yL - 0.16, z0, xl + 0.03, yL + 0.02, z1, 0b111110 | 8);
    }
    if (ogA > 0.05 || ogB > 0.05) {
      for (const z of [z0 + 0.06, z1 - 0.06]) {
        t.beam(xr, yR - 0.06, z, xc, yr - 0.06, z, 0.12, 0.2);
        t.beam(xc, yr - 0.06, z, xl, yL - 0.06, z, 0.12, 0.2);
      }
    }
    t.setRGB(color.r * 0.8, color.g * 0.8, color.b * 0.8);
    t.box(xc - 0.12, yr - 0.06, z0, xc + 0.12, yr + 0.1, z1, 0b110111);
  }
}

/** Hip roof over rect r (ridge along the longer axis). */
export function hipRoof(g: Gen, r: LRect, ye: number, yr: number, oh: number, color: THREE.Color, pattern: number, trimCol: THREE.Color): void {
  const b = g.shell;
  roofLook(b, color, pattern, g.seed);
  const x0 = r.x0 - oh,
    x1 = r.x1 + oh,
    z0 = r.z0 - oh,
    z1 = r.z1 + oh;
  const w = x1 - x0,
    d = z1 - z0;
  const rise = yr - ye;
  const half = Math.min(w, d) / 2;
  const pitch = rise / half;
  const yb = ye - oh * pitch * 0.0; // eave line at ye (overhang drops slightly below)
  const xm = (x0 + x1) / 2,
    zm = (z0 + z1) / 2;
  if (w >= d) {
    const ra = x0 + half,
      rb = x1 - half;
    const slope = (p: number[], q: number[], rr: number[], s: number[] | null, ax: number[], ay: number[]) => roofPoly(b, s ? [p, q, rr, s] : [p, q, rr], ax, ay);
    const sl = Math.hypot(half, rise);
    slope([x0, yb, z1], [x1, yb, z1], [rb, yr, zm], [ra, yr, zm], [1, 0, 0], [0, rise / sl, -half / sl]);
    slope([x1, yb, z0], [x0, yb, z0], [ra, yr, zm], [rb, yr, zm], [-1, 0, 0], [0, rise / sl, half / sl]);
    slope([x1, yb, z1], [x1, yb, z0], [rb, yr, zm], null, [0, 0, -1], [-half / sl, rise / sl, 0]);
    slope([x0, yb, z0], [x0, yb, z1], [ra, yr, zm], null, [0, 0, 1], [half / sl, rise / sl, 0]);
    setCol(g.trim, shade(color, 0.8));
    if (rb - ra > 0.05) g.trim.box(ra, yr - 0.06, zm - 0.1, rb, yr + 0.09, zm + 0.1, 0b110111);
  } else {
    const ra = z0 + half,
      rb = z1 - half;
    const sl = Math.hypot(half, rise);
    roofPoly(b, [[x1, yb, z1], [x1, yb, z0], [xm, yr, ra], [xm, yr, rb]], [0, 0, -1], [-half / sl, rise / sl, 0]);
    roofPoly(b, [[x0, yb, z0], [x0, yb, z1], [xm, yr, rb], [xm, yr, ra]], [0, 0, 1], [half / sl, rise / sl, 0]);
    roofPoly(b, [[x0, yb, z1], [x1, yb, z1], [xm, yr, rb]], [1, 0, 0], [0, rise / sl, -half / sl]);
    roofPoly(b, [[x1, yb, z0], [x0, yb, z0], [xm, yr, ra]], [-1, 0, 0], [0, rise / sl, half / sl]);
    setCol(g.trim, shade(color, 0.8));
    if (rb - ra > 0.05) g.trim.box(xm - 0.1, yr - 0.06, ra, xm + 0.1, yr + 0.09, rb, 0b110111);
  }
  if (oh > 0.05) {
    // soffit ring + fascia
    const t = g.trim;
    setCol(t, trimCol);
    t.quad(x0, yb, z0, x1, yb, z0, x1, yb, r.z0, x0, yb, r.z0);
    t.quad(x0, yb, r.z1, x1, yb, r.z1, x1, yb, z1, x0, yb, z1);
    t.quad(x0, yb, r.z0, r.x0, yb, r.z0, r.x0, yb, r.z1, x0, yb, r.z1);
    t.quad(r.x1, yb, r.z0, x1, yb, r.z0, x1, yb, r.z1, r.x1, yb, r.z1);
    t.box(x0, yb - 0.15, z0, x1, yb + 0.01, z0 + 0.05, 0b100011 | 8);
    t.box(x0, yb - 0.15, z1 - 0.05, x1, yb + 0.01, z1, 0b010011 | 8);
    t.box(x0, yb - 0.15, z0, x0 + 0.05, yb + 0.01, z1, 0b000010 | 8);
    t.box(x1 - 0.05, yb - 0.15, z0, x1, yb + 0.01, z1, 0b000001 | 8);
  }
}

// ──────────────────────────────────────────────────────────── details ──

/** Simple chimney stack with cap and pots. */
export function chimney(g: Gen, x: number, z: number, y0: number, y1: number, w = 0.6, d = 0.85, c?: THREE.Color): void {
  const t = g.trim;
  setCol(t, c ?? col('#9a5a45'));
  t.box(x - w / 2, y0, z - d / 2, x + w / 2, y1, z + d / 2);
  setCol(t, col('#c9c2b6'));
  t.box(x - w / 2 - 0.07, y1, z - d / 2 - 0.07, x + w / 2 + 0.07, y1 + 0.12, z + d / 2 + 0.07);
  setCol(t, col('#b5653f'));
  const n = d > 0.7 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const pz = n === 1 ? z : z + (i - 0.5) * d * 0.5;
    t.cylinder(x, pz, 0.11, y1 + 0.12, y1 + 0.42, 6, true, 0.09);
  }
}

/** Wall lantern (emissive) beside a door. Kept above 2.4 m so it may project past the footprint. */
export function wallLamp(g: Gen, sg: SideGeom, u: number, y: number, o: number): void {
  y = Math.max(y, 2.42);
  const t = g.trim;
  setCol(t, col('#2b2b2b'));
  sideBox(t, sg, u - 0.05, u + 0.05, o, o + 0.2, y + 0.3, y + 0.36);
  sideBox(t, sg, u - 0.1, u + 0.1, o + 0.08, o + 0.28, y + 0.36, y + 0.42);
  const l = g.lights;
  setCol(l, col('#ffc979'));
  l.L[0] = LIGHT_MODE.STEADY;
  l.L[1] = 0;
  l.L[2] = 0;
  l.L[3] = 3.2;
  const cx = sx(sg, u, o + 0.18),
    cz = sz(sg, u, o + 0.18);
  l.box(cx - 0.075, y, cz - 0.075, cx + 0.075, y + 0.36, cz + 0.075, 0b111111);
}

export interface DoorOpts {
  w: number;
  h: number;
  /** recess depth into the wall (the wall line is at o = 0) */
  depth: number;
  wallColor: THREE.Color;
  frameColor: THREE.Color;
  doorColor: THREE.Color;
  /** glazed door (shell material, lit at night) */
  glass?: boolean;
  profile?: number;
  /** fanlight / transom window above the door */
  transom?: boolean;
  lamp?: boolean;
  /** outward protrusion of the frame (must stay within the footprint below 2.4 m) */
  frameOut?: number;
  seed: number;
}

/**
 * Recessed door at u on side sg: reveals, door leaf (wood panels or glazing),
 * frame, step, optional lamp. The caller must leave the opening [u-w/2, u+w/2] ×
 * [0, h] free of wall quads.
 */
export function doorNiche(g: Gen, sg: SideGeom, u: number, o: DoorOpts): void {
  const t = g.trim;
  const ua = u - o.w / 2,
    ub = u + o.w / 2;
  const d = o.depth;
  // reveals (inner sides of the opening), in wall colour (slightly darker)
  setCol(t, shade(o.wallColor, 0.82));
  const ax = sx(sg, ua, 0),
    az = sz(sg, ua, 0),
    axi = sx(sg, ua, -d),
    azi = sz(sg, ua, -d);
  const bx = sx(sg, ub, 0),
    bz = sz(sg, ub, 0),
    bxi = sx(sg, ub, -d),
    bzi = sz(sg, ub, -d);
  // left reveal faces +t (towards the opening centre)
  t.quad(ax, 0, az, axi, 0, azi, axi, o.h, azi, ax, o.h, az);
  // right reveal faces -t
  t.quad(bxi, 0, bzi, bx, 0, bz, bx, o.h, bz, bxi, o.h, bzi);
  // soffit (faces down)
  t.quad(axi, o.h, azi, bxi, o.h, bzi, bx, o.h, bz, ax, o.h, az);
  // threshold / step
  setCol(t, col('#b9b2a6'));
  sideBox(t, sg, ua, ub, -d, Math.min(0.0, (o.frameOut ?? 0.1) - 0.02), 0, 0.14);
  // door leaf
  const leafH = o.transom ? o.h - 0.5 : o.h;
  if (o.glass) {
    const s = g.shell;
    setCol(s, o.frameColor);
    s.A[0] = 0.04;
    s.A[1] = o.w - 0.04;
    s.A[2] = 0.14;
    s.A[3] = o.h - 0.04;
    s.B[0] = 1;
    s.B[1] = 1;
    s.B[2] = o.seed;
    s.B[3] = WIN.DOOR * 8 + (o.profile ?? 5);
    s.C[0] = o.w;
    s.C[1] = o.h;
    s.C[2] = 6;
    s.C[3] = 1 + 8 * 0;
    sideQuad(s, sg, ua, ub, -d, 0, o.h, 0, ua, o.w, 0, o.h);
  } else {
    setCol(t, o.doorColor);
    sideQuad(t, sg, ua, ub, -d, 0.14, leafH);
    // raised panels
    setCol(t, shade(o.doorColor, 0.85));
    const pw = (o.w - 0.3) / 2;
    for (let i = 0; i < 2; i++) {
      const pu = ua + 0.1 + i * (pw + 0.1);
      sideBox(t, sg, pu, pu + pw, -d, -d + 0.03, 0.35, leafH * 0.45);
      sideBox(t, sg, pu, pu + pw, -d, -d + 0.03, leafH * 0.52, leafH - 0.15);
    }
    // knob
    setCol(t, col('#d9b45a'));
    sideBox(t, sg, ub - 0.16, ub - 0.1, -d, -d + 0.06, 1.0, 1.06);
    if (o.transom) {
      const s = g.shell;
      setCol(s, o.frameColor);
      s.A[0] = 0.05;
      s.A[1] = o.w - 0.05;
      s.A[2] = 0.05;
      s.A[3] = 0.45;
      s.B[0] = 1;
      s.B[1] = 1;
      s.B[2] = o.seed;
      s.B[3] = WIN.PLAIN * 8 + 5;
      s.C[0] = o.w;
      s.C[1] = 0.5;
      s.C[2] = 6;
      s.C[3] = 0;
      sideQuad(s, sg, ua, ub, -d, leafH, o.h, 0, ua, o.w, leafH, 0.5);
    }
  }
  // frame / architrave around the opening (protrudes slightly)
  const fo = o.frameOut ?? 0.08;
  setCol(t, o.frameColor);
  sideBox(t, sg, ua - 0.14, ua, -0.02, fo, 0, o.h + 0.14);
  sideBox(t, sg, ub, ub + 0.14, -0.02, fo, 0, o.h + 0.14);
  sideBox(t, sg, ua - 0.14, ub + 0.14, -0.02, fo, o.h, o.h + 0.16);
  if (o.lamp) wallLamp(g, sg, ub + 0.45, Math.min(o.h - 0.2, 2.05), 0);
  g.doorsBuilt++;
}

/**
 * Emit a band of wall [y0,y1] on side sg over [uA,uB] with door openings cut out.
 * `seg(ua, ub)` emits the wall between openings; above each opening a plain lintel
 * wall is emitted up to y1. Doors are then built by the caller (doorNiche).
 */
export function bandWithOpenings(sg: SideGeom, uA: number, uB: number, openings: { u: number; w: number; h: number }[], seg: (ua: number, ub: number) => void, lintel: (ua: number, ub: number, y0: number) => void): void {
  const ops = [...openings].sort((a, b) => a.u - b.u);
  let cur = uA;
  for (const op of ops) {
    const a = op.u - op.w / 2,
      b = op.u + op.w / 2;
    if (a > cur + 1e-3) seg(cur, a);
    lintel(a, b, op.h);
    cur = b;
  }
  if (uB > cur + 1e-3) seg(cur, uB);
  void sg;
}

/** Simple railing along a side segment: posts + top rail + mid rail. */
export function railing(t: Builder, x0: number, z0: number, x1: number, z1: number, y: number, h = 1.0, c?: THREE.Color, postStep = 1.4, bars = 1): void {
  setCol(t, c ?? col('#3a3f44'));
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.05) return;
  const dx = (x1 - x0) / L,
    dz = (z1 - z0) / L;
  const r = 0.035;
  // top rail
  const rail = (yy: number, th: number) => {
    const ax = Math.min(x0, x1) - (Math.abs(dz) > 0.5 ? r : 0),
      bx = Math.max(x0, x1) + (Math.abs(dz) > 0.5 ? r : 0);
    const az = Math.min(z0, z1) - (Math.abs(dx) > 0.5 ? r : 0),
      bz = Math.max(z0, z1) + (Math.abs(dx) > 0.5 ? r : 0);
    t.box(ax, yy - th, az, bx, yy, bz, 0b111111);
  };
  rail(y + h, 0.06);
  for (let k = 1; k <= bars; k++) rail(y + (h * k) / (bars + 1), 0.035);
  const n = Math.max(1, Math.round(L / postStep));
  for (let i = 0; i <= n; i++) {
    const px = x0 + dx * (L * i) / n,
      pz = z0 + dz * (L * i) / n;
    t.box(px - r, y, pz - r, px + r, y + h, pz + r, 0b110111);
  }
}

/** Add a sign quad (signs builder) on side sg at outward offset o. */
export function signOnSide(g: Gen, sg: SideGeom, uA: number, uB: number, o: number, y0: number, y1: number, r: SignRect): void {
  const b = g.signs;
  const ax = sx(sg, uA, o),
    az = sz(sg, uA, o),
    bx = sx(sg, uB, o),
    bz = sz(sg, uB, o);
  b.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1);
}

/** Emissive light blob (box) with a mode. */
export function lightBox(g: Gen, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: THREE.ColorRepresentation, mode: number, inten: number, phase = 0, rate = 1): void {
  const l = g.lights;
  setCol(l, color);
  l.L[0] = mode;
  l.L[1] = phase;
  l.L[2] = rate;
  l.L[3] = inten;
  l.box(x0, y0, z0, x1, y1, z1, 0b111111);
}

/** Aviation obstruction light (blinking red) at a local point. */
export function aviationLight(g: Gen, x: number, y: number, z: number, phase = 0): void {
  const l = g.lights;
  setCol(l, '#ff2a1f');
  l.L[0] = LIGHT_MODE.BLINK;
  l.L[1] = phase;
  l.L[2] = 0.75;
  l.L[3] = 7;
  l.sphere(x, y, z, 0.32, 6, 4);
}

export { ROOFPAT };
