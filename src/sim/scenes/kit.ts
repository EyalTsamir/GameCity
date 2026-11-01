// What the scenes handle: crates, trolleys, a picnic blanket, a ball, ladders, a window cleaner's cradle, confetti…
// One InstancedMesh per kind sharing one material (one program, compiled at warm-up), drawn only while something of
// that kind is out: no props in view = no draw calls. Rewritten every frame from the scenes' current state
// (begin → put… → end): direct matrix writes, no allocations.

import * as THREE from 'three';
import { box, merge, paint } from '../../core/gfx';
import { patchLampMaterial } from '../../world/lamps/integrate';

export type PartName = 'crate' | 'produce' | 'trolley' | 'ball' | 'blanket' | 'basket' | 'ladder' | 'cradle' | 'cable' | 'can' | 'vanrear' | 'confetti' | 'bouquet' | 'ribbon' | 'squeegee' | 'plate' | 'broom' | 'cig';

const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, col: string, seg = 8, rotX = 0, rotZ = 0): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg);
  if (rotX) g.rotateX(rotX);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return paint(g, col);
};
const sph = (r: number, x: number, y: number, z: number, col: string, d = 1): THREE.BufferGeometry => {
  const g = new THREE.IcosahedronGeometry(r, d);
  g.translate(x, y, z);
  return paint(g, col);
};

/** slatted fruit crate, 0.56 × 0.38 × 0.26 m, root on the floor */
function crateGeo(): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  const W = '#c8a671',
    D = '#a8854f';
  P.push(box(0.54, 0.012, 0.36, 0, 0.012, 0, D));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(0.022, 0.26, 0.022, sx * 0.265, 0, sz * 0.175, D));
  for (const y of [0.03, 0.115, 0.2]) {
    for (const sz of [-1, 1]) P.push(box(0.56, 0.055, 0.01, 0, y, sz * 0.186, W));
    for (const sx of [-1, 1]) P.push(box(0.01, 0.055, 0.36, sx * 0.276, y, 0, W));
  }
  return merge(P);
}

/** a heap of fruit / vegetables to sit in a crate (tinted per instance) */
function produceGeo(): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) P.push(sph(0.07, -0.16 + i * 0.16 + (j % 2) * 0.03, 0.235 + ((i + j) % 2) * 0.02, -0.075 + j * 0.15, i === 1 && j === 0 ? '#e8e8e8' : '#ffffff', 0));
  return merge(P);
}

/** platform trolley: root under the push bar's middle, bar at 1 m, platform 0.6 × 0.9 m ahead of it (+z) */
function trolleyGeo(): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  const S = '#3a4048',
    B = '#2f6db5';
  P.push(box(0.62, 0.04, 0.92, 0, 0.2, 0.5, B));
  P.push(box(0.62, 0.012, 0.92, 0, 0.24, 0.5, '#2a2c2e'));
  for (const sx of [-1, 1]) {
    P.push(box(0.028, 0.8, 0.028, sx * 0.28, 0.22, 0.05, S));
    for (const z of [0.1, 0.9]) {
      P.push(cyl(0.075, 0.075, 0.04, sx * 0.25, 0.085, z, '#1c1d1f', 10, 0, Math.PI / 2));
      P.push(box(0.03, 0.08, 0.05, sx * 0.25, 0.13, z, S));
    }
  }
  P.push(cyl(0.016, 0.016, 0.58, 0, 1.01, 0.05, S, 6, 0, Math.PI / 2));
  P.push(box(0.56, 0.02, 0.02, 0, 0.6, 0.05, S));
  return merge(P);
}

function blanketGeo(): THREE.BufferGeometry {
  // checked rug, lying with a few soft creases (root at its centre)
  const P: THREE.BufferGeometry[] = [];
  const nx = 8,
    nz = 6;
  const W = 2.0,
    D = 1.5;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const dark = (i + j) % 2 === 0;
      const check = (i % 2 === 0 ? 1 : 0) + (j % 2 === 0 ? 1 : 0);
      const c = check === 2 ? '#a83a30' : check === 1 ? (dark ? '#d8b070' : '#d8b070') : '#f0e8d8';
      const g = box(W / nx, 0.012 + 0.006 * Math.sin(i * 1.9 + j * 2.7), D / nz, -W / 2 + (i + 0.5) * (W / nx), 0.008, -D / 2 + (j + 0.5) * (D / nz), c);
      P.push(g);
    }
  return merge(P);
}

function basketGeo(): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  const W = '#b98a4a',
    D = '#94693a';
  P.push(box(0.44, 0.24, 0.28, 0, 0.0, 0, W));
  for (const y of [0.04, 0.1, 0.16, 0.22]) P.push(box(0.455, 0.018, 0.295, 0, y, 0, D));
  P.push(box(0.46, 0.03, 0.3, 0, 0.24, 0, '#a8c0a0'));
  for (const sx of [-1, 1]) P.push(box(0.02, 0.14, 0.02, sx * 0.16, 0.26, 0, D));
  P.push(box(0.34, 0.02, 0.02, 0, 0.4, 0, D));
  // a bottle and a loaf on the lid
  P.push(cyl(0.03, 0.03, 0.2, 0.3, 0.1, 0.1, '#2f5a3a', 6));
  P.push(cyl(0.012, 0.016, 0.07, 0.3, 0.23, 0.1, '#2f5a3a', 6));
  return merge(P);
}

/** a wooden ladder, 5 m, foot at the root, in the +y direction (leaned by the caller) */
function ladderGeo(): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  const W = '#b09468';
  for (const sx of [-1, 1]) P.push(box(0.05, 5, 0.03, sx * 0.21, 0, 0, W));
  for (let i = 0; i < 16; i++) P.push(box(0.42, 0.028, 0.028, 0, 0.3 + i * 0.3, 0, '#a08458'));
  return merge(P);
}

/** a building maintenance unit: 2.6 × 0.8 m platform with a chest-high rail, root on its floor, wall on the −z side */
function cradleGeo(): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  const S = '#b9bdc2',
    Y = '#e8b81c';
  P.push(box(2.6, 0.06, 0.8, 0, -0.06, 0, '#70757a'));
  for (const y of [0.55, 1.08]) {
    P.push(box(2.6, 0.04, 0.04, 0, y, 0.38, Y));
    for (const sx of [-1, 1]) P.push(box(0.04, 0.04, 0.8, sx * 1.28, y, 0, Y));
  }
  for (const x of [-1.28, -0.43, 0.43, 1.28]) P.push(box(0.04, 1.1, 0.04, x, 0, 0.38, S));
  for (const sx of [-1, 1]) {
    P.push(box(0.04, 1.1, 0.04, sx * 1.28, 0, -0.38, S));
    // hoist box and rollers on the wall side
    P.push(box(0.24, 0.4, 0.2, sx * 1.1, 0.02, -0.25, '#4a4e52'));
    P.push(cyl(0.05, 0.05, 0.1, sx * 1.3, 0.3, -0.45, '#222428', 8, Math.PI / 2));
  }
  P.push(box(2.6, 0.2, 0.012, 0, 0, 0.39, '#e8e4d8'));
  return merge(P);
}

/** a green watering can, root under the handle */
function canGeo(): THREE.BufferGeometry {
  const G = '#3f8f5a';
  return merge([cyl(0.08, 0.08, 0.17, 0, 0.085, 0, G, 10), box(0.02, 0.03, 0.22, 0, 0.2, 0, G), cyl(0.012, 0.02, 0.22, 0, 0.17, 0.17, G, 6, Math.PI / 3), cyl(0.03, 0.012, 0.03, 0, 0.23, 0.28, G, 6, Math.PI / 3)]);
}

/** open rear of a van: dark load space with crates, the two doors swung right round (body colour = instance colour) */
function vanRearGeo(): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  // root: centre of the rear face at floor level, +z = into the van, −z = behind it
  P.push(box(1.84, 1.86, 0.03, 0, 0.5, -0.03, '#17181a'));
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) P.push(box(0.54, 0.25, 0.02, -0.56 + k * 0.56, 0.55 + j * 0.3, -0.05, j === 0 ? '#a8854f' : '#c8a671'));
  for (const sx of [-1, 1]) {
    const g = box(0.04, 1.9, 0.95, 0, 0.5, 0, '#ffffff');
    g.translate(sx * 1.09, 0, 0.42);
    P.push(g);
    P.push(box(0.012, 1.0, 0.72, sx * 1.115, 1.1, 0.42, '#46505a'));
  }
  return merge(P);
}

const GEOS: Record<PartName, () => THREE.BufferGeometry> = {
  crate: crateGeo,
  produce: produceGeo,
  trolley: trolleyGeo,
  ball: () => sph(0.11, 0, 0, 0, '#ffffff', 1),
  blanket: blanketGeo,
  basket: basketGeo,
  ladder: ladderGeo,
  cradle: cradleGeo,
  // a unit-long thin cable, scaled per instance
  cable: () => box(0.014, 1, 0.014, 0, 0, 0, '#26282b'),
  can: canGeo,
  vanrear: vanRearGeo,
  confetti: () => box(0.075, 0.004, 0.05, 0, 0, 0, '#ffffff'),
  bouquet: () => merge([sph(0.08, 0, 0.06, 0, '#f4e8ec', 0), sph(0.035, 0.05, 0.11, 0.03, '#e8a0b0', 0), sph(0.03, -0.05, 0.1, -0.02, '#f0d890', 0), cyl(0.012, 0.03, 0.13, 0, -0.03, 0, '#5a7a3a', 5)]),
  // white satin along the bonnet and a bow, two tins on strings at the back (root at the car's centre, +z forward)
  ribbon: () => merge([box(0.16, 0.012, 2.2, -0.36, 1.02, 1.08, '#fbf8f4'), box(0.16, 0.012, 2.2, 0.36, 1.02, 1.08, '#fbf8f4'), box(0.3, 0.14, 0.09, 0, 1.02, 2.1, '#fbf8f4'), box(0.1, 0.1, 0.1, 0, 1.03, 2.1, '#f0dfe4'), sph(0.1, -0.2, 1.08, 2.1, '#f8eef0', 0), sph(0.1, 0.2, 1.08, 2.1, '#f8eef0', 0), cyl(0.04, 0.04, 0.1, -0.3, 0.07, -3.1, '#c0c4c8', 6, 0, Math.PI / 2), cyl(0.04, 0.04, 0.1, 0.05, 0.07, -3.35, '#c0c4c8', 6, Math.PI / 2), cyl(0.04, 0.04, 0.1, 0.32, 0.07, -3.05, '#c8ccd0', 6, 0, Math.PI / 2), box(0.008, 0.008, 0.9, -0.15, 0.3, -2.7, '#d8d8d8'), box(0.008, 0.008, 1.1, 0.1, 0.3, -2.8, '#d8d8d8')]),
  // bucket-less squeegee on a pole held out of the hands
  squeegee: () => merge([box(0.018, 1.4, 0.018, 0, 0, 0, '#c8ccd0'), box(0.34, 0.03, 0.03, 0, 1.4, 0, '#2a2c30')]),
  plate: () => merge([cyl(0.09, 0.11, 0.015, 0, 0.012, 0, '#f4f0e8', 10), sph(0.04, 0.02, 0.04, 0, '#c8884a', 0)]),
  // a yard broom, 1.3 m, its bristles on the root
  broom: () => merge([cyl(0.012, 0.012, 1.2, 0, 0.7, 0, '#b89a6a', 6), box(0.34, 0.04, 0.06, 0, 0.11, 0, '#7a5a38'), box(0.32, 0.11, 0.05, 0, 0, 0, '#c2a468')]),
  // a cigarette: paper, filter
  cig: () => merge([cyl(0.0035, 0.0035, 0.055, 0, 0.012, 0, '#eeeae2', 5), cyl(0.0036, 0.0036, 0.022, 0, -0.026, 0, '#c8965a', 5)]),
};

interface Part {
  mesh: THREE.InstancedMesh;
  cap: number;
  n: number;
}

const CAPS: Record<PartName, number> = { crate: 120, produce: 120, trolley: 6, ball: 6, blanket: 6, basket: 6, ladder: 3, cradle: 3, cable: 12, can: 8, vanrear: 6, confetti: 420, bouquet: 3, ribbon: 2, squeegee: 6, plate: 12, broom: 3, cig: 3 };
/** kinds worth a shadow: the small ones aren't */
const SHADOW = new Set<PartName>(['crate', 'trolley', 'blanket', 'basket', 'ladder', 'cradle', 'vanrear', 'ball']);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export class Kit {
  readonly group = new THREE.Group();
  private parts = {} as Record<PartName, Part>;
  private list: Part[] = [];
  /** instances out this frame */
  total = 0;

  constructor(shadows: boolean) {
    this.group.name = 'scenes-kit';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    mat.name = 'scenes-kit';
    patchLampMaterial(mat);
    for (const k of Object.keys(GEOS) as PartName[]) {
      const g = GEOS[k]();
      const mesh = new THREE.InstancedMesh(g, mat, CAPS[k]);
      mesh.name = `scenes-${k}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // every instance has a colour from the start: one program for all kinds
      for (let i = 0; i < CAPS[k]; i++) mesh.setColorAt(i, _c.set(0xffffff));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      // never culled by three: the bounding sphere of moving instances is the scenes' business
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = shadows && SHADOW.has(k);
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      this.group.add(mesh);
      const part = { mesh, cap: CAPS[k], n: 0 };
      this.parts[k] = part;
      this.list.push(part);
    }
  }

  setShadows(on: boolean): void {
    for (const k of Object.keys(this.parts) as PartName[]) this.parts[k].mesh.castShadow = on && SHADOW.has(k);
  }

  begin(): void {
    const l = this.list;
    for (let i = 0; i < l.length; i++) l[i].n = 0;
  }

  /** a part at (x, y, z) turned by yaw (+ pitch about its x axis), non-uniform scale optional; `col` = instance tint */
  put(name: PartName, x: number, y: number, z: number, yaw = 0, col = 0xffffff, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0): void {
    const P = this.parts[name];
    if (P.n >= P.cap) return;
    _e.set(pitch, yaw, roll, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    P.mesh.setMatrixAt(P.n, _m);
    P.mesh.setColorAt(P.n, _c.setHex(col));
    P.n++;
  }

  end(): void {
    let total = 0;
    const l = this.list;
    for (let i = 0; i < l.length; i++) {
      const P = l[i];
      total += P.n;
      P.mesh.count = P.n;
      P.mesh.visible = P.n > 0;
      if (P.n > 0) {
        P.mesh.instanceMatrix.needsUpdate = true;
        P.mesh.instanceColor!.needsUpdate = true;
      }
    }
    this.total = total;
  }
}
