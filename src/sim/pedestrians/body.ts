// Procedural "sculpted model-railway figure" geometry for the pedestrians.
//
// One mesh per level of detail (LOD0 < ~44 m, lo, tiny) containing a closed, smooth body (lofted
// torso, neck and egg-shaped head, continuous arm→hand and thigh→shin limbs with thumbs and shoe
// lasts), the hair cap and long-hair sheet, ponytail / bun / beard, a hat (dome + brim + visor whose
// shape the shader picks per style), the skirt / dress / coat "tail", collar / lapels / tie and the
// carried props. Each mesh is built four times — average man, woman, 7-year-old boy, heavy build —
// with identical topology; the differences are stored as packed per-vertex morph deltas, so any
// figure is a blend of the four in the vertex shader (see rig.ts / shader.ts).
//
// Per-vertex data (all integer-packed, see shader.ts):
//   position / normal   the average man, rest pose
//   aMorph  (uvec4)     woman Δxyz, child Δxyz, heavy Δxz  (16-bit fixed, ±1 m)
//   aData   (uvec4)     x: bone | region << 5 | feature code << 10 | negate << 16 | tint << 24
//                       y: hem coordinate h (16 bit, −2…2) | skin weight of the parent bone (16 bit)
//                       z: aux1 | aux2 (16-bit fixed, ±8)  — part-specific parameters
//                       w: woman normal Δ (3 × 10-bit)
// Colour regions are resolved in the shader from per-instance colours and hem parameters, so
// sleeves / trousers / tops / skirts are continuous parameters instead of hidden meshes.

import { shapeOn } from '../../core/sweepshape';
import { detailPeople } from '../../core/detailPeople';
import { closePeople } from '../../core/closePeople';
import { sweepPeople } from '../../core/sweepPeople';
import * as THREE from 'three';
import { flatConvention } from '../../core/perfdeep';
import { TARGETS, TORSO_H, type BodyRing, type Dims, type FootRing, type LimbRing, type V3 } from './rig';

// ───────────────────────────────────────────────────────────── codes ──

export const BONE = {
  PELVIS: 0,
  SPINE: 1,
  CHEST: 2,
  HEAD: 3,
  THIGH_L: 4,
  SHIN_L: 5,
  FOOT_L: 6,
  THIGH_R: 7,
  SHIN_R: 8,
  FOOT_R: 9,
  UPPER_L: 10,
  FORE_L: 11,
  HAND_L: 12,
  UPPER_R: 13,
  FORE_R: 14,
  HAND_R: 15,
  GROUND: 16,
  TAIL: 17,
  BAG_L: 18,
  BAG_R: 19,
  CANE: 20,
  UMB: 21,
} as const;

export const REG = {
  SKIN: 0,
  TORSO: 1,
  ARM: 2,
  LEG: 3,
  FOOT: 4,
  NECK: 5,
  HAIR: 6,
  HAT: 7,
  BAG: 8,
  WHITE: 9,
  DARK: 10,
  ACCENT: 11,
  EXTRA: 12,
  TAIL: 13,
  OUTER: 14,
  BEARD: 15,
  COLLAR: 16,
  HATBAND: 17,
  STRAP: 18,
  LIPS: 19,
  TOWEL: 20,
  /** close-level face skin: painted eyes / brows / lips in the fragment shader from face coords (aux) */
  FACE: 21,
} as const;

/** Render feature bits (per-instance mask; a vertex with a feature shows only when its bit is set). */
export const FB = {
  HAIR: 0,
  HAIRLONG: 1,
  PONY: 2,
  BUN: 3,
  BEARD: 4,
  HAT: 5,
  BRIM: 6,
  VISOR: 7,
  BACKPACK: 8,
  SHOULDERBAG: 9,
  SHOPBAG: 10,
  BRIEFCASE: 11,
  TAIL: 12,
  TIE: 13,
  COLLAR: 14,
  LAPELS: 15,
  VEST: 16,
  TOWEL: 17,
  UMBRELLA: 18,
  CANE: 19,
  NEWSPAPER: 20,
  ROD: 21,
  PHONE: 22,
  CUP: 23,
  HOOD: 24,
  MOUSTACHE: 25,
  FRINGE: 26,
  /** shown only when NO hat is worn (hair volume on the crown) */
  NOHAT: 27,
  /** close level: separate locks over the cap (hair that isn't cropped, no hat) */
  LOCKS: 28,
} as const;

/** close level only, decided in the vertex shader from the person's hash (no bits left in the mask) */
export const FX = { GLASSES: 29, EARRINGS: 30, EARS: 31 } as const;

/** 0 near (< 40 m), 1 lo, 2 tiny, 3 pin, 4 close (< ~15 m: sculpted face, fingers, fabric detail) */
export type Lod = 0 | 1 | 2 | 3 | 4;

// ─────────────────────────────────────────────────────────── builder ──

type P3 = [number, number, number];

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: P3, s: number): P3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: P3): P3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp3 = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const pv = (v: V3, sx = 1): P3 => [v.x * sx, v.y, v.z];
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const se = (u: number, n: number) => Math.sign(u) * Math.pow(Math.abs(u), 2 / n);

class MeshBuilder {
  pos: number[] = [];
  /** stand-in positions for vertices whose rest position is degenerate (parametric skirt rings, the
   *  outer brim ring): used for the normals only (figureMesh) */
  standIn = new Map<number, P3>();
  /** vertices whose normal leans towards a horizontal direction: (x, z, share) */
  nHint = new Map<number, [number, number, number]>();
  d0: number[] = [];
  d1: number[] = [];
  d2: number[] = [];
  idx: number[] = [];
  private bone = 0;
  private reg = 0;
  private feat = 0;
  private neg = 0;
  private tint = 1;

  /** feature: bit index (FB.*) or -1; negate: visible only when the bit is NOT set */
  use(bone: number, reg: number, feature = -1, tint = 1, negate = false): this {
    this.bone = bone;
    this.reg = reg;
    this.feat = feature < 0 ? 0 : feature + 1;
    this.neg = negate ? 1 : 0;
    this.tint = tint;
    return this;
  }
  setTint(t: number): this {
    this.tint = t;
    return this;
  }
  setBone(b: number): this {
    this.bone = b;
    return this;
  }

  get count(): number {
    return this.pos.length / 3;
  }

  /** add a vertex; h hem coordinate, w parent-bone weight, a1/a2 aux parameters */
  v(p: P3, h = 0, w = 0, a1 = 0, a2 = 0, tint = this.tint, bone = this.bone): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    const t8 = clamp(Math.round(tint * 200), 0, 255);
    this.d0.push((bone | (this.reg << 5) | (this.feat << 10) | (this.neg << 16) | (t8 << 24)) >>> 0);
    const h16 = clamp(Math.round(((h + 2) / 4) * 65535), 0, 65535);
    const w16 = clamp(Math.round(w * 65535), 0, 65535);
    this.d1.push((h16 | (w16 << 16)) >>> 0);
    this.d2.push((fx16(a1) | (fx16(a2) << 16)) >>> 0);
    return i;
  }

  /** triangle wound so that its normal points away from `inside` */
  triOut(a: number, b: number, c: number, inside: P3): void {
    const P = this.pos;
    const pa: P3 = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]];
    const pb: P3 = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
    const pc: P3 = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
    const n = cross(sub(pb, pa), sub(pc, pa));
    const cen = mul(add(add(pa, pb), pc), 1 / 3);
    if (dot(n, sub(cen, inside)) < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }
  /** triangle with the given outward direction */
  triDir(a: number, b: number, c: number, dir: P3): void {
    const P = this.pos;
    const pa: P3 = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]];
    const pb: P3 = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
    const pc: P3 = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
    const n = cross(sub(pb, pa), sub(pc, pa));
    if (dot(n, dir) < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }
  quadOut(a: number, b: number, c: number, d: number, inside: P3): void {
    this.triOut(a, b, c, inside);
    this.triOut(a, c, d, inside);
  }
  quadDir(a: number, b: number, c: number, d: number, dir: P3): void {
    this.triDir(a, b, c, dir);
    this.triDir(a, c, d, dir);
  }
}

function fx16(v: number): number {
  return clamp(Math.round((v + 8) * 4096), 0, 65535);
}

/** One ring of a loft: its vertex ids and the interior reference point. */
interface Ring {
  ids: number[];
  c: P3;
}

/** connect consecutive rings (equal side counts) */
function bridge(b: MeshBuilder, rings: Ring[], closed = true): void {
  for (let j = 0; j < rings.length - 1; j++) {
    const A = rings[j],
      B = rings[j + 1];
    const n = A.ids.length;
    const inside = lerp3(A.c, B.c, 0.5);
    for (let k = 0; k < (closed ? n : n - 1); k++) {
      const k1 = (k + 1) % n;
      b.quadOut(A.ids[k], A.ids[k1], B.ids[k1], B.ids[k], inside);
    }
  }
}

/** fan cap on a ring towards an apex vertex */
function capFan(b: MeshBuilder, r: Ring, apex: number, inside: P3): void {
  const n = r.ids.length;
  for (let k = 0; k < n; k++) b.triOut(r.ids[k], r.ids[(k + 1) % n], apex, inside);
}

// ─────────────────────────────────────────────────────── level config ──

interface LodCfg {
  torsoSides: number;
  torsoRings: number[];
  headSides: number;
  headRings: number[];
  neck: number[] | null;
  neckSides: number;
  limbSides: number;
  upper: number[];
  fore: number[];
  hand: 'fingers' | 'full' | 'paddle' | 'none';
  thigh: number[];
  shin: number[];
  footSides: number;
  foot: number[];
  hairCap: number[];
  hairLong: number[];
  tailSides: number;
  tailRings: number;
  details: boolean;
  props: 'all' | 'mid' | 'far' | 'pin';
  /** close level: sculpted head with a face, fingers */
  close?: boolean;
  hairSides?: number;
}

const LODS: Record<Lod, LodCfg> = {
  0: {
    torsoSides: 12,
    torsoRings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    headSides: 10,
    headRings: [0, 1, 2, 3, 4, 5, 6, 7],
    neck: [0, 1, 2],
    neckSides: 8,
    limbSides: 8,
    upper: [0, 1, 2, 3, 5],
    fore: [0, 1, 2, 3, 4],
    hand: 'full',
    thigh: [0, 1, 2, 3, 5],
    shin: [0, 2, 3, 4, 5, 6],
    footSides: 8,
    foot: [0, 1, 2, 5, 6, 7],
    hairCap: [0, 0.4, 0.8, 1],
    hairLong: [0.08, 0.2, 0.42],
    tailSides: 10,
    tailRings: 4,
    details: true,
    props: 'all',
  },
  1: {
    torsoSides: 8,
    torsoRings: [0, 2, 4, 5, 7, 9, 11],
    headSides: 6,
    headRings: [0, 1, 3, 5, 7],
    neck: [0, 2],
    neckSides: 6,
    limbSides: 6,
    upper: [1, 4],
    fore: [0, 4],
    hand: 'paddle',
    thigh: [0, 1, 5],
    shin: [0, 3, 6],
    footSides: 6,
    foot: [1, 2, 6],
    hairCap: [0, 0.45, 0.82, 1],
    hairLong: [0.42],
    tailSides: 8,
    tailRings: 3,
    details: false,
    props: 'mid',
  },
  2: {
    torsoSides: 6,
    torsoRings: [0, 2, 5, 9, 11],
    headSides: 5,
    headRings: [1, 4, 7],
    neck: [0, 2],
    neckSides: 4,
    limbSides: 4,
    upper: [1, 4],
    fore: [0, 4],
    hand: 'none',
    thigh: [1, 4],
    shin: [0, 3, 6],
    footSides: 4,
    foot: [1, 6],
    hairCap: [0, 0.7, 1],
    hairLong: [0.42],
    tailSides: 6,
    tailRings: 3,
    details: false,
    props: 'far',
  },
  // pin: hero-overview figures (< 9 px): a coloured stick figure with head, hair / hat, tail
  3: {
    torsoSides: 4,
    torsoRings: [1, 5, 9, 11],
    headSides: 4,
    headRings: [0, 6],
    neck: [], // the head sits on the torso (sub-pixel gap at > 300 m)
    neckSides: 4,
    limbSides: 3,
    upper: [1],
    fore: [4],
    hand: 'none',
    thigh: [1],
    shin: [6],
    footSides: 0,
    foot: [],
    hairCap: [0, 1],
    hairLong: [],
    tailSides: 4,
    tailRings: 2,
    details: false,
    props: 'pin',
  },
  4: {
    torsoSides: 20,
    torsoRings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    headSides: 44,
    headRings: [0, 1, 2, 3, 4, 5, 6, 7],
    neck: [0, 1, 2],
    neckSides: 16,
    limbSides: 12,
    upper: [0, 1, 2, 3, 4, 5],
    fore: [0, 1, 2, 3, 4],
    hand: 'fingers',
    thigh: [0, 1, 2, 3, 4, 5],
    shin: [0, 1, 2, 3, 4, 5, 6],
    footSides: 12,
    foot: [0, 1, 2, 3, 4, 5, 6, 7],
    hairCap: [0, 0.09, 0.18, 0.29, 0.4, 0.51, 0.62, 0.72, 0.8, 0.87, 0.92, 0.96, 0.985, 1],
    hairLong: [0.04, 0.08, 0.14, 0.2, 0.25, 0.3, 0.36, 0.42],
    tailSides: 16,
    tailRings: 4,
    details: true,
    props: 'all',
    close: true,
    hairSides: 40,
  },
};

// torso ring → (bone, parent weight)
const TORSO_BONE: [number, number][] = [
  [BONE.PELVIS, 0],
  [BONE.PELVIS, 0],
  [BONE.PELVIS, 0],
  [BONE.PELVIS, 0],
  [BONE.SPINE, 0.8],
  [BONE.SPINE, 0.4],
  [BONE.SPINE, 0],
  [BONE.CHEST, 0.55],
  [BONE.CHEST, 0.15],
  [BONE.CHEST, 0],
  [BONE.CHEST, 0],
  [BONE.CHEST, 0],
];
// (hip blend: the dark rings at the bottom of the torso against a bright thigh drew a pair of briefs on light trousers)
const HIP_BLEND = detailPeople('hipblend');
const TORSO_TINT = [HIP_BLEND ? 0.93 : 0.82, HIP_BLEND ? 0.98 : 0.92, 1, 1, 1, 1, 1, 1, 0.96, 1, 1.02, 1];

// ──────────────────────────────────────────────────────── body parts ──

function torsoPoint(r: BodyRing, bust: number, phi: number, n = 2.3): P3 {
  const s = Math.sin(phi),
    c = Math.cos(phi);
  const d = c >= 0 ? r.f : r.b;
  let z = r.cz + d * se(c, n);
  if (bust > 0 && c > 0) {
    const a = Math.abs(Math.atan2(s, c));
    z += bust * Math.max(0, 1 - Math.abs(a - 0.52) / 0.42);
  }
  return [r.hw * se(s, n), r.y, z];
}

/** close level: the shoulder's rings stay inside the arm's cap (a corner stood out above the sleeve), the pelvis goes in behind the thighs */
function closeTorsoRing(d: Dims, i: number): BodyRing {
  const r = d.torso[i];
  if (i === 0) return { ...r, hw: r.hw * 0.82, f: r.f * 0.82, b: r.b * 0.82 };
  if (i === 1) return { ...r, hw: r.hw * 0.8, f: r.f * 0.72, b: r.b * 0.82 };
  if (i === 2) return { ...r, f: r.f * 0.86, b: r.b * 0.96 };
  if (i === 9) return { ...r, hw: r.hw * 0.97 };
  if (i === 10) return { ...r, hw: r.hw * 1.1, y: r.y - 0.006 };
  return r;
}

const YOKE_T = [0.14, 0.28, 0.42, 0.56, 0.7, 0.82, 0.92, 1];
/** close level: a ring of the yoke, t 0 (shoulder ring) … 1 (just inside the neck, about its first third) */
function yokeRing(d: Dims, t: number): BodyRing {
  const R = closeTorsoRing(d, 10);
  const N = closeNeck(d, 0),
    N1 = closeNeck(d, 1);
  const k = 0.72;
  const E = { y: N.y + (N1.y - N.y) * k, hw: N.hw + (N1.hw - N.hw) * k + 0.0005, f: N.f + (N1.f - N.f) * k + 0.0005, b: N.b + (N1.b - N.b) * k + 0.0005, cz: N.cz + (N1.cz - N.cz) * k };
  const u = Math.min(1, t / 0.92);
  // (the last row dives into the neck: a steep crossing leaves a clean line, two nearly parallel tubes a zigzag)
  const inn = t > 0.92 ? 0.008 : 0;
  const L = (a: number, c: number) => a + (c - a) * u - inn;
  // (rising more steeply close to the neck: the trapezius)
  return { y: R.y + (E.y - R.y) * Math.pow(u, 1.7), hw: L(R.hw, E.hw), f: L(R.f, E.f), b: L(R.b, E.b), cz: R.cz + (E.cz - R.cz) * u };
}

function buildTorso(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const n = cfg.torsoSides;
  const rings: Ring[] = [];
  // close level: Catmull-Rom rings between the chest / shoulder rings (a rounded shoulder line, no corner)
  const steps: number[] = [];
  for (const ri of cfg.torsoRings) {
    if (cfg.close && ri >= 8) for (const f of [2 / 3, 1 / 3]) steps.push(ri - f);
    steps.push(ri);
  }
  const T = cfg.close ? d.torso.map((_, i) => closeTorsoRing(d, i)) : d.torso;
  const lerpR = (x: number) => {
    const i = Math.min(T.length - 2, Math.floor(x)),
      t = x - i;
    const g = (k: number) => T[Math.max(0, Math.min(T.length - 1, k))];
    const cr = (f: (r: BodyRing) => number) => {
      const a = f(g(i - 1)),
        b0 = f(g(i)),
        c0 = f(g(i + 1)),
        e = f(g(i + 2));
      return 0.5 * (2 * b0 + (-a + c0) * t + (2 * a - 5 * b0 + 4 * c0 - e) * t * t + (-a + 3 * b0 - 3 * c0 + e) * t * t * t);
    };
    const r: BodyRing = { y: cr((r) => r.y), hw: cr((r) => r.hw), f: cr((r) => r.f), b: cr((r) => r.b), cz: cr((r) => r.cz) };
    const L = (A: number[]) => A[i] + (A[i + 1] - A[i]) * t;
    return { r, bust: L(d.bust), h: L(TORSO_H), w: TORSO_BONE[i][1] + (TORSO_BONE[i + 1][1] - TORSO_BONE[i][1]) * t, tint: L(TORSO_TINT), bone: TORSO_BONE[i + (t > 0.5 ? 1 : 0)][0] };
  };
  for (const x of steps) {
    if (cfg.close && x > 10) continue;
    const ri = Math.round(x);
    const exact = Math.abs(x - ri) < 1e-6;
    const q = exact ? { r: T[ri], bust: d.bust[ri], h: TORSO_H[ri], w: TORSO_BONE[ri][1], tint: TORSO_TINT[ri], bone: TORSO_BONE[ri][0] } : lerpR(x);
    b.use(q.bone, REG.TORSO, -1, cfg.close && ri < 3 ? 1 : q.tint);
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      ids.push(b.v(torsoPoint(q.r, q.bust, phi), q.h, q.w, Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))), Math.sin(phi)));
    }
    rings.push({ ids, c: [0, q.r.y, q.r.cz] });
  }
  if (cfg.close) {
    // the yoke: from the shoulder ring in to the neck's own outline, so the torso meets the neck in one clean ring instead of two tubes
    // cutting each other in a jagged star. The neckline is drawn on it by the fragment shader (h, angle): any shape, no polygons.
    b.use(TORSO_BONE[10][0], REG.TORSO, -1, 1);
    for (const t of YOKE_T) {
      const r = yokeRing(d, t);
      b.setTint(1 - 0.08 * t);
      const ids: number[] = [];
      for (let k = 0; k < n; k++) {
        const phi = (k / n) * Math.PI * 2;
        ids.push(b.v(torsoPoint(r, 0, phi, 2.3 - 0.3 * t), TORSO_H[10] + (1 - TORSO_H[10]) * t, TORSO_BONE[10][1], Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))), Math.sin(phi)));
      }
      rings.push({ ids, c: [0, r.y - 0.04, r.cz] });
    }
  }
  bridge(b, rings);
  // bottom cap (crotch)
  const r0 = d.torso[cfg.torsoRings[0]];
  b.use(BONE.PELVIS, REG.TORSO, -1, 0.75);
  const apex = b.v([0, r0.y - 0.03 * (d.H / 1.76), r0.cz - 0.005], 0, 0, 0, 0);
  capFan(b, rings[0], apex, [0, r0.y + 0.05, r0.cz]);
  if (cfg.close) return;
  // top: the neck closes it (torso top ring hidden inside the neck)
  const rt = d.torso[cfg.torsoRings[cfg.torsoRings.length - 1]];
  b.use(BONE.CHEST, REG.TORSO, -1, 1);
  const top = b.v([0, rt.y + 0.01, rt.cz], 1, 0, 0, 0);
  capFan(b, rings[rings.length - 1], top, [0, rt.y - 0.05, rt.cz]);
}

/** close level: hair and hats follow the smooth (Catmull-Rom) head profile of buildCloseHead, not the ring polygon */
let smoothHead = false;

function headSurface(d: Dims, phi: number, y: number, push = 0): P3 {
  // interpolate the head rings at height y (clamped to the ring range)
  const R = d.headRings;
  if (smoothHead && y >= R[0].y) {
    const p = torsoPoint(headRingAt(d, Math.min(y, d.crown)), 0, phi, 2.1);
    // (along the dome's normal: a sideways-only push leaves a flat disc and a cone on top, the pointed hats and hair)
    const ye = d.headRings[4].y;
    const yT = ye + 0.03 * ((d.crown - d.headRings[0].y) / 0.232);
    const up = clamp((y - yT) / (d.crown - yT), 0, 1);
    const ca = Math.sqrt(Math.max(0, 1 - up * up));
    p[0] += Math.sin(phi) * push * ca;
    p[1] += push * up;
    p[2] += Math.cos(phi) * push * ca;
    return p;
  }
  let i = 0;
  while (i < R.length - 2 && R[i + 1].y < y) i++;
  const a = R[i],
    c = R[i + 1];
  const t = clamp((y - a.y) / (c.y - a.y), 0, 1.6);
  const r: BodyRing = { y, hw: a.hw + (c.hw - a.hw) * t, f: a.f + (c.f - a.f) * t, b: a.b + (c.b - a.b) * t, cz: a.cz + (c.cz - a.cz) * t };
  if (y > R[R.length - 1].y) {
    // above the last ring: close towards the crown (spherical falloff)
    const top = R[R.length - 1];
    const u = clamp((y - top.y) / (d.crown - top.y), 0, 1);
    const k = Math.sqrt(Math.max(0, 1 - u * u));
    r.hw = top.hw * k;
    r.f = top.f * k;
    r.b = top.b * k;
    r.cz = top.cz;
  }
  const p = torsoPoint(r, 0, phi, 2.1);
  if (push) {
    const nx = Math.sin(phi),
      nz = Math.cos(phi);
    p[0] += nx * push;
    p[2] += nz * push;
  }
  return p;
}

/** close level: the neck tapers to the skull and stays inside it (a tube of one width stood out behind the jaw as a post) */
function closeNeck(d: Dims, i: number): BodyRing {
  const r = d.neckRings[i];
  const kw = [1.03, 0.95, 0.9][i],
    kf = [1, 0.9, 0.84][i],
    kb = [1.03, 0.98, 0.94][i];
  // (its top goes on up inside the skull: the nape meets the head well above the jaw)
  return { y: r.y + (i === 2 ? 0.028 : 0), hw: r.hw * kw, f: r.f * kf, b: r.b * kb, cz: r.cz };
}

function buildNeckHead(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  // neck (skin, region NECK so collars / turtlenecks can colour it)
  if (cfg.neck) {
    const n = cfg.neckSides;
    const rings: Ring[] = [];
    const W = [1, 0.55, 0.12];
    const H = [1.0, 1.12, 1.25];
    for (const ri of cfg.neck) {
      const r = cfg.close ? closeNeck(d, ri) : d.neckRings[ri];
      // (the jaw's shade on the throat: the head is otherwise cut out against a neck of the same brightness)
      b.use(BONE.HEAD, REG.NECK, -1, ri === 0 ? 0.92 : ri === 1 ? 0.8 : 0.62);
      const ids: number[] = [];
      const nTint = ri === 0 ? 0.92 : ri === 1 ? 0.8 : 0.62;
      for (let k = 0; k < n; k++) {
        // (close: the jaw's shade only in front; at the nape it drew a line round the head)
        if (cfg.close) b.setTint(1 - (1 - nTint) * sstep(-0.3, 0.4, Math.cos((k / n) * Math.PI * 2)));
        ids.push(b.v(torsoPoint(r, 0, (k / n) * Math.PI * 2, 2), H[ri], W[ri]));
      }
      rings.push({ ids, c: [0, r.y, r.cz] });
    }
    bridge(b, rings);
  }
  if (cfg.close) {
    buildCloseHead(b, d, cfg);
    return;
  }
  // head: egg loft from under the jaw to the crown; nose wedge, ears, eye band
  const n = cfg.headSides;
  const rings: Ring[] = [];
  const detail = cfg.details;
  for (const ri of cfg.headRings) {
    const r = d.headRings[ri];
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const p = torsoPoint(r, 0, phi, 2.1);
      let tint = ri === 0 ? 0.86 : 1;
      let reg: number = REG.SKIN;
      const front = Math.cos(phi);
      if (detail) {
        if (k === 0 && ri === 3) p[2] += d.nose;
        if (k === 0 && ri === 4) p[2] += d.nose * 0.42;
        if (k === 0 && ri === 2) {
          p[2] += 0.003;
          reg = REG.LIPS;
        }
        // eye sockets / brows (soft darkening, never dots)
        if (ri === 4 && front > 0.5 && k !== 0) tint = 0.56;
        if (ri === 4 && k === 0) tint = 0.9;
        if (ri === 5 && front > 0.5 && k !== 0) tint = 0.82;
        // ears: low flat bumps at the sides
        if ((ri === 3 || ri === 4) && Math.abs(Math.sin(phi)) > 0.9) {
          p[0] += Math.sign(Math.sin(phi)) * 0.008 * (d.H / 1.76);
          tint = 0.94;
        }
        // cheeks a little warmer / lighter
        if ((ri === 2 || ri === 3) && front > 0.3 && front < 0.95) tint = Math.max(tint, 1.03);
      } else if (ri === 3 && k === 0) p[2] += d.nose * 0.5;
      b.use(BONE.HEAD, reg, -1, tint);
      ids.push(b.v(p, 2, 0));
    }
    rings.push({ ids, c: [0, r.y, r.cz] });
  }
  bridge(b, rings);
  const top = d.headRings[cfg.headRings[cfg.headRings.length - 1]];
  b.use(BONE.HEAD, REG.SKIN, -1, 1);
  const crown = b.v([0, d.crown, top.cz - 0.005], 2, 0);
  capFan(b, rings[rings.length - 1], crown, [0, top.y - 0.05, top.cz]);
  const bot = d.headRings[cfg.headRings[0]];
  b.use(BONE.HEAD, REG.SKIN, -1, 0.8);
  const chin = b.v([0, bot.y - 0.006, bot.cz + 0.01], 2, 0);
  capFan(b, rings[0], chin, [0, bot.y + 0.05, bot.cz]);
}

// ───────────────────────────────────────────────────────── close head ──
// The close level (< ~15 m) sculpts a real face into a dense head loft: brow ridge, eye sockets with lids,
// nose (bridge, tip, wings), cheekbones, lips, chin, jaw, ears. Face coordinates (X lateral, Y up from the
// eye line, in metres of the average man's head) ride in aux so the fragment shader paints eyes, brows,
// lips and nostrils crisply (shader.ts FACE_PAINT). Every target runs the same sampling (same topology).

const gs = (x: number, y: number, sx: number, sy: number) => Math.exp(-((x * x) / (sx * sx) + (y * y) / (sy * sy)));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// The head's form on the average man (Y up from the eye line, half width, depth in front of and behind the axis): a skull
// that closes in a dome, widest above the ears; the back of the head swells over the occiput and runs into the neck instead of
// meeting it in a shelf; the jaw narrows to the chin, its underside rising towards the back (no bag of head behind the throat). The other targets scale it by their own rings.
const HEAD_FORM: [number, number, number, number][] = [
  [-0.118, 0.037, 0.054, 0.012],
  [-0.108, 0.048, 0.066, 0.026],
  [-0.09, 0.0585, 0.075, 0.046],
  [-0.06, 0.0685, 0.08, 0.074],
  [-0.03, 0.0745, 0.084, 0.094],
  [0, 0.0758, 0.0885, 0.109],
  [0.03, 0.0778, 0.0885, 0.113],
];
const FORM_TOP = 0.03;
/** head ring at height y: smooth through the form above, a super-elliptic dome from the temples to the crown */
function headRingAt(d: Dims, y: number): BodyRing {
  const R = d.headRings;
  const ye = R[4].y;
  const k = (d.crown - R[0].y) / 0.232;
  const kw = R[4].hw / 0.0775,
    kf = R[4].f / 0.088,
    kb = R[5].b / 0.107;
  const Y = (y - ye) / k;
  const yc = (d.crown - ye) / k;
  const cz = R[4].cz;
  if (Y > FORM_TOP) {
    const u = clamp((Y - FORM_TOP) / (yc - FORM_TOP), 0, 1);
    const e = Math.pow(1 - Math.pow(u, 2.3), 1 / 2.3);
    const T = HEAD_FORM[HEAD_FORM.length - 1];
    return { y, hw: T[1] * kw * e, f: T[2] * kf * e, b: T[3] * kb * e, cz };
  }
  const F = HEAD_FORM;
  let i = 0;
  while (i < F.length - 2 && F[i + 1][0] < Y) i++;
  const t = clamp((Y - F[i][0]) / (F[i + 1][0] - F[i][0]), Y < F[0][0] ? -1 : 0, 1);
  const p0 = F[Math.max(0, i - 1)],
    p1 = F[i],
    p2 = F[i + 1],
    p3 = F[Math.min(F.length - 1, i + 2)];
  const cr = (j: number) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t);
  return { y, hw: cr(1) * kw, f: cr(2) * kf, b: cr(3) * kb, cz };
}

/** face relief (m, average-man units) at face coords U (arc length round the head from the nose, ≈ lateral near the
 *  middle, keeps growing round the side: a stamp in plain X would squeeze into a crease where the head turns away),
 *  Y (up from the eye line). Broad forms only: the mesh is about 3 mm here; the fine forms are in the baked face map. */
export function faceRelief(U: number, Y: number, nose: number): number {
  const ax = Math.abs(U);
  let r = 0;
  // brow ridge and glabella, eye sockets, the eyeball under its lids, the hollow of the temple
  r += 0.002 * gs(ax - 0.03, Y - 0.0195, 0.028, 0.0085);
  r += 0.0016 * gs(U, Y - 0.013, 0.012, 0.009);
  r -= 0.0058 * gs(ax - 0.032, Y + 0.0005, 0.0185, 0.0125);
  r += 0.0036 * gs(ax - 0.0315, Y + 0.0005, 0.0135, 0.0072);
  r -= 0.0022 * gs(ax - 0.077, Y - 0.018, 0.016, 0.022);
  // cheekbone, running back into the arch before the ear; the soft plane below it; the mouth's barrel; the jaw line
  r += 0.0034 * gs(ax - 0.048, Y + 0.032, 0.028, 0.024);
  r += 0.0012 * gs(ax - 0.074, Y + 0.022, 0.024, 0.017);
  r += 0.0016 * gs(ax - 0.05, Y + 0.064, 0.03, 0.03);
  r += 0.0052 * gs(U, Y + 0.066, 0.034, 0.026);
  // nose: starts at the root between the eyes, bridge rising to the tip, wings, the underside back to the lip
  const nk = nose / 0.024;
  const tipY = -0.041;
  const up = sstep(0.016, 0.004, Y);
  const prof = Y > tipY ? up * (0.0032 + (0.0165 * nk - 0.0032) * Math.pow(sstep(0.008, tipY, Y), 1.25)) : 0.0165 * nk * (1 - sstep(tipY + 0.0015, -0.0535, Y));
  const wN = 0.0058 + 0.0046 * sstep(0.004, tipY, Y);
  r += prof * Math.exp(-(U * U) / (wN * wN));
  r += 0.0036 * nk * gs(U, Y + 0.0425, 0.0078, 0.0072);
  r += 0.0012 * nk * gs(ax - 0.0108, Y + 0.0445, 0.0058, 0.0058);
  // lips: upper, lower, the line between them, the corners; the groove under them; chin
  r += 0.0024 * gs(U, Y + 0.0612, 0.0215, 0.0052);
  r += 0.0032 * gs(U, Y + 0.0722, 0.0185, 0.0056);
  r -= 0.0016 * gs(U, Y + 0.0666, 0.025, 0.0016);
  r -= 0.0009 * gs(ax - 0.0265, Y + 0.0668, 0.005, 0.006);
  r -= 0.0016 * gs(U, Y + 0.0855, 0.018, 0.0045);
  r += 0.0046 * gs(U, Y + 0.103, 0.0185, 0.0115);
  return r;
}

/** a point of the close head at angle phi and face height Y (m above the eye line, man units), pushed out by push */
function closeHeadPoint(d: Dims, phi: number, Y: number, push = 0, ring?: BodyRing): { p: P3; X: number } {
  const R = d.headRings;
  const ye = R[4].y;
  const k = (d.crown - R[0].y) / 0.232;
  const r = ring ?? headRingAt(d, ye + Y * k);
  const p = torsoPoint(r, 0, phi, 2.2);
  // the lower face narrows into the chin along a smooth bell round the front (the dental arch and chin:
  // no crease where the narrowing ends), the jaw angle below the ear stays broad and slightly flared,
  // the temples narrow a little
  const cf = Math.max(0, Math.cos(phi));
  const arch = Math.exp(-((phi / 0.85) ** 2));
  const lo = sstep(-0.04, -0.115, Y);
  const gonion = gs(Math.abs(phi) - 1.45, (Y + 0.086) * 9, 0.36, 0.24);
  p[0] *= 1 - 0.11 * lo * arch + 0.03 * gonion - 0.05 * sstep(0.01, 0.05, Y) * cf;
  // (the arc coordinate: the same stamps on any head width; phi wrapped, the rings run 0 … 2π)
  const pw = Math.atan2(Math.sin(phi), Math.cos(phi));
  const X = pw * 0.0775;
  const front = sstep(0.0, 0.25, Math.PI * 0.72 - Math.abs(pw));
  const rel = (front > 0 ? faceRelief(X, Y, d.nose / k) * front * k : 0) + push;
  const dx = p[0],
    dz = p[2] - r.cz;
  // (outwards from the head's axis: the middle plane's stretch made the cheek a flat plane)
  const dl = Math.hypot(dx, dz) || 1;
  p[0] += (dx / dl) * rel;
  p[2] += (dz / dl) * rel;
  return { p, X };
}

/** close level: beard over the jaw and chin (mouth left free) and a moustache on the sculpted upper lip */
function buildCloseBeard(b: MeshBuilder, d: Dims): void {
  const k = (d.crown - d.headRings[0].y) / 0.232;
  b.use(BONE.HEAD, REG.BEARD, FB.BEARD, 1);
  const phis: number[] = [];
  for (let i = 0; i <= 14; i++) phis.push(-1.95 + (3.9 * i) / 14);
  const Ys = [-0.112, -0.1, -0.088, -0.076, -0.062, -0.046, -0.03];
  const pushes = [0.0075, 0.0065, 0.006, 0.0045, 0.0032, 0.0024, 0.002];
  const grid = Ys.map((Y, ri) =>
    phis.map((phi) => {
      const c = closeHeadPoint(d, phi, Y, pushes[ri] * k);
      return b.v(c.p, 2, ri === 0 ? 0.1 : 0, c.X, Y);
    }),
  );
  for (let r = 0; r < Ys.length - 1; r++)
    for (let c = 0; c < phis.length - 1; c++) {
      b.quadOut(grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c], [0, d.headRings[2].y, d.headRings[2].cz - 0.02]);
    }
  const R0 = d.headRings[0];
  const under = b.v([0, R0.y - 0.012 * k, R0.cz + 0.01 * k], 2, 0.15, 0, -0.112);
  for (let c = 0; c < phis.length - 1; c++) b.triOut(grid[0][c], grid[0][c + 1], under, [0, R0.y + 0.03, R0.cz - 0.01]);
  // moustache: over the upper lip from under the nose to the lip line, ends drooping a little
  b.use(BONE.HEAD, REG.BEARD, FB.MOUSTACHE, 1);
  // (tapers to the corners of the mouth in height and thickness, a notch under the philtrum: never a bar)
  const mp = [-0.52, -0.44, -0.34, -0.22, -0.1, 0, 0.1, 0.22, 0.34, 0.44, 0.52];
  const rows = [1, 0, -1].map((ri) =>
    mp.map((phi) => {
      const t = Math.min(1, Math.abs(phi) / 0.52);
      const droop = Math.max(0, Math.abs(phi) - 0.26) * 0.045;
      const hf = 1 - 0.8 * t * t;
      const notch = 0.0022 * Math.exp(-((phi / 0.09) ** 2));
      const Y = -0.0535 - droop + ri * 0.0072 * hf - (ri > 0 ? notch : 0);
      const cm = closeHeadPoint(d, phi, Y, (ri === 0 ? 0.0044 * (1 - 0.55 * t * t) : 0.0018) * k);
      return b.v(cm.p, 2, 0, cm.X, ri * hf);
    }),
  );
  for (let r = 0; r < 2; r++) for (let c = 0; c < mp.length - 1; c++) b.quadOut(rows[r][c], rows[r][c + 1], rows[r + 1][c + 1], rows[r + 1][c], [0, d.headRings[3].y, d.headRings[3].cz - 0.03]);
}

function buildCloseHead(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const R = d.headRings;
  const ye = R[4].y;
  const k = (d.crown - R[0].y) / 0.232;
  const n = cfg.headSides;
  // dense through the face, coarser over the skull
  const Ys: number[] = [];
  const yb = (R[0].y - ye) / k,
    yt = (R[R.length - 1].y - ye) / k;
  Ys.push(yb, yb + 0.006);
  // rows: 1.8 mm through the nose base and the lips (nostrils, vermilion borders, mouth line in form), 3 mm elsewhere
  for (let y = -0.104; y < 0.03; ) {
    Ys.push(y);
    y += y > -0.082 && y < -0.036 ? 0.0026 : 0.0042;
  }
  void yt;
  const yc = (d.crown - ye) / k;
  // over the skull: even steps of latitude, up to the crown
  for (let a = 0.12; a < 1.5; a += 0.17) Ys.push(0.03 + (yc - 0.03) * Math.sin(a));
  const rings: Ring[] = [];
  for (let j = 0; j < Ys.length; j++) {
    const Y = Ys[j];
    const y = ye + Y * k;
    const r = headRingAt(d, y);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const phi = t - 0.74 * Math.sin(t); // vertices bunch at the face
      const { p, X } = closeHeadPoint(d, phi, Y, 0, r);
      // jaw / under-chin shade; the whole head carries face coordinates (the maps, the shape of the person)
      b.use(BONE.HEAD, REG.FACE, -1, 1 - 0.08 * sstep(-0.095, -0.115, Y));
      ids.push(b.v(p, 2, 0, X, Y));
    }
    rings.push({ ids, c: [0, y, r.cz] });
  }
  bridge(b, rings);
  b.use(BONE.HEAD, REG.SKIN, -1, 1);
  const crown = b.v([0, d.crown, R[4].cz], 2, 0);
  capFan(b, rings[rings.length - 1], crown, [0, d.crown - 0.05, R[4].cz]);
  // under the jaw: the jaw edge rolls round (no flat cap, no hard line) and tucks back into the neck
  const N = closeNeck(d, 2);
  const neckIn: BodyRing = { y: R[0].y - 0.004 * k, hw: N.hw * 0.96, f: N.f * 0.96, b: N.b * 0.96, cz: N.cz };
  const jaw = rings[0].ids.map((id) => [b.pos[id * 3], b.pos[id * 3 + 1], b.pos[id * 3 + 2]] as P3);
  const under: Ring[] = [rings[0]];
  for (const u of [0.18, 0.4, 0.68, 1]) {
    b.use(BONE.HEAD, u < 0.5 ? REG.FACE : REG.SKIN, -1, 0.9 - 0.28 * u);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const phi = t - 0.74 * Math.sin(t);
      const j = jaw[i];
      // the front tucks into the neck; the back (inside the neck / skull) closes into a bowl as the old cap did
      // — an open under-surface there showed the sky through the top of the neck behind the jaw angle
      const qn = torsoPoint(neckIn, 0, phi, 2);
      const fr = sstep(-0.25, 0.35, Math.cos(phi));
      const qb: P3 = [j[0] * 0.25, R[0].y - 0.006, R[0].cz + (j[2] - R[0].cz) * 0.25];
      const q: P3 = [qb[0] + (qn[0] - qb[0]) * fr, qb[1] + (qn[1] - qb[1]) * fr, qb[2] + (qn[2] - qb[2]) * fr];
      // quarter-round: first down round the edge, then back along the under-jaw towards the neck
      const e = 1 - (1 - u) ** 2;
      const drop = 0.006 * k * Math.sin(Math.PI * Math.min(1, u * 1.4));
      const Xj = Math.atan2(Math.sin(phi), Math.cos(phi)) * 0.0775;
      ids.push(b.v([j[0] + (q[0] - j[0]) * e, j[1] + (q[1] - j[1]) * u - drop, j[2] + (q[2] - j[2]) * e], 2, 0, u < 0.5 ? Xj : 0, u < 0.5 ? yb - 0.002 : 0));
    }
    under.push({ ids, c: [0, R[0].y + 0.04, R[0].cz] });
  }
  bridge(b, under);
  b.use(BONE.HEAD, REG.SKIN, -1, 0.62);
  const chin = b.v([0, neckIn.y + 0.01, neckIn.cz], 2, 0);
  capFan(b, under[under.length - 1], chin, [0, R[0].y + 0.05, R[0].cz]);
  // ears: from the brow to the nose base, leaning back: the root on the skull, the rolled rim of the helix standing off it, a
  // fold inside the rim, the bowl of the concha, a soft lobe
  for (const side of [1, -1]) {
    const phi0 = side * (Math.PI / 2 + 0.2);
    const yE = ye - 0.019 * k;
    const base = torsoPoint(headRingAt(d, yE), 0, phi0, 2.1);
    const out: P3 = norm([side * 0.92, 0, -0.38]);
    const back: P3 = norm([0, 0, -1]);
    const up: P3 = norm(add([0, 1, 0], mul(back, 0.2)));
    const hgt = 0.03 * k,
      wid = 0.0165 * k;
    const NE = 16;
    const root: number[] = [],
      rim: number[] = [],
      crest: number[] = [],
      fold: number[] = [],
      bowl: number[] = [];
    // the outline: an egg, broad above, the round lobe below; only the lobe has no rolled rim
    const at = (a: number, s: number): P3 => {
      const lz = Math.cos(a),
        ly = Math.sin(a);
      const w = 0.88 + 0.12 * ly;
      return add(base, add(mul(back, (lz * wid * w + 0.0065 * k) * s), mul(up, ly * hgt * s)));
    };
    for (let i = 0; i < NE; i++) {
      const a = (i / NE) * Math.PI * 2;
      const lz = Math.cos(a),
        ly = Math.sin(a);
      const lobe = sstep(-0.35, -0.85, ly);
      const stand = (0.006 + 0.009 * Math.max(0, lz) + 0.0035 * Math.max(0, ly)) * k * (1 - 0.35 * lobe);
      // (long hair covers them: they stood out through the sheet)
      b.use(BONE.HEAD, REG.SKIN, sweepPeople('hairfall') ? FX.EARS : -1, 0.97);
      root.push(b.v(add(at(a, 0.74), mul(out, -0.004 * k)), 2, 0));
      b.setTint(1);
      rim.push(b.v(add(at(a, 1), mul(out, stand * 0.75)), 2, 0));
      b.setTint(1.03);
      crest.push(b.v(add(at(a, 0.9), mul(out, stand)), 2, 0));
      b.setTint(0.8 + 0.16 * lobe);
      fold.push(b.v(add(at(a, 0.72), mul(out, stand * (0.62 + 0.3 * lobe))), 2, 0));
      b.setTint(0.68 + 0.26 * lobe);
      bowl.push(b.v(add(at(a, 0.46), mul(out, stand * (0.3 + 0.55 * lobe))), 2, 0));
    }
    b.setTint(0.5);
    const concha = b.v(add(add(base, mul(back, 0.005 * k)), add(mul(up, -0.004 * k), mul(out, 0.0015 * k))), 2, 0);
    for (let i = 0; i < NE; i++) {
      const i1 = (i + 1) % NE;
      b.quadOut(rim[i], rim[i1], root[i1], root[i], sub(base, mul(out, 0.03)));
      b.quadDir(rim[i], rim[i1], crest[i1], crest[i], out);
      b.quadDir(crest[i], crest[i1], fold[i1], fold[i], out);
      b.quadDir(fold[i], fold[i1], bowl[i1], bowl[i], out);
      b.triDir(bowl[i], bowl[i1], concha, out);
    }
    if (closePeople('earrings')) {
      b.use(BONE.HEAD, REG.ACCENT, FX.EARRINGS, 1);
      const lobe = add(base, add(mul(up, -hgt * 0.92), mul(out, 0.002 * k)));
      blob(b, add(lobe, mul(up, -0.004 * k)), [0.0028, 0.0028, 0.0028], 5, 2);
      blob(b, add(lobe, mul(up, -0.0115 * k)), [0.0035, 0.005, 0.0024], 5, 2);
    }
  }
  if (closePeople('glasses')) {
    // spectacles: two rims in the plane of the eyes, a bridge, arms back to the ears
    b.use(BONE.HEAD, REG.DARK, FX.GLASSES, 1);
    const X0 = 0.0315,
      rx = 0.0235,
      ry = 0.0185,
      rimW = 0.0022;
    const C = (s: number) => closeHeadPoint(d, (s * X0) / 0.0775, 0, 0.0095 * k).p;
    const rim: number[][] = [];
    for (const s of [1, -1]) {
      const c = C(s);
      const ph = (s * X0) / 0.0775 * 0.7;
      const ux: P3 = [Math.cos(ph), 0, -Math.sin(ph)],
        uz: P3 = [Math.sin(ph), 0, Math.cos(ph)];
      const NR = 18;
      const ringAt = (dr: number, dz: number): number[] => {
        const ids: number[] = [];
        for (let i = 0; i < NR; i++) {
          const a = (i / NR) * Math.PI * 2;
          // a soft rounded rectangle
          const e = 0.72;
          const lx = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** e,
            ly = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** e;
          ids.push(b.v(add(add(c, add(mul(ux, (rx + dr) * k * lx), [0, (ry + dr) * k * ly - (ly < 0 ? 0.001 : 0), 0])), mul(uz, dz)), 2, 0));
        }
        return ids;
      };
      const of = ringAt(0, 0),
        inf = ringAt(-rimW, 0),
        ob = ringAt(0, -0.0024);
      rim.push(of);
      for (let i = 0; i < NR; i++) {
        const j = (i + 1) % NR;
        b.quadDir(of[i], of[j], inf[j], inf[i], uz);
        b.quadOut(of[i], of[j], ob[j], ob[i], sub(c, mul(uz, 0.01)));
      }
    }
    const pL = C(1),
      pR = C(-1);
    const yB = 0.008 * k;
    const bridgeTop = closeHeadPoint(d, 0, 0.005, 0.0065 * k).p;
    stick(b, add(pL, [-rx * k * 0.96, yB, -0.002]), bridgeTop, 0.0013, 4);
    stick(b, add(pR, [rx * k * 0.96, yB, -0.002]), bridgeTop, 0.0013, 4);
    for (const s of [1, -1]) {
      const hinge = add(s > 0 ? pL : pR, [s * rx * k, 0.006 * k, -0.002]);
      const m1 = closeHeadPoint(d, s * 1.25, 0.006, 0.0035 * k).p;
      const m2 = closeHeadPoint(d, s * 1.72, -0.006, 0.0025 * k).p;
      stick(b, hinge, m1, 0.0011, 4);
      stick(b, m1, m2, 0.0011, 4);
    }
  }
}

/** orthonormal frame for a limb axis (dir) with U ≈ +x and V ≈ +z */
function limbFrame(dir: P3): { U: P3; V: P3 } {
  const D = norm(dir);
  // reference axis: +Z for limbs (they hang along Y); +Y for sticks along Z (briefcase handle, cane crook)
  let V = Math.abs(D[2]) > 0.95 ? norm(sub([0, 1, 0], mul(D, D[1]))) : norm(sub([0, 0, 1], mul(D, D[2])));
  const U = norm(cross(V, D));
  // make U point to +x
  if (U[0] < 0) {
    V = mul(V, 1);
    return { U: mul(U, -1), V };
  }
  return { U, V };
}

interface LimbSpec {
  a: P3;
  b: P3;
  ring: LimbRing;
  bone: number;
  w: number;
  h: number;
  reg: number;
  tint?: number;
  aux1?: number;
}

function buildLimb(b: MeshBuilder, specs: LimbSpec[], sides: number, sx: number, capEnd: boolean, endAux = 0): Ring[] {
  const rings: Ring[] = [];
  for (const s of specs) {
    const axis = sub(s.b, s.a);
    const { U, V } = limbFrame(axis);
    const c = add(add(lerp3(s.a, s.b, s.ring.t), mul([1, 0, 0], s.ring.cx * sx)), mul([0, 0, 1], s.ring.cz));
    b.use(s.bone, s.reg, -1, s.tint ?? 1);
    const ids: number[] = [];
    for (let k = 0; k < sides; k++) {
      const phi = (k / sides) * Math.PI * 2 + (sides === 4 ? Math.PI / 4 : 0);
      const p = add(c, add(mul(U, s.ring.rx * Math.sin(phi)), mul(V, s.ring.rz * Math.cos(phi))));
      ids.push(b.v(p, s.h, s.w, s.aux1 ?? 0));
    }
    rings.push({ ids, c });
  }
  bridge(b, rings);
  if (capEnd) {
    const last = specs[specs.length - 1];
    const axis = norm(sub(last.b, last.a));
    const c = rings[rings.length - 1].c;
    const apex = b.v(add(c, mul(axis, Math.min(last.ring.rx, last.ring.rz) * 0.9)), last.h, last.w, endAux);
    capFan(b, rings[rings.length - 1], apex, sub(c, mul(axis, 0.03)));
  }
  return rings;
}

const UPPER_W = [0.72, 0.35, 0.08, 0, 0, 0.85];
const FORE_W = [0.5, 0.15, 0, 0, 0.6];
const THIGH_W = [0.65, 0.25, 0, 0, 0, 0.85];
const SHIN_W = [0.5, 0.2, 0, 0, 0, 0, 0.5];

function buildArm(b: MeshBuilder, d: Dims, cfg: LodCfg, side: 1 | -1): void {
  const L = side > 0;
  const UP = L ? BONE.UPPER_L : BONE.UPPER_R,
    FO = L ? BONE.FORE_L : BONE.FORE_R,
    HA = L ? BONE.HAND_L : BONE.HAND_R;
  const sh = pv(d.shoulder, side),
    el = pv(d.elbow, side),
    wr = pv(d.wrist, side),
    tip = pv(d.tip, side);
  const specs: LimbSpec[] = [];
  for (const i of cfg.upper) {
    const r0 = d.upper[i];
    // (close: a rounder cap, the deltoid goes on from the slope of the shoulder)
    const r = cfg.close && i < 2 ? { ...r0, t: i === 0 ? -0.095 : r0.t, rx: r0.rx * (i === 0 ? 1.4 : 1.12), rz: r0.rz * (i === 0 ? 1.15 : 1.04), cx: r0.cx * (i === 0 ? 0.8 : 1) } : r0;
    // the 0.88 ring sits just above the elbow and already bends with the forearm (skinning)
    specs.push({ a: sh, b: el, ring: r, bone: i === 5 ? FO : UP, w: UPPER_W[i], h: 1 - 0.5 * r.t, reg: REG.ARM, tint: i === 0 && !cfg.close ? 0.9 : 1 });
  }
  for (const i of cfg.fore) {
    const r = d.fore[i];
    const wrist = i === 4;
    specs.push({ a: el, b: wr, ring: r, bone: wrist ? HA : FO, w: FORE_W[i], h: 0.5 - 0.5 * r.t, reg: REG.ARM });
  }
  if (cfg.hand === 'none') {
    // tiny: a skin-coloured stub for the hand so the arm keeps its length
    const c = lerp3(wr, tip, 0.55);
    specs.push({ a: wr, b: c, ring: { t: 1, rx: d.palmT * 1.1, rz: d.palmW * 0.8, cx: 0, cz: 0 }, bone: HA, w: 0, h: -0.55, reg: REG.SKIN });
    buildLimb(b, specs, cfg.limbSides, side, true);
    return;
  }
  // hand: continues the loft — palm (broad front-back, thin sideways, palm facing the thigh),
  // knuckles, finger mitten curling towards the palm (aux1 = curl weight), rounded tips
  const hd = norm(sub(tip, wr));
  const hlen = Math.hypot(...sub(tip, wr));
  const pw = d.palmW,
    pt = d.palmT;
  const at = (t: number, cx: number): P3 => add(add(wr, mul(hd, hlen * t)), [cx * side, 0, 0]);
  const handRing = (t: number, rx: number, rz: number, cx: number, w: number, curl: number): LimbSpec => {
    const c = at(t, cx);
    return { a: sub(c, mul(hd, 0.001)), b: c, ring: { t: 1, rx, rz, cx: 0, cz: 0 }, bone: HA, w, h: -t, reg: REG.SKIN, aux1: curl };
  };
  if (cfg.hand === 'paddle') {
    specs.push(handRing(0.3, pt * 1.05, pw * 0.95, -0.002, 0.05, 0));
    specs.push(handRing(0.78, pt * 0.85, pw * 0.85, -0.008, 0, 0.6));
    buildLimb(b, specs, cfg.limbSides, side, true, 1);
    return;
  }
  if (cfg.hand === 'fingers') {
    buildFingers(b, specs, cfg, side, HA, wr, hd, hlen, pw, pt, handRing);
    return;
  }
  specs.push(handRing(0.22, pt, pw * 0.93, -0.001, 0.12, 0));
  specs.push(handRing(0.52, pt * 0.92, pw, -0.002, 0, 0.1));
  specs.push(handRing(0.84, pt * 0.68, pw * 0.84, -0.01, 0, 1));
  buildLimb(b, specs, cfg.limbSides, side, true, 1);
  // thumb: from the front (index) edge of the palm, angled down-forward towards the palm side
  b.use(HA, REG.SKIN, -1, 0.97);
  const base = add(add(wr, mul(hd, hlen * 0.16)), [-0.006 * side * (pw / 0.043), 0, pw * 0.72]);
  const tdir = norm([-0.3 * side, -0.78, 0.42]);
  const tl = hlen * 0.36;
  const tr = pt * 0.75;
  const rings: Ring[] = [];
  const { U, V } = limbFrame(tdir);
  for (const [t, r] of [
    [0, tr],
    [0.5, tr * 0.92],
    [1, tr * 0.78],
  ] as [number, number][]) {
    const c = add(base, mul(tdir, tl * t));
    const ids: number[] = [];
    for (let k = 0; k < 6; k++) {
      const phi = (k / 6) * Math.PI * 2;
      ids.push(b.v(add(c, add(mul(U, r * Math.sin(phi)), mul(V, r * Math.cos(phi)))), -0.3, 0));
    }
    rings.push({ ids, c });
  }
  bridge(b, rings);
  const tc = rings[2].c;
  capFan(b, rings[2], b.v(add(tc, mul(tdir, tr * 0.8)), -0.4, 0), sub(tc, mul(tdir, 0.01)));
}

/** close level: palm to the knuckles, four jointed fingers in a relaxed curl (aux1 = grip curl share,
 *  growing to the tip so the shader's grip bends them progressively), a jointed thumb, pale nails */
function buildFingers(
  b: MeshBuilder,
  specs: LimbSpec[],
  cfg: LodCfg,
  side: 1 | -1,
  HA: number,
  wr: P3,
  hd: P3,
  hlen: number,
  pw: number,
  pt: number,
  handRing: (t: number, rx: number, rz: number, cx: number, w: number, curl: number) => LimbSpec,
): void {
  specs.push(handRing(0.2, pt, pw * 0.92, -0.001, 0.12, 0));
  specs.push(handRing(0.36, pt * 0.95, pw * 0.99, -0.002, 0, 0));
  specs.push(handRing(0.47, pt * 0.84, pw * 0.97, -0.003, 0, 0.1));
  specs.push(handRing(0.54, pt * 0.58, pw * 0.82, -0.004, 0, 0.15));
  const armRings = buildLimb(b, specs, cfg.limbSides, side, true, 1);
  // (the arm's top ring now stands at the shoulder's surface: closed, or the sky shows through it)
  b.use(side > 0 ? BONE.UPPER_L : BONE.UPPER_R, REG.ARM, -1, 1);
  const aTop = armRings[0].c;
  capFan(b, armRings[0], b.v([aTop[0], aTop[1] + 0.012, aTop[2]], 1.05, UPPER_W[0]), [aTop[0], aTop[1] - 0.03, aTop[2]]);
  // towards the palm (−x on the left hand, +x on the right) and across it (+z = index side)
  const palm: P3 = [-side, 0, 0];
  const across: P3 = [0, 0, 1];
  const bend = (v: P3, a: number): P3 => norm(add(mul(v, Math.cos(a)), mul(palm, Math.sin(a))));
  const FING: [number, number, number][] = [
    // z offset (× pw), length (× hand length), radius (× pw)
    [0.66, 0.44, 0.18],
    [0.22, 0.5, 0.19],
    [-0.22, 0.47, 0.18],
    [-0.62, 0.37, 0.155],
  ];
  const SIDES = 7;
  for (let f = 0; f < 4; f++) {
    const [zo, fl, fr] = FING[f];
    const len = hlen * fl;
    const rz = pw * fr,
      rx = Math.min(pt * 0.66, rz * 0.95);
    // splay a little: index forward, little finger back
    const dir0 = norm(add(hd, mul(across, zo * 0.15)));
    const segs: [number, number][] = [
      [0.46, 0.14 + 0.03 * f],
      [0.3, 0.3 + 0.04 * f],
      [0.24, 0.26],
    ];
    let c = add(add(wr, mul(hd, hlen * 0.47)), add(mul(across, pw * zo), [-0.002 * side, 0, 0]));
    let dir = dir0;
    let ang = 0;
    const rings: Ring[] = [];
    // tint: pale nail on the back of the tip, a lit knuckle over each joint with a crease on the palm side,
    // and the sides facing the neighbouring fingers darker near the base (the gaps read at 2 m)
    const ring = (cc: P3, dd: P3, sx: number, sz: number, curl: number, h: number, nail: boolean, crev = 0, knuckle = false) => {
      const { U, V } = limbFrame(dd);
      const ids: number[] = [];
      for (let k = 0; k < SIDES; k++) {
        const phi = (k / SIDES) * Math.PI * 2;
        const q = add(cc, add(mul(U, sx * Math.sin(phi)), mul(V, sz * Math.cos(phi))));
        const back = Math.sin(phi) * side * Math.sign(U[0] || 1);
        const facing = Math.abs(Math.cos(phi)) > 0.8 && !((f === 0 && Math.cos(phi) * Math.sign(V[2] || 1) > 0) || (f === 3 && Math.cos(phi) * Math.sign(V[2] || 1) < 0));
        const tk = (nail && back > 0.4 ? 1.12 : knuckle && back > 0.4 ? 1.06 : back < -0.4 ? (knuckle ? 0.9 : 0.97) : 1) * (facing ? 1 - 0.14 * crev : 1);
        b.use(HA, REG.SKIN, -1, tk);
        ids.push(b.v(q, -0.5 - h * 0.5, 0, curl));
      }
      rings.push({ ids, c: cc });
    };
    ring(c, dir, rx, rz, 0.2, 0, false, 1);
    for (let s = 0; s < 3; s++) {
      const [lf, a] = segs[s];
      ang += a;
      dir = bend(dir0, ang);
      c = add(c, mul(dir, len * lf));
      const t = (s + 1) / 3;
      const taper = 1 - 0.2 * t;
      if (s < 2) ring(c, dir, rx * taper * 1.04, rz * taper * 1.04, 0.35 + 0.3 * s, t, false, s === 0 ? 0.6 : 0.2, true);
      else {
        ring(sub(c, mul(dir, len * lf * 0.25)), dir, rx * taper, rz * taper, 1, t, true);
        ring(add(c, mul(dir, rz * 0.12)), dir, rx * taper * 0.72, rz * taper * 0.72, 1, t, true);
      }
    }
    bridge(b, rings);
    const last = rings[rings.length - 1];
    b.use(HA, REG.SKIN, -1, 1);
    capFan(b, last, b.v(add(c, mul(dir, rz * 0.55)), -1, 0, 1), sub(last.c, mul(dir, 0.01)));
    // the first ring sits inside the palm: no cap needed
  }
  // thumb: from the index edge of the palm, down-forward, two joints bending across the palm
  const base = add(add(wr, mul(hd, hlen * 0.14)), [-0.007 * side * (pw / 0.043), 0, pw * 0.7]);
  const t0 = norm([-0.28 * side, -0.8, 0.4]);
  const tl = hlen * 0.4;
  const tr = pt * 0.78;
  const rings: Ring[] = [];
  let c = base;
  let dir = t0;
  const TS = 7;
  const tseg: [number, number, number][] = [
    [0, 1, 0],
    [0.42, 0.95, 0.12],
    [0.33, 0.86, 0.22],
    [0.2, 0.74, 0.1],
    [0.075, 0.5, 0.05],
  ];
  for (let s = 0; s < tseg.length; s++) {
    const [lf, rr, a] = tseg[s];
    dir = norm(add(mul(dir, Math.cos(a)), mul(palm, Math.sin(a))));
    c = add(c, mul(dir, tl * lf));
    const { U, V } = limbFrame(dir);
    const ids: number[] = [];
    for (let k = 0; k < TS; k++) {
      const phi = (k / TS) * Math.PI * 2;
      b.use(HA, REG.SKIN, -1, s >= 3 && Math.sin(phi) * side > 0.4 ? 1.1 : 0.97);
      ids.push(b.v(add(c, add(mul(U, tr * rr * Math.sin(phi)), mul(V, tr * rr * 0.9 * Math.cos(phi)))), -0.3, 0, s === 0 ? -0.15 : s === 1 ? -0.5 : -1));
    }
    rings.push({ ids, c });
  }
  bridge(b, rings);
  const tc = rings[rings.length - 1].c;
  capFan(b, rings[rings.length - 1], b.v(add(tc, mul(dir, tr * 0.7)), -0.4, 0, -1), sub(tc, mul(dir, 0.01)));
}

function buildLeg(b: MeshBuilder, d: Dims, cfg: LodCfg, side: 1 | -1): void {
  const L = side > 0;
  const TH = L ? BONE.THIGH_L : BONE.THIGH_R,
    SH = L ? BONE.SHIN_L : BONE.SHIN_R,
    FT = L ? BONE.FOOT_L : BONE.FOOT_R;
  const hp = pv(d.hip, side),
    kn = pv(d.knee, side),
    an = pv(d.ankle, side);
  const specs: LimbSpec[] = [];
  for (const i of cfg.thigh) {
    const r0 = d.thigh[i];
    const tk = cfg.close ? [0.68, 0.92, 0.98, 1, 1, 1][i] : 1;
    // (close: the thigh's outer line runs on from the hip's; below it the hip's ring stood out as a corner)
    const dOut = !cfg.close ? 0 : i === 0 ? Math.max(0, d.torso[3].hw - 0.014 - (Math.abs(hp[0]) + d.thigh[0].cx + d.thigh[0].rx * 0.68)) : Math.max(0, d.torso[2].hw - 0.006 - (Math.abs(hp[0]) + d.thigh[1].cx + d.thigh[1].rx * 0.92)) * [0, 1, 0.5, 0.14, 0, 0][i];
    const r = tk === 1 && dOut === 0 ? r0 : { ...r0, t: cfg.close && i === 0 ? -0.06 : r0.t, rx: r0.rx * tk + dOut / 2, rz: r0.rz * tk, cx: r0.cx + dOut / 2 };
    specs.push({ a: hp, b: kn, ring: r, bone: i === 5 ? SH : TH, w: THIGH_W[i], h: 1 - 0.5 * r.t, reg: REG.LEG, tint: i === 0 && !cfg.close ? (HIP_BLEND ? 0.93 : 0.86) : 1 });
  }
  for (const i of cfg.shin) {
    const r = d.shin[i];
    specs.push({ a: kn, b: an, ring: r, bone: i === 6 ? FT : SH, w: SHIN_W[i], h: 0.5 - 0.42 * r.t, reg: REG.LEG });
  }
  if (cfg.footSides === 0) {
    // pin: a shoe-coloured stub down to the ground
    const g: P3 = [an[0], 0.0, an[2] + 0.05 * (d.H / 1.76)];
    specs.push({ a: an, b: g, ring: { t: 1, rx: 0.04 * (d.H / 1.76), rz: 0.06 * (d.H / 1.76), cx: 0, cz: 0 }, bone: FT, w: 0, h: 0.5, reg: REG.FOOT });
    buildLimb(b, specs, cfg.limbSides, side, false);
    return;
  }
  const legRings = buildLimb(b, specs, cfg.limbSides, side, true);
  if (HIP_BLEND && cfg.details) {
    // the thigh tube going into the pelvis is a crease all round the hip: its top rings take the pelvis's own outward
    // normal, so cloth runs on over the join
    cfg.thigh.forEach((i, j) => {
      const k = i === 0 ? 1 : i === 1 ? 0.7 : i === 2 ? 0.22 : 0;
      if (k > 0) for (const id of legRings[j].ids) b.nHint.set(id, [b.pos[id * 3], b.pos[id * 3 + 2] - hp[2], k]);
    });
  }
  // shoe last (foot frame: ankle at the origin, toes out 6°)
  const yaw = 0.105 * side;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const ft = (x: number, y: number, z: number): P3 => [an[0] + x * cy + z * sy, an[1] + y, an[2] - x * sy + z * cy];
  const fr = d.foot;
  const top = fr[2].y1 - fr[1].y0;
  const sides = cfg.footSides;
  const rings: Ring[] = [];
  for (const i of cfg.foot) {
    const f: FootRing = fr[i];
    b.use(FT, REG.FOOT, -1, 1);
    const yc = (f.y0 + f.y1) / 2,
      hh = (f.y1 - f.y0) / 2;
    const ids: number[] = [];
    for (let k = 0; k < sides; k++) {
      const phi = (k / sides) * Math.PI * 2 + (sides === 4 ? Math.PI / 4 : 0);
      const x = f.cx * side + f.w * se(Math.sin(phi), 3) * side;
      const y = yc + hh * se(Math.cos(phi), 3);
      // aux: across the last (−1 inner … 1 outer), along it (0 heel … 1 toe) for the shoe paint
      const zs = (f.z - fr[0].z) / (fr[fr.length - 1].z - fr[0].z);
      ids.push(b.v(ft(x, y, f.z), (y - f.y0) / top + (f.y0 - fr[1].y0) / top, 0, se(Math.sin(phi), 3), zs));
    }
    rings.push({ ids, c: ft(f.cx * side, yc, f.z) });
  }
  // close: the toe rounds off in plan and in section, a little sprung off the ground (it ended on a wide ring and a fan: a square-cut box)
  if (cfg.close && sweepPeople('shoes')) {
    const fT = fr[cfg.foot[cfg.foot.length - 1]];
    const k = d.H / 1.76;
    for (const [dz, w, hh2, lift] of [[0.0055, 0.9, 0.93, 0.0015], [0.0115, 0.7, 0.82, 0.003], [0.0155, 0.42, 0.62, 0.0045]] as [number, number, number, number][]) {
      const yc = (fT.y0 + fT.y1) / 2 + lift - (fT.y1 - fT.y0) * (1 - hh2) * 0.3,
        hh = ((fT.y1 - fT.y0) / 2) * hh2;
      const ids: number[] = [];
      for (let kk = 0; kk < sides; kk++) {
        const phi = (kk / sides) * Math.PI * 2;
        const x = fT.cx * side + fT.w * w * se(Math.sin(phi), 2.4) * side;
        const y = yc + hh * se(Math.cos(phi), 3);
        ids.push(b.v(ft(x, y, fT.z + dz * k), 0.3 + 0.3 * (1 + Math.cos(phi)), 0, se(Math.sin(phi), 3), 1));
      }
      rings.push({ ids, c: ft(fT.cx * side, yc, fT.z + dz * k) });
    }
  }
  bridge(b, rings);
  const f0 = fr[cfg.foot[0]],
    f1 = cfg.close && sweepPeople('shoes') ? { ...fr[cfg.foot[cfg.foot.length - 1]], z: fr[cfg.foot[cfg.foot.length - 1]].z + 0.016 * (d.H / 1.76), y0: fr[cfg.foot[cfg.foot.length - 1]].y0 + 0.004, y1: fr[cfg.foot[cfg.foot.length - 1]].y0 + 0.02 } : fr[cfg.foot[cfg.foot.length - 1]];
  const heel = b.v(ft(f0.cx * side, (f0.y0 + f0.y1) / 2 - 0.004, f0.z - 0.008 * (d.H / 1.76)), 0.3, 0);
  capFan(b, rings[0], heel, ft(f0.cx * side, (f0.y0 + f0.y1) / 2, f0.z + 0.03));
  const toe = b.v(ft(f1.cx * side, (f1.y0 + f1.y1) / 2 - 0.001, f1.z + 0.005 * (d.H / 1.76)), 0.3, 0);
  capFan(b, rings[rings.length - 1], toe, ft(f1.cx * side, (f1.y0 + f1.y1) / 2, f1.z - 0.03));
}

// ───────────────────────────────────────────────────────────── hair ──

/** hairline height (fraction chin→crown) as a function of the angle from the face */
function hairlineU(phi: number): number {
  if (smoothHead) return (hairlineL(phi - 0.2) + hairlineL(phi - 0.1) + hairlineL(phi) + hairlineL(phi + 0.1) + hairlineL(phi + 0.2)) / 5;
  return hairlineL(phi);
}
function hairlineL(phi: number): number {
  const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))); // 0 front … π back
  const pts: [number, number][] = [
    [0, 0.77],
    [0.6, 0.715],
    [1.1, 0.6],
    [1.45, 0.5],
    [1.75, 0.47],
    [2.2, 0.34],
    [Math.PI, 0.26],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    if (a <= pts[i + 1][0]) {
      const t = (a - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

const HAIR_LOCKS = detailPeople('hairlocks');
/** close level: 48 separate locks lying over the cap, combed down from the crown in three overlapping tiers, each its
 *  own tone, standing off the scalp and tapering to a free tip past the hairline: the cap alone reads as a helmet */
function buildHairLocks(b: MeshBuilder, d: Dims, vol: number, hk: number): void {
  const chin = d.headRings[0].y - 0.006,
    crown = d.crown;
  const ss = (a: number, c: number, x: number) => {
    const t = clamp((x - a) / (c - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // the cap's own surface (buildHair + the shader's lift), so a lock never sinks into it
  const onCap = (phi: number, s: number, lift: number): P3 => {
    const y0 = chin + (crown - chin) * hairlineU(phi);
    const sp = Math.max(0, s);
    const t = Math.pow(sp, 0.85);
    const y = y0 + (crown - y0) * t + Math.min(0, s) * (crown - y0);
    const cap = vol * (0.08 + 0.92 * Math.min(1, sp * 2.6)) * (1 - 0.35 * t);
    const grow = ss(0.05, 0.45, sp) * (0.0045 + 0.007 * ss(0.3, 1, sp) * (0.6 - 0.4 * Math.cos(phi)));
    return headSurface(d, phi, Math.min(y, crown - 0.004), cap + grow + lift * hk);
  };
  const centre: P3 = [0, chin + (crown - chin) * 0.62, d.headRings[5].cz];
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  b.use(BONE.HEAD, REG.HAIR, FB.LOCKS, 1);
  const lock = (phi: number, s0: number, s1: number, width: number, drift: number) => {
    const tone = 0.82 + 0.26 * rnd();
    const n = 3;
    const ids: number[][] = [];
    const C: P3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const lift = 0.001 + 0.0052 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.0015 * t;
      C.push(onCap(phi + drift * t * t, s0 + (s1 - s0) * t, lift));
    }
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const tan = norm(sub(C[i + 1], C[i]));
      const up = norm(sub(C[i], centre));
      const side = norm(cross(tan, up));
      const w = width * hk * (0.55 + 0.75 * Math.sin(Math.PI * (t * 0.8 + 0.1))) * (1 - 0.15 * t);
      const tn = tone * (0.72 + 0.28 * Math.min(1, t * 2.5));
      ids.push([b.v(add(C[i], mul(side, w)), 2, 0, 0, 0, tn * 0.92), b.v(add(C[i], mul(up, 0.0028 * hk)), 2, 0, 0, 0, tn), b.v(add(C[i], mul(side, -w)), 2, 0, 0, 0, tn * 0.92)]);
    }
    const tip = b.v(C[n], 2, 0, 0, 0, tone);
    const up = norm(sub(C[1], centre));
    for (let i = 0; i < n - 1; i++)
      for (let k = 0; k < 2; k++) b.quadDir(ids[i][k], ids[i][k + 1], ids[i + 1][k + 1], ids[i + 1][k], norm(sub(C[i], centre)));
    b.triDir(ids[n - 1][0], ids[n - 1][1], tip, up);
    b.triDir(ids[n - 1][1], ids[n - 1][2], tip, up);
  };
  for (let k = 0; k < 14; k++) lock(((k + rnd() * 0.7) / 14) * Math.PI * 2, 0.97 - 0.04 * rnd(), 0.6 + 0.08 * rnd(), 0.017 + 0.007 * rnd(), (rnd() - 0.5) * 0.5);
  for (let k = 0; k < 16; k++) lock(((k + 0.5 + rnd() * 0.6) / 16) * Math.PI * 2, 0.74 + 0.06 * rnd(), 0.3 + 0.1 * rnd(), 0.015 + 0.007 * rnd(), (rnd() - 0.5) * 0.45);
  for (let k = 0; k < 18; k++) {
    const phi = ((k + rnd() * 0.8) / 18) * Math.PI * 2;
    const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))); // 0 front … π back
    // the front stops at the hairline (no curtain over the face), the sides and the nape run on past it
    const tip = a < 1.0 ? 0.03 + 0.05 * rnd() : -0.015 - 0.06 * rnd() * ss(1.0, 1.6, a);
    lock(phi, 0.42 + 0.08 * rnd(), tip, 0.012 + 0.007 * rnd(), (rnd() - 0.5) * 0.35);
  }
}

function buildHair(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const n = cfg.hairSides ?? cfg.headSides;
  const chin = d.headRings[0].y - 0.006;
  const crown = d.crown;
  const hk = d.H / 1.76;
  const vol = 0.0135 * Math.max(0.8, hk) * (cfg.details ? 1 : 1.3);
  // cap: rings from the hairline (s = 0) to the crown (s = 1); thickness tapers to the edge
  const rings: Ring[] = [];
  for (const s of cfg.hairCap) {
    const ids: number[] = [];
    b.use(BONE.HEAD, REG.HAIR, FB.HAIR, s === 0 ? 0.9 : 1);
    if (s >= 1) break;
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const y0 = chin + (crown - chin) * hairlineU(phi);
      const t = Math.pow(s, 0.85);
      const y = y0 + (crown - y0) * t;
      const push = vol * ((cfg.close ? 0.08 : 0.25) + (cfg.close ? 0.92 : 0.75) * Math.min(1, s * (cfg.close ? 2.6 : 3.5))) * (1 - 0.35 * t);
      // aux2 = s: the fragment shader feathers the hairline over the first rings (shader.ts HAIRLINE)
      ids.push(b.v(headSurface(d, phi, Math.min(y, crown - 0.004), push), 2, 0, 0, s));
    }
    rings.push({ ids, c: [0, chin + (crown - chin) * 0.55, -0.01 * hk] });
  }
  bridge(b, rings);
  const apex = b.v([0, crown + vol * (cfg.close ? 0.65 : 0.75), cfg.close ? d.headRings[4].cz : d.headRings[d.headRings.length - 1].cz - 0.006], 2, 0, 0, 1);
  capFan(b, rings[rings.length - 1], apex, [0, crown - 0.06 * hk, 0]);
  if (cfg.close && HAIR_LOCKS && !closePeople('hairshell')) buildHairLocks(b, d, vol, hk);

  if (cfg.hairLong.length === 0) return;
  const hairCurtain = cfg.close && sweepPeople('hairfall');
  // long hair sheet: hangs from the back / sides of the head behind the shoulders (aux1 = hang
  // depth below the cap edge; the shader lifts vertices deeper than the figure's hair length)
  b.use(BONE.HEAD, REG.HAIR, FB.HAIRLONG, 0.96);
  const cols: number[] = [];
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))) > (cfg.close ? (hairCurtain ? 0.6 : 0.98) : 1.15)) cols.push(k);
  }
  // order the columns around the back: from the left side (+x) through the back to the right
  cols.sort((a, c) => {
    const fa = (a / n) * Math.PI * 2,
      fc = (c / n) * Math.PI * 2;
    const aa = Math.atan2(Math.sin(fa), -Math.cos(fa)),
      ac = Math.atan2(Math.sin(fc), -Math.cos(fc));
    return ac - aa;
  });
  const shoulderY = d.torso[10].y;
  const backZ = (y: number) => {
    // back surface of the torso at height y (+ clearance)
    let i = 0;
    while (i < d.torso.length - 2 && d.torso[i + 1].y < y) i++;
    const a = d.torso[i],
      c = d.torso[i + 1];
    const t = clamp((y - a.y) / (c.y - a.y), 0, 1);
    return a.cz - a.b + (c.cz - c.b - (a.cz - a.b)) * t;
  };
  const sheet: number[][] = [];
  const depths = [0, ...cfg.hairLong];
  for (const k of cols) {
    const phi0 = (k / n) * Math.PI * 2;
    const y0 = chin + (crown - chin) * hairlineU(phi0);
    const phi = phi0;
    // close: the sheet starts up on the cap (over it, a little proud) so the hair flows out of the cap
    // instead of hanging from a ledge at its edge
    const yS = cfg.close ? y0 + (crown - y0) * 0.3 : y0 + 0.012 * hk;
    const edge = headSurface(d, phi, yS, hairCurtain ? vol * 0.85 + 0.003 : cfg.close ? vol * 0.5 : vol * 0.9);
    // widest outline of the head at this angle (hair falls from there)
    const wide = headSurface(d, phi, d.headRings[5].y, vol * 1.2);
    const col: number[] = [];
    for (const dep of depths) {
      let p: P3;
      if (dep === 0) p = edge;
      else {
        const y = y0 - dep * hk;
        const sideK = Math.abs(Math.sin(phi));
        let x = wide[0] * (1 - 0.18 * clamp(dep / 0.3, 0, 1));
        let z = Math.min(wide[2], edge[2]);
        if (cfg.close) {
          // the front of the sheet: comes off the hairline high on the forehead and sweeps back across the temple to the jaw, framing the face
          // (a curtain starting beside the cheek under the cap's edge was a bowl with two flaps)
          const a0 = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
          const aE = hairCurtain && a0 < 0.98 ? a0 + (0.98 - a0) * sstep(0, 0.085, dep) : a0;
          const phiE = Math.sin(phi) < 0 ? -aE : aE;
          // lying on the head down to the jaw, then falling free from there: a sheet hung from the widest outline stood off the cheek as a flap
          const hug = headSurface(d, phiE, Math.max(y, d.headRings[2].y), 0.003 + vol * 0.85 * sstep(0.98, 1.55, aE));
          x = hug[0] * (1 + 0.1 * clamp((d.headRings[2].y - y) / 0.1, 0, 1)) * (1 - 0.12 * clamp((dep - 0.2) / 0.2, 0, 1));
          z = hug[2];
          if (hairCurtain && y < d.headRings[5].y) {
            // round the back it falls from the back of the skull, not from the skull's narrowing to the nape (the cap stood out over it like a mushroom)
            const kW = sstep(1.05, 1.85, aE);
            const fall = 1 - 0.1 * clamp((dep - 0.12) / 0.3, 0, 1);
            x += (wide[0] * fall - x) * kW;
            z += (wide[2] * fall - z) * kW;
          }
        }
        if (hairCurtain && y < shoulderY + 0.1 * hk) {
          // behind the shoulders, gathering in over the last ten centimetres above them: all at once was a fold like a wing
          const kB = sstep(shoulderY + 0.1 * hk, shoulderY + 0.005 * hk, y);
          const bz = backZ(y) - 0.012 * hk;
          x *= 1 - 0.28 * sideK * kB;
          z = z + (Math.min(z, bz) - z) * kB;
        } else if (!hairCurtain && y < shoulderY + 0.02 * hk) {
          // behind the shoulders: on the back surface
          const bz = backZ(y) - 0.012 * hk;
          z = Math.min(z, bz + (1 - sideK) * 0.0);
          x *= 1 - 0.25 * sideK * clamp((shoulderY - y) / 0.1, 0, 1);
          z = Math.min(z, bz);
        }
        p = [x, y, z];
      }
      const w = clamp((dep - 0.05) / 0.22, 0, 0.92);
      col.push(b.v(p, 2, w, dep * hk));
    }
    sheet.push(col);
  }
  // inner face: separate (darker) vertices 3 mm inside, so normals do not cancel (LOD0 only)
  b.setTint(0.7);
  const inner = (cfg.details ? sheet : []).map((col) =>
    col.map((id, j) => {
      const P = b.pos;
      const p: P3 = [P[id * 3] * 0.97, P[id * 3 + 1], P[id * 3 + 2] + 0.003];
      return b.v(p, 2, clamp((depths[j] - 0.05) / 0.22, 0, 0.92), depths[j] * hk);
    }),
  );
  const outDir = (ci: number): P3 => {
    const P = b.pos;
    const id = sheet[ci][0];
    return norm([P[id * 3], 0, P[id * 3 + 2] + 0.02]);
  };
  for (let ci = 0; ci < sheet.length - 1; ci++) {
    const o = norm(add(outDir(ci), outDir(ci + 1)));
    for (let j = 0; j < depths.length - 1; j++) {
      b.quadDir(sheet[ci][j], sheet[ci + 1][j], sheet[ci + 1][j + 1], sheet[ci][j + 1], o);
      if (inner.length) b.quadDir(inner[ci][j], inner[ci + 1][j], inner[ci + 1][j + 1], inner[ci][j + 1], mul(o, -1));
    }
  }

  if (!cfg.details) {
    // lo / tiny: a bun block only
    b.use(BONE.HEAD, REG.HAIR, FB.BUN, 0.95);
    blob(b, [0, d.headRings[5].y + 0.02 * hk, d.headRings[5].cz - d.headRings[5].b - 0.025 * hk], [0.04 * hk, 0.038 * hk, 0.036 * hk], cfg === LODS[1] ? 5 : 4, cfg === LODS[1] ? 3 : 2);
    if (cfg === LODS[1]) {
      // lo: a coarse beard shell (jaw + chin), so beards do not pop off at the LOD0 → lo switch
      b.use(BONE.HEAD, REG.BEARD, FB.BEARD, 1);
      const phis = [-1.75, -0.9, 0, 0.9, 1.75];
      const ys = [d.headRings[0].y - 0.004 * hk, d.headRings[2].y - 0.004 * hk];
      const rows = ys.map((y, ri) => phis.map((phi) => b.v(headSurface(d, phi, ri === 1 && Math.abs(phi) < 0.5 ? y - 0.02 * hk : y, 0.008 * hk), 2, ri === 0 ? 0.1 : 0)));
      for (let k = 0; k < phis.length - 1; k++) b.quadOut(rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k], [0, ys[0], -0.01]);
      const under = b.v([0, d.headRings[0].y - 0.012 * hk, d.headRings[0].cz + 0.01 * hk], 2, 0.15);
      for (let k = 0; k < phis.length - 1; k++) b.triOut(rows[0][k], rows[0][k + 1], under, [0, ys[1], -0.01]);
    }
    return;
  }
  // ponytail (3 rings hanging down the back of the head)
  b.use(BONE.HEAD, REG.HAIR, FB.PONY, 0.95);
  {
    const r5 = d.headRings[5];
    const root: P3 = [0, r5.y + 0.005 * hk, r5.cz - r5.b - 0.006 * hk];
    // close: a gathered root, a band, a full body of locks (lobed section) tapering to an uneven tip
    const pts: [P3, number, number][] = cfg.close
      ? [
          [add(root, [0, 0.004 * hk, 0.008 * hk]), 0.03 * hk, 0],
          [root, 0.0175 * hk, 0],
          [add(root, [0, -0.008 * hk, -0.006 * hk]), 0.0175 * hk, 0.05],
          [add(root, [0, -0.03 * hk, -0.024 * hk]), 0.03 * hk, 0.18],
          [add(root, [0, -0.08 * hk, -0.036 * hk]), 0.032 * hk, 0.4],
          [add(root, [0, -0.15 * hk, -0.034 * hk]), 0.025 * hk, 0.62],
          [add(root, [0, -0.21 * hk, -0.03 * hk]), 0.014 * hk, 0.82],
        ]
      : [
          [root, 0.026 * hk, 0],
          [add(root, [0, -0.08 * hk, -0.034 * hk]), 0.03 * hk, 0.4],
          [add(root, [0, -0.22 * hk, -0.03 * hk]), 0.016 * hk, 0.8],
        ];
    const rings2: Ring[] = [];
    const ns = cfg.close ? 14 : 6;
    // aux: swing share (0 at the root … 1 at the tip) and the drop below the root (the swing pivot)
    for (let j = 0; j < pts.length; j++) {
      const [c, r, w] = pts[j];
      const ids: number[] = [];
      if (cfg.close) b.setTint(j === 1 || j === 2 ? 0.55 : 0.95); // the band (hair tie)
      for (let k = 0; k < ns; k++) {
        const phi = (k / ns) * Math.PI * 2;
        const lobe = cfg.close && j > 2 ? 1 + 0.13 * Math.sin(phi * 5 + j * 0.9) + 0.06 * Math.sin(phi * 9 - j) : 1;
        const tip = cfg.close && j === pts.length - 1 ? [0, (0.012 * Math.sin(phi * 3 + 1) + 0.008 * Math.sin(phi * 7)) * hk, 0] : [0, 0, 0];
        ids.push(b.v(add(add(c, [r * lobe * Math.sin(phi), 0, r * lobe * 0.8 * Math.cos(phi)]), tip as P3), 2, w * 0.7, w * 1.2, root[1] - c[1]));
      }
      rings2.push({ ids, c });
    }
    bridge(b, rings2);
    const last = pts[pts.length - 1][0];
    capFan(b, rings2[rings2.length - 1], b.v(add(last, [0, -0.02 * hk, 0]), 2, 0.6, 1.1, root[1] - last[1] + 0.02 * hk), add(last, [0, 0.02, 0]));
  }
  // bun (back of the head, slightly high)
  b.use(BONE.HEAD, REG.HAIR, FB.BUN, 0.95);
  {
    const r5 = d.headRings[5];
    if (cfg.close) coilBun(b, [0, r5.y + 0.028 * hk, r5.cz - r5.b - 0.02 * hk], [0.04 * hk, 0.036 * hk, 0.034 * hk]);
    else blob(b, [0, r5.y + 0.028 * hk, r5.cz - r5.b - 0.02 * hk], [0.038 * hk, 0.035 * hk, 0.032 * hk], 6, 4);
  }
  // fringe (a short visor of hair over the forehead)
  b.use(BONE.HEAD, REG.HAIR, FB.FRINGE, 0.93);
  {
    const ids: number[][] = [];
    if (cfg.close) {
      // close: grows out from under the cap, curves forward over the brow and ends in uneven strand tips
      // (longer towards the temples), thinning to the edge — not a visor block
      const phis: number[] = [];
      for (let k = 0; k <= 16; k++) phis.push(-1.0 + (2 * k) / 16);
      const y6 = d.headRings[6].y,
        y5 = d.headRings[5].y;
      const rowsF: [number, number][] = [
        [y6 + 0.022 * hk, vol * 0.5],
        [y6 + 0.004 * hk, vol * 1.05],
        [(y6 + y5) / 2, vol * 1.0],
        [y5 + 0.004 * hk, vol * 0.8],
      ];
      rowsF.forEach(([y, push], ri) => {
        const row: number[] = [];
        phis.forEach((phi, k) => {
          // (the tips are in the fragment shader, strand by strand: aux2 = height above the lowest row)
          // (sweeps up at its ends and sinks under the cap: a flap pasted on the forehead had a wall at each side)
          const ae = Math.abs(phi);
          const jag = (ri === 3 ? -0.006 * ae * hk : 0) + (0.022 * hk * ae * ae * ae * ri) / 3;
          const inCap = ae ** 4;
          row.push(b.v(headSurface(d, phi, y + jag, push + (vol * 0.45 - push) * inCap), 2, 0, 0, [0.075, 0.05, 0.025, 0][ri]));
        });
        ids.push(row);
      });
      for (let r = 0; r < rowsF.length - 1; r++) for (let k = 0; k < phis.length - 1; k++) b.quadDir(ids[r][k], ids[r][k + 1], ids[r + 1][k + 1], ids[r + 1][k], [0, 0, 1]);
    } else {
      for (const [y, push] of [
        [d.headRings[6].y + 0.012 * hk, vol * 1.1],
        [d.headRings[5].y + 0.004 * hk, vol * 0.7],
      ] as [number, number][]) {
        const row: number[] = [];
        for (const phi of [-0.95, -0.5, 0, 0.5, 0.95]) row.push(b.v(headSurface(d, phi, y, push), 2, 0));
        ids.push(row);
      }
      for (let k = 0; k < 4; k++) b.quadDir(ids[0][k], ids[0][k + 1], ids[1][k + 1], ids[1][k], [0, 0, 1]);
    }
  }
  // beard: a shell over jaw and chin (+ moustache)
  if (cfg.close) {
    buildCloseBeard(b, d);
    return;
  }
  b.use(BONE.HEAD, REG.BEARD, FB.BEARD, 1);
  {
    const rows: number[][] = [];
    const ys = [d.headRings[0].y - 0.004 * hk, d.headRings[1].y + 0.004 * hk, d.headRings[3].y - 0.01 * hk];
    const phis = [-1.85, -1.2, -0.55, 0, 0.55, 1.2, 1.85];
    ys.forEach((y, ri) => {
      const row: number[] = [];
      for (const phi of phis) {
        const front = Math.cos(phi);
        // upper rows only at the sides (cheeks), leave the mouth free
        const yy = ri === 2 && front > 0.7 ? y - 0.016 * hk : y;
        row.push(b.v(headSurface(d, phi, yy, (ri === 0 ? 0.009 : 0.006) * hk), 2, ri === 0 ? 0.1 : 0));
      }
      rows.push(row);
    });
    for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < phis.length - 1; k++) b.quadOut(rows[r][k], rows[r][k + 1], rows[r + 1][k + 1], rows[r + 1][k], [0, ys[r], -0.01]);
    // under the chin
    const under = b.v([0, d.headRings[0].y - 0.012 * hk, d.headRings[0].cz + 0.01 * hk], 2, 0.15);
    for (let k = 0; k < phis.length - 1; k++) b.triOut(rows[0][k], rows[0][k + 1], under, [0, ys[1], -0.01]);
  }
  b.use(BONE.HEAD, REG.BEARD, FB.MOUSTACHE, 1);
  {
    const y = (d.headRings[2].y + d.headRings[3].y) / 2;
    const row: number[] = [];
    const row2: number[] = [];
    for (const phi of [-0.6, -0.25, 0, 0.25, 0.6]) {
      row.push(b.v(headSurface(d, phi, y + 0.006 * hk, 0.005 * hk), 2, 0));
      row2.push(b.v(headSurface(d, phi, y - 0.006 * hk, 0.007 * hk), 2, 0));
    }
    for (let k = 0; k < 4; k++) b.quadOut(row[k], row[k + 1], row2[k + 1], row2[k], [0, y, 0]);
  }
}

/** smooth ellipsoid blob (shared vertices) */
/** close level: a bun wound as a coil — a spiral ridge of twisted hair round its axis, a lumpy outline,
 *  tucked ends, a flattened side against the head (the axis points back and up from the skull) */
function coilBun(b: MeshBuilder, c: P3, r: P3): void {
  const seg = 18,
    rings = 9;
  const top = b.v([c[0], c[1] + r[1] * 0.9, c[2]], 2, 0);
  const rows: Ring[] = [];
  for (let j = 1; j < rings; j++) {
    const ph = (j / rings) * Math.PI;
    const ids: number[] = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      // the coil: a ridge spiralling twice round the bun, finer twists inside it, flat against the head (+z)
      const coil = 1 + 0.12 * Math.max(0, Math.sin(a * 2 + ph * 5)) ** 1.5 - 0.05 + 0.035 * Math.sin(a * 7 - ph * 9);
      const flat = Math.cos(a) > 0 ? 1 - 0.3 * Math.cos(a) ** 2 * Math.sin(ph) : 1;
      const sr = Math.sin(ph) * coil;
      ids.push(b.v([c[0] + r[0] * sr * Math.sin(a), c[1] + r[1] * Math.cos(ph) * (1 + 0.04 * Math.sin(a * 3)), c[2] + r[2] * sr * Math.cos(a) * flat], 2, 0));
    }
    rows.push({ ids, c });
  }
  const bot = b.v([c[0], c[1] - r[1] * 0.92, c[2]], 2, 0);
  capFan(b, rows[0], top, c);
  bridge(b, rows);
  capFan(b, rows[rows.length - 1], bot, c);
}

function blob(b: MeshBuilder, c: P3, r: P3, seg: number, rings: number): void {
  const top = b.v([c[0], c[1] + r[1], c[2]], 2, 0);
  const rows: Ring[] = [];
  for (let j = 1; j < rings; j++) {
    const ph = (j / rings) * Math.PI;
    const ids: number[] = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      ids.push(b.v([c[0] + r[0] * Math.sin(ph) * Math.sin(a), c[1] + r[1] * Math.cos(ph), c[2] + r[2] * Math.sin(ph) * Math.cos(a)], 2, 0));
    }
    rows.push({ ids, c });
  }
  const bot = b.v([c[0], c[1] - r[1], c[2]], 2, 0);
  capFan(b, rows[0], top, c);
  bridge(b, rows);
  capFan(b, rows[rows.length - 1], bot, c);
}

// ───────────────────────────────────────────────────────────── hats ──
// One dome + one brim ring + a visor; the shader shapes them per hat style (aux1 = s along the
// dome / brim; style table in shader.ts): cap, flat cap, sun hat, fedora, hard hat, beanie.

function buildHat(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const pin = cfg.props === 'pin';
  const n = cfg.close ? 24 : cfg === LODS[0] ? 10 : pin ? 4 : 6;
  const hk = d.H / 1.76;
  // hat band (fraction chin→crown): across the forehead ~2.5 cm above the brows at the front, lower over the
  // back of the skull — as a hat is worn (a level band at brow height put the brim over the eyes)
  const chin = d.headRings[0].y - 0.006;
  const crown = d.crown;
  const rimY = chin + (crown - chin) * 0.665;
  const rimAt = (phi: number): number => chin + (crown - chin) * (0.665 + 0.045 * Math.cos(phi));
  const ss = cfg.close ? [0, 0.14, 0.28, 0.42, 0.56, 0.69, 0.8, 0.89, 0.95, 0.985, 1] : cfg === LODS[0] ? [0, 0.35, 0.7, 1] : pin ? [0, 1] : [0, 0.55, 0.85, 1];
  const hatK = cfg.details ? 1 : 1.45;
  const rings: Ring[] = [];
  b.use(BONE.HEAD, REG.HAT, FB.HAT, 1);
  for (const s of ss) {
    if (s >= 1) break;
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const r0 = rimAt(phi);
      const y = r0 + (crown - r0) * Math.pow(s, 0.8);
      ids.push(b.v(headSurface(d, phi, Math.min(y, crown - 0.003), 0.0145 * hk * hatK), 2, 0, s, phi));
    }
    rings.push({ ids, c: [0, rimY, -0.01 * hk] });
  }
  bridge(b, rings);
  if (cfg.close) {
    b.setTint(0.4);
    const lin: number[] = [];
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      lin.push(b.v(headSurface(d, phi, rimAt(phi) - 0.002, 0), 2, 0, -1, phi));
    }
    const cl: P3 = [0, rimY + 0.07, d.headRings[4].cz];
    bridge(b, [
      { ids: lin, c: cl },
      { ids: rings[0].ids, c: cl },
    ]);
    b.setTint(1);
  }
  const apex = b.v([0, crown + 0.0145 * hk * hatK, cfg.close ? d.headRings[4].cz : d.headRings[d.headRings.length - 1].cz - 0.004], 2, 0, 1, 0);
  capFan(b, rings[rings.length - 1], apex, [0, rimY, 0]);
  if (pin) return;
  // brim (both faces): inner ring on the hat band, outer ring pushed out by the shader
  b.use(BONE.HEAD, REG.HAT, FB.BRIM, 0.95);
  if (cfg.close) {
    // close: more sides, a middle ring so it can curve (the shader's droop goes with s²)
    const nb = 40;
    const ss2 = [0, 0.3, 0.65, 1];
    const form = sweepPeople('hatform');
    const faces: [number, number][] = [
      [0, 0.95],
      [form ? -0.0048 : -0.002, 0.7],
    ];
    const P = b.pos;
    const cz = d.headRings[4].cz;
    const lastRows: number[][] = [];
    faces.forEach(([dy, tint], fi) => {
      b.setTint(tint);
      const rows = ss2.map(() => [] as number[]);
      for (let k = 0; k < nb; k++) {
        const phi = (k / nb) * Math.PI * 2;
        const p = headSurface(d, phi, rimAt(phi) + dy, 0.012 * hk);
        ss2.forEach((s, i) => rows[i].push(b.v(p, 2, 0, s, phi)));
      }
      const up: P3 = fi === 0 ? [0, 1, 0] : [0, -1, 0];
      // (the outer rings sit on the inner one at rest, so the winding test uses stand-ins further out, restored afterwards)
      const saved = rows.map((r) => r.map((i) => [P[i * 3], P[i * 3 + 2]]));
      rows.forEach((r, ri) =>
        r.forEach((i) => {
          const l = Math.hypot(P[i * 3], P[i * 3 + 2] - cz) || 1;
          const o = 0.05 * ss2[ri];
          P[i * 3] += (P[i * 3] / l) * o;
          P[i * 3 + 2] += ((P[i * 3 + 2] - cz) / l) * o;
        }),
      );
      for (let ri = 0; ri < rows.length - 1; ri++)
        for (let k = 0; k < nb; k++) {
          const k1 = (k + 1) % nb;
          b.quadDir(rows[ri][k], rows[ri][k1], rows[ri + 1][k1], rows[ri + 1][k], up);
        }
      lastRows.push(rows[rows.length - 1]);
      rows.forEach((r, ri) =>
        r.forEach((i, j) => {
          if (ri > 0) b.standIn.set(i, [P[i * 3], P[i * 3 + 1] - 0.01 * ss2[ri], P[i * 3 + 2]]);
          P[i * 3] = saved[ri][j][0];
          P[i * 3 + 2] = saved[ri][j][1];
        }),
      );
    });
    // the brim's edge: a rolled lip joining its two faces (two sheets a hair apart read as a blade, edge on)
    if (form) {
      b.setTint(0.82);
      const lip: number[] = [];
      for (let k = 0; k < nb; k++) {
        const phi = (k / nb) * Math.PI * 2;
        lip.push(b.v(headSurface(d, phi, rimAt(phi) - 0.0024, 0.012 * hk), 2, 0, 1.012, phi));
      }
      const saved2: [number, number[]][] = [];
      for (const ring of [lastRows[0], lip, lastRows[1]])
        for (const i of ring) saved2.push([i, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]]);
      const push = (ring: number[], o: number, dy: number) =>
        ring.forEach((i) => {
          const l = Math.hypot(P[i * 3], P[i * 3 + 2] - cz) || 1;
          P[i * 3] += (P[i * 3] / l) * o;
          P[i * 3 + 2] += ((P[i * 3 + 2] - cz) / l) * o;
          P[i * 3 + 1] += dy;
        });
      for (const i of [...lastRows[0], ...lastRows[1]]) { const st = b.standIn.get(i); if (st) { P[i * 3] = st[0]; P[i * 3 + 1] = st[1]; P[i * 3 + 2] = st[2]; } }
      push(lip, 0.051, -0.01);
      for (let k = 0; k < nb; k++) {
        const k1 = (k + 1) % nb;
        const phi = ((k + 0.5) / nb) * Math.PI * 2;
        const o: P3 = [Math.sin(phi), 0, Math.cos(phi)];
        b.quadDir(lastRows[0][k], lastRows[0][k1], lip[k1], lip[k], o);
        b.quadDir(lip[k], lip[k1], lastRows[1][k1], lastRows[1][k], o);
      }
      lip.forEach((i) => b.standIn.set(i, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]));
      for (const [i, q] of saved2) { P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; }
      b.setTint(1);
    }
  }
  const bi: number[] = [],
    bo: number[] = [],
    bi2: number[] = [],
    bo2: number[] = [];
  if (!cfg.close)
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * Math.PI * 2;
    const p = headSurface(d, phi, rimAt(phi), 0.012 * hk);
    bi.push(b.v(p, 2, 0, 0, phi));
    bo.push(b.v(p, 2, 0, 1, phi));
  }
  const under = cfg === LODS[0]; // brim underside only at LOD0 (lo and below are seen from above)
  b.setTint(0.7);
  if (under)
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const p = headSurface(d, phi, rimAt(phi) - 0.002, 0.012 * hk);
      bi2.push(b.v(p, 2, 0, 0, phi));
      bo2.push(b.v(p, 2, 0, 1, phi));
    }
  // the outer brim ring sits on the inner one at rest (the shader pushes it out), so the winding test
  // uses stand-in positions 5 cm further out, restored afterwards
  const P = b.pos;
  const outer = bo.concat(bo2);
  const saved = outer.map((i) => [P[i * 3], P[i * 3 + 2]]);
  for (const i of outer) {
    const l = Math.hypot(P[i * 3], P[i * 3 + 2] - d.headRings[4].cz) || 1;
    P[i * 3] += (P[i * 3] / l) * 0.05;
    P[i * 3 + 2] += ((P[i * 3 + 2] - d.headRings[4].cz) / l) * 0.05;
  }
  if (!cfg.close)
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    b.quadDir(bi[k], bi[k1], bo[k1], bo[k], [0, 1, 0]);
    if (under) b.quadDir(bi2[k], bi2[k1], bo2[k1], bo2[k], [0, -1, 0]);
  }
  outer.forEach((i, j) => {
    b.standIn.set(i, [P[i * 3], P[i * 3 + 1] - 0.01, P[i * 3 + 2]]);
    P[i * 3] = saved[j][0];
    P[i * 3 + 2] = saved[j][1];
  });
  if (!cfg.details) return;
  // visor (front half-disc, both faces)
  b.use(BONE.HEAD, REG.HAT, FB.VISOR, 0.9);
  {
    const vform = sweepPeople('hatform');
    const phis = cfg.close ? (vform ? [-1.2, -1.08, -0.92, -0.69, -0.46, -0.23, 0, 0.23, 0.46, 0.69, 0.92, 1.08, 1.2] : [-1.15, -0.92, -0.69, -0.46, -0.23, 0, 0.23, 0.46, 0.69, 0.92, 1.15]) : [-1.05, -0.36, 0.36, 1.05];
    if (cfg.close) {
      const rows: number[][] = [],
        rows2: number[][] = [];
      for (const s of [0, 0.35, 0.7, 1]) {
        const r: number[] = [],
          r2: number[] = [];
        for (const phi of phis) {
          const p = headSurface(d, phi, rimAt(phi) + 0.002 * hk, 0.0115 * hk);
          const fo = Math.cos(phi * 1.3);
          // (runs out to nothing into the dome at its ends: a blunt end stood off the cap as a notch)
          const L = 0.078 * hk * (vform ? Math.max(0, Math.cos(phi * 1.309)) ** 0.5 * (Math.abs(phi) > 1.19 ? 0 : 1) : Math.max(0, fo) ** 0.6);
          // (arched across, dropping towards the front edge)
          const q: P3 = [p[0] * (1 + 0.03 * s) + Math.sin(phi) * 0.012 * hk * s, p[1] - 0.016 * hk * s * s - 0.007 * hk * (1 - fo * fo) * s, p[2] + L * s];
          b.setTint(1);
          r.push(b.v(q, 2, 0, s, phi));
          b.setTint(0.6);
          r2.push(b.v([q[0], q[1] - (vform ? 0.0042 : 0.003), q[2]], 2, 0, s, phi));
        }
        rows.push(r);
        rows2.push(r2);
      }
      for (let i = 0; i < rows.length - 1; i++)
        for (let k = 0; k < phis.length - 1; k++) {
          b.quadDir(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k], [0, 1, 0.2]);
          b.quadDir(rows2[i][k], rows2[i][k + 1], rows2[i + 1][k + 1], rows2[i + 1][k], [0, -1, 0]);
        }
      // the peak's edge
      if (vform)
        for (let k = 0; k < phis.length - 1; k++) {
          const f = rows.length - 1;
          b.quadDir(rows[f][k], rows[f][k + 1], rows2[f][k + 1], rows2[f][k], [Math.sin(phis[k]), 0, Math.cos(phis[k])]);
        }
      return;
    }
    const inner: number[] = [],
      outer: number[] = [],
      inner2: number[] = [],
      outer2: number[] = [];
    for (const phi of phis) {
      const p = headSurface(d, phi, rimAt(phi) + 0.004 * hk, 0.012 * hk);
      const q: P3 = [p[0] * 1.02 + Math.sin(phi) * 0.02 * hk, p[1] - 0.012 * hk, p[2] + Math.cos(phi) * 0.075 * hk * (0.55 + 0.45 * Math.cos(phi))];
      inner.push(b.v(p, 2, 0, 0, phi));
      outer.push(b.v(q, 2, 0, 1, phi));
      inner2.push(b.v([p[0], p[1] - 0.003, p[2]], 2, 0, 0, phi, 0.6));
      outer2.push(b.v([q[0], q[1] - 0.003, q[2]], 2, 0, 1, phi, 0.6));
    }
    for (let k = 0; k < phis.length - 1; k++) {
      b.quadDir(inner[k], inner[k + 1], outer[k + 1], outer[k], [0, 1, 0.2]);
      b.quadDir(inner2[k], inner2[k + 1], outer2[k + 1], outer2[k], [0, -1, 0]);
    }
  }
}

// ───────────────────────────────────────────────── tail (skirt / coat) ──
// aux1: ring parameter (−1 / −0.5 fixed rings at the belt / hips, 0…1 parametric down to the hem),
// aux2: side (sin φ: +1 left … −1 right) for the thigh skinning in the shader.

function buildTail(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const n = cfg.tailSides;
  const belt = d.torso[4],
    hipR = d.torso[2],
    crotch = d.torso[1];
  const rings: Ring[] = [];
  const us = cfg.tailRings === 4 ? [-1, -0.5, 0.45, 1] : cfg.tailRings === 2 ? [-1, 1] : [-1, -0.5, 1];
  b.use(BONE.TAIL, REG.TAIL, FB.TAIL, 1);
  for (const u of us) {
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2 + Math.PI / n;
      let p: P3;
      if (u === -1) p = torsoPoint({ ...belt, hw: belt.hw + 0.007, f: belt.f + 0.007, b: belt.b + 0.007 }, 0, phi);
      else if (u === -0.5) p = torsoPoint({ ...hipR, hw: hipR.hw + 0.012, f: hipR.f + 0.012, b: hipR.b + 0.012 }, 0, phi);
      else {
        // parametric rings: shape of the hips + the outer thighs; the shader sets y and the flare
        const r = { ...crotch, hw: hipR.hw + 0.018, f: hipR.f + 0.03, b: hipR.b + 0.016 };
        p = torsoPoint(r, 0, phi);
        p[1] = hipR.y;
      }
      ids.push(b.v(p, 0, 0, u, Math.sin(phi), u > 0.95 ? 0.85 : 1));
    }
    rings.push({ ids, c: [0, belt.y - 0.2, -0.01] });
  }
  // the parametric rings share one rest height (the shader spreads them down to the hem), so their quads
  // are degenerate at rest: the winding test and the normals use stand-in positions of a hanging skirt
  const P = b.pos;
  const rest = rings.map((r) => r.ids.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]));
  rings.forEach((r, j) => {
    const u = us[j];
    if (u < 0) {
      r.c = [0, P[r.ids[0] * 3 + 1], -0.01];
      return;
    }
    const fy = hipR.y - 0.36 * u;
    r.c = [0, fy, -0.01];
    for (const i of r.ids) {
      const x = P[i * 3],
        z = P[i * 3 + 2] + 0.01;
      const l = Math.hypot(x, z) || 1;
      const sp: P3 = [x + (x / l) * 0.025 * u, fy, P[i * 3 + 2] + (z / l) * 0.025 * u];
      b.standIn.set(i, sp);
      P[i * 3] = sp[0];
      P[i * 3 + 1] = sp[1];
      P[i * 3 + 2] = sp[2];
    }
  });
  bridge(b, rings);
  rings.forEach((r, j) =>
    r.ids.forEach((i, k) => {
      P[i * 3] = rest[j][k][0];
      P[i * 3 + 1] = rest[j][k][1];
      P[i * 3 + 2] = rest[j][k][2];
    }),
  );
  if (cfg !== LODS[0] && !cfg.close) return; // lo and below are seen from above: no lining
  // hem lining: a flat darker ring 10 % inside the hem (u = 1: same height), facing down, so the skirt
  // never reads as an open tube from below / when seated
  b.setTint(0.45);
  const inner: number[] = [];
  const last = rings[rings.length - 1];
  for (let k = 0; k < n; k++) {
    const a = last.ids[k];
    const phi = (k / n) * Math.PI * 2 + Math.PI / n;
    const p: P3 = [P[a * 3] * 0.9, P[a * 3 + 1], (P[a * 3 + 2] + 0.01) * 0.9 - 0.01];
    const id = b.v(p, 0, 0, 1, Math.sin(phi));
    const sa = b.standIn.get(a);
    if (sa) b.standIn.set(id, [sa[0] * 0.9, sa[1], (sa[2] + 0.01) * 0.9 - 0.01]);
    inner.push(id);
  }
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    b.quadOut(inner[k], inner[k1], last.ids[k1], last.ids[k], [0, belt.y + 0.3, 0]);
  }
}

// ────────────────────────────────────────────────── collar / lapels / tie ──

/** close level: a real lapel down each side of the opening (a roll, a notch where it meets the collar, its edge standing off the chest), a shirt collar with two points, a tie from a knot */
function buildCloseLapels(b: MeshBuilder, d: Dims): void {
  const hk = d.H / 1.76;
  const T = d.torso.map((_, i) => closeTorsoRing(d, i));
  // the torso's surface as buildTorso makes it: straight between the lower rings, Catmull-Rom from ring 8, the yoke above ring 10
  const at = (h: number): { r: BodyRing; bust: number; n: number; bone: number; w: number } => {
    if (h > TORSO_H[10]) {
      const t = (h - TORSO_H[10]) / (1 - TORSO_H[10]);
      return { r: yokeRing(d, t), bust: 0, n: 2.3 - 0.3 * t, bone: TORSO_BONE[10][0], w: TORSO_BONE[10][1] };
    }
    let i = 0;
    while (i < T.length - 2 && TORSO_H[i + 1] <= h) i++;
    const t = (h - TORSO_H[i]) / (TORSO_H[i + 1] - TORSO_H[i]);
    const g = (k: number) => T[Math.max(0, Math.min(T.length - 1, k))];
    const F = (f: (r: BodyRing) => number) => {
      if (i < 8) return f(T[i]) + (f(T[i + 1]) - f(T[i])) * t;
      const a0 = f(g(i - 1)),
        b0 = f(g(i)),
        c0 = f(g(i + 1)),
        e0 = f(g(i + 2));
      return 0.5 * (2 * b0 + (-a0 + c0) * t + (2 * a0 - 5 * b0 + 4 * c0 - e0) * t * t + (-a0 + 3 * b0 - 3 * c0 + e0) * t * t * t);
    };
    const r: BodyRing = { y: F((r) => r.y), hw: F((r) => r.hw), f: F((r) => r.f), b: F((r) => r.b), cz: F((r) => r.cz) };
    return { r, bust: d.bust[i] + (d.bust[i + 1] - d.bust[i]) * t, n: 2.3, bone: TORSO_BONE[i + (t > 0.5 ? 1 : 0)][0], w: TORSO_BONE[i][1] + (TORSO_BONE[i + 1][1] - TORSO_BONE[i][1]) * t };
  };
  const P = (h: number, phi: number, out: number): P3 => {
    const q = at(h);
    return torsoPoint({ ...q.r, hw: q.r.hw + out, f: q.r.f + out, b: q.r.b + out }, q.bust, phi, q.n);
  };
  // the opening, as the shader cuts it on the torso (s of a jacket with lapels)
  const open = (h: number) => (h - 0.5) * 0.77 + 90 * Math.max(0, h - 0.9) ** 2;
  // up the opening: how wide the lapel is there. It widens to its point, steps in at the notch, and the collar's leaf goes on round the neck
  const W: [number, number][] = [[0, 0.004], [0.12, 0.08], [0.3, 0.18], [0.5, 0.27], [0.62, 0.33], [0.625, 0.15], [0.72, 0.18], [0.84, 0.2], [0.93, 0.26], [1, 0.34]];
  for (const side of [1, -1]) {
    const rows: number[][] = [];
    for (const [t, w] of W) {
      const h = 0.5 + 0.46 * t;
      const q = at(h);
      const ph = Math.max(0, open(h) - 0.012);
      b.use(q.bone, REG.OUTER, FB.LAPELS, 1.14);
      const row = [b.v(P(h, ph * side, 0.0045), h, q.w), b.v(P(h, (ph + w * 0.4) * side, 0.0085), h, q.w), b.v(P(h, (ph + w) * side, 0.0062), h, q.w)];
      // (under its edge the lapel's shadow on the chest)
      b.setTint(0.62);
      row.push(b.v(P(h, (ph + w + 0.018) * side, -0.0005), h, q.w));
      b.setTint(1.14);
      rows.push(row);
    }
    for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < 3; k++) b.quadDir(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k], [0, 0, 1]);
  }
  // shirt collar: a band from the yoke up the neck, open at the throat, with two points lying on the chest
  b.use(BONE.CHEST, REG.COLLAR, FB.COLLAR, 1);
  const hLo = 0.982;
  const N0 = closeNeck(d, 0),
    N1 = closeNeck(d, 1);
  const rHi: BodyRing = { y: N0.y + (N1.y - N0.y) * 0.98, hw: N0.hw + (N1.hw - N0.hw) * 0.98 + 0.0075, f: N0.f + (N1.f - N0.f) * 0.98 + 0.0085, b: N0.b + (N1.b - N0.b) * 0.98 + 0.0075, cz: N0.cz + (N1.cz - N0.cz) * 0.98 };
  const n = 16;
  const un: number[] = [],
    lo: number[] = [],
    hi: number[] = [];
  for (let k = 0; k < n; k++) {
    const phi = ((k + 0.5) / n) * Math.PI * 2;
    const c = Math.cos(phi);
    const drop = 0.026 * hk * Math.max(0, (c - 0.75) / 0.25) ** 1.5;
    // (its foot goes down into the yoke at a steep angle: two nearly parallel surfaces cross in a scalloped line)
    un.push(b.v(P(hLo - 0.012, phi, -0.006), 1.0, 0.6));
    lo.push(b.v(P(hLo + 0.004, phi, 0.0045), 1.02, 0.6));
    hi.push(b.v(torsoPoint({ ...rHi, y: rHi.y - drop }, 0, phi, 2), 1.08, 0.4));
  }
  for (let k = 0; k < n; k++) {
    b.quadOut(un[k], un[(k + 1) % n], lo[(k + 1) % n], lo[k], [0, N0.y, N0.cz]);
    b.quadOut(lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k], [0, N0.y, N0.cz]);
  }
  for (const side of [1, -1]) {
    const hp = (phi: number, out: number, dy: number): P3 => {
      const q = torsoPoint({ ...rHi, hw: rHi.hw + out, f: rHi.f + out, b: rHi.b + out }, 0, phi * side, 2);
      return [q[0], q[1] + dy, q[2]];
    };
    const a0 = b.v(hp(0.42, 0.0015, -0.018 * hk), 1.06, 0.4),
      e0 = b.v(hp(1.3, 0.002, 0), 1.06, 0.4),
      f0 = b.v(P(0.985, 1.2 * side, 0.0065), 1.02, 0.6),
      tip = b.v(P(0.94, 0.3 * side, 0.0075), 1.0, 0.6);
    b.quadDir(a0, e0, f0, tip, [0.3 * side, 0.2, 1]);
  }
  // a hood down: a soft bag of cloth round the back of the neck, resting on the shoulders, its opening rolled towards the nape
  {
    const NC = 15,
      rowsH: number[][] = [];
    const ROWS = 6;
    for (let j = 0; j < ROWS; j++) {
      const row: number[] = [];
      for (let i = 0; i < NC; i++) {
        const u = (i / (NC - 1)) * 2 - 1;
        const au = Math.abs(u);
        const phi = Math.PI + u * 2.1;
        const bk = 1 - au * au;
        const et = 1 - Math.max(0, (au - 0.62) / 0.38) ** 2;
        let p: P3;
        let tint = 1.14;
        if (j < 3) {
          const hj = [0.915 + 0.05 * au, 0.935 + 0.035 * au, 0.968 + 0.012 * au][j];
          const out = [-0.002, 0.02, 0.042][j] * et * (0.45 + 0.55 * bk) + [0, 0.004, 0.012][j] * et;
          p = P(hj, phi, out);
          if (j > 0) p = [p[0], p[1] + [0, 0.002, 0.012][j] * et * hk, p[2]];
        } else {
          // up over the roll to the rim, and in towards the neck
          const k = [0.42, 0.72, 0.9][j - 3];
          const out = [0.03, 0.021, 0.0125][j - 3] * (0.5 + 0.5 * bk) * et + 0.004;
          const r: BodyRing = { y: N0.y + (N1.y - N0.y) * k * (0.55 + 0.45 * et), hw: N0.hw + (N1.hw - N0.hw) * k + out, f: N0.f + (N1.f - N0.f) * k + out, b: N0.b + (N1.b - N0.b) * k + out, cz: N0.cz + (N1.cz - N0.cz) * k };
          const q0 = torsoPoint(r, 0, phi, 2);
          const yBase = P(0.97, phi, 0.0)[1];
          p = [q0[0], Math.max(q0[1], yBase + 0.004) - (1 - et) * 0.006, q0[2]];
          if (j === 5) tint = 0.92;
        }
        b.use(BONE.CHEST, REG.OUTER, FB.HOOD, tint);
        // (a crease where two panels meet, down the middle of the back)
        b.setTint(tint * (1 - 0.12 * Math.exp(-u * u * 90) * (j > 0 ? 1 : 0)));
        row.push(b.v(p, 1.05, 0));
      }
      rowsH.push(row);
    }
    for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < NC - 1; i++) b.quadOut(rowsH[j][i], rowsH[j][i + 1], rowsH[j + 1][i + 1], rowsH[j + 1][i], [0, N0.y - 0.01, N0.cz + 0.02]);
  }
  // tie: a knot at the throat, the blade down the shirt to a point, on the surface all the way down
  b.use(BONE.CHEST, REG.ACCENT, FB.TIE, 1);
  const TIE: [number, number][] = [[0.968, 0.012], [0.948, 0.019], [0.935, 0.011], [0.86, 0.018], [0.76, 0.024], [0.7, 0.03], [0.64, 0.03], [0.58, 0.03], [0.52, 0.03], [0.505, 0.03]];
  let prev: number[] | null = null;
  for (const [h, w] of TIE) {
    const q = at(h);
    b.use(q.bone, REG.ACCENT, FB.TIE, 1);
    const c = P(h, 0, 0.005 + (h > 0.93 ? 0.0055 : 0));
    // (it goes in under the jacket where the opening closes: never wider than the opening, down to nothing at the button)
    const wo = h > 0.9 ? w * hk : Math.min(w * hk, Math.max(0.0008, P(h, Math.max(0, open(h) - 0.018), 0)[0]));
    const row = [b.v([-wo, c[1], c[2] - 0.0008], 0.7, q.w), b.v([0, c[1], c[2] + 0.001], 0.7, q.w), b.v([wo, c[1], c[2] - 0.0008], 0.7, q.w)];
    if (prev) for (let k = 0; k < 2; k++) b.quadDir(prev[k], prev[k + 1], row[k + 1], row[k], [0, 0, 1]);
    prev = row;
  }
}

function buildUpperGarments(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const hk = d.H / 1.76;
  const closeLapels = cfg.close && sweepPeople('lapels');
  if (closeLapels) buildCloseLapels(b, d);
  // shirt collar: a short band around the neck base
  b.use(BONE.CHEST, REG.COLLAR, FB.COLLAR, 1);
  if (!closeLapels) {
    const n0 = d.neckRings[0],
      n1 = d.neckRings[1];
    const lo: number[] = [],
      hi: number[] = [];
    const n = 8;
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const front = Math.cos(phi);
      const r0 = { ...n0, y: n0.y + 0.012 * hk, hw: n0.hw + 0.009, f: n0.f + 0.011, b: n0.b + 0.008 };
      const r1 = { ...n1, y: n1.y - 0.005 * hk - (front > 0.8 ? 0.02 * hk : 0), hw: n1.hw + 0.006, f: n1.f + 0.008, b: n1.b + 0.006 };
      lo.push(b.v(torsoPoint(r0, 0, phi, 2), 1.02, 0.6));
      hi.push(b.v(torsoPoint(r1, 0, phi, 2), 1.1, 0.4));
    }
    for (let k = 0; k < n; k++) b.quadOut(lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k], [0, n0.y, n0.cz]);
  }
  // lapels: two thin flaps on the chest from the collar to the button point
  b.use(BONE.CHEST, REG.OUTER, FB.LAPELS, 0.82);
  if (!closeLapels) for (const side of [1, -1]) {
    const r7 = d.torso[7],
      r9 = d.torso[9],
      r6 = d.torso[6];
    const p = (r: BodyRing, phi: number, out: number): P3 => {
      const q = torsoPoint({ ...r, hw: r.hw + out, f: r.f + out, b: r.b + out }, d.bust[d.torso.indexOf(r)] ?? 0, phi);
      return q;
    };
    const top0 = p(r9, 0.35 * side, 0.01),
      top1 = p(r9, 0.75 * side, 0.01);
    const mid0 = p(r7, 0.18 * side, 0.012),
      mid1 = p(r7, 0.62 * side, 0.01);
    const bot = p(r6, 0.03 * side, 0.012);
    const ids = [b.v(top0, 0.86, 0), b.v(top1, 0.86, 0), b.v(mid1, 0.64, 0), b.v(mid0, 0.64, 0), b.v(bot, 0.52, 0)];
    b.triDir(ids[0], ids[1], ids[2], [0, 0, 1]);
    b.triDir(ids[0], ids[2], ids[3], [0, 0, 1]);
    b.triDir(ids[3], ids[2], ids[4], [0, 0, 1]);
  }
  // tie: from the collar knot down the chest to the belt
  b.use(BONE.CHEST, REG.ACCENT, FB.TIE, 1);
  if (!closeLapels) {
    const r9 = d.torso[9],
      r7 = d.torso[7],
      r5 = d.torso[5];
    const zf = (r: BodyRing, out: number) => r.cz + r.f + out + (d.bust[d.torso.indexOf(r)] ?? 0) * 0.3;
    const pts: [number, number, number][] = [
      [r9.y + 0.02 * hk, zf(r9, 0.008), 0.016 * hk],
      [r9.y - 0.01 * hk, zf(r9, 0.012), 0.022 * hk],
      [r7.y, zf(r7, 0.008), 0.03 * hk],
      [r5.y + 0.03 * hk, zf(r5, 0.008), 0.034 * hk],
    ];
    const ids: number[][] = pts.map(([y, z, w]) => [b.v([-w / 2, y, z], 0.7, 0), b.v([w / 2, y, z], 0.7, 0)]);
    for (let i = 0; i < ids.length - 1; i++) b.quadDir(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0], [0, 0, 1]);
    const tipY = r5.y + 0.005 * hk;
    b.triDir(ids[3][0], ids[3][1], b.v([0, tipY, zf(r5, 0.008)], 0.7, 0), [0, 0, 1]);
  }
  // hood (bump at the back of the neck)
  b.use(BONE.CHEST, REG.OUTER, FB.HOOD, 0.92);
  if (!closeLapels) {
    const r10 = d.torso[10];
    blob(b, [0, r10.y + 0.035 * hk, r10.cz - r10.b - 0.005 * hk], [0.085 * hk, 0.05 * hk, 0.04 * hk], 7, 4);
  }
}

// ──────────────────────────────────────────────────────────── props ──

/** rounded box (8 shared corners per face set → 24 vertices, slightly bevelled normals) */
function softBox(b: MeshBuilder, c: P3, size: P3, h = 0, w = 0, a1 = 0, a2 = 0): void {
  const [sx, sy, sz] = mul(size, 0.5);
  const ids: number[] = [];
  for (const [x, y, z] of [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ])
    ids.push(b.v([c[0] + x * sx, c[1] + y * sy, c[2] + z * sz], h, w, a1, a2));
  const F: [number, number, number, number][] = [
    [0, 1, 2, 3],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [1, 5, 6, 2],
    [3, 2, 6, 7],
    [4, 5, 1, 0],
  ];
  for (const [a, bb, cc, dd] of F) b.quadOut(ids[a], ids[bb], ids[cc], ids[dd], c);
}

/** close level: a paper shopping bag (bulging sides, open top with a rolled rim and an inside, goods
 *  showing, two rope handles up to the grip) hanging from the grip point g (BAG_R bone) */
function shoppingBag(b: MeshBuilder, g: P3, hk: number): void {
  const longHandles = sweepPeople('grips');
  const c: P3 = add(g, [longHandles ? 0.012 : -0.012, -0.16 * hk - (longHandles ? 0.11 * hk : 0), 0.005]);
  const hx = 0.05 * hk,
    hy = 0.13 * hk,
    hz = 0.11 * hk;
  const S = 16;
  const ringAt = (y: number, bulge: number, inset: number): P3[] => {
    const out: P3[] = [];
    for (let k = 0; k < S; k++) {
      const a = (k / S) * Math.PI * 2;
      // rounded rectangle (superellipse), the long sides bulging with the contents
      const sx = se(Math.sin(a), 6),
        sz = se(Math.cos(a), 6);
      out.push([c[0] + sx * (hx + bulge * Math.abs(Math.cos(a)) * 0.6 - inset), c[1] + y, c[2] + sz * (hz + bulge * Math.abs(Math.sin(a)) - inset)]);
    }
    return out;
  };
  const rows: [number, number][] = [
    [-hy, 0],
    [-hy * 0.6, 0.008 * hk],
    [0, 0.012 * hk],
    [hy * 0.7, 0.006 * hk],
    [hy, 0],
  ];
  b.use(BONE.BAG_R, REG.BAG, FB.SHOPBAG, 1);
  const rings: Ring[] = rows.map(([y, bu], j) => {
    b.setTint(j === 0 ? 0.8 : 1);
    return { ids: ringAt(y, bu, 0).map((p) => b.v(p, 0, 0)), c: [c[0], c[1] + y, c[2]] };
  });
  bridge(b, rings);
  capFan(b, rings[0], b.v([c[0], c[1] - hy - 0.002, c[2]], 0, 0), [c[0], c[1], c[2]]);
  // the inside: an inset wall down from the rim (darker), so the open top has depth
  b.setTint(0.5);
  const inner: Ring = { ids: ringAt(hy, 0, 0.004 * hk).map((p) => b.v(p, 0, 0)), c: [c[0], c[1] + hy, c[2]] };
  const deep: Ring = { ids: ringAt(hy * 0.2, 0, 0.004 * hk).map((p) => b.v(p, 0, 0)), c: [c[0], c[1] + hy * 0.2, c[2]] };
  const top = rings[rings.length - 1];
  for (let k = 0; k < S; k++) {
    const k1 = (k + 1) % S;
    b.quadDir(top.ids[k], top.ids[k1], inner.ids[k1], inner.ids[k], [0, 1, 0]);
    b.quadOut(inner.ids[k], inner.ids[k1], deep.ids[k1], deep.ids[k], [c[0] + 1, c[1] + hy * 2, c[2]]);
  }
  // goods showing above the rim: a wrapped parcel and something in the accent colour
  b.use(BONE.BAG_R, REG.WHITE, FB.SHOPBAG, 0.95);
  blob(b, [c[0], c[1] + hy * 0.95, c[2] - hz * 0.4], [hx * 0.7, 0.04 * hk, hz * 0.35], 8, 4);
  b.use(BONE.BAG_R, REG.ACCENT, FB.SHOPBAG, 1);
  blob(b, [c[0] + 0.004, c[1] + hy * 0.9, c[2] + hz * 0.35], [hx * 0.75, 0.045 * hk, hz * 0.4], 8, 4);
  // rope handles from the middle of each long rim edge to the grip
  b.use(BONE.BAG_R, REG.STRAP, FB.SHOPBAG, 0.8);
  if (longHandles) {
    // two loops of cord, one on each long side, drawn up to the closed hand
    const tip: P3 = add(g, [0.022, -0.012, 0.004]);
    for (const sx of [1, -1])
      for (const sz of [1, -1]) {
        const a: P3 = [c[0] + sx * hx * 0.92, c[1] + hy - 0.003, c[2] + sz * hz * 0.42];
        const mid: P3 = add(lerp3(a, tip, 0.45), [sx * 0.008, 0, sz * 0.012]);
        const t2: P3 = add(tip, [sx * 0.002, 0, sz * 0.008]);
        stick(b, a, mid, 0.0028, 4);
        stick(b, mid, t2, 0.0028, 4);
      }
    return;
  }
  for (const s of [1, -1]) {
    const a0: P3 = [c[0], c[1] + hy, c[2] + s * hz * 0.35],
      a1: P3 = [c[0], c[1] + hy, c[2] - s * hz * 0.05];
    const tip: P3 = add(g, [-0.012, -0.004, s * 0.006]);
    stick(b, a0, tip, 0.0035, 4);
    stick(b, tip, a1, 0.0035, 4);
  }
}

/** thin strip/box between two points (straps, rods) */
function stick(b: MeshBuilder, p0: P3, p1: P3, wdt: number, sides = 4, a1 = 0, a2 = 0, h = 0, w = 0): void {
  const D = norm(sub(p1, p0));
  const { U, V } = limbFrame(D);
  const r0: number[] = [],
    r1: number[] = [];
  for (let k = 0; k < sides; k++) {
    const phi = (k / sides) * Math.PI * 2 + Math.PI / 4;
    const o = add(mul(U, wdt * Math.sin(phi)), mul(V, wdt * Math.cos(phi)));
    r0.push(b.v(add(p0, o), h, w, a1, a2));
    r1.push(b.v(add(p1, o), h, w, a1 + 1, a2));
  }
  bridge(b, [
    { ids: r0, c: p0 },
    { ids: r1, c: p1 },
  ]);
}

/** a point just above the trapezius at lateral offset x (straps run over it) */
function shoulderTop(d: Dims, x: number): P3 {
  const r10 = d.torso[10],
    r11 = d.torso[11];
  const ax = Math.abs(x);
  const t = clamp((ax - r11.hw) / (r10.hw - r11.hw), 0, 1);
  const y = r11.y + (r10.y - r11.y) * t;
  const cz = r11.cz + (r10.cz - r11.cz) * t;
  return [x, y + 0.016 * (d.H / 1.76), cz];
}

/** close level: a strap that hugs the torso (each point pushed out to the torso surface + off) */
function strapPath(b: MeshBuilder, d: Dims, cfg: LodCfg, p0: P3, p1: P3, wdt: number, ctrl?: P3): void {
  if (!cfg.close) {
    stick(b, p0, p1, wdt);
    return;
  }
  const T = d.torso;
  const out = (p: P3): P3 => {
    if (p[1] <= T[0].y || p[1] >= T[T.length - 1].y) return p;
    let i = 0;
    while (i < T.length - 2 && T[i + 1].y < p[1]) i++;
    const a = T[i],
      c = T[i + 1];
    const t = (p[1] - a.y) / (c.y - a.y);
    const r: BodyRing = { y: p[1], hw: a.hw + (c.hw - a.hw) * t, f: a.f + (c.f - a.f) * t, b: a.b + (c.b - a.b) * t, cz: a.cz + (c.cz - a.cz) * t };
    const bust = d.bust[i] + (d.bust[i + 1] - d.bust[i]) * t;
    const phi = Math.atan2(p[0] / r.hw, (p[2] - r.cz) / (p[2] >= r.cz ? r.f : r.b));
    const sp = torsoPoint(r, bust, phi);
    const rp = Math.hypot(p[0], p[2] - r.cz),
      rs = Math.hypot(sp[0], sp[2] - r.cz) + wdt * 0.9 + 0.003;
    // (up on the shoulder a radial push goes sideways: there only out of the body, never onto it)
    if (rp < 1e-4 || (p[1] > T[9].y && rp >= rs)) return p;
    const k = rs / rp;
    return [p[0] * k, p[1], r.cz + (p[2] - r.cz) * k];
  };
  // a flat webbing ribbon (outer face + edges) along the surface
  const N = 8;
  const pts: P3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(out(ctrl ? lerp3(lerp3(p0, ctrl, t), lerp3(ctrl, p1, t), t) : lerp3(p0, p1, t)));
  }
  const cz = T[8].cz;
  const half = wdt * 1.6,
    th = wdt * 0.35;
  const rowO: number[] = [],
    rowI: number[] = [],
    edgeA: number[] = [],
    edgeB: number[] = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const dir = norm(sub(pts[Math.min(N, i + 1)], pts[Math.max(0, i - 1)]));
    let o = norm([p[0], 0, p[2] - cz]);
    o = norm(add(o, [0, 2 * sstep(T[9].y, T[10].y, p[1]), 0]));
    const sd = norm(cross(dir, o));
    const oo = mul(o, th);
    rowO.push(b.v(add(add(p, mul(sd, half)), oo), 0, 0));
    rowI.push(b.v(add(add(p, mul(sd, -half)), oo), 0, 0));
    edgeA.push(b.v(add(p, mul(sd, half)), 0, 0));
    edgeB.push(b.v(add(p, mul(sd, -half)), 0, 0));
  }
  const mid = (i: number): P3 => [0, pts[i][1], cz];
  for (let i = 0; i < N; i++) {
    b.quadOut(rowO[i], rowO[i + 1], rowI[i + 1], rowI[i], mid(i));
    b.quadOut(edgeA[i], edgeA[i + 1], rowO[i + 1], rowO[i], pts[i]);
    b.quadOut(edgeB[i], edgeB[i + 1], rowI[i + 1], rowI[i], pts[i]);
  }
}

/** close level: a backpack strap in the plane x, over the shoulder from the back (ring yB) to the chest (ring yF): it lies on the body's own
 *  outline ring by ring, and its ribbon stays square to x. Returns the point it ends on, in front. */
function strapOver(b: MeshBuilder, d: Dims, x: number, iB: number, iF: number, wdt: number): { back: P3; front: P3 } {
  const T = d.torso;
  const onRing = (i: number, front: boolean): P3 => {
    const r = T[i];
    let lo = front ? 0 : Math.PI / 2,
      hi = front ? Math.PI / 2 : Math.PI;
    const ax = Math.abs(x);
    for (let k = 0; k < 18; k++) {
      const m = (lo + hi) / 2;
      const q = torsoPoint(r, d.bust[i], m)[0];
      if (front ? q < ax : q > ax) lo = m;
      else hi = m;
    }
    const q = torsoPoint(r, d.bust[i], (lo + hi) / 2);
    return [x, q[1], q[2]];
  };
  const raw: P3[] = [];
  for (let i = iB; i <= 10; i++) raw.push(onRing(i, false));
  // over the top, where the yoke's width comes to x
  let tTop = 0.5;
  for (let t = 0; t <= 1; t += 0.02) if (yokeRing(d, t).hw >= Math.abs(x)) tTop = t;
  const rt = yokeRing(d, tTop);
  raw.push([x, rt.y, rt.cz - rt.b * 0.32], [x, rt.y + 0.004, rt.cz], [x, rt.y, rt.cz + rt.f * 0.32]);
  for (let i = 10; i >= iF; i--) raw.push(onRing(i, true));
  // one round of corner cutting
  let pts: P3[] = [raw[0]];
  for (let i = 0; i < raw.length - 1; i++) pts.push(lerp3(raw[i], raw[i + 1], 0.25), lerp3(raw[i], raw[i + 1], 0.75));
  pts.push(raw[raw.length - 1]);
  const centre: P3 = [x, T[9].y - 0.06, T[9].cz];
  const half = wdt * 1.6,
    th = wdt * 0.4;
  const rows = pts.map((p, i) => {
    const dir = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    let o: P3 = [0, -dir[2], dir[1]];
    if (o[1] * (p[1] - centre[1]) + o[2] * (p[2] - centre[2]) < 0) o = mul(o, -1);
    const q = add(p, mul(o, 0.0035));
    const X: P3 = [half, 0, 0];
    return [b.v(sub(q, X), 0, 0), b.v(add(add(q, mul(o, th)), mul(X, -0.8)), 0, 0), b.v(add(add(q, mul(o, th)), mul(X, 0.8)), 0, 0), b.v(add(q, X), 0, 0)];
  });
  for (let i = 0; i < rows.length - 1; i++)
    for (let k = 0; k < 3; k++) b.quadOut(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k], centre);
  return { back: pts[0], front: pts[pts.length - 1] };
}

const BAG_DETAIL = detailPeople('bagdetail');
function buildProps(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const hk = d.H / 1.76;
  const all = cfg.props === 'all';
  const far = cfg.props === 'far' || cfg.props === 'pin';
  // backpack (on the chest bone, follows lean and twist) + straps over the shoulders
  b.use(BONE.CHEST, REG.BAG, FB.BACKPACK, 1);
  {
    const r7 = d.torso[7];
    const back = r7.cz - r7.b;
    if (far) softBox(b, [0, r7.y, back - 0.055 * hk], [0.27 * hk, 0.34 * hk, 0.11 * hk]);
    else {
      // rounded pack: a short loft (front face flat against the back)
      const n = cfg.close ? 12 : all ? 8 : 6;
      const rings: Ring[] = [];
      const ys = cfg.close ? [-0.18, -0.15, -0.02, 0.1, 0.16, 0.185] : all ? [-0.18, -0.02, 0.17] : [-0.17, 0.15];
      ys.forEach((dy, i) => {
        // a soft sack: full low down where the load sits, rolling over at the top; darker towards the bottom
        const shrink = cfg.close ? [0.86, 0.98, 1, 0.95, 0.84, 0.62][i] : i === 0 || i === ys.length - 1 ? 0.85 : 1;
        if (cfg.close) b.setTint([0.74, 0.82, 0.96, 1, 0.97, 0.9][i]);
        const ids: number[] = [];
        for (let k = 0; k < n; k++) {
          const phi = (k / n) * Math.PI * 2 + Math.PI / n;
          const x = 0.135 * hk * shrink * se(Math.sin(phi), 3.2);
          // the lower part leans in onto the lumbar curve (no gap behind the back)
          const fwd = dy < 0 ? (-dy / 0.18) * 0.02 * hk : 0;
          const z = back - 0.06 * hk + fwd + 0.055 * hk * shrink * se(Math.cos(phi), 3.2);
          ids.push(b.v([x, r7.y + dy * hk - 0.02 * hk, z], 0, 0));
        }
        rings.push({ ids, c: [0, r7.y + dy * hk, back - 0.06 * hk] });
      });
      bridge(b, rings);
      const t = rings[rings.length - 1],
        bo = rings[0];
      capFan(b, t, b.v(add(t.c, [0, 0.012 * hk, 0]), 0, 0), bo.c);
      capFan(b, bo, b.v(add(bo.c, [0, -0.012 * hk, 0]), 0, 0), t.c);
      if (all && BAG_DETAIL) {
        // the front pocket, a shade darker, standing proud of the pack's face
        const zf = back - 0.115 * hk;
        b.setTint(0.84);
        softBox(b, [0, r7.y - 0.095 * hk, zf - 0.012 * hk], [0.2 * hk, 0.13 * hk, 0.034 * hk]);
        if (cfg.close) {
          // zips, side pockets, webbing down the body, the grab loop on top
          b.use(BONE.CHEST, REG.DARK, FB.BACKPACK, 0.9);
          softBox(b, [0, r7.y - 0.036 * hk, zf - 0.029 * hk], [0.17 * hk, 0.006 * hk, 0.003]);
          softBox(b, [0, r7.y + 0.11 * hk, zf + 0.009 * hk], [0.2 * hk, 0.006 * hk, 0.004]);
          b.use(BONE.CHEST, REG.BAG, FB.BACKPACK, 0.8);
          for (const s of [1, -1]) softBox(b, [s * 0.139 * hk, r7.y - 0.105 * hk, back - 0.06 * hk], [0.018 * hk, 0.11 * hk, 0.075 * hk]);
          b.use(BONE.CHEST, REG.STRAP, FB.BACKPACK, 0.72);
          for (const s of [1, -1]) softBox(b, [s * 0.07 * hk, r7.y + 0.025 * hk, zf - 0.001 * hk], [0.016 * hk, 0.25 * hk, 0.004]);
          const topY = r7.y + 0.165 * hk,
            tz = back - 0.06 * hk;
          const pk: P3 = [0, topY + 0.03 * hk, tz];
          stick(b, [-0.035 * hk, topY - 0.002, tz], [-0.018 * hk, pk[1], tz], 0.0045);
          stick(b, [-0.018 * hk, pk[1], tz], [0.018 * hk, pk[1], tz], 0.0045);
          stick(b, [0.018 * hk, pk[1], tz], [0.035 * hk, topY - 0.002, tz], 0.0045);
        }
      }
      if (all) {
        // straps: pack top → over the shoulder (trapezius) → down the front of the chest
        b.use(BONE.CHEST, REG.STRAP, FB.BACKPACK, 0.7);
        const r8 = d.torso[8];
        for (const s of [1, -1]) {
          if (!cfg.close) {
            const top = shoulderTop(d, 0.092 * hk * s);
            strapPath(b, d, cfg, [0.1 * s * hk, r8.y, r8.cz - r8.b - 0.012], top, 0.01 * hk);
            strapPath(b, d, cfg, top, [0.105 * s * hk, r7.y - 0.03 * hk, r7.cz + r7.f + 0.008 + d.bust[7] * 0.7], 0.01 * hk);
          } else {
            const r5 = d.torso[5];
            const side: P3 = [s * r5.hw * 0.98, r5.y + 0.01 * hk, r5.cz + r5.f * 0.25];
            if (sweepPeople('straps')) {
              // padded down the front of the shoulder, clear of the bust; a buckle; thin webbing from there, running round the ribs in one curve
              const x = 0.112 * s * hk;
              const r8f = d.torso[8];
              const chest = strapOver(b, d, x, 8, 8, 0.01 * hk).front;
              const below: P3 = [chest[0], chest[1] - 0.012 * hk, chest[2]];
              const r6 = d.torso[6];
              strapPath(b, d, cfg, below, side, 0.0052 * hk, [x * 1.1, r6.y + 0.01 * hk, r6.cz + r6.f]);
              strapPath(b, d, cfg, side, [0.11 * s * hk, r5.y - 0.02 * hk, r5.cz - r5.b - 0.01], 0.0052 * hk);
              b.use(BONE.CHEST, REG.DARK, FB.BACKPACK, 1);
              const bk = add(chest, [0, -0.008 * hk, 0.0045 + r8f.f * 0.002]);
              softBox(b, bk, [0.024 * hk, 0.014 * hk, 0.005]);
              b.use(BONE.CHEST, REG.STRAP, FB.BACKPACK, 0.7);
            } else {
              const chest = strapOver(b, d, 0.098 * s * hk, 8, 7, 0.01 * hk).front;
              strapPath(b, d, cfg, chest, side, 0.008 * hk);
              strapPath(b, d, cfg, side, [0.11 * s * hk, r5.y - 0.02 * hk, r5.cz - r5.b - 0.01], 0.008 * hk);
            }
          }
        }
      }
    }
  }
  const grip = (side: 1 | -1): P3 => lerp3(pv(d.wrist, side), pv(d.tip, side), 0.42);
  if (!far) {
    // cross-body bag on the front of the left hip (inside the hand's swing path at x ≈ 0.22)
    b.use(BONE.PELVIS, REG.BAG, FB.SHOULDERBAG, 1);
    const r2 = d.torso[2];
    const x = 0.125 * hk,
      z = r2.cz + r2.f + 0.03 * hk,
      y = r2.y + 0.025 * hk;
    softBox(b, [x, y, z], [0.19 * hk, 0.15 * hk, 0.05 * hk]);
    if (cfg.close) {
      // flap over the top two thirds of the front (a shade darker, overhanging the body by a few mm), buckle
      b.setTint(0.82);
      softBox(b, [x, y + 0.03 * hk, z + 0.024 * hk], [0.196 * hk, 0.1 * hk, 0.006]);
      softBox(b, [x, y + 0.075 * hk, z], [0.196 * hk, 0.006, 0.054 * hk]);
      b.use(BONE.PELVIS, REG.DARK, FB.SHOULDERBAG, 0.9);
      softBox(b, [x, y - 0.012 * hk, z + 0.028 * hk], [0.022 * hk, 0.016 * hk, 0.004]);
      b.use(BONE.PELVIS, REG.BAG, FB.SHOULDERBAG, 1);
    }
    if (all) {
      b.use(BONE.CHEST, REG.STRAP, FB.SHOULDERBAG, 0.75);
      const r9 = d.torso[9],
        r6 = d.torso[6];
      // strap: bag corner → across the chest → over the right shoulder → down the back to the bag
      const top = shoulderTop(d, -0.095 * hk);
      const r7 = d.torso[7];
      if (cfg.close) {
        // (over the shoulder ring by ring, the diagonals hugging the body from there)
        const over = strapOver(b, d, -0.1 * hk, 8, 8, 0.011 * hk);
        strapPath(b, d, cfg, [x + 0.07 * hk, y + 0.07 * hk, z - 0.01], over.front, 0.011 * hk, sweepPeople('straps') ? [over.front[0] + 0.012 * hk, over.front[1] - 0.075 * hk, over.front[2]] : undefined);
        strapPath(b, d, cfg, over.back, [0.14 * hk, r6.y - 0.06 * hk, r6.cz - r6.b - 0.01], 0.011 * hk);
        if (sweepPeople('straps')) {
          // (where the shoulder piece meets the diagonal: the strap's adjuster)
          b.use(BONE.CHEST, REG.DARK, FB.SHOULDERBAG, 1);
          softBox(b, add(over.front, [0.001 * hk, -0.004 * hk, 0.0045]), [0.03 * hk, 0.012 * hk, 0.005]);
          b.use(BONE.CHEST, REG.STRAP, FB.SHOULDERBAG, 0.7);
        }
      } else {
        strapPath(b, d, cfg, [x + 0.07 * hk, y + 0.07 * hk, z - 0.01], [-0.02 * hk, r7.y, r7.cz + r7.f + 0.008 + d.bust[7]], 0.011 * hk);
        strapPath(b, d, cfg, [-0.02 * hk, r7.y, r7.cz + r7.f + 0.008 + d.bust[7]], top, 0.011 * hk);
        strapPath(b, d, cfg, top, [0.14 * hk, r6.y - 0.06 * hk, r6.cz - r6.b - 0.01], 0.011 * hk);
      }
      void r9;
    }
  }
  // hand-held bags hang plumb from the grip point (BAG_L / BAG_R bones): positions are offsets from
  // the grip (palm centre), resolved in the shader
  if (cfg.props !== 'pin') b.use(BONE.BAG_R, REG.BAG, FB.SHOPBAG, 1);
  if (cfg.props !== 'pin') {
    const g = grip(-1);
    if (cfg.close) shoppingBag(b, g, hk);
    else softBox(b, add(g, [-0.012, -0.16 * hk, 0.005]), [0.1 * hk, 0.26 * hk, 0.22 * hk]);
    if (all && !cfg.close) {
      b.setTint(0.7);
      stick(b, add(g, [-0.012, -0.03 * hk, 0.0]), add(g, [-0.012, 0.004, 0.0]), 0.006);
    }
  }
  if (!far) {
    b.use(BONE.BAG_L, REG.BAG, FB.BRIEFCASE, 1);
    const g = grip(1);
    const caseDrop = cfg.close && sweepPeople('grips') ? 0.05 * hk : 0;
    softBox(b, add(g, [0.008, -0.15 * hk - caseDrop, 0.01]), [0.075 * hk, 0.26 * hk, 0.36 * hk]);
    if (all) {
      b.use(BONE.BAG_L, REG.DARK, FB.BRIEFCASE, 1);
      if (cfg.close) {
        // an arched handle on two lugs, a seam round the lid and two catches
        const yT = -0.02 * hk - 0.03 * hk - caseDrop;
        if (caseDrop > 0) {
          // (a smooth bail, running through the closed fingers: the old one sat in the palm's thickness, under the hand)
          const hx = -0.02;
          const hy = -0.024 * hk;
          const pts: P3[] = [
            [hx * 0.4, yT, -0.06 * hk],
            [hx * 0.9, hy - 0.012 * hk, -0.052 * hk],
            [hx, hy - 0.002 * hk, -0.03 * hk],
            [hx, hy, 0.01 * hk],
            [hx, hy - 0.002 * hk, 0.05 * hk],
            [hx * 0.9, hy - 0.012 * hk, 0.072 * hk],
            [hx * 0.4, yT, 0.08 * hk],
          ];
          for (let i = 0; i < pts.length - 1; i++) stick(b, add(g, lerp3(pts[i], pts[i + 1], -0.08)), add(g, lerp3(pts[i], pts[i + 1], 1.08)), 0.0052, 6);
          for (const zz of [-0.06, 0.08]) softBox(b, add(g, [hx * 0.4 + 0.008, yT - 0.002, zz * hk]), [0.012, 0.012, 0.02]);
        } else {
          stick(b, add(g, [0.008, yT, -0.045 * hk]), add(g, [0.008, -0.012 * hk, -0.035 * hk]), 0.006);
          stick(b, add(g, [0.008, -0.012 * hk, -0.035 * hk]), add(g, [0.008, -0.004 * hk, 0.0]), 0.006);
          stick(b, add(g, [0.008, -0.004 * hk, 0.0]), add(g, [0.008, -0.012 * hk, 0.045 * hk]), 0.006);
          stick(b, add(g, [0.008, -0.012 * hk, 0.045 * hk]), add(g, [0.008, yT, 0.055 * hk]), 0.006);
        }
        const yl = -0.15 * hk + 0.13 * hk - 0.035 * hk - caseDrop;
        for (const sx of [1, -1]) softBox(b, add(g, [0.008 + sx * 0.039 * hk, yl, 0.01]), [0.004, 0.006, 0.364 * hk]);
        for (const zz of [-0.1, 0.12]) for (const sx of [1, -1]) softBox(b, add(g, [0.008 + sx * 0.039 * hk, yl - 0.012, zz * hk]), [0.004, 0.018, 0.022]);
      } else stick(b, add(g, [0.008, -0.02 * hk, -0.04 * hk]), add(g, [0.008, -0.02 * hk, 0.05 * hk]), 0.008);
    }
  }
  if (all) {
    // cane: from the right hand's grip down to a tip target (aux1 0 = grip … 1 = tip; −2…−1 = crook, rigid)
    b.use(BONE.CANE, REG.DARK, FB.CANE, 1);
    {
      const g = grip(-1);
      stick(b, add(g, [0, 0.03, 0]), add(g, [0, -0.8, 0]), 0.0095, 4, 0);
      stick(b, add(g, [0, 0.03, -0.05]), add(g, [0, 0.03, 0.05]), 0.01, 4, -2);
    }
    // fishing rod (right hand, pointing forward and up once posed)
    b.use(BONE.HAND_R, REG.DARK, FB.ROD, 1);
    {
      const g = grip(-1);
      stick(b, add(g, [0, 0.0, 0]), add(g, [-0.02, -1.14, 1.76]), 0.008, 4, -2);
    }
    // phone and coffee cup in the right hand
    b.use(BONE.HAND_R, REG.DARK, FB.PHONE, 1);
    {
      const g = grip(-1);
      if (cfg.close && sweepPeople('grips')) {
        // from the heel of the hand to the middle of the fingers, resting on them, the fingertips coming round its far end; a screen on the face side
        softBox(b, add(g, [0.021, 0.006, 0.004]), [0.009, 0.14 * hk, 0.068 * hk]);
        b.use(BONE.HAND_R, REG.WHITE, FB.PHONE, 0.42);
        softBox(b, add(g, [0.0262, 0.006, 0.004]), [0.0008, 0.128 * hk, 0.06 * hk]);
      } else softBox(b, add(g, [0.012, -0.005, 0.018]), [0.012, 0.13 * hk, 0.065 * hk]);
    }
    b.use(BONE.HAND_R, REG.WHITE, FB.CUP, 0.95);
    {
      const g = grip(-1);
      const c = add(g, [0.03, 0.015, 0.012]);
      const cs = cfg.close ? 14 : 6;
      const ring = (dy: number, r: number): Ring => {
        const ids: number[] = [];
        for (let k = 0; k < cs; k++) {
          const a = (k / cs) * Math.PI * 2;
          ids.push(b.v([c[0] + r * Math.sin(a), c[1] + dy, c[2] + r * Math.cos(a)], 0, 0));
        }
        return { ids, c: [c[0], c[1] + dy, c[2]] };
      };
      if (cfg.close) {
        // takeaway cup: paper body, a corrugated card sleeve round the middle, a domed lid with a rim
        const r0 = ring(-0.05, 0.029),
          s0 = ring(-0.03, 0.0315),
          s1 = ring(0.025, 0.0345),
          r1 = ring(0.05, 0.035);
        bridge(b, [r0, ring(-0.03, 0.0303)]);
        b.setTint(0.97);
        bridge(b, [ring(0.025, 0.0333), r1]);
        b.use(BONE.HAND_R, REG.BAG, FB.CUP, 0.62);
        bridge(b, [s0, s1]);
        b.use(BONE.HAND_R, REG.WHITE, FB.CUP, 0.9);
        const l0 = ring(0.05, 0.0372),
          l1 = ring(0.06, 0.0372),
          l2 = ring(0.066, 0.031);
        bridge(b, [l0, l1, l2]);
        capFan(b, l2, b.v([c[0], c[1] + 0.07, c[2]], 0, 0), [c[0], c[1], c[2]]);
        capFan(b, r0, b.v([c[0], c[1] - 0.051, c[2]], 0, 0), [c[0], c[1] + 0.05, c[2]]);
      } else {
        bridge(b, [ring(-0.05, 0.03), ring(0.06, 0.036)]);
        b.use(BONE.HAND_R, REG.DARK, FB.CUP, 1);
        const top = ring(0.06, 0.036);
        capFan(b, top, b.v([c[0], c[1] + 0.062, c[2]], 0, 0), [c[0], c[1], c[2]]);
      }
    }
  }
  if (!far) {
    // newspaper held in front of the chest (bench readers)
    b.use(BONE.CHEST, REG.WHITE, FB.NEWSPAPER, 0.96);
    if (cfg.close && sweepPeople('propprint')) {
      // an open sheet: two pages meeting at a fold, bowing a little, sagging at the bottom corners away from the hands
      const w = 0.235 * hk,
        h = 0.17 * hk,
        cy = d.chest.y + 0.08 * hk;
      const NX = 16,
        NY = 4;
      for (const [o, up, tint] of [[0, 1, 0.96], [0.0016, -1, 0.9]] as [number, number, number][]) {
        b.setTint(tint);
        const rows: number[][] = [];
        for (let j = 0; j <= NY; j++) {
          const v = j / NY;
          const row: number[] = [];
          for (let i = 0; i <= NX; i++) {
            const u = (i / NX) * 2 - 1;
            const au = Math.abs(u);
            const z = 0.4 * hk - 0.052 * hk * au + 0.012 * hk * Math.sin(au * Math.PI) - 0.018 * hk * v * (1 - au) * 0.4 + o;
            const y = cy + h - 2 * h * v - 0.014 * hk * v * v * au * au;
            row.push(b.v([u * w, y, z], 0, 0, u, 1 - v));
          }
          rows.push(row);
        }
        for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) b.quadDir(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i], [0, 0, up]);
      }
      b.setTint(1);
    } else
    softBox(b, [0, d.chest.y + 0.08 * hk, 0.36 * hk], [0.46 * hk, 0.3 * hk, 0.008]);
  }
  // umbrella (right hand grip, kept upright) and beach towel
  if (!far) {
    b.use(BONE.UMB, REG.DARK, FB.UMBRELLA, 1);
    const g = grip(-1);
    stick(b, add(g, [0, -0.06, 0]), add(g, [0, 0.82, 0]), cfg.close ? 0.0055 : 0.008, cfg.close ? 6 : 4);
    if (cfg.close) {
      // crook handle below the hand, ferrule on top
      const hook: P3[] = [
        [0, -0.06, 0],
        [0, -0.115, 0],
        [0, -0.142, 0.018],
        [0, -0.138, 0.042],
        [0, -0.112, 0.055],
      ];
      for (let i = 0; i < hook.length - 1; i++) stick(b, add(g, hook[i]), add(g, hook[i + 1]), 0.009, 6);
      stick(b, add(g, [0, 0.98, 0]), add(g, [0, 1.05, 0]), 0.004, 4);
    }
  }
  b.use(BONE.UMB, REG.EXTRA, FB.UMBRELLA, 1);
  if (cfg.close) umbrellaClose(b, d);
  else umbrella(b, d, all ? 8 : cfg.props === 'pin' ? 4 : far ? 5 : 6, all);
  b.use(BONE.GROUND, REG.TOWEL, FB.TOWEL, 1);
  if (shapeOn('shapetowels')) towelLaid(b, cfg.close ? 6 : far ? 1 : 3, cfg.close ? 12 : far ? 1 : 6);
  else towel(b);
}

function umbrella(b: MeshBuilder, d: Dims, n: number, under: boolean): void {
  const g = lerp3(pv(d.wrist, -1), pv(d.tip, -1), 0.42);
  const apexY = g[1] + 0.98,
    rimY = g[1] + 0.74,
    R = 0.56;
  const apex = b.v([g[0], apexY, g[2]], 0, 0);
  const rim: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    rim.push(b.v([g[0] + Math.sin(a) * R, rimY, g[2] + Math.cos(a) * R], 0, 0));
  }
  for (let k = 0; k < n; k++) b.triDir(apex, rim[k], rim[(k + 1) % n], [0, 1, 0]);
  if (under) {
    b.setTint(0.55);
    const ua = b.v([g[0], apexY - 0.04, g[2]], 0, 0);
    const rim2 = rim.map((i) => b.v([b.pos[i * 3], b.pos[i * 3 + 1] - 0.004, b.pos[i * 3 + 2]], 0, 0));
    for (let k = 0; k < n; k++) b.triDir(ua, rim2[k], rim2[(k + 1) % n], [0, -1, 0]);
  }
}

/** close level: eight ribs, the canopy domed between apex and rim and pulled taut between the ribs (each
 *  panel's rim edge scallops up between rib tips), a lining underside with the ribs showing */
function umbrellaClose(b: MeshBuilder, d: Dims): void {
  const g = lerp3(pv(d.wrist, -1), pv(d.tip, -1), 0.42);
  const n = 8;
  const apexY = g[1] + 0.98,
    rimY = g[1] + 0.74,
    R = 0.56;
  const pt = (a: number, rad: number, y: number): P3 => [g[0] + Math.sin(a) * rad, y, g[2] + Math.cos(a) * rad];
  // rings over 2n directions (rib, panel middle): dome at 0.55 R, rim scalloped
  const ringPts = (f: number, under: number): P3[] => {
    const out: P3[] = [];
    for (let k = 0; k < 2 * n; k++) {
      const a = (k / (2 * n)) * Math.PI * 2;
      const mid = k % 2 === 1;
      const rad = R * f * (mid ? Math.cos(Math.PI / n) * (f > 0.9 ? 0.985 : 1) : 1);
      const dome = Math.sqrt(Math.max(0, 1 - f * f * 0.82));
      let y = rimY + (apexY - rimY) * (dome - Math.sqrt(1 - 0.82)) / (1 - Math.sqrt(1 - 0.82));
      if (mid && f > 0.9) y += 0.035;
      out.push(pt(a, rad, y - under));
    }
    return out;
  };
  const top: Ring[] = [0.3, 0.6, 0.85, 1].map((f) => ({ ids: ringPts(f, 0).map((p) => b.v(p, 0, 0)), c: [g[0], apexY - 0.2, g[2]] as P3 }));
  bridge(b, top);
  capFan(b, top[0], b.v([g[0], apexY, g[2]], 0, 0), [g[0], rimY - 0.3, g[2]]);
  b.setTint(0.55);
  const under: Ring[] = [0.3, 0.6, 0.85, 1].map((f) => ({ ids: ringPts(f, 0.006).map((p) => b.v(p, 0, 0)), c: [g[0], apexY + 3, g[2]] as P3 }));
  bridge(b, under.slice().reverse());
  capFan(b, under[0], b.v([g[0], apexY - 0.03, g[2]], 0, 0), [g[0], apexY + 0.5, g[2]]);
  // ribs under the lining and stretchers down to the runner on the shaft
  b.use(BONE.UMB, REG.DARK, FB.UMBRELLA, 1);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const ps = [0.3, 0.6, 0.85, 1].map((f) => ringPts(f, 0.012)[2 * k]);
    for (let i = 0; i < ps.length - 1; i++) stick(b, ps[i], ps[i + 1], 0.003, 3);
    stick(b, ps[1], pt(a, 0.01, apexY - 0.3), 0.002, 3);
  }
}

/** beach towel with the sand's lumps under it and uneven edges (nu x nv cells, near the walker only in numbers; h = z paints the stripes). */
function towelLaid(b: MeshBuilder, nx: number, nz: number): void {
  const x0 = -0.4,
    x1 = 0.4,
    z0 = -0.925,
    z1 = 1.025;
  const id: number[] = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx,
        z = z0 + ((z1 - z0) * j) / nz;
      const wob = nx > 1 ? 1 : 0;
      // (keeps clear of the sand at the rim, the body lies on the middle)
      const rim = Math.min(1, Math.min(x - x0, x1 - x) / 0.09);
      const y = 0.008 + wob * (0.004 + rim * 0.006 * (1 + Math.sin(z * 3.7 + 1.1) * Math.sin(x * 5.3 + 0.4)) + 0.0035 * (1 + Math.sin(z * 9.1 + x * 6.7)));
      const lift = wob * 0.05 * Math.max(0, 1 - Math.hypot(x - x1, z - z1) / 0.3) ** 2;
      id.push(b.v([x + wob * 0.012 * Math.sin(z * 3.1 + 0.7), y + lift, z + wob * 0.008 * Math.sin(x * 4.9 + 2.1)], z, 0));
    }
  const row = nx + 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) b.quadDir(id[j * row + i], id[j * row + i + 1], id[(j + 1) * row + i + 1], id[(j + 1) * row + i], [0, 1, 0]);
}

/** beach towel (flat on the ground; stripes are painted by the shader from h = z) */
function towel(b: MeshBuilder): void {
  const y = 0.008;
  const q = [b.v([-0.4, y, -0.925], -0.925, 0), b.v([0.4, y, -0.925], -0.925, 0), b.v([0.4, y, 1.025], 1.025, 0), b.v([-0.4, y, 1.025], 1.025, 0)];
  b.quadDir(q[0], q[1], q[2], q[3], [0, 1, 0]);
}

// ──────────────────────────────────────────────────────── assembly ──

function buildTarget(d: Dims, lod: Lod): MeshBuilder {
  const cfg = LODS[lod];
  const b = new MeshBuilder();
  smoothHead = !!cfg.close;
  buildTorso(b, d, cfg);
  buildNeckHead(b, d, cfg);
  for (const s of [1, -1] as const) buildArm(b, d, cfg, s);
  for (const s of [1, -1] as const) buildLeg(b, d, cfg, s);
  buildHair(b, d, cfg);
  buildHat(b, d, cfg);
  buildTail(b, d, cfg);
  if (cfg.details) buildUpperGarments(b, d, cfg);
  buildProps(b, d, cfg);
  return b;
}

/** positions for the normals: rest positions with the builder's stand-ins applied */
function withStandIns(b: MeshBuilder): number[] {
  const p = b.pos.slice();
  for (const [i, q] of b.standIn) {
    p[i * 3] = q[0];
    p[i * 3 + 1] = q[1];
    p[i * 3 + 2] = q[2];
  }
  return p;
}

function computeNormals(pos: number[], idx: number[]): Float32Array {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3,
      b = idx[t + 1] * 3,
      c = idx[t + 2] * 3;
    const e1x = pos[b] - pos[a],
      e1y = pos[b + 1] - pos[a + 1],
      e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a],
      e2y = pos[c + 1] - pos[a + 1],
      e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y,
      ny = e1z * e2x - e1x * e2z,
      nz = e1x * e2y - e1y * e2x;
    for (const i of [a, b, c]) {
      n[i] += nx;
      n[i + 1] += ny;
      n[i + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

function applyHints(n: Float32Array, b: MeshBuilder): Float32Array {
  for (const [i, [x, z, k]] of b.nHint) {
    const o = i * 3,
      l = Math.hypot(x, z) || 1;
    const nx = n[o] * (1 - k) + (x / l) * k,
      ny = n[o + 1] * (1 - k),
      nz = n[o + 2] * (1 - k) + (z / l) * k;
    const m = Math.hypot(nx, ny, nz) || 1;
    n[o] = nx / m;
    n[o + 1] = ny / m;
    n[o + 2] = nz / m;
  }
  return n;
}

const md16 = (v: number) => clamp(Math.round((v + 1) * 32768), 0, 65535);
const n10 = (v: number) => clamp(Math.round((v + 1) * 511.5), 0, 1023);

export interface FigureMesh {
  geometry: THREE.BufferGeometry;
  vertices: number;
  triangles: number;
}

const cache = new Map<Lod, FigureMesh>();

/**
 * The figure mesh for a level of detail (cached; one instance shared by all renderers). Returns
 * a BufferGeometry with position / normal / aMorph / aData attributes and an index.
 */
export function figureMesh(lod: Lod): FigureMesh {
  const hit = cache.get(lod);
  if (hit) return hit;
  const T = TARGETS.map((d) => buildTarget(d, lod));
  const base = T[0];
  const nv = base.count;
  for (const t of T) if (t.count !== nv || t.idx.length !== base.idx.length) throw new Error(`figure LOD${lod}: morph targets differ in topology`);
  const N0 = applyHints(computeNormals(withStandIns(base), base.idx), base);
  const N1 = applyHints(computeNormals(withStandIns(T[1]), base.idx), T[1]);
  const morph = new Uint32Array(nv * 4);
  const data = new Uint32Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    const o = i * 3;
    const dw = [T[1].pos[o] - base.pos[o], T[1].pos[o + 1] - base.pos[o + 1], T[1].pos[o + 2] - base.pos[o + 2]];
    const dc = [T[2].pos[o] - base.pos[o], T[2].pos[o + 1] - base.pos[o + 1], T[2].pos[o + 2] - base.pos[o + 2]];
    const dh = [T[3].pos[o] - base.pos[o], T[3].pos[o + 2] - base.pos[o + 2]];
    morph[i * 4] = (md16(dw[0]) | (md16(dw[1]) << 16)) >>> 0;
    morph[i * 4 + 1] = (md16(dw[2]) | (md16(dc[0]) << 16)) >>> 0;
    morph[i * 4 + 2] = (md16(dc[1]) | (md16(dc[2]) << 16)) >>> 0;
    morph[i * 4 + 3] = (md16(dh[0]) | (md16(dh[1]) << 16)) >>> 0;
    data[i * 4] = base.d0[i];
    data[i * 4 + 1] = base.d1[i];
    data[i * 4 + 2] = base.d2[i];
    data[i * 4 + 3] = (n10(N1[o] - N0[o]) | (n10(N1[o + 1] - N0[o + 1]) << 10) | (n10(N1[o + 2] - N0[o + 2]) << 20)) >>> 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(base.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N0, 3));
  g.setAttribute('aMorph', new THREE.BufferAttribute(morph, 4));
  g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  // region and material are flat varyings and do change across some triangles: the same vertex provokes in either convention
  const idx = flatConvention.first ? base.idx.map((_, i) => base.idx[i % 3 === 0 ? i + 2 : i - 1]) : base.idx;
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.5);
  const out = { geometry: g, vertices: nv, triangles: base.idx.length / 3 };
  cache.set(lod, out);
  return out;
}

/** Raw builder output of one target (for node tools: measurements, previews). */
export function figureTarget(lod: Lod, target: number): { pos: number[]; idx: number[]; d0: number[]; d1: number[]; d2: number[] } {
  const t = buildTarget(TARGETS[target], lod);
  return { pos: t.pos, idx: t.idx, d0: t.d0, d1: t.d1, d2: t.d2 };
}
