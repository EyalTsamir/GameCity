// Static track geometry: ballast bed, sleepers, rails (sinking flush into the level-crossing
// decks), crossing panels, overhead-line masts with cantilevers (+ the wires as one
// LineSegments), lineside fences and colour-light signals. Everything goes into the shared
// rail Geo (one draw call); the wires are returned as line positions.

import type { CityPlan } from '../../core/plan';
import type { Rng } from '../../core/rng';
import { Geo } from './geo';
import { K } from './staticMaterial';
import { GAUGE, PANEL_TOP, RAIL_H, BALLAST_DROP, XING_HALF, XING_RAMP, WIRE_H, RAIL_TOP, type RailProfile } from './profile';

export interface SignalDef {
  /** 0 west home (eastbound), 1 east home (westbound), 2 west starter (westbound), 3 east starter (eastbound) */
  id: number;
  x: number;
  /** direction of the trains this signal governs (+1 eastbound, -1 westbound) */
  dir: number;
}

export interface TrackBuild {
  /** sleeper centres along x (for the near-only fixings, buildTrackFixings) */
  sleepers: number[];
  wires: number[];
  masts: number[];
  signals: SignalDef[];
}

const COL = {
  ballast: '#8b8478',
  ballastEdge: '#7d766b',
  sleeper: '#5b4a3d',
  sleeperOld: '#6b6158',
  basePlate: '#4a3c33',
  clip: '#5d554c',
  railSide: '#6c5649',
  railHead: '#cfd1d2',
  panel: '#9d998f',
  panelEdge: '#7c7870',
  flange: '#2c2b29',
  mast: '#6e7c74',
  mastFoot: '#a9a59c',
  insulator: '#8a4a35',
  tube: '#8d9396',
  fencePost: '#b3ad9f',
  fenceRail: '#7a6248',
  signalMast: '#5f6466',
  signalHead: '#1f2224',
  plate: '#f1efe8',
  plateRed: '#c8372d',
  cabinet: '#a9aea5',
};

/**
 * `g` receives the low, shadow-receiving track bed; `gt` the tall, shadow-casting lineside
 * furniture; `gd` the level-crossing decks (drawn with a polygon offset so they win over the
 * road markings painted on the same asphalt).
 */
export function buildTrack(g: Geo, gt: Geo, gd: Geo, plan: CityPlan, prof: RailProfile, rng: Rng): TrackBuild {
  const zc = prof.z;
  const x0 = prof.x0,
    x1 = prof.x1;
  const xings = prof.crossings;
  const inDeck = (x: number) => xings.some((xc) => Math.abs(x - xc) < XING_HALF);
  // sample stations along x: dense in the crossing ramps, coarse elsewhere
  const xsSet: number[] = [x0];
  for (let x = x0; x < x1; ) {
    const near = xings.some((xc) => Math.abs(x - xc) < XING_HALF + XING_RAMP + 1);
    x += near ? 0.75 : 4;
    xsSet.push(Math.min(x, x1));
  }
  for (const xc of xings) xsSet.push(xc - XING_HALF, xc + XING_HALF);
  const xs = [...new Set(xsSet.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);

  // ── ballast bed (trapezoid), cut at the crossing decks
  const bedHalfTop = 1.62,
    bedHalfBot = 2.4;
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i],
      xb = xs[i + 1];
    const xm = (xa + xb) / 2;
    if (inDeck(xm)) continue;
    const ya = Math.max(0.03, prof.top(xa) - BALLAST_DROP),
      yb = Math.max(0.03, prof.top(xb) - BALLAST_DROP);
    const j = 0.94 + rng.next() * 0.1;
    g.kind(K.BALLAST);
    g.color(COL.ballast, j);
    // top
    g.quad([xa, ya, zc + bedHalfTop], [xb, yb, zc + bedHalfTop], [xb, yb, zc - bedHalfTop], [xa, ya, zc - bedHalfTop]);
    g.color(COL.ballastEdge);
    // shoulders
    g.quad([xa, -0.02, zc + bedHalfBot], [xb, -0.02, zc + bedHalfBot], [xb, yb, zc + bedHalfTop], [xa, ya, zc + bedHalfTop]);
    g.quad([xb, -0.02, zc - bedHalfBot], [xa, -0.02, zc - bedHalfBot], [xa, ya, zc - bedHalfTop], [xb, yb, zc - bedHalfTop]);
  }
  // bed end faces at the crossing decks (vertical, facing the road)
  g.kind(K.CONCRETE).color('#a8a398');
  for (const xc of xings) {
    for (const s of [-1, 1]) {
      const x = xc + s * XING_HALF;
      const y = Math.max(0.03, prof.top(x + s * 0.01) - BALLAST_DROP);
      // concrete edge beam
      g.push().at(x + s * 0.12, 0, zc);
      g.box(0, (y + 0.012) / 2, 0, 0.24, y + 0.06, bedHalfBot * 2 + 0.2, 8);
      g.pop();
    }
  }

  // ── sleepers: hand-laid timber, a little irregular in spacing and squareness, each its own weathered tone
  g.kind(K.SLEEPER);
  const sleepers: number[] = [];
  for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.65) {
    if (xings.some((xc) => Math.abs(x - xc) < XING_HALF + 0.2)) continue;
    const sx = x + (rng.next() - 0.5) * 0.05;
    const top = prof.top(sx) - RAIL_H;
    const j = 0.8 + rng.next() * 0.32;
    g.color(rng.next() < 0.18 ? COL.sleeperOld : COL.sleeper, j);
    g.push().at(sx, 0, zc + (rng.next() - 0.5) * 0.04, (rng.next() - 0.5) * 0.022);
    g.box(0, top - 0.06, 0, 0.24 + rng.next() * 0.03, 0.12, 2.5 + rng.next() * 0.1, 8);
    g.pop();
    sleepers.push(sx);
  }

  // ── rails (head + web/foot), following the vertical profile
  const gMain = g;
  for (const side of [-1, 1]) {
    const rz = zc + side * (GAUGE / 2);
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i],
        xb = xs[i + 1];
      const ta = prof.top(xa),
        tb = prof.top(xb);
      g = inDeck((xa + xb) / 2) ? gd : gMain;
      // web + foot (one box section)
      g.kind(K.PLAIN).color(COL.railSide);
      g.quad([xa, ta - RAIL_H, rz + 0.035], [xb, tb - RAIL_H, rz + 0.035], [xb, tb - 0.035, rz + 0.035], [xa, ta - 0.035, rz + 0.035]);
      g.quad([xb, tb - RAIL_H, rz - 0.035], [xa, ta - RAIL_H, rz - 0.035], [xa, ta - 0.035, rz - 0.035], [xb, tb - 0.035, rz - 0.035]);
      // foot flanges
      g.quad([xa, ta - RAIL_H + 0.012, rz + 0.075], [xb, tb - RAIL_H + 0.012, rz + 0.075], [xb, tb - RAIL_H + 0.012, rz - 0.075], [xa, ta - RAIL_H + 0.012, rz - 0.075]);
      // head sides
      g.color('#77655a');
      g.quad([xa, ta - 0.035, rz + 0.038], [xb, tb - 0.035, rz + 0.038], [xb, tb, rz + 0.038], [xa, ta, rz + 0.038]);
      g.quad([xb, tb - 0.035, rz - 0.038], [xa, ta - 0.035, rz - 0.038], [xa, ta, rz - 0.038], [xb, tb, rz - 0.038]);
      // polished running surface
      g.kind(K.RAILHEAD).color(COL.railHead);
      g.quad([xa, ta, rz + 0.038], [xb, tb, rz + 0.038], [xb, tb, rz - 0.038], [xa, ta, rz - 0.038]);
    }
  }
  g = gd;

  // ── level-crossing decks (panels between and beside the rails, flush with the rail heads)
  for (const xc of xings) {
    const xa = xc - XING_HALF,
      xb = xc + XING_HALF;
    const strips: [number, number][] = [
      [zc - 2.45, zc - GAUGE / 2 - 0.1],
      [zc - GAUGE / 2 + 0.1, zc + GAUGE / 2 - 0.1],
      [zc + GAUGE / 2 + 0.1, zc + 2.45],
    ];
    for (const [za, zb] of strips) {
      // individual panels (1.2 m) with slightly varied tone
      const n = Math.round((xb - xa) / 1.25);
      for (let k = 0; k < n; k++) {
        const pa = xa + ((xb - xa) * k) / n,
          pb = xa + ((xb - xa) * (k + 1)) / n;
        const j = 0.93 + rng.next() * 0.1;
        g.kind(K.CONCRETE).color(COL.panel, j);
        g.box((pa + pb) / 2, PANEL_TOP / 2 - 0.004, (za + zb) / 2, pb - pa - 0.03, PANEL_TOP + 0.008, zb - za, 8);
      }
    }
    // dark flangeways (just inside each rail)
    g.kind(K.PLAIN).color(COL.flange);
    for (const side of [-1, 1]) {
      const rz = zc + side * (GAUGE / 2);
      const fz = rz - side * 0.068;
      g.quad([xa, 0.036, fz + 0.03], [xb, 0.036, fz + 0.03], [xb, 0.036, fz - 0.03], [xa, 0.036, fz - 0.03]);
    }
    // painted edge of the deck (white chevrons are a road matter; we add a thin kerb line)
    g.kind(K.CONCRETE).color(COL.panelEdge);
    for (const s of [-1, 1]) {
      const z = zc + s * 2.47;
      g.box(xc, PANEL_TOP / 2, z, xb - xa, PANEL_TOP + 0.01, 0.06, 8);
    }
  }

  g = gMain;
  // ── catenary masts (north side), avoiding crossings and portal mouths
  const zm = zc - 3.05;
  const masts: number[] = [];
  const blocked = (x: number) => xings.some((xc) => Math.abs(x - xc) < 7.5) || x < plan.rail.portalW + 5 || x > plan.rail.portalE - 4.5;
  {
    const start = plan.rail.portalW + 6;
    const end = plan.rail.portalE - 5;
    const span = 27;
    const n = Math.round((end - start) / span);
    for (let i = 0; i <= n; i++) {
      let x = start + ((end - start) * i) / n;
      // nudge out of blocked zones
      for (let k = 0; k < 20 && blocked(x); k++) x += x < 0 ? 0.9 : -0.9;
      if (!blocked(x)) masts.push(x);
    }
    // a pair of masts framing each crossing
    for (const xc of xings) {
      for (const s of [-1, 1]) {
        const x = xc + s * 8;
        if (x > plan.rail.portalW + 5 && x < plan.rail.portalE - 4.5 && !masts.some((m) => Math.abs(m - x) < 8)) masts.push(x);
      }
    }
    masts.sort((a, b) => a - b);
  }
  const cwY = (x: number) => prof.top(x) + WIRE_H;
  const msY = (x: number) => RAIL_TOP + WIRE_H + 1.15 + 0 * x;
  for (let i = 0; i < masts.length; i++) {
    const x = masts[i];
    const stag = i % 2 === 0 ? 0.22 : -0.22;
    const topY = msY(x) + 0.75;
    // foundation
    gt.kind(K.CONCRETE).color(COL.mastFoot);
    gt.block(x, -0.05, zm, 0.62, 0.3, 0.62);
    // H-section mast (flanges + web)
    gt.kind(K.PLAIN).color(COL.mast);
    gt.block(x, 0.25, zm - 0.11, 0.26, topY - 0.25, 0.04);
    gt.block(x, 0.25, zm + 0.11, 0.26, topY - 0.25, 0.04);
    gt.block(x, 0.25, zm, 0.05, topY - 0.25, 0.18, 8 | 1 | 2);
    gt.block(x, topY, zm, 0.32, 0.06, 0.3);
    // cantilever: top tube + diagonal + registration arm
    gt.color(COL.tube);
    const yTop = msY(x);
    const yLow = cwY(x) + 0.28;
    const zEnd = zc + stag + 0.55;
    gt.rod([x, yTop, zm + 0.12], [x, yTop, zEnd], 0.035, 6);
    gt.rod([x, yLow, zm + 0.12], [x, yTop - 0.05, zc + stag + 0.35], 0.03, 6);
    // registration arm to the contact wire
    gt.rod([x, yLow + 0.05, zc + stag + 0.05], [x, cwY(x) + 0.02, zc + stag], 0.018, 4);
    // insulators
    gt.color(COL.insulator);
    gt.rod([x, yTop, zm + 0.14], [x, yTop, zm + 0.5], 0.06, 7, 0);
    gt.rod([x, yLow, zm + 0.14], [x, yLow + 0.12, zm + 0.48], 0.055, 7, 0);
    // messenger support clamp
    gt.color('#3d3f40');
    gt.box(x, yTop - 0.06, zc + stag, 0.08, 0.1, 0.12, 0);
    // feeder insulators on the mast top
    gt.color(COL.insulator);
    gt.cyl(x, topY + 0.06, zm, 0.05, 0.05, 0.22, 6);
  }

  // ── overhead wires (line segments): contact wire (zig-zag), messenger (sagging), droppers, feeder
  const wires: number[] = [];
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => wires.push(ax, ay, az, bx, by, bz);
  const regs = masts.map((x, i) => ({ x, z: zc + (i % 2 === 0 ? 0.22 : -0.22) }));
  // extend into the tunnels (anchored to the bore ceiling: lower system height)
  const tW = { x: x0 + 1.5, z: zc };
  const tE = { x: x1 - 1.5, z: zc };
  const pts = [tW, ...regs, tE];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const n = Math.max(2, Math.ceil((b.x - a.x) / 3));
    let px = a.x,
      py = cwY(a.x),
      pz = a.z;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = cwY(x);
      seg(px, py, pz, x, y, z);
      px = x;
      py = y;
      pz = z;
    }
    // messenger with sag (only between real masts; tunnel spans run low and straight)
    const tunnel = i === 0 || i === pts.length - 2;
    const sag = tunnel ? 0.0 : 0.62;
    const hA = tunnel && i === 0 ? cwY(a.x) + 0.5 : msY(a.x);
    const hB = tunnel && i === pts.length - 2 ? cwY(b.x) + 0.5 : msY(b.x);
    let qx = a.x,
      qy = hA,
      qz = a.z;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = hA + (hB - hA) * t - sag * 4 * t * (1 - t);
      seg(qx, qy, qz, x, y, z);
      // dropper
      if (k < n && !tunnel) seg(x, y, z, x, cwY(x), z);
      qx = x;
      qy = y;
      qz = z;
    }
  }
  // feeder / return wire along the mast tops
  for (let i = 0; i < masts.length - 1; i++) {
    const a = masts[i],
      b = masts[i + 1];
    const ya = msY(a) + 0.95,
      yb = msY(b) + 0.95;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const t0 = k / n,
        t1 = (k + 1) / n;
      seg(a + (b - a) * t0, ya + (yb - ya) * t0 - 0.5 * 4 * t0 * (1 - t0), zm, a + (b - a) * t1, ya + (yb - ya) * t1 - 0.5 * 4 * t1 * (1 - t1), zm);
    }
  }

  // ── lineside fence (south side, outside the station and crossings)
  const fz = zc + 3.55;
  const fenceRuns: [number, number][] = [];
  {
    const cuts: [number, number][] = [[-52, 50]];
    for (const xc of xings) cuts.push([xc - 6, xc + 6]);
    cuts.sort((a, b) => a[0] - b[0]);
    let x = plan.rail.portalW + 9;
    const end = plan.rail.portalE - 7;
    for (const [ca, cb] of cuts) {
      if (ca > x) fenceRuns.push([x, Math.min(ca, end)]);
      x = Math.max(x, cb);
    }
    if (x < end) fenceRuns.push([x, end]);
  }
  for (const [a, b] of fenceRuns) {
    if (b - a < 3) continue;
    const n = Math.max(1, Math.round((b - a) / 2.6));
    for (let k = 0; k <= n; k++) {
      const x = a + ((b - a) * k) / n;
      gt.kind(K.CONCRETE).color(COL.fencePost);
      gt.block(x, 0, fz, 0.1, 1.05, 0.1);
    }
    gt.kind(K.WOOD).color(COL.fenceRail);
    for (const y of [0.45, 0.85]) gt.box((a + b) / 2, y, fz + 0.07, b - a, 0.09, 0.04, 0);
  }

  // ── colour-light signals (mast on the north side, head facing the approaching train)
  const signals: SignalDef[] = [
    { id: 0, x: plan.rail.portalW + 12, dir: 1 },
    { id: 1, x: plan.rail.portalE - 11, dir: -1 },
    { id: 2, x: plan.rail.stations[0].x0 - 5.5, dir: -1 },
    { id: 3, x: plan.rail.stations[0].x1 + 2.5, dir: 1 },
  ];
  for (const s of signals) {
    const sz = zc - 2.35;
    // the head faces the approaching train: a train moving +x sees a face pointing -x
    const face = -s.dir;
    gt.push().at(s.x, 0, sz, face > 0 ? Math.PI / 2 : -Math.PI / 2);
    // (local +Z now points along `face`)
    gt.kind(K.CONCRETE).color(COL.mastFoot);
    gt.block(0, -0.05, 0, 0.45, 0.25, 0.45);
    gt.kind(K.PLAIN).color(COL.signalMast);
    gt.cyl(0, 0.2, 0, 0.075, 0.065, 3.6, 8);
    // mast plate (white with red stripes)
    gt.color(COL.plate);
    gt.box(0, 2.15, 0.09, 0.26, 0.42, 0.02, 0);
    gt.color(COL.plateRed);
    for (const y of [2.02, 2.15, 2.28]) gt.box(0, y, 0.101, 0.26, 0.05, 0.01, 0);
    // head
    gt.color(COL.signalHead);
    gt.box(0, 3.35, 0.08, 0.42, 0.95, 0.22, 0);
    gt.box(0, 3.85, 0.08, 0.5, 0.06, 0.28, 0);
    // lamps: green (top) and red (bottom) with hoods
    for (const [y, green] of [
      [3.6, true],
      [3.12, false],
    ] as [number, boolean][]) {
      gt.kind(K.PLAIN).color(COL.signalHead);
      gt.box(0, y + 0.13, 0.27, 0.26, 0.03, 0.18, 0);
      gt.kind(K.SIG + s.id * 2 + (green ? 1 : 0)).color(green ? '#2a6b46' : '#7a2420');
      gt.push().at(0, y, 0.195).rotX(Math.PI / 2);
      gt.cyl(0, 0, 0, 0.1, 0.1, 0.012, 10, 1);
      gt.pop();
    }
    gt.pop();
  }

  // ── a couple of lineside location cases near the crossings and the portals
  gt.kind(K.PLAIN);
  for (const xc of xings) {
    gt.color(COL.cabinet);
    gt.block(xc + 6.6, 0, zc + 2.95, 1.1, 1.35, 0.6);
    gt.color('#8e938b');
    gt.block(xc + 6.6, 1.35, zc + 2.95, 1.2, 0.06, 0.7);
  }
  for (const x of [plan.rail.portalW + 8, plan.rail.portalE - 8.5]) {
    gt.color(COL.cabinet);
    gt.block(x, 0, zc + 2.95, 0.8, 1.1, 0.55);
  }

  return { sleepers, wires, masts, signals };
}

/**
 * Rail fastenings for the near track only: per sleeper and rail a steel baseplate, a cast chair hugging the rail foot
 * on each side, a spring clip over the foot and two screw heads. Split into chunks of `CHUNK` m along x so the rail
 * module can show only the ones near the camera (they are invisible beyond ~40 m and would cost ~0.15 M vertices
 * over the whole line).
 */
export const FIX_CHUNK = 24;
export function buildTrackFixings(prof: RailProfile, sleepers: number[], rng: Rng): { x: number; geo: Geo }[] {
  const zc = prof.z;
  const out = new Map<number, Geo>();
  for (const sx of sleepers) {
    const ci = Math.floor(sx / FIX_CHUNK);
    let g = out.get(ci);
    if (!g) out.set(ci, (g = new Geo()));
    const top = prof.top(sx) - RAIL_H;
    for (const side of [-1, 1]) {
      const rz = zc + side * (GAUGE / 2);
      const rust = 0.8 + rng.next() * 0.35;
      g.kind(K.PLAIN).color(COL.basePlate, rust);
      // baseplate (sole plate) under the foot, its shoulders proud of the sleeper top
      g.box(sx, top + 0.004, rz, 0.19, 0.016, 0.38, 8);
      for (const s of [-1, 1]) {
        // chair jaw against the foot / web
        g.color(COL.basePlate, rust * 0.92);
        g.box(sx, top + 0.03, rz + s * 0.088, 0.15, 0.04, 0.03, 8);
        // spring clip: a bent bar over the foot flange (toe on the foot, heel in the chair shoulder)
        g.color(COL.clip, 0.85 + rng.next() * 0.3);
        g.box(sx + 0.035, top + 0.024, rz + s * 0.072, 0.018, 0.018, 0.05, 8);
        g.box(sx - 0.035, top + 0.024, rz + s * 0.072, 0.018, 0.018, 0.05, 8);
        g.box(sx, top + 0.036, rz + s * 0.098, 0.088, 0.016, 0.018, 8);
        // coach-screw heads outside the jaw
        g.color(COL.basePlate, rust * 0.75);
        g.box(sx + s * 0.045, top + 0.02, rz + s * 0.155, 0.035, 0.02, 0.035, 8);
        g.box(sx - s * 0.045, top + 0.02, rz + s * 0.155, 0.035, 0.02, 0.035, 8);
      }
    }
  }
  return [...out.entries()].map(([ci, geo]) => ({ x: (ci + 0.5) * FIX_CHUNK, geo }));
}
