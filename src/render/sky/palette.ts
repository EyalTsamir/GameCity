// Time-of-day palette for the painted-sky backdrop and the light rig.
//
// Keys are authored by hour (sunrise 6:00, sunset 19:30 — see core/time.ts) so the
// art direction is explicit: pink-orange dawn, warm morning, neutral bright noon,
// deep golden hour, magenta afterglow, blue hour, moody-but-readable night.
// Colours are sRGB hex; they are converted to linear once and blended in linear space.

import * as THREE from 'three';

interface KeyDef {
  h: number;
  /** direct light (sun by day, moon by night) */
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  /** sky dome: zenith, horizon band, below-horizon haze */
  zenith: string;
  horizon: string;
  ground: string;
  /** warm horizon glow toward the sun */
  glow: string;
  glowI: number;
  fog: string;
  exposure: number;
  cloudLit: string;
  cloudShade: string;
  stars: number;
  /** scene.environmentIntensity */
  env: number;
  /** bloom intensity hint for post-processing */
  bloom: number;
}

const NIGHT: Omit<KeyDef, 'h'> = {
  sun: '#8ea3dc',
  sunI: 0.62,
  hemiSky: '#41558f',
  hemiGround: '#2a2a38',
  hemiI: 0.95,
  zenith: '#070c20',
  horizon: '#1d2b52',
  ground: '#141b33',
  glow: '#2c3866',
  glowI: 0.0,
  fog: '#18223f',
  exposure: 1.18,
  cloudLit: '#69789f',
  cloudShade: '#2a3252',
  stars: 1,
  env: 0.55,
  bloom: 1.0,
};

const KEYS: KeyDef[] = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  {
    h: 5.3,
    sun: '#8f98d0',
    sunI: 0.4,
    hemiSky: '#4d5c93',
    hemiGround: '#302d3a',
    hemiI: 0.95,
    zenith: '#101c42',
    horizon: '#5c6192',
    ground: '#262a46',
    glow: '#d48c7c',
    glowI: 0.55,
    fog: '#3e466e',
    exposure: 1.14,
    cloudLit: '#9a8fb2',
    cloudShade: '#3c4162',
    stars: 0.65,
    env: 0.55,
    bloom: 0.95,
  },
  {
    h: 6.0,
    sun: '#ff9d7c',
    sunI: 1.0,
    hemiSky: '#9097c6',
    hemiGround: '#5f4e4e',
    hemiI: 1.05,
    zenith: '#3a5694',
    horizon: '#f0b39c',
    ground: '#7d6c7e',
    glow: '#ff8f6c',
    glowI: 1.0,
    fog: '#c9a8aa',
    exposure: 1.06,
    cloudLit: '#ffb69c',
    cloudShade: '#7c7098',
    stars: 0.15,
    env: 0.6,
    bloom: 0.7,
  },
  {
    h: 6.7,
    sun: '#ffb47f',
    sunI: 2.2,
    hemiSky: '#a9b6dc',
    hemiGround: '#7a6656',
    hemiI: 1,
    zenith: '#5a82c0',
    horizon: '#f5c8a8',
    ground: '#b7a4a2',
    glow: '#ffae7a',
    glowI: 0.8,
    fog: '#dcc5bb',
    exposure: 1.0,
    cloudLit: '#ffd3b2',
    cloudShade: '#9b94b6',
    stars: 0,
    env: 0.55,
    bloom: 0.5,
  },
  {
    h: 7.8,
    sun: '#ffdcb2',
    sunI: 2.9,
    hemiSky: '#b9d0ec',
    hemiGround: '#8a7c68',
    hemiI: 0.95,
    zenith: '#6a9fd8',
    horizon: '#d9e4ea',
    ground: '#cfc9c0',
    glow: '#ffe0b8',
    glowI: 0.45,
    fog: '#d4dee6',
    exposure: 1.0,
    cloudLit: '#fff3e4',
    cloudShade: '#a8b3cc',
    stars: 0,
    env: 0.55,
    bloom: 0.42,
  },
  {
    h: 10.0,
    sun: '#fff0dc',
    sunI: 3.4,
    hemiSky: '#b4cdee',
    hemiGround: '#8c8270',
    hemiI: 0.95,
    zenith: '#5f99d8',
    horizon: '#d6e6f0',
    ground: '#d3cfc6',
    glow: '#fff2dc',
    glowI: 0.3,
    fog: '#d2e0ea',
    exposure: 1.0,
    cloudLit: '#ffffff',
    cloudShade: '#aab8d2',
    stars: 0,
    env: 0.55,
    bloom: 0.4,
  },
  {
    h: 12.75,
    sun: '#fff8ee',
    sunI: 3.5,
    hemiSky: '#b6cff0',
    hemiGround: '#8a8472',
    hemiI: 0.95,
    zenith: '#5896d8',
    horizon: '#d8e8f2',
    ground: '#d5d1c8',
    glow: '#fff6e8',
    glowI: 0.25,
    fog: '#d4e2ec',
    exposure: 1.0,
    cloudLit: '#ffffff',
    cloudShade: '#adbad3',
    stars: 0,
    env: 0.55,
    bloom: 0.4,
  },
  {
    h: 16.0,
    sun: '#ffeed4',
    sunI: 3.3,
    hemiSky: '#b8cdea',
    hemiGround: '#8e8270',
    hemiI: 0.92,
    zenith: '#5c94d2',
    horizon: '#dfe6e8',
    ground: '#d3cdc2',
    glow: '#ffe8c4',
    glowI: 0.35,
    fog: '#d8e0e4',
    exposure: 1.0,
    cloudLit: '#fffaf0',
    cloudShade: '#aab4cc',
    stars: 0,
    env: 0.55,
    bloom: 0.4,
  },
  {
    h: 17.6,
    sun: '#ffcf98',
    sunI: 2.95,
    hemiSky: '#b4c0dc',
    hemiGround: '#8e7a62',
    hemiI: 0.88,
    zenith: '#5684c4',
    horizon: '#efdcc0',
    ground: '#cbbcab',
    glow: '#ffca88',
    glowI: 0.6,
    fog: '#e0d6c8',
    exposure: 1.0,
    cloudLit: '#ffe7c6',
    cloudShade: '#a8a8c4',
    stars: 0,
    env: 0.52,
    bloom: 0.45,
  },
  {
    h: 18.6,
    sun: '#ffa45e',
    sunI: 2.5,
    hemiSky: '#9ea6cc',
    hemiGround: '#85664c',
    hemiI: 0.82,
    zenith: '#4a6eb0',
    horizon: '#f4bf88',
    ground: '#b99f8c',
    glow: '#ff9850',
    glowI: 0.9,
    fog: '#e2c3a6',
    exposure: 1.02,
    cloudLit: '#ffc38e',
    cloudShade: '#9a8cae',
    stars: 0,
    env: 0.5,
    bloom: 0.55,
  },
  {
    h: 19.3,
    sun: '#ff7c48',
    sunI: 1.5,
    hemiSky: '#8a88b8',
    hemiGround: '#6e5048',
    hemiI: 0.9,
    zenith: '#3a5090',
    horizon: '#f09c72',
    ground: '#8f7682',
    glow: '#ff6c42',
    glowI: 1.0,
    fog: '#c99e92',
    exposure: 1.05,
    cloudLit: '#ff9e82',
    cloudShade: '#7a6a9a',
    stars: 0,
    env: 0.58,
    bloom: 0.7,
  },
  {
    h: 19.8,
    sun: '#9aa2d8',
    sunI: 0.3,
    hemiSky: '#5a6098',
    hemiGround: '#3c3440',
    hemiI: 0.9,
    zenith: '#24336e',
    horizon: '#c47c88',
    ground: '#4a4058',
    glow: '#e0627a',
    glowI: 0.7,
    fog: '#6a5a7c',
    exposure: 1.1,
    cloudLit: '#d08ca2',
    cloudShade: '#4c4a72',
    stars: 0.2,
    env: 0.55,
    bloom: 0.85,
  },
  {
    h: 20.3,
    sun: '#8fa2e0',
    sunI: 0.45,
    hemiSky: '#44568e',
    hemiGround: '#2c2a3a',
    hemiI: 0.92,
    zenith: '#13204e',
    horizon: '#4c5c92',
    ground: '#252b4a',
    glow: '#7a5c8c',
    glowI: 0.35,
    fog: '#2f3b64',
    exposure: 1.15,
    cloudLit: '#7c84b4',
    cloudShade: '#343c62',
    stars: 0.6,
    env: 0.55,
    bloom: 0.95,
  },
  { h: 21.3, ...NIGHT },
  { h: 24, ...NIGHT },
];

/** Linear-space sample of the palette (mutable, reused every frame). */
export class SkyState {
  sun = new THREE.Color();
  sunI = 1;
  hemiSky = new THREE.Color();
  hemiGround = new THREE.Color();
  hemiI = 1;
  zenith = new THREE.Color();
  horizon = new THREE.Color();
  ground = new THREE.Color();
  glow = new THREE.Color();
  glowI = 0;
  fog = new THREE.Color();
  exposure = 1;
  cloudLit = new THREE.Color();
  cloudShade = new THREE.Color();
  stars = 0;
  env = 0.6;
  bloom = 0.5;
}

type ColorKey = 'sun' | 'hemiSky' | 'hemiGround' | 'zenith' | 'horizon' | 'ground' | 'glow' | 'fog' | 'cloudLit' | 'cloudShade';
type NumKey = 'sunI' | 'hemiI' | 'glowI' | 'exposure' | 'stars' | 'env' | 'bloom';
const COLOR_KEYS: ColorKey[] = ['sun', 'hemiSky', 'hemiGround', 'zenith', 'horizon', 'ground', 'glow', 'fog', 'cloudLit', 'cloudShade'];
const NUM_KEYS: NumKey[] = ['sunI', 'hemiI', 'glowI', 'exposure', 'stars', 'env', 'bloom'];

interface LinearKey {
  h: number;
  colors: Record<ColorKey, THREE.Color>;
  nums: Record<NumKey, number>;
}

const LINEAR: LinearKey[] = KEYS.map((k) => {
  const colors = {} as Record<ColorKey, THREE.Color>;
  for (const c of COLOR_KEYS) colors[c] = new THREE.Color(k[c]); // sRGB hex → linear working space
  const nums = {} as Record<NumKey, number>;
  for (const n of NUM_KEYS) nums[n] = k[n];
  return { h: k.h, colors, nums };
});

/** Sample the palette at `hours` (0..24) into `out`. Smooth (C1) between keys. */
export function samplePalette(hours: number, out: SkyState): SkyState {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < LINEAR.length - 2 && LINEAR[i + 1].h <= h) i++;
  const a = LINEAR[i],
    b = LINEAR[i + 1];
  let t = (h - a.h) / Math.max(1e-6, b.h - a.h);
  t = Math.min(1, Math.max(0, t));
  t = t * t * (3 - 2 * t);
  for (const c of COLOR_KEYS) (out[c] as THREE.Color).copy(a.colors[c]).lerp(b.colors[c], t);
  for (const n of NUM_KEYS) out[n] = a.nums[n] + (b.nums[n] - a.nums[n]) * t;
  return out;
}
