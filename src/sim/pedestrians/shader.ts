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
  'hairLen',
  'tailHem',
  'tailFlare',
  'spare',
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
uniform vec4 uPedHatB[8];
varying vec3 vPedA;
varying vec3 vPedB;
varying float vPedS;
varying float vPedH;
flat varying float vPedFade;
flat varying float vPedPat;
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
    pedJoint(p, n, pedRX(-(left ? P_ankleL : P_ankleR)), pedPivS(${PIV.ANKLE}, left), w);
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
  uint d0 = aData.x;
  if (!pedVisible(d0)) { p = vec3(0.0, -50.0, 0.0); n = vec3(0.0, 1.0, 0.0); vPedA = vPedB = vec3(0.0); vPedS = 0.0; vPedH = 0.0; vPedPat = 0.0; return; }
  int bone = int(d0 & 31u);
  int region = int((d0 >> 5u) & 31u);
  float tint = float(d0 >> 24u) * (1.0 / 200.0);
  float h = float(aData.y & 0xFFFFu) * (4.0 / 65535.0) - 2.0;
  float w = float(aData.y >> 16u) * (1.0 / 65535.0);
  vec2 aux = pedU2(aData.z);
  pedW = vec3(P_w, P_c, P_b);
  // ── morph
  p += pedW.x * vec3(pedM16(aMorph.x & 0xFFFFu), pedM16(aMorph.x >> 16u), pedM16(aMorph.y & 0xFFFFu))
     + pedW.y * vec3(pedM16(aMorph.y >> 16u), pedM16(aMorph.z & 0xFFFFu), pedM16(aMorph.z >> 16u))
     + pedW.z * vec3(pedM16(aMorph.w & 0xFFFFu), 0.0, pedM16(aMorph.w >> 16u));
  uint nd = aData.w;
  n = normalize(n + pedW.x * (vec3(float(nd & 1023u), float((nd >> 10u) & 1023u), float((nd >> 20u) & 1023u)) * (2.0 / 1023.0) - 1.0));

  // ── parametric garments
  if (region == ${R.HAIR} && aux.x > 0.0) {
    // long hair: vertices deeper than the hair length are lifted to the hem
    p.y += max(0.0, aux.x - P_hairLen);
  }
  if (region == ${R.HAT}) {
    uint st = (iC1.y >> 24u) & 7u;
    vec4 ha = uPedHatA[st];
    vec4 hb = uPedHatB[st];
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
    if (u > -0.25) {
      float hemY = P_tailHem * hip.y;
      p.y = p.y - u * max(0.0, p.y - hemY);
      vec2 rad = p.xz - vec2(0.0, -0.01);
      p.xz += normalize(rad + vec2(1e-5)) * u * P_tailFlare;
    }
    // thighs (and shins for long hems) carry the skirt: blend by side and depth
    float k = u < -0.75 ? 0.0 : (u < -0.25 ? 0.15 : 0.25 + 0.5 * u);
    float side = aux.y;
    float wl = k * clamp(0.5 + 0.75 * side, 0.0, 1.0);
    float wr = k * clamp(0.5 - 0.75 * side, 0.0, 1.0);
    vec3 pl = p, pr = p, nl = n, nr = n;
    float z0 = 0.0;
    vec3 kl = pedPivS(${PIV.KNEE}, true), kr = pedPivS(${PIV.KNEE}, false);
    if (p.y < kl.y) { pedJoint(pl, nl, pedRX(P_kneeL), kl, z0); z0 = 0.0; pedJoint(pr, nr, pedRX(P_kneeR), kr, z0); z0 = 0.0; }
    pedJoint(pl, nl, pedHipR(true), pedPivS(${PIV.HIP}, true), z0); z0 = 0.0;
    pedJoint(pr, nr, pedHipR(false), pedPivS(${PIV.HIP}, false), z0);
    p += wl * (pl - p) + wr * (pr - p);
    n = normalize(n + wl * (nl - n) + wr * (nr - n));
    if (P_tailFloor > 0.0) p.y = max(p.y, P_tailFloor);
    bone = ${B.PELVIS};
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
  vPedA = A * tint;
  vPedB = Bc * tint;
  vPedS = s;
  vPedH = h;
  vPedPat = pat;

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
float pedBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float pedBayer4(vec2 a) { return pedBayer2(0.5 * a) * 0.25 + pedBayer2(a); }
`;
const FRAG_FADE = /* glsl */ `
  if (vPedFade < 0.995 && vPedFade <= pedBayer4(gl_FragCoord.xy) + 0.001) discard;
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
    diffuseColor.rgb *= pc;
  }
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
  };
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
    s = s.replace('#include <begin_vertex>', 'vec3 transformed = vec3( position );\n  vec3 pedN = vec3( 0.0, 1.0, 0.0 );\n  pedPose( transformed, pedN );');
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
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.07 * uPedNight;');
  };
  material.customProgramCacheKey = () => 'tinyhaven-people-2';
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
