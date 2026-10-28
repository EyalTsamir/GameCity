// Where people go: a catalogue of destinations derived once from the plan and the
// pedestrian graph — doors (by building use), benches with seats, beach towel
// spots, viewpoints (dead ends, fountains, the pond…), bus stops with waiting
// spots, waypoints for jogging / strolling loops, shopfronts and market stalls.

import type { CityContext } from '../../core/context';
import type { Lot, Feature } from '../../core/plan';
import { OCC } from '../../core/occupancy';
import { DIR_VEC } from '../../core/geom';
import { SIDEWALK_Y, WATER_LEVEL } from '../../core/constants';
import type { Rng } from '../../core/rng';
import { buildCafes, type CafePlace, type Terrace } from './cafes';
import { SEAT_TOP } from './animate';
import { planStalls, marketStalls, type Stall } from './vendors';

export type DoorCat = 'home' | 'shop' | 'office' | 'hotel' | 'industry' | 'civic' | 'school' | 'station' | 'stadium' | 'kiosk' | 'club';

export interface DoorPlace {
  node: number;
  lot: Lot;
  x: number;
  z: number;
  cat: DoorCat;
  name: string;
  district: string;
}

export interface Spot {
  x: number;
  z: number;
  y: number;
  yaw: number;
  /** claiming party id or -1 */
  taken: number;
}

export interface SpotPlace {
  kind: 'view' | 'beach' | 'bus';
  node: number;
  label: string;
  /** attraction / theme used for persona preferences */
  theme: string;
  spots: Spot[];
  /** waypoint-free walking distance cache not needed; centre for distance checks */
  x: number;
  z: number;
}

export interface BenchPlace {
  node: number;
  x: number;
  z: number;
  y: number;
  /** direction the sitter faces */
  yaw: number;
  seats: Spot[];
  district: string;
  sidewalk: boolean;
  /** a seat without a backrest this much higher than a bench (fountain rim), m */
  rim?: number;
}

export interface StopPlace extends SpotPlace {
  stopId: number;
  name: string;
  line: string;
  /** direction buses travel past the stop */
  tx: number;
  tz: number;
  /** point by the bus's front door (on the walk band, curb side) */
  doorX: number;
  doorZ: number;
  /** unit vector from the walk band towards the road */
  rx: number;
  rz: number;
}

export interface Facade {
  /** sidewalk-side face of a shop: a segment + outward normal (towards the street) */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  nx: number;
  nz: number;
}

export interface Places {
  doors: DoorPlace[];
  doorByNode: Map<number, DoorPlace>;
  homes: DoorPlace[];
  benches: BenchPlace[];
  beaches: SpotPlace[];
  views: SpotPlace[];
  /** standing about on plazas: pairs and trios chatting (themes 'pair' / 'trio'), someone on the phone ('lean') */
  hangouts: SpotPlace[];
  /** street vendors' carts (ice cream, orange juice, flowers, pretzels) with customer spots */
  vendors: Stall[];
  stops: StopPlace[];
  stopById: Map<number, StopPlace>;
  stationDoors: DoorPlace[];
  parkNodes: number[];
  riverNodes: number[];
  boardwalkNodes: number[];
  plazaNodes: number[];
  marketNodes: number[];
  facades: Facade[];
  stalls: { x: number; z: number }[];
  /** café tables (terraces, kiosk tables): seats, walkway node, approach paths */
  cafes: CafePlace[];
  /** clusters of café tables with a service point for waiters */
  terraces: Terrace[];
  bridgeEdges: Set<number>;
  districtName(x: number, z: number): string;
  surfaceY(x: number, z: number, fallback: number): number;
  beachY(x: number, z: number): number;
  /** true over a deck that legitimately spans water (pier, footbridges, jetty) */
  onDeck(x: number, z: number): boolean;
  /** exact test against building footprints (shrunk by `margin`) */
  insideBuilding(x: number, z: number, margin?: number): boolean;
  /** street furniture (lamps, trees, bins, signal poles, stop signs…) within r of (x, z) */
  furnitureNear(x: number, z: number, r: number): boolean;
}

const FEATURE_LABEL: Partial<Record<Feature['kind'], [string, string]>> = {
  fountain: ['Admiring the fountain', 'fountain'],
  statue: ['Looking at the statue', 'statue'],
  pondisland: ['Feeding the ducks at the pond', 'pond'],
  gazebo: ['Resting by the gazebo', 'park'],
  bandstand: ['Listening at the bandstand', 'park'],
  carousel: ['Watching the carousel', 'pier'],
  ferriswheel: ['Watching the Ferris wheel', 'pier'],
  playground: ['Watching the kids play', 'park'],
  kiosk: ['Getting a coffee at the Park Café', 'cafe'],
};

export function buildPlaces(ctx: CityContext, rng: Rng): Places {
  const { plan, peds, occupancy: occ } = ctx;
  const nodes = peds.nodes;

  const districtName = (x: number, z: number): string => {
    const d = plan.districtAt(x, z);
    if (d) return d.name;
    for (const r of [7, 12]) {
      for (const [dx, dz] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ]) {
        const e = plan.districtAt(x + dx, z + dz);
        if (e) return e.name;
      }
    }
    return 'Tinyhaven';
  };

  const beachY = (x: number, z: number): number => {
    if (x < 121.2) return 0.3; // boardwalk deck
    return Math.max(plan.heightAt(x, z), WATER_LEVEL) + 0.01;
  };

  const surfaceY = (x: number, z: number, fallback: number): number => {
    const o = occ.get(x, z);
    if (o & OCC.SIDEWALK) return SIDEWALK_Y;
    if (x > 121.2 && x < 146 && z > -6 && z < 110 && !(o & OCC.PATH)) return beachY(x, z);
    return fallback;
  };

  // ── doors
  const catOf = (lot: Lot): DoorCat | null => {
    switch (lot.kind) {
      case 'house':
      case 'apartment':
        return 'home';
      case 'townhouse':
        return lot.shopfront ? 'shop' : 'home';
      case 'kiosk':
        return 'kiosk';
      case 'office':
      case 'tower':
      case 'tvtower':
        return 'office';
      case 'hotel':
        return 'hotel';
      case 'factory':
      case 'warehouse':
      case 'depot':
      case 'harbormaster':
        return 'industry';
      case 'school':
        return 'school';
      case 'church':
      case 'townhall':
        return 'civic';
      case 'station':
        return 'station';
      case 'stadium':
        return 'stadium';
      case 'boathouse':
        return 'club';
      default:
        return null;
    }
  };
  const doors: DoorPlace[] = [];
  const doorByNode = new Map<number, DoorPlace>();
  const seenDoors = new Set<string>();
  const addDoor = (node: number, lot: Lot, x: number, z: number) => {
    const cat = catOf(lot);
    if (!cat) return;
    const key = `${x.toFixed(2)}:${z.toFixed(2)}`;
    if (seenDoors.has(key)) return;
    seenDoors.add(key);
    const d: DoorPlace = { node, lot, x, z, cat, name: lot.name ?? '', district: districtName(x - DIR_VEC[lot.front].x * 3, z - DIR_VEC[lot.front].z * 3) };
    doors.push(d);
    doorByNode.set(node, d);
  };
  for (const id of peds.doorNodes) {
    const n = nodes[id];
    if (n.lot === undefined || !n.door) continue;
    addDoor(id, plan.lots[n.lot], n.door.x, n.door.z);
  }
  // doors that coincide with a walkway vertex (no door edge was created)
  for (const lot of plan.lots) {
    for (const door of lot.doors) {
      const key = `${door.x.toFixed(2)}:${door.z.toFixed(2)}`;
      if (seenDoors.has(key)) continue;
      const id = peds.nearestNode(door.x, door.z, (n) => n.kind === 'path' && n.edges.length === 1);
      if (id >= 0 && Math.hypot(nodes[id].x - door.x, nodes[id].z - door.z) < 0.2) addDoor(id, lot, door.x, door.z);
    }
  }
  const stationDoors = doors.filter((d) => d.cat === 'station');
  const homes = doors.filter((d) => d.cat === 'home');

  // ── benches (3 seats along the bench)
  const benches: BenchPlace[] = [];
  for (const b of peds.benches) {
    const fx = Math.sin(b.bench.yaw),
      fz = Math.cos(b.bench.yaw);
    const sx = fz,
      sz = -fx; // along the bench
    const onSide = occ.has(b.bench.x, b.bench.z, OCC.SIDEWALK);
    const y = onSide ? SIDEWALK_Y : Math.max(0, nodes[b.node].y - 0.03);
    const seats: Spot[] = [];
    for (const k of [-1, 0, 1]) {
      const off = k * 0.58;
      seats.push({ x: b.bench.x + sx * off + fx * 0.06, z: b.bench.z + sz * off + fz * 0.06, y, yaw: b.bench.yaw, taken: -1 });
    }
    benches.push({ node: b.node, x: b.bench.x, z: b.bench.z, y, yaw: b.bench.yaw, seats, district: districtName(b.bench.x, b.bench.z), sidewalk: onSide });
  }

  const freeCell = (x: number, z: number, r: number, flags: number) => !occ.anyInCircle(x, z, r, flags);

  // ── sitting on the rim of a fountain (seat 0.6 m, facing out), in arcs of three between the walkways
  for (const f of plan.features) {
    if (f.kind !== 'fountain' || ctx.debug.params.has('norim')) continue;
    const R = Math.min(Number(f.params?.radius ?? f.radius ?? 5), f.radius || 5);
    const rSpot = R - 0.06 - 0.22 + 0.175; // hips over the outer rim, the spot 0.175 m in front of them
    const n = Math.max(3, Math.round((Math.PI * 2 * R) / 5.2));
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + 0.26;
      const seats: Spot[] = [];
      for (const j of [-1, 0, 1]) {
        const a = a0 + (j * 0.64) / rSpot;
        seats.push({ x: f.x + Math.sin(a) * rSpot, z: f.z + Math.cos(a) * rSpot, y: 0, yaw: a, taken: -1 });
      }
      const sx = f.x + Math.sin(a0) * (R + 1.2),
        sz = f.z + Math.cos(a0) * (R + 1.2);
      const node = peds.nearestNode(sx, sz, (nd) => nd.kind === 'path' && nd.edges.length >= 2 && Math.hypot(nd.x - sx, nd.z - sz) < 6);
      if (node < 0) continue;
      benches.push({ node, x: f.x + Math.sin(a0) * rSpot, z: f.z + Math.cos(a0) * rSpot, y: 0, yaw: a0, seats, district: districtName(f.x, f.z), sidewalk: false, rim: 0.6 - SEAT_TOP });
    }
  }

  // ── beach towel spots around each beach dead end
  const beaches: SpotPlace[] = [];
  const views: SpotPlace[] = [];
  const isDoorNode = (id: number) => doorByNode.has(id);
  for (const id of peds.leisureNodes) {
    const n = nodes[id];
    if (isDoorNode(id)) continue;
    const e = peds.edges[n.edges[0]];
    const other = nodes[peds.other(e.id, id)];
    let fx = n.x - other.x,
      fz = n.z - other.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    if (e.kind === 'beach') {
      const spots: Spot[] = [];
      const cands: { x: number; z: number; score: number }[] = [];
      for (let r = 1.6; r <= 6.6; r += 1.25) {
        const steps = Math.round((2 * Math.PI * r) / 1.4);
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2 + r;
          cands.push({ x: n.x + Math.cos(a) * r, z: n.z + Math.sin(a) * r, score: r + rng.next() * 1.5 });
        }
      }
      cands.sort((p, q) => p.score - q.score);
      for (const c of cands) {
        if (spots.length >= 12) break;
        if (c.x < 122.8 || c.x > 139.2) continue;
        if (!freeCell(c.x, c.z, 1.15, OCC.WATER | OCC.SOLID | OCC.BUILDING | OCC.PATH | OCC.ROAD)) continue;
        if (spots.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 1.45)) continue;
        if (beaches.some((bp) => bp.spots.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 1.45))) continue;
        // head towards land (−X), feet towards the sea
        const yaw = Math.PI / 2 + (rng.next() - 0.5) * 0.7;
        spots.push({ x: c.x, z: c.z, y: beachY(c.x, c.z), yaw, taken: -1 });
      }
      beaches.push({ kind: 'beach', node: id, label: 'Sunbathing on Sunny Beach', theme: 'beach', spots, x: n.x, z: n.z });
      continue;
    }
    // dead-end viewpoint: look onward
    const hw = Math.max(0.3, e.halfWidth - 0.25);
    const sxv = -fz,
      szv = fx;
    const spots: Spot[] = [];
    // a row across the very end, then (if it is wide enough) spots along both railings, so the
    // middle stays free for people walking up to the end and back
    const cand: [number, number][] = [
      [0.35, 0],
      [0.35, -Math.min(0.6, hw)],
      [0.35, Math.min(0.6, hw)],
    ];
    if (hw >= 0.6) for (const back of [1.25, 2.1]) if (e.length > back + 0.6) cand.push([back, -Math.min(0.75, hw)], [back, Math.min(0.75, hw)]);
    for (const [back, lat] of cand) {
      const x = n.x - fx * back + sxv * lat,
        z = n.z - fz * back + szv * lat;
      if (!freeCell(x, z, 0.25, OCC.WATER | OCC.SOLID | OCC.BUILDING | OCC.ROAD) && e.kind !== 'pier' && e.kind !== 'boardwalk') continue;
      // along a railing: look out sideways-ish
      const side = Math.abs(lat) > 0.65 && back > 1 ? Math.sign(lat) : 0;
      const yaw = Math.atan2(fx + sxv * side * 1.2, fz + szv * side * 1.2);
      spots.push({ x, z, y: nodes[id].y, yaw: yaw + (rng.next() - 0.5) * 0.5, taken: -1 });
    }
    let label = 'Enjoying the view';
    let theme = 'view';
    if (e.kind === 'pier') {
      label = 'Looking out to sea from the pier';
      theme = 'pier';
    } else if (e.kind === 'boardwalk') {
      label = 'Watching the waves';
      theme = 'beach';
    } else if (e.kind === 'promenade' || e.kind === 'riverbank') {
      label = 'Enjoying the river view';
      theme = 'river';
    } else if (e.kind === 'park') {
      // near a feature?
      let best: Feature | null = null;
      let bd = 7;
      for (const f of plan.features) {
        const d = Math.hypot(f.x - n.x, f.z - n.z) - f.radius;
        if (d < bd && FEATURE_LABEL[f.kind]) {
          bd = d;
          best = f;
        }
      }
      if (best) {
        label = FEATURE_LABEL[best.kind]![0];
        theme = FEATURE_LABEL[best.kind]![1];
        if (best.kind === 'kiosk') label = `Getting a coffee at the ${String(best.params?.name ?? 'kiosk')}`;
      }
    }
    if (spots.length) views.push({ kind: 'view', node: id, label, theme, spots, x: n.x, z: n.z });
  }

  // ── attraction viewpoints: walkway nodes around fountains, statues, the pond…
  const attractionNodeUsed = new Set<number>(views.map((v) => v.node));
  for (const f of plan.features) {
    const lab = FEATURE_LABEL[f.kind];
    if (!lab) continue;
    if (f.kind === 'kiosk') continue; // handled by its spur
    let cx = f.x,
      cz = f.z,
      rad = f.radius;
    let reach = 4.6;
    if (f.kind === 'pondisland') {
      const pond = plan.water.ponds[0];
      if (pond) {
        cx = pond.cx;
        cz = pond.cz;
        rad = Math.max(pond.rx, pond.rz);
        reach = 5;
      }
    }
    if (f.kind === 'ferriswheel') {
      rad = 4;
      reach = 6;
    }
    if (f.kind === 'playground' && f.rect) {
      rad = Math.max(f.rect.x1 - f.rect.x0, f.rect.z1 - f.rect.z0) / 2;
      reach = 4;
    }
    let count = 0;
    for (const n of nodes) {
      if (n.kind !== 'path' || attractionNodeUsed.has(n.id) || n.edges.length < 2) continue;
      if (n.edges.some((eid) => peds.edges[eid].kind === 'crosswalk' || peds.edges[eid].kind === 'sidewalk')) continue;
      const d = Math.hypot(n.x - cx, n.z - cz);
      let edgeD = d - rad;
      if (f.kind === 'pondisland') {
        const pond = plan.water.ponds[0];
        if (pond) {
          const ex = (n.x - pond.cx) / pond.rx,
            ez = (n.z - pond.cz) / pond.rz;
          edgeD = (Math.hypot(ex, ez) - 1) * Math.min(pond.rx, pond.rz);
        }
      }
      if (edgeD < 0.6 || edgeD > reach) continue;
      let fx = cx - n.x,
        fz = cz - n.z;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl;
      fz /= fl;
      const hw = Math.min(...n.edges.map((eid) => peds.edges[eid].halfWidth));
      const spots: Spot[] = [];
      const push = Math.min(0.4, Math.max(0, hw - 0.35));
      for (const lat of [0, -0.62, 0.62]) {
        const x = n.x + fx * push - fz * lat,
          z = n.z + fz * push + fx * lat;
        if (!freeCell(x, z, 0.25, OCC.WATER | OCC.SOLID | OCC.BUILDING | OCC.ROAD)) continue;
        if (!occ.has(x, z, OCC.PATH)) continue;
        spots.push({ x, z, y: n.y, yaw: Math.atan2(fx, fz) + (rng.next() - 0.5) * 0.3, taken: -1 });
      }
      if (!spots.length) continue;
      attractionNodeUsed.add(n.id);
      views.push({ kind: 'view', node: n.id, label: lab[0], theme: lab[1], spots, x: n.x, z: n.z });
      count++;
    }
    void count;
  }

  /** is (x, z) within r of a door's path (door edge + 1.2 m on into the walkway)? */
  const nearDoorPath = (doorNode: number, x: number, z: number, r: number): boolean => {
    const D = nodes[doorNode];
    for (const eid of D.edges) {
      const e = peds.edges[eid];
      if (e.kind !== 'door') continue;
      const O = nodes[e.a === doorNode ? e.b : e.a];
      const L = Math.hypot(O.x - D.x, O.z - D.z) || 1;
      const dx = (O.x - D.x) / L,
        dz = (O.z - D.z) / L;
      const u = Math.min(L + 1.2, Math.max(0, (x - D.x) * dx + (z - D.z) * dz));
      if (Math.hypot(D.x + dx * u - x, D.z + dz * u - z) < r) return true;
    }
    return false;
  };

  // ── bus stops
  const stops: StopPlace[] = [];
  const stopById = new Map<number, StopPlace>();
  for (const bs of plan.busStops) {
    const id = peds.busStopNodes.get(bs.id);
    if (id === undefined) continue;
    const n = nodes[id];
    const A = plan.roadNodes[bs.from],
      B = plan.roadNodes[bs.to];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const tx = (B.x - A.x) / L,
      tz = (B.z - A.z) / L;
    // towards the road: from the walk band node to the shelter, perpendicular to travel
    let rx = bs.x - n.x,
      rz = bs.z - n.z;
    const along = rx * tx + rz * tz;
    rx -= tx * along;
    rz -= tz * along;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const facing = Math.atan2(rx, rz);
    const spots: Spot[] = [];
    // Waiting spots stay off the walking band so passers-by never have to push through
    // the queue: under the shelter roof (in front of its bench) and beside it in the furniture
    // band. Shelter frame (props/furniture.ts busShelter): local +Z away from the road, open
    // front at z −0.28 (road side), glass back at z 0.78, 3.8 m long, bench along the back,
    // stop pole at x +2.45.
    const slot = plan.slots.find((s) => s.kind === 'busstop' && s.busStop === bs.id);
    const syaw = slot ? slot.yaw : Math.atan2(-rx, -rz);
    const sx = slot ? slot.x : bs.x,
      sz = slot ? slot.z : bs.z;
    const Xx = Math.cos(syaw),
      Xz = -Math.sin(syaw),
      Zx = Math.sin(syaw),
      Zz = Math.cos(syaw);
    // (nobody in the middle of the open side: people inside must be able to walk out)
    const local: [number, number][] = [
      [-1.25, 0.05],
      [-0.4, 0.05],
      [0.45, 0.05],
      [1.3, 0.05],
      [-2.5, 0.2],
      [2.65, 0.2],
      [-3.3, 0.2],
      [3.4, 0.2],
      [-4.1, 0.2],
      [4.2, 0.2],
      [-4.9, 0.2],
      [5.0, 0.2],
    ];
    for (const [lx, lz] of local) {
      const x = sx + Xx * lx + Zx * lz,
        z = sz + Xz * lx + Zz * lz;
      if (!occ.has(x, z, OCC.SIDEWALK) || occ.has(x, z, OCC.ROAD | OCC.SOLID | OCC.BUILDING)) continue;
      // keep clear of the neighbouring street furniture (lamps, trees, bins…)
      if (plan.slots.some((s) => s !== slot && s.kind !== 'empty' && Math.abs(s.x - x) < 0.6 && Math.abs(s.z - z) < 0.6 && Math.hypot(s.x - x, s.z - z) < 0.6)) continue;
      // and of doorways (nobody waits right in front of someone's door), and of the bus door itself
      if (doors.some((d) => Math.abs(d.x - x) < 4 && Math.abs(d.z - z) < 4 && nearDoorPath(d.node, x, z, 1.2))) continue;
      if (Math.hypot(x - (n.x + tx * 3.2 + rx * 0.75), z - (n.z + tz * 3.2 + rz * 0.75)) < 1.1) continue;
      spots.push({ x, z, y: SIDEWALK_Y, yaw: facing + (rng.next() - 0.5) * 0.5, taken: -1 });
    }
    const route = plan.busRoutes[bs.route];
    const sp: StopPlace = {
      kind: 'bus',
      node: id,
      label: `Waiting for ${route?.name ?? 'the bus'} at ${bs.name}`,
      theme: 'bus',
      spots,
      x: n.x,
      z: n.z,
      stopId: bs.id,
      name: bs.name,
      line: route?.name ?? 'the bus',
      tx,
      tz,
      doorX: n.x + tx * 3.2 + rx * 0.75,
      doorZ: n.z + tz * 3.2 + rz * 0.75,
      rx,
      rz,
    };
    stops.push(sp);
    stopById.set(bs.id, sp);
  }

  // ── waypoint sets
  const nodesWith = (kinds: string[]) =>
    nodes
      .filter((n) => n.edges.length >= 2 && n.kind !== 'door' && n.edges.some((eid) => kinds.includes(peds.edges[eid].kind)))
      .map((n) => n.id);
  const parkNodes = nodesWith(['park']);
  const riverNodes = nodesWith(['riverbank', 'promenade', 'bridge']);
  const boardwalkNodes = nodesWith(['boardwalk', 'pier']);
  const marketNodes = nodesWith(['market']);
  const civic = plan.features.find((f) => f.kind === 'fountain');
  const plazaNodes = nodesWith(['plaza']).filter((id) => !civic || Math.hypot(nodes[id].x - civic.x, nodes[id].z - civic.z) < 16);
  const bridgeEdges = new Set(peds.edges.filter((e) => e.kind === 'bridge').map((e) => e.id));

  // ── shop facades (for window shopping) and market stalls
  const facades: Facade[] = [];
  for (const lot of plan.lots) {
    if (!lot.shopfront) continue;
    const f = lot.footprint;
    const v = DIR_VEC[lot.front];
    let x0: number, z0: number, x1: number, z1: number;
    if (lot.front === 'N') [x0, z0, x1, z1] = [f.x0, f.z0, f.x1, f.z0];
    else if (lot.front === 'S') [x0, z0, x1, z1] = [f.x0, f.z1, f.x1, f.z1];
    else if (lot.front === 'E') [x0, z0, x1, z1] = [f.x1, f.z0, f.x1, f.z1];
    else [x0, z0, x1, z1] = [f.x0, f.z0, f.x0, f.z1];
    // only facades right at the sidewalk
    const mx = (x0 + x1) / 2 + v.x * 0.6,
      mz = (z0 + z1) / 2 + v.z * 0.6;
    if (!occ.has(mx, mz, OCC.SIDEWALK)) continue;
    facades.push({ x0, z0, x1, z1, nx: v.x, nz: v.z });
  }
  const stalls = plan.features.filter((f) => f.kind === 'marketstall').map((f) => ({ x: f.x, z: f.z }));

  // decks over water
  const decks: { ax: number; az: number; dx: number; dz: number; len: number; hw: number }[] = [];
  for (const f of plan.features) {
    if (!f.a || !f.b) continue;
    if (f.kind !== 'pier' && f.kind !== 'footbridge' && f.kind !== 'jetty') continue;
    const len = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z);
    if (len < 0.1) continue;
    const w = typeof f.params?.width === 'number' ? (f.params.width as number) : 2.4;
    decks.push({ ax: f.a.x, az: f.a.z, dx: (f.b.x - f.a.x) / len, dz: (f.b.z - f.a.z) / len, len, hw: w / 2 + 0.1 });
  }
  const onDeck = (x: number, z: number): boolean => {
    for (const d of decks) {
      const rx = x - d.ax,
        rz = z - d.az;
      const u = rx * d.dx + rz * d.dz;
      if (u < -0.5 || u > d.len + 0.5) continue;
      if (Math.abs(rx * -d.dz + rz * d.dx) <= d.hw) return true;
    }
    return false;
  };
  // nobody stands over open water (viewpoint spots must be on a deck there; keep 0.3 m off its edge)
  const dry = (x: number, z: number) => {
    for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      if (occ.has(x + ox, z + oz, OCC.WATER) && !onDeck(x + ox, z + oz)) return false;
    }
    return true;
  };
  for (const v of views) v.spots = v.spots.filter((sp) => dry(sp.x, sp.z));
  for (let i = views.length - 1; i >= 0; i--) if (!views[i].spots.length) views.splice(i, 1);
  // benches are sat down on from the front: skip any whose front is over the water (sea-facing pier benches)
  for (let i = benches.length - 1; i >= 0; i--) {
    const b = benches[i];
    const fx = Math.sin(b.yaw),
      fz = Math.cos(b.yaw);
    const stand = b.sidewalk ? 0.3 : 0.55;
    if (b.seats.some((s) => occ.has(s.x + fx * stand, s.z + fz * stand, OCC.WATER) && !onDeck(s.x + fx * stand, s.z + fz * stand))) benches.splice(i, 1);
  }

  // building footprints in a coarse grid for exact containment tests
  const cell = 20;
  const lotGrid = new Map<number, Lot[]>();
  for (const lot of plan.lots) {
    const f = lot.footprint;
    for (let i = Math.floor(f.x0 / cell); i <= Math.floor(f.x1 / cell); i++) {
      for (let j = Math.floor(f.z0 / cell); j <= Math.floor(f.z1 / cell); j++) {
        const k = i * 1000 + j;
        const list = lotGrid.get(k);
        if (list) list.push(lot);
        else lotGrid.set(k, [lot]);
      }
    }
  }
  const insideBuilding = (x: number, z: number, margin = 0.05): boolean => {
    const list = lotGrid.get(Math.floor(x / cell) * 1000 + Math.floor(z / cell));
    if (!list) return false;
    for (const lot of list) {
      const f = lot.footprint;
      if (x > f.x0 + margin && x < f.x1 - margin && z > f.z0 + margin && z < f.z1 - margin) return true;
    }
    return false;
  };

  // street furniture + junction poles in a coarse grid (people waiting at kerbs keep clear of them)
  const fcell = 4;
  const furn = new Map<number, number[]>();
  const addFurn = (x: number, z: number) => {
    const k = Math.floor(x / fcell) * 10000 + Math.floor(z / fcell);
    const list = furn.get(k);
    if (list) list.push(x, z);
    else furn.set(k, [x, z]);
  };
  for (const sl of plan.slots) if (sl.kind !== 'empty' && sl.kind !== 'busstop') addFurn(sl.x, sl.z);
  // bicycles / mopeds / e-scooters parked on the pavement (traffic module): points along each
  const p2w = (ctx.services.traffic as { parked2w?: { x: number; z: number; yaw: number; len: number }[] } | undefined)?.parked2w ?? [];
  for (const b of p2w) {
    const fx = Math.sin(b.yaw),
      fz = Math.cos(b.yaw);
    for (const k of [-0.35, 0, 0.35]) addFurn(b.x + fx * b.len * k, b.z + fz * b.len * k);
  }
  for (const I of ctx.roads.intersections) {
    for (const hd of I.signals) addFurn(hd.x, hd.z);
    for (const hd of I.stopSigns) addFurn(hd.x, hd.z);
  }
  const furnitureNear = (x: number, z: number, r: number): boolean => {
    const i0 = Math.floor((x - r) / fcell),
      i1 = Math.floor((x + r) / fcell);
    const j0 = Math.floor((z - r) / fcell),
      j1 = Math.floor((z + r) / fcell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = furn.get(i * 10000 + j);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) if (Math.hypot(list[k] - x, list[k + 1] - z) < r) return true;
      }
    }
    return false;
  };

  const { cafes, terraces } = ctx.debug.params.has('nocafe') ? { cafes: [], terraces: [] } : buildCafes(ctx, districtName);
  const vendors = ctx.debug.params.has('novendors') ? [] : [...planStalls(ctx, rng, []), ...marketStalls(ctx)];
  const hangouts = ctx.debug.params.has('nohang') ? [] : buildHangouts(ctx, rng, districtName, vendors);

  return {
    doors,
    doorByNode,
    homes,
    benches,
    beaches,
    views,
    hangouts,
    vendors,
    stops,
    stopById,
    stationDoors,
    parkNodes,
    riverNodes,
    boardwalkNodes,
    plazaNodes,
    marketNodes,
    facades,
    stalls,
    cafes,
    terraces,
    bridgeEdges,
    districtName,
    surfaceY,
    beachY,
    onDeck,
    insideBuilding,
    furnitureNear,
  };
}

/**
 * Places to stand about on the plazas, a few metres off the walkways (so passers-by never meet them):
 * a pair facing each other, a trio in a little circle, a single spot where somebody talks on the phone.
 * Each is reached by a straight walk from a walkway node with a clear line of sight.
 */
function buildHangouts(ctx: CityContext, rng: Rng, districtName: (x: number, z: number) => string, stalls: Stall[]): SpotPlace[] {
  const { plan, peds, occupancy: occ } = ctx;
  const out: SpotPlace[] = [];
  const keep: { x: number; z: number; r: number }[] = ((ctx.services.props as { discs?: { x: number; z: number; r: number }[] } | undefined)?.discs ?? []).slice();
  for (const t of (ctx.services.vegetation as { trees?: { x: number; z: number }[] } | undefined)?.trees ?? []) keep.push({ x: t.x, z: t.z, r: 0.6 });
  for (const f of plan.features) if (f.radius > 0) keep.push({ x: f.x, z: f.z, r: f.radius });
  for (const st of stalls) keep.push({ x: st.x + Math.sin(st.yaw) * 0.6, z: st.z + Math.cos(st.yaw) * 0.6, r: 2.0 });
  const segD = (ax: number, az: number, bx: number, bz: number, px: number, pz: number): number => {
    const dx = bx - ax,
      dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  };
  const hard = OCC.BUILDING | OCC.SOLID | OCC.ROAD | OCC.WATER | OCC.RAIL;
  for (const a of plan.areas) {
    if (a.kind !== 'plaza' && a.kind !== 'market') continue;
    const r = a.rect;
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    const maxN = Math.min(8, Math.max(1, Math.round(area / 75)));
    const edges = peds.edges.filter((e) => {
      const A = peds.nodes[e.a],
        B = peds.nodes[e.b];
      return Math.max(A.x, B.x) > r.x0 - 8 && Math.min(A.x, B.x) < r.x1 + 8 && Math.max(A.z, B.z) > r.z0 - 8 && Math.min(A.z, B.z) < r.z1 + 8;
    });
    const lKeep = keep.filter((d) => d.x > r.x0 - 4 - d.r && d.x < r.x1 + 4 + d.r && d.z > r.z0 - 4 - d.r && d.z < r.z1 + 4 + d.r);
    const cands: { x: number; z: number; band: number; key: number }[] = [];
    for (let z = r.z0 + 1.2; z < r.z1 - 1.2; z += 1) {
      for (let x = r.x0 + 1.2; x < r.x1 - 1.2; x += 1) {
        if (occ.anyInCircle(x, z, 1.0, hard)) continue;
        let band = Infinity;
        for (const e of edges) {
          const A = peds.nodes[e.a],
            B = peds.nodes[e.b];
          band = Math.min(band, segD(A.x, A.z, B.x, B.z, x, z) - e.halfWidth);
        }
        // close enough to the walkers to read as street life, never in their way
        if (band < 1.0 || band > 7) continue;
        if (lKeep.some((d) => Math.hypot(d.x - x, d.z - z) < d.r + 1.05)) continue;
        cands.push({ x, z, band, key: band + rng.next() * 3 });
      }
    }
    cands.sort((p, q) => p.key - q.key);
    let n = 0;
    for (const c of cands) {
      if (n >= maxN) break;
      if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 4.6)) continue;
      // a walkway node with a clear straight walk to it
      let best = -1,
        bd = 10;
      for (const nd of peds.nodes) {
        if (nd.kind === 'door' || Math.abs(nd.x - c.x) > bd || Math.abs(nd.z - c.z) > bd) continue;
        if (nd.edges.some((eid) => peds.edges[eid].kind === 'crosswalk' || peds.edges[eid].kind === 'door')) continue;
        const d = Math.hypot(nd.x - c.x, nd.z - c.z);
        if (d >= bd) continue;
        let clear = true;
        for (let t = 0.1; t < 1 && clear; t += 0.5 / d) {
          const x = nd.x + (c.x - nd.x) * t,
            z = nd.z + (c.z - nd.z) * t;
          if (occ.has(x, z, hard)) clear = false;
          else if (lKeep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 0.3)) clear = false;
        }
        if (clear) {
          bd = d;
          best = nd.id;
        }
      }
      if (best < 0) continue;
      const r0 = rng.next();
      const theme = r0 < 0.42 ? 'pair' : r0 < 0.72 ? 'trio' : 'lean';
      const a0 = rng.range(0, Math.PI * 2);
      const spots: Spot[] = [];
      const y = 0;
      if (theme === 'pair') {
        for (const k of [0, 1]) {
          const ang = a0 + k * Math.PI;
          spots.push({ x: c.x + Math.sin(ang) * 0.43, z: c.z + Math.cos(ang) * 0.43, y, yaw: ang + Math.PI + rng.range(-0.25, 0.25), taken: -1 });
        }
      } else if (theme === 'trio') {
        for (const k of [0, 1, 2]) {
          const ang = a0 + (k * Math.PI * 2) / 3 + rng.range(-0.2, 0.2);
          spots.push({ x: c.x + Math.sin(ang) * 0.5, z: c.z + Math.cos(ang) * 0.5, y, yaw: ang + Math.PI + rng.range(-0.15, 0.15), taken: -1 });
        }
      } else spots.push({ x: c.x, z: c.z, y, yaw: a0, taken: -1 });
      const label = theme === 'lean' ? 'On the phone' : theme === 'pair' ? 'Chatting on the square' : 'Catching up with friends';
      out.push({ kind: 'view', node: best, label, theme, spots, x: c.x, z: c.z });
      void districtName;
      n++;
    }
  }
  return out;
}