// Geometry of hand-sized things, written into one mesh per bubble cell. A wall frame (u along the wall, y up, o out of it);
// everything has softened edges and smooth curves, because that is what catches the light on a real fitting at one metre.
// A vertex: position, a normal in bytes, sRGB in bytes and one byte for the surface (see `rough`, `metal`, `lamp`).

import * as THREE from 'three';

export const enum Surface {
  /** alpha = 0..0.48: not a metal, roughness 0..1 */
  Dielectric = 0,
  /** alpha = 0.5..0.98: metal, roughness 0..1 */
  Metal = 1,
}

const TAU = Math.PI * 2;

export class HandSink {
  private pos = new Float32Array(3 * 8192);
  private nor = new Int8Array(4 * 8192);
  private col = new Uint8Array(4 * 8192);
  private idx = new Uint32Array(3 * 16384);
  private nv = 0;
  private ni = 0;

  // the current wall frame
  private ox = 0;
  private oz = 0;
  private oy = 0;
  private tx = 1;
  private tz = 0;
  private nx = 0;
  private nz = 1;
  /** the frame is mirrored: triangles wind the other way */
  private flip = false;

  private r = 200;
  private g = 200;
  private b = 200;
  private a = 100;

  begin(): void {
    this.nv = 0;
    this.ni = 0;
  }

  frame(x: number, y: number, z: number, tx: number, tz: number, nx: number, nz: number): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.tx = tx;
    this.tz = tz;
    this.nx = nx;
    this.nz = nz;
    // t × up should be n
    this.flip = -tz * nx + tx * nz < 0;
    return this;
  }

  /** paint; `k` scales it (a shade of the same colour) */
  ink(hex: number, k = 1): this {
    this.r = Math.min(255, ((hex >> 16) & 255) * k);
    this.g = Math.min(255, ((hex >> 8) & 255) * k);
    this.b = Math.min(255, (hex & 255) * k);
    return this;
  }

  /** a paint, plastic or stone of this roughness */
  rough(r: number): this {
    this.a = Math.round(r * 0.48 * 255);
    return this;
  }

  /** a metal of this roughness */
  metal(r: number): this {
    this.a = Math.round((0.5 + r * 0.48) * 255);
    return this;
  }

  /** a lamp's glass: reflects by day, glows after dark */
  lamp(): this {
    this.a = 255;
    return this;
  }

  private reserve(v: number, i: number): void {
    if (this.nv + v > this.pos.length / 3) {
      const cap = Math.max(this.pos.length / 3, this.nv + v) * 2;
      const p = new Float32Array(cap * 3);
      p.set(this.pos);
      this.pos = p;
      const n = new Int8Array(cap * 4);
      n.set(this.nor);
      this.nor = n;
      const c = new Uint8Array(cap * 4);
      c.set(this.col);
      this.col = c;
    }
    if (this.ni + i > this.idx.length) {
      const q = new Uint32Array(Math.max(this.idx.length, this.ni + i) * 2);
      q.set(this.idx);
      this.idx = q;
    }
  }

  /** a vertex from wall coordinates and a normal in the same frame */
  private v(u: number, y: number, o: number, nu: number, ny: number, no: number, k = 1): number {
    const i = this.nv++;
    const p = this.pos,
      n = this.nor,
      c = this.col;
    p[i * 3] = this.ox + this.tx * u + this.nx * o;
    p[i * 3 + 1] = this.oy + y;
    p[i * 3 + 2] = this.oz + this.tz * u + this.nz * o;
    n[i * 4] = (this.tx * nu + this.nx * no) * 127;
    n[i * 4 + 1] = ny * 127;
    n[i * 4 + 2] = (this.tz * nu + this.nz * no) * 127;
    n[i * 4 + 3] = 0;
    c[i * 4] = Math.min(255, this.r * k);
    c[i * 4 + 1] = Math.min(255, this.g * k);
    c[i * 4 + 2] = Math.min(255, this.b * k);
    c[i * 4 + 3] = this.a;
    return i;
  }

  private tri(a: number, b: number, c: number): void {
    const q = this.idx;
    q[this.ni++] = a;
    if (this.flip) {
      q[this.ni++] = c;
      q[this.ni++] = b;
    } else {
      q[this.ni++] = b;
      q[this.ni++] = c;
    }
  }

  private fan4(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** a flat rectangle on a plane o, facing out; lighter or darker at the top with `grad` */
  plate(u0: number, u1: number, y0: number, y1: number, o: number, grad = 1): this {
    this.reserve(4, 6);
    const a = this.v(u0, y0, o, 0, 0, 1),
      b = this.v(u1, y0, o, 0, 0, 1),
      c = this.v(u1, y1, o, 0, 0, 1, grad),
      d = this.v(u0, y1, o, 0, 0, 1, grad);
    this.fan4(a, b, c, d);
    return this;
  }

  /** a flat rectangle lying on a level y, facing up: (u0..u1) × (o0..o1) */
  floor(u0: number, u1: number, o0: number, o1: number, y: number): this {
    this.reserve(4, 6);
    const a = this.v(u0, y, o1, 0, 1, 0),
      b = this.v(u1, y, o1, 0, 1, 0),
      c = this.v(u1, y, o0, 0, 1, 0),
      d = this.v(u0, y, o0, 0, 1, 0);
    this.fan4(a, b, c, d);
    return this;
  }

  /** a free quad (wall coordinates; counter-clockwise seen from outside) with its own flat normal */
  quad(a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]): this {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = d[0] - a[0],
      vy = d[1] - a[1],
      vz = d[2] - a[2];
    // (u, y, o) is right-handed as (t, up, n)
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this.reserve(4, 6);
    const i = this.v(a[0], a[1], a[2], nx, ny, nz),
      j = this.v(b[0], b[1], b[2], nx, ny, nz),
      k = this.v(c[0], c[1], c[2], nx, ny, nz),
      m = this.v(d[0], d[1], d[2], nx, ny, nz);
    this.fan4(i, j, k, m);
    return this;
  }

  /** a box on the wall with softened edges of `b` metres: the corners take a mean normal, so an edge catches the light. Back left open. */
  box(u0: number, u1: number, y0: number, y1: number, o0: number, o1: number, b = 0.002): this {
    b = Math.min(b, (u1 - u0) * 0.45, (y1 - y0) * 0.45, (o1 - o0) * 0.9);
    this.reserve(40, 90);
    const S = 0.7071;
    const vtx = (u: number, y: number, o: number, nu: number, ny: number, no: number) => this.v(u, y, o, nu, ny, no);
    const front = [vtx(u0 + b, y0 + b, o1, 0, 0, 1), vtx(u1 - b, y0 + b, o1, 0, 0, 1), vtx(u1 - b, y1 - b, o1, 0, 0, 1), vtx(u0 + b, y1 - b, o1, 0, 0, 1)];
    this.fan4(front[0], front[1], front[2], front[3]);
    // the four sides and the bevels into the front
    const rim = (au: number, ay: number, bu: number, by: number, nu: number, ny: number, fa: number, fb: number) => {
      const a0 = vtx(au, ay, o0, nu, ny, 0),
        b0 = vtx(bu, by, o0, nu, ny, 0),
        a1 = vtx(au, ay, o1 - b, nu, ny, 0),
        b1 = vtx(bu, by, o1 - b, nu, ny, 0);
      this.fan4(a0, b0, b1, a1);
      const a2 = vtx(au, ay, o1 - b, nu * S, ny * S, S),
        b2 = vtx(bu, by, o1 - b, nu * S, ny * S, S);
      const f0 = vtx(this.fu(front, fa), this.fy(front, fa), o1, nu * S, ny * S, S),
        f1 = vtx(this.fu(front, fb), this.fy(front, fb), o1, nu * S, ny * S, S);
      this.fan4(a2, b2, f1, f0);
    };
    this.fcorners[0] = u0 + b;
    this.fcorners[1] = y0 + b;
    this.fcorners[2] = u1 - b;
    this.fcorners[3] = y0 + b;
    this.fcorners[4] = u1 - b;
    this.fcorners[5] = y1 - b;
    this.fcorners[6] = u0 + b;
    this.fcorners[7] = y1 - b;
    rim(u0, y0, u1, y0, 0, -1, 0, 1);
    rim(u1, y0, u1, y1, 1, 0, 1, 2);
    rim(u1, y1, u0, y1, 0, 1, 2, 3);
    rim(u0, y1, u0, y0, -1, 0, 3, 0);
    return this;
  }
  private fcorners = new Float32Array(8);
  private fu(_f: number[], k: number): number {
    return this.fcorners[k * 2];
  }
  private fy(_f: number[], k: number): number {
    return this.fcorners[k * 2 + 1];
  }

  /** a short round thing with its axis out of the wall (a rose, a button, a screw): rim, a bevel, a face; `dome` raises the face's middle */
  disc(u: number, y: number, o0: number, o1: number, r: number, seg = 12, bevel = 0.2, dome = 0): this {
    this.reserve(seg * 3 + 1, seg * 12);
    const b = r * bevel;
    const base = this.nv;
    const S = 0.7071;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU,
        c = Math.cos(a),
        s = Math.sin(a);
      this.v(u + c * r, y + s * r, o0, c, s, 0);
      this.v(u + c * r, y + s * r, o1 - b, c * S, s * S, S);
      this.v(u + c * (r - b), y + s * (r - b), o1, c * 0.3, s * 0.3, 0.95);
    }
    const mid = this.v(u, y, o1 + dome, 0, 0, 1);
    for (let k = 0; k < seg; k++) {
      const a = base + k * 3,
        n = base + ((k + 1) % seg) * 3;
      this.fan4(a, n, n + 1, a + 1);
      this.fan4(a + 1, n + 1, n + 2, a + 2);
      this.tri(a + 2, n + 2, mid);
    }
    return this;
  }

  /** a round tube along any path in wall coordinates, with its ends closed; radius and shade may taper with `r1` */
  tube(path: number[], r: number, seg = 8, r1 = r): this {
    const n = path.length / 3;
    this.reserve((n + 2) * seg + 2, n * seg * 6 + seg * 6);
    const base = this.nv;
    // a frame that travels along the path
    let sx = 0,
      sy = 0,
      sz = 1;
    const tmp = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1),
        b = Math.min(n - 1, i + 1);
      let dx = path[b * 3] - path[a * 3],
        dy = path[b * 3 + 1] - path[a * 3 + 1],
        dz = path[b * 3 + 2] - path[a * 3 + 2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      // side = up-ish × direction, kept close to the last one
      const d = sx * dx + sy * dy + sz * dz;
      sx -= dx * d;
      sy -= dy * d;
      sz -= dz * d;
      let sl = Math.hypot(sx, sy, sz);
      if (sl < 0.01) {
        tmp[0] = Math.abs(dy) > 0.9 ? 1 : 0;
        tmp[1] = Math.abs(dy) > 0.9 ? 0 : 1;
        tmp[2] = 0;
        sx = tmp[1] * dz - tmp[2] * dy;
        sy = tmp[2] * dx - tmp[0] * dz;
        sz = tmp[0] * dy - tmp[1] * dx;
        sl = Math.hypot(sx, sy, sz);
      }
      sx /= sl;
      sy /= sl;
      sz /= sl;
      const ux = dy * sz - dz * sy,
        uy = dz * sx - dx * sz,
        uz = dx * sy - dy * sx;
      const rr = r + (r1 - r) * (n > 1 ? i / (n - 1) : 0);
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * TAU,
          c = Math.cos(t),
          s = Math.sin(t);
        const nu = sx * c + ux * s,
          ny = sy * c + uy * s,
          no = sz * c + uz * s;
        this.v(path[i * 3] + nu * rr, path[i * 3 + 1] + ny * rr, path[i * 3 + 2] + no * rr, nu, ny, no);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        const a = base + i * seg + k,
          b = base + i * seg + k1,
          c = base + (i + 1) * seg + k1,
          d = base + (i + 1) * seg + k;
        // (side, up, direction) is right-handed: going round k is counter-clockwise seen from the far end
        this.fan4(a, b, c, d);
      }
    }
    // caps
    for (const [i, sign] of [[0, -1], [n - 1, 1]] as const) {
      const a = Math.max(0, i - 1),
        b = Math.min(n - 1, i + 1);
      let dx = path[b * 3] - path[a * 3],
        dy = path[b * 3 + 1] - path[a * 3 + 1],
        dz = path[b * 3 + 2] - path[a * 3 + 2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx = (dx / l) * sign;
      dy = (dy / l) * sign;
      dz = (dz / l) * sign;
      const m = this.v(path[i * 3], path[i * 3 + 1], path[i * 3 + 2], dx, dy, dz);
      const ring = base + i * seg;
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        if (sign > 0) this.tri(ring + k, ring + k1, m);
        else this.tri(ring + k1, ring + k, m);
      }
    }
    return this;
  }

  /** a ball */
  ball(u: number, y: number, o: number, r: number, seg = 10, squash = 1): this {
    const rows = Math.max(3, seg >> 1);
    this.reserve((rows + 1) * seg, rows * seg * 6);
    const base = this.nv;
    for (let j = 0; j <= rows; j++) {
      const p = (j / rows) * Math.PI,
        sp = Math.sin(p),
        cp = Math.cos(p);
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * TAU;
        const nu = Math.cos(t) * sp,
          no = Math.sin(t) * sp;
        this.v(u + nu * r, y + cp * r, o + no * r * squash, nu, cp, no);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        const a = base + j * seg + k,
          b = base + j * seg + k1,
          c = base + (j + 1) * seg + k1,
          d = base + (j + 1) * seg + k;
        this.fan4(a, b, c, d);
      }
    }
    return this;
  }

  /** a pane that is brighter in the middle: something lit, or a bulb, behind glass */
  glow(u0: number, u1: number, y0: number, y1: number, o: number, edge = 0.72): this {
    this.reserve(5, 12);
    const a = this.v(u0, y0, o, 0, 0, 1, edge),
      b = this.v(u1, y0, o, 0, 0, 1, edge),
      c = this.v(u1, y1, o, 0, 0, 1, edge),
      d = this.v(u0, y1, o, 0, 0, 1, edge),
      m = this.v((u0 + u1) / 2, (y0 + y1) / 2, o, 0, 0, 1);
    this.tri(a, b, m);
    this.tri(b, c, m);
    this.tri(c, d, m);
    this.tri(d, a, m);
    return this;
  }

  /** a stain: this ink in the middle, nothing at the rim of an ellipse */
  soft(u: number, y: number, o: number, ru: number, ry: number, seg = 10): this {
    this.reserve(seg + 1, seg * 3);
    const base = this.nv;
    const m = this.v(u, y, o, 0, 0, 1);
    const r = this.r,
      g = this.g,
      b = this.b;
    this.r = this.g = this.b = 255;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      this.v(u + Math.cos(a) * ru, y + Math.sin(a) * ry, o, 0, 0, 1);
    }
    this.r = r;
    this.g = g;
    this.b = b;
    for (let k = 0; k < seg; k++) this.tri(base + 1 + k, base + 1 + ((k + 1) % seg), m);
    return this;
  }

  /** a run down the wall: this ink along the middle at the top, gone at the sides and the foot */
  streak(u0: number, u1: number, y0: number, y1: number, o: number): this {
    this.reserve(5, 9);
    const mu = (u0 + u1) / 2;
    const c = this.v(mu, y1, o, 0, 0, 1);
    const r = this.r,
      g = this.g,
      b = this.b;
    this.r = this.g = this.b = 255;
    const a0 = this.v(u0, y1, o, 0, 0, 1),
      a1 = this.v(u1, y1, o, 0, 0, 1),
      f = this.v(mu, y0, o, 0, 0, 1),
      l = this.v(mu - (mu - u0) * 0.35, y0 + (y1 - y0) * 0.4, o, 0, 0, 1),
      q = this.v(mu + (mu - u0) * 0.35, y0 + (y1 - y0) * 0.4, o, 0, 0, 1);
    this.r = r;
    this.g = g;
    this.b = b;
    this.tri(a0, l, c);
    this.tri(l, f, c);
    this.tri(f, q, c);
    this.tri(q, a1, c);
    return this;
  }

  /** what was written since begin(), as a geometry; null when nothing was */
  finish(): THREE.BufferGeometry | null {
    if (this.ni === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, this.nv * 4), 4, true));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.nv * 4), 4, true));
    const small = this.nv < 65536;
    g.setIndex(new THREE.BufferAttribute(small ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni), 1));
    return g;
  }
}

/** a geometry with the attributes of a built cell, for the shader compile at boot */
export function handStandIn(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(12), 4, true));
  g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(12), 4, true));
  return g;
}
