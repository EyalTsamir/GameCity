// Lightweight 2D geometry used by the city plan and simulations.
// Convention: the ground plane is X/Z (Y is up). 2D points are {x, z}.
// North = -Z (back of the default view), South = +Z, East = +X, West = -X.

export interface P2 {
  x: number;
  z: number;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export type Dir = 'N' | 'E' | 'S' | 'W';

export const DIR_VEC: Record<Dir, P2> = {
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
};

/** Rotation about +Y that turns a model facing +Z (south) to face `dir`. */
export const DIR_YAW: Record<Dir, number> = {
  S: 0,
  E: Math.PI / 2,
  N: Math.PI,
  W: -Math.PI / 2,
};

export const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };

export function p2(x: number, z: number): P2 {
  return { x, z };
}

export function rect(x0: number, z0: number, x1: number, z1: number): Rect {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
}

export function rectW(r: Rect): number {
  return r.x1 - r.x0;
}
export function rectD(r: Rect): number {
  return r.z1 - r.z0;
}
export function rectCenter(r: Rect): P2 {
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
}
export function rectContains(r: Rect, x: number, z: number, margin = 0): boolean {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}
export function rectInset(r: Rect, d: number): Rect {
  return { x0: r.x0 + d, z0: r.z0 + d, x1: r.x1 - d, z1: r.z1 - d };
}
export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.z0 < b.z1 + margin && a.z1 > b.z0 - margin;
}
/** Distance from point to rect (0 if inside). */
export function rectDist(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

export function dist(a: P2, b: P2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function lerpP(a: P2, b: P2, t: number): P2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Point in polygon (even-odd rule). */
export function pointInPoly(poly: readonly P2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      zi = poly[i].z,
      xj = poly[j].x,
      zj = poly[j].z;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance between point and segment ab. */
export function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Segment-segment intersection test (proper or touching). */
export function segmentsIntersect(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const o1 = o(a, b, c),
    o2 = o(a, b, d),
    o3 = o(c, d, a),
    o4 = o(c, d, b);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

/**
 * Polyline with arc-length parameterisation. Used for lanes, movements,
 * rail track, boat routes, pedestrian edges, camera tours…
 */
export class Path2 {
  readonly pts: P2[];
  /** cumulative arc length at each point */
  readonly cum: number[];
  readonly length: number;

  constructor(pts: P2[]) {
    if (pts.length < 2) throw new Error('Path2 needs at least 2 points');
    this.pts = pts;
    this.cum = [0];
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += dist(pts[i - 1], pts[i]);
      this.cum.push(L);
    }
    this.length = L;
  }

  private seg(s: number): number {
    // binary search for segment containing s
    let lo = 0,
      hi = this.cum.length - 1;
    if (s <= 0) return 0;
    if (s >= this.length) return this.cum.length - 2;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Position at arc length s (clamped). Writes into `out` if given. */
  at(s: number, out: P2 = { x: 0, z: 0 }): P2 {
    const i = this.seg(s);
    const a = this.pts[i],
      b = this.pts[i + 1];
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen > 1e-9 ? clamp((s - this.cum[i]) / segLen, 0, 1) : 0;
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
  }

  /** Unit tangent at arc length s. */
  tangent(s: number, out: P2 = { x: 0, z: 0 }): P2 {
    const i = this.seg(s);
    const a = this.pts[i],
      b = this.pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out.x = (b.x - a.x) / L;
    out.z = (b.z - a.z) / L;
    return out;
  }

  /** Heading angle (radians, rotation about +Y for a model facing +Z). */
  yaw(s: number): number {
    const t = this.tangent(s);
    return Math.atan2(t.x, t.z);
  }

  /** Arc length of the closest point on the path to p (approximate, per segment). */
  project(p: P2): { s: number; d: number } {
    let best = { s: 0, d: Infinity };
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i],
        b = this.pts[i + 1];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
      t = clamp(t, 0, 1);
      const x = a.x + t * dx,
        z = a.z + t * dz;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best.d) best = { s: this.cum[i] + t * Math.sqrt(l2), d };
    }
    return best;
  }

  /** Path offset sideways by `d` (positive = to the right of travel direction). */
  offset(d: number): Path2 {
    const out: P2[] = [];
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const a = this.pts[Math.max(0, i - 1)],
        b = this.pts[Math.min(n - 1, i + 1)];
      const tx = b.x - a.x,
        tz = b.z - a.z;
      const L = Math.hypot(tx, tz) || 1;
      // right of direction (tx,tz) in X/Z with Y up is (-tz, tx)
      out.push({ x: this.pts[i].x - (tz / L) * d, z: this.pts[i].z + (tx / L) * d });
    }
    return new Path2(out);
  }

  reversed(): Path2 {
    return new Path2([...this.pts].reverse());
  }
}

/** Sample a cubic Bezier into `n+1` points. */
export function bezier3(p0: P2, p1: P2, p2_: P2, p3: P2, n = 12): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    const a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      d = t * t * t;
    out.push({ x: a * p0.x + b * p1.x + c * p2_.x + d * p3.x, z: a * p0.z + b * p1.z + c * p2_.z + d * p3.z });
  }
  return out;
}

/** Minimum distance between two polylines (brute force over sample points). */
export function polylineMinDist(a: readonly P2[], b: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return 0;
      best = Math.min(
        best,
        distToSegment(a[i], b[j], b[j + 1]),
        distToSegment(a[i + 1], b[j], b[j + 1]),
        distToSegment(b[j], a[i], a[i + 1]),
        distToSegment(b[j + 1], a[i], a[i + 1]),
      );
    }
  }
  return best;
}
