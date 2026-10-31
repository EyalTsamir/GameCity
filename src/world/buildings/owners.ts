// What owners did to their houses over the years: a dressed gable (fish-scale shingles, half-timber, board and batten),
// corner boards or quoins, a brick dentil course, a roof window, a vent pipe, an aerial, a weather vane, a dish, a hoop over
// the garage, hanging baskets, a water butt, pots by the door. All merged trim. ?noowners (core/detailbuildings.ts).

import type * as THREE from 'three';
import type { Rng } from '../../core/rng';
import { Gen, SideGeom, sideBox, sx, sz, col, shade, setCol, mixCol } from './gen';
import { GREEN } from './green';

export const GABLE_PAINTS = ['#e8dcc0', '#b9c8c2', '#c76f55', '#7e9a8c', '#d9b65f', '#8fa6b8', '#a9534a', '#efe9da'];

/**
 * Dress a gable triangle on side sg (apex at the middle), eave ye to ridge yR. kind 0 fish-scale shingles, 1 half-timber,
 * 2 board and batten. attic: the attic window from homes.ts stays clear.
 */
export function gableDress(g: Gen, sg: SideGeom, ye: number, yR: number, attic: boolean, kind: number, paint: THREE.Color, rng: Rng): void {
  const t = g.trim;
  const L = sg.L;
  const rr = yR - ye;
  const hw = (y: number): number => (L / 2) * Math.max(0, (yR - y) / rr);
  const X = (u: number, o: number): number => sx(sg, u, o);
  const Z = (u: number, o: number): number => sz(sg, u, o);
  const hu0 = L / 2 - 0.47,
    hu1 = L / 2 + 0.47,
    hy0 = ye + 0.28,
    hy1 = ye + 0.52 + Math.min(0.95, rr * 0.45);
  const quadUV = (u0: number, u1: number, u2: number, u3: number, y0: number, y1: number, o: number): void => {
    t.quad(X(u0, o), y0, Z(u0, o), X(u1, o), y0, Z(u1, o), X(u2, o), y1, Z(u2, o), X(u3, o), y1, Z(u3, o));
  };
  /** The triangle between two heights, clipped to u in [cA, cB]. */
  const trap = (y0: number, y1: number, cA: number, cB: number, o: number): void => {
    const a0 = Math.max(L / 2 - hw(y0), cA),
      b0 = Math.min(L / 2 + hw(y0), cB),
      a1 = Math.max(L / 2 - hw(y1), cA),
      b1 = Math.min(L / 2 + hw(y1), cB);
    if (b0 > a0 && b1 >= a1) quadUV(a0, b0, b1, a1, y0, y1, o);
  };
  const fill = (o: number): void => {
    if (!attic) {
      trap(ye, yR - 0.001, -1e3, 1e3, o);
      return;
    }
    trap(ye, hy0, -1e3, 1e3, o);
    trap(hy0, hy1, -1e3, hu0, o);
    trap(hy0, hy1, hu1, 1e3, o);
    trap(hy1, yR - 0.001, -1e3, 1e3, o);
  };
  const inHole = (u0: number, u1: number, y0: number, y1: number): boolean => attic && u1 > hu0 && u0 < hu1 && y1 > hy0 && y0 < hy1;

  if (kind === 0) {
    // fish-scale shingles, staggered, a shade apart row by row, over a dark ground
    setCol(t, shade(paint, 0.55));
    fill(0.008);
    const rh = 0.19,
      tw = 0.25;
    let row = 0;
    for (let y = ye + 0.02; y + rh < yR; y += rh, row++) {
      const yT = y + rh;
      const half = hw(yT);
      const off = row % 2 ? tw / 2 : 0;
      const n = Math.floor((half + off) / tw);
      for (let k = -n; k < n; k++) {
        const u0 = L / 2 + k * tw + off,
          u1 = u0 + tw;
        if (u0 < L / 2 - half || u1 > L / 2 + half) continue;
        if (inHole(u0, u1, y - 0.06, yT)) continue;
        setCol(t, shade(paint, 0.92 + rng.next() * 0.16));
        const yM = y + 0.03,
          o = 0.018;
        quadUV(u0 + 0.008, u1 - 0.008, u1 - 0.008, u0 + 0.008, yM, yT, o);
        const um = (u0 + u1) / 2;
        t.triangle(X(u0 + 0.008, o), yM, Z(u0 + 0.008, o), X(um, o), y - 0.05, Z(um, o), X(u1 - 0.008, o), yM, Z(u1 - 0.008, o));
      }
    }
  } else if (kind === 1) {
    // half-timber: limewashed panels between dark oak, a tie beam at the eave, a post and braces
    setCol(t, mixCol(paint, col('#efe7d4'), 0.75));
    fill(0.008);
    const oak = col('#3a2a1f');
    setCol(t, oak);
    sideBox(t, sg, L / 2 - hw(ye) + 0.05, L / 2 + hw(ye) - 0.05, 0, 0.04, ye - 0.08, ye + 0.1);
    const P = (u: number, y: number): [number, number, number] => [X(u, 0.028), y, Z(u, 0.028)];
    const beam = (u0: number, y0: number, u1: number, y1: number): void => {
      const a = P(u0, y0),
        b = P(u1, y1);
      t.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.11, 0.035);
    };
    // along the rakes, just under the barge boards
    beam(L / 2 - hw(ye) + 0.1, ye + 0.02, L / 2, yR - 0.1);
    beam(L / 2, yR - 0.1, L / 2 + hw(ye) - 0.1, ye + 0.02);
    const q = L * 0.25;
    if (attic) {
      for (const u of [hu0 - 0.05, hu1 + 0.05]) sideBox(t, sg, u - 0.05, u + 0.05, 0, 0.04, ye + 0.05, Math.min(ye + rr * (1 - Math.abs(u - L / 2) / (L / 2)), hy1 + 0.4));
      sideBox(t, sg, hu0 - 0.1, hu1 + 0.1, 0, 0.04, hy1, hy1 + 0.09);
      sideBox(t, sg, hu0 - 0.1, hu1 + 0.1, 0, 0.04, hy0 - 0.09, hy0);
      beam(q, ye + 0.05, hu0 - 0.05, hy1 - 0.1);
      beam(L - q, ye + 0.05, hu1 + 0.05, hy1 - 0.1);
    } else {
      sideBox(t, sg, L / 2 - 0.05, L / 2 + 0.05, 0, 0.04, ye + 0.05, yR - 0.12);
      beam(L / 2, ye + 0.05, q + 0.04, ye + rr * 0.5);
      beam(L / 2, ye + 0.05, L - q - 0.04, ye + rr * 0.5);
    }
    for (const u of [q, L - q]) sideBox(t, sg, u - 0.05, u + 0.05, 0, 0.04, ye + 0.05, ye + rr * 0.5 - 0.02);
  } else {
    // board and batten
    setCol(t, shade(paint, 0.94));
    fill(0.008);
    setCol(t, paint);
    const n = Math.floor(L / 0.32);
    for (let k = 1; k < n; k++) {
      const u = (L * k) / n;
      const top = ye + rr * (1 - Math.abs(u - L / 2) / (L / 2)) - 0.03;
      if (top < ye + 0.2) continue;
      if (attic && u > hu0 - 0.03 && u < hu1 + 0.03) {
        sideBox(t, sg, u - 0.024, u + 0.024, 0, 0.026, ye, Math.min(top, hy0));
        if (top > hy1) sideBox(t, sg, u - 0.024, u + 0.024, 0, 0.026, hy1, top);
      } else sideBox(t, sg, u - 0.024, u + 0.024, 0, 0.026, ye, top);
    }
    setCol(t, shade(paint, 0.82));
    sideBox(t, sg, L / 2 - hw(ye) + 0.05, L / 2 + hw(ye) - 0.05, 0, 0.04, ye - 0.08, ye + 0.08);
  }
  // a louvred vent where there is no attic window
  if (!attic && kind !== 1 && rr > 1.5) {
    const vy = ye + rr * 0.42,
      c = L / 2;
    setCol(t, shade(paint, 1.12));
    sideBox(t, sg, c - 0.33, c + 0.33, 0, 0.05, vy - 0.27, vy + 0.27);
    setCol(t, col('#2a2c2e'));
    sideBox(t, sg, c - 0.26, c + 0.26, 0.05, 0.052, vy - 0.2, vy + 0.2);
    setCol(t, shade(paint, 1.05));
    for (let k = 0; k < 5; k++) {
      const y = vy - 0.2 + (k + 0.5) * 0.08;
      sideBox(t, sg, c - 0.26, c + 0.26, 0.05, 0.07, y, y + 0.035);
    }
  }
}

/** Corner of a wall at (x, z), the front face running inward along x, the side face running back along z. */
export function cornerDress(g: Gen, x: number, z: number, right: boolean, y0: number, y1: number, kind: 'boards' | 'quoins', c: THREE.Color): void {
  const t = g.trim;
  const dir = right ? -1 : 1;
  const out = 0.022;
  const front = (w: number, a: number, b: number): void => {
    const x0 = Math.min(x, x + dir * w),
      x1 = Math.max(x, x + dir * w);
    t.box(x0, a, z, x1, b, z + out, 0b010111);
  };
  const side = (w: number, a: number, b: number): void => {
    const xo = right ? x + out : x - out;
    t.box(Math.min(x, xo), a, z - w, Math.max(x, xo), b, z + out, right ? 0b110101 : 0b110110);
  };
  if (kind === 'boards') {
    setCol(t, c);
    front(0.13, y0, y1);
    side(0.13, y0, y1);
    return;
  }
  const h = 0.25,
    gap = 0.035;
  let k = 0;
  for (let y = y0; y + h < y1; y += h + gap, k++) {
    setCol(t, shade(c, 0.95 + ((k * 7) % 5) * 0.025));
    const w = k % 2 ? 0.26 : 0.42;
    front(w, y, y + h);
    side(k % 2 ? 0.42 : 0.26, y, y + h);
  }
}

/** A brick dentil course under the eave: little headers standing proud. */
export function dentils(g: Gen, sg: SideGeom, uA: number, uB: number, y: number, c: THREE.Color): void {
  const t = g.trim;
  setCol(t, shade(c, 0.86));
  const n = Math.floor((uB - uA - 0.2) / 0.24);
  for (let k = 0; k < n; k++) {
    const u = uA + 0.1 + (k + 0.25) * 0.24;
    sideBox(t, sg, u, u + 0.12, 0, 0.035, y - 0.075, y);
  }
  setCol(t, shade(c, 1.04));
  sideBox(t, sg, uA + 0.06, uB - 0.06, 0, 0.018, y, y + 0.05);
}

/** Roof window on a slope: p low corner, a across (unit), b up the slope (unit), wide w, long l. */
export function roofWindow(g: Gen, p: [number, number, number], a: [number, number, number], b: [number, number, number], w: number, l: number): void {
  const t = g.trim;
  // normal, out of the roof
  let nx = a[1] * b[2] - a[2] * b[1],
    ny = a[2] * b[0] - a[0] * b[2],
    nz = a[0] * b[1] - a[1] * b[0];
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const at = (s: number, r: number, h: number): [number, number, number] => [p[0] + a[0] * s + b[0] * r + nx * h, p[1] + a[1] * s + b[1] * r + ny * h, p[2] + a[2] * s + b[2] * r + nz * h];
  const away = at(w / 2, l / 2, -3);
  const panel = (s0: number, s1: number, r0: number, r1: number, h: number): void => {
    const A = at(s0, r0, h),
      B = at(s1, r0, h),
      C = at(s1, r1, h),
      D = at(s0, r1, h);
    t.quadAway(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], D[0], D[1], D[2], away[0], away[1], away[2]);
  };
  // lead flashing, frame, sky in the pane
  setCol(t, col('#5d6062'));
  panel(-0.08, w + 0.08, -0.1, l + 0.08, 0.035);
  setCol(t, col('#6a4a30'));
  const bar = (s0: number, r0: number, s1: number, r1: number, bw: number): void => {
    const A = at(s0, r0, 0.075),
      B = at(s1, r1, 0.075);
    t.beam(A[0], A[1], A[2], B[0], B[1], B[2], bw, 0.07);
  };
  bar(0, 0, w, 0, 0.07);
  bar(0, l, w, l, 0.07);
  bar(0, 0, 0, l, 0.07);
  bar(w, 0, w, l, 0.07);
  bar(0, l * 0.5, w, l * 0.5, 0.035);
  setCol(t, col('#4d6880'));
  panel(0.03, w - 0.03, 0.03, l - 0.03, 0.07);
}

/** Soil vent through a slope. */
export function ventPipe(g: Gen, x: number, y: number, z: number): void {
  const t = g.trim;
  setCol(t, col('#3b3d3f'));
  t.cylinder(x, z, 0.055, y - 0.1, y + 0.5, 6, false);
  setCol(t, col('#5d6062'));
  t.cylinder(x, z, 0.14, y - 0.03, y + 0.03, 6, true);
  setCol(t, col('#2b2c2e'));
  t.cylinder(x, z, 0.07, y + 0.5, y + 0.54, 6, true);
}

/** Weather vane on the ridge: post, compass arms, an arrow with a cockerel. */
export function weatherVane(g: Gen, x: number, y: number, z: number, rng: Rng): void {
  const t = g.trim;
  setCol(t, col('#23252a'));
  t.cylinder(x, z, 0.018, y, y + 1.0, 5, false);
  const a = rng.next() * Math.PI * 2;
  const c = Math.cos(a),
    s = Math.sin(a);
  const arm = (dx: number, dz: number, yy: number, w: number): void => t.beam(x - dx, yy, z - dz, x + dx, yy, z + dz, w, w);
  arm(0.3, 0, y + 0.62, 0.016);
  arm(0, 0.3, y + 0.62, 0.016);
  arm(c * 0.42, s * 0.42, y + 0.88, 0.024);
  // the arrow head and the bird's silhouette
  const hx = x + c * 0.42,
    hz = z + s * 0.42;
  const ax = hx - c * 0.15,
    az = hz - s * 0.15;
  t.triangle(hx, y + 0.88, hz, ax, y + 0.8, az, ax, y + 0.96, az);
  t.triangle(hx, y + 0.88, hz, ax, y + 0.96, az, ax, y + 0.8, az);
  setCol(t, col('#b08b3e'));
  const tx = x - c * 0.18,
    tz = z - s * 0.18;
  const bx = x + c * 0.14,
    bz = z + s * 0.14;
  t.triangle(tx, y + 0.9, tz, bx, y + 0.9, bz, x, y + 1.18, z);
  t.triangle(bx, y + 0.9, bz, tx, y + 0.9, tz, x, y + 1.18, z);
}

/** Kids' hoop over the garage door: backboard, rim, a little net, all above 2.4 m. */
export function hoop(g: Gen, sg: SideGeom, u: number, top: number): void {
  const t = g.trim;
  const y0 = 2.42,
    y1 = Math.min(top - 0.02, 2.82);
  setCol(t, col('#f1f1ee'));
  sideBox(t, sg, u - 0.45, u + 0.45, 0.01, 0.045, y0, y1);
  setCol(t, col('#c8452b'));
  sideBox(t, sg, u - 0.15, u + 0.15, 0.045, 0.048, y0 + 0.04, y0 + 0.2);
  sideBox(t, sg, u - 0.13, u + 0.13, 0.048, 0.05, y0 + 0.06, y0 + 0.18);
  const yR = y0 + 0.07;
  const cx = sx(sg, u, 0.24),
    cz = sz(sg, u, 0.24);
  setCol(t, col('#d8591f'));
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2,
      a1 = ((k + 1) / 8) * Math.PI * 2;
    t.beam(cx + Math.cos(a0) * 0.19, yR, cz + Math.sin(a0) * 0.19, cx + Math.cos(a1) * 0.19, yR, cz + Math.sin(a1) * 0.19, 0.016, 0.016);
  }
  sideBox(t, sg, u - 0.03, u + 0.03, 0.045, 0.06, yR - 0.012, yR + 0.012);
}

/** Hanging basket on a chain from a beam at yTop. */
export function hangingBasket(g: Gen, x: number, z: number, yTop: number, rng: Rng): void {
  const t = g.trim;
  const y = yTop - 0.62;
  setCol(t, col('#2d2f31'));
  t.box(x - 0.006, y, z - 0.006, x + 0.006, yTop, z + 0.006, 0b110011);
  setCol(t, col('#4b3a2a'));
  t.cylinder(x, z, 0.09, y - 0.13, y, 7, true, 0.15);
  const c = rng.pick([GREEN.PETUNIA, GREEN.GERANIUM, GREEN.BOUGAIN]);
  g.green.clump(x, y - 0.03, z, 0.22, 0.3, c, 2);
}

/** Water butt under a downpipe: ribbed drum, lid, brass tap. */
export function waterButt(g: Gen, x: number, z: number, rng: Rng): void {
  const t = g.trim;
  const c = col(rng.pick(['#3f5d43', '#2e4a63', '#5a4632', '#39403f']));
  setCol(t, c);
  t.cylinder(x, z, 0.24, 0.02, 1.02, 10, false, 0.28);
  setCol(t, shade(c, 1.15));
  for (const y of [0.3, 0.68]) t.cylinder(x, z, 0.27, y, y + 0.03, 10, false);
  setCol(t, shade(c, 0.75));
  t.cylinder(x, z, 0.29, 1.02, 1.07, 10, true);
  setCol(t, col('#b08b3e'));
  t.box(x - 0.018, 0.2, z + 0.24, x + 0.018, 0.24, z + 0.32, 0b111111);
}
