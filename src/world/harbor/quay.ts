// The fish quay: the north end of the harbour quay (x 127..136, z −140..−122, clear of the gantry rails and the
// props scatter, which keeps x > 126.6 free) where the crabber 'Morning Star' and her tender lie (boats module,
// FISH_BERTH / PUNT_BERTH). Packed with the used things of a working fish quay: creels stacked for loading,
// a trawl net heaped with its float line, fish boxes (some iced with the catch), pallets, a forklift, a
// fishermen's store with oilskins and buoys, a hose on its reel at a standpipe, rope eyes on the bollards,
// tyre fenders on the wall at the berth, oil / wet / fish-water stains on the concrete.
// Everything static, merged into the harbor-north mesh. ?noquaylife removes it; quality low drops the small things.

import * as THREE from 'three';
import { HB, PAT, type V3 } from './geo';
import type { Rng } from '../../core/rng';

type Ground = (x: number, z: number) => number;

/** cast-iron mooring bollard: bolted base flange, waisted barrel, lipped head with a domed cap */
export function castBollard(b: HB, x: number, y: number, z: number): void {
  b.color('#24272a').pat(PAT.RUST, 0.3);
  b.lathe(
    [
      [0.0, 0],
      [0.33, 0],
      [0.33, 0.05],
      [0.24, 0.07],
      [0.2, 0.14],
      [0.165, 0.3],
      [0.17, 0.4],
      [0.27, 0.45],
      [0.28, 0.52],
      [0.22, 0.56],
      [0.12, 0.6],
      [0.0, 0.61],
    ],
    14,
    x,
    y,
    z,
  );
  b.color('#3a3d40');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    b.vcyl(x + Math.cos(a) * 0.28, y + 0.05, z + Math.sin(a) * 0.28, 0.025, 0.025, 6, 2);
  }
  // painted yellow band (worn)
  b.color('#c9a43a').pat(PAT.RUST, 0.5);
  b.cyl([x, y + 0.16, z], [x, y + 0.22, z], 0.198, 0.19, 14, 0);
  b.pat(PAT.NONE);
}

/** rope eye dropped over a bollard, the line leaving toward (tx, ty, tz) (the boat's rope takes over there) */
export function ropeEye(b: HB, x: number, y: number, z: number, tx: number, ty: number, tz: number, col: string): void {
  b.color(col).pat(PAT.NONE);
  const pts: V3[] = [];
  const dx = tx - x,
    dz = tz - z,
    L = Math.hypot(dx, dz) || 1;
  const ux = dx / L,
    uz = dz / L;
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    pts.push([x + Math.cos(a) * 0.2, y + 0.33 + 0.03 * Math.cos(a - Math.atan2(uz, ux)), z + Math.sin(a) * 0.2]);
  }
  b.tube(pts, 0.032, 5, true);
  // the two legs of the eye splice running out to the bollard face
  b.tube(
    [
      [x + ux * 0.2, y + 0.34, z + uz * 0.2],
      [x + ux * 0.45, y + 0.36, z + uz * 0.45],
      [tx, ty, tz],
    ],
    0.032,
    5,
  );
}

function torusTube(b: HB, cx: number, cy: number, cz: number, R: number, r: number, axis: 'x' | 'y' | 'z', seg = 14): void {
  const pts: V3[] = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2,
      c = Math.cos(a) * R,
      s = Math.sin(a) * R;
    pts.push(axis === 'y' ? [cx + c, cy, cz + s] : axis === 'x' ? [cx, cy + c, cz + s] : [cx + c, cy + s, cz]);
  }
  b.tube(pts, r, 6, true);
}

/** wooden euro pallet (top boards, blocks, bottom boards) */
function pallet(b: HB, x: number, y: number, z: number, yaw: number, col = '#b08a5a'): void {
  b.color(col).pat(PAT.NONE);
  b.pushT(x, y, z, yaw);
  for (let i = 0; i < 5; i++) b.box(-0.5 + i * 0.25, 0.132, 0, 0.1, 0.022, 0.8, 0, 1);
  for (const zz of [-0.35, 0, 0.35]) {
    b.box(0, 0.1, zz, 1.2, 0.022, 0.1, 0, 0);
    for (const xx of [-0.52, 0, 0.52]) b.box(xx, 0.055, zz, 0.14, 0.078, 0.1, 0, 0);
    b.box(0, 0.011, zz, 1.2, 0.022, 0.1, 0, 0);
  }
  b.pop();
}

/** stack of plastic fish boxes; the top one iced with fish when `catch` */
function fishBoxStack(b: HB, x: number, y: number, z: number, n: number, yaw: number, rng: Rng, fish: boolean): void {
  b.pushT(x, y, z, yaw);
  for (let k = 0; k < n; k++) {
    const col = rng.next() < 0.25 ? '#c44a2c' : rng.next() < 0.3 ? '#e2e0d8' : '#2f6fb3';
    const yy = k * 0.255;
    const off = (rng.next() - 0.5) * 0.04;
    b.color(col).pat(PAT.NONE);
    b.box(off, yy + 0.015, 0, 0.72, 0.03, 0.44, 0, 0);
    for (const sd of [-1, 1]) {
      b.box(off + sd * 0.35, yy + 0.14, 0, 0.025, 0.25, 0.44, 0, 0);
      b.box(off, yy + 0.14, sd * 0.21, 0.72, 0.25, 0.025, 0, 0);
      b.color('#15202b');
      b.box(off + sd * 0.364, yy + 0.2, 0, 0.004, 0.045, 0.13, 0, 0);
      b.color(col);
    }
  }
  if (fish) {
    const yt = (n - 1) * 0.255 + 0.2;
    b.color('#e4ecef');
    b.box(0, yt, 0, 0.66, 0.04, 0.38, 0, 0);
    // fish: tapered silver bodies with darker backs lying in the ice
    for (let k = 0; k < 7; k++) {
      const fx = -0.24 + (k % 4) * 0.16 + (rng.next() - 0.5) * 0.05,
        fz = -0.1 + Math.floor(k / 4) * 0.18 + (rng.next() - 0.5) * 0.05;
      const fy = rng.next() * Math.PI;
      b.pushT(fx, yt + 0.035, fz, fy, 0, Math.PI / 2);
      b.color(k % 3 === 0 ? '#9aa6ad' : '#b9c3c6');
      b.sphere(0, 0, 0, 0.035, 6, 4, 1);
      b.pop();
      b.pushT(fx, yt + 0.035, fz, fy);
      b.color('#6f7c85');
      b.box(0, 0.006, 0, 0.05, 0.035, 0.22, 0, 1);
      b.box(0, 0.006, 0.13, 0.002, 0.05, 0.05, 0, 1);
      b.pop();
    }
  }
  b.pop();
}

/** parlour creel (lobster / crab pot): weighted base, three hoops, netting skin, entrance eye */
function creel(b: HB, x: number, y: number, z: number, yaw: number): void {
  b.pushT(x, y, z, yaw);
  b.color('#2b2d2f').pat(PAT.RUST, 0.25);
  b.box(0, 0.03, 0, 0.64, 0.06, 0.46, 0, 0);
  b.color('#3c4a3a').pat(PAT.NONE);
  for (const hx of [-0.28, 0, 0.28]) {
    const pts: V3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      pts.push([hx, 0.06 + Math.sin(a) * 0.32, Math.cos(a) * 0.22]);
    }
    b.tube(pts, 0.012, 4);
  }
  // netting skin over the hoops and the two ends
  b.color('#5c8a62').pat(PAT.NET, 0.045);
  const N = 8;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI,
      a1 = ((k + 1) / N) * Math.PI;
    const y0 = 0.06 + Math.sin(a0) * 0.31,
      y1 = 0.06 + Math.sin(a1) * 0.31,
      z0 = Math.cos(a0) * 0.21,
      z1 = Math.cos(a1) * 0.21;
    b.quad([0.29, y0, z0], [0.29, y1, z1], [-0.29, y1, z1], [-0.29, y0, z0]);
    b.triangle([-0.29, 0.06, 0], [-0.29, y0, z0], [-0.29, y1, z1]);
    b.triangle([0.29, 0.06, 0], [0.29, y1, z1], [0.29, y0, z0]);
  }
  b.color('#d9cf9a').pat(PAT.NONE);
  torusTube(b, 0, 0.26, 0.2, 0.06, 0.012, 'z', 8);
  b.pop();
}

/** a trawl net heaped on the quay: lumpy mound in netting, the float line with yellow floats draped over it,
 *  the ground rope with rubber discs along one side */
function netHeap(b: HB, x: number, y: number, z: number, rng: Rng): void {
  b.color('#3f7a5c').pat(PAT.NET, 0.07);
  for (let k = 0; k < 5; k++) {
    const a = rng.next() * 6.28,
      r = rng.next() * 0.7;
    b.rock(x + Math.cos(a) * r, y + 0.15, z + Math.sin(a) * r * 0.7, 0.9 - r * 0.4, 0.38 + rng.next() * 0.15, 0.65, rng, rng.next() * 3, 1);
  }
  b.color('#4f8e6a');
  b.rock(x + 0.2, y + 0.42, z - 0.1, 0.55, 0.3, 0.45, rng, 1.0, 1);
  // float line + floats
  b.color('#d9c37a').pat(PAT.NONE);
  const pts: V3[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const px = x - 1.2 + t * 2.3,
      pz = z + Math.sin(t * 5.0) * 0.45;
    const d = Math.hypot((px - x) / 1.1, (pz - z) / 0.8);
    pts.push([px, y + 0.06 + Math.max(0, 0.62 * (1 - d * d)), pz]);
  }
  b.tube(pts, 0.014, 4);
  b.color('#e8c22e');
  for (let k = 1; k < 10; k += 2) b.sphere(pts[k][0], pts[k][1] + 0.05, pts[k][2], 0.07, 7, 5, 0.8);
  // ground rope with rubber discs
  b.color('#1d1f21');
  for (let k = 0; k < 7; k++) {
    const px = x - 1.0 + k * 0.32;
    b.cyl([px - 0.04, y + 0.1, z + 0.75], [px + 0.04, y + 0.1, z + 0.75], 0.1, 0.1, 8, 3);
  }
  b.cyl([x - 1.1, y + 0.1, z + 0.75], [x + 1.1, y + 0.1, z + 0.75], 0.03, 0.03, 5, 0);
}

/** counterbalance forklift (2.5 t): chassis + counterweight, overhead guard, seat + wheel, mast + carriage +
 *  forks (lowered), four wheels */
function forklift(b: HB, x: number, y: number, z: number, yaw: number): void {
  b.pushT(x, y, z, yaw);
  // +z = forks
  b.color('#e0a21b').pat(PAT.RUST, 0.15);
  b.box(0, 0.6, 0.1, 1.1, 0.6, 1.5, 0, 0);
  b.box(0, 0.75, -0.85, 1.12, 0.9, 0.5, 0, 0);
  b.color('#2a2c2e').pat(PAT.NONE);
  b.box(0, 0.92, 0.2, 0.42, 0.06, 0.46, 0, 0);
  b.box(0, 1.1, -0.06, 0.42, 0.42, 0.08, 0, 0);
  b.cyl([0, 1.0, 0.6], [0, 1.35, 0.5], 0.03, 0.03, 5, 0);
  torusTube(b, 0, 1.36, 0.48, 0.15, 0.015, 'y', 12);
  // overhead guard
  b.color('#25282b');
  for (const sx of [-0.48, 0.48]) {
    b.beam([sx, 0.9, -0.4], [sx, 2.1, -0.4], 0.06, 0.06);
    b.beam([sx, 0.9, 0.62], [sx, 2.1, 0.55], 0.06, 0.06);
  }
  b.box(0, 2.12, 0.08, 1.02, 0.05, 1.05, 0, 0);
  for (let k = 0; k < 5; k++) b.box(0, 2.1, -0.35 + k * 0.22, 0.98, 0.04, 0.04, 0, 0);
  // mast, carriage, forks
  b.color('#2f3236');
  for (const sx of [-0.33, 0.33]) b.box(sx, 1.15, 0.95, 0.09, 2.2, 0.12, 0, 0);
  b.box(0, 2.22, 0.95, 0.75, 0.08, 0.12, 0, 0);
  b.box(0, 0.42, 1.05, 0.8, 0.5, 0.06, 0, 0);
  b.color('#3d4044');
  for (const sx of [-0.25, 0.25]) {
    b.box(sx, 0.38, 1.1, 0.1, 0.45, 0.05, 0, 0);
    b.box(sx, 0.05, 1.68, 0.1, 0.04, 1.15, 0, 0);
  }
  // wheels
  b.color('#141516');
  for (const [wx, wz, r] of [
    [-0.5, 0.65, 0.3],
    [0.5, 0.65, 0.3],
    [-0.48, -0.75, 0.24],
    [0.48, -0.75, 0.24],
  ])
    b.cyl([wx - 0.11, r, wz], [wx + 0.11, r, wz], r, r, 12, 3);
  b.color('#c9c4b6');
  for (const [wx, wz] of [
    [-0.62, 0.65],
    [0.62, 0.65],
  ])
    b.cyl([wx - 0.005, 0.3, wz], [wx + 0.005, 0.3, wz], 0.15, 0.15, 10, 3);
  // amber beacon on the guard
  b.color('#e8a21c');
  b.vcyl(0.38, 2.14, -0.4, 0.05, 0.08, 8, 2);
  b.pop();
}

/** fishermen's store: tarred timber shed with a lean-to roof, a door, a small window, oilskins on pegs, buoys
 *  and dan buoys against the wall, a bench in front */
function store(b: HB, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const H = 2.5,
    H2 = 2.9;
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  // walls (vertical boards), door + window on the east face (x1) toward the quay edge
  b.color('#3b3330').pat(PAT.PLANKS_Z, 0.18);
  b.quad([x1, y, z0], [x1, y + H, z0], [x1, y + H, z1], [x1, y, z1]);
  b.quad([x0, y, z1], [x0, y + H2, z1], [x0, y + H2, z0], [x0, y, z0]);
  b.pat(PAT.PLANKS_X, 0.18);
  b.quad([x0, y, z0], [x0, y + H2, z0], [x1, y + H, z0], [x1, y, z0]);
  b.quad([x1, y, z1], [x1, y + H, z1], [x0, y + H2, z1], [x0, y, z1]);
  // roof: corrugated sheet with overhang, rusty
  b.color('#6b6a64').pat(PAT.CORRUGATED, 0.076);
  b.quad([x1 + 0.3, y + H - 0.04, z0 - 0.25], [x0 - 0.2, y + H2 + 0.04, z0 - 0.25], [x0 - 0.2, y + H2 + 0.04, z1 + 0.25], [x1 + 0.3, y + H - 0.04, z1 + 0.25]);
  b.color('#5a3d2c').pat(PAT.RUST, 0.6);
  b.quad([x1 + 0.3, y + H - 0.05, z1 + 0.25], [x0 - 0.2, y + H2 + 0.03, z1 + 0.25], [x0 - 0.2, y + H2 + 0.03, z0 - 0.25], [x1 + 0.3, y + H - 0.05, z0 - 0.25]);
  b.pat(PAT.NONE);
  // door (planked, painted blue, frame), latch, step
  const dz = cz + 0.5;
  b.color('#2f5f7a').pat(PAT.PLANKS_Z, 0.12);
  b.box(x1 + 0.03, y + 1.0, dz, 0.05, 2.0, 0.95, 0, 0);
  b.color('#1f2427').pat(PAT.NONE);
  b.box(x1 + 0.04, y + 2.04, dz, 0.07, 0.08, 1.1, 0, 0);
  b.box(x1 + 0.07, y + 1.05, dz - 0.36, 0.04, 0.04, 0.12, 0, 0);
  b.color('#8d8a82');
  b.box(x1 + 0.2, y + 0.06, dz, 0.4, 0.12, 1.1, 0, 0);
  // window: frame, four panes, sill
  const wz = cz - 1.0;
  b.color('#d8d4c8');
  b.box(x1 + 0.03, y + 1.5, wz, 0.05, 0.75, 0.75, 0, 0);
  b.color('#1d2a33').pat(PAT.GLASS);
  for (const [oy, oz] of [
    [-0.17, -0.17],
    [-0.17, 0.17],
    [0.17, -0.17],
    [0.17, 0.17],
  ])
    b.box(x1 + 0.06, y + 1.5 + oy, wz + oz, 0.01, 0.3, 0.3, 0, 0);
  b.color('#d8d4c8').pat(PAT.NONE);
  b.box(x1 + 0.1, y + 1.1, wz, 0.16, 0.05, 0.85, 0, 0);
  // oilskins on pegs (yellow jacket, orange bib-and-brace), boots below
  const pegZ = z1 - 0.45;
  b.color('#3b3330');
  b.box(x1 + 0.05, y + 1.75, pegZ, 0.06, 0.06, 0.7, 0, 0);
  b.color('#e8c21c');
  b.box(x1 + 0.12, y + 1.35, pegZ - 0.17, 0.1, 0.75, 0.42, 0, 0);
  b.color('#e3622a');
  b.box(x1 + 0.1, y + 1.25, pegZ + 0.2, 0.06, 0.95, 0.32, 0, 0);
  b.color('#1d3b2a');
  for (const oz of [-0.12, 0.05]) {
    b.box(x1 + 0.12, y + 0.2, pegZ + oz, 0.12, 0.4, 0.11, 0, 0);
    b.box(x1 + 0.2, y + 0.03, pegZ + oz, 0.27, 0.06, 0.11, 0, 0);
  }
  // bench + fish box seat in front
  b.color('#8a6a48').pat(PAT.PLANKS_Z, 0.12);
  b.box(x1 + 0.35, y + 0.44, cz - 2.0, 0.35, 0.05, 1.5, 0, 0);
  b.pat(PAT.NONE);
  b.color('#5a4634');
  for (const oz of [-0.6, 0.6]) b.box(x1 + 0.35, y + 0.21, cz - 2.0 + oz, 0.3, 0.42, 0.06, 0, 0);
  // buoys and dan buoys stacked against the north wall
  b.color('#e8672c');
  for (let k = 0; k < 6; k++) b.sphere(x0 + 0.4 + (k % 3) * 0.42, y + 0.2 + Math.floor(k / 3) * 0.33, z0 - 0.28, 0.2, 9, 6, 1);
  for (let k = 0; k < 3; k++) {
    const px = x1 - 0.6 - k * 0.35;
    b.color('#d8d4c8');
    b.cyl([px, y, z0 - 0.35], [px + 0.05, y + 3.0, z0 - 0.05], 0.025, 0.02, 5, 1);
    b.color(k === 1 ? '#e2c22a' : '#1d1f22');
    b.quad([px + 0.05, y + 2.6, z0 - 0.06], [px + 0.05, y + 2.95, z0 - 0.06], [px + 0.42, y + 2.95, z0 - 0.06], [px + 0.42, y + 2.6, z0 - 0.06]);
    b.quad([px + 0.42, y + 2.6, z0 - 0.065], [px + 0.42, y + 2.95, z0 - 0.065], [px + 0.05, y + 2.95, z0 - 0.065], [px + 0.05, y + 2.6, z0 - 0.065]);
    b.color('#e8582a');
    b.cyl([px + 0.01, y + 0.45, z0 - 0.31], [px + 0.02, y + 0.8, z0 - 0.29], 0.17, 0.17, 10, 3);
  }
}

/** standpipe with a hose reel and the hose run out across the quay */
function hose(b: HB, x: number, y: number, z: number, toX: number, toZ: number): void {
  b.color('#3a5f8a').pat(PAT.RUST, 0.3);
  b.vcyl(x, y, z, 0.06, 0.9, 8, 2);
  b.color('#c9a43a').pat(PAT.NONE);
  b.cyl([x + 0.05, y + 0.75, z], [x + 0.14, y + 0.75, z], 0.03, 0.03, 6, 3);
  // reel on a frame
  b.color('#2a2c2e');
  for (const oz of [-0.25, 0.25]) b.box(x + 0.5, y + 0.35, z + oz, 0.06, 0.7, 0.06, 0, 0);
  b.color('#7d1f1a');
  for (let k = 0; k < 5; k++) torusTube(b, x + 0.5, y + 0.55, z, 0.18 + k * 0.025, 0.02, 'z', 14);
  // run out
  b.color('#8b2722');
  const pts: V3[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    pts.push([x + 0.5 + (toX - x - 0.5) * t + Math.sin(t * 9) * 0.25, y + 0.025, z + (toZ - z) * t + Math.cos(t * 7) * 0.3]);
  }
  pts[0][1] = y + 0.4;
  b.tube(pts, 0.022, 5);
}

/** ground stain decal (oil, wet, fish-water) 1.5 cm above the quay */
function stain(b: HB, x: number, y: number, z: number, w: number, d: number, col: string, scale: number): void {
  b.color(col).pat(PAT.STAIN, scale);
  b.quad([x - w / 2, y + 0.015, z - d / 2], [x - w / 2, y + 0.015, z + d / 2], [x + w / 2, y + 0.015, z + d / 2], [x + w / 2, y + 0.015, z - d / 2]);
  b.pat(PAT.NONE);
}

/** hanging tyre on the quay wall face (x = wall), chain to an eye on the coping */
function wallTyre(b: HB, wallX: number, y: number, z: number): void {
  b.color('#151617').pat(PAT.NONE);
  torusTube(b, wallX + 0.14, y - 0.5, z, 0.3, 0.12, 'x', 16);
  b.color('#4a3a30');
  b.cyl([wallX + 0.16, y - 0.18, z], [wallX + 0.05, y + 0.05, z], 0.015, 0.015, 4, 0);
}

export interface FishQuayOpts {
  ground: Ground;
  rng: Rng;
  quayX: number;
  low: boolean;
  /** fish berth (world) and the bollards its lines run to: eyes on them aimed at the boat */
  lines: { bollard: THREE.Vector3; boat: THREE.Vector3 }[];
}

export function buildFishQuay(b: HB, o: FishQuayOpts): void {
  const { ground: gy, rng, quayX: QX } = o;
  const y = (x: number, z: number) => gy(x, z);
  // store at the far north-west of the strip
  store(b, 127.4, -139.6, 130.4, -134.6, y(129, -137));
  // trawl net heap + its pallet of floats beside the store
  netHeap(b, 132.2, y(132.2, -137.6), -137.6, rng);
  // creels stacked for loading beside the crabber (rows of 3, 3–4 high), a few loose
  let k = 0;
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3; col++) {
      const n = 3 + ((row + col) % 2);
      for (let lev = 0; lev < n; lev++) {
        const cx = 133.3 + row * 0.5,
          cz = -129.2 + col * 0.7;
        creel(b, cx + (rng.next() - 0.5) * 0.04, y(cx, cz) + lev * 0.37, cz, Math.PI / 2 + (k++ % 3) * 0.03 - 0.03);
      }
    }
  creel(b, 132.3, y(132.3, -127.4), -127.4, 1.2);
  creel(b, 134.6, y(134.6, -126.6), -126.6, 0.3);
  // fish boxes: stacks on pallets by the boat, the top ones iced with the catch
  pallet(b, 131.4, y(131.4, -124.6), -124.6, 0.05);
  fishBoxStack(b, 131.1, y(131.1, -124.6) + 0.143, -124.4, 4, 0.06, rng, true);
  fishBoxStack(b, 131.8, y(131.8, -124.6) + 0.143, -124.8, 3, -0.04, rng, true);
  fishBoxStack(b, 133.0, y(133.0, -123.5), -123.5, 5, 0.3, rng, false);
  fishBoxStack(b, 132.3, y(132.3, -122.9), -122.9, 2, -0.2, rng, true);
  pallet(b, 128.4, y(128.4, -126.5), -126.5, 0.0, '#a58456');
  pallet(b, 128.45, y(128.4, -126.5) + 0.144, -126.45, 0.04, '#9b7b52');
  pallet(b, 128.4, y(128.4, -126.5) + 0.288, -126.55, -0.03, '#b29062');
  // forklift waiting with its forks toward the fish-box pallet
  forklift(b, 129.6, y(129.6, -123.2), -123.2, Math.PI / 2 - 0.25);
  // hose from the standpipe at the store across to the boat's side
  hose(b, 130.9, y(130.9, -133.5), -133.5, 135.2, -128.5);
  // rope eyes on the bollards used by the crabber's lines
  for (const l of o.lines) ropeEye(b, l.bollard.x, l.bollard.y, l.bollard.z, l.boat.x, l.boat.y, l.boat.z, '#d6c48e');
  // tyres hung on the wall face along the berth
  for (const z of [-127.5, -124.8, -122.1, -119.4]) wallTyre(b, QX, y(QX - 0.3, z), z);
  // a second net (blue monofilament, orange floats) on a pallet, a chilled fish container with its reefer unit,
  // oil drums, a hawser coil on a pallet, empty boxes waiting
  pallet(b, 129.6, y(129.6, -130.4), -130.4, 0.2, '#a58456');
  b.color('#2f5f9a').pat(PAT.NET, 0.05);
  b.rock(129.6, y(129.6, -130.4) + 0.38, -130.4, 0.62, 0.32, 0.5, rng, 0.4, 1);
  b.rock(129.85, y(129.6, -130.4) + 0.55, -130.25, 0.4, 0.22, 0.35, rng, 1.3, 1);
  b.color('#e8672c').pat(PAT.NONE);
  for (let k = 0; k < 5; k++) b.sphere(129.2 + k * 0.2, y(129.6, -130.4) + 0.5 + Math.sin(k * 1.3) * 0.12, -130.85 + k * 0.1, 0.06, 6, 4, 0.8);
  {
    const cx = 128.55,
      cz = -127.6,
      cy = y(cx, cz);
    b.color('#e9ebe7').pat(PAT.CORRUGATED, 0.1);
    b.box(cx, cy + 1.3, cz, 2.44, 2.6, 3.0, 0, 0);
    b.pat(PAT.NONE).color('#c9ccc8');
    b.box(cx, cy + 0.06, cz, 2.5, 0.12, 3.06, 0, 0);
    b.box(cx, cy + 2.62, cz, 2.5, 0.08, 3.06, 0, 0);
    // doors on the quay side (+x) with locking bars, reefer unit on the south end
    b.color('#d9dcd8');
    b.box(cx + 1.23, cy + 1.3, cz, 0.04, 2.4, 2.8, 0, 0);
    b.color('#5b6064');
    for (const dz of [-1.0, -0.4, 0.4, 1.0]) b.box(cx + 1.27, cy + 1.3, cz + dz, 0.04, 2.3, 0.04, 0, 0);
    b.color('#3a3f44');
    b.box(cx, cy + 1.3, cz + 1.55, 2.2, 2.3, 0.12, 0, 0);
    b.color('#1d2125');
    for (const dx of [-0.5, 0.5]) b.cyl([cx + dx, cy + 1.65, cz + 1.6], [cx + dx, cy + 1.65, cz + 1.63], 0.33, 0.33, 12, 3);
    b.color('#b8bcbe');
    b.box(cx + 0.7, cy + 0.6, cz + 1.62, 0.5, 0.4, 0.03, 0, 0);
    // drip stain + a hose from the reefer drain
    stain(b, cx + 0.2, cy, cz + 2.0, 1.4, 1.0, '#575c5b', 0.4);
  }
  b.color('#2f5f8a').pat(PAT.RUST, 0.45);
  for (const [dx, dz] of [
    [0, 0],
    [0.62, 0.1],
    [0.3, 0.6],
  ])
    b.vcyl(130.4 + dx, y(130.4, -136.2), -136.2 + dz, 0.29, 0.88, 12, 2);
  b.color('#6b3a24').pat(PAT.RUST, 0.8);
  b.cyl([131.3, y(131, -135.5) + 0.29, -135.5], [131.3, y(131, -135.5) + 0.29, -134.62], 0.29, 0.29, 12, 3);
  b.pat(PAT.NONE);
  pallet(b, 134.3, y(134.3, -134.4), -134.4, 0.1);
  b.color('#d6c48e');
  for (let k = 0; k < 4; k++) torusTube(b, 134.3, y(134.3, -134.4) + 0.2 + k * 0.08, -134.4, 0.48 - k * 0.07, 0.04, 'y', 18);
  fishBoxStack(b, 130.3, y(130.3, -127.4), -127.4, 6, 0.15, rng, false);
  fishBoxStack(b, 130.9, y(130.9, -127.0), -127.0, 4, -0.1, rng, false);
  if (o.low) return;
  stain(b, 130.6, y(130.6, -135.8), -135.8, 1.8, 1.6, '#3b3a36', 0.3);
  stain(b, 133.0, y(133.0, -132.0), -132.0, 3.5, 2.5, '#626660', 0.7);
  // stains: wet patch round the boxes and the hose end, oil under the forklift, fish-water by the creels
  stain(b, 131.6, y(131.6, -124.2), -124.2, 3.0, 2.4, '#5d625f', 0.55);
  stain(b, 134.9, y(134.9, -128.3), -128.3, 1.6, 2.2, '#585d5c', 0.45);
  stain(b, 129.7, y(129.7, -123.0), -123.0, 1.6, 1.4, '#3b3a36', 0.35);
  stain(b, 133.6, y(133.6, -128.5), -128.5, 2.4, 2.8, '#6a6658', 0.6);
  stain(b, 128.9, y(128.9, -133.0), -133.0, 2.0, 1.6, '#615f58', 0.5);
  // a few spilled bits: a dropped glove, rope ends, a crushed can, a gull feather — the life between jobs
  b.color('#e3622a');
  b.box(132.7, y(132.7, -126.1) + 0.012, -126.1, 0.11, 0.024, 0.22, 0.5, 0);
  b.color('#c9b97a');
  b.tube(
    [
      [134.2, y(134, -125) + 0.02, -125.5],
      [134.6, y(134, -125) + 0.02, -125.1],
      [134.3, y(134, -125) + 0.02, -124.6],
      [134.8, y(134, -125) + 0.02, -124.2],
    ],
    0.016,
    4,
  );
  b.color('#9aa3a8');
  b.cyl([130.2, y(130.2, -128.8) + 0.03, -128.8], [130.32, y(130.2, -128.8) + 0.03, -128.75], 0.03, 0.03, 7, 3);
}
