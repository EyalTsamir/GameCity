// Shape helpers on top of MeshBuilder: boxes, cylinders, beams between points,
// lathes, planar polygons with metric UVs, sloped roof faces, arch shapes.
// All coordinates are LANDMARK-LOCAL (the builder's frame maps them to world).

import * as THREE from 'three';
import { MeshBuilder, Mat, UvMode } from './builder';

export type V3 = [number, number, number];

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3();

// shared unit primitives (cloned per use only where needed)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map<string, THREE.BufferGeometry>();

function cylGeo(rTop: number, rBot: number, seg: number, open: boolean, t0: number, tl: number, hs = 1): THREE.BufferGeometry {
  const key = `${rTop.toFixed(4)}|${rBot.toFixed(4)}|${seg}|${open ? 1 : 0}|${t0.toFixed(3)}|${tl.toFixed(3)}|${hs}`;
  let g = cylCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBot, 1, seg, hs, open, t0, tl);
    g.translate(0, 0.5, 0);
    if (cylCache.size > 400) cylCache.clear();
    cylCache.set(key, g);
  }
  return g;
}

export class Kit {
  constructor(public b: MeshBuilder) {}

  /** Axis-aligned (optionally yawed) box, base at y. */
  box(m: Mat, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, uv: UvMode = 'box'): void {
    if (w <= 0 || h <= 0 || d <= 0) return;
    // scale via a dedicated geometry so 'box' UVs stay metric
    const g = new THREE.BoxGeometry(w, h, d);
    _m.makeRotationY(ry).setPosition(x, y + h / 2, z);
    this.b.add(g, m, _m, uv);
    g.dispose();
  }

  /** Interior filler volume: a box WITHOUT top and bottom faces (they always sit under a roof
   *  / on the ground). Emit it after the walls so its sides are depth-rejected (no overdraw). */
  coreBox(m: Mat, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): void {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const g = new THREE.BoxGeometry(w, h, d);
    const idx = g.getIndex()!;
    const keep: number[] = [];
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z (6 indices each)
    for (let i = 0; i < idx.count; i++) {
      const face = Math.floor(i / 6);
      if (face === 2 || face === 3) continue;
      keep.push(idx.getX(i));
    }
    g.setIndex(keep);
    _m.makeRotationY(ry).setPosition(x, y + h / 2, z);
    this.b.add(g, m, _m, 'box');
    g.dispose();
  }

  /** Box with full euler rotation (radians, order YXZ), centred at (x, y, z). */
  boxC(m: Mat, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, uv: UvMode = 'box'): void {
    const g = new THREE.BoxGeometry(w, h, d);
    _e.set(rx, ry, rz, 'YXZ');
    _m.makeRotationFromEuler(_e).setPosition(x, y, z);
    this.b.add(g, m, _m, uv);
    g.dispose();
  }

  /** Square-section beam from a to b (w across, d deep; d defaults to w). */
  beam(m: Mat, a: V3, b: V3, w: number, d = w, roll = 0): void {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    _d.subVectors(_b, _a);
    const len = _d.length();
    if (len < 1e-4) return;
    _d.divideScalar(len);
    // orient local +Y along the beam
    _q.setFromUnitVectors(_up, _d);
    if (roll) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, roll));
    const g = new THREE.BoxGeometry(w, len, d);
    _m.compose(_s.copy(_a).add(_b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
    this.b.add(g, m, _m, 'box');
    g.dispose();
  }

  /** Round rod from a to b. */
  rod(m: Mat, a: V3, b: V3, r: number, seg = 6, uv: UvMode = 'cyl'): void {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    _d.subVectors(_b, _a);
    const len = _d.length();
    if (len < 1e-4) return;
    _d.divideScalar(len);
    _q.setFromUnitVectors(_up, _d);
    _m.compose(_a, _q, _s.set(1, len, 1));
    // scaled unit cylinder: keep v metric by passing sv = len (prim y is 0..1)
    const g = cylGeo(r, r, seg, true, 0, Math.PI * 2);
    this.b.add(g, m, _m, uv === 'cyl' ? 'native' : uv, 2 * Math.PI * r, len);
  }

  /** Cylinder / frustum standing on y (base) with height h. */
  cyl(m: Mat, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 12, open = false, uv: UvMode = 'cyl', t0 = 0, tl = Math.PI * 2, ry = 0): void {
    if (h <= 0) return;
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open, t0, tl);
    g.translate(0, h / 2, 0);
    _m.makeRotationY(ry).setPosition(x, y, z);
    this.b.add(g, m, _m, uv, 2 * Math.PI * Math.max(rTop, rBot) * (tl / (Math.PI * 2)), 1);
    g.dispose();
  }

  /** Horizontal cylinder (axis along local X after yaw ry), centred at (x, y, z). */
  cylX(m: Mat, r: number, len: number, x: number, y: number, z: number, seg = 10, ry = 0, open = false): void {
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
    _e.set(0, ry, Math.PI / 2, 'YXZ');
    _m.makeRotationFromEuler(_e).setPosition(x, y, z);
    this.b.add(g, m, _m, 'native', 2 * Math.PI * r, len);
    g.dispose();
  }

  /** Disc / short cylinder whose axis points along the facing direction ry (centre at x,y,z). */
  disc(m: Mat, r: number, t: number, x: number, y: number, z: number, ry = 0, seg = 24, r2 = r): void {
    const g = new THREE.CylinderGeometry(r, r2, t, seg, 1, false);
    _e.set(Math.PI / 2, ry, 0, 'YXZ');
    _m.makeRotationFromEuler(_e).setPosition(x, y, z);
    this.b.add(g, m, _m, 'box');
    g.dispose();
  }

  cone(m: Mat, r: number, h: number, x: number, y: number, z: number, seg = 12, ry = 0, open = false): void {
    const g = new THREE.ConeGeometry(r, h, seg, 1, open);
    g.translate(0, h / 2, 0);
    _m.makeRotationY(ry).setPosition(x, y, z);
    this.b.add(g, m, _m, 'cyl', 2 * Math.PI * r, 1);
    g.dispose();
  }

  sphere(m: Mat, r: number, x: number, y: number, z: number, ws = 12, hs = 8, sy = 1, phi0 = 0, phiL = Math.PI * 2, th0 = 0, thL = Math.PI): void {
    const g = new THREE.SphereGeometry(r, ws, hs, phi0, phiL, th0, thL);
    _m.makeScale(1, sy, 1).setPosition(x, y, z);
    this.b.add(g, m, _m, 'box');
    g.dispose();
  }

  /** Lathe from (radius, y) pairs, around +Y at (x, y, z). */
  lathe(m: Mat, pts: [number, number][], x: number, y: number, z: number, seg = 16, phi0 = 0, phiL = Math.PI * 2, uv: UvMode = 'cyl'): void {
    const g = new THREE.LatheGeometry(
      pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 0), h)),
      seg,
      phi0,
      phiL,
    );
    _m.makeTranslation(x, y, z);
    let maxR = 0;
    for (const [r] of pts) maxR = Math.max(maxR, r);
    this.b.add(g, m, _m, uv, 2 * Math.PI * maxR, 1);
    g.dispose();
  }

  torus(m: Mat, R: number, r: number, x: number, y: number, z: number, rs = 6, ts = 24, arc = Math.PI * 2, rx = Math.PI / 2, ry = 0, rz = 0): void {
    const g = new THREE.TorusGeometry(R, r, rs, ts, arc);
    _e.set(rx, ry, rz, 'YXZ');
    _m.makeRotationFromEuler(_e).setPosition(x, y, z);
    this.b.add(g, m, _m, 'box');
    g.dispose();
  }

  /** Any geometry with a local transform (geometry is NOT disposed). */
  geo(m: Mat, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0, uv: UvMode = 'box', su = 1, sv = 1, rx = 0, rz = 0, s = 1): void {
    _e.set(rx, ry, rz, 'YXZ');
    _m.makeRotationFromEuler(_e);
    if (s !== 1) _m.multiply(_m2.makeScale(s, s, s));
    _m.setPosition(x, y, z);
    this.b.add(g, m, _m, uv, su, sv);
  }

  /** Geometry with an explicit matrix (NOT disposed). */
  geoM(m: Mat, g: THREE.BufferGeometry, mat: THREE.Matrix4, uv: UvMode = 'box', su = 1, sv = 1): void {
    this.b.add(g, m, mat, uv, su, sv);
  }

  /**
   * Planar convex polygon (fan triangulated) with a flat normal. UVs: u along the
   * direction p0→p1 from p0, v perpendicular in-plane (metres), unless `uvs` given.
   * Points must be counter-clockwise when seen from the front.
   */
  poly(m: Mat, pts: V3[], uvs?: [number, number][], twoSided = false): void {
    const n = pts.length;
    if (n < 3) return;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const p0 = new THREE.Vector3(...pts[0]);
    const p1 = new THREE.Vector3(...pts[1]);
    const p2 = new THREE.Vector3(...pts[2]);
    const ex = new THREE.Vector3().subVectors(p1, p0).normalize();
    const nn = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
    // robust normal for fans whose first triangle is degenerate
    if (nn.lengthSq() < 0.5) {
      nn.set(0, 0, 0);
      for (let i = 1; i < n - 1; i++) {
        const a = new THREE.Vector3(...pts[i]).sub(p0);
        const c = new THREE.Vector3(...pts[i + 1]).sub(p0);
        nn.add(a.cross(c));
      }
      nn.normalize();
    }
    const ey = new THREE.Vector3().crossVectors(nn, ex).normalize();
    const t = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      pos.set(pts[i], i * 3);
      nrm.set([nn.x, nn.y, nn.z], i * 3);
      if (uvs) uv.set(uvs[i], i * 2);
      else {
        t.set(pts[i][0], pts[i][1], pts[i][2]).sub(p0);
        uv[i * 2] = t.dot(ex);
        uv[i * 2 + 1] = t.dot(ey);
      }
    }
    const idx: number[] = [];
    for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
    if (twoSided) for (let i = 1; i < n - 1; i++) idx.push(0, i + 1, i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.b.add(g, m, null, 'native');
    g.dispose();
  }

  /** Quad p0..p3 (CCW from the front) with uv (0,0),(1,0),(1,1),(0,1) scaled by (su, sv). */
  quad(m: Mat, p0: V3, p1: V3, p2: V3, p3: V3, su = 1, sv = 1, twoSided = false): void {
    this.poly(
      m,
      [p0, p1, p2, p3],
      [
        [0, 0],
        [su, 0],
        [su, sv],
        [0, sv],
      ],
      twoSided,
    );
  }

  /**
   * Vertical rectangle facing +Z after yaw `ry`, centred on x/z with its bottom at y.
   * uv: native 0..1 scaled by (su, sv) — use su = w, sv = h for metric patterns.
   */
  panel(m: Mat, w: number, h: number, x: number, y: number, z: number, ry = 0, su = 1, sv = 1, twoSided = false): void {
    const c = Math.cos(ry),
      s = Math.sin(ry);
    const hx = (w / 2) * c,
      hz = -(w / 2) * s;
    this.quad(m, [x - hx, y, z - hz], [x + hx, y, z + hz], [x + hx, y + h, z + hz], [x - hx, y + h, z - hz], su, sv, twoSided);
  }

  /** Horizontal rectangle (facing up) centred at x/z. */
  flat(m: Mat, w: number, d: number, x: number, y: number, z: number, ry = 0): void {
    const c = Math.cos(ry),
      s = Math.sin(ry);
    const pt = (lx: number, lz: number): V3 => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    this.poly(m, [pt(-w / 2, d / 2), pt(w / 2, d / 2), pt(w / 2, -d / 2), pt(-w / 2, -d / 2)]);
  }

  /**
   * Sloped roof face from an eave edge (e0→e1, CCW seen from above/outside) up to a
   * ridge polygon: pts = [e0, e1, ...upper points]. UV: u along the eave, v up-slope.
   */
  roofFace(m: Mat, pts: V3[]): void {
    const e0 = new THREE.Vector3(...pts[0]);
    const e1 = new THREE.Vector3(...pts[1]);
    const ex = new THREE.Vector3().subVectors(e1, e0).normalize();
    // normal from the polygon
    const nn = new THREE.Vector3();
    for (let i = 1; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(...pts[i]).sub(e0);
      const c = new THREE.Vector3(...pts[i + 1]).sub(e0);
      nn.add(a.cross(c));
    }
    nn.normalize();
    const ey = new THREE.Vector3().crossVectors(nn, ex).normalize();
    const uvs: [number, number][] = pts.map((p) => {
      const t = new THREE.Vector3(...p).sub(e0);
      return [t.dot(ex), t.dot(ey)];
    });
    this.poly(m, pts, uvs);
  }

  /**
   * Gable roof over [x0,x1]×[z0,z1], ridge along X ('x') or Z ('z'), eaves at y0, ridge
   * at y1, overhang o. Adds both slopes + fascia boards (thickness th) — not the gable walls.
   */
  gableRoof(m: Mat, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, axis: 'x' | 'z', o = 0.4, th = 0.18, fascia?: Mat): void {
    if (axis === 'x') {
      const zm = (z0 + z1) / 2;
      const half = (z1 - z0) / 2 + o;
      const k = (y1 - y0) / ((z1 - z0) / 2);
      const ye = y0 - o * k;
      const a = x0 - o,
        b = x1 + o;
      // south slope (+z side), CCW from outside
      this.roofFace(m, [
        [a, ye, zm + half],
        [b, ye, zm + half],
        [b, y1, zm],
        [a, y1, zm],
      ]);
      // north slope
      this.roofFace(m, [
        [b, ye, zm - half],
        [a, ye, zm - half],
        [a, y1, zm],
        [b, y1, zm],
      ]);
      if (fascia) {
        this.box(fascia, b - a, th, 0.08, (a + b) / 2, ye - th, zm + half);
        this.box(fascia, b - a, th, 0.08, (a + b) / 2, ye - th, zm - half);
        // verge boards along the gable edges
        const len = Math.hypot(half, y1 - ye);
        const ang = Math.atan2(y1 - ye, half);
        for (const xx of [a, b]) {
          this.boxC(fascia, 0.08, th, len, xx, (ye + y1) / 2 - th / 2, zm + half / 2, ang, 0, 0);
          this.boxC(fascia, 0.08, th, len, xx, (ye + y1) / 2 - th / 2, zm - half / 2, -ang, 0, 0);
        }
      }
      // underside (soffit) so the roof never looks paper-thin from below
      this.poly(m, [
        [a, ye - 0.02, zm + half],
        [a, y1 - 0.02, zm],
        [b, y1 - 0.02, zm],
        [b, ye - 0.02, zm + half],
      ]);
      this.poly(m, [
        [b, ye - 0.02, zm - half],
        [b, y1 - 0.02, zm],
        [a, y1 - 0.02, zm],
        [a, ye - 0.02, zm - half],
      ]);
    } else {
      const xm = (x0 + x1) / 2;
      const half = (x1 - x0) / 2 + o;
      const k = (y1 - y0) / ((x1 - x0) / 2);
      const ye = y0 - o * k;
      const a = z0 - o,
        b = z1 + o;
      // east slope (+x)
      this.roofFace(m, [
        [xm + half, ye, b],
        [xm + half, ye, a],
        [xm, y1, a],
        [xm, y1, b],
      ]);
      // west slope
      this.roofFace(m, [
        [xm - half, ye, a],
        [xm - half, ye, b],
        [xm, y1, b],
        [xm, y1, a],
      ]);
      if (fascia) {
        this.box(fascia, 0.08, th, b - a, xm + half, ye - th, (a + b) / 2);
        this.box(fascia, 0.08, th, b - a, xm - half, ye - th, (a + b) / 2);
        const len = Math.hypot(half, y1 - ye);
        const ang = Math.atan2(y1 - ye, half);
        for (const zz of [a, b]) {
          this.boxC(fascia, len, th, 0.08, xm + half / 2, (ye + y1) / 2 - th / 2, zz, 0, 0, -ang);
          this.boxC(fascia, len, th, 0.08, xm - half / 2, (ye + y1) / 2 - th / 2, zz, 0, 0, ang);
        }
      }
      this.poly(m, [
        [xm + half, ye - 0.02, b],
        [xm, y1 - 0.02, b],
        [xm, y1 - 0.02, a],
        [xm + half, ye - 0.02, a],
      ]);
      this.poly(m, [
        [xm - half, ye - 0.02, a],
        [xm, y1 - 0.02, a],
        [xm, y1 - 0.02, b],
        [xm - half, ye - 0.02, b],
      ]);
    }
  }

  /** Gable wall triangle(s) closing a gable roof (wall material). */
  gableEnds(m: Mat, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, axis: 'x' | 'z'): void {
    if (axis === 'x') {
      const zm = (z0 + z1) / 2;
      this.poly(m, [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, zm],
      ]);
      this.poly(m, [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, zm],
      ]);
    } else {
      const xm = (x0 + x1) / 2;
      this.poly(m, [
        [x0, y0, z1],
        [x1, y0, z1],
        [xm, y1, z1],
      ]);
      this.poly(m, [
        [x1, y0, z0],
        [x0, y0, z0],
        [xm, y1, z0],
      ]);
    }
  }

  /** Hip roof over a rectangle (ridge along the longer side). */
  hipRoof(m: Mat, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, o = 0.4): void {
    const a = x0 - o,
      b = x1 + o,
      c = z0 - o,
      d = z1 + o;
    const w = b - a,
      dd = d - c;
    const k = (y1 - y0) / (Math.min(x1 - x0, z1 - z0) / 2);
    const ye = y0 - o * k;
    if (w >= dd) {
      const r = dd / 2;
      const zm = (c + d) / 2;
      this.roofFace(m, [
        [a, ye, d],
        [b, ye, d],
        [b - r, y1, zm],
        [a + r, y1, zm],
      ]);
      this.roofFace(m, [
        [b, ye, c],
        [a, ye, c],
        [a + r, y1, zm],
        [b - r, y1, zm],
      ]);
      this.roofFace(m, [
        [b, ye, d],
        [b, ye, c],
        [b - r, y1, zm],
      ]);
      this.roofFace(m, [
        [a, ye, c],
        [a, ye, d],
        [a + r, y1, zm],
      ]);
    } else {
      const r = w / 2;
      const xm = (a + b) / 2;
      this.roofFace(m, [
        [b, ye, d],
        [b, ye, c],
        [xm, y1, c + r],
        [xm, y1, d - r],
      ]);
      this.roofFace(m, [
        [a, ye, c],
        [a, ye, d],
        [xm, y1, d - r],
        [xm, y1, c + r],
      ]);
      this.roofFace(m, [
        [a, ye, d],
        [b, ye, d],
        [xm, y1, d - r],
      ]);
      this.roofFace(m, [
        [b, ye, c],
        [a, ye, c],
        [xm, y1, c + r],
      ]);
    }
    // soffit
    this.poly(m, [
      [a, ye - 0.02, c],
      [b, ye - 0.02, c],
      [b, ye - 0.02, d],
      [a, ye - 0.02, d],
    ]);
  }

  /** Pyramid roof (square or rectangular) with apex at y1. */
  pyramid(m: Mat, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, o = 0.2): void {
    const a = x0 - o,
      b = x1 + o,
      c = z0 - o,
      d = z1 + o;
    const k = (y1 - y0) / (Math.min(x1 - x0, z1 - z0) / 2);
    const ye = y0 - o * k;
    const ax = (x0 + x1) / 2,
      az = (z0 + z1) / 2;
    this.roofFace(m, [
      [a, ye, d],
      [b, ye, d],
      [ax, y1, az],
    ]);
    this.roofFace(m, [
      [b, ye, d],
      [b, ye, c],
      [ax, y1, az],
    ]);
    this.roofFace(m, [
      [b, ye, c],
      [a, ye, c],
      [ax, y1, az],
    ]);
    this.roofFace(m, [
      [a, ye, c],
      [a, ye, d],
      [ax, y1, az],
    ]);
    this.poly(m, [
      [a, ye - 0.02, c],
      [b, ye - 0.02, c],
      [b, ye - 0.02, d],
      [a, ye - 0.02, d],
    ]);
  }

  /** Regular n-gon spire / pyramid (slanted faces with metric up-slope UVs). */
  spire(m: Mat, n: number, r: number, y0: number, y1: number, x: number, z: number, rot = 0): void {
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = rot + ((i + 1) / n) * Math.PI * 2;
      this.roofFace(m, [
        [x + Math.sin(a0) * r, y0, z + Math.cos(a0) * r],
        [x + Math.sin(a1) * r, y0, z + Math.cos(a1) * r],
        [x, y1, z],
      ]);
    }
  }

  /** Straight flight of steps rising toward -Z (local), front edge at z, centred on x. */
  steps(m: Mat, w: number, n: number, rise: number, tread: number, x: number, y: number, z: number, ry = 0): void {
    const c = Math.cos(ry),
      s = Math.sin(ry);
    for (let i = 0; i < n; i++) {
      // block i sits on top of block i-1, from front offset i*tread back to n*tread
      const depth = tread * (n - i);
      const zc = -(i * tread + depth / 2);
      this.box(m, w, rise, depth, x + zc * s, y + i * rise, z + zc * c, ry);
    }
  }
}

/** Arch-topped outline (rectangle w×h whose top is a semicircle/segment of rise r), origin at bottom-left. */
export function archShape(w: number, h: number, rise = w / 2, segs = 10): THREE.Shape {
  const sh = new THREE.Shape();
  const spring = h - rise;
  sh.moveTo(0, 0);
  sh.lineTo(w, 0);
  sh.lineTo(w, spring);
  // segmental arch through (w, spring), (w/2, h), (0, spring)
  const R = (rise * rise + (w / 2) * (w / 2)) / (2 * rise);
  const cy = h - R;
  const a0 = Math.atan2(spring - cy, w / 2);
  const a1 = Math.PI - a0;
  for (let i = 1; i <= segs; i++) {
    const t = a0 + ((a1 - a0) * i) / segs;
    sh.lineTo(w / 2 + Math.cos(t) * R, cy + Math.sin(t) * R);
  }
  sh.lineTo(0, 0);
  return sh;
}

/** Arch outline as a list of points (counter-clockwise), origin bottom-centre. */
export function archPoints(w: number, h: number, rise = w / 2, segs = 10): [number, number][] {
  const out: [number, number][] = [];
  const spring = h - rise;
  const R = (rise * rise + (w / 2) * (w / 2)) / (2 * rise);
  const cy = h - R;
  const a0 = Math.atan2(spring - cy, w / 2);
  const a1 = Math.PI - a0;
  out.push([-w / 2, 0], [w / 2, 0], [w / 2, spring]);
  for (let i = 1; i < segs; i++) {
    const t = a0 + ((a1 - a0) * i) / segs;
    out.push([Math.cos(t) * R, cy + Math.sin(t) * R]);
  }
  out.push([-w / 2, spring]);
  return out;
}

/** Pointed (gothic) arch outline, origin bottom-centre: rectangle up to h - rise, then two arcs meeting at the apex. */
export function pointedPoints(w: number, h: number, rise = w * 0.9, segs = 6): [number, number][] {
  const spring = h - rise;
  const R = (w * w * 0.25 + rise * rise) / w;
  const out: [number, number][] = [
    [-w / 2, 0],
    [w / 2, 0],
    [w / 2, spring],
  ];
  // right arc: centre (w/2 - R, spring), from angle 0 up to the apex
  const cxr = w / 2 - R;
  const aTop = Math.atan2(rise, -cxr);
  for (let i = 1; i <= segs; i++) {
    const a = (aTop * i) / segs;
    out.push([cxr + Math.cos(a) * R, spring + Math.sin(a) * R]);
  }
  // left arc mirrored (apex already added)
  for (let i = segs - 1; i >= 1; i--) {
    const a = (aTop * i) / segs;
    out.push([-(cxr + Math.cos(a) * R), spring + Math.sin(a) * R]);
  }
  out.push([-w / 2, spring]);
  return out;
}

/** Shape geometry from 2D points with uv normalised to 0..1 over the bounding box. */
export function shapeGeoNorm(pts: [number, number][]): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(sh, 1);
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const P = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < P.count; i++) uv.setXY(i, (P.getX(i) - x0) / (x1 - x0), (P.getY(i) - y0) / (y1 - y0));
  return g;
}

/** Extruded frame between an outer and an inner outline (both CCW), depth d along +Z from z=0. */
export function frameGeo(outer: [number, number][], inner: [number, number][], d: number): THREE.BufferGeometry {
  const sh = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  sh.holes.push(new THREE.Path(inner.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 6 });
  return g;
}

/** Extruded solid from an outline (CCW), depth d along +Z from z = 0. */
export function slabGeo(outline: [number, number][], d: number): THREE.BufferGeometry {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 6 });
}

export { UNIT_BOX };
