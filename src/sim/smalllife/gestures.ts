// How people use their hands when you are near enough to see them (close-up round, docs/progress/close-life.md). Someone
// talking moves through short phrases of real gestures: a beat on the stress, open hands, a shrug, pointing somewhere,
// a hand on the chest, a rolling hand, on the one hand and on the other. Whoever listens nods in bursts and tips the
// head, and a party laughs together now and then. Someone standing alone checks a watch, scratches the neck, rubs the
// hands, thinks with a hand at the chin. All decided by hashes of time slots: no state, nothing allocated, and every
// person has their own measure of it.
//
// Pure numbers, three-free. Inputs in GI, outputs in GO (typed arrays: a computed double passed as an argument to a call
// that is not inlined is boxed, 16 B of garbage per figure per frame). animate.ts applies them with its arm IK.
//
// Switch: ?nogestures (core/closeLife.ts)

import { closeLifeOn } from '../../core/closeLife';

export const GESTURES = closeLifeOn('gestures');

/** t (s, shared with the party), seed, party id, seconds into the speaker's turn, chest y, waist y, head y, head z */
export const GI = new Float64Array(10);
export const G_T = 0,
  G_SEED = 1,
  G_PID = 2,
  G_TIN = 3,
  G_CY = 4,
  G_WY = 5,
  G_HY = 6,
  G_HZ = 7,
  G_HK = 8,
  /** figure unit in metres */
  G_S = 9;

/**
 * right target x y z weight, pole x y z, grip;  left target x y z weight, pole x y z, grip;
 * head yaw, pitch, roll, chest bend, chest twist, chest roll; prop (1 phone)
 */
export const GO = new Float64Array(25);
export const O_R = 0,
  O_L = 8,
  O_HY = 16,
  O_HP = 17,
  O_HR = 18,
  O_CB = 19,
  O_CT = 20,
  O_CR = 21,
  O_PROP = 22;

const smooth = (x: number): number => {
  const u = x < 0 ? 0 : x > 1 ? 1 : x;
  return u * u * (3 - 2 * u);
};
const hash = (x: number): number => {
  const h = Math.sin(x) * 43758.5453;
  return h - Math.floor(h);
};

function clearOut(): void {
  GO.fill(0);
}

/** set one arm of slot `a` (O_R or O_L) from values in the scratch W: x y z weight pole xyz grip, how much */
const W = new Float64Array(9);
const W_K = 8;
function arm(a: number): void {
  const w = W[3] * W[W_K];
  if (w <= 0.001) return;
  // blend with what is there: two gestures in a crossfade add up their weights
  const old = GO[a + 3];
  const tot = old + w;
  const m = w / tot;
  GO[a] += (W[0] - GO[a]) * m;
  GO[a + 1] += (W[1] - GO[a + 1]) * m;
  GO[a + 2] += (W[2] - GO[a + 2]) * m;
  GO[a + 3] = tot;
  GO[a + 4] += (W[4] - GO[a + 4]) * m;
  GO[a + 5] += (W[5] - GO[a + 5]) * m;
  GO[a + 6] += (W[6] - GO[a + 6]) * m;
  GO[a + 7] += (W[7] - GO[a + 7]) * m;
}

const GESTURE_COUNT = 8;

/** phrase scratch: f = 0..1 through its phrase, s = the side it starts from, weight k, size of the person's gestures */
const A = new Float64Array(7);
const A_F = 0,
  A_S = 1,
  A_K = 2,
  A_SIZE = 3,
  A_TURN = 4,
  A_SIDE = 5,
  A_TALKY = 6;

/** one conversational gesture, inputs in A, added to GO */
function gesture(g: number): void {
  const f = A[A_F],
    s = A[A_S],
    k = A[A_K],
    size = A[A_SIZE];
  const t = GI[G_T],
    hk = GI[G_HK],
    cy = GI[G_CY],
    wy = GI[G_WY],
    seed = GI[G_SEED];
  const main = s > 0 ? O_L : O_R;
  W[W_K] = k;
  // the stress of what is said: a pulse or two through the phrase
  const beat = Math.pow(Math.max(0, Math.sin(f * 6.283 * (1.5 + (g & 1)) + seed * 6)), 3);
  W[4] = s * 0.3;
  W[5] = -1;
  W[6] = -0.4;
  switch (g) {
    case 0: {
      // the beat: one hand, palm half open, coming down on the words
      W[0] = s * (0.14 + 0.02 * Math.sin(t * 1.3)) * hk;
      W[1] = cy - (0.05 + 0.075 * beat * size) * hk;
      W[2] = (0.28 + 0.03 * beat) * hk;
      W[3] = 1;
      W[7] = 0.3;
      arm(main);
      GO[O_HP] += 0.045 * beat * k;
      break;
    }
    case 1: {
      // both hands open and held apart, moving out as it is explained
      const open = 0.15 + 0.07 * size * smooth(f * 2.5) + 0.012 * Math.sin(t * 3.1);
      for (let q = 1; q >= -1; q -= 2) {
        W[0] = q * open * hk;
        W[1] = cy - (0.09 + 0.03 * beat) * hk;
        W[2] = 0.27 * hk;
        W[3] = 1;
        W[4] = q * 0.3;
        W[6] = -0.3;
        W[7] = 0.12;
        arm(q > 0 ? O_L : O_R);
      }
      GO[O_CB] += 0.02 * k;
      break;
    }
    case 2: {
      // a shrug: hands up and out, the head on one side, and down again
      const up = Math.sin(Math.min(1, f * 1.4) * 3.14159);
      for (let q = 1; q >= -1; q -= 2) {
        W[0] = q * (0.2 + 0.08 * up * size) * hk;
        W[1] = wy + (0.03 + 0.1 * up) * hk;
        W[2] = (0.18 + 0.05 * up) * hk;
        W[3] = 1;
        W[4] = q;
        W[5] = -1;
        W[6] = 0.1;
        W[7] = 0.08;
        arm(q > 0 ? O_L : O_R);
      }
      GO[O_HR] += s * 0.16 * up * k;
      GO[O_HP] -= 0.05 * up * k;
      GO[O_CR] += 0.02 * s * up * k;
      break;
    }
    case 3: {
      // pointing over there: the arm out, the head after it, the body a little round
      const out = smooth(f * 3) * smooth((1 - f) * 3.5);
      W[0] = s * (0.2 + 0.26 * out * size) * hk;
      W[1] = cy + (-0.1 + 0.11 * out) * hk;
      W[2] = (0.24 + 0.2 * out) * hk;
      W[3] = 1;
      W[5] = -0.6;
      W[6] = -0.6;
      W[7] = 0.55;
      arm(main);
      GO[O_HY] += s * 0.55 * out * k;
      GO[O_CT] += s * 0.12 * out * k;
      break;
    }
    case 4: {
      // me: a hand on the chest
      const on = smooth(f * 4) * smooth((1 - f) * 4);
      W[0] = s * (0.05 + 0.02 * (1 - on)) * hk;
      W[1] = cy + (-0.06 + 0.05 * on) * hk;
      W[2] = (0.2 - 0.045 * on) * hk;
      W[3] = 1;
      W[5] = -1;
      W[6] = 0.1;
      W[7] = 0.15;
      arm(main);
      GO[O_HP] += 0.04 * on * k;
      break;
    }
    case 5: {
      // and so on and so on: the hand rolls over forward
      const a = t * 5.2 + seed * 9;
      W[0] = s * (0.14 + 0.02 * Math.cos(a)) * hk;
      W[1] = cy + (-0.07 + 0.045 * size * Math.sin(a)) * hk;
      W[2] = (0.29 + 0.04 * size * Math.cos(a)) * hk;
      W[3] = 1;
      W[7] = 0.35;
      arm(main);
      break;
    }
    case 6: {
      // on the one hand, on the other: the hands weigh it up
      const w = Math.sin(f * 6.283 + seed);
      for (let q = 1; q >= -1; q -= 2) {
        W[0] = q * 0.16 * hk;
        W[1] = cy - (0.11 - 0.05 * q * w * size) * hk;
        W[2] = 0.27 * hk;
        W[3] = 1;
        W[4] = q * 0.3;
        W[7] = 0.2;
        arm(q > 0 ? O_L : O_R);
      }
      GO[O_HR] += 0.07 * w * k;
      break;
    }
    default: {
      // nothing for the hands: words alone, the head doing it
      GO[O_HP] += 0.05 * Math.sin(t * 3.4 + seed * 4) * k;
      break;
    }
  }
}

/** which gesture phrase i of a turn is */
function pickGesture(i: number): number {
  const h = hash(A[A_TURN] + i * 3.17 + GI[G_SEED] * 17);
  // a quiet talker rests most of the time
  if (A[A_TALKY] < 0.25 && h < 0.5) return GESTURE_COUNT - 1;
  return Math.floor(hash(h * 91.7 + i) * GESTURE_COUNT);
}
function sideOfPhrase(i: number): number {
  return hash(A[A_TURN] * 1.7 + i * 5.1 + GI[G_SEED]) < 0.28 + 0.4 * A[A_SIDE] ? 1 : -1;
}

/**
 * The speaker of a party's turn: phrases of gestures through GI[G_TIN]. k: how much (the fade in and out of the turn).
 * Clears GO first.
 */
export function speakerGestures(k: number): void {
  clearOut();
  const seed = GI[G_SEED],
    pid = GI[G_PID],
    tin = GI[G_TIN];
  // each person's own measure: some talk with their whole arms, some hardly at all
  const talky = hash(seed * 311.7 + 1.3);
  A[A_SIZE] = 0.45 + 0.75 * talky;
  A[A_TALKY] = talky;
  A[A_SIDE] = hash(seed * 7.31);
  const SLOT = 1.25 + 0.75 * hash(seed * 91.3);
  const n = Math.floor(tin / SLOT);
  const f = (tin - n * SLOT) / SLOT;
  // the turn's phrases come from the party and the turn, so that everyone has different ones
  A[A_TURN] = pid * 12.9898 + Math.floor(GI[G_T] / 5.5) * 7.233;
  const X = 0.3;
  let b = 1;
  if (f < X) {
    b = smooth(f / X);
    A[A_F] = 1;
    A[A_S] = sideOfPhrase(n - 1);
    A[A_K] = k * (1 - b);
    gesture(pickGesture(n - 1));
  }
  A[A_F] = f;
  A[A_S] = sideOfPhrase(n);
  A[A_K] = k * b;
  gesture(pickGesture(n));
  // normalise: the arms' weights in a crossfade summed to at most k
  if (GO[O_R + 3] > 1) GO[O_R + 3] = 1;
  if (GO[O_L + 3] > 1) GO[O_L + 3] = 1;
  partyLaugh(1);
}

/** a party's shared laugh: heads back and the shoulders going, for about two seconds now and then */
function partyLaugh(k: number): void {
  const t = GI[G_T],
    pid = GI[G_PID],
    seed = GI[G_SEED];
  const period = 14;
  const e = Math.floor((t + pid * 3.1) / period);
  if (hash(pid * 5.17 + e * 2.31) > 0.34) return;
  const f = (t + pid * 3.1 - e * period) / (1.5 + 1.2 * hash(seed * 33.1));
  if (f <= 0 || f >= 1) return;
  const env = smooth(f * 5) * smooth((1 - f) * 2.5);
  const shake = Math.sin(t * 19 + seed * 8);
  GO[O_HP] -= (0.2 + 0.03 * shake) * env * k;
  GO[O_CB] += (-0.05 + 0.03 * shake) * env * k;
  GO[O_HR] += 0.05 * (seed > 0.5 ? 1 : -1) * env * k;
}

/** someone listening: nods in bursts, a tip of the head, the party's laugh. Clears GO first. */
export function listenerGestures(k: number): void {
  clearOut();
  const t = GI[G_T],
    seed = GI[G_SEED];
  const e = Math.floor((t + seed * 23) / 3.7);
  const h = hash(seed * 41.3 + e * 1.9);
  const f = (t + seed * 23 - e * 3.7) / 3.7;
  if (h < 0.55) {
    // two or three small nods
    const env = smooth(f * 6) * smooth((0.55 - f) * 6);
    GO[O_HP] += (0.07 * Math.sin(f * 6.283 * (2.5 + h * 4)) + 0.04) * env * k;
  } else if (h < 0.78) {
    const env = smooth(f * 4) * smooth((1 - f) * 4);
    GO[O_HR] += (h < 0.66 ? 0.1 : -0.1) * env * k;
  }
  partyLaugh(k);
}

// ── street moments (scenes/moments.ts): what the hands do

export const M_SWEEP = 1,
  M_SMOKE = 2,
  M_PHONE = 3,
  M_AIR = 4,
  M_TALK = 5,
  /** on a bench, crumbs for the birds */
  M_FEED = 6;

/** crumbs for the birds, seated: into GO, right hand from a bag on the lap out in front of the knees, a flick, back. GI G_WY = hip height with the root's drop, G_HZ = root z */
export function feedPose(k: number): void {
  clearOut();
  const hk = GI[G_HK],
    seed = GI[G_SEED],
    t = GI[G_T];
  const hip = GI[G_WY],
    rz = GI[G_HZ];
  const P = 4.5 + 3 * seed;
  const tt = t + seed * 37;
  const tc = tt - Math.floor(tt / P) * P;
  W[W_K] = k;
  // the left hand keeps the bag on the lap
  W[0] = 0.05 * hk;
  W[1] = hip + 0.08 * hk;
  W[2] = rz + 0.24 * hk;
  W[3] = 1;
  W[4] = 1;
  W[5] = -0.3;
  W[6] = -0.6;
  W[7] = 0.75;
  arm(O_L);
  // the right: in the bag, out, the flick of the wrist, and back to the bag
  const out = smooth((tc - 1) / 0.7) * smooth((3.1 - tc) / 0.8);
  const flick = tc > 1.7 && tc < 2.25 ? Math.sin(((tc - 1.7) / 0.55) * 3.14159) : 0;
  W[0] = (0.01 - 0.17 * out) * hk;
  W[1] = hip + (0.1 + 0.17 * out - 0.05 * flick) * hk;
  W[2] = rz + (0.24 + 0.2 * out + 0.07 * flick) * hk;
  W[3] = 1;
  W[4] = -1;
  W[5] = -0.3;
  W[6] = -0.6;
  W[7] = 0.75 - 0.6 * flick;
  arm(O_R);
  // watching them, the head going from one to another
  GO[O_HP] = 0.3 * k;
  GO[O_HY] = 0.35 * Math.sin(t * 0.31 + seed * 11) * k;
}

/** a broom in hand: its foot and its top (x y z, metres in the figure's frame, x+ = left, z+ = forward), from GI time, seed, size */
export const BR = new Float64Array(6);
export function broomEnds(): void {
  const hk = GI[G_HK];
  const a = (GI[G_T] + GI[G_SEED] * 40) * (6.283 / (1.5 + 0.5 * GI[G_SEED]));
  const sn = Math.sin(a),
    cs = Math.cos(a);
  BR[0] = (0.02 + 0.3 * sn) * hk;
  BR[1] = 0.012 + 0.03 * Math.max(0, cs);
  BR[2] = (0.68 + 0.1 * cs) * hk;
  BR[3] = (-0.07 - 0.07 * sn) * hk;
  BR[4] = 1.38 * hk;
  BR[5] = (0.2 + 0.03 * cs) * hk;
}

/** a cigarette: where the hand has it (x y z, metres in the figure's frame), and 0..1 how far a drag has gone (CG[3]) */
export const CG = new Float64Array(4);
export function cigAt(): void {
  const hk = GI[G_HK],
    seed = GI[G_SEED];
  const P = 9 + 5 * seed;
  const tt = GI[G_T] + seed * 61;
  const tc = tt - Math.floor(tt / P) * P;
  const up = smooth(tc / 0.7) * smooth((2.3 - tc) / 0.7);
  const hx = -0.15 * hk,
    hy = 1.02 * hk,
    hz = 0.2 * hk;
  const mx = -0.01 * hk,
    my = GI[G_HY] + 0.025 * hk,
    mz = GI[G_HZ] + 0.125 * hk;
  CG[0] = hx + (mx - hx) * up;
  CG[1] = hy + (my - hy) * up;
  CG[2] = hz + (mz - hz) * up;
  // the breath out comes just after the hand has gone down
  CG[3] = tc > 2.3 && tc < 3.4 ? 1 : 0;
}

/** arms and head for a moment, GO filled; k = how far into it. G_HY, G_HZ here in figure units as everywhere in this file */
export function momentPose(kind: number, k: number): void {
  clearOut();
  const s = GI[G_S],
    hk = GI[G_HK],
    t = GI[G_T],
    seed = GI[G_SEED];
  W[W_K] = k;
  switch (kind) {
    case M_SWEEP: {
      // both hands on the handle: one up by the chest, one lower. broomEnds is in metres and sized by the same hk
      GI[G_HK] = hk * s;
      broomEnds();
      GI[G_HK] = hk;
      const u1 = 0.8,
        u2 = 0.52;
      W[0] = (BR[0] + (BR[3] - BR[0]) * u1) / s;
      W[1] = (BR[1] + (BR[4] - BR[1]) * u1) / s;
      W[2] = (BR[2] + (BR[5] - BR[2]) * u1) / s;
      W[3] = 1;
      W[4] = -1;
      W[5] = -1;
      W[6] = -0.3;
      W[7] = 0.85;
      arm(O_R);
      W[0] = (BR[0] + (BR[3] - BR[0]) * u2) / s;
      W[1] = (BR[1] + (BR[4] - BR[1]) * u2) / s;
      W[2] = (BR[2] + (BR[5] - BR[2]) * u2) / s;
      W[4] = 1;
      arm(O_L);
      const a = (t + seed * 40) * (6.283 / (1.5 + 0.5 * seed));
      GO[O_CB] += 0.14 * k;
      GO[O_CT] += 0.16 * Math.sin(a) * k;
      GO[O_HP] += 0.22 * k;
      GO[O_HY] += 0.1 * Math.sin(a - 0.5) * k;
      break;
    }
    case M_SMOKE: {
      GI[G_HY] *= s;
      GI[G_HZ] *= s;
      GI[G_HK] = hk * s;
      cigAt();
      GI[G_HY] /= s;
      GI[G_HZ] /= s;
      GI[G_HK] = hk;
      W[0] = CG[0] / s;
      W[1] = CG[1] / s;
      W[2] = CG[2] / s;
      W[3] = 1;
      W[4] = -1;
      W[5] = -1;
      W[6] = -0.25;
      W[7] = 0.55;
      arm(O_R);
      // the head goes up a little as the smoke comes out
      GO[O_HP] -= 0.2 * CG[3] * k;
      GO[O_HY] += 0.3 * Math.sin(t * 0.23 + seed * 9) * k;
      break;
    }
    case M_PHONE: {
      // (the rig's head point is at the level of the chin: the ear is well above it)
      W[0] = -0.098 * hk;
      W[1] = GI[G_HY] + 0.085 * hk;
      W[2] = GI[G_HZ] + 0.03 * hk;
      W[3] = 1;
      W[4] = -0.55;
      W[5] = -1;
      W[6] = 0.35;
      W[7] = 0.75;
      arm(O_R);
      GO[O_PROP] = k > 0.6 ? 1 : 0;
      GO[O_HR] += 0.13 * k;
      GO[O_HP] += (0.09 + 0.06 * Math.sin(t * 0.7 + seed * 5)) * k;
      break;
    }
    default:
      break;
  }
}

const FIDGETS = 8;

/**
 * Someone standing about with nothing to do: now and then one small action. Returns false when there is nothing this
 * moment (GO untouched), `free`: bit 1 the right hand may be used, bit 2 the left.
 */
export function fidget(free: number): boolean {
  const seed = GI[G_SEED],
    t = GI[G_T],
    hk = GI[G_HK],
    cy = GI[G_CY],
    wy = GI[G_WY],
    hy = GI[G_HY],
    hz = GI[G_HZ];
  const P = 7 + 11 * hash(seed * 77.7);
  const tt = t + seed * 131;
  const e = Math.floor(tt / P);
  const h = hash(seed * 53.1 + e * 2.77);
  if (h > 0.68) return false;
  const dur = 1.7 + 2.2 * hash(seed + e * 1.31);
  const at = (P - dur) * hash(seed * 3 + e * 9.1);
  const f = (tt - e * P - at) / dur;
  if (f <= 0 || f >= 1) return false;
  const env = smooth(f * 3.2) * smooth((1 - f) * 3.2);
  if (env < 0.003) return false;
  const kind = Math.floor(hash(seed * 19.1 + e * 4.3) * FIDGETS);
  let s = hash(seed * 7.1 + e) < 0.65 ? -1 : 1;
  if (s < 0 && !(free & 1)) s = 1;
  if (s > 0 && !(free & 2)) s = -1;
  const can = s < 0 ? free & 1 : free & 2;
  clearOut();
  W[W_K] = env;
  W[4] = s;
  W[5] = -1;
  W[6] = -0.3;
  const main = s > 0 ? O_L : O_R;
  switch (kind) {
    case 0:
      // the time: the left wrist comes up and the eyes go down to it
      if (!(free & 2)) return false;
      W[0] = 0.05 * hk;
      W[1] = cy - 0.03 * hk;
      W[2] = 0.27 * hk;
      W[3] = 1;
      W[4] = 1;
      W[5] = -1;
      W[6] = -0.1;
      W[7] = 0.25;
      arm(O_L);
      GO[O_HP] += 0.44 * env;
      GO[O_HY] += 0.2 * env;
      break;
    case 1:
      // the back of the neck
      if (!can) return false;
      W[0] = s * 0.055 * hk;
      W[1] = hy - (0.05 - 0.012 * Math.sin(t * 8)) * hk;
      W[2] = hz - 0.075 * hk;
      W[3] = 1;
      W[4] = s;
      W[5] = 0.25;
      W[6] = 0.35;
      W[7] = 0.45;
      arm(main);
      GO[O_HP] += 0.12 * env;
      break;
    case 2:
      // thinking: a hand at the chin
      if (!can) return false;
      W[0] = s * 0.018 * hk;
      W[1] = hy - 0.012 * hk;
      W[2] = hz + 0.105 * hk;
      W[3] = 1;
      W[4] = s;
      W[5] = -1;
      W[6] = -0.1;
      W[7] = 0.6;
      arm(main);
      GO[O_HP] += 0.05 * env;
      GO[O_HY] += s * 0.1 * env;
      break;
    case 3:
      // a hitch of the strap or the collar
      if (!can) return false;
      W[0] = s * 0.12 * hk;
      W[1] = cy + (0.09 + 0.012 * Math.sin(f * 12)) * hk;
      W[2] = 0.085 * hk;
      W[3] = 1;
      W[4] = s;
      W[5] = -1;
      W[6] = -0.5;
      W[7] = 0.75;
      arm(main);
      GO[O_HR] -= s * 0.05 * env;
      break;
    case 4:
      // rubbing the hands
      if ((free & 3) !== 3) return false;
      for (let q = 1; q >= -1; q -= 2) {
        W[0] = q * (0.012 + 0.012 * Math.sin(t * 11 + q)) * hk;
        W[1] = wy + (0.09 + 0.008 * q * Math.sin(t * 11)) * hk;
        W[2] = 0.21 * hk;
        W[3] = 1;
        W[4] = q;
        W[5] = -1;
        W[6] = -0.3;
        W[7] = 0.5;
        arm(q > 0 ? O_L : O_R);
      }
      GO[O_HP] += 0.1 * env;
      break;
    case 5:
      // a stiff neck: the head over to one side and round
      GO[O_HR] += s * 0.2 * env;
      GO[O_HP] += 0.06 * Math.sin(f * 6.283) * env;
      break;
    case 6:
      // looking round for something: shoulders and head
      GO[O_HY] += s * 0.65 * env;
      GO[O_CT] += s * 0.16 * env;
      break;
    default:
      // the phone out for a moment
      if (!(free & 1)) return false;
      W[0] = -0.05 * hk;
      W[1] = cy - 0.04 * hk;
      W[2] = 0.25 * hk;
      W[3] = 1;
      W[4] = -1;
      W[5] = -1;
      W[6] = -0.2;
      W[7] = 0.6;
      arm(O_R);
      GO[O_HP] += 0.4 * env;
      if (env > 0.4) GO[O_PROP] = 1;
      break;
  }
  return true;
}
