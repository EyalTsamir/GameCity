// Trees of the countryside: forest (closed woods within reach of the town; further out the canopy
// is part of the terrain surface), hedgerows on the field borders (landscape/fields.ts parcels),
// lone pasture oaks, orchards, river-bank willows and poplars, dune pines, farmyard trees.
//
// Two representations of the same instance list:
//   • near — low-poly 3D trees (4 InstancedMeshes: broadleaf, conifer, poplar, small/bush) holding the
//     instances within NEAR_R of the camera; rebuilt when the camera has moved NEAR_STEP m (cheap tile
//     walk, no per-frame allocation), cast shadows;
//   • far — one instanced camera-facing impostor quad per tree (sprite atlas raytraced at boot from
//     clumps of leaf spheres: albedo + normals, lit like the 3D trees). The vertex shader collapses
//     the impostors inside the near set's radius around the camera position of the last rebuild,
//     so each tree is drawn exactly once.

import * as THREE from 'three';
import type { LandscapeModel } from './model';
import { WL, CX, CZ } from './model';
import { FROW, toField, fromField, rowB, colB, colOff, colW, rowHedge, colHedge, lhash, fieldsOfParcel, cropKind, plotHedge, CK } from './fields';
import { hash2i, vnoise, smooth } from './noise';
import { MOTION_KEEP_GLSL, WIND_GLSL } from '../../core/wind';
import { globalUniforms } from '../../core/uniforms';
import { SLAB } from '../../core/constants';
import type { HedgeSink } from './farmkit';
import { natureOn, moonLift } from '../../core/nature';

/** country crowns: their shade was near black against the town's trees; more sky in it */
const FILL = natureOn('treefill');

export const KIND = { broad: 0, conifer: 1, poplar: 2, small: 3, oak: 4, pine: 5, olive: 6, cypress: 7 } as const;
const NK = 8;
// (?notreekinds: every tree one of the first four, as before)
const SPECIES = natureOn('treekinds');

/** 3D trees within this radius of the camera (m); round crowns read the same as impostors beyond */
const NEAR_R = 125;
/** rebuild the near set after the camera moved this far (m) */
const NEAR_STEP = 18;
/** per-kind cap of 3D instances */
const NEAR_CAP = [1100, 1500, 500, 3000, 500, 400, 700, 400];
const TILE = 64;
/** camera travel (m) after which the far impostors are re-sorted near → far */
const FAR_SORT = 90;
/** typical crown width / height per kind: leaf cards are pre-squashed so they stay square in the world */
const KIND_ASPECT = [0.85, 0.55, 0.35, 1.25, 1.3, 0.9, 1.1, 0.2];
/** leaf cards use uv 0..LEAF_U of the leaf texture; bark / core cones sample the solid corner */
const LEAF_U = 0.875;
const SOLID_UV = 0.95;

/** procedural leaf-cluster texture: R = leaf shade, A = coverage (one cluster, ragged edge, gaps). Small leaves: a crown of
 *  table-sized leaves is what gave the old trees away at 20–60 m. */
function leafTexture(): THREE.DataTexture {
  const S = 256,
    C = Math.round(S * LEAF_U);
  const data = new Uint8Array(S * S * 4);
  for (let y = C + 2; y < S; y++)
    for (let x = C + 2; x < S; x++) {
      const o = (y * S + x) * 4;
      data[o] = 200;
      data[o + 3] = 255;
    }
  const N = 300;
  for (let i = 0; i < N; i++) {
    // deeper leaves first, the outer ones on top; a thin scatter beyond the edge breaks the silhouette
    const r = Math.sqrt(hash2i(i, 1, 5101)) * 0.46 * C,
      a = hash2i(i, 2, 5101) * Math.PI * 2;
    const cx = C / 2 + Math.cos(a) * r,
      cy = C / 2 + Math.sin(a) * r;
    if (r > 0.34 * C && hash2i(i, 7, 5101) < 0.45) continue;
    const d = a + (hash2i(i, 3, 5101) - 0.5) * 2.2;
    const len = C * (0.07 + 0.045 * hash2i(i, 4, 5101));
    const wid = len * 0.46;
    const shade = (0.5 + 0.34 * hash2i(i, 5, 5101) + 0.12 * (r / (0.4 * C)) - 0.1 * Math.sin(a)) * (0.72 + 0.28 * (i / N));
    const dx = Math.cos(d),
      dy = Math.sin(d);
    const R = Math.ceil(len * 0.55);
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(C - 1, Math.ceil(cy + R)); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(C - 1, Math.ceil(cx + R)); x++) {
        const px = x + 0.5 - cx,
          py = y + 0.5 - cy;
        const u = px * dx + py * dy,
          v = -px * dy + py * dx;
        const t = u / (len * 0.5);
        if (t < -1 || t > 1) continue;
        const hw = wid * 0.5 * Math.sqrt(1 - t * t) * (1 - 0.25 * t);
        if (Math.abs(v) > hw) continue;
        const sh = shade * (0.88 + 0.16 * Math.min(1, Math.abs(v) / Math.max(hw, 0.5)));
        const o = (y * S + x) * 4;
        data[o] = Math.round(Math.min(1, sh / 1.3) * 255);
        data[o + 3] = 255;
      }
  }
  // bleed the mean leaf shade into the transparent texels: the mips must not average leaves with black
  let sum = 0,
    cnt = 0;
  for (let o = 0; o < data.length; o += 4)
    if (data[o + 3] > 0) {
      sum += data[o];
      cnt++;
    }
  const mean = cnt ? Math.round(sum / cnt) : 160;
  for (let o = 0; o < data.length; o += 4) if (data[o + 3] === 0) data[o] = mean;
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export interface TreeList {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** total height, crown width (m) */
  h: Float32Array;
  w: Float32Array;
  yaw: Float32Array;
  kind: Uint8Array;
  /** 0..1 colour variation */
  tint: Float32Array;
}

class Builder {
  x: number[] = [];
  y: number[] = [];
  z: number[] = [];
  h: number[] = [];
  w: number[] = [];
  yaw: number[] = [];
  kind: number[] = [];
  tint: number[] = [];
  blocked?: (x: number, z: number, r: number) => boolean;
  add(x: number, y: number, z: number, h: number, w: number, kind: number, seed: number): void {
    if (this.blocked?.(x, z, w * 0.35)) return; // no crown through a roof (F4 bug 2)
    this.x.push(x);
    this.y.push(y);
    this.z.push(z);
    this.h.push(h);
    this.w.push(w);
    this.yaw.push(hash2i(seed, 3, 901) * Math.PI * 2);
    this.kind.push(kind);
    this.tint.push(hash2i(seed, 5, 902));
  }
  done(): TreeList {
    return {
      n: this.x.length,
      x: Float32Array.from(this.x),
      y: Float32Array.from(this.y),
      z: Float32Array.from(this.z),
      h: Float32Array.from(this.h),
      w: Float32Array.from(this.w),
      yaw: Float32Array.from(this.yaw),
      kind: Uint8Array.from(this.kind),
      tint: Float32Array.from(this.tint),
    };
  }
}

/** place every countryside tree (deterministic) */
export function placeTrees(model: LandscapeModel, density: number, forestHint?: (x: number, z: number) => number, blocked?: (x: number, z: number, r: number) => boolean, hedges?: HedgeSink | null): { list: TreeList; ms: number } {
  const t0 = performance.now();
  const B = new Builder();
  B.blocked = blocked;
  const H = model.height;
  let seed = 1;
  const slabD = model.slabDist;
  /** dry, open land outside the slab, not in a settlement core / river / beach / rock */
  const rh = { d: 0, i: 0, s: 0, level: 0, tx: 1, tz: 0 };
  const landOK = (x: number, z: number, y: number, minSlab = 2): boolean => {
    if (slabD(x, z) < minSlab) return false;
    if (y < WL + 0.35) return false;
    if (model.road(x, z, rh, 10) && rh.d < model.roads[rh.i].halfW + 2.5) return false;
    return true;
  };
  const rv = { d: 0, halfW: 8, s: 0, tx: 1, tz: 0 };

  // ── forest within reach of the town and the free camera (beyond CANOPY_NEAR the woods are terrain)
  {
    const R = 800;
    const cell = 7.2 / Math.sqrt(Math.max(0.5, density));
    for (let gx = Math.floor((SLAB.x0 - R) / cell); gx <= Math.ceil((SLAB.x1 + R) / cell); gx++) {
      for (let gz = Math.floor((SLAB.z0 - R) / cell); gz <= Math.ceil((SLAB.z1 + R) / cell); gz++) {
        const x = (gx + 0.15 + 0.7 * hash2i(gx, gz, 11)) * cell;
        const z = (gz + 0.15 + 0.7 * hash2i(gx, gz, 12)) * cell;
        const sd = slabD(x, z);
        if (sd < 2.5 || sd > R) continue;
        // (cheap pre-test from the land vertices' forest cover: most cells are open land)
        if (forestHint && forestHint(x, z) < 0.12) continue;
        const y = H(x, z);
        if (!landOK(x, z, y)) continue;
        const f = model.forestAt(x, z, y);
        if (f < 0.3) continue;
        // the vegetation module continues its ridge forest ~45 m beyond the slab's north edge (and the
        // NW / NE corners): start ours behind that band with a soft 15 m overlap
        const band = z < SLAB.z0 + 40 ? smooth(33, 48, sd) : 1;
        if (hash2i(gx, gz, 13) > smooth(0.3, 0.75, f) * band) continue;
        if (model.cliffness(x, z) > 0.5 && model.coastSD(x, z) < 25) continue;
        // conifer stands up the hills, mixed woods lower down
        const stand = vnoise(x / 140, z / 140, 14);
        const conP = Math.min(0.85, 0.25 + 0.35 * smooth(10, 60, y) + 0.4 * (stand - 0.5));
        const r = hash2i(gx, gz, 15);
        let kind: number = r < conP ? KIND.conifer : r > 0.96 ? KIND.poplar : KIND.broad;
        const r2 = hash2i(gx, gz, 18);
        if (SPECIES && kind === KIND.broad && r2 < 0.42) kind = KIND.oak;
        // stone pine stands on the warm seaward slopes
        if (SPECIES && kind === KIND.conifer && model.coastSD(x, z) < 330 && r2 < 0.6) kind = KIND.pine;
        const age = 0.65 + 0.5 * hash2i(gx, gz, 16);
        const hh = kind === KIND.conifer ? 15 * age + 3 : kind === KIND.poplar ? 20 * age : kind === KIND.pine ? 13 * age + 4 : 13 * age + 2;
        const ww = kind === KIND.conifer ? hh * 0.36 : kind === KIND.poplar ? hh * 0.3 : kind === KIND.pine ? hh * 0.72 : hh * (0.62 + 0.2 * hash2i(gx, gz, 17));
        B.add(x, y, z, hh, ww, kind, seed++);
      }
    }
  }

  // ── hedgerows + lone trees + orchards on the farmland
  {
    const R = 2600;
    const cityR = (x: number, z: number) => Math.hypot(x - CX, z - CZ);
    const q = { x: 0, y: 0 };
    const w = { x: 0, z: 0 };
    // field-frame bounds of the area
    const corners = [
      [SLAB.x0 - R, SLAB.z0 - R],
      [SLAB.x1 + R, SLAB.z0 - R],
      [SLAB.x0 - R, SLAB.z1 + R],
      [SLAB.x1 + R, SLAB.z1 + R],
    ];
    let qx0 = Infinity,
      qx1 = -Infinity,
      qy0 = Infinity,
      qy1 = -Infinity;
    for (const [cx, cz] of corners) {
      toField(cx, cz, q);
      qx0 = Math.min(qx0, q.x);
      qx1 = Math.max(qx1, q.x);
      qy0 = Math.min(qy0, q.y);
      qy1 = Math.max(qy1, q.y);
    }
    /** arable test for a hedge / field point (cheap) */
    const arable = (x: number, z: number, y: number): boolean => {
      if (!landOK(x, z, y, 6)) return false;
      if (model.forestAt(x, z, y) > 0.3) return false;
      if (model.siteAt(x, z, 8) >= 0) return false;
      if (model.coastSD(x, z) < 90) return false;
      if (x < -150 && model.river(x, z, rv) && rv.d < rv.halfW + 7) return false;
      if (y > 320) return false;
      return true;
    };
    const hedgeLine = (ax: number, ay: number, bx: number, by: number, key: number) => {
      // ax..bx / ay..by in field space; one of them constant
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.floor(len / 2.7);
      let nextTree = 6 + 18 * lhash(key, 1);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const fx = ax + (bx - ax) * t,
          fy = ay + (by - ay) * t;
        fromField(fx, fy, w);
        const d = cityR(w.x, w.z);
        if (d > R) continue;
        const near = slabD(w.x, w.z) < 760;
        // hedges break up: gaps, gates
        if (vnoise(fx / 23 + key * 0.37, fy / 23, 21) < 0.28) {
          hedges?.gap();
          continue;
        }
        const y = H(w.x, w.z);
        if (!arable(w.x, w.z, y)) {
          hedges?.gap();
          continue;
        }
        const s = lhash(key * 977 + i, 2);
        // jitter across the line
        const jx = (lhash(key * 977 + i, 3) - 0.5) * 1.2;
        fromField(fx + (ax === bx ? jx : 0), fy + (ay === by ? jx : 0), w);
        if (i * 2.7 >= nextTree) {
          const r = lhash(key * 977 + i, 5);
          if (SPECIES) {
            // groups of two or three with long open hedge between them; a young one beside an old one
            const g4 = lhash(key * 977 + i, 4);
            nextTree += g4 < 0.45 ? 5 + 5 * s : 24 + 62 * g4;
            const kind = r < 0.34 ? KIND.oak : r < 0.62 ? KIND.broad : r < 0.72 ? KIND.poplar : r < 0.8 ? KIND.cypress : r < 0.86 ? KIND.conifer : KIND.small;
            const age = 0.55 + 0.6 * s;
            const hh = kind === KIND.poplar ? 13 + 9 * s : kind === KIND.cypress ? 9 + 7 * s : kind === KIND.conifer ? 9 + 6 * s : kind === KIND.small ? 4.5 + 2.5 * s : kind === KIND.oak ? 11 * age + 2 : 12 * age + 2;
            const ww = kind === KIND.oak ? hh * (1.0 + 0.3 * s) : kind === KIND.broad ? hh * (0.72 + 0.2 * s) : kind === KIND.small ? hh * 1.1 : kind === KIND.cypress ? hh * 0.2 : hh * 0.33;
            B.add(w.x, H(w.x, w.z), w.z, hh, ww, kind, seed++);
          } else {
            nextTree += 7 + 20 * lhash(key * 977 + i, 4);
            const kind = r < 0.12 ? KIND.conifer : r < 0.2 ? KIND.poplar : KIND.broad;
            const hh = kind === KIND.poplar ? 17 + 8 * s : kind === KIND.conifer ? 11 + 7 * s : 9 + 9 * s;
            B.add(w.x, H(w.x, w.z), w.z, hh, kind === KIND.broad ? hh * (0.7 + 0.25 * s) : hh * 0.33, kind, seed++);
          }
        } else if (near) {
          // the hedge itself: bushes
          const hh = 2.3 + 1.6 * s;
          if (hedges) hedges.add(w.x, H(w.x, w.z), w.z, hh, key);
          else B.add(w.x, H(w.x, w.z), w.z, hh, hh * (1.1 + 0.4 * lhash(key * 977 + i, 6)), KIND.small, seed++);
        }
      }
    };
    const k0 = Math.floor(qy0 / FROW) - 1,
      k1 = Math.ceil(qy1 / FROW) + 1;
    for (let k = k0; k <= k1; k++) {
      const y0 = rowB(k),
        y1 = rowB(k + 1);
      if (rowHedge(k)) hedgeLine(qx0, y0, qx1, y0, k * 131 + 7);
      const cw = colW(k),
        off = colOff(k);
      const j0 = Math.floor((qx0 - off) / cw) - 1,
        j1 = Math.ceil((qx1 - off) / cw) + 1;
      for (let j = j0; j <= j1; j++) {
        const xb = colB(k, j) + off;
        if (colHedge(k, j)) hedgeLine(xb, y0, xb, y1, k * 7919 + j * 31 + 3);
        // parcel content: lone oaks in pastures, orchards
        const cx = (xb + colB(k, j + 1) + off) / 2,
          cy = (y0 + y1) / 2;
        fromField(cx, cy, w);
        if (cityR(w.x, w.z) > R) continue;
        const plots = fieldsOfParcel(cx, cy);
        // smallholding: hedges / tree lines on (some of) the borders between the plots
        if (plots.length && plots[0].small) {
          const ppid = k * 13 + j;
          const px0 = xb,
            px1 = colB(k, j + 1) + off;
          const { nx, ny } = plots[0];
          for (let i = 1; i < nx; i++)
            if (plotHedge(ppid, 0, i, nx, ny)) {
              const x = px0 + ((px1 - px0) * i) / nx;
              hedgeLine(x, y0, x, y1, ppid * 53 + i * 5 + 11);
            }
          for (let i = 1; i < ny; i++)
            if (plotHedge(ppid, 1, i, nx, ny)) {
              const y = y0 + ((y1 - y0) * i) / ny;
              hedgeLine(px0, y, px1, y, ppid * 59 + i * 5 + 13);
            }
        }
        for (const P of plots) {
        fromField((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, w);
        const ck = cropKind(P.crop, P.small, model.grazing(w.x, w.z), P.tun);
        const pk = P.pid;
        if (ck === CK.pasture && lhash(pk, 61) < (P.small ? 0.35 : 0.55)) {
          // pasture oak
          const fx = P.x0 + (P.x1 - P.x0) * (0.2 + 0.6 * lhash(pk, 62));
          const fy = P.y0 + (P.y1 - P.y0) * (0.2 + 0.6 * lhash(pk, 63));
          fromField(fx, fy, w);
          const y = H(w.x, w.z);
          if (arable(w.x, w.z, y)) B.add(w.x, y, w.z, 11 + 6 * lhash(pk, 64), 14 + 7 * lhash(pk, 65), SPECIES ? KIND.oak : KIND.broad, seed++);
        } else if (ck === CK.orchard && cityR(w.x, w.z) < 1900) {
          // orchard rows
          const ox0 = P.x0 + 4,
            ox1 = P.x1 - 4,
            oy0 = P.y0 + 4,
            oy1 = P.y1 - 4;
          for (let fy = oy0; fy <= oy1; fy += 7.5) {
            for (let fx = ox0; fx <= ox1; fx += 6.5) {
              fromField(fx, fy, w);
              const y = H(w.x, w.z);
              if (!arable(w.x, w.z, y)) continue;
              const s = lhash(Math.round(fx * 3) ^ pk, Math.round(fy * 3));
              if (s < 0.06) continue; // a missing tree here and there
              if (SPECIES && lhash(pk, 66) < 0.55) B.add(w.x, y, w.z, 3.6 + 2.2 * s, 4.2 + 2.2 * s, KIND.olive, seed++);
              else B.add(w.x, y, w.z, 4.2 + 1.6 * s, 4.8 + 1.4 * s, KIND.small, seed++);
            }
          }
        }
        }
      }
    }
  }

  // ── river banks: willows, alders, poplars (with gaps)
  {
    const L = model.riverLine;
    const p = { x: 0, z: 0 };
    for (let s = 6; s < Math.min(L.length, 3600); s += 4) {
      for (const side of [-1, 1]) {
        const g = vnoise(s / 60, side * 3.3, 31);
        if (g < 0.42) continue;
        if (hash2i(Math.round(s), side, 32) > 0.38) continue;
        L.at(s, p);
        L.at(s + 2, w2);
        const tx = w2.x - p.x,
          tz = w2.z - p.z;
        const tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl,
          nz = tx / tl;
        const halfW = 8 + 5.5 * smooth(0, 420, s) - 3.5 * smooth(2600, 6000, s);
        const off = halfW + 2.5 + 6 * hash2i(Math.round(s), side, 33);
        const x = p.x + nx * off * side,
          z = p.z + nz * off * side;
        if (slabD(x, z) < 3) continue;
        const y = H(x, z);
        if (y < WL + 0.3) continue;
        const r = hash2i(Math.round(s), side, 34);
        const kind = r < 0.22 ? KIND.poplar : KIND.broad;
        const hh = kind === KIND.poplar ? 18 + 6 * r : 9 + 7 * r;
        B.add(x, y, z, hh, kind === KIND.poplar ? hh * 0.3 : hh * 0.95, kind, seed++);
      }
    }
  }

  // ── dune pines behind the southern beach, a few wind-bent trees on the cliff tops
  {
    const dc = { water: 0, sand: 0, rock: 0, forest: 0, field: 0, meadow: 0, wet: 0 };
    for (let i = 0; i < (SPECIES ? 2600 : 900); i++) {
      const z = 160 + 560 * hash2i(i, 1, 41);
      const x = 60 + 520 * hash2i(i, 2, 41);
      const sd = model.coastSD(x, z);
      if (sd < 55 || sd > (SPECIES ? 150 : 240)) continue;
      const y = H(x, z);
      if (!landOK(x, z, y, 8)) continue;
      if (vnoise(x / 70, z / 70, 42) < 0.45) continue;
      // on the dunes / coastal meadow, never in a field
      if (model.cover(x, z, dc, y).field > 0.3) continue;
      const s = hash2i(i, 3, 41);
      if (SPECIES) B.add(x, y, z, 9 + 7 * s, 7.5 + 5 * s, KIND.pine, seed++);
      else B.add(x, y, z, 8 + 6 * s, 7 + 4 * s, KIND.conifer, seed++);
    }
    // dune scrub: low bushes in clumps on the back dunes (the shader darkens the same ground)
    for (let i = 0; i < (SPECIES ? 5200 : 2600); i++) {
      const z = 150 + 620 * hash2i(i, 4, 43);
      const x = 60 + 560 * hash2i(i, 5, 43);
      const sd = model.coastSD(x, z);
      if (sd < 26 || sd > (SPECIES ? 135 : 95)) continue;
      // a few thickets, not a dotted carpet (dark dots read as a leopard pattern from the hero view)
      if (vnoise(x / 45, z / 45, 44) < 0.6) continue;
      const y = H(x, z);
      if (!landOK(x, z, y, 3)) continue;
      model.cover(x, z, dc, y);
      if ((!SPECIES && dc.sand < 0.06) || dc.field > 0.2) continue;
      const s = hash2i(i, 6, 43);
      const hh = 1.2 + 1.5 * s;
      B.add(x, y, z, hh, hh * (1.3 + 0.6 * hash2i(i, 7, 43)), KIND.small, seed++);
    }
  }

  // ── the hill country north and west, out to 4 km: copses on the crests, tree lines down the gullies and along the old field
  // walls (billboards only: 15 m is 6 px from the town). Bare hills read as felt at noon and as sand at sunset.
  if (SPECIES && natureOn('hillscatter')) {
    const cell = 38;
    for (let gx = -130; gx <= 40; gx++) {
      for (let gz = -120; gz <= 20; gz++) {
        const x = (gx + hash2i(gx, gz, 71)) * cell,
          z = (gz + hash2i(gx, gz, 72)) * cell;
        const dS = slabD(x, z);
        if (dS < 720 || dS > 4200) continue;
        if (model.coastSD(x, z) < 150) continue;
        // copses: patches of a noise; lines: the noise's contour (a thin band wanders across the slope)
        const n1 = vnoise(x / 170, z / 170, 73);
        const n2 = vnoise(x / 410, z / 410, 74);
        const copse = n1 > 0.66;
        const line = Math.abs(n2 - 0.5) < 0.014 || Math.abs(vnoise(x / 260 + 5, z / 260, 75) - 0.47) < 0.012;
        if (!copse && !line) continue;
        if (hash2i(gx, gz, 76) > (copse ? 0.8 : 0.9)) continue;
        const y = H(x, z);
        if (!landOK(x, z, y, 10) || y < 3) continue;
        if (model.siteAt(x, z, 14) >= 0) continue;
        if (model.forestAt(x, z, y) > 0.3) continue;
        if (x < -150 && model.river(x, z, rv) && rv.d < rv.halfW + 12) continue;
        const r = hash2i(gx, gz, 77);
        const kind = r < 0.5 ? KIND.oak : r < 0.75 ? KIND.broad : r < 0.9 ? KIND.cypress : KIND.conifer;
        const s = hash2i(gx, gz, 78);
        const hh = kind === KIND.cypress ? 11 + 6 * s : 10 + 8 * s;
        B.add(x, y, z, hh, kind === KIND.cypress ? hh * 0.2 : kind === KIND.conifer ? hh * 0.36 : hh * 1.05, kind, seed++);
      }
    }
  }

  // ── settlements: yard trees and windbreaks
  for (const site of model.sites) {
    const n = site.kind === 'farm' ? 7 : site.kind === 'hamlet' ? 14 : site.town ? 70 : 34;
    for (let i = 0; i < n; i++) {
      const a = hash2i(site.seed, i, 51) * Math.PI * 2;
      const rr = site.town ? site.r * (1.04 + 0.7 * Math.pow(hash2i(site.seed, i, 52), 1.5)) : site.r * (0.45 + 0.75 * hash2i(site.seed, i, 52));
      const x = site.x + Math.cos(a) * rr,
        z = site.z + Math.sin(a) * rr;
      const y = H(x, z);
      if (!landOK(x, z, y, 10)) continue;
      const r = hash2i(site.seed, i, 53);
      const kind = site.town ? (r < 0.42 ? KIND.cypress : KIND.olive) : SPECIES ? (r < 0.2 ? KIND.cypress : r < 0.3 ? KIND.poplar : r < 0.5 ? KIND.olive : r < 0.7 ? KIND.oak : KIND.broad) : r < 0.25 ? KIND.conifer : r < 0.35 ? KIND.poplar : KIND.broad;
      const hh = kind === KIND.poplar ? 16 + 6 * r : kind === KIND.cypress ? 11 + 7 * r : kind === KIND.olive ? 4 + 2 * r : 8 + 8 * r;
      B.add(x, y, z, hh, kind === KIND.broad || kind === KIND.oak || kind === KIND.olive ? hh * 0.9 : kind === KIND.cypress ? hh * 0.2 : hh * 0.33, kind, seed++);
    }
  }

  if (SPECIES && natureOn('avenues')) {
    // a cypress drive up to a good many of the farms: the line the eye picks out from anywhere
    for (const site of model.sites) {
      if (site.kind !== 'farm' || hash2i(site.seed, 1, 61) > 0.5 || slabD(site.x, site.z) > 1900) continue;
      const a = hash2i(site.seed, 2, 61) * Math.PI * 2;
      const dx = Math.cos(a),
        dz = Math.sin(a);
      const n = 6 + Math.floor(hash2i(site.seed, 3, 61) * 9);
      for (let i = 0; i < n; i++) {
        for (const side of [-1, 1]) {
          const d = site.r * 0.9 + i * 8.5;
          const x = site.x + dx * d - dz * side * 3.4,
            z = site.z + dz * d + dx * side * 3.4;
          const y = H(x, z);
          if (!landOK(x, z, y, 8) || model.siteAt(x, z, -4) >= 0 || model.coastSD(x, z) < 60) continue;
          if (hash2i(site.seed * 7 + i, side, 62) < 0.08) continue; // a lost one
          const s = hash2i(site.seed * 7 + i, side, 63);
          const hh = 11 + 5 * s;
          B.add(x, y, z, hh, hh * 0.19, KIND.cypress, seed++);
        }
      }
    }
    // stretches of country road lined with trees: plane-like near the villages, pines toward the coast
    for (const r of model.roads) {
      if (r.kind !== 'road') continue;
      const L = r.line;
      const p = { x: 0, z: 0 },
        p2 = { x: 0, z: 0 };
      for (let s = 40; s < Math.min(L.length, 3600); s += 13) {
        if (vnoise(s / 260, r.halfW * 3, 64) < 0.5) continue;
        L.at(s, p);
        L.at(s + 2, p2);
        const tx = p2.x - p.x,
          tz = p2.z - p.z;
        const tl = Math.hypot(tx, tz) || 1;
        for (const side of [-1, 1]) {
          if (hash2i(Math.round(s), side, 65) < 0.1) continue;
          const off = r.halfW + 3.6;
          const x = p.x + (-tz / tl) * off * side,
            z = p.z + (tx / tl) * off * side;
          const y = H(x, z);
          if (y < WL + 0.4 || model.siteAt(x, z, 2) >= 0) continue;
          const u = hash2i(Math.round(s), side, 66);
          const hh = 13 + 5 * u;
          B.add(x, y, z, hh, hh * 0.72, KIND.broad, seed++);
        }
      }
    }
  }
  return { list: B.done(), ms: performance.now() - t0 };
}
const w2 = { x: 0, z: 0 };

// ───────────────────────────────────────────────────── geometry ──

/** a crown is a cluster of leaf clumps (spheres in tree units: x/z × crown width, y × height) */
interface Clump {
  x: number;
  y: number;
  z: number;
  r: number;
}
interface Shape {
  clumps: Clump[];
  /** conifer tiers: [y bottom, y top, radius] */
  tiers: [number, number, number][];
  trunkTop: number;
  trunkR: number;
  /** branch tips (from the trunk top) */
  branches: [number, number, number][];
  /** limb thickness (× the trunk radius) */
  limb?: number;
  /** the trunk's lean (tree units at its top) */
  bend?: number;
}

/** shared by the 3D near trees and the impostor atlas, so both read alike */
function shapeOf(kind: number): Shape {
  const sh: Shape = { clumps: [], tiers: [], trunkTop: 0.45, trunkR: 0.035, branches: [] };
  const rnd = (i: number, k: number) => hash2i(kind * 100 + i, k, 4417);
  if (kind === KIND.broad) {
    // lime / ash: an oval crown from low on the trunk, a darker core and an irregular shell of leaf masses with gaps
    sh.clumps.push({ x: 0, y: 0.56, z: 0, r: 0.21 });
    sh.clumps.push({ x: 0.03, y: 0.76, z: -0.02, r: 0.16 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 7 + (rnd(i, 1) - 0.5) * 0.9;
      const y = 0.36 + 0.54 * (i / 9) + (rnd(i, 3) - 0.5) * 0.07;
      const rr = (0.3 + 0.1 * rnd(i, 2)) * Math.sqrt(Math.max(0.12, 1 - Math.pow((y - 0.52) / 0.5, 2)));
      sh.clumps.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, r: 0.09 + 0.08 * rnd(i, 4) });
      if (i < 7) sh.branches.push([Math.cos(a) * rr * 0.75, y - 0.04, Math.sin(a) * rr * 0.75]);
    }
    sh.trunkTop = 0.34;
    sh.trunkR = 0.04;
  } else if (kind === KIND.oak) {
    // a field oak: short thick bole, heavy limbs spreading wide, a flat-bottomed dome
    sh.clumps.push({ x: 0, y: 0.62, z: 0, r: 0.2 });
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 9 + (rnd(i, 1) - 0.5) * 0.7;
      const u = rnd(i, 3);
      const y = 0.4 + 0.42 * u;
      const rr = (0.39 + 0.08 * rnd(i, 2)) * Math.sqrt(Math.max(0.08, 1 - u * u * 0.92));
      sh.clumps.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, r: 0.085 + 0.07 * rnd(i, 4) });
      if (i < 8) sh.branches.push([Math.cos(a) * rr * 0.82, y - 0.03, Math.sin(a) * rr * 0.82]);
    }
    sh.trunkTop = 0.26;
    sh.trunkR = 0.038;
    sh.limb = 0.72;
  } else if (kind === KIND.pine) {
    // stone pine: a tall bare stem, limbs forking high, a flat umbrella
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 5 + (rnd(i, 1) - 0.5) * 0.5;
      const rr = i === 0 ? 0 : 0.14 + 0.28 * rnd(i, 2);
      const y = 0.84 + 0.08 * (1 - rr / 0.42) + (rnd(i, 3) - 0.5) * 0.03;
      sh.clumps.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, r: 0.12 + 0.05 * rnd(i, 4) });
      if (i) sh.branches.push([Math.cos(a) * rr * 0.85, y - 0.04, Math.sin(a) * rr * 0.85]);
    }
    sh.trunkTop = 0.68;
    sh.trunkR = 0.034;
    sh.limb = 0.55;
  } else if (kind === KIND.olive) {
    // olive: a fat gnarled bole, a loose irregular crown with sky through it
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 4 + (rnd(i, 1) - 0.5) * 1.1;
      const rr = i === 0 ? 0.04 : 0.16 + 0.22 * rnd(i, 2);
      const y = 0.48 + 0.34 * rnd(i, 3);
      sh.clumps.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, r: 0.14 + 0.08 * rnd(i, 4) });
      if (i) sh.branches.push([Math.cos(a) * rr * 0.85, y - 0.08, Math.sin(a) * rr * 0.85]);
    }
    sh.trunkTop = 0.34;
    sh.trunkR = 0.075;
    sh.limb = 0.6;
    sh.bend = 0.05;
  } else if (kind === KIND.cypress) {
    // Italian cypress: a closed dark flame from near the ground, the masses small and packed
    const rAt = (y: number) => 0.36 * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, y - 0.3) / 0.72, 1.7)), 0.8) * (0.6 + 0.4 * Math.min(1, y / 0.2));
    let y = 0.08;
    for (let i = 0; i < 24 && y < 0.98; i++) {
      const r = Math.max(0.05, rAt(y));
      sh.clumps.push({ x: (rnd(i, 5) - 0.5) * 0.08, y, z: (rnd(i, 6) - 0.5) * 0.08, r });
      y += 0.9 * KIND_ASPECT[KIND.cypress] * r + 0.012;
    }
    sh.trunkTop = 0.14;
    sh.trunkR = 0.1;
  } else if (kind === KIND.conifer) {
    const n = 5;
    for (let t = 0; t < n; t++) {
      const y0 = 0.14 + t * 0.155;
      sh.tiers.push([y0, Math.min(1, y0 + 0.3), 0.5 * (1 - t / (n + 0.6))]);
    }
    sh.trunkTop = 0.3;
    sh.trunkR = 0.03;
  } else if (kind === KIND.poplar) {
    // a slim column of leaf masses on the axis, tapering to a point. Leaf cards are squashed in y by
    // KIND_ASPECT (a mass is only ±r·0.35 tall in tree units), so the step follows each mass's own height:
    // with an even 0.075 step the small top masses hung 0.4–0.5 m apart over the column (F4 bug 2b)
    // (and the tip masses stay ≥ 0.055: 8 alpha cards on a smaller mass read as loose dots up a spire)
    const rAt = (y: number) => (0.46 * (1 - Math.pow(Math.min(1, Math.max(0, (y - 0.3) / 0.6)), 1.8)) + 0.155) * 0.36;
    let y = 0.3;
    for (let i = 0; i < 18 && y < 0.9; i++) {
      const r = rAt(y);
      sh.clumps.push({ x: (rnd(i, 5) - 0.5) * 0.05 * (r / 0.2), y, z: (rnd(i, 6) - 0.5) * 0.05 * (r / 0.2), r });
      y += 1.25 * KIND_ASPECT[KIND.poplar] * r;
    }
    sh.trunkTop = 0.3;
    sh.trunkR = 0.03;
  } else {
    sh.clumps.push({ x: 0, y: 0.58, z: 0, r: 0.3 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      sh.clumps.push({ x: Math.cos(a) * 0.22, y: 0.5 + 0.14 * rnd(i, 7), z: Math.sin(a) * 0.22, r: 0.22 });
    }
    sh.trunkTop = 0.35;
    sh.trunkR = 0.05;
  }
  return sh;
}

/** low-poly 3D tree of a kind (unit height 1, crown width 1), per-vertex aCrown (0 bark, 1 foliage)
 *  and aAO (0 deep inside the crown … 1 outer surface) */
function kindGeometry(kind: number): THREE.BufferGeometry {
  const sh = shapeOf(kind);
  const pos: number[] = [];
  const nrm: number[] = [];
  const crown: number[] = [];
  const ao: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let woodAo = 0.6;
  const addGeo = (g: THREE.BufferGeometry, isCrown: number, centre: [number, number, number] | null, crownC: [number, number, number]) => {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      pos.push(x, y, z);
      if (isCrown && centre) {
        // clump normal blended with the whole crown's radial normal (soft, rounded light)
        const cx = x - centre[0],
          cy = y - centre[1],
          cz = z - centre[2];
        const cl = Math.hypot(cx, cy, cz) || 1;
        const gx = x - crownC[0],
          gy = (y - crownC[1]) * 1.3,
          gz = z - crownC[2];
        const gl = Math.hypot(gx, gy, gz) || 1;
        let nx = (cx / cl) * 0.55 + (gx / gl) * 0.45,
          ny = (cy / cl) * 0.55 + (gy / gl) * 0.45 + 0.08,
          nz = (cz / cl) * 0.55 + (gz / gl) * 0.45;
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm.push(nx / l, ny / l, nz / l);
        ao.push(Math.min(1, Math.max(0, (gl - 0.08) / 0.32)));
      } else {
        nrm.push(n.getX(i), n.getY(i), n.getZ(i));
        ao.push(isCrown ? Math.min(1, Math.max(0.2, (y - 0.1) / 0.8)) : woodAo);
      }
      crown.push(isCrown);
      uvs.push(SOLID_UV, SOLID_UV);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  };
  // trunk
  // (swept: root flare at the foot, a lean, tapering into the fork)
  const tr = new THREE.CylinderGeometry(sh.trunkR * 0.72, sh.trunkR, sh.trunkTop, 7, 3, true);
  tr.translate(0, sh.trunkTop / 2, 0);
  {
    const p = tr.getAttribute('position') as THREE.BufferAttribute;
    const lean = sh.bend ?? 0.012;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / sh.trunkTop;
      const fl = 1 + 0.65 * Math.pow(1 - t, 6);
      p.setXYZ(i, p.getX(i) * fl + lean * t * t, p.getY(i), p.getZ(i) * fl + lean * 0.5 * t);
    }
    tr.computeVertexNormals();
  }
  addGeo(tr, 0, null, [0, 0, 0]);
  woodAo = 0; // (limbs: tells the shader not to run the bole's furrows along them)
  // branches: thin prisms from the trunk top toward the clumps; with ?treelimbs on, limbs leave the bole at different
  // heights, bow on the way out, thin to nothing inside their leaf mass and fork once (no starfish on a post)
  const LIMBS = natureOn('treelimbs');
  const prism = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, sides: number) => {
    const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = d.length() || 1e-3;
    const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(ax, ay, az);
    addGeo(g, 0, null, [0, 0, 0]);
  };
  if (LIMBS && sh.branches.length) {
    const lk = sh.limb ?? 0.5;
    const rk = (i: number, k: number) => hash2i(kind * 100 + i, k, 4431);
    sh.branches.forEach((b, i) => {
      const a = Math.atan2(b[2], b[0]);
      const h0 = sh.trunkTop * (0.68 + 0.34 * rk(i, 1));
      const r0 = sh.trunkR * lk * (0.72 + 0.34 * rk(i, 2));
      const sx = Math.cos(a) * sh.trunkR * 0.42,
        sz = Math.sin(a) * sh.trunkR * 0.42;
      // out first, then rising: the bow of a limb carrying its own weight
      const mx = sx + (b[0] - sx) * 0.52,
        my = h0 + (b[1] - h0) * (0.3 + 0.16 * rk(i, 3)),
        mz = sz + (b[2] - sz) * 0.52;
      prism(sx, h0, sz, mx, my, mz, r0, r0 * 0.56, 6);
      prism(mx, my, mz, b[0] * 1.14, b[1] + 0.02, b[2] * 1.14, r0 * 0.56, sh.trunkR * 0.05, 4);
      const fa = a + (rk(i, 4) < 0.5 ? -1 : 1) * (0.5 + 0.5 * rk(i, 5));
      const fl = Math.hypot(b[0], b[2]) * 0.62;
      prism(mx, my, mz, mx + Math.cos(fa) * fl, my + (b[1] - my) * 0.9 + 0.03, mz + Math.sin(fa) * fl, r0 * 0.36, sh.trunkR * 0.04, 3);
    });
    // the leader carries on above the last fork, into the crown
    prism(0, sh.trunkTop - 0.01, 0, 0.01, Math.min(0.9, sh.trunkTop + 0.34), -0.01, sh.trunkR * 0.68, sh.trunkR * 0.06, 5);
  } else for (const b of sh.branches) {
    const len = Math.hypot(b[0], b[1] - sh.trunkTop, b[2]);
    const lk = sh.limb ?? 0.5;
    const g = new THREE.CylinderGeometry(sh.trunkR * 0.25, sh.trunkR * lk, len, 4, 1, true);
    g.translate(0, len / 2, 0);
    const dir = new THREE.Vector3(b[0], b[1] - sh.trunkTop, b[2]).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(0, sh.trunkTop - 0.02, 0);
    addGeo(g, 0, null, [0, 0, 0]);
  }
  // crown centre (for the blended normals)
  let ccx = 0,
    ccy = 0,
    ccz = 0,
    cw = 0;
  for (const c of sh.clumps) {
    ccx += c.x * c.r;
    ccy += c.y * c.r;
    ccz += c.z * c.r;
    cw += c.r;
  }
  const crownC: [number, number, number] = cw > 0 ? [ccx / cw, ccy / cw, ccz / cw] : [0, 0.6, 0];
  // leaf masses as clusters of alpha-tested leaf cards (broken silhouettes with sky gaps; the lighting
  // normal stays the rounded clump / crown normal so the crown still reads as a lit volume)
  const ky = KIND_ASPECT[kind];
  const v3 = new THREE.Vector3(),
    nC = new THREE.Vector3(),
    t1 = new THREE.Vector3(),
    t2 = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  let cs = kind * 7919 + 13;
  const rnd = () => hash2i(cs++, kind, 4421);
  const card = (cx: number, cy: number, cz: number, s: number, ox: number, oy: number, oz: number, nx: number, ny: number, nz: number, clump: [number, number, number] | null) => {
    nC.set(nx, ny, nz).normalize();
    t1.crossVectors(Math.abs(nC.y) > 0.9 ? v3.set(1, 0, 0) : up, nC).normalize();
    t2.crossVectors(nC, t1);
    const a = rnd() * Math.PI * 2,
      ca = Math.cos(a),
      sa = Math.sin(a);
    const ax = t1.x * ca + t2.x * sa,
      ay = t1.y * ca + t2.y * sa,
      az = t1.z * ca + t2.z * sa;
    const bx = -t1.x * sa + t2.x * ca,
      by = -t1.y * sa + t2.y * ca,
      bz = -t1.z * sa + t2.z * ca;
    const base = pos.length / 3;
    const corners = [
      [-1, -1, 0, 0],
      [1, -1, LEAF_U, 0],
      [1, 1, LEAF_U, LEAF_U],
      [-1, 1, 0, LEAF_U],
    ];
    for (const [u, w, tu, tv] of corners) {
      const x = cx + (ax * u + bx * w) * s,
        y = cy + (ay * u + by * w) * s * ky,
        z = cz + (az * u + bz * w) * s;
      pos.push(x, y, z);
      // rounded lighting normal: the clump's (or the given outward) direction blended with the crown's
      let lx = ox,
        ly = oy,
        lz = oz;
      if (clump) {
        lx = x - clump[0];
        ly = y - clump[1];
        lz = z - clump[2];
      }
      const ll = Math.hypot(lx, ly, lz) || 1;
      const gx = x - crownC[0],
        gy = (y - crownC[1]) * 1.3,
        gz = z - crownC[2];
      const gl = Math.hypot(gx, gy, gz) || 1;
      const mx = (lx / ll) * 0.55 + (gx / gl) * 0.45,
        my = (ly / ll) * 0.55 + (gy / gl) * 0.45 + 0.08,
        mz = (lz / ll) * 0.55 + (gz / gl) * 0.45;
      const ml = Math.hypot(mx, my, mz) || 1;
      nrm.push(mx / ml, my / ml, mz / ml);
      ao.push(Math.min(1, Math.max(0, (gl - 0.08) / 0.32)));
      crown.push(1);
      uvs.push(tu, tv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  sh.clumps.forEach((c) => {
    const n = Math.max(9, Math.min(22, Math.round(c.r * 100)));
    for (let i = 0; i < n; i++) {
      // directions over the sphere (a little upward), centres toward the clump's surface
      const zz = 1 - 2 * rnd(),
        ph = rnd() * Math.PI * 2;
      const rr = Math.sqrt(Math.max(0, 1 - zz * zz));
      const dx = rr * Math.cos(ph),
        dy = zz * 0.9 + 0.1,
        dz = rr * Math.sin(ph);
      const d = c.r * (0.25 + 0.6 * rnd());
      const px = c.x + dx * d,
        py = c.y + dy * d * ky,
        pz = c.z + dz * d;
      // card planes: half facing out, half random (seen edge-on from some side: depth in the crown)
      const q = rnd();
      card(px, py, pz, c.r * (0.58 + 0.2 * rnd()), 0, 0, 0, dx * q + (rnd() - 0.5), dy * q + (rnd() - 0.5), dz * q + (rnd() - 0.5), [c.x, c.y, c.z]);
    }
  });
  sh.tiers.forEach((t, i) => {
    // conifer tier: a dark core cone (no gaps through the trunk zone) + drooping branch sprays round it
    const noCone = natureOn('treelimbs');
    const g = new THREE.ConeGeometry(t[2] * 0.55, t[1] - t[0], 7, 1, true);
    g.translate(0, (t[0] + t[1]) / 2, 0);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const nb = g.getAttribute('normal') as THREE.BufferAttribute;
    const base = pos.length / 3;
    for (let v = 0; v < p.count; v++) {
      pos.push(p.getX(v), p.getY(v), p.getZ(v));
      nrm.push(nb.getX(v), nb.getY(v), nb.getZ(v));
      ao.push(0.14);
      crown.push(1);
      uvs.push(SOLID_UV, SOLID_UV);
    }
    if (!noCone) for (let k = 0; k < g.index!.count; k++) idx.push(g.index!.getX(k) + base);
    // (a smooth core cone reads as a lampshade from below: more sprays, an inner ring of them, no cone)
    const m = noCone ? 19 + i : 9 + i;
    for (let k = 0; k < m; k++) {
      const a = ((k + 0.5 * (i % 2)) / m) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
      const u = noCone && k % 3 === 0 ? 0.2 + 0.25 * rnd() : 0.45 + 0.5 * rnd();
      const r = t[2] * u;
      const y = t[1] - (t[1] - t[0]) * (0.25 + 0.75 * u) * 0.85;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      // spray normal: up and out (branches droop), lit like the cone's surface
      card(ca * r, y, sa * r, t[2] * (0.34 + 0.12 * rnd()), ca, 0.9, sa, ca * 0.5 + (rnd() - 0.5) * 0.3, 1, sa * 0.5 + (rnd() - 0.5) * 0.3, null);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aCrown', new THREE.Float32BufferAttribute(crown, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ───────────────────────────────────────────────────── shaders ──

const TREE_FRAG_PARS = /* glsl */ `
uniform sampler2D tLN;
uniform vec3 uSunDir;
uniform float uNight;
varying vec3 vTW;
varying float vCrown;
varying float vTint;
varying float vKind;
varying float vLocalY;
varying float vLocalY0;
`;

/** leafy crown shading shared by the 3D trees and the impostors: albedo by kind + tint */
const TREE_ALBEDO = /* glsl */ `
float gTreeBark = 1.0;
vec3 treeAlbedo(float kind, float tint, float crown, float ly) {
  // tones matched to the vegetation module's forest (sRGB #4f8a33…#5a9636 broadleaf, #2b5a3a…#33683f
  // spruce/fir, #3d6a36 pine), linear
  // darker and more varied than the first pass (lead: no bright lime): oak / ash / alder / willow greens
  vec3 broad = mix(vec3(0.046, 0.118, 0.03), vec3(0.07, 0.158, 0.038), tint);
  broad = mix(broad, vec3(0.034, 0.096, 0.045), step(0.72, fract(tint * 3.7)) * 0.75);   // dark blue-green
  broad = mix(broad, vec3(0.085, 0.14, 0.04), step(0.8, fract(tint * 5.3)) * 0.6);        // olive / grey-green
  vec3 conif = mix(vec3(0.022, 0.085, 0.036), mix(vec3(0.03, 0.11, 0.042), vec3(0.042, 0.115, 0.032), step(0.7, tint)), tint) * 0.9;
  vec3 poplar = mix(vec3(0.055, 0.15, 0.035), vec3(0.075, 0.18, 0.04), tint);
  vec3 small = mix(vec3(0.06, 0.15, 0.036), vec3(0.085, 0.18, 0.045), tint);
  small = mix(small, vec3(0.045, 0.11, 0.035), step(0.7, fract(tint * 4.1)) * 0.7);
  vec3 c = kind < 0.5 ? broad : kind < 1.5 ? conif : kind < 2.5 ? poplar : kind < 3.5 ? small :
    kind < 4.5 ? mix(vec3(0.04, 0.105, 0.028), vec3(0.062, 0.135, 0.032), tint) :                 // oak: deep, warm green
    kind < 5.5 ? mix(vec3(0.03, 0.098, 0.04), vec3(0.046, 0.125, 0.045), tint) :                  // stone pine
    kind < 6.5 ? mix(vec3(0.115, 0.15, 0.085), vec3(0.15, 0.178, 0.105), tint) :                  // olive: silver-grey green
    mix(vec3(0.018, 0.06, 0.03), vec3(0.028, 0.08, 0.034), tint);                                 // cypress: near-black green
  vec3 bark = (kind > 4.5 && kind < 5.5 ? vec3(0.17, 0.095, 0.06) : kind > 5.5 && kind < 6.5 ? vec3(0.2, 0.18, 0.15) : vec3(0.15, 0.125, 0.1)) * (crown > 0.5 ? 1.0 : gTreeBark${FILL ? ' * 1.5' : ''});
  return mix(bark, c * (0.75 + 0.45 * ly), crown);
}
`;

function treeMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean, leaf: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, fog, side: THREE.DoubleSide });
  const u = { ...uniforms, tLeaf: { value: leaf }, uNearEye: globalUniforms.uNearEye, uNearLens: globalUniforms.uNearLens };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aCrown;
attribute float aAO;
attribute vec4 aInst; // kind, tint, height, phase
varying float vAO;
varying vec2 vLeafUv;
uniform float uTime;
uniform vec2 uWind;
varying vec3 vTW;
varying float vCrown;
varying float vTint;
varying float vKind;
varying float vLocalY;
varying float vLocalY0;
uniform vec3 uNearEye;
uniform float uNearLens;
${WIND_GLSL}
${MOTION_KEEP_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCrown = aCrown;
vAO = aAO;
vLeafUv = uv;
vKind = aInst.x;
vTint = aInst.y;
vLocalY = clamp((position.y - 0.25) / 0.7, 0.0, 1.0);
vLocalY0 = position.y;
{
  // sway: the crown leans downwind with the gusts, more at the top
  vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 wv = thWindAt(base.xz);
  float bend = position.y * position.y * aCrown;
  float ph = aInst.w * 6.2831 + uTime * 1.3;
  // world-space sway (m) at the crown top, mapped back into the instance's local frame
  vec2 sway = wv * (0.25 + 0.12 * sin(ph) * thMotionKeep(base, 0.12 * length(wv) * bend)) * bend;
  float w2 = max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 0.25);
  transformed.xz += vec2(dot(instanceMatrix[0].xz, sway), dot(instanceMatrix[2].xz, sway)) / w2;
}`,
      )
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAO;\nvarying vec2 vLeafUv;\nuniform sampler2D tLeaf;\n' + TREE_FRAG_PARS + TREE_ALBEDO)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 lt = texture2D(tLeaf, vLeafUv);
if (lt.a < 0.5) discard;
vec4 nT = texture2D(tLN, vTW.xz * 0.37 + vTW.y * 0.21);
float leafAO = mix(${FILL ? '0.6' : '0.42'}, 1.0, vAO) * (0.78 + 0.44 * nT.r) * mix(1.0, lt.r * 1.3, vCrown);
// bark: furrows along the stem, darker at the foot
if (vCrown < 0.5) gTreeBark = (vAO < 0.3 ? 0.84 + 1.0 * texture2D(tLN, vTW.xz * 1.9 + vTW.y * vec2(1.4, -1.1)).g : 0.62 + 0.76 * texture2D(tLN, vec2((vTW.x + vTW.z) * 1.7, vTW.y * 0.19)).g) * mix(0.72, 1.0, smoothstep(0.0, 0.35, vLocalY0));
vec4 diffuseColor = vec4(treeAlbedo(vKind, vTint, vCrown, vLocalY) * mix(1.0, leafAO, vCrown), opacity);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
// leaf cards: both faces keep the crown's outward lighting normal
if (vCrown > 0.5) normal *= faceDirection;
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
if (vCrown > 0.5) {
  // leaf clusters: perturb the normal with world-space noise (two scales)
  vec4 nq = texture2D(tLN, vTW.xz * 0.61 - vTW.y * 0.43);
  vec4 nq2 = texture2D(tLN, vTW.zx * 1.9 + vTW.y * 1.3);
  vec3 pv = (viewMatrix * vec4(nq.rgb - 0.5 + (nq2.gba - 0.5) * 0.7, 0.0)).xyz;
  normal = normalize(normal + pv * 1.1);
}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  // backlit translucency of the foliage
  vec3 V = normalize(cameraPosition - vTW);
  float bt = pow(clamp(dot(-V, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0), 5.0) * vCrown * (1.0 - uNight);
  // the light through the leaves is the sun's own (colour + intensity: weak and red when low)
  vec3 sunC = vec3(0.0);
#if NUM_DIR_LIGHTS > 0
  sunC = directionalLights[0].color;
#endif
  reflectedLight.indirectDiffuse *= ${FILL ? '1.0 + 0.4 * vCrown' : '1.0'};
  reflectedLight.indirectDiffuse += diffuseColor.rgb * sunC * vec3(1.0, 1.0, 0.5) * bt * 0.46;
  ${moonLift()}
}`,
      );
  };
  mat.customProgramCacheKey = () => 'th-landtree-v7';
  return mat;
}

/** shadow depth of the near trees: leaf cards cut out like the colour pass */
function treeDepthMaterial(leaf: THREE.Texture): THREE.MeshDepthMaterial {
  const d = new THREE.MeshDepthMaterial();
  d.onBeforeCompile = (shader) => {
    shader.uniforms.tLeaf = { value: leaf };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLeafUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeafUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLeafUv;\nuniform sampler2D tLeaf;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (texture2D(tLeaf, vLeafUv).a < 0.5) discard;');
  };
  d.customProgramCacheKey = () => 'th-landtree-depth-v1';
  return d;
}

// ───────────────────────────────────────────────────── impostors ──

const ATLAS_W = 1024,
  ATLAS_H = 256; // 8 cells of 128 × 256

/** raytrace clumps of leaf spheres into an albedo-variation + alpha atlas and a normal atlas */
function buildAtlas(): { col: THREE.DataTexture; nrm: THREE.DataTexture } {
  const col = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  const nrm = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  const CW = 128;
  for (let kind = 0; kind < NK; kind++) {
    // leaf sub-clumps filling the shared crown shape (cell space: x ∈ [-0.5, 0.5] = crown width 1,
    // y ∈ [0, 1] = tree height 1)
    const clumps: [number, number, number, number, number][] = [];
    let seed = kind * 1000 + 7;
    const rnd = () => hash2i(seed++, kind, 991);
    const sh = shapeOf(kind);
    const fill = (cx: number, cy: number, cz: number, rx: number, ry: number, n: number, cr: number) => {
      for (let i = 0; i < n; i++) {
        let px = 0,
          py = 0,
          pz = 0;
        for (let t = 0; t < 8; t++) {
          px = rnd() * 2 - 1;
          py = rnd() * 2 - 1;
          pz = rnd() * 2 - 1;
          if (px * px + py * py + pz * pz < 1) break;
        }
        clumps.push([cx + px * rx, cy + py * ry, cz + pz * rx, cr * (0.7 + 0.6 * rnd()), rnd()]);
      }
    };
    for (const c of sh.clumps) fill(c.x, c.y, c.z, c.r * 0.72, c.r * 0.72, Math.round(10 + 60 * c.r), Math.max(0.05, c.r * 0.4));
    for (const t of sh.tiers) {
      for (let k = 0; k < 4; k++) {
        const f = k / 4;
        fill(0, t[0] + (t[1] - t[0]) * f * 0.6, 0, t[2] * (1 - f * 0.8), 0.03, 6, 0.05 + 0.03 * (1 - f));
      }
    }
    // leaf clusters on the surface: a ragged, broken silhouette (sky between the outer twigs)
    for (const c of sh.clumps) {
      const n = Math.round(30 + 260 * c.r);
      for (let i = 0; i < n; i++) {
        const zz = 1 - 2 * rnd(),
          ph = rnd() * Math.PI * 2;
        const rr = Math.sqrt(Math.max(0, 1 - zz * zz));
        const d = c.r * (0.78 + 0.32 * rnd());
        clumps.push([c.x + rr * Math.cos(ph) * d, c.y + zz * d * 0.95, c.z + rr * Math.sin(ph) * d, (0.02 + 0.018 * rnd()) * (kind === KIND.small ? 1.3 : 1), rnd()]);
      }
    }
    for (const t of sh.tiers) {
      for (let i = 0; i < 44; i++) {
        const a = rnd() * Math.PI * 2,
          u = 0.45 + 0.6 * rnd();
        const y = t[1] - (t[1] - t[0]) * (0.25 + 0.75 * Math.min(1, u)) * 0.85;
        clumps.push([Math.cos(a) * t[2] * u * 0.95, y, Math.sin(a) * t[2] * u * 0.95, 0.018 + 0.012 * rnd(), rnd()]);
      }
    }
    // splat the spheres into a z-buffer (cheap for the many small ones)
    const zb = new Float32Array(CW * ATLAS_H).fill(-9),
      nb = new Float32Array(CW * ATLAS_H * 3),
      tb = new Float32Array(CW * ATLAS_H);
    for (const c of clumps) {
      const x0 = Math.max(0, Math.floor((c[0] - c[3] + 0.5) * CW)),
        x1 = Math.min(CW - 1, Math.ceil((c[0] + c[3] + 0.5) * CW));
      const y0 = Math.max(0, Math.floor((1 - (c[1] + c[3])) * ATLAS_H)),
        y1 = Math.min(ATLAS_H - 1, Math.ceil((1 - (c[1] - c[3])) * ATLAS_H));
      for (let py = y0; py <= y1; py++) {
        const y = 1 - (py + 0.5) / ATLAS_H;
        for (let px = x0; px <= x1; px++) {
          const x = (px + 0.5) / CW - 0.5;
          const dx = (x - c[0]) / c[3],
            dy = (y - c[1]) / c[3];
          const d2 = dx * dx + dy * dy;
          if (d2 >= 1) continue;
          const dz = Math.sqrt(1 - d2);
          const zz = c[2] + dz * c[3];
          const o = py * CW + px;
          if (zz > zb[o]) {
            zb[o] = zz;
            nb[o * 3] = dx;
            nb[o * 3 + 1] = dy;
            nb[o * 3 + 2] = dz;
            tb[o] = c[4];
          }
        }
      }
    }
    const trunkTop = sh.trunkTop,
      trunkW = sh.trunkR;
    for (let py = 0; py < ATLAS_H; py++) {
      const y = 1 - (py + 0.5) / ATLAS_H;
      for (let px = 0; px < CW; px++) {
        const x = (px + 0.5) / CW - 0.5;
        const o = py * CW + px;
        const bz = zb[o],
          bt = tb[o];
        const bn = [nb[o * 3], nb[o * 3 + 1], nb[o * 3 + 2]];
        const k = (py * ATLAS_W + kind * CW + px) * 4;
        if (bz > -9) {
          // blend the clump normal toward the crown's overall shape
          const cy = kind === KIND.conifer ? 0.5 : 0.6;
          const sx = x * 1.6,
            sy = (y - cy) * 1.4;
          const sz = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy));
          let nx = bn[0] * 0.6 + sx * 0.6,
            ny = bn[1] * 0.6 + sy * 0.6 + 0.1,
            nz = bn[2] * 0.6 + sz * 0.6;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l;
          ny /= l;
          nz /= l;
          nrm[k] = Math.round((nx * 0.5 + 0.5) * 255);
          nrm[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          nrm[k + 2] = Math.round((nz * 0.5 + 0.5) * 255);
          nrm[k + 3] = 255;
          // r = brightness variation, g = crown flag, b = height in the crown
          // brightness: clump variation × depth (deeper hits = inner leaves, darker)
          const depth = Math.min(1, Math.max(0, (bz + 0.25) / 0.5));
          col[k] = Math.round((0.35 + 0.35 * bt + 0.3 * depth) * 255);
          col[k + 1] = 255;
          col[k + 2] = Math.round(Math.min(1, Math.max(0, (y - 0.25) / 0.7)) * 255);
          col[k + 3] = 255;
        } else if (Math.abs(x) < trunkW && y < trunkTop) {
          nrm[k] = Math.round((x / trunkW) * 0.5 * 127 + 128);
          nrm[k + 1] = 128;
          nrm[k + 2] = 230;
          nrm[k + 3] = 255;
          col[k] = 180;
          col[k + 1] = 0;
          col[k + 2] = 0;
          col[k + 3] = 255;
        } else {
          // transparent: the crown's mean values (mips must not darken / brown the edges, nor tilt
          // the normals toward zero)
          const cy = kind === KIND.conifer ? 0.5 : 0.6;
          const sx = Math.max(-1, Math.min(1, x * 1.6)),
            sy = Math.max(-1, Math.min(1, (y - cy) * 1.4));
          const sz = Math.sqrt(Math.max(0.05, 1 - sx * sx - sy * sy));
          const l = Math.hypot(sx, sy + 0.1, sz);
          nrm[k] = Math.round(((sx / l) * 0.5 + 0.5) * 255);
          nrm[k + 1] = Math.round((((sy + 0.1) / l) * 0.5 + 0.5) * 255);
          nrm[k + 2] = Math.round(((sz / l) * 0.5 + 0.5) * 255);
          nrm[k + 3] = 0;
          col[k] = 150;
          col[k + 1] = 255;
          col[k + 2] = Math.round(Math.min(1, Math.max(0, (y - 0.25) / 0.7)) * 255);
          col[k + 3] = 0;
        }
      }
    }
  }
  const mk = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, ATLAS_W, ATLAS_H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.flipY = false;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { col: mk(col), nrm: mk(nrm) };
}

function impostorMaterial(uniforms: Record<string, THREE.IUniform>, atlas: { col: THREE.Texture; nrm: THREE.Texture }, fog: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, fog });
  const u = { ...uniforms, tTreeCol: { value: atlas.col }, tTreeNrm: { value: atlas.nrm } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 iPos;  // x, y, z, height
attribute vec4 iDat;  // width, kind, tint, yaw
uniform vec4 uNearC;  // xyz camera at the last near-set rebuild, w = radius
varying vec3 vTW;
varying vec2 vUv2;
varying float vKind;
varying float vTint;
varying vec3 vBR;
varying vec3 vBU;
varying vec3 vBF;
varying float vCrown;
varying float vLocalY;
varying float vLocalY0;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed;
{
  vec3 P = iPos.xyz;
  float H = iPos.w, Wd = iDat.x;
  vec3 C = P + vec3(0.0, H * 0.55, 0.0);
  vec3 toC = cameraPosition - C;
  float dist = length(toC);
  vec3 F = toC / max(dist, 1e-3);
  // camera-facing about the crown centre, kept upright for low views
  vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), F) + vec3(1e-5, 0.0, 0.0));
  vec3 U = cross(F, R);
  vec2 q = position.xy; // (-0.5..0.5, 0..1)
  vec3 wp = C + R * (q.x * Wd) + U * ((q.y - 0.55) * H);
  // collapse inside the near (3D) radius
  float dn = length(P.xz - uNearC.xz);
  if (dn < uNearC.w) wp = C;
  transformed = wp;
  vTW = wp;
  vUv2 = vec2((iDat.y + 0.5 + q.x) * 0.125, 1.0 - q.y);
  vKind = iDat.y;
  vTint = iDat.z;
  vBR = R; vBU = U; vBF = F;
  vCrown = 1.0;
  vLocalY = q.y;
  vLocalY0 = q.y;
}`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(cameraPosition - iPos.xyz);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tTreeCol;
uniform sampler2D tTreeNrm;
varying vec2 vUv2;
varying vec3 vBR;
varying vec3 vBU;
varying vec3 vBF;
` +
          TREE_FRAG_PARS +
          TREE_ALBEDO,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 tc = texture2D(tTreeCol, vUv2);
if (tc.a < 0.5) discard;

vec4 diffuseColor = vec4(treeAlbedo(vKind, vTint, tc.g, tc.b) * ${FILL ? '(0.72 + 0.5 * tc.r)' : '(0.6 + 0.6 * tc.r)'}, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 tn = texture2D(tTreeNrm, vUv2).xyz * 2.0 - 1.0;
  vec3 nw = normalize(vBR * tn.x + vBU * tn.y + vBF * tn.z);
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  vec3 V = normalize(cameraPosition - vTW);
  float bt = pow(clamp(dot(-V, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0), 5.0) * tc.g * (1.0 - uNight);
  // the light through the leaves is the sun's own (colour + intensity: weak and red when low)
  vec3 sunC = vec3(0.0);
#if NUM_DIR_LIGHTS > 0
  sunC = directionalLights[0].color;
#endif
  reflectedLight.indirectDiffuse *= ${FILL ? '1.0 + 0.3 * tc.g' : '1.0'};
  reflectedLight.indirectDiffuse += diffuseColor.rgb * sunC * vec3(1.0, 1.0, 0.5) * bt * 0.36;
  ${moonLift()}
}`,
      );
  };
  mat.customProgramCacheKey = () => 'th-landimp-v6';
  return mat;
}

// ───────────────────────────────────────────────────── the system ──

/** the trunk of one country tree, for its near skin (the instanced trunk stays, inside it). In tree units the old one leans by `bend` */
export function landTrunk(list: TreeList, t: number): { top: number; r: number; dx: number; dz: number; kind: number } {
  const sh = trunkShapes[list.kind[t]] ?? (trunkShapes[list.kind[t]] = shapeOf(list.kind[t]));
  const w = list.w[t];
  const lean = (sh.bend ?? 0.012) * w;
  const c = Math.cos(list.yaw[t]),
    s = Math.sin(list.yaw[t]);
  return { top: sh.trunkTop * list.h[t], r: sh.trunkR * w, dx: lean * c + lean * 0.5 * s, dz: -lean * s + lean * 0.5 * c, kind: list.kind[t] };
}
const trunkShapes: Shape[] = [];

export interface LandTrees {
  group: THREE.Group;
  /** call every frame (cheap unless the camera moved NEAR_STEP) */
  update(camera: THREE.Camera): void;
  /** 3D near-set radius scale 0..1 (quality tiers / adaptive ladder; 0 = impostors only) */
  setDetail(k: number): void;
  stats(): Record<string, number>;
}

export function createLandTrees(list: TreeList, uniforms: Record<string, THREE.IUniform>, fog: boolean, shadows: boolean): LandTrees {
  const group = new THREE.Group();
  group.name = 'land-trees';
  // ── tiles for the near-set query
  const tiles = new Map<number, number[]>();
  const key = (i: number, j: number) => (i + 2048) * 4096 + (j + 2048);
  for (let t = 0; t < list.n; t++) {
    const k = key(Math.floor(list.x[t] / TILE), Math.floor(list.z[t] / TILE));
    let a = tiles.get(k);
    if (!a) tiles.set(k, (a = []));
    a.push(t);
  }
  // ── near 3D sets
  const leaf = leafTexture();
  const tmat = treeMaterial(uniforms, fog, leaf);
  const tdepth = treeDepthMaterial(leaf);
  const near: THREE.InstancedMesh[] = [];
  const instData: THREE.InstancedBufferAttribute[] = [];
  for (let k = 0; k < NK; k++) {
    const geo = kindGeometry(k);
    const data = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_CAP[k] * 4), 4);
    data.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInst', data);
    const m = new THREE.InstancedMesh(geo, tmat, NEAR_CAP[k]);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.visible = false;
    m.name = `land-trees-near${k}`;
    m.castShadow = shadows;
    m.customDepthMaterial = tdepth;
    m.receiveShadow = true;
    m.frustumCulled = false;
    near.push(m);
    instData.push(data);
    group.add(m);
  }
  // ── far impostors (all trees)
  const atlas = buildAtlas();
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  quad.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const ip = new Float32Array(list.n * 4),
    id = new Float32Array(list.n * 4);
  for (let t = 0; t < list.n; t++) {
    ip[t * 4] = list.x[t];
    ip[t * 4 + 1] = list.y[t];
    ip[t * 4 + 2] = list.z[t];
    ip[t * 4 + 3] = list.h[t];
    id[t * 4] = list.w[t];
    id[t * 4 + 1] = list.kind[t];
    id[t * 4 + 2] = list.tint[t];
    id[t * 4 + 3] = list.yaw[t];
  }
  const ipA = new THREE.InstancedBufferAttribute(ip, 4);
  const idA = new THREE.InstancedBufferAttribute(id, 4);
  quad.setAttribute('iPos', ipA);
  quad.setAttribute('iDat', idA);
  quad.instanceCount = list.n;
  // the impostors are drawn in tile order, nearest tile first (re-sorted when the camera has moved FAR_SORT m):
  // in the generation order a forest belt seen from afar was shaded several times over before the depth test
  // could reject the hidden quads (alpha-tested, opaque: the order does not change the picture). ?treesort=0: off
  const sortOn = typeof location === 'undefined' || new URLSearchParams(location.search).get('treesort') !== '0';
  const tileList = [...tiles.values()];
  const tileD = new Float64Array(tileList.length);
  const tileOrder = tileList.map((_, i) => i);
  const tileC = tileList.map((a) => {
    let sx = 0,
      sz = 0;
    for (const t of a) {
      sx += list.x[t];
      sz += list.z[t];
    }
    return [sx / a.length, sz / a.length];
  });
  let sortX = 1e9,
    sortZ = 1e9;
  const sortFar = (cx: number, cz: number) => {
    for (let i = 0; i < tileList.length; i++) tileD[i] = (tileC[i][0] - cx) ** 2 + (tileC[i][1] - cz) ** 2;
    tileOrder.sort((a, b) => tileD[a] - tileD[b]);
    let o = 0;
    for (const ti of tileOrder) {
      for (const t of tileList[ti]) {
        ip[o] = list.x[t];
        ip[o + 1] = list.y[t];
        ip[o + 2] = list.z[t];
        ip[o + 3] = list.h[t];
        id[o] = list.w[t];
        id[o + 1] = list.kind[t];
        id[o + 2] = list.tint[t];
        id[o + 3] = list.yaw[t];
        o += 4;
      }
    }
    ipA.needsUpdate = true;
    idA.needsUpdate = true;
  };
  quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(CX, 0, CZ), 6000);
  const nearC = new THREE.Vector4(1e9, 0, 1e9, NEAR_R);
  const impU = { ...uniforms, uNearC: { value: nearC } };
  const imp = new THREE.Mesh(quad, impostorMaterial(impU, atlas, fog));
  imp.name = 'land-trees-far';
  imp.frustumCulled = false;
  imp.castShadow = false;
  imp.receiveShadow = false;
  group.add(imp);

  // ── near-set rebuild
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const ps = new THREE.Vector3();
  const ax = new THREE.Vector3(0, 1, 0);
  const counts = new Int32Array(NK);
  let lastX = 1e9,
    lastZ = 1e9,
    lastY = 1e9;
  let rebuilds = 0;
  let detail = 1;
  const rebuild = (cx: number, cy: number, cz: number) => {
    counts.fill(0);
    // a high camera sees the countryside from far away: the 3D radius shrinks with height
    const R = NEAR_R * detail * (1 - smooth(90, 300, cy));
    nearC.set(cx, cy, cz, R);
    if (R > 1) {
      const i0 = Math.floor((cx - R) / TILE),
        i1 = Math.floor((cx + R) / TILE);
      const j0 = Math.floor((cz - R) / TILE),
        j1 = Math.floor((cz + R) / TILE);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const a = tiles.get(key(i, j));
          if (!a) continue;
          for (const t of a) {
            const dx = list.x[t] - cx,
              dz = list.z[t] - cz;
            if (dx * dx + dz * dz >= R * R) continue;
            const k = list.kind[t];
            const c = counts[k];
            if (c >= NEAR_CAP[k]) continue;
            ps.set(list.x[t], list.y[t] - 0.2, list.z[t]);
            q.setFromAxisAngle(ax, list.yaw[t]);
            sc.set(list.w[t], list.h[t], list.w[t]);
            m4.compose(ps, q, sc);
            near[k].setMatrixAt(c, m4);
            const d = instData[k].array as Float32Array;
            d[c * 4] = k;
            d[c * 4 + 1] = list.tint[t];
            d[c * 4 + 2] = list.h[t];
            d[c * 4 + 3] = list.tint[t] * 7.31 - Math.floor(list.tint[t] * 7.31);
            counts[k] = c + 1;
          }
        }
      }
    }
    for (let k = 0; k < NK; k++) {
      near[k].count = counts[k];
      // an empty set costs nothing (no draw call, no shadow draw)
      near[k].visible = counts[k] > 0;
      if (counts[k] > 0) {
        near[k].instanceMatrix.needsUpdate = true;
        instData[k].needsUpdate = true;
      }
    }
    rebuilds++;
  };

  return {
    group,
    update(camera) {
      const p = camera.position;
      const dx = p.x - lastX,
        dz = p.z - lastZ,
        dy = p.y - lastY;
      if (dx * dx + dz * dz + dy * dy < NEAR_STEP * NEAR_STEP) return;
      lastX = p.x;
      lastY = p.y;
      lastZ = p.z;
      rebuild(p.x, p.y, p.z);
      if (sortOn && (p.x - sortX) ** 2 + (p.z - sortZ) ** 2 > FAR_SORT * FAR_SORT) {
        sortX = p.x;
        sortZ = p.z;
        sortFar(p.x, p.z);
      }
    },
    setDetail(k: number) {
      const d = Math.min(1, Math.max(0, k));
      if (d === detail) return;
      detail = d;
      lastX = 1e9; // force a rebuild
    },
    stats() {
      let n3 = 0;
      for (let k = 0; k < NK; k++) n3 += counts[k];
      return { trees: list.n, trees3d: n3, treeRebuilds: rebuilds };
    },
  };
}
