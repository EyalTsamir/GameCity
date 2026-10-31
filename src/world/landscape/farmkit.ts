// What stands on the farmland round the town, placed plot by plot from the same parcels as the land shader (fields.ts): vine
// rows, maize, sunflowers, bales on the stubble, polytunnels on the market gardens, wire fences round the pastures, stone walls
// on the hill pastures, hedges as cut-out strips, reed beds on the river, sand fences and marram on the dunes.
// Everything goes into one RowSink (rows.ts). Build-time only, deterministic.

import { WL, type LandscapeModel } from './model';
import { FROW, toField, fromField, rowB, colB, colOff, colW, lhash, hmix, fieldsOfParcel, cropKind, CK, type Field } from './fields';
import { GROUND_DROP } from '../terrain/height';
import { RowSink, B } from './rows';
import { SLAB } from '../../core/constants';
import { hash2i, vnoise, smooth } from './noise';

/** rows and bales stand within this of the slab: the camera sees them from ≤ ~1.3 km, where the strips sink away */
const FARM_R = 1000;
const STONE_R = 1500;

/** one hedge run: ground points about 2.7 m apart */
export interface HedgeRun {
  x: number[];
  y: number[];
  z: number[];
  h: number[];
  tone: number;
}
export class HedgeSink {
  runs: HedgeRun[] = [];
  private cur: HedgeRun | null = null;
  private key = 0;
  add(x: number, y: number, z: number, h: number, key: number): void {
    if (!this.cur || key !== this.key) {
      this.cur = { x: [], y: [], z: [], h: [], tone: lhash(key, 7) };
      this.runs.push(this.cur);
      this.key = key;
    }
    this.cur.x.push(x);
    this.cur.y.push(y);
    this.cur.z.push(z);
    this.cur.h.push(h);
  }
  /** a gap in the hedge: the next point starts a new run */
  gap(): void {
    this.cur = null;
  }
}

export interface FarmKitStats {
  rows: number;
  bales: number;
  tunnels: number;
  fences: number;
  hedges: number;
  reeds: number;
  dune: number;
  stone: number;
}

export function buildFarmKit(
  s: RowSink,
  model: LandscapeModel,
  fieldW: ((pid: number, wx: number, wz: number) => boolean) | null,
  hedges: HedgeSink | null,
  on: { rows: boolean; bales: boolean; fences: boolean; reeds: boolean; dunes: boolean },
): FarmKitStats {
  const st: FarmKitStats = { rows: 0, bales: 0, tunnels: 0, fences: 0, hedges: 0, reeds: 0, dune: 0, stone: 0 };
  const H = (x: number, z: number) => model.height(x, z) + GROUND_DROP;
  const w = { x: 0, z: 0 };
  const rv = { d: 0, halfW: 8, s: 0, tx: 1, tz: 0 };
  const rh = { d: 0, i: 0, s: 0, level: 0, tx: 1, tz: 0 };
  /** a point of a plot that can carry crops */
  const okAt = (x: number, z: number, y: number, margin = 3): boolean => {
    if (y < WL + 0.4) return false;
    if (model.slabDist(x, z) < 3) return false;
    if (model.siteAt(x, z, margin) >= 0) return false;
    if (model.forestAt(x, z, y) > 0.35) return false;
    if (model.road(x, z, rh, 10) && rh.d < model.roads[rh.i].halfW + 2.5) return false;
    if (x < -150 && model.river(x, z, rv) && rv.d < rv.halfW + 5) return false;
    if (model.coastSD(x, z) < 42) return false;
    return true;
  };
  const q = { x: 0, y: 0 };
  // field-frame bounds of the area
  let qx0 = Infinity,
    qx1 = -Infinity,
    qy0 = Infinity,
    qy1 = -Infinity;
  for (const [cx, cz] of [
    [SLAB.x0 - STONE_R, SLAB.z0 - STONE_R],
    [SLAB.x1 + STONE_R, SLAB.z0 - STONE_R],
    [SLAB.x0 - STONE_R, SLAB.z1 + STONE_R],
    [SLAB.x1 + STONE_R, SLAB.z1 + STONE_R],
  ]) {
    toField(cx, cz, q);
    qx0 = Math.min(qx0, q.x);
    qx1 = Math.max(qx1, q.x);
    qy0 = Math.min(qy0, q.y);
    qy1 = Math.max(qy1, q.y);
  }

  // a plot's ground: bilinear over a coarse grid (the land mesh is no finer out here)
  const grid = (P: Field, step: number) => {
    const nx = Math.max(1, Math.ceil((P.x1 - P.x0) / step)),
      ny = Math.max(1, Math.ceil((P.y1 - P.y0) / step));
    const g = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        fromField(P.x0 + ((P.x1 - P.x0) * i) / nx, P.y0 + ((P.y1 - P.y0) * j) / ny, w);
        g[j * (nx + 1) + i] = H(w.x, w.z);
      }
    return (fx: number, fy: number) => {
      const u = Math.min(nx - 1e-3, Math.max(0, ((fx - P.x0) / (P.x1 - P.x0)) * nx)),
        v = Math.min(ny - 1e-3, Math.max(0, ((fy - P.y0) / (P.y1 - P.y0)) * ny));
      const i = Math.floor(u),
        j = Math.floor(v);
      const a = g[j * (nx + 1) + i],
        b = g[j * (nx + 1) + i + 1],
        c = g[(j + 1) * (nx + 1) + i],
        d = g[(j + 1) * (nx + 1) + i + 1];
      return (a + (b - a) * (u - i)) * (1 - (v - j)) + (c + (d - c) * (u - i)) * (v - j);
    };
  };

  /** rows of a plot, same axis and phase as the land shader's (tr across, tl along) */
  const rowsOf = (P: Field, pitch: number, inset: number, sec: number, each: (f0x: number, f0y: number, f1x: number, f1y: number, s0: number, row: number) => void) => {
    const longX = P.x1 - P.x0 >= P.y1 - P.y0;
    const flip = hmix(P.pid, 19) >= 0.8;
    const alongX = flip ? !longX : longX; // true: rows at constant q.x, running along q.y (shader: along = 1)
    const t0 = (alongX ? P.x0 : P.y0) + inset,
      t1 = (alongX ? P.x1 : P.y1) - inset;
    const l0 = (alongX ? P.y0 : P.x0) + inset,
      l1 = (alongX ? P.y1 : P.x1) - inset;
    if (l1 - l0 < 8) return;
    for (let r = Math.ceil(t0 / pitch); r * pitch <= t1; r++) {
      const t = r * pitch;
      // row ends are not ruler-straight
      const a0 = l0 + hash2i(r, P.pid, 811) * 1.2,
        a1 = l1 - hash2i(r, P.pid, 812) * 1.2;
      const n = Math.max(1, Math.round((a1 - a0) / sec));
      for (let i = 0; i < n; i++) {
        const b0 = a0 + ((a1 - a0) * i) / n,
          b1 = a0 + ((a1 - a0) * (i + 1)) / n;
        if (alongX) each(t, b0, t, b1, b0, r);
        else each(b0, t, b1, t, b0, r);
      }
    }
  };

  const k0 = Math.floor(qy0 / FROW) - 1,
    k1 = Math.ceil(qy1 / FROW) + 1;
  for (let k = k0; k <= k1; k++) {
    const y0 = rowB(k),
      y1 = rowB(k + 1);
    const cw = colW(k),
      off = colOff(k);
    const j0 = Math.floor((qx0 - off) / cw) - 1,
      j1 = Math.ceil((qx1 - off) / cw) + 1;
    for (let j = j0; j <= j1; j++) {
      const xb = colB(k, j) + off;
      const cx = (xb + colB(k, j + 1) + off) / 2,
        cy = (y0 + y1) / 2;
      fromField(cx, cy, w);
      const sd = model.slabDist(w.x, w.z);
      if (sd > STONE_R + 300) continue;
      for (const P of fieldsOfParcel(cx, cy)) {
        const fcx = (P.x0 + P.x1) / 2,
          fcy = (P.y0 + P.y1) / 2;
        fromField(fcx, fcy, w);
        const wx = w.x,
          wz = w.z;
        const dS = model.slabDist(wx, wz);
        if (dS > STONE_R || dS < 8) continue;
        if (fieldW && !fieldW(P.pid, wx, wz)) continue;
        const y = model.height(wx, wz);
        if (!okAt(wx, wz, y)) continue;
        const ck = cropKind(P.crop, P.small, model.grazing(wx, wz), P.tun);
        const hillPasture = (ck === CK.pasture || ck === CK.hay) && y > 16;
        if (dS > FARM_R && !hillPasture) continue;
        // the corners must be fit for it too (a plot half in a wood or on a road keeps its paint only)
        let fit = true;
        for (const [ux, uy] of [
          [P.x0 + 3, P.y0 + 3],
          [P.x1 - 3, P.y0 + 3],
          [P.x0 + 3, P.y1 - 3],
          [P.x1 - 3, P.y1 - 3],
        ]) {
          fromField(ux, uy, w);
          if (!okAt(w.x, w.z, model.height(w.x, w.z), 1)) fit = false;
        }
        if (!fit) continue;
        const tone = 0.88 + 0.26 * hmix(P.pid, 23);
        const tilt = (hmix(P.pid, 24) - 0.5) * 0.14;
        const seg = (f0x: number, f0y: number, f1x: number, f1y: number) => {
          fromField(f0x, f0y, w);
          const ax = w.x,
            az = w.z;
          fromField(f1x, f1y, w);
          return [ax, az, w.x, w.z];
        };
        if (on.rows && (ck === CK.vine || ck === CK.maize || ck === CK.sunflower)) {
          const G = grid(P, 12);
          const nearRoad = model.road(wx, wz, rh, Math.hypot(P.x1 - P.x0, P.y1 - P.y0) * 0.5 + 12);
          const pitch = ck === CK.vine ? 3 : ck === CK.maize ? 1.9 : 1.7;
          const inset = ck === CK.vine ? 3.2 : 2.2;
          rowsOf(P, pitch, inset, ck === CK.vine ? 6.5 : 8, (f0x, f0y, f1x, f1y, s0, row) => {
            const [ax, az, bx, bz] = seg(f0x, f0y, f1x, f1y);
            if (model.siteAt((ax + bx) / 2, (az + bz) / 2, 3) >= 0) return;
            if (nearRoad && model.road((ax + bx) / 2, (az + bz) / 2, rh, 10) && rh.d < model.roads[rh.i].halfW + 2.5) return;
            const ya = G(f0x, f0y),
              yb = G(f1x, f1y);
            const var_ = 0.92 + 0.16 * hash2i(row, Math.floor(s0 / 11), 813);
            const tt = tone * var_;
            if (ck === CK.vine) {
              s.wall(B.vine, ax, ya, az, bx, yb, bz, s0 + row * 3.1, 1.75, tt, tt * (1 + tilt), tt * (1 - tilt));
              s.top(B.canopy, ax, ya, az, bx, yb, bz, s0 + row * 2.3, 1.62, 0.85, 0.76 * tt, 0.8 * tt, 0.66 * tt);
            } else if (ck === CK.maize) {
              const h0 = 2.0 + 0.42 * vnoise((ax + az) / 9, row * 0.37, 814),
                h1 = 2.0 + 0.42 * vnoise((bx + bz) / 9, row * 0.37, 814);
              s.wall(B.maize, ax, ya, az, bx, yb, bz, s0 + row * 5.7, h0 * 1.14, tt, tt, tt * 0.95, 0.5, 0.08, 1, h1 * 1.14);
              s.top(B.canopy, ax, ya, az, bx, yb, bz, s0 + row * 4.1, h0 * 0.95, 1.05, 0.62 * tt, 0.82 * tt, 0.66 * tt, h1 * 0.95);
            } else {
              s.wall(B.sunflower, ax, ya, az, bx, yb, bz, s0 + row * 4.9, 2.1, tt, tt, tt, 0.5);
              s.top(B.sunTop, ax, ya, az, bx, yb, bz, s0 + row * 3.3, 1.82, 1.3, tt, tt, tt);
            }
            st.rows += 4;
          });
        } else if (on.bales && (ck === CK.stubble || ck === CK.hay) && dS < FARM_R && hmix(P.pid, 71) < 0.72) {
          // round bales left on the windrow lines
          const G = grid(P, 14);
          const p0 = 14 + 10 * hmix(P.pid, 72);
          const wrap = hmix(P.pid, 73) < 0.14;
          let n = 0;
          rowsOf(P, p0, 7, 12 + 9 * hmix(P.pid, 74), (f0x, f0y, f1x, f1y) => {
            if (n > 26) return;
            const h = hash2i(Math.round(f0x), Math.round(f0y), 821);
            if (h < 0.25) return;
            const fx = f0x + (f1x - f0x) * h,
              fy = f0y + (f1y - f0y) * h;
            fromField(fx, fy, w);
            if (model.siteAt(w.x, w.z, 2) >= 0) return;
            bale(s, w.x, G(fx, fy), w.z, h * 7 + Math.atan2(f1y - f0y, f1x - f0x), wrap, tone);
            n++;
            st.bales += 28;
          });
        } else if (on.rows && ck === CK.veg && hmix(P.pid, 75) < 0.3 && P.x1 - P.x0 > 18 && P.y1 - P.y0 > 18) {
          // a block of polytunnels on a market garden
          const G = grid(P, 14);
          const longX = P.x1 - P.x0 >= P.y1 - P.y0;
          const tw = 7.6;
          const t0 = (longX ? P.y0 : P.x0) + 4,
            t1 = (longX ? P.y1 : P.x1) - 4;
          const l0 = (longX ? P.x0 : P.y0) + 4,
            l1 = (longX ? P.x1 : P.y1) - 4;
          for (let t = t0 + tw / 2; t + tw / 2 <= t1; t += tw) {
            const [ax, az, bx, bz] = longX ? seg(l0, t, l1, t) : seg(t, l0, t, l1);
            const ya = longX ? G(l0, t) : G(t, l0),
              yb = longX ? G(l1, t) : G(t, l1);
            st.tunnels += tunnel(s, ax, ya, az, bx, yb, bz, 3.0, 2.7);
          }
        } else if (on.fences && ck === CK.pasture && dS < FARM_R && hmix(P.pid, 76) < 0.7) {
          // wire fence round the pasture, a gap for the gate
          const G = grid(P, 14);
          const gx = hmix(P.pid, 77);
          st.fences += fenceRect(s, P, seg, G, B.wire, 1.3, 1.1, gx, 0.92);
        } else if (on.fences && hillPasture && hmix(P.pid, 78) < 0.55) {
          const G = grid(P, 16);
          st.stone += fenceRect(s, P, seg, G, B.stone, 1.15, 0.5, hmix(P.pid, 79), 1);
        }
      }
    }
  }

  // ── hedges: a wall each side and a ragged top; a run breaks where the hedge has a gap
  if (hedges) {
    for (const r of hedges.runs) {
      if (r.x.length < 7) continue; // a stub of hedge is a box
      const stepN = 2; // two points ≈ 5.4 m
      const endK = (i: number) => Math.min(1, (0.35 + Math.min(i, r.x.length - 1 - i) * 0.3)); // the ends sink away
      let s0 = r.tone * 31;
      const gt = 0.96 + 0.2 * r.tone;
      const tg = (r.tone - 0.5) * 0.16;
      for (let i = 0; i + stepN < r.x.length + stepN - 1; i += stepN) {
        const e = Math.min(r.x.length - 1, i + stepN);
        if (e === i) break;
        const ax = r.x[i],
          az = r.z[i],
          bx = r.x[e],
          bz = r.z[e];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / len,
          nz = (bx - ax) / len;
        const ya = r.y[i] + GROUND_DROP,
          yb = r.y[e] + GROUND_DROP;
        // the top billows (shared heights along the run), the two faces wander apart
        const hgtAt = (u: number) => 1.5 + 2.3 * vnoise(u / 13 + r.tone * 40, r.tone * 9, 834) + 1.2 * vnoise(u / 4.7, r.tone * 17, 835);
        const hh = hgtAt(s0) * endK(i),
          hh1 = hgtAt(s0 + len) * endK(e);
        const offAt = (u: number) => 0.42 + 0.5 * vnoise(u / 6.1, r.tone * 23, 833);
        const o0 = offAt(s0),
          o1 = offAt(s0 + len);
        s.wall(B.hedge, ax + nx * o0, ya, az + nz * o0, bx + nx * o1, yb, bz + nz * o1, s0, hh, gt, gt * (1 + tg), gt * (1 - tg), 0.5, 0.12, 0, hh1);
        s.wall(B.hedge, ax - nx * o0, ya, az - nz * o0, bx - nx * o1, yb, bz - nz * o1, s0 + 7.3, hh * 0.94, gt, gt * (1 + tg), gt * (1 - tg), 0.5, 0.12, 0, hh1 * 0.94);
        s.top(B.canopy, ax, ya, az, bx, yb, bz, s0 + 2.1, hh * 0.72, o0 + o1 + 0.5, 0.72 * gt, (0.78 + tg) * gt, 0.6 * gt, hh1 * 0.72);
        s0 += len;
        st.hedges += 6;
      }
    }
  }

  // ── reed beds and bank scrub along the river outside the slab
  if (on.reeds) {
    const L = model.riverLine;
    const p = { x: 0, z: 0 },
      p2 = { x: 0, z: 0 };
    const stepS = 3.6;
    for (let si = 6; si * stepS < Math.min(L.length, 2200); si++) {
      const sa = si * stepS;
      for (const side of [-1, 1]) {
        const g = vnoise(sa / 46, side * 3.1, 871);
        if (g < 0.46 || hash2i(si, side, 874) < 0.3) continue;
        L.at(sa, p);
        L.at(sa + stepS, p2);
        const tx = p2.x - p.x,
          tz = p2.z - p.z;
        const tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl,
          nz = tx / tl;
        const halfW = 8 + 5.5 * smooth(0, 420, sa) - 3.5 * smooth(2600, 6000, sa);
        // clumps at all angles across the waterline: a bed from any side, never one straight palisade
        const n = 1 + Math.floor(hash2i(si, side, 875) * 2.2);
        for (let row = 0; row < n; row++) {
          const off = halfW - 0.6 + 3.4 * hash2i(si * 3 + row, side, 876);
          const cx = p.x + nx * off * side + (tx / tl) * stepS * hash2i(si, row, 877),
            cz = p.z + nz * off * side + (tz / tl) * stepS * hash2i(si, row, 878);
          if (model.slabDist(cx, cz) < 2) continue;
          const ang = Math.atan2(tz, tx) + (hash2i(si * 5 + row, side, 879) - 0.5) * 2.2;
          const ll = 1.7 + 2.1 * hash2i(si * 7 + row, side, 880);
          const ax = cx - Math.cos(ang) * ll,
            az = cz - Math.sin(ang) * ll,
            bx = cx + Math.cos(ang) * ll,
            bz = cz + Math.sin(ang) * ll;
          const ya = Math.max(WL + 0.03, H(ax, az)),
            yb = Math.max(WL + 0.03, H(bx, bz));
          const tt = 0.84 + 0.3 * vnoise(sa / 30, side * row, 873);
          const hh = (1.25 + 1.0 * hash2i(si, row, 882)) * (0.8 + 0.3 * g);
          s.wall(B.reed, ax, ya, az, bx, yb, bz, sa * 1.7 + row * 9 + side * 31, hh, tt, tt, tt * 0.92, 0.55, 0.12);
          st.reeds += 2;
        }
      }
    }
  }

  // ── dunes south of the town: marram clumps, chestnut-paling sand fences along the fore-dune
  if (on.dunes) {
    const L = model.coastLine;
    const p = { x: 0, z: 0 },
      p2 = { x: 0, z: 0 };
    // find the coast's arc length at the slab's south corner, then walk south
    let s0 = 0;
    for (let a = 0; a < L.length; a += 8) {
      L.at(a, p);
      if (p.z > 152) {
        s0 = a;
        break;
      }
    }
    const stepS = 8;
    const cov = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
    for (let a = s0; a < s0 + 760; a += stepS) {
      L.at(a, p);
      L.at(a + stepS, p2);
      const tx = p2.x - p.x,
        tz = p2.z - p.z;
      const tl = Math.hypot(tx, tz) || 1;
      // land is on the west side: rotate the tangent toward −x
      let nx = -tz / tl,
        nz = tx / tl;
      if (nx > 0) {
        nx = -nx;
        nz = -nz;
      }
      if (model.cliffness(p.x, p.z) > 0.4) continue;
      // fence lines at the dune foot, in lengths with gaps; bleached, half buried
      const fg = vnoise(a / 60, 2.1, 881);
      if (fg > 0.36) {
        for (const off of [33, 52]) {
          if (off === 52 && fg < 0.58) continue;
          const wob = 3 * vnoise(a / 40, off, 882),
            wob2 = 3 * vnoise((a + stepS) / 40, off, 882);
          const ax = p.x + nx * (off + wob),
            az = p.z + nz * (off + wob);
          const bx = p2.x + nx * (off + wob2),
            bz = p2.z + nz * (off + wob2);
          s.wall(B.sandfence, ax, H(ax, az), az, bx, H(bx, bz), bz, a * 1.03, 1.25, 1, 0.98, 0.94, 0.8, 0.22, 0);
          st.dune += 2;
        }
      }
      // marram clumps: short crossed strips, densest on the back-dune
      for (let i = 0; i < 16; i++) {
        const off = 22 + 62 * Math.pow(hash2i(Math.round(a), i, 883), 0.8);
        if (vnoise((p.x + nx * off) / 13, (p.z + nz * off) / 13, 884) < 0.42 + 0.14 * smooth(70, 30, off)) continue;
        const along = hash2i(Math.round(a), i, 885) * stepS;
        const x = p.x + nx * off + (tx / tl) * along,
          z = p.z + nz * off + (tz / tl) * along;
        const y = H(x, z);
        if (y < WL + 0.8) continue;
        // on the dune, never in a plot behind it
        model.cover(x, z, cov, y);
        if (cov.sand < 0.1 || cov.field > 0.25) continue;
        const ang = hash2i(Math.round(a), i, 886) * 6.283;
        const ll = 1.1 + 1.5 * hash2i(Math.round(a), i, 887);
        const cc = Math.cos(ang) * ll,
          ss = Math.sin(ang) * ll;
        const hh = 0.62 + 0.42 * hash2i(Math.round(a), i, 888);
        const tt = 0.86 + 0.3 * hash2i(Math.round(a), i, 889);
        s.wall(B.marram, x - cc, y, z - ss, x + cc, y, z + ss, a + i, hh, tt, tt, tt, 0.7, 0.05);
        s.wall(B.marram, x + ss, y, z - cc, x - ss, y, z + cc, a + i + 3, hh, tt, tt, tt, 0.7, 0.05);
        st.dune += 4;
      }
    }
  }
  // ── duckboards through the dunes to the sand, boats hauled up above the tide line
  if (on.dunes) {
    const L = model.coastLine;
    const p = { x: 0, z: 0 },
      p2 = { x: 0, z: 0 };
    let s0 = 0;
    for (let a = 0; a < L.length; a += 8) {
      L.at(a, p);
      if (p.z > 152) {
        s0 = a;
        break;
      }
    }
    for (const [a, kind] of [
      [60, 0],
      [165, 1],
      [260, 0],
      [395, 1],
      [520, 0],
    ] as [number, number][]) {
      L.at(s0 + a, p);
      L.at(s0 + a + 4, p2);
      const tx = p2.x - p.x,
        tz = p2.z - p.z;
      const tl = Math.hypot(tx, tz) || 1;
      let nx = -tz / tl,
        nz = tx / tl;
      if (nx > 0) {
        nx = -nx;
        nz = -nz;
      }
      if (model.cliffness(p.x, p.z) > 0.4) continue;
      // the walk runs from the rough grazing down to the upper beach, wandering a little
      let px = 0,
        pz = 0,
        py = 0,
        run = 0;
      for (let d = 96; d >= 20; d -= 3.2) {
        const side = 5 * Math.sin(d / 17 + a);
        const x = p.x + nx * d + (tx / tl) * side,
          z = p.z + nz * d + (tz / tl) * side;
        const y = H(x, z) + 0.16;
        if (d < 96) {
          const len = Math.hypot(x - px, z - pz) || 1;
          const wx = -(z - pz) / len,
            wz = (x - px) / len;
          // planks are the solid band's streaks, grey, salt-bleached
          const hw = 0.85;
          const t = 0.48 + 0.14 * hash2i(Math.round(d), Math.round(a), 895);
          s.solid(
            B.solid,
            x,
            z,
            [px + wx * hw, py, pz + wz * hw, 0, 1, 0, run / 4, 0, px - wx * hw, py, pz - wz * hw, 0, 1, 0, run / 4, 1, x - wx * hw, y, z - wz * hw, 0, 1, 0, (run + len) / 4, 1, x + wx * hw, y, z + wz * hw, 0, 1, 0, (run + len) / 4, 0],
            [0, 2, 1, 0, 3, 2],
            t,
            t * 0.96,
            t * 0.88,
          );
          st.dune += 2;
          run += len;
        }
        px = x;
        pz = z;
        py = y;
      }
      // a pair of beach boats near every other walk
      if (kind) {
        for (let b = 0; b < 3; b++) {
          const off = 15 + 7 * hash2i(b, Math.round(a), 896);
          const al = (b - 1) * 7 + 4 * hash2i(b, Math.round(a), 897);
          const x = p.x + nx * off + (tx / tl) * al,
            z = p.z + nz * off + (tz / tl) * al;
          boat(s, x, H(x, z), z, Math.atan2(nx, nz) + (hash2i(b, Math.round(a), 898) - 0.5) * 0.7, hash2i(b, Math.round(a), 899));
          st.dune += 40;
        }
      }
    }
  }

  // ── olive terraces: dry-stone walls along the contour round the hill towns
  if (on.fences) {
    for (const site of model.sites) {
      if (!site.town) continue;
      for (let ring = 0; ring < 4; ring++) {
        const R = site.r * (1.14 + ring * 0.2);
        const N = Math.round((R * 6.283) / 11);
        let s0 = 0;
        for (let i = 0; i < N; i++) {
          if (vnoise(i / 5, ring * 7.3 + site.seed, 891) < 0.32) continue;
          const a0 = (i / N) * 6.283,
            a1 = ((i + 1) / N) * 6.283;
          const wob = (a: number) => R * (1 + 0.1 * Math.sin(a * 3 + site.seed + ring) + 0.05 * Math.sin(a * 7 + ring * 2));
          const ax = site.x + Math.cos(a0) * wob(a0),
            az = site.z + Math.sin(a0) * wob(a0),
            bx = site.x + Math.cos(a1) * wob(a1),
            bz = site.z + Math.sin(a1) * wob(a1);
          s.wall(B.stone, ax, H(ax, az), az, bx, H(bx, bz), bz, s0, 1.5, 1, 0.97, 0.92, 0.8, 0.06, 0);
          st.stone += 2;
          s0 += 11;
        }
      }
    }
  }
  return st;
}

/** a small open boat on the sand: painted strakes, dark inside, a thwart; leaning on its bilge */
function boat(s: RowSink, x: number, y: number, z: number, yaw: number, h: number): void {
  const L = 2.3,
    W = 0.78,
    D = 0.62;
  const c = Math.cos(yaw),
    sn = Math.sin(yaw);
  const heel = 0.16 * (h - 0.5);
  const verts: number[] = [];
  const tris: number[] = [];
  const P = (u: number, v: number, w: number): [number, number, number] => {
    const vv = v * Math.cos(heel) - w * Math.sin(heel),
      ww = v * Math.sin(heel) + w * Math.cos(heel);
    return [x + vv * c + u * sn, y + ww + 0.28, z - vv * sn + u * c];
  };
  // hull sections along the keel: half width and sheer rise at each station (a pointed bow, a fuller stern)
  const N = 10;
  const sec = (t: number): [number, number] => {
    const a = t * 2 - 1;
    const f = a > 0 ? 1 - Math.pow(a, 1.7) : 1 - Math.pow(-a, 3.2) * 0.72;
    return [W * Math.pow(Math.max(0, f), 0.62), D * 0.45 + 0.34 * a * a];
  };
  const put = (p: [number, number, number], nx: number, ny: number, nz: number, u: number, t: number) => {
    const wx = nx * c + nz * sn,
      wz = -nx * sn + nz * c;
    verts.push(p[0], p[1], p[2], wx, ny, wz, u, t);
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [w, top] = sec(t);
    const u = (t - 0.5) * 2 * L;
    put(P(u, 0, -D * 0.2), 0, -1, 0, t, 0.1);
    put(P(u, w * 0.78, top * 0.25 - D * 0.08), 0.75, -0.65, 0, t, 0.3);
    put(P(u, -w * 0.78, top * 0.25 - D * 0.08), -0.75, -0.65, 0, t, 0.3);
    put(P(u, w, top), 0.98, 0.2, 0, t, 0.5);
    put(P(u, -w, top), -0.98, 0.2, 0, t, 0.5);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 5;
    tris.push(a, a + 5, a + 6, a, a + 6, a + 1);
    tris.push(a + 1, a + 6, a + 8, a + 1, a + 8, a + 3);
    tris.push(a, a + 2, a + 7, a, a + 7, a + 5);
    tris.push(a + 2, a + 4, a + 9, a + 2, a + 9, a + 7);
  }
  const k = h < 0.34 ? [0.62, 0.66, 0.68] : h < 0.67 ? [0.12, 0.26, 0.4] : [0.5, 0.17, 0.11];
  s.solid(B.solid, x, z, verts, tris, k[0], k[1], k[2]);
  // the dark inside + the thwart (a flat lid just below the sheer)
  const lv: number[] = [];
  const lt: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [w, top] = sec(t);
    const u = (t - 0.5) * 2 * L;
    const a = P(u, w * 0.92, top - 0.1),
      b = P(u, -w * 0.92, top - 0.1);
    lv.push(a[0], a[1], a[2], 0, 1, 0, t, 0.5, b[0], b[1], b[2], 0, 1, 0, t, 0.5);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    lt.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
  s.solid(B.solid, x, z, lv, lt, 0.16, 0.13, 0.11);
  // gunwale and two thwarts: the pale timber that makes it a boat from close by
  const rail = (ax: [number, number, number], bx: [number, number, number], r: number, t: number) => {
    const dx = bx[0] - ax[0],
      dz = bx[2] - ax[2];
    const dl = Math.hypot(dx, dz) || 1;
    const qx = (-dz / dl) * r,
      qz = (dx / dl) * r;
    s.solid(
      B.solid,
      x,
      z,
      [ax[0] - qx, ax[1] + 0.02, ax[2] - qz, 0, 1, 0, 0.5, 0.4, ax[0] + qx, ax[1] + 0.02, ax[2] + qz, 0, 1, 0, 0.5, 0.4, bx[0] + qx, bx[1] + 0.02, bx[2] + qz, 0, 1, 0, 0.5, 0.4, bx[0] - qx, bx[1] + 0.02, bx[2] - qz, 0, 1, 0, 0.5, 0.4],
      [0, 1, 2, 0, 2, 3],
      t,
      t * 0.92,
      t * 0.8,
    );
  };
  for (let i = 0; i < N; i++) {
    const t0 = i / N,
      t1 = (i + 1) / N;
    const [w0, h0] = sec(t0),
      [w1, h1] = sec(t1);
    const u0 = (t0 - 0.5) * 2 * L,
      u1 = (t1 - 0.5) * 2 * L;
    rail(P(u0, w0, h0), P(u1, w1, h1), 0.035, 0.55);
    rail(P(u0, -w0, h0), P(u1, -w1, h1), 0.035, 0.55);
  }
  for (const t of [0.34, 0.6]) {
    const [w, top] = sec(t);
    const u = (t - 0.5) * 2 * L;
    rail(P(u, w * 0.94, top - 0.07), P(u, -w * 0.94, top - 0.07), 0.09, 0.5);
  }
}

/** a round bale lying on its side (8-sided, smooth) */
function bale(s: RowSink, x: number, y: number, z: number, yaw: number, wrap: boolean, tone: number): void {
  const R = 0.72,
    Hb = 1.25;
  const c = Math.cos(yaw),
    sn = Math.sin(yaw);
  const verts: number[] = [];
  const tris: number[] = [];
  const N = 8;
  const put = (ax: number, ay: number, az: number, nx: number, ny: number, nz: number, u: number, t: number) => {
    verts.push(x + ax * c + az * sn, y + ay, z - ax * sn + az * c, nx * c + nz * sn, ny, -nx * sn + nz * c, u, t);
  };
  for (const side of [-1, 1])
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 6.283;
      const cy = Math.cos(a),
        sz = Math.sin(a);
      put((side * Hb) / 2, R + cy * R, sz * R, 0, cy, sz, i / N, side * 0.5 + 0.5);
    }
  for (let i = 0; i < N; i++) {
    const a = i,
      b = i + 1,
      d = i + N + 1,
      e = i + N + 2;
    tris.push(a, d, e, a, e, b);
  }
  // caps
  const base = verts.length / 8;
  for (const side of [-1, 1]) {
    const o = verts.length / 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.283;
      put((side * Hb) / 2, R + Math.cos(a) * R, Math.sin(a) * R, side, 0, 0, Math.cos(a) * 0.03 + 0.5, Math.sin(a) * 0.45 + 0.5);
    }
    for (let i = 1; i < N - 1; i++) {
      if (side > 0) tris.push(o, o + i, o + i + 1);
      else tris.push(o, o + i + 1, o + i);
    }
  }
  void base;
  if (wrap) s.solid(B.solid, x, z, verts, tris, 0.04, 0.05, 0.045);
  else s.solid(B.straw, x, z, verts, tris, tone, tone * 0.98, tone * 0.92);
}

/** half-cylinder polytunnel from (ax, az) to (bx, bz) */
function tunnel(s: RowSink, ax: number, ya: number, az: number, bx: number, yb: number, bz: number, hw: number, hh: number): number {
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const nx = -(bz - az) / len,
    nz = (bx - ax) / len;
  const verts: number[] = [];
  const tris: number[] = [];
  const N = 8;
  const tile = 8 * 3.2;
  const ends: [number, number, number, number][] = [
    [ax, ya, az, 0],
    [bx, yb, bz, len / tile],
  ];
  for (const [x, y, z, u] of ends)
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI;
      const c = Math.cos(a),
        sn = Math.sin(a);
      verts.push(x + nx * c * hw, y - 0.05 + sn * hh, z + nz * c * hw, nx * c, sn, nz * c, u, i / N);
    }
  for (let i = 0; i < N; i++) tris.push(i, i + N + 1, i + N + 2, i, i + N + 2, i + 1);
  // the gable ends
  for (const [e, flip] of [
    [0, 1],
    [1, 0],
  ] as const) {
    const [x, y, z] = ends[e];
    const o = verts.length / 8;
    const tx = ((bx - ax) / len) * (e ? 1 : -1),
      tz = ((bz - az) / len) * (e ? 1 : -1);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI;
      verts.push(x + nx * Math.cos(a) * hw, y - 0.05 + Math.sin(a) * hh, z + nz * Math.cos(a) * hw, tx, 0, tz, 0.02 + (i / N) * 0.1, Math.sin(a) * 0.8);
    }
    for (let i = 1; i < N; i++) {
      if (flip) tris.push(o, o + i, o + i + 1);
      else tris.push(o, o + i + 1, o + i);
    }
  }
  s.solid(B.plastic, (ax + bx) / 2, (az + bz) / 2, verts, tris, 0.82, 0.86, 0.84);
  return tris.length / 3;
}

/** a fence or wall on the rectangle of a plot (inset), with a gap for the gate on one side */
function fenceRect(
  s: RowSink,
  P: Field,
  seg: (a: number, b: number, c: number, d: number) => number[],
  G: (fx: number, fy: number) => number,
  band: number,
  hh: number,
  inset: number,
  gatePos: number,
  shade: number,
): number {
  let tris = 0;
  const x0 = P.x0 + inset,
    x1 = P.x1 - inset,
    y0 = P.y0 + inset,
    y1 = P.y1 - inset;
  const sides: [number, number, number, number][] = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
  const gateSide = Math.floor(gatePos * 4) & 3;
  let run = 0;
  sides.forEach(([ax, ay, bx, by], e) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / 9));
    for (let i = 0; i < n; i++) {
      const a = i / n,
        b = (i + 1) / n;
      if (e === gateSide && Math.abs((a + b) / 2 - (0.3 + 0.4 * gatePos)) < 0.5 / n) {
        run += len / n;
        continue;
      }
      const fax = ax + (bx - ax) * a,
        fay = ay + (by - ay) * a,
        fbx = ax + (bx - ax) * b,
        fby = ay + (by - ay) * b;
      const [wax, waz, wbx, wbz] = seg(fax, fay, fbx, fby);
      s.wall(band, wax, G(fax, fay), waz, wbx, G(fbx, fby), wbz, run, hh, shade, shade, shade, 0.8, 0.06, 0);
      run += len / n;
      tris += 2;
    }
  });
  return tris;
}
