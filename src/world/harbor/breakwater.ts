// Breakwater: rubble-mound rock armour (harbour side), concrete tetrapods (sea side), a concrete
// walkway with a seaward crown wall, emerging from the rocky cliff; round head carrying the
// red-and-white lighthouse (gallery, lantern room with a glowing lens, dome, vane).

import { addLampLights } from '../../core/lampLight';
import { addActor } from '../../sim/pedestrians/actorDefs';
import * as THREE from 'three';
import { WATER_LEVEL } from '../../core/constants';
import type { Rng } from '../../core/rng';
import { EMIT, HB, PAT, type V3 } from './geo';
import type { GlowPoint } from './material';
import { GLOW } from './material';

export const BW = { crest: 1.5, half: 1.7, wallH: 1.1 } as const;

/** box hunt (?noarmour): quarried armour blocks with a wet line instead of round low-poly blobs */
let ARMOUR = true;
export function setArmourStones(on: boolean): void {
  ARMOUR = on;
}

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

let LIFE = false;
/** ?nobwlife: the bare crown wall and walkway */
export function setBreakwaterLife(on: boolean): void {
  LIFE = on;
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
  if (LIFE) {
    const yWall = crest + BW.wallH;
    // cast sections of the crown wall: joints, tide of damp at the foot, rust from the old fixings
    for (let x = x0 + 4; x < x1 - 1; x += 6.2) {
      b.color('#7f7b73');
      b.boxMM(x - 0.018, crest, z - hw - 0.002, x + 0.018, yWall, z - hw + 0.006);
      b.color('#9a968c');
      b.boxMM(x - 0.3, yWall - 0.03, z - hw - 0.002, x - 0.26, yWall - 0.02, z - hw + 0.004);
      const rs = rng.next();
      if (rs < 0.6) {
        b.color('#8a6a4c');
        const rx = x + 1.2 + rs * 3;
        b.boxMM(rx - 0.025, yWall - 0.7 - rs, z - hw - 0.002, rx + 0.025, yWall - 0.18, z - hw + 0.003);
        b.color('#3d3a36');
        b.boxMM(rx - 0.05, yWall - 0.2, z - hw - 0.002, rx + 0.05, yWall - 0.1, z - hw + 0.012);
      }
    }
    b.color('#8f8b81');
    b.boxMM(x0, crest, z - hw - 0.002, x1 - 0.5, crest + 0.28, z - hw + 0.004);
    // a galvanised handrail on the harbour side, breaks at the bollards' berths
    b.color('#a7adb0');
    for (let x = x0 + 2; x < x1 - 4; x += 2.4) b.cyl([x, crest + 0.14, z + hw - 0.1], [x, crest + 1.05, z + hw - 0.1], 0.022, 0.022, 6, 0);
    for (const yy of [0.62, 1.05]) b.cyl([x0 + 2, crest + yy, z + hw - 0.1], [x1 - 4, crest + yy, z + hw - 0.1], 0.02, 0.02, 6, 2);
    // two anglers with rods over the rail, a bucket, a folding stool; a lifebuoy on the wall
    for (const [ax, h0, h1, p] of [[x0 + 16, 5, 11, 0.8], [x0 + 21, 15, 21, 0.7], [x0 + 31.5, 6, 20, 0.6]] as [number, number, number, number][]) {
      const ay = crest;
      addActor({ x: ax, y: ay, z: z + hw - 0.75, yaw: 0, role: 'fisher', idle: 7, h0, h1, p });
      b.color('#3a2c20');
      b.cyl([ax + 0.25, ay + 0.95, z + hw - 0.1], [ax + 0.35, ay + 3.1, z + hw + 2.6], 0.009, 0.004, 4, 0);
      b.color('#2f6fb3');
      b.vcyl(ax + 0.7, ay, z + hw - 0.5, 0.15, 0.27, 9, 1, 0.18);
      b.color('#5a5e60');
      b.boxMM(ax - 0.7, ay, z + hw - 0.68, ax - 0.34, ay + 0.33, z + hw - 0.34);
    }
    for (let x = x0 + 12; x < x1 - 6; x += 38) {
      b.color('#b53a2a');
      b.boxMM(x - 0.3, crest + 0.9, z - hw + 0.002, x + 0.3, crest + 1.8, z - hw + 0.03);
      b.color('#ee6c2a');
      const pts: V3[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        pts.push([x + Math.cos(a) * 0.23, crest + 1.35 + Math.sin(a) * 0.23, z - hw + 0.06]);
      }
      b.tube(pts, 0.05, 6, true);
    }
  }
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
        if (kind === 'rock' && ARMOUR) {
          // box hunt: quarried blocks in a wider spread of sizes, a wet line at the water
          const s = Math.min(r === 0 ? 0.85 : 9, 0.45 + 0.95 * Math.pow(rng.next(), 1.4)); // the top row stays clear of the walkway
          b.color(ROCKS[rng.int(0, ROCKS.length - 1)]);
          b.stone(x, yy - s * 0.15, zz + jz, s * rng.range(0.9, 1.3), s * rng.range(0.6, 0.85), s * rng.range(0.9, 1.25), rng, rng.range(0, 6.3), WATER_LEVEL + 0.75);
        } else if (kind === 'rock') {
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
          if (ARMOUR) b.stone(px, y, pz, s * 1.2, s * 0.75, s * 1.1, rng, rng.range(0, 6.3), WATER_LEVEL + 0.75);
          else b.rock(px, y, pz, s * 1.2, s * 0.75, s * 1.1, rng, rng.range(0, 6.3));
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
    b.cyl([lx, y0, lz], [lx, y0 + 0.45, lz], r0 + 0.25, r0 + 0.2, LIFE ? 36 : 20, 2);
    const bands = 6;
    for (let k = 0; k < bands; k++) {
      const ya = y0 + 0.45 + ((yTop - y0 - 0.45) * k) / bands,
        yb = y0 + 0.45 + ((yTop - y0 - 0.45) * (k + 1)) / bands;
      const white = k % 2 === 0;
      b.color(white ? '#f4f1ea' : '#d64541');
      // floodlit from its foot after dark: the paint itself, fading with height (each step hides on a colour change)
      if (LIFE) b.emit(white ? '#ffe8c6' : '#d8574a', 0.42 * Math.pow(1 - k / bands, 1.5) + 0.02, EMIT.LIGHTS, 0.02);
      b.cyl([lx, ya, lz], [lx, yb, lz], rAt(ya), rAt(yb), LIFE ? 36 : 20, 0);
      b.noEmit();
    }
    // door (west, facing the walkway) + small windows
    if (LIFE) {
      const xd = lx - rAt(y0 + 1.2) + 0.1;
      const yd = y0 + 0.45;
      // stone surround, cornice, two steps
      b.color('#b4ae9f');
      for (const sz of [-1, 1]) b.boxMM(xd - 0.2, yd, lz + sz * 0.52 - (sz < 0 ? 0.16 : 0), xd + 0.1, yd + 2.05, lz + sz * 0.52 + (sz > 0 ? 0.16 : 0));
      b.boxMM(xd - 0.24, yd + 2.05, lz - 0.78, xd + 0.1, yd + 2.3, lz + 0.78);
      b.color('#9d978a');
      b.boxMM(xd - 0.34, yd + 2.3, lz - 0.9, xd + 0.1, yd + 2.38, lz + 0.9);
      b.boxMM(xd - 1.05, y0, lz - 0.9, xd - 0.1, y0 + 0.15, lz + 0.9);
      b.boxMM(xd - 0.6, y0 + 0.15, lz - 0.8, xd - 0.1, y0 + 0.3, lz + 0.8);
      b.boxMM(xd - 0.3, y0 + 0.3, lz - 0.7, xd - 0.1, yd, lz + 0.7);
      // the door: boarded and ledged, fanlight, brass
      b.color('#25493e');
      b.boxMM(xd - 0.12, yd, lz - 0.52, xd + 0.05, yd + 1.72, lz + 0.52);
      b.color('#2f5d4f');
      for (let q = 0; q < 6; q++) b.boxMM(xd - 0.135, yd + 0.05, lz - 0.48 + q * 0.163, xd - 0.11, yd + 1.68, lz - 0.48 + q * 0.163 + 0.143);
      for (const ly of [0.28, 0.85, 1.42]) b.boxMM(xd - 0.15, yd + ly, lz - 0.47, xd - 0.13, yd + ly + 0.11, lz + 0.42);
      b.color('#c9a24e');
      b.boxMM(xd - 0.19, yd + 0.95, lz + 0.33, xd - 0.13, yd + 1.1, lz + 0.37);
      b.boxMM(xd - 0.155, yd + 0.72, lz + 0.31, xd - 0.145, yd + 0.8, lz + 0.39);
      b.color('#22302a');
      b.boxMM(xd - 0.12, yd + 1.72, lz - 0.52, xd + 0.05, yd + 2.05, lz + 0.52);
      b.color('#3a4750').emit('#ffcf8a', 1.6, EMIT.LIGHTS);
      b.boxMM(xd - 0.135, yd + 1.76, lz - 0.46, xd - 0.11, yd + 2.01, lz + 0.46);
      b.noEmit();
      // a ship's lamp over the door
      b.color('#1e2422');
      b.boxMM(xd - 0.42, yd + 2.62, lz - 0.02, xd - 0.05, yd + 2.65, lz + 0.02);
      b.vcyl(xd - 0.42, yd + 2.56, lz, 0.1, 0.06, 8, 3);
      b.color('#fff0cc').emit('#ffe2ad', 3.0, EMIT.LIGHTS);
      b.vcyl(xd - 0.42, yd + 2.36, lz, 0.075, 0.2, 8, 2);
      b.noEmit();
      glows.push({ x: xd - 0.42, y: yd + 2.46, z: lz, size: 0.9, color: '#ffe2ad', intensity: 0.8 });
      addLampLights([{ x: xd - 0.42, y: yd + 2.46, z: lz, pole: 2.9, radius: 4.5, color: '#ffdca6', intensity: 0.85, kind: 'street' }]);
      // three uplighters in the plinth, a bench, a lifebuoy on the rail
      for (const a of [0.95, 3.1, 5.2]) {
        const px = lx + Math.sin(a) * (r0 + 0.55),
          pz = lz + Math.cos(a) * (r0 + 0.55);
        b.color('#2a2d2c');
        b.boxMM(px - 0.12, y0, pz - 0.12, px + 0.12, y0 + 0.14, pz + 0.12);
        b.color('#fff3d8').emit('#ffeccc', 2.6, EMIT.LIGHTS);
        b.boxMM(px - 0.09, y0 + 0.14, pz - 0.09, px + 0.09, y0 + 0.155, pz + 0.09);
        b.noEmit();
      }
      b.color('#6e5236');
      b.boxMM(lx - 0.5, y0 + 0.42, lz - 3.55, lx + 0.8, y0 + 0.47, lz - 3.2);
      b.boxMM(lx - 0.5, y0 + 0.5, lz - 3.62, lx + 0.8, y0 + 0.86, lz - 3.57);
      b.color('#2c3230');
      for (const qx of [-0.42, 0.72]) b.boxMM(lx + qx - 0.03, y0, lz - 3.6, lx + qx + 0.03, y0 + 0.86, lz - 3.25);
      b.color('#ee6c2a');
      const buoy: V3[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        buoy.push([lx + 3.97, crest + 0.72 + Math.sin(a) * 0.23, lz + 0.9 + Math.cos(a) * 0.23]);
      }
      b.tube(buoy, 0.05, 6, true);
    } else {
      b.color('#2f5d4f');
      b.box(lx - rAt(y0 + 1.2) + 0.02, y0 + 1.5, lz, 0.12, 2.0, 0.95, 0, 1);
    }
    for (let k = 0; k < 4; k++) {
      const y = y0 + 4.2 + k * 3.1;
      const ang = -Math.PI / 2 + (k % 2 ? 0.9 : -0.9) + k * 0.3;
      const r = rAt(y) + 0.01;
      if (LIFE) {
        // a recessed sash in a painted stone surround, with a sill
        const sx = lx + Math.sin(ang) * r,
          sz = lz + Math.cos(ang) * r;
        b.color('#ebe6da');
        b.box(sx, y, sz, 0.68, 0.93, 0.16, ang, 1 | 2);
        b.color('#c8c2b4');
        b.box(lx + Math.sin(ang) * (r + 0.03), y - 0.5, lz + Math.cos(ang) * (r + 0.03), 0.78, 0.06, 0.24, ang);
      }
      b.color('#2e3a44').emit('#ffd59a', 1.2, EMIT.LIGHTS);
      const q = LIFE ? r + 0.035 : r;
      b.box(lx + Math.sin(ang) * q, y, lz + Math.cos(ang) * q, 0.5, 0.75, LIFE ? 0.1 : 0.5, ang, 1 | 2);
      b.noEmit();
      if (LIFE) {
        b.color('#ebe6da');
        const q2 = r + 0.09;
        b.box(lx + Math.sin(ang) * q2, y, lz + Math.cos(ang) * q2, 0.03, 0.75, 0.012, ang);
        b.box(lx + Math.sin(ang) * q2, y, lz + Math.cos(ang) * q2, 0.5, 0.03, 0.012, ang);
      }
    }
    // gallery
    if (LIFE) {
      // cast-iron brackets under the gallery
      b.color('#2b3b36');
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const sa = Math.sin(a),
          ca = Math.cos(a);
        const rb = rAt(yTop - 1.0);
        b.beam([lx + sa * rb, yTop - 1.0, lz + ca * rb], [lx + sa * (r1 + 0.82), yTop - 0.25, lz + ca * (r1 + 0.82)], 0.05, 0.05);
      }
    }
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
