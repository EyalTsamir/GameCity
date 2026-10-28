// The moored container feeder: lofted hull (red antifouling, dark topsides with a white sheer
// stripe and rust streaks), raised forecastle, hatch covers stacked with containers,
// accommodation block with lit windows, bridge + wings, funnel, mast, free-fall lifeboat,
// navigation lights; yellow mooring lines to quay bollards; pneumatic fenders.
// Built in the ship's local frame (bow = +z) into the RIGGED builder (rig SHIP = the gentle
// bob from uShip); mooring lines blend from the quay (weight 0) to the ship (weight 1).

import { castBollard } from './quay';
import * as THREE from 'three';
import { smoothstep } from '../../core/geom';
import type { Rng } from '../../core/rng';
import { addContainer, CH, CW, L20, L40, pickLook } from './containers';
import { EMIT, HB, PAT, RIG, type V3 } from './geo';
import type { GlowPoint } from './material';
import { GLOW } from './material';

export const SHIP = {
  half: 37,
  beam: 13,
  deckY: 1.6,
  fcY: 3.5,
  fcZ: 29.6,
  hatchY: 2.4,
  /** 20ft slot centres (local z), bow → stern */
  slots: [25.8, 19.4, 13.0, 6.6, 0.2, -6.2, -12.6, -19.0],
  rows: [3.81, 1.27, -1.27, -3.81],
  superZ0: -33.4,
  superZ1: -23.6,
} as const;

const HULL = '#263f55';
const HULL_RED = '#a63a32';
const WHITE = '#f1ede4';
const DECK = '#5e7466';
const HATCH = '#56685d';

export interface ShipInfo {
  /** local → world (rest) */
  toWorld(lx: number, ly: number, lz: number, out?: THREE.Vector3): THREE.Vector3;
  /** funnel top (rest, world) */
  funnel: THREE.Vector3;
  /** port side (quay side) world x of the hull */
  sideX: number;
  containers: number;
  /** pivot for the bob (world) */
  center: THREE.Vector3;
}

export interface MobileSlot {
  /** local slot index (0..7) and row index (0..3) */
  slot: number;
  row: number;
}

const yDeck = (z: number) => SHIP.deckY + (SHIP.fcY - SHIP.deckY) * smoothstep(25, 30.5, z) + 0.55 * smoothstep(-30.5, -37, z);
const zStem = (y: number) => 34.4 + Math.max(0, y + 1.6) * 0.47;
const yKeel = (z: number) => -5 + 2.6 * smoothstep(-25, -37, z) + 1.6 * smoothstep(30, 36, z);

/** half-breadth of the hull at local (z, y) */
function hb(z: number, y: number): number {
  const half = SHIP.beam / 2;
  let w = half;
  if (z > 15) {
    const zs = zStem(y);
    const u = Math.min(1, Math.max(0, (z - 15) / (zs - 15)));
    const p = 1.7 + 1.6 * smoothstep(-3.5, 3.0, y);
    w = half * Math.pow(Math.max(0, 1 - Math.pow(u, p)), 0.55);
  } else if (z < -25) {
    const u = Math.min(1, (-25 - z) / 12);
    w = half * (1 - (0.2 + 0.14 * smoothstep(1.5, -2, y)) * Math.pow(u, 1.6));
  }
  // bilge rounding under the waterline
  if (y < -1.6) {
    const k = Math.min(1, (-1.6 - y) / 3.6);
    w *= Math.sqrt(Math.max(0.05, 1 - k * k * k * k));
  }
  return w;
}

function hullStations(): number[] {
  const zs: number[] = [];
  for (let z = -37; z < -25; z += 1.5) zs.push(z);
  for (let z = -25; z < 15; z += 5) zs.push(z);
  for (let z = 15; z < 34; z += 1.25) zs.push(z);
  for (let z = 34; z <= 37.2; z += 0.4) zs.push(z);
  zs.push(37.25);
  return zs;
}

/** a hull band between heights fy0(z)..fy1(z) on one side (sign = +1 port / −1 starboard) */
function hullBand(sign: number, fy0: (z: number) => number, fy1: (z: number) => number, rows: number): THREE.BufferGeometry {
  const zs = hullStations();
  const P: number[] = [];
  const I: number[] = [];
  for (const z of zs) {
    const y0 = fy0(z),
      y1 = fy1(z);
    for (let j = 0; j <= rows; j++) {
      const y = y0 + ((y1 - y0) * j) / rows;
      P.push(sign * hb(z, y), y, z);
    }
  }
  const W = rows + 1;
  for (let i = 0; i < zs.length - 1; i++)
    for (let j = 0; j < rows; j++) {
      const a = i * W + j,
        b = a + W;
      if (sign > 0) I.push(a, b + 1, b, a, a + 1, b + 1);
      else I.push(a, b, b + 1, a, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

export function buildShip(
  b: HB,
  x: number,
  z: number,
  yaw: number,
  rng: Rng,
  mobiles: MobileSlot[],
  glows: GlowPoint[],
): ShipInfo {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  const toWorld = (lx: number, ly: number, lz: number, out = new THREE.Vector3()) => out.set(lx, ly, lz).applyMatrix4(m);
  b.rig(RIG.SHIP, 0, 1).noEmit().pat(PAT.NONE);
  b.push(m);

  // ── hull bands (both sides)
  const sheerA = (zz: number) => yDeck(zz) - 0.62;
  const sheerB = (zz: number) => yDeck(zz) - 0.4;
  for (const s of [1, -1]) {
    b.color(HULL_RED).pat(PAT.NONE);
    b.geo(hullBand(s, yKeel, () => -1.22, 4));
    b.color(HULL).pat(PAT.HULL, 1.2);
    b.geo(hullBand(s, () => -1.22, sheerA, 4));
    b.color(WHITE).pat(PAT.NONE);
    b.geo(hullBand(s, sheerA, sheerB, 1));
    b.color(HULL).pat(PAT.HULL, 1.2);
    b.geo(hullBand(s, sheerB, yDeck, 1));
  }
  b.pat(PAT.NONE);
  // transom (flat stern) + bottom (closes the hull below water)
  {
    const zt = -37;
    const ys: number[] = [];
    for (let y = yKeel(zt); y < yDeck(zt); y += 0.5) ys.push(y);
    ys.push(yDeck(zt));
    for (let i = 0; i < ys.length - 1; i++) {
      const y0 = ys[i],
        y1 = ys[i + 1];
      b.color(y1 <= -1.22 + 1e-3 ? HULL_RED : HULL);
      b.quad([hb(zt, y0), y0, zt], [-hb(zt, y0), y0, zt], [-hb(zt, y1), y1, zt], [hb(zt, y1), y1, zt]);
    }
    const zs = hullStations();
    b.color(HULL_RED);
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i],
        z1 = zs[i + 1];
      const y0 = yKeel(z0),
        y1 = yKeel(z1);
      b.quad([hb(z0, y0), y0, z0], [hb(z1, y1), y1, z1], [-hb(z1, y1), y1, z1], [-hb(z0, y0), y0, z0]);
    }
  }
  // decks: main deck, forecastle deck, inner bulwarks, forecastle front
  {
    const zs = hullStations();
    b.color(DECK);
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i],
        z1 = Math.min(zs[i + 1], SHIP.fcZ);
      if (z0 >= SHIP.fcZ) break;
      const y = SHIP.deckY;
      const w0 = hb(z0, y) - 0.12,
        w1 = hb(z1, y) - 0.12;
      b.quad([-w0, y, z0], [-w1, y, z1], [w1, y, z1], [w0, y, z0]);
    }
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = Math.max(zs[i], SHIP.fcZ),
        z1 = zs[i + 1];
      if (z1 <= SHIP.fcZ) continue;
      const y = SHIP.fcY;
      const w0 = Math.max(0, hb(z0, y) - 0.12),
        w1 = Math.max(0, hb(z1, y) - 0.12);
      b.quad([-w0, y, z0], [-w1, y, z1], [w1, y, z1], [w0, y, z0]);
    }
    // forecastle front wall
    const wf = hb(SHIP.fcZ, SHIP.fcY) - 0.12;
    b.color('#d9d3c6');
    b.quad([wf, SHIP.deckY, SHIP.fcZ], [-wf, SHIP.deckY, SHIP.fcZ], [-wf, SHIP.fcY, SHIP.fcZ], [wf, SHIP.fcY, SHIP.fcZ]);
    // inner bulwark faces where the sheer rises above the main deck
    b.color('#c9c2b4');
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i],
        z1 = zs[i + 1];
      if (z0 >= SHIP.fcZ) break;
      const t0 = yDeck(z0),
        t1 = yDeck(Math.min(z1, SHIP.fcZ));
      if (t0 < SHIP.deckY + 0.05 && t1 < SHIP.deckY + 0.05) continue;
      const zz1 = Math.min(z1, SHIP.fcZ);
      for (const s of [1, -1]) {
        const w0 = s * (hb(z0, t0) - 0.12),
          w1 = s * (hb(zz1, t1) - 0.12);
        if (s < 0) b.quad([w0, SHIP.deckY, z0], [w0, t0, z0], [w1, t1, zz1], [w1, SHIP.deckY, zz1]);
        else b.quad([w0, SHIP.deckY, z0], [w1, SHIP.deckY, zz1], [w1, t1, zz1], [w0, t0, z0]);
      }
    }
    // deck-edge cap (top of the sheer strake)
    b.color(WHITE);
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i],
        z1 = zs[i + 1];
      const t0 = yDeck(z0),
        t1 = yDeck(z1);
      for (const s of [1, -1]) {
        const o0 = s * hb(z0, t0),
          o1 = s * hb(z1, t1);
        const i0 = s * Math.max(0, hb(z0, t0) - 0.14),
          i1 = s * Math.max(0, hb(z1, t1) - 0.14);
        if (s > 0) b.quad([i0, t0 + 0.04, z0], [i1, t1 + 0.04, z1], [o1, t1 + 0.04, z1], [o0, t0 + 0.04, z0]);
        else b.quad([o0, t0 + 0.04, z0], [o1, t1 + 0.04, z1], [i1, t1 + 0.04, z1], [i0, t0 + 0.04, z0]);
      }
    }
  }

  // ── hatch covers + deck containers
  let count = 0;
  const mobileAt = (slot: number, row: number) => mobiles.some((q) => q.slot === slot && q.row === row);
  for (let p = 0; p < 4; p++) {
    const zA = SHIP.slots[2 * p],
      zB = SHIP.slots[2 * p + 1];
    const zc = (zA + zB) / 2;
    b.color(HATCH);
    b.boxMM(-5.45, SHIP.deckY, zc - 6.3, 5.45, SHIP.hatchY, zc + 6.3, 1);
    b.color('#4a5a50');
    for (let k = -2; k <= 2; k++) b.boxMM(-5.5, SHIP.hatchY - 0.25, zc + k * 2.5 - 0.06, 5.5, SHIP.hatchY + 0.02, zc + k * 2.5 + 0.06, 1);
    b.color('#c9a43a');
    b.boxMM(-5.5, SHIP.hatchY - 0.6, zc - 6.34, 5.5, SHIP.hatchY - 0.45, zc + 6.34, 1 | 2);
    for (let r = 0; r < 4; r++) {
      const lx = SHIP.rows[r];
      const hasMob = mobileAt(2 * p, r) || mobileAt(2 * p + 1, r);
      const h = hasMob ? 3 : rng.weighted([1, 2, 3], [0.12, 0.38, 0.5]);
      for (let t = 0; t < h; t++) {
        const y = SHIP.hatchY + t * CH;
        const top = t === h - 1;
        if (top && (hasMob || rng.chance(0.3))) {
          // two 20ft boxes (mobile slots stay empty here: those boxes are separate instances)
          for (const [sz, si] of [
            [zA, 2 * p],
            [zB, 2 * p + 1],
          ] as [number, number][]) {
            if (mobileAt(si, r)) continue;
            if (!hasMob && rng.chance(0.15)) continue;
            addContainer(b, lx, y, sz, L20, pickLook(rng), Math.PI, true);
            count++;
          }
        } else {
          addContainer(b, lx, y, zc, L40, pickLook(rng), rng.chance(0.5) ? 0 : Math.PI, top);
          count++;
        }
      }
    }
  }
  b.pat(PAT.NONE);

  // ── deck railings (main deck edges between the forecastle and the superstructure)
  b.color(WHITE);
  for (const s of [1, -1]) {
    const pts: V3[] = [];
    for (let zz = -36.5; zz <= SHIP.fcZ + 7; zz += 1.5) {
      const y = yDeck(zz) + 1.0;
      const w = hb(zz, yDeck(zz)) - 0.12;
      if (w < 0.4) break;
      pts.push([s * w, y, zz]);
    }
    for (let k = 0; k < pts.length - 1; k++) b.beam(pts[k], pts[k + 1], 0.05, 0.05, false);
    for (let k = 0; k < pts.length; k += 2) b.box(pts[k][0], pts[k][1] - 0.5, pts[k][2], 0.05, 1.0, 0.05, 0, 3);
  }

  // ── accommodation block
  const z0 = SHIP.superZ0,
    z1 = SHIP.superZ1;
  const lv = 2.6;
  const top = SHIP.deckY + 4 * lv; // 12.0
  b.color(WHITE);
  b.boxMM(-5.6, SHIP.deckY, z0, 5.6, top, z1, 1);
  // deck overhang slabs at each level
  b.color('#d8d2c5');
  for (let k = 1; k <= 4; k++) {
    const y = SHIP.deckY + k * lv;
    b.boxMM(-5.85, y - 0.16, z0 - 0.1, 5.85, y, z1 + 0.3, 0);
  }
  // windows: rows on front and sides (random lit)
  b.pat(PAT.GLASS);
  for (let k = 0; k < 4; k++) {
    const yw = SHIP.deckY + k * lv + 1.05;
    // front (+z)
    for (let wx = -4.6; wx <= 4.61; wx += 1.15) {
      lit(rng.chance(0.55));
      b.box(wx, yw + 0.35, z1 + 0.03, 0.7, 0.7, 0.04, 0, 1 | 2 | 4);
    }
    for (const s of [1, -1])
      for (let wz = z0 + 1.2; wz <= z1 - 1.0; wz += 1.4) {
        lit(rng.chance(0.45));
        b.box(s * 5.63, yw + 0.35, wz, 0.04, 0.7, 0.7, 0, 1 | 2 | (s > 0 ? 16 : 32));
      }
  }
  b.noEmit().pat(PAT.NONE);
  function lit(on: boolean) {
    b.color('#33424d');
    if (on) b.emit(rng.chance(0.7) ? '#ffd59a' : '#e8f0ff', 1.5 + rng.next() * 0.8, EMIT.LIGHTS);
    else b.noEmit();
  }
  // bridge deck + wings
  const bz0 = -30.2,
    bz1 = -24.0;
  b.color(WHITE);
  b.boxMM(-5.4, top, bz0, 5.4, top + 2.7, bz1, 1);
  b.color('#d8d2c5');
  b.boxMM(-6.7, top + 0.05, bz1 - 2.2, 6.7, top + 0.3, bz1 - 0.2, 0);
  b.boxMM(-5.7, top + 2.7, bz0 - 0.2, 5.7, top + 2.95, bz1 + 0.35, 0);
  b.color(WHITE);
  for (const s of [1, -1]) b.boxMM(s > 0 ? 5.4 : -6.7, top + 0.3, bz1 - 2.0, s > 0 ? 6.7 : -5.4, top + 1.25, bz1 - 0.4, 2);
  b.color('#2f3d47').pat(PAT.GLASS).emit('#cfe0ff', 0.9, EMIT.LIGHTS);
  b.boxMM(-5.2, top + 1.2, bz1 - 0.02, 5.2, top + 2.3, bz1 + 0.03, 1 | 2 | 4);
  for (const s of [1, -1]) b.boxMM(s > 0 ? 5.38 : -5.43, top + 1.2, bz0 + 0.6, s > 0 ? 5.43 : -5.38, top + 2.3, bz1 - 0.3, 1 | 2);
  b.noEmit().pat(PAT.NONE);
  // sidelights on the wings: port (+x local) red, starboard green
  b.color('#a3322a').emit('#ff3b2a', 3.5, EMIT.STEADY);
  b.box(6.55, top + 1.45, bz1 - 1.2, 0.2, 0.3, 0.3, 0, 1);
  b.color('#2d8a4a').emit('#3dff7a', 3.5, EMIT.STEADY);
  b.box(-6.55, top + 1.45, bz1 - 1.2, 0.2, 0.3, 0.3, 0, 1);
  b.noEmit();
  // mast with radar scanners + masthead light
  b.color('#e9e4d8');
  b.cyl([0, top + 2.95, -27.2], [0, top + 9.0, -27.2], 0.16, 0.1, 6, 2);
  b.box(0, top + 5.2, -27.2, 3.8, 0.14, 0.14, 0, 0);
  b.color('#2c3034');
  b.box(-1.2, top + 3.35, -28.6, 2.6, 0.12, 0.35, 0.3, 0);
  b.box(1.0, top + 5.55, -27.2, 2.0, 0.1, 0.3, -0.2, 0);
  b.color('#fffbe8').emit('#fff6dd', 4.0, EMIT.STEADY);
  b.box(0, top + 9.15, -27.2, 0.22, 0.26, 0.22, 0, 1);
  b.noEmit();
  // funnel (raked oval box) with a coloured band and black top
  {
    const fz = -31.6,
      fy0 = top,
      fy1 = top + 5.6;
    const ring = (y: number, rz: number, rx: number, dz: number): V3[] => {
      const pts: V3[] = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        pts.push([Math.cos(a) * rx, y, fz + dz + Math.sin(a) * rz]);
      }
      return pts;
    };
    const bands: [number, number, string][] = [
      [fy0, fy1 - 2.4, HULL],
      [fy1 - 2.4, fy1 - 1.5, '#e9c46a'],
      [fy1 - 1.5, fy1 - 0.65, HULL],
      [fy1 - 0.65, fy1, '#1f2226'],
    ];
    for (const [ya, yb, c] of bands) {
      b.color(c);
      const ra = ring(ya, 1.75, 1.35, (ya - fy0) * -0.12);
      const rb = ring(yb, 1.75, 1.35, (yb - fy0) * -0.12);
      for (let k = 0; k < 12; k++) {
        const k2 = (k + 1) % 12;
        b.quad(ra[k], ra[k2], rb[k2], rb[k]);
      }
    }
    b.color('#141618');
    const rt = ring(fy1, 1.75, 1.35, (fy1 - fy0) * -0.12);
    for (let k = 1; k < 11; k++) b.triangle(rt[0], rt[k + 1], rt[k]);
    // emblem on the band (white diamond) both sides
    b.color(WHITE);
    for (const s of [1, -1]) b.box(s * 1.37, fy1 - 1.95, fz - (fy1 - 1.95 - fy0) * 0.12, 0.05, 0.5, 0.5, 0, 0);
  }
  // free-fall lifeboat on its stern ramp (orange)
  b.color('#8f9599');
  b.beam([0, SHIP.deckY + 2.2, -33.0], [0, SHIP.deckY + 0.9, -36.6], 2.2, 0.15);
  b.color('#f28c28');
  {
    const g = new THREE.SphereGeometry(1, 10, 6);
    g.scale(1.05, 0.95, 3.0);
    const mm = new THREE.Matrix4().makeRotationX(-0.33).setPosition(0, SHIP.deckY + 2.45, -34.8);
    b.geo(g, mm);
    g.dispose();
  }
  b.color('#e7e2d6');
  b.box(0, SHIP.deckY + 3.35, -34.4, 1.0, 0.45, 1.6, 0, 1);
  // stern: mooring winches, bollards, flagpole
  b.color('#3e5a4a');
  for (const s of [1, -1]) b.box(s * 3.2, SHIP.deckY + 0.45, -35.4, 1.4, 0.9, 1.0, 0, 1);
  b.color('#2a2d30');
  for (const s of [1, -1]) for (const dz of [-0.35, 0.35]) b.vcyl(s * 5.2, SHIP.deckY + 0.55, -36 + dz, 0.16, 0.5, 6);
  b.color('#e9e4d8');
  b.cyl([0, SHIP.deckY + 0.55, -36.8], [0, SHIP.deckY + 4.6, -36.8], 0.06, 0.05, 5, 2);
  b.color('#2a6f97');
  b.quad2([0, SHIP.deckY + 3.7, -36.85], [0, SHIP.deckY + 3.7, -38.2], [0, SHIP.deckY + 4.55, -38.2], [0, SHIP.deckY + 4.55, -36.85]);
  b.color('#fffbe8').emit('#fff6dd', 3.0, EMIT.STEADY);
  b.box(0, yDeck(-37) + 1.2, -36.95, 0.2, 0.2, 0.12, 0, 1);
  b.noEmit();
  // forecastle: windlass, bollards, foremast + light
  b.color('#3e5a4a');
  for (const s of [1, -1]) b.box(s * 1.6, SHIP.fcY + 0.4, 32.6, 1.3, 0.8, 1.5, 0, 1);
  b.color('#2a2d30');
  for (const s of [1, -1]) for (const dz of [-0.35, 0.35]) b.vcyl(s * 3.3, SHIP.fcY, 30.8 + dz, 0.15, 0.5, 6);
  b.color('#e9e4d8');
  b.cyl([0, SHIP.fcY, 34.0], [0, SHIP.fcY + 6.5, 34.0], 0.13, 0.08, 6, 2);
  b.color('#fffbe8').emit('#fff6dd', 4.0, EMIT.STEADY);
  b.box(0, SHIP.fcY + 6.6, 34.0, 0.2, 0.24, 0.2, 0, 1);
  b.noEmit();
  b.color(WHITE);
  for (const s of [1, -1]) {
    const pts: V3[] = [];
    for (let zz = SHIP.fcZ; zz <= 36.6; zz += 0.9) pts.push([s * Math.max(0.2, hb(zz, SHIP.fcY) - 0.15), SHIP.fcY + 1.0, zz]);
    for (let k = 0; k < pts.length - 1; k++) b.beam(pts[k], pts[k + 1], 0.05, 0.05, false);
  }
  // deck floodlights on the superstructure front (light the cargo at night)
  b.color('#e8e4d8').emit('#fff1d6', 3.0, EMIT.LIGHTS);
  for (const s of [-3.6, 0, 3.6]) b.box(s, top + 0.5, z1 + 0.4, 0.5, 0.35, 0.25, 0, 0);
  b.noEmit();
  b.pop();
  b.rig(RIG.STATIC);

  // glows (world, static: the bob is a few cm)
  const w = new THREE.Vector3();
  const addG = (lx: number, ly: number, lz: number, size: number, color: string, intensity: number, mode = GLOW.LIGHTS, day = 0) => {
    toWorld(lx, ly, lz, w);
    glows.push({ x: w.x, y: w.y, z: w.z, size, color, intensity, mode, day });
  };
  addG(6.6, top + 1.45, bz1 - 1.2, 1.1, '#ff4433', 1.3, GLOW.LIGHTS, 0.0);
  addG(-6.6, top + 1.45, bz1 - 1.2, 1.1, '#44ff7a', 1.3, GLOW.LIGHTS, 0.0);
  addG(0, top + 9.2, -27.2, 1.2, '#fff6e0', 1.4);
  addG(0, SHIP.fcY + 6.65, 34.0, 1.2, '#fff6e0', 1.4);
  for (const s of [-3.6, 0, 3.6]) addG(s, top + 0.5, z1 + 0.6, 1.6, '#fff1d6', 1.0);

  return {
    toWorld,
    funnel: toWorld(0, top + 5.9, -31.6 - 5.6 * 0.12),
    sideX: toWorld(SHIP.beam / 2, 0, 0).x,
    containers: count,
    center: toWorld(0, -1.6, 0),
  };
}

/** world rest position (bottom centre) of a mobile 20ft box on the ship */
export function mobileShipPos(info: ShipInfo, slot: number, row: number): THREE.Vector3 {
  return info.toWorld(SHIP.rows[row], SHIP.hatchY + 2 * CH, SHIP.slots[slot]);
}

/** Mooring lines from ship fairleads to quay bollards (rigged: quay end static, ship end bobs). */
export function buildMooring(b: HB, info: ShipInfo, quayX: number, bollards: { z: number }[], fairleads: [number, number, number][]): void {
  b.color('#e3d29a').noEmit().pat(PAT.NONE);
  const f = new THREE.Vector3();
  for (let k = 0; k < fairleads.length; k++) {
    const [lx, ly, lz] = fairleads[k];
    info.toWorld(lx, ly, lz, f);
    const q: V3 = [quayX, 0.62, bollards[k].z];
    const n = 14;
    const pts: V3[] = [];
    const L = Math.hypot(f.x - q[0], f.z - q[2]);
    const sag = 0.25 + L * 0.02;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([q[0] + (f.x - q[0]) * t, q[1] + (f.y - q[1]) * t - sag * Math.sin(Math.PI * t), q[2] + (f.z - q[2]) * t]);
    }
    tubeRigged(b, pts, 0.065, 4);
  }
  b.rig(RIG.STATIC);
}

function tubeRigged(b: HB, pts: V3[], r: number, seg: number): void {
  // per-ring rig weight (0 at the bollard, 1 at the ship)
  const n = pts.length;
  const base = b.count;
  const t = new THREE.Vector3(),
    s = new THREE.Vector3(),
    u = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const pa = pts[Math.max(0, i - 1)],
      pb = pts[Math.min(n - 1, i + 1)];
    t.set(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
    s.crossVectors(t, up).normalize();
    u.crossVectors(s, t).normalize();
    b.rig(RIG.SHIP, 0, i / (n - 1));
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const nx = s.x * Math.cos(a) + u.x * Math.sin(a),
        ny = s.y * Math.cos(a) + u.y * Math.sin(a),
        nz = s.z * Math.cos(a) + u.z * Math.sin(a);
      b.vtx(pts[i][0] + nx * r, pts[i][1] + ny * r, pts[i][2] + nz * r, nx, ny, nz);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const a0 = base + i * (seg + 1),
      b0 = a0 + seg + 1;
    for (let k = 0; k < seg; k++) {
      b.tri(a0 + k, b0 + k, b0 + k + 1);
      b.tri(a0 + k, b0 + k + 1, a0 + k + 1);
    }
  }
}

/** Mushroom bollard (static) */
export function bollard(b: HB, x: number, y: number, z: number): void {
  castBollard(b, x, y, z);
}

/** Quay furniture: bollards along the edge, hanging fenders on the wall face, floating fenders by the ship. */
export function buildQuayEdge(b: HB, quayX: number, z0: number, z1: number, avoid: number[], shipZ: [number, number]): { bollards: number[] } {
  const bz: number[] = [];
  for (let z = z0 + 2; z <= z1 - 2; z += 13) bz.push(z);
  for (const z of bz) bollard(b, quayX - 0.2, 0.12, z);
  // hanging rubber fenders on the wall face (not over the ladders)
  for (let z = z0 + 5; z <= z1 - 3; z += 6.5) {
    if (avoid.some((a) => Math.abs(a - z) < 1.4)) continue;
    b.color('#26282b');
    b.cyl([quayX + 0.3, -1.45, z], [quayX + 0.3, -0.05, z], 0.27, 0.27, 8, 3);
    b.color('#3b3d40');
    b.box(quayX + 0.12, 0.05, z, 0.3, 0.1, 0.12, 0, 0);
  }
  // floating pneumatic fenders between the quay and the ship's side
  for (let z = shipZ[0] + 8; z <= shipZ[1] - 8; z += 14.5) {
    b.color('#2a2c2f');
    b.cyl([quayX + 1.35, -1.25, z - 1.6], [quayX + 1.35, -1.25, z + 1.6], 0.9, 0.9, 12, 0);
    b.sphere(quayX + 1.35, -1.25, z - 1.6, 0.9, 10, 6, 1);
    b.sphere(quayX + 1.35, -1.25, z + 1.6, 0.9, 10, 6, 1);
    b.color('#4a4d50');
    for (let k = -1; k <= 1; k++) b.cyl([quayX + 1.35, -1.25, z + k * 1.1 - 0.06], [quayX + 1.35, -1.25, z + k * 1.1 + 0.06], 0.93, 0.93, 12, 0);
  }
  return { bollards: bz };
}

export { CW };
