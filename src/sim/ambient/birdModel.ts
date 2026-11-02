// Procedural low-poly bird (unit body length, +Z forward, +Y up, wings along ±X) shared by
// every flying/perched bird AND the park butterflies (morphed in the vertex shader).
//
// Per-instance attributes (InstancedMesh):
//   iBody  (vec3)  body colour
//   iWing  (vec3)  wing colour (tips are darkened automatically)
//   iAccent(vec3)  beak colour
//   iAnim  (vec4)  x flap phase (rad), y flap amplitude (rad), z wing fold 0..1, w head pitch (rad, + = down)
//   iShape (vec4)  x wingspan scale, y glide dihedral bias (rad), z gull "M" kink (rad), w kind (0 bird, 1 gull, 2 pigeon, 3 butterfly)

import { shapeOn } from '../../core/sweepshape';
import * as THREE from 'three';

export const PART = { BODY: 0, WING_IN: 1, WING_OUT: 2, HEAD: 3, TAIL: 4, LEG: 5 } as const;
export const MAT = { BODY: 0, BELLY: 1, WING: 2, TIP: 3, BEAK: 4, EYE: 5, LEG: 6 } as const;

interface Builder {
  pos: number[];
  part: number[];
  mat: number[];
}

function tri(b: Builder, a: number[], c: number[], d: number[], part: number, mat: number | number[]): void {
  b.pos.push(...a, ...c, ...d);
  for (let k = 0; k < 3; k++) {
    b.part.push(part);
    b.mat.push(Array.isArray(mat) ? mat[k] : mat);
  }
}

function quad(b: Builder, a: number[], c: number[], d: number[], e: number[], part: number, mat: number | number[]): void {
  const m = Array.isArray(mat) ? mat : [mat, mat, mat, mat];
  tri(b, a, c, d, part, [m[0], m[1], m[2]]);
  tri(b, a, d, e, part, [m[0], m[2], m[3]]);
}

export function buildBirdGeometry(): THREE.BufferGeometry {
  const b: Builder = { pos: [], part: [], mat: [] };
  const SHAPED = shapeOn('shapebirds');
  // ── body: rings along z
  const rings: [number, number, number, number][] = SHAPED
    ? [
        // z, rx, ry, yc
        [-0.31, 0.026, 0.022, 0.006],
        [-0.24, 0.056, 0.05, 0.002],
        [-0.16, 0.08, 0.072, 0.0],
        [-0.05, 0.095, 0.086, 0.002],
        [0.05, 0.1, 0.09, 0.008],
        [0.14, 0.09, 0.082, 0.018],
        [0.22, 0.07, 0.07, 0.03],
        [0.29, 0.048, 0.054, 0.05],
      ]
    : [
        [-0.31, 0.03, 0.025, 0.005],
        [-0.16, 0.08, 0.07, 0.0],
        [0.04, 0.1, 0.088, 0.008],
        [0.2, 0.074, 0.072, 0.028],
        [0.29, 0.046, 0.052, 0.05],
      ];
  const SIDES = SHAPED ? 8 : 6;
  const ringPts = rings.map(([z, rx, ry, yc]) => {
    const pts: number[][] = [];
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2 + Math.PI / SIDES;
      pts.push([Math.cos(a) * rx, yc + Math.sin(a) * ry, z]);
    }
    return pts;
  });
  const bellyOf = (p: number[], yc: number) => (p[1] < yc - 0.01 ? MAT.BELLY : MAT.BODY);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES;
      const a = ringPts[r][k],
        c = ringPts[r + 1][k],
        d = ringPts[r + 1][k2],
        e = ringPts[r][k2];
      const yc = rings[r][3];
      quad(b, a, e, d, c, PART.BODY, [bellyOf(a, yc), bellyOf(e, yc), bellyOf(d, yc), bellyOf(c, yc)]);
    }
  }
  // caps
  const tailTip = [0, 0.008, -0.33];
  for (let k = 0; k < SIDES; k++) tri(b, ringPts[0][(k + 1) % SIDES], ringPts[0][k], tailTip, PART.BODY, MAT.BODY);
  // ── head (part HEAD): small faceted ball + beak + eyes
  const hc = [0, 0.085, 0.36];
  const hr = 0.068;
  const hv = (x: number, y: number, z: number) => [hc[0] + x * hr, hc[1] + y * hr, hc[2] + z * hr];
  const top = hv(0, 1, 0),
    bot = hv(0, -1, 0);
  const eq: number[][] = [];
  const HN = SHAPED ? 8 : 6;
  for (let k = 0; k < HN; k++) {
    const a = (k / HN) * Math.PI * 2;
    eq.push(hv(Math.cos(a), 0.05, Math.sin(a)));
  }
  if (SHAPED) {
    // two more rings, so the crown is a dome and not a pyramid
    const up: number[][] = [],
      dn: number[][] = [];
    for (let k = 0; k < HN; k++) {
      const a = (k / HN) * Math.PI * 2;
      up.push(hv(Math.cos(a) * 0.72, 0.68, Math.sin(a) * 0.72));
      dn.push(hv(Math.cos(a) * 0.72, -0.62, Math.sin(a) * 0.72));
    }
    for (let k = 0; k < HN; k++) {
      const k2 = (k + 1) % HN;
      tri(b, top, up[k2], up[k], PART.HEAD, MAT.BODY);
      quad(b, up[k], up[k2], eq[k2], eq[k], PART.HEAD, MAT.BODY);
      quad(b, eq[k], eq[k2], dn[k2], dn[k], PART.HEAD, MAT.BELLY);
      tri(b, bot, dn[k], dn[k2], PART.HEAD, MAT.BELLY);
    }
  } else
    for (let k = 0; k < HN; k++) {
      const k2 = (k + 1) % HN;
      tri(b, top, eq[k2], eq[k], PART.HEAD, MAT.BODY);
      tri(b, bot, eq[k], eq[k2], PART.HEAD, MAT.BELLY);
    }
  // neck: join the head to the last body ring
  const last = ringPts[rings.length - 1];
  const neckRing = last.map((p) => [p[0] * 0.8, p[1] + 0.02, p[2] + 0.04]);
  for (let k = 0; k < SIDES; k++) {
    const k2 = (k + 1) % SIDES;
    quad(b, last[k], last[k2], neckRing[k2], neckRing[k], PART.HEAD, MAT.BODY);
  }
  // beak
  const bt = [0, hc[1] - 0.012, hc[2] + 0.14];
  const b1 = [0.022, hc[1] + 0.008, hc[2] + 0.05],
    b2 = [-0.022, hc[1] + 0.008, hc[2] + 0.05],
    b3 = [0, hc[1] - 0.025, hc[2] + 0.045];
  tri(b, b1, b2, bt, PART.HEAD, MAT.BEAK);
  tri(b, b2, b3, bt, PART.HEAD, MAT.BEAK);
  tri(b, b3, b1, bt, PART.HEAD, MAT.BEAK);
  // eyes (tiny dark facets on each side)
  for (const s of [1, -1]) {
    const e0 = [s * hr * 0.98, hc[1] + 0.022, hc[2] + 0.025];
    tri(b, e0, [s * hr * 0.9, hc[1] + 0.0, hc[2] + 0.045], [s * hr * 0.9, hc[1] + 0.035, hc[2] + 0.05], PART.HEAD, MAT.EYE);
  }
  // ── tail fan (part TAIL)
  const t0 = [0.035, 0.012, -0.26],
    t1 = [-0.035, 0.012, -0.26],
    t2 = [-0.09, 0.008, -0.52],
    t3 = [0.09, 0.008, -0.52],
    tm = [0, 0.008, -0.49];
  tri(b, t0, t1, tm, PART.TAIL, MAT.WING);
  tri(b, t0, tm, t3, PART.TAIL, [MAT.WING, MAT.WING, MAT.TIP]);
  tri(b, t1, t2, tm, PART.TAIL, [MAT.WING, MAT.TIP, MAT.WING]);
  // ── legs (only shown while perched)
  for (const s of [1, -1]) {
    const x = s * 0.035;
    const top = -0.05,
      bot = -0.17;
    quad(b, [x - 0.012, top, 0.02], [x + 0.012, top, 0.02], [x + 0.008, bot, 0.03], [x - 0.008, bot, 0.03], PART.LEG, MAT.LEG);
    quad(b, [x, top, 0.008], [x, top, 0.032], [x, bot, 0.042], [x, bot, 0.018], PART.LEG, MAT.LEG);
    tri(b, [x, bot, 0.0], [x + 0.025, bot, 0.08], [x - 0.025, bot, 0.08], PART.LEG, MAT.LEG);
  }
  // ── wings (flat panels; DoubleSide material)
  if (SHAPED)
    for (const s of [1, -1]) {
      const y = 0.045;
      const P = (q: number[]) => [s * q[0], y, q[1]];
      // inner wing: bowed leading edge, the secondaries' trailing edge; outer: swept to a point, the primaries fingered
      const LI = [[0.05, 0.11], [0.2, 0.13], [0.34, 0.118], [0.44, 0.095]],
        TI = [[0.05, -0.13], [0.2, -0.175], [0.34, -0.17], [0.44, -0.155]],
        LO = [[0.44, 0.095], [0.58, 0.07], [0.72, 0.035], [0.86, -0.02], [0.98, -0.09]],
        TO = [[0.44, -0.155], [0.56, -0.165], [0.68, -0.15], [0.8, -0.125], [0.98, -0.09]];
      for (let i = 0; i < 3; i++) quad(b, P(LI[i]), P(LI[i + 1]), P(TI[i + 1]), P(TI[i]), PART.WING_IN, MAT.WING);
      for (let i = 0; i < 4; i++) {
        const m0 = i < 2 ? MAT.WING : MAT.TIP,
          m1 = i < 1 ? MAT.WING : MAT.TIP;
        quad(b, P(LO[i]), P(LO[i + 1]), P(TO[i + 1]), P(TO[i]), PART.WING_OUT, [m0, m1, m1, m0]);
      }
      // the scallops of the flight feathers
      for (let i = 0; i < 3; i++) {
        const a = TI[i],
          c = TI[i + 1];
        tri(b, P(a), P(c), P([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 0.018]), PART.WING_IN, MAT.WING);
      }
      for (let i = 0; i < 3; i++) {
        const a = TO[i],
          c = TO[i + 1];
        tri(b, P(a), P(c), P([(a[0] * 0.3 + c[0] * 0.7), (a[1] * 0.3 + c[1] * 0.7) - 0.03]), PART.WING_OUT, i < 1 ? MAT.WING : MAT.TIP);
      }
    }
  else for (const s of [1, -1]) {
    const y = 0.045;
    const rootL = [s * 0.05, y, 0.11],
      rootT = [s * 0.05, y, -0.13];
    const elbL = [s * 0.44, y, 0.085],
      elbT = [s * 0.44, y, -0.15];
    const midT = [s * 0.72, y, -0.15];
    const tip = [s * 0.98, y, -0.085];
    const tipL = [s * 0.74, y, 0.04];
    quad(b, rootL, elbL, elbT, rootT, PART.WING_IN, MAT.WING);
    tri(b, elbL, tipL, midT, PART.WING_OUT, [MAT.WING, MAT.WING, MAT.TIP]);
    tri(b, elbL, midT, elbT, PART.WING_OUT, [MAT.WING, MAT.TIP, MAT.WING]);
    tri(b, tipL, tip, midT, PART.WING_OUT, MAT.TIP);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(b.part, 1));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(b.mat, 1));
  g.computeVertexNormals();
  if (SHAPED) {
    // soft body and head: one normal per position, so no facets (the beak, eyes, wings and legs stay as they are)
    const nor = g.getAttribute('normal') as THREE.BufferAttribute,
      sum = new Map<string, number[]>(),
      key = (i: number) => `${b.part[i]}:${b.pos[i * 3].toFixed(4)},${b.pos[i * 3 + 1].toFixed(4)},${b.pos[i * 3 + 2].toFixed(4)}`,
      soft = (i: number) => (b.part[i] === PART.BODY || b.part[i] === PART.HEAD) && b.mat[i] <= MAT.BELLY;
    for (let i = 0; i < nor.count; i++) {
      if (!soft(i)) continue;
      const k = key(i),
        v = sum.get(k) ?? [0, 0, 0];
      v[0] += nor.getX(i);
      v[1] += nor.getY(i);
      v[2] += nor.getZ(i);
      sum.set(k, v);
    }
    for (let i = 0; i < nor.count; i++) {
      if (!soft(i)) continue;
      const v = sum.get(key(i))!,
        l = Math.hypot(v[0], v[1], v[2]) || 1;
      nor.setXYZ(i, v[0] / l, v[1] / l, v[2] / l);
    }
  }
  g.computeBoundingSphere();
  return g;
}

// the elbow turns about the wing's own plane; about y = 0 it opened a gap the sky showed through
const ELBOW = shapeOn('shapebirds') ? 0.045 : 0.0;
const POSE_GLSL = /* glsl */ `
attribute float aPart;
attribute float aMat;
attribute vec3 iBody;
attribute vec3 iWing;
attribute vec3 iAccent;
attribute vec4 iAnim;
attribute vec4 iShape;
vec2 bRot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
void birdPose(inout vec3 p, inout vec3 n) {
  float kind = iShape.w;
  bool fly = kind > 2.5; // butterfly
  if (aPart > 0.5 && aPart < 2.5) {
    float side = p.x >= 0.0 ? 1.0 : -1.0;
    float ax = abs(p.x);
    if (fly) {
      // broad rounded butterfly wings
      p.z = p.z * 3.2 + 0.07 - ax * 0.12;
      ax *= 0.62;
    }
    ax *= iShape.x;
    // fold the wing back along the flank
    float fold = iAnim.z;
    vec3 open = vec3(ax, p.y, p.z);
    vec3 folded = vec3(0.055 + ax * 0.06, p.y - 0.012 + ax * 0.02, 0.06 - ax * 0.42 + p.z * 0.25);
    float flap = iAnim.y * sin(iAnim.x) + iShape.y;
    float elbowX = 0.44 * iShape.x * (fly ? 0.62 : 1.0);
    vec3 q = open;
    vec3 nq = vec3(0.0, 1.0, 0.0);
    if (aPart > 1.5) {
      // outer panel: extra whip + gull kink at the elbow
      float a2 = iAnim.y * 0.55 * sin(iAnim.x - 0.7) + iShape.z;
      vec2 r = bRot(vec2(q.x - elbowX, q.y - ${ELBOW.toFixed(3)}), a2);
      q.xy = vec2(elbowX, ${ELBOW.toFixed(3)}) + r;
      nq.xy = bRot(nq.xy, a2);
    }
    vec2 rr = bRot(vec2(q.x - 0.05, q.y - 0.045), flap);
    q.xy = vec2(0.05, 0.045) + rr;
    nq.xy = bRot(nq.xy, flap);
    p = mix(q, folded, fold);
    n = normalize(mix(nq, vec3(0.9, 0.35, 0.0), fold));
    p.x *= side;
    n.x *= side;
  } else if (aPart > 2.5 && aPart < 3.5) {
    // perched birds hold the head up; pigeons have a bigger round head
    float up = iAnim.z * (kind > 1.5 ? 0.06 : 0.035);
    if (kind > 1.5 && kind < 2.5) { p = vec3(0.0, 0.085, 0.36) + (p - vec3(0.0, 0.085, 0.36)) * 1.25; p.z -= 0.02; }
    p.y += up * smoothstep(0.26, 0.34, p.z);
    // head pitch (peck) about the neck joint
    vec3 pivot = vec3(0.0, 0.05, 0.28);
    vec3 d = p - pivot;
    float a = iAnim.w;
    d.yz = vec2(d.y * cos(a) - d.z * sin(a), d.y * sin(a) + d.z * cos(a));
    n.yz = vec2(n.y * cos(a) - n.z * sin(a), n.y * sin(a) + n.z * cos(a));
    p = pivot + d;
    if (fly) p = vec3(p.x * 0.4, p.y * 0.5, 0.28 + (p.z - 0.28) * 0.3);
  } else if (aPart > 4.5) {
    // legs: tucked away in flight
    if (fly || iAnim.z < 0.5) p *= 0.0;
  } else if (aPart > 3.5) {
    if (fly) p *= 0.0;
    else p.y += (p.z + 0.26) * -0.25 * iAnim.z; // tail tips down a little when perched
  }
  if (fly && aPart < 0.5) { p.xy *= 0.38; p.z *= 0.8; }
  // pigeons: plump body
  if (kind > 1.5 && kind < 2.5 && aPart < 0.5) p.xy *= vec2(1.35, 1.3);
}
vec3 birdColor() {
  vec3 body = iBody;
  if (aMat < 0.5) return body;
  if (aMat < 1.5) return min(body * 1.18 + 0.05, vec3(1.0));
  if (aMat < 2.5) return iWing;
  if (aMat < 3.5) return iShape.w > 2.5 ? iWing * 0.32 : mix(iWing, vec3(0.04), 0.82);
  if (aMat < 4.5) return iAccent;
  if (aMat < 5.5) return vec3(0.03);
  return iShape.w > 1.5 ? vec3(0.78, 0.42, 0.42) : iShape.w > 0.5 ? vec3(0.85, 0.6, 0.3) : vec3(0.25, 0.2, 0.18);
}
`;

/** Lambert material with the pose/colour shader (DoubleSide for the flat wings). */
export function makeBirdMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBirdCol;\n${POSE_GLSL}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 birdP = vec3( position );\nbirdPose( birdP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = birdP;\nvBirdCol = birdColor();');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBirdCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vBirdCol;');
  };
  m.customProgramCacheKey = () => 'tinyhaven-ambient-bird-3' + ELBOW;
  return m;
}
