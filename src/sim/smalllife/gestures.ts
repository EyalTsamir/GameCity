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
export const GI = new Float64Array(9);
export const G_T = 0,
  G_SEED = 1,
  G_PID = 2,
  G_TIN = 3,
  G_CY = 4,
  G_WY = 5,
  G_HY = 6,
  G_HZ = 7,
  G_HK = 8;

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

/** set one arm of slot `a` (O_R or O_L) from values in the scratch W: x y z weight pole xyz grip */
const W = new Float64Array(8);
function arm(a: number, k: number): void {
  const w = W[3] * k;
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

/** one conversational gesture, f = 0..1 through its phrase, s = the side it starts from, added to GO with weight k */
function gesture(g: number, f: number, s: number, k: number, size: number): void {
  const t = GI[G_T],
    hk = GI[G_HK],
    cy = GI[G_CY],
    wy = GI[G_WY],
    seed = GI[G_SEED];
  const main = s > 0 ? O_L : O_R,
    other = s > 0 ? O_R : O_L;
  // the stress of what is said: a pulse or two through the phrase
  const beat = Math.pow(Math.max(0, Math.sin(f * 6.283 * (1.5 + (g & 1)) + seed * 6)), 3);
  W[4] = s;
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
      arm(main, k);
      GO[O_HP] += 0.045 * beat * k;
      break;
    }
    case 1: {
      // both hands open and held apart, moving out as it is explained
      const open = 0.15 + 0.07 * size * smooth(f * 2.5) + 0.012 * Math.sin(t * 3.1);
      for (const q of [1, -1]) {
        W[0] = q * open * hk;
        W[1] = cy - (0.09 + 0.03 * beat) * hk;
        W[2] = 0.27 * hk;
        W[3] = 1;
        W[4] = q;
        W[6] = -0.3;
        W[7] = 0.12;
        arm(q > 0 ? O_L : O_R, k);
      }
      GO[O_CB] += 0.02 * k;
      break;
    }
    case 2: {
      // a shrug: hands up and out, the head on one side, and down again
      const up = Math.sin(Math.min(1, f * 1.4) * 3.14159);
      for (const q of [1, -1]) {
        W[0] = q * (0.2 + 0.08 * up * size) * hk;
        W[1] = wy + (0.03 + 0.1 * up) * hk;
        W[2] = (0.18 + 0.05 * up) * hk;
        W[3] = 1;
        W[4] = q;
        W[5] = -1;
        W[6] = 0.1;
        W[7] = 0.08;
        arm(q > 0 ? O_L : O_R, k);
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
      arm(main, k);
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
      arm(main, k);
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
      arm(main, k);
      break;
    }
    case 6: {
      // on the one hand, on the other: the hands weigh it up
      const w = Math.sin(f * 6.283 + seed);
      for (const q of [1, -1]) {
        W[0] = q * 0.16 * hk;
        W[1] = cy - (0.11 - 0.05 * q * w * size) * hk;
        W[2] = 0.27 * hk;
        W[3] = 1;
        W[4] = q;
        W[7] = 0.2;
        arm(q > 0 ? O_L : O_R, k);
      }
      GO[O_HR] += 0.07 * w * k;
      break;
    }
    default: {
      // nothing for the hands: words alone, the head doing it
      GO[O_HP] += 0.05 * Math.sin(t * 3.4 + seed * 4) * k;
      W[3] = 0;
      void other;
      break;
    }
  }
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
  const size = 0.45 + 0.75 * talky;
  const SLOT = 1.25 + 0.75 * hash(seed * 91.3);
  const n = Math.floor(tin / SLOT);
  const f = (tin - n * SLOT) / SLOT;
  const sideHash = hash(seed * 7.31);
  // the turn's phrases come from the party and the turn, so that everyone has different ones
  const seedTurn = pid * 12.9898 + Math.floor(GI[G_T] / 5.5) * 7.233;
  const pick = (i: number): number => {
    const h = hash(seedTurn + i * 3.17 + seed * 17);
    // a quiet talker rests most of the time
    if (talky < 0.25 && h < 0.5) return GESTURE_COUNT - 1;
    return Math.floor(hash(h * 91.7 + i) * GESTURE_COUNT);
  };
  const sideOf = (i: number): number => (hash(seedTurn * 1.7 + i * 5.1 + seed) < 0.28 + 0.4 * sideHash ? 1 : -1);
  const g1 = pick(n),
    s1 = sideOf(n);
  const X = 0.3;
  if (f < X) {
    const b = smooth(f / X);
    gesture(pick(n - 1), 1, sideOf(n - 1), k * (1 - b), size);
    gesture(g1, f, s1, k * b, size);
  } else gesture(g1, f, s1, k, size);
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
      arm(O_L, env);
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
      arm(main, env);
      GO[O_HP] += 0.12 * env;
      break;
    case 2:
      // thinking: a hand at the chin
      if (!can) return false;
      W[0] = s * 0.018 * hk;
      W[1] = hy - 0.075 * hk;
      W[2] = hz + 0.105 * hk;
      W[3] = 1;
      W[4] = s;
      W[5] = -1;
      W[6] = -0.1;
      W[7] = 0.6;
      arm(main, env);
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
      arm(main, env);
      GO[O_HR] -= s * 0.05 * env;
      break;
    case 4:
      // rubbing the hands
      if ((free & 3) !== 3) return false;
      for (const q of [1, -1]) {
        W[0] = q * (0.012 + 0.012 * Math.sin(t * 11 + q)) * hk;
        W[1] = wy + (0.09 + 0.008 * q * Math.sin(t * 11)) * hk;
        W[2] = 0.21 * hk;
        W[3] = 1;
        W[4] = q;
        W[5] = -1;
        W[6] = -0.3;
        W[7] = 0.5;
        arm(q > 0 ? O_L : O_R, env);
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
      arm(O_R, env);
      GO[O_HP] += 0.4 * env;
      if (env > 0.4) GO[O_PROP] = 1;
      break;
  }
  return true;
}
