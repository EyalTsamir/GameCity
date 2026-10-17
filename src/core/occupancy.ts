// Rasterised occupancy map of the slab (0.5 m cells). Lets any module ask
// "what is at (x, z)?" — used for vegetation/prop placement and for the
// debug invariant checks (no pedestrian inside a building, no car off-road…).

import type { CityPlan, Feature } from './plan';
import type { RoadNetwork } from './roadNetwork';
import { CORRIDOR_HALF, ROAD_HALF, RAIL_Z } from './constants';

export const OCC = {
  ROAD: 1,
  SIDEWALK: 2,
  BUILDING: 4,
  WATER: 8,
  /** solid props / landmark footprints (fountains, statues, stalls, containers, tanks…) */
  SOLID: 16,
  /** walkways (park paths, plaza walks, boardwalk, pier, bridges) */
  PATH: 32,
  RAIL: 64,
  /** hard surfaces where trees must not grow (parking, driveways, platforms, quays) */
  PAVED: 128,
} as const;

/** Features whose footprint is walkable / not solid at ground level. */
const NON_SOLID: ReadonlySet<Feature['kind']> = new Set([
  'footbridge',
  'pier',
  'breakwater',
  'jetty',
  'umbrellas',
  'sportscourt',
  'ferrydock',
  'roadportal',
  'railportal',
  'cargoship',
  'gantrycrane',
  'floodlight',
  'windturbine',
]);

export class OccupancyGrid {
  readonly res = 0.5;
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(plan: CityPlan, net: RoadNetwork) {
    this.x0 = plan.slab.x0;
    this.z0 = plan.slab.z0;
    this.w = Math.ceil((plan.slab.x1 - plan.slab.x0) / this.res);
    this.h = Math.ceil((plan.slab.z1 - plan.slab.z0) / this.res);
    this.data = new Uint8Array(this.w * this.h);
    this.rasterise(plan, net);
  }

  private idx(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.res);
    const j = Math.floor((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  get(x: number, z: number): number {
    const k = this.idx(x, z);
    return k < 0 ? 0 : this.data[k];
  }

  has(x: number, z: number, flags: number): boolean {
    return (this.get(x, z) & flags) !== 0;
  }

  /** true if any cell within radius r of (x,z) has any of `flags` */
  anyInCircle(x: number, z: number, r: number, flags: number): boolean {
    const s = this.res;
    for (let dz = -r; dz <= r + 1e-6; dz += s) {
      for (let dx = -r; dx <= r + 1e-6; dx += s) {
        if (dx * dx + dz * dz > r * r + s * s) continue;
        if (this.has(x + dx, z + dz, flags)) return true;
      }
    }
    return false;
  }

  fillRect(x0: number, z0: number, x1: number, z1: number, flag: number): void {
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - this.x0) / this.res));
    const i1 = Math.min(this.w - 1, Math.ceil((Math.max(x0, x1) - this.x0) / this.res) - 1);
    const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - this.z0) / this.res));
    const j1 = Math.min(this.h - 1, Math.ceil((Math.max(z0, z1) - this.z0) / this.res) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.data[j * this.w + i] |= flag;
  }

  fillCircle(cx: number, cz: number, r: number, flag: number): void {
    const i0 = Math.max(0, Math.floor((cx - r - this.x0) / this.res));
    const i1 = Math.min(this.w - 1, Math.ceil((cx + r - this.x0) / this.res));
    const j0 = Math.max(0, Math.floor((cz - r - this.z0) / this.res));
    const j1 = Math.min(this.h - 1, Math.ceil((cz + r - this.z0) / this.res));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * this.res - cx;
        const z = this.z0 + (j + 0.5) * this.res - cz;
        if (x * x + z * z <= r * r) this.data[j * this.w + i] |= flag;
      }
    }
  }

  /** Thick polyline. */
  fillPolyline(pts: { x: number; z: number }[], halfWidth: number, flag: number): void {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k],
        b = pts[k + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(L / (this.res * 0.5)));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        this.fillCircle(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, halfWidth, flag);
      }
    }
  }

  private rasterise(plan: CityPlan, net: RoadNetwork): void {
    // water
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.x0 + (i + 0.5) * this.res,
          z = this.z0 + (j + 0.5) * this.res;
        if (plan.isWater(x, z)) this.data[j * this.w + i] |= OCC.WATER;
      }
    }
    // roads + sidewalks
    for (const seg of plan.roadSegments) {
      const A = plan.roadNodes[seg.a],
        B = plan.roadNodes[seg.b];
      const horiz = Math.abs(B.x - A.x) > Math.abs(B.z - A.z);
      const side = seg.sidewalks ? CORRIDOR_HALF : ROAD_HALF + 0.6;
      if (horiz) {
        this.fillRect(Math.min(A.x, B.x), A.z - side, Math.max(A.x, B.x), A.z + side, seg.sidewalks ? OCC.SIDEWALK : OCC.PAVED);
      } else {
        this.fillRect(A.x - side, Math.min(A.z, B.z), A.x + side, Math.max(A.z, B.z), seg.sidewalks ? OCC.SIDEWALK : OCC.PAVED);
      }
    }
    for (const I of net.intersections) {
      if (I.control === 'portal') continue;
      this.fillRect(I.x - CORRIDOR_HALF, I.z - CORRIDOR_HALF, I.x + CORRIDOR_HALF, I.z + CORRIDOR_HALF, OCC.SIDEWALK);
    }
    // carriageway on top (clear the sidewalk bit there)
    const carve = (x0: number, z0: number, x1: number, z1: number) => {
      const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - this.x0) / this.res));
      const i1 = Math.min(this.w - 1, Math.ceil((Math.max(x0, x1) - this.x0) / this.res) - 1);
      const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - this.z0) / this.res));
      const j1 = Math.min(this.h - 1, Math.ceil((Math.max(z0, z1) - this.z0) / this.res) - 1);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * this.w + i;
          this.data[k] = (this.data[k] & ~OCC.SIDEWALK) | OCC.ROAD;
        }
    };
    for (const seg of plan.roadSegments) {
      const A = plan.roadNodes[seg.a],
        B = plan.roadNodes[seg.b];
      const horiz = Math.abs(B.x - A.x) > Math.abs(B.z - A.z);
      if (horiz) carve(Math.min(A.x, B.x), A.z - ROAD_HALF, Math.max(A.x, B.x), A.z + ROAD_HALF);
      else carve(A.x - ROAD_HALF, Math.min(A.z, B.z), A.x + ROAD_HALF, Math.max(A.z, B.z));
    }
    for (const I of net.intersections) {
      if (I.control === 'portal') continue;
      carve(I.x - ROAD_HALF, I.z - ROAD_HALF, I.x + ROAD_HALF, I.z + ROAD_HALF);
    }
    // rail corridor
    this.fillRect(plan.rail.portalW, RAIL_Z - 3.2, plan.rail.portalE, RAIL_Z + 3.2, OCC.RAIL);
    // paved areas
    for (const a of plan.areas) {
      if (a.kind === 'parking' || a.kind === 'driveway' || a.kind === 'platform' || a.kind === 'quay' || a.kind === 'containeryard' || a.kind === 'schoolyard' || a.kind === 'freightyard')
        this.fillRect(a.rect.x0, a.rect.z0, a.rect.x1, a.rect.z1, OCC.PAVED);
    }
    // buildings
    for (const lot of plan.lots) {
      const f = lot.footprint;
      this.fillRect(f.x0, f.z0, f.x1, f.z1, OCC.BUILDING);
    }
    // solid features
    for (const f of plan.features) {
      if (NON_SOLID.has(f.kind)) continue;
      if (f.rect && f.kind !== 'marketstall') this.fillRect(f.rect.x0, f.rect.z0, f.rect.x1, f.rect.z1, OCC.SOLID);
      if (f.radius > 0) this.fillCircle(f.x, f.z, f.radius, OCC.SOLID);
    }
    // walkways
    for (const p of plan.paths) this.fillPolyline(p.pts, p.width / 2, OCC.PATH);
  }
}
