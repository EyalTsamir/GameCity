// Shared procedural noise for the terrain + water shaders (and a few CPU helpers).
//
// noiseTexture(): 256² RGBA, tileable fBm value noise, one frequency band per channel
// (R: 4, G: 8, B: 16, A: 32 lattice periods per tile, 3 octaves each, contrast-stretched to 0..1).
// Shaders sample it with RepeatWrapping at different world scales instead of evaluating
// ALU noise — much cheaper on the integrated GPU.

import * as THREE from 'three';

function hashLattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Tileable value noise with period P (lattice units), quintic interpolation. */
function tileNoise(x: number, y: number, P: number, seed: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const ux = fade(x - xi),
    uy = fade(y - yi);
  const x0 = ((xi % P) + P) % P,
    y0 = ((yi % P) + P) % P;
  const x1 = (x0 + 1) % P,
    y1 = (y0 + 1) % P;
  const a = hashLattice(x0, y0, seed),
    b = hashLattice(x1, y0, seed),
    c = hashLattice(x0, y1, seed),
    d = hashLattice(x1, y1, seed);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

let _noiseTex: THREE.DataTexture | null = null;

export function noiseTexture(): THREE.DataTexture {
  if (_noiseTex) return _noiseTex;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const tmp = new Float32Array(S * S);
  const bases = [4, 8, 16, 32];
  for (let c = 0; c < 4; c++) {
    let lo = Infinity,
      hi = -Infinity;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        let v = 0,
          amp = 1,
          tot = 0,
          P = bases[c];
        for (let o = 0; o < 3; o++) {
          v += amp * tileNoise((i / S) * P, (j / S) * P, P, c * 17 + o * 131);
          tot += amp;
          amp *= 0.5;
          P *= 2;
        }
        v /= tot;
        tmp[j * S + i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const k = 1 / Math.max(1e-6, hi - lo);
    for (let p = 0; p < S * S; p++) data[p * 4 + c] = Math.round((tmp[p] - lo) * k * 255);
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  _noiseTex = tex;
  return tex;
}

/** Non-tiling smooth value noise in [0,1) for CPU-side placement jitter. */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const ux = fade(x - xi),
    uy = fade(y - yi);
  const a = hashLattice(xi, yi, seed),
    b = hashLattice(xi + 1, yi, seed),
    c = hashLattice(xi, yi + 1, seed),
    d = hashLattice(xi + 1, yi + 1, seed);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

/** 3-octave fBm of vnoise, roughly in [0,1). */
export function fbm(x: number, y: number, seed = 0): number {
  return (vnoise(x, y, seed) * 4 + vnoise(x * 2.03, y * 2.03, seed + 7) * 2 + vnoise(x * 4.1, y * 4.1, seed + 13)) / 7;
}

/** GLSL hash helpers shared by several shaders (no texture lookups). */
export const GLSL_HASH = /* glsl */ `
float th_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 th_hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
`;
