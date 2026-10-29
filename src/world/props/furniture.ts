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
import { boltY, boltZ, cbox, lathe, pixelText, poly, ring } from './shapes';

export const MAT = {
  paint: [0.5, 0.25],
  iron: [0.45, 0.4],
  steel: [0.32, 0.65],
  wood: [0.82, 0],
  stone: [0.88, 0],
  /** clay brick in stretcher bond with mortar joints (props/material.ts) */
  brick: [0.936, 0],
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

/**
 * Base flange of a steel column: a square plate on the paving, four anchor nuts (near kit).
 * r = column radius at the foot.
 */
function flange(kf: Kit, r: number, col: string): void {
  const sh = kf.sh,
    w = r * 2 + 0.11;
  kf.m(col, 'steel');
  sh.box(0, 0.009, 0, w, 0.018, w, 1);
  // anchor nuts (the washers / stud ends cost more triangles than they show)
  kf.m('#6d7175', 'steel');
  const o = w / 2 - 0.028;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boltY(sh, sx * o, 0.018, sz * o, 0.012);
}

/** service hatch on a round pole (radius r at its height), facing local +Z (the footway): frame, lock, a sticker sometimes */
function hatch(kf: Kit, y: number, r: number, h: number, col: string, rng: Rng): void {
  const sh = kf.sh;
  kf.m(col, 'paint');
  sh.box(0, y, r + 0.002, r * 0.95, h, 0.008, 1);
  kf.m('#1b1d1f', 'paint');
  sh.box(0, y + h / 2 + 0.003, r + 0.002, r * 0.95, 0.006, 0.01, 1);
  sh.box(0, y - h / 2 - 0.003, r + 0.002, r * 0.95, 0.006, 0.01, 1);
  kf.m('#8c9095', 'steel');
  sh.cyl(0, y + h * 0.28, r + 0.006, 0.009, 0.009, 0.004, 8, 2, false, 0);
  // the pole number plate / a sticker
  if (rng.chance(0.6)) {
    kf.m(rng.chance(0.5) ? '#e9e4d6' : '#f2c230', 'plastic');
    sh.box(0, y + h / 2 + 0.17, r + 0.002, r * 0.9, 0.09, 0.004, 1);
    kf.m('#1c1c1c', 'plastic');
    sh.box(0, y + h / 2 + 0.17, r + 0.0045, r * 0.55, 0.035, 0.002, 1);
  }
}

/**
 * Build a lamp of the given style at the current frame; returns the light head (local).
 * `kf` (optional, framed like k) takes the near-only detail: base mouldings, flanges and bolts, hatches, lantern frames.
 */
export function lamp(k: Kit, style: LampStyle, street: boolean, rng: Rng, kf?: Kit): LampHead {
  const sh = k.sh;
  switch (style) {
    case 'modern': {
      // tapered galvanised-and-painted column on a bolted flange, a cast base shroud, outreach arm to a flat luminaire
      k.m('#3b4046', 'paint');
      sh.cyl(0, 0, 0, 0.16, 0.14, 0.32, 10, 2);
      sh.cyl(0, 0.32, 0, 0.14, 0.09, 0.06, 10, 0);
      k.m('#4c535b', 'paint');
      sh.cyl(0, 0.38, 0, 0.088, 0.06, 6.62, 10, 0);
      const reach = street ? 1.75 : 0.6;
      sh.beam(0, 6.94, 0.02, 0, 7.06, -reach, 0.09, 0.08);
      k.m('#3a3f45', 'paint');
      cbox(sh, 0, 7.05, -reach - 0.3, 0.34, 0.13, 0.95, 0.02, 0);
      k.e('#e9eef2', LAMP_COL.white, 3.2);
      sh.box(0, 6.975, -reach - 0.3, 0.26, 0.02, 0.8, 2);
      if (kf) {
        flange(kf, 0.16, '#33383d');
        hatch(kf, 0.62, 0.0865, 0.3, '#4c535b', rng);
        kf.m('#2c3035', 'paint');
        kf.sh.cyl(0, 6.9, 0, 0.075, 0.075, 0.08, 10, 2);
      }
      return { x: 0, y: 6.9, z: -reach - 0.3, color: LAMP_COL.white, pool: 5.6, halo: 0.95 };
    }
    case 'simple': {
      // galvanised swan-neck column on a bolted flange
      k.m('#9aa3a8', 'steel');
      sh.cyl(0, 0, 0, 0.11, 0.07, 6.35, 10, 0);
      sh.tube(0, 6.3, 0, 0, 6.58, -0.55, 0.05, 0.045, 8);
      sh.tube(0, 6.58, -0.55, 0, 6.66, -1.3, 0.045, 0.04, 8);
      k.m('#8a9399', 'paint');
      sh.ellipsoid(0, 6.64, -1.58, 0.21, 0.11, 0.4, 0);
      k.e('#ffe3b8', LAMP_COL.sodium, 3.4);
      sh.ellipsoid(0, 6.56, -1.6, 0.15, 0.045, 0.29, 0);
      if (kf) {
        flange(kf, 0.11, '#8f989d');
        hatch(kf, 0.7, 0.107, 0.3, '#9aa3a8', rng);
        // zinc bloom / grime at the foot of the galvanised column
        kf.m('#7d8378', 'steel');
        kf.sh.cyl(0, 0.018, 0, 0.1135, 0.1125, 0.2, 10, 0);
      }
      return { x: 0, y: 6.5, z: -1.6, color: LAMP_COL.sodium, pool: 5.4, halo: 0.95 };
    }
    case 'suburb': {
      k.m('#3e4448', 'paint');
      sh.cyl(0, 0, 0, 0.13, 0.11, 0.35, 10, 2);
      sh.cyl(0, 0.35, 0, 0.075, 0.055, 4.75, 10, 0);
      sh.tube(0, 5.0, 0, 0, 5.22, -0.32, 0.04, 0.035, 8);
      sh.tube(0, 5.22, -0.32, 0, 5.2, -0.72, 0.035, 0.035, 8);
      k.m('#2f3437', 'paint');
      sh.cone(0, 5.0, -0.78, 0.33, 0.3, 12, true);
      k.e('#fff1d6', LAMP_COL.warm, 3.0);
      sh.ellipsoid(0, 4.95, -0.78, 0.15, 0.12, 0.15, 0);
      if (kf) {
        // cast base: plinth step, bead and a collar into the column
        kf.m('#3e4448', 'paint');
        lathe(kf.sh, 0, 0, [[0, 0], [0.142, 0], [0.142, 0.03], [0.134, 0.04], [0.124, 0.33], [0.112, 0.345], [0.09, 0.37], [0.082, 0.42], [0, 0.42]], 12);
        hatch(kf, 0.2, 0.123, 0.18, '#3e4448', rng);
        kf.m('#2f3437', 'paint');
        kf.sh.cyl(0, 4.95, 0, 0.062, 0.062, 0.06, 10, 2);
      }
      return { x: 0, y: 4.9, z: -0.78, color: LAMP_COL.warm, pool: 4.6, halo: 0.85 };
    }
    case 'beach': {
      k.m('#f1efe8', 'paint');
      sh.cyl(0, 0, 0, 0.11, 0.09, 0.3, 10, 2);
      sh.cyl(0, 0.3, 0, 0.075, 0.06, 3.65, 10, 0);
      k.m('#2f6fa8', 'paint');
      sh.cyl(0, 1.0, 0, 0.082, 0.08, 0.16, 10, 0);
      sh.cyl(0, 3.2, 0, 0.068, 0.066, 0.12, 10, 0);
      k.m('#24476b', 'paint');
      sh.cyl(0, 3.95, 0, 0.18, 0.18, 0.06, 10, 2);
      k.e('#fff4dc', LAMP_COL.warm, 2.8);
      sh.cyl(0, 4.0, 0, 0.15, 0.15, 0.4, 10, 0);
      k.m('#24476b', 'paint');
      sh.cone(0, 4.4, 0, 0.25, 0.22, 10, true);
      sh.cone(0, 4.62, 0, 0.03, 0.1, 6, false);
      if (kf) {
        flange(kf, 0.11, '#d9d6cc');
        // lantern cage: four bars over the glass
        kf.m('#24476b', 'paint');
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          kf.sh.box(Math.cos(a) * 0.153, 4.2, Math.sin(a) * 0.153, 0.02, 0.4, 0.02, 3);
        }
        // salt rust weeping from the foot of the white column
        kf.m('#a8876a', 'paint');
        kf.sh.cyl(0, 0.0, 0, 0.1125, 0.1105, 0.06, 10, 0);
      }
      return { x: 0, y: 4.2, z: 0, color: LAMP_COL.warm, pool: 4.0, halo: 0.8 };
    }
    case 'plaza': {
      k.m('#4a5058', 'paint');
      sh.cyl(0, 0, 0, 0.1, 0.08, 0.2, 10, 2);
      sh.cyl(0, 0.2, 0, 0.065, 0.055, 3.85, 10, 0);
      k.m('#3a3f45', 'paint');
      sh.cyl(0, 4.02, 0, 0.3, 0.34, 0.1, 14, 2);
      k.e('#eef2f4', LAMP_COL.white, 2.8);
      sh.disc(0, 4.0, 0, 0.28, 14, -1);
      if (kf) {
        flange(kf, 0.1, '#3f454c');
        hatch(kf, 0.55, 0.0635, 0.26, '#4a5058', rng);
      }
      return { x: 0, y: 3.95, z: 0, color: LAMP_COL.white, pool: 4.2, halo: 0.75 };
    }
    default: {
      // classic cast-iron post with a lantern ('classic' streets, 'park' paths): moulded base with a door,
      // fluted shaft with collars, ladder bar under the lantern, framed glass, crowned roof with a finial
      const park = style === 'park';
      const s = park ? 0.86 : 1;
      const iron = rng.chance(0.5) ? '#2f4a3e' : '#2a2f33';
      k.m(iron, 'iron');
      sh.cyl(0, 0, 0, 0.22 * s, 0.19 * s, 0.5 * s, 8, 2, true, Math.PI / 8);
      sh.cyl(0, 0.5 * s, 0, 0.15 * s, 0.11 * s, 0.14 * s, 10, 0);
      const postH = park ? 2.75 : 3.15;
      sh.cyl(0, 0.64 * s, 0, 0.075, 0.058, postH, 10, 0);
      if (!park) sh.cyl(0, 0.64 * s + postH * 0.45, 0, 0.095, 0.095, 0.07, 10, 0);
      const ty = 0.64 * s + postH;
      sh.cyl(0, ty - 0.06, 0, 0.06, 0.13, 0.2, 10, 0);
      // ladder bar
      if (!park) {
        sh.beam(-0.32, ty - 0.32, 0, 0.32, ty - 0.32, 0, 0.035, 0.035);
        sh.ellipsoid(-0.34, ty - 0.32, 0, 0.035, 0.035, 0.035, 0);
        sh.ellipsoid(0.34, ty - 0.32, 0, 0.035, 0.035, 0.035, 0);
      }
      // lantern: glass frustum + corner frames + pyramid roof + finial
      k.e('#fff1d2', LAMP_COL.warm, 3.0);
      sh.cyl(0, ty + 0.14, 0, 0.16, 0.24, 0.5, 4, 0, false, Math.PI / 4);
      k.m(iron, 'iron');
      sh.cyl(0, ty + 0.64, 0, 0.3, 0.3, 0.04, 4, 0, false, Math.PI / 4);
      sh.cone(0, ty + 0.68, 0, 0.3, 0.26, 4, false, Math.PI / 4);
      sh.cone(0, ty + 0.94, 0, 0.03, 0.16, 6, false);
      if (kf) {
        const f = kf.sh;
        kf.m(iron, 'iron');
        // base: plinth, torus, a waisted drum with panels, cornice, then the bell into the shaft
        const b = [[0, 0], [0.252, 0], [0.252, 0.05], [0.235, 0.065], [0.238, 0.09], [0.222, 0.11], [0.212, 0.42], [0.228, 0.44], [0.228, 0.47], [0.2, 0.5], [0.158, 0.52], [0.152, 0.58], [0.118, 0.62], [0.09, 0.66], [0, 0.66]].map(([r, y]) => [r * s, y * s]);
        lathe(f, 0, 0, b, 12);
        // the access door in the base (+Z, the footway side) with a keyhole
        f.box(0, 0.27 * s, 0.214 * s, 0.17 * s, 0.24 * s, 0.012, 1);
        kf.m('#151515', 'iron');
        f.box(0, 0.3 * s, 0.221 * s, 0.012, 0.022, 0.004, 1);
        kf.m(iron, 'iron');
        // fluting: six raised ribs on the lower shaft
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          f.push().local(0, 0, 0, 0, -a, 0);
          f.box(0.073, 0.64 * s + 0.55, 0, 0.012, 1.0, 0.016, 3);
          f.pop();
        }
        // collars: a bead above the base, a ring under the capital
        ring(f, 0, 0.64 * s + 0.06, 0, 0.078, 0.014, 10);
        ring(f, 0, ty - 0.09, 0, 0.066, 0.014, 10);
        // lantern frame: corner bars, bottom and top rails, a little crown on the roof
        const lr = (y: number) => 0.16 + ((y - ty - 0.14) / 0.5) * 0.08;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const ca = Math.cos(a),
            sa = Math.sin(a);
          f.beam(ca * lr(ty + 0.14), ty + 0.14, sa * lr(ty + 0.14), ca * lr(ty + 0.64), ty + 0.64, sa * lr(ty + 0.64), 0.022, 0.022, false);
        }
        f.cyl(0, ty + 0.12, 0, 0.175, 0.175, 0.04, 4, 2, false, Math.PI / 4);
        f.cyl(0, ty + 0.6, 0, 0.255, 0.255, 0.04, 4, 0, false, Math.PI / 4);
        ring(f, 0, ty + 0.86, 0, 0.07, 0.012, 8);
      }
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
    // fixings: a base plate under each leg with four anchor bolts, a box-section rail under the slats
    for (const x of [-0.72, 0.72]) {
      sh.box(x, 0.004 - legDrop, 0.0, 0.16, 0.008, 0.52, 1);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) boltY(sh, x + sx * 0.055, 0.008 - legDrop, sz * 0.22, 0.011);
    }
    sh.box(0, 0.39, -0.03, 1.5, 0.04, 0.04, 1);
    k.m(rng.chance(0.5) ? '#b07a4c' : '#9a6a43', 'wood');
    for (let i = 0; i < 5; i++) cbox(sh, 0, 0.445, -0.2 + i * 0.105, L, 0.04, 0.085, 0.008, 0);
    // countersunk screws into the frame
    k.m('#55595c', 'steel');
    for (const x of [-0.72, 0.72]) for (let i = 0; i < 5; i++) sh.cyl(x, 0.485, -0.2 + i * 0.105, 0.007, 0.007, 0.002, 6, 2);
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
    // bearers across the leg pairs, a centre bearer and leg, galvanised angle brackets bolted to the paving
    for (const x of [-0.75, 0, 0.75]) sh.box(x, 0.37, -0.01, 0.08, 0.07, 0.48, 1);
    sh.box(0, 0.185 - legDrop / 2, -0.01, 0.09, 0.37 + legDrop, 0.09, 1);
    k.m('#9aa1a5', 'steel');
    for (const x of [-0.75, 0.75])
      for (const z of [0.16, -0.18]) {
        sh.box(x, 0.004 - legDrop, z + 0.075, 0.1, 0.008, 0.05, 1);
        sh.box(x, 0.04 - legDrop, z + 0.052, 0.1, 0.08, 0.006, 1);
        boltY(sh, x, 0.008 - legDrop, z + 0.085, 0.012);
        boltZ(sh, x, 0.045 - legDrop, z + 0.056, 0.01);
      }
    k.m('#a87f58', 'wood');
    for (let i = 0; i < 4; i++) cbox(sh, 0, 0.445, -0.18 + i * 0.12, L, 0.045, 0.1, 0.009, 0);
    k.m('#3a3a38', 'iron');
    for (const x of [-0.75, 0, 0.75]) for (let i = 0; i < 4; i++) sh.cyl(x, 0.49, -0.18 + i * 0.12, 0.008, 0.008, 0.003, 6, 2);
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
  // feet: cast pads with an anchor bolt each; a flat-iron centre bearer under the slats
  for (const x of [-0.84, 0.84])
    for (const z of [0.19, -0.17]) {
      sh.box(x, 0.006 - legDrop, z, 0.1, 0.012, 0.09, 1);
      boltY(sh, x + 0.032, 0.012 - legDrop, z, 0.01);
    }
  sh.box(0, 0.415, 0.0, 0.03, 0.035, 0.44, 0);
  sh.beam(0, 0.42, -0.2, 0, 0.82, -0.31, 0.03, 0.02, false);
  // scrolled armrests on the ends
  for (const x of [-0.84, 0.84]) {
    sh.beam(x, 0.64, 0.2, x, 0.66, -0.12, 0.05, 0.035);
    sh.cyl(x, 0.6, 0.22, 0.03, 0.03, 0.05, 8, 2);
  }
  const slat = rng.chance(0.45) ? '#3f6b4b' : rng.chance(0.5) ? '#a0704a' : '#8f5f3d';
  k.m(slat, slat === '#3f6b4b' ? 'paint' : 'wood');
  for (let i = 0; i < 4; i++) cbox(sh, 0, 0.45, -0.17 + i * 0.12, L - 0.06, 0.035, 0.095, 0.008, 0);
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    sh.push().local(0, 0.58 + t * 0.24, -0.25 - t * 0.055, -0.22);
    cbox(sh, 0, 0, 0, L - 0.06, 0.08, 0.03, 0.007, 0);
    sh.pop();
  }
  // carriage bolts where the slats sit on the iron ends
  k.m('#2a2d2e', 'iron');
  for (const x of [-0.84, 0.84]) for (let i = 0; i < 4; i++) sh.cyl(x, 0.467, -0.17 + i * 0.12, 0.011, 0.008, 0.006, 6, 2);
}

// ─────────────────────────────────────────────────────────────── small props ──

/**
 * Litter bin. modern: a stainless square bin on a bolted base plate, posting slot under an overhanging
 * cap, door seams, keyhole and hinges. classic: a cast-iron slatted round bin (base moulding, vertical
 * slats over a dark core, two hoop bands, rolled rim) with a liner bag folded over the rim, a crest.
 */
export function bin(k: Kit, modern: boolean, rng?: Rng): void {
  const sh = k.sh;
  const r01 = () => (rng ? rng.next() : 0.5);
  if (modern) {
    // contemporary square litter bin: bolted base plate, painted fluted body, an all-round posting
    // aperture with the black liner bag folded over the inner rim, a brushed stainless hood with a
    // shallow pyramid top and a cigarette stub plate; front door seams, keyhole, label
    k.m('#596066', 'steel');
    cbox(sh, 0, 0.008, 0, 0.5, 0.016, 0.5, 0.006);
    for (const [x, z] of [[-0.205, -0.205], [0.205, -0.205], [0.205, 0.205], [-0.205, 0.205]]) boltY(sh, x, 0.016, z, 0.014);
    const bodyC = rng ? rng.pick(['#3d4a52', '#2f5a43', '#6b6f72', '#3d4a52', '#7a2f33']) : '#3d4a52';
    k.m(bodyC, 'paint');
    cbox(sh, 0, 0.375, 0, 0.42, 0.7, 0.42, 0.03);
    // flutes: raised vertical ribs on the four faces
    for (let f = 0; f < 4; f++) {
      sh.push().local(0, 0, 0, 0, (f * Math.PI) / 2);
      for (let i = -2; i <= 2; i++) if (f !== 0 || Math.abs(i) === 2) sh.box(i * 0.075, 0.4, 0.212, 0.022, 0.52, 0.008, 3);
      sh.pop();
    }
    // aperture: dark interior, liner bag lip over the inner rim (uneven), four corner pillars
    k.m('#0e0f10', 'rubber');
    sh.box(0, 0.78, 0, 0.38, 0.16, 0.38, 0);
    k.m('#1c1d1f', 'rubber');
    for (let f = 0; f < 4; f++) {
      sh.push().local(0, 0, 0, 0, (f * Math.PI) / 2);
      for (let i = 0; i < 3; i++) sh.box(-0.12 + i * 0.12, 0.738 + 0.008 * Math.sin(i * 2.1 + f), 0.196, 0.12, 0.03 + 0.012 * ((i + f) % 2), 0.012, 0);
      sh.pop();
    }
    k.m(bodyC, 'paint');
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cbox(sh, x * 0.19, 0.79, z * 0.19, 0.045, 0.16, 0.045, 0.008);
    // hood: stainless, overhanging 2.5 cm, low pyramid top
    k.m('#c3c9cd', 'steel');
    cbox(sh, 0, 0.885, 0, 0.47, 0.05, 0.47, 0.01);
    poly(sh, [-0.235, 0.91, -0.235, 0.235, 0.91, -0.235, 0.0, 0.95, 0.0], 0, 0.99, -0.15);
    poly(sh, [0.235, 0.91, -0.235, 0.235, 0.91, 0.235, 0.0, 0.95, 0.0], 0.15, 0.99, 0);
    poly(sh, [0.235, 0.91, 0.235, -0.235, 0.91, 0.235, 0.0, 0.95, 0.0], 0, 0.99, 0.15);
    poly(sh, [-0.235, 0.91, 0.235, -0.235, 0.91, -0.235, 0.0, 0.95, 0.0], -0.15, 0.99, 0);
    k.m('#26292b', 'steel');
    sh.box(0, 0.952, 0, 0.09, 0.008, 0.09, 0);
    // the hood's turned-down skirt (a 4 cm hemmed lip with a rolled bead) and its shadowed underside, so the
    // lid reads as a pressed cap rather than a slab; a polished hand-worn strip on the front edge
    k.m('#b3babf', 'steel');
    for (let f = 0; f < 4; f++) {
      sh.push().local(0, 0, 0, 0, (f * Math.PI) / 2);
      sh.box(0, 0.872, 0.241, 0.494, 0.042, 0.012, 1);
      k.m('#d4d9dc', 'steel');
      sh.box(0, 0.852, 0.247, 0.5, 0.01, 0.01, 0);
      k.m('#b3babf', 'steel');
      sh.pop();
    }
    k.m('#3a3d40', 'steel');
    sh.box(0, 0.851, 0, 0.47, 0.002, 0.47, 2);
    k.m('#d8dde0', 'steel');
    sh.box(0, 0.9, 0.236, 0.18, 0.02, 0.002, 1);
    // door seams + keyhole + hinges on the front face (the middle flutes are left off there)
    k.m('#23282b', 'steel');
    const z = 0.211;
    sh.box(0, 0.1, z, 0.26, 0.006, 0.004, 0);
    sh.box(0, 0.62, z, 0.26, 0.006, 0.004, 0);
    sh.box(-0.13, 0.36, z, 0.006, 0.52, 0.004, 0);
    sh.box(0.13, 0.36, z, 0.006, 0.52, 0.004, 0);
    k.m('#1a1b1c', 'steel');
    sh.box(0.1, 0.56, z + 0.002, 0.012, 0.022, 0.004, 0);
    k.m('#7c858b', 'steel');
    for (const y of [0.18, 0.52]) sh.cyl(-0.132, y - 0.03, z + 0.004, 0.009, 0.009, 0.06, 6, 2);
    // label plate (white with a dark band) and, on some, a recycling sticker
    k.m('#e9e4d6', 'plastic');
    sh.box(0, 0.45, z + 0.001, 0.16, 0.07, 0.003, 0);
    k.m('#2b2f33', 'plastic');
    pixelText(sh, 'LITTER', 0, 0.455, z + 0.003, 0.0055, 0.001);
    sh.box(0, 0.428, z + 0.003, 0.12, 0.004, 0.001, 55);
    if (r01() < 0.4) {
      k.m(r01() < 0.5 ? '#2e7d4f' : '#2b6ca3', 'plastic');
      sh.box(-0.02, 0.3, z + 0.001, 0.08, 0.08, 0.003, 0);
    }
    return;
  }
  const body = rng ? rng.pick(['#2f5240', '#2f5240', '#1f2a24', '#3c3f42', '#5b2a2a']) : '#2f5240';
  const dark = new THREE.Color(body).multiplyScalar(0.45);
  k.m(body, 'iron');
  lathe(sh, 0, 0, [[0.272, 0], [0.272, 0.035], [0.255, 0.05], [0.25, 0.075], [0.24, 0.085]], 16);
  k.m(dark, 'iron');
  sh.cyl(0, 0.08, 0, 0.222, 0.222, 0.72, 14, 0);
  k.m(body, 'iron');
  const N = 18;
  for (let i = 0; i < N; i++) sh.push().local(0, 0, 0, 0, ((i + 0.5) / N) * Math.PI * 2).box(0, 0.44, 0.229, 0.052, 0.7, 0.016, 3).pop();
  for (const y of [0.1, 0.7]) lathe(sh, 0, 0, [[0.236, y], [0.25, y + 0.006], [0.25, y + 0.064], [0.236, y + 0.07]], 16);
  // rolled rim and the inside wall
  lathe(sh, 0, 0, [[0.236, 0.78], [0.258, 0.79], [0.262, 0.82], [0.25, 0.838], [0.226, 0.835], [0.218, 0.8], [0.216, 0.6]], 16);
  k.m('#0e0f10', 'rubber');
  sh.disc(0, 0.62, 0, 0.217, 12);
  // liner bag folded over the rim (most bins), its hem hanging unevenly
  if (r01() < 0.8) {
    k.m(r01() < 0.6 ? '#1c1e20' : r01() < 0.5 ? '#5a6a52' : '#9aa0a4', 'rubber');
    const sides = 16, top: number[] = [], bot: number[] = [];
    const ph = r01() * 6.28;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const hang = 0.05 + 0.03 * Math.sin(a * 3 + ph) + 0.015 * Math.sin(a * 7 + ph * 2);
      top.push(sh.v(c * 0.266, 0.832, s * 0.266, c, 0.2, s));
      bot.push(sh.v(c * 0.268, 0.832 - hang, s * 0.268, c, -0.1, s));
    }
    for (let i = 0; i < sides; i++) sh.s.quad(bot[i], top[i], top[i + 1], bot[i + 1]);
    lathe(sh, 0, 0, [[0.266, 0.832], [0.25, 0.846], [0.214, 0.842], [0.205, 0.78]], 16);
  }
  // crest plate
  k.m('#c9b26a', 'iron');
  sh.push().local(0, 0.46, 0.247).box(0, 0, 0, 0.09, 0.11, 0.012, 0).pop();
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

/**
 * K6-style telephone kiosk (0.96 m square, 2.55 m): concrete plinth, chamfered corner posts, raised kick
 * panels, glazing bars in relief (3 × 8 panes, the middle column wider) over recessed glass (g = the glass
 * kit; without it the panes are opaque), sign bands, a square dome with the crown, a door handle and the
 * telephone + shelf + ceiling light inside.
 */
export function phonebox(k: Kit, g?: Kit): void {
  const sh = k.sh;
  const red = '#bd2328';
  k.m('#b9b4aa', 'stone');
  cbox(sh, 0, 0.04, 0, 1.08, 0.08, 1.08, 0.02);
  k.m(red, 'paint');
  cbox(sh, 0, 0.13, 0, 0.98, 0.1, 0.98, 0.015);
  for (const [x, z] of [[-0.43, -0.43], [0.43, -0.43], [0.43, 0.43], [-0.43, 0.43]]) cbox(sh, x, 1.24, z, 0.12, 2.1, 0.12, 0.018);
  // floor + interior
  k.m('#2a2624', 'stone');
  sh.box(0, 0.185, 0, 0.8, 0.01, 0.8, 1);
  for (let side = 0; side < 4; side++) {
    sh.push().local(0, 0, 0, 0, (side * Math.PI) / 2);
    const z = 0.43;
    // kick panel: frame + raised field
    k.m(red, 'paint');
    sh.box(0, 0.36, z - 0.01, 0.76, 0.34, 0.05, 1);
    cbox(sh, 0, 0.36, z + 0.02, 0.6, 0.22, 0.03, 0.01, 1 | 4);
    // glazing: recessed glass + bars in relief
    const y0 = 0.56, y1 = 1.98, H = y1 - y0;
    k.m(red, 'paint');
    sh.box(0, y0 - 0.02, z, 0.76, 0.04, 0.07, 1);
    sh.box(0, y1 + 0.02, z, 0.76, 0.04, 0.07, 1);
    for (const x of [-0.13, 0.13]) sh.box(x, (y0 + y1) / 2, z + 0.012, 0.03, H, 0.04, 3);
    for (let r = 1; r < 8; r++) sh.box(0, y0 + (H * r) / 8, z + 0.012, 0.76, 0.022, 0.035, 0);
    // sign band (lit at night) under the dome
    k.m(red, 'paint');
    sh.box(0, 2.13, z + 0.01, 0.86, 0.26, 0.06, 1);
    k.e('#f4f1e8', '#fff1d6', 1.6);
    sh.box(0, 2.15, z + 0.045, 0.6, 0.11, 0.012, 0);
    k.m('#1c1c1c', 'paint');
    for (let i = 0; i < 9; i++) sh.box(-0.24 + i * 0.06, 2.15, z + 0.052, 0.035, 0.05, 0.004, 0);
    if (side === 0) {
      // door handle (the front is the door)
      k.m('#2a2a2a', 'iron');
      sh.box(0.33, 1.15, z + 0.05, 0.025, 0.3, 0.025, 0);
      sh.box(0.33, 1.02, z + 0.035, 0.02, 0.02, 0.03, 0);
      sh.box(0.33, 1.28, z + 0.035, 0.02, 0.02, 0.03, 0);
    }
    sh.pop();
  }
  // panes (one per side, behind the bars)
  if (g) {
    g.m('#c3d3da', 'glass');
    g.sh.m.copy(sh.m);
    g.sh.local(0, 0, 0);
    for (let side = 0; side < 4; side++) {
      g.sh.push().local(0, 0, 0, 0, (side * Math.PI) / 2);
      g.sh.box(0, 1.27, 0.425, 0.74, 1.42, 0.006, 3);
      g.sh.pop();
    }
  } else {
    k.e('#cfdde0', '#ffd9a0', 0.55);
    for (let side = 0; side < 4; side++) sh.push().local(0, 0, 0, 0, (side * Math.PI) / 2).box(0, 1.27, 0.42, 0.74, 1.42, 0.01, 3).pop();
  }
  // telephone on the back wall, directory shelf, ceiling light
  k.m('#1b1c1d', 'plastic');
  cbox(sh, 0, 1.35, -0.33, 0.24, 0.32, 0.12, 0.02);
  k.m('#9aa0a4', 'steel');
  sh.box(0, 1.25, -0.265, 0.12, 0.08, 0.01, 0);
  k.m('#111', 'plastic');
  sh.box(-0.08, 1.4, -0.26, 0.05, 0.2, 0.05, 0);
  // coiled cord sagging from the handset, a coin box under the phone, an instructions card
  k.m('#111', 'plastic');
  for (let i = 0; i < 6; i++) {
    const t0 = i / 6, t1 = (i + 1) / 6;
    const cy = (t: number) => 1.32 - Math.sin(t * Math.PI) * 0.16;
    sh.tube(-0.08 + t0 * 0.1, cy(t0), -0.255 + t0 * 0.02, -0.08 + t1 * 0.1, cy(t1), -0.255 + t1 * 0.02, 0.009, 0.009, 4);
  }
  k.m('#7d8589', 'steel');
  cbox(sh, 0, 1.08, -0.34, 0.2, 0.14, 0.09, 0.01);
  sh.box(0.05, 1.12, -0.294, 0.04, 0.006, 0.004, 0);
  k.m('#ecebe4', 'paint');
  sh.box(0, 1.62, -0.36, 0.2, 0.14, 0.004, 0);
  k.m('#5a4a3a', 'wood');
  sh.box(0, 0.95, -0.3, 0.6, 0.03, 0.22, 0);
  // directories on the shelf, a crumpled flyer on the floor, cards stuck to the side wall bars
  k.m('#d8bd5a', 'paint');
  sh.box(-0.17, 0.98, -0.31, 0.2, 0.05, 0.15, 0);
  k.m('#3a5f8a', 'paint');
  sh.box(-0.16, 1.03, -0.31, 0.18, 0.04, 0.14, 0);
  k.m('#f1efe8', 'paint');
  sh.ellipsoid(0.18, 0.2, 0.12, 0.05, 0.025, 0.04, 0);
  for (const [cz, cy, c] of [[-0.2, 1.7, '#e84a7a'], [-0.05, 1.55, '#f6d33c'], [0.1, 1.74, '#ffffff']] as const) {
    k.m(c, 'paint');
    sh.box(0.405, cy, cz, 0.003, 0.09, 0.06, 0);
  }
  k.e('#f6f0e0', '#ffe6b8', 1.2);
  sh.box(0, 2.0, 0, 0.3, 0.02, 0.3, 0);
  // square dome, crown
  k.m(red, 'paint');
  cbox(sh, 0, 2.3, 0, 1.0, 0.08, 1.0, 0.02);
  lathe(sh, 0, 0, [[0.7, 2.34], [0.66, 2.42], [0.52, 2.5], [0.3, 2.55], [0, 2.56]], 4, Math.PI / 4);
  k.m('#d6b24e', 'iron');
  sh.ellipsoid(0, 2.6, 0, 0.07, 0.06, 0.04, 1);
  cbox(sh, 0, 2.565, 0, 0.14, 0.02, 0.06, 0.005);
}

/**
 * Newspaper kiosk (1.8 × 1.1 m, 2.6 m to the sign): plinth, panelled walls, a real front opening with
 * depth (counter with paper stacks, shelves of covers inside, the roll shutter coiled in its box above),
 * wire magazine racks with tilted covers on both sides, an overhanging roof with fascia, a lit sign.
 */
const MASTHEADS = ['STYLE', 'AUTO', 'GOLF', 'TIME', 'CHEF', 'HOME', 'SPORT', 'KIDS', 'TECH', 'FILM', 'VOGA', 'NEWS', 'BIKE', 'CASA'];
const SKIN = ['#e9b99a', '#c98f6a', '#8d5a3b', '#f1cdb4'];

/**
 * Magazine cover (w × h) on the local plane z = 0 facing +Z: paper colour, a cover photo (backdrop + a face /
 * a car / a dish), the masthead in a contrasting colour across the top, cover lines and a price corner.
 * plain = a cover behind others (only its colour and masthead band show).
 */
function cover(k: Kit, rng: Rng, w: number, h: number, plain = false): void {
  const sh = k.sh,
    S = 1 | 2 | 4 | 16 | 32;
  const paper = rng.pick(['#f4f1ea', '#e63946', '#1d3557', '#f2c230', '#222426', '#e8649a', '#2a9d8f', '#f4a261']);
  const ink = paper === '#f4f1ea' || paper === '#f2c230' || paper === '#f4a261' ? rng.pick(['#c62828', '#1d1f22', '#1d3557']) : rng.pick(['#ffffff', '#f2c230']);
  k.m(paper, 'plastic');
  sh.box(0, 0, 0.004, w, h, 0.008, 0);
  if (plain) {
    k.m(ink, 'plastic');
    sh.box(0, h * 0.4, 0.0085, w * 0.8, h * 0.1, 0.001, S);
    return;
  }
  // photo
  const ph = h * 0.62,
    py = -h * 0.08,
    kind = rng.int(0, 2);
  k.m(rng.pick(['#9fc3d9', '#d9c3a5', '#5b7c99', '#c7d8b5', '#e7d6c9', '#3a3f55']), 'plastic');
  sh.box(0, py, 0.0083, w * 0.92, ph, 0.0006, S);
  if (kind === 0) {
    // portrait: shoulders, neck, face, hair
    k.m(rng.pick(['#2b2b2b', '#7a2f35', '#f1faee', '#2a9d8f', '#e9c46a']), 'plastic');
    sh.box(0, py - ph * 0.32, 0.0087, w * 0.7, ph * 0.36, 0.0006, S);
    k.m(rng.pick(SKIN), 'plastic');
    sh.box(0, py - ph * 0.08, 0.0087, w * 0.12, ph * 0.14, 0.0006, S);
    sh.box(0, py + ph * 0.1, 0.009, w * 0.3, ph * 0.3, 0.0006, S);
    k.m(rng.pick(['#2a1d14', '#6b4a2b', '#d9b36a', '#111111', '#8a3b1d']), 'plastic');
    sh.box(0, py + ph * 0.26, 0.0093, w * 0.36, ph * 0.1, 0.0006, S);
    sh.box(-w * 0.17, py + ph * 0.12, 0.0093, w * 0.05, ph * 0.26, 0.0006, S);
  } else if (kind === 1) {
    // car / bike on a road
    k.m('#4a4e52', 'plastic');
    sh.box(0, py - ph * 0.35, 0.0087, w * 0.92, ph * 0.3, 0.0006, S);
    k.m(rng.pick(['#d62f2f', '#f2f0e8', '#1d3557', '#f2c230']), 'plastic');
    sh.box(0, py - ph * 0.12, 0.009, w * 0.7, ph * 0.16, 0.0006, S);
    sh.box(w * 0.04, py + ph * 0.0, 0.009, w * 0.4, ph * 0.1, 0.0006, S);
    k.m('#151515', 'plastic');
    for (const sx of [-1, 1]) sh.box(sx * w * 0.22, py - ph * 0.22, 0.0093, w * 0.12, ph * 0.09, 0.0006, S);
  } else {
    // a dish / a plant: round-ish blob on a table
    k.m(rng.pick(['#8a5a3b', '#f4f1ea', '#3e6f5a']), 'plastic');
    sh.box(0, py - ph * 0.3, 0.0087, w * 0.92, ph * 0.38, 0.0006, S);
    k.m('#f4f1ea', 'plastic');
    sh.box(0, py - ph * 0.12, 0.009, w * 0.6, ph * 0.12, 0.0006, S);
    k.m(rng.pick(['#d62f2f', '#4f9a3a', '#f39a1f', '#8d6cab']), 'plastic');
    sh.box(0, py - ph * 0.02, 0.0093, w * 0.4, ph * 0.16, 0.0006, S);
  }
  // masthead across the top, cover lines on the left, price corner
  k.m(ink, 'plastic');
  const t = rng.pick(MASTHEADS),
    px = Math.min(h * 0.045, (w * 0.9) / (t.length * 4 - 1));
  pixelText(sh, t, 0, h / 2 - px * 3.4, 0.0096, px, 0.0006, true);
  for (let i = 0; i < 3; i++) sh.box(-w * 0.18, py + ph * 0.3 - i * h * 0.07, 0.0096, w * (0.42 - i * 0.07), h * 0.025, 0.0006, S);
  k.m(rng.pick(['#f2c230', '#e63946', '#ffffff']), 'plastic');
  sh.box(w * 0.32, -h * 0.42, 0.0096, w * 0.22, h * 0.07, 0.0006, S);
}

export function newsstand(k: Kit, rng: Rng): void {
  const sh = k.sh;
  const body = rng.pick(['#2f6b4f', '#2b5d7a', '#7a2f35']);
  const trim = new THREE.Color(body).multiplyScalar(0.7);
  k.m('#4a4e50', 'stone');
  cbox(sh, 0, 0.05, -0.05, 1.86, 0.1, 1.16, 0.02);
  k.m(body, 'paint');
  // back block, side jambs, counter front, fascia above the opening (front face at z = 0.5)
  cbox(sh, 0, 1.15, -0.25, 1.8, 2.1, 0.7, 0.02);
  for (const x of [-0.83, 0.83]) cbox(sh, x, 1.15, 0.3, 0.14, 2.1, 0.4, 0.015);
  cbox(sh, 0, 0.53, 0.3, 1.6, 0.86, 0.4, 0.015);
  cbox(sh, 0, 2.0, 0.3, 1.6, 0.4, 0.4, 0.015);
  // raised panels on the counter front and the sides
  k.m(trim, 'paint');
  for (const x of [-0.4, 0.4]) cbox(sh, x, 0.52, 0.505, 0.62, 0.56, 0.02, 0.006, 1 | 4);
  for (const sx of [-1, 1])
    for (const z of [-0.33, 0.18]) sh.push().local(sx * 0.9, 0.45, z, 0, (sx * Math.PI) / 2).box(0, 0, 0, 0.4, 0.5, 0.02, 1).pop();
  // inside: dark recess, shelves with covers leaning back
  k.m('#2a2522', 'wood');
  sh.box(0, 1.37, 0.1, 1.52, 0.86, 0.01, 0);
  sh.box(0, 1.8, 0.3, 1.52, 0.01, 0.4, 0);
  for (const y of [1.0, 1.3, 1.58]) {
    k.m('#6b5640', 'wood');
    sh.box(0, y, 0.17, 1.5, 0.02, 0.14, 0);
    for (let c = 0; c < 7; c++) {
      sh.push().local(-0.62 + c * 0.205 + rng.range(-0.02, 0.02), y + 0.125, 0.14, -0.25);
      cover(k, rng, 0.17, 0.23);
      sh.pop();
    }
  }
  // counter board + newspaper stacks
  k.m('#c9b48e', 'wood');
  cbox(sh, 0, 0.98, 0.42, 1.64, 0.04, 0.3, 0.01);
  for (let i = 0; i < 4; i++) {
    const x = -0.6 + i * 0.36 + rng.range(-0.03, 0.03), h = rng.range(0.04, 0.12);
    k.m('#e4e0d6', 'plastic');
    sh.push().local(x, 1.0 + h / 2, 0.45, 0, rng.range(-0.15, 0.15)).box(0, 0, 0, 0.3, h, 0.22, 1).pop();
    k.m('#3b3b3b', 'plastic');
    sh.push().local(x, 1.0 + h + 0.001, 0.45, 0, rng.range(-0.1, 0.1)).box(0, 0, 0.04, 0.22, 0.002, 0.04, 1).pop();
  }
  // roll shutter: housing box under the fascia, guide channels down the jambs, the curtain pulled
  // part-way down (slats in relief, bottom rail with a handle)
  k.m('#8f979c', 'steel');
  cbox(sh, 0, 1.75, 0.49, 1.6, 0.16, 0.12, 0.012);
  for (const sx of [-1, 1]) sh.box(sx * 0.765, 1.4, 0.505, 0.03, 0.7, 0.04, 1);
  const drop = rng.range(0.08, 0.3);
  k.m('#a7aeb2', 'steel');
  for (let y = 1.67; y > 1.67 - drop; y -= 0.045) cbox(sh, 0, y - 0.02, 0.51, 1.5, 0.04, 0.018, 0.006);
  k.m('#5e666b', 'steel');
  sh.box(0, 1.65 - drop, 0.515, 1.52, 0.03, 0.03, 0);
  sh.box(0, 1.62 - drop, 0.535, 0.16, 0.015, 0.015, 0);
  // wire magazine racks on both sides: tiered trays with a front wire, covers stacked and leaning back
  for (const sx of [-1, 1]) {
    sh.push().local(sx * 0.9, 0, -0.05, 0, (sx * Math.PI) / 2);
    for (let r = 0; r < 3; r++) {
      const y = 0.9 + r * 0.4;
      k.m('#5e666b', 'steel');
      sh.box(0, y, 0.09, 1.02, 0.012, 0.16, 0);
      sh.box(0, y + 0.06, 0.17, 1.02, 0.01, 0.01, 0);
      sh.box(0, y + 0.03, 0.17, 1.02, 0.008, 0.008, 0);
      for (const x of [-0.5, -0.17, 0.17, 0.5]) sh.box(x, y + 0.03, 0.17, 0.008, 0.06, 0.008, 0);
      for (let c = 0; c < 3; c++) {
        const n = rng.int(2, 4);
        for (let j = 0; j < n; j++) {
          sh.push().local(-0.33 + c * 0.33 + rng.range(-0.015, 0.015), y + 0.15, 0.05 + j * 0.018, -0.2 + j * 0.03);
          cover(k, rng, 0.24, 0.3, j < n - 1);
          sh.pop();
        }
      }
    }
    k.m('#5e666b', 'steel');
    for (const x of [-0.52, 0.52]) {
      sh.box(x, 1.32, 0.17, 0.016, 0.95, 0.016, 0);
      sh.box(x, 1.32, 0.02, 0.016, 0.95, 0.016, 0);
    }
    sh.pop();
  }
  // back: three framed panels and a poster case (glazed frame, lit at night); steel kick plate
  k.m(trim, 'paint');
  for (const x of [-0.6, 0, 0.6]) {
    const pw = 0.5;
    sh.box(x, 0.62, -0.605, pw, 0.03, 0.012, 0);
    sh.box(x, 1.98, -0.605, pw, 0.03, 0.012, 0);
    for (const ex of [-1, 1]) sh.box(x + ex * (pw / 2 - 0.015), 1.3, -0.605, 0.03, 1.39, 0.012, 0);
  }
  k.m('#2b2e30', 'steel');
  cbox(sh, 0, 1.32, -0.62, 0.78, 1.08, 0.04, 0.008);
  k.e('#e8e0cc', '#fff0d0', 0.6);
  sh.box(0, 1.32, -0.642, 0.7, 1.0, 0.004, 0);
  k.m(rng.pick(['#c43b33', '#2a9d8f', '#e9c46a', '#457b9d']), 'plastic');
  sh.box(0, 1.55, -0.645, 0.62, 0.42, 0.003, 0);
  k.m('#222', 'plastic');
  sh.box(0, 1.08, -0.645, 0.5, 0.08, 0.003, 0);
  k.m('#5e666b', 'steel');
  sh.box(0, 0.18, -0.6, 1.8, 0.16, 0.012, 0);
  // roof: a deep overhang (30 cm front, 18 cm round), boxed fascia with a bevelled edge, a dark soffit
  // under the eaves, a shallow ridge and a drip edge
  k.m(trim, 'paint');
  cbox(sh, 0, 2.22, 0.07, 2.16, 0.18, 1.6, 0.025);
  k.m(new THREE.Color(trim).multiplyScalar(0.55), 'paint');
  sh.box(0, 2.128, 0.07, 2.1, 0.008, 1.54, 0);
  k.m('#3a3d3f', 'steel');
  const rf = 0.9, rb = -0.76, rx = 1.1, ry0 = 2.31, ry1 = 2.42;
  poly(sh, [-rx, ry0, rf, rx, ry0, rf, rx, ry1, 0.07, -rx, ry1, 0.07], 0, 0.995, 0.1);
  poly(sh, [-rx, ry0, rb, rx, ry0, rb, rx, ry1, 0.07, -rx, ry1, 0.07], 0, 0.99, -0.12);
  for (const sx of [-1, 1]) poly(sh, [sx * rx, ry0, rb, sx * rx, ry0, rf, sx * rx, ry1, 0.07], sx, 0, 0);
  sh.box(0, ry0 - 0.01, rf, 2.2, 0.03, 0.02, 0);
  sh.box(0, ry1 + 0.01, 0.07, 2.2, 0.025, 0.05, 0);
  // the sheet's underside closes the roof over the slab (no daylight between roof and fascia)
  k.m(new THREE.Color(trim).multiplyScalar(0.55), 'paint');
  poly(sh, [-rx, ry0 - 0.001, rb, -rx, ry0 - 0.001, rf, rx, ry0 - 0.001, rf, rx, ry0 - 0.001, rb], 0, -1, 0);
  // sign board on the fascia under the eaves, lit at night: cream panel, red title, small strap line
  k.m(trim, 'paint');
  cbox(sh, 0, 1.99, 0.51, 1.56, 0.3, 0.03, 0.006, 1 | 4);
  k.e('#f2ead6', '#ffe2a8', 1.2);
  sh.box(0, 1.99, 0.527, 1.48, 0.24, 0.004, 1 | 4);
  const title = rng.pick(['NEWS', 'PRESS', 'KIOSK', 'TABAC']);
  k.e('#b8322c', '#ff6a50', 0.8);
  pixelText(sh, title, 0, 2.02, 0.529, 0.028, 0.003, true);
  k.e('#2c2c2c', '#3a3a3a', 0.2);
  pixelText(sh, rng.pick(['PAPERS & MAGAZINES', 'DAILY PAPERS', 'MAGAZINES & SWEETS']), 0, 1.92, 0.529, 0.008, 0.0012);
}

/**
 * Street planter (along × across × h): a hollow trough with chamfered edges and a shadow-gap foot, the
 * rim, inner walls and a soil surface 8 cm down with clods. concrete: precast with arrises; terracotta:
 * rolled lip band; wood: horizontal boards with gaps between corner posts; steel: folded lip.
 */
export function planterBox(k: Kit, kind: 'concrete' | 'terracotta' | 'wood' | 'steel', along: number, across: number, h: number): void {
  const sh = k.sh;
  // steel = weathering (corten) steel: the iron wear branch adds the rust bloom and run-down streaks
  const mat = kind === 'terracotta' ? 'ceramic' : kind === 'wood' ? 'wood' : kind === 'steel' ? 'iron' : 'stone';
  const col = kind === 'terracotta' ? '#b8643f' : kind === 'wood' ? '#8a6240' : kind === 'steel' ? '#7a4a2e' : '#c4beb3';
  const rimCol = kind === 'terracotta' ? '#a9583a' : kind === 'wood' ? '#9d7149' : kind === 'steel' ? '#6a3f27' : '#cfc9be';
  const t = kind === 'steel' ? 0.03 : 0.07;
  const ax = along / 2, az = across / 2;
  // shadow-gap foot
  k.m('#2e2c29', 'stone');
  sh.box(0, 0.025, 0, along - 0.08, 0.05, across - 0.08, 1);
  k.m(col, mat);
  if (kind === 'wood') {
    k.m('#5a4330', 'wood');
    sh.box(0, (h + 0.05) / 2, 0, along - 0.06, h - 0.05, across - 0.06, 1);
    k.m(col, 'wood');
    const nb = 3, bh = (h - 0.06) / nb;
    for (let i = 0; i < nb; i++) {
      const y = 0.05 + bh * (i + 0.5);
      for (const s of [-1, 1]) {
        cbox(sh, 0, y, s * (az - 0.012), along - 0.12, bh - 0.012, 0.024, 0.006);
        cbox(sh, s * (ax - 0.012), y, 0, 0.024, bh - 0.012, across - 0.12, 0.006);
      }
    }
    k.m('#7a5536', 'wood');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(sh, sx * (ax - 0.04), (h + 0.05) / 2, sz * (az - 0.04), 0.08, h - 0.05, 0.08, 0.01);
  } else {
    cbox(sh, 0, (h + 0.05) / 2, 0, along, h - 0.05, across, kind === 'steel' ? 0.006 : 0.04, 1 | 2);
    if (kind === 'steel') {
      // pressed vertical ribs on the long sides, a kick band at the foot
      for (let x = -ax + 0.2; x < ax - 0.1; x += 0.25) for (const sz of [-1, 1]) sh.box(x, (h + 0.04) / 2, sz * (az + 0.006), 0.035, h - 0.16, 0.012, 3);
      k.m('#4a2e1e', 'iron');
      sh.box(0, 0.08, 0, along + 0.01, 0.06, across + 0.01, 3);
    } else if (kind === 'concrete') {
      // cast drip groove under the rim
      k.m('#a9a398', 'stone');
      sh.box(0, h - 0.07, 0, along + 0.004, 0.008, across + 0.004, 3);
    }
  }
  // rim (a frame) + inner walls
  k.m(rimCol, mat);
  const lip = kind === 'terracotta' ? 0.025 : kind === 'steel' ? 0.012 : kind === 'wood' ? 0.015 : 0.02;
  if (lip > 0) cbox(sh, 0, h - 0.03, 0, along + lip * 2, 0.06, across + lip * 2, 0.012, 1 | 2);
  const ox = ax + lip, oz = az + lip, ix = ax - t, iz = az - t;
  poly(sh, [-ox, h, -oz, ox, h, -oz, ix, h, -iz, -ix, h, -iz], 0, 1, 0);
  poly(sh, [ox, h, -oz, ox, h, oz, ix, h, iz, ix, h, -iz], 0, 1, 0);
  poly(sh, [ox, h, oz, -ox, h, oz, -ix, h, iz, ix, h, iz], 0, 1, 0);
  poly(sh, [-ox, h, oz, -ox, h, -oz, -ix, h, -iz, -ix, h, iz], 0, 1, 0);
  const ys = h - 0.05;
  k.m(new THREE.Color(rimCol).multiplyScalar(0.6), mat);
  poly(sh, [-ix, h, -iz, ix, h, -iz, ix, ys, -iz, -ix, ys, -iz], 0, 0, 1);
  poly(sh, [-ix, h, iz, ix, h, iz, ix, ys, iz, -ix, ys, iz], 0, 0, -1);
  poly(sh, [-ix, h, -iz, -ix, h, iz, -ix, ys, iz, -ix, ys, -iz], 1, 0, 0);
  poly(sh, [ix, h, -iz, ix, h, iz, ix, ys, iz, ix, ys, -iz], -1, 0, 0);
  if (kind !== 'wood') {
    // weep holes at the foot of the long sides, each with a dark wash fanning down from it; rain run-off
    // streaks under the rim (tapered: wide at the top, thinning out towards the foot)
    const seed = along * 7.31 + across * 3.7 + h;
    const rnd = (i: number) => {
      const v = Math.sin(i * 91.17 + seed * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    const stain = new THREE.Color(col).lerp(new THREE.Color('#3a3226'), 0.25).multiplyScalar(kind === 'concrete' ? 0.62 : 0.72);
    const wash = new THREE.Color(col).lerp(new THREE.Color('#4e3828'), 0.45).multiplyScalar(0.85);
    const e = 0.004;
    for (const sz of [-1, 1]) {
      const zf = sz * (az + e);
      for (const wx of [-ax * 0.55, ax * 0.55]) {
        k.m('#151311', 'stone');
        poly(sh, [wx - 0.02, 0.07, zf, wx + 0.02, 0.07, zf, wx + 0.02, 0.1, zf, wx - 0.02, 0.1, zf], 0, 0, sz);
        k.m(wash, mat);
        poly(sh, [wx - 0.015, 0.07, zf, wx + 0.015, 0.07, zf, wx + 0.06, 0.05, zf, wx - 0.06, 0.05, zf], 0, 0, sz);
      }
      k.m(stain, mat);
      for (let i = 0; i < 5; i++) {
        const r0 = rnd(i + sz * 17);
        if (r0 < 0.25) continue;
        const x = -ax + 0.08 + rnd(i * 3 + sz * 5 + 1) * (along - 0.16);
        const w = 0.03 + 0.07 * rnd(i * 5 + sz + 2);
        const yb = h - 0.07 - (0.12 + 0.3 * rnd(i * 7 + sz * 3 + 3)) * (h - 0.1);
        poly(sh, [x - w / 2, h - 0.065, zf, x + w / 2, h - 0.065, zf, x + w * 0.12, yb, zf, x - w * 0.12, yb, zf], 0, 0, sz);
      }
    }
  }
  // soil 5 cm below the rim: dark damp band along the walls, lighter dry middle, clods, bark-mulch chips, a
  // dropped leaf or cigarette end, soil splashed on the rim top (watering)
  k.m('#3a2a1e', 'stone');
  poly(sh, [-ix, ys, -iz, ix, ys, -iz, ix, ys, iz, -ix, ys, iz], 0, 1, 0);
  k.m('#5a4330', 'stone');
  poly(sh, [-ix + 0.06, ys + 0.002, -iz + 0.06, ix - 0.06, ys + 0.002, -iz + 0.06, ix - 0.06, ys + 0.002, iz - 0.06, -ix + 0.06, ys + 0.002, iz - 0.06], 0, 1, 0);
  const hr = (i: number) => Math.abs(Math.sin(i * 12.9898 + along * 7.1 + across * 3.3) * 43758.5453) % 1;
  k.m('#3f2d20', 'stone');
  for (let i = 0; i < 8; i++) sh.ellipsoid((hr(i) - 0.5) * ix * 1.6, ys + 0.006, (hr(i + 40) - 0.5) * iz * 1.6, 0.035, 0.018, 0.03, 0);
  k.m('#8a5a36', 'wood');
  for (let i = 0; i < 14; i++) {
    sh.push().local((hr(i + 7) - 0.5) * ix * 1.7, ys + 0.004, (hr(i + 19) - 0.5) * iz * 1.7, 0, hr(i + 3) * 3, 0);
    sh.box(0, 0, 0, 0.045, 0.006, 0.022, 1);
    sh.pop();
  }
  if (hr(77) < 0.5) {
    k.m('#e9e4d6', 'plastic');
    sh.push().local(ix * 0.4, ys + 0.007, -iz * 0.3, 0, hr(5) * 3, 0).box(0, 0, 0, 0.03, 0.006, 0.006, 1).pop();
  }
  k.m('#4e3828', 'stone');
  for (let i = 0; i < 6; i++) {
    const onX = i % 2 === 0, sgn = hr(i + 50) < 0.5 ? -1 : 1;
    const u = (hr(i + 60) - 0.5) * (onX ? along : across) * 0.8;
    const rx2 = onX ? u : sgn * (ax - t / 2), rz2 = onX ? sgn * (az - t / 2) : u;
    sh.box(rx2, h + 0.001, rz2, 0.05 + hr(i) * 0.06, 0.002, 0.03, 1);
  }
}

/** Bollards. steel: a tapered painted tube on a ground collar with a domed cap and a reflective band;
 *  stone: a granite post with a chamfered square foot and a dished cap; iron: a cast-iron cannon bollard
 *  (base collar, waisted body, bead and ring, ball top). */
export function bollard(k: Kit, style: 'steel' | 'stone' | 'iron'): void {
  const sh = k.sh;
  if (style === 'stone') {
    k.m('#cfc6b4', 'stone');
    cbox(sh, 0, 0.06, 0, 0.3, 0.12, 0.3, 0.025);
    lathe(sh, 0, 0, [[0.14, 0.11], [0.125, 0.55], [0.13, 0.57], [0.13, 0.6], [0.1, 0.66], [0.04, 0.68], [0, 0.685]], 10);
    return;
  }
  if (style === 'iron') {
    k.m('#24282a', 'iron');
    lathe(sh, 0, 0, [[0.15, 0], [0.15, 0.04], [0.12, 0.07], [0.105, 0.12], [0.095, 0.5], [0.105, 0.6], [0.12, 0.62], [0.12, 0.66], [0.1, 0.68], [0.105, 0.72], [0.11, 0.76], [0.09, 0.8], [0.05, 0.83], [0, 0.835]], 12);
    k.m('#b89a4e', 'iron');
    ring(sh, 0, 0.64, 0, 0.122, 0.012, 12);
    return;
  }
  k.m('#3a3f44', 'paint');
  lathe(sh, 0, 0, [[0.13, 0], [0.13, 0.02], [0.1, 0.035], [0.095, 0.05]], 10);
  lathe(sh, 0, 0, [[0.09, 0.04], [0.082, 0.82], [0.075, 0.86], [0.045, 0.885], [0, 0.89]], 10);
  k.m('#e8e6df', 'plastic');
  sh.cyl(0, 0.66, 0, 0.087, 0.086, 0.035, 10, 0);
  sh.cyl(0, 0.72, 0, 0.086, 0.085, 0.035, 10, 0);
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
  // which hoops hold a bike: none, one, or both end hoops with the bikes on opposite sides (two bikes on the same
  // side of neighbouring hoops would pass through each other)
  const PATS = [[], [1], [0], [2], [0, 2], [0, 2], [1]];
  const pat = PATS[rng.int(0, PATS.length - 1)];
  const side0 = rng.chance(0.5) ? 1 : -1;
  for (const h of pat) {
    const side = h === 2 && pat.length > 1 ? -side0 : side0;
    // a bike (±0.85 m long) on an end hoop leans with that hoop near its back wheel, so it stays inside the rack's
    // 2.8 m slot instead of standing in the neighbouring planter (F4 bug 4)
    sh.push().local(hoops[h] * 0.6, 0, side * 0.2, rng.range(-0.05, 0.05) * side, rng.chance(0.5) ? 0 : Math.PI, 0.08 * side);
    bike(k, rng.pick(BIKE_COLS));
    sh.pop();
    // locked to the hoop: a D-lock round the upright and the down tube (shackle + lock body), or a cable
    const ux = hoops[h] + (rng.chance(0.5) ? 0.32 : -0.32);
    if (rng.chance(0.7)) {
      k.m('#2b2d2f', 'steel');
      const z0 = -side * 0.035, z1 = side * 0.23;
      for (const y of [0.5, 0.62]) sh.tube(ux, y, z0, ux, y, z1, 0.009, 0.009, 5);
      sh.tube(ux, 0.5, z0, ux, 0.62, z0, 0.009, 0.009, 5);
      k.m(rng.chance(0.5) ? '#e0b21c' : '#1c1d1f', 'plastic');
      sh.box(ux, 0.48, z1, 0.035, 0.17, 0.035, 1);
    } else {
      k.m(rng.pick(['#c0392b', '#1f5fa8', '#1c1d1f']), 'plastic');
      sh.tube(ux, 0.35, 0, ux + 0.05, 0.3, side * 0.2, 0.008, 0.008, 4);
      sh.tube(ux + 0.05, 0.3, side * 0.2, ux + 0.02, 0.45, side * 0.21, 0.008, 0.008, 4);
      sh.tube(ux + 0.02, 0.45, side * 0.21, ux, 0.42, 0, 0.008, 0.008, 4);
      k.m('#1c1d1f', 'plastic');
      sh.box(ux + 0.03, 0.28, side * 0.2, 0.04, 0.06, 0.03, 1);
    }
  }
  // the hoops sit in welded flanges bolted to the paving
  k.m('#8d969b', 'steel');
  for (const x of hoops)
    for (const sx of [-1, 1]) {
      sh.cyl(x + sx * 0.32, 0, 0, 0.06, 0.06, 0.008, 10, 2);
      for (const a of [0.6, 2.2, 3.8, 5.4]) boltY(sh, x + sx * 0.32 + Math.cos(a) * 0.042, 0.008, Math.sin(a) * 0.042, 0.007);
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
/** bus-shelter / kiosk poster themes: background, image ground, image sky, object, headline lines, brand band */
const POSTERS: { bg: string; ground: string; sky: string; obj: string; text: string[]; ink: string; band: string }[] = [
  { bg: '#1f3a5f', ground: '#e0b35a', sky: '#7fb8d8', obj: '#f2f0e8', text: ['SUMMER', 'SALE'], ink: '#ffd34d', band: '#d62f2f' },
  { bg: '#f4efe2', ground: '#4f8a3c', sky: '#a9d3e6', obj: '#d62f2f', text: ['FRESH', 'JUICE'], ink: '#2b2b2b', band: '#f39a1f' },
  { bg: '#2b2233', ground: '#6b3f8f', sky: '#e8467c', obj: '#f6d33c', text: ['CITY', 'JAZZ'], ink: '#f6f2e8', band: '#2a9d8f' },
  { bg: '#e63946', ground: '#1d3557', sky: '#f1faee', obj: '#457b9d', text: ['NEW', 'PHONE'], ink: '#ffffff', band: '#1d1f22' },
  { bg: '#0f5257', ground: '#e9c46a', sky: '#f4a261', obj: '#264653', text: ['ZOO', 'OPEN'], ink: '#f1faee', band: '#e76f51' },
];

/** printed poster (w × h) on the current local plane z = 0, facing +Z; lit from behind in its own colours */
function poster(k: Kit, t: (typeof POSTERS)[number], w: number, h: number): void {
  const sh = k.sh,
    e = (c: string, z: number) => {
      k.e(c, c, 0.9);
      return z;
    };
  sh.box(0, 0, e(t.bg, 0.0025), w, h, 0.005, 1 | 4);
  // photo: sky over ground with a big product / figure in front
  const iw = w - 0.08,
    ih = h * 0.5,
    iy = h * 0.17;
  sh.box(0, iy + ih * 0.15, e(t.sky, 0.0055), iw, ih * 0.7, 0.001, 1 | 4);
  sh.box(0, iy - ih * 0.35, e(t.ground, 0.0055), iw, ih * 0.3, 0.001, 1 | 4);
  sh.box(iw * 0.28, iy + ih * 0.32, e('#fff3c4', 0.0062), 0.08, 0.08, 0.001, 1 | 4);
  sh.box(-iw * 0.1, iy - ih * 0.05, e(t.obj, 0.0065), iw * 0.28, ih * 0.6, 0.001, 1 | 4);
  sh.box(-iw * 0.1, iy + ih * 0.3, e(t.obj, 0.0065), iw * 0.12, ih * 0.1, 0.001, 1 | 4);
  // headline, small print, brand band
  k.e(t.ink, t.ink, 0.9);
  const px = Math.min(0.03, (w - 0.08) / (Math.max(...t.text.map((l) => l.length)) * 4));
  t.text.forEach((l, i) => pixelText(sh, l, 0, -h * 0.17 - i * px * 6.5, 0.006, px, 0.001, true));
  for (let i = 0; i < 3; i++) sh.box(-w * 0.12, -h * 0.39 + i * 0.022, 0.0065, w * 0.5 - i * 0.06, 0.008, 0.001, 1 | 4);
  sh.box(0, -h / 2 + 0.035, e(t.band, 0.0055), w, 0.07, 0.001, 1 | 4);
}

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
  // a printed poster behind glass on both faces: lit from behind at night in its own colours (not a white glow)
  const theme = rng.int(0, POSTERS.length - 1);
  for (const sx of [-1, 1]) {
    sh.push().local(L / 2 + sx * 0.061, 1.3, (zf + 0.12 + zb) / 2, 0, (sx * Math.PI) / 2, 0);
    poster(k, POSTERS[(theme + (sx > 0 ? 0 : 1)) % POSTERS.length], zb - zf - 0.3, 1.6);
    sh.pop();
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
  // the stop flag: a rectangular plate across the footway line (readable along the road), white with a
  // route-coloured head band, "BUS STOP" lettering and a yellow H roundel — never a coloured disc with a bar
  k.m('#5d646a', 'steel');
  sh.box(px, 2.86, pz, 0.05, 0.03, 0.05, 1);
  for (const y of [2.32, 2.78]) sh.box(px, y, pz + 0.04, 0.06, 0.035, 0.08, 0);
  sh.push().local(px, 2.55, pz + 0.3, 0, 0, 0);
  k.m('#3e4448', 'steel');
  sh.box(0, 0, 0, 0.022, 0.64, 0.5, 0);
  for (const sx of [-1, 1]) {
    sh.push().local(sx * 0.012, 0, 0, 0, (sx * Math.PI) / 2, 0);
    k.m('#f4f2ea', 'paint');
    sh.box(0, -0.02, 0.001, 0.47, 0.57, 0.002, 1 | 4);
    k.m(routeColor, 'paint');
    sh.box(0, 0.235, 0.003, 0.47, 0.13, 0.002, 1 | 4);
    k.m('#ffffff', 'paint');
    pixelText(sh, 'BUS', 0, 0.235, 0.004, 0.022, 0.0015, true);
    k.m('#f2c230', 'paint');
    sh.push().local(0, 0.035, 0.004, Math.PI / 2, 0, 0);
    sh.cyl(0, 0, 0, 0.12, 0.12, 0.003, 18, 2, false);
    sh.pop();
    k.m('#1f6b3a', 'paint');
    pixelText(sh, 'H', 0, 0.035, 0.0072, 0.038, 0.0015, true);
    k.m('#23282c', 'paint');
    pixelText(sh, 'STOP', 0, -0.19, 0.004, 0.02, 0.0015, true);
    sh.pop();
  }
  sh.pop();
  // timetable case on the pole, facing the footway: route-coloured head, printed columns behind a glass cover
  sh.push().local(px, 1.9, pz + 0.05, 0, 0, 0);
  k.m('#5d646a', 'steel');
  sh.box(0, 0, 0, 0.32, 0.44, 0.04, 0);
  k.m('#f1efe8', 'paint');
  sh.box(0, -0.01, 0.021, 0.29, 0.38, 0.002, 1 | 4);
  k.m(routeColor, 'paint');
  sh.box(0, 0.165, 0.023, 0.29, 0.05, 0.002, 1 | 4);
  k.m('#ffffff', 'paint');
  pixelText(sh, rng.pick(['LINE', 'ROUTE']), 0, 0.165, 0.024, 0.008, 0.001);
  k.m('#2d3236', 'paint');
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 12; r++) {
      const ww = 0.045 + ((r * 7 + c * 3) % 5) * 0.008;
      sh.box(-0.09 + c * 0.09 - (0.07 - ww) / 2, 0.115 - r * 0.024, 0.023, ww, 0.007, 0.002, 1 | 4);
    }
  sh.pop();
  g.m('#dbe8ec', 'glass');
  gs.box(px, 1.89, pz + 0.075, 0.3, 0.4, 0.004, 0);
  return { glows: [{ x: 0, y: 0.17, z: (zf + zb) / 2, size: 2.6 }] };
}

// ─────────────────────────────────────────────────────── fences & walls ──

export const FENCE_PAINT = ['#f3efe6', '#f3efe6', '#ece4d2', '#c9dae2', '#d6e2c4', '#efdcc4'];

const _pc = new THREE.Color(),
  _wc = new THREE.Color();
const WEATHERED = new THREE.Color('#8f8a7c');
const ALGAE = new THREE.Color('#5d6a46');

/** fence post set in the ground: chamfered square section, pyramid cap, a ring of trodden soil at the foot */
function fencePost(k: Kit, x: number, z: number, w: number, h: number, paint: string): void {
  const sh = k.sh;
  k.m(paint, 'paint');
  cbox(sh, x, (h - 0.12) / 2, z, w, h + 0.12, w, 0.008);
  sh.cone(x, h, z, w * 0.72, w * 0.45, 4, false, Math.PI / 4);
  k.m('#5b5142', 'stone');
  sh.cyl(x, -0.02, z, w * 0.95, w * 1.15, 0.04, 6, 2);
}

/**
 * Picket fence from local (0,0,0) to (L,0,0) along +x, pickets on the +z (street) face of two rails, posts set in the
 * ground. With an rng (near detail): weathered paint (grey timber showing at the foot, algae, splash), slight
 * unevenness per picket. Optional end posts (gates).
 */
export function picketFence(k: Kit, L: number, paint: string, postA: boolean, postB: boolean, rng?: Rng): void {
  const sh = k.sh;
  const H = 0.92;
  const nPosts = Math.max(1, Math.round(L / 1.9));
  for (let i = 0; i <= nPosts; i++) {
    const x = (i / nPosts) * L;
    const gate = (i === 0 && postA) || (i === nPosts && postB);
    // posts stand behind the rails (rails nailed to their face, pickets to the rails)
    if (rng) fencePost(k, x, gate ? -0.093 : -0.08, gate ? 0.11 : 0.085, gate ? 1.12 : 0.98, paint);
    else {
      k.m(paint, 'paint');
      sh.box(x, (gate ? 1.12 : 1.0) / 2, 0, gate ? 0.11 : 0.08, gate ? 1.12 : 1.0, gate ? 0.11 : 0.08, 1);
      if (gate) sh.box(x, 1.16, 0, 0.14, 0.04, 0.14, 0);
    }
  }
  k.m(paint, 'paint');
  // rails behind the pickets (their front face touches the boards)
  const rz = rng ? -0.023 : -0.035;
  sh.box(L / 2, 0.3, rz, L, 0.06, 0.03, 0);
  sh.box(L / 2, 0.72, rz, L, 0.06, 0.03, 0);
  const n = Math.floor(L / 0.19);
  const off = (L - (n - 1) * 0.19) / 2;
  const sk = k.s;
  _pc.set(paint);
  for (let i = 0; i < n; i++) {
    const x = off + i * 0.19;
    const dh = rng ? rng.range(-0.015, 0.012) : 0,
      lean = rng ? rng.range(-0.012, 0.012) : 0;
    // paint: worn at the foot (grey timber + algae + splash), some boards repainted brighter / gone chalky
    const tone = rng ? rng.range(0.9, 1.04) : 1;
    const wear = rng ? rng.range(0.25, 0.75) : 0;
    _wc.copy(_pc).lerp(WEATHERED, wear * 0.7).lerp(ALGAE, wear * 0.25);
    const top = H - 0.02 + dh;
    // flat pointed board, front and back faces (5 + 5 verts, 3 + 3 tris)
    for (const side of [1, -1]) {
      const z = side * 0.012;
      sk.rgb(_wc.r * tone, _wc.g * tone, _wc.b * tone);
      const a = sh.v(x - 0.0425, 0.05, z, 0, 0, side),
        b = sh.v(x + 0.0425, 0.05, z, 0, 0, side);
      sk.rgb(_pc.r * tone, _pc.g * tone, _pc.b * tone);
      const c = sh.v(x + 0.0425 + lean, top, z, 0, 0, side),
        d = sh.v(x + lean, top + 0.075, z, 0, 0, side),
        e = sh.v(x - 0.0425 + lean, top, z, 0, 0, side);
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

/**
 * Garden gate leaf hinged at local (0,0,0), closing along +x to width w, opened by `open` rad (towards local -z, the
 * garden): ledged-and-braced frame, pickets, two black strap hinges on the hinge stile, a thumb latch at the far stile.
 */
export function gateLeaf(k: Kit, w: number, paint: string, open: number, rng: Rng, side = 1): void {
  const sh = k.sh;
  // side: +1 street on local +z (garden −z), −1 the other way round; the leaf swings into the garden
  const f = side;
  sh.push().local(0.06, 0, -0.035 * f, 0, open * f, 0);
  k.m(paint, 'paint');
  const W = w - 0.1;
  // stiles, ledges and the diagonal brace (on the garden face)
  cbox(sh, 0.025, 0.52, -0.02 * f, 0.05, 0.9, 0.035, 0.006);
  cbox(sh, W - 0.025, 0.52, -0.02 * f, 0.05, 0.9, 0.035, 0.006);
  for (const y of [0.22, 0.82]) cbox(sh, W / 2, y, -0.02 * f, W, 0.07, 0.03, 0.006);
  const bl = Math.hypot(W - 0.1, 0.6);
  sh.push().local(W / 2, 0.52, -0.02 * f, 0, 0, Math.atan2(0.6, W - 0.1));
  sh.box(0, 0, 0, bl, 0.06, 0.028, 0);
  sh.pop();
  // pickets on the street face
  const n = Math.max(3, Math.round(W / 0.15));
  for (let i = 0; i < n; i++) {
    const x = 0.04 + ((W - 0.08) * (i + 0.5)) / n;
    sh.box(x, 0.5, 0.004 * f, 0.08, 0.86, 0.022, 1);
    sh.cone(x, 0.93, 0.004 * f, 0.04, 0.06, 4, false, Math.PI / 4);
  }
  // strap hinges (black) on the hinge stile, latch + thumb lever at the far stile
  k.m('#1e1f21', 'iron');
  for (const y of [0.22, 0.82]) {
    sh.box(0.16, y, 0.018 * f, 0.3, 0.035, 0.006, 1);
    sh.cyl(-0.015, y - 0.04, 0.0, 0.012, 0.012, 0.08, 6, 2);
  }
  sh.box(W - 0.02, 0.78, 0.018 * f, 0.1, 0.02, 0.008, 1);
  sh.box(W + 0.035, 0.76, 0.005 * f, 0.02, 0.09, 0.02, 1);
  sh.box(W - 0.06, 0.74, 0.026 * f, 0.018, 0.12, 0.01, 1);
  sh.pop();
  void rng;
}

/** Low garden wall along +x with coping and end pillars. */
export function lowWall(k: Kit, L: number, brick: boolean, postA: boolean, postB: boolean): void {
  const sh = k.sh;
  const body = brick ? '#a65d43' : '#cdbf9f';
  const cap = brick ? '#d9cfbd' : '#e2d8c3';
  const bm = brick ? 'brick' : 'stone';
  k.m(body, bm);
  sh.box(L / 2, 0.29, 0, L, 0.58, 0.3, 1);
  // coping in 60 cm units with mortar joints, a drip overhang each side
  k.m(cap, 'stone');
  const nc = Math.max(1, Math.round(L / 0.6));
  for (let i = 0; i < nc; i++) {
    const x0 = (i / nc) * (L + 0.04) - 0.02,
      x1 = ((i + 1) / nc) * (L + 0.04) - 0.02;
    cbox(sh, (x0 + x1) / 2, 0.61, 0, x1 - x0 - 0.008, 0.06, 0.36, 0.008, 0);
  }
  k.m('#b9b1a1', 'stone');
  sh.box(L / 2, 0.581, 0, L + 0.03, 0.004, 0.31, 3);
  for (const [x, on] of [
    [0, postA],
    [L, postB],
  ] as [number, boolean][]) {
    if (!on) continue;
    k.m(body, brick ? 'brick' : 'stone');
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
