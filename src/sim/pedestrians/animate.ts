// Pose of one figure from its crowd member state: walk / run / stand (gait.ts, planted feet), idle
// variants, bench sitting, sitting on the sand, lying, waving, pushing a pram, holding props. Hands
// that touch something (pram bar, cane, pockets, newspaper, thighs, ground) are placed with the arm
// IK (pose.ts armIK). Writes a Pose (pose.ts).

import type { Member } from './crowd';
import { F } from './figure';
import { gaitPose, newGaitOut, type GaitState, type IdleShift } from './gait';
import { armIK, fkPoint, legIK, toChestFrame, type ArmSolve, type LegSolve, type Pose } from './pose';
import type { Rig } from './rig';
import { BONE } from './body';

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const frac = (x: number) => x - Math.floor(x);
const sstep = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a), 0, 1));
/** cheap hash → [0, 1) */
const hash = (a: number, b: number) => frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

/** bench seat top above the seat spot (props/furniture.ts bench(): slats 0.45 ± 0.0175) */
export const SEAT_TOP = 0.467;
/** backrest surface behind the seat spot at hip height (m, negative = behind) */
export const BACKREST_Z = -0.3;

/** prop shown in a hand (pose.spare1): 0 none, 1 phone, 2 coffee cup */
export const PROP = { NONE: 0, PHONE: 1, CUP: 2 } as const;

const leg: LegSolve = { flex: 0, knee: 0, ankle: 0, reached: true };
const G = newGaitOut();
const idle: IdleShift = { sway: 0, roll: 0, yaw: 0, drop: 0 };
const ik: ArmSolve = { flex: 0, abd: 0, twist: 0, elbow: 0, reached: true };
const v3 = { x: 0, y: 0, z: 0 };

/** the arm values computePose works with */
interface Arm {
  flex: number;
  abd: number;
  twist: number;
  elbow: number;
  wrist: number;
  grip: number;
}
const armL: Arm = { flex: 0, abd: 0, twist: 0, elbow: 0, wrist: 0, grip: 0 };
const armR: Arm = { flex: 0, abd: 0, twist: 0, elbow: 0, wrist: 0, grip: 0 };

/** blend an arm towards an IK solution for a grip target in the chest rest frame */
function reach(r: Rig, a: Arm, left: boolean, x: number, y: number, z: number, px: number, py: number, pz: number, k: number, grip: number): void {
  if (k <= 0.001) return;
  armIK(r, left, x, y, z, px, py, pz, ik);
  a.flex = mix(a.flex, ik.flex, k);
  a.abd = mix(a.abd, ik.abd, k);
  a.twist = mix(a.twist, ik.twist, k);
  a.elbow = mix(a.elbow, ik.elbow, k);
  a.wrist = mix(a.wrist, 0, k);
  a.grip = mix(a.grip, grip, k);
}

/** blend an arm towards a figure-frame grip target (converted with the current torso pose in o) */
function reachFig(r: Rig, o: Pose, a: Arm, left: boolean, x: number, y: number, z: number, px: number, py: number, pz: number, k: number, grip: number): void {
  if (k <= 0.001) return;
  v3.x = x;
  v3.y = y;
  v3.z = z;
  toChestFrame(r, o, v3);
  reach(r, a, left, v3.x, v3.y, v3.z, px, py, pz, k, grip);
}

const IDLE = { RELAXED: 0, POCKETS: 1, CROSSED: 2, HIP: 3, BEHIND: 4, PHONE: 5, CUP: 6 } as const;
/** debug / tools: force an idle variant (0–6) or bench variant (0–4); −1 = by seed */
export const poseDebug = { idle: -1, bench: -1 };

const IDLE_W_OLD = [0.38, 0.1, 0.12, 0.05, 0.33, 0, 0.02];
const IDLE_W_KID = [0.6, 0.12, 0.1, 0.1, 0.08, 0, 0];
const IDLE_W_ADULT = [0.3, 0.15, 0.12, 0.08, 0.04, 0.23, 0.08];
const IDLE_W_MID = [0.3, 0.15, 0.12, 0.08, 0.04, 0.07, 0.08];
const iv = { v: 0, k: 0 };

/** idle variant of a standing figure: chosen per person and time window, held 6–18 s */
function idleVariant(m: Member, r: Rig, t: number): typeof iv {
  if (poseDebug.idle >= 0) {
    iv.v = poseDebug.idle;
    iv.k = 1;
    return iv;
  }
  const period = 6 + 12 * hash(m.seed, 3.1);
  const tt = t + m.seed * 97;
  const epoch = Math.floor(tt / period);
  const tin = tt - epoch * period;
  iv.k = sstep(0, 0.8, tin) * sstep(0, 0.8, period - tin);
  const h = hash(m.seed, epoch + 0.5);
  const w = r.old > 0.25 ? IDLE_W_OLD : r.c > 0.45 ? IDLE_W_KID : m.look.age < 50 ? IDLE_W_ADULT : IDLE_W_MID;
  let tot = 0;
  for (let i = 0; i < w.length; i++) tot += w[i];
  let acc = 0;
  iv.v = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i] / tot;
    if (h < acc) {
      iv.v = i;
      break;
    }
  }
  return iv;
}

export function computePose(m: Member, t: number, umbrella: boolean, r: Rig, o: Pose, gs: GaitState | null = null, frame = 0): Pose {
  const L = m.look;
  const a = m.amp;
  const old = r.old;
  const hk = r.stature / r.s / 1.76; // figure size relative to the average man (unscaled)
  const seated = Math.max(m.sit, m.lie, m.ground);
  const upright = 1 - smooth(Math.min(1, seated * 2));
  const gw = smooth(clamp(a / 0.14, 0, 1));
  const kSit = smooth(Math.min(1, m.sit));
  const kGround = smooth(Math.min(1, m.ground));
  const kLie = smooth(Math.min(1, m.lie));

  // ── idle weight shift (contrapposto: pelvis list + sway onto one leg), passed into the gait
  const ph = t * 0.32 + m.seed * 40;
  const w = Math.sin(ph) * 0.85 + 0.15 * Math.sin(ph * 2.3);
  idle.sway = 0.02 * hk * w;
  idle.roll = 0.055 * w;
  idle.yaw = 0.035 * Math.sin(ph * 0.7);
  idle.drop = 0.006 * hk * Math.abs(w);

  // ── legs, pelvis and the gait part of the upper body
  gaitPose(m, r, gs, frame, t, gw, idle, G);
  let hipFlexL = G.hipFlexL,
    hipFlexR = G.hipFlexR;
  let kneeL = G.kneeL,
    kneeR = G.kneeR;
  let ankleL = G.ankleL,
    ankleR = G.ankleR;
  let hipAbdL = G.hipAbdL,
    hipAbdR = G.hipAbdR;
  let footYawL = G.footYawL,
    footYawR = G.footYawR;
  let rootX = G.rootX;
  let rootY = G.rootY;
  let rootZ = 0;
  let pelvisYaw = G.pelvisYaw,
    pelvisRoll = G.pelvisRoll;
  let bodyPitch = 0;
  // upper body: elderly stoop (thoracic) with the head brought forward
  let waistBend = 0.015 + 0.04 * old + G.waistBend;
  let waistTwist = G.waistTwist;
  let chestBend = 0.24 * old + 0.05 * G.run;
  let chestTwist = G.chestTwist;
  let chestRoll = -0.5 * pelvisRoll * (1 - gw);
  let headPitch = -0.2 * old + G.headPitch;
  let headYaw = m.headYaw + G.headYawCorr;
  const headRoll = -0.25 * chestRoll;
  // arms: walking swing from the gait, relaxed (soft elbows, slightly forward) when standing
  armL.flex = mix(0.08 + 0.06 * old + 0.03 * Math.sin(t * 0.6 + m.seed * 3), G.shFlexL, gw);
  armR.flex = mix(0.08 + 0.06 * old + 0.03 * Math.sin(t * 0.52 + m.seed * 5), G.shFlexR, gw);
  armL.elbow = mix(0.3 + 0.15 * old, G.elbowL, gw);
  armR.elbow = mix(0.3 + 0.15 * old, G.elbowR, gw);
  armL.abd = mix(0.07, G.shAbdL, gw);
  armR.abd = mix(0.07, G.shAbdR, gw);
  armL.twist = armR.twist = 0;
  armL.wrist = armR.wrist = 0;
  armL.grip = armR.grip = 0.15;
  let tailFloor = 0;
  const caneX = G.caneX,
    caneZ = mix(0.2, G.caneZ, gw);
  let prop: number = PROP.NONE;

  const fl = L.flags;
  const handL = !(L.pram || L.dog || fl & (F.BRIEFCASE | F.ROD));
  const handR = !(L.pram || umbrella || m.wave > 0 || fl & (F.SHOPBAG | F.CANE | F.ROD));

  // sitting on a bench: pelvis back against the backrest, thighs on the seat, feet on the ground
  const sv = poseDebug.bench >= 0 ? poseDebug.bench : Math.floor(hash(m.seed, 9.7) * 5); // bench variant
  if (m.sit > 0) {
    const k = kSit;
    const sc = r.s;
    const hipY = (SEAT_TOP + 0.088 * hk * sc) / sc; // hip joint above the root (figure units)
    const hipZ = (BACKREST_Z + 0.125 * hk * sc) / sc;
    const az = hipZ + r.thighL * 0.98 + 0.03;
    legIK(r, hipY, hipZ, r.ankle.y, az, 0, leg);
    hipFlexL = mix(hipFlexL, leg.flex, k);
    kneeL = mix(kneeL, leg.knee, k);
    ankleL = mix(ankleL, leg.ankle, k);
    legIK(r, hipY, hipZ, r.ankle.y, az - 0.04, 0, leg);
    hipFlexR = mix(hipFlexR, leg.flex, k);
    kneeR = mix(kneeR, leg.knee, k);
    ankleR = mix(ankleR, leg.ankle, k);
    const crossed = sv === 3 && r.c < 0.4;
    if (crossed) {
      // right thigh over the left knee
      hipFlexR = mix(hipFlexR, hipFlexL + 0.32, k);
      hipAbdR = mix(hipAbdR, -0.32, k);
      kneeR = mix(kneeR, 1.15, k);
      ankleR = mix(ankleR, -0.35, k);
    } else {
      hipAbdL = mix(hipAbdL, 0.06, k);
      hipAbdR = mix(hipAbdR, 0.06, k);
    }
    const lean = sv === 1 && !m.reading;
    waistBend = mix(waistBend, m.reading ? -0.1 : lean ? 0.25 : -0.19, k);
    chestBend = mix(chestBend, lean ? 0.12 : 0.05 + 0.15 * old, k);
    headPitch = mix(headPitch, m.reading ? 0.2 : lean ? -0.25 : 0.05, k);
    rootY = mix(rootY, hipY - r.hip.y, k);
    rootZ = mix(rootZ, hipZ, k);
    rootX *= 1 - k;
    pelvisRoll *= 1 - k;
    pelvisYaw *= 1 - k;
    chestRoll *= 1 - k;
    tailFloor = k > 0.5 ? hipY - 0.075 * hk : 0;
  }
  // sitting on the sand / a towel: leaning back on the hands, one knee up (or hugging the knees)
  const hug = hash(m.seed, 4.2) < 0.3;
  if (m.ground > 0) {
    const k = kGround;
    hipFlexL = mix(hipFlexL, hug ? 1.75 : 1.42, k);
    hipFlexR = mix(hipFlexR, hug ? 1.8 : 1.15, k);
    kneeL = mix(kneeL, hug ? 2.2 : 0.35, k);
    kneeR = mix(kneeR, hug ? 2.25 : 1.3, k);
    hipAbdL = mix(hipAbdL, 0.12, k);
    hipAbdR = mix(hipAbdR, 0.12, k);
    ankleL = mix(ankleL, hug ? 0.35 : -0.45, k);
    ankleR = mix(ankleR, hug ? 0.35 : 0.2, k);
    waistBend = mix(waistBend, hug ? 0.18 : -0.3, k);
    chestBend = mix(chestBend, hug ? 0.15 : 0.05, k);
    rootY = mix(rootY, 0.1 * hk - r.hip.y, k);
    rootX *= 1 - k;
    pelvisRoll *= 1 - k;
    pelvisYaw *= 1 - k;
  }
  // lying on the back (or on the front for some of variant 1)
  const front = m.lieVariant === 1 && hash(m.seed, 7.7) < 0.5;
  if (m.lie > 0) {
    const k = kLie;
    bodyPitch = (front ? Math.PI / 2 : -Math.PI / 2) * k;
    const kneeUp = m.lieVariant === 2;
    hipFlexL = mix(hipFlexL, kneeUp ? 0.95 : 0.0, k);
    kneeL = mix(kneeL, kneeUp ? 1.7 : 0.05, k);
    hipFlexR = mix(hipFlexR, -0.02, k);
    kneeR = mix(kneeR, front ? 0.3 : 0.05, k);
    ankleL = mix(ankleL, kneeUp ? 0.25 : -0.55, k);
    ankleR = mix(ankleR, -0.55, k);
    waistBend = mix(waistBend, front ? -0.08 : 0, k);
    chestBend = mix(chestBend, 0, k);
    headPitch = mix(headPitch, front ? -0.35 : -0.15, k);
    rootY = mix(rootY, (front ? 0.1 : 0.11) * hk - r.hip.y, k);
    headYaw = mix(headYaw, front ? 1.1 : headYaw * 0.3, k);
    pelvisRoll *= 1 - k;
    pelvisYaw *= 1 - k;
    rootX *= 1 - k;
    hipAbdL = mix(hipAbdL, 0.06, k);
    hipAbdR = mix(hipAbdR, 0.06, k);
  }
  if (seated > 0) {
    waistTwist *= upright;
    chestTwist *= upright;
    footYawL *= upright;
    footYawR *= upright;
  }
  // torso / legs so far (the arm IK below converts targets with this torso)
  o.waistBend = waistBend;
  o.waistTwist = waistTwist;
  o.chestBend = chestBend;
  o.chestTwist = chestTwist;
  o.chestRoll = chestRoll;
  o.pelvisYaw = pelvisYaw;
  o.pelvisRoll = pelvisRoll;
  o.bodyPitch = bodyPitch;
  o.rootX = rootX;
  o.rootY = rootY;
  o.rootZ = rootZ;
  o.hipFlexL = hipFlexL;
  o.hipFlexR = hipFlexR;
  o.kneeL = kneeL;
  o.kneeR = kneeR;
  o.hipAbdL = hipAbdL;
  o.hipAbdR = hipAbdR;
  o.ankleL = ankleL;
  o.ankleR = ankleR;

  // ── arms
  // standing idle variants (hands free, not walking)
  const idleK = (1 - gw) * upright;
  if (idleK > 0.01) {
    const iv = idleVariant(m, r, t);
    const k = iv.k * idleK;
    const hy = r.hip.y,
      wy = r.waist.y,
      cy = r.chest.y;
    const belly = 0.04 * Math.max(0, r.b) * hk;
    switch (iv.v) {
      case IDLE.POCKETS:
        if (handL) reach(r, armL, true, r.hip.x + 0.052 * hk, hy + 0.015 * hk, 0.065 * hk + belly, 1, -0.2, -0.6, k, 0.7);
        if (handR) reach(r, armR, false, -(r.hip.x + 0.052 * hk), hy + 0.015 * hk, 0.065 * hk + belly, -1, -0.2, -0.6, k, 0.7);
        break;
      case IDLE.CROSSED:
        if (handL && handR) {
          reach(r, armR, false, 0.1 * hk, cy - 0.035 * hk, 0.16 * hk + belly * 0.5, -1, -0.7, 0, k, 0.8);
          reach(r, armL, true, -0.11 * hk, cy - 0.075 * hk, 0.145 * hk + belly * 0.5, 1, -0.7, 0, k, 0.8);
        }
        break;
      case IDLE.HIP: {
        const left = hash(m.seed, 1.3) < 0.5;
        if (left && handL) reach(r, armL, true, 0.19 * hk + belly, wy - 0.03 * hk, 0.01, 1, 0.3, -0.5, k, 0.6);
        if (!left && handR) reach(r, armR, false, -0.19 * hk - belly, wy - 0.03 * hk, 0.01, -1, 0.3, -0.5, k, 0.6);
        break;
      }
      case IDLE.BEHIND:
        if (handL && handR) {
          reach(r, armL, true, 0.035 * hk, wy - 0.09 * hk, -0.17 * hk, 1, -0.4, 0.2, k, 0.5);
          reach(r, armR, false, -0.035 * hk, wy - 0.07 * hk, -0.175 * hk, -1, -0.4, 0.2, k, 0.5);
        }
        break;
      case IDLE.PHONE:
        if (handR) {
          reach(r, armR, false, -0.05 * hk, cy - 0.04 * hk, 0.25 * hk + belly * 0.5, -1, -1, -0.2, k, 0.6);
          headPitch = mix(headPitch, 0.42, k);
          if (k > 0.4) prop = PROP.PHONE;
          if (handL && hash(m.seed, 2.2) < 0.4) reach(r, armL, true, 0.01 * hk, cy - 0.07 * hk, 0.24 * hk + belly * 0.5, 1, -1, -0.2, k, 0.5);
        }
        break;
      case IDLE.CUP:
        if (handR) {
          reach(r, armR, false, -0.13 * hk, wy + 0.04 * hk, 0.2 * hk + belly, -1, -0.6, -0.4, k, 0.85);
          if (k > 0.3) prop = PROP.CUP;
        }
        break;
    }
  }
  // props held in the hands
  if (L.dog) {
    armL.flex = 0.42 + 0.12 * armL.flex;
    armL.elbow = 0.42;
    armL.abd = 0.13;
    armL.twist = 0;
    armL.grip = 1;
  }
  if (fl & F.SHOPBAG) {
    armR.flex *= 0.55;
    armR.abd = 0.1;
    armR.grip = 1;
  }
  if (fl & F.BRIEFCASE) {
    armL.flex *= 0.5;
    armL.abd = 0.1;
    armL.grip = 1;
  }
  if (fl & F.ROD) {
    armR.flex = 0.5;
    armR.elbow = 0.6;
    armL.flex = 0.7;
    armL.elbow = 0.95;
    armL.abd = -0.2;
    armL.grip = armR.grip = 1;
  }
  if (umbrella) {
    armR.flex = 0.55;
    armR.elbow = 1.25;
    armR.abd = 0.02;
    armR.twist = 0;
    armR.grip = 1;
  }
  // pram: both hands on the push bar (bar in the pusher frame, pram scaled like render.ts)
  if (L.pram && upright > 0.5) {
    const ps = Math.min(1.05, Math.max(0.95, L.scale)) / r.s;
    o.waistBend = waistBend += 0.07;
    reachFig(r, o, armL, true, 0.19 * ps, 1.0 * ps, 0.42 * ps, 0.7, -0.6, -0.5, 1, 1);
    reachFig(r, o, armR, false, -0.19 * ps, 1.0 * ps, 0.42 * ps, -0.7, -0.6, -0.5, 1, 1);
  }
  // cane: the right hand stays over the tip (planted with the left foot), cane nearly vertical
  if (fl & F.CANE && upright > 0.5) reachFig(r, o, armR, false, caneX + 0.02, 0.79 * hk, caneZ - 0.05, -1, -0.6, -0.4, 1, 1);
  // waving: upper arm raised to the side, forearm up, the hand waves from the elbow
  if (m.wave > 0) {
    const k = smooth(Math.min(1, m.wave)) * (1 - 0.5 * kLie);
    reach(r, armR, false, -0.34 * hk, r.shoulder.y + 0.33 * hk, 0.1 * hk, -1, -1, -0.25, k, 0);
    armR.twist += 0.4 * Math.sin(t * 15.7 + m.seed * 6) * k;
  }
  // bench: hands on the thighs / the newspaper / the backrest / the lap
  if (m.sit > 0.05) {
    const k = kSit;
    if (m.reading) {
      const cy = r.chest.y;
      reach(r, armL, true, 0.215 * hk, cy + 0.05 * hk, 0.345 * hk, 1, -1, -0.3, k, 0.9);
      reach(r, armR, false, -0.215 * hk, cy + 0.05 * hk, 0.345 * hk, -1, -1, -0.3, k, 0.9);
    } else {
      for (let li = 0; li < 2; li++) {
        const left = li === 0;
        const arm = left ? armL : armR;
        const free = left ? handL || (fl & F.BRIEFCASE) !== 0 : handR || (fl & (F.SHOPBAG | F.CANE)) !== 0;
        if (!free || (!left && m.wave > 0)) continue;
        // knee position (posed) → hand on top of the thigh near the knee
        v3.x = (left ? 1 : -1) * r.knee.x;
        v3.y = r.knee.y;
        v3.z = r.knee.z;
        fkPoint(r, o, left ? BONE.SHIN_L : BONE.SHIN_R, v3);
        let x = v3.x * 0.85,
          y = v3.y + 0.065 * hk,
          z = v3.z - 0.12 * hk;
        if (sv === 1) {
          // leaning forward: forearms on the thighs, hands between the knees
          x = v3.x * 0.25;
          y = v3.y + 0.03 * hk;
          z = v3.z - 0.02 * hk;
        } else if (sv === 4 || (old > 0.5 && sv !== 2)) {
          // hands folded in the lap
          x = (left ? 1 : -1) * 0.025 * hk;
          y = r.hip.y + rootY + 0.06 * hk;
          z = rootZ + 0.2 * hk;
        } else if (sv === 2 && !left) {
          // arm along the backrest
          reachFig(r, o, arm, false, -0.6 / r.s, (SEAT_TOP + 0.36) / r.s, (BACKREST_Z - 0.06) / r.s, -0.3, -0.4, -1, k, 0.4);
          continue;
        }
        reachFig(r, o, arm, left, x, y, z, left ? 1 : -1, -0.2, -0.6, k, 0.35);
      }
    }
  }
  // towel: hands planted behind on the ground (or around the knees)
  if (m.ground > 0.05 && m.lie < 0.5) {
    const k = kGround;
    for (let li = 0; li < 2; li++) {
      const left = li === 0;
      const arm = left ? armL : armR;
      const s = left ? 1 : -1;
      if (hug) {
        v3.x = s * r.knee.x;
        v3.y = r.knee.y;
        v3.z = r.knee.z;
        fkPoint(r, o, left ? BONE.SHIN_L : BONE.SHIN_R, v3);
        reachFig(r, o, arm, left, v3.x * 0.4, v3.y - 0.1 * hk, v3.z + 0.04 * hk, s, -0.3, -0.4, k, 0.8);
      } else reachFig(r, o, arm, left, s * 0.21 * hk, 0.03 * hk, -0.3 * hk, s, 0.1, 0.6, k, 0.2);
    }
  }
  // lying: hands behind the head (elbows out) / along the body / under the head (face down)
  if (m.lie > 0.05) {
    const k = kLie;
    if (m.lieVariant === 0) {
      reach(r, armL, true, 0.065 * hk, r.head.y + 0.1 * hk, r.head.z - 0.11 * hk, 1, 0.4, 0, k, 0.4);
      reach(r, armR, false, -0.065 * hk, r.head.y + 0.1 * hk, r.head.z - 0.11 * hk, -1, 0.4, 0, k, 0.4);
    } else if (front) {
      reach(r, armL, true, 0.12 * hk, r.head.y + 0.05 * hk, r.head.z + 0.16 * hk, 1, 0, -0.3, k, 0.3);
      reach(r, armR, false, -0.12 * hk, r.head.y + 0.02 * hk, r.head.z + 0.14 * hk, -1, 0, -0.3, k, 0.3);
    } else {
      for (let ai = 0; ai < 2; ai++) {
        const arm = ai === 0 ? armL : armR;
        arm.flex = mix(arm.flex, -0.04, k);
        arm.elbow = mix(arm.elbow, 0.1, k);
        arm.abd = mix(arm.abd, 0.16, k);
        arm.twist = mix(arm.twist, 0, k);
      }
    }
  }

  o.footYawL = footYawL;
  o.footYawR = footYawR;
  o.shFlexL = armL.flex;
  o.shFlexR = armR.flex;
  o.shAbdL = armL.abd;
  o.shAbdR = armR.abd;
  o.shTwistL = armL.twist;
  o.shTwistR = armR.twist;
  o.elbowL = armL.elbow;
  o.elbowR = armR.elbow;
  o.wristL = armL.wrist;
  o.wristR = armR.wrist;
  o.gripL = armL.grip;
  o.gripR = armR.grip;
  o.headYaw = headYaw;
  o.headPitch = headPitch;
  o.headRoll = headRoll;
  o.tailFloor = tailFloor;
  o.bagSwingL = -armL.flex * 0.3 * (1 - kSit);
  o.bagSwingR = -armR.flex * 0.3 * (1 - kSit);
  o.caneX = caneX;
  o.caneZ = caneZ;
  o.spare1 = prop;
  return o;
}
