// Procedural plant generators, baked straight into a merged GeoSink.
//
// Broadleaf canopies are "lobed unions": an icosphere is pushed out along each direction to the
// far surface of the union of a few ellipsoid lobes (+ organic noise). That keeps the clustered,
// hand-sculpted silhouette of several leaf masses without any hidden inner faces, and lets every
// lobe carry its own shade. Normals are blended towards the crown centre for a soft painted look;
// vertex colours bake a top-light gradient, crevice darkening and per-lobe tint.
//
// Species: round (lindens/maples), blossom (cherry), autumn, fruit (garden apple trees), birch,
// column (poplar/cypress), conifer (spruce/fir), palm, willow — plus bushes and clipped hedges.

import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { GeoSink, icoTpl } from './geo';

export type Species = 'round' | 'blossom' | 'autumn' | 'fruit' | 'birch' | 'column' | 'conifer' | 'palm' | 'willow';

export interface TreeSpec {
  sp: Species;
  x: number;
  y: number;
  z: number;
  /** total height (m) */
  h: number;
  /** canopy radius (m) */
  r: number;
  seed: number;
  /** canopy tessellation (icosphere detail 1..3) */
  detail: number;
  /** clear trunk height below the canopy (street trees keep ≥ 3.4 m for buses) */
  clear?: number;
  /** far-LOD copy: same lobes & colours, coarser canopy / trunk, no tiny parts */
  far?: boolean;
}

const colCache = new Map<string, THREE.Color>();
export function col(hex: string): THREE.Color {
  let c = colCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colCache.set(hex, c);
  }
  return c;
}

export const LEAF = {
  round: ['#4a8c30', '#54953a', '#5e9c36', '#468538', '#64a33c', '#55923a', '#3c7a31', '#6aa840'],
  roundDark: ['#3c7536', '#41793a', '#386f37'],
  blossomPink: ['#e99ab6', '#eeacc2', '#e48aa8', '#f1b9cb'],
  blossomWhite: ['#ecdfe3', '#eee2dc', '#e8d8df'],
  autumn: ['#e09a3a', '#d8743a', '#cc5a34', '#d9b146', '#c98a2e'],
  fruit: ['#5a973d', '#62a043', '#4f8c3a'],
  birch: ['#97c25a', '#a2c964', '#8fbb55'],
  column: ['#4f8e3c', '#5a9841', '#46833a'],
  conifer: ['#2e683c', '#336d40', '#2a6038', '#3a7546', '#30683a', '#2a5a45', '#26553f', '#47803f'],
  palm: ['#4f9446', '#5a9e4c', '#47893f'],
  willow: ['#86b544', '#8fbc4c', '#7caa40'],
  bush: ['#4a8a3b', '#53913d', '#447f37', '#5b9843', '#3e7836'],
  hedge: ['#3f7a35', '#447f37', '#3a7333'],
};

export const BARK = {
  brown: ['#6a4e3a', '#5e4636', '#725843', '#644a39'],
  dark: ['#4f3b30', '#56402f'],
  birch: '#ece7dc',
  birchMark: '#3d3a36',
  palm: ['#a2825c', '#8f7150'],
  conifer: ['#5a4232', '#4e3a2d'],
};

// ─────────────────────────────────────────────────────────────── wind state ──

/** Writes aWind (anchorX, anchorZ, flex, flutter) for every vertex the sink emits. */
export class Wind {
  ax = 0;
  az = 0;
  ay = 0;
  /** flex per metre above `ay` */
  k = 0.1;
  /** flex per metre below `hang` (hanging willow curtains) */
  kd = 0;
  hang = 0;
  base = 0;
  fl = 0;

  constructor(readonly sink: GeoSink) {
    const e = sink.ex[0];
    sink.hook = (_x, y) => {
      e[0] = this.ax;
      e[1] = this.az;
      e[2] = this.base + Math.max(0, y - this.ay) * this.k + (this.kd > 0 ? Math.max(0, this.hang - y) * this.kd : 0);
      e[3] = this.fl;
    };
  }

  at(ax: number, ay: number, az: number, k: number, fl: number, base = 0): this {
    this.ax = ax;
    this.ay = ay;
    this.az = az;
    this.k = k;
    this.fl = fl;
    this.base = base;
    this.kd = 0;
    return this;
  }
}

// ──────────────────────────────────────────────────────────── lobed canopy ──

export interface Lobe {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  /** colour multiplier for this leaf mass */
  tint: number;
}

export interface CanopyOpts {
  leaf: THREE.Color;
  /** organic surface noise amplitude (fraction of radius) */
  noise: number;
  /** clamp vertices to y >= ground (bushes sit on the ground) */
  ground?: number;
  /** darkest/brightest vertical shade */
  lo?: number;
  hi?: number;
  /** speckles (blossoms, fruit, berries) */
  speckle?: { color: THREE.Color; p: number; mix?: number };
  /** warm top highlight amount */
  warm?: number;
}

const MAXV = 162 * 3;
const sP = new Float32Array(MAXV);
const sN = new Float32Array(MAXV);
const sR = new Float32Array(MAXV / 3);
const sG = new Float32Array(MAXV / 3);
const sL = new Uint8Array(MAXV / 3);

/**
 * Canopy = outer surface of the union of `lobes` (ellipsoids relative to the crown centre),
 * sampled along the directions of an icosphere. Each vertex is shaded like its own lobe
 * (lobe-centred normals → every leaf mass gets its own highlight), seams between lobes are
 * darkened, the underside is shaded and the sunny top warmed.
 */
export function lobedCanopy(s: GeoSink, cx: number, cy: number, cz: number, lobes: Lobe[], detail: number, rng: Rng, o: CanopyOpts): void {
  const t = icoTpl(detail);
  const n = t.vcount;
  const s1 = rng.range(0, 6.28),
    s2 = rng.range(0, 6.28),
    s3 = rng.range(0, 6.28),
    s4 = rng.range(0, 6.28);
  let rmin = 1e9,
    rmax = 0,
    ymax = 0,
    rh = 0;
  for (const L of lobes) {
    ymax = Math.max(ymax, Math.abs(L.y) + L.ry);
    rh = Math.max(rh, Math.hypot(L.x, L.z) + Math.max(L.rx, L.rz));
  }
  for (let i = 0; i < n; i++) {
    const dx = t.pos[i * 3],
      dy = t.pos[i * 3 + 1],
      dz = t.pos[i * 3 + 2];
    let best = 0,
      second = 0,
      bi = 0;
    for (let j = 0; j < lobes.length; j++) {
      const L = lobes[j];
      const Dx = dx / L.rx,
        Dy = dy / L.ry,
        Dz = dz / L.rz;
      const Cx = L.x / L.rx,
        Cy = L.y / L.ry,
        Cz = L.z / L.rz;
      const a = Dx * Dx + Dy * Dy + Dz * Dz;
      const b = Dx * Cx + Dy * Cy + Dz * Cz;
      const c = Cx * Cx + Cy * Cy + Cz * Cz - 1;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const tf = (b + Math.sqrt(disc)) / a;
      if (tf > best) {
        second = best;
        best = tf;
        bi = j;
      } else if (tf > second) second = tf;
    }
    const nz = Math.sin(dx * 4.1 + s1) * Math.sin(dy * 3.7 + s2) * Math.sin(dz * 4.3 + s3) + 0.5 * Math.sin(dx * 9.3 + s4) * Math.sin(dz * 8.7 + s1) * Math.sin(dy * 7.9 + s2);
    const rr = Math.max(0.05, best * (1 + o.noise * nz));
    sR[i] = rr;
    sL[i] = bi;
    // seam factor: 0 right on a seam between two leaf masses, 1 well inside one
    sG[i] = second > 0 ? Math.min(1, (best - second) / Math.max(0.05, best * 0.16)) : 1;
    rmin = Math.min(rmin, rr);
    rmax = Math.max(rmax, rr);
    let py = cy + dy * rr;
    if (o.ground !== undefined && py < o.ground) py = o.ground + (py - o.ground) * 0.08;
    sP[i * 3] = cx + dx * rr;
    sP[i * 3 + 1] = py;
    sP[i * 3 + 2] = cz + dz * rr;
    sN[i * 3] = sN[i * 3 + 1] = sN[i * 3 + 2] = 0;
  }
  // smooth face normals
  const idx = t.idx;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3,
      b = idx[k + 1] * 3,
      c = idx[k + 2] * 3;
    const ux = sP[b] - sP[a],
      uy = sP[b + 1] - sP[a + 1],
      uz = sP[b + 2] - sP[a + 2];
    const vx = sP[c] - sP[a],
      vy = sP[c + 1] - sP[a + 1],
      vz = sP[c + 2] - sP[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nzz = ux * vy - uy * vx;
    for (const q of [a, b, c]) {
      sN[q] += nx;
      sN[q + 1] += ny;
      sN[q + 2] += nzz;
    }
  }
  const lo = o.lo ?? 0.55,
    hi = o.hi ?? 1.12,
    warm = o.warm ?? 0.3;
  const L0 = o.leaf;
  const base = s.vcount;
  for (let i = 0; i < n; i++) {
    const L = lobes[sL[i]];
    const px = sP[i * 3],
      py = sP[i * 3 + 1],
      pz = sP[i * 3 + 2];
    // lobe-centred normal (each leaf mass shades like its own sphere) blended with the surface normal
    let lx = (px - cx - L.x) / L.rx,
      ly = (py - cy - L.y) / L.ry,
      lz = (pz - cz - L.z) / L.rz;
    const ll = Math.hypot(lx, ly, lz) || 1;
    lx /= ll;
    ly /= ll;
    lz /= ll;
    let nx = sN[i * 3],
      ny = sN[i * 3 + 1],
      nz = sN[i * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx = (nx / nl) * 0.4 + lx * 0.6;
    ny = (ny / nl) * 0.4 + ly * 0.6 + 0.08;
    nz = (nz / nl) * 0.4 + lz * 0.6;
    const ml = Math.hypot(nx, ny, nz) || 1;
    const vy = (py - cy) / Math.max(0.2, ymax);
    const sv = smooth01((vy + 0.85) / 1.7);
    const grad = lo + (hi - lo) * sv;
    // inner / seam darkening (fake ambient occlusion between leaf masses)
    const radial = Math.hypot(px - cx, (py - cy) * 0.8, pz - cz) / Math.max(0.3, rh);
    const ao = (0.8 + 0.2 * smooth01(radial * 1.25 - 0.2)) * (0.74 + 0.26 * smooth01(sG[i]));
    const jit = 1 + 0.06 * Math.sin(px * 13.1 + pz * 17.3 + py * 11.7 + s3);
    const k = grad * ao * L.tint * jit;
    const w = warm * smooth01((vy - 0.1) / 0.8) * (0.6 + 0.4 * ly);
    let r = L0.r * k * (1 + 0.16 * w),
      g = L0.g * k * (1 + 0.12 * w),
      b = L0.b * k * (1 - 0.3 * w);
    if (o.speckle && rng.next() < o.speckle.p * (0.45 + sv)) {
      const sc = o.speckle.color;
      const kk = (0.82 + 0.3 * sv) * (0.85 + 0.15 * sG[i]);
      const m = o.speckle.mix ?? 0.6;
      r = r * (1 - m) + sc.r * kk * m;
      g = g * (1 - m) + sc.g * kk * m;
      b = b * (1 - m) + sc.b * kk * m;
    }
    s.rgb(r, g, b);
    s.vert(px, py, pz, nx / ml, ny / ml, nz / ml);
  }
  if (o.ground !== undefined) {
    // drop triangles buried at the foot (bushes): all three corners on the ground
    const gy = o.ground + 0.03;
    for (let k = 0; k < idx.length; k += 3) {
      if (sP[idx[k] * 3 + 1] <= gy && sP[idx[k + 1] * 3 + 1] <= gy && sP[idx[k + 2] * 3 + 1] <= gy) continue;
      s.tri(base + idx[k], base + idx[k + 1], base + idx[k + 2]);
    }
  } else for (let k = 0; k < idx.length; k += 3) s.tri(base + idx[k], base + idx[k + 1], base + idx[k + 2]);
  lastCanopy.rmax = rmax;
}

/** info about the last canopy built (for callers placing fruit) */
export const lastCanopy = { rmax: 0 };

function smooth01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

// ───────────────────────────────────────────────────────────────── trunks ──

const _bark = new THREE.Color();

/** Tapered trunk with a root flare; ring centres follow a straight lean from base to top. */
export function trunk(s: GeoSink, x: number, y: number, z: number, tx: number, ty: number, tz: number, r0: number, r1: number, sides: number, bark: THREE.Color, flare = 1.3): void {
  const H = ty - y;
  const rings: [number, number, number][] = [
    [0, r0 * flare, 0.72],
    [Math.min(0.35, H * 0.12) / H, r0, 0.88],
    [1, r1, 1.04],
  ];
  const base = s.vcount;
  const rot = (x * 7.13 + z * 3.71) % 6.28;
  for (const [f, rad, shade] of rings) {
    const cx = x + (tx - x) * f,
      cy = y + H * f,
      cz = z + (tz - z) * f;
    s.colorObj(bark, shade);
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const c = Math.cos(a),
        sn = Math.sin(a);
      s.vert(cx + c * rad, cy, cz + sn * rad, c, 0.15, sn);
    }
  }
  for (let rI = 0; rI < rings.length - 1; rI++) {
    const a0 = base + rI * sides,
      b0 = base + (rI + 1) * sides;
    for (let i = 0; i < sides; i++) {
      const i1 = (i + 1) % sides;
      s.quad(a0 + i, b0 + i, b0 + i1, a0 + i1);
    }
  }
}

/** Thin branch (tube) from a to b. */
function branch(s: GeoSink, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, bark: THREE.Color): void {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const L = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / L,
    uy = dy / L,
    uz = dz / L;
  // perpendicular basis
  let px = -uz,
    pz = ux,
    py = 0;
  let pl = Math.hypot(px, pz);
  if (pl < 1e-4) {
    px = 1;
    pz = 0;
    pl = 1;
  }
  px /= pl;
  pz /= pl;
  const qx = uy * pz - uz * py,
    qy = uz * px - ux * pz,
    qz = ux * py - uy * px;
  const base = s.vcount;
  const sides = 4;
  for (const [cx, cy, cz, r, sh] of [
    [ax, ay, az, r0, 0.9],
    [bx, by, bz, r1, 1.0],
  ] as [number, number, number, number, number][]) {
    s.colorObj(bark, sh);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const c = Math.cos(a),
        sn = Math.sin(a);
      const nx = px * c + qx * sn,
        ny = py * c + qy * sn,
        nz = pz * c + qz * sn;
      s.vert(cx + nx * r, cy + ny * r, cz + nz * r, nx, ny, nz);
    }
  }
  for (let i = 0; i < sides; i++) {
    const i1 = (i + 1) % sides;
    s.quad(base + i, base + sides + i, base + sides + i1, base + i1);
  }
}

// ──────────────────────────────────────────────────────────────── species ──

const _leaf = new THREE.Color();

function pickLeaf(rng: Rng, list: string[], jitter = 0.04): THREE.Color {
  _leaf.copy(col(rng.pick(list)));
  const hsl = { h: 0, s: 0, l: 0 };
  _leaf.getHSL(hsl);
  _leaf.setHSL(hsl.h + (rng.next() - 0.5) * jitter * 0.4, Math.min(1, Math.max(0, hsl.s + (rng.next() - 0.5) * jitter)), Math.min(1, Math.max(0, hsl.l + (rng.next() - 0.5) * jitter)));
  return _leaf;
}

export interface TreeResult {
  /** canopy bottom height above the base */
  crownBase: number;
  tris: number;
}

/** Build one tree of any species into the sink. */
export function buildTree(s: GeoSink, w: Wind, t: TreeSpec): TreeResult {
  const rng = new Rng(t.seed);
  const t0 = s.tcount;
  let crownBase = 0;
  switch (t.sp) {
    case 'conifer':
      crownBase = conifer(s, w, t, rng);
      break;
    case 'palm':
      crownBase = palm(s, w, t, rng);
      break;
    case 'column':
      crownBase = column(s, w, t, rng);
      break;
    case 'willow':
      crownBase = willow(s, w, t, rng);
      break;
    default:
      crownBase = broadleaf(s, w, t, rng);
  }
  return { crownBase, tris: s.tcount - t0 };
}

function broadleaf(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r, sp } = t;
  const birch = sp === 'birch';
  const fruit = sp === 'fruit';
  const blossom = sp === 'blossom';
  // proportions
  let clear = t.clear ?? h * (fruit ? rng.range(0.24, 0.3) : birch ? rng.range(0.34, 0.42) : rng.range(0.24, 0.32));
  clear = Math.min(clear, h - 1.2);
  const crownH = h - clear;
  const Rv = crownH / 2;
  // the lobe union reaches ~0.8 Rv below the centre → shift the crown down so it meets `clear`
  const cy = y + clear + Rv * 0.8;
  // lean
  const la = rng.range(0, Math.PI * 2),
    lm = rng.range(0, 0.035) * h;
  const lx = Math.cos(la) * lm,
    lz = Math.sin(la) * lm;
  const cx = x + lx,
    cz = z + lz;
  w.at(x, y, z, 1 / 10, 0, 0);
  // trunk
  const r0 = Math.max(0.09, Math.min(0.42, (birch ? 0.022 : 0.032) * h + r * 0.025));
  const bark = birch ? col(BARK.birch) : col(rng.pick(blossom ? BARK.dark : BARK.brown));
  const topY = cy - Rv * 0.15;
  const sides = t.far ? 4 : t.detail >= 2 ? 6 : 5;
  if (birch) birchTrunk(s, x, y, z, cx, topY, cz, r0, r0 * 0.6, sides, rng);
  else trunk(s, x, y, z, cx, topY, cz, r0, r0 * 0.55, sides, bark);
  // lobes: a smaller core + a ring of leaf masses that define the bumpy silhouette
  const lobes: Lobe[] = [];
  const flat = blossom ? 0.8 : fruit ? 0.9 : 1.0;
  lobes.push({ x: 0, y: 0, z: 0, rx: r * 0.66, ry: Rv * 0.78 * flat, rz: r * 0.66, tint: rng.range(0.9, 0.98) });
  const n2 = t.detail >= 3 ? rng.int(6, 8) : t.detail === 2 ? rng.int(5, 6) : rng.int(3, 4);
  const th0 = rng.range(0, Math.PI * 2);
  const vr = Math.min(1.25, Math.max(0.85, Rv / r));
  for (let i = 0; i < n2; i++) {
    const th = th0 + (i / n2) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const el = rng.range(-0.5, 0.7);
    const rad = r * (birch ? rng.range(0.32, 0.42) : rng.range(0.38, 0.5));
    let d = r * (birch ? rng.range(0.58, 0.7) : rng.range(0.48, 0.6));
    if (d * Math.cos(el) + rad > r * 1.04) d = (r * 1.04 - rad) / Math.max(0.3, Math.cos(el));
    lobes.push({
      x: Math.cos(th) * Math.cos(el) * d,
      y: Math.sin(el) * Rv * 0.62 * flat,
      z: Math.sin(th) * Math.cos(el) * d,
      rx: rad,
      ry: rad * rng.range(0.82, 1.0) * vr * flat,
      rz: rad,
      tint: rng.range(0.84, 1.12),
    });
  }
  if (!blossom) lobes.push({ x: rng.range(-0.12, 0.12) * r, y: Rv * 0.46 * flat, z: rng.range(-0.12, 0.12) * r, rx: r * 0.46, ry: Rv * 0.42, rz: r * 0.46, tint: rng.range(1.02, 1.12) });
  // branches into the canopy (visible forks under the crown)
  if (t.detail >= 2 && r > 2.2) {
    const nb = birch ? 2 : 3;
    for (let i = 0; i < nb; i++) {
      const L = lobes[1 + (i % (lobes.length - 1))];
      const f = rng.range(0.6, 0.8);
      const bx0 = x + (cx - x) * f,
        by0 = y + (topY - y) * f * 0.85,
        bz0 = z + (cz - z) * f;
      if (!t.far) branch(s, bx0, by0, bz0, cx + L.x * 0.75, cy + L.y * 0.6 - Rv * 0.2, cz + L.z * 0.75, r0 * 0.42, r0 * 0.2, bark);
    }
  }
  // canopy
  let leafList = LEAF.round;
  if (sp === 'blossom') leafList = rng.chance(0.75) ? LEAF.blossomPink : LEAF.blossomWhite;
  else if (sp === 'autumn') leafList = LEAF.autumn;
  else if (sp === 'fruit') leafList = LEAF.fruit;
  else if (sp === 'birch') leafList = LEAF.birch;
  else if (rng.chance(0.2)) leafList = LEAF.roundDark;
  const leaf = pickLeaf(rng, leafList, sp === 'autumn' ? 0.08 : 0.05).clone();
  w.at(x, y, z, 1 / 10, birch ? 1.25 : 1.0, 0);
  const white = blossom && leaf.r > 0.75 && leaf.g > 0.7;
  const opts: CanopyOpts = { leaf, noise: birch ? 0.11 : 0.085, lo: blossom ? 0.64 : 0.55, hi: white ? 0.96 : blossom ? 1.04 : 1.12, warm: blossom ? 0.05 : sp === 'autumn' ? 0.15 : 0.32 };
  // blossoms: fresh green leaves showing through the flowers (so they never read as cotton / snow)
  if (blossom) opts.speckle = { color: col(white ? '#8fb85a' : '#86ad55'), p: white ? 0.34 : 0.26, mix: 0.62 };
  if (sp === 'autumn' && rng.chance(0.6)) opts.speckle = { color: col(rng.pick(['#e8c24a', '#c9472f', '#a3b04a'])), p: 0.22, mix: 0.5 };
  lobedCanopy(s, cx, cy, cz, lobes, t.far ? 1 : t.detail, rng, opts);
  // fruit
  if (fruit && !t.far) {
    const fc = col(rng.pick(['#d6382e', '#e0532f', '#e8b030', '#c92f3a']));
    const nf = rng.int(5, 8);
    w.fl = 0.6;
    for (let i = 0; i < nf; i++) {
      const th = rng.range(0, Math.PI * 2),
        el = rng.range(-0.35, 0.6);
      const rr = lastCanopy.rmax * 0.82;
      const fx = cx + Math.cos(th) * Math.cos(el) * rr,
        fy = cy + Math.sin(el) * rr * 0.75,
        fz = cz + Math.sin(th) * Math.cos(el) * rr;
      blob(s, fx, fy, fz, 0.1, 0.1, 0.1, fc, 0);
    }
  }
  return clear;
}

function birchTrunk(s: GeoSink, x: number, y: number, z: number, tx: number, ty: number, tz: number, r0: number, r1: number, sides: number, rng: Rng): void {
  const H = ty - y;
  const white = col(BARK.birch),
    mark = col(BARK.birchMark);
  // stacked segments with dark bands (flat colour per segment)
  let f = 0;
  const marks: number[] = [];
  for (let m = 0.12; m < 0.92; m += rng.range(0.14, 0.24)) marks.push(m);
  const cuts = [0];
  for (const m of marks) cuts.push(m, Math.min(0.98, m + rng.range(0.025, 0.045)));
  cuts.push(1);
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k],
      b = cuts[k + 1];
    if (b <= a) continue;
    const dark = k % 2 === 1;
    const c = dark ? mark : white;
    const base = s.vcount;
    for (const ff of [a, b]) {
      const rad = r0 + (r1 - r0) * ff;
      s.colorObj(c, dark ? 1 : 0.92 + 0.12 * ff);
      for (let i = 0; i < sides; i++) {
        const an = (i / sides) * Math.PI * 2 + 0.3;
        const cs = Math.cos(an),
          sn = Math.sin(an);
        s.vert(x + (tx - x) * ff + cs * rad, y + H * ff, z + (tz - z) * ff + sn * rad, cs, 0.1, sn);
      }
    }
    for (let i = 0; i < sides; i++) {
      const i1 = (i + 1) % sides;
      s.quad(base + i, base + sides + i, base + sides + i1, base + i1);
    }
    f = b;
  }
  void f;
}

function column(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r } = t;
  const clear = t.clear ?? h * rng.range(0.12, 0.18);
  const crownH = h - clear;
  const Rv = crownH / 2;
  const cy = y + clear + Rv;
  w.at(x, y, z, 1 / 9, 0, 0);
  const r0 = Math.max(0.1, Math.min(0.3, 0.024 * h));
  trunk(s, x, y, z, x, cy - Rv * 0.4, z, r0, r0 * 0.6, t.far ? 4 : 5, col(rng.pick(BARK.brown)));
  const lobes: Lobe[] = [{ x: 0, y: 0, z: 0, rx: r * 0.86, ry: Rv * 0.96, rz: r * 0.86, tint: 1 }];
  const n = t.detail >= 2 ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const f = -0.55 + (i / Math.max(1, n - 1)) * 1.1;
    const th = rng.range(0, Math.PI * 2);
    const rad = r * (0.72 - Math.abs(f) * 0.2) * rng.range(0.9, 1.08);
    lobes.push({ x: Math.cos(th) * r * 0.22, y: f * Rv * 0.75, z: Math.sin(th) * r * 0.22, rx: rad, ry: Rv * 0.36, rz: rad, tint: rng.range(0.88, 1.08) });
  }
  const leaf = pickLeaf(rng, LEAF.column).clone();
  w.at(x, y, z, 1 / 9, 1.15, 0);
  lobedCanopy(s, x, cy, z, lobes, t.far ? 1 : t.detail, rng, { leaf, noise: 0.09, lo: 0.6, hi: 1.08, warm: 0.28 });
  return clear;
}

function willow(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r } = t;
  const clear = h * 0.46;
  const Rv = (h - clear) / 2;
  const cy = y + clear + Rv * 0.9;
  w.at(x, y, z, 1 / 10, 0, 0);
  const r0 = Math.max(0.18, Math.min(0.42, 0.038 * h));
  const bark = col(rng.pick(BARK.dark));
  const la = rng.range(0, 6.28);
  const tx = x + Math.cos(la) * 0.35,
    tz = z + Math.sin(la) * 0.35;
  trunk(s, x, y, z, tx, cy - Rv * 0.3, tz, r0, r0 * 0.6, 6, bark);
  for (let i = 0; i < 3; i++) {
    const a = la + 2 + i * 2.1 + rng.range(-0.3, 0.3);
    branch(s, tx, y + clear * 0.85, tz, x + Math.cos(a) * r * 0.55, cy + rng.range(-0.1, 0.4), z + Math.sin(a) * r * 0.55, r0 * 0.45, r0 * 0.18, bark);
  }
  const leaf = pickLeaf(rng, LEAF.willow).clone();
  // domed crown
  const lobes: Lobe[] = [{ x: 0, y: 0, z: 0, rx: r * 0.7, ry: Rv * 0.62, rz: r * 0.7, tint: 0.95 }];
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * 6.28 + rng.range(-0.3, 0.3);
    const rad = r * rng.range(0.36, 0.44);
    lobes.push({ x: Math.cos(th) * r * 0.55, y: rng.range(-0.05, 0.35) * Rv, z: Math.sin(th) * r * 0.55, rx: rad, ry: rad * 0.72, rz: rad, tint: rng.range(0.88, 1.1) });
  }
  lobes.push({ x: 0, y: Rv * 0.4, z: 0, rx: r * 0.5, ry: Rv * 0.4, rz: r * 0.5, tint: 1.08 });
  w.at(x, y, z, 1 / 10, 0.9, 0);
  lobedCanopy(s, x, cy, z, lobes, t.far ? 1 : t.detail, rng, { leaf, noise: 0.07, lo: 0.6, hi: 1.1, warm: 0.25 });
  // weeping strands: start on the dome, arch over its rim, then fall in narrow ribbons with gaps
  const nR = t.far ? 12 : t.detail >= 2 ? 26 : 14;
  const crownFlex = (cy - y) / 10;
  for (let i = 0; i < nR; i++) {
    const a = (i / nR) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const px = -sa,
      pz = ca; // tangent
    const hem = y + clear * rng.range(0.1, 0.55);
    const wid = rng.range(0.22, 0.34) * (r / 3);
    const shade = rng.range(0.8, 1.06);
    const rimY = cy - Rv * rng.range(0.0, 0.25);
    const pts: number[][] = [
      [r * 0.55, cy + Rv * 0.5, 0],
      [r * 0.92, rimY + Rv * 0.12, 0.15],
      [r * 1.02, rimY - (rimY - hem) * 0.35, 0.45],
      [r * 1.06, rimY - (rimY - hem) * 0.7, 0.75],
      [r * 1.08, hem, 1],
    ];
    w.ay = 1e9;
    w.base = crownFlex;
    w.hang = rimY;
    w.kd = 0.17;
    w.fl = 1.4;
    const front: number[] = [],
      back: number[] = [];
    for (const [rad, qy, f] of pts) {
      const ww = wid * (1.15 - 0.75 * f);
      const qx = x + ca * rad,
        qz = z + sa * rad;
      const ny = f < 0.3 ? 0.9 : 0.2;
      s.colorObj(leaf, shade * (1.08 - 0.32 * f));
      front.push(s.vert(qx - px * ww, qy, qz - pz * ww, ca, ny, sa), s.vert(qx + px * ww, qy, qz + pz * ww, ca, ny, sa));
      s.colorObj(leaf, shade * (0.66 - 0.2 * f));
      back.push(s.vert(qx - px * ww, qy, qz - pz * ww, -ca, -0.2, -sa), s.vert(qx + px * ww, qy, qz + pz * ww, -ca, -0.2, -sa));
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a0 = k * 2,
        b0 = (k + 1) * 2;
      s.quad(front[a0], front[a0 + 1], front[b0 + 1], front[b0]);
      s.quad(back[a0], back[b0], back[b0 + 1], back[a0 + 1]);
    }
  }
  w.kd = 0;
  return clear;
}

function conifer(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r } = t;
  const y0 = y + (t.clear ?? h * rng.range(0.08, 0.14));
  w.at(x, y, z, 1 / 12, 0, 0);
  const r0 = Math.max(0.1, Math.min(0.32, 0.024 * h));
  trunk(s, x, y, z, x, y0 + (h - (y0 - y)) * 0.3, z, r0, r0 * 0.6, 5, col(rng.pick(BARK.conifer)), 1.2);
  const leaf = pickLeaf(rng, LEAF.conifer, 0.05).clone();
  const tiers = t.detail >= 2 ? (h > 9 ? 4 : 3) + (rng.chance(0.3) ? 1 : 0) : h > 10 && rng.chance(0.5) ? 4 : 3;
  const sides = t.far ? 6 : t.detail >= 2 ? 9 : 7;
  const top = y + h;
  const span = top - y0;
  w.at(x, y, z, 1 / 12, 0.45, 0);
  const rot0 = rng.range(0, 6.28);
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const tb = y0 + span * f * 0.86;
    const tt = i === tiers - 1 ? top : tb + span * (0.5 - 0.06 * i);
    const th = tt - tb;
    const rr = r * Math.pow(1 - f * 0.86, 0.95) * rng.range(0.94, 1.04);
    const droop = th * 0.14;
    const shadeT = 0.84 + 0.16 * f;
    const base = s.vcount;
    const rot = rot0 + i * 0.7;
    // ring0 (outer rim, ragged), ring1 (shoulder), apex
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * Math.PI * 2;
      const jag = k % 2 === 0 ? 1.1 : 0.9;
      const c = Math.cos(a),
        sn = Math.sin(a);
      s.colorObj(leaf, 0.66 * shadeT);
      s.vert(x + c * rr * jag, tb - droop * jag, z + sn * rr * jag, c * 0.82, 0.35, sn * 0.82);
    }
    for (let k = 0; k < sides; k++) {
      const a = rot + ((k + 0.5) / sides) * Math.PI * 2;
      const c = Math.cos(a),
        sn = Math.sin(a);
      s.colorObj(leaf, 0.98 * shadeT);
      s.vert(x + c * rr * 0.56, tb + th * 0.34, z + sn * rr * 0.56, c * 0.62, 0.72, sn * 0.62);
    }
    s.colorObj(leaf, 1.12 * shadeT);
    const apex = s.vert(x, tt, z, 0, 1, 0);
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      // ring0[k], ring0[k1], ring1[k] (ring1[k] sits between k and k1)
      s.tri(base + k, base + sides + k, base + k1);
      s.tri(base + k1, base + sides + k, base + sides + k1);
      s.tri(base + sides + k, apex, base + sides + k1);
    }
    if (t.detail >= 2 && !t.far) {
      // shallow underside
      s.colorObj(leaf, 0.42);
      const u = s.vert(x, tb + th * 0.12, z, 0, -1, 0);
      for (let k = 0; k < sides; k++) s.tri(base + k, base + ((k + 1) % sides), u);
    }
  }
  return y0 - y;
}

function palm(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h } = t;
  const th = h - 0.6;
  const la = rng.range(0, Math.PI * 2),
    lm = rng.range(0.5, 1.5);
  const lx = Math.cos(la) * lm,
    lz = Math.sin(la) * lm;
  const segs = t.far ? 4 : t.detail >= 2 ? 8 : 5;
  const sides = t.far ? 4 : 6;
  const barkA = col(BARK.palm[0]),
    barkB = col(BARK.palm[1]);
  w.at(x, y, z, 1 / 7.5, 0, 0);
  const pt = (f: number): [number, number, number] => [x + lx * f * f, y + th * f, z + lz * f * f];
  // ringed trunk: each segment has its own vertices (bulge at the bottom of each ring)
  for (let k = 0; k < segs; k++) {
    const fa = k / segs,
      fb = (k + 1) / segs;
    const A = pt(fa),
      B = pt(fb);
    const ra = 0.2 - 0.06 * fa,
      rb = 0.2 - 0.06 * fb;
    const base = s.vcount;
    for (const [P, rad, sh] of [
      [A, ra * 1.12, 0.92],
      [B, rb * 0.95, 1.05],
    ] as [[number, number, number], number, number][]) {
      s.colorObj(k % 2 ? barkA : barkB, sh);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const c = Math.cos(a),
          sn = Math.sin(a);
        s.vert(P[0] + c * rad, P[1], P[2] + sn * rad, c, 0.2, sn);
      }
    }
    for (let i = 0; i < sides; i++) {
      const i1 = (i + 1) % sides;
      s.quad(base + i, base + sides + i, base + sides + i1, base + i1);
    }
  }
  const T = pt(1);
  const leaf = pickLeaf(rng, LEAF.palm).clone();
  // crown bulb + coconuts
  blob(s, T[0], T[1] + 0.05, T[2], 0.34, 0.3, 0.34, col('#5d7a3a'), 0);
  const nut = col('#6b4a2c');
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, 6.28);
    blob(s, T[0] + Math.cos(a) * 0.24, T[1] - 0.22, T[2] + Math.sin(a) * 0.24, 0.13, 0.14, 0.13, nut, 0);
  }
  // fronds
  const nf = rng.int(8, 10);
  const a0 = rng.range(0, 6.28);
  w.at(x, y, z, 1 / 7.5, 1.1, 0);
  const tip = col('#9fbf5a');
  for (let i = 0; i < nf; i++) {
    const a = a0 + (i / nf) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const L = rng.range(2.6, 3.4) * (h / 8);
    const rise = rng.range(0.5, 1.1),
      droop = rng.range(1.6, 2.4) * (L / 3);
    const dx = Math.cos(a),
      dz = Math.sin(a);
    const sx = -dz,
      sz = dx; // side
    const ns = t.far ? 3 : 5;
    const widths = t.far ? [0.04, 0.5, 0.04] : [0.04, 0.42, 0.5, 0.38, 0.04];
    const top: number[] = [],
      left: number[] = [],
      right: number[] = [];
    const topB: number[] = [],
      leftB: number[] = [],
      rightB: number[] = [];
    for (let k = 0; k < ns; k++) {
      const f = k / (ns - 1);
      const px = T[0] + dx * L * f,
        py = T[1] + 0.1 + rise * f - droop * f * f,
        pz = T[2] + dz * L * f;
      const wd = widths[k] * (L / 3);
      const shade = 0.8 + 0.25 * f;
      const c = _tmpC.copy(leaf).lerp(tip, f * f * 0.45);
      s.colorObj(c, shade);
      top.push(s.vert(px, py, pz, 0, 1, 0));
      s.colorObj(c, shade * 0.92);
      left.push(s.vert(px + sx * wd, py - wd * 0.45, pz + sz * wd, sx * 0.4, 0.9, sz * 0.4));
      right.push(s.vert(px - sx * wd, py - wd * 0.45, pz - sz * wd, -sx * 0.4, 0.9, -sz * 0.4));
      // underside copies
      s.colorObj(c, shade * 0.55);
      topB.push(s.vert(px, py - 0.01, pz, 0, -1, 0));
      leftB.push(s.vert(px + sx * wd, py - wd * 0.45 - 0.01, pz + sz * wd, 0, -1, 0));
      rightB.push(s.vert(px - sx * wd, py - wd * 0.45 - 0.01, pz - sz * wd, 0, -1, 0));
    }
    for (let k = 0; k < ns - 1; k++) {
      // upper faces (normal up): left half & right half
      s.quad(top[k], left[k], left[k + 1], top[k + 1]);
      s.quad(top[k], top[k + 1], right[k + 1], right[k]);
      // lower faces (reversed)
      s.quad(topB[k], topB[k + 1], leftB[k + 1], leftB[k]);
      s.quad(topB[k], rightB[k], rightB[k + 1], topB[k + 1]);
    }
  }
  return th;
}

const _tmpC = new THREE.Color();

/** small closed ellipsoid (fruit, nuts, buds…) */
export function blob(s: GeoSink, x: number, y: number, z: number, rx: number, ry: number, rz: number, c: THREE.Color, detail: number, shadeLo = 0.75): void {
  const t = icoTpl(detail);
  const base = s.vcount;
  for (let i = 0; i < t.vcount; i++) {
    const px = t.pos[i * 3],
      py = t.pos[i * 3 + 1],
      pz = t.pos[i * 3 + 2];
    s.colorObj(c, shadeLo + (1.05 - shadeLo) * (py * 0.5 + 0.5));
    const nx = px / rx,
      ny = py / ry,
      nz = pz / rz;
    const l = Math.hypot(nx, ny, nz) || 1;
    s.vert(x + px * rx, y + py * ry, z + pz * rz, nx / l, ny / l, nz / l);
  }
  for (let k = 0; k < t.idx.length; k += 3) s.tri(base + t.idx[k], base + t.idx[k + 1], base + t.idx[k + 2]);
}

// ───────────────────────────────────────────────────────────── shrubs ──

export interface BushOpts {
  leaf?: THREE.Color;
  flower?: THREE.Color;
  detail?: number;
}

/** Rounded shrub of 2-3 leaf masses sitting on the ground. */
export function bush(s: GeoSink, w: Wind, x: number, y: number, z: number, r: number, h: number, seed: number, o: BushOpts = {}): void {
  const rng = new Rng(seed);
  const leaf = o.leaf ?? pickLeaf(rng, LEAF.bush).clone();
  const lobes: Lobe[] = [{ x: 0, y: 0, z: 0, rx: r * 0.85, ry: h * 0.55, rz: r * 0.85, tint: 1 }];
  const n = rng.int(2, 3);
  const a0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.28 + rng.range(-0.4, 0.4);
    const rad = r * rng.range(0.48, 0.62);
    lobes.push({ x: Math.cos(a) * r * 0.42, y: rng.range(-0.05, 0.25) * h, z: Math.sin(a) * r * 0.42, rx: rad, ry: rad * (h / r) * 0.9, rz: rad, tint: rng.range(0.88, 1.1) });
  }
  w.at(x, y, z, 0.25, 0.7, 0);
  const cy = y + h * 0.42;
  lobedCanopy(s, x, cy, z, lobes, o.detail ?? 1, rng, {
    leaf,
    noise: 0.1,
    ground: y + 0.02,
    lo: 0.55,
    hi: 1.06,
    warm: 0.25,
    speckle: o.flower ? { color: o.flower, p: 0.26, mix: 0.75 } : undefined,
  });
}

/**
 * Clipped hedge along a→b (ground level y): rounded profile, leafy noise, darker at the foot.
 * Returns triangle count.
 */
export function hedge(s: GeoSink, w: Wind, ax: number, az: number, bx: number, bz: number, y: number, width: number, height: number, leaf: THREE.Color, seed: number, yAt?: (x: number, z: number) => number): void {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.3) return;
  const ux = (bx - ax) / L,
    uz = (bz - az) / L;
  const vx = -uz,
    vz = ux;
  const segs = Math.max(1, Math.round(L / 0.6));
  const hw = width / 2;
  // clipped hedge: separate faces (crisp edges) — sides, bevels, flat top
  // face = { pts: [v offset, height][], n: [normal v, normal y], shade }
  const faces: { pts: [number, number][]; n: [number, number]; sh: number }[] = [
    { pts: [[-hw * 0.97, -0.04], [-hw, height * 0.86]], n: [-1, 0.05], sh: 0.8 },
    { pts: [[-hw, height * 0.86], [-hw * 0.8, height]], n: [-0.6, 0.8], sh: 0.95 },
    { pts: [[-hw * 0.8, height], [hw * 0.8, height]], n: [0, 1], sh: 1.08 },
    { pts: [[hw * 0.8, height], [hw, height * 0.86]], n: [0.6, 0.8], sh: 0.95 },
    { pts: [[hw, height * 0.86], [hw * 0.97, -0.04]], n: [1, 0.05], sh: 0.8 },
  ];
  const ph = (seed % 1000) * 0.37;
  w.at(ax, y, az, 0.06, 0.32, 0);
  const starts: number[] = [];
  const counts = faces.map((f) => f.pts.length);
  const ringSize = counts.reduce((a2, b2) => a2 + b2, 0);
  const base = s.vcount;
  for (let k = 0; k <= segs; k++) {
    const f = k / segs;
    const cx = ax + ux * L * f,
      cz = az + uz * L * f;
    const gy = yAt ? yAt(cx, cz) : y;
    const end = k === 0 || k === segs;
    w.ax = cx;
    w.az = cz;
    w.ay = gy;
    // per-ring leafy bulge (shared by every face so edges stay closed)
    const bulge = 0.05 * Math.sin(cx * 3.7 + cz * 2.9 + ph) + 0.03 * Math.sin(cx * 9.1 - cz * 8.3 + ph * 2.1);
    const topB = 0.05 * Math.sin(cx * 4.3 - cz * 3.1 + ph * 0.7) + 0.025 * Math.sin(cx * 11.3 + cz * 10.1);
    const mott = 0.92 + 0.1 * Math.sin(cx * 2.3 + cz * 1.9 + ph) + 0.06 * Math.sin(cx * 7.1 - cz * 5.3);
    for (const face of faces) {
      for (const [ov, oy] of face.pts) {
        const ground = oy < 0;
        const vv = ov * (end ? 0.93 : 1) + (ground ? 0 : Math.sign(ov) * bulge);
        const yy = gy + (ground ? oy : oy * (end ? 0.97 : 1) + (oy > height * 0.8 ? topB : 0));
        const lo = ground ? 0.62 : 1;
        s.colorObj(leaf, face.sh * mott * lo);
        const nl = Math.hypot(face.n[0], face.n[1]);
        s.vert(cx + vx * vv, yy, cz + vz * vv, (vx * face.n[0]) / nl, face.n[1] / nl, (vz * face.n[0]) / nl);
      }
    }
  }
  let off = 0;
  for (const c of counts) {
    starts.push(off);
    off += c;
  }
  for (let k = 0; k < segs; k++) {
    const a0 = base + k * ringSize,
      b0 = base + (k + 1) * ringSize;
    faces.forEach((fc, fi) => {
      const st = starts[fi];
      for (let p = 0; p < fc.pts.length - 1; p++) s.quad(a0 + st + p, a0 + st + p + 1, b0 + st + p + 1, b0 + st + p);
    });
  }
  // end caps (flat, slightly darker)
  for (const [k, sgn] of [
    [0, -1],
    [segs, 1],
  ] as [number, number][]) {
    const f = k / segs;
    const cx = ax + ux * L * f,
      cz = az + uz * L * f;
    const gy = yAt ? yAt(cx, cz) : y;
    const outline: [number, number][] = [
      [-hw * 0.9, -0.04],
      [-hw * 0.93, height * 0.86],
      [-hw * 0.75, height * 0.97],
      [hw * 0.75, height * 0.97],
      [hw * 0.93, height * 0.86],
      [hw * 0.9, -0.04],
    ];
    const cb = s.vcount;
    s.colorObj(leaf, 0.82);
    for (const [ov, oy] of outline) s.vert(cx + vx * ov, gy + oy, cz + vz * ov, ux * sgn, 0.1, uz * sgn);
    for (let p = 1; p < outline.length - 1; p++) {
      if (sgn > 0) s.tri(cb, cb + p, cb + p + 1);
      else s.tri(cb, cb + p + 1, cb + p);
    }
  }
}
