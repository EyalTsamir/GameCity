// Beach life: lifeguard towers, striped parasols with towels / loungers / windbreaks (kept clear
// of the walking paths and the sunbathing spots around beach-path ends), beach balls, kayaks,
// sandcastles; plus the ferry dock (floating pontoon, hinged gangway, shelter, lights).

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
  for (const sz of [-1, 1]) b.beam([-0.85, deck - 1.2, sz * 0.85], [0.85, deck - 0.3, sz * 0.85], 0.06, 0.06);
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
  b.box(0, deck + 1.97, -0.15, 2.4, 0.12, 2.2, 0, 0);
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
  b.color('#2a9d8f');
  b.boxMM(sx0 - 0.25, top + 2.4, sz0 - 0.25, sx1 + 0.25, top + 2.55, sz1 + 0.25, 0);
  b.color('#a9c7d1').pat(PAT.GLASS);
  b.boxMM(sx0, top + 0.3, sz1 - 0.03, sx1, top + 2.3, sz1 + 0.01, 1 | 2);
  b.pat(PAT.NONE);
  b.color('#8a6a4a');
  b.boxMM(sx0 + 0.2, top + 0.42, sz1 - 0.5, sx1 - 0.2, top + 0.5, sz1 - 0.1, 0);
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
