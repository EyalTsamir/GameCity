// Geometry accumulator for the harbour module: positions, normals, vertex colours plus the
// harbour material's extra attributes —
//   aEmit (vec4)  rgb = linear emissive colour × intensity, w = mode + phase (see EMIT)
//   aPat  (vec2)  surface pattern id + parameter (see PAT)
//   aRig  (vec4)  rigged builders only: rig type, index, a, b (see RIG / material.ts)
//   aPivot(vec3)  rigged builders only: pivot point (gondolas) in object space
// with a local transform stack so parts can be modelled in their own frame and placed.
// Everything accumulates into ONE BufferGeometry (one draw call).

import * as THREE from 'three';
import type { Rng } from '../../core/rng';

export type V3 = [number, number, number];

/** surface patterns evaluated in the fragment shader */
/** NET: knotted netting cords over a heap (param = mesh size, m); RUST: painted steel with rust blooms and chips
 *  (param = rust amount 0..1); STAIN: an irregular ground decal (oil / wet / fish-water), edges cut by noise
 *  (param = blotch scale, m) — patterns in material.ts */
export const PAT = { NONE: 0, CORRUGATED: 1, PLANKS_X: 2, PLANKS_Z: 3, HULL: 4, STONE: 5, GLASS: 6, NET: 7, RUST: 8, STAIN: 9 } as const;
/** night-light behaviours (aEmit.w integer part) */
export const EMIT = {
  /** on with the street lights (windows, lamps) */
  LIGHTS: 0,
  /** aviation / navigation blink, also dimly by day */
  BLINK: 1,
  /** ferris wheel rim bulbs: chase / rainbow patterns (phase = angle fraction) */
  CHASE: 2,
  /** always on (dim by day) */
  STEADY: 3,
  /** rotating amber beacon of crane `phase*4` while it travels */
  BEACON: 4,
  /** carousel marquee bulbs (phase = parity / index) */
  MARQUEE: 5,
  /** lighthouse lantern */
  LANTERN: 6,
  /** ferris wheel spoke bulbs (phase = radial fraction) */
  SPOKE: 7,
} as const;
/** vertex-shader rigs of the animated mesh (aRig.x) */
export const RIG = {
  STATIC: 0,
  /** rigid ship motion (uShip); aRig.z = blend weight (mooring lines: 0 at the bollard) */
  SHIP: 1,
  /** crane aRig.y: gantry travel (z) */
  GANTRY: 2,
  /** + trolley travel along the boom (x) */
  TROLLEY: 3,
  /** + hoist (y) + sway */
  SPREADER: 4,
  /** hoist ropes: aRig.z = 0 at the trolley, 1 at the spreader */
  CABLE: 5,
  /** free container aRig.y: uMob[i] matrix */
  MOBILE: 6,
  /** ferris wheel rotation about the hub (z axis) */
  WHEEL: 7,
  /** gondola: pivot (aPivot) turns with the wheel, body stays upright */
  GONDOLA: 8,
  /** carousel rotation about its vertical axis */
  CAROUSEL: 9,
  /** carousel horse: rotation + bob (aRig.z = phase) */
  HORSE: 10,
} as const;

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class HB {
  readonly rigged: boolean;
  private P: number[] = [];
  private N: number[] = [];
  private C: number[] = [];
  private E: number[] = [];
  private T: number[] = [];
  private R: number[] = [];
  private V: number[] = [];
  private I: number[] = [];
  count = 0;
  private col: V3 = [1, 1, 1];
  private em: [number, number, number, number] = [0, 0, 0, 0];
  private pt: [number, number] = [0, 0];
  private rg: [number, number, number, number] = [0, 0, 0, 0];
  private pv: V3 = [0, 0, 0];
  private stack: THREE.Matrix4[] = [];
  private M = new THREE.Matrix4();
  private NM = new THREE.Matrix3();
  private ident = true;

  constructor(rigged = false) {
    this.rigged = rigged;
  }

  get triangles(): number {
    return this.I.length / 3;
  }

  // ───────────────────────────────────────────── state
  color(c: THREE.ColorRepresentation): this {
    _c.set(c);
    this.col = [_c.r, _c.g, _c.b];
    return this;
  }
  colorObj(c: THREE.Color): this {
    this.col = [c.r, c.g, c.b];
    return this;
  }
  /** night emission: colour × intensity, behaviour `mode` (EMIT), phase 0..1 */
  emit(c: THREE.ColorRepresentation | null, intensity = 1, mode = 0, phase = 0): this {
    if (c === null) {
      this.em = [0, 0, 0, 0];
      return this;
    }
    _c.set(c);
    this.em = [_c.r * intensity, _c.g * intensity, _c.b * intensity, mode + Math.min(0.995, Math.max(0, phase))];
    return this;
  }
  noEmit(): this {
    this.em = [0, 0, 0, 0];
    return this;
  }
  pat(id: number, param = 0): this {
    this.pt = [id, param];
    return this;
  }
  rig(type: number, index = 0, a = 0, b = 0): this {
    this.rg = [type, index, a, b];
    return this;
  }
  /** pivot in the CURRENT local frame (transformed by the stack) */
  pivot(x: number, y: number, z: number): this {
    _v.set(x, y, z);
    if (!this.ident) _v.applyMatrix4(this.M);
    this.pv = [_v.x, _v.y, _v.z];
    return this;
  }

  // ───────────────────────────────────────────── transform stack
  push(m: THREE.Matrix4): this {
    this.stack.push(this.M.clone());
    this.M.multiply(m);
    this.sync();
    return this;
  }
  /** push translate(x,y,z) · rotY(yaw) · rotX(pitch) · rotZ(roll) */
  pushT(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): this {
    _m.makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    _m.setPosition(x, y, z);
    return this.push(_m);
  }
  pop(): this {
    const m = this.stack.pop();
    if (m) this.M.copy(m);
    this.sync();
    return this;
  }
  private sync(): void {
    const e = this.M.elements;
    this.ident = e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0;
    this.NM.getNormalMatrix(this.M);
  }

  // ───────────────────────────────────────────── raw
  vtx(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    // a zero normal would become NaN in the shader (normalize) and smear black through bloom
    if (!(nx * nx + ny * ny + nz * nz > 1e-12)) {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    if (!this.ident) {
      _v.set(x, y, z).applyMatrix4(this.M);
      _n.set(nx, ny, nz).applyMatrix3(this.NM).normalize();
      x = _v.x;
      y = _v.y;
      z = _v.z;
      nx = _n.x;
      ny = _n.y;
      nz = _n.z;
    }
    this.P.push(x, y, z);
    this.N.push(nx, ny, nz);
    this.C.push(this.col[0], this.col[1], this.col[2]);
    this.E.push(this.em[0], this.em[1], this.em[2], this.em[3]);
    this.T.push(this.pt[0], this.pt[1]);
    if (this.rigged) {
      this.R.push(this.rg[0], this.rg[1], this.rg[2], this.rg[3]);
      this.V.push(this.pv[0], this.pv[1], this.pv[2]);
    }
    return this.count++;
  }
  tri(a: number, b: number, c: number): void {
    this.I.push(a, b, c);
  }

  /** flat quad, corners counter-clockwise seen from the front */
  quad(p0: V3, p1: V3, p2: V3, p3: V3): void {
    // normal from the diagonals: robust for skewed and degenerate (triangle) quads
    _a.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    _b.set(p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-14) return; // no area: nothing to draw
    _n.normalize();
    const nx = _n.x,
      ny = _n.y,
      nz = _n.z;
    const i0 = this.vtx(p0[0], p0[1], p0[2], nx, ny, nz);
    const i1 = this.vtx(p1[0], p1[1], p1[2], nx, ny, nz);
    const i2 = this.vtx(p2[0], p2[1], p2[2], nx, ny, nz);
    const i3 = this.vtx(p3[0], p3[1], p3[2], nx, ny, nz);
    this.I.push(i0, i1, i2, i0, i2, i3);
  }
  /** double-sided quad (two faces) */
  quad2(p0: V3, p1: V3, p2: V3, p3: V3): void {
    this.quad(p0, p1, p2, p3);
    this.quad(p0, p3, p2, p1);
  }
  triangle(p0: V3, p1: V3, p2: V3): void {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-14) return;
    _n.normalize();
    const nx = _n.x,
      ny = _n.y,
      nz = _n.z;
    const i0 = this.vtx(p0[0], p0[1], p0[2], nx, ny, nz);
    const i1 = this.vtx(p1[0], p1[1], p1[2], nx, ny, nz);
    const i2 = this.vtx(p2[0], p2[1], p2[2], nx, ny, nz);
    this.I.push(i0, i1, i2);
  }

  /**
   * Box by CENTRE (cx,cy,cz) and FULL sizes, optional yaw about +Y.
   * skip bitmask: 1 bottom, 2 top, 4 −z, 8 +z, 16 −x, 32 +x.
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, skip = 0): void {
    const hx = sx / 2,
      hy = sy / 2,
      hz = sz / 2;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    // local → rotated offsets
    const P = (x: number, y: number, z: number): V3 => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const R = (x: number, z: number): [number, number] => [x * c + z * s, -x * s + z * c];
    const face = (p0: V3, p1: V3, p2: V3, p3: V3, nx: number, ny: number, nz: number) => {
      const i0 = this.vtx(p0[0], p0[1], p0[2], nx, ny, nz);
      const i1 = this.vtx(p1[0], p1[1], p1[2], nx, ny, nz);
      const i2 = this.vtx(p2[0], p2[1], p2[2], nx, ny, nz);
      const i3 = this.vtx(p3[0], p3[1], p3[2], nx, ny, nz);
      this.I.push(i0, i1, i2, i0, i2, i3);
    };
    if (!(skip & 1)) face(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), 0, -1, 0);
    if (!(skip & 2)) face(P(-hx, hy, -hz), P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), 0, 1, 0);
    let n = R(0, -1);
    if (!(skip & 4)) face(P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, -hy, -hz), n[0], 0, n[1]);
    n = R(0, 1);
    if (!(skip & 8)) face(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), n[0], 0, n[1]);
    n = R(-1, 0);
    if (!(skip & 16)) face(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), n[0], 0, n[1]);
    n = R(1, 0);
    if (!(skip & 32)) face(P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(hx, -hy, hz), n[0], 0, n[1]);
  }
  /** axis-aligned box from min/max corners */
  boxMM(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skip = 0): void {
    this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0, skip);
  }

  /** rectangular beam from a to b; w across (horizontal-ish), h the other way; ends capped */
  beam(a: V3, b: V3, w: number, h: number, caps = true): void {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = _d.length();
    if (L < 1e-6) return;
    _d.divideScalar(L);
    _u.set(0, 1, 0);
    if (Math.abs(_d.y) > 0.95) _u.set(1, 0, 0);
    _s.crossVectors(_d, _u).normalize();
    _u.crossVectors(_s, _d).normalize();
    const sx = _s.x * w * 0.5,
      sy = _s.y * w * 0.5,
      sz = _s.z * w * 0.5;
    const ux = _u.x * h * 0.5,
      uy = _u.y * h * 0.5,
      uz = _u.z * h * 0.5;
    const C = (p: V3, i: number, j: number): V3 => [p[0] + sx * i + ux * j, p[1] + sy * i + uy * j, p[2] + sz * i + uz * j];
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = corners[k];
      const [i1, j1] = corners[(k + 1) % 4];
      this.quad(C(a, i0, j0), C(b, i0, j0), C(b, i1, j1), C(a, i1, j1));
    }
    if (caps) {
      this.quad(C(a, -1, -1), C(a, 1, -1), C(a, 1, 1), C(a, -1, 1));
      this.quad(C(b, -1, -1), C(b, -1, 1), C(b, 1, 1), C(b, 1, -1));
    }
  }

  /** frustum / cylinder from a (radius r0) to b (radius r1); caps bit 1 = at a, bit 2 = at b */
  cyl(a: V3, b: V3, r0: number, r1: number, seg = 8, caps = 3, phase = 0): void {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = _d.length();
    if (L < 1e-6) return;
    _d.divideScalar(L);
    _u.set(0, 1, 0);
    if (Math.abs(_d.y) > 0.95) _u.set(1, 0, 0);
    _s.crossVectors(_d, _u).normalize();
    _u.crossVectors(_s, _d).normalize();
    const sx = _s.x,
      sy = _s.y,
      sz = _s.z,
      ux = _u.x,
      uy = _u.y,
      uz = _u.z,
      dx = _d.x,
      dy = _d.y,
      dz = _d.z;
    const slope = (r0 - r1) / L;
    const base = this.count;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2 + phase;
      const c = Math.cos(t),
        s = Math.sin(t);
      const rx = sx * c + ux * s,
        ry = sy * c + uy * s,
        rz = sz * c + uz * s;
      let nx = rx + dx * slope,
        ny = ry + dy * slope,
        nz = rz + dz * slope;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      this.vtx(a[0] + rx * r0, a[1] + ry * r0, a[2] + rz * r0, nx, ny, nz);
      this.vtx(b[0] + rx * r1, b[1] + ry * r1, b[2] + rz * r1, nx, ny, nz);
    }
    for (let i = 0; i < seg; i++) {
      const k = base + i * 2;
      this.I.push(k, k + 3, k + 2, k, k + 1, k + 3);
    }
    const cap = (p: V3, r: number, sign: number) => {
      if (r <= 1e-5) return;
      const c0 = this.vtx(p[0], p[1], p[2], dx * sign, dy * sign, dz * sign);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2 + phase;
        const c = Math.cos(t),
          s = Math.sin(t);
        this.vtx(p[0] + (sx * c + ux * s) * r, p[1] + (sy * c + uy * s) * r, p[2] + (sz * c + uz * s) * r, dx * sign, dy * sign, dz * sign);
      }
      for (let i = 0; i < seg; i++) {
        if (sign > 0) this.I.push(c0, c0 + 2 + i, c0 + 1 + i);
        else this.I.push(c0, c0 + 1 + i, c0 + 2 + i);
      }
    };
    if (caps & 1) cap(a, r0, -1);
    if (caps & 2) cap(b, r1, 1);
  }

  /** vertical cylinder convenience: base centre (x,y,z), height h */
  vcyl(x: number, y: number, z: number, r: number, h: number, seg = 8, caps = 2, rTop = r): void {
    this.cyl([x, y, z], [x, y + h, z], r, rTop, seg, caps);
  }

  /** tube along a polyline (smooth normals); onPoint(i) runs before ring i (vary emit / rig per ring) */
  tube(pts: V3[], r: number, seg = 6, closed = false, onPoint?: (i: number) => void): void {
    const n = pts.length;
    if (n < 2) return;
    const base = this.count;
    const ref = new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3(),
      sv = new THREE.Vector3(),
      uv = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pa = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const pb = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      t.set(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
      if (Math.abs(t.dot(ref)) > 0.95) ref.set(1, 0, 0);
      sv.crossVectors(t, ref).normalize();
      uv.crossVectors(sv, t).normalize();
      onPoint?.(i);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const c = Math.cos(a),
          s = Math.sin(a);
        const nx = sv.x * c + uv.x * s,
          ny = sv.y * c + uv.y * s,
          nz = sv.z * c + uv.z * s;
        this.vtx(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, nx, ny, nz);
      }
    }
    const rows = closed ? n : n - 1;
    for (let i = 0; i < rows; i++) {
      const a0 = base + i * (seg + 1);
      const b0 = base + ((i + 1) % n) * (seg + 1);
      for (let k = 0; k < seg; k++) this.I.push(a0 + k, b0 + k, b0 + k + 1, a0 + k, b0 + k + 1, a0 + k + 1);
    }
  }

  /** append a three.js geometry (position + normal), transformed by m then the stack */
  geo(g: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!nor) {
      g.computeVertexNormals();
      nor = g.getAttribute('normal') as THREE.BufferAttribute;
    }
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      _a.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      _b.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (m && nm) {
        _a.applyMatrix4(m);
        _b.applyMatrix3(nm);
      }
      if (_b.lengthSq() < 1e-12 || !Number.isFinite(_b.x + _b.y + _b.z)) _b.set(0, 1, 0);
      else _b.normalize();
      this.vtx(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) this.I.push(base + idx.getX(i));
    else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
  }

  /** low-poly sphere / ellipsoid (smooth) */
  sphere(cx: number, cy: number, cz: number, r: number, wseg = 8, hseg = 6, sy = 1): void {
    const g = new THREE.SphereGeometry(r, wseg, hseg);
    if (sy !== 1) g.scale(1, sy, 1);
    g.translate(cx, cy, cz);
    this.geo(g);
    g.dispose();
  }

  /** lathe around +Y at (cx,cy,cz); profile = [radius, y][] bottom→top */
  lathe(profile: [number, number][], seg: number, cx: number, cy: number, cz: number): void {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)),
      seg,
    );
    g.translate(cx, cy, cz);
    this.geo(g);
    g.dispose();
  }

  /** faceted rock: jittered icosahedron (flat shaded) */
  rock(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, rng: Rng, yaw = 0, detail = 0): void {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const jit = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let j = jit.get(key);
      if (j === undefined) {
        j = 0.78 + rng.next() * 0.38;
        jit.set(key, j);
      }
      pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j);
    }
    g.scale(rx, ry, rz);
    g.rotateY(yaw);
    g.translate(cx, cy, cz);
    g.computeVertexNormals(); // non-indexed → flat facets
    this.geo(g);
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.E, 4));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(this.T, 2));
    if (this.rigged) {
      g.setAttribute('aRig', new THREE.Float32BufferAttribute(this.R, 4));
      g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.V, 3));
    }
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
