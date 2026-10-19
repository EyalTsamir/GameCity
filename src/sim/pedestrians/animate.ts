// Pose of one figure from its crowd member state: walk / run / stand (gait.ts, planted feet), idle
// variants, bench sitting, sitting on the sand, lying, waving, pushing a pram, holding props. Hands
// that touch something (pram bar, cane, pockets, newspaper, thighs, ground) are placed with the arm
// IK (pose.ts armIK). Writes a Pose (pose.ts).

import type { Member } from './crowd';
import { F } from './figure';
import { gaitIn, gaitPose, newGaitOut, type GaitState, type IdleShift } from './gait';
import { AIK, armIKa, fkPoint, legIKa, LIK, toChestFrame, type ArmSolve, type LegSolve, type Pose } from './pose';
import type { Rig } from './rig';
import { BONE } from './body';

// (mix / smooth / clamp / hash are written out inline in this file: see computePoseA)

/** bench seat top above the seat spot (props/furniture.ts bench(): slats 0.45 ± 0.0175) */
export const SEAT_TOP = 0.467;
/** backrest surface behind the seat spot at hip height (m, negative = behind) */
export const BACKREST_Z = -0.3;

/** prop shown in a hand (pose.spare1): 0 none, 1 phone, 2 coffee cup, 3 newspaper (both hands) */
export const PROP = { NONE: 0, PHONE: 1, CUP: 2, PAPER: 3 } as const;

const leg: LegSolve = { flex: 0.5, knee: 0.5, ankle: 0.5, reached: true };
const G = newGaitOut();
const idle: IdleShift = { sway: 0.5, roll: 0.5, yaw: 0.5, drop: 0.5 };
const ik: ArmSolve = { flex: 0.5, abd: 0.5, twist: 0.5, elbow: 0.5, reached: true };
const v3 = { x: 0.5, y: 0.5, z: 0.5 };

/** the arm values computePose works with */
interface Arm {
  flex: number;
  abd: number;
  twist: number;
  elbow: number;
  wrist: number;
  grip: number;
}
const armL: Arm = { flex: 0.5, abd: 0.5, twist: 0.5, elbow: 0.5, wrist: 0.5, grip: 0.5 };
const armR: Arm = { flex: 0.5, abd: 0.5, twist: 0.5, elbow: 0.5, wrist: 0.5, grip: 0.5 };

// reach / reachFig target and weight [x, y, z, k]: written by the caller (computed doubles passed as
// arguments to a call that is not inlined are boxed — 16 B of garbage each; typed-array slots are not)
const RT = new Float64Array(4);

/** blend an arm towards an IK solution for the grip target RT (chest rest frame), weight RT[3] */
function reach(r: Rig, a: Arm, left: boolean, px: number, py: number, pz: number, grip: number): void {
  const k = RT[3];
  if (k <= 0.001) return;
  AIK[0] = RT[0];
  AIK[1] = RT[1];
  AIK[2] = RT[2];
  AIK[3] = px;
  AIK[4] = py;
  AIK[5] = pz;
  armIKa(r, left, ik);
  a.flex = (a.flex + (ik.flex - a.flex) * k);
  a.abd = (a.abd + (ik.abd - a.abd) * k);
  a.twist = (a.twist + (ik.twist - a.twist) * k);
  a.elbow = (a.elbow + (ik.elbow - a.elbow) * k);
  a.wrist = (a.wrist + (0 - a.wrist) * k);
  a.grip = (a.grip + (grip - a.grip) * k);
}

/** blend an arm towards a figure-frame grip target RT (converted with the current torso pose in o) */
function reachFig(r: Rig, o: Pose, a: Arm, left: boolean, px: number, py: number, pz: number, grip: number): void {
  if (RT[3] <= 0.001) return;
  v3.x = RT[0];
  v3.y = RT[1];
  v3.z = RT[2];
  toChestFrame(r, o, v3);
  RT[0] = v3.x;
  RT[1] = v3.y;
  RT[2] = v3.z;
  reach(r, a, left, px, py, pz, grip);
}

const IDLE = { RELAXED: 0, POCKETS: 1, CROSSED: 2, HIP: 3, BEHIND: 4, PHONE: 5, CUP: 6 } as const;
/** debug / tools: force an idle variant (0–6) or bench variant (0–4); −1 = by seed */
export const poseDebug = { idle: -1, bench: -1 };

const IDLE_W_OLD = [0.38, 0.1, 0.12, 0.05, 0.33, 0, 0.02];
const IDLE_W_KID = [0.6, 0.12, 0.1, 0.1, 0.08, 0, 0];
const IDLE_W_ADULT = [0.3, 0.15, 0.12, 0.08, 0.04, 0.23, 0.08];
const IDLE_W_MID = [0.3, 0.15, 0.12, 0.08, 0.04, 0.07, 0.08];
const iv = { v: 0, k: 0.5 };

/** idle variant of a standing figure: chosen per person and time window, held 6–18 s */
function idleVariant(m: Member, r: Rig): typeof iv {
  const t = poseIn.t;
  if (poseDebug.idle >= 0) {
    iv.v = poseDebug.idle;
    iv.k = 1;
    return iv;
  }
  let hv = Math.sin(m.seed * 127.1 + 3.1 * 311.7) * 43758.5453;
  const period = 6 + 12 * (hv - Math.floor(hv));
  const tt = t + m.seed * 97;
  const epoch = Math.floor(tt / period);
  const tin = tt - epoch * period;
  const k0 = Math.min(Math.max(tin / 0.8, 0), 1),
    k1 = Math.min(Math.max((period - tin) / 0.8, 0), 1);
  iv.k = k0 * k0 * (3 - 2 * k0) * (k1 * k1 * (3 - 2 * k1));
  hv = Math.sin(m.seed * 127.1 + (epoch + 0.5) * 311.7) * 43758.5453;
  const h = hv - Math.floor(hv);
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
  poseIn.t = t;
  return computePoseA(m, umbrella, r, o, gs, frame);
}
/** computePoseA's time input (s): a field, as a computed double argument would be boxed per call */
export const poseIn = { t: 0.5 };
/** computePose with the time in poseIn.t (the renderer's per-figure path: no garbage) */
export function computePoseA(m: Member, umbrella: boolean, r: Rig, o: Pose, gs: GaitState | null, frame: number): Pose {
  const t = poseIn.t;
  const L = m.look;
  const a = m.amp;
  const old = r.old;
  const hk = r.stature / r.s / 1.76; // figure size relative to the average man (unscaled)
  const seated = Math.max(m.sit, m.lie, m.ground);
  // (no helper calls in here: TurboFan leaves calls in rarely taken branches un-inlined, and those box their
  // double arguments and results — garbage per figure per frame; mix / smooth / hash are written out)
  const s2 = Math.min(1, seated * 2),
    ga = Math.min(Math.max(a / 0.14, 0), 1),
    ms = Math.min(1, m.sit),
    mg = Math.min(1, m.ground),
    ml = Math.min(1, m.lie);
  const upright = 1 - s2 * s2 * (3 - 2 * s2);
  const gw = ga * ga * (3 - 2 * ga);
  const kSit = ms * ms * (3 - 2 * ms);
  const kGround = mg * mg * (3 - 2 * mg);
  const kLie = ml * ml * (3 - 2 * ml);
  let hv = 0.5; // hash scratch

  // ── idle weight shift (contrapposto: pelvis list + sway onto one leg), passed into the gait
  const ph = t * 0.32 + m.seed * 40;
  const w = Math.sin(ph) * 0.85 + 0.15 * Math.sin(ph * 2.3);
  idle.sway = 0.02 * hk * w;
  idle.roll = 0.055 * w;
  idle.yaw = 0.035 * Math.sin(ph * 0.7);
  idle.drop = 0.006 * hk * Math.abs(w);

  // ── legs, pelvis and the gait part of the upper body
  gaitIn.t = t;
  gaitIn.gw = gw;
  gaitPose(m, r, gs, frame, idle, G);
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
  armL.flex = ((0.08 + 0.06 * old + 0.03 * Math.sin(t * 0.6 + m.seed * 3)) + (G.shFlexL - (0.08 + 0.06 * old + 0.03 * Math.sin(t * 0.6 + m.seed * 3))) * gw);
  armR.flex = ((0.08 + 0.06 * old + 0.03 * Math.sin(t * 0.52 + m.seed * 5)) + (G.shFlexR - (0.08 + 0.06 * old + 0.03 * Math.sin(t * 0.52 + m.seed * 5))) * gw);
  armL.elbow = ((0.3 + 0.15 * old) + (G.elbowL - (0.3 + 0.15 * old)) * gw);
  armR.elbow = ((0.3 + 0.15 * old) + (G.elbowR - (0.3 + 0.15 * old)) * gw);
  armL.abd = (0.07 + (G.shAbdL - 0.07) * gw);
  armR.abd = (0.07 + (G.shAbdR - 0.07) * gw);
  armL.twist = armR.twist = 0;
  armL.wrist = armR.wrist = 0;
  armL.grip = armR.grip = 0.15;
  let tailFloor = 0;
  const caneX = G.caneX,
    caneZ = (0.2 + (G.caneZ - 0.2) * gw);
  let prop: number = PROP.NONE;

  const fl = L.flags;
  const handL = !(L.pram || L.dog || fl & (F.BRIEFCASE | F.ROD));
  const handR = !(L.pram || umbrella || m.wave > 0 || fl & (F.SHOPBAG | F.CANE | F.ROD));

  // sitting on a bench: pelvis back against the backrest, thighs on the seat, feet on the ground
  const sv = poseDebug.bench >= 0 ? poseDebug.bench : Math.floor(((hv = Math.sin(m.seed * 127.1 + 9.7 * 311.7) * 43758.5453) - Math.floor(hv)) * 5); // bench variant
  if (m.sit > 0) {
    const k = kSit;
    const sc = r.s;
    const hipY = (SEAT_TOP + 0.088 * hk * sc) / sc; // hip joint above the root (figure units)
    const hipZ = (BACKREST_Z + 0.125 * hk * sc) / sc;
    const az = hipZ + r.thighL * 0.98 + 0.03;
    LIK[0] = hipY;
    LIK[1] = hipZ;
    LIK[2] = r.ankle.y;
    LIK[3] = az;
    LIK[4] = 0;
    legIKa(r, leg);
    hipFlexL = (hipFlexL + (leg.flex - hipFlexL) * k);
    kneeL = (kneeL + (leg.knee - kneeL) * k);
    ankleL = (ankleL + (leg.ankle - ankleL) * k);
    LIK[3] = az - 0.04;
    legIKa(r, leg);
    hipFlexR = (hipFlexR + (leg.flex - hipFlexR) * k);
    kneeR = (kneeR + (leg.knee - kneeR) * k);
    ankleR = (ankleR + (leg.ankle - ankleR) * k);
    const crossed = sv === 3 && r.c < 0.4;
    if (crossed) {
      // right thigh over the left knee
      hipFlexR = (hipFlexR + (hipFlexL + 0.32 - hipFlexR) * k);
      hipAbdR = (hipAbdR + (-0.32 - hipAbdR) * k);
      kneeR = (kneeR + (1.15 - kneeR) * k);
      ankleR = (ankleR + (-0.35 - ankleR) * k);
    } else {
      hipAbdL = (hipAbdL + (0.06 - hipAbdL) * k);
      hipAbdR = (hipAbdR + (0.06 - hipAbdR) * k);
    }
    const lean = sv === 1 && !m.reading && m.cafe === 0;
    // at a café table people sit up, a little forward, towards the table
    const cafeLean = m.cafe > 0 ? (m.reading ? -0.02 : 0.07) : 0;
    waistBend = (waistBend + ((m.cafe > 0 ? cafeLean : m.reading ? -0.1 : lean ? 0.25 : -0.19) - waistBend) * k);
    chestBend = (chestBend + ((lean ? 0.12 : 0.05 + 0.15 * old) - chestBend) * k);
    headPitch = (headPitch + ((m.reading ? 0.2 : lean ? -0.25 : m.cafe > 0 ? 0.12 : 0.05) - headPitch) * k);
    rootY = (rootY + (hipY - r.hip.y - rootY) * k);
    rootZ = (rootZ + (hipZ - rootZ) * k);
    rootX *= 1 - k;
    pelvisRoll *= 1 - k;
    pelvisYaw *= 1 - k;
    chestRoll *= 1 - k;
    tailFloor = k > 0.5 ? hipY - 0.075 * hk : 0;
  }
  // sitting on the sand / a towel: leaning back on the hands, one knee up (or hugging the knees)
  const hug = (hv = Math.sin(m.seed * 127.1 + 4.2 * 311.7) * 43758.5453) - Math.floor(hv) < 0.3;
  if (m.ground > 0) {
    const k = kGround;
    hipFlexL = (hipFlexL + ((hug ? 1.75 : 1.42) - hipFlexL) * k);
    hipFlexR = (hipFlexR + ((hug ? 1.8 : 1.15) - hipFlexR) * k);
    kneeL = (kneeL + ((hug ? 2.2 : 0.35) - kneeL) * k);
    kneeR = (kneeR + ((hug ? 2.25 : 1.3) - kneeR) * k);
    hipAbdL = (hipAbdL + (0.12 - hipAbdL) * k);
    hipAbdR = (hipAbdR + (0.12 - hipAbdR) * k);
    ankleL = (ankleL + ((hug ? 0.35 : -0.45) - ankleL) * k);
    ankleR = (ankleR + ((hug ? 0.35 : 0.2) - ankleR) * k);
    waistBend = (waistBend + ((hug ? 0.18 : -0.3) - waistBend) * k);
    chestBend = (chestBend + ((hug ? 0.15 : 0.05) - chestBend) * k);
    rootY = (rootY + (0.1 * hk - r.hip.y - rootY) * k);
    rootX *= 1 - k;
    pelvisRoll *= 1 - k;
    pelvisYaw *= 1 - k;
  }
  // lying on the back (or on the front for some of variant 1)
  const front = m.lieVariant === 1 && (hv = Math.sin(m.seed * 127.1 + 7.7 * 311.7) * 43758.5453) - Math.floor(hv) < 0.5;
  if (m.lie > 0) {
    const k = kLie;
    bodyPitch = (front ? Math.PI / 2 : -Math.PI / 2) * k;
    const kneeUp = m.lieVariant === 2;
    hipFlexL = (hipFlexL + ((kneeUp ? 0.95 : 0.0) - hipFlexL) * k);
    kneeL = (kneeL + ((kneeUp ? 1.7 : 0.05) - kneeL) * k);
    hipFlexR = (hipFlexR + (-0.02 - hipFlexR) * k);
    kneeR = (kneeR + ((front ? 0.3 : 0.05) - kneeR) * k);
    ankleL = (ankleL + ((kneeUp ? 0.25 : -0.55) - ankleL) * k);
    ankleR = (ankleR + (-0.55 - ankleR) * k);
    waistBend = (waistBend + ((front ? -0.08 : 0) - waistBend) * k);
    chestBend = (chestBend + (0 - chestBend) * k);
    headPitch = (headPitch + ((front ? -0.35 : -0.15) - headPitch) * k);
    rootY = (rootY + (((front ? 0.1 : 0.11) * hk - r.hip.y) - rootY) * k);
    headYaw = (headYaw + ((front ? 1.1 : headYaw * 0.3) - headYaw) * k);
    pelvisRoll *= 1 - k;
    pelvisYaw *= 1 - k;
    rootX *= 1 - k;
    hipAbdL = (hipAbdL + (0.06 - hipAbdL) * k);
    hipAbdR = (hipAbdR + (0.06 - hipAbdR) * k);
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
    const iv = idleVariant(m, r);
    const k = iv.k * idleK;
    const hy = r.hip.y,
      wy = r.waist.y,
      cy = r.chest.y;
    const belly = 0.04 * Math.max(0, r.b) * hk;
    switch (iv.v) {
      case IDLE.POCKETS:
        if (handL) {
          RT[0] = r.hip.x + 0.052 * hk;
          RT[1] = hy + 0.015 * hk;
          RT[2] = 0.065 * hk + belly;
          RT[3] = k;
          reach(r, armL, true, 1, -0.2, -0.6, 0.7);
        }
        if (handR) {
          RT[0] = -(r.hip.x + 0.052 * hk);
          RT[1] = hy + 0.015 * hk;
          RT[2] = 0.065 * hk + belly;
          RT[3] = k;
          reach(r, armR, false, -1, -0.2, -0.6, 0.7);
        }
        break;
      case IDLE.CROSSED:
        if (handL && handR) {
          RT[0] = 0.1 * hk;
          RT[1] = cy - 0.035 * hk;
          RT[2] = 0.16 * hk + belly * 0.5;
          RT[3] = k;
          reach(r, armR, false, -1, -0.7, 0, 0.8);
          RT[0] = -0.11 * hk;
          RT[1] = cy - 0.075 * hk;
          RT[2] = 0.145 * hk + belly * 0.5;
          RT[3] = k;
          reach(r, armL, true, 1, -0.7, 0, 0.8);
        }
        break;
      case IDLE.HIP: {
        const left = (hv = Math.sin(m.seed * 127.1 + 1.3 * 311.7) * 43758.5453) - Math.floor(hv) < 0.5;
        if (left && handL) {
          RT[0] = 0.19 * hk + belly;
          RT[1] = wy - 0.03 * hk;
          RT[2] = 0.01;
          RT[3] = k;
          reach(r, armL, true, 1, 0.3, -0.5, 0.6);
        }
        if (!left && handR) {
          RT[0] = -0.19 * hk - belly;
          RT[1] = wy - 0.03 * hk;
          RT[2] = 0.01;
          RT[3] = k;
          reach(r, armR, false, -1, 0.3, -0.5, 0.6);
        }
        break;
      }
      case IDLE.BEHIND:
        if (handL && handR) {
          RT[0] = 0.035 * hk;
          RT[1] = wy - 0.09 * hk;
          RT[2] = -0.17 * hk;
          RT[3] = k;
          reach(r, armL, true, 1, -0.4, 0.2, 0.5);
          RT[0] = -0.035 * hk;
          RT[1] = wy - 0.07 * hk;
          RT[2] = -0.175 * hk;
          RT[3] = k;
          reach(r, armR, false, -1, -0.4, 0.2, 0.5);
        }
        break;
      case IDLE.PHONE:
        if (handR) {
          RT[0] = -0.05 * hk;
          RT[1] = cy - 0.04 * hk;
          RT[2] = 0.25 * hk + belly * 0.5;
          RT[3] = k;
          reach(r, armR, false, -1, -1, -0.2, 0.6);
          headPitch = (headPitch + (0.42 - headPitch) * k);
          if (k > 0.4) prop = PROP.PHONE;
          if (handL && (hv = Math.sin(m.seed * 127.1 + 2.2 * 311.7) * 43758.5453) - Math.floor(hv) < 0.4) {
            RT[0] = 0.01 * hk;
            RT[1] = cy - 0.07 * hk;
            RT[2] = 0.24 * hk + belly * 0.5;
            RT[3] = k;
            reach(r, armL, true, 1, -1, -0.2, 0.5);
          }
        }
        break;
      case IDLE.CUP:
        if (handR) {
          RT[0] = -0.13 * hk;
          RT[1] = wy + 0.04 * hk;
          RT[2] = 0.2 * hk + belly;
          RT[3] = k;
          reach(r, armR, false, -1, -0.6, -0.4, 0.85);
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
    RT[0] = 0.19 * ps;
    RT[1] = 1.0 * ps;
    RT[2] = 0.42 * ps;
    RT[3] = 1;
    reachFig(r, o, armL, true, 0.7, -0.6, -0.5, 1);
    RT[0] = -0.19 * ps;
    RT[1] = 1.0 * ps;
    RT[2] = 0.42 * ps;
    RT[3] = 1;
    reachFig(r, o, armR, false, -0.7, -0.6, -0.5, 1);
  }
  // cane: the right hand stays over the tip (planted with the left foot), cane nearly vertical
  if (fl & F.CANE && upright > 0.5) {
    RT[0] = caneX + 0.02;
    RT[1] = 0.79 * hk;
    RT[2] = caneZ - 0.05;
    RT[3] = 1;
    reachFig(r, o, armR, false, -1, -0.6, -0.4, 1);
  }
  // waving: upper arm raised to the side, forearm up, the hand waves from the elbow
  if (m.wave > 0) {
    const mw = Math.min(1, m.wave);
    const k = mw * mw * (3 - 2 * mw) * (1 - 0.5 * kLie);
    RT[0] = -0.34 * hk;
    RT[1] = r.shoulder.y + 0.33 * hk;
    RT[2] = 0.1 * hk;
    RT[3] = k;
    reach(r, armR, false, -1, -1, -0.25, 0);
    armR.twist += 0.4 * Math.sin(t * 15.7 + m.seed * 6) * k;
  }
  // café table: forearms on the table, cup / fork / phone / newspaper, talking with the hands
  if (m.sit > 0.05 && m.cafe > 0) {
    const k = kSit;
    const sc = r.s;
    const tH = m.tabH / sc,
      tD = m.tabD / sc;
    // activity epochs (3–9 s) per patron; a party shares one conversation clock (who is speaking)
    const tg = t - m.seed * 10; // the renderer adds seed·10 to the time
    hv = Math.sin(m.seed * 91.7 + 1.9) * 43758.5453;
    const per = 3 + 6 * (hv - Math.floor(hv));
    const tt = tg + m.seed * 53;
    const ep = Math.floor(tt / per);
    const tin = tt - ep * per;
    const e0 = Math.min(Math.max(tin / 0.7, 0), 1),
      e1 = Math.min(Math.max((per - tin) / 0.7, 0), 1);
    const ek = e0 * e0 * (3 - 2 * e0) * (e1 * e1 * (3 - 2 * e1));
    hv = Math.sin(m.seed * 127.1 + (ep + 0.5) * 311.7) * 43758.5453;
    const hr = hv - Math.floor(hv);
    // conversation turn (party-wide): 4–7 s turns, the speaker is one member
    const pid = m.party.id;
    const turn = Math.floor((tg + pid * 7.3) / 5.5);
    hv = Math.sin(pid * 12.9898 + turn * 78.233) * 43758.5453;
    const n = m.party.members.length;
    const speaking = n > 1 && Math.floor((hv - Math.floor(hv)) * n) === m.idx;
    // activity: 0 rest (forearms on the table), 1 talk, 2 sip, 3 hold cup, 4 eat, 5 phone, 6 read, 7 lean back
    let act = 0;
    const prof = m.cafe;
    if (prof === 3) act = hr < 0.78 ? 6 : hr < 0.9 ? 2 : 0;
    else if (prof === 4) act = hr < 0.6 ? 5 : hr < 0.8 ? 2 : 3;
    else if (m.meal && hr < 0.5) act = speaking && hr < 0.15 ? 1 : 4;
    else if (prof === 1) act = speaking ? (hr < 0.82 ? 1 : 2) : hr < 0.45 ? 0 : hr < 0.7 ? 3 : hr < 0.85 ? 2 : 7;
    else if (prof === 5) act = hr < 0.35 ? 7 : hr < 0.65 ? 3 : hr < 0.8 ? 2 : 0;
    else act = speaking ? 1 : hr < 0.35 ? 3 : hr < 0.6 ? 2 : hr < 0.8 ? 0 : 7;
    const ak = ek * k;
    // head: towards the companion while talking / listening, down to the paper / phone / plate
    if (n > 1 && act !== 5 && act !== 6) headYaw = (headYaw + (m.talkYaw * (speaking ? 0.85 : 0.7) - headYaw) * k);
    if (act === 0 || act === 3) headPitch += 0.04 * Math.sin(tg * 2.3 + m.seed * 9) * k * (speaking ? 0 : 1); // nods
    if (act === 5) headPitch = (headPitch + (0.45 - headPitch) * ak);
    if (act === 4) headPitch = (headPitch + (0.3 - headPitch) * ak * 0.6);
    if (act === 7) {
      o.waistBend = waistBend = (waistBend + (-0.16 - waistBend) * ak);
      headPitch = (headPitch + (-0.02 - headPitch) * ak);
    }
    // laughing now and then (talkers): head back for a moment
    hv = Math.sin(m.seed * 33.3 + Math.floor(tg / 2.1) * 17.17) * 43758.5453;
    if (prof === 1 && !speaking && hv - Math.floor(hv) < 0.06) headPitch -= 0.22 * k;
    // base: both forearms on the table edge, hands a little in from the edge
    for (let li = 0; li < 2; li++) {
      const left = li === 0;
      const arm = left ? armL : armR;
      const free = left ? handL || (fl & F.BRIEFCASE) !== 0 : handR || (fl & (F.SHOPBAG | F.CANE)) !== 0;
      if (!free) continue;
      RT[0] = (left ? 0.15 : -0.15) * hk;
      RT[1] = tH + 0.035 / sc;
      RT[2] = tD + 0.13 / sc;
      RT[3] = k;
      reachFig(r, o, arm, left, left ? 1 : -1, -0.6, -0.3, 0.3);
    }
    if (act === 6) {
      // newspaper held open above the table
      const cy = r.chest.y;
      RT[0] = 0.215 * hk;
      RT[1] = cy + 0.06 * hk;
      RT[2] = 0.36 * hk;
      RT[3] = ak;
      reach(r, armL, true, 1, -1, -0.3, 0.9);
      RT[0] = -0.215 * hk;
      RT[1] = cy + 0.06 * hk;
      RT[2] = 0.36 * hk;
      RT[3] = ak;
      reach(r, armR, false, -1, -1, -0.3, 0.9);
      if (ak > 0.3) prop = PROP.PAPER;
    } else if (act === 5 && handR) {
      // phone in front of the chest, elbows on the table
      RT[0] = -0.05 * hk;
      RT[1] = r.chest.y - 0.06 * hk;
      RT[2] = 0.27 * hk;
      RT[3] = ak;
      reach(r, armR, false, -1, -1, -0.2, 0.6);
      if (ak > 0.4) prop = PROP.PHONE;
    } else if ((act === 2 || act === 3) && handR) {
      // cup: on the table (hand round it) or lifted to the mouth (2 s sips)
      const ph = (tg * 0.45 + m.seed * 3) % 1;
      const up = act === 2 ? (ph < 0.3 ? ph / 0.3 : ph < 0.55 ? 1 : ph < 0.8 ? 1 - (ph - 0.55) / 0.25 : 0) : 0;
      const u = up * up * (3 - 2 * up);
      RT[0] = -0.11 * hk;
      RT[1] = tH + 0.05 / sc;
      RT[2] = tD + 0.17 / sc;
      RT[3] = ak;
      reachFig(r, o, armR, false, -1, -0.6, -0.2, 0.85);
      if (u > 0.01) {
        // chest rest frame: in front of the mouth
        RT[0] = -0.035 * hk;
        RT[1] = r.head.y + 0.0 * hk;
        RT[2] = r.head.z + 0.13 * hk;
        RT[3] = ak * u;
        reach(r, armR, false, -1, -1, -0.3, 0.85);
        headPitch -= 0.12 * u * ak;
      }
      if (ak > 0.3) prop = PROP.CUP;
    } else if (act === 4 && handR) {
      // eating: fork from the plate to the mouth every ~3 s, the other hand on the table
      const ph = (tg * 0.33 + m.seed * 5) % 1;
      const up = ph < 0.45 ? 0 : ph < 0.6 ? (ph - 0.45) / 0.15 : ph < 0.75 ? 1 : ph < 0.9 ? 1 - (ph - 0.75) / 0.15 : 0;
      const u = up * up * (3 - 2 * up);
      RT[0] = -0.07 * hk;
      RT[1] = tH + 0.06 / sc;
      RT[2] = tD + 0.2 / sc;
      RT[3] = ak;
      reachFig(r, o, armR, false, -1, -0.6, -0.2, 0.7);
      if (u > 0.01) {
        RT[0] = -0.03 * hk;
        RT[1] = r.head.y - 0.01 * hk;
        RT[2] = r.head.z + 0.12 * hk;
        RT[3] = ak * u;
        reach(r, armR, false, -1, -1, -0.3, 0.7);
      }
      if (handL) {
        RT[0] = 0.08 * hk;
        RT[1] = tH + 0.05 / sc;
        RT[2] = tD + 0.18 / sc;
        RT[3] = ak;
        reachFig(r, o, armL, true, 1, -0.6, -0.2, 0.7);
      }
    } else if (act === 1) {
      // talking with one hand: forearm up, the hand moving from the elbow
      const left = (m.seed * 7.31) % 1 < 0.3 ? handL : false;
      const arm = left ? armL : armR;
      if (left || handR) {
        const s = left ? 1 : -1;
        const g1 = Math.sin(tg * 2.7 + m.seed * 11),
          g2 = Math.sin(tg * 4.1 + m.seed * 5);
        RT[0] = s * (0.13 + 0.04 * g1) * hk;
        RT[1] = r.chest.y - (0.07 - 0.05 * g2) * hk;
        RT[2] = (0.3 + 0.04 * g1) * hk;
        RT[3] = ak;
        reach(r, arm, left, s, -1, -0.4, 0.25);
        arm.twist += 0.35 * g2 * ak;
        arm.wrist += 0.3 * g1 * ak;
      }
    } else if (act === 7 && handL && handR) {
      // leaning back, arms crossed
      const cy = r.chest.y;
      RT[0] = 0.1 * hk;
      RT[1] = cy - 0.05 * hk;
      RT[2] = 0.17 * hk;
      RT[3] = ak;
      reach(r, armR, false, -1, -0.7, 0, 0.8);
      RT[0] = -0.11 * hk;
      RT[1] = cy - 0.09 * hk;
      RT[2] = 0.155 * hk;
      RT[3] = ak;
      reach(r, armL, true, 1, -0.7, 0, 0.8);
    }
  }
  // bench: hands on the thighs / the newspaper / the backrest / the lap
  if (m.sit > 0.05 && m.cafe === 0) {
    const k = kSit;
    if (m.reading) {
      const cy = r.chest.y;
      RT[0] = 0.215 * hk;
      RT[1] = cy + 0.05 * hk;
      RT[2] = 0.345 * hk;
      RT[3] = k;
      reach(r, armL, true, 1, -1, -0.3, 0.9);
      RT[0] = -0.215 * hk;
      RT[1] = cy + 0.05 * hk;
      RT[2] = 0.345 * hk;
      RT[3] = k;
      reach(r, armR, false, -1, -1, -0.3, 0.9);
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
          RT[0] = -0.6 / r.s;
          RT[1] = (SEAT_TOP + 0.36) / r.s;
          RT[2] = (BACKREST_Z - 0.06) / r.s;
          RT[3] = k;
          reachFig(r, o, arm, false, -0.3, -0.4, -1, 0.4);
          continue;
        }
        RT[0] = x;
        RT[1] = y;
        RT[2] = z;
        RT[3] = k;
        reachFig(r, o, arm, left, left ? 1 : -1, -0.2, -0.6, 0.35);
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
        RT[0] = v3.x * 0.4;
        RT[1] = v3.y - 0.1 * hk;
        RT[2] = v3.z + 0.04 * hk;
        RT[3] = k;
        reachFig(r, o, arm, left, s, -0.3, -0.4, 0.8);
      } else {
        RT[0] = s * 0.21 * hk;
        RT[1] = 0.03 * hk;
        RT[2] = -0.3 * hk;
        RT[3] = k;
        reachFig(r, o, arm, left, s, 0.1, 0.6, 0.2);
      }
    }
  }
  // lying: hands behind the head (elbows out) / along the body / under the head (face down)
  if (m.lie > 0.05) {
    const k = kLie;
    if (m.lieVariant === 0) {
      RT[0] = 0.065 * hk;
      RT[1] = r.head.y + 0.1 * hk;
      RT[2] = r.head.z - 0.11 * hk;
      RT[3] = k;
      reach(r, armL, true, 1, 0.4, 0, 0.4);
      RT[0] = -0.065 * hk;
      RT[1] = r.head.y + 0.1 * hk;
      RT[2] = r.head.z - 0.11 * hk;
      RT[3] = k;
      reach(r, armR, false, -1, 0.4, 0, 0.4);
    } else if (front) {
      RT[0] = 0.12 * hk;
      RT[1] = r.head.y + 0.05 * hk;
      RT[2] = r.head.z + 0.16 * hk;
      RT[3] = k;
      reach(r, armL, true, 1, 0, -0.3, 0.3);
      RT[0] = -0.12 * hk;
      RT[1] = r.head.y + 0.02 * hk;
      RT[2] = r.head.z + 0.14 * hk;
      RT[3] = k;
      reach(r, armR, false, -1, 0, -0.3, 0.3);
    } else {
      for (let ai = 0; ai < 2; ai++) {
        const arm = ai === 0 ? armL : armR;
        arm.flex = (arm.flex + (-0.04 - arm.flex) * k);
        arm.elbow = (arm.elbow + (0.1 - arm.elbow) * k);
        arm.abd = (arm.abd + (0.16 - arm.abd) * k);
        arm.twist = (arm.twist + (0 - arm.twist) * k);
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
  // ponytail (pose spare2): swings sideways with the pelvis sway, lagging it; a slow sway when standing
  o.spare2 = upright * (gw * (0.16 + 0.12 * G.run) * Math.min(1.3, a) * Math.sin(m.phase - 1.3) + (1 - gw) * 0.05 * Math.sin(t * 0.9 + m.seed * 17));
  return o;
}
