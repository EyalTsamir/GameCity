// Shaders of the new people (see body.ts for the mesh, rig.ts for the anatomy, pose.ts for the
// joint angles). One vertex program poses every level of detail and the shadow proxy:
//   1. morph the average-man rest position towards woman / child / heavy (w, c, b)
//   2. parametric garments: skirt length + flare, hair length, hat style
//   3. forward kinematics from the leaf bone to the pelvis with 2-bone linear-blend skinning at
//      every joint (the vertex's parent weight), hands curl into a grip, bags / umbrella hang plumb
//      from the posed grip, the cane runs from the grip to a planted tip
//   4. pelvis / whole-body rotation, root offsets, scale, yaw, world position
// Colours: each vertex resolves its region's colours (skin, top, outer, bottom, legwear, shoes…)
// and the nearest hem boundary; the fragment shader picks the side per pixel (crisp hems).

import * as THREE from 'three';
import { globalUniforms } from '../../core/uniforms';
import { BONE, FB, REG } from './body';
import { PIV, PIV_COUNT, pivotTable } from './rig';

/** Per-instance pose values, packed two per uint (16-bit fixed, range ±8, 1/4096). Order = layout. */
export const POSE_KEYS = [
  'scale',
  'fade',
  'w',
  'c',
  'b',
  'bodyPitch',
  'rootX',
  'rootY',
  'rootZ',
  'pelvisYaw',
  'pelvisRoll',
  'waistBend',
  'waistTwist',
  'chestBend',
  'chestTwist',
  'headYaw',
  'headPitch',
  'hipFlexL',
  'hipAbdL',
  'kneeL',
  'ankleL',
  'hipFlexR',
  'hipAbdR',
  'kneeR',
  'ankleR',
  'shFlexL',
  'shAbdL',
  'shTwistL',
  'elbowL',
  'wristL',
  'shFlexR',
  'shAbdR',
  'shTwistR',
  'elbowR',
  'wristR',
  'gripL',
  'gripR',
  'caneX',
  'caneZ',
  'bagSwingL',
  'bagSwingR',
  'tailFloor',
  'headRoll',
  'chestRoll',
  'footYawL',
  'footYawR',
  'spare1',
  'spare2',
] as const;
export type PoseKey = (typeof POSE_KEYS)[number];
export const POSE_UINTS = POSE_KEYS.length / 2; // 24 → 6 uvec4

/** GLSL accessor for a pose value */
function acc(k: PoseKey): string {
  const i = POSE_KEYS.indexOf(k);
  const u = i >> 1;
  const att = `iP${u >> 2}.${'xyzw'[u & 3]}`;
  return `pedU2(${att}).${i & 1 ? 'y' : 'x'}`;
}
const PDEFS = POSE_KEYS.map((k) => `#define P_${k} ${acc(k)}`).join('\n');

// colour uints: iC0 = skin, top, bottom, shoes · iC1 = hair, hat, bag, outer · iC2 = accent, extra, flags, params
// each colour uint: rgb24 | param8 << 24 (params decoded below)

const B = BONE,
  R = REG;

export const HAT_STYLES = { NONE: 0, CAP: 1, FLATCAP: 2, SUNHAT: 3, FEDORA: 4, HARDHAT: 5, BEANIE: 6, BUCKET: 7 } as const;

const VERT_PARS = /* glsl */ `
attribute uvec4 aMorph;
attribute uvec4 aData;
attribute vec4 iRoot;
attribute uvec4 iP0;
attribute uvec4 iP1;
attribute uvec4 iP2;
attribute uvec4 iP3;
attribute uvec4 iP4;
attribute uvec4 iP5;
attribute uvec4 iC0;
attribute uvec4 iC1;
attribute uvec4 iC2;
uniform vec3 uPedPiv[${PIV_COUNT * 4}];
uniform vec4 uPedHatA[8];
uniform float uPedHairline;
uniform vec4 uPedHatB[8];
varying vec3 vPedA;
varying vec3 vPedB;
varying float vPedS;
varying float vPedH;
flat varying float vPedFade;
flat varying float vPedPat;
flat varying vec2 vPedMat; // (wrap, sheen)
varying vec3 vPedFace; // close-level face coords (X, Y, 1) — 0 elsewhere
flat varying uint vPedFB; // face bits: age 2 | eye colour 2 | lipstick 1 | stubble 1
flat varying vec4 vPedHairW; // hair colour, femininity
flat varying vec3 vPedSkin; // skin colour (hairline feathering)
varying vec3 vPedRest; // rest-pose position after the morph (figure units): strands, seams
varying vec3 vPedRN; // rest-pose normal
flat varying float vPedReg;
varying float vPedBend; // knee / elbow bend of the vertex's limb (fold depth)
flat varying float vPedHgt; // stature (figure units)
vec2 pedU2(uint v) { return vec2(float(v & 0xFFFFu), float(v >> 16u)) * (1.0 / 4096.0) - 8.0; }
float pedM16(uint v) { return float(v) * (1.0 / 32768.0) - 1.0; }
vec3 pedRGB(uint v) {
  vec3 c = vec3(float((v >> 16u) & 255u), float((v >> 8u) & 255u), float(v & 255u)) * (1.0 / 255.0);
  return c * c * (0.305 + 0.695 * c); // ≈ sRGB → linear
}
float pedP8(uint v) { return float(v >> 24u) * (1.0 / 255.0); }
mat3 pedRX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 pedRY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 pedRZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
${PDEFS}
vec3 pedW; // (w, c, b)
vec3 pedPiv(int i) { return uPedPiv[i] + pedW.x * uPedPiv[${PIV_COUNT} + i] + pedW.y * uPedPiv[${PIV_COUNT * 2} + i] + pedW.z * uPedPiv[${PIV_COUNT * 3} + i]; }
vec3 pedPivS(int i, bool left) { vec3 p = pedPiv(i); if (!left) p.x = -p.x; return p; }

// rotation of one joint, blended with the parent by w (linear-blend skinning)
void pedJoint(inout vec3 p, inout vec3 n, mat3 r, vec3 pv, inout float w) {
  vec3 q = r * (p - pv) + pv;
  p = mix(q, p, w);
  n = mix(r * n, n, w);
  w = 0.0;
}
mat3 pedHipR(bool left) {
  float fl = left ? P_hipFlexL : P_hipFlexR;
  float ab = left ? P_hipAbdL : P_hipAbdR;
  return pedRZ(left ? ab : -ab) * pedRX(-fl);
}
mat3 pedShoulderR(bool left) {
  float fl = left ? P_shFlexL : P_shFlexR;
  float ab = left ? P_shAbdL : P_shAbdR;
  float tw = left ? P_shTwistL : P_shTwistR;
  return pedRZ(left ? ab : -ab) * pedRX(-fl) * pedRY(left ? -tw : tw);
}

// joints from the vertex's bone up to (not including) the pelvis
void pedChain(inout vec3 p, inout vec3 n, int bone, float w) {
  int b = bone;
  if (b == ${B.HAND_L} || b == ${B.HAND_R}) {
    bool left = b == ${B.HAND_L};
    b = left ? ${B.FORE_L} : ${B.FORE_R};
    pedJoint(p, n, pedRX(-(left ? P_wristL : P_wristR)), pedPivS(${PIV.WRIST}, left), w);
  }
  if (b == ${B.FORE_L} || b == ${B.FORE_R}) {
    bool left = b == ${B.FORE_L};
    b = left ? ${B.UPPER_L} : ${B.UPPER_R};
    pedJoint(p, n, pedRX(-(left ? P_elbowL : P_elbowR)), pedPivS(${PIV.ELBOW}, left), w);
  }
  if (b == ${B.UPPER_L} || b == ${B.UPPER_R}) {
    bool left = b == ${B.UPPER_L};
    b = ${B.CHEST};
    pedJoint(p, n, pedShoulderR(left), pedPivS(${PIV.SHOULDER}, left), w);
  }
  if (b == ${B.HEAD}) {
    b = ${B.CHEST};
    pedJoint(p, n, pedRY(P_headYaw) * pedRX(P_headPitch) * pedRZ(P_headRoll), pedPiv(${PIV.HEAD}), w);
  }
  if (b == ${B.CHEST}) {
    b = ${B.SPINE};
    pedJoint(p, n, pedRY(P_chestTwist) * pedRX(P_chestBend) * pedRZ(P_chestRoll), pedPiv(${PIV.CHEST}), w);
  }
  if (b == ${B.SPINE}) {
    b = ${B.PELVIS};
    pedJoint(p, n, pedRY(P_waistTwist) * pedRX(P_waistBend), pedPiv(${PIV.WAIST}), w);
  }
  if (b == ${B.FOOT_L} || b == ${B.FOOT_R}) {
    bool left = b == ${B.FOOT_L};
    b = left ? ${B.SHIN_L} : ${B.SHIN_R};
    float fy = left ? -P_footYawL : P_footYawR;
    mat3 rf = pedRX(-(left ? P_ankleL : P_ankleR));
    if (abs(fy) > 1e-4) {
      // the foot yaw turns about the vertical through the ankle (pelvis frame), not the tilted shin
      mat3 sh = pedHipR(left) * pedRX(left ? P_kneeL : P_kneeR);
      rf = transpose(sh) * pedRY(fy) * sh * rf;
    }
    pedJoint(p, n, rf, pedPivS(${PIV.ANKLE}, left), w);
  }
  if (b == ${B.SHIN_L} || b == ${B.SHIN_R}) {
    bool left = b == ${B.SHIN_L};
    b = left ? ${B.THIGH_L} : ${B.THIGH_R};
    pedJoint(p, n, pedRX(left ? P_kneeL : P_kneeR), pedPivS(${PIV.KNEE}, left), w);
  }
  if (b == ${B.THIGH_L} || b == ${B.THIGH_R}) {
    bool left = b == ${B.THIGH_L};
    pedJoint(p, n, pedHipR(left), pedPivS(${PIV.HIP}, left), w);
  }
}

// pelvis rotation (yaw, list), whole-body pitch about the hips and the root offsets (figure units)
void pedPelvis(inout vec3 p, inout vec3 n) {
  vec3 hc = vec3(0.0, pedPiv(${PIV.HIP}).y, 0.0);
  mat3 r = pedRX(P_bodyPitch) * pedRY(P_pelvisYaw) * pedRZ(P_pelvisRoll);
  p = r * (p - hc) + hc + vec3(P_rootX, P_rootY, P_rootZ);
  n = r * n;
}

// a rest point carried by the full chain (bags, umbrella and cane hang from the posed grip)
vec3 pedCarry(vec3 p, int bone) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  pedChain(p, n, bone, 0.0);
  pedPelvis(p, n);
  return p;
}
bool pedVisible(uint d0) {
  uint feat = (d0 >> 10u) & 63u;
  if (feat == 0u) return true;
  bool has = (iC2.z & (1u << (feat - 1u))) != 0u;
  return ((d0 >> 16u) & 1u) == 1u ? !has : has;
}

void pedPose(inout vec3 p, inout vec3 n) {
  vPedFade = P_fade;
  vPedFace = vec3(0.0);
  vPedFB = ((iC2.w >> 9u) & 63u) | (((iC2.w >> 8u) & 1u) << 6u); // face bits | shirt collar (64) | jacket (128, below)
  vPedHairW = vec4(pedRGB(iC1.x), P_w);
  vPedSkin = pedRGB(iC0.x);
  uint d0 = aData.x;
  if (!pedVisible(d0)) { p = vec3(0.0, -50.0, 0.0); n = vec3(0.0, 1.0, 0.0); vPedA = vPedB = vec3(0.0); vPedS = 0.0; vPedH = 0.0; vPedPat = 0.0; vPedMat = vec2(0.0); return; }
  int bone = int(d0 & 31u);
  int region = int((d0 >> 5u) & 31u);
  float tint = float(d0 >> 24u) * (1.0 / 200.0);
  float h = float(aData.y & 0xFFFFu) * (4.0 / 65535.0) - 2.0;
  float w = float(aData.y >> 16u) * (1.0 / 65535.0);
  vec2 aux = pedU2(aData.z);
  if (region == ${R.FACE}) {
    vPedFace = vec3(aux, 1.0);
    // per-person face shape: nose length / bridge, chin, cheeks, lip fullness (stable hash of the look)
    uint fh = (iC0.x * 2654435761u) ^ (iC1.x * 40503u) ^ (iC0.y * 2246822519u);
    fh ^= fh >> 15u; fh *= 2246822519u; fh ^= fh >> 13u;
    vec4 fv = vec4(float(fh & 255u), float((fh >> 8u) & 255u), float((fh >> 16u) & 255u), float(fh >> 24u)) / 127.5 - 1.0;
    float X = aux.x, Y = aux.y;
    float nose = exp(-X * X / 0.00008) * smoothstep(0.012, -0.01, Y) * smoothstep(-0.052, -0.036, Y);
    float chin = exp(-X * X / 0.0004 - (Y + 0.095) * (Y + 0.095) / 0.00015);
    float cheek = exp(-(abs(X) - 0.045) * (abs(X) - 0.045) / 0.0003 - (Y + 0.025) * (Y + 0.025) / 0.0003);
    float lips = exp(-X * X / 0.0004 - (Y + 0.066) * (Y + 0.066) / 0.00006);
    float dn = 0.0055 * fv.x * nose + 0.005 * fv.y * chin + 0.003 * fv.z * cheek + 0.0018 * fv.w * lips;
    p += n * dn * (1.0 - 0.4 * P_c);
  }
  else if (region == ${R.FOOT}) vPedFace = vec3(aux, 2.0);
  pedW = vec3(P_w, P_c, P_b);
  // ── morph
  p += pedW.x * vec3(pedM16(aMorph.x & 0xFFFFu), pedM16(aMorph.x >> 16u), pedM16(aMorph.y & 0xFFFFu))
     + pedW.y * vec3(pedM16(aMorph.y >> 16u), pedM16(aMorph.z & 0xFFFFu), pedM16(aMorph.z >> 16u))
     + pedW.z * vec3(pedM16(aMorph.w & 0xFFFFu), 0.0, pedM16(aMorph.w >> 16u));
  uint nd = aData.w;
  n = normalize(n + pedW.x * (vec3(float(nd & 1023u), float((nd >> 10u) & 1023u), float((nd >> 20u) & 1023u)) * (2.0 / 1023.0) - 1.0));
  vPedRest = p;
  vPedRN = n;
  vPedReg = float(region);
  vPedHgt = 1.76 - 0.12 * P_w - 0.54 * P_c;
  vPedBend = bone == ${B.THIGH_L} || bone == ${B.SHIN_L} || bone == ${B.FOOT_L} ? abs(P_kneeL)
           : bone == ${B.THIGH_R} || bone == ${B.SHIN_R} || bone == ${B.FOOT_R} ? abs(P_kneeR)
           : bone == ${B.UPPER_L} || bone == ${B.FORE_L} || bone == ${B.HAND_L} ? abs(P_elbowL)
           : bone == ${B.UPPER_R} || bone == ${B.FORE_R} || bone == ${B.HAND_R} ? abs(P_elbowR) : 0.0;

  // ── parametric garments
  if (region == ${R.HAIR}) {
    if (((d0 >> 10u) & 63u) == ${FB.PONY + 1}u) {
      // ponytail: swings sideways about its root (aux = swing share, drop below the root)
      vec3 root = p + vec3(0.0, aux.y, 0.0);
      mat3 sw = pedRZ(P_spare2 * aux.x);
      p = root + sw * (p - root);
      n = sw * n;
    } else if (aux.x > 0.0 || ((d0 >> 10u) & 63u) == ${FB.HAIRLONG + 1}u) {
      // long hair: vertices deeper than the hair length are lifted to the hem. The tips are uneven (clumps of
      // different length, longest at the middle of the back) and the sheet ripples in and out across its
      // width into locks that gain volume as they fall, so neither the hem nor the outline is a ruled line
      float len = pedP8(iC1.x) * 0.5;
      float a = atan(p.x, p.z);
      float sd = float(iC1.x & 15u);
      float L2 = len * (1.0 + 0.09 * sin(a * 7.0 + sd) + 0.06 * sin(a * 15.0 + 1.7 + sd * 0.5) - 0.12 * (1.0 - abs(sin(a * 0.5))));
      float lift = max(0.0, aux.x - L2);
      p.y += lift;
      // rows lifted to the hem tuck in under it (into the hair / body) instead of rolling out as a shelf
      p.xz = mix(p.xz, vec2(0.0, -0.01), 0.3 * smoothstep(0.0, 0.03, lift));
      float dep = min(aux.x, L2);
      // FS: distance from the tips (locks separate and thin there) + angle (the front edges thin out)
      vPedFace = vec3(L2 - dep, abs(a), 5.0); // |a|: no ±π seam down the back
      float g = smoothstep(0.0, 0.1, dep) * (0.6 + 0.4 * smoothstep(0.1, 0.35, dep));
      float ph = a * 9.0 + sd + dep * 6.0;
      float rip = 0.6 * sin(ph) + 0.4 * sin(a * 17.0 - sd);
      float drip = (0.6 * 9.0 * cos(ph) + 0.4 * 17.0 * cos(a * 17.0 - sd)) * 0.0045 * g / 0.09;
      vec2 rad = normalize(p.xz + vec2(1e-5));
      p.xz += rad * (0.0045 * rip + 0.006) * g;
      n.xz -= vec2(rad.y, -rad.x) * drip * 0.5;
      n = normalize(n);
    } else if (((d0 >> 10u) & 63u) == ${FB.HAIR + 1}u && uPedHairline > 0.5) {
      // cap: aux.y = s (0 hairline … 1 crown). Hair stands off the scalp in locks, not as a smooth helmet:
      // lumps in the silhouette grow from the hairline, a little more lift on the crown / back
      vPedFace = vec3(aux.y, 0.0, 3.0);
      float a = atan(p.x, p.z + 0.015);
      float lump = 0.55 * sin(a * 7.0 + p.y * 60.0 + float(iC1.x & 15u)) + 0.45 * sin(a * 13.0 - p.y * 90.0);
      float grow = smoothstep(0.05, 0.45, aux.y);
      p += n * grow * (0.0045 * lump + 0.007 * smoothstep(0.3, 1.0, aux.y) * (0.6 + 0.4 * -n.z));
    }
    // volume (curly / full hair): scale about the head centre
    float vol = float((iC1.y >> 27u) & 31u) * (1.0 / 31.0);
    if (vol > 0.0 && bone == ${B.HEAD}) {
      vec3 hc = pedPiv(${PIV.HEAD}) + vec3(0.0, 0.1, 0.012);
      p = hc + (p - hc) * (1.0 + 0.11 * vol);
    }
  }
  if (region == ${R.HAT}) {
    uint st = (iC1.y >> 24u) & 7u;
    vec4 ha = uPedHatA[int(st)];
    vec4 hb = uPedHatB[int(st)];
    float s = aux.x;
    float phi = aux.y;
    vec3 hc = vec3(0.0, p.y, pedPiv(${PIV.HEAD}).z + 0.005);
    vec2 rad = normalize(p.xz - hc.xz + vec2(1e-5));
    bool brim = (d0 >> 10u & 63u) == ${FB.BRIM + 1}u;
    bool visor = (d0 >> 10u & 63u) == ${FB.VISOR + 1}u;
    if (brim) {
      p.xz += rad * (ha.x + s * hb.x);
      p.y += -ha.z - s * hb.y;
    } else if (visor) {
      p.xz += rad * ha.x;
      p.z += s * (hb.z - 0.075);
      p.y += -ha.z - s * 0.01 * hb.z / 0.075;
    } else {
      // dome: push out, lift the crown, drop the rim (beanie over the ears), flatten the top
      float top = smoothstep(0.15, 1.0, s);
      p.xz += rad * ha.x * (1.0 - 0.5 * top * hb.w);
      p.y += ha.y * top - ha.z * (1.0 - s) + ha.w * max(0.0, cos(phi)) * s;
    }
  }
  if (bone == ${B.TAIL}) {
    float u = aux.x;
    vec3 hip = pedPiv(${PIV.HIP});
    vec2 rad0 = normalize(p.xz - vec2(0.0, -0.01) + vec2(1e-5));
    // thighs (and shins for long hems) carry the skirt: the sides follow their own thigh, the front
    // drapes over the forward thigh and the back over the rear one; seated, the hem follows fully
    bool seated = P_tailFloor > 0.0;
    if (u > -0.25) {
      float hemY = pedP8(iC1.z) * hip.y;
      p.y = p.y - u * max(0.0, p.y - hemY);
      p.xz += rad0 * u * float(iC2.w & 255u) * (seated ? 0.0003 : 0.001);
    }
    float k = u < -0.75 ? 0.0 : (u < -0.25 ? (seated ? 0.45 : 0.15) : (seated ? 1.0 : 0.25 + 0.5 * u));
    float side = aux.y;
    vec3 pl = p, pr = p, nl = n, nr = n;
    float z0 = 0.0;
    vec3 kl = pedPivS(${PIV.KNEE}, true), kr = pedPivS(${PIV.KNEE}, false);
    if (p.y < kl.y) { pedJoint(pl, nl, pedRX(P_kneeL), kl, z0); z0 = 0.0; pedJoint(pr, nr, pedRX(P_kneeR), kr, z0); z0 = 0.0; }
    pedJoint(pl, nl, pedHipR(true), pedPivS(${PIV.HIP}, true), z0); z0 = 0.0;
    pedJoint(pr, nr, pedHipR(false), pedPivS(${PIV.HIP}, false), z0);
    float ext = smoothstep(-0.015, 0.015, (pl.z - pr.z) * (rad0.y < 0.0 ? -1.0 : 1.0));
    // the front / back panels hang as one sheet stretched across both thighs (a stride pulls an A-line
    // hem into a trapezoid): sideways and in height they blend the two legs by side, but the front panel
    // stays in front of the forward thigh and the back panel behind the rear one — never a flap that one
    // leg swings through; their hem lifts a little with the forward knee
    float panel = sqrt(1.0 - abs(side)) * smoothstep(0.1, 0.5, abs(rad0.y));
    float wS = clamp(0.5 + 0.75 * side, 0.0, 1.0);
    vec3 q = mix(pr, pl, wS);
    float zx = rad0.y >= 0.0 ? max(pl.z, pr.z) : min(pl.z, pr.z);
    q.z = mix(q.z, zx, panel);
    q.y = mix(q.y, mix(pr.y, pl.y, ext), 0.5 * panel);
    if (!seated) k *= 1.0 - 0.25 * panel * max(u, 0.0);
    p = mix(p, q, k);
    // high on a long skirt / dress k is small, and a thigh swinging forward (or a heel kicking back) would pass
    // through the cloth: the front never sits behind the forward leg's posed surface, the back never in front
    // of the rear one (the sheet stretches across the stride instead of a skin notch showing through)
    if (!seated) {
      float cover = smoothstep(0.15, 0.5, abs(rad0.y));
      p.z = rad0.y >= 0.0 ? max(p.z, mix(p.z, zx + 0.003, cover)) : min(p.z, mix(p.z, zx - 0.003, cover));
    }
    n = normalize(mix(n, mix(nr, nl, mix(wS, ext, panel)), k));
    if (seated) p.y = max(p.y, P_tailFloor);
    bone = ${B.PELVIS};
  }

  // ── trousers: from mid-thigh down the cloth hangs as a straight, slightly tapered tube instead of
  // following the leg (fit 0 leggings … 0.6 jeans … 1 loose): a radial push from the rest leg axis up to the
  // drape radius (6.1 cm at the ankle, 6.8 at the knee, 7.2 at mid-thigh: a regular trouser leg on the
  // average man), no new vertices
  if (region == ${R.LEG}) {
    float fit = float((iC2.x >> 26u) & 15u) * (1.0 / 15.0);
    float te = pedP8(iC0.z) * 1.275 - 0.1;
    if (fit > 0.0 && h > te - 0.002 && h < 0.8) {
      bool left = bone == ${B.THIGH_L} || bone == ${B.SHIN_L} || bone == ${B.FOOT_L};
      vec3 hp = pedPivS(${PIV.HIP}, left), kn = pedPivS(${PIV.KNEE}, left), an = pedPivS(${PIV.ANKLE}, left);
      vec3 ax = p.y > kn.y ? mix(kn, hp, clamp((p.y - kn.y) / max(1e-4, hp.y - kn.y), 0.0, 1.0))
                           : mix(an, kn, clamp((p.y - an.y) / max(1e-4, kn.y - an.y), 0.0, 1.0));
      vec2 d = p.xz - ax.xz;
      float r = length(d);
      float rt = (0.059 + 0.018 * h) * (hp.y - an.y) * ${(1 / 0.855).toFixed(5)};
      float k = fit * (1.0 - smoothstep(0.66, 0.8, h));
      if (r > 1e-4 && rt > r) p.xz += d * ((rt - r) * k / r);
    }
  }

  // ── hand grip: fingers curl towards the palm about the knuckles
  if ((bone == ${B.HAND_L} || bone == ${B.HAND_R}) && aux.x > 0.0) {
    bool left = bone == ${B.HAND_L};
    vec3 wr = pedPivS(${PIV.WRIST}, left);
    vec3 tp = pedPivS(${PIV.TIP}, left);
    vec3 kn = mix(wr, tp, 0.5);
    float g = (left ? P_gripL : P_gripR) * 1.35;
    float z0 = 1.0 - aux.x;
    pedJoint(p, n, pedRZ(left ? -g : g), kn, z0);
  }

  // ── forward kinematics
  if (bone == ${B.BAG_L} || bone == ${B.BAG_R} || bone == ${B.UMB} || bone == ${B.CANE}) {
    bool left = bone == ${B.BAG_L};
    vec3 g0 = mix(pedPivS(${PIV.WRIST}, left), pedPivS(${PIV.TIP}, left), 0.42);
    vec3 g1 = pedCarry(g0, left ? ${B.HAND_L} : ${B.HAND_R});
    vec3 o = p - g0;
    if (bone == ${B.CANE} && aux.x > -0.5) {
      // straight cane from the grip to the planted tip (figure units, ground y = 0)
      float t = aux.x;
      vec3 axisRest = g0 + vec3(0.0, 0.03 - 0.83 * t, 0.0);
      vec3 tip = vec3(P_caneX, 0.0, P_caneZ);
      p = mix(g1 + vec3(0.0, 0.03, 0.0), tip, t) + (p - axisRest);
    } else if (bone == ${B.BAG_L} || bone == ${B.BAG_R}) {
      mat3 sw = pedRX(left ? P_bagSwingL : P_bagSwingR);
      p = g1 + sw * o;
      n = sw * n;
    } else {
      p = g1 + o;
    }
  } else if (bone == ${B.GROUND}) {
    // stays flat on the ground at the root
  } else {
    pedChain(p, n, bone, w);
    pedPelvis(p, n);
  }

  // ── colours
  vec3 skin = pedRGB(iC0.x);
  vec3 top = pedRGB(iC0.y);
  vec3 bottom = pedRGB(iC0.z);
  vec3 outer = pedRGB(iC1.w);
  uint prm = iC2.w;
  float jacketHem = pedP8(iC2.y) * 1.275 - 0.1;
  bool jacket = jacketHem > -0.05;
  if (jacket) vPedFB |= 128u;
  vec3 legwear = skin;
  uint lw = (iC2.x >> 24u) & 3u;
  if (lw == 1u) legwear = vec3(0.022, 0.021, 0.024);
  else if (lw == 2u) legwear = skin * vec3(0.72, 0.66, 0.62);
  else if (lw == 3u) legwear = vec3(0.6, 0.6, 0.62);
  vec3 A = skin, Bc = skin;
  float s = 1.0;
  float pat = 0.0;
  if (region == ${R.TORSO}) {
    float topHem = pedP8(iC0.y) * 1.275 - 0.1;
    float midTop = pedP8(prm << 8u) * 1.275 - 0.1; // swimwear / crop tops: skin band above the bottom
    vec3 up = top;
    float bd = topHem;
    if (jacket) {
      up = outer;
      bd = jacketHem;
      // open front: the shirt shows in a V between the lapels
      float vw = (h - 0.5) * 1.6;
      if (h > 0.5 && aux.x < vw) up = top;
    }
    uint tailSrc = (iC1.w >> 29u) & 3u;
    A = up;
    Bc = tailSrc == 1u && (iC2.z & ${1 << FB.TAIL}u) != 0u ? top : bottom;
    s = h - bd;
    if (midTop > bd + 0.02) {
      // two boundaries: bottom | skin | top — use the nearer one
      if (abs(h - midTop) < abs(h - bd)) { A = up; Bc = skin; s = h - midTop; }
      else { A = skin; s = h - bd; }
    }
    if ((iC2.z & ${1 << FB.VEST}u) != 0u) { A = pedRGB(iC2.x); pat = 1.0; }
  } else if (region == ${R.ARM}) {
    float sl = pedP8(iC0.x) * 1.275 - 0.1;
    A = jacket ? outer : top;
    Bc = skin;
    s = h - sl;
  } else if (region == ${R.LEG}) {
    float te = pedP8(iC0.z) * 1.275 - 0.1;
    float bt = float((iC0.w >> 24u) & 63u) * 0.01;
    vec3 shoes = pedRGB(iC0.w);
    if (bt > 0.0 && abs(h - bt) < abs(h - te)) { A = te < bt ? bottom : legwear; Bc = shoes; s = h - bt; }
    else { A = bottom; Bc = bt > te ? shoes : legwear; s = h - te; }
  } else if (region == ${R.FOOT}) {
    A = pedRGB(iC0.w);
    uint st = (iC0.w >> 30u) & 3u;
    Bc = st == 1u ? vec3(0.8, 0.8, 0.78) : st == 2u ? A * 0.55 : vec3(0.03, 0.028, 0.026);
    s = h - (st == 1u ? 0.17 : 0.11);
  } else if (region == ${R.NECK}) {
    float nt = pedP8(prm) * 0.4 + 0.95;
    A = skin;
    Bc = jacket ? outer : top;
    s = h - nt;
  } else if (region == ${R.HAIR}) {
    A = Bc = pedRGB(iC1.x);
  } else if (region == ${R.BEARD}) {
    A = Bc = pedRGB(iC1.x) * 0.82;
  } else if (region == ${R.HAT}) {
    A = pedRGB(iC1.y);
    uint st = (iC1.y >> 24u) & 7u;
    Bc = st == 3u || st == 4u ? A * 0.35 : A * 0.9;
    s = aux.x - (st == 3u || st == 4u ? 0.16 : 0.0);
  } else if (region == ${R.BAG}) {
    A = Bc = pedRGB(iC1.z);
  } else if (region == ${R.STRAP}) {
    A = Bc = pedRGB(iC1.z) * 0.6;
  } else if (region == ${R.WHITE}) {
    A = Bc = vec3(0.72, 0.71, 0.68);
  } else if (region == ${R.DARK}) {
    A = Bc = vec3(0.03, 0.028, 0.03);
  } else if (region == ${R.ACCENT}) {
    A = Bc = pedRGB(iC2.x);
  } else if (region == ${R.EXTRA}) {
    A = Bc = pedRGB(iC2.y);
  } else if (region == ${R.TOWEL}) {
    A = Bc = pedRGB(iC2.y);
    pat = 2.0;
  } else if (region == ${R.TAIL}) {
    uint src = (iC1.w >> 29u) & 3u;
    A = Bc = src == 1u ? top : src == 2u ? outer : bottom;
  } else if (region == ${R.OUTER}) {
    A = Bc = outer * 0.85;
  } else if (region == ${R.COLLAR}) {
    A = Bc = ((prm >> 8u) & 1u) == 1u ? vec3(0.72, 0.71, 0.68) : (jacket ? outer : top);
  } else if (region == ${R.LIPS}) {
    A = Bc = skin * vec3(0.86, 0.72, 0.7);
  }
  // painted miniature: per-figure garment jitter (±4 %), lighter up-facing / darker undersides and
  // lower legs (drybrush value ramp), faces and hands a touch warmer and lighter than the arms
  float jit = fract(sin(dot(iRoot.xz, vec2(12.9898, 78.233))) * 43758.5453);
  bool fabric = region == ${R.TORSO} || region == ${R.ARM} || region == ${R.LEG} || region == ${R.TAIL} || region == ${R.OUTER};
  float ramp = 1.0 + 0.07 * max(n.y, 0.0) - 0.11 * max(-n.y, 0.0);
  if (region == ${R.LEG}) ramp *= mix(0.88, 1.0, smoothstep(0.08, 0.55, h));
  if (fabric) ramp *= 0.96 + 0.08 * jit;
  if (region == ${R.SKIN} || region == ${R.FACE} || region == ${R.LIPS}) { A *= vec3(1.05, 1.02, 1.0); Bc *= vec3(1.05, 1.02, 1.0); }
  vPedA = A * tint * ramp;
  vPedB = Bc * tint * ramp;
  vPedS = s;
  vPedH = h;
  vPedPat = pat;
  // material response: skin & hair soften the terminator (wrap), hair and shoes get a faint sheen
  // (the face less: its sculpt must read in the light)
  // On the head the wrap blends from the face to the sides by the rest normal: a step at the FACE / SKIN
  // boundary drew a crease from the temple down to the jaw in three-quarter views
  float headWrap = mix(0.35, 0.16, smoothstep(-0.1, 0.75, vPedRN.z));
  vPedMat = (region == ${R.FACE} || region == ${R.SKIN}) && bone == ${B.HEAD} ? vec2(headWrap, 0.0)
          : region == ${R.FACE} ? vec2(0.16, 0.0)
          : region == ${R.SKIN} || region == ${R.NECK} || region == ${R.LIPS} ? vec2(0.35, 0.0)
          : region == ${R.HAIR} || region == ${R.BEARD} ? vec2(0.4, 0.018)
          : region == ${R.FOOT} ? vec2(0.0, 0.09)
          : region == ${R.BAG} || region == ${R.HAT} ? vec2(0.1, 0.04)
          : vec2(0.12, 0.0);

  // ── to world
  float sc = P_scale;
  p *= sc;
  float cy = cos(iRoot.w), sy = sin(iRoot.w);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z) + iRoot.xyz;
  n = vec3(cy * n.x + sy * n.z, n.y, -sy * n.x + cy * n.z);
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vPedA;
varying vec3 vPedB;
varying float vPedS;
varying float vPedH;
flat varying float vPedFade;
flat varying float vPedPat;
flat varying vec2 vPedMat;
varying vec3 vPedFace;
flat varying uint vPedFB;
flat varying vec4 vPedHairW;
flat varying vec3 vPedSkin;
varying vec3 vPedRest;
varying vec3 vPedRN;
flat varying float vPedReg;
varying float vPedBend;
flat varying float vPedHgt;
float pedBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float pedBayer4(vec2 a) { return pedBayer2(0.5 * a) * 0.25 + pedBayer2(a); }

// ── hair: strands as clumps and fine fibres running from the crown down (rest-pose angle about the
// head axis), darker between clumps; the fine octave fades out where it would alias
float pedN1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(fract(sin(i * 127.1) * 43758.5453), fract(sin((i + 1.0) * 127.1) * 43758.5453), f); }
// hair flow on the cap: strands radiate from a crown whorl (back of the top, a little to one side per person)
// and are combed down / forward from it, swirling round the whorl itself; x = angle about the whorl axis
// (seam at the nape), y = angular distance from the whorl. Elsewhere (sheets, tails, beards) strands hang.
vec2 pedHairFlow(vec3 r) {
  if (vPedFace.z < 2.5 || vPedFace.z > 4.5) return vec2(atan(r.x, r.z + 0.015), r.y * 1.4);
  float hs = fract(sin(dot(vPedHairW.rgb, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 ax = normalize(vec3((hs - 0.5) * 0.8, 0.8, -0.55));
  vec3 d = normalize(r - vec3(0.0, vPedHgt * 0.943, 0.0));
  vec3 u = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
  vec3 v = cross(ax, u);
  float c = acos(clamp(dot(d, ax), -1.0, 1.0));
  return vec2(atan(dot(d, u), -dot(d, v)) + 1.4 * (1.0 - smoothstep(0.0, 0.7, c)), c);
}
float pedStrands(vec3 r) {
  vec2 fl = pedHairFlow(r);
  float a = fl.x;
  float wob = sin(fl.y * 13.0 + a * 2.0) * 0.3 + (pedN1(fl.y * 9.0 + a * 4.0) - 0.5) * 0.5;
  float c = mix(pedN1(a * 26.0 + wob), 0.5, smoothstep(0.4, 0.9, fwidth(a * 26.0)));
  float fA = a * 85.0 + wob * 2.0;
  float fw = fwidth(fA);
  float f = mix(pedN1(fA) - 0.5, 0.0, smoothstep(0.35, 0.8, fw));
  float ff = mix(pedN1(a * 240.0 + wob * 4.0) - 0.5, 0.0, smoothstep(0.25, 0.6, fwidth(a * 240.0)));
  // (clumps break along their length: no continuous corrugation round the cap)
  float brk = 0.6 + 0.4 * pedN1(fl.y * 15.0 + a * 4.0 + 3.0);
  return 0.8 + 0.32 * c * brk + 0.3 * f + 0.2 * ff;
}
// ── fabric (close range): seams, stitching, folds where the limb bends (knee / elbow creases deepen with
// the bend), trouser breaks over the shoe, sleeve gathers, side drape at the waist, weave grain; denim
// gets the orange twin stitching and back pockets. Fades out where a pixel covers > ~1 cm.
float pedBand2(float d, float hw, float px) { return 1.0 - smoothstep(hw - px * 0.5, hw + px * 0.5, abs(d)); }
// relief for the normal stage (FABRIC_NORMAL): fold / seam height + weave, and the fabric share (fuzz sheen)
float pedFabH = 0.0;
float pedFabK = 0.0;
vec3 pedFabric(vec3 pc, float reg, float h, float sHem) {
  vec3 r = vPedRest, rn = normalize(vPedRN);
  float px = max(fwidth(r.y), 1e-5);
  float det = 1.0 - smoothstep(0.004, 0.011, px);
  if (det <= 0.0) return pc;
  float side = r.x >= 0.0 ? 1.0 : -1.0;
  float inner = -rn.x * side; // > 0 towards the body's midline
  float ang = atan(rn.x * side, rn.z); // 0 front … ±π back (outer side positive)
  bool denim = pc.b > pc.r * 1.18 && pc.b > 0.05 && reg > 2.5 && reg < 3.5;
  vec3 thread = denim ? vec3(0.55, 0.36, 0.14) : pc * 0.62;
  float sh = 1.0;
  float stitch = 0.0;
  // weave grain: a fine diagonal twill on denim, a soft knit / cotton grain elsewhere
  float gA = denim ? (r.y * 1.0 + r.x * 0.7 + r.z * 0.7) * 1400.0 : (r.y * 900.0 + sin(r.x * 700.0 + r.z * 700.0) * 1.2);
  // weave relief: denim twill diagonals; tops are a rib knit (vertical wales, about 1 in 3 people) or a
  // cotton jersey (fine courses); other cloth a fine plain grain. Fades out before it can alias.
  float tA = (r.x * rn.z - r.z * rn.x) * 1700.0; // ≈ arc length round the limb / body
  float pk = fract(sin(dot(vPedHairW.rgb, vec3(7.13, 3.71, 5.17)) + reg) * 43758.5453);
  bool knit = !denim && reg < 2.5 && pk < 0.35;
  float wv = denim ? sin(gA) : knit ? sin(tA * 0.75) * (0.8 + 0.2 * sin(r.y * 2400.0)) : sin(r.y * 2600.0 + sin(tA * 0.5)) * 0.6;
  float wvA = denim ? gA : knit ? tA * 0.75 : r.y * 2600.0;
  float wvK = 1.0 - smoothstep(0.3, 0.7, fwidth(wvA) / 6.2832);
  sh *= 1.0 + (denim ? 0.07 : 0.035) * (pedN1(gA) - 0.5) * (1.0 - smoothstep(0.25, 0.6, fwidth(gA)));
  float bend = vPedBend;
  if (reg > 2.5 && reg < 3.5) {
    // trousers: outer and inner leg seams
    float seam = pedBand2(rn.z, 0.035, px * 12.0) * (1.0 - step(0.88, h));
    sh *= 1.0 - 0.18 * seam;
    stitch += denim ? pedBand2(abs(rn.z) - 0.075, 0.012, px * 12.0) * step(0.0, -inner) * (1.0 - step(0.88, h)) : 0.0;
    // knee: creases behind it deepen with the bend; the front pulls smooth and a little lighter
    float kz = exp(-pow((h - 0.5) / 0.07, 2.0));
    float bk = clamp(bend / 1.6, 0.0, 1.0);
    float cre = sin((h - 0.5) * 210.0 + rn.x * side * 4.0) * kz * mix(0.45, 1.0, step(rn.z, -0.2));
    sh *= 1.0 - (0.12 + 0.3 * bk) * max(cre, 0.0) + (0.04 + 0.1 * bk) * max(-cre, 0.0);
    // the fabric drapes in shallow diagonal folds down the shin / thigh fronts
    float dr = sin(h * 46.0 + ang * 1.3) * (0.5 + 0.5 * sin(h * 13.0 - ang * 2.0));
    sh *= 1.0 + 0.07 * dr;
    // the break: trousers stack in rings over the shoe
    float br = 1.0 - smoothstep(0.1, 0.17, h);
    sh *= 1.0 - 0.13 * br * max(sin(h * 260.0 + sin(ang * 2.0) * 1.6), 0.0);
    // hem stitching just above the hem boundary
    stitch += pedBand2(sHem - 0.012, 0.0028, px * 6.0) * step(0.0, sHem) * step(h, 0.3);
    if (denim) {
      // back pockets (outline + stitching), the yoke seam above them; front pocket openings
      float py = r.y / max(vPedHgt, 0.5);
      vec2 q = vec2(abs(r.x) - 0.078 * vPedHgt / 1.76, py - 0.505);
      float pocket = step(r.z, 0.0) * step(rn.z, -0.25);
      float box = max(abs(q.x) - 0.042 * vPedHgt / 1.76, abs(q.y) - 0.04);
      stitch += pedBand2(box, 0.0011, px) * pocket;
      sh *= 1.0 - 0.15 * pedBand2(box + 0.004, 0.0012, px) * pocket;
      sh *= 1.0 - 0.15 * pedBand2(py - 0.555 + abs(r.x) * 0.15, 0.0012, px) * step(rn.z, -0.2);
    }
    {
      // front pocket openings (a slanted edge with the pocket bag's shadow under it) on every cut; plain
      // trousers get back welt pockets (a slit with a button)
      float py = r.y / max(vPedHgt, 0.5);
      float sx = abs(r.x) * 1.76 / max(vPedHgt, 0.5);
      float fp = step(0.25, rn.z) * step(0.045, sx) * step(sx, 0.115) * step(0.0, sHem);
      float pe = py - 0.5 - (sx - 0.06) * 1.3;
      sh *= 1.0 - (0.3 * pedBand2(pe, 0.0015, px) + 0.08 * smoothstep(0.0, -0.012, pe) * step(-0.03, pe)) * fp;
      if (!denim) {
        float bp = step(r.z, 0.0) * step(rn.z, -0.3) * step(0.0, sHem);
        float wy = py - 0.545, wx = sx - 0.075;
        sh *= 1.0 - 0.3 * pedBand2(wy, 0.0012, px) * step(abs(wx), 0.03) * bp;
        sh *= 1.0 - 0.25 * (1.0 - smoothstep(0.003, 0.0045 + px, length(vec2(wx, (wy + 0.012) * vPedHgt / 1.76)))) * bp;
      }
    }
  } else if (reg > 1.5 && reg < 2.5) {
    // sleeves: elbow creases on the inside of the bend, gathers at a long cuff, the under-arm seam
    float ez = exp(-pow((h - 0.5) / 0.08, 2.0));
    float be = clamp(bend / 1.8, 0.0, 1.0);
    float cre = sin((h - 0.5) * 170.0 + rn.y * 3.0) * ez * step(0.0, rn.z + 0.3);
    sh *= 1.0 - (0.1 + 0.3 * be) * max(cre, 0.0);
    float cuff = 1.0 - smoothstep(0.05, 0.12, h);
    sh *= 1.0 - 0.1 * cuff * max(sin(h * 300.0 + ang * 2.0), 0.0);
    sh *= 1.0 - 0.14 * pedBand2(inner - 0.97, 0.025, px * 10.0);
    sh *= 1.0 + 0.04 * sin(h * 38.0 + ang * 1.5);
    stitch += pedBand2(sHem - 0.01, 0.0025, px * 6.0) * step(0.0, sHem);
  } else if (reg > 0.5 && reg < 1.5) {
    // torso: side seams, folds gathering at the waist sides, a pull from the chest, the hem stitching
    sh *= 1.0 - 0.14 * pedBand2(rn.z, 0.03, px * 12.0) * step(0.2, h);
    float wz = exp(-pow((h - 0.36) / 0.12, 2.0));
    float sideK = smoothstep(0.3, 0.9, abs(rn.x));
    sh *= 1.0 - 0.1 * wz * sideK * max(sin(h * 120.0 + rn.z * 5.0), 0.0);
    float chest = exp(-pow((h - 0.62) / 0.1, 2.0)) * step(0.3, rn.z);
    sh *= 1.0 + 0.04 * chest * sin(r.x * 160.0 - h * 30.0);
    stitch += pedBand2(sHem - 0.012, 0.0025, px * 6.0) * step(0.0, sHem) * step(h, 0.6);
    float fx = r.x * 1.76 / max(vPedHgt, 0.5);
    float frontK = smoothstep(0.35, 0.6, rn.z);
    if ((vPedFB & 64u) != 0u) {
      // shirt: the button placket down the front (two edge lines, a slightly raised strip), buttons, and
      // the shadow the collar band throws on the shirt below it
      float pl = pedBand2(abs(fx) - 0.012, 0.0009, px) * frontK * step(0.2, h);
      sh *= (1.0 - 0.22 * pl) * (1.0 + 0.04 * pedBand2(fx, 0.012, px) * frontK);
      float bz = fract(r.y / 0.085 + 0.3) - 0.5;
      float bt = 1.0 - smoothstep(0.0035, 0.0035 + px, length(vec2(fx, bz * 0.085)));
      sh *= 1.0 + 0.25 * bt * frontK * step(0.2, h) - 0.3 * pedBand2(length(vec2(fx, bz * 0.085)) - 0.0042, 0.0006, px) * frontK * step(0.2, h);
      sh *= 1.0 - 0.3 * smoothstep(0.955, 0.99, h);
    }
    if ((vPedFB & 128u) != 0u && sHem > 0.0) {
      // jacket: flap pockets at the hips — the flap's lower edge throws a shadow onto the pocket
      float pq = sHem - 0.1;
      float pxk = step(0.05, abs(fx)) * step(abs(fx), 0.135) * smoothstep(0.1, 0.4, rn.z);
      sh *= 1.0 - (0.3 * pedBand2(pq, 0.0015, px) + 0.12 * smoothstep(0.0, -0.01, pq) * step(-0.02, pq) - 0.05 * step(0.0, pq) * step(pq, 0.04)) * pxk;
    }
  } else {
    // coats / skirts: long vertical drape folds
    sh *= 1.0 + 0.07 * sin(ang * 7.0 + h * 3.0) * (0.6 + 0.4 * sin(ang * 3.0));
  }
  // sleeves and trouser legs: folds only on the garment side of the hem (s > 0) — on bare forearms and
  // shins below a short sleeve / shorts the cuff gathers and crease rings read as stripes on the skin
  float cloth = reg > 1.5 && reg < 3.5 ? clamp(sHem / max(fwidth(sHem), 1e-4) + 0.5, 0.0, 1.0) : 1.0;
  pc *= mix(1.0, sh, det * cloth);
  pedFabK = det * cloth;
  pedFabH = ((sh - 1.0) * 0.004 + wv * wvK * (knit ? 0.00018 : 0.0001)) * pedFabK;
  pc = mix(pc, thread, clamp(stitch, 0.0, 1.0) * det * (denim ? 0.7 : 0.35));
  return pc;
}
// ── shoes (close range): welt / midsole line above the sole, laces over the instep, toe-cap and heel
// seams (aux: u across the last −1…1, v heel 0 … toe 1)
vec3 pedShoe(vec3 pc, vec2 uv, float sHem) {
  vec3 rn = normalize(vPedRN);
  float px = max(fwidth(uv.y), 1e-5) * 0.26; // ≈ metres per pixel along a 26 cm last
  float det = 1.0 - smoothstep(0.004, 0.011, px);
  if (det <= 0.0 || sHem < 0.0) return pc;
  float lum = dot(pc, vec3(0.3, 0.55, 0.15));
  bool light = lum > 0.35;
  vec3 seamC = pc * (light ? 0.72 : 0.6);
  float m = 0.0;
  vec3 c = pc;
  // welt / midsole line just above the sole
  float wl = 1.0 - smoothstep(0.04, 0.08, sHem);
  c = mix(c, light ? pc * 0.86 : pc * 1.35 + 0.02, wl * 0.8);
  // laces: bars across the instep on the top of the shoe
  float top = smoothstep(0.35, 0.6, rn.y);
  float lz = uv.y * 26.0;
  float lace = top * step(abs(uv.x), 0.38) * step(0.42, uv.y) * step(uv.y, 0.72);
  float bars = 1.0 - smoothstep(0.18, 0.32, abs(fract(lz) - 0.5));
  vec3 laceC = light ? vec3(0.82, 0.81, 0.78) : pc * 0.45;
  c = mix(c, laceC, lace * bars * 0.9);
  // the tongue gap either side of the laces, toe-cap and heel seams
  m += top * step(0.42, uv.y) * step(uv.y, 0.74) * (1.0 - smoothstep(0.03, 0.07, abs(abs(uv.x) - 0.42)));
  m += (1.0 - smoothstep(0.004, 0.012, abs(uv.y - 0.8 + 0.06 * uv.x * uv.x))) * 0.8;
  m += (1.0 - smoothstep(0.004, 0.012, abs(uv.y - 0.2))) * 0.6;
  c = mix(c, seamC, clamp(m, 0.0, 1.0) * 0.6);
  return mix(pc, c, det);
}
// ── close-level face paint (face coords in metres of the average man's head: X lateral, Y up from the
// eye line). Eyes (almond opening, sclera, iris, pupil, lash line, lid crease), brows, lips with the
// mouth line, nostrils, age lines, stubble. Fades to soft tones where a pixel covers > ~5 mm.
float pedBand(float d, float hw, float px) { return 1.0 - smoothstep(hw - px * 0.5, hw + px * 0.5, abs(d)); }
vec3 pedFacePaint(vec3 skin, vec2 F) {
  float px = max(max(fwidth(F.x), fwidth(F.y)), 1e-5);
  float det = 1.0 - smoothstep(0.006, 0.016, px);
  float w = vPedHairW.w;
  uint age = vPedFB & 3u;
  uint eyeC = (vPedFB >> 2u) & 3u;
  vec3 hair = vPedHairW.rgb;
  float ax = abs(F.x);
  vec3 pc = skin;
  // cheeks a touch warmer
  pc *= mix(vec3(1.0), vec3(1.05, 0.97, 0.95), exp(-dot(vec2(ax - 0.043, F.y + 0.03), vec2(ax - 0.043, F.y + 0.03)) / 0.00025));
  // stubble shadow on the jaw / upper lip (some men)
  if ((vPedFB & 32u) != 0u) {
    float jaw = smoothstep(-0.045, -0.06, F.y) * (1.0 - smoothstep(0.05, 0.066, ax)) * smoothstep(-0.114, -0.098, F.y);
    pc = mix(pc, pc * 0.72 + hair * 0.08, jaw * 0.6);
  }
  // age: nasolabial folds, forehead lines, crow's feet
  if (age > 0u) {
    float k = float(age) / 3.0;
    vec2 a = vec2(0.016, -0.038), b = vec2(0.03, -0.074);
    vec2 pa = vec2(ax, F.y) - a, ba = b - a;
    float dn = length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
    float lines = pedBand(dn, 0.0007 + 0.0005 * k, px) * (0.25 + 0.3 * k);
    lines += (pedBand(F.y - 0.034, 0.0004, px) + pedBand(F.y - 0.043, 0.0004, px)) * step(ax, 0.035) * 0.3 * k;
    lines += pedBand(F.y + 0.002 - (ax - 0.047) * 0.0, 0.0003, px) * step(0.046, ax) * step(ax, 0.054) * 0.3 * k;
    pc *= 1.0 - lines * det;
  }
  // eyes
  float ex = ax - 0.031, ey = F.y - 0.0004;
  float ew = 0.0122;
  float q = 1.0 - (ex * ex) / (ew * ew);
  float qa = pow(max(q, 0.0), 0.75);
  // the opening is narrower than the eyeball: the upper lid covers the top of the iris, the lower lid
  // touches its bottom edge, so little sclera shows above / below it
  float upper = 0.0047 * qa + 0.0007 * ex / ew;
  float lower = -0.003 * pow(max(q, 0.0), 0.9) + 0.0005 * ex / ew;
  float dU = upper - ey, dL = ey - lower;
  float open = smoothstep(-px * 0.5, px * 0.5, min(dU, dL)) * step(0.0, q);
  vec3 iris = eyeC == 0u ? vec3(0.07, 0.04, 0.025) : eyeC == 1u ? vec3(0.17, 0.09, 0.04) : eyeC == 2u ? vec3(0.17, 0.16, 0.08) : vec3(0.2, 0.27, 0.33);
  float dI = length(vec2(ex, ey + 0.0003));
  // sclera: off-white (a little of the skin's own tone in it: darker skin, more pigmented sclera), greyer
  // and pinker towards the corners (the eyeball turns away from the light)
  vec3 scl = mix(vec3(0.66, 0.62, 0.56), skin * vec3(1.25, 1.15, 1.05), 0.22);
  vec3 eye = mix(scl, scl * vec3(0.78, 0.68, 0.64), smoothstep(0.003, 0.0115, abs(ex)));
  // iris: dark limbal ring, lighter collarette round the pupil, radial fibres
  float ir = dI / 0.0057;
  float ia = atan(ey + 0.0003, ex);
  float fib = 0.5 + 0.25 * sin(ia * 11.0 + float(eyeC)) + 0.25 * sin(ia * 23.0 + 1.7); // periodic: no seam
  vec3 irisC = iris * mix(1.45, 0.55, smoothstep(0.45, 1.0, ir)) * mix(1.0, 0.75 + 0.5 * fib, det);
  eye = mix(eye, irisC, 1.0 - smoothstep(0.0057 - px * 0.5, 0.0057 + px * 0.5, dI));
  eye = mix(eye, vec3(0.012), 1.0 - smoothstep(0.002 - px * 0.5, 0.002 + px * 0.5, dI));
  // the eyeball sits recessed under the brow; the upper lid and lashes shade its upper half
  eye *= 0.82 * (1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.0048, dU))) * (1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.0016, dL)));
  eye += 0.22 * (1.0 - smoothstep(0.0, 0.001 + px * 0.5, length(vec2(ex - 0.0016, ey - 0.0006))));
  // lash line (thicker on women and at the outer corner), lid crease, lower lid
  float lw = (0.0009 + 0.0007 * w) * (1.0 + 0.5 * smoothstep(-0.004, 0.012, ex));
  float qL = step(0.0, 1.0 - (ex * ex) / (ew * ew * 1.15));
  float lash = smoothstep(-px * 0.5, px * 0.5, -dU) * (1.0 - smoothstep(lw - px * 0.5, lw + px * 0.5, -dU)) * qL;
  float crease = pedBand(-dU - 0.0042, 0.0006, px) * qL * 0.4;
  // the lid fold between lash line and crease catches the light; above the crease the socket recedes
  float lid = smoothstep(0.0, 0.0012, -dU) * (1.0 - smoothstep(0.0032, 0.0042, -dU)) * qL;
  float sock = (1.0 - smoothstep(0.0042, 0.0095, -dU)) * smoothstep(0.0042, 0.0048, -dU) * step(0.0, 1.0 - (ex * ex) / (ew * ew * 1.6));
  float lowL = smoothstep(-px * 0.5, px * 0.5, -dL) * (1.0 - smoothstep(0.0006 - px * 0.5, 0.0006 + px * 0.5, -dL)) * qL * 0.35;
  vec3 eyes = mix(pc, eye, open);
  eyes = mix(eyes, vec3(0.03, 0.025, 0.022), lash * 0.92);
  eyes *= (1.0 - crease - lowL) * (1.0 + 0.06 * lid) * (1.0 - 0.14 * sock);
  // inner corner: the hollow between the eye and the bridge of the nose
  eyes *= 1.0 - 0.2 * exp(-((ax - 0.0165) * (ax - 0.0165)) / 0.000018 - (ey * ey) / 0.00003);
  // far: a soft eye shadow instead of aliasing detail
  float socket = exp(-(ex * ex) / 0.00022 - (ey * ey) / 0.00005);
  pc = mix(pc * (1.0 - 0.5 * socket), eyes, det);
  // brows
  float bx = ax - 0.029;
  float bt = clamp((bx + 0.017) / 0.036, 0.0, 1.0);
  float bcy = 0.0128 + 0.0036 * sin(bt * 2.7) - 0.0018 * bt;
  float bth = mix(0.0033, 0.0014, bt) * mix(1.0, 0.68, w);
  float brow = pedBand(F.y - bcy, bth, px) * smoothstep(-0.019, -0.0165, bx) * (1.0 - smoothstep(0.016, 0.0195, bx));
  pc = mix(pc, mix(pc, hair * 0.75, 0.85), brow * mix(0.5, 1.0, det));
  // lips: upper (cupid's bow) and lower, the mouth line between them
  float ly = F.y + 0.0665;
  float lhw = 0.0215 * (1.0 - 0.08 * w) * (1.0 - 0.12 * float(age) / 3.0);
  float lq = max(1.0 - (F.x * F.x) / (lhw * lhw), 0.0);
  float upT = 0.0054 * pow(lq, 0.55) - 0.0011 * exp(-(F.x * F.x) / 0.000012);
  float loB = -0.0064 * pow(lq, 0.7);
  float lip = smoothstep(-px * 0.5, px * 0.5, min(upT - ly, ly - loB)) * step(0.0005, lq);
  vec3 lipC = skin * mix(vec3(0.84, 0.58, 0.56), vec3(0.8, 0.48, 0.49), w);
  if ((vPedFB & 16u) != 0u) lipC = vec3(0.32, 0.05, 0.07);
  lipC *= mix(1.0, 0.86, step(0.0, ly)); // the upper lip faces down: a little darker
  pc = mix(pc, lipC, lip * mix(0.5, 1.0, det));
  pc = mix(pc, skin * 0.28, pedBand(ly, 0.0005, px) * step(0.002, lq) * 0.85 * det);
  // cavities the ambient light hardly reaches: under the nose, beside the nostril wings, the chin crease
  float cav = 0.16 * exp(-(F.x * F.x) / 0.00012 - ((F.y + 0.05) * (F.y + 0.05)) / 0.000012)
            + 0.12 * exp(-((ax - 0.016) * (ax - 0.016)) / 0.000012 - ((F.y + 0.042) * (F.y + 0.042)) / 0.00005)
            + 0.12 * exp(-(F.x * F.x) / 0.0002 - ((F.y + 0.081) * (F.y + 0.081)) / 0.000012);
  pc *= 1.0 - cav * mix(0.5, 1.0, det);
  // nostrils
  vec2 nd = vec2((ax - 0.0086) / 0.0031, (F.y + 0.0448) / 0.0017);
  pc = mix(pc, skin * 0.25, (1.0 - smoothstep(0.75, 1.0, length(nd))) * 0.9 * det);
  return pc;
}
`;
// fade ≥ 0: keep the dither cells below fade (spawn / despawn, incoming level of a cross-fade);
// fade < 0: keep the complementary cells (outgoing level of a cross-fade)
const FRAG_FADE = /* glsl */ `
  if (vPedFade < 0.995) {
    float pedD = pedBayer4(gl_FragCoord.xy);
    if (vPedFade < 0.0 ? pedD < -vPedFade - 0.003 : vPedFade <= pedD + 0.001) discard;
  }
`;
const FRAG_COLOR = /* glsl */ `
  {
    float fw = max(fwidth(vPedS), 1e-4);
    vec3 pc = mix(vPedB, vPedA, clamp(vPedS / fw + 0.5, 0.0, 1.0));
    if (vPedPat > 0.5) {
      // hi-vis reflective stripes (vest) / towel stripes
      float hh = vPedPat < 1.5 ? vPedH : abs(vPedH);
      float st = vPedPat < 1.5 ? (step(0.47, hh) - step(0.52, hh)) + (step(0.6, hh) - step(0.65, hh)) : (step(0.78, hh) - step(0.86, hh));
      if (vPedPat < 1.5) st *= step(0.0, vPedS);
      pc = mix(pc, vec3(0.78, 0.78, 0.76), st);
    }
    if (vPedFace.z > 4.5) {
      // LONG HAIR ENDS: over the last ~7 cm the sheet breaks into separate locks (gaps open between the
      // strand clumps, each clump ends at its own length, fine strands straggle), and it thins out along its
      // front edges by the cheeks; thin ends let light through (a little lighter). Fades out with distance.
      pc *= pedStrands(vPedRest);
      vec2 hf = pedHairFlow(vPedRest);
      float ca = hf.x * 26.0 + sin(hf.y * 9.0) * 0.8;
      float far = smoothstep(0.35, 0.9, fwidth(ca));
      // each lock (one clump wide) tapers to a point and has its own length; fine strands straggle past it
      float li = floor(ca);
      float lr = fract(sin(li * 91.7 + 3.1) * 43758.5453);
      float tri = 1.0 - abs(fract(ca) - 0.5) * 2.0;
      float fine = pedN1(hf.x * 90.0 + hf.y * 3.0) * (1.0 - smoothstep(0.35, 0.8, fwidth(hf.x * 90.0)));
      float clump = tri * 0.85 + fine * 0.3;
      float tipK = 1.0 - smoothstep(0.0, 0.06, vPedFace.x - lr * 0.03);
      float edgeK = 1.0 - smoothstep(1.17, 1.45, vPedFace.y);
      float need = max(tipK, edgeK * 0.65) * (1.0 - far);
      if (clump < need) discard;
      pc *= 1.0 + 0.18 * max(tipK, edgeK) * (1.0 - far);
    }
    else if (vPedFace.z > 2.5) {
      // HAIRLINE: the cap thins out into the skin over its first rings — single strands and gaps broken
      // along the hairline (two noise octaves round the head), a soft root shadow on the skin side
      pc *= pedStrands(vPedRest);
      float a = atan(vPedRest.x, vPedRest.z + 0.015);
      float e = vPedFace.x + (pedN1(a * 55.0) - 0.5) * 0.14 + (pedN1(a * 170.0 + vPedRest.y * 300.0) - 0.5) * 0.08 * (1.0 - smoothstep(0.3, 0.7, fwidth(a * 170.0)));
      float cov = smoothstep(0.0, 0.17, e);
      vec3 skinSide = mix(vPedSkin, vPedSkin * 0.8 + pc * 0.12, 0.6);
      pc = mix(skinSide, pc, cov);
    }
    else if (vPedFace.z > 1.5) pc = pedShoe(pc, vPedFace.xy, vPedS);
    else if (vPedFace.z > 0.02 && vPedFace.z < 1.01 && (abs(vPedReg - ${R.FACE}.0) < 0.5 || abs(vPedReg - ${R.SKIN}.0) < 0.5)) {
      // the face paint fades out across the last row of triangles into the head's SKIN region (face coords
      // there are 0: divide by the interpolated face share) — a hard cut drew a tone line round the face
      pc = mix(pc, pedFacePaint(pc, vPedFace.xy / vPedFace.z), smoothstep(0.02, 0.7, vPedFace.z));
    }
    else if (abs(vPedReg - ${R.HAIR}.0) < 0.5 || abs(vPedReg - ${R.BEARD}.0) < 0.5) pc *= pedStrands(vPedRest);
    else if (vPedReg > 0.5 && vPedReg < 3.5 || abs(vPedReg - ${R.OUTER}.0) < 0.5 || abs(vPedReg - ${R.TAIL}.0) < 0.5) pc = pedFabric(pc, vPedReg, vPedH, vPedS);
    diffuseColor.rgb *= pc;
  }
`;

/** hair: strand ridges tilt the normal across the strands (view space; fades where it would alias) */
const HAIR_NORMAL = /* glsl */ `
  if (abs(vPedReg - ${R.HAIR}.0) < 0.5) {
    // strand ridges across the flow as a derivative bump (screen-space height gradient), so the shading
    // follows the strands wherever they run (combed from the whorl on the cap, hanging on sheets)
    vec2 hf = pedHairFlow(vPedRest);
    float ha = hf.x;
    float hq = ha * 70.0 + sin(hf.y * 13.0 + ha * 2.0) * 0.6;
    float hk = 1.0 - smoothstep(0.3, 0.7, fwidth(hq));
    // fine strands (fade below ~2 px per ridge) + clumps of strands, which break the sheen into locks at 1–3 m
    float hc2 = ha * 26.0 + sin(hf.y * 9.0) * 0.8;
    float hk2 = 1.0 - smoothstep(0.35, 0.8, fwidth(hc2));
    float hbrk = 0.55 + 0.45 * pedN1(hf.y * 16.0 + ha * 5.0);
    float hH = 0.55 * sin(hq * 6.2832) * 0.00009 * hk + (pedN1(hc2) + 0.5 * pedN1(hc2 * 2.3 + 7.0) - 0.75) * 0.0006 * hk2 * hbrk;
    vec3 hsx = dFdx(-vViewPosition), hsy = dFdy(-vViewPosition);
    vec3 hr1 = cross(hsy, normal), hr2 = cross(normal, hsx);
    float hdet = dot(hsx, hr1);
    vec3 hgrad = sign(hdet) * (dFdx(hH) * hr1 + dFdy(hH) * hr2);
    normal = normalize(abs(hdet) * normal - hgrad);
    // strand direction (view space) = gradient of the distance along the flow, in the surface plane
    vec3 hT = sign(hdet) * (dFdx(hf.y) * hr1 + dFdy(hf.y) * hr2);
    hT -= normal * dot(hT, normal);
    pedHairT = dot(hT, hT) > 1e-20 ? normalize(hT) : vec3(0.0);
    pedHairSh = (pedN1(hc2) - 0.5) * 0.35 * hk2 + (pedN1(hf.y * 7.0 + ha * 3.0) - 0.5) * 0.15;
  }
`;
/** fabric: folds, seams and weave tilt the normal (screen-space derivative bump of pedFabH) */
const FABRIC_NORMAL = /* glsl */ `
  if (pedFabK > 0.0) {
    vec3 fsx = dFdx(-vViewPosition), fsy = dFdy(-vViewPosition);
    vec3 fr1 = cross(fsy, normal), fr2 = cross(normal, fsx);
    float fdet = dot(fsx, fr1);
    vec3 fgrad = sign(fdet) * (dFdx(pedFabH) * fr1 + dFdy(pedFabH) * fr2);
    normal = normalize(abs(fdet) * normal - fgrad);
  }
`;
/** Lambert direct light with per-region wrap (skin, hair) and a faint Blinn sheen (hair, shoes). */
const LAMBERT_PEOPLE = /* glsl */ `
varying vec3 vViewPosition;
vec3 pedHairT = vec3(0.0);
float pedHairSh = 0.0;
struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float wrap = vPedMat.x;
  float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + wrap ) / ( 1.0 + wrap ) );
  vec3 irradiance = dotNL * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  if ( pedFabK > 0.0 ) {
    // cloth: fibres standing off the surface catch the light at grazing view angles (soft rim, tinted by
    // the cloth) — what separates woven / knitted fabric from smooth plastic
    float fnv = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseColor ) * pedFabK * 0.9 * fnv * fnv * fnv * saturate( dot( geometryNormal, directLight.direction ) + 0.3 );
  }
  if ( dot( pedHairT, pedHairT ) > 0.5 ) {
    // hair: anisotropic sheen (Kajiya-Kay) — a band across the strands, broken per lock by the shift;
    // a white primary lobe and a broader secondary lobe tinted by the hair (light passing through it)
    vec3 hH = normalize( directLight.direction + geometryViewDir );
    vec3 t1 = normalize( pedHairT + geometryNormal * ( -0.08 + pedHairSh ) );
    vec3 t2 = normalize( pedHairT + geometryNormal * ( 0.12 + pedHairSh ) );
    float d1 = dot( t1, hH ), d2 = dot( t2, hH );
    float s1 = pow( sqrt( max( 1.0 - d1 * d1, 0.0 ) ), 90.0 );
    float s2 = pow( sqrt( max( 1.0 - d2 * d2, 0.0 ) ), 24.0 );
    float vis = smoothstep( -0.1, 0.35, dot( geometryNormal, directLight.direction ) );
    vec3 hc = min( material.diffuseColor * 4.0 + 0.04, vec3( 1.0 ) );
    reflectedLight.directDiffuse += directLight.color * vis * ( 0.035 * s1 + 0.05 * s2 * hc );
  } else if ( vPedMat.y > 0.0 ) {
    float nh = saturate( dot( geometryNormal, normalize( directLight.direction + geometryViewDir ) ) );
    reflectedLight.directDiffuse += directLight.color * vPedMat.y * pow( nh, 18.0 ) * saturate( dot( geometryNormal, directLight.direction ) * 4.0 );
  }
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;

/** hat style table: A = (push out, crown lift, rim drop, front slope), B = (brim radius, brim droop, visor length, flatten) */
const HAT_A = [
  [0, 0, 0, 0],
  [0.002, 0.004, 0, 0],
  [0.004, -0.018, -0.004, 0.012],
  [0.006, 0.05, 0, 0],
  [0.004, 0.045, 0, -0.012],
  [0.012, 0.022, 0, 0],
  [0.004, 0.03, 0.03, 0],
  [0.008, 0.03, 0, 0],
];
const HAT_B = [
  [0, 0, 0.075, 0],
  [0, 0, 0.075, 0],
  [0, 0, 0.05, 0.6],
  [0.16, 0.035, 0.075, 0.4],
  [0.075, 0.01, 0.075, 0.3],
  [0.035, 0.0, 0.075, 0],
  [0, 0, 0.075, 0],
  [0.055, 0.03, 0.075, 0.25],
];

export interface PersonMaterials {
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
}

function uniformsFor(): Record<string, THREE.IUniform> {
  const piv = pivotTable();
  const pivots: THREE.Vector3[] = [];
  for (let i = 0; i < piv.length; i += 3) pivots.push(new THREE.Vector3(piv[i], piv[i + 1], piv[i + 2]));
  return {
    uPedPiv: { value: pivots },
    uPedHatA: { value: HAT_A.map((a) => new THREE.Vector4(...(a as [number, number, number, number]))) },
    uPedHatB: { value: HAT_B.map((a) => new THREE.Vector4(...(a as [number, number, number, number]))) },
    uPedHairline: { value: 1 },
  };
}

/** ?nohairline: hard-edged smooth hair cap (no feathered hairline, no locks in the silhouette) */
export function setPedHairline(on: boolean): void {
  sharedUniforms().uPedHairline.value = on ? 1 : 0;
}

let shared: Record<string, THREE.IUniform> | null = null;
function sharedUniforms(): Record<string, THREE.IUniform> {
  return (shared ??= uniformsFor());
}

function injectVertex(src: string, normals: boolean): string {
  let s = src.replace('#include <common>', `#include <common>\n${VERT_PARS}`);
  if (normals) {
    s = s
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\n  vec3 pedP = vec3( position );\n  pedPose( pedP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = pedP;');
  } else {
    // depth (shadow proxy): shrunk 1 cm along the normal so the coarse proxy never pokes out of the
    // detailed figure it shadows (jagged self-shadow bands on skirts and sleeves)
    s = s.replace('#include <begin_vertex>', 'vec3 transformed = vec3( position );\n  vec3 pedN = vec3( normal );\n  pedPose( transformed, pedN );\n  transformed -= pedN * 0.01 * P_scale;');
  }
  return s;
}

export function makePeopleMaterials(): PersonMaterials {
  const material = new THREE.MeshLambertMaterial();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms());
    shader.uniforms.uPedNight = globalUniforms.uNight;
    shader.vertexShader = injectVertex(shader.vertexShader, true);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\nuniform float uPedNight;`)
      .replace(/void main\(\)\s*\{/, (m) => `${m}\n${FRAG_FADE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${HAIR_NORMAL}\n${FABRIC_NORMAL}`)
      .replace('#include <lights_lambert_pars_fragment>', LAMBERT_PEOPLE)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.07 * uPedNight;');
  };
  material.customProgramCacheKey = () => 'tinyhaven-people-4';
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms());
    shader.vertexShader = injectVertex(shader.vertexShader, false);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_PARS}`).replace(/void main\(\)\s*\{/, (m) => `${m}\n${FRAG_FADE}`);
  };
  depth.customProgramCacheKey = () => 'tinyhaven-people-depth-2';
  return { material, depth };
}

/** Main-pass material of the shadow proxy: draws nothing (the proxy only casts shadows). */
export function makeInvisibleMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }',
    fragmentShader: 'void main() { discard; }',
  });
  m.depthWrite = false;
  m.colorWrite = false;
  return m;
}
