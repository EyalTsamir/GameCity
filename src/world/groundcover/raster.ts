// Tiny typed-array rasteriser for the ground-cover maps (world metres → texels). Much faster than a
// 2D canvas here (no getImageData round trips, no filters) and fully deterministic.
//
// Modes: 'set' assigns, 'max' keeps the larger value, 'add' adds (saturating at 255).

export type RMode = 'set' | 'max' | 'add';

export class Raster {
  readonly data: Uint8Array;
  readonly k: number;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly x0: number,
    readonly z0: number,
    readonly res: number,
    fill = 0,
  ) {
    this.data = new Uint8Array(w * h);
    if (fill) this.data.fill(fill);
    this.k = 1 / res;
  }

  private put(p: number, v: number, mode: RMode): void {
    const d = this.data;
    if (mode === 'set') d[p] = v;
    else if (mode === 'max') {
      if (v > d[p]) d[p] = v;
    } else {
      const s = d[p] + v;
      d[p] = s > 255 ? 255 : s;
    }
  }

  /** texel index range covering [a, b] world (inclusive), clamped */
  private span(a: number, b: number, o: number, n: number): [number, number] {
    const i0 = Math.max(0, Math.floor((Math.min(a, b) - o) * this.k));
    const i1 = Math.min(n - 1, Math.floor((Math.max(a, b) - o) * this.k - 1e-6));
    return [i0, i1];
  }

  rect(xa: number, za: number, xb: number, zb: number, v: number, mode: RMode = 'set'): void {
    const [i0, i1] = this.span(xa, xb, this.x0, this.w);
    const [j0, j1] = this.span(za, zb, this.z0, this.h);
    for (let j = j0; j <= j1; j++) {
      const row = j * this.w;
      for (let i = i0; i <= i1; i++) this.put(row + i, v, mode);
    }
  }

  /** filled disc; value may fall off toward the rim with fn(t) (t = r / R) */
  disc(cx: number, cz: number, r: number, v: number, mode: RMode = 'set', fn?: (t: number) => number): void {
    const [i0, i1] = this.span(cx - r, cx + r, this.x0, this.w);
    const [j0, j1] = this.span(cz - r, cz + r, this.z0, this.h);
    const rr = r * r;
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * this.res - cz;
      const row = j * this.w;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * this.res - cx;
        const d2 = x * x + z * z;
        if (d2 > rr) continue;
        this.put(row + i, fn ? Math.round(v * fn(Math.sqrt(d2) / r)) : v, mode);
      }
    }
  }

  /** segment a-b with radius r (round caps) */
  capsule(ax: number, az: number, bx: number, bz: number, r: number, v: number, mode: RMode = 'set'): void {
    const [i0, i1] = this.span(Math.min(ax, bx) - r, Math.max(ax, bx) + r, this.x0, this.w);
    const [j0, j1] = this.span(Math.min(az, bz) - r, Math.max(az, bz) + r, this.z0, this.h);
    const dx = bx - ax,
      dz = bz - az;
    const L2 = dx * dx + dz * dz || 1e-9;
    const rr = r * r;
    for (let j = j0; j <= j1; j++) {
      const pz = this.z0 + (j + 0.5) * this.res;
      const row = j * this.w;
      for (let i = i0; i <= i1; i++) {
        const px = this.x0 + (i + 0.5) * this.res;
        let t = ((px - ax) * dx + (pz - az) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px,
          qz = az + dz * t - pz;
        if (qx * qx + qz * qz <= rr) this.put(row + i, v, mode);
      }
    }
  }

  polyline(pts: readonly { x: number; z: number }[], width: number, v: number, mode: RMode = 'set'): void {
    for (let i = 0; i < pts.length - 1; i++) this.capsule(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, width / 2, v, mode);
    if (pts.length === 1) this.disc(pts[0].x, pts[0].z, width / 2, v, mode);
  }

  /** outline of an axis-aligned rectangle, line width w */
  rectStroke(x0: number, z0: number, x1: number, z1: number, w: number, v: number, mode: RMode = 'set'): void {
    const h = w / 2;
    this.rect(x0 - h, z0 - h, x1 + h, z0 + h, v, mode);
    this.rect(x0 - h, z1 - h, x1 + h, z1 + h, v, mode);
    this.rect(x0 - h, z0 + h, x0 + h, z1 - h, v, mode);
    this.rect(x1 - h, z0 + h, x1 + h, z1 - h, v, mode);
  }

  /** convex polygon (any winding) */
  poly(pts: readonly [number, number][], v: number, mode: RMode = 'set'): void {
    let xa = Infinity,
      xb = -Infinity,
      za = Infinity,
      zb = -Infinity;
    for (const [x, z] of pts) {
      xa = Math.min(xa, x);
      xb = Math.max(xb, x);
      za = Math.min(za, z);
      zb = Math.max(zb, z);
    }
    const [i0, i1] = this.span(xa, xb, this.x0, this.w);
    const [j0, j1] = this.span(za, zb, this.z0, this.h);
    const n = pts.length;
    for (let j = j0; j <= j1; j++) {
      const pz = this.z0 + (j + 0.5) * this.res;
      const row = j * this.w;
      for (let i = i0; i <= i1; i++) {
        const px = this.x0 + (i + 0.5) * this.res;
        let pos = 0,
          neg = 0;
        for (let e = 0; e < n; e++) {
          const [ax, az] = pts[e];
          const [bx, bz] = pts[(e + 1) % n];
          const c = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
          if (c > 0) pos++;
          else if (c < 0) neg++;
        }
        if (pos === 0 || neg === 0) this.put(row + i, v, mode);
      }
    }
  }

  /** rotated rectangle: centre, size along local x / z, yaw (local +Z faces (sin yaw, cos yaw)) */
  rotRect(cx: number, cz: number, w: number, d: number, yaw: number, v: number, mode: RMode = 'set'): void {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const hw = w / 2,
      hd = d / 2;
    const pts: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
    this.poly(pts, v, mode);
  }

  /** filled ellipse (rotation a) or a band rIn..1 of it (rIn = inner radius as a fraction) */
  ellipse(cx: number, cz: number, rx: number, rz: number, a: number, v: number, mode: RMode = 'set', rIn = 0): void {
    const R = Math.max(rx, rz);
    const [i0, i1] = this.span(cx - R, cx + R, this.x0, this.w);
    const [j0, j1] = this.span(cz - R, cz + R, this.z0, this.h);
    const c = Math.cos(a),
      s = Math.sin(a);
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * this.res - cz;
      const row = j * this.w;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * this.res - cx;
        const lx = x * c + z * s,
          lz = -x * s + z * c;
        const e = (lx / rx) ** 2 + (lz / rz) ** 2;
        if (e <= 1 && e >= rIn * rIn) this.put(row + i, v, mode);
      }
    }
  }

  /** separable box blur, two passes (≈ gaussian), radius r texels */
  blur(r: number): void {
    const { w, h } = this;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) tmp[i] = this.data[i];
    const n = 2 * r + 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += tmp[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          out[row + x] = acc / n;
          acc += tmp[row + Math.min(w - 1, x + r + 1)] - tmp[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += out[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
          tmp[y * w + x] = acc / n;
          acc += out[Math.min(h - 1, y + r + 1) * w + x] - out[Math.max(0, y - r) * w + x];
        }
      }
    }
    for (let i = 0; i < w * h; i++) this.data[i] = Math.round(tmp[i]);
  }
}
