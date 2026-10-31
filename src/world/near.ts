// Module "near": the first layers of the near-detail bubble (core/nearDetail.ts), and the place for bubble layers that
// belong to no other module. Grit: the sand-sized chips and small stones that gather on every street of a real town,
// thick along the kerb and at the foot of walls, thin in the middle of a lane or a lawn. Two instanced draws, nothing
// beyond 18 m. Switches: `?nonearGrit` (the fine chips within 8 m), `?nonearStones` (the odd stone within 18 m).

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { OCC } from '../core/occupancy';
import { nearGrow, nearOf, nearRandom, nearOn, type NearCell, type NearEmit } from '../core/nearDetail';
import { SIDEWALK_Y } from '../core/constants';
import { patchLampMaterial } from './lamps/integrate';

const GRIT_RADIUS = 8;
const GRIT_CELL = 4;
/** tries per m²: the kerb takes nearly all of them */
const GRIT_DENSITY = 55;
const STONE_RADIUS = 18;
const STONE_CELL = 8;
const STONE_DENSITY = 1.2;

/** corners pushed about (a hash of the corner, so a corner listed by several faces stays whole), facetted, flattened */
function rough(geo: THREE.BufferGeometry, flat: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
    const k = 0.7 + 0.55 * h;
    pos.setXYZ(i, x * k, y * k * flat, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export default function create(ctx: CityContext): CityModule {
  const near = nearOf(ctx);
  const occ = ctx.occupancy;
  const terrain = ctx.services.terrain as { height(x: number, z: number): number } | undefined;
  const { x0: sx0, x1: sx1, z0: sz0, z1: sz1 } = ctx.plan.slab;
  const skip = OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.RAIL | OCC.PATH;

  /** scatter over a cell: how much of the density lands here, and at what height */
  const scatter = (c: NearCell, out: NearEmit, size: number, density: number, kerbOnly: number, sizeAt: (u: number) => number) => {
    if (!terrain || c.x1 < sx0 || c.x0 > sx1 || c.z1 < sz0 || c.z0 > sz1) return;
    const rnd = nearRandom(c.seed);
    const tries = Math.round(size * size * density);
    for (let k = 0; k < tries; k++) {
      const x = c.x0 + rnd() * size,
        z = c.z0 + rnd() * size,
        pick = rnd(),
        w = rnd(),
        yaw = rnd() * 6.283,
        tone = rnd(),
        small = rnd();
      const f = occ.get(x, z);
      if (f & skip) continue;
      // where it gathers: against a kerb, at the foot of a wall; little elsewhere
      let want: number;
      let y: number;
      if (f & OCC.ROAD) {
        want = occ.anyInCircle(x, z, 0.8, OCC.SIDEWALK) ? 1 : 0.1 * kerbOnly;
        y = 0.012; // (the asphalt lies a little above ROAD_Y)
      } else if (f & OCC.SIDEWALK) {
        want = occ.anyInCircle(x, z, 0.5, OCC.BUILDING) ? 0.8 : 0.08 * kerbOnly;
        y = SIDEWALK_Y;
      } else {
        want = (f & OCC.PAVED ? 0.25 : 0.12) * kerbOnly;
        y = terrain.height(x, z);
      }
      if (pick > want) continue;
      const s = sizeAt(small);
      // grey street stone, some warm sand and brick
      const g = 0.2 + 0.24 * tone;
      const warm = w > 0.8 ? 0.09 : 0.012;
      const r = g + warm * (w > 0.95 ? 2.4 : 1),
        b = g - warm * 0.8;
      out.put(x, y + s * 0.3, z, yaw, s * (0.8 + 0.5 * w), s, s * (0.8 + 0.5 * tone), (w - 0.5) * 0.6, (tone - 0.5) * 0.6, r, g, b);
    }
  };

  if (nearOn('nearGrit') && terrain) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    patchLampMaterial(material);
    nearGrow(material, GRIT_RADIUS);
    near.addScatter({
      name: 'nearGrit',
      radius: GRIT_RADIUS,
      cell: GRIT_CELL,
      top: 2.2,
      geometry: rough(new THREE.OctahedronGeometry(1, 0), 0.7),
      material,
      capacity: 7000,
      perCell: 500,
      colors: true,
      fill: (c, out) => scatter(c, out, GRIT_CELL, GRIT_DENSITY, 1, (u) => 0.0035 + 0.008 * u * u),
    });
  }
  if (nearOn('nearStones') && terrain) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    patchLampMaterial(material);
    nearGrow(material, STONE_RADIUS);
    near.addScatter({
      name: 'nearStones',
      radius: STONE_RADIUS,
      cell: STONE_CELL,
      top: 3,
      geometry: rough(new THREE.IcosahedronGeometry(1, 0), 0.72),
      material,
      capacity: 1200,
      perCell: 60,
      colors: true,
      fill: (c, out) => scatter(c, out, STONE_CELL, STONE_DENSITY, 1, (u) => 0.008 + 0.024 * u * u * u),
    });
  }

  return {
    name: 'near',
    stats: () => near.stats(),
  };
}
