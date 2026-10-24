// The CityPlan is the single source of truth for the static layout of Tinyhaven.
// It is pure data (no three.js). Renderers build meshes from it and simulations
// (traffic, pedestrians, rail, boats) build their graphs from it.
//
// Map (top view, north = -Z at the top):
//
//   z=-190 ┌───────────────── northern hills (ridge, wind turbines) ───────────────┐~~~~~~~
//          │spur ║ rail ═══════ level x ═══ STATION ═══ level x ═══════ ║ spur      │ sea  ~
//   z=-127 │     ║ industrial      │   station quarter    │  container yard  ║      │breakw.~
//          ├──────┼──────┬──────┬───┴──┬──────┬──────┬─────┴─┐ quay (cranes, ship)  ~~~~~~
//          │ west │ indus│ indus│ DOWN │ DOWN │harbor│       │                      ~~~~~~
//          │margin│ apts │ mid  │ TOWN │ TOWN │ old  │  quay │                      ~~~~~~
//          │houses│houses│ CENTRAL PARK│civic │ old  │ beach │  pier + ferris wheel ~~~~~~
//          │      │houses│school│stadm │market│ old  │ beach │                      ~~~~~~
//   z=+107 ├──────┴──────┴──────┴──────┴──────┴──────┴───────┘                      ~~~~~~
//          │ ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ river (footbridges) ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈~
//   z=+150 └─────────────── south bank riverside park ──────────────── beach ─────────~~~~~~~
//        x=-200                                                       x≈117   x=136   x=200

import { Rng, hashString } from './rng';
import { CORRIDOR_HALF, FURN_OFFSET, QUAY_X, RAIL_Z, RIVER, SLAB, WATER_LEVEL, XS, ZS, SIDEWALK_Y } from './constants';
import { P2, Rect, Dir, rect, rectInset, rectContains, rectsOverlap, clamp, smoothstep, DIR_YAW } from './geom';
import { DIORAMA } from './world';

// ───────────────────────────────────────────────────────────── types ──

export type DistrictKind =
  | 'downtown'
  | 'midtown'
  | 'oldtown'
  | 'market'
  | 'residential'
  | 'suburb'
  | 'industrial'
  | 'harbor'
  | 'park'
  | 'civic'
  | 'stadium'
  | 'station'
  | 'beach'
  | 'riverside'
  | 'hills';

export interface District {
  id: string;
  name: string;
  kind: DistrictKind;
  /** where to show a floating label */
  label: P2;
}

export type Surface = 'grass' | 'paving' | 'concrete' | 'asphalt' | 'gravel' | 'sand' | 'soil' | 'field' | 'court' | 'deck';

export interface Block {
  id: number;
  /** grid column/row (between XS[col]..XS[col+1] / ZS[row]..ZS[row+1]); negative for edge blocks */
  col: number;
  row: number;
  /** interior rectangle, inside the sidewalks */
  rect: Rect;
  districtId: string;
  kind: DistrictKind;
  /** default ground surface for the block interior */
  surface: Surface;
  lots: number[];
  areas: number[];
}

export type BuildingKind =
  | 'tower'
  | 'office'
  | 'apartment'
  | 'townhouse'
  | 'house'
  | 'warehouse'
  | 'factory'
  | 'school'
  | 'church'
  | 'townhall'
  | 'station'
  | 'stadium'
  | 'hotel'
  | 'construction'
  | 'tvtower'
  | 'watertower'
  | 'harbormaster'
  | 'kiosk'
  | 'boathouse'
  | 'depot';

export type RoofKind = 'flat' | 'gable' | 'hip' | 'sawtooth' | 'barrel' | 'none';

export interface Door {
  x: number;
  z: number;
  /** outward direction of the door (towards the street / walkway) */
  dir: Dir;
}

export interface Lot {
  id: number;
  blockId: number;
  district: DistrictKind;
  /** parcel bounds */
  rect: Rect;
  /** main building footprint (always inside rect). Building geometry must stay inside it,
   *  except small overhangs (awnings, eaves, balconies, signs) up to 1.2 m beyond it and only above 2.4 m. */
  footprint: Rect;
  kind: BuildingKind;
  /** main roof height in metres above ground */
  height: number;
  floors: number;
  /** street-facing side */
  front: Dir;
  /** doors on the facade line; pedestrians spawn/despawn here */
  doors: Door[];
  roof: RoofKind;
  /** per-building variation seed */
  seed: number;
  /** style / palette index (0..7) */
  style: number;
  /** ground-floor shop (awnings, signs, lit display windows) */
  shopfront: boolean;
  name?: string;
}

export type AreaKind =
  | 'lawn'
  | 'garden'
  | 'yard'
  | 'plaza'
  | 'parking'
  | 'courtyard'
  | 'pond'
  | 'field'
  | 'playground'
  | 'beach'
  | 'promenade'
  | 'allotment'
  | 'containeryard'
  | 'construction'
  | 'market'
  | 'platform'
  | 'quay'
  | 'boardwalk'
  | 'freightyard'
  | 'driveway'
  | 'schoolyard';

export interface Stall {
  x: number;
  z: number;
  /** yaw of a car parked in this stall (car model faces +Z at yaw 0) */
  yaw: number;
  filled: boolean;
}

export interface Area {
  id: number;
  kind: AreaKind;
  surface: Surface;
  rect: Rect;
  blockId: number;
  /** how much vegetation may be placed here: 0 none … 1 dense */
  greenery: number;
  /** drawing order hint: higher draws on top of lower when areas overlap (e.g. driveway over garden) */
  layer: number;
  stalls?: Stall[];
  ellipse?: { cx: number; cz: number; rx: number; rz: number };
}

export type FeatureKind =
  | 'fountain'
  | 'statue'
  | 'gazebo'
  | 'playground'
  | 'kiosk'
  | 'towercrane'
  | 'windturbine'
  | 'gantrycrane'
  | 'cargoship'
  | 'breakwater'
  | 'lighthouse'
  | 'pier'
  | 'ferriswheel'
  | 'carousel'
  | 'footbridge'
  | 'roadportal'
  | 'railportal'
  | 'lifeguard'
  | 'umbrellas'
  | 'marketstall'
  | 'containerstack'
  | 'tanks'
  | 'chimney'
  | 'floodlight'
  | 'ferrydock'
  | 'flagpole'
  | 'picnic'
  | 'bandstand'
  | 'jetty'
  | 'pondisland'
  | 'sportscourt';

export interface Feature {
  id: number;
  kind: FeatureKind;
  x: number;
  z: number;
  /** rotation about +Y (model's local +Z rotated to face this yaw) */
  yaw: number;
  /** solid ground footprint radius (m) that pedestrians/vegetation must avoid (0 = none / see rect) */
  radius: number;
  /** optional footprint / extent */
  rect?: Rect;
  /** optional segment endpoints (bridges, piers, breakwaters, crane rails) */
  a?: P2;
  b?: P2;
  params?: Record<string, number | string | boolean>;
}

export type SlotKind =
  | 'lamp'
  | 'tree'
  | 'bench'
  | 'bin'
  | 'hydrant'
  | 'busstop'
  | 'bikerack'
  | 'planter'
  | 'mailbox'
  | 'phonebox'
  | 'newsstand'
  | 'empty';

/** A position in the curb-side furniture band of a sidewalk, pre-assigned to one kind of street furniture. */
export interface StreetSlot {
  x: number;
  z: number;
  /** yaw facing AWAY from the road (towards the walking band / block). */
  yaw: number;
  kind: SlotKind;
  /** index into plan.roadSegments */
  segment: number;
  /** which side of the segment (relative to a->b direction) */
  side: 'L' | 'R';
  district: DistrictKind;
  /** bus stop id when kind === 'busstop' */
  busStop?: number;
}

export interface RoadNodeDef {
  id: number;
  x: number;
  z: number;
  kind: 'junction' | 'portal';
  /** signalised junction (traffic lights) vs all-way stop; bends (2 arms) are uncontrolled */
  control: 'signal' | 'stop' | 'none' | 'portal';
}

export interface RoadSegmentDef {
  id: number;
  a: number;
  b: number;
  kind: 'street' | 'avenue' | 'tunnel';
  /** sidewalks on both sides */
  sidewalks: boolean;
  speed: number;
}

export interface BusStopDef {
  id: number;
  /** road segment the stop is on and the direction of travel (from node -> to node) */
  segment: number;
  from: number;
  to: number;
  /** distance from the `from` node centre along the segment where the bus front should stop */
  along: number;
  /** shelter position (in furniture band) */
  x: number;
  z: number;
  /** shelter yaw: local +Z points away from the road */
  yaw: number;
  name: string;
  route: number;
}

export interface BusRouteDef {
  id: number;
  name: string;
  color: string;
  /** cyclic list of road node ids */
  nodes: number[];
}

export interface StationDef {
  name: string;
  x0: number;
  x1: number;
  platform: Rect;
  platformY: number;
  /** door of the station building facing the city */
  door: Door;
}

export interface RailDef {
  /** straight track along z from x0 to x1 (tunnel interiors beyond the portals) */
  z: number;
  x0: number;
  x1: number;
  /** x of the west / east tunnel mouths */
  portalW: number;
  portalE: number;
  /** top of rails */
  railY: number;
  stations: StationDef[];
  /** x positions where the track crosses roads at grade */
  crossings: { id: number; x: number; nodeSouth: number; portalNode: number }[];
}

export interface PondDef {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  level: number;
  bedY: number;
}

export interface WaterDef {
  level: number;
  /** region where the sea surface is drawn (land will cover parts of it) */
  seaRect: Rect;
  river: Rect;
  riverBedY: number;
  ponds: PondDef[];
  /** vertical stone walls (top at ground level, down to the bed) */
  quayWalls: { a: P2; b: P2; top: number; bottom: number }[];
}

export type WalkKind = 'park' | 'plaza' | 'boardwalk' | 'pier' | 'bridge' | 'promenade' | 'beach' | 'market' | 'riverbank';

/** Walkway polyline outside the sidewalk system (parks, plazas, beach, bridges…). */
export interface WalkPath {
  id: number;
  kind: WalkKind;
  pts: P2[];
  width: number;
  surface: 'gravel' | 'paving' | 'deck' | 'sand' | 'stone';
  /** walking surface height (bridges arch up to yMid in the middle) */
  y: number;
  yMid?: number;
  /** should the ground renderer draw this path? (false when it lies on an already paved / decked area) */
  draw: boolean;
  /** indices of endpoints (0 = first, 1 = last) that must be linked to the nearest sidewalk */
  linkEnds: (0 | 1)[];
}

export interface Bench {
  x: number;
  z: number;
  /** direction the sitter faces */
  yaw: number;
  /** walkable point on the adjacent path (pedestrians walk here, then step onto the bench) */
  ax: number;
  az: number;
}

export interface Poi {
  id: string;
  name: string;
  target: { x: number; y: number; z: number };
  distance: number;
  /** degrees; 0 = camera south of target looking north, 90 = camera east of target looking west */
  yaw: number;
  /** degrees above horizon */
  pitch: number;
}

export interface CityPlan {
  seed: string;
  slab: Rect;
  districts: District[];
  blocks: Block[];
  lots: Lot[];
  areas: Area[];
  features: Feature[];
  slots: StreetSlot[];
  paths: WalkPath[];
  benches: Bench[];
  roadNodes: RoadNodeDef[];
  roadSegments: RoadSegmentDef[];
  busStops: BusStopDef[];
  busRoutes: BusRouteDef[];
  rail: RailDef;
  water: WaterDef;
  pois: Poi[];
  /** ground height of the natural terrain (city zone = 0, hills > 0, water beds < 0). */
  heightAt(x: number, z: number): number;
  /** true where open water (sea, river, pond) covers the ground */
  isWater(x: number, z: number): boolean;
  districtAt(x: number, z: number): District | null;
  /** node id of the road grid intersection at XS[i], ZS[j] (or -1) */
  gridNode(i: number, j: number): number;
}

// ─────────────────────────────────────────────────────────── generation ──

const NX = XS.length; // 6
const NZ = ZS.length; // 5

export function gridNodeId(i: number, j: number): number {
  return j * NX + i;
}

export const PORTAL_W_NODE = NX * NZ; // 30  (x = XS[1], tunnel north)
export const PORTAL_E_NODE = NX * NZ + 1; // 31 (x = XS[4], tunnel north)
/** Road lanes into the tunnels end here (vehicles despawn inside the hill). */
export const PORTAL_Z = -182;

/** Ridge foot (where the northern hills start rising) — road tunnel mouths sit just behind it. */
export const RIDGE_FOOT_Z = -163;
/** Rail tunnel mouths (west faces east, east faces west). */
export const SPUR_W_X = -182;
export const SPUR_E_X = 112;
/** Pier centre line */
export const PIER_Z = 62;

export function generatePlan(seed = 'tinyhaven'): CityPlan {
  const rng = new Rng(seed);
  const plan: CityPlan = {
    seed,
    slab: { x0: SLAB.x0, z0: SLAB.z0, x1: SLAB.x1, z1: SLAB.z1 },
    districts: [],
    blocks: [],
    lots: [],
    areas: [],
    features: [],
    slots: [],
    paths: [],
    benches: [],
    roadNodes: [],
    roadSegments: [],
    busStops: [],
    busRoutes: [],
    rail: null as unknown as RailDef,
    water: null as unknown as WaterDef,
    pois: [],
    heightAt,
    isWater: (x, z) => isWaterAt(plan, x, z),
    districtAt: (x, z) => districtAt(plan, x, z),
    gridNode: (i, j) => (i >= 0 && i < NX && j >= 0 && j < NZ ? gridNodeId(i, j) : -1),
  };

  plan.districts = DISTRICTS.map((d) => ({ ...d, label: { ...d.label } }));
  buildRoads(plan);
  buildBlocks(plan, rng.fork('blocks'));
  buildWaterAndRail(plan);
  buildWaterfront(plan, rng.fork('waterfront'));
  buildHills(plan, rng.fork('hills'));
  buildBusLines(plan);
  buildStreetSlots(plan, rng.fork('slots'));
  buildPois(plan);
  return plan;
}

// ───────────────────────────────────────────────────────────── districts ──

const DISTRICTS: District[] = [
  { id: 'downtown', name: 'Downtown', kind: 'downtown', label: { x: 0, z: -65 } },
  { id: 'midtown', name: 'Midtown', kind: 'midtown', label: { x: -82, z: -37 } },
  { id: 'northgate', name: 'Northgate Works', kind: 'industrial', label: { x: -120, z: -110 } },
  { id: 'westbrook', name: 'Westbrook', kind: 'residential', label: { x: -150, z: 30 } },
  { id: 'park', name: 'Central Park', kind: 'park', label: { x: -55, z: 17 } },
  { id: 'civic', name: 'Town Square', kind: 'civic', label: { x: 27, z: 17 } },
  { id: 'stadium', name: 'Haven Stadium', kind: 'stadium', label: { x: -27, z: 72 } },
  { id: 'market', name: 'Market Quarter', kind: 'market', label: { x: 27, z: 72 } },
  { id: 'oldtown', name: 'Old Town', kind: 'oldtown', label: { x: 82, z: 10 } },
  { id: 'harbor', name: 'Harbour', kind: 'harbor', label: { x: 120, z: -90 } },
  { id: 'station', name: 'Station Quarter', kind: 'station', label: { x: 0, z: -140 } },
  { id: 'beach', name: 'Sunny Beach', kind: 'beach', label: { x: 135, z: 50 } },
  { id: 'riverside', name: 'Riverside', kind: 'riverside', label: { x: -40, z: 135 } },
  { id: 'hills', name: 'Northern Hills', kind: 'hills', label: { x: -40, z: -178 } },
];

/** District id for each grid block [col][row]. col 0..4, row 0..3 */
const BLOCK_DISTRICTS: string[][] = [
  // r0          r1           r2          r3
  ['northgate', 'westbrook', 'westbrook', 'westbrook'], // c0
  ['northgate', 'midtown', 'park', 'westbrook'], // c1
  ['downtown', 'downtown', 'park', 'stadium'], // c2
  ['downtown', 'downtown', 'civic', 'market'], // c3
  ['harbor', 'oldtown', 'oldtown', 'oldtown'], // c4
];

// ───────────────────────────────────────────────────────────────── roads ──

function buildRoads(plan: CityPlan): void {
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      plan.roadNodes.push({ id: gridNodeId(i, j), x: XS[i], z: ZS[j], kind: 'junction', control: 'stop' });
    }
  }
  plan.roadNodes.push({ id: PORTAL_W_NODE, x: XS[1], z: PORTAL_Z, kind: 'portal', control: 'portal' });
  plan.roadNodes.push({ id: PORTAL_E_NODE, x: XS[4], z: PORTAL_Z, kind: 'portal', control: 'portal' });

  // the merged Central Park block: no N-S street at x=-55 between z=-10 and z=45
  const removed = new Set<string>(['v:2:2']);
  let sid = 0;
  const avenueX = new Set([3]); // x = 0 is the main avenue (station -> river)
  const avenueZ = new Set([2]); // z = -10 crosstown avenue
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX - 1; i++) {
      if (removed.has(`h:${i}:${j}`)) continue;
      plan.roadSegments.push({ id: sid++, a: gridNodeId(i, j), b: gridNodeId(i + 1, j), kind: avenueZ.has(j) ? 'avenue' : 'street', sidewalks: true, speed: 11 });
    }
  }
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ - 1; j++) {
      if (removed.has(`v:${i}:${j}`)) continue;
      plan.roadSegments.push({ id: sid++, a: gridNodeId(i, j), b: gridNodeId(i, j + 1), kind: avenueX.has(i) ? 'avenue' : 'street', sidewalks: true, speed: 11 });
    }
  }
  // Tunnel roads to the north (no sidewalks). Segment runs portal -> junction.
  plan.roadSegments.push({ id: sid++, a: PORTAL_W_NODE, b: gridNodeId(1, 0), kind: 'tunnel', sidewalks: false, speed: 13.5 });
  plan.roadSegments.push({ id: sid++, a: PORTAL_E_NODE, b: gridNodeId(4, 0), kind: 'tunnel', sidewalks: false, speed: 13.5 });

  const arms = new Map<number, number>();
  for (const s of plan.roadSegments) {
    arms.set(s.a, (arms.get(s.a) ?? 0) + 1);
    arms.set(s.b, (arms.get(s.b) ?? 0) + 1);
  }
  for (const n of plan.roadNodes) {
    if (n.kind === 'portal') continue;
    const k = arms.get(n.id) ?? 0;
    if (k <= 2) n.control = 'none';
    else {
      const i = (XS as readonly number[]).indexOf(n.x);
      const j = (ZS as readonly number[]).indexOf(n.z);
      const inner = i >= 1 && i <= 4 && j >= 1 && j <= 3;
      const tunnelJunction = j === 0 && (i === 1 || i === 4);
      n.control = (inner && k === 4) || tunnelJunction ? 'signal' : 'stop';
    }
  }
}

// ───────────────────────────────────────────────────────────────── blocks ──

function blockRect(col: number, row: number): Rect {
  return rect(XS[col] + CORRIDOR_HALF, ZS[row] + CORRIDOR_HALF, XS[col + 1] - CORRIDOR_HALF, ZS[row + 1] - CORRIDOR_HALF);
}

interface Ctx {
  plan: CityPlan;
  rng: Rng;
}

function addBlock(plan: CityPlan, b: Omit<Block, 'id' | 'lots' | 'areas'>): Block {
  const blk: Block = { ...b, id: plan.blocks.length, lots: [], areas: [] };
  plan.blocks.push(blk);
  return blk;
}

function addLot(c: Ctx, blk: Block, l: Omit<Lot, 'id' | 'blockId' | 'district' | 'seed'> & { seed?: number }): Lot {
  const lot: Lot = { ...l, id: c.plan.lots.length, blockId: blk.id, district: blk.kind, seed: l.seed ?? Math.floor(c.rng.next() * 1e9) };
  c.plan.lots.push(lot);
  blk.lots.push(lot.id);
  return lot;
}

function addArea(c: Ctx, blk: Block, a: Omit<Area, 'id' | 'blockId' | 'layer'> & { layer?: number }): Area {
  const area: Area = { layer: 0, ...a, id: c.plan.areas.length, blockId: blk.id };
  c.plan.areas.push(area);
  blk.areas.push(area.id);
  return area;
}

function addFeature(plan: CityPlan, f: Omit<Feature, 'id' | 'radius'> & { radius?: number }): Feature {
  const feat: Feature = { radius: 0, ...f, id: plan.features.length };
  plan.features.push(feat);
  return feat;
}

function addPath(plan: CityPlan, p: Omit<WalkPath, 'id' | 'linkEnds'> & { linkEnds?: (0 | 1)[] }): WalkPath {
  const wp: WalkPath = { linkEnds: [], ...p, id: plan.paths.length };
  plan.paths.push(wp);
  return wp;
}

/** Bench beside a path point, offset sideways by `off` (facing back towards the path). */
function addBench(plan: CityPlan, ax: number, az: number, nx: number, nz: number, off = 1.9): void {
  const x = ax + nx * off,
    z = az + nz * off;
  plan.benches.push({ x, z, yaw: Math.atan2(-nx, -nz), ax, az });
}

/** Door in the middle of the given side of a footprint. */
function doorOn(fp: Rect, side: Dir, t = 0.5): Door {
  switch (side) {
    case 'N':
      return { x: fp.x0 + (fp.x1 - fp.x0) * t, z: fp.z0, dir: 'N' };
    case 'S':
      return { x: fp.x0 + (fp.x1 - fp.x0) * t, z: fp.z1, dir: 'S' };
    case 'E':
      return { x: fp.x1, z: fp.z0 + (fp.z1 - fp.z0) * t, dir: 'E' };
    case 'W':
      return { x: fp.x0, z: fp.z0 + (fp.z1 - fp.z0) * t, dir: 'W' };
  }
}

/** Split the length [a,b] into pieces between roughly minW and maxW. */
function splitLength(rng: Rng, a: number, b: number, minW: number, maxW: number): number[] {
  const L = b - a;
  const n = Math.max(1, Math.round(L / ((minW + maxW) / 2)));
  const ws: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.range(minW, maxW);
    ws.push(w);
    total += w;
  }
  const cuts = [a];
  let acc = a;
  for (let i = 0; i < n; i++) {
    acc += (ws[i] / total) * L;
    cuts.push(i === n - 1 ? b : acc);
  }
  return cuts;
}

function buildBlocks(plan: CityPlan, rng: Rng): void {
  const c: Ctx = { plan, rng };
  let parkDone = false;
  for (let col = 0; col < NX - 1; col++) {
    for (let row = 0; row < NZ - 1; row++) {
      const did = BLOCK_DISTRICTS[col][row];
      const d = plan.districts.find((x) => x.id === did)!;
      if (did === 'park') {
        if (parkDone) continue;
        parkDone = true;
        const r = rect(XS[1] + CORRIDOR_HALF, ZS[2] + CORRIDOR_HALF, XS[3] - CORRIDOR_HALF, ZS[3] - CORRIDOR_HALF);
        const blk = addBlock(plan, { col, row, rect: r, districtId: did, kind: 'park', surface: 'grass' });
        genPark(c, blk);
        continue;
      }
      const r = blockRect(col, row);
      const surface: Surface = d.kind === 'industrial' || d.kind === 'harbor' ? 'concrete' : d.kind === 'residential' ? 'grass' : 'paving';
      const blk = addBlock(plan, { col, row, rect: r, districtId: did, kind: d.kind, surface });
      switch (`${col},${row}`) {
        case '0,0':
          genFactory(c, blk);
          break;
        case '1,0':
          genWarehouses(c, blk, 'northgate');
          break;
        case '2,0':
          genDowntown(c, blk, 'twin');
          break;
        case '3,0':
          genDowntown(c, blk, 'tvtower');
          break;
        case '4,0':
          genWarehouses(c, blk, 'harbor');
          break;
        case '0,1':
          genApartments(c, blk);
          break;
        case '1,1':
          genMidtown(c, blk);
          break;
        case '2,1':
          genDowntown(c, blk, 'tallest');
          break;
        case '3,1':
          genDowntown(c, blk, 'quad');
          break;
        case '4,1':
          genOldTown(c, blk, 'full');
          break;
        case '0,2':
          genHouses(c, blk, 'NS');
          break;
        case '3,2':
          genCivic(c, blk);
          break;
        case '4,2':
          genOldTown(c, blk, 'hotel');
          break;
        case '0,3':
          genHouses(c, blk, 'EW');
          break;
        case '1,3':
          genSchool(c, blk);
          break;
        case '2,3':
          genStadium(c, blk);
          break;
        case '3,3':
          genMarket(c, blk);
          break;
        case '4,3':
          genOldTown(c, blk, 'church');
          break;
      }
    }
  }
  genWestMargin(c);
  genNorthStrip(c);
  genQuay(c);
  genRiverside(c);
}

// ── district generators ────────────────────────────────────────────────

function genDowntown(c: Ctx, blk: Block, variant: 'twin' | 'tvtower' | 'tallest' | 'quad'): void {
  const r = blk.rect;
  const rng = c.rng;
  const mx = (r.x0 + r.x1) / 2,
    mz = (r.z0 + r.z1) / 2;
  if (variant === 'tallest') {
    // One landmark skyscraper + plaza on the south side
    const fp = rect(r.x0 + 6, r.z0 + 2, r.x1 - 6, r.z0 + 26);
    addLot(c, blk, {
      rect: rect(r.x0, r.z0, r.x1, r.z0 + 28),
      footprint: fp,
      kind: 'tower',
      height: 118,
      floors: 32,
      front: 'S',
      doors: [doorOn(fp, 'S'), doorOn(fp, 'N', 0.3)],
      roof: 'flat',
      style: 0,
      shopfront: false,
      name: 'Haven Tower',
    });
    const pz = rect(r.x0, r.z0 + 28, r.x1, r.z1);
    addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: pz, greenery: 0.35 });
    addFeature(c.plan, { kind: 'statue', x: mx - 9, z: r.z0 + 33.5, yaw: 0, radius: 1.6, params: { style: 'abstract' } });
    // plaza walkway W-E (statue sits north-west of it)
    const zw = r.z0 + 38.5;
    addPath(c.plan, { kind: 'plaza', pts: [{ x: r.x0, z: zw }, { x: r.x1, z: zw }], width: 3, surface: 'paving', y: 0.02, draw: false, linkEnds: [0, 1] });
    addBench(c.plan, mx + 6, zw, 0, -1, 1.8);
    addBench(c.plan, mx - 2, zw, 0, -1, 1.8);
    return;
  }
  if (variant === 'twin') {
    const gap = 6;
    const wA = (r.x1 - r.x0 - gap) / 2;
    const fpA = rect(r.x0, r.z0, r.x0 + wA, r.z1 - 10);
    const fpB = rect(r.x1 - wA, r.z0 + 8, r.x1, r.z1);
    addLot(c, blk, {
      rect: rect(r.x0, r.z0, r.x0 + wA, r.z1),
      footprint: fpA,
      kind: 'tower',
      height: rng.range(78, 92),
      floors: 24,
      front: 'W',
      doors: [doorOn(fpA, 'W'), doorOn(fpA, 'N')],
      roof: 'flat',
      style: 1,
      shopfront: false,
    });
    addLot(c, blk, {
      rect: rect(r.x1 - wA, r.z0, r.x1, r.z1),
      footprint: fpB,
      kind: 'tower',
      height: rng.range(60, 72),
      floors: 19,
      front: 'E',
      doors: [doorOn(fpB, 'E'), doorOn(fpB, 'S')],
      roof: 'flat',
      style: 2,
      shopfront: true,
    });
    addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(r.x0, r.z1 - 10, r.x0 + wA, r.z1), greenery: 0.4 });
    addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(r.x0 + wA, r.z0, r.x1 - wA, r.z1), greenery: 0 });
    addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(r.x1 - wA, r.z0, r.x1, r.z0 + 8), greenery: 0.3 });
    // passage between the towers
    addPath(c.plan, { kind: 'plaza', pts: [{ x: mx, z: r.z0 }, { x: mx, z: r.z1 }], width: 3, surface: 'paving', y: 0.02, draw: false, linkEnds: [0, 1] });
    return;
  }
  if (variant === 'tvtower') {
    // TV tower in the north-east quadrant with its own little plaza; offices elsewhere
    const q = rect(mx + 2, r.z0, r.x1, mz - 1);
    const fpT = rect(q.x0 + 4, q.z0 + 4, q.x1 - 4, q.z1 - 4);
    addLot(c, blk, {
      rect: q,
      footprint: fpT,
      kind: 'tvtower',
      height: 150,
      floors: 1,
      front: 'E',
      doors: [doorOn(fpT, 'E')],
      roof: 'none',
      style: 0,
      shopfront: false,
      name: 'Skyline Tower',
    });
    addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: q, greenery: 0.2 });
    const fpW = rect(r.x0, r.z0, mx - 2, r.z1);
    addLot(c, blk, {
      rect: rect(r.x0, r.z0, mx, r.z1),
      footprint: fpW,
      kind: 'tower',
      height: rng.range(70, 84),
      floors: 22,
      front: 'W',
      doors: [doorOn(fpW, 'W'), doorOn(fpW, 'S')],
      roof: 'flat',
      style: 3,
      shopfront: true,
    });
    const fpSE = rect(mx + 2, mz + 1, r.x1, r.z1);
    addLot(c, blk, {
      rect: rect(mx, mz, r.x1, r.z1),
      footprint: fpSE,
      kind: 'office',
      height: rng.range(34, 44),
      floors: 10,
      front: 'S',
      doors: [doorOn(fpSE, 'S'), doorOn(fpSE, 'E')],
      roof: 'flat',
      style: 4,
      shopfront: true,
    });
    return;
  }
  // quad: four towers of varying heights around a cross-shaped passage
  const heights = rng.shuffle([rng.range(36, 46), rng.range(48, 58), rng.range(58, 70), rng.range(28, 36)]);
  const quads: [Rect, Dir, Dir][] = [
    [rect(r.x0, r.z0, mx - 1.5, mz - 1.5), 'N', 'W'],
    [rect(mx + 1.5, r.z0, r.x1, mz - 1.5), 'N', 'E'],
    [rect(r.x0, mz + 1.5, mx - 1.5, r.z1), 'S', 'W'],
    [rect(mx + 1.5, mz + 1.5, r.x1, r.z1), 'S', 'E'],
  ];
  quads.forEach(([q, f1, f2], k) => {
    const fp = rectInset(q, 0.5);
    addLot(c, blk, {
      rect: q,
      footprint: fp,
      kind: heights[k] > 40 ? 'tower' : 'office',
      height: heights[k],
      floors: Math.round(heights[k] / 3.6),
      front: f1,
      doors: [doorOn(fp, f1), doorOn(fp, f2)],
      roof: 'flat',
      style: (k + 5) % 8,
      shopfront: k % 2 === 0,
    });
  });
  addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(r.x0, mz - 1.5, r.x1, mz + 1.5), greenery: 0 });
  addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(mx - 1.5, r.z0, mx + 1.5, r.z1), greenery: 0 });
  addPath(c.plan, { kind: 'plaza', pts: [{ x: r.x0, z: mz }, { x: mx, z: mz }, { x: r.x1, z: mz }], width: 2.6, surface: 'paving', y: 0.02, draw: false, linkEnds: [0, 1] });
  addPath(c.plan, { kind: 'plaza', pts: [{ x: mx, z: r.z0 }, { x: mx, z: mz }, { x: mx, z: r.z1 }], width: 2.6, surface: 'paving', y: 0.02, draw: false, linkEnds: [0, 1] });
}

function genMidtown(c: Ctx, blk: Block): void {
  const r = blk.rect;
  const mx = (r.x0 + r.x1) / 2;
  // West half: an office and a hotel; East half: construction site with a tower crane
  const fpA = rect(r.x0, r.z0, mx - 1, r.z0 + 19);
  const fpB = rect(r.x0, r.z0 + 23, mx - 1, r.z1);
  addLot(c, blk, {
    rect: rect(r.x0, r.z0, mx, r.z0 + 21),
    footprint: fpA,
    kind: 'office',
    height: c.rng.range(26, 32),
    floors: 8,
    front: 'N',
    doors: [doorOn(fpA, 'N'), doorOn(fpA, 'W')],
    roof: 'flat',
    style: 6,
    shopfront: true,
  });
  addLot(c, blk, {
    rect: rect(r.x0, r.z0 + 21, mx, r.z1),
    footprint: fpB,
    kind: 'hotel',
    height: c.rng.range(30, 38),
    floors: 10,
    front: 'S',
    doors: [doorOn(fpB, 'S'), doorOn(fpB, 'W')],
    roof: 'flat',
    style: 7,
    shopfront: false,
    name: 'Grand Hotel',
  });
  addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(r.x0, r.z0 + 19, mx, r.z0 + 23), greenery: 0.2 });
  const site = rect(mx + 1, r.z0, r.x1, r.z1);
  const fpC = rect(site.x0 + 4, site.z0 + 5, site.x1 - 3, site.z1 - 12);
  addLot(c, blk, {
    rect: site,
    footprint: fpC,
    kind: 'construction',
    height: 22,
    floors: 6,
    front: 'E',
    doors: [],
    roof: 'none',
    style: 0,
    shopfront: false,
    name: 'Construction site',
  });
  addArea(c, blk, { kind: 'construction', surface: 'gravel', rect: site, greenery: 0 });
  addFeature(c.plan, { kind: 'towercrane', x: site.x1 - 6, z: site.z1 - 6, yaw: 0, radius: 3, params: { height: 58, jib: 40 } });
}

function genOldTown(c: Ctx, blk: Block, variant: 'full' | 'hotel' | 'church'): void {
  const r = blk.rect;
  const rng = c.rng;
  const depth = 12.5;
  let skip: Rect | null = null;
  if (variant === 'church') {
    // Church in the south-west corner, facing south (the river)
    const cr = rect(r.x0, r.z1 - 28, r.x0 + 17, r.z1);
    skip = cr;
    const fp = rect(cr.x0 + 1.5, cr.z0 + 1, cr.x1 - 1.5, cr.z1 - 1);
    addLot(c, blk, {
      rect: cr,
      footprint: fp,
      kind: 'church',
      height: 15,
      floors: 1,
      front: 'S',
      doors: [doorOn(fp, 'S')],
      roof: 'gable',
      style: 0,
      shopfront: false,
      name: 'St. Mary’s Church',
    });
  }
  if (variant === 'hotel') {
    // Seafront hotel on the east side
    const hr = rect(r.x1 - 14, r.z0, r.x1, r.z1);
    skip = hr;
    const fp = rect(hr.x0 + 0.5, hr.z0 + 1, hr.x1, hr.z1 - 1);
    addLot(c, blk, {
      rect: hr,
      footprint: fp,
      kind: 'hotel',
      height: 24,
      floors: 7,
      front: 'E',
      doors: [doorOn(fp, 'E'), doorOn(fp, 'N', 0.6)],
      roof: 'hip',
      style: 3,
      shopfront: false,
      name: 'Seaview Hotel',
    });
  }
  for (const side of ['N', 'S', 'E', 'W'] as Dir[]) {
    // N and S rows span the full width; E and W rows fill the middle
    const alongX = side === 'N' || side === 'S';
    const a = alongX ? r.x0 : r.z0 + depth;
    const b = alongX ? r.x1 : r.z1 - depth;
    const cuts = splitLength(rng, a, b, 7.5, 12.5);
    for (let k = 0; k < cuts.length - 1; k++) {
      const u0 = cuts[k],
        u1 = cuts[k + 1];
      let lr: Rect;
      if (side === 'N') lr = rect(u0, r.z0, u1, r.z0 + depth);
      else if (side === 'S') lr = rect(u0, r.z1 - depth, u1, r.z1);
      else if (side === 'E') lr = rect(r.x1 - depth, u0, r.x1, u1);
      else lr = rect(r.x0, u0, r.x0 + depth, u1);
      if (skip && rectsOverlap(lr, skip, -0.5)) continue;
      const floors = rng.int(3, 5);
      addLot(c, blk, {
        rect: lr,
        footprint: lr, // old town buildings fill their parcel
        kind: 'townhouse',
        height: floors * 3.3 + rng.range(0.4, 1.6),
        floors,
        front: side,
        doors: [doorOn(lr, side, rng.range(0.3, 0.7))],
        roof: rng.chance(0.65) ? 'gable' : rng.chance(0.5) ? 'hip' : 'flat',
        style: rng.int(0, 7),
        shopfront: rng.chance(0.7),
      });
    }
  }
  // Courtyard garden in the middle (minus anything the special building covers)
  let ci = rect(r.x0 + depth, r.z0 + depth, r.x1 - depth, r.z1 - depth);
  if (variant === 'church' && skip) ci = rect(skip.x1 + 0.5, ci.z0, ci.x1, ci.z1);
  if (variant === 'hotel' && skip) ci = rect(ci.x0, ci.z0, Math.min(ci.x1, skip.x0 - 0.5), ci.z1);
  addArea(c, blk, { kind: 'courtyard', surface: 'grass', rect: ci, greenery: 0.8 });
}

function genMarket(c: Ctx, blk: Block): void {
  const r = blk.rect;
  const rng = c.rng;
  const depth = 12;
  // Buildings on N, E, W; open market square to the south facing the river
  const sq = rect(r.x0 + depth, r.z0 + depth, r.x1 - depth, r.z1);
  for (const side of ['N', 'E', 'W'] as Dir[]) {
    const a = side === 'N' ? r.x0 : r.z0 + depth;
    const b = side === 'N' ? r.x1 : r.z1;
    const cuts = splitLength(rng, a, b, 8, 12);
    for (let k = 0; k < cuts.length - 1; k++) {
      const u0 = cuts[k],
        u1 = cuts[k + 1];
      const lr = side === 'N' ? rect(u0, r.z0, u1, r.z0 + depth) : side === 'E' ? rect(r.x1 - depth, u0, r.x1, u1) : rect(r.x0, u0, r.x0 + depth, u1);
      const floors = rng.int(3, 4);
      addLot(c, blk, {
        rect: lr,
        footprint: lr,
        kind: 'townhouse',
        height: floors * 3.3 + rng.range(0.5, 1.5),
        floors,
        front: side,
        doors: [doorOn(lr, side, rng.range(0.3, 0.7))],
        roof: rng.chance(0.7) ? 'gable' : 'flat',
        style: rng.int(0, 7),
        shopfront: true,
      });
    }
  }
  addArea(c, blk, { kind: 'market', surface: 'paving', rect: sq, greenery: 0.15 });
  // Two aisles running N-S from the riverside sidewalk, joined at the north end
  const ax1 = sq.x0 + 5.5,
    ax2 = sq.x1 - 5.5;
  const zN = sq.z0 + 3;
  addPath(c.plan, { kind: 'market', pts: [{ x: ax1, z: sq.z1 }, { x: ax1, z: zN }, { x: ax2, z: zN }, { x: ax2, z: sq.z1 }], width: 2.4, surface: 'paving', y: 0.02, draw: false, linkEnds: [0, 1] });
  // Stalls on both sides of each aisle (yaw: stall front faces the aisle)
  for (let z = zN + 4; z < sq.z1 - 3; z += 4.2) {
    for (const [ax, side] of [
      [ax1, -1],
      [ax1, 1],
      [ax2, -1],
      [ax2, 1],
    ] as [number, number][]) {
      const x = ax + side * 2.6;
      if (x < sq.x0 + 1.2 || x > sq.x1 - 1.2) continue;
      // skip the middle (between aisles) on alternating rows to keep an open feel
      addFeature(c.plan, { kind: 'marketstall', x, z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, radius: 1.3, params: { color: rng.int(0, 5) } });
    }
  }
}

function genCivic(c: Ctx, blk: Block): void {
  const r = blk.rect;
  const mx = (r.x0 + r.x1) / 2;
  const fp = rect(r.x0 + 4, r.z0, r.x1 - 4, r.z0 + 13);
  addLot(c, blk, {
    rect: rect(r.x0, r.z0, r.x1, r.z0 + 14),
    footprint: fp,
    kind: 'townhall',
    height: 16,
    floors: 4,
    front: 'S',
    doors: [doorOn(fp, 'S'), doorOn(fp, 'N')],
    roof: 'hip',
    style: 0,
    shopfront: false,
    name: 'Town Hall',
  });
  const sq = rect(r.x0, r.z0 + 14, r.x1, r.z1);
  addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: sq, greenery: 0.3 });
  const fz = (sq.z0 + sq.z1) / 2 + 1;
  addFeature(c.plan, { kind: 'fountain', x: mx, z: fz, yaw: 0, radius: 5, params: { radius: 5 } });
  addFeature(c.plan, { kind: 'flagpole', x: mx - 9, z: r.z0 + 15.5, yaw: 0, radius: 0.4 });
  addFeature(c.plan, { kind: 'flagpole', x: mx + 9, z: r.z0 + 15.5, yaw: 0, radius: 0.4 });
  // Ring around the fountain + spokes to the plaza edges and the town hall door
  const ringR = 8;
  const ring: P2[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ring.push({ x: mx + Math.cos(a) * ringR, z: fz + Math.sin(a) * ringR });
  }
  addPath(c.plan, { kind: 'plaza', pts: ring, width: 3, surface: 'paving', y: 0.02, draw: false });
  // spokes: E (k=0), S (k=4), W (k=8), N (k=12)
  addPath(c.plan, { kind: 'plaza', pts: [ring[0], { x: r.x1, z: fz }], width: 3, surface: 'paving', y: 0.02, draw: false, linkEnds: [1] });
  addPath(c.plan, { kind: 'plaza', pts: [ring[8], { x: r.x0, z: fz }], width: 3, surface: 'paving', y: 0.02, draw: false, linkEnds: [1] });
  addPath(c.plan, { kind: 'plaza', pts: [ring[4], { x: mx, z: r.z1 }], width: 3, surface: 'paving', y: 0.02, draw: false, linkEnds: [1] });
  addPath(c.plan, { kind: 'plaza', pts: [ring[12], { x: mx, z: fp.z1 }], width: 3, surface: 'paving', y: 0.02, draw: false });
  for (const k of [2, 6, 10, 14]) {
    const p = ring[k];
    const nx = (p.x - mx) / ringR,
      nz = (p.z - fz) / ringR;
    addBench(c.plan, p.x, p.z, nx, nz, 1.9);
  }
}

function genStadium(c: Ctx, blk: Block): void {
  const r = blk.rect;
  const fp = rectInset(r, 1);
  addLot(c, blk, {
    rect: r,
    footprint: fp,
    kind: 'stadium',
    height: 11,
    floors: 1,
    front: 'N',
    doors: [doorOn(fp, 'N', 0.3), doorOn(fp, 'N', 0.7), doorOn(fp, 'E'), doorOn(fp, 'W')],
    roof: 'none',
    style: 0,
    shopfront: false,
    name: 'Haven Stadium',
  });
  addArea(c, blk, { kind: 'field', surface: 'field', rect: rectInset(r, 9), greenery: 0 });
  for (const [x, z] of [
    [r.x0 + 2.5, r.z0 + 2.5],
    [r.x1 - 2.5, r.z0 + 2.5],
    [r.x0 + 2.5, r.z1 - 2.5],
    [r.x1 - 2.5, r.z1 - 2.5],
  ]) {
    addFeature(c.plan, { kind: 'floodlight', x, z, yaw: Math.atan2((r.x0 + r.x1) / 2 - x, (r.z0 + r.z1) / 2 - z), radius: 0, params: { height: 26 } });
  }
}

function genSchool(c: Ctx, blk: Block): void {
  const r = blk.rect;
  const fp = rect(r.x0, r.z0, r.x0 + 26, r.z0 + 13);
  addLot(c, blk, {
    rect: rect(r.x0, r.z0, r.x0 + 27, r.z0 + 15),
    footprint: fp,
    kind: 'school',
    height: 10.5,
    floors: 3,
    front: 'N',
    doors: [doorOn(fp, 'N'), doorOn(fp, 'W', 0.6)],
    roof: 'flat',
    style: 1,
    shopfront: false,
    name: 'Westbrook School',
  });
  const fp2 = rect(r.x0, r.z0 + 15.5, r.x0 + 11, r.z0 + 26.5);
  addLot(c, blk, {
    rect: rect(r.x0, r.z0 + 15, r.x0 + 12, r.z0 + 27),
    footprint: fp2,
    kind: 'school',
    height: 7,
    floors: 2,
    front: 'W',
    doors: [doorOn(fp2, 'W')],
    roof: 'flat',
    style: 1,
    shopfront: false,
  });
  const yard = rect(r.x0 + 12, r.z0 + 15, r.x1, r.z1);
  addArea(c, blk, { kind: 'schoolyard', surface: 'asphalt', rect: yard, greenery: 0.1 });
  addFeature(c.plan, { kind: 'sportscourt', x: (yard.x0 + yard.x1) / 2, z: (yard.z0 + yard.z1) / 2, yaw: 0, radius: 0, rect: rectInset(yard, 3) });
  addArea(c, blk, { kind: 'lawn', surface: 'grass', rect: rect(r.x0, r.z0 + 27, r.x0 + 12, r.z1), greenery: 0.8 });
  addArea(c, blk, { kind: 'lawn', surface: 'grass', rect: rect(r.x0 + 27, r.z0, r.x1, r.z0 + 15), greenery: 0.7 });
}

function genApartments(c: Ctx, blk: Block): void {
  const r = blk.rect;
  const rng = c.rng;
  // Two slab blocks running E-W, parking between them, lawn in a corner
  const fpN = rect(r.x0 + 3, r.z0 + 2, r.x1 - 3, r.z0 + 13);
  const fpS = rect(r.x0 + 3, r.z1 - 13, r.x1 - 10, r.z1 - 2);
  addLot(c, blk, {
    rect: rect(r.x0, r.z0, r.x1, r.z0 + 15),
    footprint: fpN,
    kind: 'apartment',
    height: 18.5,
    floors: 6,
    front: 'N',
    doors: [doorOn(fpN, 'N', 0.25), doorOn(fpN, 'N', 0.75)],
    roof: 'flat',
    style: rng.int(0, 7),
    shopfront: false,
  });
  addLot(c, blk, {
    rect: rect(r.x0, r.z1 - 15, r.x1, r.z1),
    footprint: fpS,
    kind: 'apartment',
    height: 15.5,
    floors: 5,
    front: 'S',
    doors: [doorOn(fpS, 'S', 0.3), doorOn(fpS, 'S', 0.7)],
    roof: 'flat',
    style: rng.int(0, 7),
    shopfront: false,
  });
  addArea(c, blk, { kind: 'lawn', surface: 'grass', rect: r, greenery: 0.7 });
  const pk = rect(r.x0 + 4, r.z0 + 16, r.x1 - 4, r.z1 - 16);
  addArea(c, blk, { kind: 'parking', surface: 'asphalt', rect: pk, greenery: 0, layer: 1, stalls: makeStalls(rng, pk, 'EW', 0.6) });
}

function makeStalls(rng: Rng, area: Rect, orient: 'EW' | 'NS', fill: number): Stall[] {
  // Rows of perpendicular stalls (2.6 m wide, 5 m deep) along the long axis.
  const stalls: Stall[] = [];
  const along = orient === 'EW' ? [area.x0, area.x1] : [area.z0, area.z1];
  const across = orient === 'EW' ? [area.z0, area.z1] : [area.x0, area.x1];
  const n = Math.floor((along[1] - along[0] - 1) / 2.6);
  const start = (along[0] + along[1]) / 2 - (n * 2.6) / 2 + 1.3;
  const rows = across[1] - across[0] >= 13 ? [across[0] + 2.6, across[1] - 2.6] : [(across[0] + across[1]) / 2];
  rows.forEach((u, ri) => {
    for (let k = 0; k < n; k++) {
      const v = start + k * 2.6;
      // car noses point towards the aisle in the middle
      const yawEW = ri === 0 ? 0 : Math.PI;
      if (orient === 'EW') stalls.push({ x: v, z: u, yaw: yawEW, filled: rng.chance(fill) });
      else stalls.push({ x: u, z: v, yaw: ri === 0 ? Math.PI / 2 : -Math.PI / 2, filled: rng.chance(fill) });
    }
  });
  return stalls;
}

function genHouses(c: Ctx, blk: Block, orient: 'NS' | 'EW'): void {
  const r = blk.rect;
  const rng = c.rng;
  const halves: { side: Dir; lr: Rect }[] =
    orient === 'NS'
      ? [
          { side: 'N', lr: rect(r.x0, r.z0, r.x1, (r.z0 + r.z1) / 2) },
          { side: 'S', lr: rect(r.x0, (r.z0 + r.z1) / 2, r.x1, r.z1) },
        ]
      : [
          { side: 'W', lr: rect(r.x0, r.z0, (r.x0 + r.x1) / 2, r.z1) },
          { side: 'E', lr: rect((r.x0 + r.x1) / 2, r.z0, r.x1, r.z1) },
        ];
  for (const { side, lr } of halves) {
    const alongX = side === 'N' || side === 'S';
    const cuts = splitLength(rng, alongX ? lr.x0 : lr.z0, alongX ? lr.x1 : lr.z1, 12.5, 15.5);
    for (let k = 0; k < cuts.length - 1; k++) {
      const parcel = alongX ? rect(cuts[k], lr.z0, cuts[k + 1], lr.z1) : rect(lr.x0, cuts[k], lr.x1, cuts[k + 1]);
      placeHouse(c, blk, parcel, side, rng);
    }
  }
}

function placeHouse(c: Ctx, blk: Block, parcel: Rect, side: Dir, rng: Rng): void {
  const alongX = side === 'N' || side === 'S';
  const pw = alongX ? parcel.x1 - parcel.x0 : parcel.z1 - parcel.z0;
  const setback = rng.range(4, 5.5);
  const hw = Math.min(rng.range(7.5, 9.5), pw - 4.6); // width along street; leaves >= 3.8 m for a driveway
  const hd = rng.range(8, 10); // depth
  const atLow = rng.chance(0.5);
  const off = atLow ? 0.8 : pw - hw - 0.8;
  const u0 = (alongX ? parcel.x0 : parcel.z0) + off;
  let fp: Rect;
  switch (side) {
    case 'N':
      fp = rect(u0, parcel.z0 + setback, u0 + hw, parcel.z0 + setback + hd);
      break;
    case 'S':
      fp = rect(u0, parcel.z1 - setback - hd, u0 + hw, parcel.z1 - setback);
      break;
    case 'W':
      fp = rect(parcel.x0 + setback, u0, parcel.x0 + setback + hd, u0 + hw);
      break;
    case 'E':
      fp = rect(parcel.x1 - setback - hd, u0, parcel.x1 - setback, u0 + hw);
      break;
  }
  const floors = rng.chance(0.3) ? 1 : 2;
  addLot(c, blk, {
    rect: parcel,
    footprint: fp,
    kind: 'house',
    height: floors * 3 + 0.4,
    floors,
    front: side,
    doors: [doorOn(fp, side, rng.range(0.35, 0.65))],
    roof: rng.chance(0.75) ? 'gable' : 'hip',
    style: rng.int(0, 7),
    shopfront: false,
  });
  addArea(c, blk, { kind: 'garden', surface: 'grass', rect: parcel, greenery: 0.65 });
  // Driveway beside the house, on whichever side has room
  const dwW = 3;
  const low = alongX ? parcel.x0 : parcel.z0;
  const fpLow = alongX ? fp.x0 : fp.z0;
  const fpHigh = alongX ? fp.x1 : fp.z1;
  const dwU = fpLow - low > 3.6 ? low + 0.3 : fpHigh + 0.3;
  let dw: Rect;
  switch (side) {
    case 'N':
      dw = rect(dwU, parcel.z0, dwU + dwW, parcel.z0 + setback + 6);
      break;
    case 'S':
      dw = rect(dwU, parcel.z1 - setback - 6, dwU + dwW, parcel.z1);
      break;
    case 'W':
      dw = rect(parcel.x0, dwU, parcel.x0 + setback + 6, dwU + dwW);
      break;
    case 'E':
      dw = rect(parcel.x1 - setback - 6, dwU, parcel.x1, dwU + dwW);
      break;
  }
  const dwArea = addArea(c, blk, { kind: 'driveway', surface: 'paving', rect: dw, greenery: 0, layer: 1 });
  if (rng.chance(0.55)) {
    // parked car, nose towards the street or the house
    dwArea.stalls = [{ x: (dw.x0 + dw.x1) / 2, z: (dw.z0 + dw.z1) / 2, yaw: DIR_YAW[side] + (rng.chance(0.5) ? Math.PI : 0), filled: true }];
  }
}

function genFactory(c: Ctx, blk: Block): void {
  const r = blk.rect;
  const fp = rect(r.x0 + 2, r.z0 + 2, r.x0 + 30, r.z0 + 24);
  addLot(c, blk, {
    rect: rect(r.x0, r.z0, r.x0 + 32, r.z0 + 26),
    footprint: fp,
    kind: 'factory',
    height: 14,
    floors: 2,
    front: 'W',
    doors: [doorOn(fp, 'W', 0.7), doorOn(fp, 'N', 0.2)],
    roof: 'sawtooth',
    style: 0,
    shopfront: false,
    name: 'Haven Brickworks',
  });
  addArea(c, blk, { kind: 'yard', surface: 'concrete', rect: r, greenery: 0.05 });
  addFeature(c.plan, { kind: 'chimney', x: r.x0 + 35.5, z: r.z0 + 6, yaw: 0, radius: 2.2, params: { height: 38, radius: 1.8, smoke: true } });
  addFeature(c.plan, { kind: 'chimney', x: r.x0 + 37.5, z: r.z0 + 15, yaw: 0, radius: 1.8, params: { height: 30, radius: 1.4, smoke: true } });
  addFeature(c.plan, { kind: 'tanks', x: r.x0 + 10, z: r.z1 - 7, yaw: 0, radius: 0, rect: rect(r.x0 + 1, r.z1 - 12, r.x0 + 19, r.z1 - 2), params: { count: 3, radius: 2.8, height: 9 } });
  const fp2 = rect(r.x0 + 22, r.z1 - 14, r.x1 - 1, r.z1 - 1);
  addLot(c, blk, {
    rect: rect(r.x0 + 21, r.z1 - 15, r.x1, r.z1),
    footprint: fp2,
    kind: 'warehouse',
    height: 8,
    floors: 1,
    front: 'S',
    doors: [doorOn(fp2, 'S', 0.3), doorOn(fp2, 'E')],
    roof: 'barrel',
    style: 2,
    shopfront: false,
  });
}

function genWarehouses(c: Ctx, blk: Block, flavour: 'northgate' | 'harbor'): void {
  const r = blk.rect;
  const rng = c.rng;
  const mz = (r.z0 + r.z1) / 2;
  const fpN = rect(r.x0 + 1, r.z0 + 1, r.x1 - 1, mz - 3);
  const fpS = rect(r.x0 + 1, mz + 5, r.x0 + 26, r.z1 - 1);
  addLot(c, blk, {
    rect: rect(r.x0, r.z0, r.x1, mz - 2),
    footprint: fpN,
    kind: 'warehouse',
    height: rng.range(9, 12),
    floors: 2,
    front: 'N',
    doors: [doorOn(fpN, 'N', 0.25), doorOn(fpN, 'N', 0.75)],
    roof: flavour === 'harbor' ? 'gable' : 'sawtooth',
    style: flavour === 'harbor' ? 4 : 1,
    shopfront: false,
    name: flavour === 'harbor' ? 'Old Customs Warehouse' : undefined,
  });
  addLot(c, blk, {
    rect: rect(r.x0, mz + 4, r.x0 + 27, r.z1),
    footprint: fpS,
    kind: flavour === 'harbor' ? 'warehouse' : 'depot',
    height: rng.range(7, 9),
    floors: 1,
    front: 'S',
    doors: [doorOn(fpS, 'S'), doorOn(fpS, 'W')],
    roof: flavour === 'harbor' ? 'gable' : 'barrel',
    style: flavour === 'harbor' ? 5 : 2,
    shopfront: false,
  });
  addArea(c, blk, { kind: 'yard', surface: 'concrete', rect: r, greenery: 0.05 });
  const yard = rect(r.x0 + 28, mz + 1, r.x1, r.z1);
  addArea(c, blk, { kind: 'parking', surface: 'asphalt', rect: yard, greenery: 0, layer: 1, stalls: makeStalls(rng, yard, 'NS', 0.5) });
}

function genPark(c: Ctx, blk: Block): void {
  const plan = c.plan;
  const r = blk.rect; // x -103.5..-6.5, z -3.5..38.5
  const cz = (r.z0 + r.z1) / 2; // 17.5
  addArea(c, blk, { kind: 'lawn', surface: 'grass', rect: r, greenery: 1 });
  // Pond (west half) with an island
  const pond = { cx: r.x0 + 25.5, cz, rx: 14, rz: 8.5 }; // x -92..-64
  addArea(c, blk, { kind: 'pond', surface: 'soil', rect: rect(pond.cx - pond.rx, pond.cz - pond.rz, pond.cx + pond.rx, pond.cz + pond.rz), greenery: 0, ellipse: pond, layer: 1 });
  addFeature(plan, { kind: 'pondisland', x: pond.cx + 4, z: pond.cz - 1, yaw: 0, radius: 2.6, params: { radius: 2.6 } });
  // Hub plaza with the founder's statue
  const hub = { x: -45, z: cz };
  addFeature(plan, { kind: 'statue', x: hub.x, z: hub.z, yaw: 0, radius: 1.5, params: { style: 'founder' } });
  const pg = rect(r.x1 - 31, r.z1 - 15.5, r.x1 - 15, r.z1 - 5); // x -37.5..-21.5, z 23..33.5
  addArea(c, blk, { kind: 'playground', surface: 'sand', rect: pg, greenery: 0, layer: 1 });
  addFeature(plan, { kind: 'playground', x: (pg.x0 + pg.x1) / 2, z: (pg.z0 + pg.z1) / 2, yaw: 0, radius: 0, rect: pg });
  addFeature(plan, { kind: 'gazebo', x: -25.5, z: 7, yaw: 0, radius: 3.6, params: { radius: 3.5 } });
  addFeature(plan, { kind: 'kiosk', x: -32, z: 3.2, yaw: Math.PI, radius: 2.2, params: { name: 'Park Café' } });
  addFeature(plan, { kind: 'bandstand', x: -94, z: 30, yaw: Math.PI / 4, radius: 3.2, params: { radius: 3 } });

  const P = (x: number, z: number): P2 => ({ x, z });
  const yP = 0.03;
  // perimeter loop (inset 3 m) with vertices where other paths join
  const L = r.x0 + 3,
    R = r.x1 - 3,
    T = r.z0 + 3,
    B = r.z1 - 3;
  const topXs = [L, pond.cx, -45, -32, -20, R];
  const botXs = [L, pond.cx, -45, -20, R];
  addPath(plan, {
    kind: 'park',
    pts: [...topXs.map((x) => P(x, T)), P(R, cz), ...botXs.map((x) => P(x, B)).reverse(), P(L, cz), P(L, T)],
    width: 2.6,
    surface: 'gravel',
    y: yP,
    draw: true,
  });
  // entrances from the surrounding sidewalks
  for (const x of [pond.cx, -45, -20]) {
    addPath(plan, { kind: 'park', pts: [P(x, r.z0), P(x, T)], width: 2.6, surface: 'gravel', y: yP, draw: true, linkEnds: [0] });
    addPath(plan, { kind: 'park', pts: [P(x, B), P(x, r.z1)], width: 2.6, surface: 'gravel', y: yP, draw: true, linkEnds: [1] });
  }
  addPath(plan, { kind: 'park', pts: [P(r.x0, cz), P(L, cz)], width: 2.6, surface: 'gravel', y: yP, draw: true, linkEnds: [0] });
  addPath(plan, { kind: 'park', pts: [P(R, cz), P(r.x1, cz)], width: 2.6, surface: 'gravel', y: yP, draw: true, linkEnds: [1] });
  // loop around the pond (ellipse): ring[0] = east, ring[6] = south, ring[12] = west, ring[18] = north
  const prx = pond.rx + 3.6,
    prz = pond.rz + 3.4;
  const ring: P2[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ring.push(P(pond.cx + Math.cos(a) * prx, pond.cz + Math.sin(a) * prz));
  }
  addPath(plan, { kind: 'park', pts: ring, width: 2.4, surface: 'gravel', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [P(L, cz), ring[12]], width: 2.4, surface: 'gravel', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [P(pond.cx, T), ring[18]], width: 2.4, surface: 'gravel', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [ring[6], P(pond.cx, B)], width: 2.4, surface: 'gravel', y: yP, draw: true });
  // small round plaza around the statue, with spokes
  const hr = 4.5;
  const hubRing: P2[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    hubRing.push(P(hub.x + Math.cos(a) * hr, hub.z + Math.sin(a) * hr));
  }
  // hubRing[0] = east, [4] = south, [8] = west, [12] = north
  addPath(plan, { kind: 'park', pts: hubRing, width: 2.6, surface: 'paving', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [ring[0], hubRing[8]], width: 3.0, surface: 'gravel', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [P(hub.x, T), hubRing[12]], width: 3.0, surface: 'gravel', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [hubRing[4], P(hub.x, B)], width: 3.0, surface: 'gravel', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [hubRing[0], P(-25.5, cz), P(R, cz)], width: 3.0, surface: 'gravel', y: yP, draw: true });
  // little spurs to the gazebo steps and the café counter
  addPath(plan, { kind: 'park', pts: [P(-25.5, cz), P(-25.5, 7 + 4.4)], width: 2.0, surface: 'gravel', y: yP, draw: true });
  addPath(plan, { kind: 'park', pts: [P(-32, T), P(-32, 0.4)], width: 2.0, surface: 'gravel', y: yP, draw: false });
  // benches: around the pond and along the main axes
  for (const k of [3, 9, 15, 21]) {
    const p = ring[k];
    const nx = (p.x - pond.cx) / prx,
      nz = (p.z - pond.cz) / prz;
    const l = Math.hypot(nx, nz);
    addBench(plan, p.x, p.z, nx / l, nz / l, 1.8);
  }
  for (const x of [-37, -14]) addBench(plan, x, cz, 0, 1, 2.0);
  for (const z of [6, 29]) addBench(plan, hub.x, z, 1, 0, 2.0);
}

// ── edge blocks ────────────────────────────────────────────────────────

function genWestMargin(c: Ctx): void {
  const plan = c.plan;
  const r = rect(SLAB.x0, ZS[0] - CORRIDOR_HALF, XS[0] - CORRIDOR_HALF, ZS[NZ - 1] + CORRIDOR_HALF);
  const blk = addBlock(plan, { col: -1, row: -1, rect: r, districtId: 'westbrook', kind: 'suburb', surface: 'grass' });
  // Allotment gardens in the north part, houses facing east to the ring road elsewhere.
  addArea(c, blk, { kind: 'allotment', surface: 'soil', rect: rect(r.x0 + 4, r.z0 + 1, r.x1 - 1, r.z0 + 29), greenery: 0.5 });
  const cuts = splitLength(c.rng, r.z0 + 30, r.z1, 13, 16);
  for (let k = 0; k < cuts.length - 1; k++) {
    placeHouse(c, blk, rect(r.x0 + 2, cuts[k], r.x1, cuts[k + 1]), 'E', c.rng);
  }
}

function genNorthStrip(c: Ctx): void {
  const plan = c.plan;
  const z0 = RAIL_Z + 4.5; // -150.5, just south of the track bed
  const z1 = ZS[0] - CORRIDOR_HALF; // -126.5
  // West: freight yard + warehouse + water tower (x -180..-115)
  {
    const r = rect(SPUR_W_X + 2, z0, XS[1] - 5, z1);
    const blk = addBlock(plan, { col: -1, row: -2, rect: r, districtId: 'northgate', kind: 'industrial', surface: 'concrete' });
    addArea(c, blk, { kind: 'yard', surface: 'concrete', rect: r, greenery: 0.1 });
    addArea(c, blk, { kind: 'freightyard', surface: 'gravel', rect: rect(r.x0, r.z0, r.x0 + 22, r.z1), greenery: 0.1, layer: 1 });
    const fp = rect(r.x0 + 26, r.z0 + 3, r.x0 + 52, r.z1 - 2);
    addLot(c, blk, {
      rect: rect(r.x0 + 24, r.z0, r.x0 + 54, r.z1),
      footprint: fp,
      kind: 'warehouse',
      height: 10,
      floors: 1,
      front: 'S',
      doors: [doorOn(fp, 'S', 0.25), doorOn(fp, 'S', 0.75)],
      roof: 'sawtooth',
      style: 3,
      shopfront: false,
    });
    const wt = rect(r.x0 + 4, r.z1 - 13, r.x0 + 14, r.z1 - 3);
    addLot(c, blk, {
      rect: wt,
      footprint: rectInset(wt, 1.5),
      kind: 'watertower',
      height: 24,
      floors: 1,
      front: 'S',
      doors: [],
      roof: 'none',
      style: 0,
      shopfront: false,
      name: 'Water Tower',
    });
    addFeature(plan, { kind: 'containerstack', x: r.x0 + 59, z: (r.z0 + r.z1) / 2, yaw: 0, radius: 0, rect: rect(r.x0 + 56, r.z0 + 2, r.x1 - 2, r.z1 - 3), params: { maxHeight: 2 } });
  }
  // Centre: the station (x -105..50)
  {
    const r = rect(XS[1] + 5, z0, XS[4] - 5, z1);
    const blk = addBlock(plan, { col: -1, row: -2, rect: r, districtId: 'station', kind: 'station', surface: 'paving' });
    const fp = rect(-24, -141, 24, z1 - 1);
    addLot(c, blk, {
      rect: rect(-26, -142, 26, z1),
      footprint: fp,
      kind: 'station',
      height: 13,
      floors: 2,
      front: 'S',
      doors: [doorOn(fp, 'S', 0.5), doorOn(fp, 'S', 0.22), doorOn(fp, 'S', 0.78)],
      roof: 'barrel',
      style: 0,
      shopfront: false,
      name: 'Tinyhaven Central',
    });
    addArea(c, blk, { kind: 'platform', surface: 'concrete', rect: rect(-47, z0, 47, -142), greenery: 0 });
    const pk = rect(r.x0 + 2, -149, -49, -128);
    addArea(c, blk, { kind: 'parking', surface: 'asphalt', rect: pk, greenery: 0, stalls: makeStalls(c.rng, pk, 'EW', 0.7) });
    addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(-47, -142, -26, z1), greenery: 0.4 });
    addArea(c, blk, { kind: 'plaza', surface: 'paving', rect: rect(26, -142, r.x1, z1), greenery: 0.4 });
    const hfp = rect(-33.5, -136, -28.5, -129.5);
    addLot(c, blk, {
      rect: rect(-34, -137, -28, z1),
      footprint: hfp,
      kind: 'kiosk',
      height: 4,
      floors: 1,
      front: 'S',
      doors: [doorOn(hfp, 'S')],
      roof: 'flat',
      style: 2,
      shopfront: true,
      name: 'Station Kiosk',
    });
  }
  // East: container yard (x 60..111)
  {
    const r = rect(XS[4] + 5, z0, SPUR_E_X - 1, z1);
    const blk = addBlock(plan, { col: -1, row: -2, rect: r, districtId: 'harbor', kind: 'harbor', surface: 'concrete' });
    addArea(c, blk, { kind: 'containeryard', surface: 'concrete', rect: r, greenery: 0 });
    addFeature(plan, { kind: 'containerstack', x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, yaw: 0, radius: 0, rect: rectInset(r, 2.5), params: { maxHeight: 3 } });
  }
}

function genQuay(c: Ctx): void {
  const plan = c.plan;
  const xA = XS[NX - 1] + CORRIDOR_HALF; // 116.5
  const r = rect(xA, ZS[0] - CORRIDOR_HALF, QUAY_X, -6);
  const blk = addBlock(plan, { col: -1, row: -3, rect: r, districtId: 'harbor', kind: 'harbor', surface: 'concrete' });
  addArea(c, blk, { kind: 'quay', surface: 'concrete', rect: r, greenery: 0 });
  addFeature(plan, { kind: 'containerstack', x: xA + 5, z: -70, yaw: 0, radius: 0, rect: rect(xA + 1.5, -118, xA + 8.5, -24), params: { maxHeight: 3 } });
  for (const z of [-104, -78, -52]) {
    addFeature(plan, { kind: 'gantrycrane', x: QUAY_X - 4.5, z, yaw: Math.PI / 2, radius: 0, a: { x: QUAY_X - 4.5, z: -122 }, b: { x: QUAY_X - 4.5, z: -24 }, params: { height: 30, reach: 22, gauge: 7 } });
  }
  // Harbour master's office + ferry dock at the south end of the quay
  const hm = rect(xA + 1, -18, xA + 11, -8);
  addLot(c, blk, {
    rect: rect(xA, -20, xA + 12, -6),
    footprint: hm,
    kind: 'harbormaster',
    height: 9,
    floors: 2,
    front: 'W',
    doors: [doorOn(hm, 'W')],
    roof: 'hip',
    style: 4,
    shopfront: false,
    name: 'Harbour Master',
  });
  addFeature(plan, { kind: 'ferrydock', x: QUAY_X + 4, z: -14, yaw: Math.PI / 2, radius: 0, rect: rect(QUAY_X, -18, QUAY_X + 8, -10) });
}

function genRiverside(c: Ctx): void {
  const plan = c.plan;
  const zP0 = ZS[NZ - 1] + CORRIDOR_HALF; // 106.5
  const xEnd = XS[NX - 1] + CORRIDOR_HALF; // 116.5
  // Promenade strip between the southern ring road's sidewalk and the river wall
  const prom = rect(SLAB.x0, zP0, xEnd, RIVER.z0);
  const blkP = addBlock(plan, { col: -1, row: -4, rect: prom, districtId: 'riverside', kind: 'riverside', surface: 'paving' });
  addArea(c, blkP, { kind: 'promenade', surface: 'paving', rect: prom, greenery: 0 });
  // South bank park
  const sb = rect(SLAB.x0, RIVER.z1, 117, SLAB.z1);
  const blk = addBlock(plan, { col: -1, row: -5, rect: sb, districtId: 'riverside', kind: 'riverside', surface: 'grass' });
  addArea(c, blk, { kind: 'lawn', surface: 'grass', rect: sb, greenery: 0.85 });
  // Rowing club faces the river; its door opens onto the riverside walk
  const zS = RIVER.z1 + 5; // 131
  const bh = rect(84, 134, 98, 141.5);
  addLot(c, blk, {
    rect: rect(83, 133, 99, 142.5),
    footprint: bh,
    kind: 'boathouse',
    height: 6,
    floors: 1,
    front: 'N',
    doors: [doorOn(bh, 'N')],
    roof: 'gable',
    style: 5,
    shopfront: false,
    name: 'Rowing Club',
  });
  addFeature(plan, { kind: 'jetty', x: 91, z: RIVER.z1 - 2.5, yaw: 0, radius: 0, a: { x: 91, z: RIVER.z1 }, b: { x: 91, z: RIVER.z1 - 5 } });
  addFeature(plan, { kind: 'picnic', x: -150, z: 143, yaw: 0.3, radius: 1.6 });
  addFeature(plan, { kind: 'picnic', x: -60, z: 145.5, yaw: -0.4, radius: 1.6 });
  addFeature(plan, { kind: 'picnic', x: 50, z: 145, yaw: 0.1, radius: 1.6 });
  // Riverside walk on the south bank + promenade on the north bank
  const bridgeXs = [(XS[1] + XS[2]) / 2, (XS[3] + XS[4]) / 2]; // -82.5, 27.5
  const southPts: P2[] = [{ x: SLAB.x0 + 2, z: zS }];
  for (const x of [-140, ...bridgeXs, 75, 91, 112]) southPts.push({ x, z: zS });
  southPts.sort((a, b) => a.x - b.x);
  addPath(plan, { kind: 'riverbank', pts: southPts, width: 2.6, surface: 'gravel', y: 0.03, draw: true });
  // loop paths through the south bank meadow
  addPath(plan, { kind: 'riverbank', pts: [{ x: -140, z: zS }, { x: -120, z: 141 }, { x: -82.5, z: 143 }, { x: -40, z: 140 }, { x: 0, z: 141 }, { x: 27.5, z: zS }], width: 2.0, surface: 'gravel', y: 0.03, draw: true });
  addPath(plan, { kind: 'riverbank', pts: [{ x: 27.5, z: zS }, { x: 60, z: 140 }, { x: 75, z: zS }], width: 2.0, surface: 'gravel', y: 0.03, draw: true });
  // Rowing club door -> walk
  addPath(plan, { kind: 'riverbank', pts: [{ x: 91, z: bh.z0 }, { x: 91, z: zS }], width: 2.0, surface: 'gravel', y: 0.03, draw: true });
  // Promenade walk along the river wall (north bank)
  const zN = (zP0 + RIVER.z0) / 2; // 108.25
  const promPts: P2[] = [{ x: SLAB.x0 + 2, z: zN }];
  for (let x = -175; x < xEnd - 5; x += 27.5) promPts.push({ x, z: zN });
  for (const bx of bridgeXs) if (!promPts.some((p) => Math.abs(p.x - bx) < 0.01)) promPts.push({ x: bx, z: zN });
  promPts.sort((a, b) => a.x - b.x);
  promPts.push({ x: xEnd - 1, z: zN });
  addPath(plan, { kind: 'promenade', pts: promPts, width: 2.6, surface: 'paving', y: SIDEWALK_Y, draw: false });
  // Footbridges across the river (pedestrian only): promenade -> south bank walk
  for (const x of bridgeXs) {
    addFeature(plan, { kind: 'footbridge', x, z: (RIVER.z0 + RIVER.z1) / 2, yaw: 0, radius: 0, a: { x, z: zN }, b: { x, z: zS }, params: { width: 3.6 } });
    addPath(plan, { kind: 'bridge', pts: [{ x, z: zN }, { x, z: RIVER.z0 - 0.5 }, { x, z: RIVER.z1 + 0.5 }, { x, z: zS }], width: 3.0, surface: 'deck', y: 0.15, yMid: 1.9, draw: false });
  }
  // Promenade benches facing the river
  for (let x = -160; x < 100; x += 32) {
    if (bridgeXs.some((b) => Math.abs(b - x) < 8)) continue;
    plan.benches.push({ x, z: RIVER.z0 - 0.8, yaw: 0, ax: x, az: zN });
  }
  // Promenade link points to the road sidewalk (every ~27 m, only where the road runs)
  for (let x = -147.5; x < xEnd - 5; x += 27.5) {
    addPath(plan, { kind: 'promenade', pts: [{ x, z: zN }, { x, z: zP0 }], width: 2.0, surface: 'paving', y: SIDEWALK_Y, draw: false, linkEnds: [1] });
  }
}

// ────────────────────────────────────────────────────── water & rail ──

function buildWaterAndRail(plan: CityPlan): void {
  const pondArea = plan.areas.find((a) => a.kind === 'pond');
  plan.water = {
    level: WATER_LEVEL,
    seaRect: rect(112, SLAB.z0, SLAB.x1, SLAB.z1),
    river: rect(SLAB.x0, RIVER.z0, 150, RIVER.z1),
    riverBedY: RIVER.bedY,
    ponds: pondArea?.ellipse ? [{ ...pondArea.ellipse, level: -0.3, bedY: -1.3 }] : [],
    quayWalls: [
      { a: { x: QUAY_X, z: -140 }, b: { x: QUAY_X, z: -6 }, top: 0, bottom: -5.5 },
      { a: { x: SLAB.x0, z: RIVER.z0 }, b: { x: 117, z: RIVER.z0 }, top: SIDEWALK_Y, bottom: RIVER.bedY },
      { a: { x: SLAB.x0, z: RIVER.z1 }, b: { x: 117, z: RIVER.z1 }, top: 0, bottom: RIVER.bedY },
    ],
  };
  plan.rail = {
    z: RAIL_Z,
    x0: SLAB.x0 + 1,
    x1: QUAY_X - 2,
    portalW: SPUR_W_X,
    portalE: SPUR_E_X,
    railY: 0.45,
    stations: [
      {
        name: 'Tinyhaven Central',
        x0: -46,
        x1: 46,
        platform: rect(-46, RAIL_Z + 2.0, 46, RAIL_Z + 6.0),
        platformY: 0.95,
        door: { x: 0, z: ZS[0] - CORRIDOR_HALF - 1, dir: 'S' },
      },
    ],
    crossings: [
      { id: 0, x: XS[1], nodeSouth: gridNodeId(1, 0), portalNode: PORTAL_W_NODE },
      { id: 1, x: XS[4], nodeSouth: gridNodeId(4, 0), portalNode: PORTAL_E_NODE },
    ],
  };
  addFeature(plan, { kind: 'roadportal', x: XS[1], z: RIDGE_FOOT_Z - 1, yaw: 0, radius: 0, params: { width: 10, height: 6.5 } });
  addFeature(plan, { kind: 'roadportal', x: XS[4], z: RIDGE_FOOT_Z - 1, yaw: 0, radius: 0, params: { width: 10, height: 6.5 } });
  addFeature(plan, { kind: 'railportal', x: SPUR_W_X, z: RAIL_Z, yaw: Math.PI / 2, radius: 0, params: { width: 7, height: 7 } });
  addFeature(plan, { kind: 'railportal', x: SPUR_E_X, z: RAIL_Z, yaw: -Math.PI / 2, radius: 0, params: { width: 7, height: 7 } });
}

function buildWaterfront(plan: CityPlan, rng: Rng): void {
  // Breakwater + lighthouse closing the harbour basin to the north-east
  addFeature(plan, { kind: 'breakwater', x: 160, z: -142, yaw: Math.PI / 2, radius: 0, a: { x: QUAY_X - 2, z: -142 }, b: { x: 181, z: -142 }, params: { width: 7 } });
  addFeature(plan, { kind: 'lighthouse', x: 184, z: -142, yaw: 0, radius: 3.5, params: { height: 24 } });
  // Moored cargo ship along the quay
  addFeature(plan, { kind: 'cargoship', x: QUAY_X + 9, z: -78, yaw: Math.PI, radius: 0, params: { length: 74, beam: 13 } });
  // Amusement pier with ferris wheel and carousel
  addFeature(plan, { kind: 'pier', x: 155, z: PIER_Z, yaw: Math.PI / 2, radius: 0, a: { x: 121, z: PIER_Z }, b: { x: 190, z: PIER_Z }, params: { width: 13, deckY: 0.3 } });
  addFeature(plan, { kind: 'ferriswheel', x: 176, z: PIER_Z + 2, yaw: 0, radius: 0, rect: rect(169, PIER_Z - 1.5, 183, PIER_Z + 5.5), params: { radius: 15, hub: 17.5 } });
  addFeature(plan, { kind: 'carousel', x: 151, z: PIER_Z + 2.6, yaw: 0, radius: 3.9, params: { radius: 3.8 } });
  // Beach furniture
  addFeature(plan, { kind: 'lifeguard', x: 134, z: 30, yaw: Math.PI / 2, radius: 1.5 });
  addFeature(plan, { kind: 'lifeguard', x: 134, z: 92, yaw: Math.PI / 2, radius: 1.5 });
  addFeature(plan, { kind: 'umbrellas', x: 130, z: 32, yaw: 0, radius: 0, rect: rect(124, 6, 138, 54), params: { count: 22 } });
  addFeature(plan, { kind: 'umbrellas', x: 130, z: 86, yaw: 0, radius: 0, rect: rect(124, 70, 138, 104), params: { count: 16 } });
  // Beach & boardwalk block
  const xA = XS[NX - 1] + CORRIDOR_HALF; // 116.5
  const r = rect(xA, -6, 145, RIVER.z0);
  const blk = addBlock(plan, { col: -1, row: -6, rect: r, districtId: 'beach', kind: 'beach', surface: 'sand' });
  const c: Ctx = { plan, rng };
  addArea(c, blk, { kind: 'beach', surface: 'sand', rect: rect(xA + 4.5, -6, 145, RIVER.z0), greenery: 0.12 });
  addArea(c, blk, { kind: 'boardwalk', surface: 'deck', rect: rect(xA, -6, xA + 4.5, RIVER.z0), greenery: 0, layer: 1 });
  const kfp = rect(xA + 0.6, 20, xA + 4.1, 25);
  addLot(c, blk, {
    rect: rect(xA, 19, xA + 4.5, 26),
    footprint: kfp,
    kind: 'kiosk',
    height: 3.6,
    floors: 1,
    front: 'W',
    doors: [doorOn(kfp, 'W')],
    roof: 'flat',
    style: 6,
    shopfront: true,
    name: 'Ice Cream',
  });
  // Boardwalk path (runs along the beach, bends round the kiosk on the sand side)
  const bx = xA + 2.25,
    by = 0.3;
  addPath(plan, { kind: 'boardwalk', pts: [{ x: bx, z: -5 }, { x: bx, z: 17 }, { x: xA + 6.2, z: 19 }, { x: xA + 6.2, z: 26 }, { x: bx, z: 28 }, { x: bx, z: PIER_Z - 4.4 }, { x: bx, z: 108.5 }], width: 2.6, surface: 'deck', y: by, draw: false });
  // Links from the boardwalk to the road sidewalk
  for (const z of [-2, 40, 75, 100]) addPath(plan, { kind: 'boardwalk', pts: [{ x: xA, z }, { x: bx, z }], width: 2.0, surface: 'deck', y: by, draw: false, linkEnds: [0] });
  // fix: the link endpoints must sit on the boardwalk polyline -> insert explicit vertices there
  const bw = plan.paths.find((p) => p.kind === 'boardwalk')!;
  for (const z of [-2, 40, 75, 100]) {
    if (!bw.pts.some((p) => Math.abs(p.z - z) < 0.01 && Math.abs(p.x - bx) < 0.01)) bw.pts.push({ x: bx, z });
  }
  bw.pts.sort((a, b) => a.z - b.z);
  // Pier walk (south side of the deck, clear of the ferris wheel and carousel)
  const pz = PIER_Z - 4.4;
  addPath(plan, { kind: 'pier', pts: [{ x: bx, z: pz }, { x: 146, z: pz }, { x: 165, z: pz }, { x: 188, z: pz }], width: 2.6, surface: 'deck', y: by, draw: false });
  plan.benches.push({ x: 160, z: pz + 1.9, yaw: Math.PI, ax: 160, az: pz }); // deck side of the walk, facing it (and the sea beyond)
  plan.benches.push({ x: 186, z: pz + 1.9, yaw: Math.PI, ax: 186, az: pz });
  // Beach sunbathing spots: short sand paths east of the boardwalk
  for (const z of [10, 38, 47, 80, 97]) {
    addPath(plan, { kind: 'beach', pts: [{ x: bx, z }, { x: 128 + rng.range(0, 6), z: z + rng.range(-2, 2) }], width: 2.0, surface: 'sand', y: 0.05, draw: false });
    if (!bw.pts.some((p) => Math.abs(p.z - z) < 0.01)) bw.pts.push({ x: bx, z });
  }
  bw.pts.sort((a, b) => a.z - b.z);
}

function buildHills(plan: CityPlan, rng: Rng): void {
  // Wind turbines along the ridge crest
  for (const x of [-140, -60, 20, 85]) {
    addFeature(plan, { kind: 'windturbine', x, z: -181 + rng.range(-2, 2), yaw: rng.range(-0.3, 0.3), radius: 2, params: { height: 30, rotor: 13 } });
  }
}

// ───────────────────────────────────────────────────────────── bus lines ──

function buildBusLines(plan: CityPlan): void {
  const g = gridNodeId;
  // Line 1 (red): station -> downtown -> park -> market -> beach road -> harbour gate -> station
  plan.busRoutes.push({ id: 0, name: 'Line 1', color: '#d94a3d', nodes: [g(3, 0), g(3, 1), g(3, 2), g(3, 3), g(4, 3), g(5, 3), g(5, 2), g(5, 1), g(4, 1), g(4, 0)] });
  // Line 2 (blue): midtown -> Westbrook -> riverside -> town hall
  plan.busRoutes.push({ id: 1, name: 'Line 2', color: '#2f6fd0', nodes: [g(3, 1), g(2, 1), g(1, 1), g(0, 1), g(0, 2), g(0, 3), g(0, 4), g(1, 4), g(2, 4), g(3, 4), g(3, 3), g(3, 2)] });
  const stops: { from: number; to: number; name: string; route: number }[] = [
    { from: g(4, 0), to: g(3, 0), name: 'Central Station', route: 0 },
    { from: g(3, 0), to: g(3, 1), name: 'Downtown', route: 0 },
    { from: g(3, 2), to: g(3, 3), name: 'Central Park', route: 0 },
    { from: g(3, 3), to: g(4, 3), name: 'Market', route: 0 },
    { from: g(5, 3), to: g(5, 2), name: 'Beach Road', route: 0 },
    { from: g(5, 1), to: g(4, 1), name: 'Harbour Gate', route: 0 },
    { from: g(2, 1), to: g(1, 1), name: 'Northgate', route: 1 },
    { from: g(0, 2), to: g(0, 3), name: 'Westbrook', route: 1 },
    { from: g(1, 4), to: g(2, 4), name: 'Riverside', route: 1 },
    { from: g(3, 3), to: g(3, 2), name: 'Town Hall', route: 1 },
  ];
  for (const st of stops) {
    const seg = plan.roadSegments.find((s) => (s.a === st.from && s.b === st.to) || (s.a === st.to && s.b === st.from));
    if (!seg) throw new Error(`bus stop ${st.name}: no segment`);
    const A = plan.roadNodes[st.from],
      B = plan.roadNodes[st.to];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const along = L * 0.6;
    const tx = (B.x - A.x) / L,
      tz = (B.z - A.z) / L;
    const rx = -tz,
      rz = tx; // right of travel
    plan.busStops.push({
      id: plan.busStops.length,
      segment: seg.id,
      from: st.from,
      to: st.to,
      along,
      x: A.x + tx * (along - 4) + rx * FURN_OFFSET,
      z: A.z + tz * (along - 4) + rz * FURN_OFFSET,
      yaw: Math.atan2(rx, rz),
      name: st.name,
      route: st.route,
    });
  }
}

// ────────────────────────────────────────────────────────── street slots ──

function buildStreetSlots(plan: CityPlan, rng: Rng): void {
  const driveways = plan.areas.filter((a) => a.kind === 'driveway');
  for (const seg of plan.roadSegments) {
    if (!seg.sidewalks) continue;
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const tx = (B.x - A.x) / L,
      tz = (B.z - A.z) / L;
    for (const side of ['L', 'R'] as const) {
      const sgn = side === 'R' ? 1 : -1;
      const rx = -tz * sgn,
        rz = tx * sgn; // outward normal (away from road centre)
      const start = 11,
        end = L - 11;
      const spacing = 11;
      const n = Math.floor((end - start) / spacing) + 1;
      const offset = (end - start - (n - 1) * spacing) / 2;
      for (let k = 0; k < n; k++) {
        const u = start + offset + k * spacing;
        const x = A.x + tx * u + rx * FURN_OFFSET;
        const z = A.z + tz * u + rz * FURN_OFFSET;
        const probe = { x: A.x + tx * u + rx * (CORRIDOR_HALF + 2), z: A.z + tz * u + rz * (CORRIDOR_HALF + 2) };
        const dk: DistrictKind = plan.districtAt(probe.x, probe.z)?.kind ?? 'riverside';
        if (plan.busStops.some((b) => Math.hypot(b.x - x, b.z - z) < 7)) continue;
        const dw = driveways.some((d) => rectContains(d.rect, x + rx * 3.2, z + rz * 3.2, 1.6));
        const lampTurn = (k + (side === 'L' ? 1 : 0)) % 2 === 0;
        let kind: SlotKind = lampTurn ? 'lamp' : pickFurniture(rng, dk);
        if (dw && kind !== 'lamp') kind = 'empty';
        plan.slots.push({ x, z, yaw: Math.atan2(rx, rz), kind, segment: seg.id, side, district: dk });
      }
    }
  }
  for (const b of plan.busStops) {
    plan.slots.push({ x: b.x, z: b.z, yaw: b.yaw, kind: 'busstop', segment: b.segment, side: 'R', district: plan.districtAt(b.x - Math.sin(b.yaw) * -4, b.z - Math.cos(b.yaw) * -4)?.kind ?? 'downtown', busStop: b.id });
  }
}

function pickFurniture(rng: Rng, dk: DistrictKind): SlotKind {
  switch (dk) {
    case 'downtown':
    case 'midtown':
      return rng.weighted<SlotKind>(['tree', 'bench', 'bin', 'planter', 'bikerack', 'newsstand', 'phonebox', 'hydrant'], [5, 2, 1.5, 1.5, 1, 0.5, 0.4, 0.8]);
    case 'oldtown':
    case 'market':
    case 'civic':
      return rng.weighted<SlotKind>(['tree', 'bench', 'bin', 'planter', 'bikerack', 'mailbox', 'hydrant'], [4, 2.5, 1.2, 2, 1, 0.6, 0.6]);
    case 'industrial':
    case 'harbor':
    case 'station':
      return rng.weighted<SlotKind>(['tree', 'empty', 'hydrant', 'bin'], [2, 3, 1, 0.5]);
    case 'park':
    case 'riverside':
    case 'beach':
      return rng.weighted<SlotKind>(['tree', 'bench', 'bin'], [6, 2.5, 1]);
    default:
      return rng.weighted<SlotKind>(['tree', 'empty', 'hydrant', 'mailbox', 'bench'], [7, 1.5, 0.7, 0.5, 0.6]);
  }
}

// ──────────────────────────────────────────────────────────────── POIs ──

function buildPois(plan: CityPlan): void {
  plan.pois = [
    { id: 'overview', name: 'Overview', target: { x: -5, y: 0, z: -15 }, distance: 560, yaw: 32, pitch: 40 },
    { id: 'downtown', name: 'Downtown', target: { x: -5, y: 18, z: -60 }, distance: 190, yaw: 25, pitch: 30 },
    { id: 'harbor', name: 'Harbour', target: { x: 128, y: 0, z: -78 }, distance: 160, yaw: 70, pitch: 32 },
    { id: 'beach', name: 'Beach & Pier', target: { x: 148, y: 4, z: 58 }, distance: 150, yaw: 120, pitch: 26 },
    { id: 'park', name: 'Central Park', target: { x: -55, y: 0, z: 17 }, distance: 130, yaw: 15, pitch: 40 },
    { id: 'oldtown', name: 'Old Town', target: { x: 82, y: 0, z: 20 }, distance: 120, yaw: 40, pitch: 34 },
    // seen from the WSW over the low Northgate warehouses: from the south the downtown towers block the view
    { id: 'station', name: 'Central Station', target: { x: 0, y: 2, z: -142 }, distance: 120, yaw: -95, pitch: 42 },
    { id: 'riverside', name: 'Riverside', target: { x: -30, y: 0, z: 118 }, distance: 120, yaw: 20, pitch: 28 },
    { id: 'stadium', name: 'Stadium & Market', target: { x: 0, y: 0, z: 72 }, distance: 130, yaw: -20, pitch: 38 },
    { id: 'westbrook', name: 'Westbrook', target: { x: -150, y: 0, z: 20 }, distance: 140, yaw: -35, pitch: 36 },
    { id: 'industry', name: 'Northgate Works', target: { x: -135, y: 0, z: -115 }, distance: 140, yaw: -30, pitch: 34 },
  ];
  if (DIORAMA) return;
  // world mode: the hero overview lowers toward the horizon (mountains and sky in frame), and views of the
  // landscape around the town (proposed by the world agent; no number keys — they are in the Places menu)
  const ov = plan.pois[0];
  ov.distance = 640;
  ov.pitch = 13;
  plan.pois.push(
    { id: 'vista', name: 'Tinyhaven & the mountains', target: { x: -10, y: 15, z: -90 }, distance: 720, yaw: 12, pitch: 12 },
    { id: 'country', name: 'Westbrook fields', target: { x: -230, y: 2, z: 30 }, distance: 150, yaw: 70, pitch: 8 },
    { id: 'coast', name: 'Lighthouse & open sea', target: { x: 230, y: 3, z: -40 }, distance: 140, yaw: -40, pitch: 6 },
    { id: 'riverbend', name: 'River west', target: { x: -300, y: 1, z: 118 }, distance: 52, yaw: 95, pitch: 7 },
  );
}

// ─────────────────────────────────────────────────────── terrain queries ──

function seaFloor(x: number, z: number): number {
  const quay = x > QUAY_X ? -5.5 - (x - QUAY_X) * 0.05 : Infinity;
  const beach = x <= 121 ? Infinity : x <= 150 ? -0.08 * (x - 121) : -2.32 - (x - 150) * 0.13;
  if (z < -6) return quay;
  if (z > 6) return beach;
  const t = smoothstep(-6, 6, z);
  if (quay === Infinity && beach === Infinity) return Infinity;
  const q = quay === Infinity ? 0 : quay;
  const b = beach === Infinity ? 0 : beach;
  return q * (1 - t) + b * t;
}

function hills(x: number, z: number): number {
  let h = 0;
  // Northern ridge: steep cut at the foot (tunnel portals), gentle rise to the crest; tapers into the sea
  if (z < RIDGE_FOOT_Z + 0.5) {
    const crest = 17 + 6 * Math.sin(x * 0.021 + 0.7) + 3.5 * Math.sin(x * 0.057 + 2.1) + 1.5 * Math.sin(x * 0.13);
    const t = smoothstep(RIDGE_FOOT_Z + 0.5, RIDGE_FOOT_Z - 2.5, z) * 0.55 + smoothstep(RIDGE_FOOT_Z - 2, -186, z) * 0.45;
    const taper = 1 - smoothstep(118, 142, x) * 0.8;
    h = Math.max(h, Math.max(crest, 11) * t * taper);
  }
  // West spur (rail tunnel portal faces east at SPUR_W_X)
  if (x < SPUR_W_X + 0.5 && z < -137) {
    const t = smoothstep(SPUR_W_X + 0.5, SPUR_W_X - 2.5, x) * 0.6 + smoothstep(SPUR_W_X - 2, SLAB.x0, x) * 0.4;
    const tz = smoothstep(-137, -145, z);
    h = Math.max(h, (14 + 2 * Math.sin(z * 0.2)) * t * tz);
  }
  // East spur (rail tunnel portal faces west at SPUR_E_X); rocky slope down to the sea
  if (x > SPUR_E_X - 0.5 && z < -137) {
    const t = smoothstep(SPUR_E_X - 0.5, SPUR_E_X + 2.5, x) * 0.6 + smoothstep(SPUR_E_X + 2, SPUR_E_X + 12, x) * 0.4;
    const tz = smoothstep(-137, -145, z);
    const cliff = 1 - smoothstep(QUAY_X - 6, QUAY_X + 6, x);
    h = Math.max(h, 13 * t * tz * cliff);
  }
  return h;
}

/**
 * Natural terrain height. The whole city zone is flat at 0; hills rise in the north,
 * water beds drop below the water level. Roads/sidewalks/buildings sit on top of this.
 */
export function heightAt(x: number, z: number): number {
  const h = hills(x, z);
  if (z > RIVER.z0 && z < RIVER.z1) return Math.min(RIVER.bedY, seaFloor(x, z));
  return Math.min(h, seaFloor(x, z));
}

function isWaterAt(plan: CityPlan, x: number, z: number): boolean {
  if (heightAt(x, z) < WATER_LEVEL - 0.02) return true;
  for (const p of plan.water?.ponds ?? []) {
    const dx = (x - p.cx) / p.rx,
      dz = (z - p.cz) / p.rz;
    if (dx * dx + dz * dz < 1) return true;
  }
  return false;
}

function districtAt(plan: CityPlan, x: number, z: number): District | null {
  for (const b of plan.blocks) {
    if (rectContains(b.rect, x, z)) return plan.districts.find((d) => d.id === b.districtId) ?? null;
  }
  if (z < RIDGE_FOOT_Z) return plan.districts.find((d) => d.id === 'hills') ?? null;
  return null;
}

export function blockAt(plan: CityPlan, x: number, z: number): Block | null {
  for (const b of plan.blocks) if (rectContains(b.rect, x, z)) return b;
  return null;
}

/** Stable per-lot pseudo-random value in [0,1). */
export function lotRand(lot: Lot, salt: number): number {
  return (hashString(`${lot.seed}:${salt}`) % 100000) / 100000;
}

void clamp;
