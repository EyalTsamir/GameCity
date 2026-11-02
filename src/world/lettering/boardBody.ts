// The solid part of a board on a post (`matboard`). Lettering is transparent and writes no depth: a board made of nothing else had no edge and no
// thickness, and the ambient occlusion of the grass, the roots and the kerb behind it showed through the print.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface BoardBody {
  x: number;
  y: number;
  z: number;
  /** which way it faces */
  nx: number;
  nz: number;
  W: number;
  H: number;
  /** the height of its lower edge */
  yb: number;
}

const POST = new THREE.Color('#4a4238');
const PANEL = new THREE.Color('#c9c6bc');

export function addBoardBodies(scene: THREE.Scene, list: BoardBody[]): void {
  if (list.length === 0) return;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const geos: THREE.BufferGeometry[] = [];
  const box = (b: BoardBody, w: number, h: number, d: number, cy: number, c: THREE.Color): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    q.setFromAxisAngle(up, Math.atan2(b.nx, b.nz));
    m.compose(new THREE.Vector3(b.x, b.y + cy, b.z), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  };
  for (const b of list) {
    // (the faces of the print lie 3.4 cm either side of the post's axis, the panel just behind them)
    box(b, b.W + 0.012, b.H + 0.012, 0.06, b.yb + b.H / 2, PANEL);
    box(b, 0.058, b.yb + b.H + 0.04, 0.058, (b.yb + b.H + 0.04) / 2, POST);
  }
  const merged = mergeGeometries(geos);
  if (!merged) return;
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }));
  mesh.name = 'lettering-boards';
  mesh.receiveShadow = true;
  scene.add(mesh);
}
