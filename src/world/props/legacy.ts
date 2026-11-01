// The pre-"real things" street furniture (plain boxes and cylinders): kept as the low-quality tier and the
// ?nopropdetail toggle (cost comparison). Same local frames and footprints as the real builders in furniture.ts.

import type { Kit } from './furniture';
import type { Rng } from '../../core/rng';

export function binSimple(k: Kit, modern: boolean): void {
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

export function phoneboxSimple(k: Kit): void {
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

export function newsstandSimple(k: Kit, rng: Rng): void {
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

export function planterBoxSimple(k: Kit, kind: 'concrete' | 'terracotta' | 'wood' | 'steel', along: number, across: number, h: number): void {
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

export function bollardSimple(k: Kit, style: 'steel' | 'stone'): void {
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
