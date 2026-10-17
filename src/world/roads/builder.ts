// Minimal indexed-geometry accumulator for the roads module: positions, normals and a set of
// custom float attributes whose "current" values are stamped onto every new vertex.

import * as THREE from 'three';
import type { P2 } from '../../core/geom';

export interface AttrSpec {
  name: string;
  size: number;
}

export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly idx: number[] = [];
  private readonly specs: AttrSpec[];
  private readonly data: number[][];
  private readonly cur: number[][];
  private readonly slot = new Map<string, number>();

  constructor(specs: AttrSpec[]) {
    this.specs = specs;
    this.data = specs.map(() => []);
    this.cur = specs.map((s) => new Array<number>(s.size).fill(0));
    specs.forEach((s, i) => this.slot.set(s.name, i));
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  /** Set the current value of a custom attribute (applies to vertices added afterwards). */
  set(name: string, a: number, b = 0, c = 0, d = 0): this {
    const k = this.slot.get(name);
    if (k === undefined) throw new Error(`MeshBuilder: unknown attribute ${name}`);
    const v = this.cur[k];
    v[0] = a;
    if (v.length > 1) v[1] = b;
    if (v.length > 2) v[2] = c;
    if (v.length > 3) v[3] = d;
    return this;
  }

  v(x: number, y: number, z: number, nx = 0, ny = 1, nz = 0): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    for (let k = 0; k < this.specs.length; k++) {
      const c = this.cur[k],
        d = this.data[k];
      for (let i = 0; i < c.length; i++) d.push(c[i]);
    }
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Triangle wound so that its front face points up (+y), whatever the input order. */
  triUp(a: number, b: number, c: number): void {
    const p = this.pos;
    const ax = p[a * 3],
      az = p[a * 3 + 2];
    const cy = (p[b * 3 + 2] - az) * (p[c * 3] - ax) - (p[b * 3] - ax) * (p[c * 3 + 2] - az);
    if (cy >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  /** Quad a-b-c-d wound so its front face points along (nx, ny, nz). */
  quadFacing(a: number, b: number, c: number, d: number, nx: number, ny: number, nz: number): void {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3],
      uy = p[b * 3 + 1] - p[a * 3 + 1],
      uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3],
      vy = p[c * 3 + 1] - p[a * 3 + 1],
      vz = p[c * 3 + 2] - p[a * 3 + 2];
    const cx = uy * vz - uz * vy,
      cy = uz * vx - ux * vz,
      cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz >= 0) this.idx.push(a, b, c, a, c, d);
    else this.idx.push(a, c, b, a, d, c);
  }

  /** Horizontal quad facing up. */
  quadUp(a: number, b: number, c: number, d: number): void {
    this.quadFacing(a, b, c, d, 0, 1, 0);
  }

  /** Flat horizontal polygon (any orientation, simple, no holes) at height y(x, z). */
  polygon(pts: readonly P2[], y: number | ((x: number, z: number) => number)): void {
    const clean = dedupe(pts);
    if (clean.length < 3) return;
    const contour = clean.map((p) => new THREE.Vector2(p.x, p.z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const base = this.vertexCount;
    for (const p of clean) this.v(p.x, typeof y === 'number' ? y : y(p.x, p.z), p.z);
    for (const f of faces) this.triUp(base + f[0], base + f[1], base + f[2]);
  }

  /** Axis-aligned horizontal rectangle. */
  rect(x0: number, z0: number, x1: number, z1: number, y: number): void {
    const a = this.v(x0, y, z0),
      b = this.v(x1, y, z0),
      c = this.v(x1, y, z1),
      d = this.v(x0, y, z1);
    this.quadUp(a, b, c, d);
  }

  /** Vertical wall between two ground points (a -> b), from y0 to y1, facing (nx, nz). */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, nx: number, nz: number): void {
    const a = this.v(ax, y0, az, nx, 0, nz),
      b = this.v(bx, y0, bz, nx, 0, nz),
      c = this.v(bx, y1, bz, nx, 0, nz),
      d = this.v(ax, y1, az, nx, 0, nz);
    this.quadFacing(a, b, c, d, nx, 0, nz);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    this.specs.forEach((s, k) => g.setAttribute(s.name, new THREE.BufferAttribute(new Float32Array(this.data[k]), s.size)));
    const n = this.vertexCount;
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Remove consecutive duplicates (and a closing duplicate). */
export function dedupe(pts: readonly P2[], eps = 1e-4): P2[] {
  const out: P2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < eps && Math.abs(q.z - p.z) < eps) continue;
    out.push(p);
  }
  while (out.length > 2) {
    const a = out[0],
      b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps) out.pop();
    else break;
  }
  return out;
}
