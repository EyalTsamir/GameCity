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
//                          reached by a stone flight (west) and a long ramp (east) from the promenade (gaps in
//                          the iron railing)
//   oldlane  (?nooldlane)  Old Town block (4,1): an archway passage under a gatehouse from the avenue into a
//                          paved pocket square, a raised garden terrace behind a balustraded retaining wall
//                          with a recessed flight, and a stepped lane down through the north row to the street
//   station  (?nostationfront)  Central Station: facade set back 2.5 m for a granite forecourt; a two-step perron
//                          across the three doors with cheek blocks and lamp standards
//   cutting  (?nocutwall)  a masonry retaining wall with pilasters at the toe of the rock cut behind the tracks
//   waterstairs (?nowaterstairs)  water stairs down the south river wall by the rowing club and down the harbour
//                          sea wall (south of the cargo ship), a boat slipway through the south river wall
//   islandbridge (?noislandbridge)  Central Park: a humped timber footbridge from the pond loop to the island,
//                          ending on a little landing deck with a bench

import type { CityPlan, Lot, WalkPath, Bench } from './plan';
import { QUAY_X, RIVER, SIDEWALK_Y, WATER_LEVEL } from './constants';
import { RIDGE_FOOT_Z } from './plan';
import { P2, Rect, rect } from './geom';
import { hashString } from './rng';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

export type PlaceId = 'lowquay' | 'oldlane' | 'islandbridge' | 'station' | 'cutting' | 'waterstairs';

/** a straight flight: `n` risers between yBot and yTop, rising along `axis` in direction `up` */
export interface PlaceStair {
  rect: Rect;
  axis: 'x' | 'z';
  up: 1 | -1;
  yBot: number;
  yTop: number;
  n: number;
}

/** a straight ramp rising linearly from yBot to yTop along `axis` in direction `up` */
export interface PlaceRamp {
  rect: Rect;
  axis: 'x' | 'z';
  up: 1 | -1;
  yBot: number;
  yTop: number;
}

export function rampY(r: PlaceRamp, x: number, z: number): number {
  const R = r.rect;
  const L = r.axis === 'x' ? R.x1 - R.x0 : R.z1 - R.z0;
  const u = r.axis === 'x' ? (r.up > 0 ? x - R.x0 : R.x1 - x) : r.up > 0 ? z - R.z0 : R.z1 - z;
  return r.yBot + (r.yTop - r.yBot) * Math.max(0, Math.min(1, u / L));
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
  /** the east access: a long ramp along the wall (carts, prams, the rowing club's boats) */
  ramp: PlaceRamp;
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

export interface IslandBridgePlace {
  /** bridge centre line x, bank end z0 (on the shore path side) → island end z1, deck width */
  x: number;
  z0: number;
  z1: number;
  w: number;
  y0: number;
  y1: number;
  rise: number;
  /** timber landing on the island's edge */
  deck: Rect;
  deckY: number;
}

export function islandBridgeY(b: IslandBridgePlace, z: number): number {
  const t = Math.max(0, Math.min(1, (z - b.z0) / (b.z1 - b.z0)));
  return b.y0 + (b.y1 - b.y0) * t + b.rise * Math.sin(Math.PI * t);
}

export interface StationPlace {
  /** granite forecourt between the sidewalk and the (set back) facade, flush with the sidewalk */
  forecourt: Rect;
  /** the perron in front of the doors: landing + flight down to the forecourt, cheek blocks at both ends */
  landing: Rect;
  landingY: number;
  stair: PlaceStair;
  cheeks: Rect[];
  cheekY: number;
}

/** masonry retaining wall at the toe of the rock cut north of the tracks */
export interface CuttingPlace {
  x0: number;
  x1: number;
  /** wall face line (south face) and thickness */
  z: number;
  t: number;
  top: number;
}

/** a flight down a quay wall into the water: top landing flush with the coping, steps, a wet landing at the waterline */
export interface WaterStairs {
  id: string;
  /** wall line + outward (water) normal; the flight runs along the wall */
  stair: PlaceStair;
  top: Rect;
  topY: number;
  bottom: Rect;
  bottomY: number;
  /** footprint of the whole thing in front of the wall (body from the bed) */
  body: Rect;
  /** outer edge (handrail line) — side facing the water */
  railSide: 'x0' | 'x1' | 'z0' | 'z1';
}

/** a boat slipway cut through the south river wall */
export interface Slipway {
  ramp: PlaceRamp;
  /** under-water toe */
  toeY: number;
}

export interface PlacesDef {
  on: Record<PlaceId, boolean>;
  quay: QuayPlace | null;
  lane: LanePlace | null;
  island: IslandBridgePlace | null;
  station: StationPlace | null;
  cutting: CuttingPlace | null;
  waterStairs: WaterStairs[];
  slipway: Slipway | null;
  /** parapet gaps on the south river wall (x ranges) and holes through its body (slipway) */
  southParapetGaps: [number, number][];
  southWallHoles: [number, number][];
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

function buildQuay(plan: CityPlan, floors: Floor[], stairs: PlaceStair[], ramps: PlaceRamp[], walls: Rect[], gaps: { x: number; half: number }[]): QuayPlace {
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
  // east: a 1:11 ramp down along the wall instead of a flight
  const rE: PlaceRamp = { rect: rect(x1 - LW - 12, zWall, x1 - LW, zCheek), axis: 'x', up: 1, yBot: y, yTop: landingY };
  stairs.push(sW);
  ramps.push(rE);
  floors.push({ r: lW, y: landingY }, { r: lE, y: landingY }, { r: rect(x0, zWall - 0.05, x1, zEdge), y });
  // handrail along the outer cheek of each flight + the landing edge (the drop to the quay)
  walls.push(rect(x0, zCheek - 0.04, sW.rect.x1, zCheek + 0.08), rect(rE.rect.x0 + 2.5, zCheek - 0.04, x1, zCheek + 0.08));
  gaps.push({ x: x0 + LW / 2, half: LW / 2 + 0.05 }, { x: x1 - LW / 2, half: LW / 2 + 0.05 });

  // walkways: promenade → landing → flight → quay walk → flight → landing → promenade
  const zProm = (100 + 6.5 + RIVER.z0) / 2; // promenade walk line (plan.ts genRiverside: (zP0 + RIVER.z0) / 2)
  const zL = (zWall + zCheek) / 2; // stair / landing centre line
  const zQ = (zCheek + zEdge) / 2 + 0.05; // quay walk centre line (beside the flights)
  const xW = x0 + LW / 2,
    xE = x1 - LW / 2;
  const wB = stairEnds(sW).bot,
    eB = { x: rE.rect.x0, z: zL };
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
  pts.push({ x: eB.x - 1.4, z: zQ }, { x: eB.x, z: zL }, { x: (eB.x + rE.rect.x1) / 2, z: zL }, { x: rE.rect.x1, z: zL }, { x: xE, z: zL }, { x: xE, z: RIVER.z0 - 0.15 }, { x: xE, z: RIVER.z0 - 0.35 }, { x: xE, z: zProm });
  ys.push(y, y, (y + landingY) / 2, landingY, landingY, landingY, SIDEWALK_Y, SIDEWALK_Y);
  addPath(plan, { kind: 'promenade', pts, ys, width: 1.9, surface: 'stone', draw: false });

  // mooring bollards along the edge
  const bollards: P2[] = [];
  for (let x = x0 + 4; x < x1 - 3; x += 9) bollards.push({ x, z: zEdge - 0.32 });
  return { x0, x1, zWall, zEdge, y, landings: [lW, lE], landingY, stairs: [sW], ramp: rE, zCheek, bollards };
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

// ──────────────────────────────────────────────────── pond-island bridge ──

function buildIsland(plan: CityPlan, walls: Rect[]): IslandBridgePlace | null {
  const isl = plan.features.find((f) => f.kind === 'pondisland');
  const pond = plan.water?.ponds[0];
  if (!isl || !pond) return null;
  const ir = Number(isl.params?.radius ?? isl.radius);
  // the island becomes reachable (no solid disc; renderers read params.radius)
  isl.radius = 0;
  const x = isl.x;
  // the pond loop path (plan.ts genPark): ellipse rx + 3.6 / rz + 3.4, 24 segments — the point on it north of the island
  const prx = pond.rx + 3.6,
    prz = pond.rz + 3.4;
  let zRing = NaN;
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * Math.PI * 2,
      a1 = ((k + 1) / 24) * Math.PI * 2;
    const p0 = { x: pond.cx + Math.cos(a0) * prx, z: pond.cz + Math.sin(a0) * prz },
      p1 = { x: pond.cx + Math.cos(a1) * prx, z: pond.cz + Math.sin(a1) * prz };
    if (p0.z > pond.cz || p1.z > pond.cz || (p0.x - x) * (p1.x - x) > 0) continue;
    zRing = p0.z + ((p1.z - p0.z) * (x - p0.x)) / (p1.x - p0.x);
  }
  if (zRing !== zRing) return null;
  const shore = pond.cz - pond.rz * Math.sqrt(1 - ((x - pond.cx) / pond.rx) ** 2);
  const z0 = shore - 1.3; // abutment on the bank
  const z1 = isl.z - ir + 0.1; // island edge
  const deck = rect(x - 1.8, z1, x + 0.8, z1 + 1.5);
  const B: IslandBridgePlace = { x, z0, z1, w: 1.7, y0: 0.06, y1: 0.16, rise: 0.62, deck, deckY: 0.16 };
  walls.push(rect(x - B.w / 2 - 0.08, z0 + 0.5, x - B.w / 2, z1), rect(x + B.w / 2, z0 + 0.5, x + B.w / 2 + 0.08, z1));
  const pts: P2[] = [{ x, z: zRing }, { x, z: z0 }];
  const ys = [0.03, B.y0];
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const z = z0 + (z1 - z0) * t;
    pts.push({ x, z });
    ys.push(islandBridgeY(B, z));
  }
  pts.push({ x, z: z1 }, { x, z: z1 + 0.75 });
  ys.push(B.y1, B.deckY);
  addPath(plan, { kind: 'park', pts, ys, width: 1.6, surface: 'deck', draw: false });
  // a bench on the landing, looking west over the pond
  bench(plan, deck.x0 + 0.45, z1 + 0.75, -Math.PI / 2, x, z1 + 0.75);
  return B;
}

// ──────────────────────────────────────────────────────── station front ──

function buildStation(plan: CityPlan, floors: Floor[], stairs: PlaceStair[], walls: Rect[], boxes: Rect[]): StationPlace | null {
  const st = plan.lots.find((l) => l.kind === 'station');
  if (!st) return null;
  const fp = st.footprint;
  const zS = st.rect.z1; // block edge = back of the sidewalk
  // the facade moves 2.5 m back: room for a forecourt and a perron in front of the three doors
  const zF = fp.z1 - 2.5;
  fp.z1 = zF;
  for (const d of st.doors) if (d.dir === 'S') d.z = zF;
  const n = 2,
    tread = 0.36;
  const landingY = SIDEWALK_Y + n * 0.15;
  const xs = st.doors.filter((d) => d.dir === 'S').map((d) => d.x);
  const x0 = Math.min(...xs) - 3.1,
    x1 = Math.max(...xs) + 3.1;
  const landing = rect(x0, zF, x1, zF + 1.7);
  const stair: PlaceStair = { rect: rect(x0, landing.z1, x1, landing.z1 + n * tread), axis: 'z', up: -1, yBot: SIDEWALK_Y, yTop: landingY, n };
  const forecourt = rect(fp.x0, zF, fp.x1, zS);
  const cheeks = [rect(x0 - 0.55, zF, x0, stair.rect.z1), rect(x1, zF, x1 + 0.55, stair.rect.z1)];
  const cheekY = landingY + 0.42;
  stairs.push(stair);
  floors.push({ r: landing, y: landingY }, { r: forecourt, y: SIDEWALK_Y });
  for (const c of cheeks) {
    walls.push(c);
    floors.push({ r: c, y: cheekY });
  }
  boxes.push(rect(fp.x0 - 0.1, zF - 0.1, fp.x1 + 0.1, zS + 0.1));
  // a walk from each door over the perron to the sidewalk
  for (const x of xs) {
    addPath(plan, {
      kind: 'plaza',
      pts: [{ x, z: zF + 0.3 }, { x, z: landing.z1 }, { x, z: stair.rect.z1 }, { x, z: zS }],
      ys: [landingY, landingY, SIDEWALK_Y, SIDEWALK_Y],
      width: 2.4,
      surface: 'stone',
      draw: false,
      linkEnds: [1],
    });
  }
  return { forecourt, landing, landingY, stair, cheeks, cheekY };
}

function buildCutting(): CuttingPlace {
  // between the two road-tunnel cuttings (their wing walls reach 19 m either side of x = -110 / 55)
  // face 1.2 m in front of the ridge foot (clear of the cliff skin's relief), thick enough to meet the rock behind
  return { x0: -88, x1: 33, z: RIDGE_FOOT_Z + 1.2, t: 1.7, top: 2.7 };
}

// ────────────────────────────────────────── river + harbour water stairs ──

function buildWaterWorks(plan: CityPlan, floors: Floor[], stairs: PlaceStair[], ramps: PlaceRamp[], walls: Rect[], boxes: Rect[], dry: Rect[], drops: Rect[]): { ws: WaterStairs[]; slip: Slipway; pGaps: [number, number][]; holes: [number, number][] } {
  const ws: WaterStairs[] = [];
  const wet = WATER_LEVEL + 0.15; // bottom landing just clear of the water
  // 1. south river wall, west of the rowing-club jetty: top landing on the coping (y 0.2) at x 87.7..89.3, flight down
  //    westwards along the wall face, wet landing at the waterline
  {
    const zF = RIVER.z1 - 0.25; // water face of the south wall
    const zO = zF - 1.6;
    const topY = 0.19,
      n = 11;
    const top = rect(87.7, zO, 89.3, RIVER.z1 + 0.4);
    const stair: PlaceStair = { rect: rect(87.7 - n * 0.3, zO, 87.7, zF), axis: 'x', up: 1, yBot: wet, yTop: topY, n };
    const bottom = rect(stair.rect.x0 - 1.6, zO, stair.rect.x0, zF);
    ws.push({ id: 'river-s', stair, top, topY, bottom, bottomY: wet, body: rect(bottom.x0, zO, top.x1, zF), railSide: 'z0' });
    walls.push(rect(bottom.x0 + 1.2, zO - 0.08, top.x1, zO + 0.04));
    const zL = (zO + zF) / 2;
    addPath(plan, {
      kind: 'riverbank',
      pts: [{ x: 88.5, z: RIVER.z1 + 5 }, { x: 88.5, z: RIVER.z1 + 0.6 }, { x: 88.5, z: zL }, { x: stair.rect.x1, z: zL }, { x: stair.rect.x0, z: zL }, { x: bottom.x0 + 0.5, z: zL }],
      ys: [0.03, 0.03, topY, topY, wet, wet],
      width: 1.5,
      surface: 'stone',
      draw: false,
    });
  }
  // 2. harbour quay, between the cargo ship's stern and the ferry dock: flight north along the sea wall
  {
    const xF = QUAY_X + 0.3; // water face of the sea wall
    const xO = xF + 1.7;
    const topY = 0.11,
      n = 12;
    const top = rect(QUAY_X - 0.6, -26.2, xO, -24.6);
    const stair: PlaceStair = { rect: rect(xF, -26.2 - n * 0.3, xO, -26.2), axis: 'z', up: 1, yBot: wet, yTop: topY, n };
    const bottom = rect(xF, stair.rect.z0 - 1.8, xO, stair.rect.z0);
    ws.push({ id: 'harbour', stair, top, topY, bottom, bottomY: wet, body: rect(xF, bottom.z0, xO, top.z1), railSide: 'x1' });
    walls.push(rect(xO - 0.04, bottom.z1 - 1.0, xO + 0.08, top.z1));
    drops.push(rect(QUAY_X - 1, bottom.z0 - 1, QUAY_X + 1, top.z1 + 1));
  }
  for (const w of ws) {
    stairs.push(w.stair);
    floors.push({ r: w.top, y: w.topY }, { r: w.bottom, y: w.bottomY });
    boxes.push(rect(w.body.x0 - 0.7, w.body.z0, w.body.x1, w.body.z1 + 0.5));
    dry.push(w.body);
  }
  // 3. slipway east of the rowing club: a ramp from the bank (flush) down through a gap in the south wall into the river
  const ramp: PlaceRamp = { rect: rect(99, RIVER.z1 - 6.5, 103, RIVER.z1 + 0.5), axis: 'z', up: 1, yBot: -1.95, yTop: 0.0 };
  ramps.push(ramp);
  boxes.push(ramp.rect);
  const zDry = ramp.rect.z0 + ((WATER_LEVEL + 0.08 - ramp.yBot) / (ramp.yTop - ramp.yBot)) * (ramp.rect.z1 - ramp.rect.z0);
  dry.push(rect(ramp.rect.x0, zDry, ramp.rect.x1, ramp.rect.z1));
  addPath(plan, {
    kind: 'riverbank',
    pts: [{ x: 101, z: RIVER.z1 + 5 }, { x: 101, z: RIVER.z1 + 0.5 }, { x: 101, z: zDry + 0.8 }],
    ys: [0.03, 0.0, ramp.yBot + ((zDry + 0.8 - ramp.rect.z0) / (ramp.rect.z1 - ramp.rect.z0)) * (ramp.yTop - ramp.yBot)],
    width: 2.0,
    surface: 'stone',
    draw: false,
  });
  const pGaps: [number, number][] = [
    [ws[0].top.x0 - 0.05, ws[0].top.x1 + 0.05],
    [ramp.rect.x0 - 0.2, ramp.rect.x1 + 0.2],
  ];
  return { ws, slip: { ramp, toeY: ramp.yBot }, pGaps, holes: [[ramp.rect.x0, ramp.rect.x1]] };
}

// ───────────────────────────────────────────────────────────── build ──

export function buildPlaces(plan: CityPlan): PlacesDef {
  const all = !params.has('noplaces');
  const on: Record<PlaceId, boolean> = {
    lowquay: all && !params.has('nolowquay'),
    oldlane: all && !params.has('nooldlane'),
    islandbridge: all && !params.has('noislandbridge'),
    station: all && !params.has('nostationfront'),
    cutting: all && !params.has('nocutwall'),
    waterstairs: all && !params.has('nowaterstairs'),
  };
  const floors: Floor[] = [];
  const stairs: PlaceStair[] = [];
  const ramps: PlaceRamp[] = [];
  const walls: Rect[] = [];
  const railGaps: { x: number; half: number }[] = [];
  const quay = on.lowquay ? buildQuay(plan, floors, stairs, ramps, walls, railGaps) : null;
  const lane = on.oldlane ? buildLane(plan, floors, stairs, walls) : null;
  const island = on.islandbridge ? buildIsland(plan, walls) : null;
  // overall bounds of each place for a fast reject
  const boxes: Rect[] = [];
  const station = on.station ? buildStation(plan, floors, stairs, walls, boxes) : null;
  const cutting = on.cutting ? buildCutting() : null;
  const dryRects: Rect[] = [];
  const drops: Rect[] = [];
  const works = on.waterstairs ? buildWaterWorks(plan, floors, stairs, ramps, walls, boxes, dryRects, drops) : null;
  if (quay) boxes.push(rect(quay.x0, RIVER.z0 - 0.4, quay.x1, quay.zEdge));
  if (lane) boxes.push(rect(lane.block.x0, lane.block.z0, lane.block.x1, lane.block.z1));
  const bridgeR = island ? rect(island.x - island.w / 2, island.z0, island.x + island.w / 2, island.z1) : null;
  if (island && bridgeR) boxes.push(rect(island.deck.x0, bridgeR.z0, island.deck.x1, island.deck.z1));
  const dryR = quay ? rect(quay.x0, RIVER.z0, quay.x1, quay.zEdge) : null;
  const height = (x: number, z: number): number => {
    let hit = false;
    for (const b of boxes) if (inR(b, x, z)) hit = true;
    if (!hit) return NaN;
    for (const s of stairs) if (inR(s.rect, x, z)) return stairY(s, x, z);
    for (const r of ramps) if (inR(r.rect, x, z)) return rampY(r, x, z);
    for (const f of floors) if (inR(f.r, x, z)) return f.y;
    if (island && bridgeR) {
      if (inR(bridgeR, x, z)) return islandBridgeY(island, z);
      if (inR(island.deck, x, z)) return island.deckY;
    }
    return NaN;
  };
  return {
    on,
    quay,
    lane,
    island,
    station,
    cutting,
    waterStairs: works?.ws ?? [],
    slipway: works?.slip ?? null,
    southParapetGaps: works?.pGaps ?? [],
    southWallHoles: works?.holes ?? [],
    walls,
    railGaps,
    dropLadder: (x, z) => (!!dryR && x > dryR.x0 - 0.6 && x < dryR.x1 + 0.6 && Math.abs(z - RIVER.z0) < 0.5) || drops.some((r) => inR(r, x, z)),
    height,
    dry: (x, z) => (!!dryR && inR(dryR, x, z)) || (!!bridgeR && (inR(bridgeR, x, z) || inR(island!.deck, x, z))) || dryRects.some((r) => inR(r, x, z)),
  };
}
