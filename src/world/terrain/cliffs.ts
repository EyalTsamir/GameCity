// Rock cliffs on the steep terrain faces: the ridge escarpment behind the station / industry /
// harbour, the two spur noses and the harbour cliff. The heightfield there is a smooth S-curve
// (it read as a flat painted wall); this dresses it with a stratified, faceted rock skin:
//   * horizontal strata, continuous along a face and gently dipping, 0.8–2.1 m thick;
//   * every stratum is split into blocks (2–4 columns) with their own protrusion, so joints,
//     recesses and proud slabs break the face up; flat-shaded facets with random diagonals;
//   * each block bulges out (a shadowed crease under it), then rounds back to a lip: the lip and
//     the horizontal top form a ledge that catches moss / grass in the shader;
//   * scree stones at the foot (the ground shader adds a gravel apron from cliffFeet()).
//
// Geometry only ever sits ON the existing face — terrain heights are untouched. Every vertex is
// the ground point at its height pushed horizontally outward by D (D < 0 buries it in the hill),
// so nothing floats and the tops tuck under the slope above. Merged into the masonry mesh (no
// extra draw call); `?legacyterrain` turns it off.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import { SLAB, QUAY_X, RAIL_Z } from '../../core/constants';
import { RIDGE_FOOT_Z, SPUR_W_X, SPUR_E_X } from '../../core/plan';
import { GeoBuilder, type V3 } from './builder';
import { type TerrainModel, SEA_WALL_Z0 } from './height';
import { KIND } from './kinds';
import { vnoise } from './noise';

interface CliffFace {
  name: string;
  /** baseline start (in front of the foot, outside the hill) */
  ax: number;
  az: number;
  /** outward horizontal normal */
  nx: number;
  nz: number;
  len: number;
  /** max march distance into the hill */
  maxIn: number;
  /** lowest skin height (under water for the harbour cliff) */
  yMin: number;
  /** min / max steepness: a column needs dt/dy < steep somewhere; the top ends where dt/dy > flat */
  steep: number;
  flat: number;
  /** skip columns here (portals, slab corners) */
  skip?: (x: number, z: number) => boolean;
  /** global strata phase */
  seed: number;
}

export interface CliffFoot {
  x: number;
  z: number;
  /** outward normal */
  nx: number;
  nz: number;
  /** face height above the foot */
  h: number;
}

export interface CliffResult {
  triangles: number;
  blocks: number;
  columns: number;
  feet: CliffFoot[];
  /** stone footprints (vegetation avoids them) */
  stones: { x: number; z: number; r: number }[];
}

const ROCK_TONES = ['#b9aa90', '#a69884', '#c2b192', '#988b79', '#b09b7b', '#8f8474', '#bcae98', '#a1927a'].map((h) => new THREE.Color(h));
const DT = 0.05; // march step (m)
const DY = 0.25; // profile grid step (m)
const IN = -0.45; // buried inner edge of every block

interface Column {
  u: number;
  /** baseline point */
  qx: number;
  qz: number;
  yFoot: number;
  yBot: number;
  yTop: number;
  /** t (distance into the hill) on a DY grid from y0 */
  y0: number;
  ts: Float32Array;
  ok: boolean;
}

function marchColumn(model: TerrainModel, f: CliffFace, u: number): Column {
  const tx = f.nz,
    tz = -f.nx;
  const qx = f.ax + tx * u,
    qz = f.az + tz * u;
  const n = Math.ceil(f.maxIn / DT) + 1;
  const hs = new Float32Array(n);
  let hMax = -1e9;
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    const h = model.height(qx - f.nx * t, qz - f.nz * t);
    // running max: "first crossing" inversion of a profile that may wobble
    hMax = Math.max(hMax, h);
    hs[i] = hMax;
  }
  const yFoot = hs[0];
  const y0 = Math.max(f.yMin, yFoot);
  const yEnd = hs[n - 1];
  const m = Math.max(1, Math.floor((yEnd - y0) / DY) + 1);
  const ts = new Float32Array(m);
  let i = 0;
  for (let k = 0; k < m; k++) {
    // (row 0 just above the foot level: the first crossing of y0 itself is the baseline point)
    const y = y0 + Math.max(k * DY, 0.03);
    while (i < n - 1 && hs[i + 1] < y) i++;
    if (hs[i] >= y) ts[k] = i * DT;
    else {
      const a = hs[i],
        b = hs[Math.min(n - 1, i + 1)];
      ts[k] = (i + (b > a ? (y - a) / (b - a) : 0)) * DT;
    }
  }
  const col: Column = { u, qx, qz, yFoot, yBot: y0, yTop: y0, y0, ts, ok: false };
  if (m < 8) return col;
  // steepness dt/dy over 0.5 m windows
  let best = 1e9,
    kBest = -1;
  const slopeAt = (k: number) => (ts[Math.min(m - 1, k + 2)] - ts[k]) / (DY * 2);
  for (let k = 0; k < m - 2; k++) {
    const s = slopeAt(k);
    if (s < best) {
      best = s;
      kBest = k;
    }
  }
  if (best > f.steep || kBest < 0) return col;
  // top: first window above the steepest point that flattens out
  let kTop = kBest;
  while (kTop < m - 3 && slopeAt(kTop) < f.flat) kTop++;
  // bottom: down from the steepest point while it stays reasonably steep
  let kBot = kBest;
  while (kBot > 0 && slopeAt(kBot - 1) < f.flat * 1.6) kBot--;
  col.yTop = y0 + kTop * DY;
  col.yBot = y0 + kBot * DY;
  col.ok = col.yTop - col.yBot > 1.6;
  return col;
}

/** t (into the hill) of a column at height y */
function tAt(c: Column, y: number): number {
  const f = (y - c.y0) / DY;
  if (f <= 0) return c.ts[0];
  const k = Math.floor(f);
  if (k >= c.ts.length - 1) return c.ts[c.ts.length - 1];
  const r = f - k;
  return c.ts[k] * (1 - r) + c.ts[k + 1] * r;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

function faces(model: TerrainModel): CliffFace[] {
  const roadPortals = model.portals.filter((p) => p.kind === 'road');
  const nearRoadPortal = (x: number) => roadPortals.some((p) => Math.abs(x - p.x) < Math.max(p.reach[0], p.reach[1]) + 0.8);
  const out: CliffFace[] = [];
  // ridge escarpment (faces south), between the spurs, minus the road-portal headwalls + wings
  out.push({
    name: 'ridge',
    ax: SPUR_W_X + 1.5,
    az: RIDGE_FOOT_Z + 1.6,
    nx: 0,
    nz: 1,
    len: SPUR_E_X - 1 - (SPUR_W_X + 1.5),
    maxIn: 14,
    yMin: -0.5,
    steep: 0.55,
    flat: 0.95,
    skip: (x) => nearRoadPortal(x),
    seed: 1,
  });
  // west spur nose (faces south, above the industry yard)
  out.push({ name: 'nose-w', ax: SLAB.x0 + 1.2, az: -134.6, nx: 0, nz: 1, len: SPUR_W_X - 1.5 - (SLAB.x0 + 1.2), maxIn: 14, yMin: -0.5, steep: 0.8, flat: 1.15, seed: 2 });
  // east spur nose (faces south, above the container yard)
  out.push({ name: 'nose-e', ax: SPUR_E_X + 1.0, az: -134.6, nx: 0, nz: 1, len: QUAY_X - 1.2 - (SPUR_E_X + 1.0), maxIn: 14, yMin: -0.5, steep: 0.8, flat: 1.15, seed: 3 });
  // south walls of the rail-portal approach cuts (face north, towards the track)
  out.push({ name: 'cut-w', ax: SPUR_W_X + 5.8, az: RAIL_Z + 3.2, nx: 0, nz: -1, len: 6.2, maxIn: 9, yMin: -0.5, steep: 0.75, flat: 1.15, seed: 5 });
  out.push({ name: 'cut-e', ax: SPUR_E_X + 0.6, az: RAIL_Z + 3.2, nx: 0, nz: -1, len: 4.6, maxIn: 9, yMin: -0.5, steep: 0.75, flat: 1.15, seed: 6 });
  // harbour cliff (faces east into the sea), north of the sea wall
  out.push({
    name: 'harbour',
    ax: QUAY_X + 7.5,
    az: SEA_WALL_Z0 - 0.6,
    nx: 1,
    nz: 0,
    len: SEA_WALL_Z0 - 0.6 - (SLAB.z0 + 1.2),
    maxIn: 12,
    yMin: -3.2,
    steep: 0.45,
    flat: 0.95,
    seed: 4,
  });
  return out;
}

/**
 * Build the rock skin into `b` (masonry builder, aMas attribute). `stone(x, z, size, embed)`
 * places a scree stone (masonry's faceted boulder) and returns false if the spot is refused.
 */
export function buildCliffs(
  ctx: CityContext,
  model: TerrainModel,
  b: GeoBuilder,
  rng: Rng,
  stone: (x: number, z: number, size: number, embed: number, y?: number) => boolean,
): CliffResult {
  const res: CliffResult = { triangles: 0, blocks: 0, columns: 0, feet: [], stones: [] };
  const tri0 = b.triangles;
  const occ = ctx.occupancy;
  const HARD = OCC.ROAD | OCC.SIDEWALK | OCC.RAIL | OCC.PAVED | OCC.BUILDING | OCC.SOLID | OCC.PATH;
  const col = new THREE.Color();

  for (const f of faces(model)) {
    if (f.len < 3) continue;
    const tx = f.nz,
      tz = -f.nx;
    // ── columns
    const cols: Column[] = [];
    for (let u = 0; u <= f.len; ) {
      const qx = f.ax + tx * u,
        qz = f.az + tz * u;
      const c = marchColumn(model, f, u);
      if (f.skip?.(qx, qz)) c.ok = false;
      cols.push(c);
      u += 1.25 + rng.next() * 0.5;
    }
    res.columns += cols.length;
    // smooth yTop / yBot a little along the face (no saw-tooth silhouettes)
    for (let i = 1; i < cols.length - 1; i++) {
      const a = cols[i - 1],
        c = cols[i],
        d = cols[i + 1];
      if (a.ok && c.ok && d.ok) c.yTop = Math.min(c.yTop, (a.yTop + c.yTop * 2 + d.yTop) / 4 + 0.25);
    }
    // ── strata boundaries (global per face, gently dipping + wobbling)
    const base: number[] = [];
    {
      let y = f.yMin - 0.6 + rng.next() * 0.5;
      while (y < 40) {
        base.push(y);
        const r = rng.next();
        y += r < 0.25 ? 0.8 + rng.next() * 0.35 : r < 0.8 ? 1.15 + rng.next() * 0.55 : 1.7 + rng.next() * 0.45;
      }
    }
    const ph1 = f.seed * 1.7,
      ph2 = f.seed * 4.1;
    const dip = (u: number) => 0.32 * Math.sin(u * 0.033 + ph1) + 0.18 * Math.sin(u * 0.081 + ph2) + 0.0022 * u;
    const layerY = (k: number, u: number) => base[k] + dip(u);
    // per (column, boundary) wobble shared by the layer below and the one above: irregular ledges
    const jb = (i: number, k: number) => (vnoise(i * 0.93 + k * 7.7, k * 3.1, f.seed + 11) - 0.5) * 0.36;
    const layerYc = (k: number, i: number) => layerY(k, cols[i].u) + jb(i, k);
    const nL = base.length - 1;
    // lip D of the layer below, per column (no overhang at a block's foot)
    const lip: Float32Array[] = cols.map(() => new Float32Array(nL).fill(9));

    // ── per layer: blocks over runs of columns where the layer is present
    for (let k = 0; k < nL; k++) {
      const tone = ROCK_TONES[(k * 5 + f.seed * 3) % ROCK_TONES.length];
      const present = (c: Column) => {
        if (!c.ok) return false;
        const y0 = Math.max(layerY(k, c.u), c.yBot - 0.4);
        const y1 = Math.min(layerY(k + 1, c.u), c.yTop);
        return y1 - y0 > 0.3 && y1 > c.yBot + 0.1;
      };
      let i = 0;
      while (i < cols.length) {
        if (!present(cols[i])) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < cols.length && present(cols[j + 1]) && cols[j + 1].u - cols[j].u < 2.6) j++;
        // run i..j → blocks of 3–5 columns sharing their end columns (short leftovers merge)
        let s = i;
        while (s < j) {
          let span = Math.min(j - s, 2 + Math.floor(rng.next() * 3));
          if (j - (s + span) < 2) span = j - s;
          emitBlock(s, s + span, k, tone);
          s += span;
        }
        i = j + 1;
      }
    }

    function emitBlock(i0: number, i1: number, k: number, tone: THREE.Color): void {
      res.blocks++;
      // thin beds weather back into dark recessed bands (they read as strata from far away)
      const thin = base[k + 1] - base[k] < 1.0;
      const recess = rng.chance(thin ? 0.7 : 0.14);
      const P = recess ? 0.06 + rng.next() * 0.12 : 0.32 + rng.next() * 0.6;
      const tint = (0.86 + rng.next() * 0.24) * (thin ? 0.8 : 1);
      const dropTop = rng.chance(0.18) ? 0.12 + rng.next() * 0.2 : 0;
      interface V {
        x: number;
        z: number;
        tb: number;
        tm: number;
        tt: number;
        yb: number;
        ym: number;
        yt: number;
        db: number;
        dm: number;
        dt: number;
        /** slide of the mid row along the face */
        sl: number;
      }
      const vs: V[] = [];
      for (let i = i0; i <= i1; i++) {
        const c = cols[i];
        const yb = Math.max(layerYc(k, i), c.yBot - 0.45);
        let yt = Math.min(layerYc(k + 1, i), c.yTop);
        // the very top of a face: a little lower at random so the rim is not a ruler line
        if (yt >= c.yTop - 1e-3) yt -= 0.05 + 0.25 * vnoise(c.u * 0.45, k, f.seed);
        else yt -= dropTop;
        yt = Math.max(yt, yb + 0.25);
        const ym = yb + (yt - yb) * (0.38 + rng.next() * 0.22);
        const jit = () => (rng.next() - 0.5) * 0.22;
        // block ends round back into the joint (V-shaped crevices instead of brick ends)
        const end = i === i0 || i === i1 ? 0.5 : 1;
        let db = P * 0.35 * end + jit() * 0.6;
        if (k > 0 && lip[i][k - 1] < 9) db = Math.min(db, lip[i][k - 1] - 0.07);
        db = Math.max(db, -0.05);
        const dm = Math.max(db + 0.04, P * end + jit());
        const dt = Math.max(0.0, Math.min(dm, P * 0.78 * end + jit()));
        lip[i][k] = Math.min(lip[i][k], dt);
        vs.push({ x: c.qx, z: c.qz, tb: tAt(c, yb), tm: tAt(c, ym), tt: tAt(c, yt), yb, ym, yt, db, dm, dt, sl: i === i0 || i === i1 ? 0 : (rng.next() - 0.5) * 0.5 });
      }
      const P3 = (v: V, which: 0 | 1 | 2 | 3 | 4): V3 => {
        // 0 bottom front, 1 mid front, 2 top lip, 3 top inner, 4 bottom inner
        let t: number, y: number, d: number;
        if (which === 0) [t, y, d] = [v.tb, v.yb, v.db];
        else if (which === 1) [t, y, d] = [v.tm, v.ym, v.dm];
        else if (which === 2) [t, y, d] = [v.tt, v.yt, v.dt];
        else if (which === 3) [t, y, d] = [v.tt, v.yt + 0.03, IN];
        else [t, y, d] = [v.tb, v.yb, IN];
        const o = d - t;
        const sl = which === 1 ? v.sl : 0;
        return [v.x + f.nx * o + tx * sl, y, v.z + f.nz * o + tz * sl];
      };
      col.copy(tone).multiplyScalar(tint);
      b.set('aMas', KIND.cliff, (k % 8) / 8 + 0.01, tx, tz);
      // shared (indexed) vertices: the masonry material shades facets from screen derivatives
      const upN = 0.7071;
      const ids: number[][] = [];
      const pts: V3[][] = [];
      const shade = [0.78, 1.04, 1.07, 1.0];
      for (const v of vs) {
        const row: number[] = [];
        const rp: V3[] = [];
        for (let w = 0; w < 4; w++) {
          const p = P3(v, w as 0 | 1 | 2 | 3);
          b.color(_c.copy(col).multiplyScalar(shade[w]));
          const ny = w === 2 ? upN : w === 3 ? 1 : 0;
          const nh = w === 2 ? upN : w === 3 ? 0 : 1;
          row.push(b.vertex(p[0], p[1], p[2], f.nx * nh, ny, f.nz * nh));
          rp.push(p);
        }
        ids.push(row);
        pts.push(rp);
      }
      const T = (a: [number, number], bb: [number, number], cc: [number, number], dx: number, dy: number, dz: number) => {
        const pa = pts[a[0]][a[1]],
          pb = pts[bb[0]][bb[1]],
          pc = pts[cc[0]][cc[1]];
        _a.set(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
        _b.set(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]);
        _n.crossVectors(_a, _b);
        if (_n.lengthSq() < 1e-10) return;
        const ia = ids[a[0]][a[1]],
          ib = ids[bb[0]][bb[1]],
          ic = ids[cc[0]][cc[1]];
        if (_n.x * dx + _n.y * dy + _n.z * dz < 0) b.tri(ia, ic, ib);
        else b.tri(ia, ib, ic);
      };
      for (let q = 0; q < vs.length - 1; q++) {
        const A = q,
          B = q + 1;
        // front: crease band (0→1) and upper band (1→2), random diagonals for facets
        for (const [lo, hi] of [
          [0, 1],
          [1, 2],
        ]) {
          if (rng.chance(0.5)) {
            T([A, lo], [B, lo], [B, hi], f.nx, 0, f.nz);
            T([A, lo], [B, hi], [A, hi], f.nx, 0, f.nz);
          } else {
            T([A, lo], [B, lo], [A, hi], f.nx, 0, f.nz);
            T([B, lo], [B, hi], [A, hi], f.nx, 0, f.nz);
          }
        }
        // ledge top
        T([A, 2], [B, 2], [B, 3], 0, 1, 0);
        T([A, 2], [B, 3], [A, 3], 0, 1, 0);
      }
      // end caps (side faces) with their own bottom-inner vertex
      for (const [q, sg] of [
        [0, -1],
        [vs.length - 1, 1],
      ] as [number, number][]) {
        const p4 = P3(vs[q], 4);
        b.color(_c.copy(col).multiplyScalar(0.84));
        const i4 = b.vertex(p4[0], p4[1], p4[2], tx * sg, 0, tz * sg);
        ids[q].push(i4);
        pts[q].push(p4);
        T([q, 0], [q, 1], [q, 4], tx * sg, 0, tz * sg);
        T([q, 1], [q, 3], [q, 4], tx * sg, 0, tz * sg);
        T([q, 1], [q, 2], [q, 3], tx * sg, 0, tz * sg);
      }
    }

    // ── feet (ground apron) + scree stones
    for (const c of cols) {
      if (!c.ok) continue;
      const h = c.yTop - c.yFoot;
      const tf = tAt(c, Math.max(c.yFoot, f.yMin) + 0.05);
      const fx = c.qx - f.nx * tf,
        fz = c.qz - f.nz * tf;
      if (c.yFoot > -1.4) res.feet.push({ x: fx, z: fz, nx: f.nx, nz: f.nz, h });
      if (h < 2.2) continue;
      const nStones = rng.next() < 0.75 ? 1 + (rng.next() < 0.45 ? 1 : 0) : 0;
      for (let s = 0; s < nStones; s++) {
        const out = 0.35 + Math.pow(rng.next(), 1.6) * Math.min(2.4, 0.6 + h * 0.15);
        const along = (rng.next() - 0.5) * 1.3;
        const x = fx + f.nx * out + tx * along,
          z = fz + f.nz * out + tz * along;
        const size = (0.22 + rng.next() * 0.38) * (out < 0.9 ? 1.25 : 1);
        if (x < SLAB.x0 + 1 || x > SLAB.x1 - 1 || z < SLAB.z0 + 1 || z > SLAB.z1 - 1) continue;
        if (occ.anyInCircle(x, z, size + 0.5, HARD)) continue;
        // keep clear of the catenary masts on the track side
        if (f.name === 'ridge' && z > RAIL_Z - 4.4) continue;
        const ground = model.height(x, z);
        if (stone(x, z, size, 0.42, ground)) res.stones.push({ x, z, r: size * 1.05 });
      }
    }
  }
  res.triangles = b.triangles - tri0;
  return res;
}

const _c = new THREE.Color();
