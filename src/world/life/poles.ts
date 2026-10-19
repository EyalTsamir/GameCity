// Static bits the life module stands its cloth on: market masts, flagpoles, short facade flag staffs.
// Everything is merged into ONE vertex-coloured mesh (one draw + one shadow draw).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchLampMaterial } from '../lamps/integrate';

const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class PoleBuilder {
  private parts: THREE.BufferGeometry[] = [];
  tris = 0;

  private push(g: THREE.BufferGeometry, color: string): void {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.deleteAttribute('uv');
    const n = ng.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(ng);
    this.tris += n / 3;
  }

  /** a vertical tapered pole from (x, y0, z) up to y1 with a ball finial */
  pole(x: number, y0: number, z: number, y1: number, r: number, color = '#e8e6e0', finial: string | null = '#c9a640'): void {
    const h = y1 - y0;
    const g = new THREE.CylinderGeometry(r * 0.72, r, h, 8, 1, false);
    g.translate(x, y0 + h / 2, z);
    this.push(g, color);
    if (finial) {
      const s = new THREE.SphereGeometry(r * 1.7, 8, 5);
      s.translate(x, y1 + r * 1.2, z);
      this.push(s, finial);
    }
  }

  /** a straight rod between two points (staffs, braces) */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string): void {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-3) return;
    const g = new THREE.CylinderGeometry(r, r, len, 6, 1, false);
    _q.setFromUnitVectors(_up, d.normalize());
    g.applyQuaternion(_q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.push(g, color);
  }

  /** a small box (wall brackets, foot plates) */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    this.push(g, color);
  }

  build(): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!geo) return null;
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
    mat.name = 'life-poles';
    patchLampMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'life-poles';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
