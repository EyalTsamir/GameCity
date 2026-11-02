// Small civic features: flagpoles on the Town Square, market stalls, sports-court hoops,
// picnic tables.

import { shapeOn } from '../../core/sweepshape';
import * as THREE from 'three';
import type { Feature } from '../../core/plan';
import { ANIM, M, PAT, type Mat } from './builder';
import { C, S, flagpole, person, railing } from './parts';
import { boxHunt } from '../../core/boxhunt';
import { geomHunt } from '../../core/geomhunt';
import type { Env } from './env';
import { drawText, signQuad } from './signs';
import { markProp } from '../lettering/spots';
import { shell } from './sculpt';
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
// marketlod: the stalls were half a million triangles (20 stalls × ~26 k: cloth at 2 cm grids, 90-triangle plums, crates of
// 22 boxes) — the biggest single object in the city, drawn twice (shadows). Now: domes for what lies in a heap, a coarser
// cloth grid, crates without their hidden faces; ?nomarketlod = the old counts
let stallLod = true;
const _mm = new THREE.Matrix4();
const _rz = new THREE.Matrix4();
const domeGeo = (ws: number, hs: number) => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI * 0.72); // a heap hides the underside (tilts up to ±35°)
const _ballFull = new THREE.SphereGeometry(1, 9, 6);
const _eggFull = new THREE.SphereGeometry(1, 8, 6);
const _oliveFull = new THREE.SphereGeometry(1, 6, 4);
const _ballTop = domeGeo(7, 3);
const _ballLow = domeGeo(5, 2);
const _egg1 = domeGeo(6, 3);
const _olive1 = new THREE.SphereGeometry(1, 4, 2);
const _loaf1 = domeGeo(7, 3);
const _fish1 = new THREE.SphereGeometry(1, 6, 3);
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
  { name: 'EGGS', produce: ['#f2ede2', '#d9b38a', '#c99a6b', '#efe4cf'], crate: '#a8794d' },
  { name: 'OLIVES', produce: ['#3d4a1f', '#5b6b2a', '#2a2420', '#7a6a2a'], crate: '#8b5e3c' },
];

/** goods per stall: greedy over the plan's stalls in id order, never the goods of a stall within 14 m, then
 *  the least-used kind (so a row reads as a market, not one stall copied) */
let goodsOf: Map<number, Goods> | null = null;
let goodsPlan: unknown = null;
function stallGoods(env: Env, f: Feature): Goods {
  if (!goodsOf || goodsPlan !== env.ctx.plan) {
    goodsPlan = env.ctx.plan;
    goodsOf = new Map();
    const stalls = env.ctx.plan.features.filter((g) => g.kind === 'marketstall');
    const used = new Array(GOODS.length).fill(0);
    for (const st of stalls) {
      const near = new Set<Goods>();
      for (const o of stalls) {
        const g = goodsOf.get(o.id);
        if (g && Math.hypot(o.x - st.x, o.z - st.z) < 14) near.add(g);
      }
      let best = -1;
      for (let n = 0; n < GOODS.length; n++) {
        const i = (st.id * 7 + 3 + n) % GOODS.length;
        if (near.has(GOODS[i])) continue;
        if (best < 0 || used[i] < used[best]) best = i;
      }
      if (best < 0) best = (st.id * 7 + 3) % GOODS.length;
      used[best]++;
      goodsOf.set(st.id, GOODS[best]);
    }
  }
  return goodsOf.get(f.id) ?? GOODS[(f.id * 7 + 3) % GOODS.length];
}

// what comes off a lathe, one of each for all the stalls (?noshapemarket): unit radius, y in the same unit
const lathe8 = (p: [number, number][], seg = 8): THREE.LatheGeometry => new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const _jarBody = lathe8([[0.0, 0.0], [0.92, 0.0], [1.0, 0.09], [1.0, 1.9], [0.84, 2.18], [0.72, 2.34]]);
const _jarLid = lathe8([[0.79, 2.3], [0.8, 2.56], [0.62, 2.63], [0.0, 2.63]]);
const _jarLabel = lathe8([[1.012, 0.42], [1.012, 1.56]]);
const _wheelCheese = lathe8([[0.0, 0.0], [0.93, 0.0], [1.0, 0.1], [1.03, 0.4], [1.0, 0.7], [0.93, 0.8], [0.0, 0.8]], 12);

/** Slatted wooden crate (w × h × d, bottom at y): bottom, two slats per long side with a gap, solid
 *  ends with a hand hole, corner battens. */
function slatCrate(K: Env['S'], m: Mat, w: number, h: number, d: number, x: number, y: number, z: number, filled = false): void {
  const t = 0.012,
    gap = Math.min(0.028, h * 0.14);
  if (stallLod) {
    // no hidden faces: slats are outer quads over a dark core when the crate is full / carries another; an open crate
    // adds the inner quads and a floor. ~50 / ~80 triangles (was 264)
    const sh = (h - 0.01 - 2 * gap) / 3;
    if (filled) K.coreBox(M(m.c.clone().multiplyScalar(0.3), PAT.PLAIN, 0.95), w - 2 * t, h - 0.02, d - 2 * t, x, y + 0.005, z);
    else K.flat(m, w - 0.02, d - 0.02, x, y + t, z);
    for (const sz of [-1, 1]) {
      const ry = sz > 0 ? 0 : Math.PI;
      for (let i = 0; i < 3; i++) {
        const sy = y + 0.01 + i * (sh + gap);
        K.panel(m, w, sh, x, sy, z + sz * (d / 2), ry, w, sh);
        if (!filled) K.panel(m, w - 2 * t, sh, x, sy, z + sz * (d / 2 - t), ry + Math.PI, w, sh);
      }
      K.flat(m, w, t, x, y + 0.01 + 2 * (sh + gap) + sh, z + sz * (d / 2 - t / 2));
    }
    for (const sx of [-1, 1]) {
      const ry = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      K.panel(m, d, h * 0.5, x + sx * (w / 2), y, z, ry, d, h * 0.5);
      K.panel(m, d, h * 0.22, x + sx * (w / 2), y + h * 0.78, z, ry, d, h * 0.22);
      if (!filled) {
        K.panel(m, d - 2 * t, h * 0.5, x + sx * (w / 2 - t), y, z, ry + Math.PI, d, h * 0.5);
        K.panel(m, d - 2 * t, h * 0.22, x + sx * (w / 2 - t), y + h * 0.78, z, ry + Math.PI, d, h * 0.22);
      }
      K.flat(m, t, d, x + sx * (w / 2 - t / 2), y + h, z);
      // corner battens: the two outer faces
      for (const sz of [-1, 1]) {
        const cx = x + sx * (w / 2 - 0.0075), cz = z + sz * (d / 2 - 0.0075);
        K.panel(m, 0.025, h, cx, y, cz + sz * 0.016, sz > 0 ? 0 : Math.PI, 0.025, h);
        K.panel(m, 0.025, h, cx + sx * 0.016, y, cz, ry, 0.025, h);
      }
    }
    return;
  }
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
  const lod = stallLod;
  const r = kind === 'BREAD' ? 0.06 : kind === 'CHEESE' ? 0.08 : kind === 'FISH' ? 0.05 : kind === 'HONEY' || kind === 'SPICES' ? 0.05 : kind === 'FLOWERS' ? 0.05 : 0.038;
  const nx = Math.max(2, Math.floor(w / (r * 2.1))), nz = Math.max(2, Math.floor(d / (r * 2.1)));
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // dark bed under the top layer (the crate is full)
  K.box(M(c0.clone().multiplyScalar(0.45), PAT.PLAIN, 0.9), w - 0.03, 0.01, d - 0.03, x, y - 0.02, z);
  const mats = [0.85, 1, 1.12].map((k) => M(c0.clone().multiplyScalar(k), PAT.PLAIN, kind === 'FISH' ? 0.3 : 0.55, 0));
  const pick = () => mats[Math.floor(rnd() * 3)];
  if (kind === 'FISH') {
    // crushed ice heaped in the box, fish laid in overlapping rows, heads to the aisle, a lemon or two
    K.box(M('#e8f0f2', PAT.GRAVEL, 0.25, 0, 0, 0, 0.7), w - 0.03, 0.035, d - 0.03, x, y - 0.03, z);
    const rows = 3, per = Math.max(3, Math.floor(w / 0.09));
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < per; i++) {
        const px = x + ((i + 0.5) / per - 0.5) * (w - 0.08), pz = z + ((j + 0.5) / rows - 0.5) * (d - 0.1);
        _mm.makeRotationY(Math.PI / 2 + 0.35 + (rnd() - 0.5) * 0.3).multiply(new THREE.Matrix4().makeRotationZ(0.25)).scale(_sc.set(0.11, 0.024, 0.035)).setPosition(px, y + 0.012 + j * 0.012, pz);
        const eg = lod ? _fish1 : new THREE.SphereGeometry(1, 9, 5);
        K.geoM(pick(), eg, _mm);
        if (!lod) eg.dispose();
      }
    K.sphere(M('#f1d934', PAT.PLAIN, 0.6), 0.028, x + w * 0.3, y + 0.04, z + d * 0.3, lod ? 6 : 7, lod ? 3 : 5);
    return;
  }
  if (kind === 'FLOWERS') {
    // galvanised buckets with bunches: stems fanning out, heads at different heights, some wrapped in paper
    const nb = 2;
    for (let b2 = 0; b2 < nb; b2++) {
      const bx = x + (b2 - 0.5) * w * 0.5;
      if (lod) K.cylOn(M('#a9b1b5', PAT.PLAIN, 0.4, 0.7), 0.1, 0.085, 0.2, bx, y - 0.12, z, 9);
      else K.cyl(M('#a9b1b5', PAT.PLAIN, 0.4, 0.7), 0.1, 0.085, 0.2, bx, y - 0.12, z, 12);
      const m = mats[(b2 + ci) % 3];
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd(), rr = k === 0 ? 0 : 0.05 + rnd() * 0.05;
        const hx = bx + Math.sin(a) * rr * 1.4, hz = z + Math.cos(a) * rr * 1.2, hy = y + 0.28 + rnd() * 0.12 - rr;
        K.rod(M('#3f7a33', PAT.PLAIN, 0.8), [bx + Math.sin(a) * 0.02, y - 0.02, z + Math.cos(a) * 0.02], [hx, hy, hz], 0.005, 3);
        K.sphere(m, 0.032 + rnd() * 0.012, hx, hy, hz, lod ? 6 : 7, lod ? 3 : 5);
        if (k % 3 === 0) K.sphere(M('#4f8a3c', PAT.PLAIN, 0.8), 0.025, hx - 0.03, hy - 0.06, hz, lod ? 4 : 5, lod ? 2 : 3);
      }
    }
    return;
  }
  if (kind === 'BREAD') {
    // loaves in a heap two deep, a few baguettes standing at the back
    for (let L = 0; L < 2; L++)
      for (let i = 0; i < nx - L; i++)
        for (let j = 0; j < nz - L; j++) {
          const px = x + ((i + 0.5 + L * 0.5) / nx - 0.5) * (w - r * 2) * 1.05, pz = z + ((j + 0.5 + L * 0.5) / nz - 0.5) * (d - r * 2) * 1.05;
          _mm.makeRotationY(rnd() * Math.PI).scale(_sc.set(r * 1.7, r * 0.75, r)).setPosition(px, y + r * 0.45 + L * r * 1.1, pz);
          const eg = lod ? _loaf1 : new THREE.SphereGeometry(1, 9, 6);
          K.geoM(pick(), eg, _mm);
          if (!lod) eg.dispose();
        }
    for (let k = 0; k < 4; k++) K.rod(mats[1], [x - w * 0.3 + k * 0.07, y, z - d * 0.38], [x - w * 0.3 + k * 0.075 + 0.02, y + 0.42, z - d * 0.42], 0.022, lod ? 5 : 6);
    return;
  }
  if (kind === 'SPICES') {
    // a heaped cone of powder in each of four bowls
    for (let k = 0; k < 4; k++) {
      const px = x + ((k % 2) - 0.5) * w * 0.5, pz = z + (Math.floor(k / 2) - 0.5) * d * 0.5;
      const m = M(new THREE.Color(goods.produce[(ci + k) % goods.produce.length]), PAT.GRAVEL, 0.95, 0, 0, 0, 0.2 + k * 0.1);
      if (lod) {
        K.cylOn(M('#e8e0d0', PAT.PLAIN, 0.4), 0.075, 0.05, 0.04, px, y - 0.04, pz, 9);
        K.cylOn(m, 0.01, 0.075, 0.07, px, y, pz, 9);
        continue;
      }
      K.cyl(M('#e8e0d0', PAT.PLAIN, 0.4), 0.075, 0.05, 0.04, px, y - 0.04, pz, 12);
      K.cyl(m, 0.01, 0.075, 0.07, px, y, pz, 12);
    }
    return;
  }
  if (kind === 'EGGS') {
    // grey pulp trays (5 × 6 dimples), eggs sitting in them, a few missing, a stack of empty trays
    const tray = M('#b9b2a4', PAT.GRAVEL, 0.95, 0, 0, 0, 0.5);
    for (let t = 0; t < 2; t++) {
      const tx = x + (t - 0.5) * w * 0.5;
      K.box(tray, w * 0.48, 0.02, d - 0.04, tx, y - 0.02, z);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 5; j++) {
          if (rnd() < 0.12) continue;
          const px = tx + ((i + 0.5) / 4 - 0.5) * w * 0.44, pz = z + ((j + 0.5) / 5 - 0.5) * (d - 0.08);
          const er = 0.021 * (0.92 + rnd() * 0.16);
          const ec = new THREE.Color(goods.produce[(ci + t + Math.floor(rnd() * 2)) % goods.produce.length]).multiplyScalar(0.9 + rnd() * 0.18);
          _mm.makeRotationY(rnd() * 3).multiply(_rz.makeRotationZ((rnd() - 0.5) * 0.4)).scale(_sc.set(er, er * 1.3, er)).setPosition(px, y + er * 0.7, pz);
          K.geoM(M(ec, PAT.PLAIN, 0.5), lod ? _egg1 : _eggFull, _mm);
        }
    }
    return;
  }
  if (kind === 'OLIVES') {
    // glazed bowls heaped with olives (each a small ellipsoid), wooden spoon in one
    for (let k = 0; k < 3; k++) {
      const px = x + (k - 1) * w * 0.32, pz = z + (k % 2 ? 0.04 : -0.04);
      if (lod) K.cylOn(M(['#2f5d8a', '#c9a24a', '#e8e0d0'][(k + ci) % 3], PAT.PLAIN, 0.25), 0.075, 0.05, 0.045, px, y - 0.045, pz, 9);
      else K.cyl(M(['#2f5d8a', '#c9a24a', '#e8e0d0'][(k + ci) % 3], PAT.PLAIN, 0.25), 0.075, 0.05, 0.045, px, y - 0.045, pz, 14);
      const c1 = new THREE.Color(goods.produce[(ci + k) % goods.produce.length]);
      for (let n = 0; n < 26; n++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.062;
        const oy = y + 0.008 + (0.062 - rr) * 0.45 + rnd() * 0.008;
        _mm.makeRotationY(rnd() * 3).multiply(_rz.makeRotationZ(rnd() * 3)).scale(_sc.set(0.009, 0.012, 0.009)).setPosition(px + Math.sin(a) * rr, oy, pz + Math.cos(a) * rr);
        K.geoM(M(c1.clone().multiplyScalar(0.8 + rnd() * 0.4), PAT.PLAIN, 0.25), lod ? _olive1 : _oliveFull, _mm);
      }
      if (k === 1) K.rod(M('#b08a5a', PAT.PLAIN, 0.8), [px, y + 0.02, pz], [px + 0.06, y + 0.12, pz - 0.04], 0.005, 4);
    }
    return;
  }
  // fruit, vegetables, cheese, honey: a heap in up to three layers, each sitting loosely in the hollows of
  // the one below; the upper layers are patchy (more items missing towards the edges), every item has its
  // own size, tint, squash and turn, so the pile is not a pyramid of identical balls
  const layers = kind === 'CHEESE' || kind === 'HONEY' ? 2 : 3;
  const tint = (k: number) => {
    const c = new THREE.Color(goods.produce[(ci + (rnd() < 0.18 ? 1 : 0)) % goods.produce.length]);
    c.offsetHSL((rnd() - 0.5) * 0.035, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.09);
    return M(c.multiplyScalar(k), PAT.PLAIN, kind === 'HONEY' ? 0.25 : 0.45 + rnd() * 0.2, 0);
  };
  for (let L = 0; L < layers; L++) {
    const lx = nx - L, lz = nz - L;
    if (lx < 1 || lz < 1) break;
    for (let i = 0; i < lx; i++)
      for (let j = 0; j < lz; j++) {
        const u = (i + 0.5 + L * 0.5) / nx - 0.5, v = (j + 0.5 + L * 0.5) / nz - 0.5;
        // upper layers: holes, more of them towards the rim
        if (L > 0 && rnd() < 0.12 + L * 0.12 + Math.max(Math.abs(u), Math.abs(v)) * 0.5) continue;
        const px = x + u * (w - r * 2) * 1.05 + (rnd() - 0.5) * r * 0.7;
        const pz = z + v * (d - r * 2) * 1.05 + (rnd() - 0.5) * r * 0.7;
        const m = tint(0.9 + rnd() * 0.2);
        const ly = L * (0.85 + rnd() * 0.3);
        if (kind === 'CHEESE') {
          if ((i + j + L) % 2) continue;
          const cr = r * (0.85 + rnd() * 0.25);
          if (shapeOn('shapemarket')) {
            // a wheel with a soft rim, not a drum; now and then one cut, its pale inside showing
            const cy = y + ly * r * 0.8;
            _mm.makeRotationY(rnd() * 6.3).scale(_sc.set(cr, cr, cr)).setPosition(px, cy, pz);
            K.geoM(m, _wheelCheese, _mm);
            continue;
          }
          if (lod) {
            K.cylOn(m, cr, cr, cr * 0.8, px, y + ly * r * 0.8, pz, 9);
            K.cyl(M(c0.clone().multiplyScalar(0.7), PAT.PLAIN, 0.7), cr * 1.005, cr * 1.005, cr * 0.12, px, y + ly * r * 0.8 + cr * 0.34, pz, 9, true);
            continue;
          }
          K.cyl(m, cr, cr, cr * 0.8, px, y + ly * r * 0.8, pz, 14);
          K.cyl(M(c0.clone().multiplyScalar(0.7), PAT.PLAIN, 0.7), cr * 1.005, cr * 1.005, cr * 0.12, px, y + ly * r * 0.8 + cr * 0.34, pz, 14);
        } else if (kind === 'HONEY') {
          const hy = y + L * r * 2.3;
          const hr = r * (rnd() < 0.3 ? 0.55 : 0.7);
          if (shapeOn('shapemarket')) {
            // a jar: rounded shoulders into a neck, a lid that overhangs it, a paper label
            _mm.makeRotationY(rnd() * 6.3).scale(_sc.set(hr, hr, hr)).setPosition(px, hy, pz);
            K.geoM(m, _jarBody, _mm);
            K.geoM(M(rnd() < 0.5 ? '#c9b26a' : '#d8d2c4', PAT.PLAIN, 0.4, 0.6), _jarLid, _mm);
            if (rnd() < 0.8) K.geoM(M(rnd() < 0.6 ? '#ece6d4' : '#d9c79a', PAT.PLAIN, 0.8), _jarLabel, _mm);
            continue;
          }
          if (lod) {
            K.cyl(m, hr, hr, hr * 2.6, px, hy, pz, 6, true);
            K.cylOn(M(rnd() < 0.5 ? '#c9b26a' : '#d8d2c4', PAT.PLAIN, 0.4, 0.6), hr * 1.03, hr * 1.03, r * 0.3, px, hy + hr * 2.6, pz, 6);
            continue;
          }
          K.cyl(m, hr, hr, hr * 2.6, px, hy, pz, 10);
          K.cyl(M(rnd() < 0.5 ? '#c9b26a' : '#d8d2c4', PAT.PLAIN, 0.4, 0.6), hr * 1.03, hr * 1.03, r * 0.3, px, hy + hr * 2.6, pz, 10);
        } else if (kind === 'VEGETABLES' && ci % 4 === 1) {
          // carrots: tapered roots with leafy tops, laid across the crate
          const a = (rnd() - 0.5) * 0.9;
          const ex = Math.cos(a) * 0.07, ez = Math.sin(a) * 0.07;
          K.rod(m, [px - ex, y + ly * 0.03 + 0.02, pz - ez], [px + ex, y + ly * 0.03 + 0.02 + (rnd() - 0.5) * 0.02, pz + ez], 0.011 + rnd() * 0.006, lod ? 4 : 6);
          K.sphere(M('#4f8a3c', PAT.PLAIN, 0.8), 0.022, px - ex * 1.3, y + ly * 0.03 + 0.03, pz - ez * 1.3, lod ? 4 : 5, lod ? 2 : 3);
        } else {
          const k = kind === 'VEGETABLES' && ci % 4 === 0 ? 1.7 : kind === 'VEGETABLES' && ci % 4 === 3 ? 1.3 : 1;
          const rr = r * k * (0.78 + rnd() * 0.4);
          const py = y + rr * 0.8 + ly * r * k * 1.35;
          if (kind === 'VEGETABLES' && ci % 4 === 3) {
            _mm.makeRotationY(rnd() * Math.PI).multiply(_rz.makeRotationZ(Math.PI / 2 + (rnd() - 0.5) * 0.5)).scale(_sc.set(rr * 0.75, rr * 1.4, rr * 0.75)).setPosition(px, py - rr * 0.2, pz);
          } else {
            // squashed / elongated a little, tipped at random
            const sq = 0.86 + rnd() * 0.2;
            _mm.makeRotationY(rnd() * 6.3).multiply(_rz.makeRotationZ((rnd() - 0.5) * 1.2)).scale(_sc.set(rr, rr * sq, rr * (0.94 + rnd() * 0.12))).setPosition(px, py, pz);
          }
          K.geoM(m, !lod ? _ballFull : L === 0 && layers > 1 ? _ballLow : _ballTop, _mm);
          if (kind === 'FRUIT' && rnd() < 0.3) K.rod(M('#5a4028', PAT.PLAIN, 0.9), [px, py + rr * 0.85, pz], [px + 0.006 * (rnd() - 0.5), py + rr * 1.15, pz], 0.003, 3);
        }
      }
  }
}

/** what lies in each crate of a stall, in the order of its colours, and how it is sold */
const GOODS_WORDS: Record<string, { names: string[]; unit: string }> = {
  FRUIT: { names: ['Apples', 'Oranges', 'Lemons', 'Pears'], unit: 'per kg' },
  VEGETABLES: { names: ['Greens', 'Carrots', 'Tomatoes', 'Beetroot'], unit: 'per kg' },
  FLOWERS: { names: ['Peonies', 'Sunflowers', 'Lavender', 'Marigolds'], unit: 'a bunch' },
  BREAD: { names: ['Cob loaf', 'Rye', 'Bloomer', 'Sourdough'], unit: 'each' },
  CHEESE: { names: ['Cheddar', 'Gouda', 'Caerphilly', 'Comté'], unit: 'per 100 g' },
  HONEY: { names: ['Wildflower', 'Heather', 'Clover', 'Dark forest'], unit: 'a jar' },
  SPICES: { names: ['Paprika', 'Saffron', 'Turmeric', 'Cumin'], unit: 'a bag' },
  EGGS: { names: ['White', 'Brown', 'Speckled', 'Duck'], unit: 'half doz.' },
  OLIVES: { names: ['Green', 'Picholine', 'Kalamata', 'Cracked'], unit: 'per 100 g' },
};
const _stall = { x: 0, z: 0, c: 1, s: 0 };
const stallFrame = {
  world(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(_stall.x + x * _stall.c + z * _stall.s, y, _stall.z - x * _stall.s + z * _stall.c);
  },
};

/** chalk price card on a stick (w = 9 cm) */
function priceCard(env: Env, x: number, y: number, z: number, price: string, goods?: Goods, crate = 0): void {
  const K = env.S;
  K.rod(M('#d8c9a8', PAT.PLAIN, 0.8), [x, y - 0.14, z], [x, y + 0.02, z], 0.004, 3);
  if (stallLod) K.panel(M('#3a2c20', PAT.PLAIN, 0.9), 0.1, 0.07, x, y - 0.035, z - 0.001, 0, 1, 1, true);
  else K.box(M('#3a2c20', PAT.PLAIN, 0.9), 0.1, 0.07, 0.006, x, y - 0.005, z - 0.004);
  const card = env.atlas.add(80, 52, (g, w, h) => {
    g.fillStyle = '#1d211f';
    g.fillRect(0, 0, w, h);
    drawText(g, price, w / 2, h * 0.42, 'bold 20px Georgia, serif', '#f2efe6', 0);
    drawText(g, 'per kg', w / 2, h * 0.8, 'italic 12px Georgia, serif', '#d9d4c4', 0);
  }, `price:${price}`);
  signQuad(env.T, card, 0.09, 0.06, x, y, z + 0.0005, 0, 0);
  const w = goods && GOODS_WORDS[goods.name];
  if (w) markProp(stallFrame, 'pricecard', x, y + 0.03, z + 0.0015, 0.09, 0.06, 0, 0, `${w.names[crate % 4]}|£${price}|${w.unit}`);
}

export function genMarketStall(env: Env, f: Feature): void {
  const R = f.radius || 1.3;
  env.begin(f.x, 0, f.z, f.yaw);
  env.checkRadius(f.x, f.z, R, 'marketstall');
  _stall.x = f.x;
  _stall.z = f.z;
  _stall.c = Math.cos(f.yaw);
  _stall.s = Math.sin(f.yaw);
  const K = env.S;
  stallLod = geomHunt(env.ctx, 'marketlod');
  // the stalls' goods get a detail mesh of their own: the region's was drawn whenever any part of the 150 m cell was near
  const regionDetail = K.b.detail;
  if (stallLod) {
    K.b.detail = env.ownDetail('market');
    K.b.detail.setFrame(f.x, 0, f.z, f.yaw);
  }
  // individual produce, price cards, scales and ground clutter (off: low tier, ?nomarketdetail)
  richStall = !env.ctx.debug.params.has('nomarketdetail') && env.ctx.quality.level !== 'low';
  const stallWind = !env.ctx.debug.params.has('nostallwind') && env.ctx.quality.level !== 'low';
  const col = STALL_COLS[Number(f.params?.color ?? f.id) % STALL_COLS.length];
  const goods = stallGoods(env, f);
  const wood = M('#9a6b43', PAT.PLANKS, 0.85, 0, 0, 0, 0.4);
  const steel = M('#9aa2a6', PAT.PLAIN, 0.45, 0.6);
  const hw = 1.0,
    fz = 0.6,
    bz = -0.6;
  let seed = 1 + f.id * 7919;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ph = f.id * 1.7;
  // frame: round steel poles in square foot plates, top rails, a ridge pole (the cloth sags between them)
  const yF = 2.3, yB = 2.62;
  for (const [x, z, h] of [[-hw, fz, yF], [hw, fz, yF], [-hw, bz, yB], [hw, bz, yB]] as const) {
    K.box(M('#55595c', PAT.PLAIN, 0.7, 0.4), 0.16, 0.012, 0.16, x, 0, z);
    K.rod(steel, [x, 0, z], [x, h + 0.02, z], 0.022, 8);
    queueContactLocal(env, x, 0, z, 0.08, 0.08, 0.02, 0.14, 0.55);
  }
  K.rod(steel, [-hw - 0.05, yF, fz], [hw + 0.05, yF, fz], 0.018, 6);
  K.rod(steel, [-hw - 0.05, yB, bz], [hw + 0.05, yB, bz], 0.018, 6);
  for (const x of [-hw, hw, 0]) K.rod(steel, [x, yF, fz], [x, yB, bz], 0.018, 6); // side rails + the middle bow
  // canopy cloth: a grid sagging between the rails, overhanging the front; metric uvs keep the stripes running
  const canopy = M(col, f.id % 3 === 1 ? PAT.PLAIN : PAT.STRIPES, 0.85, 0, 0, 0, 0.2);
  const under = M('#efe9de', PAT.PLAIN, 0.8);
  const hem = M(f.id % 2 ? '#f1ece0' : '#3a3f44', PAT.PLAIN, 0.9);
  // F4 (judge 2 #9): the cloth was a board. Now it sags into the two bays either side of a middle bow (deepest
  // mid-bay, ~9 cm), the front overhang droops over the rail, and shallow tension folds fan in from the corners
  // where the canvas is tied down; every stall a little different (age / how hard it was pulled)
  const NX = stallLod ? 12 : 16, NZ = stallLod ? 4 : 6, x0 = -hw - 0.03, x1 = hw + 0.03, z0 = fz + 0.16, z1 = bz - 0.12; // corners stay inside r = 1.3
  const slack = 0.75 + 0.5 * rnd();
  const foldA = 0.004 + 0.006 * rnd(), foldK = 14 + 8 * rnd();
  const P = (i: number, j: number): [number, number, number] => {
    const u = i / NX, v = j / NZ;
    const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
    const yl = yF + (yB - yF) * ((z - fz) / (bz - fz));
    const tz = Math.min(1, Math.max(0, (z - fz) / (bz - fz)));
    const tx = Math.min(1, Math.max(0, (x + hw) / (2 * hw)));
    const bay = Math.abs(Math.sin(2 * Math.PI * tx)); // 0 on the side rails and the middle bow
    const sz = Math.sin(Math.PI * tz);
    let sag = slack * (0.075 * bay * sz + 0.025 * Math.sin(Math.PI * tx) * sz);
    // overhang: droops in front of the front rail, a little more mid-bay
    if (z > fz) sag += ((z - fz) / (z0 - fz)) ** 2 * (0.035 + 0.025 * bay);
    // tension folds radiating from the four tie-down corners, fading towards the middle of each bay
    const cx = Math.min(tx, 1 - tx) * 2,
      cz = Math.min(tz, 1 - tz) * 2;
    const corner = Math.max(0, 1 - Math.hypot(cx, cz) * 1.3);
    sag += foldA * corner * Math.sin(foldK * (Math.abs(x) * 1.2 + Math.abs(z - (fz + bz) / 2)));
    return [x, yl + 0.03 - sag, z];
  };
  // (the cloth + valance go to the kinetic kit and move with the shared wind: ANIM.CANOPY; ?nostallwind = static)
  const CK = stallWind ? env.K : K;
  if (stallWind) env.anim({ mode: ANIM.CANOPY, pivot: new THREE.Vector3(0, yF, (fz + bz) / 2), axis: new THREE.Vector3(1, 0, 0), a: hw + 0.02, b: (fz - bz) / 2, c: ph });
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NZ; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      const uv: [number, number][] = [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]], [d[0], d[2]]];
      CK.poly(canopy, [a, b, c, d], uv);
      CK.poly(under, [d, c, b, a], uv);
    }
  // scalloped valance along the front edge
  for (let i = 0; i < 10; i++) {
    const xa = x0 + ((x1 - x0) * i) / 10, xb = x0 + ((x1 - x0) * (i + 1)) / 10, xm = (xa + xb) / 2;
    const ya = P(0, 0)[1];
    const ya2 = P(Math.min(NX, Math.round(((xm - x0) / (x1 - x0)) * NX)), 0)[1]; // follows the drooping hem
    const zz = z0 + 0.008 * Math.sin(i * 2.1 + ph); // hangs with a slight ripple, not on one plane
    const pts: [number, number, number][] = [[xa, ya2, zz], [xb, ya2, zz], [xb, ya2 - 0.13, zz], [xm, ya2 - 0.19, zz], [xa, ya2 - 0.13, zz]];
    CK.poly(canopy, pts, pts.map((p) => [p[0], p[1]] as [number, number]), true);
    // the hem: a stitched binding along the scallop edge and the fold-over at the top
    const hz = zz + 0.002;
    CK.poly(hem, [[xa, ya2 - 0.13, hz], [xm, ya2 - 0.19, hz], [xm, ya2 - 0.17, hz], [xa, ya2 - 0.11, hz]], [[0, 0], [1, 0], [1, 1], [0, 1]], true);
    CK.poly(hem, [[xm, ya2 - 0.19, hz], [xb, ya2 - 0.13, hz], [xb, ya2 - 0.11, hz], [xm, ya2 - 0.17, hz]], [[0, 0], [1, 0], [1, 1], [0, 1]], true);
    CK.poly(hem, [[xa, ya2 - 0.025, hz], [xb, ya2 - 0.025, hz], [xb, ya2 - 0.005, hz], [xa, ya2 - 0.005, hz]], [[0, 0], [1, 0], [1, 1], [0, 1]], true);
  }
  if (stallWind) env.anim(null);
  // back cloth: a drape gathered on the rear rail (tight pleats at the top that open into deep, uneven
  // folds towards the hem), hem a little above the ground, one panel corner tucked back
  const backM = M(col, PAT.PLAIN, 0.92, 0, 0, 0, 0.35);
  for (const part of shell(stallLod ? 36 : 72, stallLod ? 4 : 10, (u, v, o) => {
    const x = -hw - 0.02 + (2 * hw + 0.04) * u;
    const dn = 1 - v; // 0 at the rail, 1 at the hem
    const amp = 0.018 + 0.035 * dn;
    const fz2 = amp * (Math.sin(x * 22 + ph) + 0.45 * Math.sin(x * 9.3 + ph * 1.7) + 0.25 * Math.sin(x * 41));
    const hem = 0.27 + 0.03 * Math.sin(x * 5 + ph) + (u > 0.88 ? (u - 0.88) * 1.2 : 0);
    o.set(x, yB - 0.03 - dn * (yB - 0.03 - hem), bz - 0.035 - fz2 - (u > 0.9 ? (u - 0.9) * 0.4 * dn : 0));
  }, 0.003, false, !stallLod)) {
    K.geo(backM, part);
    part.dispose();
  }
  // curtain rings on the rail
  if (stallLod) for (let i = 0; i <= 10; i += 2) K.cylX(steel, 0.024, 0.008, -hw + (2 * hw * i) / 10, yB - 0.005, bz, 5, 0, true);
  else for (let i = 0; i <= 10; i++) K.cylX(steel, 0.024, 0.008, -hw + (2 * hw * i) / 10, yB - 0.005, bz, 8);
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
  // table cloth (a 4 mm shell, sculpt.ts): laid flat over the top, rolling over the front edge and hanging
  // ~40 cm in soft folds that grow towards the hem (the trestles show below it); separate drops over the
  // two ends meet the front drop at the corners. Cloth differs per stall: linen, gingham-red, oilcloth
  // green, hessian.
  const clothCol = ['#efe6d2', '#b8443c', '#4f7a5a', '#a88b62', '#e9dfc8', '#3e5577'][(f.id * 5) % 6];
  const cloth = M(clothCol, PAT.PLAIN, 0.92, 0, 0, 0, 0.3);
  const tw = 2 * hw - 0.02, ct = ty + 0.037, drop = 0.36 + 0.06 * rnd(), td = 0.64;
  const folds = (x: number, a: number) => a * (0.6 * Math.sin(x * 17 + ph) + 0.3 * Math.sin(x * 31 + ph * 2.3) + 0.15 * Math.sin(x * 53));
  // top + front: v runs from the back edge over the top, round the edge, down to the hem
  const L0 = td, L1 = 0.03, L2 = drop;
  // (lod: the flat top is one row, the roll one, the drop four; the folds' finest wave is 12 cm, 32 columns = 6 cm)
  const clothS = (v: number) => {
    if (!stallLod) return v * (L0 + L1 + L2);
    const r = v * 6;
    return r <= 1 ? r * L0 : r <= 2 ? L0 + (r - 1) * L1 : L0 + L1 + ((r - 2) / 4) * L2;
  };
  for (const part of shell(stallLod ? 32 : 64, stallLod ? 6 : 16, (u, v, o) => {
    const x = tw / 2 + 0.01 - (tw + 0.02) * u;
    const s2 = clothS(v);
    if (s2 <= L0) o.set(x, ct, tz - td / 2 + s2);
    else if (s2 <= L0 + L1) {
      const a = ((s2 - L0) / L1) * Math.PI / 2;
      o.set(x, ct - 0.02 + Math.cos(a) * 0.02, tz + td / 2 - 0.02 + Math.sin(a) * 0.02 + 0.02);
    } else {
      const d = (s2 - L0 - L1) / L2;
      const amp = 0.045 * Math.pow(d, 1.3);
      const hemLift = d > 0.9 ? 0.012 * Math.sin(x * 23 + ph) * (d - 0.9) * 10 : 0;
      o.set(x, ct - 0.02 - d * L2 + hemLift, tz + td / 2 + 0.02 + amp * 0.5 + folds(x, amp));
    }
  }, 0.004, false, !stallLod)) {
    K.geo(cloth, part);
    part.dispose();
  }
  // end drops
  for (const sx of [-1, 1]) {
    for (const part of shell(stallLod ? 5 : 12, stallLod ? 3 : 10, (u, v, o) => {
      const z = tz - td / 2 + td * (sx > 0 ? 1 - u : u);
      const d = 1 - v;
      const amp = 0.035 * Math.pow(d, 1.3);
      o.set(sx * (tw / 2 + 0.01 + amp * 0.4 + folds(z + sx, amp)), ct - 0.01 - d * (drop - 0.04), z);
    }, 0.004, false, !stallLod)) {
      K.geo(cloth, part);
      part.dispose();
    }
  }
  K.b.forceDetail = true;
  // crates of produce on the table, tilted towards the aisle by a batten under the back edge
  const crateM = M(goods.crate, PAT.PLANKS, 0.85, 0, 0, 0, 0.6);
  for (let i = 0; i < 4; i++) {
    const x = -hw + 0.27 + i * 0.485;
    if (goods.name !== 'FLOWERS') slatCrate(K, crateM, 0.42, 0.13, 0.34, x, ty + 0.018, tz - 0.02, true);
    produce(K, goods, i, 0.42, 0.34, x, ty + 0.15, tz - 0.02, seed + i * 31);
    // price card on a stick, chalked
    if (richStall && goods.name !== 'FISH' && (i % 2 === 0 || rnd() < 0.6)) priceCard(env, x + 0.14, ty + 0.3, tz + 0.12, `${1 + Math.floor(rnd() * 5)}.${['20', '50', '80', '95', '40'][Math.floor(rnd() * 5)]}`, goods, i);
  }
  // scales on the corner of the table: an enamelled dial scale — cast base with a bevelled front, the round
  // dial facing the customer (white face, chapter ring, ticks, needle, glass bezel), a steel pan on top
  if (richStall && goods.name !== 'FLOWERS') {
    const sx = hw - 0.2, sz = tz + 0.14, sy = ct + 0.002;
    const enamel = M(['#b8322c', '#2f5d4a', '#e8e1cf', '#2b4c7e'][f.id % 4], PAT.PLAIN, 0.3, 0.1);
    const dialSeg = stallLod ? 12 : 18;
    K.box(enamel, 0.22, 0.045, 0.2, sx, sy, sz);
    K.boxC(enamel, 0.2, 0.03, 0.06, sx, sy + 0.055, sz + 0.07, -0.6, 0, 0);
    K.box(enamel, 0.07, 0.11, 0.07, sx, sy + 0.045, sz - 0.02);
    const dy = sy + 0.14, dz = sz + 0.03;
    K.cylX(enamel, 0.085, 0.05, sx, dy, dz, dialSeg, Math.PI / 2);
    K.cylX(M('#f6f3ea', PAT.PLAIN, 0.35), 0.072, 0.004, sx, dy, dz + 0.025, dialSeg, Math.PI / 2);
    K.cylX(M('#c9b26a', PAT.PLAIN, 0.3, 0.8), 0.079, 0.006, sx, dy, dz + 0.024, dialSeg, Math.PI / 2, true);
    const ink = M('#1d1f22', PAT.PLAIN, 0.5);
    if (stallLod) {
      // ticks + needle as flat quads on the dial (they were 3 mm boxes: 12 triangles each)
      const tick = (m: Mat, w: number, a: number, r0: number, r1: number) => {
        const s = Math.sin(a), c = Math.cos(a), z2 = dz + 0.0275, wx = c * w / 2, wy = -s * w / 2;
        const ax = sx + s * r0, ay = dy + c * r0, bx = sx + s * r1, by = dy + c * r1;
        K.poly(m, [[ax - wx, ay - wy, z2], [ax + wx, ay + wy, z2], [bx + wx, by + wy, z2], [bx - wx, by - wy, z2]]);
      };
      for (let t = 0; t < 10; t++) {
        const a = -2.4 + (4.8 * t) / 9;
        tick(ink, 0.003, a, 0.053, t % 3 === 0 ? 0.067 : 0.063);
      }
      tick(M('#c62828', PAT.PLAIN, 0.5), 0.003, -2.4 + rnd() * 0.6, -0.005, 0.055);
      K.sphere(ink, 0.006, sx, dy, dz + 0.0275, 4, 2);
    } else {
      for (let t = 0; t < 20; t++) {
        const a = -2.4 + (4.8 * t) / 19, big = t % 5 === 0;
        K.boxC(ink, 0.003, big ? 0.014 : 0.008, 0.001, sx + Math.sin(a) * 0.06, dy + Math.cos(a) * 0.06, dz + 0.028, 0, 0, -a);
      }
      const na = -2.4 + rnd() * 0.6;
      K.boxC(M('#c62828', PAT.PLAIN, 0.5), 0.003, 0.06, 0.001, sx + Math.sin(na) * 0.025, dy + Math.cos(na) * 0.025, dz + 0.029, 0, 0, -na);
      K.cylX(ink, 0.006, 0.004, sx, dy, dz + 0.029, 8, Math.PI / 2);
    }
    K.cylX(M('#dfe8ec', PAT.PLAIN, 0.05, 0.1), 0.073, 0.002, sx, dy, dz + 0.031, dialSeg, Math.PI / 2);
    // pan: a shallow dished steel bowl on a short column
    K.cyl(steel, 0.012, 0.012, 0.05, sx, dy + 0.085, sz - 0.03, 6, stallLod);
    K.cyl(steel, 0.13, 0.1, 0.028, sx, dy + 0.13, sz - 0.03, dialSeg);
    K.cyl(M('#7d8589', PAT.PLAIN, 0.35, 0.7), 0.118, 0.118, 0.002, sx, dy + 0.155, sz - 0.03, dialSeg);
    // a paper bag and a few brass weights beside it
    K.boxC(M('#c8a878', PAT.PLAIN, 0.95), 0.1, 0.13, 0.06, sx - 0.2, ct + 0.065, sz + 0.06, 0, 0.3, 0.05);
    for (let i = 0; i < 3; i++) K.cyl(M('#b8963c', PAT.PLAIN, 0.35, 0.9), 0.018 - i * 0.004, 0.02 - i * 0.004, 0.03 - i * 0.006, sx + 0.08 + i * 0.035, ct, sz + 0.1, 10);
  }
  // back shelf (a board on two crates) with more stock
  K.box(wood, 2 * hw - 0.2, 0.03, 0.32, 0, 0.62, bz + 0.24);
  for (let i = 0; i < 3; i++) {
    const x = -0.6 + i * 0.6;
    slatCrate(K, crateM, 0.42, 0.26, 0.3, x, 0.65, bz + 0.24, true);
    produce(K, goods, i + 1, 0.42, 0.3, x, 0.92, bz + 0.24, seed + 97 * i);
  }
  for (const x of [-0.75, 0.75]) slatCrate(K, crateM, 0.42, 0.3, 0.3, x, 0.3, bz + 0.24, true);
  if (richStall) {
    // on the ground: stacked empty crates, flattened cardboard, a box with tape, sometimes a hand truck
    slatCrate(K, crateM, 0.42, 0.3, 0.32, -hw + 0.35, 0, bz + 0.2, true);
    for (let i = 0; i < 2; i++) slatCrate(K, crateM, 0.42, 0.13, 0.32, -hw + 0.36 + i * 0.01, 0.3 + i * 0.14, bz + 0.2, i === 0);
    // under the table: reserve stock in crates (one stacked), a lidded cardboard box
    slatCrate(K, crateM, 0.42, 0.26, 0.32, -0.3, 0, tz - 0.04, goods.name !== 'FLOWERS');
    if (goods.name !== 'FLOWERS') produce(K, goods, 2, 0.42, 0.32, -0.3, 0.25, tz - 0.04, seed + 501);
    slatCrate(K, crateM, 0.42, 0.18, 0.32, 0.25, 0, tz - 0.02, true);
    slatCrate(K, crateM, 0.42, 0.18, 0.32, 0.27, 0.185, tz - 0.03);
    const card = M('#b8915f', PAT.PLAIN, 0.95);
    const card2 = M('#a8824f', PAT.PLAIN, 0.95);
    K.boxC(card, 0.5, 0.008, 0.38, hw - 0.4, 0.005, bz + 0.15, 0, rnd(), 0);
    // flattened boxes leaning on the table end, a box with open flaps on the ground at the front corner
    const ex = (f.id % 2 ? 1 : -1) * (hw + 0.07);
    for (let i = 0; i < 3; i++) K.boxC(i % 2 ? card2 : card, 0.008, 0.62 - i * 0.07, 0.5 - i * 0.04, ex + Math.sign(ex) * i * 0.012, 0.3 - i * 0.03, tz - 0.2 + i * 0.03, 0, 0, Math.sign(ex) * (0.2 + i * 0.03));
    const bx = -ex * 0.66, bzz = fz + 0.02, bw = 0.38, bh = 0.26, bd = 0.28;
    K.box(card, bw, bh, bd, bx, 0, bzz, 0.15);
    K.box(M('#d9c9a0', PAT.PLAIN, 0.4), 0.05, 0.003, bd + 0.002, bx, bh - 0.002, bzz, 0.15);
    for (const s2 of [-1, 1]) K.boxC(card2, bw * 0.96, 0.004, bd * 0.45, bx + Math.sin(0.15) * s2 * bd * 0.55, bh + 0.06, bzz + Math.cos(0.15) * s2 * bd * 0.55, s2 * 1.0, 0.15, 0);
    K.box(M('#7a1f1f', PAT.PLAIN, 0.6), 0.08, 0.05, 0.002, bx, bh * 0.45, bzz + bd / 2 + 0.001, 0.15);
    // hand truck (sack barrow) leaning back against the other table end, wheels on the ground
    {
      const hx = -ex - Math.sign(ex) * 0.02, hz = tz - 0.32, lean = 0.32;
      const blue = M(['#2d4f7a', '#b8322c', '#3a3d3f'][f.id % 3], PAT.PLAIN, 0.5, 0.3);
      const top = (h: number): [number, number, number] => [hx + Math.sign(ex) * Math.sin(lean) * h, Math.cos(lean) * h + 0.1, hz];
      for (const s2 of [-1, 1]) {
        const a: [number, number, number] = [hx, 0.1, hz + s2 * 0.17];
        const t = top(1.1);
        K.rod(blue, a, [t[0], t[1], hz + s2 * 0.15], 0.013, 6);
        K.cylX(M('#1c1c1c', PAT.PLAIN, 0.9), 0.1, 0.055, hx + Math.sign(ex) * 0.05, 0.1, hz + s2 * 0.26, 12, Math.PI / 2);
        K.cylX(M('#9aa2a6', PAT.PLAIN, 0.4, 0.6), 0.04, 0.06, hx + Math.sign(ex) * 0.05, 0.1, hz + s2 * 0.26, 8, Math.PI / 2);
      }
      for (const h of [0.45, 0.8]) {
        const t = top(h);
        K.rod(blue, [t[0], t[1], hz - 0.16], [t[0], t[1], hz + 0.16], 0.01, 5);
      }
      const t1 = top(1.1);
      K.rod(M('#1c1c1c', PAT.PLAIN, 0.9), [t1[0], t1[1], hz - 0.15], [t1[0], t1[1], hz + 0.15], 0.016, 6);
      K.cylX(steel, 0.008, 0.48, hx + Math.sign(ex) * 0.05, 0.1, hz, 6, Math.PI / 2);
      K.boxC(M('#55595c', PAT.PLAIN, 0.6, 0.5), 0.2, 0.008, 0.34, hx - Math.sign(ex) * 0.08, 0.02, hz, 0, 0, Math.sign(ex) * -lean * 0.15);
    }
  }
  K.b.forceDetail = false;
  K.b.detail = regionDetail;
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
  if (boxHunt(env.ctx, 'schoolrail')) schoolBounds(env);
}

/**
 * Box hunt (?noschoolrail): the school grounds fenced like a real school — 1.6 m steel bar railings with posts and
 * ball finials round the open sides of the block (yard, lawns), a double gate into the yard on the east side and
 * pedestrian gates (front lawn, between the two buildings), a row of Sheffield bike stands inside the yard gate.
 */
function schoolBounds(env: Env): void {
  const plan = env.ctx.plan;
  const yard = plan.areas.find((a) => a.kind === 'schoolyard');
  const lots = plan.lots.filter((l) => l.kind === 'school' && l.footprint);
  if (!yard || lots.length < 2) return;
  const blk = plan.blocks[yard.blockId].rect;
  const [fpA, fpB] = lots.map((l) => l.footprint!);
  const H = 1.6,
    ins = 0.3;
  const x0 = blk.x0 + ins,
    x1 = blk.x1 - ins,
    z0 = blk.z0 + ins,
    z1 = blk.z1 - ins;
  env.begin(0, 0, 0, 0);
  env.checkRect(blk, 'school railings', 0.05);
  const green = '#2b4a3b';
  const steel = M(green, PAT.PLAIN, 0.5, 0.45);
  const D = env.D;
  /** a straight run from a to b (y 0) with posts every ≤ 2.5 m; gaps [t0, t1] (m along the run) left open */
  const run = (ax: number, az: number, bx: number, bz: number, gaps: [number, number][] = []): void => {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) return;
    const ux = (bx - ax) / L,
      uz = (bz - az) / L;
    const cuts = [0, ...gaps.flat(), L];
    for (let i = 0; i < cuts.length; i += 2) {
      const s0 = cuts[i],
        s1 = cuts[i + 1];
      if (s1 - s0 < 0.2) continue;
      railing(env, [ax + ux * s0, 0, az + uz * s0], [ax + ux * s1, 0, az + uz * s1], H, green, false, true);
      const n = Math.max(1, Math.ceil((s1 - s0) / 2.5));
      for (let k = 0; k <= n; k++) {
        const s = s0 + ((s1 - s0) * k) / n;
        const px = ax + ux * s,
          pz = az + uz * s;
        D.box(steel, 0.07, H + 0.06, 0.07, px, 0, pz, Math.atan2(ux, uz));
        D.sphere(steel, 0.045, px, H + 0.1, pz, 6, 4);
      }
    }
  };
  /** a gate leaf hung at (hx, hz) running w along (ux, uz): frame, bar infill, a latch */
  const leaf = (hx: number, hz: number, ux: number, uz: number, w: number): void => {
    const ex = hx + ux * w,
      ez = hz + uz * w;
    railing(env, [hx, 0.05, hz], [ex, 0.05, ez], H - 0.05, green, false, true);
    const ry = Math.atan2(ux, uz);
    for (const y of [0.08, H - 0.02, H * 0.5]) env.S.box(steel, 0.05, 0.05, w, (hx + ex) / 2, y - 0.025, (hz + ez) / 2, ry);
    for (const [x, z] of [
      [hx + ux * 0.03, hz + uz * 0.03],
      [ex - ux * 0.03, ez - uz * 0.03],
    ])
      env.S.box(steel, 0.05, H, 0.05, x, 0.03, z);
    D.box(M('#9aa0a4', PAT.PLAIN, 0.4, 0.7), 0.04, 0.1, 0.12, ex - ux * 0.06, 1.0, ez - uz * 0.06, ry);
  };
  /** gate posts (0.14 m, capped) either side of an opening from s0 to s1 along a run */
  const gatePosts = (ax: number, az: number, ux: number, uz: number, s0: number, s1: number): void => {
    for (const s of [s0, s1]) {
      const px = ax + ux * s,
        pz = az + uz * s;
      env.S.box(steel, 0.14, H + 0.2, 0.14, px, 0, pz);
      env.S.box(steel, 0.18, 0.04, 0.18, px, H + 0.2, pz);
      D.sphere(steel, 0.06, px, H + 0.3, pz, 8, 6);
    }
  };
  // north side: the front lawn east of the main building, with a pedestrian gate
  const nA = Math.max(fpA.x1, fpB.x1) + 0.3;
  const nMid = (nA + x1) / 2 - nA;
  run(nA, z0, x1, z0, [[nMid - 0.6, nMid + 0.6]]);
  gatePosts(nA, z0, 1, 0, nMid - 0.6, nMid + 0.6);
  leaf(nA + nMid - 0.55, z0, 1, 0, 1.08);
  // east side: double gate into the yard (open inwards a little), bike stands just inside
  const gz = yard.rect.z0 + 3.2;
  const g0 = gz - z0,
    g1 = gz + 4 - z0;
  run(x1, z0, x1, z1, [[g0, g1]]);
  gatePosts(x1, z0, 0, 1, g0, g1);
  const open = 0.5;
  leaf(x1, gz + 0.07, -Math.sin(open), Math.cos(open), 1.9);
  leaf(x1, gz + 4 - 0.07, -Math.sin(open), -Math.cos(open), 1.9);
  // south side and the west lawn
  run(x0, z1, x1, z1);
  const wA = Math.max(fpA.z1, fpB.z1) + 0.3;
  run(x0, wA, x0, z1);
  // the gap between the two buildings on the west side: a pedestrian gate
  const lo = Math.min(fpA.z1, fpB.z1),
    hi = Math.max(fpA.z0, fpB.z0);
  if (hi - lo > 1.6) {
    gatePosts(x0, lo, 0, 1, 0.1, hi - lo - 0.1);
    leaf(x0, lo + 0.17, 0, 1, hi - lo - 0.34);
  }
  // Sheffield bike stands: inverted U hoops in a row inside the yard gate
  const hoop = M('#7d8489', PAT.PLAIN, 0.35, 0.8);
  for (let i = 0; i < 5; i++) {
    const sz = gz + 5.4 + i * 0.9,
      sx = x1 - 1.6;
    for (const dx of [-0.3, 0.3]) env.S.rod(hoop, [sx + dx, 0, sz], [sx + dx, 0.55, sz], 0.025, 6);
    env.S.torus(hoop, 0.3, 0.025, sx, 0.55, sz, 4, 10, Math.PI, 0, 0, 0);
  }
  env.endChecks();
}
