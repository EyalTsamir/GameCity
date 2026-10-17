// Breakwater: rubble-mound rock armour (harbour side), concrete tetrapods (sea side), a concrete
// walkway with a seaward crown wall, emerging from the rocky cliff; round head carrying the
// red-and-white lighthouse (gallery, lantern room with a glowing lens, dome, vane).

import * as THREE from 'three';
import { WATER_LEVEL } from '../../core/constants';
import type { Rng } from '../../core/rng';
import { EMIT, HB, PAT, type V3 } from './geo';
import type { GlowPoint } from './material';
import { GLOW } from './material';

export const BW = { crest: 1.5, half: 1.7, wallH: 1.1 } as const;

const ROCKS = ['#8f877c', '#7d766d', '#9a9081', '#6f6a66', '#a39079', '#857d72'];
const CONCRETE = '#c4c0b8';

export interface BreakwaterInfo {
  /** x where the walkway leaves the cliff */
  rootX: number;
  lantern: THREE.Vector3;
}

function tetrapod(b: HB, x: number, y: number, z: number, s: number, rng: Rng): void {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.3), rng.range(0, 6.3), rng.range(0, 6.3)));
  const legs: V3[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  const v = new THREE.Vector3();
  for (const l of legs) {
    v.set(l[0], l[1], l[2]).normalize().applyQuaternion(q).multiplyScalar(s);
    b.cyl([x, y, z], [x + v.x, y + v.y, z + v.z], s * 0.42, s * 0.24, 6, 2);
  }
}

export function buildBreakwater(
  b: HB,
  a: { x: number; z: number },
  bEnd: { x: number; z: number },
  ground: (x: number, z: number) => number,
  rng: Rng,
  lighthouse: { x: number; z: number; height: number } | null,
  glows: GlowPoint[],
): BreakwaterInfo {
  const z = a.z;
  const xEnd = bEnd.x;
  // walkway starts where the cliff drops below the crest
  let rootX = a.x;
  for (let x = a.x - 8; x < xEnd; x += 0.25) {
    if (ground(x, z) < BW.crest - 0.15) {
      rootX = x - 0.5;
      break;
    }
  }
  const x0 = rootX,
    x1 = xEnd;
  const crest = BW.crest,
    hw = BW.half;
  b.noEmit();
  // ── core (hidden under the armour, closes gaps): trapezoid prism
  b.color('#5f5a54').pat(PAT.NONE);
  const coreB = -3.2;
  b.quad([x0, crest - 0.5, z + hw], [x0, coreB, z + 7.0], [x1, coreB, z + 7.0], [x1, crest - 0.5, z + hw]);
  b.quad([x0, crest - 0.5, z - hw - 0.6], [x1, crest - 0.5, z - hw - 0.6], [x1, coreB, z - 7.5], [x0, coreB, z - 7.5]);
  // ── walkway deck (concrete slabs) + crown wall
  b.color(CONCRETE).pat(PAT.STONE, 3.0);
  b.boxMM(x0, crest - 0.6, z - hw, x1, crest, z + hw, 1);
  b.color('#b5b0a6').pat(PAT.STONE, 1.6);
  b.boxMM(x0, crest - 0.6, z - hw - 0.55, x1 - 0.5, crest + BW.wallH, z - hw, 1);
  b.color('#d0ccc3').pat(PAT.NONE);
  b.boxMM(x0 - 0.02, crest + BW.wallH, z - hw - 0.6, x1 - 0.48, crest + BW.wallH + 0.08, z - hw + 0.05, 1);
  // small kerb on the harbour side + bollards + a few lamp posts
  b.color('#bdb8ae');
  b.boxMM(x0, crest, z + hw - 0.22, x1, crest + 0.14, z + hw, 1);
  for (let x = x0 + 6; x < x1 - 3; x += 9.5) {
    b.color('#2c2f33');
    b.cyl([x, crest, z + hw - 0.45], [x, crest + 0.4, z + hw - 0.45], 0.16, 0.14, 7, 0);
    b.cyl([x, crest + 0.4, z + hw - 0.45], [x, crest + 0.52, z + hw - 0.45], 0.24, 0.24, 7, 2);
  }
  for (let x = x0 + 10; x < x1 - 4; x += 19) {
    b.color('#2f4a3e');
    b.cyl([x, crest + 0.14, z - hw + 0.3], [x, crest + 3.6, z - hw + 0.3], 0.07, 0.05, 6, 0);
    b.box(x, crest + 3.62, z - hw + 0.3, 0.32, 0.06, 0.32, 0, 0);
    b.color('#ffe2a8').emit('#ffd28a', 2.2, EMIT.LIGHTS);
    b.box(x, crest + 3.42, z - hw + 0.3, 0.22, 0.34, 0.22, Math.PI / 4, 3);
    b.noEmit();
    glows.push({ x, y: crest + 3.45, z: z - hw + 0.3, size: 1.0, color: '#ffd08c', intensity: 1.0 });
    glows.push({ x, y: crest + 0.05, z: z - hw + 1.2, size: 3.0, pool: true, color: '#ffbe72', intensity: 0.28 });
  }
  b.pat(PAT.NONE);
  // ── rock armour, harbour side (south): rows down the slope
  const slopeRows = (side: number, zTop: number, yTop: number, zBot: number, yBot: number, kind: 'rock' | 'tetra') => {
    const rows = 5;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const zz = zTop + (zBot - zTop) * t;
      const yy = yTop + (yBot - yTop) * t;
      if (yy < WATER_LEVEL - 1.2) continue;
      const step = kind === 'rock' ? 1.15 : 2.1;
      for (let x = x0 + rng.range(0, step); x < x1 + 1.5; x += step * rng.range(0.85, 1.15)) {
        if (ground(x, zz) > yy + 0.4) continue; // inside the cliff
        const jz = rng.range(-0.35, 0.35) * side;
        if (kind === 'rock') {
          const s = rng.range(0.55, 1.05);
          b.color(ROCKS[rng.int(0, ROCKS.length - 1)]);
          b.rock(x, yy - s * 0.15, zz + jz, s * rng.range(0.9, 1.3), s * rng.range(0.6, 0.85), s * rng.range(0.9, 1.25), rng, rng.range(0, 6.3));
        } else {
          b.color(rng.chance(0.5) ? '#c8c3b8' : '#b9b3a7');
          tetrapod(b, x, yy + 0.1, zz + jz, rng.range(0.85, 1.05), rng);
        }
      }
    }
  };
  slopeRows(1, z + hw + 0.4, crest - 0.35, z + 6.6, WATER_LEVEL - 1.0, 'rock');
  slopeRows(-1, z - hw - 1.1, crest + 0.2, z - 7.0, WATER_LEVEL - 0.9, 'tetra');
  slopeRows(-1, z - hw - 2.6, crest - 1.0, z - 8.2, WATER_LEVEL - 1.1, 'rock');

  // ── round head + lighthouse
  let lantern = new THREE.Vector3(xEnd, 20, z);
  if (lighthouse) {
    const lx = lighthouse.x,
      lz = lighthouse.z;
    const H = lighthouse.height;
    // armour ring
    for (let ring = 0; ring < 3; ring++) {
      const r = 4.6 + ring * 1.5;
      const y = crest - 0.4 - ring * 1.1;
      const n = Math.round((2 * Math.PI * r) / (ring === 0 ? 2.0 : 1.2));
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
        const px = lx + Math.sin(ang) * r,
          pz = lz + Math.cos(ang) * r;
        if (px < lx - 1.5 && Math.abs(pz - z) < hw + 0.8) continue; // where the walkway arrives
        if (ring === 0) {
          b.color(rng.chance(0.5) ? '#c8c3b8' : '#b9b3a7');
          tetrapod(b, px, y + 0.2, pz, rng.range(0.9, 1.1), rng);
        } else {
          const s = rng.range(0.6, 1.1);
          b.color(ROCKS[rng.int(0, ROCKS.length - 1)]);
          b.rock(px, y, pz, s * 1.2, s * 0.75, s * 1.1, rng, rng.range(0, 6.3));
        }
      }
    }
    // concrete platform
    b.color(CONCRETE).pat(PAT.STONE, 1.4);
    b.cyl([lx, -3.0, lz], [lx, crest, lz], 4.3, 4.1, 20, 2);
    b.pat(PAT.NONE);
    b.color('#2f4a3e');
    for (let k = 0; k < 20; k++) {
      const ang = (k / 20) * Math.PI * 2;
      if (Math.cos(ang - Math.PI * 1.5) > 0.82) continue; // opening towards the walkway (−x)
      const px = lx + Math.sin(ang) * 3.95,
        pz = lz + Math.cos(ang) * 3.95;
      b.box(px, crest + 0.5, pz, 0.06, 1.0, 0.06, 0, 3);
    }
    const railPts: V3[] = [];
    for (let k = 0; k <= 40; k++) {
      const ang = Math.PI * 1.5 + 0.6 + (k / 40) * (Math.PI * 2 - 1.2);
      railPts.push([lx + Math.sin(ang) * 3.95, crest + 1.0, lz + Math.cos(ang) * 3.95]);
    }
    b.tube(railPts, 0.04, 4);
    // tower (tapered, banded)
    const y0 = crest,
      yTop = y0 + H * 0.69;
    const r0 = 1.95,
      r1 = 1.35;
    const rAt = (y: number) => r0 + (r1 - r0) * ((y - y0) / (yTop - y0));
    b.color('#8e8a82');
    b.cyl([lx, y0, lz], [lx, y0 + 0.45, lz], r0 + 0.25, r0 + 0.2, 20, 2);
    const bands = 6;
    for (let k = 0; k < bands; k++) {
      const ya = y0 + 0.45 + ((yTop - y0 - 0.45) * k) / bands,
        yb = y0 + 0.45 + ((yTop - y0 - 0.45) * (k + 1)) / bands;
      b.color(k % 2 === 0 ? '#f4f1ea' : '#d64541');
      b.cyl([lx, ya, lz], [lx, yb, lz], rAt(ya), rAt(yb), 20, 0);
    }
    // door (west, facing the walkway) + small windows
    b.color('#2f5d4f');
    b.box(lx - rAt(y0 + 1.2) + 0.02, y0 + 1.5, lz, 0.12, 2.0, 0.95, 0, 1);
    b.color('#2e3a44').emit('#ffd59a', 1.2, EMIT.LIGHTS);
    for (let k = 0; k < 4; k++) {
      const y = y0 + 4.2 + k * 3.1;
      const ang = -Math.PI / 2 + (k % 2 ? 0.9 : -0.9) + k * 0.3;
      const r = rAt(y) + 0.01;
      b.box(lx + Math.sin(ang) * r, y, lz + Math.cos(ang) * r, 0.5, 0.75, 0.5, ang, 1 | 2);
    }
    b.noEmit();
    // gallery
    b.color('#2b3b36');
    b.cyl([lx, yTop - 0.25, lz], [lx, yTop + 0.05, lz], r1 + 0.95, r1 + 0.95, 20, 3);
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      b.box(lx + Math.sin(ang) * (r1 + 0.85), yTop + 0.55, lz + Math.cos(ang) * (r1 + 0.85), 0.05, 1.0, 0.05, 0, 3);
    }
    const gp: V3[] = [];
    for (let k = 0; k <= 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      gp.push([lx + Math.sin(ang) * (r1 + 0.85), yTop + 1.05, lz + Math.cos(ang) * (r1 + 0.85)]);
    }
    b.tube(gp, 0.05, 4, false);
    // lantern room: base wall, glazing with mullions, lens
    const lr = 1.15;
    b.color('#d64541');
    b.cyl([lx, yTop + 0.05, lz], [lx, yTop + 0.75, lz], lr + 0.05, lr + 0.05, 8, 0);
    b.color('#3d4a52').pat(PAT.GLASS);
    b.cyl([lx, yTop + 0.75, lz], [lx, yTop + 2.75, lz], lr, lr, 8, 0, Math.PI / 8);
    b.pat(PAT.NONE);
    b.color('#25302c');
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      b.box(lx + Math.sin(ang) * lr * 1.02, yTop + 1.75, lz + Math.cos(ang) * lr * 1.02, 0.07, 2.0, 0.07, ang, 3);
    }
    b.color('#fff3c4').emit('#fff1c9', 6.0, EMIT.LANTERN);
    b.cyl([lx, yTop + 1.05, lz], [lx, yTop + 2.35, lz], 0.55, 0.55, 10, 3);
    b.noEmit();
    // dome roof, ventilator, finial, vane
    b.color('#c43c37');
    b.lathe(
      [
        [lr + 0.3, yTop + 2.75],
        [lr + 0.2, yTop + 2.95],
        [lr - 0.1, yTop + 3.4],
        [0.6, yTop + 3.8],
        [0.15, yTop + 4.0],
      ],
      16,
      lx,
      0,
      lz,
    );
    b.color('#25302c');
    b.sphere(lx, yTop + 4.2, lz, 0.3, 10, 6);
    b.cyl([lx, yTop + 4.4, lz], [lx, yTop + 5.6, lz], 0.04, 0.02, 5, 0);
    b.box(lx + 0.25, yTop + 5.2, lz, 0.6, 0.08, 0.02, 0, 0);
    lantern = new THREE.Vector3(lx, yTop + 1.7, lz);
    glows.push({ x: lx, y: yTop + 1.7, z: lz, size: 3.4, color: '#fff2cc', intensity: 1.4, mode: GLOW.LANTERN });
    glows.push({ x: lx, y: yTop + 1.7, z: lz, size: 9.0, color: '#ffe6b0', intensity: 0.5, mode: GLOW.LANTERN });
  }
  return { rootX, lantern };
}
