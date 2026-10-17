// Tiny geometry accumulator shared by the rail and boats modules.
//
// Every vertex carries position, normal, colour plus two custom attributes:
//   aKind  (float)  material behaviour code (emissive lamp, ballast grain, …) — see the
//                   material that consumes the geometry
//   aAnim  (vec4)   rigid vertex animation: x = animation code, yzw = pivot (local)
// Primitives are written straight into flat arrays through the current transform
// (`frame`), so thousands of sleepers/posts cost no intermediate BufferGeometries.

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

export type V3 = [number, number, number];

export class Geo {
  P: number[] = [];
  N: number[] = [];
  C: number[] = [];
  K: number[] = [];
  A: number[] = [];
  /** extra per-vertex attribute (vec4), optional use */
  X: number[] = [];
  I: number[] = [];
  /** current local frame (applied to every primitive) */
  frame = new THREE.Matrix4();
  private cr = 1;
  private cg = 1;
  private cb = 1;
  private k = 0;
  /** variant offset added to aKind (100 · variant) so one geometry can hold several model variants */
  private vo = 0;
  private an: [number, number, number, number] = [0, 0, 0, 0];
  private ex: [number, number, number, number] = [0, 0, 0, 0];
  private stack: THREE.Matrix4[] = [];

  get vertexCount(): number {
    return this.P.length / 3;
  }
  get triangles(): number {
    return this.I.length / 3;
  }

  /** paint colour (sRGB input → linear vertex colour), optional brightness multiplier */
  color(c: THREE.ColorRepresentation, mul = 1): this {
    _c.set(c);
    this.cr = _c.r * mul;
    this.cg = _c.g * mul;
    this.cb = _c.b * mul;
    return this;
  }
  rgb(r: number, g: number, b: number): this {
    this.cr = r;
    this.cg = g;
    this.cb = b;
    return this;
  }
  kind(k: number): this {
    this.k = k;
    return this;
  }
  /** parts written from now on belong to model variant v (0 = shared); stored as aKind + 100·v */
  variant(v: number): this {
    this.vo = v * 100;
    return this;
  }
  /** rigid animation code + pivot (in the CURRENT frame's space; transformed on write) */
  anim(code: number, px = 0, py = 0, pz = 0): this {
    if (code === 0) {
      this.an = [0, 0, 0, 0];
      return this;
    }
    _v.set(px, py, pz).applyMatrix4(this.frame);
    this.an = [code, _v.x, _v.y, _v.z];
    return this;
  }
  extra(x: number, y = 0, z = 0, w = 0): this {
    this.ex = [x, y, z, w];
    return this;
  }

  push(): this {
    this.stack.push(this.frame.clone());
    return this;
  }
  pop(): this {
    const m = this.stack.pop();
    if (m) this.frame.copy(m);
    return this;
  }
  reset(): this {
    this.frame.identity();
    return this;
  }
  /** frame = frame · T(x,y,z) · Ry(yaw) */
  at(x: number, y: number, z: number, yaw = 0): this {
    _m.makeRotationY(yaw).setPosition(x, y, z);
    this.frame.multiply(_m);
    return this;
  }
  rotX(a: number): this {
    this.frame.multiply(_m.makeRotationX(a));
    return this;
  }
  rotY(a: number): this {
    this.frame.multiply(_m.makeRotationY(a));
    return this;
  }
  rotZ(a: number): this {
    this.frame.multiply(_m.makeRotationZ(a));
    return this;
  }

  // ───────────────────────────────────────────── low level

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, m: THREE.Matrix4 = this.frame, nm?: THREE.Matrix3): number {
    _v.set(x, y, z).applyMatrix4(m);
    _n.set(nx, ny, nz);
    if (nm) _n.applyMatrix3(nm);
    else _n.transformDirection(m);
    _n.normalize();
    this.P.push(_v.x, _v.y, _v.z);
    this.N.push(_n.x, _n.y, _n.z);
    this.C.push(this.cr, this.cg, this.cb);
    this.K.push(this.k + this.vo);
    this.A.push(this.an[0], this.an[1], this.an[2], this.an[3]);
    this.X.push(this.ex[0], this.ex[1], this.ex[2], this.ex[3]);
    return this.P.length / 3 - 1;
  }

  /** flat quad a b c d (counter-clockwise seen from the front), normal from the winding */
  quad(a: V3, b: V3, c: V3, d: V3): this {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    _d.crossVectors(_a, _b);
    if (_d.lengthSq() < 1e-12) _d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]).cross(_a);
    _d.normalize();
    const i0 = this.vert(a[0], a[1], a[2], _d.x, _d.y, _d.z);
    this.vert(b[0], b[1], b[2], _d.x, _d.y, _d.z);
    this.vert(c[0], c[1], c[2], _d.x, _d.y, _d.z);
    this.vert(d[0], d[1], d[2], _d.x, _d.y, _d.z);
    this.I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    return this;
  }
  /** quad with both faces */
  quad2(a: V3, b: V3, c: V3, d: V3): this {
    this.quad(a, b, c, d);
    this.quad(d, c, b, a);
    return this;
  }
  tri(a: V3, b: V3, c: V3): this {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _d.crossVectors(_a, _b).normalize();
    const i0 = this.vert(a[0], a[1], a[2], _d.x, _d.y, _d.z);
    this.vert(b[0], b[1], b[2], _d.x, _d.y, _d.z);
    this.vert(c[0], c[1], c[2], _d.x, _d.y, _d.z);
    this.I.push(i0, i0 + 1, i0 + 2);
    return this;
  }

  // ───────────────────────────────────────────── primitives

  /**
   * Axis-aligned box (in the current frame) centred at (cx, cy, cz) with full sizes.
   * `skip` bit mask of faces to omit: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z.
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, skip = 8): this {
    const x0 = cx - sx / 2,
      x1 = cx + sx / 2,
      y0 = cy - sy / 2,
      y1 = cy + sy / 2,
      z0 = cz - sz / 2,
      z1 = cz + sz / 2;
    if (!(skip & 1)) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    if (!(skip & 2)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (!(skip & 4)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    if (!(skip & 8)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!(skip & 16)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (!(skip & 32)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    return this;
  }
  /** box standing on y0 (bottom face skipped) */
  block(cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, skip = 8): this {
    return this.box(cx, y0 + sy / 2, cz, sx, sy, sz, skip);
  }

  /** beam of rectangular section w (horizontal) × h between two points (current frame) */
  beam(a: V3, b: V3, w: number, h: number, skipEnds = false): this {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    const len = _a.distanceTo(_b);
    if (len < 1e-6) return this;
    _d.subVectors(_b, _a).normalize();
    // orientation: local z along the beam, local y as "up" as possible
    const up = Math.abs(_d.y) > 0.98 ? _p.set(1, 0, 0) : _p.set(0, 1, 0);
    _m2.lookAt(_a, _b, up); // -z of the matrix points from a to b
    _q.setFromRotationMatrix(_m2);
    _s.set(1, 1, 1);
    _v.addVectors(_a, _b).multiplyScalar(0.5);
    _m2.compose(_v, _q, _s);
    this.push();
    this.frame.multiply(_m2);
    this.box(0, 0, 0, w, h, len, skipEnds ? 48 : 0);
    this.pop();
    return this;
  }

  /** cylinder around local Y from y0 to y0+h at (cx, cz); r0 bottom / r1 top radius */
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, seg = 8, caps = 1): this {
    const base = this.P.length / 3;
    const slope = (r0 - r1) / h;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const c = Math.cos(t),
        s = Math.sin(t);
      const nl = Math.hypot(1, slope);
      this.vert(cx + c * r0, y0, cz + s * r0, c / nl, slope / nl, s / nl);
      this.vert(cx + c * r1, y0 + h, cz + s * r1, c / nl, slope / nl, s / nl);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      this.I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (caps & 1 && r1 > 0) {
      const c0 = this.vert(cx, y0 + h, cz, 0, 1, 0);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        this.vert(cx + Math.cos(t) * r1, y0 + h, cz + Math.sin(t) * r1, 0, 1, 0);
      }
      for (let i = 0; i < seg; i++) this.I.push(c0, c0 + 2 + i, c0 + 1 + i);
    }
    if (caps & 2 && r0 > 0) {
      const c0 = this.vert(cx, y0, cz, 0, -1, 0);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        this.vert(cx + Math.cos(t) * r0, y0, cz + Math.sin(t) * r0, 0, -1, 0);
      }
      for (let i = 0; i < seg; i++) this.I.push(c0, c0 + 1 + i, c0 + 2 + i);
    }
    return this;
  }

  /** cylinder of radius r between two points (current frame) */
  rod(a: V3, b: V3, r: number, seg = 6, caps = 0): this {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    const len = _a.distanceTo(_b);
    if (len < 1e-6) return this;
    _d.subVectors(_b, _a).normalize();
    _q.setFromUnitVectors(_up, _d);
    _m2.compose(_a, _q, _s.set(1, 1, 1));
    this.push();
    this.frame.multiply(_m2);
    this.cyl(0, 0, 0, r, r, len, seg, caps);
    this.pop();
    return this;
  }

  /** low-poly sphere (lat/long) */
  sphere(cx: number, cy: number, cz: number, r: number, wseg = 8, hseg = 5, sy = 1): this {
    const base = this.P.length / 3;
    for (let j = 0; j <= hseg; j++) {
      const v = j / hseg;
      const th = v * Math.PI;
      for (let i = 0; i <= wseg; i++) {
        const ph = (i / wseg) * Math.PI * 2;
        const nx = Math.cos(ph) * Math.sin(th),
          ny = Math.cos(th),
          nz = Math.sin(ph) * Math.sin(th);
        this.vert(cx + nx * r, cy + ny * r * sy, cz + nz * r, nx, ny / Math.max(0.2, sy), nz);
      }
    }
    const row = wseg + 1;
    for (let j = 0; j < hseg; j++) {
      for (let i = 0; i < wseg; i++) {
        const a = base + j * row + i;
        this.I.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
      }
    }
    return this;
  }

  /**
   * Extrude a 2D polygon (x, y in the local XY plane, counter-clockwise) along local Z
   * from z0 to z1, with caps. `sides` false: caps only.
   */
  prism(poly: [number, number][], z0: number, z1: number, caps = 3, sides = true): this {
    const n = poly.length;
    if (sides) {
      for (let i = 0; i < n; i++) {
        const [x0, y0] = poly[i];
        const [x1, y1] = poly[(i + 1) % n];
        this.quad([x0, y0, z1], [x0, y0, z0], [x1, y1, z0], [x1, y1, z1]);
      }
    }
    if (caps & 1) this.fan(poly.map(([x, y]) => [x, y, z1] as V3), [0, 0, 1]);
    if (caps & 2) this.fan(poly.map(([x, y]) => [x, y, z0] as V3).reverse(), [0, 0, -1]);
    return this;
  }

  /** convex polygon (in order, counter-clockwise seen from the normal side) as a fan */
  fan(pts: V3[], normal?: V3): this {
    if (pts.length < 3) return this;
    let nx: number, ny: number, nz: number;
    if (normal) [nx, ny, nz] = normal;
    else {
      _a.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
      _b.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
      _d.crossVectors(_a, _b).normalize();
      nx = _d.x;
      ny = _d.y;
      nz = _d.z;
    }
    const i0 = this.P.length / 3;
    for (const p of pts) this.vert(p[0], p[1], p[2], nx, ny, nz);
    for (let i = 1; i < pts.length - 1; i++) this.I.push(i0, i0 + i, i0 + i + 1);
    return this;
  }

  /** triangulated (possibly concave) polygon in local XY via THREE.ShapeUtils, both faces optional */
  shape(poly: [number, number][], z: number, normalZ = 1): this {
    const v2 = poly.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(v2, []);
    const i0 = this.P.length / 3;
    for (const [x, y] of poly) this.vert(x, y, z, 0, 0, normalZ);
    for (const t of tris) {
      const [a, b, c] = t;
      const area = (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[c][0] - poly[a][0]) * (poly[b][1] - poly[a][1]);
      const ccw = area > 0;
      if (ccw === normalZ > 0) this.I.push(i0 + a, i0 + b, i0 + c);
      else this.I.push(i0 + a, i0 + c, i0 + b);
    }
    return this;
  }

  /** append another Geo (already in world/local space of this one), transformed by the current frame */
  append(o: Geo): this {
    const base = this.P.length / 3;
    _nm.getNormalMatrix(this.frame);
    for (let i = 0; i < o.P.length / 3; i++) {
      _v.set(o.P[i * 3], o.P[i * 3 + 1], o.P[i * 3 + 2]).applyMatrix4(this.frame);
      _n.set(o.N[i * 3], o.N[i * 3 + 1], o.N[i * 3 + 2]).applyMatrix3(_nm).normalize();
      this.P.push(_v.x, _v.y, _v.z);
      this.N.push(_n.x, _n.y, _n.z);
    }
    this.C.push(...o.C);
    this.K.push(...o.K);
    this.X.push(...o.X);
    for (let i = 0; i < o.A.length; i += 4) {
      if (o.A[i] === 0) this.A.push(0, 0, 0, 0);
      else {
        _v.set(o.A[i + 1], o.A[i + 2], o.A[i + 3]).applyMatrix4(this.frame);
        this.A.push(o.A[i], _v.x, _v.y, _v.z);
      }
    }
    for (const idx of o.I) this.I.push(idx + base);
    return this;
  }

  /** Build the BufferGeometry. `extra` adds the aExtra attribute. */
  build(opts: { extra?: boolean; anim?: boolean; kind?: boolean } = {}): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (opts.kind !== false) g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.K, 1));
    if (opts.anim !== false) g.setAttribute('aAnim', new THREE.Float32BufferAttribute(this.A, 4));
    if (opts.extra) g.setAttribute('aExtra', new THREE.Float32BufferAttribute(this.X, 4));
    const n = this.P.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Euler helper for composing instance matrices without allocations. */
export function composeMatrix(out: THREE.Matrix4, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, scale = 1): THREE.Matrix4 {
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scale, scale);
  return out.compose(_p, _q, _s);
}

/** hash01 for integer-ish inputs (deterministic) */
export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
