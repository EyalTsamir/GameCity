// Smoothed polylines (river centreline, coastline) with fast nearest-point queries.
// Control points are smoothed with a centripetal-ish Catmull-Rom and resampled every `step` m;
// segments are bucketed on a coarse grid so a query only visits nearby segments.

export interface PolyHit {
  /** distance to the polyline (m) */
  d: number;
  /** arc length of the nearest point from the first vertex (m) */
  s: number;
  /** +1 if the point is on the left of the travel direction (x/z plane, z down = "south"), else -1 */
  side: number;
  /** unit tangent at the nearest point */
  tx: number;
  tz: number;
}

export class Polyline {
  readonly x: Float64Array;
  readonly z: Float64Array;
  /** cumulative arc length at each vertex */
  readonly s: Float64Array;
  readonly length: number;
  private cell: number;
  private buckets = new Map<number, number[]>();
  x0 = Infinity;
  z0 = Infinity;
  x1 = -Infinity;
  z1 = -Infinity;
  /** extend the first / last segment as rays (for open boundaries such as a coastline) */
  private extend: boolean;

  constructor(ctrl: [number, number][], step: number, cell = 160, extend = false) {
    this.extend = extend;
    this.cell = cell;
    const pts: [number, number][] = [];
    const n = ctrl.length;
    const P = (i: number): [number, number] => ctrl[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1),
        p1 = P(i),
        p2 = P(i + 1),
        p3 = P(i + 2);
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.max(1, Math.ceil(segLen / step));
      for (let j = 0; j < k; j++) {
        const t = j / k;
        const t2 = t * t,
          t3 = t2 * t;
        // uniform Catmull-Rom
        const cx = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const cz = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        pts.push([cx, cz]);
      }
    }
    pts.push(ctrl[n - 1]);
    const m = pts.length;
    this.x = new Float64Array(m);
    this.z = new Float64Array(m);
    this.s = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      this.x[i] = pts[i][0];
      this.z[i] = pts[i][1];
      if (i > 0) this.s[i] = this.s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      this.x0 = Math.min(this.x0, pts[i][0]);
      this.z0 = Math.min(this.z0, pts[i][1]);
      this.x1 = Math.max(this.x1, pts[i][0]);
      this.z1 = Math.max(this.z1, pts[i][1]);
    }
    this.length = this.s[m - 1];
    for (let i = 0; i < m - 1; i++) {
      const ax = Math.min(this.x[i], this.x[i + 1]),
        bx = Math.max(this.x[i], this.x[i + 1]);
      const az = Math.min(this.z[i], this.z[i + 1]),
        bz = Math.max(this.z[i], this.z[i + 1]);
      for (let cx = Math.floor(ax / cell); cx <= Math.floor(bx / cell); cx++) {
        for (let cz = Math.floor(az / cell); cz <= Math.floor(bz / cell); cz++) {
          const key = this.key(cx, cz);
          let b = this.buckets.get(key);
          if (!b) this.buckets.set(key, (b = []));
          b.push(i);
        }
      }
    }
  }

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /**
   * nearest point on the polyline within `maxD` (bucket ring search). Returns false (and out.d = maxD)
   * when nothing is that close; `maxD = Infinity` forces an exact answer (full scan fallback).
   */
  nearest(px: number, pz: number, out: PolyHit, maxD = Infinity): boolean {
    let best = Infinity,
      bi = -1,
      bt = 0;
    const n1 = this.x.length - 2;
    const visit = (i: number) => {
      const ax = this.x[i],
        az = this.z[i];
      const dx = this.x[i + 1] - ax,
        dz = this.z[i + 1] - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
      if (!(this.extend && i === 0 && t < 0) && !(this.extend && i === n1 && t > 1)) t = Math.max(0, Math.min(1, t));
      const qx = ax + dx * t - px,
        qz = az + dz * t - pz;
      const d2 = qx * qx + qz * qz;
      if (d2 < best) {
        best = d2;
        bi = i;
        bt = t;
      }
    };
    const c = this.cell;
    const ci = Math.floor(px / c),
      cj = Math.floor(pz / c);
    // rings of buckets around the query cell; after ring k every unvisited segment is ≥ k·c away
    const maxRing = Number.isFinite(maxD) ? Math.ceil(maxD / c) + 1 : 24;
    let done = false;
    for (let ring = 0; ring <= maxRing && !done; ring++) {
      for (let i = ci - ring; i <= ci + ring; i++) {
        const edgeI = i === ci - ring || i === ci + ring;
        for (let j = cj - ring; j <= cj + ring; j += edgeI || ring === 0 ? 1 : 2 * ring) {
          const b = this.buckets.get(this.key(i, j));
          if (b) for (const s of b) visit(s);
        }
      }
      if (bi >= 0 && best <= ring * c * (ring * c)) done = true;
    }
    if (!done) {
      if (Number.isFinite(maxD)) {
        if (bi < 0 || best > maxD * maxD) {
          out.d = maxD;
          return false;
        }
      } else for (let i = 0; i <= n1; i++) visit(i);
    }
    const ax = this.x[bi],
      az = this.z[bi];
    const dx = this.x[bi + 1] - ax,
      dz = this.z[bi + 1] - az;
    const L = Math.hypot(dx, dz) || 1;
    const tx = dx / L,
      tz = dz / L;
    const cross = tx * (pz - az) - tz * (px - ax);
    out.d = Math.sqrt(best);
    out.s = this.s[bi] + bt * L;
    out.side = cross >= 0 ? 1 : -1;
    out.tx = tx;
    out.tz = tz;
    return true;
  }

  /** point at arc length s (clamped) */
  at(s: number, out: { x: number; z: number }): { x: number; z: number } {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0,
      hi = this.s.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.s[m] <= s) lo = m;
      else hi = m;
    }
    const seg = this.s[hi] - this.s[lo] || 1;
    const t = (s - this.s[lo]) / seg;
    out.x = this.x[lo] + (this.x[hi] - this.x[lo]) * t;
    out.z = this.z[lo] + (this.z[hi] - this.z[lo]) * t;
    return out;
  }
}
