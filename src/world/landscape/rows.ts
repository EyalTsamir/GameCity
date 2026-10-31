// Row strips: what makes a coloured patch read as farmed land. One static merged kit in three meshes,
// one material, one atlas of tiling alpha-cut "walls" (vines on their wires, maize, sunflowers, hedge, reeds, marram, wire
// and rail fences, dry-stone walls, sand fences) plus solid parts (bales, polytunnels). A vine row is two quads per 6 m:
// triangles are the cheap currency here (perf-deep.md), and the rows and their shadows are what the eye reads at 100–700 m.
// Beyond ~1 km plant strips sink into the ground (the land shader's stripes carry the field from there).

import * as THREE from 'three';
import { WIND_GLSL } from '../../core/wind';
import { hash2i } from './noise';

export const B = { vine: 0, maize: 1, sunflower: 2, hedge: 3, canopy: 4, reed: 5, marram: 6, wire: 7, rail: 8, stone: 9, sandfence: 10, solid: 11, sunTop: 12, plastic: 13, straw: 14, fern: 15 } as const;
/** height of each band in metres (u tiles every 8 × height: texels stay square) */
export const BAND_H = [1.75, 2.5, 2.1, 3.0, 2.0, 2.3, 0.95, 1.3, 1.25, 1.15, 1.25, 1, 2, 3.2, 1.5, 1.0];
const NB = BAND_H.length;
const BW = 1024,
  BH = 128;
const PAD = 3;

type Ctx = CanvasRenderingContext2D;

/** a pointed leaf from (x, y), wrapped round the tile */
function leaf(c: Ctx, x: number, y: number, len: number, wid: number, ang: number, col: string): void {
  c.fillStyle = col;
  for (const ox of [-BW, 0, BW]) {
    const cx = x + ox;
    if (cx < -len || cx > BW + len) continue;
    const dx = Math.cos(ang),
      dy = Math.sin(ang);
    const mx = cx + (dx * len) / 2,
      my = y + (dy * len) / 2;
    const ex = cx + dx * len,
      ey = y + dy * len;
    c.beginPath();
    c.moveTo(cx, y);
    c.quadraticCurveTo(mx - dy * wid, my + dx * wid, ex, ey);
    c.quadraticCurveTo(mx + dy * wid, my - dx * wid, cx, y);
    c.fill();
  }
}

/** an arching leaf (maize, reed): a curved tapering band */
function arc(c: Ctx, x: number, y: number, len: number, wid: number, ang: number, droop: number, col: string): void {
  c.strokeStyle = col;
  c.lineCap = 'round';
  const n = 5;
  for (const ox of [-BW, 0, BW]) {
    let px = x + ox,
      py = y;
    if (px < -len || px > BW + len) continue;
    let a = ang;
    for (let i = 0; i < n; i++) {
      c.lineWidth = Math.max(0.8, wid * (1 - i / n));
      const nx = px + (Math.cos(a) * len) / n,
        ny = py + (Math.sin(a) * len) / n;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(nx, ny);
      c.stroke();
      px = nx;
      py = ny;
      a += (Math.cos(a) > 0 ? 1 : -1) * droop;
    }
  }
}

const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

function drawBand(c: Ctx, b: number, R: (k: number) => number): void {
  const H = BH - 2 * PAD;
  const pxm = H / BAND_H[b];
  const G = H; // ground line (band-local y, y down)
  const green = (t: number, k = 1) => rgb((48 + 42 * t) * k, (82 + 52 * t) * k, (28 + 18 * t) * k);
  switch (b) {
    case B.vine: {
      // stakes and wires behind, gnarled stocks, the leaf wall from 0.45 m up, grape bunches low in it
      c.fillStyle = rgb(92, 78, 62);
      for (let x = 20; x < BW; x += pxm * 5.1) c.fillRect(x, G - 1.55 * pxm, 4, 1.55 * pxm);
      c.fillStyle = rgb(120, 120, 118);
      for (const h of [0.7, 1.05, 1.4]) c.fillRect(0, G - h * pxm, BW, 1.5);
      for (let x = 8; x < BW; x += pxm * 1.15) {
        c.strokeStyle = rgb(66, 50, 38);
        c.lineWidth = 3.5;
        c.beginPath();
        c.moveTo(x, G);
        c.quadraticCurveTo(x + 6 * (R(x) - 0.5), G - 0.35 * pxm, x + 4 * (R(x + 1) - 0.5), G - 0.8 * pxm);
        c.stroke();
      }
      for (let i = 0; i < 2300; i++) {
        const x = R(i * 3 + 1) * BW;
        const y = G - (0.42 + 1.28 * Math.pow(R(i * 3 + 2), 0.85)) * pxm;
        // gaps through the canopy, fewer at mid height
        if (Math.sin(x * 0.037 + y * 0.09) + Math.sin(x * 0.011 - y * 0.05) < -1.15) continue;
        const t = R(i * 3 + 3);
        leaf(c, x, y, 7 + 7 * R(i + 91), 3.4 + 2 * R(i + 92), R(i + 93) * 6.28, green(t * (i / 2300), 0.82 + 0.3 * R(i + 94)));
      }
      c.fillStyle = rgb(44, 30, 58);
      for (let i = 0; i < 44; i++) {
        const x = R(i + 301) * BW,
          y = G - (0.55 + 0.35 * R(i + 302)) * pxm;
        for (let k = 0; k < 9; k++) {
          c.beginPath();
          c.arc(x + (R(i * 9 + k) - 0.5) * 6, y + (k / 9) * 11, 1.7, 0, 6.3);
          c.fill();
        }
      }
      break;
    }
    case B.maize: {
      for (let x = 2; x < BW; x += pxm * 0.21) {
        const top = G - (2.1 + 0.35 * R(x + 7)) * pxm;
        c.strokeStyle = rgb(112, 132, 60);
        c.lineWidth = 2.6;
        c.beginPath();
        c.moveTo(x, G);
        c.lineTo(x + 3 * (R(x) - 0.5), top);
        c.stroke();
        for (let k = 0; k < 9; k++) {
          const y = G - (0.3 + (k / 9) * 1.75) * pxm;
          const s = k % 2 ? 1 : -1;
          const t = R(x + k * 11);
          arc(c, x, y, (0.55 + 0.45 * t) * pxm, 4.2, -Math.PI / 2 + s * (0.45 + 0.5 * R(x + k)), 0.3, rgb(44 + 48 * t, 88 + 58 * t, 34 + 22 * t));
        }
        // tassel, pale gold; a cob sheath half way up on most stalks
        c.strokeStyle = rgb(186, 164, 96);
        c.lineWidth = 1.2;
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          c.moveTo(x, top);
          c.lineTo(x + (k - 2) * 2.6, top - 8 - 4 * R(x + k));
          c.stroke();
        }
        c.fillStyle = rgb(150, 160, 82);
        if (R(x + 31) < 0.7) c.fillRect(x - 2, G - 1.15 * pxm, 4.4, 12);
      }
      break;
    }
    case B.sunflower: {
      for (let x = 4; x < BW; x += pxm * 0.36) {
        const top = G - (1.5 + 0.5 * R(x + 3)) * pxm;
        c.strokeStyle = rgb(92, 118, 52);
        c.lineWidth = 2.6;
        c.beginPath();
        c.moveTo(x, G);
        c.lineTo(x + 3 * (R(x) - 0.5), top);
        c.stroke();
        for (let k = 0; k < 7; k++) {
          const y = G - (0.3 + (k / 7) * 1.1) * pxm;
          const t = R(x + k * 5);
          leaf(c, x, y, 20 + 12 * t, 9 + 3 * t, (k % 2 ? 0.2 : Math.PI - 0.2) + (R(x + k) - 0.5) * 0.9, green(t, 0.86));
        }
        const hx = x + 3 * (R(x) - 0.5);
        for (let k = 0; k < 16; k++) leaf(c, hx, top, 10.5, 3.4, (k / 16) * 6.283, rgb(226, 174 + 28 * R(x + k), 34));
        c.fillStyle = rgb(62, 40, 22);
        c.beginPath();
        c.arc(hx, top, 5.4, 0, 6.3);
        c.fill();
      }
      break;
    }
    case B.hedge: {
      c.strokeStyle = rgb(58, 46, 36);
      c.lineWidth = 2.4;
      for (let x = 6; x < BW; x += 21) {
        c.beginPath();
        c.moveTo(x, G);
        c.lineTo(x + 18 * (R(x) - 0.5), G - 0.7 * pxm);
        c.stroke();
      }
      for (let i = 0; i < 6600; i++) {
        const x = R(i * 3 + 11) * BW;
        // a billowing top: two sines + noise; thin and leggy at the foot
        const top = (2.25 + 0.34 * Math.sin((x / BW) * 6.283 * 3 + 1) + 0.2 * Math.sin((x / BW) * 6.283 * 7)) * pxm;
        const u = Math.pow(R(i * 3 + 12), 0.8);
        const y = G - (0.1 + u * 0.97) * top;
        const t = R(i * 3 + 13) * (0.35 + 0.65 * (i / 6600));
        leaf(c, x, y, 4.4 + 4 * R(i + 91), 2.2 + 1.3 * R(i + 92), R(i + 93) * 6.28, green(t, 0.72 + 0.26 * (i / 6600)));
      }
      // hawthorn blossom / dog rose here and there, an old-man's-beard straggler
      for (let i = 0; i < 60; i++) {
        c.fillStyle = R(i + 700) < 0.7 ? rgb(214, 212, 192) : rgb(196, 150, 158);
        c.beginPath();
        c.arc(R(i + 701) * BW, G - (0.8 + 1.5 * R(i + 702)) * pxm, 1.1, 0, 6.3);
        c.fill();
      }
      break;
    }
    case B.canopy:
    case B.sunTop: {
      for (let i = 0, n = b === B.sunTop ? 700 : 3600; i < n; i++) {
        const x = R(i * 3 + 21) * BW;
        const u = R(i * 3 + 22);
        const y = PAD + (0.04 + 0.92 * u) * H;
        const t = R(i * 3 + 23) * (0.3 + 0.7 * (i / n));
        leaf(c, x, y, 8 + 6 * R(i + 91), 3.6 + 2 * R(i + 92), R(i + 93) * 6.28, green(t, 0.78 + 0.3 * (i / n)));
      }
      if (b === B.sunTop)
        for (let i = 0; i < 300; i++) {
          const hx = R(i + 41) * BW,
            hy = PAD + (0.1 + 0.8 * R(i + 42)) * H;
          for (let k = 0; k < 12; k++) leaf(c, hx, hy, 9.5, 3.2, (k / 12) * 6.283, rgb(226, 178, 34));
          c.fillStyle = rgb(62, 40, 22);
          c.beginPath();
          c.arc(hx, hy, 4.6, 0, 6.3);
          c.fill();
        }
      break;
    }
    case B.reed: {
      // stands, not a palisade: clumps with air between them, thin stems, long lance leaves, a dark mass low down
      for (let cl = 0; cl < 34; cl++) {
        const cx = R(cl * 17 + 51) * BW;
        const spread = 18 + 46 * R(cl * 17 + 52);
        const tall = 0.62 + 0.38 * R(cl * 17 + 53);
        for (let i = 0; i < 26; i++) {
          const k = cl * 101 + i * 13;
          const x = cx + (R(k + 1) + R(k + 2) - 1) * spread;
          const h = (0.85 + 1.35 * R(k + 3)) * pxm * tall;
          const t = R(k + 4);
          const lean = (R(k + 5) - 0.5) * 18;
          // leaves first, then the stem on top
          for (let j = 0; j < 3; j++) {
            const yy = G - h * (0.08 + 0.32 * R(k + 6 + j));
            const side = R(k + 9 + j) < 0.5 ? 0.35 : -0.35;
            arc(c, x + lean * 0.2, yy, 26 + 30 * R(k + 12 + j), 2.8, -Math.PI / 2 + side, 0.34, rgb(70 + 54 * t, 96 + 44 * t, 44 + 18 * t));
          }
          c.strokeStyle = rgb(112 + 62 * t, 118 + 44 * t, 66 + 22 * t);
          c.lineWidth = 1.7;
          c.beginPath();
          c.moveTo(x, G);
          c.quadraticCurveTo(x + lean * 0.3, G - h * 0.6, x + lean, G - h);
          c.stroke();
          const r = R(k + 15);
          if (r < 0.3) {
            for (let j = 0; j < 7; j++) leaf(c, x + lean, G - h + 3, 13 + 5 * R(k + 16 + j), 2.6, -Math.PI / 2 + (j - 3) * 0.17, rgb(150, 118, 96));
          } else if (r < 0.37) {
            c.fillStyle = rgb(58, 38, 24);
            c.fillRect(x + lean - 2.1, G - h + 5, 4.2, 15);
          }
        }
      }
      break;
    }
    case B.marram: {
      for (let cl = 0; cl < 26; cl++) {
        const cx = R(cl + 61) * BW;
        for (let i = 0; i < 44; i++) {
          const t = R(cl * 50 + i);
          const a = -Math.PI / 2 + (R(cl * 50 + i + 3000) - 0.5) * 1.5;
          arc(c, cx + (R(cl * 50 + i + 5000) - 0.5) * 34, G, (0.45 + 0.5 * t) * pxm, 2.6, a, 0.12, rgb(112 + 70 * t, 124 + 50 * t, 72 + 34 * t));
        }
      }
      break;
    }
    case B.wire: {
      c.fillStyle = rgb(118, 118, 116);
      for (const h of [0.45, 0.78, 1.1]) c.fillRect(0, G - h * pxm, BW, 2.2);
      for (let x = 12; x < BW; x += BW / 3) {
        c.fillStyle = rgb(92, 74, 56);
        c.fillRect(x, G - 1.22 * pxm, 8, 1.22 * pxm);
      }
      break;
    }
    case B.rail: {
      c.fillStyle = rgb(112, 92, 70);
      for (const h of [0.5, 0.95]) c.fillRect(0, G - h * pxm, BW, 8);
      for (let x = 8; x < BW; x += BW / 4) {
        c.fillStyle = rgb(92, 74, 56);
        c.fillRect(x, G - 1.2 * pxm, 11, 1.2 * pxm);
      }
      break;
    }
    case B.stone: {
      // courses of rough stones with a ragged cope, lichen, dark joints
      c.fillStyle = rgb(70, 66, 60);
      c.beginPath();
      c.moveTo(0, G);
      for (let x = 0; x <= BW; x += 14) c.lineTo(x, G - (0.92 + 0.14 * Math.sin((x / BW) * 6.283 * 5) + 0.08 * R(Math.min(x, BW - x) + 3)) * pxm);
      c.lineTo(BW, G);
      c.fill();
      for (let row = 0; row < 7; row++) {
        const y0 = G - (row + 0.2) * 0.145 * pxm;
        let x = -20 * R(row);
        while (x < BW) {
          const w = 26 + 40 * R(x + row * 77),
            h = 0.135 * pxm * (0.8 + 0.3 * R(x + row));
          const t = R(x * 3 + row);
          if (y0 - h > G - 0.92 * pxm) {
            c.fillStyle = rgb(128 + 54 * t, 120 + 50 * t, 104 + 44 * t);
            c.beginPath();
            c.roundRect(x, y0 - h, w - 2.5, h - 2, 5);
            c.fill();
            if (R(x + row * 5) < 0.22) {
              c.fillStyle = rgb(148, 150, 96);
              c.fillRect(x + 4, y0 - h + 2, w * 0.4, 3);
            }
          }
          x += w;
        }
      }
      break;
    }
    case B.sandfence: {
      for (let x = 0; x < BW; x += pxm * 0.075) {
        if (R(x + 71) < 0.09) continue; // a lost slat
        const lean = (R(x + 72) - 0.5) * 3;
        const hh = (1.0 + 0.18 * R(x + 73)) * pxm;
        const t = R(x + 74);
        c.strokeStyle = rgb(146 + 40 * t, 130 + 36 * t, 106 + 30 * t);
        c.lineWidth = 3.6;
        c.beginPath();
        c.moveTo(x, G);
        c.lineTo(x + lean, G - hh);
        c.stroke();
      }
      c.fillStyle = rgb(92, 86, 76);
      for (const h of [0.3, 0.85]) c.fillRect(0, G - h * pxm, BW, 1.6);
      break;
    }
    case B.solid: {
      c.fillStyle = rgb(232, 232, 232);
      c.fillRect(0, PAD, BW, H);
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = `rgba(${R(i) < 0.5 ? '0,0,0' : '255,255,255'},0.06)`;
        c.fillRect(R(i + 1) * BW, PAD + R(i + 2) * H, 3 + 20 * R(i + 3), 1 + 3 * R(i + 4));
      }
      break;
    }
    case B.plastic: {
      // polytunnel skin: pale plastic, hoops every 1.6 m, soft dirt bands, a patch or two
      c.fillStyle = rgb(226, 230, 226);
      c.fillRect(0, PAD, BW, H);
      for (let x = 0; x < BW; x += pxm * 1.6) {
        c.fillStyle = 'rgba(70,74,72,0.5)';
        c.fillRect(x, PAD, 3, H);
      }
      for (let i = 0; i < 26; i++) {
        c.fillStyle = 'rgba(120,118,104,0.09)';
        c.fillRect(R(i) * BW, PAD + R(i + 40) * H, 60 + 180 * R(i + 80), 6 + 24 * R(i + 120));
      }
      break;
    }
    case B.fern: {
      // bracken in drifts: arching fronds with paired leaflets, a dark tangle low down, a few bramble canes
      for (let cl = 0; cl < 54; cl++) {
        const cx = R(cl * 19 + 81) * BW;
        const tall = 0.55 + 0.45 * R(cl * 19 + 82);
        for (let i = 0; i < 9; i++) {
          const k = cl * 97 + i * 11;
          const t = R(k + 1);
          let ang = -Math.PI / 2 + (R(k + 2) - 0.5) * 2.2;
          const turn = (Math.cos(ang) > 0 ? 1 : -1) * 0.15;
          const len = (0.5 + 0.48 * R(k + 3)) * pxm * tall;
          let px = cx + (R(k + 4) - 0.5) * 34,
            py = G;
          const col = rgb(58 + 58 * t, 96 + 50 * t, 32 + 18 * t);
          const n = 9;
          for (let j = 0; j < n; j++) {
            const nx = px + (Math.cos(ang) * len) / n,
              ny = py + (Math.sin(ang) * len) / n;
            c.strokeStyle = rgb(86 + 40 * t, 96 + 30 * t, 44);
            c.lineWidth = 1.2;
            c.beginPath();
            c.moveTo(px, py);
            c.lineTo(nx, ny);
            c.stroke();
            if (j > 1) {
              const ll = 5 + (1 - j / n) * 13;
              leaf(c, nx, ny, ll, 2.1, ang + 1.25, col);
              leaf(c, nx, ny, ll, 2.1, ang - 1.25, col);
            }
            px = nx;
            py = ny;
            ang += turn;
          }
        }
      }
      break;
    }
    case B.straw: {
      c.fillStyle = rgb(190, 158, 92);
      c.fillRect(0, PAD, BW, H);
      for (let i = 0; i < 2600; i++) {
        const t = R(i + 3);
        c.strokeStyle = rgb(130 + 90 * t, 100 + 88 * t, 50 + 60 * t);
        c.lineWidth = 1;
        const x = R(i + 5) * BW,
          y = PAD + R(i + 6) * H,
          a = (R(i + 7) - 0.5) * 1.1;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
        c.stroke();
      }
      break;
    }
  }
}

/** tiling bands; mips per band (no bleeding between bands), colour weighted by coverage so edges don't darken */
export function buildRowAtlas(): THREE.DataTexture {
  const cv = document.createElement('canvas');
  cv.width = BW;
  cv.height = BH * NB;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  for (let b = 0; b < NB; b++) {
    c.save();
    c.beginPath();
    c.rect(0, b * BH, BW, BH);
    c.clip();
    c.translate(0, b * BH + PAD);
    let seed = b * 1009 + 17;
    drawBand(c, b, (k) => hash2i(Math.floor(k * 7.3) + seed++ * 0, Math.floor(k * 13.1) ^ (b * 31), 6113 + b));
    c.restore();
  }
  const img = c.getImageData(0, 0, BW, BH * NB).data;
  const levels: { data: Uint8Array; width: number; height: number }[] = [];
  let cur = new Uint8Array(img.buffer.slice(0));
  // alpha premultiplied by canvas on readback only for partly covered texels; treat hard alpha
  let w = BW,
    h = BH * NB;
  const push = (d: Uint8Array, ww: number, hh: number) => levels.push({ data: d, width: ww, height: hh });
  // fill the transparent texels with the band's mean colour (the mips must not go dark)
  for (let b = 0; b < NB; b++) {
    let r = 0,
      g = 0,
      bb = 0,
      n = 0;
    for (let y = b * BH; y < (b + 1) * BH; y++)
      for (let x = 0; x < BW; x++) {
        const o = (y * BW + x) * 4;
        if (cur[o + 3] > 127) {
          r += cur[o];
          g += cur[o + 1];
          bb += cur[o + 2];
          n++;
        }
      }
    if (!n) n = 1;
    for (let y = b * BH; y < (b + 1) * BH; y++)
      for (let x = 0; x < BW; x++) {
        const o = (y * BW + x) * 4;
        if (cur[o + 3] < 128) {
          cur[o] = r / n;
          cur[o + 1] = g / n;
          cur[o + 2] = bb / n;
          cur[o + 3] = 0;
        } else cur[o + 3] = 255;
      }
  }
  push(cur, w, h);
  let bh = BH;
  while (bh > 4) {
    const nw = w >> 1,
      nbh = bh >> 1,
      nh = nbh * NB;
    const nx = new Uint8Array(nw * nh * 4);
    for (let b = 0; b < NB; b++) {
      for (let y = 0; y < nbh; y++) {
        const ya = b * bh + y * 2,
          yb = ya + 1;
        for (let x = 0; x < nw; x++) {
          const xa = x * 2,
            xb = (xa + 1) & (w - 1);
          const o = ((b * nbh + y) * nw + x) * 4;
          let sa = 0,
            sr = 0,
            sg = 0,
            sb = 0;
          for (const [px, py] of [
            [xa, ya],
            [xb, ya],
            [xa, yb],
            [xb, yb],
          ]) {
            const q = (py * w + px) * 4;
            const a = cur[q + 3];
            sa += a;
            sr += cur[q] * (a + 1);
            sg += cur[q + 1] * (a + 1);
            sb += cur[q + 2] * (a + 1);
          }
          const wt = sa + 4;
          nx[o] = sr / wt;
          nx[o + 1] = sg / wt;
          nx[o + 2] = sb / wt;
          nx[o + 3] = sa / 4;
        }
      }
    }
    push(nx, nw, nh);
    cur = nx;
    w = nw;
    bh = nbh;
  }
  const tex = new THREE.DataTexture(levels[0].data, BW, BH * NB, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels as unknown as THREE.DataTexture['mipmaps'];
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** one chunk's arrays */
class Chunk {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  hgt: number[] = [];
  idx: number[] = [];
}

// three meshes: draw calls cost more here than the triangles culling would save. North and south of the town within
// shadow reach, and everything further out, which casts no shadow (the shadow frustum never gets there in practice).
const NEAR_BOX = 1300;
const vBand = (b: number, t: number) => (b + (PAD + (1 - t) * (BH - 2 * PAD)) / BH) / NB;

/** the merged kit: chunks of static geometry in world coordinates */
export class RowSink {
  private chunks = new Map<number, Chunk>();
  private ch(x: number, z: number): Chunk {
    const k = Math.abs(x) > NEAR_BOX || Math.abs(z) > NEAR_BOX ? 2 : z < 0 ? 0 : 1;
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, (c = new Chunk()));
    return c;
  }
  triangles = 0;

  /**
   * a vertical strip along (x0,z0) → (x1,z1) on the ground heights y0, y1: `band` textured from foot to top, `h` metres tall.
   * u runs on from `s0` (metres along the row). The lighting normal is mostly up, like a foliage mass.
   */
  wall(band: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s0: number, h: number, r: number, g: number, bl: number, foot = 0.62, sink = 0.08, plant = 1, h1 = h): void {
    const c = this.ch((x0 + x1) / 2, (z0 + z1) / 2);
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / len,
      nz = (x1 - x0) / len;
    const bh = BAND_H[band];
    const tile = 8 * bh;
    const o = c.pos.length / 3;
    // fold the lighting normal toward up: a wall that catches the sky and the sun whichever side it is seen from
    const lx = nx * 0.28,
      ly = 0.96,
      lz = nz * 0.28;
    const su0 = s0 / tile,
      su1 = (s0 + len) / tile;
    c.pos.push(x0, y0 - sink, z0, x1, y1 - sink, z1, x1, y1 + h1 - sink, z1, x0, y0 + h - sink, z0);
    for (let i = 0; i < 4; i++) c.nrm.push(lx, ly, lz);
    c.uv.push(su0, vBand(band, 0), su1, vBand(band, 0), su1, vBand(band, 1), su0, vBand(band, 1));
    c.col.push(r * foot, g * foot, bl * foot, r * foot, g * foot, bl * foot, r, g, bl, r, g, bl);
    c.hgt.push(0, 0, h1 * plant, h * plant);
    c.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    this.triangles += 2;
  }

  /** a horizontal ragged strip (canopy from above) along a row, at height h, `wd` wide */
  top(band: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s0: number, h: number, wd: number, r: number, g: number, bl: number, h1 = h): void {
    const c = this.ch((x0 + x1) / 2, (z0 + z1) / 2);
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const px = (-(z1 - z0) / len) * wd * 0.5,
      pz = ((x1 - x0) / len) * wd * 0.5;
    const tile = 8 * BAND_H[band];
    const o = c.pos.length / 3;
    const su0 = s0 / tile,
      su1 = (s0 + len) / tile;
    c.pos.push(x0 - px, y0 + h, z0 - pz, x1 - px, y1 + h1, z1 - pz, x1 + px, y1 + h1, z1 + pz, x0 + px, y0 + h, z0 + pz);
    for (let i = 0; i < 4; i++) c.nrm.push(0, 1, 0);
    c.uv.push(su0, vBand(band, 0), su1, vBand(band, 0), su1, vBand(band, 1), su0, vBand(band, 1));
    for (let i = 0; i < 4; i++) c.col.push(r, g, bl);
    c.hgt.push(h, h1, h1, h);
    c.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    this.triangles += 2;
  }

  /** a solid triangle list given as indexed vertices (x, y, z, nx, ny, nz, u, t) in `band` */
  solid(band: number, cx: number, cz: number, verts: number[], tris: number[], r: number, g: number, bl: number): void {
    const c = this.ch(cx, cz);
    const o = c.pos.length / 3;
    for (let i = 0; i < verts.length; i += 8) {
      c.pos.push(verts[i], verts[i + 1], verts[i + 2]);
      c.nrm.push(verts[i + 3], verts[i + 4], verts[i + 5]);
      c.uv.push(verts[i + 6], vBand(band, verts[i + 7]));
      c.col.push(r, g, bl);
      c.hgt.push(0);
    }
    for (const t of tris) c.idx.push(o + t);
    this.triangles += tris.length / 3;
  }

  /** build the meshes */
  finish(mat: THREE.Material, depth: THREE.Material, castShadow: boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [k, c] of this.chunks) {
      if (!c.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3));
      g.setAttribute('aH', new THREE.Float32BufferAttribute(c.hgt, 1));
      g.setIndex(c.pos.length / 3 > 65000 ? new THREE.Uint32BufferAttribute(c.idx, 1) : new THREE.Uint16BufferAttribute(c.idx, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = 'land-rows';
      m.castShadow = castShadow && k < 2;
      m.receiveShadow = true;
      m.customDepthMaterial = depth as THREE.MeshDepthMaterial;
      m.matrixAutoUpdate = false;
      out.push(m);
    }
    this.chunks.clear();
    return out;
  }
}

/** plant strips sway and sink into the ground far away; alpha threshold eases with the mip so rows don't thin out */
export function rowMaterial(atlas: THREE.Texture, uniforms: Record<string, THREE.IUniform>, fog: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.92, metalness: 0, fog, side: THREE.DoubleSide, alphaTest: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aH;
uniform float uTime;
uniform vec2 uWind;
${WIND_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
if (aH > 0.0) {
  float d = distance(position.xz, cameraPosition.xz);
  transformed.y -= aH * smoothstep(1050.0, 1350.0, d);
  transformed.xz += thWindAt(position.xz) * aH * 0.05 * (1.0 + 0.35 * sin(uTime * 1.9 + dot(position.xz, vec2(0.6, 0.8))));
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <alphatest_fragment>',
        // a distant strip's coverage falls with the mip chain: ease the threshold with the footprint
        `{ vec2 tx = vec2(dFdx(vMapUv.x), dFdy(vMapUv.x)) * ${BW.toFixed(1)};
  float fpx = dot(tx, tx);
  if (diffuseColor.a < 0.5 - 0.34 * smoothstep(1.0, 30.0, fpx)) discard; diffuseColor.a = 1.0; }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
normal *= faceDirection;
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'th-landrows-v1';
  return mat;
}

export function rowDepthMaterial(atlas: THREE.Texture): THREE.MeshDepthMaterial {
  const d = new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.4, side: THREE.DoubleSide });
  d.customProgramCacheKey = () => 'th-landrows-depth-v1';
  return d;
}
