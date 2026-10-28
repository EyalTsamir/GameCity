// Surface table for the hardscape shader. Every paved / natural surface is the same parametric
// pattern (tiles in running bond or grid, joints, bevel, per-tile tint, speckle, stains, stripes);
// the parameters travel as per-vertex attributes so the fragment shader has a single code path.
//
//   aS = (dCurb | 9, u (curb arclength / along-arm coordinate), special, frame)
//   aP = (tile size x, tile size y, joint width, joint darkness)
//   aV = (tile tint variance, bevel, bond offset (0 grid, 0.5 half bond, -1 random per row), speckle)
//   aC = base colour (linear)
//   aX = (stain amount, stripe period, stripe amplitude (+hard / -soft), roughness)
// special: 0 none, 1 tactile paving next to crosswalks, 2 radial rings near fountains, 3 grass creeping in,
//          4 quay (rust at bollards, oil, tyre streaks), 5 yard (oil, tyre streaks)
// bond: >= 0 row offset (running bond), -1 random row offsets, -2 herringbone (size.y = brick width)
// frame: 0 world xz, 1 world zx (rotated tiles), 2 curb coordinates (u along the curb)

import * as THREE from 'three';
import type { MeshBuilder } from './builder';

/** hardscape material ids — keys of the surface table */
export const HM = {
  walk: 0,
  curb: 1,
  curbFace: 2,
  gutter: 3,
  plaza: 4,
  concrete: 5,
  gravel: 6,
  sand: 7,
  field: 8,
  deck: 9,
  soil: 10,
  setts: 11,
  promenade: 12,
  platform: 13,
  quay: 14,
  pavers: 15,
  pathGravel: 16,
  pathPaved: 17,
  side: 18,
  shoulder: 19,
  patio: 20,
} as const;

interface Surf {
  size: [number, number];
  jw: number;
  jd: number;
  tint: number;
  bevel: number;
  bond: number;
  speck: number;
  color: string;
  stain: number;
  stripe: [number, number];
  rough: number;
  special: number;
  frame: number;
}

const base: Surf = { size: [1, 1], jw: 0.02, jd: 0, tint: 0, bevel: 0, bond: 0, speck: 0.12, color: '#888888', stain: 0, stripe: [0, 0], rough: 0.92, special: 0, frame: 0 };
const S = (o: Partial<Surf>): Surf => ({ ...base, ...o });

/** colours are given in linear space as 'r,g,b' strings for readability */
const lin = (r: number, g: number, b: number) => `${r},${g},${b}`;

const TABLE: Record<string, Surf> = {
  // sidewalks by district: granite slabs / old-town setts / concrete squares / industrial concrete
  [`${HM.walk}:0`]: S({ size: [1.2, 0.6], jw: 0.014, jd: 0.32, tint: 0.1, bond: 0.5, color: lin(0.47, 0.455, 0.43), stain: 0.12, special: 1 }),
  [`${HM.walk}:1`]: S({ size: [0.24, 0.17], jw: 0.03, jd: 0.5, tint: 0.26, bevel: 0.18, bond: 0.5, speck: 0.14, color: lin(0.42, 0.38, 0.33), stain: 0.1, rough: 0.85, special: 1 }),
  [`${HM.walk}:2`]: S({ size: [0.9, 0.9], jw: 0.016, jd: 0.3, tint: 0.07, color: lin(0.5, 0.48, 0.445), stain: 0.12, special: 1 }),
  [`${HM.walk}:3`]: S({ size: [2, 2], jw: 0.03, jd: 0.38, tint: 0.06, speck: 0.14, color: lin(0.43, 0.415, 0.39), stain: 0.2, special: 1 }),
  // curb stone, curb face, gutter channel (curb coordinates: joints every metre along the curb)
  // (W5: granite units with dark open joints, a clear tone step from stone to stone, tyre / grime stains)
  [`${HM.curb}:0`]: S({ size: [1, 1], jw: 0.009, jd: 0.75, tint: 0.15, bevel: 0.14, speck: 0.3, color: lin(0.55, 0.54, 0.515), stain: 0.22, rough: 0.8, frame: 2 }),
  [`${HM.curbFace}:0`]: S({ size: [1, 1], jw: 0.009, jd: 0.7, tint: 0.15, bevel: 0.14, speck: 0.26, color: lin(0.42, 0.41, 0.39), stain: 0.4, rough: 0.85, frame: 2 }),
  [`${HM.gutter}:0`]: S({ size: [2, 1], jw: 0.015, jd: 0.3, speck: 0.16, color: lin(0.3, 0.295, 0.285), stain: 0.12, frame: 2 }),
  // plazas: warm sandstone bond (+ radial rings near fountains), block forecourt granite (rotated grid)
  [`${HM.plaza}:0`]: S({ size: [0.8, 0.4], jw: 0.02, jd: 0.42, tint: 0.16, bevel: 0.04, bond: 0.5, speck: 0.1, color: lin(0.56, 0.46, 0.34), stain: 0.06, special: 2 }),
  [`${HM.plaza}:1`]: S({ size: [0.8, 0.4], jw: 0.02, jd: 0.42, tint: 0.16, bevel: 0.04, bond: 0.5, speck: 0.1, color: lin(0.56, 0.46, 0.34), stain: 0.06, special: 2 }),
  [`${HM.plaza}:2`]: S({ size: [0.6, 0.6], jw: 0.02, jd: 0.4, tint: 0.12, speck: 0.1, color: lin(0.38, 0.37, 0.355), stain: 0.1, frame: 1 }),
  // downtown: light granite large-format slabs (+ basalt band grid) · station: clay pavers in herringbone · midtown: buff pavers
  [`${HM.plaza}:3`]: S({ size: [1.0, 0.5], jw: 0.012, jd: 0.34, tint: 0.13, bevel: 0.03, bond: 0.5, speck: 0.12, color: lin(0.5, 0.49, 0.47), stain: 0.1 }),
  [`${HM.plaza}:4`]: S({ size: [0.2, 0.1], jw: 0.01, jd: 0.36, tint: 0.24, bevel: 0.12, bond: -2, speck: 0.1, color: lin(0.4, 0.22, 0.15), stain: 0.08 }),
  [`${HM.plaza}:5`]: S({ size: [0.6, 0.3], jw: 0.012, jd: 0.34, tint: 0.16, bevel: 0.05, bond: 0.5, speck: 0.1, color: lin(0.5, 0.44, 0.36), stain: 0.08, frame: 1 }),
  // concrete yards / container yard (special 5: oil blobs + tyre streaks)
  [`${HM.concrete}:0`]: S({ size: [4, 4], jw: 0.035, jd: 0.45, tint: 0.12, speck: 0.14, color: lin(0.42, 0.41, 0.385), stain: 0.36, special: 5 }),
  [`${HM.concrete}:1`]: S({ size: [6.5, 13], jw: 0.04, jd: 0.4, tint: 0.1, speck: 0.14, color: lin(0.38, 0.37, 0.35), stain: 0.36, special: 5 }),
  // gravel: construction site / freight yard
  [`${HM.gravel}:0`]: S({ speck: 0.45, color: lin(0.46, 0.37, 0.25), stain: 0.2, rough: 1 }),
  [`${HM.gravel}:1`]: S({ speck: 0.4, color: lin(0.36, 0.345, 0.32), stain: 0.2, rough: 1 }),
  // playground sand, football pitch, boardwalk planks
  [`${HM.sand}:0`]: S({ speck: 0.16, color: lin(0.72, 0.6, 0.38), stripe: [1.4, -0.06], rough: 1 }),
  [`${HM.field}:0`]: S({ speck: 0.12, color: lin(0.245, 0.46, 0.135), stripe: [6, 0.2], rough: 0.95, frame: 1 }),
  [`${HM.deck}:0`]: S({ size: [2.4, 0.24], jw: 0.022, jd: 0.6, tint: 0.24, bond: -1, speck: 0.12, color: lin(0.45, 0.3, 0.18), rough: 0.85 }),
  // allotment beds: furrowed soil, crop rows, leafy, straw
  [`${HM.soil}:0`]: S({ speck: 0.25, color: lin(0.3, 0.2, 0.13), stripe: [0.6, -0.35], rough: 1 }),
  [`${HM.soil}:1`]: S({ speck: 0.25, color: lin(0.24, 0.36, 0.13), stripe: [0.6, 0.6], rough: 1 }),
  [`${HM.soil}:2`]: S({ speck: 0.55, color: lin(0.25, 0.4, 0.15), rough: 1 }),
  [`${HM.soil}:3`]: S({ speck: 0.3, color: lin(0.58, 0.48, 0.25), stripe: [0.5, -0.25], rough: 1 }),
  // setts: old town block interiors / market square
  [`${HM.setts}:0`]: S({ size: [0.2, 0.15], jw: 0.028, jd: 0.55, tint: 0.3, bevel: 0.2, bond: 0.5, speck: 0.12, color: lin(0.38, 0.36, 0.335), stain: 0.08, rough: 0.82 }),
  [`${HM.setts}:1`]: S({ size: [0.26, 0.18], jw: 0.03, jd: 0.5, tint: 0.28, bevel: 0.18, bond: 0.5, speck: 0.12, color: lin(0.5, 0.4, 0.3), stain: 0.08, rough: 0.82 }),
  // promenade, station platform area, quay, driveway pavers
  [`${HM.promenade}:0`]: S({ size: [0.8, 1.2], jw: 0.016, jd: 0.32, tint: 0.08, bond: 0.5, speck: 0.1, color: lin(0.56, 0.5, 0.41), stain: 0.05, frame: 1 }),
  [`${HM.platform}:0`]: S({ size: [2, 2], jw: 0.02, jd: 0.3, tint: 0.04, speck: 0.1, color: lin(0.48, 0.465, 0.44), stain: 0.1 }),
  [`${HM.quay}:0`]: S({ size: [6, 6], jw: 0.05, jd: 0.48, tint: 0.16, speck: 0.16, color: lin(0.42, 0.405, 0.375), stain: 0.38, special: 4 }),
  [`${HM.pavers}:0`]: S({ size: [0.2, 0.1], jw: 0.011, jd: 0.4, tint: 0.2, bevel: 0.1, bond: -2, speck: 0.1, color: lin(0.45, 0.33, 0.28) }),
  // park paths
  [`${HM.pathGravel}:0`]: S({ speck: 0.36, color: lin(0.56, 0.48, 0.36), rough: 1 }),
  [`${HM.pathPaved}:0`]: S({ size: [0.4, 0.4], jw: 0.016, jd: 0.32, tint: 0.1, bevel: 0.05, bond: 0.5, speck: 0.1, color: lin(0.55, 0.48, 0.38), special: 2 }),
  // vertical sides: concrete, dark, earth, timber
  [`${HM.side}:0`]: S({ speck: 0.14, color: lin(0.5, 0.48, 0.45) }),
  [`${HM.side}:1`]: S({ speck: 0.14, color: lin(0.36, 0.35, 0.33) }),
  [`${HM.side}:2`]: S({ speck: 0.18, color: lin(0.34, 0.27, 0.18), rough: 1 }),
  [`${HM.side}:3`]: S({ speck: 0.2, color: lin(0.4, 0.28, 0.18), rough: 0.9 }),
  // garden patios: sandstone flags, grey pavers, timber decking, brick
  [`${HM.patio}:0`]: S({ size: [0.6, 0.6], jw: 0.012, jd: 0.4, tint: 0.2, bevel: 0.06, bond: 0.5, speck: 0.1, color: lin(0.6, 0.5, 0.36), stain: 0.08 }),
  [`${HM.patio}:1`]: S({ size: [0.4, 0.4], jw: 0.01, jd: 0.38, tint: 0.14, bevel: 0.08, speck: 0.1, color: lin(0.44, 0.43, 0.41), stain: 0.08 }),
  [`${HM.patio}:2`]: S({ size: [2.4, 0.145], jw: 0.012, jd: 0.65, tint: 0.22, bond: -1, speck: 0.1, color: lin(0.44, 0.29, 0.17), rough: 0.8 }),
  [`${HM.patio}:3`]: S({ size: [0.22, 0.11], jw: 0.011, jd: 0.35, tint: 0.24, bevel: 0.1, bond: 0.5, speck: 0.1, color: lin(0.46, 0.22, 0.14) }),
  // tunnel-road shoulder: gravel with grass creeping in
  [`${HM.shoulder}:0`]: S({ speck: 0.35, color: lin(0.45, 0.41, 0.34), special: 3, rough: 1 }),
};

const parsed = new Map<string, { s: Surf; c: THREE.Color }>();
function lookup(mat: number, variant: number): { s: Surf; c: THREE.Color } {
  const key = `${mat}:${variant}`;
  let e = parsed.get(key);
  if (!e) {
    const s = TABLE[key] ?? TABLE[`${mat}:0`] ?? base;
    const [r, g, b] = s.color.startsWith('#') ? [0.5, 0.5, 0.5] : s.color.split(',').map(Number);
    e = { s, c: new THREE.Color(r, g, b) };
    parsed.set(key, e);
  }
  return e;
}

export const HARD_ATTRS = [
  { name: 'aS', size: 4 },
  { name: 'aP', size: 4 },
  { name: 'aV', size: 4 },
  { name: 'aC', size: 3 },
  { name: 'aX', size: 4 },
  { name: 'aR', size: 4 },
  { name: 'aB', size: 4 },
];

/**
 * Band layout of the current cover (call after surf()): bands align to `r` (the plaza / block rectangle).
 *   period  — band grid spacing (0: none) · width — band width · border — border band width (0: none)
 *   macro   — per band-cell tint amplitude (readable patchwork at distance)
 */
export function band(H: MeshBuilder, r: { x0: number; z0: number; x1: number; z1: number }, period: number, width: number, border: number, macro: number): void {
  H.set('aR', r.x0, r.z0, r.x1, r.z1);
  H.set('aB', period, width, border, macro);
}

/** Rectangle only (specials that need the cover extent, e.g. tyre streak direction), no bands. */
export function coverRect(H: MeshBuilder, r: { x0: number; z0: number; x1: number; z1: number }, macro = 0): void {
  H.set('aR', r.x0, r.z0, r.x1, r.z1);
  H.set('aB', 0, 0, 0, macro);
}

/** Set the current hardscape surface (material id + variant), curb distance d and coordinate u. */
export function surf(H: MeshBuilder, mat: number, variant = 0, d = 9, u = 0, frame?: number): void {
  const { s, c } = lookup(mat, variant);
  H.set('aS', d, u, s.special, frame ?? s.frame);
  H.set('aP', s.size[0], s.size[1], s.jw, s.jd);
  H.set('aV', s.tint, s.bevel, s.bond, s.speck);
  H.set('aC', c.r, c.g, c.b);
  H.set('aX', s.stain, s.stripe[0], s.stripe[1], s.rough);
  H.set('aR', 0, 0, 0, 0);
  H.set('aB', 0, 0, 0, 0);
}
