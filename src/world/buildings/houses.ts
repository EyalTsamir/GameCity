// Suburban detached houses (porches, garages facing the driveway, chimneys,
// dormers, shutters, window boxes, solar panels) and mid-rise apartment slabs
// (stair cores with lit stairwells, balconies with life on them, roof railings).

import * as THREE from 'three';
import {
  Gen, LRect, Side, FRONT, RIGHT, BACK, LEFT, Grid, WallLook, SideGeom,
  sideGeom, sideBox, sx, sz, makeGrid, gridU, gridY0, gridY1, wallGrid, wallPlain, wallSeg, wallTri, setWallAttrs,
  gableRoof, hipRoof, flatRoof, roofLook, roofPoly, chimney, doorNiche, bandWithOpenings, railing,
  col, shade, setCol, lightBox, wallLamp,
} from './gen';
import { anchors } from './anchors';
import { balconyLife, roofClutter, ironRail, acUnit, dish, downpipe } from './clutter';
import { WIN, PROF, WALLPAT, ROOFPAT, FRAME, GLASS, LIGHT_MODE } from './materials';
import { partitionSide } from './oldtown';

const HOUSE_WALLS = ['#f4efe4', '#efe3c8', '#dfe4e2', '#c9dcea', '#cfdcbf', '#f2dfa0', '#efcfc4', '#d8c4a6', '#e8e8e8', '#bfd3d6'];
const HOUSE_ROOFS = ['#a24c36', '#b5583e', '#5a6270', '#4d5560', '#6b4a3a', '#8a5a44', '#3f454d'];
const DOORS = ['#b23a32', '#263a5c', '#2f5d50', '#e0b33c', '#2a6f74', '#5b3b5e', '#3b2a20'];
const SHUTTERS = ['#2f5d50', '#263a5c', '#5f6b73', '#7a2e2a', '#2a6f74', '#3b2a20'];
const FLOWERS = ['#e63946', '#ff7aa2', '#f1faee', '#f4a261', '#b05bd6', '#ffd23f'];

/** The original single-massing house (kept for ?legacyhouses A/B). */
export function genHouseLegacy(g: Gen): void {
  const { lot, rng, W, D } = g;
  const INS = 0.12;
  const body: LRect = { x0: -W / 2 + INS, x1: W / 2 - INS, z0: -D / 2 + INS, z1: D / 2 - INS };
  const floors = lot.floors >= 2 ? 2 : 1;
  const eave = lot.height;
  const gH = floors === 2 ? Math.min(3.1, eave / 2) : eave;
  const fH = floors === 2 ? eave - gH : 0;
  const wallC = jitPick(rng, HOUSE_WALLS);
  const siding = rng.chance(0.45);
  const brick = !siding && rng.chance(0.25);
  const pattern = siding ? WALLPAT.SIDING : brick ? WALLPAT.BRICK : WALLPAT.PLASTER;
  const wc = brick ? col(rng.pick(['#a0553d', '#b06a4c', '#9a6650'])) : wallC;
  const trimC = col(rng.chance(0.85) ? '#f6f3ec' : '#e9dfc8');
  const doorC = col(rng.pick(DOORS));
  const shutters = rng.chance(0.4);
  const shutterC = col(rng.pick(SHUTTERS));
  const boxes = rng.chance(0.45);
  const look = (profile: number = PROF.HOME, style: number = WIN.MUNTIN): WallLook => ({ color: wc, pattern, frame: FRAME.WHITE, glass: GLASS.NEUTRAL, style, profile, seed: g.seed });
  const plainLook = { color: wc, pattern, seed: g.seed };
  const drive = g.driveSide;
  const door = g.doors.find((d) => d.side === FRONT);
  const doorU = door ? door.u - INS : (body.x1 - body.x0) / 2;

  // porch: recessed around the front door
  const pd = rng.range(1.7, 2.1);
  const pw = Math.min(rng.range(2.8, 3.6), body.x1 - body.x0 - 2.2);
  let pa = body.x0 + doorU - pw / 2;
  pa = Math.max(body.x0, Math.min(body.x1 - pw, pa));
  if (pa - body.x0 < 1.0) pa = body.x0;
  if (body.x1 - (pa + pw) < 1.0) pa = body.x1 - pw;
  const pb = pa + pw;
  const zP = body.z1 - pd;
  const porchLeft = pa <= body.x0 + 1e-3,
    porchRight = pb >= body.x1 - 1e-3;

  // ── ground floor walls
  const s = g.shell;
  const t = g.trim;
  const winGrid = (len: number, y0: number, h: number, wanted?: number): Grid => {
    const n = wanted ?? Math.max(1, Math.min(3, Math.round((len - 0.8) / 2.6)));
    return makeGrid(0, len, y0, h, 1, { spacing: 2.6, cols: n, winW: 1.15, winH: Math.min(1.45, h - 1.35), sill: 0.9, margin: 0.5 });
  };
  const seg = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number, windows: boolean, profile: number = PROF.HOME) => {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) return null;
    const gr = windows && L > 1.8 ? winGrid(L, y0, y1 - y0) : null;
    wallSeg(s, ax, az, bx, bz, y0, y1, gr, gr ? look(profile) : plainLook);
    return gr;
  };
  // front wall pieces
  if (!porchLeft) seg(body.x0, body.z1, pa, body.z1, 0, gH, pa - body.x0 > 2.0);
  if (!porchRight) seg(pb, body.z1, body.x1, body.z1, 0, gH, body.x1 - pb > 2.0);
  // porch side walls
  if (!porchLeft) seg(pa, body.z1, pa, zP, 0, gH, false);
  if (!porchRight) seg(pb, zP, pb, body.z1, 0, gH, false);
  // porch back wall with the door (door u along this wall)
  {
    const sg: SideGeom = { x0: pa, z0: zP, tx: 1, tz: 0, nx: 0, nz: 1, L: pw };
    const du = Math.min(pw - 0.75, Math.max(0.75, body.x0 + doorU - pa));
    bandWithOpenings(sg, 0, pw, [{ u: du, w: 1.05, h: 2.2 }], (a, b) => {
      if (b - a > 1.4) {
        const gr = makeGrid(a, b, 0, gH, 1, { spacing: b - a, cols: 1, winW: Math.min(1.0, b - a - 0.5), winH: 1.35, sill: 0.95, margin: 0.2 });
        wallGrid(s, sg, a, b, 0, gH, gr, look());
      } else wallPlain(s, sg, a, b, 0, gH, plainLook);
    }, (a, b, y0) => wallPlain(s, sg, a, b, y0, gH, plainLook));
    doorNiche(g, sg, du, { w: 1.05, h: 2.2, depth: 0.12, wallColor: wc, frameColor: trimC, doorColor: doorC, transom: false, seed: g.seed, frameOut: 0.08 });
    // porch lamp
    const lx = pa + du + 0.85;
    setCol(g.trim, col('#2b2b2b'));
    lightBox(g, lx - 0.08, 2.0, zP + 0.06, lx + 0.08, 2.28, zP + 0.2, '#ffc979', LIGHT_MODE.STEADY, 3);
  }
  // side walls (garage on the driveway side, near the front)
  const sideWall = (sd: Side) => {
    const x = sd === RIGHT ? body.x1 : body.x0;
    const shortFront = (sd === LEFT && porchLeft) || (sd === RIGHT && porchRight);
    const zFront = shortFront ? zP : body.z1;
    // u runs along the side as seen from outside
    const sg: SideGeom = sd === RIGHT ? { x0: x, z0: zFront, tx: 0, tz: -1, nx: 1, nz: 0, L: zFront - body.z0 } : { x0: x, z0: body.z0, tx: 0, tz: 1, nx: -1, nz: 0, L: zFront - body.z0 };
    const L = sg.L;
    if (drive === sd && L > 5.5) {
      const gw = 2.7,
        gh = Math.min(2.25, gH - 0.5);
      const gu = sd === RIGHT ? 0.7 + gw / 2 : L - 0.7 - gw / 2;
      bandWithOpenings(sg, 0, L, [{ u: gu, w: gw, h: gh }], (a, b) => {
        if (b - a > 2.0) {
          const gr = winGrid(b - a, 0, gH, 1);
          const gr2 = { ...gr, u0: gr.u0 + a };
          wallGrid(s, sg, a, b, 0, gH, gr2, look());
        } else wallPlain(s, sg, a, b, 0, gH, plainLook);
      }, (a, b, y0) => wallPlain(s, sg, a, b, y0, gH, plainLook));
      garageDoor(sg, gu, gw, gh);
    } else {
      const gr = winGrid(L, 0, gH, L > 7 ? 2 : 1);
      wallGrid(s, sg, 0, L, 0, gH, gr, look());
      if (shutters) shutterSet(sg, gr, true);
    }
  };
  sideWall(RIGHT);
  sideWall(LEFT);
  // back wall: patio door + windows
  {
    const sg = sideGeom(body, BACK);
    const du = sg.L * rng.range(0.3, 0.7);
    bandWithOpenings(sg, 0, sg.L, [{ u: du, w: 1.8, h: 2.15 }], (a, b) => {
      if (b - a > 1.8) {
        const gr = makeGrid(a, b, 0, gH, 1, { spacing: 2.6, winW: 1.1, winH: 1.35, sill: 0.95, margin: 0.4 });
        wallGrid(s, sg, a, b, 0, gH, gr, look());
      } else wallPlain(s, sg, a, b, 0, gH, plainLook);
    }, (a, b, y0) => wallPlain(s, sg, a, b, y0, gH, plainLook));
    // sliding patio door: lit glass
    setWallAttrs(s, { u0: du - 0.9, cw: 1.8, n: 1, v0: 0, ch: 2.15, m: 1, wx0: 0.05, wx1: 1.75, wy0: 0.06, wy1: 2.1 }, { color: trimC, pattern: WALLPAT.SMOOTH, frame: FRAME.WHITE, glass: GLASS.NEUTRAL, style: WIN.DOOR, profile: PROF.HOME, seed: g.seed + 2 });
    const ax = sx(sg, du - 0.9, -0.08), az = sz(sg, du - 0.9, -0.08), bx = sx(sg, du + 0.9, -0.08), bz = sz(sg, du + 0.9, -0.08);
    s.wall(ax, az, bx, bz, 0, 2.15, du - 0.9, du - 0.9, 1.8, 0, 2.15);
    setCol(g.trim, shade(wc, 0.85));
    sideBox(g.trim, sg, du - 0.9, du + 0.9, -0.08, 0, 2.15, 2.15 + 0.02, true);
    sideBox(g.trim, sg, du - 0.94, du - 0.9, -0.08, 0.05, 0, 2.17);
    sideBox(g.trim, sg, du + 0.9, du + 0.94, -0.08, 0.05, 0, 2.17);
    // reveal sides of the patio opening
    setCol(g.trim, shade(wc, 0.8));
    g.trim.quad(sx(sg, du - 0.9, 0), 0, sz(sg, du - 0.9, 0), ax, 0, az, ax, 2.15, az, sx(sg, du - 0.9, 0), 2.15, sz(sg, du - 0.9, 0));
    g.trim.quad(bx, 0, bz, sx(sg, du + 0.9, 0), 0, sz(sg, du + 0.9, 0), sx(sg, du + 0.9, 0), 2.15, sz(sg, du + 0.9, 0), bx, 2.15, bz);
  }

  // ── porch: deck, posts, railing, ceiling
  setCol(t, col('#a87f58'));
  t.box(pa, 0, zP, pb, 0.16, body.z1, 0b110111);
  setCol(t, trimC);
  const postH = floors === 2 ? gH : eave;
  for (const px of [pa + 0.12, pb - 0.12]) t.box(px - 0.1, 0.16, body.z1 - 0.22, px + 0.1, postH, body.z1 - 0.02, 0b111111);
  railing(t, pa + 0.2, body.z1 - 0.12, pa + Math.max(0.3, pw * 0.5 - 0.7), body.z1 - 0.12, 0.16, 0.8, trimC, 0.25, 1);
  railing(t, pb - Math.max(0.3, pw * 0.5 - 0.7), body.z1 - 0.12, pb - 0.2, body.z1 - 0.12, 0.16, 0.8, trimC, 0.25, 1);
  setCol(t, shade(trimC, 0.92));
  t.hrect(pa, zP, pb, body.z1, postH - 0.01, false);
  // a chair or bench on the porch
  if (rng.chance(0.6)) {
    setCol(t, col(rng.pick(['#6b4c37', '#f6f3ec', '#2f5d50'])));
    const bx = pa + 0.5;
    t.box(bx, 0.16, zP + 0.25, bx + 1.1, 0.6, zP + 0.7);
    t.box(bx, 0.6, zP + 0.18, bx + 1.1, 1.05, zP + 0.28);
  }

  // ── upper floor
  if (floors === 2) {
    for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
      const sg = sideGeom(body, sd);
      const n = Math.max(1, Math.min(3, Math.round((sg.L - 0.8) / 2.7)));
      const gr = makeGrid(0, sg.L, gH, fH, 1, { spacing: 2.7, cols: n, winW: 1.1, winH: Math.min(1.35, fH - 1.2), sill: 0.85, margin: 0.6 });
      wallGrid(s, sg, 0, sg.L, gH, eave, gr, look());
      if (shutters && (sd === FRONT || rng.chance(0.4))) shutterSet(sg, gr, false);
      setCol(t, trimC);
      for (let i = 0; i < gr.n; i++) {
        const u = gridU(gr, i);
        const ww = gr.wx1 - gr.wx0;
        sideBox(t, sg, u - ww / 2 - 0.08, u + ww / 2 + 0.08, 0, 0.1, gridY0(gr, 0) - 0.07, gridY0(gr, 0), true);
        if (boxes && sd === FRONT) flowerBox(sg, u, ww, gridY0(gr, 0));
      }
      // floor band
      setCol(t, trimC);
      sideBox(t, sg, 0, sg.L, 0, 0.06, gH - 0.04, gH + 0.12, true);
    }
    // upper floor overhangs the porch: underside
    setCol(t, shade(trimC, 0.9));
    t.hrect(pa, zP, pb, body.z1, gH - 0.005, false);
  }

  // ── roof
  const roofC = col(rng.pick(HOUSE_ROOFS));
  const pat = roofC.r > roofC.b * 1.25 ? ROOFPAT.TILES : ROOFPAT.SLATE;
  const ridgeAlongX = rng.chance(0.55);
  if (lot.roof === 'hip') {
    const rise = Math.min(W, D) * rng.range(0.28, 0.36);
    hipRoof(g, body, eave, eave + rise, 0.4, roofC, pat, trimC);
  } else if (ridgeAlongX) {
    const half = (body.z1 - body.z0) / 2;
    const rise = half * rng.range(0.6, floors === 1 ? 0.95 : 0.8);
    gableRoof(g, body, true, eave, eave + rise, 0.4, 0.3, roofC, pat, trimC);
    for (const sd of [RIGHT, LEFT] as Side[]) {
      const sg = sideGeom(body, sd);
      const attic = makeGrid(sg.L / 2 - 0.55, sg.L / 2 + 0.55, eave + 0.35, Math.min(1.5, rise * 0.6), 1, { spacing: 1.1, cols: 1, winW: 0.7, winH: Math.min(0.95, rise * 0.45), sill: 0.05, margin: 0 });
      wallTri(s, sg, 0, sg.L, sg.L / 2, eave, eave + rise, plainLook, rise > 2.2 ? attic : null, WIN.MUNTIN, PROF.HOME, FRAME.WHITE, GLASS.NEUTRAL);
    }
    if (floors === 1 && rise > 2.6 && rng.chance(0.7)) dormer((body.x0 + body.x1) / 2 + rng.range(-1, 1), body.z1 - 1.3, eave + 1.3 * (rise / half), rise / half, roofC, pat);
    if (rng.chance(0.18)) solar(eave, rise, 0.4);
    chimney(g, (drive === RIGHT ? body.x0 + 1.0 : body.x1 - 1.0), (body.z0 + body.z1) / 2 - 0.9, eave + rise * 0.4, eave + rise + 0.7, 0.62, 0.62, col(rng.pick(['#9a5a45', '#8a4f3e', '#a0a0a0'])));
  } else {
    const half = (body.x1 - body.x0) / 2;
    const rise = half * rng.range(0.6, 0.85);
    gableRoof(g, body, false, eave, eave + rise, 0.4, 0.3, roofC, pat, trimC);
    for (const sd of [FRONT, BACK] as Side[]) {
      const sg = sideGeom(body, sd);
      const attic = makeGrid(sg.L / 2 - 0.55, sg.L / 2 + 0.55, eave + 0.35, Math.min(1.5, rise * 0.6), 1, { spacing: 1.1, cols: 1, winW: 0.7, winH: Math.min(0.95, rise * 0.45), sill: 0.05, margin: 0 });
      wallTri(s, sg, 0, sg.L, sg.L / 2, eave, eave + rise, plainLook, rise > 2.2 ? attic : null, WIN.MUNTIN, PROF.HOME, FRAME.WHITE, GLASS.NEUTRAL);
    }
    chimney(g, (drive === RIGHT ? body.x0 + 0.9 : body.x1 - 0.9), body.z0 + 1.2, eave + rise * 0.3, eave + rise + 0.6, 0.62, 0.62, col(rng.pick(['#9a5a45', '#8a4f3e'])));
  }

  // ── helpers
  function garageDoor(sg: SideGeom, u: number, w: number, h: number): void {
    const gc = col(rng.pick(['#f2efe8', '#d9d4c8', '#8a6a4f', '#7d8790']));
    setCol(t, gc);
    const d = 0.1;
    sideBox(t, sg, u - w / 2, u + w / 2, -d, -d + 0.02, 0, h, false, true);
    setCol(t, shade(gc, 0.82));
    for (let k = 1; k < 5; k++) sideBox(t, sg, u - w / 2 + 0.05, u + w / 2 - 0.05, -d + 0.02, -d + 0.04, (h * k) / 5 - 0.025, (h * k) / 5 + 0.025);
    // reveals + lintel
    setCol(t, shade(wc, 0.8));
    const ax = sx(sg, u - w / 2, 0), az = sz(sg, u - w / 2, 0), axi = sx(sg, u - w / 2, -d), azi = sz(sg, u - w / 2, -d);
    const bx = sx(sg, u + w / 2, 0), bz = sz(sg, u + w / 2, 0), bxi = sx(sg, u + w / 2, -d), bzi = sz(sg, u + w / 2, -d);
    t.quad(ax, 0, az, axi, 0, azi, axi, h, azi, ax, h, az);
    t.quad(bxi, 0, bzi, bx, 0, bz, bx, h, bz, bxi, h, bzi);
    t.quad(axi, h, azi, bxi, h, bzi, bx, h, bz, ax, h, az);
    setCol(t, trimC);
    sideBox(t, sg, u - w / 2 - 0.12, u + w / 2 + 0.12, 0, 0.08, h, h + 0.14, true);
    sideBox(t, sg, u - w / 2 - 0.12, u - w / 2, 0, 0.08, 0, h);
    sideBox(t, sg, u + w / 2, u + w / 2 + 0.12, 0, 0.08, 0, h);
    wallLamp(g, sg, u + w / 2 + 0.4, 2.42, 0);
  }

  function shutterSet(sg: SideGeom, gr: Grid, ground: boolean): void {
    setCol(t, shutterC);
    const out = ground ? 0.06 : 0.07;
    for (let i = 0; i < gr.n; i++) {
      const u = gridU(gr, i);
      const ww = gr.wx1 - gr.wx0;
      const y0 = gridY0(gr, 0),
        y1 = gridY1(gr, 0);
      sideBox(t, sg, u - ww / 2 - ww * 0.48 - 0.04, u - ww / 2 - 0.04, 0, out, y0, y1);
      sideBox(t, sg, u + ww / 2 + 0.04, u + ww / 2 + ww * 0.48 + 0.04, 0, out, y0, y1);
    }
  }

  function flowerBox(sg: SideGeom, u: number, ww: number, y0: number): void {
    setCol(t, col('#7a4b2a'));
    sideBox(t, sg, u - ww / 2, u + ww / 2, 0.08, 0.32, y0 - 0.02, y0 + 0.2, true);
    setCol(t, col('#4f8a3c'));
    sideBox(t, sg, u - ww / 2 + 0.03, u + ww / 2 - 0.03, 0.1, 0.3, y0 + 0.2, y0 + 0.28);
    setCol(t, col(rng.pick(FLOWERS)));
    const n = Math.max(3, Math.round(ww / 0.22));
    for (let k = 0; k < n; k++) {
      const fu = u - ww / 2 + 0.08 + ((ww - 0.16) * (k + 0.5)) / n;
      const fo = 0.13 + (k % 2) * 0.09;
      sideBox(t, sg, fu - 0.06, fu + 0.06, fo, fo + 0.1, y0 + 0.28, y0 + 0.38);
    }
  }

  function dormer(cx: number, zFront: number, yBase: number, pitch: number, roofCol: THREE.Color, rp: number): void {
    const w = 1.6,
      wh = 1.35;
    const sgF: SideGeom = { x0: cx - w / 2, z0: zFront, tx: 1, tz: 0, nx: 0, nz: 1, L: w };
    const gr = makeGrid(0, w, yBase, wh, 1, { spacing: w, cols: 1, winW: 0.9, winH: 0.85, sill: 0.25, margin: 0.1 });
    wallGrid(s, sgF, 0, w, yBase - 0.3, yBase + wh, gr, look());
    const ridge = yBase + wh + 0.6;
    wallTri(s, sgF, 0, w, w / 2, yBase + wh, ridge, plainLook);
    const depth = wh / pitch + 0.6;
    const zb = zFront - depth;
    wallSeg(s, cx + w / 2, zFront, cx + w / 2, zb, yBase - 0.3, yBase + wh, null, plainLook);
    wallSeg(s, cx - w / 2, zb, cx - w / 2, zFront, yBase - 0.3, yBase + wh, null, plainLook);
    roofLook(s, roofCol, rp, g.seed + 3);
    const o = 0.12;
    const ey = yBase + wh - o * 0.8;
    const sl = Math.hypot(w / 2 + o, ridge - ey);
    roofPoly(s, [[cx + w / 2 + o, ey, zFront + 0.15], [cx + w / 2 + o, ey, zb], [cx, ridge, zb], [cx, ridge, zFront + 0.15]], [0, 0, -1], [-(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
    roofPoly(s, [[cx - w / 2 - o, ey, zb], [cx - w / 2 - o, ey, zFront + 0.15], [cx, ridge, zFront + 0.15], [cx, ridge, zb]], [0, 0, 1], [(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
  }

  function solar(ye: number, rise: number, oh: number): void {
    // a small array of panels on the front slope
    const half = (body.z1 - body.z0) / 2;
    const slope = rise / half;
    const z0 = body.z1 - 1.0,
      z1 = body.z1 - half * 0.62;
    const y0 = ye + (body.z1 - z0) * slope + 0.09,
      y1 = ye + (body.z1 - z1) * slope + 0.09;
    const xm = (body.x0 + body.x1) / 2 + rng.range(-0.8, 0.8);
    const n = rng.int(2, 3);
    const pw = 1.05;
    const x0 = xm - (n * pw) / 2,
      x1 = xm + (n * pw) / 2;
    setCol(t, col('#26324a'));
    t.quad(x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y1, z1);
    setCol(t, col('#c9ced3'));
    for (let k = 0; k <= n; k++) {
      const x = x0 + pw * k;
      t.beam(x, y0 + 0.02, z0, x, y1 + 0.02, z1, 0.04, 0.03);
    }
    t.beam(x0, y0 + 0.02, z0, x1, y0 + 0.02, z0, 0.04, 0.03);
    t.beam(x0, y1 + 0.02, z1, x1, y1 + 0.02, z1, 0.04, 0.03);
    void oh;
  }
}

function jitPick(rng: Gen['rng'], list: string[]): THREE.Color {
  const c = col(rng.pick(list));
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h + (rng.next() - 0.5) * 0.02, Math.min(1, Math.max(0, hsl.s + (rng.next() - 0.5) * 0.06)), Math.min(1, Math.max(0, hsl.l + (rng.next() - 0.5) * 0.05)));
  return c;
}

// ───────────────────────────────────────────────────────── apartments ──

const APT_WALLS = ['#e9e1d0', '#d9e2e4', '#efd9b8', '#dcd3e3', '#e2e8d4'];
/** muted, weathered painted-concrete tones for balcony fronts (one per building, ± per balcony) */
const APT_BALC = ['#d8cfc0', '#cfd6d2', '#e3d6c3', '#c9c2b6', '#d6dccf', '#e6e1d6', '#c6cdd0', '#dccbb8'];
/** muted parasol canvases */
const APT_PARASOL = ['#efe9dc', '#e6e1d6', '#cfd6d2', '#d9c7a8', '#b9c4c8'];

export function genApartment(g: Gen): void {
  const { lot, rng, W, D } = g;
  const H = lot.height;
  const floors = Math.max(2, lot.floors);
  const INS_F = 0.75; // front: stair cores project up to the footprint line
  const INS = 0.2;
  const body: LRect = { x0: -W / 2 + INS, x1: W / 2 - INS, z0: -D / 2 + INS + 0.6, z1: D / 2 - INS_F };
  const gH = 3.3;
  const fH = (H - gH - 0.2) / (floors - 1);
  const wallC = col(rng.pick(APT_WALLS));
  // balcony fronts: weathered painted concrete in a muted tone, frosted glass, or slim metal railings (per building)
  const balTone = col(rng.pick(APT_BALC)).lerp(wallC, 0.3);
  const accent = [balTone, shade(balTone, 0.94)];
  const balStyle = rng.weighted(['solid', 'glass', 'bars'] as const, [0.5, 0.25, 0.25]);
  const railC = col(rng.pick(['#9aa3a8', '#e9e6dd', '#3a3f44']));
  const look = (profile: number = PROF.HOME): WallLook => ({ color: wallC, pattern: WALLPAT.PANELS, frame: FRAME.ALU, glass: GLASS.NEUTRAL, style: WIN.PLAIN, profile, seed: g.seed });
  const plain = { color: wallC, pattern: WALLPAT.PANELS, seed: g.seed };
  const s = g.shell,
    t = g.trim;
  const coreW = 3.2;
  const cores = g.doors.filter((d) => d.side === FRONT).map((d) => d.u - INS);

  // facades
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    const long = sd === FRONT || sd === BACK;
    if (!long) {
      // rainwater from the roof scuppers: downpipes near both corners of the gable ends (side inset INS)
      const pc = col(rng.pick(['#8d9497', '#5a5f62', '#e9e6dd']));
      downpipe(g, sg, 0.3, H + 0.3, pc, INS);
      if (rng.chance(0.5)) downpipe(g, sg, sg.L - 0.3, H + 0.3, pc, INS);
      // gable ends: a column of small windows
      const gr = makeGrid(0, sg.L, gH, fH, floors - 1, { spacing: 3.0, cols: 2, winW: 0.9, winH: 1.3, sill: 0.95, margin: 1.6 });
      wallGrid(s, sg, 0, sg.L, gH, H, gr, look());
      const gr0 = makeGrid(0, sg.L, 0, gH, 1, { spacing: 3.0, cols: 2, winW: 0.9, winH: 1.3, sill: 1.0, margin: 1.6 });
      wallGrid(s, sg, 0, sg.L, 0, gH, gr0, look());
      continue;
    }
    // window grid in bays; cores interrupt the front
    const ops = sd === FRONT ? cores.map((u) => ({ u, w: coreW, h: H })) : [];
    bandWithOpenings(sg, 0, sg.L, ops, (a, b) => {
      const n = Math.max(1, Math.round((b - a - 0.6) / 3.0));
      const gr = makeGrid(a, b, gH, fH, floors - 1, { spacing: 3.0, cols: n, winW: 1.5, winH: 1.5, sill: 0.85, margin: 0.4 });
      wallGrid(s, sg, a, b, gH, H, gr, look());
      const gr0 = makeGrid(a, b, 0, gH, 1, { spacing: 3.0, cols: n, winW: 1.5, winH: 1.45, sill: 1.0, margin: 0.4 });
      wallGrid(s, sg, a, b, 0, gH, gr0, look());
      // balconies on every other column, from the first floor up
      for (let i = 0; i < gr.n; i++) {
        if ((i + (sd === BACK ? 1 : 0)) % 2 === 1) continue;
        const u = gridU(gr, i);
        for (let j = 0; j < gr.m; j++) balcony(sg, u, gr.v0 + j * gr.ch, accent[(i + j) % 2], sd === BACK);
      }
      // ground floor plinth band
      setCol(t, shade(wallC, 0.78));
      sideBox(t, sg, a, b, 0, 0.12, 0, 0.5);
      // signs of life on the back: AC condensers on brackets beside windows without a balcony, a few dishes
      if (sd === BACK) {
        for (let i = 0; i < gr.n; i++) {
          if ((i + 1) % 2 === 1) continue; // balcony column
          for (let j = 0; j < gr.m; j++) {
            const y = gr.v0 + j * gr.ch + 0.35;
            if (rng.chance(0.22)) acUnit(g, sg, gridU(gr, i) + (rng.chance(0.5) ? 1.25 : -1.25), y, 0);
            else if (rng.chance(0.08)) dish(g, sg, gridU(gr, i) + 1.1, y + 1.6, 0);
          }
        }
      }
    }, () => {});
    if (sd === FRONT) for (const u of cores) stairCore(sg, u);
    // floor bands
    setCol(t, shade(wallC, 0.92));
    sideBox(t, sg, 0, sg.L, 0, 0.1, gH - 0.15, gH, true);
  }
  // roof: parapet, railing, aerials, solar
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    wallPlain(s, sg, 0, sg.L, H, H + 0.6, plain);
  }
  setCol(t, shade(wallC, 0.8));
  t.box(body.x0, H + 0.6, body.z0, body.x1, H + 0.68, body.z0 + 0.25, 0b111111);
  t.box(body.x0, H + 0.6, body.z1 - 0.25, body.x1, H + 0.68, body.z1, 0b111111);
  anchors.perch(body.x0 + 0.3, H + 0.68, body.z0 + 0.12, body.x1 - 0.3, H + 0.68, body.z0 + 0.12, 'parapet');
  t.box(body.x0, H + 0.6, body.z0 + 0.25, body.x0 + 0.25, H + 0.68, body.z1 - 0.25, 0b110111);
  t.box(body.x1 - 0.25, H + 0.6, body.z0 + 0.25, body.x1, H + 0.68, body.z1 - 0.25, 0b110111);
  const inner: LRect = { x0: body.x0 + 0.25, x1: body.x1 - 0.25, z0: body.z0 + 0.25, z1: body.z1 - 0.25 };
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(inner, sd);
    const ax = sx(sg, 0, 0), az = sz(sg, 0, 0), bx = sx(sg, sg.L, 0), bz = sz(sg, sg.L, 0);
    setCol(t, shade(wallC, 0.88));
    t.quad(bx, H, bz, ax, H, az, ax, H + 0.6, az, bx, H + 0.6, bz);
  }
  flatRoof(s, inner, H + 0.02, col('#8e8b84'), ROOFPAT.FLAT, g.seed);
  railing(t, inner.x0 + 0.1, inner.z1 - 0.1, inner.x1 - 0.1, inner.z1 - 0.1, H + 0.68, 0.5, col('#9aa3aa'), 2.0, 0);
  // lived-in roof: solar water heaters, tanks, AC condensers, aerials (stair-core roofs + PV strip kept clear)
  const keep = cores.map((u) => ({ x0: body.x0 + u - coreW / 2 - 0.4, x1: body.x0 + u + coreW / 2 + 0.4, z0: body.z1 - 1.2, z1: body.z1 + 1 }));
  const pv = rng.chance(0.3);
  if (pv) keep.push({ x0: inner.x0, x1: inner.x1, z0: inner.z0, z1: inner.z0 + 2.7 });
  roofClutter(g, inner.x0, inner.z0, inner.x1, inner.z1 - 0.3, H + 0.02, { keep, density: 1.3 });
  // solar panels
  if (pv) {
    for (let k = 0; k < 3; k++) {
      const px = inner.x0 + 3 + k * 3.2;
      if (px + 2.4 > inner.x1 - 2) break;
      setCol(t, col('#26324a'));
      t.quadAway(px, H + 0.4, inner.z0 + 1.0, px + 2.4, H + 0.4, inner.z0 + 1.0, px + 2.4, H + 1.2, inner.z0 + 2.4, px, H + 1.2, inner.z0 + 2.4, px + 1.2, H - 1, inner.z0 + 1.7);
      setCol(t, col('#9aa3aa'));
      t.box(px + 0.2, H, inner.z0 + 1.0, px + 0.3, H + 0.4, inner.z0 + 1.1, 0b111111);
      t.box(px + 2.1, H, inner.z0 + 1.0, px + 2.2, H + 0.4, inner.z0 + 1.1, 0b111111);
    }
  }

  function stairCore(sg: SideGeom, u: number): void {
    // a slightly projecting tower with a vertical strip of lit stairwell windows
    const a = u - coreW / 2,
      b = u + coreW / 2;
    const out = INS_F - 0.02;
    const coreC = shade(wallC, 0.86);
    const core: LRect = { x0: sg.x0 + a, x1: sg.x0 + b, z0: sg.z0 - 0.6, z1: sg.z0 + out };
    for (const sd of [FRONT, RIGHT, LEFT] as Side[]) {
      const cg = sideGeom(core, sd);
      if (sd === FRONT) {
        const gr: Grid = { u0: 0.7, cw: coreW - 1.4, n: 1, v0: gH, ch: fH, m: floors - 1, wx0: 0.15, wx1: coreW - 1.55, wy0: fH * 0.45, wy1: fH * 0.95 };
        wallGrid(s, cg, 0, cg.L, gH, H + 1.6, gr, { color: coreC, pattern: WALLPAT.PANELS, frame: FRAME.ALU, glass: GLASS.NEUTRAL, style: WIN.INDUSTRIAL, profile: PROF.ALWAYS, seed: g.seed + 7 });
        // entrance with canopy
        bandWithOpenings(cg, 0, cg.L, [{ u: cg.L / 2, w: 1.6, h: 2.4 }], (aa, bb) => wallPlain(s, cg, aa, bb, 0, gH, { color: coreC, pattern: WALLPAT.PANELS, seed: g.seed }), (aa, bb, y0) => wallPlain(s, cg, aa, bb, y0, gH, { color: coreC, pattern: WALLPAT.PANELS, seed: g.seed }));
        doorNiche(g, cg, cg.L / 2, { w: 1.6, h: 2.4, depth: 0.25, wallColor: coreC, frameColor: col('#5a6066'), doorColor: col('#5a6066'), glass: true, profile: PROF.ALWAYS, seed: g.seed + 3, frameOut: 0.0 });
        // intercom / bell panel beside the entrance (flush: the core front sits on the footprint line)
        setCol(t, col('#9aa0a4'));
        sideBox(t, cg, cg.L / 2 + 1.0, cg.L / 2 + 1.2, 0, 0.018, 1.15, 1.5, true);
        setCol(t, col('#26292c'));
        for (let k = 0; k < 6; k++) sideBox(t, cg, cg.L / 2 + 1.03, cg.L / 2 + 1.17, 0.018, 0.024, 1.19 + k * 0.045, 1.215 + k * 0.045);
        sideBox(t, cg, cg.L / 2 + 1.05, cg.L / 2 + 1.15, 0.018, 0.026, 1.45, 1.48);
        setCol(t, col('#5a6066'));
        sideBox(t, cg, -0.3, cg.L + 0.3, 0, 1.1, 2.75, 2.95, true);
        lightBox(g, sx(cg, cg.L / 2, 0.6) - 0.15, 2.7, sz(cg, cg.L / 2, 0.6) - 0.15, sx(cg, cg.L / 2, 0.6) + 0.15, 2.75, sz(cg, cg.L / 2, 0.6) + 0.15, '#fff1d6', LIGHT_MODE.STEADY, 3.5);
      } else {
        wallPlain(s, cg, 0, cg.L, 0, H + 1.6, { color: coreC, pattern: WALLPAT.PANELS, seed: g.seed });
        if (sd === RIGHT) {
          // a bank of letter boxes on the side of the stair core, near the entrance
          const mc = col(rng.pick(['#3f4a52', '#8c949a', '#6b4a32']));
          for (let r = 0; r < 3; r++)
            for (let c2 = 0; c2 < 2; c2++) {
              const u0 = 0.06 + c2 * 0.31,
                y0 = 0.95 + r * 0.3;
              setCol(t, mc);
              sideBox(t, cg, u0, u0 + 0.3, 0, 0.22, y0, y0 + 0.28, true);
              setCol(t, col('#141618'));
              sideBox(t, cg, u0 + 0.05, u0 + 0.25, 0.22, 0.226, y0 + 0.2, y0 + 0.225);
            }
        }
      }
    }
    // core roof (lift motor room)
    flatRoof(s, core, H + 1.6, col('#8e8b84'), ROOFPAT.FLAT, g.seed);
    setCol(t, shade(coreC, 0.85));
    t.box(core.x0 - 0.05, H + 1.6, core.z0 - 0.05, core.x1 + 0.05, H + 1.75, core.z1 + 0.05);
  }

  function balcony(sg: SideGeom, u: number, yFloor: number, ac: THREE.Color, back: boolean): void {
    const w = 2.5,
      dep = back ? 1.15 : 1.1;
    const y = yFloor;
    setCol(t, shade(wallC, 0.95));
    sideBox(t, sg, u - w / 2, u + w / 2, 0, dep, y - 0.16, y, true);
    // dirty drip edge under the slab
    setCol(t, shade(wallC, 0.62));
    sideBox(t, sg, u - w / 2 + 0.01, u + w / 2 - 0.01, dep - 0.01, dep + 0.005, y - 0.24, y - 0.16, true);
    const jitter = 0.95 + rng.next() * 0.08;
    if (balStyle === 'solid') {
      // painted concrete parapet: weathered tone, a darker run-off band along its foot
      setCol(t, shade(ac, jitter));
      sideBox(t, sg, u - w / 2, u + w / 2, dep - 0.08, dep, y + 0.16, y + 1.0, true);
      sideBox(t, sg, u - w / 2, u - w / 2 + 0.08, 0, dep - 0.08, y, y + 1.0, true);
      sideBox(t, sg, u + w / 2 - 0.08, u + w / 2, 0, dep - 0.08, y, y + 1.0, true);
      setCol(t, shade(ac, jitter * 0.78));
      sideBox(t, sg, u - w / 2, u + w / 2, dep - 0.08, dep, y, y + 0.16, true);
      setCol(t, shade(ac, 1.04));
      sideBox(t, sg, u - w / 2 - 0.02, u + w / 2 + 0.02, dep - 0.1, dep + 0.02, y + 1.0, y + 1.06, true);
    } else if (balStyle === 'glass') {
      // frosted glass panels between slim posts, metal handrail
      setCol(t, col('#b9c6c9').multiplyScalar(jitter));
      sideBox(t, sg, u - w / 2 + 0.04, u + w / 2 - 0.04, dep - 0.05, dep - 0.03, y + 0.08, y + 0.95, true, true);
      for (const e of [-1, 1]) sideBox(t, sg, u + e * (w / 2 - 0.04) - 0.02, u + e * (w / 2 - 0.04) + 0.02, 0.02, dep - 0.03, y + 0.08, y + 0.95, true, true);
      setCol(t, railC);
      sideBox(t, sg, u - w / 2, u + w / 2, dep - 0.07, dep - 0.01, y + 0.95, y + 1.0, true);
      for (const e of [-1, 0, 1]) sideBox(t, sg, u + e * (w / 2 - 0.03) - 0.02, u + e * (w / 2 - 0.03) + 0.02, dep - 0.06, dep - 0.02, y, y + 0.96, true);
    } else {
      ironRail(g, sg, u - w / 2 + 0.03, u + w / 2 - 0.03, dep - 0.05, y, 1.0, railC, true);
    }
    anchors.balcony(sx(sg, u, dep / 2), y, sz(sg, u, dep / 2), sg.nx, sg.nz, w - 0.16, dep - 0.08, 1.0);
    // life on the balcony
    const r = rng.next();
    if (r >= 0.22) {
      balconyLife(g, sg, u - w / 2 + 0.1, u + w / 2 - 0.1, y, { rail: 1.0, depth: dep - 0.1, solid: balStyle !== 'bars', green: back ? 0.75 : 0.95 });
      if (r > 0.9) {
        // parasol
        setCol(t, col(rng.pick(APT_PARASOL)));
        const px = sx(sg, u, 0.6), pz = sz(sg, u, 0.6);
        t.cone(px, pz, 0.85, y + 1.7, y + 2.05, 8);
        setCol(t, col('#dddddd'));
        t.cylinder(px, pz, 0.025, y, y + 1.72, 4, false);
      }
    } else {
      // laundry line
      setCol(t, col('#dddddd'));
      const ax = sx(sg, u - w / 2 + 0.3, 0.55), az = sz(sg, u - w / 2 + 0.3, 0.55);
      const bx = sx(sg, u + w / 2 - 0.3, 0.55), bz = sz(sg, u + w / 2 - 0.3, 0.55);
      t.beam(ax, y + 1.25, az, bx, y + 1.25, bz, 0.02, 0.02);
      anchors.laundryLine(ax, y + 1.24, az, bx, y + 1.24, bz, sg.nx, sg.nz);
      // static cloth (separate mesh; life replaces it with flapping cloth)
      const cols = ['#e63946', '#f1faee', '#457b9d', '#e9c46a'];
      const c = g.cloth;
      for (let k = 0; k < 3; k++) {
        const f = 0.2 + k * 0.28;
        setCol(c, col(cols[(k + Math.floor(r * 10)) % 4]));
        const cx = ax + (bx - ax) * f, cz = az + (bz - az) * f;
        c.box(cx - 0.18 * Math.abs(sg.tx) - 0.01, y + 0.85, cz - 0.18 * Math.abs(sg.tz) - 0.01, cx + 0.18 * Math.abs(sg.tx) + 0.01, y + 1.24, cz + 0.18 * Math.abs(sg.tz) + 0.01, 0b111111);
      }
    }
  }
}

void wallLamp;
void hipRoof;
void setWallAttrs;
void gridY1;
void partitionSide;
