// Small plants & plant containers for the merged (non-shadow-casting) plant mesh:
// flower clumps and beds, allotment crops, pond reeds and lily pads, tree grates / verges /
// raised planters. All vertex-coloured; wind data via the shared Wind writer.

import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { GeoSink, Shaper } from './geo';
import { Wind, col, blob } from './species';

export const FLOWERS = ['#e63946', '#ff7aa2', '#f6f1ea', '#f4a261', '#b05bd6', '#ffd23f', '#e9496f', '#7a6fe0', '#ff9f43'];

const _c = new THREE.Color();

/** tiny 4-sided star / petal cluster facing up (5 verts, 4 tris) */
function petal(s: GeoSink, x: number, y: number, z: number, r: number, c: THREE.Color, rot: number): void {
  s.colorObj(c, 1.05);
  const top = s.vert(x, y + r * 0.45, z, 0, 1, 0);
  s.colorObj(c, 0.85);
  const ring: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rot + (i / 4) * Math.PI * 2;
    ring.push(s.vert(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5));
  }
  for (let i = 0; i < 4; i++) s.tri(top, ring[(i + 1) % 4], ring[i]);
}

/** low leafy mound (squashed open dome) — 6-sided: 7 verts, 6 tris */
function mound(s: GeoSink, x: number, y: number, z: number, r: number, h: number, c: THREE.Color, rng: Rng): void {
  const base = s.vcount;
  s.colorObj(c, 1.05);
  s.vert(x, y + h, z, 0, 1, 0);
  const rot = rng.range(0, 6.28);
  s.colorObj(c, 0.62);
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    const rr = r * rng.range(0.85, 1.12);
    s.vert(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7);
  }
  for (let i = 0; i < 6; i++) s.tri(base, base + 1 + ((i + 1) % 6), base + 1 + i);
}

/** A clump of flowers: leafy mound with a few blossoms on top. */
export function flowerClump(s: GeoSink, w: Wind, x: number, y: number, z: number, size: number, petalCol: THREE.Color, rng: Rng, leaf = '#4f8f3c'): void {
  w.at(x, y, z, 0.3, 0.9, 0);
  _c.copy(col(leaf));
  mound(s, x, y, z, size, size * 0.7, _c, rng);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, 6.28),
      d = rng.range(0, size * 0.65);
    const pc = _c.copy(petalCol).multiplyScalar(rng.range(0.9, 1.08));
    petal(s, x + Math.cos(a) * d * 0.8, y + size * 0.5 + rng.range(0, size * 0.18) - d * 0.3, z + Math.sin(a) * d * 0.8, size * rng.range(0.26, 0.34), pc, rng.range(0, 6.28));
  }
}

/** taller flower (tulip / lupin / hollyhock style): stalk + coloured head */
export function tallFlower(s: GeoSink, w: Wind, sh: Shaper, x: number, y: number, z: number, h: number, c: THREE.Color, rng: Rng): void {
  w.at(x, y, z, 0.45, 1.0, 0);
  sh.frame(x, y, z, rng.range(0, 6.28));
  sh.color('#4f8a3a').cyl(0, 0, 0, 0.025, 0.018, h, 3, 0, true);
  s.colorObj(c, 1);
  sh.cyl(0, h * 0.72, 0, 0.07, 0.03, h * 0.32, 4, 2, false);
}

export interface BedOpts {
  shape: 'ellipse' | 'rect';
  /** colours for concentric bands (ellipse) / stripes (rect) */
  palette: THREE.Color[];
  edging: THREE.Color | null;
  yaw?: number;
  /** clump spacing */
  step?: number;
  tall?: boolean;
}

/** Flower bed: dark soil mound + stone edging + rows/bands of flower clumps. */
export function flowerBed(s: GeoSink, w: Wind, sh: Shaper, cx: number, cz: number, y: number, rx: number, rz: number, seed: number, o: BedOpts): void {
  const rng = new Rng(seed);
  const yaw = o.yaw ?? 0;
  const cs = Math.cos(yaw),
    sn = Math.sin(yaw);
  const toW = (lx: number, lz: number): [number, number] => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
  w.at(cx, y, cz, 0, 0, 0);
  // soil
  const soil = col('#5a3f2c');
  const base = s.vcount;
  const N = o.shape === 'ellipse' ? 14 : 4;
  s.colorObj(soil, 1.0);
  s.vert(cx, y + 0.1, cz, 0, 1, 0);
  for (let i = 0; i < N; i++) {
    let lx: number, lz: number;
    if (o.shape === 'ellipse') {
      const a = (i / N) * Math.PI * 2;
      lx = Math.cos(a) * rx;
      lz = Math.sin(a) * rz;
    } else {
      lx = (i === 0 || i === 3 ? -1 : 1) * rx;
      lz = (i < 2 ? -1 : 1) * rz;
    }
    const [x, z] = toW(lx, lz);
    s.colorObj(soil, 0.85);
    s.vert(x, y + 0.06, z, 0, 1, 0);
  }
  for (let i = 0; i < N; i++) s.tri(base, base + 1 + ((i + 1) % N), base + 1 + i);
  // edging
  if (o.edging) {
    s.colorObj(o.edging, 1);
    if (o.shape === 'ellipse') {
      const M = 18;
      for (let i = 0; i < M; i++) {
        const a0 = (i / M) * Math.PI * 2,
          a1 = ((i + 1) / M) * Math.PI * 2;
        const [x0, z0] = toW(Math.cos(a0) * (rx + 0.08), Math.sin(a0) * (rz + 0.08));
        const [x1, z1] = toW(Math.cos(a1) * (rx + 0.08), Math.sin(a1) * (rz + 0.08));
        sh.frame(0, 0, 0, 0);
        sh.beam(x0, y + 0.08, z0, x1, y + 0.08, z1, 0.14, 0.16, false);
      }
    } else {
      sh.frame(cx, y, cz, yaw);
      sh.box(0, 0.07, -rz - 0.07, rx * 2 + 0.28, 0.16, 0.14, 1);
      sh.box(0, 0.07, rz + 0.07, rx * 2 + 0.28, 0.16, 0.14, 1);
      sh.box(-rx - 0.07, 0.07, 0, 0.14, 0.16, rz * 2, 1);
      sh.box(rx + 0.07, 0.07, 0, 0.14, 0.16, rz * 2, 1);
    }
  }
  // flowers
  const step = o.step ?? 0.36;
  for (let lz = -rz + step * 0.5; lz < rz; lz += step * 0.87) {
    const row = Math.round((lz + rz) / (step * 0.87));
    for (let lx = -rx + step * (row % 2 ? 0.5 : 0.25); lx < rx; lx += step) {
      let band: number;
      if (o.shape === 'ellipse') {
        const q = Math.hypot(lx / rx, lz / rz);
        if (q > 0.92) continue;
        band = Math.min(o.palette.length - 1, Math.floor((1 - q) * o.palette.length * 1.05));
      } else {
        if (Math.abs(lx) > rx - 0.12 || Math.abs(lz) > rz - 0.12) continue;
        band = Math.floor(((lx + rx) / (2 * rx)) * o.palette.length * 0.999);
      }
      const jx = lx + rng.range(-0.06, 0.06),
        jz = lz + rng.range(-0.06, 0.06);
      const [x, z] = toW(jx, jz);
      if (o.tall && band === o.palette.length - 1 && o.shape === 'ellipse') tallFlower(s, w, sh, x, y + 0.08, z, rng.range(0.5, 0.75), o.palette[band], rng);
      else flowerClump(s, w, x, y + 0.07, z, step * rng.range(0.5, 0.62), o.palette[band], rng);
    }
  }
}

// ──────────────────────────────────────────────────────────────── crops ──

/** Raised soil row (the bed itself). */
export function soilRow(sh: Shaper, w: Wind, ax: number, az: number, bx: number, bz: number, y: number, width: number): void {
  w.at(ax, y, az, 0, 0, 0);
  sh.frame(0, 0, 0, 0);
  sh.color('#5b3e2a');
  sh.beam(ax, y + 0.06, az, bx, y + 0.06, bz, width, 0.14, true);
}

export function crop(s: GeoSink, w: Wind, sh: Shaper, kind: string, x: number, y: number, z: number, rng: Rng): void {
  switch (kind) {
    case 'cabbage': {
      w.at(x, y, z, 0.2, 0.25, 0);
      blob(s, x, y + 0.13, z, 0.2, 0.15, 0.2, _c.set('#7fa86a').multiplyScalar(rng.range(0.9, 1.08)), 0, 0.7);
      break;
    }
    case 'lettuce': {
      w.at(x, y, z, 0.2, 0.4, 0);
      mound(s, x, y, z, 0.17, 0.15, _c.set(rng.chance(0.3) ? '#8a4f6a' : '#8cc45a'), rng);
      break;
    }
    case 'carrot': {
      w.at(x, y, z, 0.6, 1.0, 0);
      sh.frame(x, y, z, rng.range(0, 6.28));
      sh.color('#5f9f3e').cone(0, 0, 0, 0.11, rng.range(0.22, 0.32), 4, false);
      break;
    }
    case 'beans': {
      w.at(x, y, z, 0.25, 0.8, 0);
      sh.frame(x, y, z, rng.range(0, 6.28));
      sh.color('#8a6a48');
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        sh.tube(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32, 0, 1.75, 0, 0.022, 0.014, 3);
      }
      sh.color('#4f9a3a').cone(0, 0.25, 0, 0.36, 1.35, 6, false);
      s.colorObj(col('#e8e0c8'), 1);
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, 6.28);
        petal(s, x + Math.cos(a) * 0.18, y + rng.range(0.5, 1.2), z + Math.sin(a) * 0.18, 0.05, col('#e94a3c'), a);
      }
      break;
    }
    case 'corn': {
      w.at(x, y, z, 0.5, 0.9, 0);
      const h = rng.range(1.3, 1.7);
      sh.frame(x, y, z, rng.range(0, 6.28));
      sh.color('#7aa848').cyl(0, 0, 0, 0.035, 0.02, h, 3, 0, true);
      sh.color('#6c9c3e');
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4,
          yy = h * (0.3 + i * 0.2);
        sh.quad4([0, yy, 0, Math.cos(a) * 0.45, yy + 0.25, Math.sin(a) * 0.45, Math.cos(a + 0.25) * 0.4, yy + 0.32, Math.sin(a + 0.25) * 0.4, 0, yy + 0.1, 0], true);
      }
      sh.color('#e3c45a').cyl(0, h - 0.05, 0, 0.03, 0.005, 0.22, 3, 0, false);
      break;
    }
    case 'sunflower': {
      w.at(x, y, z, 0.45, 0.6, 0);
      const h = rng.range(1.5, 2.1);
      sh.frame(x, y, z, 0);
      sh.color('#5d8f3a').cyl(0, 0, 0, 0.035, 0.025, h, 3, 0, true);
      sh.frame(x, y + h, z + 0.05, Math.PI * 0.85);
      sh.local(0, 0, 0, -1.05);
      sh.color('#f2c230').cyl(0, 0, 0, 0.26, 0.26, 0.04, 8, 2, false);
      sh.color('#6b4424').cyl(0, 0.04, 0, 0.12, 0.1, 0.02, 6, 2, false);
      break;
    }
    case 'pumpkin': {
      w.at(x, y, z, 0.1, 0.3, 0);
      mound(s, x, y, z, 0.38, 0.14, _c.set('#5e9842'), rng);
      blob(s, x + 0.08, y + 0.14, z - 0.05, 0.2, 0.14, 0.2, _c.set(rng.chance(0.7) ? '#e8892c' : '#e2b23c'), 0, 0.7);
      break;
    }
    default: {
      // berry bushes
      w.at(x, y, z, 0.3, 0.6, 0);
      mound(s, x, y, z, 0.28, 0.38, _c.set('#4c8a3a'), rng);
      for (let i = 0; i < 4; i++) {
        const a = rng.range(0, 6.28);
        petal(s, x + Math.cos(a) * 0.18, y + 0.3, z + Math.sin(a) * 0.18, 0.05, col(rng.chance(0.5) ? '#c8203a' : '#3b2a6a'), a);
      }
    }
  }
}

// ──────────────────────────────────────────────────────── pond plants ──

/** Reed clump: thin bent blades + a couple of bulrush heads. */
export function reeds(s: GeoSink, w: Wind, sh: Shaper, x: number, y: number, z: number, rng: Rng, tall = 1): void {
  const n = rng.int(6, 9);
  w.at(x, y, z, 0.5, 0.6, 0);
  const green = col(rng.pick(['#6f9a45', '#7aa24c', '#86a952', '#6a9142']));
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, 6.28);
    const h = rng.range(0.9, 1.6) * tall;
    const lean = rng.range(0.1, 0.35);
    const bx = x + Math.cos(a) * rng.range(0, 0.18),
      bz = z + Math.sin(a) * rng.range(0, 0.18);
    const tx = bx + Math.cos(a) * lean,
      tz = bz + Math.sin(a) * lean;
    const mx = (bx * 0.6 + tx * 0.4) + Math.cos(a) * lean * 0.1,
      mz = (bz * 0.6 + tz * 0.4) + Math.sin(a) * lean * 0.1;
    const px = -Math.sin(a) * 0.035,
      pz = Math.cos(a) * 0.035;
    const shade = rng.range(0.85, 1.1);
    s.colorObj(green, 0.7 * shade);
    const b0 = s.vert(bx - px, y, bz - pz, Math.cos(a), 0.3, Math.sin(a));
    const b1 = s.vert(bx + px, y, bz + pz, Math.cos(a), 0.3, Math.sin(a));
    s.colorObj(green, 0.95 * shade);
    const m0 = s.vert(mx - px * 0.7, y + h * 0.55, mz - pz * 0.7, Math.cos(a), 0.3, Math.sin(a));
    const m1 = s.vert(mx + px * 0.7, y + h * 0.55, mz + pz * 0.7, Math.cos(a), 0.3, Math.sin(a));
    s.colorObj(green, 1.1 * shade);
    const t = s.vert(tx, y + h, tz, Math.cos(a), 0.4, Math.sin(a));
    // both sides
    s.quad(b0, b1, m1, m0);
    s.quad(b0, m0, m1, b1);
    s.tri(m0, m1, t);
    s.tri(m0, t, m1);
  }
  // bulrushes
  const nb = rng.int(1, 3);
  for (let i = 0; i < nb; i++) {
    const a = rng.range(0, 6.28);
    const h = rng.range(1.2, 1.7) * tall;
    const bx = x + Math.cos(a) * 0.1,
      bz = z + Math.sin(a) * 0.1;
    sh.frame(bx, y, bz, 0);
    sh.color('#7a8f48').cyl(0, 0, 0, 0.012, 0.01, h, 3, 0, true);
    sh.color('#5e3b22').cyl(0, h - 0.05, 0, 0.04, 0.035, 0.24, 5, 2, true);
  }
}

/** Floating lily pad (notched disc), sometimes with a flower. */
export function lily(s: GeoSink, w: Wind, x: number, y: number, z: number, r: number, rng: Rng): void {
  w.at(x, y, z, 0, 0.15, 0);
  const n = 8;
  const rot = rng.range(0, 6.28);
  const c = col(rng.pick(['#4f8a3c', '#5a9442', '#46803a']));
  s.colorObj(c, 1);
  const cen = s.vert(x, y, z, 0, 1, 0);
  const ring: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rot + 0.35 + (i / n) * (Math.PI * 2 - 0.7);
    s.colorObj(c, 0.85 + 0.15 * Math.sin(i * 1.7));
    ring.push(s.vert(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, 1, 0));
  }
  for (let i = 0; i < n; i++) s.tri(cen, ring[i + 1], ring[i]);
  if (rng.chance(0.3)) petal(s, x + rng.range(-0.08, 0.08), y + 0.02, z + rng.range(-0.08, 0.08), 0.12, col(rng.chance(0.5) ? '#f6d6e2' : '#f7f2ea'), rot);
}

// ──────────────────────────────────────────────────── tree surrounds ──

const STONES = ['#cbc3b4', '#bdb3a3', '#c7bfb2', '#b3aa9b', '#d0c8ba'];
const LITTER = ['#7a5a30', '#a07a3a', '#6b6a34', '#5a4428', '#b08840', '#8a4a2a', '#4f5a2c'];

/**
 * Weathered precast planter on the polygon `pts` (local xz, counter-clockwise seen from above), wall height
 * hgt: splash grime and green algae at the foot, per-panel tone drift, a worn lighter rim with chipped edges,
 * damp dark soil with fallen leaves. Returns the soil height above the base.
 */
function stonePlanter(sh: Shaper, rng: Rng, pts: [number, number][], hgt: number): number {
  const s = sh.s;
  const base = new THREE.Color(rng.pick(STONES));
  const n = pts.length;
  const soilY = hgt - 0.05;
  const levels: [number, number][] = [
    [0, 0.58],
    [0.07, 0.72],
    [0.16, 0.9],
    [hgt, 1.0],
  ];
  const algae = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[(i + 1) % n];
    const ex = bx - ax,
      ez = bz - az;
    const el = Math.hypot(ex, ez) || 1;
    // outward normal of a counter-clockwise polygon in local xz (+x right, +z towards the viewer)
    const nx = ez / el,
      nz = -ex / el;
    const jit = rng.range(0.92, 1.06);
    // algae / moss on the shaded side of the foot
    const green = Math.max(0, Math.cos(Math.atan2(nz, nx) - algae)) * rng.range(0.4, 1);
    const idx: number[] = [];
    for (const [ly, k] of levels) {
      const g = ly < 0.1 ? green : 0;
      s.rgb(base.r * k * jit * (1 - 0.25 * g), base.g * k * jit * (1 - 0.08 * g), base.b * k * jit * (1 - 0.4 * g));
      idx.push(sh.v(ax, ly, az, nx, 0, nz), sh.v(bx, ly, bz, nx, 0, nz));
    }
    for (let k = 0; k < levels.length - 1; k++) s.quad(idx[k * 2], idx[k * 2 + 2], idx[k * 2 + 3], idx[k * 2 + 1]);
  }
  // rim: outer lip + worn top band + inner edge, edge heights chipped a few mm
  const rimO = 1.05,
    rimI = 0.86;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[(i + 1) % n];
    const ex = bx - ax,
      ez = bz - az;
    const el = Math.hypot(ex, ez) || 1;
    const nx = ez / el,
      nz = -ex / el;
    const ca = rng.range(-0.006, 0.004),
      cb = rng.range(-0.006, 0.004);
    const wear = rng.range(1.02, 1.12);
    s.rgb(base.r * 0.88, base.g * 0.88, base.b * 0.86);
    const l0 = sh.v(ax * rimO, hgt - 0.02, az * rimO, nx, 0, nz),
      l1 = sh.v(bx * rimO, hgt - 0.02, bz * rimO, nx, 0, nz);
    const l2 = sh.v(ax * rimO, hgt + 0.045 + ca, az * rimO, nx, 0.2, nz),
      l3 = sh.v(bx * rimO, hgt + 0.045 + cb, bz * rimO, nx, 0.2, nz);
    s.quad(l0, l2, l3, l1);
    s.rgb(base.r * wear, base.g * wear, base.b * wear * 0.98);
    const t0 = sh.v(ax * rimO, hgt + 0.045 + ca, az * rimO, 0, 1, 0),
      t1 = sh.v(bx * rimO, hgt + 0.045 + cb, bz * rimO, 0, 1, 0);
    s.rgb(base.r * 0.9, base.g * 0.9, base.b * 0.88);
    const t2 = sh.v(ax * rimI, hgt + 0.045, az * rimI, 0, 1, 0),
      t3 = sh.v(bx * rimI, hgt + 0.045, bz * rimI, 0, 1, 0);
    s.quad(t2, t3, t1, t0);
    // inner wall down to the soil (shaded)
    s.rgb(base.r * 0.5, base.g * 0.48, base.b * 0.45);
    const i0 = sh.v(ax * rimI, hgt + 0.045, az * rimI, -nx, 0, -nz),
      i1 = sh.v(bx * rimI, hgt + 0.045, bz * rimI, -nx, 0, -nz);
    const i2 = sh.v(ax * rimI, soilY, az * rimI, -nx, 0, -nz),
      i3 = sh.v(bx * rimI, soilY, bz * rimI, -nx, 0, -nz);
    s.quad(i0, i2, i3, i1);
  }
  // soil: damp dark earth, darker towards the rim
  s.rgb(0.13, 0.085, 0.055);
  const c = sh.v(0, soilY + 0.01, 0, 0, 1, 0);
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = rng.range(0.8, 1.05);
    s.rgb(0.09 * d, 0.06 * d, 0.04 * d);
    ring.push(sh.v(pts[i][0] * rimI, soilY, pts[i][1] * rimI, 0, 1, 0));
  }
  for (let i = 0; i < n; i++) s.tri(c, ring[(i + 1) % n], ring[i]);
  // fallen leaves on the soil
  let rmin = 1e9;
  for (const [px, pz] of pts) rmin = Math.min(rmin, Math.hypot(px, pz));
  for (let k = 0; k < 26; k++) {
    const a = rng.range(0, 6.28),
      d = Math.sqrt(rng.next()) * rmin * rimI * 0.85;
    if (d < 0.18) continue;
    const lx = Math.cos(a) * d,
      lz = Math.sin(a) * d;
    const lc = new THREE.Color(rng.pick(LITTER)).multiplyScalar(rng.range(0.75, 1.05));
    s.rgb(lc.r, lc.g, lc.b);
    const r0 = rng.range(0.025, 0.05),
      r1 = r0 * rng.range(0.45, 0.65),
      rot = rng.range(0, 6.28);
    const yy = soilY + 0.006 + rng.range(0, 0.006);
    const cs = Math.cos(rot),
      sn = Math.sin(rot);
    const p0 = sh.v(lx + cs * r0, yy, lz + sn * r0, 0, 1, 0),
      p1 = sh.v(lx - sn * r1, yy, lz + cs * r1, 0, 1, 0),
      p2 = sh.v(lx - cs * r0, yy, lz - sn * r0, 0, 1, 0),
      p3 = sh.v(lx + sn * r1, yy, lz - cs * r1, 0, 1, 0);
    s.quad(p0, p3, p2, p1);
  }
  return soilY;
}

export type Surround = 'grate' | 'roundgrate' | 'kerbgrate' | 'verge' | 'planter' | 'roundplanter' | 'none';

/**
 * Ground treatment at the foot of a tree. (x,z) trunk, y ground (sidewalk top for street trees),
 * yaw = along the street. Returns the height of the soil surface the trunk should start from.
 */
// ─────────────────────────────────────────────────────── tree grates ──
// Cast-iron tree grates as built: a frame flush with the paving, open slots over dark soil, a collar round
// the trunk hole with mulch and fallen leaves in it, rust on some bars; litter blown onto the grate.
// The paving is not cut: the whole grate stands ≤ 3.2 cm proud of it (soil 1.2 cm, bars 2.9, frame 3.2).

const IRON = ['#36312c', '#3b342e', '#2f2d2b', '#3a3632'];
const GRATE_LITTER = ['#7a5a2e', '#8f6a32', '#6a4a2a', '#a07a3a', '#5e4a30', '#9a8a4a'];

/** flat annulus r0..r1 at height y (normal up), optionally with an outer side face down to yb */
function annulus(sh: Shaper, r0: number, r1: number, y: number, n: number, yb?: number): void {
  const s = sh.s;
  const inn: number[] = [],
    out: number[] = [],
    sid: number[] = [],
    bot: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      c = Math.cos(a),
      sn = Math.sin(a);
    inn.push(sh.v(c * r0, y, sn * r0, 0, 1, 0));
    out.push(sh.v(c * r1, y, sn * r1, 0, 1, 0));
    if (yb !== undefined) {
      sid.push(sh.v(c * r1, y, sn * r1, c, 0, sn));
      bot.push(sh.v(c * r1, yb, sn * r1, c, 0, sn));
    }
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s.tri(inn[i], out[j], out[i]);
    s.tri(inn[i], inn[j], out[j]);
    if (yb !== undefined) s.quad(bot[i], bot[j], sid[j], sid[i]);
  }
}

function ironCol(sh: Shaper, base: THREE.Color, rng: Rng, rustK: number): void {
  const k = rng.range(0.85, 1.1),
    r = rng.chance(rustK) ? rng.range(0.25, 0.7) : 0;
  sh.s.rgb((base.r * (1 - r) + 0.36 * r) * k, (base.g * (1 - r) + 0.2 * r) * k, (base.b * (1 - r) + 0.1 * r) * k);
}

/** leaves, a paper bit or a butt on the grate / in the mulch (flat quads, tilted a little) */
function litter(sh: Shaper, rng: Rng, R: number, n: number, y: number): void {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, 6.28),
      r = Math.sqrt(rng.next()) * R;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    const sz = rng.range(0.03, 0.06);
    sh.color(rng.chance(0.12) ? '#d8d2c4' : rng.pick(GRATE_LITTER));
    sh.push().local(x, y + rng.range(0, 0.006), z, rng.range(-0.25, 0.25), rng.range(0, 6.28), rng.range(-0.25, 0.25));
    const v0 = sh.v(-sz, 0, -sz * 0.55, 0, 1, 0),
      v1 = sh.v(sz, 0, -sz * 0.4, 0, 1, 0),
      v2 = sh.v(sz * 0.8, 0, sz * 0.5, 0, 1, 0),
      v3 = sh.v(-sz * 0.9, 0, sz * 0.4, 0, 1, 0);
    sh.s.quad(v0, v3, v2, v1);
    sh.pop();
  }
}

/** trunk-hole radius of each grate surround (crowns.ts fits the trunk foot into it) */
export const GRATE_HOLE: Partial<Record<Surround, number>> = { kerbgrate: 0.24, roundgrate: 0.31, grate: 0.24 };

/** round cast-iron grate of outer radius R (trunk hole = R / 2) */
function roundGrate(sh: Shaper, rng: Rng, R: number): void {
  const iron = new THREE.Color(rng.pick(IRON));
  const rustK = rng.range(0, 0.35);
  const hole = R * 0.5;
  // dark soil seen through the slots, a little sunken; mulch + leaves in the trunk hole
  sh.color('#251b13').disc(0, 0.012, 0, R, 14, 1);
  sh.color(rng.pick(['#3e2c1e', '#4a3422', '#33261a'])).disc(0, 0.016, 0, hole, 10, 1);
  litter(sh, rng, hole * 0.9, 5 + Math.floor(rng.range(0, 5)), 0.018);
  // frame ring flush with the paving (its outer face hides the pit wall), collar round the hole
  ironCol(sh, iron, rng, 0);
  annulus(sh, R - 0.035, R, 0.032, 16, 0);
  annulus(sh, hole, hole + 0.03, 0.03, 10);
  // concentric rings + radial ribs: slots ≈ 2 cm wide
  const rings = Math.max(2, Math.round((R - hole) / 0.075));
  for (let i = 1; i < rings; i++) {
    ironCol(sh, iron, rng, rustK);
    const r = hole + ((R - hole) * i) / rings;
    annulus(sh, r - 0.012, r + 0.012, 0.028, 12 + i * 2);
  }
  const ribs = R > 0.55 ? 16 : 12;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    ironCol(sh, iron, rng, rustK);
    sh.push().local(0, 0, 0, 0, -a, 0);
    sh.box((hole + R) / 2, 0.021, 0, R - hole - 0.02, 0.016, 0.016, 1 | 16 | 32);
    sh.pop();
  }
  litter(sh, rng, R, 3 + Math.floor(rng.range(0, 4)), 0.031);
}

/** rectangular grate 2hx × 2hz: frame, transverse bars, the trunk hole in a square collar */
function rectGrate(sh: Shaper, rng: Rng, hx: number, hz: number): void {
  const iron = new THREE.Color(rng.pick(IRON));
  const rustK = rng.range(0, 0.35);
  const hole = 0.24;
  sh.color('#251b13').box(0, 0.012, 0, hx * 2, 0.002, hz * 2, 1);
  sh.color(rng.pick(['#3e2c1e', '#4a3422', '#33261a'])).box(0, 0.016, 0, hole * 2, 0.002, hole * 2, 1);
  litter(sh, rng, hole * 0.9, 5, 0.018);
  ironCol(sh, iron, rng, 0);
  sh.box(0, 0.016, -hz + 0.02, hx * 2, 0.032, 0.04, 0);
  sh.box(0, 0.016, hz - 0.02, hx * 2, 0.032, 0.04, 0);
  sh.box(-hx + 0.02, 0.016, 0, 0.04, 0.032, hz * 2 - 0.08, 0);
  sh.box(hx - 0.02, 0.016, 0, 0.04, 0.032, hz * 2 - 0.08, 0);
  // collar
  sh.box(0, 0.021, -hole, hole * 2 + 0.06, 0.018, 0.03, 1);
  sh.box(0, 0.021, hole, hole * 2 + 0.06, 0.018, 0.03, 1);
  sh.box(-hole, 0.021, 0, 0.03, 0.018, hole * 2, 1);
  sh.box(hole, 0.021, 0, 0.03, 0.018, hole * 2, 1);
  // bars across the short side, 4.5 cm pitch, interrupted by the hole
  for (let x = -hx + 0.06; x < hx - 0.04; x += 0.045) {
    ironCol(sh, iron, rng, rustK);
    if (Math.abs(x) < hole + 0.01) {
      const l = hz - hole - 0.04;
      sh.box(x, 0.021, -(hole + hz) / 2, 0.016, 0.016, l, 1);
      sh.box(x, 0.021, (hole + hz) / 2, 0.016, 0.016, l, 1);
    } else sh.box(x, 0.021, 0, 0.016, 0.016, hz * 2 - 0.06, 1);
  }
  litter(sh, rng, Math.min(hx, hz), 4, 0.031);
}

/**
 * Open tree pit in the footway (2hx × 2hz): a granite sett edging, trodden soil with patchy grass (greener at the
 * edges, worn bare round the trunk), mulch and leaves. ≤ 4 cm proud of the paving.
 */
function vergePit(sh: Shaper, rng: Rng, hx: number, hz: number): void {
  const s = sh.s;
  // soil bed
  sh.color(rng.pick(['#4a3a2a', '#45372a', '#3f3326'])).box(0, 0.012, 0, hx * 2 - 0.08, 0.004, hz * 2 - 0.08, 1);
  // grass patches: irregular flat blobs, none within ~22 cm of the trunk
  const greens = ['#5b7f38', '#62873c', '#557634', '#6d8a40'];
  for (let i = 0; i < 9; i++) {
    let px = 0,
      pz = 0;
    for (let t = 0; t < 6; t++) {
      px = rng.range(-hx + 0.12, hx - 0.12);
      pz = rng.range(-hz + 0.1, hz - 0.1);
      if (Math.hypot(px, pz) > 0.3) break;
    }
    if (Math.hypot(px, pz) <= 0.3) continue;
    const r = rng.range(0.07, 0.15);
    sh.color(rng.pick(greens));
    const c = sh.v(px, 0.017, pz, 0, 1, 0);
    const ring: number[] = [];
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * rng.range(0.6, 1.25);
      ring.push(sh.v(Math.max(-hx + 0.05, Math.min(hx - 0.05, px + Math.cos(a) * rr)), 0.016, Math.max(-hz + 0.05, Math.min(hz - 0.05, pz + Math.sin(a) * rr)), 0, 1, 0));
    }
    for (let k = 0; k < n; k++) s.tri(c, ring[(k + 1) % n], ring[k]);
  }
  litter(sh, rng, Math.min(hx, hz) * 0.9, 8, 0.018);
  // sett edging: 10 cm granite setts with joints, slightly irregular heights and tones
  const sett = (x: number, z: number, w: number, d: number) => {
    const k = rng.range(0.85, 1.08);
    s.rgb(0.42 * k, 0.41 * k, 0.4 * k);
    sh.box(x, 0.02 + rng.range(-0.004, 0.004), z, w, 0.04, d, 1);
  };
  const pitch = 0.105;
  for (const sz of [-1, 1]) for (let x = -hx + pitch / 2; x < hx - 0.01; x += pitch) sett(x, sz * (hz - 0.05), pitch - 0.012, 0.09);
  for (const sx of [-1, 1]) for (let z = -hz + 0.1 + pitch / 2; z < hz - 0.1; z += pitch) sett(sx * (hx - 0.05), z, 0.09, pitch - 0.012);
}

/** tree guard round a young street tree: 4 flat steel uprights set in the pit, 3 hoops, a rubber tie to the trunk */
export function treeGuard(sh: Shaper, w: Wind, x: number, y: number, z: number, yaw: number, rng: Rng): void {
  w.at(x, y, z, 0, 0, 0);
  sh.frame(x, y, z, yaw + Math.PI / 4);
  const paint = rng.pick(['#232628', '#2b3a33', '#3a3d40']);
  const r = 0.27,
    H = rng.range(1.45, 1.7);
  sh.color(paint);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    sh.push().local(Math.cos(a) * r, 0, Math.sin(a) * r, 0, -a, 0);
    sh.box(0, H / 2 - 0.05, 0, 0.012, H + 0.1, 0.045, 1);
    sh.pop();
  }
  for (const hy of [0.42, H * 0.62, H - 0.03]) sh.cyl(0, hy, 0, r + 0.008, r + 0.008, 0.035, 14, 0);
  // rubber tie across to the trunk at ~1.2 m
  sh.color('#1a1a1a').box(0, H * 0.62 + 0.017, 0, r * 2, 0.025, 0.03, 0);
}

/**
 * Trodden ground at the foot of a park tree (people sit against it, the mower turns round it): a ragged disc of
 * bare compacted earth following the ground, two or three surface roots running out of the flare, leaf litter.
 * `gy` = ground height; drawn 1.5 cm above it.
 */
export function wornPatch(sh: Shaper, w: Wind, x: number, z: number, r: number, gy: (x: number, z: number) => number, rng: Rng): void {
  const s = sh.s;
  w.at(x, gy(x, z), z, 0, 0, 0);
  sh.frame(0, 0, 0, 0);
  const n = 14;
  const earth = rng.pick(['#5a4632', '#4e3e2c', '#625038']);
  sh.color(earth);
  const c = sh.v(x, gy(x, z) + 0.016, z, 0, 1, 0);
  const ring: number[] = [];
  const edge = new THREE.Color(earth).lerp(new THREE.Color('#6f7a3c'), 0.45);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * rng.range(0.7, 1.15);
    const px = x + Math.cos(a) * rr,
      pz = z + Math.sin(a) * rr;
    s.colorObj(edge, 1);
    ring.push(sh.v(px, gy(px, pz) + 0.014, pz, 0, 1, 0));
  }
  for (let k = 0; k < n; k++) s.tri(c, ring[(k + 1) % n], ring[k]);
  // surface roots: half-buried tapering tubes from the flare out across the patch
  const nr = rng.int(2, 3);
  const a0 = rng.range(0, 6.28);
  sh.color(rng.pick(['#5a4a3c', '#4e4238', '#625040']));
  for (let i = 0; i < nr; i++) {
    const a = a0 + (i / nr) * 6.28 + rng.range(-0.4, 0.4);
    const l = r * rng.range(0.7, 1.05);
    const ax = x + Math.cos(a) * 0.18,
      az = z + Math.sin(a) * 0.18,
      bx = x + Math.cos(a + rng.range(-0.2, 0.2)) * l,
      bz = z + Math.sin(a + rng.range(-0.2, 0.2)) * l;
    sh.tube(ax, gy(ax, az) + 0.02, az, bx, gy(bx, bz) + 0.0, bz, 0.05, 0.012, 6);
  }
  sh.frame(x, gy(x, z), z, 0);
  litter(sh, rng, r * 0.9, 6, 0.018);
}

export function surround(sh: Shaper, w: Wind, kind: Surround, x: number, y: number, z: number, yaw: number, rng: Rng): number {
  w.at(x, y, z, 0, 0, 0);
  sh.frame(x, y, z, yaw);
  switch (kind) {
    case 'grate':
      rectGrate(sh, rng, 0.68, 0.38);
      return y + 0.012;
    case 'roundgrate':
      roundGrate(sh, rng, 0.62);
      return y + 0.012;
    case 'kerbgrate':
      // the round grate sized for the 0.8 m furniture band of a street (plazas keep the wide one)
      roundGrate(sh, rng, 0.48);
      return y + 0.012;
    case 'verge':
      vergePit(sh, rng, 0.75, 0.33);
      return y + 0.02;
    case 'planter': {
      const pts: [number, number][] = [
        [-0.75, -0.35],
        [0.75, -0.35],
        [0.75, 0.35],
        [-0.75, 0.35],
      ];
      return y + stonePlanter(sh, rng, pts, 0.46);
    }
    case 'roundplanter': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        pts.push([Math.cos(a) * 0.98, Math.sin(a) * 0.98]);
      }
      return y + stonePlanter(sh, rng, pts, 0.5);
    }
    default:
      return y;
  }
}
