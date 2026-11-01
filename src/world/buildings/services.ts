// What buildings carry on the walls nobody designed: conduit, cabinets, extract louvres and dock seals on the sheds; soil
// stacks, meter boxes, a hose reel and vents on the sides and backs of homes. All of it merged trim, within the
// footprint margin. ?noservices (core/detailbuildings.ts).

import type * as THREE from 'three';
import type { Rng } from '../../core/rng';
import { Gen, SideGeom, sideBox, sx, sz, col, shade, setCol, signOnSide } from './gen';
import { letterSign } from './signs';
import { anchors } from './anchors';

/** Foam dock seal round a roll-up door, rubber bumpers at its foot, black and yellow chevrons on the posts. */
export function dockSeal(g: Gen, sg: SideGeom, a: number, b: number, doorH: number, o: number, bay: number): void {
  const t = g.trim;
  const pad = col('#1e2023');
  setCol(t, pad);
  sideBox(t, sg, a - 0.2, a - 0.02, 0.03, o, 0.75, doorH + 0.02);
  sideBox(t, sg, b + 0.02, b + 0.2, 0.03, o, 0.75, doorH + 0.02);
  sideBox(t, sg, a - 0.2, b + 0.2, 0.03, o, doorH + 0.02, doorH + 0.3, true);
  // weathered strip on each pad where trailers rub
  setCol(t, col('#6b6d6f'));
  for (const [u0, u1] of [[a - 0.17, a - 0.05], [b + 0.05, b + 0.17]] as const) sideBox(t, sg, u0, u1, o, o + 0.004, 1.3, doorH - 0.15);
  // bumpers + chevrons below the seal
  for (const [u0, u1] of [[a - 0.2, a - 0.02], [b + 0.02, b + 0.2]] as const) {
    const n = 4;
    for (let k = 0; k < n; k++) {
      setCol(t, col(k % 2 ? '#191a1c' : '#d9a92a'));
      sideBox(t, sg, u0, u1, 0.03, o - 0.02, (k * 0.75) / n, ((k + 1) * 0.75) / n);
    }
    setCol(t, col('#0f1011'));
    sideBox(t, sg, u0 + 0.02, u1 - 0.02, o - 0.02, o, 0.28, 0.62);
  }
  // stencilled bay number over the door
  const rr = g.atlas.add(`bay:${bay}`, 48, 48, letterSign(String(bay), '#e9e4d6', '#000000', undefined, 0));
  signOnSide(g, sg, (a + b) / 2 - 0.22, (a + b) / 2 + 0.22, 0.012, doorH + 0.52, doorH + 0.96, rr);
}

/** Conduit, cabinets, louvres on the free stretches of a shed wall. `ops`: door openings on it. */
export function shedServices(g: Gen, sg: SideGeom, uA: number, uB: number, ops: { u: number; w: number }[], H: number, yRun: number, brick: boolean, rng: Rng): void {
  const t = g.trim;
  const proud = 0.09;
  const grey = col('#868c90');
  // the run of conduit along the wall, on stand-offs
  setCol(t, col('#a0a6aa'));
  sideBox(t, sg, uA + 0.25, uB - 0.25, 0.02, 0.055, yRun, yRun + 0.035);
  sideBox(t, sg, uA + 0.25, uB - 0.25, 0.02, 0.05, yRun + 0.07, yRun + 0.095);
  setCol(t, col('#5e6367'));
  for (let u = uA + 0.5; u < uB - 0.3; u += 1.5) sideBox(t, sg, u - 0.02, u + 0.02, 0, 0.06, yRun - 0.03, yRun + 0.12);
  // free stretches
  const spans: [number, number][] = [];
  let cur = uA + 0.5;
  for (const o of [...ops].sort((p, q) => p.u - q.u)) {
    if (o.u - o.w / 2 - 0.8 > cur + 1.3) spans.push([cur, o.u - o.w / 2 - 0.8]);
    cur = Math.max(cur, o.u + o.w / 2 + 0.8);
  }
  if (uB - 0.5 > cur + 1.3) spans.push([cur, uB - 0.5]);
  for (const [a, b] of spans) {
    let u = a + 0.5 + rng.next() * 0.4;
    while (u < b - 0.5) {
      const kind = rng.int(0, 3);
      if (kind === 0) {
        // switch cabinet: two doors, handles, a warning label, conduit up to the run
        const w = 0.5 + rng.next() * 0.35;
        const h = brick ? 0.95 : 1.45;
        setCol(t, shade(grey, 0.75));
        sideBox(t, sg, u - w - 0.02, u + w + 0.02, 0, 0.03, 0.12, 0.2);
        setCol(t, grey);
        sideBox(t, sg, u - w, u + w, 0, proud + 0.08, 0.2, 0.2 + h);
        setCol(t, shade(grey, 0.62));
        sideBox(t, sg, u - 0.006, u + 0.006, proud + 0.08, proud + 0.083, 0.22, 0.18 + h);
        setCol(t, col('#222426'));
        for (const hu of [u - 0.09, u + 0.06]) sideBox(t, sg, hu, hu + 0.03, proud + 0.08, proud + 0.1, 0.72, 0.84);
        setCol(t, col('#e0b33c'));
        sideBox(t, sg, u + 0.1, u + 0.24, proud + 0.08, proud + 0.083, 0.2 + h - 0.26, 0.2 + h - 0.12);
        if (!brick) {
          setCol(t, col('#a0a6aa'));
          sideBox(t, sg, u - 0.04, u + 0.04, 0.02, 0.06, 0.2 + h, yRun);
        }
        u += w + 1.2;
      } else if (kind === 1 && !brick) {
        // extract louvre high on the wall, its stain running down
        const y = Math.min(yRun - 1.3, 2.6);
        setCol(t, shade(grey, 0.92));
        sideBox(t, sg, u - 0.55, u + 0.55, 0, 0.11, y, y + 1.1, true);
        setCol(t, shade(grey, 0.5));
        for (let k = 0; k < 6; k++) sideBox(t, sg, u - 0.48, u + 0.48, 0.11, 0.135, y + 0.1 + k * 0.16, y + 0.17 + k * 0.16, true);
        setCol(t, col('#3b3a36'));
        sideBox(t, sg, u - 0.42, u + 0.42, 0, 0.004, Math.max(0.9, y - 1.0), y);
        u += 1.9;
      } else if (kind === 2) {
        // fire point: red box with a white stripe, standpipe to the ground
        setCol(t, col('#b3261f'));
        sideBox(t, sg, u - 0.28, u + 0.28, 0, 0.14, 1.1, 1.75);
        t.cylinder(sx(sg, u, 0.05), sz(sg, u, 0.05), 0.035, 0, 1.1, 8, false);
        setCol(t, col('#efe9dc'));
        sideBox(t, sg, u - 0.2, u + 0.2, 0.14, 0.143, 1.55, 1.66);
        const hf = anchors.handFrame(sg, u - 0.28);
        if (hf) anchors.handSpots.push({ ...hf, kind: 'firepoint', w: 0.56, h: 0.65, y: 1.1, o: 0.14, color: 0xb3261f, seed: g.seed });
        u += 1.4;
      } else if (!brick) {
        // gas / water riser: painted pipe from a meter box to the conduit level
        const c: THREE.Color = col(rng.chance(0.5) ? '#c9a22a' : '#3e6d8f');
        setCol(t, shade(grey, 0.85));
        sideBox(t, sg, u - 0.3, u + 0.3, 0, 0.16, 0.22, 0.86);
        setCol(t, c);
        t.cylinder(sx(sg, u + 0.18, 0.06), sz(sg, u + 0.18, 0.06), 0.03, 0.86, yRun, 8, false);
        u += 1.3;
      } else u += 1.0;
    }
  }
  void H;
}

/** Side of a home: electricity + gas boxes low on the wall with their pipes, a tap and hose reel near the back. */
export function homeSide(g: Gen, sg: SideGeom, L: number, yTop: number, o: number, rng: Rng): void {
  if (L < 4) return;
  const t = g.trim;
  const oo = Math.min(o, 0.16);
  const u = 0.55 + rng.next() * 0.5;
  // meter boxes (moulded white / grey plastic), one with a pipe to the ground, one with cable to the eaves
  setCol(t, col('#d7d4ca'));
  sideBox(t, sg, u - 0.24, u + 0.24, 0, oo, 0.35, 1.0);
  setCol(t, col('#a9a69c'));
  sideBox(t, sg, u - 0.21, u + 0.21, oo, oo + 0.004, 0.4, 0.95);
  const hf = anchors.handFrame(sg, u - 0.24);
  if (hf) anchors.handSpots.push({ ...hf, kind: 'meter', w: 0.48, h: 0.65, y: 0.35, o: oo, color: 0xd7d4ca, seed: g.seed });
  setCol(t, col('#c9a22a'));
  t.cylinder(sx(sg, u - 0.12, 0.04), sz(sg, u - 0.12, 0.04), 0.014, 0.0, 0.35, 5, false);
  setCol(t, col('#23252a'));
  sideBox(t, sg, u + 0.12, u + 0.135, 0, 0.018, 1.0, yTop - 0.15);
  // tap with a hose reel
  const hu = L - 0.7 - rng.next() * 0.5;
  setCol(t, col('#8a6a3a'));
  sideBox(t, sg, hu - 0.01, hu + 0.01, 0, 0.09, 0.72, 0.74);
  setCol(t, col('#3d7a44'));
  // the reel: a short drum on the wall, its axis along the wall normal
  t.beam(sx(sg, hu + 0.3, 0.01), 0.62, sz(sg, hu + 0.3, 0.01), sx(sg, hu + 0.3, Math.min(0.11, oo)), 0.62, sz(sg, hu + 0.3, Math.min(0.11, oo)), 0.3, 0.3);
}

/** Back of a home or townhouse: a soil stack with a branch per floor, kitchen and bathroom vents with stains, a lamp. */
export function homeBack(g: Gen, sg: SideGeom, uA: number, uB: number, yTop: number, floorH: number, o: number, rng: Rng): void {
  if (uB - uA < 3.5) return;
  const t = g.trim;
  const r = Math.min(0.055, o * 0.5);
  const left = rng.chance(0.5);
  const u = left ? uA + 0.32 : uB - 0.32;
  const x = sx(sg, u, r + 0.012),
    z = sz(sg, u, r + 0.012);
  setCol(t, col('#3a3c3e'));
  t.cylinder(x, z, r, 0.0, yTop + 0.35, 8, true);
  setCol(t, col('#2b2d2f'));
  for (let y = 1.2; y < yTop; y += 1.6) t.cylinder(x, z, r + 0.008, y, y + 0.05, 8, false);
  for (let y = floorH - 0.35; y < yTop - 0.5; y += floorH) {
    const bu = left ? u + 0.5 : u - 0.5;
    t.beam(sx(sg, u, r), y + 0.18, sz(sg, u, r), sx(sg, bu, 0.03), y + 0.28, sz(sg, bu, 0.03), 0.05, 0.05);
  }
  // vents: pale square grilles under the first-floor line, a rusty stain running from each
  const vents = 1 + (rng.chance(0.5) ? 1 : 0);
  for (let k = 0; k < vents; k++) {
    const vu = left ? uA + 0.95 + k * 0.5 : uB - 0.95 - k * 0.5;
    const vy = floorH - 0.32 + k * 0.08;
    setCol(t, col('#cfccc2'));
    sideBox(t, sg, vu - 0.1, vu + 0.1, 0, 0.022, vy, vy + 0.2);
    setCol(t, col('#6f6c64'));
    for (let j = 0; j < 3; j++) sideBox(t, sg, vu - 0.08, vu + 0.08, 0.022, 0.026, vy + 0.03 + j * 0.055, vy + 0.05 + j * 0.055);
    setCol(t, col('#4a4640'));
    sideBox(t, sg, vu - 0.07, vu + 0.07, 0, 0.003, vy - 0.55, vy);
  }
}

const AWNINGS = [['#b23a2e', '#efe7d6'], ['#2f6d73', '#efe7d6'], ['#3f5c8a', '#e8e4d8'], ['#c98a2c', '#f0e8d2'], ['#4a6b3f', '#ece6d4']];

/** Striped balcony awning: canvas on a sloped frame with a scalloped valance, drop arms at the sides. */
export function balconyAwning(g: Gen, sg: SideGeom, uA: number, uB: number, y: number, dep: number, rng: Rng): void {
  const t = g.trim;
  const pal = AWNINGS[rng.int(0, AWNINGS.length - 1)];
  const y0 = y + 2.42,
    y1 = y + 2.02;
  const n = Math.max(4, Math.round((uB - uA) / 0.26));
  const P = (u: number, o: number, yy: number): [number, number, number] => [sx(sg, u, o), yy, sz(sg, u, o)];
  const rx = sx(sg, (uA + uB) / 2, -2),
    rz = sz(sg, (uA + uB) / 2, -2);
  for (let k = 0; k < n; k++) {
    const u0 = uA + ((uB - uA) * k) / n,
      u1 = uA + ((uB - uA) * (k + 1)) / n;
    const c = col(pal[k % 2]);
    setCol(t, c);
    const a = P(u0, 0.01, y0),
      b = P(u1, 0.01, y0),
      d = P(u1, dep, y1),
      e = P(u0, dep, y1);
    // top face faces up and out; the underside is a darker copy
    t.quadAway(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2], e[0], e[1], e[2], rx, y - 4, rz);
    setCol(t, shade(c, 0.62));
    t.quadAway(a[0], a[1] - 0.012, a[2], b[0], b[1] - 0.012, b[2], d[0], d[1] - 0.012, d[2], e[0], e[1] - 0.012, e[2], rx, y + 8, rz);
    // valance
    setCol(t, shade(c, 0.92));
    const vy = y1 - (k % 2 ? 0.17 : 0.2);
    const f = P(u0, dep, vy),
      h = P(u1, dep, vy);
    t.quadAway(e[0], e[1], e[2], d[0], d[1], d[2], h[0], h[1], h[2], f[0], f[1], f[2], rx, y1, rz);
  }
  setCol(t, col('#c9cdd0'));
  for (const u of [uA + 0.02, uB - 0.02]) {
    const a = P(u, 0.02, y + 1.15),
      b = P(u, dep - 0.02, y1 + 0.01);
    t.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.022, 0.022);
  }
  const ba = P(uA, dep - 0.015, y1 - 0.005),
    bb = P(uB, dep - 0.015, y1 - 0.005);
  t.beam(ba[0], ba[1], ba[2], bb[0], bb[1], bb[2], 0.03, 0.03);
}

/**
 * A blank party wall above a lower neighbour: a chimney breast running up it, the scar of the roof of a house long gone
 * (a paler gable with its flashing line), a bricked-up window, iron tie plates, a repair in fresher render. Above 2.4 m.
 */
export function partyWall(g: Gen, sg: SideGeom, uA: number, uB: number, yLow: number, yTop: number, c: THREE.Color, painted: boolean, rng: Rng): void {
  const t = g.trim;
  const L = uB - uA;
  const y0 = yLow + 0.04;
  // chimney breast, stepping in once on the way up
  const bu = rng.chance(0.5) ? uA + Math.min(1.1, L * 0.2) : uB - Math.min(1.1, L * 0.2);
  const hw = 0.55;
  setCol(t, shade(c, 0.96));
  const step = y0 + (yTop - y0) * 0.55;
  sideBox(t, sg, bu - hw, bu + hw, 0, 0.14, y0, step);
  sideBox(t, sg, bu - hw * 0.72, bu + hw * 0.72, 0, 0.14, step, yTop);
  setCol(t, shade(c, 1.08));
  sideBox(t, sg, bu - hw - 0.02, bu + hw + 0.02, 0, 0.145, step - 0.02, step + 0.05);
  // tie plates at the floor lines: an X of flat iron on a boss
  setCol(t, col('#2d2a28'));
  const nTie = Math.min(3, Math.floor(L / 2.6));
  for (let i = 0; i < nTie; i++) {
    const u = uA + ((i + 0.5) * L) / nTie;
    if (Math.abs(u - bu) < hw + 0.35) continue;
    const y = Math.min(yTop - 0.7, y0 + 0.9 + ((i * 2 + 1) % 3) * 0.8);
    sideBox(t, sg, u - 0.24, u + 0.24, 0, 0.022, y - 0.03, y + 0.03);
    sideBox(t, sg, u - 0.03, u + 0.03, 0, 0.022, y - 0.24, y + 0.24);
    sideBox(t, sg, u - 0.055, u + 0.055, 0, 0.04, y - 0.055, y + 0.055);
    // rust run below it
    setCol(t, col('#6a4a34'));
    sideBox(t, sg, u - 0.035, u + 0.035, 0, 0.003, y - 0.75, y - 0.05);
    setCol(t, col('#2d2a28'));
  }
  if (!painted && yTop - y0 > 2.6 && L > 5) {
    // the scar: pale plaster gable of a vanished house, its flashing line, a bricked-up window inside it
    const uL = uA + L * 0.12,
      uR = uB - L * 0.12;
    const uP = (uL + uR) / 2;
    const yE = y0 + 0.1;
    const yR = Math.min(yTop - 0.35, yE + (uR - uL) * 0.4);
    const pale = shade(c, 0.9 + rng.next() * 0.2);
    const o = 0.006;
    const P = (u: number, y: number): [number, number, number] => [sx(sg, u, o), y, sz(sg, u, o)];
    const a = P(uL, yE),
      b = P(uR, yE),
      d = P(uP, yR);
    setCol(t, pale);
    t.triangle(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
    setCol(t, shade(c, 0.55));
    const q = (u: number, y: number): [number, number, number] => [sx(sg, u, 0.012), y, sz(sg, u, 0.012)];
    for (const [ua, ya, ub, yb] of [[uL, yE, uP, yR], [uP, yR, uR, yE]] as const) {
      const pa = q(ua, ya),
        pb = q(ub, yb);
      t.beam(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], 0.012, 0.1);
    }
    const wu = uP + (rng.chance(0.5) ? 1 : -1) * Math.min(0.9, L * 0.1);
    const wy = yE + 0.35;
    const wH = Math.min(1.1, (yR - yE) * 0.42);
    if (wH > 0.6) {
      setCol(t, shade(c, 0.72));
      sideBox(t, sg, wu - 0.5, wu + 0.5, 0.006, 0.012, wy, wy + wH);
      setCol(t, shade(c, 1.12));
      sideBox(t, sg, wu - 0.58, wu + 0.58, 0.006, 0.026, wy + wH, wy + wH + 0.14);
    }
  } else if (L > 4) {
    // a repair in fresher render
    const pw = rng.range(0.8, 1.8),
      ph = rng.range(0.5, 1.2);
    const pu = uA + rng.next() * Math.max(0.1, L - pw);
    setCol(t, shade(c, 1.1));
    sideBox(t, sg, pu, pu + pw, 0.004, 0.008, y0 + 0.2, Math.min(yTop - 0.2, y0 + 0.2 + ph));
  }
}
