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

/**
 * A pose object in V8's fast mode with unboxed double fields: built from one literal (a `{}` filled key by
 * key turns into a dictionary after ~16 keyed stores, and then every double write allocates a heap number —
 * that was ≈ 8 KB of garbage per figure per frame).
 */
export function newPose(): Pose {
  const p: Pose = {
    scale: 0.5,
    fade: 0.5,
    w: 0.5,
    c: 0.5,
    b: 0.5,
    bodyPitch: 0.5,
    rootX: 0.5,
    rootY: 0.5,
    rootZ: 0.5,
    pelvisYaw: 0.5,
    pelvisRoll: 0.5,
    waistBend: 0.5,
    waistTwist: 0.5,
    chestBend: 0.5,
    chestTwist: 0.5,
    headYaw: 0.5,
    headPitch: 0.5,
    hipFlexL: 0.5,
    hipAbdL: 0.5,
    kneeL: 0.5,
    ankleL: 0.5,
    hipFlexR: 0.5,
    hipAbdR: 0.5,
    kneeR: 0.5,
    ankleR: 0.5,
    shFlexL: 0.5,
    shAbdL: 0.5,
    shTwistL: 0.5,
    elbowL: 0.5,
    wristL: 0.5,
    shFlexR: 0.5,
    shAbdR: 0.5,
    shTwistR: 0.5,
    elbowR: 0.5,
    wristR: 0.5,
    gripL: 0.5,
    gripR: 0.5,
    caneX: 0.5,
    caneZ: 0.5,
    bagSwingL: 0.5,
    bagSwingR: 0.5,
    tailFloor: 0.5,
    headRoll: 0.5,
    chestRoll: 0.5,
    footYawL: 0.5,
    footYawR: 0.5,
    spare1: 0.5,
    spare2: 0.5,
  };
  resetPose(p);
  return p;
}

export function resetPose(p: Pose): void {
  for (let i = 0; i < POSE_KEYS.length; i++) p[POSE_KEYS[i]] = 0;
  p.scale = 1;
  p.fade = 1;
}

const hyp2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const hyp3 = (a: number, b: number, c: number) => Math.sqrt(a * a + b * b + c * c);
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
const pvTmp = { x: 0.5, y: 0.5, z: 0.5 };

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
const fA = new Float64Array(9),
  fB = new Float64Array(9),
  fC = new Float64Array(9);
/** m ← shᵀ · rY(fy) · sh · m with sh = hip · knee: the foot yaw turns about the pelvis-frame vertical
 *  through the ankle (not about the tilted shin), as the shader does — the sole keeps its contact */
export function footYawAbout(P: Pose, left: boolean, fy: number, m: M3): M3 {
  hipMatrix(P, left, fC);
  mm(fC, rX(left ? P.kneeL : P.kneeR, fA), fB); // sh
  mm(rY(fy, fA), fB, fC); // rY · sh
  // shᵀ · (rY · sh)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) fA[i * 3 + j] = fB[i] * fC[j] + fB[3 + i] * fC[3 + j] + fB[6 + i] * fC[6 + j];
  return mm(fA, m, m);
}

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
    rX(-(L ? P.ankleL : P.ankleR), M);
    const fy = L ? -P.footYawL : P.footYawR;
    if (Math.abs(fy) > 1e-4) footYawAbout(P, L, fy, M);
    rotAbout(p, M, mir(r.ankle, L, pvTmp));
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
  LIK[0] = hy;
  LIK[1] = hz;
  LIK[2] = ay;
  LIK[3] = az;
  LIK[4] = pitch;
  return legIKa(r, o);
}
/**
 * Garbage-free legIK for the per-frame paths: inputs in LIK = [hy, hz, ay, az, pitch]. (A call that is not
 * inlined boxes every computed double argument — 16 B of garbage each — typed-array slots never do.)
 */
export const LIK = new Float64Array(5);
export function legIKa(r: Rig, o: LegSolve): LegSolve {
  const hy = LIK[0],
    hz = LIK[1],
    ay = LIK[2],
    az = LIK[3],
    pitch = LIK[4];
  const L1 = hyp2(r.knee.y - r.hip.y, r.knee.z - r.hip.z);
  const L2 = hyp2(r.ankle.y - r.knee.y, r.ankle.z - r.knee.z);
  const t0 = Math.atan2(r.knee.z - r.hip.z, r.hip.y - r.knee.y); // rest thigh angle (forward of down)
  const s0 = Math.atan2(r.ankle.z - r.knee.z, r.knee.y - r.ankle.y); // rest shin angle
  const k0 = t0 - s0;
  const dy = hy - ay,
    dz = az - hz;
  let d = Math.sqrt(dy * dy + dz * dz);
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
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
  return set3(a, a[0] / l, a[1] / l, a[2] / l);
};
const dt3 = (a: T3, b: T3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const kE0 = v3(),
  kG0 = v3(),
  kF0 = v3(),
  kDv = v3(),
  kPp = v3(),
  kDu = v3(),
  kDf = v3(),
  kXh = v3(),
  kZh = v3(),
  kT1 = v3(),
  kT2 = v3();

/**
 * Two-bone arm IK in the rest frame of the chest (figure units): put the hand's grip point at
 * (tx, ty, tz) with the elbow bending towards the pole direction. Writes shoulder flex / abduction /
 * twist and elbow flexion in the shader's conventions (rest arm directions of the rig included).
 */
export function armIK(r: Rig, left: boolean, tx: number, ty: number, tz: number, px: number, py: number, pz: number, o: ArmSolve): ArmSolve {
  AIK[0] = tx;
  AIK[1] = ty;
  AIK[2] = tz;
  AIK[3] = px;
  AIK[4] = py;
  AIK[5] = pz;
  return armIKa(r, left, o);
}
/** garbage-free armIK (see legIKa): inputs in AIK = [tx, ty, tz, px, py, pz] */
export const AIK = new Float64Array(6);
// armIK1 inputs: corrected target + pole
const A1 = new Float64Array(6);
export function armIKa(r: Rig, left: boolean, o: ArmSolve): ArmSolve {
  // solve, then correct the target by the residual of the exact arm FK (rest carrying angle etc.)
  const tx = AIK[0],
    ty = AIK[1],
    tz = AIK[2];
  let ax = tx,
    ay = ty,
    az = tz;
  A1[3] = AIK[3];
  A1[4] = AIK[4];
  A1[5] = AIK[5];
  for (let it = 0; it < 3; it++) {
    A1[0] = ax;
    A1[1] = ay;
    A1[2] = az;
    armIK1(r, left, o);
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
const gTmp = { x: 0.5, y: 0.5, z: 0.5 };
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
/** rest-pose arm constants of a rig (left-arm frame), computed once */
interface ArmRest {
  S: T3;
  u0: T3;
  x0: T3;
  z0: T3;
  L1: number;
  L2: number;
  rest: number;
}
const armRests = new WeakMap<Rig, ArmRest>();
function armRestOf(r: Rig): ArmRest {
  let a = armRests.get(r);
  if (a) return a;
  const S = set3(v3(), r.shoulder.x, r.shoulder.y, r.shoulder.z);
  const E0 = set3(kE0, r.elbow.x, r.elbow.y, r.elbow.z);
  const G0 = set3(kG0, r.wrist.x + (r.tip.x - r.wrist.x) * 0.42, r.wrist.y + (r.tip.y - r.wrist.y) * 0.42, r.wrist.z + (r.tip.z - r.wrist.z) * 0.42);
  const u0 = nz3(set3(v3(), E0[0] - S[0], E0[1] - S[1], E0[2] - S[2]));
  const f0 = nz3(set3(kF0, G0[0] - E0[0], G0[1] - E0[1], G0[2] - E0[2]));
  // rest hinge axis −x (flexion rotates the forearm forward)
  const x0 = nz3(cr3(cr3(u0, set3(kT2, -1, 0, 0), kT1), u0, v3()));
  a = {
    S,
    u0,
    x0,
    z0: cr3(u0, x0, v3()),
    L1: hyp3(E0[0] - S[0], E0[1] - S[1], E0[2] - S[2]),
    L2: hyp3(G0[0] - E0[0], G0[1] - E0[1], G0[2] - E0[2]),
    rest: Math.acos(Math.max(-1, Math.min(1, dt3(u0, f0)))),
  };
  armRests.set(r, a);
  return a;
}
function armIK1(r: Rig, left: boolean, o: ArmSolve): ArmSolve {
  const tx = A1[0],
    ty = A1[1],
    tz = A1[2],
    px = A1[3],
    py = A1[4],
    pz = A1[5];
  // work in the left-arm frame (mirror x for the right arm)
  const sx = left ? 1 : -1;
  const AR = armRestOf(r);
  const S = AR.S,
    u0 = AR.u0,
    x0 = AR.x0,
    z0 = AR.z0,
    L1 = AR.L1,
    L2 = AR.L2;
  const dv = kDv;
  dv[0] = tx * sx - S[0];
  dv[1] = ty - S[1];
  dv[2] = tz - S[2];
  let d = Math.sqrt(dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2]);
  o.reached = d <= (L1 + L2) * 0.999;
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), (L1 + L2) * 0.999);
  nz3(dv);
  // elbow on the circle, towards the pole
  const pxs = px * sx;
  const pd = pxs * dv[0] + py * dv[1] + pz * dv[2];
  const pp = kPp;
  pp[0] = pxs - dv[0] * pd;
  pp[1] = py - dv[1] * pd;
  pp[2] = pz - dv[2] * pd;
  if (pp[0] * pp[0] + pp[1] * pp[1] + pp[2] * pp[2] < 1e-10) {
    pp[0] = 0;
    pp[1] = 0;
    pp[2] = -1;
  }
  nz3(pp);
  const ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, ca)));
  const c = Math.cos(a),
    sn = Math.sin(a);
  const du = kDu;
  du[0] = dv[0] * c + pp[0] * sn;
  du[1] = dv[1] * c + pp[1] * sn;
  du[2] = dv[2] * c + pp[2] * sn;
  nz3(du);
  // forearm direction: from the elbow (S + du·L1) to the target (S + dv·d)
  const df = kDf;
  df[0] = dv[0] * d - du[0] * L1;
  df[1] = dv[1] * d - du[1] * L1;
  df[2] = dv[2] * d - du[2] * L1;
  nz3(df);
  // target hinge axis from du × df (or the pole)
  let xh = cr3(du, df, kXh);
  if (xh[0] * xh[0] + xh[1] * xh[1] + xh[2] * xh[2] < 1e-8) xh = cr3(du, pp, kXh);
  nz3(xh);
  const zh = cr3(du, xh, kZh);
  // R = [du xh zh] · [u0 x0 z0]ᵀ
  // R = RZ(A) · RX(B) · RY(C):  R21 = sin B, R01 = −sin A cos B, R11 = cos A cos B, R20 = −cos B sin C, R22 = cos B cos C
  const R21 = du[2] * u0[1] + xh[2] * x0[1] + zh[2] * z0[1],
    R01 = du[0] * u0[1] + xh[0] * x0[1] + zh[0] * z0[1],
    R11 = du[1] * u0[1] + xh[1] * x0[1] + zh[1] * z0[1],
    R20 = du[2] * u0[0] + xh[2] * x0[0] + zh[2] * z0[0],
    R22 = du[2] * u0[2] + xh[2] * x0[2] + zh[2] * z0[2];
  const B = Math.asin(Math.max(-1, Math.min(1, R21)));
  o.abd = Math.atan2(-R01, R11);
  o.flex = -B;
  o.twist = -Math.atan2(-R20, R22);
  // elbow: bend between the bones minus the rest bend
  o.elbow = Math.acos(Math.max(-1, Math.min(1, du[0] * df[0] + du[1] * df[1] + du[2] * df[2]))) - AR.rest;
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
