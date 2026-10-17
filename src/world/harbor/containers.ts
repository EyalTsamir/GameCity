// Shipping containers: corrugated boxes with corner posts, top rails and door lock bars,
// painted from the palette accents + rust tones, some with a contrasting band (no brands).
// Yard layout: neat rows with aisles inside a rect, stacks up to maxHeight, optional
// reserved spots (crane drop zones) left free.

import * as THREE from 'three';
import { PALETTE } from '../../core/gfx';
import type { Rect } from '../../core/geom';
import type { Rng } from '../../core/rng';
import { HB, PAT } from './geo';

export const CW = 2.44;
export const CH = 2.59;
export const L20 = 6.06;
export const L40 = 12.19;

const BODY = [...PALETTE.accents.filter((c) => c !== '#f1faee'), '#a0553d', '#8f4a36', '#b06a4c', '#7d4a3a', '#5f7f8c', '#6d8f5a', '#c4cdd3', '#d8d2c4'];
const BODY_W = [1.1, 1.0, 1.1, 0.9, 1.2, 0.7, 0.6, 1.0, 0.9, 0.8, 0.6, 0.7, 0.6, 0.45, 0.4];
const STRIPES = ['#f1faee', '#e9c46a', '#264653', '#f4a261'];

export interface ContainerLook {
  body: THREE.Color;
  stripe: THREE.Color | null;
}

export function pickLook(rng: Rng): ContainerLook {
  const body = new THREE.Color(rng.weighted(BODY, BODY_W));
  // slight fading / dirt variation
  const hsl = { h: 0, s: 0, l: 0 };
  body.getHSL(hsl);
  body.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * (0.82 + rng.next() * 0.22), 0, 1), THREE.MathUtils.clamp(hsl.l * (0.9 + rng.next() * 0.16), 0, 1));
  let stripe: THREE.Color | null = null;
  if (rng.chance(0.22)) {
    let s = rng.pick(STRIPES);
    if (new THREE.Color(s).getHexString() === body.getHexString()) s = '#f1faee';
    stripe = new THREE.Color(s);
  }
  return { body, stripe };
}

/**
 * One container in the builder's CURRENT frame: bottom centre at (x, y, z), length along local
 * z (yaw rotates it), doors at +z.
 */
export function addContainer(b: HB, x: number, y: number, z: number, len: number, look: ContainerLook, yaw = 0, roof = true): void {
  b.pushT(x, y, z, yaw);
  const hw = CW / 2,
    hl = len / 2;
  const ix = hw - 0.035,
    iz = hl - 0.05;
  const col = look.body;
  b.noEmit();
  // long sides (bands so a stripe never z-fights)
  b.pat(PAT.CORRUGATED, 0.3);
  const bands: [number, number, THREE.Color][] = look.stripe
    ? [
        [0.1, 1.62, col],
        [1.62, 2.02, look.stripe],
        [2.02, CH - 0.08, col],
      ]
    : [[0.1, CH - 0.08, col]];
  for (const [y0, y1, c] of bands) {
    b.colorObj(c);
    b.quad([ix, y0, -iz], [ix, y1, -iz], [ix, y1, iz], [ix, y0, iz]);
    b.quad([-ix, y0, iz], [-ix, y1, iz], [-ix, y1, -iz], [-ix, y0, -iz]);
  }
  // ends: front wall (−z) corrugated, door end (+z) plain with bars
  b.colorObj(col);
  b.quad([-ix, 0.1, -iz], [-ix, CH - 0.08, -iz], [ix, CH - 0.08, -iz], [ix, 0.1, -iz]);
  b.pat(PAT.NONE);
  _d.copy(col).multiplyScalar(0.92);
  b.colorObj(_d);
  b.quad([-ix, 0.1, iz], [ix, 0.1, iz], [ix, CH - 0.08, iz], [-ix, CH - 0.08, iz]);
  if (roof) {
    _d.copy(col).multiplyScalar(0.86);
    b.colorObj(_d);
    b.quad([-ix, CH - 0.05, -iz], [-ix, CH - 0.05, iz], [ix, CH - 0.05, iz], [ix, CH - 0.05, -iz]);
  }
  // frame: corner posts + top side rails (darker)
  _d.copy(col).multiplyScalar(0.62);
  b.colorObj(_d);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.box(sx * (hw - 0.07), CH / 2, sz * (hl - 0.07), 0.15, CH, 0.15, 0, roof ? 1 : 3);
  for (const sx of [-1, 1]) b.box(sx * (hw - 0.05), CH - 0.07, 0, 0.11, 0.14, len - 0.28, 0, 1 | 4 | 8);
  b.box(0, CH - 0.07, -(hl - 0.05), CW - 0.28, 0.14, 0.11, 0, 1 | 16 | 32);
  b.box(0, CH - 0.07, hl - 0.05, CW - 0.28, 0.14, 0.11, 0, 1 | 16 | 32);
  // bottom rail (seen from the side)
  for (const sx of [-1, 1]) b.box(sx * (hw - 0.05), 0.07, 0, 0.11, 0.14, len - 0.28, 0, 1 | 2 | 4 | 8);
  // door lock bars
  _d.copy(col).multiplyScalar(0.7);
  b.colorObj(_d);
  for (const bx of [-0.92, -0.32, 0.32, 0.92]) b.box(bx, CH / 2, iz + 0.025, 0.05, CH - 0.45, 0.05, 0, 1 | 2 | 4);
  b.pop();
}
const _d = new THREE.Color();

export interface YardOptions {
  /** containers' length axis */
  axis: 'x' | 'z';
  maxHeight: number;
  /** spots to keep free (container footprints, world coords) */
  reserved?: Rect[];
  /** ground height under a point */
  ground?: (x: number, z: number) => number;
  /** probability of 20ft containers */
  p20?: number;
  /** containers per block between aisles (along the length axis) */
  blockLen?: number;
  aisle?: number;
  rowsPerBlock?: number;
}

/** Row centre lines (across the length axis) used by fillYard for this rect. */
export function yardRows(r: Rect, axis: 'x' | 'z', rowsPerBlock?: number): number[] {
  const along = axis === 'x';
  const C0 = along ? r.z0 : r.x0,
    C1 = along ? r.z1 : r.x1;
  const pitch = CW + 0.28;
  const rowsTotal = Math.floor((C1 - C0 + 0.28) / pitch);
  const perBlock = rowsPerBlock ?? rowsTotal;
  const aisleC = 3.2;
  const rows: number[] = [];
  let c = C0 + CW / 2;
  let inBlock = 0;
  while (c + CW / 2 <= C1 + 1e-6) {
    rows.push(c);
    inBlock++;
    if (inBlock >= perBlock) {
      c += pitch - 0.28 + aisleC;
      inBlock = 0;
    } else c += pitch;
  }
  // centre the rows in the rect
  const used = rows.length ? rows[rows.length - 1] + CW / 2 - (rows[0] - CW / 2) : 0;
  const shift = (C1 - C0 - used) / 2;
  for (let i = 0; i < rows.length; i++) rows[i] += shift;
  return rows;
}

/** Fill a rect with rows of container stacks. Returns the number of containers placed. */
export function fillYard(b: HB, r: Rect, rng: Rng, o: YardOptions): number {
  const along = o.axis === 'x';
  const A0 = along ? r.x0 : r.z0,
    A1 = along ? r.x1 : r.z1;
  const C0 = along ? r.z0 : r.x0,
    C1 = along ? r.z1 : r.x1;
  const rows = yardRows(r, o.axis, o.rowsPerBlock);
  const blockLen = o.blockLen ?? 3;
  const aisle = o.aisle ?? 3.5;
  let placed = 0;
  const reserved = o.reserved ?? [];
  const hitsReserved = (ax0: number, ax1: number, cc: number) => {
    for (const q of reserved) {
      const x0 = along ? ax0 : cc - CW / 2,
        x1 = along ? ax1 : cc + CW / 2;
      const z0 = along ? cc - CW / 2 : ax0,
        z1 = along ? cc + CW / 2 : ax1;
      if (x1 > q.x0 - 0.3 && x0 < q.x1 + 0.3 && z1 > q.z0 - 0.3 && z0 < q.z1 + 0.3) return true;
    }
    return false;
  };
  let cc_ = 0;
  function placeStack(a: number, len: number): void {
    if (hitsReserved(a, a + len, cc_)) return;
    const cx = along ? a + len / 2 : cc_,
      cz = along ? cc_ : a + len / 2;
    if (rng.chance(0.08)) return; // an empty slot here and there
    const h = Math.max(1, Math.min(o.maxHeight, Math.round(o.maxHeight * (0.45 + rng.next() * 0.75))));
    const g = o.ground ? o.ground(cx, cz) : 0;
    const yaw = along ? Math.PI / 2 : 0;
    for (let t = 0; t < h; t++) {
      const look = pickLook(rng);
      // a little misalignment makes stacks look handled, not cloned
      const jx = (rng.next() - 0.5) * 0.08,
        jz = (rng.next() - 0.5) * 0.12;
      addContainer(b, cx + jx, g + t * CH, cz + jz, len, look, yaw + (rng.next() - 0.5) * 0.008, t === h - 1);
      placed++;
    }
  }
  for (const cc of rows) {
    cc_ = cc;
    let a = A0 + 0.3;
    let n = 0;
    while (a < A1) {
      const is20 = rng.chance(o.p20 ?? 0.3);
      const len = is20 ? L20 : L40;
      if (a + len > A1 - 0.2) {
        if (a + L20 <= A1 - 0.2) placeStack(a, L20);
        break;
      }
      placeStack(a, len);
      a += len + 0.3;
      n++;
      if (n % blockLen === 0) a += aisle;
    }
  }
  return placed;
}
