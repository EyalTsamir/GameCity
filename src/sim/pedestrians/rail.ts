// "Rails": the smoothed path a walking party follows along a route of the
// pedestrian graph. Each route edge (a "leg") is offset sideways by a per-leg
// lateral offset (keep-right), consecutive legs are joined at the miter point of
// their offset lines and the corner is rounded with a small Bezier. The result is
// a polyline parameterised by arc length that always stays inside the walkway
// band (|offset| ≤ halfWidth by construction). Positions beyond either end are
// extrapolated along the end tangents (used to step into / out of doors).

import type { PedEdge, PedNetwork } from '../../core/pedNetwork';

export interface Leg {
  edge: PedEdge;
  from: number;
  to: number;
  /** travel direction */
  dx: number;
  dz: number;
  len: number;
  /** lateral offset of this leg's offset line (+ = right of travel) */
  lat: number;
  hw: number;
  /** traversed a -> b */
  forward: boolean;
  /** start node position */
  ax: number;
  az: number;
  /** arc-length range on the rail where this leg is current */
  s0: number;
  s1: number;
}

export interface Rail {
  n: number;
  x: Float64Array;
  z: Float64Array;
  cum: Float64Array;
  /** leg index for the segment starting at vertex i */
  seg: Int32Array;
  /** along-leg distance (from the leg start node) at the start / end of segment i, measured on that leg's axis */
  uA: Float64Array;
  uB: Float64Array;
  length: number;
  legs: Leg[];
  nodes: number[];
}

export interface RailSample {
  x: number;
  z: number;
  /** unit tangent */
  tx: number;
  tz: number;
  leg: number;
  /** along-leg distance */
  u: number;
}

/**
 * Build a rail for a node route. `latFor(leg, index)` returns the lateral offset
 * for each leg (already clamped to the leg's half width by the caller).
 */
export function buildRail(peds: PedNetwork, route: number[], latFor: (e: PedEdge, legIndex: number, count: number) => number): Rail | null {
  if (route.length < 2) return null;
  const legs: Leg[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const e = peds.edgeBetween(route[i], route[i + 1]);
    if (!e) return null;
    const A = peds.nodes[route[i]],
      B = peds.nodes[route[i + 1]];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    if (len < 1e-3) continue;
    legs.push({ edge: e, from: route[i], to: route[i + 1], dx: (B.x - A.x) / len, dz: (B.z - A.z) / len, len, lat: 0, hw: e.halfWidth, forward: e.a === route[i], ax: A.x, az: A.z, s0: 0, s1: 0 });
  }
  if (legs.length === 0) return null;
  for (let i = 0; i < legs.length; i++) legs[i].lat = latFor(legs[i].edge, i, legs.length);

  const xs: number[] = [];
  const zs: number[] = [];
  const legOf: number[] = [];
  const nodes = peds.nodes;
  // offset line point of leg i at along-distance u
  const P = (i: number, u: number): [number, number] => {
    const L = legs[i];
    const A = nodes[L.from];
    return [A.x + L.dx * u - L.dz * L.lat, A.z + L.dz * u + L.dx * L.lat];
  };
  const push = (p: [number, number], leg: number) => {
    const n = xs.length;
    if (n > 0 && Math.abs(xs[n - 1] - p[0]) < 1e-4 && Math.abs(zs[n - 1] - p[1]) < 1e-4) {
      legOf[n - 1] = leg;
      return;
    }
    xs.push(p[0]);
    zs.push(p[1]);
    legOf.push(leg);
  };

  push(P(0, 0), 0);
  for (let i = 0; i < legs.length - 1; i++) {
    const a = legs[i],
      b = legs[i + 1];
    const dot = a.dx * b.dx + a.dz * b.dz;
    const cr = a.dx * b.dz - a.dz * b.dx;
    const N = nodes[a.to];
    // offset-line anchor points at the shared node
    const qax = N.x - a.dz * a.lat,
      qaz = N.z + a.dx * a.lat;
    const qbx = N.x - b.dz * b.lat,
      qbz = N.z + b.dx * b.lat;
    const tight = a.edge.kind === 'crosswalk' || b.edge.kind === 'crosswalk' || a.edge.kind === 'door' || b.edge.kind === 'door';
    if (dot > 0.966) {
      // nearly straight: blend the lateral offsets over a short distance
      const ka = Math.min(0.9, a.len * 0.35),
        kb = Math.min(0.9, b.len * 0.35);
      push(P(i, a.len - ka), i);
      push(P(i + 1, kb), i + 1);
      continue;
    }
    let ok = false;
    if (Math.abs(cr) > 0.05) {
      // solve qa + da*s = qb + db*t
      const rx = qbx - qax,
        rz = qbz - qaz;
      const s = (rx * b.dz - rz * b.dx) / cr;
      const t = (rx * a.dz - rz * a.dx) / cr;
      // miter at u = a.len + s on leg a and u = t on leg b
      const ua = a.len + s,
        ub = t;
      if (ua > 0.05 && ub < b.len - 0.05 && Math.abs(s) < 2.2 && Math.abs(t) < 2.2) {
        const mx = qax + a.dx * s,
          mz = qaz + a.dz * s;
        const cap = tight ? 0.42 : 0.85;
        const r = Math.max(0.05, Math.min(cap, (ua - 0.02) * 0.45, (b.len - ub) * 0.45));
        const p1x = mx - a.dx * r,
          p1z = mz - a.dz * r;
        const p2x = mx + b.dx * r,
          p2z = mz + b.dz * r;
        push([p1x, p1z], i);
        const steps = 4;
        for (let k = 1; k < steps; k++) {
          const t2 = k / steps,
            w0 = (1 - t2) * (1 - t2),
            w1 = 2 * (1 - t2) * t2,
            w2 = t2 * t2;
          push([w0 * p1x + w1 * mx + w2 * p2x, w0 * p1z + w1 * mz + w2 * p2z], k < steps / 2 ? i : i + 1);
        }
        push([p2x, p2z], i + 1);
        ok = true;
      }
    }
    if (!ok) {
      // bevel through the node (sharp turns / reversals at dead ends)
      const ka = Math.min(0.45, a.len * 0.3),
        kb = Math.min(0.45, b.len * 0.3);
      push(P(i, a.len - ka), i);
      push([(qax + qbx) / 2, (qaz + qbz) / 2], i + 1);
      push(P(i + 1, kb), i + 1);
    }
  }
  const last = legs.length - 1;
  push(P(last, legs[last].len), last);
  if (xs.length < 2) {
    // degenerate: duplicate the end slightly forward
    const L = legs[last];
    xs.push(xs[0] + L.dx * 0.01);
    zs.push(zs[0] + L.dz * 0.01);
    legOf.push(last);
  }

  const n = xs.length;
  const rail: Rail = {
    n,
    x: Float64Array.from(xs),
    z: Float64Array.from(zs),
    cum: new Float64Array(n),
    seg: new Int32Array(n),
    uA: new Float64Array(n),
    uB: new Float64Array(n),
    length: 0,
    legs,
    nodes: route,
  };
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    rail.cum[i] = acc;
    rail.seg[i] = legOf[i];
  }
  rail.length = acc;
  // along-leg distances for each segment, on the segment's own leg axis
  for (let i = 0; i < n; i++) {
    const L = legs[rail.seg[i]];
    const A = nodes[L.from];
    const j = Math.min(i + 1, n - 1);
    rail.uA[i] = clamp((xs[i] - A.x) * L.dx + (zs[i] - A.z) * L.dz, 0, L.len);
    rail.uB[i] = clamp((xs[j] - A.x) * L.dx + (zs[j] - A.z) * L.dz, 0, L.len);
  }
  // leg arc-length ranges
  for (let k = 0; k < legs.length; k++) {
    legs[k].s0 = Infinity;
    legs[k].s1 = -Infinity;
  }
  for (let i = 0; i < n - 1; i++) {
    const L = legs[rail.seg[i]];
    L.s0 = Math.min(L.s0, rail.cum[i]);
    L.s1 = Math.max(L.s1, rail.cum[i + 1]);
  }
  for (let k = 0; k < legs.length; k++) {
    if (!isFinite(legs[k].s0)) {
      // a leg that collapsed into a corner: give it an empty range at the right spot
      const prev = k > 0 ? legs[k - 1].s1 : 0;
      legs[k].s0 = legs[k].s1 = isFinite(prev) ? prev : 0;
    }
  }
  legs[0].s0 = -Infinity;
  legs[legs.length - 1].s1 = Infinity;
  return rail;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Sample the rail at arc length s (extrapolates beyond the ends). */
export function sampleRail(r: Rail, s: number, out: RailSample): RailSample {
  const n = r.n;
  let i: number;
  if (s <= 0) i = 0;
  else if (s >= r.length) i = n - 2;
  else {
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (r.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    i = lo;
  }
  // skip zero-length segments
  let j = i + 1;
  while (j < n - 1 && r.cum[j] - r.cum[i] < 1e-6) j++;
  const segLen = r.cum[j] - r.cum[i];
  const ax = r.x[i],
    az = r.z[i];
  let tx = r.x[j] - ax,
    tz = r.z[j] - az;
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  const t = segLen > 1e-9 ? (s - r.cum[i]) / segLen : 0;
  out.x = ax + (r.x[j] - ax) * t;
  out.z = az + (r.z[j] - az) * t;
  out.tx = tx;
  out.tz = tz;
  out.leg = r.seg[i];
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  out.u = r.uA[i] + (r.uB[i] - r.uA[i]) * tc;
  if (s < 0) out.u = r.uA[0] + s;
  else if (s > r.length) out.u = r.uB[n - 2] + (s - r.length);
  return out;
}

/** Arc length on the rail where leg `legIdx` reaches along-distance u (approximate around corners). */
export function railSAt(r: Rail, legIdx: number, u: number): number {
  const L = r.legs[legIdx];
  const i0 = Math.max(0, findIndex(r, Math.max(L.s0, 0)) - 4);
  let prevS = NaN,
    prevU = NaN;
  for (let i = i0; i < r.n; i++) {
    const s = r.cum[i];
    const pu = (r.x[i] - L.ax) * L.dx + (r.z[i] - L.az) * L.dz;
    if (isNaN(prevU)) {
      if (pu >= u) return Math.max(0, s - (pu - u));
    } else if (prevU < u && pu >= u) {
      return prevS + ((u - prevU) / Math.max(1e-6, pu - prevU)) * (s - prevS);
    }
    prevS = s;
    prevU = pu;
    if (s > L.s1 + 1) break;
  }
  return Math.min(Math.max(0, L.s0) + u, r.length);
}

function findIndex(r: Rail, s: number): number {
  let lo = 0,
    hi = r.n - 1;
  if (s <= 0) return 0;
  if (s >= r.length) return r.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ──────────────────────────────────────────────────────────────── A* ──

/** Fast A* over the pedestrian graph with reusable buffers and a binary heap. */
export class Router {
  private g: Float64Array;
  private f: Float64Array;
  private came: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap: Int32Array;
  private heapF: Float64Array;
  private size = 0;

  constructor(private peds: PedNetwork) {
    const N = peds.nodes.length;
    this.g = new Float64Array(N);
    this.f = new Float64Array(N);
    this.came = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.heap = new Int32Array(Math.max(16, peds.edges.length * 2 + 8));
    this.heapF = new Float64Array(this.heap.length);
  }

  /** A* over the walkway graph; `avoidEdge` (e.g. a jammed one) is only used if there is no other way. */
  route(from: number, to: number, crossPenalty = 6, avoidEdge = -1): number[] | null {
    if (from === to) return [from];
    const nodes = this.peds.nodes,
      edges = this.peds.edges;
    const gen = ++this.gen;
    const T = nodes[to];
    this.size = 0;
    const touch = (id: number) => {
      if (this.stamp[id] !== gen) {
        this.stamp[id] = gen;
        this.g[id] = Infinity;
        this.came[id] = -1;
      }
    };
    touch(from);
    this.g[from] = 0;
    this.push(from, Math.hypot(nodes[from].x - T.x, nodes[from].z - T.z));
    let found = false;
    while (this.size > 0) {
      const u = this.pop();
      if (this.closed[u] === gen) continue;
      this.closed[u] = gen;
      if (u === to) {
        found = true;
        break;
      }
      const gu = this.g[u];
      for (const eid of nodes[u].edges) {
        const e = edges[eid];
        const w = e.a === u ? e.b : e.a;
        if (this.closed[w] === gen) continue;
        if (nodes[w].kind === 'door' && w !== to) continue;
        touch(w);
        const cost = gu + e.length + (e.kind === 'crosswalk' ? crossPenalty : 0) + (eid === avoidEdge ? 400 : 0);
        if (cost < this.g[w]) {
          this.g[w] = cost;
          this.came[w] = u;
          this.push(w, cost + Math.hypot(nodes[w].x - T.x, nodes[w].z - T.z));
        }
      }
    }
    if (!found) return null;
    const out: number[] = [to];
    let c = to;
    let guard = 0;
    while (c !== from && guard++ < 100000) {
      c = this.came[c];
      if (c < 0) return null;
      out.push(c);
    }
    return out.reverse();
  }

  /** Walking distance between two nodes (Infinity if unreachable). */
  distance(from: number, to: number): number {
    const r = this.route(from, to);
    if (!r) return Infinity;
    let d = 0;
    for (let i = 0; i < r.length - 1; i++) d += this.peds.edgeBetween(r[i], r[i + 1])?.length ?? 0;
    return d;
  }

  private push(id: number, f: number): void {
    if (this.size >= this.heap.length) {
      const nh = new Int32Array(this.heap.length * 2);
      nh.set(this.heap);
      const nf = new Float64Array(this.heap.length * 2);
      nf.set(this.heapF);
      this.heap = nh;
      this.heapF = nf;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heapF[p] <= f) break;
      this.heap[i] = this.heap[p];
      this.heapF[i] = this.heapF[p];
      i = p;
    }
    this.heap[i] = id;
    this.heapF[i] = f;
  }

  private pop(): number {
    const top = this.heap[0];
    const lastId = this.heap[--this.size];
    const lastF = this.heapF[this.size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= this.size) break;
      const r = l + 1;
      const c = r < this.size && this.heapF[r] < this.heapF[l] ? r : l;
      if (this.heapF[c] >= lastF) break;
      this.heap[i] = this.heap[c];
      this.heapF[i] = this.heapF[c];
      i = c;
    }
    this.heap[i] = lastId;
    this.heapF[i] = lastF;
    return top;
  }
}
