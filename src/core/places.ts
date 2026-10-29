// Places between buildings: level changes, stairs, passages and a lower quay — layout data only
// (no three.js). Built once at the end of generatePlan() from the finished plan, so the rng stream
// (and with it the rest of the city) is unchanged. Everything here flows into:
//   * plan.paths      walkways with per-vertex heights (`ys`) → pedNetwork edges → pedestrians on the stairs
//   * plan.lots       footprints trimmed where a passage cuts through a row of townhouses (buildings derive)
//   * plan.isWater    the lower quay is dry ground inside the river channel (occupancy, boats, peds)
//   * places.height   walking-surface height of every terrace / stair / quay → ctx.services.terrain.height
//                     (vegetation, props, lamps, the first-person walk)
//   * places.walls    thin solid boxes (balustrades, handrails) for the first-person walk
// The stonework / ironwork is drawn by world/terrain/places.ts into the masonry + railing meshes.
//
// Places (each with its own URL switch; ?noplaces turns them all off):
//   lowquay  (?nolowquay)  a lower quay walk along the north river wall, x -63..11, 0.85 m above the water,
//                          reached by two stone flights from the promenade (gaps in the iron railing)
//   oldlane  (?nooldlane)  Old Town block (4,1): an archway passage under a gatehouse from the avenue into a
//                          paved pocket square, a raised garden terrace behind a balustraded retaining wall
//                          with a recessed flight, and a stepped lane down through the north row to the street

import type { CityPlan, Lot, WalkPath, Bench } from './plan';
import { RIVER, SIDEWALK_Y } from './constants';
import { P2, Rect, rect } from './geom';
import { hashString } from './rng';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

export type PlaceId = 'lowquay' | 'oldlane';

/** a straight flight: `n` risers between yBot and yTop, rising along `axis` in direction `up` */
export interface PlaceStair {
  rect: Rect;
  axis: 'x' | 'z';
  up: 1 | -1;
  yBot: number;
  yTop: number;
  n: number;
}

export interface QuayPlace {
  x0: number;
  x1: number;
  /** water face of the river wall / outer (water) edge of the ledge */
  zWall: number;
  zEdge: number;
  y: number;
  landings: Rect[];
  landingY: number;
  stairs: PlaceStair[];
  /** outer edge of the flights (cheek wall + handrail line) */
  zCheek: number;
  bollards: P2[];
}

export interface LanePlace {
  block: Rect;
  /** passage under the gatehouse (street → square), the paved square, the raised terrace, the stepped lane */
  passage: Rect;
  square: Rect;
  terrace: Rect;
  lane: Rect;
  squareY: number;
  terraceY: number;
  /** retaining wall line z (square side) and the gap where the recessed flight comes down */
  wallZ: number;
  stair: PlaceStair;
  laneStairs: PlaceStair[];
  /** gatehouse over the passage: arch springing / crown, eave line of the block above it */
  gate: { rect: Rect; spring: number; crown: number; eave: number; ridge: number };
}

export interface PlacesDef {
  on: Record<PlaceId, boolean>;
  quay: QuayPlace | null;
  lane: LanePlace | null;
  /** solid thin boxes for the first-person walk (balustrades, handrails, cheek walls) */
  walls: Rect[];
  /** promenade railing gaps on the north river wall (stair landings) */
  railGaps: { x: number; half: number }[];
  /** river-wall ladders that would end on the quay (dropped) */
  dropLadder(x: number, z: number): boolean;
  /** walking-surface height of a place at (x, z), NaN outside every place */
  height(x: number, z: number): number;
  /** dry ground inside open water (the lower quay) */
  dry(x: number, z: number): boolean;
}

interface Floor {
  r: Rect;
  y: number;
}

const inR = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** height of a flight at (x, z) — tread i (counted from the bottom edge) is i+1 risers up; the last one is flush with the top */
export function stairY(s: PlaceStair, x: number, z: number): number {
  const r = s.rect;
  const L = s.axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
  const u = s.axis === 'x' ? (s.up > 0 ? x - r.x0 : r.x1 - x) : s.up > 0 ? z - r.z0 : r.z1 - z;
  const t = L / s.n;
  const i = Math.max(0, Math.min(s.n - 1, Math.floor(u / t)));
  return s.yBot + ((s.yTop - s.yBot) * (i + 1)) / s.n;
}

/** the bottom / top edge mid-points of a flight (walkway nodes) */
export function stairEnds(s: PlaceStair): { bot: P2; top: P2 } {
  const r = s.rect;
  const cx = (r.x0 + r.x1) / 2,
    cz = (r.z0 + r.z1) / 2;
  if (s.axis === 'x') {
    const lo = { x: r.x0, z: cz },
      hi = { x: r.x1, z: cz };
    return s.up > 0 ? { bot: lo, top: hi } : { bot: hi, top: lo };
  }
  const lo = { x: cx, z: r.z0 },
    hi = { x: cx, z: r.z1 };
  return s.up > 0 ? { bot: lo, top: hi } : { bot: hi, top: lo };
}

function addPath(plan: CityPlan, p: Omit<WalkPath, 'id' | 'linkEnds' | 'y'> & { linkEnds?: (0 | 1)[]; ys: number[] }): void {
  plan.paths.push({ linkEnds: [], ...p, y: p.ys[0], id: plan.paths.length });
}

function bench(plan: CityPlan, x: number, z: number, yaw: number, ax: number, az: number): void {
  plan.benches.push({ x, z, yaw, ax, az } as Bench);
}

// ───────────────────────────────────────────────────────── lower quay ──

function buildQuay(plan: CityPlan, floors: Floor[], stairs: PlaceStair[], walls: Rect[], gaps: { x: number; half: number }[]): QuayPlace {
  const zWall = RIVER.z0 + 0.25; // water face of the north wall (RIVER_WALL_T / 2)
  const zEdge = RIVER.z0 + 4.0;
  const y = -0.75; // 0.85 m above the river
  const landingY = SIDEWALK_Y + 0.2 - 0.01; // flush with the wall coping (1 cm under it: no z-fight)
  const zCheek = zWall + 1.7;
  const LW = 2.0; // landing length along the wall
  const n = 7,
    tread = 0.3;
  // west landing at -63.2..-61.2 (clear of the promenade bench at x = -64), east landing at 8.9..10.9
  const x0 = -63.2,
    x1 = 10.9;
  const lW = rect(x0, RIVER.z0 - 0.3, x0 + LW, zCheek);
  const lE = rect(x1 - LW, RIVER.z0 - 0.3, x1, zCheek);
  const sW: PlaceStair = { rect: rect(x0 + LW, zWall, x0 + LW + n * tread, zCheek), axis: 'x', up: -1, yBot: y, yTop: landingY, n };
  const sE: PlaceStair = { rect: rect(x1 - LW - n * tread, zWall, x1 - LW, zCheek), axis: 'x', up: 1, yBot: y, yTop: landingY, n };
  stairs.push(sW, sE);
  floors.push({ r: lW, y: landingY }, { r: lE, y: landingY }, { r: rect(x0, zWall - 0.05, x1, zEdge), y });
  // handrail along the outer cheek of each flight + the landing edge (the drop to the quay)
  walls.push(rect(x0, zCheek - 0.04, sW.rect.x1, zCheek + 0.08), rect(sE.rect.x0, zCheek - 0.04, x1, zCheek + 0.08));
  gaps.push({ x: x0 + LW / 2, half: LW / 2 + 0.05 }, { x: x1 - LW / 2, half: LW / 2 + 0.05 });

  // walkways: promenade → landing → flight → quay walk → flight → landing → promenade
  const zProm = (100 + 6.5 + RIVER.z0) / 2; // promenade walk line (plan.ts genRiverside: (zP0 + RIVER.z0) / 2)
  const zL = (zWall + zCheek) / 2; // stair / landing centre line
  const zQ = (zCheek + zEdge) / 2 + 0.05; // quay walk centre line (beside the flights)
  const xW = x0 + LW / 2,
    xE = x1 - LW / 2;
  const wB = stairEnds(sW).bot,
    eB = stairEnds(sE).bot;
  const pts: P2[] = [
    { x: xW, z: zProm },
    { x: xW, z: RIVER.z0 - 0.35 },
    { x: xW, z: RIVER.z0 - 0.15 },
    { x: xW, z: zL },
    { x: sW.rect.x0, z: zL },
    { x: wB.x, z: zL },
    { x: wB.x + 1.4, z: zQ },
  ];
  const ys = [SIDEWALK_Y, SIDEWALK_Y, landingY, landingY, landingY, y, y];
  // quay walk vertices every ~7 m; every other one gets a bench against the wall, facing the water
  let k = 0;
  for (let x = wB.x + 1.4 + 7; x < eB.x - 1.4 - 4; x += 7, k++) {
    pts.push({ x, z: zQ });
    ys.push(y);
    if (k % 2 === 1) bench(plan, x, zWall + 0.5, 0, x, zQ);
  }
  pts.push({ x: eB.x - 1.4, z: zQ }, { x: eB.x, z: zL }, { x: sE.rect.x1, z: zL }, { x: xE, z: zL }, { x: xE, z: RIVER.z0 - 0.15 }, { x: xE, z: RIVER.z0 - 0.35 }, { x: xE, z: zProm });
  ys.push(y, y, landingY, landingY, landingY, SIDEWALK_Y, SIDEWALK_Y);
  addPath(plan, { kind: 'promenade', pts, ys, width: 1.9, surface: 'stone', draw: false });

  // mooring bollards along the edge
  const bollards: P2[] = [];
  for (let x = x0 + 4; x < x1 - 3; x += 9) bollards.push({ x, z: zEdge - 0.32 });
  return { x0, x1, zWall, zEdge, y, landings: [lW, lE], landingY, stairs: [sW, sE], zCheek, bollards };
}

// ─────────────────────────────────────────────────────── old-town lane ──

/**
 * Cut a passage of half width `half` through the townhouse row facing `side` (N or S) at about x = cx:
 * at the nearest party wall within 4 m (else through the middle of a house, which is split in two).
 * Returns the passage centre x and the lots on either side.
 */
function cutRow(plan: CityPlan, blockId: number, side: 'N' | 'S', cx: number, half: number): { x: number; left: Lot; right: Lot } | null {
  const row = plan.lots.filter((l) => l.blockId === blockId && l.front === side && l.kind === 'townhouse').sort((a, b) => a.rect.x0 - b.rect.x0);
  if (!row.length) return null;
  let best = NaN;
  for (let i = 0; i < row.length - 1; i++) {
    const b = row[i].rect.x1;
    if (Math.abs(b - cx) < 4 && !(Math.abs(best - cx) <= Math.abs(b - cx))) best = b;
  }
  let p = best === best ? best : cx;
  let left = row.find((l) => l.rect.x0 < p - 1e-3 && l.rect.x1 >= p - 1e-3);
  let right = row.find((l) => l.rect.x1 > p + 1e-3 && l.rect.x0 <= p + 1e-3);
  if (!left || !right) return null;
  if (left === right) {
    // split the house: the east part becomes a new lot (appended: lot ids before it are unchanged)
    const src = left;
    const r2: Lot = {
      ...src,
      rect: { ...src.rect },
      footprint: { ...src.footprint },
      doors: src.doors.map((d) => ({ ...d })),
      id: plan.lots.length,
      seed: hashString(`places:${src.seed}`) % 1000000000,
    };
    plan.lots.push(r2);
    plan.blocks[blockId].lots.push(r2.id);
    right = r2;
  }
  left.rect.x1 = left.footprint.x1 = p - half;
  right.rect.x0 = right.footprint.x0 = p + half;
  // keep the doors on what is left of each facade
  for (const l of [left, right]) {
    for (const d of l.doors) if (d.dir === 'N' || d.dir === 'S') d.x = Math.min(Math.max(d.x, l.footprint.x0 + 1.0), l.footprint.x1 - 1.0);
  }
  p = (left.rect.x1 + right.rect.x0) / 2;
  return { x: p, left, right };
}

function buildLane(plan: CityPlan, floors: Floor[], stairs: PlaceStair[], walls: Rect[]): LanePlace | null {
  const blk = plan.blocks.find((b) => b.col === 4 && b.row === 1 && b.kind === 'oldtown');
  if (!blk) return null;
  const court = plan.areas.find((a) => a.blockId === blk.id && a.kind === 'courtyard');
  if (!court) return null;
  const c = court.rect; // 74..91 × -46..-29
  const cx = (c.x0 + c.x1) / 2;
  const S = cutRow(plan, blk.id, 'S', cx, 1.6);
  const N = cutRow(plan, blk.id, 'N', cx - 2.5, 1.4);
  if (!S || !N) return null;
  const squareY = SIDEWALK_Y; // flush with the avenue sidewalk through the archway
  const terraceY = SIDEWALK_Y + 6 * 0.15; // 1.05: about the rear ground-floor sills
  const wallZ = c.z1 - 8; // -37: square 8 m deep, terrace 9 m
  const passage = rect(S.x - 1.6, c.z1, S.x + 1.6, blk.rect.z1);
  const square = rect(c.x0, wallZ, c.x1, c.z1);
  const terrace = rect(c.x0, c.z0, c.x1, wallZ);
  const lane = rect(N.x - 1.4, blk.rect.z0, N.x + 1.4, c.z0);
  // recessed flight up into the terrace, on the archway axis
  const stair: PlaceStair = { rect: rect(S.x - 1.6, wallZ - 6 * 0.3, S.x + 1.6, wallZ), axis: 'z', up: -1, yBot: squareY, yTop: terraceY, n: 6 };
  // the stepped lane: two flights of three with a landing between them
  const fA: PlaceStair = { rect: rect(lane.x0, c.z0 - 1.0 - 3 * 0.32, lane.x1, c.z0 - 1.0), axis: 'z', up: 1, yBot: (terraceY + squareY) / 2, yTop: terraceY, n: 3 };
  const fB: PlaceStair = { rect: rect(lane.x0, c.z0 - 5.6 - 3 * 0.32, lane.x1, c.z0 - 5.6), axis: 'z', up: 1, yBot: squareY, yTop: (terraceY + squareY) / 2, n: 3 };
  stairs.push(stair, fA, fB);
  floors.push(
    { r: rect(lane.x0, fA.rect.z1, lane.x1, c.z0 + 0.01), y: terraceY },
    { r: rect(lane.x0, fB.rect.z1, lane.x1, fA.rect.z0), y: fA.yBot },
    { r: rect(lane.x0, lane.z0, lane.x1, fB.rect.z0), y: squareY },
    { r: terrace, y: terraceY },
    { r: square, y: squareY },
    { r: passage, y: squareY },
  );
  // balustrades on the retaining wall and along the recess cheeks (walk-mode solids)
  walls.push(
    rect(c.x0, wallZ - 0.32, stair.rect.x0 + 0.02, wallZ - 0.02),
    rect(stair.rect.x1 - 0.02, wallZ - 0.32, c.x1, wallZ - 0.02),
    rect(stair.rect.x0 - 0.3, stair.rect.z0, stair.rect.x0, wallZ - 0.02),
    rect(stair.rect.x1, stair.rect.z0, stair.rect.x1 + 0.3, wallZ - 0.02),
  );
  // the terrace keeps the courtyard's garden (trees, bins, bikes): only behind the retaining wall now
  court.rect = { ...terrace };
  const L = S.left,
    R = S.right;
  const eave = Math.min(L.floors, R.floors) * 3.3 + 0.2;
  const gate = { rect: passage, spring: 2.5, crown: 2.5 + 1.6, eave, ridge: eave + 1.9 };

  // walkways (plaza kind, drawn by the stonework): avenue → archway → square → flight → terrace → lane → street
  const tz = (c.z0 + wallZ) / 2 - 0.5; // terrace walk line
  const sTop = stairEnds(stair).top;
  addPath(plan, {
    kind: 'plaza',
    pts: [{ x: S.x, z: blk.rect.z1 }, { x: S.x, z: c.z1 }, { x: S.x, z: wallZ - 0.15 + 0.15 }, { x: S.x, z: sTop.z + 0.3 }, { x: S.x, z: tz }],
    ys: [squareY, squareY, squareY, terraceY, terraceY],
    width: 2.6,
    surface: 'stone',
    draw: false,
    linkEnds: [0],
  });
  const tx0 = c.x0 + 1.8,
    tx1 = c.x1 - 1.8;
  const xs = [tx0, S.x, N.x, tx1].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 0.3);
  addPath(plan, { kind: 'plaza', pts: xs.map((x) => ({ x, z: tz })), ys: xs.map(() => terraceY), width: 2.4, surface: 'gravel', draw: false });
  addPath(plan, {
    kind: 'plaza',
    pts: [{ x: N.x, z: tz }, { x: N.x, z: fA.rect.z1 }, { x: N.x, z: fA.rect.z0 }, { x: N.x, z: fB.rect.z1 }, { x: N.x, z: fB.rect.z0 }, { x: N.x, z: blk.rect.z0 }],
    ys: [terraceY, terraceY, fA.yBot, fA.yBot, squareY, squareY],
    width: 2.2,
    surface: 'stone',
    draw: false,
    linkEnds: [1],
  });
  // square: a cross walk along the wall foot with benches facing the fountain-less centre
  const qz = wallZ + 1.6;
  addPath(plan, { kind: 'plaza', pts: [{ x: c.x0 + 2.2, z: qz }, { x: S.x, z: qz }, { x: c.x1 - 2.2, z: qz }], ys: [squareY, squareY, squareY], width: 2.2, surface: 'stone', draw: false });
  // the cross walk meets the archway axis: make it a vertex of the first path
  const P0 = plan.paths[plan.paths.length - 4];
  P0.pts.splice(2, 0, { x: S.x, z: qz });
  P0.ys!.splice(2, 0, squareY);
  bench(plan, c.x0 + 3.4, qz + 1.5, Math.PI, c.x0 + 3.4, qz);
  bench(plan, c.x1 - 3.4, qz + 1.5, Math.PI, c.x1 - 3.4, qz);
  bench(plan, (tx0 + Math.min(S.x, N.x)) / 2, tz - 1.9, 0, (tx0 + Math.min(S.x, N.x)) / 2, tz);
  bench(plan, (tx1 + Math.max(S.x, N.x)) / 2, tz + 1.9, Math.PI, (tx1 + Math.max(S.x, N.x)) / 2, tz);
  const Pq = plan.paths[plan.paths.length - 1];
  for (const x of [c.x0 + 3.4, c.x1 - 3.4]) {
    const k = Pq.pts.findIndex((p) => p.x > x);
    Pq.pts.splice(k, 0, { x, z: qz });
    Pq.ys!.splice(k, 0, squareY);
  }
  const Pt = plan.paths[plan.paths.length - 3];
  for (const x of [(tx0 + Math.min(S.x, N.x)) / 2, (tx1 + Math.max(S.x, N.x)) / 2]) {
    const k = Pt.pts.findIndex((p) => p.x > x);
    if (k > 0 && Math.abs(Pt.pts[k].x - x) > 0.3 && Math.abs(Pt.pts[k - 1].x - x) > 0.3) {
      Pt.pts.splice(k, 0, { x, z: tz });
      Pt.ys!.splice(k, 0, terraceY);
    }
  }
  return { block: blk.rect, passage, square, terrace, lane, squareY, terraceY, wallZ, stair, laneStairs: [fA, fB], gate };
}

// ───────────────────────────────────────────────────────────── build ──

export function buildPlaces(plan: CityPlan): PlacesDef {
  const all = !params.has('noplaces');
  const on: Record<PlaceId, boolean> = {
    lowquay: all && !params.has('nolowquay'),
    oldlane: all && !params.has('nooldlane'),
  };
  const floors: Floor[] = [];
  const stairs: PlaceStair[] = [];
  const walls: Rect[] = [];
  const railGaps: { x: number; half: number }[] = [];
  const quay = on.lowquay ? buildQuay(plan, floors, stairs, walls, railGaps) : null;
  const lane = on.oldlane ? buildLane(plan, floors, stairs, walls) : null;
  // overall bounds of each place for a fast reject
  const boxes: Rect[] = [];
  if (quay) boxes.push(rect(quay.x0, RIVER.z0 - 0.4, quay.x1, quay.zEdge));
  if (lane) boxes.push(rect(lane.block.x0, lane.block.z0, lane.block.x1, lane.block.z1));
  const dryR = quay ? rect(quay.x0, RIVER.z0, quay.x1, quay.zEdge) : null;
  const height = (x: number, z: number): number => {
    let hit = false;
    for (const b of boxes) if (inR(b, x, z)) hit = true;
    if (!hit) return NaN;
    for (const s of stairs) if (inR(s.rect, x, z)) return stairY(s, x, z);
    for (const f of floors) if (inR(f.r, x, z)) return f.y;
    return NaN;
  };
  return {
    on,
    quay,
    lane,
    walls,
    railGaps,
    dropLadder: (x, z) => !!dryR && x > dryR.x0 - 0.6 && x < dryR.x1 + 0.6 && Math.abs(z - RIVER.z0) < 0.5,
    height,
    dry: (x, z) => !!dryR && inR(dryR, x, z),
  };
}
