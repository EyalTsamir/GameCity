// Painted cast-iron details along the water: the river promenade railing (gaps where the
// footbridges land and at the ladders), ornamental promenade lamp posts, and iron ladders
// down the quay walls. One merged mesh; the lamp globes go into the masonry mesh (emissive).

import * as THREE from 'three';
import { RIVER, SLAB } from '../../core/constants';
import { GeoBuilder } from './builder';
import { RIVER_WALL_END_X, RIVER_WALL_T } from './height';
import { KIND, type LadderSpot } from './kinds';

export interface RailingResult {
  mesh: THREE.Mesh;
  triangles: number;
  lampPosts: { x: number; z: number; y: number }[];
}

const IRON = new THREE.Color('#2f4a3e');
const IRON_HI = new THREE.Color('#3d5d4f');
const LADDER = new THREE.Color('#3a3b38');

export function createRailings(ladders: LadderSpot[], gaps: { x: number; half: number }[], lampGlobes: GeoBuilder): RailingResult {
  const b = new GeoBuilder();
  const zR = RIVER.z0 - RIVER_WALL_T / 2; // centre of the north wall coping
  const y0 = 0.15 + 0.2; // coping top
  const holes: [number, number][] = [];
  for (const g of gaps) holes.push([g.x - g.half, g.x + g.half]);
  for (const l of ladders) if (l.nz > 0) holes.push([l.x - 0.55, l.x + 0.55]);
  holes.sort((a, c) => a[0] - c[0]);
  // runs between holes
  const runs: [number, number][] = [];
  let x = SLAB.x0 + 0.4;
  for (const [h0, h1] of holes) {
    if (h0 > x + 0.5) runs.push([x, h0]);
    x = Math.max(x, h1);
  }
  const xEnd = RIVER_WALL_END_X - 0.75;
  if (xEnd > x + 0.5) runs.push([x, xEnd]);
  const lampPosts: { x: number; z: number; y: number }[] = [];
  let nextLamp = SLAB.x0 + 12;
  for (const [r0, r1] of runs) {
    const L = r1 - r0;
    const n = Math.max(1, Math.round(L / 2.3));
    const step = L / n;
    for (let i = 0; i <= n; i++) {
      const px = r0 + i * step;
      // post with a small cap
      b.color(IRON);
      b.box(px, y0 + 0.55, zR, 0.045, 0.55, 0.045, 0, 4);
      b.color(IRON_HI);
      b.box(px, y0 + 1.13, zR, 0.07, 0.035, 0.07, 0, 4);
      // ornamental lamp post every ~22 m
      if (px >= nextLamp && i > 0 && i < n) {
        nextLamp = px + 22;
        b.color(IRON);
        b.box(px, y0 + 2.0, zR, 0.07, 2.0, 0.07, 0, 4);
        b.box(px, y0 + 0.2, zR, 0.13, 0.2, 0.13, 0, 4);
        b.box(px, y0 + 4.02, zR, 0.15, 0.04, 0.15, 0, 4);
        b.box(px, y0 + 4.62, zR, 0.12, 0.03, 0.12, 0, 4);
        lampGlobes.color('#ffd59a').set('aMas', KIND.lamp, 0, 1, 0);
        lampGlobes.box(px, y0 + 4.33, zR, 0.17, 0.26, 0.17, Math.PI / 4, 0);
        lampPosts.push({ x: px, z: zR, y: y0 + 4.33 });
      }
    }
    // rails
    b.color(IRON_HI);
    b.beam(r0, y0 + 1.06, zR, r1, y0 + 1.06, zR, 0.07, 0.06);
    b.color(IRON);
    b.beam(r0, y0 + 0.62, zR, r1, y0 + 0.62, zR, 0.04, 0.04);
    b.beam(r0, y0 + 0.2, zR, r1, y0 + 0.2, zR, 0.04, 0.04);
    // light balusters in pairs between posts (rhythm without shimmer)
    for (let i = 0; i < n; i++) {
      const xm = r0 + (i + 0.5) * step;
      for (const dx of [-0.35, 0.35]) b.box(xm + dx, y0 + 0.41, zR, 0.018, 0.21, 0.018, 0, 12);
      b.box(xm, y0 + 0.84, zR, 0.11, 0.11, 0.015, 0, 12);
    }
  }
  // ladders
  for (const l of ladders) {
    const tx = -l.nz,
      tz = l.nx; // along the wall
    const ox = l.x + l.nx * 0.16,
      oz = l.z + l.nz * 0.16;
    const yb = -2.6,
      yt = l.top + 0.95;
    b.color(LADDER);
    for (const s of [-0.24, 0.24]) {
      const sx = ox + tx * s,
        sz = oz + tz * s;
      b.beam(sx, yb, sz, sx, yt, sz, 0.055, 0.055);
      // grab rail curling over the coping
      const ex = sx - l.nx * 0.45,
        ez = sz - l.nz * 0.45;
      b.beam(sx, yt, sz, ex, yt, ez, 0.05, 0.05);
      b.beam(ex, yt, ez, ex, l.top + 0.02, ez, 0.05, 0.05);
    }
    for (let y = yb + 0.25; y < l.top - 0.05; y += 0.3) {
      b.beam(ox - tx * 0.24, y, oz - tz * 0.24, ox + tx * 0.24, y, oz + tz * 0.24, 0.035, 0.035);
    }
  }
  const geo = b.build(true);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain-railings';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh, triangles: b.triangles, lampPosts };
}
