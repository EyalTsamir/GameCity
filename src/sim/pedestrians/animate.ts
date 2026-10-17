// Pose of one figure from its crowd member state: walk / run gait, idle stance, bench sitting,
// sitting on the sand, lying, waving, pushing a pram, holding props. Writes a Pose (pose.ts).

import type { Member } from './crowd';
import { F } from './figure';
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

export function computePose(m: Member, t: number, umbrella: boolean, r: Rig, o: Pose): Pose {
  const L = m.look;
  const a = m.amp;
  const walk = Math.min(1, a);
  const run = Math.max(0, a - 1);
  const ph = m.phase;
  const s = Math.sin(ph),
    c = Math.cos(ph);
  const old = r.old;
  const kid = r.c > 0.3;
  const hk = r.stature / r.s / 1.76; // figure size relative to the average man (unscaled)

  // ── gait (P1: sinusoidal; replaced by the planted-foot model in gait.ts)
  const hipA = (0.4 * walk + 0.3 * run) * (1 - 0.25 * old);
  let hipFlexL = hipA * s,
    hipFlexR = -hipA * s;
  const kneeA = 0.55 * walk + 0.95 * run;
  let kneeL = 0.05 + kneeA * Math.max(0, c) + 0.32 * run + 0.08 * old,
    kneeR = 0.05 + kneeA * Math.max(0, -c) + 0.32 * run + 0.08 * old;
  const armA = (0.34 * walk + 0.32 * run) * (old ? 0.55 : kid ? 1.15 : 1);
  let shFlexL = -armA * s,
    shFlexR = armA * s;
  let elbowL = 0.18 + 0.12 * walk + 1.25 * Math.min(1, run * 2.5),
    elbowR = elbowL;
  let shAbdL = 0.05,
    shAbdR = 0.05;
  let shTwistL = 0,
    shTwistR = 0;
  let waistBend = 0.035 * walk + 0.12 * run + 0.05 * old;
  let chestBend = 0.04 * run + 0.22 * old;
  let headPitch = -0.16 * old - 0.02 * run;
  let rootY = (0.022 * walk + 0.05 * run) * (Math.abs(c) - 0.6);
  let rootZ = 0;
  let bodyPitch = 0;
  let headYaw = m.headYaw;
  let gripL = 0.15,
    gripR = 0.15;
  let wristL = 0,
    wristR = 0;
  let tailFloor = 0;
  // idle: weight shifts and small fidgets
  const idle = 1 - Math.min(1, a / 0.25);
  if (idle > 0 && m.sit < 0.5 && m.lie < 0.5 && m.ground < 0.5) {
    const w = Math.sin(t * 0.55 + m.seed * 20);
    waistBend += 0.012 * Math.sin(t * 0.9 + m.seed * 7) * idle;
    hipFlexL -= 0.04 * w * idle;
    hipFlexR += 0.025 * w * idle;
    kneeL += 0.05 * Math.max(0, w) * idle;
    kneeR += 0.05 * Math.max(0, -w) * idle;
    shFlexL += 0.035 * Math.sin(t * 0.6 + m.seed * 3) * idle;
    shFlexR += 0.035 * Math.sin(t * 0.52 + m.seed * 5) * idle;
  }
  // props held in the hands
  const fl = L.flags;
  if (L.pram) {
    shFlexL = shFlexR = 0.8 - 0.02 * s;
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
    const w = smooth(Math.min(1, m.wave));
    const osc = Math.sin(t * 9 + m.seed * 6);
    shFlexR = mix(shFlexR, 0.25, w);
    elbowR = mix(elbowR, 0.5 - 0.28 * osc, w);
    shAbdR = mix(shAbdR, 2.55 + 0.2 * osc, w);
    gripR = mix(gripR, 0, w);
  }
  // sitting on a bench: pelvis back against the backrest, thighs on the seat, feet on the ground
  if (m.sit > 0) {
    const k = smooth(Math.min(1, m.sit));
    const sc = r.s;
    const hipY = (SEAT_TOP + 0.088 * hk * sc) / sc; // hip joint above the root (figure units)
    const hipZ = (BACKREST_Z + 0.125 * hk * sc) / sc;
    const sRootY = hipY - r.hip.y;
    const sRootZ = hipZ;
    // feet: ankle on the ground, shins near vertical, knees beyond the seat edge
    const thigh = Math.hypot(r.knee.y - r.hip.y, r.knee.z - r.hip.z);
    const az = hipZ + thigh * 0.98 + 0.03;
    legIK(r, hipY, hipZ, r.ankle.y, az, 0, leg);
    const sfL = leg.flex,
      skL = leg.knee,
      saL = leg.ankle;
    legIK(r, hipY, hipZ, r.ankle.y, az - 0.04, 0, leg);
    hipFlexL = mix(hipFlexL, sfL, k);
    kneeL = mix(kneeL, skL, k);
    hipFlexR = mix(hipFlexR, leg.flex, k);
    kneeR = mix(kneeR, leg.knee, k);
    o.ankleL = saL * k;
    o.ankleR = leg.ankle * k;
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
    rootY = mix(rootY, sRootY, k);
    rootZ = mix(rootZ, sRootZ, k);
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
  // flat feet unless seated (sitting writes the ankles itself)
  if (m.sit <= 0) {
    o.ankleL = kneeL - hipFlexL;
    o.ankleR = kneeR - hipFlexR;
    if (m.lie > 0 || m.ground > 0) {
      const k = Math.max(smooth(Math.min(1, m.lie)), smooth(Math.min(1, m.ground)));
      o.ankleL = mix(o.ankleL, -0.5, k);
      o.ankleR = mix(o.ankleR, -0.5, k);
    }
  }
  o.hipFlexL = hipFlexL;
  o.kneeL = kneeL;
  o.hipFlexR = hipFlexR;
  o.kneeR = kneeR;
  o.hipAbdL = 0.02;
  o.hipAbdR = 0.02;
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
  o.waistTwist = 0;
  o.chestBend = chestBend;
  o.chestTwist = 0;
  o.chestRoll = 0;
  o.headYaw = headYaw;
  o.headPitch = headPitch;
  o.headRoll = 0;
  o.pelvisYaw = 0;
  o.pelvisRoll = 0;
  o.bodyPitch = bodyPitch;
  o.rootX = 0;
  o.rootY = rootY;
  o.rootZ = rootZ;
  o.tailFloor = tailFloor;
  o.bagSwingL = -(shFlexL - 0.0) * 0.9 * (1 - smooth(Math.min(1, m.sit)));
  o.bagSwingR = -(shFlexR - 0.0) * 0.9 * (1 - smooth(Math.min(1, m.sit)));
  o.caneX = -r.hip.x * 2.4;
  o.caneZ = 0.18;
  void clamp;
  return o;
}
