// Procedural street-furniture models, emitted straight into the merged props sink.
// Local frame: origin on the ground at the prop's centre, +Y up, +Z = the prop's front
// (for street slots: away from the road, i.e. towards the pedestrians); street-lamp arms
// reach towards -Z (over the road).
//
// Extras on the sink: #0 aRM (roughness, metalness), #1 aEmit (rgb * strength, mode).

import * as THREE from 'three';
import { GeoSink, Shaper } from '../vegetation/geo';
import type { Rng } from '../../core/rng';
import type { LampStyle } from './layout';

export const MAT = {
  paint: [0.5, 0.25],
  iron: [0.45, 0.4],
  steel: [0.32, 0.65],
  wood: [0.82, 0],
  stone: [0.88, 0],
  plastic: [0.45, 0],
  glass: [0.12, 0.1],
  rubber: [0.92, 0],
  ceramic: [0.35, 0],
} as const;

type MatKey = keyof typeof MAT;

const _c = new THREE.Color();

/** Context passed to every builder. */
export class Kit {
  readonly sh: Shaper;
  readonly s: GeoSink;
  constructor(sink: GeoSink) {
    this.s = sink;
    this.sh = new Shaper(sink);
  }
  /** set colour + material (and clear emission) */
  m(color: THREE.ColorRepresentation, mat: MatKey = 'paint'): Shaper {
    this.s.color(color);
    const rm = MAT[mat];
    this.s.setEx(0, rm[0], rm[1]);
    this.s.setEx(1, 0, 0, 0, 0);
    return this.sh;
  }
  /** emissive (lit at night, or always when mode = 1) */
  e(color: THREE.ColorRepresentation, glow: THREE.ColorRepresentation, k: number, mode = 0): Shaper {
    this.s.color(color);
    this.s.setEx(0, MAT.glass[0], MAT.glass[1]);
    _c.set(glow);
    this.s.setEx(1, _c.r * k, _c.g * k, _c.b * k, mode);
    return this.sh;
  }
}

// ──────────────────────────────────────────────────────────────── lamps ──

export interface LampHead {
  /** local head position (light source) */
  x: number;
  y: number;
  z: number;
  color: string;
  pool: number;
  halo: number;
}

export const LAMP_COL = {
  warm: '#ffc979',
  white: '#fff1d6',
  sodium: '#ffb35c',
};

/** Build a lamp of the given style at the current frame; returns the light head (local). */
export function lamp(k: Kit, style: LampStyle, street: boolean, rng: Rng): LampHead {
  const sh = k.sh;
  switch (style) {
    case 'modern': {
      k.m('#3b4046', 'paint');
      sh.box(0, 0.06, 0, 0.36, 0.12, 0.36, 1);
      k.m('#4c535b', 'paint');
      sh.cyl(0, 0.12, 0, 0.085, 0.06, 6.9, 6, 0);
      const reach = street ? 1.75 : 0.6;
      sh.beam(0, 6.94, 0.02, 0, 7.06, -reach, 0.09, 0.08);
      k.m('#3a3f45', 'paint');
      sh.box(0, 7.05, -reach - 0.3, 0.34, 0.13, 0.95, 0);
      k.e('#e9eef2', LAMP_COL.white, 3.2);
      sh.box(0, 6.975, -reach - 0.3, 0.26, 0.02, 0.8, 2);
      return { x: 0, y: 6.9, z: -reach - 0.3, color: LAMP_COL.white, pool: 5.6, halo: 0.95 };
    }
    case 'simple': {
      k.m('#9aa3a8', 'steel');
      sh.cyl(0, 0, 0, 0.11, 0.07, 6.35, 6, 0);
      sh.tube(0, 6.3, 0, 0, 6.58, -0.55, 0.05, 0.045, 5);
      sh.tube(0, 6.58, -0.55, 0, 6.66, -1.3, 0.045, 0.04, 5);
      k.m('#8a9399', 'paint');
      sh.ellipsoid(0, 6.64, -1.58, 0.21, 0.11, 0.4, 0);
      k.e('#ffe3b8', LAMP_COL.sodium, 3.4);
      sh.ellipsoid(0, 6.56, -1.6, 0.15, 0.045, 0.29, 0);
      return { x: 0, y: 6.5, z: -1.6, color: LAMP_COL.sodium, pool: 5.4, halo: 0.95 };
    }
    case 'suburb': {
      k.m('#3e4448', 'paint');
      sh.cyl(0, 0, 0, 0.13, 0.11, 0.35, 6, 2);
      sh.cyl(0, 0.35, 0, 0.075, 0.055, 4.75, 6, 0);
      sh.tube(0, 5.0, 0, 0, 5.22, -0.32, 0.04, 0.035, 5);
      sh.tube(0, 5.22, -0.32, 0, 5.2, -0.72, 0.035, 0.035, 5);
      k.m('#2f3437', 'paint');
      sh.cone(0, 5.0, -0.78, 0.33, 0.3, 8, true);
      k.e('#fff1d6', LAMP_COL.warm, 3.0);
      sh.ellipsoid(0, 4.95, -0.78, 0.15, 0.12, 0.15, 0);
      return { x: 0, y: 4.9, z: -0.78, color: LAMP_COL.warm, pool: 4.6, halo: 0.85 };
    }
    case 'beach': {
      k.m('#f1efe8', 'paint');
      sh.cyl(0, 0, 0, 0.11, 0.09, 0.3, 6, 2);
      sh.cyl(0, 0.3, 0, 0.075, 0.06, 3.65, 6, 0);
      k.m('#2f6fa8', 'paint');
      sh.cyl(0, 1.0, 0, 0.082, 0.08, 0.16, 6, 0);
      sh.cyl(0, 3.2, 0, 0.068, 0.066, 0.12, 6, 0);
      k.m('#24476b', 'paint');
      sh.cyl(0, 3.95, 0, 0.18, 0.18, 0.06, 6, 2);
      k.e('#fff4dc', LAMP_COL.warm, 2.8);
      sh.cyl(0, 4.0, 0, 0.15, 0.15, 0.4, 6, 0);
      k.m('#24476b', 'paint');
      sh.cone(0, 4.4, 0, 0.25, 0.22, 6, true);
      sh.cone(0, 4.62, 0, 0.03, 0.1, 4, false);
      return { x: 0, y: 4.2, z: 0, color: LAMP_COL.warm, pool: 4.0, halo: 0.8 };
    }
    case 'plaza': {
      k.m('#4a5058', 'paint');
      sh.cyl(0, 0, 0, 0.1, 0.08, 0.2, 6, 2);
      sh.cyl(0, 0.2, 0, 0.065, 0.055, 3.85, 6, 0);
      k.m('#3a3f45', 'paint');
      sh.cyl(0, 4.02, 0, 0.3, 0.34, 0.1, 10, 2);
      k.e('#eef2f4', LAMP_COL.white, 2.8);
      sh.disc(0, 4.0, 0, 0.28, 10, -1);
      return { x: 0, y: 3.95, z: 0, color: LAMP_COL.white, pool: 4.2, halo: 0.75 };
    }
    default: {
      // classic cast-iron post with a lantern ('classic' streets, 'park' paths)
      const park = style === 'park';
      const s = park ? 0.86 : 1;
      const iron = rng.chance(0.5) ? '#2f4a3e' : '#2a2f33';
      k.m(iron, 'iron');
      sh.cyl(0, 0, 0, 0.24 * s, 0.2 * s, 0.5 * s, 6, 2);
      sh.cyl(0, 0.5 * s, 0, 0.15 * s, 0.11 * s, 0.14 * s, 6, 0);
      const postH = park ? 2.75 : 3.15;
      sh.cyl(0, 0.64 * s, 0, 0.075, 0.058, postH, 6, 0);
      if (!park) sh.cyl(0, 0.64 * s + postH * 0.45, 0, 0.095, 0.095, 0.07, 6, 0);
      const ty = 0.64 * s + postH;
      sh.cyl(0, ty - 0.06, 0, 0.06, 0.13, 0.2, 6, 0);
      // lantern: glass frustum + corner frames + pyramid roof + finial
      k.e('#fff1d2', LAMP_COL.warm, 3.0);
      sh.cyl(0, ty + 0.14, 0, 0.16, 0.24, 0.5, 4, 0, false, Math.PI / 4);
      k.m(iron, 'iron');
      sh.cyl(0, ty + 0.64, 0, 0.3, 0.3, 0.04, 4, 0, false, Math.PI / 4);
      sh.cone(0, ty + 0.68, 0, 0.3, 0.26, 4, false, Math.PI / 4);
      sh.cone(0, ty + 0.94, 0, 0.03, 0.16, 4, false);
      return { x: 0, y: ty + 0.4, z: 0, color: LAMP_COL.warm, pool: park ? 3.4 : 4.4, halo: park ? 0.72 : 0.85 };
    }
  }
}

// ─────────────────────────────────────────────────────────────── benches ──

/** Bench: seat top ≈ 0.46 above `y`; +Z = the direction the sitter faces. */
export function bench(k: Kit, style: 'classic' | 'modern' | 'wood', rng: Rng, legDrop = 0): void {
  const sh = k.sh;
  const L = 1.8;
  if (style === 'modern') {
    k.m('#7d868d', 'steel');
    for (const x of [-0.72, 0.72]) {
      sh.box(x, 0.21 - legDrop / 2, 0.0, 0.08, 0.42 + legDrop, 0.46, 1);
      sh.beam(x, 0.42, -0.2, x, 0.86, -0.3, 0.07, 0.06);
    }
    k.m(rng.chance(0.5) ? '#b07a4c' : '#9a6a43', 'wood');
    for (let i = 0; i < 5; i++) sh.box(0, 0.445, -0.2 + i * 0.105, L, 0.04, 0.085, 0);
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      sh.push().local(0, 0.6 + t * 0.22, -0.25 - t * 0.05, -0.2).box(0, 0, 0, L, 0.075, 0.03, 0).pop();
    }
    return;
  }
  if (style === 'wood') {
    k.m('#8a6240', 'wood');
    for (const x of [-0.75, 0.75]) {
      sh.box(x, 0.21 - legDrop / 2, 0.16, 0.1, 0.42 + legDrop, 0.1, 1);
      sh.box(x, 0.21 - legDrop / 2, -0.18, 0.1, 0.42 + legDrop, 0.1, 1);
      sh.beam(x, 0.4, -0.22, x, 0.88, -0.34, 0.09, 0.08);
    }
    k.m('#a87f58', 'wood');
    for (let i = 0; i < 4; i++) sh.box(0, 0.445, -0.18 + i * 0.12, L, 0.045, 0.1, 0);
    for (let i = 0; i < 2; i++) sh.push().local(0, 0.66 + i * 0.16, -0.28 - i * 0.035, -0.22).box(0, 0, 0, L, 0.1, 0.035, 0).pop();
    return;
  }
  // classic: cast-iron ends, painted or natural slats
  const iron = '#2a2d2e';
  k.m(iron, 'iron');
  for (const x of [-0.84, 0.84]) {
    sh.box(x, 0.21 - legDrop / 2, 0.19, 0.06, 0.42 + legDrop, 0.06, 1);
    sh.beam(x, -legDrop, -0.17, x, 0.88, -0.32, 0.06, 0.06);
    sh.box(x, 0.41, 0.0, 0.06, 0.05, 0.46, 0);
    sh.box(x, 0.64, 0.03, 0.07, 0.04, 0.42, 0);
    sh.beam(x, 0.42, 0.2, x, 0.64, 0.2, 0.05, 0.05, false);
  }
  const slat = rng.chance(0.45) ? '#3f6b4b' : rng.chance(0.5) ? '#a0704a' : '#8f5f3d';
  k.m(slat, slat === '#3f6b4b' ? 'paint' : 'wood');
  for (let i = 0; i < 4; i++) sh.box(0, 0.45, -0.17 + i * 0.12, L - 0.06, 0.035, 0.095, 0);
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    sh.push().local(0, 0.58 + t * 0.24, -0.25 - t * 0.055, -0.22).box(0, 0, 0, L - 0.06, 0.08, 0.03, 0).pop();
  }
}

// ─────────────────────────────────────────────────────────────── small props ──

export function bin(k: Kit, modern: boolean): void {
  const sh = k.sh;
  if (modern) {
    k.m('#8d969c', 'steel');
    sh.box(0, 0.45, 0, 0.42, 0.9, 0.42, 1);
    k.m('#2b2f33', 'paint');
    sh.box(0, 0.78, 0.212, 0.26, 0.08, 0.01, 0);
    k.m('#5a646b', 'steel');
    sh.box(0, 0.915, 0, 0.46, 0.03, 0.46, 0);
    return;
  }
  k.m('#2f5240', 'paint');
  sh.cyl(0, 0, 0, 0.23, 0.25, 0.82, 10, 0);
  k.m('#24402f', 'paint');
  sh.cyl(0, 0.82, 0, 0.27, 0.27, 0.05, 10, 0);
  sh.cone(0, 0.87, 0, 0.27, 0.12, 10, false);
  k.m('#c9b26a', 'iron');
  sh.cyl(0, 0.5, 0, 0.255, 0.255, 0.04, 10, 0);
}

export function hydrant(k: Kit, yellow: boolean): void {
  const sh = k.sh;
  const body = yellow ? '#e3b23c' : '#c8352b';
  k.m('#5a5f63', 'iron');
  sh.cyl(0, 0, 0, 0.16, 0.16, 0.06, 8, 2);
  k.m(body, 'paint');
  sh.cyl(0, 0.06, 0, 0.11, 0.105, 0.5, 8, 0);
  sh.cyl(0, 0.56, 0, 0.13, 0.13, 0.05, 8, 2);
  sh.ellipsoid(0, 0.61, 0, 0.115, 0.1, 0.115, 0);
  k.m('#e8e4da', 'paint');
  sh.cyl(0, 0.69, 0, 0.035, 0.035, 0.06, 6, 2);
  k.m(body, 'paint');
  sh.tube(-0.08, 0.38, 0, -0.19, 0.38, 0, 0.045, 0.045, 6, true);
  sh.tube(0.08, 0.38, 0, 0.19, 0.38, 0, 0.045, 0.045, 6, true);
  sh.tube(0, 0.33, 0.08, 0, 0.33, 0.2, 0.06, 0.06, 6, true);
}

export function mailbox(k: Kit): void {
  const sh = k.sh;
  k.m('#222426', 'paint');
  sh.cyl(0, 0, 0, 0.26, 0.26, 0.08, 10, 2);
  k.m('#c8262c', 'paint');
  sh.cyl(0, 0.08, 0, 0.22, 0.22, 1.05, 10, 0);
  sh.cyl(0, 1.13, 0, 0.25, 0.25, 0.05, 10, 0);
  sh.ellipsoid(0, 1.18, 0, 0.24, 0.13, 0.24, 0);
  k.m('#141414', 'paint');
  sh.box(0, 0.98, 0.215, 0.22, 0.035, 0.02, 0);
  k.m('#ece8de', 'paint');
  sh.box(0, 0.74, 0.218, 0.14, 0.17, 0.012, 0);
  k.m('#d8b04a', 'iron');
  sh.box(0, 1.08, 0.22, 0.1, 0.05, 0.01, 0);
}

export function phonebox(k: Kit): void {
  const sh = k.sh;
  const red = '#c4282d';
  k.m(red, 'paint');
  sh.box(0, 0.07, 0, 1.0, 0.14, 1.0, 1);
  for (const [x, z] of [
    [-0.43, -0.43],
    [0.43, -0.43],
    [0.43, 0.43],
    [-0.43, 0.43],
  ]) sh.box(x, 1.25, z, 0.11, 2.2, 0.11, 1);
  // four sides: kick panel, glazing with glazing bars, sign band
  for (let side = 0; side < 4; side++) {
    sh.push().local(0, 0, 0, 0, (side * Math.PI) / 2);
    k.m(red, 'paint');
    sh.box(0, 0.32, 0.43, 0.76, 0.36, 0.06, 1);
    k.e('#cfdde0', '#ffd9a0', 0.55);
    sh.box(0, 1.33, 0.425, 0.76, 1.66, 0.03, 0);
    k.m(red, 'paint');
    for (const y of [0.92, 1.33, 1.74]) sh.box(0, y, 0.445, 0.76, 0.035, 0.03, 0);
    sh.box(0, 1.33, 0.445, 0.035, 1.66, 0.03, 0);
    k.m(red, 'paint');
    sh.box(0, 2.08, 0.44, 0.84, 0.08, 0.06, 0);
    k.e('#f4f1e8', '#fff1d6', 1.6);
    sh.box(0, 2.21, 0.45, 0.64, 0.12, 0.02, 0);
    sh.pop();
  }
  k.m(red, 'paint');
  sh.box(0, 2.34, 0, 1.06, 0.12, 1.06, 0);
  sh.ellipsoid(0, 2.4, 0, 0.53, 0.16, 0.53, 1);
  k.m('#d6b24e', 'iron');
  sh.box(0, 2.58, 0, 0.12, 0.07, 0.12, 0);
}

export function newsstand(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const body = rng.pick(['#2f6b4f', '#2b5d7a', '#7a2f35']);
  k.m(body, 'paint');
  sh.box(0, 1.1, -0.05, 1.8, 2.2, 1.1, 1);
  sh.box(0, 2.27, 0.08, 2.15, 0.12, 1.55, 0);
  k.m('#3b2f28', 'wood');
  sh.box(0, 1.35, 0.5, 1.4, 0.75, 0.02, 0);
  k.m('#d8cfbd', 'wood');
  sh.box(0, 0.94, 0.62, 1.6, 0.06, 0.28, 0);
  // magazine racks on both sides and the counter
  const cols = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#f1faee', '#8d6cab', '#e8649a'];
  for (const sx of [-1, 1]) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        k.m(rng.pick(cols), 'plastic');
        sh.box(sx * 0.915, 0.6 + r * 0.42, -0.4 + c * 0.32, 0.02, 0.3, 0.22, 0);
      }
    }
  }
  for (let c = 0; c < 6; c++) {
    k.m(rng.pick(cols), 'plastic');
    sh.push().local(-0.62 + c * 0.25, 0.99, 0.62, -1.2).box(0, 0, 0, 0.2, 0.26, 0.015, 0).pop();
  }
  // sign board, lit at night
  k.e('#f2ead6', '#ffe2a8', 1.4);
  sh.box(0, 2.48, 0.58, 1.3, 0.24, 0.05, 0);
  k.m('#c43b33', 'paint');
  sh.box(0, 2.48, 0.61, 0.5, 0.1, 0.01, 0);
}

export function planterBox(k: Kit, kind: 'concrete' | 'terracotta' | 'wood' | 'steel', along: number, across: number, h: number): void {
  const sh = k.sh;
  switch (kind) {
    case 'terracotta':
      k.m('#b8643f', 'ceramic');
      break;
    case 'wood':
      k.m('#8a6240', 'wood');
      break;
    case 'steel':
      k.m('#4b5a52', 'paint');
      break;
    default:
      k.m('#c4beb3', 'stone');
  }
  sh.box(0, h / 2, 0, along, h, across, 1);
  k.m(kind === 'terracotta' ? '#a2553a' : kind === 'wood' ? '#9d7149' : kind === 'steel' ? '#3c4a43' : '#d5cfc4', kind === 'terracotta' ? 'ceramic' : kind === 'wood' ? 'wood' : 'stone');
  sh.box(0, h + 0.015, 0, along + 0.06, 0.03, across + 0.06, 3);
  k.m('#4e3828', 'stone');
  sh.box(0, h - 0.07, 0, along - 0.1, 0.02, across - 0.1, 3);
}

export function bollard(k: Kit, style: 'steel' | 'stone'): void {
  const sh = k.sh;
  if (style === 'stone') {
    k.m('#cfc6b4', 'stone');
    sh.cyl(0, 0, 0, 0.16, 0.13, 0.6, 8, 0);
    sh.ellipsoid(0, 0.6, 0, 0.13, 0.08, 0.13, 0);
    return;
  }
  k.m('#3a3f44', 'paint');
  sh.cyl(0, 0, 0, 0.09, 0.085, 0.86, 8, 2);
  k.m('#e8e6df', 'paint');
  sh.cyl(0, 0.68, 0, 0.092, 0.092, 0.07, 8, 0);
}

// ───────────────────────────────────────────────────────── bike rack ──

const BIKE_COLS = ['#e63946', '#2a9d8f', '#457b9d', '#e9c46a', '#264653', '#f1faee', '#8d6cab', '#f4a261', '#3d5a80'];

/** Steel hoops along local x (parallel to the curb) with 0-3 bikes leaning on them. */
export function bikeRack(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const hoops = [-0.9, 0, 0.9];
  k.m('#9aa3a8', 'steel');
  for (const x of hoops) {
    sh.tube(x - 0.32, 0, 0, x - 0.32, 0.62, 0, 0.025, 0.025, 5);
    sh.tube(x + 0.32, 0, 0, x + 0.32, 0.62, 0, 0.025, 0.025, 5);
    sh.tube(x - 0.32, 0.62, 0, x - 0.22, 0.74, 0, 0.025, 0.025, 5);
    sh.tube(x - 0.22, 0.74, 0, x + 0.22, 0.74, 0, 0.025, 0.025, 5);
    sh.tube(x + 0.22, 0.74, 0, x + 0.32, 0.62, 0, 0.025, 0.025, 5);
  }
  const n = rng.int(0, 3);
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    const h = rng.int(0, 2);
    if (used.has(h)) continue;
    used.add(h);
    const side = rng.chance(0.5) ? 1 : -1;
    sh.push().local(hoops[h], 0, side * 0.2, rng.range(-0.05, 0.05) * side, rng.chance(0.5) ? 0 : Math.PI, 0.08 * side);
    bike(k, rng.pick(BIKE_COLS));
    sh.pop();
  }
}

/** Bicycle along local x (front wheel at +x), wheels touching y = 0. */
export function bike(k: Kit, color: string): void {
  const sh = k.sh;
  const r = 0.33;
  // wheels: discs with axis along z
  for (const x of [-0.52, 0.52]) {
    sh.push().local(x, r, -0.02, Math.PI / 2, 0, 0);
    k.m('#1e1f21', 'rubber');
    sh.cyl(0, 0, 0, r, r, 0.04, 12, 3, true);
    k.m('#b8bec2', 'steel');
    sh.cyl(0, -0.005, 0, r * 0.82, r * 0.82, 0.05, 8, 3, false);
    sh.pop();
  }
  const R = [-0.52, r],
    C = [-0.02, 0.3],
    S = [-0.17, 0.82],
    Hd = [0.36, 0.84],
    F = [0.52, r];
  k.m(color, 'paint');
  const bar = (a: number[], b: number[], w = 0.035) => sh.beam(a[0], a[1], 0, b[0], b[1], 0, w, w, false);
  bar(R, C);
  bar(C, S);
  bar(R, S);
  bar(C, Hd, 0.04);
  bar(S, [Hd[0] - 0.04, Hd[1] - 0.02]);
  bar(Hd, F, 0.03);
  k.m('#2a2a2a', 'plastic');
  sh.box(S[0] - 0.02, S[1] + 0.07, 0, 0.22, 0.045, 0.09, 0);
  sh.beam(Hd[0], Hd[1] + 0.1, -0.24, Hd[0], Hd[1] + 0.1, 0.24, 0.03, 0.03);
  k.m(color, 'paint');
  sh.beam(Hd[0], Hd[1], 0, Hd[0], Hd[1] + 0.1, 0, 0.035, 0.035, false);
}

// ─────────────────────────────────────────────────────────── bus shelter ──

/**
 * Glass bus shelter. Local +Z away from the road: the glass back panel stands on the pavement side
 * (z = +0.78) and the shelter opens towards the road (z = -0.28), so people on the bench face the kerb and
 * see the bus coming. Local +X = direction of travel: the stop pole (front of the bus) is at x = +2.45.
 * Glass panes go to the `glass` kit.
 */
export function busShelter(k: Kit, g: Kit, routeColor: string, rng: Rng): { glows: { x: number; y: number; z: number; size: number }[] } {
  const sh = k.sh;
  const gs = g.sh;
  const L = 3.8,
    zf = -0.28, // open front (road side)
    zb = 0.78, // glass back (pavement side)
    H = 2.45;
  const frame = '#3c4247';
  k.m(frame, 'paint');
  for (const x of [-L / 2, L / 2]) {
    sh.box(x, H / 2, zb, 0.08, H, 0.08, 1);
    sh.box(x, H / 2, zf + 0.12, 0.07, H, 0.07, 1);
  }
  sh.box(0, H - 0.04, zb, L, 0.08, 0.08, 0);
  sh.box(0, 0.12, zb, L, 0.06, 0.06, 0);
  // roof (slight slope down towards the road) + route-coloured fascia and lit strip along the open front
  sh.push().local(0, H + 0.06, (zf + zb) / 2 - 0.05, -0.05);
  k.m('#d4dce0', 'paint');
  sh.box(0, 0, 0, L + 0.3, 0.07, zb - zf + 0.45, 0);
  k.m('#4a5157', 'steel');
  sh.box(0, -0.055, 0, L + 0.34, 0.05, zb - zf + 0.49, 2);
  k.m(routeColor, 'paint');
  sh.box(0, 0.0, -(zb - zf + 0.45) / 2 - 0.005, L + 0.3, 0.09, 0.01, 0);
  k.e('#f6f2e8', '#fff1d6', 1.6);
  sh.box(0, -0.055, -(zb - zf) / 2 + 0.05, L - 0.2, 0.02, 0.08, 2);
  sh.pop();
  // glass back panel + one glass end
  g.m('#cfe3ea', 'glass');
  gs.box(0, 1.3, zb, L - 0.1, 2.15, 0.03, 0);
  gs.box(-L / 2, 1.3, (zf + 0.12 + zb) / 2, 0.03, 2.15, zb - zf - 0.15, 0);
  // advertising panel at the other end (lit at night) — poster on both faces
  k.m(frame, 'paint');
  sh.box(L / 2, 1.25, (zf + 0.12 + zb) / 2, 0.12, 2.0, zb - zf - 0.12, 1);
  const poster = rng.pick(['#e9c46a', '#2a9d8f', '#e76f51', '#8d6cab', '#f4a261']);
  for (const sx of [-1, 1]) {
    k.e(poster, '#fff3dc', 1.2);
    sh.box(L / 2 + sx * 0.065, 1.3, (zf + 0.12 + zb) / 2, 0.01, 1.6, zb - zf - 0.3, 0);
    k.e('#f4efe4', '#fff3dc', 1.2);
    sh.box(L / 2 + sx * 0.07, 1.62, (zf + 0.12 + zb) / 2, 0.012, 0.5, zb - zf - 0.42, 0);
  }
  // bench along the glass back, facing the road (-Z)
  k.m('#7d868d', 'steel');
  for (const x of [-1.2, 1.2]) sh.box(x, 0.22, zb - 0.25, 0.06, 0.44, 0.06, 1);
  k.m('#9a6a43', 'wood');
  sh.box(0, 0.46, zb - 0.25, 2.6, 0.04, 0.34, 0);
  // stop pole with the route-coloured sign, at the kerb in front of the advertising end
  const px = L / 2 + 0.55,
    pz = zf;
  k.m('#7f878d', 'steel');
  sh.cyl(px, 0, pz, 0.045, 0.04, 2.95, 6, 2);
  k.m(routeColor, 'paint');
  sh.push().local(px, 2.62, pz, 0, 0, Math.PI / 2);
  sh.cyl(0, -0.03, 0, 0.27, 0.27, 0.06, 14, 3, false);
  sh.pop();
  k.e('#f7f4ec', '#ffffff', 0.5);
  sh.box(px + 0.032, 2.62, pz, 0.012, 0.12, 0.2, 0);
  sh.box(px - 0.032, 2.62, pz, 0.012, 0.12, 0.2, 0);
  k.m('#e8e3d6', 'paint');
  sh.box(px, 1.9, pz + 0.05, 0.3, 0.42, 0.04, 0);
  return { glows: [{ x: 0, y: 0.17, z: (zf + zb) / 2, size: 2.6 }] };
}

// ─────────────────────────────────────────────────────── fences & walls ──

export const FENCE_PAINT = ['#f3efe6', '#f3efe6', '#ece4d2', '#c9dae2', '#d6e2c4', '#efdcc4'];

/** Picket fence from local (0,0,0) to (L,0,0) along +x. Optional end posts (gates). */
export function picketFence(k: Kit, L: number, paint: string, postA: boolean, postB: boolean): void {
  const sh = k.sh;
  k.m(paint, 'paint');
  const H = 0.92;
  const nPosts = Math.max(1, Math.round(L / 1.9));
  for (let i = 0; i <= nPosts; i++) {
    const x = (i / nPosts) * L;
    const gate = (i === 0 && postA) || (i === nPosts && postB);
    sh.box(x, (gate ? 1.12 : 1.0) / 2, 0, gate ? 0.11 : 0.08, gate ? 1.12 : 1.0, gate ? 0.11 : 0.08, 1);
    if (gate) sh.box(x, 1.16, 0, 0.14, 0.04, 0.14, 0);
  }
  sh.box(L / 2, 0.3, -0.035, L, 0.06, 0.03, 0);
  sh.box(L / 2, 0.72, -0.035, L, 0.06, 0.03, 0);
  const n = Math.floor(L / 0.19);
  const off = (L - (n - 1) * 0.19) / 2;
  const sk = k.s;
  for (let i = 0; i < n; i++) {
    const x = off + i * 0.19;
    // flat pointed board, front and back faces (5 + 5 verts, 3 + 3 tris)
    for (const side of [1, -1]) {
      const z = side * 0.012;
      const a = sh.v(x - 0.0425, 0.04, z, 0, 0, side),
        b = sh.v(x + 0.0425, 0.04, z, 0, 0, side),
        c = sh.v(x + 0.0425, H - 0.02, z, 0, 0, side),
        d = sh.v(x, H + 0.055, z, 0, 0, side),
        e = sh.v(x - 0.0425, H - 0.02, z, 0, 0, side);
      if (side > 0) {
        sk.tri(a, b, c);
        sk.tri(a, c, e);
        sk.tri(e, c, d);
      } else {
        sk.tri(a, c, b);
        sk.tri(a, e, c);
        sk.tri(e, d, c);
      }
    }
  }
}

/** Low garden wall along +x with coping and end pillars. */
export function lowWall(k: Kit, L: number, brick: boolean, postA: boolean, postB: boolean): void {
  const sh = k.sh;
  const body = brick ? '#a65d43' : '#cdbf9f';
  const cap = brick ? '#d9cfbd' : '#e2d8c3';
  k.m(body, 'stone');
  sh.box(L / 2, 0.29, 0, L, 0.58, 0.3, 1);
  k.m(cap, 'stone');
  sh.box(L / 2, 0.61, 0, L + 0.04, 0.06, 0.36, 0);
  for (const [x, on] of [
    [0, postA],
    [L, postB],
  ] as [number, boolean][]) {
    if (!on) continue;
    k.m(body, 'stone');
    sh.box(x, 0.39, 0, 0.42, 0.78, 0.42, 1);
    k.m(cap, 'stone');
    sh.box(x, 0.81, 0, 0.48, 0.06, 0.48, 0);
    sh.ellipsoid(x, 0.86, 0, 0.12, 0.1, 0.12, 0);
  }
}

// ──────────────────────────────────────────────────────────── allotments ──

const SHED_PAINT = ['#5f8f6a', '#4f7ea0', '#a54a3c', '#8a6a48', '#c9a24a'];

export function shed(k: Kit, paint: number, rng: Rng): void {
  const sh = k.sh;
  const W = 1.9,
    D = 1.5,
    H0 = 1.95,
    H1 = 2.3;
  const col = SHED_PAINT[paint % SHED_PAINT.length];
  k.m(col, 'wood');
  sh.box(0, H0 / 2, 0, W, H0, D, 1);
  // single-pitch roof (high at the back)
  sh.push().local(0, (H0 + H1) / 2 + 0.05, 0, Math.atan2(H1 - H0, D));
  k.m('#3b3a38', 'stone');
  sh.box(0, 0, 0, W + 0.25, 0.07, D / Math.cos(Math.atan2(H1 - H0, D)) + 0.25, 0);
  sh.pop();
  k.m(col, 'wood');
  sh.box(0, (H0 + H1) / 2 - 0.15, -D / 2, W, H1 - H0 + 0.3, 0.04, 0);
  // door, window, little bench of pots
  k.m('#efe8d8', 'paint');
  sh.box(-0.4, 0.92, D / 2 + 0.01, 0.72, 1.7, 0.03, 0);
  k.m('#6b5236', 'wood');
  sh.box(-0.4, 0.92, D / 2 + 0.02, 0.62, 1.6, 0.02, 0);
  k.e('#9fb4bd', '#ffd59a', 0.25);
  sh.box(0.48, 1.35, D / 2 + 0.01, 0.5, 0.4, 0.02, 0);
  k.m('#b8643f', 'ceramic');
  for (let i = 0; i < rng.int(1, 3); i++) sh.cyl(0.25 + i * 0.25, 0, D / 2 + 0.3, 0.09, 0.12, 0.22, 6, 2);
}

export function waterButt(k: Kit, rng: Rng): void {
  const sh = k.sh;
  k.m(rng.chance(0.5) ? '#3f6e4a' : '#3a5f7d', 'plastic');
  sh.cyl(0, 0, 0, 0.3, 0.33, 0.85, 10, 2);
  k.m('#2c2f2e', 'plastic');
  sh.cyl(0, 0.85, 0, 0.32, 0.32, 0.04, 10, 2);
}
