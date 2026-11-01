// A cat, seen from a metre: one skin in three poses (standing, sitting up, loafing with its paws tucked), blended in the
// vertex shader, with legs that walk, a head that turns and a tail that lives its own life. About 700 triangles. Coat,
// eyes, nose and inner ears painted in the fragment shader from the standing pose, so a stripe stays on its rib whatever
// the cat is doing. Feet at the origin, +Z forward.

import * as THREE from 'three';
import { patchLampMaterial } from '../../world/lamps/integrate';

const PART = { BODY: 0, TAIL: 1, FL: 2, FR: 3, BL: 4, BR: 5, WHISKER: 6 } as const;
const MAT = { FUR: 0, EAR: 1, NOSE: 2, WHISKER: 3 } as const;

/** z, y, rx, ry, weight (head or tail along its length; leg: from the hip down), x */
type Ring = [number, number, number, number, number, number?];
interface PoseShape {
  body: Ring[];
  tail: Ring[];
  fl: Ring[];
  bl: Ring[];
  /** the skull: where the ears and whiskers go */
  head: [number, number, number];
}

const skull = (z: number, y: number): Ring[] => [
  [z - 0.058, y - 0.045, 0.037, 0.039, 0.72],
  [z - 0.034, y - 0.018, 0.047, 0.046, 1],
  [z - 0.004, y - 0.002, 0.052, 0.047, 1],
  [z + 0.026, y - 0.012, 0.042, 0.037, 1],
  [z + 0.046, y - 0.024, 0.024, 0.021, 1],
  [z + 0.056, y - 0.027, 0.014, 0.012, 1],
];

const POSES: Record<'stand' | 'sit' | 'loaf', PoseShape> = {
  stand: {
    body: [
      [-0.225, 0.205, 0.022, 0.024, 0],
      [-0.195, 0.208, 0.05, 0.052, 0],
      [-0.15, 0.206, 0.062, 0.069, 0],
      [-0.07, 0.2, 0.06, 0.071, 0],
      [0.02, 0.205, 0.06, 0.074, 0],
      [0.085, 0.222, 0.054, 0.068, 0],
      [0.125, 0.25, 0.042, 0.05, 0.12],
      [0.155, 0.285, 0.035, 0.038, 0.45],
      ...skull(0.235, 0.34),
    ],
    tail: [
      [-0.215, 0.215, 0.019, 0.019, 0],
      [-0.25, 0.232, 0.0165, 0.0165, 0.14],
      [-0.285, 0.265, 0.0155, 0.0155, 0.28],
      [-0.31, 0.31, 0.0145, 0.0145, 0.43],
      [-0.325, 0.36, 0.0135, 0.0135, 0.57],
      [-0.33, 0.41, 0.0125, 0.0125, 0.71],
      [-0.325, 0.455, 0.011, 0.011, 0.86],
      [-0.305, 0.49, 0.0075, 0.0075, 1],
    ],
    fl: [
      [0.075, 0.2, 0.03, 0.04, 0],
      [0.08, 0.13, 0.019, 0.022, 0.42],
      [0.08, 0.06, 0.0135, 0.0145, 0.74],
      [0.086, 0.018, 0.016, 0.0165, 1],
      [0.103, 0.011, 0.015, 0.011, 1],
    ],
    bl: [
      [-0.165, 0.205, 0.036, 0.055, 0],
      [-0.145, 0.13, 0.026, 0.03, 0.42],
      [-0.19, 0.07, 0.0145, 0.0165, 0.74],
      [-0.165, 0.018, 0.0165, 0.0165, 1],
      [-0.146, 0.011, 0.0155, 0.011, 1],
    ],
    head: [0.235, 0.34, 0],
  },
  sit: {
    body: [
      [-0.128, 0.07, 0.022, 0.024, 0],
      [-0.118, 0.092, 0.058, 0.05, 0],
      [-0.082, 0.11, 0.074, 0.071, 0],
      [-0.044, 0.16, 0.065, 0.069, 0],
      [-0.012, 0.215, 0.056, 0.064, 0],
      [0.008, 0.26, 0.05, 0.056, 0],
      [0.022, 0.295, 0.041, 0.046, 0.12],
      [0.036, 0.325, 0.035, 0.037, 0.45],
      ...skull(0.102, 0.385),
    ],
    tail: [
      [-0.128, 0.06, 0.019, 0.019, 0],
      [-0.14, 0.033, 0.0165, 0.0165, 0.14],
      [-0.128, 0.019, 0.0155, 0.0155, 0.28],
      [-0.085, 0.017, 0.0145, 0.0145, 0.43],
      [-0.04, 0.016, 0.0135, 0.0135, 0.57],
      [0.005, 0.016, 0.0125, 0.0125, 0.71],
      [0.05, 0.016, 0.011, 0.011, 0.86],
      [0.092, 0.016, 0.0075, 0.0075, 1],
    ],
    fl: [
      [0.012, 0.235, 0.028, 0.034, 0],
      [0.042, 0.15, 0.018, 0.021, 0.42],
      [0.058, 0.07, 0.0135, 0.0145, 0.74],
      [0.062, 0.018, 0.016, 0.0165, 1],
      [0.08, 0.011, 0.015, 0.011, 1],
    ],
    bl: [
      [-0.085, 0.105, 0.04, 0.056, 0, 0.012],
      [-0.03, 0.078, 0.03, 0.034, 0.42, 0.026],
      [-0.085, 0.032, 0.0165, 0.018, 0.74, 0.03],
      [-0.01, 0.017, 0.0165, 0.0155, 1, 0.024],
      [0.018, 0.011, 0.0155, 0.011, 1, 0.024],
    ],
    head: [0.102, 0.385, 0],
  },
  loaf: {
    body: [
      [-0.205, 0.07, 0.024, 0.024, 0],
      [-0.178, 0.078, 0.052, 0.054, 0],
      [-0.128, 0.09, 0.073, 0.075, 0],
      [-0.05, 0.095, 0.076, 0.085, 0],
      [0.03, 0.095, 0.072, 0.085, 0],
      [0.085, 0.102, 0.06, 0.075, 0],
      [0.112, 0.13, 0.046, 0.054, 0.12],
      [0.13, 0.16, 0.036, 0.04, 0.45],
      ...skull(0.208, 0.214),
    ],
    tail: [
      [-0.2, 0.06, 0.019, 0.019, 0],
      [-0.222, 0.036, 0.0165, 0.0165, 0.14, 0.012],
      [-0.205, 0.02, 0.0155, 0.0155, 0.28, 0.04],
      [-0.16, 0.017, 0.0145, 0.0145, 0.43, 0.066],
      [-0.11, 0.016, 0.0135, 0.0135, 0.57, 0.082],
      [-0.06, 0.016, 0.0125, 0.0125, 0.71, 0.088],
      [-0.012, 0.016, 0.011, 0.011, 0.86, 0.086],
      [0.03, 0.016, 0.0075, 0.0075, 1, 0.08],
    ],
    fl: [
      [0.07, 0.08, 0.026, 0.03, 0],
      [0.09, 0.05, 0.018, 0.02, 0.42],
      [0.1, 0.028, 0.0135, 0.0145, 0.74],
      [0.105, 0.02, 0.014, 0.015, 1],
      [0.118, 0.016, 0.012, 0.01, 1],
    ],
    bl: [
      [-0.12, 0.08, 0.04, 0.056, 0, 0.016],
      [-0.07, 0.065, 0.03, 0.036, 0.42, 0.028],
      [-0.11, 0.03, 0.016, 0.018, 0.74, 0.03],
      [-0.05, 0.018, 0.016, 0.015, 1, 0.026],
      [-0.025, 0.012, 0.0145, 0.01, 1, 0.026],
    ],
    head: [0.208, 0.214, 0],
  },
};

/** topology shared by all poses; each pose fills the same vertices */
class Skin {
  idx: number[] = [];
  part: number[] = [];
  mat: number[] = [];
  w: number[] = [];
  pos: number[] = [];
  pivot: number[] = [];
  n = 0;
  ring(rows: number[][], sides: number): void {
    for (let i = 0; i < rows.length - 1; i++)
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        this.idx.push(rows[i][k], rows[i + 1][k1], rows[i][k1], rows[i][k], rows[i + 1][k], rows[i + 1][k1]);
      }
  }
}

function buildAll(): THREE.BufferGeometry {
  const positions: Record<string, number[]> = { stand: [], sit: [], loaf: [] };
  let topo: Skin | null = null;
  for (const name of ['stand', 'sit', 'loaf'] as const) {
    const P = POSES[name];
    const S = new Skin();
    const v = (x: number, y: number, z: number, part: number, mat: number, w: number, px = 0, py = 0, pz = 0): number => {
      S.pos.push(x, y, z);
      S.part.push(part);
      S.mat.push(mat);
      S.w.push(w);
      S.pivot.push(px, py, pz);
      return S.n++;
    };
    const loft = (rings: Ring[], sides: number, part: number, mat: number, x0: number, mirror: number, px = 0, py = 0, pz = 0, capEnd = true): void => {
      const rows: number[][] = [];
      rings.forEach((r, i) => {
        const nb = rings[Math.min(rings.length - 1, i + 1)],
          pb = rings[Math.max(0, i - 1)];
        const az = nb[0] - pb[0],
          ay = nb[1] - pb[1];
        const al = Math.hypot(az, ay) || 1;
        const uy = az / al,
          uz = -ay / al;
        const row: number[] = [];
        const rx0 = x0 + mirror * (r[5] ?? 0);
        for (let k = 0; k < sides; k++) {
          const t = (k / sides) * Math.PI * 2;
          const c = Math.cos(t) * r[2],
            s = Math.sin(t) * r[3];
          row.push(v(rx0 + c, r[1] + uy * s, r[0] + uz * s, part, mat, r[4], px, py, pz));
        }
        rows.push(row);
      });
      S.ring(rows, sides);
      const end = rings[rings.length - 1],
        o = rings[rings.length - 2];
      if (capEnd) {
        const apex = v(x0 + mirror * (end[5] ?? 0), end[1] + (end[1] - o[1]) * 0.25, end[0] + (end[0] - o[0]) * 0.25, part, mat, end[4], px, py, pz);
        const last = rows[rows.length - 1];
        for (let k = 0; k < sides; k++) S.idx.push(last[(k + 1) % sides], last[k], apex);
      }
      const start = rings[0],
        o2 = rings[1];
      const apex0 = v(x0 + mirror * (start[5] ?? 0), start[1] + (start[1] - o2[1]) * 0.25, start[0] + (start[0] - o2[0]) * 0.25, part, mat, start[4], px, py, pz);
      for (let k = 0; k < sides; k++) S.idx.push(rows[0][k], rows[0][(k + 1) % sides], apex0);
    };
    loft(P.body, 12, PART.BODY, MAT.FUR, 0, 0);
    // nose: a small pad on the end of the muzzle
    const [hz, hy] = P.head;
    loft(
      [
        [hz + 0.049, hy - 0.022, 0.008, 0.005, 1],
        [hz + 0.0575, hy - 0.024, 0.0055, 0.0035, 1],
      ],
      5,
      PART.BODY,
      MAT.NOSE,
      0,
      0,
    );
    // ears: a shell, fur outside and pink inside
    for (const s of [1, -1]) {
      const bx = s * 0.026,
        by = hy + 0.032,
        bz = hz - 0.022;
      const a = v(bx - s * 0.018, by - 0.004, bz + 0.006, PART.BODY, MAT.EAR, 1),
        b = v(bx + s * 0.022, by - 0.006, bz + 0.002, PART.BODY, MAT.EAR, 1),
        c = v(bx + s * 0.012, by + 0.05, bz - 0.006, PART.BODY, MAT.EAR, 1),
        d = v(bx + s * 0.002, by, bz - 0.022, PART.BODY, MAT.FUR, 1);
      // inner face towards the front; the shell closes behind it
      if (s > 0) S.idx.push(a, b, c, b, d, c, d, a, c);
      else S.idx.push(a, c, b, b, c, d, d, c, a);
    }
    // whiskers: slim triangles from the muzzle
    for (const s of [1, -1]) {
      for (const [dy, dz] of [
        [0.004, 0.01],
        [-0.004, 0.0],
        [-0.012, -0.012],
      ]) {
        const a = v(s * 0.018, hy - 0.022 + dy * 0.3, hz + 0.036, PART.WHISKER, MAT.WHISKER, 1),
          b = v(s * 0.018, hy - 0.0205 + dy * 0.3, hz + 0.036, PART.WHISKER, MAT.WHISKER, 1),
          c = v(s * 0.082, hy - 0.024 + dy * 2.4, hz + 0.022 + dz, PART.WHISKER, MAT.WHISKER, 1);
        S.idx.push(a, b, c);
      }
    }
    // legs: the pivot (for the walk) is always the standing hip, the walk is only ever seen standing
    const FL = POSES.stand.fl[0],
      BL = POSES.stand.bl[0];
    for (const s of [1, -1]) {
      const fx = s * 0.033,
        bx = s * 0.036;
      loft(P.fl, 7, s > 0 ? PART.FL : PART.FR, MAT.FUR, fx, s, fx, FL[1], FL[0]);
      loft(P.bl, 7, s > 0 ? PART.BL : PART.BR, MAT.FUR, bx, s, bx, BL[1], BL[0]);
    }
    loft(P.tail, 7, PART.TAIL, MAT.FUR, 0, 1);
    positions[name] = S.pos;
    topo = S;
  }
  const S = topo as Skin;
  const g = new THREE.BufferGeometry();
  const normalsOf = (pos: number[]): THREE.BufferAttribute => {
    const t = new THREE.BufferGeometry();
    t.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    t.setIndex(S.idx);
    t.computeVertexNormals();
    return t.getAttribute('normal') as THREE.BufferAttribute;
  };
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions.stand, 3));
  g.setAttribute('normal', normalsOf(positions.stand));
  g.setAttribute('aSitP', new THREE.Float32BufferAttribute(positions.sit, 3));
  g.setAttribute('aSitN', normalsOf(positions.sit));
  g.setAttribute('aLoafP', new THREE.Float32BufferAttribute(positions.loaf, 3));
  g.setAttribute('aLoafN', normalsOf(positions.loaf));
  const info: number[] = [];
  for (let i = 0; i < S.n; i++) info.push(S.part[i], S.mat[i], S.w[i]);
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(S.pivot, 3));
  g.setIndex(S.idx);
  return g;
}

const v3 = (a: number[] | [number, number, number]) => `vec3(0.0, ${a[1].toFixed(4)}, ${a[0].toFixed(4)})`;
const tailRoot = (p: PoseShape) => [p.tail[0][0], p.tail[0][1]];
const neck = (p: PoseShape) => [p.head[0] - 0.09, p.head[1] - 0.07];

const POSE_GLSL = /* glsl */ `
attribute vec3 aSitP;
attribute vec3 aSitN;
attribute vec3 aLoafP;
attribute vec3 aLoafN;
attribute vec3 aInfo;
attribute vec3 aPivot;
attribute vec4 iC1; // walk phase, walk amplitude, sit, loaf
attribute vec4 iC2; // head yaw, head pitch, tail swish (rad), eyes shut
attribute vec4 iC3; // coat, hash, tail base bend, ear twitch
uniform float uCatTime;
varying vec3 vRest;
varying float vCMat;
varying vec4 vCat;
vec3 slCatRotY(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z); }
vec3 slCatRotX(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z); }
void slCatPose(inout vec3 p, inout vec3 n) {
  float sit = iC1.z, loaf = iC1.w, st = max(0.0, 1.0 - sit - loaf);
  vRest = p;
  vCMat = aInfo.y;
  vCat = vec4(iC3.x, iC3.y, iC2.w, 0.0);
  float part = aInfo.x, w = aInfo.z;
  // the walk: diagonal pairs, each leg about its hip, the lower leg bending as it comes forward
  if (part > 1.5 && part < 5.5) {
    float ph = iC1.x + ((part > 1.5 && part < 2.5) || (part > 4.5) ? 0.0 : 3.14159);
    if (part > 3.5) ph += 0.5;
    float a = 0.42 * iC1.y * sin(ph);
    float lift = iC1.y * max(0.0, cos(ph));
    vec3 d = p - aPivot;
    d.z += 0.05 * lift * w * (part < 3.5 ? 1.0 : -0.6);
    d.y += 0.3 * 0.1 * lift * w;
    d = slCatRotX(d, -a * st);
    n = slCatRotX(n, -a * st);
    p = aPivot + d;
  }
  p = p * st + aSitP * sit + aLoafP * loaf;
  n = n * st + aSitN * sit + aLoafN * loaf;
  vec3 nk = ${v3(neck(POSES.stand))} * st + ${v3(neck(POSES.sit))} * sit + ${v3(neck(POSES.loaf))} * loaf;
  if (part < 0.5 && w > 0.001) {
    vec3 d = p - nk;
    d = slCatRotX(d, iC2.y * w);
    n = slCatRotX(n, iC2.y * w);
    d = slCatRotY(d, iC2.x * w);
    n = slCatRotY(n, iC2.x * w);
    p = nk + d;
  } else if (part > 5.5) {
    vec3 d = p - nk;
    d = slCatRotY(slCatRotX(d, iC2.y), iC2.x);
    p = nk + d;
    n = vec3(0.0, 1.0, 0.0);
  } else if (part > 0.5 && part < 1.5) {
    vec3 tr = ${v3(tailRoot(POSES.stand))} * st + ${v3(tailRoot(POSES.sit))} * sit + ${v3(tailRoot(POSES.loaf))} * loaf;
    float a = iC3.z * w + iC2.z * w * w * sin(uCatTime * 2.6 + iC3.y * 20.0 - w * 2.8);
    vec3 d = slCatRotY(p - tr, a);
    n = slCatRotY(n, a);
    p = tr + d;
  }
  // a body that rises and falls a little: breathing, and the walk's bob
  if (part < 0.5 && w < 0.1) p.y += 0.0016 * sin(uCatTime * 2.1 + iC3.y * 9.0) * (st + sit + loaf);
  p.y += 0.004 * iC1.y * abs(sin(iC1.x)) * st;
}
`;

const PAINT_GLSL = /* glsl */ `
varying vec3 vRest;
varying float vCMat;
varying vec4 vCat;
float slCatN(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float slCatV(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(slCatN(i), slCatN(i + vec2(1.0, 0.0)), f.x), mix(slCatN(i + vec2(0.0, 1.0)), slCatN(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 slCatPaint() {
  vec3 r = vRest;
  float m = vCMat;
  if (m > 2.5) return vec3(0.85);
  if (m > 1.5) return vec3(0.42, 0.2, 0.2);
  if (m > 0.5) return vec3(0.62, 0.38, 0.36);
  float coat = vCat.x;
  // 0 brown tabby, 1 ginger tabby, 2 grey tabby, 3 black, 4 tuxedo, 5 tortoiseshell
  vec3 base = coat < 0.5 ? vec3(0.34, 0.25, 0.16) : coat < 1.5 ? vec3(0.66, 0.39, 0.16) : coat < 2.5 ? vec3(0.42, 0.42, 0.42) : coat < 4.5 ? vec3(0.028, 0.026, 0.03) : vec3(0.12, 0.08, 0.06);
  vec3 stripe = coat < 0.5 ? vec3(0.07, 0.05, 0.035) : coat < 1.5 ? vec3(0.38, 0.17, 0.05) : vec3(0.1, 0.1, 0.11);
  vec3 c = base;
  float head = smoothstep(0.17, 0.2, r.z) * smoothstep(0.27, 0.3, r.y);
  float tailK = smoothstep(-0.2, -0.235, r.z);
  if (coat < 2.5) {
    // mackerel stripes down the flank, bands on the legs and rings on the tail, the M on the forehead
    float wob = 0.012 * sin(r.y * 40.0 + vCat.y * 9.0);
    float rib = smoothstep(0.1, 0.55, sin((r.z + wob) * 88.0)) * smoothstep(0.1, 0.18, r.y) * (1.0 - head) * (1.0 - tailK);
    float back = smoothstep(0.24, 0.272, r.y + 0.05 * (1.0 - abs(r.x) * 20.0)) * (1.0 - head);
    float leg = smoothstep(0.2, 0.6, sin(r.y * 110.0)) * smoothstep(0.18, 0.12, r.y) * step(0.02, abs(r.x));
    float tail = smoothstep(0.15, 0.6, sin((r.y + r.z) * 90.0)) * tailK;
    float fore = head * smoothstep(0.34, 0.352, r.y) * smoothstep(0.15, 0.5, sin(r.x * 190.0));
    float cheek = head * smoothstep(0.2, 0.5, sin((r.y - abs(r.x) * 0.8) * 150.0)) * smoothstep(0.016, 0.03, abs(r.x)) * smoothstep(0.33, 0.315, r.y);
    c = mix(c, stripe, max(max(max(rib, back * 0.85), max(leg, tail)), max(fore, cheek * 0.7)));
    // pale under the chin and on the belly
    float belly = smoothstep(0.155, 0.13, r.y) * (1.0 - step(0.02, abs(r.x)) * 0.0) * step(r.z, 0.13) * smoothstep(0.035, 0.02, abs(r.x));
    c = mix(c, base * 1.7 + 0.08, belly);
    c = mix(c, base * 1.6 + 0.1, head * smoothstep(0.3, 0.29, r.y) * smoothstep(0.025, 0.012, abs(r.x)));
  } else if (coat > 3.5 && coat < 4.5) {
    // tuxedo: white bib and socks and a little white on the muzzle
    float w = smoothstep(0.03, 0.02, abs(r.x)) * smoothstep(0.26, 0.24, r.y) * step(0.06, r.z);
    w = max(w, smoothstep(0.075, 0.05, r.y));
    w = max(w, head * smoothstep(0.018, 0.008, abs(r.x)) * smoothstep(0.33, 0.315, r.y));
    w = max(w, smoothstep(0.17, 0.14, r.y) * smoothstep(0.03, 0.018, abs(r.x)));
    c = mix(c, vec3(0.74, 0.72, 0.68), w);
  } else if (coat > 4.5) {
    // tortoiseshell: black, ginger and cream in patches
    float n = slCatV(r.zy * 26.0 + vCat.y * 11.0) + 0.5 * slCatV(vec2(r.x, r.z) * 55.0 + vCat.y * 5.0);
    c = n > 0.95 ? vec3(0.62, 0.38, 0.16) : n > 0.62 ? vec3(0.12, 0.08, 0.06) : n > 0.42 ? vec3(0.03) : vec3(0.72, 0.6, 0.42);
  }
  // fur: fine streaks running along the body
  float fur = slCatV(vec2(r.x * 300.0 + r.y * 90.0, r.z * 120.0)) * 0.6 + slCatV(vec2(r.x * 620.0, r.y * 300.0 + r.z * 240.0)) * 0.4;
  c *= 0.78 + 0.44 * fur;
  // eyes, in the shape of an almond: iris, slit, and a lid that comes down
  if (head > 0.01) {
    vec2 e = vec2(abs(r.x) - 0.0235, r.y - 0.3395);
    float front = step(0.24, r.z);
    float alm = length(e * vec2(1.0, 1.55));
    if (front > 0.5 && alm < 0.0135) {
      vec3 iris = fract(vCat.y * 7.3) < 0.5 ? vec3(0.62, 0.52, 0.1) : fract(vCat.y * 7.3) < 0.8 ? vec3(0.3, 0.5, 0.15) : vec3(0.75, 0.42, 0.06);
      float slit = smoothstep(0.0034, 0.0022, abs(e.x)) ;
      vec3 eye = mix(iris, vec3(0.008), slit);
      eye = mix(eye, c * 0.35, smoothstep(0.0115, 0.0135, alm));
      // the lid: fur from the top as it blinks
      float lid = step(e.y, 0.0135 - 0.027 * vCat.z);
      c = mix(c, eye, lid);
    }
  }
  return c;
}
`;

export interface CatKit {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
}

export function makeCatKit(time: { value: number }): CatKit {
  const geometry = buildAll();
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  material.name = 'smalllife-cat';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCatTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${POSE_GLSL}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 slP = vec3( position );\nslCatPose( slP, objectNormal );\nobjectNormal = normalize( objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = slP;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${PAINT_GLSL}`).replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
  diffuseColor.rgb *= slCatPaint();`,
    );
  };
  material.customProgramCacheKey = () => 'tinyhaven-smalllife-cat-1';
  patchLampMaterial(material);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uCatTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${POSE_GLSL}`).replace('#include <begin_vertex>', 'vec3 slN = vec3( 0.0, 1.0, 0.0 );\nvec3 transformed = vec3( position );\nslCatPose( transformed, slN );');
  };
  depth.customProgramCacheKey = () => 'tinyhaven-smalllife-cat-depth-1';
  return { geometry, material, depth };
}
