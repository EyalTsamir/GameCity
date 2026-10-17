// Facade walls with real recessed openings: the wall is an extruded slab with holes
// (windows / doors / arcades), the glazing sits inside the reveal, and stone surrounds,
// sills and keystones add relief. Built in a canonical frame (wall facing +Z, front face
// at z = 0, thickness towards -Z) and placed with (x, z, ry) in landmark-local space.

import * as THREE from 'three';
import { Mat, PAT, withM } from './builder';
import { Kit, archPoints, pointedPoints, shapeGeoNorm } from './kit';

export interface Opening {
  /** centre x along the wall (from the wall's left end, metres) */
  x: number;
  /** bottom of the opening above the wall base */
  y: number;
  w: number;
  h: number;
  /** arch rise (0 = rectangular) */
  arch?: number;
  /** gothic pointed arch (uses `arch` as the rise) */
  pointed?: boolean;
  /** circular opening (w = diameter, y = bottom) */
  round?: boolean;
  /** 'window' (glazed, WINDOW pattern), 'door' (DOOR pattern), 'glass' (GLAZING), 'stained', 'louvre', 'dark' (unlit void), 'clock' (handled by caller) */
  fill?: 'window' | 'door' | 'glass' | 'stained' | 'louvre' | 'dark' | 'none';
  /** infill material override */
  infill?: Mat;
  /** recess depth of the infill */
  inset?: number;
  /** stone surround (architrave) */
  surround?: Mat;
  surroundW?: number;
  sill?: Mat;
  keystone?: Mat;
  /** night glow probability for windows */
  glow?: number;
  seed?: number;
}

export interface WallSpec {
  /** wall length and height */
  w: number;
  h: number;
  depth?: number;
  /** placement of the wall's front-face centre-bottom in landmark-local space */
  x: number;
  y: number;
  z: number;
  /** yaw of the outward normal (0 = +Z) */
  ry: number;
  mat: Mat;
  openings: Opening[];
  /** optional custom outline (2D, wall-local, CCW, origin bottom-left) — e.g. gables */
  outline?: [number, number][];
}

const _m = new THREE.Matrix4();

function openingPts(o: Opening, segs = 8): [number, number][] {
  if (o.round) {
    const out: [number, number][] = [];
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      out.push([o.x + Math.cos(a) * (o.w / 2), o.y + o.w / 2 + Math.sin(a) * (o.w / 2)]);
    }
    return out;
  }
  if (o.pointed && o.arch && o.arch > 0.01) {
    return pointedPoints(o.w, o.h, o.arch, Math.max(4, Math.round(segs * 0.75))).map(([x, y]) => [x + o.x, y + o.y] as [number, number]);
  }
  if (o.arch && o.arch > 0.01) {
    return archPoints(o.w, o.h, o.arch, segs).map(([x, y]) => [x + o.x, y + o.y] as [number, number]);
  }
  return [
    [o.x - o.w / 2, o.y],
    [o.x + o.w / 2, o.y],
    [o.x + o.w / 2, o.y + o.h],
    [o.x - o.w / 2, o.y + o.h],
  ];
}

/** Local matrix: wall-local (u along, v up, z out) → landmark-local. */
function wallMatrix(s: WallSpec, out: THREE.Matrix4): THREE.Matrix4 {
  // wall-local origin = left end of the front face (seen from outside), base
  out.makeRotationY(s.ry);
  const c = Math.cos(s.ry),
    sn = Math.sin(s.ry);
  // local +X of the wall maps to (c, 0, -sn); left end = centre - w/2 * that
  out.setPosition(s.x - (s.w / 2) * c, s.y, s.z + (s.w / 2) * sn);
  return out;
}

/** Build the wall slab with holes + infills + surrounds. */
export function wall(K: Kit, s: WallSpec): void {
  const depth = s.depth ?? 0.35;
  const outline = s.outline ?? [
    [0, 0],
    [s.w, 0],
    [s.w, s.h],
    [0, s.h],
  ];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const o of s.openings) {
    const pts = openingPts(o);
    shape.holes.push(new THREE.Path(pts.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  }
  // (the back lid stays: it is visible wherever a wall rises above the roofs behind it)
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth);
  wallMatrix(s, _m);
  K.geoM(s.mat, g, _m, 'box');
  g.dispose();
  for (const o of s.openings) infill(K, s, o, depth);
}

function infill(K: Kit, s: WallSpec, o: Opening, depth: number): void {
  const fill = o.fill ?? 'window';
  const inset = Math.min(o.inset ?? 0.16, depth - 0.02);
  wallMatrix(s, _m);
  // infill panel
  if (fill !== 'none') {
    let m: Mat;
    if (o.infill) m = o.infill;
    else if (fill === 'door') m = withM(s.mat, { c: '#5a3a26', pat: PAT.DOOR, rough: 0.6, glow: o.glow ?? 0.6, flood: 0, seed: o.seed ?? 0.3 });
    else if (fill === 'glass') m = withM(s.mat, { c: '#3c4a44', pat: PAT.GLAZING, rough: 0.2, glow: o.glow ?? 0.8, flood: 0, seed: 0.7 });
    else if (fill === 'stained') m = withM(s.mat, { pat: PAT.STAINED, rough: 0.4, glow: o.glow ?? 0.9, flood: 0, seed: o.seed ?? 0.4 });
    else if (fill === 'louvre') m = withM(s.mat, { c: '#5b4636', pat: PAT.LOUVRE, rough: 0.8, glow: 0, flood: 0 });
    else if (fill === 'dark') m = withM(s.mat, { c: '#1c1f22', pat: PAT.PLAIN, rough: 0.9, glow: 0, flood: 0 });
    else m = withM(s.mat, { c: '#e9e4d8', pat: PAT.WINDOW, rough: 0.3, glow: o.glow ?? 0.7, flood: 0, seed: o.seed ?? 0.5 });
    const pts = openingPts(o, 8).map(([x, y]) => [x - o.x + o.w / 2, y - o.y] as [number, number]);
    const pg = shapeGeoNorm(pts);
    pg.translate(o.x - o.w / 2, o.y, -inset);
    const ip = o.infill?.pat;
    const native = o.infill ? ip === PAT.WINDOW || ip === PAT.ROSE || ip === PAT.CLOCK || ip === PAT.STAINED || ip === PAT.DOOR : fill === 'window' || fill === 'door' || fill === 'stained';
    if (native) K.geoM(m, pg, _m, 'native');
    else K.geoM(m, pg, _m, 'box');
    pg.dispose();
  }
  // decorations (surround, sill, keystone) are small trims: distance-LOD detail mesh
  const prevDetail = K.b.forceDetail;
  K.b.forceDetail = true;
  // surround (architrave) around the opening, slightly proud of the wall
  if (o.surround) {
    const sw = o.surroundW ?? 0.18;
    const outer = o.round
      ? openingPts({ ...o, y: o.y - sw, w: o.w + sw * 2 }, 8)
      : openingPts({ ...o, x: o.x, y: o.y - 0.08, w: o.w + sw * 2, h: o.h + sw + 0.08, arch: o.arch ? o.arch + sw : 0 }, 8);
    const inner = openingPts(o, 8);
    const sh = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    sh.holes.push(new THREE.Path(inner.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
    const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false, curveSegments: 4 });
    K.geoM(o.surround, fg, _m, 'box');
    fg.dispose();
  }
  if (o.sill) {
    const sg = new THREE.BoxGeometry(o.w + 0.3, 0.1, 0.16);
    sg.translate(o.x, o.y - 0.05, 0.05);
    K.geoM(o.sill, sg, _m, 'box');
    sg.dispose();
  }
  if (o.keystone && o.arch) {
    const kg = new THREE.BoxGeometry(0.32, 0.42, 0.1);
    kg.translate(o.x, o.y + o.h + 0.05, 0.05);
    K.geoM(o.keystone, kg, _m, 'box');
    kg.dispose();
  }
  K.b.forceDetail = prevDetail;
}

/** Evenly spaced openings along a wall of length w (n bays), centred in each bay. */
export function bays(w: number, n: number, make: (cx: number, i: number) => Opening | Opening[] | null, margin = 0): Opening[] {
  const out: Opening[] = [];
  const bw = (w - margin * 2) / n;
  for (let i = 0; i < n; i++) {
    const o = make(margin + bw * (i + 0.5), i);
    if (!o) continue;
    if (Array.isArray(o)) out.push(...o);
    else out.push(o);
  }
  return out;
}

/** A horizontal moulding (cornice / string course) along a wall, proud by `out`. */
export function moulding(K: Kit, m: Mat, x: number, z: number, ry: number, len: number, y: number, h: number, out: number): void {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  // centre of the moulding: front face of the wall + out/2 along the normal
  K.box(m, len, h, out, x + s * (out / 2), y, z + c * (out / 2), ry);
}

