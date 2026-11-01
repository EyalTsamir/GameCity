// What grows and lies at ankle height, within the bubble: flowers as real small plants (stem, leaves, a head with petals),
// fallen leaves that curl, weeds as rosettes and moss cushions in the joints. Where they stand comes from the cover maps
// (inside the town) or the landscape's cover (beyond it), so every lawn, verge and meadow gets them. The blade field's own
// flower heads and leaf polygons stop where these start (groundcover/field.ts).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { nearGrow, nearOf, nearRandom, type NearCell, type NearEmit } from '../../core/nearDetail';
import { closeNature } from '../../core/closenature';
import { WIND_GLSL } from '../../core/wind';
import { patchLampMaterial } from '../lamps/integrate';

export const FLOWER_RADIUS = 18;
const FLOWER_CELL = 6;
const LEAF_RADIUS = 13;
const LEAF_CELL = 4;
const WEED_RADIUS = 13;
const WEED_CELL = 4;

/** the shape of a small plant, in metres, Y up */
class Shape {
  readonly P: number[] = [];
  readonly N: number[] = [];
  readonly C: number[] = [];
  /** petal: 0 = this colour stands, 1 = the instance's colour */
  readonly A: number[] = [];
  readonly L: number[] = [];
  readonly I: number[] = [];
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: readonly number[], petal = 0, shade = 1, u = 0, w = 0): number {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.P.push(x, y, z);
    this.N.push(nx / l, ny / l, nz / l);
    this.C.push(c[0] * shade, c[1] * shade, c[2] * shade);
    this.A.push(petal, shade);
    this.L.push(u, w);
    return this.P.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.I.push(a, b, c);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('aC', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(this.A, 2));
    g.setAttribute('aL', new THREE.Float32BufferAttribute(this.L, 2));
    g.setIndex(this.I);
    return g;
  }
}

type RGB = readonly [number, number, number];
const lin = (hex: string): RGB => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const STEM = lin('#5d7f35');
const STEM_DRY = lin('#7a7f3e');
const LEAF = lin('#4f7a30');
const LEAF_DK = lin('#3a6028');

/** a three-sided stem from the ground to (hx, hy, hz), with a slight bow; returns nothing, ends under the head */
function stem(s: Shape, hx: number, hy: number, hz: number, r: number, c: RGB, levels = 3): void {
  const base = s.P.length / 3;
  for (let k = 0; k <= levels; k++) {
    const f = k / levels;
    const bow = f * f;
    const x = hx * bow,
      z = hz * bow,
      y = hy * f;
    const rr = r * (1 - 0.35 * f);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.283;
      s.v(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, Math.cos(a), 0.2, Math.sin(a), c, 0, 0.72 + 0.3 * f);
    }
  }
  for (let k = 0; k < levels; k++) {
    for (let i = 0; i < 3; i++) {
      const a = base + k * 3 + i,
        b = base + k * 3 + (i + 1) % 3,
        d = a + 3,
        e = b + 3;
      s.tri(a, d, b);
      s.tri(b, d, e);
    }
  }
}

/** a lance leaf from (x, y, z) out along `az`, arching over, folded along the rib */
function leaf(s: Shape, x: number, y: number, z: number, az: number, len: number, w: number, rise: number, c: RGB, segs = 3, serr = 0): void {
  const ca = Math.cos(az),
    sa = Math.sin(az);
  const base = s.P.length / 3;
  const rows = segs + 1;
  for (let k = 0; k < rows; k++) {
    const f = k / segs;
    const out = len * f;
    const up = rise * Math.sin(f * 2.4) * len - len * 0.18 * f * f;
    const px = x + ca * out,
      py = y + up,
      pz = z + sa * out;
    let hw = w * Math.sin(Math.min(1, f * 1.08) * 3.14) ** 0.8;
    if (serr > 0 && k % 2 === 1) hw *= 1 - serr;
    const nx = -ca * 0.25,
      nz = -sa * 0.25;
    s.v(px, py - hw * 0.14, pz, nx, 1, nz, c, 0, 0.82, 0, f);
    s.v(px - sa * hw, py + hw * 0.16, pz + ca * hw, nx - sa * 0.35, 1, nz + ca * 0.35, c, 0, 1.05, 1, f);
    s.v(px + sa * hw, py + hw * 0.16, pz - ca * hw, nx + sa * 0.35, 1, nz - ca * 0.35, c, 0, 1.05, 1, f);
  }
  for (let k = 0; k < segs; k++) {
    const a = base + k * 3,
      b = a + 3;
    s.tri(a, b, a + 1);
    s.tri(a + 1, b, b + 1);
    s.tri(a + 2, b + 2, a);
    s.tri(a, b + 2, b);
  }
}

/** a feathery leaf: a rib with pairs of small leaflets, thinning to the tip */
function frond(s: Shape, x: number, y: number, z: number, az: number, len: number, rise: number, c: RGB): void {
  const ca = Math.cos(az),
    sa = Math.sin(az);
  const P = 5;
  const at = (f: number): [number, number, number] => [x + ca * len * f, y + (rise * Math.sin(f * 2.4) - 0.2 * f * f) * len, z + sa * len * f];
  const [a0x, a0y, a0z] = at(0);
  const [a1x, a1y, a1z] = at(1);
  const r0 = s.v(a0x - sa * 0.0012, a0y, a0z + ca * 0.0012, 0, 1, 0, c, 0, 0.8),
    r1 = s.v(a0x + sa * 0.0012, a0y, a0z - ca * 0.0012, 0, 1, 0, c, 0, 0.8),
    r2 = s.v(a1x, a1y, a1z, 0, 1, 0, c, 0, 1);
  s.tri(r0, r2, r1);
  for (let k = 0; k < P; k++) {
    const f = 0.2 + (k / P) * 0.75;
    const [px, py, pz] = at(f);
    const ll = len * (0.34 - 0.27 * (k / P)),
      w = ll * 0.2;
    for (const sd of [-1, 1]) {
      const b = az + sd * 1.05;
      const cb = Math.cos(b),
        sb = Math.sin(b);
      const mx = px + cb * ll * 0.45,
        my = py + ll * 0.05,
        mz = pz + sb * ll * 0.45;
      const v0 = s.v(px, py, pz, 0, 1, 0, c, 0, 0.72);
      const v1 = s.v(mx - sb * w, my, mz + cb * w, -sb * 0.4, 1, cb * 0.4, c, 0, 1);
      const v2 = s.v(mx + sb * w, my, mz - cb * w, sb * 0.4, 1, -cb * 0.4, c, 0, 1);
      const v3 = s.v(px + cb * ll, py - ll * 0.08, pz + sb * ll, 0, 1, 0, c, 0, 1.08);
      s.tri(v0, v3, v1);
      s.tri(v0, v2, v3);
    }
  }
}

/** one feathery leaf arching out along +Z, unit length, taking the instance's colour */
export function frondShape(): THREE.BufferGeometry {
  const s = new Shape();
  frond(s, 0, 0, 0, Math.PI / 2, 1, 0.75, LEAF);
  for (let k = 0; k < s.A.length; k += 2) s.A[k] = 1;
  return s.geometry();
}

/** a cupped petal: fan of two rings across `span` radians, the rim higher than the heart and a little crumpled */
function cupPetal(s: Shape, cx: number, cy: number, cz: number, az: number, span: number, r: number, cup: number, eye: RGB, seed: number): void {
  const N = 4;
  const c = s.v(cx, cy, cz, 0, 1, 0, eye, 0, 1);
  const r1: number[] = [],
    r2: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = az + (i / N - 0.5) * span;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const wob = 1 + 0.09 * Math.sin(seed + i * 2.7);
    const rr1 = r * 0.5,
      rr2 = r * wob * (0.9 + 0.1 * Math.cos((i / N - 0.5) * 3.14));
    const y1 = cup * r * 0.3,
      y2 = cup * r * (0.95 + 0.14 * Math.sin(seed * 2 + i * 4.1));
    // the inside of a bowl faces in and up
    const nx = -ca * cup * 0.9,
      nz = -sa * cup * 0.9;
    r1.push(s.v(cx + ca * rr1, cy + y1, cz + sa * rr1, nx * 0.7, 1, nz * 0.7, eye, 0.82, 0.72));
    r2.push(s.v(cx + ca * rr2, cy + y2, cz + sa * rr2, nx, 0.8, nz, eye, 1, 1 + 0.08 * Math.sin(seed + i)));
  }
  for (let i = 0; i < N; i++) {
    s.tri(c, r1[i + 1], r1[i]);
    s.tri(r1[i], r1[i + 1], r2[i]);
    s.tri(r2[i], r1[i + 1], r2[i + 1]);
  }
}

/** a ring of rays round a disc; `droop` lets the tips fall, `flare` widens them to the end */
function rays(s: Shape, cx: number, cy: number, cz: number, n: number, r0: number, r1: number, w: number, lift: number, droop: number, flare: number, teeth: boolean, phase = 0): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * 6.283 + 0.14 * Math.sin(i * 7.1);
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const len = r1 * (0.9 + 0.2 * Math.abs(Math.sin(i * 3.3)));
    const px = -sa,
      pz = ca;
    const m = 0.55;
    const hw0 = w * 0.55,
      hw1 = w * flare;
    const ax = cx + ca * r0,
      az = cz + sa * r0,
      ay = cy;
    const bx = cx + ca * (r0 + (len - r0) * m),
      bz = cz + sa * (r0 + (len - r0) * m),
      by = cy + lift * len * m;
    const ex = cx + ca * len,
      ez = cz + sa * len,
      ey = cy + lift * len - droop * len;
    const nx = -ca * lift,
      nz = -sa * lift;
    const A = s.v(ax, ay, az, nx, 1, nz, STEM, 0.92, 0.82);
    const B = s.v(bx - px * hw0, by, bz - pz * hw0, nx - px * 0.3, 1, nz - pz * 0.3, STEM, 1, 1);
    const C = s.v(bx + px * hw0, by, bz + pz * hw0, nx + px * 0.3, 1, nz + pz * 0.3, STEM, 1, 1);
    const D = s.v(ex - px * hw1, ey, ez - pz * hw1, nx - px * 0.2, 1, nz - pz * 0.2, STEM, 1, 1.05);
    const E = s.v(ex + px * hw1, ey, ez + pz * hw1, nx + px * 0.2, 1, nz + pz * 0.2, STEM, 1, 1.05);
    s.tri(A, C, B);
    s.tri(B, C, D);
    s.tri(D, C, E);
    if (teeth) {
      const F = s.v(ex + ca * len * 0.16, ey + 0.002, ez + sa * len * 0.16, nx, 1, nz, STEM, 1, 1.1);
      s.tri(D, E, F);
    }
  }
}

/** a low dome */
function dome(s: Shape, cx: number, cy: number, cz: number, r: number, h: number, c: RGB, c2: RGB, n = 7): void {
  const top = s.v(cx, cy + h, cz, 0, 1, 0, c2, 0, 1);
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283;
    ring.push(s.v(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7, c, 0, 0.9));
  }
  for (let i = 0; i < n; i++) s.tri(top, ring[(i + 1) % n], ring[i]);
}

function poppyShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.47,
    hx = 0.03;
  stem(s, hx, hy, 0, 0.0018, STEM);
  const eye = lin('#17101a');
  const r = 0.046;
  for (let i = 0; i < 4; i++) cupPetal(s, hx, hy, 0, (i / 4) * 6.283 + 0.3, 2.1, r * (i % 2 ? 1 : 0.92), 0.58, eye, i * 1.9 + 0.7);
  dome(s, hx, hy + 0.002, 0, 0.0085, 0.013, lin('#4f6a2b'), lin('#1f2214'));
  leaf(s, 0.002, 0.1, 0, 1.2, 0.13, 0.016, 0.7, LEAF, 3, 0.6);
  leaf(s, 0.002, 0.17, 0, 4.1, 0.11, 0.014, 0.8, LEAF, 3, 0.6);
  return s.geometry();
}

function buttercupShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.34,
    hx = -0.02;
  stem(s, hx, hy, 0, 0.0012, STEM);
  const eye = lin('#a8a12a');
  for (let i = 0; i < 5; i++) cupPetal(s, hx, hy, 0, (i / 5) * 6.283, 1.45, 0.016, 0.34, eye, i * 2.3);
  dome(s, hx, hy + 0.001, 0, 0.0045, 0.004, lin('#b7a827'), lin('#8e8a23'), 5);
  leaf(s, 0.001, 0.14, 0, 0.5, 0.07, 0.013, 0.6, LEAF, 2, 0.5);
  leaf(s, 0.0, 0.03, 0, 3.4, 0.08, 0.016, 0.9, LEAF, 2, 0.5);
  return s.geometry();
}

function daisyShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.38,
    hx = 0.025;
  stem(s, hx, hy, 0, 0.0014, STEM);
  rays(s, hx, hy, 0, 17, 0.007, 0.028, 0.0034, 0.1, 0.1, 0.72, false);
  dome(s, hx, hy, 0, 0.0088, 0.0045, lin('#d39a12'), lin('#efc22a'), 8);
  leaf(s, 0.001, 0.12, 0, 0.8, 0.07, 0.008, 0.6, LEAF, 2, 0.55);
  leaf(s, 0.001, 0.2, 0, 3.7, 0.06, 0.007, 0.6, LEAF, 2, 0.55);
  return s.geometry();
}

function cornflowerShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.44,
    hx = 0.02;
  stem(s, hx, hy, 0, 0.0012, STEM_DRY);
  dome(s, hx, hy - 0.016, 0, 0.0055, 0.016, lin('#596a33'), lin('#3a4a26'), 6);
  rays(s, hx, hy, 0, 9, 0.003, 0.021, 0.003, 0.5, 0, 1.5, true);
  dome(s, hx, hy, 0, 0.006, 0.006, lin('#3a1f58'), lin('#3f2563'), 6);
  leaf(s, 0.001, 0.12, 0, 1, 0.09, 0.0035, 0.4, STEM_DRY, 2);
  leaf(s, 0.001, 0.22, 0, 4, 0.08, 0.003, 0.4, STEM_DRY, 2);
  return s.geometry();
}

function knapweedShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.5,
    hx = -0.02;
  stem(s, hx, hy, 0, 0.0016, STEM_DRY);
  dome(s, hx, hy - 0.016, 0, 0.0085, 0.018, lin('#4a3a22'), lin('#2f2a1a'), 7);
  rays(s, hx, hy, 0, 15, 0.002, 0.02, 0.0013, 0.82, 0, 1, false);
  rays(s, hx, hy + 0.002, 0, 9, 0.001, 0.017, 0.0012, 1.1, 0, 1, false, 0.4);
  leaf(s, 0.001, 0.13, 0, 2, 0.1, 0.008, 0.5, LEAF_DK, 2, 0.4);
  leaf(s, 0.001, 0.28, 0, 5, 0.08, 0.006, 0.5, LEAF_DK, 2, 0.4);
  return s.geometry();
}

function cowParsleyShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.72;
  stem(s, 0.03, hy, 0, 0.0028, STEM);
  // rays out of the top, each with a flat little umbel
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + 0.3 * Math.sin(i * 5.1);
    const inner = i % 3 === 0;
    const rr = inner ? 0.028 : 0.058 + 0.012 * Math.sin(i * 2.2);
    const up = inner ? 0.055 : 0.04;
    const x = 0.03 + Math.cos(a) * rr,
      z = Math.sin(a) * rr,
      y = hy + up;
    const px = -Math.sin(a) * 0.0009,
      pz = Math.cos(a) * 0.0009;
    const p0 = s.v(0.03 - px, hy, -pz, 0.3, 1, 0, STEM, 0, 0.9),
      p1 = s.v(0.03 + px, hy, pz, 0.3, 1, 0, STEM, 0, 0.9),
      p2 = s.v(x, y, z, 0.3, 1, 0, STEM, 0, 1);
    s.tri(p0, p2, p1);
    const K = 6;
    const R = inner ? 0.011 : 0.014;
    const centre = s.v(x, y + 0.001, z, 0, 1, 0, STEM, 0.75, 0.9);
    const rim: number[] = [];
    for (let k = 0; k < K; k++) {
      const b = (k / K) * 6.283 + i;
      const w = R * (k % 2 ? 1 : 0.72);
      rim.push(s.v(x + Math.cos(b) * w, y - 0.0015 + 0.002 * Math.sin(b * 3), z + Math.sin(b) * w, Math.cos(b) * 0.25, 1, Math.sin(b) * 0.25, STEM, 1, 1));
    }
    for (let k = 0; k < K; k++) s.tri(centre, rim[(k + 1) % K], rim[k]);
  }
  // big ferny leaves low down
  frond(s, 0.002, 0.16, 0, 0.8, 0.22, 0.5, LEAF_DK);
  frond(s, 0.002, 0.08, 0, 3.6, 0.25, 0.42, LEAF);
  return s.geometry();
}

function lawnDaisyShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.055;
  stem(s, 0.004, hy, 0, 0.0008, STEM, 2);
  rays(s, 0.004, hy, 0, 13, 0.0035, 0.0125, 0.0015, 0.1, 0.05, 0.8, false);
  dome(s, 0.004, hy, 0, 0.0038, 0.002, lin('#d39a12'), lin('#e8ba22'), 6);
  for (let i = 0; i < 5; i++) leaf(s, 0, 0.004, 0, i * 1.26, 0.032, 0.007, 0.25, LEAF, 2);
  return s.geometry();
}

function dandelionShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.11;
  stem(s, 0.008, hy, 0, 0.0015, lin('#7f9a55'), 2);
  rays(s, 0.008, hy, 0, 20, 0.003, 0.021, 0.0016, 0.28, 0.02, 1, false);
  rays(s, 0.008, hy + 0.002, 0, 11, 0.001, 0.012, 0.0015, 0.75, 0, 1, false, 0.3);
  // the toothed rosette flat on the ground
  for (let i = 0; i < 8; i++) leaf(s, 0, 0.004, 0, i * 0.785 + 0.2 * Math.sin(i * 3.3), 0.075 + 0.03 * Math.sin(i * 2.1), 0.012, 0.16, i % 2 ? LEAF : LEAF_DK, 4, 0.6);
  return s.geometry();
}

function cloverShape(): THREE.BufferGeometry {
  const s = new Shape();
  const hy = 0.075;
  stem(s, 0.004, hy, 0, 0.0008, STEM, 2);
  rays(s, 0.004, hy - 0.002, 0, 12, 0.001, 0.0095, 0.0016, 0.75, 0.05, 0.9, false);
  rays(s, 0.004, hy, 0, 7, 0.001, 0.008, 0.0016, 1.5, 0, 0.8, false, 0.3);
  // three round leaflets, twice
  for (let t = 0; t < 2; t++) {
    const lx = (t ? 1 : -1) * 0.016,
      ly = 0.035 - t * 0.012;
    for (let i = 0; i < 3; i++) leaf(s, lx, ly, 0.004 * t, i * 2.09 + t, 0.015, 0.0065, 0.1, LEAF, 2);
  }
  return s.geometry();
}

/** one fallen leaf, length 1 along Z, lying on Y = 0, the rim curling up; `lobed`: a maple's points */
function fallenLeaf(lobed: boolean): THREE.BufferGeometry {
  const s = new Shape();
  const hw = lobed ? [0, 0.32, 0.14, 0.44, 0.2, 0.3, 0.09, 0] : [0, 0.16, 0.27, 0.3, 0.27, 0.19, 0.09, 0];
  const n = hw.length;
  const C: RGB = [1, 1, 1];
  const mid: number[] = [],
    lf: number[] = [],
    rt: number[] = [];
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const z = f - 0.5;
    const lift = 0.09 * (2 * f - 1) ** 2 + 0.02 * Math.sin(f * 9);
    const w = hw[k];
    mid.push(s.v(0, lift, z, 0, 1, (lift > 0.04 ? -0.3 : 0.1) * (f - 0.5), C, 1, 1, 0, f));
    lf.push(s.v(-w, lift + w * 0.32 + 0.012 * Math.sin(k * 2.1), z + w * 0.18, 0.34, 1, -0.1, C, 1, 1, -1, f));
    rt.push(s.v(w, lift + w * 0.26 + 0.012 * Math.sin(k * 3.7), z + w * 0.18, -0.34, 1, -0.1, C, 1, 1, 1, f));
  }
  for (let k = 0; k < n - 1; k++) {
    s.tri(mid[k], lf[k], mid[k + 1]);
    s.tri(lf[k], lf[k + 1], mid[k + 1]);
    s.tri(mid[k], mid[k + 1], rt[k]);
    s.tri(rt[k], mid[k + 1], rt[k + 1]);
  }
  return s.geometry();
}

/** a cushion of moss: a lumpy low dome, unit radius */
function mossCushion(): THREE.BufferGeometry {
  const s = new Shape();
  const C: RGB = [1, 1, 1];
  const R = 7;
  const top = s.v(0, 0.55, 0, 0, 1, 0, C, 1, 1.1);
  const r1: number[] = [],
    r2: number[] = [];
  for (let i = 0; i < R; i++) {
    const a = (i / R) * 6.283;
    const w = 1 + 0.26 * Math.sin(i * 2.6 + 1);
    r1.push(s.v(Math.cos(a) * 0.55 * w, 0.42 + 0.08 * Math.sin(i * 3.1), Math.sin(a) * 0.55 * w, Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5, C, 1, 1));
    r2.push(s.v(Math.cos(a) * w, -0.05, Math.sin(a) * w, Math.cos(a), 0.45, Math.sin(a), C, 1, 0.62));
  }
  for (let i = 0; i < R; i++) {
    const j = (i + 1) % R;
    s.tri(top, r1[j], r1[i]);
    s.tri(r1[i], r1[j], r2[i]);
    s.tri(r2[i], r1[j], r2[j]);
  }
  return s.geometry();
}

const PLANT_VERT = /* glsl */ `
attribute vec3 aC;
attribute vec2 aA;
attribute vec2 aL;
uniform float uTime;
uniform vec2 uWind;
varying vec3 vFl;
varying vec2 vLf;
varying float vFs;
${WIND_GLSL}
`;
const PLANT_BEGIN = /* glsl */ `
#include <begin_vertex>
{
  vec3 ro = instanceMatrix[3].xyz;
  vec2 w = thWindAt(ro.xz);
  float hy = position.y;
  float ph = fract(ro.x * 3.17 + ro.z * 5.31) * 6.283;
  vec2 d = (w * 0.34 + vec2(sin(uTime * 2.3 + ph), cos(uTime * 1.9 + ph * 1.3)) * 0.045 * (0.3 + length(w))) * hy * hy * 2.4;
  // from the world into the instance's frame (uniform scale, so its transpose over the scale squared)
  float s2 = dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
  transformed += transpose(mat3(instanceMatrix)) * vec3(d.x, 0.0, d.y) / max(1e-6, s2);
  #ifdef USE_INSTANCING_COLOR
  vFl = mix(aC, instanceColor * aA.y, aA.x);
  #else
  vFl = aC;
  #endif
  vLf = aL;
  vFs = fract(ro.x * 7.13 + ro.z * 11.9);
}
`;
const PLANT_FRAG_PARS = /* glsl */ `
varying vec3 vFl;
varying vec2 vLf;
varying float vFs;
`;

/** what the plants and leaves share: a colour per vertex and instance, wind, lit like the blades */
export function plantMaterial(ctx: CityContext, name: string, radius: number, fragExtra = ''): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74, metalness: 0, side: THREE.DoubleSide });
  m.name = name;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: ctx.uniforms.uTime, uWind: ctx.uniforms.uWind });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${PLANT_VERT}`).replace('#include <begin_vertex>', PLANT_BEGIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${PLANT_FRAG_PARS}`).replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = vFl;\n${fragExtra}`).replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  m.customProgramCacheKey = () => `closenature-${name}-2`;
  patchLampMaterial(m);
  nearGrow(m, radius);
  return m;
}

const LEAF_FRAG = /* glsl */ `
{
  // a dry leaf: darker rib and veins, a paler rim going brown, a blotch
  float u = abs(vLf.x), v = vLf.y;
  float rib = 1.0 - smoothstep(0.0, 0.05, u);
  float vein = 1.0 - smoothstep(0.0, 0.12, abs(fract(v * 5.0 - u * 1.3 + vFs * 3.0) - 0.5));
  diffuseColor.rgb *= 1.0 - 0.34 * rib - 0.17 * vein * (1.0 - rib);
  float bl = sin(vLf.x * 7.0 + vFs * 31.0) * sin(v * 9.0 + vFs * 17.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.46, 0.38), smoothstep(0.35, 0.8, bl) * 0.75);
  diffuseColor.rgb *= 1.0 + 0.24 * smoothstep(0.5, 1.0, u);
}
`;

export interface CoverSample {
  /** blade density, blade length 0..1, habitat code, leaf litter 0..1 */
  d: number;
  len: number;
  hab: number;
  lit: number;
  /** meadow flowers 0..1, species band 0..5, lawn flowers 0..1 */
  fl: number;
  sp: number;
  lawn: number;
  /** a surface height is known */
  y: number;
}

export interface CoverReader {
  /** inside the town: true, and `out` holds what the cover maps say */
  sample(x: number, z: number, out: CoverSample): boolean;
}

/** small value noise in plain numbers */
function vnoise(x: number, z: number): number {
  const h = (i: number, j: number): number => {
    let t = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0;
    t = (t ^ (t >>> 13)) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x),
    j = Math.floor(z);
  const fx = x - i,
    fz = z - j;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = h(i, j),
    b = h(i + 1, j),
    c = h(i, j + 1),
    d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface LandCover {
  water: number;
  sand: number;
  rock: number;
  forest: number;
  field: number;
  meadow: number;
  wet: number;
}

export function addFlora(ctx: CityContext, reader: CoverReader | null): void {
  const near = nearOf(ctx);
  const land = ctx.services.landscape as { height(x: number, z: number): number; cover(x: number, z: number): LandCover } | undefined;
  const cs: CoverSample = { d: 0, len: 0, hab: 0, lit: 0, fl: 0, sp: 0, lawn: 0, y: 0 };

  /** the cover anywhere: the maps in town, a likeness from the landscape's cover beyond them. False: nothing grows here */
  const coverAt = (x: number, z: number): boolean => {
    if (reader?.sample(x, z, cs)) return true;
    if (!land) return false;
    const c = land.cover(x, z);
    if (c.water > 0.3 || c.sand > 0.5 || c.rock > 0.5) return false;
    cs.y = land.height(x, z);
    const mead = c.meadow * (1 - c.forest);
    cs.d = Math.min(1, mead + c.field * 0.4);
    cs.len = 0.6;
    cs.hab = 0;
    cs.lit = sstep(0.05, 0.4, c.forest) * 0.9;
    // the same kind of patches as the map in town: a field for each species, the strongest wins
    let best = 0,
      bv = 0;
    for (let s = 0; s < 6; s++) {
      const f = 0.03 + 0.008 * s;
      const v = vnoise(x * f + 11.3 * s, z * f - 7.1 * s) * (s === 2 ? 1.04 : 1);
      if (v > bv) {
        bv = v;
        best = s;
      }
    }
    cs.sp = best;
    cs.fl = sstep(0.5, 0.74, bv) * (mead > 0.2 ? mead : 0) + (c.field > 0.5 && best === 0 ? 0.04 : 0);
    cs.lawn = 0;
    return true;
  };

  // ── flowers: each kind its own instanced draw, empty ones not drawn at all
  if (closeNature(ctx, 'closeflowers')) {
    const material = plantMaterial(ctx, 'plant', FLOWER_RADIUS);
    const meadow = (name: string, sp: number, geometry: THREE.BufferGeometry, hex: string, sMin: number, sMax: number, capacity: number) => {
      const col = lin(hex);
      near.addScatter({
        name,
        radius: FLOWER_RADIUS,
        cell: FLOWER_CELL,
        top: 2,
        geometry,
        material,
        capacity,
        perCell: 240,
        colors: true,
        fill(c: NearCell, out: NearEmit) {
          const rnd = nearRandom(c.seed);
          const n = Math.round(FLOWER_CELL * FLOWER_CELL * 6);
          for (let k = 0; k < n; k++) {
            const x = c.x0 + rnd() * FLOWER_CELL,
              z = c.z0 + rnd() * FLOWER_CELL,
              pick = rnd(),
              other = rnd(),
              yaw = rnd() * 6.283,
              sz = rnd(),
              ta = rnd(),
              tb = rnd(),
              tone = rnd();
            if (!coverAt(x, z) || cs.fl <= 0.01) continue;
            // in clumps, one kind to a clump; the odd stranger among them
            const cl = vnoise(x * 0.85 + 3.1, z * 0.85 - 9.2);
            const kind = other < 0.12 ? Math.floor(vnoise(x * 0.6, z * 0.6) * 5.99) : cs.sp;
            if (kind !== sp) continue;
            if (pick > cs.fl * (cl > 0.6 ? 1.1 : 0.16)) continue;
            const s = sMin + (sMax - sMin) * sz * sz;
            const v = 0.84 + 0.3 * tone;
            out.put(x, cs.y - 0.005, z, yaw, s, s, s, (ta - 0.5) * 0.5, (tb - 0.5) * 0.5, col[0] * v, col[1] * v, col[2] * v);
          }
        },
      });
    };
    meadow('closepoppy', 0, poppyShape(), '#c8281a', 0.75, 1.2, 1200);
    meadow('closecornflower', 1, cornflowerShape(), '#3f66d8', 0.8, 1.2, 1200);
    meadow('closedaisy', 2, daisyShape(), '#f4f1e6', 0.75, 1.25, 1400);
    meadow('closebuttercup', 3, buttercupShape(), '#efc318', 0.8, 1.35, 1200);
    meadow('closeparsley', 4, cowParsleyShape(), '#eeeadb', 0.8, 1.25, 500);
    meadow('closeknapweed', 5, knapweedShape(), '#94559c', 0.8, 1.2, 1200);
    const lawn = (name: string, q0: number, q1: number, geometry: THREE.BufferGeometry, hex: string, capacity: number, sMin: number, sMax: number) => {
      const col = lin(hex);
      near.addScatter({
        name,
        radius: FLOWER_RADIUS,
        cell: FLOWER_CELL,
        top: 2,
        geometry,
        material,
        capacity,
        perCell: 200,
        colors: true,
        fill(c: NearCell, out: NearEmit) {
          const rnd = nearRandom(c.seed);
          const n = Math.round(FLOWER_CELL * FLOWER_CELL * 5);
          for (let k = 0; k < n; k++) {
            const x = c.x0 + rnd() * FLOWER_CELL,
              z = c.z0 + rnd() * FLOWER_CELL,
              pick = rnd(),
              yaw = rnd() * 6.283,
              sz = rnd(),
              ta = rnd(),
              tb = rnd(),
              tone = rnd();
            if (!coverAt(x, z) || cs.lawn <= 0.01) continue;
            const q = vnoise(x * 1.7, z * 1.7);
            if (q < q0 || q >= q1) continue;
            if (pick > cs.lawn * 0.7) continue;
            const s = sMin + (sMax - sMin) * sz;
            const v = 0.86 + 0.28 * tone;
            out.put(x, cs.y - 0.002, z, yaw, s, s, s, (ta - 0.5) * 0.3, (tb - 0.5) * 0.3, col[0] * v, col[1] * v, col[2] * v);
          }
        },
      });
    };
    lawn('closelawndaisy', 0, 0.46, lawnDaisyShape(), '#f5f2ea', 1500, 0.8, 1.25);
    lawn('closedandelion', 0.46, 0.6, dandelionShape(), '#efb519', 500, 0.8, 1.3);
    lawn('closeclover', 0.6, 1, cloverShape(), '#ecd8e2', 1000, 0.85, 1.3);
  }

  // ── fallen leaves
  if (closeNature(ctx, 'closeleaves')) {
    const material = plantMaterial(ctx, 'fallen', LEAF_RADIUS, LEAF_FRAG);
    material.roughness = 0.92;
    const LEAVES: RGB[] = ['#6e5430', '#7d6236', '#5f482b', '#86703e', '#6a5a31', '#8f6a33', '#a07c35', '#764526'].map(lin);
    const layer = (name: string, lobed: boolean, capacity: number, share: number) => {
      near.addScatter({
        name,
        radius: LEAF_RADIUS,
        cell: LEAF_CELL,
        top: 2,
        geometry: fallenLeaf(lobed),
        material,
        capacity,
        perCell: 360,
        colors: true,
        fill(c: NearCell, out: NearEmit) {
          const rnd = nearRandom(c.seed);
          const n = Math.round(LEAF_CELL * LEAF_CELL * 26 * share);
          for (let k = 0; k < n; k++) {
            const x = c.x0 + rnd() * LEAF_CELL,
              z = c.z0 + rnd() * LEAF_CELL,
              pick = rnd(),
              yaw = rnd() * 6.283,
              sz = rnd(),
              ta = rnd(),
              tb = rnd(),
              tone = rnd(),
              ci = rnd();
            if (!coverAt(x, z) || cs.lit <= 0.01) continue;
            // drifts: against what stops the wind, in hollows; bare between
            // (warped, or the noise's lattice lays the leaves out in rows)
            const wx = x + (vnoise(z * 1.1 + 5.3, x * 1.1) - 0.5) * 1.4,
              wz = z + (vnoise(x * 1.1 - 2.1, z * 1.1 + 9.7) - 0.5) * 1.4;
            const drift = sstep(0.34, 0.72, vnoise(wx * 0.62, wz * 0.62) * 0.65 + vnoise(wx * 2.3, wz * 2.3) * 0.35);
            if (pick > cs.lit * ((cs.lit > 0.6 ? 0.42 : 0.1) + 1.25 * drift)) continue;
            const col = LEAVES[Math.floor(ci * ci * LEAVES.length)];
            const v = 0.62 + 0.46 * tone;
            const s = 0.045 + 0.075 * sz;
            out.put(x, cs.y + 0.004 + 0.006 * drift * tone, z, yaw, s, s, s, (ta - 0.5) * 0.8, (tb - 0.5) * 0.8, col[0] * v, col[1] * v, col[2] * v);
          }
        },
      });
    };
    layer('closeleafoval', false, 3600, 0.7);
    layer('closeleaflobed', true, 1800, 0.3);
  }

  // ── what grows in joints: a few rosettes, cushions of moss
  if (closeNature(ctx, 'closeweeds') && reader) {
    const material = plantMaterial(ctx, 'weed', WEED_RADIUS);
    near.addScatter({
      name: 'closerosette',
      radius: WEED_RADIUS,
      cell: WEED_CELL,
      top: 2,
      geometry: dandelionLeafOnly(),
      material,
      capacity: 500,
      perCell: 40,
      colors: true,
      fill(c: NearCell, out: NearEmit) {
        const rnd = nearRandom(c.seed);
        const n = LEAF_CELL * LEAF_CELL * 3;
        for (let k = 0; k < n; k++) {
          const x = c.x0 + rnd() * WEED_CELL,
            z = c.z0 + rnd() * WEED_CELL,
            pick = rnd(),
            yaw = rnd() * 6.283,
            sz = rnd(),
            tone = rnd();
          if (!reader.sample(x, z, cs) || cs.hab !== 120 || pick > cs.d * 0.5) continue;
          const s = 0.5 + 0.8 * sz * sz;
          const v = 0.8 + 0.4 * tone;
          out.put(x, cs.y + 0.002, z, yaw, s, s, s, 0, 0, 0.11 * v, 0.2 * v, 0.05 * v);
        }
      },
    });
    near.addScatter({
      name: 'closemoss',
      radius: WEED_RADIUS,
      cell: WEED_CELL,
      top: 2,
      geometry: mossCushion(),
      material,
      capacity: 900,
      perCell: 70,
      colors: true,
      fill(c: NearCell, out: NearEmit) {
        const rnd = nearRandom(c.seed);
        const n = LEAF_CELL * LEAF_CELL * 8;
        for (let k = 0; k < n; k++) {
          const x = c.x0 + rnd() * WEED_CELL,
            z = c.z0 + rnd() * WEED_CELL,
            pick = rnd(),
            yaw = rnd() * 6.283,
            sz = rnd(),
            tone = rnd();
          if (!reader.sample(x, z, cs) || cs.hab !== 120 || pick > cs.d * 0.7) continue;
          const s = 0.012 + 0.032 * sz * sz;
          const v = 0.7 + 0.5 * tone;
          out.put(x, cs.y + 0.001, z, yaw, s * (0.9 + tone), s * 0.5, s, 0, 0, 0.06 * v, 0.105 * v, 0.028 * v);
        }
      },
    });
  }
}

/** the rosette alone, flat to the paving: the leaves take their colour from the instance */
function dandelionLeafOnly(): THREE.BufferGeometry {
  const s = new Shape();
  const n0 = s.P.length;
  for (let i = 0; i < 7; i++) leaf(s, 0, 0.003, 0, i * 0.9 + 0.3 * Math.sin(i * 3.3), 0.06 + 0.035 * Math.abs(Math.sin(i * 2.1)), 0.012, 0.2, LEAF, 4, 0.55);
  // (all of it takes the instance's green, with the shade the leaf gave it)
  for (let k = n0; k < s.A.length; k += 2) s.A[k] = 1;
  return s.geometry();
}
