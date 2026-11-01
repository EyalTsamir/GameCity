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
//   close    (?noclose)    St Mary's churchyard, Old Town block (4,3): the gap between the church and the south row
//                          opened to the street through a lych-gate in a low railed wall; a flagged path to a
//                          memorial cross in the old courtyard, now a churchyard lawn with headstones and yews
//   yardgate (?noyardgate) Old Town block (4,2): the south gap between the townhouses and the hotel ends in a
//                          gate in the back yard's close-board fence; a gravel path from the street to the yard
//   edge     (?noedgelane) the town's west edge: Westbrook's back gardens end at a farm lane (two gravel ruts and a
//                          grass crown, long-grass verges) behind a field hedgerow with oaks along the slab edge,
//                          field gates and a stile into the fields, a fingerpost where it meets the river promenade

import type { CityPlan, Lot, WalkPath, Bench } from './plan';
import { QUAY_X, RIVER, SIDEWALK_Y, SLAB, WATER_LEVEL } from './constants';
import { RIDGE_FOOT_Z } from './plan';
import { P2, Rect, rect } from './geom';
import { hashString } from './rng';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

export type PlaceId = 'lowquay' | 'oldlane' | 'islandbridge' | 'station' | 'cutting' | 'waterstairs' | 'close' | 'yardgate' | 'edge';

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
  /** round 3: a granite planter trough (shrubs: vegetation) and a row of iron bollards on each free end of the forecourt */
  planters: Rect[];
  bollards: P2[];
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

export interface CloseStone {
  x: number;
  z: number;
  /** facing (an upright's inscription side; chest tombs lie along the local x axis) */
  yaw: number;
  w: number;
  h: number;
  t: number;
  /** lean along the facing direction (never 0: it orients the beam), 0 upright limestone · 1 slate · 2 chest tomb */
  lean: number;
  kind: 0 | 1 | 2;
  shoulder: boolean;
  kerb: boolean;
  tone: number;
}

export interface ClosePlace {
  /** the courtyard area turned churchyard (vegetation / props leave it to the close) */
  areaId: number;
  /** everything the close covers (lawns + the gate) */
  bounds: Rect;
  groundY: number;
  /** street boundary wall along z = wallZ from wallX0 to wallX1; the lych-gate opening gx ± gw/2, the gate's
   *  roof centred on gz (set back into the churchyard: its front posts stand on the wall line, not the sidewalk) */
  wallZ: number;
  gz: number;
  wallX0: number;
  wallX1: number;
  gx: number;
  gw: number;
  cross: P2;
  stones: CloseStone[];
  /** yews / a lime planted by vegetation */
  trees: { x: number; z: number; sp: 'column' | 'round'; h: number; r: number }[];
}

/** the back-yard gate (block 4,2): a ledged-and-braced board gate in the close-board fence, open outwards */
export interface YardGate {
  /** slot centre on the fence line, hinge post x, the leaf's open end */
  x: number;
  z: number;
  hingeX: number;
  leaf: P2;
}

/** the west edge (core/places.ts buildEdge): lane, hedgerow, gates */
export interface EdgePlace {
  /** rut centre lines (x), the lane's z range */
  ruts: [number, number];
  z0: number;
  z1: number;
  /** garden boundary (the lots' new back edge) */
  gardenX: number;
  /** hedgerow centre line x and its runs (z ranges between the gaps) */
  hedgeX: number;
  hedges: [number, number][];
  /** field gates in the hedgerow gaps (centre z, open = swung into the field) and one across the lane's north end */
  gates: { x: number; z: number; axis: 'x' | 'z'; w: number; open: boolean }[];
  stile: P2 | null;
  post: P2;
  trees: { x: number; z: number; h: number; r: number; sp: 'round' | 'birch' }[];
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
  close: ClosePlace | null;
  yardGate: YardGate | null;
  edge: EdgePlace | null;
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
  // the free ends of the forecourt (beside the perron): a planter against the facade, bollards along the front edge
  const planters: Rect[] = [];
  const bollards: P2[] = [];
  for (const [a, c] of [
    [fp.x0, cheeks[0].x0],
    [cheeks[1].x1, fp.x1],
  ]) {
    if (c - a < 4) continue;
    const m = (a + c) / 2;
    const p = rect(m - 1.5, zF + 0.35, m + 1.5, zF + 1.3);
    planters.push(p);
    walls.push(p);
    floors.push({ r: rect(p.x0 + 0.1, p.z0 + 0.1, p.x1 - 0.1, p.z1 - 0.1), y: 0.47 });
    for (let x = a + 0.8; x <= c - 0.7; x += 1.6) {
      bollards.push({ x, z: zS - 0.35 });
      walls.push(rect(x - 0.09, zS - 0.44, x + 0.09, zS - 0.26));
    }
  }
  return { forecourt, landing, landingY, stair, cheeks, cheekY, planters, bollards };
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

// ─────────────────────────────────────────────────────────── church close ──

const h01 = (a: number, b: number, c: number): number => {
  let h = hashString(`close:${a.toFixed(2)}:${b.toFixed(2)}:${c}`);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
};

function segDist(x: number, z: number, a: P2, b: P2): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

function buildClose(plan: CityPlan, walls: Rect[]): ClosePlace | null {
  const ch = plan.lots.find((l) => l.kind === 'church');
  if (!ch) return null;
  const blk = plan.blocks.find((b) => b.id === ch.blockId);
  const court = plan.areas.find((a) => a.kind === 'courtyard' && a.blockId === ch.blockId);
  if (!blk || !court) return null;
  const fp = ch.footprint,
    C = court.rect,
    r = blk.rect;
  const south = plan.lots.filter((l) => l.blockId === blk.id && l.kind === 'townhouse' && l.front === 'S' && l.footprint.x0 >= fp.x1 - 0.1);
  if (!south.length) return null;
  const sx1 = Math.min(...south.map((l) => l.footprint.x0));
  // the gap must reach the courtyard and be wide enough for a gate
  if (sx1 - fp.x1 < 4.5 || C.z1 < r.z1 - 14 || C.x0 > fp.x1 + 3) return null;
  const groundY = 0;
  const wallZ = r.z1 - 0.25;
  const wallX0 = fp.x1 + 0.2,
    wallX1 = sx1 - 0.2;
  const gw = 2.2;
  const gx = (wallX0 + wallX1) / 2;
  const gz = wallZ - 1.0;
  const cross = { x: (C.x0 + C.x1) / 2, z: (C.z0 + C.z1) / 2 };
  // lawns: the gap and the strip along the church's east flank (garden kind: no scatter, no vegetation rng)
  const lawn = (q: Rect) => {
    const id = plan.areas.length;
    plan.areas.push({ id, kind: 'garden', surface: 'grass', rect: q, blockId: blk.id, greenery: 0, layer: 2 });
    blk.areas.push(id);
  };
  lawn(rect(fp.x1, C.z1, sx1, r.z1));
  lawn(rect(fp.x1, C.z0, C.x0, C.z1));
  // the flagged path: street → lych-gate → through the gap → the cross
  const pts = [
    { x: gx, z: r.z1 + 1.6 },
    { x: gx, z: C.z1 + 1.2 },
    { x: cross.x - 0.5, z: cross.z + 1.45 },
  ];
  addPath(plan, { kind: 'plaza', pts, ys: [SIDEWALK_Y, groundY, groundY], width: 1.5, surface: 'paving', draw: true, linkEnds: [0] });
  // two benches beside the path's last leg, facing it (sitters look across at the graves and the cross)
  const P1 = pts[1],
    P2 = pts[2];
  const dl = Math.hypot(P2.x - P1.x, P2.z - P1.z);
  const dx = (P2.x - P1.x) / dl,
    dz = (P2.z - P1.z) / dl;
  const benches: P2[] = [];
  for (const [u, sd] of [
    [0.45, 1],
    [0.7, -1],
  ]) {
    const ax = P1.x + dx * dl * u,
      az = P1.z + dz * dl * u;
    const nx = -dz * sd,
      nz = dx * sd;
    const bx = ax + nx * 1.35,
      bz = az + nz * 1.35;
    bench(plan, bx, bz, Math.atan2(-nx, -nz), ax, az);
    benches.push({ x: bx, z: bz });
  }
  const trees: ClosePlace['trees'] = [
    { x: wallX0 + 0.6, z: wallZ - 2.7, sp: 'column', h: 5.2, r: 0.9 },
    { x: wallX1 - 0.6, z: wallZ - 2.7, sp: 'column', h: 4.8, r: 0.85 },
    { x: C.x1 - 2.6, z: C.z0 + 2.8, sp: 'round', h: 9.5, r: 3.2 },
    { x: cross.x + 3.4, z: cross.z - 3.2, sp: 'column', h: 5.6, r: 1.0 },
  ];
  const clear = (x: number, z: number, m: number): boolean => {
    for (let i = 0; i < pts.length - 1; i++) if (segDist(x, z, pts[i], pts[i + 1]) < 0.75 + m) return false;
    if (Math.abs(x - cross.x) < 1.25 + m && Math.abs(z - cross.z) < 1.25 + m) return false;
    for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < (t.sp === 'round' ? 1.3 : 0.9) + m) return false;
    for (const q of benches) if (Math.hypot(q.x - x, q.z - z) < 1.1 + m) return false;
    return true;
  };
  const stones: CloseStone[] = [];
  const E = Math.PI / 2; // uprights face east, graves lie east of them
  const upright = (x: number, z: number, kerbOk: boolean, i: number) => {
    const q = h01(x, z, i);
    const slate = q < 0.14;
    const w = slate ? 0.48 + h01(x, z, 1) * 0.15 : 0.52 + h01(x, z, 2) * 0.26;
    const lean = (h01(x, z, 3) < 0.3 ? 0.03 + h01(x, z, 4) * 0.07 : 0.012 + h01(x, z, 5) * 0.012) * (h01(x, z, 6) < 0.25 ? -1 : 1);
    stones.push({ x, z, yaw: E, w, h: slate ? 0.75 + h01(x, z, 7) * 0.3 : 0.6 + h01(x, z, 8) * 0.45, t: slate ? 0.06 : 0.09 + h01(x, z, 9) * 0.04, lean, kind: slate ? 1 : 0, shoulder: !slate && h01(x, z, 10) < 0.45, kerb: kerbOk && h01(x, z, 11) < 0.3, tone: h01(x, z, 12) });
    walls.push(rect(x - 0.08, z - w / 2, x + 0.08, z + w / 2));
  };
  // rows in the courtyard (each grave plot ~2.25 m east-west)
  for (let x = C.x0 + 0.9, row = 0; x < C.x1 - 1.9; x += 2.25, row++) {
    for (let z = C.z0 + 1.0; z < C.z1 - 0.7; ) {
      const zz = z + (h01(x, z, 20) - 0.5) * 0.25;
      const q = h01(x, z, 21);
      if (q < 0.08 && clear(x + 0.95, zz, 0.6) && zz < C.z1 - 1.2) {
        // chest tomb (lies east-west)
        stones.push({ x: x + 0.95, z: zz, yaw: 0, w: 1.9, h: 0.65, t: 0.85, lean: 0.012, kind: 2, shoulder: false, kerb: false, tone: h01(x, z, 22) });
        walls.push(rect(x, zz - 0.45, x + 1.9, zz + 0.45));
        z += 1.9;
        continue;
      }
      if (q > 0.12 && clear(x, zz, 0.15) && clear(x + 1.0, zz, 0.2)) upright(x, zz, x + 1.95 < C.x1 - 0.1, row);
      z += 1.15 + h01(x, z, 23) * 0.35;
    }
  }
  // a row along the church's east flank and two short rows either side of the path in the gap
  for (let z = C.z0 + 0.9; z < C.z1 - 0.4; z += 1.3 + h01(fp.x1, z, 24) * 0.3) if (clear(fp.x1 + 0.55, z, 0.1) && h01(fp.x1, z, 25) > 0.18) upright(fp.x1 + 0.55, z, false, 7);
  for (const x of [fp.x1 + 0.55, gx + 1.35])
    for (let z = C.z1 + 0.9; z < wallZ - 3.0; z += 1.25 + h01(x, z, 26) * 0.3) if (x + 0.1 < sx1 - 0.3 && clear(x, z, 0.1) && h01(x, z, 27) > 0.2) upright(x, z, false, 8);
  // solids for the first-person walk: wall runs, gate posts, cross base
  const gx0 = gx - gw / 2 - 0.3,
    gx1 = gx + gw / 2 + 0.3;
  walls.push(rect(wallX0, wallZ - 0.28, gx0 + 0.28, wallZ + 0.28), rect(gx1 - 0.28, wallZ - 0.28, wallX1, wallZ + 0.28));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) walls.push(rect(gx + sx * (gw / 2 - 0.05) - 0.1, gz + sz - 0.1, gx + sx * (gw / 2 - 0.05) + 0.1, gz + sz + 0.1));
  walls.push(rect(cross.x - 1.05, cross.z - 1.05, cross.x + 1.05, cross.z + 1.05));
  return { areaId: court.id, bounds: rect(fp.x1, C.z0, Math.max(C.x1, sx1), r.z1 + 1.6), groundY, wallZ, gz, wallX0, wallX1, gx, gw, cross, stones, trees };
}

// ─────────────────────────────────────────────────────── back-yard gate ──

/**
 * Old Town block (4,2): the W6 back yard (props/places.ts — the oldtown courtyard nearest the Old Town POI) has a
 * close-board fence round its open sides; the gap in the south row (between the townhouses and the hotel) ran
 * into it. A gravel path from the street through the gap ends in the yard; it crosses the fence at one panel
 * slot (posts every 1.8 m, as props draws them), which props leaves out (walkway) — the gate goes there.
 */
function buildYardGate(plan: CityPlan, walls: Rect[]): YardGate | null {
  const old = plan.pois.find((q) => q.id === 'oldtown');
  const tx = old?.target.x ?? 82,
    tz = old?.target.z ?? 10;
  const courts = plan.areas.filter((a) => a.kind === 'courtyard' && plan.blocks.find((b) => b.id === a.blockId)?.kind === 'oldtown');
  let court = courts[0];
  let best = Infinity;
  for (const a of courts) {
    const d = Math.hypot((a.rect.x0 + a.rect.x1) / 2 - tx, (a.rect.z0 + a.rect.z1) / 2 - tz) - Math.min(a.rect.x1 - a.rect.x0, a.rect.z1 - a.rect.z0) * 2;
    if (d < best) {
      best = d;
      court = a;
    }
  }
  if (!court) return null;
  const C = court.rect;
  const blk = plan.blocks.find((b) => b.id === court.blockId)!;
  // widest gap in the south row between the yard's x range and the row's lots
  const row = plan.lots.filter((l) => l.blockId === blk.id && l.footprint.z1 > C.z1 + 0.5 && l.footprint.x1 > C.x0 && l.footprint.x0 < C.x1 + 2);
  const xs = row.map((l) => [l.footprint.x0, l.footprint.x1]).sort((a, b) => a[0] - b[0]);
  let g0 = NaN,
    g1 = NaN,
    cur = C.x0;
  for (const [a, b] of xs) {
    if (a - cur > (g1 - g0 || 0) && a > C.x0) {
      g0 = cur;
      g1 = a;
    }
    cur = Math.max(cur, b);
  }
  if (!(g1 - g0 > 3)) return null;
  // the fence slot nearest the gap's middle: the south edge runs from x1 to x0 (props/places.ts edges[1])
  const L = C.x1 - C.x0,
    cx = (C.x0 + C.x1) / 2;
  const n = Math.floor((L - 0.4) / 1.8);
  const mid = (Math.max(g0, C.x0) + Math.min(g1, C.x1)) / 2;
  let sx = NaN;
  for (let i = 0; i < n; i++) {
    const x = cx - (-L / 2 + 0.2 + 0.9 + i * 1.8);
    if (x - 0.9 > g0 + 0.3 && x + 0.9 < g1 - 0.3 && !(Math.abs(x - mid) > Math.abs(sx - mid))) sx = x;
  }
  if (!(sx === sx)) return null;
  const fz = C.z1 - 0.25;
  addPath(plan, {
    kind: 'plaza',
    pts: [
      { x: sx, z: blk.rect.z1 + 1.6 },
      { x: sx, z: fz - 1.6 },
      { x: (sx + C.x0 + 3.5) / 2, z: (C.z0 + C.z1) / 2 + 1.0 },
    ],
    ys: [SIDEWALK_Y, 0, 0],
    width: 1.2,
    surface: 'gravel',
    draw: true,
    linkEnds: [0],
  });
  // leaf hinged on the east post, open ~85° outwards (into the gap, clear of the path)
  const hingeX = sx + 0.9;
  const a = (85 * Math.PI) / 180;
  const leaf = { x: hingeX - Math.cos(a) * 1.68, z: fz + Math.sin(a) * 1.68 };
  walls.push(rect(Math.min(hingeX, leaf.x) - 0.05, fz, Math.max(hingeX, leaf.x) + 0.05, leaf.z));
  return { x: sx, z: fz, hingeX, leaf };
}

// ──────────────────────────────────────────────────────────── west edge ──

/**
 * Westbrook's house lots ran right up to the slab edge, so the town stopped at a wall of clipped garden hedges
 * facing an empty meadow. The back 3.8 m of every garden (and of the allotments) becomes a farm lane: two gravel
 * ruts with a grass crown between long-grass verges, from the river promenade north to a field gate at the hill
 * foot; along the slab edge a field hedgerow with standard oaks, two field gates and a stile into the fields.
 */
function buildEdge(plan: CityPlan, walls: Rect[]): EdgePlace | null {
  const blk = plan.blocks.find((b) => b.kind === 'suburb' && b.rect.x0 <= SLAB.x0 + 0.1);
  if (!blk) return null;
  const gardenX = SLAB.x0 + 5.8;
  const lots = plan.lots.filter((l) => l.blockId === blk.id && l.rect.x0 < gardenX);
  if (!lots.length || lots.some((l) => l.footprint.x0 < gardenX + 4)) return null;
  for (const l of lots) l.rect = rect(gardenX, l.rect.z0, l.rect.x1, l.rect.z1);
  for (const id of blk.areas) {
    const a = plan.areas[id];
    if (a.rect.x0 < gardenX + 0.2) a.rect = rect(gardenX + 0.2, a.rect.z0, a.rect.x1, a.rect.z1);
  }
  const ruts: [number, number] = [SLAB.x0 + 2.7, SLAB.x0 + 4.5];
  const hedgeX = SLAB.x0 + 0.8;
  const prom = plan.paths.find((q) => q.kind === 'promenade' && Math.abs(q.pts[0].x - (SLAB.x0 + 2)) < 0.01);
  const z1 = blk.rect.z1 - 0.4;
  const z0 = blk.rect.z0 + 1.2;
  // the walkable ruts: the west one joins the promenade's west end, the east one branches off it at both ends
  // (the branch points are vertices of A: pedNetwork's end-on-segment split ignores the outer 1 % of a segment)
  const pa: P2[] = [{ x: ruts[0], z: z0 + 0.9 }, { x: ruts[0], z: z0 + 2.6 }, { x: ruts[0], z: z1 - 1.6 }, { x: ruts[0], z: z1 - 1.2 }];
  if (prom) pa.push({ x: prom.pts[0].x, z: prom.pts[0].z });
  addPath(plan, { kind: 'promenade', pts: pa, ys: pa.map(() => 0.02), width: 0.8, surface: 'track', draw: true });
  const pb: P2[] = [
    { x: ruts[0], z: z0 + 2.6 },
    { x: ruts[1], z: z0 + 4.2 },
    { x: ruts[1], z: z1 - 3.2 },
    { x: ruts[0], z: z1 - 1.6 },
  ];
  addPath(plan, { kind: 'promenade', pts: pb, ys: pb.map(() => 0.02), width: 0.8, surface: 'track', draw: true });
  // hedgerow runs with two field-gate gaps and a stile gap
  const gz = [blk.rect.z0 + (blk.rect.z1 - blk.rect.z0) * 0.27, blk.rect.z0 + (blk.rect.z1 - blk.rect.z0) * 0.68];
  const sz = blk.rect.z0 + (blk.rect.z1 - blk.rect.z0) * 0.5;
  const cuts: [number, number][] = [
    [gz[0], 1.85],
    [sz, 0.45],
    [gz[1], 1.85],
  ];
  const hedges: [number, number][] = [];
  let a = blk.rect.z0 + 0.3;
  for (const [c, h] of cuts) {
    hedges.push([a, c - h]);
    a = c + h;
  }
  hedges.push([a, z1 + 1.2]);
  for (const [h0, h1] of hedges) walls.push(rect(hedgeX - 0.55, h0, hedgeX + 0.55, h1));
  const gates: EdgePlace['gates'] = [
    { x: hedgeX, z: gz[0], axis: 'z', w: 3.5, open: false },
    { x: hedgeX, z: gz[1], axis: 'z', w: 3.5, open: true },
    // across the lane's north end (a field gate into the hill pasture)
    { x: (ruts[0] + ruts[1]) / 2, z: z0 - 0.2, axis: 'x', w: 3.6, open: false },
  ];
  for (const g of gates) if (!g.open) walls.push(g.axis === 'z' ? rect(g.x - 0.1, g.z - g.w / 2, g.x + 0.1, g.z + g.w / 2) : rect(g.x - g.w / 2, g.z - 0.1, g.x + g.w / 2, g.z + 0.1));
  walls.push(rect(hedgeX - 0.12, sz - 0.5, hedgeX + 0.12, sz + 0.5)); // the stile's fence panel (stepped over in reality)
  // hedgerow standards: oaks (a birch now and then), irregular spacing, kept off the gates
  const trees: EdgePlace['trees'] = [];
  for (let z = blk.rect.z0 + 9; z < z1 - 4; ) {
    const q = h01(hedgeX, z, 40);
    if (cuts.every(([c, h]) => Math.abs(z - c) > h + 3.2)) {
      const big = q > 0.35;
      trees.push({ x: hedgeX + (h01(hedgeX, z, 41) - 0.5) * 0.7, z, h: big ? 10 + q * 4 : 6.5 + q * 3, r: big ? 3.6 + q * 1.3 : 2.4 + q, sp: q < 0.12 ? 'birch' : 'round' });
    }
    z += 17 + h01(hedgeX, z, 42) * 22;
  }
  return { ruts, z0, z1, gardenX, hedgeX, hedges, gates, stile: { x: hedgeX, z: sz }, post: { x: gardenX - 0.45, z: z1 - 0.9 }, trees };
}

export function buildPlaces(plan: CityPlan): PlacesDef {
  const all = !params.has('noplaces');
  const on: Record<PlaceId, boolean> = {
    lowquay: all && !params.has('nolowquay'),
    oldlane: all && !params.has('nooldlane'),
    islandbridge: all && !params.has('noislandbridge'),
    station: all && !params.has('nostationfront'),
    cutting: all && !params.has('nocutwall'),
    waterstairs: all && !params.has('nowaterstairs'),
    close: all && !params.has('noclose'),
    yardgate: all && !params.has('noyardgate'),
    edge: all && !params.has('noedgelane'),
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
  const close = on.close ? buildClose(plan, walls) : null;
  const yardGate = on.yardgate ? buildYardGate(plan, walls) : null;
  const edge = on.edge ? buildEdge(plan, walls) : null;
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
    close,
    yardGate,
    edge,
    southParapetGaps: works?.pGaps ?? [],
    southWallHoles: works?.holes ?? [],
    walls,
    railGaps,
    dropLadder: (x, z) => (!!dryR && x > dryR.x0 - 0.6 && x < dryR.x1 + 0.6 && Math.abs(z - RIVER.z0) < 0.5) || drops.some((r) => inR(r, x, z)),
    height,
    dry: (x, z) => (!!dryR && inR(dryR, x, z)) || (!!bridgeR && (inR(bridgeR, x, z) || inR(island!.deck, x, z))) || dryRects.some((r) => inR(r, x, z)),
  };
}
