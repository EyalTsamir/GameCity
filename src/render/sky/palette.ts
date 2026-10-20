// Time-of-day palette for the painted-sky backdrop and the light rig.
//
// Keys are authored by hour (sunrise 6:00, sunset 19:30 — see core/time.ts) so the
// art direction is explicit: pink-orange dawn, warm morning, neutral bright noon,
// deep golden hour, magenta afterglow, blue hour, moody-but-readable night.
// Colours are sRGB hex; they are converted to linear once and blended in linear space.
//
// Two key sets: KEYS (the "studio" key, default) and LEGACY_KEYS (the original rig, kept for
// A/B runs with ?legacylight). The studio key is sun-dominated: a strong warm sun, a weak cool
// sky fill (hemi + environment; the diffuse part of the environment is additionally scaled by
// IBL_DIFFUSE in sky/iblPatch.ts) and exposure compensation, so faces separate, shadows read
// and golden hour is clearly warm-against-cool. Night is a dark, desaturated moonlight that the
// city's own lights (lamps, windows) can carry.

import * as THREE from 'three';
import { WORLD_MODE } from '../../core/world';

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
  /** studio backdrop (cyclorama) colour: where the table fades to, and the dome below the horizon */
  cyc?: string;
  /** world mode: aerosol haze extinction at ground level (1/m; visibility ≈ 3.9 / haze) */
  haze?: number;
  /** world mode: ground-mist extinction at the water level (1/m) and its scale height (m) */
  mist?: number;
  mistH?: number;
}

const LEGACY_NIGHT: Omit<KeyDef, 'h'> = {
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

const LEGACY_KEYS: KeyDef[] = [
  { h: 0, ...LEGACY_NIGHT },
  { h: 4.6, ...LEGACY_NIGHT },
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
  { h: 21.3, ...LEGACY_NIGHT },
  { h: 24, ...LEGACY_NIGHT },
];

// ───────────────────────────────────────────── studio key (default) ──

const NIGHT: Omit<KeyDef, 'h'> = {
  sun: '#a7b4d6',
  sunI: 0.5,
  hemiSky: '#3b4766',
  hemiGround: '#24232a',
  hemiI: 0.5,
  zenith: '#050916',
  horizon: '#141b33',
  ground: '#0d1122',
  glow: '#2c3866',
  glowI: 0.0,
  fog: '#121829',
  exposure: 1.12,
  cloudLit: '#5a6684',
  cloudShade: '#242a40',
  stars: 1,
  env: 0.42,
  bloom: 1.0,
  cyc: '#131a37',
};

const KEYS: KeyDef[] = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  {
    // pre-dawn blue
    h: 5.3,
    sun: '#959dcc',
    sunI: 0.3,
    hemiSky: '#48557c',
    hemiGround: '#2c2a33',
    hemiI: 0.72,
    zenith: '#0f1a3e',
    horizon: '#5a5e8c',
    ground: '#252943',
    glow: '#d48c86',
    glowI: 0.55,
    fog: '#3a4268',
    exposure: 1.2,
    cloudLit: '#968cb0',
    cloudShade: '#3a3f5e',
    stars: 0.65,
    env: 0.45,
    bloom: 0.95,
    cyc: '#2e3354',
  },
  {
    // sunrise: rose light, lilac mist
    h: 6.0,
    sun: '#ff9c86',
    sunI: 1.3,
    hemiSky: '#8b8fbe',
    hemiGround: '#5c4a4e',
    hemiI: 0.86,
    zenith: '#3a5694',
    horizon: '#efb4a6',
    ground: '#7d6c7e',
    glow: '#ff8f78',
    glowI: 1.0,
    fog: '#c8a9b4',
    exposure: 1.28,
    cloudLit: '#ffb4a2',
    cloudShade: '#7a6e98',
    stars: 0.15,
    env: 0.55,
    bloom: 0.7,
    cyc: '#b49aac',
  },
  {
    // dawn: low apricot-pink sun, cool lavender fill (cooler and pinker than dusk)
    h: 6.7,
    sun: '#ffb592',
    sunI: 3.1,
    hemiSky: '#a9b0d4',
    hemiGround: '#7a6459',
    hemiI: 0.78,
    zenith: '#5a80c0',
    horizon: '#f2c8b6',
    ground: '#b7a4a6',
    glow: '#ffae88',
    glowI: 0.8,
    fog: '#d8c4c8',
    exposure: 1.26,
    cloudLit: '#ffd2bc',
    cloudShade: '#9792b8',
    stars: 0,
    env: 0.52,
    bloom: 0.5,
    cyc: '#d2c2c8',
  },
  {
    h: 7.8,
    sun: '#ffdab4',
    sunI: 3.9,
    hemiSky: '#b6c2d8',
    hemiGround: '#8a7a64',
    hemiI: 0.64,
    zenith: '#6a9fd8',
    horizon: '#d9e4ea',
    ground: '#cfc9c0',
    glow: '#ffe0b8',
    glowI: 0.45,
    fog: '#d4dee6',
    exposure: 1.13,
    cloudLit: '#fff3e4',
    cloudShade: '#a8b3cc',
    stars: 0,
    env: 0.48,
    bloom: 0.42,
    cyc: '#cfdbe6',
  },
  {
    h: 10.0,
    sun: '#ffefd8',
    sunI: 4.3,
    hemiSky: '#b5c2da',
    hemiGround: '#9a8a72',
    hemiI: 0.58,
    zenith: '#5f99d8',
    horizon: '#d6e6f0',
    ground: '#d3cfc6',
    glow: '#fff2dc',
    glowI: 0.3,
    fog: '#d2e0ea',
    exposure: 1.08,
    cloudLit: '#ffffff',
    cloudShade: '#aab8d2',
    stars: 0,
    env: 0.5,
    bloom: 0.4,
    cyc: '#d0dfec',
  },
  {
    h: 12.75,
    sun: '#fff4e6',
    sunI: 4.4,
    hemiSky: '#b7c4dc',
    hemiGround: '#9a8b74',
    hemiI: 0.58,
    zenith: '#5896d8',
    horizon: '#d8e8f2',
    ground: '#d5d1c8',
    glow: '#fff6e8',
    glowI: 0.25,
    fog: '#d4e2ec',
    exposure: 1.06,
    cloudLit: '#ffffff',
    cloudShade: '#adbad3',
    stars: 0,
    env: 0.5,
    bloom: 0.4,
    cyc: '#d2e1ee',
  },
  {
    h: 16.0,
    sun: '#ffe9cc',
    sunI: 4.3,
    hemiSky: '#b6c1d8',
    hemiGround: '#9c8a70',
    hemiI: 0.62,
    zenith: '#5c94d2',
    horizon: '#dfe6e8',
    ground: '#d3cdc2',
    glow: '#ffe8c4',
    glowI: 0.35,
    fog: '#d8e0e4',
    exposure: 1.14,
    cloudLit: '#fffaf0',
    cloudShade: '#aab4cc',
    stars: 0,
    env: 0.48,
    bloom: 0.4,
    cyc: '#d6e0e6',
  },
  {
    // golden hour begins: amber sun, cool periwinkle fill
    h: 17.6,
    sun: '#ffc68a',
    sunI: 4.1,
    hemiSky: '#adb6d6',
    hemiGround: '#9a7c5c',
    hemiI: 0.66,
    zenith: '#5684c4',
    horizon: '#efd8bc',
    ground: '#cbbcab',
    glow: '#ffc684',
    glowI: 0.65,
    fog: '#e2d4c2',
    exposure: 1.25,
    cloudLit: '#ffe4c0',
    cloudShade: '#a4a6c6',
    stars: 0,
    env: 0.44,
    bloom: 0.45,
    cyc: '#e6d2bc',
  },
  {
    h: 18.6,
    sun: '#ff9d56',
    sunI: 3.6,
    hemiSky: '#a2a8d0',
    hemiGround: '#8e6a4c',
    hemiI: 0.7,
    zenith: '#4a6eb0',
    horizon: '#f4bc86',
    ground: '#b99f8c',
    glow: '#ff9850',
    glowI: 0.95,
    fog: '#e2c0a0',
    exposure: 1.32,
    cloudLit: '#ffc08a',
    cloudShade: '#988aae',
    stars: 0,
    env: 0.42,
    bloom: 0.55,
    cyc: '#e4b88e',
  },
  {
    h: 19.3,
    sun: '#ff7a46',
    sunI: 2.1,
    hemiSky: '#7f7fb6',
    hemiGround: '#6a4a40',
    hemiI: 0.72,
    zenith: '#3a5090',
    horizon: '#f09c72',
    ground: '#8f7682',
    glow: '#ff6c42',
    glowI: 1.0,
    fog: '#c99e92',
    exposure: 1.3,
    cloudLit: '#ff9e82',
    cloudShade: '#7a6a9a',
    stars: 0,
    env: 0.48,
    bloom: 0.7,
    cyc: '#c4927e',
  },
  {
    // afterglow (no direct light: the sky carries the scene)
    h: 19.8,
    sun: '#9aa2d8',
    sunI: 0.25,
    hemiSky: '#5a5f96',
    hemiGround: '#3a3240',
    hemiI: 0.66,
    zenith: '#24336e',
    horizon: '#c47c88',
    ground: '#4a4058',
    glow: '#e0627a',
    glowI: 0.7,
    fog: '#62567a',
    exposure: 1.16,
    cloudLit: '#d08ca2',
    cloudShade: '#4c4a72',
    stars: 0.2,
    env: 0.52,
    bloom: 0.85,
    cyc: '#5a5076',
  },
  {
    // blue hour
    h: 20.3,
    sun: '#9caee0',
    sunI: 0.36,
    hemiSky: '#41507c',
    hemiGround: '#2a2834',
    hemiI: 0.6,
    zenith: '#111d48',
    horizon: '#44548a',
    ground: '#20263f',
    glow: '#7a5c8c',
    glowI: 0.35,
    fog: '#283258',
    exposure: 1.14,
    cloudLit: '#7480aa',
    cloudShade: '#30385a',
    stars: 0.6,
    env: 0.46,
    bloom: 0.95,
    cyc: '#232b4c',
  },
  { h: 21.3, ...NIGHT },
  { h: 24, ...NIGHT },
];

// ───────────────────────────────────────────── world key (default world mode) ──
// The studio key's light (sun-dominated, cool fill, golden hour — a little more golden, less red: low
// sunlight is ~3500 K, the red-orange key turned grey pavement salmon) with a real sky: deeper blue zenith,
// a paler, slightly hazier horizon band, and the atmosphere's haze / mist per hour (aerial
// perspective: aerosol at noon ≈ 4.5e-5/m (+ blue air, see sky/atmoDrive.ts), golden hour 1–1.5e-4, misty dawn).
const WORLD_OVERRIDES: Record<string, Partial<KeyDef>> = {
  '0': { haze: 6e-5, mist: 1.0e-3, mistH: 6 },
  '4.6': { haze: 8e-5, mist: 1.6e-3, mistH: 7 },
  '5.3': { haze: 1.3e-4, mist: 3.5e-3, mistH: 9 },
  '6': { haze: 1.6e-4, mist: 4.5e-3, mistH: 11 },
  '6.7': { haze: 1.4e-4, mist: 3.0e-3, mistH: 13, zenith: '#4f7cc0' },
  '7.8': { haze: 9e-5, mist: 0.8e-3, mistH: 14, zenith: '#4d86cc', horizon: '#cfdde8' },
  '10': { haze: 5e-5, mist: 0, zenith: '#3f7ccb', horizon: '#c6d9e8' },
  '12.75': { haze: 4.5e-5, mist: 0, zenith: '#3877c8', horizon: '#c4d8e8' },
  '16': { haze: 5.5e-5, mist: 0, zenith: '#3d79c4', horizon: '#cfdbe4' },
  '17.6': { haze: 6.5e-5, mist: 0, zenith: '#4474bb', sun: '#ffd09a', exposure: 1.16, hemiSky: '#a2b4da', hemiGround: '#8c7a64' },
  '18.6': { haze: 9e-5, mist: 0.3e-3, mistH: 6, zenith: '#3f62a8', sun: '#ffb46c', exposure: 1.2, hemiSky: '#96a7d8', hemiGround: '#84705e' },
  '19.3': { haze: 1.1e-4, mist: 0.7e-3, mistH: 6, sun: '#ff9256', exposure: 1.22 },
  '19.8': { haze: 1.4e-4, mist: 1.1e-3, mistH: 6 },
  '20.3': { haze: 1.1e-4, mist: 1.3e-3, mistH: 6 },
  '21.3': { haze: 7e-5, mist: 1.1e-3, mistH: 6 },
  '24': { haze: 6e-5, mist: 1.0e-3, mistH: 6 },
};
const WORLD_KEYS: KeyDef[] = KEYS.map((k) => ({ ...k, ...(WORLD_OVERRIDES[String(k.h)] ?? {}) }));

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
  cyc = new THREE.Color();
  haze = 1.2e-4;
  mist = 0;
  mistH = 10;
}

type ColorKey = 'sun' | 'hemiSky' | 'hemiGround' | 'zenith' | 'horizon' | 'ground' | 'glow' | 'fog' | 'cloudLit' | 'cloudShade' | 'cyc';
type NumKey = 'sunI' | 'hemiI' | 'glowI' | 'exposure' | 'stars' | 'env' | 'bloom' | 'haze' | 'mist' | 'mistH';
const COLOR_KEYS: ColorKey[] = ['sun', 'hemiSky', 'hemiGround', 'zenith', 'horizon', 'ground', 'glow', 'fog', 'cloudLit', 'cloudShade', 'cyc'];
const NUM_KEYS: NumKey[] = ['sunI', 'hemiI', 'glowI', 'exposure', 'stars', 'env', 'bloom', 'haze', 'mist', 'mistH'];
const NUM_DEFAULTS: Partial<Record<NumKey, number>> = { haze: 1.2e-4, mist: 0, mistH: 10 };

interface LinearKey {
  h: number;
  colors: Record<ColorKey, THREE.Color>;
  nums: Record<NumKey, number>;
}

function linearize(keys: KeyDef[]): LinearKey[] {
  return keys.map((k) => {
    const colors = {} as Record<ColorKey, THREE.Color>;
    for (const c of COLOR_KEYS) colors[c] = new THREE.Color(c === 'cyc' ? (k.cyc ?? k.ground) : k[c]); // sRGB hex → linear working space
    const nums = {} as Record<NumKey, number>;
    for (const n of NUM_KEYS) nums[n] = k[n] ?? NUM_DEFAULTS[n] ?? 0;
    return { h: k.h, colors, nums };
  });
}

const LINEAR = linearize(WORLD_MODE ? WORLD_KEYS : KEYS);
const LINEAR_LEGACY = linearize(LEGACY_KEYS);

/**
 * Sample the palette at `hours` (0..24) into `out`. Smooth (C1) between keys. `legacy` = the original
 * rig; otherwise the world key (default) or the studio key (?diorama).
 */
export function samplePalette(hours: number, out: SkyState, legacy = false): SkyState {
  const keys = legacy ? LINEAR_LEGACY : LINEAR;
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].h <= h) i++;
  const a = keys[i],
    b = keys[i + 1];
  let t = (h - a.h) / Math.max(1e-6, b.h - a.h);
  t = Math.min(1, Math.max(0, t));
  t = t * t * (3 - 2 * t);
  for (const c of COLOR_KEYS) (out[c] as THREE.Color).copy(a.colors[c]).lerp(b.colors[c], t);
  for (const n of NUM_KEYS) out[n] = a.nums[n] + (b.nums[n] - a.nums[n]) * t;
  return out;
}
