// Pedestrian walkway graph: sidewalks (walk band centre lines), corner squares,
// crosswalks, park/plaza/beach/bridge walkways, building doors, bus stops, benches.
// Pedestrians move along edges with a lateral offset in [-halfWidth, +halfWidth],
// which keeps them inside the walkable band by construction.

import type { CityPlan, Bench, Door, WalkKind } from './plan';
import type { RoadNetwork } from './roadNetwork';
import { Dir, DIR_VEC, P2 } from './geom';
import { SIDEWALK_Y, GROUND_Y, WALK_OFFSET, WALK_BAND } from './constants';
import { OCC, OccupancyGrid } from './occupancy';

export type PedNodeKind = 'corner' | 'side' | 'door' | 'path' | 'busstop' | 'link';
export type PedEdgeKind = 'sidewalk' | 'crosswalk' | 'door' | 'link' | WalkKind;

export interface PedNode {
  id: number;
  x: number;
  z: number;
  y: number;
  kind: PedNodeKind;
  edges: number[];
  /** door nodes */
  lot?: number;
  door?: Door;
  /** bus stop waiting point */
  busStop?: number;
  /** road junction this corner belongs to */
  junction?: number;
}

export interface PedEdge {
  id: number;
  a: number;
  b: number;
  kind: PedEdgeKind;
  length: number;
  /** lateral offset limit (walkable half-width around the centre line) */
  halfWidth: number;
  /** walking surface heights at a / b; optional arch height at the middle (bridges) */
  yA: number;
  yB: number;
  yMid?: number;
  /** crosswalk edges: the junction and arm being crossed */
  cross?: { node: number; arm: Dir };
}

export interface BenchSpot {
  bench: Bench;
  /** walkway node next to the bench */
  node: number;
}

export interface PedNetwork {
  nodes: PedNode[];
  edges: PedEdge[];
  doorNodes: number[];
  stationDoorNodes: number[];
  busStopNodes: Map<number, number>;
  benches: BenchSpot[];
  /** nodes on beach sunbathing spots / pier ends / picnic etc. — nice destinations */
  leisureNodes: number[];
  /** the other end of an edge */
  other(edgeId: number, nodeId: number): number;
  /** shortest path (node ids, inclusive) or null */
  route(from: number, to: number): number[] | null;
  /** edge connecting two adjacent nodes */
  edgeBetween(a: number, b: number): PedEdge | undefined;
  nearestNode(x: number, z: number, filter?: (n: PedNode) => boolean): number;
  /** height of the walking surface at parameter t∈[0,1] along an edge (from a to b) */
  edgeY(e: PedEdge, t: number): number;
  warnings: string[];
}

interface SideLine {
  a: number; // node ids at u=0 / u=len
  b: number;
  p0: P2;
  dir: P2;
  len: number;
  att: { u: number; node: number }[];
  segment: number; // -1 for corner connectors
  side: 'L' | 'R' | '-';
}

const QUADS: Record<string, P2> = { NE: { x: 1, z: -1 }, NW: { x: -1, z: -1 }, SE: { x: 1, z: 1 }, SW: { x: -1, z: 1 } };
const ARM_QUADS: Record<Dir, [string, string]> = { N: ['NW', 'NE'], E: ['NE', 'SE'], S: ['SW', 'SE'], W: ['NW', 'SW'] };

export function buildPedNetwork(plan: CityPlan, net: RoadNetwork, occ: OccupancyGrid): PedNetwork {
  const nodes: PedNode[] = [];
  const edges: PedEdge[] = [];
  const warnings: string[] = [];
  const addNode = (x: number, z: number, y: number, kind: PedNodeKind): PedNode => {
    const n: PedNode = { id: nodes.length, x, z, y, kind, edges: [] };
    nodes.push(n);
    return n;
  };
  const addEdge = (a: number, b: number, kind: PedEdgeKind, halfWidth: number, yMid?: number): PedEdge | null => {
    if (a === b) return null;
    const A = nodes[a],
      B = nodes[b];
    const length = Math.hypot(B.x - A.x, B.z - A.z);
    if (length < 0.05) return null;
    const e: PedEdge = { id: edges.length, a, b, kind, length, halfWidth, yA: A.y, yB: B.y, yMid };
    edges.push(e);
    A.edges.push(e.id);
    B.edges.push(e.id);
    return e;
  };

  // ── corners
  const corner = new Map<string, number>();
  for (const I of net.intersections) {
    if (I.control === 'portal') continue;
    for (const q of Object.keys(QUADS)) {
      const v = QUADS[q];
      const n = addNode(I.x + v.x * WALK_OFFSET, I.z + v.z * WALK_OFFSET, SIDEWALK_Y, 'corner');
      n.junction = I.id;
      corner.set(`${I.id}:${q}`, n.id);
    }
  }

  // ── sidewalk lines along segments
  const lines: SideLine[] = [];
  const quadFor = (node: number, along: P2, side: P2): string => {
    // quadrant at `node` in direction (along + side)
    const x = along.x + side.x,
      z = along.z + side.z;
    return (z < 0 ? 'N' : 'S') + (x > 0 ? 'E' : 'W');
  };
  for (const seg of plan.roadSegments) {
    if (!seg.sidewalks) continue;
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const d = { x: (B.x - A.x) / L, z: (B.z - A.z) / L };
    const right = { x: -d.z, z: d.x };
    for (const side of ['R', 'L'] as const) {
      const sv = side === 'R' ? right : { x: -right.x, z: -right.z };
      const qa = quadFor(A.id, d, sv);
      const qb = quadFor(B.id, { x: -d.x, z: -d.z }, sv);
      const na = corner.get(`${A.id}:${qa}`)!,
        nb = corner.get(`${B.id}:${qb}`)!;
      const p0 = { x: nodes[na].x, z: nodes[na].z };
      const p1 = { x: nodes[nb].x, z: nodes[nb].z };
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      lines.push({ a: na, b: nb, p0, dir: { x: (p1.x - p0.x) / len, z: (p1.z - p0.z) / len }, len, att: [], segment: seg.id, side });
    }
  }
  // corner connectors across missing arms (sidewalk wraps around the block edge)
  for (const I of net.intersections) {
    if (I.control === 'portal') continue;
    for (const arm of ['N', 'E', 'S', 'W'] as Dir[]) {
      if (I.arms.includes(arm)) continue;
      const [qa, qb] = ARM_QUADS[arm];
      const na = corner.get(`${I.id}:${qa}`)!,
        nb = corner.get(`${I.id}:${qb}`)!;
      const p0 = { x: nodes[na].x, z: nodes[na].z },
        p1 = { x: nodes[nb].x, z: nodes[nb].z };
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      lines.push({ a: na, b: nb, p0, dir: { x: (p1.x - p0.x) / len, z: (p1.z - p0.z) / len }, len, att: [], segment: -1, side: '-' });
    }
  }
  const attach = (line: SideLine, u: number, kind: PedNodeKind = 'side'): number => {
    u = Math.max(0, Math.min(line.len, u));
    if (u < 0.3) return line.a;
    if (u > line.len - 0.3) return line.b;
    for (const at of line.att) if (Math.abs(at.u - u) < 0.4) return at.node;
    const n = addNode(line.p0.x + line.dir.x * u, line.p0.z + line.dir.z * u, SIDEWALK_Y, kind);
    line.att.push({ u, node: n.id });
    return n.id;
  };
  const nearestLine = (x: number, z: number, maxD: number): { line: SideLine; u: number; d: number } | null => {
    let best: { line: SideLine; u: number; d: number } | null = null;
    for (const line of lines) {
      const u = (x - line.p0.x) * line.dir.x + (z - line.p0.z) * line.dir.z;
      if (u < -0.5 || u > line.len + 0.5) continue;
      const px = line.p0.x + line.dir.x * u,
        pz = line.p0.z + line.dir.z * u;
      const d = Math.hypot(x - px, z - pz);
      if (d <= maxD && (!best || d < best.d)) best = { line, u, d };
    }
    return best;
  };

  // ── walkway paths
  const keyOf = (p: P2) => `${Math.round(p.x * 20)}:${Math.round(p.z * 20)}`;
  const pathNode = new Map<string, number>();
  const getPathNode = (p: P2, y: number): number => {
    const k = keyOf(p);
    let id = pathNode.get(k);
    if (id === undefined) {
      id = addNode(p.x, p.z, y, 'path').id;
      pathNode.set(k, id);
    }
    return id;
  };
  // split points: an endpoint lying on another path's segment interior becomes a vertex there
  const allPaths = plan.paths.map((p) => ({ def: p, pts: p.pts.map((q) => ({ ...q })) }));
  for (const P of allPaths) {
    for (const end of [P.pts[0], P.pts[P.pts.length - 1]]) {
      for (const Q of allPaths) {
        if (Q === P) continue;
        for (let k = 0; k < Q.pts.length - 1; k++) {
          const a = Q.pts[k],
            b = Q.pts[k + 1];
          const L = Math.hypot(b.x - a.x, b.z - a.z);
          if (L < 0.1) continue;
          const t = ((end.x - a.x) * (b.x - a.x) + (end.z - a.z) * (b.z - a.z)) / (L * L);
          if (t <= 0.01 || t >= 0.99) continue;
          const px = a.x + (b.x - a.x) * t,
            pz = a.z + (b.z - a.z) * t;
          if (Math.hypot(px - end.x, pz - end.z) < 0.08) {
            Q.pts.splice(k + 1, 0, { x: end.x, z: end.z });
            break;
          }
        }
      }
    }
  }
  const linkRequests: { node: number }[] = [];
  for (const P of allPaths) {
    const def = P.def;
    const half = Math.max(0.5, def.width / 2 - 0.35);
    const ids: number[] = [];
    const n = P.pts.length;
    for (let k = 0; k < n; k++) {
      let y = def.y;
      if (def.kind === 'bridge' && k > 0 && k < n - 1) y = def.y + 0.45;
      ids.push(getPathNode(P.pts[k], y));
    }
    for (let k = 0; k < n - 1; k++) {
      const mid = def.kind === 'bridge' && k > 0 && k < n - 2 ? def.yMid : undefined;
      addEdge(ids[k], ids[k + 1], def.kind, half, mid);
    }
    for (const e of def.linkEnds) linkRequests.push({ node: e === 0 ? ids[0] : ids[n - 1] });
  }
  for (const req of linkRequests) {
    const p = nodes[req.node];
    const hit = nearestLine(p.x, p.z, 2.8);
    if (!hit) {
      warnings.push(`path link at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) found no sidewalk`);
      continue;
    }
    const sn = attach(hit.line, hit.u, 'link');
    addEdge(sn, req.node, 'link', 0.9);
  }

  // ── crosswalks
  for (const I of net.intersections) {
    for (const cw of I.crosswalks) {
      const [qa, qb] = ARM_QUADS[cw.arm];
      const e = addEdge(corner.get(`${I.id}:${qa}`)!, corner.get(`${I.id}:${qb}`)!, 'crosswalk', 1.2);
      if (e) e.cross = { node: I.id, arm: cw.arm };
    }
  }

  // ── bus stops (waiting point on the walk band next to the shelter)
  const busStopNodes = new Map<number, number>();
  for (const bs of plan.busStops) {
    const seg = plan.roadSegments[bs.segment];
    const side = seg.a === bs.from ? 'R' : 'L';
    const line = lines.find((l) => l.segment === seg.id && l.side === side);
    if (!line) continue;
    const u = (bs.x - line.p0.x) * line.dir.x + (bs.z - line.p0.z) * line.dir.z;
    const id = attach(line, u, 'busstop');
    nodes[id].busStop = bs.id;
    busStopNodes.set(bs.id, id);
  }

  // ── doors: connect to the first walkway hit in front of the door
  const doorNodes: number[] = [];
  const stationDoorNodes: number[] = [];
  for (const lot of plan.lots) {
    for (const door of lot.doors) {
      const v = DIR_VEC[door.dir];
      const dn = addNode(door.x, door.z, GROUND_Y, 'door');
      dn.lot = lot.id;
      dn.door = door;
      // 1) a path vertex right at the door
      let target = -1;
      for (const [k, id] of pathNode) {
        void k;
        const n = nodes[id];
        if (Math.hypot(n.x - door.x, n.z - door.z) < 0.7) {
          target = id;
          break;
        }
      }
      // 2) ray-cast along the facing direction against sidewalk lines and path edges
      if (target < 0) {
        let bestT = 26;
        let make: (() => number) | null = null;
        for (const line of lines) {
          const t = rayLine(door, v, line.p0, line.dir, line.len);
          if (t !== null && t > 0.2 && t < bestT) {
            bestT = t;
            const u = (door.x + v.x * t - line.p0.x) * line.dir.x + (door.z + v.z * t - line.p0.z) * line.dir.z;
            make = () => attach(line, u, 'side');
          }
        }
        for (const e of edges) {
          if (e.kind === 'crosswalk' || e.kind === 'door' || e.kind === 'link' || e.kind === 'sidewalk') continue;
          const A = nodes[e.a],
            B = nodes[e.b];
          const dir = { x: (B.x - A.x) / e.length, z: (B.z - A.z) / e.length };
          const t = rayLine(door, v, A, dir, e.length);
          if (t !== null && t > 0.2 && t < bestT) {
            bestT = t;
            const hitX = door.x + v.x * t,
              hitZ = door.z + v.z * t;
            const ee = e;
            make = () => splitEdge(ee.id, hitX, hitZ);
          }
        }
        if (make) {
          // validate the straight walk from the door doesn't cross another building or water
          const ok = segmentClear(occ, door.x + v.x * 0.6, door.z + v.z * 0.6, door.x + v.x * bestT, door.z + v.z * bestT, OCC.BUILDING | OCC.WATER | OCC.SOLID);
          if (ok) target = make();
        }
      }
      if (target < 0) {
        warnings.push(`door of lot ${lot.id} (${lot.kind}) at (${door.x.toFixed(1)}, ${door.z.toFixed(1)}) has no walkway`);
        continue;
      }
      addEdge(dn.id, target, 'door', 0.4);
      doorNodes.push(dn.id);
      if (lot.kind === 'station') stationDoorNodes.push(dn.id);
    }
  }

  function splitEdge(eid: number, x: number, z: number): number {
    const e = edges[eid];
    const A = nodes[e.a],
      B = nodes[e.b];
    const t = Math.max(0, Math.min(1, ((x - A.x) * (B.x - A.x) + (z - A.z) * (B.z - A.z)) / (e.length * e.length)));
    if (t * e.length < 0.4) return e.a;
    if ((1 - t) * e.length < 0.4) return e.b;
    const y = A.y + (B.y - A.y) * t;
    const n = addNode(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t, y, 'path');
    // shorten e to a->n, add n->b
    B.edges.splice(B.edges.indexOf(eid), 1);
    const oldB = e.b;
    e.b = n.id;
    e.length = Math.hypot(n.x - A.x, n.z - A.z);
    e.yB = y;
    n.edges.push(eid);
    addEdge(n.id, oldB, e.kind, e.halfWidth, undefined);
    return n.id;
  }

  // ── benches
  const benches: BenchSpot[] = [];
  const nearestEdgePoint = (x: number, z: number, maxD: number): { e: PedEdge; x: number; z: number; d: number } | null => {
    let best: { e: PedEdge; x: number; z: number; d: number } | null = null;
    for (const e of edges) {
      if (e.kind === 'crosswalk' || e.kind === 'door' || e.kind === 'link') continue;
      const A = nodes[e.a],
        B = nodes[e.b];
      const t = Math.max(0, Math.min(1, ((x - A.x) * (B.x - A.x) + (z - A.z) * (B.z - A.z)) / (e.length * e.length)));
      const px = A.x + (B.x - A.x) * t,
        pz = A.z + (B.z - A.z) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < maxD && (!best || d < best.d)) best = { e, x: px, z: pz, d };
    }
    return best;
  };
  for (const b of plan.benches) {
    const line = nearestLine(b.ax, b.az, 0.6);
    let node = -1;
    if (line) node = attach(line.line, line.u, 'side');
    else {
      const hit = nearestEdgePoint(b.ax, b.az, 1.0);
      if (hit) node = splitEdge(hit.e.id, hit.x, hit.z);
    }
    if (node < 0) {
      warnings.push(`bench at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) not on a walkway`);
      continue;
    }
    benches.push({ bench: b, node });
  }
  // sidewalk bench slots: sitter faces the street
  for (const s of plan.slots) {
    if (s.kind !== 'bench') continue;
    const nx = Math.sin(s.yaw),
      nz = Math.cos(s.yaw); // away from road
    const ax = s.x + nx * (WALK_OFFSET - 3.9),
      az = s.z + nz * (WALK_OFFSET - 3.9);
    const hit = nearestLine(ax, az, 0.6);
    if (!hit) continue;
    const node = attach(hit.line, hit.u, 'side');
    benches.push({ bench: { x: s.x, z: s.z, yaw: Math.atan2(-nx, -nz), ax, az }, node });
  }

  // ── materialise sidewalk edges
  for (const line of lines) {
    line.att.sort((p, q) => p.u - q.u);
    let prev = line.a;
    for (const at of line.att) {
      addEdge(prev, at.node, 'sidewalk', WALK_BAND / 2 - 0.2);
      prev = at.node;
    }
    addEdge(prev, line.b, 'sidewalk', WALK_BAND / 2 - 0.2);
  }

  // leisure destinations: dead-end path nodes on the beach / pier / spurs
  const leisureNodes = nodes.filter((n) => n.kind === 'path' && n.edges.length === 1).map((n) => n.id);

  // connectivity check
  const comp = new Int32Array(nodes.length).fill(-1);
  let nComp = 0;
  const compSize: number[] = [];
  for (const n of nodes) {
    if (comp[n.id] >= 0 || n.edges.length === 0) continue;
    const stack = [n.id];
    comp[n.id] = nComp;
    let size = 0;
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const eid of nodes[u].edges) {
        const e = edges[eid];
        const w = e.a === u ? e.b : e.a;
        if (comp[w] < 0) {
          comp[w] = nComp;
          stack.push(w);
        }
      }
    }
    compSize.push(size);
    nComp++;
  }
  const main = compSize.indexOf(Math.max(...compSize));
  if (nComp > 1) {
    for (let c = 0; c < nComp; c++) if (c !== main) warnings.push(`disconnected walkway component #${c} with ${compSize[c]} nodes`);
  }
  const inMain = (id: number) => comp[id] === main;

  const other = (eid: number, nid: number) => (edges[eid].a === nid ? edges[eid].b : edges[eid].a);

  const route = (from: number, to: number): number[] | null => {
    if (from === to) return [from];
    if (comp[from] !== comp[to]) return null;
    const N = nodes.length;
    const g = new Float64Array(N).fill(Infinity);
    const f = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const T = nodes[to];
    const h = (id: number) => Math.hypot(nodes[id].x - T.x, nodes[id].z - T.z);
    const open: number[] = [from];
    g[from] = 0;
    f[from] = h(from);
    while (open.length) {
      // small graphs: linear scan for the min is fine
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const u = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (u === to) break;
      if (closed[u]) continue;
      closed[u] = 1;
      for (const eid of nodes[u].edges) {
        const e = edges[eid];
        const w = e.a === u ? e.b : e.a;
        if (closed[w]) continue;
        // doors are only entered at the very end of a route
        if (nodes[w].kind === 'door' && w !== to) continue;
        const cost = g[u] + e.length + (e.kind === 'crosswalk' ? 6 : 0);
        if (cost < g[w]) {
          g[w] = cost;
          f[w] = cost + h(w);
          came[w] = u;
          open.push(w);
        }
      }
    }
    if (came[to] < 0) return null;
    const out = [to];
    let c = to;
    while (c !== from) {
      c = came[c];
      out.push(c);
    }
    return out.reverse();
  };

  const edgeBetween = (a: number, b: number) => {
    for (const eid of nodes[a].edges) {
      const e = edges[eid];
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    }
    return undefined;
  };

  const nearestNode = (x: number, z: number, filter?: (n: PedNode) => boolean) => {
    let best = -1,
      bd = Infinity;
    for (const n of nodes) {
      if (!inMain(n.id)) continue;
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  };

  const edgeY = (e: PedEdge, t: number): number => {
    if (e.kind === 'crosswalk') {
      // dropped curbs: sidewalk height for the first/last 1.9 m, road level between
      const d = t * e.length;
      const ramp = 1.9;
      const k = Math.min(Math.min(d, e.length - d) / ramp, 1);
      return SIDEWALK_Y * (1 - smooth(k)) + 0.01 * smooth(k);
    }
    const base = e.yA + (e.yB - e.yA) * t;
    if (e.yMid !== undefined) return base + (e.yMid - (e.yA + e.yB) / 2) * Math.sin(Math.PI * t);
    return base;
  };

  return {
    nodes,
    edges,
    doorNodes: doorNodes.filter(inMain),
    stationDoorNodes: stationDoorNodes.filter(inMain),
    busStopNodes,
    benches: benches.filter((b) => inMain(b.node)),
    leisureNodes: leisureNodes.filter(inMain),
    other,
    route,
    edgeBetween,
    nearestNode,
    edgeY,
    warnings,
  };
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}

/** Ray (origin o, unit dir v) vs segment (p0 + dir*u, u∈[0,len]); returns ray t or null. */
function rayLine(o: P2, v: P2, p0: P2, dir: P2, len: number): number | null {
  const den = v.x * dir.z - v.z * dir.x;
  if (Math.abs(den) < 1e-6) return null;
  const dx = p0.x - o.x,
    dz = p0.z - o.z;
  const t = (dx * dir.z - dz * dir.x) / den;
  const u = (dx * v.z - dz * v.x) / den;
  if (u < -0.05 || u > len + 0.05) return null;
  return t;
}

function segmentClear(occ: OccupancyGrid, x0: number, z0: number, x1: number, z1: number, flags: number): boolean {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(L / 0.25));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (occ.has(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, flags)) return false;
  }
  return true;
}
