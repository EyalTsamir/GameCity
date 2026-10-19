// Building greenery: balcony and window-box plants, trailing / hanging curtains (ivy, bougainvillea,
// pothos, petunias), potted shrubs / palms / herbs / succulents, ivy patches on walls.
//
// One merged mesh of alpha-tested leaf cards (`buildings-green`, one draw call + its shadow pass)
// textured from a procedural canvas leaf atlas painted at start-up (no assets). Cards sway with the
// shared wind (core/wind.ts): hanging curtains swing from their attachment line, clumps nod at the top,
// wall ivy only flutters. Alpha is rescaled by the mip level (keeps coverage when cards are small, so
// plants don't thin out with distance) and street lamps light the leaves at night (lampLight).
//
// Generators emit cards in the lot's LOCAL frame through GreenKit (same frame as the other builders).
// Vertex attribute aX = (sway weight 0..1, phase, sway amplitude in m per unit of wind, 0).

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { WIND_GLSL } from '../../core/wind';
import { Rng } from '../../core/rng';
import type { Builder } from './mesh';
import { SideGeom, sx, sz } from './gen';

/** Atlas cells. HANG_* are tall (1:2) curtains attached at their top edge; the others are square. */
export const GREEN = {
  IVY_HANG: 0,
  BOUGAIN: 1,
  POTHOS: 2,
  PETUNIA: 3,
  GERANIUM: 4,
  SHRUB: 5,
  PALM: 6,
  GRASS: 7,
  IVY_WALL: 8,
  JASMINE: 9,
  LAVENDER: 10,
  SUCCULENT: 11,
} as const;

const N = 1024;
// canvas pixel rects [x, y, w, h]
const CELLS: [number, number, number, number][] = [
  [0, 0, 256, 512],
  [256, 0, 256, 512],
  [512, 0, 256, 512],
  [768, 0, 256, 512],
  [0, 512, 256, 256],
  [256, 512, 256, 256],
  [512, 512, 256, 256],
  [768, 512, 256, 256],
  [0, 768, 256, 256],
  [256, 768, 256, 256],
  [512, 768, 256, 256],
  [768, 768, 256, 256],
];

/** uv rect of a cell: [u0, vBottom, u1, vTop] (three's CanvasTexture flips y) */
function cellUV(c: number): [number, number, number, number] {
  const [x, y, w, h] = CELLS[c];
  const p = 1.5;
  return [(x + p) / N, 1 - (y + h - p) / N, (x + w - p) / N, 1 - (y + p) / N];
}

// ───────────────────────────────────────────────────────────── atlas ──

type Ctx = CanvasRenderingContext2D;

function rgb(hex: string, k = 1, jr = 0, rng?: Rng): string {
  const c = new THREE.Color(hex);
  let r = c.r,
    g = c.g,
    b = c.b;
  // canvas colours are sRGB: THREE.Color stores linear → convert back
  r = Math.pow(r, 1 / 2.2);
  g = Math.pow(g, 1 / 2.2);
  b = Math.pow(b, 1 / 2.2);
  const j = rng ? 1 + (rng.next() - 0.5) * jr : 1;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k * j * 255)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** almond leaf from (0,0) pointing along +y (canvas down) after rotation by `ang` */
function leaf(c: Ctx, x: number, y: number, len: number, wid: number, ang: number, fill: string, rib?: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(wid, len * 0.38, 0, len);
  c.quadraticCurveTo(-wid, len * 0.38, 0, 0);
  c.fillStyle = fill;
  c.fill();
  if (rib) {
    c.strokeStyle = rib;
    c.lineWidth = Math.max(0.7, wid * 0.13);
    c.beginPath();
    c.moveTo(0, len * 0.06);
    c.lineTo(0, len * 0.82);
    c.stroke();
  }
  c.restore();
}

/** heart leaf (pothos / ivy-ish): two lobes at the stem end */
function heart(c: Ctx, x: number, y: number, s: number, ang: number, fill: string, rib?: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(s * 0.55, -s * 0.35, s * 0.75, s * 0.45, 0, s);
  c.bezierCurveTo(-s * 0.75, s * 0.45, -s * 0.55, -s * 0.35, 0, 0);
  c.fillStyle = fill;
  c.fill();
  if (rib) {
    c.strokeStyle = rib;
    c.lineWidth = Math.max(0.7, s * 0.06);
    c.beginPath();
    c.moveTo(0, s * 0.05);
    c.lineTo(0, s * 0.85);
    c.stroke();
  }
  c.restore();
}

/** ivy leaf: three-lobed */
function ivyLeaf(c: Ctx, x: number, y: number, s: number, ang: number, fill: string, rib: string): void {
  leaf(c, x, y, s, s * 0.42, ang, fill);
  leaf(c, x, y, s * 0.75, s * 0.36, ang - 0.95, fill);
  leaf(c, x, y, s * 0.75, s * 0.36, ang + 0.95, fill);
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.strokeStyle = rib;
  c.lineWidth = Math.max(0.6, s * 0.06);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, s * 0.8);
  c.moveTo(0, s * 0.1);
  c.lineTo(-s * 0.45, s * 0.42);
  c.moveTo(0, s * 0.1);
  c.lineTo(s * 0.45, s * 0.42);
  c.stroke();
  c.restore();
}

function dot(c: Ctx, x: number, y: number, r: number, fill: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

const LEAF_GREENS = ['#3f5f2a', '#4b6d30', '#35532a', '#567935', '#2f4a26', '#5f7d3a'];

/** cascading vines from the top edge of a tall cell */
function paintVines(c: Ctx, rng: Rng, cx: number, cy: number, w: number, h: number, o: {
  vines: number;
  leaf: (x: number, y: number, s: number, ang: number, shade: number) => void;
  size: number;
  step: number;
  extra?: (x: number, y: number, t: number) => void;
  stem: string;
  topMass: number;
}): void {
  // top mass (where the plant spills over the rail / box edge)
  for (let i = 0; i < o.topMass; i++) {
    const x = cx + 8 + rng.next() * (w - 16);
    const y = cy + 4 + Math.pow(rng.next(), 1.6) * h * 0.16;
    o.leaf(x, y, o.size * rng.range(0.8, 1.15), rng.range(-1.2, 1.2) + (rng.chance(0.5) ? 0 : Math.PI), rng.range(0.62, 0.95));
  }
  for (let v = 0; v < o.vines; v++) {
    let x = cx + 10 + rng.next() * (w - 20);
    let y = cy + 6;
    const L = h * (0.25 + 0.72 * Math.pow(rng.next(), 0.7)) - 10;
    const ph = rng.next() * 6.28;
    const drift = (rng.next() - 0.5) * 0.5;
    c.strokeStyle = o.stem;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x, y);
    const pts: [number, number][] = [];
    for (let s = 0; s < L; s += 4) {
      x += Math.sin(s * 0.045 + ph) * 1.0 + drift;
      x = Math.max(cx + 6, Math.min(cx + w - 6, x));
      y += 4;
      c.lineTo(x, y);
      pts.push([x, y]);
    }
    c.stroke();
    let side = 1;
    for (let k = 0; k < pts.length; k += Math.max(1, Math.round(o.step / 4))) {
      const t = k / pts.length;
      const [px, py] = pts[k];
      const sz = o.size * (1.0 - 0.45 * t) * rng.range(0.8, 1.15);
      side = -side;
      o.leaf(px, py, sz, side * rng.range(0.5, 1.3), rng.range(0.7, 1.12) * (1 - 0.15 * t));
      if (o.extra) o.extra(px + side * sz * 0.4, py + sz * 0.3, t);
    }
  }
}

function paintAtlas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, N, N);
  const rng = new Rng('tinyhaven:green-atlas');
  const cell = (i: number) => CELLS[i];

  // 0 ivy curtain (dark glossy, dense)
  {
    const [x, y, w, h] = cell(GREEN.IVY_HANG);
    paintVines(c, rng, x, y, w, h, {
      vines: 13,
      size: 17,
      step: 9,
      topMass: 70,
      stem: rgb('#4a4228', 1),
      leaf: (lx, ly, s, a, k) => ivyLeaf(c, lx, ly, s, a, rgb(rng.pick(['#2c4a22', '#35562a', '#3d5f2c', '#27421f']), k), rgb('#8fa070', k * 0.9)),
    });
  }
  // 1 bougainvillea (magenta bracts over green, thinning downward)
  {
    const [x, y, w, h] = cell(GREEN.BOUGAIN);
    const bract = ['#c2185b', '#d81b60', '#e0307a', '#ad1457', '#b0306e'];
    paintVines(c, rng, x, y, w, h, {
      vines: 10,
      size: 15,
      step: 10,
      topMass: 55,
      stem: rgb('#5a4a2a', 1),
      leaf: (lx, ly, s, a, k) => leaf(c, lx, ly, s, s * 0.45, a, rgb(rng.pick(LEAF_GREENS), k)),
      extra: (ex, ey, t) => {
        if (rng.next() > 0.85 - 0.5 * (1 - t)) return;
        const col = rng.pick(bract);
        for (let q = 0; q < 3; q++) leaf(c, ex, ey, rng.range(8, 12), rng.range(4, 6), (q / 3) * 6.28 + rng.next(), rgb(col, rng.range(0.85, 1.12)));
      },
    });
    // dense bract clusters near the top
    for (let i = 0; i < 70; i++) {
      const bx = x + 10 + rng.next() * (w - 20),
        by = y + 8 + Math.pow(rng.next(), 2.2) * h * 0.55;
      const col = rng.pick(bract);
      for (let q = 0; q < 3; q++) leaf(c, bx, by, rng.range(8, 13), rng.range(4, 7), (q / 3) * 6.28 + rng.next(), rgb(col, rng.range(0.82, 1.15)));
    }
  }
  // 2 pothos (golden heart leaves)
  {
    const [x, y, w, h] = cell(GREEN.POTHOS);
    paintVines(c, rng, x, y, w, h, {
      vines: 7,
      size: 24,
      step: 13,
      topMass: 26,
      stem: rgb('#6a7a3a', 1),
      leaf: (lx, ly, s, a, k) => {
        heart(c, lx, ly, s, a, rgb(rng.pick(['#5d8a32', '#6f9a3a', '#7aa346', '#4f7a2c']), k), rgb('#c9d77a', k));
      },
    });
  }
  // 3 trailing petunias / surfinia (pink-purple trumpets on small leaves)
  {
    const [x, y, w, h] = cell(GREEN.PETUNIA);
    const fl = ['#d0408a', '#b03ab0', '#e05a9a', '#8e3ab8', '#f0e6f0', '#d8306a'];
    paintVines(c, rng, x, y, w, h, {
      vines: 11,
      size: 12,
      step: 8,
      topMass: 60,
      stem: rgb('#4f6a2a', 1),
      leaf: (lx, ly, s, a, k) => leaf(c, lx, ly, s, s * 0.5, a, rgb(rng.pick(LEAF_GREENS), k * 1.05)),
      extra: (ex, ey, t) => {
        if (rng.next() > 0.75 - 0.4 * t) return;
        const col = rng.pick(fl);
        const r = rng.range(5, 8);
        dot(c, ex, ey, r, rgb(col, rng.range(0.9, 1.1)));
        dot(c, ex, ey, r * 0.35, rgb('#f6e27a', 1));
      },
    });
    for (let i = 0; i < 60; i++) {
      const fx = x + 10 + rng.next() * (w - 20),
        fy = y + 8 + Math.pow(rng.next(), 2.0) * h * 0.35;
      const r = rng.range(5, 8);
      dot(c, fx, fy, r, rgb(rng.pick(fl), rng.range(0.9, 1.1)));
      dot(c, fx, fy, r * 0.35, rgb('#f6e27a', 1));
    }
  }
  // 4 geranium clump (round leaves, red umbels on top)
  {
    const [x, y, w, h] = cell(GREEN.GERANIUM);
    const cxm = x + w / 2,
      base = y + h - 6;
    for (let i = 0; i < 70; i++) {
      const a = rng.range(-1.35, 1.35);
      const r = Math.pow(rng.next(), 0.6) * (h * 0.62);
      const lx = cxm + Math.sin(a) * r * 0.95,
        ly = base - Math.cos(a) * r * 0.85;
      const s = rng.range(13, 20);
      const k = rng.range(0.6, 1.05) * (0.8 + 0.25 * (1 - r / (h * 0.62)));
      dot(c, lx, ly, s * 0.62, rgb(rng.pick(['#4b7a30', '#3f6d2a', '#56853a']), k));
      c.strokeStyle = rgb('#2c4a1c', k);
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(lx, ly, s * 0.36, 0, 6.28);
      c.stroke();
    }
    const reds = ['#d8282f', '#e23a3a', '#c41e3a', '#f04a5a'];
    const red = rng.pick(reds);
    for (let u = 0; u < 9; u++) {
      const ux = cxm + rng.range(-w * 0.36, w * 0.36),
        uy = y + h * rng.range(0.08, 0.42);
      c.strokeStyle = rgb('#3f6d2a', 1);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(ux, uy);
      c.lineTo(ux + rng.range(-6, 6), uy + 40);
      c.stroke();
      for (let q = 0; q < 16; q++) {
        const qa = rng.next() * 6.28,
          qr = Math.sqrt(rng.next()) * 15;
        dot(c, ux + Math.cos(qa) * qr, uy + Math.sin(qa) * qr * 0.8, rng.range(3.2, 5), rgb(red, rng.range(0.82, 1.15)));
      }
    }
  }
  // 5 leafy shrub (box / olive / myrtle mass with an irregular outline)
  {
    const [x, y, w, h] = cell(GREEN.SHRUB);
    const cxm = x + w / 2,
      cym = y + h * 0.55;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 520; i++) {
        const a = rng.next() * 6.28;
        const rr = Math.sqrt(rng.next());
        const edge = 0.85 + 0.15 * Math.sin(a * 5 + 1.3) + 0.08 * Math.sin(a * 11);
        const lx = cxm + Math.cos(a) * rr * w * 0.44 * edge,
          ly = cym + Math.sin(a) * rr * h * 0.42 * edge;
        const top = 1 - (ly - y) / h;
        const k = pass === 0 ? rng.range(0.45, 0.7) : rng.range(0.7, 1.1) * (0.85 + 0.3 * top);
        leaf(c, lx, ly, rng.range(9, 15), rng.range(3.5, 5.5), rng.next() * 6.28, rgb(rng.pick(['#3f5f2a', '#4b6a33', '#55743a', '#3a5530']), k));
      }
    }
  }
  // 6 palm / fern fronds (potted kentia / strelitzia look)
  {
    const [x, y, w, h] = cell(GREEN.PALM);
    const bx = x + w / 2,
      by = y + h - 4;
    for (let f = 0; f < 11; f++) {
      const a = -1.35 + (f / 10) * 2.7 + rng.range(-0.12, 0.12);
      const L = rng.range(h * 0.6, h * 0.92);
      const pts: [number, number][] = [];
      for (let s = 0; s <= 1.0001; s += 0.04) {
        const bend = a * (0.6 + 0.9 * s);
        pts.push([bx + Math.sin(bend) * L * s, by - Math.cos(bend) * L * s + s * s * L * 0.25 * Math.abs(Math.sin(a))]);
      }
      c.strokeStyle = rgb('#4f6a2a', 1);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) c.lineTo(p[0], p[1]);
      c.stroke();
      for (let k = 2; k < pts.length; k++) {
        const t = k / pts.length;
        const [px, py] = pts[k];
        const dx = pts[k][0] - pts[k - 1][0],
          dy = pts[k][1] - pts[k - 1][1];
        const base = Math.atan2(-dx, dy);
        const s = (1 - t * 0.6) * rng.range(26, 34);
        const col = rgb(rng.pick(['#3f6a2a', '#4a7a30', '#36602a']), rng.range(0.75, 1.1));
        leaf(c, px, py, s, 3.2, base + 2.0, col);
        leaf(c, px, py, s, 3.2, base - 2.0 + 0.0, col);
      }
    }
  }
  // 7 grass tuft / spider plant
  {
    const [x, y, w, h] = cell(GREEN.GRASS);
    const bx = x + w / 2,
      by = y + h - 4;
    for (let i = 0; i < 70; i++) {
      const a = rng.range(-1.3, 1.3);
      const L = rng.range(h * 0.45, h * 0.95);
      const ex = bx + Math.sin(a) * L,
        ey = by - Math.cos(a) * L * 0.85 + Math.abs(a) * L * 0.25;
      const col = rgb(rng.pick(['#5b7d34', '#6f8f3c', '#4c6e2e', '#8a9a4a']), rng.range(0.75, 1.1));
      c.strokeStyle = col;
      c.lineWidth = rng.range(2.5, 4.5);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(bx + rng.range(-8, 8), by);
      c.quadraticCurveTo(bx + Math.sin(a) * L * 0.4, by - L * 0.75, ex, ey);
      c.stroke();
    }
    c.lineCap = 'butt';
  }
  // 8 ivy patch for walls (dense, ragged outline)
  {
    const [x, y, w, h] = cell(GREEN.IVY_WALL);
    for (let i = 0; i < 26; i++) {
      // stems wandering upward
      let sx0 = x + rng.next() * w,
        sy0 = y + h - 2;
      c.strokeStyle = rgb('#4a3f2a', 0.9);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(sx0, sy0);
      for (let s = 0; s < 60; s++) {
        sx0 += rng.range(-3, 3);
        sy0 -= 4;
        if (sy0 < y + 4) break;
        c.lineTo(Math.max(x + 3, Math.min(x + w - 3, sx0)), sy0);
      }
      c.stroke();
    }
    for (let i = 0; i < 380; i++) {
      const lx = x + 6 + rng.next() * (w - 12),
        ly = y + 6 + rng.next() * (h - 12);
      // ragged outline: thin out towards a noisy border
      const ex = Math.min(lx - x, x + w - lx) / (w / 2),
        ey = Math.min(ly - y, y + h - ly) / (h / 2);
      const e = Math.min(ex, ey) + 0.25 * Math.sin(lx * 0.07) * Math.sin(ly * 0.09);
      if (e < 0.18 && rng.next() > e * 4) continue;
      ivyLeaf(c, lx, ly, rng.range(13, 20), rng.range(Math.PI - 0.6, Math.PI + 0.6), rgb(rng.pick(['#2c4a22', '#35562a', '#3d5f2c', '#27421f', '#46682f']), rng.range(0.65, 1.1)), rgb('#8fa070', 0.85));
    }
  }
  // 9 jasmine (dark small leaves + white stars)
  {
    const [x, y, w, h] = cell(GREEN.JASMINE);
    const cxm = x + w / 2,
      cym = y + h * 0.55;
    for (let i = 0; i < 420; i++) {
      const a = rng.next() * 6.28,
        rr = Math.sqrt(rng.next());
      const edge = 0.85 + 0.15 * Math.sin(a * 4 + 0.3);
      leaf(c, cxm + Math.cos(a) * rr * w * 0.45 * edge, cym + Math.sin(a) * rr * h * 0.42 * edge, rng.range(9, 13), 4, rng.next() * 6.28, rgb(rng.pick(['#2f4a24', '#38552a', '#2a4220']), rng.range(0.7, 1.1)));
    }
    for (let i = 0; i < 70; i++) {
      const a = rng.next() * 6.28,
        rr = Math.sqrt(rng.next()) * 0.9;
      const fx = cxm + Math.cos(a) * rr * w * 0.42,
        fy = cym + Math.sin(a) * rr * h * 0.38;
      for (let q = 0; q < 5; q++) leaf(c, fx, fy, 6, 2.6, (q / 5) * 6.28, rgb('#f8f4ec', rng.range(0.92, 1.0)));
    }
  }
  // 10 lavender (grey-green + purple spikes)
  {
    const [x, y, w, h] = cell(GREEN.LAVENDER);
    const bx = x + w / 2,
      by = y + h - 4;
    for (let i = 0; i < 120; i++) {
      const a = rng.range(-1.2, 1.2);
      const L = rng.range(30, 70);
      leaf(c, bx + rng.range(-40, 40), by - rng.range(0, 30), L, 3, Math.PI + a * 0.8, rgb(rng.pick(['#7f8f6a', '#6f805c', '#8c9a78']), rng.range(0.75, 1.05)));
    }
    for (let i = 0; i < 46; i++) {
      const a = rng.range(-0.9, 0.9);
      const L = rng.range(h * 0.5, h * 0.92);
      const ex = bx + Math.sin(a) * L * 0.7,
        ey = by - Math.cos(a) * L;
      c.strokeStyle = rgb('#6f805c', 1);
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(bx + rng.range(-12, 12), by);
      c.lineTo(ex, ey);
      c.stroke();
      for (let q = 0; q < 9; q++) {
        const t = q / 9;
        dot(c, ex + (bx - ex) * t * 0.25 + rng.range(-2.5, 2.5), ey + (by - ey) * t * 0.25, rng.range(2.6, 3.8), rgb(rng.pick(['#7a5aa8', '#8a68b8', '#6a4a98']), rng.range(0.85, 1.12)));
      }
    }
  }
  // 11 succulent / aloe rosette
  {
    const [x, y, w, h] = cell(GREEN.SUCCULENT);
    const bx = x + w / 2,
      by = y + h - 8;
    for (let i = 0; i < 26; i++) {
      const a = Math.PI + rng.range(-1.45, 1.45);
      const L = rng.range(h * 0.45, h * 0.85) * (1 - 0.35 * Math.abs(Math.sin(a)));
      leaf(c, bx + rng.range(-6, 6), by, L, rng.range(9, 14), a, rgb(rng.pick(['#5f8a6a', '#6a9474', '#557f60', '#7a9a6a']), rng.range(0.75, 1.1)), rgb('#9fbf9a', 1));
    }
  }
  return cv;
}

export function makeGreenTexture(): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(paintAtlas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ─────────────────────────────────────────────────────────── material ──

export function createGreenMaterial(g: GlobalUniforms, tex: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
  m.name = 'buildings-green';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: g.uTime, uWind: g.uWind, ...lampUniforms() });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aX;
uniform float uTime;
uniform vec2 uWind;
varying vec3 vGWPos;
varying vec3 vGWNrm;
${WIND_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  // the mesh is in world space (identity matrix): sway from the attachment line, flutter of the leaves
  float gs = aX.x * aX.z;
  if (gs > 0.0) {
    vec2 gw = thWindAt(transformed.xz);
    float osc = 0.6 * sin(uTime * 1.6 + aX.y) + 0.4 * sin(uTime * 2.9 + aX.y * 1.7);
    vec2 push = gw * (0.75 + 0.45 * osc);
    transformed.xz += push * gs;
    transformed.y += length(push) * gs * 0.22;
    float fl = 0.012 * aX.x * (0.4 + length(gw));
    transformed.xz += vec2(sin(uTime * 6.1 + aX.y * 5.0 + transformed.y * 3.0), cos(uTime * 5.3 + aX.y * 3.0 + transformed.x * 2.0)) * fl;
  }
}`,
      )
      .replace('#include <fog_vertex>', `#include <fog_vertex>\nvGWPos = transformed;\nvGWNrm = objectNormal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGWPos;\nvarying vec3 vGWNrm;\n${LAMP_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#ifdef USE_MAP
{
  // keep the alpha-tested coverage when the card is minified (rescale alpha by the mip level)
  vec2 tdx = dFdx(vMapUv * ${N}.0), tdy = dFdy(vMapUv * ${N}.0);
  float mip = 0.5 * log2(max(max(dot(tdx, tdx), dot(tdy, tdy)), 1e-8));
  diffuseColor.a *= 1.0 + max(mip, 0.0) * 0.32;
}
#endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vGWPos, normalize(vGWNrm));`,
      );
  };
  m.customProgramCacheKey = () => 'tinyhaven-buildings-green-v1';
  return m;
}

// ─────────────────────────────────────────────────────────── emitters ──

/** Emits leaf cards into a Builder (normal + color + uv + aux) in the current local frame. */
export class GreenKit {
  constructor(
    readonly b: Builder,
    readonly rng: Rng,
  ) {}

  private tint(k: number): void {
    const r = this.rng;
    const t = k * (0.86 + r.next() * 0.22);
    this.b.setRGB(t * (0.96 + r.next() * 0.08), t, t * (0.92 + r.next() * 0.1));
  }

  /**
   * One card: corners bottom-left a, bottom-right b, top-right c, top-left d (local points), uv from
   * `cell` (optionally mirrored), per-corner sway weights (bottom wb, top wt), normal n per corner.
   */
  card(a: number[], bb: number[], c: number[], d: number[], cell: number, flip: boolean, wb: number, wt: number, amp: number, n: number[], nTop?: number[]): void {
    const b = this.b;
    const [u0, v0, u1, v1] = cellUV(cell);
    const ua = flip ? u1 : u0,
      ub = flip ? u0 : u1;
    const ph = this.rng.next() * 6.283;
    const nt = nTop ?? n;
    b.X[1] = ph;
    b.X[2] = amp;
    b.X[0] = wb;
    const i = b.vertex(a[0], a[1], a[2], n[0], n[1], n[2], ua, v0);
    b.vertex(bb[0], bb[1], bb[2], n[0], n[1], n[2], ub, v0);
    b.X[0] = wt;
    b.vertex(c[0], c[1], c[2], nt[0], nt[1], nt[2], ub, v1);
    b.vertex(d[0], d[1], d[2], nt[0], nt[1], nt[2], ua, v1);
    b.tri(i, i + 1, i + 2);
    b.tri(i, i + 2, i + 3);
    b.X[0] = b.X[1] = b.X[2] = 0;
  }

  /**
   * Hanging curtain along side sg from uA to uB: cards attached at yTop at outward offset o, hanging
   * len ∈ [lenMin, lenMax], bulging out by `bulge` at the bottom. Two staggered layers.
   */
  hang(sg: SideGeom, uA: number, uB: number, o: number, yTop: number, lenMin: number, lenMax: number, cell: number, bulge = 0.12, tint = 1, minY = 2.45): void {
    const r = this.rng;
    const L = uB - uA;
    if (L < 0.15) return;
    // overhangs beyond the footprint must stay above 2.4 m (plan rule): clamp the hanging length
    lenMax = Math.min(lenMax, yTop - minY);
    lenMin = Math.min(lenMin, lenMax);
    if (lenMax < 0.15) return;
    for (let layer = 0; layer < 2; layer++) {
      let u = uA - 0.05 + (layer ? 0.18 : 0);
      while (u < uB - 0.1) {
        const len = r.range(lenMin, lenMax) * (layer ? 0.8 : 1);
        const w = Math.min(Math.max(len * 0.5, 0.3), 0.7) * r.range(0.85, 1.15);
        const ua = u,
          ub = Math.min(u + w, uB + 0.05);
        const oo = o + layer * 0.05;
        const top = yTop + r.range(0.04, 0.14);
        const bot = top - len;
        const ob = oo + bulge * r.range(0.6, 1.3);
        const n = [sg.nx * 0.75, 0.55, sg.nz * 0.75];
        this.tint(tint * (layer ? 0.88 : 1));
        this.card(
          [sx(sg, ua, ob), bot, sz(sg, ua, ob)],
          [sx(sg, ub, ob), bot, sz(sg, ub, ob)],
          [sx(sg, ub, oo), top, sz(sg, ub, oo)],
          [sx(sg, ua, oo), top, sz(sg, ua, oo)],
          cell,
          r.chance(0.5),
          1,
          0,
          0.05 + len * 0.06,
          n,
          [sg.nx * 0.6, 0.8, sg.nz * 0.6],
        );
        u += w * r.range(0.55, 0.8);
      }
    }
  }

  /** Crossed-card clump (pot plant / box plants) standing at local (x, y, z): radius r, height h. */
  clump(x: number, y: number, z: number, r: number, h: number, cell: number, planes = 3, tint = 1, yaw = 0): void {
    const rng = this.rng;
    const a0 = yaw + rng.next() * Math.PI;
    this.tint(tint);
    for (let p = 0; p < planes; p++) {
      const a = a0 + (p / planes) * Math.PI;
      const cx = Math.cos(a) * r,
        cz = Math.sin(a) * r;
      // normals lean outward from the clump centre (soft rounded shading instead of flat cards)
      const nA = [-cx / r * 0.6, 0.5, -cz / r * 0.6];
      const nB = [cx / r * 0.6, 0.5, cz / r * 0.6];
      const nT = [0, 1, 0];
      this.card([x - cx, y, z - cz], [x + cx, y, z + cz], [x + cx * 1.08, y + h, z + cz * 1.08], [x - cx * 1.08, y + h, z - cz * 1.08], cell, rng.chance(0.5), 0, 0.35, 0.05 + h * 0.05, [(nA[0] + nB[0]) * 0.5, 0.6, (nA[2] + nB[2]) * 0.5], nT);
    }
  }

  /** Flat patch on a wall (ivy): cards of `size` tiled over [uA,uB] × [y0,y1] at offset o. */
  wall(sg: SideGeom, uA: number, uB: number, y0: number, y1: number, o: number, cell: number, size = 1.3, tint = 1): void {
    const r = this.rng;
    const n = [sg.nx, 0.25, sg.nz];
    for (let y = y0; y < y1 - size * 0.25; y += size * 0.62) {
      for (let u = uA - size * 0.2; u < uB - size * 0.3; u += size * 0.6) {
        const s = size * r.range(0.8, 1.2);
        const uu = u + r.range(-0.15, 0.15) * size,
          yy = y + r.range(-0.12, 0.12) * size;
        const oo = o + r.next() * 0.06;
        this.tint(tint * r.range(0.85, 1.08));
        this.card(
          [sx(sg, uu, oo), yy, sz(sg, uu, oo)],
          [sx(sg, uu + s, oo), yy, sz(sg, uu + s, oo)],
          [sx(sg, uu + s, oo + 0.04), yy + s, sz(sg, uu + s, oo + 0.04)],
          [sx(sg, uu, oo + 0.04), yy + s, sz(sg, uu, oo + 0.04)],
          cell,
          r.chance(0.5),
          0.15,
          0.25,
          0.02,
          n,
        );
      }
    }
  }
}
