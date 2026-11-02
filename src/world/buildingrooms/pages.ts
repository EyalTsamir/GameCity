// The pages of the room atlas: wall modules (a bay of shelving, a kitchen run, a door...) and cards (a row of furniture standing in the
// room), each drawn once at boot in 3D and looked at from straight ahead (atlas.ts). A room kind (ROOM_KINDS) says which pages it may use,
// and every room in the city picks its own modules from them along each wall, so no two walls come out alike.

import { hex, shade, type Col, Kit } from './kit';
import * as G from './goods';
import { WINDOW_CARDS, WINDOW_DISP } from './windows';
import { shapeOn } from '../../core/sweepshape';

type R = () => number;

/** size of a wall module (m): width, height, how far it stands out from the wall at most */
export const MOD_W = 1.2;
export const MOD_H = 3.6;
export const MOD_RELIEF = 0.5;
/** a card's room (m): how far things stand in depth at most */
export const CARD_RELIEF = 1.2;

export interface WallPage {
  name: string;
  draw(k: Kit, r: R): void;
}
export interface CardPage {
  name: string;
  /** width and height of the card (m): square */
  size: number;
  draw(k: Kit, r: R): void;
}

// ── shelving ────────────────────────────────────────────────────────────────────────────────────────────────
type Fill = (k: Kit, r: R, x0: number, x1: number, y: number, h: number, zf: number, row: number) => void;

interface BayOpt {
  wood: Col;
  back?: Col;
  y0?: number;
  y1?: number;
  rows?: number;
  depth?: number;
  base?: boolean;
}
function bay(k: Kit, r: R, o: BayOpt, fill: Fill): void {
  const y0 = o.y0 ?? 0.14,
    y1 = o.y1 ?? 2.45,
    rows = o.rows ?? 6,
    d = o.depth ?? 0.34;
  const t = 0.028;
  const ux = 0.022;
  k.rect(0, o.base === false ? y0 : 0, MOD_W, y1, 0.022, o.back ?? shade(o.wood, 0.62));
  if (o.base !== false) k.box(0, 0, 0, MOD_W, y0, d, shade(o.wood, 0.55), 0.004);
  k.box(0, 0, 0, ux, y1 + t, d + 0.01, o.wood, 0.004);
  k.box(MOD_W - ux, 0, 0, MOD_W, y1 + t, d + 0.01, o.wood, 0.004);
  k.box(0, y1, 0, MOD_W, y1 + t, d + 0.01, o.wood, 0.004);
  const step = (y1 - y0) / rows;
  for (let i = 0; i < rows; i++) {
    const y = y0 + i * step;
    k.box(ux, y - t, 0, MOD_W - ux, y, d, o.wood, 0.004);
    fill(k, r, ux + 0.005, MOD_W - ux - 0.005, y, step - t - 0.012, d, i);
  }
}

const painted = (c: number) => hex(c);
const WOOD = {
  oak: hex(0x8a5e36),
  walnut: hex(0x4a2f1b),
  pine: hex(0xbf9463),
  white: hex(0xe6e2d8),
  black: hex(0x232326),
  grey: hex(0x8d9196),
  steel: hex(0xb4b8bc),
  sage: hex(0x6d7f6c),
};

const pictureWall = (k: Kit, r: R, n: number, big = false): void => {
  // a few frames hung at eye height, none lined up
  const c = 0.2 + r() * 0.8;
  for (let i = 0; i < n; i++) {
    const w = big ? 0.55 + r() * 0.35 : 0.22 + r() * 0.2;
    const h = big ? 0.6 + r() * 0.5 : 0.26 + r() * 0.26;
    const x = 0.1 + (r() * 0.5 + i) * ((MOD_W - 0.2) / n) - w * 0.2;
    const y = 1.45 + (r() - 0.5) * (big ? 0.2 : 0.5) + (i % 2) * c * 0.2;
    G.picture(k, r, x, y, Math.min(MOD_W - 0.04, x + w), y + h, 0.03);
  }
};
const skirting = (k: Kit): void => k.box(0, 0, 0, MOD_W, 0.1, 0.02, hex(0xe8e4da), 0.003);
const dado = (k: Kit, c: Col): void => {
  k.box(0, 0, 0, MOD_W, 0.95, 0.02, c, 0.004);
  k.box(0, 0.95, 0, MOD_W, 0.99, 0.035, shade(c, 1.1), 0.006);
  for (let i = 0; i < 2; i++) k.box(0.06 + i * 0.58, 0.14, 0.02, 0.56 + i * 0.58, 0.84, 0.03, shade(c, 0.94), 0.008);
};

const door = (k: Kit, c: Col, knob: Col, sign = false): void => {
  const x0 = 0.12,
    x1 = 1.04,
    y1 = 2.1;
  k.box(x0 - 0.07, 0, 0, x1 + 0.07, y1 + 0.07, 0.03, shade(c, 1.05), 0.008);
  k.box(x0, 0, 0.02, x1, y1, 0.045, c, 0.006);
  for (const [a, b] of [[0.14, 0.9], [1.02, 1.95]]) k.box(x0 + 0.1, a, 0.045, x1 - 0.1, b, 0.05, shade(c, 0.92), 0.012);
  k.ball(x1 - 0.07, 1.02, 0.07, 0.024, 0.024, 0.024, knob, 5);
  if (sign) k.box(x0 + 0.28, 2.32, 0.01, x1 - 0.28, 2.46, 0.02, hex(0x2f7d4f), 0.003); // an exit sign
};

const radiator = (k: Kit, x0: number, x1: number): void => {
  const c = hex(0xe6e2d8);
  for (let x = x0; x < x1; x += 0.055) k.box(x, 0.16, 0.04, x + 0.046, 0.72, 0.11, c, 0.012);
};

// ── wall pages by name ──────────────────────────────────────────────────────────────────────────────────────
const W: Record<string, (k: Kit, r: R) => void> = {
  // café and bar
  barBottles(k, r) {
    k.box(0, 0, 0, MOD_W, 1.05, 0.45, shade(WOOD.walnut, 0.9), 0.008);
    k.box(0, 1.05, 0, MOD_W, 1.1, 0.5, hex(0x7a6a58), 0.006);
    for (let i = 0; i < 3; i++) k.box(0.03 + i * 0.39, 0.1, 0.45, 0.38 + i * 0.39, 0.92, 0.47, shade(WOOD.walnut, 1.15), 0.01);
    bay(k, r, { wood: WOOD.walnut, back: hex(0x2a1c12), y0: 1.5, y1: 2.8, rows: 3, depth: 0.2, base: false }, (kk, rr, a, b, y, h, z) => (rr() < 0.7 ? G.bottles(kk, rr, a, b, y, h, z) : G.crockery(kk, rr, a, b, y, h, z)));
  },
  barMachine(k, r) {
    k.box(0, 0, 0, MOD_W, 1.05, 0.45, shade(WOOD.walnut, 0.9), 0.008);
    k.box(0, 1.05, 0, MOD_W, 1.1, 0.5, hex(0x7a6a58), 0.006);
    // espresso machine
    const c = hex(0xc0c4c8);
    k.box(0.22, 1.1, 0.14, 0.98, 1.55, 0.44, c, 0.02);
    k.box(0.22, 1.1, 0.42, 0.98, 1.17, 0.47, hex(0x4a4c50), 0.006);
    for (const x of [0.4, 0.8]) {
      k.box(x - 0.05, 1.26, 0.44, x + 0.05, 1.36, 0.47, hex(0x1a1a1a), 0.006);
      k.bar(x, 1.3, x, 1.2, 0.49, 0.012, hex(0x222222));
    }
    k.rect(0.3, 1.42, 0.62, 1.5, 0.441, hex(0xb02a1f));
    for (let i = 0; i < 6; i++) k.lathe(0.28 + i * 0.13, 0.3, [[0.024, 1.55], [0.034, 1.61]], hex(0xece8df), 6);
    k.box(0.05, 1.7, 0, 1.15, 2.5, 0.022, hex(0x15191a), 0.01);
    for (let i = 0; i < 9; i++) k.rect(0.12 + r() * 0.1, 2.38 - i * 0.075, 0.5 + r() * 0.5, 2.4 - i * 0.075, 0.023, hex(0xd8d6c8));
    k.box(0.03, 1.68, 0, 0.05, 2.52, 0.03, WOOD.oak, 0);
    k.box(1.15, 1.68, 0, 1.17, 2.52, 0.03, WOOD.oak, 0);
  },
  cafeWall(k, r) {
    dado(k, shade(WOOD.oak, 0.8));
    pictureWall(k, r, 1, true);
    k.box(0, 2.58, 0, MOD_W, 2.62, 0.025, shade(WOOD.oak, 0.9), 0.004);
  },
  cafeMirror(k) {
    dado(k, shade(WOOD.walnut, 1.2));
    const fr = hex(0x3a2a1c);
    k.box(0.14, 1.2, 0, 1.06, 2.4, 0.03, fr, 0.008);
    k.box(0.2, 1.26, 0.03, 1.0, 2.34, 0.034, hex(0x8e9694), 0.002);
    k.lathe(0.6, 0.1, [[0.02, 2.5], [0.07, 2.56], [0.1, 2.68]], hex(0xe8dcc0), 8);
  },
  cafeShelf(k, r) {
    dado(k, hex(0x5a6a5a));
    const w = shade(WOOD.oak, 0.9);
    k.box(0, 1.58, 0, MOD_W, 1.62, 0.2, w, 0.004);
    G.crockery(k, r, 0.04, MOD_W - 0.04, 1.62, 0.34, 0.18);
    k.box(0, 2.14, 0, MOD_W, 2.18, 0.2, w, 0.004);
    G.bottles(k, r, 0.04, MOD_W - 0.04, 2.18, 0.34, 0.18);
  },
  cafeBench(k, r) {
    const c = G.pick(r, [hex(0x6a2a2a), hex(0x2f4a44), hex(0x7a5a2a)]);
    k.box(0, 0, 0, MOD_W, 0.42, 0.5, shade(WOOD.walnut, 0.9), 0.006);
    k.box(0, 0.42, 0, MOD_W, 0.52, 0.52, c, 0.03);
    for (let i = 0; i < 4; i++) k.box(0.01 + i * 0.3, 0.52, 0, 0.29 + i * 0.3, 1.12, 0.1, shade(c, 0.94 + 0.08 * (i % 2)), 0.03);
    k.box(0, 1.12, 0, MOD_W, 1.16, 0.08, shade(WOOD.walnut, 1.1), 0.006);
    pictureWall(k, r, 1);
  },
  wineRack(k, r) {
    bay(k, r, { wood: WOOD.walnut, back: hex(0x20150e), rows: 4, depth: 0.36 }, (kk, rr, a, b, y, h, z, i) => (i < 3 ? G.wineEnds(kk, rr, a, b, y, h, z) : G.bottles(kk, rr, a, b, y, h, z)));
  },
  // bakery
  breadRack(k, r) {
    bay(k, r, { wood: WOOD.pine, back: hex(0xc9a878), y0: 0.8, y1: 2.5, rows: 4, depth: 0.36 }, (kk, rr, a, b, y, h, z, i) => (i === 3 && rr() < 0.6 ? G.baguettes(kk, rr, a, b, y, h, z) : G.loaves(kk, rr, a, b, y, h, z)));
    k.box(0, 0, 0, MOD_W, 0.8, 0.36, shade(WOOD.pine, 0.75), 0.006);
  },
  breadBaskets(k, r) {
    bay(k, r, { wood: WOOD.oak, back: hex(0xd8c8a8), y0: 0.8, y1: 2.5, rows: 3, depth: 0.36 }, (kk, rr, a, b, y, h, z) => G.baguettes(kk, rr, a, b, y, h, z));
    k.box(0, 0, 0, MOD_W, 0.8, 0.36, shade(WOOD.oak, 0.8), 0.006);
  },
  cakeShelf(k, r) {
    bay(k, r, { wood: WOOD.white, y0: 0.8, y1: 2.3, rows: 4, depth: 0.3 }, (kk, rr, a, b, y, h, z) => G.pastries(kk, rr, a, b, y, h, z));
    k.box(0, 0, 0, MOD_W, 0.8, 0.3, shade(WOOD.white, 0.85), 0.006);
  },
  // deli
  deliJars(k, r) {
    bay(k, r, { wood: WOOD.oak, back: hex(0xe8e4da), y0: 0.5, y1: 2.45, rows: 5, depth: 0.28 }, (kk, rr, a, b, y, h, z, i) => (i % 2 ? G.jars(kk, rr, a, b, y, h, z) : G.tins(kk, rr, a, b, y, h, z)));
    k.box(0, 0, 0, MOD_W, 0.5, 0.28, shade(WOOD.oak, 0.75), 0.006);
  },
  deliCheese(k, r) {
    bay(k, r, { wood: WOOD.pine, back: hex(0xe8e4da), y0: 0.5, y1: 2.2, rows: 4, depth: 0.34 }, (kk, rr, a, b, y, h, z) => G.cheeses(kk, rr, a, b, y, h, z));
    k.box(0, 0, 0, MOD_W, 0.5, 0.34, shade(WOOD.pine, 0.75), 0.006);
    G.sausages(k, r, 0.05, 1.15, 2.75, 0.2);
  },
  deliBottles(k, r) {
    bay(k, r, { wood: WOOD.walnut, back: hex(0xd8d4c8), y0: 0.5, y1: 2.45, rows: 5, depth: 0.3 }, (kk, rr, a, b, y, h, z, i) => (i === 2 ? G.cheeses(kk, rr, a, b, y, h, z) : G.bottles(kk, rr, a, b, y, h, z, [hex(0x46591e), hex(0x5a4a12), hex(0x6e2a1a), hex(0x2c4a22)])));
    k.box(0, 0, 0, MOD_W, 0.5, 0.3, shade(WOOD.walnut, 0.8), 0.006);
  },
  // books
  bookcaseDark(k, r) {
    bay(k, r, { wood: WOOD.walnut, back: hex(0x20150e), y1: 3.0, rows: 8, depth: 0.28 }, (kk, rr, a, b, y, h, z) => G.books(kk, rr, a, b, y, h, z));
  },
  bookcaseWhite(k, r) {
    bay(k, r, { wood: WOOD.white, back: hex(0xd8d4c8), y1: 2.7, rows: 7, depth: 0.28 }, (kk, rr, a, b, y, h, z) => G.books(kk, rr, a, b, y, h, z));
  },
  magRack(k, r) {
    bay(k, r, { wood: WOOD.oak, back: hex(0x3a2a1e), y1: 2.3, rows: 5, depth: 0.14 }, (kk, rr, a, b, y, h, z) => G.magazines(kk, rr, a, b, y, h, z));
  },
  // florist and grocer
  flowerSteps(k, r) {
    const wood = hex(0x6a7a6a);
    for (let i = 0; i < 3; i++) {
      const y = 0.25 + i * 0.5,
        z = 0.42 - i * 0.14;
      k.box(0, 0, 0, MOD_W, y, z, shade(wood, 0.7 + i * 0.12), 0.005);
      for (let n = 0; n < 3; n++) {
        const x = 0.2 + n * 0.4 + (r() - 0.5) * 0.06;
        G.potPlant(k, r, x, y, z - 0.08, 0.72 + r() * 0.4);
      }
    }
    G.leaves(k, r, 0.3 + r() * 0.5, 2.25, 0.05, 0.55, 0.3, 50);
  },
  greenWall(k, r) {
    G.leaves(k, r, 0.6, 1.7, 0.04, 0.64, 1.0, 180);
    for (let i = 0; i < 24; i++) k.ball(0.08 + r() * 1.04, 0.85 + r() * 1.7, 0.09, 0.03, 0.03, 0.02, G.pick(r, G.PAL.flower), 5);
    k.box(0, 0, 0, MOD_W, 0.7, 0.3, hex(0x5a4a3a), 0.006);
    for (const x of [0.25, 0.65, 1.0]) {
      G.bucket(k, x, 0.7, 0.2, 0.09, 0.26, hex(0xa8acb0));
      G.flowers(k, r, x, 0.92, 0.22, 0.26, 0.5, 11);
    }
  },
  grocerTins(k, r) {
    bay(k, r, { wood: WOOD.steel, back: hex(0xd8dadc), rows: 6, depth: 0.32 }, (kk, rr, a, b, y, h, z, i) => (i < 2 ? G.packs(kk, rr, a, b, y, h, z) : i < 4 ? G.tins(kk, rr, a, b, y, h, z) : G.bottles(kk, rr, a, b, y, h, z, G.PAL.packs)));
  },
  grocerCrates(k, r) {
    // crates raked towards the shopper
    for (let i = 0; i < 4; i++) {
      const y = 0.18 + i * 0.5;
      const z = 0.48 - i * 0.1;
      k.box(0, y - 0.18, 0, MOD_W, y - 0.14, z, hex(0x6b5a42), 0.003);
      const nc = 2;
      for (let c = 0; c < nc; c++) {
        const x0 = 0.03 + c * 0.58,
          x1 = x0 + 0.55;
        const f = G.pick(r, G.PAL.fruit);
        G.fruitPile(k, r, x0 + 0.03, x1 - 0.03, y - 0.06, z - 0.05, 0.036 + r() * 0.018, f, 3);
        G.crate(k, x0, y - 0.14, x1, y + 0.02, z, hex(0xa8865a));
      }
    }
    bay(k, r, { wood: WOOD.pine, y0: 2.3, y1: 3.0, rows: 2, depth: 0.2, base: false }, (kk, rr, a, b, y, h, z) => G.packs(kk, rr, a, b, y, h, z));
  },
  // clothes
  railWall(k, r) {
    G.hanging(k, r, 0.02, 1.18, 2.05, 0.28, 1.05);
    G.hanging(k, r, 0.02, 1.18, 1.0, 0.28, 0.8);
    k.box(0.02, 2.3, 0, 1.18, 2.33, 0.34, hex(0xe6e2d8), 0.004);
    G.folded(k, r, 0.02, 1.18, 2.33, 0.4, 0.34);
  },
  foldedShelf(k, r) {
    bay(k, r, { wood: WOOD.white, y1: 2.6, rows: 6, depth: 0.36 }, (kk, rr, a, b, y, h, z) => G.folded(kk, rr, a, b, y, h, z));
  },
  shoeWall(k, r) {
    bay(k, r, { wood: WOOD.oak, back: hex(0xd8d0c4), y1: 2.5, rows: 7, depth: 0.3 }, (kk, rr, a, b, y, h, z) => G.shoes(kk, rr, a, b, y, h, z));
  },
  shoeBoxWall(k, r) {
    bay(k, r, { wood: WOOD.walnut, y1: 2.9, rows: 4, depth: 0.32 }, (kk, rr, a, b, y, h, z) => G.shoeBoxes(kk, rr, a, b, y, h, z));
  },
  hatShelf(k, r) {
    bay(k, r, { wood: WOOD.oak, y1: 2.5, rows: 4, depth: 0.32 }, (kk, rr, a, b, y, h, z) => {
      for (let x = a + 0.17; x < b - 0.1; x += 0.36) {
        const c = G.pick(rr, G.PAL.cloth);
        k.box(x - 0.14, y, z - 0.2, x + 0.14, y + 0.03, z - 0.03, c, 0.012);
        k.ball(x, y + 0.09, z - 0.1, 0.09, Math.min(h * 0.45, 0.085), 0.09, c, 6);
        k.rect(x - 0.09, y + 0.03, x + 0.09, y + 0.055, z - 0.005, shade(c, 0.45));
      }
    });
  },
  // pharmacy, hardware, optician
  pharmacy(k, r) {
    bay(k, r, { wood: WOOD.white, back: hex(0xf0f0ec), y1: 2.5, rows: 8, depth: 0.24 }, (kk, rr, a, b, y, h, z) => G.cartons(kk, rr, a, b, y, h, z));
  },
  apothecary(k, r) {
    k.box(0, 0, 0, MOD_W, 0.9, 0.42, shade(WOOD.walnut, 1.2), 0.006);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 5; i++) {
        k.box(0.03 + i * 0.23, 0.05 + j * 0.21, 0.42, 0.24 + i * 0.23, 0.24 + j * 0.21, 0.435, shade(WOOD.walnut, 1.45), 0.005);
        k.ball(0.135 + i * 0.23, 0.145 + j * 0.21, 0.445, 0.012, 0.012, 0.012, hex(0xd8b860), 4);
      }
    bay(k, r, { wood: WOOD.walnut, back: hex(0x2a1c12), y0: 1.15, y1: 2.7, rows: 4, depth: 0.22, base: false }, (kk, rr, a, b, y, h, z) => G.bottles(kk, rr, a, b, y, h, z, [hex(0x8c5a1e), hex(0x2c4a6a), hex(0xd8d4c8)]));
  },
  pegboard(k, r) {
    k.rect(0, 0.9, MOD_W, 2.6, 0.012, hex(0xc9b28d));
    for (let y = 0.95; y < 2.6; y += 0.05) for (let x = 0.03; x < MOD_W; x += 0.05) k.disc(x, y, 0.0125, 0.005, hex(0x6a5a44), 0, 4);
    G.pegTools(k, r, 0.02, 1.18, 0.95, 2.55);
    k.box(0, 0, 0, MOD_W, 0.88, 0.42, shade(WOOD.grey, 0.9), 0.006);
    G.paintCans(k, r, 0.02, 1.18, 0.88, 0.25, 0.42);
  },
  hardwareBins(k, r) {
    bay(k, r, { wood: WOOD.grey, back: hex(0x585c60), rows: 7, depth: 0.32 }, (kk, rr, a, b, y, h, z, i) => {
      if (i < 2) return G.paintCans(kk, rr, a, b, y, h, z);
      if (i < 4) return G.packs(kk, rr, a, b, y, h, z, [hex(0xe0b23c), hex(0x2c5aa0), hex(0xc92f1f), hex(0x8d9196)]);
      const c = G.pick(rr, G.PAL.packs);
      for (let x = a; x < b - 0.1; x += 0.145) {
        kk.box(x + 0.005, y, z - 0.1, x + 0.14, y + h * 0.72, z, shade(c, 0.9 + rr() * 0.2), 0.008);
        kk.rect(x + 0.03, y + h * 0.4, x + 0.11, y + h * 0.6, z + 0.001, hex(0xf2efe6));
      }
    });
  },
  opticFrames(k, r) {
    k.rect(0, 0.9, MOD_W, 2.5, 0.012, hex(0xf2efe6));
    for (let j = 0; j < 6; j++) {
      const y = 1.02 + j * 0.25;
      k.box(0.04, y - 0.03, 0.012, 1.16, y - 0.018, 0.12, hex(0xc6c9cc), 0.002);
      for (let i = 0; i < 4; i++) {
        const x = 0.2 + i * 0.27;
        const c = G.pick(r, [0x101114, 0x6b4528, 0x2c5aa0, 0xa8322a, 0xc9a24a].map(hex));
        k.ring(x - 0.05, y + 0.03, 0.09, 0.034, 0.005, c, 10);
        k.ring(x + 0.05, y + 0.03, 0.09, 0.034, 0.005, c, 10);
      }
    }
    k.box(0, 0, 0, MOD_W, 0.88, 0.38, WOOD.white, 0.006);
  },
  bikeWall(k, r) {
    // bicycles hanging by a wheel, wheels on hooks
    const frame = G.pick(r, [0xa8322a, 0x1f4a7a, 0x1a1a1a, 0x2f7d4f].map(hex));
    const t = hex(0x15161a);
    k.ring(0.45, 2.05, 0.1, 0.33, 0.012, t);
    k.ring(0.45, 0.95, 0.1, 0.33, 0.012, t);
    k.bar(0.45, 2.05, 0.68, 1.5, 0.12, 0.013, frame);
    k.bar(0.68, 1.5, 0.45, 0.95, 0.12, 0.013, frame);
    k.bar(0.45, 1.75, 0.68, 1.5, 0.12, 0.013, frame);
    k.bar(0.45, 1.75, 0.45, 0.95, 0.12, 0.013, frame);
    k.ring(1.0, 2.5, 0.05, 0.3, 0.012, t);
    k.ring(1.0, 1.75, 0.05, 0.3, 0.012, t);
    k.box(0.75, 0.5, 0, 1.18, 1.3, 0.25, WOOD.grey, 0.005);
    G.packs(k, r, 0.76, 1.17, 0.8, 0.3, 0.25);
    G.packs(k, r, 0.76, 1.17, 0.5, 0.26, 0.25);
  },
  // gallery, antiques, toys
  galleryWall(k, r) {
    G.picture(k, r, 0.1 + r() * 0.1, 1.1 + r() * 0.2, 1.05, 2.3 + r() * 0.3, 0.03, r() < 0.6 ? hex(0xf2efe6) : hex(0x1a1a1a));
  },
  gallerySmall(k, r) {
    pictureWall(k, r, 2, true);
  },
  antiquesShelf(k, r) {
    bay(k, r, { wood: WOOD.walnut, back: hex(0x2a1c12), y1: 2.7, rows: 5, depth: 0.34 }, (kk, rr, a, b, y, h, z) => {
      let x = a + 0.06;
      while (x < b - 0.08) {
        const kind = rr();
        const w = 0.14 + rr() * 0.14;
        if (kind < 0.35) G.vase(kk, rr, x + w / 2, y, z - 0.1, Math.min(h * 0.92, 0.2 + rr() * 0.18));
        else if (kind < 0.55) G.clock(kk, x + w / 2, y + Math.min(h * 0.5, 0.1), z - 0.05, Math.min(h * 0.45, 0.09));
        else if (kind < 0.75) G.picture(kk, rr, x, y, x + w, y + Math.min(h * 0.85, w * 1.2), z - 0.1);
        else if (kind < 0.9) G.books(kk, rr, x, x + w, y, h, z - 0.05);
        x += w + 0.04;
      }
    });
  },
  antiquesWall(k, r) {
    G.clock(k, 0.35, 2.35, 0.04, 0.17);
    pictureWall(k, r, 2);
    k.box(0, 0, 0, MOD_W, 0.8, 0.42, shade(WOOD.walnut, 1.25), 0.008);
    for (let i = 0; i < 2; i++) {
      k.box(0.04 + i * 0.57, 0.08, 0.42, 0.57 + i * 0.57, 0.72, 0.44, shade(WOOD.walnut, 1.5), 0.012);
      k.ball(0.3 + i * 0.57, 0.42, 0.45, 0.014, 0.014, 0.014, hex(0xc9a24a), 4);
    }
    G.vase(k, r, 0.3, 0.8, 0.25, 0.32);
    G.vase(k, r, 0.8, 0.8, 0.25, 0.22);
  },
  toyShelf(k, r) {
    bay(k, r, { wood: WOOD.white, back: hex(0xf0e8d0), y1: 2.5, rows: 5, depth: 0.32 }, (kk, rr, a, b, y, h, z, i) => {
      if (i % 2 === 0) return G.packs(kk, rr, a, b, y, h, z);
      let x = a + 0.07;
      while (x < b - 0.1) {
        const c = G.pick(rr, G.PAL.packs);
        const kind = rr();
        if (kind < 0.35) kk.ball(x + 0.07, y + 0.07, z - 0.08, 0.07, 0.07, 0.07, c, 7);
        else if (kind < 0.6) {
          // a bear
          const f = G.pick(rr, [0xa8743a, 0xd0a868, 0x6a452e].map(hex));
          kk.ball(x + 0.07, y + 0.07, z - 0.1, 0.065, 0.07, 0.05, f, 6);
          kk.ball(x + 0.07, y + 0.17, z - 0.08, 0.05, 0.048, 0.05, f, 6);
          kk.ball(x + 0.03, y + 0.21, z - 0.09, 0.018, 0.018, 0.018, f, 5);
          kk.ball(x + 0.11, y + 0.21, z - 0.09, 0.018, 0.018, 0.018, f, 5);
        } else if (kind < 0.8) {
          for (let n = 0; n < 3; n++) kk.box(x + n * 0.008, y + n * 0.05, z - 0.1, x + 0.1 + n * 0.008, y + n * 0.05 + 0.05, z, G.pick(rr, G.PAL.packs), 0.004);
        } else {
          // a toy car
          kk.box(x, y + 0.03, z - 0.08, x + 0.18, y + 0.08, z, c, 0.012);
          kk.box(x + 0.04, y + 0.08, z - 0.07, x + 0.14, y + 0.12, z, shade(c, 0.8), 0.01);
          kk.disc(x + 0.04, y + 0.024, z + 0.001, 0.024, hex(0x111111), 0, 8);
          kk.disc(x + 0.14, y + 0.024, z + 0.001, 0.024, hex(0x111111), 0, 8);
        }
        x += 0.2;
      }
    });
  },
  // barber, records, post office
  barberMirror(k, r) {
    k.box(0.1, 0.98, 0, 1.1, 1.0, 0.25, hex(0xd8d4c8), 0.003);
    k.box(0.1, 0, 0, 1.1, 0.98, 0.25, WOOD.walnut, 0.006);
    k.box(0.14, 1.1, 0, 1.06, 2.3, 0.02, hex(0x2a2118), 0.006);
    k.box(0.18, 1.14, 0.015, 1.02, 2.26, 0.022, hex(0x9fb0b8), 0);
    k.rect(0.3, 1.5, 0.6, 2.2, 0.0225, hex(0x8ca0a8));
    for (let i = 0; i < 6; i++) G.bottle(k, 0.2 + i * 0.14, 1.0, 0.16, 0.16 + r() * 0.08, 0.026, G.pick(r, G.PAL.packs));
  },
  recordBins(k, r) {
    pictureWall(k, r, 3);
    k.box(0, 0, 0, MOD_W, 0.75, 0.42, shade(WOOD.oak, 0.8), 0.006);
    for (let i = 0; i < 22; i++) {
      const x = 0.02 + i * 0.054;
      const sleeve = G.pick(r, G.PAL.packs);
      k.box(x, 0.75, 0.18, x + 0.05, 0.75 + 0.27 + r() * 0.02, 0.4, sleeve, 0.002);
      if (shapedWindows) {
        // the top edge of the sleeve, its pale inner paper showing, an index card standing up now and then
        k.rect(x + 0.006, 0.99, x + 0.044, 1.0, 0.401, G.pick(r, G.PAL.pale));
        k.rect(x + 0.008, 0.8 + r() * 0.1, x + 0.042, 0.84 + r() * 0.1, 0.401, shade(sleeve, 0.6));
        if (i % 7 === 3) k.rect(x, 1.0, x + 0.05, 1.07, 0.402, hex(0xe8e2c8));
      }
    }
    bay(k, r, { wood: WOOD.oak, y0: 1.2, y1: 1.21, rows: 1, depth: 0.05, base: false }, () => undefined);
  },
  pigeonHoles(k, r) {
    k.box(0, 0, 0, MOD_W, 1.0, 0.42, WOOD.oak, 0.006);
    k.rect(0, 1.25, MOD_W, 2.5, 0.012, hex(0x4a3020));
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        k.box(0.03 + i * 0.23, 1.28 + j * 0.24, 0.012, 0.24 + i * 0.23, 1.3 + j * 0.24, 0.2, WOOD.oak, 0.002);
        k.box(0.03 + i * 0.23, 1.28 + j * 0.24, 0.012, 0.04 + i * 0.23, 1.52 + j * 0.24, 0.2, WOOD.oak, 0.002);
        if (r() < 0.55) k.box(0.06 + i * 0.23, 1.3 + j * 0.24, 0.1, 0.22 + i * 0.23, 1.3 + j * 0.24 + 0.04 + r() * 0.09, 0.16, G.pick(r, G.PAL.pale), 0.002);
      }
  },
  // lobby
  timberPanel(k, r) {
    for (let i = 0; i < 6; i++) k.box(i * 0.2, 0, 0, i * 0.2 + 0.196, 3.4, 0.03, shade(WOOD.oak, 0.82 + r() * 0.2), 0.002);
  },
  stoneWall(k, r) {
    for (let j = 0; j < 4; j++) k.box(0.002, j * 0.9 + 0.002, 0, 1.198, j * 0.9 + 0.898, 0.02, shade(hex(0xb8b2a4), 0.9 + r() * 0.14), 0.002);
  },
  // homes
  homeBookcase(k, r) {
    bay(k, r, { wood: G.pick(r, [WOOD.oak, WOOD.white, WOOD.walnut]), y1: 2.15, rows: 5, depth: 0.3 }, (kk, rr, a, b, y, h, z) => {
      G.books(kk, rr, a, a + (b - a) * (0.45 + rr() * 0.55), y, h, z);
      if (rr() < 0.4) G.vase(kk, rr, b - 0.14, y, z - 0.1, Math.min(h * 0.8, 0.2));
    });
    pictureWall(k, r, 1);
  },
  homePictures(k, r) {
    skirting(k);
    pictureWall(k, r, 3);
  },
  homeDresser(k, r) {
    skirting(k);
    k.box(0.08, 0, 0, 1.12, 0.82, 0.42, shade(WOOD.oak, 0.95), 0.006);
    for (let j = 0; j < 3; j++) {
      k.box(0.11, 0.08 + j * 0.25, 0.42, 1.09, 0.31 + j * 0.25, 0.435, shade(WOOD.oak, 1.1), 0.008);
      k.ball(0.6, 0.195 + j * 0.25, 0.445, 0.014, 0.014, 0.014, hex(0xc0c0b8), 4);
    }
    k.box(0.2, 1.05, 0, 1.0, 1.95, 0.02, hex(0x3a2a1e), 0.008);
    k.box(0.24, 1.09, 0.012, 0.96, 1.91, 0.022, hex(0xa4b4bc), 0);
    G.vase(k, r, 0.28, 0.82, 0.22, 0.24);
    G.picture(k, r, 0.75, 0.82, 0.98, 1.06, 0.14);
  },
  homeWardrobe(k, r) {
    skirting(k);
    const c = G.pick(r, [hex(0xe6e2d8), hex(0x8a5e36), hex(0x4a2f1b)]);
    k.box(0.02, 0, 0, 1.18, 2.25, 0.5, c, 0.008);
    for (let i = 0; i < 2; i++) {
      k.box(0.05 + i * 0.56, 0.08, 0.5, 0.59 + i * 0.56, 2.17, 0.515, shade(c, 1.05), 0.01);
      k.box(0.14 + i * 0.56, 0.22, 0.515, 0.5 + i * 0.56, 2.03, 0.52, shade(c, 0.94), 0.012);
    }
    k.box(0.56, 1.0, 0.52, 0.575, 1.22, 0.535, hex(0xb0b0a8), 0.003);
    k.box(0.625, 1.0, 0.52, 0.64, 1.22, 0.535, hex(0xb0b0a8), 0.003);
    k.box(0.3, 2.25, 0.06, 0.95, 2.5, 0.42, G.pick(r, G.PAL.cloth), 0.015);
  },
  homeKitchen(k, r) {
    const c = G.pick(r, [hex(0xe8e4d8), hex(0x6d7f6c), hex(0x2f4a5a), hex(0xb8a080)]);
    k.box(0, 0.08, 0, MOD_W, 0.86, 0.56, c, 0.005);
    k.box(0, 0, 0, MOD_W, 0.08, 0.5, hex(0x222222), 0);
    for (let i = 0; i < 2; i++) {
      k.box(0.015 + i * 0.595, 0.1, 0.56, 0.585 + i * 0.595, 0.84, 0.578, shade(c, 1.05), 0.01);
      k.box(0.25 + i * 0.595, 0.72, 0.578, 0.36 + i * 0.595, 0.735, 0.59, hex(0xb0b4b8), 0.003);
    }
    k.box(0, 0.86, 0, MOD_W, 0.9, 0.59, hex(0x6a6258), 0.003);
    k.rect(0, 0.9, MOD_W, 1.45, 0.012, hex(0xdcd8cc));
    for (let y = 0.9; y < 1.45; y += 0.1) k.rect(0, y, MOD_W, y + 0.004, 0.013, hex(0xb0ac9e));
    for (let x = 0; x < MOD_W; x += 0.1) k.rect(x, 0.9, x + 0.004, 1.45, 0.013, hex(0xb0ac9e));
    k.box(0, 1.5, 0, MOD_W, 2.25, 0.33, c, 0.005);
    for (let i = 0; i < 2; i++) k.box(0.015 + i * 0.595, 1.52, 0.33, 0.585 + i * 0.595, 2.23, 0.345, shade(c, 1.05), 0.01);
    // what stands on the worktop
    G.tins(k, r, 0.05, 0.3, 0.9, 0.2, 0.28);
    G.bottle(k, 0.42, 0.9, 0.2, 0.28, 0.03, hex(0x46591e), hex(0xe8e4da));
    G.potPlant(k, r, 0.9, 0.9, 0.22, 0.65);
  },
  homeFridge(k, r) {
    k.box(0.05, 0, 0, 1.15, 2.05, 0.6, hex(0xd8dadc), 0.012);
    k.box(0.08, 1.35, 0.6, 1.12, 2.0, 0.615, hex(0xe6e8ea), 0.008);
    k.box(0.08, 0.04, 0.6, 1.12, 1.31, 0.615, hex(0xe6e8ea), 0.008);
    k.box(0.14, 0.95, 0.615, 0.17, 1.28, 0.63, hex(0x8d9196), 0.003);
    for (let i = 0; i < 5; i++) k.rect(0.4 + r() * 0.5, 1.45 + r() * 0.4, 0.5 + r() * 0.5, 1.56 + r() * 0.4, 0.616 + i * 0.0005, G.pick(r, G.PAL.packs));
    k.box(0.05, 2.1, 0, 1.15, 2.5, 0.33, hex(0xe8e4d8), 0.006);
  },
  homeTV(k, r) {
    skirting(k);
    k.box(0.02, 0, 0, 1.18, 0.5, 0.42, shade(WOOD.walnut, 1.1), 0.006);
    k.box(0.12, 0.62, 0, 1.08, 1.2, 0.05, hex(0x0c0c0e), 0.006);
    k.rect(0.14, 0.64, 1.06, 1.18, 0.051, hex(0x101218));
    k.box(0.5, 0.5, 0.05, 0.7, 0.62, 0.1, hex(0x1a1a1a), 0.003);
    G.books(k, r, 0.1, 0.5, 0.5, 0.12, 0.3);
    pictureWall(k, r, 2);
  },
  homeDoor(k, r) {
    skirting(k);
    door(k, G.pick(r, [hex(0xe8e4da), hex(0x8a5e36), hex(0xc9b28d)]), hex(0xb8b0a0));
  },
  homePlain(k, r) {
    skirting(k);
    radiator(k, 0.2, 1.0);
    k.box(0.12, 0.74, 0, 1.08, 0.77, 0.15, hex(0xe6e2d8), 0.004);
    if (r() < 0.6) G.potPlant(k, r, 0.3 + r() * 0.5, 0.77, 0.08, 0.6);
    pictureWall(k, r, 1, true);
  },
  // office
  officeFiles(k, r) {
    k.box(0.02, 0, 0, 1.18, 1.35, 0.42, hex(0xc0c4c8), 0.004);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 2; i++) {
        k.box(0.04 + i * 0.57, 0.04 + j * 0.33, 0.42, 0.59 + i * 0.57, 0.35 + j * 0.33, 0.43, hex(0xccd0d4), 0.004);
        k.box(0.25 + i * 0.57, 0.27 + j * 0.33, 0.43, 0.38 + i * 0.57, 0.29 + j * 0.33, 0.44, hex(0x8d9196), 0.002);
      }
    G.packs(k, r, 0.04, 1.16, 1.35, 0.3, 0.3, [hex(0x2c5aa0), hex(0xb6352c), hex(0x1a1a1a), hex(0xe6e2d6)]);
    k.box(0.1, 1.9, 0, 1.1, 2.45, 0.02, hex(0xf0f0ec), 0.006);
    for (let i = 0; i < 6; i++) k.bar(0.2 + r() * 0.3, 2.35 - i * 0.07, 0.6 + r() * 0.4, 2.35 - i * 0.07, 0.021, 0.004, G.pick(r, [hex(0x1f3a7a), hex(0xb02a1f), hex(0x1a1a1a)]));
  },
  officeBoard(k, r) {
    k.box(0.03, 1.0, 0, 1.17, 2.15, 0.02, hex(0xb89a72), 0.006);
    for (let i = 0; i < 9; i++) {
      const x = 0.08 + r() * 0.85,
        y = 1.08 + r() * 0.8;
      k.rect(x, y, x + 0.15 + r() * 0.05, y + 0.2, 0.021 + i * 0.0005, G.pick(r, G.PAL.pale));
    }
    radiator(k, 0.15, 1.05);
  },
  officeDoor(k, r) {
    door(k, hex(0xb8a080), hex(0x9a9ea2), r() < 0.6);
  },
  // school
  blackboard(k) {
    k.box(0.0, 0.9, 0, 1.2, 2.1, 0.03, hex(0x8a6a3a), 0.004);
    k.rect(0.0, 0.94, 1.2, 2.06, 0.031, hex(0x1f3a2c));
    for (let i = 0; i < 6; i++) k.rect(0.1, 1.85 - i * 0.14, 0.3 + (i * 0.37) % 0.8, 1.87 - i * 0.14, 0.032, hex(0xc8d0c8));
    k.box(0.0, 0.88, 0, 1.2, 0.92, 0.08, hex(0x8a6a3a), 0.003);
  },
  pinBoard(k, r) {
    k.box(0.03, 1.0, 0, 1.17, 2.2, 0.02, hex(0xc8a878), 0.006);
    for (let i = 0; i < 8; i++) {
      const x = 0.07 + (i % 3) * 0.37 + r() * 0.03,
        y = 1.06 + Math.floor(i / 3) * 0.37;
      k.rect(x, y, x + 0.32, y + 0.32, 0.021, G.pick(r, [...G.PAL.pale, hex(0xf0d060), hex(0x90c0e0)]));
      k.disc(x + 0.16, y + 0.18, 0.022, 0.07, G.pick(r, G.PAL.packs), 0, 8);
    }
    bayLow(k, r);
  },
  // workshops and stores
  rackBoxes(k, r) {
    bay(k, r, { wood: hex(0x6a8aa8), back: hex(0x8f8f88), y1: 3.0, rows: 4, depth: 0.42 }, (kk, rr, a, b, y, h, z) => {
      for (let x = a; x < b - 0.2; x += 0.38 + rr() * 0.1) {
        const hh = h * (0.45 + rr() * 0.45);
        const c = shade(hex(0xa8865a), 0.8 + rr() * 0.3);
        kk.box(x, y, z - 0.3, x + 0.36, y + hh, z - 0.02, c, 0.005);
        kk.rect(x + 0.16, y, x + 0.2, y + hh, z - 0.019, shade(c, 1.25));
      }
    });
  },
  workBench(k, r) {
    k.rect(0, 1.0, MOD_W, 2.5, 0.012, hex(0x6a7a6a));
    G.pegTools(k, r, 0.02, 1.18, 1.05, 2.45);
    k.box(0, 0.85, 0, MOD_W, 0.92, 0.5, hex(0x8a6a3a), 0.006);
    k.box(0.05, 0, 0.1, 0.13, 0.85, 0.46, hex(0x3a3d42), 0.004);
    k.box(1.07, 0, 0.1, 1.15, 0.85, 0.46, hex(0x3a3d42), 0.004);
    k.box(0.5, 0.2, 0, 1.0, 0.75, 0.42, hex(0x4a5a7a), 0.006);
  },
  // the stair hall behind a door
  hall(k, r) {
    dado(k, hex(0xb0a890));
    if (r() < 0.5) for (let i = 0; i < 4; i++) k.box(0.1 + i * 0.26, 1.2, 0, 0.33 + i * 0.26, 1.55, 0.05, hex(0x8a8e92), 0.004);
    else G.picture(k, r, 0.3, 1.4, 0.9, 2.1, 0.03);
  },
  blank(k) {
    skirting(k);
  },
};

function bayLow(k: Kit, r: R): void {
  k.box(0, 0, 0, MOD_W, 0.7, 0.34, WOOD.white, 0.005);
  G.books(k, r, 0.04, 0.9, 0.7, 0.26, 0.28);
}

export const WALL_PAGES: WallPage[] = Object.entries(W).map(([name, draw]) => ({ name, draw }));

// ── cards ───────────────────────────────────────────────────────────────────────────────────────────────────
const chair = (k: Kit, x: number, z: number, c: Col, face: number): void => {
  // seen from the front or the side
  if (face === 0) {
    k.bar(x - 0.17, 0, x - 0.19, 0.46, z, 0.013, c);
    k.bar(x + 0.17, 0, x + 0.19, 0.46, z, 0.013, c);
    k.box(x - 0.21, 0.44, z - 0.02, x + 0.21, 0.48, z + 0.03, shade(c, 1.1), 0.012);
    k.bar(x - 0.18, 0.46, x - 0.18, 0.86, z - 0.02, 0.012, c);
    k.bar(x + 0.18, 0.46, x + 0.18, 0.86, z - 0.02, 0.012, c);
    k.box(x - 0.2, 0.68, z - 0.03, x + 0.2, 0.86, z - 0.015, c, 0.008);
  } else {
    k.bar(x - 0.18 * face, 0, x - 0.18 * face, 0.86, z, 0.013, c);
    k.bar(x + 0.18 * face, 0, x + 0.18 * face, 0.46, z, 0.013, c);
    k.box(x - 0.2, 0.44, z - 0.02, x + 0.2, 0.48, z + 0.02, shade(c, 1.1), 0.012);
  }
};
const table = (k: Kit, x0: number, x1: number, top: number, z: number, c: Col, round = false): void => {
  k.box(x0, top - 0.04, z - 0.1, x1, top, z, shade(c, 1.1), 0.012);
  if (round) {
    const m = (x0 + x1) / 2;
    k.bar(m, 0, m, top - 0.04, z - 0.04, 0.03, shade(c, 0.5));
    k.box(m - 0.2, 0, z - 0.1, m + 0.2, 0.03, z, shade(c, 0.5), 0.008);
  } else {
    k.bar(x0 + 0.05, 0, x0 + 0.05, top - 0.04, z - 0.02, 0.022, shade(c, 0.8));
    k.bar(x1 - 0.05, 0, x1 - 0.05, top - 0.04, z - 0.02, 0.022, shade(c, 0.8));
  }
};
const standLamp = (k: Kit, x: number, z: number): void => {
  k.bar(x, 0.02, x, 1.45, z, 0.012, hex(0x3a3028));
  k.box(x - 0.13, 0, z - 0.1, x + 0.13, 0.03, z + 0.05, hex(0x3a3028), 0.01);
  k.lathe(x, z, [[0.2, 1.4], [0.13, 1.68]], hex(0xf0e0c0), 8);
};
const counter = (k: Kit, r: R, x0: number, x1: number, c: Col, top: Col, h = 1.05): void => {
  k.box(x0, 0.08, 0.7, x1, h - 0.04, 1.0, c, 0.008);
  k.box(x0 + 0.02, 0, 0.72, x1 - 0.02, 0.08, 0.98, shade(c, 0.4), 0);
  const n = Math.max(2, Math.floor((x1 - x0) / 0.62));
  for (let i = 0; i < n; i++) {
    const w = (x1 - x0) / n;
    k.box(x0 + i * w + 0.02, 0.14, 1.0, x0 + (i + 1) * w - 0.02, h - 0.1, 1.012, shade(c, 1.1), 0.012);
  }
  k.box(x0 - 0.02, h - 0.04, 0.68, x1 + 0.02, h, 1.04, top, 0.008);
};
const till = (k: Kit, x: number, h: number): void => {
  k.box(x - 0.14, h, 0.82, x + 0.14, h + 0.1, 1.0, hex(0x25272a), 0.01);
  k.box(x - 0.13, h + 0.14, 0.82, x + 0.13, h + 0.33, 0.86, hex(0x15171a), 0.006);
  k.rect(x - 0.11, h + 0.16, x + 0.11, h + 0.31, 0.861, hex(0x3a6a8a));
  k.bar(x, h + 0.1, x, h + 0.15, 0.84, 0.02, hex(0x25272a));
};
const glassCabinet = (k: Kit, x0: number, x1: number, h: number, fill: (y: number, h: number) => void): void => {
  k.box(x0, 0, 0.7, x1, 0.52, 1.0, hex(0xb8bcc0), 0.006);
  fill(0.54, h - 0.56);
  k.box(x0, 0.52, 0.72, x1, 0.54, 1.0, hex(0xe0e2e0), 0.002);
  k.box(x0, h - 0.02, 0.72, x1, h, 1.0, hex(0xe0e2e0), 0.003);
  k.bar(x0 + 0.01, 0.54, x0 + 0.01, h, 1.0, 0.008, hex(0xb8bcc0));
  k.bar(x1 - 0.01, 0.54, x1 - 0.01, h, 1.0, 0.008, hex(0xb8bcc0));
};
/** a double-sided gondola of shelves, seen from its end... from its side */
const gondola = (k: Kit, r: R, x0: number, x1: number, h: number, fill: G.Filler): void => {
  const rows = Math.floor(h / 0.36);
  const c = hex(0xc8ccd0);
  k.box(x0, 0, 0.3, x1, 0.14, 0.92, shade(c, 0.5), 0.004);
  k.rect(x0, 0.14, x1, h, 0.32, shade(c, 0.8));
  for (let i = 0; i < rows; i++) {
    const y = 0.16 + (i * (h - 0.16)) / rows;
    k.box(x0, y - 0.02, 0.32, x1, y, 0.82, c, 0.003);
    fill(k, r, x0 + 0.02, x1 - 0.02, y, (h - 0.16) / rows - 0.05, 0.82, i);
  }
};

const C: Record<string, { size: number; draw(k: Kit, r: R): void }> = {
  // S = 3 m: stands in the middle of the room; S = 2 m: in the window
  cafeTables: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, [hex(0x5a3a22), hex(0x2a2a2c), hex(0xd8d0c0)]);
      const wood = G.pick(r, [hex(0x6b4528), hex(0x1a1a1c)]);
      table(k, 0.42, 1.12, 0.74, 0.7, c, true);
      chair(k, 0.2, 0.7, wood, -1);
      chair(k, 1.36, 0.7, wood, 1);
      k.lathe(0.68, 0.66, [[0.028, 0.74], [0.038, 0.82]], hex(0xece8df), 6);
      table(k, 1.92, 2.62, 0.74, 0.5, c, true);
      chair(k, 1.7, 0.5, wood, -1);
      chair(k, 2.84, 0.5, wood, 1);
      k.lathe(2.3, 0.45, [[0.028, 0.74], [0.038, 0.82]], hex(0xece8df), 6);
    },
  },
  cafeGuests: {
    size: 3,
    draw(k, r) {
      const wood = G.pick(r, [hex(0x6b4528), hex(0x1a1a1c)]);
      const c = hex(0x5a3a22);
      chair(k, 0.2, 0.6, wood, -1);
      G.person(k, r, 0.28, 0.48, 0.65, 0.84);
      chair(k, 1.36, 0.6, wood, 1);
      if (r() < 0.6) G.person(k, r, 1.28, 0.48, 0.65, 0.8);
      table(k, 0.42, 1.12, 0.74, 0.86, c, true);
      k.lathe(0.68, 0.8, [[0.028, 0.74], [0.038, 0.82]], hex(0xece8df), 6);
      table(k, 1.92, 2.62, 0.74, 0.5, c, true);
      chair(k, 1.7, 0.5, wood, -1);
      chair(k, 2.84, 0.5, wood, 1);
      G.person(k, r, 2.76, 0.48, 0.55, 0.82);
      k.box(2.1, 0.74, 0.46, 2.34, 0.76, 0.5, hex(0xf0ece0), 0.002);
    },
  },
  // someone walking behind the counter, side-on: two frames of a stride each, in this order (ROOM_FRAG picks by the ground covered)
  walk0a: { size: 2, draw: (k) => G.walker(k, 1, 0.5, 1.74, 0.2, hex(0xe0b090), hex(0xd8d4c8), hex(0x24262c), hex(0x3a2418)) },
  walk0b: { size: 2, draw: (k) => G.walker(k, 1, 0.5, 1.74, 0.045, hex(0xe0b090), hex(0xd8d4c8), hex(0x24262c), hex(0x3a2418)) },
  walk1a: { size: 2, draw: (k) => G.walker(k, 1, 0.5, 1.63, 0.18, hex(0x8c5a3c), hex(0x2f3f5a), hex(0x4a4a50), hex(0x1a1412)) },
  walk1b: { size: 2, draw: (k) => G.walker(k, 1, 0.5, 1.63, 0.04, hex(0x8c5a3c), hex(0x2f3f5a), hex(0x4a4a50), hex(0x1a1412)) },
  walk2a: { size: 2, draw: (k) => G.walker(k, 1, 0.5, 1.68, 0.19, hex(0xf0c8a8), hex(0x6a2a2a), hex(0x2a2a34), hex(0xb09060)) },
  walk2b: { size: 2, draw: (k) => G.walker(k, 1, 0.5, 1.68, 0.042, hex(0xf0c8a8), hex(0x6a2a2a), hex(0x2a2a34), hex(0xb09060)) },
  shopCounter: {
    size: 3,
    draw(k, r) {
      counter(k, r, 0.25, 2.75, G.pick(r, [hex(0x6b4528), hex(0xd8d4c8), hex(0x3a4a4a)]), hex(0xb8ac98));
      till(k, 0.75 + r() * 1.5, 1.05);
      if (r() < 0.7) G.person(k, r, 1.5 + (r() - 0.5) * 1.2, 0.6, 0.45, 1.05);
      G.packs(k, r, 1.8, 2.5, 1.05, 0.22, 0.95);
    },
  },
  shopCounter2: {
    size: 3,
    draw(k, r) {
      counter(k, r, 0.1, 2.0, hex(0x8a5e36), hex(0x4a2f1b));
      till(k, 0.5, 1.05);
      G.books(k, r, 1.1, 1.8, 1.05, 0.25, 0.92);
      G.floorPlant(k, r, 2.5, 0.6, 1.1);
    },
  },
  bakeryCounter: {
    size: 3,
    draw(k, r) {
      glassCabinet(k, 0.2, 2.8, 1.3, (y, h) => {
        const b = 2;
        for (let i = 0; i < b; i++) {
          k.box(0.25, y + (i * h) / b - 0.01, 0.74, 2.75, y + (i * h) / b, 0.98, hex(0xe0e2e0), 0.002);
          G.pastries(k, r, 0.28, 2.72, y + (i * h) / b, (h / b) * 0.7, 0.96);
        }
      });
      till(k, 2.3, 1.3);
      G.person(k, r, 1.2, 0.8, 0.4, 0.92);
    },
  },
  deliCounter: {
    size: 3,
    draw(k, r) {
      glassCabinet(k, 0.2, 2.8, 1.25, (y) => {
        G.cheeses(k, r, 0.25, 1.6, y, 0.2, 0.98);
        G.loaves(k, r, 1.6, 2.75, y, 0.2, 0.98);
      });
      G.person(k, r, 0.9 + r(), 0.8, 0.4, 0.92);
      G.sausages(k, r, 0.3, 2.7, 2.4, 0.3);
    },
  },
  bookTable: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, [hex(0x6b4528), hex(0xbf9463)]);
      table(k, 0.3, 2.7, 0.76, 1.0, c);
      let x = 0.36;
      while (x < 2.5) {
        const n = 2 + Math.floor(r() * 5);
        for (let i = 0; i < n; i++) k.box(x + (r() - 0.5) * 0.015, 0.76 + i * 0.034, 0.8, x + 0.24, 0.76 + i * 0.034 + 0.032, 0.98, G.pick(r, G.PAL.book), 0.003);
        x += 0.3;
      }
    },
  },
  gondolaPacks: {
    size: 3,
    draw(k, r) {
      gondola(k, r, 0.2, 2.8, 1.6, (kk, rr, a, b, y, h, z) => G.packs(kk, rr, a, b, y, h, z));
    },
  },
  gondolaTins: {
    size: 3,
    draw(k, r) {
      gondola(k, r, 0.3, 2.7, 1.45, (kk, rr, a, b, y, h, z, i) => (i % 2 ? G.tins(kk, rr, a, b, y, h, z) : G.packs(kk, rr, a, b, y, h, z)));
    },
  },
  gondolaBoxes: {
    size: 3,
    draw(k, r) {
      gondola(k, r, 0.2, 2.8, 1.35, (kk, rr, a, b, y, h, z) => G.cartons(kk, rr, a, b, y, h, z));
    },
  },
  gondolaTools: {
    size: 3,
    draw(k, r) {
      k.box(0.2, 0, 0.5, 2.8, 0.5, 1.0, hex(0x8d9196), 0.006);
      G.paintCans(k, r, 0.25, 2.75, 0.5, 0.24, 1.0);
      k.rect(0.2, 0.8, 2.8, 1.75, 0.55, hex(0xc9b28d));
      G.pegTools(k, r, 0.25, 2.75, 0.85, 1.72);
    },
  },
  clothesRail: {
    size: 3,
    draw(k, r) {
      const c = hex(0xb0b4b8);
      k.bar(0.35, 0, 0.35, 1.55, 0.7, 0.014, c);
      k.bar(2.65, 0, 2.65, 1.55, 0.7, 0.014, c);
      G.hanging(k, r, 0.38, 2.62, 1.52, 0.7, 1.15);
      k.box(0.2, 0, 0.6, 0.5, 0.03, 0.8, c, 0.003);
      k.box(2.5, 0, 0.6, 2.8, 0.03, 0.8, c, 0.003);
    },
  },
  shoeBench: {
    size: 3,
    draw(k, r) {
      k.box(0.3, 0.3, 0.4, 1.5, 0.46, 0.85, G.pick(r, G.PAL.cloth), 0.03);
      k.bar(0.4, 0, 0.4, 0.3, 0.6, 0.02, hex(0x222222));
      k.bar(1.4, 0, 1.4, 0.3, 0.6, 0.02, hex(0x222222));
      k.box(1.8, 0, 0.5, 2.7, 0.75, 0.95, WOOD.white, 0.006);
      G.shoes(k, r, 1.82, 2.68, 0.75, 0.2, 0.92);
    },
  },
  flowerStand: {
    size: 3,
    draw(k, r) {
      table(k, 0.2, 1.7, 0.72, 0.8, hex(0x6b5a42));
      for (let x = 0.4; x < 1.6; x += 0.42) {
        G.bucket(k, x, 0.72, 0.7, 0.09, 0.24, hex(0xa8acb0));
        G.flowers(k, r, x, 0.92, 0.72, 0.3, 0.55, 13);
      }
      G.floorPlant(k, r, 2.3, 0.6, 1.25);
    },
  },
  galleryPlinth: {
    size: 3,
    draw(k, r) {
      k.box(1.1, 0, 0.6, 1.8, 1.0, 1.0, hex(0xf0efe8), 0.004);
      G.vase(k, r, 1.45, 1.0, 0.8, 0.55);
    },
  },
  bench: {
    size: 3,
    draw(k, r) {
      k.box(0.8, 0.38, 0.5, 2.2, 0.46, 0.9, G.pick(r, [hex(0x2a2a2c), hex(0x6b4528)]), 0.01);
      for (const x of [0.92, 2.08]) k.bar(x, 0, x, 0.38, 0.7, 0.02, hex(0x1a1a1a));
    },
  },
  toyTable: {
    size: 3,
    draw(k, r) {
      table(k, 0.4, 2.6, 0.7, 0.95, hex(0xe8d8b0));
      for (let x = 0.55; x < 2.4; x += 0.28) {
        const c = G.pick(r, G.PAL.packs);
        if (r() < 0.5) k.ball(x, 0.79, 0.85, 0.09, 0.09, 0.09, c, 7);
        else k.box(x - 0.1, 0.7, 0.75, x + 0.1, 0.7 + 0.1 + r() * 0.2, 0.92, c, 0.008);
      }
    },
  },
  receptionDesk: {
    size: 3,
    draw(k, r) {
      counter(k, r, 0.7, 2.3, G.pick(r, [hex(0x5a3a22), hex(0xd8d4c8), hex(0x2a2a2c)]), hex(0xd8d0c0), 1.1);
      G.person(k, r, 1.3 + r() * 0.5, 0.7, 0.4, 1.0);
      k.box(1.75, 1.1, 0.8, 2.1, 1.38, 0.84, hex(0x15171a), 0.004);
    },
  },
  lobbySeats: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, G.PAL.cloth);
      for (const x of [0.55, 1.5]) {
        k.box(x - 0.4, 0.14, 0.45, x + 0.4, 0.45, 0.95, c, 0.05);
        k.box(x - 0.42, 0.42, 0.4, x + 0.42, 0.85, 0.56, shade(c, 0.9), 0.05);
      }
      G.floorPlant(k, r, 2.45, 0.7, 1.3);
    },
  },
  barberChairs: {
    size: 3,
    draw(k, r) {
      for (const x of [0.75, 2.2]) {
        const c = hex(0x7a2a22);
        k.box(x - 0.14, 0, 0.5, x + 0.14, 0.04, 0.8, hex(0xb0b4b8), 0.008);
        k.bar(x, 0.04, x, 0.42, 0.65, 0.04, hex(0xb0b4b8));
        k.box(x - 0.28, 0.42, 0.45, x + 0.28, 0.62, 0.8, c, 0.04);
        k.box(x - 0.26, 0.6, 0.43, x + 0.26, 1.15, 0.55, c, 0.05);
        k.box(x - 0.34, 0.62, 0.55, x - 0.27, 0.72, 0.8, hex(0xb0b4b8), 0.012);
        k.box(x + 0.27, 0.62, 0.55, x + 0.34, 0.72, 0.8, hex(0xb0b4b8), 0.012);
      }
      G.person(k, r, 1.45, 0, 0.55, 1.7);
    },
  },
  // windows: S = 2 m
  dispMannequins: {
    size: 2,
    draw(k, r) {
      if (shapedWindows) {
        for (const [x, hatted] of [[0.55, r() < 0.4], [1.45, r() < 0.4]] as const) {
          // a figure with a real waist and shoulders, a slope to the arms, a dress with a belt; a round foot, a hat with a brim
          const c = G.pick(r, G.PAL.cloth);
          const s = hex(0xe8e0d4),
            z = 0.45;
          k.lathe(x, z, [[0.17, 0], [0.17, 0.018], [0.02, 0.03]], hex(0x8a8c8e), 10);
          k.bar(x, 0.02, x, 0.5, z - 0.03, 0.012, hex(0x9a9ea2));
          k.lathe(x, z, [[0.27, 0.42], [0.235, 0.7], [0.185, 0.92], [0.135, 1.1], [0.128, 1.14], [0.165, 1.26], [0.17, 1.33], [0.14, 1.4], [0.075, 1.45], [0.04, 1.47]], c, 10);
          k.lathe(x, z, [[0.132, 1.09], [0.13, 1.13]], shade(c, 0.45), 10);
          for (const sd of [-1, 1]) {
            k.ball(x + sd * 0.165, 1.385, z, 0.05, 0.05, 0.05, c, 7);
            k.bar(x + sd * 0.2, 1.385, x + sd * 0.235, 1.12, z + 0.02, 0.036, shade(c, 0.92));
            k.bar(x + sd * 0.235, 1.12, x + sd * 0.22, 0.88, z + 0.04, 0.03, shade(c, 0.92));
            k.ball(x + sd * 0.22, 0.86, z + 0.04, 0.026, 0.045, 0.02, s, 6);
          }
          k.cyl(x, 1.46, z, 0.038, 0.08, s, 6);
          k.ball(x, 1.62, z, 0.082, 0.11, 0.09, s, 8);
          if (hatted) {
            const b = shade(c, 0.6);
            k.lathe(x, z, [[0.17, 1.69], [0.17, 1.695], [0.09, 1.705]], b, 10);
            k.lathe(x, z, [[0.09, 1.705], [0.085, 1.76], [0.06, 1.785], [0.001, 1.79]], b, 10);
          }
        }
        return;
      }
      for (const x of [0.55, 1.45]) {
        const c = G.pick(r, G.PAL.cloth);
        const s = hex(0xe8e0d4);
        k.box(x - 0.16, 0, 0.3, x + 0.16, 0.025, 0.6, hex(0x9a9ea2), 0.006);
        k.bar(x, 0.02, x, 0.5, 0.42, 0.012, hex(0x9a9ea2));
        // long coat or a dress over the body, a pale head
        k.lathe(x, 0.45, [[0.24, 0.42], [0.17, 1.0], [0.13, 1.2], [0.21, 1.42], [0.09, 1.48]], c, 8);
        k.bar(x - 0.21, 1.4, x - 0.25, 0.85, 0.48, 0.04, shade(c, 0.88));
        k.bar(x + 0.21, 1.4, x + 0.25, 0.85, 0.48, 0.04, shade(c, 0.88));
        k.cyl(x, 1.46, 0.45, 0.04, 0.07, s, 6);
        k.ball(x, 1.62, 0.45, 0.085, 0.11, 0.09, s, 7);
        if (r() < 0.5) k.box(x - 0.13, 1.68, 0.38, x + 0.13, 1.7, 0.52, shade(c, 0.5), 0.008);
      }
    },
  },
  dispStand: {
    size: 2,
    draw(k, r) {
      const c = G.pick(r, [hex(0xf0efe8), hex(0x6b4528), hex(0x2a2a2c)]);
      k.box(0.05, 0, 0.1, 0.95, 0.42, 0.55, c, 0.006);
      k.box(1.05, 0, 0.1, 1.95, 0.72, 0.55, c, 0.006);
      G.packs(k, r, 0.08, 0.92, 0.42, 0.28, 0.5);
      G.packs(k, r, 1.08, 1.92, 0.72, 0.3, 0.5);
    },
  },
  dispBoxes: {
    size: 2,
    draw(k, r) {
      k.box(0.1, 0, 0.1, 1.9, 0.62, 0.5, hex(0xe8e4da), 0.006);
      G.cartons(k, r, 0.12, 1.88, 0.62, 0.26, 0.42);
      for (const x of [0.5, 1.45]) k.lathe(x, 0.3, [[0.18, 0.88], [0.04, 1.3], [0.04, 1.35]], G.pick(r, G.PAL.packs), 7);
    },
  },
  dispBooks: {
    size: 2,
    draw(k, r) {
      // stepped risers: covers facing out on little stands, stacks between them
      const riser = G.pick(r, [hex(0x6b4528), hex(0xd8cdb4), hex(0x3a3f46)]);
      for (let i = 0; i < 3; i++) {
        const y = 0.12 + i * 0.26,
          z = 0.5 - i * 0.13;
        k.box(0.06, 0, 0.05, 1.94, y, z, shade(riser, 0.9 + i * 0.06), 0.005);
        let x = 0.1;
        while (x < 1.76) {
          const c = G.pick(r, G.PAL.book);
          if (r() < 0.3) {
            const n = 2 + Math.floor(r() * 5);
            for (let b = 0; b < n; b++) k.box(x + (r() - 0.5) * 0.01, y + b * 0.028, z - 0.12, x + 0.15, y + b * 0.028 + 0.026, z - 0.02, G.pick(r, G.PAL.book), 0.003);
            x += 0.17;
          } else {
            const w = 0.12 + r() * 0.04,
              h = w * (1.35 + r() * 0.2);
            G.bookCover(k, r, x, y, x + w, y + h, z - 0.04, c);
            x += w + 0.015 + r() * 0.02;
          }
        }
      }
    },
  },
  dispBread: {
    size: 2,
    draw(k, r) {
      k.box(0.08, 0, 0.1, 1.92, 0.68, 0.55, hex(0x8a6236), 0.006);
      k.box(0.05, 0.68, 0.08, 1.95, 0.72, 0.58, hex(0xbf9463), 0.005);
      G.loaves(k, r, 0.1, 1.2, 0.72, 0.24, 0.55);
      G.baguettes(k, r, 1.22, 1.9, 0.72, 0.8, 0.55);
    },
  },
  dispFruit: {
    size: 2,
    draw(k, r) {
      for (let c = 0; c < 3; c++) {
        const x0 = 0.05 + c * 0.65,
          x1 = x0 + 0.6;
        G.fruitPile(k, r, x0 + 0.03, x1 - 0.03, 0.5, 0.42, 0.04 + r() * 0.015, G.pick(r, G.PAL.fruit), 3);
        G.crate(k, x0, 0.32, x1, 0.56, 0.5, hex(0xa8865a));
        k.bar(x0 + 0.05, 0, x0 + 0.05, 0.32, 0.4, 0.016, hex(0x6b5a42));
        k.bar(x1 - 0.05, 0, x1 - 0.05, 0.32, 0.4, 0.016, hex(0x6b5a42));
      }
    },
  },
  dispBuckets: {
    size: 2,
    draw(k, r) {
      for (let x = 0.22; x < 1.9; x += 0.4) {
        const h = 0.2 + r() * 0.2;
        k.box(x - 0.15, 0, 0.2, x + 0.15, h, 0.4, hex(0x4a4a44), 0.004);
        G.bucket(k, x, h, 0.35, 0.1, 0.28, hex(0xa8acb0));
        G.flowers(k, r, x, h + 0.22, 0.38, 0.34, 0.6, 14);
      }
    },
  },
  dispBottles: {
    size: 2,
    draw(k, r) {
      k.box(0.2, 0, 0.1, 1.8, 0.55, 0.5, hex(0x5a3a22), 0.006);
      G.bottles(k, r, 0.25, 1.75, 0.55, 0.36, 0.48);
      k.box(0.65, 0.9, 0.15, 1.35, 0.93, 0.4, hex(0x8a5e36), 0.005);
      G.bottles(k, r, 0.68, 1.32, 0.93, 0.36, 0.38);
      k.bar(0.72, 0.55, 0.72, 0.9, 0.3, 0.012, hex(0x4a2f1b));
      k.bar(1.28, 0.55, 1.28, 0.9, 0.3, 0.012, hex(0x4a2f1b));
    },
  },
  dispObject: {
    size: 2,
    draw(k, r) {
      k.box(0.72, 0, 0.1, 1.28, 0.9, 0.5, hex(0xf0efe8), 0.004);
      if (r() < 0.5) G.vase(k, r, 1, 0.9, 0.32, 0.5);
      else G.clock(k, 1, 1.15, 0.3, 0.23);
    },
  },
  dispToys: {
    size: 2,
    draw(k, r) {
      k.box(0.1, 0, 0.1, 1.9, 0.45, 0.5, hex(0xe8d8b0), 0.006);
      for (let x = 0.25; x < 1.8; x += 0.32) {
        const c = G.pick(r, G.PAL.packs);
        if (r() < 0.5) k.ball(x, 0.55, 0.38, 0.1, 0.1, 0.1, c, 7);
        else k.box(x - 0.1, 0.45, 0.28, x + 0.1, 0.65 + r() * 0.25, 0.44, c, 0.008);
      }
    },
  },
  dispBike: {
    size: 2,
    draw(k, r) {
      const f = G.pick(r, [0xa8322a, 0x1f4a7a, 0x2f7d4f, 0x15161a].map(hex));
      const t = hex(0x15161a);
      k.ring(0.5, 0.36, 0.3, 0.33, 0.014, t);
      k.ring(1.55, 0.36, 0.3, 0.33, 0.014, t);
      k.bar(0.5, 0.36, 0.86, 0.34, 0.31, 0.015, f);
      k.bar(0.86, 0.34, 1.32, 0.82, 0.31, 0.017, f);
      k.bar(0.72, 0.84, 1.32, 0.82, 0.31, 0.017, f);
      k.bar(0.72, 0.84, 0.86, 0.34, 0.31, 0.017, f);
      k.bar(0.72, 0.84, 0.5, 0.36, 0.31, 0.012, f);
      k.bar(1.32, 0.82, 1.55, 0.36, 0.31, 0.015, f);
      k.bar(1.32, 0.82, 1.28, 1.0, 0.31, 0.012, f);
      k.bar(1.15, 1.02, 1.42, 1.0, 0.33, 0.012, hex(0x222222));
      k.bar(0.72, 0.84, 0.69, 0.96, 0.31, 0.012, f);
      k.box(0.58, 0.96, 0.27, 0.8, 1.0, 0.35, hex(0x222222), 0.012);
    },
  },
  dispSign: {
    size: 2,
    draw(k, r) {
      // a sandwich board standing in the window, a plant beside it
      k.box(0.3, 0, 0.3, 0.95, 1.05, 0.34, hex(0x15191a), 0.008);
      for (let i = 0; i < 6; i++) k.rect(0.38, 0.85 - i * 0.12, 0.6 + r() * 0.27, 0.865 - i * 0.12, 0.341, hex(0xd8d6c8));
      G.floorPlant(k, r, 1.45, 0.3, 0.85);
    },
  },
  // homes: S = 3 m
  sofaRow: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, G.PAL.cloth);
      k.box(0.35, 0.12, 0.25, 2.25, 0.46, 0.85, c, 0.05);
      k.box(0.33, 0.44, 0.2, 2.27, 0.9, 0.42, shade(c, 0.92), 0.06);
      k.box(0.25, 0.12, 0.2, 0.48, 0.66, 0.9, shade(c, 1.05), 0.06);
      k.box(2.12, 0.12, 0.2, 2.35, 0.66, 0.9, shade(c, 1.05), 0.06);
      for (const x of [0.6, 1.3 + r() * 0.5]) k.box(x, 0.46, 0.42, x + 0.42, 0.82, 0.54, G.pick(r, G.PAL.cloth), 0.05);
      k.box(1, 0.3, 1.0, 1.7, 0.34, 1.12, shade(G.PAL.wood[0], 1), 0.01);
      standLamp(k, 2.7, 0.3);
      G.books(k, r, 1.1, 1.5, 0.34, 0.06, 1.1);
    },
  },
  armchairPlant: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, G.PAL.cloth);
      k.box(0.5, 0.2, 0.4, 1.3, 0.48, 0.9, c, 0.05);
      k.box(0.48, 0.48, 0.34, 1.32, 1.0, 0.5, shade(c, 0.92), 0.06);
      k.box(0.4, 0.2, 0.34, 0.6, 0.65, 0.92, shade(c, 1.05), 0.05);
      k.box(1.2, 0.2, 0.34, 1.4, 0.65, 0.92, shade(c, 1.05), 0.05);
      G.floorPlant(k, r, 2.3, 0.5, 1.2);
      standLamp(k, 1.65, 0.25);
    },
  },
  diningRow: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, G.PAL.wood);
      chair(k, 0.75, 0.42, c, 0);
      chair(k, 1.5, 0.42, c, 0);
      chair(k, 2.25, 0.42, c, 0);
      table(k, 0.35, 2.65, 0.76, 0.85, shade(c, 1.1));
      G.vase(k, r, 1.5, 0.76, 0.72, 0.28);
      for (const x of [0.8, 2.2]) k.disc(x, 0.77, 0.86, 0.06, hex(0xf0ece0), 0.4, 8);
    },
  },
  bedRow: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, G.PAL.cloth);
      const w = G.pick(r, G.PAL.wood);
      // a bed seen along its length: headboard behind, quilt coming towards the window
      k.box(0.55, 0, 0.15, 2.45, 1.05, 0.22, w, 0.012);
      k.box(0.6, 0.18, 0.22, 2.4, 0.5, 0.95, hex(0xe8e4da), 0.03);
      k.box(0.58, 0.28, 0.5, 2.42, 0.58, 1.05, c, 0.05);
      for (const x of [0.72, 1.52]) k.box(x, 0.48, 0.22, x + 0.72, 0.68, 0.44, hex(0xf2efe6), 0.05);
      k.box(0.05, 0, 0.1, 0.48, 0.55, 0.5, w, 0.006);
      k.lathe(0.26, 0.28, [[0.08, 0.55], [0.03, 0.75], [0.1, 0.8], [0.06, 1.0]], hex(0xf0e0c0), 8);
      k.box(2.52, 0, 0.1, 2.95, 0.55, 0.5, w, 0.006);
    },
  },
  deskRow: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, G.PAL.wood);
      table(k, 0.5, 2.1, 0.74, 0.55, c);
      k.box(1.1, 0.78, 0.3, 1.6, 1.12, 0.33, hex(0x15171a), 0.006);
      k.rect(1.12, 0.8, 1.58, 1.1, 0.331, hex(0x2a3a4a));
      k.box(1.32, 0.74, 0.3, 1.38, 0.78, 0.36, hex(0x15171a), 0);
      G.books(k, r, 0.6, 1.0, 0.74, 0.25, 0.5);
      k.lathe(1.9, 0.45, [[0.07, 0.74], [0.015, 0.78], [0.015, 1.05], [0.09, 1.12], [0.04, 1.2]], hex(0x2a2a2c), 6);
      chair(k, 1.3, 0.8, G.pick(r, [hex(0x2a2a2c), hex(0x2c4a6a)]), 0);
      G.floorPlant(k, r, 2.6, 0.3, 0.9);
    },
  },
  kitchenTable: {
    size: 3,
    draw(k, r) {
      const c = G.pick(r, [hex(0xbf9463), hex(0xe6e2d8)]);
      chair(k, 0.5, 0.5, c, -1);
      chair(k, 2.1, 0.5, c, 1);
      table(k, 0.75, 1.85, 0.74, 0.8, c);
      k.lathe(1.3, 0.72, [[0.05, 0.74], [0.09, 0.82]], hex(0xe8e0d0), 8);
      for (let i = 0; i < 4; i++) k.ball(1.25 + i * 0.05, 0.82 + (i % 2) * 0.03, 0.74, 0.03, 0.03, 0.03, G.pick(r, G.PAL.fruit), 5);
    },
  },
  sideboard: {
    size: 3,
    draw(k, r) {
      const w = G.pick(r, G.PAL.wood);
      k.box(0.6, 0.1, 0.25, 2.4, 0.86, 0.68, w, 0.008);
      for (let i = 0; i < 3; i++) k.box(0.63 + i * 0.59, 0.15, 0.68, 1.19 + i * 0.59, 0.82, 0.695, shade(w, 1.12), 0.01);
      G.vase(k, r, 1.0, 0.86, 0.45, 0.32);
      G.picture(k, r, 1.45, 0.86, 1.8, 1.16, 0.4);
      G.potPlant(k, r, 2.1, 0.86, 0.45, 0.7);
    },
  },
  // homes at the window: S = 2 m (stands on the sill line with a plant, or stays empty)
  sillPlants: {
    size: 2,
    draw(k, r) {
      G.potPlant(k, r, 0.45, 0.82, 0.25, 0.9);
      if (r() < 0.7) G.potPlant(k, r, 1.3, 0.82, 0.25, 0.75);
      k.box(1.55, 0.82, 0.16, 1.85, 0.85, 0.34, G.pick(r, G.PAL.book), 0.004);
    },
  },
  sillObjects: {
    size: 2,
    draw(k, r) {
      G.vase(k, r, 0.5, 0.82, 0.22, 0.34);
      G.books(k, r, 1.0, 1.4, 0.82, 0.22, 0.32);
      if (r() < 0.5) k.lathe(1.65, 0.25, [[0.08, 0.82], [0.03, 0.98], [0.1, 1.06], [0.06, 1.24]], hex(0xf0e0c0), 8);
    },
  },
  // office
  deskRows: {
    size: 3,
    draw(k, r) {
      for (const x of [0, 1.5]) {
        table(k, x + 0.1, x + 1.42, 0.74, 0.5, hex(0xd8d4c8));
        k.box(x + 0.5, 0.82, 0.28, x + 1.02, 1.14, 0.31, hex(0x15171a), 0.005);
        k.rect(x + 0.52, 0.84, x + 1.0, 1.12, 0.311, r() < 0.5 ? hex(0x202a38) : hex(0x38485c));
        k.bar(x + 0.76, 0.74, x + 0.76, 0.84, 0.26, 0.02, hex(0x25272a));
        chair(k, x + 0.76, 0.72, hex(0x2a2a2c), 0);
        if (r() < 0.4) G.person(k, r, x + 0.76, 0.5, 0.7, 0.88);
        if (r() < 0.5) G.packs(k, r, x + 0.12, x + 0.42, 0.74, 0.22, 0.45, [hex(0x2c5aa0), hex(0xe6e2d6), hex(0x1a1a1a)]);
      }
    },
  },
  meetingTable: {
    size: 3,
    draw(k, r) {
      for (const x of [0.6, 1.2, 1.8, 2.4]) chair(k, x, 0.35, hex(0x2a2a2c), 0);
      table(k, 0.25, 2.75, 0.74, 0.65, hex(0x6b4528));
      for (const x of [0.75, 1.5, 2.2]) k.box(x, 0.74, 0.55, x + 0.21, 0.75, 0.62, hex(0xf2efe6), 0.002);
      G.floorPlant(k, r, 2.8, 0.1, 0.9);
    },
  },
  // school
  schoolDesks: {
    size: 3,
    draw(k, r) {
      for (const x of [0.1, 1.55]) {
        chair(k, x + 0.65, 0.25, G.pick(r, [hex(0x2c5aa0), hex(0xa8322a), hex(0x2f7d4f)]), 0);
        table(k, x, x + 1.3, 0.68, 0.45, hex(0xc9a878));
        k.box(x + 0.3, 0.68, 0.32, x + 0.52, 0.71, 0.42, G.pick(r, G.PAL.packs), 0.003);
      }
    },
  },
  // work
  workRow: {
    size: 3,
    draw(k, r) {
      k.box(0.2, 0, 0.3, 1.6, 0.85, 0.9, hex(0x4a5a7a), 0.008);
      k.box(0.15, 0.85, 0.28, 1.65, 0.9, 0.95, hex(0x8a6a3a), 0.006);
      k.box(1.9, 0, 0.4, 2.8, 1.0, 1.0, shade(hex(0xa8865a), 0.95), 0.006);
      k.box(1.95, 1.0, 0.45, 2.6, 1.55, 0.95, shade(hex(0xa8865a), 0.85), 0.006);
      G.tins(k, r, 0.3, 1.3, 0.9, 0.12, 0.7);
    },
  },
  crateStack: {
    size: 3,
    draw(k, r) {
      let x = 0.2;
      while (x < 2.5) {
        const w = 0.6 + r() * 0.3;
        let y = 0;
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const h = 0.42 + r() * 0.2;
          k.box(x, y, 0.35, x + w, y + h, 0.92, shade(hex(0xa8865a), 0.75 + r() * 0.4), 0.006);
          k.rect(x + w * 0.46, y, x + w * 0.54, y + h, 0.921, hex(0xc8b080));
          y += h;
        }
        x += w + 0.06;
      }
    },
  },
};

const shapedWindows = shapeOn('shaperooms');
export const CARD_PAGES: CardPage[] = Object.entries(shapedWindows ? { ...C, ...WINDOW_CARDS } : C).map(([name, v]) => ({ name, size: v.size, draw: v.draw }));

// ── room kinds ──────────────────────────────────────────────────────────────────────────────────────────────
/** floor look (GLSL `floorKind`) */
export const FLOOR = { BOARDS: 0, TILE: 1, CARPET: 2, STONE: 3, LINO: 4, PARQUET: 5 } as const;
/** how the room is lit (GLSL `lampKind`): 0 pendant, 1 ceiling spots, 2 office panels, 3 strip lights */
export const LAMP = { PENDANT: 0, SPOTS: 1, PANELS: 2, STRIP: 3 } as const;

export interface RoomKind {
  name: string;
  /** wall pages this room's bays are chosen from */
  walls: string[];
  /** furniture standing in the room (S = 3) */
  mid: string[];
  /** in the window (S = 2) */
  disp: string[];
  /** wall paint colours (a wall page's bare wall takes one) */
  paints: number[];
  floors: number[];
  lamp: number;
  /** m */
  depth: [number, number];
  /** chance of a card in a slot */
  midK: number;
  dispK: number;
}

const WARM = [0xe8dcc4, 0xd8c8a8, 0xe0d0c0, 0xc8d0c0, 0xc0ccd4, 0xe8d8c8, 0xd0b8a0, 0xf0ece0];
export const ROOM_KINDS: RoomKind[] = [
  { name: 'cafe', walls: ['barBottles', 'barMachine', 'cafeWall', 'wineRack', 'cafeMirror', 'cafeShelf', 'cafeBench'], mid: ['cafeTables', 'cafeGuests', 'cafeGuests'], disp: ['dispSign', 'dispBottles'], paints: [0xd8c8a8, 0xc89878, 0xe4d8c0, 0xb8bca0, 0x8a9a90], floors: [FLOOR.BOARDS, FLOOR.TILE, FLOOR.PARQUET], lamp: LAMP.PENDANT, depth: [5, 8], midK: 0.95, dispK: 0.35 },
  { name: 'bakery', walls: ['breadRack', 'breadBaskets', 'cakeShelf'], mid: ['bakeryCounter'], disp: ['dispBread'], paints: [0xe8d8b8, 0xf0e4cc, 0xd8c8a8], floors: [FLOOR.TILE, FLOOR.STONE], lamp: LAMP.PENDANT, depth: [4.2, 6], midK: 1, dispK: 0.85 },
  { name: 'deli', walls: ['deliJars', 'deliCheese', 'deliBottles'], mid: ['deliCounter'], disp: ['dispFruit', 'dispBottles'], paints: [0xf0ece0, 0xe8e4d8], floors: [FLOOR.TILE, FLOOR.STONE], lamp: LAMP.SPOTS, depth: [4.2, 6], midK: 1, dispK: 0.7 },
  { name: 'books', walls: ['bookcaseDark', 'bookcaseWhite', 'bookcaseDark', 'magRack'], mid: ['bookTable', 'shopCounter2', 'bookTable'], disp: ['dispBooks'], paints: [0x8a7a68, 0xc8c0b0, 0x5a6a60], floors: [FLOOR.BOARDS, FLOOR.CARPET, FLOOR.PARQUET], lamp: LAMP.PENDANT, depth: [5, 9], midK: 0.8, dispK: 0.9 },
  { name: 'florist', walls: ['flowerSteps', 'greenWall'], mid: ['flowerStand'], disp: ['dispBuckets'], paints: [0xa8b4a0, 0xd8d8c8, 0x8a9a88], floors: [FLOOR.STONE, FLOOR.TILE], lamp: LAMP.SPOTS, depth: [3.8, 5.5], midK: 0.8, dispK: 1 },
  { name: 'grocer', walls: ['grocerCrates', 'grocerTins', 'grocerTins'], mid: ['gondolaTins', 'gondolaPacks', 'shopCounter'], disp: ['dispFruit'], paints: [0xe8e4d8, 0xd8dcd4], floors: [FLOOR.LINO, FLOOR.TILE], lamp: LAMP.STRIP, depth: [5, 9], midK: 0.9, dispK: 0.95 },
  { name: 'fashion', walls: ['railWall', 'foldedShelf', 'railWall'], mid: ['clothesRail', 'clothesRail', 'shopCounter'], disp: ['dispMannequins'], paints: [0xe8e2d8, 0xd8d0c8, 0xf0ece4], floors: [FLOOR.BOARDS, FLOOR.PARQUET, FLOOR.STONE], lamp: LAMP.SPOTS, depth: [5, 9], midK: 0.85, dispK: 0.9 },
  { name: 'shoes', walls: ['shoeWall', 'shoeBoxWall', 'shoeWall'], mid: ['shoeBench', 'shoeBench', 'shopCounter'], disp: ['dispStand'], paints: [0xd8d0c0, 0xc8b8a0], floors: [FLOOR.CARPET, FLOOR.BOARDS], lamp: LAMP.SPOTS, depth: [5, 8], midK: 0.8, dispK: 0.9 },
  { name: 'hats', walls: ['hatShelf', 'railWall', 'foldedShelf'], mid: ['shopCounter2', 'clothesRail'], disp: ['dispMannequins', 'dispStand'], paints: [0xc8b8a0, 0xa89880], floors: [FLOOR.PARQUET, FLOOR.CARPET], lamp: LAMP.PENDANT, depth: [4.2, 6], midK: 0.8, dispK: 0.85 },
  { name: 'pharmacy', walls: ['pharmacy', 'apothecary', 'pharmacy'], mid: ['gondolaBoxes', 'shopCounter'], disp: ['dispBoxes'], paints: [0xf0f0ec, 0xe4ecec], floors: [FLOOR.LINO, FLOOR.TILE], lamp: LAMP.STRIP, depth: [5, 8], midK: 0.9, dispK: 0.85 },
  { name: 'hardware', walls: ['pegboard', 'hardwareBins', 'hardwareBins'], mid: ['gondolaTools', 'shopCounter'], disp: ['dispStand'], paints: [0xd8d4c8, 0xc0c0b4], floors: [FLOOR.LINO, FLOOR.STONE], lamp: LAMP.STRIP, depth: [6, 10], midK: 0.9, dispK: 0.7 },
  { name: 'optician', walls: ['opticFrames', 'opticFrames', 'cafeWall'], mid: ['shopCounter2', 'bench'], disp: ['dispObject', 'dispBoxes'], paints: [0xf0ece4, 0xe0e4e4], floors: [FLOOR.PARQUET, FLOOR.CARPET], lamp: LAMP.SPOTS, depth: [4, 6], midK: 0.7, dispK: 0.8 },
  { name: 'bikes', walls: ['bikeWall', 'hardwareBins'], mid: ['shopCounter', 'gondolaTools'], disp: ['dispBike'], paints: [0xd8d4c8, 0xb0b8bc], floors: [FLOOR.STONE, FLOOR.LINO], lamp: LAMP.STRIP, depth: [6, 10], midK: 0.7, dispK: 0.95 },
  { name: 'gallery', walls: ['galleryWall', 'gallerySmall', 'galleryWall'], mid: ['galleryPlinth', 'bench'], disp: ['dispObject'], paints: [0xf4f2ec, 0xeeece6, 0xe8e6de], floors: [FLOOR.STONE, FLOOR.PARQUET], lamp: LAMP.SPOTS, depth: [6, 10], midK: 0.55, dispK: 0.5 },
  { name: 'antiques', walls: ['antiquesShelf', 'antiquesWall', 'antiquesShelf'], mid: ['sideboard', 'diningRow', 'armchairPlant'], disp: ['dispObject', 'sillObjects'], paints: [0x6a5a48, 0x8a7a62, 0x4f5a50], floors: [FLOOR.BOARDS, FLOOR.PARQUET], lamp: LAMP.PENDANT, depth: [5, 8], midK: 0.95, dispK: 0.8 },
  { name: 'toys', walls: ['toyShelf', 'toyShelf', 'cafeWall'], mid: ['toyTable', 'gondolaPacks'], disp: ['dispToys'], paints: [0xf0e0a0, 0xc8e0e8, 0xf0c8b0], floors: [FLOOR.LINO, FLOOR.CARPET], lamp: LAMP.SPOTS, depth: [5, 8], midK: 0.85, dispK: 0.95 },
  { name: 'barber', walls: ['barberMirror', 'barberMirror', 'cafeWall'], mid: ['barberChairs'], disp: ['dispSign'], paints: [0xe0dccc, 0xb0c0b8], floors: [FLOOR.TILE, FLOOR.LINO], lamp: LAMP.STRIP, depth: [4, 6], midK: 1, dispK: 0.4 },
  { name: 'records', walls: ['recordBins', 'bookcaseDark', 'magRack'], mid: ['bookTable', 'shopCounter2'], disp: ['dispBooks', 'dispSign'], paints: [0x4a4a4e, 0x8a4a3a, 0x8a8478], floors: [FLOOR.BOARDS, FLOOR.LINO], lamp: LAMP.PENDANT, depth: [5, 8], midK: 0.8, dispK: 0.8 },
  { name: 'post', walls: ['pigeonHoles', 'officeBoard', 'pigeonHoles'], mid: ['shopCounter', 'receptionDesk'], disp: ['dispBoxes', 'dispSign'], paints: [0xe4e0d0, 0xd0d8d4], floors: [FLOOR.LINO, FLOOR.STONE], lamp: LAMP.STRIP, depth: [5, 8], midK: 1, dispK: 0.5 },
  { name: 'lobby', walls: ['timberPanel', 'stoneWall', 'gallerySmall', 'stoneWall'], mid: ['receptionDesk', 'lobbySeats', 'lobbySeats'], disp: ['dispSign'], paints: [0xd8d4c8, 0xc0bcb0], floors: [FLOOR.STONE, FLOOR.STONE, FLOOR.PARQUET], lamp: LAMP.SPOTS, depth: [6, 11], midK: 0.75, dispK: 0.3 },
  { name: 'living', walls: ['homeBookcase', 'homePictures', 'homeTV', 'homePlain', 'homeDoor', 'homeBookcase'], mid: ['sofaRow', 'armchairPlant', 'sideboard', 'sofaRow'], disp: ['sillPlants', 'sillObjects'], paints: WARM, floors: [FLOOR.BOARDS, FLOOR.PARQUET, FLOOR.CARPET], lamp: LAMP.PENDANT, depth: [3.6, 5.5], midK: 0.8, dispK: 0.35 },
  { name: 'bedroom', walls: ['homeWardrobe', 'homePictures', 'homeDresser', 'homeDoor', 'homePlain'], mid: ['bedRow', 'bedRow', 'deskRow'], disp: ['sillPlants', 'sillObjects'], paints: WARM, floors: [FLOOR.CARPET, FLOOR.BOARDS, FLOOR.PARQUET], lamp: LAMP.PENDANT, depth: [3.4, 5], midK: 0.8, dispK: 0.25 },
  { name: 'kitchen', walls: ['homeKitchen', 'homeFridge', 'homeKitchen', 'homeDoor'], mid: ['kitchenTable', 'diningRow'], disp: ['sillPlants'], paints: [0xf0ece0, 0xdce4dc, 0xe8e0c8, 0xd8e0e8], floors: [FLOOR.TILE, FLOOR.LINO], lamp: LAMP.PENDANT, depth: [3.2, 4.6], midK: 0.75, dispK: 0.5 },
  { name: 'study', walls: ['homeBookcase', 'homeBookcase', 'homePictures', 'homeDoor'], mid: ['deskRow', 'armchairPlant'], disp: ['sillObjects', 'sillPlants'], paints: WARM, floors: [FLOOR.BOARDS, FLOOR.CARPET], lamp: LAMP.PENDANT, depth: [3.2, 4.6], midK: 0.8, dispK: 0.3 },
  { name: 'office', walls: ['officeFiles', 'officeBoard', 'officeDoor', 'officeFiles', 'blank'], mid: ['deskRows', 'deskRows', 'deskRows', 'meetingTable'], disp: [], paints: [0xd8dadc, 0xe4e4e0, 0xc8ccd0], floors: [FLOOR.CARPET], lamp: LAMP.PANELS, depth: [5, 9], midK: 0.92, dispK: 0 },
  { name: 'school', walls: ['blackboard', 'pinBoard', 'pinBoard', 'homeDoor'], mid: ['schoolDesks'], disp: [], paints: [0xe8e4c8, 0xd8e4d8, 0xe0e0e8], floors: [FLOOR.LINO, FLOOR.BOARDS], lamp: LAMP.STRIP, depth: [5, 7], midK: 1, dispK: 0 },
  { name: 'work', walls: ['rackBoxes', 'workBench', 'rackBoxes', 'blank'], mid: ['workRow', 'crateStack'], disp: [], paints: [0xb0b4ac, 0xc0bcb0], floors: [FLOOR.STONE], lamp: LAMP.STRIP, depth: [7, 14], midK: 0.8, dispK: 0 },
  { name: 'hall', walls: ['hall', 'blank', 'homeDoor'], mid: ['bench', 'lobbySeats'], disp: [], paints: [0xd8d0b8, 0xc8d0c8], floors: [FLOOR.STONE, FLOOR.TILE], lamp: LAMP.PENDANT, depth: [3.5, 6], midK: 0.3, dispK: 0 },
];
if (shapedWindows) for (const kind of ROOM_KINDS) kind.disp = WINDOW_DISP[kind.name] ?? kind.disp;
export const kindIndex = (name: string): number => ROOM_KINDS.findIndex((k) => k.name === name);
