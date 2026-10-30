// St Mary's from inside (`?noherochurch`: the old furnished nave): a tower porch through open oak doors, a nave of pale
// ashlar under an arch-braced timber roof, stained-glass saints that throw their colours across the flags and pews as the
// sun comes round, a chancel behind a pointed arch with choir stalls, encaustic tiles, a star-painted ceiling and an
// altar under the apse windows, a west gallery with the organ. Near-only (landmarks/rooms.ts).

import * as THREE from 'three';
import { M, Mat, PAT } from './builder';
import { pointedPoints, V3 } from './kit';
import { Hole, RP, Room, Rooms } from './rooms';
import type { Env } from './env';
import type { AtlasRect } from './signs';
import { drawText } from './signs';

export interface ChurchDims {
  NW: number;
  nz0: number;
  nz1: number;
  eave: number;
  ridge: number;
  nBays: number;
  CW: number;
  cz0: number;
  cz1: number;
  az: number;
  cEave: number;
  cRidge: number;
  TW: number;
  tz0: number;
  tz1: number;
  apse: [number, number][];
  cx: number;
  cz: number;
  yaw: number;
  fp: { x0: number; z0: number; x1: number; z1: number };
}

// ─────────────────────────────────────────────────────── stained glass ──
interface Saint {
  ground: string;
  ground2: string;
  robe: string;
  mantle: string;
  name: string;
  attr: 'book' | 'staff' | 'lily' | 'key' | 'ship' | 'wheel' | 'lamb' | 'tower';
}

const SAINTS: Saint[] = [
  { ground: '#143d9e', ground2: '#0d2b78', robe: '#b01c22', mantle: '#f4e9c2', name: 'S MARIA', attr: 'lily' },
  { ground: '#8e1218', ground2: '#6d0d14', robe: '#1d5e3a', mantle: '#e6c13c', name: 'S PETRVS', attr: 'key' },
  { ground: '#1b6d48', ground2: '#124f35', robe: '#3250b8', mantle: '#e8dcb8', name: 'S NICOLAS', attr: 'ship' },
  { ground: '#143d9e', ground2: '#0d2b78', robe: '#d68a1e', mantle: '#8f1c52', name: 'S IOANNES', attr: 'lamb' },
  { ground: '#8e1218', ground2: '#6d0d14', robe: '#e7dfc4', mantle: '#2a56b0', name: 'S BARBARA', attr: 'tower' },
  { ground: '#5a1c86', ground2: '#42146a', robe: '#c9a21c', mantle: '#b01c22', name: 'S CATHARINA', attr: 'wheel' },
  { ground: '#143d9e', ground2: '#0d2b78', robe: '#2d7a4e', mantle: '#d94f24', name: 'S PAVLVS', attr: 'book' },
  { ground: '#1b6d48', ground2: '#124f35', robe: '#7a2a8f', mantle: '#ead9a4', name: 'S IACOBVS', attr: 'staff' },
];

function rngOf(seed: number): () => number {
  let h = (seed * 2654435761) >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
}

function archPath(g: CanvasRenderingContext2D, W: number, H: number, rise: number): void {
  // pointed-arch outline in pixels: rise = fraction of the height
  const pts = pointedPoints(W, H, H * rise, 10);
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const px = W / 2 + x,
      py = H - y;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.closePath();
}

/** hand-blown glass: uneven streaks, some panes paler */
function blown(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.03 + rnd() * 0.09})` : `rgba(0,0,0,${0.03 + rnd() * 0.12})`;
    const ww = w * (0.1 + rnd() * 0.5),
      hh = h * (0.02 + rnd() * 0.12);
    g.fillRect(x + rnd() * (w - ww), y + rnd() * (h - hh), ww, hh);
  }
}

function leadBox(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.strokeStyle = 'rgba(8,8,10,0.92)';
  g.lineWidth = 1.6;
  g.strokeRect(x, y, w, h);
}

/** one lancet: border, canopy with pinnacles, a saint on a diapered ground, a scroll, a small plinth panel with quarries */
function drawLancet(g: CanvasRenderingContext2D, W: number, H: number, s: Saint, seed: number, rise: number): void {
  const rnd = rngOf(seed + 1);
  g.clearRect(0, 0, W, H);
  g.save();
  archPath(g, W, H, rise);
  g.clip();
  // quarry ground (the whole light), plain pale diamonds
  g.fillStyle = '#c4c8a6';
  g.fillRect(0, 0, W, H);
  const b = Math.round(W * 0.1); // border strip
  const fx = b,
    fw = W - 2 * b;
  // field
  const canopyY = H * rise * 0.62;
  const baseY = H * 0.86;
  const gr = g.createLinearGradient(0, canopyY, 0, baseY);
  gr.addColorStop(0, s.ground);
  gr.addColorStop(1, s.ground2);
  g.fillStyle = gr;
  g.fillRect(fx, 0, fw, baseY);
  // diaper: lozenges on the ground
  const dz = fw / 5;
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 1;
  for (let y = -H; y < baseY; y += dz) {
    g.beginPath();
    g.moveTo(fx, y);
    g.lineTo(fx + fw, y + fw);
    g.moveTo(fx + fw, y);
    g.lineTo(fx, y + fw);
    g.stroke();
  }
  blown(g, fx, 0, fw, baseY, rnd, 90);
  // border: ruby / blue / gold pieces with white pearls
  const pieces = Math.round(H / (b * 1.5));
  for (const bx of [0, W - b]) {
    for (let i = 0; i < pieces; i++) {
      const y = (i / pieces) * H,
        h = H / pieces;
      const k = (i + (bx ? 1 : 0)) % 3;
      g.fillStyle = k === 0 ? '#9c1420' : k === 1 ? '#1a3fa8' : '#d3a220';
      g.fillRect(bx, y, b, h);
      blown(g, bx, y, b, h, rnd, 3);
      g.fillStyle = 'rgba(245,240,215,0.9)';
      g.beginPath();
      g.arc(bx + b / 2, y + h / 2, b * 0.14, 0, Math.PI * 2);
      g.fill();
      leadBox(g, bx, y, b, h);
    }
  }
  // canopy: yellow-stained niche with a cusped arch and three pinnacles over the head
  const cy = canopyY + H * 0.06;
  const cTop = canopyY * 0.22;
  g.fillStyle = '#e9c953';
  g.fillRect(fx, cTop, fw, cy - cTop);
  blown(g, fx, cTop, fw, cy - cTop, rnd, 26);
  for (const k of [0.18, 0.5, 0.82]) {
    const px = fx + fw * k;
    g.fillStyle = '#f6efc8';
    g.beginPath();
    g.moveTo(px - fw * 0.08, cy - H * 0.01);
    g.lineTo(px, cTop - H * 0.02);
    g.lineTo(px + fw * 0.08, cy - H * 0.01);
    g.fill();
    g.strokeStyle = 'rgba(70,45,10,0.9)';
    g.lineWidth = 1.2;
    g.stroke();
  }
  // the niche's arch
  g.fillStyle = s.ground;
  g.beginPath();
  g.moveTo(fx + fw * 0.08, cy + H * 0.05);
  g.quadraticCurveTo(fx + fw * 0.1, cy - H * 0.03, fx + fw * 0.5, cy - H * 0.07);
  g.quadraticCurveTo(fx + fw * 0.9, cy - H * 0.03, fx + fw * 0.92, cy + H * 0.05);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(8,8,10,0.9)';
  g.lineWidth = 2;
  g.stroke();
  // ── the figure
  const cx = fx + fw / 2;
  const headY = cy + H * 0.045;
  const headR = fw * 0.13;
  const footY = baseY - H * 0.015;
  // halo
  g.fillStyle = '#efc83c';
  g.beginPath();
  g.arc(cx, headY, headR * 1.9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(8,8,10,0.92)';
  g.lineWidth = 1.5;
  g.stroke();
  // robe: a long tapering column of colour with folds
  const shoulder = fw * 0.25,
    hem = fw * 0.36;
  g.fillStyle = s.robe;
  g.beginPath();
  g.moveTo(cx - shoulder * 0.8, headY + headR * 1.3);
  g.quadraticCurveTo(cx - hem * 0.9, (headY + footY) * 0.55, cx - hem, footY);
  g.lineTo(cx + hem, footY);
  g.quadraticCurveTo(cx + hem * 0.9, (headY + footY) * 0.55, cx + shoulder * 0.8, headY + headR * 1.3);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(8,8,10,0.92)';
  g.stroke();
  // folds
  g.strokeStyle = 'rgba(10,10,20,0.55)';
  g.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    const fxx = cx + i * hem * 0.3;
    g.moveTo(cx + i * shoulder * 0.28, headY + headR * 2.2);
    g.quadraticCurveTo(fxx + 3 * rnd(), (headY + footY) / 2, fxx, footY);
    g.stroke();
  }
  // mantle across the body
  g.fillStyle = s.mantle;
  g.beginPath();
  g.moveTo(cx - shoulder * 0.85, headY + headR * 1.4);
  g.lineTo(cx + shoulder * 0.55, headY + headR * 1.4);
  g.quadraticCurveTo(cx + hem * 0.75, (headY + footY) * 0.55, cx + hem * 0.45, footY - H * 0.1);
  g.quadraticCurveTo(cx - hem * 0.2, footY - H * 0.16, cx - hem * 0.72, (headY + footY) * 0.56);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(8,8,10,0.92)';
  g.lineWidth = 1.4;
  g.stroke();
  blown(g, cx - hem, headY + headR, hem * 2, footY - headY - headR, rnd, 26);
  // the pieces of glass the robe is cut from, a jewelled hem and collar
  g.strokeStyle = 'rgba(8,8,10,0.85)';
  g.lineWidth = 1.3;
  for (let i = 1; i < 6; i++) {
    const yy = headY + headR * 2 + (i / 6) * (footY - headY - headR * 2);
    const hw = shoulder + (hem - shoulder) * (i / 6);
    g.beginPath();
    g.moveTo(cx - hw, yy + (i % 2 ? 6 : -4));
    g.quadraticCurveTo(cx, yy + (i % 2 ? -8 : 8), cx + hw, yy + (i % 2 ? -3 : 6));
    g.stroke();
  }
  g.fillStyle = '#efc83c';
  g.fillRect(cx - hem, footY - H * 0.012, hem * 2, H * 0.012);
  g.fillStyle = '#f7f2dc';
  for (let x = cx - hem + 3; x < cx + hem; x += 7) g.fillRect(x, footY - H * 0.009, 2.4, H * 0.006);
  g.fillStyle = '#efc83c';
  g.beginPath();
  g.ellipse(cx, headY + headR * 1.35, headR * 0.95, headR * 0.28, 0, 0, Math.PI * 2);
  g.fill();
  // head, hair
  g.fillStyle = '#efdcc0';
  g.beginPath();
  g.arc(cx, headY, headR, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(8,8,10,0.92)';
  g.stroke();
  g.fillStyle = 'rgba(60,35,20,0.78)';
  g.beginPath();
  g.arc(cx, headY - headR * 0.25, headR * 0.98, Math.PI, 0);
  g.fill();
  g.fillStyle = 'rgba(30,20,12,0.85)';
  g.fillRect(cx - headR * 0.42, headY - headR * 0.05, headR * 0.26, 1.4);
  g.fillRect(cx + headR * 0.16, headY - headR * 0.05, headR * 0.26, 1.4);
  g.fillRect(cx - headR * 0.04, headY + headR * 0.02, 1.2, headR * 0.34);
  g.fillRect(cx - headR * 0.2, headY + headR * 0.48, headR * 0.4, 1.2);
  // hand + attribute
  const hy = (headY + footY) * 0.52;
  g.fillStyle = '#efdcc0';
  g.beginPath();
  g.arc(cx + fw * 0.17, hy, fw * 0.05, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(8,8,10,0.92)';
  g.stroke();
  g.lineWidth = 2.2;
  const ax = cx + fw * 0.2;
  switch (s.attr) {
    case 'lily':
      g.strokeStyle = '#3f8a42';
      g.beginPath();
      g.moveTo(ax, hy + H * 0.05);
      g.lineTo(ax, hy - H * 0.13);
      g.stroke();
      g.fillStyle = '#f7f4e4';
      for (const d of [0, 0.05, 0.1]) {
        g.beginPath();
        g.arc(ax + (d === 0.05 ? fw * 0.05 : -fw * 0.03), hy - H * (0.05 + d), fw * 0.06, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(8,8,10,0.8)';
        g.lineWidth = 1;
        g.stroke();
      }
      break;
    case 'key':
      g.strokeStyle = '#efc83c';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ax, hy + H * 0.04);
      g.lineTo(ax, hy - H * 0.1);
      g.stroke();
      g.beginPath();
      g.arc(ax, hy - H * 0.12, fw * 0.05, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#efc83c';
      g.fillRect(ax, hy + H * 0.03, fw * 0.08, 3);
      break;
    case 'ship':
      g.fillStyle = '#7b4a25';
      g.beginPath();
      g.moveTo(ax - fw * 0.13, hy - H * 0.02);
      g.lineTo(ax + fw * 0.13, hy - H * 0.02);
      g.lineTo(ax + fw * 0.08, hy + H * 0.012);
      g.lineTo(ax - fw * 0.08, hy + H * 0.012);
      g.fill();
      g.fillStyle = '#f6efc8';
      g.beginPath();
      g.moveTo(ax, hy - H * 0.09);
      g.lineTo(ax + fw * 0.09, hy - H * 0.03);
      g.lineTo(ax, hy - H * 0.03);
      g.fill();
      break;
    case 'lamb':
      g.fillStyle = '#f7f4e4';
      g.beginPath();
      g.ellipse(ax, hy - H * 0.015, fw * 0.11, fw * 0.075, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(ax + fw * 0.1, hy - H * 0.03, fw * 0.04, 0, Math.PI * 2);
      g.fill();
      break;
    case 'tower':
      g.fillStyle = '#c6b382';
      g.fillRect(ax - fw * 0.06, hy - H * 0.1, fw * 0.12, H * 0.12);
      g.strokeStyle = 'rgba(8,8,10,0.9)';
      g.lineWidth = 1;
      g.strokeRect(ax - fw * 0.06, hy - H * 0.1, fw * 0.12, H * 0.12);
      g.fillStyle = '#143d9e';
      g.fillRect(ax - fw * 0.02, hy - H * 0.08, fw * 0.04, H * 0.03);
      break;
    case 'wheel':
      g.strokeStyle = '#efc83c';
      g.lineWidth = 2.4;
      g.beginPath();
      g.arc(ax, hy - H * 0.01, fw * 0.11, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        g.beginPath();
        g.moveTo(ax - Math.cos(a) * fw * 0.11, hy - H * 0.01 - Math.sin(a) * fw * 0.11);
        g.lineTo(ax + Math.cos(a) * fw * 0.11, hy - H * 0.01 + Math.sin(a) * fw * 0.11);
        g.stroke();
      }
      break;
    case 'book':
      g.fillStyle = '#8f1c1c';
      g.fillRect(ax - fw * 0.08, hy - H * 0.035, fw * 0.16, H * 0.05);
      g.strokeStyle = '#efc83c';
      g.lineWidth = 1.3;
      g.strokeRect(ax - fw * 0.07, hy - H * 0.03, fw * 0.14, H * 0.04);
      break;
    default:
      g.strokeStyle = '#a97a3a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ax, footY);
      g.lineTo(ax, hy - H * 0.12);
      g.stroke();
      g.fillStyle = '#f5eccd';
      g.beginPath();
      g.arc(ax, hy - H * 0.1, fw * 0.04, 0, Math.PI * 2);
      g.fill();
  }
  // scroll with the name
  const sy = baseY + H * 0.004;
  g.fillStyle = '#f2ecd2';
  g.fillRect(fx, sy, fw, H * 0.03);
  drawText(g, s.name, fx + fw / 2, sy + H * 0.016, `bold ${Math.round(H * 0.016)}px Georgia, serif`, '#2a1a10', 0.5);
  leadBox(g, fx, sy, fw, H * 0.03);
  // quarries below: diamonds with a little yellow-stain flower in each second
  const qy = sy + H * 0.03;
  const qw = fw / 4;
  g.strokeStyle = 'rgba(8,8,10,0.85)';
  g.lineWidth = 1.2;
  for (let y = qy - qw; y < H; y += qw) {
    g.beginPath();
    g.moveTo(fx, y);
    g.lineTo(fx + fw, y + fw);
    g.moveTo(fx + fw, y);
    g.lineTo(fx, y + fw);
    g.stroke();
  }
  g.fillStyle = 'rgba(214,170,50,0.75)';
  for (let j = 0; j * qw < H - qy; j++)
    for (let i = 0; i < 4; i++) if ((i + j) % 2 === 0) g.fillRect(fx + i * qw + qw * 0.4, qy + j * qw + qw * 0.35, qw * 0.2, qw * 0.2);
  // lead: saddle bars across the light, a tracery rim following the arch
  g.strokeStyle = 'rgba(6,6,8,0.95)';
  g.lineWidth = 2.4;
  for (let i = 1; i < 7; i++) {
    const y = (i / 7) * H;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  g.restore();
  archPath(g, W, H, rise);
  g.strokeStyle = 'rgba(6,6,8,1)';
  g.lineWidth = 3;
  g.stroke();
  g.globalCompositeOperation = 'destination-in';
  archPath(g, W, H, rise);
  g.fillStyle = '#000';
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

function drawRose(g: CanvasRenderingContext2D, W: number, seed: number): void {
  const rnd = rngOf(seed);
  const R = W / 2 - 1;
  g.clearRect(0, 0, W, W);
  g.save();
  g.translate(W / 2, W / 2);
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.clip();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2,
      a1 = ((i + 1) / n) * Math.PI * 2;
    g.fillStyle = i % 2 ? '#123a9c' : '#a11622';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, a0, a1);
    g.closePath();
    g.fill();
    g.fillStyle = i % 2 ? '#e0b92c' : '#1b6d48';
    g.beginPath();
    g.arc(Math.cos((a0 + a1) / 2) * R * 0.66, Math.sin((a0 + a1) / 2) * R * 0.66, R * 0.15, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(6,6,8,1)';
    g.lineWidth = 2;
    g.stroke();
    g.beginPath();
    g.moveTo(Math.cos(a0) * R * 0.28, Math.sin(a0) * R * 0.28);
    g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    g.stroke();
  }
  blown(g, -R, -R, 2 * R, 2 * R, rnd, 70);
  g.fillStyle = '#f2d04a';
  g.beginPath();
  g.arc(0, 0, R * 0.28, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(6,6,8,1)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#b01c22';
  g.beginPath();
  g.arc(0, 0, R * 0.12, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(0, 0, R * 0.98, 0, Math.PI * 2);
  g.lineWidth = 4;
  g.stroke();
  g.restore();
}

// ─────────────────────────────────────────────────────── the room ──
export function buildChurchRoom(env: Env, rooms: Rooms, d: ChurchDims): Room {
  const room = rooms.add(new Room('church', 2048, 1536));
  room.frame(d.cx, d.cz, d.yaw);
  room.near = 34;
  room.bounds = { ...d.fp };
  const K = room.K;
  const { NW, nz0, nz1, eave, ridge, nBays, CW, cz0, cz1, az, cEave, cRidge, TW, tz0, tz1 } = d;
  const IX = NW - 0.61; // inner face of the nave walls
  const NZ0 = nz0 + 0.59; // inner face of the north gable
  const NZ1 = nz1 - 0.01; // inner face of the south gable (spans nz1..nz1 + 0.6)
  const nL = nz1 - nz0;
  const bayW = nL / nBays;
  const CIX = CW - 0.61;

  // ── glass atlas: row of equal cells (8 nave, then chancel / apse / gable cells), rose below
  const CW_PX = 160,
    CH_PX = 640;
  const rise = 1.0 / 5.4;
  const cells: AtlasRect[] = [];
  for (let i = 0; i < 12; i++) {
    const sa = SAINTS[i % SAINTS.length];
    cells.push(room.atlas.add(CW_PX, CH_PX, (g, w, h) => drawLancet(g, w, h, sa, i * 7 + 3, i < 8 ? rise : 0.2)));
  }
  room.cellStride = (CW_PX + 2) / room.atlas.W;
  room.cellW = CW_PX / room.atlas.W;
  room.cellH = CH_PX / room.atlas.H;
  room.cellV0 = cells[0].v0;
  const roseCell = room.atlas.add(256, 256, (g, w) => drawRose(g, w, 11));
  room.row = { X: IX + 0.28, z0: nz0 + bayW * 0.5, period: bayW, count: nBays, w: 1.35, y0: 2.4, h: 5.4 };
  room.zone = [NZ0 - 0.1, NZ1 + 0.1, -IX - 0.1, IX + 0.1];

  // ── materials
  const ash = M('#cfc3a8', PAT.STONE, 0.9, 0, 0, 0, 0.3);
  const ashD = M('#bfb195', PAT.PLAIN, 0.9);
  const dress = M('#ddd2b8', PAT.PLAIN, 0.85);
  const lime = M('#e4dcc6', RP.PLASTER, 0.95);
  const flags = M('#a79c86', RP.FLAGS, 0.8, 0, 0, 0, 0.2);
  const oak = M('#6d4726', RP.OAK, 0.6);
  const oakD = M('#3f2815', RP.OAK, 0.6, 0, 0, 0, 0.4);
  const roofOak = M('#4d3219', RP.OAK, 0.8, 0, 0, 0, 0.7);
  const boards = M('#6a4a2b', PAT.PLANKS, 0.85, 0, 0, 0, 0.7);
  const ruby = M('#8a1a22', PAT.PLAIN, 0.95);
  const gilt = M('#d9ad4a', RP.BRASS, 0.3, 1);
  const brass = M('#c79c48', RP.BRASS, 0.25, 1);
  const iron = M('#1c1a18', PAT.PLAIN, 0.6, 0.5);
  const linen = M('#efe9db', PAT.PLAIN, 0.9);
  const marble = M('#ddd6c8', RP.MARBLE, 0.3);
  const glass = M('#ffffff', RP.GLASS, 0.3);
  const flame = (seed: number) => M('#ffb15a', RP.EMIT, 0, 0, 7, 0, 0.5 + seed * 0.49);
  const wax = M('#f3ecd8', PAT.PLAIN, 0.7);

  // ── floors
  const yF = 0.03;
  room.grid(flags, (u, v) => [u, yF, v], -IX, IX, NZ0, NZ1, 0.45, 0.45, true);

  // ── nave walls: dressed lining with splayed window reveals
  const lancet = pointedPoints(1.35, 5.4, 1.0, 6);
  for (const s of [-1, 1]) {
    const holes: Hole[] = [];
    for (let i = 0; i < nBays; i++) holes.push({ u: nz0 + bayW * (i + 0.5), pts: pointedPoints(1.35 + 0.5, 5.4 + 0.3, 1.1, 6), v0: 2.4 - 0.05 });
    const plane = (u: number, v: number): V3 => [s * IX, v, u];
    room.wall(ash, plane, NZ0, NZ1, 0, eave - 0.1, holes, 0.5, 0.35, s < 0);
    for (let i = 0; i < nBays; i++) {
      const zc = nz0 + bayW * (i + 0.5);
      const X = (depth: number) => s * (IX + depth);
      const h: Hole = { u: zc, pts: lancet, v0: 2.4 };
      // the splay: from the wider opening in the lining to the glass, 0.28 m back
      const inner: Hole = { u: zc, pts: pointedPoints(1.85, 5.7, 1.1, 6), v0: 2.35 };
      const P = (u: number, v: number, dep: number): V3 => [X(dep), v, u];
      splay(room, dress, P, inner, h, 0.28, s < 0);
      const cell = cells[i + (s > 0 ? 0 : nBays)];
      room.pane(glass, (u, v) => [X(0.28), v, u], h, cell, s < 0);
      // tracery: a central mullion and the moulded sill
      K.box(dress, 0.16, 0.08, 2.1, s * (IX + 0.0), 2.28, zc);
      K.box(ashD, 0.12, 0.3, 1.9, s * (IX - 0.04), 2.0, zc);
      // sky-bake + shafts
      room.wins.push({ x: X(0.28), y: 5.1, z: zc, nx: -s, nz: 0, area: 7.0, trans: 0.42 });
      if (env.ctx.quality.level === 'high') room.addShafts([X(0.28), 2.4, zc - 0.67], [X(0.28), 2.4, zc + 0.67], [X(0.28), 7.8, zc - 0.67], [s, 0, 0], cell, 4);
      else room.addShafts([X(0.28), 2.4, zc - 0.67], [X(0.28), 2.4, zc + 0.67], [X(0.28), 7.8, zc - 0.67], [s, 0, 0], cell, 2);
    }
    // dado of oak panels below the sills with a capping rail, with a stone plinth
    room.grid(oakD, (u, v) => [s * (IX - 0.05), v, u], NZ0, NZ1 - 0.02, 0.05, 1.25, 1.0, 0.6, s < 0);
    K.box(oak, 0.08, 0.06, NZ1 - NZ0, s * (IX - 0.06), 1.25, (NZ0 + NZ1) / 2);
    K.box(ashD, 0.08, 0.12, NZ1 - NZ0, s * (IX - 0.05), 0.03, (NZ0 + NZ1) / 2);
    for (let z = NZ0 + 0.3; z < NZ1 - 0.2; z += 0.62) {
      K.box(oak, 0.03, 1.1, 0.05, s * (IX - 0.08), 0.12, z);
      K.box(oak, 0.025, 0.05, 0.55, s * (IX - 0.075), 0.7, z + 0.31);
    }
    // string course at sill level + wall plate
    K.box(dress, 0.1, 0.1, NZ1 - NZ0, s * (IX - 0.05), 2.12, (NZ0 + NZ1) / 2);
    K.box(roofOak, 0.34, 0.3, NZ1 - NZ0, s * (IX - 0.14), eave - 0.45, (NZ0 + NZ1) / 2);
  }

  // ── north wall with the chancel arch and the rose above it; south wall with the door and two small lancets
  const yEav = eave - 0.1;
  const yRid = ridge - 0.72;
  const gableClip = (v: number): [number, number] => {
    if (v <= yEav) return [-IX, IX];
    const t = Math.min(1, (v - yEav) / (yRid - yEav));
    return [-IX * (1 - t) + 1e-3, IX * (1 - t) - 1e-3];
  };
  const archW = 5.0,
    archH = 7.2,
    archR = 3.0;
  const archPts = pointedPoints(archW, archH, archR, 8);
  const roseR = 0.8;
  const roseY = 9.8;
  const rosePts: [number, number][] = [];
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (i / 20) * Math.PI * 2;
    rosePts.push([Math.cos(a) * (roseR + 0.2), roseR + 0.2 + Math.sin(a) * (roseR + 0.2)]);
  }
  room.wall(ash, (u, v) => [u, v, NZ0], -IX, IX, 0, yRid, [{ u: 0, pts: archPts, v0: 0 }, { u: 0, pts: rosePts, v0: roseY - 0.2 }], 0.5, 0.35, false, gableClip);
  {
    const P = (u: number, v: number, dep: number): V3 => [u, v, NZ0 - dep];
    splay(room, ash, P, { u: 0, pts: archPts, v0: 0 }, { u: 0, pts: archPts, v0: 0 }, 0.6, true);
    // chamfered arch orders: two rolls following the arch on the nave side
    for (const [g, depth, r] of [
      [-0.12, 0.05, 0.075],
      [-0.26, 0.2, 0.06],
    ] as [number, number, number][]) {
      const pts = pointedPoints(archW + 2 * g, archH + g, archR + g, 10);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          b = pts[i];
        K.rod(dress, [a[0], a[1], NZ0 - depth], [b[0], b[1], NZ0 - depth], r, 6);
      }
    }
    const roseH: Hole = { u: 0, pts: rosePts.map(([x, y]) => [x * 0.8, y * 0.8] as [number, number]), v0: roseY };
    splay(room, dress, P, { u: 0, pts: rosePts, v0: roseY - 0.2 }, roseH, 0.28, true);
    room.pane(glass, (u, v) => [u, v, NZ0 - 0.28], roseH, roseCell, false);
    room.wins.push({ x: 0, y: roseY + 0.8, z: NZ0 - 0.2, nx: 0, nz: 1, area: 2.0, trans: 0.4 });
  }
  // south wall
  const doorPts = pointedPoints(2.1, 3.6, 1.2, 6);
  const gabL = pointedPoints(0.8, 3.0, 0.6, 5);
  const southHoles: Hole[] = [
    { u: 0, pts: doorPts, v0: 0 },
    { u: -(NW - 1.2), pts: pointedPoints(1.1, 3.15, 0.65, 5), v0: 2.55 },
    { u: NW - 1.2, pts: pointedPoints(1.1, 3.15, 0.65, 5), v0: 2.55 },
  ];
  room.wall(ash, (u, v) => [u, v, NZ1], -IX, IX, 0, yRid, southHoles, 0.5, 0.35, true, gableClip);
  for (const sg of [-1, 1]) {
    const h: Hole = { u: sg * (NW - 1.2), pts: gabL, v0: 2.6 };
    const P = (u: number, v: number, dep: number): V3 => [u, v, NZ1 + dep];
    splay(room, dress, P, { u: sg * (NW - 1.2), pts: pointedPoints(1.1, 3.15, 0.65, 5), v0: 2.55 }, h, 0.3, false);
    room.pane(glass, (u, v) => [u, v, NZ1 + 0.3], h, cells[sg > 0 ? 10 : 11], true);
    room.wins.push({ x: sg * (NW - 1.2), y: 4.1, z: NZ1 + 0.3, nx: 0, nz: -1, area: 2.2, trans: 0.4 });
  }
  {
    const P = (u: number, v: number, dep: number): V3 => [u, v, NZ1 + dep];
    splay(room, dress, P, { u: 0, pts: doorPts, v0: 0 }, { u: 0, pts: doorPts, v0: 0 }, 0.72, false);
  }

  // ── the roof: arch-braced trusses on stone corbels, purlins, common rafters and boarding
  const IXr = IX - 0.02;
  const slope = (x: number) => yEav + (1 - Math.abs(x) / IXr) * (yRid - yEav);
  for (const sx of [-1, 1]) {
    room.grid(
      boards,
      (u, v) => [sx * IXr * (1 - v), yEav + v * (yRid - yEav), u],
      NZ0,
      NZ1,
      0,
      1,
      1.0,
      0.14,
      sx < 0,
    );
    // common rafters
    for (let z = NZ0 + 0.25; z < NZ1; z += 0.55) K.beam(roofOak, [sx * IXr, yEav - 0.02, z], [0, yRid - 0.03, z], 0.09, 0.09);
    // purlins
    for (const t of [0.3, 0.62]) K.box(roofOak, 0.18, 0.2, NZ1 - NZ0, sx * IXr * (1 - t) * 0.985, yEav + t * (yRid - yEav) - 0.17, (NZ0 + NZ1) / 2);
  }
  K.box(roofOak, 0.14, 0.26, NZ1 - NZ0, 0, yRid - 0.28, (NZ0 + NZ1) / 2);
  const yCol = yEav + 0.62 * (yRid - yEav); // collar height
  const xCol = IXr * (1 - 0.62);
  for (let i = 0; i <= nBays; i++) {
    const z = i === 0 ? NZ0 + 0.28 : i === nBays ? NZ1 - 0.28 : nz0 + bayW * i;
    // principal rafters, collar, king post + struts
    for (const sx of [-1, 1]) {
      K.beam(oakD, [sx * IXr, yEav - 0.15, z], [0, yRid - 0.05, z], 0.2, 0.26);
      // wall post on a corbel
      K.box(oakD, 0.2, yEav - 6.1, 0.26, sx * (IX - 0.12), 6.1, z);
      K.box(ash, 0.34, 0.2, 0.44, sx * (IX - 0.12), 5.92, z);
      K.box(dress, 0.26, 0.14, 0.36, sx * (IX - 0.08), 5.78, z);
      K.lathe(dress, [[0.13, 0], [0.05, -0.28], [0.0, -0.32]], sx * (IX - 0.1), 5.78, z, 8);
      // arched brace: wall post foot → collar centre, a curved rib of short beams
      const n = 12;
      let px = sx * (IX - 0.14),
        py = 6.2;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const ang = (t * Math.PI) / 2;
        const qx = sx * (xCol + (IX - 0.14 - xCol) * Math.cos(ang));
        const qy = 6.2 + (yCol - 0.16 - 6.2) * Math.sin(ang);
        K.beam(oak, [px, py, z], [qx, qy, z], 0.17, 0.2);
        px = qx;
        py = qy;
      }
      // spandrel struts
      K.beam(oakD, [sx * (IX - 0.4), yEav - 0.4, z], [sx * (xCol + 0.5), yCol - 0.1, z], 0.08, 0.1);
    }
    K.box(oakD, 2 * xCol + 0.5, 0.26, 0.24, 0, yCol - 0.16, z);
    K.box(oakD, 0.16, yRid - yCol - 0.2, 0.16, 0, yCol + 0.05, z);
    K.sphere(gilt, 0.09, 0, yCol - 0.2, z, 8, 6);
  }
  void slope;

  // ── pews
  const aisle = 0.82;
  const pIn = aisle,
    pOut = IX - 0.72;
  const pL = pOut - pIn;
  const rows = 9;
  const pz0 = NZ0 + 2.15;
  const pStep = 0.93;
  const hym = [M('#7a1a1e', PAT.PLAIN, 0.7), M('#1f3550', PAT.PLAIN, 0.7), M('#2c4a2c', PAT.PLAIN, 0.7)];
  let bn = 0;
  for (let r = 0; r < rows; r++) {
    const z = pz0 + r * pStep;
    for (const sx of [-1, 1]) {
      const cx = sx * (pIn + pL / 2);
      K.box(oak, pL, 0.05, 0.42, cx, 0.43, z);
      K.box(oak, pL, 0.46, 0.04, cx, 0.5, z + 0.24);
      K.box(oakD, pL, 0.1, 0.03, cx, 0.46, z + 0.2);
      K.box(oak, pL, 0.05, 0.16, cx, 0.92, z + 0.31);
      // kneeler
      K.box(ruby, pL - 0.1, 0.07, 0.16, cx, yF + 0.04, z - 0.33);
      for (const e of [-0.5, 0.5]) {
        const ex = cx + e * pL;
        pewEnd(room, oakD, ex, z - 0.1 + 0.16, 0.66, 1.02);
      }
      // hymn books on the ledge, unevenly
      for (let k = 0; k < 4; k++) {
        bn++;
        if ((bn * 7) % 5 === 0) continue;
        const bx = cx + (k - 1.5) * (pL / 4.4) + ((bn * 13) % 7) * 0.012;
        K.box(hym[bn % 3], 0.13, 0.03, 0.09, bx, 0.97, z + 0.31, ((bn * 11) % 9) * 0.05);
      }
    }
  }
  // the runner up the aisle: red with a gold line, a fringe at the ends
  K.box(M('#7b1c20', PAT.PLAIN, 0.95), aisle * 2 - 0.5, 0.012, NZ1 - NZ0 - 1.3, 0, yF, (NZ0 + NZ1) / 2 + 0.55);
  for (const ex of [-1, 1]) K.box(M('#c49a3a', PAT.PLAIN, 0.8), 0.04, 0.003, NZ1 - NZ0 - 1.3, ex * (aisle - 0.3), yF + 0.012, (NZ0 + NZ1) / 2 + 0.55);
  room.block(-IX, pz0 - 0.5, -pIn + 0.04, pz0 + (rows - 1) * pStep + 0.42);
  room.block(pIn - 0.04, pz0 - 0.5, IX, pz0 + (rows - 1) * pStep + 0.42);

  // ── pulpit: stone hexagon on a stem, a curved stair; eagle lectern opposite
  const px = -(IX - 1.25),
    pz = NZ0 + 1.15;
  K.cyl(ashD, 0.22, 0.3, 1.1, px, yF, pz, 6);
  K.cyl(dress, 0.3, 0.72, 0.16, px, 1.1, pz, 6);
  K.cyl(ash, 0.74, 0.72, 1.1, px, 1.26, pz, 6);
  K.cyl(dress, 0.8, 0.8, 0.07, px, 2.36, pz, 6);
  K.box(ruby, 0.5, 0.03, 0.4, px + 0.5, 2.43, pz, 1.0);
  for (let i = 0; i < 6; i++) {
    const a = 1.2 + i * 0.22;
    K.box(ash, 0.6, 0.22 * (i + 1), 0.3, px + Math.cos(a) * 1.25, yF, pz + Math.sin(a) * 1.25, -a);
  }
  room.blockDisc(px, pz, 1.25);
  const lx = IX - 1.3;
  K.lathe(brass, [[0.3, 0], [0.26, 0.06], [0.08, 0.14], [0.05, 0.6], [0.09, 0.66], [0.05, 0.72], [0.045, 1.08], [0.1, 1.14], [0, 1.18]], lx, yF, pz, 12);
  // the eagle: a body and spread wings holding the book
  K.sphere(brass, 0.13, lx, 1.28, pz, 10, 8, 1.2);
  K.sphere(brass, 0.06, lx, 1.47, pz + 0.1, 8, 6);
  K.cone(brass, 0.025, 0.09, lx, 1.47, pz + 0.17, 6);
  for (const e of [-1, 1]) K.boxC(brass, 0.42, 0.03, 0.26, lx + e * 0.23, 1.33, pz - 0.02, 0.15, 0, e * -0.28);
  K.boxC(M('#6b1a1c', PAT.PLAIN, 0.7), 0.46, 0.05, 0.34, lx, 1.42, pz - 0.02, 0.28, 0, 0);
  room.blockDisc(lx, pz, 0.42);

  // ── chancel
  const yC = 0.18;
  const yS = 0.36;
  const enc = M('#8a6a42', RP.ENCAUSTIC, 0.5);
  const lime2 = M('#d9cfae', RP.PLASTER, 0.95, 0, 0, 0, 0.6);
  room.grid(enc, (u, v) => [u, yC, v], -CIX, CIX, az - 0.1, NZ0 - 0.6 + 0.02, 0.5, 0.5, true);
  // a stone step into the chancel, inside the arch
  K.box(dress, archW - 0.1, yC - yF, 0.62, 0, yF, NZ0 - 0.31);
  // chancel side walls
  const chH: Hole = { u: (az + cz1) / 2, pts: pointedPoints(1.1, 4.2, 0.8, 5), v0: 2.6 };
  const chHi: Hole = { u: (az + cz1) / 2, pts: pointedPoints(1.55, 4.45, 0.9, 5), v0: 2.55 };
  for (const s of [-1, 1]) {
    room.wall(lime2, (u, v) => [s * CIX, v, u], az, cz1 + 0.02, 0, cEave - 0.05, [chHi], 0.45, 0.35, s < 0);
    const P = (u: number, v: number, dep: number): V3 => [s * (CIX + dep), v, u];
    splay(room, dress, P, chHi, chH, 0.28, s < 0);
    room.pane(glass, (u, v) => [s * (CIX + 0.28), v, u], chH, cells[s > 0 ? 8 : 9], s < 0);
    room.wins.push({ x: s * (CIX + 0.28), y: 4.7, z: (az + cz1) / 2, nx: -s, nz: 0, area: 4.2, trans: 0.42 });
  }
  // apse: five flat faces inset from the outer polygon
  // offset each outer face inwards by the wall's thickness; the first and last corners sit on the chancel's walls
  const ap = offsetApse(d.apse, az, 0.62);
  for (let i = 0; i < ap.length - 1; i++) {
    const [ax, azz] = ap[i],
      [bx, bz] = ap[i + 1];
    const L = Math.hypot(bx - ax, bz - azz);
    const pl = (u: number, v: number): V3 => [ax + ((bx - ax) * u) / L, v, azz + ((bz - azz) * u) / L];
    const win = i === 1 || i === 2;
    const hi: Hole = { u: L / 2, pts: pointedPoints(1.4, 4.2, 0.85, 5), v0: 2.55 };
    room.wall(lime2, pl, 0, L, 0, cEave - 0.05, win ? [hi] : [], 0.45, 0.35, false);
    if (win) {
      const nx = bz - azz,
        nz = -(bx - ax);
      const nl = Math.hypot(nx, nz);
      const onx = nx / nl,
        onz = nz / nl;
      // outward: away from the apse centre
      const sgn = onx * ((ax + bx) / 2) + onz * ((azz + bz) / 2 - az) > 0 ? 1 : -1;
      const P = (u: number, v: number, dep: number): V3 => {
        const q = pl(u, v);
        return [q[0] + sgn * onx * dep, v, q[2] + sgn * onz * dep];
      };
      const h: Hole = { u: L / 2, pts: pointedPoints(1.0, 4.0, 0.75, 5), v0: 2.6 };
      splay(room, dress, P, hi, h, 0.26, true);
      room.pane(glass, (u, v) => P(u, v, 0.26), h, cells[i === 1 ? 0 : 3], false);
      const m = P(L / 2, 4.6, 0.26);
      room.wins.push({ x: m[0], y: 4.6, z: m[2], nx: -sgn * onx, nz: -sgn * onz, area: 3.6, trans: 0.42 });
    }
    // oak-panelled dado with a gilt line
    room.grid(oakD, (u, v) => {
      const q = pl(u, v);
      const mx = (ax + bx) / 2,
        mz = (azz + bz) / 2;
      const dl = Math.hypot(mx, mz - az) || 1;
      return [q[0] - (mx / dl) * 0.04, v, q[2] - ((mz - az) / dl) * 0.04];
    }, 0.02, L - 0.02, yC, 1.55, 0.8, 0.6, false);
  }
  // floor of the apse (sanctuary), raised another step
  room.grid(M('#d8cdb4', RP.ENCAUSTIC, 0.5, 0, 0, 0, 0.5), (u, v) => [u, yS, v], -CIX, CIX, cz0 + 0.5, az + 0.55, 0.45, 0.45, true);
  K.box(dress, CIX * 2, yS - yC, 0.04, 0, yC, az + 0.55);
  // chancel dado + gilt line along the straight walls
  for (const s of [-1, 1]) {
    room.grid(oakD, (u, v) => [s * (CIX - 0.04), v, u], az, cz1 - 0.1, yC, 1.55, 0.8, 0.6, s < 0);
    K.box(gilt, 0.02, 0.03, cz1 - az, s * (CIX - 0.05), 1.55, (az + cz1) / 2);
  }
  // star ceiling
  const yCe = cEave - 0.05,
    yCr = cRidge - 0.75;
  const stars = M('#1c2f6e', RP.STARS, 0.8);
  for (const sx of [-1, 1]) {
    room.grid(stars, (u, v) => [sx * CIX * (1 - v), yCe + v * (yCr - yCe), u], az, cz1 + 0.05, 0, 1, 0.8, 0.14, sx < 0);
    for (const z of [az + 0.02, (az + cz1) / 2, cz1 - 0.02]) K.beam(gilt, [sx * CIX, yCe, z], [0, yCr - 0.02, z], 0.05, 0.05);
    K.box(gilt, CIX * 2 + 0.05, 0.08, 0.05, 0, yCe - 0.05, cz1 + 0.01 - 0.01);
    K.box(M('#7a2020', PAT.PLAIN, 0.8), 0.04, 0.3, cz1 - az, sx * (CIX - 0.02), yCe - 0.34, (az + cz1) / 2);
  }
  for (let i = 0; i < ap.length - 1; i++) {
    const a = ap[i],
      b = ap[i + 1];
    K.poly(stars, [
      [a[0], yCe, a[1]],
      [0, yCr, az],
      [b[0], yCe, b[1]],
    ]);
    K.beam(gilt, [a[0], yCe, a[1]], [0, yCr, az], 0.05, 0.05);
  }

  // choir stalls: two rows each side, facing across, with carved ends; a brass chandelier
  for (const s of [-1, 1]) {
    for (const [ox, h, seat] of [
      [CIX - 0.45, 0.46, 0.5],
      [CIX - 1.1, 0.42, 0.42],
    ] as [number, number, number][]) {
      const y0 = ox > CIX - 0.5 ? yC + 0.14 : yC;
      if (ox > CIX - 0.5) K.box(oakD, 0.8, 0.14, cz1 - az - 0.4, s * ox, yC, (az + cz1) / 2 - 0.1);
      K.box(oak, seat, 0.05, cz1 - az - 0.5, s * ox, y0 + h, (az + cz1) / 2 - 0.1);
      K.box(oak, 0.04, 0.48, cz1 - az - 0.5, s * (ox + seat / 2), y0 + h, (az + cz1) / 2 - 0.1);
      K.box(oak, 0.2, 0.05, cz1 - az - 0.5, s * (ox - seat / 2 - 0.08), y0 + 0.85, (az + cz1) / 2 - 0.1);
      K.box(oakD, 0.03, 0.85, cz1 - az - 0.5, s * (ox - seat / 2 - 0.18), y0, (az + cz1) / 2 - 0.1);
      for (const zz of [az + 0.2, (az + cz1) / 2 - 0.1, cz1 - 0.4]) pewEndX(room, oakD, s * ox, zz, seat + 0.4, 1.2, y0);
    }
  }
  room.block(-CIX, az + 0.1, -CIX + 1.7, cz1 - 0.1);
  room.block(CIX - 1.7, az + 0.1, CIX, cz1 - 0.1);
  // communion rail across the top of the chancel
  for (const sx of [-1, 1]) {
    K.box(brass, 1.0, 0.04, 0.05, sx * 1.05, yC + 0.84, az + 0.75);
    for (let k = 0; k < 5; k++) K.cyl(brass, 0.016, 0.022, 0.84, sx * (0.62 + k * 0.22), yC, az + 0.75, 8);
  }
  room.block(-1.6, az + 0.72, -0.5, az + 0.78);
  room.block(0.5, az + 0.72, 1.6, az + 0.78);
  // altar: stone mensa, a frontal in red and gold, linen, six tall candlesticks, a gilt cross, flowers; a triptych behind
  const axz = az - 0.75;
  K.box(M('#d6ccb6', PAT.STONE, 0.8, 0, 0, 0, 0.4), 2.2, 0.95, 0.85, 0, yS, axz);
  K.box(linen, 2.34, 0.03, 0.98, 0, yS + 0.95, axz);
  K.box(linen, 2.34, 0.22, 0.02, 0, yS + 0.76, axz + 0.49);
  const frontal = room.atlas.add(256, 96, (g, w, h) => {
    g.fillStyle = '#7b1a22';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9b04a';
    g.lineWidth = 3;
    g.strokeRect(5, 5, w - 10, h - 10);
    for (let i = 0; i < 3; i++) {
      const x = w * (0.25 + i * 0.25);
      g.fillStyle = '#e8c35a';
      g.fillRect(x - 3, 22, 6, 52);
      g.fillRect(x - 15, 36, 30, 6);
    }
    for (let x = 12; x < w - 8; x += 12) {
      g.fillStyle = '#d9b04a';
      g.fillRect(x, h - 17, 6, 8);
    }
  });
  room.pic(frontal, 2.0, 0.72, 0, yS + 0.05, axz + 0.5, 0);
  const cross = (x: number, y: number, z: number, h: number) => {
    K.box(gilt, h * 0.07, h, h * 0.07, x, y, z);
    K.box(gilt, h * 0.5, h * 0.07, h * 0.07, x, y + h * 0.66, z);
    K.sphere(gilt, h * 0.06, x, y, z, 8, 6);
  };
  cross(0, yS + 1.05, axz - 0.25, 0.75);
  K.cyl(gilt, 0.14, 0.2, 0.08, 0, yS + 0.98, axz - 0.25, 12);
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const x = (i / 3) * 1.0;
    const y0 = yS + 0.98;
    const h = 0.32 + (3 - Math.abs(i)) * 0.06;
    K.lathe(brass, [[0.08, 0], [0.03, 0.04], [0.02, h * 0.45], [0.045, h * 0.5], [0.018, h * 0.55], [0.045, h], [0.0, h + 0.005]], x, y0, axz - 0.28, 10);
    K.cyl(wax, 0.02, 0.02, 0.26, x, y0 + h, axz - 0.28, 8);
    K.sphere(flame(i * 0.1 + 0.5), 0.016, x, y0 + h + 0.3, axz - 0.28, 6, 5, 1.8);
    room.halo(x, y0 + h + 0.3, axz - 0.28, 0.2, '#ffc77a', 0.5, true);
    room.lamps.push({ x, y: y0 + h + 0.3, z: axz - 0.28, k: 0.13, r: 2.2 });
  }
  // flowers either side of the altar
  for (const e of [-1, 1]) {
    const fx = e * 1.75;
    K.lathe(M('#c7b89a', PAT.PLAIN, 0.7), [[0.1, 0], [0.13, 0.05], [0.04, 0.45], [0.05, 0.8], [0.14, 0.92], [0.14, 1.0]], fx, yS, axz + 0.1, 12);
    for (let k = 0; k < 18; k++) {
      const a = k * 2.4,
        r = 0.05 + (k % 5) * 0.045,
        yy = yS + 1.05 + (k % 7) * 0.05;
      K.sphere(M(k % 3 === 0 ? '#f3e7c4' : k % 3 === 1 ? '#d8516a' : '#f2b23b', PAT.PLAIN, 0.8), 0.04, fx + Math.cos(a) * r, yy, axz + 0.1 + Math.sin(a) * r, 6, 5);
    }
    for (let k = 0; k < 8; k++) K.boxC(M('#3d6b34', PAT.PLAIN, 0.8), 0.03, 0.26, 0.012, fx + Math.cos(k * 1.3) * 0.09, yS + 1.0, axz + 0.1 + Math.sin(k * 1.3) * 0.09, Math.sin(k) * 0.5, k * 1.3, Math.cos(k) * 0.5);
  }
  room.block(-1.25, axz - 0.5, 1.25, axz + 0.55);
  room.blockDisc(-1.75, axz + 0.1, 0.32);
  room.blockDisc(1.75, axz + 0.1, 0.32);
  // triptych on the east wall behind the altar
  const trip = room.atlas.add(640, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#e2bb55');
    gr.addColorStop(1, '#a87c24');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const outline = (x: number, pw: number, top: number) => {
      g.beginPath();
      g.moveTo(x, h - 14);
      g.lineTo(x, top + pw * 0.55);
      g.quadraticCurveTo(x + pw * 0.05, top + pw * 0.12, x + pw / 2, top);
      g.quadraticCurveTo(x + pw * 0.95, top + pw * 0.12, x + pw, top + pw * 0.55);
      g.lineTo(x + pw, h - 14);
      g.closePath();
    };
    const panel = (x: number, pw: number, top: number, robe: string, mantle: string, big: boolean) => {
      // a pointed panel, gold-punched ground
      g.save();
      outline(x, pw, top);
      const sky = g.createLinearGradient(0, top, 0, h);
      sky.addColorStop(0, '#d4a63c');
      sky.addColorStop(1, '#b98a2a');
      g.fillStyle = sky;
      g.fill();
      g.clip();
      g.fillStyle = 'rgba(120,80,20,0.45)';
      for (let yy = top; yy < h; yy += 9) for (let xx = x + ((yy / 9) % 2) * 4.5; xx < x + pw; xx += 9) g.fillRect(xx, yy, 2, 2);
      const c = x + pw / 2;
      const hy = top + pw * (big ? 0.42 : 0.62);
      const hr = pw * (big ? 0.085 : 0.15);
      // figure
      g.fillStyle = robe;
      g.beginPath();
      g.moveTo(c - hr * 1.3, hy + hr);
      g.quadraticCurveTo(c - pw * 0.32, h * 0.7, c - pw * 0.38, h - 16);
      g.lineTo(c + pw * 0.38, h - 16);
      g.quadraticCurveTo(c + pw * 0.32, h * 0.7, c + hr * 1.3, hy + hr);
      g.fill();
      g.fillStyle = mantle;
      g.beginPath();
      g.moveTo(c - hr * 1.45, hy);
      g.quadraticCurveTo(c - pw * 0.4, h * 0.62, c - pw * 0.3, h - 16);
      g.lineTo(c - pw * 0.06, h - 16);
      g.quadraticCurveTo(c - hr * 0.5, h * 0.62, c, hy - hr * 1.3);
      g.quadraticCurveTo(c + hr * 0.5, h * 0.62, c + pw * 0.06, h - 16);
      g.lineTo(c + pw * 0.3, h - 16);
      g.quadraticCurveTo(c + pw * 0.4, h * 0.62, c + hr * 1.45, hy);
      g.quadraticCurveTo(c, hy - hr * 1.7, c - hr * 1.45, hy);
      g.fill();
      g.strokeStyle = 'rgba(10,10,30,0.28)';
      g.lineWidth = 1.2;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(c + i * hr * 0.4, hy + hr * 1.6);
        g.quadraticCurveTo(c + i * pw * 0.09, h * 0.7, c + i * pw * 0.11, h - 16);
        g.stroke();
      }
      // halo, face
      g.fillStyle = '#f7dd86';
      g.beginPath();
      g.arc(c, hy - hr * 0.1, hr * 1.75, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#7a561a';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#ecd2b4';
      g.beginPath();
      g.ellipse(c, hy, hr * 0.8, hr, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(50,30,20,0.8)';
      g.fillRect(c - hr * 0.42, hy - hr * 0.1, hr * 0.26, 1.5);
      g.fillRect(c + hr * 0.16, hy - hr * 0.1, hr * 0.26, 1.5);
      g.fillRect(c - hr * 0.2, hy + hr * 0.5, hr * 0.4, 1.3);
      g.restore();
      g.strokeStyle = '#6d4a14';
      g.lineWidth = 3;
      outline(x, pw, top);
      g.stroke();
    };
    panel(14, 150, 60, '#8a1f26', '#d9c9a4', false);
    panel(178, 284, 8, '#7a1a22', '#1e3f88', true);
    panel(476, 150, 60, '#1f5a3a', '#e4cc8a', false);
    g.fillStyle = '#7a561a';
    for (let x = 14; x < w - 10; x += 14) g.fillRect(x, h - 11, 7, 5);
  });
  const tz = ap[2][1] + 0.2;
  K.box(gilt, 3.3, 1.72, 0.09, 0, yS + 1.13, tz);
  K.box(gilt, 3.45, 0.1, 0.18, 0, yS + 1.08, tz + 0.03);
  K.box(gilt, 3.45, 0.08, 0.14, 0, yS + 2.85, tz + 0.03);
  for (const e of [-1, 0, 1]) K.cone(gilt, 0.08, 0.46, e * 1.1, yS + 2.93, tz + 0.03, 6);
  for (const e of [-1, 1]) K.box(gilt, 0.08, 1.8, 0.16, e * 1.68, yS + 1.1, tz + 0.03);
  room.pic(trip, 3.2, 1.6, 0, yS + 1.2, tz + 0.05, 0);
  // the sanctuary lamp: a red glass on three chains
  const slz = az - 0.1;
  K.rod(iron, [1.2, yCe - 0.5, slz], [1.2, 3.1, slz], 0.01, 4);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    K.rod(brass, [1.2, 3.1, slz], [1.2 + Math.cos(a) * 0.12, 2.8, slz + Math.sin(a) * 0.12], 0.006, 3);
  }
  K.lathe(brass, [[0.13, 0.05], [0.14, 0.14], [0.05, 0], [0, -0.04]], 1.2, 2.72, slz, 12);
  K.sphere(M('#ff4a2c', RP.EMIT, 0, 0, 2.6, 0, 0.7), 0.075, 1.2, 2.84, slz, 10, 8);
  room.halo(1.2, 2.84, slz, 0.55, '#ff5a30', 0.32, true);
  // ── rood beam over the chancel arch: a carved beam with a cross and two figures
  const ry = 5.55;
  K.box(oakD, archW - 1.1, 0.26, 0.22, 0, ry, NZ0 - 0.22);
  K.box(gilt, archW - 1.1, 0.03, 0.235, 0, ry + 0.26, NZ0 - 0.22);
  K.box(oakD, 0.13, 1.8, 0.1, 0, ry + 0.28, NZ0 - 0.22);
  K.box(oakD, 1.2, 0.13, 0.1, 0, ry + 1.5, NZ0 - 0.22);
  for (const e of [-1, 1]) {
    K.cyl(M('#b8965a', PAT.PLAIN, 0.7), 0.09, 0.14, 0.9, e * 1.05, ry + 0.28, NZ0 - 0.22, 8);
    K.sphere(M('#d8c09c', PAT.PLAIN, 0.7), 0.075, e * 1.05, ry + 1.26, NZ0 - 0.22, 8, 6);
  }

  // ── the west gallery with the organ
  const gz = NZ1 - 2.5;
  const gy = 3.3;
  K.box(oakD, IX * 2, 0.22, 2.5, 0, gy, NZ1 - 1.25);
  room.grid(M('#58391f', PAT.PLANKS, 0.8), (u, v) => [u, gy - 0.01, v], -IX, IX, gz, NZ1 - 0.02, 0.7, 0.7);
  // front: two columns, a panelled balustrade with a gilt rail, a clock
  for (const e of [-1, 1]) {
    const x = e * 2.5;
    K.lathe(ashD, [[0.22, 0], [0.2, 0.1], [0.14, 0.2], [0.13, gy - 0.3], [0.2, gy - 0.1], [0.24, gy]], x, yF, gz + 0.15, 12);
    room.blockDisc(x, gz + 0.15, 0.2);
  }
  K.box(oakD, IX * 2, 0.92, 0.1, 0, gy + 0.2, gz);
  K.box(oak, IX * 2, 0.06, 0.18, 0, gy + 1.12, gz);
  for (let x = -IX + 0.3; x < IX; x += 0.64) {
    K.box(oak, 0.05, 0.82, 0.03, x, gy + 0.25, gz - 0.05);
    K.box(oak, 0.52, 0.04, 0.02, x + 0.32, gy + 0.68, gz - 0.05);
  }
  // organ: a tall oak case with three towers of gilded pipes and flats between them, pipe shades, a console behind the rail
  const oz = NZ1 - 0.85;
  const caseW = 5.6,
    caseTop = gy + 5.0;
  K.box(oakD, caseW, 1.5, 0.95, 0, gy + 0.2, oz);
  K.box(oak, caseW + 0.12, 0.08, 1.0, 0, gy + 1.7, oz);
  K.box(M('#2a1a0d', RP.OAK, 0.7), caseW, caseTop - gy - 1.78, 0.5, 0, gy + 1.78, oz - 0.22);
  for (let x = -caseW / 2 + 0.3; x < caseW / 2; x += 0.6) K.box(oak, 0.05, 1.3, 0.02, x, gy + 0.3, oz + 0.48);
  const pipe = M('#d8c48a', RP.BRASS, 0.22, 1);
  const pipeFoot = M('#a58f58', RP.BRASS, 0.3, 1);
  const towers = [
    { x: 0, n: 7, r: 0.092, h: 2.9 },
    { x: -2.2, n: 5, r: 0.085, h: 2.5 },
    { x: 2.2, n: 5, r: 0.085, h: 2.5 },
  ];
  const addPipe = (x: number, base: number, h: number, r: number, zp: number) => {
    K.cone(pipeFoot, r, 0.22, x, base, zp, 10, 0, true);
    K.cyl(pipe, r, r, h, x, base + 0.22, zp, 10, true);
    K.box(M('#231a10', PAT.PLAIN, 0.8), r * 1.25, 0.05, 0.01, x, base + 0.48, zp + r);
    K.sphere(pipeFoot, r * 1.02, x, base + 0.22 + h, zp, 10, 3, 0.25, 0, Math.PI * 2, 0, Math.PI / 2);
  };
  for (const t of towers) {
    for (let i = 0; i < t.n; i++) {
      const k = i - (t.n - 1) / 2;
      addPipe(t.x + k * t.r * 2.15, gy + 1.78, t.h * (1 - 0.12 * Math.abs(k) * (Math.abs(k) / ((t.n - 1) / 2 || 1))), t.r, oz + 0.2);
    }
    // the tower's crown: a carved cornice and a gilt pinnacle
    const w = t.n * t.r * 2.3 + 0.1;
    K.box(oakD, w, 0.14, 0.34, t.x, gy + 1.78 + t.h + 0.36, oz + 0.12);
    K.box(oak, w + 0.1, 0.05, 0.4, t.x, gy + 1.78 + t.h + 0.5, oz + 0.12);
    K.cone(gilt, 0.1, 0.42, t.x, gy + 1.78 + t.h + 0.55, oz + 0.12, 8);
  }
  for (const e of [-1, 1]) {
    // flats between the towers: pipes rising towards the middle
    for (let i = 0; i < 4; i++) addPipe(e * (0.72 + i * 0.17), gy + 1.78, 1.5 + (3 - i) * 0.1, 0.06, oz + 0.18);
    K.box(oakD, 0.14, caseTop - gy - 2.0, 0.34, e * (caseW / 2 - 0.07), gy + 1.78, oz + 0.05);
  }
  K.box(oakD, caseW, 0.2, 0.62, 0, gy + 1.78 + 1.72, oz - 0.02 + 0.08);
  // underside of the gallery: joists + ceiling boards, lit by the door
  for (let z = gz + 0.3; z < NZ1; z += 0.55) K.box(roofOak, IX * 2, 0.14, 0.1, 0, gy - 0.14, z);

  // ── by the door: font, votive stand, a parish table, hymn board, plaques
  const fontX = -2.6,
    fontZ = NZ1 - 1.45;
  K.cyl(dress, 0.5, 0.6, 0.14, fontX, yF, fontZ, 8);
  K.cyl(ash, 0.2, 0.34, 0.65, fontX, yF + 0.14, fontZ, 8);
  K.cyl(ash, 0.48, 0.24, 0.3, fontX, yF + 0.79, fontZ, 8);
  K.cyl(ash, 0.5, 0.5, 0.18, fontX, yF + 1.09, fontZ, 8);
  K.cyl(oakD, 0.4, 0.5, 0.08, fontX, yF + 1.27, fontZ, 8);
  K.cone(oakD, 0.34, 0.75, fontX, yF + 1.35, fontZ, 8);
  K.sphere(gilt, 0.05, fontX, yF + 2.12, fontZ, 8, 6);
  room.blockDisc(fontX, fontZ, 0.62);
  // votive candles on a tiered iron stand against the east side, each with a flame
  const vx = IX - 0.42,
    vz = NZ1 - 1.6;
  K.box(iron, 0.34, 0.92, 1.3, vx, yF, vz);
  for (let t = 0; t < 3; t++) {
    const ty = yF + 0.78 + t * 0.14;
    const tx = vx + 0.1 - t * 0.12;
    K.box(brass, 0.12, 0.02, 1.25, tx, ty, vz);
    for (let k = 0; k < 10; k++) {
      if ((k * 7 + t * 5) % 4 === 3) continue;
      const cz = vz - 0.54 + k * 0.12;
      const ch = 0.02 + ((k * 13 + t * 3) % 5) * 0.012;
      K.cyl(wax, 0.012, 0.012, ch, tx, ty + 0.02, cz, 6);
      K.sphere(flame(((k * 37 + t * 13) % 97) / 97), 0.009, tx, ty + 0.03 + ch, cz, 5, 4, 2.0);
    }
    room.lamps.push({ x: tx, y: ty + 0.1, z: vz, k: 0.09, r: 1.5 });
  }
  room.halo(vx - 0.02, yF + 1.05, vz, 0.75, '#ffbd70', 0.42, true);
  room.block(vx - 0.22, vz - 0.72, IX, vz + 0.72);
  // hymn board
  const hymnB = room.atlas.add(96, 160, (g, w, h) => {
    g.fillStyle = '#2a1b0f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a07c3a';
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    ['212', '84', '371', '146'].forEach((t, i) => drawText(g, t, w / 2, 26 + i * 36, 'bold 28px Georgia, serif', '#efe6cc', 1));
  });
  room.pic(hymnB, 0.5, 0.82, -(IX - 0.06), 1.5, NZ0 + 2.0, Math.PI / 2);
  // memorial plaques
  const plaque = (lines: string[], key: string) =>
    room.atlas.add(192, 128, (g, w, h) => {
      g.fillStyle = '#e9e3d4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8d1c0';
      for (let i = 0; i < 40; i++) g.fillRect((i * 37) % w, (i * 59) % h, 12, 1);
      g.strokeStyle = '#8c8066';
      g.lineWidth = 2;
      g.strokeRect(7, 7, w - 14, h - 14);
      lines.forEach((t, i) => drawText(g, t, w / 2, 32 + i * 22, `${i === 0 ? 'bold ' : ''}15px Georgia, serif`, '#3a3226', 0.5));
    }, key);
  const pl1 = plaque(['IN MEMORY OF', 'CAPT. J. HALLORAN', 'LOST AT SEA 1871', 'THE HARBOUR REMEMBERS'], 'p1');
  const pl2 = plaque(['ELIZA THORNE', 'FOUNDER OF THE', 'TINYHAVEN SCHOOL', '1802 – 1879'], 'p2');
  for (const [q, s, z] of [
    [pl1, 1, NZ0 + bayW * 1.0],
    [pl2, -1, NZ0 + bayW * 2.0],
  ] as [AtlasRect, number, number][]) {
    K.box(dress, 0.05, 0.86, 1.22, s * (IX - 0.02), 3.3, z);
    K.box(dress, 0.1, 0.06, 1.32, s * (IX - 0.04), 4.16, z);
    room.pic(q, 1.1, 0.74, s * (IX - 0.06), 3.36, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // ledger stones in the floor before the chancel
  const ledger = room.atlas.add(120, 192, (g, w, h) => {
    g.fillStyle = '#7c7364';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5c5447';
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    ['HERE LIES', 'THOMAS', 'WREN', 'SHIPWRIGHT', '1744'].forEach((t, i) => drawText(g, t, w / 2, 40 + i * 26, '13px Georgia, serif', '#3a342b', 0.5));
  });
  {
    const m = M('#ffffff', RP.PIC, 0.5);
    for (const [cx, cz] of [
      [-2.3, NZ0 + 1.1],
      [2.4, NZ0 + 0.9],
    ]) {
      K.poly(
        m,
        [
          [cx - 0.5, yF + 0.004, cz + 0.8],
          [cx + 0.5, yF + 0.004, cz + 0.8],
          [cx + 0.5, yF + 0.004, cz - 0.8],
          [cx - 0.5, yF + 0.004, cz - 0.8],
        ],
        [
          [ledger.u0, ledger.v0],
          [ledger.u1, ledger.v0],
          [ledger.u1, ledger.v1],
          [ledger.u0, ledger.v1],
        ],
      );
    }
  }

  // ── chandeliers: wrought rings of candles on long chains
  for (let i = 0; i < 3; i++) {
    const cz = NZ0 + (NZ1 - 2.5 - NZ0) * (0.2 + i * 0.32);
    const cy = 5.05;
    K.rod(iron, [0, yCol - 0.1, cz], [0, cy + 0.72, cz], 0.012, 4);
    K.lathe(iron, [[0, 0.72], [0.05, 0.62], [0.03, 0.4], [0.05, 0.2], [0.09, 0.1], [0.03, -0.1], [0, -0.14]], 0, cy, cz, 8);
    K.torus(iron, 0.72, 0.014, 0, cy + 0.04, cz, 5, 28);
    K.torus(iron, 0.42, 0.01, 0, cy + 0.26, cz, 5, 22);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const x = Math.sin(a) * 0.72,
        z = cz + Math.cos(a) * 0.72;
      K.rod(iron, [Math.sin(a) * 0.1, cy + 0.3, cz + Math.cos(a) * 0.1], [x, cy + 0.04, z], 0.008, 3);
      K.cyl(brass, 0.04, 0.03, 0.02, x, cy + 0.05, z, 6);
      K.cyl(wax, 0.013, 0.013, 0.13, x, cy + 0.07, z, 6);
      K.sphere(flame(k * 0.09 + i * 0.17), 0.012, x, cy + 0.23, z, 5, 4, 2.0);
    }
    room.halo(0, cy + 0.24, cz, 1.8, '#ffc77e', 0.2, true);
    room.lamps.push({ x: 0, y: cy + 0.2, z: cz, k: 1.0, r: 3.6 });
  }
  room.lamps.push({ x: 0, y: 4.6, z: (az + cz1) / 2, k: 0.8, r: 3.2 });
  // the light that comes through the arch from the nave
  room.wins.push({ x: 0, y: 3.6, z: NZ0 - 0.3, nx: 0, nz: -1, area: 18, trans: 0.3 });
  K.rod(iron, [0, yCr - 0.1, (az + cz1) / 2], [0, 4.5, (az + cz1) / 2], 0.012, 4);
  K.torus(brass, 0.5, 0.016, 0, 4.45, (az + cz1) / 2, 5, 22);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.sin(a) * 0.5,
      z = (az + cz1) / 2 + Math.cos(a) * 0.5;
    K.cyl(wax, 0.012, 0.012, 0.12, x, 4.47, z, 6);
    K.sphere(flame(k * 0.11), 0.011, x, 4.62, z, 5, 4, 2.0);
  }
  room.halo(0, 4.62, (az + cz1) / 2, 1.3, '#ffc77e', 0.18, true);

  // ── banners on the north wall piers, a parish notice, flowers at the pulpit foot
  // ── the tower porch
  const PX = TW - 0.71;
  const pzN = tz0 + 0.71,
    pzS = tz1 - 0.71;
  const pY = 4.7;
  room.grid(M('#9c917c', RP.FLAGS, 0.8, 0, 0, 0, 0.6), (u, v) => [u, 0.16, v], -PX, PX, pzN - 0.72, pzS + 0.72, 0.5, 0.5, true);
  const lim = M('#d7ccb0', RP.PLASTER, 0.95, 0, 0, 0, 0.3);
  for (const s of [-1, 1]) room.grid(lim, (u, v) => [s * PX, v, u], pzN, pzS, 0, pY, 0.6, 0.5, s < 0);
  const portal = pointedPoints(2.3, 4.3, 1.7, 6);
  room.wall(lim, (u, v) => [u, v, pzS], -PX, PX, 0, pY, [{ u: 0, pts: portal, v0: 0 }], 0.5, 0.4, true);
  room.wall(lim, (u, v) => [u, v, pzN], -PX, PX, 0, pY, [{ u: 0, pts: doorPts, v0: 0 }], 0.5, 0.4, false);
  {
    const P = (u: number, v: number, dep: number): V3 => [u, v, pzS + dep];
    splay(room, dress, P, { u: 0, pts: portal, v0: 0 }, { u: 0, pts: portal, v0: 0 }, 0.72, true);
    const Q = (u: number, v: number, dep: number): V3 => [u, v, pzN - dep];
    splay(room, dress, Q, { u: 0, pts: doorPts, v0: 0 }, { u: 0, pts: doorPts, v0: 0 }, 0.72, false);
  }
  room.grid(M('#57391f', PAT.PLANKS, 0.85), (u, v) => [u, pY, v], -PX, PX, pzN, pzS, 0.6, 0.6, false);
  for (let z = pzN + 0.4; z < pzS; z += 0.75) K.box(roofOak, PX * 2, 0.16, 0.14, 0, pY - 0.16, z);
  // bell ropes with striped sallies through the ceiling
  for (const [bx, bz] of [
    [-1.2, pzN + 0.8],
    [1.3, pzN + 1.2],
    [0.9, pzN + 0.4],
  ]) {
    K.rod(M('#b39a6a', PAT.PLAIN, 0.9), [bx, pY, bz], [bx, 1.2, bz], 0.012, 5);
    K.cyl(M('#7b1c20', PAT.STRIPES, 0.9), 0.03, 0.03, 0.8, bx, 1.8, bz, 8);
    K.torus(M('#b39a6a', PAT.PLAIN, 0.9), 0.07, 0.012, bx, 1.15, bz, 5, 12);
  }
  // notice board + bench
  const notice = room.atlas.add(256, 160, (g, w, h) => {
    g.fillStyle = '#2f4a2c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6d4a26';
    g.lineWidth = 8;
    g.strokeRect(0, 0, w, h);
    drawText(g, "ST MARY'S", w / 2, 22, 'bold 20px Georgia, serif', '#f0e6c4', 2);
    const sheets = ['#f4efe0', '#ece1c0', '#f7f2e6', '#e8ddc8'];
    sheets.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(16 + i * 58, 42 + (i % 2) * 8, 48, 62);
      g.fillStyle = '#8a8272';
      for (let k = 0; k < 7; k++) g.fillRect(21 + i * 58, 50 + (i % 2) * 8 + k * 7, 38 - (k % 3) * 7, 2);
    });
    drawText(g, 'SERVICES 9:30 · 18:00', w / 2, 132, '17px Georgia, serif', '#f0e6c4', 1);
  });
  room.pic(notice, 1.5, 0.94, -(PX - 0.02), 1.3, (pzN + pzS) / 2, Math.PI / 2);
  K.box(oak, 0.34, 0.05, 1.8, PX - 0.22, 0.6, (pzN + pzS) / 2);
  for (const e of [-0.75, 0.75]) K.box(oakD, 0.3, 0.44, 0.05, PX - 0.22, 0.16, (pzN + pzS) / 2 + e);
  room.block(PX - 0.4, (pzN + pzS) / 2 - 0.92, PX, (pzN + pzS) / 2 + 0.92);
  // the open oak doors, folded back into the reveal: boards, wrought straps, ring pull
  const doorOak = M('#55331c', PAT.PLANKS, 0.65, 0, 0, 0, 0.7);
  const leaf = pointedPoints(2.3, 4.15, 1.7, 8);
  for (const e of [-1, 1]) {
    const half = leaf.filter(([x]) => x * e >= -1e-3);
    const pts: [number, number][] = e > 0 ? [[0, 0], ...half.map(([x, y]) => [x, y] as [number, number])] : [[0, 0], ...half.map(([x, y]) => [x, y] as [number, number])];
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false, curveSegments: 3 });
    geo.translate(-e * 1.13, 0, 0);
    const m = new THREE.Matrix4().makeRotationY(-e * ((Math.PI / 180) * 96));
    m.setPosition(e * 1.13, 0.16, tz1 - 0.46);
    K.geoM(doorOak, geo, m);
    geo.dispose();
    // the leaf now lies along z from the hinge, going inward: iron straps on its visible face
    for (const yy of [0.75, 1.75, 2.75]) {
      K.box(iron, 0.015, 0.075, 0.95, e * (1.13 - 0.09) - e * 0.02, 0.16 + yy, tz1 - 0.46 - 0.55);
    }
    K.torus(iron, 0.06, 0.009, e * 1.0, 1.25, tz1 - 1.42, 5, 12, Math.PI * 2, 0, Math.PI / 2);
  }
  room.lamps.push({ x: 0, y: 3.8, z: (pzN + pzS) / 2, k: 0.35, r: 2.4 });
  K.rod(iron, [0, pY, (pzN + pzS) / 2], [0, 3.9, (pzN + pzS) / 2], 0.01, 4);
  K.sphere(M('#ffd9a0', RP.EMIT, 0, 0, 2.2, 0, 0.2), 0.11, 0, 3.8, (pzN + pzS) / 2, 10, 8);
  room.halo(0, 3.8, (pzN + pzS) / 2, 0.7, '#ffd29a', 0.22);
  // daylight through the open door
  room.wins.push({ x: 0, y: 1.8, z: tz1 - 0.2, nx: 0, nz: -1, area: 8.0, trans: 1.1 });

  // ── what the walker can do
  room.walk(-IX + 0.02, NZ0, IX - 0.02, NZ1, yF);
  room.walk(-archW / 2 + 0.1, NZ0 - 0.61, archW / 2 - 0.1, NZ0, (_x, _z) => yC);
  room.walk(-CIX, az + 0.55, CIX, NZ0 - 0.6, yC);
  room.walk(-CIX, cz0 + 1.0, CIX, az + 0.55, yS);
  room.walk(-1.0, NZ1, 1.0, pzN, yF + 0.06);
  room.walk(-PX + 0.02, pzN, PX - 0.02, pzS, 0.16);
  room.walk(-1.0, pzS, 1.0, d.fp.z1 - d.cz + 0.05, 0.16);

  // the sky bake and the sun
  room.ambient = 0.15;
  room.skyK = 1.15;
  room.lampK = 0.62;
  room.sunK = 1.15;
  room.shaftK = 1.1;
  room.moteCount = env.ctx.quality.level === 'high' ? 520 : 240;
  const b0 = new THREE.Vector3(room.wx(-IX, NZ0), 0.3, room.wz(-IX, NZ0)),
    b1 = new THREE.Vector3(room.wx(IX, NZ1), 8.2, room.wz(IX, NZ1));
  room.moteBox = new THREE.Box3(b0.clone().min(b1), b0.clone().max(b1));
  void lime;
  return room;
}

/** inner polygon of the apse: the outer faces moved `t` towards the centre, neighbours intersected */
function offsetApse(pts: [number, number][], az: number, t: number): [number, number][] {
  const lines: { px: number; pz: number; dx: number; dz: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, azz] = pts[i],
      [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - azz);
    const dx = (bx - ax) / L,
      dz = (bz - azz) / L;
    let nx = -dz,
      nz = dx;
    if (nx * (0 - (ax + bx) / 2) + nz * (az - (azz + bz) / 2) < 0) {
      nx = -nx;
      nz = -nz;
    }
    lines.push({ px: ax + nx * t, pz: azz + nz * t, dx, dz });
  }
  const out: [number, number][] = [];
  // the two ends sit where the first and last faces meet the chancel's straight walls
  const atX = (l: { px: number; pz: number; dx: number; dz: number }, x: number): [number, number] => [x, l.pz + (l.dz / l.dx) * (x - l.px)];
  out.push(atX(lines[0], pts[0][0] + t));
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i],
      b = lines[i + 1];
    const den = a.dx * b.dz - a.dz * b.dx;
    const k = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / den;
    out.push([a.px + a.dx * k, a.pz + a.dz * k]);
  }
  out.push(atX(lines[lines.length - 1], pts[pts.length - 1][0] - t));
  return out;
}

/** a pew end, poppy-headed: stands on the floor at x, centred on z, depth d, height h */
function pewEnd(room: Room, m: Mat, x: number, z: number, d: number, h: number): void {
  const K = room.K;
  const pts: [number, number][] = [
    [-d / 2, 0],
    [d / 2, 0],
    [d / 2, h * 0.78],
    [d * 0.2, h * 0.86],
    [d * 0.12, h],
    [-d * 0.12, h],
    [-d * 0.2, h * 0.86],
    [-d / 2, h * 0.78],
  ];
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
  g.translate(0, 0, -0.03);
  K.geo(m, g, x, 0.03, z, Math.PI / 2);
  g.dispose();
  K.sphere(m, 0.05, x, 0.03 + h + 0.03, z, 6, 5);
  // recessed panel
  K.box(M('#2f1d0e', 31, 0.6), 0.066, h * 0.42, d * 0.5, x, 0.14, z);
}

function pewEndX(room: Room, m: Mat, x: number, z: number, d: number, h: number, y0: number): void {
  const K = room.K;
  const pts: [number, number][] = [
    [-d / 2, 0],
    [d / 2, 0],
    [d / 2, h * 0.8],
    [d * 0.2, h * 0.88],
    [d * 0.1, h],
    [-d * 0.1, h],
    [-d * 0.2, h * 0.88],
    [-d / 2, h * 0.8],
  ];
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
  g.translate(0, 0, -0.03);
  K.geo(m, g, x, y0, z, 0);
  g.dispose();
}

/** splayed reveal between two outlines: `a` in the lining plane (depth 0), `b` at depth d */
function splay(room: Room, m: Mat, p: (u: number, v: number, depth: number) => V3, a: Hole, b: Hole, d: number, flip: boolean): void {
  // resample both outlines to the same number of points by arc length
  const n = Math.max(a.pts.length, b.pts.length) * 2;
  const res = (h: Hole): [number, number][] => {
    const pts = h.pts;
    const L: number[] = [0];
    for (let i = 1; i <= pts.length; i++) {
      const q = pts[i % pts.length],
        r = pts[i - 1];
      L.push(L[i - 1] + Math.hypot(q[0] - r[0], q[1] - r[1]));
    }
    const tot = L[L.length - 1];
    const out: [number, number][] = [];
    let j = 0;
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * tot;
      while (j < pts.length - 1 && L[j + 1] < t) j++;
      const r = pts[j],
        q = pts[(j + 1) % pts.length];
      const u = (t - L[j]) / Math.max(L[j + 1] - L[j], 1e-6);
      out.push([r[0] + (q[0] - r[0]) * u, r[1] + (q[1] - r[1]) * u]);
    }
    return out;
  };
  const A = res(a),
    B = res(b);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) run += Math.hypot(A[k][0] - A[k - 1][0], A[k][1] - A[k - 1][1]);
    const P = p(a.u + A[k][0], a.v0 + A[k][1], 0),
      Q = p(b.u + B[k][0], b.v0 + B[k][1], d);
    pos.push(P[0], P[1], P[2], Q[0], Q[1], Q[2]);
    uv.push(run, 0, run, d);
  }
  // the reveal looks at the opening's axis, whichever way the outlines run
  let cu = 0,
    cv = 0;
  for (const [x, y] of B) {
    cu += x / B.length;
    cv += y / B.length;
  }
  const C = p(b.u + cu, b.v0 + cv, d * 0.5);
  const qk = Math.floor(n / 4) * 2;
  const v = (i: number): THREE.Vector3 => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const nrm = new THREE.Vector3().subVectors(v(qk + 1), v(qk)).cross(new THREE.Vector3().subVectors(v(qk + 2), v(qk)));
  const inward = nrm.dot(new THREE.Vector3(C[0], C[1], C[2]).sub(v(qk))) > 0;
  void flip;
  for (let k = 0; k < n; k++) {
    const i = k * 2;
    if (inward) idx.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
    else idx.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  room.K.b.add(g, m, null, 'native');
  g.dispose();
}
