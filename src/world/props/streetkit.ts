// Street furniture with a reason to be there (detail round, ?nostreetkit families in props/streetlife.ts): utility
// cabinets with their tags and stickers, regulation sign posts (face printed, galvanised back with rails and clamps),
// poster columns with pasted bills, pedestrian guard rails, notices tied to lamp posts, and shop-front goods carried
// out to the kerb: fruit stands, flower buckets, book carts, clothes rails, postcard racks, doormats, cellar hatches,
// pavement lights. Local frame as in furniture.ts: origin on the ground, +Y up, +Z = the front (towards the walker).
// `k` = fine cell, `kd` = near-only cell (the small parts), printed faces go to the Printer's own near mesh.

import { matOn } from '../../core/sweepmat';
import { hash01, type Rng } from '../../core/rng';
import type { GreenKit } from '../buildings/green';
import { GREEN } from '../buildings/green';
import type { Kit } from './furniture';
import type { Printer } from './print';
import { markProp } from '../lettering/spots';
import { boltZ, cbox, lathe } from './shapes';
import { wearOn } from '../../core/sweepwear';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const SANS = 'Arial, Helvetica, sans-serif';
const HEAD = '"Arial Black", "Segoe UI Black", Impact, "Helvetica Neue", Arial, sans-serif';

// ───────────────────────────────────────────────────────────── drawings ──

/** spray tag on a painted door: a fat outlined scrawl with a couple of drips, background = the door paint */
function tagDraw(bg: string, seed: number): Draw {
  return (g, w, h) => {
    const r = (k: number) => hash01(seed, k, 3);
    // (cut out: a painted rectangle of the door's colour never matched the door. The printer's alpha test drops the faint overspray,
    // which stays to give the stroke's edge texels the ink's colour instead of black)
    if (wearOn('weartag')) g.clearRect(0, 0, w, h);
    else {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    const ink = ['#16161a', '#c2283c', '#2442a8', '#e9e6dc', '#e0a020'][Math.floor(r(1) * 5)];
    g.strokeStyle = ink;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    let y = 0;
    if (wearOn('weartag')) {
      // a can held by a hand: letters, the stroke fat where it slows and thin where it flicks, overspray round it, the first coat
      // faded under the second, runs that end in a bead
      const letters = 3 + Math.floor(r(4) * 3);
      const cw = (w * 0.84) / letters;
      const path = (pass: number) => {
        for (let l = 0; l < letters; l++) {
          const x0 = w * 0.08 + cw * l + cw * 0.1 * (r(90 + l) - 0.5);
          const pts = 4 + Math.floor(r(100 + l) * 3);
          let px = x0,
            py = h * (0.72 - 0.1 * r(110 + l));
          for (let i = 0; i < pts; i++) {
            const nx = x0 + cw * 0.9 * r(120 + l * 7 + i),
              ny = h * (0.14 + 0.72 * r(160 + l * 7 + i));
            const fast = i % 2 === 0;
            g.lineWidth = h * (fast ? 0.035 : 0.085) * (pass === 0 ? 2.2 : 1) * (0.8 + 0.4 * r(200 + l * 7 + i));
            g.beginPath();
            g.moveTo(px, py);
            g.quadraticCurveTo((px + nx) / 2 + cw * 0.3 * (r(240 + l * 7 + i) - 0.5), (py + ny) / 2, nx, ny);
            g.stroke();
            px = nx;
            py = ny;
          }
        }
      };
      g.globalAlpha = 0.16;
      g.filter = `blur(${Math.max(1, h * 0.03)}px)`;
      path(0);
      g.filter = 'none';
      g.globalAlpha = 0.9;
      path(1);
      g.globalAlpha = 1;
      g.lineWidth = h * 0.016;
      for (let i = 0; i < 3; i++) {
        const dx = w * (0.14 + 0.72 * r(70 + i));
        const y0 = h * (0.45 + 0.25 * r(72 + i)),
          y1 = Math.min(h * 0.96, y0 + h * (0.08 + 0.3 * r(74 + i)));
        g.beginPath();
        g.moveTo(dx, y0);
        g.lineTo(dx, y1);
        g.stroke();
        g.fillStyle = ink;
        g.beginPath();
        g.arc(dx, y1, h * 0.014, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    g.lineWidth = h * (0.07 + 0.05 * r(2));
    g.beginPath();
    let x = w * 0.08;
    y = h * (0.35 + 0.3 * r(3));
    g.moveTo(x, y);
    const n = 6 + Math.floor(r(4) * 5);
    for (let i = 0; i < n; i++) {
      const nx = x + (w * 0.84) / n;
      g.quadraticCurveTo(x + w * 0.1 * (r(10 + i) - 0.5), h * (0.1 + 0.8 * r(30 + i)), nx, h * (0.2 + 0.6 * r(50 + i)));
      x = nx;
    }
    g.stroke();
    g.lineWidth = h * 0.02;
    for (let i = 0; i < 2; i++) {
      const dx = w * (0.2 + 0.6 * r(70 + i));
      y = h * (0.5 + 0.2 * r(72 + i));
      g.beginPath();
      g.moveTo(dx, y);
      g.lineTo(dx, Math.min(h * 0.98, y + h * 0.3 * r(74 + i)));
      g.stroke();
    }
  };
}

/** paper notice: a coloured or white sheet, a heading, lines, sometimes a row of tear-off tabs */
function noticeDraw(seed: number): Draw {
  return (g, w, h) => {
    const r = (k: number) => hash01(seed, k, 11);
    const heads = ['LOST CAT', 'ROOMS', 'YOGA', 'GUITAR LESSONS', 'BAND NIGHT', 'FOR SALE', 'MOVING?', 'FOUND KEYS', 'CHOIR', 'FLEA MARKET'];
    const idx = Math.floor(r(1) * heads.length);
    g.fillStyle = ['#f4f1e6', '#f2e49a', '#f4c8c0', '#cde4f2', '#f4f1e6'][Math.floor(r(2) * 5)];
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1f';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `900 ${Math.round(h * 0.13)}px ${HEAD}`;
    g.fillText(heads[idx], w / 2, h * 0.17, w * 0.92);
    if (idx === 0) {
      // the cat
      g.fillStyle = '#26262c';
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.42, w * 0.2, h * 0.15, 0, 0, Math.PI * 2);
      g.fill();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(w * (0.5 + s * 0.17), h * 0.33);
        g.lineTo(w * (0.5 + s * 0.2), h * 0.22);
        g.lineTo(w * (0.5 + s * 0.05), h * 0.29);
        g.fill();
      }
    } else {
      g.fillStyle = ['#b8322c', '#2442a8', '#227a4a'][Math.floor(r(3) * 3)];
      g.fillRect(w * 0.12, h * 0.24, w * 0.76, h * 0.2);
    }
    g.fillStyle = '#3a3a40';
    for (let i = 0; i < 5; i++) g.fillRect(w * 0.1, h * (0.52 + i * 0.05), w * (0.5 + 0.3 * r(20 + i)), h * 0.018);
    if (r(4) < 0.6) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 1; i < 8; i++) g.fillRect((w * i) / 8, h * 0.8, 1, h * 0.2);
      for (let i = 0; i < 8; i++) if (r(40 + i) < 0.3) g.clearRect((w * i) / 8 + 1, h * 0.8, w / 8 - 1, h * 0.2);
    }
  };
}

const POSTER_NAMES: [string, string, string, string][] = [
  ['SUMMER REGATTA', 'SAT 14', '#14305a', '#f2c230'],
  ['THE GULLS', 'LIVE AT THE PIER', '#c2283c', '#f4f1e6'],
  ['CIRCUS HAVEN', '3 NIGHTS ONLY', '#e0a020', '#14141a'],
  ['FISH MARKET', 'EVERY FRIDAY', '#227a6a', '#f4f1e6'],
  ['MIDNIGHT FILM', 'AT THE ROYAL', '#16161c', '#e8574f'],
  ['HARBOUR JAZZ', 'FESTIVAL', '#7a2f8f', '#f2d88c'],
  ['TOWN HALL', 'ORGAN RECITAL', '#ece6d4', '#1d3557'],
  ['DERBY DAY', 'HAVEN v WESTBROOK', '#1d6f3a', '#ffffff'],
];

/** a bill for a column or hoarding; `wide` slices it so that it can bend across two facets */
function posterDraw(i: number, slice: 0 | 1 | 2): Draw {
  return (g, w, h) => {
    const [t, s, bg, ink] = POSTER_NAMES[i % POSTER_NAMES.length];
    const W = slice ? w * 2 : w;
    g.save();
    if (slice === 2) g.translate(-w, 0);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, h);
    g.fillStyle = ink;
    g.globalAlpha = 0.9;
    const form = i % 3;
    if (form === 0) {
      g.beginPath();
      g.arc(W * 0.5, h * 0.42, W * 0.32, 0, Math.PI * 2);
      g.fill();
    } else if (form === 1) {
      for (let k = 0; k < 5; k++) g.fillRect(0, h * (0.3 + k * 0.07), W, h * 0.028);
    } else {
      g.beginPath();
      g.moveTo(0, h * 0.62);
      g.lineTo(W * 0.5, h * 0.24);
      g.lineTo(W, h * 0.62);
      g.fill();
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const words = t.split(' ');
    g.font = `900 ${Math.round(h * 0.09)}px ${HEAD}`;
    words.forEach((wd, k) => g.fillText(wd, W / 2, h * (0.14 + k * 0.095), W * 0.9));
    g.font = `bold ${Math.round(h * 0.045)}px ${SANS}`;
    g.fillText(s, W / 2, h * 0.92, W * 0.9);
    g.restore();
  };
}

export type SignKind = 'noparking' | 'oneway' | 'speed' | 'crossing' | 'parking' | 'noentry' | 'cycle';

/** the sign's printed face; round plates clear the corners (the print material alpha-tests) */
function signDraw(kind: SignKind): Draw {
  return (g, w, h) => {
    const cx = w / 2,
      cy = h / 2,
      R = w / 2 - 1;
    g.clearRect(0, 0, w, h);
    const disc = (r: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    };
    switch (kind) {
      case 'noparking':
        disc(R, '#c81e2a');
        disc(R * 0.76, '#1f4f9e');
        g.strokeStyle = '#c81e2a';
        g.lineWidth = R * 0.24;
        g.beginPath();
        g.moveTo(cx - R * 0.62, cy - R * 0.62);
        g.lineTo(cx + R * 0.62, cy + R * 0.62);
        g.stroke();
        break;
      case 'speed':
        disc(R, '#c81e2a');
        disc(R * 0.76, '#f6f3ea');
        g.fillStyle = '#16161a';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `900 ${Math.round(R * 0.98)}px ${SANS}`;
        g.fillText('30', cx, cy + R * 0.05);
        break;
      case 'noentry':
        disc(R, '#c81e2a');
        g.fillStyle = '#f6f3ea';
        g.fillRect(cx - R * 0.68, cy - R * 0.17, R * 1.36, R * 0.34);
        break;
      case 'oneway':
        g.fillStyle = '#1f4f9e';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#f6f3ea';
        g.lineWidth = 2;
        g.strokeRect(2, 2, w - 4, h - 4);
        g.fillStyle = '#f6f3ea';
        g.beginPath();
        g.moveTo(cx, h * 0.14);
        g.lineTo(cx + w * 0.26, h * 0.42);
        g.lineTo(cx + w * 0.09, h * 0.42);
        g.lineTo(cx + w * 0.09, h * 0.86);
        g.lineTo(cx - w * 0.09, h * 0.86);
        g.lineTo(cx - w * 0.09, h * 0.42);
        g.lineTo(cx - w * 0.26, h * 0.42);
        g.fill();
        break;
      case 'crossing':
        g.fillStyle = '#1f4f9e';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#f6f3ea';
        g.beginPath();
        g.moveTo(cx, h * 0.08);
        g.lineTo(w * 0.94, h * 0.9);
        g.lineTo(w * 0.06, h * 0.9);
        g.fill();
        g.fillStyle = '#16161a';
        g.beginPath();
        g.arc(cx + w * 0.02, h * 0.36, w * 0.055, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = w * 0.055;
        g.strokeStyle = '#16161a';
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx + w * 0.02, h * 0.44);
        g.lineTo(cx, h * 0.6);
        g.lineTo(cx - w * 0.1, h * 0.8);
        g.moveTo(cx, h * 0.6);
        g.lineTo(cx + w * 0.11, h * 0.8);
        g.stroke();
        break;
      case 'parking':
        g.fillStyle = '#1f4f9e';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#f6f3ea';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `900 ${Math.round(h * 0.78)}px ${SANS}`;
        g.fillText('P', cx, cy + h * 0.04);
        break;
      case 'cycle':
        disc(R, '#1f4f9e');
        g.strokeStyle = '#f6f3ea';
        g.lineWidth = R * 0.09;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.arc(cx + s * R * 0.42, cy + R * 0.2, R * 0.27, 0, Math.PI * 2);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(cx - R * 0.42, cy + R * 0.2);
        g.lineTo(cx - R * 0.1, cy - R * 0.25);
        g.lineTo(cx + R * 0.28, cy - R * 0.25);
        g.lineTo(cx + R * 0.42, cy + R * 0.2);
        g.moveTo(cx - R * 0.1, cy - R * 0.25);
        g.lineTo(cx, cy + R * 0.2);
        g.lineTo(cx + R * 0.28, cy - R * 0.25);
        g.stroke();
        break;
    }
  };
}

function plateDraw(l1: string, l2: string): Draw {
  return (g, w, h) => {
    g.fillStyle = '#f6f3ea';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#16161a';
    g.lineWidth = 2;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#16161a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * 0.34)}px ${SANS}`;
    g.fillText(l1, w / 2, h * 0.32, w * 0.9);
    g.fillText(l2, w / 2, h * 0.7, w * 0.9);
  };
}

// ─────────────────────────────────────────────────────────────── models ──

/** Street cabinet. kind 0 telecom green, 1 power grey, 2 beige, 3 signal controller (bigger, with a hatch). */
export function cabinet(k: Kit, kd: Kit, rng: Rng, kind: number, printer: Printer | null, seed: number): void {
  const sh = k.sh;
  const W = kind === 3 ? 0.86 : rng.range(0.56, 0.82),
    D = kind === 3 ? 0.42 : rng.range(0.26, 0.36),
    H0 = kind === 3 ? 1.32 : rng.range(0.92, 1.28);
  const col = ['#56665c', '#868c8b', '#a7a28e', '#6e7674'][kind];
  // cast plinth with mud and paint spots
  k.m('#7f7d76', 'stone');
  sh.box(0, 0.035, 0, W + 0.1, 0.07, D + 0.1, 1);
  k.m(col, 'paint');
  cbox(sh, 0, 0.07 + H0 / 2, 0, W, H0, D, 0.01);
  // rain hood, a little proud on every side
  sh.box(0, 0.07 + H0 + 0.016, 0, W + 0.04, 0.032, D + 0.04, 0);
  const shk = kd.sh;
  const zf = D / 2;
  const top = 0.07 + H0;
  // the doors: seams, a handle, a triangular lock, hinges, louvres at the foot and under the hood
  kd.m('#23282a', 'paint');
  shk.box(0, 0.07 + H0 / 2, zf + 0.0012, 0.008, H0 - 0.1, 0.002, 1 | 2 | 4);
  for (const s of [-1, 1]) shk.box((s * (W - 0.06)) / 2, 0.07 + H0 / 2, zf + 0.0012, 0.006, H0 - 0.1, 0.002, 1 | 2 | 4);
  for (let i = 0; i < 4; i++) {
    shk.box(-W * 0.25, 0.15 + i * 0.028, zf + 0.002, W * 0.32, 0.012, 0.004, 1 | 4);
    shk.box(W * 0.25, 0.15 + i * 0.028, zf + 0.002, W * 0.32, 0.012, 0.004, 1 | 4);
  }
  kd.m('#b9bbb8', 'steel');
  shk.cyl(0.05, top * 0.58, zf, 0.012, 0.012, 0.014, 5, 2);
  shk.box(-0.055, top * 0.58, zf + 0.008, 0.02, 0.11, 0.014, 1 | 4);
  for (const s of [-1, 1]) for (const y of [0.28, top - 0.2]) shk.box(s * (W / 2 - 0.012), y, zf + 0.004, 0.018, 0.05, 0.008, 1 | 4);
  // warning triangle, asset plate
  kd.m('#e6b81e', 'plastic');
  shk.box(-W * 0.25, top - 0.17, zf + 0.0014, 0.07, 0.07, 0.0016, 55);
  kd.m('#e9e7df', 'plastic');
  shk.box(W * 0.25, top - 0.15, zf + 0.0014, 0.11, 0.05, 0.0016, 55);
  markProp(shk, 'cablabel', W * 0.25, top - 0.15, zf + 0.0024, 0.11, 0.05, seed, kind);
  markProp(shk, 'cabwarn', -W * 0.25, top - 0.17, zf + 0.0024, 0.07, 0.07, seed, kind);
  if (!printer) return;
  // tag across the door, stickers, a torn bill
  if (rng.chance(0.62)) printer.quad(sh, `tag:${col}:${seed % 9}`, rng.range(-0.08, 0.08), rng.range(0.42, top * 0.62), zf + 0.003, W * 0.82, rng.range(0.2, 0.34), 96, 40, tagDraw(col, seed % 9));
  if (rng.chance(0.5)) {
    const nx = rng.range(-0.12, 0.12),
      ny = rng.range(top * 0.55, top - 0.25);
    printer.quad(sh, `notice:${seed % 12}`, nx, ny, zf + 0.0032, 0.21, 0.3, 42, 60, noticeDraw(seed % 12));
    markProp(sh, 'notice', nx, ny, zf + 0.0036, 0.21, 0.3, seed);
  }
  // back and side get their share (seen when you walk the kerb)
  if (rng.chance(0.5)) {
    sh.push().local(0, 0, 0, 0, Math.PI, 0);
    printer.quad(sh, `tag:${col}:${(seed + 4) % 9}`, 0, rng.range(0.4, 0.9), zf + 0.002, W * 0.76, 0.26, 96, 40, tagDraw(col, (seed + 4) % 9));
    sh.pop();
  }
}

/**
 * Regulation sign on its own post. The plate faces +Z (traffic), its back is galvanised with two channel rails, band
 * clamps and bolts (never a black shape from behind); the post has a grout collar and sometimes a sticker or a lean.
 */
export function signPost(k: Kit, kd: Kit, rng: Rng, kind: SignKind, printer: Printer | null, plate?: [string, string]): void {
  const sh = k.sh;
  const H0 = rng.range(2.55, 2.95);
  const lean = rng.chance(0.25) ? rng.range(-0.025, 0.025) : 0;
  sh.push().local(0, 0, 0, lean, 0, lean * 0.6);
  k.m('#7f7d76', 'stone');
  sh.cyl(0, 0, 0, 0.075, 0.06, 0.025, 8, 2);
  k.m('#99a0a4', 'steel');
  sh.cyl(0, 0, 0, 0.032, 0.03, H0, 8, 2);
  const round = kind === 'noparking' || kind === 'speed' || kind === 'noentry' || kind === 'cycle';
  const S = round ? 0.6 : kind === 'parking' ? 0.5 : kind === 'oneway' ? 0.5 : 0.6;
  const Sh = kind === 'oneway' ? 0.72 : S;
  const zF = 0.045;
  const cy = H0 - Sh / 2 - 0.04;
  // plate: rim + galvanised back
  k.m('#a4a9ab', 'steel');
  if (round) {
    sh.push().local(0, cy, zF, Math.PI / 2, 0, 0);
    sh.cyl(0, -0.006, 0, S / 2, S / 2, 0.006, 16, 0, false);
    sh.disc(0, -0.006, 0, S / 2, 16, -1);
    sh.pop();
  } else {
    sh.box(0, cy, zF - 0.004, S, Sh, 0.006, 0);
  }
  // rails, clamps, bolts behind the plate
  k.m('#808689', 'steel');
  for (const dy of [-Sh * 0.26, Sh * 0.26]) sh.box(0, cy + dy, zF - 0.016, S * 0.7, 0.03, 0.018, 8);
  const shk = kd.sh;
  kd.m('#6c7174', 'steel');
  for (const dy of [-Sh * 0.26, Sh * 0.26]) {
    shk.cyl(0, cy + dy - 0.022, 0, 0.038, 0.038, 0.044, 8, 0);
    boltZ(shk, 0.05, cy + dy, zF - 0.008, 0.008);
    boltZ(shk, -0.05, cy + dy, zF - 0.008, 0.008);
  }
  kd.m('#2c2c30', 'plastic');
  shk.disc(0, H0 + 0.001, 0, 0.033, 8, 1);
  if (printer) {
    const ok = printer.quad(sh, `sign:${kind}`, 0, cy, zF + 0.0006, S, Sh, 64, kind === 'oneway' ? 92 : 64, signDraw(kind));
    if (!ok) {
      k.m(kind === 'noparking' || kind === 'speed' || kind === 'noentry' ? '#c81e2a' : '#1f4f9e', 'paint');
      sh.box(0, cy, zF + 0.0006, S * 0.9, Sh * 0.9, 0.001, 55);
    }
    if (plate) {
      const py = cy - Sh / 2 - 0.13;
      k.m('#a4a9ab', 'steel');
      sh.box(0, py, zF - 0.004, 0.46, 0.2, 0.006, 0);
      printer.quad(sh, `plate:${plate[0]}${plate[1]}`, 0, py, zF + 0.0006, 0.45, 0.19, 72, 30, plateDraw(plate[0], plate[1]));
      markProp(sh, 'signplate', 0, py, zF + 0.0012, 0.45, 0.19, 0, 0, `${plate[0]}|${plate[1]}`);
    }
    // stickers round the post at hand height
    if (rng.chance(0.45)) {
      kd.m(rng.pick(['#e8574f', '#f2c84b', '#f4f1e6', '#2a9d8f', '#16161a']), 'plastic');
      shk.cyl(0, rng.range(1.1, 1.7), 0, 0.0335, 0.0335, rng.range(0.03, 0.09), 8, 0, true, rng.range(0, 6));
    }
  }
  sh.pop();
}

/** Poster column (Litfass): moulded plinth, a 12-sided drum papered with bills, cornice, domed cap with a finial. */
export function posterColumn(ks: Kit, k: Kit, kd: Kit, rng: Rng, printer: Printer | null, seed: number): void {
  const sh = ks.sh;
  const R = 0.52,
    H0 = 2.75;
  const F = 12;
  ks.m('#2e3c38', 'iron');
  lathe(sh, 0, 0, [[R + 0.09, 0], [R + 0.09, 0.14], [R + 0.05, 0.2], [R + 0.01, 0.24]], F);
  ks.m('#cdc6b2', 'paint');
  sh.cyl(0, 0.24, 0, R, R, H0 - 0.24, F, 0, false, Math.PI / F);
  ks.m('#2e3c38', 'iron');
  lathe(sh, 0, 0, [[R + 0.01, H0], [R + 0.08, H0 + 0.05], [R + 0.13, H0 + 0.1], [R + 0.13, H0 + 0.17], [R + 0.06, H0 + 0.2]], F, Math.PI / F);
  lathe(sh, 0, 0, [[R + 0.06, H0 + 0.2], [R - 0.06, H0 + 0.36], [R - 0.26, H0 + 0.49], [0.08, H0 + 0.58], [0.03, H0 + 0.64], [0, H0 + 0.82]], F, Math.PI / F);
  kd.m('#b89a4a', 'iron');
  kd.sh.ellipsoid(0, H0 + 0.84, 0, 0.035, 0.035, 0.035, 0);
  if (!printer) return;
  // bills pasted facet by facet: each spans two facets, some overlap, some are torn down to older layers
  const facetW = 2 * R * Math.tan(Math.PI / F) * 0.985;
  const apo = R * Math.cos(0) * Math.cos(Math.PI / F) + 0.004;
  // the drum's facet centres (rotated half a step so that a facet looks at +Z)
  for (let i = 0; i < F; i += 2) {
    const bill = (seed + i) % POSTER_NAMES.length;
    const y0 = 0.46 + rng.range(0, 0.14),
      hh = rng.range(1.5, 1.95);
    for (const s of [0, 1] as const) {
      const a = ((i + s) / F) * Math.PI * 2 + (matOn('matsign') ? 0 : Math.PI / F);
      sh.push().local(0, 0, 0, 0, a, 0);
      printer.quad(sh, `bill:${bill}:${s}`, 0, y0 + hh / 2, apo, facetW, hh, 56, 200, posterDraw(bill, s === 0 ? 1 : 2));
      markProp(sh, 'bill', 0, y0 + hh / 2, apo, facetW, hh, seed + i, s);
      sh.pop();
    }
  }
}

/** Pedestrian guard rail panel along local X (length L): posts, top + bottom rail, pales with a sight gap. */
export function guardRail(k: Kit, kd: Kit, L: number, col: string): void {
  const sh = k.sh;
  k.m(col, 'iron');
  const H0 = 1.0;
  for (const x of [-L / 2, L / 2]) {
    sh.box(x, H0 / 2, 0, 0.05, H0, 0.05, 1);
  }
  sh.box(0, H0 - 0.03, 0, L, 0.04, 0.03, 1 | 16 | 32);
  sh.box(0, 0.18, 0, L, 0.03, 0.02, 1 | 16 | 32);
  sh.box(0, 0.68, 0, L, 0.024, 0.02, 1 | 16 | 32);
  const n = Math.round(L / 0.115);
  for (let i = 1; i < n; i++) {
    const x = -L / 2 + (i / n) * L;
    // (a gap in the pales at driver's eye height so that children stay visible)
    if (i % 3) sh.box(x, 0.44, 0, 0.012, 0.5, 0.012, 1 | 2);
    else sh.box(x, 0.56, 0, 0.012, 0.76, 0.012, 1 | 2);
  }
  kd.m('#7f7d76', 'stone');
  for (const x of [-L / 2, L / 2]) kd.sh.cyl(x, 0, 0, 0.055, 0.045, 0.02, 6, 2);
}

/** Notice cable-tied to a post of radius r at height y, facing +Z, in the near kit. */
export function postNotice(kd: Kit, printer: Printer | null, r: number, y: number, seed: number): void {
  const sh = kd.sh;
  kd.m('#16161a', 'plastic');
  for (const dy of [-0.12, 0.12]) sh.cyl(0, y + dy - 0.004, 0, r + 0.003, r + 0.003, 0.008, 8, 0);
  kd.m('#7a7468', 'wood');
  sh.box(0, y, r + 0.005, 0.22, 0.31, 0.004, 1 | 4);
  printer?.quad(sh, `notice:${seed % 12}`, 0, y, r + 0.0075, 0.21, 0.3, 42, 60, noticeDraw(seed % 12));
  markProp(sh, 'notice', 0, y, r + 0.0078, 0.21, 0.3, seed);
}

// ──────────────────────────────────────────────────────── shop-front life ──

const FRUIT = [
  ['#cf3b2d', '#b52a22'], // apples, tomatoes
  ['#ec9a2a', '#d8841e'], // oranges
  ['#e7cf3f', '#cdb72f'], // lemons
  ['#6d9c34', '#588429'], // pears, limes
  ['#5a2a55', '#47204a'], // plums, aubergines
  ['#8c9d3a', '#b34a3a'], // mixed
];

/** One crate with a heaped load: slats in `k`, a coarse heap in `k`, the top fruit near only. */
function crate(k: Kit, kd: Kit, rng: Rng, x: number, y: number, z: number, tilt: number): void {
  const sh = k.sh;
  const W = 0.44,
    D = 0.32,
    H0 = 0.13;
  const load = rng.pick(FRUIT);
  sh.push().local(x, y, z, tilt, 0, 0);
  k.m(rng.pick(['#b09468', '#9a7d54', '#c0a678']), 'wood');
  sh.box(0, 0.012, 0, W, 0.024, D, 1);
  for (const dy of [0.05, 0.1]) {
    sh.box(0, dy, D / 2, W, 0.034, 0.012, 1);
    sh.box(0, dy, -D / 2, W, 0.034, 0.012, 1);
    sh.box(W / 2, dy, 0, 0.012, 0.034, D, 1);
    sh.box(-W / 2, dy, 0, 0.012, 0.034, D, 1);
  }
  k.m(load[0], 'plastic');
  sh.ellipsoid(0, H0 - 0.012, 0, W * 0.47, 0.06, D * 0.46, 1);
  sh.pop();
  const shk = kd.sh;
  shk.push().local(x, y, z, tilt, 0, 0);
  for (let i = 0; i < 9; i++) {
    kd.m(rng.chance(0.75) ? load[0] : load[1], 'plastic');
    const px = (W - 0.09) * rng.range(-0.5, 0.5),
      pz = (D - 0.08) * rng.range(-0.5, 0.5);
    const r = rng.range(0.034, 0.042);
    shk.ellipsoid(px, H0 + 0.015 - Math.abs(px) * 0.1, pz, r, r * 0.92, r, 0);
  }
  shk.pop();
}

/** Greengrocer's stand: a stepped timber frame with six tilted crates and hand-written price tags. Width ≈ 1.4 m. */
export function fruitStand(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m('#6f5a3d', 'wood');
  for (const x of [-0.7, 0.7]) {
    sh.box(x, 0.3, -0.16, 0.05, 0.6, 0.05, 1);
    sh.box(x, 0.18, 0.2, 0.05, 0.36, 0.05, 1);
    sh.beam(x, 0.6, -0.18, x, 0.36, 0.22, 0.04, 0.04);
  }
  sh.box(0, 0.33, 0.14, 1.44, 0.03, 0.34, 1);
  sh.box(0, 0.57, -0.14, 1.44, 0.03, 0.34, 1);
  for (const x of [-0.46, 0, 0.46]) {
    crate(k, kd, rng, x, 0.345, 0.14, 0.18);
    crate(k, kd, rng, x, 0.585, -0.14, 0.18);
  }
  // price cards on sticks
  kd.m('#f4f1e6', 'plastic');
  for (const x of [-0.46, 0.46]) kd.sh.box(x + rng.range(-0.1, 0.1), 0.56, 0.32, 0.09, 0.06, 0.003, 1);
}

/** Florist's buckets on a low stepped bench: galvanised pails, green stems as leaf cards, heads near only. */
export function flowerBuckets(k: Kit, kd: Kit, green: GreenKit | undefined, greenFrame: (lx: number, lz: number) => void, rng: Rng): void {
  const sh = k.sh;
  k.m('#5b5247', 'wood');
  sh.box(0, 0.09, -0.12, 1.32, 0.18, 0.3, 1);
  const cols = ['#e8574f', '#f2c84b', '#e8649a', '#f5f0e6', '#b46ad6', '#f08a3c'];
  const row = (z: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = -0.54 + (i / (n - 1)) * 1.08 + rng.range(-0.02, 0.02);
      k.m(rng.pick(['#9aa2a6', '#82898d', '#a9b0b3']), 'steel');
      sh.cyl(x, y, z, 0.075, 0.098, 0.24, 8, 2);
      k.m('#2f2a22', 'stone');
      sh.disc(x, y + 0.2, z, 0.09, 8, 1);
      greenFrame(x, z);
      green?.clump(0, y + 0.22, 0, 0.1, rng.range(0.34, 0.5), GREEN.GRASS, 2);
      const col = rng.pick(cols);
      kd.m(col, 'plastic');
      for (let f = 0; f < 7; f++) {
        const a = rng.range(0, 6.28),
          r = rng.range(0, 0.12);
        kd.sh.ellipsoid(x + Math.cos(a) * r, y + rng.range(0.46, 0.66), z + Math.sin(a) * r, 0.032, 0.026, 0.032, 0);
      }
    }
  };
  row(-0.12, 0.18, 5);
  row(0.16, 0, 5);
  // a card with prices, water spilled on the paving comes from the caller's contact spot
  kd.m('#f4f1e6', 'plastic');
  kd.sh.box(rng.range(-0.4, 0.4), 0.32, 0.27, 0.12, 0.08, 0.003, 1);
}

/** Second-hand book cart: a tilted trough on two wheels with a row of spines. */
export function bookCart(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  const COL = ['#7a2f35', '#1d3557', '#2a6f5a', '#c9a23a', '#3a3a40', '#a44a2a', '#e6dfcf', '#5a3f6a'];
  k.m('#6a4a2e', 'wood');
  sh.push().local(0, 0.72, 0, 0.3, 0, 0);
  sh.box(0, 0, 0, 1.1, 0.03, 0.44, 0);
  sh.box(0, 0.09, -0.21, 1.1, 0.16, 0.02, 1);
  sh.box(0, 0.05, 0.21, 1.1, 0.08, 0.02, 1);
  for (const x of [-0.55, 0.55]) sh.box(x, 0.07, 0, 0.02, 0.14, 0.44, 1);
  // books standing with their spines up: two rows
  for (const z of [-0.1, 0.09]) {
    let x = -0.52;
    while (x < 0.5) {
      const w = rng.range(0.022, 0.05),
        h = rng.range(0.14, 0.2);
      k.m(rng.pick(COL), 'plastic');
      sh.box(x + w / 2, 0.015 + h / 2, z, w, h, 0.15, 1 | 16 | 32);
      x += w + 0.002;
    }
  }
  sh.pop();
  k.m('#3a3a3c', 'iron');
  for (const x of [-0.48, 0.48]) {
    sh.beam(x, 0.72, 0.02, x, 0.05, 0.14, 0.03, 0.02);
    sh.beam(x, 0.72, 0.02, x, 0.05, -0.2, 0.03, 0.02);
  }
  kd.m('#1b1b1e', 'rubber');
  kd.sh.push().local(0, 0.07, 0.14, 0, 0, Math.PI / 2);
  kd.sh.cyl(0, -0.52, 0, 0.07, 0.07, 0.04, 10, 2);
  kd.sh.cyl(0, 0.48, 0, 0.07, 0.07, 0.04, 10, 2);
  kd.sh.pop();
}

/** Clothes rail wheeled out to the kerb: tube frame, garments on hangers, bottom shelf with shoes. */
export function clothesRail(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m('#b6babc', 'steel');
  for (const x of [-0.72, 0.72]) {
    sh.cyl(x, 0, 0, 0.012, 0.012, 1.62, 6, 0);
    sh.box(x, 0.05, 0, 0.03, 0.03, 0.46, 1);
  }
  sh.push().local(0, 1.6, 0, 0, 0, Math.PI / 2);
  sh.cyl(0, -0.73, 0, 0.012, 0.012, 1.46, 6, 2);
  sh.pop();
  const COL = ['#b8322c', '#1d3557', '#e9e2d4', '#2a6f5a', '#e0a020', '#2b2b30', '#8d6cab', '#d98a7a', '#6a8caa'];
  let x = -0.62;
  while (x < 0.6) {
    const w = rng.range(0.42, 0.5),
      h = rng.range(0.62, 1.02);
    // (hung across the rail, fanned a little: from the pavement you see the edge of each and the front of the last)
    const a = rng.range(-0.42, 0.42);
    k.m(rng.pick(COL), 'plastic');
    sh.push().local(x, 1.5, 0, 0, a + Math.PI / 2, rng.range(-0.03, 0.03));
    // shoulders narrower than the body, a little fuller at the hem
    sh.box(0, -h / 2 - 0.02, 0, w, h, 0.03, 0);
    sh.box(0, -0.015, 0, w * 0.68, 0.04, 0.026, 0);
    sh.pop();
    kd.m('#8c8f91', 'steel');
    kd.sh.beam(x, 1.6, 0, x, 1.5, 0, 0.006, 0.006);
    x += rng.range(0.07, 0.13);
  }
  k.m('#b6babc', 'steel');
  sh.box(0, 0.2, 0, 1.42, 0.012, 0.3, 1);
  for (let i = 0; i < 4; i++) {
    k.m(rng.pick(['#3a2a20', '#e9e2d4', '#7a2f35', '#222224']), 'rubber');
    sh.box(-0.5 + i * 0.32, 0.25, rng.range(-0.04, 0.04), 0.2, 0.08, 0.1, 1);
  }
}

/** Revolving postcard rack on a round foot; the cards are printed once and repeated. */
export function postcardRack(k: Kit, kd: Kit, rng: Rng, printer: Printer | null): void {
  const sh = k.sh;
  k.m('#3a3d3e', 'iron');
  sh.cyl(0, 0, 0, 0.2, 0.2, 0.02, 10, 2);
  sh.cyl(0, 0.02, 0, 0.012, 0.012, 1.58, 6, 2);
  const shk = kd.sh;
  const yaw = rng.range(0, 1.5);
  for (const s of [0, 1, 2, 3]) {
    sh.push().local(0, 0, 0, 0, yaw + (s * Math.PI) / 2, 0);
    kd.sh.push().local(0, 0, 0, 0, yaw + (s * Math.PI) / 2, 0);
    for (let row = 0; row < 4; row++) {
      for (const x of [-0.08, 0.08]) {
        const y = 0.62 + row * 0.24;
        k.m(rng.pick(['#59a7c9', '#e8c07a', '#e9e6dc', '#3f8fb0', '#e8649a']), 'plastic');
        sh.box(x, y, 0.11, 0.14, 0.1, 0.002, 0);
        const seaH = rng.range(0.25, 0.55);
        kd.m(rng.pick(['#2a6f94', '#2a9d8f', '#e9c46a']), 'plastic');
        shk.box(x, y - 0.05 + (0.1 * seaH) / 2, 0.1115, 0.135, 0.1 * seaH, 0.0006, 55);
        if (printer && row === 3 && x > 0) printer.quad(sh, 'stationery:wish', x, y + 0.0, 0.112, 0.14, 0.1, 48, 34, (g, w, h) => {
          g.fillStyle = '#f4f1e6';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#1d3557';
          g.textAlign = 'center';
          g.font = `900 ${Math.round(h * 0.3)}px ${HEAD}`;
          g.fillText('HAVEN', w / 2, h * 0.5, w * 0.9);
          g.font = `bold ${Math.round(h * 0.2)}px ${SANS}`;
          g.fillText('wish you were here', w / 2, h * 0.82, w * 0.92);
        });
      }
    }
    kd.m('#b6babc', 'steel');
    shk.box(0, 1.25, 0.1, 0.34, 0.008, 0.02, 1);
    sh.pop();
    kd.sh.pop();
  }
}

/** Doormat in the doorway (flat enough to be walked over): coir with a darker border, trodden in the middle. */
export function doorMat(kd: Kit, rng: Rng, W: number, printer: Printer | null): void {
  const sh = kd.sh;
  const D = rng.range(0.46, 0.6);
  kd.m('#3b3226', 'rubber');
  sh.box(0, 0.006, 0, W, 0.012, D, 1);
  kd.m('#7d6846', 'rubber');
  sh.box(0, 0.0135, 0, W - 0.07, 0.002, D - 0.07, 55);
  kd.m('#6a583c', 'rubber');
  sh.box(0, 0.0148, 0.02, W * 0.5, 0.001, D * 0.42, 55);
  if (printer && rng.chance(0.3)) {
    sh.push().local(0, 0.0158, 0, -Math.PI / 2, 0, 0);
    printer.quad(sh, 'mat:welcome', 0, 0, 0, W * 0.68, D * 0.44, 72, 24, (g, w, h) => {
      g.fillStyle = '#7d6846';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2c2418';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${Math.round(h * 0.72)}px ${HEAD}`;
      g.fillText('WELCOME', w / 2, h * 0.54, w * 0.94);
    });
    sh.pop();
  }
}

/** Steel cellar flaps in the pavement against the facade (X along the wall): two chequer leaves, rings, a hasp. */
export function cellarHatch(kd: Kit, rng: Rng): void {
  const sh = kd.sh;
  const W = rng.range(1.0, 1.3),
    D = rng.range(0.72, 0.92);
  const steel = rng.pick(['#4c4d4c', '#5a5850', '#3f4347']);
  kd.m('#2b2c2c', 'iron');
  sh.box(0, 0.004, 0, W + 0.06, 0.008, D + 0.06, 1);
  kd.m(steel, 'iron');
  for (const s of [-1, 1]) sh.box((s * (W / 2 + 0.002)) / 2, 0.01, 0, W / 2 - 0.006, 0.006, D, 1);
  // raised tread pattern: diagonal lozenges
  kd.m('#6a6960', 'steel');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) {
    const x = ((i + (j % 2) * 0.5) / 16 - 0.47) * W,
      z = (j / 9 - 0.44) * D;
    sh.box(x, 0.0136, z, 0.03, 0.0012, 0.008, 55);
  }
  kd.m('#c9b48a', 'iron');
  for (const s of [-1, 1]) sh.cyl(s * W * 0.12, 0.0135, 0.2, 0.024, 0.024, 0.002, 6, 1);
}

/** Pavement lights: a cast frame of small round glass lenses over a basement, lit from below after dark. */
export function pavementLights(kd: Kit, rng: Rng): void {
  const sh = kd.sh;
  const nx = rng.int(6, 9),
    nz = rng.int(3, 5);
  const P = 0.115;
  kd.m('#3d3f3f', 'iron');
  sh.box(0, 0.003, 0, nx * P + 0.05, 0.006, nz * P + 0.05, 1);
  kd.e('#a7bcb5', '#ffd9a0', 1.1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (rng.chance(0.06)) continue;
    sh.disc(((i + 0.5) / nx - 0.5) * nx * P, 0.0065, ((j + 0.5) / nz - 0.5) * nz * P, 0.042, 6, 1);
  }
}

// ───────────────────────────────────────────────────── kerbside odds and ends ──

/** Precast wheel stop at the head of a parking bay (X across the bay): two dowel pins, painted ends, scuffed top. */
export function wheelStop(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  const W = rng.range(1.65, 1.85);
  k.m(rng.pick(['#8d8a82', '#7c7a74', '#a09c92']), 'stone');
  cbox(sh, 0, 0.05, 0, W, 0.1, 0.15, 0.02);
  kd.m('#d9b52a', 'paint');
  for (const s of [-1, 1]) kd.sh.box((s * (W - 0.24)) / 2, 0.1005, 0, 0.2, 0.001, 0.11, 61);
  kd.m('#3c3b39', 'iron');
  for (const s of [-1, 1]) kd.sh.cyl((s * W) / 3.2, 0.1, 0, 0.012, 0.012, 0.003, 5, 2);
}

/** Black rubbish sacks set out at the kerb: slumped and lumpy with whatever is inside, faceted creases, matt film, tied necks. */
export function sacks(k: Kit, kd: Kit, rng: Rng, n: number): void {
  const sh = k.sh;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.46 + rng.range(-0.06, 0.06),
      z = rng.range(-0.1, 0.1);
    const r = rng.range(0.21, 0.28),
      h = rng.range(0.26, 0.36);
    const col = rng.chance(0.8) ? '#1b1c1f' : '#26292e';
    k.m(col, 'rubber');
    sh.push().local(x, 0, z, rng.range(-0.14, 0.14), rng.range(0, 6.28), rng.range(-0.14, 0.14));
    // the slumped belly, wide on the ground
    sh.ellipsoid(0, h * 0.3, 0, r * 1.08, h * 0.34, r * rng.range(0.78, 0.95), 1);
    // what is inside pushes out: a shoulder to one side, a smaller corner of a box on the other
    sh.ellipsoid(r * 0.28, h * 0.58, r * 0.08, r * 0.66, h * 0.36, r * 0.62, 0);
    sh.ellipsoid(-r * 0.36, h * 0.42, -r * 0.2, r * 0.42, h * 0.26, r * 0.46, 0);
    // tied neck with the two ears of the knot flopping over
    kd.sh.push().local(0, 0, 0, 0, 0, 0);
    kd.m(col, 'rubber');
    kd.sh.cyl(r * 0.14, h * 0.82, 0, 0.05, 0.02, 0.07, 5, 2);
    kd.sh.beam(r * 0.14, h * 0.88, 0, r * 0.14 + 0.09, h * 0.8, 0.03, 0.032, 0.008);
    kd.sh.beam(r * 0.14, h * 0.88, 0, r * 0.14 - 0.07, h * 0.82, -0.05, 0.03, 0.008);
    kd.sh.pop();
    sh.pop();
  }
}

/** Flattened cartons in a tied bundle, laid out for the morning round. */
export function cardboard(k: Kit, rng: Rng): void {
  const sh = k.sh;
  let y = 0;
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.6, 0.85),
      d = rng.range(0.42, 0.62),
      t = rng.range(0.012, 0.03);
    k.m(rng.pick(['#a9855a', '#b89668', '#9c7a50', '#c2a478']), 'wood');
    sh.push().local(rng.range(-0.04, 0.04), y + t / 2, rng.range(-0.03, 0.03), 0, rng.range(-0.1, 0.1), 0);
    sh.box(0, 0, 0, w, t, d, 1);
    sh.pop();
    y += t;
  }
  k.m('#e6e0d0', 'plastic');
  sh.box(0, y / 2, 0, 0.012, y + 0.004, 0.66, 1);
}

/** Red-and-white plastic barrier panel on rubber feet along local X. */
export function barrier(k: Kit, kd: Kit, L: number, lamp: boolean): void {
  const sh = k.sh;
  k.m('#d8d6cf', 'plastic');
  for (const s of [-1, 1]) sh.box((s * (L - 0.1)) / 2, 0.52, 0, 0.05, 1.04, 0.03, 1);
  // the striped board: red blocks on white
  k.m('#e9e6dc', 'plastic');
  sh.box(0, 0.92, 0, L - 0.05, 0.2, 0.02, 1 | 16 | 32);
  const n = Math.round(L / 0.3);
  k.m('#c8262c', 'plastic');
  for (let i = 0; i < n; i += 2) sh.box(-L / 2 + (i + 0.5) * (L / n), 0.92, 0, (L / n) * 0.96, 0.2, 0.022, 1 | 16 | 32);
  k.m('#d8d6cf', 'plastic');
  sh.box(0, 0.3, 0, L - 0.05, 0.09, 0.016, 1 | 16 | 32);
  k.m('#23252a', 'rubber');
  for (const s of [-1, 1]) sh.box((s * (L - 0.1)) / 2, 0.035, 0, 0.14, 0.07, 0.42, 1);
  if (lamp) {
    kd.m('#2c2c30', 'plastic');
    kd.sh.box(-L / 2 + 0.08, 1.07, 0, 0.05, 0.06, 0.05, 1);
    kd.e('#e8a020', '#ffb030', 3.2);
    kd.sh.cyl(-L / 2 + 0.08, 1.1, 0, 0.055, 0.055, 0.05, 8, 2);
  }
}

/** Traffic cone with a reflective sleeve on its square rubber foot. */
export function cone(k: Kit, kd: Kit): void {
  const sh = k.sh;
  k.m('#23252a', 'rubber');
  sh.box(0, 0.015, 0, 0.3, 0.03, 0.3, 1);
  k.m('#e8611f', 'plastic');
  sh.cyl(0, 0.03, 0, 0.1, 0.022, 0.52, 8, 2);
  kd.m('#ece8dc', 'plastic');
  kd.sh.cyl(0, 0.26, 0, 0.0635, 0.046, 0.13, 8, 0);
}

/** Roadworks plate on legs, facing +Z: red triangle with the digging man on a yellow backing. */
export function worksSign(k: Kit, kd: Kit, printer: Printer | null): void {
  const sh = k.sh;
  k.m('#9ba2a6', 'steel');
  sh.beam(0, 1.15, 0, -0.22, 0, -0.05, 0.022, 0.022);
  sh.beam(0, 1.15, 0, 0.22, 0, -0.05, 0.022, 0.022);
  sh.beam(0, 1.15, -0.01, 0, 0, -0.34, 0.022, 0.022);
  kd.m('#23252a', 'rubber');
  kd.sh.box(0, 0.03, -0.12, 0.56, 0.05, 0.32, 1);
  k.m('#a4a9ab', 'steel');
  sh.box(0, 0.86, 0, 0.62, 0.6, 0.006, 0);
  printer?.quad(sh, 'sign:works', 0, 0.86, 0.0036, 0.62, 0.6, 64, 62, (g, w, h) => {
    g.fillStyle = '#f2c230';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c81e2a';
    g.beginPath();
    g.moveTo(w / 2, h * 0.04);
    g.lineTo(w * 0.97, h * 0.92);
    g.lineTo(w * 0.03, h * 0.92);
    g.fill();
    g.fillStyle = '#f6f3ea';
    g.beginPath();
    g.moveTo(w / 2, h * 0.24);
    g.lineTo(w * 0.8, h * 0.82);
    g.lineTo(w * 0.2, h * 0.82);
    g.fill();
    g.fillStyle = '#16161a';
    g.beginPath();
    g.arc(w * 0.46, h * 0.46, w * 0.035, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#16161a';
    g.lineWidth = w * 0.035;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.47, h * 0.52);
    g.lineTo(w * 0.52, h * 0.65);
    g.lineTo(w * 0.42, h * 0.78);
    g.moveTo(w * 0.52, h * 0.65);
    g.lineTo(w * 0.57, h * 0.78);
    g.moveTo(w * 0.48, h * 0.56);
    g.lineTo(w * 0.62, h * 0.62);
    g.lineTo(w * 0.68, h * 0.78);
    g.stroke();
    g.beginPath();
    g.moveTo(w * 0.34, h * 0.8);
    g.lineTo(w * 0.42, h * 0.72);
    g.lineTo(w * 0.42, h * 0.8);
    g.fill();
  });
}

/** Works in the furniture band: lifted slabs stacked on a pallet, an open sand bed with a heap, tools, the new pipe. */
export function worksSite(k: Kit, kd: Kit, L: number, rng: Rng): void {
  const sh = k.sh;
  // the opened bed: damp yellow sand where the paving is up
  k.m('#8f7c58', 'stone');
  sh.box(0, 0.008, 0, L - 0.5, 0.012, 0.56, 1);
  k.m('#a08c64', 'stone');
  sh.ellipsoid(-L * 0.18, 0.02, 0.02, 0.5, 0.2, 0.26, 1);
  // the trench itself: dug soil round a dark slot, the spoil thrown up beside it
  k.m('#3a2f22', 'stone');
  sh.box(-L * 0.12, 0.015, -0.1, L * 0.52, 0.006, 0.34, 1);
  k.m('#14110d', 'stone');
  sh.box(-L * 0.12, 0.0185, -0.1, L * 0.48, 0.002, 0.22, 1);
  k.m('#4a3c2b', 'stone');
  sh.ellipsoid(-L * 0.36, 0.02, 0.14, 0.32, 0.13, 0.17, 1);
  // stacked slabs on a pallet
  k.m('#8a6f4a', 'wood');
  sh.box(L * 0.28, 0.06, 0, 0.8, 0.12, 0.5, 1);
  for (let i = 0; i < 5; i++) {
    k.m(rng.pick(['#a7a49c', '#9b9890', '#b0ada5']), 'stone');
    sh.push().local(L * 0.28 + rng.range(-0.01, 0.01), 0.13 + i * 0.05, rng.range(-0.01, 0.01), 0, rng.range(-0.03, 0.03), 0);
    sh.box(0, 0.02, 0, 0.72, 0.046, 0.44, 1);
    sh.pop();
  }
  // shovel stuck in the heap, a bucket
  k.m('#5e4a32', 'wood');
  sh.beam(-L * 0.18, 0.12, 0.02, -L * 0.18 + 0.12, 1.02, -0.06, 0.03, 0.03);
  kd.m('#3a3d40', 'steel');
  kd.sh.box(-L * 0.18 - 0.01, 0.1, 0.03, 0.2, 0.26, 0.012, 0);
  k.m('#2b2d31', 'plastic');
  sh.cyl(L * 0.02, 0.012, 0.12, 0.11, 0.14, 0.27, 8, 2);
  // the point of it all: the blue water pipe lying in the bed
  k.m('#2a5fa8', 'plastic');
  sh.beam(-L * 0.36, 0.03, -0.1, L * 0.12, 0.03, -0.1, 0.055, 0.055);
}

/** Empties out for the brewery: stacked plastic crates with bottle necks showing (the necks near only). */
export function bottleCrates(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  const col = rng.pick(['#b8322c', '#1d6f3a', '#1d3557', '#d9a51f']);
  const stacks = rng.int(2, 3);
  for (let c = 0; c < stacks; c++) {
    const x = (c - (stacks - 1) / 2) * 0.43,
      n = rng.int(1, 4);
    const yaw = rng.range(-0.05, 0.05);
    for (let i = 0; i < n; i++) {
      sh.push().local(x + rng.range(-0.01, 0.01), i * 0.3, rng.range(-0.015, 0.015), 0, yaw, 0);
      k.m(col, 'plastic');
      // walls with a hand slot: bottom rail, top rail, corner posts
      sh.box(0, 0.03, 0, 0.4, 0.06, 0.3, 1);
      sh.box(0, 0.265, 0, 0.4, 0.07, 0.3, 1 | 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.box(sx * 0.18, 0.15, sz * 0.13, 0.04, 0.18, 0.04, 1 | 2);
      k.m('#1a2a20', 'plastic');
      sh.box(0, 0.16, 0, 0.32, 0.2, 0.22, 1 | 2);
      sh.pop();
    }
    const y = n * 0.3;
    kd.sh.push().local(x, y - 0.3, 0, 0, yaw, 0);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) {
      kd.m(rng.chance(0.75) ? '#2a4a2c' : '#5a3a1e', 'glass');
      kd.sh.cyl(-0.135 + a * 0.09, 0.2, -0.09 + b * 0.09, 0.03, 0.012, 0.13, 5, 1);
    }
    kd.sh.pop();
  }
}

/** Baker's crates of the morning's loaves stacked at the kerb. */
export function breadCrates(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  for (let i = 0; i < 3; i++) {
    sh.push().local(-0.25 + (i % 2) * 0.5, i < 2 ? 0 : 0.17, i < 2 ? 0 : 0.01, 0, rng.range(-0.06, 0.06), 0);
    k.m(rng.pick(['#2c5a8c', '#b8322c', '#3a3d42']), 'plastic');
    sh.box(0, 0.015, 0, 0.5, 0.03, 0.36, 1);
    for (const y of [0.07, 0.13]) {
      sh.box(0, y, 0.175, 0.5, 0.035, 0.012, 1);
      sh.box(0, y, -0.175, 0.5, 0.035, 0.012, 1);
      sh.box(0.245, y, 0, 0.012, 0.035, 0.36, 1);
      sh.box(-0.245, y, 0, 0.012, 0.035, 0.36, 1);
    }
    k.m('#c0955a', 'wood');
    sh.box(0, 0.08, 0, 0.46, 0.09, 0.32, 1);
    for (let j = 0; j < 5; j++) {
      kd.m(rng.pick(['#c58f4e', '#b37d40', '#d2a163']), 'wood');
      kd.sh.ellipsoid(-0.18 + j * 0.09, 0.125, rng.range(-0.04, 0.04), 0.038, 0.032, 0.14, 0);
    }
    sh.pop();
  }
}

/** Hardware shop: a tub of brooms and rakes, galvanised buckets nested in a stack. */
export function brooms(k: Kit, kd: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m('#8a8e90', 'steel');
  sh.cyl(-0.34, 0, 0, 0.17, 0.2, 0.32, 10, 2);
  k.m('#3a3430', 'stone');
  sh.disc(-0.34, 0.3, 0, 0.18, 10, 1);
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, 6.28),
      r = rng.range(0.02, 0.13);
    const tx = -0.34 + Math.cos(a) * r * 2.2,
      tz = Math.sin(a) * r * 2.2;
    k.m(rng.pick(['#c7a877', '#b69561', '#9a8058']), 'wood');
    sh.beam(-0.34 + Math.cos(a) * r, 0.25, Math.sin(a) * r, tx, 1.5, tz, 0.022, 0.022);
    kd.m(rng.pick(['#c9a93e', '#3a3a3c', '#e0554a']), 'plastic');
    kd.sh.box(tx, 1.56, tz, 0.26, 0.11, 0.05, 0);
  }
  k.m('#9aa2a6', 'steel');
  sh.cyl(0.26, 0, 0.02, 0.115, 0.15, 0.26, 10, 2);
  for (let i = 1; i < 5; i++) sh.cyl(0.26, 0.2 + i * 0.05, 0.02, 0.122, 0.152, 0.05, 10, 0);
}

/** What collects against a kerb, flat on the road (X along the kerb, +Z towards it): a drift of grit, leaves, butts, a scrap. */
export function gutterDrift(kd: Kit, rng: Rng): void {
  const sh = kd.sh;
  const top = 61; // top face only
  if (rng.chance(0.55)) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      kd.m(rng.pick(['#5e5a50', '#66604f', '#55524a', '#6e6654']), 'stone');
      sh.push().local(rng.range(-0.25, 0.25), 0.001 + i * 0.0006, rng.range(-0.03, 0.03), 0, rng.range(-0.25, 0.25), 0);
      // (the grit was a flat olive plank on the road. The road's own silt and the near grit are the drift now; the dice still fall, so nothing after it moves)
      const gw = rng.range(0.2, 0.75),
        gd = rng.range(0.04, 0.12);
      if (!wearOn('wearpave')) sh.box(0, 0, 0, gw, 0.001, gd, top);
      sh.pop();
    }
  }
  for (let i = rng.int(0, 5); i > 0; i--) {
    const kind = rng.next();
    sh.push().local(rng.range(-0.45, 0.45), 0.003 + i * 0.0004, rng.range(-0.1, 0.08), 0, rng.range(0, 3.14), 0);
    if (kind < 0.6) {
      kd.m(rng.pick(['#6d4f2a', '#8a6a34', '#5a4326', '#7a5a2c', '#a07a3a']), 'wood');
      sh.box(0, 0, 0, rng.range(0.04, 0.08), 0.001, rng.range(0.025, 0.05), top);
    } else if (kind < 0.85) {
      kd.m(rng.pick(['#d8d0bc', '#c49a6c']), 'plastic');
      sh.box(0, 0, 0, 0.03, 0.001, 0.009, top);
    } else {
      kd.m(rng.pick(['#cfcabb', '#b8b3a6', '#8ca0a8']), 'plastic');
      sh.box(0, 0, 0, rng.range(0.05, 0.12), 0.001, rng.range(0.04, 0.08), top);
    }
    sh.pop();
  }
}
