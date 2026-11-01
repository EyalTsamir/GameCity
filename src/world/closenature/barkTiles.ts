// Bark as two small tiles made at boot. A fetch is cheap on this GPU and procedural noise is not (baking.md), so the look
// lives here and the trunk's fragment only reads and mixes. One tile is about 0.42 m round the trunk and 0.95 m up it.
//   furrows: RG slope, B height (1 = top of a ridge, 0 = bottom of a furrow), A fine grain. Long plates that part and meet again.
//   flakes:  RG slope, B height (a small step at each flake's rim), A a number for the flake. Round, irregular, three sizes.

import * as THREE from 'three';

const SIZE = 512;

/** mulberry32 */
function stream(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** lattice value noise, periodic in `px`, `py` lattice cells; x, y in lattice units */
function lattice(px: number, py: number, seed: number): (x: number, y: number) => number {
  const g = new Float32Array(px * py);
  const r = stream(seed);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xf = Math.floor(x),
      yf = Math.floor(y);
    const fx = x - xf,
      fy = y - yf;
    const u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy);
    const x0 = ((xf % px) + px) % px,
      y0 = ((yf % py) + py) % py;
    const x1 = (x0 + 1) % px,
      y1 = (y0 + 1) % py;
    const a = g[y0 * px + x0],
      b = g[y0 * px + x1],
      c = g[y1 * px + x0],
      d = g[y1 * px + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** periodic cells on a jittered lattice: distance to the nearest point and the next (in units of `metric`-scaled cells), which cell */
class Cells {
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly id: Float32Array;
  f1 = 0;
  f2 = 0;
  best = 0;
  constructor(
    readonly nx: number,
    readonly ny: number,
    seed: number,
    jitter = 0.8,
  ) {
    const r = stream(seed);
    const n = nx * ny;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.id = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = 0.5 + (r() - 0.5) * jitter;
      this.py[i] = 0.5 + (r() - 0.5) * jitter;
      this.id[i] = r();
    }
  }
  /** x, y in cells */
  at(x: number, y: number, ax: number, ay: number): void {
    const cx = Math.floor(x),
      cy = Math.floor(y);
    let f1 = 1e9,
      f2 = 1e9,
      best = 0;
    const { nx, ny } = this;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ci = (((cx + di) % nx) + nx) % nx,
          cj = (((cy + dj) % ny) + ny) % ny;
        const k = cj * nx + ci;
        const dx = (cx + di + this.px[k] - x) * ax,
          dy = (cy + dj + this.py[k] - y) * ay;
        const d = dx * dx + dy * dy;
        if (d < f1) {
          f2 = f1;
          f1 = d;
          best = k;
        } else if (d < f2) f2 = d;
      }
    }
    this.f1 = Math.sqrt(f1);
    this.f2 = Math.sqrt(f2);
    this.best = best;
  }
}

function tile(data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** RG from the slope of a periodic height field, B the height, A from `alpha` */
function pack(h: Float32Array, a: Float32Array, gain: number): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const yn = ((y + 1) % SIZE) * SIZE,
      yp = ((y + SIZE - 1) % SIZE) * SIZE,
      y0 = y * SIZE;
    for (let x = 0; x < SIZE; x++) {
      const xn = (x + 1) % SIZE,
        xp = (x + SIZE - 1) % SIZE;
      const i = y0 + x;
      const gx = (h[y0 + xn] - h[y0 + xp]) * gain,
        gy = (h[yn + x] - h[yp + x]) * gain;
      const k = i * 4;
      out[k] = Math.max(0, Math.min(255, 127.5 + gx * 127.5));
      out[k + 1] = Math.max(0, Math.min(255, 127.5 + gy * 127.5));
      out[k + 2] = Math.max(0, Math.min(255, h[i] * 255));
      out[k + 3] = Math.max(0, Math.min(255, a[i] * 255));
    }
  }
  return out;
}

const sstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function furrows(): THREE.DataTexture {
  // plates 3-4 cm wide and three or four times as long, parting and meeting; on each plate a network of finer cracks across and along
  const cells = new Cells(11, 5, 31, 0.95);
  const finer = new Cells(29, 19, 51, 0.95);
  const warpA = lattice(5, 7, 32),
    warpB = lattice(5, 7, 33),
    wob = lattice(23, 17, 34),
    wob2 = lattice(23, 17, 35),
    width = lattice(13, 11, 36),
    cross = lattice(23, 61, 38),
    pit = lattice(64, 96, 39),
    fine = lattice(192, 192, 40),
    tone = lattice(17, 9, 52),
    stria = lattice(96, 11, 53);
  const h = new Float32Array(SIZE * SIZE);
  const a = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const wx = (warpA(u * 5, v * 7) - 0.5) * 0.6 + (wob(u * 23, v * 17) - 0.5) * 0.28,
        wy = (warpB(u * 5, v * 7) - 0.5) * 0.4 + (wob2(u * 23, v * 17) - 0.5) * 0.2;
      cells.at(u * 11 + wx, v * 5 + wy, 1, 0.36);
      const edge = cells.f2 - cells.f1;
      const w = 0.035 + 0.1 * width(u * 13, v * 11);
      const top = sstep(0, w, edge);
      finer.at(u * 29 + wx * 2.2, v * 19 + wy * 2, 1, 0.6);
      const crack = sstep(0, 0.13, finer.f2 - finer.f1);
      const cr = sstep(0.16, 0.3, cross(u * 23, v * 61));
      const f = fine(u * 192, v * 192);
      const pits = pit(u * 64, v * 96);
      const body = 0.6 + 0.2 * cells.id[cells.best] + 0.2 * sstep(0.08, 0.5, edge);
      const st = stria(u * 96, v * 11);
      h[y * SIZE + x] = Math.max(0, Math.min(1, top * body * (0.72 + 0.28 * crack) * (0.84 + 0.16 * cr) * (0.82 + 0.18 * st) * (0.88 + 0.12 * sstep(0.3, 0.6, pits)) + 0.09 * f - 0.045));
      a[y * SIZE + x] = sstep(0.22, 0.78, 0.36 * f + 0.22 * pits + 0.14 * st + 0.28 * tone(u * 17, v * 9));
    }
  }
  return tile(pack(h, a, 5));
}

function flakes(): THREE.DataTexture {
  // the big flakes lie on the middle-sized ones and those on the small: the highest wins. Cells square in metres
  const big = new Cells(4, 9, 41, 0.95),
    mid = new Cells(7, 16, 42, 0.95),
    small = new Cells(13, 29, 43, 0.95);
  const wx = lattice(9, 20, 44),
    wy = lattice(9, 20, 45),
    wx2 = lattice(29, 60, 46),
    wy2 = lattice(29, 60, 47),
    has = lattice(5, 11, 48),
    fine = lattice(128, 256, 49),
    mott = lattice(24, 52, 50);
  const h = new Float32Array(SIZE * SIZE);
  const a = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const dx = (wx(u * 9, v * 20) - 0.5) * 0.11 + (wx2(u * 29, v * 60) - 0.5) * 0.03,
        dy = (wy(u * 9, v * 20) - 0.5) * 0.05 + (wy2(u * 29, v * 60) - 0.5) * 0.013;
      const pu = u + dx,
        pv = v + dy;
      big.at(pu * 4, pv * 9, 1, 1);
      const b = big.f2 - big.f1;
      const bid = big.id[big.best];
      mid.at(pu * 7, pv * 16, 1, 1);
      const m = mid.f2 - mid.f1;
      const mid0 = mid.id[mid.best];
      small.at(pu * 13, pv * 29, 1, 1);
      const s = small.f2 - small.f1;
      const sid = small.id[small.best];
      // a flake is there if its patch says so, or it would leave a hole
      const useBig = has(u * 5, v * 11) > 0.42 && b > 0.05;
      const useMid = !useBig && m > 0.05;
      const e = useBig ? b * 1.6 : useMid ? m * 1.3 : s;
      const id = useBig ? bid : useMid ? mid0 : sid;
      const f = fine(u * 128, v * 256);
      // the rim of a flake curls up a little, its face is nearly flat
      const rim = sstep(0, 0.09, e);
      h[y * SIZE + x] = Math.max(0, Math.min(1, 0.35 + 0.42 * rim + 0.13 * id + 0.07 * mott(u * 24, v * 52) + 0.03 * f));
      a[y * SIZE + x] = id;
    }
  }
  return tile(pack(h, a, 5));
}

export interface BarkTiles {
  furrows: THREE.DataTexture;
  flakes: THREE.DataTexture;
  ms: number;
}

export function makeBarkTiles(): BarkTiles {
  const t0 = performance.now();
  const f = furrows();
  const p = flakes();
  return { furrows: f, flakes: p, ms: performance.now() - t0 };
}
