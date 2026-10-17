// Joint angles of one figure (the values the vertex shader reads, see shader.ts POSE_KEYS) and a
// JS mirror of the shader's forward kinematics (hand positions for leashes / prams, foot checks).
//
// Conventions (figure faces +Z, left = +X, radians):
//   hipFlex / shFlex  + = limb forward        knee / elbow  + = bent
//   ankle  + = toes up (dorsiflexion)          wrist  + = fingers forward
//   hipAbd / shAbd  + = limb outward (both sides)   shTwist  + = internal rotation
//   waistBend / chestBend / headPitch  + = forward / down     *Yaw / *Twist  + = towards the left
//   pelvisRoll  + = left hip up      bodyPitch  − = lying on the back
//   rootX/Y/Z  offsets in figure units (applied before the instance scale)

import { POSE_KEYS, type PoseKey } from './shader';
import type { Rig, V3 } from './rig';
import { BONE } from './body';

export type Pose = Record<PoseKey, number>;

export function newPose(): Pose {
  const p = {} as Pose;
  for (const k of POSE_KEYS) p[k] = 0;
  p.scale = 1;
  p.fade = 1;
  return p;
}

export function resetPose(p: Pose): void {
  for (const k of POSE_KEYS) p[k] = 0;
  p.scale = 1;
  p.fade = 1;
}

// ───────────────────────────────────────────────────── JS forward kinematics ──

type M3 = Float64Array; // row-major 3×3

const tmpA = new Float64Array(9),
  tmpB = new Float64Array(9),
  tmpC = new Float64Array(9);

function rX(a: number, o: M3): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  o.set([1, 0, 0, 0, c, -s, 0, s, c]);
  return o;
}
function rY(a: number, o: M3): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  o.set([c, 0, s, 0, 1, 0, -s, 0, c]);
  return o;
}
function rZ(a: number, o: M3): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  o.set([c, -s, 0, s, c, 0, 0, 0, 1]);
  return o;
}
function mm(a: M3, b: M3, o: M3): M3 {
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  o.set(r);
  return o;
}
function rotAbout(p: V3, m: M3, pv: V3): void {
  const x = p.x - pv.x,
    y = p.y - pv.y,
    z = p.z - pv.z;
  p.x = m[0] * x + m[1] * y + m[2] * z + pv.x;
  p.y = m[3] * x + m[4] * y + m[5] * z + pv.y;
  p.z = m[6] * x + m[7] * y + m[8] * z + pv.z;
}
const mir = (v: V3, left: boolean, o: V3): V3 => {
  o.x = left ? v.x : -v.x;
  o.y = v.y;
  o.z = v.z;
  return o;
};
const pvTmp = { x: 0, y: 0, z: 0 };

export function hipMatrix(P: Pose, left: boolean, o: M3): M3 {
  const fl = left ? P.hipFlexL : P.hipFlexR,
    ab = left ? P.hipAbdL : P.hipAbdR;
  return mm(rZ(left ? ab : -ab, tmpA), rX(-fl, tmpB), o);
}
export function shoulderMatrix(P: Pose, left: boolean, o: M3): M3 {
  const fl = left ? P.shFlexL : P.shFlexR,
    ab = left ? P.shAbdL : P.shAbdR,
    tw = left ? P.shTwistL : P.shTwistR;
  mm(rZ(left ? ab : -ab, tmpA), rX(-fl, tmpB), tmpC);
  return mm(tmpC, rY(left ? -tw : tw, tmpA), o);
}

const M = new Float64Array(9);

/** Pelvis / whole-body transform and root offsets (figure units), as pedPelvis in the shader. */
export function fkPelvis(r: Rig, P: Pose, p: V3): V3 {
  mm(rX(P.bodyPitch, tmpA), rY(P.pelvisYaw, tmpB), tmpC);
  mm(tmpC, rZ(P.pelvisRoll, tmpA), M);
  pvTmp.x = 0;
  pvTmp.y = r.hip.y;
  pvTmp.z = 0;
  rotAbout(p, M, pvTmp);
  p.x += P.rootX;
  p.y += P.rootY;
  p.z += P.rootZ;
  return p;
}

/**
 * Pose a rest point (figure units) that belongs to `bone` through the chain and the pelvis, exactly
 * like the vertex shader (without skin weights). Mutates and returns p (figure units, pre-scale).
 */
export function fkPoint(r: Rig, P: Pose, bone: number, p: V3): V3 {
  let b = bone;
  if (b === BONE.HAND_L || b === BONE.HAND_R) {
    const L = b === BONE.HAND_L;
    rotAbout(p, rX(-(L ? P.wristL : P.wristR), M), mir(r.wrist, L, pvTmp));
    b = L ? BONE.FORE_L : BONE.FORE_R;
  }
  if (b === BONE.FORE_L || b === BONE.FORE_R) {
    const L = b === BONE.FORE_L;
    rotAbout(p, rX(-(L ? P.elbowL : P.elbowR), M), mir(r.elbow, L, pvTmp));
    b = L ? BONE.UPPER_L : BONE.UPPER_R;
  }
  if (b === BONE.UPPER_L || b === BONE.UPPER_R) {
    const L = b === BONE.UPPER_L;
    rotAbout(p, shoulderMatrix(P, L, M), mir(r.shoulder, L, pvTmp));
    b = BONE.CHEST;
  }
  if (b === BONE.HEAD) {
    mm(rY(P.headYaw, tmpA), rX(P.headPitch, tmpB), tmpC);
    rotAbout(p, mm(tmpC, rZ(P.headRoll, tmpA), M), r.head);
    b = BONE.CHEST;
  }
  if (b === BONE.CHEST) {
    mm(rY(P.chestTwist, tmpA), rX(P.chestBend, tmpB), tmpC);
    rotAbout(p, mm(tmpC, rZ(P.chestRoll, tmpA), M), r.chest);
    b = BONE.SPINE;
  }
  if (b === BONE.SPINE) {
    rotAbout(p, mm(rY(P.waistTwist, tmpA), rX(P.waistBend, tmpB), M), r.waist);
    b = BONE.PELVIS;
  }
  if (b === BONE.FOOT_L || b === BONE.FOOT_R) {
    const L = b === BONE.FOOT_L;
    rotAbout(p, rX(-(L ? P.ankleL : P.ankleR), M), mir(r.ankle, L, pvTmp));
    b = L ? BONE.SHIN_L : BONE.SHIN_R;
  }
  if (b === BONE.SHIN_L || b === BONE.SHIN_R) {
    const L = b === BONE.SHIN_L;
    rotAbout(p, rX(L ? P.kneeL : P.kneeR, M), mir(r.knee, L, pvTmp));
    b = L ? BONE.THIGH_L : BONE.THIGH_R;
  }
  if (b === BONE.THIGH_L || b === BONE.THIGH_R) {
    const L = b === BONE.THIGH_L;
    rotAbout(p, hipMatrix(P, L, M), mir(r.hip, L, pvTmp));
  }
  return fkPelvis(r, P, p);
}

/** grip point (palm centre) of a hand in figure units, posed */
export function gripPoint(r: Rig, P: Pose, left: boolean, out: V3): V3 {
  const s = left ? 1 : -1;
  out.x = (r.wrist.x + (r.tip.x - r.wrist.x) * 0.42) * s;
  out.y = r.wrist.y + (r.tip.y - r.wrist.y) * 0.42;
  out.z = r.wrist.z + (r.tip.z - r.wrist.z) * 0.42;
  return fkPoint(r, P, left ? BONE.HAND_L : BONE.HAND_R, out);
}

// ──────────────────────────────────────────────────────────────── leg IK ──

export interface LegSolve {
  flex: number;
  knee: number;
  /** ankle angle that keeps the sole at `pitch` (toe-up) */
  ankle: number;
  /** false when the target was out of reach (leg fully stretched towards it) */
  reached: boolean;
}

/**
 * Sagittal 2-bone IK for one leg: hip pivot at (hy, hz), ankle target (ay, az) in the leg's rest
 * frame (figure units, pelvis frame). Returns hip flexion, knee flexion and the ankle angle that
 * gives a sole pitch of `pitch` (radians, + = toes up). Uses the rig's rest angles.
 */
export function legIK(r: Rig, hy: number, hz: number, ay: number, az: number, pitch: number, o: LegSolve): LegSolve {
  const L1 = Math.hypot(r.knee.y - r.hip.y, r.knee.z - r.hip.z);
  const L2 = Math.hypot(r.ankle.y - r.knee.y, r.ankle.z - r.knee.z);
  const t0 = Math.atan2(r.knee.z - r.hip.z, r.hip.y - r.knee.y); // rest thigh angle (forward of down)
  const s0 = Math.atan2(r.ankle.z - r.knee.z, r.knee.y - r.ankle.y); // rest shin angle
  const k0 = t0 - s0;
  const dy = hy - ay,
    dz = az - hz;
  let d = Math.hypot(dy, dz);
  const dMax = (L1 + L2) * 0.9995;
  o.reached = d <= dMax;
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-4), dMax);
  const alpha = Math.atan2(dz, dy);
  const cb = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const beta = Math.acos(Math.max(-1, Math.min(1, cb)));
  const ck = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
  const inner = Math.acos(Math.max(-1, Math.min(1, ck)));
  const thigh = alpha + beta;
  const shin = thigh - (Math.PI - inner);
  o.flex = thigh - t0;
  o.knee = thigh - shin - k0;
  o.ankle = pitch - (shin - s0);
  return o;
}
