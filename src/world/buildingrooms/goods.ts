// What stands on the shelves and hangs on the walls of the rooms behind the windows: small procedural 3D goods for the atlas
// (buildingrooms/atlas.ts). A function fills the width x0..x1 of one shelf whose board top is at height y, under a clear height h, with
// its front face no further out than zf. Everything is drawn once at boot and looked at from straight ahead.

import { hex, mixc, shade, type Col, type Kit } from './kit';

type R = () => number;
export type Filler = (k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number, row: number) => void;

export const PAL = {
  packs: [0xb6352c, 0x2c5aa0, 0x2f7d4f, 0xe0b23c, 0xe6e2d6, 0x7a3f8f, 0xd9702a, 0x1f2d3d, 0x4aa3b5, 0xc94f7c].map(hex),
  pale: [0xf2efe6, 0xe6e8ea, 0xdfeaf0, 0xf3e6e6, 0xe8f0e2].map(hex),
  cloth: [0x2b3a55, 0x7d2f35, 0xc9b28d, 0x4f6b53, 0x8c8f94, 0x1f2024, 0xe8e3d8, 0xb86a3a, 0x5d4a7a, 0x9db4c6, 0xd9a6a0].map(hex),
  book: [0x7c2a22, 0x1f3a5f, 0x2d5a3f, 0xc9a24a, 0x3a2a1e, 0xe0d8c4, 0x5e2d55, 0x0f1b2a, 0x9c5a2a, 0x466b7a, 0xb0463a, 0xd8c9a0].map(hex),
  wood: [0x6b4528, 0x8a5e36, 0x4a2f1b, 0xa9794a, 0x33241a, 0xbf9463].map(hex),
  metal: [0x9aa0a6, 0xc6c9cc, 0x6d7278, 0x3a3d42].map(hex),
  glassGreen: [0x2c4a22, 0x46591e, 0x1e3320, 0x5a3a12, 0x6e2a1a].map(hex),
  fruit: [0xc2301f, 0xe08a1e, 0xe6c23a, 0x6f9e2c, 0x8c1f3a, 0xd95f2a, 0x3f7d2a].map(hex),
  flower: [0xd92f4a, 0xf2c22e, 0xf2f0e8, 0xc65aa8, 0xe8702a, 0x7a58c8, 0xf28aa8].map(hex),
  leaf: [0x2c5a22, 0x3f7a2c, 0x1f4a24, 0x5a8a30].map(hex),
};

export const pick = <T>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

/** one facing per step: `w(i)` metres wide, drawn by `f`; a few left out so that a row doesn't read as printed */
function run(r: R, x0: number, x1: number, w: () => number, f: (x: number, w: number) => void, gaps = 0.08): void {
  let x = x0 + 0.015;
  while (x < x1 - 0.03) {
    const wi = Math.min(w(), x1 - x);
    if (wi < 0.012) break;
    if (r() > gaps) f(x, wi);
    x += wi;
  }
}

/** a packet: colour front, a pale label on most, a printed line and a coloured roundel */
export function packs(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number, pal: readonly Col[] = PAL.packs): void {
  const base = 0.09 + r() * 0.1;
  const brand = pick(r, pal);
  run(r, x0, x1, () => base * (0.8 + r() * 0.5), (x, w) => {
    const hh = h * (0.5 + r() * 0.42);
    // runs of the same product: shops stock several facings
    const c = r() < 0.55 ? brand : pick(r, pal);
    const z = zf - r() * 0.05;
    k.box(x + 0.004, y, z - 0.1, x + w - 0.004, y + hh, z, shade(c, 0.86 + r() * 0.2), 0.004);
    if (r() < 0.75) {
      const ly = y + hh * (0.28 + r() * 0.2);
      k.rect(x + w * 0.12, ly, x + w * 0.88, ly + hh * 0.26, z + 0.001, pick(r, PAL.pale));
      k.rect(x + w * 0.22, ly + hh * 0.1, x + w * 0.78, ly + hh * 0.15, z + 0.002, shade(c, 0.4));
    }
    if (r() < 0.5) k.disc(x + w * 0.5, y + hh * 0.8, z + 0.001, Math.min(w, hh) * 0.13, pick(r, pal), 0, 8);
  });
}

/** white pharmacy cartons with a coloured stripe */
export function cartons(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  run(r, x0, x1, () => 0.05 + r() * 0.05, (x, w) => {
    const hh = h * (0.35 + r() * 0.4);
    const z = zf - r() * 0.03;
    k.box(x + 0.002, y, z - 0.05, x + w - 0.002, y + hh, z, pick(r, PAL.pale), 0.002);
    const c = pick(r, PAL.packs);
    k.rect(x + 0.002, y + hh * 0.62, x + w - 0.002, y + hh * 0.8, z + 0.001, c);
    k.rect(x + w * 0.2, y + hh * 0.3, x + w * 0.8, y + hh * 0.4, z + 0.001, shade(c, 0.5));
  }, 0.06);
}

export function books(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number, pal: readonly Col[] = PAL.book): void {
  run(r, x0, x1, () => 0.018 + r() * r() * 0.05, (x, w) => {
    const hh = h * (0.68 + r() * 0.28);
    const z = zf - r() * 0.035;
    const c = shade(pick(r, pal), 0.8 + r() * 0.4);
    k.box(x + 0.0015, y, z - 0.12, x + w - 0.0015, y + hh, z, c, 0.003);
    if (r() < 0.6) k.rect(x + 0.002, y + hh * 0.78, x + w - 0.002, y + hh * 0.84, z + 0.001, r() < 0.5 ? hex(0xd9b860) : shade(c, 0.5));
    if (r() < 0.5) k.rect(x + w * 0.25, y + hh * 0.25, x + w * 0.75, y + hh * 0.68, z + 0.001, mixc(c, hex(0xe8dfc8), 0.55));
  }, 0.03);
  // here and there a book lies flat or leans at the end of a run
  if (r() < 0.4) {
    const x = x0 + (x1 - x0) * r() * 0.7;
    k.box(x, y, zf - 0.1, x + 0.2, y + 0.035, zf + 0.004, pick(r, pal), 0.003);
  }
}

/** a book or magazine facing out: a printed cover */
export function bookCover(k: Kit, r: R, x0: number, y0: number, x1: number, y1: number, z: number, c: Col): void {
  k.box(x0, y0, z - 0.018, x1, y1, z, c, 0.002);
  const w = x1 - x0,
    h = y1 - y0;
  const kind = r();
  if (kind < 0.4) {
    k.rect(x0 + w * 0.12, y0 + h * 0.3, x1 - w * 0.12, y0 + h * 0.74, z + 0.001, mixc(c, pick(r, PAL.pale), 0.7));
    k.disc(x0 + w * (0.3 + r() * 0.4), y0 + h * 0.52, z + 0.002, w * 0.17, pick(r, PAL.packs), 0, 8);
  } else if (kind < 0.7) {
    k.rect(x0, y0 + h * 0.62, x1, y0 + h * 0.84, z + 0.001, pick(r, PAL.pale));
  } else {
    k.rect(x0 + w * 0.15, y0 + h * 0.72, x1 - w * 0.15, y0 + h * 0.78, z + 0.001, hex(0xe8d9a8));
    k.rect(x0 + w * 0.15, y0 + h * 0.6, x1 - w * 0.3, y0 + h * 0.64, z + 0.001, hex(0xe8d9a8));
  }
  k.rect(x0 + w * 0.2, y0 + h * 0.1, x1 - w * 0.2, y0 + h * 0.15, z + 0.001, shade(pick(r, PAL.pale), 0.85));
}

export function magazines(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  run(r, x0, x1, () => 0.2 + r() * 0.03, (x, w) => {
    const c = pick(r, PAL.packs);
    k.rect(x + 0.006, y, x + w - 0.006, y + Math.min(h * 0.9, 0.29), zf, c);
    k.rect(x + 0.02, y + 0.2, x + w - 0.02, y + 0.26, zf + 0.001, pick(r, PAL.pale));
    k.rect(x + 0.03, y + 0.03, x + w - 0.05, y + 0.17, zf + 0.001, mixc(c, pick(r, PAL.pale), 0.5));
  }, 0.04);
}

/** a bottle: profile from the foot through the shoulder to the lip */
export function bottle(k: Kit, x: number, y: number, z: number, h: number, r0: number, c: Col, label?: Col): void {
  k.lathe(x, z, [[r0, y], [r0, y + h * 0.58], [r0 * 0.42, y + h * 0.74], [r0 * 0.34, y + h * 0.97], [r0 * 0.4, y + h]], c, 6);
  if (label) k.rect(x - r0 * 0.78, y + h * 0.16, x + r0 * 0.78, y + h * 0.44, z + r0 + 0.001, label);
}

export function bottles(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number, pal: readonly Col[] = PAL.glassGreen): void {
  run(r, x0, x1, () => 0.075 + r() * 0.02, (x, w) => {
    const hh = Math.min(h * 0.92, 0.3 + r() * 0.05);
    bottle(k, x + w / 2, y, zf - 0.05, hh, 0.034, pick(r, pal), r() < 0.8 ? pick(r, PAL.pale) : undefined);
  }, 0.1);
}

/** wine lying in a diamond rack is too fine to see; a rack of round bottle ends reads as one */
export function wineEnds(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const d = 0.095;
  const rows = Math.floor(h / d);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < Math.floor((x1 - x0) / d); i++) {
      if (r() < 0.07) continue;
      const cx = x0 + (i + 0.5 + (j % 2) * 0.25) * d,
        cy = y + (j + 0.5) * d;
      if (cx > x1 - 0.04) continue;
      k.disc(cx, cy, zf - 0.02, 0.037, pick(r, PAL.glassGreen), 0.5, 8);
      k.disc(cx, cy, zf - 0.019, 0.013, r() < 0.5 ? hex(0x6e2a1a) : hex(0x2a2a2a), 0, 6);
    }
}

export function jars(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const fills = [0x5f6e1f, 0xc47a1a, 0x8c1a22, 0x3a4a16, 0xd9b84a, 0x7a2f12].map(hex);
  run(r, x0, x1, () => 0.09 + r() * 0.015, (x, w) => {
    const hh = Math.min(h * 0.8, 0.13 + r() * 0.06);
    const cx = x + w / 2;
    const c = pick(r, fills);
    k.lathe(cx, zf - 0.05, [[0.036, y], [0.04, y + 0.01], [0.04, y + hh * 0.82], [0.03, y + hh * 0.9]], c, 6);
    k.cyl(cx, y + hh * 0.9, zf - 0.05, 0.032, hh * 0.1, r() < 0.5 ? hex(0xcfc9b8) : hex(0xa8322a), 6);
    k.rect(cx - 0.025, y + hh * 0.25, cx + 0.025, y + hh * 0.55, zf - 0.009, pick(r, PAL.pale));
  });
}

export function tins(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const brand = pick(r, PAL.packs);
  run(r, x0, x1, () => 0.08, (x, w) => {
    const cx = x + w / 2;
    const c = r() < 0.6 ? brand : pick(r, PAL.packs);
    // stacks of two or three where the shelf allows it
    const n = Math.max(1, Math.min(3, Math.floor(h / 0.115)));
    const m = 1 + Math.floor(r() * n);
    for (let i = 0; i < m; i++) {
      const yy = y + i * 0.11;
      k.cyl(cx, yy, zf - 0.04, 0.036, 0.105, hex(0xb9bcc0), 7);
      k.lathe(cx, zf - 0.04, [[0.0365, yy + 0.015], [0.0365, yy + 0.09]], c, 7);
      k.rect(cx - 0.02, yy + 0.04, cx + 0.02, yy + 0.07, zf - 0.003, pick(r, PAL.pale));
    }
  });
}

export function loaves(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const crust = [0xb8742a, 0x9c5a1e, 0xd09a4a, 0x7a4418, 0xc98a36].map(hex);
  run(r, x0, x1, () => 0.2 + r() * 0.1, (x, w) => {
    const cx = x + w / 2;
    const c = pick(r, crust);
    const ry = Math.min(h * 0.42, 0.055 + r() * 0.05);
    k.ball(cx, y + ry, zf - 0.09, w * 0.46, ry, 0.08, c);
    // cuts on the crust
    if (r() < 0.7) for (let i = -1; i <= 1; i++) k.bar(cx + i * w * 0.18 - 0.02, y + ry * 0.7, cx + i * w * 0.18 + 0.02, y + ry * 1.5, zf - 0.012, 0.006, hex(0xe8c98a));
  }, 0.1);
}

export function baguettes(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  // a wicker basket of sticks standing up
  const crust = [0xc48436, 0xa8682a, 0xd29a4e].map(hex);
  run(r, x0 + 0.03, x1 - 0.03, () => 0.055, (x, w) => {
    const hh = Math.min(h * 0.92, 0.45 + r() * 0.2);
    const lean = (r() - 0.5) * 0.08;
    k.bar(x + w / 2, y, x + w / 2 + lean, y + hh, zf - 0.08, 0.026, pick(r, crust));
  }, 0.05);
  k.box(x0 + 0.02, y, zf - 0.04, x1 - 0.02, y + 0.16, zf, hex(0x8a6236), 0.01);
  for (let i = 0; i < 4; i++) k.rect(x0 + 0.02, y + 0.02 + i * 0.035, x1 - 0.02, y + 0.03 + i * 0.035, zf + 0.001, hex(0x5e4023));
}

export function pastries(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const c = [0xd9a14e, 0xe8c37a, 0x7a3f1e, 0xe6d9c0, 0xb5563a].map(hex);
  run(r, x0, x1, () => 0.095, (x, w) => {
    const cx = x + w / 2;
    k.ball(cx, y + 0.032, zf - 0.04, w * 0.42, Math.min(h * 0.3, 0.034), 0.04, pick(r, c), 6);
    if (r() < 0.3) k.ball(cx, y + 0.06, zf - 0.03, 0.012, 0.012, 0.012, hex(0xc21f2a), 4);
  }, 0.1);
}

export function cheeses(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const rind = [0xdfb24a, 0xc8802a, 0xeed488, 0xb86a1e, 0xf0e4c0].map(hex);
  run(r, x0, x1, () => 0.26 + r() * 0.07, (x, w) => {
    const c = pick(r, rind);
    const hh = Math.min(h * 0.6, 0.09 + r() * 0.05);
    k.box(x + 0.012, y, zf - 0.16, x + w - 0.012, y + hh, zf - 0.03, c, 0.024);
    if (r() < 0.35) k.rect(x + w * 0.3, y + hh * 0.3, x + w * 0.7, y + hh * 0.7, zf - 0.029, pick(r, PAL.pale));
  });
}

export function sausages(k: Kit, r: R, x0: number, x1: number, y: number, z: number): void {
  // hanging from a rail at height y
  k.bar(x0, y, x1, y, z, 0.009, hex(0x6d7278));
  run(r, x0, x1, () => 0.1 + r() * 0.05, (x, w) => {
    const len = 0.22 + r() * 0.26;
    const cx = x + w / 2;
    k.bar(cx, y, cx, y - 0.04, z, 0.003, hex(0xd8d0b8));
    k.ball(cx, y - 0.04 - len / 2, z + 0.01, 0.028 + r() * 0.012, len / 2, 0.03, pick(r, [0x5e1c16, 0x7a2a1e, 0x3f1a14, 0x8c4a2a].map(hex)), 6);
  }, 0.14);
}

/** cups, mugs and glasses on a café's shelf */
export function crockery(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  run(r, x0, x1, () => 0.09 + r() * 0.03, (x, w) => {
    const cx = x + w / 2;
    if (r() < 0.45) {
      const n = 1 + Math.floor(r() * Math.min(4, h / 0.07));
      for (let i = 0; i < n; i++) k.lathe(cx, zf - 0.05, [[0.026, y + i * 0.058], [0.036, y + i * 0.058 + 0.06]], hex(0xece8df), 6);
    } else if (r() < 0.5) {
      const n = 3 + Math.floor(r() * 6);
      for (let i = 0; i < n; i++) k.box(cx - 0.055, y + i * 0.012, zf - 0.09, cx + 0.055, y + i * 0.012 + 0.012, zf - 0.02, shade(hex(0xf0ece2), 0.9 + (i % 2) * 0.1), 0.002);
    } else {
      k.lathe(cx, zf - 0.05, [[0.022, y], [0.027, y + 0.03], [0.032, y + 0.12]], hex(0xa8c0c0), 6);
    }
  }, 0.15);
}

export function folded(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  run(r, x0, x1, () => 0.3 + r() * 0.06, (x, w) => {
    const c = pick(r, PAL.cloth);
    const n = Math.floor((h * (0.45 + r() * 0.45)) / 0.05);
    for (let i = 0; i < n; i++) {
      const j = (r() - 0.5) * 0.012;
      k.box(x + 0.012 + j, y + i * 0.05, zf - 0.18, x + w - 0.012 + j, y + i * 0.05 + 0.047, zf - 0.02, shade(r() < 0.8 ? c : pick(r, PAL.cloth), 0.88 + r() * 0.22), 0.018);
    }
  }, 0.12);
}

/** clothes on hangers seen face on along a rail at height y */
export function hanging(k: Kit, r: R, x0: number, x1: number, y: number, z: number, long = 0.9): void {
  k.bar(x0, y, x1, y, z, 0.012, hex(0xb0b4b8));
  run(r, x0, x1, () => 0.055 + r() * 0.03, (x, w) => {
    const c = shade(pick(r, PAL.cloth), 0.8 + r() * 0.3);
    const len = long * (0.72 + r() * 0.3);
    k.box(x, y - len, z - 0.12, x + w * 1.5, y - 0.05, z + 0.02 + r() * 0.03, c, 0.025);
    k.bar(x + w * 0.75, y, x + w * 0.75, y - 0.06, z + 0.04, 0.004, hex(0x9a9ea2));
  }, 0.05);
}

export function shoes(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const c = [0x3a2418, 0x6b4528, 0x101114, 0xa8322a, 0xd8d4c8, 0x2c3f5a, 0xb88a4a].map(hex);
  run(r, x0, x1, () => 0.21 + r() * 0.03, (x, w) => {
    const col = pick(r, c);
    const heel = r() < 0.3;
    k.box(x + 0.02, y, zf - 0.12, x + w - 0.02, y + 0.02, zf, heel ? hex(0x1a1a1a) : hex(0xd8d0c0), 0.004);
    k.ball(x + w * 0.62, y + 0.05, zf - 0.05, w * 0.34, 0.04, 0.05, col, 6);
    k.box(x + 0.03, y + 0.02, zf - 0.08, x + w * 0.42, y + (heel ? 0.14 : 0.11), zf - 0.01, col, 0.018);
  }, 0.12);
}

export function shoeBoxes(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  const c = pick(r, [0xc9b28d, 0xe6e2d6, 0x2b3a55, 0x7d2f35].map(hex));
  const n = Math.floor(h / 0.115);
  for (let j = 0; j < n; j++) {
    run(r, x0, x1, () => 0.31, (x, w) => {
      const yy = y + j * 0.115;
      k.box(x + 0.004, yy, zf - 0.2, x + w - 0.004, yy + 0.112, zf, shade(c, 0.88 + r() * 0.2), 0.004);
      k.rect(x + w * 0.62, yy + 0.03, x + w * 0.92, yy + 0.085, zf + 0.001, hex(0xf2efe6));
    }, 0.1);
  }
}

export function paintCans(k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number): void {
  run(r, x0, x1, () => 0.19, (x, w) => {
    const cx = x + w / 2;
    const c = pick(r, PAL.packs);
    k.cyl(cx, y, zf - 0.09, 0.085, Math.min(h * 0.8, 0.19), hex(0xc0c3c6), 8);
    k.rect(cx - 0.07, y + 0.02, cx + 0.07, y + 0.16, zf - 0.004, c);
    k.rect(cx - 0.05, y + 0.09, cx + 0.05, y + 0.13, zf - 0.003, pick(r, PAL.pale));
  }, 0.1);
}

export function pegTools(k: Kit, r: R, x0: number, x1: number, y0: number, y1: number): void {
  const steel = hex(0xa6abb0);
  for (let y = y0 + 0.12; y < y1 - 0.1; y += 0.26) {
    let x = x0 + 0.05 + r() * 0.05;
    while (x < x1 - 0.08) {
      const kind = r();
      const c = pick(r, [0xc92f1f, 0x1f4aa0, 0xe0b23c, 0x1a1a1a, 0x8a5e36].map(hex));
      if (kind < 0.25) {
        // hammer
        k.bar(x, y - 0.13, x, y + 0.06, 0.03, 0.012, c);
        k.box(x - 0.05, y + 0.05, 0.02, x + 0.05, y + 0.085, 0.055, steel, 0.005);
      } else if (kind < 0.5) {
        // screwdriver
        k.bar(x, y - 0.14, x, y - 0.02, 0.025, 0.004, steel);
        k.bar(x, y - 0.02, x, y + 0.07, 0.025, 0.012, c);
      } else if (kind < 0.7) {
        // spanner
        k.bar(x, y - 0.14, x, y + 0.05, 0.02, 0.008, steel);
        k.ring(x, y + 0.07, 0.02, 0.017, 0.006, steel, 8);
      } else if (kind < 0.85) {
        // blister packs hanging
        k.rect(x - 0.04, y - 0.12, x + 0.04, y + 0.06, 0.02, pick(r, PAL.pale));
        k.rect(x - 0.03, y - 0.08, x + 0.03, y + 0.0, 0.022, c);
      } else {
        // a saw
        k.box(x - 0.022, y - 0.15, 0.015, x + 0.022, y + 0.03, 0.02, steel, 0);
        k.box(x - 0.03, y + 0.03, 0.015, x + 0.03, y + 0.09, 0.035, c, 0.008);
      }
      x += 0.1 + r() * 0.05;
    }
  }
}

export function leaves(k: Kit, r: R, x: number, y: number, z: number, rw: number, rh: number, n: number): void {
  // a loose bush: leaves from the middle out, the outer and upper ones in front and lighter
  for (let i = 0; i < n; i++) {
    const s = i / n;
    const a = r() * Math.PI * 2,
      d = Math.sqrt(s) * (0.85 + r() * 0.15);
    const lx = x + Math.cos(a) * d * rw * 0.8,
      ly = y + Math.sin(a) * d * rh * 0.8;
    const size = 0.05 + r() * 0.05;
    k.leaf(lx, ly, z + s * 0.05, a + (r() - 0.5) * 1.2, size * 1.8, size * 0.42, shade(pick(r, PAL.leaf), 0.55 + s * 0.55 + r() * 0.2), 0.5);
  }
}

export function pot(k: Kit, x: number, y: number, z: number, rp: number, c: Col): void {
  k.lathe(x, z, [[rp * 0.72, y], [rp, y + rp * 1.4], [rp * 1.08, y + rp * 1.4], [rp * 1.08, y + rp * 1.65]], c, 7);
}

export function potPlant(k: Kit, r: R, x: number, y: number, z: number, size: number): void {
  pot(k, x, y, z, 0.08 * size, pick(r, [0xa8552e, 0x8c4a2a, 0xe0ddd2, 0x3a3f46].map(hex)));
  leaves(k, r, x, y + 0.28 * size, z + 0.01, 0.17 * size, 0.2 * size, 34);
}

/** a tall plant in a pot on the floor */
export function floorPlant(k: Kit, r: R, x: number, z: number, size = 1): void {
  pot(k, x, 0, z, 0.15 * size, pick(r, [0xe0ddd2, 0x3a3f46, 0xa8552e].map(hex)));
  const potTop = 0.25 * size;
  const kind = r();
  if (kind < 0.35) {
    // blades from the soil, like a snake plant or a palm's young fronds
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / (n - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.15;
      k.leaf(x + (i / n - 0.5) * 0.14 * size, potTop, z + r() * 0.05, a, (0.75 + r() * 0.6) * size, 0.045 * size, shade(pick(r, PAL.leaf), 0.7 + r() * 0.6), (a - Math.PI / 2) * 0.7);
    }
  } else {
    // a stem with broad leaves all the way up, the lower ones longer and drooping
    const h = (1.15 + r() * 0.35) * size;
    const lean = (r() - 0.5) * 0.14;
    k.bar(x, potTop, x + lean, h, z, 0.012, hex(0x4a3a24));
    const n = 30;
    for (let i = 0; i < n; i++) {
      const s = i / n;
      const side = i % 2 ? 1 : -1;
      const a = Math.PI / 2 - side * (1.25 - s * 0.7) + (r() - 0.5) * 0.35;
      const L = (0.42 - s * 0.18 + r() * 0.1) * size;
      k.leaf(x + lean * s, potTop + (h - potTop) * (0.25 + s * 0.8), z + 0.02 + s * 0.05, a, L, (0.05 + r() * 0.025) * size, shade(pick(r, PAL.leaf), 0.38 + s * 0.4 + r() * 0.26), side * -0.4);
    }
  }
}

export function flowers(k: Kit, r: R, x: number, y: number, z: number, w: number, h: number, n: number): void {
  // stems and heads over a bucket
  const col = pick(r, PAL.flower);
  for (let i = 0; i < n; i++) {
    const fx = x + (r() - 0.5) * w;
    const fy = y + h * (0.55 + r() * 0.45);
    k.bar(x + (fx - x) * 0.3, y, fx, fy, z, 0.004, pick(r, PAL.leaf));
    if (r() < 0.45) k.ball(fx, fy - 0.08, z + 0.01, 0.03, 0.012, 0.01, pick(r, PAL.leaf), 4);
    k.ball(fx, fy, z + 0.02 + i * 0.001, 0.028, 0.026, 0.02, r() < 0.8 ? col : pick(r, PAL.flower), 5);
  }
}

export function bucket(k: Kit, x: number, y: number, z: number, rb: number, hb: number, c: Col): void {
  k.lathe(x, z, [[rb * 0.72, y], [rb, y + hb]], c, 8);
}

export function fruitPile(k: Kit, r: R, x0: number, x1: number, y: number, z: number, rf: number, c: Col, rows = 3): void {
  for (let j = 0; j < rows; j++) {
    const yy = y + rf * 0.8 + j * rf * 1.5;
    const inset = j * rf * 0.7;
    for (let x = x0 + rf + inset; x < x1 - rf - inset + 1e-3; x += rf * 1.9) {
      k.ball(x + (r() - 0.5) * rf * 0.3, yy, z + j * -0.01 + r() * 0.01, rf, rf, rf, shade(c, 0.8 + r() * 0.35), 6);
    }
  }
}

export function crate(k: Kit, x0: number, y0: number, x1: number, y1: number, z: number, c: Col): void {
  const h = (y1 - y0) / 3;
  for (let i = 0; i < 3; i++) k.box(x0, y0 + i * h + 0.006, z - 0.02, x1, y0 + (i + 1) * h - 0.006, z, shade(c, 0.9 + i * 0.06), 0.003);
  k.box(x0, y0, z - 0.02, x0 + 0.03, y1, z + 0.003, shade(c, 0.8), 0.003);
  k.box(x1 - 0.03, y0, z - 0.02, x1, y1, z + 0.003, shade(c, 0.8), 0.003);
}

/** a framed picture: a painted scene in a few bands of colour, not a flat rectangle */
export function picture(k: Kit, r: R, x0: number, y0: number, x1: number, y1: number, z: number, frame?: Col): void {
  const f = frame ?? pick(r, [0x2a2118, 0x8a6a3a, 0x1a1a1a, 0xd8c9a0, 0xe8e4da].map(hex));
  k.box(x0, y0, z - 0.02, x1, y1, z, f, 0.006);
  const t = Math.min(0.03, (x1 - x0) * 0.08);
  const ix0 = x0 + t,
    ix1 = x1 - t,
    iy0 = y0 + t,
    iy1 = y1 - t;
  const kind = r();
  const w = ix1 - ix0,
    h = iy1 - iy0;
  if (kind < 0.4) {
    // a landscape: sky, hills, a field
    const sky = pick(r, [0x8fb4d0, 0xd8a878, 0xb8c8d0, 0x6a88a8].map(hex));
    k.rect(ix0, iy0, ix1, iy1, z + 0.001, sky);
    const hz = iy0 + h * (0.35 + r() * 0.2);
    k.rect(ix0, hz, ix1, hz + h * 0.1, z + 0.002, shade(pick(r, [0x3f5a4a, 0x5a6a7a].map(hex)), 1));
    k.rect(ix0, iy0, ix1, hz, z + 0.003, pick(r, [0x5a7a3a, 0xa8944a, 0x3a5a3a, 0x2f4f6a].map(hex)));
    k.disc(ix0 + w * (0.2 + r() * 0.6), iy1 - h * 0.2, z + 0.002, h * 0.07, hex(0xf2e6c0), 0, 8);
  } else if (kind < 0.75) {
    // abstract: blocks of colour
    k.rect(ix0, iy0, ix1, iy1, z + 0.001, pick(r, [0xe8e2d4, 0x1f2d3d, 0xc9b28d].map(hex)));
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = ix0 + w * r() * 0.7,
        b = iy0 + h * r() * 0.7;
      k.rect(a, b, Math.min(ix1, a + w * (0.15 + r() * 0.4)), Math.min(iy1, b + h * (0.15 + r() * 0.4)), z + 0.002 + i * 0.0005, pick(r, PAL.packs));
    }
  } else {
    // a portrait: dark ground, a pale head and shoulders
    k.rect(ix0, iy0, ix1, iy1, z + 0.001, pick(r, [0x2a2a22, 0x3a2a1e, 0x223040].map(hex)));
    k.disc(ix0 + w / 2, iy0 + h * 0.62, z + 0.002, Math.min(w, h) * 0.16, hex(0xc8a080), 0, 10);
    k.rect(ix0 + w * 0.22, iy0, ix1 - w * 0.22, iy0 + h * 0.4, z + 0.002, pick(r, PAL.cloth));
  }
}

export function clock(k: Kit, x: number, y: number, z: number, rc: number): void {
  k.disc(x, y, z, rc, hex(0x2a2118), 0.4, 16);
  k.disc(x, y, z + 0.004, rc * 0.86, hex(0xf0ead8), 0, 16);
  k.bar(x, y, x + rc * 0.1, y + rc * 0.62, z + 0.005, 0.005, hex(0x111111));
  k.bar(x, y, x + rc * 0.48, y - rc * 0.2, z + 0.005, 0.006, hex(0x111111));
}

export function vase(k: Kit, r: R, x: number, y: number, z: number, h: number): void {
  const c = pick(r, [0x2c5aa0, 0xe8e4da, 0xa8552e, 0x2f7d6f, 0xc9a24a, 0x7a2f35].map(hex));
  k.lathe(x, z, [[h * 0.12, y], [h * 0.27, y + h * 0.35], [h * 0.22, y + h * 0.65], [h * 0.09, y + h * 0.85], [h * 0.14, y + h]], c, 8);
  if (r() < 0.5) k.lathe(x, z, [[h * 0.268, y + h * 0.3], [h * 0.26, y + h * 0.42]], hex(0xe8d8a0), 8);
}

/** a person from the waist or thighs up (the card puts the counter or the chair in front) */
export function person(k: Kit, r: R, x: number, y: number, z: number, h: number): void {
  const skin = pick(r, [0xe0b090, 0xc69070, 0x8c5a3c, 0xf0c8a8, 0x6a452e].map(hex));
  const top = pick(r, [0x2f3f5a, 0x6a2a2a, 0x3a4a3a, 0xd8d4c8, 0x444448, 0x7a6a4a, 0x1f2a38, 0x8c8c90].map(hex));
  const hair = pick(r, [0x1a1412, 0x3a2418, 0x6b4528, 0xb09060, 0x8a8a8a].map(hex));
  const headY = y + h - 0.12;
  // shoulders tapering down to the waist, arms, a neck, a head with hair
  k.lathe(x, z, [[0.13, y], [0.14, y + (h - 0.3) * 0.5], [0.165, y + h - 0.36], [0.1, y + h - 0.28], [0.05, y + h - 0.25]], top, 7);
  k.bar(x - 0.17, y + h - 0.33, x - 0.22, y + (h - 0.3) * 0.3, z + 0.04, 0.042, shade(top, 0.82));
  k.bar(x + 0.17, y + h - 0.33, x + 0.22, y + (h - 0.3) * 0.3, z + 0.04, 0.042, shade(top, 0.82));
  k.cyl(x, y + h - 0.27, z, 0.042, 0.08, skin, 6);
  k.ball(x, headY, z + 0.01, 0.092, 0.115, 0.1, skin, 7);
  k.ball(x, headY + 0.05, z - 0.004, 0.1, 0.092, 0.098, hair, 7);
}
