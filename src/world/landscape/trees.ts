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
import { FROW, toField, fromField, rowB, colB, colOff, colW, rowHedge, colHedge, lhash, fieldsOfParcel, grazeCrop } from './fields';
import { hash2i, vnoise, smooth } from './noise';
import { WIND_GLSL } from '../../core/wind';
import { SLAB } from '../../core/constants';

export const KIND = { broad: 0, conifer: 1, poplar: 2, small: 3 } as const;
const NK = 4;

/** 3D trees within this radius of the camera (m); round crowns read the same as impostors beyond */
const NEAR_R = 125;
/** rebuild the near set after the camera moved this far (m) */
const NEAR_STEP = 18;
/** per-kind cap of 3D instances */
const NEAR_CAP = [1100, 1500, 500, 3000];
const TILE = 64;

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
  add(x: number, y: number, z: number, h: number, w: number, kind: number, seed: number): void {
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
export function placeTrees(model: LandscapeModel, density: number): { list: TreeList; ms: number } {
  const t0 = performance.now();
  const B = new Builder();
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

  // ── forest within reach of the town (beyond CANOPY the woods are terrain)
  {
    const R = 470;
    const cell = 7.2 / Math.sqrt(Math.max(0.5, density));
    for (let gx = Math.floor((SLAB.x0 - R) / cell); gx <= Math.ceil((SLAB.x1 + R) / cell); gx++) {
      for (let gz = Math.floor((SLAB.z0 - R) / cell); gz <= Math.ceil((SLAB.z1 + R) / cell); gz++) {
        const x = (gx + 0.15 + 0.7 * hash2i(gx, gz, 11)) * cell;
        const z = (gz + 0.15 + 0.7 * hash2i(gx, gz, 12)) * cell;
        const sd = slabD(x, z);
        if (sd < 2.5 || sd > R) continue;
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
        const kind = r < conP ? KIND.conifer : r > 0.96 ? KIND.poplar : KIND.broad;
        const age = 0.65 + 0.5 * hash2i(gx, gz, 16);
        const hh = kind === KIND.conifer ? 15 * age + 3 : kind === KIND.poplar ? 20 * age : 13 * age + 2;
        const ww = kind === KIND.conifer ? hh * 0.36 : kind === KIND.poplar ? hh * 0.3 : hh * (0.62 + 0.2 * hash2i(gx, gz, 17));
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
      if (y > 140) return false;
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
        if (vnoise(fx / 23 + key * 0.37, fy / 23, 21) < 0.28) continue;
        const y = H(w.x, w.z);
        if (!arable(w.x, w.z, y)) continue;
        const s = lhash(key * 977 + i, 2);
        // jitter across the line
        const jx = (lhash(key * 977 + i, 3) - 0.5) * 1.2;
        fromField(fx + (ax === bx ? jx : 0), fy + (ay === by ? jx : 0), w);
        if (i * 2.7 >= nextTree) {
          nextTree += 7 + 20 * lhash(key * 977 + i, 4);
          const r = lhash(key * 977 + i, 5);
          const kind = r < 0.12 ? KIND.conifer : r < 0.2 ? KIND.poplar : KIND.broad;
          const hh = kind === KIND.poplar ? 17 + 8 * s : kind === KIND.conifer ? 11 + 7 * s : 9 + 9 * s;
          B.add(w.x, H(w.x, w.z), w.z, hh, kind === KIND.broad ? hh * (0.7 + 0.25 * s) : hh * 0.33, kind, seed++);
        } else if (near) {
          // the hedge itself: bushes
          const hh = 2.3 + 1.6 * s;
          B.add(w.x, H(w.x, w.z), w.z, hh, hh * (1.1 + 0.4 * lhash(key * 977 + i, 6)), KIND.small, seed++);
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
        for (const P of fieldsOfParcel(cx, cy)) {
        const crop = grazeCrop(P.crop, model.grazing(w.x, w.z));
        const pk = P.pid;
        if (crop >= 0.48 && crop < 0.66 && lhash(pk, 61) < 0.55) {
          // pasture oak
          const fx = P.x0 + (P.x1 - P.x0) * (0.2 + 0.6 * lhash(pk, 62));
          const fy = P.y0 + (P.y1 - P.y0) * (0.2 + 0.6 * lhash(pk, 63));
          fromField(fx, fy, w);
          const y = H(w.x, w.z);
          if (arable(w.x, w.z, y)) B.add(w.x, y, w.z, 13 + 7 * lhash(pk, 64), 15 + 7 * lhash(pk, 65), KIND.broad, seed++);
        } else if (crop >= 0.95 && cityR(w.x, w.z) < 1900) {
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
              B.add(w.x, y, w.z, 4.2 + 1.6 * s, 4.8 + 1.4 * s, KIND.small, seed++);
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
    for (let i = 0; i < 900; i++) {
      const z = 160 + 560 * hash2i(i, 1, 41);
      const x = 60 + 520 * hash2i(i, 2, 41);
      const sd = model.coastSD(x, z);
      if (sd < 55 || sd > 240) continue;
      const y = H(x, z);
      if (!landOK(x, z, y, 8)) continue;
      if (vnoise(x / 70, z / 70, 42) < 0.45) continue;
      const s = hash2i(i, 3, 41);
      B.add(x, y, z, 8 + 6 * s, 7 + 4 * s, KIND.conifer, seed++);
    }
  }

  // ── settlements: yard trees and windbreaks
  for (const site of model.sites) {
    const n = site.kind === 'farm' ? 7 : site.kind === 'hamlet' ? 14 : 34;
    for (let i = 0; i < n; i++) {
      const a = hash2i(site.seed, i, 51) * Math.PI * 2;
      const rr = site.r * (0.45 + 0.75 * hash2i(site.seed, i, 52));
      const x = site.x + Math.cos(a) * rr,
        z = site.z + Math.sin(a) * rr;
      const y = H(x, z);
      if (!landOK(x, z, y, 10)) continue;
      const r = hash2i(site.seed, i, 53);
      const kind = r < 0.25 ? KIND.conifer : r < 0.35 ? KIND.poplar : KIND.broad;
      const hh = kind === KIND.poplar ? 16 + 6 * r : 8 + 8 * r;
      B.add(x, y, z, hh, kind === KIND.broad ? hh * 0.85 : hh * 0.33, kind, seed++);
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
}

/** shared by the 3D near trees and the impostor atlas, so both read alike */
function shapeOf(kind: number): Shape {
  const sh: Shape = { clumps: [], tiers: [], trunkTop: 0.45, trunkR: 0.035, branches: [] };
  const rnd = (i: number, k: number) => hash2i(kind * 100 + i, k, 4417);
  if (kind === KIND.broad) {
    // a darker core and an irregular shell of leaf masses with gaps between them (sky shows through
    // the silhouette), a few masses pushed out or hanging low
    sh.clumps.push({ x: 0, y: 0.6, z: 0, r: 0.2 });
    sh.clumps.push({ x: 0.03, y: 0.78, z: -0.02, r: 0.15 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (rnd(i, 1) - 0.5) * 0.6;
      const rr = 0.24 + 0.1 * rnd(i, 2);
      const y = 0.46 + 0.36 * rnd(i, 3);
      sh.clumps.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, r: 0.1 + 0.07 * rnd(i, 4) });
      if (i % 2 === 0) sh.branches.push([Math.cos(a) * rr * 0.75, y - 0.05, Math.sin(a) * rr * 0.75]);
    }
    sh.trunkTop = 0.48;
  } else if (kind === KIND.conifer) {
    const n = 5;
    for (let t = 0; t < n; t++) {
      const y0 = 0.14 + t * 0.155;
      sh.tiers.push([y0, Math.min(1, y0 + 0.3), 0.5 * (1 - t / (n + 0.6))]);
    }
    sh.trunkTop = 0.3;
    sh.trunkR = 0.03;
  } else if (kind === KIND.poplar) {
    // a slim column of leaf masses on the axis, tapering to a point
    for (let i = 0; i < 7; i++) {
      const y = 0.3 + i * 0.1;
      const r = 0.5 * (1 - Math.pow(i / 7, 1.6)) + 0.08;
      sh.clumps.push({ x: (rnd(i, 5) - 0.5) * 0.06, y, z: (rnd(i, 6) - 0.5) * 0.06, r: r * 0.36 });
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
  const idx: number[] = [];
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
        ao.push(isCrown ? Math.min(1, Math.max(0.2, (y - 0.1) / 0.8)) : 0.6);
      }
      crown.push(isCrown);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  };
  // trunk
  const tr = new THREE.CylinderGeometry(sh.trunkR * 0.7, sh.trunkR, sh.trunkTop, 5, 1, true);
  tr.translate(0, sh.trunkTop / 2, 0);
  addGeo(tr, 0, null, [0, 0, 0]);
  // branches: thin 3-sided prisms from the trunk top toward the clumps
  for (const b of sh.branches) {
    const len = Math.hypot(b[0], b[1] - sh.trunkTop, b[2]);
    const g = new THREE.CylinderGeometry(sh.trunkR * 0.3, sh.trunkR * 0.55, len, 3, 1, true);
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
  sh.clumps.forEach((c, i) => {
    const g = new THREE.IcosahedronGeometry(c.r, 0);
    // irregular clumps: displace vertices (a function of position only: shared vertices stay welded)
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v),
        y = p.getY(v),
        z = p.getZ(v);
      const k = 1 + 0.22 * (vnoise(x * 13 + i * 3.1, z * 13 + y * 7, 300 + kind) - 0.5);
      p.setXYZ(v, x * k, y * k * 0.92, z * k);
    }
    g.rotateY(hash2i(i, kind, 4418) * 3);
    g.translate(c.x, c.y, c.z);
    addGeo(g, 1, [c.x, c.y, c.z], crownC);
  });
  sh.tiers.forEach((t, i) => {
    const g = new THREE.ConeGeometry(t[2], t[1] - t[0], 9, 1, true);
    // drooping, ragged lower edge
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      if (p.getY(v) > 0) continue;
      const a = Math.atan2(p.getZ(v), p.getX(v));
      const k = 1 + 0.18 * Math.sin(a * 5 + i * 1.7);
      p.setXYZ(v, p.getX(v) * k, p.getY(v) - 0.02 * Math.cos(a * 3 + i), p.getZ(v) * k);
    }
    g.translate(0, (t[0] + t[1]) / 2, 0);
    addGeo(g, 1, null, [0, 0.55, 0]);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aCrown', new THREE.Float32BufferAttribute(crown, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
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
`;

/** leafy crown shading shared by the 3D trees and the impostors: albedo by kind + tint */
const TREE_ALBEDO = /* glsl */ `
vec3 treeAlbedo(float kind, float tint, float crown, float ly) {
  // tones matched to the vegetation module's forest (sRGB #4f8a33…#5a9636 broadleaf, #2b5a3a…#33683f
  // spruce/fir, #3d6a36 pine), linear
  vec3 broad = mix(vec3(0.078, 0.254, 0.033), vec3(0.102, 0.305, 0.037), tint) * 0.8;
  vec3 conif = mix(vec3(0.024, 0.102, 0.042), mix(vec3(0.033, 0.138, 0.05), vec3(0.047, 0.141, 0.037), step(0.7, tint)), tint) * 0.85;
  vec3 poplar = mix(vec3(0.07, 0.21, 0.035), vec3(0.09, 0.25, 0.04), tint) * 0.8;
  vec3 small = mix(vec3(0.09, 0.24, 0.04), vec3(0.12, 0.28, 0.05), tint) * 0.8;
  vec3 c = kind < 0.5 ? broad : kind < 1.5 ? conif : kind < 2.5 ? poplar : small;
  vec3 bark = vec3(0.09, 0.07, 0.055);
  return mix(bark, c * (0.75 + 0.45 * ly), crown);
}
`;

function treeMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, fog });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aCrown;
attribute float aAO;
attribute vec4 aInst; // kind, tint, height, phase
varying float vAO;
uniform float uTime;
uniform vec2 uWind;
varying vec3 vTW;
varying float vCrown;
varying float vTint;
varying float vKind;
varying float vLocalY;
${WIND_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCrown = aCrown;
vAO = aAO;
vKind = aInst.x;
vTint = aInst.y;
vLocalY = clamp((position.y - 0.25) / 0.7, 0.0, 1.0);
{
  // sway: the crown leans downwind with the gusts, more at the top
  vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 wv = thWindAt(base.xz);
  float bend = position.y * position.y * aCrown;
  float ph = aInst.w * 6.2831 + uTime * 1.3;
  // world-space sway (m) at the crown top, mapped back into the instance's local frame
  vec2 sway = wv * (0.25 + 0.12 * sin(ph)) * bend;
  float w2 = max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 0.25);
  transformed.xz += vec2(dot(instanceMatrix[0].xz, sway), dot(instanceMatrix[2].xz, sway)) / w2;
}`,
      )
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAO;\n' + TREE_FRAG_PARS + TREE_ALBEDO)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 nT = texture2D(tLN, vTW.xz * 0.37 + vTW.y * 0.21);
float leafAO = mix(0.42, 1.0, vAO) * (0.78 + 0.44 * nT.r);
vec4 diffuseColor = vec4(treeAlbedo(vKind, vTint, vCrown, vLocalY) * mix(1.0, leafAO, vCrown), opacity);`,
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
  float bt = pow(clamp(dot(-V, normalize(uSunDir)), 0.0, 1.0), 6.0) * vCrown * (1.0 - uNight);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.9, 0.55) * bt * 1.6;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'th-landtree-v1';
  return mat;
}

// ───────────────────────────────────────────────────── impostors ──

const ATLAS_W = 512,
  ATLAS_H = 256; // 4 cells of 128 × 256

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
    for (const c of sh.clumps) fill(c.x, c.y, c.z, c.r * 0.8, c.r * 0.8, Math.round(10 + 60 * c.r), Math.max(0.05, c.r * 0.42));
    for (const t of sh.tiers) {
      for (let k = 0; k < 4; k++) {
        const f = k / 4;
        fill(0, t[0] + (t[1] - t[0]) * f * 0.6, 0, t[2] * (1 - f * 0.8), 0.03, 6, 0.05 + 0.03 * (1 - f));
      }
    }
    const trunkTop = sh.trunkTop,
      trunkW = sh.trunkR;
    for (let py = 0; py < ATLAS_H; py++) {
      const y = 1 - (py + 0.5) / ATLAS_H;
      for (let px = 0; px < CW; px++) {
        const x = (px + 0.5) / CW - 0.5;
        let bz = -9,
          bn: [number, number, number] = [0, 0, 1],
          bt = 0;
        for (const c of clumps) {
          const dx = (x - c[0]) / c[3],
            dy = (y - c[1]) / c[3];
          const d2 = dx * dx + dy * dy;
          if (d2 >= 1) continue;
          const dz = Math.sqrt(1 - d2);
          const zz = c[2] + dz * c[3];
          if (zz > bz) {
            bz = zz;
            bn = [dx, dy, dz];
            bt = c[4];
          }
        }
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
varying float vLocalY;`,
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
  vUv2 = vec2((iDat.y + 0.5 + q.x) * 0.25, 1.0 - q.y);
  vKind = iDat.y;
  vTint = iDat.z;
  vBR = R; vBU = U; vBF = F;
  vCrown = 1.0;
  vLocalY = q.y;
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
vec4 diffuseColor = vec4(treeAlbedo(vKind, vTint, tc.g, tc.b) * (0.6 + 0.6 * tc.r), 1.0);`,
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
  float bt = pow(clamp(dot(-V, normalize(uSunDir)), 0.0, 1.0), 6.0) * tc.g * (1.0 - uNight);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.9, 0.55) * bt * 1.6;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'th-landimp-v1';
  return mat;
}

// ───────────────────────────────────────────────────── the system ──

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
  const tmat = treeMaterial(uniforms, fog);
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
    m.name = `land-trees-near${k}`;
    m.castShadow = shadows;
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
  quad.setAttribute('iPos', new THREE.InstancedBufferAttribute(ip, 4));
  quad.setAttribute('iDat', new THREE.InstancedBufferAttribute(id, 4));
  quad.instanceCount = list.n;
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
      near[k].instanceMatrix.needsUpdate = true;
      instData[k].needsUpdate = true;
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
