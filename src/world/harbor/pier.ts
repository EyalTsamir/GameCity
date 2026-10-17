// Amusement pier: planked deck (top exactly at deckY) on cream cast-iron pile bents with
// cross bracing and algae-darkened feet, ornamental railings with a teal top rail, Victorian
// double lamps with festoon bulbs, an arched entrance gateway with marquee bulbs, kiosks,
// telescopes, flags, life rings. Ferris wheel (static A-frames + rotating rims/spokes/lights,
// upright gondolas) and a carousel (static plinth + rotating canopy/platform/bobbing horses).

import * as THREE from 'three';
import { PALETTE } from '../../core/gfx';
import { WATER_LEVEL } from '../../core/constants';
import type { Rng } from '../../core/rng';
import { EMIT, HB, PAT, RIG, type V3 } from './geo';
import type { GlowPoint } from './material';
import { GLOW } from './material';

const CREAM = '#efe9da';
const IRON = '#2f5d5a';
const TEAL = '#2a9d8f';
const BULBS = ['#ff6b5a', '#ffd166', '#6fd3ff', '#8dff8a', '#fff4dc', '#ff9ad5'];

export interface PierSpec {
  xa: number;
  xb: number;
  z: number;
  width: number;
  deckY: number;
  /** x positions on the north edge to keep free (plan benches) */
  benchX: number[];
}

export function buildPier(b: HB, p: PierSpec, ground: (x: number, z: number) => number, rng: Rng, glows: GlowPoint[]): void {
  const z0 = p.z - p.width / 2,
    z1 = p.z + p.width / 2;
  const xa = p.xa,
    xb = p.xb;
  const top = p.deckY;
  b.noEmit();
  // ── deck planks + fascia kerbs
  b.color(PALETTE.deck).pat(PAT.PLANKS_X, 0.3);
  b.boxMM(xa, top - 0.12, z0, xb, top, z1, 1 | 16);
  b.pat(PAT.NONE);
  b.color('#8a6845');
  b.boxMM(xa, top - 0.13, z0 + 0.02, xb - 0.02, top - 0.12, z1 - 0.02, 2 | 4 | 8 | 16 | 32);
  b.color(CREAM);
  b.boxMM(xa, top - 0.5, z0 - 0.14, xb + 0.14, top + 0.04, z0, 0);
  b.boxMM(xa, top - 0.5, z1, xb + 0.14, top + 0.04, z1 + 0.14, 0);
  b.boxMM(xb, top - 0.5, z0, xb + 0.14, top + 0.04, z1, 0);
  // joists
  b.color('#7a5a3e');
  for (const jz of [z0 + 1.0, z0 + 4.0, p.z, z1 - 4.0, z1 - 1.0]) b.boxMM(xa, top - 0.34, jz - 0.1, xb, top - 0.13, jz + 0.1, 2 | 16);
  // ── pile bents
  const pileZ = [z0 + 0.8, z0 + 4.6, z1 - 4.6, z1 - 0.8];
  const algae = WATER_LEVEL + 0.3;
  for (let x = xa + 2.0; x <= xb - 0.6; x += 4.6) {
    const capY = top - 0.6;
    b.color('#e3dbc6');
    b.boxMM(x - 0.2, capY, z0 + 0.2, x + 0.2, top - 0.34, z1 - 0.2, 0);
    let lowest = Infinity;
    for (const pz of pileZ) {
      const g = ground(x, pz);
      const y0 = Math.min(g, capY - 0.4) - 0.6;
      lowest = Math.min(lowest, Math.max(g, WATER_LEVEL + 0.15));
      if (y0 < algae) {
        b.color('#4e5541');
        b.cyl([x, y0, pz], [x, Math.min(algae, capY), pz], 0.24, 0.23, 7, 0);
      }
      if (capY > algae) {
        b.color('#e8e0cc');
        b.cyl([x, Math.max(algae, y0), pz], [x, capY, pz], 0.23, 0.21, 7, 0);
        b.color('#d8cfb8');
        b.cyl([x, capY - 0.25, pz], [x, capY, pz], 0.29, 0.29, 7, 0);
      }
    }
    // X bracing between piles where there is height for it
    const yLow = lowest + 0.35;
    if (capY - yLow > 1.0) {
      b.color('#d9d0bb');
      for (let k = 0; k < pileZ.length - 1; k++) {
        b.beam([x, capY - 0.15, pileZ[k]], [x, yLow, pileZ[k + 1]], 0.07, 0.12);
        b.beam([x, yLow, pileZ[k]], [x, capY - 0.15, pileZ[k + 1]], 0.07, 0.12);
      }
    }
  }
  // ── railings (north + south edges, pier end)
  const railY = top + 1.05;
  const railRun = (pa: V3, pb: V3, postStep: number) => {
    const L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
    const n = Math.max(1, Math.round(L / postStep));
    const dx = (pb[0] - pa[0]) / L,
      dz = (pb[2] - pa[2]) / L;
    b.color(CREAM);
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * L;
      b.box(pa[0] + dx * t, top + 0.52, pa[2] + dz * t, 0.09, 1.04, 0.09, 0, 1);
    }
    b.beam([pa[0], top + 0.42, pa[2]], [pb[0], top + 0.42, pb[2]], 0.05, 0.05);
    b.beam([pa[0], top + 0.82, pa[2]], [pb[0], top + 0.82, pb[2]], 0.05, 0.05);
    for (let t = 0.25; t < L; t += 0.36) b.box(pa[0] + dx * t, top + 0.62, pa[2] + dz * t, 0.035, 0.4, 0.035, 0, 3);
    b.color(TEAL);
    b.beam([pa[0], railY, pa[2]], [pb[0], railY, pb[2]], 0.11, 0.07);
  };
  railRun([xa + 0.6, 0, z0 + 0.06], [xb - 0.06, 0, z0 + 0.06], 1.9);
  railRun([xa + 0.6, 0, z1 - 0.06], [xb - 0.06, 0, z1 - 0.06], 1.9);
  railRun([xb - 0.06, 0, z0 + 0.06], [xb - 0.06, 0, z1 - 0.06], 1.9);
  // life rings on a few posts (outside face)
  for (const lx of [xa + 13, xa + 37, xa + 58]) {
    for (const [lz, s] of [
      [z0 + 0.06, -1],
      [z1 - 0.06, 1],
    ] as [number, number][]) {
      ring(b, lx, top + 0.72, lz + s * 0.12, 0.3, 0.07, s);
    }
  }
  // ── lamps + festoons
  const lampXs: number[] = [];
  for (let x = xa + 4.5; x < xb - 1.5; x += 10.8) {
    const nx = p.benchX.some((bx) => Math.abs(bx - x) < 1.6) ? x + 2.2 : x;
    lampXs.push(nx);
  }
  for (const lz of [z0 + 0.06, z1 - 0.06]) {
    for (const x of lampXs) lamp(b, x, top, lz, glows);
    // festoon bulbs between lamp tops
    for (let k = 0; k < lampXs.length - 1; k++) {
      const xA = lampXs[k],
        xB = lampXs[k + 1];
      const pts: V3[] = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([xA + (xB - xA) * t, top + 3.95 - 0.55 * Math.sin(Math.PI * t), lz]);
      }
      b.color('#2b2b2b').noEmit();
      b.tube(pts, 0.012, 3);
      for (let i = 1; i < n; i++) {
        const c = BULBS[(i + k) % BULBS.length];
        b.color(c).emit(c, 2.6, EMIT.LIGHTS);
        b.sphere(pts[i][0], pts[i][1] - 0.06, pts[i][2], 0.06, 4, 2);
      }
      b.noEmit();
    }
  }
  // ── entrance gateway over the deck at the landward end
  {
    const gx = xa + 0.9;
    const za = z0 + 0.35,
      zb = z1 - 0.35;
    b.color(CREAM);
    for (const gz of [za, zb]) {
      b.box(gx, top + 2.2, gz, 0.6, 4.4, 0.6, 0, 1);
      b.color(TEAL);
      b.box(gx, top + 4.55, gz, 0.78, 0.3, 0.78, 0, 1);
      b.color('#e9c46a');
      b.sphere(gx, top + 4.95, gz, 0.22, 8, 5);
      b.color(CREAM);
    }
    // arched sign board
    const n = 24;
    const arc = (t: number): [number, number] => [za + (zb - za) * t, top + 4.25 + 1.6 * Math.sin(Math.PI * t)];
    for (let i = 0; i < n; i++) {
      const [zA, yA] = arc(i / n),
        [zB, yB] = arc((i + 1) / n);
      b.color(TEAL);
      b.quad([gx + 0.08, yA - 0.9, zA], [gx + 0.08, yB - 0.9, zB], [gx + 0.08, yB, zB], [gx + 0.08, yA, zA]);
      b.quad([gx - 0.08, yA - 0.9, zA], [gx - 0.08, yA, zA], [gx - 0.08, yB, zB], [gx - 0.08, yB - 0.9, zB]);
      b.color(CREAM);
      b.quad([gx - 0.1, yA, zA], [gx + 0.1, yA, zA], [gx + 0.1, yB, zB], [gx - 0.1, yB, zB]);
      b.quad([gx - 0.1, yA - 0.9, zA], [gx - 0.1, yB - 0.9, zB], [gx + 0.1, yB - 0.9, zB], [gx + 0.1, yA - 0.9, zA]);
    }
    // bulbs along the arch (marquee) on both faces + a sun emblem
    for (let i = 1; i < n * 2; i++) {
      const [bz, by] = arc(i / (n * 2));
      b.color('#fff1c9').emit('#ffd88a', 2.6, EMIT.MARQUEE, (i % 2) * 0.25);
      for (const s of [-1, 1]) b.box(gx + s * 0.11, by + 0.02, bz, 0.06, 0.1, 0.1, 0, 0);
    }
    b.noEmit();
    for (const s of [-1, 1]) {
      b.color('#e9c46a');
      b.cyl([gx + s * 0.09, top + 5.25, p.z], [gx + s * 0.14, top + 5.25, p.z], 0.42, 0.42, 14, s > 0 ? 2 : 1);
      b.color('#f4a261');
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        b.box(gx + s * 0.1, top + 5.25 + Math.cos(a) * 0.62, p.z + Math.sin(a) * 0.62, 0.04, 0.18, 0.08, 0, 0);
      }
    }
  }
  // ── kiosks & stalls (south part of the deck, clear of the walk)
  kiosk(b, xa + 7.5, p.z + 2.4, 3.0, 2.6, '#f4a261', CREAM, rng, glows, top);
  kiosk(b, xa + 15.0, p.z + 2.6, 4.0, 2.4, '#e63946', CREAM, rng, glows, top);
  kiosk(b, xa + 40.5, p.z + 2.8, 2.4, 2.2, '#8d6cab', CREAM, rng, glows, top);
  kiosk(b, xa + 45.5, p.z + 1.8, 1.8, 1.8, TEAL, CREAM, rng, glows, top);
  // ── pier end: telescopes + flagpoles
  for (const tz of [p.z - 2.0, p.z + 4.0]) {
    b.color('#3b5d55');
    b.cyl([xb - 1.4, top, tz], [xb - 1.4, top + 1.05, tz], 0.06, 0.05, 6, 0);
    b.box(xb - 1.4, top + 1.2, tz, 0.5, 0.26, 0.3, 0.2, 0);
    b.color('#c9a43a');
    b.cyl([xb - 1.15, top + 1.22, tz], [xb - 1.0, top + 1.24, tz], 0.09, 0.09, 6, 2);
  }
  for (const [fz, fc] of [
    [z0 + 0.7, '#e63946'],
    [z1 - 0.7, '#457b9d'],
  ] as [number, string][]) {
    b.color(CREAM);
    b.cyl([xb - 0.7, top, fz], [xb - 0.7, top + 7.0, fz], 0.07, 0.045, 6, 2);
    b.color('#e9c46a');
    b.sphere(xb - 0.7, top + 7.05, fz, 0.1, 6, 4);
    b.color(fc);
    b.quad2([xb - 0.7, top + 6.8, fz], [xb + 1.0, top + 6.45, fz], [xb + 1.0, top + 6.45, fz], [xb - 0.7, top + 6.05, fz]);
  }
}

function ring(b: HB, x: number, y: number, z: number, r: number, t: number, s: number): void {
  const pts: V3[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]);
  }
  for (let q = 0; q < 4; q++) {
    b.color(q % 2 === 0 ? '#e85d3a' : '#f4efe4');
    b.tube(pts.slice(q * 4, q * 4 + 5), t, 5);
  }
  void s;
}

function lamp(b: HB, x: number, top: number, z: number, glows: GlowPoint[]): void {
  b.noEmit().color(IRON);
  b.box(x, top + 0.25, z, 0.3, 0.5, 0.3, 0, 1);
  b.cyl([x, top + 0.5, z], [x, top + 4.0, z], 0.075, 0.05, 6, 0);
  b.box(x, top + 3.9, z, 1.15, 0.06, 0.06, 0, 0);
  b.cyl([x, top + 4.0, z], [x, top + 4.45, z], 0.05, 0.02, 6, 2);
  for (const s of [-1, 1]) {
    const lx = x + s * 0.52;
    b.color(IRON);
    b.box(lx, top + 3.83, z, 0.26, 0.05, 0.26, Math.PI / 4, 0);
    b.color('#fff1c9').emit('#ffd28a', 2.4, EMIT.LIGHTS);
    b.box(lx, top + 3.6, z, 0.2, 0.36, 0.2, Math.PI / 4, 3);
    b.noEmit();
    glows.push({ x: lx, y: top + 3.62, z, size: 1.1, color: '#ffd08c', intensity: 1.0 });
  }
  glows.push({ x, y: top + 0.04, z: z + (z > 62 ? -1.4 : 1.4), size: 3.6, pool: true, color: '#ffbe72', intensity: 0.32 });
}

function kiosk(b: HB, x: number, z: number, w: number, d: number, col: string, col2: string, rng: Rng, glows: GlowPoint[], top: number): void {
  const h = 2.4;
  b.noEmit();
  // vertical candy stripes on the walls
  const nS = Math.max(4, Math.round(w / 0.45));
  for (let i = 0; i < nS; i++) {
    const xa = x - w / 2 + (w * i) / nS,
      xb2 = x - w / 2 + (w * (i + 1)) / nS;
    b.color(i % 2 === 0 ? col : col2);
    b.quad([xa, top, z + d / 2], [xb2, top, z + d / 2], [xb2, top + h, z + d / 2], [xa, top + h, z + d / 2]);
  }
  b.color(col2);
  b.boxMM(x - w / 2, top, z - d / 2, x + w / 2, top + 0.95, z + d / 2 - 0.01, 1 | 8);
  b.color(col);
  b.boxMM(x - w / 2, top + 0.95, z - d / 2 + 0.02, x + w / 2, top + 1.0, z + d / 2 - 0.01, 1 | 8);
  // serving hatch (north face, towards the walk): dark interior with warm light
  b.color('#3a2f28').emit('#ffcf8a', 1.3, EMIT.LIGHTS);
  b.boxMM(x - w / 2 + 0.25, top + 1.0, z - d / 2 + 0.05, x + w / 2 - 0.25, top + 2.0, z - d / 2 + 0.06, 1 | 2 | 8 | 16 | 32);
  b.noEmit();
  b.color(col);
  b.boxMM(x - w / 2, top + 2.0, z - d / 2, x + w / 2, top + h, z + d / 2 - 0.01, 1 | 8);
  for (const sx of [-1, 1]) {
    b.color(col);
    b.boxMM(sx > 0 ? x + w / 2 - 0.15 : x - w / 2, top + 1.0, z - d / 2, sx > 0 ? x + w / 2 : x - w / 2 + 0.15, top + 2.0, z + d / 2 - 0.01, 1 | 2 | 8);
  }
  // striped awning over the hatch
  const nA = Math.max(4, Math.round(w / 0.4));
  for (let i = 0; i < nA; i++) {
    const xa = x - w / 2 - 0.1 + ((w + 0.2) * i) / nA,
      xb2 = x - w / 2 - 0.1 + ((w + 0.2) * (i + 1)) / nA;
    b.color(i % 2 === 0 ? col : '#fbf7ee');
    b.quad2([xa, top + 2.15, z - d / 2], [xb2, top + 2.15, z - d / 2], [xb2, top + 1.85, z - d / 2 - 0.75], [xa, top + 1.85, z - d / 2 - 0.75]);
  }
  // roof: little pyramid + pennant
  b.color(col2);
  b.boxMM(x - w / 2 - 0.12, top + h, z - d / 2 - 0.12, x + w / 2 + 0.12, top + h + 0.12, z + d / 2 + 0.12, 0);
  b.color(col);
  const yr = top + h + 0.12;
  const pk: V3 = [x, yr + 0.8, z];
  const c: V3[] = [
    [x - w / 2 - 0.1, yr, z - d / 2 - 0.1],
    [x + w / 2 + 0.1, yr, z - d / 2 - 0.1],
    [x + w / 2 + 0.1, yr, z + d / 2 + 0.1],
    [x - w / 2 - 0.1, yr, z + d / 2 + 0.1],
  ];
  for (let k = 0; k < 4; k++) b.triangle(c[k], pk, c[(k + 1) % 4]);
  b.color('#2b2b2b');
  b.cyl([x, yr + 0.8, z], [x, yr + 1.6, z], 0.025, 0.02, 4, 0);
  b.color(rng.pick(['#e63946', '#e9c46a', '#2a9d8f', '#457b9d']));
  b.quad2([x, yr + 1.58, z], [x + 0.6, yr + 1.45, z], [x + 0.6, yr + 1.45, z], [x, yr + 1.3, z]);
  glows.push({ x, y: top + 1.5, z: z - d / 2 - 0.5, size: 1.6, color: '#ffcf8a', intensity: 0.55 });
}

// ──────────────────────────────────────────────────────── ferris wheel

export interface WheelSpec {
  x: number;
  z: number;
  radius: number;
  hubY: number;
  rect: { x0: number; z0: number; x1: number; z1: number };
  deckY: number;
}

export function buildWheelStatic(b: HB, w: WheelSpec, glows: GlowPoint[]): void {
  const top = w.deckY;
  b.noEmit().pat(PAT.NONE);
  // boarding platform + steps (north side, towards the walk)
  b.color('#d9cdb0');
  b.boxMM(w.x - 5, top, w.rect.z0 + 0.6, w.x + 5, top + 0.38, w.rect.z1 - 0.6, 1);
  b.color(TEAL);
  b.boxMM(w.x - 5.02, top + 0.3, w.rect.z0 + 0.58, w.x + 5.02, top + 0.4, w.rect.z1 - 0.58, 1);
  b.color('#cbbf9f');
  b.boxMM(w.x - 2.5, top, w.rect.z0 + 0.05, w.x + 2.5, top + 0.19, w.rect.z0 + 0.6, 1);
  // A-frames
  const hy = w.hubY;
  const legX = (w.rect.x1 - w.rect.x0) / 2 - 0.5;
  for (const s of [-1, 1]) {
    const zb = w.z + s * ((w.rect.z1 - w.rect.z0) / 2 - 0.3);
    const zt = w.z + s * 2.35;
    const A: V3 = [w.x - legX, top, zb],
      B: V3 = [w.x + legX, top, zb],
      T: V3 = [w.x, hy, zt];
    b.color('#f2efe6');
    b.beam(A, T, 0.5, 0.5);
    b.beam(B, T, 0.5, 0.5);
    b.color('#c9c4b8');
    b.box(A[0], top + 0.2, A[2], 1.2, 0.4, 1.2, 0, 1);
    b.box(B[0], top + 0.2, B[2], 1.2, 0.4, 1.2, 0, 1);
    // ties + lacing
    b.color('#e6e1d5');
    const lerp = (P: V3, Q: V3, t: number): V3 => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t];
    const ts = [0.12, 0.36, 0.6, 0.8];
    for (let k = 0; k < ts.length; k++) {
      b.beam(lerp(A, T, ts[k]), lerp(B, T, ts[k]), 0.2, 0.2);
      if (k < ts.length - 1) {
        b.beam(lerp(A, T, ts[k]), lerp(B, T, ts[k + 1]), 0.12, 0.12);
        b.beam(lerp(B, T, ts[k]), lerp(A, T, ts[k + 1]), 0.12, 0.12);
      }
    }
    b.color('#8f949a');
    b.box(w.x, hy, zt, 1.0, 1.1, 0.7, 0, 0);
  }
  // static axle
  b.color('#7d838a');
  b.cyl([w.x, hy, w.z - 2.6], [w.x, hy, w.z + 2.6], 0.34, 0.34, 10, 3);
  // ticket booth by the steps
  b.color('#e63946');
  b.boxMM(w.x + 3.4, top, w.rect.z0 - 1.6, w.x + 4.8, top + 2.2, w.rect.z0 - 0.3, 1);
  b.color('#3a2f28').emit('#ffcf8a', 1.4, EMIT.LIGHTS);
  b.boxMM(w.x + 3.55, top + 1.0, w.rect.z0 - 1.62, w.x + 4.65, top + 1.7, w.rect.z0 - 1.6, 1 | 2 | 8);
  b.noEmit();
  b.color(CREAM);
  b.boxMM(w.x + 3.3, top + 2.2, w.rect.z0 - 1.7, w.x + 4.9, top + 2.4, w.rect.z0 - 0.2, 0);
  glows.push({ x: w.x, y: hy, z: w.z, size: 6.5, color: '#ffd9a8', intensity: 0.42, mode: GLOW.FERRIS });
}

/** rotating wheel (rims, spokes, lights) + 24 gondolas, into the rigged builder */
export function buildWheelRotating(b: HB, w: WheelSpec): number {
  const R = w.radius,
    R2 = R - 1.4;
  const hy = w.hubY;
  const gond = 24;
  const sides = [w.z - 1.1, w.z + 1.1];
  b.rig(RIG.WHEEL).noEmit().pat(PAT.NONE);
  // hub drum + decorative discs
  b.color('#e8e3d6');
  b.cyl([w.x, hy, w.z - 1.35], [w.x, hy, w.z + 1.35], 0.95, 0.95, 14, 3);
  for (const s of [-1, 1]) {
    const zz = w.z + s * 1.4;
    b.color('#e9c46a');
    b.cyl([w.x, hy, zz - s * 0.05], [w.x, hy, zz + s * 0.03], 1.7, 1.7, 18, s > 0 ? 2 : 1);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c = BULBS[k % BULBS.length];
      b.color(c).emit(c, 2.8, EMIT.STEADY);
      b.box(w.x + Math.cos(a) * 1.45, hy + Math.sin(a) * 1.45, zz + s * 0.06, 0.13, 0.13, 0.06, 0, 0);
    }
    b.noEmit();
  }
  for (const zr of sides) {
    // outer rim: emissive chase light ring
    const n = 120;
    const outer: V3[] = [];
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      outer.push([w.x + Math.cos(a) * R, hy + Math.sin(a) * R, zr]);
    }
    b.color('#fbf6ea');
    b.tube(outer, 0.13, 5, false, (i) => b.emit('#fff1d0', 2.2, EMIT.CHASE, Math.min(0.995, i / n)));
    b.noEmit();
    // inner ring + lattice
    const inner: V3[] = [];
    for (let k = 0; k <= 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      inner.push([w.x + Math.cos(a) * R2, hy + Math.sin(a) * R2, zr]);
    }
    b.color('#f2efe6');
    b.tube(inner, 0.08, 4);
    b.color('#e3ded2');
    const nl = 48;
    for (let k = 0; k < nl; k++) {
      const a0 = (k / nl) * Math.PI * 2,
        a1 = ((k + 1) / nl) * Math.PI * 2;
      const ra = k % 2 === 0 ? R : R2,
        rb = k % 2 === 0 ? R2 : R;
      b.beam([w.x + Math.cos(a0) * ra, hy + Math.sin(a0) * ra, zr], [w.x + Math.cos(a1) * rb, hy + Math.sin(a1) * rb, zr], 0.06, 0.06, false);
    }
    // spokes with bulbs
    for (let k = 0; k < gond; k++) {
      const a = ((k + 0.5) / gond) * Math.PI * 2;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      b.color('#d8d3c6');
      b.beam([w.x + ca * 0.9, hy + sa * 0.9, w.z + (zr - w.z) * 0.7], [w.x + ca * R2, hy + sa * R2, zr], 0.055, 0.055, false);
      const c = BULBS[k % 3 === 0 ? 0 : k % 3 === 1 ? 1 : 2];
      for (let j = 1; j <= 6; j++) {
        const r = 1.0 + ((R2 - 1.2) * j) / 6.4;
        const zz = w.z + (zr - w.z) * (0.7 + 0.3 * (r / R2));
        b.color(c).emit(c, 2.6, EMIT.SPOKE, Math.min(0.995, r / R));
        b.sphere(w.x + ca * r, hy + sa * r, zz, 0.075, 4, 2);
      }
      b.noEmit();
    }
  }
  // gondola axles between the rims
  b.color('#9aa0a6');
  for (let k = 0; k < gond; k++) {
    const a = (k / gond) * Math.PI * 2;
    b.cyl([w.x + Math.cos(a) * R, hy + Math.sin(a) * R, sides[0]], [w.x + Math.cos(a) * R, hy + Math.sin(a) * R, sides[1]], 0.06, 0.06, 5, 0);
  }
  // gondolas (pivot on the rim, body hangs below and stays upright)
  const cols = ['#e63946', '#2a9d8f', '#e9c46a', '#457b9d', '#f4a261', '#8d6cab'];
  for (let k = 0; k < gond; k++) {
    const a = (k / gond) * Math.PI * 2;
    const px = w.x + Math.cos(a) * R,
      py = hy + Math.sin(a) * R,
      pz = w.z;
    b.rig(RIG.GONDOLA, 0, (k * 0.37) % 1).pivot(px, py, pz);
    const c = cols[k % cols.length];
    b.color('#c9ccd0');
    b.box(px, py - 0.25, pz, 0.12, 0.5, 0.12, 0, 0);
    // canopy
    b.color(c);
    b.boxMM(px - 0.85, py - 0.62, pz - 0.82, px + 0.85, py - 0.5, pz + 0.82, 0);
    const apex: V3 = [px, py - 0.32, pz];
    const cc: V3[] = [
      [px - 0.85, py - 0.5, pz - 0.82],
      [px + 0.85, py - 0.5, pz - 0.82],
      [px + 0.85, py - 0.5, pz + 0.82],
      [px - 0.85, py - 0.5, pz + 0.82],
    ];
    for (let q = 0; q < 4; q++) b.triangle(cc[q], apex, cc[(q + 1) % 4]);
    // poles
    b.color('#e8e4da');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(px + sx * 0.7, py - 1.05, pz + sz * 0.68, 0.05, 0.9, 0.05, 0, 3);
    // tub
    b.color(c);
    b.boxMM(px - 0.78, py - 2.05, pz - 0.75, px + 0.78, py - 1.5, pz + 0.75, 0);
    b.color('#fbf7ee');
    b.boxMM(px - 0.8, py - 1.56, pz - 0.77, px + 0.8, py - 1.48, pz + 0.77, 1);
  }
  b.rig(RIG.STATIC).pivot(0, 0, 0);
  return gond;
}

// ──────────────────────────────────────────────────────────── carousel

export function buildCarouselStatic(b: HB, x: number, z: number, r: number, deckY: number): void {
  b.noEmit().pat(PAT.NONE);
  b.color('#2a9d8f');
  b.cyl([x, deckY, z], [x, deckY + 0.13, z], r + 0.15, r + 0.12, 28, 2);
  b.color('#efe6d2');
  b.cyl([x, deckY + 0.13, z], [x, deckY + 0.24, z], r + 0.02, r, 28, 2);
}

export function buildCarouselRotating(b: HB, x: number, z: number, r: number, deckY: number, rng: Rng): number {
  const y0 = deckY + 0.26;
  b.rig(RIG.CAROUSEL).noEmit().pat(PAT.NONE);
  // platform
  b.color('#b98b5e');
  b.cyl([x, y0, z], [x, y0 + 0.14, z], r - 0.05, r - 0.05, 28, 2);
  b.color('#e9c46a');
  b.cyl([x, y0 + 0.02, z], [x, y0 + 0.12, z], r, r, 28, 0);
  const pf = y0 + 0.14;
  const ceil = deckY + 3.6;
  // centre column with coloured panels
  const nC = 12;
  for (let k = 0; k < nC; k++) {
    const a0 = (k / nC) * Math.PI * 2,
      a1 = ((k + 1) / nC) * Math.PI * 2;
    b.color(k % 2 === 0 ? '#e63946' : '#f6efe0');
    const r0 = 0.8;
    b.quad([x + Math.sin(a0) * r0, pf, z + Math.cos(a0) * r0], [x + Math.sin(a1) * r0, pf, z + Math.cos(a1) * r0], [x + Math.sin(a1) * r0, ceil, z + Math.cos(a1) * r0], [x + Math.sin(a0) * r0, ceil, z + Math.cos(a0) * r0]);
  }
  for (let k = 0; k < nC; k++) {
    const a = ((k + 0.5) / nC) * Math.PI * 2;
    b.color('#fff1c9').emit('#ffd88a', 2.4, EMIT.MARQUEE, (k % 2) * 0.25);
    b.box(x + Math.sin(a) * 0.83, ceil - 0.25, z + Math.cos(a) * 0.83, 0.1, 0.1, 0.1, 0, 0);
  }
  b.noEmit();
  // ceiling disc (seen from below)
  b.color('#f3e6c8');
  b.cyl([x, ceil, z], [x, ceil + 0.05, z], r + 0.2, r + 0.2, 28, 1);
  // canopy cone (16 stripes)
  const nS = 16;
  const rc = r + 0.25,
    yc0 = ceil + 0.05,
    yc1 = deckY + 5.05;
  for (let k = 0; k < nS; k++) {
    const a0 = (k / nS) * Math.PI * 2,
      a1 = ((k + 1) / nS) * Math.PI * 2;
    b.color(k % 2 === 0 ? '#e63946' : '#f8f1e4');
    b.quad([x + Math.sin(a0) * rc, yc0, z + Math.cos(a0) * rc], [x + Math.sin(a1) * rc, yc0, z + Math.cos(a1) * rc], [x + Math.sin(a1) * 0.25, yc1, z + Math.cos(a1) * 0.25], [x + Math.sin(a0) * 0.25, yc1, z + Math.cos(a0) * 0.25]);
    // valance band + scallop
    b.color(k % 2 === 0 ? '#2a9d8f' : '#e9c46a');
    const v0 = ceil - 0.42;
    const P0: V3 = [x + Math.sin(a0) * rc, v0, z + Math.cos(a0) * rc],
      P1: V3 = [x + Math.sin(a1) * rc, v0, z + Math.cos(a1) * rc];
    b.quad2(P0, P1, [P1[0], yc0, P1[2]], [P0[0], yc0, P0[2]]);
    const am = (a0 + a1) / 2;
    b.triangle(P1, P0, [x + Math.sin(am) * rc, v0 - 0.22, z + Math.cos(am) * rc]);
    b.triangle(P0, P1, [x + Math.sin(am) * rc, v0 - 0.22, z + Math.cos(am) * rc]);
  }
  // valance bulbs
  for (let k = 0; k < 32; k++) {
    const a = ((k + 0.5) / 32) * Math.PI * 2;
    b.color('#fff1c9').emit('#ffd88a', 2.8, EMIT.MARQUEE, (k % 2) * 0.25);
    b.box(x + Math.sin(a) * (rc + 0.03), ceil - 0.2, z + Math.cos(a) * (rc + 0.03), 0.09, 0.09, 0.05, a, 0);
  }
  b.noEmit();
  // finial
  b.color('#e9c46a');
  b.sphere(x, yc1 + 0.12, z, 0.2, 8, 5);
  b.cyl([x, yc1 + 0.3, z], [x, yc1 + 0.95, z], 0.03, 0.02, 4, 0);
  b.color('#e63946');
  b.quad2([x, yc1 + 0.92, z], [x + 0.5, yc1 + 0.82, z], [x + 0.5, yc1 + 0.82, z], [x, yc1 + 0.7, z]);
  // poles + horses
  let horses = 0;
  const bodies = ['#f6f1e6', '#f6f1e6', '#3b3330', '#8a5a3c', '#c9c1b5', '#e8d9bf'];
  const saddles = ['#e63946', '#457b9d', '#e9c46a', '#2a9d8f', '#8d6cab', '#f4a261'];
  for (const [rr, n] of [
    [r - 0.75, 12],
    [r - 1.7, 8],
  ] as [number, number][]) {
    for (let k = 0; k < n; k++) {
      const a = ((k + (n === 8 ? 0.5 : 0)) / n) * Math.PI * 2;
      const hx = x + Math.sin(a) * rr,
        hz = z + Math.cos(a) * rr;
      b.rig(RIG.CAROUSEL);
      b.color('#d4a84a');
      b.cyl([hx, pf, hz], [hx, ceil, hz], 0.035, 0.035, 5, 0);
      b.rig(RIG.HORSE, 0, (k / n + (n === 8 ? 0.5 : 0)) % 1);
      horse(b, hx, pf + 1.0, hz, a + Math.PI / 2, rng.pick(bodies), rng.pick(saddles));
      horses++;
    }
  }
  b.rig(RIG.STATIC);
  return horses;
}

function horse(b: HB, x: number, y: number, z: number, yaw: number, body: string, saddle: string): void {
  b.pushT(x, y, z, yaw);
  b.color(body);
  b.box(0, 0, 0, 0.3, 0.36, 0.95, 0, 0);
  b.pushT(0, 0.2, 0.42, 0, -0.75);
  b.box(0, 0.18, 0, 0.2, 0.46, 0.24, 0, 0);
  b.pop();
  b.pushT(0, 0.55, 0.62, 0, 0.55);
  b.box(0, 0, 0.1, 0.17, 0.19, 0.42, 0, 0);
  b.pop();
  // legs: front pair prancing, back pair down
  for (const s of [-1, 1]) {
    b.pushT(s * 0.09, -0.12, 0.36, 0, -1.1);
    b.box(0, 0, 0.22, 0.07, 0.09, 0.44, 0, 0);
    b.pop();
    b.pushT(s * 0.09, -0.15, -0.36, 0, 0.25);
    b.box(0, -0.22, 0, 0.07, 0.46, 0.09, 0, 0);
    b.pop();
  }
  b.color(body === '#3b3330' ? '#d9cfc0' : '#5a4636');
  b.pushT(0, 0.05, -0.5, 0, 0.9);
  b.box(0, 0, -0.15, 0.08, 0.1, 0.34, 0, 0);
  b.pop();
  b.box(0, 0.62, 0.48, 0.07, 0.36, 0.1, 0, 0);
  b.color(saddle);
  b.box(0, 0.2, -0.05, 0.34, 0.07, 0.42, 0, 0);
  b.box(0, 0.05, -0.05, 0.36, 0.22, 0.06, 0, 0);
  b.pop();
}

export { THREE };
