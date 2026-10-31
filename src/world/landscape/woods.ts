// What stands under the trees and along the old banks: ferns and brambles in clumps, hazel, fallen logs and stumps, mossy
// boulders in the woods within reach of the camera, boulders along the river. All in the farm kit (rows.ts), near the
// town only: from the air the crowns hide all of it, from the path it is what makes a wood a wood.

import { SLAB } from '../../core/constants';
import { WL, type LandscapeModel } from './model';
import { RowSink, B } from './rows';
import { GROUND_DROP } from '../terrain/height';
import { hash2i, vnoise } from './noise';

/** how far from the slab undergrowth is planted (the free camera's reach at eye level) */
const UNDER_R = 420;
const LATTICE = 5.5;
const CAP = 9000;

/** a lying log: an n-sided prism with a rough top colour; bark on the sides, a pale sawn or broken end */
function log(s: RowSink, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, c: [number, number, number], cx: number, cz: number): void {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const l = Math.hypot(dx, dy, dz) || 1;
  // a frame round the log (horizontal side vector, then up-ish)
  const hl = Math.hypot(dx, dz) || 1;
  const ux = dz / hl,
    uz = -dx / hl;
  const vx = -(uz * dy) / l,
    vy = (uz * dx - ux * dz) / l,
    vz = (ux * dy) / l;
  const verts: number[] = [];
  const tris: number[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 6.283;
    const nx = ux * Math.cos(a) + vx * Math.sin(a),
      ny = vy * Math.sin(a),
      nz = uz * Math.cos(a) + vz * Math.sin(a);
    verts.push(ax + nx * r, ay + ny * r, az + nz * r, nx, ny, nz, 0.5, 0.4);
    verts.push(bx + nx * r * 0.72, by + ny * r * 0.72, bz + nz * r * 0.72, nx, ny, nz, 0.5, 0.4);
  }
  for (let i = 0; i < N; i++) {
    const p = i * 2,
      q = i * 2 + 1,
      d = ((i + 1) % N) * 2,
      e = ((i + 1) % N) * 2 + 1;
    tris.push(p, d, e, p, e, q);
  }
  s.solid(B.solid, cx, cz, verts, tris, c[0], c[1], c[2]);
  // the two ends
  for (const [ex, ey, ez, er, sg] of [
    [ax, ay, az, r, -1],
    [bx, by, bz, r * 0.72, 1],
  ] as const) {
    const ev: number[] = [];
    const et: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.283;
      ev.push(ex + (ux * Math.cos(a) + vx * Math.sin(a)) * er, ey + vy * Math.sin(a) * er, ez + (uz * Math.cos(a) + vz * Math.sin(a)) * er, (dx / l) * sg, (dy / l) * sg, (dz / l) * sg, 0.5, 0.4);
    }
    for (let i = 1; i + 1 < N; i++) et.push(0, i, i + 1);
    s.solid(B.solid, cx, cz, ev, et, 0.48, 0.38, 0.25);
  }
}

/** a boulder: a squashed, dented icosahedron, 20 facets; flat shaded by per-face normals */
const ICO: number[][] = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  return [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
})();
const ICO_F = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];

export function boulder(s: RowSink, x: number, y: number, z: number, r: number, squash: number, key: number, c: [number, number, number], moss: number): void {
  const P = ICO.map((v, i) => {
    const k = 0.72 + 0.56 * hash2i(key, i, 811);
    return [x + v[0] * r * k, y + v[1] * r * k * squash, z + v[2] * r * k];
  });
  // colour per boulder only (one RGB a solid() call): moss goes on the upper facets as a second call
  const lo: number[] = [];
  const hi: number[] = [];
  for (let f = 0; f < ICO_F.length; f += 3) {
    const a = P[ICO_F[f]],
      b = P[ICO_F[f + 1]],
      d = P[ICO_F[f + 2]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1],
      ny = e1[2] * e2[0] - e1[0] * e2[2],
      nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const up = moss > 0 && ny > 0.55;
    const arr = up ? hi : lo;
    arr.push(a[0], a[1], a[2], nx, ny, nz, 0.5, 0.4, b[0], b[1], b[2], nx, ny, nz, 0.5, 0.4, d[0], d[1], d[2], nx, ny, nz, 0.5, 0.4);
  }
  const idx = (arr: number[]) => {
    const t: number[] = [];
    for (let i = 0; i < arr.length / 8; i++) t.push(i);
    return t;
  };
  if (lo.length) s.solid(B.solid, x, z, lo, idx(lo), c[0], c[1], c[2]);
  if (hi.length) s.solid(B.solid, x, z, hi, idx(hi), c[0] * (1 - moss) + 0.16 * moss, c[1] * (1 - moss) + 0.24 * moss, c[2] * (1 - moss) + 0.08 * moss);
}

/** cut-out strips over the west edge's untrimmed hedge (vegetation.ts draws its core and leaf cards): the outline and the leaf */
export function buildEdgeHedge(s: RowSink, hedgeX: number, runs: [number, number][]): void {
  for (const [z0, z1] of runs) {
    for (const side of [-1, 1]) {
      let px = 0;
      let ph = 0;
      for (let z = z0, k = 0; z < z1 - 0.2; k++) {
        const z2 = Math.min(z1, z + 1.6 + 1.2 * hash2i(k, side, 841));
        const x = hedgeX + side * (0.72 + 0.26 * hash2i(k, side, 842));
        const h = 2.2 + 1.0 * hash2i(k, side, 843);
        if (k > 0) {
          const tt = 0.72 + 0.2 * hash2i(k, side, 844);
          s.wall(B.hedge, px, 0, z, x, 0, z2, z * 1.1 + side * 7, ph, tt, tt * 0.96, tt * 0.8, 0.5, 0.05, 0, h);
        }
        px = x;
        ph = h;
        z = z2;
      }
    }
  }
}

/** river boulders and shoulders of rock where the bank is outside the town: rounded, wet-dark at the foot */
export function buildRiverRocks(s: RowSink, model: LandscapeModel): void {
  const H = (x: number, z: number) => model.height(x, z) + GROUND_DROP;
  const L = model.riverLine;
  const p = { x: 0, z: 0 },
    p2 = { x: 0, z: 0 };
  const rv = { d: 0, halfW: 0, s: 0, tx: 0, tz: 0 };
  for (let sa = 4; sa < Math.min(L.length, 2200); sa += 7) {
    const key = Math.round(sa);
    if (hash2i(key, 3, 851) > 0.34) continue;
    L.at(sa, p);
    L.at(sa + 2, p2);
    const tl = Math.hypot(p2.x - p.x, p2.z - p.z) || 1;
    const nx = -(p2.z - p.z) / tl,
      nz = (p2.x - p.x) / tl;
    if (!model.river(p.x, p.z, rv)) continue;
    const side = hash2i(key, 4, 852) < 0.5 ? -1 : 1;
    const off = rv.halfW + (hash2i(key, 5, 853) - 0.6) * 4;
    const x = p.x + nx * off * side,
      z = p.z + nz * off * side;
    if (model.slabDist(x, z) < 6) continue;
    const y = Math.max(H(x, z), WL - 0.25);
    const n = 1 + Math.floor(hash2i(key, 6, 854) * 3);
    for (let k = 0; k < n; k++) {
      const a = hash2i(key, 7 + k, 855) * 6.283;
      const d = k * 0.9;
      const r = (0.28 + 0.8 * hash2i(key, 12 + k, 856) * hash2i(key, 17 + k, 857)) * (k ? 0.75 : 1);
      const t = hash2i(key, 22 + k, 858);
      boulder(s, x + Math.cos(a) * d, y + r * 0.12, z + Math.sin(a) * d, r, 0.62, key * 31 + k, [0.32 + 0.08 * t, 0.3 + 0.07 * t, 0.26 + 0.06 * t], y > WL + 0.25 ? 0.45 : 0);
    }
  }
}

export interface WoodsStats {
  ferns: number;
  shrubs: number;
  logs: number;
  rocks: number;
}

/** undergrowth, logs, stumps and boulders on a jittered lattice inside the woods near the slab */
export function buildWoods(s: RowSink, model: LandscapeModel): WoodsStats {
  const H = (x: number, z: number) => model.height(x, z) + GROUND_DROP;
  const st: WoodsStats = { ferns: 0, shrubs: 0, logs: 0, rocks: 0 };
  const cov = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
  const X0 = SLAB.x0 - UNDER_R,
    X1 = SLAB.x1 + UNDER_R,
    Z0 = SLAB.z0 - UNDER_R,
    Z1 = SLAB.z1 + UNDER_R;
  let n = 0;
  for (let gz = Z0; gz < Z1 && n < CAP; gz += LATTICE) {
    for (let gx = X0; gx < X1 && n < CAP; gx += LATTICE) {
      const i = Math.round(gx / LATTICE),
        j = Math.round(gz / LATTICE);
      const x = gx + (hash2i(i, j, 821) - 0.5) * LATTICE,
        z = gz + (hash2i(i, j, 822) - 0.5) * LATTICE;
      if (model.slabDist(x, z) < 2) continue;
      const y = H(x, z);
      if (y < WL + 0.4) continue;
      model.cover(x, z, cov, y - GROUND_DROP);
      if (cov.forest < 0.45 || cov.water > 0 || cov.sand > 0.2) continue;
      if (model.siteAt(x, z, 1) >= 0) continue;
      const pick = hash2i(i, j, 823);
      const patch = vnoise(x * 0.035, z * 0.035, 824);
      const tone = hash2i(i, j, 825);
      if (pick < 0.012) {
        // a fallen trunk, half a stump's height off the ground at the root end
        const a = hash2i(i, j, 826) * 6.283;
        const L = 3.5 + 6 * hash2i(i, j, 827);
        const bx = x + Math.cos(a) * L,
          bz = z + Math.sin(a) * L;
        const r = 0.14 + 0.16 * hash2i(i, j, 828);
        log(s, x, y + r * 0.8, z, bx, H(bx, bz) + r * 0.55, bz, r, [0.2 + 0.06 * tone, 0.17 + 0.06 * tone, 0.11], x, z);
        st.logs++;
        n++;
      } else if (pick < 0.024) {
        // a stump
        const r = 0.2 + 0.2 * tone;
        log(s, x, y - 0.1, z, x + 0.02, y + 0.28 + 0.35 * hash2i(i, j, 829), z + 0.01, r, [0.22, 0.18, 0.12], x, z);
        st.logs++;
        n++;
      } else if (pick < 0.05) {
        const r = 0.3 + 0.9 * hash2i(i, j, 830) * hash2i(i, j, 831);
        boulder(s, x, y + r * 0.1, z, r, 0.66, i * 31 + j, [0.3 + 0.06 * tone, 0.29 + 0.06 * tone, 0.26 + 0.05 * tone], 0.75);
        st.rocks++;
        n++;
      } else if (pick < 0.2 + 0.14 * patch) {
        // hazel / young growth: two crossed strips, the hedge band read as a loose shrub
        const a = hash2i(i, j, 832) * 3.14;
        const w = 0.8 + 0.8 * hash2i(i, j, 833);
        const hh = 1.5 + 1.6 * hash2i(i, j, 834);
        const k = 1.15 + 0.55 * tone;
        const s0 = (i * 7 + j * 3) % 24;
        for (const da of [0, 1.45]) {
          const cx = Math.cos(a + da) * w,
            cz = Math.sin(a + da) * w;
          s.wall(B.hedge, x - cx, H(x - cx, z - cz), z - cz, x, y, z, s0, hh * 0.6, k, k, k * 0.9, 0.6, 0.05, 0.5, hh);
          s.wall(B.hedge, x, y, z, x + cx, H(x + cx, z + cz), z + cz, s0 + w, hh, k, k, k * 0.9, 0.6, 0.05, 0.5, hh * 0.6);
        }
        st.shrubs++;
        n++;
      } else if (patch > 0.44 || pick > 0.88) {
        // bracken and bramble mounds in drifts
        const a = hash2i(i, j, 835) * 3.14;
        const w = 0.55 + 0.55 * hash2i(i, j, 836);
        const hh = 0.5 + 0.4 * patch + 0.2 * tone;
        const k = 0.72 + 0.34 * tone;
        const s0 = (i * 11 + j * 5) % 12;
        for (const da of [0, 2.05]) {
          const cx = Math.cos(a + da) * w,
            cz = Math.sin(a + da) * w;
          // a mound: nothing at the ends, its full height in the middle
          s.wall(B.fern, x - cx, H(x - cx, z - cz), z - cz, x, y, z, s0, hh * 0.16, k, k, k, 0.7, 0.03, 0.35, hh);
          s.wall(B.fern, x, y, z, x + cx, H(x + cx, z + cz), z + cz, s0 + w, hh, k, k, k, 0.7, 0.03, 0.35, hh * 0.16);
        }
        st.ferns++;
        n++;
      }
    }
  }
  return st;
}
