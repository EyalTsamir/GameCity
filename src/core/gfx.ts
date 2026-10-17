// Shared graphics helpers + the art-direction palette ("painted tabletop model").
// Colours are sRGB hex; three.js converts to linear automatically.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from './rng';

export const PALETTE = {
  // ground
  grass: '#8fbf5a',
  grassDark: '#76a84b',
  lawn: '#9ccc65',
  soilTop: '#6b4a33',
  clay: '#8c5f3c',
  stone: '#a39079',
  bedrock: '#6f6a66',
  sand: '#ead9a7',
  sandWet: '#cdbb88',
  gravel: '#cfc3a8',
  // hardscape
  asphalt: '#4a4d52',
  asphaltLight: '#5b5f65',
  marking: '#f2efe6',
  markingYellow: '#f2c94c',
  sidewalk: '#d9d3c7',
  curb: '#bdb6aa',
  paving: '#e3d6c1',
  concrete: '#c4c0b8',
  deck: '#a87f58',
  // water
  waterShallow: '#4aa3c4',
  waterDeep: '#1f5f8a',
  foam: '#ffffff',
  // facades
  pastel: ['#e8b4a0', '#f2d6a2', '#a8c8d8', '#c9d9a8', '#f0e6d8', '#d98c6a', '#b8a9c9', '#e9c46a'],
  roofs: ['#b5583e', '#a24c36', '#5a6270', '#6fa596', '#8a5a44', '#4d5560'],
  glass: ['#6f9fb8', '#8fb3c4', '#4f7a94', '#7fa7a3', '#5d7f99'],
  stoneFacade: ['#d8cbb3', '#bfbab2', '#cbbfa8', '#e0d8c8'],
  brick: ['#a0553d', '#8f4a36', '#b06a4c'],
  metal: ['#8b98a3', '#c4cdd3', '#9aa6ad'],
  windowFrame: '#2e3a44',
  // accents (vehicles, awnings, umbrellas, boats…)
  accents: ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#f1faee', '#264653', '#8d6cab'],
  // night
  windowWarm: '#ffd59a',
  lampWarm: '#ffc979',
  lampWhite: '#fff1d6',
  moonlight: '#9fb4ff',
} as const;

const _c = new THREE.Color();

/** Fill a geometry's vertex colours with one colour (adds the attribute if missing). */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  _c.set(color);
  const n = geo.attributes.position.count;
  let attr = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!attr || attr.count !== n) {
    attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('color', attr);
  }
  for (let i = 0; i < n; i++) attr.setXYZ(i, _c.r, _c.g, _c.b);
  attr.needsUpdate = true;
  return geo;
}

/** Merge geometries (they must share attribute sets). Non-indexed/indexed are normalised. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  const anyIndexed = geos.some((g) => g.index);
  const norm = anyIndexed ? geos.map((g) => (g.index ? g : indexify(g))) : geos;
  const out = mergeGeometries(norm, false);
  if (!out) throw new Error('merge: incompatible geometries (attribute mismatch)');
  return out;
}

function indexify(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Box placed by its min corner-free description: centre (x,y,z) & size, already translated. */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, color?: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  if (color !== undefined) paint(g, color);
  return g;
}

/** Slightly vary a colour (hue/sat/lightness jitter) deterministically. */
export function jitterColor(color: THREE.ColorRepresentation, rng: Rng, amount = 0.05): THREE.Color {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + (rng.next() - 0.5) * amount * 0.3 + 1) % 1, THREE.MathUtils.clamp(hsl.s + (rng.next() - 0.5) * amount, 0, 1), THREE.MathUtils.clamp(hsl.l + (rng.next() - 0.5) * amount, 0, 1));
  return c;
}

let _glow: THREE.Texture | null = null;
/** Soft radial gradient (white centre → transparent) for light pools, glows, halos. Use with AdditiveBlending. */
export function glowTexture(): THREE.Texture {
  if (_glow) return _glow;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  _glow = new THREE.CanvasTexture(cv);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

/** Canvas helper: make a CanvasTexture of size w×h drawn by `draw`. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
