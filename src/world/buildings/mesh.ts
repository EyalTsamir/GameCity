// Low-level geometry accumulator for the buildings module.
//
// All buildings are emitted into a handful of Builders (one per material) that
// grow typed arrays directly — no per-part BufferGeometry objects, so ~100k
// parts stay cheap to build. Generators work in a per-building LOCAL frame:
//   x = across the street facade (left -> right seen from the street),
//   z = depth, +z = towards the street (the front), y = up (ground = 0).
// `frame(yaw, x, z)` maps local -> world (rotation about +Y, then translation).

import * as THREE from 'three';

class FBuf {
  a: Float32Array;
  n = 0;
  constructor(cap: number) {
    this.a = new Float32Array(cap);
  }
  grow(extra: number): void {
    if (this.n + extra <= this.a.length) return;
    let c = this.a.length * 2;
    while (c < this.n + extra) c *= 2;
    const b = new Float32Array(c);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
}

export interface BuilderOptions {
  normal?: boolean;
  color?: boolean;
  uv?: boolean;
  /** four vec4 facade attributes aA, aB, aC, aD (aD = wall-quad info, written by wall()) */
  facade?: boolean;
  /** one vec4 light attribute aL */
  light?: boolean;
  /** one generic vec4 attribute aX (current value `X`), e.g. wind sway weights of the greenery */
  aux?: boolean;
}

/** Footprint check hook: called with world coords of every emitted vertex. */
export type VertexCheck = (x: number, y: number, z: number) => void;

export class Builder {
  readonly opts: BuilderOptions;
  private pos = new FBuf(3 * 4096);
  private nrm: FBuf | null;
  private col: FBuf | null;
  private uv: FBuf | null;
  private fa: FBuf | null;
  private fb: FBuf | null;
  private fc: FBuf | null;
  private fd: FBuf | null;
  private fl: FBuf | null;
  private fx: FBuf | null;
  private idx = new Uint32Array(6 * 4096);
  ni = 0;
  nv = 0;

  // local -> world transform
  private cs = 1;
  private sn = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;

  /** current vertex colour (linear) */
  r = 1;
  g = 1;
  b = 1;
  /** current facade attributes */
  readonly A = [0, 0, 0, 0];
  readonly B = [0, 0, 0, 0];
  readonly C = [0, 0, 0, 0];
  /** current aD for non-wall primitives (normally zero = "no wall info") */
  readonly D = [0, 0, 0, 0];
  /**
   * Which ends of the next wall() quads are exposed building corners (bit 0 left, bit 1 right, as
   * seen from outside). The facade shader darkens the wall softly towards them. Default: both.
   */
  cornerMask = 3;
  /** current light attribute */
  readonly L = [0, 0, 0, 0];
  /** current generic attribute (aX) */
  readonly X = [0, 0, 0, 0];

  check: VertexCheck | null = null;
  /** when set, wall() appends one record per window cell it fully contains (see winGeo.ts WIN_REC) */
  winRec: number[] | null = null;

  constructor(opts: BuilderOptions) {
    this.opts = opts;
    this.nrm = opts.normal ? new FBuf(3 * 4096) : null;
    this.col = opts.color ? new FBuf(3 * 4096) : null;
    this.uv = opts.uv ? new FBuf(2 * 4096) : null;
    this.fa = opts.facade ? new FBuf(4 * 4096) : null;
    this.fb = opts.facade ? new FBuf(4 * 4096) : null;
    this.fc = opts.facade ? new FBuf(4 * 4096) : null;
    this.fd = opts.facade ? new FBuf(4 * 4096) : null;
    this.fl = opts.light ? new FBuf(4 * 4096) : null;
    this.fx = opts.aux ? new FBuf(4 * 4096) : null;
  }

  /** Set the local frame: rotation `yaw` about +Y, then translation. */
  frame(yaw: number, x: number, y: number, z: number): void {
    this.cs = Math.cos(yaw);
    this.sn = Math.sin(yaw);
    // snap tiny values so axis-aligned frames stay exact
    if (Math.abs(this.cs) < 1e-12) this.cs = 0;
    if (Math.abs(this.sn) < 1e-12) this.sn = 0;
    this.tx = x;
    this.ty = y;
    this.tz = z;
  }

  /** Save / restore the frame (for sub-frames, e.g. a rotated sign). */
  getFrame(): [number, number, number, number, number] {
    return [this.cs, this.sn, this.tx, this.ty, this.tz];
  }
  setFrame(f: [number, number, number, number, number]): void {
    [this.cs, this.sn, this.tx, this.ty, this.tz] = f;
  }

  /** Local -> world point (x/z only). */
  toWorldX(x: number, z: number): number {
    return this.cs * x + this.sn * z + this.tx;
  }
  toWorldZ(x: number, z: number): number {
    return -this.sn * x + this.cs * z + this.tz;
  }

  setColor(c: THREE.Color): this {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }
  setRGB(r: number, g: number, b: number): this {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  /** Emit one vertex in local coordinates; returns its index. */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u = 0, v = 0): number {
    const wx = this.cs * x + this.sn * z + this.tx;
    const wy = y + this.ty;
    const wz = -this.sn * x + this.cs * z + this.tz;
    if (this.check) this.check(wx, wy, wz);
    const p = this.pos;
    p.grow(3);
    p.a[p.n++] = wx;
    p.a[p.n++] = wy;
    p.a[p.n++] = wz;
    if (this.nrm) {
      const q = this.nrm;
      q.grow(3);
      q.a[q.n++] = this.cs * nx + this.sn * nz;
      q.a[q.n++] = ny;
      q.a[q.n++] = -this.sn * nx + this.cs * nz;
    }
    if (this.col) {
      const q = this.col;
      q.grow(3);
      q.a[q.n++] = this.r;
      q.a[q.n++] = this.g;
      q.a[q.n++] = this.b;
    }
    if (this.uv) {
      const q = this.uv;
      q.grow(2);
      q.a[q.n++] = u;
      q.a[q.n++] = v;
    }
    if (this.fa && this.fb && this.fc && this.fd) {
      push4(this.fa, this.A);
      push4(this.fb, this.B);
      push4(this.fc, this.C);
      push4(this.fd, this.D);
    }
    if (this.fl) push4(this.fl, this.L);
    if (this.fx) push4(this.fx, this.X);
    return this.nv++;
  }

  tri(a: number, b: number, c: number): void {
    if (this.ni + 3 > this.idx.length) this.growIdx(3);
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }

  private growIdx(extra: number): void {
    let c = this.idx.length * 2;
    while (c < this.ni + extra) c *= 2;
    const b = new Uint32Array(c);
    b.set(this.idx.subarray(0, this.ni));
    this.idx = b;
  }

  /**
   * Planar quad a-b-c-d, counter-clockwise seen from the front. The normal is
   * computed from the corners. Optional per-corner uv.
   */
  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    ua = 0, va = 0, ub = 0, vb = 0, uc = 0, vc = 0, ud = 0, vd = 0,
  ): void {
    // normal = (b - a) x (d - a)
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = dx - ax, e2y = dy - ay, e2z = dz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    // degenerate quad: keep a valid unit normal (a zero normal turns into NaN in the shaders)
    if (l < 1e-12) (nx = 0), (ny = 1), (nz = 0);
    else (nx /= l), (ny /= l), (nz /= l);
    const i = this.vertex(ax, ay, az, nx, ny, nz, ua, va);
    this.vertex(bx, by, bz, nx, ny, nz, ub, vb);
    this.vertex(cx, cy, cz, nx, ny, nz, uc, vc);
    this.vertex(dx, dy, dz, nx, ny, nz, ud, vd);
    this.tri(i, i + 1, i + 2);
    this.tri(i, i + 2, i + 3);
  }

  /** Quad oriented so that its normal points away from the reference point (rx,ry,rz). */
  quadAway(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    rx: number, ry: number, rz: number,
  ): void {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = dx - ax, e2y = dy - ay, e2z = dz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const mx = (ax + bx + cx + dx) / 4 - rx,
      my = (ay + by + cy + dy) / 4 - ry,
      mz = (az + bz + cz + dz) / 4 - rz;
    if (nx * mx + ny * my + nz * mz >= 0) this.quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    else this.quad(ax, ay, az, dx, dy, dz, cx, cy, cz, bx, by, bz);
  }

  /**
   * Hexahedron from 8 corners (bottom ring p0..p3, top ring p4..p7, same order).
   * Faces are oriented outward automatically. `skip` bitmask: 1 bottom, 2 top,
   * 4/8/16/32 the side faces (0-1, 1-2, 2-3, 3-0).
   */
  hexa(p: number[][], skip = 0): void {
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const q of p) {
      cx += q[0];
      cy += q[1];
      cz += q[2];
    }
    cx /= 8;
    cy /= 8;
    cz /= 8;
    const f = (i: number, j: number, k: number, l: number) => this.quadAway(p[i][0], p[i][1], p[i][2], p[j][0], p[j][1], p[j][2], p[k][0], p[k][1], p[k][2], p[l][0], p[l][1], p[l][2], cx, cy, cz);
    if (!(skip & 1)) f(0, 1, 2, 3);
    if (!(skip & 2)) f(4, 5, 6, 7);
    if (!(skip & 4)) f(0, 1, 5, 4);
    if (!(skip & 8)) f(1, 2, 6, 5);
    if (!(skip & 16)) f(2, 3, 7, 6);
    if (!(skip & 32)) f(3, 0, 4, 7);
  }

  /**
   * Beam between two points with a square-ish cross section: `w` across (perpendicular
   * to the beam in the horizontal plane, or along x for vertical beams) and `h` along
   * the beam's "up" normal.
   */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number): void {
    let dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L;
    dy /= L;
    dz /= L;
    // side vector: horizontal perpendicular (or x for vertical beams)
    let sxv = -dz,
      szv = dx;
    let sl = Math.hypot(sxv, szv);
    if (sl < 1e-4) {
      sxv = 1;
      szv = 0;
      sl = 1;
    }
    sxv /= sl;
    szv /= sl;
    // up = d x s
    const ux = dy * szv - dz * 0,
      uy = dz * sxv - dx * szv,
      uz = dx * 0 - dy * sxv;
    const hw = w / 2,
      hh = h / 2;
    const P = (px: number, py: number, pz: number, s: number, u: number) => [px + sxv * s * hw + ux * u * hh, py + uy * u * hh, pz + szv * s * hw + uz * u * hh];
    this.hexa([P(ax, ay, az, -1, -1), P(ax, ay, az, 1, -1), P(bx, by, bz, 1, -1), P(bx, by, bz, -1, -1), P(ax, ay, az, -1, 1), P(ax, ay, az, 1, 1), P(bx, by, bz, 1, 1), P(bx, by, bz, -1, 1)]);
  }

  /** Triangle a-b-c (CCW from the front) with optional uv. */
  triangle(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, ua = 0, va = 0, ub = 0, vb = 0, uc = 0, vc = 0): void {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) (nx = 0), (ny = 1), (nz = 0);
    else (nx /= l), (ny /= l), (nz /= l);
    const i = this.vertex(ax, ay, az, nx, ny, nz, ua, va);
    this.vertex(bx, by, bz, nx, ny, nz, ub, vb);
    this.vertex(cx, cy, cz, nx, ny, nz, uc, vc);
    this.tri(i, i + 1, i + 2);
  }

  /**
   * Vertical wall quad from local (x0,z0) to (x1,z1) — p0 on the left, p1 on the
   * right as seen from outside — between heights y0..y1. Outward normal = (-tz, tx).
   * uv: u measured along the wall from `u0` (at p0), v = y; both then mapped by
   * (u - gu)/gw, (v - gv)/gh for window-grid cell coordinates.
   */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, u0 = 0, gu = 0, gw = 1, gv = 0, gh = 1): void {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const ua = (u0 - gu) / gw,
      ub = (u0 + L - gu) / gw;
    const va = (y0 - gv) / gh,
      vb = (y1 - gv) / gh;
    this.quad(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, ua, va, ub, va, ub, vb, ua, vb);
    if (this.winRec && this.B[0] > 0 && this.B[1] > 0 && L > 1e-3) this.recordWindows(x0, z0, x1, z1, L, ua, ub, va, vb, u0, gu, gw, gv, gh);
    const fd = this.fd;
    if (fd) {
      // aD of the 4 vertices just emitted: metres from the left end, length, world top, flags
      const flags = 1 + (this.cornerMask & 1 ? 2 : 0) + (this.cornerMask & 2 ? 4 : 0);
      const top = y1 + this.ty;
      const s = [0, L, L, 0];
      for (let k = 0; k < 4; k++) {
        const o = fd.n - 16 + k * 4;
        fd.a[o] = s[k];
        fd.a[o + 1] = L;
        fd.a[o + 2] = top;
        fd.a[o + 3] = flags;
      }
    }
  }

  /** Window records for the near-LOD sill / surround geometry: windows whose rect lies inside this quad. */
  private recordWindows(x0: number, z0: number, x1: number, z1: number, L: number, ua: number, ub: number, va: number, vb: number, u0: number, gu: number, gw: number, gv: number, gh: number): void {
    const A = this.A;
    const rec = this.winRec!;
    const ldx = (x1 - x0) / L,
      ldz = (z1 - z0) / L;
    // world: along the wall (left → right seen from outside) and the outward normal (-dz, dx)
    const dx = this.cs * ldx + this.sn * ldz,
      dz = -this.sn * ldx + this.cs * ldz;
    const n = this.B[0],
      m = this.B[1];
    const i0 = Math.max(0, Math.ceil(ua - A[0] / gw - 1e-4)),
      i1 = Math.min(n - 1, Math.floor(ub - A[1] / gw + 1e-4));
    const j0 = Math.max(0, Math.ceil(va - A[2] / gh - 1e-4)),
      j1 = Math.min(m - 1, Math.floor(vb - A[3] / gh + 1e-4));
    for (let i = i0; i <= i1; i++) {
      const um = i * gw + gu - u0 + A[0]; // metres from p0 to the window's left edge
      const lx = x0 + ldx * um,
        lz = z0 + ldz * um;
      const wx = this.cs * lx + this.sn * lz + this.tx,
        wz = -this.sn * lx + this.cs * lz + this.tz;
      for (let j = j0; j <= j1; j++) {
        const wy = j * gh + gv + A[2] + this.ty;
        rec.push(wx, wy, wz, dx, dz, A[1] - A[0], A[3] - A[2], A[2], this.B[2], this.B[3], this.C[2], this.r, this.g, this.b, i, j);
      }
    }
  }

  /** Horizontal rectangle at height y facing up (or down). uv = local x/z in metres (+offset). */
  hrect(x0: number, z0: number, x1: number, z1: number, y: number, up = true): void {
    if (up) this.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, x0, z1, x1, z1, x1, z0, x0, z0);
    else this.quad(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1, x0, z0, x1, z0, x1, z1, x0, z1);
  }

  /**
   * Axis-aligned box in the local frame. `faces` bitmask: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z.
   * Default: all but the bottom.
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, faces = 0b110111): void {
    if (faces & 16) this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1); // +z
    if (faces & 32) this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0); // -z
    if (faces & 1) this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1); // +x
    if (faces & 2) this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0); // -x
    if (faces & 4) this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0); // +y
    if (faces & 8) this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1); // -y
  }

  /** Box given by centre (x,z), size and vertical extent, rotated by `a` within the local frame. */
  boxRot(cx: number, cz: number, w: number, d: number, y0: number, y1: number, a: number, faces = 0b110111): void {
    const saved = this.getFrame();
    const [cs, sn, tx, ty, tz] = saved;
    // compose: world = R(frame) * (R(a) * p + c) + t
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const ncs = cs * ca - sn * sa;
    const nsn = sn * ca + cs * sa;
    const wx = cs * cx + sn * cz + tx;
    const wz = -sn * cx + cs * cz + tz;
    this.cs = ncs;
    this.sn = nsn;
    this.tx = wx;
    this.tz = wz;
    this.ty = ty;
    this.box(-w / 2, y0, -d / 2, w / 2, y1, d / 2, faces);
    this.setFrame(saved);
  }

  /** Vertical cylinder / prism (n sides) between y0..y1, optional top cap. */
  cylinder(cx: number, cz: number, r: number, y0: number, y1: number, n = 8, top = true, r1 = r): void {
    const base = this.nv;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a),
        s = Math.sin(a);
      this.vertex(cx + c * r, y0, cz + s * r, c, 0, s);
      this.vertex(cx + c * r1, y1, cz + s * r1, c, 0, s);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      // CCW from outside: (bottom i, top i, top i+1) etc. — vertices ordered with increasing angle (x->z),
      // which is clockwise seen from above; so outward faces need (a, a+1, a+3)
      this.tri(a, a + 1, a + 3);
      this.tri(a, a + 3, a + 2);
    }
    if (top && r1 > 0) {
      const c0 = this.vertex(cx, y1, cz, 0, 1, 0);
      const ring = this.nv;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.vertex(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0);
      }
      for (let i = 0; i < n; i++) this.tri(c0, ring + i + 1, ring + i);
    }
  }

  /** Cone / pyramid tip from a ring (radius r at y0) to apex at y1. */
  cone(cx: number, cz: number, r: number, y0: number, y1: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      this.triangle(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r, cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r, cx, y1, cz);
    }
  }

  /** Low-poly sphere (lat/long). */
  sphere(cx: number, cy: number, cz: number, r: number, nLon = 8, nLat = 5): void {
    const base = this.nv;
    for (let j = 0; j <= nLat; j++) {
      const t = (j / nLat) * Math.PI;
      const y = Math.cos(t),
        sr = Math.sin(t);
      for (let i = 0; i <= nLon; i++) {
        const a = (i / nLon) * Math.PI * 2;
        const x = Math.cos(a) * sr,
          z = Math.sin(a) * sr;
        this.vertex(cx + x * r, cy + y * r, cz + z * r, x, y, z);
      }
    }
    const row = nLon + 1;
    for (let j = 0; j < nLat; j++) {
      for (let i = 0; i < nLon; i++) {
        const a = base + j * row + i;
        const b2 = a + row;
        this.tri(a, a + 1, b2 + 1);
        this.tri(a, b2 + 1, b2);
      }
    }
  }

  get vertexCount(): number {
    return this.nv;
  }
  get triangleCount(): number {
    return this.ni / 3;
  }

  /** Build the final BufferGeometry (copies to exact-size arrays). */
  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.a.slice(0, this.pos.n), 3));
    if (this.nrm) g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.a.slice(0, this.nrm.n), 3));
    if (this.col) g.setAttribute('color', new THREE.BufferAttribute(this.col.a.slice(0, this.col.n), 3));
    if (this.uv) g.setAttribute('uv', new THREE.BufferAttribute(this.uv.a.slice(0, this.uv.n), 2));
    if (this.fa && this.fb && this.fc && this.fd) {
      g.setAttribute('aA', new THREE.BufferAttribute(this.fa.a.slice(0, this.fa.n), 4));
      g.setAttribute('aB', new THREE.BufferAttribute(this.fb.a.slice(0, this.fb.n), 4));
      g.setAttribute('aC', new THREE.BufferAttribute(this.fc.a.slice(0, this.fc.n), 4));
      g.setAttribute('aD', new THREE.BufferAttribute(this.fd.a.slice(0, this.fd.n), 4));
    }
    if (this.fl) g.setAttribute('aL', new THREE.BufferAttribute(this.fl.a.slice(0, this.fl.n), 4));
    if (this.fx) g.setAttribute('aX', new THREE.BufferAttribute(this.fx.a.slice(0, this.fx.n), 4));
    const index = this.nv > 65535 ? this.idx.slice(0, this.ni) : Uint16Array.from(this.idx.subarray(0, this.ni));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Release the growable buffers (after toGeometry). */
  dispose(): void {
    this.pos = new FBuf(3);
    this.idx = new Uint32Array(3);
    this.nrm = this.nrm ? new FBuf(3) : null;
    this.col = this.col ? new FBuf(3) : null;
    this.uv = this.uv ? new FBuf(2) : null;
    this.fa = this.fa ? new FBuf(4) : null;
    this.fb = this.fb ? new FBuf(4) : null;
    this.fc = this.fc ? new FBuf(4) : null;
    this.fd = this.fd ? new FBuf(4) : null;
    this.fl = this.fl ? new FBuf(4) : null;
    this.fx = this.fx ? new FBuf(4) : null;
    this.nv = 0;
    this.ni = 0;
  }
}

function push4(buf: FBuf, v: number[]): void {
  buf.grow(4);
  buf.a[buf.n++] = v[0];
  buf.a[buf.n++] = v[1];
  buf.a[buf.n++] = v[2];
  buf.a[buf.n++] = v[3];
}
