// Module "near": the first layer of the near-detail bubble (core/nearDetail.ts), and the place for bubble layers that
// belong to no other module. nearGrit: the small stones and chips that gather on every street of a real town, along
// the kerb and at the foot of walls, thin in the middle of a lane or a lawn. Reads from about 3 m in; one instanced
// draw, nothing beyond 18 m. `?nonearGrit` off.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { OCC } from '../core/occupancy';
import { nearGrow, nearOf, nearRandom, nearOn } from '../core/nearDetail';
import { SIDEWALK_Y } from '../core/constants';
import { patchLampMaterial } from './lamps/integrate';

const GRIT_RADIUS = 18;
const GRIT_CELL = 8;
/** tries per cell; about a third land */
const GRIT_TRIES = 150;

/** a stone: an icosahedron with its corners pushed about, facetted */
function stoneGeometry(): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const pos = ico.getAttribute('position') as THREE.BufferAttribute;
  // (non-indexed: the same corner is listed once per face; a hash of the corner keeps it whole)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
    const k = 0.72 + 0.5 * h;
    pos.setXYZ(i, x * k, y * k * 0.72, z * k);
  }
  ico.computeVertexNormals();
  return ico;
}

export default function create(ctx: CityContext): CityModule {
  const near = nearOf(ctx);
  const occ = ctx.occupancy;
  const terrain = ctx.services.terrain as { height(x: number, z: number): number } | undefined;
  const { x0: sx0, x1: sx1, z0: sz0, z1: sz1 } = ctx.plan.slab;

  if (nearOn('nearGrit') && terrain) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
    patchLampMaterial(material);
    nearGrow(material, GRIT_RADIUS);
    const hard = OCC.ROAD | OCC.SIDEWALK | OCC.PAVED;
    const skip = OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.RAIL | OCC.PATH;
    near.addScatter({
      name: 'nearGrit',
      radius: GRIT_RADIUS,
      cell: GRIT_CELL,
      top: 2.5,
      geometry: stoneGeometry(),
      material,
      capacity: 3200,
      perCell: 160,
      colors: true,
      fill(c, out) {
        if (c.x1 < sx0 || c.x0 > sx1 || c.z1 < sz0 || c.z0 > sz1) return;
        const rnd = nearRandom(c.seed);
        for (let k = 0; k < GRIT_TRIES; k++) {
          const u = rnd(),
            v = rnd(),
            pick = rnd(),
            w = rnd(),
            yaw = rnd() * 6.283,
            tone = rnd(),
            small = rnd();
          const x = c.x0 + u * GRIT_CELL,
            z = c.z0 + v * GRIT_CELL;
          const f = occ.get(x, z);
          if (f & skip) continue;
          // where it gathers: against a kerb, at the foot of a wall; little elsewhere
          let want: number;
          let y: number;
          if (f & OCC.ROAD) {
            want = occ.anyInCircle(x, z, 0.9, OCC.SIDEWALK) ? 0.95 : 0.06;
            y = 0;
          } else if (f & OCC.SIDEWALK) {
            want = occ.anyInCircle(x, z, 0.7, OCC.BUILDING) ? 0.9 : 0.1;
            y = SIDEWALK_Y;
          } else if (f & hard) {
            want = 0.2;
            y = terrain.height(x, z);
          } else {
            want = 0.3;
            y = terrain.height(x, z);
          }
          if (pick > want) continue;
          // mostly sand-sized chips, a few real stones
          const s = 0.006 + 0.02 * small * small * small + (small > 0.97 ? 0.018 : 0);
          // grey street stone, some warm sand and brick
          const g = 0.2 + 0.22 * tone;
          const warm = w > 0.8 ? 0.1 : 0.015;
          const r = g + warm * (w > 0.94 ? 2.2 : 1),
            b = g - warm * 0.8;
          out.put(x, y + s * 0.35, z, yaw, s * (0.8 + 0.5 * w), s, s * (0.8 + 0.5 * tone), (w - 0.5) * 0.5, (tone - 0.5) * 0.5, r, g, b);
        }
      },
    });
  }

  return {
    name: 'near',
    stats: () => near.stats(),
  };
}
