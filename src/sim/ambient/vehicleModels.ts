// Procedural models for the sky vehicles + the fireworks barge, merged into ONE geometry.
// Every vertex carries `aModel` (0 balloon, 1 plane, 2 blimp, 3 barge); an InstancedMesh draws
// one instance per vehicle and the vertex shader collapses the vertices of the other models,
// so all of them cost a single draw call (+1 in the shadow pass).
// `aGlow` marks emissive regions: 1 balloon envelope (lit by the burner), 2 lit windows,
// 3 blimp envelope (internally lit sign at night).

import * as THREE from 'three';

export const MODEL = { BALLOON: 0, PLANE: 1, BLIMP: 2, BARGE: 3 } as const;

class VB {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  model: number[] = [];
  glow: number[] = [];
  m = 0;
  g = 0;
  c = new THREE.Color();
  private push(p: THREE.Vector3, n: THREE.Vector3, u = 0.002, v = 0.002, c: THREE.Color = this.c) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    this.model.push(this.m);
    this.glow.push(this.g);
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    this.push(a, n);
    this.push(b, n);
    this.push(c, n);
  }
  triN(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3, uva?: number[], uvb?: number[], uvc?: number[], ca?: THREE.Color, cb?: THREE.Color, cc?: THREE.Color) {
    this.push(a, na, uva?.[0], uva?.[1], ca);
    this.push(b, nb, uvb?.[0], uvb?.[1], cb);
    this.push(c, nc, uvc?.[0], uvc?.[1], cc);
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  /** axis-aligned box (centre, size) optionally transformed by m */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, m?: THREE.Matrix4) {
    const x0 = cx - sx / 2,
      x1 = cx + sx / 2,
      y0 = cy - sy / 2,
      y1 = cy + sy / 2,
      z0 = cz - sz / 2,
      z1 = cz + sz / 2;
    const v = (x: number, y: number, z: number) => {
      const p = new THREE.Vector3(x, y, z);
      return m ? p.applyMatrix4(m) : p;
    };
    const P = [v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)];
    const f = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ];
    for (const q of f) this.quad(P[q[0]], P[q[1]], P[q[2]], P[q[3]]);
  }
  /** thin beam between two points */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    this.box(0, 0, 0, w, len, w, m);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aModel', new THREE.Float32BufferAttribute(this.model, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ─────────────────────────────────────────────────────────────── balloon ──
function balloon(b: VB): void {
  b.m = MODEL.BALLOON;
  // envelope profile (radius, height) from the mouth (y = 0) to the crown
  const prof: [number, number][] = [
    [1.45, 0],
    [2.2, 1.4],
    [3.5, 3.3],
    [5.3, 5.7],
    [6.9, 8.4],
    [7.7, 11.0],
    [7.6, 13.4],
    [6.7, 15.6],
    [5.0, 17.3],
    [2.8, 18.4],
    [0.0, 18.8],
  ];
  const GORES = 16,
    SUB = 2,
    N = GORES * SUB;
  const gore = ['#e63946', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#2f7fc1', '#6a4c93', '#ef6f8e'];
  const crown = new THREE.Color('#f6efe0');
  const ring = (j: number, i: number) => {
    const [r, y] = prof[j];
    const a = (i / N) * Math.PI * 2;
    // slight scalloping between load tapes
    const sc = 1 - 0.035 * Math.pow(Math.abs(Math.sin((a * GORES) / 2)), 0.5) * (r > 2 ? 1 : 0);
    return V(Math.cos(a) * r * sc, y, Math.sin(a) * r * sc);
  };
  const normalAt = (j: number, i: number) => {
    const j0 = Math.max(0, j - 1),
      j1 = Math.min(prof.length - 1, j + 1);
    const dr = prof[j1][0] - prof[j0][0],
      dy = prof[j1][1] - prof[j0][1];
    const a = (i / N) * Math.PI * 2;
    const nr = dy,
      ny = -dr;
    const l = Math.hypot(nr, ny) || 1;
    return V((Math.cos(a) * nr) / l, ny / l, (Math.sin(a) * nr) / l);
  };
  b.g = 1;
  for (let j = 0; j < prof.length - 1; j++) {
    for (let i = 0; i < N; i++) {
      const gi = Math.floor(i / SUB) % gore.length;
      const c = new THREE.Color(gore[gi]);
      if (j >= 9) c.copy(crown);
      else if (j <= 1) c.multiplyScalar(0.82);
      b.c.copy(c);
      const a = ring(j, i),
        bb = ring(j, i + 1),
        cc = ring(j + 1, i + 1),
        d = ring(j + 1, i);
      const na = normalAt(j, i),
        nb = normalAt(j, i + 1),
        nc = normalAt(j + 1, i + 1),
        nd = normalAt(j + 1, i);
      b.triN(a, cc, bb, na, nc, nb);
      b.triN(a, d, cc, na, nd, nc);
    }
  }
  b.g = 0.6;
  // skirt / scoop
  b.c.set('#3b3632');
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2,
      a1 = ((i + 1) / 16) * Math.PI * 2;
    const p = (a: number, r: number, y: number) => V(Math.cos(a) * r, y, Math.sin(a) * r);
    b.quad(p(a0, 1.45, 0.05), p(a1, 1.45, 0.05), p(a1, 1.3, -0.9), p(a0, 1.3, -0.9));
    b.quad(p(a0, 1.3, -0.9), p(a1, 1.3, -0.9), p(a1, 1.45, 0.05), p(a0, 1.45, 0.05));
  }
  b.g = 0;
  // cables, burner frame, basket, crew
  b.c.set('#2c2a28');
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    b.beam(V(sx * 1.0, -0.6, sz * 1.0), V(sx * 0.62, -3.15, sz * 0.52), 0.06);
    b.beam(V(sx * 0.55, -1.7, sz * 0.55), V(sx * 0.62, -3.15, sz * 0.52), 0.05);
  }
  b.c.set('#8c9298');
  b.box(0, -1.75, 0, 1.15, 0.14, 1.15);
  b.c.set('#5d6268');
  b.box(0, -1.45, 0, 0.42, 0.5, 0.42);
  b.c.set('#a87a48');
  b.box(0, -3.75, 0, 1.3, 1.1, 1.08);
  b.c.set('#6b4a2a');
  b.box(0, -3.18, 0, 1.38, 0.12, 1.16);
  b.box(0, -4.32, 0, 1.24, 0.06, 1.02);
  // two passengers & the pilot (heads + shoulders above the rim)
  const crew: [number, number, string, string][] = [
    [-0.32, 0.2, '#f1c9a5', '#c0392b'],
    [0.3, 0.22, '#c99a74', '#2e86c1'],
    [0.02, -0.28, '#f1c9a5', '#3a3a3a'],
  ];
  for (const [x, z, skin, shirt] of crew) {
    b.c.set(shirt);
    b.box(x, -2.95, z, 0.4, 0.42, 0.26);
    b.c.set(skin);
    b.box(x, -2.56, z, 0.22, 0.24, 0.22);
  }
}

// ───────────────────────────────────────────────────────────────── plane ──
function plane(b: VB): void {
  b.m = MODEL.PLANE;
  const white = new THREE.Color('#f3f3f0'),
    belly = new THREE.Color('#c9ced4'),
    stripe = new THREE.Color('#2f6fd0'),
    glass = new THREE.Color('#25313d');
  // fuselage: 8-sided lathe along z
  const prof: [number, number][] = [
    [8.2, 0.12],
    [7.6, 0.75],
    [6.6, 1.15],
    [5.2, 1.3],
    [-2.5, 1.3],
    [-5.2, 0.85],
    [-7.6, 0.35],
  ];
  const S = 10;
  for (let j = 0; j < prof.length - 1; j++) {
    for (let i = 0; i < S; i++) {
      const a0 = (i / S) * Math.PI * 2,
        a1 = ((i + 1) / S) * Math.PI * 2;
      const p = (k: number, a: number) => V(Math.cos(a) * prof[k][1], Math.sin(a) * prof[k][1] * 1.05 + (k === prof.length - 1 ? 0.6 : 0), prof[k][0]);
      const am = (a0 + a1) / 2;
      const up = Math.sin(am);
      let c = up > 0.15 ? white : up < -0.3 ? belly : white;
      if (Math.abs(up) < 0.35 && j >= 2 && j <= 4) c = stripe;
      if (j === 1 && up > 0.1) c = glass;
      if (j === 3 && Math.abs(up) < 0.35 && up > -0.05 && i % 2 === 0) c = glass;
      b.c.copy(c);
      b.quad(p(j, a0), p(j + 1, a0), p(j + 1, a1), p(j, a1));
    }
  }
  // wings (high wing), engines, tail
  b.c.copy(white);
  b.box(0, 1.2, 0.6, 20, 0.28, 2.3);
  b.c.set('#d94a3d');
  b.box(9.6, 1.2, 0.6, 0.8, 0.3, 2.3);
  b.box(-9.6, 1.2, 0.6, 0.8, 0.3, 2.3);
  b.c.set('#b9c0c7');
  for (const x of [-3.6, 3.6]) {
    b.box(x, 0.75, 1.6, 0.95, 0.95, 3.4);
    b.c.set('#2b2f33');
    b.box(x, 0.75, 3.36, 1.9, 1.9, 0.05); // prop disc (dark, thin)
    b.c.set('#b9c0c7');
  }
  b.c.copy(white);
  // vertical fin (trapezoid)
  b.quad(V(0.1, 1.1, -4.6), V(0.1, 1.1, -7.6), V(0.1, 4.6, -8.2), V(0.1, 4.6, -6.6));
  b.quad(V(-0.1, 1.1, -4.6), V(-0.1, 4.6, -6.6), V(-0.1, 4.6, -8.2), V(-0.1, 1.1, -7.6));
  b.c.copy(stripe);
  b.box(0, 4.6, -7.4, 7.2, 0.2, 1.6);
  // landing gear stubs
  b.c.set('#2b2f33');
  b.box(0, -1.3, 5.2, 0.25, 0.5, 0.25);
  b.box(3.6, 0.05, 1.2, 0.3, 0.5, 0.5);
  b.box(-3.6, 0.05, 1.2, 0.3, 0.5, 0.5);
}

// ───────────────────────────────────────────────────────────────── blimp ──
function blimp(b: VB): void {
  b.m = MODEL.BLIMP;
  const L = 19,
    R = 5.4;
  const NZ = 18,
    NA = 18;
  const rAt = (t: number) => {
    // t in [0,1] from tail (0) to nose (1); fuller nose, tapered tail
    const x = t * 2 - 1;
    const e = Math.sqrt(Math.max(0, 1 - x * x));
    return R * (x < 0 ? Math.pow(e, 1.25) : Math.pow(e, 0.8));
  };
  b.g = 3;
  b.c.set('#ffffff');
  for (let j = 0; j < NZ; j++) {
    const t0 = j / NZ,
      t1 = (j + 1) / NZ;
    const z0 = -L + t0 * 2 * L,
      z1 = -L + t1 * 2 * L;
    const r0 = rAt(t0),
      r1 = rAt(t1);
    const dr = (r1 - r0) / (z1 - z0);
    for (let i = 0; i < NA; i++) {
      const a0 = (i / NA) * Math.PI * 2,
        a1 = ((i + 1) / NA) * Math.PI * 2;
      const p = (a: number, r: number, z: number) => V(Math.cos(a) * r, Math.sin(a) * r, z);
      const n = (a: number) => V(Math.cos(a), Math.sin(a), -dr).normalize();
      // uv: u along the length, v around (0.25 = left side +x... see the sign texture)
      const uv = (a: number, t: number) => [t, (a / (Math.PI * 2) + 0.25) % 1];
      const A = p(a0, r0, z0),
        B = p(a1, r0, z0),
        C = p(a1, r1, z1),
        D = p(a0, r1, z1);
      const ua = uv(a0, t0),
        ub = uv(a1, t0),
        uc = uv(a1, t1),
        ud = uv(a0, t1);
      if (i === NA - 1) {
        // wrap seam: keep v continuous
        if (ub[1] < ua[1]) ub[1] += 1;
        if (uc[1] < ud[1]) uc[1] += 1;
      }
      b.triN(A, C, B, n(a0), n(a1), n(a1), ua, uc, ub);
      b.triN(A, D, C, n(a0), n(a0), n(a1), ua, ud, uc);
    }
  }
  b.g = 0;
  // tail fins (cross)
  b.c.set('#d94a3d');
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const m = new THREE.Matrix4().makeRotationZ(a);
    const P = [V(1.6, 0, -12.5), V(5.6, 0, -15.5), V(5.6, 0, -18.3), V(1.0, 0, -17.6)].map((v) => v.applyMatrix4(m));
    const off = V(0, 0, 1).cross(V(Math.cos(a), Math.sin(a), 0)).multiplyScalar(0.12);
    const Pa = P.map((v) => v.clone().add(off)),
      Pb = P.map((v) => v.clone().sub(off));
    b.quad(Pa[0], Pa[1], Pa[2], Pa[3]);
    b.quad(Pb[3], Pb[2], Pb[1], Pb[0]);
  }
  // gondola + engines
  b.c.set('#e9ebee');
  b.box(0, -5.85, 3.6, 2.0, 1.5, 5.4);
  b.c.set('#2a3440');
  b.g = 2;
  b.box(0, -5.75, 3.6, 2.04, 0.5, 4.2);
  b.box(0, -5.75, 6.3, 1.4, 0.5, 0.06);
  b.g = 0;
  b.c.set('#9aa3ab');
  b.box(1.6, -5.4, 2.6, 0.7, 0.7, 1.6);
  b.box(-1.6, -5.4, 2.6, 0.7, 0.7, 1.6);
  b.c.set('#6a7178');
  b.beam(V(0, -5.1, 2.0), V(0, -5.25, 2.6), 0.1);
}

// ───────────────────────────────────────────────────────────────── barge ──
function barge(b: VB): void {
  b.m = MODEL.BARGE;
  b.c.set('#3f4c5c');
  b.box(0, -0.25, 0, 4.6, 1.3, 10);
  b.c.set('#2c3640');
  b.box(0, -0.75, 5.3, 4.2, 0.4, 0.8);
  b.c.set('#8a6c4c');
  b.box(0, 0.45, 0, 4.4, 0.12, 9.6);
  // rubbing strake + tyres
  b.c.set('#1f2328');
  b.box(2.35, 0.2, 0, 0.12, 0.25, 9.8);
  b.box(-2.35, 0.2, 0, 0.12, 0.25, 9.8);
  for (const z of [-3.5, 0, 3.5]) {
    b.box(2.45, -0.1, z, 0.2, 0.55, 0.55);
    b.box(-2.45, -0.1, z, 0.2, 0.55, 0.55);
  }
  // little wheelhouse at the stern
  b.c.set('#e8e4da');
  b.box(0, 1.3, -3.9, 2.2, 1.6, 1.8);
  b.c.set('#c0392b');
  b.box(0, 2.18, -3.9, 2.4, 0.16, 2.0);
  b.c.set('#27313b');
  b.g = 2;
  b.box(0, 1.5, -2.98, 1.6, 0.5, 0.05);
  b.g = 0;
  // mortar racks
  b.c.set('#2a2a2c');
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 6; k++) {
      b.box(-1.4 + k * 0.56, 0.85, -0.8 + r * 1.3, 0.32, 0.75, 0.32);
    }
  b.c.set('#7a5a3a');
  b.box(0, 0.62, 0.5, 3.6, 0.3, 4.0);
  // mast + pennant
  b.c.set('#d8d8d8');
  b.beam(V(0, 2.2, -3.9), V(0, 5.2, -3.9), 0.1);
  b.c.set('#e63946');
  b.quad(V(0, 5.1, -3.9), V(0, 4.6, -3.9), V(0, 4.85, -5.2), V(0, 4.85, -5.2));
  b.quad(V(0, 4.85, -5.2), V(0, 4.6, -3.9), V(0, 5.1, -3.9), V(0, 4.85, -5.2));
}

export function buildVehicleGeometry(): THREE.BufferGeometry {
  const b = new VB();
  balloon(b);
  plane(b);
  blimp(b);
  barge(b);
  return b.build();
}

/** Blimp sign: white canvas with "TINYHAVEN" bands on both flanks. */
export function makeBlimpTexture(): THREE.CanvasTexture {
  const W = 1024,
    H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  // coloured belly + spine stripes (around: v = 0 bottom… wraps)
  const band = (v0: number, v1: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(0, H * (1 - v1), W, H * (v1 - v0));
  };
  band(0.97, 1.0, '#2f6fd0');
  band(0.0, 0.03, '#2f6fd0');
  band(0.47, 0.53, '#2f6fd0');
  // u (along the hull) spans ~38 m over W px, v (around) ~34 m over H px → squash the glyphs
  // vertically so they come out with the right proportions on the envelope
  const text = (vCenter: number, flipX: boolean, flipY: boolean) => {
    g.save();
    g.translate(W * 0.5, H * (1 - vCenter));
    g.scale(flipX ? -1 : 1, (flipY ? -1 : 1) * 0.56);
    g.font = 'bold 120px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#c0392b';
    g.fillText('TINYHAVEN', 0, 0);
    g.restore();
  };
  // v = 0.25 → +x flank (left of the blimp), v = 0.75 → -x flank
  text(0.25, false, false);
  text(0.75, true, true);
  // keep a white corner for every other model (uv ≈ 0.002)
  g.fillStyle = '#ffffff';
  g.fillRect(0, H - 8, 8, 8);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
