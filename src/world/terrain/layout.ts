// Ground mesh layout: the slab is split into E-W bands, each a rectilinear grid with its
// own column spacing (fine near portals, spurs, cliffs, the pond and the shore; coarse in
// the flat city). Consecutive bands are joined by "zipper" strips, so the mesh is crack-free.
// Vertical drops (quay walls, portal wall lines) are represented by doubled grid lines 2 cm
// apart that sit inside the wall bodies.
//
// Shared by the terrain (ground + soil faces) and the water module (cut-away faces must sit
// exactly on the same edge vertices).

import { SLAB } from '../../core/constants';
import { RIDGE_FOOT_Z } from '../../core/plan';
import type { TerrainModel } from './height';

export interface Band {
  zs: number[];
  xs: number[];
}

/** sorted, de-duplicated coordinates from [from, to, step] runs plus extra values */
export function axis(runs: [number, number, number][], extra: number[] = []): number[] {
  const out: number[] = [];
  for (const [a, b, step] of runs) {
    const n = Math.max(1, Math.round((b - a) / step));
    for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  }
  out.push(...extra);
  out.sort((p, q) => p - q);
  const res: number[] = [];
  for (const v of out) if (res.length === 0 || v - res[res.length - 1] > 1e-3) res.push(v);
  return res;
}

export function groundBands(model: TerrainModel): Band[] {
  const X0 = SLAB.x0,
    X1 = SLAB.x1;
  const road = model.portals.filter((p) => p.kind === 'road').map((p) => p.x);
  const railRamps: number[] = [];
  for (const p of model.portals) {
    if (p.kind !== 'rail') continue;
    // facade wall line ramp (front at x' >= -thick/2)
    const rx = p.x + p.sin * (-p.thick / 2);
    railRamps.push(rx - 0.01, rx + 0.01);
  }
  const roadRampZ = RIDGE_FOOT_Z - 1 - 0.6; // portal z - thick/2
  const seaRamp = [135.69, 135.71];
  const rw = road[0] ?? -110,
    re = road[1] ?? 55;
  const lo = Math.min(rw, re),
    hi = Math.max(rw, re);

  const bands: Band[] = [];
  // B1: back of the ridge
  bands.push({
    zs: axis([[SLAB.z0, -176, 1]]),
    xs: axis([
      [X0, 128, 2],
      [128, 141, 0.5],
      [141, X1, 4],
    ]),
  });
  // B2: ridge foot escarpment, road portals, spur corners
  bands.push({
    zs: axis(
      [
        [-175.5, -167, 0.5],
        [-167, -163.5, 0.25],
      ],
      [roadRampZ - 0.01, roadRampZ + 0.01],
    ),
    xs: axis(
      [
        [X0, -186, 1.5],
        [-186, -179, 0.35],
        [-179, lo - 25, 1.5],
        [lo - 25, lo + 25, 0.5],
        [lo + 25, hi - 25, 1.5],
        [hi - 25, hi + 25, 0.5],
        [hi + 25, 108, 1.5],
        [108, 117, 0.35],
        [117, 128, 1],
        [128, 141, 0.4],
        [141, X1, 4],
      ],
      railRamps,
    ),
  });
  // B3: rail portals, spur cuts, flat strip in between
  bands.push({
    zs: axis([
      [-163.25, -160, 0.25],
      [-160, -137, 0.5],
    ]),
    xs: axis(
      [
        [X0, -192, 1],
        [-192, -166, 0.4],
        [-166, 104, 6],
        [104, 119, 0.4],
        [119, 133, 1],
        [133, 141, 0.4],
        [141, X1, 4],
      ],
      [...railRamps, ...seaRamp],
    ),
  });
  // B4a: north city + harbour quay + sea wall, down to the beach blend
  const cityCols = (ramps: boolean): number[] =>
    axis(
      ramps
        ? [
            [X0, 112, 8],
            [112, 135.69, 2],
            [135.71, 150, 2],
            [150, X1, 5],
          ]
        : [
            [X0, 112, 8],
            [112, 150, 2],
            [150, X1, 5],
          ],
    );
  bands.push({
    zs: axis([
      [-136.5, -6.5, 6.5],
      [-6, 6, 0.75],
    ]),
    xs: cityCols(true),
  });
  // B4b: pond rows
  const pond = model.pond;
  const px0 = pond ? Math.floor(pond.cx - pond.rx * 1.25) : -96,
    px1 = pond ? Math.ceil(pond.cx + pond.rx * 1.25) : -60;
  const pz0 = pond ? pond.cz - pond.rz * 1.3 : 6,
    pz1 = pond ? pond.cz + pond.rz * 1.3 : 29;
  bands.push({
    zs: axis([[Math.max(6.5, pz0), Math.min(105, pz1), 0.5]]),
    xs: axis([
      [X0, px0, 8],
      [px0, px1, 0.5],
      [px1, 112, 8],
      [112, 150, 2],
      [150, X1, 5],
    ]),
  });
  // B4c: south city
  bands.push({ zs: axis([[Math.min(105, pz1) + 0.5, 106, 6.4]]), xs: cityCols(false) });
  // B5: promenade, river walls, river mouth, south bank
  bands.push({
    zs: axis(
      [
        [106.5, 109.5, 1.5],
        [110, 113, 0.5],
        [113, 123, 2],
        [123, 126, 0.5],
        [126.6, 129, 0.6],
        [129, SLAB.z1, 3],
      ],
      [109.74, 109.76, 126.24, 126.26],
    ),
    xs: axis([
      [X0, 112, 8],
      [112, 128, 1],
      [128, 150, 2],
      [150, X1, 5],
    ]),
  });
  return bands;
}

export interface EdgeProfile {
  /** coordinate along the edge (x for N/S edges, z for E/W edges), ascending */
  u: number[];
  /** refined terrain height at each u (without GROUND_DROP) */
  h: number[];
}

export interface SlabEdges {
  north: EdgeProfile;
  south: EdgeProfile;
  west: EdgeProfile;
  east: EdgeProfile;
}

export function slabEdges(model: TerrainModel, bands: Band[]): SlabEdges {
  const first = bands[0],
    last = bands[bands.length - 1];
  const north: EdgeProfile = { u: first.xs.slice(), h: first.xs.map((x) => model.height(x, SLAB.z0)) };
  const south: EdgeProfile = { u: last.xs.slice(), h: last.xs.map((x) => model.height(x, SLAB.z1)) };
  const zs: number[] = [];
  for (const b of bands) zs.push(...b.zs);
  const west: EdgeProfile = { u: zs.slice(), h: zs.map((z) => model.height(SLAB.x0, z)) };
  const east: EdgeProfile = { u: zs.slice(), h: zs.map((z) => model.height(SLAB.x1, z)) };
  return { north, south, west, east };
}
