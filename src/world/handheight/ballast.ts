// Rail ballast you can stand over: real stones heaped on the painted bed within a few metres of the eye. They follow the bed's
// cross-section (sim/rail/track.ts), stay off the sleepers and the crossing decks, and pick up brown dust by the rails.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { nearGrow, nearOf, nearRandom } from '../../core/nearDetail';
import { BALLAST_DROP, makeProfile, RAIL_H, XING_HALF } from '../../sim/rail/profile';
import { patchLampMaterial } from '../lamps/integrate';

const R = 7.5;
const CELL = 3;
/** stones per m² */
const DENSITY = 260;
const BED: [number, number][] = [
  [0, -0.05], [0.55, -0.04], [1.0, -0.028], [1.3, 0.005], [1.42, 0.02], [1.62, -0.035],
];

/** a broken stone: a few flat faces, not a ball */
function stone(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
    const k = 0.62 + 0.62 * h;
    p.setXYZ(i, x * k * (1 + 0.28 * Math.sign(x)), y * k * 0.72, z * k);
  }
  g.computeVertexNormals();
  // the sky lights the tops; between the stones it is dark
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = THREE.MathUtils.clamp(0.28 + 0.9 * (p.getY(i) + 0.55), 0.22, 1.05);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function addBallast(ctx: CityContext): void {
  const near = nearOf(ctx);
  const prof = makeProfile(ctx.plan);
  const zc = prof.z;
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: true });
  patchLampMaterial(material);
  nearGrow(material, R);
  near.addScatter({
    name: 'handBallast',
    radius: R,
    cell: CELL,
    top: 2.5,
    geometry: stone(),
    material,
    capacity: 11000,
    perCell: 2400,
    colors: true,
    fill: (c, out) => {
      if (c.z1 < zc - 2.4 || c.z0 > zc + 2.4 || c.x1 < prof.x0 || c.x0 > prof.x1) return;
      const rnd = nearRandom(c.seed);
      const tries = CELL * CELL * DENSITY;
      for (let k = 0; k < tries; k++) {
        const x = c.x0 + rnd() * CELL,
          z = c.z0 + rnd() * CELL,
          tone = rnd(),
          warm = rnd(),
          size = rnd(),
          yaw = rnd() * 6.283,
          ta = rnd(),
          tb = rnd();
        const dz = Math.abs(z - zc);
        if (dz > 2.36 || x < prof.x0 || x > prof.x1) continue;
        if (prof.sink(x) > 0 && prof.crossings.some((xc) => Math.abs(x - xc) < XING_HALF + 0.05)) continue;
        // keep off the sleepers: they stand proud of the stones (track.ts: every 0.65 m, a little irregular)
        if (dz < 1.28) {
          const f = (((x - prof.x0 - 0.35) % 0.65) + 0.65) % 0.65;
          if (f < 0.15 || f > 0.5) continue;
        }
        const t = prof.top(x);
        let y: number;
        if (dz <= 1.62) {
          let a = 0;
          while (a < BED.length - 2 && dz > BED[a + 1][0]) a++;
          const q = (dz - BED[a][0]) / (BED[a + 1][0] - BED[a][0]);
          y = Math.max(0.03, t - RAIL_H + BED[a][1] + (BED[a + 1][1] - BED[a][1]) * q);
        } else {
          const ye = Math.max(0.03, t - BALLAST_DROP);
          y = ye + (-0.02 - ye) * ((dz - 1.62) / 0.78);
        }
        const s = 0.016 + 0.024 * size * size + 0.008 * size;
        // limestone grey, some darker, a few warm; brown from the brakes by the rails
        let g = 0.2 + 0.26 * tone * tone;
        if (warm > 0.92) g *= 0.72;
        const rust = dz > 0.45 && dz < 1.05 ? 0.09 * (1 - Math.abs(dz - 0.75) / 0.3) : 0;
        const r = g * (1 + Math.max(0, rust) * 2.2 + (warm > 0.8 ? 0.06 : 0.015)),
          b = g * (0.96 - Math.max(0, rust) * 2.4);
        out.put(x, y + s * 0.18, z, yaw, s, s, s, (ta - 0.5) * 0.9, (tb - 0.5) * 0.9, r, g, b);
      }
    },
  });
}
