// Tiny geometry accumulator: positions + normals + vertex colours + optional extra
// attributes, merged into ONE BufferGeometry (one draw call per material).

import * as THREE from 'three';

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private extras: { name: string; size: number; data: number[]; cur: number[] }[] = [];
  private cr = 1;
  private cg = 1;
  private cb = 1;
  count = 0;

  constructor(extra: Record<string, number> = {}) {
    for (const [name, size] of Object.entries(extra)) this.extras.push({ name, size, data: [], cur: new Array(size).fill(0) });
  }

  color(c: THREE.Color | string | number): this {
    const k = c instanceof THREE.Color ? c : _c.set(c);
    this.cr = k.r;
    this.cg = k.g;
    this.cb = k.b;
    return this;
  }

  rgb(r: number, g: number, b: number): this {
    this.cr = r;
    this.cg = g;
    this.cb = b;
    return this;
  }

  /** set the current value of an extra attribute (applies to vertices added afterwards) */
  set(name: string, ...v: number[]): this {
    const e = this.extras.find((q) => q.name === name);
    if (!e) throw new Error(`GeoBuilder: unknown attribute ${name}`);
    for (let i = 0; i < e.size; i++) e.cur[i] = v[i] ?? 0;
    return this;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(this.cr, this.cg, this.cb);
    for (const e of this.extras) for (let i = 0; i < e.size; i++) e.data.push(e.cur[i]);
    return this.count++;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** flat quad p0..p3 counter-clockwise seen from the front */
  quad(p0: V3, p1: V3, p2: V3, p3: V3): void {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-12) {
      _a.set(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
      _b.set(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]);
      _n.crossVectors(_a, _b);
    }
    _n.normalize();
    const i0 = this.vertex(p0[0], p0[1], p0[2], _n.x, _n.y, _n.z);
    const i1 = this.vertex(p1[0], p1[1], p1[2], _n.x, _n.y, _n.z);
    const i2 = this.vertex(p2[0], p2[1], p2[2], _n.x, _n.y, _n.z);
    const i3 = this.vertex(p3[0], p3[1], p3[2], _n.x, _n.y, _n.z);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  /** quad whose winding is chosen so its normal points along (nx, ny, nz) */
  quadFacing(p0: V3, p1: V3, p2: V3, p3: V3, nx: number, ny: number, nz: number): void {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    _n.crossVectors(_a, _b);
    if (_n.x * nx + _n.y * ny + _n.z * nz < 0) this.quad(p3, p2, p1, p0);
    else this.quad(p0, p1, p2, p3);
  }

  /** quad with per-vertex colours, winding chosen so the normal points along (nx, ny, nz) */
  quad4(p: [V3, V3, V3, V3], c: [THREE.Color, THREE.Color, THREE.Color, THREE.Color], nx: number, ny: number, nz: number): void {
    _a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    _b.set(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
    _n.crossVectors(_a, _b);
    const flip = _n.x * nx + _n.y * ny + _n.z * nz < 0;
    _n.normalize();
    if (flip) _n.negate();
    const order = flip ? [3, 2, 1, 0] : [0, 1, 2, 3];
    const save = [this.cr, this.cg, this.cb];
    const ids = order.map((k) => {
      this.cr = c[k].r;
      this.cg = c[k].g;
      this.cb = c[k].b;
      return this.vertex(p[k][0], p[k][1], p[k][2], _n.x, _n.y, _n.z);
    });
    [this.cr, this.cg, this.cb] = save;
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }

  /** planar polygon (any simple outline, 3D points + its 2D projection) facing (nx, ny, nz) */
  polygonFacing(pts3: V3[], pts2: [number, number][], nx: number, ny: number, nz: number): void {
    const v2 = pts2.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(v2, []);
    const base = this.count;
    for (const p of pts3) this.vertex(p[0], p[1], p[2], nx, ny, nz);
    for (const [a, b, c] of tris) {
      const A = pts3[a],
        B = pts3[b],
        C = pts3[c];
      _a.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      _b.set(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
      _n.crossVectors(_a, _b);
      if (_n.x * nx + _n.y * ny + _n.z * nz < 0) this.idx.push(base + a, base + c, base + b);
      else this.idx.push(base + a, base + b, base + c);
    }
  }

  /** flat triangle (counter-clockwise from the front) */
  triangle(p0: V3, p1: V3, p2: V3): void {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    _n.crossVectors(_a, _b).normalize();
    const i0 = this.vertex(p0[0], p0[1], p0[2], _n.x, _n.y, _n.z);
    const i1 = this.vertex(p1[0], p1[1], p1[2], _n.x, _n.y, _n.z);
    const i2 = this.vertex(p2[0], p2[1], p2[2], _n.x, _n.y, _n.z);
    this.idx.push(i0, i1, i2);
  }

  /**
   * Oriented box: centre (cx, cy, cz), half extents (hx, hy, hz) in its local frame, rotated by
   * `yaw` about +Y (local +Z faces (sin yaw, cos yaw)). `skip` bitmask: 1=-x 2=+x 4=-y 8=+y 16=-z 32=+z.
   */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0, skip = 0): void {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const P = (lx: number, ly: number, lz: number): V3 => [cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c];
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
    if (!(skip & 32)) this.quad(v[4], v[5], v[6], v[7]); // +z
    if (!(skip & 16)) this.quad(v[1], v[0], v[3], v[2]); // -z
    if (!(skip & 2)) this.quad(v[5], v[1], v[2], v[6]); // +x
    if (!(skip & 1)) this.quad(v[0], v[4], v[7], v[3]); // -x
    if (!(skip & 8)) this.quad(v[7], v[6], v[2], v[3]); // +y
    if (!(skip & 4)) this.quad(v[0], v[1], v[5], v[4]); // -y
  }

  /** Box between two points on the ground plane (a beam/rail), with cross-section w x h centred at heights y. */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number): void {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return;
    // local frame: t along, side = horizontal perpendicular, up = t x side
    // right-handed frame (s, t, u): t along the beam, s horizontal side, u = s x t (up-ish)
    const tx = dx / L,
      ty = dy / L,
      tz = dz / L;
    let sx = -tz,
      sz = tx;
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-6) {
      sx = 1;
      sz = 0;
    } else {
      sx /= sl;
      sz /= sl;
    }
    const ux = 0 * tz - sz * ty,
      uy = sz * tx - sx * tz,
      uz = sx * ty - 0 * tx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const hw = w / 2,
      hh = h / 2;
    const corner = (t: number, cs: number, cu: number): V3 => [
      ax + dx * t + sx * cs * hw + (ux / ul) * cu * hh,
      ay + dy * t + (uy / ul) * cu * hh,
      az + dz * t + sz * cs * hw + (uz / ul) * cu * hh,
    ];
    const a0 = corner(0, -1, -1),
      a1 = corner(0, 1, -1),
      a2 = corner(0, 1, 1),
      a3 = corner(0, -1, 1);
    const b0 = corner(1, -1, -1),
      b1 = corner(1, 1, -1),
      b2 = corner(1, 1, 1),
      b3 = corner(1, -1, 1);
    this.quad(a0, b0, b1, a1); // -u
    this.quad(a1, b1, b2, a2); // +s
    this.quad(a2, b2, b3, a3); // +u
    this.quad(a3, b3, b0, a0); // -s
    this.quad(a0, a1, a2, a3); // start cap (-t)
    this.quad(b3, b2, b1, b0); // end cap (+t)
  }

  /** append an existing (indexed or not) geometry transformed by `m`, using current colour/extras */
  geometry(g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    let n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!n) {
      g.computeVertexNormals();
      n = g.getAttribute('normal') as THREE.BufferAttribute;
    }
    _m3.getNormalMatrix(m);
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      _a.fromBufferAttribute(p, i).applyMatrix4(m);
      _b.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize();
      this.vertex(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
    }
    if (g.index) {
      const ix = g.index;
      for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
  }

  get triangles(): number {
    return this.idx.length / 3;
  }

  build(withColor = true): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const e of this.extras) g.setAttribute(e.name, new THREE.Float32BufferAttribute(e.data, e.size));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export type V3 = [number, number, number];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _c = new THREE.Color();
