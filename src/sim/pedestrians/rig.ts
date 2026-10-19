// Anatomy of the little people: the body dimensions of the four morph targets (average man,
// woman, 7-year-old boy, heavy build), the joint pivots the vertex shader poses around, and the
// mapping from a Look (kind / age / scale / girth) to the per-instance body parameters:
//   w  femininity (0 man … 1 woman)        c  childness (0 adult … 1 seven-year-old, up to 1.15)
//   b  build (−0.3 slim … 0 average … 1.1 heavy)   s  instance scale (±4 % individual variation)
// Every target is built by the same procedural builder (body.ts) with identical topology, so a
// figure of any kind is  base + w·(woman − man) + c·(child − man) + b·(heavy − man)  per vertex.
// The pivots morph the same way (uniform table, see shader.ts) and the JS side (pose.ts) uses
// `rigOf(look)` for IK, hand positions and the gait cycle.
//
// Units: metres, figure faces +Z, its left side is +X, feet on y = 0.

import type { Look } from './looks';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Torso / neck / head ring: half width, front and back depth from the ring centre (cz). */
export interface BodyRing {
  y: number;
  hw: number;
  f: number;
  b: number;
  cz: number;
}

/** Limb ring at fraction t from the parent pivot towards the child pivot. */
export interface LimbRing {
  t: number;
  rx: number;
  rz: number;
  cx: number;
  cz: number;
}

/** Shoe section at z (foot frame, ankle at the origin): half width, sole bottom y0, top y1, centre x. */
export interface FootRing {
  z: number;
  w: number;
  y0: number;
  y1: number;
  cx: number;
}

export interface Dims {
  H: number;
  hip: V3;
  knee: V3;
  ankle: V3;
  waist: V3;
  chest: V3;
  neck: V3;
  head: V3;
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  /** fingertip (hand end) */
  tip: V3;
  torso: BodyRing[];
  /** extra forward push of the bust (angles ±20…40° from the front) per torso ring */
  bust: number[];
  neckRings: BodyRing[];
  headRings: BodyRing[];
  /** crown cap height */
  crown: number;
  /** nose: tip forward of the ring front and bridge push */
  nose: number;
  upper: LimbRing[];
  fore: LimbRing[];
  /** hand: palm width (z), thickness (x) */
  palmW: number;
  palmT: number;
  thigh: LimbRing[];
  shin: LimbRing[];
  foot: FootRing[];
}

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const R = (y: number, hw: number, f: number, b: number, cz = 0): BodyRing => ({ y, hw, f, b, cz });
const Lr = (t: number, rx: number, rz: number, cx = 0, cz = 0): LimbRing => ({ t, rx, rz, cx, cz });
const Fr = (z: number, w: number, y0: number, y1: number, cx = 0): FootRing => ({ z, w, y0, y1, cx });

/** torso ring hem coordinate (0 crotch … 1 neck base), shared by all targets */
export const TORSO_H = [0, 0.07, 0.15, 0.24, 0.32, 0.4, 0.52, 0.64, 0.76, 0.86, 0.94, 1.0];

// ───────────────────────────────────────────────────────────── man ──
// 1.76 m, 7.5 heads; deltoids 0.46, chest 0.33 × 0.24, waist 0.29 × 0.21 (0.62 H),
// hips 0.34 × 0.22 (0.52 H); hip / knee / ankle joints 0.93 / 0.50 / 0.075;
// elbow 1.10, wrist 0.84, fingertip 0.66; feet 0.27 × 0.10.

function man(): Dims {
  return {
    H: 1.76,
    hip: v(0.095, 0.93, 0),
    knee: v(0.092, 0.5, 0.008),
    ankle: v(0.088, 0.075, -0.012),
    waist: v(0, 1.08, -0.025),
    chest: v(0, 1.27, -0.03),
    neck: v(0, 1.465, -0.035),
    head: v(0, 1.535, -0.02),
    shoulder: v(0.185, 1.405, -0.012),
    elbow: v(0.203, 1.098, -0.004),
    wrist: v(0.222, 0.842, 0.022),
    tip: v(0.232, 0.656, 0.034),
    torso: [
      R(0.848, 0.1, 0.06, 0.08),
      R(0.865, 0.155, 0.088, 0.112),
      R(0.915, 0.17, 0.095, 0.122, -0.005),
      R(0.975, 0.163, 0.098, 0.108, -0.006),
      R(1.03, 0.153, 0.1, 0.095, -0.005),
      R(1.09, 0.146, 0.103, 0.092, -0.002),
      R(1.17, 0.152, 0.112, 0.1, -0.002),
      R(1.255, 0.164, 0.122, 0.112, -0.004),
      R(1.33, 0.171, 0.117, 0.112, -0.009),
      R(1.395, 0.184, 0.092, 0.1, -0.013),
      R(1.44, 0.162, 0.064, 0.078, -0.021),
      R(1.477, 0.08, 0.052, 0.06, -0.03),
    ],
    bust: [0, 0, 0, 0, 0, 0, 0, 0.004, 0.002, 0, 0, 0],
    neckRings: [R(1.452, 0.06, 0.06, 0.062, -0.026), R(1.5, 0.058, 0.058, 0.06, -0.02), R(1.548, 0.055, 0.055, 0.058, -0.012)],
    headRings: [
      R(1.53, 0.042, 0.05, 0.042, 0.022),
      R(1.555, 0.06, 0.077, 0.06, 0.004),
      R(1.585, 0.068, 0.084, 0.084, 0),
      R(1.612, 0.073, 0.087, 0.095, 0),
      R(1.645, 0.0775, 0.088, 0.102, 0),
      R(1.68, 0.0775, 0.087, 0.107, -0.002),
      R(1.715, 0.073, 0.078, 0.104, -0.005),
      R(1.745, 0.058, 0.055, 0.082, -0.01),
    ],
    crown: 1.762,
    nose: 0.024,
    upper: [Lr(-0.065, 0.025, 0.032, -0.026), Lr(0.0, 0.041, 0.048, -0.008), Lr(0.12, 0.048, 0.051), Lr(0.36, 0.045, 0.049, 0, 0.002), Lr(0.66, 0.042, 0.045, 0, 0.002), Lr(0.88, 0.04, 0.044)],
    fore: [Lr(0, 0.039, 0.044), Lr(0.14, 0.042, 0.047, 0, 0.002), Lr(0.45, 0.036, 0.04), Lr(0.8, 0.027, 0.033), Lr(1, 0.021, 0.03)],
    palmW: 0.043,
    palmT: 0.0165,
    thigh: [Lr(-0.12, 0.07, 0.072, -0.012), Lr(0.05, 0.084, 0.088, -0.002), Lr(0.25, 0.078, 0.08, 0, 0.005), Lr(0.5, 0.068, 0.07, 0, 0.008), Lr(0.75, 0.058, 0.058, 0, 0.006), Lr(0.9, 0.054, 0.054, 0, 0.006)],
    shin: [Lr(0, 0.053, 0.055, 0, 0.01), Lr(0.1, 0.051, 0.053), Lr(0.28, 0.054, 0.06, 0, -0.012), Lr(0.4, 0.055, 0.058, 0, -0.012), Lr(0.62, 0.045, 0.046, 0, -0.006), Lr(0.82, 0.037, 0.038, 0, -0.002), Lr(0.97, 0.03, 0.032)],
    foot: [
      Fr(-0.064, 0.024, -0.069, -0.03),
      Fr(-0.047, 0.033, -0.075, 0.0),
      Fr(-0.012, 0.037, -0.075, 0.032),
      Fr(0.04, 0.042, -0.075, 0.012),
      Fr(0.092, 0.047, -0.075, -0.012, 0.002),
      Fr(0.146, 0.05, -0.075, -0.03, 0.004),
      Fr(0.184, 0.0485, -0.071, -0.03, 0.005),
      Fr(0.207, 0.043, -0.067, -0.037, 0.005),
    ],
  };
}

// ─────────────────────────────────────────────────────────── woman ──
// 1.64 m, 7.3 heads; deltoids 0.40, bust (+3 cm forward at 0.72 H), waist 0.25 × 0.18,
// hips 0.37 × 0.24; hip / knee / ankle 0.85 / 0.46 / 0.07; feet 0.245 × 0.09.

function woman(): Dims {
  const m = man();
  const headK = 0.225 / 0.235;
  return {
    H: 1.64,
    hip: v(0.09, 0.85, 0),
    knee: v(0.084, 0.46, 0.008),
    ankle: v(0.08, 0.07, -0.011),
    waist: v(0, 1.01, -0.03),
    chest: v(0, 1.18, -0.032),
    neck: v(0, 1.368, -0.035),
    head: v(0, 1.428, -0.02),
    shoulder: v(0.164, 1.305, -0.012),
    elbow: v(0.18, 1.022, -0.004),
    wrist: v(0.197, 0.782, 0.02),
    tip: v(0.206, 0.612, 0.031),
    torso: [
      R(0.783, 0.098, 0.058, 0.08),
      R(0.8, 0.165, 0.086, 0.12),
      R(0.853, 0.185, 0.095, 0.135, -0.006),
      R(0.915, 0.166, 0.09, 0.112, -0.009),
      R(0.965, 0.143, 0.088, 0.09, -0.009),
      R(1.017, 0.125, 0.09, 0.083, -0.006),
      R(1.09, 0.132, 0.098, 0.09, -0.003),
      R(1.18, 0.147, 0.124, 0.098, -0.003),
      R(1.235, 0.151, 0.116, 0.1, -0.009),
      R(1.298, 0.163, 0.085, 0.09, -0.013),
      R(1.338, 0.142, 0.058, 0.069, -0.021),
      R(1.37, 0.067, 0.046, 0.052, -0.03),
    ],
    bust: [0, 0, 0, 0, 0, 0, 0.008, 0.022, 0.01, 0, 0, 0],
    neckRings: [R(1.355, 0.05, 0.05, 0.052, -0.026), R(1.398, 0.049, 0.049, 0.051, -0.02), R(1.44, 0.047, 0.047, 0.05, -0.012)],
    headRings: m.headRings.map((r) => R(1.415 + (r.y - 1.525) * headK, r.hw * 0.935, r.f * 0.95, r.b * 0.95, r.cz * 0.95)),
    crown: 1.415 + (m.crown - 1.525) * headK,
    nose: 0.02,
    upper: [Lr(-0.065, 0.022, 0.028, -0.023), Lr(0.0, 0.035, 0.041, -0.007), Lr(0.12, 0.041, 0.045), Lr(0.36, 0.04, 0.044, 0, 0.002), Lr(0.66, 0.037, 0.04, 0, 0.002), Lr(0.88, 0.035, 0.038)],
    fore: [Lr(0, 0.034, 0.038), Lr(0.14, 0.036, 0.041, 0, 0.002), Lr(0.45, 0.031, 0.035), Lr(0.8, 0.023, 0.029), Lr(1, 0.018, 0.026)],
    palmW: 0.038,
    palmT: 0.0145,
    thigh: [Lr(-0.12, 0.07, 0.072, -0.012), Lr(0.05, 0.085, 0.09, -0.003), Lr(0.25, 0.079, 0.081, 0, 0.004), Lr(0.5, 0.067, 0.069, 0, 0.007), Lr(0.75, 0.055, 0.056, 0, 0.006), Lr(0.9, 0.051, 0.052, 0, 0.006)],
    shin: [Lr(0, 0.05, 0.052, 0, 0.009), Lr(0.1, 0.048, 0.05), Lr(0.28, 0.05, 0.055, 0, -0.011), Lr(0.4, 0.05, 0.054, 0, -0.011), Lr(0.62, 0.041, 0.042, 0, -0.005), Lr(0.82, 0.034, 0.035, 0, -0.002), Lr(0.97, 0.027, 0.029)],
    foot: m.foot.map((f) => Fr(f.z * 0.907, f.w * 0.9, f.y0 * 0.93, f.y1 * 0.93, f.cx * 0.9)),
  };
}

// ──────────────────────────────────────────────────── child (boy, 7) ──
// 1.22 m, 6 heads (head 0.142 × 0.175, 0.203 tall), legs 0.47 H, deltoids 0.29, hips 0.24,
// hip / knee / ankle 0.57 / 0.32 / 0.055; feet 0.19 × 0.075.

function child(): Dims {
  const m = man();
  const headK = 0.203 / 0.235;
  const head = m.headRings.map((r, i) => {
    // children: smaller lower face (eyes nearer the middle of the head), rounder skull
    const t = (r.y - 1.525) * headK;
    const lower = i <= 3 ? 0.94 : 1;
    return R(1.017 + t * (i <= 3 ? 0.93 : 1) + (i <= 3 ? 0 : -0.006), r.hw * 0.916 * lower, r.f * 0.9 * (i <= 2 ? 0.93 : 1), r.b * 0.9, r.cz * 0.9);
  });
  return {
    H: 1.22,
    hip: v(0.064, 0.57, 0),
    knee: v(0.062, 0.32, 0.005),
    ankle: v(0.06, 0.055, -0.009),
    waist: v(0, 0.73, -0.018),
    chest: v(0, 0.86, -0.02),
    neck: v(0, 0.99, -0.024),
    head: v(0, 1.035, -0.014),
    shoulder: v(0.124, 0.94, -0.009),
    elbow: v(0.134, 0.738, -0.003),
    wrist: v(0.146, 0.566, 0.016),
    tip: v(0.153, 0.441, 0.024),
    torso: [
      R(0.517, 0.07, 0.045, 0.054),
      R(0.545, 0.11, 0.068, 0.08),
      R(0.6, 0.12, 0.075, 0.088, -0.003),
      R(0.655, 0.115, 0.078, 0.076, -0.004),
      R(0.7, 0.108, 0.08, 0.07, -0.003),
      R(0.756, 0.105, 0.08, 0.068, -0.001),
      R(0.81, 0.108, 0.08, 0.07, -0.001),
      R(0.868, 0.115, 0.082, 0.075, -0.003),
      R(0.905, 0.118, 0.078, 0.074, -0.006),
      R(0.943, 0.124, 0.06, 0.065, -0.009),
      R(0.973, 0.108, 0.043, 0.051, -0.014),
      R(0.996, 0.048, 0.036, 0.04, -0.02),
    ],
    bust: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    neckRings: [R(0.984, 0.04, 0.04, 0.042, -0.02), R(1.012, 0.039, 0.039, 0.041, -0.016), R(1.042, 0.038, 0.038, 0.04, -0.01)],
    headRings: head,
    crown: 1.22,
    nose: 0.014,
    upper: m.upper.map((r) => Lr(r.t, r.rx * 0.68, r.rz * 0.68, r.cx * 0.68, r.cz * 0.68)),
    fore: m.fore.map((r) => Lr(r.t, r.rx * 0.68, r.rz * 0.68, r.cx * 0.68, r.cz * 0.68)),
    palmW: 0.029,
    palmT: 0.0115,
    thigh: m.thigh.map((r) => Lr(r.t, r.rx * 0.68, r.rz * 0.68, r.cx * 0.68, r.cz * 0.68)),
    shin: m.shin.map((r) => Lr(r.t, r.rx * 0.68, r.rz * 0.68, r.cx * 0.68, r.cz * 0.68)),
    foot: m.foot.map((f) => Fr(f.z * 0.704, f.w * 0.75, f.y0 * 0.733, f.y1 * 0.733, f.cx * 0.7)),
  };
}

// ───────────────────────────────────────────────────── heavy build ──
// The man with build +1: belly +11 cm forward, waist +8 cm wider, hips +4 cm, upper arms and
// thighs +15 % — shoulders unchanged.

function heavy(): Dims {
  const m = man();
  const k = (r: LimbRing, s: number) => Lr(r.t, r.rx * s, r.rz * s, r.cx, r.cz);
  return {
    ...m,
    hip: v(0.1, 0.93, 0),
    knee: v(0.096, 0.5, 0.008),
    ankle: v(0.09, 0.075, -0.012),
    torso: [
      R(0.846, 0.108, 0.066, 0.085),
      R(0.865, 0.168, 0.098, 0.12),
      R(0.915, 0.19, 0.112, 0.13, -0.005),
      R(0.975, 0.19, 0.148, 0.116, -0.006),
      R(1.03, 0.19, 0.188, 0.106, -0.005),
      R(1.09, 0.186, 0.205, 0.1, -0.002),
      R(1.17, 0.18, 0.182, 0.106, -0.002),
      R(1.255, 0.178, 0.152, 0.118, -0.004),
      R(1.33, 0.18, 0.13, 0.118, -0.009),
      R(1.395, 0.188, 0.1, 0.106, -0.013),
      R(1.44, 0.166, 0.072, 0.086, -0.021),
      R(1.477, 0.088, 0.062, 0.07, -0.03),
    ],
    bust: [0, 0, 0, 0, 0, 0, 0.004, 0.012, 0.006, 0, 0, 0],
    neckRings: m.neckRings.map((r) => R(r.y, r.hw * 1.16, r.f * 1.18, r.b * 1.14, r.cz)),
    headRings: m.headRings.map((r, i) => R(r.y, r.hw + (i <= 3 ? 0.007 : 0.002), r.f + (i === 0 ? 0.012 : i === 1 ? 0.006 : 0), r.b + (i <= 1 ? 0.01 : 0), r.cz)),
    upper: m.upper.map((r, i) => k(r, i < 2 ? 1.05 : 1.15)),
    fore: m.fore.map((r, i) => k(r, i < 4 ? 1.1 : 1.04)),
    thigh: m.thigh.map((r) => k(r, 1.15)),
    shin: m.shin.map((r, i) => k(r, i < 5 ? 1.08 : 1.03)),
  };
}

export const TARGETS: readonly Dims[] = [man(), woman(), child(), heavy()];

// ─────────────────────────────────────────────────────── pivots ──

/** Pivot indices of the uniform table (left side; the right side mirrors x). */
export const PIV = {
  WAIST: 0,
  CHEST: 1,
  HEAD: 2,
  HIP: 3,
  KNEE: 4,
  ANKLE: 5,
  SHOULDER: 6,
  ELBOW: 7,
  WRIST: 8,
  NECK: 9,
  TIP: 10,
} as const;
export const PIV_COUNT = 11;

function pivotList(d: Dims): V3[] {
  return [d.waist, d.chest, d.head, d.hip, d.knee, d.ankle, d.shoulder, d.elbow, d.wrist, d.neck, d.tip];
}

/** 4 × PIV_COUNT vec3: base, then woman / child / heavy deltas (as the shader expects). */
export function pivotTable(): Float32Array {
  const out = new Float32Array(4 * PIV_COUNT * 3);
  const base = pivotList(TARGETS[0]);
  for (let t = 0; t < 4; t++) {
    const pl = pivotList(TARGETS[t]);
    for (let i = 0; i < PIV_COUNT; i++) {
      const o = (t * PIV_COUNT + i) * 3;
      const p = pl[i],
        q = base[i];
      out[o] = t === 0 ? p.x : p.x - q.x;
      out[o + 1] = t === 0 ? p.y : p.y - q.y;
      out[o + 2] = t === 0 ? p.z : p.z - q.z;
    }
  }
  return out;
}

// ─────────────────────────────────────────── per-figure parameters ──

/** Body parameters of one figure, cached on its look. */
export interface Rig {
  w: number;
  c: number;
  b: number;
  /** instance scale */
  s: number;
  /** elderly posture 0…1 (stoop, flexed knees, small steps) */
  old: number;
  /** morphed pivots (figure units, left side) */
  hip: V3;
  knee: V3;
  ankle: V3;
  waist: V3;
  chest: V3;
  neck: V3;
  head: V3;
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  tip: V3;
  /** leg segment lengths (figure units) */
  thighL: number;
  shinL: number;
  upperL: number;
  foreL: number;
  /** ankle height over the sole, heel / toe offsets of the shoe from the ankle (figure units) */
  ankleH: number;
  heelZ: number;
  toeZ: number;
  ballZ: number;
  /** sole profile for rolling (z from the ankle, height above the ground when flat): heel back, heel, ball, toe */
  sole: { z: number; y: number }[];
  /** world hip-joint height (m) — the leg length used by the gait model */
  legLen: number;
  /** stature (m) */
  stature: number;
}

const mixV = (o: V3, idx: (d: Dims) => V3, w: number, c: number, b: number): V3 => {
  const p0 = idx(TARGETS[0]),
    p1 = idx(TARGETS[1]),
    p2 = idx(TARGETS[2]),
    p3 = idx(TARGETS[3]);
  o.x = p0.x + w * (p1.x - p0.x) + c * (p2.x - p0.x) + b * (p3.x - p0.x);
  o.y = p0.y + w * (p1.y - p0.y) + c * (p2.y - p0.y) + b * (p3.y - p0.y);
  o.z = p0.z + w * (p1.z - p0.z) + c * (p2.z - p0.z) + b * (p3.z - p0.z);
  return o;
};
const mixS = (f: (d: Dims) => number, w: number, c: number, b: number): number => {
  const a = f(TARGETS[0]);
  return a + w * (f(TARGETS[1]) - a) + c * (f(TARGETS[2]) - a) + b * (f(TARGETS[3]) - a);
};
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** stature of children / teens by age (m) */
function statureAt(age: number, female: boolean): number {
  const tab = female ? [1.09, 1.15, 1.21, 1.27, 1.33, 1.38, 1.44, 1.5, 1.55, 1.59, 1.61, 1.63, 1.64, 1.64] : [1.1, 1.16, 1.22, 1.28, 1.33, 1.38, 1.43, 1.49, 1.56, 1.63, 1.68, 1.72, 1.74, 1.75];
  const i = clamp(age - 5, 0, tab.length - 1);
  const i0 = Math.floor(i);
  return tab[i0] + (tab[Math.min(tab.length - 1, i0 + 1)] - tab[i0]) * (i - i0);
}

/** Body parameters (w, c, b, s) from a look; deterministic. */
export function bodyParams(look: Pick<Look, 'kind' | 'age' | 'scale' | 'girth'>, out: { w: number; c: number; b: number; s: number; old: number }): void {
  const female = look.kind === 'woman' || look.kind === 'girl';
  const childKind = look.kind === 'boy' || look.kind === 'girl';
  const g = look.girth ?? 1;
  let w = female ? 1 : 0;
  let c = 0;
  let s = 1;
  let b: number;
  let old = 0;
  if (childKind || look.age < 13) {
    // 5–11 years: stature by age, proportions from the 7-year-old target (extrapolated a little)
    const h = statureAt(look.age, female);
    w = female ? 0.18 : 0;
    // linear morph: stature = 1.76 − 0.12 w − 0.54 c
    const hMan = 1.76 - 0.12 * w;
    c = clamp((hMan - h) / 0.54, 0.35, 1.15);
    const hc = hMan - 0.54 * c;
    s = (h / hc) * (1 + clamp((look.scale - 0.67) / 0.07, -1, 1) * 0.03);
    b = clamp((g - 0.97) * 4, -0.25, 0.25);
  } else if (look.age < 19) {
    // teens: blend from childlike (13) to adult (18)
    const k = clamp((look.age - 13) / 5, 0, 1);
    const h = statureAt(look.age, female);
    w = female ? 0.45 + 0.55 * k : 0;
    const hMan = 1.76 - 0.12 * w;
    c = clamp((hMan - h) / 0.54, 0, 0.6);
    const hc = hMan - 0.54 * c;
    s = (h / hc) * (1 + clamp((look.scale - 0.93) / 0.05, -1, 1) * 0.03);
    b = clamp(((g - 0.94) / 0.2) * 0.6 - 0.25, -0.3, 0.45);
  } else {
    s = female ? look.scale / 0.96 : look.scale / 1.02;
    b = Math.pow(clamp((g - 0.94) / 0.2, 0, 1.3), 1.6) * 1.1 - 0.25;
    if (look.age >= 66) {
      old = clamp((look.age - 62) / 16, 0.3, 1);
      s *= 1 - 0.025 * old;
      b = Math.max(b, 0.15);
    }
    b = clamp(b, -0.3, 1.1);
  }
  out.w = w;
  out.c = c;
  out.b = b;
  out.s = s;
  out.old = old;
}

const rigCache = new WeakMap<object, Rig>();

/** Morphed rig of a look (cached per look object). */
export function rigOf(look: Look): Rig {
  const hit = rigCache.get(look) as RigSrc | undefined;
  // the look's body fields are compared directly (no key string: rigOf runs per figure per frame)
  if (hit && hit._kind === look.kind && hit._age === look.age && hit._scale === look.scale && hit._girth === look.girth) return hit;
  const p = { w: 0, c: 0, b: 0, s: 1, old: 0 };
  bodyParams(look, p);
  const { w, c, b } = p;
  const V = () => ({ x: 0, y: 0, z: 0 });
  const r: Rig = {
    ...p,
    hip: mixV(V(), (d) => d.hip, w, c, b),
    knee: mixV(V(), (d) => d.knee, w, c, b),
    ankle: mixV(V(), (d) => d.ankle, w, c, b),
    waist: mixV(V(), (d) => d.waist, w, c, b),
    chest: mixV(V(), (d) => d.chest, w, c, b),
    neck: mixV(V(), (d) => d.neck, w, c, b),
    head: mixV(V(), (d) => d.head, w, c, b),
    shoulder: mixV(V(), (d) => d.shoulder, w, c, b),
    elbow: mixV(V(), (d) => d.elbow, w, c, b),
    wrist: mixV(V(), (d) => d.wrist, w, c, b),
    tip: mixV(V(), (d) => d.tip, w, c, b),
    thighL: 0,
    shinL: 0,
    upperL: 0,
    foreL: 0,
    ankleH: 0,
    heelZ: mixS((d) => d.foot[1].z, w, c, b),
    toeZ: mixS((d) => d.foot[7].z, w, c, b),
    ballZ: mixS((d) => d.foot[5].z, w, c, b),
    sole: [0, 1, 5, 7].map((i) => ({ z: mixS((d) => d.foot[i].z, w, c, b), y: mixS((d) => d.foot[i].y0 - d.foot[1].y0, w, c, b) })),
    legLen: 0,
    stature: mixS((d) => d.H, w, c, b) * p.s,
  };
  r.thighL = dist(r.hip, r.knee);
  r.shinL = dist(r.knee, r.ankle);
  r.upperL = dist(r.shoulder, r.elbow);
  r.foreL = dist(r.elbow, r.wrist);
  r.ankleH = r.ankle.y;
  r.legLen = r.hip.y * p.s;
  const src = r as RigSrc;
  src._kind = look.kind;
  src._age = look.age;
  src._scale = look.scale;
  src._girth = look.girth;
  rigCache.set(look, r);
  return r;
}
type RigSrc = Rig & { _kind: string; _age: number; _scale: number; _girth: number };


// ───────────────────────────────────────────────────────── gait ──

/** Switch used by ?legacypeople: the original stride formula. */
export const gaitConfig = { legacy: false };

/**
 * Length (m) of one full gait cycle (two steps) at speed v for this figure. Dynamic similarity from
 * the hip height: step frequency f = (1.15 + 0.55 v′)·√(0.93/Lh) Hz with v′ = v·√(0.93/Lh) for
 * walking (adult 1.3 m/s → 112 steps/min, 0.70 m steps), f = 2.6 + 0.12 (v − 2.1) Hz running,
 * blended over 1.9–2.3 m/s. The crowd advances the gait phase by distance / gaitCycle.
 */
export function gaitCycle(look: Look, v: number): number {
  if (gaitConfig.legacy) return look.scale * (0.85 + 0.42 * Math.min(v, 3.5));
  const r = rigOf(look);
  return 2 * stepLength(r, v);
}
/** gaitCycle of a member (look, speed) into GC.cycle — the crowd's per-member path: a double passed to or
 *  returned from a call that is not inlined is boxed (16 B of garbage each), a field is not */
export const GC = { cycle: 0.5 };
export function gaitCycleOf(m: { look: Look; speed: number }): void {
  const look = m.look,
    v = m.speed;
  if (gaitConfig.legacy) {
    GC.cycle = look.scale * (0.85 + 0.42 * Math.min(v, 3.5));
    return;
  }
  GC.cycle = 2 * stepLength(rigOf(look), v);
}

/** Step length (m) for a rig at speed v (≥ a small minimum so the phase never races). */
export function stepLength(r: Rig, v: number): number {
  const k = Math.sqrt(0.93 / Math.max(0.3, r.legLen));
  const vv = Math.max(0.12, Math.min(v, 4));
  const fWalk = (1.15 + 0.55 * vv * k) * k * (1 + 0.08 * r.old);
  const fRun = (2.6 + 0.12 * (vv - 2.1)) * k;
  const t = clamp((vv - 1.9) / 0.4, 0, 1);
  const f = fWalk + (fRun - fWalk) * t * t * (3 - 2 * t);
  return vv / f;
}
