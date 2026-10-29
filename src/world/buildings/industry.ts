// Industrial buildings: Haven Brickworks (sawtooth roof with north-light
// glazing), warehouses (brick or corrugated metal; sawtooth / barrel / gable
// roofs), the transit depot, and the harbour's red-brick Old Customs Warehouse
// with arched windows, hoist beams and a painted name. Roll-up doors with
// loading-dock canopies and bumpers, personnel doors, pilasters, clerestory
// windows, rooftop vents and signage.

import * as THREE from 'three';
import {
  Gen, LRect, Side, FRONT, RIGHT, BACK, LEFT, Grid, WallLook, SideGeom,
  sideGeom, sideBox, sx, sz, makeGrid, wallGrid, wallPlain, wallSeg, wallTri, setWallAttrs,
  roofLook, roofPoly, flatRoof, doorNiche, bandWithOpenings, signOnSide,
  col, shade, setCol, lightBox, wallLamp,
} from './gen';
import { anchors } from './anchors';
import { WIN, PROF, WALLPAT, ROOFPAT, FRAME, GLASS, LIGHT_MODE } from './materials';
import { letterSign, boardSign } from './signs';
import { PALETTE } from '../../core/gfx';
import { partitionSide } from './oldtown';

const METAL_WALLS = ['#9aa6ad', '#7f98a3', '#b9c3c9', '#6f8f86', '#c9c1a6', '#8d9aa5'];
const PREV: Side[] = [LEFT, FRONT, RIGHT, BACK];

export function genIndustrial(g: Gen): void {
  const { lot, rng, W, D } = g;
  const customs = lot.name === 'Old Customs Warehouse';
  const brickworks = lot.name === 'Haven Brickworks';
  const depot = lot.kind === 'depot';
  const brick = customs || brickworks || lot.style === 1 || (lot.style === 3 && rng.chance(0.4));
  const H = lot.height;
  const INS = 0.25;
  const exposed = [0, 1, 2, 3].map((s) => g.cover[s].length === 0);
  const ins = exposed.map((e) => (e ? INS : 0.0));
  const body: LRect = { x0: -W / 2 + ins[LEFT], x1: W / 2 - ins[RIGHT], z0: -D / 2 + ins[BACK], z1: D / 2 - ins[FRONT] };
  const wallC = brick ? col(rng.pick(PALETTE.brick)) : col(rng.pick(METAL_WALLS));
  if (customs) wallC.set('#a4533b');
  if (brickworks) wallC.set('#9d4f39');
  const pattern = brick ? WALLPAT.BRICK : WALLPAT.CORRUGATED;
  const trimC = brick ? col('#d9cfbd') : shade(wallC, 0.75);
  const frameIdx = brick ? (customs ? FRAME.GREEN : FRAME.DARK) : FRAME.DARK;
  const look = (style: number, profile: number = PROF.INDUSTRIAL): WallLook => ({ color: wallC, pattern, frame: frameIdx, glass: GLASS.NEUTRAL, style, profile, seed: g.seed });
  const plain = { color: wallC, pattern, seed: g.seed };
  const s = g.shell,
    t = g.trim;
  const doorH = depot ? 4.8 : customs ? 3.4 : 4.3;
  const doorW = depot ? 4.6 : customs ? 2.8 : 4.2;
  const pdW = 1.1,
    pdH = 2.25;

  for (const sd of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, sd);
    const parts = partitionSide(g, sd, sg.L, ins[PREV[sd]]);
    const pdoors = g.doors.filter((d) => d.side === sd).map((d) => Math.min(sg.L - 0.9, Math.max(0.9, d.u - ins[PREV[sd]])));
    for (const p of parts) {
      if (p.covered) {
        wallPlain(s, sg, p.a, p.b, 0, H, plain);
        continue;
      }
      buildSide(sg, sd, p.a, p.b, pdoors.filter((u) => u >= p.a && u <= p.b), exposed[sd]);
    }
  }

  function buildSide(sg: SideGeom, sd: Side, uA: number, uB: number, pdoors: number[], fullyExposed: boolean): void {
    const len = uB - uA;
    const isFront = sd === FRONT;
    const isEnd = sd === LEFT || sd === RIGHT;
    // bays
    const bayW = customs ? 5.0 : 6.4;
    const nb = Math.max(1, Math.round(len / bayW));
    const bw = len / nb;
    // which bays get a roll-up door
    const rollups: number[] = [];
    if ((isFront || (depot && sd === BACK)) && fullyExposed) {
      for (let i = 0; i < nb; i++) {
        const u = uA + (i + 0.5) * bw;
        if (pdoors.some((d) => Math.abs(d - u) < doorW / 2 + pdW / 2 + 0.5)) continue;
        if (u - doorW / 2 < uA + 0.6 || u + doorW / 2 > uB - 0.6) continue;
        if (!depot && !customs && i % 3 === 2) continue;
        rollups.push(u);
      }
    }
    const lowTop = Math.min(H - 2.2, Math.max(doorH + 0.9, H * 0.45));
    const ops = [...rollups.map((u) => ({ u, w: doorW, h: doorH })), ...pdoors.map((u) => ({ u, w: pdW, h: pdH }))];
    // low band (doors + low windows)
    bandWithOpenings(sg, uA, uB, ops, (a, b) => {
      const l = b - a;
      if (l > 2.4 && brick) {
        const n = Math.max(1, Math.round(l / bayW));
        const gr = makeGrid(a, b, 0, lowTop, 1, { spacing: l / n, cols: n, winW: Math.min(2.4, l / n - 1.0), winH: lowTop - 2.2, sill: 1.2, margin: 0.3 });
        wallGrid(s, sg, a, b, 0, lowTop, gr, look(customs ? WIN.ARCHED : WIN.INDUSTRIAL));
      } else wallPlain(s, sg, a, b, 0, lowTop, plain);
    }, (a, b, y0) => wallPlain(s, sg, a, b, y0, lowTop, plain));
    // upper band: big industrial windows (brick) or clerestory ribbon (metal)
    if (brick) {
      const gr = makeGrid(uA, uB, lowTop, H - lowTop, 1, { spacing: bayW, cols: nb, winW: Math.min(customs ? 1.9 : 3.4, bw - 1.2), winH: H - lowTop - 1.4, sill: 0.55, margin: 0 });
      wallGrid(s, sg, uA, uB, lowTop, H, gr, look(customs ? WIN.ARCHED : WIN.INDUSTRIAL));
    } else {
      const gr = makeGrid(uA, uB, lowTop, H - lowTop, 1, { spacing: 3.2, winW: 2.8, winH: Math.min(1.3, H - lowTop - 0.7), sill: H - lowTop - Math.min(1.3, H - lowTop - 0.7) - 0.45, margin: 0.6 });
      wallGrid(s, sg, uA, uB, lowTop, H, gr, look(WIN.INDUSTRIAL));
    }
    // pilasters at bay boundaries (brick)
    if (brick && fullyExposed) {
      setCol(t, shade(wallC, 0.92));
      for (let i = 0; i <= nb; i++) {
        const u = uA + i * bw;
        const a = Math.max(uA, u - 0.3),
          b = Math.min(uB, u + 0.3);
        if (ops.some((o) => b > o.u - o.w / 2 - 0.05 && a < o.u + o.w / 2 + 0.05)) continue;
        sideBox(t, sg, a, b, 0, INS - 0.03, 0, H - 0.3);
      }
      setCol(t, trimC);
      sideBox(t, sg, uA, uB, 0, INS - 0.02, lowTop - 0.15, lowTop + 0.1, true);
      sideBox(t, sg, uA, uB, 0, 0.35, H - 0.45, H, true);
    } else if (fullyExposed) {
      // concrete base course + top flashing
      setCol(t, col('#b9b4aa'));
      const segs = splitAround(uA, uB, ops);
      for (const [a, b] of segs) sideBox(t, sg, a, b, 0, 0.12, 0, 0.9);
      setCol(t, shade(wallC, 0.7));
      sideBox(t, sg, uA, uB, 0, 0.2, H - 0.25, H, true);
      // corner trims
      sideBox(t, sg, uA, uA + 0.15, 0, 0.12, 0, H);
      sideBox(t, sg, uB - 0.15, uB, 0, 0.12, 0, H);
    }
    for (const u of rollups) rollupDoor(sg, u);
    for (const u of pdoors) {
      doorNiche(g, sg, u, { w: pdW, h: pdH, depth: 0.15, wallColor: wallC, frameColor: col('#3a3f44'), doorColor: col(brick ? '#2f4a3a' : '#5e6a72'), glass: false, seed: g.seed, frameOut: Math.min(0.1, (fullyExposed ? INS : 0) - 0.02 + 0.02) });
      setCol(t, col('#3a3f44'));
      sideBox(t, sg, u - 1.0, u + 1.0, 0, 0.9, 2.75, 2.88, true);
      lightBox(g, sx(sg, u, 0.5) - 0.12, 2.68, sz(sg, u, 0.5) - 0.12, sx(sg, u, 0.5) + 0.12, 2.75, sz(sg, u, 0.5) + 0.12, '#fff1d6', LIGHT_MODE.STEADY, 3.2);
    }
    void isEnd;
  }

  function splitAround(uA: number, uB: number, ops: { u: number; w: number }[]): [number, number][] {
    const out: [number, number][] = [];
    let cur = uA;
    for (const o of [...ops].sort((a, b) => a.u - b.u)) {
      const a = o.u - o.w / 2 - 0.15,
        b = o.u + o.w / 2 + 0.15;
      if (a > cur + 0.05) out.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (uB > cur + 0.05) out.push([cur, uB]);
    return out;
  }

  function rollupDoor(sg: SideGeom, u: number): void {
    const d = 0.18;
    const a = u - doorW / 2,
      b = u + doorW / 2;
    const dc = customs ? col('#5a3d2b') : col(rng.pick(['#c9cfd3', '#d9b13a', '#5e6a72', '#7a2e2a', '#2f5d50']));
    // reveals
    setCol(t, shade(wallC, 0.75));
    const ax = sx(sg, a, 0), az = sz(sg, a, 0), axi = sx(sg, a, -d), azi = sz(sg, a, -d);
    const bx = sx(sg, b, 0), bz = sz(sg, b, 0), bxi = sx(sg, b, -d), bzi = sz(sg, b, -d);
    t.quad(ax, 0, az, axi, 0, azi, axi, doorH, azi, ax, doorH, az);
    t.quad(bxi, 0, bzi, bx, 0, bz, bx, doorH, bz, bxi, doorH, bzi);
    t.quad(axi, doorH, azi, bxi, doorH, bzi, bx, doorH, bz, ax, doorH, az);
    // door leaf with ribs (or wooden double doors for the customs house)
    setCol(t, customs ? dc : shade(dc, 0.5)); // sectional doors: seen only in the joints between sections
    sideBox(t, sg, a, b, -d, -d + 0.02, 0, doorH, false, true);
    setCol(t, shade(dc, 0.8));
    if (customs) {
      sideBox(t, sg, u - 0.04, u + 0.04, -d + 0.02, -d + 0.06, 0, doorH);
      for (const yy of [0.6, doorH * 0.5, doorH - 0.5]) sideBox(t, sg, a + 0.1, b - 0.1, -d + 0.02, -d + 0.05, yy - 0.06, yy + 0.06);
    } else if (rng.chance(0.5)) {
      // roller shutter: 77 mm curved steel slats (each a raised roll: lit top, shaded underside) running in deep
      // guide channels, an aluminium bottom bar with a rubber lip, the coil hood under the lintel; the lower
      // slats scuffed and a few dented by fork-lift tines
      const hood = 0.34;
      const top = doorH - hood;
      const n = Math.max(8, Math.round((top - 0.1) / 0.077));
      const sh = (top - 0.1) / n;
      const ua = a + 0.09,
        ub = b - 0.09;
      const P = (uu: number, o: number, y: number): [number, number, number] => [sx(sg, uu, o), y, sz(sg, uu, o)];
      const rx = sx(sg, u, -d - 1), rz = sz(sg, u, -d - 1);
      for (let k = 0; k < n; k++) {
        const y0 = 0.1 + k * sh,
          ym = y0 + sh * 0.55,
          y1 = y0 + sh;
        const dent = k < 9 && (g.seed * 7 + k * 13) % 11 === 0 ? 0.012 : 0;
        const c0 = shade(dc, (k < 6 ? 0.8 : 0.94) + ((g.seed + k * 3) % 5) * 0.012);
        const oB = -d + 0.022,
          oT = -d + 0.042 - dent;
        const nseg = dent ? 3 : 1;
        for (let j = 0; j < nseg; j++) {
          const u0 = ua + ((ub - ua) * j) / nseg,
            u1 = ua + ((ub - ua) * (j + 1)) / nseg;
          const oT2 = j === 1 ? oT - dent : oT;
          setCol(t, c0);
          const p0 = P(u0, oT2, ym), p1 = P(u1, oT2, ym), q0 = P(u0, oB, y1), q1 = P(u1, oB, y1);
          t.quadAway(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], q1[0], q1[1], q1[2], q0[0], q0[1], q0[2], rx, ym - 0.4, rz);
          setCol(t, shade(c0, 0.78));
          const b0 = P(u0, oB, y0), b1 = P(u1, oB, y0);
          t.quadAway(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], p1[0], p1[1], p1[2], p0[0], p0[1], p0[2], rx, ym + 0.4, rz);
        }
      }
      // bottom bar + rubber lip, lock in the bar
      setCol(t, col('#a9afb3'));
      sideBox(t, sg, ua, ub, -d + 0.02, -d + 0.07, 0.025, 0.1, true);
      setCol(t, col('#151617'));
      sideBox(t, sg, ua, ub, -d + 0.025, -d + 0.06, 0, 0.025, true);
      setCol(t, col('#3a3d40'));
      sideBox(t, sg, u - 0.05, u + 0.05, -d + 0.07, -d + 0.078, 0.04, 0.085, true);
      // guide channels (U section: two cheeks and a dark slot)
      for (const [u0, u1] of [[a + 0.005, a + 0.1], [b - 0.1, b - 0.005]]) {
        setCol(t, col('#1d1f21'));
        sideBox(t, sg, u0 + 0.02, u1 - 0.02, -d, -d + 0.06, 0, top, false);
        setCol(t, col('#9aa1a6'));
        sideBox(t, sg, u0, u0 + 0.022, -d, -d + 0.1, 0, top + 0.02, false);
        sideBox(t, sg, u1 - 0.022, u1, -d, -d + 0.1, 0, top + 0.02, false);
      }
      // coil hood (folded sheet box) under the lintel
      setCol(t, shade(dc, 0.72));
      sideBox(t, sg, a, b, -d, -d + 0.2, top, doorH, false, true);
      setCol(t, shade(dc, 0.6));
      sideBox(t, sg, a, b, -d + 0.2, -d + 0.215, top - 0.02, top + 0.05, true);
    } else {
      // sectional door: ~0.55 m insulated steel sections, each a profiled panel — a rounded nose at the top
      // joint (lit), a bevel at the foot (shaded), two pressed ribs as sloped faces so they catch the light —
      // running between galvanised guide tracks; one section glazed with real openings (gasket frame, glass
      // 2 cm behind the face); an aluminium bottom bar with a flared rubber lip; the lowest section scuffed
      const n = Math.max(5, Math.round(doorH / 0.55));
      const sh = doorH / n;
      const ua = a + 0.09,
        ub = b - 0.09;
      const oF = -d + 0.045, // panel face
        oK = -d + 0.03; // panel core behind the bevels
      const P = (uu: number, o: number, y: number): [number, number, number] => [sx(sg, uu, o), y, sz(sg, uu, o)];
      const rx = sx(sg, u, -d - 1), rz = sz(sg, u, -d - 1);
      // quad across u0..u1 from (yA, oA) to (yB, oB), facing out (and up / down by `tilt`)
      const strip = (u0: number, u1: number, yA: number, oA: number, yB: number, oB: number, tilt = 0): void => {
        const p0 = P(u0, oA, yA), p1 = P(u1, oA, yA), q1 = P(u1, oB, yB), q0 = P(u0, oB, yB);
        t.quadAway(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], q1[0], q1[1], q1[2], q0[0], q0[1], q0[2], rx, (yA + yB) / 2 - tilt, rz);
      };
      const kw = Math.min(n - 2, Math.max(1, Math.round(n * 0.62))); // glazed section
      const nw = Math.max(2, Math.round((ub - ua) / 0.95));
      const wpitch = (ub - ua) / nw;
      for (let k = 0; k < n; k++) {
        const y0 = k * sh + 0.008,
          y1 = (k + 1) * sh - 0.008;
        const c0 = shade(dc, k === 0 ? 0.8 : 0.93 + ((g.seed + k * 5) % 4) * 0.025);
        // core (fills the joints' depth) + foot bevel (faces down) + nose (faces up)
        setCol(t, shade(c0, 0.55));
        sideBox(t, sg, ua, ub, -d + 0.02, oK, y0, y1, true);
        setCol(t, shade(c0, 0.7));
        strip(ua, ub, y0, oK, y0 + 0.022, oF, -0.4);
        setCol(t, shade(c0, 1.12));
        strip(ua, ub, y1 - 0.03, oF, y1, oK, 0.4);
        // face, cut around the windows on the glazed section; ribs on the others
        setCol(t, c0);
        const fy0 = y0 + 0.022,
          fy1 = y1 - 0.03;
        if (k === kw) {
          const wy0 = fy0 + 0.07,
            wy1 = fy1 - 0.07;
          strip(ua, ub, fy0, oF, wy0, oF);
          strip(ua, ub, wy1, oF, fy1, oF);
          for (let i = 0; i <= nw; i++) {
            const e0 = i === 0 ? ua : ua + i * wpitch - wpitch * 0.18,
              e1 = i === nw ? ub : ua + i * wpitch + wpitch * 0.18;
            setCol(t, c0);
            sideBox(t, sg, e0, e1, oK, oF, wy0, wy1, false);
          }
          for (let i = 0; i < nw; i++) {
            const w0 = ua + i * wpitch + wpitch * 0.18,
              w1 = ua + (i + 1) * wpitch - wpitch * 0.18;
            // window reveal sills (the panel's thickness), glass 2 cm back: dark room, sky in the upper part
            setCol(t, shade(c0, 0.62));
            strip(w0, w1, wy0, oF, wy0, oK + 0.003, 0.4);
            setCol(t, col('#2b3238'));
            strip(w0, w1, wy0, oK + 0.003, (wy0 + wy1) / 2, oK + 0.003);
            setCol(t, col('#56646f'));
            strip(w0, w1, (wy0 + wy1) / 2, oK + 0.003, wy1, oK + 0.003);
            // black gasket frame, proud of the face
            setCol(t, col('#151719'));
            sideBox(t, sg, w0 - 0.025, w1 + 0.025, oF, oF + 0.009, wy0 - 0.025, wy0 + 0.006, true);
            sideBox(t, sg, w0 - 0.025, w1 + 0.025, oF, oF + 0.009, wy1 - 0.006, wy1 + 0.025, true);
            sideBox(t, sg, w0 - 0.025, w0 + 0.006, oF, oF + 0.009, wy0, wy1);
            sideBox(t, sg, w1 - 0.006, w1 + 0.025, oF, oF + 0.009, wy0, wy1);
          }
        } else {
          const r0 = fy0 + (fy1 - fy0) / 3,
            r1 = fy0 + ((fy1 - fy0) * 2) / 3;
          strip(ua, ub, fy0, oF, r0 - 0.016, oF);
          strip(ua, ub, r0 + 0.016, oF, r1 - 0.016, oF);
          strip(ua, ub, r1 + 0.016, oF, fy1, oF);
          for (const r of [r0, r1]) {
            // pressed rib: 9 mm proud, lit upper slope, shaded lower slope
            setCol(t, shade(c0, 1.14));
            strip(ua, ub, r + 0.005, oF + 0.009, r + 0.016, oF, 0.4);
            setCol(t, shade(c0, 1.02));
            strip(ua, ub, r - 0.005, oF + 0.009, r + 0.005, oF + 0.009);
            setCol(t, shade(c0, 0.68));
            strip(ua, ub, r - 0.016, oF, r - 0.005, oF + 0.009, -0.4);
          }
        }
      }
      // scuffs on the lowest section (pallets, boots): darker rubbed patches
      setCol(t, shade(dc, 0.6));
      for (let i = 0; i < 3; i++) {
        const su = ua + 0.3 + ((g.seed * (i + 3) * 37) % 100) / 100 * (ub - ua - 0.9);
        sideBox(t, sg, su, su + 0.25 + i * 0.12, oF, oF + 0.001, 0.12 + i * 0.05, 0.16 + i * 0.06);
      }
      // guide tracks: galvanised angle with a dark slot, bolt heads every ~0.45 m
      for (const [u0, u1, s] of [[a + 0.005, ua, 1], [ub, b - 0.005, -1]] as const) {
        setCol(t, col('#202224'));
        sideBox(t, sg, u0, u1, -d, -d + 0.05, 0, doorH, false);
        setCol(t, col('#a4abb0'));
        const ce = s > 0 ? u0 : u1 - 0.035;
        sideBox(t, sg, ce, ce + 0.035, -d, -d + 0.085, 0, doorH, false);
        setCol(t, col('#6d7378'));
        for (let y = 0.25; y < doorH - 0.1; y += 0.45) sideBox(t, sg, ce + 0.01, ce + 0.025, -d + 0.085, -d + 0.092, y, y + 0.015);
      }
      // aluminium bottom bar + flared rubber lip on the ground
      setCol(t, col('#b3b8bb'));
      sideBox(t, sg, ua, ub, oK, oF + 0.006, 0.03, 0.075, true);
      setCol(t, col('#141516'));
      sideBox(t, sg, ua, ub, oK, oF + 0.006, 0.0, 0.03, false);
      strip(ua, ub, 0.0, oF + 0.022, 0.012, oF + 0.006, 0.4);
      // lift handle + lock on the bottom section
      setCol(t, col('#2a2c2e'));
      sideBox(t, sg, u - 0.12, u + 0.12, oF, oF + 0.035, 0.32, 0.35, true);
      sideBox(t, sg, u - 0.12, u - 0.1, oF, oF + 0.035, 0.29, 0.35, true);
      sideBox(t, sg, u + 0.1, u + 0.12, oF, oF + 0.035, 0.29, 0.35, true);
      setCol(t, col('#b9a46a'));
      sideBox(t, sg, u + 0.3, u + 0.34, oF, oF + 0.012, 0.3, 0.36, true);
    }
    // frame (safety yellow posts on modern sheds), bumpers, canopy + dock light
    setCol(t, brick ? trimC : col('#e0b33c'));
    sideBox(t, sg, a - 0.16, a, 0, INS - 0.03, 0, doorH + 0.15);
    sideBox(t, sg, b, b + 0.16, 0, INS - 0.03, 0, doorH + 0.15);
    sideBox(t, sg, a - 0.16, b + 0.16, 0, INS - 0.03, doorH, doorH + 0.18);
    if (!customs) {
      // steel bollards guarding the door posts (yellow, black bands, domed cap) — within the wall inset
      if (INS > 0.2) {
        for (const bu of [a - 0.42, b + 0.42]) {
          const bx = sx(sg, bu, 0.12),
            bz = sz(sg, bu, 0.12);
          setCol(t, col('#d9a92a'));
          t.cylinder(bx, bz, 0.07, 0.0, 1.0, 10, false);
          setCol(t, col('#1d1f21'));
          t.cylinder(bx, bz, 0.073, 0.62, 0.72, 10, false);
          t.cylinder(bx, bz, 0.073, 0.84, 0.94, 10, false);
          setCol(t, col('#d9a92a'));
          t.cone(bx, bz, 0.07, 1.0, 1.06, 10);
        }
      }
      setCol(t, col('#4a5056'));
      sideBox(t, sg, a - 0.4, b + 0.4, 0, 1.15, doorH + 0.35, doorH + 0.5, true);
      lightBox(g, sx(sg, u, 0.7) - 0.15, doorH + 0.28, sz(sg, u, 0.7) - 0.15, sx(sg, u, 0.7) + 0.15, doorH + 0.35, sz(sg, u, 0.7) + 0.15, '#fff1d6', LIGHT_MODE.STEADY, 3);
    } else {
      // arched head over the customs doors
      setCol(t, trimC);
      sideBox(t, sg, a - 0.2, b + 0.2, 0, INS - 0.02, doorH + 0.15, doorH + 0.45);
      sideBox(t, sg, u - 0.18, u + 0.18, 0, INS, doorH + 0.15, doorH + 0.6);
    }
  }

  // ───────────────────────────────────────────────────────────── roof ──
  const roof = lot.roof;
  if (roof === 'sawtooth') sawtooth();
  else if (roof === 'barrel') barrel();
  else if (roof === 'gable') gable();
  else flatRoof(s, body, H, col('#8a8780'), ROOFPAT.FLAT, g.seed);

  function sawtooth(): void {
    // glazing faces world north: local direction (sin yaw, -cos yaw)
    const lx = Math.round(Math.sin(yawOf(lot.front))),
      lz = Math.round(-Math.cos(yawOf(lot.front)));
    const alongX = lz !== 0; // north is ±z -> ridges run along x
    const span = alongX ? body.z1 - body.z0 : body.x1 - body.x0;
    const nT = Math.max(2, Math.round(span / 5.6));
    const tw = span / nT;
    const th = Math.min(2.8, tw * 0.5);
    const gl = 0.55;
    const sign = alongX ? lz : lx; // +1: north is towards +axis
    const roofC = col(brick ? '#5d6670' : '#8e979e');
    const glassC = col('#7c93a3');
    const mk = (sv: number, y: number, m: number): number[] => {
      // sv: coordinate along the north axis (+ = north), m along the ridge
      const a = alongX ? m : 0;
      void a;
      if (alongX) return [m, y, sign > 0 ? sv : -sv];
      return [sign > 0 ? sv : -sv, y, m];
    };
    const m0 = alongX ? body.x0 : body.z0,
      m1 = alongX ? body.x1 : body.z1;
    const s0 = alongX ? (sign > 0 ? body.z0 : -body.z1) : sign > 0 ? body.x0 : -body.x1;
    for (let i = 0; i < nT; i++) {
      const a = s0 + i * tw,
        b = a + tw;
      // solid slope from (a, H) up to (b - gl, H + th)
      roofLook(s, roofC, ROOFPAT.SEAM, g.seed);
      const p0 = mk(a, H, m0), p1 = mk(a, H, m1), p2 = mk(b - gl, H + th, m1), p3 = mk(b - gl, H + th, m0);
      const slopeL = Math.hypot(tw - gl, th);
      orientedRoof([p0, p1, p2, p3], mk(a + 1, H - 5, (m0 + m1) / 2));
      void slopeL;
      // glazing from (b - gl, H + th) down to (b, H)
      roofLook(s, glassC, ROOFPAT.SKYLIGHT, g.seed + i);
      orientedRoof([mk(b, H, m0), mk(b, H, m1), mk(b - gl, H + th, m1), mk(b - gl, H + th, m0)], mk(b - 2, H - 5, (m0 + m1) / 2));
      // end triangles (wall mode) on both ends
      for (const m of [m0, m1]) {
        const q0 = mk(a, H, m), q1 = mk(b - gl, H + th, m), q2 = mk(b, H, m);
        setWallAttrs(s, null, plain);
        const ref = mk((a + b) / 2, H + th * 0.3, (m0 + m1) / 2);
        triAway(q0, q1, q2, ref);
      }
      // gutter between teeth
      setCol(t, col('#5a5f64'));
      const ga = mk(b - 0.15, H - 0.05, m0), gb = mk(b + 0.15, H + 0.12, m1);
      t.box(Math.min(ga[0], gb[0]), H - 0.05, Math.min(ga[2], gb[2]), Math.max(ga[0], gb[0]), H + 0.12, Math.max(ga[2], gb[2]), 0b110111);
    }
    vents(H + th * 0.5, 3);
  }

  function orientedRoof(p: number[][], ref: number[]): void {
    // roof quad facing away from ref (below/inside); uv along the first edge / up-slope
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = [(p[0][0] + p[2][0]) / 2 - ref[0], (p[0][1] + p[2][1]) / 2 - ref[1], (p[0][2] + p[2][2]) / 2 - ref[2]];
    const flip = n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0;
    const pts = flip ? [p[1], p[0], p[3], p[2]] : p;
    const ax = norm([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]);
    const ay = norm([pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]]);
    roofPoly(s, pts, ax, ay);
  }

  function triAway(a: number[], b: number[], c: number[], ref: number[]): void {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const m = [(a[0] + b[0] + c[0]) / 3 - ref[0], (a[1] + b[1] + c[1]) / 3 - ref[1], (a[2] + b[2] + c[2]) / 3 - ref[2]];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) s.triangle(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    else s.triangle(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
  }

  function barrel(): void {
    const alongX = body.x1 - body.x0 >= body.z1 - body.z0;
    const span = alongX ? body.z1 - body.z0 : body.x1 - body.x0;
    const rise = span * 0.17;
    const n = 10;
    const c0 = alongX ? (body.z0 + body.z1) / 2 : (body.x0 + body.x1) / 2;
    const a0 = alongX ? body.x0 - 0.3 : body.z0 - 0.3,
      a1 = alongX ? body.x1 + 0.3 : body.z1 + 0.3;
    const roofC = col(rng.pick(['#7d878f', '#9aa3aa', '#6f8f86', '#a24c36']));
    roofLook(s, roofC, ROOFPAT.CORRUGATED, g.seed);
    const prof = (k: number): [number, number] => {
      const tt = k / n;
      const ang = Math.PI * (1 - tt);
      const half = span / 2 + 0.3;
      // flattened arc
      return [c0 + Math.cos(ang) * half, H + Math.sin(ang) * rise - 0.06];
    };
    let vAcc = 0;
    for (let k = 0; k < n; k++) {
      const [ca, ya] = prof(k);
      const [cb, yb] = prof(k + 1);
      const segL = Math.hypot(cb - ca, yb - ya);
      if (alongX) {
        const p = [[a0, ya, ca], [a1, ya, ca], [a1, yb, cb], [a0, yb, cb]];
        orientedRoofUV(p, [ (a0 + a1) / 2, H - 4, c0 ], vAcc, segL);
      } else {
        const p = [[ca, ya, a0], [ca, ya, a1], [cb, yb, a1], [cb, yb, a0]];
        orientedRoofUV(p, [c0, H - 4, (a0 + a1) / 2], vAcc, segL);
      }
      vAcc += segL;
    }
    // end walls: fan under the arc (plain wall + lunette window)
    for (const end of [0, 1]) {
      const m = alongX ? (end ? body.x1 : body.x0) : end ? body.z1 : body.z0;
      setWallAttrs(s, null, plain);
      for (let k = 0; k < n; k++) {
        const [ca, ya] = prof(k);
        const [cb, yb] = prof(k + 1);
        const clamp = (v: number) => Math.max(alongX ? body.z0 : body.x0, Math.min(alongX ? body.z1 : body.x1, v));
        const A = alongX ? [m, H - 0.06, clamp(ca)] : [clamp(ca), H - 0.06, m];
        const B = alongX ? [m, ya, clamp(ca)] : [clamp(ca), ya, m];
        const C = alongX ? [m, yb, clamp(cb)] : [clamp(cb), yb, m];
        const Dp = alongX ? [m, H - 0.06, clamp(cb)] : [clamp(cb), H - 0.06, m];
        const ref = alongX ? [end ? m - 5 : m + 5, H, c0] : [c0, H, end ? m - 5 : m + 5];
        triAway(A, B, C, ref);
        triAway(A, C, Dp, ref);
      }
      // lunette window
      setCol(t, col('#3a4650'));
      const lx = alongX ? m + (end ? 0.03 : -0.03) : c0,
        lz = alongX ? c0 : m + (end ? 0.03 : -0.03);
      if (alongX) t.box(lx - 0.02, H + 0.2, lz - span * 0.18, lx + 0.02, H + rise * 0.75, lz + span * 0.18, 0b111111);
      else t.box(lx - span * 0.18, H + 0.2, lz - 0.02, lx + span * 0.18, H + rise * 0.75, lz + 0.02, 0b111111);
    }
    // barrel section: height above the eaves ≈ rise·(1 − (d/half)²) across the span
    vents((x, z) => {
      const d = (alongX ? z : x) - c0;
      return H + rise * Math.max(0, 1 - (d / (span / 2)) ** 2) + 0.3;
    }, 2);
  }

  function orientedRoofUV(p: number[][], ref: number[], v0: number, segL: number): void {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = [(p[0][0] + p[2][0]) / 2 - ref[0], (p[0][1] + p[2][1]) / 2 - ref[1], (p[0][2] + p[2][2]) / 2 - ref[2]];
    const L = Math.hypot(e1[0], e1[1], e1[2]);
    if (nn[0] * c[0] + nn[1] * c[1] + nn[2] * c[2] >= 0) s.quad(p[0][0], p[0][1], p[0][2], p[1][0], p[1][1], p[1][2], p[2][0], p[2][1], p[2][2], p[3][0], p[3][1], p[3][2], 0, v0, L, v0, L, v0 + segL, 0, v0 + segL);
    else s.quad(p[1][0], p[1][1], p[1][2], p[0][0], p[0][1], p[0][2], p[3][0], p[3][1], p[3][2], p[2][0], p[2][1], p[2][2], L, v0, 0, v0, 0, v0 + segL, L, v0 + segL);
  }

  function gable(): void {
    const alongX = body.x1 - body.x0 >= body.z1 - body.z0;
    const half = alongX ? (body.z1 - body.z0) / 2 : (body.x1 - body.x0) / 2;
    const rise = half * (customs ? 0.62 : 0.32);
    const roofC = customs ? col('#5a6270') : col(rng.pick(['#8e979e', '#a24c36', '#6f8f86']));
    const pat = customs ? ROOFPAT.SLATE : ROOFPAT.SEAM;
    // simple gable (shared helper semantics, inline for the industrial trims)
    const yr = H + rise;
    roofLook(s, roofC, pat, g.seed);
    const oe = 0.35,
      og = 0.3;
    if (alongX) {
      const zc = (body.z0 + body.z1) / 2;
      const p = rise / half;
      const zf = body.z1 + oe, yf = H - oe * p, zb = body.z0 - oe, yb = H - oe * p;
      const x0 = body.x0 - og, x1 = body.x1 + og;
      const sl = Math.hypot(zf - zc, yr - yf);
      roofPoly(s, [[x0, yf, zf], [x1, yf, zf], [x1, yr, zc], [x0, yr, zc]], [1, 0, 0], [0, (yr - yf) / sl, (zc - zf) / sl]);
      roofPoly(s, [[x1, yb, zb], [x0, yb, zb], [x0, yr, zc], [x1, yr, zc]], [-1, 0, 0], [0, (yr - yb) / sl, (zc - zb) / sl]);
      setCol(t, shade(roofC, 0.75));
      t.box(x0, yr - 0.05, zc - 0.15, x1, yr + 0.12, zc + 0.15);
      t.box(x0, yf - 0.18, zf - 0.04, x1, yf + 0.02, zf + 0.04, 0b111111);
      t.box(x0, yb - 0.18, zb - 0.04, x1, yb + 0.02, zb + 0.04, 0b111111);
      for (const sd of [RIGHT, LEFT] as Side[]) gableEnd(sideGeom(body, sd), rise);
    } else {
      const xc = (body.x0 + body.x1) / 2;
      const p = rise / half;
      const xr = body.x1 + oe, yR = H - oe * p, xl = body.x0 - oe;
      const z0 = body.z0 - og, z1 = body.z1 + og;
      const sl = Math.hypot(xr - xc, yr - yR);
      roofPoly(s, [[xr, yR, z1], [xr, yR, z0], [xc, yr, z0], [xc, yr, z1]], [0, 0, -1], [(xc - xr) / sl, (yr - yR) / sl, 0]);
      roofPoly(s, [[xl, yR, z0], [xl, yR, z1], [xc, yr, z1], [xc, yr, z0]], [0, 0, 1], [(xc - xl) / sl, (yr - yR) / sl, 0]);
      setCol(t, shade(roofC, 0.75));
      t.box(xc - 0.15, yr - 0.05, z0, xc + 0.15, yr + 0.12, z1);
      for (const sd of [FRONT, BACK] as Side[]) gableEnd(sideGeom(body, sd), rise);
    }
    // the slope's height at the vent (+0.3: the collar sits in the roofing)
    const slopeY = (x: number, z: number) => H + rise * Math.max(0, 1 - Math.abs(alongX ? z - (body.z0 + body.z1) / 2 : x - (body.x0 + body.x1) / 2) / half) + 0.3;
    vents(slopeY, 2);
  }

  function gableEnd(sg: SideGeom, rise: number): void {
    const L = sg.L;
    if (customs) {
      // oculus + loading door with a hoist beam
      const oc = makeGrid(L / 2 - 0.8, L / 2 + 0.8, H + rise * 0.25, 1.6, 1, { spacing: 1.6, cols: 1, winW: 1.3, winH: 1.3, sill: 0.15, margin: 0 });
      wallTri(s, sg, 0, L, L / 2, H, H + rise, plain, oc, WIN.ARCHED, PROF.INDUSTRIAL, FRAME.GREEN, GLASS.NEUTRAL);
      setCol(t, trimC);
      sideBox(t, sg, L / 2 - 0.9, L / 2 + 0.9, 0, 0.12, H + rise * 0.25 + 0.05, H + rise * 0.25 + 0.15, true);
      // hoist beam
      setCol(t, col('#3b2a20'));
      sideBox(t, sg, L / 2 - 0.12, L / 2 + 0.12, 0, 1.15, H + rise * 0.72, H + rise * 0.72 + 0.28, true);
      setCol(t, col('#2b2b2b'));
      sideBox(t, sg, L / 2 - 0.02, L / 2 + 0.02, 0.98, 1.02, H + rise * 0.72 - 2.2, H + rise * 0.72);
      t.cylinder(sx(sg, L / 2, 1.0), sz(sg, L / 2, 1.0), 0.12, H + rise * 0.72 - 2.4, H + rise * 0.72 - 2.2, 6, true);
    } else {
      wallTri(s, sg, 0, L, L / 2, H, H + rise, plain);
      // louvre vent
      setCol(t, shade(wallC, 0.6));
      sideBox(t, sg, L / 2 - 0.6, L / 2 + 0.6, 0, 0.08, H + rise * 0.3, H + rise * 0.3 + 0.7, true);
    }
  }

  /** roof vents; on a pitched / barrel roof `y` is a function of the spot: a fixed height put vents near the
   * ridge inside the roof, smoking from a bare roof (real-bugs-3 #4) */
  function vents(yAt: number | ((x: number, z: number) => number), n: number): void {
    const t2 = g.trim;
    for (let k = 0; k < n; k++) {
      const vx = body.x0 + 2 + rng.next() * (body.x1 - body.x0 - 4),
        vz = body.z0 + 2 + rng.next() * (body.z1 - body.z0 - 4);
      const y = typeof yAt === 'number' ? yAt : yAt(vx, vz);
      setCol(t2, col('#a9b0b5'));
      t2.cylinder(vx, vz, 0.35, y - 1.2, y + 0.8, 8, false);
      setCol(t2, col('#7d858b'));
      t2.cone(vx, vz, 0.55, y + 0.8, y + 1.15, 8);
      anchors.chimney(vx, vz, y + 0.9, 0.7, 0.7);
    }
  }

  // ─────────────────────────────────────────────────────────── signage ──
  const sgF = sideGeom(body, FRONT);
  if (brickworks) {
    const r = g.atlas.add('brickworks', 640, 80, letterSign('HAVEN BRICKWORKS', '#efe6d4', '#ffe7b0', '"Arial Black", Impact, sans-serif', 0.55));
    signOnSide(g, sgF, sgF.L * 0.5 - 9.5, sgF.L * 0.5 + 9.5, INS - 0.0 + 0.06, H - 2.55, H - 0.65, r);
  } else if (customs) {
    const r = g.atlas.add('customs', 900, 72, letterSign('OLD CUSTOMS WAREHOUSE', '#ece2c6', '#ffe1a8', 'Georgia, "Times New Roman", serif', 0.45));
    signOnSide(g, sgF, sgF.L * 0.5 - 14, sgF.L * 0.5 + 14, INS + 0.06, H - 1.85, H - 0.55, r);
  } else {
    const names = depot ? ['TRANSIT DEPOT'] : ['NORTHGATE FREIGHT', 'HARBOUR STORES', 'NORTHGATE LOGISTICS', 'BRICKWORKS STORE', 'KESTREL & SONS'];
    const nm = depot ? names[0] : names[(lot.id * 7) % names.length];
    const r = g.atlas.add(`ind:${nm}`, 420, 64, boardSign(nm, { bg: '#f1ede4', fg: '#2c3a46', font: '"Arial Black", "Segoe UI", sans-serif', weight: '900', glow: 0.25, glowColor: '#ffffff', border: '#2c3a46' }));
    // the board stays clear of the dock canopies (top at doorH + 0.5): it shrinks rather than overlapping them
    const yS = Math.min(H - 0.5, Math.max(doorH + 1.0, H - 2.0));
    const yB = Math.min(yS - 0.55, Math.max(yS - 1.65, doorH + 0.75));
    const w = Math.min(sgF.L * 0.55, 11, (yS - yB - 0.15) * 7.2); // keep the lettering's aspect
    setCol(t, col('#2c3a46'));
    sideBox(t, sgF, sgF.L / 2 - w / 2 - 0.1, sgF.L / 2 + w / 2 + 0.1, 0, 0.1, yB, yS + 0.05, true);
    signOnSide(g, sgF, sgF.L / 2 - w / 2, sgF.L / 2 + w / 2, 0.135, yB + 0.1, yS - 0.05, r);
    if (depot) {
      // floodlights over the yard
      for (const u of [1.0, sgF.L - 1.0]) {
        setCol(t, col('#3a3f44'));
        sideBox(t, sgF, u - 0.08, u + 0.08, 0, 0.6, H - 0.6, H - 0.45, true);
        lightBox(g, sx(sgF, u, 0.6) - 0.2, H - 0.75, sz(sgF, u, 0.6) - 0.2, sx(sgF, u, 0.6) + 0.2, H - 0.55, sz(sgF, u, 0.6) + 0.2, '#fff6e0', LIGHT_MODE.STEADY, 3.5);
      }
    }
  }
}

function yawOf(front: string): number {
  return front === 'S' ? 0 : front === 'E' ? Math.PI / 2 : front === 'N' ? Math.PI : -Math.PI / 2;
}

function norm(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

void THREE;
void wallSeg;
void wallLamp;
