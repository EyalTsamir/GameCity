// Coarse height field of the diorama used by the camera:
//  * ground  = natural terrain, never below the water surface (beyond the slab: the landscape's
//              height when one is given — world mode — else 0)
//  * top     = ground + buildings / tall landmarks (roof heights)
// Used for the camera floor (never inside hills, water or houses), for "what is under the
// cursor" (wheel zoom towards the cursor, double-click fly-to) and for chase-cam occlusion.

import * as THREE from 'three';
import type { CityPlan } from '../../core/plan';
import { WATER_LEVEL } from '../../core/constants';

const RES = 2;
/** solids narrower than this (m) are not arm obstacles (see armBlocks) */
const THIN_SOLID = 7;

export class SurfaceField {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly w: number;
  readonly h: number;
  readonly ground: Float32Array;
  readonly top: Float32Array;
  readonly maxTop: number;
  readonly minGround: number;
  readonly maxGround: number;
  /** exact solid boxes (buildings, tall landmarks): x0, z0, x1, z1, top — for arm collision */
  private solids: number[] = [];
  private solidN = 0;
  private iv: number[] = [];

  /** `outsideGround`: ground height beyond the slab (world mode: the landscape), else 0 there */
  constructor(
    private plan: CityPlan,
    private outsideGround?: (x: number, z: number) => number,
  ) {
    const s = plan.slab;
    this.x0 = s.x0;
    this.z0 = s.z0;
    this.x1 = s.x1;
    this.z1 = s.z1;
    this.w = Math.ceil((s.x1 - s.x0) / RES) + 1;
    this.h = Math.ceil((s.z1 - s.z0) / RES) + 1;
    const n = this.w * this.h;
    this.ground = new Float32Array(n);
    this.top = new Float32Array(n);
    let minG = Infinity;
    for (let j = 0; j < this.h; j++) {
      const z = this.z0 + j * RES;
      for (let i = 0; i < this.w; i++) {
        const x = this.x0 + i * RES;
        // max of a few samples so steep hill flanks are not under-estimated
        let g = plan.heightAt(x, z);
        g = Math.max(g, plan.heightAt(x + RES * 0.5, z), plan.heightAt(x, z + RES * 0.5), plan.heightAt(x - RES * 0.5, z), plan.heightAt(x, z - RES * 0.5));
        g = Math.max(g, WATER_LEVEL);
        const k = j * this.w + i;
        this.ground[k] = g;
        this.top[k] = g;
        if (g < minG) minG = g;
      }
    }
    this.minGround = minG;
    let maxG = -Infinity;
    for (let k = 0; k < n; k++) if (this.ground[k] > maxG) maxG = this.ground[k];
    this.maxGround = maxG;
    for (const lot of plan.lots) this.raiseRect(lot.footprint.x0, lot.footprint.z0, lot.footprint.x1, lot.footprint.z1, lot.height + 0.6);
    for (const f of plan.features) {
      const p = f.params ?? {};
      const num = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
      switch (f.kind) {
        case 'lighthouse':
          this.raiseCircle(f.x, f.z, Math.max(f.radius, 3), num('height', 24) + 2);
          break;
        case 'chimney':
          this.raiseCircle(f.x, f.z, Math.max(f.radius, 2), num('height', 30));
          break;
        case 'windturbine':
          this.raiseCircle(f.x, f.z, 2.5, this.groundAt(f.x, f.z) + num('height', 30) + 2);
          break;
        case 'towercrane':
          this.raiseCircle(f.x, f.z, 2.5, num('height', 58));
          break;
        case 'floodlight':
          this.raiseCircle(f.x, f.z, 1.5, num('height', 26));
          break;
        case 'ferriswheel':
          if (f.rect) this.raiseRect(f.rect.x0, f.rect.z0, f.rect.x1, f.rect.z1, num('hub', 17.5) + num('radius', 15) + 1);
          break;
        case 'tanks':
          if (f.rect) this.raiseRect(f.rect.x0, f.rect.z0, f.rect.x1, f.rect.z1, num('height', 9));
          break;
        case 'containerstack':
          if (f.rect) this.raiseRect(f.rect.x0, f.rect.z0, f.rect.x1, f.rect.z1, num('maxHeight', 3) * 2.6);
          break;
        case 'gantrycrane':
          if (f.a && f.b) this.raiseRect(Math.min(f.a.x, f.b.x) - 4, Math.min(f.a.z, f.b.z), Math.max(f.a.x, f.b.x) + 4, Math.max(f.a.z, f.b.z), num('height', 30) * 0.6);
          break;
        case 'cargoship': {
          const L = num('length', 70) / 2,
            B = num('beam', 12) / 2;
          // ship lies along z (yaw ±PI) or x
          const alongZ = Math.abs(Math.sin(f.yaw)) < 0.5;
          if (alongZ) this.raiseRect(f.x - B, f.z - L, f.x + B, f.z + L, 14);
          else this.raiseRect(f.x - L, f.z - B, f.x + L, f.z + B, 14);
          break;
        }
        default:
          break;
      }
    }
    let mt = -Infinity;
    for (let k = 0; k < n; k++) if (this.top[k] > mt) mt = this.top[k];
    this.maxTop = mt;
  }

  /** raise the grid points that lie inside the rectangle (grid points are sampled at x0 + i·RES) */
  private raiseRect(x0: number, z0: number, x1: number, z1: number, height: number): void {
    this.solids.push(x0, z0, x1, z1, height);
    this.solidN++;
    // narrow footprints still get at least one row/column of points
    if (x1 - x0 < RES) {
      const c = (x0 + x1) / 2;
      x0 = c - RES / 2;
      x1 = c + RES / 2;
    }
    if (z1 - z0 < RES) {
      const c = (z0 + z1) / 2;
      z0 = c - RES / 2;
      z1 = c + RES / 2;
    }
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / RES)),
      i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / RES));
    const j0 = Math.max(0, Math.ceil((z0 - this.z0) / RES)),
      j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.w + i;
        if (height > this.top[k]) this.top[k] = height;
      }
    }
  }

  private raiseCircle(x: number, z: number, r: number, height: number): void {
    this.solids.push(x - r, z - r, x + r, z + r, height);
    this.solidN++;
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / RES)),
      i1 = Math.min(this.w - 1, Math.ceil((x + r - this.x0) / RES));
    const j0 = Math.max(0, Math.floor((z - r - this.z0) / RES)),
      j1 = Math.min(this.h - 1, Math.ceil((z + r - this.z0) / RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = this.x0 + i * RES,
          cz = this.z0 + j * RES;
        if ((cx - x) ** 2 + (cz - z) ** 2 > (r + RES) ** 2) continue;
        const k = j * this.w + i;
        if (height > this.top[k]) this.top[k] = height;
      }
    }
  }

  inside(x: number, z: number): boolean {
    return x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1;
  }

  /** bilinear sample of a field; outside the slab returns `outside` */
  private sample(arr: Float32Array, x: number, z: number, outside: number): number {
    if (!this.inside(x, z)) return outside;
    const fx = (x - this.x0) / RES,
      fz = (z - this.z0) / RES;
    const i = Math.min(this.w - 2, Math.floor(fx)),
      j = Math.min(this.h - 2, Math.floor(fz));
    const tx = fx - i,
      tz = fz - j;
    const k = j * this.w + i;
    const a = arr[k],
      b = arr[k + 1],
      c = arr[k + this.w],
      d = arr[k + this.w + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /** max of the 4 surrounding cells (conservative, for floors) */
  private sampleMax(arr: Float32Array, x: number, z: number, outside: number): number {
    if (!this.inside(x, z)) return outside;
    const i = Math.min(this.w - 2, Math.floor((x - this.x0) / RES)),
      j = Math.min(this.h - 2, Math.floor((z - this.z0) / RES));
    const k = j * this.w + i;
    return Math.max(arr[k], arr[k + 1], arr[k + this.w], arr[k + this.w + 1]);
  }

  /** ground beyond the slab (landscape height, never below the water surface) */
  private outside(x: number, z: number): number {
    return this.outsideGround ? Math.max(this.outsideGround(x, z), WATER_LEVEL) : 0;
  }

  /** terrain / water surface height (smooth) */
  groundAt(x: number, z: number): number {
    return this.inside(x, z) ? this.sample(this.ground, x, z, 0) : this.outside(x, z);
  }

  /** highest solid surface (terrain, water, roofs) — conservative */
  topAt(x: number, z: number): number {
    return this.inside(x, z) ? this.sampleMax(this.top, x, z, 0) : this.outside(x, z);
  }

  /** roofs, bilinear (accurate near facades; for line-of-sight tests) */
  topSmoothAt(x: number, z: number): number {
    return this.inside(x, z) ? this.sample(this.top, x, z, 0) : this.outside(x, z);
  }

  /** conservative ground floor (max of neighbouring cells) */
  groundMaxAt(x: number, z: number): number {
    return this.inside(x, z) ? this.sampleMax(this.ground, x, z, 0) : this.outside(x, z);
  }

  /**
   * March a ray against the field. `roofs` includes buildings, otherwise terrain/water only.
   * Writes the hit point into `out` and returns the distance along the ray, or -1.
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, out: THREE.Vector3, roofs = true): number {
    const arr = roofs ? this.top : this.ground;
    const ceiling = (roofs ? this.maxTop : 40) + 1;
    let t = 0;
    // skip straight down to the ceiling plane when starting above it
    if (origin.y > ceiling) {
      if (dir.y >= -1e-6) return this.planeFallback(origin, dir, maxDist, out);
      t = (origin.y - ceiling) / -dir.y;
    }
    const step = RES * 0.5;
    let prevT = t;
    let px = origin.x + dir.x * t,
      py = origin.y + dir.y * t,
      pz = origin.z + dir.z * t;
    let prevAbove = py - this.sample(arr, px, pz, -1e9);
    if (prevAbove < 0 && t === 0) {
      out.set(px, py, pz);
      return 0;
    }
    while (t < maxDist) {
      t += step;
      px = origin.x + dir.x * t;
      py = origin.y + dir.y * t;
      pz = origin.z + dir.z * t;
      if (py > ceiling && dir.y > 0) break; // climbing away above everything
      // left the slab and moving away from it
      if (!this.inside(px, pz)) {
        if ((px < this.x0 && dir.x <= 0) || (px > this.x1 && dir.x >= 0) || (pz < this.z0 && dir.z <= 0) || (pz > this.z1 && dir.z >= 0)) break;
        prevT = t;
        prevAbove = 1;
        continue;
      }
      const above = py - this.sample(arr, px, pz, -1e9);
      if (above <= 0) {
        // refine by bisection
        let lo = prevT,
          hi = t;
        for (let it = 0; it < 8; it++) {
          const mid = (lo + hi) / 2;
          const mx = origin.x + dir.x * mid,
            my = origin.y + dir.y * mid,
            mz = origin.z + dir.z * mid;
          if (my - this.sample(arr, mx, mz, -1e9) <= 0) hi = mid;
          else lo = mid;
        }
        out.set(origin.x + dir.x * hi, origin.y + dir.y * hi, origin.z + dir.z * hi);
        return hi;
      }
      prevT = t;
      prevAbove = above;
    }
    void prevAbove;
    return this.planeFallback(origin, dir, maxDist, out);
  }

  /** ray vs the y=0 plane (used outside the slab) */
  private planeFallback(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, out: THREE.Vector3): number {
    if (dir.y >= -1e-6) return -1;
    const t = -origin.y / dir.y;
    if (t < 0 || t > maxDist * 1.5) return -1;
    out.set(origin.x + dir.x * t, 0, origin.z + dir.z * t);
    return t;
  }

  /**
   * Stretches of the segment o + d·s (s ∈ [0, len], |d| = 1) that run more than `deepSolid` below the top
   * of a solid (inside its footprint grown by `margin`) or more than `deepGround` below the terrain.
   * Exact boxes for buildings / tall landmarks (the height grid is ~2 m too fat for an arm grazing a
   * facade), a 2 m march for the smooth hills. Writes merged [start, end] pairs into `out` (end = Infinity
   * when the segment ends inside) and returns how many.
   */
  armBlocks(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number, deepSolid: number, deepGround: number, margin: number, out: Float32Array, maxN: number): number {
    const iv = this.iv;
    iv.length = 0;
    const S = this.solids;
    const ex = ox + dx * len,
      ez = oz + dz * len;
    const minX = Math.min(ox, ex),
      maxX = Math.max(ox, ex),
      minZ = Math.min(oz, ez),
      maxZ = Math.max(oz, ez);
    const lowY = Math.min(oy, oy + dy * len);
    for (let i = 0; i < this.solidN; i++) {
      const k = i * 5;
      const yTop = S[k + 4] - deepSolid;
      if (lowY >= yTop) continue;
      // masts, chimneys, crane towers, floodlights: swinging the arm in front of a 5 m pole is far more
      // jarring than grazing it for a frame or two
      if (Math.min(S[k + 2] - S[k], S[k + 3] - S[k + 1]) < THIN_SOLID) continue;
      const x0 = S[k] - margin,
        z0 = S[k + 1] - margin,
        x1 = S[k + 2] + margin,
        z1 = S[k + 3] + margin;
      if (x1 < minX || x0 > maxX || z1 < minZ || z0 > maxZ) continue;
      let s0 = 0,
        s1 = len;
      if (Math.abs(dx) < 1e-9) {
        if (ox < x0 || ox > x1) continue;
      } else {
        let a = (x0 - ox) / dx,
          b = (x1 - ox) / dx;
        if (a > b) {
          const t = a;
          a = b;
          b = t;
        }
        if (a > s0) s0 = a;
        if (b < s1) s1 = b;
        if (s0 >= s1) continue;
      }
      if (Math.abs(dz) < 1e-9) {
        if (oz < z0 || oz > z1) continue;
      } else {
        let a = (z0 - oz) / dz,
          b = (z1 - oz) / dz;
        if (a > b) {
          const t = a;
          a = b;
          b = t;
        }
        if (a > s0) s0 = a;
        if (b < s1) s1 = b;
        if (s0 >= s1) continue;
      }
      if (Math.abs(dy) < 1e-9) {
        if (oy >= yTop) continue;
      } else if (dy > 0) {
        const b = (yTop - oy) / dy;
        if (b < s1) s1 = b;
      } else {
        const a = (yTop - oy) / dy;
        if (a > s0) s0 = a;
      }
      if (s0 >= s1) continue;
      iv.push(s0, s1);
    }
    // the hills (smooth): a coarse march below the conservative ground
    if (lowY < this.maxGround - deepGround) {
      let inside = false;
      let start = 0;
      for (let s = 0; s <= len + 1e-6; s += 2) {
        const y = oy + dy * s;
        if (dy > 0 && y > this.maxGround) break;
        const blocked = y < this.groundMaxAt(ox + dx * s, oz + dz * s) - deepGround;
        if (blocked !== inside) {
          if (blocked) start = s;
          else iv.push(start, s);
          inside = blocked;
        }
      }
      if (inside) iv.push(start, len);
    }
    // sort by start (few entries: insertion sort on pairs) and merge stretches closer than 1 m
    const m = iv.length / 2;
    for (let i = 1; i < m; i++) {
      const a = iv[2 * i],
        b = iv[2 * i + 1];
      let j = i - 1;
      while (j >= 0 && iv[2 * j] > a) {
        iv[2 * j + 2] = iv[2 * j];
        iv[2 * j + 3] = iv[2 * j + 1];
        j--;
      }
      iv[2 * j + 2] = a;
      iv[2 * j + 3] = b;
    }
    let n = 0;
    for (let i = 0; i < m; i++) {
      const a = iv[2 * i],
        b = iv[2 * i + 1];
      if (n > 0 && a <= out[2 * n - 1] + 1.0) {
        if (b > out[2 * n - 1]) out[2 * n - 1] = b;
      } else if (n < maxN) {
        out[2 * n] = a;
        out[2 * n + 1] = b;
        n++;
      }
    }
    for (let i = 0; i < n; i++) if (out[2 * i + 1] >= len - 1e-6) out[2 * i + 1] = Infinity;
    return n;
  }

  /** is the point more than `deep` below the top of a (non-thin) solid grown by `margin`, or below the hills? */
  insideSolid(x: number, y: number, z: number, margin: number, deep: number): boolean {
    if (y < this.groundMaxAt(x, z) - deep) return true;
    const S = this.solids;
    for (let i = 0; i < this.solidN; i++) {
      const k = i * 5;
      if (y >= S[k + 4] - deep) continue;
      if (x < S[k] - margin || x > S[k + 2] + margin || z < S[k + 1] - margin || z > S[k + 3] + margin) continue;
      if (Math.min(S[k + 2] - S[k], S[k + 3] - S[k + 1]) < THIN_SOLID) continue;
      return true;
    }
    return false;
  }

  /**
   * Highest solid top (exact boxes, footprints grown by `margin`, thin masts ignored) or the terrain at
   * (x, z) — the roof the camera must clear. The height grid is ~2 m too fat for a camera next to a facade.
   */
  roofAt(x: number, z: number, margin: number): number {
    let top = this.groundMaxAt(x, z);
    const S = this.solids;
    for (let i = 0; i < this.solidN; i++) {
      const k = i * 5;
      const t = S[k + 4];
      if (t <= top) continue;
      if (x < S[k] - margin || x > S[k + 2] + margin || z < S[k + 1] - margin || z > S[k + 3] + margin) continue;
      if (Math.min(S[k + 2] - S[k], S[k + 3] - S[k + 1]) < THIN_SOLID) continue;
      top = t;
    }
    return top;
  }

  /**
   * Distance along the segment from `a` towards `b` (|b-a| = len) before it enters a roof volume,
   * or `len` when the line of sight is clear. Used to pull the chase camera in front of buildings.
   */
  clearance(a: THREE.Vector3, dir: THREE.Vector3, len: number, skip = 3): number {
    const step = 1.0;
    for (let t = skip; t < len; t += step) {
      const x = a.x + dir.x * t,
        y = a.y + dir.y * t,
        z = a.z + dir.z * t;
      if (!this.inside(x, z)) continue;
      if (y < this.sample(this.top, x, z, -1e9) + 0.3) return t;
    }
    return len;
  }
}
