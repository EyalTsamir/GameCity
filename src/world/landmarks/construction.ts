// Construction site ('Haven Heights'): a partially built concrete frame (slabs, columns, a
// core rising above, brick infill on the lower floors, rebar starters, formwork), scaffolding
// with toe boards and safety netting, a hoarding with signage, a mesh fence and gate, site
// cabins, a portable toilet, a skip, material piles, a parked excavator, workers (visible in
// working hours) — and the animated tower crane (plan feature 'towercrane'): slewing jib,
// trolley, hook and load in a pick-up / set-down loop, warning lights.

import * as THREE from 'three';
import type { Feature, Lot } from '../../core/plan';
import { ANIM, LM, LMODE, M, PAT } from './builder';
import { V3 } from './kit';
import { wall } from './facade';
import { C, person, railing } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';

export interface CraneTargets {
  /** pick-up / set-down spots (world) with the surface height the load rests on */
  pick: { x: number; z: number; y: number };
  drops: { x: number; z: number; y: number }[];
}

export function genConstruction(env: Env, lot: Lot): CraneTargets {
  const site = lot.rect;
  const fp = lot.footprint;
  const scx = (site.x0 + site.x1) / 2,
    scz = (site.z0 + site.z1) / 2;
  env.begin(scx, 0, scz, 0);
  const K = env.S;
  // site-local helpers
  const SX = (site.x1 - site.x0) / 2,
    SZ = (site.z1 - site.z0) / 2;
  const fx0 = fp.x0 - scx + 0.55,
    fx1 = fp.x1 - scx - 1.1,
    fz0 = fp.z0 - scz + 0.55,
    fz1 = fp.z1 - scz - 1.0;

  const conc = M('#c9c6bf', PAT.CONCRETE, 0.9, 0, 0, 0, 0.4);
  const concDark = M('#a9a59d', PAT.CONCRETE, 0.92, 0, 0, 0, 0.7);
  const brick = M('#b0644a', PAT.BRICK, 0.9, 0, 0, 0, 0.6);
  const rust = M('#7a4a33', PAT.RUST, 0.85, 0.3, 0, 0, 0.3);
  const ply = M('#d9a25b', PAT.PLANKS, 0.85, 0, 0, 0, 0.2);
  const yellow = M(C.craneYellow, PAT.PLAIN, 0.6, 0.2);

  // ── the frame (inside the footprint)
  env.checkLot(fp, 'construction frame');
  const nx = 4,
    nz = 6;
  const xs = Array.from({ length: nx }, (_, i) => fx0 + ((fx1 - fx0) * i) / (nx - 1));
  const zs = Array.from({ length: nz }, (_, i) => fz0 + ((fz1 - fz0) * i) / (nz - 1));
  const FH = 3.4;
  const slabT = 0.26;
  const levels = 4; // completed slabs above ground
  K.box(concDark, fx1 - fx0 + 0.6, 0.3, fz1 - fz0 + 0.6, (fx0 + fx1) / 2, 0, (fz0 + fz1) / 2);
  for (let l = 1; l <= levels; l++) {
    const y = l * FH;
    K.box(conc, fx1 - fx0 + 0.5, slabT, fz1 - fz0 + 0.5, (fx0 + fx1) / 2, y - slabT, (fz0 + fz1) / 2);
    // slab edge
    K.box(concDark, fx1 - fx0 + 0.56, 0.08, fz1 - fz0 + 0.56, (fx0 + fx1) / 2, y - slabT - 0.08, (fz0 + fz1) / 2);
  }
  for (let l = 0; l < levels; l++) {
    for (const x of xs) for (const z of zs) K.box(conc, 0.42, FH - slabT, 0.42, x, l * FH + (l === 0 ? 0.3 : 0), z);
  }
  // 5th floor: columns on the northern half + a partial formwork deck
  const top = levels * FH;
  const zMid = (fz0 + fz1) / 2;
  for (const x of xs) for (const z of zs) if (z < zMid) K.box(conc, 0.42, FH - slabT, 0.42, x, top, z);
  K.box(ply, (fx1 - fx0) * 0.55, 0.12, (zMid - fz0) * 0.9, fx0 + (fx1 - fx0) * 0.28, top + FH - slabT, fz0 + (zMid - fz0) * 0.46);
  // props under the formwork deck
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) K.box(M('#8f9aa3', PAT.PLAIN, 0.5, 0.6), 0.06, FH - slabT, 0.06, fx0 + 0.8 + i * 1.4, top, fz0 + 0.8 + j * 2.2);
  // rebar starters on the southern half
  for (const x of xs)
    for (const z of zs)
      if (z >= zMid)
        for (const [dx, dz] of [
          [-0.12, -0.12],
          [0.12, -0.12],
          [-0.12, 0.12],
          [0.12, 0.12],
        ])
          K.box(rust, 0.035, 1.2, 0.035, x + dx, top, z + dz);
  // core (lift + stairs) rising above, with climbing formwork on top
  const cx0 = (fx0 + fx1) / 2 - 1.5,
    cz0 = fz0 + (fz1 - fz0) * 0.32;
  K.box(conc, 3.1, top + FH + 1.8, 4.2, cx0 + 1.55, 0, cz0 + 2.1);
  K.box(ply, 3.4, 1.4, 4.5, cx0 + 1.55, top + FH + 1.8, cz0 + 2.1);
  railing(env, [cx0 - 0.15, top + FH + 3.2, cz0 - 0.15], [cx0 + 3.25, top + FH + 3.2, cz0 - 0.15], 1.0, '#e8c22e');
  // brick infill + window openings on the ground and first floors (north + west faces)
  for (let l = 0; l < 2; l++) {
    const y = l * FH + (l === 0 ? 0.3 : 0);
    const h = FH - slabT - (l === 0 ? 0.3 : 0);
    // north face (facing -z)
    for (let i = 0; i < nx - 1; i++) {
      const w = xs[i + 1] - xs[i] - 0.42;
      wall(K, { w, h, depth: 0.2, x: (xs[i] + xs[i + 1]) / 2, y, z: fz0 - 0.05, ry: Math.PI, mat: brick, openings: [{ x: w / 2, y: 0.9, w: 1.4, h: 1.5, fill: 'dark' }] });
    }
    // west face
    for (let j = 0; j < nz - 1; j++) {
      if (l === 1 && j > 2) continue;
      const w = zs[j + 1] - zs[j] - 0.42;
      wall(K, { w, h, depth: 0.2, x: fx0 - 0.05, y, z: (zs[j] + zs[j + 1]) / 2, ry: -Math.PI / 2, mat: brick, openings: [{ x: w / 2, y: 0.9, w: 1.4, h: 1.5, fill: 'dark' }] });
    }
  }
  // edge protection on the open floors
  for (let l = 2; l <= levels; l++) {
    const y = l * FH;
    railing(env, [fx1 + 0.22, y, fz0 - 0.2], [fx1 + 0.22, y, fz1 + 0.2], 1.0, '#e8c22e');
  }
  // scaffolding on the east and south faces (cutout planes + plank decks), netting on top lifts
  const scH = top + 2.0;
  const scafM = M('#9aa2a8', PAT.SCAFFOLD, 0.5, 0.5, 0, 0, 0.2);
  const ex = fx1 + 0.85,
    sz = fz1 + 0.85;
  // tube-and-fitting scaffold (?nositedetail / quality low: the old cutout planes): standards on sole boards and
  // base plates, ledgers + transoms at every 2 m lift, guard rails and toe boards on the outer line, a zig-zag of
  // façade braces; the plank decks below lie on the transoms
  const tubes = !env.ctx.debug.params.has('nositedetail') && env.ctx.quality.level !== 'low';
  if (!tubes) {
    env.K.quad(scafM, [ex, 0, fz1 + 0.85], [ex, 0, fz0 - 0.3], [ex, scH, fz0 - 0.3], [ex, scH, fz1 + 0.85], fz1 - fz0 + 1.15, scH);
    env.K.quad(scafM, [fx0 - 0.3, 0, sz], [ex, 0, sz], [ex, scH, sz], [fx0 - 0.3, scH, sz], ex - fx0 + 0.3, scH);
  } else {
    const tube = M('#a7aeb3', PAT.PLAIN, 0.42, 0.65, 0, 0, 0.35);
    const toe = M('#c79a5e', PAT.PLANKS, 0.85, 0, 0, 0, 0.6);
    const sole = M('#9a7a52', PAT.PLANKS, 0.9, 0, 0, 0, 0.8);
    const R = 0.024;
    // one face: outer line at `o`, inner at `o - inward`, running along `a0..a1`; axis 'z' (east) or 'x' (south)
    const face = (axis: 'x' | 'z', o: number, inward: number, a0: number, a1: number) => {
      const P = (a: number, y: number, inner: boolean): V3 => {
        const c = inner ? o - inward : o;
        return axis === 'z' ? [c, y, a] : [a, y, c];
      };
      const n = Math.max(1, Math.round((a1 - a0) / 2.1));
      const as = Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n);
      for (const a of as)
        for (const inner of [false, true]) {
          K.rod(tube, P(a, 0.06, inner), P(a, scH + (inner ? 0 : 1.1), inner), R, 6);
          const b = P(a, 0, inner);
          K.box(M('#7d8489', PAT.PLAIN, 0.5, 0.6), 0.15, 0.012, 0.15, b[0], 0.045, b[2]);
          // sole boards run across both standards, kept inside the footprint
          if (!inner) K.box(sole, axis === 'z' ? 1.0 : 0.22, 0.04, axis === 'z' ? 0.22 : 1.0, b[0] - (axis === 'z' ? 0.42 : 0), 0.0, b[2] - (axis === 'x' ? 0.42 : 0));
        }
      for (let y = 2; y < scH + 0.1; y += 2) {
        for (const inner of [false, true]) K.rod(tube, P(a0 - 0.15, y - 0.06, inner), P(a1 + 0.15, y - 0.06, inner), R, 6);
        for (const a of as) K.rod(tube, P(a, y - 0.02, true), P(a, y - 0.02, false), R, 6);
        // guard rails + toe board on the outer line
        K.rod(tube, P(a0, y + 0.5, false), P(a1, y + 0.5, false), R, 6);
        K.rod(tube, P(a0, y + 1.0, false), P(a1, y + 1.0, false), R, 6);
        const t0 = P(a0, y, false),
          t1 = P(a1, y, false);
        K.box(toe, axis === 'z' ? 0.03 : a1 - a0, 0.15, axis === 'z' ? a1 - a0 : 0.03, (t0[0] + t1[0]) / 2 - (axis === 'z' ? 0.04 : 0), y + 0.04, (t0[2] + t1[2]) / 2 - (axis === 'x' ? 0.04 : 0));
      }
      // façade braces: zig-zag over two bays on the outer line, every lift
      for (let i = 0; i + 2 <= n; i += 3)
        for (let y = 0; y < scH - 1; y += 2) {
          const up = ((y / 2) | 0) % 2 === 0;
          K.rod(tube, P(as[i], y + (up ? 0.1 : 2.0), false), P(as[i + 2], y + (up ? 2.0 : 0.1), false), R * 0.9, 5);
        }
    };
    face('z', ex, 0.75, fz0 - 0.3, fz1 + 0.85);
    face('x', sz, 0.75, fx0 - 0.3, ex - 0.75);
  }
  for (let y = 2; y < scH; y += 2) {
    K.box(M('#b9894f', PAT.PLANKS, 0.85, 0, 0, 0, 0.7), 0.72, 0.05, fz1 - fz0 + 1.1, ex - 0.37, y, (fz0 + fz1) / 2 + 0.25);
    K.box(M('#b9894f', PAT.PLANKS, 0.85), ex - fx0 + 0.25, 0.05, 0.72, (fx0 + ex) / 2 - 0.1, y, sz - 0.37);
  }
  const net = M('#3b8f5a', PAT.MESH, 0.9, 0, 0, 0, 0.8);
  env.K.quad(net, [ex + 0.05, 8, fz1 + 0.9], [ex + 0.05, 8, fz0 - 0.3], [ex + 0.05, scH, fz0 - 0.3], [ex + 0.05, scH, fz1 + 0.9], fz1 - fz0 + 1.2, scH - 8);
  env.endChecks();

  // ── yard (inside the site rect)
  env.checkRect(site, 'construction yard');
  // material hoist (lattice lift tower + cage) beside the east scaffold
  {
    const hx = ex + 0.75,
      hz = (fz0 + fz1) / 2 + 3.5,
      hw = 0.45,
      hT = scH + 1.5;
    const lat = M('#e2b324', PAT.LATTICE, 0.55, 0.3, 0.9, 0, 0.3);
    env.K.quad(lat, [hx - hw, 0.2, hz + hw], [hx - hw, hT, hz + hw], [hx + hw, hT, hz + hw], [hx + hw, 0.2, hz + hw], hT - 0.2, 0.9);
    env.K.quad(lat, [hx + hw, 0.2, hz + hw], [hx + hw, hT, hz + hw], [hx + hw, hT, hz - hw], [hx + hw, 0.2, hz - hw], hT - 0.2, 0.9);
    env.K.quad(lat, [hx + hw, 0.2, hz - hw], [hx + hw, hT, hz - hw], [hx - hw, hT, hz - hw], [hx - hw, 0.2, hz - hw], hT - 0.2, 0.9);
    K.box(M('#8f9aa3', PAT.PLAIN, 0.5, 0.5), 1.1, 0.2, 1.1, hx, 0, hz);
    K.box(M('#d9dde0', PAT.CORRUGATED, 0.5, 0.4), 0.9, 1.4, 1.2, hx - 0.9, 7.2, hz);
    void yellow;
  }
  // crane pick-up stack of brick pallets
  const pickL = { x: fx0 + 2.0, z: fz1 + 5.0 };
  // a real pallet: three bearers on nine blocks, five top deck boards; brick packs strapped both ways, some
  // opened with the top courses taken; an empty pallet stack beside
  const palletM = [M('#a1774d', PAT.PLANKS, 0.9, 0, 0, 0, 0.6), M('#8e6a44', PAT.PLANKS, 0.92, 0, 0, 0, 0.8), M('#b89062', PAT.PLANKS, 0.88, 0, 0, 0, 0.5)];
  const pallet = (px: number, py: number, pz: number, ry: number, m: (typeof palletM)[number]) => {
    if (!env.ctx.debug.params.has('nositedetail') && env.ctx.quality.level !== 'low') {
      const cs = Math.cos(ry),
        sn = Math.sin(ry);
      const at = (lx: number, lz: number): [number, number] => [px + lx * cs + lz * sn, pz - lx * sn + lz * cs];
      for (const lz of [-0.42, 0, 0.42]) {
        for (const lx of [-0.45, 0, 0.45]) {
          const [x, z] = at(lx, lz);
          K.box(m, 0.14, 0.08, 0.14, x, py, z, ry);
        }
        const [x, z] = at(0, lz);
        K.box(m, 1.1, 0.022, 0.12, x, py + 0.08, z, ry);
      }
      for (let k = 0; k < 5; k++) {
        const [x, z] = at(-0.48 + k * 0.24, 0);
        K.box(m, 0.13, 0.022, 1.0, x, py + 0.102, z, ry);
      }
    } else K.box(m, 1.1, 0.14, 1.0, px, py, pz, ry);
  };
  const strap = M('#2a2c2e', PAT.PLAIN, 0.6, 0.3);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j;
      const px = pickL.x + (i - 1) * 1.25 + ((k * 37) % 7) * 0.012,
        pz = pickL.z + (j - 0.5) * 1.15 + ((k * 13) % 5) * 0.01;
      const ry = (((k * 29) % 9) - 4) * 0.012;
      pallet(px, 0, pz, ry, palletM[k % 3]);
      const bm = M(k % 3 === 2 ? '#a24c36' : k % 3 === 1 ? '#c06a48' : '#b5563c', PAT.BRICK, 0.9, 0, 0, 0, 0.9);
      const opened = k === 1 || k === 4;
      const h = opened ? 0.62 : 0.85;
      K.box(bm, 1.0, h, 0.9, px, 0.14, pz, ry);
      if (opened) K.box(bm, 0.5, 0.15, 0.9, px - 0.25, 0.14 + h, pz, ry);
      else {
        for (const d of [-0.25, 0.25]) {
          K.box(strap, 0.02, 0.012, 0.92, px + d, 0.14 + h, pz, ry);
          K.box(strap, 1.02, 0.012, 0.02, px, 0.14 + h, pz + d, ry);
        }
        // polythene hood on the unopened packs
        K.box(M('#e8ece9', PAT.PLAIN, 0.35, 0, 0, 0, 0.1), 1.02, 0.18, 0.92, px, 0.14 + h - 0.17, pz, ry);
      }
    }
  for (let k = 0; k < 6; k++) pallet(pickL.x + 0.2 + (k % 2) * 0.03, k * 0.144, pickL.z + 1.75 - (k % 3) * 0.02, ((k * 5) % 3 - 1) * 0.03, palletM[k % 3]);
  // sand heap, gravel heap
  K.cone(M('#d9c08a', PAT.GRAVEL, 0.95, 0, 0, 0, 0.3), 2.0, 1.3, fx0 + 0.2, 0, SZ - 3.2, 14);
  K.cone(M('#9d978d', PAT.GRAVEL, 0.95, 0, 0, 0, 0.6), 1.5, 1.0, fx0 + 3.4, 0, SZ - 2.0, 12);
  // rebar bundles + pipes + timber
  const fine = env.ctx.quality.level !== 'low' && !env.ctx.debug.params.has('nositedetail');
  if (fine) {
    // rebar: bundles of 16–25 mm bars on timber bearers, the wire ties, a tagged end, a few bars pulled out askew
    const bearer = M('#8c6a45', PAT.PLANKS, 0.9, 0, 0, 0, 0.8);
    for (const bx of [-3.2, -1.0, 1.2]) K.box(bearer, 0.1, 0.1, 1.6, bx, 0, fz1 + 2.5);
    for (let bnd = 0; bnd < 3; bnd++) {
      const bz = fz1 + 1.95 + bnd * 0.5,
        L = 5.4 - bnd * 0.6;
      const rbar = M(bnd === 1 ? '#6b3f2c' : '#7a4a33', PAT.RUST, 0.85, 0.35, 0, 0, 0.4 + bnd * 0.2);
      for (let k = 0; k < 14; k++) {
        const row = Math.floor(k / 5),
          col = k % 5;
        K.cylX(rbar, 0.011, L + ((k * 7) % 3) * 0.12, -1.0 + ((k * 3) % 4) * 0.04, 0.1 + 0.012 + row * 0.022, bz - 0.05 + col * 0.024 + row * 0.011, 4);
      }
      for (const tx of [-2.6, -1.0, 0.6]) K.cyl(M('#3a3a38', PAT.PLAIN, 0.6, 0.6), 0.075, 0.075, 0.012, tx, 0.155, bz + 0.0, 8, true);
      K.box(M(bnd === 0 ? '#e8c13a' : '#d9d6cc', PAT.PLAIN, 0.8), 0.06, 0.09, 0.005, -1.0 - L / 2 - 0.02, 0.1, bz + 0.07);
    }
    K.boxC(M('#7a4a33', PAT.RUST, 0.85, 0.35, 0, 0, 0.5), 4.6, 0.022, 0.022, -0.8, 0.2, fz1 + 3.35, 0, 0.25, 0.03);
    K.boxC(M('#7a4a33', PAT.RUST, 0.85, 0.35, 0, 0, 0.5), 3.8, 0.022, 0.022, -1.4, 0.012, fz1 + 3.6, 0, -0.12, 0);
    // concrete drainage pipes: two on chocked bearers and one nested on top, socket (bell) ends alternating
    const pipeM = M('#a8a49b', PAT.CONCRETE, 0.92, 0, 0, 0, 0.6),
      pipeD = M('#8f8b82', PAT.CONCRETE, 0.95, 0, 0, 0, 0.8);
    const px0 = SX - 2.2,
      pz0 = fz1 + 2.6;
    for (const dz of [-1.0, 1.0]) K.box(bearer, 2.0, 0.1, 0.12, px0, 0, pz0 + dz);
    const pipe = (y: number, z: number, flip: number) => {
      K.cylX(pipeM, 0.42, 2.2, px0, y, z, 16);
      K.cylX(pipeD, 0.3, 2.21, px0, y, z, 16, 0, true);
      K.cylX(pipeM, 0.5, 0.3, px0 + flip * 1.0, y, z, 16);
      K.cylX(pipeD, 0.48, 0.02, px0 + flip * 1.16, y, z, 16);
    };
    pipe(0.52, pz0 - 0.46, 1);
    pipe(0.52, pz0 + 0.46, -1);
    pipe(0.52 + 0.8, pz0, 1);
    for (const dz of [-0.95, 0.95]) K.box(bearer, 0.18, 0.16, 0.12, px0 - 0.8, 0.1, pz0 + dz);
    // orange twin-wall ducting, a bundle strapped together
    const duct = M('#d9661f', PAT.CORRUGATED, 0.7, 0, 0, 0, 0.3);
    for (let k = 0; k < 5; k++) K.cylX(duct, 0.075, 5.8, 2.0, 0.075 + (k > 2 ? 0.13 : 0), fz1 + 4.2 + (k % 3) * 0.155 + (k > 2 ? 0.075 : 0), 8);
  } else {
    for (let i = 0; i < 4; i++) K.box(rust, 5.5, 0.18, 0.32, -1.0 + (i % 2) * 0.1, i * 0.18, fz1 + 2.3 + (i % 2) * 0.1);
    for (let i = 0; i < 3; i++) K.cylX(M('#bdb8ae', PAT.CONCRETE, 0.9), 0.45, 2.4, SX - 2.2, 0.45, fz1 + 2.2 + i * 1.0, 14, 0, true);
  }
  for (let i = 0; i < 5; i++) K.box(M('#c9995c', PAT.PLANKS, 0.85, 0, 0, 0, 0.7), 3.6, 0.16, 0.9, -6.0, i * 0.17, -SZ + 2.4);
  // skip: tapered steel body with ribs, lifting lugs, rubble heaped in it (broken block, timber, plasterboard)
  {
    const kx = -SX + 2.2,
      kz = SZ - 6.6;
    const skipM = M('#e0a21b', PAT.RUST, 0.7, 0.3, 0, 0, 0.55);
    const h = 1.25;
    // sloped ends (wider at the top), straight sides
    K.poly(skipM, [[kx - 1.45, 0.12, kz - 0.9], [kx + 1.45, 0.12, kz - 0.9], [kx + 1.75, 0.12 + h, kz - 0.9], [kx - 1.75, 0.12 + h, kz - 0.9]], undefined, true);
    K.poly(skipM, [[kx - 1.45, 0.12, kz + 0.9], [kx + 1.45, 0.12, kz + 0.9], [kx + 1.75, 0.12 + h, kz + 0.9], [kx - 1.75, 0.12 + h, kz + 0.9]], undefined, true);
    K.poly(skipM, [[kx - 1.45, 0.12, kz - 0.9], [kx - 1.75, 0.12 + h, kz - 0.9], [kx - 1.75, 0.12 + h, kz + 0.9], [kx - 1.45, 0.12, kz + 0.9]], undefined, true);
    K.poly(skipM, [[kx + 1.45, 0.12, kz - 0.9], [kx + 1.75, 0.12 + h, kz - 0.9], [kx + 1.75, 0.12 + h, kz + 0.9], [kx + 1.45, 0.12, kz + 0.9]], undefined, true);
    K.box(skipM, 2.9, 0.06, 1.8, kx, 0.1, kz);
    for (const sd of [-1, 1]) {
      for (const dx of [-1.0, 0, 1.0]) K.box(skipM, 0.08, h - 0.05, 0.06, kx + dx, 0.15, kz + sd * 0.93);
      K.box(skipM, 3.5, 0.08, 0.07, kx, 0.12 + h - 0.06, kz + sd * 0.93);
      K.box(M('#3a3d40', PAT.PLAIN, 0.5, 0.5), 0.12, 0.25, 0.1, kx + sd * 1.25, 0.6, kz + 0.97 * sd);
      K.box(M('#3a3d40', PAT.PLAIN, 0.5, 0.5), 0.5, 0.12, 1.85, kx + sd * 1.0, 0.0, kz);
    }
    K.cone(M('#86827a', PAT.GRAVEL, 0.95, 0, 0, 0, 0.6), 1.25, 0.55, kx, 1.05, kz, 10);
    K.box(M('#7a776f', PAT.CONCRETE, 0.9), 0.44, 0.22, 0.3, kx - 0.6, 1.25, kz + 0.2, 0.4);
    K.box(M('#c9a46a', PAT.PLANKS, 0.85), 2.2, 0.06, 0.12, kx + 0.2, 1.4, kz - 0.25, 0.3);
    K.boxC(M('#e9e6df', PAT.PLAIN, 0.9), 1.1, 0.02, 0.8, kx + 0.7, 1.45, kz + 0.1, 0.5, 0.2, 0.0);
  }
  // site clutter the crews use: cement mixer, wheelbarrows, cement bags on a pallet, block pallets, a cable drum,
  // cones and a barrier at the gate, a dumpy bag of sand
  if (env.ctx.quality.level !== 'low' && !env.ctx.debug.params.has('nositedetail')) {
    const orange = M('#e2622a', PAT.PLAIN, 0.6, 0.2, 0, 0, 0.4);
    const steel = M('#3a3d40', PAT.PLAIN, 0.5, 0.5, 0, 0, 0.4);
    // cement mixer: tilted drum on a stand with wheels and a tow bar
    {
      const mx = fx0 + 4.4,
        mz = SZ - 3.0;
      K.box(steel, 0.08, 0.7, 0.08, mx - 0.35, 0, mz - 0.3);
      K.box(steel, 0.08, 0.7, 0.08, mx + 0.35, 0, mz - 0.3);
      K.box(steel, 0.9, 0.08, 0.7, mx, 0.62, mz);
      K.cylX(M('#202224', PAT.PLAIN, 0.8), 0.2, 0.12, mx - 0.45, 0.2, mz + 0.3, 12);
      K.cylX(M('#202224', PAT.PLAIN, 0.8), 0.2, 0.12, mx + 0.45, 0.2, mz + 0.3, 12);
      K.rod(steel, [mx, 0.3, mz + 0.3], [mx, 0.3, mz + 1.2], 0.025);
      K.lathe(orange, [[0.0, 0.0], [0.32, 0.02], [0.4, 0.25], [0.38, 0.5], [0.22, 0.75], [0.2, 0.78]], mx, 0.7, mz, 14);
      K.box(steel, 0.06, 0.5, 0.06, mx + 0.42, 0.7, mz - 0.1);
      K.cyl(M('#1d1f21', PAT.PLAIN, 0.7), 0.06, 0.06, 0.3, mx + 0.42, 1.0, mz + 0.05, 8);
    }
    // wheelbarrows (one tipped against the cabin)
    const barrow = (x: number, z: number, ry: number) => {
      const tray = M('#2f6f3a', PAT.PLAIN, 0.6, 0.3, 0, 0, 0.5);
      const c = Math.cos(ry),
        sn = Math.sin(ry);
      const P = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * sn, ly, z - lx * sn + lz * c];
      K.poly(tray, [P(-0.32, 0.3, -0.3), P(0.32, 0.3, -0.3), P(0.42, 0.62, -0.55), P(-0.42, 0.62, -0.55)], undefined, true);
      K.poly(tray, [P(-0.32, 0.3, 0.35), P(-0.32, 0.3, -0.3), P(-0.42, 0.62, -0.55), P(-0.45, 0.62, 0.55)], undefined, true);
      K.poly(tray, [P(0.32, 0.3, -0.3), P(0.32, 0.3, 0.35), P(0.45, 0.62, 0.55), P(0.42, 0.62, -0.55)], undefined, true);
      K.poly(tray, [P(-0.32, 0.3, 0.35), P(0.32, 0.3, 0.35), P(0.45, 0.62, 0.55), P(-0.45, 0.62, 0.55)], undefined, true);
      K.poly(tray, [P(-0.32, 0.3, -0.3), P(0.32, 0.3, -0.3), P(0.32, 0.3, 0.35), P(-0.32, 0.3, 0.35)], undefined, true);
      for (const sd of [-1, 1]) {
        K.rod(steel, P(sd * 0.25, 0.25, 0.85), P(sd * 0.28, 0.55, -1.05), 0.018);
        K.rod(steel, P(sd * 0.25, 0.3, -0.25), P(sd * 0.27, 0.0, -0.3), 0.015);
      }
      const w = P(0, 0.2, 0.75);
      K.cylX(M('#1d1f21', PAT.PLAIN, 0.8), 0.2, 0.09, w[0], 0.2, w[2], 12, ry);
      K.cone(M('#8f8a7f', PAT.GRAVEL, 0.95), 0.32, 0.12, x, 0.55, z, 8);
    };
    barrow(fx0 + 2.6, SZ - 4.6, 0.6);
    barrow(SX - 3.2, -2.4, -2.1);
    // cement bags on a pallet, concrete blocks on pallets
    const pal = M('#a1774d', PAT.PLANKS, 0.9);
    const bagM = M('#c9c2b0', PAT.PLAIN, 0.9, 0, 0, 0, 0.3);
    K.box(pal, 1.2, 0.14, 1.0, fx0 + 7.0, 0, fz1 + 5.3);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) K.boxC(bagM, 0.55, 0.13, 0.42, fx0 + 6.72 + j * 0.56, 0.21 + i * 0.13, fz1 + 5.08 + (i % 2) * 0.44, 0, (i % 2) * 0.06, 0.02 * (j - 0.5));
    for (let k = 0; k < 2; k++) {
      K.box(pal, 1.2, 0.14, 1.0, fx0 + 8.6, 0, fz1 + 4.6 + k * 1.2);
      K.box(M('#8e8a80', PAT.CONCRETE, 0.9, 0, 0, 0, 0.5), 1.1, 0.72, 0.9, fx0 + 8.6, 0.14, fz1 + 4.6 + k * 1.2);
    }
    // cable drum
    K.cylX(M('#9a7448', PAT.PLANKS, 0.9), 0.55, 0.08, SX - 2.4, 0.55, fz1 + 3.6, 16, Math.PI / 2);
    K.cylX(M('#9a7448', PAT.PLANKS, 0.9), 0.55, 0.08, SX - 2.4, 0.55, fz1 + 4.3, 16, Math.PI / 2);
    K.cylX(M('#1d1f21', PAT.PLAIN, 0.7), 0.4, 0.62, SX - 2.4, 0.55, fz1 + 3.95, 14, Math.PI / 2);
    // dumpy bag of sand (white woven bag with loops) by the mixer
    K.box(M('#e9e6dc', PAT.PLAIN, 0.95, 0, 0, 0, 0.4), 0.9, 0.8, 0.9, fx0 + 5.6, 0, SZ - 3.0);
    K.cone(M('#d9c08a', PAT.GRAVEL, 0.95), 0.44, 0.22, fx0 + 5.6, 0.8, SZ - 3.0, 10);
    for (const [dx, dz] of [
      [-0.4, -0.4],
      [0.4, -0.4],
      [-0.4, 0.4],
      [0.4, 0.4],
    ])
      K.torus(M('#e9e6dc', PAT.PLAIN, 0.95), 0.08, 0.015, fx0 + 5.6 + dx, 0.85, SZ - 3.0 + dz, 4, 8);
    // traffic cones + a red/white barrier inside the gate
    const gateZ0 = SZ - 9.5;
    for (let k = 0; k < 4; k++) {
      const cz = gateZ0 + 0.8 + k * 1.3,
        cx = SX - 2.0 - (k % 2) * 0.3;
      K.box(M('#1d1f21', PAT.PLAIN, 0.8), 0.36, 0.04, 0.36, cx, 0, cz);
      K.cone(M('#e8582a', PAT.PLAIN, 0.6, 0, 0, 0, 0.3), 0.15, 0.7, cx, 0.04, cz, 12);
      K.cyl(M('#f2f0ea', PAT.PLAIN, 0.4), 0.075, 0.095, 0.12, cx, 0.36, cz, 12);
    }
    const bar = (x: number, z: number, ry: number) => {
      K.box(M('#d33a2e', PAT.PLAIN, 0.6), 1.8, 0.2, 0.05, x, 0.75, z, ry);
      for (const d of [-0.8, 0.8]) {
        const c = Math.cos(ry),
          sn = Math.sin(ry);
        K.box(M('#f2f0ea', PAT.PLAIN, 0.6), 0.06, 1.0, 0.06, x + d * c, 0, z - d * sn, ry);
        K.box(M('#2a2c2e', PAT.PLAIN, 0.8), 0.25, 0.08, 0.6, x + d * c, 0, z - d * sn, ry);
      }
    };
    bar(SX - 3.4, gateZ0 - 0.6, 0.2);
  }
  // site cabins (two stacked containers + stair) along the west fence
  {
    const cx = -SX + 1.6,
      cz = -2.8;
    const cab = (y: number, col: string) => {
      K.box(M(col, PAT.CORRUGATED, 0.6, 0.2, 0, 0, 0.3), 2.4, 2.55, 6.0, cx, y, cz);
      for (const dz of [-1.8, 0, 1.8]) K.panel(M('#f2efe6', PAT.WINDOW, 0.3, 0, 0.8, 0, 0.3 + dz * 0.1), 0.9, 0.8, cx + 1.205, y + 1.1, cz + dz, Math.PI / 2);
    };
    cab(0, '#3d6fb0');
    cab(2.6, '#f1efe8');
    K.box(M('#8f9aa3', PAT.PLAIN, 0.5, 0.6), 0.8, 0.08, 2.4, cx + 1.65, 2.55, cz + 1.4);
    for (let i = 0; i < 8; i++) K.box(M('#8f9aa3', PAT.PLAIN, 0.5, 0.6), 0.8, 0.06, 0.28, cx + 1.65, 0.32 * i, cz - 1.5 + i * 0.3);
    const sign = env.atlas.add(256, 48, (g, w, h) => {
      g.fillStyle = '#ffd21f';
      g.fillRect(0, 0, w, h);
      drawText(g, 'SITE OFFICE', w / 2, h / 2 + 1, 'bold 26px Arial, sans-serif', '#1d1d1d', 2);
    });
    signQuad(env.T, sign, 1.6, 0.3, cx + 1.215, 4.5, cz, Math.PI / 2, 0.4);
    // portable toilet
    {
      // moulded plastic cabin: skid base, ribbed walls, translucent rounded roof, door with vent slots, handle and
      // the red/green 'engaged' indicator
      const tx = -SX + 1.0,
        tz = cz + 4.6;
      const blue = M('#2f74c0', PAT.PANELS, 0.55, 0.1, 0, 0, 0.35);
      K.box(M('#1f4f86', PAT.PLAIN, 0.6), 1.16, 0.12, 1.2, tx, 0, tz);
      K.box(blue, 1.1, 2.1, 1.1, tx, 0.12, tz);
      K.lathe(M('#dfe6ea', PAT.PLAIN, 0.4, 0, 0, 0, 0.2), [[0.0, 0.18], [0.62, 0.0], [0.6, 0.04], [0.4, 0.14], [0.0, 0.2]], tx, 2.2, tz, 10, Math.PI / 4);
      K.box(M('#25609f', PAT.PLAIN, 0.6), 0.04, 1.95, 0.84, tx + 0.57, 0.17, tz);
      for (let k = 0; k < 4; k++) K.box(M('#173f6b', PAT.PLAIN, 0.6), 0.02, 0.025, 0.5, tx + 0.595, 1.75 + k * 0.06, tz);
      K.box(M('#c9cdd0', PAT.PLAIN, 0.4, 0.6), 0.05, 0.12, 0.04, tx + 0.6, 1.0, tz - 0.3);
      K.box(M('#2fa34a', PAT.PLAIN, 0.4), 0.02, 0.05, 0.1, tx + 0.6, 1.15, tz - 0.3);
      for (const dz of [-0.5, 0.5]) for (let k = 0; k < 3; k++) K.box(blue, 1.12, 0.04, 0.04, tx, 0.5 + k * 0.6, tz + dz);
    }
  }
  // parked excavator (north strip)
  {
    const ex2 = 3.2,
      ez = -SZ + 3.0;
    const body = M('#f0b21c', PAT.PLAIN, 0.6, 0.2);
    K.box(M('#2b2b2b', PAT.CORRUGATED, 0.8, 0.3), 3.0, 0.7, 0.55, ex2, 0, ez - 0.85);
    K.box(M('#2b2b2b', PAT.CORRUGATED, 0.8, 0.3), 3.0, 0.7, 0.55, ex2, 0, ez + 0.85);
    K.box(body, 2.6, 1.0, 2.1, ex2 - 0.2, 0.75, ez);
    K.box(body, 1.1, 1.3, 1.0, ex2 + 0.5, 1.75, ez + 0.5);
    K.box(M('#2f3e48', PAT.GLAZING, 0.2, 0.3, 0, 0, 0.6), 1.0, 0.9, 0.04, ex2 + 0.5, 2.0, ez + 1.01);
    K.beam(body, [ex2 - 0.6, 1.6, ez - 0.3], [ex2 - 2.6, 3.0, ez - 0.3], 0.35);
    K.beam(body, [ex2 - 2.6, 3.0, ez - 0.3], [ex2 - 3.2, 0.9, ez - 0.3], 0.3);
    K.box(M('#4a4a48', PAT.PLAIN, 0.6, 0.4), 0.9, 0.6, 0.8, ex2 - 3.25, 0.3, ez - 0.3);
  }
  // workers (visible in working hours)
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(0, 0, 0), axis: new THREE.Vector3(0, 1, 0), a: 0, b: 0, c: 0 });
  const workers: [number, number, number, number][] = [
    [pickL.x + 1.4, 0, pickL.z - 1.4, 0.6],
    [fx0 + 3.0, top, fz0 + 6.0, 2.2],
    [fx0 + 6.5, top, zMid + 2.0, -1.2],
    [SX - 2.0, 0, SZ - 3.0, -1.6],
    [cx0 + 1.5, top + FH + 3.2, cz0 + 1.0, 0.2],
  ];
  for (const [wx, wy, wz, ry] of workers) person(env.K, wx, wy, wz, ry, '#e8f05a', '#3a4a6b', '#e2b48c', '#f7f7f2', false, 0);
  env.anim(null);
  env.endChecks();

  // ── hoarding & fence along the site rect, gate on the east side
  env.checkRect(site, 'construction fence', 0.02);
  const hoard = M('#eef1f3', PAT.PLANKS, 0.8, 0, 0, 0, 0.8);
  const hH = 2.4;
  const gateZ0 = SZ - 9.5,
    gateZ1 = SZ - 4.0; // gate span on the east side (local z)
  const meshFence = (a: V3, b: V3) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const ry = Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2;
    env.K.quad(M('#b7bec4', PAT.MESH, 0.5, 0.5, 0, 0, 0.2), a, b, [b[0], b[1] + 2.0, b[2]], [a[0], a[1] + 2.0, a[2]], len, 2.0);
    // concrete feet
    for (let t = 0.4; t <= len - 0.39; t += 3.5) {
      const k = t / len;
      K.box(M('#8e8a84', PAT.PLAIN, 0.9), 0.6, 0.14, 0.22, a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k, ry);
    }
  };
  const e = 0.25;
  // north & south hoardings (along x), east hoarding (along z) with the gate gap, west mesh fence
  K.box(hoard, 2 * SX - 2 * e, hH, 0.08, 0, 0, -SZ + e);
  K.box(hoard, 2 * SX - 2 * e, hH, 0.08, 0, 0, SZ - e);
  K.box(hoard, 0.08, hH, gateZ0 - (-SZ + e), SX - e, 0, (gateZ0 + (-SZ + e)) / 2);
  K.box(hoard, 0.08, hH, SZ - e - gateZ1, SX - e, 0, (gateZ1 + SZ - e) / 2);
  meshFence([-SX + e, 0, -SZ + e], [-SX + e, 0, SZ - e]);
  // posts along the hoarding
  for (let x = -SX + e; x <= SX - e + 0.01; x += 2.5) {
    K.box(M('#5b7fa8', PAT.PLAIN, 0.6), 0.12, hH + 0.1, 0.12, x, 0, -SZ + e + 0.1);
    K.box(M('#5b7fa8', PAT.PLAIN, 0.6), 0.12, hH + 0.1, 0.12, x, 0, SZ - e - 0.1);
  }
  // gate: two mesh leaves + posts with amber lamps
  env.K.quad(M('#b7bec4', PAT.MESH, 0.5, 0.5, 0, 0, 0.2), [SX - e, 0, gateZ0 + 0.1], [SX - e, 0, gateZ1 - 0.1], [SX - e, 2.0, gateZ1 - 0.1], [SX - e, 2.0, gateZ0 + 0.1], gateZ1 - gateZ0, 2.0);
  for (const gz of [gateZ0, gateZ1]) {
    K.box(M('#5b7fa8', PAT.PLAIN, 0.6), 0.2, 2.6, 0.2, SX - e - 0.1, 0, gz);
    env.L.sphere(LM('#ffa21a', LMODE.BLINK, 4.0, gz * 0.13, 0.25), 0.09, SX - e - 0.1, 2.7, gz, 6, 4);
    env.glow(SX - e - 0.1, 2.7, gz, { size: 0.7, kind: 'halo', color: '#ffa524', intensity: 0.9, mode: 1, phase: gz * 0.13 });
  }
  // billboards on the hoarding
  const render = env.atlas.add(512, 160, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#9fd3f5');
    grd.addColorStop(1, '#e9f5fc');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // the future building
    g.fillStyle = '#e8e2d6';
    g.fillRect(w * 0.6, h * 0.12, w * 0.3, h * 0.8);
    g.fillStyle = '#7fa6c4';
    for (let r = 0; r < 7; r++) for (let c2 = 0; c2 < 4; c2++) g.fillRect(w * 0.62 + c2 * w * 0.072, h * 0.17 + r * h * 0.1, w * 0.05, h * 0.06);
    g.fillStyle = '#4f9a59';
    g.beginPath();
    g.arc(w * 0.57, h * 0.86, h * 0.12, 0, Math.PI * 2);
    g.arc(w * 0.93, h * 0.88, h * 0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1e3a5f';
    g.fillRect(0, 0, w * 0.55, h);
    drawText(g, 'HAVEN HEIGHTS', w * 0.275, h * 0.3, 'bold 34px Georgia, serif', '#ffffff', 2);
    drawText(g, '64 apartments · 6 floors', w * 0.275, h * 0.55, '20px Arial, sans-serif', '#cfe3f5', 0);
    drawText(g, 'Ready summer 2027', w * 0.275, h * 0.78, 'bold 20px Arial, sans-serif', '#ffd21f', 0);
  });
  signQuad(env.T, render, 8.4, 2.6, SX - e + 0.05, 0.0, -2.0, Math.PI / 2, 0.5);
  signQuad(env.T, render, 8.4, 2.6, 0.0, 0.0, -SZ + e - 0.05, Math.PI, 0.5);
  const safety = env.atlas.add(256, 112, (g, w, h) => {
    g.fillStyle = '#1f5fae';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(52, h / 2, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f5fae';
    g.beginPath();
    g.arc(52, h / 2 + 6, 22, Math.PI, 0);
    g.fill();
    g.fillRect(26, h / 2 + 4, 52, 6);
    drawText(g, 'SAFETY', 170, h / 2 - 22, 'bold 26px Arial, sans-serif', '#ffffff', 1);
    drawText(g, 'HARD HATS', 170, h / 2 + 6, 'bold 20px Arial, sans-serif', '#ffffff', 0);
    drawText(g, 'MUST BE WORN', 170, h / 2 + 30, 'bold 16px Arial, sans-serif', '#ffffff', 0);
  });
  signQuad(env.T, safety, 2.0, 0.9, SX - e + 0.05, 0.9, gateZ0 - 1.8, Math.PI / 2, 0.2);
  signQuad(env.T, safety, 2.0, 0.9, -4.0, 0.9, SZ - e + 0.05, 0, 0.2);
  const logo = env.atlas.add(384, 64, (g, w, h) => {
    g.fillStyle = '#ffd21f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d1d1d';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 24, h);
      g.lineTo(i * 24 + 12, h);
      g.lineTo(i * 24 + 36, 0);
      g.lineTo(i * 24 + 24, 0);
      g.fill();
    }
    drawText(g, 'TINYBUILD', w * 0.62, h / 2 + 2, 'bold 38px "Arial Black", Arial, sans-serif', '#1d1d1d', 2);
  });
  signQuad(env.T, logo, 4.2, 0.7, 3.6, 1.2, SZ - e + 0.05, 0, 0.3);
  // fly-posting on the street sides: overlapping gig / circus / lost-cat posters, older ones torn and faded,
  // a 'POST NO BILLS' stencil, a tag — the hoarding is a city surface people use
  const posters = env.atlas.add(512, 192, (g, w, h) => {
    g.fillStyle = '#eef1f3';
    g.fillRect(0, 0, w, h);
    const poster = (x: number, y: number, pw: number, ph: number, bg: string, draw: () => void, tear = 0) => {
      g.save();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + pw, y);
      // torn lower edge on old ones
      for (let k = 0; k <= 8; k++) g.lineTo(x + pw - (pw * k) / 8, y + ph - (k % 2) * tear * 9 - tear * ((k * 7) % 5) * 3);
      g.closePath();
      g.clip();
      g.fillStyle = bg;
      g.fillRect(x, y, pw, ph);
      g.translate(x, y);
      draw();
      g.restore();
    };
    // old faded layer
    poster(4, 10, 150, 172, '#d9c9a0', () => {
      drawText(g, 'SUMMER', 75, 40, 'bold 30px Georgia, serif', '#8a6a4a', 0);
      drawText(g, 'REGATTA', 75, 72, 'bold 26px Georgia, serif', '#8a6a4a', 0);
    }, 3);
    poster(120, 4, 132, 180, '#1d2a44', () => {
      g.fillStyle = '#e8c22e';
      g.beginPath();
      g.arc(66, 70, 40, 0, Math.PI * 2);
      g.fill();
      drawText(g, 'THE GULLS', 66, 132, 'bold 22px "Arial Black", Arial, sans-serif', '#f2efe6', 0);
      drawText(g, 'live · Sat 9pm', 66, 156, '15px Arial, sans-serif', '#e8c22e', 0);
    });
    poster(258, 14, 122, 160, '#c4352b', () => {
      drawText(g, 'CIRCUS', 61, 38, 'bold 26px Georgia, serif', '#f6e7c1', 0);
      g.fillStyle = '#f6e7c1';
      g.fillRect(16, 56, 90, 54);
      g.fillStyle = '#c4352b';
      g.beginPath();
      g.moveTo(61, 60);
      g.lineTo(100, 106);
      g.lineTo(22, 106);
      g.fill();
      drawText(g, 'Harbour Field', 61, 132, '15px Arial, sans-serif', '#f6e7c1', 0);
    }, 2);
    poster(386, 26, 84, 110, '#f4f1e8', () => {
      drawText(g, 'LOST CAT', 42, 20, 'bold 15px Arial, sans-serif', '#1d1d1d', 0);
      g.fillStyle = '#5a5048';
      g.fillRect(16, 30, 52, 40);
      drawText(g, '"Biscuit"', 42, 84, '12px Arial, sans-serif', '#1d1d1d', 0);
      g.strokeStyle = '#1d1d1d';
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(6 + k * 13, 96);
        g.lineTo(6 + k * 13, 110);
        g.stroke();
      }
    });
    drawText(g, 'POST NO BILLS', 440, 168, 'bold 16px Arial, sans-serif', 'rgba(30,30,30,0.75)', 0);
    g.strokeStyle = '#2b62b8';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(474, 150);
    g.bezierCurveTo(490, 120, 500, 160, 506, 128);
    g.stroke();
  });
  signQuad(env.T, posters, 4.0, 1.5, -SX + 3.4, 0.55, SZ - e + 0.05, 0, 0.15);
  signQuad(env.T, posters, 4.0, 1.5, SX - 3.6, 0.55, -SZ + e - 0.05, Math.PI, 0.15);
  signQuad(env.T, posters, 4.0, 1.5, SX - e + 0.05, 0.5, -11.0, Math.PI / 2, 0.15);
  // site safety board by the gate: PPE roundels, a warning triangle, the contractor's name
  const ppe = env.atlas.add(256, 192, (g, w, h) => {
    g.fillStyle = '#f7f7f2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d4f9c';
    g.fillRect(0, 0, w, 34);
    g.fillStyle = '#ffffff';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    g.fillText('SAFETY ON SITE', w / 2, 24);
    for (let k = 0; k < 4; k++) {
      const cx = 34 + k * 62;
      g.fillStyle = '#1d5fb8';
      g.beginPath();
      g.arc(cx, 72, 25, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      // pictograms: helmet, boots, hi-vis, gloves (simple silhouettes)
      g.beginPath();
      if (k === 0) { g.arc(cx, 76, 14, Math.PI, 0); g.rect(cx - 17, 75, 34, 4); }
      else if (k === 1) { g.rect(cx - 10, 58, 9, 22); g.rect(cx - 10, 78, 18, 7); g.rect(cx + 3, 62, 8, 18); }
      else if (k === 2) { g.moveTo(cx - 13, 58); g.lineTo(cx + 13, 58); g.lineTo(cx + 15, 88); g.lineTo(cx - 15, 88); g.closePath(); }
      else { g.rect(cx - 9, 62, 18, 20); g.rect(cx - 13, 64, 5, 12); }
      g.fill();
    }
    g.fillStyle = '#1d1d1d';
    g.font = 'bold 13px sans-serif';
    g.fillText('HARD HATS · BOOTS · HI-VIS · GLOVES', w / 2, 118);
    g.fillStyle = '#f2c81a';
    g.beginPath();
    g.moveTo(40, 132); g.lineTo(62, 172); g.lineTo(18, 172); g.closePath();
    g.fill();
    g.fillStyle = '#1d1d1d';
    g.font = 'bold 22px sans-serif';
    g.fillText('!', 40, 168);
    g.textAlign = 'left';
    g.font = 'bold 13px sans-serif';
    g.fillText('ALL VISITORS REPORT', 76, 148);
    g.fillText('TO THE SITE OFFICE', 76, 166);
    g.font = '11px sans-serif';
    g.fillText('Tinybuild Ltd · 0800 555 0142', 76, 184);
  });
  signQuad(env.T, ppe, 1.2, 0.9, SX - e + 0.05, 1.1, (gateZ1 + SZ - e) / 2, Math.PI / 2, 0.1);
  // security floodlight pole by the gate
  {
    const px = SX - 1.2,
      pz = gateZ1 + 1.2;
    K.cyl(M('#8f9aa3', PAT.PLAIN, 0.5, 0.6), 0.07, 0.09, 6.0, px, 0, pz, 8);
    K.box(M('#4a5156', PAT.PLAIN, 0.6, 0.4), 0.5, 0.3, 0.35, px - 0.2, 5.9, pz);
    env.L.box(LM('#fff4d6', LMODE.NIGHT, 3.5, 0, 0), 0.4, 0.04, 0.28, px - 0.2, 5.88, pz);
    env.glow(px - 3.0, 0.08, pz - 2.0, { size: 5.0, kind: 'pool', color: '#fff0d0', intensity: 0.3 });
    env.glow(px - 0.2, 5.8, pz, { size: 1.0, kind: 'halo', color: '#fff4d6', intensity: 0.8 });
  }
  env.endChecks();
  // mud carried out of the gate onto the pavement: a churned wet apron inside the gate with ruts, then the
  // lorry's dual tyre tracks running out across the pavement, drying lighter and breaking up toward the kerb;
  // splash dirt along the foot of the hoarding where the wheels throw it
  if (!env.ctx.debug.params.has('nositedetail') && env.ctx.quality.level !== 'low') {
    const wetMud = M('#5a4a38', PAT.GRAVEL, 0.45, 0, 0, 0, 0.7);
    const gz = (gateZ0 + gateZ1) / 2;
    K.box(wetMud, 4.2, 0.02, gateZ1 - gateZ0 + 0.6, SX - e - 2.2, 0.0, gz);
    for (const sd of [-1, 1])
      for (const w of [-0.18, 0.18]) K.box(M('#3e3326', PAT.GRAVEL, 0.35, 0, 0, 0, 0.9), 4.4, 0.012, 0.26, SX - e - 2.2, 0.02, gz + sd * 0.95 + w);
    // tracks: segments 0.35 m long, colour from wet dark to dry pale, gaps growing with distance
    const wetC = new THREE.Color('#4f4030'),
      dryC = new THREE.Color('#9a8c76');
    for (const sd of [-1, 1])
      for (const w of [-0.17, 0.17]) {
        const tz = gz + sd * 0.95 + w;
        for (let k = 0; k < 16; k++) {
          const t = k / 16;
          const hsh = Math.abs(Math.sin(k * 12.9898 + tz * 78.233) * 43758.5453) % 1;
          if (hsh < t * 0.75) continue;
          const c = wetC.clone().lerp(dryC, Math.min(1, t * 1.3));
          // pavement (3 m to the kerb), then on down onto the asphalt; nothing straddles the kerb
          const tx = SX + 0.1 + k * 0.36;
          if (Math.abs(tx - (SX + 3.0)) < 0.2) continue;
          K.box(M(c, PAT.GRAVEL, 0.6 + t * 0.35, 0, 0, 0, 0.5), 0.34, 0.006, 0.2 - t * 0.09, tx, tx < SX + 3.0 ? 0.151 : 0.004, tz + Math.sin(k * 0.7 + sd) * 0.04 * t, 0.02 * Math.sin(k + w * 10));
        }
      }
    // dried clods knocked off the tyres
    for (let k = 0; k < 18; k++) K.box(M(k % 2 ? '#7d6e58' : '#5e4f3c', PAT.GRAVEL, 0.9), 0.04 + (k % 3) * 0.04, 0.012 + (k % 2) * 0.01, 0.04 + (k % 4) * 0.025, SX + 0.3 + ((k * 1.37) % 5.0), 0.15, gateZ0 + 0.4 + ((k * 2.3) % 5.4), k);
    // splash dirt along the outer foot of the street hoardings, height varying panel to panel
    const splash = M('#7a6d5b', PAT.GRAVEL, 0.92, 0, 0, 0, 0.4);
    const band = (len: number, cx: number, cz: number, ry: number) => {
      const n = Math.max(1, Math.round(len / 1.22));
      for (let k = 0; k < n; k++) {
        const hsh = Math.abs(Math.sin(k * 7.13 + cx * 3.1 + cz * 1.7) * 43758.5453) % 1;
        const u = -len / 2 + (k + 0.5) * (len / n);
        K.box(splash, len / n - 0.01, 0.12 + hsh * 0.28, 0.01, cx + Math.cos(ry) * u, 0, cz - Math.sin(ry) * u, ry);
      }
    };
    band(2 * SX - 2 * e, 0, SZ - e + 0.05, 0);
    band(2 * SX - 2 * e, 0, -SZ + e - 0.05, 0);
    band(gateZ0 - (-SZ + e), SX - e + 0.05, (gateZ0 + (-SZ + e)) / 2, Math.PI / 2);
  }

  env.pick(lot.id, 'Haven Heights (under construction)', new THREE.Box3(new THREE.Vector3(fp.x0, 0, fp.z0), new THREE.Vector3(fp.x1, top + FH + 3, fp.z1)), () => {
    const h = env.hours();
    const work = h >= 7 && h < 18;
    return ['64 apartments · 4 of 6 floors poured', work ? 'Work in progress · hard hats on!' : 'Site closed for the night', 'Developer: Tinybuild Ltd.'];
  });
  return {
    pick: { x: pickL.x + scx, z: pickL.z + scz, y: 1.0 },
    drops: [
      { x: fx0 + 3.2 + scx, z: zMid + 2.5 + scz, y: top },
      { x: fx1 - 2.4 + scx, z: zMid + 4.8 + scz, y: top },
      { x: fx0 + 2.4 + scx, z: fz0 + 4.0 + scz, y: top + FH - slabT + 0.12 },
    ],
  };
}

/**
 * Tower crane: lattice mast (cutout), slewing jib / counter-jib / tower head / cab, trolley,
 * cable (stretches), hook block and load — animated in the vertex shader from uCrane.
 */
export function genTowerCrane(env: Env, f: Feature): { pivot: { x: number; z: number }; hookTop: number; jib: number } {
  const Hj = Number(f.params?.height ?? 58);
  const J = Number(f.params?.jib ?? 40);
  env.begin(f.x, 0, f.z, 0);
  env.checkRadius(f.x, f.z, Math.max(f.radius, 2.0), 'towercrane');
  const K = env.K;
  const yel = (w = 1.8) => M(C.craneYellow, PAT.LATTICE, 0.55, 0.3, w, 0, 0.3);
  const solidY = M(C.craneYellow, PAT.PLAIN, 0.55, 0.3);
  const concrete = M('#bdb8ae', PAT.CONCRETE, 0.9, 0, 0, 0, 0.6);
  // base ballast
  env.S.box(concrete, 3.6, 0.8, 3.6, 0, 0, 0);
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    env.S.box(M('#a8a39a', PAT.CONCRETE, 0.9), 1.5, 0.6, 1.5, dx * 0.85, 0.8, dz * 0.85);
  // mast (static, cutout lattice faces)
  const mw = 1.8,
    h0 = 1.4,
    h1 = Hj - 1.6;
  const L = h1 - h0;
  const m2 = mw / 2;
  K.quad(yel(mw), [-m2, h0, m2], [-m2, h1, m2], [m2, h1, m2], [m2, h0, m2], L, mw);
  K.quad(yel(mw), [m2, h0, m2], [m2, h1, m2], [m2, h1, -m2], [m2, h0, -m2], L, mw);
  K.quad(yel(mw), [m2, h0, -m2], [m2, h1, -m2], [-m2, h1, -m2], [-m2, h0, -m2], L, mw);
  K.quad(yel(mw), [-m2, h0, -m2], [-m2, h1, -m2], [-m2, h1, m2], [-m2, h0, m2], L, mw);
  // climbing frame + ladder platform at the top of the mast
  env.S.box(solidY, mw + 0.3, 0.4, mw + 0.3, 0, h1 - 0.4, 0);
  env.endChecks();
  // ── slewing assembly
  const pivot = new THREE.Vector3(0, Hj, 0);
  env.anim({ mode: ANIM.CRANE_SLEW, pivot, axis: new THREE.Vector3(0, 1, 0), a: 0, b: 0, c: 0 });
  K.box(solidY, 2.4, 1.6, 2.4, 0, h1, 0);
  // operator cab
  K.box(M('#f2f2ee', PAT.PANELS, 0.5, 0.2, 0, 0, 0.4), 1.6, 1.9, 1.7, 1.0, h1 - 0.2, 1.75);
  K.box(M('#2b3a44', PAT.GLAZING, 0.15, 0.3, 0, 0, 0.6), 1.62, 1.1, 1.72, 1.15, h1 + 0.4, 1.76);
  // jib (triangular lattice: bottom face + two slanted sides)
  const jb = 0.8,
    jt = 1.6;
  const x0 = 1.2,
    x1 = J;
  const jy = Hj;
  K.quad(yel(jb * 2), [x0, jy, -jb], [x1, jy, -jb], [x1, jy, jb], [x0, jy, jb], x1 - x0, jb * 2);
  const sideW = Math.hypot(jb, jt);
  K.quad(yel(sideW), [x0, jy, jb], [x1, jy, jb], [x1, jy + jt * 0.55, 0], [x0, jy + jt, 0], x1 - x0, sideW);
  K.quad(yel(sideW), [x0, jy, -jb], [x1, jy, -jb], [x1, jy + jt * 0.55, 0], [x0, jy + jt, 0], x1 - x0, sideW);
  K.box(solidY, 0.3, 1.0, 1.7, x1, jy - 0.05, 0);
  // counter-jib with platform, railings, winch and counterweights
  const cj = 12.5;
  K.box(M('#c9a21c', PAT.PLANKS, 0.7, 0.3), cj, 0.25, 2.0, -cj / 2 - 0.6, jy - 0.1, 0);
  K.quad(yel(1.1), [-0.8, jy + 0.15, 1.0], [-cj - 0.6, jy + 0.15, 1.0], [-cj - 0.6, jy + 1.25, 1.0], [-0.8, jy + 1.25, 1.0], cj, 1.1);
  K.quad(yel(1.1), [-0.8, jy + 0.15, -1.0], [-cj - 0.6, jy + 0.15, -1.0], [-cj - 0.6, jy + 1.25, -1.0], [-0.8, jy + 1.25, -1.0], cj, 1.1);
  K.box(M('#5f6a72', PAT.PANELS, 0.6, 0.4, 0, 0, 0.2), 2.4, 1.3, 1.6, -4.5, jy + 0.15, 0);
  for (let i = 0; i < 4; i++) K.box(M('#bdb8ae', PAT.CONCRETE, 0.9, 0, 0, 0, 0.2 + i * 0.1), 0.9, 2.3, 1.9, -cj + 0.3 + i * 0.95, jy - 1.6, 0);
  // tower head (A-frame) + pendant ties
  const apex: V3 = [0, Hj + 7.2, 0];
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    K.beam(solidY, [dx * 0.9, Hj + 0.2, dz * 0.9], apex, 0.18);
  K.box(solidY, 0.5, 0.5, 0.5, 0, Hj + 7.0, 0);
  const tie = M('#5a5f63', PAT.PLAIN, 0.5, 0.7);
  K.rod(tie, apex, [J * 0.48, jy + jt * 0.78, 0], 0.035, 4);
  K.rod(tie, apex, [J * 0.82, jy + jt * 0.62, 0], 0.035, 4);
  K.rod(tie, apex, [-cj + 0.5, jy + 0.6, 0.6], 0.035, 4);
  K.rod(tie, apex, [-cj + 0.5, jy + 0.6, -0.6], 0.035, 4);
  // warning lights (tip + apex), slewing with the jib
  env.L.sphere(LM('#ff2a1a', LMODE.BLINK, 6.0, 0.21, 0.3), 0.18, x1 + 0.15, jy + 0.7, 0, 6, 4);
  env.L.sphere(LM('#ff2a1a', LMODE.BLINK, 6.0, 0.73, 0.3), 0.18, 0, Hj + 7.5, 0, 6, 4);
  env.L.sphere(LM('#ff2a1a', LMODE.BLINK, 6.0, 0.47, 0.3), 0.16, -cj - 0.4, jy + 0.6, 0, 6, 4);
  env.glow(x1 + 0.15, jy + 0.7, 0, { size: 2.2, kind: 'halo', color: '#ff3a24', intensity: 1.0, mode: 3, pivot: [0, 0, 0] });
  env.glow(0, Hj + 7.5, 0, { size: 2.2, kind: 'halo', color: '#ff3a24', intensity: 1.0, mode: 1, phase: 0.73 });
  // ── trolley (slides along the jib)
  env.anim({ mode: ANIM.CRANE_TROLLEY, pivot, axis: new THREE.Vector3(1, 0, 0), a: 0, b: 0, c: 0 });
  K.box(M('#4f585e', PAT.PLAIN, 0.5, 0.5), 1.3, 0.45, 1.9, 0, jy - 0.5, 0);
  // ── cable: 1 m rest length below the trolley, stretched by the hook drop
  const hookTop = jy - 0.6;
  env.anim({ mode: ANIM.CRANE_HOOK, pivot: new THREE.Vector3(0, hookTop, 0), axis: new THREE.Vector3(1, 0, 0), a: -1, b: 0, c: 0 });
  K.box(M('#2b2e30', PAT.PLAIN, 0.5, 0.7), 0.05, 1.0, 0.05, -0.18, hookTop - 1.0, 0);
  K.box(M('#2b2e30', PAT.PLAIN, 0.5, 0.7), 0.05, 1.0, 0.05, 0.18, hookTop - 1.0, 0);
  // ── hook block + hook (rigid drop)
  env.anim({ mode: ANIM.CRANE_HOOK, pivot: new THREE.Vector3(0, hookTop, 0), axis: new THREE.Vector3(1, 0, 0), a: 1, b: 0, c: 0 });
  K.box(M('#e8c22e', PAT.STRIPES, 0.6, 0.2), 0.6, 0.75, 0.35, 0, hookTop - 0.75, 0);
  K.torus(M('#3a3d40', PAT.PLAIN, 0.4, 0.8), 0.16, 0.04, 0, hookTop - 1.02, 0, 6, 10, Math.PI * 1.5, 0, 0, Math.PI / 2);
  // ── load: pallet of bricks on slings (rigid drop, hidden when unhooked)
  env.anim({ mode: ANIM.CRANE_HOOK, pivot: new THREE.Vector3(0, hookTop, 0), axis: new THREE.Vector3(1, 0, 0), a: 1, b: 1, c: 0 });
  const lb = hookTop - 3.4; // load bottom in the rest pose
  K.box(M('#a1774d', PAT.PLANKS, 0.9), 1.1, 0.14, 1.0, 0, lb, 0);
  K.box(M('#b5563c', PAT.BRICK, 0.9, 0, 0, 0, 0.9), 1.0, 0.85, 0.9, 0, lb + 0.14, 0);
  for (const [dx, dz] of [
    [-0.45, -0.4],
    [0.45, -0.4],
    [-0.45, 0.4],
    [0.45, 0.4],
  ])
    K.beam(M('#e04a2a', PAT.PLAIN, 0.7), [dx, lb + 0.99, dz], [0, hookTop - 1.15, 0], 0.03);
  env.anim(null);
  env.pick(f.id, 'Tower crane', new THREE.Box3(new THREE.Vector3(f.x - 2, 0, f.z - 2), new THREE.Vector3(f.x + 2, Hj + 7.5, f.z + 2)), () => [`${Math.round(Hj)} m tower crane · ${Math.round(J)} m jib`, 'Lifting bricks onto the new floors', 'Red warning lights after dark']);
  return { pivot: { x: f.x, z: f.z }, hookTop, jib: J };
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerpAng = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Crane work loop driving uCrane (slew, trolley, hook drop, load visible). */
export function craneUpdater(env: Env, crane: { pivot: { x: number; z: number }; hookTop: number; jib: number }, targets: CraneTargets | null): (dt: number) => void {
  const u = env.u.uCrane.value;
  const pv = crane.pivot;
  const loadDrop = 3.4; // hook top → load bottom
  const spot = (p: { x: number; z: number; y: number }) => {
    const dx = p.x - pv.x,
      dz = p.z - pv.z;
    return { ang: Math.atan2(-dz, dx), r: Math.min(crane.jib - 1.5, Math.max(4.0, Math.hypot(dx, dz))), drop: crane.hookTop - loadDrop - p.y };
  };
  const pick = targets ? spot(targets.pick) : { ang: 0.5, r: 12, drop: crane.hookTop - loadDrop - 1 };
  const drops = targets ? targets.drops.map(spot) : [{ ang: 2.0, r: 20, drop: crane.hookTop - loadDrop - 10 }];
  const travel = 9;
  const CYCLE = 66;
  let t = 7; // start mid-loop (load on the hook, rising)
  let k = 0;
  return (dt: number) => {
    t += Math.min(dt, 1);
    if (t >= CYCLE) {
      t -= CYCLE;
      k = (k + 1) % drops.length;
    }
    const d = drops[k];
    let ang = pick.ang,
      r = pick.r,
      drop = travel,
      load = 0;
    if (t < 5) {
      drop = travel + (pick.drop - travel) * ease(t / 5);
    } else if (t < 8) {
      drop = pick.drop;
      load = t > 6.5 ? 1 : 0;
    } else if (t < 14) {
      drop = pick.drop + (travel - pick.drop) * ease((t - 8) / 6);
      load = 1;
    } else if (t < 30) {
      const e = ease((t - 14) / 16);
      ang = lerpAng(pick.ang, d.ang, e);
      r = pick.r + (d.r - pick.r) * ease((t - 15) / 13);
      load = 1;
    } else if (t < 36) {
      ang = d.ang;
      r = d.r;
      drop = travel + (d.drop - travel) * ease((t - 30) / 6);
      load = 1;
    } else if (t < 40) {
      ang = d.ang;
      r = d.r;
      drop = d.drop;
      load = t < 38.5 ? 1 : 0;
    } else if (t < 45) {
      ang = d.ang;
      r = d.r;
      drop = d.drop + (travel - d.drop) * ease((t - 40) / 5);
    } else if (t < 61) {
      const e = ease((t - 45) / 16);
      ang = lerpAng(d.ang, pick.ang, e);
      r = d.r + (pick.r - d.r) * ease((t - 46) / 13);
    }
    u.set(ang, r, Math.max(0.3, drop), load);
  };
}

