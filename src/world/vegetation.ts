// Module "vegetation": street trees, park / garden / courtyard / riverside trees, the dense mixed
// forest on the northern hills, palms along the beach, bushes, garden hedges, flower beds,
// allotment crops, pond reeds and lily pads.
//
// Everything is baked at start-up into a few merged, vertex-coloured meshes:
//   trees (near) / trees-far (LOD beyond ~300 m) / forest — cast shadows (custom depth material so
//   shadows sway with the wind); plants (bushes, hedges, soil rows) + fine plants (flowers, crops,
//   reeds, grates/planters) — no shadows.
// Wind sway and the painted foliage shading (leaf-clump relief, wrap, backlit translucency, crown
// occlusion, night lamp light) live in vegetation/material.ts; per-vertex data in aWind + aLeaf.
// A/B: ?legacyveg = pre-overhaul generators + material (vegetation/legacy/), same placement.
//
// Service: ctx.services.vegetation = { trees: { x, z, r, h }[] }

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { OCC } from '../core/occupancy';
import { Rng, hash01 } from '../core/rng';
import { SIDEWALK_Y, RIVER, QUAY_X } from '../core/constants';
import type { Area, DistrictKind } from '../core/plan';
import { GeoSink, Shaper, staticMesh, type ExtraDef } from './vegetation/geo';
import { windMaterials, foliageKnobs } from './vegetation/material';
import { windMaterials as legacyWindMaterials } from './vegetation/legacy/material';
import * as NEW from './vegetation/species';
import * as OLD from './vegetation/legacy/species';
import { Wind, col, LEAF, type Species, type TreeSpec } from './vegetation/species';
import { NearCells, nearCell } from './lamps/nearCells';
import { flowerBed, flowerClump, crop, soilRow, surround, treeGuard, wornPatch, GRATE_HOLE, FLOWERS, type Surround } from './vegetation/plants';
import { getLayout, occAny, PLANTER, hrand, MASK_WALK, DistanceLod, ChunkCuller, chunkOf, type Layout } from './props/layout';
import { getLeafAtlas } from './vegetation/atlas';
import { FoliageLayer, LodTexture, cardMaterials, woodMaterials, cardKnobs, type InstBuf, type PlantRef } from './vegetation/foliage';
import { structure, emitFar, emitNear, newCardBuf, newWoodBuf, type PlantDef, type KindName } from './vegetation/crowns';

interface TerrainSvc {
  height(x: number, z: number): number;
  rocks: { x: number; z: number; r: number }[];
  portals: { kind: 'road' | 'rail'; x: number; z: number; yaw: number; width: number; height: number }[];
  promenadeLamps: { x: number; z: number; y: number }[];
}

export interface VegetationService {
  /** worn: radius of the trodden bare patch at the foot (W5) — ground cover should keep grass off it */
  trees: { x: number; z: number; r: number; h: number; worn?: number }[];
  /** foliage shading knobs (uniform objects; for tuning from the console / test scripts) */
  knobs: typeof foliageKnobs;
  /** leaf-card shading / wind knobs */
  cardKnobs: typeof cardKnobs;
  /**
   * Leaf-card LOD distance (m) for the adaptive quality ladder: plants within it get leaf clusters and
   * branches, beyond it the far cards. `null` restores the quality preset (high 75, medium 42, low 0).
   */
  setLeafDistance(m: number | null): void;
  getLeafDistance(): number;
  /** the procedural leaf atlas (debug / inspection) */
  atlasTex: THREE.Texture | null;
  /** debug: plants within rad of (x, z) with kind, near weight, LOD texel and near detail counts */
  debugPlants(x: number, z: number, rad: number): string[];
}

interface Planted extends TreeSpec {
  surround: Surround;
  syaw: number;
  tag: string;
}

/** Uniform-cell hash of discs (obstacles / trees). */
class DiscHash {
  readonly x: number[] = [];
  readonly z: number[] = [];
  readonly r: number[] = [];
  private cells = new Map<number, number[]>();
  constructor(private cell = 6) {}
  private key(i: number, j: number): number {
    return (i + 4096) * 8192 + (j + 4096);
  }
  add(x: number, z: number, r: number): number {
    const id = this.x.length;
    this.x.push(x);
    this.z.push(z);
    this.r.push(r);
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.cells.get(k);
    if (!a) this.cells.set(k, (a = []));
    a.push(id);
    return id;
  }
  /** visit discs whose centre is within `rad` of (x,z); stop when fn returns true (→ returns true) */
  any(x: number, z: number, rad: number, fn: (id: number, d: number) => boolean): boolean {
    const c = this.cell;
    const i0 = Math.floor((x - rad) / c),
      i1 = Math.floor((x + rad) / c);
    const j0 = Math.floor((z - rad) / c),
      j1 = Math.floor((z + rad) / c);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const a = this.cells.get(this.key(i, j));
        if (!a) continue;
        for (const id of a) {
          const d = Math.hypot(this.x[id] - x, this.z[id] - z);
          if (d <= rad && fn(id, d)) return true;
        }
      }
    }
    return false;
  }
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const plan = ctx.plan,
    occ = ctx.occupancy;
  const terrain = ctx.services.terrain as TerrainSvc | undefined;
  const H = (x: number, z: number): number => (terrain ? terrain.height(x, z) : plan.heightAt(x, z));
  const layout: Layout = getLayout(ctx);
  const slab = plan.slab;
  const density = ctx.quality.density;
  // A/B: ?legacyveg = the pre-overhaul generators + material (same placement)
  const legacy = ctx.debug.params.has('legacyveg') && ctx.debug.params.get('legacyveg') !== '0';
  // leaf-card trees (default) vs the lobed-hull trees (?noleafcards — A/B + fallback)
  const cardsOn = !legacy && !ctx.debug.params.has('noleafcards');
  // W5 tree bases: bark relief + soil-stained trunk foot (shader), real tree-pit surrounds (geometry)
  const noTreeBase = ctx.debug.params.has('notreebase');
  const noFenceDetail = ctx.debug.params.has('nofencedetail') || ctx.quality.level === 'low';
  const buildTree: (s: GeoSink, w: Wind, t: TreeSpec) => unknown = legacy ? OLD.buildTree : NEW.buildTree;
  const bush = legacy ? OLD.bush : NEW.bush;
  const hedge = legacy ? OLD.hedge : NEW.hedge;
  const EXTRAS: ExtraDef[] = [
    { name: 'aWind', size: 4 },
    { name: 'aLeaf', size: 4, u8: true },
  ];
  // shading knobs for tuning / A/B: ?vegbump=0.9&vegtrans=0.9&vegwrap=0.45&vegtone=1 (vegfx=0 → plain shading)
  for (const [k, u] of [
    ['vegbump', foliageKnobs.bump],
    ['vegtrans', foliageKnobs.trans],
    ['vegwrap', foliageKnobs.wrap],
    ['vegtone', foliageKnobs.tone],
    ['vegscale', foliageKnobs.scale],
    ['vegcrease', foliageKnobs.crease],
    ['vegfine', foliageKnobs.fine],
    ['vegnight', foliageKnobs.night],
  ] as const) {
    const v = parseFloat(ctx.debug.params.get(k) ?? '');
    if (Number.isFinite(v)) u.value = v;
  }
  const fx = ctx.debug.params.get('vegfx') !== '0';
  // clump search: full 3x3x3 on high, 2x2x2 on medium/low (?vegcells=8|27 forces one)
  const cellsParam = ctx.debug.params.get('vegcells');
  let qLevel = '';
  if (ctx.debug.params.get('vegclump') === 'billow') foliageKnobs.model.value = 1;

  // ── obstacles for anything planted
  const furn = new DiscHash(6);
  for (const f of layout.furniture) furn.add(f.x, f.z, f.r);
  const lampHash = new DiscHash(8);
  for (const l of layout.lamps) lampHash.add(l.x, l.z, 0.3);
  for (const l of terrain?.promenadeLamps ?? []) lampHash.add(l.x, l.z, 0.3);
  const rocks = new DiscHash(8);
  for (const r of terrain?.rocks ?? []) rocks.add(r.x, r.z, r.r);
  // tall features a canopy must not swallow (statues, flagpoles, fountains, pavilions, cranes…)
  const TALL = new Set(['statue', 'flagpole', 'fountain', 'gazebo', 'bandstand', 'kiosk', 'carousel', 'ferriswheel', 'lifeguard', 'chimney', 'floodlight', 'towercrane', 'windturbine', 'lighthouse']);
  const tall = new DiscHash(12);
  for (const f of plan.features) if (TALL.has(f.kind)) tall.add(f.x, f.z, Math.max(0.5, f.radius));
  const trees = new DiscHash(8);
  const planted: Planted[] = [];
  const bushes = new DiscHash(4);

  const HARD = OCC.ROAD | OCC.SIDEWALK | OCC.PAVED | OCC.RAIL | OCC.WATER | OCC.SOLID | OCC.BUILDING;

  interface OkOpts {
    /** canopy may hang over sidewalks/paths (default true) */
    trunkHard?: number;
    spacing?: number;
    waterMargin?: number;
    buildMargin?: number;
    skipLamps?: boolean;
  }

  function treeOk(x: number, z: number, R: number, o: OkOpts = {}): boolean {
    const e = R * 0.85 + 0.3;
    if (x < slab.x0 + e || x > slab.x1 - e || z < slab.z0 + e || z > slab.z1 - e) return false;
    const wm = o.waterMargin ?? 1.0;
    if (occAny(occ, x, z, 0.8, (o.trunkHard ?? HARD) & ~OCC.WATER)) return false;
    if (wm > 0 && occAny(occ, x, z, wm, OCC.WATER)) return false;
    if (occAny(occ, x, z, 0.55, OCC.PATH)) return false;
    if (layout.walk.anyInCircle(x, z, 0.45, MASK_WALK)) return false;
    if (occAny(occ, x, z, R + (o.buildMargin ?? 0.6), OCC.BUILDING)) return false;
    if (occAny(occ, x, z, R * 0.7, OCC.ROAD)) return false;
    if (occAny(occ, x, z, R + 0.8, OCC.RAIL)) return false;
    if (occAny(occ, x, z, Math.max(1.1, R * 0.6), OCC.SOLID)) return false;
    if (tall.any(x, z, R + 9, (id, d) => d < tall.r[id] + R * 0.85 + 0.3)) return false;
    if (furn.any(x, z, 3.8, (id, d) => d < furn.r[id] + 0.9)) return false;
    if (!o.skipLamps && lampHash.any(x, z, Math.max(1.6, R * 0.9 + 0.3), () => true)) return false;
    if (rocks.any(x, z, 6, (id, d) => d < rocks.r[id] + 1.2)) return false;
    const sp = o.spacing ?? 0.85;
    if (trees.any(x, z, R + 4.5, (id, d) => d < Math.max(1.4, (R + trees.r[id]) * sp))) return false;
    return true;
  }

  function plant(t: Omit<Planted, 'seed' | 'detail'> & { seed?: number; detail?: number }): Planted {
    const broad = t.sp !== 'conifer' && t.sp !== 'palm';
    const p = {
      ...t,
      seed: t.seed ?? Math.floor(hash01(t.x * 7.31, t.z * 3.17, 11) * 1e9),
      detail: t.detail ?? (broad && t.r >= 3.4 ? 3 : 2),
      // per-tree macro tone (lighter/yellower ↔ darker/bluer) so groves never read as one colour
      tone: t.tone ?? 0.5 + (hash01(t.x * 1.7, t.z * 2.3, 23) - 0.5) * 0.55,
    } as Planted;
    planted.push(p);
    trees.add(p.x, p.z, p.r);
    return p;
  }

  // ── species & sizes
  const size = (sp: Species, rng: Rng, cls: 0 | 1 | 2 = 1): { h: number; r: number } => {
    switch (sp) {
      case 'conifer':
        return cls === 0 ? { h: rng.range(4.5, 6.5), r: rng.range(1.4, 1.9) } : cls === 1 ? { h: rng.range(7.5, 10.5), r: rng.range(1.9, 2.5) } : { h: rng.range(11, 14.5), r: rng.range(2.5, 3.1) };
      case 'column':
        return { h: rng.range(9, 12.5), r: rng.range(1.15, 1.55) };
      case 'birch':
        return { h: rng.range(7, 10), r: rng.range(1.7, 2.3) };
      case 'blossom':
        return { h: rng.range(4.6, 6.4), r: rng.range(2.2, 2.9) };
      case 'fruit':
        return { h: rng.range(3.6, 4.8), r: rng.range(1.45, 1.95) };
      case 'palm':
        return { h: rng.range(7, 10), r: 3.0 };
      case 'willow':
        return { h: rng.range(6.5, 8.5), r: rng.range(3.0, 3.6) };
      default:
        return cls === 0 ? { h: rng.range(5, 6.5), r: rng.range(1.9, 2.4) } : cls === 1 ? { h: rng.range(7, 9.5), r: rng.range(2.6, 3.3) } : { h: rng.range(9.5, 12.5), r: rng.range(3.4, 4.3) };
    }
  };

  // ───────────────────────────────────────────────────── street trees ──
  {
    const rng = ctx.rng('veg-street');
    for (const s of plan.slots) {
      if (s.kind !== 'tree') continue;
      const dk = s.district;
      // distance to the nearest building (limits the canopy)
      let dB = 6;
      for (let r = 1.5; r <= 5.5; r += 0.5) {
        if (occAny(occ, s.x, s.z, r, OCC.BUILDING)) {
          dB = r;
          break;
        }
      }
      let sp: Species = 'round';
      let sur: Surround = 'verge';
      let maxR = 2.25;
      switch (dk) {
        case 'downtown':
        case 'midtown':
          sp = rng.chance(0.22) ? 'column' : 'round';
          sur = 'planter';
          break;
        case 'oldtown':
        case 'market':
        case 'civic':
          sp = rng.chance(0.16) ? 'blossom' : 'round';
          sur = 'kerbgrate';
          maxR = 2.1;
          break;
        case 'industrial':
        case 'harbor':
        case 'station':
          sp = rng.chance(0.5) ? 'column' : 'round';
          sur = 'grate';
          maxR = 2.0;
          break;
        case 'beach':
          sp = 'palm';
          sur = 'kerbgrate';
          break;
        case 'park':
        case 'riverside':
          sp = rng.chance(0.12) ? 'birch' : rng.chance(0.08) ? 'autumn' : 'round';
          sur = 'verge';
          maxR = 2.6;
          break;
        default:
          sp = rng.weighted<Species>(['round', 'birch', 'blossom', 'autumn'], [6, 1.5, 1.5, 0.8]);
          sur = 'verge';
      }
      let R = Math.max(1.3, Math.min(maxR, dB - 0.9));
      if (sp === 'column') R = Math.min(R, rng.range(1.15, 1.4));
      if (sp === 'birch') R = Math.min(R, 1.9);
      // surrounds are long along local x: the slot yaw faces away from the road, so x runs along the kerb.
      // The tree sits a little behind the band centre so its pit keeps a strip of kerb stone in front.
      const yaw = s.yaw;
      const back = sur === 'kerbgrate' ? 0.14 : 0.06;
      const tx = s.x + Math.sin(yaw) * back,
        tz = s.z + Math.cos(yaw) * back;
      const clear = 3.4 + rng.range(0, 0.4);
      let h: number;
      if (sp === 'palm') h = rng.range(7.5, 9.5);
      else if (sp === 'column') h = clear + rng.range(6.5, 8);
      else if (sp === 'blossom') h = clear + R * 1.55;
      else h = clear + R * rng.range(1.75, 2.0);
      if (sp === 'palm') R = 3.0;
      plant({ sp, x: tx, z: tz, y: SIDEWALK_Y, h, r: R, clear: sp === 'palm' ? undefined : clear, surround: sur, syaw: yaw, tag: 'street' });
    }
  }

  // ─────────────────────────────────────────────────── special spots ──
  const island = plan.features.find((f) => f.kind === 'pondisland');
  if (island) {
    const ir = Number(island.params?.radius ?? island.radius ?? 2.6);
    plant({ sp: 'willow', x: island.x - 0.5, z: island.z + 0.2, y: H(island.x - 0.5, island.z + 0.2) - 0.05, h: 6.2, r: Math.min(2.5, ir), detail: 2, surround: 'none', syaw: 0, tag: 'island' });
    plant({ sp: 'birch', x: island.x + 1.1, z: island.z - 0.8, y: H(island.x + 1.1, island.z - 0.8) - 0.05, h: 6.8, r: 1.3, detail: 2, surround: 'none', syaw: 0, tag: 'island' });
  }

  // river: poplar row + willows hanging over the water (south bank, between the wall and the walk)
  {
    const rng = ctx.rng('veg-river');
    const bridges = plan.features.filter((f) => f.kind === 'footbridge').map((f) => f.x);
    const jetties = plan.features.filter((f) => f.kind === 'jetty').map((f) => f.x);
    let k = 0;
    for (let x = slab.x0 + 5; x < 112; x += rng.range(8.5, 11.5)) {
      if (bridges.some((b) => Math.abs(b - x) < 6) || jetties.some((j) => Math.abs(j - x) < 5)) continue;
      const willow = k % 5 === 2;
      const z = willow ? RIVER.z1 + 1.0 : RIVER.z1 + 2.0;
      k++;
      const sp: Species = willow ? 'willow' : 'column';
      const sz = willow ? { h: rng.range(6.5, 7.5), r: 2.2 } : size('column', rng);
      if (!treeOk(x, z, sz.r, { waterMargin: 0, spacing: 0.7, skipLamps: true })) continue;
      plant({ sp, x, z, y: H(x, z), h: sz.h, r: sz.r, surround: 'none', syaw: 0, tag: 'river' });
    }
  }

  // palms along the beach (sand side of the boardwalk), pairs and singles
  {
    const rng = ctx.rng('veg-palms');
    const beach = plan.areas.find((a) => a.kind === 'beach');
    const board = plan.areas.find((a) => a.kind === 'boardwalk');
    if (beach && board) {
      const x0 = board.rect.x1 + 1.5;
      for (let z = beach.rect.z0 + 2; z < beach.rect.z1 - 2; z += rng.range(7, 10)) {
        const pair = rng.chance(0.4);
        for (let q = 0; q < (pair ? 2 : 1); q++) {
          const x = x0 + rng.range(0, 1.2) + q * 1.6;
          const zz = z + q * rng.range(1.2, 2.0);
          if (occAny(occ, x, zz, 1.4, OCC.PATH | OCC.BUILDING | OCC.SOLID)) continue;
          if (lampHash.any(x, zz, 1.8, () => true)) continue;
          if (trees.any(x, zz, 4, (id, d) => d < 1.3)) continue;
          if (zz > 53 && zz < 71) continue; // pier
          const sz = size('palm', rng);
          plant({ sp: 'palm', x, z: zz, y: H(x, zz) - 0.05, h: sz.h * (q ? 0.82 : 1), r: 3, surround: 'none', syaw: 0, tag: 'beach' });
        }
      }
    }
  }

  // civic square: blossom trees in the four quadrants
  for (const a of plan.areas) {
    if (a.kind !== 'plaza') continue;
    const blk = plan.blocks[a.blockId];
    if (blk?.kind !== 'civic') continue;
    const fz = plan.features.find((f) => f.kind === 'fountain');
    if (!fz) continue;
    const r = a.rect;
    const pts = [
      [r.x0 + 7.5, r.z0 + 5.5],
      [r.x1 - 7.5, r.z0 + 5.5],
      [r.x0 + 7.5, r.z1 - 4.5],
      [r.x1 - 7.5, r.z1 - 4.5],
      [r.x0 + 3.2, (r.z0 + fz.z) / 2 + 1],
      [r.x1 - 3.2, (r.z0 + fz.z) / 2 + 1],
    ];
    const rng = ctx.rng('veg-civic');
    for (const [x, z] of pts) {
      const R = rng.range(2.1, 2.5);
      if (!treeOk(x, z, R, { spacing: 0.8 })) continue;
      plant({ sp: 'blossom', x, z, y: 0.02, h: R * 1.5 + 2.4, r: R, clear: 2.4, surround: 'roundgrate', syaw: 0, tag: 'civic' });
    }
  }

  // park: blossom trees on the diagonals around the statue hub
  {
    const hub = plan.features.find((f) => f.kind === 'statue' && f.params?.style === 'founder');
    if (hub) {
      const rng = ctx.rng('veg-hub');
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const x = hub.x + Math.cos(a) * 11.5,
          z = hub.z + Math.sin(a) * 11.5;
        const R = rng.range(2.3, 2.7);
        if (!treeOk(x, z, R, { spacing: 0.8 })) continue;
        plant({ sp: 'blossom', x, z, y: H(x, z), h: R * 1.55 + 2.2, r: R, clear: 2.2, surround: 'none', syaw: 0, tag: 'park' });
      }
    }
  }

  // ───────────────────────────────────────────────────── area scatter ──
  const gardenLots = plan.lots.filter((l) => l.kind === 'house');
  const mix = (a: Area): { sp: Species[]; w: number[]; cls: (rng: Rng) => 0 | 1 | 2; sur: Surround } | null => {
    const blk = plan.blocks[a.blockId];
    const dk: DistrictKind = blk?.kind ?? 'park';
    switch (a.kind) {
      case 'lawn':
        if (dk === 'park') return { sp: ['round', 'blossom', 'birch', 'conifer', 'autumn', 'column'], w: [10, 1.2, 1.6, 1.6, 1.0, 0.6], cls: (r) => (r.chance(0.32) ? 2 : r.chance(0.2) ? 0 : 1), sur: 'none' };
        if (dk === 'riverside') return { sp: ['round', 'birch', 'conifer', 'autumn', 'column', 'blossom'], w: [10, 2, 1.6, 1.1, 1, 0.6], cls: (r) => (r.chance(0.3) ? 2 : r.chance(0.2) ? 0 : 1), sur: 'none' };
        return { sp: ['round', 'birch', 'conifer'], w: [6, 2, 1.5], cls: (r) => (r.chance(0.3) ? 0 : 1), sur: 'none' };
      case 'garden':
        return { sp: ['fruit', 'round', 'blossom', 'conifer', 'birch'], w: [3.5, 2.5, 1.6, 1.2, 1.0], cls: () => 0, sur: 'none' };
      case 'courtyard':
        return { sp: ['round', 'blossom', 'fruit'], w: [5, 4, 1], cls: (r) => (r.chance(0.5) ? 0 : 1), sur: 'none' };
      case 'yard':
        return { sp: ['column', 'round'], w: [1, 1], cls: () => 0, sur: 'none' };
      default:
        return null;
    }
  };

  for (const a of plan.areas) {
    if (a.greenery <= 0) continue;
    const m = mix(a);
    if (!m) continue;
    const rng = ctx.rng(`veg-area-${a.id}`);
    const r = a.rect;
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    if (a.kind === 'lawn' && area > 1500) {
      // density field → groves where it is high, open lawn / clearings where it is low.
      // species come in patches (dominant species per ~14 m cell) with a sprinkle of others.
      const tries = Math.round(area / 3.2);
      const groveSp: Species[] = ['round', 'round', 'round', 'birch', 'conifer', 'round'];
      for (let k = 0; k < tries; k++) {
        const x = rng.range(r.x0, r.x1),
          z = rng.range(r.z0, r.z1);
        const nz = Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.13 + 0.4) + 0.7 * Math.sin(x * 0.051 - z * 0.067 + 2.1) + 0.4 * Math.sin(x * 0.23 + z * 0.19);
        const dens = smooth(-1.05, 0.15, nz) * a.greenery;
        const solo = dens < 0.25;
        if (rng.next() > (solo ? 0.05 : dens)) continue;
        const cell = hash01(Math.floor(x / 14), Math.floor(z / 14), a.id);
        const dom = groveSp[Math.floor(cell * groveSp.length)];
        const sp = solo ? (rng.chance(0.85) ? 'round' : rng.weighted(m.sp, m.w)) : rng.chance(0.6) ? dom : rng.weighted(m.sp, m.w);
        const sz = size(sp, rng, solo ? 2 : m.cls(rng));
        if (!treeOk(x, z, sz.r, { spacing: solo ? 1.0 : 0.7 })) continue;
        plant({ sp, x, z, y: H(x, z), h: sz.h, r: sz.r, surround: 'none', syaw: 0, tag: a.kind });
      }
      continue;
    }
    const target = Math.round((area * a.greenery) / (a.kind === 'garden' ? 70 : a.kind === 'yard' ? 220 : 58));
    let placed = 0;
    const tries = target * 14 + 6;
    for (let k = 0; k < tries && placed < target; k++) {
      const x = rng.range(r.x0, r.x1),
        z = rng.range(r.z0, r.z1);
      // clumps & clearings on big lawns
      if (area > 2000) {
        const n = Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.093 + 0.4) + 0.6 * Math.sin(x * 0.17 - z * 0.13 + 2.1);
        if (n < -0.15 && rng.chance(0.85)) continue;
      }
      const sp = rng.weighted(m.sp, m.w);
      const cls = m.cls(rng);
      const sz = size(sp, rng, cls);
      if (a.kind === 'garden' && sz.r > 2.2) sz.r = 2.2;
      if (!treeOk(x, z, sz.r, { spacing: a.kind === 'lawn' ? 0.78 : 0.9 })) continue;
      // gardens: keep trees out of the front yard (between the house and the street)
      if (a.kind === 'garden') {
        const lot = gardenLots.find((l) => x >= l.rect.x0 && x <= l.rect.x1 && z >= l.rect.z0 && z <= l.rect.z1);
        if (lot) {
          const f = lot.footprint;
          const inFront = lot.front === 'N' ? z < f.z0 : lot.front === 'S' ? z > f.z1 : lot.front === 'W' ? x < f.x0 : x > f.x1;
          if (inFront && rng.chance(0.8)) continue;
        }
      }
      plant({ sp, x, z, y: H(x, z), h: sz.h, r: sz.r, surround: m.sur, syaw: 0, tag: a.kind });
      placed++;
    }
  }

  // plazas: tidy grid of trees in planters / grates (probability = greenery)
  for (const a of plan.areas) {
    if (a.kind !== 'plaza' || a.greenery <= 0) continue;
    const blk = plan.blocks[a.blockId];
    const dk = blk?.kind ?? 'downtown';
    if (dk === 'civic') continue;
    const rng = ctx.rng(`veg-plaza-${a.id}`);
    const r = a.rect;
    const step = 7.5;
    const nx = Math.max(1, Math.floor((r.x1 - r.x0 - 4) / step) + 1),
      nz = Math.max(1, Math.floor((r.z1 - r.z0 - 4) / step) + 1);
    const ox = (r.x1 + r.x0) / 2 - ((nx - 1) * step) / 2,
      oz = (r.z1 + r.z0) / 2 - ((nz - 1) * step) / 2;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (!rng.chance(Math.min(1, a.greenery * 2.2))) continue;
        const x = ox + i * step,
          z = oz + j * step;
        const sp: Species = rng.chance(0.25) ? 'column' : 'round';
        const R = sp === 'column' ? 1.3 : rng.range(1.9, 2.3);
        if (!treeOk(x, z, R, { spacing: 0.8 })) continue;
        const clear = 2.6;
        plant({ sp, x, z, y: 0.02, h: sp === 'column' ? 9.5 : clear + R * 1.9, r: R, clear, surround: dk === 'oldtown' || dk === 'market' ? 'roundgrate' : 'roundplanter', syaw: 0, tag: 'plaza' });
      }
    }
  }

  // copse in the open meadow north-west (between the allotments and the west spur)
  {
    const rng = ctx.rng('veg-copse');
    for (let k = 0; k < 80; k++) {
      const x = rng.range(slab.x0 + 2, -176),
        z = rng.range(-149, -127.5);
      if (H(x, z) > 0.8) continue;
      const sp = rng.weighted<Species>(['round', 'conifer', 'birch', 'autumn'], [5, 2, 1.5, 0.8]);
      const sz = size(sp, rng, rng.chance(0.4) ? 2 : 1);
      if (!treeOk(x, z, sz.r, { spacing: 0.8 })) continue;
      plant({ sp, x, z, y: H(x, z), h: sz.h, r: sz.r, surround: 'none', syaw: 0, tag: 'copse' });
    }
  }

  // ridge foot strip (between the railway and the cut): small conifers.
  // Disabled by the lead: the railway's catenary masts and cantilever arms occupy this strip
  // (rail asked for ~5 m clear north of the track); the forest above the cut keeps the backdrop green.
  const RIDGE_FOOT_STRIP = false;
  if (RIDGE_FOOT_STRIP) {
    const rng = ctx.rng('veg-ridgefoot');
    for (let x = slab.x0 + 20; x < 108; x += rng.range(5, 9)) {
      const z = rng.range(-161.6, -160.2);
      const sz = { h: rng.range(4, 6), r: rng.range(1.1, 1.4) };
      if (!treeOk(x, z, sz.r, { spacing: 0.8 })) continue;
      if (!rng.chance(0.55)) continue;
      plant({ sp: 'conifer', x, z, y: H(x, z), h: sz.h, r: sz.r, surround: 'none', syaw: 0, tag: 'ridgefoot', detail: 2 });
    }
  }

  // ─────────────────────────────────────────────────────────── forest ──
  let forestCount = 0;
  /** forest trees on the lower rim (the edge the city looks at) — get undergrowth below */
  const forestEdge: Planted[] = [];
  {
    const rng = ctx.rng('veg-forest');
    const turbines = plan.features.filter((f) => f.kind === 'windturbine');
    const portals = terrain?.portals ?? [];
    const N = Math.round(18000 * Math.max(0.5, density));
    for (let k = 0; k < N; k++) {
      const x = rng.range(slab.x0 + 1, 140),
        z = rng.range(slab.z0 + 1, -137);
      const h0 = H(x, z);
      if (h0 < 1.0) continue;
      const gx = (H(x + 0.7, z) - H(x - 0.7, z)) / 1.4,
        gz = (H(x, z + 0.7) - H(x, z - 0.7)) / 1.4;
      const slope = Math.hypot(gx, gz);
      if (slope > 0.78) continue;
      let bad = false;
      for (const p of portals) {
        const dx = x - p.x,
          dz = z - p.z;
        const c = Math.cos(p.yaw),
          s = Math.sin(p.yaw);
        const lx = dx * c - dz * s,
          lz = dx * s + dz * c;
        const reach = p.kind === 'road' ? 21 : 13;
        if (Math.abs(lx) < reach + 2 && lz > -7 && lz < 30) {
          bad = true;
          break;
        }
      }
      if (bad) continue;
      if (turbines.some((t) => Math.hypot(t.x - x, t.z - z) < 4.5)) continue;
      const crest = smooth(4, 15, h0);
      // rim of the forest the city looks at — the low fringe, or the first row above a cut / cliff
      // (a steep step within 6 m to the south): more broadleaf, birch and young trees, finer crowns,
      // undergrowth. (~20 % of the forest; a plain slope does not count)
      let step = 0;
      for (const d of [2, 4, 6]) step = Math.max(step, H(x, z + d - 2) - H(x, z + d));
      const edge = legacy ? 0 : Math.max(1 - smooth(1.2, 4.5, h0), smooth(1.5, 2.5, step));
      // patches: conifer-dominated stands vs. broadleaf stands (low-frequency noise), more conifers up high
      const stand = Math.sin(x * 0.043 + 0.7) * Math.sin(z * 0.11 + 2.1) + 0.5 * Math.sin(x * 0.11 - z * 0.07);
      const conP = Math.min(0.9, Math.max(0.12, 0.38 + 0.3 * crest + 0.32 * stand - 0.3 * edge));
      const sp: Species = rng.chance(conP) ? 'conifer' : rng.weighted<Species>(['round', 'birch', 'autumn', 'column'], [12, 1.4 + 1.6 * edge, 1.2 + 0.6 * edge, 0.5]);
      const young = !legacy && hash01(x * 3.1, z * 1.9, 41) < 0.12 + 0.3 * edge;
      const sz = sp === 'conifer' ? size('conifer', rng, rng.chance(0.25 + crest * 0.4) ? 2 : young ? 0 : 1) : size(sp, rng, rng.chance(0.5) ? 2 : young ? 0 : 1);
      // stand tone: dark spruce stands vs lighter mixed groves, plus per-tree jitter
      const toneN = 0.5 + 0.3 * Math.sin(x * 0.067 + 2.3) * Math.sin(z * 0.091 + 0.6) + 0.16 * Math.sin(x * 0.19 - z * 0.13) - 0.12 * crest;
      const tone = Math.min(1, Math.max(0, toneN + (hash01(x * 5.3, z * 4.7, 43) - 0.5) * 0.4));
      if (sp === 'conifer') sz.r *= rng.range(0.82, 1.12);
      if (x > slab.x1 - sz.r || x > QUAY_X - 4) continue;
      if (z < slab.z0 + sz.r * 0.85) continue;
      // roads under the hill are in tunnels: only the open approaches block trees
      const blockers = h0 > 2.5 ? OCC.RAIL | OCC.BUILDING | OCC.SOLID | OCC.WATER : OCC.ROAD | OCC.SIDEWALK | OCC.PAVED | OCC.RAIL | OCC.BUILDING | OCC.SOLID | OCC.WATER;
      if (occAny(occ, x, z, sz.r + 0.6, blockers)) continue;
      if (rocks.any(x, z, 6, (id, d) => d < rocks.r[id] + 1.2)) continue;
      if (trees.any(x, z, sz.r + 4.5, (id, d) => d < Math.max(1.6, (sz.r + trees.r[id]) * 0.58))) continue;
      // broadleaf crowns on the visible rim get a finer surface (the faceting showed there)
      const det = !legacy && edge > 0.35 && sp !== 'conifer' ? 2 : 1;
      const p = plant({ sp, x, z, y: h0 - 0.1 - slope * 0.25, h: sz.h, r: sz.r, surround: 'none', syaw: 0, tag: 'forest', detail: det, tone });
      if (edge > 0.35 && slope < 0.5) forestEdge.push(p);
      forestCount++;
    }
  }

  // forest mantle (leaf-card mode): the rim the city looks at steps down in layers — young birches / oaks in
  // front of the mature edge trees (shrubs follow below), so the wood does not start with a wall of trunks
  let mantleCount = 0;
  if (cardsOn) {
    const rng = ctx.rng('veg-forest-mantle');
    const edgeNow = forestEdge.slice();
    for (const t of edgeNow) {
      if (!rng.chance(0.5)) continue;
      const x = t.x + rng.range(-2.5, 2.5),
        z = t.z + t.r * rng.range(0.85, 1.4) + rng.range(0.5, 1.5);
      const h0 = H(x, z);
      if (h0 < 0.35) continue;
      const g = Math.hypot(H(x + 0.7, z) - H(x - 0.7, z), H(x, z + 0.7) - H(x, z - 0.7)) / 1.4;
      if (g > 0.75) continue;
      const sp: Species = rng.chance(0.45) ? 'birch' : 'round';
      const sz = { h: rng.range(3.4, 5.6), r: rng.range(1.15, 1.7) };
      if (occAny(occ, x, z, sz.r + 0.4, OCC.ROAD | OCC.SIDEWALK | OCC.PAVED | OCC.RAIL | OCC.BUILDING | OCC.SOLID | OCC.WATER | OCC.PATH)) continue;
      if (rocks.any(x, z, 6, (id, d) => d < rocks.r[id] + 1.0)) continue;
      if (trees.any(x, z, sz.r + 4.5, (id, d) => d < Math.max(1.4, (sz.r + trees.r[id]) * 0.55))) continue;
      const p = plant({ sp, x, z, y: h0 - 0.08, h: sz.h, r: sz.r, surround: 'none', syaw: 0, tag: 'forest', detail: 1, tone: 0.62 + rng.range(0, 0.25) });
      forestEdge.push(p);
      mantleCount++;
    }
  }

  // forest band beyond the slab (world mode): the hill forest continues ~45 m into the landscape so the
  // camera never sees where our trees stop; world's landscape trees start further out (z < −225).
  let bandCount = 0;
  {
    const land = ctx.services.landscape as
      | { active: boolean; height(x: number, z: number): number; cover(x: number, z: number): { forest: number; water: number } }
      | undefined;
    if (cardsOn && land?.active) {
      const rng = ctx.rng('veg-forest-band');
      const BAND = 45;
      const zs = slab.z0 - BAND,
        ze = slab.z0 + 1;
      const xs = slab.x0 - BAND,
        xe = slab.x1 + BAND;
      const N = Math.round(((xe - xs) * (ze - zs) + 2 * BAND * 80) * 0.45 * Math.max(0.5, density));
      for (let k = 0; k < N; k++) {
        // north band + short strips down the W and E sides of the ridge
        let x: number, z: number;
        const u = rng.next();
        if (u < 0.82) {
          x = rng.range(xs, xe);
          z = rng.range(zs, ze);
        } else {
          x = u < 0.91 ? rng.range(xs, slab.x0 + 1) : rng.range(slab.x1 - 1, xe);
          z = rng.range(slab.z0, slab.z0 + 80);
        }
        const inside = x > slab.x0 + 1 && x < slab.x1 - 1 && z > slab.z0 + 1;
        if (inside) continue;
        const cov = land.cover(x, z);
        if (cov.water > 0.05) continue;
        const out = Math.max(slab.z0 - z, slab.x0 - x, x - slab.x1, 0);
        if (rng.next() > cov.forest * (1 - 0.45 * smooth(BAND * 0.5, BAND, out))) continue;
        const h0 = land.height(x, z);
        const gx = (land.height(x + 0.8, z) - land.height(x - 0.8, z)) / 1.6,
          gz = (land.height(x, z + 0.8) - land.height(x, z - 0.8)) / 1.6;
        const slope = Math.hypot(gx, gz);
        if (slope > 0.8) continue;
        const stand = Math.sin(x * 0.043 + 0.7) * Math.sin(z * 0.11 + 2.1) + 0.5 * Math.sin(x * 0.11 - z * 0.07);
        const sp: Species = rng.chance(Math.min(0.85, Math.max(0.25, 0.55 + 0.3 * stand))) ? 'conifer' : 'round';
        const sz = size(sp, rng, rng.chance(0.4) ? 2 : rng.chance(0.15) ? 0 : 1);
        if (trees.any(x, z, sz.r + 4.5, (id, d) => d < Math.max(1.6, (sz.r + trees.r[id]) * 0.6))) continue;
        const toneN = 0.5 + 0.3 * Math.sin(x * 0.067 + 2.3) * Math.sin(z * 0.091 + 0.6) + 0.16 * Math.sin(x * 0.19 - z * 0.13);
        const tone = Math.min(1, Math.max(0, toneN + (hash01(x * 5.3, z * 4.7, 43) - 0.5) * 0.4));
        plant({ sp, x, z, y: h0 - 0.1 - slope * 0.25, h: sz.h, r: sz.r, surround: 'none', syaw: 0, tag: 'forest', detail: 1, tone });
        bandCount++;
      }
    }
  }

  // ─────────────────────────────────────────────────────────── build trees ──
  const mkTree = () => {
    const sk = new GeoSink(EXTRAS);
    return { s: sk, w: new Wind(sk), sh: new Shaper(sk) };
  };
  // near meshes come in west/east chunks (culled per frame); far trees + forest are single meshes
  const TC = [mkTree(), mkTree()];
  const forestSink = new GeoSink(EXTRAS);
  const fw = new Wind(forestSink);
  const farSink = new GeoSink(EXTRAS);
  const tfw = new Wind(farSink);
  // plants: coarse (bushes, hedges, soil rows: visible from afar) + fine (flowers, crops, reeds, grates)
  const PC = [mkTree(), mkTree()];
  const FC = [mkTree(), mkTree()];
  // W5 near-only detail (grate bars, ribs, litter): 48 m cells drawn within ~30 m of the camera (lamps/nearCells.ts)
  const NC = new NearCells(mkTree);
  let plantSink = PC[0].s,
    pw = PC[0].w,
    psh = PC[0].sh;
  let fineSink = FC[0].s,
    fpw = FC[0].w,
    fsh = FC[0].sh;
  /** select the plant chunk for world x */
  const selP = (x: number) => {
    const c = PC[chunkOf(x)];
    plantSink = c.s;
    pw = c.w;
    psh = c.sh;
  };
  const selF = (x: number) => {
    const c = FC[chunkOf(x)];
    fineSink = c.s;
    fpw = c.w;
    fsh = c.sh;
  };
  const bySpecies: Record<string, number> = {};
  // ── leaf-card plant registry (defs only; far LOD emitted below, near LOD generated lazily)
  const plants: PlantDef[] = [];
  /**
   * Species by role and district — a Mediterranean city: planes, ficus and Washingtonia palms on the
   * avenues, olives / jacarandas / cypresses in the old town and on squares, date / Canary palms on the
   * front, citrus and olives in gardens, oaks + stone pines in the park, spruce / fir / pine on the hills.
   */
  const kindFor = (t: { sp: Species; x: number; z: number; tag: string }): KindName => {
    const hh = hash01(t.x * 1.31, t.z * 2.07, 77);
    const dk: DistrictKind = (plan.districtAt(t.x, t.z)?.kind ?? 'park') as DistrictKind;
    const pick = (ks: KindName[], ws: number[]): KindName => {
      let tot = 0;
      for (const w of ws) tot += w;
      let u = hh * tot;
      for (let i = 0; i < ks.length; i++) {
        u -= ws[i];
        if (u <= 0) return ks[i];
      }
      return ks[ks.length - 1];
    };
    const forest = t.tag === 'forest';
    switch (t.sp) {
      case 'palm':
        return t.tag === 'beach' ? pick(['datepalm', 'fanpalm', 'canarypalm'], [5, 3.5, 1.5]) : pick(['datepalm', 'fanpalm'], [1, 1]);
      case 'conifer':
        if (forest) return pick(['spruce', 'fir', 'pine', 'stonepine'], [4.5, 2.5, 2, 1]);
        return pick(['cypress', 'stonepine', 'spruce', 'pine'], [3, 2.5, 2.5, 2]);
      case 'column':
        if (t.tag === 'river' || dk === 'riverside') return 'poplar';
        if (dk === 'downtown' || dk === 'midtown') return pick(['fanpalm', 'cypress'], [6, 4]);
        if (dk === 'industrial' || dk === 'harbor' || dk === 'station') return pick(['poplar', 'fanpalm'], [7, 3]);
        return pick(['cypress', 'poplar'], [7, 3]);
      case 'blossom':
        return dk === 'civic' || dk === 'park' ? pick(['jacaranda', 'blossom'], [1, 1]) : pick(['blossom', 'jacaranda'], [6, 4]);
      case 'fruit':
        return pick(['fruit', 'olive'], [6, 4]);
      case 'autumn':
        return 'autumn';
      case 'birch':
        return 'birch';
      case 'willow':
        return 'willow';
      default:
        if (forest) return pick(['oak', 'linden', 'maple'], [5.5, 3, 1.5]);
        switch (dk) {
          case 'downtown':
          case 'midtown':
          case 'station':
          case 'harbor':
          case 'industrial':
            return pick(['plane', 'ficus', 'linden'], [4.5, 3, 2.5]);
          case 'oldtown':
          case 'market':
          case 'civic':
            return pick(['plane', 'olive', 'jacaranda', 'ficus'], [3.5, 2.5, 2, 2]);
          case 'beach':
            return pick(['ficus', 'olive'], [6, 4]);
          case 'residential':
          case 'suburb':
            return pick(['jacaranda', 'linden', 'maple', 'olive', 'fruit'], [2.5, 2.5, 2, 2, 1]);
          case 'riverside':
            return pick(['linden', 'plane', 'oak', 'maple'], [3.5, 3, 2, 1.5]);
          default:
            return pick(['oak', 'linden', 'plane', 'maple', 'jacaranda'], [3, 2.5, 2, 1.5, 1]);
        }
    }
  };
  /** growth bias: crowns lean away from close neighbours and walls, toward light */
  const biasFor = (x: number, z: number, r: number): [number, number] => {
    let bx = 0,
      bz = 0;
    trees.any(x, z, r * 2.6 + 4, (id, d) => {
      if (d < 0.05) return false;
      const w = 1 - d / (r * 2.6 + 4);
      bx += ((x - trees.x[id]) / d) * w;
      bz += ((z - trees.z[id]) / d) * w;
      return false;
    });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      for (const dd of [r * 0.8 + 0.5, r * 1.3 + 1]) {
        if (occ.has(x + ca * dd, z + sa * dd, OCC.BUILDING)) {
          bx -= ca * 0.6;
          bz -= sa * 0.6;
          break;
        }
      }
    }
    const l = Math.hypot(bx, bz);
    const k = l > 0.8 ? 0.8 / l : 1;
    return [bx * k, bz * k];
  };
  function addPlant(t: Planted, y: number, clear: number | undefined): void {
    const [bx, bz] = t.tag === 'forest' ? [0, 0.35] : biasFor(t.x, t.z, t.r);
    const kind = kindFor(t);
    let h = t.h - (y - t.y),
      r = t.r;
    const street = t.tag === 'street';
    // species proportions (placement checked the generic size; grow only where it is not tight)
    switch (kind) {
      case 'fanpalm':
        h *= 1.4;
        r = 1.7;
        break;
      case 'canarypalm':
        h *= 0.85;
        r = 3.6;
        break;
      case 'cypress':
        r = Math.min(r, 1.15);
        h *= 1.1;
        break;
      case 'stonepine':
        if (!street) r *= 1.3;
        h *= 1.05;
        break;
      case 'olive':
        h = Math.max(Math.min(h, (clear ?? 1.4) + 3.6), (clear ?? 0) + 2.2);
        if (!street) r *= 1.05;
        break;
      case 'jacaranda':
        if (!street) r *= 1.12;
        h *= 0.92;
        break;
      case 'ficus':
        if (!street) r *= 1.12;
        break;
    }
    // a forest is a closed canopy: crowns reach their neighbours
    if (t.tag === 'forest') r *= 1.18;
    plants.push({
      kind,
      x: t.x,
      y,
      z: t.z,
      h,
      r,
      seed: t.seed,
      clear,
      tone: t.tone,
      bx,
      bz,
      forest: t.tag === 'forest',
      age: hash01(t.x * 0.7, t.z * 1.9, 5),
      // street trees spread along the street (the gap between facades), not into them
      stretch: street ? [Math.cos(t.syaw), -Math.sin(t.syaw), 1.4] : undefined,
      planter: t.surround === 'planter' || t.surround === 'roundplanter' ? { round: t.surround === 'roundplanter', yaw: t.syaw } : undefined,
      paved: noTreeBase ? undefined : GRATE_HOLE[t.surround],
    });
  }
  // build near-to-far for the usual camera direction (south → north) so early-z rejects hidden canopies
  const order = planted.slice().sort((a, b) => b.z - a.z);
  /** trees with a trodden patch at the foot (radius): published on the service for the ground cover */
  const worn = new Map<(typeof planted)[number], number>();
  for (const t of order) {
    const srng = new Rng(t.seed ^ 0x5bd1e995);
    let y = t.y;
    selF(t.x);
    if (t.surround !== 'none') y = surround(fsh, fpw, t.surround, t.x, t.y, t.z, t.syaw, srng, NC.at(t.x, t.z));
    // park / square lawn trees: trodden bare earth and surface roots at the foot on ~45 % (W5)
    if (!noTreeBase && t.surround === 'none' && (t.tag === 'park' || t.tag === 'civic' || t.tag === 'copse') && hash01(t.x * 0.9, t.z * 1.7, 13) < 0.45) {
      const wr = Math.min(1.1, 0.5 + t.h * 0.04);
      wornPatch(fsh, fpw, t.x, t.z, wr, H, srng);
      worn.set(t, wr);
    }
    // a young street tree keeps its guard for a few years (W5)
    if (!noTreeBase && (t.surround === 'kerbgrate' || t.surround === 'grate') && t.h < 8 && hash01(t.x * 1.3, t.z * 0.7, 11) < 0.3) treeGuard(fsh, fpw, t.x, y, t.z, t.syaw, srng);
    const clear = t.clear !== undefined ? t.clear - (y - t.y) : undefined;
    if (cardsOn) addPlant(t, y, clear);
    else if (t.tag === 'forest') buildTree(forestSink, fw, { ...t, y, h: t.h - (y - t.y), clear });
    else {
      const T = TC[chunkOf(t.x)];
      buildTree(T.s, T.w, { ...t, y, h: t.h - (y - t.y), clear });
      buildTree(farSink, tfw, { ...t, y, h: t.h - (y - t.y), clear, far: true });
    }
    bySpecies[t.sp] = (bySpecies[t.sp] ?? 0) + 1;
    if (t.surround === 'planter' || t.surround === 'roundplanter') {
      // a little ivy / flowers in the planter
      const fr = new Rng(t.seed ^ 0x2f);
      const pc = col(fr.pick(FLOWERS));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        const rr = t.surround === 'roundplanter' ? 0.62 : 0.5;
        const ox = Math.cos(a) * rr * (t.surround === 'planter' ? 1.2 : 1),
          oz = Math.sin(a) * rr * (t.surround === 'planter' ? 0.5 : 1);
        const cs = Math.cos(t.syaw),
          sn = Math.sin(t.syaw);
        flowerClump(fineSink, fpw, t.x + ox * cs + oz * sn, y - 0.02, t.z - ox * sn + oz * cs, 0.2, pc, fr);
      }
    }
  }

  // ─────────────────────────────────────────────────────────── plants ──
  let bushCount = 0;
  const bushOk = (x: number, z: number, r: number): boolean => {
    if (x < slab.x0 + r + 0.2 || x > slab.x1 - r - 0.2 || z < slab.z0 + r + 0.2 || z > slab.z1 - r - 0.2) return false;
    if (occAny(occ, x, z, r * 0.75, HARD | OCC.PATH)) return false;
    if (layout.walk.anyInCircle(x, z, r * 0.7, MASK_WALK)) return false;
    if (furn.any(x, z, 3, (id, d) => d < furn.r[id] + r * 0.8)) return false;
    if (lampHash.any(x, z, r + 0.5, () => true)) return false;
    if (rocks.any(x, z, 5, (id, d) => d < rocks.r[id] + r * 0.6)) return false;
    if (trees.any(x, z, r + 1.0, (_id, d) => d < r + 0.45)) return false;
    if (bushes.any(x, z, r + 2.5, (id, d) => d < (r + bushes.r[id]) * 0.85)) return false;
    return true;
  };
  const addBush = (x: number, z: number, r: number, h: number, seed: number, flower?: THREE.Color, detail = 1): boolean => {
    if (!bushOk(x, z, r)) return false;
    if (cardsOn) {
      // leaf-card shrub: oleander / bougainvillea when flowering, else a leafy evergreen
      const fh = hash01(x * 2.3, z * 1.7, 31);
      const kind: KindName = flower ? (fh < 0.55 ? 'oleander' : 'bougain') : 'shrub';
      plants.push({ kind, x, y: H(x, z), z, h, r, seed, tone: 0.35 + 0.3 * fh, age: 0.5 });
    } else {
      selP(x);
      bush(plantSink, pw, x, H(x, z), z, r, h, seed, { flower, detail });
    }
    bushes.add(x, z, r);
    bushCount++;
    return true;
  };
  const flowerColors = ['#e8649a', '#b46ad6', '#f2c84b', '#8f9ee8', '#e8574f', '#f5f0e6'];

  // under-planting near park / riverside / garden / courtyard trees
  {
    const rng = ctx.rng('veg-under');
    for (const t of planted) {
      if (t.tag === 'street' || t.tag === 'forest' || t.tag === 'plaza' || t.tag === 'civic') continue;
      const n = t.tag === 'park' || t.tag === 'lawn' || t.tag === 'courtyard' ? rng.int(0, 3) : rng.int(0, 1);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, 6.28),
          d = t.r * rng.range(0.7, 1.15) + 0.6;
        const r = rng.range(0.7, 1.25);
        const fl = rng.chance(0.22) ? col(rng.pick(flowerColors)) : undefined;
        addBush(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, r, r * rng.range(0.9, 1.25), rng.int(0, 1e9), fl);
      }
    }
  }
  // bushes around park features (gazebo, bandstand, kiosk) and along lawn edges
  {
    const rng = ctx.rng('veg-features');
    for (const f of plan.features) {
      if (f.kind !== 'gazebo' && f.kind !== 'bandstand' && f.kind !== 'statue' && f.kind !== 'kiosk') continue;
      const blk = plan.blocks.find((b) => x0in(b.rect, f.x, f.z));
      if (!blk || (blk.kind !== 'park' && blk.kind !== 'civic' && blk.kind !== 'downtown')) continue;
      const R0 = f.radius + 1.3;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + rng.range(-0.15, 0.15);
        const r = rng.range(0.5, 0.8);
        addBush(f.x + Math.cos(a) * (R0 + r), f.z + Math.sin(a) * (R0 + r), r, r * 1.1, rng.int(0, 1e9), rng.chance(0.3) ? col(rng.pick(flowerColors)) : undefined);
      }
    }
    // shrub groups scattered on the big lawns (park, south bank, school, apartments)
    for (const a of plan.areas) {
      if (a.kind !== 'lawn' && a.kind !== 'courtyard') continue;
      const r = a.rect;
      const area = (r.x1 - r.x0) * (r.z1 - r.z0);
      const groups = Math.round((area / 260) * a.greenery * Math.max(0.6, density));
      for (let g = 0; g < groups; g++) {
        const cx = rng.range(r.x0, r.x1),
          cz = rng.range(r.z0, r.z1);
        const n = rng.int(2, 4);
        const fl = rng.chance(0.3) ? col(rng.pick(flowerColors)) : undefined;
        for (let i = 0; i < n; i++) {
          const rr = rng.range(0.65, 1.2);
          addBush(cx + rng.range(-1.6, 1.6), cz + rng.range(-1.6, 1.6), rr, rr * rng.range(0.85, 1.2), rng.int(0, 1e9), fl);
        }
      }
    }
  }
  // gardens: foundation planting along the house front + flower border
  {
    const rng = ctx.rng('veg-gardens');
    for (const lot of gardenLots) {
      const f = lot.footprint;
      const fc = [col(rng.pick(FLOWERS)), col(rng.pick(FLOWERS))];
      // walk along the front facade, 0.75 m out
      const side = lot.front;
      const along = side === 'N' || side === 'S';
      const a0 = along ? f.x0 : f.z0,
        a1 = along ? f.x1 : f.z1;
      const off = 0.75;
      for (let u = a0 + 0.35; u < a1 - 0.2; u += 0.42) {
        const x = along ? u : side === 'W' ? f.x0 - off : f.x1 + off;
        const z = along ? (side === 'N' ? f.z0 - off : f.z1 + off) : u;
        if (layout.walk.anyInCircle(x, z, 0.3, MASK_WALK)) continue;
        if (occAny(occ, x, z, 0.2, OCC.PAVED | OCC.BUILDING | OCC.SIDEWALK)) continue;
        const k = Math.floor((u - a0) / 0.42);
        if (k % 6 === 0 && addBush(x, z, 0.42, 0.62, rng.int(0, 1e9), undefined)) continue;
        selF(x);
        flowerClump(fineSink, fpw, x, H(x, z), z, 0.27, fc[k % 2], rng);
      }
      // a couple of shrubs in the corners of the back garden
      const r = lot.rect;
      for (let i = 0; i < 2; i++) {
        const x = rng.range(r.x0 + 0.9, r.x1 - 0.9),
          z = rng.range(r.z0 + 0.9, r.z1 - 0.9);
        const rr = rng.range(0.5, 0.9);
        addBush(x, z, rr, rr * 1.1, rng.int(0, 1e9), rng.chance(0.35) ? col(rng.pick(flowerColors)) : undefined);
      }
    }
  }
  // ridge-foot / forest-edge undergrowth
  {
    const rng = ctx.rng('veg-scrub');
    for (let k = 0; k < 260 * Math.max(0.5, density); k++) {
      const x = rng.range(slab.x0 + 2, 128),
        z = rng.range(-169, -158.5);
      const h0 = H(x, z);
      const g = Math.hypot(H(x + 0.6, z) - H(x - 0.6, z), H(x, z + 0.6) - H(x, z - 0.6)) / 1.2;
      if (g > 0.75) continue;
      const rr = rng.range(0.6, 1.1);
      if (h0 < 0.5 && z < -162.5) continue;
      addBush(x, z, rr, rr * rng.range(0.8, 1.1), rng.int(0, 1e9));
    }
  }

  // forest rim undergrowth: low shrubs between the edge trees so the forest sits in its floor (leaf-card
  // mode: a denser mantle on the side facing the city)
  {
    const rng = ctx.rng('veg-forest-under');
    for (const t of forestEdge) {
      const n = cardsOn ? 1 + (rng.chance(0.6) ? 1 : 0) + (rng.chance(0.3) ? 1 : 0) : rng.chance(0.6) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const a = cardsOn ? Math.PI / 2 + rng.range(-1.3, 1.3) : rng.range(0, 6.28),
          d = t.r * rng.range(0.85, 1.35);
        const rr = rng.range(0.5, 0.95);
        addBush(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, rr, rr * rng.range(0.85, 1.15), rng.int(0, 1e9), undefined);
      }
    }
  }

  // forest floor (leaf-card mode): shrubs and fern clumps under the canopy so the hills read as woodland,
  // not as trees standing on a lawn
  let fernCount = 0;
  if (cardsOn) {
    const rng = ctx.rng('veg-forest-floor');
    for (const t of planted) {
      if (t.tag !== 'forest') continue;
      if (rng.chance(0.42)) {
        const a = rng.range(0, 6.28),
          d = t.r * rng.range(0.6, 1.2);
        const rr = rng.range(0.55, 1.05);
        addBush(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, rr, rr * rng.range(0.9, 1.3), rng.int(0, 1e9), undefined);
      }
      const nf = rng.int(0, 3);
      for (let i = 0; i < nf; i++) {
        const a = rng.range(0, 6.28),
          d = t.r * rng.range(0.3, 1.1) + 0.4;
        const x = t.x + Math.cos(a) * d,
          z = t.z + Math.sin(a) * d;
        if (x < slab.x0 + 1 || x > slab.x1 - 1 || z < slab.z0 + 1 || z > slab.z1 - 1) continue;
        if (occAny(occ, x, z, 0.5, HARD | OCC.PATH)) continue;
        if (rocks.any(x, z, 4, (id, dd) => dd < rocks.r[id] + 0.3)) continue;
        if (trees.any(x, z, 1.5, (_id, dd) => dd < 0.45)) continue;
        const rr = rng.range(0.45, 0.75);
        plants.push({ kind: 'fern', x, y: H(x, z), z, h: rr * rng.range(0.9, 1.2), r: rr, seed: rng.int(0, 1e9), tone: rng.range(0.35, 0.7), age: 0.5 });
        fernCount++;
      }
    }
  }

  // hedges (front hedges + shared side/back boundaries)
  let hedgeLen = 0;
  for (const b of layout.borders) {
    if (b.style !== 'hedge') continue;
    const L = Math.hypot(b.bx - b.ax, b.bz - b.az);
    const leaf = col(LEAF.hedge[Math.floor(hrand(`hedge:${b.lot}`) * LEAF.hedge.length)]);
    const height = b.street ? 0.95 + hrand(`hs:${b.lot}`) * 0.15 : 1.12 + hrand(`hh:${b.lot}`) * 0.25;
    selP((b.ax + b.bx) / 2);
    hedge(plantSink, pw, b.ax, b.az, b.bx, b.bz, H(b.ax, b.az), b.street ? 0.6 : 0.66, height, leaf, b.lot * 7 + 3);
    hedgeLen += L;
    // near LOD: a skin of small leaf clusters over the clipped faces (the solid hedge stays as the core / far LOD)
    if (cardsOn && L > 0.4)
      plants.push({
        kind: 'hedge',
        x: (b.ax + b.bx) / 2,
        y: H(b.ax, b.az),
        z: (b.az + b.bz) / 2,
        h: height,
        r: L / 2,
        seed: b.lot * 7919 + Math.round(b.ax * 13 + b.az * 7),
        color: '#' + leaf.getHexString(),
        seg: [b.ax, b.az, b.bx, b.bz, b.street ? 0.6 : 0.66],
        noStems: noFenceDetail,
      });
  }

  // flower beds: park hub, civic square
  let beds = 0;
  {
    const hub = plan.features.find((f) => f.kind === 'statue' && f.params?.style === 'founder');
    const pal = (a: string, b: string, c: string) => [col(a), col(b), col(c)];
    if (hub) {
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const x = hub.x + Math.cos(a) * 7.4,
          z = hub.z + Math.sin(a) * 7.4;
        if (occAny(occ, x, z, 1.2, OCC.PATH | OCC.SOLID | OCC.WATER)) continue;
        selF(x);
        flowerBed(fineSink, fpw, fsh, x, z, H(x, z), 1.5, 0.95, 101 + k, { shape: 'ellipse', yaw: -a + Math.PI / 2, palette: k % 2 ? pal('#e63946', '#f6f1ea', '#ffd23f') : pal('#b05bd6', '#ff7aa2', '#f6f1ea'), edging: col('#cfc6b4'), tall: true });
        beds++;
      }
    }
    const fountain = plan.features.find((f) => f.kind === 'fountain');
    if (fountain) {
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const x = fountain.x + Math.cos(a) * 12.6,
          z = fountain.z + Math.sin(a) * 12.6;
        if (occAny(occ, x, z, 1.0, OCC.PATH | OCC.SOLID | OCC.BUILDING)) continue;
        if (trees.any(x, z, 3, (_i, d) => d < 1.8)) continue;
        selF(x);
        flowerBed(fineSink, fpw, fsh, x, z, 0.02, 2.0, 0.85, 201 + k, { shape: 'ellipse', yaw: -a + Math.PI / 2, palette: pal('#ffd23f', '#e63946', '#f4a261'), edging: col('#d8cfbd') });
        beds++;
      }
    }
    // downtown plazas: rectangular beds along the plaza walk
    for (const p of plan.paths) {
      if (p.kind !== 'plaza' || p.pts.length !== 2) continue;
      const a = p.pts[0],
        b = p.pts[1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 30) continue;
      const dk = plan.districtAt((a.x + b.x) / 2, (a.z + b.z) / 2)?.kind;
      if (dk !== 'downtown') continue;
      const tx = (b.x - a.x) / L,
        tz = (b.z - a.z) / L;
      for (const side of [-1, 1]) {
        for (let u = 6; u < L - 6; u += 9) {
          const off = p.width / 2 + 1.0;
          const x = a.x + tx * u - tz * off * side,
            z = a.z + tz * u + tx * off * side;
          if (occAny(occ, x, z, 1.4, OCC.PATH | OCC.SOLID | OCC.BUILDING | OCC.SIDEWALK)) continue;
          if (furn.any(x, z, 3, (id, d) => d < furn.r[id] + 1.6)) continue;
          if (trees.any(x, z, 3, (_i, d) => d < 1.6)) continue;
          if (lampHash.any(x, z, 2, () => true)) continue;
          selF(x);
          flowerBed(fineSink, fpw, fsh, x, z, 0.02, 1.6, 0.55, 301 + Math.round(u), { shape: 'rect', yaw: Math.atan2(tx, tz) + Math.PI / 2, palette: pal('#e63946', '#f6f1ea', '#e63946'), edging: col('#bdb6aa') });
          beds++;
        }
      }
    }
  }

  // planter slots: flowers + a small shrub (props draws the planter box)
  for (const s of plan.slots) {
    if (s.kind !== 'planter') continue;
    const rng = new Rng(Math.floor(hash01(s.x, s.z, 3) * 1e9));
    const pc = col(rng.pick(FLOWERS)),
      pc2 = col(rng.pick(FLOWERS));
    const ux = Math.cos(s.yaw),
      uz = -Math.sin(s.yaw); // along the planter (perpendicular to the facing)
    const y = SIDEWALK_Y + PLANTER.soil;
    selF(s.x);
    for (let i = -2; i <= 2; i++) {
      const u = i * 0.3;
      if (i === 0) {
        const bseed = rng.int(0, 1e9);
        // leaf-card mode: an irregular leafy shrub (box / pittosporum), not a smooth ball
        if (cardsOn) plants.push({ kind: 'shrub', x: s.x, y, z: s.z, h: rng.range(0.5, 0.75), r: rng.range(0.34, 0.46), seed: bseed, tone: 0.4 + 0.3 * hash01(s.x, s.z, 17), age: 0.5 });
        else bush(fineSink, fpw, s.x, y, s.z, 0.32, 0.5, bseed, { leaf: col('#4f8f3e') });
        continue;
      }
      flowerClump(fineSink, fpw, s.x + ux * u, y, s.z + uz * u, 0.17, i % 2 ? pc : pc2, rng);
    }
  }

  // allotments: soil rows + crops; fruit trees were planted as part of the area scatter
  let cropCount = 0;
  for (const p of layout.plots) {
    const rng = new Rng(Math.floor(hash01(p.rect.x0, p.rect.z0, 9) * 1e9));
    const r = p.rect;
    const alongX = p.along === 'x';
    const len0 = alongX ? r.x0 : r.z0,
      len1 = alongX ? r.x1 : r.z1;
    const w0 = alongX ? r.z0 : r.x0,
      w1 = alongX ? r.z1 : r.x1;
    let row = 0;
    for (let v = w0 + 0.6; v < w1 - 0.4; v += 1.0) {
      const kind = p.crops[Math.floor(row / 2) % p.crops.length];
      row++;
      // keep the shed / barrel corners free
      let a = len0 + 0.4,
        b = len1 - 0.4;
      const blockAt = (q: { x: number; z: number } | null, pad: number) => {
        if (!q) return;
        const qv = alongX ? q.z : q.x,
          qa = alongX ? q.x : q.z;
        if (Math.abs(qv - v) < pad) {
          if (qa < (len0 + len1) / 2) a = Math.max(a, qa + pad);
          else b = Math.min(b, qa - pad);
        }
      };
      blockAt(p.shed, 1.5);
      blockAt(p.barrel, 0.7);
      blockAt(p.tree, 1.3);
      if (b - a < 1) continue;
      const ax = alongX ? a : v,
        az = alongX ? v : a,
        bx = alongX ? b : v,
        bz = alongX ? v : b;
      const yv = H((ax + bx) / 2, (az + bz) / 2);
      selP(ax);
      soilRow(psh, pw, ax, az, bx, bz, yv, 0.62);
      selF(ax);
      const spacing = kind === 'beans' ? 1.1 : kind === 'pumpkin' ? 0.9 : kind === 'corn' || kind === 'sunflower' ? 0.5 : 0.42;
      for (let u = a + spacing / 2; u < b; u += spacing) {
        const x = alongX ? u : v + rng.range(-0.05, 0.05),
          z = alongX ? v + rng.range(-0.05, 0.05) : u;
        crop(fineSink, fpw, fsh, kind, x, yv + 0.13, z, rng);
        cropCount++;
      }
    }
    if (p.tree) {
      const tx = p.tree.x,
        tz = p.tree.z;
      const ft: TreeSpec = { sp: 'fruit', x: tx, y: H(tx, tz), z: tz, h: 4, r: 1.6, seed: Math.floor(hash01(tx, tz) * 1e9), detail: 2 };
      if (cardsOn) plants.push({ kind: 'fruit', x: tx, y: ft.y, z: tz, h: 4, r: 1.6, seed: ft.seed, age: 0.5 });
      else {
        const T = TC[chunkOf(tx)];
        buildTree(T.s, T.w, ft);
        buildTree(farSink, tfw, { ...ft, far: true });
      }
      bySpecies.fruit = (bySpecies.fruit ?? 0) + 1;
      trees.add(tx, tz, 1.6);
    }
  }

  // pond: reeds, cattails and lily pads are drawn by groundcover (ground agent) — only the island shrubs here
  const reedCount = 0;
  {
    const pond = plan.water.ponds[0];
    if (pond) {
      // island shrubs
      if (island) {
        addBush(island.x + 0.9, island.z + 1.0, 0.55, 0.6, 77, undefined);
        addBush(island.x - 1.3, island.z - 0.9, 0.5, 0.55, 78, undefined);
      }
    }
  }

  // ─────────────────────────────────────────────────────────── meshes ──
  const root = new THREE.Group();
  root.name = 'vegetation';
  // debug toggles for cost measurements (scripts/perf.mjs variants): ?vegparts=trees,forest,plants&vegshadow=0
  const parts = (ctx.debug.params.get('vegparts') ?? 'trees,forest,plants').split(',');
  const shadows = ctx.debug.params.get('vegshadow') !== '0';
  const vmat = ctx.debug.params.get('vegmat') ?? 'standard';
  const tm = legacy ? legacyWindMaterials(ctx.uniforms, 'veg-trees', 0.9, vmat) : windMaterials(ctx.uniforms, 'veg-trees', 0.9, vmat, fx);
  const pm = legacy ? legacyWindMaterials(ctx.uniforms, 'veg-plants', 0.92, vmat) : windMaterials(ctx.uniforms, 'veg-plants', 0.92, vmat, fx);
  const geos: THREE.BufferGeometry[] = [];
  const mk = (sink: GeoSink, name: string, mat: THREE.Material, shadow: boolean, part: string): THREE.Mesh => {
    const geo = sink.build();
    geos.push(geo);
    const m = staticMesh(geo, mat, name);
    if (shadow) {
      m.customDepthMaterial = tm.depth;
      m.castShadow = shadows;
    }
    m.receiveShadow = true;
    // drawn before the ground so early-z skips the (expensive) terrain/road pixels underneath
    m.renderOrder = -1;
    if (parts.includes(part) && sink.vcount > 0) root.add(m);
    return m;
  };
  const lod = new DistanceLod(ctx);
  const culler = new ChunkCuller(ctx);
  let near = true;
  const sides = ['w', 'e'];
  TC.forEach((c, i) => culler.add(mk(c.s, `veg-trees-${sides[i]}`, tm.mat, true, 'trees'), () => near));
  const farMesh = mk(farSink, 'veg-trees-far', tm.mat, true, 'trees');
  mk(forestSink, 'veg-forest', tm.mat, true, 'forest');
  PC.forEach((c, i) => culler.add(mk(c.s, `veg-plants-${sides[i]}`, pm.mat, false, 'plants')));
  FC.forEach((c, i) => culler.add(mk(c.s, `veg-plants-fine-${sides[i]}`, pm.mat, false, 'plants'), () => near));
  for (const c of NC.list()) if (c.item.s.vcount > 0) culler.add(mk(c.item.s, 'veg-plants-near-detail', pm.mat, false, 'plants'), () => nearCell(ctx.camera, c));
  farMesh.visible = false;
  const sum = (a: { s: GeoSink }[], key: 'tcount' | 'vcount') => a.reduce((acc, c) => acc + c.s[key], 0);

  // ───────────────────────────────────────────── leaf-card trees (far static + near dynamic) ──
  const atlas = cardsOn ? getLeafAtlas() : null;
  const lodTex = new LodTexture(Math.max(1, plants.length));
  const refs: PlantRef[] = plants.map((p, i) => ({ x: p.x, y: p.y, z: p.z, h: p.h, id: i }));
  let cardLayer: FoliageLayer | null = null;
  let woodLayer: FoliageLayer | null = null;
  let woodNear: FoliageLayer | null = null;
  let cm: ReturnType<typeof cardMaterials> | null = null;
  let wm: ReturnType<typeof woodMaterials> | null = null;
  const farMs0 = performance.now();
  // near capacity per quality (instances)
  const NEAR_CAP = { high: 70000, medium: 36000, low: 4000 };
  const DIST = { high: 75, medium: 42, low: 0 };
  let leafOverride: number | null = null;
  const leafDist = (): number => leafOverride ?? DIST[ctx.quality.level] ?? 75;
  if (cardsOn && atlas) {
    const farCards = newCardBuf(plants.length * 30);
    const farWood = newWoodBuf(plants.length * 14);
    plants.forEach((p, i) => emitFar(structure(p), refs[i], farCards, farWood));
    cm = cardMaterials(ctx.uniforms, atlas.texture, lodTex.tex);
    wm = woodMaterials(ctx.uniforms, lodTex.tex);
    cardLayer = new FoliageLayer('cards', farCards, NEAR_CAP.high, cm, 'veg-cards');
    woodLayer = new FoliageLayer('wood', farWood, 0, wm, 'veg-wood-far', 6);
    woodNear = new FoliageLayer('wood', newWoodBuf(1), Math.round(NEAR_CAP.high / 2.5), wm, 'veg-wood-near', 12);
    cardLayer.mesh.castShadow = woodLayer.mesh.castShadow = woodNear.mesh.castShadow = shadows;
    if (parts.includes('trees')) root.add(cardLayer.mesh, woodLayer.mesh, woodNear.mesh);
  }
  const farMs = performance.now() - farMs0;

  // near set: per-plant weights eased in/out, detail generated lazily (bounded per frame)
  const GRID = 16;
  const grid = new Map<number, number[]>();
  plants.forEach((p, i) => {
    const k = Math.floor(p.x / GRID) * 4096 + Math.floor(p.z / GRID);
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  });
  const detail: ({ cards: InstBuf; wood: InstBuf } | null)[] = plants.map(() => null);
  const weight = new Float32Array(plants.length);
  const target = new Uint8Array(plants.length);
  const dist = new Float32Array(plants.length);
  const members: number[] = [];
  const next: number[] = [];
  const byDist = (a: number, b: number): number => dist[a] - dist[b];
  const wantA: number[] = [];
  const keepA: number[] = [];
  const memberSet = new Uint8Array(plants.length);
  let genMs = 0,
    genCount = 0,
    rebuilds = 0,
    nearCards = 0,
    nearWood = 0;
  const camPos = new THREE.Vector3();
  const lastCam = new THREE.Vector3(1e9, 0, 0);
  const sunLight: { l: THREE.DirectionalLight | null } = { l: ctx.services.sky?.sun ?? null };
  if (!sunLight.l)
    ctx.scene.traverse((o) => {
      if (!sunLight.l && (o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) sunLight.l = o as THREE.DirectionalLight;
    });
  const lightDir = new THREE.Vector3();
  const partsC: InstBuf[] = [];
  const partsW: InstBuf[] = [];

  function updateNear(dt: number): void {
    if (!cardLayer || !woodNear) return;
    const cam = ctx.camera;
    cam.getWorldPosition(camPos);
    const D = leafDist();
    const cap = NEAR_CAP[ctx.quality.level] ?? NEAR_CAP.high;
    // 1. candidates around the camera → targets
    next.length = 0;
    if (D > 1) {
      const R = D + 6;
      const i0 = Math.floor((camPos.x - R) / GRID),
        i1 = Math.floor((camPos.x + R) / GRID);
      const j0 = Math.floor((camPos.z - R) / GRID),
        j1 = Math.floor((camPos.z + R) / GRID);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const a = grid.get(i * 4096 + j);
          if (!a) continue;
          for (const id of a) {
            const p = plants[id];
            const d = Math.hypot(p.x - camPos.x, p.y + p.h * 0.55 - camPos.y, p.z - camPos.z) - p.r * 0.5;
            dist[id] = d;
            const lim = weight[id] > 0.5 ? D + 4 : D;
            if (d < lim) next.push(id);
          }
        }
      }
    }
    next.sort(byDist);
    // 2. generate missing detail (bounded) and apply the capacity budget; after a camera jump (view change,
    //    teleport) generate a big batch at once rather than showing far crowns for many frames
    const jumped = lastCam.distanceToSquared(camPos) > 400;
    lastCam.copy(camPos);
    let budget = jumped ? 60 : 4;
    let usedC = 0,
      usedW = 0;
    for (const id of members) target[id] = 0;
    const want = wantA;
    want.length = 0;
    for (const id of next) {
      if (!detail[id]) {
        if (budget <= 0) continue;
        budget--;
        const g0 = performance.now();
        const c = newCardBuf(256),
          w = newWoodBuf(64);
        emitNear(structure(plants[id]), refs[id], c, w);
        detail[id] = { cards: c.trim(), wood: w.trim() };
        genMs += performance.now() - g0;
        genCount++;
      }
      const dd = detail[id]!;
      if (usedC + dd.cards.n > cap || usedW + dd.wood.n > woodNear.dynCap) break;
      usedC += dd.cards.n;
      usedW += dd.wood.n;
      target[id] = 1;
      want.push(id);
    }
    // 3. ease weights; members = wanted ∪ still fading out (if they still fit)
    const k = jumped ? 1 : Math.min(1, dt / 0.6);
    let changed = false;
    for (const id of want) if (!memberSet[id]) changed = true;
    const keep = keepA;
    keep.length = 0;
    for (const id of members) {
      if (target[id]) continue;
      weight[id] = Math.max(0, weight[id] - k);
      if (weight[id] > 0) {
        const dd = detail[id]!;
        if (usedC + dd.cards.n <= cap && usedW + dd.wood.n <= woodNear.dynCap) {
          usedC += dd.cards.n;
          usedW += dd.wood.n;
          keep.push(id);
          continue;
        }
        weight[id] = 0;
      }
      lodTex.set(id, 0);
      changed = true;
    }
    for (const id of want) {
      weight[id] = Math.min(1, weight[id] + k);
      lodTex.set(id, weight[id]);
    }
    for (const id of keep) lodTex.set(id, weight[id]);
    if (changed) {
      for (const id of members) memberSet[id] = 0;
      members.length = 0;
      for (const id of want) members.push(id);
      for (const id of keep) members.push(id);
      for (const id of members) memberSet[id] = 1;
      partsC.length = 0;
      partsW.length = 0;
      for (const id of members) {
        partsC.push(detail[id]!.cards);
        partsW.push(detail[id]!.wood);
      }
      nearCards = cardLayer.setDynamic(partsC);
      nearWood = woodNear.setDynamic(partsW);
      rebuilds++;
    }
    lodTex.flush();
    // received-shadow lookup shifted toward the light
    const L = sunLight.l;
    if (L) {
      lightDir.subVectors(L.position, L.target.position).normalize();
      cardKnobs.shadowShift.value.copy(lightDir).multiplyScalar(cardKnobs.shadowShiftLen.value);
    }
  }
  ctx.scene.add(root);

  const service: VegetationService = {
    trees: planted.map((t) => ({ x: t.x, z: t.z, r: t.r, h: t.h, worn: worn.get(t) })),
    knobs: foliageKnobs,
    cardKnobs,
    setLeafDistance(m) {
      leafOverride = m === null ? null : Math.max(0, m);
    },
    getLeafDistance: () => leafDist(),
    atlasTex: atlas?.texture ?? null,
    debugPlants(x: number, z: number, rad: number) {
      const out: string[] = [];
      plants.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d > rad) return;
        const dd = detail[i];
        out.push(`${i} ${p.kind} (${p.x.toFixed(1)},${p.z.toFixed(1)}) h${p.h.toFixed(1)} r${p.r.toFixed(1)} w${weight[i].toFixed(2)} lod${lodTex.data[i]} near${dd ? dd.cards.n + '/' + dd.wood.n : '-'}`);
      });
      return out;
    },
  };
  ctx.services.vegetation = service;
  const buildMs = performance.now() - t0;
  let lastT = performance.now();

  return {
    name: 'vegetation',
    frame() {
      if (ctx.quality.level !== qLevel) {
        // (only on quality changes, so the knob stays editable at runtime)
        qLevel = ctx.quality.level;
        foliageKnobs.cheap.value = cellsParam === '8' ? 1 : cellsParam === '27' ? 0 : qLevel === 'high' ? 0 : 1;
        cardKnobs.farKeep.value = qLevel === 'high' ? 1 : qLevel === 'medium' ? 0.85 : 0.6;
        cardKnobs.base.value = noTreeBase || qLevel === 'low' ? 0 : 1;
        foliageKnobs.bark.value = ctx.debug.params.has('nobarkrelief') || qLevel === 'low' ? 0 : 1;
      }
      near = lod.near();
      farMesh.visible = !near;
      culler.update();
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastT) / 1000);
      lastT = now;
      updateNear(dt);
    },
    stats() {
      return {
        trees: planted.length,
        forest: forestCount,
        forestBand: bandCount,
        forestMantle: mantleCount,
        ferns: fernCount,
        street: planted.filter((t) => t.tag === 'street').length,
        bushes: bushCount,
        hedgeM: Math.round(hedgeLen),
        beds,
        crops: cropCount,
        reeds: reedCount,
        treeTris: sum(TC, 'tcount'),
        treeFarTris: farSink.tcount,
        forestTris: forestSink.tcount,
        plantTris: sum(PC, 'tcount'),
        fineTris: sum(FC, 'tcount'),
        verts: sum(TC, 'vcount') + farSink.vcount + forestSink.vcount + sum(PC, 'vcount') + sum(FC, 'vcount'),
        lod: near ? 'near' : 'far',
        visible: root.children
          .filter((c) => c.visible)
          .map((c) => c.name.replace('veg-', ''))
          .join(' '),
        cards: cardLayer ? `${cardLayer.staticCount}+${nearCards}` : 'off',
        wood: woodLayer ? `${woodLayer.staticCount}+${nearWood}` : 'off',
        nearPlants: members.length,
        leafDist: leafDist(),
        atlasMs: atlas ? `${Math.round(atlas.buildMs)} (paint ${Math.round(atlas.paintMs)})` : 0,
        farMs: Math.round(farMs),
        nearGen: `${genCount} in ${Math.round(genMs)} ms`,
        rebuilds,
        species: Object.entries(bySpecies)
          .map(([k, v]) => `${k}:${v}`)
          .join(' '),
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      const out: string[] = [];
      for (const t of planted) {
        if (t.tag === 'street') continue;
        // roads under the hills run in tunnels: only the building/rail check applies up there
        const flags = H(t.x, t.z) > 2.5 ? OCC.BUILDING | OCC.RAIL : OCC.BUILDING | OCC.ROAD | OCC.RAIL;
        if (occ.has(t.x, t.z, flags)) out.push(`tree (${t.sp}) at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) stands in a building/road/rail cell`);
      }
      if (planted.length < 200) out.push(`only ${planted.length} trees planted`);
      return out;
    },
    dispose() {
      for (const g of geos) g.dispose();
      tm.mat.dispose();
      tm.depth.dispose();
      pm.mat.dispose();
      pm.depth.dispose();
      cardLayer?.dispose();
      woodLayer?.dispose();
      woodNear?.dispose();
      cm?.mat.dispose();
      cm?.depth.dispose();
      wm?.mat.dispose();
      wm?.depth.dispose();
      lodTex.tex.dispose();
    },
  };
}

function x0in(r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}
