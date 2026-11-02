// Near-only copies of city-wide meshes: the triangles of merged geometries, indexed by a world grid at boot, and cut
// exactly to one cell of the bubble when it is built. Neighbouring cells share their cut edges bit for bit (the same edge
// always interpolates from the same end), so a multiplied layer covers each pixel once.

import * as THREE from 'three';

export interface SourceAttr {
  name: string;
  size: number;
  /** its name in a built cell, if not the same */
  to?: string;
  /** not a source attribute: worked out per vertex (size 1) */
  fill?: (g: THREE.BufferGeometry, v: number) => number;
}

/** the vertices of triangles the bubble can ask for, one grid per class of surface */
export class TriGrid {
  /** per bucket: offset into `tris` */
  private start: Int32Array = new Int32Array(1);
  /** (geometry index * 2^24 is not enough room: pairs) triangle's geometry and first index */
  private tris: Int32Array = new Int32Array(0);
  private nx = 0;
  private nz = 0;
  private x0 = 0;
  private z0 = 0;
  /** floats per vertex in a built cell */
  readonly stride: number;
  triangles = 0;
  /** offset of a per-vertex direction filled in per triangle (aGrain): the way the piece runs */
  private readonly grainAt: number;

  constructor(
    private readonly geos: THREE.BufferGeometry[],
    readonly attrs: SourceAttr[],
    readonly cell: number,
    keep: (geo: THREE.BufferGeometry, a: number, b: number, c: number) => boolean,
  ) {
    this.stride = attrs.reduce((s, a) => s + a.size, 0);
    let off = 0;
    let gr = -1;
    for (const a of attrs) {
      if (a.name === 'aGrain') gr = off;
      off += a.size;
    }
    this.grainAt = gr;
    this.index(keep);
  }

  private index(keep: (geo: THREE.BufferGeometry, a: number, b: number, c: number) => boolean): void {
    const C = this.cell;
    // first pass: which triangles, and the extent of the grid
    let x0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      z1 = -Infinity;
    const kept: Int32Array[] = [];
    for (const g of this.geos) {
      const idx = g.index;
      const pos = g.getAttribute('position');
      const n = idx ? idx.count : pos.count;
      const k = new Int32Array(Math.floor(n / 3));
      let m = 0;
      for (let t = 0; t + 2 < n; t += 3) {
        const a = idx ? idx.getX(t) : t,
          b = idx ? idx.getX(t + 1) : t + 1,
          c = idx ? idx.getX(t + 2) : t + 2;
        if (!keep(g, a, b, c)) continue;
        k[m++] = t;
        const ax = pos.getX(a),
          az = pos.getZ(a),
          bx = pos.getX(b),
          bz = pos.getZ(b),
          cx = pos.getX(c),
          cz = pos.getZ(c);
        x0 = Math.min(x0, ax, bx, cx);
        x1 = Math.max(x1, ax, bx, cx);
        z0 = Math.min(z0, az, bz, cz);
        z1 = Math.max(z1, az, bz, cz);
      }
      kept.push(k.subarray(0, m));
      this.triangles += m;
    }
    if (this.triangles === 0) return;
    this.x0 = Math.floor(x0 / C);
    this.z0 = Math.floor(z0 / C);
    this.nx = Math.floor(x1 / C) - this.x0 + 1;
    this.nz = Math.floor(z1 / C) - this.z0 + 1;
    const count = new Int32Array(this.nx * this.nz + 1);
    const each = (fn: (bucket: number, geo: number, t: number) => void) => {
      for (let gi = 0; gi < this.geos.length; gi++) {
        const g = this.geos[gi];
        const idx = g.index;
        const pos = g.getAttribute('position');
        const k = kept[gi];
        for (let q = 0; q < k.length; q++) {
          const t = k[q];
          const a = idx ? idx.getX(t) : t,
            b = idx ? idx.getX(t + 1) : t + 1,
            c = idx ? idx.getX(t + 2) : t + 2;
          const ax = pos.getX(a),
            az = pos.getZ(a),
            bx = pos.getX(b),
            bz = pos.getZ(b),
            cx = pos.getX(c),
            cz = pos.getZ(c);
          const i0 = Math.floor(Math.min(ax, bx, cx) / C) - this.x0,
            i1 = Math.floor(Math.max(ax, bx, cx) / C) - this.x0,
            j0 = Math.floor(Math.min(az, bz, cz) / C) - this.z0,
            j1 = Math.floor(Math.max(az, bz, cz) / C) - this.z0;
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * this.nx + i, gi, t);
        }
      }
    };
    each((b) => count[b + 1]++);
    for (let i = 1; i < count.length; i++) count[i] += count[i - 1];
    this.start = count;
    this.tris = new Int32Array(count[count.length - 1] * 2);
    const fill = count.slice();
    each((b, gi, t) => {
      const p = fill[b]++ * 2;
      this.tris[p] = gi;
      this.tris[p + 1] = t;
    });
  }

  /** the nearest triangle along a ray within maxT (m), or -1. Short rays only: it walks the grid and tests what it meets */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
    if (this.triangles === 0) return -1;
    let best = -1;
    let last = -1;
    const C = this.cell;
    for (let u = 0; ; u += C * 0.5) {
      const t = Math.min(u, maxT);
      const bi = Math.floor((ox + dx * t) / C) - this.x0,
        bj = Math.floor((oz + dz * t) / C) - this.z0;
      if (bi >= 0 && bj >= 0 && bi < this.nx && bj < this.nz) {
        const b = bj * this.nx + bi;
        if (b !== last) {
          last = b;
          for (let q = this.start[b]; q < this.start[b + 1]; q++) {
            const g = this.geos[this.tris[q * 2]];
            const tri = this.tris[q * 2 + 1];
            const idx = g.index;
            const P = g.getAttribute('position').array as Float32Array;
            const a = (idx ? idx.getX(tri) : tri) * 3,
              e = (idx ? idx.getX(tri + 1) : tri + 1) * 3,
              f = (idx ? idx.getX(tri + 2) : tri + 2) * 3;
            const e1x = P[e] - P[a],
              e1y = P[e + 1] - P[a + 1],
              e1z = P[e + 2] - P[a + 2],
              e2x = P[f] - P[a],
              e2y = P[f + 1] - P[a + 1],
              e2z = P[f + 2] - P[a + 2];
            const px = dy * e2z - dz * e2y,
              py = dz * e2x - dx * e2z,
              pz = dx * e2y - dy * e2x;
            const det = e1x * px + e1y * py + e1z * pz;
            if (det > -1e-9 && det < 1e-9) continue;
            const inv = 1 / det;
            const tx = ox - P[a],
              ty = oy - P[a + 1],
              tz = oz - P[a + 2];
            const v = (tx * px + ty * py + tz * pz) * inv;
            if (v < 0 || v > 1) continue;
            const qx = ty * e1z - tz * e1y,
              qy = tz * e1x - tx * e1z,
              qz = tx * e1y - ty * e1x;
            const w = (dx * qx + dy * qy + dz * qz) * inv;
            if (w < 0 || v + w > 1) continue;
            const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
            if (hit > 0.05 && hit <= maxT && (best < 0 || hit < best)) best = hit;
          }
        }
      }
      if (t >= maxT) break;
    }
    return best;
  }

  /** one vertex of a source geometry into the scratch (an attribute it does not have stays 0) */
  private read(g: THREE.BufferGeometry, v: number, out: Float32Array, at: number): void {
    let o = at;
    for (const a of this.attrs) {
      if (a.fill) {
        out[o++] = a.fill(g, v);
        continue;
      }
      const src = g.getAttribute(a.name) as THREE.BufferAttribute | undefined;
      if (src && src.array instanceof Float32Array && (src as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute !== true) {
        const arr = src.array;
        const p = v * src.itemSize;
        for (let c = 0; c < a.size; c++) out[o + c] = c < src.itemSize ? arr[p + c] : 0;
      } else if (src) {
        for (let c = 0; c < a.size; c++) out[o + c] = c === 0 ? src.getX(v) : c === 1 ? src.getY(v) : c === 2 ? src.getZ(v) : src.getW(v);
      } else {
        for (let c = 0; c < a.size; c++) out[o + c] = 0;
      }
      o += a.size;
    }
  }

  /** the triangles in the cell (i, j), cut to it, as a geometry; null if none */
  build(i: number, j: number, make: (data: Float32Array) => THREE.BufferGeometry): THREE.BufferGeometry | null {
    const bi = i - this.x0,
      bj = j - this.z0;
    if (this.triangles === 0 || bi < 0 || bj < 0 || bi >= this.nx || bj >= this.nz) return null;
    const b = bj * this.nx + bi;
    const from = this.start[b],
      to = this.start[b + 1];
    if (to <= from) return null;
    const S = this.stride;
    const C = this.cell;
    const x0 = i * C,
      x1 = x0 + C,
      z0 = j * C,
      z1 = z0 + C;
    let cap = (to - from) * 3 * 4 * S;
    let out = new Float32Array(cap);
    let n = 0;
    const ax = scratchA(S),
      bx = scratchB(S);
    for (let q = from; q < to; q++) {
      const gi = this.tris[q * 2],
        t = this.tris[q * 2 + 1];
      const g = this.geos[gi];
      const idx = g.index;
      const v0 = idx ? idx.getX(t) : t,
        v1 = idx ? idx.getX(t + 1) : t + 1,
        v2 = idx ? idx.getX(t + 2) : t + 2;
      this.read(g, v0, ax, 0);
      this.read(g, v1, ax, S);
      this.read(g, v2, ax, 2 * S);
      if (this.grainAt >= 0) grainOf(ax, S, this.grainAt);
      // Sutherland-Hodgman against the four sides, in a fixed order
      let m = 3;
      m = clip(ax, bx, m, S, 0, x0, 1);
      if (m >= 3) m = clip(bx, ax, m, S, 0, x1, -1);
      if (m >= 3) m = clip(ax, bx, m, S, 2, z0, 1);
      if (m >= 3) m = clip(bx, ax, m, S, 2, z1, -1);
      if (m < 3) continue;
      const need = n + (m - 2) * 3 * S;
      if (need > cap) {
        cap = Math.max(cap * 2, need);
        const bigger = new Float32Array(cap);
        bigger.set(out.subarray(0, n));
        out = bigger;
      }
      for (let k = 1; k < m - 1; k++) {
        for (let c = 0; c < S; c++) out[n++] = ax[c];
        for (let c = 0; c < S; c++) out[n++] = ax[k * S + c];
        for (let c = 0; c < S; c++) out[n++] = ax[(k + 1) * S + c];
      }
    }
    if (n === 0) return null;
    return make(out.slice(0, n));
  }
}

/** the way a piece runs: of a quad's two triangles the longest edge is the diagonal, so the second longest edge is its long side */
function grainOf(t: Float32Array, S: number, at: number): void {
  const ax = t[S] - t[0],
    ay = t[S + 1] - t[1],
    az = t[S + 2] - t[2],
    bx = t[2 * S] - t[S],
    by = t[2 * S + 1] - t[S + 1],
    bz = t[2 * S + 2] - t[S + 2],
    cx = t[0] - t[2 * S],
    cy = t[1] - t[2 * S + 1],
    cz = t[2] - t[2 * S + 2];
  const la = ax * ax + ay * ay + az * az,
    lb = bx * bx + by * by + bz * bz,
    lc = cx * cx + cy * cy + cz * cz;
  let ex, ey, ez, l;
  if ((la >= lb && la <= lc) || (la <= lb && la >= lc)) {
    ex = ax;
    ey = ay;
    ez = az;
    l = la;
  } else if ((lb >= la && lb <= lc) || (lb <= la && lb >= lc)) {
    ex = bx;
    ey = by;
    ez = bz;
    l = lb;
  } else {
    ex = cx;
    ey = cy;
    ez = cz;
    l = lc;
  }
  // a sign that does not depend on which triangle of the quad it is
  const n = (Math.sqrt(l) || 1) * ((ey !== 0 ? ey : ex !== 0 ? ex : ez) < 0 ? -1 : 1);
  for (let k = 0; k < 3; k++) {
    t[k * S + at] = ex / n;
    t[k * S + at + 1] = ey / n;
    t[k * S + at + 2] = ez / n;
  }
}

let sa = new Float32Array(0),
  sb = new Float32Array(0);
const scratchA = (S: number) => (sa.length >= S * 12 ? sa : (sa = new Float32Array(S * 12)));
const scratchB = (S: number) => (sb.length >= S * 12 ? sb : (sb = new Float32Array(S * 12)));

/** keep the side of plane `coord[axis] = at` where sign·(coord − at) ≥ 0. A cut edge always runs from its lexically lower end */
function clip(src: Float32Array, dst: Float32Array, n: number, S: number, axis: number, at: number, sign: number): number {
  let m = 0;
  for (let k = 0; k < n; k++) {
    const a = k * S,
      b = ((k + 1) % n) * S;
    const da = sign * (src[a + axis] - at),
      db = sign * (src[b + axis] - at);
    if (da >= 0) {
      for (let c = 0; c < S; c++) dst[m * S + c] = src[a + c];
      m++;
    }
    if (da >= 0 !== db >= 0) {
      const lo = lower(src, a, b) ? a : b;
      const hi = lo === a ? b : a;
      const t = (at - src[lo + axis]) / (src[hi + axis] - src[lo + axis]);
      for (let c = 0; c < S; c++) dst[m * S + c] = src[lo + c] + (src[hi + c] - src[lo + c]) * t;
      dst[m * S + axis] = at;
      m++;
    }
  }
  return m;
}

function lower(s: Float32Array, a: number, b: number): boolean {
  if (s[a] !== s[b]) return s[a] < s[b];
  if (s[a + 1] !== s[b + 1]) return s[a + 1] < s[b + 1];
  return s[a + 2] < s[b + 2];
}

/** a geometry over interleaved floats, attributes in this order */
export function interleaved(data: Float32Array, attrs: SourceAttr[]): THREE.BufferGeometry {
  const S = attrs.reduce((s, a) => s + a.size, 0);
  const buf = new THREE.InterleavedBuffer(data, S);
  const g = new THREE.BufferGeometry();
  let o = 0;
  for (const a of attrs) {
    g.setAttribute(a.to ?? a.name, new THREE.InterleavedBufferAttribute(buf, a.size, o));
    o += a.size;
  }
  return g;
}
