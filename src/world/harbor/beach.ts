// Beach life: lifeguard towers, striped parasols with towels / loungers / windbreaks (kept clear
// of the walking paths and the sunbathing spots around beach-path ends), beach balls, kayaks,
// sandcastles; plus the ferry dock (floating pontoon, hinged gangway, shelter, lights).

import * as THREE from 'three';
import { WATER_LEVEL } from '../../core/constants';
import { distToSegment, type P2, type Rect } from '../../core/geom';
import type { Rng } from '../../core/rng';
import { EMIT, HB, PAT, type V3 } from './geo';
import type { GlowPoint } from './material';

const STRIPES: [string, string][] = [
  ['#e63946', '#fbf7ee'],
  ['#2a9d8f', '#fbf7ee'],
  ['#457b9d', '#fbf7ee'],
  ['#e9c46a', '#fbf7ee'],
  ['#f4a261', '#fbf7ee'],
  ['#8d6cab', '#fbf7ee'],
  ['#e63946', '#e9c46a'],
  ['#264653', '#e9c46a'],
];
const TOWELS = ['#e63946', '#2a9d8f', '#e9c46a', '#457b9d', '#f4a261', '#8d6cab', '#ff8fab', '#06d6a0'];

type Ground = (x: number, z: number) => number;

/** box hunt (?nobeachkit): real parasols (domed panels, ribs, runner, scalloped valance) and a hipped,
 *  cross-braced lifeguard hut; off = the earlier flat cones / slab roof */
let DETAIL = true;
export function setBeachDetail(on: boolean): void {
  DETAIL = on;
}

export function lifeguardTower(b: HB, x: number, z: number, yaw: number, ground: Ground): void {
  // built facing +z locally (yaw turns it to face the sea)
  const gy = ground(x, z);
  const deck = Math.max(gy, WATER_LEVEL + 0.4) + 2.4;
  b.pushT(x, 0, z, yaw);
  b.noEmit().pat(PAT.NONE);
  // stilts (each to its own sand height)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const lx = sx * 0.85,
        lz = sz * 0.85;
      const wx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
        wz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
      const g = ground(wx, wz) - 0.2;
      b.color('#f2efe6');
      b.box(lx, (g + deck) / 2, lz, 0.14, deck - g, 0.14, 0, 3);
    }
  b.color('#d9d3c6');
  if (DETAIL) {
    // X-braced on all four sides, a tie at mid height
    for (const sz of [-1, 1]) {
      b.beam([-0.85, deck - 2.0, sz * 0.85], [0.85, deck - 0.3, sz * 0.85], 0.06, 0.06);
      b.beam([0.85, deck - 2.0, sz * 0.85], [-0.85, deck - 0.3, sz * 0.85], 0.06, 0.06);
      b.beam([sz * 0.85, deck - 2.0, -0.85], [sz * 0.85, deck - 0.3, 0.85], 0.06, 0.06);
      b.beam([sz * 0.85, deck - 2.0, 0.85], [sz * 0.85, deck - 0.3, -0.85], 0.06, 0.06);
    }
  } else for (const sz of [-1, 1]) b.beam([-0.85, deck - 1.2, sz * 0.85], [0.85, deck - 0.3, sz * 0.85], 0.06, 0.06);
  // platform + hut
  b.color('#c8a476').pat(PAT.PLANKS_X, 0.2);
  b.box(0, deck - 0.06, 0.25, 2.3, 0.12, 2.6, 0, 0);
  b.pat(PAT.NONE);
  b.color('#f6f1e6');
  b.box(0, deck + 0.95, -0.25, 1.9, 1.9, 1.6, 0, 1);
  b.color('#e63946');
  b.box(0, deck + 1.55, -0.25, 1.92, 0.32, 1.62, 0, 3);
  b.color('#2e3a44');
  b.box(0, deck + 1.1, 0.56, 1.3, 0.6, 0.04, 0, 3);
  b.box(0.96, deck + 1.1, -0.25, 0.04, 0.6, 1.0, 0, 3);
  b.box(-0.96, deck + 1.1, -0.25, 0.04, 0.6, 1.0, 0, 3);
  // roof with overhang
  b.color('#e63946');
  if (DETAIL) {
    // hipped roof: fascia band, four sloping planes to a short ridge, a lookout's flag finial
    const y0 = deck + 1.92,
      y1 = deck + 2.42,
      cz = -0.15,
      hx = 1.22,
      hz = 1.12;
    b.box(0, y0 - 0.04, cz, hx * 2, 0.1, hz * 2, 0, 2);
    const A: V3 = [-hx, y0, cz - hz],
      B: V3 = [hx, y0, cz - hz],
      C: V3 = [hx, y0, cz + hz],
      D: V3 = [-hx, y0, cz + hz],
      r0: V3 = [-0.3, y1, cz],
      r1: V3 = [0.3, y1, cz];
    b.quad(D, C, r1, r0);
    b.quad(B, A, r0, r1);
    b.triangle(C, B, r1);
    b.triangle(A, D, r0);
    b.color('#f6f1e6');
    b.beam([-0.3, y1 + 0.02, cz], [0.3, y1 + 0.02, cz], 0.08, 0.05);
  } else b.box(0, deck + 1.97, -0.15, 2.4, 0.12, 2.2, 0, 0);
  // railing on the front platform
  b.color('#f2efe6');
  for (const sx of [-1, 1]) b.box(sx * 1.1, deck + 0.45, 0.95, 0.06, 0.9, 0.06, 0, 3);
  b.box(0, deck + 0.9, 1.5, 2.3, 0.06, 0.06, 0, 0);
  b.box(1.12, deck + 0.9, 0.25, 0.06, 0.06, 2.5, 0, 0);
  b.box(-1.12, deck + 0.9, 0.25, 0.06, 0.06, 2.5, 0, 0);
  // ramp down the back (local −z)
  const gb = ground(x - Math.sin(yaw) * 4.2, z - Math.cos(yaw) * 4.2);
  b.color('#c8a476');
  b.beam([0, deck - 0.1, -1.1], [0, gb + 0.06, -4.4], 0.9, 0.08);
  // flag pole + red/yellow flag
  b.color('#e8e4da');
  b.cyl([1.0, deck + 2.0, -1.0], [1.0, deck + 4.0, -1.0], 0.035, 0.03, 5, 2);
  b.color('#e63946');
  b.quad2([1.0, deck + 3.95, -1.0], [1.0, deck + 3.95, -1.85], [1.0, deck + 3.62, -1.85], [1.0, deck + 3.62, -1.0]);
  b.color('#f2c94c');
  b.quad2([1.0, deck + 3.62, -1.0], [1.0, deck + 3.62, -1.85], [1.0, deck + 3.3, -1.85], [1.0, deck + 3.3, -1.0]);
  // life ring on the railing, rescue board leaning on a stilt
  b.color('#e85d3a');
  const rp: V3[] = [];
  for (let k = 0; k <= 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    rp.push([Math.cos(a) * 0.28, deck + 0.6 + Math.sin(a) * 0.28, 1.56]);
  }
  b.tube(rp, 0.07, 5);
  b.color('#f2c94c');
  b.pushT(-1.25, gy + 1.1, 0.9, 0, 0, 0.25);
  b.box(0, 0, 0, 0.12, 2.3, 0.55, 0, 0);
  b.pop();
  b.pop();
}

export interface BeachSpec {
  rects: { r: Rect; count: number }[];
  /** walking paths (polylines) to keep clear of, with half widths */
  paths: { pts: P2[]; half: number }[];
  /** sunbathing spot centres (beach path ends) to keep free */
  spots: P2[];
  /** other solid circles (lifeguard towers, pier piles…) */
  blocks: { x: number; z: number; r: number }[];
  /** keep out of z ranges (pier) */
  noZ: [number, number][];
}

export interface BeachExtras {
  balls: number;
  kayaks: { x0: number; x1: number; z0: number; z1: number; n: number }[];
  castles: number;
}

export function scatterBeach(b: HB, spec: BeachSpec, ground: Ground, rng: Rng, extras?: BeachExtras): { umbrellas: number; towels: number; extras: number } {
  let umbrellas = 0,
    towels = 0;
  const placed: { x: number; z: number; r: number }[] = [];
  const clear = (x: number, z: number, r: number): boolean => {
    for (const p of spec.paths) {
      for (let i = 0; i < p.pts.length - 1; i++) if (distToSegment({ x, z }, p.pts[i], p.pts[i + 1]) < p.half + 1.5 + r) return false;
    }
    for (const s of spec.spots) if (Math.hypot(x - s.x, z - s.z) < 5.2 + r) return false;
    for (const q of spec.blocks) if (Math.hypot(x - q.x, z - q.z) < q.r + r + 0.6) return false;
    for (const q of placed) if (Math.hypot(x - q.x, z - q.z) < q.r + r + 0.5) return false;
    for (const [a, c] of spec.noZ) if (z + r > a && z - r < c) return false;
    return true;
  };
  for (const { r, count } of spec.rects) {
    let made = 0;
    for (let tries = 0; tries < count * 40 && made < count; tries++) {
      const x = rng.range(r.x0 + 1.2, r.x1 - 1.2),
        z = rng.range(r.z0 + 1.2, r.z1 - 1.2);
      if (!clear(x, z, 1.6)) continue;
      const gy = ground(x, z);
      if (gy < WATER_LEVEL + 0.25) continue;
      placed.push({ x, z, r: 1.6 });
      made++;
      umbrellas++;
      const [c1, c2] = rng.pick(STRIPES);
      const tilt = rng.range(-0.12, 0.12);
      parasol(b, x, gy, z, c1, c2, rng.range(0, Math.PI), tilt, rng.range(1.15, 1.45));
      // what's under it: towels, a lounger pair or a windbreak
      const kind = rng.weighted(['towels', 'loungers', 'mixed'], [0.45, 0.3, 0.25]);
      const yaw = Math.PI / 2 + rng.range(-0.35, 0.35); // heads to the land, feet to the sea
      if (kind === 'towels' || kind === 'mixed') {
        const n = kind === 'mixed' ? 1 : rng.int(1, 2);
        for (let k = 0; k < n; k++) {
          const ox = rng.range(-0.3, 0.6),
            oz = (k === 0 ? -0.65 : 0.65) + rng.range(-0.2, 0.2);
          towel(b, x + ox, z + oz, yaw + rng.range(-0.2, 0.2), ground, rng.pick(TOWELS), rng.pick(TOWELS));
          towels++;
        }
      }
      if (kind === 'loungers' || kind === 'mixed') {
        const n = kind === 'mixed' ? 1 : 2;
        for (let k = 0; k < n; k++) lounger(b, x + 0.4, z + (n === 1 ? 0.75 : k === 0 ? -0.75 : 0.75), yaw, ground, rng.chance(0.5) ? '#2a9d8f' : '#457b9d');
      }
      if (rng.chance(0.22)) windbreak(b, x - 1.3, z, ground, rng.pick(STRIPES));
      if (rng.chance(0.18)) {
        // cool box / bucket
        b.color(rng.pick(['#e63946', '#2a9d8f', '#457b9d']));
        b.box(x - 0.6, gy + 0.18, z + rng.range(-0.8, 0.8), 0.5, 0.36, 0.34, rng.range(0, 3), 1);
      }
    }
  }
  let nExtra = 0;
  if (extras) {
    const all = spec.rects.map((q) => q.r);
    const pickIn = (r: number, tries = 60): { x: number; z: number } | null => {
      for (let t = 0; t < tries; t++) {
        const q = rng.pick(all);
        const x = rng.range(q.x0 + 0.5, q.x1 - 0.5),
          z = rng.range(q.z0 + 0.5, q.z1 - 0.5);
        if (!clear(x, z, r)) continue;
        if (ground(x, z) < WATER_LEVEL + 0.2) continue;
        return { x, z };
      }
      return null;
    };
    for (let k = 0; k < extras.balls; k++) {
      const p = pickIn(0.4);
      if (!p) continue;
      placed.push({ x: p.x, z: p.z, r: 0.4 });
      beachBall(b, p.x, p.z, ground, rng.range(0.18, 0.26));
      nExtra++;
    }
    for (let k = 0; k < extras.castles; k++) {
      const p = pickIn(1.2);
      if (!p) continue;
      placed.push({ x: p.x, z: p.z, r: 1.2 });
      sandcastle(b, p.x, p.z, ground, rng);
      nExtra++;
    }
    for (const kz of extras.kayaks) {
      for (let k = 0; k < kz.n; k++) {
        for (let t = 0; t < 30; t++) {
          const x = rng.range(kz.x0, kz.x1),
            z = rng.range(kz.z0, kz.z1);
          if (!clear(x, z, 1.9)) continue;
          placed.push({ x, z, r: 1.9 });
          kayak(b, x, z, Math.PI / 2 + rng.range(-0.25, 0.25) + (rng.chance(0.5) ? Math.PI : 0), ground, rng.pick(['#f2c94c', '#e63946', '#f4a261', '#2a9d8f']));
          nExtra++;
          break;
        }
      }
    }
  }
  return { umbrellas, towels, extras: nExtra };
}

function parasol(b: HB, x: number, gy: number, z: number, c1: string, c2: string, rot: number, tilt: number, R: number): void {
  if (DETAIL) {
    parasolReal(b, x, gy, z, c1, c2, rot, tilt, R * 0.8);
    return;
  }
  const h = 2.15;
  const tx = Math.sin(tilt) * h,
    ty = Math.cos(tilt) * h;
  const top: V3 = [x + tx, gy + ty, z];
  b.noEmit().pat(PAT.NONE);
  b.color('#e8e2d4');
  b.cyl([x, gy - 0.3, z], top, 0.03, 0.025, 5, 0);
  // canopy: 8 striped panels, slightly drooping cone
  const n = 8;
  const apex: V3 = [top[0], top[1] + 0.3, top[2]];
  for (let k = 0; k < n; k++) {
    const a0 = rot + (k / n) * Math.PI * 2,
      a1 = rot + ((k + 1) / n) * Math.PI * 2;
    const p0: V3 = [top[0] + Math.cos(a0) * R, top[1] - 0.12 + Math.sin(tilt) * Math.cos(a0) * -0.4, top[2] + Math.sin(a0) * R];
    const p1: V3 = [top[0] + Math.cos(a1) * R, top[1] - 0.12 + Math.sin(tilt) * Math.cos(a1) * -0.4, top[2] + Math.sin(a1) * R];
    b.color(k % 2 === 0 ? c1 : c2);
    b.triangle(p1, p0, apex);
    b.triangle(p0, p1, apex);
    // scalloped valance
    b.quad2(p0, p1, [p1[0], p1[1] - 0.14, p1[2]], [p0[0], p0[1] - 0.14, p0[2]]);
  }
  b.color(c1);
  b.sphere(apex[0], apex[1] + 0.04, apex[2], 0.06, 5, 3);
}

/**
 * A beach parasol as built: a two-part pole (tilt collar), the runner and its stretchers, eight ribs under a
 * domed canopy whose panels sag between the ribs, a scalloped valance and a finial. Pole axis tilted by `tilt`
 * about Z; the canopy stays square to the pole.
 */
function parasolReal(b: HB, x: number, gy: number, z: number, c1: string, c2: string, rot: number, tilt: number, R: number): void {
  const h = 2.1;
  const ux = Math.sin(tilt),
    uy = Math.cos(tilt); // pole direction (x, y)
  // a point at height t up the pole, pushed out r along the canopy direction a (perpendicular to the pole)
  const P = (t: number, r: number, a: number, dy = 0): V3 => {
    const ca = Math.cos(a),
      sa = Math.sin(a);
    // canopy plane basis: e1 = (uy, -ux, 0) (in the tilt plane), e2 = (0, 0, 1)
    return [x + ux * t + uy * ca * r + ux * dy, gy + uy * t - ux * ca * r + uy * dy, z + sa * r];
  };
  b.noEmit().pat(PAT.NONE);
  b.color('#e8e2d4');
  b.cyl([x, gy - 0.35, z], [x, gy + 1.15, z], 0.032, 0.03, 6, 0);
  b.cyl([x, gy + 1.15, z], P(h + 0.05, 0, 0), 0.026, 0.024, 6, 0);
  b.color('#9aa0a6');
  b.cyl([x, gy + 1.08, z], [x, gy + 1.22, z], 0.045, 0.045, 6, 3);
  // runner collar and the hub under the canopy
  const tRun = h - 0.5;
  b.cyl(P(tRun - 0.06, 0, 0), P(tRun + 0.06, 0, 0), 0.042, 0.042, 6, 3);
  b.cyl(P(h - 0.05, 0, 0), P(h + 0.03, 0, 0), 0.05, 0.04, 6, 3);
  // canopy: panels between ribs, rings at t 0 / 0.55 / 1 (domed), sag at the panel middles
  const n = 8,
    rise = 0.34;
  const ringY = (f: number) => rise * (1 - Math.pow(f, 1.35)) - 0.02;
  const pt = (f: number, a: number, sag: number): V3 => P(h, R * f, a, ringY(f) - sag);
  for (let k = 0; k < n; k++) {
    const a0 = rot + (k / n) * Math.PI * 2,
      a1 = rot + ((k + 1) / n) * Math.PI * 2,
      am = (a0 + a1) / 2;
    const apex = pt(0, 0, 0),
      m0 = pt(0.55, a0, 0),
      mm = pt(0.55, am, 0.03),
      m1 = pt(0.55, a1, 0),
      e0 = pt(1, a0, 0),
      em = pt(1, am, 0.06),
      e1 = pt(1, a1, 0);
    b.color(k % 2 === 0 ? c1 : c2);
    for (const [p, q, r] of [
      [m1, m0, apex],
      [mm, m0, m1],
      [e0, m0, mm],
      [e0, mm, em],
      [em, mm, m1],
      [em, m1, e1],
    ] as V3[][]) {
      b.triangle(p, q, r);
      b.triangle(q, p, r);
    }
    // scalloped valance: three drops per panel, deepest in the middle of each scallop
    const drop = [0.06, 0.15, 0.06];
    const edge = (u: number): V3 => {
      const a = a0 + (a1 - a0) * u;
      const sag = 0.06 * Math.sin(u * Math.PI);
      return pt(1, a, sag);
    };
    for (let j = 0; j < 3; j++) {
      const pa = edge(j / 3),
        pb = edge((j + 1) / 3),
        pc = edge((j + 0.5) / 3);
      const d = drop[1] - (j === 1 ? 0 : 0.03);
      b.quad2(pa, pb, [pb[0], pb[1] - drop[0], pb[2]], [pa[0], pa[1] - drop[0], pa[2]]);
      b.triangle(pa, [pa[0], pa[1] - drop[0], pa[2]], [pc[0], pc[1] - d, pc[2]]);
      b.triangle([pa[0], pa[1] - drop[0], pa[2]], pa, [pc[0], pc[1] - d, pc[2]]);
      b.triangle([pb[0], pb[1] - drop[0], pb[2]], [pc[0], pc[1] - d, pc[2]], [pa[0], pa[1] - drop[0], pa[2]]);
      b.triangle([pc[0], pc[1] - d, pc[2]], [pb[0], pb[1] - drop[0], pb[2]], [pa[0], pa[1] - drop[0], pa[2]]);
    }
    // rib under the canopy (hub → tip) and its stretcher from the runner
    b.color('#d8d2c4');
    const tip = pt(1, a0, 0.025);
    b.beam(pt(0, 0, 0.04), pt(0.55, a0, 0.03), 0.014, 0.014);
    b.beam(pt(0.55, a0, 0.03), tip, 0.012, 0.012);
    b.beam(P(tRun, 0.03, a0), pt(0.5, a0, 0.035), 0.01, 0.01);
    b.color(k % 2 === 0 ? c1 : c2);
  }
  b.color('#d8d2c4');
  const top = pt(0, 0, 0);
  b.cyl(top, [top[0] + ux * 0.12, top[1] + uy * 0.12, top[2]], 0.012, 0.012, 5, 0);
  b.sphere(top[0] + ux * 0.14, top[1] + uy * 0.14, top[2], 0.035, 6, 4);
}

function towel(b: HB, x: number, z: number, yaw: number, ground: Ground, c1: string, c2: string): void {
  const gy = ground(x, z);
  b.pushT(x, gy - 0.015, z, yaw);
  const L = 1.7,
    W = 0.85;
  // three bands along the length
  const bands: [number, number, string][] = [
    [-L / 2, -L / 2 + 0.25, c2],
    [-L / 2 + 0.25, L / 2 - 0.25, c1],
    [L / 2 - 0.25, L / 2, c2],
  ];
  for (const [a, c, col] of bands) {
    b.color(col);
    b.quad([-W / 2, 0.035, a], [-W / 2, 0.035, c], [W / 2, 0.035, c], [W / 2, 0.035, a]);
  }
  b.pop();
}

function lounger(b: HB, x: number, z: number, yaw: number, ground: Ground, col: string): void {
  const gy = ground(x, z);
  b.pushT(x, gy, z, yaw);
  b.color('#c8a476');
  for (const sx of [-1, 1]) {
    b.box(sx * 0.3, 0.17, -0.55, 0.05, 0.34, 0.05, 0, 3);
    b.box(sx * 0.3, 0.17, 0.75, 0.05, 0.34, 0.05, 0, 3);
  }
  b.box(0, 0.34, 0.15, 0.66, 0.06, 1.4, 0, 0);
  b.pushT(0, 0.36, -0.55, 0, -0.75);
  b.box(0, 0, -0.32, 0.66, 0.05, 0.66, 0, 0);
  b.pop();
  b.color(col);
  b.box(0, 0.39, 0.15, 0.6, 0.04, 1.36, 0, 1);
  b.pop();
}

function windbreak(b: HB, x: number, z: number, ground: Ground, cols: [string, string]): void {
  const n = 5;
  const pts: V3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const px = x + Math.sin(t * Math.PI) * 0.5,
      pz = z - 1.4 + 2.8 * t;
    pts.push([px, ground(px, pz), pz]);
  }
  for (let k = 0; k < n; k++) {
    const [ax, ay, az] = pts[k],
      [bx, by, bz] = pts[k + 1];
    b.color(k % 2 === 0 ? cols[0] : cols[1]);
    b.quad2([ax, ay + 0.05, az], [bx, by + 0.05, bz], [bx, by + 1.05, bz], [ax, ay + 1.05, az]);
  }
  b.color('#8a6a4a');
  for (const [px, py, pz] of pts) b.box(px, py + 0.5, pz, 0.04, 1.3, 0.04, 0, 3);
}

export function beachBall(b: HB, x: number, z: number, ground: Ground, r = 0.22): void {
  const gy = ground(x, z);
  const cols = ['#e63946', '#fbf7ee', '#2a9d8f', '#fbf7ee', '#e9c46a', '#fbf7ee'];
  // 6 gores
  for (let k = 0; k < 6; k++) {
    b.color(cols[k]);
    const a0 = (k / 6) * Math.PI * 2,
      a1 = ((k + 1) / 6) * Math.PI * 2;
    for (let j = 0; j < 4; j++) {
      const t0 = (j / 4) * Math.PI,
        t1 = ((j + 1) / 4) * Math.PI;
      const P = (a: number, t: number): V3 => [x + Math.sin(t) * Math.cos(a) * r, gy + r + Math.cos(t) * r, z + Math.sin(t) * Math.sin(a) * r];
      b.quad(P(a0, t0), P(a1, t0), P(a1, t1), P(a0, t1));
    }
  }
}

export function kayak(b: HB, x: number, z: number, yaw: number, ground: Ground, col: string): void {
  const gy = ground(x, z);
  b.pushT(x, Math.max(gy, WATER_LEVEL + 0.02) + 0.02, z, yaw);
  // pointed hull from stations
  const st = [-1.75, -1.3, -0.6, 0, 0.6, 1.3, 1.75];
  const hw = (s: number) => 0.34 * Math.sqrt(Math.max(0, 1 - Math.pow(s / 1.78, 2)));
  b.color(col);
  for (let i = 0; i < st.length - 1; i++) {
    const s0 = st[i],
      s1 = st[i + 1];
    const w0 = hw(s0),
      w1 = hw(s1);
    for (const sd of [-1, 1]) {
      const a: V3 = [sd * w0, 0.28, s0],
        bb: V3 = [sd * w1, 0.28, s1],
        c: V3 = [sd * w1 * 0.55, 0.0, s1],
        d: V3 = [sd * w0 * 0.55, 0.0, s0];
      if (sd > 0) b.quad(a, bb, c, d);
      else b.quad(a, d, c, bb);
    }
    b.quad([-w0, 0.28, s0], [-w1, 0.28, s1], [w1, 0.28, s1], [w0, 0.28, s0]);
  }
  b.color('#2b2b2b');
  b.box(0, 0.3, 0.1, 0.36, 0.04, 0.6, 0, 1);
  b.color('#f2efe6');
  b.box(0.15, 0.32, 0.4, 0.05, 0.03, 2.1, 0.5, 0);
  b.pop();
}

export function sandcastle(b: HB, x: number, z: number, ground: Ground, rng: Rng): void {
  const gy = ground(x, z) - 0.02;
  b.color('#e3cf98');
  b.cyl([x, gy, z], [x, gy + 0.32, z], 0.55, 0.45, 10, 2);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const tx = x + Math.cos(a) * 0.5,
      tz = z + Math.sin(a) * 0.5;
    b.cyl([tx, gy, tz], [tx, gy + 0.5, tz], 0.16, 0.13, 7, 2);
    b.cyl([tx, gy + 0.5, tz], [tx, gy + 0.62, tz], 0.15, 0.0, 7, 0);
  }
  b.cyl([x, gy + 0.32, z], [x, gy + 0.72, z], 0.22, 0.18, 8, 2);
  b.color('#e63946');
  b.cyl([x, gy + 0.72, z], [x, gy + 1.0, z], 0.012, 0.012, 3, 0);
  b.triangle([x, gy + 1.0, z], [x + 0.18, gy + 0.94, z], [x, gy + 0.88, z]);
  // bucket + spade
  b.color(rng.pick(['#2a9d8f', '#e9c46a', '#457b9d']));
  b.cyl([x + 0.9, gy, z + 0.3], [x + 0.9, gy + 0.22, z + 0.3], 0.1, 0.13, 7, 1);
  b.color('#e63946');
  b.box(x + 0.75, gy + 0.03, z - 0.5, 0.12, 0.03, 0.5, 0.6, 0);
}

// ──────────────────────────────────────────────────────────── ferry dock
/** box hunt (?noferrydock): the ferry pontoon fitted out — guide piles in hoops, tyre fenders, cleats, a ladder,
 *  a lifebuoy cabinet, a weed line, a barrel-roofed shelter with a timetable and a slatted gangway on rollers */
let FERRY = true;
export function setFerryDockDetail(on: boolean): void {
  FERRY = on;
}

interface DockBox {
  px0: number;
  px1: number;
  pz0: number;
  pz1: number;
  top: number;
}

function ferryDockKit(b: HB, d: DockBox): void {
  const { px0, px1, pz0, pz1, top } = d;
  b.noEmit().pat(PAT.NONE);
  // weed / algae line a hand above the water all round the floating body
  b.color('#3d4a3a');
  const wl0 = WATER_LEVEL - 0.05,
    wl1 = WATER_LEVEL + 0.14;
  b.boxMM(px0 - 0.02, wl0, pz0 - 0.02, px1 + 0.02, wl1, pz0, 3);
  b.boxMM(px0 - 0.02, wl0, pz1, px1 + 0.02, wl1, pz1 + 0.02, 3);
  b.boxMM(px1, wl0, pz0, px1 + 0.02, wl1, pz1, 3);
  // guide piles: steel tubes through hoops on the long sides, yellow caps
  for (const z of [pz0 - 0.38, pz1 + 0.38])
    for (const x of [px0 + 1.6, px1 - 1.6]) {
      b.color('#3c4248');
      b.cyl([x, WATER_LEVEL - 2.5, z], [x, top + 3.0, z], 0.24, 0.24, 10, 2);
      b.color('#f2c94c');
      b.cyl([x, top + 3.0, z], [x, top + 3.12, z], 0.26, 0.2, 10, 2);
      b.color('#2a2c2f');
      b.box(x, top - 0.2, z, 0.66, 0.16, 0.66, 0, 0);
      b.box(x, top - 0.2, (z + (z < pz0 ? pz0 : pz1)) / 2, 0.3, 0.14, 0.4, 0, 0);
      b.color('#5a4a3a');
      b.cyl([x, WATER_LEVEL - 0.1, z], [x, WATER_LEVEL + 0.3, z], 0.25, 0.25, 10, 0);
    }
  // tyre fenders on lanyards along the berth face
  const nT = Math.max(2, Math.floor((pz1 - pz0 - 1.2) / 1.4));
  for (let i = 0; i <= nT; i++) {
    const z = pz0 + 0.6 + ((pz1 - pz0 - 1.2) * i) / nT;
    const t = new THREE.TorusGeometry(0.3, 0.11, 6, 10);
    t.rotateY(Math.PI / 2);
    b.color('#1b1d20');
    b.geo(t, new THREE.Matrix4().makeTranslation(px1 + 0.3, top - 0.42, z));
    t.dispose();
    b.color('#c9b48a');
    b.beam([px1 + 0.3, top - 0.13, z], [px1 - 0.05, top + 0.03, z], 0.03, 0.03);
  }
  // cast cleats between the bollards
  b.color('#2c2f33');
  for (const z of [pz0 + 2.4, pz1 - 2.4, (pz0 + pz1) / 2]) {
    b.box(px1 - 0.4, top + 0.05, z, 0.12, 0.1, 0.16, 0, 1);
    b.box(px1 - 0.4, top + 0.12, z, 0.1, 0.05, 0.5, 0, 0);
  }
  // ladder down the side into the water
  const lx = px1 - 2.6;
  b.color('#c8ccd0');
  for (const e of [-0.22, 0.22]) b.cyl([lx + e, WATER_LEVEL - 0.8, pz0 - 0.1], [lx + e, top + 0.6, pz0 - 0.1], 0.025, 0.025, 6, 0);
  for (let y = WATER_LEVEL - 0.6; y < top; y += 0.3) b.box(lx, y, pz0 - 0.1, 0.44, 0.03, 0.03, 0, 0);
  // lifebuoy cabinet on a post
  const bx = px0 + 4.6;
  b.color('#2f5d5a');
  b.cyl([bx, top, pz0 + 0.35], [bx, top + 1.0, pz0 + 0.35], 0.05, 0.05, 6, 0);
  b.box(bx, top + 1.25, pz0 + 0.35, 0.8, 0.8, 0.14, 0, 0);
  const buoy = new THREE.TorusGeometry(0.27, 0.07, 6, 14);
  b.color('#e8622c');
  b.geo(buoy, new THREE.Matrix4().makeTranslation(bx, top + 1.25, pz0 + 0.27));
  buoy.dispose();
  b.color('#f4f1ea');
  for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI])
    b.box(bx + Math.cos(a) * 0.27, top + 1.25 + Math.sin(a) * 0.27, pz0 + 0.27, 0.09, 0.09, 0.15, a, 0);
}

/** barrel roof over the shelter (axis along x), both faces, with fascia boards */
function ferryRoof(b: HB, sx0: number, sx1: number, sz0: number, sz1: number, yb: number): void {
  const x0 = sx0 - 0.3,
    x1 = sx1 + 0.3,
    c = sz1 - sz0 + 0.6,
    zc = (sz0 + sz1) / 2,
    rise = 0.35;
  const R = (c * c) / 4 / (2 * rise) + rise / 2;
  const h = Math.asin(c / 2 / R);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const t = -h + (2 * h * i) / 6;
    pts.push([zc + R * Math.sin(t), yb + R * Math.cos(t) - R * Math.cos(h)]);
  }
  b.color('#2a9d8f');
  for (let i = 0; i < 6; i++) {
    const [za, ya] = pts[i],
      [zb, yb2] = pts[i + 1];
    b.quad2([x0, ya, za], [x1, ya, za], [x1, yb2, zb], [x0, yb2, zb]);
  }
  b.color('#24806f');
  for (const [z, y] of [pts[0], pts[6]]) b.box((x0 + x1) / 2, y - 0.06, z, x1 - x0, 0.14, 0.06, 0, 0);
  // ribs under the barrel on the posts' lines
  b.color('#2f5d5a');
  for (const x of [sx0, sx1]) for (let i = 0; i < 6; i++) b.beam([x, pts[i][1] - 0.05, pts[i][0]], [x, pts[i + 1][1] - 0.05, pts[i + 1][0]], 0.07, 0.07);
  // timetable panel on the open end
  b.color('#22303a');
  b.box(sx1 + 0.02, yb - 1.0, sz0 + 0.5, 0.06, 0.9, 0.7, 0, 0);
  b.color('#e8e4da');
  b.box(sx1 + 0.06, yb - 0.95, sz0 + 0.5, 0.02, 0.7, 0.56, 0, 0);
}

/** anti-slip slats across the gangway, rollers at its foot, a hinge plate at the quay */
function gangwayKit(b: HB, A: V3, B: V3, gz: number): void {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const n = Math.floor(L / 0.45);
  b.color('#6c7680');
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = A[0] + (B[0] - A[0]) * t,
      y = A[1] + (B[1] - A[1]) * t;
    b.beam([x, y + 0.005, gz - 0.68], [x, y + 0.005, gz + 0.68], 0.05, 0.03);
  }
  b.color('#2a2c2f');
  b.cyl([B[0] - 0.15, B[1] - 0.12, gz - 0.7], [B[0] - 0.15, B[1] - 0.12, gz + 0.7], 0.08, 0.08, 8, 3);
  b.color('#8b98a3');
  b.box(A[0] - 0.35, A[1] - 0.03, gz, 0.6, 0.05, 1.6, 0, 0);
}

export interface FerryDockInfo {
  berth: { x: number; z: number; yaw: number };
  rect: Rect;
}

export function buildFerryDock(b: HB, r: Rect, quayX: number, glows: GlowPoint[]): FerryDockInfo {
  const top = WATER_LEVEL + 0.5;
  const px0 = quayX + 3.4,
    px1 = r.x1;
  const pz0 = r.z0 + 0.4,
    pz1 = r.z1 - 0.4;
  b.noEmit().pat(PAT.NONE);
  // pontoon body + deck + yellow safety edge + rubbing strakes
  b.color('#7d8288');
  b.boxMM(px0, WATER_LEVEL - 0.7, pz0, px1, top - 0.08, pz1, 1);
  b.color('#b9b5ad').pat(PAT.STONE, 2.0);
  b.boxMM(px0, top - 0.08, pz0, px1, top, pz1, 1);
  b.pat(PAT.NONE);
  b.color('#f2c94c');
  b.boxMM(px0, top, pz0, px1, top + 0.03, pz0 + 0.18, 1);
  b.boxMM(px0, top, pz1 - 0.18, px1, top + 0.03, pz1, 1);
  b.boxMM(px1 - 0.18, top, pz0, px1, top + 0.03, pz1, 1);
  b.color('#2a2c2f');
  b.boxMM(px1, top - 0.45, pz0 + 0.3, px1 + 0.18, top - 0.1, pz1 - 0.3, 1);
  // bollards on the seaward edge
  for (const z of [pz0 + 1.0, pz1 - 1.0]) {
    b.color('#2c2f33');
    b.cyl([px1 - 0.55, top, z], [px1 - 0.55, top + 0.35, z], 0.15, 0.13, 7, 0);
    b.cyl([px1 - 0.55, top + 0.35, z], [px1 - 0.55, top + 0.45, z], 0.22, 0.22, 7, 2);
  }
  // shelter with a glass back and a teal roof
  const sx0 = px0 + 0.8,
    sx1 = px0 + 3.6,
    sz0 = pz1 - 2.4,
    sz1 = pz1 - 0.5;
  b.color('#2f5d5a');
  for (const [x, z] of [
    [sx0, sz0],
    [sx1, sz0],
    [sx0, sz1],
    [sx1, sz1],
  ] as [number, number][])
    b.box(x, top + 1.2, z, 0.08, 2.4, 0.08, 0, 1);
  if (FERRY) ferryRoof(b, sx0, sx1, sz0, sz1, top + 2.4);
  else {
    b.color('#2a9d8f');
    b.boxMM(sx0 - 0.25, top + 2.4, sz0 - 0.25, sx1 + 0.25, top + 2.55, sz1 + 0.25, 0);
  }
  b.color('#a9c7d1').pat(PAT.GLASS);
  b.boxMM(sx0, top + 0.3, sz1 - 0.03, sx1, top + 2.3, sz1 + 0.01, 1 | 2);
  b.pat(PAT.NONE);
  b.color('#8a6a4a');
  b.boxMM(sx0 + 0.2, top + 0.42, sz1 - 0.5, sx1 - 0.2, top + 0.5, sz1 - 0.1, 0);
  if (FERRY) ferryDockKit(b, { px0, px1, pz0, pz1, top });
  // gangway from the quay coping down onto the pontoon, with handrails
  const gz = (pz0 + pz1) / 2 - 1.2;
  const A: V3 = [quayX - 0.6, 0.14, gz],
    B: V3 = [px0 + 1.2, top + 0.03, gz];
  b.color('#8b98a3');
  b.beam([A[0], A[1] - 0.08, A[2]], [B[0], B[1] - 0.08, B[2]], 1.5, 0.16);
  b.color('#f2c94c');
  for (const s of [-1, 1]) {
    b.beam([A[0], A[1] + 1.0, A[2] + s * 0.72], [B[0], B[1] + 1.0, B[2] + s * 0.72], 0.05, 0.05);
    for (let t = 0; t <= 1.001; t += 0.25) {
      const x = A[0] + (B[0] - A[0]) * t,
        y = A[1] + (B[1] - A[1]) * t;
      b.box(x, y + 0.5, gz + s * 0.72, 0.05, 1.0, 0.05, 0, 3);
    }
  }
  if (FERRY) gangwayKit(b, A, B, gz);
  // lamp post + green light on the seaward corner
  b.color('#2f5d5a');
  b.cyl([px1 - 0.5, top, pz1 - 0.5], [px1 - 0.5, top + 3.4, pz1 - 0.5], 0.06, 0.045, 6, 0);
  b.color('#fff1c9').emit('#ffd28a', 2.2, EMIT.LIGHTS);
  b.box(px1 - 0.5, top + 3.45, pz1 - 0.5, 0.24, 0.3, 0.24, Math.PI / 4, 0);
  b.color('#3a8a4a').emit('#3dff7a', 3.2, EMIT.BLINK, 0.5);
  b.box(px1 - 0.4, top + 1.3, pz0 + 0.4, 0.18, 0.24, 0.18, 0, 0);
  b.noEmit();
  b.color('#2f5d5a');
  b.cyl([px1 - 0.4, top, pz0 + 0.4], [px1 - 0.4, top + 1.18, pz0 + 0.4], 0.05, 0.05, 6, 0);
  glows.push({ x: px1 - 0.5, y: top + 3.45, z: pz1 - 0.5, size: 1.1, color: '#ffd08c', intensity: 1.0 });
  glows.push({ x: px1 - 1.6, y: top + 0.05, z: pz1 - 1.6, size: 3.5, pool: true, color: '#ffbe72', intensity: 0.3 });
  glows.push({ x: px1 - 0.4, y: top + 1.3, z: pz0 + 0.4, size: 1.0, color: '#44ff7a', intensity: 1.2, mode: 1, phase: 0.5, day: 0.3 });
  return { berth: { x: px1 + 0.2, z: (pz0 + pz1) / 2, yaw: Math.PI }, rect: { x0: px0, z0: pz0, x1: px1, z1: pz1 } };
}
