// Lane-level road network built from the plan's road topology.
// Right-hand traffic, one lane per direction. Every lane runs from the exit
// point of one intersection to the stop line of the next. Movements are the
// curves through an intersection from an incoming lane to an outgoing lane.

import { CityPlan, PORTAL_W_NODE, PORTAL_E_NODE } from './plan';
import { Dir, DIR_VEC, OPPOSITE, P2, Path2, bezier3, polylineMinDist } from './geom';
import { LANE_OFFSET, STOPLINE, FURN_OFFSET, ROAD_HALF } from './constants';

export type Turn = 'straight' | 'left' | 'right';

export interface Lane {
  id: number;
  segment: number;
  from: number;
  to: number;
  /** arm of `from` the lane leaves along / arm of `to` it arrives on */
  fromArm: Dir;
  toArm: Dir;
  /** unit direction of travel */
  dir: P2;
  path: Path2;
  length: number;
  speed: number;
  /** movement ids available at the end of this lane (empty for sink lanes) */
  out: number[];
  /** movement ids feeding the start of this lane */
  in: number[];
  /** lane of the same segment in the opposite direction */
  opposite: number;
  /** level crossing on this lane (vehicles must stop at stopS while it is closed and must not stop within [s0, s1]) */
  crossing?: { id: number; stopS: number; s0: number; s1: number };
  /** bus stops on this lane: bus front stops at s */
  busStops: { id: number; s: number }[];
  /** lane ends inside a tunnel: vehicles despawn at its end */
  sink: boolean;
  /** lane starts inside a tunnel: vehicles may spawn at its start */
  source: boolean;
}

export interface Movement {
  id: number;
  node: number;
  fromLane: number;
  toLane: number;
  fromArm: Dir;
  toArm: Dir;
  turn: Turn;
  path: Path2;
  length: number;
  /** comfortable speed through the movement */
  speed: number;
  /** movements at the same node that may not be occupied at the same time */
  conflicts: number[];
  /** arms whose crosswalk this movement drives across */
  crosswalks: Dir[];
  /** 0 = straight/right (has priority over conflicting lefts), 1 = left */
  priority: number;
}

export interface SignalHead {
  x: number;
  z: number;
  /** yaw of the pole (signal faces approaching traffic: local +Z → this yaw) */
  yaw: number;
  /** arm whose incoming traffic this head controls */
  arm: Dir;
}

export interface Crosswalk {
  arm: Dir;
  /** the two corner points (walk-band centre) the crossing connects */
  a: P2;
  b: P2;
  /** zebra rectangle */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Intersection {
  id: number;
  x: number;
  z: number;
  control: 'signal' | 'stop' | 'none' | 'portal';
  arms: Dir[];
  inLane: Partial<Record<Dir, number>>;
  outLane: Partial<Record<Dir, number>>;
  movements: number[];
  crosswalks: Crosswalk[];
  /** signal poles (one per signalised approach, near-side right) */
  signals: SignalHead[];
  /** stop signs (one per stop-controlled approach) */
  stopSigns: SignalHead[];
  /** signal timing offset (s) for green-wave coordination */
  offset: number;
}

export interface LevelCrossing {
  id: number;
  x: number;
  z: number;
  lanes: { lane: number; stopS: number; s0: number; s1: number }[];
  /** written by the rail sim: true while vehicles must not enter */
  closed: boolean;
  /** written by the rail sim: barrier position 0 (up/open) .. 1 (down/closed) */
  gate: number;
  /** written by the traffic sim: vehicles currently inside [s0, s1] */
  occupied: number;
}

export interface BusRoute {
  id: number;
  name: string;
  color: string;
  /** cyclic sequence of lanes; movement k connects lanes[k] -> lanes[k+1] */
  lanes: number[];
  movements: number[];
}

export interface RoadNetwork {
  lanes: Lane[];
  movements: Movement[];
  /** indexed by road node id */
  intersections: Intersection[];
  crossings: LevelCrossing[];
  busRoutes: BusRoute[];
  sourceLanes: number[];
  sinkLanes: number[];
  laneBetween(from: number, to: number): Lane | undefined;
  movementBetween(fromLane: number, toLane: number): Movement | undefined;
}

const RIGHT = (d: P2): P2 => ({ x: -d.z, z: d.x });

function dirOf(ax: number, az: number, bx: number, bz: number): Dir {
  const dx = bx - ax,
    dz = bz - az;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'E' : 'W';
  return dz > 0 ? 'S' : 'N';
}

export function buildRoadNetwork(plan: CityPlan): RoadNetwork {
  const lanes: Lane[] = [];
  const movements: Movement[] = [];
  const nodes = plan.roadNodes;
  const intersections: Intersection[] = nodes.map((n) => ({
    id: n.id,
    x: n.x,
    z: n.z,
    control: n.control,
    arms: [],
    inLane: {},
    outLane: {},
    movements: [],
    crosswalks: [],
    signals: [],
    stopSigns: [],
    offset: 0,
  }));
  const laneMap = new Map<string, number>();

  // ── lanes
  for (const seg of plan.roadSegments) {
    const A = nodes[seg.a],
      B = nodes[seg.b];
    for (const [f, t] of [
      [A, B],
      [B, A],
    ] as const) {
      const L = Math.hypot(t.x - f.x, t.z - f.z);
      const d = { x: (t.x - f.x) / L, z: (t.z - f.z) / L };
      const r = RIGHT(d);
      const s0 = f.kind === 'portal' ? 0 : STOPLINE;
      const s1 = t.kind === 'portal' ? 0 : STOPLINE;
      const p0 = { x: f.x + d.x * s0 + r.x * LANE_OFFSET, z: f.z + d.z * s0 + r.z * LANE_OFFSET };
      const p1 = { x: t.x - d.x * s1 + r.x * LANE_OFFSET, z: t.z - d.z * s1 + r.z * LANE_OFFSET };
      const path = new Path2([p0, p1]);
      const lane: Lane = {
        id: lanes.length,
        segment: seg.id,
        from: f.id,
        to: t.id,
        fromArm: dirOf(f.x, f.z, t.x, t.z),
        toArm: dirOf(t.x, t.z, f.x, f.z),
        dir: d,
        path,
        length: path.length,
        speed: seg.speed,
        out: [],
        in: [],
        opposite: -1,
        busStops: [],
        sink: t.kind === 'portal',
        source: f.kind === 'portal',
      };
      lanes.push(lane);
      laneMap.set(`${f.id}>${t.id}`, lane.id);
    }
    const ab = laneMap.get(`${seg.a}>${seg.b}`)!,
      ba = laneMap.get(`${seg.b}>${seg.a}`)!;
    lanes[ab].opposite = ba;
    lanes[ba].opposite = ab;
  }

  // ── arms per intersection
  for (const lane of lanes) {
    const I = intersections[lane.from];
    if (!I.arms.includes(lane.fromArm)) I.arms.push(lane.fromArm);
    I.outLane[lane.fromArm] = lane.id;
    const J = intersections[lane.to];
    J.inLane[lane.toArm] = lane.id;
  }

  // ── movements
  for (const I of intersections) {
    if (I.control === 'portal') continue;
    for (const inArm of I.arms) {
      const inId = I.inLane[inArm];
      if (inId === undefined) continue;
      for (const outArm of I.arms) {
        if (outArm === inArm) continue; // no U-turns (no dead ends in this network)
        const outId = I.outLane[outArm];
        if (outId === undefined) continue;
        const inL = lanes[inId],
          outL = lanes[outId];
        const P0 = inL.path.at(inL.length);
        const P3 = outL.path.at(0);
        const tIn = inL.dir,
          tOut = outL.dir;
        const cross = tIn.x * tOut.z - tIn.z * tOut.x;
        const turn: Turn = outArm === OPPOSITE[inArm] ? 'straight' : cross > 0 ? 'right' : 'left';
        let pts: P2[];
        let speed: number;
        if (turn === 'straight') {
          pts = [P0, { x: (P0.x + P3.x) / 2, z: (P0.z + P3.z) / 2 }, P3];
          speed = Math.min(inL.speed, outL.speed);
        } else {
          const R = Math.hypot(P3.x - P0.x, P3.z - P0.z) / Math.SQRT2;
          const k = 0.5523 * R;
          pts = bezier3(P0, { x: P0.x + tIn.x * k, z: P0.z + tIn.z * k }, { x: P3.x - tOut.x * k, z: P3.z - tOut.z * k }, P3, 14);
          speed = Math.max(3.8, Math.sqrt(2.6 * R));
        }
        const path = new Path2(pts);
        const m: Movement = {
          id: movements.length,
          node: I.id,
          fromLane: inId,
          toLane: outId,
          fromArm: inArm,
          toArm: outArm,
          turn,
          path,
          length: path.length,
          speed,
          conflicts: [],
          crosswalks: [],
          priority: turn === 'left' ? 1 : 0,
        };
        movements.push(m);
        I.movements.push(m.id);
        inL.out.push(m.id);
        outL.in.push(m.id);
      }
    }
    // conflicts
    for (const a of I.movements) {
      for (const b of I.movements) {
        if (a >= b) continue;
        const ma = movements[a],
          mb = movements[b];
        let conflict = false;
        if (ma.fromLane === mb.fromLane || ma.toLane === mb.toLane) conflict = true;
        else if (polylineMinDist(ma.path.pts, mb.path.pts) < 2.6) conflict = true;
        if (conflict) {
          ma.conflicts.push(b);
          mb.conflicts.push(a);
        }
      }
    }
  }

  // ── crosswalks, signal heads, stop signs
  const segHasSidewalk = (from: number, arm: Dir): boolean => {
    const lid = intersections[from].outLane[arm];
    return lid !== undefined && plan.roadSegments[lanes[lid].segment].sidewalks;
  };
  for (const I of intersections) {
    if (I.control === 'portal') continue;
    const hasSidewalkNear = I.arms.some((a) => segHasSidewalk(I.id, a));
    if (!hasSidewalkNear) continue;
    for (const arm of I.arms) {
      const v = DIR_VEC[arm];
      const side = RIGHT(v); // to the right when looking out along the arm
      const W = 5.4; // walk band centre offset (== WALK_OFFSET)
      const mid = 5.4;
      const a = { x: I.x + v.x * mid - side.x * W, z: I.z + v.z * mid - side.z * W };
      const b = { x: I.x + v.x * mid + side.x * W, z: I.z + v.z * mid + side.z * W };
      // zebra rect spans the carriageway across the arm, 4..7 m out
      const c0 = { x: I.x + v.x * 4 - side.x * ROAD_HALF, z: I.z + v.z * 4 - side.z * ROAD_HALF };
      const c1 = { x: I.x + v.x * 7 + side.x * ROAD_HALF, z: I.z + v.z * 7 + side.z * ROAD_HALF };
      I.crosswalks.push({ arm, a, b, x0: Math.min(c0.x, c1.x), z0: Math.min(c0.z, c1.z), x1: Math.max(c0.x, c1.x), z1: Math.max(c0.z, c1.z) });
    }
    for (const mid of I.movements) {
      const m = movements[mid];
      m.crosswalks = I.crosswalks.filter((cw) => cw.arm === m.fromArm || cw.arm === m.toArm).map((cw) => cw.arm);
    }
    for (const arm of I.arms) {
      if (I.inLane[arm] === undefined) continue;
      const v = DIR_VEC[arm];
      // approaching traffic travels -v; its right-hand side is RIGHT(-v) = -RIGHT(v)
      const r = RIGHT({ x: -v.x, z: -v.z });
      const pos = { x: I.x + v.x * (STOPLINE + 0.4) + r.x * FURN_OFFSET, z: I.z + v.z * (STOPLINE + 0.4) + r.z * FURN_OFFSET };
      const head: SignalHead = { x: pos.x, z: pos.z, yaw: Math.atan2(v.x, v.z), arm };
      if (I.control === 'signal') I.signals.push(head);
      else if (I.control === 'stop') I.stopSigns.push(head);
    }
    const n = plan.roadNodes[I.id];
    I.offset = ((Math.round(n.x / 55) * 7 + Math.round(n.z / 55) * 11) % 48 + 48) % 48;
  }

  // ── bus stops on lanes
  for (const bs of plan.busStops) {
    const lid = laneMap.get(`${bs.from}>${bs.to}`);
    if (lid === undefined) continue;
    const lane = lanes[lid];
    lane.busStops.push({ id: bs.id, s: Math.max(4, Math.min(lane.length - 2, bs.along - STOPLINE)) });
  }

  // ── level crossings (track at plan.rail.z crosses the tunnel roads)
  const crossings: LevelCrossing[] = [];
  for (const cdef of plan.rail.crossings) {
    const lc: LevelCrossing = { id: cdef.id, x: cdef.x, z: plan.rail.z, lanes: [], closed: false, gate: 0, occupied: 0 };
    for (const [f, t] of [
      [cdef.portalNode, cdef.nodeSouth],
      [cdef.nodeSouth, cdef.portalNode],
    ]) {
      const lid = laneMap.get(`${f}>${t}`);
      if (lid === undefined) continue;
      const lane = lanes[lid];
      const { s } = lane.path.project({ x: cdef.x, z: plan.rail.z });
      const s0 = s - 3.2,
        s1 = s + 3.2;
      lane.crossing = { id: lc.id, stopS: s0 - 2.2, s0, s1 };
      lc.lanes.push({ lane: lid, stopS: s0 - 2.2, s0, s1 });
    }
    crossings.push(lc);
  }

  // ── bus routes
  const movementBetween = (a: number, b: number) => {
    for (const mid of lanes[a].out) if (movements[mid].toLane === b) return movements[mid];
    return undefined;
  };
  const busRoutes: BusRoute[] = plan.busRoutes.map((r) => {
    const ls: number[] = [];
    for (let k = 0; k < r.nodes.length; k++) {
      const a = r.nodes[k],
        b = r.nodes[(k + 1) % r.nodes.length];
      const lid = laneMap.get(`${a}>${b}`);
      if (lid === undefined) throw new Error(`bus route ${r.name}: missing lane ${a}>${b}`);
      ls.push(lid);
    }
    const ms: number[] = [];
    for (let k = 0; k < ls.length; k++) {
      const m = movementBetween(ls[k], ls[(k + 1) % ls.length]);
      if (!m) throw new Error(`bus route ${r.name}: no movement ${ls[k]} -> ${ls[(k + 1) % ls.length]}`);
      ms.push(m.id);
    }
    return { id: r.id, name: r.name, color: r.color, lanes: ls, movements: ms };
  });

  return {
    lanes,
    movements,
    intersections,
    crossings,
    busRoutes,
    sourceLanes: lanes.filter((l) => l.source).map((l) => l.id),
    sinkLanes: lanes.filter((l) => l.sink).map((l) => l.id),
    laneBetween: (a, b) => {
      const id = laneMap.get(`${a}>${b}`);
      return id === undefined ? undefined : lanes[id];
    },
    movementBetween,
  };
}

void PORTAL_W_NODE;
void PORTAL_E_NODE;
