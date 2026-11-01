// The birds of the pavement, seen from a metre: a smooth body in one piece with the neck, a head that pecks, turns and
// thrusts as it walks, wings folded along the flank that open in flight, a tail that flicks and fans, legs that step or
// hop together. One geometry (about 260 triangles, feet at the origin, +Z forward, the size of a pigeon) for all four
// kinds, posed in the vertex shader and painted by kind in the fragment shader.

import * as THREE from 'three';
import { patchLampMaterial } from '../../world/lamps/integrate';

export const KIND = { SPARROW: 0, PIGEON: 1, GULL: 2, BLACKBIRD: 3 } as const;
const PART = { BODY: 0, WING: 2, TAIL: 3, LEG_L: 4, LEG_R: 5 } as const;
const MAT = { BODY: 0, BEAK: 1, WING: 2, TAIL: 3, LEG: 4 } as const;

class Build {
  pos: number[] = [];
  part: number[] = [];
  mat: number[] = [];
  w: number[] = [];
  fold: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number, part: number, mat: number, w = 0, fx = x, fy = y, fz = z): number {
    this.pos.push(x, y, z);
    this.part.push(part);
    this.mat.push(mat);
    this.w.push(w);
    this.fold.push(fx, fy, fz);
    return this.pos.length / 3 - 1;
  }
  /** a tube of rings [z, y, rx, ry, weight], perpendicular to its own axis, smooth; a cone at each end */
  loft(rings: number[][], sides: number, part: number, mat: number, x0 = 0, capA = true, capB = true): void {
    const ids: number[][] = [];
    rings.forEach((r, i) => {
      const nb = rings[Math.min(rings.length - 1, i + 1)],
        pb = rings[Math.max(0, i - 1)];
      const az = nb[0] - pb[0],
        ay = nb[1] - pb[1];
      const al = Math.hypot(az, ay) || 1;
      // the ring's "up" lies in the YZ plane, perpendicular to the axis
      const uy = az / al,
        uz = -ay / al;
      const row: number[] = [];
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2;
        const cx = Math.cos(t) * r[2],
          sy = Math.sin(t) * r[3];
        row.push(this.v(x0 + cx, r[1] + uy * sy, r[0] + uz * sy, part, mat, r[4]));
      }
      ids.push(row);
    });
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        this.idx.push(ids[i][k], ids[i + 1][k1], ids[i][k1], ids[i][k], ids[i + 1][k], ids[i + 1][k1]);
      }
    }
    const cap = (ri: number, from: number, flip: boolean) => {
      const r = rings[ri],
        o = rings[from];
      const apex = this.v(x0, r[1] + (r[1] - o[1]) * 0.3, r[0] + (r[0] - o[0]) * 0.3, part, mat, r[4]);
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        if (flip) this.idx.push(ids[ri][k], ids[ri][k1], apex);
        else this.idx.push(ids[ri][k1], ids[ri][k], apex);
      }
    };
    if (capA) cap(0, 1, true);
    if (capB) cap(rings.length - 1, rings.length - 2, false);
  }
}

/** centre of the head and the pivot of the neck (rest frame), shared by geometry and shader */
const HC = [0, 0.168, 0.118];
const PV = [0, 0.122, 0.07];
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function buildGeometry(): THREE.BufferGeometry {
  const b = new Build();
  // body, neck and head in one skin: [z, y, rx, ry, head weight]
  b.loft(
    [
      [-0.115, 0.088, 0.016, 0.012, 0],
      [-0.075, 0.088, 0.04, 0.036, 0],
      [-0.025, 0.087, 0.057, 0.054, 0],
      [0.022, 0.09, 0.06, 0.06, 0],
      [0.056, 0.102, 0.051, 0.054, 0.06],
      [0.079, 0.122, 0.036, 0.04, 0.3],
      [0.094, 0.143, 0.025, 0.027, 0.7],
      [0.104, 0.159, 0.021, 0.022, 1],
      [0.118, 0.17, 0.0215, 0.0215, 1],
      [0.131, 0.172, 0.0175, 0.0175, 1],
      [0.14, 0.17, 0.01, 0.0105, 1],
    ],
    12,
    PART.BODY,
    MAT.BODY,
  );
  // beak
  b.loft(
    [
      [0.138, 0.169, 0.0085, 0.0085, 1],
      [0.15, 0.166, 0.005, 0.0055, 1],
      [0.161, 0.163, 0.0018, 0.002, 1],
    ],
    6,
    PART.BODY,
    MAT.BEAK,
    0,
    false,
    true,
  );
  // wings: open along X at span u, chord along Z; folded (aFold) lying on the flank, the tip crossing over the tail root
  const flank = (z: number): [number, number, number] => {
    // the body's half width and height and its middle at this z (the rings above, straight between them)
    const R = [
      [-0.2, 0.012, 0.01, 0.09],
      [-0.115, 0.018, 0.014, 0.088],
      [-0.075, 0.04, 0.036, 0.088],
      [-0.025, 0.057, 0.054, 0.087],
      [0.022, 0.06, 0.06, 0.09],
      [0.056, 0.051, 0.054, 0.102],
      [0.09, 0.04, 0.044, 0.116],
    ];
    for (let i = 0; i < R.length - 1; i++) {
      if (z <= R[i + 1][0]) {
        const t = clamp01((z - R[i][0]) / (R[i + 1][0] - R[i][0]));
        return [R[i][1] + (R[i + 1][1] - R[i][1]) * t, R[i][2] + (R[i + 1][2] - R[i][2]) * t, R[i][3] + (R[i + 1][3] - R[i][3]) * t];
      }
    }
    return [R[6][1], R[6][2], R[6][3]];
  };
  for (const s of [1, -1]) {
    const ids: number[][] = [];
    const U = [0, 0.18, 0.38, 0.58, 0.8, 1];
    const V = [0, 0.33, 0.66, 1];
    for (const u of U) {
      const row: number[] = [];
      const lead = 0.052 - 0.03 * u * u,
        chord = 0.105 - 0.05 * u * u;
      for (const v of V) {
        const x = s * (0.045 + 0.29 * u),
          y = 0.122,
          z = lead - chord * v;
        // along the flank from the shoulder to past the tail root; from high on the back down the side, narrowing to the tip
        const fz = 0.056 - 0.215 * u - 0.03 * v * (1 - 0.6 * u);
        const [rx, ry, yc] = flank(fz);
        const narrow = 1 - 0.62 * u * u;
        const th = (1.15 - 1.45 * v * narrow) * (1 - 0.12 * u);
        const lift = 1.06 + 0.1 * u * (1 - v);
        const fx = s * (rx * Math.cos(th) * lift + 0.0035 + 0.006 * u);
        const fy = yc + ry * Math.sin(th) * lift + 0.006 - 0.012 * u * u;
        row.push(b.v(x, y, z, PART.WING, MAT.WING, 0, fx, fy, fz));
      }
      ids.push(row);
    }
    for (let i = 0; i < ids.length - 1; i++) {
      for (let j = 0; j < V.length - 1; j++) {
        const q = [ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]];
        if (s > 0) b.idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
        else b.idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      }
    }
  }
  // tail: a closed fan of feathers, slightly domed
  {
    const a = b.v(0, 0.092, -0.085, PART.TAIL, MAT.TAIL);
    const pts = [
      [-0.03, 0.082, -0.1],
      [-0.034, 0.08, -0.205],
      [-0.012, 0.086, -0.215],
      [0.012, 0.086, -0.215],
      [0.034, 0.08, -0.205],
      [0.03, 0.082, -0.1],
    ].map((p) => b.v(p[0], p[1], p[2], PART.TAIL, MAT.TAIL));
    for (let k = 0; k < pts.length - 1; k++) b.idx.push(a, pts[k], pts[k + 1]);
    const u = b.v(0, 0.07, -0.1, PART.TAIL, MAT.TAIL);
    for (let k = 0; k < pts.length - 1; k++) b.idx.push(u, pts[k + 1], pts[k]);
  }
  // legs: thigh in the feathers, a thin shank, three toes forward and one back; feet on the ground (y = 0)
  for (const [s, part] of [
    [1, PART.LEG_L],
    [-1, PART.LEG_R],
  ] as const) {
    const lx = s * 0.022;
    b.loft(
      [
        [0.012, 0.062, 0.006, 0.006, 0],
        [0.014, 0.034, 0.0033, 0.0033, 0],
        [0.018, 0.009, 0.0035, 0.0035, 0],
      ],
      4,
      part,
      MAT.LEG,
      lx,
      false,
      false,
    );
    for (const [dx, dz] of [
      [0.012, 0.036],
      [0, 0.043],
      [-0.012, 0.036],
      [0, -0.024],
    ]) {
      const t0 = b.v(lx + 0.003, 0.008, 0.018, part, MAT.LEG),
        t1 = b.v(lx - 0.003, 0.008, 0.018, part, MAT.LEG),
        t2 = b.v(lx + dx, 0.001, 0.018 + dz, part, MAT.LEG),
        t3 = b.v(lx, 0.012, 0.018, part, MAT.LEG);
      b.idx.push(t0, t3, t2, t3, t1, t2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(b.part, 1));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(b.mat, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(b.w, 1));
  g.setAttribute('aFold', new THREE.Float32BufferAttribute(b.fold, 3));
  g.setIndex(b.idx);
  // the folded wing's own normals: from the same triangles in their folded places
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(b.fold, 3));
  fg.setIndex(b.idx);
  fg.computeVertexNormals();
  g.setAttribute('aFoldN', fg.getAttribute('normal'));
  g.computeVertexNormals();
  return g;
}

const f = (x: number) => x.toFixed(4);
const POSE_GLSL = /* glsl */ `
attribute float aPart;
attribute float aMat;
attribute float aW;
attribute vec3 aFold;
attribute vec3 aFoldN;
attribute vec4 iP1; // flap phase, flap amplitude, wings open, puffed up
attribute vec4 iP2; // head pitch (+ down), head yaw (+ left), head thrust (m), tail pitch (+ up)
attribute vec4 iP3; // leg phase, leg amplitude (< 0: both together), legs tucked, kind
attribute vec4 iTone; // this bird's tones and hash
varying vec3 vRest;
varying float vBMat;
varying float vBKind;
varying vec4 vTone;
void slBirdPose(inout vec3 p, inout vec3 n) {
  float kind = iP3.w;
  vRest = p;
  vBMat = aMat;
  vBKind = kind;
  vTone = iTone;
  if (aPart < 0.5) {
    // the head's weight runs down the neck: no seam, whatever the head does
    if (aW > 0.001) {
      float hk = kind < 0.5 ? 1.38 : kind < 1.5 ? 1.0 : kind < 2.5 ? 1.02 : 1.14;
      vec3 hc = vec3(${f(HC[0])}, ${f(HC[1])}, ${f(HC[2])});
      float big = smoothstep(0.65, 1.0, aW);
      p = mix(p, hc + (p - hc) * hk, big);
      vec3 pv = vec3(${f(PV[0])}, ${f(PV[1])}, ${f(PV[2])});
      vec3 d = p - pv;
      float a = iP2.x * aW, c = cos(a), s = sin(a);
      d.yz = vec2(c * d.y - s * d.z, s * d.y + c * d.z);
      n.yz = vec2(c * n.y - s * n.z, s * n.y + c * n.z);
      a = iP2.y * aW; c = cos(a); s = sin(a);
      d.xz = vec2(c * d.x + s * d.z, -s * d.x + c * d.z);
      n.xz = vec2(c * n.x + s * n.z, -s * n.x + c * n.z);
      p = pv + d;
      p.z += iP2.z * aW;
    }
    float puff = 1.0 + iP1.w * 0.28 * (1.0 - aW);
    p.xy = vec2(p.x * puff, 0.09 + (p.y - 0.09) * puff);
    // sparrows are round, gulls long
    if (kind < 0.5) p.xy = vec2(p.x * 1.12, 0.09 + (p.y - 0.09) * 1.08);
    else if (kind > 1.5 && kind < 2.5) p.xy = vec2(p.x * 0.94, p.y);
  } else if (aPart < 2.5) {
    float side = position.x >= 0.0 ? 1.0 : -1.0;
    float span = kind > 1.5 && kind < 2.5 ? 1.5 : kind < 0.5 ? 0.92 : 1.0;
    float ax = (abs(p.x) - 0.045) * span;
    float u = ax / 0.29;
    vec2 q = vec2(ax, p.y - 0.122);
    float a1 = iP1.y * sin(iP1.x) + 0.08;
    float a2 = iP1.y * 0.7 * sin(iP1.x - 0.75) * u;
    float a = a1 + a2;
    float c = cos(a), s = sin(a);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    // on the upstroke the hand folds in a little
    float inb = 1.0 - 0.25 * u * max(0.0, cos(iP1.x)) * step(0.01, iP1.y);
    vec3 op = vec3(side * (0.045 + q.x * inb), 0.122 + q.y, p.z);
    float up = n.y >= 0.0 ? 1.0 : -1.0;
    vec3 no = up * vec3(side * -s, c, 0.0);
    p = mix(aFold, op, iP1.z);
    n = normalize(mix(aFoldN, no, iP1.z));
  } else if (aPart < 3.5) {
    vec3 pv = vec3(0.0, 0.09, -0.085);
    vec3 d = p - pv;
    d.x *= 1.0 + 1.5 * iP1.z;
    if (kind < 0.5) d.z *= 0.92;
    else if (kind > 1.5 && kind < 2.5) d.z *= 0.72;
    else if (kind > 2.5) d.z *= 1.25;
    float a = iP2.w, c = cos(a), s = sin(a);
    d.yz = vec2(c * d.y + s * d.z, -s * d.y + c * d.z);
    n.yz = vec2(c * n.y + s * n.z, -s * n.y + c * n.z);
    p = pv + d;
  } else {
    float k = 1.0 - clamp(p.y / 0.062, 0.0, 1.0);
    float both = iP3.y < 0.0 ? 1.0 : 0.0;
    float ph = iP3.x + (aPart > 4.5 && both < 0.5 ? 3.14159 : 0.0);
    float amp = abs(iP3.y);
    p.z += 0.036 * amp * sin(ph) * k;
    p.y += 0.026 * amp * max(0.0, cos(ph)) * k;
    // tucked up into the belly in flight, trailing a little
    float t = iP3.z;
    p.y = mix(p.y, 0.05 + p.y * 0.25, t);
    p.z = mix(p.z, p.z * 0.4 - 0.06, t);
  }
}
`;

const PAINT_GLSL = /* glsl */ `
varying vec3 vRest;
varying float vBMat;
varying float vBKind;
varying vec4 vTone;
float slStreak(float x, float w) { return smoothstep(0.5 - w, 0.5 + w, 0.5 + 0.5 * sin(x)); }
vec3 slBirdPaint(vec3 N, vec3 V) {
  vec3 r = vRest;
  float kind = vBKind;
  float m = vBMat;
  float head = smoothstep(0.075, 0.105, r.z) * smoothstep(0.11, 0.135, r.y);
  float neck = smoothstep(0.055, 0.09, r.z) * smoothstep(0.1, 0.13, r.y);
  float belly = smoothstep(0.075, 0.05, r.y + 0.14 * max(0.0, r.z - 0.03));
  // feathers on the body: small overlapping rows, only a breath of them
  float scale = 0.5 + 0.5 * sin(r.z * 470.0 + 2.2 * sin(r.x * 300.0)) * sin(r.x * 390.0 + r.y * 360.0);
  vec3 c;
  if (m > 3.5) {
    c = kind < 0.5 ? vec3(0.28, 0.2, 0.16) : kind < 2.5 ? vec3(0.62, 0.22, 0.2) : vec3(0.12, 0.1, 0.09);
  } else if (m > 0.5 && m < 1.5) {
    float t = smoothstep(0.138, 0.158, r.z);
    if (kind < 0.5) c = mix(vec3(0.1, 0.09, 0.08), vec3(0.03), vTone.z);
    else if (kind < 1.5) c = mix(vec3(0.72, 0.7, 0.66), vec3(0.06), smoothstep(0.137, 0.146, r.z)) ;
    else if (kind < 2.5) c = mix(vec3(0.9, 0.72, 0.16), vec3(0.8, 0.14, 0.08), smoothstep(0.003, 0.0, abs(t - 0.75) - 0.09));
    else c = vec3(0.88, 0.55, 0.12) * (vTone.z > 0.4 ? 1.0 : 0.45);
  } else if (kind < 0.5) {
    // house sparrow: brown back with dark streaks, grey crown, chestnut nape, pale cheek and belly, a black bib on the cock
    vec3 back = mix(vec3(0.3, 0.19, 0.1), vec3(0.42, 0.29, 0.16), vTone.x);
    vec3 pale = vec3(0.58, 0.54, 0.47);
    if (m > 1.5 && m < 2.5) {
      // chestnut coverts, dark centres to the long feathers, one thin pale bar
      float u = (abs(r.x) - 0.045) / 0.29;
      c = mix(vec3(0.33, 0.21, 0.11), vec3(0.2, 0.135, 0.085), 0.5 + 0.5 * sin(r.z * 260.0));
      c = mix(c, vec3(0.13, 0.095, 0.07), smoothstep(0.55, 0.8, u));
      c = mix(c, vec3(0.62, 0.58, 0.5), smoothstep(0.03, 0.012, abs(u - 0.32 + 0.3 * (r.z - 0.02))) * 0.8);
    } else if (m > 2.5) {
      c = vec3(0.16, 0.11, 0.08);
    } else {
      c = mix(back * (0.88 + 0.2 * slStreak(r.x * 240.0 + 3.0 * sin(r.z * 90.0), 0.45)), pale, belly);
      c = mix(c, vTone.z > 0.45 ? vec3(0.34, 0.33, 0.32) : mix(back, pale, 0.3), head * smoothstep(0.17, 0.182, r.y));
      c = mix(c, vTone.z > 0.45 ? vec3(0.34, 0.17, 0.09) : c, head * smoothstep(0.16, 0.172, r.y) * smoothstep(0.122, 0.108, r.z) * (1.0 - smoothstep(0.176, 0.186, r.y)));
      c = mix(c, pale * 1.1, head * smoothstep(0.172, 0.158, r.y));
      float bib = smoothstep(0.03, 0.012, length(vec2((r.z - 0.11) * 0.75, r.y - 0.135 + 0.2 * abs(r.x)))) * step(0.45, vTone.z);
      c = mix(c, vec3(0.03), bib);
    }
  } else if (kind < 1.5) {
    // feral pigeon: blue-grey with paler wings and two dark bars, a slate head, a neck that shines green and purple
    float t = vTone.x;
    vec3 base = t < 0.62 ? vec3(0.33, 0.36, 0.42) : t < 0.8 ? vec3(0.42, 0.4, 0.4) : t < 0.92 ? vec3(0.27, 0.27, 0.3) : vec3(0.72, 0.7, 0.68);
    vec3 wing = t < 0.62 ? vec3(0.5, 0.52, 0.57) : t < 0.8 ? vec3(0.55, 0.47, 0.42) : t < 0.92 ? vec3(0.3, 0.3, 0.33) : vec3(0.78, 0.76, 0.74);
    if (m > 2.5) {
      c = mix(base, vec3(0.05), smoothstep(-0.17, -0.19, r.z));
    } else if (m > 1.5) {
      float u = (abs(r.x) - 0.045) / 0.29;
      c = wing;
      // two dark bars across the inner wing, rows of coverts, long primaries going dark to the tip
      float w = u + 0.45 * (0.05 - r.z);
      float bars = max(smoothstep(0.024, 0.012, abs(w - 0.47)), smoothstep(0.024, 0.012, abs(w - 0.63)));
      c *= 0.94 + 0.06 * smoothstep(-0.4, 0.6, sin(u * 62.0 + r.z * 30.0));
      c *= 0.975 + 0.025 * sin(r.z * 320.0);
      c = mix(c, vec3(0.055, 0.055, 0.065), bars);
      c = mix(c, vec3(0.13, 0.13, 0.15), smoothstep(0.72, 0.92, u));
    } else {
      c = mix(base, vec3(0.2, 0.22, 0.27), neck);
      float cosv = clamp(dot(N, V), 0.0, 1.0);
      vec3 sheen = mix(vec3(0.2, 0.52, 0.34), vec3(0.45, 0.2, 0.52), 0.5 + 0.5 * sin(cosv * 7.0 + r.y * 70.0));
      c += sheen * neck * (1.0 - head * 0.8) * 0.5;
      // the white cere and an orange eye are painted below; patches on the odd pale bird
      if (vTone.y > 0.8) c = mix(c, vec3(0.8), smoothstep(0.3, 0.7, sin(r.z * 50.0 + vTone.w * 20.0) * sin(r.x * 60.0)));
    }
  } else if (kind < 2.5) {
    // gull: white, grey mantle, black tips with a white spot
    if (m > 2.5) c = vec3(0.88);
    else if (m > 1.5) {
      float x = abs(r.x);
      c = mix(vec3(0.55, 0.57, 0.6), vec3(0.04), smoothstep(0.24, 0.27, x));
      c = mix(c, vec3(0.85), smoothstep(0.012, 0.006, length(vec2(x - 0.31, r.z + 0.02))));
    } else c = vec3(0.86, 0.87, 0.86);
  } else {
    // blackbird: coal cock, dark brown hen
    c = vTone.z > 0.4 ? vec3(0.03, 0.03, 0.035) : mix(vec3(0.16, 0.11, 0.07), vec3(0.22, 0.16, 0.11), belly);
  }
  c *= 0.93 + 0.14 * scale * step(m, 0.5);
  c *= 0.92 + 0.16 * vTone.y;
  // the eye
  if (m < 0.5) {
    float ex = abs(r.x);
    float d = length(vec2(r.z - 0.1235, r.y - 0.1755));
    if (ex > 0.008) {
      vec3 ring = kind < 0.5 ? vec3(0.04) : kind < 1.5 ? vec3(0.8, 0.42, 0.1) : kind < 2.5 ? vec3(0.8, 0.75, 0.45) : vec3(0.75, 0.5, 0.1) * step(0.4, vTone.z) + vec3(0.03);
      c = mix(c, ring, smoothstep(0.0072, 0.0058, d));
      c = mix(c, vec3(0.012), smoothstep(0.0048, 0.0036, d));
    }
  }
  return c;
}
`;

export interface BirdKit {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
}

export function makeBirdKit(): BirdKit {
  const geometry = buildGeometry();
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  material.name = 'smalllife-bird';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${POSE_GLSL}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 slP = vec3( position );\nslBirdPose( slP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = slP;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${PAINT_GLSL}`).replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
  diffuseColor.rgb *= slBirdPaint( normal, normalize( vViewPosition ) );`,
    );
  };
  material.customProgramCacheKey = () => 'tinyhaven-smalllife-bird-1';
  patchLampMaterial(material);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${POSE_GLSL}`).replace('#include <begin_vertex>', 'vec3 slN = vec3( 0.0, 1.0, 0.0 );\nvec3 transformed = vec3( position );\nslBirdPose( transformed, slN );');
  };
  depth.customProgramCacheKey = () => 'tinyhaven-smalllife-bird-depth-1';
  return { geometry, material, depth };
}
