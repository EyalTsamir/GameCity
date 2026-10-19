// Old-town townhouses (also the Market Quarter rows): pastel facades with a
// window rhythm, frames, shutters and flower boxes, cornices, gable / stepped
// gable / mansard / flat roofs with dormers and chimneys, ground-floor shops
// with display windows, fascia signs, striped awnings and blade signs.

import * as THREE from 'three';
import {
  Gen, LRect, Side, FRONT, RIGHT, BACK, LEFT, SideGeom, Grid,
  sideGeom, sideBox, sx, sz, makeGrid, gridU, gridY0, gridY1, wallGrid, wallPlain, wallTri,
  gableRoof, roofLook, roofPoly, flatRoof, chimney, doorNiche, bandWithOpenings, railing,
  signOnSide, col, shade, setCol, mixCol, lightBox,
} from './gen';
import { WIN, PROF, WALLPAT, ROOFPAT, FRAME, GLASS, LIGHT_MODE } from './materials';
import { boardSign, bladeSign } from './signs';
import { PALETTE } from '../../core/gfx';
import { anchors } from './anchors';
import { windowBox, balconyLife, shutterPair, shutterState, julietBalcony, acUnit, dish, downpipe, potPlant, ironRail, climber, roofClutter as clutterRoof } from './clutter';
import { GREEN } from './green';

const SHOPS: { name: string; blade: string }[] = [
  { name: 'Bakery', blade: 'B' },
  { name: 'Café Rosa', blade: 'C' },
  { name: 'Books', blade: 'B' },
  { name: 'Florist', blade: 'F' },
  { name: 'Delicatessen', blade: 'D' },
  { name: 'Gelato', blade: 'G' },
  { name: 'Pharmacy', blade: '+' },
  { name: 'Barber', blade: 'B' },
  { name: 'Bistro', blade: 'B' },
  { name: 'Toy Shop', blade: 'T' },
  { name: 'Wine Bar', blade: 'W' },
  { name: 'Cheese', blade: 'C' },
  { name: 'Tailor', blade: 'T' },
  { name: 'Tea Room', blade: 'T' },
  { name: 'Greengrocer', blade: 'G' },
  { name: 'Butcher', blade: 'B' },
  { name: 'Optician', blade: 'O' },
  { name: 'Hardware', blade: 'H' },
  { name: 'Pâtisserie', blade: 'P' },
  { name: 'Antiques', blade: 'A' },
  { name: 'Records', blade: 'R' },
  { name: 'Bike Shop', blade: 'B' },
  { name: 'Pizzeria', blade: 'P' },
  { name: 'Fish & Chips', blade: 'F' },
  { name: 'Chocolates', blade: 'C' },
  { name: 'Stationery', blade: 'S' },
  { name: 'Gallery', blade: 'G' },
  { name: 'The Anchor', blade: 'A' },
  { name: 'Shoes', blade: 'S' },
  { name: 'Hat Shop', blade: 'H' },
  { name: 'Bookbinder', blade: 'B' },
  { name: 'Ice & Cream', blade: 'I' },
  { name: 'Lighthouse Pub', blade: 'L' },
  { name: 'Post Office', blade: 'P' },
];

const SHOP_PAINT = ['#2f5d50', '#6d2e2e', '#263a5c', '#2b2b2b', '#7a5a2a', '#2a6f74', '#5b3b5e', '#3f5f2f'];
const SHUTTER = ['#4f7d5c', '#457b9d', '#9c3d33', '#5f6b73', '#2a6f74', '#7a8f4e', '#3c4f7a', '#b07b3a'];
const DOORS = ['#2f5d50', '#7a2e2a', '#263a5c', '#3b2a20', '#2a6f74', '#7d5a2a', '#1f2a33', '#8d6cab'];
const AWNING = ['#e63946', '#2a9d8f', '#457b9d', '#f4a261', '#2f5d50', '#8d6cab', '#c0392b', '#e9c46a'];
const FLOWERS = ['#e63946', '#ff7aa2', '#f1faee', '#f4a261', '#b05bd6', '#ffd23f'];

interface GhostAd {
  text: string;
  sub: string;
  bg: string;
  fg: string;
}
const GHOST: GhostAd[] = [
  { text: 'HAVEN COCOA', sub: 'Pure · Rich · Warming', bg: '#7a3b2e', fg: '#f3e3c3' },
  { text: 'LIGHTHOUSE TEA', sub: 'Since 1902', bg: '#2f5d50', fg: '#f1e6c8' },
  { text: 'KESTREL BISCUITS', sub: 'The Seaside Favourite', bg: '#263a5c', fg: '#f4e7c9' },
  { text: 'TINY SOAP', sub: 'For Spotless Homes', bg: '#c9b48a', fg: '#5a2e22' },
  { text: 'GULL LEMONADE', sub: 'Ice Cold · 5c', bg: '#e9c46a', fg: '#7a2e2a' },
  { text: 'MARINER CIGARS', sub: 'Finest Harbour Blend', bg: '#5b3b5e', fg: '#efe0c0' },
];

function ghostPainter(ad: GhostAd) {
  return (g2: CanvasRenderingContext2D, w: number, h: number, glow: boolean) => {
    if (glow) {
      g2.fillStyle = '#000';
      g2.fillRect(0, 0, w, h);
      return;
    }
    g2.fillStyle = ad.bg;
    g2.fillRect(0, 0, w, h);
    g2.strokeStyle = ad.fg;
    g2.lineWidth = 5;
    g2.strokeRect(8, 8, w - 16, h - 16);
    g2.fillStyle = ad.fg;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    let size = 44;
    do {
      g2.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
      size -= 2;
    } while (g2.measureText(ad.text).width > w * 0.86 && size > 10);
    g2.fillText(ad.text, w / 2, h * 0.42);
    g2.font = `italic bold ${Math.round(h * 0.15)}px Georgia, serif`;
    g2.fillText(ad.sub, w / 2, h * 0.74);
    // weathering: faded patches + brick showing through
    for (let i = 0; i < 70; i++) {
      const x = ((i * 97) % w) + ((i * 13) % 7),
        y = ((i * 53) % h) + ((i * 29) % 5);
      g2.fillStyle = `rgba(${150 + ((i * 7) % 60)},${110 + ((i * 11) % 40)},${90 + ((i * 3) % 30)},${0.12 + ((i * 17) % 10) / 60})`;
      g2.fillRect(x, y, 6 + ((i * 31) % 26), 3 + ((i * 7) % 9));
    }
    g2.fillStyle = 'rgba(255,255,255,0.10)';
    g2.fillRect(0, 0, w, h);
  };
}

let shopCounter = 0;

/** shop interior type for the facade shader (materials.ts bhShop): 1 café/bar, 2 bakery/deli, 3 books,
 *  4 florist/grocer, 5 fashion, 6 pharmacy/hardware, 7 gallery/antiques/toys */
function shopType(name: string): number {
  if (/Café|Bistro|Wine|Tea|Pizzeria|Fish|Anchor|Pub|Gelato|Ice/.test(name)) return 1;
  if (/Bakery|Pâtisserie|Chocolates|Cheese|Delicatessen|Butcher/.test(name)) return 2;
  if (/Books|Records|Stationery|Bookbinder/.test(name)) return 3;
  if (/Florist|Greengrocer/.test(name)) return 4;
  if (/Shoes|Hat|Tailor|Optician|Barber/.test(name)) return 5;
  if (/Pharmacy|Hardware|Post|Bike/.test(name)) return 6;
  return 7;
}
export function resetOldtown(): void {
  shopCounter = 0;
}

interface Part {
  a: number;
  b: number;
  covered: boolean;
  h: number;
}

/** Partition a body side [0, L] into exposed / covered parts (cover is in footprint-u, shifted by `shift`). */
export function partitionSide(g: Gen, s: Side, L: number, shift: number): Part[] {
  const out: Part[] = [];
  let cur = 0;
  for (const iv of g.cover[s]) {
    const a = Math.max(0, iv.a - shift),
      b = Math.min(L, iv.b - shift);
    if (b <= a + 0.05) continue;
    if (a > cur + 0.05) out.push({ a: cur, b: a, covered: false, h: 0 });
    out.push({ a: Math.max(cur, a), b, covered: true, h: iv.h });
    cur = b;
  }
  if (L > cur + 0.05) out.push({ a: cur, b: L, covered: false, h: 0 });
  else if (out.length) out[out.length - 1].b = L;
  if (out.length === 0) out.push({ a: 0, b: L, covered: false, h: 0 });
  return out;
}

const PREV: Side[] = [LEFT, FRONT, RIGHT, BACK];
/** side at the far end (u = L) of each side */
const NEXT: Side[] = [RIGHT, BACK, LEFT, FRONT];

export function genTownhouse(g: Gen): void {
  const { lot, rng, W, D } = g;
  const shop = lot.shopfront;
  const floors = Math.max(2, lot.floors);
  const eave = lot.height;
  const exposed = [0, 1, 2, 3].map((s) => g.cover[s].length === 0);
  const INS = 0.16;
  const ins = exposed.map((e) => (e ? INS : 0));
  const body: LRect = { x0: -W / 2 + ins[LEFT], x1: W / 2 - ins[RIGHT], z0: -D / 2 + ins[BACK], z1: D / 2 - ins[FRONT] };

  // ── storey heights
  const gH = shop ? rng.range(3.85, 4.25) : rng.range(3.35, 3.65);
  let fH = Math.max(2.95, (eave - gH - 0.6) / (floors - 1));
  if (gH + fH * (floors - 1) > eave - 0.3) fH = (eave - gH - 0.3) / (floors - 1);
  const topOfWindows = gH + fH * (floors - 1);

  // ── look
  const wallC = g.wallColor;
  const trimC = rng.chance(0.7) ? col(rng.pick(['#f4efe4', '#efe6d2', '#f7f3ea'])) : shade(wallC, rng.chance(0.5) ? 0.78 : 1.12);
  const shutters = rng.chance(0.5);
  const shutterC = col(rng.pick(SHUTTER));
  const flowers = rng.chance(0.72);
  // how lived-in the upper floors look (plants, balconies) — varies per house
  const lived = rng.range(0.55, 1.25);
  const surrounds = rng.chance(0.45);
  const pediments = rng.chance(0.25);
  const arched = rng.chance(0.2);
  const doorC = col(rng.pick(DOORS));
  const frameIdx = rng.chance(0.8) ? FRAME.WHITE : rng.pick([FRAME.GREEN, FRAME.WOOD, FRAME.CREAM]);
  const pattern = rng.chance(0.18) ? WALLPAT.BRICK : WALLPAT.PLASTER;
  const wallLook = { color: wallC, pattern, seed: g.seed };
  const winStyle: number = arched ? WIN.ARCHED : WIN.MUNTIN;
  const look = (profile: number, style: number = winStyle) => ({ color: wallC, pattern, frame: frameIdx, glass: GLASS.NEUTRAL, style, profile, seed: g.seed });

  // ── upper-floor window grid on a span of a side
  const upperGrid = (uA: number, uB: number, nWanted?: number): Grid => {
    const len = uB - uA;
    const n = nWanted ?? Math.max(1, Math.min(4, Math.round((len - 0.9) / 2.55)));
    return makeGrid(uA, uB, gH, fH, floors - 1, {
      spacing: 2.55,
      cols: n,
      winW: Math.min(1.25, Math.max(0.85, ((len - 1.0) / n) * 0.5)),
      winH: Math.min(fH * 0.6, 1.95),
      sill: Math.min(0.92, fH * 0.3),
      margin: len > 5 ? 0.55 : 0.35,
    });
  };

  /** inset of the body from the footprint on the side sg lies on (room for things below 2.4 m) */
  const sideIns = (sg: SideGeom): number => (sg.nz > 0.5 ? ins[FRONT] : sg.nz < -0.5 ? ins[BACK] : sg.nx > 0.5 ? ins[RIGHT] : ins[LEFT]);
  let shopName: string | null = null;
  /** windows (row:col) that already carry a balcony — no window box there */
  let skipBox = new Set<string>();
  // ── sides
  for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, s);
    const parts = partitionSide(g, s, sg.L, ins[PREV[s]]);
    for (const p of parts) {
      // facade-shader corner darkening only at real building corners (not at flush party walls)
      g.shell.cornerMask = (p.a > 0.05 || exposed[PREV[s]] ? 1 : 0) | (p.b < sg.L - 0.05 || exposed[NEXT[s]] ? 2 : 0);
      if (p.covered) {
        wallPlain(g.shell, sg, p.a, p.b, 0, eave, wallLook);
        // painted advertisement on a tall blank party wall above a lower neighbour
        const free = eave - p.h;
        if ((s === LEFT || s === RIGHT) && free > 3.6 && p.b - p.a > 6 && rng.chance(free > 5 ? 0.85 : 0.5)) ghostSign(sg, p.a, p.b, p.h, eave);
        continue;
      }
      const len = p.b - p.a;
      if (s === FRONT) buildFront(sg, p.a, p.b);
      else if (len < 2.2) wallPlain(g.shell, sg, p.a, p.b, 0, eave, wallLook);
      else buildSecondary(sg, p.a, p.b, s === BACK, exposed[s]);
    }
  }
  g.shell.cornerMask = 3;

  function ghostSign(sg: SideGeom, uA: number, uB: number, yLow: number, yTop: number): void {
    const ad = GHOST[(lot.seed >>> 4) % GHOST.length];
    const h = Math.min(yTop - yLow - 1.0, 3.2);
    const w = Math.min(uB - uA - 1.5, h * 2.6);
    if (w < 3 || h < 1.8) return;
    const r = g.atlas.add(`ghost:${ad.text}`, 320, 128, ghostPainter(ad));
    const uc = (uA + uB) / 2;
    const y0 = yLow + 0.6 + rng.range(0, Math.max(0, yTop - yLow - h - 1.0));
    signOnSide(g, sg, uc - w / 2, uc + w / 2, 0.035, y0, y0 + h, r);
  }

  function windowTrim(sg: SideGeom, gr: Grid, rich: boolean): void {
    const t = g.trim;
    for (let j = 0; j < gr.m; j++) {
      for (let i = 0; i < gr.n; i++) {
        const u = gridU(gr, i);
        const ww = gr.wx1 - gr.wx0;
        const y0 = gridY0(gr, j),
          y1 = gridY1(gr, j);
        // sill
        setCol(t, trimC);
        sideBox(t, sg, u - ww / 2 - 0.1, u + ww / 2 + 0.1, 0, 0.13, y0 - 0.08, y0, true);
        if (!rich) continue;
        if (surrounds) {
          sideBox(t, sg, u - ww / 2 - 0.12, u - ww / 2, 0, 0.05, y0, y1);
          sideBox(t, sg, u + ww / 2, u + ww / 2 + 0.12, 0, 0.05, y0, y1);
        }
        if (pediments && j === 0 && !arched) {
          // little triangular pediment on the first floor
          const ax = sx(sg, u - ww / 2 - 0.18, 0),
            az = sz(sg, u - ww / 2 - 0.18, 0),
            bx = sx(sg, u + ww / 2 + 0.18, 0),
            bz = sz(sg, u + ww / 2 + 0.18, 0);
          const ox = sg.nx * 0.12,
            oz = sg.nz * 0.12;
          const mx = sx(sg, u, 0),
            mz = sz(sg, u, 0);
          const yb = y1 + 0.08,
            yt = y1 + 0.45;
          t.triangle(ax + ox, yb, az + oz, bx + ox, yb, bz + oz, mx + ox, yt, mz + oz);
          t.quadAway(ax, yb, az, ax + ox, yb, az + oz, mx + ox, yt, mz + oz, mx, yt, mz, mx - sg.nx * 5, yb, mz - sg.nz * 5);
          t.quadAway(bx, yb, bz, bx + ox, yb, bz + oz, mx + ox, yt, mz + oz, mx, yt, mz, mx - sg.nx * 5, yb, mz - sg.nz * 5);
          sideBox(t, sg, u - ww / 2 - 0.18, u + ww / 2 + 0.18, 0, 0.12, y1, y1 + 0.09, true);
        } else if (!arched) {
          sideBox(t, sg, u - ww / 2 - 0.13, u + ww / 2 + 0.13, 0, 0.08, y1, y1 + 0.15, true);
        } else {
          // keystone on arched windows
          sideBox(t, sg, u - 0.1, u + 0.1, 0, 0.07, y1 - 0.12, y1 + 0.16);
        }
        // shutters in different positions: open, closed against the sun, one leaf, ajar
        if (shutters) shutterPair(g, sg, u, ww, y0, y1, shutterC, shutterState(g, sg.nz > 0.5 || sg.nx < -0.5), arched ? ww * 0.5 : 0);
        if (skipBox.has(`${j}:${i}`)) continue;
        if (flowers && rng.chance(0.62 * lived)) windowBox(g, sg, u, ww, y0);
        else if (y0 > 3 && rng.chance(0.14 * lived)) julietBalcony(g, sg, u, ww, y0);
        else if (!shutters && y0 > 3 && rng.chance(0.08)) acUnit(g, sg, u + ww / 2 + 0.55, y0 + 0.1, 0);
      }
    }
  }

  function buildFront(sg: SideGeom, uA: number, uB: number): void {
    const t = g.trim;
    const doors = g.doors.filter((d) => d.side === FRONT).map((d) => d.u - ins[PREV[FRONT]]);
    const doorU = doors.length ? Math.min(uB - 0.9, Math.max(uA + 0.9, doors[0])) : (uA + uB) / 2;
    // ── ground floor
    const dw = shop ? 1.3 : 1.15;
    const dh = shop ? 2.55 : 2.35;
    const ops = [{ u: doorU, w: dw, h: dh }];
    const shopC = col(SHOP_PAINT[(lot.seed >>> 3) % SHOP_PAINT.length]);
    const groundTop = gH;
    if (shop) {
      const fasciaY0 = gH - 0.82,
        fasciaY1 = gH - 0.14;
      const shopDef = SHOPS[(shopCounter++ * 7 + (lot.seed % 5)) % SHOPS.length];
      shopName = shopDef.name;
      const shopT = shopType(shopDef.name);
      anchors.shop(sx(sg, uA, 0), sz(sg, uA, 0), sx(sg, uB, 0), sz(sg, uB, 0), sg.nx, sg.nz, sx(sg, doorU, 0), sz(sg, doorU, 0), shopDef.name, shopT);
      bandWithOpenings(
        sg, uA, uB, ops,
        (a, b) => {
          const len = b - a;
          const n = len > 4.6 ? 2 : 1;
          const gr = makeGrid(a, b, 0, gH, 1, { spacing: len / n, cols: n, winW: (len - 0.5) / n - 0.25, winH: fasciaY0 - 0.12 - 0.3, sill: 0.3, margin: 0.22 });
          wallGrid(g.shell, sg, a, b, 0, groundTop, gr, { ...look(PROF.SHOP, WIN.SHOP), color: shopC, pattern: WALLPAT.SMOOTH + 16 * shopT, frame: FRAME.DARK });
        },
        (a, b, y0) => wallPlain(g.shell, sg, a, b, y0, groundTop, { color: shopC, pattern: WALLPAT.SMOOTH, seed: g.seed }),
      );
      doorNiche(g, sg, doorU, { w: dw, h: dh, depth: 0.35, wallColor: shopC, frameColor: shade(shopC, 0.8), doorColor: shopC, glass: true, profile: PROF.SHOP, seed: g.seed + 1, frameOut: 0.1 });
      // pilasters at both ends of the shopfront
      setCol(t, shade(shopC, 0.9));
      sideBox(t, sg, uA, uA + 0.32, 0, 0.14, 0, gH - 0.1);
      sideBox(t, sg, uB - 0.32, uB, 0, 0.14, 0, gH - 0.1);
      setCol(t, trimC);
      sideBox(t, sg, uA - 0.0, uA + 0.36, 0, 0.15, gH - 0.95, gH - 0.8);
      sideBox(t, sg, uB - 0.36, uB, 0, 0.15, gH - 0.95, gH - 0.8);
      // fascia board + sign (above 2.4 m, may project)
      setCol(t, shopC);
      sideBox(t, sg, uA + 0.3, uB - 0.3, 0, 0.16, fasciaY0, fasciaY1, true);
      setCol(t, trimC);
      sideBox(t, sg, uA + 0.2, uB - 0.2, 0, 0.22, fasciaY1, fasciaY1 + 0.08, true);
      const gold = rng.chance(0.6) ? '#f2d27a' : '#f6f0e0';
      const signRect = g.atlas.add(`shop:${shopDef.name}:${shopC.getHexString()}`, 256, 48, boardSign(shopDef.name, { bg: `#${shopC.getHexString()}`, fg: gold, border: gold, glow: 0.75, glowColor: '#ffd9a0' }));
      const sLen = Math.min(uB - uA - 0.9, (fasciaY1 - fasciaY0 - 0.1) * 5.3);
      const sc = (uA + uB) / 2;
      signOnSide(g, sg, sc - sLen / 2, sc + sLen / 2, 0.195, fasciaY0 + 0.05, fasciaY1 - 0.05, signRect);
      // small lamps over the sign
      for (const lu of [sc - sLen * 0.3, sc + sLen * 0.3]) {
        setCol(t, col('#2b2b2b'));
        sideBox(t, sg, lu - 0.03, lu + 0.03, 0.16, 0.42, fasciaY1 + 0.05, fasciaY1 + 0.1);
        const lx = sx(sg, lu, 0.45),
          lz = sz(sg, lu, 0.45);
        lightBox(g, lx - 0.06, fasciaY1 - 0.02, lz - 0.06, lx + 0.06, fasciaY1 + 0.08, lz + 0.06, '#ffd59a', LIGHT_MODE.STEADY, 3.0);
      }
      // awning
      if (rng.chance(0.78)) awning(sg, uA + 0.38, uB - 0.38, fasciaY0 - 0.04);
      // blade sign
      if (rng.chance(0.45)) {
        const bu = rng.chance(0.5) ? uA + 0.18 : uB - 0.18;
        bladeSignAt(sg, bu, gH + 0.25, shopDef.blade, shopC);
      }
    } else {
      bandWithOpenings(
        sg, uA, uB, ops,
        (a, b) => {
          const len = b - a;
          if (len < 1.6) {
            wallPlain(g.shell, sg, a, b, 0, groundTop, wallLook);
            return;
          }
          const n = Math.max(1, Math.min(2, Math.round((len - 0.6) / 2.4)));
          const gr = makeGrid(a, b, 0, gH, 1, { spacing: 2.4, cols: n, winW: 1.05, winH: Math.min(1.75, gH - 1.35), sill: 0.95, margin: 0.4 });
          wallGrid(g.shell, sg, a, b, 0, groundTop, gr, look(PROF.HOME));
          windowTrim(sg, gr, false);
        },
        (a, b, y0) => wallPlain(g.shell, sg, a, b, y0, groundTop, wallLook),
      );
      doorNiche(g, sg, doorU, { w: dw, h: dh, depth: 0.3, wallColor: wallC, frameColor: trimC, doorColor: doorC, transom: true, profile: PROF.HOME, lamp: true, seed: g.seed + 1, frameOut: 0.1 });
    }
    // plinth (stone base) — split around the door
    setCol(t, col(shop ? '#7d776f' : '#a39b8f'));
    if (doorU - dw / 2 - 0.14 > uA) sideBox(t, sg, uA, doorU - dw / 2 - 0.14, 0, 0.06, 0, shop ? 0.3 : 0.45);
    if (doorU + dw / 2 + 0.14 < uB) sideBox(t, sg, doorU + dw / 2 + 0.14, uB, 0, 0.06, 0, shop ? 0.3 : 0.45);

    // ── upper floors
    const gr = upperGrid(uA, uB);
    wallGrid(g.shell, sg, uA, uB, gH, eave, gr, look(PROF.HOME));
    skipBox = planBalconies(gr);
    windowTrim(sg, gr, true);
    skipBox = new Set();
    // string course + cornice
    setCol(t, trimC);
    sideBox(t, sg, uA, uB, 0, 0.12, gH - 0.02, gH + 0.16, true);
    if (lot.roof !== 'flat') {
      sideBox(t, sg, uA, uB, 0, 0.2, eave - 0.32, eave - 0.12, true);
    }

    /** balconies (with life) across one or two window columns; returns the windows they serve */
    function planBalconies(grd: Grid): Set<string> {
      const used = new Set<string>();
      if (grd.n < 1 || grd.m < 1) return used;
      const ironC = col(rng.pick(['#2c3035', '#2c3035', '#3b4a40', '#5a3a2a', '#e9e4d8']));
      const wide = rng.chance(0.55);
      for (let j = 0; j < grd.m; j++) {
        // first floor: a central balcony on about half the houses; higher floors: fewer
        const p = (j === 0 ? 0.5 : j === grd.m - 1 ? 0.18 : 0.3) * lived;
        if (floors < 3 || !rng.chance(p)) continue;
        let i: number, i2: number;
        if (wide && grd.n >= 2) {
          i = Math.floor(grd.n / 2) - (grd.n % 2 === 0 ? 1 : 0);
          i2 = grd.n % 2 === 0 ? i + 1 : i;
        } else {
          i = i2 = rng.int(0, grd.n - 1);
        }
        const u0 = gridU(grd, i) - (grd.wx1 - grd.wx0) / 2 - 0.4,
          u1 = gridU(grd, i2) + (grd.wx1 - grd.wx0) / 2 + 0.4;
        const yb = gridY0(grd, j) - 0.1;
        const dep = j === 0 ? 0.78 : 0.62;
        setCol(t, trimC);
        sideBox(t, sg, u0, u1, 0, dep, yb - 0.14, yb, true);
        // corbels under the slab
        setCol(t, shade(trimC, 0.9));
        for (const cu of [u0 + 0.15, u1 - 0.15]) sideBox(t, sg, cu - 0.08, cu + 0.08, 0, dep - 0.1, yb - 0.42, yb - 0.14, true);
        ironRail(g, sg, u0 + 0.03, u1 - 0.03, dep - 0.05, yb, 0.95, ironC, true);
        anchors.balcony(sx(sg, (u0 + u1) / 2, dep / 2), yb, sz(sg, (u0 + u1) / 2, dep / 2), sg.nx, sg.nz, u1 - u0, dep, 0.95);
        balconyLife(g, sg, u0 + 0.06, u1 - 0.06, yb, { rail: 0.95, depth: dep - 0.06, green: 1.1 * lived });
        for (let k = i; k <= i2; k++) used.add(`${j}:${k}`);
      }
      return used;
    }

    // a climber on some fronts: ivy / jasmine up one end, or bougainvillea framing the door
    if (!shop && rng.chance(0.3 * lived)) {
      const kind = rng.weighted([GREEN.IVY_WALL, GREEN.BOUGAIN, GREEN.JASMINE], [2, 1.6, 0.8]);
      const atDoor = kind === GREEN.BOUGAIN && !shop;
      const cu = atDoor ? doorU + (rng.chance(0.5) ? -1 : 1) * (dw / 2 + 0.45) : rng.chance(0.5) ? uA + 0.7 : uB - 0.7;
      climber(g, sg, cu, rng.range(1.0, 2.4), Math.min(eave - 0.6, gH + rng.range(0.5, 1.6) * fH), ins[FRONT], kind);
    }
    // services on the front: a downpipe at one end of the gutter, maybe an AC unit or a dish up top
    if (lot.roof !== 'flat' && ins[FRONT] > 0.1 && rng.chance(0.75)) downpipe(g, sg, rng.chance(0.5) ? uA + 0.18 : uB - 0.18, eave - 0.15, undefined, ins[FRONT]);
    if (gr.n > 0 && gr.m > 1 && rng.chance(0.22)) dish(g, sg, rng.chance(0.5) ? uA + 0.5 : uB - 0.5, eave - 1.2, 0.02);
  }

  function awning(sg: SideGeom, uA: number, uB: number, yTop: number): void {
    const t = g.trim;
    const ac = col(AWNING[(lot.seed >>> 5) % AWNING.length]);
    const white = col('#f4f1ea');
    const out = 1.05;
    const yF = Math.max(2.72, yTop - 0.55);
    const stripes = Math.max(3, Math.round((uB - uA) / 0.34));
    const sw = (uB - uA) / stripes;
    for (let k = 0; k < stripes; k++) {
      const a = uA + k * sw,
        b = a + sw;
      setCol(t, k % 2 === 0 ? ac : white);
      const p0x = sx(sg, a, 0.02), p0z = sz(sg, a, 0.02);
      const p1x = sx(sg, b, 0.02), p1z = sz(sg, b, 0.02);
      const q0x = sx(sg, a, out), q0z = sz(sg, a, out);
      const q1x = sx(sg, b, out), q1z = sz(sg, b, out);
      // sloped canvas (faces up/out) + underside
      t.quadAway(q0x, yF, q0z, q1x, yF, q1z, p1x, yTop, p1z, p0x, yTop, p0z, sx(sg, (a + b) / 2, 0.2), yF - 1, sz(sg, (a + b) / 2, 0.2));
      setCol(t, k % 2 === 0 ? shade(ac, 0.6) : shade(white, 0.62));
      t.quadAway(q0x, yF - 0.005, q0z, q1x, yF - 0.005, q1z, p1x, yTop - 0.005, p1z, p0x, yTop - 0.005, p0z, sx(sg, (a + b) / 2, 0.8), yTop + 1, sz(sg, (a + b) / 2, 0.8));
      // valance (scalloped look via alternating heights)
      setCol(t, k % 2 === 0 ? ac : white);
      const vh = 0.2 + (k % 2) * 0.04;
      t.quadAway(q0x, yF - vh, q0z, q1x, yF - vh, q1z, q1x, yF, q1z, q0x, yF, q0z, sx(sg, (a + b) / 2, 0), yF, sz(sg, (a + b) / 2, 0));
    }
    // side cheeks
    setCol(t, ac);
    for (const [u, sgn] of [
      [uA, -1],
      [uB, 1],
    ] as [number, number][]) {
      const wx = sx(sg, u, 0.02), wz = sz(sg, u, 0.02);
      const ox = sx(sg, u, out), oz = sz(sg, u, out);
      const refx = sx(sg, u - sgn, 0.5), refz = sz(sg, u - sgn, 0.5);
      // triangle (wall top, front top, front bottom)
      const nx0 = wx, nz0 = wz;
      t.quadAway(nx0, yTop, nz0, ox, yF, oz, ox, yF - 0.2, oz, nx0, yTop - 0.05, nz0, refx, yF, refz);
    }
    // metal arms
    setCol(t, col('#3a3a3a'));
    for (const u of [uA + 0.1, uB - 0.1]) {
      t.beam(sx(sg, u, 0.02), yTop - 0.75, sz(sg, u, 0.02), sx(sg, u, out - 0.05), yF + 0.02, sz(sg, u, out - 0.05), 0.04, 0.04);
    }
  }

  function bladeSignAt(sg: SideGeom, u: number, y: number, letter: string, c: THREE.Color): void {
    const t = g.trim;
    const r = g.atlas.add(`blade:${letter}:${c.getHexString()}`, 64, 64, bladeSign(letter, `#${c.getHexString()}`, '#f2d27a', '#c9a24a'));
    // bracket
    setCol(t, col('#2b2b2b'));
    sideBox(t, sg, u - 0.03, u + 0.03, 0, 0.95, y + 0.72, y + 0.78, true);
    t.beam(sx(sg, u, 0.0), y + 0.35, sz(sg, u, 0.0), sx(sg, u, 0.5), y + 0.74, sz(sg, u, 0.5), 0.03, 0.03);
    // board: perpendicular to the wall, centred 0.6 m out, 0.6 m across
    const o0 = 0.3,
      o1 = 0.9;
    const yb = y,
      yt = y + 0.6;
    const ax = sx(sg, u, o0), az = sz(sg, u, o0), bx = sx(sg, u, o1), bz = sz(sg, u, o1);
    const tx = sg.tx * 0.035,
      tz = sg.tz * 0.035;
    const s = g.signs;
    // face towards +t: left end is the outer end (o1)
    s.quad(bx + tx, yb, bz + tz, ax + tx, yb, az + tz, ax + tx, yt, az + tz, bx + tx, yt, bz + tz, r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1);
    // face towards -t: left end is the wall end (o0)
    s.quad(ax - tx, yb, az - tz, bx - tx, yb, bz - tz, bx - tx, yt, bz - tz, ax - tx, yt, az - tz, r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1);
    // rim
    setCol(t, col('#c9a24a'));
    sideBox(t, sg, u - 0.03, u + 0.03, o0 + 0.05, o1 - 0.05, yb + 0.26, yb + 0.34, true);
  }

  function buildSecondary(sg: SideGeom, uA: number, uB: number, isBack: boolean, fullSide: boolean): void {
    const t = g.trim;
    const len = uB - uA;
    // old ivy on exposed side / back walls
    if (rng.chance(isBack ? 0.3 : 0.22) && len > 3) {
      const w = rng.range(1.6, Math.min(5, len - 0.6));
      climber(g, sg, uA + 0.3 + w / 2 + rng.next() * Math.max(0, len - w - 0.6), w, rng.range(3.5, Math.max(4, eave - 0.8)), sideIns(sg), rng.chance(0.75) ? GREEN.IVY_WALL : GREEN.JASMINE);
    }
    // ground floor
    const n0 = Math.max(1, Math.min(4, Math.round((len - 0.8) / 2.7)));
    const gr0 = makeGrid(uA, uB, 0, gH, 1, { spacing: 2.7, cols: n0, winW: 1.0, winH: Math.min(1.7, gH - 1.4), sill: 0.95, margin: 0.5 });
    wallGrid(g.shell, sg, uA, uB, 0, gH, gr0, look(isBack ? PROF.HOME : PROF.HOME));
    if (fullSide) windowTrim(sg, gr0, false);
    // upper floors
    const gr = upperGrid(uA, uB, Math.max(1, Math.min(4, Math.round((len - 0.9) / (isBack ? 2.9 : 2.6)))));
    wallGrid(g.shell, sg, uA, uB, gH, eave, gr, look(PROF.HOME));
    windowTrim(sg, gr, !isBack);
    // the back of the house: AC condensers under windows, a dish, a downpipe
    if (gr.n > 0) {
      for (let j = 0; j < gr.m; j++) {
        if (!rng.chance(isBack ? 0.45 : 0.2)) continue;
        const i = rng.int(0, gr.n - 1);
        const side = rng.chance(0.5) ? -1 : 1;
        const uu = gridU(gr, i) + side * ((gr.wx1 - gr.wx0) / 2 + 0.55);
        if (uu > uA + 0.5 && uu < uB - 0.5) acUnit(g, sg, uu, gridY0(gr, j) - 0.05, 0);
      }
      if (isBack && rng.chance(0.3)) dish(g, sg, rng.chance(0.5) ? uA + 0.45 : uB - 0.45, eave - 1.0, 0.02);
    }
    if (isBack && lot.roof !== 'flat' && sideIns(sg) > 0.1 && rng.chance(0.6)) downpipe(g, sg, rng.chance(0.5) ? uA + 0.18 : uB - 0.18, eave - 0.15, undefined, sideIns(sg));
    setCol(t, trimC);
    if (!isBack || fullSide) sideBox(t, sg, uA, uB, 0, 0.12, gH - 0.02, gH + 0.16, true);
    if (lot.roof !== 'flat') sideBox(t, sg, uA, uB, 0, 0.18, eave - 0.3, eave - 0.12, true);
  }

  // ── roof
  buildRoof();
  if (shopName && exposed[BACK]) kitchenFlue(shopName);

  /** stainless extract duct up the back wall of cafés / bakeries / pubs, with a rain cowl */
  function kitchenFlue(name: string): void {
    const bakery = /Bakery|Pâtisserie|Pizzeria/.test(name);
    const kitchen = /Café|Bistro|Fish|Tea Room|Pub|Anchor|Delicatessen|Butcher/.test(name);
    if (!bakery && !kitchen) return;
    const t = g.trim;
    const sg = sideGeom(body, BACK);
    const u = rng.chance(0.5) ? 0.42 : sg.L - 0.42;
    const top = eave + (lot.roof === 'flat' ? 1.9 : 1.45);
    setCol(t, col('#b9bfc3'));
    // fan box where the duct leaves the wall, then the riser with a couple of brackets
    sideBox(t, sg, u - 0.3, u + 0.3, 0, 0.24, 2.45, 2.95, true);
    const px = sx(sg, u, 0.13),
      pz = sz(sg, u, 0.13);
    t.cylinder(px, pz, 0.1, 2.95, top, 8, false);
    setCol(t, col('#8d9397'));
    for (let y = 4.5; y < top - 1; y += 2.6) sideBox(t, sg, u - 0.13, u + 0.13, 0, 0.2, y, y + 0.05, true);
    // cowl
    setCol(t, col('#a6acb0'));
    t.cylinder(px, pz, 0.025, top, top + 0.16, 4, false);
    t.cone(px, pz, 0.2, top + 0.14, top + 0.3, 8);
    anchors.vent(px, top + 0.1, pz, bakery ? 'bakery' : 'kitchen', name);
  }

  function buildRoof(): void {
    const roofKind = lot.roof;
    const terracotta = [PALETTE.roofs[0], PALETTE.roofs[1], PALETTE.roofs[4], '#c0643f', '#9b4a33'];
    const slate = [PALETTE.roofs[2], PALETTE.roofs[5], '#4f5a66'];
    if (roofKind === 'flat') {
      // parapet + cornice + flat roof, maybe a roof terrace
      const par = rng.range(0.7, 1.1);
      const yTop = eave + par;
      for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
        const sg = sideGeom(body, s);
        const parts = partitionSide(g, s, sg.L, ins[PREV[s]]);
        for (const p of parts) wallPlain(g.shell, sg, p.a, p.b, eave, yTop, wallLook);
        if (s === FRONT) {
          setCol(g.trim, trimC);
          sideBox(g.trim, sg, 0, sg.L, 0, 0.32, eave - 0.3, eave + 0.02, true);
          sideBox(g.trim, sg, 0, sg.L, 0, 0.2, yTop - 0.02, yTop + 0.12, true);
          // dentils
          setCol(g.trim, shade(trimC, 0.9));
          for (let u = 0.25; u < sg.L - 0.2; u += 0.42) sideBox(g.trim, sg, u, u + 0.18, 0, 0.18, eave - 0.48, eave - 0.3, true);
        }
      }
      // inner parapet faces + coping
      const inner: LRect = { x0: body.x0 + 0.25, x1: body.x1 - 0.25, z0: body.z0 + 0.25, z1: body.z1 - 0.25 };
      for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
        const sg = sideGeom(inner, s);
        // inner face looks inward: build on the inner rect side but facing in -> use reversed side geometry
        const ax = sx(sg, 0, 0), az = sz(sg, 0, 0), bx = sx(sg, sg.L, 0), bz = sz(sg, sg.L, 0);
        setCol(g.trim, shade(wallC, 0.9));
        g.trim.quad(bx, eave, bz, ax, eave, az, ax, yTop, az, bx, yTop, bz);
      }
      setCol(g.trim, col('#cfc8bb'));
      g.trim.box(body.x0, yTop, body.z0, body.x1, yTop + 0.08, body.z0 + 0.27, 0b111111);
      g.trim.box(body.x0, yTop, body.z1 - 0.27, body.x1, yTop + 0.08, body.z1, 0b111111);
      anchors.perch(body.x0 + 0.3, yTop + 0.08, body.z1 - 0.13, body.x1 - 0.3, yTop + 0.08, body.z1 - 0.13, 'parapet');
      g.trim.box(body.x0, yTop, body.z0 + 0.27, body.x0 + 0.27, yTop + 0.08, body.z1 - 0.27, 0b110111);
      g.trim.box(body.x1 - 0.27, yTop, body.z0 + 0.27, body.x1, yTop + 0.08, body.z1 - 0.27, 0b110111);
      flatRoof(g.shell, inner, eave + 0.02, col('#8d8a84'), ROOFPAT.FLAT, g.seed);
      const keep: LRect[] = [];
      if (rng.chance(0.5)) keep.push(roofTerrace(inner, eave + 0.02));
      else {
        // roof hatch / stair hut
        const hx = (inner.x0 + inner.x1) / 2 + rng.range(-1, 1),
          hz = inner.z0 + 2.2;
        setCol(g.trim, shade(wallC, 0.92));
        g.trim.box(hx - 1.1, eave, hz - 1.0, hx + 1.1, eave + 2.3, hz + 1.0);
        setCol(g.trim, col('#6e6a64'));
        g.trim.box(hx - 1.2, eave + 2.3, hz - 1.1, hx + 1.2, eave + 2.42, hz + 1.1);
        keep.push({ x0: hx - 1.5, x1: hx + 1.5, z0: hz - 1.4, z1: hz + 1.4 });
        keep.push(skylight(inner, eave + 0.02, hz + 1.3));
      }
      // chimney stack position stays clear too
      keep.push({ x0: body.x0, x1: body.x0 + 1.2, z0: body.z0, z1: body.z1 });
      clutterRoof(g, inner.x0, inner.z0, inner.x1, inner.z1, eave + 0.02, { keep, density: 1.1 });
      chimney(g, body.x0 + 0.5, (body.z0 + body.z1) / 2 + rng.range(-2, 2), eave, yTop + rng.range(1.0, 1.8));
      return;
    }
    if (roofKind === 'hip') {
      mansard(rng.chance(0.75) ? slate : ['#6fa596', '#5f9686']);
      return;
    }
    // gable
    const gableFront = W <= 9.4 ? rng.chance(0.62) : rng.chance(0.3);
    const roofC = col(rng.pick(rng.chance(0.78) ? terracotta : slate));
    const pat = terracotta.includes(`#${roofC.getHexString()}`) || roofC.r > roofC.b * 1.2 ? ROOFPAT.TILES : ROOFPAT.SLATE;
    if (gableFront) {
      const half = (body.x1 - body.x0) / 2;
      const rise = half * rng.range(0.95, 1.3);
      const yr = eave + rise;
      const stepped = rng.chance(0.4);
      const og = stepped ? -0.25 : 0.28;
      const oeR = exposed[RIGHT] ? 0.3 : 0,
        oeL = exposed[LEFT] ? 0.3 : 0;
      gableRoof(g, body, false, eave, yr, 0, og, roofC, pat, trimC, oeR, oeL, exposed[BACK] ? og : 0, og);
      // gable walls (front + back)
      for (const s of [FRONT, BACK] as Side[]) {
        const sg = sideGeom(body, s);
        if (!exposed[s] && s === BACK) {
          wallTri(g.shell, sg, 0, sg.L, sg.L / 2, eave, yr, wallLook);
          continue;
        }
        const attic = makeGrid(sg.L / 2 - 0.6, sg.L / 2 + 0.6, eave + 0.45, Math.min(1.6, rise * 0.55), 1, { spacing: 1.2, cols: 1, winW: 0.75, winH: Math.min(1.1, rise * 0.4), sill: 0.05, margin: 0 });
        if (stepped && s === FRONT) {
          steppedGable(sg, yr + 0.5, attic, rise);
        } else {
          wallTri(g.shell, sg, 0, sg.L, sg.L / 2, eave, yr, wallLook, attic, WIN.ARCHED, PROF.HOME, frameIdx, GLASS.NEUTRAL);
          if (s === FRONT) {
            setCol(g.trim, trimC);
            sideBox(g.trim, sg, sg.L / 2 - 0.55, sg.L / 2 + 0.55, 0, 0.12, eave + 0.36, eave + 0.45, true);
          }
        }
      }
      // chimneys on the slopes near the party walls
      if (rng.chance(0.85)) chimney(g, body.x0 + 0.7, (body.z0 + body.z1) / 2 + rng.range(-3, 3), eave + 0.5, yr + rng.range(0.4, 1.1));
      if (rng.chance(0.4)) chimney(g, body.x1 - 0.7, (body.z0 + body.z1) / 2 + rng.range(-3, 3), eave + 0.5, yr + rng.range(0.3, 0.9));
    } else {
      const half = (body.z1 - body.z0) / 2;
      const rise = half * rng.range(0.6, 0.85);
      const yr = eave + rise;
      const ogR = exposed[RIGHT] ? 0.25 : 0,
        ogL = exposed[LEFT] ? 0.25 : 0;
      gableRoof(g, body, true, eave, yr, 0.38, 0, roofC, pat, trimC, 0.38, 0.38, ogL, ogR);
      for (const s of [RIGHT, LEFT] as Side[]) {
        const sg = sideGeom(body, s);
        if (exposed[s]) {
          const attic = makeGrid(sg.L / 2 - 0.6, sg.L / 2 + 0.6, eave + 0.5, Math.min(1.6, rise * 0.5), 1, { spacing: 1.2, cols: 1, winW: 0.8, winH: Math.min(1.1, rise * 0.4), sill: 0.05, margin: 0 });
          wallTri(g.shell, sg, 0, sg.L, sg.L / 2, eave, yr, wallLook, attic, WIN.MUNTIN, PROF.HOME, frameIdx, GLASS.NEUTRAL);
        } else wallTri(g.shell, sg, 0, sg.L, sg.L / 2, eave, yr, wallLook);
      }
      // dormers on the front slope, aligned with the window columns
      const gr = upperGrid(0, body.x1 - body.x0);
      const pitch = rise / half;
      if (rng.chance(0.65)) {
        const nD = gr.n >= 3 ? (rng.chance(0.5) ? 2 : 1) : 1;
        const cols = nD === 1 ? [Math.floor((gr.n - 1) / 2) + (gr.n % 2 === 0 ? 0.5 : 0)] : [0.0 + (gr.n > 3 ? 0.5 : 0), gr.n - 1 - (gr.n > 3 ? 0.5 : 0)];
        for (const ci of cols) {
          const u = gr.u0 + (ci + 0.5) * gr.cw;
          dormer(body.x0 + u, body.z1 - 1.25, eave + 1.25 * pitch, pitch, roofC, pat);
        }
      }
      if (rng.chance(0.9)) chimney(g, rng.chance(0.5) ? body.x0 + 0.6 : body.x1 - 0.6, (body.z0 + body.z1) / 2 + rng.range(-0.8, 0.8), yr - 1.0, yr + rng.range(0.6, 1.2));
      if (rng.chance(0.35)) chimney(g, (body.x0 + body.x1) / 2 + rng.range(-1.5, 1.5), body.z0 + 1.5, eave + 0.8, yr + 0.3);
    }
  }

  /** Front gable as a Dutch stepped gable rising above the roof line. */
  function steppedGable(sg: SideGeom, yTopMax: number, attic: Grid, rise: number): void {
    const L = sg.L;
    const nSteps = rng.chance(0.5) ? 3 : 4;
    const stepW = L / (2 * nSteps + 1);
    const stepH = (yTopMax - eave) / (nSteps + 0.6);
    const t = g.trim;
    // central rectangle + side steps as wall quads
    wallGrid(g.shell, sg, stepW * nSteps, L - stepW * nSteps, eave, yTopMax, attic, look(PROF.HOME, WIN.ARCHED));
    for (let k = 0; k < nSteps; k++) {
      const y1 = eave + stepH * (k + 1);
      const ua = stepW * k,
        ub = stepW * (k + 1);
      wallPlain(g.shell, sg, ua, ub, eave, y1, wallLook);
      wallPlain(g.shell, sg, L - ub, L - ua, eave, y1, wallLook);
      setCol(t, trimC);
      sideBox(t, sg, ua - 0.04, ub + 0.04, -0.35, 0.1, y1, y1 + 0.12, true, true);
      sideBox(t, sg, L - ub - 0.04, L - ua + 0.04, -0.35, 0.1, y1, y1 + 0.12, true, true);
    }
    setCol(t, trimC);
    sideBox(t, sg, stepW * nSteps - 0.06, L - stepW * nSteps + 0.06, -0.35, 0.12, yTopMax, yTopMax + 0.14, true, true);
    // finial ball
    const mx = sx(sg, L / 2, -0.1),
      mz = sz(sg, L / 2, -0.1);
    t.sphere(mx, yTopMax + 0.36, mz, 0.2, 6, 4);
    // back faces of the stepped parapet (visible from behind over the roof)
    setCol(t, shade(wallC, 0.85));
    for (let k = 0; k < nSteps; k++) {
      const y1 = eave + stepH * (k + 1);
      const ua = stepW * k,
        ub = stepW * (k + 1);
      for (const [a, b] of [
        [ua, ub],
        [L - ub, L - ua],
      ]) {
        const ax = sx(sg, a, -0.3), az = sz(sg, a, -0.3), bx = sx(sg, b, -0.3), bz = sz(sg, b, -0.3);
        t.quad(bx, eave, bz, ax, eave, az, ax, y1, az, bx, y1, bz);
      }
    }
    const ax = sx(sg, stepW * nSteps, -0.3), az = sz(sg, stepW * nSteps, -0.3);
    const bx = sx(sg, L - stepW * nSteps, -0.3), bz = sz(sg, L - stepW * nSteps, -0.3);
    t.quad(bx, eave, bz, ax, eave, az, ax, yTopMax, az, bx, yTopMax, bz);
    // side faces of each step (thickness 0.3)
    for (let k = 0; k <= nSteps; k++) {
      const yA = k === 0 ? eave : eave + stepH * k;
      const yB = k === nSteps ? yTopMax : eave + stepH * (k + 1);
      for (const u of [stepW * k, L - stepW * k]) {
        const ox = sx(sg, u, 0), oz = sz(sg, u, 0), ix = sx(sg, u, -0.3), iz = sz(sg, u, -0.3);
        const refx = sx(sg, L / 2, -0.15), refz = sz(sg, L / 2, -0.15);
        t.quadAway(ox, yA, oz, ix, yA, iz, ix, yB, iz, ox, yB, oz, refx, (yA + yB) / 2, refz);
      }
    }
    void rise;
  }

  function dormer(cx: number, zFront: number, yBase: number, pitch: number, roofC: THREE.Color, pat: number): void {
    const w = 1.5,
      wh = 1.55;
    const s = g.shell;
    const sgF = sideGeom({ x0: cx - w / 2, x1: cx + w / 2, z0: zFront - 3, z1: zFront }, FRONT);
    const gr = makeGrid(0, w, yBase, wh, 1, { spacing: w, cols: 1, winW: 0.85, winH: 1.0, sill: 0.25, margin: 0.1 });
    wallGrid(s, sgF, 0, w, yBase - 0.2, yBase + wh, gr, look(PROF.HOME, WIN.MUNTIN));
    // dormer gable triangle
    const ridge = yBase + wh + 0.65;
    wallTri(s, sgF, 0, w, w / 2, yBase + wh, ridge, wallLook);
    // cheeks back to where the main roof rises above them
    const depth = (yBase + wh - yBase) / pitch + 0.5;
    const zb = zFront - depth;
    setCol(s, wallC);
    s.A[0] = s.A[1] = s.A[2] = s.A[3] = 0;
    s.B[0] = 0;
    s.B[1] = 0;
    s.B[3] = 0;
    s.C[0] = 1;
    s.C[1] = 1;
    s.quad(cx + w / 2, yBase - 0.2, zFront, cx + w / 2, yBase - 0.2, zb, cx + w / 2, yBase + wh, zb, cx + w / 2, yBase + wh, zFront);
    s.quad(cx - w / 2, yBase - 0.2, zb, cx - w / 2, yBase - 0.2, zFront, cx - w / 2, yBase + wh, zFront, cx - w / 2, yBase + wh, zb);
    // little gable roof (ridge along z)
    roofLook(s, roofC, pat, g.seed + 3);
    const o = 0.12;
    const sl = Math.hypot(w / 2 + o, ridge - (yBase + wh) + o * 0.9);
    const ey = yBase + wh - o * 0.9;
    roofPoly(s, [[cx + w / 2 + o, ey, zFront + 0.15], [cx + w / 2 + o, ey, zb], [cx, ridge, zb], [cx, ridge, zFront + 0.15]], [0, 0, -1], [-(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
    roofPoly(s, [[cx - w / 2 - o, ey, zb], [cx - w / 2 - o, ey, zFront + 0.15], [cx, ridge, zFront + 0.15], [cx, ridge, zb]], [0, 0, 1], [(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
    setCol(g.trim, trimC);
    g.trim.beam(cx + w / 2 + o, ey - 0.05, zFront + 0.17, cx, ridge - 0.05, zFront + 0.17, 0.1, 0.12);
    g.trim.beam(cx, ridge - 0.05, zFront + 0.17, cx - w / 2 - o, ey - 0.05, zFront + 0.17, 0.1, 0.12);
  }

  function mansard(roofCols: string[]): void {
    const roofC = col(rng.pick(roofCols));
    const isCopper = roofC.g > roofC.r * 1.15;
    const pat = isCopper ? ROOFPAT.COPPER : ROOFPAT.SLATE;
    const inset = 0.7;
    const hM = rng.range(2.5, 2.9);
    const yTop = eave + hM;
    const s = g.shell;
    // cornice
    setCol(g.trim, trimC);
    const sgF = sideGeom(body, FRONT);
    sideBox(g.trim, sgF, 0, sgF.L, 0, 0.3, eave - 0.3, eave + 0.02, true);
    // steep front/back slopes
    roofLook(s, roofC, pat, g.seed);
    const z1i = body.z1 - inset,
      z0i = body.z0 + inset;
    const slF = Math.hypot(inset, hM);
    roofPoly(s, [[body.x0, eave, body.z1 + 0.05], [body.x1, eave, body.z1 + 0.05], [body.x1, yTop, z1i], [body.x0, yTop, z1i]], [1, 0, 0], [0, hM / slF, -inset / slF]);
    roofPoly(s, [[body.x1, eave, body.z0], [body.x0, eave, body.z0], [body.x0, yTop, z0i], [body.x1, yTop, z0i]], [-1, 0, 0], [0, hM / slF, inset / slF]);
    // side faces (party walls or exposed ends): trapezoids in wall colour
    for (const sd of [RIGHT, LEFT] as Side[]) {
      const sg = sideGeom(body, sd);
      setCol(s, wallC);
      s.A[0] = s.A[1] = s.A[2] = s.A[3] = 0;
      s.B[0] = 0;
      s.B[1] = 0;
      s.B[2] = g.seed;
      s.B[3] = 0;
      s.C[0] = 1;
      s.C[1] = 1;
      s.C[2] = pattern;
      s.C[3] = 0;
      const p0x = sx(sg, 0, 0), p0z = sz(sg, 0, 0), p1x = sx(sg, sg.L, 0), p1z = sz(sg, sg.L, 0);
      const q0x = sx(sg, inset, 0), q0z = sz(sg, inset, 0), q1x = sx(sg, sg.L - inset, 0), q1z = sz(sg, sg.L - inset, 0);
      s.quad(p0x, eave, p0z, p1x, eave, p1z, q1x, yTop, q1z, q0x, yTop, q0z);
    }
    // top: low flat zinc roof
    flatRoof(s, { x0: body.x0, x1: body.x1, z0: z0i, z1: z1i }, yTop, col('#7c8288'), ROOFPAT.SEAM, g.seed);
    setCol(g.trim, shade(roofC, 0.8));
    g.trim.box(body.x0, yTop - 0.02, z1i - 0.08, body.x1, yTop + 0.1, z1i + 0.06, 0b111111);
    g.trim.box(body.x0, yTop - 0.02, z0i - 0.06, body.x1, yTop + 0.1, z0i + 0.08, 0b111111);
    // dormers in the steep slope
    const gr = upperGrid(0, body.x1 - body.x0);
    for (let i = 0; i < gr.n; i++) {
      const cx = body.x0 + gridU(gr, i);
      const w = 1.2,
        h = 1.55;
      const zf = body.z1 - 0.18;
      const y0 = eave + 0.25;
      const sgD = sideGeom({ x0: cx - w / 2, x1: cx + w / 2, z0: zf - 1, z1: zf }, FRONT);
      const dg = makeGrid(0, w, y0, h, 1, { spacing: w, cols: 1, winW: 0.8, winH: 1.05, sill: 0.15, margin: 0.1 });
      wallGrid(s, sgD, 0, w, y0, y0 + h, dg, look(PROF.HOME, WIN.ARCHED));
      // dormer cheeks
      setCol(s, wallC);
      s.B[0] = 0;
      s.B[3] = 0;
      s.quad(cx + w / 2, y0, zf, cx + w / 2, y0, zf - 0.9, cx + w / 2, y0 + h, zf - 0.9, cx + w / 2, y0 + h, zf);
      s.quad(cx - w / 2, y0, zf - 0.9, cx - w / 2, y0, zf, cx - w / 2, y0 + h, zf, cx - w / 2, y0 + h, zf - 0.9);
      // segmental hood
      setCol(g.trim, trimC);
      g.trim.box(cx - w / 2 - 0.1, y0 + h, zf - 0.95, cx + w / 2 + 0.1, y0 + h + 0.18, zf + 0.1, 0b111111);
    }
    chimney(g, body.x0 + 0.55, (body.z0 + body.z1) / 2, yTop - 0.5, yTop + rng.range(0.8, 1.4));
  }

  /** skylight on a flat roof; returns its keep-clear rect */
  function skylight(r: LRect, y: number, zMin: number): LRect {
    const t = g.trim;
    // skylight
    const sxm = r.x0 + (r.x1 - r.x0) * rng.range(0.3, 0.7),
      szm = Math.max(zMin + 1.2, r.z0 + (r.z1 - r.z0) * rng.range(0.55, 0.8));
    setCol(t, col('#d8d2c4'));
    t.box(sxm - 0.9, y, szm - 0.7, sxm + 0.9, y + 0.35, szm + 0.7);
    setCol(t, col('#6f8798'));
    t.quadAway(sxm - 0.8, y + 0.35, szm - 0.6, sxm + 0.8, y + 0.35, szm - 0.6, sxm + 0.8, y + 0.75, szm, sxm - 0.8, y + 0.75, szm, sxm, y - 1, szm);
    t.quadAway(sxm - 0.8, y + 0.35, szm + 0.6, sxm + 0.8, y + 0.35, szm + 0.6, sxm + 0.8, y + 0.75, szm, sxm - 0.8, y + 0.75, szm, sxm, y - 1, szm);
    setCol(t, col('#d8d2c4'));
    t.triangle(sxm - 0.8, y + 0.35, szm - 0.6, sxm - 0.8, y + 0.35, szm + 0.6, sxm - 0.8, y + 0.75, szm);
    t.triangle(sxm + 0.8, y + 0.35, szm + 0.6, sxm + 0.8, y + 0.35, szm - 0.6, sxm + 0.8, y + 0.75, szm);
    return { x0: sxm - 1.2, x1: sxm + 1.2, z0: szm - 1.0, z1: szm + 1.0 };
  }

  /** roof terrace (decking, planters, parasol); returns its keep-clear rect */
  function roofTerrace(r: LRect, y: number): LRect {
    const t = g.trim;
    // decking
    setCol(t, col('#a87f58'));
    const dx0 = r.x0 + 0.2, dx1 = r.x1 - 0.2, dz0 = r.z0 + (r.z1 - r.z0) * 0.45, dz1 = r.z1 - 0.2;
    t.box(dx0, y, dz0, dx1, y + 0.06, dz1, 0b111111);
    anchors.balcony((dx0 + dx1) / 2, y + 0.06, (dz0 + dz1) / 2, 0, 1, dx1 - dx0, dz1 - dz0, 0.8, 'terrace');
    // planters + plants along the parapet, pot plants in the corners
    for (let k = 0; k < 3; k++) {
      const px = dx0 + 0.4 + ((dx1 - dx0 - 0.8) * k) / 2;
      setCol(t, col('#b5653f'));
      t.box(px - 0.3, y, dz1 - 0.6, px + 0.3, y + 0.4, dz1 - 0.1);
      g.green.clump(px, y + 0.36, dz1 - 0.35, 0.4, rng.range(0.7, 1.3), rng.weighted([GREEN.SHRUB, GREEN.PALM, GREEN.LAVENDER, GREEN.GRASS], [3, 2, 1, 1]), 3);
    }
    const sgT = sideGeom({ x0: dx0, x1: dx1, z0: dz0, z1: dz1 }, BACK);
    for (const pu of [0.35, sgT.L - 0.35]) if (rng.chance(0.7)) potPlant(g, sgT, pu, -0.35, y + 0.06, rng.range(1.0, 1.7));
    // parasol + table
    const cx = (dx0 + dx1) / 2 + rng.range(-0.8, 0.8),
      cz = (dz0 + dz1) / 2;
    setCol(t, col('#ececec'));
    t.cylinder(cx, cz, 0.03, y, y + 2.2, 4, false);
    setCol(t, col(rng.pick(AWNING)));
    t.cone(cx, cz, 1.3, y + 1.95, y + 2.45, 8);
    setCol(t, col('#f4f1ea'));
    t.cylinder(cx, cz, 0.38, y + 0.68, y + 0.74, 8, true);
    t.cylinder(cx, cz, 0.04, y, y + 0.7, 4, false);
    return { x0: dx0 - 0.3, x1: dx1 + 0.3, z0: dz0 - 0.3, z1: dz1 + 0.3 };
  }
}

void mixCol;
