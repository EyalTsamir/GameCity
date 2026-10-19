// Ring topology around the slab, shared by the landscape terrain mesh and the water module's
// sea / river extension.
//
// Ring 0 is the slab boundary itself, vertex for vertex the edge of the terrain module's ground mesh
// (terrain/layout.ts slabEdges) → the two meshes share their seam vertices exactly (no crack).
// Ring k ≥ 1 is the slab rectangle grown by d_k with round corners (a Minkowski "stadium"). The ring
// step grows with the distance (≈1.2 m at the edge, ~4 % per ring further out) and each ring gets as
// many vertices as its length needs; consecutive rings are zipper-stitched by their normalised arc
// length (both start on the north side at x = slab.x0).

import { SLAB } from '../../core/constants';
import type { SlabEdges } from '../terrain/layout';

export interface Ring {
  d: number;
  /** first vertex index */
  start: number;
  n: number;
  /** normalised arc-length parameter of each vertex (0..1) */
  u: Float64Array;
}

export interface RingTopology {
  rings: Ring[];
  /** vertex x / z */
  x: Float64Array;
  z: Float64Array;
  /** triangles (3 indices each); triangles between ring k and k+1 start at triStart[k] */
  tris: Uint32Array;
  triStart: number[];
  count: number;
}

/** step between ring k and k+1 at offset d */
export function ringStep(d: number): number {
  return Math.min(900, Math.max(1.6, 1.15 + 0.041 * d + 2e-7 * d * d));
}

/** tangential vertex spacing target at offset d */
function tangential(d: number, scale: number): number {
  return Math.max(2.1 * scale, 1.0 * scale * ringStep(d));
}

/** slab edges sampled uniformly every `step` m (the water module's surface grid boundary) */
export function uniformEdges(step: number): SlabEdges {
  const run = (a: number, b: number) => {
    const n = Math.round((b - a) / step);
    const u: number[] = [];
    for (let i = 0; i <= n; i++) u.push(a + ((b - a) * i) / n);
    return { u, h: u.map(() => 0) };
  };
  return { north: run(SLAB.x0, SLAB.x1), south: run(SLAB.x0, SLAB.x1), west: run(SLAB.z0, SLAB.z1), east: run(SLAB.z0, SLAB.z1) };
}

const W = SLAB.x1 - SLAB.x0;
const H = SLAB.z1 - SLAB.z0;

/** point at normalised arc length u on the stadium ring at offset d (d > 0) */
function stadium(d: number, u: number, out: [number, number]): void {
  const arc = (Math.PI / 2) * d;
  const P = 2 * (W + H) + 4 * arc;
  let s = (((u % 1) + 1) % 1) * P;
  const { x0, x1, z0, z1 } = SLAB;
  // north side (west → east)
  if (s < W) return void ((out[0] = x0 + s), (out[1] = z0 - d));
  s -= W;
  if (s < arc) {
    const a = s / d;
    return void ((out[0] = x1 + d * Math.sin(a)), (out[1] = z0 - d * Math.cos(a)));
  }
  s -= arc;
  if (s < H) return void ((out[0] = x1 + d), (out[1] = z0 + s));
  s -= H;
  if (s < arc) {
    const a = s / d;
    return void ((out[0] = x1 + d * Math.cos(a)), (out[1] = z1 + d * Math.sin(a)));
  }
  s -= arc;
  if (s < W) return void ((out[0] = x1 - s), (out[1] = z1 + d));
  s -= W;
  if (s < arc) {
    const a = s / d;
    return void ((out[0] = x0 - d * Math.sin(a)), (out[1] = z1 + d * Math.cos(a)));
  }
  s -= arc;
  if (s < H) return void ((out[0] = x0 - d), (out[1] = z1 - s));
  s -= H;
  const a = Math.min(s / d, Math.PI / 2);
  out[0] = x0 - d * Math.cos(a);
  out[1] = z0 - d * Math.sin(a);
}

export function buildRings(edges: SlabEdges, maxD: number, tangentialScale = 1): RingTopology {
  const { x0, x1, z0, z1 } = SLAB;
  // ── ring 0: the slab boundary, clockwise seen from above (north side first, west → east)
  const r0x: number[] = [],
    r0z: number[] = [];
  const push = (x: number, z: number) => {
    const n = r0x.length;
    if (n > 0 && Math.abs(r0x[n - 1] - x) < 1e-4 && Math.abs(r0z[n - 1] - z) < 1e-4) return;
    r0x.push(x);
    r0z.push(z);
  };
  for (const u of edges.north.u) push(u, z0);
  for (const u of edges.east.u) push(x1, u);
  for (let i = edges.south.u.length - 1; i >= 0; i--) push(edges.south.u[i], z1);
  for (let i = edges.west.u.length - 1; i >= 0; i--) push(x0, edges.west.u[i]);
  // closing duplicate of the start corner
  if (Math.abs(r0x[r0x.length - 1] - r0x[0]) < 1e-4 && Math.abs(r0z[r0z.length - 1] - r0z[0]) < 1e-4) {
    r0x.pop();
    r0z.pop();
  }
  const P0 = 2 * (W + H);
  const xs: number[] = [...r0x],
    zs: number[] = [...r0z];
  const rings: Ring[] = [];
  {
    const u = new Float64Array(r0x.length);
    let s = 0;
    for (let i = 1; i < r0x.length; i++) {
      s += Math.hypot(r0x[i] - r0x[i - 1], r0z[i] - r0z[i - 1]);
      u[i] = s / P0;
    }
    rings.push({ d: 0, start: 0, n: r0x.length, u });
  }
  // ── rings 1..K
  let d = 0;
  const pt: [number, number] = [0, 0];
  while (d < maxD) {
    d = Math.min(maxD, d + ringStep(d));
    const P = 2 * (W + H) + 2 * Math.PI * d;
    const n = Math.max(96, Math.round(P / tangential(d, tangentialScale)));
    const u = new Float64Array(n);
    const start = xs.length;
    for (let i = 0; i < n; i++) {
      u[i] = i / n;
      stadium(d, u[i], pt);
      xs.push(pt[0]);
      zs.push(pt[1]);
    }
    rings.push({ d, start, n, u });
  }
  // ── zipper stitching
  const tris: number[] = [];
  const triStart: number[] = [];
  for (let k = 0; k < rings.length - 1; k++) {
    triStart.push(tris.length / 3);
    const A = rings[k],
      B = rings[k + 1];
    let i = 0,
      j = 0;
    while (i < A.n || j < B.n) {
      const ua = i + 1 < A.n ? A.u[i + 1] : 1 + (i + 1 - A.n);
      const ub = j + 1 < B.n ? B.u[j + 1] : 1 + (j + 1 - B.n);
      const a0 = A.start + (i % A.n),
        b0 = B.start + (j % B.n);
      if (i < A.n && (j >= B.n || ua <= ub)) {
        const a1 = A.start + ((i + 1) % A.n);
        tris.push(a0, a1, b0);
        i++;
      } else {
        const b1 = B.start + ((j + 1) % B.n);
        tris.push(a0, b1, b0);
        j++;
      }
    }
  }
  triStart.push(tris.length / 3);
  return {
    rings,
    x: Float64Array.from(xs),
    z: Float64Array.from(zs),
    tris: Uint32Array.from(tris),
    triStart,
    count: xs.length,
  };
}
