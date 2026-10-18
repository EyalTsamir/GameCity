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
import { legIKa, LIK, type LegSolve } from './pose';
import { stepLength, type Rig } from './rig';

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
// The hot paths only use helpers small enough to be inlined everywhere: a call left un-inlined boxes its
// computed double arguments and its double result (16 B of garbage each), so smoothsteps are written as
// sm(cl01((x − a) / (b − a))), and the frame conversions take objects (toBody / toWorld).
const cl01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (t: number) => t * t * (3 - 2 * t);
const frac = (x: number) => x - Math.floor(x);
const wrapA = (a: number) => a - TAU * Math.round(a / TAU);

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
  /** quick re-step of a planted foot left too far off its path (sharp corners): progress 0…1, −1 = none,
   *  and the world point it started from */
  qs: number;
  qfx: number;
  qfz: number;
  /** pivot memory 0…1: the foot turning on the ball (heel lifted) or on the heel (toes lifted) */
  pv: number;
  /** sole pitch of the last frame (picks the contact point a pivot turns about) */
  pp: number;
  /** duration of the quick re-step (s): it must land before the stance ends */
  qd: number;
  /** early toe-off (cycle fraction) of an over-stretched trailing foot at a corner; ≥ 1 = none */
  lo: number;
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
  /** smoothed gait root (world): the crowd's root turns route corners with heading snaps; the feet and the
   *  drawn figure follow this C1 path instead (≤ ~10 cm off the root at the sharpest corners) */
  sx: number;
  sz: number;
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
  const f = (): FootPlant => ({ wx: 0.5, wz: 0.5, wyaw: 0.5, sx: 0.5, sz: 0.5, sy: 0.5, stw: 0.5, stance: false, valid: false, qs: -1.5, qfx: 0.5, qfz: 0.5, pv: 0.5, pp: 0.5, qd: 0.5, lo: 1.5 });
  const s = (): StandFoot => ({ wx: 0.5, wz: 0.5, wyaw: 0.5 });
  return { feet: [f(), f()], lastPhase: 0.5, frame: -10, lastT: 0.5, lastYaw: 0.5, yawRate: 0.5, standing: false, sp: [s(), s()], stepFoot: -1, stepT: 0.5, stepFrom: s(), stepTo: s(), last: [newPlan(), newPlan()], lastX: 0.5, lastZ: 0.5, sx: 0.5, sz: 0.5 };
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
const solve: LegSolve = { flex: 0.5, knee: 0.5, ankle: 0.5, reached: true };
// reach test of a rising stance foot (gaitPose): [fx − hip x, fz, sin hr, cos hr, fz − hip z, h + roll offset, reach²]
const RQ = new Float64Array(7);
function fitsReach(r: Rig, pitch: number): boolean {
  G.rz = RQ[1];
  G.rp = pitch;
  rollAnkle(r, legTmp);
  const dzr = legTmp.z - RQ[1];
  const ax = RQ[0] + RQ[2] * dzr,
    az = RQ[4] + RQ[3] * dzr,
    ay = RQ[5] - legTmp.y;
  return ax * ax + az * az + ay * ay <= RQ[6];
}
// walk stance legs of this call: flat-foot reference (body frame), roll heading, valid flag (A: 0–3, B: 4–7)
const WREF = new Float64Array(8);

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
const P: Params = { S: 1.5, beta: 0.62, run: 0.5, zHS: 0.5, thHS: 0.5, thTO: 0.5, uFlat: 0.5, uRise: 0.5, width: 0.5, lift: 0.5, hStand: 0.5, bob: 0.5 };

function params(r: Rig, pram: boolean): Params {
  const v = G.v;
  const s = r.s;
  const step = stepLength(r, v) * (pram ? 0.9 : 1);
  const S = (2 * step) / s;
  const run = sm(cl01((v - 1.95) / 0.35));
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
function rollAnkle(r: Rig, o: LegPlan): void {
  const fz = G.rz,
    pitch = G.rp;
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

// per-call scalars of the current member, in one object with double fields: a module-level `let` holding a
// double is re-boxed on every write (16 B of garbage each), a double field is updated in place.
//   kappa: path curvature (per figure unit, + = turning left); dt: frame time; qlift: lift of a quick re-step
//   being planned; urate: cycle fraction per second; bx, bz, cy, sy, sc, yaw: world ↔ body frame
const G = { kappa: 0.5, dt: 0.5, qlift: 0.5, urate: 0.5, bx: 0.5, bz: 0.5, cy: 0.5, sy: 0.5, sc: 0.5, yaw: 0.5, uL: 0.5, uR: 0.5, pyaw: 0.5, proll: 0.5, v: 0.5, rz: 0.5, rp: 0.5, abd: 0.5, hd: 0.5, need: 0.5 };
// …and the other per-call inputs: uL / uR leg cycle fractions, pyaw / proll pelvis yaw / roll, v speed,
// rz / rp rollAnkle's flat-foot z and pitch, abd / hd footHeading's abduction in and heading out
/** gaitPose inputs t (s) and gw (0 stand … 1 walk), passed as fields for the same reason */
export const gaitIn = { t: 0.5, gw: 0.5 };
const toBody = (src: { wx: number; wz: number }, o: { x: number; z: number }) => {
  const dx = (src.wx - G.bx) / G.sc,
    dz = (src.wz - G.bz) / G.sc;
  o.x = G.cy * dx - G.sy * dz;
  o.z = G.sy * dx + G.cy * dz;
};
const toWorld = (src: { x: number; z: number }, o: { wx: number; wz: number }) => {
  const x = src.x * G.sc,
    z = src.z * G.sc;
  o.wx = G.bx + G.cy * x + G.sy * z;
  o.wz = G.bz - G.sy * x + G.cy * z;
};
const tmpB = { x: 0.5, z: 0.5 };
const tmpW = { wx: 0.5, wz: 0.5 };
const tmpI = { x: 0.5, z: 0.5 };


/**
 * Horizontal heading (relative to the body) of a foot's forward axis through the chain
 * foot yaw → ankle → knee → hip flex / abduction → pelvis yaw / roll (as the shader applies them).
 */
function footHeading(left: boolean, sv: LegSolve): void {
  const fy = 0,
    ankle = sv.ankle,
    knee = sv.knee,
    flex = sv.flex,
    abd = G.abd,
    pYaw = G.pyaw,
    pRoll = G.proll;
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
  {
    const c = Math.cos(knee),
      s = Math.sin(knee);
    const y2 = c * y - s * z,
      z2 = s * y + c * z;
    y = y2;
    z = z2;
  }
  {
    const c = Math.cos(-flex),
      s = Math.sin(-flex);
    const y2 = c * y - s * z,
      z2 = s * y + c * z;
    y = y2;
    z = z2;
  }
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
  G.hd = Math.atan2(x, z);
}

/** plan one leg at its own cycle fraction u (0 = its heel strike) */
function planWalk(r: Rig, left: boolean, plant: FootPlant | null, o: LegPlan): void {
  const u = left ? G.uL : G.uR,
    pelvisYaw = G.pyaw;
  const p = P;
  const x0 = (left ? 1 : -1) * p.width;
  const wr = left ? 0 : 4;
  WREF[wr + 3] = 0;
  // toe-off: normally at beta, earlier for a trailing foot the body has walked away from (corners)
  const ub = plant && plant.valid && plant.lo < p.beta && u >= plant.lo ? plant.lo : p.beta;
  if (u < ub) {
    o.stance = true;
    o.s = -1;
    let fz = p.zHS - u * p.S;
    // law position on the (possibly curved) path
    let fx = x0 * Math.cos(G.kappa * fz) + (G.kappa * fz * fz) / 2;
    o.twist = 0;
    if (plant && plant.valid && plant.stance) {
      // tight turns: a planted foot never twists more than ±0.6 rad against the pelvis — beyond that it
      // pivots about its contact point (the heel while the heel carries, else the ball), as people do
      const rel = wrapA(plant.wyaw - G.yaw - pelvisYaw);
      plant.pv = Math.max(0, plant.pv - G.dt * 5);
      if (Math.abs(rel) > 0.6) {
        plant.pv = Math.min(1, plant.pv + G.dt * 15);
        const e = rel - Math.sign(rel) * 0.6;
        // the point the sole touches with (last frame's pitch): heel / heel back, ball, or toe tip
        const pp = plant.pp,
          S = r.sole;
        let pz: number;
        if (pp > 0.01) pz = pp > Math.atan2(S[0].y - S[1].y, S[1].z - S[0].z) ? S[1].z - hyp2(S[1].z - S[0].z, S[0].y - S[1].y) : S[1].z;
        else if (pp < -Math.atan2(S[3].y - S[2].y, S[3].z - S[2].z)) pz = S[2].z + hyp2(S[3].z - S[2].z, S[3].y - S[2].y);
        else pz = u < p.uFlat ? S[1].z : S[2].z;
        pz *= G.sc;
        const pxw = plant.wx + Math.sin(plant.wyaw) * pz,
          pzw = plant.wz + Math.cos(plant.wyaw) * pz;
        plant.wyaw -= e;
        plant.wx = pxw - Math.sin(plant.wyaw) * pz;
        plant.wz = pzw - Math.cos(plant.wyaw) * pz;
      }
      toBody(plant, tmpB);
      const ex = tmpB.x - fx,
        ez = tmpB.z - fz;
      if (Math.abs(ex) < 1.2 && Math.abs(ez) < 1.2) {
        // sharp corners (the crowd's heading snaps): a planted foot left too far off its path is lifted
        // and put back on it with a short quick step (0.2 s) — never dragged, never split into a long stride
        // (0.2 s, shorter late in the stance so that it lands before the toe-off; too late → no re-step)
        if (plant.qs < 0 && (Math.abs(ex) > 0.16 || Math.abs(ez) > 0.24)) {
          const left = G.urate > 1e-3 ? (p.beta - 0.03 - u) / G.urate : 0;
          if (left > 0.11) {
            plant.qs = 0;
            plant.qd = Math.min(0.2, left);
            plant.qfx = plant.wx;
            plant.qfz = plant.wz;
          }
        }
        if (plant.qs >= 0) {
          plant.qs = Math.min(1, plant.qs + G.dt / plant.qd);
          const e = sm(cl01(plant.qs));
          tmpI.x = fx;
          tmpI.z = fz;
          toWorld(tmpI, tmpW);
          plant.wx = mix(plant.qfx, tmpW.wx, e);
          plant.wz = mix(plant.qfz, tmpW.wz, e);
          plant.wyaw += wrapA(G.yaw + pelvisYaw - plant.wyaw) * e;
          G.qlift = 0.045 * (r.legLen / r.s / 0.93) * Math.sin(Math.PI * plant.qs);
          if (plant.qs >= 1) plant.qs = -1;
          toBody(plant, tmpB);
          fx = tmpB.x;
          fz = tmpB.z;
        } else {
          // safety net beyond the quick-step thresholds (late stance): drag rather than jump
          const cx = clamp(ex, -0.25, 0.25),
            cz = clamp(ez, -0.32, 0.32);
          if (cx !== ex || cz !== ez) {
            tmpI.x = fx + cx;
            tmpI.z = fz + cz;
            toWorld(tmpI, tmpW);
            plant.wx = tmpW.wx;
            plant.wz = tmpW.wz;
          }
          fz += cz;
          fx += cx;
        }
        const rel = wrapA(plant.wyaw - G.yaw - pelvisYaw);
        o.twist = clamp(left ? -rel : rel, -0.7, 0.7);
      } else plant.valid = false; // teleported: re-plant on the law
    }
    let pitch: number;
    if (u < p.uFlat) pitch = p.thHS * (1 - sm(cl01(u / p.uFlat)));
    else if (u < p.uRise) pitch = 0;
    else pitch = p.thTO * Math.pow(sm(cl01((u - p.uRise) / (p.beta - p.uRise))), 1.25);
    // pivoting: on the ball with the heel up (or on the heel with the toes up), so nothing scrapes round
    if (plant && plant.valid && plant.stance && plant.pv > 0) pitch = u < p.uFlat ? Math.max(pitch, 0.16 * plant.pv) : Math.min(pitch, -0.16 * plant.pv);
    G.rz = fz;
    G.rp = pitch;
    rollAnkle(r, o);
    // the roll displaces the ankle along the foot's own heading
    const hr = plant && plant.valid && plant.stance ? wrapA(plant.wyaw - G.yaw) : 0;
    const dzr = o.z - fz;
    o.x = fx + Math.sin(hr) * dzr;
    o.z = fz + Math.cos(hr) * dzr;
    WREF[wr] = fx;
    WREF[wr + 1] = fz;
    WREF[wr + 2] = hr;
    WREF[wr + 3] = G.qlift > 0 ? 0 : 1;
    if (G.qlift > 0) {
      // quick re-step in the air: lifted, flat-ish, clear of the ground
      o.y += G.qlift;
      pitch *= 1 - Math.min(1, G.qlift * 40);
      G.qlift = 0;
    }
    o.pitch = pitch;
  } else {
    o.stance = false;
    const s = (u - ub) / (1 - ub);
    o.s = s;
    // the sole leaves at the pitch it had (an early or deep push-off), else at the nominal toe-off
    const th0 = plant && plant.valid ? Math.min(plant.pp, 0) : p.thTO;
    const toZ = p.zHS - ub * p.S;
    G.rz = toZ;
    G.rp = p.thTO;
    rollAnkle(r, legTmp);
    const zLaw = legTmp.z - (u - ub) * p.S;
    let z0 = zLaw;
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
      toBody(plant, tmpB);
      if (Math.abs(tmpB.z - (toZ - (u - ub) * p.S)) < 0.35) {
        G.rz = tmpB.z;
        G.rp = th0;
        rollAnkle(r, legTmp);
        // roll offset along the foot's heading, as in its last stance frame
        const hr = wrapA(plant.wyaw - G.yaw);
        const dzr = legTmp.z - tmpB.z;
        z0 = tmpB.z + Math.cos(hr) * dzr;
        y0 = legTmp.y;
        xs = tmpB.x + Math.sin(hr) * dzr;
        const rel = wrapA(plant.wyaw - G.yaw - pelvisYaw);
        tw0 = clamp(left ? -rel : rel, -0.7, 0.7);
      }
    }
    // a foot that left further back than its normal toe-off (corners) catches up once it is off the
    // ground instead of trailing a straight leg behind the body
    if (z0 < zLaw) z0 = zLaw + (z0 - zLaw) * (1 - sm(cl01((s - 0.03) / 0.32)));
    G.rz = p.zHS;
    G.rp = p.thHS;
    rollAnkle(r, legTmp);
    const z1 = legTmp.z + (1 - u) * p.S,
      y1 = legTmp.y;
    // turning: the landing point lies on the curved path (lateral offset κ·D²/2, side offset rotated)
    const x1 = x0 * Math.cos(G.kappa * z1) + (G.kappa * z1 * z1) / 2;
    const e = s - Math.sin(TAU * s) / TAU; // ground-frame ease: leaves and lands at rest
    o.z = mix(z0, z1, e);
    o.x = mix(xs, x1, sm(cl01(s / 0.7)));
    o.twist = tw0 * (1 - sm(cl01(s / 0.5)));
    const pm = 0.08;
    o.pitch = s < 0.45 ? mix(th0, pm, sm(cl01(s / 0.45))) : mix(pm, p.thHS, sm(cl01((s - 0.45) / 0.55)));
    // height: down to the landing height by mid-swing + an early bump (heel high behind the body)
    const bump = s < 0.7 ? Math.pow(Math.sin((Math.PI * s) / 0.7), 1.2) : 0;
    o.y = mix(y0, y1, sm(cl01((s - 0.05) / 0.57))) + p.lift * bump * (1 - 0.4 * s) + 0.012 * Math.sin(Math.PI * s);
    G.need = 0.016 * sm(cl01((s - 0.02) / 0.13)) * (1 - sm(cl01((s - 0.85) / 0.15)));
    clearance(r, o);
  }
}

/** lift a foot in the air so its toe and heel clear the ground by `need` */
function clearance(r: Rig, o: LegPlan): void {
  const need = G.need;
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
function planStand(r: Rig, st: GaitState): void {
  const dt = G.dt,
    pelvisYaw = G.pyaw;
  const hk = r.legLen / r.s / 0.93;
  const hx0 = r.ankle.x * 1.05 + 0.006 * r.old; // homeX of the left foot
  // a planted foot far from where it belongs (figure placed or moved while standing) is put back at
  // once — re-stepping needs time, and that stalls while the simulation is paused
  for (let i = 0; i < 2; i++) {
    const left = i === 0;
    const f = st.sp[i];
    toBody(f, tmpB);
    const dx = tmpB.x - (left ? hx0 : -hx0),
      dz = tmpB.z;
    if (dx * dx + dz * dz > 0.36 * hk * hk) {
      tmpI.x = left ? hx0 : -hx0;
      tmpI.z = (left ? 0.02 : -0.02) * hk;
      toWorld(tmpI, tmpW);
      f.wx = tmpW.wx;
      f.wz = tmpW.wz;
      f.wyaw = G.yaw;
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
      toBody(st.sp[i], tmpB);
      const dx = tmpB.x - (left ? hx0 : -hx0),
        dz = tmpB.z - (left ? 0.02 : -0.02) * hk;
      const d = hyp2(dx * 1.4, dz) / hk;
      const yawErr = Math.abs(wrapA(st.sp[i].wyaw - G.yaw));
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
      tmpI.x = left ? hx0 : -hx0;
      tmpI.z = (left ? 0.02 : -0.02) * hk;
      toWorld(tmpI, tmpW);
      st.stepTo.wx = tmpW.wx;
      st.stepTo.wz = tmpW.wz;
      st.stepTo.wyaw = G.yaw;
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
      const e = sm(cl01(st.stepT));
      wx = mix(st.stepFrom.wx, st.stepTo.wx, e);
      wz = mix(st.stepFrom.wz, st.stepTo.wz, e);
      wyaw = st.stepFrom.wyaw + wrapA(st.stepTo.wyaw - st.stepFrom.wyaw) * e;
      lift = 0.045 * hk * Math.sin(Math.PI * clamp(st.stepT, 0, 1));
    }
    tmpW.wx = wx;
    tmpW.wz = wz;
    toBody(tmpW, tmpB);
    o.x = tmpB.x;
    o.z = tmpB.z;
    o.pitch = lift > 0 ? 0.12 * Math.sin(Math.PI * st.stepT) : 0;
    o.y = r.ankleH + lift;
    if (lift > 0) {
      G.need = lift * 0.6;
      clearance(r, o);
    }
    const rel = wrapA(wyaw - G.yaw - pelvisYaw);
    o.twist = clamp(left ? -rel : rel, -0.7, 0.7);
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

export function gaitPose(m: Member, r: Rig, st: GaitState | null, frame: number, idle: IdleShift, o: GaitOut): GaitOut {
  const t = gaitIn.t,
    gw = gaitIn.gw;
  const v = m.speed;
  G.v = v;
  const pram = !!m.look.pram;
  const p = params(r, pram);
  const state = st;
  const dt = state ? clamp(t - state.lastT, 0, 0.1) : 0;
  G.dt = dt;
  G.urate = 0;
  let fresh = true;
  if (state) {
    // not drawn last frame, or moved further than any walk can in one frame (placed / teleported)
    const jx = m.x - state.lastX,
      jz = m.z - state.lastZ;
    fresh = frame - state.frame > 1 || jx * jx + jz * jz > 2.25;
    const jump = Math.abs(m.phase - state.lastPhase) / TAU;
    G.urate = dt > 1e-4 && !fresh ? clamp((m.phase - state.lastPhase) / TAU / dt, 0, 4) : 0;
    if (fresh) {
      state.feet[0].valid = state.feet[1].valid = false;
      state.standing = false;
      state.stepFoot = -1;
    } else if (jump > 0.3) state.feet[0].valid = state.feet[1].valid = false;
    // smoothed gait root: this frame's displacement taken along the crowd's smoothed velocity (which turns
    // with the body's yaw), then pulled back towards the true root — on straight walks it is the root
    const ox = m.x - state.sx,
      oz = m.z - state.sz;
    if (fresh || ox * ox + oz * oz > 1) {
      state.sx = m.x;
      state.sz = m.z;
    } else {
      const dx = m.x - state.lastX,
        dz = m.z - state.lastZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      const vl = Math.sqrt(m.vx * m.vx + m.vz * m.vz);
      let nx = state.sx + (vl > 1e-3 ? (m.vx / vl) * d : dx),
        nz = state.sz + (vl > 1e-3 ? (m.vz / vl) * d : dz);
      const c = 1 - Math.exp(-dt * 6);
      nx += (m.x - nx) * c;
      nz += (m.z - nz) * c;
      state.sx = nx;
      state.sz = nz;
    }
  }
  G.bx = state ? state.sx : m.x;
  G.bz = state ? state.sz : m.z;
  G.yaw = m.yaw;
  G.cy = Math.cos(m.yaw);
  G.sy = Math.sin(m.yaw);
  G.sc = r.s;
  const uL = frac(m.phase / TAU);
  const uR = frac(uL + 0.5);
  G.kappa = 0;
  if (state && !fresh && dt > 1e-4) {
    const w = wrapA(m.yaw - state.lastYaw) / dt;
    state.yawRate += (w - state.yawRate) * Math.min(1, dt * 6);
    G.kappa = clamp(state.yawRate / Math.max(0.35, v), -1.6, 1.6) * G.sc;
  } else if (state) state.yawRate = 0;
  const run = p.run;
  const vRel = v / Math.sqrt(r.legLen / 0.93);
  const kWalk = clamp(vRel / 1.3, 0, 1.4) * gw;
  // pelvis motion (rotation forward with the swing leg, list towards the swing side, sway to the stance side)
  const ig = 1 - gw;
  const pelvisYaw = -mix(0.075, 0.12, run) * kWalk * Math.cos(TAU * uL) * (1 - 0.4 * r.old) + idle.yaw * ig;
  const pelvisRoll = mix(0.05, 0.03, run) * clamp(kWalk, 0, 1) * Math.sin(TAU * uL) + idle.roll * ig;
  const sway = (mix(0.018, 0.008, run) * (r.legLen / r.s / 0.93) * clamp(kWalk, 0, 1) + 0.006 * r.old * gw) * Math.sin(TAU * uL) + idle.sway * ig;
  G.uL = uL;
  G.uR = uR;
  G.pyaw = pelvisYaw;
  G.proll = pelvisRoll;

  // ── walk targets
  if (gw > 0.001) {
    planWalk(r, true, state ? state.feet[0] : null, walkA);
    planWalk(r, false, state ? state.feet[1] : null, walkB);
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
          tmpI.x = (left ? 1 : -1) * p.width;
          tmpI.z = p.zHS + (1 - u) * p.S;
          toWorld(tmpI, tmpW);
          sp.wx = tmpW.wx;
          sp.wz = tmpW.wz;
          sp.wyaw = m.yaw + pelvisYaw;
        } else {
          const src = state.last[i];
          tmpI.x = fresh ? homeX(r, left) : src.x;
          tmpI.z = fresh ? 0 : src.z;
          toWorld(tmpI, tmpW);
          sp.wx = tmpW.wx;
          sp.wz = tmpW.wz;
          sp.wyaw = m.yaw;
        }
      }
      state.standing = true;
      state.stepFoot = -1;
    }
    planStand(r, state);
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
    else if (leg.s > 0.8) {
      let e = (leg.s - 0.8) / 0.17;
      e = e > 1 ? 1 : e;
      h = Math.min(h, h + (maxH - h) * e * e * (3 - 2 * e));
    }
  }
  // never crouch for a foot left far behind (sharp corners): pull that foot in instead
  h = Math.max(h, hNom - 0.045 * (r.legLen / r.s / 0.93));
  let stretched = 0;
  for (let li = 0; li < 2; li++) {
    const leg = li === 0 ? legA : legB;
    const side = leg === legA ? 1 : -1;
    const hx = side * r.hip.x;
    const cxh = hx * Math.cos(pelvisYaw) + sway,
      hz = -Math.sin(pelvisYaw) * hx;
    if (!(leg.stance || leg.s < 0.05)) {
      // a swinging (walking) foot never trails further behind the hip than ~30° (corners: it left late)
      let e0 = (leg.s - 0.03) / 0.12,
        e1 = (leg.s - 0.4) / 0.15;
      e0 = e0 < 0 ? 0 : e0 > 1 ? 1 : e0;
      e1 = e1 < 0 ? 0 : e1 > 1 ? 1 : e1;
      const w = e0 * e0 * (3 - 2 * e0) * (1 - e1 * e1 * (3 - 2 * e1)) * (1 - run);
      const zMin = hz - 0.58 * (h - (leg.y - Math.sin(pelvisRoll) * hx));
      if (w > 0 && leg.z < zMin) leg.z += (zMin - leg.z) * w;
      continue;
    }
    const dy = h - (leg.y - Math.sin(pelvisRoll) * hx);
    let dx = leg.x - cxh,
      dz = leg.z - hz;
    let dh = Math.sqrt(dx * dx + dz * dz);
    let maxD = Math.sqrt(Math.max(0, reach * reach - dy * dy));
    const wr = li * 4;
    if (dh > maxD && leg.stance && gw >= 0.999 && WREF[wr + 3] > 0) {
      // out of reach (the trailing foot at a corner): first rise onto the ball / toes — rolling exactly,
      // the contact stays put while the ankle climbs — as far as the push-off allows
      const fx = WREF[wr],
        fz = WREF[wr + 1],
        hr = WREF[wr + 2];
      const sh = Math.sin(hr),
        ch = Math.cos(hr);
      const yo = Math.sin(pelvisRoll) * hx;
      let lo = Math.min(leg.pitch, 0),
        hi = Math.min(lo, p.thTO * 1.15);
      RQ[0] = fx - cxh;
      RQ[1] = fz;
      RQ[2] = sh;
      RQ[3] = ch;
      RQ[4] = fz - hz;
      RQ[5] = h + yo;
      RQ[6] = reach * reach;
      if (hi < lo - 1e-3) {
        if (fitsReach(r, hi)) {
          for (let k = 0; k < 7; k++) {
            const mid = 0.5 * (lo + hi);
            if (fitsReach(r, mid)) hi = mid;
            else lo = mid;
          }
          if (hi < p.thTO) stretched |= 1 << li;
        } else stretched |= 1 << li;
        G.rz = fz;
        G.rp = hi;
        rollAnkle(r, legTmp);
        const dzr = legTmp.z - fz;
        leg.x = fx + sh * dzr;
        leg.z = fz + ch * dzr;
        leg.y = legTmp.y;
        leg.pitch = hi;
        const dy2 = h - (leg.y - yo);
        dx = leg.x - cxh;
        dz = leg.z - hz;
        dh = Math.sqrt(dx * dx + dz * dz);
        maxD = Math.sqrt(Math.max(0, reach * reach - dy2 * dy2));
      }
    }
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
    LIK[0] = r.hip.y;
    LIK[1] = r.hip.z;
    LIK[2] = r.hip.y - dyEff;
    LIK[3] = tz;
    LIK[4] = leg.pitch;
    legIKa(r, solve);
    // corners: a trailing foot stretched beyond a comfortable push-off leaves early, during the double
    // support (the other foot has landed) — the step ends instead of the leg dragging behind
    if (state && leg.stance && gw >= 0.999) {
      const u = left ? uL : uR;
      const f = state.feet[li];
      if (f.lo >= 1 && u > 0.52 && u < p.beta - 0.02 && (left ? legB : legA).stance && (solve.flex < -0.5 || (stretched >> li) & 1)) f.lo = u;
    }
    // planted feet: the foot yaw turns about the vertical through the ankle (shader / fkPoint), so the
    // heading is exact in one step: wanted heading minus the heading of the un-yawed chain
    let fy = leg.twist;
    if (leg.stance && Math.abs(fy) > 1e-4) {
      const want = pelvisYaw + (left ? -fy : fy);
      G.abd = abd;
      footHeading(left, solve);
      fy = clamp((left ? -1 : 1) * wrapA(want - G.hd), -0.8, 0.8);
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
        f.pp = L.pitch;
      } else if (W.stance) {
        if (!f.stance || !f.valid) {
          // heel strike (or first frame): store the flat-foot reference and heading in world space
          tmpI.x = L.x;
          tmpI.z = p.zHS - u * p.S;
          toWorld(tmpI, tmpW);
          f.wx = tmpW.wx;
          f.wz = tmpW.wz;
          f.wyaw = m.yaw + pelvisYaw;
          f.pv = 0;
          f.qs = -1;
          f.lo = 1.5;
        }
        f.pp = L.pitch;
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
export const gaitDebug = { legA, legB, walkA, walkB, params: P };
