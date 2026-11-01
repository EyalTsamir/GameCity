// Procedural, tileable textures owned by the water shader (independent of the terrain noise).
//
//   rippleTexture(): RGBA8 256², a wind-driven ripple field built from integer-wavevector plane waves
//     (so it tiles exactly): RGB = unit surface normal (x, y-up, z) packed 0..1, A = crest mask
//     (high on the steep, high parts of the waves — used to place lacy foam and glitter).
//     Mipmapped: the mip chain averages the normals, so far away the per-texel normal shrinks
//     (|n| < 1). The shader reads that shrinkage as normal variance (Toksvig) and widens the
//     glitter lobe / reflection blur instead of letting ripples shimmer.
//   macroTexture(): RGBA8 256², smooth tileable fBm channels:
//     R = streaks (features 4x longer along u than v — rotated to the wind in the shader)
//     G = broad patches, B = finer lace (foam breakup), A = per-texel hash (sparkle seeds).

import * as THREE from 'three';

let _ripple: THREE.DataTexture | null = null;
let _macro: THREE.DataTexture | null = null;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(tex: THREE.DataTexture): THREE.DataTexture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function rippleTexture(): THREE.DataTexture {
  if (_ripple) return _ripple;
  const S = 256;
  const r = rng(91731);
  // spectrum: waves around the +u axis (the shader rotates the tile to the wind)
  type W = { kx: number; ky: number; a: number; ph: number };
  const waves: W[] = [];
  const used = new Set<string>();
  while (waves.length < 18) {
    const m = 3 + Math.pow(r(), 1.3) * 19; // cycles per tile
    const spread = (r() + r() + r() - 1.5) * 1.5; // ~±70°
    const th = spread + (r() < 0.18 ? Math.PI * 0.5 : 0); // a little cross chop
    const kx = Math.round(m * Math.cos(th)),
      ky = Math.round(m * Math.sin(th));
    if (kx === 0 && ky === 0) continue;
    const key = `${kx},${ky}`;
    if (used.has(key)) continue;
    used.add(key);
    const mag = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(mag, 1.55), ph: r() * Math.PI * 2 });
  }
  const N = S * S;
  const h = new Float32Array(N),
    gx = new Float32Array(N),
    gy = new Float32Array(N);
  const su = new Float32Array(S),
    cu = new Float32Array(S),
    sv = new Float32Array(S),
    cv = new Float32Array(S);
  for (const w of waves) {
    for (let i = 0; i < S; i++) {
      const a = (2 * Math.PI * w.kx * i) / S + w.ph;
      su[i] = Math.sin(a);
      cu[i] = Math.cos(a);
      const b = (2 * Math.PI * w.ky * i) / S;
      sv[i] = Math.sin(b);
      cv[i] = Math.cos(b);
    }
    const ax = w.a * 2 * Math.PI * w.kx,
      ay = w.a * 2 * Math.PI * w.ky;
    for (let j = 0; j < S; j++) {
      const s2 = sv[j],
        c2 = cv[j];
      let k = j * S;
      for (let i = 0; i < S; i++, k++) {
        const s = su[i] * c2 + cu[i] * s2;
        const c = cu[i] * c2 - su[i] * s2;
        h[k] += w.a * s;
        gx[k] += ax * c;
        gy[k] += ay * c;
      }
    }
  }
  // normalise slopes to a fixed rms (the shader scales them per use)
  let ss = 0,
    hmin = Infinity,
    hmax = -Infinity;
  for (let k = 0; k < N; k++) {
    ss += gx[k] * gx[k] + gy[k] * gy[k];
    if (h[k] < hmin) hmin = h[k];
    if (h[k] > hmax) hmax = h[k];
  }
  const kS = 0.42 / Math.sqrt(ss / N);
  const data = new Uint8Array(N * 4);
  for (let k = 0; k < N; k++) {
    const x = -gx[k] * kS,
      z = -gy[k] * kS;
    const il = 1 / Math.sqrt(x * x + 1 + z * z);
    const hn = (h[k] - hmin) / (hmax - hmin);
    const steep = Math.min(1, Math.sqrt(x * x + z * z) / 0.9);
    const crest = Math.min(1, Math.max(0, (hn - 0.52) * 2.4) * (0.55 + 0.45 * steep));
    data[k * 4] = Math.round((x * il * 0.5 + 0.5) * 255);
    data[k * 4 + 1] = Math.round((il * 0.5 + 0.5) * 255);
    data[k * 4 + 2] = Math.round((z * il * 0.5 + 0.5) * 255);
    data[k * 4 + 3] = Math.round(crest * 255);
  }
  _ripple = finish(new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType));
  return _ripple;
}

/** tileable value noise on an integer lattice (px, py cells per tile) */
function valueNoise(S: number, px: number, py: number, seed: number): Float32Array {
  const r = rng(seed);
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    const fy = (j / S) * py;
    const y0 = Math.floor(fy),
      ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const ya = (y0 % py) * px,
      yb = ((y0 + 1) % py) * px;
    for (let i = 0; i < S; i++) {
      const fx = (i / S) * px;
      const x0 = Math.floor(fx),
        tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const xa = x0 % px,
        xb = (x0 + 1) % px;
      const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * sx;
      const b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * sx;
      out[j * S + i] = a + (b - a) * sy;
    }
  }
  return out;
}

function fbm(S: number, px: number, py: number, oct: number, seed: number): Float32Array {
  const out = new Float32Array(S * S);
  let amp = 1,
    tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = valueNoise(S, px << o, py << o, seed + o * 977);
    for (let k = 0; k < out.length; k++) out[k] += n[k] * amp;
    tot += amp;
    amp *= 0.5;
  }
  let lo = Infinity,
    hi = -Infinity;
  for (let k = 0; k < out.length; k++) {
    out[k] /= tot;
    if (out[k] < lo) lo = out[k];
    if (out[k] > hi) hi = out[k];
  }
  const s = 1 / Math.max(1e-6, hi - lo);
  for (let k = 0; k < out.length; k++) out[k] = (out[k] - lo) * s;
  return out;
}

export function macroTexture(): THREE.DataTexture {
  if (_macro) return _macro;
  const S = 256;
  const streak = fbm(S, 3, 12, 4, 4127);
  const patch = fbm(S, 4, 4, 4, 8861);
  const lace = fbm(S, 16, 16, 3, 2291);
  const r = rng(5531);
  const data = new Uint8Array(S * S * 4);
  for (let k = 0; k < S * S; k++) {
    data[k * 4] = Math.round(streak[k] * 255);
    data[k * 4 + 1] = Math.round(patch[k] * 255);
    data[k * 4 + 2] = Math.round(lace[k] * 255);
    data[k * 4 + 3] = Math.round(r() * 255);
  }
  _macro = finish(new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType));
  return _macro;
}
