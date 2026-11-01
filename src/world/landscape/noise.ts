// Small, fast, deterministic CPU noise for the landscape model (three-free).
//   hash2i(ix, iz, seed) ∈ [0,1)       lattice hash
//   vnoise(x, z, seed)   ∈ [0,1)       quintic value noise (lattice spacing 1)
//   fbm(x, z, oct, seed) ∈ ≈[-1,1]     signed fractal sum
//   ridged(x, z, oct, seed) ∈ [0,1]    ridged multifractal (sharp crests, rounded valleys)
// The GLSL side of the landscape uses its own hashes (shading only); everything that must agree
// between CPU placement and GPU shading goes through landscape/fields.ts (same math in both).

export function hash2i(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul((seed | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** hash of a real-valued point (for jitter / per-object randomness) */
export function hash2(x: number, z: number, seed: number): number {
  return hash2i(Math.floor(x * 7.31 + 0.5), Math.floor(z * 5.17 + 0.5), seed);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x),
    zi = Math.floor(z);
  const ux = fade(x - xi),
    uz = fade(z - zi);
  const a = hash2i(xi, zi, seed),
    b = hash2i(xi + 1, zi, seed),
    c = hash2i(xi, zi + 1, seed),
    d = hash2i(xi + 1, zi + 1, seed);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uz;
}

/** signed fBm, roughly in [-1, 1]; octaves rotate a little to break lattice alignment */
export function fbm(x: number, z: number, oct: number, seed: number, gain = 0.5, lac = 2.03): number {
  let sum = 0,
    amp = 1,
    norm = 0;
  let px = x,
    pz = z;
  for (let o = 0; o < oct; o++) {
    sum += amp * (vnoise(px, pz, seed + o * 101) * 2 - 1);
    norm += amp;
    amp *= gain;
    // rotate ~37° and scale
    const nx = (px * 0.8 - pz * 0.6) * lac,
      nz = (px * 0.6 + pz * 0.8) * lac;
    px = nx + 17.3;
    pz = nz - 9.1;
  }
  return sum / norm;
}

/** ridged multifractal in [0, 1]: sharp crests where the base noise crosses 0.5 */
export function ridged(x: number, z: number, oct: number, seed: number, gain = 0.55, lac = 2.07): number {
  let sum = 0,
    amp = 1,
    norm = 0,
    w = 1;
  let px = x,
    pz = z;
  for (let o = 0; o < oct; o++) {
    let r = 1 - Math.abs(vnoise(px, pz, seed + o * 131) * 2 - 1);
    r *= r;
    r *= w;
    sum += r * amp;
    norm += amp;
    w = Math.min(1, Math.max(0, r * 1.6));
    amp *= gain;
    const nx = (px * 0.8 - pz * 0.6) * lac,
      nz = (px * 0.6 + pz * 0.8) * lac;
    px = nx + 31.7;
    pz = nz + 4.3;
  }
  return sum / norm;
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** polynomial smooth minimum (k = blend width) */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}
