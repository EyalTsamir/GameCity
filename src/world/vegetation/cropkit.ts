// What grows in a vegetable bed, as plants rather than cones and lumps (?noshapecrops): leaves that arch from a stem and fold along their
// rib, heads wrapped in them, feathery carrot tops, beans climbing their canes, ribbed pumpkins on a vine, cobs in their husks. Shared by
// the allotments and the garden beds. Each draws at the origin of the Shaper's frame, so the caller places it.

import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { Shaper } from './geo';

const _c = new THREE.Color();
const _c2 = new THREE.Color();

export interface LeafOpt {
  /** how far it reaches */
  len: number;
  /** widest, full width */
  wid: number;
  /** where it heads at its foot: 0 flat out, 1 straight up */
  rise: number;
  /** how far the tip falls again */
  droop: number;
  /** stations along it */
  segs?: number;
  /** fold along the rib: > 0 a V seen from above, < 0 a cup turned over it */
  fold?: number;
  /** wavy edge (lettuce) */
  frill?: number;
  /** both faces */
  both?: boolean;
  /** 0 long and narrow, 1 broad near the foot (heart) */
  broad?: number;
  /** colour of the rib, default paler than the blade */
  rib?: THREE.Color;
}

/** one leaf from (x, y, z), heading by yaw */
export function leaf(sh: Shaper, x: number, y: number, z: number, yaw: number, col: THREE.Color, o: LeafOpt): void {
  const segs = o.segs ?? 3;
  const dx = Math.cos(yaw),
    dz = Math.sin(yaw);
  const sx = -dz,
    sz = dx;
  const fold = o.fold ?? 0.3;
  const frill = o.frill ?? 0;
  const broad = o.broad ?? 0;
  const rib = o.rib ?? _c2.copy(col).multiplyScalar(1.22);
  const s = sh.s;
  const front: number[] = [];
  const back: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = o.len * t * (1 - 0.32 * o.rise * t);
    const h = o.len * (o.rise * Math.sin(t * Math.PI * 0.5) * 0.9) - o.droop * t * t;
    // the slope here, for the normal
    const hd = o.len * o.rise * Math.cos(t * Math.PI * 0.5) * 1.41 - 2 * o.droop * t;
    const ud = o.len * (1 - 0.64 * o.rise * t);
    const prof = broad > 0 ? Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55 + 0.25 * (1 - broad))), 0.8) : Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.03)), 0.55);
    const w = (o.wid / 2) * Math.max(i === segs ? 0.02 : 0.08, prof);
    const px = x + dx * u,
      pz = z + dz * u,
      py = y + h;
    let nx = -dx * hd,
      ny = ud,
      nz = -dz * hd;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const fy = fold * w;
    const wob = frill > 0 ? Math.sin(t * 11 + yaw * 7) * frill * w : 0;
    const shade = 0.82 + 0.26 * t;
    s.colorObj(col, shade);
    const l = sh.v(px - sx * w, py + fy + wob, pz - sz * w, nx - sx * fold * 0.8, ny, nz - sz * fold * 0.8);
    s.colorObj(rib, shade);
    const m = sh.v(px, py, pz, nx, ny, nz);
    s.colorObj(col, shade);
    const r = sh.v(px + sx * w, py + fy - wob, pz + sz * w, nx + sx * fold * 0.8, ny, nz + sz * fold * 0.8);
    front.push(l, m, r);
    if (o.both) {
      s.colorObj(col, shade * 0.72);
      const lb = sh.v(px - sx * w, py + fy + wob, pz - sz * w, -nx, -ny, -nz);
      const mb = sh.v(px, py, pz, -nx, -ny, -nz);
      const rb = sh.v(px + sx * w, py + fy - wob, pz + sz * w, -nx, -ny, -nz);
      back.push(lb, mb, rb);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3,
      b = (i + 1) * 3;
    // top faces (seen from above, heading +u with l on the -side)
    s.tri(front[a], front[a + 1], front[b + 1]);
    s.tri(front[a], front[b + 1], front[b]);
    s.tri(front[a + 1], front[a + 2], front[b + 2]);
    s.tri(front[a + 1], front[b + 2], front[b + 1]);
    if (o.both) {
      s.tri(back[a], back[b + 1], back[a + 1]);
      s.tri(back[a], back[b], back[b + 1]);
      s.tri(back[a + 1], back[b + 2], back[a + 2]);
      s.tri(back[a + 1], back[b + 1], back[b + 2]);
    }
  }
}

/** a round head: a ball with smooth normals, squashed, under the leaves */
function ball(sh: Shaper, x: number, y: number, z: number, rx: number, ry: number, rz: number, col: THREE.Color, rings = 5, sides = 8, ribs = 0, ribK = 0): void {
  const s = sh.s;
  const ids: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI - Math.PI / 2;
    const c = Math.cos(th),
      q = Math.sin(th);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const k = ribs > 0 ? 1 - ribK + ribK * Math.abs(Math.cos(a * ribs * 0.5)) : 1;
      s.colorObj(col, (0.72 + 0.3 * (q * 0.5 + 0.5)) * (ribs > 0 ? 0.82 + 0.22 * Math.abs(Math.cos(a * ribs * 0.5)) : 1));
      const nx = (c * Math.cos(a)) / rx,
        ny = q / ry,
        nz = (c * Math.sin(a)) / rz;
      ids.push(sh.v(x + c * Math.cos(a) * rx * k, y + q * ry, z + c * Math.sin(a) * rz * k, nx, ny, nz));
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) {
      const a = ids[i * sides + j],
        b = ids[i * sides + (j + 1) % sides],
        c = ids[(i + 1) * sides + j],
        d = ids[(i + 1) * sides + (j + 1) % sides];
      s.tri(a, c, b);
      s.tri(b, c, d);
    }
}

const hex = (c: string, k = 1) => new THREE.Color(c).multiplyScalar(k);

export function cabbage(sh: Shaper, rng: Rng): void {
  const k = rng.range(0.88, 1.1);
  const blue = hex('#5f8a62', k);
  // the outer leaves stand off, wide and veined, the tight head inside them
  const n = 7;
  const r0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = r0 + (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    leaf(sh, Math.cos(a) * 0.03, 0.01, Math.sin(a) * 0.03, a, blue, { len: rng.range(0.22, 0.3), wid: rng.range(0.2, 0.27), rise: rng.range(0.35, 0.6), droop: rng.range(0.03, 0.08), segs: 3, fold: -0.22, frill: 0.14, broad: 1, both: true });
  }
  ball(sh, 0, 0.095, 0, 0.082, 0.075, 0.082, _c.copy(hex('#86a873', k)));
  // the wrapper leaves folded round the head, each over the last, so what shows is leaf and rib rather than a ball
  for (let i = 0; i < 5; i++) {
    const a = r0 + i * 2.4;
    const ox = Math.cos(a) * 0.095,
      oz = Math.sin(a) * 0.095;
    leaf(sh, ox, 0.02, oz, a + Math.PI + 0.25, hex(i % 2 ? '#7ea26a' : '#6f9660', k), { len: 0.19, wid: 0.2, rise: 0.92, droop: 0.075, segs: 4, fold: -0.34, broad: 1, both: true, frill: 0.05 });
  }
}

export function lettuce(sh: Shaper, rng: Rng): void {
  const col = rng.chance(0.3) ? hex('#8a4f6a', rng.range(0.9, 1.1)) : hex('#8cc45a', rng.range(0.9, 1.1));
  const n = 9;
  const r0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = r0 + i * 2.39996;
    const t = i / (n - 1);
    leaf(sh, Math.cos(a) * 0.015, 0.008 + t * 0.03, Math.sin(a) * 0.015, a, col, { len: 0.2 - t * 0.09, wid: 0.15 - t * 0.04, rise: 0.25 + t * 0.6, droop: 0.05 - t * 0.04, segs: 3, fold: -0.2, frill: 0.3, broad: 0.8, both: i < 4 });
  }
}

export function carrotTop(sh: Shaper, rng: Rng): void {
  const col = hex('#5f9f3e', rng.range(0.88, 1.1));
  const n = 8;
  const r0 = rng.range(0, 6.28);
  // the shoulder of the root just showing, fronds springing from it
  ball(sh, 0, 0.005, 0, 0.022, 0.012, 0.022, _c.copy(hex('#d98232')), 2, 6);
  for (let i = 0; i < n; i++) {
    const a = r0 + i * 2.4;
    const L = rng.range(0.16, 0.3);
    leaf(sh, 0, 0.012, 0, a, col, { len: L, wid: 0.028, rise: rng.range(0.55, 0.9), droop: L * 0.32, segs: 3, fold: 0.1 });
    // a side frond off each, so the top reads feathery
    const h = L * 0.5;
    leaf(sh, Math.cos(a) * h * 0.45, h * 0.62, Math.sin(a) * h * 0.45, a + (i % 2 ? 0.9 : -0.9), col, { len: L * 0.42, wid: 0.018, rise: 0.25, droop: L * 0.12, segs: 2, fold: 0.1 });
  }
}

/** canes tied at the top, a vine winding up each, leaves in threes, red flowers, a few pods */
export function beans(sh: Shaper, rng: Rng, flower = '#e94a3c'): void {
  const n = 3;
  const r = 0.32;
  const top = 1.8;
  const r0 = rng.range(0, 6.28);
  sh.color('#8a6a48');
  for (let i = 0; i < n; i++) {
    const a = r0 + (i / n) * Math.PI * 2;
    sh.tube(Math.cos(a) * r, 0, Math.sin(a) * r, -Math.cos(a) * 0.035, top, -Math.sin(a) * 0.035, 0.012, 0.008, 4);
  }
  // the twine that ties them
  sh.color('#c9b78a').cyl(0, top * 0.88, 0, 0.03, 0.03, 0.03, 6, 0, true);
  const lf = hex('#4f9a3a', rng.range(0.9, 1.08));
  const lf2 = hex('#3f8430', rng.range(0.9, 1.08));
  for (let i = 0; i < n; i++) {
    const a0 = r0 + (i / n) * Math.PI * 2;
    const N = 18;
    let px = Math.cos(a0) * r + 0.02,
      py = 0,
      pz = Math.sin(a0) * r;
    sh.color('#5a8f38');
    for (let k = 1; k <= N; k++) {
      const t = k / N;
      const b = r * (1 - t * 0.88);
      const w = t * 13 + a0;
      const y = top * 0.86 * t;
      const qx = Math.cos(a0) * b + Math.cos(w) * 0.022,
        qz = Math.sin(a0) * b + Math.sin(w) * 0.022;
      sh.tube(px, py, pz, qx, y, qz, 0.0045, 0.004, 3);
      px = qx;
      py = y;
      pz = qz;
      if (k % 2 === 0) {
        const out = a0 + rng.range(-1.4, 1.4);
        const c = rng.chance(0.5) ? lf : lf2;
        const L = rng.range(0.11, 0.16) * (1.05 - t * 0.4);
        leaf(sh, qx, y, qz, out, c, { len: L, wid: L * 0.85, rise: 0.25, droop: L * 0.7, segs: 2, fold: 0.15, broad: 1, both: true });
        if (rng.chance(0.7)) leaf(sh, qx, y, qz, out + rng.range(1.2, 1.9), c, { len: L * 0.8, wid: L * 0.68, rise: 0.25, droop: L * 0.6, segs: 2, fold: 0.15, broad: 1, both: true });
      }
      if (t > 0.3 && k % 5 === 0) {
        const fa = a0 + rng.range(-1, 1);
        const fx = qx + Math.cos(fa) * 0.05,
          fz = qz + Math.sin(fa) * 0.05;
        ball(sh, fx, y - 0.01, fz, 0.016, 0.014, 0.016, _c.set(flower), 2, 5);
      }
      if (k % 6 === 3) {
        const pa = a0 + rng.range(-1.2, 1.2);
        const ex = qx + Math.cos(pa) * 0.05,
          ez = qz + Math.sin(pa) * 0.05;
        sh.color('#6aa848').tube(ex, y, ez, ex + 0.008, y - rng.range(0.09, 0.14), ez, 0.006, 0.003, 4, false);
      }
    }
  }
}

/** a maize plant: a jointed stem, long arching leaves up it, the tassel, a cob in its husk with its silk */
export function corn(sh: Shaper, rng: Rng): void {
  const h = rng.range(1.35, 1.75);
  const lf = hex('#6c9c3e', rng.range(0.9, 1.08));
  const lf2 = hex('#7aa848', rng.range(0.9, 1.08));
  sh.color('#7aa848').cyl(0, 0, 0, 0.024, 0.012, h, 6, 0, true);
  // brace roots at the foot
  sh.color('#8a9a4c');
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + 0.4;
    sh.tube(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, 0, 0.08, 0, 0.005, 0.005, 3);
  }
  const n = 8;
  const r0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.6) / n;
    const y = h * (0.06 + t * 0.82);
    const a = r0 + i * Math.PI + rng.range(-0.35, 0.35);
    const L = (0.72 - Math.abs(t - 0.45) * 0.62) * rng.range(0.9, 1.1);
    // sheathing the stem, then out and over
    leaf(sh, 0, y, 0, a, i % 2 ? lf : lf2, { len: L, wid: 0.068 - t * 0.016, rise: rng.range(0.62, 0.86), droop: L * rng.range(0.55, 0.8), segs: 5, fold: 0.22, both: true });
  }
  // the tassel: a central spike and side branches
  sh.color('#d8c06a');
  sh.tube(0, h - 0.02, 0, 0, h + 0.22, 0, 0.005, 0.002, 3);
  for (let i = 0; i < 6; i++) {
    const a = r0 + i * 1.05;
    const y = h + 0.03 + i * 0.022;
    const L = 0.09 + 0.02 * (i % 3);
    sh.tube(0, y, 0, Math.cos(a) * L, y + 0.06 - i * 0.008, Math.sin(a) * L, 0.0028, 0.0014, 3);
  }
  // one cob on the stem
  if (rng.chance(0.75)) {
    const a = r0 + 1.2;
    const y = h * 0.55;
    const ex = Math.cos(a) * 0.1,
      ez = Math.sin(a) * 0.1;
    sh.color('#8cae55').tube(Math.cos(a) * 0.012, y - 0.05, Math.sin(a) * 0.012, ex, y + 0.11, ez, 0.03, 0.012, 7, true);
    sh.color('#b58a3f').tube(ex, y + 0.11, ez, ex * 1.25, y + 0.15, ez * 1.25, 0.008, 0.003, 4);
  }
}

export function sunflower(sh: Shaper, rng: Rng): void {
  const h = rng.range(1.5, 2.1);
  const r0 = rng.range(0, 6.28);
  sh.color('#5d8f3a').cyl(0, 0, 0, 0.022, 0.014, h, 6, 0, true);
  const lf = hex('#4f8530', rng.range(0.92, 1.08));
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const a = r0 + i * 2.4;
    const L = 0.3 - t * 0.14;
    leaf(sh, 0, h * (0.14 + t * 0.74), 0, a, lf, { len: L, wid: L * 0.85, rise: 0.3, droop: L * 0.7, segs: 3, fold: 0.15, broad: 1, both: true });
  }
  // the head nods toward the south-east, on the bent neck
  const ax = 0.14,
    az = 0.12;
  sh.color('#5d8f3a').tube(0, h, 0, ax, h + 0.05, az, 0.014, 0.018, 5);
  sh.push().local(ax, h + 0.05, az, -1.05, Math.atan2(-ax, -az));
  sh.color('#3e5f28').cyl(0, -0.03, 0, 0.11, 0.135, 0.03, 12, 0, true);
  sh.color('#3a2614').cyl(0, 0, 0, 0.125, 0.11, 0.022, 14, 2, true);
  const ptl = hex('#f2c230', rng.range(0.94, 1.06));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rng.range(-0.05, 0.05);
    leaf(sh, Math.cos(a) * 0.115, 0.005, Math.sin(a) * 0.115, a, ptl, { len: rng.range(0.09, 0.12), wid: 0.038, rise: 0.1, droop: 0.02, segs: 2, fold: 0.1, both: true });
  }
  sh.pop();
}

export function pumpkin(sh: Shaper, rng: Rng): void {
  const ripe = rng.chance(0.7);
  const col = _c.copy(hex(ripe ? '#e8892c' : '#e2b23c', rng.range(0.92, 1.05))).clone();
  const r = rng.range(0.13, 0.2);
  const ox = rng.range(-0.1, 0.1),
    oz = rng.range(-0.1, 0.1);
  ball(sh, ox, r * 0.72, oz, r, r * 0.76, r, col, 6, 20, 10, 0.1);
  sh.color('#6d7a3a').tube(ox, r * 1.42, oz, ox + 0.03, r * 1.42 + 0.06, oz + 0.015, 0.02, 0.012, 5);
  // the vine and its big rough leaves running along the row
  const lf = hex('#5e9842', rng.range(0.9, 1.08));
  const r0 = rng.range(0, 6.28);
  sh.color('#6e9a44');
  let px = ox,
    pz = oz;
  for (let i = 0; i < 5; i++) {
    const a = r0 + i * 1.3;
    const L = rng.range(0.18, 0.3);
    const qx = px + Math.cos(a) * L,
      qz = pz + Math.sin(a) * L;
    sh.color('#6e9a44').tube(px, 0.02, pz, qx, 0.025, qz, 0.008, 0.007, 3);
    leaf(sh, qx, 0.03, qz, a + 0.9, lf, { len: rng.range(0.2, 0.28), wid: rng.range(0.22, 0.28), rise: rng.range(0.3, 0.55), droop: 0.08, segs: 3, fold: 0.1, frill: 0.12, broad: 1, both: true });
    px = qx;
    pz = qz;
  }
}

/** the soft cane of a berry bush, its leaves and fruit in clusters */
export function berryBush(sh: Shaper, rng: Rng): void {
  const lf = hex('#4c8a3a', rng.range(0.9, 1.08));
  const lf2 = hex('#3f7a30', rng.range(0.9, 1.08));
  const r0 = rng.range(0, 6.28);
  const fruit = rng.chance(0.5) ? '#c8203a' : '#3b2a6a';
  for (let i = 0; i < 6; i++) {
    const a = r0 + i * 1.05 + rng.range(-0.2, 0.2);
    const L = rng.range(0.42, 0.62);
    const ex = Math.cos(a) * L * 0.55,
      ez = Math.sin(a) * L * 0.55;
    const ty = L * rng.range(0.75, 1);
    sh.color('#6a5436').tube(0, 0, 0, ex, ty, ez, 0.01, 0.004, 3);
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const qx = ex * t,
        qz = ez * t,
        y = ty * t;
      const out = a + (k % 2 ? 1.1 : -1.1) + rng.range(-0.3, 0.3);
      leaf(sh, qx, y, qz, out, k % 2 ? lf : lf2, { len: 0.11, wid: 0.08, rise: 0.3, droop: 0.05, segs: 2, fold: 0.15, broad: 1, both: true });
      if (rng.chance(0.55)) {
        const b = _c.set(fruit);
        for (let j = 0; j < 3; j++) ball(sh, qx + rng.range(-0.025, 0.025), y - 0.03 - j * 0.012, qz + rng.range(-0.025, 0.025), 0.011, 0.012, 0.011, b, 2, 5);
      }
    }
  }
}

/** a stake with a tomato tied to it: a soft stem, leaves, trusses going from green to red */
export function tomato(sh: Shaper, rng: Rng): void {
  const h = rng.range(0.85, 1.2);
  sh.color('#a88a5a').tube(0, 0, 0.02, 0, h + 0.2, 0.02, 0.01, 0.009, 4);
  const lf = hex('#4f8a3a', rng.range(0.9, 1.06));
  const lf2 = hex('#5f9a44', rng.range(0.9, 1.06));
  const r0 = rng.range(0, 6.28);
  let px = 0,
    pz = 0,
    py = 0;
  for (let k = 1; k <= 9; k++) {
    const t = k / 9;
    const qx = Math.sin(t * 7 + r0) * 0.02,
      qz = Math.cos(t * 5 + r0) * 0.02 - 0.012,
      y = h * t;
    sh.color('#6a9a3f').tube(px, py, pz, qx, y, qz, 0.009 - 0.005 * t, 0.008 - 0.005 * t, 3);
    px = qx;
    py = y;
    pz = qz;
    const a = r0 + k * 2.4;
    const L = 0.2 - 0.08 * t;
    leaf(sh, qx, y, qz, a, k % 2 ? lf : lf2, { len: L, wid: L * 0.62, rise: 0.25, droop: L * 0.55, segs: 3, fold: 0.15, frill: 0.28, broad: 0.8, both: true });
    if (k % 3 === 1) {
      const ta = a + 1.4;
      const tx = qx + Math.cos(ta) * 0.05,
        tz = qz + Math.sin(ta) * 0.05;
      for (let j = 0; j < 3; j++) {
        const c = _c.set(rng.chance(0.55 - t * 0.2) ? '#d03a24' : rng.chance(0.5) ? '#e8842c' : '#8fb04a');
        ball(sh, tx + (j - 1) * 0.022, y - 0.04 - (j % 2) * 0.02, tz, 0.019, 0.018, 0.019, c, 3, 6);
      }
    }
  }
}

/** onions in a row: the bulb half out of the ground, its hollow leaves falling over */
export function onion(sh: Shaper, rng: Rng): void {
  const col = _c.set(rng.chance(0.8) ? '#c8a25a' : '#8a4f6a').clone();
  ball(sh, 0, 0.022, 0, 0.034, 0.028, 0.034, col, 3, 7);
  const lf = hex('#6e9e50', rng.range(0.9, 1.08));
  const r0 = rng.range(0, 6.28);
  for (let i = 0; i < 4; i++) leaf(sh, 0, 0.04, 0, r0 + i * 1.7, lf, { len: rng.range(0.16, 0.26), wid: 0.014, rise: 0.8, droop: 0.12, segs: 3, fold: 0.05 });
}

/** A ridge of worked earth from a to b, width across it (vertex coloured): rounded, lumpy, darker where it is watered. */
export function soilRidge(sh: Shaper, ax: number, az: number, bx: number, bz: number, y: number, width: number, rng: Rng): void {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / 0.28));
  const tx = (bx - ax) / L,
    tz = (bz - az) / L;
  const sx = -tz,
    sz = tx;
  const A = 4;
  const s = sh.s;
  const soil = _c.set('#5b3e2a').clone();
  const dark = _c.set('#3f2a1c').clone();
  const ids: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const end = Math.min(1, Math.min(t, 1 - t) * L * 3.2 + 0.25);
    for (let j = 0; j <= A; j++) {
      const v = j / A - 0.5;
      const round = Math.pow(Math.max(0, 1 - 4 * v * v), 0.55);
      const lump = j > 0 && j < A ? rng.range(-0.022, 0.022) : 0;
      const h = (0.03 + 0.11 * round) * end + lump;
      const k = rng.range(0.82, 1.2);
      s.colorObj(rng.chance(0.3) ? dark : soil, k);
      const across = v * width * (1 + rng.range(-0.05, 0.05));
      ids.push(sh.v(ax + tx * L * t + sx * across, y + h, az + tz * L * t + sz * across, sx * v * 1.6, 1, sz * v * 1.6));
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < A; j++) {
      const a = ids[i * (A + 1) + j],
        b = ids[i * (A + 1) + j + 1],
        c = ids[(i + 1) * (A + 1) + j],
        d = ids[(i + 1) * (A + 1) + j + 1];
      s.tri(a, b, c);
      s.tri(b, d, c);
    }
}
