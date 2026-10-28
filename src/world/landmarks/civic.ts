// Small civic features: flagpoles on the Town Square, market stalls, sports-court hoops,
// picnic tables.

import * as THREE from 'three';
import type { Feature } from '../../core/plan';
import { ANIM, M, PAT, type Mat } from './builder';
import { C, S, flagpole, person } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';
import { queueContactLocal } from '../props/contact';

/** Plaza flagpole: stone base, 9 m mast, waving flag. */
export function genFlagpole(env: Env, f: Feature, design: number): void {
  env.begin(f.x, 0, f.z, 0);
  const r = Math.max(f.radius, 0.3);
  env.checkRadius(f.x, f.z, r, 'flagpole');
  const K = env.S;
  // square granite plinth (foot moulding, chamfered top), a square steel base plate with four corner
  // studs (washer, hex nut, thread end), a cast foot sleeve with a collar and an access door; the
  // halyard runs down to a horn cleat at hand height, the spare line coiled and hung on the cleat
  const q = Math.PI / 4;
  K.lathe(M(C.granite, PAT.STONE, 0.8, 0, 0, 0, 0.1), [[r, 0], [r, 0.05], [r - 0.03, 0.07], [r - 0.03, 0.29], [r - 0.07, 0.33], [0, 0.33]], 0, 0, 0, 4, q);
  const steelM = M('#8e969b', PAT.PLAIN, 0.4, 0.7);
  const darkM = M('#5f6569', PAT.PLAIN, 0.5, 0.6);
  const ph = 0.17;
  K.box(steelM, ph * 2, 0.02, ph * 2, 0, 0.33, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const bx = sx * (ph - 0.035), bz = sz * (ph - 0.035);
      K.cyl(darkM, 0.026, 0.026, 0.006, bx, 0.35, bz, 10);
      K.cyl(darkM, 0.02, 0.02, 0.022, bx, 0.356, bz, 6);
      K.cyl(steelM, 0.008, 0.008, 0.02, bx, 0.378, bz, 6);
    }
  K.lathe(steelM, [[0.13, 0.35], [0.13, 0.38], [0.115, 0.4], [0.115, 0.56], [0.125, 0.57], [0.125, 0.6], [0.1, 0.63], [0.085, 0.65]], 0, 0, 0, 16);
  K.box(darkM, 0.004, 0.11, 0.07, 0.0, 0.47, 0.115);
  K.box(darkM, 0.008, 0.012, 0.012, 0.025, 0.47, 0.118);
  flagpole(env, 0, 0.65, 0, 8.6, 2.4, design, f.id * 1.7, 0.075);
  const rope = M('#e8e4da', PAT.PLAIN, 0.8);
  K.rod(rope, [0.085, 0.65 + 8.5, 0.02], [0.098, 1.36, 0.016], 0.004, 3);
  K.rod(rope, [0.075, 0.65 + 8.5, -0.02], [0.098, 1.5, -0.012], 0.004, 3);
  // horn cleat on a riveted saddle strap
  K.box(darkM, 0.012, 0.06, 0.05, 0.081, 1.43, 0);
  K.box(darkM, 0.02, 0.025, 0.025, 0.094, 1.43, 0);
  K.rod(darkM, [0.104, 1.34, 0], [0.104, 1.52, 0], 0.011, 6);
  // figure-eight turns round the horns and the hanging coil
  K.torus(rope, 0.05, 0.006, 0.112, 1.43, 0, 4, 10, Math.PI * 2, 0, Math.PI / 2, 0.35);
  K.torus(rope, 0.06, 0.007, 0.118, 1.27, 0, 4, 14, Math.PI * 2, 0, Math.PI / 2, 0);
  K.torus(rope, 0.058, 0.007, 0.124, 1.265, 0.004, 4, 14, Math.PI * 2, 0, Math.PI / 2, 0.1);
  queueContactLocal(env, 0, 0, 0, r * 0.71, r * 0.71, 0.03, 0.22, 0.55);
  env.endChecks();
  env.pick(f.id, 'Flagpole', new THREE.Box3(new THREE.Vector3(f.x - 1, 0, f.z - 1), new THREE.Vector3(f.x + 1, 9.5, f.z + 1)), () => ['The Tinyhaven flag', 'Flies whichever way the wind blows']);
  void S;
}

// ───────────────────────────────────────────────────────────── market stalls ──

let richStall = true;
const _mm = new THREE.Matrix4();
const _sc = new THREE.Vector3();
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

/** Slatted wooden crate (w × h × d, bottom at y): bottom, two slats per long side with a gap, solid
 *  ends with a hand hole, corner battens. */
function slatCrate(K: Env['S'], m: Mat, w: number, h: number, d: number, x: number, y: number, z: number): void {
  const t = 0.012,
    gap = Math.min(0.028, h * 0.14);
  // bottom: four slats with gaps
  for (let i = 0; i < 4; i++) K.box(m, w - 0.01, t, d / 4 - 0.012, x, y, z - d / 2 + (d / 4) * (i + 0.5));
  // long sides: three slats with open gaps; ends: a low board and a top board with a hand slot between
  const sh = (h - 0.01 - 2 * gap) / 3;
  for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) K.box(m, w, sh, t, x, y + 0.01 + i * (sh + gap), z + sz * (d / 2 - t / 2));
  for (const sx of [-1, 1]) {
    K.box(m, t, h * 0.5, d - 2 * t, x + sx * (w / 2 - t / 2), y, z);
    K.box(m, t, h * 0.22, d - 2 * t, x + sx * (w / 2 - t / 2), y + h * 0.78, z);
    for (const sz of [-1, 1]) K.box(m, 0.025, h, 0.025, x + sx * (w / 2 - 0.02), y, z + sz * (d / 2 - 0.02));
  }
}

/** a mound of individual produce filling a crate top (w × d) at height y */
function produce(K: Env['S'], goods: Goods, ci: number, w: number, d: number, x: number, y: number, z: number, seed: number): void {
  const c0 = new THREE.Color(goods.produce[ci % goods.produce.length]);
  const kind = goods.name;
  if (!richStall) {
    K.box(M(c0, PAT.GRAVEL, 0.7, 0, 0, 0, 0.3 + ci * 0.1), w - 0.04, 0.03, d - 0.04, x, y - 0.03, z);
    return;
  }
  const r = kind === 'BREAD' ? 0.06 : kind === 'CHEESE' ? 0.08 : kind === 'FISH' ? 0.05 : kind === 'HONEY' || kind === 'SPICES' ? 0.05 : kind === 'FLOWERS' ? 0.05 : 0.038;
  const nx = Math.max(2, Math.floor(w / (r * 2.1))), nz = Math.max(2, Math.floor(d / (r * 2.1)));
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // dark bed under the top layer (the crate is full)
  K.box(M(c0.clone().multiplyScalar(0.45), PAT.PLAIN, 0.9), w - 0.03, 0.01, d - 0.03, x, y - 0.02, z);
  const mats = [0.85, 1, 1.12].map((k) => M(c0.clone().multiplyScalar(k), PAT.PLAIN, kind === 'FISH' ? 0.3 : 0.55, 0));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const u = (i + 0.5) / nx - 0.5, v = (j + 0.5) / nz - 0.5;
      const px = x + u * (w - r * 2) * 1.05 + (rnd() - 0.5) * r * 0.5;
      const pz = z + v * (d - r * 2) * 1.05 + (rnd() - 0.5) * r * 0.5;
      const mound = 0.03 * (1 - 4 * (u * u + v * v));
      const py = y + mound + r * 0.7;
      const m = mats[Math.floor(rnd() * 3)];
      if (kind === 'CHEESE') {
        if ((i + j) % 2) continue;
        K.cyl(m, r, r, r * 0.8, px, y, pz, 10);
      } else if (kind === 'HONEY') {
        K.cyl(m, r * 0.7, r * 0.7, r * 1.8, px, y, pz, 8);
        K.cyl(M('#c9b26a', PAT.PLAIN, 0.4, 0.6), r * 0.72, r * 0.72, r * 0.3, px, y + r * 1.8, pz, 8);
      } else if (kind === 'FLOWERS') {
        K.rod(M('#3f7a33', PAT.PLAIN, 0.8), [px, y, pz], [px + (rnd() - 0.5) * 0.06, y + 0.22, pz + (rnd() - 0.5) * 0.06], 0.006, 3);
        K.sphere(m, r * 0.8, px, y + 0.23, pz, 5, 3);
      } else if (kind === 'FISH' || kind === 'BREAD') {
        const a = rnd() * Math.PI;
        _mm.makeRotationY(a).scale(_sc.set(kind === 'FISH' ? 2.6 : 2.0, 0.7, 1)).setPosition(px, y + r * 0.5, pz);
        const eg = new THREE.SphereGeometry(r, 7, 4);
        K.geoM(m, eg, _mm);
        eg.dispose();
      } else K.sphere(m, r * (0.85 + rnd() * 0.25), px, py, pz, 6, 4);
    }
}

export function genMarketStall(env: Env, f: Feature): void {
  const R = f.radius || 1.3;
  env.begin(f.x, 0, f.z, f.yaw);
  env.checkRadius(f.x, f.z, R, 'marketstall');
  const K = env.S;
  // individual produce, price cards, scales and ground clutter (off: low tier, ?nomarketdetail)
  richStall = !env.ctx.debug.params.has('nomarketdetail') && env.ctx.quality.level !== 'low';
  const col = STALL_COLS[Number(f.params?.color ?? f.id) % STALL_COLS.length];
  const goods = GOODS[(f.id * 7 + 3) % GOODS.length];
  const wood = M('#9a6b43', PAT.PLANKS, 0.85, 0, 0, 0, 0.4);
  const steel = M('#9aa2a6', PAT.PLAIN, 0.45, 0.6);
  const hw = 1.0,
    fz = 0.6,
    bz = -0.6;
  let seed = 1 + f.id * 7919;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // frame: round steel poles in square foot plates, top rails, a ridge pole (the cloth sags between them)
  const yF = 2.3, yB = 2.62;
  for (const [x, z, h] of [[-hw, fz, yF], [hw, fz, yF], [-hw, bz, yB], [hw, bz, yB]] as const) {
    K.box(M('#55595c', PAT.PLAIN, 0.7, 0.4), 0.16, 0.012, 0.16, x, 0, z);
    K.rod(steel, [x, 0, z], [x, h + 0.02, z], 0.022, 8);
    queueContactLocal(env, x, 0, z, 0.08, 0.08, 0.02, 0.14, 0.55);
  }
  K.rod(steel, [-hw - 0.05, yF, fz], [hw + 0.05, yF, fz], 0.018, 6);
  K.rod(steel, [-hw - 0.05, yB, bz], [hw + 0.05, yB, bz], 0.018, 6);
  for (const x of [-hw, hw]) K.rod(steel, [x, yF, fz], [x, yB, bz], 0.018, 6);
  // canopy cloth: a grid sagging between the rails, overhanging the front; metric uvs keep the stripes running
  const canopy = M(col, PAT.STRIPES, 0.85, 0, 0, 0, 0.2);
  const under = M('#efe9de', PAT.PLAIN, 0.8);
  const NX = 8, NZ = 4, x0 = -hw - 0.03, x1 = hw + 0.03, z0 = fz + 0.16, z1 = bz - 0.12; // corners stay inside r = 1.3
  const P = (i: number, j: number): [number, number, number] => {
    const u = i / NX, v = j / NZ;
    const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
    const yl = yF + (yB - yF) * ((z - fz) / (bz - fz));
    const sag = 0.07 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x + hw) / (2 * hw)))) * Math.sin(Math.PI * Math.min(1, Math.max(0, (z - fz) / (bz - fz))));
    return [x, yl + 0.03 - sag, z];
  };
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NZ; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      const uv: [number, number][] = [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]], [d[0], d[2]]];
      K.poly(canopy, [a, b, c, d], uv);
      K.poly(under, [d, c, b, a], uv);
    }
  // scalloped valance along the front edge
  for (let i = 0; i < 10; i++) {
    const xa = x0 + ((x1 - x0) * i) / 10, xb = x0 + ((x1 - x0) * (i + 1)) / 10, xm = (xa + xb) / 2;
    const ya = P(0, 0)[1];
    const pts: [number, number, number][] = [[xa, ya, z0], [xb, ya, z0], [xb, ya - 0.13, z0], [xm, ya - 0.19, z0], [xa, ya - 0.13, z0]];
    K.poly(canopy, pts, pts.map((p) => [p[0], p[1]] as [number, number]), true);
  }
  // back cloth, hung from the rear rail with a few folds
  for (let i = 0; i < 6; i++) {
    const xa = -hw + (2 * hw * i) / 6, xb = -hw + (2 * hw * (i + 1)) / 6;
    const dz = i % 2 ? 0.03 : 0;
    K.poly(M(col, PAT.PLAIN, 0.9), [[xa, 0.25, bz - 0.02], [xb, 0.25, bz - 0.02 + (dz ? -0.03 : 0.03)], [xb, yB - 0.02, bz - 0.02 + (dz ? -0.03 : 0.03)], [xa, yB - 0.02, bz - 0.02]], undefined, true);
  }
  // trestle table: thick top on two A-frame trestles, a cloth skirt to the ground at the front
  const top = M('#b88a5c', PAT.PLANKS, 0.8, 0, 0, 0, 0.5);
  const tz = fz - 0.22, ty = 0.78;
  // trodden grime under the table and along the customers' side
  queueContactLocal(env, 0, 0, tz, hw, 0.32, 0.1, 0.45, 0.35);
  K.box(top, 2 * hw - 0.06, 0.035, 0.6, 0, ty, tz);
  for (const x of [-hw + 0.25, hw - 0.25]) {
    for (const s of [-1, 1]) K.beam(wood, [x, 0, tz + s * 0.24], [x, ty, tz + s * 0.06], 0.045, 0.035);
    K.box(wood, 0.05, 0.05, 0.4, x, ty - 0.05, tz);
    K.beam(wood, [x, 0.3, tz - 0.19], [x, 0.3, tz + 0.19], 0.03, 0.02);
  }
  // table cloth: laid over the top and hanging ~40 cm over the front and the ends in soft folds (the
  // trestles show below it); the hem swings in and out, the folds die out towards the table edge
  const clothCol = ['#efe6d2', '#e9dfc8', '#f3efe6', '#e7d9bd'][(f.id * 5) % 4];
  const cloth = M(clothCol, PAT.PLAIN, 0.92);
  const tw = 2 * hw - 0.02, ct = ty + 0.04, hem = ty - 0.36;
  K.box(cloth, tw, 0.006, 0.64, 0, ty + 0.036, tz);
  const NF = 18;
  const fold = (u: number) => 0.028 * Math.sin(u * NF * Math.PI) + 0.008 * Math.sin(u * 37.0 + f.id);
  for (let i = 0; i < NF; i++) {
    const ua = i / NF, ub = (i + 1) / NF;
    const xa = -tw / 2 + tw * ua, xb = -tw / 2 + tw * ub;
    const zt = tz + 0.322;
    const hya = hem + 0.025 * Math.sin(ua * 9.0 + f.id), hyb = hem + 0.025 * Math.sin(ub * 9.0 + f.id);
    // upper band (folds half out) and lower band (full folds) for a soft drape
    const ym = ty - 0.12;
    K.poly(cloth, [[xa, ym, zt + fold(ua) * 0.45], [xb, ym, zt + fold(ub) * 0.45], [xb, ct, zt], [xa, ct, zt]], undefined, true);
    K.poly(cloth, [[xa, hya, zt + fold(ua)], [xb, hyb, zt + fold(ub)], [xb, ym, zt + fold(ub) * 0.45], [xa, ym, zt + fold(ua) * 0.45]], undefined, true);
  }
  // rolled edge over the front of the top
  K.rod(cloth, [-tw / 2, ct - 0.005, tz + 0.318], [tw / 2, ct - 0.005, tz + 0.318], 0.012, 6);
  for (const sx of [-1, 1]) {
    const xe = sx * (tw / 2 + 0.004);
    for (let j = 0; j < 6; j++) {
      const za = tz - 0.32 + (0.64 * j) / 6, zb = tz - 0.32 + (0.64 * (j + 1)) / 6;
      const fa = j % 2 ? 0.02 * sx : 0, fb = (j + 1) % 2 ? 0.02 * sx : 0;
      K.poly(cloth, [[xe + fa, hem + 0.05, za], [xe + fb, hem + 0.05, zb], [xe, ct, zb], [xe, ct, za]], undefined, true);
    }
  }
  K.b.forceDetail = true;
  // crates of produce on the table, tilted towards the aisle by a batten under the back edge
  const crateM = M(goods.crate, PAT.PLANKS, 0.85, 0, 0, 0, 0.6);
  for (let i = 0; i < 4; i++) {
    const x = -hw + 0.27 + i * 0.485;
    slatCrate(K, crateM, 0.42, 0.13, 0.34, x, ty + 0.018, tz - 0.02);
    produce(K, goods, i, 0.42, 0.34, x, ty + 0.15, tz - 0.02, seed + i * 31);
    // price card on a stick
    if (richStall && (i % 2 === 0 || rnd() < 0.5)) {
      K.rod(M('#d8c9a8', PAT.PLAIN, 0.8), [x + 0.15, ty + 0.12, tz + 0.12], [x + 0.15, ty + 0.27, tz + 0.12], 0.004, 3);
      K.box(M('#1d1f1e', PAT.PLAIN, 0.9), 0.09, 0.06, 0.004, x + 0.15, ty + 0.25, tz + 0.122);
      K.box(M('#f2f0ea', PAT.PLAIN, 0.9), 0.05, 0.012, 0.002, x + 0.14, ty + 0.27, tz + 0.125);
      K.box(M('#f2f0ea', PAT.PLAIN, 0.9), 0.03, 0.01, 0.002, x + 0.16, ty + 0.255, tz + 0.125);
    }
  }
  // scales on the corner of the table: base, dial, pan
  if (richStall && goods.name !== 'FLOWERS') {
    const sx = hw - 0.18;
    K.box(M('#e7e3da', PAT.PLAIN, 0.4), 0.2, 0.06, 0.18, sx, ty + 0.035, tz + 0.18);
    K.cyl(M('#e7e3da', PAT.PLAIN, 0.4), 0.06, 0.06, 0.02, sx, ty + 0.1, tz + 0.16, 12);
    K.box(M('#f6f4ee', PAT.PLAIN, 0.3), 0.09, 0.09, 0.02, sx, ty + 0.1, tz + 0.27);
    K.cyl(steel, 0.11, 0.09, 0.025, sx, ty + 0.12, tz + 0.16, 14);
  }
  // back shelf (a board on two crates) with more stock
  K.box(wood, 2 * hw - 0.2, 0.03, 0.32, 0, 0.62, bz + 0.24);
  for (let i = 0; i < 3; i++) {
    const x = -0.6 + i * 0.6;
    slatCrate(K, crateM, 0.42, 0.26, 0.3, x, 0.65, bz + 0.24);
    produce(K, goods, i + 1, 0.42, 0.3, x, 0.92, bz + 0.24, seed + 97 * i);
  }
  for (const x of [-0.75, 0.75]) slatCrate(K, crateM, 0.42, 0.3, 0.3, x, 0.3, bz + 0.24);
  if (richStall) {
    // on the ground: stacked empty crates, flattened cardboard, a box with tape, sometimes a hand truck
    slatCrate(K, crateM, 0.42, 0.3, 0.32, -hw + 0.35, 0, bz + 0.2);
    for (let i = 0; i < 2; i++) slatCrate(K, crateM, 0.42, 0.13, 0.32, -hw + 0.36 + i * 0.01, 0.3 + i * 0.14, bz + 0.2);
    const card = M('#b8915f', PAT.PLAIN, 0.95);
    K.boxC(card, 0.5, 0.008, 0.38, hw - 0.4, 0.005, bz + 0.15, 0, rnd(), 0);
    K.box(card, 0.4, 0.3, 0.3, hw - 0.35, 0, fz - 0.95);
    K.box(M('#c9a77a', PAT.PLAIN, 0.6), 0.06, 0.004, 0.302, hw - 0.35, 0.298, fz - 0.95);
    if (rnd() < 0.5) {
      const hx = -hw + 0.85, hz = bz + 0.15;
      K.rod(M('#2d4f7a', PAT.PLAIN, 0.5, 0.3), [hx - 0.18, 0.12, hz + 0.05], [hx - 0.18, 1.15, hz - 0.12], 0.012, 5);
      K.rod(M('#2d4f7a', PAT.PLAIN, 0.5, 0.3), [hx + 0.18, 0.12, hz + 0.05], [hx + 0.18, 1.15, hz - 0.12], 0.012, 5);
      K.rod(M('#2d4f7a', PAT.PLAIN, 0.5, 0.3), [hx - 0.18, 1.1, hz - 0.11], [hx + 0.18, 1.1, hz - 0.11], 0.012, 5);
      K.box(M('#55595c', PAT.PLAIN, 0.6, 0.5), 0.38, 0.01, 0.2, hx, 0.005, hz + 0.12);
      for (const s of [-1, 1]) K.cylX(M('#1c1c1c', PAT.PLAIN, 0.9), 0.1, 0.05, hx + s * 0.23, 0.1, hz + 0.02, 10);
    }
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
  signQuad(env.T, sign, 1.1, 0.23, 0, yF + 0.08, fz + 0.24, 0, 0);
  // (the vendor behind the counter is a crowd figure: streetlife, src/sim/pedestrians/vendors.ts marketStalls)
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
