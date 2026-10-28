// Procedural plant generators, baked straight into a merged GeoSink.
//
// Broadleaf canopies are "lobed unions": an icosphere is pushed out along each direction to the
// far surface of the union of several ellipsoid leaf masses (+ organic noise). That keeps the
// clustered, hand-sculpted silhouette of many leaf masses without hidden inner faces. Normals blend
// the surface, the own leaf mass and the whole crown for a soft painted look. Depth into the crown,
// seams between masses and the underside are written to the aLeaf occlusion channel (see
// material.ts), so the sunny outside stays vivid while the interior goes deep; the fragment shader
// adds leaf-clump relief, tone drift and backlit translucency on top.
//
// Species & silhouette families:
//   round   — linden/maple/oak: dome, oval, spreading and irregular crowns
//   blossom — cherry: wide, flat, fluffy puffs, pink/white with fresh green
//   autumn  — like round, warm multi-tone clumps
//   fruit   — small apple trees, dense round crowns with fruit
//   birch   — airy: a few separate small leaf clouds on a slender white trunk (bark painted in-shader)
//   column  — Lombardy poplar: narrow flame with alternating bulges and a pointed top
//   conifer — spruce / fir (layered drooping skirts with branch tips) and pine (clear trunk, flat
//             cloud crown)
//   palm, willow — plus bushes and clipped hedges.

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
  /** canopy tessellation (icosphere detail 1..3); 1 = forest */
  detail: number;
  /** clear trunk height below the canopy (street trees keep ≥ 3.4 m for buses) */
  clear?: number;
  /** far-LOD copy: same lobes & colours, coarser canopy / trunk, no tiny parts */
  far?: boolean;
  /** 0..1 tone shift (forest stands: darker/bluer vs lighter/yellower) */
  tone?: number;
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
  round: ['#4a8c30', '#54953a', '#5e9c36', '#468538', '#64a33c', '#55923a', '#3f7d31', '#6aa840', '#5b8f2e', '#4d8a3e'],
  roundDark: ['#3c7536', '#41793a', '#386f37', '#3a6e40'],
  roundOlive: ['#6d9433', '#789c3a', '#66902f'],
  blossomPink: ['#e48aaa', '#ea9dbb', '#de7ea2', '#eda9c2'],
  blossomWhite: ['#ecdfe3', '#eee2dc', '#e8d8df'],
  autumn: ['#e09a3a', '#d8743a', '#cc5a34', '#d9b146', '#c98a2e'],
  fruit: ['#5a973d', '#62a043', '#4f8c3a'],
  birch: ['#97c25a', '#a2c964', '#8fbb55', '#a9c85c'],
  column: ['#477f39', '#4f8a3c', '#41783a', '#4a8442'],
  spruce: ['#2b5f3c', '#2f6440', '#285a3a', '#2a5a45', '#26553f', '#305f48'],
  fir: ['#336d40', '#3a7546', '#30683a', '#3d7a44', '#367040'],
  pine: ['#3f6f3a', '#46773d', '#3a6a3c'],
  palm: ['#4f9446', '#5a9e4c', '#47893f'],
  willow: ['#86b544', '#8fbc4c', '#7caa40'],
  bush: ['#4a8a3b', '#53913d', '#447f37', '#5b9843', '#3e7836', '#5e8f36', '#3f7a42'],
  hedge: ['#3f7a35', '#447f37', '#3a7333', '#40783c'],
};
/** legacy key (vegetation.ts / older callers) */
export const CONIFER_LEAF = LEAF.spruce;

export const BARK = {
  brown: ['#6a4e3a', '#5e4636', '#725843', '#644a39'],
  dark: ['#4f3b30', '#56402f'],
  birch: '#ece7dc',
  birchMark: '#3d3a36',
  palm: ['#a2825c', '#8f7150'],
  conifer: ['#5a4232', '#4e3a2d'],
  pine: ['#7a4f34', '#835639'],
};

// ───────────────────────────────────────────────────────────── leaf attribute ──

/** aLeaf clump-size code for a clump size in metres (material.ts: size = 0.1 + code * 1.5) */
export const clumpCode = (m: number): number => Math.min(1, Math.max(0, (m - 0.1) / 1.5));
/** aLeaf.w codes for bark patterns (leafiness 0): furrowed bark, birch dashes */
export const BARK_FURROW = 0.2;
export const BARK_BIRCH = 0.8;

/** aLeaf.y: relief model (billow for needles / clipped hedges, else clump cells) + tone-drift amplitude (1 = default, ≤ 1.99) */
export const leafTone = (amp: number, billow = false): number => (billow ? 0.5 : 0) + Math.min(0.498, Math.max(0, amp * 0.25));

/** Set aLeaf (ao, model+tone (leafTone), leafiness, clump code) for the vertices that follow. No-op on sinks without it. */
export function leafAttr(s: GeoSink, ao: number, tone: number, amt: number, clump: number): void {
  const e = s.ex[1];
  if (!e) return;
  e[0] = ao;
  e[1] = tone;
  e[2] = amt;
  e[3] = clump;
}

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

  /**
   * Start a plant part. Also resets aLeaf to a neutral default: small soft leafiness for anything that
   * flutters (flowers, crops, reeds), hard for static parts (soil, grates, trunks).
   */
  at(ax: number, ay: number, az: number, k: number, fl: number, base = 0): this {
    this.ax = ax;
    this.ay = ay;
    this.az = az;
    this.k = k;
    this.fl = fl;
    this.base = base;
    this.kd = 0;
    if (fl > 0) leafAttr(this.sink, 1, leafTone(1, true), 0.35, clumpCode(0.13));
    else leafAttr(this.sink, 1, 0, 0, 0);
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
  /** darkest/brightest vertical albedo shade */
  lo?: number;
  hi?: number;
  /** occlusion at the very bottom of the crown (1 = none) */
  aoLo?: number;
  /** speckles (blossoms, fruit, berries) */
  speckle?: { color: THREE.Color; p: number; mix?: number };
  /** warm top highlight amount */
  warm?: number;
  /** leaf-clump size (m) for the fragment relief */
  clump?: number;
  /** leafiness 0..1 (relief / wrap / translucency strength) */
  amt?: number;
  /** clump tone drift amplitude 0..1 (0.5 = default) */
  tone?: number;
  /** billowed relief (needles) instead of clump cells */
  billow?: boolean;
}

const MAXV = 252 * 3;
const sP = new Float32Array(MAXV);
const sN = new Float32Array(MAXV);
const sR = new Float32Array(MAXV / 3);
const sG = new Float32Array(MAXV / 3);
const sL = new Uint8Array(MAXV / 3);

/** info about the last canopy built (for callers placing fruit) */
export const lastCanopy = { rmax: 0 };

/**
 * Canopy = outer surface of the union of `lobes` (ellipsoids relative to the crown centre),
 * sampled along the directions of an icosphere. `seed` drives the surface noise and speckles (its own
 * generator, so near and far LOD copies of a tree consume the caller's generator identically).
 */
export function lobedCanopy(s: GeoSink, cx: number, cy: number, cz: number, lobes: Lobe[], detail: number, seed: number, o: CanopyOpts): void {
  const rng = new Rng(seed);
  const t = icoTpl(detail);
  const n = t.vcount;
  const s1 = rng.range(0, 6.28),
    s2 = rng.range(0, 6.28),
    s3 = rng.range(0, 6.28),
    s4 = rng.range(0, 6.28);
  let rmax = 0,
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
    sN[a] += nx;
    sN[a + 1] += ny;
    sN[a + 2] += nzz;
    sN[b] += nx;
    sN[b + 1] += ny;
    sN[b + 2] += nzz;
    sN[c] += nx;
    sN[c + 1] += ny;
    sN[c + 2] += nzz;
  }
  const lo = o.lo ?? 0.74,
    hi = o.hi ?? 1.08,
    warm = o.warm ?? 0.3,
    aoLo = o.aoLo ?? 0.42;
  const clump = clumpCode(o.clump ?? 0.55),
    amt = o.amt ?? 1,
    tone = leafTone((o.tone ?? 0.5) * 2, o.billow);
  const L0 = o.leaf;
  const base = s.vcount;
  const groundY = o.ground;
  for (let i = 0; i < n; i++) {
    const L = lobes[sL[i]];
    const px = sP[i * 3],
      py = sP[i * 3 + 1],
      pz = sP[i * 3 + 2];
    // lobe-centred normal (each leaf mass shades like its own sphere)
    let lx = (px - cx - L.x) / L.rx,
      ly = (py - cy - L.y) / L.ry,
      lz = (pz - cz - L.z) / L.rz;
    const ll = Math.hypot(lx, ly, lz) || 1;
    lx /= ll;
    ly /= ll;
    lz /= ll;
    // whole-crown normal (soft, painterly overall form)
    let qx = px - cx,
      qy = (py - cy) * 0.85,
      qz = pz - cz;
    const ql = Math.hypot(qx, qy, qz) || 1;
    qx /= ql;
    qy /= ql;
    qz /= ql;
    let nx = sN[i * 3],
      ny = sN[i * 3 + 1],
      nz = sN[i * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx = (nx / nl) * 0.34 + lx * 0.46 + qx * 0.2;
    ny = (ny / nl) * 0.34 + ly * 0.46 + qy * 0.2 + 0.06;
    nz = (nz / nl) * 0.34 + lz * 0.46 + qz * 0.2;
    const ml = Math.hypot(nx, ny, nz) || 1;
    const vy = (py - cy) / Math.max(0.2, ymax);
    const sv = smooth01((vy + 0.85) / 1.7);
    const grad = lo + (hi - lo) * sv;
    // occlusion: underside, seams between leaf masses, depth into the crown (concave = deep)
    const radial = Math.hypot(px - cx, (py - cy) * 0.8, pz - cz) / Math.max(0.3, rh);
    let ao = (aoLo + (1 - aoLo) * smooth01((vy + 0.95) / 1.5)) * (0.52 + 0.48 * smooth01(sG[i])) * (0.6 + 0.4 * smooth01(radial * 1.35 - 0.3));
    if (groundY !== undefined) ao *= 0.55 + 0.45 * smooth01((py - groundY) / Math.max(0.2, ymax * 0.9));
    const jit = 1 + 0.05 * Math.sin(px * 13.1 + pz * 17.3 + py * 11.7 + s3);
    // a little of the occlusion stays in the albedo so the far LOD (and the shadow side) keeps depth
    const k = grad * L.tint * jit * (0.86 + 0.14 * ao);
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
    leafAttr(s, ao, tone, amt, clump);
    s.vert(px, py, pz, nx / ml, ny / ml, nz / ml);
  }
  if (groundY !== undefined) {
    // drop triangles buried at the foot (bushes): all three corners on the ground
    const gy = groundY + 0.03;
    for (let k = 0; k < idx.length; k += 3) {
      if (sP[idx[k] * 3 + 1] <= gy && sP[idx[k + 1] * 3 + 1] <= gy && sP[idx[k + 2] * 3 + 1] <= gy) continue;
      s.tri(base + idx[k], base + idx[k + 1], base + idx[k + 2]);
    }
  } else for (let k = 0; k < idx.length; k += 3) s.tri(base + idx[k], base + idx[k + 1], base + idx[k + 2]);
  lastCanopy.rmax = rmax;
}

function smooth01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

// ───────────────────────────────────────────────────────────────── trunks ──

/**
 * Tapered trunk with a root flare; ring centres follow a straight lean from base to top.
 * `pattern` = aLeaf.w bark code (furrows / birch dashes painted by the shader).
 */
export function trunk(s: GeoSink, x: number, y: number, z: number, tx: number, ty: number, tz: number, r0: number, r1: number, sides: number, bark: THREE.Color, flare = 1.3, pattern = BARK_FURROW): void {
  const H = ty - y;
  const rings: [number, number, number, number][] =
    flare > 1.01
      ? [
          [0, r0 * flare, 0.8, 0.55],
          [Math.min(0.35, H * 0.12) / H, r0, 0.92, 0.8],
          [1, r1, 1.04, 1],
        ]
      : [
          [0, r0, 0.82, 0.6],
          [1, r1, 1.04, 1],
        ];
  const base = s.vcount;
  const rot = (x * 7.13 + z * 3.71) % 6.28;
  for (const [f, rad, shade, ao] of rings) {
    const cx = x + (tx - x) * f,
      cy = y + H * f,
      cz = z + (tz - z) * f;
    s.colorObj(bark, shade);
    leafAttr(s, ao, 0, 0, pattern);
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

/** Thin branch (tube, 4 sides) from a to b. */
function branch(s: GeoSink, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, bark: THREE.Color, pattern = BARK_FURROW): void {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const L = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / L,
    uy = dy / L,
    uz = dz / L;
  let px = -uz,
    pz = ux;
  const py = 0;
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
  for (const [cx, cy, cz, r, sh, ao] of [
    [ax, ay, az, r0, 0.9, 0.75],
    [bx, by, bz, r1, 1.0, 0.6],
  ] as [number, number, number, number, number, number][]) {
    s.colorObj(bark, sh);
    leafAttr(s, ao, 0, 0, pattern);
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
const _hsl = { h: 0, s: 0, l: 0 };

function pickLeaf(rng: Rng, list: string[], jitter = 0.04, tone = 0.5): THREE.Color {
  _leaf.copy(col(rng.pick(list)));
  _leaf.getHSL(_hsl);
  // tone: 0 → darker, bluer; 1 → lighter, yellower (forest stands / per-tree macro variety)
  const tt = tone - 0.5;
  _leaf.setHSL(
    _hsl.h + (rng.next() - 0.5) * jitter * 0.5 - tt * 0.035,
    Math.min(1, Math.max(0, _hsl.s + (rng.next() - 0.5) * jitter + tt * 0.06)),
    Math.min(1, Math.max(0, _hsl.l + (rng.next() - 0.5) * jitter + tt * 0.07)),
  );
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
    case 'birch':
      crownBase = birch(s, w, t, rng);
      break;
    default:
      crownBase = broadleaf(s, w, t, rng);
  }
  return { crownBase, tris: s.tcount - t0 };
}

type Family = 'dome' | 'oval' | 'spread' | 'irregular';

function broadleaf(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r, sp } = t;
  const fruit = sp === 'fruit';
  const blossom = sp === 'blossom';
  const autumn = sp === 'autumn';
  const fam: Family = blossom ? 'spread' : fruit ? 'dome' : rng.weighted<Family>(['dome', 'oval', 'spread', 'irregular'], [4, 2.2, 1.5, 1.8]);
  // proportions
  let clear = t.clear ?? h * (fruit ? rng.range(0.24, 0.3) : fam === 'spread' ? rng.range(0.3, 0.36) : rng.range(0.24, 0.32));
  clear = Math.min(clear, h - 1.2);
  const crownH = h - clear;
  const Rv = crownH / 2;
  // the lobe union reaches ~0.8 Rv below the centre → shift the crown down so it meets `clear`
  const cy = y + clear + Rv * 0.8;
  // lean (irregular crowns lean more, the crown mass sits off-centre)
  const la = rng.range(0, Math.PI * 2),
    lm = rng.range(0, fam === 'irregular' ? 0.06 : 0.035) * h;
  const lx = Math.cos(la) * lm,
    lz = Math.sin(la) * lm;
  const cx = x + lx,
    cz = z + lz;
  w.at(x, y, z, 1 / 10, 0, 0);
  // trunk
  const r0 = Math.max(0.09, Math.min(0.42, 0.032 * h + r * 0.025));
  const bark = col(rng.pick(blossom ? BARK.dark : BARK.brown));
  const topY = cy - Rv * 0.15;
  const sides = t.far ? 4 : t.detail >= 2 ? 6 : 5;
  trunk(s, x, y, z, cx, topY, cz, r0, r0 * 0.55, sides, bark, t.far ? 1 : 1.3);
  // lobes: core + ring of leaf masses (silhouette) + top masses (+ small clump bumps on big crowns)
  const lobes: Lobe[] = [];
  const flat = blossom ? 0.78 : fruit ? 0.9 : fam === 'spread' ? 0.82 : 1.0;
  const vr = Math.min(1.25, Math.max(0.85, Rv / r));
  const coreR = fam === 'spread' ? 0.6 : fam === 'oval' ? 0.6 : 0.64;
  lobes.push({ x: 0, y: 0, z: 0, rx: r * coreR, ry: Rv * (fam === 'oval' ? 0.84 : 0.76) * flat, rz: r * coreR, tint: rng.range(0.9, 0.98) });
  const n2 = (t.detail >= 3 ? rng.int(7, 9) : t.detail === 2 ? rng.int(5, 7) : rng.int(4, 5)) + (blossom ? 1 : 0);
  const th0 = rng.range(0, Math.PI * 2);
  // irregular crowns: the ring is biased to one side (a heavy limb), the opposite side is thinner
  const biasA = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n2; i++) {
    const th = th0 + (i / n2) * Math.PI * 2 + rng.range(-0.32, 0.32);
    const el = fam === 'spread' ? rng.range(-0.3, 0.42) : fam === 'oval' ? rng.range(-0.6, 0.8) : rng.range(-0.5, 0.7);
    const side = fam === 'irregular' ? 0.78 + 0.3 * Math.cos(th - biasA) : 1;
    const rad = r * (blossom ? rng.range(0.32, 0.42) : rng.range(0.36, 0.5)) * Math.min(1.08, side);
    let d = r * (fam === 'spread' ? rng.range(0.56, 0.66) : rng.range(0.48, 0.6)) * side;
    if (d * Math.cos(el) + rad > r * 1.04) d = (r * 1.04 - rad) / Math.max(0.3, Math.cos(el));
    lobes.push({
      x: Math.cos(th) * Math.cos(el) * d,
      y: Math.sin(el) * Rv * (fam === 'oval' ? 0.7 : 0.62) * flat,
      z: Math.sin(th) * Math.cos(el) * d,
      rx: rad,
      ry: rad * rng.range(0.8, 1.0) * vr * flat * (fam === 'spread' ? 0.85 : 1),
      rz: rad,
      tint: rng.range(0.82, 1.14),
    });
  }
  // top masses: one (dome/oval) or two-three offset puffs (spread/irregular/blossom)
  const nTop = fam === 'dome' || fam === 'oval' ? 1 : rng.int(2, 3);
  for (let i = 0; i < nTop; i++) {
    const a = rng.range(0, 6.28),
      off = nTop > 1 ? rng.range(0.18, 0.3) * r : rng.range(0, 0.12) * r;
    const rad = r * (nTop > 1 ? rng.range(0.34, 0.42) : 0.46);
    lobes.push({ x: Math.cos(a) * off, y: Rv * (fam === 'oval' ? 0.56 : 0.46) * flat, z: Math.sin(a) * off, rx: rad, ry: Rv * (fam === 'oval' ? 0.42 : 0.4) * flat * (nTop > 1 ? 0.85 : 1), rz: rad, tint: rng.range(1.02, 1.14) });
  }
  // small clump bumps riding on the silhouette (big, finely tessellated crowns only — the rng draws
  // happen for every LOD so near and far copies stay identical)
  const nb = rng.int(5, 8);
  for (let i = 0; i < nb; i++) {
    const a = rng.range(0, 6.28),
      el = rng.range(-0.15, 0.85),
      rad = r * rng.range(0.22, 0.3);
    if (t.detail < 3 || t.far) continue;
    const d = r * 1.02 - rad;
    lobes.push({ x: Math.cos(a) * Math.cos(el) * d, y: Math.sin(el) * (Rv * 0.9 * flat - rad * 0.6), z: Math.sin(a) * Math.cos(el) * d, rx: rad, ry: rad * 0.9, rz: rad, tint: rng.range(0.96, 1.14) });
  }
  // branches into the canopy (visible forks under the crown)
  if (t.detail >= 2 && r > 2.0) {
    const nbr = blossom ? 4 : 3;
    for (let i = 0; i < nbr; i++) {
      const L = lobes[1 + (i % Math.max(1, n2))];
      const f = rng.range(0.55, 0.8);
      const bx0 = x + (cx - x) * f,
        by0 = y + (topY - y) * f * 0.85,
        bz0 = z + (cz - z) * f;
      if (!t.far) branch(s, bx0, by0, bz0, cx + L.x * 0.75, cy + L.y * 0.6 - Rv * 0.2, cz + L.z * 0.75, r0 * 0.42, r0 * 0.2, bark);
    }
  }
  // canopy colour
  let leafList = LEAF.round;
  if (blossom) leafList = rng.chance(0.75) ? LEAF.blossomPink : LEAF.blossomWhite;
  else if (autumn) leafList = LEAF.autumn;
  else if (fruit) leafList = LEAF.fruit;
  else {
    const u = rng.next();
    if (u < 0.2) leafList = LEAF.roundDark;
    else if (u < 0.3) leafList = LEAF.roundOlive;
  }
  const leaf = pickLeaf(rng, leafList, autumn ? 0.08 : 0.06, t.tone ?? 0.5).clone();
  w.at(x, y, z, 1 / 10, 1.0, 0);
  const white = blossom && leaf.r > 0.75 && leaf.g > 0.7;
  const opts: CanopyOpts = {
    leaf,
    noise: 0.085,
    lo: blossom ? 0.8 : 0.74,
    hi: white ? 0.98 : blossom ? 1.04 : 1.08,
    aoLo: blossom ? 0.5 : 0.42,
    warm: blossom ? 0.05 : autumn ? 0.15 : 0.32,
    clump: blossom ? 0.62 : fruit ? 0.42 : Math.min(0.75, 0.42 + r * 0.08),
    tone: autumn ? 1 : blossom ? 0.65 : 0.5,
  };
  // blossoms: fresh green leaves showing through the flowers (so they never read as cotton / snow)
  if (blossom) opts.speckle = { color: col(white ? '#8fb85a' : '#86ad55'), p: white ? 0.2 : 0.14, mix: 0.5 };
  if (autumn && rng.chance(0.6)) opts.speckle = { color: col(rng.pick(['#e8c24a', '#c9472f', '#a3b04a'])), p: 0.22, mix: 0.5 };
  const cseed = rng.int(0, 1e9);
  lobedCanopy(s, cx, cy, cz, lobes, t.far ? 1 : t.detail, cseed, opts);
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

/**
 * Airy birch: slender white trunk (dashes painted in the shader) running up through a narrow, deeply
 * notched oval crown (leaf masses spiral up on alternating sides), plus one or two detached leaf
 * clouds hanging off thin dark twigs — the gaps and satellites read as "light and loose".
 */
function birch(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r } = t;
  let clear = t.clear ?? h * rng.range(0.32, 0.4);
  clear = Math.min(clear, h - 1.4);
  const crownH = h - clear;
  w.at(x, y, z, 1 / 10, 0, 0);
  const la = rng.range(0, 6.28),
    lm = rng.range(0.02, 0.05) * h;
  const tx = x + Math.cos(la) * lm,
    tz = z + Math.sin(la) * lm;
  const r0 = Math.max(0.08, Math.min(0.24, 0.02 * h + r * 0.02));
  const white = col(BARK.birch);
  const sides = t.far ? 4 : 5;
  // leader runs up into the crown
  trunk(s, x, y, z, tx, y + h * 0.88, tz, r0, r0 * 0.35, sides, white, t.far ? 1 : 1.12, BARK_BIRCH);
  const leaf = pickLeaf(rng, LEAF.birch, 0.06, t.tone ?? 0.5).clone();
  // main crown: narrow core + leaf masses spiralling up, alternating sides (deep notches between them)
  const Rv = crownH / 2;
  const cy = y + clear + Rv * 0.92;
  const lobes: Lobe[] = [{ x: 0, y: 0, z: 0, rx: r * 0.5, ry: Rv * 0.8, rz: r * 0.5, tint: 0.94 }];
  const n = 6;
  const th0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const a = th0 + i * 2.6 + rng.range(-0.35, 0.35);
    const rad = r * rng.range(0.36, 0.46) * (1 - 0.25 * f);
    const d = Math.min(r * 1.0 - rad, r * rng.range(0.34, 0.52));
    lobes.push({ x: Math.cos(a) * d, y: (-0.62 + 1.2 * f) * Rv, z: Math.sin(a) * d, rx: rad, ry: Math.min(rad * 1.15, Rv * 0.36), rz: rad, tint: rng.range(0.88, 1.12) });
  }
  lobes.push({ x: rng.range(-0.1, 0.1) * r, y: Rv * 0.78, z: rng.range(-0.1, 0.1) * r, rx: r * 0.3, ry: Rv * 0.3, rz: r * 0.3, tint: 1.1 });
  // satellites: detached leaf clouds on the lower flanks (drawn near only; their randoms always drawn)
  const nSat = r >= 1.8 ? 2 : 1;
  const sats: { x: number; y: number; z: number; rr: number; a: number }[] = [];
  for (let i = 0; i < nSat; i++) {
    const a = th0 + 1.3 + i * 3.1 + rng.range(-0.4, 0.4);
    const rr = r * rng.range(0.28, 0.36);
    const d = r * 1.02 - rr;
    sats.push({ x: tx + Math.cos(a) * d, y: y + clear + crownH * rng.range(0.12, 0.38), z: tz + Math.sin(a) * d, rr, a });
  }
  const twig = col('#6b625a');
  w.at(x, y, z, 1 / 10, 1.3, 0);
  const opts: CanopyOpts = { leaf, noise: 0.12, lo: 0.8, hi: 1.1, aoLo: 0.55, warm: 0.3, clump: 0.32, tone: 0.55 };
  lobedCanopy(s, tx, cy, tz, lobes, t.far || t.detail <= 1 ? 1 : 2, rng.int(0, 1e9), opts);
  const sseed = rng.int(0, 1e9);
  if (!t.far && t.detail >= 2) {
    sats.forEach((c, i) => {
      const lf = (c.y - c.rr - y) / h;
      branch(s, x + (tx - x) * lf, c.y - c.rr * 1.4, z + (tz - z) * lf, c.x, c.y - c.rr * 0.3, c.z, r0 * 0.3, r0 * 0.14, twig);
      w.at(x, y, z, 1 / 10, 1.4, 0);
      const sl: Lobe[] = [
        { x: 0, y: 0, z: 0, rx: c.rr, ry: c.rr * 0.85, rz: c.rr, tint: 1.02 },
        { x: Math.cos(c.a) * c.rr * 0.45, y: -c.rr * 0.25, z: Math.sin(c.a) * c.rr * 0.45, rx: c.rr * 0.7, ry: c.rr * 0.6, rz: c.rr * 0.7, tint: 0.94 },
      ];
      lobedCanopy(s, c.x, c.y, c.z, sl, 1, sseed + i, opts);
    });
  }
  return clear;
}

function column(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r } = t;
  const clear = t.clear ?? h * rng.range(0.1, 0.16);
  const crownH = h - clear;
  const Rv = crownH / 2;
  const cy = y + clear + Rv * 0.96;
  w.at(x, y, z, 1 / 9, 0, 0);
  const r0 = Math.max(0.1, Math.min(0.3, 0.024 * h));
  trunk(s, x, y, z, x, cy - Rv * 0.4, z, r0, r0 * 0.6, t.far ? 4 : 5, col(rng.pick(BARK.brown)), t.far ? 1 : 1.25);
  // spindle: a slim core, alternating side bulges, a pointed top
  const lobes: Lobe[] = [{ x: 0, y: -Rv * 0.06, z: 0, rx: r * 0.8, ry: Rv * 0.9, rz: r * 0.8, tint: 0.95 }];
  const n = 5;
  const th0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const f = -0.62 + (i / (n - 1)) * 1.12;
    const th = th0 + i * 2.5 + rng.range(-0.3, 0.3);
    const rad = r * (0.66 - Math.max(0, f) * 0.28) * rng.range(0.9, 1.08);
    const off = r * rng.range(0.18, 0.3);
    if (t.far && i % 2 === 1) continue;
    lobes.push({ x: Math.cos(th) * off, y: f * Rv * 0.78, z: Math.sin(th) * off, rx: rad, ry: Rv * 0.3, rz: rad, tint: rng.range(0.86, 1.1) });
  }
  lobes.push({ x: 0, y: Rv * 0.62, z: 0, rx: r * 0.42, ry: Rv * 0.4, rz: r * 0.42, tint: 1.08 });
  const leaf = pickLeaf(rng, LEAF.column, 0.05, t.tone ?? 0.5).clone();
  w.at(x, y, z, 1 / 9, 1.15, 0);
  lobedCanopy(s, x, cy, z, lobes, t.far ? 1 : t.detail, rng.int(0, 1e9), { leaf, noise: 0.08, lo: 0.74, hi: 1.06, aoLo: 0.45, warm: 0.26, clump: 0.34, tone: 0.45 });
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
  const leaf = pickLeaf(rng, LEAF.willow, 0.05, t.tone ?? 0.5).clone();
  // domed crown
  const lobes: Lobe[] = [{ x: 0, y: 0, z: 0, rx: r * 0.7, ry: Rv * 0.62, rz: r * 0.7, tint: 0.95 }];
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * 6.28 + rng.range(-0.3, 0.3);
    const rad = r * rng.range(0.36, 0.44);
    lobes.push({ x: Math.cos(th) * r * 0.55, y: rng.range(-0.05, 0.35) * Rv, z: Math.sin(th) * r * 0.55, rx: rad, ry: rad * 0.72, rz: rad, tint: rng.range(0.88, 1.1) });
  }
  lobes.push({ x: 0, y: Rv * 0.4, z: 0, rx: r * 0.5, ry: Rv * 0.4, rz: r * 0.5, tint: 1.08 });
  w.at(x, y, z, 1 / 10, 0.9, 0);
  lobedCanopy(s, x, cy, z, lobes, t.far ? 1 : t.detail, rng.int(0, 1e9), { leaf, noise: 0.07, lo: 0.74, hi: 1.08, aoLo: 0.5, warm: 0.25, clump: 0.3, tone: 0.5 });
  // weeping strands: start on the dome, arch over its rim, then fall in narrow ribbons with gaps
  const nR = t.far ? 12 : t.detail >= 2 ? 30 : 14;
  const crownFlex = (cy - y) / 10;
  const clump = clumpCode(0.22);
  for (let i = 0; i < nR; i++) {
    const a = (i / nR) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const px = -sa,
      pz = ca; // tangent
    const hem = y + clear * rng.range(0.1, 0.55);
    const wid = rng.range(0.2, 0.3) * (r / 3);
    const shade = rng.range(0.82, 1.08);
    const rimY = cy - Rv * rng.range(0.0, 0.25);
    const out = rng.range(0.98, 1.1);
    const pts: number[][] = [
      [r * 0.55, cy + Rv * 0.5, 0],
      [r * 0.92 * out, rimY + Rv * 0.12, 0.15],
      [r * 1.02 * out, rimY - (rimY - hem) * 0.35, 0.45],
      [r * 1.06 * out, rimY - (rimY - hem) * 0.7, 0.75],
      [r * 1.08 * out, hem, 1],
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
      // smooth normals: up on the dome, outward along the falling curtain
      const ny = f < 0.3 ? 0.85 - f : 0.25 - 0.1 * f;
      const nl = Math.hypot(1, ny);
      // lighter tips, darker inner face
      s.colorObj(leaf, shade * (1.06 - 0.18 * f) * (f > 0.85 ? 1.08 : 1));
      leafAttr(s, 0.95 - 0.25 * f, leafTone(1, true), 1, clump);
      front.push(s.vert(qx - px * ww, qy, qz - pz * ww, ca / nl, ny / nl, sa / nl), s.vert(qx + px * ww, qy, qz + pz * ww, ca / nl, ny / nl, sa / nl));
      s.colorObj(leaf, shade * (0.7 - 0.16 * f));
      leafAttr(s, 0.45 - 0.15 * f, leafTone(1, true), 1, clump);
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

// ─────────────────────────────────────────────────────────────── conifers ──

type ConiferKind = 'spruce' | 'fir' | 'pine';
const _tipC = new THREE.Color();
const TIP = new THREE.Color('#8fbf5a');

/**
 * Spruce / fir: a stack of drooping skirts. Each skirt is apex → shoulder ring → scalloped rim where
 * every other rim vertex is a branch tip (longer, drooping, lighter "fresh growth") and the ones between
 * are gaps (shorter, higher, darker). Normals blend the skirt profile with the whole cone so the tree
 * shades as one soft form; tiers rotate by a golden angle and wobble a little.
 * Pine: clear warm trunk, a few flat cloud pads on top (lobed canopy).
 */
function conifer(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r } = t;
  const kind: ConiferKind = rng.weighted<ConiferKind>(['spruce', 'fir', 'pine'], [5, 3.2, t.detail <= 1 ? 0.9 : 0.6]);
  if (kind === 'pine') return pine(s, w, t, rng);
  const forest = t.detail <= 1;
  const y0 = y + (t.clear ?? h * rng.range(0.05, 0.11));
  w.at(x, y, z, 1 / 12, 0, 0);
  const r0 = Math.max(0.1, Math.min(0.32, 0.024 * h));
  trunk(s, x, y, z, x, y0 + (h - (y0 - y)) * 0.3, z, r0, r0 * 0.6, forest || t.far ? 4 : 5, col(rng.pick(BARK.conifer)), forest || t.far ? 1 : 1.2);
  const leaf = pickLeaf(rng, kind === 'spruce' ? LEAF.spruce : LEAF.fir, 0.06, t.tone ?? 0.5).clone();
  const fir = kind === 'fir';
  const extra = rng.chance(0.3) ? 1 : 0;
  const tiers = forest ? Math.max(3, (h > 10 ? 4 : 3) + extra - (fir ? 1 : 0)) : (h > 9.5 ? 5 : h > 6.5 ? 4 : 3) + extra - (fir ? 1 : 0);
  const tips = t.far ? 4 : forest ? 5 : 6;
  const S = tips * 2;
  const top = y + h;
  const span = top - y0;
  const rWide = r * (fir ? 1.18 : 1.1);
  // whole-cone normal tilt (soft overall shading)
  const coneUp = rWide / Math.hypot(rWide, span);
  const coneOut = span / Math.hypot(rWide, span);
  w.at(x, y, z, 1 / 12, 0.45, 0);
  const rot0 = rng.range(0, 6.28);
  const clump = clumpCode(forest ? 0.4 : 0.32);
  const tone = leafTone(0.9, true);
  // per-tier randoms are drawn in a fixed order for every LOD (near/far stay identical)
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const tb = y0 + span * f * 0.86;
    const tt = i === tiers - 1 ? top : Math.min(top - 0.2, tb + span * (0.5 - 0.055 * i));
    const th = tt - tb;
    // wide, flaring skirts: every tier's rim steps out beyond the tier above (stepped silhouette)
    const rr = rWide * Math.pow(1 - f * 0.86, fir ? 0.85 : 0.95) * rng.range(0.92, 1.05);
    const droop = th * rng.range(0.12, 0.18) * (fir ? 1.2 : 1);
    const rot = rot0 + i * 2.39996 + rng.range(-0.35, 0.35);
    const ox = rng.range(-0.07, 0.07) * rr,
      oz = rng.range(-0.07, 0.07) * rr;
    const tipLen: number[] = [];
    for (let j = 0; j < 7; j++) tipLen.push(rng.range(0.94, 1.1));
    const tierAO = 0.72 + 0.28 * f; // lower skirts sit in the shade of the ones above
    const shadeT = 0.86 + 0.18 * f;
    // convex skirt profile (radius, height above the rim): apex → shoulder → rim
    const rS = 0.57,
      hS = 0.34;
    // outward profile normals from the two segments (radial, up), blended with the whole cone
    const n1r = th * (1 - hS),
      n1u = rr * rS; // apex→shoulder segment normal
    const n2r = th * hS + droop,
      n2u = rr * (1 - rS); // shoulder→rim segment normal
    const l1 = Math.hypot(n1r, n1u),
      l2 = Math.hypot(n2r, n2u);
    const shR = (n1r / l1 + n2r / l2) * 0.5 * 0.7 + coneOut * 0.3,
      shU = (n1u / l1 + n2u / l2) * 0.5 * 0.7 + coneUp * 0.3 + 0.08;
    const rmR = (n2r / l2) * 0.7 + coneOut * 0.3,
      rmU = (n2u / l2) * 0.7 + coneUp * 0.3;
    const base = s.vcount;
    // apex
    s.colorObj(leaf, 1.12 * shadeT);
    leafAttr(s, 1, tone, 0.8, clump);
    const apex = s.vert(x + ox * 0.3, tt, z + oz * 0.3, 0, 1, 0);
    // shoulder ring
    for (let k = 0; k < S; k++) {
      const a = rot + (k / S) * Math.PI * 2;
      const tip = k % 2 === 0;
      const c = Math.cos(a),
        sn = Math.sin(a);
      const rs = rr * rS * (tip ? 1.05 : 0.95);
      const ys = tb + th * hS * (tip ? 0.96 : 1.04);
      const pl = Math.hypot(shR, shU);
      s.colorObj(leaf, (tip ? 1.0 : 0.93) * shadeT);
      leafAttr(s, (tip ? 0.92 : 0.84) * tierAO, tone, 0.8, clump);
      s.vert(x + ox + c * rs, ys, z + oz + sn * rs, (c * shR) / pl, shU / pl, (sn * shR) / pl);
    }
    // rim ring: tips droop out and down, gaps tuck in a little
    for (let k = 0; k < S; k++) {
      const a = rot + (k / S) * Math.PI * 2;
      const tip = k % 2 === 0;
      const c = Math.cos(a),
        sn = Math.sin(a);
      const L = tip ? tipLen[(k >> 1) % 7] * 1.03 : 0.9;
      const rad = rr * L;
      const yy = tip ? tb - droop * L : tb - droop * 0.35;
      const pl = Math.hypot(rmR, rmU);
      if (tip) {
        _tipC.copy(leaf).lerp(TIP, 0.16).multiplyScalar(1.06 * shadeT);
        s.colorObj(_tipC);
      } else s.colorObj(leaf, 0.84 * shadeT);
      leafAttr(s, (tip ? 1 : 0.7) * tierAO, tone, 0.8, clump);
      s.vert(x + ox + c * rad, yy, z + oz + sn * rad, (c * rmR) / pl, rmU / pl, (sn * rmR) / pl);
    }
    const sh0 = base + 1,
      rm0 = base + 1 + S;
    for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S;
      s.tri(apex, sh0 + k1, sh0 + k);
      s.quad(sh0 + k, sh0 + k1, rm0 + k1, rm0 + k);
    }
    if (!forest && !t.far && i === 0) {
      // shallow dark underside of the lowest skirt (visible from low views): rim copies with downward normals → trunk
      const ub = s.vcount;
      s.colorObj(leaf, 0.5);
      leafAttr(s, 0.3, tone, 0.6, clump);
      const u = s.vert(x, tb + th * 0.22, z, 0, -1, 0);
      for (let k = 0; k < S; k++) {
        const a = rot + (k / S) * Math.PI * 2;
        const tip = k % 2 === 0;
        const L = tip ? tipLen[(k >> 1) % 7] * 1.03 : 0.9;
        const rad = rr * L;
        s.vert(x + ox + Math.cos(a) * rad, (tip ? tb - droop * L : tb - droop * 0.35) - 0.01, z + oz + Math.sin(a) * rad, Math.cos(a) * 0.3, -0.95, Math.sin(a) * 0.3);
      }
      for (let k = 0; k < S; k++) s.tri(u, ub + 1 + k, ub + 1 + ((k + 1) % S));
    }
  }
  // leader spike
  if (!t.far && !forest) {
    s.colorObj(leaf, 1.1);
    _tipC.copy(leaf).lerp(TIP, 0.3);
    leafAttr(s, 1, tone, 0.5, clump);
    const b = s.vcount;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      s.vert(x + Math.cos(a) * 0.07, top - 0.25, z + Math.sin(a) * 0.07, Math.cos(a), 0.4, Math.sin(a));
    }
    s.colorObj(_tipC);
    const tp = s.vert(x, top + 0.45, z, 0, 1, 0);
    for (let k = 0; k < 3; k++) s.tri(b + k, tp, b + ((k + 1) % 3));
  }
  return y0 - y;
}

/** Pine: tall clear trunk (warm bark), a few separate flat cloud pads on short limbs near the top. */
function pine(s: GeoSink, w: Wind, t: TreeSpec, rng: Rng): number {
  const { x, y, z, h, r } = t;
  const forest = t.detail <= 1;
  const clear = h * rng.range(0.56, 0.64);
  const crownH = h - clear;
  const la = rng.range(0, 6.28),
    lm = rng.range(0.03, 0.07) * h;
  const tx = x + Math.cos(la) * lm,
    tz = z + Math.sin(la) * lm;
  w.at(x, y, z, 1 / 12, 0, 0);
  const r0 = Math.max(0.1, Math.min(0.3, 0.022 * h));
  const bark = col(rng.pick(BARK.pine));
  const topY = y + h - crownH * 0.25;
  trunk(s, x, y, z, tx, topY, tz, r0, r0 * 0.5, forest || t.far ? 4 : 5, bark, forest || t.far ? 1 : 1.15);
  const leaf = pickLeaf(rng, LEAF.pine, 0.06, t.tone ?? 0.5).clone();
  const R = r * 1.15;
  // pads: the top one centred, the others on limbs to the sides, lower ones larger
  const n = forest ? 2 : t.far ? 3 : 4;
  const a0 = rng.range(0, 6.28);
  const pads: { x: number; y: number; z: number; rad: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const f = i / 3; // 0 = lowest
    const a = a0 + i * 2.3 + rng.range(-0.4, 0.4);
    const rad = R * (0.62 - 0.22 * f) * rng.range(0.9, 1.08);
    const d = i === 3 ? R * 0.06 : Math.min(R * 1.02 - rad, R * rng.range(0.3, 0.5));
    if (i >= 4 - n || i === 3) pads.push({ x: tx + Math.cos(a) * d, y: y + clear + crownH * (0.18 + 0.62 * f), z: tz + Math.sin(a) * d, rad });
  }
  w.at(x, y, z, 1 / 12, 0.5, 0);
  const opts: CanopyOpts = { leaf, noise: 0.12, lo: 0.74, hi: 1.08, aoLo: 0.38, warm: 0.2, clump: 0.3, tone: 0.45, amt: 0.85, billow: true };
  pads.forEach((p, i) => {
    if (!t.far && !forest && i < pads.length - 1) {
      const lf = (p.y - p.rad * 0.25 - y) / h;
      branch(s, x + (tx - x) * lf, p.y - p.rad * 0.3, z + (tz - z) * lf, p.x, p.y - p.rad * 0.1, p.z, r0 * 0.38, r0 * 0.18, bark);
      w.at(x, y, z, 1 / 12, 0.5, 0);
    }
    const sa = rng.range(0, 6.28);
    const pl: Lobe[] = [
      { x: 0, y: 0, z: 0, rx: p.rad, ry: p.rad * 0.36, rz: p.rad * 0.92, tint: rng.range(0.92, 1.06) },
      { x: Math.cos(sa) * p.rad * 0.4, y: p.rad * 0.12, z: Math.sin(sa) * p.rad * 0.4, rx: p.rad * 0.66, ry: p.rad * 0.32, rz: p.rad * 0.66, tint: rng.range(1.0, 1.12) },
    ];
    lobedCanopy(s, p.x, p.y, p.z, pl, 1, rng.int(0, 1e9), opts);
  });
  return clear;
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
    for (const [P, rad, sh, ao] of [
      [A, ra * 1.12, 0.92, k === 0 ? 0.6 : 0.82],
      [B, rb * 0.95, 1.05, 1],
    ] as [[number, number, number], number, number, number][]) {
      s.colorObj(k % 2 ? barkA : barkB, sh);
      leafAttr(s, ao, 0, 0, BARK_FURROW);
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
  const leaf = pickLeaf(rng, LEAF.palm, 0.04, t.tone ?? 0.5).clone();
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
  const clump = clumpCode(0.2);
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
      const shade = 0.84 + 0.22 * f;
      const c = _tmpC.copy(leaf).lerp(tip, f * f * 0.45);
      s.colorObj(c, shade);
      leafAttr(s, 0.75 + 0.25 * f, leafTone(1, true), 1, clump);
      top.push(s.vert(px, py, pz, 0, 1, 0));
      s.colorObj(c, shade * 0.94);
      left.push(s.vert(px + sx * wd, py - wd * 0.45, pz + sz * wd, sx * 0.4, 0.9, sz * 0.4));
      right.push(s.vert(px - sx * wd, py - wd * 0.45, pz - sz * wd, -sx * 0.4, 0.9, -sz * 0.4));
      // underside copies
      s.colorObj(c, shade * 0.62);
      leafAttr(s, 0.45 + 0.2 * f, leafTone(1, true), 1, clump);
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
/** bare stems and shade under a clipped hedge */
const HEDGE_WOOD = new THREE.Color('#3a3226');
const HEDGE_FRESH = new THREE.Color('#8dbb4f');

/** small closed ellipsoid (fruit, nuts, buds…) */
export function blob(s: GeoSink, x: number, y: number, z: number, rx: number, ry: number, rz: number, c: THREE.Color, detail: number, shadeLo = 0.75): void {
  const t = icoTpl(detail);
  const base = s.vcount;
  leafAttr(s, 1, 0, 0, 0);
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

/** tiny 4-petal flower facing up (5 verts, 4 tris) */
function bloom(s: GeoSink, x: number, y: number, z: number, r: number, c: THREE.Color, rot: number): void {
  s.colorObj(c, 1.08);
  leafAttr(s, 1, leafTone(1), 0.3, 0);
  const top = s.vert(x, y + r * 0.35, z, 0, 1, 0);
  s.colorObj(c, 0.9);
  const b = s.vcount;
  for (let i = 0; i < 4; i++) {
    const a = rot + (i / 4) * Math.PI * 2;
    s.vert(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5);
  }
  for (let i = 0; i < 4; i++) s.tri(top, b + ((i + 1) % 4), b + i);
}

/** Clumpy shrub of 3-5 leaf masses sitting on the ground (dark foot, leafy relief in-shader). */
export function bush(s: GeoSink, w: Wind, x: number, y: number, z: number, r: number, h: number, seed: number, o: BushOpts = {}): void {
  const rng = new Rng(seed);
  const leaf = o.leaf ?? pickLeaf(rng, LEAF.bush, 0.07).clone();
  const lobes: Lobe[] = [{ x: 0, y: 0, z: 0, rx: r * 0.8, ry: h * 0.52, rz: r * 0.8, tint: 0.96 }];
  const n = rng.int(3, 4);
  const a0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.28 + rng.range(-0.4, 0.4);
    const rad = r * rng.range(0.44, 0.6);
    lobes.push({ x: Math.cos(a) * r * 0.45, y: rng.range(-0.05, 0.28) * h, z: Math.sin(a) * r * 0.45, rx: rad, ry: rad * (h / r) * 0.9, rz: rad, tint: rng.range(0.86, 1.12) });
  }
  // a crowning puff, off-centre
  const ta = rng.range(0, 6.28);
  lobes.push({ x: Math.cos(ta) * r * 0.15, y: h * 0.3, z: Math.sin(ta) * r * 0.15, rx: r * 0.5, ry: h * 0.36, rz: r * 0.5, tint: rng.range(1.0, 1.12) });
  w.at(x, y, z, 0.25, 0.7, 0);
  const cy = y + h * 0.42;
  lobedCanopy(s, x, cy, z, lobes, o.detail ?? 1, rng.int(0, 1e9), {
    leaf,
    noise: 0.12,
    ground: y + 0.02,
    lo: 0.72,
    hi: 1.06,
    aoLo: 0.38,
    warm: 0.25,
    clump: Math.min(0.42, 0.18 + r * 0.14),
    tone: 0.55,
  });
  // flowering shrubs: a few real blossoms on the sunny top
  if (o.flower) {
    const nb = r > 0.6 ? rng.int(7, 11) : rng.int(4, 6);
    const rm = lastCanopy.rmax;
    for (let i = 0; i < nb; i++) {
      const a = rng.range(0, 6.28),
        el = rng.range(0.05, 1.15);
      const bx = x + Math.cos(a) * Math.cos(el) * rm * 0.85,
        bz = z + Math.sin(a) * Math.cos(el) * rm * 0.85,
        by = cy + Math.sin(el) * h * 0.55;
      bloom(s, bx, by, bz, Math.min(0.12, r * 0.13) * rng.range(0.8, 1.15), o.flower, a);
    }
  }
}

/**
 * Clipped hedge along a→b (ground level y): crisp clipped faces (sides, bevels, flat top) with
 * leafy relief from the shader, a dark foot and a fresh, lighter top.
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
  // a clipped hedge is bare and woody in its lowest ~20 cm (shaded stems, an undercut), leafy above
  const foot = Math.min(0.22, height * 0.2);
  // face = { pts: [v offset, height][], n: [normal v, normal y], shade, ao per point, wood }
  const faces: { pts: [number, number][]; n: [number, number]; sh: number; ao: number[]; wood?: boolean }[] = [
    { pts: [[-hw * 0.7, -0.04], [-hw * 0.72, foot * 0.75]], n: [-1, 0], sh: 0.5, ao: [0.25, 0.32], wood: true },
    { pts: [[-hw * 0.72, foot * 0.75], [-hw * 0.97, foot]], n: [-0.4, -0.9], sh: 0.55, ao: [0.32, 0.4] },
    { pts: [[-hw * 0.97, foot], [-hw, height * 0.86]], n: [-1, 0.05], sh: 0.84, ao: [0.45, 0.95] },
    { pts: [[-hw, height * 0.86], [-hw * 0.8, height]], n: [-0.6, 0.8], sh: 0.98, ao: [0.95, 1] },
    { pts: [[-hw * 0.8, height], [hw * 0.8, height]], n: [0, 1], sh: 1.07, ao: [1, 1] },
    { pts: [[hw * 0.8, height], [hw, height * 0.86]], n: [0.6, 0.8], sh: 0.98, ao: [1, 0.95] },
    { pts: [[hw, height * 0.86], [hw * 0.97, foot]], n: [1, 0.05], sh: 0.84, ao: [0.95, 0.45] },
    { pts: [[hw * 0.97, foot], [hw * 0.72, foot * 0.75]], n: [0.4, -0.9], sh: 0.55, ao: [0.4, 0.32] },
    { pts: [[hw * 0.72, foot * 0.75], [hw * 0.7, -0.04]], n: [1, 0], sh: 0.5, ao: [0.32, 0.25], wood: true },
  ];
  const ph = (seed % 1000) * 0.37;
  w.at(ax, y, az, 0.06, 0.32, 0);
  const clump = clumpCode(0.2);
  const starts: number[] = [];
  const counts = faces.map((f) => f.pts.length);
  const ringSize = counts.reduce((a2, b2) => a2 + b2, 0);
  const base = s.vcount;
  // rings along the hedge; two extra rings past each end round the clipped end off (no flat slab)
  const rings: [number, number, number][] = [
    [-0.15, 0.5, 0.8],
    [-0.08, 0.84, 0.94],
  ];
  for (let k = 0; k <= segs; k++) rings.push([(L * k) / segs, k === 0 || k === segs ? 0.97 : 1, k === 0 || k === segs ? 0.99 : 1]);
  rings.push([L + 0.08, 0.84, 0.94], [L + 0.15, 0.5, 0.8]);
  for (const [u, sw, sy] of rings) {
    const cx = ax + ux * u,
      cz = az + uz * u;
    const gy = yAt ? yAt(cx, cz) : y;
    w.ax = cx;
    w.az = cz;
    w.ay = gy;
    // per-ring leafy bulge (shared by every face so edges stay closed)
    const bulge = 0.05 * Math.sin(cx * 3.7 + cz * 2.9 + ph) + 0.03 * Math.sin(cx * 9.1 - cz * 8.3 + ph * 2.1);
    const topB = 0.05 * Math.sin(cx * 4.3 - cz * 3.1 + ph * 0.7) + 0.025 * Math.sin(cx * 11.3 + cz * 10.1);
    const mott = 0.92 + 0.1 * Math.sin(cx * 2.3 + cz * 1.9 + ph) + 0.06 * Math.sin(cx * 7.1 - cz * 5.3);
    for (const face of faces) {
      for (let pi = 0; pi < face.pts.length; pi++) {
        const [ov, oy] = face.pts[pi];
        const low = oy <= foot + 1e-6;
        const vv = (ov + (low ? 0 : Math.sign(ov) * bulge)) * sw;
        const yy = gy + (oy < 0 ? oy : (oy + (oy > height * 0.8 ? topB : 0)) * sy);
        // clipped top: fresh, lighter and a touch yellower new growth (reads at POI distance)
        if (face.wood) s.colorObj(HEDGE_WOOD, mott);
        else if (oy >= height * 0.99) s.colorObj(_tmpC.copy(leaf).lerp(HEDGE_FRESH, 0.14), face.sh * mott * 1.06);
        else s.colorObj(leaf, face.sh * mott * (low ? 0.72 : 1));
        leafAttr(s, face.ao[pi], leafTone(0.9, true), 0.62, clump);
        // the end rings lean their normals outwards along the hedge
        const ea = u < 0 ? -(1 - sw) * 1.6 : u > L ? (1 - sw) * 1.6 : 0;
        const nx = (vx * face.n[0]) + ux * ea,
          nz = (vz * face.n[0]) + uz * ea;
        const nl = Math.hypot(nx, face.n[1], nz);
        s.vert(cx + vx * vv, yy, cz + vz * vv, nx / nl, face.n[1] / nl, nz / nl);
      }
    }
  }
  let off = 0;
  for (const c of counts) {
    starts.push(off);
    off += c;
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const a0 = base + k * ringSize,
      b0 = base + (k + 1) * ringSize;
    faces.forEach((fc, fi) => {
      const st = starts[fi];
      for (let p = 0; p < fc.pts.length - 1; p++) s.quad(a0 + st + p, a0 + st + p + 1, b0 + st + p + 1, b0 + st + p);
    });
  }
  // end caps: close the last (small) ring
  for (const [ri, sgn] of [
    [0, -1],
    [rings.length - 1, 1],
  ] as [number, number][]) {
    const [u, sw, sy] = rings[ri];
    const cx = ax + ux * u,
      cz = az + uz * u;
    const gy = yAt ? yAt(cx, cz) : y;
    const outline: [number, number][] = [
      [-hw * 0.7, -0.04],
      [-hw * 0.93, foot],
      [-hw * 0.93, height * 0.86],
      [-hw * 0.75, height * 0.97],
      [hw * 0.75, height * 0.97],
      [hw * 0.93, height * 0.86],
      [hw * 0.93, foot],
      [hw * 0.7, -0.04],
    ];
    const cb = s.vcount;
    s.colorObj(leaf, 0.84);
    for (const [ov, oy] of outline) {
      leafAttr(s, oy < foot ? 0.45 : 0.9, leafTone(0.9, true), 0.62, clump);
      s.vert(cx + vx * ov * sw, gy + oy * sy, cz + vz * ov * sw, ux * sgn, 0.1, uz * sgn);
    }
    for (let p = 1; p < outline.length - 1; p++) {
      if (sgn > 0) s.tri(cb, cb + p, cb + p + 1);
      else s.tri(cb, cb + p + 1, cb + p);
    }
  }
}
