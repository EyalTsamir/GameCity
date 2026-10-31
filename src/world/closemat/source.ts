// Near-only copies of city-wide meshes: the triangles of merged geometries, indexed by a world grid at boot, and cut
// exactly to one cell of the bubble when it is built. Neighbouring cells share their cut edges bit for bit (the same edge
// always interpolates from the same end), so a multiplied layer covers each pixel once.

import * as THREE from 'three';

export interface SourceAttr {
  name: string;
  size: number;
  /** its name in a built cell, if not the same */
  to?: string;
}

/** the vertices of triangles the bubble can ask for, one grid per class of surface */
export class TriGrid {
  private readonly data: Float32Array[] = [];
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

  constructor(
    private readonly geos: THREE.BufferGeometry[],
    readonly attrs: SourceAttr[],
    readonly cell: number,
    keep: (geo: THREE.BufferGeometry, a: number, b: number, c: number) => boolean,
  ) {
    this.stride = attrs.reduce((s, a) => s + a.size, 0);
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
    // the arrays a build reads, unpacked once
    for (const g of this.geos) {
      const pos = g.getAttribute('position');
      const v = new Float32Array(pos.count * this.stride);
      let o = 0;
      for (const a of this.attrs) {
        const src = g.getAttribute(a.name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
        if (src) {
          for (let i = 0; i < pos.count; i++) {
            for (let c = 0; c < a.size; c++) {
              v[i * this.stride + o + c] = c === 0 ? src.getX(i) : c === 1 ? src.getY(i) : c === 2 ? src.getZ(i) : src.getW(i);
            }
          }
        }
        o += a.size;
      }
      this.data.push(v);
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
      const d = this.data[gi];
      const idx = g.index;
      const v0 = idx ? idx.getX(t) : t,
        v1 = idx ? idx.getX(t + 1) : t + 1,
        v2 = idx ? idx.getX(t + 2) : t + 2;
      for (let c = 0; c < S; c++) {
        ax[c] = d[v0 * S + c];
        ax[S + c] = d[v1 * S + c];
        ax[2 * S + c] = d[v2 * S + c];
      }
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
