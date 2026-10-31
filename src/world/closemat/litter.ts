// What really lies on a town's ground, in place of the flat ovals and paper squares the road shaders used to paint (they read
// as stickers from a metre): curled leaves, crumpled scraps, cigarette ends, bottle caps. Gathers along kerbs and at the foot
// of walls, thin elsewhere. Instanced, inside the bubble only. `?nocmlitter` brings the painted ones back.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import { SIDEWALK_Y } from '../../core/constants';
import { nearGrow, nearOf, nearRandom, type NearCell, type NearEmit } from '../../core/nearDetail';
import { patchLampMaterial } from '../lamps/integrate';

/** a leaf one unit long: a spine that arches, two blades that droop, a stalk */
function leafGeometry(): THREE.BufferGeometry {
  const P: number[] = [];
  const N = 5;
  const ring = (i: number): [number[], number[], number[]] => {
    const t = i / N;
    const z = t - 0.5;
    const w = 0.34 * Math.sin(Math.PI * Math.pow(t, 0.8));
    const arch = 0.1 * Math.sin(Math.PI * t) + 0.09 * t * t;
    return [[-w, arch - 0.06 - 0.1 * t, z], [0, arch, z], [w, arch - 0.03 + 0.05 * t, z]];
  };
  for (let i = 0; i < N; i++) {
    const a = ring(i),
      b = ring(i + 1);
    P.push(...a[0], ...b[0], ...b[1], ...a[0], ...b[1], ...a[1]);
    P.push(...a[1], ...b[1], ...b[2], ...a[1], ...b[2], ...a[2]);
  }
  // the stalk
  P.push(-0.02, 0.0, 0.5, 0.02, 0.0, 0.5, 0.0, 0.03, 0.72);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

/** a crumpled scrap, flat on the ground */
function scrapGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
    const k = 0.72 + 0.5 * h;
    p.setXYZ(i, x * k, Math.max(y, -0.15) * k * 0.42 + 0.06, z * k);
  }
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  return f;
}

/** a short tube, closed at the ends (cigarette ends lying down; a disc when squat: a bottle cap) */
function tubeGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1, 7, 1);
  g.rotateX(Math.PI / 2);
  return g;
}

export function addLitter(ctx: CityContext): void {
  const near = nearOf(ctx);
  const occ = ctx.occupancy;
  const terrain = ctx.services.terrain as { height(x: number, z: number): number } | undefined;
  if (!terrain) return;
  const { x0: sx0, x1: sx1, z0: sz0, z1: sz1 } = ctx.plan.slab;
  const skip = OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.RAIL;

  /** how much litter wants to lie here, and on what surface height */
  const where = (x: number, z: number): { want: number; y: number } | null => {
    const f = occ.get(x, z);
    if (f & skip) return null;
    if (f & OCC.ROAD) return { want: occ.anyInCircle(x, z, 0.7, OCC.SIDEWALK) ? 1 : 0.05, y: 0.012 };
    if (f & OCC.SIDEWALK) return { want: occ.anyInCircle(x, z, 0.6, OCC.BUILDING) ? 0.7 : 0.12, y: SIDEWALK_Y };
    if (f & OCC.PAVED) return { want: 0.14, y: terrain.height(x, z) };
    return null;
  };

  const fill = (c: NearCell, out: NearEmit, tries: number, emit: (x: number, y: number, z: number, r: () => number, out: NearEmit) => void) => {
    if (c.x1 < sx0 || c.x0 > sx1 || c.z1 < sz0 || c.z0 > sz1) return;
    const rnd = nearRandom(c.seed);
    for (let k = 0; k < tries; k++) {
      const x = c.x0 + rnd() * (c.x1 - c.x0),
        z = c.z0 + rnd() * (c.z1 - c.z0),
        pick = rnd();
      const w = where(x, z);
      if (w && pick < w.want) emit(x, w.y, z, rnd, out);
    }
  };

  const lit = (radius: number, double: boolean): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, side: double ? THREE.DoubleSide : THREE.FrontSide });
    patchLampMaterial(m);
    nearGrow(m, radius);
    return m;
  };

  const LEAF_R = 15;
  near.addScatter({
    name: 'cmLeaves',
    radius: LEAF_R,
    cell: 6,
    top: 2.5,
    geometry: leafGeometry(),
    material: lit(LEAF_R, true),
    capacity: 1400,
    perCell: 70,
    colors: true,
    fill: (c, out) =>
      fill(c, out, 26, (x, y, z, r, o) => {
        const s = 0.045 + 0.05 * r();
        const a = r(),
          b = r(),
          l = 0.55 + 0.6 * r();
        // browns and ochres of last year, a few still yellow, a few dark with rain
        let cr = 0.23,
          cg = 0.12,
          cb = 0.045;
        if (a > 0.74) {
          cr = 0.42;
          cg = 0.27;
          cb = 0.06;
        } else if (a > 0.5) {
          cr = 0.3;
          cg = 0.15;
          cb = 0.05;
        } else if (a < 0.14) {
          cr = 0.09;
          cg = 0.065;
          cb = 0.04;
        }
        o.put(x, y + s * 0.09, z, r() * 6.283, s, s * (0.5 + 0.9 * b), s, (r() - 0.5) * 0.35, (r() - 0.5) * 0.35, cr * l, cg * l, cb * l);
      }),
  });

  const SCRAP_R = 12;
  near.addScatter({
    name: 'cmScraps',
    radius: SCRAP_R,
    cell: 6,
    top: 2.5,
    geometry: scrapGeometry(),
    material: lit(SCRAP_R, false),
    capacity: 200,
    perCell: 10,
    colors: true,
    fill: (c, out) =>
      fill(c, out, 3, (x, y, z, r, o) => {
        const s = 0.012 + 0.02 * r();
        const a = r();
        const l = 0.55 + 0.35 * r();
        const pale = a < 0.7;
        o.put(x, y + s * 0.1, z, r() * 6.283, s * (1 + r()), s, s * (1 + r()), 0, 0, (pale ? 0.72 : a < 0.85 ? 0.5 : 0.12) * l, (pale ? 0.7 : a < 0.85 ? 0.13 : 0.2) * l, (pale ? 0.64 : a < 0.85 ? 0.1 : 0.4) * l);
      }),
  });

  const END_R = 8;
  near.addScatter({
    name: 'cmEnds',
    radius: END_R,
    cell: 4,
    top: 2.2,
    geometry: tubeGeometry(),
    material: lit(END_R, false),
    capacity: 160,
    perCell: 14,
    colors: true,
    fill: (c, out) =>
      fill(c, out, 5, (x, y, z, r, o) => {
        const cap = r() < 0.2;
        const ry = 0.0038;
        if (cap) {
          const t = r();
          o.put(x, y + 0.0025, z, r() * 6.283, 0.013, 0.013, 0.005, Math.PI / 2, 0, t < 0.5 ? 0.5 : 0.6, t < 0.5 ? 0.5 : 0.08, t < 0.5 ? 0.48 : 0.06);
        } else {
          // filter end: stained white or cork; the tube lies down
          const cork = r() < 0.5;
          o.put(x, y + ry, z, r() * 6.283, ry, ry, 0.012 + 0.012 * r(), 0, 0, cork ? 0.6 : 0.62, cork ? 0.38 : 0.6, cork ? 0.17 : 0.52);
        }
      }),
  });
}
