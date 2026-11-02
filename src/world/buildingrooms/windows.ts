// Shop windows (docs/progress/sweep-shape.md, ?noshaperooms): what each trade really puts behind its glass, instead of the same boxes, cones
// and a blank plinth. Cards of the room atlas (pages.ts): drawn once at boot, so all of this costs a fetch and no triangles. A window's sill
// hides about the lower half metre of a card, so the goods stand above that.

import { hex, mixc, shade, type Col, Kit } from './kit';
import * as G from './goods';

type R = () => number;
interface Card {
  size: number;
  draw(k: Kit, r: R): void;
}

/** a plinth as a shopfitter builds it: a shadow gap at the floor, the body above it */
function plinth(k: Kit, x0: number, x1: number, h: number, z0: number, z1: number, c: Col): void {
  k.box(x0 + 0.03, 0, z0 + 0.02, x1 - 0.03, 0.06, z1 - 0.03, shade(c, 0.32), 0.002);
  k.box(x0, 0.06, z0, x1, h, z1, c, 0.005);
}

/** the small printed card on a gallery plinth or a shelf edge */
function caption(k: Kit, x: number, y: number, z: number): void {
  k.rect(x - 0.05, y - 0.034, x + 0.05, y + 0.034, z, hex(0xf6f4ec));
  for (let i = 0; i < 3; i++) k.rect(x - 0.04, y + 0.016 - i * 0.017, x + 0.04 - i * 0.016, y + 0.022 - i * 0.017, z + 0.001, hex(0x55554f));
}

const wire = (k: Kit, x: number, y: number, z: number): void => k.bar(x, y, x, 2, z, 0.003, hex(0x77787a));

/** the chemist's show globe: a flask of coloured water, what the blue and green cones stood in for */
function carboy(k: Kit, x: number, y: number, z: number, h: number, c: Col): void {
  const R = h / 3.15;
  k.lathe(x, z, [[R * 0.42, y], [R * 0.46, y + R * 0.12]], shade(c, 0.8), 10);
  k.ball(x, y + R * 0.95, z, R, R * 0.95, R, c, 14);
  const glass = mixc(c, hex(0xdfe8e8), 0.55);
  k.lathe(x, z, [[R * 0.22, y + R * 1.85], [R * 0.19, y + R * 2.15], [R * 0.19, y + R * 2.55], [R * 0.32, y + R * 2.62], [R * 0.32, y + R * 2.72], [R * 0.16, y + R * 2.76]], glass, 8);
  k.ball(x, y + R * 2.9, z, R * 0.17, R * 0.2, R * 0.17, glass, 8);
  // the window in the glass
  k.ball(x - R * 0.42, y + R * 1.38, z + R * 0.78, R * 0.1, R * 0.24, R * 0.03, mixc(c, hex(0xffffff), 0.7), 7);
}

function pumpBottle(k: Kit, x: number, y: number, z: number, h: number, r0: number, c: Col): void {
  k.lathe(x, z, [[r0 * 0.9, y], [r0, y + 0.012], [r0, y + h * 0.7], [r0 * 0.42, y + h * 0.8], [r0 * 0.3, y + h * 0.86]], c, 7);
  k.lathe(x, z, [[r0 * 1.015, y + h * 0.2], [r0 * 1.015, y + h * 0.56]], hex(0xf2efe6), 7);
  const cap = hex(0xe8e8e4);
  k.cyl(x, y + h * 0.86, z, r0 * 0.15, h * 0.14, cap, 6);
  k.box(x - r0 * 0.26, y + h, z - 0.012, x + r0 * 0.75, y + h + 0.02, z + 0.012, cap, 0.004);
}

/** a head and shoulders on a stand, in glasses */
function opticBust(k: Kit, x: number, y: number, z: number, frame: Col): void {
  const s = hex(0xe6e0d6);
  k.lathe(x, z, [[0.1, y], [0.13, y + 0.03], [0.12, y + 0.08], [0.05, y + 0.15]], s, 8);
  k.cyl(x, y + 0.14, z, 0.042, 0.08, s, 6);
  k.ball(x, y + 0.29, z, 0.076, 0.1, 0.085, s, 8);
  k.ball(x, y + 0.27, z + 0.08, 0.012, 0.018, 0.012, shade(s, 0.96), 5);
  const zg = z + 0.092,
    yg = y + 0.3;
  for (const sd of [-1, 1]) {
    k.ring(x + sd * 0.036, yg, zg, 0.027, 0.0035, frame, 14);
    k.rect(x + sd * 0.036 - 0.019, yg - 0.019, x + sd * 0.036 + 0.019, yg + 0.019, zg - 0.001, hex(0xc8d8de));
    k.bar(x + sd * 0.063, yg + 0.006, x + sd * 0.082, yg + 0.012, zg - 0.03, 0.003, frame);
  }
  k.bar(x - 0.009, yg + 0.004, x + 0.009, yg + 0.004, zg, 0.003, frame);
}

/** the optician's sign: a pair of giant glasses on two wires */
function bigGlasses(k: Kit, x: number, y: number, z: number, r: number, c: Col): void {
  for (const sd of [-1, 1]) {
    k.ring(x + sd * r * 1.2, y, z, r, r * 0.09, c, 28);
    wire(k, x + sd * r * 1.2, y + r, z);
  }
  k.bar(x - r * 0.22, y + r * 0.2, x, y + r * 0.34, z, r * 0.08, c);
  k.bar(x, y + r * 0.34, x + r * 0.22, y + r * 0.2, z, r * 0.08, c);
}

/** an eye chart: rows of letters getting smaller */
function eyeChart(k: Kit, x0: number, y0: number, x1: number, y1: number, z: number): void {
  k.box(x0, y0, z - 0.012, x1, y1, z, hex(0xf4f2ea), 0.004);
  const ink = hex(0x17181a);
  const n = [1, 2, 3, 4, 5, 6];
  let y = y1 - 0.03,
    s = (y1 - y0) * 0.19;
  const cx = (x0 + x1) / 2;
  for (const c of n) {
    const pitch = s * 1.35,
      x = cx - (pitch * (c - 1)) / 2;
    for (let i = 0; i < c; i++) {
      const a = x + i * pitch - s * 0.4;
      // a letter's strokes, near enough: a post and one or two arms
      k.rect(a, y - s, a + s * 0.24, y, z + 0.001, ink);
      k.rect(a, y - s * 0.22, a + s * 0.8, y, z + 0.001, ink);
      if ((i + c) % 2 === 0) k.rect(a, y - s, a + s * 0.8, y - s * 0.78, z + 0.001, ink);
      else k.rect(a + s * 0.56, y - s, a + s * 0.8, y, z + 0.001, ink);
    }
    y -= s * 1.5;
    s *= 0.72;
  }
}

/** a soft-brimmed hat; y is where the brim sits */
function hat(k: Kit, x: number, y: number, z: number, c: Col, kind: number): void {
  const ribbon = shade(c, kind === 1 ? 0.3 : 0.45);
  if (kind === 2) {
    // a bowler: a round crown and a curled brim
    k.lathe(x, z, [[0.135, y + 0.012], [0.14, y], [0.1, y + 0.012]], c, 10);
    k.lathe(x, z, [[0.094, y + 0.012], [0.094, y + 0.05], [0.088, y + 0.08], [0.074, y + 0.103], [0.05, y + 0.12], [0.022, y + 0.128], [0.001, y + 0.13]], c, 10);
    k.lathe(x, z, [[0.094, y + 0.012], [0.09, y + 0.035]], ribbon, 10);
    return;
  }
  const brim = kind === 1 ? 0.22 : 0.15;
  k.lathe(x, z, [[brim, y - 0.006], [brim, y], [brim * 0.7, y + 0.006], [0.088, y + 0.012]], c, 10);
  k.lathe(x, z, [[0.088, y + 0.012], [0.082, y + 0.09], [0.07, y + 0.122], [0.03, y + 0.132], [0.001, y + 0.128]], c, 10);
  k.lathe(x, z, [[0.09, y + 0.014], [0.086, y + 0.044]], ribbon, 10);
}

/** a kraft parcel with its tape and address label */
function parcel(k: Kit, x0: number, y0: number, x1: number, y1: number, z: number, c: Col, r: R): void {
  k.box(x0, y0, z - 0.2, x1, y1, z, c, 0.005);
  const mx = (x0 + x1) / 2 + (r() - 0.5) * 0.02;
  k.rect(mx - 0.018, y0 + 0.004, mx + 0.018, y1 - 0.004, z + 0.001, shade(c, 1.22));
  const lw = (x1 - x0) * 0.2;
  k.rect(mx + 0.03, y0 + (y1 - y0) * 0.5, mx + 0.03 + lw, y0 + (y1 - y0) * 0.86, z + 0.002, hex(0xf6f4ec));
  for (let i = 0; i < 3; i++) k.rect(mx + 0.04, y0 + (y1 - y0) * (0.76 - i * 0.08), mx + 0.02 + lw * (0.9 - i * 0.15), y0 + (y1 - y0) * (0.79 - i * 0.08), z + 0.003, hex(0x33333a));
}

/** a sitting bear */
function bear(k: Kit, x: number, y: number, z: number, s: number, f: Col): void {
  const m = (v: number): number => v * s;
  const light = mixc(f, hex(0xf0e0c0), 0.5);
  for (const sd of [-1, 1]) {
    k.ball(x + sd * m(0.13), y + m(0.05), z + m(0.1), m(0.06), m(0.055), m(0.09), f, 7);
    k.ball(x + sd * m(0.13), y + m(0.05), z + m(0.185), m(0.04), m(0.04), m(0.012), light, 7);
    k.ball(x + sd * m(0.135), y + m(0.2), z + m(0.06), m(0.045), m(0.085), m(0.05), f, 7);
    k.ball(x + sd * m(0.1), y + m(0.44), z - m(0.01), m(0.042), m(0.042), m(0.03), f, 7);
    k.ball(x + sd * m(0.1), y + m(0.44), z + m(0.012), m(0.024), m(0.024), m(0.012), light, 6);
  }
  k.ball(x, y + m(0.15), z, m(0.125), m(0.15), m(0.105), f, 8);
  k.ball(x, y + m(0.14), z + m(0.085), m(0.07), m(0.09), m(0.03), light, 7);
  k.ball(x, y + m(0.36), z + m(0.01), m(0.105), m(0.098), m(0.095), f, 8);
  k.ball(x, y + m(0.335), z + m(0.09), m(0.044), m(0.036), m(0.035), light, 7);
  k.ball(x, y + m(0.35), z + m(0.122), m(0.014), m(0.011), m(0.006), hex(0x15110e), 5);
  for (const sd of [-1, 1]) k.ball(x + sd * m(0.044), y + m(0.39), z + m(0.09), m(0.011), m(0.012), m(0.005), hex(0x15110e), 5);
}

/** a rocking horse on its bow runners, facing +x */
function rockingHorse(k: Kit, x: number, y: number, z: number, s: number): void {
  const X = (v: number): number => x + v * s,
    Y = (v: number): number => y + v * s;
  const coat = hex(0xe6dcc8),
    wood = hex(0x9a5a2a),
    dark = hex(0x2a1c14),
    red = hex(0xa8322a);
  let px = X(-0.42),
    py = Y(0.1);
  for (let i = 1; i <= 8; i++) {
    const t = -0.42 + (i / 8) * 0.84;
    const qx = X(t),
      qy = Y(0.02 + 0.5 * t * t);
    k.bar(px, py, qx, qy, z - 0.02, 0.016 * s, wood);
    px = qx;
    py = qy;
  }
  for (const a of [-0.2, 0.2]) k.bar(X(a), Y(0.04), X(a * 0.8), Y(0.12), z, 0.01 * s, wood);
  k.bar(X(-0.12), Y(0.33), X(-0.25), Y(0.06), z - 0.04, 0.022 * s, shade(coat, 0.9));
  k.bar(X(0.14), Y(0.33), X(0.27), Y(0.06), z - 0.04, 0.022 * s, shade(coat, 0.9));
  k.bar(X(-0.14), Y(0.33), X(-0.2), Y(0.05), z + 0.02, 0.026 * s, coat);
  k.bar(X(0.16), Y(0.33), X(0.22), Y(0.05), z + 0.02, 0.026 * s, coat);
  k.ball(X(0), Y(0.42), z, 0.23 * s, 0.1 * s, 0.09 * s, coat, 9);
  k.ball(X(-0.18), Y(0.42), z, 0.075 * s, 0.09 * s, 0.085 * s, coat, 8);
  // dapples
  for (const [a, b] of [[-0.12, 0.43], [-0.02, 0.38], [0.07, 0.44], [0.13, 0.37], [-0.17, 0.37]]) k.disc(X(a), Y(b), z + 0.086 * s, 0.018 * s, hex(0x9a9486), 0, 8);
  k.bar(X(0.14), Y(0.46), X(0.25), Y(0.66), z, 0.05 * s, coat);
  k.ball(X(0.3), Y(0.69), z, 0.09 * s, 0.05 * s, 0.05 * s, coat, 8);
  k.ball(X(0.375), Y(0.67), z, 0.034 * s, 0.032 * s, 0.038 * s, shade(coat, 0.93), 7);
  k.ball(X(0.27), Y(0.71), z + 0.043 * s, 0.01 * s, 0.01 * s, 0.006 * s, dark, 5);
  k.leaf(X(0.235), Y(0.72), z, 1.3, 0.055 * s, 0.018 * s, coat, 0);
  // mane and tail in dark hair, tack in red
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    k.bar(X(0.11 + t * 0.12), Y(0.5 + t * 0.21), X(0.06 + t * 0.12), Y(0.44 + t * 0.2), z + 0.012, 0.013 * s, dark);
  }
  k.bar(X(-0.24), Y(0.48), X(-0.33), Y(0.4), z, 0.016 * s, dark);
  k.bar(X(-0.33), Y(0.4), X(-0.33), Y(0.24), z, 0.019 * s, dark);
  k.ball(X(-0.04), Y(0.5), z + 0.012, 0.09 * s, 0.03 * s, 0.09 * s, red, 8);
  k.rect(X(-0.055), Y(0.32), X(-0.025), Y(0.49), z + 0.09 * s, red);
  k.bar(X(0.33), Y(0.68), X(0.22), Y(0.52), z + 0.05 * s, 0.006 * s, red);
  k.bar(X(0.22), Y(0.62), X(0.34), Y(0.66), z + 0.052 * s, 0.006 * s, red);
}

export const WINDOW_CARDS: Record<string, Card> = {
  dispChemist: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.08, 1.92, 0.62, 0.1, 0.56, hex(0xeeece4));
      k.rect(0.08, 0.52, 1.92, 0.552, 0.561, hex(0x2f7d4f));
      // the globes on turned stands, behind the stock
      for (const [x, c] of [[0.42, 0x1f6fb0], [1.58, 0x2c8a55]] as const) {
        k.lathe(x, 0.15, [[0.11, 0.62], [0.05, 0.68], [0.05, 0.78], [0.1, 0.82]], hex(0x6b4528), 10);
        carboy(k, x, 0.82, 0.15, 0.72, hex(c));
      }
      G.cartons(k, r, 0.12, 0.72, 0.62, 0.2, 0.52);
      G.cartons(k, r, 1.28, 1.88, 0.62, 0.2, 0.52);
      // a stepped stand of bottles, a board for the season's advice above it
      k.lathe(1, 0.28, [[0.26, 0.62], [0.26, 0.72]], hex(0xe0e2e0), 14);
      k.lathe(1, 0.2, [[0.17, 0.72], [0.17, 0.84]], hex(0xecedea), 14);
      const cols = [0xf2efe6, 0x2c5aa0, 0xd8a24a, 0xe0ded4].map(hex);
      for (let i = 0; i < 4; i++) pumpBottle(k, 0.84 + i * 0.107, 0.72, 0.42, 0.2 + (i % 2) * 0.03, 0.037, cols[i]);
      for (let i = 0; i < 3; i++) pumpBottle(k, 0.895 + i * 0.105, 0.84, 0.28, 0.2, 0.034, cols[(i + 1) % 4]);
      for (const x of [0.86, 1.14]) wire(k, x, 1.65, 0.16);
      k.box(0.8, 1.2, 0.14, 1.2, 1.66, 0.16, hex(0xf6f6f0), 0.003);
      k.rect(0.97, 1.42, 1.03, 1.6, 0.161, hex(0x2f7d4f));
      k.rect(0.91, 1.48, 1.09, 1.54, 0.161, hex(0x2f7d4f));
      for (let i = 0; i < 4; i++) k.rect(0.85, 1.36 - i * 0.04, 1.15 - (i % 2) * 0.06, 1.375 - i * 0.04, 0.161, hex(0x45474a));
    },
  },
  dispOptics: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.1, 1.9, 0.62, 0.1, 0.56, hex(0xe9e6de));
      k.box(0.82, 0.62, 0.12, 1.18, 0.78, 0.5, hex(0xdad6cc), 0.004);
      opticBust(k, 0.5, 0.62, 0.3, hex(0x15161a));
      opticBust(k, 1, 0.78, 0.28, hex(0x7a3b1e));
      opticBust(k, 1.5, 0.62, 0.3, hex(0x9aa0a6));
      for (const x of [0.12, 0.42]) wire(k, x + 0.02, 1.68, 0.1);
      eyeChart(k, 0.07, 1.06, 0.5, 1.68, 0.12);
      bigGlasses(k, 1.32, 1.5, 0.2, 0.15, G.pick(r, [hex(0xb8923f), hex(0x15161a)]));
      // a few frames on the stand's edge, with their tags
      for (let i = 0; i < 4; i++) {
        const x = 0.24 + i * 0.1 + (i > 1 ? 0.9 : 0);
        k.ring(x - 0.02, 0.585, 0.562, 0.016, 0.003, hex(0x15161a), 12);
        k.ring(x + 0.02, 0.585, 0.562, 0.016, 0.003, hex(0x15161a), 12);
        k.rect(x - 0.012, 0.54, x + 0.012, 0.56, 0.562, hex(0xf6f4ec));
      }
    },
  },
  dispHats: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.08, 1.92, 0.5, 0.1, 0.6, hex(0x5a4632));
      const cols = [0xc9b28d, 0x2b3a55, 0x7d2f35, 0x1f2024, 0xd8c8a0, 0x4f6b53].map(hex);
      const tops = [0.98, 1.3, 0.84, 1.2, 1.46, 0.96];
      for (let i = 0; i < 6; i++) {
        const x = 0.24 + i * 0.306,
          z = 0.32 + (i % 2) * 0.08,
          y = tops[i];
        k.lathe(x, z, [[0.09, 0.5], [0.09, 0.516], [0.016, 0.53]], hex(0x8a8c8e), 10);
        k.bar(x, 0.52, x, y, z, 0.009, hex(0x8a8c8e));
        k.ball(x, y + 0.03, z, 0.08, 0.075, 0.08, hex(0xd8d0c0), 7);
        hat(k, x, y, z, G.pick(r, cols), i % 3);
      }
    },
  },
  dispShoes: {
    size: 2,
    draw(k, r) {
      const c = G.pick(r, [hex(0xd8cdb4), hex(0x6b4528), hex(0xf0efe8)]);
      const steps: [number, number, number][] = [[0.56, 0.62, 0.72], [0.86, 0.42, 0.62], [1.16, 0.22, 0.42]];
      for (const [y, z0, z1] of steps) {
        k.box(0.06, 0, z0 - 0.2, 1.94, y, z1 - 0.02, shade(c, 0.94 + y * 0.1), 0.005);
        G.shoes(k, r, 0.1, 1.9, y, 0.2, z1 - 0.04);
      }
      G.shoeBoxes(k, r, 0.1, 0.8, 1.16, 0.3, 0.2);
      for (const x of [0.5, 1.5]) caption(k, x, 0.5, 0.71);
    },
  },
  dispTools: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.06, 1.94, 0.52, 0.1, 0.62, hex(0x4a3a2a));
      const wood = hex(0xa8794a),
        steel = hex(0x8a8e92);
      // spade and fork against the back
      k.bar(0.2, 0.74, 0.28, 1.6, 0.14, 0.016, wood);
      k.bar(0.22, 1.6, 0.34, 1.61, 0.15, 0.012, wood);
      k.box(0.13, 0.52, 0.14, 0.27, 0.76, 0.155, steel, 0.008);
      k.bar(0.46, 0.84, 0.52, 1.62, 0.13, 0.016, wood);
      k.bar(0.46, 1.62, 0.58, 1.63, 0.14, 0.012, wood);
      k.bar(0.39, 0.8, 0.51, 0.81, 0.14, 0.012, steel);
      for (let i = 0; i < 4; i++) k.bar(0.395 + i * 0.037, 0.8, 0.385 + i * 0.037, 0.52, 0.14, 0.007, steel);
      // a coil of hose on a hook
      k.bar(0.9, 1.5, 0.9, 1.56, 0.12, 0.01, steel);
      for (let i = 0; i < 4; i++) k.ring(0.9 + i * 0.008, 1.36 - i * 0.006, 0.13 + i * 0.012, 0.14, 0.013, hex(0x2f7d4f), 24);
      // paint in the front, a green can, a pair of steps
      G.paintCans(k, r, 0.08, 0.86, 0.52, 0.24, 0.6);
      const can = hex(0x3f7a4c);
      k.lathe(1.08, 0.36, [[0.12, 0.52], [0.13, 0.56], [0.11, 0.78], [0.085, 0.8]], can, 10);
      k.bar(1.18, 0.6, 1.36, 0.82, 0.38, 0.012, can);
      k.ball(1.37, 0.83, 0.38, 0.03, 0.022, 0.012, hex(0xb8bcc0), 8);
      k.bar(0.99, 0.78, 0.93, 0.86, 0.34, 0.008, can);
      k.bar(0.93, 0.86, 1.04, 0.92, 0.34, 0.008, can);
      k.bar(1.04, 0.92, 1.14, 0.8, 0.34, 0.008, can);
      for (const [a, b] of [[1.5, 1.6], [1.86, 1.76]] as const) k.bar(a, 0.52, b, 1.5, 0.3, 0.018, hex(0xb8bcc0));
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        k.box(1.5 + 0.1 * t, 0.52 + t * 0.98 - 0.012, 0.28, 1.86 - 0.1 * t, 0.52 + t * 0.98 + 0.012, 0.335, hex(0xc4c8cc), 0.004);
      }
    },
  },
  dispParcels: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.08, 1.92, 0.56, 0.1, 0.56, hex(0xe0dccc));
      k.rect(0.08, 0.46, 1.92, 0.5, 0.561, hex(0xb6352c));
      const kraft = (): Col => shade(hex(0xb48a58), 0.88 + r() * 0.24);
      parcel(k, 0.14, 0.56, 0.62, 0.84, 0.54, kraft(), r);
      parcel(k, 0.2, 0.84, 0.56, 1.04, 0.46, kraft(), r);
      parcel(k, 0.26, 1.04, 0.5, 1.2, 0.4, kraft(), r);
      parcel(k, 1.42, 0.56, 1.86, 0.78, 0.54, kraft(), r);
      parcel(k, 1.48, 0.78, 1.78, 1.02, 0.44, kraft(), r);
      // a pillar box in small, a fan of airmail, the counter scale
      const red = hex(0xb02a22);
      k.lathe(1, 0.3, [[0.13, 0.56], [0.12, 0.6], [0.11, 1.12], [0.135, 1.16], [0.12, 1.2], [0.07, 1.26], [0.001, 1.28]], red, 12);
      k.rect(0.94, 1.03, 1.06, 1.05, 0.412, hex(0x101012));
      k.rect(0.95, 0.82, 1.05, 0.95, 0.412, hex(0xf2efe6));
      for (let i = 0; i < 3; i++) k.rect(0.96, 0.92 - i * 0.03, 1.04, 0.93 - i * 0.03, 0.413, hex(0x33333a));
      for (let i = 0; i < 4; i++) {
        const x = 0.68 + i * 0.015,
          y = 0.58 + i * 0.03;
        k.box(x, y, 0.5 + i * 0.008, x + 0.16, y + 0.1, 0.505 + i * 0.008, hex(0xf2efe6), 0.002);
        k.rect(x + 0.12, y + 0.06, x + 0.15, y + 0.09, 0.507 + i * 0.008, hex(0xb6352c));
      }
      k.lathe(1.24, 0.5, [[0.08, 0.56], [0.03, 0.6], [0.03, 0.64]], hex(0x3a3d42), 12);
      k.lathe(1.24, 0.5, [[0.1, 0.64], [0.11, 0.655]], hex(0xc6c9cc), 12);
    },
  },
  dispGalleryBust: {
    size: 2,
    draw(k) {
      const c = hex(0xf0efe8);
      plinth(k, 0.72, 1.28, 1.06, 0.1, 0.5, c);
      caption(k, 1, 0.9, 0.501);
      // a bronze head: shoulders, neck, skull, brow and nose, the stone block it is pinned to
      const b = hex(0x4e3d2a);
      k.box(0.9, 1.06, 0.22, 1.1, 1.12, 0.4, hex(0x8f8a80), 0.004);
      k.lathe(1, 0.3, [[0.04, 1.12], [0.1, 1.16], [0.17, 1.22], [0.18, 1.28], [0.12, 1.36], [0.06, 1.42]], b, 12);
      k.cyl(1, 1.4, 0.3, 0.052, 0.09, b, 8);
      k.ball(1, 1.58, 0.3, 0.092, 0.122, 0.105, b, 10);
      k.ball(1, 1.6, 0.39, 0.06, 0.016, 0.02, shade(b, 1.14), 7);
      k.ball(1, 1.55, 0.405, 0.015, 0.034, 0.018, shade(b, 1.2), 6);
      k.ball(1, 1.5, 0.39, 0.03, 0.012, 0.012, shade(b, 0.8), 6);
      for (const sd of [-1, 1]) k.ball(1 + sd * 0.09, 1.56, 0.3, 0.012, 0.03, 0.02, shade(b, 0.9), 6);
      k.ball(1.03, 1.68, 0.36, 0.05, 0.022, 0.03, shade(b, 1.25), 6);
    },
  },
  dispGalleryForm: {
    size: 2,
    draw(k, r) {
      const c = hex(0xf0efe8);
      plinth(k, 0.3, 0.86, 0.92, 0.1, 0.5, c);
      caption(k, 0.58, 0.78, 0.501);
      // a pierced stone on its pin, stacked pebbles beside it would be one thing too many
      const s = hex(0xc8c2b4);
      k.bar(0.58, 0.92, 0.58, 1.0, 0.3, 0.008, hex(0x33353a));
      k.disc(0.58, 1.24, 0.3, 0.27, s, 0.9, 32);
      k.disc(0.6, 1.26, 0.301, 0.1, shade(s, 0.82), -0.9, 24);
      k.disc(0.6, 1.26, 0.302, 0.085, shade(s, 0.22), 0, 24);
      // a canvas on an easel
      const w = hex(0x8a6236);
      k.bar(1.22, 0.3, 1.34, 1.74, 0.34, 0.016, w);
      k.bar(1.86, 0.3, 1.74, 1.74, 0.34, 0.016, w);
      k.bar(1.54, 0.3, 1.54, 1.7, 0.24, 0.014, shade(w, 0.8));
      k.box(1.18, 0.78, 0.33, 1.9, 0.82, 0.42, w, 0.004);
      G.picture(k, r, 1.22, 0.82, 1.86, 1.56, 0.42, hex(0x2a2118));
    },
  },
  dispGalleryVase: {
    size: 2,
    draw(k) {
      const c = hex(0xf0efe8);
      plinth(k, 0.56, 1.12, 0.8, 0.1, 0.5, c);
      caption(k, 0.84, 0.66, 0.501);
      plinth(k, 1.28, 1.72, 1.12, 0.14, 0.46, c);
      caption(k, 1.5, 0.98, 0.461);
      // a tall glazed jar with a band and handles, a wide bowl
      const g = hex(0x2f6f7d);
      k.lathe(0.84, 0.3, [[0.07, 0.8], [0.08, 0.83], [0.17, 0.98], [0.2, 1.12], [0.18, 1.28], [0.09, 1.42], [0.07, 1.46], [0.085, 1.5], [0.08, 1.5]], g, 14);
      k.lathe(0.84, 0.3, [[0.205, 1.08], [0.2, 1.17]], hex(0xd8c28a), 14);
      for (const sd of [-1, 1]) {
        k.bar(0.84 + sd * 0.07, 1.46, 0.84 + sd * 0.21, 1.4, 0.3, 0.012, g);
        k.bar(0.84 + sd * 0.21, 1.4, 0.84 + sd * 0.17, 1.28, 0.3, 0.012, g);
      }
      k.ball(0.76, 1.2, 0.48, 0.016, 0.07, 0.005, hex(0xcfe0e4), 6);
      const b = hex(0xb5563a);
      k.lathe(1.5, 0.3, [[0.04, 1.12], [0.05, 1.13], [0.13, 1.19], [0.17, 1.27], [0.175, 1.3], [0.165, 1.3]], b, 14);
    },
  },
  dispAntique: {
    size: 2,
    draw(k, r) {
      const w = hex(0x5a3a22),
        brass = hex(0xb8923f);
      // a side table on turned legs
      k.box(0.14, 0.76, 0.14, 1.26, 0.8, 0.55, shade(w, 1.2), 0.008);
      k.box(0.2, 0.68, 0.16, 1.2, 0.76, 0.5, w, 0.004);
      for (const x of [0.25, 1.15]) k.lathe(x, 0.42, [[0.016, 0.04], [0.024, 0.2], [0.016, 0.36], [0.03, 0.46], [0.018, 0.56], [0.035, 0.68]], w, 8);
      // a mantel clock with an arched head, candlesticks either side
      k.ball(0.7, 1.16, 0.25, 0.2, 0.18, 0.08, shade(w, 1.25), 10);
      k.box(0.5, 0.84, 0.2, 0.9, 1.16, 0.33, shade(w, 1.25), 0.01);
      k.box(0.46, 0.8, 0.2, 0.94, 0.84, 0.36, shade(w, 0.9), 0.006);
      k.disc(0.7, 1.12, 0.335, 0.14, brass, 0.4, 20);
      G.clock(k, 0.7, 1.12, 0.34, 0.12);
      for (const x of [0.3, 1.08]) {
        k.lathe(x, 0.35, [[0.055, 0.8], [0.05, 0.815], [0.012, 0.84], [0.02, 0.92], [0.01, 1.0], [0.014, 1.06], [0.032, 1.08], [0.03, 1.09]], brass, 10);
        k.cyl(x, 1.09, 0.35, 0.012, 0.16, hex(0xefe6d0), 7);
      }
      // a globe on a stand, standing on the floor
      const sea = hex(0x7a94a0);
      k.lathe(1.62, 0.5, [[0.13, 0.04], [0.09, 0.07], [0.02, 0.14], [0.03, 0.46], [0.016, 0.6], [0.03, 0.68]], w, 10);
      k.ball(1.62, 0.96, 0.5, 0.25, 0.25, 0.25, sea, 12);
      for (let i = 0; i < 9; i++) {
        const a = r() * 6.28,
          d = r() * 0.17;
        k.ball(1.62 + Math.cos(a) * d, 0.96 + Math.sin(a) * d, 0.5 + 0.24 * Math.sqrt(Math.max(0.1, 1 - (d * d) / 0.0625)), 0.03 + r() * 0.05, 0.02 + r() * 0.05, 0.006, hex(0xc4a878), 6);
      }
      k.ring(1.62, 0.96, 0.74, 0.27, 0.009, brass, 32);
      k.bar(1.62, 0.68, 1.62, 0.7, 0.5, 0.012, brass);
      G.books(k, r, 0.98, 1.2, 0.8, 0.16, 0.5);
    },
  },
  dispRecords: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.08, 1.92, 0.56, 0.1, 0.6, hex(0x2a2a2e));
      // sleeves on wire stands, faced out at eye height
      const sleeve = (x: number, y: number, z: number): void => {
        const c = G.pick(r, G.PAL.packs);
        k.box(x, y, z - 0.008, x + 0.31, y + 0.31, z, shade(c, 0.9), 0.002);
        const kind = r();
        if (kind < 0.35) k.disc(x + 0.155, y + 0.16, z + 0.001, 0.1, G.pick(r, G.PAL.pale), 0, 24);
        else if (kind < 0.7) for (let i = 0; i < 5; i++) k.rect(x + 0.02, y + 0.03 + i * 0.055, x + 0.29, y + 0.05 + i * 0.055, z + 0.001, G.pick(r, G.PAL.packs));
        else {
          k.ball(x + 0.155, y + 0.19, z + 0.001, 0.06, 0.07, 0.001, hex(0xd0a884), 8);
          k.rect(x + 0.08, y + 0.02, x + 0.23, y + 0.12, z + 0.001, shade(c, 0.4));
        }
        k.rect(x + 0.03, y + 0.27, x + 0.2, y + 0.29, z + 0.002, hex(0xf2efe6));
      };
      sleeve(0.14, 0.58, 0.5);
      sleeve(0.5, 0.72, 0.42);
      sleeve(0.2, 0.98, 0.34);
      sleeve(0.62, 1.1, 0.26);
      sleeve(1.52, 0.72, 0.42);
      sleeve(1.5, 1.08, 0.3);
      // a record player with its lid up, one disc out of its sleeve
      k.box(0.96, 0.56, 0.3, 1.46, 0.66, 0.56, hex(0x6b4528), 0.008);
      k.box(0.96, 0.82, 0.22, 1.46, 1.14, 0.24, hex(0xb8c8cc), 0.004);
      k.disc(1.18, 0.86, 0.26, 0.17, hex(0x121214), 0, 32);
      for (const rr of [0.14, 0.11, 0.08]) k.ring(1.18, 0.86, 0.261, rr, 0.0012, hex(0x34343a), 32);
      k.disc(1.18, 0.86, 0.263, 0.05, hex(0xc9a24a), 0, 20);
      k.bar(1.41, 0.72, 1.28, 0.9, 0.3, 0.005, hex(0xb8bcc0));
    },
  },
  dispToyHorse: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.06, 1.94, 0.5, 0.08, 0.62, hex(0xe8d8b0));
      rockingHorse(k, 0.62, 0.5, 0.32, 1.1);
      // alphabet blocks, a bear, a spinning top
      const cols = G.PAL.packs;
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 3 - row; i++) {
          const x = 1.16 + i * 0.125 + row * 0.062,
            y = 0.5 + row * 0.12,
            c = G.pick(r, cols);
          k.box(x, y, 0.42, x + 0.115, y + 0.118, 0.54, c, 0.008);
          k.rect(x + 0.03, y + 0.035, x + 0.085, y + 0.09, 0.541, hex(0xf2efe6));
          k.rect(x + 0.047, y + 0.043, x + 0.068, y + 0.082, 0.542, shade(c, 0.5));
        }
      bear(k, 1.72, 0.5, 0.36, 1.05, hex(0xa8743a));
      k.lathe(1.1, 0.5, [[0.004, 0.5], [0.05, 0.56], [0.075, 0.6], [0.05, 0.63], [0.012, 0.66], [0.008, 0.72]], hex(0xc94f7c), 12);
      k.lathe(1.1, 0.5, [[0.076, 0.59], [0.072, 0.61]], hex(0xf2efe6), 12);
    },
  },
  dispToyHouse: {
    size: 2,
    draw(k, r) {
      plinth(k, 0.06, 1.94, 0.5, 0.08, 0.62, hex(0xc8e0e8));
      // a dolls' house with its front off: four rooms, stairs, a roof
      const wall = hex(0xf2e4d0),
        x0 = 0.16,
        x1 = 0.98,
        y0 = 0.5,
        y1 = 1.24,
        z = 0.32;
      k.box(x0, y0, z - 0.2, x1, y1, z, wall, 0.006);
      const room = [0xd9a6a0, 0x9db4c6, 0xe0c878, 0xa8c8a0].map(hex);
      const xm = (x0 + x1) / 2,
        ym = (y0 + y1) / 2;
      for (let i = 0; i < 4; i++) {
        const a = i % 2 === 0 ? x0 + 0.03 : xm + 0.012,
          b = i < 2 ? y0 + 0.03 : ym + 0.012;
        k.rect(a, b, a + (x1 - x0) / 2 - 0.042, b + (y1 - y0) / 2 - 0.042, z + 0.001, room[i]);
        k.rect(a, b, a + (x1 - x0) / 2 - 0.042, b + 0.025, z + 0.002, hex(0x8a6236));
      }
      for (let i = 0; i < 6; i++) k.rect(xm + 0.02 + i * 0.03, y0 + 0.055 + i * 0.05, xm + 0.05 + i * 0.03, y0 + 0.07 + i * 0.05, z + 0.003, hex(0x6b4528));
      k.box(x0 + 0.08, y0 + 0.055, z + 0.002, x0 + 0.24, y0 + 0.13, z + 0.03, hex(0x7d2f35), 0.008);
      k.box(xm + 0.12, ym + 0.04, z + 0.002, xm + 0.3, ym + 0.1, z + 0.03, hex(0x2c5aa0), 0.006);
      k.rect(x0 + 0.13, ym + 0.15, x0 + 0.27, ym + 0.27, z + 0.003, hex(0xf6f4ec));
      k.tri(x0 - 0.05, y1, x1 + 0.05, y1, xm, y1 + 0.36, z + 0.001, hex(0x8a3d2c));
      for (let i = 1; i < 5; i++) {
        const y = y1 + i * 0.07,
          w = ((x1 - x0) / 2 + 0.05) * (1 - (i * 0.07) / 0.36);
        k.rect(xm - w, y, xm + w, y + 0.006, z + 0.002, hex(0x6e2f22));
      }
      k.box(x0 + 0.58, y1 + 0.1, z - 0.1, x0 + 0.68, y1 + 0.34, z - 0.02, hex(0x7a4438), 0.004);
      // a bear on the plinth, a beach ball, a kite on a wire, a train across the front
      bear(k, 1.3, 0.5, 0.26, 1.15, hex(0xd0a868));
      for (let i = 0; i < 8; i++) {
        const c = i % 2 === 0 ? hex(0xc2301f) : hex(0xf2efe6);
        k.lathe(1.74, 0.34, [[0.001 + i * 0.03, 0.5 + 0.015 * i], [0.03 + i * 0.03, 0.51 + 0.015 * i]], c, 12);
      }
      k.ball(1.74, 0.62, 0.34, 0.14, 0.14, 0.14, hex(0x2c5aa0), 12);
      k.lathe(1.74, 0.34, [[0.14, 0.6], [0.14, 0.64]], hex(0xf2efe6), 12);
      wire(k, 1.56, 1.68, 0.14);
      k.tri(1.36, 1.46, 1.76, 1.46, 1.56, 1.76, 0.15, hex(0xd9702a));
      k.tri(1.36, 1.46, 1.76, 1.46, 1.56, 1.02, 0.15, hex(0xe0b23c));
      k.bar(1.56, 1.02, 1.6, 0.9, 0.15, 0.003, hex(0x77787a));
      for (const y of [0.92, 0.84]) k.ball(1.6 + (y - 0.9) * 0.2, y, 0.15, 0.03, 0.012, 0.006, hex(0xc21f2a), 6);
      const tx = 1.02;
      k.box(tx, 0.53, 0.5, tx + 0.22, 0.62, 0.56, hex(0xb6352c), 0.01);
      k.box(tx + 0.13, 0.62, 0.5, tx + 0.22, 0.7, 0.56, hex(0x2f7d4f), 0.008);
      k.lathe(tx + 0.05, 0.54, [[0.016, 0.62], [0.02, 0.68]], hex(0x1f2d3d), 8);
      for (const x of [tx + 0.04, tx + 0.11, tx + 0.18]) k.disc(x, 0.53, 0.562, 0.03, hex(0x15161a), 0, 14);
    },
  },
};

/** which window displays each kind of shop may use */
export const WINDOW_DISP: Record<string, string[]> = {
  pharmacy: ['dispChemist'],
  optician: ['dispOptics'],
  hats: ['dispHats', 'dispMannequins'],
  shoes: ['dispShoes'],
  hardware: ['dispTools'],
  post: ['dispParcels', 'dispSign'],
  gallery: ['dispGalleryBust', 'dispGalleryForm', 'dispGalleryVase'],
  antiques: ['dispAntique', 'sillObjects'],
  toys: ['dispToyHorse', 'dispToyHouse'],
  records: ['dispRecords', 'dispSign'],
};
