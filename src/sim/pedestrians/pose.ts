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
  o[0] = 1; o[1] = 0; o[2] = 0;
  o[3] = 0; o[4] = c; o[5] = -s;
  o[6] = 0; o[7] = s; o[8] = c;
  return o;
}
function rY(a: number, o: M3): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  o[0] = c; o[1] = 0; o[2] = s;
  o[3] = 0; o[4] = 1; o[5] = 0;
  o[6] = -s; o[7] = 0; o[8] = c;
  return o;
}
function rZ(a: number, o: M3): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  o[0] = c; o[1] = -s; o[2] = 0;
  o[3] = s; o[4] = c; o[5] = 0;
  o[6] = 0; o[7] = 0; o[8] = 1;
  return o;
}
const mmR = new Float64Array(9);
function mm(a: M3, b: M3, o: M3): M3 {
  const r = mmR;
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
    rotAbout(p, mm(rY(L ? -P.footYawL : P.footYawR, tmpA), rX(-(L ? P.ankleL : P.ankleR), tmpB), M), mir(r.ankle, L, pvTmp));
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

// ──────────────────────────────────────────────────────────────── arm IK ──

export interface ArmSolve {
  flex: number;
  abd: number;
  twist: number;
  elbow: number;
  reached: boolean;
}

// allocation-free 3-vector scratch (the IK runs per figure per frame)
type T3 = Float64Array;
const v3 = (): T3 => new Float64Array(3);
const set3 = (o: T3, x: number, y: number, z: number): T3 => {
  o[0] = x;
  o[1] = y;
  o[2] = z;
  return o;
};
const cr3 = (a: T3, b: T3, o: T3): T3 => set3(o, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
const nz3 = (a: T3): T3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return set3(a, a[0] / l, a[1] / l, a[2] / l);
};
const dt3 = (a: T3, b: T3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const kS = v3(),
  kE0 = v3(),
  kG0 = v3(),
  kU0 = v3(),
  kF0 = v3(),
  kDv = v3(),
  kPole = v3(),
  kPp = v3(),
  kDu = v3(),
  kEp = v3(),
  kTp = v3(),
  kDf = v3(),
  kX0 = v3(),
  kXh = v3(),
  kZ0 = v3(),
  kZh = v3(),
  kT1 = v3(),
  kT2 = v3();

/**
 * Two-bone arm IK in the rest frame of the chest (figure units): put the hand's grip point at
 * (tx, ty, tz) with the elbow bending towards the pole direction. Writes shoulder flex / abduction /
 * twist and elbow flexion in the shader's conventions (rest arm directions of the rig included).
 */
export function armIK(r: Rig, left: boolean, tx: number, ty: number, tz: number, px: number, py: number, pz: number, o: ArmSolve): ArmSolve {
  // solve, then correct the target by the residual of the exact arm FK (rest carrying angle etc.)
  let ax = tx,
    ay = ty,
    az = tz;
  for (let it = 0; it < 3; it++) {
    armIK1(r, left, ax, ay, az, px, py, pz, o);
    armGrip(r, left, o, gTmp);
    const ex = tx - gTmp.x,
      ey = ty - gTmp.y,
      ez = tz - gTmp.z;
    if (ex * ex + ey * ey + ez * ez < 1e-6) break;
    ax += ex;
    ay += ey;
    az += ez;
  }
  return o;
}
const gTmp = { x: 0, y: 0, z: 0 };
const PT = newPose();
/** grip point of an arm solution in the chest rest frame */
function armGrip(r: Rig, left: boolean, o: ArmSolve, out: V3): V3 {
  const s = left ? 1 : -1;
  out.x = (r.wrist.x + (r.tip.x - r.wrist.x) * 0.42) * s;
  out.y = r.wrist.y + (r.tip.y - r.wrist.y) * 0.42;
  out.z = r.wrist.z + (r.tip.z - r.wrist.z) * 0.42;
  if (left) {
    PT.shFlexL = o.flex;
    PT.shAbdL = o.abd;
    PT.shTwistL = o.twist;
    PT.elbowL = o.elbow;
  } else {
    PT.shFlexR = o.flex;
    PT.shAbdR = o.abd;
    PT.shTwistR = o.twist;
    PT.elbowR = o.elbow;
  }
  rotAbout(out, rX(-(left ? PT.elbowL : PT.elbowR), M), mir(r.elbow, left, pvTmp));
  rotAbout(out, shoulderMatrix(PT, left, M), mir(r.shoulder, left, pvTmp));
  return out;
}
function armIK1(r: Rig, left: boolean, tx: number, ty: number, tz: number, px: number, py: number, pz: number, o: ArmSolve): ArmSolve {
  // work in the left-arm frame (mirror x for the right arm)
  const sx = left ? 1 : -1;
  const S = set3(kS, r.shoulder.x, r.shoulder.y, r.shoulder.z);
  const E0 = set3(kE0, r.elbow.x, r.elbow.y, r.elbow.z);
  const G0 = set3(kG0, r.wrist.x + (r.tip.x - r.wrist.x) * 0.42, r.wrist.y + (r.tip.y - r.wrist.y) * 0.42, r.wrist.z + (r.tip.z - r.wrist.z) * 0.42);
  const L1 = Math.hypot(E0[0] - S[0], E0[1] - S[1], E0[2] - S[2]);
  const L2 = Math.hypot(G0[0] - E0[0], G0[1] - E0[1], G0[2] - E0[2]);
  const u0 = nz3(set3(kU0, E0[0] - S[0], E0[1] - S[1], E0[2] - S[2]));
  const f0 = nz3(set3(kF0, G0[0] - E0[0], G0[1] - E0[1], G0[2] - E0[2]));
  const dv = set3(kDv, tx * sx - S[0], ty - S[1], tz - S[2]);
  let d = Math.hypot(dv[0], dv[1], dv[2]);
  o.reached = d <= (L1 + L2) * 0.999;
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), (L1 + L2) * 0.999);
  nz3(dv);
  // elbow on the circle, towards the pole
  const pole = set3(kPole, px * sx, py, pz);
  const pd = dt3(pole, dv);
  const pp = set3(kPp, pole[0] - dv[0] * pd, pole[1] - dv[1] * pd, pole[2] - dv[2] * pd);
  if (Math.hypot(pp[0], pp[1], pp[2]) < 1e-5) set3(pp, 0, 0, -1);
  nz3(pp);
  const ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, ca)));
  const c = Math.cos(a),
    sn = Math.sin(a);
  const du = nz3(set3(kDu, dv[0] * c + pp[0] * sn, dv[1] * c + pp[1] * sn, dv[2] * c + pp[2] * sn));
  const Ep = set3(kEp, S[0] + du[0] * L1, S[1] + du[1] * L1, S[2] + du[2] * L1);
  const Tp = set3(kTp, S[0] + dv[0] * d, S[1] + dv[1] * d, S[2] + dv[2] * d);
  const df = nz3(set3(kDf, Tp[0] - Ep[0], Tp[1] - Ep[1], Tp[2] - Ep[2]));
  // hinge axes: rest −x (flexion rotates the forearm forward); target from du × df (or the pole)
  const x0 = nz3(cr3(cr3(u0, set3(kT2, -1, 0, 0), kT1), u0, kX0));
  let xh = cr3(du, df, kXh);
  if (Math.hypot(xh[0], xh[1], xh[2]) < 1e-4) xh = cr3(du, pp, kXh);
  nz3(xh);
  const z0 = cr3(u0, x0, kZ0),
    zh = cr3(du, xh, kZh);
  // R = [du xh zh] · [u0 x0 z0]ᵀ
  // R = RZ(A) · RX(B) · RY(C):  R21 = sin B, R01 = −sin A cos B, R11 = cos A cos B, R20 = −cos B sin C, R22 = cos B cos C
  const R21 = du[2] * u0[1] + xh[2] * x0[1] + zh[2] * z0[1],
    R01 = du[0] * u0[1] + xh[0] * x0[1] + zh[0] * z0[1],
    R11 = du[1] * u0[1] + xh[1] * x0[1] + zh[1] * z0[1],
    R20 = du[2] * u0[0] + xh[2] * x0[0] + zh[2] * z0[0],
    R22 = du[2] * u0[2] + xh[2] * x0[2] + zh[2] * z0[2];
  const B = Math.asin(Math.max(-1, Math.min(1, R21)));
  const A = Math.atan2(-R01, R11);
  const C = Math.atan2(-R20, R22);
  o.abd = A;
  o.flex = -B;
  o.twist = -C;
  // elbow: bend between the bones minus the rest bend
  const bend = Math.acos(Math.max(-1, Math.min(1, dt3(du, df))));
  const rest = Math.acos(Math.max(-1, Math.min(1, dt3(u0, f0))));
  o.elbow = bend - rest;
  return o;
}

/** figure-frame point → rest frame of the chest (inverse of pelvis · waist · chest of the pose) */
export function toChestFrame(r: Rig, P: Pose, p: V3): V3 {
  // inverse pelvis: remove root offsets, rotate back about the hip centre
  p.x -= P.rootX;
  p.y -= P.rootY;
  p.z -= P.rootZ;
  mm(rX(P.bodyPitch, tmpA), rY(P.pelvisYaw, tmpB), tmpC);
  mm(tmpC, rZ(P.pelvisRoll, tmpA), M);
  invRot(p, M, 0, r.hip.y, 0);
  rotAboutInv(p, mm(rY(P.waistTwist, tmpA), rX(P.waistBend, tmpB), M), r.waist);
  mm(rY(P.chestTwist, tmpA), rX(P.chestBend, tmpB), tmpC);
  rotAboutInv(p, mm(tmpC, rZ(P.chestRoll, tmpA), M), r.chest);
  return p;
}
function invRot(p: V3, m: M3, cx: number, cy: number, cz: number): void {
  const x = p.x - cx,
    y = p.y - cy,
    z = p.z - cz;
  // transpose = inverse for rotations
  p.x = m[0] * x + m[3] * y + m[6] * z + cx;
  p.y = m[1] * x + m[4] * y + m[7] * z + cy;
  p.z = m[2] * x + m[5] * y + m[8] * z + cz;
}
function rotAboutInv(p: V3, m: M3, pv: V3): void {
  invRot(p, m, pv.x, pv.y, pv.z);
}
