// Coarse "what does it sound like here" map of the plan: greenery, sea, river, coast,
// roads, buildings and hills per 10 m cell. The audio mixer samples it around the camera
// focus (wider when zoomed out) to set the ambience levels.

import type { CityPlan } from '../../core/plan';
import { OCC, type OccupancyGrid } from '../../core/occupancy';
import { QUAY_X, RIVER } from '../../core/constants';

export interface EnvSample {
  green: number;
  sea: number;
  river: number;
  coast: number;
  road: number;
  urban: number;
  hills: number;
}

const CH = ['green', 'sea', 'river', 'coast', 'road', 'urban', 'hills'] as const;
type Ch = (typeof CH)[number];

const BLOCK_GREEN: Record<string, number> = {
  park: 1,
  riverside: 0.9,
  residential: 0.5,
  suburb: 0.55,
  hills: 0.75,
  stadium: 0.35,
  beach: 0.1,
  civic: 0.2,
  oldtown: 0.15,
  market: 0.1,
  downtown: 0.05,
  midtown: 0.1,
  industrial: 0.05,
  harbor: 0.02,
  station: 0.05,
};

export class EnvMap {
  readonly res = 10;
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  private data: Record<Ch, Float32Array>;

  constructor(plan: CityPlan, occ: OccupancyGrid) {
    const s = plan.slab;
    this.x0 = s.x0;
    this.z0 = s.z0;
    this.w = Math.ceil((s.x1 - s.x0) / this.res);
    this.h = Math.ceil((s.z1 - s.z0) / this.res);
    const n = this.w * this.h;
    const raw = {} as Record<Ch, Float32Array>;
    for (const c of CH) raw[c] = new Float32Array(n);
    const subs = [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
      [0.5, 0.5],
    ];
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const k = j * this.w + i;
        let green = 0,
          sea = 0,
          river = 0,
          coast = 0,
          road = 0,
          urban = 0,
          hills = 0;
        for (const [u, v] of subs) {
          const x = this.x0 + (i + u) * this.res,
            z = this.z0 + (j + v) * this.res;
          const water = plan.isWater(x, z);
          const hgt = plan.heightAt(x, z);
          if (water) {
            if (z > RIVER.z0 - 1 && z < RIVER.z1 + 1 && x < 140) river += 1;
            else if (x > QUAY_X - 30) sea += 1;
            else green += 0.6; // park pond
          }
          if (hgt > 2) hills += Math.min(1, hgt / 12);
          const o = occ.get(x, z);
          if (o & OCC.ROAD) road += 1;
          if (o & OCC.BUILDING) urban += 1;
          const d = plan.districtAt(x, z);
          if (d) green += BLOCK_GREEN[d.kind] ?? 0;
          else if (z > RIVER.z1) green += 0.85; // south bank
          else if (hgt > 1) green += 0.7;
        }
        const m = subs.length;
        raw.green[k] = Math.min(1, green / m);
        raw.sea[k] = sea / m;
        raw.river[k] = river / m;
        raw.road[k] = road / m;
        raw.urban[k] = urban / m;
        raw.hills[k] = hills / m;
        raw.coast[k] = coast / m;
      }
    }
    // areas refine greenery
    for (const a of plan.areas) {
      const g = a.kind === 'beach' || a.kind === 'promenade' || a.kind === 'boardwalk' ? -1 : a.greenery;
      this.forRect(a.rect.x0, a.rect.z0, a.rect.x1, a.rect.z1, (k) => {
        if (g < 0) raw.coast[k] = Math.max(raw.coast[k], 1);
        else raw.green[k] = Math.max(raw.green[k], g * 0.9);
      });
    }
    // coast = land cells next to the sea (beach, quay, pier)
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const k = j * this.w + i;
        let nearSea = 0;
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const ii = i + di,
              jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) continue;
            nearSea = Math.max(nearSea, raw.sea[jj * this.w + ii] * (1 - Math.hypot(di, dj) / 3.2));
          }
        }
        raw.coast[k] = Math.max(raw.coast[k], nearSea);
      }
    }
    // soften with a 3×3 blur
    this.data = {} as Record<Ch, Float32Array>;
    for (const c of CH) {
      const src = raw[c];
      const dst = new Float32Array(n);
      for (let j = 0; j < this.h; j++) {
        for (let i = 0; i < this.w; i++) {
          let sum = 0,
            wsum = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const ii = i + di,
                jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) continue;
              const wgt = di === 0 && dj === 0 ? 2 : 1;
              sum += src[jj * this.w + ii] * wgt;
              wsum += wgt;
            }
          }
          dst[j * this.w + i] = sum / wsum;
        }
      }
      this.data[c] = dst;
    }
  }

  private forRect(x0: number, z0: number, x1: number, z1: number, fn: (k: number) => void): void {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.res)),
      i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / this.res));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.res)),
      j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / this.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * this.w + i);
  }

  private at(c: Ch, x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.res),
      j = Math.floor((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return c === 'sea' && x > this.x0 + this.w * this.res ? 1 : 0;
    return this.data[c][j * this.w + i];
  }

  /** weighted average in a disc of radius r around (x, z) */
  sample(x: number, z: number, r: number, out: EnvSample): EnvSample {
    for (const c of CH) out[c] = 0;
    let wsum = 0;
    const N = 3;
    for (let b = -N; b <= N; b++) {
      for (let a = -N; a <= N; a++) {
        const u = a / N,
          v = b / N;
        const d2 = u * u + v * v;
        if (d2 > 1.05) continue;
        const wgt = 1 - d2 * 0.7;
        const px = x + u * r,
          pz = z + v * r;
        for (const c of CH) out[c] += this.at(c, px, pz) * wgt;
        wsum += wgt;
      }
    }
    for (const c of CH) out[c] /= wsum;
    return out;
  }
}
