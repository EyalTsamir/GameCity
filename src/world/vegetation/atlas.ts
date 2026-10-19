// Procedural leaf atlas for the leaf-card foliage (drawn once at start-up on a 2D canvas, no assets).
//
// Every region is a "cluster" of leaves / needles / petals as a real twig carries them, drawn with the
// twig base at the bottom centre of the region (cards are placed with that end inside the crown and the
// leaves fanning outwards). Channels are data, not colour:
//   R  leaf brightness / shading (fold of the blade, darker leaves underneath, lighter midrib)
//   G  per-leaf random 0.08..1 (hue drift per leaf, leaf-by-leaf LOD dissolve); 0 on twigs (always kept)
//   B  flower / fruit mask (coloured by the card's flower colour); twigs are G = 0 (bark colour)
//   A  coverage (alpha-tested at 0.5)
// The mip chain is built here: colour is pulled into transparent texels (no dark fringes when filtered)
// and every mip's alpha is rescaled per region so its coverage at the 0.5 threshold equals the full-size
// coverage — crowns keep their density instead of thinning out with distance.

import * as THREE from 'three';
import { Rng } from '../../core/rng';

export const ATLAS_W = 2048;
export const ATLAS_H = 1024;
const T = 256; // tile size (px)

/** atlas regions (in tiles: col, row, width, height) */
const REGIONS = {
  broad: [0, 0, 1, 1],
  broadDense: [1, 0, 1, 1],
  plane: [2, 0, 1, 1],
  small: [3, 0, 1, 1],
  olive: [4, 0, 1, 1],
  birch: [5, 0, 1, 1],
  jacaranda: [6, 0, 1, 1],
  blossom: [0, 1, 1, 1],
  needle: [1, 1, 1, 1],
  pine: [2, 1, 1, 1],
  cypress: [3, 1, 1, 1],
  shrub: [4, 1, 1, 1],
  oleander: [5, 1, 1, 1],
  oak: [6, 1, 1, 1],
  fan: [0, 2, 1, 1],
  smallDense: [1, 2, 1, 1],
  needleDense: [2, 2, 1, 1],
  willow: [3, 2, 1, 1],
  citrus: [4, 2, 1, 1],
  dryFrond: [5, 2, 1, 1],
  bougain: [6, 2, 1, 1],
  frond: [7, 0, 1, 4],
} as const;

export type LeafTile = keyof typeof REGIONS;

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface LeafAtlas {
  texture: THREE.DataTexture;
  /** uv rect of a region (v0 = twig base / bottom of the drawing) */
  uv(tile: LeafTile): UvRect;
  /** coverage (0..1) of a region at the alpha threshold — for card-count heuristics */
  coverage(tile: LeafTile): number;
  buildMs: number;
  paintMs: number;
}

let cached: LeafAtlas | null = null;

export function getLeafAtlas(): LeafAtlas {
  if (cached) return cached;
  const t0 = performance.now();
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, ATLAS_W, ATLAS_H);
  const rng = new Rng(0x1eaf);
  for (const [name, r] of Object.entries(REGIONS)) {
    const [c, row, w, h] = r;
    g.save();
    g.beginPath();
    g.rect(c * T, row * T, w * T, h * T);
    g.clip();
    // local frame: origin at the twig base (bottom centre), +y up (canvas y flipped)
    g.translate(c * T + (w * T) / 2, row * T + h * T - 6);
    g.scale(1, -1);
    PAINT[name as LeafTile](g, rng.int(0, 1e9), w * T, h * T - 12);
    g.restore();
  }
  const tPaint = performance.now();
  const img = g.getImageData(0, 0, ATLAS_W, ATLAS_H);
  const { levels, cover } = buildMips(img.data);
  const tex = new THREE.DataTexture(levels[0].data, ATLAS_W, ATLAS_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels as unknown as THREE.DataTexture['mipmaps'];
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.name = 'leaf-atlas';
  cached = {
    texture: tex,
    uv(tile) {
      const [c, row, w, h] = REGIONS[tile];
      // canvas row 0 is at the top; DataTexture rows start at v = 0 → v = y / H directly (flipY off)
      const pad = 0.5;
      return { u0: (c * T + pad) / ATLAS_W, u1: ((c + w) * T - pad) / ATLAS_W, v0: ((row + h) * T - pad) / ATLAS_H, v1: (row * T + pad) / ATLAS_H };
    },
    coverage(tile) {
      return cover.get(tile) ?? 0.5;
    },
    buildMs: performance.now() - t0,
    paintMs: tPaint - t0,
  };
  return cached;
}

// ─────────────────────────────────────────────────────────────── painting ──

type Painter = (g: CanvasRenderingContext2D, seed: number, w: number, h: number) => void;

/** channel style: R brightness 0..1, G random 0..1, B material (0 leaf, 0.5 wood, 1 flower) */
const css = (r: number, gg: number, b: number, a = 1): string =>
  `rgba(${Math.round(Math.min(1, Math.max(0, r)) * 255)},${Math.round(Math.min(1, Math.max(0, gg)) * 255)},${Math.round(Math.min(1, Math.max(0, b)) * 255)},${a})`;

/** leaf random id (G): never 0 (0 = twig, always drawn) */
const lid = (rng: Rng): number => 0.08 + 0.92 * rng.next();

interface LeafOpts {
  /** half width relative to length */
  w: number;
  /** position of the widest point (0 base .. 1 tip) */
  wide?: number;
  /** base shape: 0 tapered, 1 rounded, 1.5 heart */
  base?: number;
  /** tip: 0 rounded, 1 acuminate */
  tip?: number;
  /** palmate lobes (plane / maple) */
  lobes?: number;
  /** midrib + fold shading */
  rib?: boolean;
  /** brightness contrast across the fold */
  fold?: number;
}

/** One leaf: base at (x, y), pointing along angle a (radians, 0 = +y), length L px. */
function leaf(g: CanvasRenderingContext2D, x: number, y: number, a: number, L: number, bright: number, id: number, o: LeafOpts, mat = 0): void {
  g.save();
  g.translate(x, y);
  g.rotate(-a);
  const hw = L * o.w;
  const wide = o.wide ?? 0.4;
  const base = o.base ?? 0.6;
  const tip = o.tip ?? 0.6;
  g.beginPath();
  if (o.lobes && o.lobes > 1) {
    // palmate / lobed: pointed lobes fanned from the petiole end (sub-paths filled as one union)
    const n = o.lobes;
    const fan = n >= 7 ? 2.6 : 2.2;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const ang = (f - 0.5) * fan;
      const len = L * (0.5 + 0.5 * Math.cos((f - 0.5) * 2.0));
      const lw = len * (n >= 7 ? 0.3 : 0.36);
      const c = Math.cos(ang),
        s = Math.sin(ang);
      // lobe in its own frame (base at the leaf centre-bottom), rotated by ang
      const P = (u: number, v: number): [number, number] => [u * c + v * s, -u * s + v * c];
      const p0 = P(0, L * 0.06);
      const p1 = P(lw, len * 0.35);
      const p2 = P(lw * 0.55, len * 0.8);
      const p3 = P(0, len);
      const p4 = P(-lw * 0.55, len * 0.8);
      const p5 = P(-lw, len * 0.35);
      g.moveTo(p0[0], p0[1]);
      g.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
      g.bezierCurveTo(p4[0], p4[1], p5[0], p5[1], p0[0], p0[1]);
    }
  } else {
    const yw = L * wide;
    g.moveTo(0, 0);
    g.bezierCurveTo(hw * base, L * 0.02, hw * 1.02, yw - L * 0.12, hw, yw);
    g.bezierCurveTo(hw * 0.98, yw + L * 0.25, hw * 0.35 * (1 - tip * 0.6), L * (0.92 - tip * 0.05), 0, L);
    g.bezierCurveTo(-hw * 0.35 * (1 - tip * 0.6), L * (0.92 - tip * 0.05), -hw * 0.98, yw + L * 0.25, -hw, yw);
    g.bezierCurveTo(-hw * 1.02, yw - L * 0.12, -hw * base, L * 0.02, 0, 0);
    g.closePath();
  }
  const fold = o.fold ?? 0.22;
  const gr = g.createLinearGradient(-hw, 0, hw, 0);
  gr.addColorStop(0, css(bright * (1 - fold), id, mat));
  gr.addColorStop(0.5, css(bright * (1 + fold * 0.25), id, mat));
  gr.addColorStop(1, css(bright * (1 - fold * 0.35), id, mat));
  g.fillStyle = gr;
  g.fill();
  // darker rim separates overlapping leaves
  g.lineWidth = Math.max(0.7, L * 0.025);
  g.strokeStyle = css(bright * 0.62, id, mat);
  g.stroke();
  if (o.rib !== false && L > 12) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, L * 0.88);
    g.lineWidth = Math.max(0.6, L * 0.022);
    g.strokeStyle = css(Math.min(1, bright * 1.18), id, mat);
    g.stroke();
    if (L > 26 && !o.lobes) {
      g.lineWidth = Math.max(0.5, L * 0.012);
      for (let k = 1; k <= 4; k++) {
        const yy = L * (0.12 + k * 0.17);
        const ww = hw * 0.75 * Math.sin((k / 5) * Math.PI);
        g.beginPath();
        g.moveTo(0, yy);
        g.lineTo(ww, yy + L * 0.08);
        g.moveTo(0, yy);
        g.lineTo(-ww, yy + L * 0.08);
        g.stroke();
      }
    }
  }
  g.restore();
}

/** twig / branchlet line (wood: G 0 → coloured as bark, never dissolved) */
function twig(g: CanvasRenderingContext2D, pts: [number, number][], w0: number, w1: number, bright = 0.42): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const f = i / Math.max(1, pts.length - 2);
    g.beginPath();
    g.moveTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[i + 1][0], pts[i + 1][1]);
    g.lineWidth = w0 + (w1 - w0) * f;
    g.lineCap = 'round';
    g.strokeStyle = css(bright * (0.9 + 0.2 * f), 0, 0);
    g.stroke();
  }
}

/** points along a gently curved stem from (x0,y0) heading `a` for length L */
function stem(x0: number, y0: number, a: number, L: number, curve: number, n = 6): [number, number][] {
  const pts: [number, number][] = [];
  let x = x0,
    y = y0,
    ang = a;
  pts.push([x, y]);
  for (let i = 0; i < n; i++) {
    ang += curve / n;
    x += Math.sin(ang) * (L / n);
    y += Math.cos(ang) * (L / n);
    pts.push([x, y]);
  }
  return pts;
}

function along(pts: [number, number][], f: number): { x: number; y: number; a: number } {
  const n = pts.length - 1;
  const t = Math.min(n - 1e-6, Math.max(0, f * n));
  const i = Math.floor(t),
    u = t - i;
  const [x0, y0] = pts[i],
    [x1, y1] = pts[i + 1];
  return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, a: Math.atan2(x1 - x0, y1 - y0) };
}

/**
 * Generic broadleaf cluster: a forked twig with alternate leaves, back leaves darker, front lighter.
 * `n` leaves of length L (px) ± 25 %.
 */
function broadCluster(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number, n: number, L: number, o: LeafOpts, spread = 1, brightLo = 0.5, brightHi = 0.95): void {
  const main = stem(rng.range(-6, 6), 0, rng.range(-0.15, 0.15), h * 0.62, rng.range(-0.4, 0.4));
  const forks = [main];
  const nf = 2 + rng.int(0, 1);
  for (let i = 0; i < nf; i++) {
    const p = along(main, rng.range(0.25, 0.6));
    const side = i % 2 ? 1 : -1;
    forks.push(stem(p.x, p.y, p.a + side * rng.range(0.5, 0.95) * spread, h * rng.range(0.32, 0.46), side * rng.range(0.1, 0.5)));
  }
  // leaves: collect then draw back-to-front (darker first)
  const leaves: { x: number; y: number; a: number; L: number; b: number }[] = [];
  for (let k = 0; k < n; k++) {
    const st = forks[k % forks.length];
    const f = rng.range(0.15, 1.0);
    const p = along(st, f);
    const side = rng.chance(0.5) ? 1 : -1;
    const a = p.a + side * rng.range(0.45, 1.25) * spread + rng.range(-0.15, 0.15);
    const len = L * rng.range(0.75, 1.2) * (0.8 + 0.3 * f);
    leaves.push({ x: p.x, y: p.y, a, L: len, b: rng.range(brightLo, brightHi) });
  }
  // terminal leaves on each fork tip
  for (const st of forks) {
    const p = along(st, 1);
    leaves.push({ x: p.x, y: p.y, a: p.a + rng.range(-0.2, 0.2), L: L * rng.range(0.9, 1.15), b: rng.range(brightLo, brightHi) });
  }
  leaves.sort((a, b) => a.b - b.b);
  const nTw = Math.floor(leaves.length * 0.45);
  // twigs between the back and the front leaves
  for (let i = 0; i < leaves.length; i++) {
    if (i === nTw) for (const st of forks) twig(g, st, st === main ? 5 : 3, 1.2);
    const lf = leaves[i];
    // keep inside the tile
    const tipx = lf.x + Math.sin(lf.a) * lf.L,
      tipy = lf.y + Math.cos(lf.a) * lf.L;
    if (Math.abs(tipx) > w / 2 - 4 || tipy > h - 2 || tipy < 4) {
      const sc = 0.6;
      leaf(g, lf.x, lf.y, lf.a, lf.L * sc, lf.b, lid(rng), o);
      continue;
    }
    leaf(g, lf.x, lf.y, lf.a, lf.L, lf.b, lid(rng), o);
  }
}

/** dense clump (inner / far cards): leaves scattered over an irregular blob, with a short twig */
function denseClump(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number, n: number, L: number, o: LeafOpts): void {
  const cx = 0,
    cy = h * 0.5;
  twig(g, stem(0, 0, rng.range(-0.1, 0.1), h * 0.45, 0.3), 6, 2);
  const leaves: { x: number; y: number; a: number; L: number; b: number }[] = [];
  for (let k = 0; k < n; k++) {
    // lumpy blob radius
    const ang = rng.range(0, Math.PI * 2);
    const R = (w * 0.42) * (0.82 + 0.18 * Math.sin(ang * 3 + 1.3) + 0.08 * Math.sin(ang * 7)) * Math.sqrt(rng.next());
    const x = cx + Math.sin(ang) * R,
      y = cy + Math.cos(ang) * R * (h / w);
    const out = Math.atan2(x - cx, y - cy * 0.6);
    const b = 0.45 + 0.5 * (1 - R / (w * 0.42)) * 0.3 + rng.range(0, 0.45);
    leaves.push({ x, y, a: out + rng.range(-0.9, 0.9), L: L * rng.range(0.75, 1.2), b });
  }
  leaves.sort((a, b) => a.b - b.b);
  for (const lf of leaves) leaf(g, lf.x, lf.y, lf.a, lf.L, lf.b, lid(rng), o);
}

/** needle: a short straight line (conifer) */
function needle(g: CanvasRenderingContext2D, x: number, y: number, a: number, L: number, bright: number, id: number, width = 1.6): void {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.sin(a) * L, y + Math.cos(a) * L);
  g.lineWidth = width;
  g.lineCap = 'round';
  g.strokeStyle = css(bright, id, 0);
  g.stroke();
}

/** spruce / fir branchlet: flat spray, main axis with alternate side shoots, dense short needles */
function needleSpray(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number, dense: boolean): void {
  const main = stem(0, 0, rng.range(-0.08, 0.08), h * 0.95, rng.range(-0.2, 0.2), 10);
  const shoots: [number, number][][] = [main];
  const ns = dense ? 14 : 10;
  for (let i = 0; i < ns; i++) {
    const f = 0.12 + (i / ns) * 0.8;
    const p = along(main, f);
    const side = i % 2 ? 1 : -1;
    const L = h * (0.42 - 0.3 * f) * rng.range(0.85, 1.15) * (dense ? 1.15 : 1);
    const sh = stem(p.x, p.y, p.a + side * rng.range(0.75, 1.05), L, side * rng.range(-0.25, 0.1), 5);
    shoots.push(sh);
    // tertiary shoots on long shoots
    if (L > h * 0.22) {
      for (let j = 0; j < 2; j++) {
        const q = along(sh, 0.35 + j * 0.3);
        shoots.push(stem(q.x, q.y, q.a + (j % 2 ? 1 : -1) * 0.8, L * 0.35, 0, 3));
      }
    }
  }
  for (const st of shoots) twig(g, st, st === main ? 4 : 2, 1, 0.38);
  // needles: radiating from every shoot, a bit forward-pointing; front ones brighter, tips fresh
  for (const st of shoots) {
    const len = Math.hypot(st[st.length - 1][0] - st[0][0], st[st.length - 1][1] - st[0][1]);
    const nn = Math.round(len / (dense ? 2.2 : 2.8));
    for (let k = 0; k < nn; k++) {
      const f = k / nn;
      const p = along(st, f);
      for (const side of [-1, 1]) {
        const a = p.a + side * rng.range(0.55, 1.0);
        const L = rng.range(9, 14) * (1 - 0.25 * f);
        const b = rng.range(0.45, 0.85) + (f > 0.8 ? 0.15 : 0);
        needle(g, p.x, p.y, a, L, b, lid(rng), 1.7);
      }
    }
  }
}

/** pine: bundles of long needles fanning out of shoot tips */
function pineTufts(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  const main = stem(0, 0, rng.range(-0.1, 0.1), h * 0.55, rng.range(-0.3, 0.3), 6);
  const shoots: [number, number][][] = [main];
  for (let i = 0; i < 3; i++) {
    const p = along(main, 0.35 + i * 0.22);
    shoots.push(stem(p.x, p.y, p.a + (i % 2 ? 1 : -1) * rng.range(0.6, 0.9), h * rng.range(0.25, 0.35), 0, 4));
  }
  for (const st of shoots) twig(g, st, st === main ? 5 : 3, 2, 0.45);
  for (const st of shoots) {
    // tuft on the last 45 % of each shoot + the tip
    for (let k = 0; k < 40; k++) {
      const f = rng.range(0.55, 1);
      const p = along(st, f);
      const a = p.a + rng.range(-1.35, 1.35) * (0.6 + 0.4 * f);
      needle(g, p.x, p.y, a, rng.range(26, 46), rng.range(0.42, 0.9), lid(rng), 1.6);
    }
  }
}

/** cypress: dense flattened scale-leaf sprays (fern-like fans), dark */
function cypressSpray(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  const fans = 7;
  for (let i = 0; i < fans; i++) {
    const a = rng.range(-0.75, 0.75);
    const L = h * rng.range(0.55, 0.9);
    const st = stem(rng.range(-14, 14), rng.range(0, 30), a, L, rng.range(-0.3, 0.3), 7);
    twig(g, st, 2.5, 1, 0.36);
    for (let k = 0; k < 24; k++) {
      const f = k / 24;
      const p = along(st, f);
      for (const side of [-1, 1]) {
        const sa = p.a + side * rng.range(0.4, 0.8);
        const sl = (1 - f * 0.6) * rng.range(12, 22);
        const bb = rng.range(0.4, 0.8);
        const id = lid(rng);
        // a sub-spray: short stem with scale nubs
        g.beginPath();
        g.moveTo(p.x, p.y);
        const ex = p.x + Math.sin(sa) * sl,
          ey = p.y + Math.cos(sa) * sl;
        g.lineTo(ex, ey);
        g.lineWidth = 4.2 * (1 - f * 0.4);
        g.lineCap = 'round';
        g.strokeStyle = css(bb, id, 0);
        g.stroke();
      }
    }
  }
}

/** pinnate palm frond along the region's height: rachis + paired leaflets (V-keeled, drooping tips) */
function palmFrond(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number, dry = false): void {
  const rach = stem(0, 0, 0, h * 0.98, rng.range(-0.08, 0.08), 16);
  const n = dry ? 46 : 64;
  const leaflets: { x: number; y: number; a: number; L: number; b: number; side: number }[] = [];
  for (let k = 0; k < n; k++) {
    const f = 0.06 + (k / n) * 0.92;
    const p = along(rach, f);
    for (const side of [-1, 1]) {
      const L = w * 0.47 * Math.sin(Math.min(1, f * 1.25) * Math.PI * 0.82 + 0.3) * rng.range(0.85, 1.05) * (dry ? 0.85 : 1);
      const a = p.a + side * (dry ? rng.range(0.25, 0.6) : rng.range(0.5, 0.75) - f * 0.15);
      leaflets.push({ x: p.x, y: p.y, a, L, b: rng.range(0.5, 0.9), side });
    }
  }
  leaflets.sort((a, b) => a.b - b.b);
  for (const lf of leaflets) {
    leaf(g, lf.x, lf.y, lf.a, lf.L, lf.b, dry ? lid(rng) * 0.5 + 0.5 : lid(rng), { w: 0.075, wide: 0.35, base: 0.2, tip: 1, rib: true, fold: 0.35 });
  }
  twig(g, rach, 9, 2, dry ? 0.5 : 0.55);
}

/** fan palm leaf (Washingtonia): petiole + a pleated fan of segments with split, drooping tips */
function fanLeaf(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  const cx = 0,
    cy = h * 0.32;
  twig(g, [
    [0, 0],
    [0, cy],
  ], 7, 5, 0.5);
  const n = 38;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const a = (f - 0.5) * 2.9 + rng.range(-0.03, 0.03);
    const L = h * 0.62 * (0.82 + 0.18 * Math.cos((f - 0.5) * 2.6)) * rng.range(0.92, 1.05);
    const b = 0.55 + 0.35 * (k % 2 ? 1 : 0.55) * rng.range(0.85, 1.1);
    leaf(g, cx, cy, a, L, b, lid(rng), { w: 0.07, wide: 0.55, base: 0.2, tip: 0.4, rib: false, fold: 0.45 });
    // split, drooping tips
    if (rng.chance(0.75)) {
      const ex = cx + Math.sin(a) * L * 0.92,
        ey = cy + Math.cos(a) * L * 0.92;
      needle(g, ex, ey, a + rng.range(-0.5, 0.5), rng.range(10, 22), b * 0.85, lid(rng), 1.4);
    }
  }
}

/** blossom: twigs crowded with 5-petal flowers (B = 1) and a few young leaves */
function blossom(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  const main = stem(0, 0, rng.range(-0.15, 0.15), h * 0.7, rng.range(-0.4, 0.4), 6);
  const forks = [main];
  for (let i = 0; i < 3; i++) {
    const p = along(main, 0.25 + i * 0.2);
    forks.push(stem(p.x, p.y, p.a + (i % 2 ? 1 : -1) * rng.range(0.5, 0.9), h * rng.range(0.3, 0.42), 0, 4));
  }
  for (const st of forks) twig(g, st, st === main ? 5 : 3, 1.2, 0.3);
  for (let k = 0; k < 10; k++) {
    const st = forks[k % forks.length];
    const p = along(st, rng.range(0.3, 1));
    leaf(g, p.x, p.y, p.a + rng.range(-1.2, 1.2), rng.range(18, 26), rng.range(0.45, 0.8), lid(rng), { w: 0.3, tip: 0.8 });
  }
  for (let k = 0; k < 70; k++) {
    const st = forks[k % forks.length];
    const p = along(st, rng.range(0.15, 1));
    const ox = p.x + rng.range(-18, 18),
      oy = p.y + rng.range(-14, 14);
    if (Math.abs(ox) > w / 2 - 12 || oy > h - 10) continue;
    flower(g, ox, oy, rng.range(6, 9.5), rng.range(0.6, 1), lid(rng), rng.range(0, 6.28), 5);
  }
}

function flower(g: CanvasRenderingContext2D, x: number, y: number, r: number, bright: number, id: number, rot: number, petals: number): void {
  for (let i = 0; i < petals; i++) {
    const a = rot + (i / petals) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.42, a, 0, Math.PI * 2);
    g.fillStyle = css(bright * (0.85 + 0.15 * Math.cos(a * 2)), id, 1);
    g.fill();
  }
  g.beginPath();
  g.arc(x, y, r * 0.22, 0, Math.PI * 2);
  g.fillStyle = css(bright * 0.55, id, 1);
  g.fill();
}

/** jacaranda: bipinnate feathery leaves + upright violet panicles */
function jacaranda(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  const main = stem(0, 0, rng.range(-0.1, 0.1), h * 0.6, rng.range(-0.3, 0.3), 6);
  twig(g, main, 4, 1.5, 0.35);
  // feathery fronds
  for (let i = 0; i < 6; i++) {
    const p = along(main, 0.2 + i * 0.14);
    const a = p.a + (i % 2 ? 1 : -1) * rng.range(0.4, 1.0);
    const rach = stem(p.x, p.y, a, h * rng.range(0.3, 0.42), rng.range(-0.3, 0.3), 6);
    for (let k = 0; k < 9; k++) {
      const q = along(rach, 0.1 + k * 0.1);
      for (const side of [-1, 1]) {
        const pa = q.a + side * 1.0;
        const pin = stem(q.x, q.y, pa, rng.range(14, 22), 0, 3);
        for (let m = 0; m < 6; m++) {
          const r = along(pin, m / 6);
          for (const s2 of [-1, 1]) leaf(g, r.x, r.y, r.a + s2 * 1.2, rng.range(4.5, 6.5), rng.range(0.45, 0.85), lid(rng), { w: 0.32, rib: false, fold: 0.1 });
        }
      }
    }
  }
  // panicles: cones of small trumpet flowers
  for (let i = 0; i < 4; i++) {
    const p = along(main, 0.55 + i * 0.13);
    const a = p.a + rng.range(-0.8, 0.8);
    const L = h * rng.range(0.22, 0.32);
    for (let k = 0; k < 26; k++) {
      const f = rng.next();
      const spread = (1 - f) * L * 0.35;
      const x = p.x + Math.sin(a) * L * f + rng.range(-spread, spread),
        y = p.y + Math.cos(a) * L * f + rng.range(-spread * 0.5, spread * 0.5);
      flower(g, x, y, rng.range(5, 7.5), rng.range(0.55, 1), lid(rng), rng.range(0, 6.28), 5);
    }
  }
}

/** olive: thin twigs with narrow lanceolate leaves in opposite pairs; upper side dark, underside silvery */
function olive(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  const forks: [number, number][][] = [];
  for (let i = 0; i < 6; i++) forks.push(stem(rng.range(-14, 14), 0, rng.range(-0.8, 0.8), h * rng.range(0.55, 0.9), rng.range(-0.5, 0.5), 7));
  const leaves: { x: number; y: number; a: number; L: number; b: number }[] = [];
  for (const st of forks) {
    for (let k = 0; k < 11; k++) {
      const p = along(st, 0.1 + k * 0.085);
      for (const side of [-1, 1]) {
        // silvery underside shows on ~40 % of the leaves (brightness up)
        const silver = rng.chance(0.4);
        leaves.push({ x: p.x, y: p.y, a: p.a + side * rng.range(0.35, 0.7), L: rng.range(22, 32), b: silver ? rng.range(0.82, 1.0) : rng.range(0.42, 0.66) });
      }
    }
  }
  leaves.sort((a, b) => a.b - b.b);
  const half = Math.floor(leaves.length / 2);
  leaves.forEach((lf, i) => {
    if (i === half) for (const st of forks) twig(g, st, 2.4, 1, 0.48);
    leaf(g, lf.x, lf.y, lf.a, lf.L, lf.b, lid(rng), { w: 0.12, wide: 0.45, base: 0.3, tip: 0.5, rib: true, fold: 0.15 });
  });
}

/** birch: fine pendulous twigs with small triangular-ovate leaves, airy */
function birchSpray(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  for (let i = 0; i < 6; i++) {
    const st = stem(rng.range(-20, 20), rng.range(0, 40), rng.range(-0.9, 0.9), h * rng.range(0.5, 0.85), rng.range(-0.8, 0.8), 7);
    twig(g, st, 1.8, 0.8, 0.3);
    for (let k = 0; k < 8; k++) {
      const p = along(st, 0.15 + k * 0.11);
      leaf(g, p.x, p.y, p.a + (k % 2 ? 1 : -1) * rng.range(0.5, 1.2), rng.range(17, 24), rng.range(0.5, 0.95), lid(rng), { w: 0.38, wide: 0.3, base: 1.0, tip: 0.85 });
    }
  }
}

/** willow: long narrow leaves along hanging strands (strands run up the tile; cards hang them down) */
function willowStrands(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  for (let i = 0; i < 9; i++) {
    const st = stem(rng.range(-w * 0.35, w * 0.35), 0, rng.range(-0.12, 0.12), h * rng.range(0.75, 0.98), rng.range(-0.15, 0.15), 8);
    twig(g, st, 1.4, 0.8, 0.45);
    for (let k = 0; k < 22; k++) {
      const p = along(st, k / 22);
      leaf(g, p.x, p.y, p.a + (k % 2 ? 1 : -1) * rng.range(0.25, 0.5), rng.range(16, 24), rng.range(0.5, 0.95), lid(rng), { w: 0.13, wide: 0.4, base: 0.3, tip: 0.8, rib: false });
    }
  }
}

/** oleander: whorls of narrow leaves + clusters of pink/white flowers on top */
function oleander(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  const stems = [0, 1, 2].map(() => stem(rng.range(-18, 18), 0, rng.range(-0.5, 0.5), h * rng.range(0.6, 0.8), rng.range(-0.3, 0.3), 6));
  for (const st of stems) {
    twig(g, st, 2.5, 1.2, 0.4);
    for (let k = 0; k < 5; k++) {
      const p = along(st, 0.2 + k * 0.16);
      for (let j = 0; j < 3; j++) leaf(g, p.x, p.y, p.a + (j - 1) * 0.9 + rng.range(-0.2, 0.2), rng.range(36, 50), rng.range(0.45, 0.85), lid(rng), { w: 0.1, wide: 0.5, base: 0.3, tip: 0.6 });
    }
    const top = along(st, 1);
    for (let k = 0; k < 9; k++) flower(g, top.x + rng.range(-16, 16), top.y + rng.range(-8, 14), rng.range(7, 10), rng.range(0.65, 1), lid(rng), rng.range(0, 6.28), 5);
  }
}

/** bougainvillea: papery bract clusters (flower mask) over small heart-shaped leaves */
function bougainvillea(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  broadCluster(g, rng, w, h, 18, 22, { w: 0.42, base: 1.2, tip: 0.6 }, 1.1, 0.45, 0.8);
  for (let k = 0; k < 34; k++) {
    const x = rng.range(-w * 0.38, w * 0.38),
      y = rng.range(h * 0.3, h * 0.95);
    for (let j = 0; j < 3; j++) {
      const a = rng.range(0, 6.28);
      leaf(g, x, y, a, rng.range(11, 16), rng.range(0.6, 1), lid(rng), { w: 0.5, base: 1.1, tip: 0.3, rib: false }, 1);
    }
  }
}

/** citrus: dense glossy dark elliptic leaves + a few oranges/lemons (B = 1, round) */
function citrus(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  broadCluster(g, rng, w, h, 30, 34, { w: 0.24, wide: 0.45, base: 0.5, tip: 0.5 }, 1.0, 0.42, 0.9);
  for (let k = 0; k < 3; k++) {
    const x = rng.range(-w * 0.25, w * 0.25),
      y = rng.range(h * 0.35, h * 0.8);
    const r = rng.range(11, 14);
    const gr = g.createRadialGradient(x - r * 0.3, y + r * 0.3, r * 0.2, x, y, r);
    const id = lid(rng);
    gr.addColorStop(0, css(1, id, 1));
    gr.addColorStop(1, css(0.6, id, 1));
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = gr;
    g.fill();
  }
}

const PAINT: Record<LeafTile, Painter> = {
  broad: (g, s, w, h) => broadCluster(g, new Rng(s), w, h, 46, 27, { w: 0.36, wide: 0.38, base: 1.1, tip: 0.85 }),
  broadDense: (g, s, w, h) => denseClump(g, new Rng(s), w, h, 210, 22, { w: 0.36, wide: 0.38, base: 1.1, tip: 0.8 }),
  plane: (g, s, w, h) => broadCluster(g, new Rng(s), w, h, 22, 42, { w: 0.5, lobes: 5, fold: 0.18 }, 1.15, 0.5, 0.95),
  oak: (g, s, w, h) => broadCluster(g, new Rng(s), w, h, 42, 27, { w: 0.3, lobes: 7, fold: 0.15 }, 1.0, 0.45, 0.9),
  small: (g, s, w, h) => broadCluster(g, new Rng(s), w, h, 74, 18, { w: 0.3, wide: 0.45, base: 0.5, tip: 0.35 }, 1.05, 0.42, 0.92),
  smallDense: (g, s, w, h) => denseClump(g, new Rng(s), w, h, 320, 15, { w: 0.3, wide: 0.45, base: 0.5, tip: 0.35, rib: false }),
  olive: (g, s, w, h) => olive(g, new Rng(s), w, h),
  birch: (g, s, w, h) => birchSpray(g, new Rng(s), w, h),
  jacaranda: (g, s, w, h) => jacaranda(g, new Rng(s), w, h),
  blossom: (g, s, w, h) => blossom(g, new Rng(s), w, h),
  needle: (g, s, w, h) => needleSpray(g, new Rng(s), w, h, false),
  needleDense: (g, s, w, h) => needleSpray(g, new Rng(s), w, h, true),
  pine: (g, s, w, h) => pineTufts(g, new Rng(s), w, h),
  cypress: (g, s, w, h) => cypressSpray(g, new Rng(s), w, h),
  shrub: (g, s, w, h) => denseClump(g, new Rng(s), w, h, 240, 14, { w: 0.34, wide: 0.45, base: 0.6, tip: 0.4, rib: false }),
  oleander: (g, s, w, h) => oleander(g, new Rng(s), w, h),
  willow: (g, s, w, h) => willowStrands(g, new Rng(s), w, h),
  citrus: (g, s, w, h) => citrus(g, new Rng(s), w, h),
  bougain: (g, s, w, h) => bougainvillea(g, new Rng(s), w, h),
  fan: (g, s, w, h) => fanLeaf(g, new Rng(s), w, h),
  frond: (g, s, w, h) => palmFrond(g, new Rng(s), w, h),
  dryFrond: (g, s, w, h) => palmFrond(g, new Rng(s), w * 1, h * 1, true),
};

// ──────────────────────────────────────────────────────────────────── mips ──

interface Level {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * First reduction straight from the canvas bytes: premultiplied level-1 floats of a region, and the
 * region's coverage at the 0.5 threshold (counted on the full-size texels).
 */
function regionLevel1(src: Uint8ClampedArray, x0: number, y0: number, W: number, H: number, out: Float32Array): number {
  let covered = 0;
  const nw = W >> 1,
    nh = H >> 1;
  const row = ATLAS_W * 4;
  for (let y = 0; y < nh; y++) {
    let si = ((y0 + y * 2) * ATLAS_W + x0) * 4;
    let o = y * nw * 4;
    for (let x = 0; x < nw; x++) {
      const a0 = src[si + 3],
        a1 = src[si + 7],
        a2 = src[si + row + 3],
        a3 = src[si + row + 7];
      covered += (a0 > 127 ? 1 : 0) + (a1 > 127 ? 1 : 0) + (a2 > 127 ? 1 : 0) + (a3 > 127 ? 1 : 0);
      for (let k = 0; k < 3; k++) out[o + k] = (src[si + k] * a0 + src[si + 4 + k] * a1 + src[si + row + k] * a2 + src[si + row + 4 + k] * a3) * (0.25 / 65025);
      out[o + 3] = (a0 + a1 + a2 + a3) * (0.25 / 255);
      si += 8;
      o += 4;
    }
  }
  return covered / (W * H);
}

/** level 0 = the canvas bytes; transparent texels take the level-1 colour (push-pull) */
function writeLevel0(src: Uint8ClampedArray, L: Level, x0: number, y0: number, W: number, H: number, C1: Float32Array): void {
  const d = L.data;
  const nw = W >> 1;
  for (let y = 0; y < H; y++) {
    let i = ((y0 + y) * ATLAS_W + x0) * 4;
    for (let x = 0; x < W; x++) {
      if (src[i + 3] > 5) {
        d[i] = src[i];
        d[i + 1] = src[i + 1];
        d[i + 2] = src[i + 2];
      } else {
        const j = ((y >> 1) * nw + (x >> 1)) * 3;
        d[i] = C1[j] * 255 + 0.5;
        d[i + 1] = C1[j + 1] * 255 + 0.5;
        d[i + 2] = C1[j + 2] * 255 + 0.5;
      }
      d[i + 3] = src[i + 3];
      i += 4;
    }
  }
}

/** 2x2 box reduction of a premultiplied rgba float image (even sizes) */
function reduce2(cur: Float32Array, cw: number, ch: number): Float32Array {
  const nw = cw >> 1,
    nh = ch >> 1;
  const nx = new Float32Array(nw * nh * 4);
  const row4 = cw * 4;
  for (let y = 0; y < nh; y++) {
    let a = y * 2 * row4;
    let o = y * nw * 4;
    for (let x = 0; x < nw; x++) {
      for (let k = 0; k < 4; k++) nx[o + k] = (cur[a + k] + cur[a + 4 + k] + cur[a + row4 + k] + cur[a + row4 + 4 + k]) * 0.25;
      a += 8;
      o += 4;
    }
  }
  return nx;
}

/** un-premultiplied colour of a level; transparent texels take the parent level's colour (push-pull) */
function pullColour(p: Float32Array, lw: number, lh: number, C: Float32Array, P: Float32Array | null, pw: number): void {
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const i = y * lw + x;
      const a = p[i * 4 + 3];
      if (a > 0.02 || P === null) {
        const ia = a > 1e-5 ? 1 / a : 0;
        C[i * 3] = p[i * 4] * ia;
        C[i * 3 + 1] = p[i * 4 + 1] * ia;
        C[i * 3 + 2] = p[i * 4 + 2] * ia;
      } else {
        const j = ((y >> 1) * pw + (x >> 1)) * 3;
        C[i * 3] = P[j];
        C[i * 3 + 1] = P[j + 1];
        C[i * 3 + 2] = P[j + 2];
      }
    }
  }
}

/** alpha scale s so that coverage(a·s > 0.5) ≈ cov (histogram of alpha, 256 bins) */
function coverageScale(p: Float32Array, n: number, cov: number, hist: Uint32Array): number {
  hist.fill(0);
  for (let i = 0; i < n; i++) {
    const b = (p[i * 4 + 3] * 255) | 0;
    hist[b > 255 ? 255 : b]++;
  }
  const want = cov * n;
  let acc = 0,
    t = 255;
  for (; t > 0; t--) {
    if (acc + hist[t] > want) break;
    acc += hist[t];
  }
  return Math.min(6, Math.max(0.5, 0.5 / Math.max(1 / 255, (t + 1) / 255)));
}

function writeLevel(L: Level, ox: number, oy: number, lw: number, lh: number, p: Float32Array, C: Float32Array, s: number): void {
  const d = L.data;
  for (let y = 0; y < lh; y++) {
    let di = ((oy + y) * L.width + ox) * 4;
    let i = y * lw;
    for (let x = 0; x < lw; x++) {
      const r = C[i * 3] * 255 + 0.5,
        g = C[i * 3 + 1] * 255 + 0.5,
        b = C[i * 3 + 2] * 255 + 0.5,
        a = p[i * 4 + 3] * s * 255 + 0.5;
      d[di] = r > 255 ? 255 : r;
      d[di + 1] = g > 255 ? 255 : g;
      d[di + 2] = b > 255 ? 255 : b;
      d[di + 3] = a > 255 ? 255 : a;
      di += 4;
      i++;
    }
  }
}

/**
 * Mip chain per region (no bleeding between regions) with colour push-pull into transparent texels and
 * coverage-preserving alpha; levels below one texel per tile are plain averages of the atlas.
 * (Regions are power-of-two sized, so every 2x2 reduction is exact. Small hot helpers so V8 optimises
 * them after the first region — one big function stayed in slow on-stack-replaced code.)
 */
function buildMips(src: Uint8ClampedArray): { levels: Level[]; cover: Map<LeafTile, number> } {
  const nLevels = Math.floor(Math.log2(Math.max(ATLAS_W, ATLAS_H))) + 1;
  const levels: Level[] = [];
  for (let l = 0; l < nLevels; l++) {
    const w = Math.max(1, ATLAS_W >> l),
      h = Math.max(1, ATLAS_H >> l);
    levels.push({ data: new Uint8Array(w * h * 4), width: w, height: h });
  }
  const cover = new Map<LeafTile, number>();
  const tileLevels = Math.log2(T); // 8 → levels 0..8 (256 → 1 px per tile)
  const hist = new Uint32Array(256);
  for (const [name, r] of Object.entries(REGIONS)) {
    const [c, row, rw, rh] = r;
    const W = rw * T,
      H = rh * T;
    // pyramid index 0 = level 1 (level 0 stays the canvas bytes)
    const pyr: Float32Array[] = [new Float32Array((W >> 1) * (H >> 1) * 4)];
    const dw: number[] = [W >> 1],
      dh: number[] = [H >> 1];
    const cov = regionLevel1(src, c * T, row * T, W, H, pyr[0]);
    cover.set(name as LeafTile, cov);
    while (dw[dw.length - 1] > 1 && dh[dh.length - 1] > 1) {
      const l = pyr.length - 1;
      pyr.push(reduce2(pyr[l], dw[l], dh[l]));
      dw.push(dw[l] >> 1);
      dh.push(dh[l] >> 1);
    }
    const colr: Float32Array[] = pyr.map((p) => new Float32Array((p.length / 4) * 3));
    for (let l = pyr.length - 1; l >= 0; l--) {
      const top = l + 1 >= pyr.length;
      pullColour(pyr[l], dw[l], dh[l], colr[l], top ? null : colr[l + 1], top ? 1 : dw[l + 1]);
    }
    writeLevel0(src, levels[0], c * T, row * T, W, H, colr[0]);
    for (let q = 0; q < pyr.length && q + 1 <= tileLevels; q++) {
      const l = q + 1;
      const n = dw[q] * dh[q];
      const s = cov > 0.001 ? coverageScale(pyr[q], n, cov, hist) : 1;
      writeLevel(levels[l], (c * T) >> l, (row * T) >> l, dw[q], dh[q], pyr[q], colr[q], s);
    }
  }
  // atlas levels below one texel per tile: plain 2x2 averages of the previous level
  for (let l = tileLevels + 1; l < nLevels; l++) {
    const P = levels[l - 1],
      L = levels[l];
    for (let y = 0; y < L.height; y++) {
      for (let x = 0; x < L.width; x++) {
        for (let k = 0; k < 4; k++) {
          const x0 = Math.min(P.width - 1, x * 2),
            x1 = Math.min(P.width - 1, x * 2 + 1),
            y0 = Math.min(P.height - 1, y * 2),
            y1 = Math.min(P.height - 1, y * 2 + 1);
          L.data[(y * L.width + x) * 4 + k] = (P.data[(y0 * P.width + x0) * 4 + k] + P.data[(y0 * P.width + x1) * 4 + k] + P.data[(y1 * P.width + x0) * 4 + k] + P.data[(y1 * P.width + x1) * 4 + k]) >> 2;
        }
      }
    }
  }
  return { levels, cover };
}
