// Small civic features: flagpoles on the Town Square, market stalls, sports-court hoops,
// picnic tables.

import * as THREE from 'three';
import type { Feature } from '../../core/plan';
import { ANIM, M, PAT } from './builder';
import { C, S, flagpole, person } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';

/** Plaza flagpole: stone base, 9 m mast, waving flag. */
export function genFlagpole(env: Env, f: Feature, design: number): void {
  env.begin(f.x, 0, f.z, 0);
  const r = Math.max(f.radius, 0.3);
  env.checkRadius(f.x, f.z, r, 'flagpole');
  const K = env.S;
  K.cyl(M(C.granite, PAT.STONE, 0.8, 0, 0, 0, 0.1), r - 0.02, r, 0.35, 0, 0, 0, 12);
  K.cyl(M('#d9d2c4', PAT.PLAIN, 0.7), r * 0.55, r * 0.7, 0.3, 0, 0.35, 0, 12);
  flagpole(env, 0, 0.65, 0, 8.6, 2.4, design, f.id * 1.7, 0.075);
  env.endChecks();
  env.pick(f.id, 'Flagpole', new THREE.Box3(new THREE.Vector3(f.x - 1, 0, f.z - 1), new THREE.Vector3(f.x + 1, 9.5, f.z + 1)), () => ['The Tinyhaven flag', 'Flies whichever way the wind blows']);
  void S;
}

// ───────────────────────────────────────────────────────────── market stalls ──

const STALL_COLS = ['#d8343f', '#2a9d8f', '#e9873a', '#3f73b0', '#e3b62c', '#8d6cab'];
type Goods = { name: string; produce: string[]; crate: string };
const GOODS: Goods[] = [
  { name: 'FRUIT', produce: ['#d62f2f', '#f39a1f', '#f2d43a', '#8cc152'], crate: '#a8794d' },
  { name: 'VEGETABLES', produce: ['#4f9a3a', '#f08a24', '#d9342b', '#6b3f8f'], crate: '#a8794d' },
  { name: 'FLOWERS', produce: ['#e8467c', '#f6d33c', '#9a5fd1', '#f27b3d'], crate: '#3e6f5a' },
  { name: 'BREAD', produce: ['#c98a45', '#b8783a', '#e0b070', '#a0612d'], crate: '#8b5e3c' },
  { name: 'CHEESE', produce: ['#f2cf5b', '#e8b83c', '#f6e3a0', '#d9a441'], crate: '#8b5e3c' },
  { name: 'FISH', produce: ['#aeb9c2', '#8fa1ad', '#c9d3da', '#e46a5a'], crate: '#e9eef2' },
  { name: 'HONEY', produce: ['#e6a21c', '#c9821a', '#f2c14a', '#b8691a'], crate: '#8b5e3c' },
  { name: 'SPICES', produce: ['#c0392b', '#e67e22', '#f1c40f', '#7d5a3c'], crate: '#a8794d' },
];

export function genMarketStall(env: Env, f: Feature): void {
  const R = f.radius || 1.3;
  env.begin(f.x, 0, f.z, f.yaw);
  env.checkRadius(f.x, f.z, R, 'marketstall');
  const K = env.S;
  const col = STALL_COLS[Number(f.params?.color ?? f.id) % STALL_COLS.length];
  const goods = GOODS[(f.id * 7 + 3) % GOODS.length];
  const wood = M('#9a6b43', PAT.PLANKS, 0.85, 0, 0, 0, 0.4);
  const pole = M('#f2efe8', PAT.PLAIN, 0.6, 0.1);
  const hw = 1.0,
    fz = 0.6,
    bz = -0.6;
  // posts
  for (const x of [-hw, hw]) {
    K.box(pole, 0.06, 2.33, 0.06, x, 0, fz);
    K.box(pole, 0.06, 2.6, 0.06, x, 0, bz);
  }
  // striped canopy sloping to the aisle, with a short valance
  const canopy = M(col, PAT.STRIPES, 0.85, 0, 0, 0, 0.2);
  K.poly(canopy, [
    [-hw - 0.1, 2.33, fz + 0.2],
    [hw + 0.1, 2.33, fz + 0.2],
    [hw + 0.1, 2.62, bz - 0.12],
    [-hw - 0.1, 2.62, bz - 0.12],
  ]);
  K.poly(M('#efe9de', PAT.PLAIN, 0.8), [
    [-hw - 0.1, 2.31, fz + 0.2],
    [-hw - 0.1, 2.6, bz - 0.12],
    [hw + 0.1, 2.6, bz - 0.12],
    [hw + 0.1, 2.31, fz + 0.2],
  ]);
  K.box(canopy, 2 * hw + 0.2, 0.12, 0.02, 0, 2.21, fz + 0.2);
  // back cloth
  K.box(M(col, PAT.PLAIN, 0.9), 2 * hw, 1.5, 0.03, 0, 1.0, bz - 0.02);
  // counter + goods crates
  K.box(wood, 2 * hw - 0.1, 0.06, 0.42, 0, 0.82, fz - 0.2);
  K.box(M('#efe6d2', PAT.PLAIN, 0.9), 2 * hw - 0.1, 0.8, 0.02, 0, 0.02, fz + 0.01);
  for (const x of [-hw + 0.1, hw - 0.1]) K.box(wood, 0.06, 0.82, 0.4, x, 0, fz - 0.2);
  K.b.forceDetail = true;
  for (let i = 0; i < 4; i++) {
    const x = -hw + 0.32 + i * 0.46;
    const c = goods.produce[i % goods.produce.length];
    K.boxC(M(goods.crate, PAT.PLANKS, 0.85), 0.4, 0.14, 0.34, x, 0.95, fz - 0.18, -0.25, 0, 0);
    K.boxC(M(c, PAT.GRAVEL, 0.7, 0, 0, 0, 0.3 + i * 0.1), 0.36, 0.06, 0.3, x, 1.03, fz - 0.17, -0.25, 0, 0);
    K.sphere(M(c, PAT.PLAIN, 0.55), 0.07, x + 0.05, 1.08, fz - 0.15, 6, 4);
  }
  // back shelf with stacked crates
  K.box(wood, 2 * hw - 0.2, 0.05, 0.32, 0, 0.62, bz + 0.22);
  for (let i = 0; i < 3; i++) {
    K.box(M(goods.crate, PAT.PLANKS, 0.85), 0.42, 0.26, 0.3, -0.6 + i * 0.6, 0.67, bz + 0.22);
    K.box(M(goods.produce[(i + 1) % 4], PAT.GRAVEL, 0.75), 0.38, 0.04, 0.26, -0.6 + i * 0.6, 0.93, bz + 0.22);
  }
  K.b.forceDetail = false;
  // sign board at the canopy front
  const sign = env.atlas.add(192, 40, (g, w, h) => {
    g.fillStyle = '#f7f1e3';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = col;
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
    drawText(g, goods.name, w / 2, h / 2 + 1, 'bold 22px Georgia, serif', '#3a2c20', 1);
  }, `stall:${goods.name}:${col}`);
  signQuad(env.T, sign, 1.1, 0.23, 0, 2.36, fz + 0.23, 0, 0);
  // vendor behind the counter (market hours: uVis.z)
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(0, 0, 0), axis: new THREE.Vector3(0, 1, 0), a: 2, b: 0.12, c: f.id * 1.3 });
  person(env.K, 0.2, 0, -0.12, 0, ['#f1efe8', '#c8382f', '#2a9d8f', '#e9c46a'][f.id % 4], '#3a3f4a', ['#e8c3a0', '#c99a72', '#8d5a3c'][f.id % 3], f.id % 3 === 0 ? '#3a3f4a' : undefined);
  env.anim(null);
  env.endChecks();
  env.pick(f.id, `Market stall · ${goods.name.toLowerCase()}`, new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, 2.7, f.z + R)), () => {
    const h = env.hours();
    return [`Fresh ${goods.name.toLowerCase()} from the countryside`, h >= 7.5 && h < 14.5 ? 'Market open until 14:30' : 'Market opens at 7:30', 'Market Quarter'];
  });
}

// ───────────────────────────────────────────────────────────── school court hoops ──

/** Basketball hoops at both ends of the court (the roads module paints the lines). */
export function genCourtHoops(env: Env, f: Feature): void {
  const c = f.rect;
  if (!c) return;
  // same court layout as the roads markings: width min(22, w-1) along x, baskets at the x ends
  const cw = Math.min(22, c.x1 - c.x0 - 1);
  const cx = (c.x0 + c.x1) / 2,
    cz = (c.z0 + c.z1) / 2;
  env.begin(cx, 0, cz, 0);
  env.checkRect(c, 'sportscourt', 0.05);
  const K = env.S;
  const steel = M('#3e5f86', PAT.PLAIN, 0.5, 0.5);
  for (const end of [-1, 1]) {
    const xb = end * (cw / 2); // baseline (local)
    const px = xb + end * 0.7; // pole behind the baseline
    const boardX = xb - end * 1.15;
    const ringX = xb - end * 1.4;
    K.box(M(C.concrete, PAT.CONCRETE, 0.9), 0.4, 0.12, 0.4, px, 0, 0);
    K.box(steel, 0.15, 3.45, 0.15, px, 0, 0);
    K.beam(steel, [px, 3.3, 0], [boardX + end * 0.08, 3.3, 0], 0.1);
    K.beam(steel, [px, 2.6, 0], [boardX + end * 0.08, 3.25, 0], 0.07);
    // backboard with the red target square
    K.box(M('#f4f4f2', PAT.PLAIN, 0.4), 0.06, 1.05, 1.8, boardX, 2.85, 0);
    const red = M('#d63c34', PAT.PLAIN, 0.5);
    const fx = boardX - end * 0.035;
    K.box(red, 0.01, 0.05, 0.6, fx, 3.0, 0);
    K.box(red, 0.01, 0.05, 0.6, fx, 3.42, 0);
    K.box(red, 0.01, 0.45, 0.05, fx, 3.0, -0.28);
    K.box(red, 0.01, 0.45, 0.05, fx, 3.0, 0.28);
    // ring + bracket + net
    K.torus(M('#ef6a22', PAT.PLAIN, 0.45, 0.4), 0.23, 0.02, ringX, 3.05, 0, 4, 18, Math.PI * 2, Math.PI / 2, 0, 0);
    K.box(M('#ef6a22', PAT.PLAIN, 0.45, 0.4), 0.18, 0.04, 0.08, (ringX + boardX) / 2, 3.03, 0);
    env.K.cyl(M('#f4f4f4', PAT.MESH, 0.9, 0, 0, 0, 0.8), 0.22, 0.14, 0.42, ringX, 2.63, 0, 12, true);
  }
  env.endChecks();
  env.pick(f.id, 'School basketball court', new THREE.Box3(new THREE.Vector3(c.x0, 0, c.z0), new THREE.Vector3(c.x1, 3.6, c.z1)), () => ['Westbrook School court', 'Hoops at both ends', 'Lines painted by the city']);
}
