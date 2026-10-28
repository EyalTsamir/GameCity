// Smooth sculpted surfaces for landmark figures and cloth: parametric grids (lathe-like bodies with
// folds, deformed spheres, tapered capsules) and thin shells with real thickness (open coat skirts,
// hanging tablecloths). All return indexed geometries with smooth normals; `paint` adds vertex colours.

import * as THREE from 'three';

export type SurfFn = (u: number, v: number, out: THREE.Vector3) => void;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/** Grid surface over u, v ∈ [0, 1] (nu × nv quads). closeU wraps u (seam shared). Outward = du × dv. */
export function surface(nu: number, nv: number, fn: SurfFn, closeU = false): THREE.BufferGeometry {
  const cols = closeU ? nu : nu + 1;
  const pos = new Float32Array(cols * (nv + 1) * 3);
  for (let j = 0, k = 0; j <= nv; j++)
    for (let i = 0; i < cols; i++, k += 3) {
      fn(i / nu, j / nv, _a);
      pos[k] = _a.x;
      pos[k + 1] = _a.y;
      pos[k + 2] = _a.z;
    }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const i1 = closeU ? (i + 1) % cols : i + 1;
      const a = j * cols + i, b = j * cols + i1, c = (j + 1) * cols + i, d = (j + 1) * cols + i1;
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A thin shell of thickness `thick` behind the surface fn (outer side = du × dv): outer + inner skins and
 * the rim strips round the open edges (all four, or v-edges only when closeU). Returns the parts.
 */
export function shell(nu: number, nv: number, fn: SurfFn, thick: number, closeU = false): THREE.BufferGeometry[] {
  const outer = surface(nu, nv, fn, closeU);
  const P = outer.getAttribute('position') as THREE.BufferAttribute;
  const N = outer.getAttribute('normal') as THREE.BufferAttribute;
  const inner = outer.clone();
  const IP = inner.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < IP.count; i++) IP.setXYZ(i, P.getX(i) - N.getX(i) * thick, P.getY(i) - N.getY(i) * thick, P.getZ(i) - N.getZ(i) * thick);
  const ix = inner.getIndex()!.array as Uint16Array | Uint32Array;
  const flipped: number[] = [];
  for (let t = 0; t < ix.length; t += 3) flipped.push(ix[t], ix[t + 2], ix[t + 1]);
  inner.setIndex(flipped);
  inner.computeVertexNormals();
  // rims: double-sided strips (both windings) between matching outer / inner boundary vertices
  const cols = closeU ? nu : nu + 1;
  const rim: number[] = [];
  const edge = (ids: number[]) => {
    for (let e = 0; e + 1 < ids.length; e++) {
      const a = ids[e], b = ids[e + 1];
      const q = [P.getX(a), P.getY(a), P.getZ(a), P.getX(b), P.getY(b), P.getZ(b), IP.getX(b), IP.getY(b), IP.getZ(b), IP.getX(a), IP.getY(a), IP.getZ(a)];
      rim.push(...q.slice(0, 3), ...q.slice(3, 6), ...q.slice(6, 9), ...q.slice(0, 3), ...q.slice(6, 9), ...q.slice(9, 12));
      rim.push(...q.slice(0, 3), ...q.slice(6, 9), ...q.slice(3, 6), ...q.slice(0, 3), ...q.slice(9, 12), ...q.slice(6, 9));
    }
  };
  const row = (j: number) => {
    const r: number[] = [];
    for (let i = 0; i < cols; i++) r.push(j * cols + i);
    if (closeU) r.push(j * cols);
    return r;
  };
  edge(row(0));
  edge(row(nv));
  if (!closeU) {
    const c0: number[] = [], c1: number[] = [];
    for (let j = 0; j <= nv; j++) {
      c0.push(j * cols);
      c1.push(j * cols + nu);
    }
    edge(c0);
    edge(c1);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
  rg.computeVertexNormals();
  return [outer, inner, rg];
}

/** Lathe-like body: radius table r(y) (y ascending), cross-section a superellipse (power n) squashed by kz. */
export function body(table: [number, number][], kz: number, nu: number, nv: number, n = 2, bump?: (th: number, y: number) => number): THREE.BufferGeometry {
  const y0 = table[0][1], y1 = table[table.length - 1][1];
  return surface(nu, nv, (u, v, o) => {
    const y = y0 + (y1 - y0) * v;
    let r = table[0][0];
    for (let i = 1; i < table.length; i++)
      if (y <= table[i][1]) {
        const [ra, ya] = table[i - 1], [rb, yb] = table[i];
        const t = (y - ya) / Math.max(1e-6, yb - ya);
        r = ra + (rb - ra) * (t * t * (3 - 2 * t));
        break;
      }
    const th = u * Math.PI * 2;
    const s = Math.sin(th), c = Math.cos(th);
    const e = 2 / n;
    const rr = r + (bump ? bump(th, y) : 0);
    o.set(Math.sign(s) * Math.pow(Math.abs(s), e) * rr, y, Math.sign(c) * Math.pow(Math.abs(c), e) * rr * kz);
  }, true);
}

/** Ellipsoid (radii rx, ry, rz) whose unit-sphere points are first reshaped by `deform` (in place). */
export function blob(rx: number, ry: number, rz: number, ws = 16, hs = 12, deform?: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    _a.fromBufferAttribute(P, i);
    if (deform) deform(_a);
    P.setXYZ(i, _a.x * rx, _a.y * ry, _a.z * rz);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Tapered capsule from a (radius ra) to b (radius rb). */
export function capsule(a: THREE.Vector3Like, b: THREE.Vector3Like, ra: number, rb: number, radial = 12): THREE.BufferGeometry {
  _b.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = _b.length();
  const r = Math.max(ra, rb);
  const g = new THREE.CapsuleGeometry(r, len, 4, radial);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    const t = Math.min(1, Math.max(0, (y + len / 2) / len));
    const k = (ra + (rb - ra) * t) / r;
    // the end caps take the radius of their own end
    const yy = y < -len / 2 ? -len / 2 + (y + len / 2) * (ra / r) : y > len / 2 ? len / 2 + (y - len / 2) * (rb / r) : y;
    P.setXYZ(i, P.getX(i) * k, yy + len / 2, P.getZ(i) * k);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  _q.setFromUnitVectors(_up, _b.normalize());
  _m.makeRotationFromQuaternion(_q).setPosition(a.x, a.y, a.z);
  g.applyMatrix4(_m);
  return g;
}

/** Vertex colours from position + normal (geometry space). */
export function paint(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void): THREE.BufferGeometry {
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const N = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    _a.fromBufferAttribute(P, i);
    _n.fromBufferAttribute(N, i);
    _c.setRGB(1, 1, 1);
    fn(_a, _n, _c);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Cheap deterministic hash → [0, 1). */
export function hash1(x: number): number {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
