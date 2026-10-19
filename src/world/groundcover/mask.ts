// Ground-cover maps, baked once at boot from the plan, the props layout, the trees and the ground mask.
// They drive the blade field (vertex shader, texelFetch = nearest) and the ground shader (filtered).
//
// tCover   RGBA8, 0.25 m over the slab (CW × CH)
//   R density   where grass grows (0 none … 1 full): lawns, verges, meadows, unmown edges, pavement weeds
//   G length    0 mown lawn (5–9 cm) · ~0.3 rough / unmown tuft · ~0.65 meadow · 1 tall meadow
//   B habitat   0 normal · 1..100 wet shore (reeds, cattails, shore grass; value = strength) ·
//               150..255 dune (marram; strength = (v − 150) / 105)
//   A litter    fallen leaves under trees (also on paving)
// tFlower  RGBA8, 0.5 m (FW × FH)
//   R wildflower density (meadows) · G species band (see SPECIES) · B lawn flowers (daisy, dandelion,
//   clover heads) · A lawn tone (0.5 neutral: mowing stripes ±, darker edges −) copied from the ground mask
// tGH      R16F, 0.25 m: surface height where blades root (ground + GROUND_DROP; sidewalk tops)
//
// Everything is deterministic (plan + seeded hashes), no per-frame work.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB, CORRIDOR_HALF, ROAD_HALF, RAIL_Z, SIDEWALK_Y } from '../../core/constants';
import { OCC } from '../../core/occupancy';
import { getLayout } from '../props/layout';
import { getTerrainModel, GROUND_DROP } from '../terrain/height';
import { noiseTexture, fbm } from '../terrain/noise';
import { groundMaskInfo } from '../terrain/ground';

export const CRES = 0.25;
export const CW = Math.round((SLAB.x1 - SLAB.x0) / CRES); // 1600
export const CH = Math.round((SLAB.z1 - SLAB.z0) / CRES); // 1360
export const FRES = 0.5;
export const FW = Math.round((SLAB.x1 - SLAB.x0) / FRES); // 800
export const FH = Math.round((SLAB.z1 - SLAB.z0) / FRES); // 680

/** flower species bands in tFlower.G (value / 255 → band index = floor(v * 6)) */
export const SPECIES = ['poppy', 'cornflower', 'daisy', 'buttercup', 'cowparsley', 'knapweed'] as const;
export type Species = (typeof SPECIES)[number];

/** tile sizes of the three LOD rings (metres) */
export const RING_TILE = [2, 4, 8] as const;

export interface TileGrid {
  size: number;
  nx: number;
  nz: number;
  /** per tile: bit 0 any blades · bit 1 long grass / edges / habitat · bit 2 flowers · bit 3 litter */
  flags: Uint8Array;
  /** per tile: min / max surface height (m) for frustum tests */
  ymin: Float32Array;
  ymax: Float32Array;
}

export interface FlowerPatch {
  x: number;
  z: number;
  /** radius (m) */
  r: number;
  /** 0..1 mean flower density */
  density: number;
  species: Species;
}

export interface CoverMaps {
  cover: Uint8Array;
  flower: Uint8Array;
  height: Float32Array;
  texCover: THREE.DataTexture;
  texFlower: THREE.DataTexture;
  texHeight: THREE.DataTexture;
  grids: TileGrid[];
  patches: FlowerPatch[];
  /** density at a world point (0..1), 0 outside the slab */
  densityAt(x: number, z: number): number;
  buildMs: number;
  /** boot cost per phase (ms) */
  phases: string;
  stats: { grassCells: number; meadowCells: number; wetCells: number; duneCells: number; weedCells: number; litterCells: number };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function hash2(i: number, j: number, s: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s + 7, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** bilinear sample (RepeatWrapping) of the shared 256² noise texture, channel c, at texture uv */
function makeNoiseSampler(): (u: number, v: number, c: number) => number {
  const tex = noiseTexture();
  const d = tex.image.data as Uint8Array;
  const S = 256;
  return (u: number, v: number, c: number) => {
    const fx = u * S - 0.5,
      fy = v * S - 0.5;
    const ix = Math.floor(fx),
      iy = Math.floor(fy);
    const tx = fx - ix,
      ty = fy - iy;
    const x0 = ((ix % S) + S) % S,
      y0 = ((iy % S) + S) % S;
    const x1 = (x0 + 1) % S,
      y1 = (y0 + 1) % S;
    const a = d[(y0 * S + x0) * 4 + c],
      b = d[(y0 * S + x1) * 4 + c],
      e = d[(y1 * S + x0) * 4 + c],
      f = d[(y1 * S + x1) * 4 + c];
    return ((a + (b - a) * tx) * (1 - ty) + (e + (f - e) * tx) * ty) / 255;
  };
}

type G2 = CanvasRenderingContext2D;

function canvas(w: number, h: number, fill: string): { cv: HTMLCanvasElement; g: G2 } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  return { cv, g };
}

/** separable box blur (radius r texels, 2 passes ≈ gaussian) of one RGBA channel, in place */
function boxBlur(img: Uint8ClampedArray, w: number, h: number, c: number, r: number): void {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) tmp[i] = img[i * 4 + c];
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    // horizontal: tmp → out
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += tmp[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        out[row + x] = acc / n;
        acc += tmp[row + Math.min(w - 1, x + r + 1)] - tmp[row + Math.max(0, x - r)];
      }
    }
    // vertical: out → tmp
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += out[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        tmp[y * w + x] = acc / n;
        acc += out[Math.min(h - 1, y + r + 1) * w + x] - out[Math.max(0, y - r) * w + x];
      }
    }
  }
  for (let i = 0; i < w * h; i++) img[i * 4 + c] = tmp[i];
}

export function buildCoverMaps(ctx: CityContext): CoverMaps {
  const t0 = performance.now();
  let tp = t0;
  const phases: string[] = [];
  const mark = (name: string) => {
    const t = performance.now();
    phases.push(`${name} ${Math.round(t - tp)}`);
    tp = t;
  };
  const { plan } = ctx;
  const model = getTerrainModel(plan);
  const H = (ctx.services.terrain as { height?: (x: number, z: number) => number } | undefined)?.height ?? model.height;
  const layout = getLayout(ctx);
  const trees = ((ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined)?.trees ?? []).slice();
  const occ = ctx.occupancy;
  const noise = makeNoiseSampler();

  const k = 1 / CRES;
  const X = (x: number) => (x - SLAB.x0) * k;
  const Z = (z: number) => (z - SLAB.z0) * k;
  const rectPath = (g: G2, x0: number, z0: number, x1: number, z1: number) => g.rect(X(Math.min(x0, x1)), Z(Math.min(z0, z1)), Math.abs(x1 - x0) * k, Math.abs(z1 - z0) * k);
  const disc = (g: G2, x: number, z: number, r: number) => {
    g.beginPath();
    g.arc(X(x), Z(z), Math.max(0.6, r * k), 0, Math.PI * 2);
    g.fill();
  };
  const polyline = (g: G2, pts: { x: number; z: number }[], w: number) => {
    g.lineWidth = w * k;
    g.beginPath();
    pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z))));
    g.stroke();
  };
  const rotRect = (g: G2, cx: number, cz: number, w: number, d: number, yaw: number, pad: number) => {
    // local +Z faces (sin yaw, cos yaw); local x = (cos yaw, −sin yaw)
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const hw = w / 2 + pad,
      hd = d / 2 + pad;
    g.beginPath();
    const pts: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
    pts.forEach(([lx, lz], i) => {
      const x = cx + lx * c + lz * s,
        z = cz - lx * s + lz * c;
      if (i) g.lineTo(X(x), Z(z));
      else g.moveTo(X(x), Z(z));
    });
    g.closePath();
    g.fill();
  };

  // ── 1. where grass may grow (white) ─────────────────────────────────────────────────────────
  const A = canvas(CW, CH, '#fff');
  const ga = A.g;
  ga.fillStyle = '#000';
  ga.strokeStyle = '#000';
  ga.lineCap = 'round';
  ga.lineJoin = 'round';
  for (const seg of plan.roadSegments) {
    const P = plan.roadNodes[seg.a],
      Q = plan.roadNodes[seg.b];
    const side = seg.sidewalks ? CORRIDOR_HALF : ROAD_HALF + 0.7;
    const horiz = Math.abs(Q.x - P.x) > Math.abs(Q.z - P.z);
    ga.beginPath();
    if (horiz) rectPath(ga, P.x, P.z - side, Q.x, P.z + side);
    else rectPath(ga, P.x - side, P.z, P.x + side, Q.z);
    ga.fill();
  }
  for (const n of plan.roadNodes) {
    if (n.kind === 'portal') continue;
    ga.beginPath();
    rectPath(ga, n.x - CORRIDOR_HALF, n.z - CORRIDOR_HALF, n.x + CORRIDOR_HALF, n.z + CORRIDOR_HALF);
    ga.fill();
  }
  ga.beginPath();
  rectPath(ga, plan.rail.portalW - 4, RAIL_Z - 3.5, plan.rail.portalE + 4, RAIL_Z + 3.5);
  ga.fill();
  // block interiors: top-most area surface wins (as roads/covers.ts draws them)
  for (const b of plan.blocks) {
    if (b.surface !== 'grass') {
      ga.beginPath();
      rectPath(ga, b.rect.x0, b.rect.z0, b.rect.x1, b.rect.z1);
      ga.fill();
    }
  }
  const areas = plan.areas.slice().sort((p, q) => p.layer - q.layer || p.id - q.id);
  for (const a of areas) {
    const grass = a.surface === 'grass' && a.kind !== 'pond';
    ga.fillStyle = grass ? '#fff' : '#000';
    ga.beginPath();
    if (a.ellipse) ga.ellipse(X(a.ellipse.cx), Z(a.ellipse.cz), a.ellipse.rx * k, a.ellipse.rz * k, 0, 0, Math.PI * 2);
    else rectPath(ga, a.rect.x0, a.rect.z0, a.rect.x1, a.rect.z1);
    ga.fill();
  }
  ga.fillStyle = '#000';
  for (const lot of plan.lots) {
    const f = lot.footprint;
    ga.beginPath();
    rectPath(ga, f.x0 - 0.12, f.z0 - 0.12, f.x1 + 0.12, f.z1 + 0.12);
    ga.fill();
  }
  for (const p of plan.paths) polyline(ga, p.pts, p.width + (p.draw ? 0.12 : 0.3));
  for (const f of plan.features) {
    if (f.kind === 'pondisland' || f.kind === 'sportscourt' || f.kind === 'umbrellas') {
      if (f.kind === 'sportscourt' && f.rect) {
        ga.beginPath();
        rectPath(ga, f.rect.x0, f.rect.z0, f.rect.x1, f.rect.z1);
        ga.fill();
      }
      continue;
    }
    if (f.a && f.b) {
      polyline(ga, [f.a, f.b], Number(f.params?.width ?? 4) + 0.6);
      continue;
    }
    if (f.rect) {
      ga.beginPath();
      rectPath(ga, f.rect.x0 - 0.1, f.rect.z0 - 0.1, f.rect.x1 + 0.1, f.rect.z1 + 0.1);
      ga.fill();
    }
    if (f.radius > 0) disc(ga, f.x, f.z, f.radius + 0.12);
    else if (f.kind === 'floodlight') disc(ga, f.x, f.z, 0.7);
  }
  const soft = new Set(['pots', 'toys', 'washing', 'swing', 'trampoline', 'loungers', 'parasol', 'birdbath']);
  for (const gp of layout.gardens) {
    if (gp.patio) {
      ga.beginPath();
      rectPath(ga, gp.patio.x0 - 0.05, gp.patio.z0 - 0.05, gp.patio.x1 + 0.05, gp.patio.z1 + 0.05);
      ga.fill();
    }
    for (const s of gp.stones) disc(ga, s.x, s.z, s.r + 0.03);
    for (const it of gp.items) {
      if (soft.has(it.kind)) continue;
      rotRect(ga, it.x, it.z, it.w, it.d, it.yaw, 0.08);
    }
  }
  for (const p of layout.plots) {
    ga.beginPath();
    rectPath(ga, p.rect.x0, p.rect.z0, p.rect.x1, p.rect.z1);
    ga.fill();
  }
  for (const b of layout.borders) polyline(ga, [{ x: b.ax, z: b.az }, { x: b.bx, z: b.bz }], b.style === 'hedge' ? 0.7 : b.style === 'wall' ? 0.46 : 0.1);
  for (const p of model.portals) {
    // headwalls + approach cuts
    ga.beginPath();
    const c = p.cos,
      s = p.sin;
    const hw = p.halfW + 1,
      d0 = -p.thick - 1,
      d1 = 8;
    const corners: [number, number][] = [
      [-hw, d0],
      [hw, d0],
      [hw, d1],
      [-hw, d1],
    ];
    corners.forEach(([lx, lz], i) => {
      const x = p.x + lx * c + lz * s,
        z = p.z - lx * s + lz * c;
      if (i) ga.lineTo(X(x), Z(z));
      else ga.moveTo(X(x), Z(z));
    });
    ga.closePath();
    ga.fill();
  }
  const allowImg = ga.getImageData(0, 0, CW, CH).data;
  mark('allow');

  // ── 2. unmown edge tufts (length boost): wall bases, fences, kerbs, tree bases, poles, features
  const E = canvas(CW, CH, '#000');
  const ge = E.g;
  ge.globalCompositeOperation = 'lighter';
  ge.lineCap = 'round';
  ge.lineJoin = 'round';
  const strokeRect = (r: { x0: number; z0: number; x1: number; z1: number }, w: number, v: number) => {
    ge.strokeStyle = `rgb(${v},${v},${v})`;
    ge.lineWidth = w * k;
    ge.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
  };
  for (const lot of plan.lots) strokeRect(lot.footprint, 0.9, 120);
  for (const b of plan.blocks) strokeRect(b.rect, 0.55, 80);
  for (const b of layout.borders) {
    ge.strokeStyle = b.style === 'hedge' ? 'rgb(110,110,110)' : 'rgb(150,150,150)';
    polyline(ge, [{ x: b.ax, z: b.az }, { x: b.bx, z: b.bz }], b.style === 'hedge' ? 1.5 : 1.1);
  }
  for (const t of trees) {
    ge.fillStyle = 'rgb(130,130,130)';
    disc(ge, t.x, t.z, 0.55 + Math.min(0.5, t.h * 0.03));
  }
  for (const l of layout.lamps) {
    ge.fillStyle = 'rgb(150,150,150)';
    disc(ge, l.x, l.z, 0.42);
  }
  for (const f of plan.features) {
    if (f.radius <= 0 || f.radius > 8 || f.kind === 'pondisland') continue;
    ge.strokeStyle = 'rgb(100,100,100)';
    ge.lineWidth = 0.9 * k;
    ge.beginPath();
    ge.arc(X(f.x), Z(f.z), (f.radius + 0.35) * k, 0, Math.PI * 2);
    ge.stroke();
  }
  for (const b of layout.benches) {
    ge.fillStyle = 'rgb(70,70,70)';
    disc(ge, b.x, b.z, 0.9);
  }
  const edgeImg = ge.getImageData(0, 0, CW, CH).data;
  boxBlur(edgeImg, CW, CH, 0, 1);
  mark('edges');

  // ── 3. meadow zones (R = meadow, G = mown override)
  const M = canvas(CW, CH, '#000');
  const gm = M.g;
  gm.lineCap = 'round';
  gm.lineJoin = 'round';
  // south bank: wildflower meadow with mown strips along the riverbank paths and around picnic spots
  gm.fillStyle = 'rgb(215,0,0)';
  gm.beginPath();
  rectPath(gm, SLAB.x0, 126.6, 117, SLAB.z1);
  gm.fill();
  // railway embankments: rough meadow
  gm.fillStyle = 'rgb(170,0,0)';
  gm.beginPath();
  rectPath(gm, plan.rail.portalW, RAIL_Z - 9, plan.rail.portalE, RAIL_Z - 3.4);
  gm.fill();
  // park: an unmown shore band around the pond + a few wildflower islands away from the paths
  const pond = model.pond;
  if (pond) {
    gm.strokeStyle = 'rgb(175,0,0)';
    gm.lineWidth = 4.5 * k;
    gm.beginPath();
    gm.ellipse(X(pond.cx), Z(pond.cz), (pond.rx + 1.6) * k, (pond.rz + 1.6) * k, 0, 0, Math.PI * 2);
    gm.stroke();
  }
  const park = plan.blocks.find((b) => b.kind === 'park');
  const islands: { x: number; z: number; rx: number; rz: number; a: number }[] = [];
  if (park) {
    const rng = ctx.rng('groundcover-meadow-islands');
    const pathNear = (x: number, z: number, d: number) => occ.anyInCircle(x, z, d, OCC.PATH | OCC.SOLID | OCC.WATER | OCC.SIDEWALK);
    for (let tries = 0; tries < 400 && islands.length < 4; tries++) {
      const x = rng.range(park.rect.x0 + 8, park.rect.x1 - 8),
        z = rng.range(park.rect.z0 + 8, park.rect.z1 - 8);
      if (pathNear(x, z, 4.5)) continue;
      if (islands.some((q) => Math.hypot(q.x - x, q.z - z) < 14)) continue;
      islands.push({ x, z, rx: rng.range(3.5, 6.5), rz: rng.range(2.8, 5), a: rng.range(0, Math.PI) });
    }
    gm.fillStyle = 'rgb(200,0,0)';
    for (const q of islands) {
      gm.beginPath();
      gm.ellipse(X(q.x), Z(q.z), q.rx * k, q.rz * k, q.a, 0, Math.PI * 2);
      gm.fill();
    }
  }
  // mown strips (green channel): along all drawn paths on the south bank + picnic spots
  gm.strokeStyle = 'rgb(0,255,0)';
  gm.globalCompositeOperation = 'lighter';
  for (const p of plan.paths) {
    if (p.kind !== 'riverbank') continue;
    polyline(gm, p.pts, p.width + 2.8);
  }
  gm.fillStyle = 'rgb(0,255,0)';
  for (const f of plan.features) if (f.kind === 'picnic') disc(gm, f.x, f.z, f.radius + 4.5);
  gm.globalCompositeOperation = 'source-over';
  const meadowImg = gm.getImageData(0, 0, CW, CH).data;
  boxBlur(meadowImg, CW, CH, 0, 3);
  boxBlur(meadowImg, CW, CH, 1, 3);
  mark('meadow');

  // ── 4. pavement weeds: small spots along wall bases and kerbs, in tree pits and at pole feet
  const W = canvas(CW, CH, '#000');
  const gw = W.g;
  gw.fillStyle = '#fff';
  const wr = ctx.rng('groundcover-weeds');
  const weedLine = (ax: number, az: number, bx: number, bz: number, prob: number, rMin: number, rMax: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(L / 0.9);
    for (let i = 0; i < n; i++) {
      if (wr.next() > prob) continue;
      const t = (i + wr.next()) / Math.max(1, n);
      disc(gw, ax + (bx - ax) * t, az + (bz - az) * t, wr.range(rMin, rMax));
    }
  };
  for (const seg of plan.roadSegments) {
    if (!seg.sidewalks) continue;
    const P = plan.roadNodes[seg.a],
      Q = plan.roadNodes[seg.b];
    const horiz = Math.abs(Q.x - P.x) > Math.abs(Q.z - P.z);
    for (const sg of [-1, 1]) {
      // wall / fence base (inner sidewalk edge) and the kerb joint (both sides of the kerb stone)
      const off = [CORRIDOR_HALF - 0.16, ROAD_HALF + 0.42, ROAD_HALF - 0.32];
      const prob = [0.32, 0.14, 0.12];
      off.forEach((o, qi) => {
        const a0 = horiz ? Math.min(P.x, Q.x) + CORRIDOR_HALF : Math.min(P.z, Q.z) + CORRIDOR_HALF;
        const a1 = horiz ? Math.max(P.x, Q.x) - CORRIDOR_HALF : Math.max(P.z, Q.z) - CORRIDOR_HALF;
        if (a1 <= a0) return;
        if (horiz) weedLine(a0, P.z + sg * o, a1, P.z + sg * o, prob[qi], 0.07, qi === 0 ? 0.2 : 0.13);
        else weedLine(P.x + sg * o, a0, P.x + sg * o, a1, prob[qi], 0.07, qi === 0 ? 0.2 : 0.13);
      });
    }
  }
  for (const s of plan.slots) {
    if (s.kind === 'tree') {
      gw.strokeStyle = '#fff';
      gw.lineWidth = 0.22 * k;
      gw.beginPath();
      gw.arc(X(s.x), Z(s.z), 0.55 * k, 0, Math.PI * 2);
      gw.stroke();
    } else if ((s.kind === 'lamp' || s.kind === 'hydrant' || s.kind === 'bin') && wr.next() < 0.5) disc(gw, s.x + wr.range(-0.12, 0.12), s.z + wr.range(-0.12, 0.12), wr.range(0.1, 0.18));
  }
  const weedImg = gw.getImageData(0, 0, CW, CH).data;
  mark('weeds');

  // ── 5. leaf litter under the trees (additive radial falloff)
  const L = canvas(CW, CH, '#000');
  const gl = L.g;
  gl.globalCompositeOperation = 'lighter';
  for (const t of trees) {
    const r = Math.max(1.2, t.r * 1.25);
    const grd = gl.createRadialGradient(X(t.x), Z(t.z), 0, X(t.x), Z(t.z), r * k);
    const a = Math.round(Math.min(110, 40 + t.r * 12));
    grd.addColorStop(0, `rgb(${a},${a},${a})`);
    grd.addColorStop(0.55, `rgb(${Math.round(a * 0.6)},${Math.round(a * 0.6)},${Math.round(a * 0.6)})`);
    grd.addColorStop(1, 'rgb(0,0,0)');
    gl.fillStyle = grd;
    gl.beginPath();
    gl.arc(X(t.x), Z(t.z), r * k, 0, Math.PI * 2);
    gl.fill();
  }
  const litterImg = gl.getImageData(0, 0, CW, CH).data;
  mark('litter');

  // ── 6. heights on a 0.5 m lattice (bilinear for the 0.25 m texels), sidewalk tops overridden
  const LW = Math.round((SLAB.x1 - SLAB.x0) / 0.5) + 1,
    LH = Math.round((SLAB.z1 - SLAB.z0) / 0.5) + 1;
  const lat = new Float32Array(LW * LH);
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) lat[j * LW + i] = H(SLAB.x0 + i * 0.5, SLAB.z0 + j * 0.5);
  mark('heights');
  const latAt = (x: number, z: number) => {
    const fx = Math.min(LW - 1.001, Math.max(0, (x - SLAB.x0) * 2)),
      fz = Math.min(LH - 1.001, Math.max(0, (z - SLAB.z0) * 2));
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const tx = fx - i,
      tz = fz - j;
    const a = lat[j * LW + i],
      b = lat[j * LW + i + 1],
      c = lat[(j + 1) * LW + i],
      d = lat[(j + 1) * LW + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };

  // ── 7. ground mask (sand, wildness, wear, lawn tone) — warped exactly as the ground shader does
  const gmI = groundMaskInfo;
  const gmSample = (u: number, v: number, c: number): number => {
    if (!gmI) return c === 3 ? 0.5 : 0;
    const fx = Math.min(gmI.w - 1.001, Math.max(0, u * gmI.w - 0.5)),
      fy = Math.min(gmI.h - 1.001, Math.max(0, v * gmI.h - 0.5));
    const i = Math.floor(fx),
      j = Math.floor(fy);
    const tx = fx - i,
      ty = fy - j;
    const d = gmI.data,
      w = gmI.w;
    const a = d[(j * w + i) * 4 + c],
      b = d[(j * w + i + 1) * 4 + c],
      e = d[((j + 1) * w + i) * 4 + c],
      f = d[((j + 1) * w + i + 1) * 4 + c];
    return ((a + (b - a) * tx) * (1 - ty) + (e + (f - e) * tx) * ty) / 255;
  };
  const SX = 1 / (SLAB.x1 - SLAB.x0),
    SZ = 1 / (SLAB.z1 - SLAB.z0);

  // ── 8. per-texel combine
  const cover = new Uint8Array(CW * CH * 4);
  const height = new Float32Array(CW * CH);
  const stats = { grassCells: 0, meadowCells: 0, wetCells: 0, duneCells: 0, weedCells: 0, litterCells: 0 };
  const boardwalkX = 118.2;
  for (let j = 0; j < CH; j++) {
    const z = SLAB.z0 + (j + 0.5) * CRES;
    for (let i = 0; i < CW; i++) {
      const x = SLAB.x0 + (i + 0.5) * CRES;
      const p = j * CW + i;
      const q = p * 4;
      const h = latAt(x, z);
      const o = occ.get(x, z);
      const raised = (o & OCC.SIDEWALK) !== 0 && (o & OCC.ROAD) === 0;
      height[p] = raised ? SIDEWALK_Y : h + GROUND_DROP;
      // ground-mask channels (R/G warped like the shader, B/A straight)
      const nAz = noise(x * 0.0104, z * 0.0104, 2),
        nAw = noise(x * 0.0104, z * 0.0104, 3);
      const nBx = noise(x * 0.111, z * 0.111, 0),
        nBy = noise(x * 0.111, z * 0.111, 1);
      const u = (x - SLAB.x0) * SX,
        v = (z - SLAB.z0) * SZ;
      const wu = u + ((nAz - 0.5) * 5 + (nBx - 0.5) * 0.9) * SX,
        wv = v + ((nAw - 0.5) * 5 + (nBy - 0.5) * 0.9) * SZ;
      const sand = smooth(0.25, 0.75, gmSample(wu, wv, 0));
      const wild = gmSample(wu, wv, 1);
      const wear = gmSample(u, v, 2);
      // water + shore
      const wl = model.waterLevel(x, z);
      const above = h - wl;
      const pondish = pond ? ((x - pond.cx) / pond.rx) ** 2 + ((z - pond.cz) / pond.rz) ** 2 < 1.6 : false;
      const mouth = x > 121 && z > 104 && z < 132;
      const naturalShore = pondish || mouth;
      // slope → rock (same rule as the ground shader)
      const gx = (latAt(x + 0.35, z) - latAt(x - 0.35, z)) / 0.7,
        gz = (latAt(x, z + 0.35) - latAt(x, z - 0.35)) / 0.7;
      const ny = 1 / Math.hypot(gx, 1, gz);
      const rock = smooth(0.24, 0.46, 1 - ny + (noise(x * 0.111, z * 0.111, 0) - 0.5) * 0.22);
      const allow = allowImg[q] / 255;
      // ── density
      let dens = allow * (1 - sand) * (1 - rock * 0.95) * (1 - smooth(0.06, 0.8, wear) * 0.92);
      if (above < 0.03) dens = 0;
      // ── length
      const meadowZ = meadowImg[q] / 255,
        mown = meadowImg[q + 1] / 255;
      let len = smooth(0.08, 0.75, wild) * 0.8;
      len = Math.max(len, meadowZ * 0.86);
      len = len * (1 - mown) + Math.min(len, 0.1) * mown;
      const edge = edgeImg[q] / 255;
      len = Math.max(len, Math.min(0.42, edge * 0.55));
      // trampled grass stays short
      len *= 1 - smooth(0.1, 0.5, wear) * 0.7;
      // habitat: wet shores (natural banks only) and dunes
      let hab = 0;
      if (naturalShore && above > -0.5 && above < 0.6 && allow > 0.5) {
        const wet = above < 0 ? smooth(-0.5, -0.12, above) : 1 - smooth(0.15, 0.6, above);
        // reeds come in stands, not a continuous fringe
        const stand = smooth(0.38, 0.62, fbm(x * 0.09, z * 0.09, 41));
        const sv = wet * (0.25 + 0.75 * stand) * (1 - sand * 0.6);
        if (sv > 0.04) {
          hab = Math.round(1 + sv * 99);
          dens = Math.max(dens, sv * 0.85);
          len = Math.max(len, 0.7 + 0.3 * stand);
          stats.wetCells++;
        }
      }
      if (sand > 0.35 && above > 0.25 && !pondish) {
        // dunes: the back of the beach (boardwalk side) and the river-mouth banks
        const back = 1 - smooth(boardwalkX + 3, boardwalkX + 14, x);
        const mouthBank = mouth ? 1 - smooth(0.3, 1.6, Math.abs(above - 0.9)) : 0;
        const tuft = smooth(0.45, 0.7, fbm(x * 0.35, z * 0.35, 77));
        const dv = Math.max(back, mouthBank * 0.8) * tuft * allow;
        if (dv > 0.05 && (o & (OCC.PATH | OCC.SOLID | OCC.BUILDING)) === 0) {
          hab = Math.round(150 + dv * 105);
          dens = Math.max(dens, dv * 0.55);
          len = Math.max(len, 0.62);
          stats.duneCells++;
        }
      }
      // pavement weeds (on hard surfaces, sparse spots)
      const weed = weedImg[q] / 255;
      if (weed > 0.3 && dens < 0.2 && (o & (OCC.BUILDING | OCC.WATER | OCC.SOLID)) === 0) {
        dens = Math.max(dens, weed * 0.85);
        len = Math.max(len, 0.22 + 0.18 * hash2(i >> 2, j >> 2, 5));
        stats.weedCells++;
      }
      const lit = Math.min(1, (litterImg[q] / 255) * 1.6) * (above > 0.05 ? 1 : 0) * ((o & OCC.BUILDING) === 0 ? 1 : 0);
      if (lit > 0.08) stats.litterCells++;
      if (dens > 0.02) {
        stats.grassCells++;
        if (len > 0.5) stats.meadowCells++;
      }
      cover[q] = Math.round(clamp01(dens) * 255);
      cover[q + 1] = Math.round(clamp01(len) * 255);
      cover[q + 2] = hab;
      cover[q + 3] = Math.round(lit * 255);
    }
  }

  mark('combine');
  // ── 9. flowers (0.5 m): species fields at 1 m, niches from the cover map
  const flower = new Uint8Array(FW * FH * 4);
  const SPW = Math.ceil(FW / 2),
    SPH = Math.ceil(FH / 2);
  const spDen = new Float32Array(SPW * SPH);
  const spIdx = new Uint8Array(SPW * SPH);
  for (let j = 0; j < SPH; j++) {
    const z = SLAB.z0 + j + 0.5;
    for (let i = 0; i < SPW; i++) {
      const x = SLAB.x0 + i + 0.5;
      // one patch field per species (different scales → patches 15–60 m), the strongest wins
      const f0 = fbm(x * 0.045, z * 0.045, 101); // poppy
      const f1 = fbm(x * 0.06, z * 0.06, 202) * 0.96; // cornflower
      const f2 = fbm(x * 0.03, z * 0.03, 303) * 1.04; // daisy
      const f3 = fbm(x * 0.05, z * 0.05, 404); // buttercup
      const f4 = fbm(x * 0.07, z * 0.07, 505) * 0.94; // cow parsley
      const f5 = fbm(x * 0.055, z * 0.055, 606) * 0.92; // knapweed / loosestrife
      const fs = [f0, f1, f2, f3, f4, f5];
      let best = 0;
      for (let s = 1; s < 6; s++) if (fs[s] > fs[best]) best = s;
      spIdx[j * SPW + i] = best;
      spDen[j * SPW + i] = smooth(0.5, 0.72, fs[best]);
    }
  }
  for (let j = 0; j < FH; j++) {
    const z = SLAB.z0 + (j + 0.5) * FRES;
    for (let i = 0; i < FW; i++) {
      const x = SLAB.x0 + (i + 0.5) * FRES;
      const q = (j * FW + i) * 4;
      // cover texels under this flower texel (2×2): mean density + length, habitat, litter
      let dn = 0,
        ln = 0,
        wet = 0,
        lit = 0;
      for (let dj = 0; dj < 2; dj++)
        for (let di = 0; di < 2; di++) {
          const c = ((j * 2 + dj) * CW + i * 2 + di) * 4;
          dn += cover[c] / 255;
          ln += cover[c + 1] / 255;
          const hb = cover[c + 2];
          if (hb > 0 && hb <= 100) wet += hb / 100;
          lit += cover[c + 3] / 255;
        }
      dn /= 4;
      ln /= 4;
      wet /= 4;
      lit /= 4;
      const sp = (j >> 1) * SPW + (i >> 1);
      let s = spIdx[sp];
      let fd = spDen[sp];
      // niches: blue/purple love the damp, cow parsley the shade and hedge feet
      if (wet > 0.2) {
        s = fd > 0.5 && s === 2 ? 2 : 5;
        fd = Math.max(fd, wet * 0.6);
      } else if (lit > 0.25 && s !== 4) fd *= 0.6;
      const meadow = smooth(0.42, 0.62, ln) * smooth(0.15, 0.5, dn);
      flower[q] = Math.round(clamp01(fd * meadow) * 255);
      flower[q + 1] = Math.round(((s + 0.5) / 6) * 255);
      // lawn flowers: daisy / dandelion / clover drifts in the mown grass
      const lawn = (1 - smooth(0.12, 0.3, ln)) * smooth(0.3, 0.7, dn);
      const lf = smooth(0.48, 0.72, fbm(x * 0.11, z * 0.11, 707)) * 0.85 + smooth(0.6, 0.8, fbm(x * 0.4, z * 0.4, 808)) * 0.25;
      flower[q + 2] = Math.round(clamp01(lf * lawn) * 255);
      flower[q + 3] = Math.round(gmSample((x - SLAB.x0) * SX, (z - SLAB.z0) * SZ, 3) * 255);
    }
  }

  mark('flowers');
  // ── 10. textures
  const mk = (data: Uint8Array, w: number, h: number) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.flipY = false; // row 0 = north (z0)
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const texCover = mk(cover, CW, CH);
  const texFlower = mk(flower, FW, FH);
  const half = new Uint16Array(CW * CH);
  for (let p = 0; p < half.length; p++) half[p] = THREE.DataUtils.toHalfFloat(height[p]);
  const texHeight = new THREE.DataTexture(half, CW, CH, THREE.RedFormat, THREE.HalfFloatType);
  texHeight.flipY = false;
  texHeight.colorSpace = THREE.NoColorSpace;
  texHeight.magFilter = THREE.NearestFilter;
  texHeight.minFilter = THREE.NearestFilter;
  texHeight.generateMipmaps = false;
  texHeight.needsUpdate = true;

  // ── 11. per-tile metadata for the CPU ring walker (finest 2 m grid, then aggregated)
  const grids: TileGrid[] = RING_TILE.map((size) => {
    const nx = Math.ceil((SLAB.x1 - SLAB.x0) / size),
      nz = Math.ceil((SLAB.z1 - SLAB.z0) / size);
    return { size, nx, nz, flags: new Uint8Array(nx * nz), ymin: new Float32Array(nx * nz).fill(1e9), ymax: new Float32Array(nx * nz).fill(-1e9) };
  });
  for (let j = 0; j < CH; j++) {
    for (let i = 0; i < CW; i++) {
      const p = j * CW + i,
        q = p * 4;
      const d = cover[q],
        lt = cover[q + 3];
      if (d < 6 && lt < 20) continue;
      let fl = d >= 6 ? 1 : 0;
      if (d >= 6 && (cover[q + 1] > 70 || cover[q + 2] > 0)) fl |= 2;
      if (lt >= 20) fl |= 8;
      const fq = ((j >> 1) * FW + (i >> 1)) * 4;
      if (flower[fq] > 20 || flower[fq + 2] > 30) fl |= 4;
      const y = height[p];
      for (const g of grids) {
        const tpx = g.size / CRES;
        const t = Math.floor(j / tpx) * g.nx + Math.floor(i / tpx);
        g.flags[t] |= fl;
        if (y < g.ymin[t]) g.ymin[t] = y;
        if (y > g.ymax[t]) g.ymax[t] = y;
      }
    }
  }

  mark('tex+tiles');
  // ── 12. flower patches for life (butterflies, bees): 8 m cells with enough flowers
  const patches: FlowerPatch[] = [];
  const PC = 8;
  const pcx = Math.floor((SLAB.x1 - SLAB.x0) / PC),
    pcz = Math.floor((SLAB.z1 - SLAB.z0) / PC);
  const per = PC / FRES;
  for (let cj = 0; cj < pcz; cj++) {
    for (let ci = 0; ci < pcx; ci++) {
      let sum = 0;
      const cnt = new Float32Array(6);
      for (let j = cj * per; j < (cj + 1) * per; j++) {
        for (let i = ci * per; i < (ci + 1) * per; i++) {
          const q = (j * FW + i) * 4;
          const fd = flower[q] / 255 + (flower[q + 2] / 255) * 0.4;
          sum += fd;
          cnt[Math.min(5, Math.floor((flower[q + 1] / 255) * 6))] += flower[q] / 255;
        }
      }
      const mean = sum / (per * per);
      if (mean < 0.12) continue;
      let best = 0;
      for (let s = 1; s < 6; s++) if (cnt[s] > cnt[best]) best = s;
      patches.push({ x: SLAB.x0 + (ci + 0.5) * PC, z: SLAB.z0 + (cj + 0.5) * PC, r: PC * 0.6, density: Math.min(1, mean), species: SPECIES[best] });
    }
  }

  const densityAt = (x: number, z: number): number => {
    const i = Math.floor((x - SLAB.x0) / CRES),
      j = Math.floor((z - SLAB.z0) / CRES);
    if (i < 0 || j < 0 || i >= CW || j >= CH) return 0;
    return cover[(j * CW + i) * 4] / 255;
  };

  mark('patches');
  return { cover, flower, height, texCover, texFlower, texHeight, grids, patches, densityAt, buildMs: performance.now() - t0, phases: phases.join(' · '), stats };
}
