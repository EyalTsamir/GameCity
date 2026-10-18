// Walking / running / standing with planted feet.
//
// The crowd advances each member's phase by distance / gaitCycle (rig.ts): one cycle (2π) = two
// steps, left heel strike at phase 0, right at π. From the phase this module derives, per leg, the
// stance (foot planted, rolling heel → flat → forefoot) or swing (heel lifts behind, toes up, reach)
// and the pelvis motion (bob, rotation, list, sway). Standing keeps both feet where they landed,
// finishes the last step, re-steps when the body drifts or turns (step-turns). Walk and stand foot
// targets are blended by the gait amplitude, then each leg is solved with a 2-bone IK (+ abduction
// and a hip twist that keeps a planted foot's heading fixed in the world).
//
// Planting: a foot's flat-foot reference point and heading are stored in world space at heel strike
// and kept until toe-off (per-member render state), so feet do not slide when the speed changes, the
// walker turns or sidesteps. Without state (tiny LOD, first frame, big jumps) the phase law alone is
// used — it is slide-free at constant speed.

import type { Member } from './crowd';
import { legIK, type LegSolve } from './pose';
import { stepLength, type Rig } from './rig';

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (x: number) => x - Math.floor(x);
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface FootPlant {
  /** world position of the flat-foot reference (ankle projected) and heading while planted */
  wx: number;
  wz: number;
  wyaw: number;
  /** body-frame position (figure units) and twist at toe-off: start of the swing */
  sx: number;
  sz: number;
  sy: number;
  stw: number;
  stance: boolean;
  valid: boolean;
}

interface StandFoot {
  wx: number;
  wz: number;
  wyaw: number;
}

export interface LegPlan {
  /** ankle target (body frame, figure units) */
  x: number;
  y: number;
  z: number;
  /** sole pitch (+ toes up) */
  pitch: number;
  /** hip twist (+ internal) */
  twist: number;
  stance: boolean;
  /** swing progress 0…1 (stance: −1) */
  s: number;
}

export interface GaitState {
  feet: [FootPlant, FootPlant];
  lastPhase: number;
  frame: number;
  lastT: number;
  lastYaw: number;
  /** smoothed yaw rate (rad/s) */
  yawRate: number;
  /** stand mode */
  standing: boolean;
  sp: [StandFoot, StandFoot];
  stepFoot: number;
  stepT: number;
  stepFrom: StandFoot;
  stepTo: StandFoot;
  /** last solved foot targets (body frame) — seed for mode changes */
  last: [LegPlan, LegPlan];
  /** root position of the last frame (teleport detection) */
  lastX: number;
  lastZ: number;
}

const hyp2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const newPlan = (): LegPlan => {
  // double-valued literal → unboxed double fields (see pose.ts newPose), then the real start values
  const o: LegPlan = { x: 0.5, y: 0.5, z: 0.5, pitch: 0.5, twist: 0.5, stance: true, s: -0.5 };
  o.x = o.y = o.z = o.pitch = o.twist = 0;
  o.s = -1;
  return o;
};
function copyPlan(o: LegPlan, a: LegPlan): void {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  o.pitch = a.pitch;
  o.twist = a.twist;
  o.stance = a.stance;
  o.s = a.s;
}

export function newGaitState(): GaitState {
  const f = (): FootPlant => ({ wx: 0, wz: 0, wyaw: 0, sx: 0, sz: 0, sy: 0, stw: 0, stance: false, valid: false });
  const s = (): StandFoot => ({ wx: 0, wz: 0, wyaw: 0 });
  return { feet: [f(), f()], lastPhase: 0, frame: -10, lastT: 0, lastYaw: 0, yawRate: 0, standing: false, sp: [s(), s()], stepFoot: -1, stepT: 0, stepFrom: s(), stepTo: s(), last: [newPlan(), newPlan()], lastX: 0.5, lastZ: 0.5 };
}

/** values the gait writes (the caller blends upper-body values with its own pose) */
export interface GaitOut {
  hipFlexL: number;
  hipAbdL: number;
  footYawL: number;
  kneeL: number;
  ankleL: number;
  hipFlexR: number;
  hipAbdR: number;
  footYawR: number;
  kneeR: number;
  ankleR: number;
  rootX: number;
  rootY: number;
  pelvisYaw: number;
  pelvisRoll: number;
  waistBend: number;
  waistTwist: number;
  chestTwist: number;
  headPitch: number;
  /** stabilising correction for the head yaw (add to the look-around yaw) */
  headYawCorr: number;
  shFlexL: number;
  shFlexR: number;
  elbowL: number;
  elbowR: number;
  shAbdL: number;
  shAbdR: number;
  /** cane tip (figure units) */
  caneX: number;
  caneZ: number;
  /** 0 walk … 1 run */
  run: number;
}

const GAIT_KEYS = ['hipFlexL', 'hipAbdL', 'footYawL', 'kneeL', 'ankleL', 'hipFlexR', 'hipAbdR', 'footYawR', 'kneeR', 'ankleR', 'rootX', 'rootY', 'pelvisYaw', 'pelvisRoll', 'waistBend', 'waistTwist', 'chestTwist', 'headPitch', 'headYawCorr', 'shFlexL', 'shFlexR', 'elbowL', 'elbowR', 'shAbdL', 'shAbdR', 'caneX', 'caneZ', 'run'] as const;

export function newGaitOut(): GaitOut {
  // one literal (fast-mode object with double fields, see pose.ts newPose)
  const o: GaitOut = { hipFlexL: 0.5, hipAbdL: 0.5, footYawL: 0.5, kneeL: 0.5, ankleL: 0.5, hipFlexR: 0.5, hipAbdR: 0.5, footYawR: 0.5, kneeR: 0.5, ankleR: 0.5, rootX: 0.5, rootY: 0.5, pelvisYaw: 0.5, pelvisRoll: 0.5, waistBend: 0.5, waistTwist: 0.5, chestTwist: 0.5, headPitch: 0.5, headYawCorr: 0.5, shFlexL: 0.5, shFlexR: 0.5, elbowL: 0.5, elbowR: 0.5, shAbdL: 0.5, shAbdR: 0.5, caneX: 0.5, caneZ: 0.5, run: 0.5 };
  for (const k of GAIT_KEYS) o[k] = 0;
  return o;
}

const walkA = newPlan(),
  walkB = newPlan(),
  standA = newPlan(),
  standB = newPlan(),
  legA = newPlan(),
  legB = newPlan(),
  legTmp = newPlan();
const solve: LegSolve = { flex: 0, knee: 0, ankle: 0, reached: true };

/** gait parameters for a figure at speed v (figure units) */
interface Params {
  S: number;
  beta: number;
  run: number;
  zHS: number;
  thHS: number;
  thTO: number;
  uFlat: number;
  uRise: number;
  width: number;
  lift: number;
  hStand: number;
  bob: number;
}
const P: Params = { S: 1, beta: 0.62, run: 0, zHS: 0, thHS: 0, thTO: 0, uFlat: 0, uRise: 0, width: 0, lift: 0, hStand: 0, bob: 0 };

function params(r: Rig, v: number, pram: boolean): Params {
  const s = r.s;
  const step = stepLength(r, v) * (pram ? 0.9 : 1);
  const S = (2 * step) / s;
  const run = sstep(1.95, 2.3, v);
  const hk = r.legLen / s / 0.93;
  const vRel = v / Math.sqrt(r.legLen / 0.93);
  P.S = S;
  P.run = run;
  P.beta = mix(clamp(0.665 - 0.035 * vRel, 0.58, 0.67) + 0.03 * r.old, mix(0.4, 0.34, clamp((v - 2.3) / 1.5, 0, 1)), run);
  const heelBack = -r.heelZ;
  P.thHS = mix(0.3 * clamp(vRel / 1.3, 0.35, 1) * (1 - 0.4 * r.old), 0.08, run);
  const aheadAnkle = (mix(0.43, 0.3, run) * step) / s;
  P.zHS = aheadAnkle + heelBack * (1 - Math.cos(P.thHS)) + r.ankleH * Math.sin(P.thHS);
  P.thTO = -mix(0.85 * clamp(vRel / 1.3, 0.45, 1.05) * (1 - 0.35 * r.old), 0.75, run);
  P.uFlat = P.beta * mix(0.19, 0.22, run);
  P.uRise = P.beta * mix(0.6, 0.45, run);
  P.width = mix(0.048, 0.03, run) * hk + 0.012 * r.old * hk;
  P.lift = (mix(0.1, 0.2, run) + 0.02 * clamp(vRel - 1, 0, 1)) * hk * (1 - 0.45 * r.old) * clamp(vRel / 0.9, 0.5, 1);
  P.hStand = r.hip.y - 0.004 * hk - 0.02 * r.old * hk;
  P.bob = mix(0.023 * clamp(vRel / 1.3, 0.3, 1.3), 0.03, run) * hk;
  return P;
}

/**
 * Ankle position from a flat-foot reference z and the sole pitch: exact rigid rolling of the shoe's
 * sole polygon (heel back → heel → ball → toe, with the heel rounding and toe spring) on the ground,
 * so the contact point never slides or sinks. o.y / o.z = ankle (body frame); o.x untouched.
 */
function rollAnkle(r: Rig, fz: number, pitch: number, o: LegPlan): void {
  const S = r.sole;
  const aH = r.ankleH;
  // rotate (dz, dy) about the X axis by `a` (+ = toes up): y' = c·dy + s·dz, z' = −s·dy + c·dz
  let ax = fz,
    ay = aH; // ankle (z, y) in the flat pose
  // pivots: heel then heel back (toes up), or ball then toe (heel up)
  const q0 = pitch >= 0 ? S[1] : S[2],
    q1 = pitch >= 0 ? S[0] : S[3];
  // contact point of the first pivot in the flat pose
  let pzG = fz + q0.z,
    pyG = q0.y;
  let done = 0;
  for (let i = 0; i < 2; i++) {
    const piv = i === 0 ? q0 : q1;
    // angle at which the next point touches (relative to the flat pose, measured from the current pivot)
    let lim = pitch;
    if (i === 0) {
      const nx = q1;
      const t = Math.atan2(nx.y - piv.y, Math.abs(nx.z - piv.z));
      lim = pitch >= 0 ? Math.min(pitch, t) : Math.max(pitch, -t);
    }
    const a = lim - done;
    if (Math.abs(a) > 1e-9) {
      const c = Math.cos(a),
        s = Math.sin(a);
      const dz = ax - pzG,
        dy = ay - pyG;
      ax = pzG + (-s * dy + c * dz);
      ay = pyG + (c * dy + s * dz);
      done = lim;
    }
    if (done === pitch || i >= 1) break;
    // next pivot: where the next sole point now touches the ground
    const nx = q1;
    const c = Math.cos(done),
      s = Math.sin(done);
    const dz0 = nx.z,
      dy0 = nx.y - aH; // relative to the ankle in the flat pose
    pzG = ax + (-s * dy0 + c * dz0);
    pyG = ay + (c * dy0 + s * dz0);
  }
  o.z = ax;
  o.y = ay;
}

// path curvature of the current member (per figure unit, + = turning left)
let KAPPA = 0;
// world ↔ body frame of the current member (set per call)
let BX = 0,
  BZ = 0,
  CY = 1,
  SY = 0,
  SC = 1,
  YAW = 0;
const toBody = (wx: number, wz: number, o: { x: number; z: number }) => {
  const dx = (wx - BX) / SC,
    dz = (wz - BZ) / SC;
  o.x = CY * dx - SY * dz;
  o.z = SY * dx + CY * dz;
};
const toWorld = (bx: number, bz: number, o: { wx: number; wz: number }) => {
  const x = bx * SC,
    z = bz * SC;
  o.wx = BX + CY * x + SY * z;
  o.wz = BZ - SY * x + CY * z;
};
const tmpB = { x: 0, z: 0 };
const tmpW = { wx: 0, wz: 0 };

/** foot heading → hip twist for a leg, given the pelvis yaw */
const twistFor = (left: boolean, footYaw: number, pelvisYaw: number) => {
  const rel = wrapA(footYaw - YAW - pelvisYaw);
  return clamp(left ? -rel : rel, -0.7, 0.7);
};

/**
 * Horizontal heading (relative to the body) of a foot's forward axis through the chain
 * foot yaw → ankle → knee → hip flex / abduction → pelvis yaw / roll (as the shader applies them).
 */
function footHeading(left: boolean, fy: number, ankle: number, knee: number, flex: number, abd: number, pYaw: number, pRoll: number): number {
  // forward vector (0, 0, 1); rY(a): x' = c x + s z, z' = −s x + c z; rX(a): y' = c y − s z, z' = s y + c z; rZ(a): x' = c x − s y, y' = s x + c y
  const ry = left ? -fy : fy;
  let x = 0,
    y = -Math.sin(-ankle),
    z = Math.cos(-ankle);
  // pitch (in the foot frame) first, then the yaw about the shin axis
  {
    const c = Math.cos(ry),
      s = Math.sin(ry);
    const x2 = c * x + s * z,
      z2 = -s * x + c * z;
    x = x2;
    z = z2;
  }
  const rotX = (a: number) => {
    const c = Math.cos(a),
      s = Math.sin(a);
    const y2 = c * y - s * z,
      z2 = s * y + c * z;
    y = y2;
    z = z2;
  };
  rotX(knee);
  rotX(-flex);
  {
    const a = left ? abd : -abd;
    const c = Math.cos(a),
      s = Math.sin(a);
    const x2 = c * x - s * y,
      y2 = s * x + c * y;
    x = x2;
    y = y2;
  }
  {
    const c = Math.cos(pRoll),
      s = Math.sin(pRoll);
    const x2 = c * x - s * y,
      y2 = s * x + c * y;
    x = x2;
    y = y2;
  }
  {
    const c = Math.cos(pYaw),
      s = Math.sin(pYaw);
    const x2 = c * x + s * z,
      z2 = -s * x + c * z;
    x = x2;
    z = z2;
  }
  void y;
  return Math.atan2(x, z);
}

/** plan one leg at its own cycle fraction u (0 = its heel strike) */
function planWalk(r: Rig, u: number, left: boolean, plant: FootPlant | null, pelvisYaw: number, o: LegPlan): void {
  const p = P;
  const x0 = (left ? 1 : -1) * p.width;
  if (u < p.beta) {
    o.stance = true;
    o.s = -1;
    let fz = p.zHS - u * p.S;
    // law position on the (possibly curved) path
    let fx = x0 * Math.cos(KAPPA * fz) + (KAPPA * fz * fz) / 2;
    o.twist = 0;
    if (plant && plant.valid && plant.stance) {
      // tight turns: a planted foot never twists more than ±0.6 rad against the pelvis — beyond that it
      // pivots about its contact point (the heel while the heel carries, else the ball), as people do
      const rel = wrapA(plant.wyaw - YAW - pelvisYaw);
      if (Math.abs(rel) > 0.6) {
        const e = rel - Math.sign(rel) * 0.6;
        const pz = (u < p.uFlat ? r.sole[1].z : r.sole[2].z) * SC;
        const pxw = plant.wx + Math.sin(plant.wyaw) * pz,
          pzw = plant.wz + Math.cos(plant.wyaw) * pz;
        plant.wyaw -= e;
        plant.wx = pxw - Math.sin(plant.wyaw) * pz;
        plant.wz = pzw - Math.cos(plant.wyaw) * pz;
      }
      toBody(plant.wx, plant.wz, tmpB);
      const ex = tmpB.x - fx,
        ez = tmpB.z - fz;
      if (Math.abs(ex) < 1.2 && Math.abs(ez) < 1.2) {
        // sharp corners (the crowd's heading snaps): a plant far off the law is dragged along with the
        // body instead of being dropped, so the foot never jumps
        const cx = clamp(ex, -0.25, 0.25),
          cz = clamp(ez, -0.32, 0.32);
        if (cx !== ex || cz !== ez) {
          toWorld(fx + cx, fz + cz, tmpW);
          plant.wx = tmpW.wx;
          plant.wz = tmpW.wz;
        }
        fz += cz;
        fx += cx;
        o.twist = twistFor(left, plant.wyaw, pelvisYaw);
      } else plant.valid = false; // teleported: re-plant on the law
    }
    let pitch: number;
    if (u < p.uFlat) pitch = p.thHS * (1 - sstep(0, p.uFlat, u));
    else if (u < p.uRise) pitch = 0;
    else pitch = p.thTO * Math.pow(sstep(p.uRise, p.beta, u), 1.25);
    rollAnkle(r, fz, pitch, o);
    // the roll displaces the ankle along the foot's own heading
    const hr = plant && plant.valid && plant.stance ? wrapA(plant.wyaw - YAW) : 0;
    const dzr = o.z - fz;
    o.x = fx + Math.sin(hr) * dzr;
    o.z = fz + Math.cos(hr) * dzr;
    o.pitch = pitch;
  } else {
    o.stance = false;
    const s = (u - p.beta) / (1 - p.beta);
    o.s = s;
    const toZ = p.zHS - p.beta * p.S;
    rollAnkle(r, toZ, p.thTO, legTmp);
    let z0 = legTmp.z - (u - p.beta) * p.S;
    let y0 = legTmp.y;
    let xs = x0;
    let tw0 = 0;
    if (plant && plant.valid && !plant.stance) {
      z0 = plant.sz - (u - p.beta) * p.S;
      y0 = plant.sy;
      xs = plant.sx;
      tw0 = plant.stw;
    } else if (plant && plant.valid && plant.stance) {
      // first swing frame: leave from where the planted foot actually is
      toBody(plant.wx, plant.wz, tmpB);
      if (Math.abs(tmpB.z - (toZ - (u - p.beta) * p.S)) < 0.35) {
        rollAnkle(r, tmpB.z, p.thTO, legTmp);
        // roll offset along the foot's heading, as in its last stance frame
        const hr = wrapA(plant.wyaw - YAW);
        const dzr = legTmp.z - tmpB.z;
        z0 = tmpB.z + Math.cos(hr) * dzr;
        y0 = legTmp.y;
        xs = tmpB.x + Math.sin(hr) * dzr;
        tw0 = twistFor(left, plant.wyaw, pelvisYaw);
      }
    }
    rollAnkle(r, p.zHS, p.thHS, legTmp);
    const z1 = legTmp.z + (1 - u) * p.S,
      y1 = legTmp.y;
    // turning: the landing point lies on the curved path (lateral offset κ·D²/2, side offset rotated)
    const x1 = x0 * Math.cos(KAPPA * z1) + (KAPPA * z1 * z1) / 2;
    const e = s - Math.sin(TAU * s) / TAU; // ground-frame ease: leaves and lands at rest
    o.z = mix(z0, z1, e);
    o.x = mix(xs, x1, sstep(0, 0.7, s));
    o.twist = tw0 * (1 - sstep(0, 0.5, s));
    const pm = 0.08;
    o.pitch = s < 0.45 ? mix(p.thTO, pm, sstep(0, 0.45, s)) : mix(pm, p.thHS, sstep(0.45, 1, s));
    // height: down to the landing height by mid-swing + an early bump (heel high behind the body)
    const bump = s < 0.7 ? Math.pow(Math.sin((Math.PI * s) / 0.7), 1.2) : 0;
    o.y = mix(y0, y1, sstep(0.05, 0.62, s)) + p.lift * bump * (1 - 0.4 * s) + 0.012 * Math.sin(Math.PI * s);
    clearance(r, o, 0.016 * sstep(0.02, 0.15, s) * (1 - sstep(0.85, 1, s)));
  }
}

/** lift a foot in the air so its toe and heel clear the ground by `need` */
function clearance(r: Rig, o: LegPlan, need: number): void {
  const c = Math.cos(o.pitch),
    sn = Math.sin(o.pitch);
  const toeY = o.y - c * r.ankleH + sn * r.toeZ;
  const heelY = o.y - c * r.ankleH + sn * r.heelZ;
  const low = Math.min(toeY, heelY);
  if (low < need) o.y += need - low;
}

/** comfortable standing foot position (body frame) */
function homeX(r: Rig, left: boolean): number {
  return (left ? 1 : -1) * (r.ankle.x * 1.05 + 0.006 * r.old);
}

/** stand targets: both feet planted; settle / re-step one foot at a time */
function planStand(r: Rig, st: GaitState, dt: number, pelvisYaw: number): void {
  const hk = r.legLen / r.s / 0.93;
  // a planted foot far from where it belongs (figure placed or moved while standing) is put back at
  // once — re-stepping needs time, and that stalls while the simulation is paused
  for (let i = 0; i < 2; i++) {
    const left = i === 0;
    const f = st.sp[i];
    toBody(f.wx, f.wz, tmpB);
    const dx = tmpB.x - homeX(r, left),
      dz = tmpB.z;
    if (dx * dx + dz * dz > 0.36 * hk * hk) {
      toWorld(homeX(r, left), (left ? 0.02 : -0.02) * hk, tmpW);
      f.wx = tmpW.wx;
      f.wz = tmpW.wz;
      f.wyaw = YAW;
      if (st.stepFoot === i) st.stepFoot = -1;
    }
  }
  if (st.stepFoot >= 0) {
    st.stepT += dt / 0.36;
    if (st.stepT >= 1) {
      const f = st.sp[st.stepFoot];
      f.wx = st.stepTo.wx;
      f.wz = st.stepTo.wz;
      f.wyaw = st.stepTo.wyaw;
      st.stepFoot = -1;
    }
  }
  if (st.stepFoot < 0) {
    // the foot that most needs a re-step (drift from home, or heading too different: step-turn)
    let worst = -1,
      err = 0;
    for (let i = 0; i < 2; i++) {
      const left = i === 0;
      toBody(st.sp[i].wx, st.sp[i].wz, tmpB);
      const dx = tmpB.x - homeX(r, left),
        dz = tmpB.z - (left ? 0.02 : -0.02) * hk;
      const d = hyp2(dx * 1.4, dz) / hk;
      const yawErr = Math.abs(wrapA(st.sp[i].wyaw - YAW));
      const e = Math.max(d / 0.22, yawErr / 0.55);
      if (e > 1 && e > err) {
        err = e;
        worst = i;
      }
    }
    if (worst >= 0) {
      const left = worst === 0;
      st.stepFoot = worst;
      st.stepT = 0;
      st.stepFrom.wx = st.sp[worst].wx;
      st.stepFrom.wz = st.sp[worst].wz;
      st.stepFrom.wyaw = st.sp[worst].wyaw;
      toWorld(homeX(r, left), (left ? 0.02 : -0.02) * hk, tmpW);
      st.stepTo.wx = tmpW.wx;
      st.stepTo.wz = tmpW.wz;
      st.stepTo.wyaw = YAW;
    }
  }
  for (let i = 0; i < 2; i++) {
    const o = i === 0 ? standA : standB;
    const left = i === 0;
    let wx = st.sp[i].wx,
      wz = st.sp[i].wz,
      wyaw = st.sp[i].wyaw;
    let lift = 0;
    if (st.stepFoot === i) {
      const e = sstep(0, 1, st.stepT);
      wx = mix(st.stepFrom.wx, st.stepTo.wx, e);
      wz = mix(st.stepFrom.wz, st.stepTo.wz, e);
      wyaw = st.stepFrom.wyaw + wrapA(st.stepTo.wyaw - st.stepFrom.wyaw) * e;
      lift = 0.045 * hk * Math.sin(Math.PI * clamp(st.stepT, 0, 1));
    }
    toBody(wx, wz, tmpB);
    o.x = tmpB.x;
    o.z = tmpB.z;
    o.pitch = lift > 0 ? 0.12 * Math.sin(Math.PI * st.stepT) : 0;
    o.y = r.ankleH + lift;
    if (lift > 0) clearance(r, o, lift * 0.6);
    o.twist = twistFor(left, wyaw, pelvisYaw);
    o.stance = lift <= 0;
    o.s = lift > 0 ? st.stepT : -1;
  }
}

/**
 * Leg / pelvis / torso / arm values for a member. `gw` (0 standing … 1 walking) blends the stand and
 * walk foot targets; `st` (optional) keeps planted feet in world space; `frame` is a renderer frame
 * counter (state older than one frame is re-initialised); t = time (s).
 */
export interface IdleShift {
  /** pelvis sideways shift (figure units, + = left), list, yaw and lowering while standing */
  sway: number;
  roll: number;
  yaw: number;
  drop: number;
}

export function gaitPose(m: Member, r: Rig, st: GaitState | null, frame: number, t: number, gw: number, idle: IdleShift, o: GaitOut): GaitOut {
  const v = m.speed;
  const pram = !!m.look.pram;
  const p = params(r, v, pram);
  BX = m.x;
  BZ = m.z;
  YAW = m.yaw;
  CY = Math.cos(m.yaw);
  SY = Math.sin(m.yaw);
  SC = r.s;
  const uL = frac(m.phase / TAU);
  const uR = frac(uL + 0.5);
  const state = st;
  const dt = state ? clamp(t - state.lastT, 0, 0.1) : 0;
  KAPPA = 0;
  if (state && frame - state.frame <= 1 && dt > 1e-4) {
    const w = wrapA(m.yaw - state.lastYaw) / dt;
    state.yawRate += (w - state.yawRate) * Math.min(1, dt * 6);
    KAPPA = clamp(state.yawRate / Math.max(0.35, v), -1.6, 1.6) * SC;
  } else if (state) state.yawRate = 0;
  let fresh = true;
  if (state) {
    // not drawn last frame, or moved further than any walk can in one frame (placed / teleported)
    const jx = m.x - state.lastX,
      jz = m.z - state.lastZ;
    fresh = frame - state.frame > 1 || jx * jx + jz * jz > 2.25;
    const jump = Math.abs(m.phase - state.lastPhase) / TAU;
    if (fresh) {
      state.feet[0].valid = state.feet[1].valid = false;
      state.standing = false;
      state.stepFoot = -1;
    } else if (jump > 0.3) state.feet[0].valid = state.feet[1].valid = false;
  }
  const run = p.run;
  const vRel = v / Math.sqrt(r.legLen / 0.93);
  const kWalk = clamp(vRel / 1.3, 0, 1.4) * gw;
  // pelvis motion (rotation forward with the swing leg, list towards the swing side, sway to the stance side)
  const ig = 1 - gw;
  const pelvisYaw = -mix(0.075, 0.12, run) * kWalk * Math.cos(TAU * uL) * (1 - 0.4 * r.old) + idle.yaw * ig;
  const pelvisRoll = mix(0.05, 0.03, run) * clamp(kWalk, 0, 1) * Math.sin(TAU * uL) + idle.roll * ig;
  const sway = (mix(0.018, 0.008, run) * (r.legLen / r.s / 0.93) * clamp(kWalk, 0, 1) + 0.006 * r.old * gw) * Math.sin(TAU * uL) + idle.sway * ig;

  // ── walk targets
  if (gw > 0.001) {
    planWalk(r, uL, true, state ? state.feet[0] : null, pelvisYaw, walkA);
    planWalk(r, uR, false, state ? state.feet[1] : null, pelvisYaw, walkB);
  }
  // ── stand targets (plants initialised from wherever the feet are)
  if (state && gw < 0.999) {
    if (!state.standing) {
      for (let i = 0; i < 2; i++) {
        const W = i === 0 ? walkA : walkB;
        const f = state.feet[i];
        const left = i === 0;
        const u = left ? uL : uR;
        const sp = state.sp[i];
        if (!fresh && gw > 0.001 && W.stance && f.valid && f.stance) {
          // planted: stay exactly there
          sp.wx = f.wx;
          sp.wz = f.wz;
          sp.wyaw = f.wyaw;
        } else if (!fresh && gw > 0.001 && !W.stance) {
          // in the air: land where the step was going
          toWorld((left ? 1 : -1) * p.width, p.zHS + (1 - u) * p.S, tmpW);
          sp.wx = tmpW.wx;
          sp.wz = tmpW.wz;
          sp.wyaw = m.yaw + pelvisYaw;
        } else {
          const src = state.last[i];
          toWorld(fresh ? homeX(r, left) : src.x, fresh ? 0 : src.z, tmpW);
          sp.wx = tmpW.wx;
          sp.wz = tmpW.wz;
          sp.wyaw = m.yaw;
        }
      }
      state.standing = true;
      state.stepFoot = -1;
    }
    planStand(r, state, dt, pelvisYaw);
  } else if (state && gw >= 0.999 && state.standing) {
    state.standing = false;
    state.stepFoot = -1;
  }
  // ── blend: stand ↔ walk
  for (let i = 0; i < 2; i++) {
    const o2 = i === 0 ? legA : legB;
    const W = i === 0 ? walkA : walkB;
    const S = i === 0 ? standA : standB;
    if (!state || gw >= 0.999) {
      if (gw > 0.001) copyPlan(o2, W);
      else {
        o2.x = homeX(r, i === 0);
        o2.z = 0;
        o2.y = r.ankleH;
        o2.pitch = 0;
        o2.twist = 0;
        o2.stance = true;
        o2.s = -1;
      }
    } else if (gw <= 0.001) copyPlan(o2, S);
    else {
      o2.x = mix(S.x, W.x, gw);
      o2.y = mix(S.y, W.y, gw);
      o2.z = mix(S.z, W.z, gw);
      o2.pitch = mix(S.pitch, W.pitch, gw);
      o2.twist = mix(S.twist, W.twist, gw);
      o2.stance = gw > 0.5 ? W.stance : S.stance;
      o2.s = gw > 0.5 ? W.s : S.s;
    }
  }

  // ── pelvis height: walking lowest at double support, running lowest mid-stance; legs must reach
  const hWalk = p.hStand - p.bob * (0.5 + 0.5 * Math.cos(2 * TAU * uL));
  const hRun = p.hStand * 0.955 - p.bob * Math.cos(2 * TAU * (uL - p.beta / 2));
  let h = mix(p.hStand - idle.drop, mix(hWalk, hRun, run), gw);
  const hNom = h;
  const reach = (r.thighL + r.shinL) * mix(0.995, 0.985, run);
  for (let li = 0; li < 2; li++) {
    const leg = li === 0 ? legA : legB;
    const side = leg === legA ? 1 : -1;
    const hx = side * r.hip.x;
    const hz = -Math.sin(pelvisYaw) * hx;
    const hyOff = Math.sin(pelvisRoll) * hx;
    const dx = leg.x - (hx * Math.cos(pelvisYaw) + sway),
      dz = leg.z - hz;
    const d2 = reach * reach - dx * dx - dz * dz;
    const maxH = (d2 > 0 ? Math.sqrt(d2) : 0) + leg.y - hyOff;
    if (leg.stance || leg.s < 0.05) h = Math.min(h, maxH);
    else if (leg.s > 0.8) h = Math.min(h, mix(h, maxH, sstep(0.8, 0.97, leg.s)));
  }
  // never crouch for a foot left far behind (sharp corners): pull that foot in instead
  h = Math.max(h, hNom - 0.045 * (r.legLen / r.s / 0.93));
  for (let li = 0; li < 2; li++) {
    const leg = li === 0 ? legA : legB;
    if (!(leg.stance || leg.s < 0.05)) continue;
    const side = leg === legA ? 1 : -1;
    const hx = side * r.hip.x;
    const cxh = hx * Math.cos(pelvisYaw) + sway,
      hz = -Math.sin(pelvisYaw) * hx;
    const dy = h - (leg.y - Math.sin(pelvisRoll) * hx);
    const dx = leg.x - cxh,
      dz = leg.z - hz;
    const dh = Math.sqrt(dx * dx + dz * dz);
    const maxD = Math.sqrt(Math.max(0, reach * reach - dy * dy));
    if (dh > maxD && dh > 1e-6) {
      const k = maxD / dh;
      leg.x = cxh + dx * k;
      leg.z = hz + dz * k;
    }
  }
  const rootY = h - r.hip.y;

  // ── leg IK in the pelvis frame
  const cyP = Math.cos(-pelvisYaw),
    syP = Math.sin(-pelvisYaw),
    cr = Math.cos(-pelvisRoll),
    sr = Math.sin(-pelvisRoll);
  const hcY = r.hip.y;
  for (let li = 0; li < 2; li++) {
    const leg = li === 0 ? legA : legB;
    const left = leg === legA;
    let tx = leg.x - sway,
      ty = leg.y - rootY - hcY,
      tz = leg.z;
    const x1 = cyP * tx + syP * tz,
      z1 = -syP * tx + cyP * tz;
    const x2 = cr * x1 - sr * ty,
      y2 = sr * x1 + cr * ty;
    tx = x2;
    ty = y2 + hcY;
    tz = z1;
    const sg = left ? 1 : -1;
    const hx = sg * r.hip.x;
    const restLat = r.ankle.x - r.hip.x;
    const dy = r.hip.y - ty;
    const lat = (tx - hx) * sg;
    const abd = Math.atan2(lat, dy) - Math.atan2(restLat, r.hip.y - r.ankle.y);
    const dyEff = hyp2(dy, lat - restLat);
    legIK(r, r.hip.y, r.hip.z, r.hip.y - dyEff, tz, leg.pitch, solve);
    // planted feet: the foot yaw turns about the vertical through the ankle (shader / fkPoint), so the
    // heading is exact in one step: wanted heading minus the heading of the un-yawed chain
    let fy = leg.twist;
    if (leg.stance && Math.abs(fy) > 1e-4) {
      const want = pelvisYaw + (left ? -fy : fy);
      const hd = footHeading(left, 0, solve.ankle, solve.knee, solve.flex, abd, pelvisYaw, pelvisRoll);
      fy = clamp((left ? -1 : 1) * wrapA(want - hd), -0.8, 0.8);
    }
    leg.twist = fy;
    if (left) {
      o.hipFlexL = solve.flex;
      o.kneeL = solve.knee;
      o.ankleL = solve.ankle;
      o.hipAbdL = abd;
      o.footYawL = fy;
    } else {
      o.hipFlexR = solve.flex;
      o.kneeR = solve.knee;
      o.ankleR = solve.ankle;
      o.hipAbdR = abd;
      o.footYawR = fy;
    }
  }

  // ── walk plants for the next frame
  if (state) {
    for (let i = 0; i < 2; i++) {
      const W = i === 0 ? walkA : walkB;
      const L = i === 0 ? legA : legB;
      const f = state.feet[i];
      const left = i === 0;
      const u = left ? uL : uR;
      if (gw <= 0.001) {
        // standing: walking resumes from the stand plants
        f.valid = true;
        f.stance = true;
        f.wx = state.sp[i].wx;
        f.wz = state.sp[i].wz;
        f.wyaw = state.sp[i].wyaw;
        f.sx = L.x;
        f.sz = L.z;
        f.sy = L.y;
        f.stw = L.twist;
      } else if (W.stance) {
        if (!f.stance || !f.valid) {
          // heel strike (or first frame): store the flat-foot reference and heading in world space
          toWorld(L.x, p.zHS - u * p.S, tmpW);
          f.wx = tmpW.wx;
          f.wz = tmpW.wz;
          f.wyaw = m.yaw + pelvisYaw;
        }
        f.stance = true;
        f.valid = true;
      } else {
        if (f.stance || !f.valid) {
          f.sx = L.x;
          f.sz = L.z + (u - p.beta) * p.S;
          f.sy = L.y;
          f.stw = L.twist;
        }
        f.stance = false;
        f.valid = true;
      }
      copyPlan(state.last[i], L);
    }
    state.lastPhase = m.phase;
    state.lastX = m.x;
    state.lastZ = m.z;
    state.frame = frame;
    state.lastT = t;
    state.lastYaw = m.yaw;
  }

  // ── upper body
  o.rootX = sway;
  o.rootY = rootY;
  o.pelvisYaw = pelvisYaw;
  o.pelvisRoll = pelvisRoll;
  o.waistBend = (mix(0.04, 0.13, run) + 0.012 * clamp(vRel / 1.3, 0, 1.4)) * gw;
  const chestTwist = mix(0.06, 0.12, run) * clamp(kWalk, 0, 1.2) * Math.cos(TAU * uL) * (1 - 0.5 * r.old);
  o.waistTwist = -pelvisYaw;
  o.chestTwist = chestTwist;
  o.headYawCorr = -chestTwist;
  o.headPitch = (-0.3 * (rootY - (p.hStand - p.bob * 0.5 - r.hip.y)) - 0.02 * run) * gw;
  // arms: opposite to the legs, slightly lagging, more forward than back; elbows bend in front
  const kidK = r.c > 0.4 ? 1.15 : 1;
  const A = mix((0.17 + 0.12 * Math.min(vRel, 2)) * kidK * (1 - 0.55 * r.old), 0.5, run) * clamp(kWalk * 1.2, 0, 1);
  const fL = -Math.cos(TAU * (uL - 0.05));
  const fR = -fL;
  const bias = mix(0.05, 0.12, run) * gw;
  o.shFlexL = bias + A * fL;
  o.shFlexR = bias + A * fR;
  const eBase = mix(0.24 + 0.15 * r.old, 1.45, run * gw);
  const eSw = mix(0.4 * clamp(A / 0.33, 0, 1.2), 0.25, run);
  o.elbowL = eBase + eSw * Math.max(0, fL) * (1 - 0.3 * run) - 0.1 * run * fL;
  o.elbowR = eBase + eSw * Math.max(0, fR) * (1 - 0.3 * run) - 0.1 * run * fR;
  o.shAbdL = mix(0.05, 0.12, run);
  o.shAbdR = o.shAbdL;
  // cane (right hand): planted with the left foot's stance, swung forward with its swing
  o.caneX = -(r.hip.x * 2.3 + 0.05);
  o.caneZ = legA.z + 0.06;
  o.run = run;
  return o;
}

/** debug access for node tools: the last leg plans (body frame, figure units) */
export const gaitDebug = { legA, legB, params: P };
