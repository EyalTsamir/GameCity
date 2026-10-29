// One-off buildings: the Grand Hotel (stone, marquee, rooftop sign), the Seaview
// Hotel (seaside white with balconies, corner turrets, neon roof letters), the
// Westbrook School + gym annex (brick, big classroom windows, clock, cupola),
// the Harbour Master's office (lookout lantern, clock, signal mast), the station
// and beach kiosks (service windows, awnings, a giant ice-cream cone) and the
// Rowing Club boathouse (timber, boat doors, crossed oars).

import * as THREE from 'three';
import {
  Gen, LRect, Side, FRONT, RIGHT, BACK, LEFT, Grid, WallLook, SideGeom,
  sideGeom, sideBox, sx, sz, makeGrid, gridU, gridY0, gridY1, wallGrid, wallPlain, wallSeg, wallTri,
  gableRoof, hipRoof, flatRoof, roofLook, roofPoly, chimney, doorNiche, bandWithOpenings, railing, signOnSide,
  col, shade, setCol, lightBox, wallLamp,
} from './gen';
import { anchors } from './anchors';
import { balconyLife, potPlant, roofClutter } from './clutter';
import { GREEN } from './green';
import { WIN, PROF, WALLPAT, ROOFPAT, FRAME, GLASS, LIGHT_MODE, shopType } from './materials';
import { letterSign, boardSign, clockFace, noticeBoard } from './signs';
import { partitionSide } from './oldtown';

const PREV: Side[] = [LEFT, FRONT, RIGHT, BACK];

interface Facade {
  body: LRect;
  ins: number[];
  exposed: boolean[];
}

function makeBody(g: Gen, INS: number): Facade {
  const exposed = [0, 1, 2, 3].map((s) => g.cover[s].length === 0);
  const ins = exposed.map((e) => (e ? INS : 0));
  return { body: { x0: -g.W / 2 + ins[LEFT], x1: g.W / 2 - ins[RIGHT], z0: -g.D / 2 + ins[BACK], z1: g.D / 2 - ins[FRONT] }, ins, exposed };
}

/** Doors on a body side (u along the body side). */
function doorsOn(g: Gen, f: Facade, s: Side, L: number): number[] {
  return g.doors.filter((d) => d.side === s).map((d) => Math.min(L - 1.0, Math.max(1.0, d.u - f.ins[PREV[s]])));
}

/** Sub-ranges of [a,b] that avoid the given openings (with a small margin). */
function around(a: number, b: number, ops: { u: number; w: number }[]): [number, number][] {
  const out: [number, number][] = [];
  let cur = a;
  for (const o of [...ops].sort((x, y) => x.u - y.u)) {
    const oa = o.u - o.w / 2 - 0.15,
      ob = o.u + o.w / 2 + 0.15;
    if (oa > cur + 0.05) out.push([cur, oa]);
    cur = Math.max(cur, ob);
  }
  if (b > cur + 0.05) out.push([cur, b]);
  return out;
}

// ─────────────────────────────────────────────────────────── hotels ──

export function genHotel(g: Gen): void {
  if (g.lot.name === 'Seaview Hotel' || g.lot.roof === 'hip') seaview(g);
  else grand(g);
}

function grand(g: Gen): void {
  const { lot, rng } = g;
  const f = makeBody(g, 0.3);
  const body = f.body;
  const H = lot.height;
  const floors = Math.max(3, lot.floors);
  const gH = 5.0;
  const fH = (H - gH - 1.2) / (floors - 1);
  const stone = col('#dcc9a6');
  const base = col('#c6b08a');
  const s = g.shell,
    t = g.trim;
  const look = (style: number, color = stone, pattern: number = WALLPAT.STONE): WallLook => ({ color, pattern, frame: FRAME.WOOD, glass: GLASS.NEUTRAL, style, profile: PROF.HOTEL, seed: g.seed });
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    const parts = partitionSide(g, sd, sg.L, f.ins[PREV[sd]]);
    const doors = doorsOn(g, f, sd, sg.L);
    for (const p of parts) {
      if (p.covered) {
        wallPlain(s, sg, p.a, p.b, 0, H + 1.2, { color: stone, pattern: WALLPAT.STONE, seed: g.seed });
        continue;
      }
      const ops = doors.filter((u) => u >= p.a && u <= p.b).map((u) => ({ u, w: 2.6, h: 3.4 }));
      bandWithOpenings(sg, p.a, p.b, ops, (a, b) => {
        const n = Math.max(1, Math.round((b - a) / 3.4));
        const gr = makeGrid(a, b, 0, gH, 1, { spacing: (b - a) / n, cols: n, winW: 1.7, winH: 3.0, sill: 0.8, margin: 0.4 });
        wallGrid(s, sg, a, b, 0, gH, gr, { ...look(WIN.ARCHED, base), profile: PROF.HOTEL });
      }, (a, b, y0) => wallPlain(s, sg, a, b, y0, gH, { color: base, pattern: WALLPAT.STONE, seed: g.seed }));
      const n = Math.max(1, Math.round((p.b - p.a - 1.0) / 3.0));
      const gr = makeGrid(p.a, p.b, gH, fH, floors - 1, { spacing: 3.0, cols: n, winW: 1.3, winH: fH * 0.6, sill: 0.8, margin: 0.8 });
      wallGrid(s, sg, p.a, p.b, gH, H + 1.2, gr, look(WIN.MUNTIN));
      // window trims + iron balconies on the first floor and every third
      for (let j = 0; j < gr.m; j++) {
        for (let i = 0; i < gr.n; i++) {
          const u = gridU(gr, i);
          const ww = gr.wx1 - gr.wx0;
          setCol(t, col('#efe4cc'));
          sideBox(t, sg, u - ww / 2 - 0.12, u + ww / 2 + 0.12, 0, 0.12, gridY0(gr, j) - 0.1, gridY0(gr, j), true);
          sideBox(t, sg, u - ww / 2 - 0.14, u + ww / 2 + 0.14, 0, 0.1, gridY1(gr, j), gridY1(gr, j) + 0.18, true);
          if ((j === 0 || j % 3 === 2) && sd === FRONT) {
            const yb = gridY0(gr, j) - 0.1;
            setCol(t, col('#efe4cc'));
            sideBox(t, sg, u - ww / 2 - 0.3, u + ww / 2 + 0.3, 0, 0.55, yb - 0.12, yb, true);
            railing(t, sx(sg, u - ww / 2 - 0.28, 0.52), sz(sg, u - ww / 2 - 0.28, 0.52), sx(sg, u + ww / 2 + 0.28, 0.52), sz(sg, u + ww / 2 + 0.28, 0.52), yb, 0.9, col('#2c3035'), 0.14, 1);
            anchors.balcony(sx(sg, u, 0.27), yb, sz(sg, u, 0.27), sg.nx, sg.nz, ww + 0.6, 0.55, 0.9);
            // flower troughs / pots behind the iron railing
            if (rng.chance(0.55)) {
              const c = rng.weighted([GREEN.GERANIUM, GREEN.PETUNIA, GREEN.IVY_HANG], [3, 2, 1]);
              if (c === GREEN.GERANIUM) for (const du of [-ww * 0.3, ww * 0.3]) potPlant(g, sg, u + du, 0.22, yb, 0.85, c);
              else g.green.hang(sg, u - ww / 2 - 0.2, u + ww / 2 + 0.2, 0.55, yb + 0.9, 0.35, 0.9, c, 0.08);
            }
          }
        }
      }
      // rusticated base band + cornices
      setCol(t, col('#efe4cc'));
      sideBox(t, sg, p.a, p.b, 0, 0.25, gH - 0.1, gH + 0.25, true);
      sideBox(t, sg, p.a, p.b, 0, 0.55, H - 0.2, H + 0.25, true);
      sideBox(t, sg, p.a, p.b, 0, 0.3, H + 1.2, H + 1.38, true);
      for (const u of doors.filter((d) => d >= p.a && d <= p.b)) {
        doorNiche(g, sg, u, { w: 2.6, h: 3.4, depth: 0.45, wallColor: base, frameColor: col('#5a3d2b'), doorColor: col('#5a3d2b'), glass: true, profile: PROF.ALWAYS, seed: g.seed + 4, frameOut: 0.2 });
        if (sd === FRONT) marquee(sg, u);
        else {
          setCol(t, col('#2c3035'));
          sideBox(t, sg, u - 1.8, u + 1.8, 0, 1.1, 3.75, 3.95, true);
        }
      }
    }
  }
  // flat roof + penthouse + rooftop sign
  const inner: LRect = { x0: body.x0 + 0.3, x1: body.x1 - 0.3, z0: body.z0 + 0.3, z1: body.z1 - 0.3 };
  flatRoof(s, inner, H + 0.02, col('#8d8a84'), ROOFPAT.FLAT, g.seed);
  innerParapet(g, inner, H, H + 1.2, shade(stone, 0.9));
  setCol(t, col('#cfc4ae'));
  t.box(inner.x0 + 3, H, inner.z0 + 2, inner.x1 - 3, H + 3.0, inner.z0 + 6);
  roofClutter(g, inner.x0, inner.z0, inner.x1, inner.z1, H + 0.02, { keep: [{ x0: inner.x0 + 2.6, x1: inner.x1 - 2.6, z0: inner.z0 + 1.6, z1: inner.z0 + 6.4 }, { x0: inner.x0, x1: inner.x1, z0: inner.z1 - 2.5, z1: inner.z1 }], density: 1.2 });
  setCol(t, col('#8f8c85'));
  t.box(inner.x0 + 2.8, H + 3.0, inner.z0 + 1.8, inner.x1 - 2.8, H + 3.15, inner.z0 + 6.2);
  // rooftop letters on a steel frame, facing the front
  const r = g.atlas.add('grand-hotel', 512, 96, letterSign('GRAND HOTEL', '#f2d27a', '#ffd27a', 'Georgia, "Times New Roman", serif', 1, '#6b4a1f'));
  const sgF = sideGeom(inner, FRONT);
  const wS = Math.min(sgF.L - 1, 15);
  setCol(t, col('#3a3f44'));
  for (let k = 0; k <= 4; k++) {
    const u = sgF.L / 2 - wS / 2 + (wS * k) / 4;
    sideBox(t, sgF, u - 0.06, u + 0.06, -0.6, -0.48, H, H + 4.6);
  }
  sideBox(t, sgF, sgF.L / 2 - wS / 2, sgF.L / 2 + wS / 2, -0.6, -0.5, H + 1.6, H + 1.7);
  signOnSide(g, sgF, sgF.L / 2 - wS / 2, sgF.L / 2 + wS / 2, -0.42, H + 1.7, H + 4.7, r);
  // flags over the entrance
  void rng;

  function marquee(sg: SideGeom, u: number): void {
    const w = 6.4;
    setCol(t, col('#2c3035'));
    sideBox(t, sg, u - w / 2, u + w / 2, 0, 1.2, 3.85, 4.5, true);
    setCol(t, col('#c9a24a'));
    sideBox(t, sg, u - w / 2 - 0.03, u + w / 2 + 0.03, 1.15, 1.22, 3.85, 4.5, true);
    const rr = g.atlas.add('grand-marquee', 384, 48, boardSign('GRAND HOTEL', { bg: '#2c3035', fg: '#f2d27a', glow: 1, glowColor: '#ffe3a0', spaced: true }));
    signOnSide(g, sg, u - w / 2 + 0.4, u + w / 2 - 0.4, 1.255, 3.95, 4.42, rr);
    // bulbs along the underside
    for (let k = 0; k < 9; k++) {
      const lu = u - w / 2 + 0.4 + ((w - 0.8) * k) / 8;
      const lx = sx(sg, lu, 1.0), lz = sz(sg, lu, 1.0);
      lightBox(g, lx - 0.07, 3.72, lz - 0.07, lx + 0.07, 3.86, lz + 0.07, '#ffe0a0', LIGHT_MODE.STEADY, 4);
    }
    // brass posts
    setCol(t, col('#c9a24a'));
    for (const pu of [u - w / 2 + 0.2, u + w / 2 - 0.2]) {
      const px = sx(sg, pu, 1.05), pz = sz(sg, pu, 1.05);
      void px;
      void pz;
    }
    // three flags on raked poles over the canopy: bracket, pole, finial, cloth hanging from the pole
    const designs = [
      ['#d94a3d', '#f4f1ea', '#2f6fd0'],
      ['#1f3a5f', '#c9a24a', '#1f3a5f'],
      ['#2e7d4f', '#f4f1ea', '#d94a3d'],
    ];
    for (let k = 0; k < 3; k++) hotelFlag(sg, u - 2.2 + k * 2.2, designs[k], k);
  }

  function hotelFlag(sg: SideGeom, fu: number, bands: string[], k: number): void {
    const o0 = 0.1,
      y0 = gH + 0.35,
      o1 = 1.16,
      y1 = gH + 1.45;
    const yAt = (o: number) => y0 + ((o - o0) / (o1 - o0)) * (y1 - y0);
    setCol(t, col('#2c3035'));
    sideBox(t, sg, fu - 0.07, fu + 0.07, 0, 0.12, y0 - 0.12, y0 + 0.12);
    setCol(t, col('#d8d8d8'));
    t.beam(sx(sg, fu, o0), y0, sz(sg, fu, o0), sx(sg, fu, o1), y1, sz(sg, fu, o1), 0.035, 0.035);
    setCol(t, col('#c9a24a'));
    const fx = sx(sg, fu, o1 - 0.01), fz = sz(sg, fu, o1 - 0.01);
    t.box(fx - 0.04, y1 - 0.02, fz - 0.04, fx + 0.04, y1 + 0.06, fz + 0.04, 0b111111);
    // cloth: hoist along the pole, hanging straight down; ripples run from hoist to fly
    const h0 = 0.3,
      h1 = 1.1,
      drop = 0.62;
    const NU = 6,
      NV = bands.length;
    const ph = k * 1.7;
    const P = (i: number, j: number): [number, number, number] => {
      const f = i / NU;
      const o = h0 + (h1 - h0) * f;
      const side = 0.07 * f * Math.sin(f * 7.5 + ph) + 0.02 * (j / NV) * f;
      const y = yAt(o) - 0.03 - drop * (j / NV) - 0.04 * f * f;
      return [sx(sg, fu + side, o), y, sz(sg, fu + side, o)];
    };
    for (let j = 0; j < NV; j++) {
      setCol(t, col(bands[j]));
      for (let i = 0; i < NU; i++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        t.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
        t.quad(b[0], b[1], b[2], a[0], a[1], a[2], d[0], d[1], d[2], c[0], c[1], c[2]);
      }
    }
  }
}

function innerParapet(g: Gen, inner: LRect, y0: number, y1: number, c: THREE.Color): void {
  const t = g.trim;
  setCol(t, c);
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(inner, sd);
    const ax = sx(sg, 0, 0), az = sz(sg, 0, 0), bx = sx(sg, sg.L, 0), bz = sz(sg, sg.L, 0);
    t.quad(bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz);
  }
  // coping
  const o: LRect = { x0: inner.x0 - 0.3, x1: inner.x1 + 0.3, z0: inner.z0 - 0.3, z1: inner.z1 + 0.3 };
  setCol(t, shade(c, 1.08));
  t.box(o.x0, y1, o.z0, o.x1, y1 + 0.1, inner.z0, 0b111111);
  t.box(o.x0, y1, inner.z1, o.x1, y1 + 0.1, o.z1, 0b111111);
  t.box(o.x0, y1, inner.z0, inner.x0, y1 + 0.1, inner.z1, 0b110111);
  t.box(inner.x1, y1, inner.z0, o.x1, y1 + 0.1, inner.z1, 0b110111);
}

function seaview(g: Gen): void {
  const { lot, rng } = g;
  const f = makeBody(g, 0.3);
  const body = f.body;
  const H = lot.height;
  const floors = Math.max(3, lot.floors);
  const gH = 4.4;
  const fH = (H - gH - 0.5) / (floors - 1);
  const white = col('#f6f1e4');
  const accent = col('#7fc4b8');
  const s = g.shell,
    t = g.trim;
  const look = (style: number, color = white, profile: number = PROF.HOTEL): WallLook => ({ color, pattern: WALLPAT.PLASTER, frame: FRAME.WHITE, glass: GLASS.LIGHT, style, profile, seed: g.seed });
  const towerW = 4.6;
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    const parts = partitionSide(g, sd, sg.L, f.ins[PREV[sd]]);
    const doors = doorsOn(g, f, sd, sg.L);
    for (const p of parts) {
      if (p.covered) {
        wallPlain(s, sg, p.a, p.b, 0, H, { color: white, pattern: WALLPAT.PLASTER, seed: g.seed });
        continue;
      }
      const ops = doors.filter((u) => u >= p.a && u <= p.b).map((u) => ({ u, w: 2.4, h: 3.1 }));
      bandWithOpenings(sg, p.a, p.b, ops, (a, b) => {
        const n = Math.max(1, Math.round((b - a) / 3.2));
        const gr = makeGrid(a, b, 0, gH, 1, { spacing: (b - a) / n, cols: n, winW: 1.8, winH: 2.7, sill: 0.7, margin: 0.4 });
        wallGrid(s, sg, a, b, 0, gH, gr, look(WIN.ARCHED, accent, PROF.SHOP));
      }, (a, b, y0) => wallPlain(s, sg, a, b, y0, gH, { color: accent, pattern: WALLPAT.PLASTER, seed: g.seed }));
      for (const u of doors.filter((d) => d >= p.a && d <= p.b)) {
        doorNiche(g, sg, u, { w: 2.4, h: 3.1, depth: 0.35, wallColor: accent, frameColor: col('#f6f1e4'), doorColor: col('#2a6f74'), glass: true, profile: PROF.ALWAYS, seed: g.seed + 2, frameOut: 0.2 });
        setCol(t, col('#2a6f74'));
        sideBox(t, sg, u - 2.0, u + 2.0, 0, 1.2, 3.5, 3.75, true);
        for (const lu of [u - 1.2, u, u + 1.2]) lightBox(g, sx(sg, lu, 0.8) - 0.1, 3.42, sz(sg, lu, 0.8) - 0.1, sx(sg, lu, 0.8) + 0.1, 3.5, sz(sg, lu, 0.8) + 0.1, '#fff1d6', LIGHT_MODE.STEADY, 3.5);
      }
      const n = Math.max(1, Math.round((p.b - p.a - 1.0) / 2.9));
      const gr = makeGrid(p.a, p.b, gH, fH, floors - 1, { spacing: 2.9, cols: n, winW: 1.25, winH: fH * 0.66, sill: 0.25, margin: sd === FRONT ? towerW : 0.8 });
      wallGrid(s, sg, p.a, p.b, gH, H, gr, look(WIN.MUNTIN));
      setCol(t, col('#ffffff'));
      sideBox(t, sg, p.a, p.b, 0, 0.18, gH - 0.15, gH + 0.1, true);
      sideBox(t, sg, p.a, p.b, 0, 0.4, H - 0.3, H, true);
      // sea-view balconies on the front
      if (sd === FRONT) {
        for (let j = 0; j < gr.m; j++) {
          for (let i = 0; i < gr.n; i++) {
            const u = gridU(gr, i);
            const yb = gr.v0 + j * gr.ch + 0.1;
            setCol(t, white);
            sideBox(t, sg, u - 1.1, u + 1.1, 0, 0.9, yb - 0.14, yb, true);
            railing(t, sx(sg, u - 1.08, 0.86), sz(sg, u - 1.08, 0.86), sx(sg, u + 1.08, 0.86), sz(sg, u + 1.08, 0.86), yb, 0.95, col('#ffffff'), 0.16, 2);
            anchors.balcony(sx(sg, u, 0.45), yb, sz(sg, u, 0.45), sg.nx, sg.nz, 2.2, 0.9, 0.95);
            // seafront hotel: mostly clean balconies with sparse personal touches
            if (rng.chance(0.4)) balconyLife(g, sg, u - 1.04, u + 1.04, yb, { rail: 0.95, depth: 0.82, green: 0.7, hotel: true });
            if (rng.chance(0.14)) {
              // pale canvas parasols (a few personal touches, no confetti from the beach)
              setCol(t, col(rng.pick(['#f1efe9', '#ece4d4', '#e2e6e4', '#cfdbe0'])));
              const px = sx(sg, u + 0.6, 0.5), pz = sz(sg, u + 0.6, 0.5);
              t.cone(px, pz, 0.6, yb + 1.6, yb + 1.9, 8);
              setCol(t, col('#dddddd'));
              t.cylinder(px, pz, 0.02, yb, yb + 1.62, 4, false);
            }
          }
        }
      }
    }
  }
  // corner turrets on the front with copper pyramid roofs + flags
  const sgF = sideGeom(body, FRONT);
  for (const end of [0, 1]) {
    const tr: LRect = end === 0 ? { x0: body.x0, x1: body.x0 + towerW, z0: body.z1 - towerW, z1: body.z1 + 0.25 } : { x0: body.x1 - towerW, x1: body.x1, z0: body.z1 - towerW, z1: body.z1 + 0.25 };
    const yT = H + fH * 1.2;
    for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
      const sg = sideGeom(tr, sd);
      if (sd === FRONT) {
        const gr = makeGrid(0, sg.L, gH, fH, floors, { spacing: sg.L, cols: 1, winW: 1.4, winH: fH * 0.62, sill: 0.4, margin: 0.4 });
        wallGrid(s, sg, 0, sg.L, gH, yT, gr, look(WIN.ARCHED));
      } else if ((sd === LEFT && end === 0) || (sd === RIGHT && end === 1)) {
        // flush with the side wall: skip below the eave (side wall already there)
        wallPlain(s, sg, 0, sg.L, H, yT, { color: white, pattern: WALLPAT.PLASTER, seed: g.seed });
      } else {
        const gr = makeGrid(0, sg.L, H, yT - H, 1, { spacing: sg.L, cols: 1, winW: 1.2, winH: (yT - H) * 0.55, sill: 0.4, margin: 0.4 });
        wallGrid(s, sg, 0, sg.L, gH, yT, sd === BACK ? gr : { ...gr, n: 0 }, look(WIN.ARCHED));
      }
    }
    setCol(t, col('#ffffff'));
    t.box(tr.x0 - 0.2, yT - 0.25, tr.z0 - 0.2, tr.x1 + 0.2, yT + 0.05, tr.z1 + 0.2);
    t.hrect(tr.x0, body.z1, tr.x1, tr.z1, gH, false);
    t.box(tr.x0, gH - 0.2, body.z1, tr.x1, gH, tr.z1 + 0.06, 0b010111);
    roofLook(s, col('#6fa596'), ROOFPAT.COPPER, g.seed + end);
    const cx = (tr.x0 + tr.x1) / 2,
      cz = (tr.z0 + tr.z1) / 2;
    const ap = yT + 3.6;
    const corners = [[tr.x0 - 0.15, tr.z1 + 0.15], [tr.x1 + 0.15, tr.z1 + 0.15], [tr.x1 + 0.15, tr.z0 - 0.15], [tr.x0 - 0.15, tr.z0 - 0.15]];
    for (let k = 0; k < 4; k++) {
      const a = corners[k],
        b = corners[(k + 1) % 4];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const L = Math.hypot(ex, ez);
      const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
      const sl = Math.hypot(Math.hypot(mx, mz), ap - yT);
      roofPoly(s, [[a[0], yT + 0.05, a[1]], [b[0], yT + 0.05, b[1]], [cx, ap, cz]], [ex / L, 0, ez / L], [-mx / sl, (ap - yT) / sl, -mz / sl]);
    }
    setCol(t, col('#d8d8d8'));
    t.cylinder(cx, cz, 0.04, ap - 0.2, ap + 2.6, 4, false);
    setCol(t, col(end ? '#2f6fd0' : '#d94a3d'));
    t.box(cx + 0.04, ap + 1.7, cz - 0.02, cx + 1.1, ap + 2.45, cz + 0.02, 0b111111);
  }
  // hip roof with dormers
  const roofC = col('#b5583e');
  hipRoof(g, body, H, H + Math.min(5.5, (body.z1 - body.z0) * 0.42), 0.45, roofC, ROOFPAT.TILES, col('#ffffff'));
  // neon roof letters facing the sea (front)
  const r = g.atlas.add('seaview', 640, 96, letterSign('SEAVIEW HOTEL', '#ffffff', '#8ff3ff', '"Trebuchet MS", "Segoe UI", sans-serif', 1, '#2a6f74'));
  const wS = Math.min(sgF.L - 2 * towerW - 1.5, 17);
  const yS = H + 0.6;
  setCol(t, col('#3a3f44'));
  for (let k = 0; k <= 4; k++) {
    const u = sgF.L / 2 - wS / 2 + (wS * k) / 4;
    sideBox(t, sgF, u - 0.05, u + 0.05, -0.4, -0.3, H, yS + 2.4);
  }
  signOnSide(g, sgF, sgF.L / 2 - wS / 2, sgF.L / 2 + wS / 2, -0.22, yS, yS + 2.6, r);
  chimney(g, body.x0 + 8, (body.z0 + body.z1) / 2, H + 1, H + 5.4, 0.8, 1.2, col('#e8e2d6'));
  chimney(g, body.x1 - 8, (body.z0 + body.z1) / 2, H + 1, H + 5.4, 0.8, 1.2, col('#e8e2d6'));
}

// ─────────────────────────────────────────────────────────── school ──

let schoolKit = true;
/** ?noschoolkit: no door pulls / kick plates / noticeboard / intercom / sign bolts on the school (A/B). */
export function setSchoolKit(on: boolean): void {
  schoolKit = on;
}

export function genSchool(g: Gen): void {
  const { lot, rng } = g;
  const f = makeBody(g, 0.3);
  const body = f.body;
  const H = lot.height;
  const floors = Math.max(1, lot.floors);
  const main = lot.name !== undefined;
  const brick = col('#b0603f');
  const band = col('#efe9dc');
  const s = g.shell,
    t = g.trim;
  const gH = H / floors;
  const look: WallLook = { color: brick, pattern: WALLPAT.BRICK, frame: FRAME.WHITE, glass: GLASS.NEUTRAL, style: WIN.INDUSTRIAL, profile: PROF.SCHOOL, seed: g.seed };
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    const parts = partitionSide(g, sd, sg.L, f.ins[PREV[sd]]);
    const doors = doorsOn(g, f, sd, sg.L);
    for (const p of parts) {
      if (p.covered) {
        wallPlain(s, sg, p.a, p.b, 0, H + 0.8, { color: brick, pattern: WALLPAT.BRICK, seed: g.seed });
        continue;
      }
      // the main entrance keeps a plain wall bay each side for the noticeboard / intercom (under the canopy)
      const wide = (u: number): boolean => schoolKit && main && sd === FRONT && u - 2.7 >= p.a && u + 2.7 <= p.b;
      const ops = doors.filter((u) => u >= p.a && u <= p.b).map((u) => ({ u, w: wide(u) ? 5.4 : 2.2, h: 2.6 }));
      bandWithOpenings(sg, p.a, p.b, ops, (a, b) => {
        const n = Math.max(1, Math.round((b - a) / 3.4));
        const gr = makeGrid(a, b, 0, gH, 1, { spacing: (b - a) / n, cols: n, winW: Math.min(2.6, (b - a) / n - 0.8), winH: gH - 1.5, sill: 0.95, margin: 0.4 });
        wallGrid(s, sg, a, b, 0, gH, gr, look);
        dressings(sg, gr);
      }, (a, b, y0) => {
        const wl = { color: brick, pattern: WALLPAT.BRICK, seed: g.seed };
        if (b - a < 3) return wallPlain(s, sg, a, b, y0, gH, wl);
        const m = (a + b) / 2;
        wallPlain(s, sg, a, m - 1.1, 0, gH, wl);
        wallPlain(s, sg, m + 1.1, b, 0, gH, wl);
        wallPlain(s, sg, m - 1.1, m + 1.1, y0, gH, wl);
      });
      if (floors > 1) {
        const n = Math.max(1, Math.round((p.b - p.a - 0.8) / 3.4));
        const gr = makeGrid(p.a, p.b, gH, gH, floors - 1, { spacing: 3.4, cols: n, winW: 2.6, winH: gH - 1.4, sill: 0.9, margin: 0.4 });
        wallGrid(s, sg, p.a, p.b, gH, H + 0.8, gr, look);
        dressings(sg, gr);
      }
      // white bands at each floor + coping
      setCol(t, band);
      for (let k = 1; k < floors; k++) sideBox(t, sg, p.a, p.b, 0, 0.2, gH * k - 0.12, gH * k + 0.12, true);
      sideBox(t, sg, p.a, p.b, 0, 0.25, H + 0.75, H + 0.92, true);
      setCol(t, col('#8f8a80'));
      const segs: [number, number][] = [];
      let cur = p.a;
      for (const o of ops.sort((x, y) => x.u - y.u)) {
        if (o.u - 1.3 > cur) segs.push([cur, o.u - 1.3]);
        cur = o.u + 1.3;
      }
      if (p.b > cur) segs.push([cur, p.b]);
      for (const [a, b] of segs) sideBox(t, sg, a, b, 0, 0.1, 0, 0.6);
      for (const u of doors.filter((d) => d >= p.a && d <= p.b)) {
        doorNiche(g, sg, u, { w: 2.2, h: 2.6, depth: 0.35, wallColor: brick, frameColor: band, doorColor: col('#2f5d50'), glass: true, profile: PROF.SCHOOL, seed: g.seed + 1, frameOut: 0.2 });
        // canopy
        setCol(t, band);
        sideBox(t, sg, u - 2.2, u + 2.2, 0, 1.45, 3.0, 3.3, true);
        lightBox(g, sx(sg, u, 1.0) - 0.15, 2.92, sz(sg, u, 1.0) - 0.15, sx(sg, u, 1.0) + 0.15, 3.0, sz(sg, u, 1.0) + 0.15, '#fff1d6', LIGHT_MODE.STEADY, 3);
        if (schoolKit) entranceKit(sg, u, wide(u));
        if (sd === FRONT && main) {
          // carved name panel: a dressed-stone tablet with a moulded border, letters cut dark into it
          const r = g.atlas.add('school-carved', 512, 64, letterSign('WESTBROOK SCHOOL', '#5b4a3a', '#000000', 'Georgia, "Times New Roman", serif', 0, '#e9e1d0'));
          setCol(t, shade(band, 0.86));
          sideBox(t, sg, u - 4.45, u + 4.45, 0, 0.06, 3.38, 4.32, true);
          setCol(t, band);
          sideBox(t, sg, u - 4.3, u + 4.3, 0.06, 0.09, 3.48, 4.22, true);
          signOnSide(g, sg, u - 4.0, u + 4.0, 0.093, 3.55, 4.15, r);
        }
      }
    }
  }
  const inner: LRect = { x0: body.x0 + 0.3, x1: body.x1 - 0.3, z0: body.z0 + 0.3, z1: body.z1 - 0.3 };
  flatRoof(s, inner, H + 0.02, col('#8d8a84'), ROOFPAT.FLAT, g.seed);
  innerParapet(g, inner, H, H + 0.8, shade(brick, 0.9));

  /**
   * Entrance hardware at a double glazed door at u (niche depth 0.35): stainless D-pull bars on both leaves at
   * the meeting stiles, kick plates, a rubber seal line; on the main entrance (`bays`) a glazed noticeboard with
   * pinned papers on the left bay and an intercom + visitors plaque on the right one.
   */
  function entranceKit(sg: SideGeom, u: number, bays: boolean): void {
    const d = 0.35;
    const steel = col('#b8bdc0');
    setCol(t, col('#2a2c2e'));
    sideBox(t, sg, u - 0.012, u + 0.012, -d, -d + 0.014, 0.14, 2.56);
    for (const sgn of [-1, 1]) {
      const hu = u + sgn * 0.16;
      setCol(t, steel);
      sideBox(t, sg, hu - 0.016, hu + 0.016, -d + 0.05, -d + 0.075, 0.82, 1.68);
      for (const y of [0.88, 1.62]) sideBox(t, sg, hu - 0.012, hu + 0.012, -d, -d + 0.05, y - 0.012, y + 0.012);
      setCol(t, shade(steel, 0.92));
      sideBox(t, sg, sgn < 0 ? u - 1.08 : u + 0.03, sgn < 0 ? u - 0.03 : u + 1.08, -d, -d + 0.006, 0.15, 0.44);
    }
    // the cantilevered canopy gets steel knee braces back to the wall, with wall plates
    for (const bu of [u - 2.0, u + 2.0]) {
      setCol(t, col('#5d6266'));
      t.beam(sx(sg, bu, 1.15), 3.0, sz(sg, bu, 1.15), sx(sg, bu, 0.03), 2.35, sz(sg, bu, 0.03), 0.05, 0.05);
      sideBox(t, sg, bu - 0.06, bu + 0.06, 0, 0.02, 2.26, 2.5, true);
    }
    if (!bays) return;
    // noticeboard: green aluminium case, papers recessed 4 cm behind the lip, a pale glazing edge, header plaque
    const a = u - 2.6,
      b = u - 1.45,
      y0 = 1.05,
      y1 = 2.0;
    const frame = col('#2f5d50');
    setCol(t, shade(frame, 0.8));
    sideBox(t, sg, a, b, 0, 0.02, y0, y1);
    setCol(t, frame);
    sideBox(t, sg, a, a + 0.05, 0.02, 0.075, y0, y1, true);
    sideBox(t, sg, b - 0.05, b, 0.02, 0.075, y0, y1, true);
    sideBox(t, sg, a + 0.05, b - 0.05, 0.02, 0.075, y0, y0 + 0.05, true);
    sideBox(t, sg, a + 0.05, b - 0.05, 0.02, 0.075, y1 - 0.05, y1, true);
    setCol(t, col('#dfe8ea'));
    sideBox(t, sg, a + 0.05, b - 0.05, 0.068, 0.072, y1 - 0.065, y1 - 0.05);
    sideBox(t, sg, b - 0.065, b - 0.05, 0.068, 0.072, y0 + 0.05, y1 - 0.05);
    setCol(t, col('#c8ccce'));
    sideBox(t, sg, b - 0.035, b - 0.015, 0.075, 0.085, (y0 + y1) / 2 - 0.03, (y0 + y1) / 2 + 0.03); // lock
    const nr = g.atlas.add(`school-notices:${g.seed % 7}`, 128, 96, noticeBoard(g.seed));
    signOnSide(g, sg, a + 0.05, b - 0.05, 0.022, y0 + 0.05, y1 - 0.05, nr);
    const hr = g.atlas.add('school-noticehead', 192, 40, boardSign('NOTICES', { bg: '#2f5d50', fg: '#f4f1ea', glow: 0 }));
    signOnSide(g, sg, a + 0.2, b - 0.2, 0.012, y1 + 0.05, y1 + 0.2, hr);
    // intercom: stainless panel with a speaker grille, call button and camera eye
    const iu = u + 1.5;
    setCol(t, steel);
    sideBox(t, sg, iu - 0.08, iu + 0.08, 0, 0.03, 1.22, 1.52, true);
    setCol(t, col('#2b2d2f'));
    for (let k = 0; k < 4; k++) sideBox(t, sg, iu - 0.05, iu + 0.05, 0.03, 0.034, 1.4 + k * 0.022, 1.41 + k * 0.022);
    sideBox(t, sg, iu - 0.012, iu + 0.012, 0.03, 0.036, 1.47, 1.494);
    setCol(t, col('#4f86c6'));
    sideBox(t, sg, iu - 0.03, iu + 0.03, 0.03, 0.04, 1.28, 1.34);
    // visitors plaque: two lines on a steel-edged board (one line was unreadable at 3 m)
    const v1 = g.atlas.add('school-visitors1', 256, 64, boardSign('ALL VISITORS', { bg: '#2f5d50', fg: '#f4f1ea', glow: 0, font: 'Arial, sans-serif' }));
    const v2 = g.atlas.add('school-visitors2', 320, 64, boardSign('PLEASE REPORT TO RECEPTION', { bg: '#f4f1ea', fg: '#2f5d50', glow: 0, font: 'Arial, sans-serif' }));
    setCol(t, col('#c8ccce'));
    sideBox(t, sg, u + 1.74, u + 2.6, 0, 0.012, 1.28, 1.74, true);
    signOnSide(g, sg, u + 1.76, u + 2.58, 0.014, 1.53, 1.72, v1);
    signOnSide(g, sg, u + 1.76, u + 2.58, 0.014, 1.3, 1.5, v2);
  }

  /** Stone lintels (with a soldier-course look: a dark joint line under them) and keyed corners per window. */
  function dressings(sg: SideGeom, gr: Grid): void {
    const ww = gr.wx1 - gr.wx0;
    for (let j = 0; j < gr.m; j++) {
      const yt = gridY1(gr, j);
      for (let i = 0; i < gr.n; i++) {
        const u = gridU(gr, i);
        setCol(t, shade(band, 0.97 - ((g.seed + i * 3 + j * 7) % 4) * 0.02));
        sideBox(t, sg, u - ww / 2 - 0.18, u + ww / 2 + 0.18, 0, 0.035, yt + 0.02, yt + 0.27, true);
        setCol(t, shade(band, 0.7));
        sideBox(t, sg, u - ww / 2 - 0.18, u + ww / 2 + 0.18, 0, 0.012, yt, yt + 0.02, true);
      }
    }
  }
  if (main) {
    // clock over the entrance gable + cupola with a bell + flagpole
    const sgF = sideGeom(body, FRONT);
    const door = doorsOn(g, f, FRONT, sgF.L)[0] ?? sgF.L / 2;
    const ck = g.atlas.add('clock', 96, 96, clockFace());
    setCol(t, band);
    sideBox(t, sgF, door - 1.0, door + 1.0, 0, 0.12, H - 2.4, H - 0.4, true);
    signOnSide(g, sgF, door - 0.85, door + 0.85, 0.15, H - 2.25, H - 0.55, ck);
    const cx = (body.x0 + body.x1) / 2,
      cz = (body.z0 + body.z1) / 2;
    setCol(t, col('#f4f1ea'));
    t.box(cx - 1.4, H, cz - 1.4, cx + 1.4, H + 1.2, cz + 1.4);
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) t.box(cx + dx - 0.12, H + 1.2, cz + dz - 0.12, cx + dx + 0.12, H + 3.0, cz + dz + 0.12);
    setCol(t, col('#c9a24a'));
    t.cylinder(cx, cz, 0.42, H + 1.9, H + 2.6, 8, true, 0.25);
    roofLook(s, col('#6fa596'), ROOFPAT.COPPER, g.seed);
    const ap = H + 4.6;
    const cs = [[cx - 1.6, cz + 1.6], [cx + 1.6, cz + 1.6], [cx + 1.6, cz - 1.6], [cx - 1.6, cz - 1.6]];
    for (let k = 0; k < 4; k++) {
      const a = cs[k],
        b = cs[(k + 1) % 4];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const L = Math.hypot(ex, ez);
      roofPoly(s, [[a[0], H + 3.0, a[1]], [b[0], H + 3.0, b[1]], [cx, ap, cz]], [ex / L, 0, ez / L], [0, 1, 0]);
    }
    setCol(t, col('#d8d8d8'));
    t.cylinder(cx, cz, 0.04, ap, ap + 1.4, 4, false);
    // flagpole on the roof corner
    setCol(t, col('#e8e8e8'));
    t.cylinder(body.x1 - 1.2, body.z1 - 1.2, 0.06, H, H + 7, 6, false, 0.04);
    setCol(t, col('#2f6fd0'));
    t.box(body.x1 - 1.16, H + 5.8, body.z1 - 1.22, body.x1 + 0.3, H + 6.8, body.z1 - 1.18, 0b111111);
  } else {
    const sgF = sideGeom(body, FRONT);
    const r = g.atlas.add('gym', 192, 64, boardSign('GYM', { bg: '#efe9dc', fg: '#2f5d50', glow: 0.3 }));
    signOnSide(g, sgF, sgF.L / 2 - 1.3, sgF.L / 2 + 1.3, 0.14, H - 1.5, H - 0.6, r);
    if (schoolKit) {
      // the board is bolted through spacers: a dark backing edge and four bolt heads
      setCol(t, col('#3b3f42'));
      sideBox(t, sgF, sgF.L / 2 - 1.32, sgF.L / 2 + 1.32, 0.1, 0.135, H - 1.52, H - 0.58);
      setCol(t, col('#c4c8ca'));
      for (const du of [-1.18, 1.18]) for (const y of [H - 1.4, H - 0.7]) sideBox(t, sgF, sgF.L / 2 + du - 0.02, sgF.L / 2 + du + 0.02, 0.14, 0.152, y - 0.02, y + 0.02);
    }
  }
  void rng;
}

// ───────────────────────────────────────────────────── harbour master ──

export function genHarbormaster(g: Gen): void {
  const { lot } = g;
  const f = makeBody(g, 0.25);
  const body = f.body;
  const H = lot.height;
  const gH = 3.6;
  const fH = H - gH;
  const white = col('#f4f1ea');
  const navy = col('#263a5c');
  const s = g.shell,
    t = g.trim;
  const look: WallLook = { color: white, pattern: WALLPAT.SIDING, frame: FRAME.WHITE, glass: GLASS.LIGHT, style: WIN.MUNTIN, profile: PROF.OFFICE, seed: g.seed };
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    const doors = doorsOn(g, f, sd, sg.L);
    const ops = doors.map((u) => ({ u, w: 1.3, h: 2.4 }));
    bandWithOpenings(sg, 0, sg.L, ops, (a, b) => {
      if (b - a < 1.6) return wallPlain(s, sg, a, b, 0, gH, look);
      const n = Math.max(1, Math.round((b - a) / 2.6));
      const gr = makeGrid(a, b, 0, gH, 1, { spacing: (b - a) / n, cols: n, winW: 1.2, winH: 1.6, sill: 0.9, margin: 0.35 });
      wallGrid(s, sg, a, b, 0, gH, gr, look);
    }, (a, b, y0) => wallPlain(s, sg, a, b, y0, gH, look));
    const gr = makeGrid(0, sg.L, gH, fH, 1, { spacing: 2.6, cols: 3, winW: 1.15, winH: 1.5, sill: 0.8, margin: 0.8 });
    wallGrid(s, sg, 0, sg.L, gH, H, gr, look);
    setCol(t, navy);
    for (const [a, b] of around(0, sg.L, ops)) sideBox(t, sg, a, b, 0, 0.12, 0, 0.5);
    sideBox(t, sg, 0, sg.L, 0, 0.14, gH - 0.08, gH + 0.1, true);
    sideBox(t, sg, 0, 0.18, 0, 0.12, 0, H);
    sideBox(t, sg, sg.L - 0.18, sg.L, 0, 0.12, 0, H);
    for (const u of doors) {
      doorNiche(g, sg, u, { w: 1.3, h: 2.4, depth: 0.25, wallColor: white, frameColor: navy, doorColor: navy, glass: false, transom: true, lamp: true, seed: g.seed, frameOut: 0.12 });
      const r = g.atlas.add('harbourmaster', 384, 64, boardSign('HARBOUR MASTER', { bg: '#263a5c', fg: '#f4f1ea', glow: 0.6, border: '#c9a24a' }));
      setCol(t, navy);
      sideBox(t, sg, u - 2.3, u + 2.3, 0, 0.12, gH + 0.15, gH + 0.95, true);
      signOnSide(g, sg, u - 2.2, u + 2.2, 0.15, gH + 0.2, gH + 0.9, r);
    }
    if (sd === FRONT) {
      // clock between the upper windows
      const ck = g.atlas.add('clock', 96, 96, clockFace());
      signOnSide(g, sg, sg.L / 2 - 0.55, sg.L / 2 + 0.55, 0.06, H - 1.25, H - 0.15, ck);
    }
  }
  // hip roof + lookout lantern + signal mast
  const yr = H + 3.0;
  hipRoof(g, body, H, yr, 0.45, col('#4d5560'), ROOFPAT.SLATE, white);
  const cx = (body.x0 + body.x1) / 2,
    cz = (body.z0 + body.z1) / 2;
  const lr: LRect = { x0: cx - 1.3, x1: cx + 1.3, z0: cz - 1.3, z1: cz + 1.3 };
  const y0 = yr - 0.8;
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(lr, sd);
    const gr = makeGrid(0, sg.L, y0, 1.9, 1, { spacing: sg.L, cols: 1, winW: 2.1, winH: 1.3, sill: 0.45, margin: 0.1 });
    wallGrid(s, sg, 0, sg.L, y0, y0 + 1.9, gr, { ...look, profile: PROF.ALWAYS, style: WIN.PLAIN, pattern: WALLPAT.SMOOTH });
  }
  roofLook(s, col('#263a5c'), ROOFPAT.SEAM, g.seed);
  const ap = y0 + 3.0;
  const cs = [[lr.x0 - 0.2, lr.z1 + 0.2], [lr.x1 + 0.2, lr.z1 + 0.2], [lr.x1 + 0.2, lr.z0 - 0.2], [lr.x0 - 0.2, lr.z0 - 0.2]];
  for (let k = 0; k < 4; k++) {
    const a = cs[k],
      b = cs[(k + 1) % 4];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const L = Math.hypot(ex, ez);
    roofPoly(s, [[a[0], y0 + 1.9, a[1]], [b[0], y0 + 1.9, b[1]], [cx, ap, cz]], [ex / L, 0, ez / L], [0, 1, 0]);
  }
  {
    const e = 0.5;
    const pts: [number, number][] = [[lr.x0 - e, lr.z1 + e], [lr.x1 + e, lr.z1 + e], [lr.x1 + e, lr.z0 - e], [lr.x0 - e, lr.z0 - e]];
    for (let k = 0; k < 4; k++) {
      const a = pts[k], b = pts[(k + 1) % 4];
      railing(t, a[0], a[1], b[0], b[1], y0, 0.8, col('#f4f1ea'), 0.45, 1);
    }
    setCol(t, col('#4d5560'));
    t.box(lr.x0 - e, y0 - 0.12, lr.z0 - e, lr.x1 + e, y0, lr.z1 + e, 0b111111);
  }
  setCol(t, col('#e8e8e8'));
  t.cylinder(cx, cz, 0.06, ap, ap + 4.5, 6, false, 0.04);
  t.box(cx - 1.2, ap + 3.3, cz - 0.03, cx + 1.2, ap + 3.38, cz + 0.03, 0b111111);
  const flags = ['#e63946', '#f2c94c', '#2f6fd0', '#f1faee'];
  for (let k = 0; k < 4; k++) {
    setCol(t, col(flags[k]));
    const fx = cx - 1.1 + k * 0.55;
    t.box(fx - 0.2, ap + 2.75, cz - 0.02, fx + 0.2, ap + 3.25, cz + 0.02, 0b111111);
  }
  lightBox(g, cx - 0.12, ap + 4.5, cz - 0.12, cx + 0.12, ap + 4.74, cz + 0.12, '#ff3020', LIGHT_MODE.BLINK, 6, 0.3, 0.5);
}

// ──────────────────────────────────────────────────────────── kiosks ──

export function genKiosk(g: Gen): void {
  const { lot } = g;
  const ice = lot.name === 'Ice Cream' || lot.district === 'beach';
  const body: LRect = { x0: -g.W / 2 + 0.2, x1: g.W / 2 - 0.2, z0: -g.D / 2 + 0.2, z1: g.D / 2 - 0.2 };
  const H = lot.height;
  const wallC = ice ? col('#f6c6d0') : col('#2f5d50');
  const trimC = ice ? col('#a8e6cf') : col('#e6dbc2');
  const s = g.shell,
    t = g.trim;
  const look: WallLook = { color: wallC, pattern: (ice ? WALLPAT.SIDING : WALLPAT.PLASTER) + 16 * shopType(ice ? 'Ice Cream' : 'Coffee'), frame: FRAME.WHITE, glass: GLASS.NEUTRAL, style: WIN.SHOP, profile: PROF.SHOP, seed: g.seed };
  const wallTop = H - 0.5;
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    if (sd === FRONT) {
      // service window with counter
      const gr = makeGrid(0, sg.L, 0, wallTop, 1, { spacing: sg.L, cols: 1, winW: sg.L - 1.0, winH: 1.15, sill: 1.05, margin: 0 });
      wallGrid(s, sg, 0, sg.L, 0, wallTop, gr, look);
      setCol(t, trimC);
      sideBox(t, sg, 0.4, sg.L - 0.4, 0, 0.18, 0.98, 1.06, true);
      g.doorsBuilt += g.doors.filter((d) => d.side === FRONT).length;
    } else if (sd === BACK) {
      bandWithOpenings(sg, 0, sg.L, [{ u: sg.L / 2, w: 0.9, h: 2.1 }], (a, b) => wallPlain(s, sg, a, b, 0, wallTop, look), (a, b, y0) => wallPlain(s, sg, a, b, y0, wallTop, look));
      doorNiche(g, sg, sg.L / 2, { w: 0.9, h: 2.1, depth: 0.08, wallColor: wallC, frameColor: trimC, doorColor: shade(wallC, 0.8), seed: g.seed, frameOut: 0.15 });
      g.doorsBuilt--;
    } else {
      const gr = makeGrid(0, sg.L, 0, wallTop, 1, { spacing: sg.L, cols: 1, winW: Math.min(1.4, sg.L - 1.2), winH: 0.9, sill: 1.25, margin: 0.4 });
      wallGrid(s, sg, 0, sg.L, 0, wallTop, gr, look);
      if (!ice) {
        // magazine rack
        const cols = ['#e63946', '#457b9d', '#e9c46a', '#2a9d8f', '#f4a261', '#8d6cab'];
        for (let k = 0; k < 6; k++) {
          setCol(t, col(cols[k]));
          const u = 0.6 + (k % 3) * 0.55,
            y = 0.5 + Math.floor(k / 3) * 0.45;
          sideBox(t, sg, u, u + 0.42, 0, 0.06, y, y + 0.38);
        }
      }
    }
    setCol(t, trimC);
    sideBox(t, sg, 0, sg.L, 0, 0.1, 0, 0.3);
  }
  // overhanging roof + sign band
  const ro: LRect = { x0: body.x0 - 0.5, x1: body.x1 + 0.5, z0: body.z0 - 0.5, z1: body.z1 + 0.9 };
  setCol(t, trimC);
  t.box(ro.x0, wallTop, ro.z0, ro.x1, H, ro.z1, 0b111111);
  flatRoof(s, { x0: ro.x0 + 0.05, x1: ro.x1 - 0.05, z0: ro.z0 + 0.05, z1: ro.z1 - 0.05 }, H + 0.01, col('#7d8790'), ROOFPAT.FLAT, g.seed);
  const name = ice ? 'ICE CREAM' : 'NEWS · COFFEE';
  const r = g.atlas.add(`kiosk:${name}`, 384, 64, boardSign(name, ice ? { bg: '#a8e6cf', fg: '#d6336c', glow: 1, glowColor: '#ff9ccf', weight: '900', font: '"Trebuchet MS", sans-serif' } : { bg: '#e6dbc2', fg: '#2f5d50', glow: 0.8, glowColor: '#fff0c0' }));
  const sgR = sideGeom(ro, FRONT);
  signOnSide(g, sgR, 0.15, sgR.L - 0.15, 0.03, wallTop + 0.05, H - 0.05, r);
  // striped pull-out awning over the counter
  const sgF = sideGeom(body, FRONT);
  const ac = ice ? col('#ff8fab') : col('#2f5d50');
  const n = Math.max(4, Math.round(sgF.L / 0.35));
  const o0 = 0.9,
    o1 = 1.33;
  const yA = wallTop - 0.02,
    yB = Math.max(2.45, wallTop - 0.5);
  for (let k = 0; k < n; k++) {
    const a = 0.2 + ((sgF.L - 0.4) * k) / n,
      b = 0.2 + ((sgF.L - 0.4) * (k + 1)) / n;
    setCol(t, k % 2 ? col('#f4f1ea') : ac);
    const mx = sx(sgF, (a + b) / 2, (o0 + o1) / 2),
      mz = sz(sgF, (a + b) / 2, (o0 + o1) / 2);
    t.quadAway(sx(sgF, a, o1), yB, sz(sgF, a, o1), sx(sgF, b, o1), yB, sz(sgF, b, o1), sx(sgF, b, o0), yA, sz(sgF, b, o0), sx(sgF, a, o0), yA, sz(sgF, a, o0), mx - sgF.nx * 0.6, yA - 2, mz - sgF.nz * 0.6);
    setCol(t, k % 2 ? col('#cfccc4') : shade(ac, 0.7));
    t.quadAway(sx(sgF, a, o1), yB - 0.004, sz(sgF, a, o1), sx(sgF, b, o1), yB - 0.004, sz(sgF, b, o1), sx(sgF, b, o0), yA - 0.004, sz(sgF, b, o0), sx(sgF, a, o0), yA - 0.004, sz(sgF, a, o0), mx + sgF.nx * 0.6, yA + 2, mz + sgF.nz * 0.6);
    setCol(t, k % 2 ? col('#f4f1ea') : ac);
    const v = 0.14 + (k % 2) * 0.03;
    t.quadAway(sx(sgF, a, o1), yB - v, sz(sgF, a, o1), sx(sgF, b, o1), yB - v, sz(sgF, b, o1), sx(sgF, b, o1), yB, sz(sgF, b, o1), sx(sgF, a, o1), yB, sz(sgF, a, o1), mx - sgF.nx * 2, yB, mz - sgF.nz * 2);
  }
  if (ice) {
    // giant cone on the roof
    const cx = (body.x0 + body.x1) / 2,
      cz = (body.z0 + body.z1) / 2;
    const y = H + 0.05;
    setCol(t, col('#d9a35b'));
    t.cylinder(cx, cz, 0.06, y, y + 0.25, 6, false);
    t.cone(cx, cz, 0.62, y + 1.75, y + 0.25, 10);
    setCol(t, col('#c48a45'));
    t.cylinder(cx, cz, 0.66, y + 1.7, y + 1.85, 10, true);
    const scoops: [string, number, number, number][] = [['#ff9ccf', -0.22, 2.2, 0.55], ['#a8e6cf', 0.25, 2.25, 0.52], ['#fff1c9', 0.0, 2.75, 0.5]];
    for (const [c, dx, dy, r2] of scoops) {
      setCol(t, col(c));
      t.sphere(cx + dx, y + dy, cz, r2, 10, 7);
    }
    setCol(t, col('#d61f3c'));
    t.sphere(cx, y + 3.3, cz, 0.15, 6, 4);
    // neon ring around the cone rim
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
      const l = g.lights;
      setCol(l, col('#ff7ac8'));
      l.L[0] = LIGHT_MODE.NEON;
      l.L[1] = 0.37;
      l.L[2] = 1.3;
      l.L[3] = 4;
      l.beam(cx + Math.cos(a0) * 0.72, y + 1.8, cz + Math.sin(a0) * 0.72, cx + Math.cos(a1) * 0.72, y + 1.8, cz + Math.sin(a1) * 0.72, 0.06, 0.06);
    }
  } else {
    // clock + little lamp on the station kiosk roof
    lightBox(g, -0.15, H + 0.01, -0.15, 0.15, H + 0.3, 0.15, '#ffd59a', LIGHT_MODE.STEADY, 3);
  }
}

// ───────────────────────────────────────────────────────── boathouse ──

export function genBoathouse(g: Gen): void {
  const { lot } = g;
  const f = makeBody(g, 0.2);
  const body = f.body;
  const eave = 3.7;
  const wood = col('#8a3b2e');
  const white = col('#f4f1ea');
  const s = g.shell,
    t = g.trim;
  const plain = { color: wood, pattern: WALLPAT.SIDING, seed: g.seed };
  const look: WallLook = { color: wood, pattern: WALLPAT.SIDING, frame: FRAME.WHITE, glass: GLASS.NEUTRAL, style: WIN.MUNTIN, profile: PROF.HOME, seed: g.seed };
  const half = (body.x1 - body.x0) / 2;
  const yr = Math.max(lot.height, eave + 2.2) + 0.6;
  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    if (sd === FRONT) {
      const doors = doorsOn(g, f, FRONT, sg.L);
      const du = doors[0] ?? sg.L / 2;
      const bw = 3.6,
        bh = 3.0;
      const boatA = Math.max(bw / 2 + 0.4, du - 1.0 - 0.4 - bw / 2),
        boatB = Math.min(sg.L - bw / 2 - 0.4, du + 1.0 + 0.4 + bw / 2);
      const ops = [{ u: du, w: 1.1, h: 2.2 }, { u: boatA, w: bw, h: bh }, { u: boatB, w: bw, h: bh }];
      bandWithOpenings(sg, 0, sg.L, ops, (a, b) => wallPlain(s, sg, a, b, 0, eave, plain), (a, b, y0) => wallPlain(s, sg, a, b, y0, eave, plain));
      doorNiche(g, sg, du, { w: 1.1, h: 2.2, depth: 0.15, wallColor: wood, frameColor: white, doorColor: col('#2f5d50'), lamp: true, seed: g.seed, frameOut: 0.15 });
      for (const [k, u] of [boatA, boatB].entries()) boatDoor(sg, u, bw, bh, k === 1);
      // gable: name board low, attic windows above, crossed oars under the apex
      const rise = yr - eave;
      const halfAt = (y: number) => ((yr - y) / rise) * (sg.L / 2);
      const gr = makeGrid(sg.L / 2 - 1.3, sg.L / 2 + 1.3, eave + 1.35, 1.0, 1, { spacing: 1.3, cols: 2, winW: 0.7, winH: 0.75, sill: 0.12, margin: 0 });
      wallTri(s, sg, 0, sg.L, sg.L / 2, eave, yr, plain, gr, WIN.MUNTIN, PROF.HOME, FRAME.WHITE, GLASS.NEUTRAL);
      const r = g.atlas.add('rowing', 384, 64, boardSign('ROWING CLUB', { bg: '#f4f1ea', fg: '#8a3b2e', glow: 0.5, border: '#2f5d50' }));
      setCol(t, white);
      sideBox(t, sg, sg.L / 2 - 2.6, sg.L / 2 + 2.6, 0, 0.12, eave - 0.05, eave + 0.22, true);
      const bw2 = Math.min(2.3, halfAt(eave + 1.2) - 0.3);
      sideBox(t, sg, sg.L / 2 - bw2 - 0.1, sg.L / 2 + bw2 + 0.1, 0, 0.12, eave + 0.32, eave + 1.18, true);
      signOnSide(g, sg, sg.L / 2 - bw2, sg.L / 2 + bw2, 0.15, eave + 0.4, eave + 1.1, r);
      // crossed oars
      const oy = eave + rise * 0.72;
      const ow = Math.min(1.1, halfAt(oy + 0.45) - 0.25);
      if (ow > 0.4) {
        setCol(t, col('#d9b45a'));
        const c0 = [sx(sg, sg.L / 2 - ow, 0.2), sz(sg, sg.L / 2 - ow, 0.2)], c1 = [sx(sg, sg.L / 2 + ow, 0.2), sz(sg, sg.L / 2 + ow, 0.2)];
        t.beam(c0[0], oy - 0.4, c0[1], c1[0], oy + 0.4, c1[1], 0.07, 0.07);
        t.beam(c1[0], oy - 0.4, c1[1], c0[0], oy + 0.4, c0[1], 0.07, 0.07);
        setCol(t, col('#2f6fd0'));
        sideBox(t, sg, sg.L / 2 + ow - 0.32, sg.L / 2 + ow + 0.02, 0.18, 0.26, oy + 0.22, oy + 0.55);
        sideBox(t, sg, sg.L / 2 - ow - 0.02, sg.L / 2 - ow + 0.32, 0.18, 0.26, oy + 0.22, oy + 0.55);
      }
    } else if (sd === BACK) {
      const gr = makeGrid(0, sg.L, 0, eave, 1, { spacing: 3, winW: 1.0, winH: 1.1, sill: 1.2, margin: 1.0 });
      wallGrid(s, sg, 0, sg.L, 0, eave, gr, look);
      wallTri(s, sg, 0, sg.L, sg.L / 2, eave, yr, plain);
    } else {
      const gr = makeGrid(0, sg.L, 0, eave, 1, { spacing: 2.6, winW: 0.9, winH: 1.0, sill: 1.4, margin: 0.8 });
      wallGrid(s, sg, 0, sg.L, 0, eave, gr, look);
    }
    setCol(t, white);
    sideBox(t, sg, 0, 0.14, 0, 0.12, 0, eave);
    sideBox(t, sg, sg.L - 0.14, sg.L, 0, 0.12, 0, eave);
  }
  gableRoof(g, body, false, eave, yr, 0.45, 0.4, col('#3f454d'), ROOFPAT.SEAM, white);
  // flag on the gable
  const sgF = sideGeom(body, FRONT);
  setCol(t, col('#e8e8e8'));
  const fx = sx(sgF, sgF.L / 2, -0.4), fz = sz(sgF, sgF.L / 2, -0.4);
  t.cylinder(fx, fz, 0.05, yr, yr + 3.0, 5, false);
  setCol(t, col('#2f6fd0'));
  t.box(fx + 0.04, yr + 2.1, fz - 0.02, fx + 1.2, yr + 2.85, fz + 0.02, 0b111111);
  void half;

  function boatDoor(sg: SideGeom, u: number, w: number, h: number, open: boolean): void {
    const d = 0.18;
    const a = u - w / 2,
      b = u + w / 2;
    setCol(t, shade(wood, 0.7));
    const ax = sx(sg, a, 0), az = sz(sg, a, 0), axi = sx(sg, a, -d), azi = sz(sg, a, -d);
    const bx = sx(sg, b, 0), bz = sz(sg, b, 0), bxi = sx(sg, b, -d), bzi = sz(sg, b, -d);
    t.quad(ax, 0, az, axi, 0, azi, axi, h, azi, ax, h, az);
    t.quad(bxi, 0, bzi, bx, 0, bz, bx, h, bz, bxi, h, bzi);
    t.quad(axi, h, azi, bxi, h, bzi, bx, h, bz, ax, h, az);
    if (open) {
      // dark interior with a rowing boat on a rack
      setCol(t, col('#1d1a17'));
      sideBox(t, sg, a, b, -3.0, -2.98, 0, h, false, true);
      setCol(t, col('#241f1b'));
      t.quad(axi, 0.01, azi, bxi, 0.01, bzi, sx(sg, b, -3.0), 0.01, sz(sg, b, -3.0), sx(sg, a, -3.0), 0.01, sz(sg, a, -3.0));
      const a3x = sx(sg, a, -3.0), a3z = sz(sg, a, -3.0), b3x = sx(sg, b, -3.0), b3z = sz(sg, b, -3.0);
      setCol(t, col('#2b2520'));
      t.quad(axi, 0, azi, a3x, 0, a3z, a3x, h, a3z, axi, h, azi);
      t.quad(b3x, 0, b3z, bxi, 0, bzi, bxi, h, bzi, b3x, h, b3z);
      t.quad(a3x, h, a3z, b3x, h, b3z, bxi, h, bzi, axi, h, azi);
      setCol(t, col('#e8e2d6'));
      sideBox(t, sg, a + 0.3, b - 0.3, -2.6, -0.6, 0.9, 1.15);
      setCol(t, col('#2f5d50'));
      sideBox(t, sg, a + 0.4, b - 0.4, -2.5, -0.7, 1.15, 1.3);
      // open leaves folded against the wall
      setCol(t, wood);
      sideBox(t, sg, a - 0.12, a, 0, 0.12, 0, h);
      sideBox(t, sg, b, b + 0.12, 0, 0.12, 0, h);
    } else {
      setCol(t, shade(wood, 1.1));
      sideBox(t, sg, a, b, -d, -d + 0.03, 0, h, false, true);
      setCol(t, white);
      sideBox(t, sg, u - 0.04, u + 0.04, -d + 0.03, -d + 0.06, 0, h);
      // diagonal braces (Z-pattern)
      t.beam(sx(sg, a + 0.2, -d + 0.07), 0.3, sz(sg, a + 0.2, -d + 0.07), sx(sg, u - 0.15, -d + 0.07), h - 0.3, sz(sg, u - 0.15, -d + 0.07), 0.12, 0.05);
      t.beam(sx(sg, b - 0.2, -d + 0.07), 0.3, sz(sg, b - 0.2, -d + 0.07), sx(sg, u + 0.15, -d + 0.07), h - 0.3, sz(sg, u + 0.15, -d + 0.07), 0.12, 0.05);
    }
    setCol(t, white);
    sideBox(t, sg, a - 0.14, b + 0.14, 0, 0.12, h, h + 0.14, true);
  }
}

void wallSeg;
void wallLamp;
void chimney;
