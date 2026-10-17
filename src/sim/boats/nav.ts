// Navigation field for boats: a 1 m grid over the slab marking navigable water (deep enough,
// clear of the harbour structures and the slab edge) and, for every cell, the distance to the
// nearest non-navigable cell (two-pass chamfer distance transform). Boats steer by sampling
// the clearance ahead of them; invariants check hull outlines against the raw land/obstacle
// test (no safety margins).

import type { CityPlan } from '../../core/plan';
import type { Rect } from '../../core/geom';
import { WATER_LEVEL } from '../../core/constants';

export interface WaterLike {
  depth(x: number, z: number): number;
}

export class NavField {
  readonly x0: number;
  readonly z0: number;
  readonly res = 1;
  readonly w: number;
  readonly h: number;
  /** 1 = not navigable (land, shallow, obstacle, slab margin) */
  readonly blocked: Uint8Array;
  /** distance (m) from the cell centre to the nearest blocked cell */
  readonly clear: Float32Array;
  readonly buildMs: number;

  constructor(
    private plan: CityPlan,
    private water: WaterLike | null,
    /** hard obstacles (raw, as given by the structures) */
    readonly obstacles: Rect[],
    opts: { minDepth: number; edgeMargin: number; obstaclePad: number },
  ) {
    const t0 = performance.now();
    const s = plan.slab;
    this.x0 = s.x0;
    this.z0 = s.z0;
    this.w = Math.round(s.x1 - s.x0);
    this.h = Math.round(s.z1 - s.z0);
    const N = this.w * this.h;
    const blocked = new Uint8Array(N);
    const pad = opts.obstaclePad;
    for (let j = 0; j < this.h; j++) {
      const z = this.z0 + j + 0.5;
      for (let i = 0; i < this.w; i++) {
        const x = this.x0 + i + 0.5;
        let b = 0;
        if (x < s.x0 + opts.edgeMargin || x > s.x1 - opts.edgeMargin || z < s.z0 + opts.edgeMargin || z > s.z1 - opts.edgeMargin) b = 1;
        else if (!plan.isWater(x, z)) b = 1;
        else if (this.depthAt(x, z) < opts.minDepth) b = 1;
        else {
          for (const r of obstacles) {
            if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) {
              b = 1;
              break;
            }
          }
        }
        blocked[j * this.w + i] = b;
      }
    }
    this.blocked = blocked;
    // chamfer distance transform (weights 1, √2) in cell units
    const INF = 1e9;
    const d = new Float32Array(N);
    for (let k = 0; k < N; k++) d[k] = blocked[k] ? 0 : INF;
    const W = this.w,
      H = this.h;
    const D = Math.SQRT2;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        let v = d[k];
        if (v === 0) continue;
        if (i > 0) v = Math.min(v, d[k - 1] + 1);
        if (j > 0) {
          v = Math.min(v, d[k - W] + 1);
          if (i > 0) v = Math.min(v, d[k - W - 1] + D);
          if (i < W - 1) v = Math.min(v, d[k - W + 1] + D);
        }
        d[k] = v;
      }
    }
    for (let j = H - 1; j >= 0; j--) {
      for (let i = W - 1; i >= 0; i--) {
        const k = j * W + i;
        let v = d[k];
        if (v === 0) continue;
        if (i < W - 1) v = Math.min(v, d[k + 1] + 1);
        if (j < H - 1) {
          v = Math.min(v, d[k + W] + 1);
          if (i < W - 1) v = Math.min(v, d[k + W + 1] + D);
          if (i > 0) v = Math.min(v, d[k + W - 1] + D);
        }
        d[k] = v;
      }
    }
    // distance from a cell centre to the nearest blocked cell's boundary ≈ d − 0.5
    for (let k = 0; k < N; k++) d[k] = d[k] >= INF ? 999 : Math.max(0, d[k] - 0.5);
    this.clear = d;
    this.buildMs = performance.now() - t0;
  }

  /** water depth below the still level (water service, else the plan heightfield) */
  depthAt(x: number, z: number): number {
    if (this.water) return this.water.depth(x, z);
    return WATER_LEVEL - this.plan.heightAt(x, z);
  }

  /** bilinear clearance (m) at a world point; 0 outside the grid */
  clearance(x: number, z: number): number {
    const fx = x - this.x0 - 0.5,
      fz = z - this.z0 - 0.5;
    const i = Math.floor(fx),
      j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.w - 1 || j >= this.h - 1) return 0;
    const tx = fx - i,
      tz = fz - j;
    const k = j * this.w + i;
    const c = this.clear;
    const a = c[k] + (c[k + 1] - c[k]) * tx;
    const b = c[k + this.w] + (c[k + this.w + 1] - c[k + this.w]) * tx;
    return a + (b - a) * tz;
  }

  /** gradient of the clearance (points away from the nearest obstacle), written into out */
  gradient(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
    const e = 0.75;
    out.x = (this.clearance(x + e, z) - this.clearance(x - e, z)) / (2 * e);
    out.z = (this.clearance(x, z + e) - this.clearance(x, z - e)) / (2 * e);
    return out;
  }

  /** strict test used by invariants: open water (any depth > 0.15 m) and outside every raw obstacle */
  isOpenWater(x: number, z: number): boolean {
    if (!this.plan.isWater(x, z)) return false;
    if (this.depthAt(x, z) < 0.15) return false;
    for (const r of this.obstacles) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return false;
    return true;
  }

  /** count of navigable cells (stats) */
  get navigableCells(): number {
    let n = 0;
    for (let k = 0; k < this.blocked.length; k++) if (!this.blocked[k]) n++;
    return n;
  }
}
