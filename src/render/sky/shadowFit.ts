// Fits the sun's orthographic shadow camera to what the main camera actually sees.
//
// The visible ground region (slab ∩ view frustum, evaluated at ground level and at
// rooftop height) is clipped to a radius around the camera focus, wrapped in a
// rotation-invariant bounding circle (so orbiting doesn't make shadows swim),
// quantised in size and snapped to shadow-map texels (so panning doesn't shimmer).
// The depth range always spans the whole diorama volume so tall towers, the TV mast
// and clouds keep casting into the view even when they are off-screen.

import * as THREE from 'three';
import type { Rect } from '../../core/geom';

export interface ShadowFitParams {
  slab: Rect;
  /** lowest and highest point of anything that casts or receives (m) */
  minY: number;
  maxY: number;
  /** heights at which the visible region is evaluated (ground, rooftops) */
  sampleHeights: number[];
}

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _alt = new THREE.Vector3(1, 0, 0);
const _C = new THREE.Vector3();
const _tmp = new THREE.Vector3();

type V2 = { x: number; z: number };

/** Sutherland–Hodgman clip of a convex 2D polygon by n.x*x + n.z*z + d >= 0. */
function clipPoly(poly: V2[], nx: number, nz: number, d: number, out: V2[]): V2[] {
  out.length = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i],
      b = poly[(i + 1) % n];
    const da = nx * a.x + nz * a.z + d,
      db = nx * b.x + nz * b.z + d;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

export class ShadowFitter {
  /** last fitted half-size (m) and texel size (m) */
  halfSize = 100;
  texel = 0.1;
  private polyA: V2[] = [];
  private polyB: V2[] = [];
  private pts: { x: number; y: number }[] = [];
  private lastHs = 0;

  constructor(private params: ShadowFitParams) {}

  /**
   * @param camera main camera (matrices up to date)
   * @param light the directional light (position/target are written)
   * @param L unit vector from the scene towards the light
   * @param focus camera focus point on the ground
   * @param maxRadius limit of the shadowed region around the focus (m)
   */
  fit(camera: THREE.PerspectiveCamera, light: THREE.DirectionalLight, L: THREE.Vector3, focus: THREE.Vector3, maxRadius: number, minRadius: number): void {
    const { slab, minY, maxY, sampleHeights } = this.params;
    // light-space basis exactly as Object3D.lookAt builds it for the shadow camera
    _X.crossVectors(_up, L);
    if (_X.lengthSq() < 1e-8) _X.crossVectors(_alt, L);
    _X.normalize();
    _Y.crossVectors(L, _X).normalize();

    camera.updateMatrixWorld();
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);

    const fx = focus.x * _X.x + focus.y * _X.y + focus.z * _X.z;
    const fy = focus.x * _Y.x + focus.y * _Y.y + focus.z * _Y.z;
    const pts = this.pts;
    pts.length = 0;
    const m = 6;
    for (const h of sampleHeights) {
      let poly = this.polyA;
      let other = this.polyB;
      poly.length = 0;
      poly.push({ x: slab.x0 - m, z: slab.z0 - m }, { x: slab.x1 + m, z: slab.z0 - m }, { x: slab.x1 + m, z: slab.z1 + m }, { x: slab.x0 - m, z: slab.z1 + m });
      for (const pl of _frustum.planes) {
        const nx = pl.normal.x,
          ny = pl.normal.y,
          nz = pl.normal.z;
        const d = pl.constant + ny * h;
        if (Math.abs(nx) + Math.abs(nz) < 1e-6) {
          if (d < 0) {
            poly.length = 0;
            break;
          }
          continue;
        }
        const res = clipPoly(poly, nx, nz, d, other);
        other = poly;
        poly = res;
        if (poly.length === 0) break;
      }
      for (const p of poly) {
        let lx = p.x * _X.x + h * _X.y + p.z * _X.z - fx;
        let ly = p.x * _Y.x + h * _Y.y + p.z * _Y.z - fy;
        // keep the region near the focus (beyond it the tilt-shift blur takes over)
        const r = Math.hypot(lx, ly);
        if (r > maxRadius) {
          lx *= maxRadius / r;
          ly *= maxRadius / r;
        }
        pts.push({ x: lx, y: ly });
      }
    }
    if (pts.length === 0) pts.push({ x: 0, y: 0 });

    // AABB centre in light space, then a rotation-invariant bounding radius
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    let cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    let rad = 0;
    for (const p of pts) rad = Math.max(rad, Math.hypot(p.x - cx, p.y - cy));
    rad = Math.max(minRadius, rad + 4);
    // quantise size (2^(1/6) steps) with hysteresis so small camera motions never rescale
    const q = Math.pow(2, Math.ceil(Math.log2(rad) * 6) / 6);
    let hs = this.lastHs;
    if (hs === 0 || q > hs || q < hs / 1.26) hs = q;
    this.lastHs = hs;

    const mapSize = light.shadow.mapSize.x;
    const texel = (2 * hs) / mapSize;
    cx += fx;
    cy += fy;
    cx = Math.round(cx / texel) * texel;
    cy = Math.round(cy / texel) * texel;

    // centre point C on the light-space plane through the origin (any point with these X/Y coords works)
    _C.set(0, 0, 0).addScaledVector(_X, cx).addScaledVector(_Y, cy);

    // depth range: whole diorama volume projected on L
    let mn = Infinity,
      mx = -Infinity;
    for (let i = 0; i < 8; i++) {
      _tmp.set(i & 1 ? slab.x1 + 20 : slab.x0 - 20, i & 2 ? maxY : minY, i & 4 ? slab.z1 + 20 : slab.z0 - 20);
      const dd = _tmp.sub(_C).dot(L);
      if (dd < mn) mn = dd;
      if (dd > mx) mx = dd;
    }
    const dist = mx + 20;
    light.target.position.copy(_C);
    light.position.copy(_C).addScaledVector(L, dist);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();

    const cam = light.shadow.camera as THREE.OrthographicCamera;
    const near = 5,
      far = dist - mn + 10;
    if (cam.left !== -hs || cam.top !== hs || Math.abs(cam.far - far) > 0.5 || cam.near !== near) {
      cam.left = -hs;
      cam.right = hs;
      cam.top = hs;
      cam.bottom = -hs;
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
    this.halfSize = hs;
    this.texel = texel;
  }
}
