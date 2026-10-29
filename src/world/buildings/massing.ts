// Massing kit — pieces that break the plain "box with a roof" volume of the ordinary buildings: oriels and
// bay windows, corner turrets, cross gables (wall dormers), notched / stepped tower tiers with deep crown
// cornices, and real roof furniture (plant rooms, water tanks, vents, solar arrays, roof gardens).
//
// Every piece has a URL switch (A/B) and a quality tier; decisions use a separate per-lot RNG (`massRng`) so a
// switch never reshuffles the rest of a building. Setbacks are recorded per lot (`massTiers`) so the explore
// camera's room per storey (src/ui/camera/explore.ts) fits the stepped volume.

import * as THREE from 'three';
import type { Builder } from './mesh';
import { Rng } from '../../core/rng';
import { Gen, LRect, SideGeom, Grid, WallLook, sx, sz, makeGrid, wallSeg, setWallAttrs, setCol, shade, col, roofLook, roofPoly } from './gen';
import { ROOFPAT } from './materials';
import { anchors } from './anchors';
import { GREEN } from './green';

export interface MassingFlags {
  /** bay windows / oriels on townhouse fronts */
  oriels: boolean;
  /** corner turrets on corner townhouses */
  turrets: boolean;
  /** cross gables (wall dormers) on side-gabled townhouses */
  crossGables: boolean;
  /** stepped / notched tower and office tiers, apartment roof storeys */
  setbacks: boolean;
  /** deep crown cornices and string courses on towers / offices */
  crowns: boolean;
  /** roof furniture on flat roofs (plant rooms, tanks, vents, solar, gardens) */
  roofKit: boolean;
  /** head office block at an exposed end of a long industrial shed */
  annex: boolean;
  /** roof monitors on gable sheds, downpipes and a brick plinth on industrial halls */
  monitor: boolean;
  /** porches: harbour master's recessed porch, Westbrook house porches */
  porches: boolean;
  /** classical arcade columns on masonry offices, shopfronts behind every arcade */
  colonnade: boolean;
  /** loggias cut into the back of the apartment slabs */
  loggias: boolean;
  /** rooflight strips and ridge ventilators on industrial sheds */
  rooflights: boolean;
  /** piers between the window columns of punched masonry towers / offices */
  piers: boolean;
  /** 0 low, 1 medium, 2 high — fine roof furniture only from medium */
  q: number;
}

export const MASS: MassingFlags = { oriels: true, turrets: true, crossGables: true, setbacks: true, crowns: true, roofKit: true, annex: true, monitor: true, porches: true, colonnade: true, loggias: true, rooflights: true, piers: true, q: 2 };

/**
 * URL switches: ?nomassing (all off) or one by one ?nooriels ?noturrets ?nocrossgables ?nosetbacks ?nocrowns
 * ?noroofkit ?noannex ?nomonitor ?noporch ?nocolonnade ?nologgias ?norooflights ?nopiers. Quality: low keeps the massing (cheap, it carries the skyline) but drops the roof furniture.
 */
export function setMassing(p: { has(k: string): boolean }, level: 'low' | 'medium' | 'high'): void {
  const all = !p.has('nomassing');
  MASS.oriels = all && !p.has('nooriels');
  MASS.turrets = all && !p.has('noturrets');
  MASS.crossGables = all && !p.has('nocrossgables');
  MASS.setbacks = all && !p.has('nosetbacks');
  MASS.crowns = all && !p.has('nocrowns');
  MASS.annex = all && !p.has('noannex');
  MASS.monitor = all && !p.has('nomonitor');
  MASS.porches = all && !p.has('noporch');
  MASS.colonnade = all && !p.has('nocolonnade');
  MASS.loggias = all && !p.has('nologgias');
  MASS.rooflights = all && !p.has('norooflights');
  MASS.piers = all && !p.has('nopiers');
  MASS.q = level === 'low' ? 0 : level === 'medium' ? 1 : 2;
  MASS.roofKit = all && !p.has('noroofkit') && MASS.q > 0;
}

/** Massing decisions draw from their own stream: toggling a feature leaves the rest of the lot unchanged. */
export function massRng(g: Gen): Rng {
  return new Rng(((g.lot.seed * 2654435761) ^ 0x5bd1e995) >>> 0 || 7);
}

// ─────────────────────────────────────────────────────── tiers for explore ──

/** world-space volume of a lot from height y0 up (until the next tier) */
export interface MassTier {
  y0: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export const massTiers = new Map<number, MassTier[]>();

export function resetMassing(): void {
  massTiers.clear();
}

/** Record that from height y0 the lot's volume is the local rect r (setbacks; sorted by the caller, low first). */
export function recordTier(g: Gen, y0: number, r: LRect): void {
  const b = g.shell;
  const xa = b.toWorldX(r.x0, r.z0),
    za = b.toWorldZ(r.x0, r.z0),
    xb = b.toWorldX(r.x1, r.z1),
    zb = b.toWorldZ(r.x1, r.z1);
  let list = massTiers.get(g.lot.id);
  if (!list) massTiers.set(g.lot.id, (list = []));
  list.push({ y0, x0: Math.min(xa, xb), z0: Math.min(za, zb), x1: Math.max(xa, xb), z1: Math.max(za, zb) });
  list.sort((a, c) => a.y0 - c.y0);
}

// ─────────────────────────────────────────────────────────── primitives ──

type V3 = number[];

/** Roof facet (3/4 points) on the shell, turned to face up/out, with uv in metres (roof shader). */
export function upFacet(b: Builder, pts: V3[]): void {
  const a = pts[0],
    c = pts[1],
    d = pts[pts.length - 1];
  const e1x = c[0] - a[0], e1y = c[1] - a[1], e1z = c[2] - a[2];
  const e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
  let nx = e1y * e2z - e1z * e2y,
    ny = e1z * e2x - e1x * e2z,
    nz = e1x * e2y - e1y * e2x;
  if (ny < 0) {
    pts = [pts[0], ...pts.slice(1).reverse()];
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  // u: horizontal along the facet, v: up the slope
  let ux = nz,
    uz = -nx;
  const ul = Math.hypot(ux, uz);
  if (ul < 1e-4) (ux = 1), (uz = 0);
  else (ux /= ul), (uz /= ul);
  const vx = ny * uz,
    vy = nz * ux - nx * uz,
    vz = -ny * ux;
  roofPoly(b, pts, [ux, 0, uz], [vx, vy, vz]);
}

/** Quad facing away from a reference point (trim). */
function quadOut(t: Builder, a: V3, b: V3, c: V3, d: V3, ref: V3): void {
  t.quadAway(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], ref[0], ref[1], ref[2]);
}

/** Triangle facing away from a reference point. */
function triOut(b: Builder, p: V3, q: V3, r: V3, ref: V3): void {
  const nx = (q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]);
  const ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
  const nz = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const mx = (p[0] + q[0] + r[0]) / 3 - ref[0],
    my = (p[1] + q[1] + r[1]) / 3 - ref[1],
    mz = (p[2] + q[2] + r[2]) / 3 - ref[2];
  if (nx * mx + ny * my + nz * mz >= 0) b.triangle(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
  else b.triangle(p[0], p[1], p[2], r[0], r[1], r[2], q[0], q[1], q[2]);
}

/** Prism over a plan polygon (local x,z points, any winding) between y0..y1, side faces only + optional top. */
function prism(t: Builder, poly: number[][], y0: number, y1: number, top: boolean): void {
  let cx = 0,
    cz = 0;
  for (const p of poly) (cx += p[0]), (cz += p[1]);
  cx /= poly.length;
  cz /= poly.length;
  const ref = [cx, (y0 + y1) / 2, cz];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    quadOut(t, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], ref);
  }
  if (top) for (let i = 1; i < poly.length - 1; i++) triOut(t, [poly[0][0], y1, poly[0][1]], [poly[i][0], y1, poly[i][1]], [poly[i + 1][0], y1, poly[i + 1][1]], [cx, y1 - 1, cz]);
}

/** Wedge over a plan polygon: bottom flat at y0, top sloping from yHi (points with `hi`) to yLo. */
function wedge(t: Builder, poly: number[][], hi: boolean[], y0: number, yLo: number, yHi: number): void {
  let cx = 0,
    cz = 0;
  for (const p of poly) (cx += p[0]), (cz += p[1]);
  cx /= poly.length;
  cz /= poly.length;
  const ref = [cx, y0 + 0.01, cz];
  const top = poly.map((p, i) => [p[0], hi[i] ? yHi : yLo, p[1]]);
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    quadOut(t, [poly[i][0], y0, poly[i][1]], [poly[j][0], y0, poly[j][1]], top[j], top[i], [cx, (y0 + yLo) / 2, cz]);
  }
  for (let i = 1; i < poly.length - 1; i++) triOut(t, top[0], top[i], top[i + 1], ref);
}

// ─────────────────────────────────────────────────────────────── oriel ──

export interface OrielSpec {
  /** canted (three-sided bay) instead of a box oriel */
  canted: boolean;
  /** projection from the wall plane (m) */
  dep: number;
  /** outward offset of the wall plane from the side line */
  o0: number;
  /** storey grid: bottom of the first covered row, storey height, rows covered */
  v0: number;
  ch: number;
  rows: number;
  winW: number;
  winH: number;
  sill: number;
  look: WallLook;
  trimC: THREE.Color;
  capC: THREE.Color;
  cap: 'hip' | 'lean' | 'flat';
  /** corbel depth below the first row */
  corbel: number;
}

/**
 * Oriel / bay window on a side: walls with storey-aligned windows on all faces, a moulded base on a
 * tapering corbel, string bands at each storey and a hipped / lean-to / flat cap.
 */
export function oriel(g: Gen, sg: SideGeom, uc: number, w: number, s: OrielSpec): void {
  const t = g.trim;
  const uA = uc - w / 2,
    uB = uc + w / 2,
    o0 = s.o0,
    o1 = s.o0 + s.dep;
  const y0 = s.v0,
    y1 = s.v0 + s.ch * s.rows;
  const c = s.canted ? Math.min(s.dep * 0.95, w * 0.28) : 0;
  const plan = (grow: number, oIn = o0): number[][] =>
    [
      [uA - grow, oIn],
      [uA + c - grow * (c > 0 ? 0.41 : 1), o1 + grow],
      [uB - c + grow * (c > 0 ? 0.41 : 1), o1 + grow],
      [uB + grow, oIn],
    ].map(([u, o]) => [sx(sg, u, o), sz(sg, u, o)]);
  const P = plan(0);
  // walls
  for (let i = 0; i < 3; i++) {
    const a = P[i],
      b = P[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const front = i === 1;
    const n = front && L > 2.5 ? 2 : 1;
    const ww = front ? Math.min(s.winW, L / n - 0.3) : Math.min(s.winW * 0.7, L - 0.3);
    const gr: Grid | null = ww > 0.4 ? makeGrid(0, L, y0, s.ch, s.rows, { spacing: L / n, cols: n, winW: ww, winH: s.winH, sill: s.sill, margin: front ? 0.14 : 0.12 }) : null;
    wallSeg(g.shell, a[0], a[1], b[0], b[1], y0, y1, gr && gr.n > 0 ? gr : null, s.look);
  }
  // soffit + base moulding + corbel
  setCol(t, shade(s.trimC, 0.92));
  const base = plan(0.06);
  prism(t, base, y0 - 0.16, y0 + 0.04, false);
  const bt = base.map((p) => [p[0], y0 - 0.16, p[1]]);
  triOut(t, bt[0], bt[1], bt[2], [bt[0][0], y0, bt[0][1]]);
  triOut(t, bt[0], bt[2], bt[3], [bt[0][0], y0, bt[0][1]]);
  if (s.corbel > 0.05) {
    const lo = [
      [uA + 0.2, o0],
      [uA + c * 0.5 + 0.25, o0 + s.dep * 0.28],
      [uB - c * 0.5 - 0.25, o0 + s.dep * 0.28],
      [uB - 0.2, o0],
    ].map(([u, o]) => [sx(sg, u, o), sz(sg, u, o)]);
    const yb = y0 - 0.16 - s.corbel;
    const ref = [sx(sg, uc, o0 - 1), y0, sz(sg, uc, o0 - 1)];
    for (let i = 0; i < 3; i++) quadOut(t, [lo[i][0], yb, lo[i][1]], [lo[i + 1][0], yb, lo[i + 1][1]], [base[i + 1][0], y0 - 0.16, base[i + 1][1]], [base[i][0], y0 - 0.16, base[i][1]], ref);
    triOut(t, [lo[0][0], yb, lo[0][1]], [lo[1][0], yb, lo[1][1]], [lo[2][0], yb, lo[2][1]], [lo[0][0], yb + 1, lo[0][1]]);
    triOut(t, [lo[0][0], yb, lo[0][1]], [lo[2][0], yb, lo[2][1]], [lo[3][0], yb, lo[3][1]], [lo[0][0], yb + 1, lo[0][1]]);
  }
  // string bands between storeys
  setCol(t, s.trimC);
  const band = plan(0.035);
  for (let j = 1; j < s.rows; j++) prism(t, band, y0 + j * s.ch - 0.06, y0 + j * s.ch + 0.05, true);
  // cornice + cap
  const cor = plan(0.1);
  prism(t, cor, y1 - 0.05, y1 + 0.14, true);
  const ov = 0.16;
  if (s.cap === 'flat') return;
  if (s.cap === 'lean') {
    setCol(t, s.capC);
    wedge(t, plan(ov), [true, false, false, true], y1 + 0.14, y1 + 0.17, y1 + 0.17 + s.dep * 0.55);
    return;
  }
  // hip: ridge along the wall, three facets down to the cap's eave
  const E = plan(ov);
  const yE = y1 + 0.14,
    rise = Math.min(0.9, (s.dep + ov) * 0.9);
  const k = Math.min((uB - uA) / 2 - 0.05, s.dep + ov);
  const R0 = [sx(sg, uA + k, o0), yE + rise, sz(sg, uA + k, o0)],
    R1 = [sx(sg, uB - k, o0), yE + rise, sz(sg, uB - k, o0)];
  const e = E.map((p) => [p[0], yE, p[1]]);
  roofLook(g.shell, s.capC, ROOFPAT.SLATE, g.seed + 5);
  upFacet(g.shell, [e[1], e[2], R1, R0]);
  upFacet(g.shell, [e[0], e[1], R0]);
  upFacet(g.shell, [e[2], e[3], R1]);
}

// ───────────────────────────────────────────────────────────── turret ──

export interface TurretSpec {
  R: number;
  n: number;
  /** bottom of the turret walls (corbel below) and top of the walls */
  y0: number;
  yTop: number;
  /** window rows: first row bottom, storey height, rows */
  v0: number;
  ch: number;
  rows: number;
  winW: number;
  winH: number;
  sill: number;
  look: WallLook;
  plain: { color: THREE.Color; pattern: number; seed: number };
  trimC: THREE.Color;
  capC: THREE.Color;
  cap: 'cone' | 'bell' | 'dome';
  capH: number;
  /** the body the turret grows out of (faces fully inside are skipped) */
  body: LRect;
  /** corbel height under the walls (kept above 2.45 m) */
  corbel: number;
}

/** Polygonal corner turret: corbelled base, windowed faces, frieze + cornice ring, cone / bell / dome cap, finial. */
export function turret(g: Gen, cx: number, cz: number, s: TurretSpec): void {
  const t = g.trim;
  const n = s.n;
  const ang = (i: number) => ((i + 0.5) / n) * Math.PI * 2;
  const ring = (r: number) => Array.from({ length: n }, (_, i) => [cx + Math.cos(ang(i)) * r, cz + Math.sin(ang(i)) * r]);
  const inside = (p: number[]) => p[0] > s.body.x0 + 0.03 && p[0] < s.body.x1 - 0.03 && p[1] > s.body.z0 + 0.03 && p[1] < s.body.z1 - 0.03;
  const P = ring(s.R);
  const show: boolean[] = [];
  for (let i = 0; i < n; i++) show.push(!(inside(P[i]) && inside(P[(i + 1) % n])));
  const yWin1 = s.v0 + s.ch * s.rows;
  for (let i = 0; i < n; i++) {
    if (!show[i]) continue;
    // decreasing angle = left → right seen from outside
    const a = P[(i + 1) % n],
      b = P[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const out = !inside(mid);
    const gr = out && L > 0.7 ? makeGrid(0, L, s.v0, s.ch, s.rows, { spacing: L, cols: 1, winW: Math.min(s.winW, L - 0.3), winH: s.winH, sill: s.sill, margin: 0.12 }) : null;
    if (s.y0 < s.v0) wallSeg(g.shell, a[0], a[1], b[0], b[1], s.y0, s.v0, null, s.plain);
    wallSeg(g.shell, a[0], a[1], b[0], b[1], s.v0, yWin1, gr && gr.n > 0 ? gr : null, s.look);
    if (s.yTop > yWin1) wallSeg(g.shell, a[0], a[1], b[0], b[1], yWin1, s.yTop, null, s.plain);
  }
  // corbel: an inverted frustum under the walls, with a moulded lip
  const ref = [cx, s.y0, cz];
  setCol(t, shade(s.trimC, 0.9));
  const lip = ring(s.R + 0.06),
    lo = ring(s.R * 0.32);
  const yC = Math.max(2.45, s.y0 - s.corbel);
  for (let i = 0; i < n; i++) {
    if (!show[i]) continue;
    const j = (i + 1) % n;
    quadOut(t, [lo[i][0], yC, lo[i][1]], [lo[j][0], yC, lo[j][1]], [lip[j][0], s.y0 - 0.12, lip[j][1]], [lip[i][0], s.y0 - 0.12, lip[i][1]], [cx, yC - 0.5, cz]);
    quadOut(t, [lip[i][0], s.y0 - 0.12, lip[i][1]], [lip[j][0], s.y0 - 0.12, lip[j][1]], [lip[j][0], s.y0 + 0.06, lip[j][1]], [lip[i][0], s.y0 + 0.06, lip[i][1]], ref);
  }
  // storey bands + frieze cornice
  setCol(t, s.trimC);
  const band = ring(s.R + 0.04);
  const bandAt = (y0: number, y1: number, rr: number[][]) => {
    for (let i = 0; i < n; i++) {
      if (!show[i]) continue;
      const j = (i + 1) % n;
      quadOut(t, [rr[i][0], y0, rr[i][1]], [rr[j][0], y0, rr[j][1]], [rr[j][0], y1, rr[j][1]], [rr[i][0], y1, rr[i][1]], [cx, (y0 + y1) / 2, cz]);
      // underside + top of the band
      triOut(t, [rr[i][0], y0, rr[i][1]], [rr[j][0], y0, rr[j][1]], [cx, y0, cz], [cx, y0 + 1, cz]);
      triOut(t, [rr[i][0], y1, rr[i][1]], [rr[j][0], y1, rr[j][1]], [cx, y1, cz], [cx, y1 - 1, cz]);
    }
  };
  for (let j = 1; j < s.rows; j++) bandAt(s.v0 + j * s.ch - 0.06, s.v0 + j * s.ch + 0.05, band);
  bandAt(s.yTop - 0.06, s.yTop + 0.12, ring(s.R + 0.12));
  // cap
  const yb = s.yTop + 0.12;
  const capR = s.R + 0.16;
  const apex = yb + s.capH;
  if (s.cap === 'cone') {
    roofLook(g.shell, s.capC, ROOFPAT.SLATE, g.seed + 7);
    const E = ring(capR);
    for (let i = 0; i < n; i++) upFacet(g.shell, [[E[i][0], yb, E[i][1]], [E[(i + 1) % n][0], yb, E[(i + 1) % n][1]], [cx, apex, cz]]);
  } else {
    // lathe profile (radius factor, height factor) — bell: flared ogee; dome: quarter circle on a drum
    const prof = s.cap === 'bell'
      ? [[1, 0], [0.9, 0.1], [0.74, 0.26], [0.62, 0.45], [0.42, 0.68], [0.2, 0.86], [0.05, 1]]
      : [[1, 0], [0.98, 0.18], [0.9, 0.42], [0.72, 0.68], [0.45, 0.88], [0.12, 1]];
    setCol(t, s.capC);
    for (let k = 0; k < prof.length - 1; k++) {
      const ra = ring(capR * prof[k][0]),
        rb = ring(capR * prof[k + 1][0]);
      const ya = yb + s.capH * prof[k][1],
        yb2 = yb + s.capH * prof[k + 1][1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        quadOut(t, [ra[i][0], ya, ra[i][1]], [ra[j][0], ya, ra[j][1]], [rb[j][0], yb2, rb[j][1]], [rb[i][0], yb2, rb[i][1]], [cx, ya - 0.5, cz]);
      }
    }
  }
  // finial
  setCol(t, col('#3a3a36'));
  t.cylinder(cx, cz, 0.035, apex - 0.1, apex + 0.75, 4, false);
  setCol(t, col(s.cap === 'cone' ? '#c9a54a' : '#d8b65a'));
  t.sphere(cx, apex + 0.36, cz, 0.09, 6, 4);
  anchors.perch(cx - 0.05, apex + 0.75, cz, cx + 0.05, apex + 0.75, cz, 'ridge');
}

// ──────────────────────────────────────────────────────── cross gable ──

export interface CrossGableSpec {
  /** body rect; the cross gable stands on its front side (local +z) */
  r: LRect;
  cx: number;
  w: number;
  eave: number;
  /** main front slope: rise per metre, ridge height */
  pitch: number;
  yRidge: number;
  /** wall continuing above the eave before the gable starts */
  knee: number;
  look: WallLook;
  plain: { color: THREE.Color; pattern: number; seed: number };
  roofC: THREE.Color;
  pat: number;
  trimC: THREE.Color;
  /** window style/profile for the attic windows */
  style: number;
}

/**
 * Cross gable (a wall dormer): the front wall rises through the eave and ends in a gable with its own roof
 * meeting the main slope. Returns false (nothing built) when the main roof is too low for it.
 */
export function crossGable(g: Gen, s: CrossGableSpec): boolean {
  const { r, cx, w, eave, pitch, knee } = s;
  const zf = r.z1;
  const ek = eave + knee;
  let pc = 1.05;
  const maxRidge = s.yRidge - 0.35;
  if (ek + (w / 2) * pc > maxRidge) pc = (maxRidge - ek) / (w / 2);
  if (pc < 0.5) return false;
  const yrc = ek + (w / 2) * pc;
  const xa = cx - w / 2,
    xb = cx + w / 2;
  const sh = g.shell;
  // front wall (knee + gable triangle) with a window row spanning both
  const sg: SideGeom = { x0: r.x0, z0: zf, tx: 1, tz: 0, nx: 0, nz: 1, L: r.x1 - r.x0 };
  const uA = xa - r.x0,
    uB = xb - r.x0;
  const chA = Math.max(1.2, knee + (yrc - ek) * 0.5);
  const gr = makeGrid(uA, uB, eave + 0.1, chA, 1, { spacing: (uB - uA) / (w > 3.4 ? 2 : 1), cols: w > 3.4 ? 2 : 1, winW: 0.82, winH: Math.min(1.35, chA - 0.3), sill: 0.12, margin: 0.45 });
  const lk = { ...s.look, style: s.style };
  if (knee > 0.02) wallSeg(sh, xa, zf, xb, zf, eave, ek, gr, lk);
  setWallAttrs(sh, gr, lk);
  const gu = gr.u0, gw = gr.cw, gv = gr.v0, gh = gr.ch;
  sh.triangle(xa, ek, zf, xb, ek, zf, cx, yrc, zf, (uA - gu) / gw, (ek - gv) / gh, (uB - gu) / gw, (ek - gv) / gh, (cx - r.x0 - gu) / gw, (yrc - gv) / gh);
  // knee cheeks back to the main slope
  const zk = zf - knee / pitch;
  if (knee > 0.02) {
    setWallAttrs(sh, null, s.plain);
    triOut(sh, [xa, eave, zf], [xa, ek, zf], [xa, ek, zk], [cx, ek, zf - 0.5]);
    triOut(sh, [xb, eave, zf], [xb, ek, zf], [xb, ek, zk], [cx, ek, zf - 0.5]);
  }
  // roof: two facets from the front verge back to the valley on the main slope
  const ov = 0.22,
    og = 0.28;
  const zr = zf - (yrc - eave) / pitch;
  roofLook(sh, s.roofC, s.pat, g.seed + 9);
  const AR = [xb + ov, ek - ov * pc, zf + og],
    AL = [xa - ov, ek - ov * pc, zf + og];
  const BF = [cx, yrc, zf + og],
    BR = [cx, yrc, zr];
  upFacet(sh, [AR, BF, BR, [xb, ek, zk]]);
  upFacet(sh, [AL, [xa, ek, zk], BR, BF]);
  // soffits under the verge overhang, barge boards, ridge cap
  const t = g.trim;
  setCol(t, s.trimC);
  t.beam(AR[0] - 0.05, AR[1] - 0.05, zf + og - 0.02, cx, yrc - 0.05, zf + og - 0.02, 0.1, 0.18);
  t.beam(cx, yrc - 0.05, zf + og - 0.02, AL[0] + 0.05, AL[1] - 0.05, zf + og - 0.02, 0.1, 0.18);
  setCol(t, shade(s.roofC, 0.8));
  t.box(cx - 0.1, yrc - 0.05, zr, cx + 0.1, yrc + 0.08, zf + og, 0b110111);
  anchors.perch(cx, yrc + 0.08, zr + 0.3, cx, yrc + 0.08, zf + og - 0.2, 'ridge');
  // a little gable ornament: a finial post at the apex
  setCol(t, s.trimC);
  t.box(cx - 0.05, yrc - 0.1, zf + og - 0.06, cx + 0.05, yrc + 0.45, zf + og + 0.04, 0b111111);
  return true;
}

// ───────────────────────────────────────────────────────── tower helpers ──

/** Rect with square notches cut out of its corners (re-entrant corners), in rectPoly winding (front edge first). */
export function notchPoly(r: LRect, n: number): { x: number; z: number }[] {
  return [
    { x: r.x0 + n, z: r.z1 }, { x: r.x1 - n, z: r.z1 }, { x: r.x1 - n, z: r.z1 - n }, { x: r.x1, z: r.z1 - n },
    { x: r.x1, z: r.z0 + n }, { x: r.x1 - n, z: r.z0 + n }, { x: r.x1 - n, z: r.z0 }, { x: r.x0 + n, z: r.z0 },
    { x: r.x0 + n, z: r.z0 + n }, { x: r.x0, z: r.z0 + n }, { x: r.x0, z: r.z1 - n }, { x: r.x0 + n, z: r.z1 - n },
  ];
}

/** Flat cap of a notched rect (three rects; roof mode set by the caller). */
export function notchCap(b: Builder, r: LRect, n: number, y: number): void {
  b.hrect(r.x0 + n, r.z0, r.x1 - n, r.z1, y, true);
  b.hrect(r.x0, r.z0 + n, r.x0 + n, r.z1 - n, y, true);
  b.hrect(r.x1 - n, r.z0 + n, r.x1, r.z1 - n, y, true);
}

/**
 * Deep crown cornice along a closed polygon (outward = left of travel in rectPoly winding): frieze, bed
 * moulding, a projecting corona on modillion brackets. `proj` = corona projection from the wall.
 */
export function crownCornice(g: Gen, poly: { x: number; z: number }[], y: number, proj: number, c: THREE.Color, brackets: boolean): void {
  const t = g.trim;
  const N = poly.length;
  // signed area → which normal points out
  let area = 0;
  for (let i = 0; i < N; i++) {
    const a = poly[i],
      b = poly[(i + 1) % N];
    area += a.x * b.z - b.x * a.z;
  }
  const sgn = area > 0 ? -1 : 1;
  for (let i = 0; i < N; i++) {
    const a = poly[i],
      b = poly[(i + 1) % N];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.2) continue;
    const tx = (b.x - a.x) / L,
      tz = (b.z - a.z) / L;
    const nx = -tz * sgn,
      nz = tx * sgn;
    const slab = (o0: number, o1: number, ext: number, y0: number, y1: number) => {
      const p = (u: number, o: number) => [a.x + tx * u + nx * o, a.z + tz * u + nz * o];
      const q = [p(-ext, o0), p(L + ext, o0), p(L + ext, o1), p(-ext, o1)];
      prism(t, q, y0, y1, true);
      // underside
      triOut(t, [q[0][0], y0, q[0][1]], [q[1][0], y0, q[1][1]], [q[2][0], y0, q[2][1]], [q[0][0], y0 + 1, q[0][1]]);
      triOut(t, [q[0][0], y0, q[0][1]], [q[2][0], y0, q[2][1]], [q[3][0], y0, q[3][1]], [q[0][0], y0 + 1, q[0][1]]);
    };
    setCol(t, shade(c, 0.95));
    slab(-0.05, 0.1, 0, y - 0.95, y - 0.55); // frieze band
    setCol(t, c);
    slab(-0.05, proj * 0.5, proj * 0.5, y - 0.38, y - 0.24); // bed moulding
    slab(-0.05, proj, proj, y - 0.24, y); // corona
    if (brackets && MASS.q > 0) {
      setCol(t, shade(c, 0.88));
      const nB = Math.max(1, Math.round(L / 1.1));
      for (let k = 0; k < nB; k++) {
        const u = ((k + 0.5) / nB) * L;
        const px = a.x + tx * u,
          pz = a.z + tz * u;
        const q = [
          [px - tx * 0.09, pz - tz * 0.09],
          [px + tx * 0.09, pz + tz * 0.09],
          [px + tx * 0.09 + nx * (proj - 0.06), pz + tz * 0.09 + nz * (proj - 0.06)],
          [px - tx * 0.09 + nx * (proj - 0.06), pz - tz * 0.09 + nz * (proj - 0.06)],
        ];
        prism(t, q, y - 0.5, y - 0.24, false);
        triOut(t, [q[0][0], y - 0.5, q[0][1]], [q[1][0], y - 0.5, q[1][1]], [q[2][0], y - 0.5, q[2][1]], [q[0][0], y, q[0][1]]);
        triOut(t, [q[0][0], y - 0.5, q[0][1]], [q[2][0], y - 0.5, q[2][1]], [q[3][0], y - 0.5, q[3][1]], [q[0][0], y, q[0][1]]);
      }
    }
  }
}

// ───────────────────────────────────────────────────────── roof furniture ──

export interface KitRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Placement on a flat roof with keep-clear rects. */
export class RoofPlacer {
  readonly keep: KitRect[];
  constructor(
    readonly r: KitRect,
    readonly rng: Rng,
    keep: KitRect[] = [],
  ) {
    this.keep = [...keep];
  }
  free(a: number, b: number, c: number, d: number): boolean {
    const r = this.r;
    return a > r.x0 + 0.3 && b < r.x1 - 0.3 && c > r.z0 + 0.3 && d < r.z1 - 0.3 && this.keep.every((k) => b < k.x0 || a > k.x1 || d < k.z0 || c > k.z1);
  }
  place(w: number, d: number, tries = 16, pad = 0.35): [number, number] | null {
    const r = this.r;
    for (let i = 0; i < tries; i++) {
      const cx = r.x0 + 0.4 + w / 2 + this.rng.next() * Math.max(0.01, r.x1 - r.x0 - 0.8 - w),
        cz = r.z0 + 0.4 + d / 2 + this.rng.next() * Math.max(0.01, r.z1 - r.z0 - 0.8 - d);
      if (this.free(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2)) {
        this.keep.push({ x0: cx - w / 2 - pad, x1: cx + w / 2 + pad, z0: cz - d / 2 - pad, z1: cz + d / 2 + pad });
        return [cx, cz];
      }
    }
    return null;
  }
}

/** Timber water tank on a steel stand with a conical lid and a ladder (the classic city-roof tank). */
export function woodTank(t: Builder, x: number, z: number, y: number, r: number, h: number, legs: number): void {
  setCol(t, col('#4b4f52'));
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) t.box(x + dx * r * 0.7 - 0.07, y, z + dz * r * 0.7 - 0.07, x + dx * r * 0.7 + 0.07, y + legs, z + dz * r * 0.7 + 0.07, 0b110011);
  t.box(x - r * 0.8, y + legs - 0.12, z - r * 0.8, x + r * 0.8, y + legs, z + r * 0.8, 0b111111);
  setCol(t, col('#7a5a3f'));
  t.cylinder(x, z, r, y + legs, y + legs + h, 12, false);
  setCol(t, col('#3c3a38'));
  for (const f of [0.2, 0.55, 0.88]) t.cylinder(x, z, r + 0.025, y + legs + h * f, y + legs + h * f + 0.06, 12, false);
  setCol(t, col('#5e4632'));
  t.cone(x, z, r + 0.08, y + legs + h, y + legs + h + r * 0.55, 12);
  setCol(t, col('#2f3133'));
  t.box(x + r - 0.02, y, z - 0.2, x + r + 0.04, y + legs + h, z - 0.16, 0b110011);
  t.box(x + r - 0.02, y, z + 0.16, x + r + 0.04, y + legs + h, z + 0.2, 0b110011);
}

/** Plant room / lift motor room: rendered box, louvre bands, a steel door, roof slab with a lip. */
export function plantRoom(t: Builder, x0: number, z0: number, x1: number, z1: number, y: number, h: number, wall: THREE.Color): void {
  setCol(t, wall);
  t.box(x0, y, z0, x1, y + h, z1);
  setCol(t, shade(wall, 0.62));
  const lz = (z0 + z1) / 2;
  const lw = Math.min(1.6, (x1 - x0) * 0.4);
  for (let k = 0; k < 4; k++) {
    const yy = y + h * 0.35 + k * 0.22;
    t.box(x1 - 0.02, yy, lz - lw / 2, x1 + 0.05, yy + 0.12, lz + lw / 2, 0b110101);
    t.box(x0 - 0.05, yy, lz - lw / 2, x0 + 0.02, yy + 0.12, lz + lw / 2, 0b110110);
  }
  setCol(t, col('#56606a'));
  const dx = x0 + Math.min(0.5, (x1 - x0) * 0.2);
  t.box(dx, y, z1 - 0.01, dx + 0.9, y + 2.05, z1 + 0.04, 0b110101 | 16);
  setCol(t, shade(wall, 0.8));
  t.box(x0 - 0.1, y + h, z0 - 0.1, x1 + 0.1, y + h + 0.16, z1 + 0.1);
}

/** Extract fan / mushroom vent cluster. */
export function vents(t: Builder, x: number, z: number, y: number, rng: Rng): void {
  const n = 1 + rng.int(0, 2);
  for (let k = 0; k < n; k++) {
    const vx = x + (k - (n - 1) / 2) * 0.7;
    if (rng.chance(0.5)) {
      setCol(t, col('#9aa0a4'));
      t.cylinder(vx, z, 0.18, y, y + 0.7, 8, false);
      t.cone(vx, z, 0.32, y + 0.66, y + 0.92, 8);
    } else {
      setCol(t, col('#b6bbbe'));
      t.box(vx - 0.35, y, z - 0.35, vx + 0.35, y + 0.55, z + 0.35);
      setCol(t, col('#3a3f44'));
      t.cylinder(vx, z, 0.26, y + 0.55, y + 0.6, 8, true);
    }
  }
}

/** Rows of tilted PV panels on low frames, facing local direction (fx, fz) (towards the sun). */
export function solarRows(t: Builder, x0: number, z0: number, x1: number, z1: number, y: number, alongX: boolean, faceSign: number): void {
  const rowD = 1.1,
    gap = 0.75;
  const span = alongX ? z1 - z0 : x1 - x0;
  const nR = Math.max(1, Math.floor((span + gap) / (rowD + gap)));
  for (let k = 0; k < nR; k++) {
    const a = (alongX ? z0 : x0) + k * (rowD + gap);
    const lo = faceSign > 0 ? a + rowD : a,
      hi = faceSign > 0 ? a : a + rowD;
    const yl = y + 0.25,
      yh = y + 0.75;
    setCol(t, col('#1e2a3a'));
    if (alongX) {
      t.quadAway(x0, yl, lo, x1, yl, lo, x1, yh, hi, x0, yh, hi, (x0 + x1) / 2, y - 2, hi);
      setCol(t, col('#9ea4a8'));
      for (const xx of [x0 + 0.2, x1 - 0.2]) t.box(xx - 0.03, y, Math.min(lo, hi), xx + 0.03, yh, Math.min(lo, hi) + 0.06, 0b110011);
    } else {
      t.quadAway(lo, yl, z0, lo, yl, z1, hi, yh, z1, hi, yh, z0, hi, y - 2, (z0 + z1) / 2);
      setCol(t, col('#9ea4a8'));
      for (const zz of [z0 + 0.2, z1 - 0.2]) t.box(Math.min(lo, hi), y, zz - 0.03, Math.min(lo, hi) + 0.06, yh, zz + 0.03, 0b110011);
    }
  }
}

/** Roof garden: decking, raised planters with shrubs, a pergola. */
export function roofGarden(g: Gen, x0: number, z0: number, x1: number, z1: number, y: number, rng: Rng): void {
  const t = g.trim;
  setCol(t, col('#9c7a55'));
  t.box(x0, y, z0, x1, y + 0.07, z1, 0b111111);
  const w = x1 - x0,
    d = z1 - z0;
  // planters along the long edges
  const alongX = w >= d;
  const nP = Math.max(2, Math.floor((alongX ? w : d) / 1.8));
  for (let k = 0; k < nP; k++) {
    const f = (k + 0.5) / nP;
    for (const side of [0, 1]) {
      if (rng.chance(0.25)) continue;
      const px = alongX ? x0 + f * w : side ? x1 - 0.4 : x0 + 0.4;
      const pz = alongX ? (side ? z1 - 0.4 : z0 + 0.4) : z0 + f * d;
      setCol(t, col(rng.pick(['#8a6a4f', '#6f6a62', '#a0613f'])));
      t.box(px - 0.45, y, pz - 0.3, px + 0.45, y + 0.45, pz + 0.3);
      g.green.clump(px, y + 0.42, pz, 0.45, rng.range(0.6, 1.3), rng.weighted([GREEN.SHRUB, GREEN.GRASS, GREEN.LAVENDER, GREEN.PALM], [3, 1.5, 1, 0.6]), 3);
    }
  }
  // pergola over the middle
  if (w > 3 && d > 3 && rng.chance(0.7)) {
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      hw = Math.min(1.6, w / 2 - 0.9),
      hd = Math.min(1.3, d / 2 - 0.9);
    setCol(t, col('#ece6da'));
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) t.box(cx + dx * hw - 0.06, y, cz + dz * hd - 0.06, cx + dx * hw + 0.06, y + 2.3, cz + dz * hd + 0.06, 0b110011);
    for (let k = 0; k <= 4; k++) {
      const zz = cz - hd + (k / 4) * 2 * hd;
      t.box(cx - hw - 0.25, y + 2.3, zz - 0.04, cx + hw + 0.25, y + 2.42, zz + 0.04, 0b111111);
    }
    setCol(t, col('#f1efe9'));
    t.cylinder(cx, cz, 0.42, y + 0.7, y + 0.75, 8, true);
    t.cylinder(cx, cz, 0.05, y, y + 0.7, 4, false);
  }
  anchors.balcony((x0 + x1) / 2, y + 0.07, (z0 + z1) / 2, 0, 1, w, d, 1.0, 'terrace');
}

/** Ridge skylight (glazed pitched light) on a flat roof. */
export function ridgeLight(t: Builder, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const alongX = x1 - x0 >= z1 - z0;
  setCol(t, col('#d6d1c6'));
  t.box(x0, y, z0, x1, y + 0.3, z1);
  setCol(t, col('#51697c'));
  const yt = y + 0.3 + Math.min(0.55, (alongX ? z1 - z0 : x1 - x0) * 0.4);
  if (alongX) {
    const zm = (z0 + z1) / 2;
    t.quadAway(x0 + 0.05, y + 0.3, z0 + 0.05, x1 - 0.05, y + 0.3, z0 + 0.05, x1 - 0.05, yt, zm, x0 + 0.05, yt, zm, (x0 + x1) / 2, y - 1, zm);
    t.quadAway(x0 + 0.05, y + 0.3, z1 - 0.05, x1 - 0.05, y + 0.3, z1 - 0.05, x1 - 0.05, yt, zm, x0 + 0.05, yt, zm, (x0 + x1) / 2, y - 1, zm);
    setCol(t, col('#d6d1c6'));
    for (const xx of [x0 + 0.05, x1 - 0.05]) triOut(t, [xx, y + 0.3, z0 + 0.05], [xx, y + 0.3, z1 - 0.05], [xx, yt, zm], [(x0 + x1) / 2, y, zm]);
  } else {
    const xm = (x0 + x1) / 2;
    t.quadAway(x0 + 0.05, y + 0.3, z0 + 0.05, x0 + 0.05, y + 0.3, z1 - 0.05, xm, yt, z1 - 0.05, xm, yt, z0 + 0.05, xm, y - 1, (z0 + z1) / 2);
    t.quadAway(x1 - 0.05, y + 0.3, z0 + 0.05, x1 - 0.05, y + 0.3, z1 - 0.05, xm, yt, z1 - 0.05, xm, yt, z0 + 0.05, xm, y - 1, (z0 + z1) / 2);
    setCol(t, col('#d6d1c6'));
    for (const zz of [z0 + 0.05, z1 - 0.05]) triOut(t, [x0 + 0.05, y + 0.3, zz], [x1 - 0.05, y + 0.3, zz], [xm, yt, zz], [xm, y, (z0 + z1) / 2]);
  }
}

/** local direction (sign along x or z) that faces world south (+Z) — for PV rows */
export function southLocal(g: Gen): { alongX: boolean; sign: number } {
  const b = g.shell;
  // world +Z expressed in the local frame: local axes in world
  const lx = b.toWorldZ(1, 0) - b.toWorldZ(0, 0),
    lz = b.toWorldZ(0, 1) - b.toWorldZ(0, 0);
  return Math.abs(lz) >= Math.abs(lx) ? { alongX: true, sign: Math.sign(lz) || 1 } : { alongX: false, sign: Math.sign(lx) || 1 };
}

/**
 * Roof furniture on a flat roof rect (local, at height y): picks from plant room, water tank, vents, PV rows,
 * a roof garden and ridge skylights with the given chances; returns the keep-clear list (for the clutter after it).
 * Medium+: all; low: nothing (MASS.roofKit false).
 */
export function roofKit(g: Gen, r: KitRect, y: number, o: { keep?: KitRect[]; garden?: number; tank?: number; solar?: number; plant?: number; wall?: THREE.Color; rng?: Rng }): KitRect[] {
  if (!MASS.roofKit) return o.keep ?? [];
  const rng = o.rng ?? massRng(g);
  const t = g.trim;
  const pl = new RoofPlacer(r, rng, o.keep);
  const w = r.x1 - r.x0,
    d = r.z1 - r.z0;
  if (w < 2.5 || d < 2.5) return pl.keep;
  if (rng.chance(o.plant ?? 0.5) && w > 5 && d > 4) {
    const pw = Math.min(w * 0.4, rng.range(2.4, 4)),
      pd = Math.min(d * 0.4, rng.range(2, 3.2));
    const p = pl.place(pw, pd);
    if (p) plantRoom(t, p[0] - pw / 2, p[1] - pd / 2, p[0] + pw / 2, p[1] + pd / 2, y, rng.range(2.2, 2.8), o.wall ?? col('#c9c4b8'));
  }
  if (rng.chance(o.tank ?? 0.3)) {
    const tr = rng.range(0.85, 1.25);
    const p = pl.place(tr * 2 + 0.3, tr * 2 + 0.3);
    if (p) woodTank(t, p[0], p[1], y, tr, rng.range(1.8, 2.5), rng.range(1.4, 2.4));
  }
  if (rng.chance(o.garden ?? 0.25) && w > 4 && d > 4) {
    const gw = Math.min(w - 1, rng.range(3.2, 6)),
      gd = Math.min(d - 1, rng.range(3, 5));
    const p = pl.place(gw, gd, 10, 0.2);
    if (p) roofGarden(g, p[0] - gw / 2, p[1] - gd / 2, p[0] + gw / 2, p[1] + gd / 2, y, rng);
  }
  if (rng.chance(o.solar ?? 0.35)) {
    const s = southLocal(g);
    const sw = Math.min(w - 1, rng.range(3, 7)),
      sd = Math.min(d - 1, rng.range(2.5, 5));
    const p = pl.place(sw, sd, 10, 0.25);
    if (p) solarRows(t, p[0] - sw / 2, p[1] - sd / 2, p[0] + sw / 2, p[1] + sd / 2, y, s.alongX, s.sign);
  }
  if (MASS.q > 1 || rng.chance(0.5)) {
    const nV = 1 + rng.int(0, 2);
    for (let k = 0; k < nV; k++) {
      const p = pl.place(1.6, 0.8, 8, 0.2);
      if (p) vents(t, p[0], p[1], y, rng);
    }
  }
  if (rng.chance(0.4)) {
    const lw = rng.range(1.6, 3.2),
      ld = rng.range(0.9, 1.4);
    const p = pl.place(lw, ld, 8, 0.2);
    if (p) ridgeLight(t, p[0] - lw / 2, p[1] - ld / 2, p[0] + lw / 2, p[1] + ld / 2, y);
  }
  return pl.keep;
}
