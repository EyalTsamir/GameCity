// Small mesh kit for the room atlas (buildingrooms/atlas.ts): everything is seen from straight ahead (+z looks at the viewer) by an
// orthographic camera, once, at boot. So a shape only needs the half that faces the viewer, and all of it goes into one vertex array.

export type Col = readonly [number, number, number];

/** a colour from sRGB bytes written as 0xrrggbb, to linear */
export function hex(h: number): Col {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f((h >> 16) & 255), f((h >> 8) & 255), f(h & 255)];
}
export function shade(c: Col, k: number): Col {
  return [c[0] * k, c[1] * k, c[2] * k];
}
export function mixc(a: Col, b: Col, k: number): Col {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** a small repeatable random stream */
export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Kit {
  a = new Float32Array(1 << 16);
  n = 0;

  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Col): void {
    if (this.n + 9 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    const a = this.a;
    let n = this.n;
    a[n++] = x;
    a[n++] = y;
    a[n++] = z;
    a[n++] = nx;
    a[n++] = ny;
    a[n++] = nz;
    a[n++] = c[0];
    a[n++] = c[1];
    a[n++] = c[2];
    this.n = n;
  }

  private quad(p: number[], n0: number[], n1: number[], n2: number[], n3: number[], c: Col): void {
    const V = (i: number, m: number[]) => this.v(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], m[0], m[1], m[2], c);
    V(0, n0);
    V(1, n1);
    V(2, n2);
    V(0, n0);
    V(2, n2);
    V(3, n3);
  }

  /** a flat rectangle facing the viewer at depth z */
  rect(x0: number, y0: number, x1: number, y1: number, z: number, c: Col): void {
    const n = [0, 0, 1];
    this.quad([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], n, n, n, n, c);
  }

  /** a box from the wall out: front, and its sloped-in edges so a box catches light on its arrises */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, bevel = 0.006): void {
    const b = Math.min(bevel, (x1 - x0) * 0.3, (y1 - y0) * 0.3);
    const n = [0, 0, 1];
    this.quad([x0 + b, y0 + b, z1, x1 - b, y0 + b, z1, x1 - b, y1 - b, z1, x0 + b, y1 - b, z1], n, n, n, n, c);
    if (b <= 0) return;
    const zb = z1 - b;
    const nT = [0, 0.7, 0.7],
      nB = [0, -0.7, 0.7],
      nL = [-0.7, 0, 0.7],
      nR = [0.7, 0, 0.7];
    this.quad([x0 + b, y1 - b, z1, x1 - b, y1 - b, z1, x1, y1, zb, x0, y1, zb], nT, nT, nT, nT, c);
    this.quad([x0, y0, zb, x1, y0, zb, x1 - b, y0 + b, z1, x0 + b, y0 + b, z1], nB, nB, nB, nB, c);
    this.quad([x0, y0, zb, x0 + b, y0 + b, z1, x0 + b, y1 - b, z1, x0, y1, zb], nL, nL, nL, nL, c);
    this.quad([x1 - b, y0 + b, z1, x1, y0, zb, x1, y1, zb, x1 - b, y1 - b, z1], nR, nR, nR, nR, c);
  }

  /** a body of revolution about a vertical axis (x, z): profile [r, y] from bottom to top, the half facing the viewer */
  lathe(x: number, z: number, profile: readonly (readonly [number, number])[], c: Col, seg = 7): void {
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i];
      const [r1, y1] = profile[i + 1];
      const sl = (r0 - r1) / Math.max(1e-4, Math.hypot(r0 - r1, y1 - y0));
      const cy = Math.sqrt(Math.max(0, 1 - sl * sl));
      for (let s = 0; s < seg; s++) {
        const a0 = -Math.PI / 2 + (Math.PI * s) / seg,
          a1 = -Math.PI / 2 + (Math.PI * (s + 1)) / seg;
        const s0 = Math.sin(a0),
          c0 = Math.cos(a0),
          s1 = Math.sin(a1),
          c1 = Math.cos(a1);
        const n0 = [s0 * cy, sl, c0 * cy],
          n1 = [s1 * cy, sl, c1 * cy];
        this.quad([x + s0 * r0, y0, z + c0 * r0, x + s1 * r0, y0, z + c1 * r0, x + s1 * r1, y1, z + c1 * r1, x + s0 * r1, y1, z + c0 * r1], n0, n1, n1, n0, c);
      }
    }
  }

  /** a plain upright cylinder */
  cyl(x: number, y: number, z: number, r: number, h: number, c: Col, seg = 7): void {
    this.lathe(x, z, [[r, y], [r, y + h]], c, seg);
  }

  /** a disc with its axis towards the viewer, slightly domed (a wheel of cheese, a plate, a clock, a tin's end) */
  disc(x: number, y: number, z: number, r: number, c: Col, dome = 0.3, seg = 12): void {
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2,
        a1 = ((s + 1) / seg) * Math.PI * 2;
      const nA = [Math.cos(a0) * dome, Math.sin(a0) * dome, 1],
        nB = [Math.cos(a1) * dome, Math.sin(a1) * dome, 1],
        nC = [0, 0, 1];
      this.v(x, y, z, nC[0], nC[1], nC[2], c);
      this.v(x + Math.cos(a0) * r, y + Math.sin(a0) * r, z, nA[0], nA[1], nA[2], c);
      this.v(x + Math.cos(a1) * r, y + Math.sin(a1) * r, z, nB[0], nB[1], nB[2], c);
    }
  }

  /** an ellipsoid's front half */
  ball(x: number, y: number, z: number, rx: number, ry: number, rz: number, c: Col, seg = 7): void {
    const rows = Math.max(3, seg - 2);
    for (let j = 0; j < rows; j++) {
      const t0 = -Math.PI / 2 + (Math.PI * j) / rows,
        t1 = -Math.PI / 2 + (Math.PI * (j + 1)) / rows;
      for (let s = 0; s < seg; s++) {
        const a0 = -Math.PI / 2 + (Math.PI * s) / seg,
          a1 = -Math.PI / 2 + (Math.PI * (s + 1)) / seg;
        const P = (t: number, a: number) => [Math.cos(t) * Math.sin(a), Math.sin(t), Math.cos(t) * Math.cos(a)];
        const p00 = P(t0, a0),
          p10 = P(t0, a1),
          p11 = P(t1, a1),
          p01 = P(t1, a0);
        const W = (q: number[]) => [x + q[0] * rx, y + q[1] * ry, z + q[2] * rz];
        const a = W(p00),
          b = W(p10),
          c1 = W(p11),
          d = W(p01);
        this.quad([...a, ...b, ...c1, ...d], p00, p10, p11, p01, c);
      }
    }
  }

  /** a bar between two points in the page's plane (a chair leg, a bicycle frame, a coat hanger): round in section */
  bar(x0: number, y0: number, x1: number, y1: number, z: number, r: number, c: Col): void {
    const dx = x1 - x0,
      dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const px = -dy / l,
      py = dx / l;
    const nM = [0, 0, 1],
      nA = [px * 0.8, py * 0.8, 0.6],
      nB = [-px * 0.8, -py * 0.8, 0.6];
    this.quad([x0 + px * r, y0 + py * r, z, x1 + px * r, y1 + py * r, z, x1, y1, z + r, x0, y0, z + r], nA, nA, nM, nM, c);
    this.quad([x0, y0, z + r, x1, y1, z + r, x1 - px * r, y1 - py * r, z, x0 - px * r, y0 - py * r, z], nM, nM, nB, nB, c);
  }

  /** a leaf in the page's plane: tapered, turned about its midrib so one half catches more light, a pale rib */
  leaf(x: number, y: number, z: number, angle: number, len: number, wid: number, c: Col, droop = 0): void {
    const n = 5;
    let px = x,
      py = y,
      a = angle,
      w0 = 0;
    const nA = [0.25, 0.3, 0.92],
      nB = [-0.25, -0.15, 0.95];
    for (let i = 1; i <= n; i++) {
      const s = i / n;
      a -= droop / n;
      const qx = px + (Math.cos(a) * len) / n,
        qy = py + (Math.sin(a) * len) / n;
      const w1 = wid * Math.sin(Math.min(1, s * 1.06) * Math.PI) * (1 - 0.25 * s);
      const ox = -Math.sin(a),
        oy = Math.cos(a);
      const zm = z + 0.008 * Math.sin(s * Math.PI);
      this.quad([px, py, zm, qx, qy, zm, qx + ox * w1, qy + oy * w1, z, px + ox * w0, py + oy * w0, z], nA, nA, nA, nA, c);
      this.quad([px - ox * w0, py - oy * w0, z, qx - ox * w1, qy - oy * w1, z, qx, qy, zm, px, py, zm], nB, nB, nB, nB, shade(c, 0.82));
      px = qx;
      py = qy;
      w0 = w1;
    }
  }

  /** a ring in the page's plane (a wheel, a mirror's frame, a hoop) */
  ring(x: number, y: number, z: number, r: number, t: number, c: Col, seg = 20): void {
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2,
        a1 = ((s + 1) / seg) * Math.PI * 2;
      this.bar(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r, z, t, c);
    }
  }
}
