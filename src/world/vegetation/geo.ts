// Merged static geometry builder shared by the vegetation and props modules.
//
// Everything those two modules draw is baked once at start-up into a handful of big
// vertex-coloured meshes (one draw call each). GeoSink accumulates vertices / triangles in
// growable typed arrays (no per-vertex allocations); Shaper adds a current transform and a
// small set of primitives (boxes, cylinders, cones, ellipsoids, beams, quads, discs).
// Extra per-vertex attributes (wind data, emission…) are filled from the sink's current
// values, optionally overridden per vertex by a hook that sees the world position.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

class FBuf {
  a: Float32Array;
  n = 0;
  constructor(cap: number) {
    this.a = new Float32Array(cap);
  }
  reserve(k: number): void {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2;
    while (c < this.n + k) c *= 2;
    const b = new Float32Array(c);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  done(): Float32Array {
    return this.a.slice(0, this.n);
  }
}

class UBuf {
  a: Uint32Array;
  n = 0;
  constructor(cap: number) {
    this.a = new Uint32Array(cap);
  }
  reserve(k: number): void {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2;
    while (c < this.n + k) c *= 2;
    const b = new Uint32Array(c);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
}

export interface ExtraDef {
  name: string;
  size: number;
}

const _col = new THREE.Color();

export class GeoSink {
  private P = new FBuf(1 << 15);
  private N = new FBuf(1 << 15);
  private C = new FBuf(1 << 15);
  private I = new UBuf(1 << 15);
  private X: FBuf[];
  readonly defs: ExtraDef[];
  /** current extra values (one array per extra attribute) — written into every new vertex */
  readonly ex: Float32Array[];
  /** current vertex colour (linear) */
  r = 1;
  g = 1;
  b = 1;
  /** optional per-vertex hook (world position) — may overwrite `ex` / colour before the vertex is stored */
  hook: ((x: number, y: number, z: number) => void) | null = null;
  vcount = 0;
  tcount = 0;

  constructor(extras: ExtraDef[] = []) {
    this.defs = extras;
    this.X = extras.map((d) => new FBuf(d.size << 14));
    this.ex = extras.map((d) => new Float32Array(d.size));
  }

  color(c: THREE.ColorRepresentation): this {
    _col.set(c);
    this.r = _col.r;
    this.g = _col.g;
    this.b = _col.b;
    return this;
  }

  colorObj(c: THREE.Color, k = 1): this {
    this.r = c.r * k;
    this.g = c.g * k;
    this.b = c.b * k;
    return this;
  }

  rgb(r: number, g: number, b: number): this {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  /** set the current value of extra attribute #i */
  setEx(i: number, a: number, b = 0, c = 0, d = 0): this {
    const e = this.ex[i];
    e[0] = a;
    if (e.length > 1) e[1] = b;
    if (e.length > 2) e[2] = c;
    if (e.length > 3) e[3] = d;
    return this;
  }

  /** add a vertex (world space) with the current colour/extras; returns its index */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    if (this.hook) this.hook(x, y, z);
    const P = this.P,
      N = this.N,
      C = this.C;
    P.reserve(3);
    N.reserve(3);
    C.reserve(3);
    let k = P.n;
    P.a[k] = x;
    P.a[k + 1] = y;
    P.a[k + 2] = z;
    P.n = k + 3;
    k = N.n;
    N.a[k] = nx;
    N.a[k + 1] = ny;
    N.a[k + 2] = nz;
    N.n = k + 3;
    k = C.n;
    C.a[k] = this.r;
    C.a[k + 1] = this.g;
    C.a[k + 2] = this.b;
    C.n = k + 3;
    for (let i = 0; i < this.X.length; i++) {
      const X = this.X[i],
        e = this.ex[i];
      X.reserve(e.length);
      for (let j = 0; j < e.length; j++) X.a[X.n + j] = e[j];
      X.n += e.length;
    }
    return this.vcount++;
  }

  tri(a: number, b: number, c: number): void {
    const I = this.I;
    I.reserve(3);
    I.a[I.n] = a;
    I.a[I.n + 1] = b;
    I.a[I.n + 2] = c;
    I.n += 3;
    this.tcount++;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** overwrite the colour of vertex v */
  setVertColor(v: number, r: number, g: number, b: number): void {
    const a = this.C.a;
    a[v * 3] = r;
    a[v * 3 + 1] = g;
    a[v * 3 + 2] = b;
  }

  /** read back a vertex position (for post-processing passes) */
  getPos(v: number, out: THREE.Vector3): THREE.Vector3 {
    const a = this.P.a;
    return out.set(a[v * 3], a[v * 3 + 1], a[v * 3 + 2]);
  }

  setNormal(v: number, nx: number, ny: number, nz: number): void {
    const a = this.N.a;
    a[v * 3] = nx;
    a[v * 3 + 1] = ny;
    a[v * 3 + 2] = nz;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P.done(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.done(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.done(), 3));
    this.defs.forEach((d, i) => g.setAttribute(d.name, new THREE.BufferAttribute(this.X[i].done(), d.size)));
    const idx = this.I.a.slice(0, this.I.n);
    g.setIndex(new THREE.BufferAttribute(this.vcount > 65535 ? idx : new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ───────────────────────────────────────────────────────────── templates ──

/** Indexed unit mesh (shared vertices) used as a stamp. */
export interface Tpl {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
  vcount: number;
}

export function tplFrom(geo: THREE.BufferGeometry, sphereNormals = false): Tpl {
  let g = geo.clone();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  const pos = g.attributes.position.array as Float32Array;
  const nrm = new Float32Array(g.attributes.normal.array as Float32Array);
  if (sphereNormals) {
    for (let i = 0; i < pos.length; i += 3) {
      const l = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1;
      nrm[i] = pos[i] / l;
      nrm[i + 1] = pos[i + 1] / l;
      nrm[i + 2] = pos[i + 2] / l;
    }
  }
  const idx = new Uint32Array(g.index!.array as ArrayLike<number>);
  return { pos: new Float32Array(pos), nrm, idx, vcount: pos.length / 3 };
}

const _tpls = new Map<string, Tpl>();
/** unit icosphere (radius 1) with `detail` subdivisions: 0 → 20 tris, 1 → 80, 2 → 180, 3 → 320 */
export function icoTpl(detail: number): Tpl {
  const key = `ico${detail}`;
  let t = _tpls.get(key);
  if (!t) {
    t = tplFrom(new THREE.IcosahedronGeometry(1, detail), true);
    _tpls.set(key, t);
  }
  return t;
}

// ───────────────────────────────────────────────────────────────── shaper ──

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Primitive emitter with a current local→world transform.
 * Local convention: +Y up, +Z "front". `frame(x, y, z, yaw)` places a prop like the
 * city convention (a model facing +Z rotated by yaw faces (sin yaw, cos yaw)).
 */
export class Shaper {
  readonly s: GeoSink;
  /** local -> world */
  readonly m = new THREE.Matrix4();
  private readonly e = this.m.elements;
  private readonly nm = new THREE.Matrix3();
  private readonly ne = this.nm.elements;
  private stack: THREE.Matrix4[] = [];

  constructor(sink: GeoSink) {
    this.s = sink;
  }

  /** reset the transform to translate(x,y,z) * rotY(yaw) * scale(sc) */
  frame(x: number, y: number, z: number, yaw = 0, sc = 1): this {
    this.m.makeRotationY(yaw);
    if (sc !== 1) this.m.scale(_s.set(sc, sc, sc));
    this.m.setPosition(x, y, z);
    this.nm.getNormalMatrix(this.m);
    return this;
  }

  /** post-multiply a local transform (translate, Euler rotation, scale) */
  local(tx: number, ty: number, tz: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(tx, ty, tz), _q, _s.set(sx, sy, sz));
    this.m.multiply(_m);
    this.nm.getNormalMatrix(this.m);
    return this;
  }

  push(): this {
    this.stack.push(this.m.clone());
    return this;
  }

  pop(): this {
    const m = this.stack.pop();
    if (m) {
      this.m.copy(m);
      this.nm.getNormalMatrix(this.m);
    }
    return this;
  }

  color(c: THREE.ColorRepresentation): this {
    this.s.color(c);
    return this;
  }

  /** emit a local-space vertex */
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    const e = this.e,
      n = this.ne;
    const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
    let tx = n[0] * nx + n[3] * ny + n[6] * nz;
    let ty = n[1] * nx + n[4] * ny + n[7] * nz;
    let tz = n[2] * nx + n[5] * ny + n[8] * nz;
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    return this.s.vert(wx, wy, wz, tx, ty, tz);
  }

  /** world position of a local point */
  world(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(x, y, z).applyMatrix4(this.m);
  }

  /**
   * Axis-aligned (local) box centred at (cx, cy, cz) with full sizes.
   * faces: bitmask to skip faces: 1 bottom, 2 top, 4 -z, 8 +z, 16 -x, 32 +x
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, skip = 1): this {
    const x0 = cx - sx / 2,
      x1 = cx + sx / 2,
      y0 = cy - sy / 2,
      y1 = cy + sy / 2,
      z0 = cz - sz / 2,
      z1 = cz + sz / 2;
    if (!(skip & 2)) this.face4(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0);
    if (!(skip & 1)) this.face4(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0);
    if (!(skip & 8)) this.face4(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1);
    if (!(skip & 4)) this.face4(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1);
    if (!(skip & 32)) this.face4(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0);
    if (!(skip & 16)) this.face4(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0);
    return this;
  }

  /** box standing on y0 (bottom face skipped) */
  post(cx: number, y0: number, cz: number, sx: number, h: number, sz: number, skip = 1): this {
    return this.box(cx, y0 + h / 2, cz, sx, h, sz, skip);
  }

  /** counter-clockwise quad (seen from the side the normal points to) */
  face4(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
  ): void {
    const a = this.v(ax, ay, az, nx, ny, nz);
    const b = this.v(bx, by, bz, nx, ny, nz);
    const c = this.v(cx, cy, cz, nx, ny, nz);
    const d = this.v(dx, dy, dz, nx, ny, nz);
    this.s.quad(a, b, c, d);
  }

  /** quad from 4 local points with computed flat normal; optionally both sides */
  quad4(p: number[], both = false): this {
    _a.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
    _b.set(p[9] - p[0], p[10] - p[1], p[11] - p[2]);
    _a.cross(_b).normalize();
    this.face4(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], _a.x, _a.y, _a.z);
    if (both) this.face4(p[9], p[10], p[11], p[6], p[7], p[8], p[3], p[4], p[5], p[0], p[1], p[2], -_a.x, -_a.y, -_a.z);
    return this;
  }

  /**
   * Vertical (local Y) cylinder / frustum from y0 to y0+h centred at (cx, cz).
   * caps: 1 bottom, 2 top. smooth: shared side normals.
   */
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, sides: number, caps = 2, smooth = true, rot = 0): this {
    const s = this.s;
    const slope = (r0 - r1) / h;
    const base: number[] = [];
    const top: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const c = Math.cos(a),
        sn = Math.sin(a);
      if (smooth) {
        const l = Math.hypot(1, slope);
        base.push(this.v(cx + c * r0, y0, cz + sn * r0, c / l, slope / l, sn / l));
        top.push(this.v(cx + c * r1, y0 + h, cz + sn * r1, c / l, slope / l, sn / l));
      }
    }
    if (smooth) {
      for (let i = 0; i < sides; i++) s.quad(base[i], top[i], top[i + 1], base[i + 1]);
    } else {
      for (let i = 0; i < sides; i++) {
        const a0 = rot + (i / sides) * Math.PI * 2,
          a1 = rot + ((i + 1) / sides) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        const c0 = Math.cos(a0),
          s0 = Math.sin(a0),
          c1 = Math.cos(a1),
          s1 = Math.sin(a1);
        const nx = Math.cos(am),
          nz = Math.sin(am);
        const l = Math.hypot(1, slope);
        this.face4(cx + c0 * r0, y0, cz + s0 * r0, cx + c0 * r1, y0 + h, cz + s0 * r1, cx + c1 * r1, y0 + h, cz + s1 * r1, cx + c1 * r0, y0, cz + s1 * r0, nx / l, slope / l, nz / l);
      }
    }
    if (caps & 2 && r1 > 1e-4) this.disc(cx, y0 + h, cz, r1, sides, 1, rot);
    if (caps & 1 && r0 > 1e-4) this.disc(cx, y0, cz, r0, sides, -1, rot);
    return this;
  }

  /** horizontal disc (facing +Y when dir = 1, -Y when dir = -1) */
  disc(cx: number, y: number, cz: number, r: number, sides: number, dir = 1, rot = 0): this {
    const c = this.v(cx, y, cz, 0, dir, 0);
    const ring: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      ring.push(this.v(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, dir, 0));
    }
    for (let i = 0; i < sides; i++) {
      const a = ring[i],
        b = ring[(i + 1) % sides];
      if (dir > 0) this.s.tri(c, b, a);
      else this.s.tri(c, a, b);
    }
    return this;
  }

  /** cone with apex up */
  cone(cx: number, y0: number, cz: number, r: number, h: number, sides: number, cap = false, rot = 0): this {
    const s = this.s;
    const l = Math.hypot(h, r);
    const ny = r / l,
      nr = h / l;
    const apex: number[] = [];
    const ring: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const am = rot + ((i + 0.5) / sides) * Math.PI * 2;
      ring.push(this.v(cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r, Math.cos(a) * nr, ny, Math.sin(a) * nr));
      apex.push(this.v(cx, y0 + h, cz, Math.cos(am) * nr, ny, Math.sin(am) * nr));
    }
    for (let i = 0; i < sides; i++) s.tri(ring[i], apex[i], ring[i + 1]);
    if (cap) this.disc(cx, y0, cz, r, sides, -1, rot);
    return this;
  }

  /** ellipsoid from an icosphere template */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, detail = 1): this {
    const t = icoTpl(detail);
    const s = this.s;
    const base = s.vcount;
    for (let i = 0; i < t.vcount; i++) {
      const px = t.pos[i * 3],
        py = t.pos[i * 3 + 1],
        pz = t.pos[i * 3 + 2];
      this.v(cx + px * rx, cy + py * ry, cz + pz * rz, px / rx, py / ry, pz / rz);
    }
    for (let i = 0; i < t.idx.length; i += 3) s.tri(base + t.idx[i], base + t.idx[i + 1], base + t.idx[i + 2]);
    return this;
  }

  /** rectangular bar between two local points (w across horizontally, h "up"-ish) */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number, caps = true): this {
    _a.set(bx - ax, by - ay, bz - az);
    const L = _a.length();
    if (L < 1e-5) return this;
    _a.divideScalar(L);
    // side vector: horizontal perpendicular (or x if vertical)
    _b.crossVectors(_up, _a);
    if (_b.lengthSq() < 1e-6) _b.set(1, 0, 0);
    _b.normalize();
    const n = _p.crossVectors(_a, _b).normalize(); // "up" of the bar
    const hw = w / 2,
      hh = h / 2;
    const corners = (ox: number, oy: number, oz: number): number[] => [
      ox - _b.x * hw - n.x * hh, oy - _b.y * hw - n.y * hh, oz - _b.z * hw - n.z * hh,
      ox + _b.x * hw - n.x * hh, oy + _b.y * hw - n.y * hh, oz + _b.z * hw - n.z * hh,
      ox + _b.x * hw + n.x * hh, oy + _b.y * hw + n.y * hh, oz + _b.z * hw + n.z * hh,
      ox - _b.x * hw + n.x * hh, oy - _b.y * hw + n.y * hh, oz - _b.z * hw + n.z * hh,
    ];
    const A = corners(ax, ay, az),
      B = corners(bx, by, bz);
    const bxv = _b.x, byv = _b.y, bzv = _b.z, nxv = n.x, nyv = n.y, nzv = n.z;
    // 4 sides: bottom(-n), right(+b), top(+n), left(-b)
    const side = (i: number, j: number, nx: number, ny: number, nz: number) =>
      this.face4(A[i * 3], A[i * 3 + 1], A[i * 3 + 2], B[i * 3], B[i * 3 + 1], B[i * 3 + 2], B[j * 3], B[j * 3 + 1], B[j * 3 + 2], A[j * 3], A[j * 3 + 1], A[j * 3 + 2], nx, ny, nz);
    side(1, 0, -nxv, -nyv, -nzv);
    side(2, 1, bxv, byv, bzv);
    side(3, 2, nxv, nyv, nzv);
    side(0, 3, -bxv, -byv, -bzv);
    if (caps) {
      const ax2 = _a.x, ay2 = _a.y, az2 = _a.z;
      this.face4(A[9], A[10], A[11], A[6], A[7], A[8], A[3], A[4], A[5], A[0], A[1], A[2], -ax2, -ay2, -az2);
      this.face4(B[0], B[1], B[2], B[3], B[4], B[5], B[6], B[7], B[8], B[9], B[10], B[11], ax2, ay2, az2);
    }
    return this;
  }

  /** round tube (n sides) between two local points */
  tube(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, sides: number, capEnd = false): this {
    _a.set(bx - ax, by - ay, bz - az);
    const L = _a.length();
    if (L < 1e-5) return this;
    _a.divideScalar(L);
    _b.crossVectors(Math.abs(_a.y) > 0.95 ? _p.set(1, 0, 0) : _up, _a).normalize();
    const c = new THREE.Vector3().crossVectors(_a, _b).normalize();
    const s = this.s;
    const slope = (r0 - r1) / L;
    const ia: number[] = [],
      ib: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const t = (i / sides) * Math.PI * 2;
      const cs = Math.cos(t),
        sn = Math.sin(t);
      const nx = _b.x * cs + c.x * sn,
        ny = _b.y * cs + c.y * sn,
        nz = _b.z * cs + c.z * sn;
      const l = Math.hypot(1, slope);
      const fx = (nx + _a.x * slope) / l,
        fy = (ny + _a.y * slope) / l,
        fz = (nz + _a.z * slope) / l;
      ia.push(this.v(ax + nx * r0, ay + ny * r0, az + nz * r0, fx, fy, fz));
      ib.push(this.v(bx + nx * r1, by + ny * r1, bz + nz * r1, fx, fy, fz));
    }
    for (let i = 0; i < sides; i++) s.quad(ia[i], ia[i + 1], ib[i + 1], ib[i]);
    if (capEnd && r1 > 1e-4) {
      const cv = this.v(bx, by, bz, _a.x, _a.y, _a.z);
      for (let i = 0; i < sides; i++) s.tri(cv, ib[i], ib[i + 1]);
    }
    return this;
  }
}

/** Mesh with a fixed world matrix (static scenery). */
export function staticMesh(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
