// Hardscape scatter planner (audit item 7): deterministic placement of the things that make a
// paved area read as used — café terraces with parasols outside ground-floor shops, planters, bike
// racks by the doors, info boards, a coffee kiosk and public art on the plazas; bike parking, a
// clock post, planters and vending machines at the station; pallets, drums, skips, forklifts,
// IBC tanks, cable reels, gas cages and dumpsters along the walls of the industrial yards; fish
// boxes, nets, pots and rope coils on the quay ends; ticket machines, EV chargers and bottle banks
// on the car parks; wheelie bins, bikes and a table in the old-town courtyards; a ping-pong table
// in the schoolyard; sleeper stacks and ballast heaps in the freight yard.
//
// Each zone gets a 0.25 m free-cell grid that starts blocked wherever something must stay clear:
// buildings (+ margin), occupancy (roads, sidewalks, paths, water, rail, solid features), the
// pedestrian corridors (door walks, plaza walks — dilated), loading zones in front of yard doors,
// parking stalls, lamps, benches, street-furniture discs and tree trunks / low canopies. Items are
// packed into what is left; every item also blocks its own footprint + clearance.
// Three-free (runs once at start-up in the props module, after vegetation planted its trees).

import type { Area, CityPlan, Lot } from '../../core/plan';
import { OCC, type OccupancyGrid } from '../../core/occupancy';
import type { Rect } from '../../core/geom';
import { hashString } from '../../core/rng';
import { FreeGrid } from './gardenPlan';

export type ScatterKind =
  | 'cafe'
  | 'kiosk'
  | 'planter'
  | 'planterRound'
  | 'bikeRack'
  | 'infoBoard'
  | 'sculpture'
  | 'clock'
  | 'vending'
  | 'trolleys'
  | 'pallets'
  | 'palletGoods'
  | 'drums'
  | 'skip'
  | 'forklift'
  | 'crates'
  | 'cableReel'
  | 'gasCage'
  | 'ibc'
  | 'dumpster'
  | 'fishBoxes'
  | 'nets'
  | 'pots'
  | 'rope'
  | 'ticketMachine'
  | 'evCharger'
  | 'bottleBank'
  | 'pingpong'
  | 'bins'
  | 'sleepers'
  | 'heap'
  | 'courtTable'
  | 'bikes';

export interface ScatterItem {
  kind: ScatterKind;
  x: number;
  z: number;
  /** model yaw: local +Z faces (sin yaw, cos yaw) */
  yaw: number;
  /** footprint along local x / z */
  w: number;
  d: number;
  seed: number;
}

export interface ScatterInputs {
  plan: CityPlan;
  occ: OccupancyGrid;
  walkAt(x: number, z: number): boolean;
  trees: { x: number; z: number; r: number; h: number }[];
  /** keep-clear discs (lamps, benches, slot furniture, garden items) */
  discs: { x: number; z: number; r: number }[];
}

/** footprint (w along local x, d along local z) and "tall" flag (keeps out of tree canopies) */
const SIZE: Record<ScatterKind, [number, number, boolean]> = {
  cafe: [1.9, 1.9, true],
  kiosk: [2.8, 2.2, true],
  planter: [1.4, 1.4, false],
  planterRound: [1.3, 1.3, false],
  bikeRack: [2.8, 1.7, false],
  infoBoard: [1.5, 0.5, false],
  sculpture: [2.6, 2.6, true],
  clock: [0.7, 0.7, true],
  vending: [1.0, 0.8, false],
  trolleys: [2.6, 0.9, false],
  pallets: [1.25, 1.05, false],
  palletGoods: [1.25, 1.05, false],
  drums: [1.5, 1.5, false],
  skip: [3.8, 1.9, false],
  forklift: [2.7, 1.3, true],
  crates: [1.7, 1.3, false],
  cableReel: [1.5, 1.1, false],
  gasCage: [1.5, 0.95, false],
  ibc: [2.5, 1.25, false],
  dumpster: [2.1, 1.2, false],
  fishBoxes: [1.7, 1.3, false],
  nets: [2.3, 1.7, false],
  pots: [1.7, 1.1, false],
  rope: [1.1, 1.1, false],
  ticketMachine: [0.75, 0.55, false],
  evCharger: [0.6, 0.45, false],
  bottleBank: [4.4, 1.6, false],
  pingpong: [2.8, 1.6, false],
  bins: [2.2, 0.85, false],
  sleepers: [2.7, 1.5, false],
  heap: [3.2, 3.0, false],
  courtTable: [1.9, 1.9, false],
  bikes: [1.9, 0.7, false],
};

export function scatterSize(kind: ScatterKind): [number, number] {
  return [SIZE[kind][0], SIZE[kind][1]];
}

interface Zone {
  grid: FreeGrid;
  rect: Rect;
}

export function planScatter(inp: ScatterInputs): ScatterItem[] {
  const { plan, occ } = inp;
  const out: ScatterItem[] = [];
  let hs = hashString('scatter:tinyhaven');
  const rnd = () => {
    hs = (hs + 0x6d2b79f5) >>> 0;
    let t = hs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** zone grid over r with the common blocking */
  const zone = (r: Rect, opts: { paved: boolean; edge?: number; walkPad?: number; buildPad?: number; skipAreas?: Area[]; doorZone?: number }): Zone => {
    const g = new FreeGrid(r);
    const e = opts.edge ?? 0;
    if (e > 0) {
      g.block(r.x0 - 1, r.z0 - 1, r.x0 + e, r.z1 + 1);
      g.block(r.x1 - e, r.z0 - 1, r.x1 + 1, r.z1 + 1);
      g.block(r.x0 - 1, r.z0 - 1, r.x1 + 1, r.z0 + e);
      g.block(r.x0 - 1, r.z1 - e, r.x1 + 1, r.z1 + 1);
    }
    const hard = OCC.BUILDING | OCC.SOLID | OCC.ROAD | OCC.SIDEWALK | OCC.WATER | OCC.RAIL | OCC.PATH | (opts.paved ? 0 : OCC.PAVED);
    const wp = opts.walkPad ?? 0.5;
    const bp = opts.buildPad ?? 0.4;
    g.blockIf((x, z) => {
      if (occ.has(x, z, hard)) return true;
      if (occ.has(x + bp, z, OCC.BUILDING) || occ.has(x - bp, z, OCC.BUILDING) || occ.has(x, z + bp, OCC.BUILDING) || occ.has(x, z - bp, OCC.BUILDING)) return true;
      if (inp.walkAt(x, z) || inp.walkAt(x + wp, z) || inp.walkAt(x - wp, z) || inp.walkAt(x, z + wp) || inp.walkAt(x, z - wp)) return true;
      return false;
    });
    for (const a of opts.skipAreas ?? []) g.block(a.rect.x0, a.rect.z0, a.rect.x1, a.rect.z1);
    // parking stalls (parked cars) + door / loading zones
    for (const a of plan.areas) {
      if (!a.stalls || a.rect.x1 < r.x0 || a.rect.x0 > r.x1 || a.rect.z1 < r.z0 || a.rect.z0 > r.z1) continue;
      for (const s of a.stalls) {
        const along = Math.abs(Math.sin(s.yaw)) > 0.5; // car length along x
        const hw = along ? 2.7 : 1.45,
          hd = along ? 1.45 : 2.7;
        g.block(s.x - hw, s.z - hd, s.x + hw, s.z + hd);
      }
    }
    if (opts.doorZone) {
      const dz = opts.doorZone;
      for (const lot of plan.lots) {
        for (const d of lot.doors) {
          if (d.x < r.x0 - dz || d.x > r.x1 + dz || d.z < r.z0 - dz || d.z > r.z1 + dz) continue;
          const nx = d.dir === 'E' ? 1 : d.dir === 'W' ? -1 : 0,
            nz = d.dir === 'S' ? 1 : d.dir === 'N' ? -1 : 0;
          const cx = d.x + nx * dz * 0.5,
            cz = d.z + nz * dz * 0.5;
          const hx = nx ? dz * 0.5 : dz * 0.42,
            hz = nz ? dz * 0.5 : dz * 0.42;
          g.block(cx - hx, cz - hz, cx + hx, cz + hz);
        }
      }
    }
    for (const c of inp.discs) {
      if (c.x < r.x0 - 3 || c.x > r.x1 + 3 || c.z < r.z0 - 3 || c.z > r.z1 + 3) continue;
      g.block(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r);
    }
    for (const t of inp.trees) {
      if (t.x < r.x0 - 4 || t.x > r.x1 + 4 || t.z < r.z0 - 4 || t.z > r.z1 + 4) continue;
      g.block(t.x - 0.75, t.z - 0.75, t.x + 0.75, t.z + 0.75);
    }
    return { grid: g, rect: r };
  };

  /** AABB of a rotated footprint (yaw multiple of 90° → exact) */
  const aabb = (x: number, z: number, yaw: number, w: number, d: number, clear: number): Rect => {
    const c = Math.abs(Math.cos(yaw)),
      s = Math.abs(Math.sin(yaw));
    const hx = (w * c + d * s) / 2 + clear,
      hz = (w * s + d * c) / 2 + clear;
    return { x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz };
  };
  const treeOk = (x: number, z: number, rad: number, tall: boolean) => {
    for (const t of inp.trees) {
      const dx = t.x - x,
        dz = t.z - z;
      const lim = tall ? t.r * 0.85 + rad : 0.75 + rad * 0.6;
      if (dx * dx + dz * dz < lim * lim) return false;
    }
    return true;
  };
  /** try to place; returns the item or null */
  const put = (Z: Zone, kind: ScatterKind, x: number, z: number, yaw: number, clear = 0.2): ScatterItem | null => {
    const [w, d, tall] = SIZE[kind];
    const b = aabb(x, z, yaw, w, d, clear);
    if (!Z.grid.free(b.x0, b.z0, b.x1, b.z1)) return null;
    if (!treeOk(x, z, Math.max(w, d) * 0.5, tall)) return null;
    const bb = aabb(x, z, yaw, w, d, clear);
    Z.grid.block(bb.x0, bb.z0, bb.x1, bb.z1);
    const it: ScatterItem = { kind, x, z, yaw, w, d, seed: Math.floor(rnd() * 1e9) };
    out.push(it);
    return it;
  };
  /** scan a list of candidate centres (first fit) */
  const putAny = (Z: Zone, kind: ScatterKind, cands: [number, number, number][], clear = 0.2): ScatterItem | null => {
    for (const [x, z, yaw] of cands) {
      const it = put(Z, kind, x, z, yaw, clear);
      if (it) return it;
    }
    return null;
  };
  /** candidate centres on a regular raster over the zone, ordered by a key (nearest first) */
  const raster = (Z: Zone, step: number, key: (x: number, z: number) => number, yaw: (x: number, z: number) => number = () => 0): [number, number, number][] => {
    const r = Z.rect;
    const c: [number, number, number, number][] = [];
    for (let z = r.z0 + step / 2; z < r.z1; z += step) for (let x = r.x0 + step / 2; x < r.x1; x += step) c.push([x, z, yaw(x, z), key(x, z)]);
    c.sort((a, b) => a[3] - b[3]);
    return c.map(([x, z, y]) => [x, z, y]);
  };

  // facade segments of a lot facing into a rect: [ax, az, bx, bz, outward nx, nz]
  const facades = (lot: Lot, r: Rect, reach: number): [number, number, number, number, number, number][] => {
    const f = lot.footprint;
    const res: [number, number, number, number, number, number][] = [];
    const ox0 = Math.max(f.x0, r.x0),
      ox1 = Math.min(f.x1, r.x1),
      oz0 = Math.max(f.z0, r.z0),
      oz1 = Math.min(f.z1, r.z1);
    if (ox1 - ox0 > 2 && f.z1 >= r.z0 - 3.6 && f.z1 <= r.z1 - reach) res.push([ox0, f.z1, ox1, f.z1, 0, 1]);
    if (ox1 - ox0 > 2 && f.z0 <= r.z1 + 3.6 && f.z0 >= r.z0 + reach) res.push([ox0, f.z0, ox1, f.z0, 0, -1]);
    if (oz1 - oz0 > 2 && f.x1 >= r.x0 - 3.6 && f.x1 <= r.x1 - reach) res.push([f.x1, oz0, f.x1, oz1, 1, 0]);
    if (oz1 - oz0 > 2 && f.x0 <= r.x1 + 3.6 && f.x0 >= r.x0 + reach) res.push([f.x0, oz0, f.x0, oz1, -1, 0]);
    return res;
  };
  const yawOf = (nx: number, nz: number) => Math.atan2(nx, nz);
  const lotsIn = (blockId: number) => plan.lots.filter((l) => l.blockId === blockId);

  // ───────────────────────────────────────────────────────── plazas ──
  const plazaZones: { a: Area; Z: Zone }[] = [];
  for (const a of plan.areas) {
    if (a.kind !== 'plaza') continue;
    const blk = plan.blocks[a.blockId];
    if (!blk || blk.kind === 'station') continue;
    plazaZones.push({ a, Z: zone(a.rect, { paved: false, edge: 0.4, walkPad: 0.6, doorZone: 2.5 }) });
  }
  for (const { a, Z } of plazaZones) {
    const r = a.rect;
    const blk = plan.blocks[a.blockId];
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    // café terraces outside ground-floor shops / towers facing the plaza
    for (const lot of lotsIn(a.blockId)) {
      const cafeLot = lot.shopfront || lot.kind === 'hotel' || (lot.kind === 'tower' && rnd() < 0.6) || (lot.kind === 'office' && rnd() < 0.4) || lot.kind === 'townhall';
      if (!cafeLot) continue;
      for (const [ax, az, bx, bz, nx, nz] of facades(lot, r, 3.2)) {
        const L = Math.hypot(bx - ax, bz - az);
        const tx = (bx - ax) / L,
          tz = (bz - az) / L;
        const rows = rnd() < 0.55 ? 2 : 1;
        // gap between the facade and the plaza edge (block paving in between)
        const gap = nz > 0 ? r.z0 - az : nz < 0 ? az - r.z1 : nx > 0 ? r.x0 - ax : ax - r.x1;
        for (let row = 0; row < rows; row++) {
          const off = Math.max(2.15, gap + 1.45) + row * 2.6;
          const n = Math.floor((L - 1.6) / 2.75);
          const s0 = (L - (n - 1) * 2.75) / 2;
          for (let k = 0; k < n; k++) {
            const s = s0 + k * 2.75 + (row % 2) * 1.37;
            if (s > L - 1.0) continue;
            put(Z, 'cafe', ax + tx * s + nx * off, az + tz * s + nz * off, yawOf(nx, nz) + (rnd() - 0.5) * 0.3, 0.3);
          }
        }
      }
    }
    // planters along the plaza edges (between the sidewalk and the plaza), every ~7 m
    const edgeSlots: [number, number, number][] = [];
    const inset = 1.65;
    for (let x = r.x0 + 2.5; x < r.x1 - 2; x += 6.8) {
      edgeSlots.push([x, r.z0 + inset, 0], [x, r.z1 - inset, 0]);
    }
    for (let z = r.z0 + 2.5; z < r.z1 - 2; z += 6.8) {
      edgeSlots.push([r.x0 + inset, z, 0], [r.x1 - inset, z, 0]);
    }
    const roundP = blk?.kind === 'civic' || rnd() < 0.4;
    let planters = 0;
    for (const [x, z] of edgeSlots) {
      if (planters > Math.max(2, area / 90)) break;
      if (put(Z, roundP ? 'planterRound' : 'planter', x, z, 0, 0.35)) planters++;
    }
    // coffee kiosk with tables in a roomy open spot; public art in the downtown plazas
    const centreKey = (x: number, z: number) => (x - (r.x0 + r.x1) / 2) ** 2 + (z - (r.z0 + r.z1) / 2) ** 2;
    if (area > 380 && blk?.kind !== 'civic') {
      const k = putAny(Z, 'kiosk', raster(Z, 0.75, centreKey, () => (rnd() < 0.5 ? 0 : Math.PI / 2)), 0.6);
      if (k) {
        const fx = Math.sin(k.yaw),
          fz = Math.cos(k.yaw);
        for (const [lat, fwd] of [
          [-2.4, 3.0],
          [0.3, 3.4],
          [2.9, 2.8],
          [-3.6, 0.4],
        ])
          put(Z, 'cafe', k.x + fx * fwd + fz * lat, k.z + fz * fwd - fx * lat, k.yaw + (rnd() - 0.5) * 0.6, 0.3);
      }
    }
    if (area > 300 && (blk?.kind === 'downtown' || blk?.kind === 'midtown')) putAny(Z, 'sculpture', raster(Z, 1.0, (x, z) => centreKey(x, z) + rnd() * 30), 0.8);
    // info board next to a walk line, bike racks near the doors
    if (area > 200) putAny(Z, 'infoBoard', raster(Z, 0.5, (x, z) => (inp.walkAt(x, z + 1.0) || inp.walkAt(x, z - 1.0) ? 0 : 100) + centreKey(x, z) * 0.01), 0.3);
    for (const lot of lotsIn(a.blockId)) {
      for (const d of lot.doors) {
        if (d.x < r.x0 - 1 || d.x > r.x1 + 1 || d.z < r.z0 - 1 || d.z > r.z1 + 1) continue;
        if (rnd() < 0.35) continue;
        const nx = d.dir === 'E' ? 1 : d.dir === 'W' ? -1 : 0,
          nz = d.dir === 'S' ? 1 : d.dir === 'N' ? -1 : 0;
        const cands: [number, number, number][] = [];
        for (const lat of [4.2, -4.2, 6.5, -6.5])
          for (const fwd of [1.6, 2.4]) cands.push([d.x + nx * fwd - nz * lat, d.z + nz * fwd + nx * lat, Math.atan2(nz, -nx) + Math.PI / 2]);
        putAny(Z, 'bikeRack', cands, 0.25);
      }
    }
  }

  // ───────────────────────────────────────────────────────── station ──
  {
    const st = plan.lots.find((l) => l.kind === 'station');
    const blk = st ? plan.blocks[st.blockId] : undefined;
    if (st && blk) {
      const plazas = plan.areas.filter((a) => a.kind === 'plaza' && a.blockId === blk.id);
      const kiosk = plan.lots.find((l) => l.kind === 'kiosk' && l.blockId === blk.id);
      for (const a of plazas) {
        const r = a.rect;
        const Z = zone(r, { paved: false, edge: 0.4, walkPad: 0.6, doorZone: 2.5 });
        const east = r.x0 > st.footprint.x1 - 1;
        if (east) {
          // clock post at the corner nearest the entrance, then rows of bike parking
          put(Z, 'clock', r.x0 + 2.2, r.z1 - 2.2, 0, 0.3);
          // back-to-back rack pairs with an aisle between them
          for (const dz of [2.0, 4.0, 8.6, 10.6])
            for (let x = r.x0 + 4.4; x < r.x1 - 2.0; x += 3.0) put(Z, 'bikeRack', x, r.z0 + dz, dz === 2.0 || dz === 8.6 ? Math.PI : 0, 0.0);
          for (let x = r.x0 + 2.0; x < r.x1 - 1; x += 3.4) put(Z, 'planter', x, r.z1 - 1.3, 0, 0.3);
        } else {
          // café seating around the kiosk, planters, a taxi-rank style info pillar
          if (kiosk) {
            const k = kiosk.footprint;
            for (const [x, z] of [
              [k.x0 - 2.4, k.z0 + 1.2],
              [k.x0 - 2.4, k.z0 + 4.0],
              [k.x1 + 2.4, k.z0 + 1.2],
              [k.x1 + 2.4, k.z0 + 4.0],
              [k.x0 - 5.2, k.z0 + 2.6],
              [k.x1 + 5.2, k.z0 + 2.6],
            ])
              put(Z, 'cafe', x, z, rnd() * 0.6, 0.3);
          }
          for (let x = r.x0 + 2.2; x < r.x1 - 1.5; x += 3.6) put(Z, 'planterRound', x, r.z0 + 1.6, 0, 0.3);
          putAny(Z, 'infoBoard', raster(Z, 0.5, (x, z) => Math.abs(z - (r.z1 - 2.0)) + Math.abs(x - (r.x1 - 2.5))), 0.3);
          putAny(Z, 'vending', raster(Z, 0.5, (x, z) => Math.abs(z - (r.z0 + 1.0)) + Math.abs(x - (r.x1 - 1.0)), () => Math.PI / 2), 0.2);
        }
      }
      // concourse between the station's back wall and the platform: planters, bike racks, vending, trolleys
      const plat = plan.areas.find((a) => a.kind === 'platform' && a.blockId === blk.id);
      if (plat) {
        const r: Rect = { x0: plat.rect.x0, z0: plat.rect.z0, x1: plat.rect.x1, z1: plat.rect.z1 };
        const Z = zone(r, { paved: true, edge: 0, walkPad: 0.5 });
        // items line the lot edge behind the station; the strip along the platform wall, the stairs and both ramps stay clear
        Z.grid.block(r.x0 - 1, r.z0 - 1, r.x1 + 1, r.z1 - 3.4);
        Z.grid.block(-6, r.z0 - 1, 6, r.z1 + 1);
        Z.grid.block(r.x0 - 1, r.z0 - 1, r.x0 + 7, r.z1 + 1);
        Z.grid.block(r.x1 - 7, r.z0 - 1, r.x1 + 1, r.z1 + 1);
        const zRow = r.z1 - 1.15;
        const seq: ScatterKind[] = ['planter', 'bikeRack', 'bikeRack', 'planter', 'vending', 'trolleys', 'planter', 'bikeRack', 'planter'];
        let k = 0;
        for (const sgn of [-1, 1]) {
          let x = sgn * 8.0;
          while (Math.abs(x) < r.x1 - 8) {
            const kind = seq[k++ % seq.length];
            const [w] = SIZE[kind];
            const cx = x + (sgn * w) / 2;
            put(Z, kind, cx, kind === 'bikeRack' ? zRow - 0.2 : zRow + 0.25, Math.PI, 0.1);
            x += sgn * (w + 0.9);
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────── industrial yards ──
  const YARD_MIX: [ScatterKind, number][] = [
    ['pallets', 4],
    ['palletGoods', 3],
    ['drums', 3],
    ['crates', 2],
    ['ibc', 2],
    ['cableReel', 1.2],
    ['gasCage', 1],
    ['dumpster', 1],
  ];
  const weighted = (mix: [ScatterKind, number][]): ScatterKind => {
    const tot = mix.reduce((s, m) => s + m[1], 0);
    let u = rnd() * tot;
    for (const [k, w] of mix) if ((u -= w) <= 0) return k;
    return mix[0][0];
  };
  for (const a of plan.areas) {
    if (a.kind !== 'yard') continue;
    const r = a.rect;
    const Z = zone(r, { paved: false, edge: 1.0, walkPad: 0.6, doorZone: 6.5 });
    const lots = plan.lots.filter((l) => l.footprint.x0 < r.x1 && l.footprint.x1 > r.x0 && l.footprint.z0 < r.z1 && l.footprint.z1 > r.z0);
    // wall points with their outward normal (items stand with their back to the wall)
    const wallPts = (): [number, number, number, number][] => {
      const c: [number, number, number, number][] = [];
      for (const lot of lots) {
        const f = lot.footprint;
        for (let x = f.x0 + 1; x < f.x1 - 1; x += 0.75) c.push([x, f.z0, 0, -1], [x, f.z1, 0, 1]);
        for (let z = f.z0 + 1; z < f.z1 - 1; z += 0.75) c.push([f.x0, z, -1, 0], [f.x1, z, 1, 0]);
      }
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c;
    };
    /** centre of an item of `kind` standing against the wall at (wx, wz) facing (nx, nz) */
    const atWall = (kind: ScatterKind, wx: number, wz: number, nx: number, nz: number, clear: number): [number, number, number] => {
      const off = 0.5 + SIZE[kind][1] / 2 + clear;
      return [wx + nx * off, wz + nz * off, yawOf(nx, nz)];
    };
    const pts = wallPts();
    for (const [wx, wz, nx, nz] of pts) if (put(Z, 'skip', ...atWall('skip', wx, wz, nx, nz, 0.4), 0.4)) break;
    if (rnd() < 0.85) {
      // forklift parked near a loading door, at right angles to the wall
      const doors = lots.flatMap((l) => l.doors);
      const c: [number, number, number][] = [];
      for (const d of doors) {
        const nx = d.dir === 'E' ? 1 : d.dir === 'W' ? -1 : 0,
          nz = d.dir === 'S' ? 1 : d.dir === 'N' ? -1 : 0;
        for (const lat of [4.8, -4.8, 6.2, -6.2, 8.0, -8.0]) c.push([d.x + nx * 2.0 - nz * lat, d.z + nz * 2.0 + nx * lat, Math.atan2(nx, nz) + Math.PI / 2]);
      }
      putAny(Z, 'forklift', c, 0.3);
    }
    // clusters along the walls
    let placed = 0;
    const target = Math.round(((r.x1 - r.x0) * (r.z1 - r.z0)) / 70);
    for (const [wx, wz, nx, nz] of pts) {
      if (placed >= target) break;
      const kind = weighted(YARD_MIX);
      const [x, z, yaw] = atWall(kind, wx, wz, nx, nz, 0.15);
      const it = put(Z, kind, x, z, yaw, 0.15);
      if (!it) continue;
      placed++;
      // grow the cluster along the wall
      const tx = -nz,
        tz = nx;
      let s = SIZE[kind][0] / 2;
      for (let k = 1; k <= 2 + Math.floor(rnd() * 3); k++) {
        const kind2 = rnd() < 0.6 ? kind : weighted(YARD_MIX);
        s += SIZE[kind2][0] / 2 + 0.3;
        const [x2, z2, y2] = atWall(kind2, wx + tx * s, wz + tz * s, nx, nz, 0.15);
        if (put(Z, kind2, x2, z2, y2, 0.1)) placed++;
        else break;
        s += SIZE[kind2][0] / 2;
      }
    }
    // a few loose stacks in the open yard (away from the loading zones)
    const open = raster(Z, 1.0, () => rnd(), () => (rnd() < 0.5 ? 0 : Math.PI / 2));
    let loose = 0;
    for (const [x, z, y] of open) {
      if (loose >= 3) break;
      if (put(Z, rnd() < 0.5 ? 'pallets' : 'palletGoods', x, z, y, 1.2)) loose++;
    }
  }
  // freight yard: sleeper stacks and ballast heaps along its edges
  for (const a of plan.areas) {
    if (a.kind !== 'freightyard') continue;
    const Z = zone(a.rect, { paved: true, edge: 1.2, walkPad: 0.6, doorZone: 4 });
    const r = a.rect;
    const c = raster(Z, 1.0, (x, z) => Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z) + rnd() * 3, () => (rnd() < 0.5 ? 0 : Math.PI / 2));
    let n = 0;
    for (const [x, z, y] of c) {
      if (n > 7) break;
      if (put(Z, rnd() < 0.65 ? 'sleepers' : 'heap', x, z, y, 0.6)) n++;
    }
  }

  // ───────────────────────────────────────────────────────── quay ──
  for (const a of plan.areas) {
    if (a.kind !== 'quay') continue;
    const r = a.rect;
    const Z = zone(r, { paved: true, edge: 0.6, walkPad: 0.6, doorZone: 3 });
    // crane rails + seaward edge stay clear; only the two ends of the quay take fishing gear
    Z.grid.block(126.6, r.z0 - 1, r.x1 + 1, r.z1 + 1);
    Z.grid.block(r.x0 - 1, -119, r.x1 + 1, -23);
    const MIX: [ScatterKind, number][] = [
      ['fishBoxes', 4],
      ['nets', 2],
      ['pots', 2],
      ['rope', 1.5],
      ['crates', 1.5],
      ['pallets', 1],
    ];
    const c = raster(Z, 0.75, () => rnd(), () => (rnd() < 0.5 ? 0 : Math.PI / 2));
    let n = 0;
    for (const [x, z, y] of c) {
      if (n > 16) break;
      if (put(Z, weighted(MIX), x, z, y + (rnd() - 0.5) * 0.4, 0.3)) n++;
    }
  }
  // harbour yard (warehouses): goods, not fish
  // (handled by the 'yard' pass above — block 15 is a concrete yard)

  // ──────────────────────────────────────────────────────── car parks ──
  for (const a of plan.areas) {
    if (a.kind !== 'parking') continue;
    const r = a.rect;
    const Z = zone(r, { paved: true, edge: 0.5, walkPad: 0.5 });
    const ctr = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
    // ticket machine near the middle of a long edge, bottle banks in a far corner, chargers at a row end
    const long = r.x1 - r.x0 > r.z1 - r.z0;
    putAny(Z, 'ticketMachine', raster(Z, 0.5, (x, z) => (long ? Math.abs(x - ctr.x) + Math.min(z - r.z0, r.z1 - z) * 3 : Math.abs(z - ctr.z) + Math.min(x - r.x0, r.x1 - x) * 3), () => 0), 0.3);
    putAny(Z, 'bottleBank', raster(Z, 0.5, (x, z) => Math.min(Math.hypot(x - r.x0, z - r.z0), Math.hypot(x - r.x1, z - r.z1)), () => (long ? 0 : Math.PI / 2)), 0.3);
    for (let i = 0; i < 2; i++) putAny(Z, 'evCharger', raster(Z, 0.5, (x, z) => Math.hypot(x - r.x1, z - r.z0) + i * 0.0), 0.4);
  }

  // ─────────────────────────────────────────────────────── courtyards ──
  for (const a of plan.areas) {
    if (a.kind !== 'courtyard') continue;
    const r = a.rect;
    const Z = zone(r, { paved: false, edge: 0.5, walkPad: 0.5, buildPad: 0.3 });
    const near = (x: number, z: number) => {
      // distance to the nearest building cell (walls the bins stand against)
      for (let d = 0.5; d < 4; d += 0.5) if (occ.has(x + d, z, OCC.BUILDING) || occ.has(x - d, z, OCC.BUILDING) || occ.has(x, z + d, OCC.BUILDING) || occ.has(x, z - d, OCC.BUILDING)) return d;
      return 9;
    };
    const wallYaw = (x: number, z: number) => {
      if (occ.has(x + 1.2, z, OCC.BUILDING)) return -Math.PI / 2;
      if (occ.has(x - 1.2, z, OCC.BUILDING)) return Math.PI / 2;
      if (occ.has(x, z + 1.2, OCC.BUILDING)) return Math.PI;
      return 0;
    };
    const c = raster(Z, 0.5, (x, z) => near(x, z) + rnd() * 0.8, wallYaw);
    let n = 0;
    for (const [x, z, y] of c) {
      if (n >= 3) break;
      if (put(Z, n === 1 ? 'bikes' : 'bins', x, z, y, 0.2)) n++;
    }
    putAny(Z, 'courtTable', raster(Z, 0.5, (x, z) => (x - (r.x0 + r.x1) / 2) ** 2 + (z - (r.z0 + r.z1) / 2) ** 2 + rnd() * 6), 0.4);
  }

  // ─────────────────────────────────────────────────────── schoolyard ──
  for (const a of plan.areas) {
    if (a.kind !== 'schoolyard') continue;
    const r = a.rect;
    const Z = zone(r, { paved: true, edge: 0.4, walkPad: 0.6, doorZone: 3 });
    const court = plan.features.find((f) => f.kind === 'sportscourt');
    if (court?.rect) Z.grid.block(court.rect.x0, court.rect.z0, court.rect.x1, court.rect.z1);
    putAny(Z, 'pingpong', raster(Z, 0.5, () => rnd(), () => (rnd() < 0.5 ? 0 : Math.PI / 2)), 1.0);
    for (let i = 0; i < 2; i++) putAny(Z, 'bikeRack', raster(Z, 0.5, (x, z) => -Math.min(x - r.x0, z - r.z0) + rnd() * 2, () => 0), 0.2);
  }

  return out;
}

/** keep-clear disc for an item (other placers, e.g. the plaza bollards, respect it) */
export function scatterDisc(it: ScatterItem): { x: number; z: number; r: number } {
  return { x: it.x, z: it.z, r: Math.max(it.w, it.d) * 0.55 };
}
