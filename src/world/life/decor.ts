// What hangs on the lines: bunting / prayer flags / festoon lights across the old-town and market
// streets, laundry across back courtyards and on balconies. Lines come from the buildings service
// (wear's anchors: `spans`, `laundry`, `facades`); everything here is deterministic.

import type { CityContext } from '../../core/context';
import { addLampLights, type LampLight } from '../../core/lampLight';
import { Rng } from '../../core/rng';
import { ClothSystem, PAT, SHAPE } from './cloth';

/** Structural copies of the buildings-service anchor types we read (src/world/buildings/anchors.ts). */
export interface SpanLike {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  kind: 'street' | 'court';
  district: string;
  lotA: number;
  lotB: number;
}
export interface FacadeLike {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  nx: number;
  nz: number;
  top: number;
  upper: number;
  lot: number;
}
export interface LaundryLike {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  nx: number;
  nz: number;
  lot: number;
}
export interface BuildingsLike {
  spans?: SpanLike[];
  facades?: FacadeLike[];
  laundry?: LaundryLike[];
  setStaticLaundry?(on: boolean): void;
}

const PENNANT_SETS: string[][] = [
  ['#d6453d', '#f2c14e', '#3a7fc1', '#4f9d5b', '#f08a3c', '#8e5aa8', '#f4efe4'],
  ['#c8402e', '#f4efe4', '#3f8f5a'],
  ['#2f6db5', '#f4efe4'],
  ['#c8402e', '#f2c14e'],
  ['#e89a9a', '#a8c8e0', '#f2dc98', '#b8d8a8', '#d0b0d8', '#f4efe4'],
  ['#c8402e', '#f4efe4', '#2f5aa0'],
  ['#e8743c', '#f2c14e', '#d6453d', '#f4efe4'],
  ['#1f7a8c', '#f2c14e', '#e85d4a', '#f4efe4'],
];
const PRAYER = ['#2f6db5', '#f4efe4', '#c8402e', '#3f8f5a', '#f2c14e'];
const BULB_WARM = ['#ffd9a0', '#ffd39a', '#ffe0b0'];
const BULB_FEST = ['#ff6a4a', '#ffd25a', '#6ad06a', '#5aa0ff', '#ff8ad0', '#ffd9a0'];

const LAUNDRY_COLS = ['#f2efe8', '#ece8de', '#f2efe8', '#a8c4dc', '#e8a8b0', '#f0d890', '#2f3a52', '#4a6a90', '#c84a3a', '#6a9a6a', '#d8c8a8', '#ffffff', '#e8c0a0', '#7a5a8a'];

export interface DecorStats {
  street: number;
  court: number;
  balcony: number;
  bunting: number;
  prayer: number;
  festoon: number;
  laundryLines: number;
  laundryItems: number;
  lowest: number;
  lights: number;
}

/** Hang cloth on every line the buildings service offers. Returns counts for stats(). */
export function decorate(ctx: CityContext, cloth: ClothSystem, b: BuildingsLike | undefined, opts: { bunting: boolean; laundry: boolean }): DecorStats {
  const st: DecorStats = { street: 0, court: 0, balcony: 0, bunting: 0, prayer: 0, festoon: 0, laundryLines: 0, laundryItems: 0, lowest: Infinity, lights: 0 };
  if (!b) return st;
  const spans = b.spans ?? [];
  const facades = b.facades ?? [];
  const lamps: LampLight[] = [];
  const facadeOf = new Map<number, FacadeLike>();
  for (const f of facades) facadeOf.set(f.lot, f);

  for (const sp of spans) {
    const rng = new Rng((Math.imul(sp.lotA + 1, 92821) ^ Math.imul(sp.lotB + 7, 68917)) >>> 0 || 3);
    if (sp.kind === 'street') {
      if (!opts.bunting) continue;
      st.street++;
      streetLine(cloth, rng, sp, sp.ax, sp.az, sp.bx, sp.bz, st, lamps, false);
      // zig-zag partner: a diagonal line from A shifted along the street to B shifted the other way,
      // when both facades are long enough there
      const fa = facadeOf.get(sp.lotA),
        fb = facadeOf.get(sp.lotB);
      if (fa && fb && rng.chance(0.55)) {
        const shift = rng.range(2.2, 3.4) * (rng.chance(0.5) ? 1 : -1);
        const pa = slideOnFacade(fa, sp.ax, sp.az, shift, 0.9),
          pb = slideOnFacade(fb, sp.bx, sp.bz, -shift, 0.9);
        if (pa && pb) {
          const r2 = rng.fork('zig');
          streetLine(cloth, r2, { ...sp, ay: sp.ay + r2.range(0.35, 0.8), by: sp.by + r2.range(0.35, 0.8) }, pa[0], pa[1], pb[0], pb[1], st, lamps, true);
        }
      }
    } else {
      if (!opts.laundry) continue;
      st.court++;
      const L = Math.hypot(sp.bx - sp.ax, sp.bz - sp.az);
      if (sp.district === 'market' && L > 11 && rng.chance(0.6) && opts.bunting) {
        streetLine(cloth, rng, sp, sp.ax, sp.az, sp.bx, sp.bz, st, lamps, false);
        continue;
      }
      laundryLine(cloth, rng, sp.ax, sp.ay, sp.az, sp.bx, sp.by, sp.bz, 0.22 + 0.012 * L, true, st);
    }
  }

  // balcony lines (rigid, wire drawn by buildings)
  if (opts.laundry && b.laundry?.length) {
    for (const l of b.laundry) {
      const rng = new Rng((Math.imul(l.lot + 3, 40503) ^ Math.floor((l.ax + l.az) * 100)) >>> 0 || 5);
      st.balcony++;
      laundryLine(cloth, rng, l.ax, l.ay, l.az, l.bx, l.by, l.bz, 0.015, false, st);
    }
  }
  if (lamps.length) {
    addLampLights(lamps);
    st.lights = lamps.length;
  }
  if (!Number.isFinite(st.lowest)) st.lowest = 0;
  return st;
}

/** point on facade f near (x, z) moved by `d` along the facade; null when it would leave the facade (margin m) */
function slideOnFacade(f: FacadeLike, x: number, z: number, d: number, m: number): [number, number] | null {
  const len = Math.hypot(f.bx - f.ax, f.bz - f.az);
  if (len < 1e-3) return null;
  const tx = (f.bx - f.ax) / len,
    tz = (f.bz - f.az) / len;
  const s = (x - f.ax) * tx + (z - f.az) * tz + d;
  if (s < m || s > len - m) return null;
  return [f.ax + tx * s, f.az + tz * s];
}

function streetLine(cloth: ClothSystem, rng: Rng, sp: SpanLike, ax: number, az: number, bx: number, bz: number, st: DecorStats, lamps: LampLight[], second: boolean): void {
  const ay = sp.ay,
    by = sp.by;
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  if (L < 4) return;
  const roll = rng.next();
  const style = sp.district === 'market' ? (roll < 0.45 ? 'festoon' : roll < 0.8 ? 'bunting' : 'prayer') : second ? (roll < 0.5 ? 'festoon' : 'bunting') : roll < 0.6 ? 'bunting' : roll < 0.8 ? 'prayer' : 'festoon';
  const sag = L * rng.range(0.03, 0.05) + 0.12;
  const seed = rng.next();
  const line = cloth.addLine({ ax, ay, az, bx, by, bz, sag, seed, wire: style === 'festoon' ? '#2a2826' : '#4a4640', r: style === 'festoon' ? 0.008 : 0.006 });
  const lowest = Math.min(ay, by) - sag;
  if (style === 'festoon') {
    st.festoon++;
    const warm = rng.chance(0.65);
    const pitch = rng.range(0.5, 0.65);
    const n = Math.max(2, Math.floor((L - 0.6) / pitch));
    for (let i = 0; i < n; i++) {
      const s = (0.3 + (i + 0.5) * ((L - 0.6) / n)) / L;
      cloth.addBulb(line, s, warm ? rng.pick(BULB_WARM) : BULB_FEST[i % BULB_FEST.length], rng.range(0.06, 0.09), 0.032);
    }
    st.lowest = Math.min(st.lowest, lowest - 0.12);
    // their warm light on the street below (night lamp-light map)
    const nl = Math.max(2, Math.round(L / 4.5));
    for (let k = 0; k < nl; k++) {
      const s = (k + 0.5) / nl;
      const bow = 4 * s * (1 - s);
      lamps.push({ x: ax + (bx - ax) * s, y: ay + (by - ay) * s - sag * bow - 0.1, z: az + (bz - az) * s, radius: 3.6, color: warm ? '#ffcf8f' : '#ffc6a0', intensity: 0.2, kind: 'plaza' });
    }
    return;
  }
  const prayer = style === 'prayer';
  if (prayer) st.prayer++;
  else st.bunting++;
  const set = prayer ? PRAYER : rng.pick(PENNANT_SETS);
  const sz = rng.range(0.9, 1.25);
  const w = (prayer ? 0.34 : 0.3) * sz,
    len = (prayer ? 0.4 : 0.42) * sz;
  const gap = prayer ? rng.range(0.03, 0.06) : rng.range(0.06, 0.14);
  const pitch = w + gap;
  const n = Math.max(2, Math.floor((L - 0.5) / pitch));
  const off = rng.int(0, set.length - 1);
  const pat = prayer ? PAT.PRAYER : rng.chance(0.25) ? PAT.BORDER : PAT.PLAIN;
  for (let i = 0; i < n; i++) {
    const s = (0.25 + (i + 0.5) * ((L - 0.5) / n)) / L;
    const c = set[(i + off) % set.length];
    cloth.addPiece(line, s, {
      w,
      len: len * rng.range(0.96, 1.04),
      shape: prayer ? SHAPE.RECT : SHAPE.PENNANT,
      col: c,
      col2: pat === PAT.BORDER ? '#f4efe4' : c,
      pattern: pat,
      weight: prayer ? 1.1 : 0.9,
      flutter: prayer ? 1.1 : 1.0,
      phase: rng.range(0, 6.283),
    });
  }
  st.lowest = Math.min(st.lowest, lowest - len);
}

function laundryLine(cloth: ClothSystem, rng: Rng, ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, wire: boolean, st: DecorStats): void {
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  if (L < 0.8) return;
  const line = cloth.addLine({ ax, ay, az, bx, by, bz, sag, seed: rng.next(), wire: '#d8d6d0', r: 0.004 });
  if (!wire) cloth.noWire(line);
  st.laundryLines++;
  let x = rng.range(0.15, 0.5);
  const end = L - 0.15;
  let guard = 0;
  while (x < end && guard++ < 60) {
    if (rng.chance(0.12) && L > 3) {
      x += rng.range(0.5, 1.4);
      continue;
    }
    const kind = rng.weighted(['shirt', 'tee', 'trousers', 'sheet', 'towel', 'small'] as const, [3, 3, 2, L > 4 ? 1.4 : 0.3, 2.2, 2.6]);
    let w = 0.5,
      len = 0.6,
      shape: number = SHAPE.RECT,
      weight = 1.3,
      pat: number = PAT.PLAIN;
    let col = rng.pick(LAUNDRY_COLS);
    let col2 = col;
    switch (kind) {
      case 'shirt':
        w = rng.range(0.5, 0.62);
        len = rng.range(0.6, 0.72);
        shape = SHAPE.SHIRT;
        if (rng.chance(0.25)) {
          pat = PAT.STRIPES;
          col2 = '#f4efe4';
        }
        break;
      case 'tee':
        w = rng.range(0.44, 0.52);
        len = rng.range(0.5, 0.6);
        shape = SHAPE.SHIRT;
        break;
      case 'trousers':
        w = rng.range(0.38, 0.44);
        len = rng.range(0.85, 1.0);
        shape = SHAPE.TROUSERS;
        weight = 1.7;
        col = rng.pick(['#4a6a90', '#3d5578', '#2f3a52', '#8a7a62', '#5a5a58', '#c8b896']);
        break;
      case 'sheet':
        w = Math.min(end - x, rng.range(1.2, 1.7));
        len = rng.range(1.0, 1.35);
        shape = SHAPE.SHEET;
        weight = 2.4;
        col = rng.pick(['#f4f1ea', '#eeeae0', '#dfe8ee', '#f0e4e4', '#e6eedd']);
        if (rng.chance(0.3)) {
          pat = PAT.BORDER;
          col2 = rng.pick(['#a8c4dc', '#e8a8b0', '#c8d8a8']);
        }
        break;
      case 'towel':
        w = rng.range(0.45, 0.6);
        len = rng.range(0.75, 0.95);
        shape = SHAPE.SHEET;
        weight = 1.8;
        pat = rng.chance(0.6) ? PAT.MIDBAND : PAT.PLAIN;
        col2 = rng.pick(['#f4efe4', '#2f6db5', '#c8402e']);
        break;
      default:
        w = rng.range(0.16, 0.24);
        len = rng.range(0.2, 0.3);
        weight = 1.0;
        col = rng.pick(['#f4efe4', '#2f3a52', '#e8a8b0', '#a8c4dc', '#5a5a58']);
    }
    if (x + w > end) break;
    const s = (x + w / 2) / L;
    cloth.addPiece(line, s, { w, len, shape, col, col2, pattern: pat, weight, flutter: 0.85, phase: rng.range(0, 6.283) });
    st.laundryItems++;
    x += w + rng.range(0.04, 0.22);
  }
}
