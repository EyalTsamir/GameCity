// Stonework and ironwork of the places between buildings (layout: core/places.ts). Drawn into the
// terrain's existing merged meshes — stone into the masonry mesh, iron into the railing mesh — so the
// places cost triangles but no draw calls:
//   * lower quay: the quay body in front of the north river wall (ashlar water face, paved top, coping
//     edge), two landings flush with the wall coping, two flights with an iron handrail, mooring bollards
//   * old-town lane: paved square + archway floor, the raised terrace (gravel with paved walks) behind an
//     ashlar retaining wall with coping and a balustrade, the recessed flight, the stepped lane, and the
//     gatehouse over the passage (plastered, stone arch ring, barrel-vaulted soffit, windows, tiled roof,
//     a lantern on each face)
// Quality: on 'low' (or ?noplacedetail) balustrades are solid parapets and the gatehouse has no arch ring
// or windows.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Rect } from '../../core/geom';
import { stairY, type LanePlace, type PlaceStair, type QuayPlace } from '../../core/places';
import type { GeoBuilder, V3 } from './builder';
import type { TerrainModel } from './height';
import { KIND } from './kinds';
import type { GlowPoint } from './glow';

const C = (h: string) => new THREE.Color(h);
const COL = {
  quayStone: C('#bfb3a0'),
  quayTop: C('#b6ab98'),
  coping: C('#d5cfc3'),
  step: C('#cdc4b4'),
  paving: C('#c4b59c'),
  gravel: C('#cdbf9f'),
  wall: C('#b3a48b'),
  plaster: C('#e2cfa9'),
  arch: C('#cbbfa8'),
  window: C('#2b2826'),
  sill: C('#d9cfbe'),
  roof: C('#a65b3f'),
  lamp: C('#ffd59a'),
};
const IRON = C('#2f4a3e');
const IRON_HI = C('#3d5d4f');
const BOLLARD = C('#2e2f2d');

/** quad over a horizontal rect at height y (upward normal) */
function top(b: GeoBuilder, r: Rect, y: number): void {
  b.quadFacing([r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1], 0, 1, 0);
}

/** box spanning a rect between two heights; `skip` as GeoBuilder.box (1=-x 2=+x 4=-y 8=+y 16=-z 32=+z) */
function slab(b: GeoBuilder, r: Rect, y0: number, y1: number, skip = 4): void {
  b.box((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (y1 - y0) / 2, (r.z1 - r.z0) / 2, 0, skip);
}

/** the treads of a flight as columns standing on `base` (risers face down the flight) */
function flight(b: GeoBuilder, s: PlaceStair, base: number, sideCol: THREE.Color): void {
  const r = s.rect;
  const L = s.axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
  const t = L / s.n;
  // tread joints run across the flight: blocks along the tread length
  const tx = s.axis === 'x' ? 0 : 1,
    tz = s.axis === 'x' ? 1 : 0;
  for (let i = 0; i < s.n; i++) {
    const u0 = i * t,
      u1 = (i + 1) * t;
    let q: Rect;
    if (s.axis === 'x') q = s.up > 0 ? { x0: r.x0 + u0, x1: r.x0 + u1, z0: r.z0, z1: r.z1 } : { x0: r.x1 - u1, x1: r.x1 - u0, z0: r.z0, z1: r.z1 };
    else q = s.up > 0 ? { z0: r.z0 + u0, z1: r.z0 + u1, x0: r.x0, x1: r.x1 } : { z0: r.z1 - u1, z1: r.z1 - u0, x0: r.x0, x1: r.x1 };
    const y = s.yBot + ((s.yTop - s.yBot) * (i + 1)) / s.n;
    b.color(COL.step).set('aMas', KIND.coping, 0, tx, tz);
    // nosing: the tread overhangs its riser by 3 cm
    const nose = 0.03;
    const qn: Rect = { ...q };
    if (s.axis === 'x') {
      if (s.up > 0) qn.x0 -= nose;
      else qn.x1 += nose;
    } else if (s.up > 0) qn.z0 -= nose;
    else qn.z1 += nose;
    slab(b, qn, y - 0.06, y, 4);
    b.color(sideCol).set('aMas', KIND.ashlar, 0.3, tx, tz);
    slab(b, q, base, y - 0.06, 4 | 8);
  }
}

// ─────────────────────────────────────────────────────────── lower quay ──

function quayStone(b: GeoBuilder, q: QuayPlace, model: TerrainModel): void {
  const bed = (x: number) => model.height(x, q.zEdge + 0.4) - 0.35;
  const cop = 0.45;
  const yC = q.y - 0.16;
  // paved top (slab rows along the quay)
  b.color(COL.quayTop).set('aMas', KIND.ashlar, 0.75, 1, 0);
  top(b, { x0: q.x0, x1: q.x1, z0: q.zWall - 0.02, z1: q.zEdge - cop }, q.y);
  // coping along the water edge (light, jointed blocks), slightly proud of the face
  b.color(COL.coping).set('aMas', KIND.coping, 0, 1, 0);
  slab(b, { x0: q.x0 - 0.06, x1: q.x1 + 0.06, z0: q.zEdge - cop, z1: q.zEdge + 0.07 }, yC, q.y, 0);
  // water face + ends (ashlar, the shader adds the wet band and algae at the waterline)
  b.color(COL.quayStone).set('aMas', KIND.ashlar, 0.52, 1, 0);
  const n = Math.ceil((q.x1 - q.x0) / 4);
  for (let i = 0; i < n; i++) {
    const xa = q.x0 + ((q.x1 - q.x0) * i) / n,
      xb = q.x0 + ((q.x1 - q.x0) * (i + 1)) / n;
    b.quadFacing([xa, bed(xa), q.zEdge], [xb, bed(xb), q.zEdge], [xb, yC, q.zEdge], [xa, yC, q.zEdge], 0, 0, 1);
  }
  for (const [x, s] of [
    [q.x0, -1],
    [q.x1, 1],
  ] as [number, number][]) {
    b.set('aMas', KIND.ashlar, 0.52, 0, 1);
    b.quadFacing([x, bed(x), q.zWall - 0.02], [x, bed(x), q.zEdge], [x, q.y, q.zEdge], [x, q.y, q.zWall - 0.02], s, 0, 0);
  }
  // landings: flush with the wall coping (their top meets the promenade over the wall)
  for (const l of q.landings) {
    b.color(COL.step).set('aMas', KIND.coping, 0, 0, 1);
    slab(b, { x0: l.x0, x1: l.x1, z0: q.zWall - 0.02, z1: l.z1 }, q.landingY - 0.08, q.landingY, 4 | 16);
    b.color(COL.quayStone).set('aMas', KIND.ashlar, 0.3, 1, 0);
    slab(b, { x0: l.x0, x1: l.x1, z0: q.zWall - 0.02, z1: l.z1 }, q.y, q.landingY - 0.08, 4 | 8 | 16);
  }
  for (const s of q.stairs) flight(b, s, q.y, COL.quayStone);
}

function quayIron(b: GeoBuilder, q: QuayPlace): void {
  const zr = q.zCheek - 0.06;
  for (let k = 0; k < q.stairs.length; k++) {
    const s = q.stairs[k];
    const l = q.landings[k];
    // rail line: over the landing, then down the nosings to the quay
    const xa = s.up < 0 ? l.x0 + 0.1 : l.x1 - 0.1;
    const xTop = s.up < 0 ? s.rect.x0 : s.rect.x1;
    const xBot = s.up < 0 ? s.rect.x1 : s.rect.x0;
    const hTop = q.landingY + 0.95,
      hBot = q.y + 0.95;
    b.color(IRON_HI);
    b.beam(xa, hTop, zr, xTop, hTop, zr, 0.06, 0.05);
    b.beam(xTop, hTop, zr, xBot, hBot, zr, 0.06, 0.05);
    b.color(IRON);
    b.beam(xa, q.landingY + 0.5, zr, xTop, q.landingY + 0.5, zr, 0.035, 0.035);
    b.beam(xTop, q.landingY + 0.5, zr, xBot, q.y + 0.5, zr, 0.035, 0.035);
    const zm = (s.rect.z0 + s.rect.z1) / 2;
    const onLanding = (px: number) => (px - xTop) * (xBot - xTop) <= 1e-6;
    for (const px of [xa, xTop, (xTop + xBot) / 2, xBot]) {
      const y0 = onLanding(px) ? q.landingY : stairY(s, Math.min(Math.max(px, s.rect.x0 + 0.01), s.rect.x1 - 0.01), zm);
      const yt = onLanding(px) ? hTop : hTop + ((hBot - hTop) * (px - xTop)) / (xBot - xTop);
      b.box(px, (y0 + yt) / 2, zr, 0.035, (yt - y0) / 2, 0.035, 0, 4);
    }
  }
  // mooring bollards on the coping
  for (const p of q.bollards) {
    b.color(BOLLARD);
    b.box(p.x, q.y + 0.26, p.z, 0.13, 0.26, 0.13, Math.PI / 8, 4);
    b.box(p.x, q.y + 0.55, p.z, 0.17, 0.04, 0.17, Math.PI / 8, 4);
  }
}

// ─────────────────────────────────────────────────────── old-town lane ──

/** stone balustrade along a line (a→b at height y): pedestals, balusters (or a solid parapet), handrail */
function balustrade(b: GeoBuilder, ax: number, az: number, bx: number, bz: number, y: number, hi: boolean): void {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.4) return;
  const ux = (bx - ax) / L,
    uz = (bz - az) / L;
  const yaw = Math.atan2(ux, uz);
  const H = 0.86;
  const nPed = Math.max(1, Math.round(L / 2.6));
  b.color(COL.coping).set('aMas', KIND.coping, 0, ux, uz);
  // handrail + plinth
  b.box((ax + bx) / 2, y + H - 0.06, (az + bz) / 2, 0.17, 0.06, L / 2 + 0.03, yaw, 0);
  b.box((ax + bx) / 2, y + 0.07, (az + bz) / 2, 0.15, 0.07, L / 2, yaw, 4);
  for (let i = 0; i <= nPed; i++) {
    const t = (i / nPed) * L;
    b.box(ax + ux * t, y + (H - 0.12) / 2, az + uz * t, 0.15, (H - 0.12) / 2, 0.15, yaw, 4 | 8);
  }
  if (!hi) {
    b.color(COL.wall).set('aMas', KIND.ashlar, 0.24, ux, uz);
    b.box((ax + bx) / 2, y + H / 2, (az + bz) / 2, 0.09, H / 2 - 0.12, L / 2, yaw, 4 | 8);
    return;
  }
  b.color(COL.arch).set('aMas', KIND.plain, 0, ux, uz);
  const seg = L / nPed;
  for (let i = 0; i < nPed; i++) {
    const m = Math.max(1, Math.floor((seg - 0.3) / 0.27));
    for (let k = 0; k < m; k++) {
      const t = i * seg + 0.15 + (seg - 0.3) * ((k + 0.5) / m);
      const x = ax + ux * t,
        z = az + uz * t;
      // vase-shaped baluster from three stacked blocks
      b.box(x, y + 0.2, z, 0.06, 0.06, 0.06, yaw + Math.PI / 4, 4 | 8);
      b.box(x, y + 0.42, z, 0.085, 0.16, 0.085, yaw + Math.PI / 4, 4 | 8);
      b.box(x, y + 0.67, z, 0.05, 0.09, 0.05, yaw + Math.PI / 4, 4 | 8);
    }
  }
}

function laneStone(b: GeoBuilder, P: LanePlace, hi: boolean, lights: GlowPoint[]): void {
  const s = P.stair;
  // square + archway floor: paving flush with the sidewalk
  b.color(COL.paving).set('aMas', KIND.ashlar, 0.45, 1, 0);
  top(b, P.square, P.squareY);
  b.set('aMas', KIND.ashlar, 0.45, 0, 1);
  top(b, P.passage, P.squareY);
  // terrace top: gravel with paved walks (0.5 m cells merged into runs along x)
  const T = P.terrace;
  const tz = (T.z0 + P.wallZ) / 2 - 0.5;
  const sx = (s.rect.x0 + s.rect.x1) / 2,
    nx = (P.lane.x0 + P.lane.x1) / 2;
  const paved = (x: number, z: number) => Math.abs(z - tz) < 1.2 || (Math.abs(x - sx) < 1.3 && z > tz) || (Math.abs(x - nx) < 1.1 && z < tz);
  const cell = 0.5;
  for (let z = T.z0; z < T.z1 - 1e-6; z += cell) {
    const zc = z + cell / 2;
    let runStart = T.x0;
    let runKind = -1;
    const flush = (x1: number) => {
      if (runKind < 0 || x1 - runStart < 1e-6) return;
      if (runKind === 1) b.color(COL.paving).set('aMas', KIND.ashlar, 0.45, 1, 0);
      else b.color(COL.gravel).set('aMas', KIND.plain, 0, 1, 0);
      top(b, { x0: runStart, x1, z0: z, z1: Math.min(z + cell, T.z1) }, P.terraceY);
    };
    for (let x = T.x0; x < T.x1 - 1e-6; x += cell) {
      const xc = x + cell / 2;
      const inRecess = xc > s.rect.x0 && xc < s.rect.x1 && zc > s.rect.z0;
      const k = inRecess ? -2 : paved(xc, zc) ? 1 : 0;
      if (k !== runKind) {
        flush(x);
        runStart = x;
        runKind = k;
      }
    }
    flush(T.x1);
  }
  // retaining wall (south face of the terrace) on both sides of the flight, coping, balustrade
  b.color(COL.wall).set('aMas', KIND.ashlar, 0.3, 1, 0);
  const w = P.wallZ;
  for (const [x0, x1] of [
    [T.x0, s.rect.x0],
    [s.rect.x1, T.x1],
  ] as [number, number][]) {
    b.quadFacing([x0, P.squareY - 0.02, w], [x1, P.squareY - 0.02, w], [x1, P.terraceY - 0.1, w], [x0, P.terraceY - 0.1, w], 0, 0, 1);
    b.color(COL.coping).set('aMas', KIND.coping, 0, 1, 0);
    slab(b, { x0, x1, z0: w - 0.36, z1: w + 0.07 }, P.terraceY - 0.1, P.terraceY + 0.04, 4);
    b.color(COL.wall).set('aMas', KIND.ashlar, 0.3, 1, 0);
    balustrade(b, x0 + 0.15, w - 0.17, x1 - 0.15, w - 0.17, P.terraceY + 0.04, hi);
  }
  // recess cheeks (terrace body faces beside the flight) + their balustrades down to the wall line
  b.color(COL.wall).set('aMas', KIND.ashlar, 0.3, 0, 1);
  for (const [x, nxs] of [
    [s.rect.x0, 1],
    [s.rect.x1, -1],
  ] as [number, number][]) {
    b.quadFacing([x, P.squareY, s.rect.z0], [x, P.squareY, w], [x, P.terraceY, w], [x, P.terraceY, s.rect.z0], nxs, 0, 0);
    const bx = x - nxs * 0.17;
    balustrade(b, bx, s.rect.z0 + 0.1, bx, w - 0.34, P.terraceY + 0.04, hi);
  }
  flight(b, s, P.squareY - 0.02, COL.wall);
  // the stepped lane: floors on their bodies, two flights
  b.color(COL.paving).set('aMas', KIND.ashlar, 0.4, 0, 1);
  const L = P.lane;
  const [fA, fB] = P.laneStairs;
  const lfloors: [Rect, number][] = [
    [{ x0: L.x0, x1: L.x1, z0: fA.rect.z1, z1: T.z0 + 0.02 }, P.terraceY],
    [{ x0: L.x0, x1: L.x1, z0: fB.rect.z1, z1: fA.rect.z0 }, fA.yBot],
    [{ x0: L.x0, x1: L.x1, z0: L.z0, z1: fB.rect.z0 }, P.squareY],
  ];
  for (const [r, y] of lfloors) {
    b.color(COL.paving).set('aMas', KIND.ashlar, 0.4, 0, 1);
    top(b, r, y);
    if (y > P.squareY + 0.01) {
      b.color(COL.wall).set('aMas', KIND.ashlar, 0.3, 1, 0);
      slab(b, r, 0, y - 0.001, 4 | 8 | 1 | 2);
    }
  }
  flight(b, fA, 0, COL.wall);
  flight(b, fB, 0, COL.wall);
  gatehouse(b, P, hi, lights);
}

function gatehouse(b: GeoBuilder, P: LanePlace, hi: boolean, lights: GlowPoint[]): void {
  const g = P.gate;
  const inset = 0.16; // the townhouse walls stand this far inside their footprints (buildings/anchors.ts)
  const X0 = g.rect.x0 - inset,
    X1 = g.rect.x1 + inset;
  const zF = g.rect.z1 - inset, // street face
    zB = g.rect.z0 + inset; // court face
  const xc = (X0 + X1) / 2;
  const R = (X1 - X0) / 2 - 0.1;
  const spring = g.spring,
    crown = spring + R;
  const ring = hi ? 0.36 : 0;
  const yTop = crown + ring + 0.25;
  const eave = Math.max(g.eave, yTop + 2.4);
  const SEG = 14;
  const arc: [number, number][] = [];
  for (let k = 0; k <= SEG; k++) {
    const a = Math.PI - (k / SEG) * Math.PI;
    arc.push([Math.cos(a), Math.sin(a)]);
  }
  for (const [z, nz] of [
    [zF, 1],
    [zB, -1],
  ] as [number, number][]) {
    const Q = (x0: number, y0: number, x1: number, y1: number) => b.quadFacing([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], 0, 0, nz);
    // jambs (narrow stone strips against the neighbours) up to the springing
    b.color(COL.arch).set('aMas', KIND.ashlar, 0.42, 1, 0);
    Q(X0, P.squareY, X0 + 0.1, spring);
    Q(X1 - 0.1, P.squareY, X1, spring);
    // arch ring (voussoirs) and the spandrel above it
    for (let k = 0; k < SEG; k++) {
      const [c0, s0] = arc[k],
        [c1, s1] = arc[k + 1];
      const p0: V3 = [xc + c0 * R, spring + s0 * R, z],
        p1: V3 = [xc + c1 * R, spring + s1 * R, z];
      if (ring > 0) {
        const q0: V3 = [xc + c0 * (R + ring), spring + s0 * (R + ring), z],
          q1: V3 = [xc + c1 * (R + ring), spring + s1 * (R + ring), z];
        b.color(COL.arch).set('aMas', KIND.coping, 0, 1, 0);
        b.quadFacing(p0, p1, q1, q0, 0, 0, nz);
        b.color(COL.plaster).set('aMas', KIND.plain, 0, 1, 0);
        b.quadFacing(q0, q1, [q1[0], yTop, z], [q0[0], yTop, z], 0, 0, nz);
      } else {
        b.color(COL.plaster).set('aMas', KIND.plain, 0, 1, 0);
        b.quadFacing(p0, p1, [p1[0], yTop, z], [p0[0], yTop, z], 0, 0, nz);
      }
    }
    b.color(COL.plaster).set('aMas', KIND.plain, 0, 1, 0);
    Q(X0, spring, xc - R - ring, yTop);
    Q(xc + R + ring, spring, X1, yTop);
    Q(X0, yTop, X1, eave);
    // windows above the arch, one per storey
    if (hi) {
      for (let y = yTop + 0.75; y + 1.45 < eave - 0.45; y += 3.3) {
        b.color(COL.window).set('aMas', KIND.dark, 0, 1, 0);
        b.quadFacing([xc - 0.48, y, z + nz * 0.02], [xc + 0.48, y, z + nz * 0.02], [xc + 0.48, y + 1.45, z + nz * 0.02], [xc - 0.48, y + 1.45, z + nz * 0.02], 0, 0, nz);
        b.color(COL.sill).set('aMas', KIND.coping, 0, 1, 0);
        b.box(xc, y - 0.05, z + nz * 0.07, 0.6, 0.05, 0.08, 0, 4);
        b.box(xc, y + 1.5, z + nz * 0.05, 0.58, 0.05, 0.06, 0, 4);
      }
    }
    // a lantern on a bracket above the arch
    const ly = crown + ring + 0.1;
    const lx = xc + R * 0.82;
    b.color(IRON).set('aMas', KIND.dark, 0, 1, 0);
    b.box(lx, ly + 0.55, z + nz * 0.22, 0.025, 0.025, 0.22, 0, 0);
    b.color(COL.lamp).set('aMas', KIND.lamp, 0, 1, 0);
    b.box(lx, ly + 0.36, z + nz * 0.42, 0.09, 0.15, 0.09, Math.PI / 4, 0);
    lights.push({ x: lx, y: ly + 0.36, z: z + nz * 0.42, size: 0.8, kind: 'halo', color: '#ffd08c', intensity: 0.9 });
  }
  // barrel-vaulted soffit through the passage (facing down / inwards)
  b.color(COL.plaster.clone().multiplyScalar(0.9)).set('aMas', KIND.plain, 0, 1, 0);
  for (let k = 0; k < SEG; k++) {
    const [c0, s0] = arc[k],
      [c1, s1] = arc[k + 1];
    const cm = -(c0 + c1) / 2,
      sm = -(s0 + s1) / 2;
    b.quadFacing([xc + c0 * R, spring + s0 * R, zB], [xc + c1 * R, spring + s1 * R, zB], [xc + c1 * R, spring + s1 * R, zF], [xc + c0 * R, spring + s0 * R, zF], cm, sm, 0);
  }
  // tiled roof, ridge along the row (like its neighbours), gable ends against them
  const ov = 0.35;
  const zm = (zF + zB) / 2;
  const rise = Math.min(3.2, (zF - zB) * 0.27);
  b.color(COL.roof).set('aMas', KIND.plain, 0, 1, 0);
  b.quadFacing([X0, eave - 0.12, zF + ov], [X1, eave - 0.12, zF + ov], [X1, eave + rise, zm], [X0, eave + rise, zm], 0, 0.9, 0.4);
  b.quadFacing([X0, eave - 0.12, zB - ov], [X1, eave - 0.12, zB - ov], [X1, eave + rise, zm], [X0, eave + rise, zm], 0, 0.9, -0.4);
  b.color(COL.plaster).set('aMas', KIND.plain, 0, 1, 0);
  for (const [x, sx] of [
    [X0, -1],
    [X1, 1],
  ] as [number, number][]) {
    b.polygonFacing([[x, eave, zF], [x, eave, zB], [x, eave + rise - 0.1, zm]], [[zF, eave], [zB, eave], [zm, eave + rise - 0.1]], sx, 0, 0);
  }
}

function laneIron(b: GeoBuilder, P: LanePlace): void {
  // wall-mounted handrails along the west side of the lane flights
  const x = P.lane.x0 + 0.07;
  for (const s of P.laneStairs) {
    const zb = s.rect.z0 - 0.3,
      zt = s.rect.z1 + 0.3;
    b.color(IRON_HI);
    b.beam(x, s.yBot + 0.92, zb, x, s.yTop + 0.92, zt, 0.05, 0.05);
    b.color(IRON);
    for (const z of [zb + 0.1, zt - 0.1]) b.beam(x - 0.06, s.yBot + 0.92 + ((s.yTop - s.yBot) * (z - zb)) / (zt - zb), z, x, s.yBot + 0.92 + ((s.yTop - s.yBot) * (z - zb)) / (zt - zb), z, 0.03, 0.03);
  }
}

// ─────────────────────────────────────────────────────────────── API ──

function detail(ctx: CityContext): boolean {
  return ctx.quality.level !== 'low' && !ctx.debug.params.has('noplacedetail');
}

/** stonework of every place into the masonry builder; lantern glows are appended to `lights` */
export function buildPlacesStone(b: GeoBuilder, ctx: CityContext, model: TerrainModel, lights: GlowPoint[]): void {
  const pl = ctx.plan.places;
  if (!pl) return;
  if (pl.quay) quayStone(b, pl.quay, model);
  if (pl.lane) laneStone(b, pl.lane, detail(ctx), lights);
}

/** ironwork (handrails, bollards) into the railing builder */
export function buildPlacesIron(b: GeoBuilder, ctx: CityContext): void {
  const pl = ctx.plan.places;
  if (!pl) return;
  if (pl.quay) quayIron(b, pl.quay);
  if (pl.lane) laneIron(b, pl.lane);
}
