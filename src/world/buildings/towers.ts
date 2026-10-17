// Downtown towers & offices: curtain walls with mullion grids, ribbon / punched /
// finned facades, podiums with storefronts and roof terraces, chamfered shafts,
// setbacks, stepped / slanted / screened crowns, rooftop clutter (mechanical
// penthouses, cooling units, water tanks, antennas, cleaning gantries, railings),
// aviation lights on the tall ones and night accent lighting. Haven Tower gets
// its own asymmetric crown with a lantern, spire and helipad.

import * as THREE from 'three';
import {
  Gen, LRect, Side, FRONT, RIGHT, BACK, LEFT, Grid, WallLook,
  sideGeom, sideBox, sx, sz, makeGrid, wallGrid, wallPlain, wallSeg, setWallAttrs,
  flatRoof, roofLook, roofPoly, doorNiche, bandWithOpenings, railing, signOnSide,
  col, shade, setCol, lightBox, aviationLight,
} from './gen';
import { WIN, PROF, WALLPAT, ROOFPAT, FRAME, GLASS, LIGHT_MODE } from './materials';
import { letterSign, helipadMark, boardSign } from './signs';

interface P {
  x: number;
  z: number;
}

type Crown = 'flat' | 'stepped' | 'slant' | 'screen';

interface Scheme {
  wall: string;
  pattern: number;
  glass: number;
  frame: number;
  style: number;
  cell: number;
  sill: number;
  head: number;
  winFrac: number;
  chamfer: number;
  crown: Crown;
  podium: boolean;
  arcade: boolean;
  fins: boolean;
  accent: string | null;
  tank: boolean;
}

const SCHEMES: Scheme[] = [
  // 0 blue-green curtain glass, white mullions, chamfered, stepped crown
  { wall: '#dfe6ea', pattern: WALLPAT.SMOOTH, glass: GLASS.LIGHT, frame: FRAME.ALU, style: WIN.CURTAIN, cell: 1.5, sill: 0.95, head: 0.07, winFrac: 0.97, chamfer: 2.6, crown: 'stepped', podium: true, arcade: false, fins: false, accent: '#bfe8ff', tank: false },
  // 1 dark blue glass, dark metal, slanted crown, arcade
  { wall: '#3d4854', pattern: WALLPAT.SMOOTH, glass: GLASS.DEEP, frame: FRAME.DARK, style: WIN.CURTAIN, cell: 1.6, sill: 0.85, head: 0.06, winFrac: 0.97, chamfer: 0, crown: 'slant', podium: false, arcade: true, fins: false, accent: '#ffffff', tank: false },
  // 2 stone art-deco ribbons, setbacks
  { wall: '#d9ccb4', pattern: WALLPAT.STONE, glass: GLASS.STEEL, frame: FRAME.DARK, style: WIN.RIBBON, cell: 1.8, sill: 0.95, head: 0.5, winFrac: 1, chamfer: 0, crown: 'stepped', podium: true, arcade: false, fins: false, accent: '#ffd59a', tank: true },
  // 3 concrete grid, punched windows, mechanical crown
  { wall: '#c7c3bb', pattern: WALLPAT.PANELS, glass: GLASS.NEUTRAL, frame: FRAME.DARK, style: WIN.PLAIN, cell: 2.4, sill: 0.85, head: 0.7, winFrac: 0.62, chamfer: 0, crown: 'flat', podium: false, arcade: true, fins: false, accent: null, tank: true },
  // 4 bronze glass with fins, crown screen
  { wall: '#7a6853', pattern: WALLPAT.SMOOTH, glass: GLASS.BRONZE, frame: FRAME.BLACK, style: WIN.PLAIN, cell: 1.5, sill: 0.55, head: 0.35, winFrac: 0.78, chamfer: 0, crown: 'screen', podium: false, arcade: false, fins: true, accent: '#ffc979', tank: false },
  // 5 green glass, chamfered, flat with gantry, podium with shops
  { wall: '#e8ebe5', pattern: WALLPAT.SMOOTH, glass: GLASS.GREEN, frame: FRAME.ALU, style: WIN.CURTAIN, cell: 1.5, sill: 0.9, head: 0.07, winFrac: 0.97, chamfer: 3.4, crown: 'flat', podium: true, arcade: false, fins: false, accent: '#9dffd8', tank: false },
  // 6 white office with blue ribbon glass
  { wall: '#ecebe6', pattern: WALLPAT.PANELS, glass: GLASS.BLUE, frame: FRAME.ALU, style: WIN.RIBBON, cell: 1.7, sill: 0.9, head: 0.45, winFrac: 1, chamfer: 0, crown: 'flat', podium: false, arcade: false, fins: false, accent: null, tank: false },
  // 7 warm brick/terracotta office, punched windows
  { wall: '#b57a5c', pattern: WALLPAT.BRICK, glass: GLASS.NEUTRAL, frame: FRAME.CREAM, style: WIN.PLAIN, cell: 2.2, sill: 0.85, head: 0.75, winFrac: 0.6, chamfer: 0, crown: 'flat', podium: false, arcade: false, fins: false, accent: null, tank: true },
];

const TOWER_SCHEMES = [0, 1, 4, 5, 0, 1, 4, 5];
const OFFICE_SCHEMES = [2, 3, 6, 7, 6, 2, 3, 7];

const SHOP_NAMES = ['Café Nord', 'Haven Bank', 'Books & Co', 'Boutique', 'Deli Market', 'Pharmacy', 'Bistro 22', 'Gallery', 'Optics', 'Espresso'];

let shopIdx = 0;
export function resetTowers(): void {
  shopIdx = 0;
}

export function rectPoly(r: LRect, c = 0): P[] {
  const pts: P[] = [];
  const push = (x: number, z: number) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l.x - x, l.z - z) > 1e-3) pts.push({ x, z });
  };
  push(r.x0 + c, r.z1);
  push(r.x1 - c, r.z1);
  push(r.x1, r.z1 - c);
  push(r.x1, r.z0 + c);
  push(r.x1 - c, r.z0);
  push(r.x0 + c, r.z0);
  push(r.x0, r.z0 + c);
  push(r.x0, r.z1 - c);
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 1e-3) pts.pop();
  return pts;
}

function insetRect(r: LRect, d: number): LRect {
  return { x0: r.x0 + d, x1: r.x1 - d, z0: r.z0 + d, z1: r.z1 - d };
}

/** Fan-triangulated flat polygon (convex) at height y facing up (roof mode set by caller). */
function polyCap(b: Gen['shell'], poly: P[], y: number): void {
  const p0 = poly[0];
  for (let i = 1; i < poly.length - 1; i++) {
    const a = poly[i],
      c = poly[i + 1];
    // map-CCW polygon -> seen from above it is clockwise in (x,z) with z down... orient upward explicitly
    b.triangle(p0.x, y, p0.z, a.x, y, a.z, c.x, y, c.z, p0.x, p0.z, a.x, a.z, c.x, c.z);
  }
}

export function genTower(g: Gen): void {
  const { lot, rng, W, D } = g;
  const isOffice = lot.kind === 'office';
  const haven = lot.name === 'Haven Tower';
  // twin towers share their architecture
  const twin = !isOffice && lot.district === 'downtown' && (lot.front === 'W' || lot.front === 'E') && D > 30;
  const schemeIdx = haven ? 0 : twin ? 0 : isOffice ? OFFICE_SCHEMES[lot.style % 8] : TOWER_SCHEMES[lot.style % 8];
  const sc: Scheme = { ...SCHEMES[schemeIdx] };
  if (twin) {
    sc.glass = GLASS.BLUE;
    sc.chamfer = 0;
    sc.crown = 'stepped';
    sc.podium = false;
    sc.arcade = true;
  }
  const H = lot.height;
  const floors = Math.max(2, lot.floors);
  const gH = isOffice ? 4.6 : 5.2;
  const fH = (H - gH) / (floors - 1);
  const wallC = col(sc.wall);
  const look = (profile: number, style = sc.style): WallLook => ({ color: wallC, pattern: sc.pattern, frame: sc.frame, glass: sc.glass, style, profile, seed: g.seed });
  const fp: LRect = { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 };
  const base = insetRect(fp, 0.35);

  // floor grid along an edge of length L
  const edgeGrid = (L: number, s = sc): Grid => {
    const margin = s.style === WIN.CURTAIN || s.style === WIN.RIBBON ? 0.12 : 0.5;
    const n = Math.max(1, Math.round((L - 2 * margin) / s.cell));
    const cw = (L - 2 * margin) / n;
    const ww = cw * s.winFrac - (s.winFrac >= 0.99 ? 0.06 : 0);
    const wx0 = (cw - ww) / 2;
    return { u0: margin, cw, n, v0: gH, ch: fH, m: floors - 1, wx0, wx1: wx0 + ww, wy0: s.sill, wy1: fH - s.head };
  };

  // walls of a polygon tier between y0..y1 (window grid aligned to the global floors)
  const tierWalls = (poly: P[], y0: number, y1: number, profile: number = PROF.OFFICE, windows = true) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const gr = windows && L > 1.2 ? edgeGrid(L) : null;
      wallSeg(g.shell, a.x, a.z, b.x, b.z, y0, y1, gr, look(profile));
      if (sc.fins && gr && y1 - y0 > 6) {
        setCol(g.trim, shade(wallC, 0.9));
        const tx = (b.x - a.x) / L,
          tz = (b.z - a.z) / L;
        const nx = -tz,
          nz = tx;
        for (let k = 0; k <= gr.n; k += 2) {
          const u = gr.u0 + k * gr.cw;
          const px = a.x + tx * u,
            pz = a.z + tz * u;
          g.trim.box(Math.min(px - tx * 0.07, px + tx * 0.07 + nx * 0.5), Math.max(y0, gH), Math.min(pz - tz * 0.07, pz + tz * 0.07 + nz * 0.5), Math.max(px - tx * 0.07, px + tx * 0.07 + nx * 0.5), y1, Math.max(pz - tz * 0.07, pz + tz * 0.07 + nz * 0.5), 0b111111);
        }
      }
    }
  };
  const tierRoof = (poly: P[], y: number, parapet: number, roofCol = col('#8b8a86')) => {
    roofLook(g.shell, roofCol, ROOFPAT.FLAT, g.seed);
    polyCap(g.shell, poly, y + 0.02);
    if (parapet > 0) {
      // parapet: outer wall continues (no windows) + coping
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i],
          b = poly[(i + 1) % poly.length];
        wallSeg(g.shell, a.x, a.z, b.x, b.z, y, y + parapet, null, { color: wallC, pattern: sc.pattern, seed: g.seed });
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        const tx = (b.x - a.x) / L,
          tz = (b.z - a.z) / L;
        const nx = -tz,
          nz = tx;
        // inner face
        setCol(g.trim, shade(wallC, 0.82));
        const ia = { x: a.x - nx * 0.25, z: a.z - nz * 0.25 },
          ib = { x: b.x - nx * 0.25, z: b.z - nz * 0.25 };
        g.trim.quad(ib.x, y, ib.z, ia.x, y, ia.z, ia.x, y + parapet, ia.z, ib.x, y + parapet, ib.z);
        // coping
        setCol(g.trim, shade(wallC, 1.05));
        g.trim.quadAway(a.x + nx * 0.05, y + parapet + 0.08, a.z + nz * 0.05, b.x + nx * 0.05, y + parapet + 0.08, b.z + nz * 0.05, ib.x, y + parapet + 0.08, ib.z, ia.x, y + parapet + 0.08, ia.z, (a.x + b.x) / 2, y, (a.z + b.z) / 2);
        g.trim.quad(a.x + nx * 0.05, y + parapet, a.z + nz * 0.05, b.x + nx * 0.05, y + parapet, b.z + nz * 0.05, b.x + nx * 0.05, y + parapet + 0.08, b.z + nz * 0.05, a.x + nx * 0.05, y + parapet + 0.08, a.z + nz * 0.05);
      }
    }
  };

  // ── massing
  const podiumTop = sc.podium && H > 28 ? gH + fH * (H > 60 ? 2 : 1) : 0;
  let shaft = podiumTop > 0 ? insetRect(fp, Math.min(2.4, Math.min(W, D) * 0.1)) : base;
  const chamfer = Math.min(sc.chamfer, Math.min(shaft.x1 - shaft.x0, shaft.z1 - shaft.z0) * 0.2);

  // ground floor / lobby (or podium)
  if (podiumTop > 0) {
    buildLobby(base, false);
    tierWalls(rectPoly(base), gH, podiumTop, lot.shopfront ? PROF.SHOP : PROF.OFFICE);
    tierRoof(rectPoly(base), podiumTop, 1.0, col('#9a978f'));
    podiumTerrace(base, shaft, podiumTop);
  } else {
    buildLobby(shaft, sc.arcade);
  }

  // shaft + setbacks
  const startY = podiumTop > 0 ? podiumTop : gH;
  if (haven) {
    havenTower(shaft, startY);
    return;
  }
  const tiers: { r: LRect; y0: number; y1: number; c: number }[] = [];
  if (sc.crown === 'stepped' && H > 40) {
    const y1 = gH + fH * Math.round((H * 0.84 - gH) / fH);
    const y2 = gH + fH * Math.round((H * 0.93 - gH) / fH);
    const s1 = Math.min(1.8, (shaft.x1 - shaft.x0) * 0.08);
    tiers.push({ r: shaft, y0: startY, y1, c: chamfer });
    const t2 = insetRect(shaft, s1);
    tiers.push({ r: t2, y0: y1, y1: y2, c: Math.max(0, chamfer - s1 * 0.4) });
    tiers.push({ r: insetRect(t2, s1), y0: y2, y1: H, c: Math.max(0, chamfer - s1 * 0.8) });
  } else {
    tiers.push({ r: shaft, y0: startY, y1: H, c: chamfer });
  }
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const poly = rectPoly(t.r, t.c);
    const last = i === tiers.length - 1;
    if (last && sc.crown === 'slant') {
      slantTop(poly, t.r, t.y0, H);
      continue;
    }
    tierWalls(poly, t.y0, t.y1);
    tierRoof(poly, t.y1, last ? 1.1 : 0.9);
    if (sc.accent && H > 45) accentEdge(poly, t.y1 + (last ? 1.15 : 0.95), sc.accent, last ? 2.6 : 1.8);
  }
  shaft = tiers[tiers.length - 1].r;
  if (sc.crown !== 'slant') {
    if (sc.crown === 'screen') crownScreen(rectPoly(shaft, chamfer), H);
    rooftop(insetRect(shaft, 0.6), H, sc.crown !== 'screen');
  }
  if (H >= 60) {
    const top = sc.crown === 'screen' ? H + 5.2 : H + 1.3;
    let k = 0;
    for (const p of rectPoly(insetRect(shaft, 0.3), 0)) aviationLight(g, p.x, top, p.z, (k++ % 2) * 0.0);
  }

  // ───────────────────────────────────────────────────── pieces ──

  function buildLobby(r: LRect, arcade: boolean): void {
    const ar = arcade ? insetRect(r, 1.6) : r;
    const lookL: WallLook = { color: shade(wallC, 0.75), pattern: WALLPAT.SMOOTH, frame: FRAME.DARK, glass: sc.glass, style: lot.shopfront ? WIN.SHOP : WIN.DOOR, profile: lot.shopfront ? PROF.SHOP : PROF.ALWAYS, seed: g.seed + 11 };
    for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
      const sg = sideGeom(ar, s);
      // doors: plan door u is along the footprint side; map to this rect
      const shift = s === FRONT ? ar.x0 - fp.x0 : s === RIGHT ? fp.z1 - ar.z1 : s === BACK ? fp.x1 - ar.x1 : ar.z0 - fp.z0;
      const doors = g.doors.filter((d) => d.side === s).map((d) => Math.min(sg.L - 1.6, Math.max(1.6, d.u - shift)));
      const ops = doors.map((u) => ({ u, w: 2.4, h: 3.0 }));
      bandWithOpenings(
        sg, 0, sg.L, ops,
        (a, b) => {
          const len = b - a;
          const n = Math.max(1, Math.round(len / 2.6));
          const gr = makeGrid(a, b, 0, gH, 1, { spacing: len / n, cols: n, winW: len / n - 0.18, winH: gH - 0.9, sill: 0.12, margin: 0.06 });
          wallGrid(g.shell, sg, a, b, 0, gH, gr, lookL);
        },
        (a, b, y0) => wallPlain(g.shell, sg, a, b, y0, gH, { color: shade(wallC, 0.7), pattern: WALLPAT.SMOOTH, seed: g.seed }),
      );
      for (const u of doors) {
        doorNiche(g, sg, u, { w: 2.4, h: 3.0, depth: 0.25, wallColor: shade(wallC, 0.7), frameColor: col('#2c3238'), doorColor: col('#2c3238'), glass: true, profile: PROF.ALWAYS, seed: g.seed + 5, frameOut: arcade ? 0.15 : 0.12 });
        // entrance canopy (above 2.4 m) + downlights
        const cd = arcade ? 0.8 : 1.5;
        setCol(g.trim, col('#2e353c'));
        sideBox(g.trim, sg, u - 2.2, u + 2.2, 0, cd, 3.55, 3.8, true);
        for (const lu of [u - 1.4, u, u + 1.4]) {
          const lx = sx(sg, lu, cd * 0.6),
            lz = sz(sg, lu, cd * 0.6);
          lightBox(g, lx - 0.12, 3.5, lz - 0.12, lx + 0.12, 3.56, lz + 0.12, '#fff1d6', LIGHT_MODE.STEADY, 3.5);
        }
      }
      // signage band above the lobby
      setCol(g.trim, shade(wallC, 0.55));
      sideBox(g.trim, sg, 0, sg.L, 0, arcade ? 0.05 : 0.1, gH - 0.55, gH, true);
      if (s === FRONT && lot.shopfront && !haven) {
        const nm = SHOP_NAMES[shopIdx++ % SHOP_NAMES.length];
        const rr = g.atlas.add(`dshop:${nm}`, 256, 40, boardSign(nm.toUpperCase(), { bg: '#20262c', fg: '#f4f1ea', font: '"Segoe UI", Arial, sans-serif', weight: '600', glow: 0.9, glowColor: '#ffffff' }));
        const w = Math.min(6, sg.L * 0.4);
        signOnSide(g, sg, sg.L * 0.25 - w / 2, sg.L * 0.25 + w / 2, arcade ? 0.085 : 0.135, gH - 0.5, gH - 0.05, rr);
      }
    }
    if (arcade) {
      // columns on the outer line + soffit
      const t = g.trim;
      setCol(t, shade(wallC, 0.95));
      for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
        const sg = sideGeom(r, s);
        const n = Math.max(2, Math.round(sg.L / 4.5));
        for (let k = 0; k <= n; k++) {
          if (k === n) continue; // corners are shared with the next side
          const u = (sg.L * k) / n;
          sideBox(t, sg, Math.max(0, u - 0.35), Math.min(sg.L, u + 0.35), -0.7, 0, 0, gH, false, true);
        }
      }
      setCol(t, shade(wallC, 0.6));
      t.hrect(r.x0, r.z0, r.x1, r.z1, gH - 0.01, false);
      // floor of the arcade
      setCol(t, col('#b8b1a5'));
      t.hrect(r.x0, r.z0, r.x1, r.z1, 0.02, true);
    } else {
      flatRoof(g.shell, r, gH, shade(wallC, 0.7), ROOFPAT.FLAT, g.seed);
    }
  }

  function podiumTerrace(outer: LRect, inner: LRect, y: number): void {
    const t = g.trim;
    // planters along the podium edge with shrubs
    for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
      const sg = sideGeom(insetRect(outer, 0.9), s);
      const n = Math.max(1, Math.floor(sg.L / 4));
      for (let k = 0; k < n; k++) {
        const u = ((k + 0.5) * sg.L) / n;
        setCol(t, col('#8c8a83'));
        sideBox(t, sg, u - 0.9, u + 0.9, -0.5, 0.0, y, y + 0.5, false, true);
        setCol(t, col(rng.pick(['#4f8a3c', '#5c9a45', '#3f7a35'])));
        t.sphere(sx(sg, u, -0.25), y + 0.75, sz(sg, u, -0.25), 0.55, 6, 4);
      }
    }
    void inner;
  }

  function accentEdge(poly: P[], y: number, color: string, inten: number): void {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = -(b.z - a.z) / L,
        nz = (b.x - a.x) / L;
      const l = g.lights;
      setCol(l, color);
      l.L[0] = LIGHT_MODE.STEADY;
      l.L[1] = 0;
      l.L[2] = 0;
      l.L[3] = inten;
      l.beam(a.x + nx * 0.08, y, a.z + nz * 0.08, b.x + nx * 0.08, y, b.z + nz * 0.08, 0.1, 0.1);
    }
  }

  function slantTop(poly: P[], r: LRect, y0: number, yTop: number): void {
    // walls rise to a roof plane sloping from front (low) to back (high)
    const lowY = yTop - 2.5,
      highY = yTop + 7.5;
    const zf = r.z1,
      zb = r.z0;
    const yAt = (z: number) => lowY + ((zf - z) / (zf - zb)) * (highY - lowY);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const gr = edgeGrid(L);
      setWallAttrs(g.shell, gr, look(PROF.OFFICE));
      const ya = yAt(a.z),
        yb = yAt(b.z);
      const uA = (0 - gr.u0) / gr.cw,
        uB = (L - gr.u0) / gr.cw;
      const v = (y: number) => (y - gr.v0) / gr.ch;
      g.shell.quad(a.x, y0, a.z, b.x, y0, b.z, b.x, yb, b.z, a.x, ya, a.z, uA, v(y0), uB, v(y0), uB, v(yb), uA, v(ya));
    }
    // sloped glass roof
    roofLook(g.shell, col('#6f8798'), ROOFPAT.SKYLIGHT, g.seed);
    const sl = Math.hypot(zf - zb, highY - lowY);
    roofPoly(g.shell, [[r.x0, lowY, zf], [r.x1, lowY, zf], [r.x1, highY, zb], [r.x0, highY, zb]], [1, 0, 0], [0, (highY - lowY) / sl, (zb - zf) / sl]);
    // accent strip along the slanted edges
    if (sc.accent) {
      const l = g.lights;
      setCol(l, sc.accent);
      l.L[0] = LIGHT_MODE.STEADY;
      l.L[3] = 2.4;
      l.beam(r.x0 - 0.06, lowY + 0.05, zf, r.x0 - 0.06, highY + 0.05, zb, 0.12, 0.12);
      l.beam(r.x1 + 0.06, lowY + 0.05, zf, r.x1 + 0.06, highY + 0.05, zb, 0.12, 0.12);
      l.beam(r.x0, highY + 0.08, zb - 0.06, r.x1, highY + 0.08, zb - 0.06, 0.12, 0.12);
    }
    if (yTop >= 55) {
      aviationLight(g, r.x0 + 0.3, highY + 0.4, zb + 0.3);
      aviationLight(g, r.x1 - 0.3, highY + 0.4, zb + 0.3);
    }
  }

  function crownScreen(poly: P[], y: number): void {
    // open louvred screen hiding the plant: vertical fins + top band, lit at night
    const t = g.trim;
    const hS = 5;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const tx = (b.x - a.x) / L,
        tz = (b.z - a.z) / L;
      setCol(t, shade(wallC, 1.0));
      const n = Math.max(2, Math.round(L / 0.9));
      for (let k = 0; k <= n; k++) {
        const px = a.x + tx * (L * k) / n,
          pz = a.z + tz * (L * k) / n;
        t.box(px - 0.08, y, pz - 0.08, px + 0.08, y + hS, pz + 0.08, 0b110111);
      }
      t.beam(a.x, y + hS - 0.2, a.z, b.x, y + hS - 0.2, b.z, 0.2, 0.4);
    }
    if (sc.accent) {
      // glowing core behind the screen
      const l = g.lights;
      setCol(l, sc.accent);
      l.L[0] = LIGHT_MODE.STEADY;
      l.L[3] = 1.4;
      const inner = poly.map((p) => ({ x: p.x * 0.92, z: p.z * 0.92 }));
      for (let i = 0; i < inner.length; i++) {
        const a = inner[i],
          b = inner[(i + 1) % inner.length];
        l.beam(a.x, y + 3.6, a.z, b.x, y + 3.6, b.z, 0.12, 0.12);
      }
    }
  }

  function rooftop(r: LRect, y: number, allowTall: boolean): void {
    const t = g.trim;
    const w = r.x1 - r.x0,
      d = r.z1 - r.z0;
    // mechanical penthouse
    const pw = w * rng.range(0.38, 0.55),
      pd = d * rng.range(0.35, 0.5);
    const px = r.x0 + w * rng.range(0.25, 0.75),
      pz = r.z0 + d * rng.range(0.3, 0.7);
    const ph = rng.range(3, 4.2);
    const pc = col('#b9b6ae');
    setCol(t, pc);
    const bx0 = Math.max(r.x0, px - pw / 2),
      bx1 = Math.min(r.x1, px + pw / 2),
      bz0 = Math.max(r.z0, pz - pd / 2),
      bz1 = Math.min(r.z1, pz + pd / 2);
    t.box(bx0, y, bz0, bx1, y + ph, bz1);
    setCol(t, shade(pc, 0.7));
    for (let k = 0; k < 3; k++) {
      const yy = y + 1 + k * 0.45;
      t.box(bx0 - 0.04, yy, bz0 - 0.04, bx1 + 0.04, yy + 0.18, bz1 + 0.04, 0b110011);
    }
    setCol(t, col('#8f8c85'));
    t.box(bx0 - 0.12, y + ph, bz0 - 0.12, bx1 + 0.12, y + ph + 0.15, bz1 + 0.12);
    // cooling units with fans
    const nU = rng.int(2, 4);
    for (let k = 0; k < nU; k++) {
      const ux = r.x0 + 1.2 + rng.next() * (w - 2.4),
        uz = r.z0 + 1.2 + rng.next() * (d - 2.4);
      if (ux > bx0 - 1.3 && ux < bx1 + 1.3 && uz > bz0 - 1.3 && uz < bz1 + 1.3) continue;
      setCol(t, col('#cfd3d4'));
      t.box(ux - 0.9, y, uz - 0.9, ux + 0.9, y + 1.1, uz + 0.9);
      setCol(t, col('#3a3f44'));
      t.cylinder(ux, uz, 0.62, y + 1.1, y + 1.16, 10, true);
    }
    // water tank on legs
    if (sc.tank && rng.chance(0.75)) {
      const tx = r.x0 + 1.8 + rng.next() * Math.max(0.1, w - 3.6),
        tz = r.z0 + 1.8 + rng.next() * Math.max(0.1, d - 3.6);
      if (!(tx > bx0 - 1.8 && tx < bx1 + 1.8 && tz > bz0 - 1.8 && tz < bz1 + 1.8)) waterTank(tx, tz, y);
    }
    // antenna mast (tall buildings) / gantry
    if (allowTall && H > 55) {
      const ax = bx0 + 0.6,
        az = bz0 + 0.6;
      const ah = rng.range(8, 14);
      setCol(t, col('#c9ccce'));
      t.cylinder(ax, az, 0.12, y + ph, y + ph + ah, 6, false, 0.05);
      for (let k = 1; k <= 3; k++) {
        const yy = y + ph + (ah * k) / 4;
        t.box(ax - 0.6, yy, az - 0.03, ax + 0.6, yy + 0.05, az + 0.03, 0b111111);
      }
      aviationLight(g, ax, y + ph + ah + 0.15, az, 0.5);
    }
    if (sc.style === WIN.CURTAIN && rng.chance(0.7)) {
      // window cleaning gantry on rails
      setCol(t, col('#e6e1d4'));
      const gx = r.x0 + 0.8,
        gz = (r.z0 + r.z1) / 2;
      t.box(gx - 0.5, y, r.z0 + 0.6, gx + 0.5, y + 0.12, r.z1 - 0.6);
      t.box(gx - 0.8, y + 0.12, gz - 0.9, gx + 0.8, y + 1.5, gz + 0.9);
      setCol(t, col('#d9a43a'));
      t.beam(gx, y + 1.5, gz, gx - 2.0, y + 2.6, gz, 0.22, 0.22);
    }
    // satellite dishes
    if (rng.chance(0.6)) {
      for (let k = 0; k < 2; k++) {
        const dx = r.x0 + 0.8 + rng.next() * (w - 1.6),
          dz = r.z0 + 0.8 + rng.next() * (d - 1.6);
        if (dx > bx0 - 0.8 && dx < bx1 + 0.8 && dz > bz0 - 0.8 && dz < bz1 + 0.8) continue;
        setCol(t, col('#e9e9e6'));
        t.cylinder(dx, dz, 0.05, y, y + 0.9, 4, false);
        t.cone(dx, dz, 0.55, y + 0.8, y + 1.15, 8);
      }
    }
  }

  function waterTank(x: number, z: number, y: number): void {
    const t = g.trim;
    setCol(t, col('#4a4440'));
    for (const [dx, dz] of [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
    ]) t.box(x + dx - 0.07, y, z + dz - 0.07, x + dx + 0.07, y + 2.2, z + dz + 0.07, 0b110111);
    t.box(x - 1.2, y + 2.1, z - 1.2, x + 1.2, y + 2.25, z + 1.2);
    setCol(t, col('#8a6446'));
    t.cylinder(x, z, 1.25, y + 2.25, y + 4.6, 10, false);
    setCol(t, col('#6b4c37'));
    for (const yy of [y + 2.8, y + 3.6, y + 4.3]) t.cylinder(x, z, 1.29, yy, yy + 0.07, 10, false);
    setCol(t, col('#5a5550'));
    t.cone(x, z, 1.35, y + 4.6, y + 5.5, 10);
  }

  // ───────────────────────────────────────────── Haven Tower (landmark) ──

  function havenTower(shaftR: LRect, y0: number): void {
    const t = g.trim;
    const c1 = chamfer;
    const yA = 100,
      yB = 108;
    tierWalls(rectPoly(shaftR, c1), y0, yA);
    // vertical light piers at the chamfers (night accent)
    const poly1 = rectPoly(shaftR, c1);
    tierRoof(poly1, yA, 0.9);
    const r2 = insetRect(shaftR, 1.6);
    const poly2 = rectPoly(r2, Math.max(0, c1 - 0.7));
    tierWalls(poly2, yA, yB);
    tierRoof(poly2, yB, 1.0);
    accentEdge(poly1, yA + 0.95, '#bfe8ff', 2.4);
    accentEdge(poly2, yB + 1.05, '#bfe8ff', 2.6);
    // crown lantern: offset to the east, glass with lit fins
    const cr: LRect = { x0: r2.x1 - 10.5, x1: r2.x1 - 1.2, z0: r2.z0 + 2.0, z1: r2.z1 - 2.0 };
    const yC = 120;
    const polyC = rectPoly(cr, 1.6);
    tierWalls(polyC, yB, yC, PROF.ALWAYS);
    tierRoof(polyC, yC, 0.6);
    // lit fins on the lantern
    for (let i = 0; i < polyC.length; i++) {
      const a = polyC[i],
        b = polyC[(i + 1) % polyC.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const tx = (b.x - a.x) / L,
        tz = (b.z - a.z) / L;
      const nx = -tz,
        nz = tx;
      const n = Math.max(1, Math.round(L / 1.6));
      for (let k = 0; k <= n; k++) {
        const px = a.x + (tx * L * k) / n + nx * 0.12,
          pz = a.z + (tz * L * k) / n + nz * 0.12;
        lightBox(g, px - 0.07, yB + 1.2, pz - 0.07, px + 0.07, yC + 0.4, pz + 0.07, '#cfefff', LIGHT_MODE.PULSE, 2.2, (k + i) * 0.13, 0.6);
      }
    }
    // spire
    const sxp = (cr.x0 + cr.x1) / 2,
      szp = (cr.z0 + cr.z1) / 2;
    setCol(t, col('#d7dde2'));
    t.box(sxp - 1.6, yC + 0.6, szp - 1.6, sxp + 1.6, yC + 3.0, szp + 1.6);
    t.cylinder(sxp, szp, 0.75, yC + 3.0, yC + 12, 8, false, 0.45);
    t.cylinder(sxp, szp, 0.45, yC + 12, yC + 24, 8, false, 0.12);
    setCol(t, col('#9aa3aa'));
    for (const yy of [yC + 5, yC + 9, yC + 14, yC + 19]) t.cylinder(sxp, szp, 0.9 - (yy - yC) * 0.03, yy, yy + 0.25, 8, true);
    aviationLight(g, sxp, yC + 24.4, szp, 0);
    aviationLight(g, sxp, yC + 12.2, szp, 0.5);
    lightBox(g, sxp - 0.5, yC + 3.0, szp - 0.5, sxp + 0.5, yC + 3.3, szp + 0.5, '#bfe8ff', LIGHT_MODE.STEADY, 3);
    // helipad on the west part of the 108 m terrace
    const hx = (r2.x0 + cr.x0) / 2 - 0.2,
      hz = (r2.z0 + r2.z1) / 2;
    const hr = Math.min(5.4, (cr.x0 - r2.x0) / 2 - 0.4, (r2.z1 - r2.z0) / 2 - 0.4);
    const yP = yB + 1.6;
    setCol(t, col('#5a6066'));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      t.box(hx + Math.cos(a) * hr * 0.6 - 0.15, yB, hz + Math.sin(a) * hr * 0.6 - 0.15, hx + Math.cos(a) * hr * 0.6 + 0.15, yP, hz + Math.sin(a) * hr * 0.6 + 0.15, 0b110111);
    }
    t.cylinder(hx, hz, hr, yP - 0.3, yP, 16, false);
    const pad = g.atlas.add('helipad', 128, 128, helipadMark());
    const s = g.signs;
    const k = hr * 0.98;
    s.quad(hx - k, yP + 0.02, hz + k, hx + k, yP + 0.02, hz + k, hx + k, yP + 0.02, hz - k, hx - k, yP + 0.02, hz - k, pad.u0, pad.v0, pad.u1, pad.v0, pad.u1, pad.v1, pad.u0, pad.v1);
    // safety net ring + perimeter lights
    setCol(t, col('#3a3f44'));
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2,
        a1 = ((i + 1) / 16) * Math.PI * 2;
      t.beam(hx + Math.cos(a0) * (hr + 0.5), yP - 0.2, hz + Math.sin(a0) * (hr + 0.5), hx + Math.cos(a1) * (hr + 0.5), yP - 0.2, hz + Math.sin(a1) * (hr + 0.5), 0.6, 0.06);
      const lx = hx + Math.cos(a0) * (hr - 0.15),
        lz = hz + Math.sin(a0) * (hr - 0.15);
      lightBox(g, lx - 0.1, yP, lz - 0.1, lx + 0.1, yP + 0.14, lz + 0.1, i % 2 ? '#7dff9a' : '#fff6d8', LIGHT_MODE.STEADY, 4);
    }
    // stair from the terrace to the pad
    setCol(t, col('#6d737a'));
    t.box(hx - 0.6, yB, hz - hr - 1.4, hx + 0.6, yB + 0.9, hz - hr + 0.2);
    // windsock mast
    setCol(t, col('#d0d0d0'));
    t.cylinder(r2.x0 + 0.8, r2.z0 + 0.8, 0.05, yB + 1, yB + 4.5, 4, false);
    setCol(t, col('#ff7a1a'));
    t.cone(r2.x0 + 0.8 + 0.6, r2.z0 + 0.8, 0.25, yB + 4.3, yB + 4.3, 6);
    t.beam(r2.x0 + 0.8, yB + 4.35, r2.z0 + 0.8, r2.x0 + 2.2, yB + 4.2, r2.z0 + 1.1, 0.35, 0.35);
    // aviation lights on the corners of the main roof
    for (const p of rectPoly(insetRect(shaftR, 0.4), 0)) aviationLight(g, p.x, yA + 1.2, p.z, 0.25);
    // name sign over the main entrance (south podium face)
    const nm = g.atlas.add('haven-tower', 512, 80, letterSign('HAVEN TOWER', '#e9eef2', '#dff4ff', undefined, 1, '#2d3740'));
    const sg = sideGeom(base, FRONT);
    signOnSide(g, sg, sg.L / 2 - 6, sg.L / 2 + 6, 0.12, podiumTop + 0.25, podiumTop + 2.1, nm);
    // rooftop clutter on the 108 terrace (east of the crown is full; small units north/south)
    setCol(t, col('#cfd3d4'));
    t.box(cr.x0 + 1, yB, r2.z0 + 0.4, cr.x1 - 1, yB + 1.2, cr.z0 - 0.4);
  }
}

void LEFT;
void RIGHT;
void railing;
void THREE;
