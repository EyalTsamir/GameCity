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

export type Surround = 'grate' | 'roundgrate' | 'verge' | 'planter' | 'roundplanter' | 'none';

/**
 * Ground treatment at the foot of a tree. (x,z) trunk, y ground (sidewalk top for street trees),
 * yaw = along the street. Returns the height of the soil surface the trunk should start from.
 */
export function surround(sh: Shaper, w: Wind, kind: Surround, x: number, y: number, z: number, yaw: number, rng: Rng): number {
  w.at(x, y, z, 0, 0, 0);
  sh.frame(x, y, z, yaw);
  switch (kind) {
    case 'grate': {
      sh.color('#3d3a36').box(0, 0.006, 0, 1.36, 0.032, 0.76, 1);
      sh.color('#4a3426').box(0, 0.012, 0, 0.62, 0.03, 0.42, 1);
      sh.color('#2c2b29');
      for (const dx of [-0.48, -0.36, 0.36, 0.48]) sh.box(dx, 0.016, 0, 0.04, 0.03, 0.66, 1);
      return y + 0.02;
    }
    case 'roundgrate': {
      sh.color('#33302c').cyl(0, -0.01, 0, 0.62, 0.62, 0.035, 10, 2, false);
      sh.color('#4a3426').cyl(0, 0, 0, 0.3, 0.3, 0.032, 8, 2, false);
      return y + 0.02;
    }
    case 'verge': {
      sh.color('#7fae4e').box(0, 0.004, 0, 1.5, 0.03, 0.66, 1);
      return y + 0.02;
    }
    case 'planter': {
      const c = rng.chance(0.5) ? '#c9c3b8' : '#a8a198';
      sh.color(c).box(0, 0.23, 0, 1.5, 0.46, 0.7, 1);
      sh.color('#d8d2c6').box(0, 0.47, 0, 1.56, 0.04, 0.76, 1);
      sh.color('#4e3828').box(0, 0.44, 0, 1.38, 0.03, 0.58, 3);
      return y + 0.45;
    }
    case 'roundplanter': {
      const r = 0.95;
      sh.color(rng.chance(0.5) ? '#cfc6b6' : '#b9ab95').cyl(0, 0, 0, r, r * 1.04, 0.5, 12, 0, false);
      sh.color('#ddd5c6').cyl(0, 0.5, 0, r * 1.06, r * 1.06, 0.05, 12, 2, false);
      sh.color('#4e3828').disc(0, 0.53, 0, r * 0.92, 10, 1);
      return y + 0.52;
    }
    default:
      return y;
  }
}
