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

/** flat triangle whose normal is flipped (if needed) to face roughly along dir */
function triFacing(b: GeoBuilder, p0: V3, p1: V3, p2: V3, dx: number, dy: number, dz: number): void {
  _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
  _n.crossVectors(_a, _b);
  if (_n.lengthSq() < 1e-10) return;
  if (_n.x * dx + _n.y * dy + _n.z * dz < 0) b.triangle(p0, p2, p1);
  else b.triangle(p0, p1, p2);
}

function quadFacets(b: GeoBuilder, p0: V3, p1: V3, p2: V3, p3: V3, flip: boolean, dx: number, dy: number, dz: number): void {
  if (flip) {
    triFacing(b, p0, p1, p3, dx, dy, dz);
    triFacing(b, p1, p2, p3, dx, dy, dz);
  } else {
    triFacing(b, p0, p1, p2, dx, dy, dz);
    triFacing(b, p0, p2, p3, dx, dy, dz);
  }
}

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
        // run i..j → blocks of 2–4 columns sharing their end columns
        let s = i;
        while (s < j) {
          const span = Math.min(j - s, 1 + Math.floor(rng.next() * 3));
          emitBlock(s, s + span, k, tone);
          s += span;
        }
        i = j + 1;
      }
    }

    function emitBlock(i0: number, i1: number, k: number, tone: THREE.Color): void {
      res.blocks++;
      const recess = rng.chance(0.16);
      const P = recess ? 0.08 + rng.next() * 0.14 : 0.3 + rng.next() * 0.55;
      const tint = 0.9 + rng.next() * 0.18;
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
      }
      const vs: V[] = [];
      for (let i = i0; i <= i1; i++) {
        const c = cols[i];
        const yb = Math.max(layerY(k, c.u), c.yBot - 0.45);
        let yt = Math.min(layerY(k + 1, c.u), c.yTop);
        // the very top of a face: a little lower at random so the rim is not a ruler line
        if (yt >= c.yTop - 1e-3) yt -= 0.05 + 0.25 * vnoise(c.u * 0.45, k, f.seed);
        else yt -= dropTop;
        yt = Math.max(yt, yb + 0.25);
        const ym = yb + (yt - yb) * (0.38 + rng.next() * 0.22);
        const jit = () => (rng.next() - 0.5) * 0.2;
        let db = P * 0.35 + jit() * 0.6;
        if (k > 0 && lip[i][k - 1] < 9) db = Math.min(db, lip[i][k - 1] - 0.07);
        db = Math.max(db, -0.05);
        const dm = Math.max(db + 0.04, P + jit());
        const dt = Math.max(0.0, Math.min(dm, P * 0.78 + jit()));
        lip[i][k] = Math.min(lip[i][k], dt);
        vs.push({ x: c.qx, z: c.qz, tb: tAt(c, yb), tm: tAt(c, ym), tt: tAt(c, yt), yb, ym, yt, db, dm, dt });
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
        return [v.x + f.nx * o, y, v.z + f.nz * o];
      };
      col.copy(tone).multiplyScalar(tint);
      b.set('aMas', KIND.cliff, (k % 8) / 8 + 0.01, tx, tz);
      // front: lower (crease, darker) and upper bands
      for (let q = 0; q < vs.length - 1; q++) {
        const A = vs[q],
          B = vs[q + 1];
        b.color(_c.copy(col).multiplyScalar(0.8));
        quadFacets(b, P3(A, 0), P3(B, 0), P3(B, 1), P3(A, 1), rng.chance(0.5), f.nx, 0, f.nz);
        b.color(_c.copy(col).multiplyScalar(1.04));
        quadFacets(b, P3(A, 1), P3(B, 1), P3(B, 2), P3(A, 2), rng.chance(0.5), f.nx, 0, f.nz);
        // ledge top
        b.color(_c.copy(col).multiplyScalar(1.0));
        quadFacets(b, P3(A, 2), P3(B, 2), P3(B, 3), P3(A, 3), false, 0, 1, 0);
      }
      // end caps (side faces)
      b.color(_c.copy(col).multiplyScalar(0.88));
      for (const [v, sg] of [
        [vs[0], -1],
        [vs[vs.length - 1], 1],
      ] as [V, number][]) {
        const p0 = P3(v, 0),
          p1 = P3(v, 1),
          p2 = P3(v, 2),
          p3 = P3(v, 3),
          p4 = P3(v, 4);
        triFacing(b, p0, p1, p4, tx * sg, 0, tz * sg);
        triFacing(b, p1, p3, p4, tx * sg, 0, tz * sg);
        triFacing(b, p1, p2, p3, tx * sg, 0, tz * sg);
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
