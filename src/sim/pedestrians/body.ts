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

import * as THREE from 'three';
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
} as const;

export type Lod = 0 | 1 | 2 | 3;

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
  hand: 'full' | 'paddle' | 'none';
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
    foot: [0, 1, 2, 3, 5, 7],
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
    neck: [0, 2],
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
const TORSO_TINT = [0.82, 0.92, 1, 1, 1, 1, 1, 1, 0.96, 1, 1.02, 1];

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

function buildTorso(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const n = cfg.torsoSides;
  const rings: Ring[] = [];
  for (const ri of cfg.torsoRings) {
    const r = d.torso[ri];
    const [bone, w] = TORSO_BONE[ri];
    b.use(bone, REG.TORSO, -1, TORSO_TINT[ri]);
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      ids.push(b.v(torsoPoint(r, d.bust[ri], phi), TORSO_H[ri], w, Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))), Math.sin(phi)));
    }
    rings.push({ ids, c: [0, r.y, r.cz] });
  }
  bridge(b, rings);
  // bottom cap (crotch)
  const r0 = d.torso[cfg.torsoRings[0]];
  b.use(BONE.PELVIS, REG.TORSO, -1, 0.75);
  const apex = b.v([0, r0.y - 0.03 * (d.H / 1.76), r0.cz - 0.005], 0, 0, 0, 0);
  capFan(b, rings[0], apex, [0, r0.y + 0.05, r0.cz]);
  // top: the neck closes it (torso top ring hidden inside the neck)
  const rt = d.torso[cfg.torsoRings[cfg.torsoRings.length - 1]];
  b.use(BONE.CHEST, REG.TORSO, -1, 1);
  const top = b.v([0, rt.y + 0.01, rt.cz], 1, 0, 0, 0);
  capFan(b, rings[rings.length - 1], top, [0, rt.y - 0.05, rt.cz]);
}

function headSurface(d: Dims, phi: number, y: number, push = 0): P3 {
  // interpolate the head rings at height y (clamped to the ring range)
  const R = d.headRings;
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

function buildNeckHead(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  // neck (skin, region NECK so collars / turtlenecks can colour it)
  if (cfg.neck) {
    const n = cfg.neckSides;
    const rings: Ring[] = [];
    const W = [1, 0.55, 0.12];
    const H = [1.0, 1.12, 1.25];
    for (const ri of cfg.neck) {
      const r = d.neckRings[ri];
      b.use(BONE.HEAD, REG.NECK, -1, ri === 0 ? 0.86 : ri === 1 ? 0.93 : 1);
      const ids: number[] = [];
      for (let k = 0; k < n; k++) ids.push(b.v(torsoPoint(r, 0, (k / n) * Math.PI * 2, 2), H[ri], W[ri]));
      rings.push({ ids, c: [0, r.y, r.cz] });
    }
    bridge(b, rings);
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
    const r = d.upper[i];
    // the 0.88 ring sits just above the elbow and already bends with the forearm (skinning)
    specs.push({ a: sh, b: el, ring: r, bone: i === 5 ? FO : UP, w: UPPER_W[i], h: 1 - 0.5 * r.t, reg: REG.ARM, tint: i === 0 ? 0.9 : 1 });
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
    const r = d.thigh[i];
    specs.push({ a: hp, b: kn, ring: r, bone: i === 5 ? SH : TH, w: THIGH_W[i], h: 1 - 0.5 * r.t, reg: REG.LEG, tint: i === 0 ? 0.86 : 1 });
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
  buildLimb(b, specs, cfg.limbSides, side, true);
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
      ids.push(b.v(ft(x, y, f.z), (y - f.y0) / top + (f.y0 - fr[1].y0) / top, 0));
    }
    rings.push({ ids, c: ft(f.cx * side, yc, f.z) });
  }
  bridge(b, rings);
  const f0 = fr[cfg.foot[0]],
    f1 = fr[cfg.foot[cfg.foot.length - 1]];
  const heel = b.v(ft(f0.cx * side, (f0.y0 + f0.y1) / 2 - 0.004, f0.z - 0.008 * (d.H / 1.76)), 0.3, 0);
  capFan(b, rings[0], heel, ft(f0.cx * side, (f0.y0 + f0.y1) / 2, f0.z + 0.03));
  const toe = b.v(ft(f1.cx * side, (f1.y0 + f1.y1) / 2 + 0.001, f1.z + 0.006 * (d.H / 1.76)), 0.3, 0);
  capFan(b, rings[rings.length - 1], toe, ft(f1.cx * side, (f1.y0 + f1.y1) / 2, f1.z - 0.03));
}

// ───────────────────────────────────────────────────────────── hair ──

/** hairline height (fraction chin→crown) as a function of the angle from the face */
function hairlineU(phi: number): number {
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

function buildHair(b: MeshBuilder, d: Dims, cfg: LodCfg): void {
  const n = cfg.headSides;
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
      const push = vol * (0.25 + 0.75 * Math.min(1, s * 3.5)) * (1 - 0.35 * t);
      ids.push(b.v(headSurface(d, phi, Math.min(y, crown - 0.004), push), 2, 0, 0));
    }
    rings.push({ ids, c: [0, chin + (crown - chin) * 0.55, -0.01 * hk] });
  }
  bridge(b, rings);
  const apex = b.v([0, crown + vol * 0.75, d.headRings[d.headRings.length - 1].cz - 0.006], 2, 0, 0);
  capFan(b, rings[rings.length - 1], apex, [0, crown - 0.06 * hk, 0]);

  if (cfg.hairLong.length === 0) return;
  // long hair sheet: hangs from the back / sides of the head behind the shoulders (aux1 = hang
  // depth below the cap edge; the shader lifts vertices deeper than the figure's hair length)
  b.use(BONE.HEAD, REG.HAIR, FB.HAIRLONG, 0.96);
  const cols: number[] = [];
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))) > 1.15) cols.push(k);
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
    const phi = (k / n) * Math.PI * 2;
    const y0 = chin + (crown - chin) * hairlineU(phi);
    const edge = headSurface(d, phi, y0 + 0.012 * hk, vol * 0.9);
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
        if (y < shoulderY + 0.02 * hk) {
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
    const pts: [P3, number, number][] = [
      [root, 0.026 * hk, 0],
      [add(root, [0, -0.08 * hk, -0.034 * hk]), 0.03 * hk, 0.4],
      [add(root, [0, -0.22 * hk, -0.03 * hk]), 0.016 * hk, 0.8],
    ];
    const rings2: Ring[] = [];
    // aux: swing share (0 at the root … 1 at the tip) and the drop below the root (the swing pivot)
    for (const [c, r, w] of pts) {
      const ids: number[] = [];
      for (let k = 0; k < 6; k++) {
        const phi = (k / 6) * Math.PI * 2;
        ids.push(b.v(add(c, [r * Math.sin(phi), 0, r * 0.8 * Math.cos(phi)]), 2, w * 0.7, w * 1.2, root[1] - c[1]));
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
    blob(b, [0, r5.y + 0.028 * hk, r5.cz - r5.b - 0.02 * hk], [0.038 * hk, 0.035 * hk, 0.032 * hk], 6, 4);
  }
  // fringe (a short visor of hair over the forehead)
  b.use(BONE.HEAD, REG.HAIR, FB.FRINGE, 0.93);
  {
    const ids: number[][] = [];
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
  // beard: a shell over jaw and chin (+ moustache)
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
  const n = cfg === LODS[0] ? 10 : pin ? 4 : 6;
  const hk = d.H / 1.76;
  const rimU = 0.64; // hat band height (fraction chin→crown)
  const chin = d.headRings[0].y - 0.006;
  const crown = d.crown;
  const rimY = chin + (crown - chin) * rimU;
  const ss = cfg === LODS[0] ? [0, 0.35, 0.7, 1] : pin ? [0, 1] : [0, 0.55, 0.85, 1];
  const hatK = cfg.details ? 1 : 1.45;
  const rings: Ring[] = [];
  b.use(BONE.HEAD, REG.HAT, FB.HAT, 1);
  for (const s of ss) {
    if (s >= 1) break;
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const y = rimY + (crown - rimY) * Math.pow(s, 0.8);
      ids.push(b.v(headSurface(d, phi, Math.min(y, crown - 0.003), 0.0145 * hk * hatK), 2, 0, s, phi));
    }
    rings.push({ ids, c: [0, rimY, -0.01 * hk] });
  }
  bridge(b, rings);
  const apex = b.v([0, crown + 0.0145 * hk * hatK, d.headRings[d.headRings.length - 1].cz - 0.004], 2, 0, 1, 0);
  capFan(b, rings[rings.length - 1], apex, [0, rimY, 0]);
  if (pin) return;
  // brim (both faces): inner ring on the hat band, outer ring pushed out by the shader
  b.use(BONE.HEAD, REG.HAT, FB.BRIM, 0.95);
  const bi: number[] = [],
    bo: number[] = [],
    bi2: number[] = [],
    bo2: number[] = [];
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * Math.PI * 2;
    const p = headSurface(d, phi, rimY, 0.012 * hk);
    bi.push(b.v(p, 2, 0, 0, phi));
    bo.push(b.v(p, 2, 0, 1, phi));
  }
  const under = cfg.props !== 'far';
  b.setTint(0.7);
  if (under)
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const p = headSurface(d, phi, rimY - 0.002, 0.012 * hk);
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
    const phis = [-1.05, -0.36, 0.36, 1.05];
    const inner: number[] = [],
      outer: number[] = [],
      inner2: number[] = [],
      outer2: number[] = [];
    for (const phi of phis) {
      const p = headSurface(d, phi, rimY + 0.004 * hk, 0.012 * hk);
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
  if (cfg.props === 'far' || cfg.props === 'pin') return;
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

function buildUpperGarments(b: MeshBuilder, d: Dims): void {
  const hk = d.H / 1.76;
  // shirt collar: a short band around the neck base
  b.use(BONE.CHEST, REG.COLLAR, FB.COLLAR, 1);
  {
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
  for (const side of [1, -1]) {
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
  {
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
  {
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
      const n = all ? 8 : 6;
      const rings: Ring[] = [];
      const ys = all ? [-0.18, -0.02, 0.17] : [-0.17, 0.15];
      ys.forEach((dy, i) => {
        const shrink = i === 0 || i === ys.length - 1 ? 0.85 : 1;
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
      if (all) {
        // straps: pack top → over the shoulder (trapezius) → down the front of the chest
        b.use(BONE.CHEST, REG.STRAP, FB.BACKPACK, 0.7);
        const r8 = d.torso[8];
        for (const s of [1, -1]) {
          const top = shoulderTop(d, 0.092 * hk * s);
          stick(b, [0.1 * s * hk, r8.y, r8.cz - r8.b - 0.012], top, 0.01 * hk);
          stick(b, top, [0.105 * s * hk, r7.y - 0.03 * hk, r7.cz + r7.f + 0.008 + d.bust[7] * 0.7], 0.01 * hk);
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
    if (all) {
      b.use(BONE.CHEST, REG.STRAP, FB.SHOULDERBAG, 0.75);
      const r9 = d.torso[9],
        r6 = d.torso[6];
      // strap: bag corner → across the chest → over the right shoulder → down the back to the bag
      const top = shoulderTop(d, -0.095 * hk);
      const r7 = d.torso[7];
      stick(b, [x + 0.07 * hk, y + 0.07 * hk, z - 0.01], [-0.02 * hk, r7.y, r7.cz + r7.f + 0.008 + d.bust[7]], 0.011 * hk);
      stick(b, [-0.02 * hk, r7.y, r7.cz + r7.f + 0.008 + d.bust[7]], top, 0.011 * hk);
      stick(b, top, [0.14 * hk, r6.y - 0.06 * hk, r6.cz - r6.b - 0.01], 0.011 * hk);
      void r9;
    }
  }
  // hand-held bags hang plumb from the grip point (BAG_L / BAG_R bones): positions are offsets from
  // the grip (palm centre), resolved in the shader
  if (cfg.props !== 'pin') b.use(BONE.BAG_R, REG.BAG, FB.SHOPBAG, 1);
  if (cfg.props !== 'pin') {
    const g = grip(-1);
    softBox(b, add(g, [-0.012, -0.16 * hk, 0.005]), [0.1 * hk, 0.26 * hk, 0.22 * hk]);
    if (all) {
      b.setTint(0.7);
      stick(b, add(g, [-0.012, -0.03 * hk, 0.0]), add(g, [-0.012, 0.004, 0.0]), 0.006);
    }
  }
  if (!far) {
    b.use(BONE.BAG_L, REG.BAG, FB.BRIEFCASE, 1);
    const g = grip(1);
    softBox(b, add(g, [0.008, -0.15 * hk, 0.01]), [0.075 * hk, 0.26 * hk, 0.36 * hk]);
    if (all) {
      b.use(BONE.BAG_L, REG.DARK, FB.BRIEFCASE, 1);
      stick(b, add(g, [0.008, -0.02 * hk, -0.04 * hk]), add(g, [0.008, -0.02 * hk, 0.05 * hk]), 0.008);
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
      softBox(b, add(g, [0.012, -0.005, 0.018]), [0.012, 0.13 * hk, 0.065 * hk]);
    }
    b.use(BONE.HAND_R, REG.WHITE, FB.CUP, 0.95);
    {
      const g = grip(-1);
      const c = add(g, [0.03, 0.015, 0.012]);
      const rings: Ring[] = [];
      for (const [dy, r] of [
        [-0.05, 0.03],
        [0.06, 0.036],
      ] as [number, number][]) {
        const ids: number[] = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ids.push(b.v([c[0] + r * Math.sin(a), c[1] + dy, c[2] + r * Math.cos(a)], 0, 0));
        }
        rings.push({ ids, c: [c[0], c[1] + dy, c[2]] });
      }
      bridge(b, rings);
      b.use(BONE.HAND_R, REG.DARK, FB.CUP, 1);
      capFan(b, rings[1], b.v([c[0], c[1] + 0.062, c[2]], 0, 0), [c[0], c[1], c[2]]);
    }
  }
  if (!far) {
    // newspaper held in front of the chest (bench readers)
    b.use(BONE.CHEST, REG.WHITE, FB.NEWSPAPER, 0.96);
    softBox(b, [0, d.chest.y + 0.08 * hk, 0.36 * hk], [0.46 * hk, 0.3 * hk, 0.008]);
  }
  // umbrella (right hand grip, kept upright) and beach towel
  if (!far) {
    b.use(BONE.UMB, REG.DARK, FB.UMBRELLA, 1);
    const g = grip(-1);
    stick(b, add(g, [0, -0.06, 0]), add(g, [0, 0.82, 0]), 0.008);
  }
  b.use(BONE.UMB, REG.EXTRA, FB.UMBRELLA, 1);
  umbrella(b, d, all ? 8 : cfg.props === 'pin' ? 4 : far ? 5 : 6, !far);
  b.use(BONE.GROUND, REG.TOWEL, FB.TOWEL, 1);
  towel(b);
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
  buildTorso(b, d, cfg);
  buildNeckHead(b, d, cfg);
  for (const s of [1, -1] as const) buildArm(b, d, cfg, s);
  for (const s of [1, -1] as const) buildLeg(b, d, cfg, s);
  buildHair(b, d, cfg);
  buildHat(b, d, cfg);
  buildTail(b, d, cfg);
  if (cfg.details) buildUpperGarments(b, d);
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
  const N0 = computeNormals(withStandIns(base), base.idx);
  const N1 = computeNormals(withStandIns(T[1]), base.idx);
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
  g.setIndex(base.idx);
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
