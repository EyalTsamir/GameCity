// The four tileable surface tiles of the close-up materials, made once at boot on the CPU (about 100 ms). A fetch costs
// next to nothing on this GPU and procedural code costs a lot (baking.md), so what a pixel needs from a metre away lives
// here and the shaders only pick and weigh it. Each brick, stone or board reads its own window of a tile: no repeat shows.
//
//   grain   RG slope of a rough mineral surface (0.5 = flat), B height, A pits       tile 0.6 m, 1.2 mm a texel
//   crack   R distance to a wandering crack network (1 = 4 cm or more), G cell id,
//           B soft blotches (~0.5 m), A ragged flakes (~5 cm)                        tile 2.56 m, 5 mm a texel
//   fibre   RG slope of long fibres (grain runs along u), B height, A pores          tile 1.2 × 0.3 m, 2.3 × 0.6 mm a texel
//   stones  R distance to the edge of a stone (1 = half a cell), G stone id, B dome
//           height, A distance to the edge of a coarser stone                        tile 0.8 m, 64 + 24 stones across

import * as THREE from 'three';

const N = 512;

/** a hash of integer coordinates, 0..1 */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** adds a tileable value-noise octave with lattice px × py over the tile to `out`, times `amp` (one bilinear walk, no hash per texel) */
function octave(out: Float32Array, px: number, py: number, amp: number, seed: number): void {
  const lat = new Float32Array(px * py);
  for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) lat[j * px + i] = hash(i, j, seed);
  for (let y = 0; y < N; y++) {
    const fy = ((y + 0.5) / N) * py;
    const yi = Math.floor(fy);
    let ty = fy - yi;
    ty = ty * ty * (3 - 2 * ty);
    const y0 = (yi % py) * px,
      y1 = ((yi + 1) % py) * px;
    const row = y * N;
    for (let x = 0; x < N; x++) {
      const fx = ((x + 0.5) / N) * px;
      const xi = Math.floor(fx);
      let tx = fx - xi;
      tx = tx * tx * (3 - 2 * tx);
      const x0 = xi % px,
        x1 = (xi + 1) % px;
      const a = lat[y0 + x0],
        b = lat[y0 + x1],
        c = lat[y1 + x0],
        d = lat[y1 + x1];
      out[row + x] += amp * (a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty);
    }
  }
}

function normalize(a: Float32Array): void {
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < lo) lo = a[i];
    if (a[i] > hi) hi = a[i];
  }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * k;
}

/** central differences of a tileable height field into two channels; `gain` per texel */
function slopes(h: Float32Array, data: Uint8Array, gainX: number, gainY: number): void {
  for (let y = 0; y < N; y++) {
    const up = ((y + N - 1) % N) * N,
      dn = ((y + 1) % N) * N,
      row = y * N;
    for (let x = 0; x < N; x++) {
      const l = (x + N - 1) % N,
        r = (x + 1) % N;
      const sx = (h[row + r] - h[row + l]) * gainX,
        sy = (h[dn + x] - h[up + x]) * gainY;
      const k = (row + x) * 4;
      data[k] = Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * sx)));
      data[k + 1] = Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * sy)));
    }
  }
}

function put(data: Uint8Array, ch: number, a: Float32Array): void {
  for (let i = 0; i < a.length; i++) data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(a[i] * 255)));
}

function texture(data: Uint8Array, name: string, aniso: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.colorSpace = THREE.NoColorSpace;
  t.name = name;
  t.needsUpdate = true;
  return t;
}

/** small round pits: a soft 1 inside, in the given field */
function pits(out: Float32Array, count: number, r0: number, r1: number, seed: number): void {
  for (let n = 0; n < count; n++) {
    const cx = hash(n, 1, seed) * N,
      cy = hash(n, 2, seed) * N;
    const r = r0 + (r1 - r0) * Math.pow(hash(n, 3, seed), 3);
    const R = Math.ceil(r + 1.5);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy) - r;
        if (d > 1) continue;
        const k = ((((Math.round(cy) + dy) % N) + N) % N) * N + (((Math.round(cx) + dx) % N) + N) % N;
        const v = Math.min(1, 1 - d);
        if (v > out[k]) out[k] = v;
      }
    }
  }
}

function grainTile(aniso: number): THREE.DataTexture {
  const h = new Float32Array(N * N);
  octave(h, 12, 12, 0.5, 1);
  octave(h, 24, 24, 0.38, 2);
  octave(h, 48, 48, 0.3, 3);
  octave(h, 96, 96, 0.3, 4);
  octave(h, 192, 192, 0.26, 5);
  octave(h, 384, 384, 0.16, 6);
  normalize(h);
  // pits: a few sharp holes, the rest torn shapes where a patchy field peaks (no one looks at round dots twice)
  const p = new Float32Array(N * N);
  pits(p, 500, 0.6, 2.4, 7);
  const torn = new Float32Array(N * N);
  octave(torn, 64, 64, 1, 8);
  octave(torn, 128, 128, 0.8, 9);
  octave(torn, 256, 256, 0.4, 10);
  normalize(torn);
  for (let i = 0; i < p.length; i++) {
    const t = Math.min(1, Math.max(0, (torn[i] - 0.73) / 0.05));
    if (t > p[i]) p[i] = t;
  }
  // pits are holes in the surface: they enter the slopes
  for (let i = 0; i < h.length; i++) h[i] -= 0.14 * p[i];
  const data = new Uint8Array(N * N * 4);
  slopes(h, data, 11, 11);
  put(data, 2, h);
  put(data, 3, p);
  return texture(data, 'closemat-grain', aniso);
}

function crackTile(aniso: number): THREE.DataTexture {
  // a Voronoi of 8 × 8 points with its coordinates pushed about: borders wander like real cracks
  const wx = new Float32Array(N * N),
    wy = new Float32Array(N * N);
  octave(wx, 16, 16, 1, 21);
  octave(wx, 48, 48, 0.42, 22);
  octave(wx, 128, 128, 0.16, 23);
  octave(wy, 16, 16, 1, 24);
  octave(wy, 48, 48, 0.42, 25);
  octave(wy, 128, 128, 0.16, 26);
  const C = 8;
  const px = new Float32Array(C * C),
    py = new Float32Array(C * C),
    pid = new Float32Array(C * C);
  for (let j = 0; j < C; j++) {
    for (let i = 0; i < C; i++) {
      px[j * C + i] = i + 0.12 + 0.76 * hash(i, j, 31);
      py[j * C + i] = j + 0.12 + 0.76 * hash(i, j, 32);
      pid[j * C + i] = hash(i, j, 33);
    }
  }
  const data = new Uint8Array(N * N * 4);
  const metresPerCell = 2.56 / C;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = y * N + x;
      const fx = ((x + 0.5) / N) * C + (wx[k] - 0.78) * 0.55,
        fy = ((y + 0.5) / N) * C + (wy[k] - 0.78) * 0.55;
      const ci = Math.floor(fx),
        cj = Math.floor(fy);
      let d1 = 1e9,
        d2 = 1e9,
        id = 0;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ii = ci + di,
            jj = cj + dj;
          const wi = ((ii % C) + C) % C,
            wj = ((jj % C) + C) % C;
          const qx = px[wj * C + wi] + (ii - wi) - fx,
            qy = py[wj * C + wi] + (jj - wj) - fy;
          const d = qx * qx + qy * qy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = pid[wj * C + wi];
          } else if (d < d2) d2 = d;
        }
      }
      // distance to the border, near enough: half the difference of the two nearest distances over their sum
      const a = Math.sqrt(d1),
        b = Math.sqrt(d2);
      const e = ((b - a) * 0.5 * metresPerCell) / 0.04;
      const m = k * 4;
      data[m] = Math.min(255, Math.round(e * 255));
      data[m + 1] = Math.round(id * 255);
    }
  }
  const blot = new Float32Array(N * N);
  octave(blot, 4, 4, 1, 41);
  octave(blot, 8, 8, 0.6, 42);
  octave(blot, 16, 16, 0.32, 43);
  octave(blot, 32, 32, 0.16, 44);
  normalize(blot);
  put(data, 2, blot);
  const flake = new Float32Array(N * N);
  octave(flake, 24, 24, 1, 51);
  octave(flake, 48, 48, 0.7, 52);
  octave(flake, 96, 96, 0.45, 53);
  octave(flake, 192, 192, 0.28, 54);
  normalize(flake);
  put(data, 3, flake);
  return texture(data, 'closemat-crack', aniso);
}

function fibreTile(aniso: number): THREE.DataTexture {
  const h = new Float32Array(N * N);
  // growth rings: a slow warp in u, many lines in v
  const warp = new Float32Array(N * N);
  octave(warp, 3, 8, 1, 61);
  octave(warp, 6, 16, 0.4, 62);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = y * N + x;
      // an integer number of rings around the tile, so that it stays tileable: the warp shifts the phase, and its own tile closes
      const ph = ((y + 0.5) / N) * 7 + warp[k] * 2.2;
      const s = 0.5 + 0.5 * Math.sin(ph * 6.2832);
      h[k] = Math.pow(s, 3) * 0.3;
    }
  }
  octave(h, 6, 48, 0.3, 63);
  octave(h, 12, 96, 0.26, 64);
  octave(h, 24, 192, 0.22, 65);
  octave(h, 48, 384, 0.14, 66);
  normalize(h);
  // pores: short dark dashes along the grain
  const p = new Float32Array(N * N);
  for (let n = 0; n < 1400; n++) {
    const cx = Math.floor(hash(n, 1, 71) * N),
      cy = Math.floor(hash(n, 2, 71) * N),
      len = 3 + Math.floor(20 * Math.pow(hash(n, 3, 71), 2));
    for (let i = 0; i < len; i++) p[cy * N + ((cx + i) % N)] = Math.max(p[cy * N + ((cx + i) % N)], 1 - Math.abs(i / len - 0.5));
  }
  const data = new Uint8Array(N * N * 4);
  slopes(h, data, 3, 8);
  put(data, 2, h);
  put(data, 3, p);
  return texture(data, 'closemat-fibre', aniso);
}

function stonesTile(aniso: number): THREE.DataTexture {
  const data = new Uint8Array(N * N * 4);
  const cell = (C: number, seed: number, write: (k: number, edge: number, id: number, dome: number) => void) => {
    const px = new Float32Array(C * C),
      py = new Float32Array(C * C),
      pid = new Float32Array(C * C);
    for (let j = 0; j < C; j++) {
      for (let i = 0; i < C; i++) {
        px[j * C + i] = i + 0.1 + 0.8 * hash(i, j, seed);
        py[j * C + i] = j + 0.1 + 0.8 * hash(i, j, seed + 1);
        pid[j * C + i] = hash(i, j, seed + 2);
      }
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = ((x + 0.5) / N) * C,
          fy = ((y + 0.5) / N) * C;
        const ci = Math.floor(fx),
          cj = Math.floor(fy);
        let d1 = 1e9,
          d2 = 1e9,
          id = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = ci + di,
              jj = cj + dj;
            const wi = ((ii % C) + C) % C,
              wj = ((jj % C) + C) % C;
            const qx = px[wj * C + wi] + (ii - wi) - fx,
              qy = py[wj * C + wi] + (jj - wj) - fy;
            const d = qx * qx + qy * qy;
            if (d < d1) {
              d2 = d1;
              d1 = d;
              id = pid[wj * C + wi];
            } else if (d < d2) d2 = d;
          }
        }
        const a = Math.sqrt(d1),
          b = Math.sqrt(d2);
        write(y * N + x, Math.min(1, (b - a) * 2), id, Math.max(0, 1 - a * 1.4));
      }
    }
  };
  cell(64, 81, (k, e, id, dome) => {
    const m = k * 4;
    data[m] = Math.round(e * 255);
    data[m + 1] = Math.round(id * 255);
    data[m + 2] = Math.round(dome * 255);
  });
  cell(24, 91, (k, e) => {
    data[k * 4 + 3] = Math.round(e * 255);
  });
  return texture(data, 'closemat-stones', aniso);
}

export interface CloseTiles {
  grain: THREE.DataTexture;
  crack: THREE.DataTexture;
  fibre: THREE.DataTexture;
  stones: THREE.DataTexture;
  ms: number;
}

let made: CloseTiles | null = null;

/** one set per page: the first caller pays */
export function makeCloseTiles(aniso = 4): CloseTiles {
  if (made) return made;
  const t0 = performance.now();
  const grain = grainTile(aniso),
    crack = crackTile(aniso),
    fibre = fibreTile(aniso),
    stones = stonesTile(aniso);
  made = { grain, crack, fibre, stones, ms: performance.now() - t0 };
  return made;
}
