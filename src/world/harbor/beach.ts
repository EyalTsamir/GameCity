// Beach life: lifeguard towers, striped parasols with towels / loungers / windbreaks (kept clear
// of the walking paths and the sunbathing spots around beach-path ends), beach balls, kayaks,
// sandcastles; plus the ferry dock (floating pontoon, hinged gangway, shelter, lights).

import { shapeOn } from '../../core/sweepshape';
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

/** box hunt (?nobeachtoys): a smooth six-gore beach ball with white pole caps, a moulded sandcastle (ribbed bucket
 *  towers with crenellations and arrow slits, curtain walls, a keep with a door, a wet moat with a heaped rim, shells,
 *  a two-sided flag, a bucket with a handle and a spade) and towels with a rumpled surface, a hem and fringed ends;
 *  off = the earlier faceted ball, cone-and-cylinder castle and flat towel quads */
let TOYS = true;
export function setBeachToys(on: boolean): void {
  TOYS = on;
}

/** stable 0..1 hash of a position (variation without touching the placement rng stream) */
function hpos(x: number, z: number, k: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** quad of half-size (w, h) centred at c, facing the horizontal direction (dx, dz) */
function faceQuad(b: HB, cx: number, cy: number, cz: number, dx: number, dz: number, w: number, h: number): void {
  const tx = dz * w,
    tz = -dx * w;
  b.quad([cx - tx, cy - h, cz - tz], [cx + tx, cy - h, cz + tz], [cx + tx, cy + h, cz + tz], [cx - tx, cy + h, cz - tz]);
}

/** A rescue board standing on its tail at y = 0 in the current frame, length up y, deck toward +z: a pointed nose lifting forward, a round
 *  tail, domed deck, flatter hull, a stripe, a skeg, and the cord that runs round the rail. */
function rescueBoard(b: HB, L: number, W: number, T: number, col: string, stripe: string): void {
  const N = 16,
    R = 10;
  const half = (t: number) => (W / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.62);
  const lift = (t: number) => (t > 0.62 ? 0.17 * ((t - 0.62) / 0.38) ** 2 : 0);
  const at = (t: number) => Math.max(0.012, half(t));
  const deckZ = (t: number, u: number) => lift(t) + (T / 2) * Math.sqrt(Math.max(0, 1 - u * u));
  b.color(col);
  const ids: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = 0.003 + (i / N) * 0.994;
    const w = at(t);
    for (let j = 0; j < R; j++) {
      const a = (j / R) * Math.PI * 2;
      const c = Math.cos(a),
        s = Math.sin(a);
      const zk = s > 0 ? T / 2 : T * 0.3;
      ids.push(b.vtx(c * w, t * L, lift(t) + s * zk * (w / (W / 2)) ** 0.4, c / w, 0, s / zk));
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < R; j++) {
      const a0 = ids[i * R + j],
        a1 = ids[i * R + ((j + 1) % R)],
        b0 = ids[(i + 1) * R + j],
        b1 = ids[(i + 1) * R + ((j + 1) % R)];
      b.tri(a0, a1, b0);
      b.tri(a1, b1, b0);
    }
  // the stripe down the deck, tapering with the board
  b.color(stripe);
  let p0 = 0,
    p1 = 0;
  for (let i = 0; i <= 14; i++) {
    const t = 0.06 + (i / 14) * 0.88;
    const sw = 0.2 * at(t);
    const u = sw / at(t);
    const y = t * L;
    const z = deckZ(t, u) * 1 + 0.0035;
    const q0 = b.vtx(-sw, y, z, 0, 0, 1),
      q1 = b.vtx(sw, y, z, 0, 0, 1);
    if (i > 0) {
      b.tri(p0, p1, q0);
      b.tri(p1, q1, q0);
    }
    p0 = q0;
    p1 = q1;
  }
  // the skeg under the tail
  b.color('#2b2f33');
  b.quad2([0, L * 0.05, -T * 0.25], [0, L * 0.17, -T * 0.25], [0, L * 0.09, -T * 0.25 - 0.12], [0, L * 0.05, -T * 0.25 - 0.11]);
  // the cord, slack between its fixings
  b.color('#e9e4d6');
  for (const sd of [-1, 1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = 0.22 + (i / 12) * 0.5;
      const sag = 0.018 * Math.abs(Math.sin(i * 0.5 * Math.PI * 0.67));
      pts.push([sd * (at(t) + 0.004 + sag), t * L, lift(t) + 0.004]);
    }
    b.tube(pts, 0.005, 4);
  }
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
  if (DETAIL) {
    b.color('#f2efe6');
    for (const yy of [0.32, 0.62]) b.box(0, deck + yy, 1.5, 2.3, 0.035, 0.035, 0, 0);
    for (const sx of [-1, 1]) {
      b.box(sx * 1.13, deck + 0.45, 1.5, 0.06, 0.9, 0.06, 0, 3);
      for (const yy of [0.32, 0.62, 0.9]) b.box(sx * 1.13, deck + yy, 0.95, 0.035, 0.035, 1.15, 0, 0);
    }
    // top-hung shutters propped open over the front and side windows
    b.color('#e63946').pat(PAT.PLANKS_X, 0.12);
    b.pushT(0, deck + 1.42, 0.59, 0, -0.55);
    b.box(0, 0, 0.28, 1.34, 0.03, 0.58, 0, 0);
    b.pop();
    b.pat(PAT.NONE).color('#d9d3c6');
    for (const sx of [-0.55, 0.55]) b.beam([sx, deck + 0.82, 0.57], [sx, deck + 1.25, 1.03], 0.02, 0.02);
    // clapboard lines on the hut
    b.color('#cfc9bb');
    for (let i = 0; i < 6; i++) b.box(0, deck + 0.08 + i * 0.15, 0.555, 1.92, 0.012, 0.01, 0, 0);
    // lifebuoy on the rail
    b.color('#ee6c2a');
    {
      const pts: V3[] = [];
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        pts.push([0.62 + Math.cos(a) * 0.25, deck + 0.58 + Math.sin(a) * 0.25, 1.55]);
      }
      b.tube(pts, 0.05, 6, true);
    }
    b.color('#f4f1e8');
    for (const a of [0.7, 2.3, 3.9, 5.5]) b.box(0.62 + Math.cos(a) * 0.25, deck + 0.58 + Math.sin(a) * 0.25, 1.55, 0.11, 0.11, 0.115, a, 0);
    // a rescue board leaning on a stilt
    if (shapeOn('shapeboards')) {
      // its tail in the sand, its back against the stilt
      b.pushT(0.98, gy - 0.05, 0.86, 0, -0.16);
      rescueBoard(b, 2.6, 0.52, 0.09, '#e8b62a', '#c43b2b');
      b.pop();
    } else {
      b.color('#e8b62a');
      b.pushT(0.98, 0, 1.05, 0, -0.16);
      b.box(0, deck - 1.02, 0, 0.5, 2.5, 0.07, 0, 0);
      b.color('#c43b2b');
      b.box(0, deck - 1.02, 0.04, 0.09, 2.45, 0.012, 0, 0);
      b.pop();
    }
    // binoculars on a post at the corner of the rail
    b.color('#2b2f33');
    b.vcyl(-0.55, deck + 0.9, 1.5, 0.018, 0.22, 6, 0);
    for (const sx of [-0.6, -0.5]) b.cyl([sx, deck + 1.14, 1.42], [sx, deck + 1.14, 1.6], 0.03, 0.035, 8, 3);
  }
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
  if (shapeOn('shapeboards')) {
    b.pushT(-1.76, gy - 0.05, 0.9, Math.PI / 2, 0.26);
    rescueBoard(b, 2.35, 0.55, 0.1, '#f2c94c', '#f4f1e8');
    b.pop();
  } else {
    b.color('#f2c94c');
    b.pushT(-1.25, gy + 1.1, 0.9, 0, 0, 0.25);
    b.box(0, 0, 0, 0.12, 2.3, 0.55, 0, 0);
    b.pop();
  }
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
  if (TOYS && shapeOn('shapetowels')) return towelRumpled(b, x, z, yaw, ground, c1, c2);
  if (TOYS) return towelReal(b, x, z, yaw, ground, c1, c2);
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

/** a towel someone threw down: it follows lumps in the sand, keeps the crease it was folded along, one corner has turned up in the wind, and its
 *  edges are not ruled lines. Each one differently (?noshapetowels). */
function towelRumpled(b: HB, x: number, z: number, yaw: number, ground: Ground, c1: string, c2: string): void {
  const gy = ground(x, z);
  b.pushT(x, gy - 0.015, z, yaw);
  const L = 1.7,
    W = 0.85;
  const ph = hpos(x, z, 3) * 6.283,
    ph2 = hpos(x, z, 5) * 6.283;
  const cu = hpos(x, z, 7) < 0.5 ? -1 : 1,
    cv = hpos(x, z, 9) < 0.5 ? -1 : 1;
  const creaseAt = (hpos(x, z, 11) - 0.5) * 0.7;
  const ss = (a: number, e: number, t: number): number => {
    const k = Math.min(1, Math.max(0, (t - a) / (e - a)));
    return k * k * (3 - 2 * k);
  };
  // height of the cloth (local u along the length = z, v across = x)
  const H = (u: number, v: number): number => {
    let y = 0.034 + 0.012 * Math.sin(u * 3.7 + ph) * Math.sin(v * 5.3 + ph2) + 0.005 * Math.sin(u * 9.1 + v * 6.7 + ph2);
    const d = u - creaseAt + v * 0.16;
    y += 0.012 * Math.exp(-d * d * 240);
    const cd = Math.hypot(u * cu - L / 2, v * cv - W / 2);
    const up = ss(0.34, 0, cd);
    return y + 0.075 * up * up;
  };
  const X = (u: number, v: number): number => v + 0.013 * Math.sin(u * 3.1 + ph2) + 0.005 * Math.sin(u * 8.3 + ph);
  const Z = (u: number, v: number): number => u + 0.009 * Math.sin(v * 4.9 + ph);
  const P = (u: number, v: number, y = H(u, v)): [number, number, number] => [X(u, v), y, Z(u, v)];
  const us: number[] = [-L / 2, -L / 2 + 0.2, -L / 2 + 0.25];
  for (let i = 1; i < 8; i++) us.push(-L / 2 + 0.25 + (i / 8) * (L - 0.5));
  us.push(L / 2 - 0.25, L / 2 - 0.2, L / 2);
  const vs: number[] = [];
  for (let j = 0; j <= 6; j++) vs.push(-W / 2 + (j / 6) * W);
  const bandCol = (i: number): string => (i === 1 || i === us.length - 3 ? '#fbf7ee' : i === 0 || i === us.length - 2 ? c2 : c1);
  const sv = (u: number, v: number): number => {
    const e = 0.012;
    const gu = (H(u + e, v) - H(u - e, v)) / (2 * e),
      gv = (H(u, v + e) - H(u, v - e)) / (2 * e);
    const p = P(u, v);
    return b.vtx(p[0], p[1], p[2], -gv, 1, -gu);
  };
  for (let i = 0; i < us.length - 1; i++) {
    b.color(bandCol(i));
    for (let j = 0; j < vs.length - 1; j++) {
      const i0 = sv(us[i], vs[j]),
        i1 = sv(us[i + 1], vs[j]),
        i2 = sv(us[i + 1], vs[j + 1]),
        i3 = sv(us[i], vs[j + 1]);
      b.tri(i0, i1, i2);
      b.tri(i0, i2, i3);
    }
    // the edge down to the sand along both long sides
    const u0 = us[i],
      u1 = us[i + 1];
    b.quad(P(u0, -W / 2), P(u0, -W / 2, 0.012), P(u1, -W / 2, 0.012), P(u1, -W / 2));
    b.quad(P(u1, W / 2), P(u1, W / 2, 0.012), P(u0, W / 2, 0.012), P(u0, W / 2));
  }
  b.color(c2);
  for (let j = 0; j < vs.length - 1; j++) {
    const v0 = vs[j],
      v1 = vs[j + 1];
    b.quad(P(-L / 2, v0), P(-L / 2, v1), P(-L / 2, v1, 0.012), P(-L / 2, v0, 0.012));
    b.quad(P(L / 2, v1), P(L / 2, v0), P(L / 2, v0, 0.012), P(L / 2, v1, 0.012));
  }
  // tassels, each lying its own way
  b.color('#f3eee2');
  for (const end of [-1, 1]) {
    for (let k = 0; k < 11; k++) {
      const v = -W / 2 + 0.04 + (k / 10) * (W - 0.08);
      const dv = 0.012 * Math.sin(k * 2.3 + ph);
      const len = 0.045 + 0.018 * Math.sin(k * 3.7 + ph2);
      const a = P((end * L) / 2, v),
        c = end < 0 ? -L / 2 - len : L / 2 + len;
      const y0 = a[1] - 0.004,
        y1 = 0.016;
      if (end < 0) b.quad([a[0] - 0.007, y0, a[2]], [a[0] - 0.007 + dv, y1, c], [a[0] + 0.007 + dv, y1, c], [a[0] + 0.007, y0, a[2]]);
      else b.quad([a[0] + 0.007, y0, a[2]], [a[0] + 0.007 + dv, y1, c], [a[0] - 0.007 + dv, y1, c], [a[0] - 0.007, y0, a[2]]);
    }
  }
  b.pop();
}

/** a beach towel lying on the sand: gently rumpled terry (smooth normals), a thin hem all round, a white pinstripe
 *  inside each end band and a fringe of tassels at both ends */
function towelReal(b: HB, x: number, z: number, yaw: number, ground: Ground, c1: string, c2: string): void {
  const gy = ground(x, z);
  b.pushT(x, gy - 0.015, z, yaw);
  const L = 1.7,
    W = 0.85;
  const ph = hpos(x, z, 3) * 6.283;
  // height of the cloth (local u along the length = z, v across = x)
  const H = (u: number, v: number) => 0.033 + 0.007 * Math.sin(u * 4.3 + ph) * Math.sin(v * 6.1 + ph * 0.7) + 0.004 * Math.sin(u * 11.0 + v * 3.0 + ph * 1.9);
  const us = [-L / 2, -L / 2 + 0.2, -L / 2 + 0.25, -0.4, 0, 0.4, L / 2 - 0.25, L / 2 - 0.2, L / 2];
  const vs = [-W / 2, -W / 4, 0, W / 4, W / 2];
  const bandCol = (i: number) => (i === 1 || i === us.length - 3 ? '#fbf7ee' : i === 0 || i === us.length - 2 ? c2 : c1);
  const sv = (u: number, v: number) => {
    const e = 0.01;
    const gu = (H(u + e, v) - H(u - e, v)) / (2 * e),
      gv = (H(u, v + e) - H(u, v - e)) / (2 * e);
    return b.vtx(v, H(u, v), u, -gv, 1, -gu);
  };
  for (let i = 0; i < us.length - 1; i++) {
    b.color(bandCol(i));
    for (let j = 0; j < vs.length - 1; j++) {
      const i0 = sv(us[i], vs[j]),
        i1 = sv(us[i + 1], vs[j]),
        i2 = sv(us[i + 1], vs[j + 1]),
        i3 = sv(us[i], vs[j + 1]);
      b.tri(i0, i1, i2);
      b.tri(i0, i2, i3);
    }
    // hem along both long sides
    const u0 = us[i],
      u1 = us[i + 1];
    b.quad([-W / 2, H(u0, -W / 2), u0], [-W / 2, 0.016, u0], [-W / 2, 0.016, u1], [-W / 2, H(u1, -W / 2), u1]);
    b.quad([W / 2, H(u1, W / 2), u1], [W / 2, 0.016, u1], [W / 2, 0.016, u0], [W / 2, H(u0, W / 2), u0]);
  }
  // hem across both ends
  b.color(c2);
  for (let j = 0; j < vs.length - 1; j++) {
    const v0 = vs[j],
      v1 = vs[j + 1];
    b.quad([v0, H(-L / 2, v0), -L / 2], [v1, H(-L / 2, v1), -L / 2], [v1, 0.016, -L / 2], [v0, 0.016, -L / 2]);
    b.quad([v1, H(L / 2, v1), L / 2], [v0, H(L / 2, v0), L / 2], [v0, 0.016, L / 2], [v1, 0.016, L / 2]);
  }
  // tassels
  b.color('#f3eee2');
  for (const end of [-1, 1]) {
    const ua = end < 0 ? -L / 2 - 0.05 : L / 2,
      ub = end < 0 ? -L / 2 : L / 2 + 0.05;
    for (let k = 0; k < 11; k++) {
      const v = -W / 2 + 0.04 + (k / 10) * (W - 0.08);
      const dv = 0.006 + 0.004 * Math.sin(k * 2.3 + ph);
      b.quad([v - 0.007, 0.018, ua], [v - 0.007 + dv, 0.018, ub], [v + 0.007 + dv, 0.018, ub], [v + 0.007, 0.018, ua]);
    }
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
  if (TOYS) {
    // six gores of three smooth facets each over 10 rings; the top and bottom rings are the white valve caps
    const cols = ['#e63946', '#fbf7ee', '#2a9d8f', '#fbf7ee', '#e9c46a', '#fbf7ee'];
    const LON = 18,
      LAT = 10;
    const cy = gy + r * 0.96,
      rot = hpos(x, z, 5) * 6.283;
    const sv = (a: number, t: number) => {
      const nx = Math.sin(t) * Math.cos(a + rot),
        ny = Math.cos(t),
        nz = Math.sin(t) * Math.sin(a + rot);
      return b.vtx(x + nx * r, cy + ny * r, z + nz * r, nx, ny, nz);
    };
    for (let k = 0; k < LON; k++) {
      const a0 = (k / LON) * Math.PI * 2,
        a1 = ((k + 1) / LON) * Math.PI * 2;
      for (let j = 0; j < LAT; j++) {
        b.color(j === 0 || j === LAT - 1 ? '#fbf7ee' : cols[Math.floor(k / 3)]);
        const t0 = (j / LAT) * Math.PI,
          t1 = ((j + 1) / LAT) * Math.PI;
        const i00 = sv(a0, t0),
          i10 = sv(a1, t0),
          i11 = sv(a1, t1),
          i01 = sv(a0, t1);
        if (j > 0) b.tri(i00, i10, i11);
        if (j < LAT - 1) b.tri(i00, i11, i01);
      }
    }
    return;
  }
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

/** a sit-in kayak: stations along a rockered hull, six points round each section, a coaming, deck lines, the paddle across the cockpit */
function kayakReal(b: HB, x: number, z: number, yaw: number, ground: Ground, col: string): void {
  const gy = ground(x, z);
  b.pushT(x, Math.max(gy, WATER_LEVEL + 0.02) + 0.02, z, yaw);
  const L = 1.78,
    n = 16;
  const hw = (s: number) => 0.31 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s) / L, 2.4)), 0.72);
  const keel = (s: number) => 0.015 + 0.17 * Math.pow(Math.abs(s) / L, 3);
  const sheer = (s: number) => 0.19 + 0.09 * Math.pow(s / L, 2);
  const crown = (s: number) => sheer(s) + (0.075 * hw(s)) / 0.31;
  const across: [number, number][] = [[0, 0], [0.62, 0.05], [0.93, 0.56], [1, 1], [0.6, 1.75], [0, 2]];
  const P = (s: number, j: number, sd: number): V3 => {
    const k = keel(s),
      g = sheer(s),
      t = across[j];
    const y = t[1] <= 1 ? k + (g - k) * t[1] : g + (crown(s) - g) * (t[1] - 1);
    return [sd * hw(s) * t[0], y, s];
  };
  const st: number[] = [];
  for (let i = 0; i <= n; i++) st.push(-L * Math.cos((Math.PI * i) / n));
  b.color(col).pat(PAT.NONE);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < across.length - 1; j++)
      for (const sd of [-1, 1]) {
        const a = P(st[i], j + 1, sd),
          bb = P(st[i + 1], j + 1, sd),
          c = P(st[i + 1], j, sd),
          d = P(st[i], j, sd);
        if (sd > 0) b.quad(a, bb, c, d);
        else b.quad(a, d, c, bb);
      }
  // the cockpit: a dark well, the coaming round it, the seat's back
  const cz = 0.05,
    rx = 0.195,
    rz = 0.37,
    deck = crown(cz);
  const ring: V3[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    ring.push([Math.cos(a) * rx, deck + 0.012, cz + Math.sin(a) * rz]);
  }
  b.color('#111315');
  const mid: V3 = [0, deck + 0.012, cz];
  for (let i = 0; i < 20; i++) b.triangle(mid, ring[(i + 1) % 20], ring[i]);
  b.color('#25282b');
  b.box(0, deck + 0.05, cz - 0.3, 0.26, 0.09, 0.025, 0, 1);
  b.tube(ring, 0.014, 5, true);
  // bungee on the foredeck, toggles at the ends
  b.color('#16181a');
  for (const sd of [-1, 1]) b.tube([[sd * 0.1, crown(0.75) - 0.012, 0.72], [-sd * 0.09, crown(1.05) - 0.012, 1.06]], 0.005, 4);
  for (const e of [-1, 1]) b.tube([[-0.035, sheer(L * 0.98) + 0.03, e * (L - 0.05)], [0.035, sheer(L * 0.98) + 0.03, e * (L - 0.05)]], 0.009, 4);
  // the paddle lying across
  b.pushT(0, deck + 0.05, cz + 0.12, 1.15);
  b.color('#34373a');
  b.tube([[0, 0, -1.02], [0, 0, 1.02]], 0.014, 6);
  b.color('#f2efe6');
  const w = [0.028, 0.08, 0.095, 0.085, 0.05];
  for (const e of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const z0 = e * (1 + i * 0.085),
        z1 = e * (1 + (i + 1) * 0.085);
      b.quad2([-w[i], 0, z0], [-w[i + 1], 0, z1], [w[i + 1], 0, z1], [w[i], 0, z0]);
    }
  b.pop();
  b.pop();
}

export function kayak(b: HB, x: number, z: number, yaw: number, ground: Ground, col: string): void {
  if (shapeOn('shapekayak')) return kayakReal(b, x, z, yaw, ground, col);
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
  if (TOYS) return sandcastleReal(b, x, z, gy, rng);
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

/** a moulded sandcastle: a slumped mound inside a wet moat with a heaped rim, four ribbed bucket towers (crenellated
 *  tops, arrow slits) joined by crenellated curtain walls, a taller keep with an arched door, shells pressed into the
 *  slope, a paper flag; a bucket (rim lip, sand inside, handle) and a spade lie beside it */
function sandcastleReal(b: HB, x: number, z: number, gy: number, rng: Rng): void {
  const rot = hpos(x, z, 1) * Math.PI * 2;
  const P = (r: number, a: number): [number, number] => [x + Math.cos(a) * r, z + Math.sin(a) * r];
  // wet moat ring + heaped rim
  b.color('#b39a66');
  const NR = 22;
  for (let i = 0; i < NR; i++) {
    const a0 = rot + (i / NR) * Math.PI * 2,
      a1 = rot + ((i + 1) / NR) * Math.PI * 2;
    const [ix0, iz0] = P(0.78, a0),
      [ix1, iz1] = P(0.78, a1),
      [ox1, oz1] = P(0.95, a1),
      [ox0, oz0] = P(0.95, a0);
    b.quad([ix0, gy + 0.04, iz0], [ix1, gy + 0.04, iz1], [ox1, gy + 0.04, oz1], [ox0, gy + 0.04, oz0]);
  }
  b.color('#dcc58f');
  b.lathe(
    [
      [1.1, 0.0],
      [1.03, 0.065],
      [0.98, 0.07],
      [0.94, 0.03],
    ],
    NR,
    x,
    gy,
    z,
  );
  // mound (damp, packed)
  b.color('#d6bd86');
  b.lathe(
    [
      [0.8, 0.0],
      [0.74, 0.06],
      [0.64, 0.12],
      [0.54, 0.16],
      [0.36, 0.185],
      [0.0, 0.19],
    ],
    18,
    x,
    gy,
    z,
  );
  // towers: an upturned ribbed bucket each, crenellated rim, an arrow slit facing out
  const tower: [number, number][] = [
    [0.165, 0.0],
    [0.16, 0.12],
    [0.168, 0.13],
    [0.168, 0.145],
    [0.155, 0.155],
    [0.148, 0.28],
    [0.156, 0.29],
    [0.156, 0.305],
    [0.143, 0.315],
    [0.135, 0.42],
    [0.11, 0.425],
    [0.105, 0.405],
    [0.0, 0.405],
  ];
  const ta: number[] = [];
  for (let k = 0; k < 4; k++) {
    const a = rot + Math.PI / 4 + (k * Math.PI) / 2;
    ta.push(a);
    const [tx, tz] = P(0.5, a);
    b.color('#dcc58f');
    b.lathe(tower, 14, tx, gy, tz);
    for (let m = 0; m < 6; m++) {
      const am = a + (m / 6) * Math.PI * 2;
      b.box(tx + Math.cos(am) * 0.118, gy + 0.45, tz + Math.sin(am) * 0.118, 0.06, 0.055, 0.04, Math.PI / 2 - am, 1);
    }
    b.color('#6d5a3c');
    faceQuad(b, tx + Math.cos(a) * 0.153, gy + 0.22, tz + Math.sin(a) * 0.153, Math.cos(a), Math.sin(a), 0.012, 0.035);
  }
  // curtain walls between the towers, merlons on top
  b.color('#d9c18b');
  for (let k = 0; k < 4; k++) {
    const [ax, az] = P(0.5, ta[k]),
      [bx, bz] = P(0.5, ta[(k + 1) % 4]);
    const L = Math.hypot(bx - ax, bz - az);
    const ex = (bx - ax) / L,
      ez = (bz - az) / L;
    const yaw = Math.atan2(-ez, ex);
    b.box((ax + bx) / 2, gy + 0.12, (az + bz) / 2, L - 0.2, 0.24, 0.085, yaw, 1);
    for (const s of [-0.12, 0, 0.12]) b.box((ax + bx) / 2 + ex * s, gy + 0.265, (az + bz) / 2 + ez * s, 0.055, 0.05, 0.085, yaw, 1);
  }
  // keep: a bigger bucket on the mound, eight merlons, an arched door and two slits
  b.color('#dcc58f');
  b.lathe(
    [
      [0.255, 0.0],
      [0.25, 0.15],
      [0.262, 0.16],
      [0.262, 0.175],
      [0.245, 0.185],
      [0.232, 0.42],
      [0.2, 0.425],
      [0.195, 0.405],
      [0.0, 0.405],
    ],
    16,
    x,
    gy + 0.16,
    z,
  );
  for (let m = 0; m < 8; m++) {
    const am = rot + (m / 8) * Math.PI * 2;
    b.box(x + Math.cos(am) * 0.215, gy + 0.6, z + Math.sin(am) * 0.215, 0.07, 0.06, 0.05, Math.PI / 2 - am, 1);
  }
  b.color('#5f4e34');
  const da = rot;
  const dcx = x + Math.cos(da) * 0.26,
    dcz = z + Math.sin(da) * 0.26;
  faceQuad(b, dcx, gy + 0.24, dcz, Math.cos(da), Math.sin(da), 0.05, 0.05);
  // round head of the door: a half-disc fan
  {
    const tx = Math.sin(da),
      tz = -Math.cos(da);
    const ox = Math.cos(da) * 0.001,
      oz = Math.sin(da) * 0.001;
    for (let i = 0; i < 4; i++) {
      const q0 = (i / 4) * Math.PI,
        q1 = ((i + 1) / 4) * Math.PI;
      b.triangle(
        [dcx + ox, gy + 0.29, dcz + oz],
        [dcx + ox + tx * 0.05 * Math.cos(q0), gy + 0.29 + 0.05 * Math.sin(q0), dcz + oz + tz * 0.05 * Math.cos(q0)],
        [dcx + ox + tx * 0.05 * Math.cos(q1), gy + 0.29 + 0.05 * Math.sin(q1), dcz + oz + tz * 0.05 * Math.cos(q1)],
      );
    }
  }
  for (const s of [-1, 1]) {
    const a = da + s * 1.4;
    faceQuad(b, x + Math.cos(a) * 0.236, gy + 0.46, z + Math.sin(a) * 0.236, Math.cos(a), Math.sin(a), 0.012, 0.04);
  }
  // shells pressed into the slope
  for (let i = 0; i < 6; i++) {
    const a = rot + i * 1.13 + hpos(x, z, 10 + i) * 0.6;
    const r = 0.6 + hpos(x, z, 20 + i) * 0.12;
    const [sx, sz] = P(r, a);
    b.color(i % 3 === 0 ? '#f2c9c0' : '#f6f1e6');
    b.sphere(sx, gy + 0.19 - (r - 0.36) * 0.4, sz, 0.024, 6, 3, 0.45);
  }
  // flag on the keep
  b.color('#9a7b4f');
  b.cyl([x, gy + 0.56, z], [x, gy + 0.92, z], 0.007, 0.006, 4, 0);
  b.color('#e63946');
  b.quad2([x, gy + 0.92, z], [x + 0.17, gy + 0.875, z + 0.02], [x + 0.17, gy + 0.865, z + 0.02], [x, gy + 0.82, z]);
  // bucket with a rim lip and sand inside, its handle folded down the front
  const bc = rng.pick(['#2a9d8f', '#e9c46a', '#457b9d']);
  const ba = rot + 0.7;
  const [bx, bz] = P(1.17, ba);
  b.color(bc);
  b.lathe(
    [
      [0.0, 0.0],
      [0.1, 0.0],
      [0.13, 0.215],
      [0.138, 0.22],
      [0.138, 0.235],
      [0.126, 0.235],
      [0.12, 0.2],
      [0.112, 0.15],
    ],
    16,
    bx,
    gy + 0.02,
    bz,
  );
  b.color('#d6bd86');
  b.lathe(
    [
      [0.113, 0.15],
      [0.06, 0.158],
      [0.0, 0.16],
    ],
    16,
    bx,
    gy + 0.02,
    bz,
  );
  b.color(bc);
  {
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) {
      const q = (i / 8) * Math.PI;
      const lx = Math.cos(q) * 0.14,
        lz = Math.sin(q) * 0.15,
        ly = 0.225 - Math.sin(q) * 0.1;
      pts.push([bx + lx * Math.cos(ba) - lz * Math.sin(ba), gy + 0.02 + ly, bz + lx * Math.sin(ba) + lz * Math.cos(ba)]);
    }
    b.tube(pts, 0.006, 4);
  }
  // spade lying on the sand: blade, shaft, T-grip
  const sa = rot + 2.5;
  const [sx, sz] = P(1.12, sa);
  const ux = -Math.sin(sa),
    uz = Math.cos(sa);
  b.color('#e63946');
  b.box(sx, gy + 0.03, sz, 0.15, 0.012, 0.17, Math.atan2(ux, uz), 0);
  b.cyl([sx + ux * 0.08, gy + 0.035, sz + uz * 0.08], [sx + ux * 0.46, gy + 0.04, sz + uz * 0.46], 0.012, 0.012, 6, 0);
  b.cyl([sx + ux * 0.46 - uz * 0.06, gy + 0.04, sz + uz * 0.46 + ux * 0.06], [sx + ux * 0.46 + uz * 0.06, gy + 0.04, sz + uz * 0.46 - ux * 0.06], 0.013, 0.013, 6, 3);
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
      b.color('#8a9298');
      b.cyl([x, WATER_LEVEL - 2.5, z], [x, top + 2.1, z], 0.16, 0.16, 10, 2);
      b.color('#f2c94c');
      b.cyl([x, top + 1.85, z], [x, top + 2.12, z], 0.165, 0.165, 10, 2);
      b.color('#2a2c2f');
      b.box(x, top - 0.2, z, 0.48, 0.14, 0.48, 0, 0);
      b.box(x, top - 0.2, (z + (z < pz0 ? pz0 : pz1)) / 2, 0.24, 0.12, 0.4, 0, 0);
      b.color('#4f4a3a');
      b.cyl([x, WATER_LEVEL - 0.1, z], [x, WATER_LEVEL + 0.35, z], 0.17, 0.17, 10, 0);
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
