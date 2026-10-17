// Pose of one figure from its crowd member state: walk / run / stand (gait.ts, planted feet), bench
// sitting, sitting on the sand, lying, waving, pushing a pram, holding props. Writes a Pose (pose.ts).

import type { Member } from './crowd';
import { F } from './figure';
import { gaitPose, newGaitOut, type GaitState, type IdleShift } from './gait';
import { legIK, type LegSolve, type Pose } from './pose';
import type { Rig } from './rig';

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** bench seat top above the seat spot (props/furniture.ts bench(): slats 0.45 ± 0.0175) */
export const SEAT_TOP = 0.467;
/** backrest surface behind the seat spot at hip height (m, negative = behind) */
export const BACKREST_Z = -0.3;

const leg: LegSolve = { flex: 0, knee: 0, ankle: 0, reached: true };
const G = newGaitOut();
const idle: IdleShift = { sway: 0, roll: 0, yaw: 0, drop: 0 };

export function computePose(m: Member, t: number, umbrella: boolean, r: Rig, o: Pose, gs: GaitState | null = null, frame = 0): Pose {
  const L = m.look;
  const a = m.amp;
  const old = r.old;
  const hk = r.stature / r.s / 1.76; // figure size relative to the average man (unscaled)
  const seated = Math.max(m.sit, m.lie, m.ground);
  const upright = 1 - smooth(Math.min(1, seated * 2));
  const gw = smooth(clamp(a / 0.14, 0, 1));

  // ── idle weight shift (slow, per person), passed into the gait so planted feet stay put
  const ph = t * 0.42 + m.seed * 40;
  const w = Math.sin(ph) * 0.8 + 0.2 * Math.sin(ph * 2.3);
  idle.sway = 0.016 * hk * w;
  idle.roll = 0.035 * w;
  idle.yaw = 0.03 * Math.sin(ph * 0.7);
  idle.drop = 0.004 * hk * Math.abs(w);

  // ── legs, pelvis and the gait part of the upper body
  gaitPose(m, r, gs, frame, t, gw, idle, G);
  let hipFlexL = G.hipFlexL,
    hipFlexR = G.hipFlexR;
  let kneeL = G.kneeL,
    kneeR = G.kneeR;
  let ankleL = G.ankleL,
    ankleR = G.ankleR;
  const hipAbdL = G.hipAbdL,
    hipAbdR = G.hipAbdR;
  let footYawL = G.footYawL,
    footYawR = G.footYawR;
  let rootX = G.rootX;
  let rootY = G.rootY;
  let rootZ = 0;
  let pelvisYaw = G.pelvisYaw,
    pelvisRoll = G.pelvisRoll;
  let bodyPitch = 0;
  // upper body: elderly stoop (thoracic) with the head brought forward, soft shoulders
  let waistBend = 0.015 + 0.04 * old + G.waistBend;
  let waistTwist = G.waistTwist;
  let chestBend = 0.24 * old + 0.05 * G.run;
  let chestTwist = G.chestTwist;
  let chestRoll = -0.45 * pelvisRoll * (1 - gw);
  let headPitch = -0.2 * old + G.headPitch;
  let headYaw = m.headYaw + G.headYawCorr;
  let headRoll = 0;
  // arms: walking swing from the gait, relaxed and slightly forward when standing
  let shFlexL = mix(0.06 + 0.06 * old + 0.03 * Math.sin(t * 0.6 + m.seed * 3), G.shFlexL, gw),
    shFlexR = mix(0.06 + 0.06 * old + 0.03 * Math.sin(t * 0.52 + m.seed * 5), G.shFlexR, gw);
  let elbowL = mix(0.26 + 0.15 * old, G.elbowL, gw),
    elbowR = mix(0.26 + 0.15 * old, G.elbowR, gw);
  let shAbdL = mix(0.07, G.shAbdL, gw),
    shAbdR = mix(0.07, G.shAbdR, gw);
  let shTwistL = 0,
    shTwistR = 0;
  let gripL = 0.15,
    gripR = 0.15;
  let wristL = 0,
    wristR = 0;
  let tailFloor = 0;
  let caneX = G.caneX,
    caneZ = mix(0.2, G.caneZ, gw);

  // props held in the hands
  const fl = L.flags;
  if (L.pram) {
    shFlexL = shFlexR = 0.8;
    elbowL = elbowR = 0.5;
    shAbdL = shAbdR = -0.05;
    gripL = gripR = 1;
    waistBend += 0.07;
  }
  if (L.dog) {
    shFlexL = 0.42 + 0.12 * shFlexL;
    elbowL = 0.42;
    shAbdL = 0.13;
    gripL = 1;
  }
  if (fl & (F.SHOPBAG | F.CANE)) {
    shFlexR *= 0.55;
    shAbdR = 0.1;
    gripR = 1;
  }
  if (fl & F.CANE) elbowR = 0.18;
  if (fl & F.BRIEFCASE) {
    shFlexL *= 0.5;
    shAbdL = 0.1;
    gripL = 1;
  }
  if (fl & F.ROD) {
    shFlexR = 0.5;
    elbowR = 0.6;
    shFlexL = 0.7;
    elbowL = 0.95;
    shAbdL = -0.2;
    gripL = gripR = 1;
  }
  if (umbrella) {
    shFlexR = 0.55;
    elbowR = 1.25;
    shAbdR = 0.02;
    gripR = 1;
  }
  if (m.wave > 0) {
    const k = smooth(Math.min(1, m.wave));
    const osc = Math.sin(t * 9 + m.seed * 6);
    shFlexR = mix(shFlexR, 0.25, k);
    elbowR = mix(elbowR, 0.5 - 0.28 * osc, k);
    shAbdR = mix(shAbdR, 2.55 + 0.2 * osc, k);
    gripR = mix(gripR, 0, k);
  }
  // sitting on a bench: pelvis back against the backrest, thighs on the seat, feet on the ground
  if (m.sit > 0) {
    const k = smooth(Math.min(1, m.sit));
    const sc = r.s;
    const hipY = (SEAT_TOP + 0.088 * hk * sc) / sc; // hip joint above the root (figure units)
    const hipZ = (BACKREST_Z + 0.125 * hk * sc) / sc;
    const thigh = r.thighL;
    const az = hipZ + thigh * 0.98 + 0.03;
    legIK(r, hipY, hipZ, r.ankle.y, az, 0, leg);
    hipFlexL = mix(hipFlexL, leg.flex, k);
    kneeL = mix(kneeL, leg.knee, k);
    ankleL = mix(ankleL, leg.ankle, k);
    legIK(r, hipY, hipZ, r.ankle.y, az - 0.04, 0, leg);
    hipFlexR = mix(hipFlexR, leg.flex, k);
    kneeR = mix(kneeR, leg.knee, k);
    ankleR = mix(ankleR, leg.ankle, k);
    let sL = 0.42,
      eL = 0.9,
      sR = 0.4,
      eR = 0.86,
      al = -0.03,
      ar = -0.03;
    if (m.reading) {
      sL = sR = 0.95;
      eL = eR = 1.15;
      al = ar = -0.18;
    }
    shFlexL = mix(shFlexL, sL, k);
    elbowL = mix(elbowL, eL, k);
    shAbdL = mix(shAbdL, al, k);
    if (m.wave <= 0) {
      shFlexR = mix(shFlexR, sR, k);
      elbowR = mix(elbowR, eR, k);
      shAbdR = mix(shAbdR, ar, k);
    }
    waistBend = mix(waistBend, m.reading ? -0.12 : -0.2, k);
    chestBend = mix(chestBend, 0.05 + 0.15 * old, k);
    rootY = mix(rootY, hipY - r.hip.y, k);
    rootZ = mix(rootZ, hipZ, k);
    rootX *= 1 - k;
    tailFloor = k > 0.5 ? hipY - 0.075 * hk : 0;
  }
  // sitting on the sand / a towel: leaning back on the hands, one knee up
  if (m.ground > 0) {
    const k = smooth(Math.min(1, m.ground));
    hipFlexL = mix(hipFlexL, 1.42, k);
    hipFlexR = mix(hipFlexR, 1.15, k);
    kneeL = mix(kneeL, 0.35, k);
    kneeR = mix(kneeR, 1.25, k);
    shFlexL = mix(shFlexL, -0.55, k);
    shFlexR = mix(shFlexR, -0.5, k);
    elbowL = mix(elbowL, 0.1, k);
    elbowR = mix(elbowR, 0.1, k);
    shAbdL = mix(shAbdL, 0.22, k);
    shAbdR = mix(shAbdR, 0.22, k);
    waistBend = mix(waistBend, -0.32, k);
    chestBend = mix(chestBend, 0.05, k);
    rootY = mix(rootY, 0.1 * hk - r.hip.y, k);
    rootX *= 1 - k;
  }
  // lying on the back
  if (m.lie > 0) {
    const k = smooth(Math.min(1, m.lie));
    bodyPitch = (-Math.PI / 2) * k;
    const kneeUp = m.lieVariant === 2;
    hipFlexL = mix(hipFlexL, kneeUp ? 0.9 : 0.0, k);
    kneeL = mix(kneeL, kneeUp ? 1.6 : 0.04, k);
    hipFlexR = mix(hipFlexR, -0.02, k);
    kneeR = mix(kneeR, 0.04, k);
    if (m.lieVariant === 0) {
      // hands behind the head
      shFlexL = mix(shFlexL, 2.7, k);
      shFlexR = mix(shFlexR, 2.7, k);
      shAbdL = mix(shAbdL, 0.75, k);
      shAbdR = mix(shAbdR, 0.75, k);
      elbowL = mix(elbowL, 2.1, k);
      elbowR = mix(elbowR, 2.1, k);
    } else {
      shFlexL = mix(shFlexL, -0.04, k);
      shFlexR = mix(shFlexR, -0.04, k);
      elbowL = mix(elbowL, 0.08, k);
      elbowR = mix(elbowR, 0.08, k);
      shAbdL = mix(shAbdL, 0.14, k);
      shAbdR = mix(shAbdR, 0.14, k);
    }
    waistBend = mix(waistBend, 0, k);
    chestBend = mix(chestBend, 0, k);
    headPitch = mix(headPitch, -0.15, k);
    rootY = mix(rootY, 0.11 * hk - r.hip.y, k);
    headYaw *= 1 - 0.7 * k;
  }
  // seated / lying: no pelvis motion, relaxed (pointed) feet on the ground poses
  if (seated > 0) {
    const k = 1 - upright;
    pelvisYaw *= upright;
    pelvisRoll *= upright;
    waistTwist *= upright;
    chestTwist *= upright;
    chestRoll *= upright;
    footYawL *= upright;
    footYawR *= upright;
    if (m.lie > 0 || m.ground > 0) {
      const kk = Math.max(smooth(Math.min(1, m.lie)), smooth(Math.min(1, m.ground)));
      ankleL = mix(ankleL, -0.5, kk);
      ankleR = mix(ankleR, -0.5, kk);
    }
    void k;
  }
  o.hipFlexL = hipFlexL;
  o.kneeL = kneeL;
  o.ankleL = ankleL;
  o.hipFlexR = hipFlexR;
  o.kneeR = kneeR;
  o.ankleR = ankleR;
  o.hipAbdL = hipAbdL * upright;
  o.hipAbdR = hipAbdR * upright;
  o.footYawL = footYawL;
  o.footYawR = footYawR;
  o.shFlexL = shFlexL;
  o.shFlexR = shFlexR;
  o.shAbdL = shAbdL;
  o.shAbdR = shAbdR;
  o.shTwistL = shTwistL;
  o.shTwistR = shTwistR;
  o.elbowL = elbowL;
  o.elbowR = elbowR;
  o.wristL = wristL;
  o.wristR = wristR;
  o.gripL = gripL;
  o.gripR = gripR;
  o.waistBend = waistBend;
  o.waistTwist = waistTwist;
  o.chestBend = chestBend;
  o.chestTwist = chestTwist;
  o.chestRoll = chestRoll;
  o.headYaw = headYaw;
  o.headPitch = headPitch;
  o.headRoll = headRoll;
  o.pelvisYaw = pelvisYaw;
  o.pelvisRoll = pelvisRoll;
  o.bodyPitch = bodyPitch;
  o.rootX = rootX;
  o.rootY = rootY;
  o.rootZ = rootZ;
  o.tailFloor = tailFloor;
  o.bagSwingL = -shFlexL * 0.3 * (1 - smooth(Math.min(1, m.sit)));
  o.bagSwingR = -shFlexR * 0.3 * (1 - smooth(Math.min(1, m.sit)));
  o.caneX = caneX;
  o.caneZ = caneZ;
  return o;
}
