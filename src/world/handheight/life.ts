// What someone has left by a door or a tap: the things that say a place is used. In wall coordinates, u along the wall, y up, o out of it;
// y is the floor they stand on.

import type { HandSink } from './sink';

/** a boot scraper by an old door: a blade between two irons, on a small tray let into the paving */
export function bootScraper(s: HandSink, u: number, y: number, o: number): void {
  const hw = 0.12;
  s.ink(0x1b1c1d).metal(0.55);
  s.box(u - hw - 0.012, u + hw + 0.012, y, y + 0.007, o - 0.055, o + 0.055, 0.002);
  s.floor(u - hw - 0.012, u + hw + 0.012, o - 0.055, o + 0.055, y + 0.007);
  s.box(u - hw, u + hw, y + 0.088, y + 0.098, o - 0.004, o + 0.004, 0.001);
  for (const sg of [-1, 1]) {
    const c = u + sg * hw;
    s.tube([c, y, o, c, y + 0.13, o, c + sg * 0.016, y + 0.16, o + 0.006, c + sg * 0.042, y + 0.166, o], 0.0065, 6);
    s.ball(c + sg * 0.044, y + 0.165, o, 0.0105, 6);
  }
}

/** the milk, not yet taken in */
export function milkBottles(s: HandSink, u: number, y: number, o: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const c = u + k * 0.072,
      p = o + (k % 2) * 0.028;
    s.ink(0xf1efe6).rough(0.22).tube([c, y, p, c, y + 0.13, p], 0.031, 10);
    s.tube([c, y + 0.13, p, c, y + 0.185, p], 0.031, 10, 0.018);
    s.ball(c, y + 0.0015, p, 0.031, 8, 0.05);
    s.ink(k === 1 ? 0xc0392b : 0xb9bcbf).metal(0.32).ball(c, y + 0.187, p, 0.0195, 8, 0.45);
  }
}

/** a pair of wellingtons, taken off at the door */
export function boots(s: HandSink, u: number, y: number, o: number, c: number): void {
  for (let k = 0; k < 2; k++) {
    const x = u + k * 0.125,
      b = o + (k === 1 ? 0.018 : 0);
    s.ink(c).rough(0.42).tube([x, y + 0.045, b - 0.03, x, y + 0.045, b + 0.19], 0.048, 10, 0.04);
    s.ball(x, y + 0.045, b + 0.19, 0.04, 8);
    s.tube([x, y + 0.03, b - 0.01, x, y + 0.2, b - 0.012, x + (k ? 0.012 : 0), y + 0.34, b - 0.014], 0.052, 10, 0.058);
    s.ink(c, 0.82).rough(0.5).tube([x + (k ? 0.012 : 0), y + 0.34, b - 0.014, x + (k ? 0.012 : 0), y + 0.352, b - 0.014], 0.06, 10);
    s.ink(0x070707).rough(1).ball(x + (k ? 0.012 : 0), y + 0.353, b - 0.014, 0.055, 10, 0.06);
    s.ink(0x1a1817).rough(0.9).box(x - 0.042, x + 0.042, y, y + 0.012, b - 0.075, b + 0.215, 0.006);
  }
}

/** a yard broom stood against the wall */
export function broom(s: HandSink, u: number, y: number, o: number): void {
  s.ink(0x9d7c54).rough(0.6).tube([u, y + 0.15, o + 0.22, u + 0.06, y + 1.36, o + 0.012], 0.0125, 7);
  s.ink(0x7a5c3a).rough(0.72).box(u - 0.17, u + 0.17, y + 0.105, y + 0.15, o + 0.18, o + 0.26, 0.006);
  s.ink(0x38302a).rough(1).box(u - 0.165, u + 0.165, y, y + 0.105, o + 0.19, o + 0.25, 0.002);
  s.ink(0x524638).rough(1);
  for (let k = 0; k < 13; k++) s.plate(u - 0.16 + k * 0.026, u - 0.15 + k * 0.026, y + 0.003, y + 0.1, o + 0.2502);
}

/** a watering can by the tap */
export function wateringCan(s: HandSink, u: number, y: number, o: number, c: number, galvanised: boolean): void {
  const ink = (k = 1): HandSink => (galvanised ? s.ink(c, k).metal(0.46) : s.ink(c, k).rough(0.46));
  ink().tube([u, y, o, u, y + 0.19, o], 0.085, 14);
  ink(0.92).ball(u, y + 0.19, o, 0.085, 12, 0.14);
  s.ink(0x0a0a0a).rough(1).ball(u - 0.015, y + 0.2, o, 0.05, 10, 0.05);
  ink(0.96).tube([u + 0.07, y + 0.04, o, u + 0.17, y + 0.14, o, u + 0.235, y + 0.25, o], 0.02, 8, 0.011);
  ink().tube([u + 0.235, y + 0.25, o, u + 0.25, y + 0.26, o], 0.011, 8, 0.03);
  ink(1.05).ball(u + 0.25, y + 0.26, o, 0.03, 8, 0.4);
  ink(0.9).tube([u - 0.083, y + 0.17, o, u - 0.14, y + 0.2, o, u - 0.13, y + 0.31, o, u - 0.02, y + 0.33, o, u + 0.03, y + 0.205, o], 0.0065, 6);
}

/** something delivered and left: a box with its tape and its label */
export function parcel(s: HandSink, u: number, y: number, o: number, seed: number): void {
  const w = 0.3 + (seed % 3) * 0.04,
    h = 0.16 + (seed % 4) * 0.025,
    d = 0.22;
  s.ink(0xa88a5e).rough(0.82).box(u - w / 2, u + w / 2, y, y + h, o, o + d, 0.002);
  s.floor(u - w / 2, u + w / 2, o, o + d, y + h);
  s.ink(0xc7ae80).rough(0.35);
  s.floor(u - w / 2, u + w / 2, o + d / 2 - 0.024, o + d / 2 + 0.024, y + h + 0.0006);
  s.plate(u - 0.024, u + 0.024, y, y + h, o + d + 0.0006);
  s.ink(0xf0eee6).rough(0.55).floor(u + 0.01, u + w / 2 - 0.02, o + 0.02, o + d / 2 - 0.035, y + h + 0.0009);
  s.ink(0x111111).rough(0.6);
  for (let k = 0; k < 6; k++) s.floor(u + 0.018 + k * 0.012, u + 0.024 + k * 0.012, o + 0.028, o + 0.05, y + h + 0.0012);
}

/** the paper on the mat, rolled, in its band */
export function newspaper(s: HandSink, u: number, y: number, o: number): void {
  s.ink(0xd8d4c6).rough(0.8).tube([u - 0.15, y + 0.03, o, u + 0.15, y + 0.03, o + 0.03], 0.03, 9);
  s.ink(0xeeeadc).rough(0.8).tube([u + 0.15, y + 0.03, o + 0.03, u + 0.152, y + 0.03, o + 0.0302], 0.03, 9, 0.0);
  s.ink(0xb23a2c).rough(0.5).tube([u - 0.01, y + 0.03, o + 0.014, u + 0.002, y + 0.03, o + 0.0152], 0.0312, 9);
}

/** a smokers' stand outside an office: a steel drum, a domed cap with its slots */
export function ashStand(s: HandSink, u: number, y: number, o: number): void {
  s.ink(0x8c9093).metal(0.36).tube([u, y, o, u, y + 0.82, o], 0.115, 16);
  s.ink(0x34363a).rough(0.5).tube([u, y, o, u, y + 0.035, o], 0.12, 16);
  s.ink(0x777b7e).metal(0.32).ball(u, y + 0.82, o, 0.115, 14, 0.35);
  s.ink(0x0a0a0a).rough(1).ball(u, y + 0.855, o, 0.05, 10, 0.1);
}

/** a red bucket of sand by a works' door, with what people drop in it */
export function sandBucket(s: HandSink, u: number, y: number, o: number): void {
  s.ink(0xa62a1f).rough(0.5).tube([u, y, o, u, y + 0.26, o], 0.1, 14, 0.13);
  s.ink(0xb9ad92).rough(1).ball(u, y + 0.235, o, 0.122, 12, 0.08);
  s.ink(0x8a8d8e).metal(0.42).tube([u - 0.128, y + 0.25, o, u - 0.09, y + 0.33, o + 0.03, u, y + 0.36, o + 0.05, u + 0.09, y + 0.33, o + 0.03, u + 0.128, y + 0.25, o], 0.004, 5);
  s.ink(0xe6dfc9).rough(0.8);
  for (const [a, b, c] of [[-0.04, 0.03, 0.7], [0.03, -0.05, 2.1], [0.06, 0.04, 4.4], [-0.02, -0.03, 5.5]]) {
    const dx = Math.cos(c) * 0.018,
      dz = Math.sin(c) * 0.018;
    s.tube([u + a - dx, y + 0.247, o + b - dz, u + a + dx, y + 0.25, o + b + dz], 0.004, 5);
  }
}

/** a hose coiled on a hook by the tap, its end hanging */
export function hoseReel(s: HandSink, u: number, y: number, seed: number): void {
  s.ink(0x4f5254).metal(0.5).box(u - 0.035, u + 0.035, y + 0.14, y + 0.2, 0, 0.006, 0.001);
  s.tube([u, y + 0.17, 0.004, u, y + 0.165, 0.09, u, y + 0.195, 0.11], 0.007, 6);
  const c = seed % 2 ? 0x4c6e3d : 0x3f5f78;
  const path: number[] = [];
  const turns = 5,
    per = 26;
  for (let k = 0; k <= turns * per; k++) {
    const a = (k / per) * 6.283 + 0.4;
    const r = 0.165 + 0.012 * Math.sin(k * 0.61);
    path.push(u + Math.cos(a) * r, y + Math.sin(a) * r * 1.02, 0.024 + (k / (turns * per)) * 0.056);
  }
  // off the coil and down to the nozzle
  const end = path.length - 3;
  const ex = path[end],
    ey = path[end + 1];
  path.push(ex + 0.04, ey - 0.1, 0.085, ex + 0.05, ey - 0.26, 0.08, ex + 0.045, Math.max(0.3, ey - 0.4), 0.07);
  s.ink(c).rough(0.46).tube(path, 0.0085, 5);
  s.ink(0xc2811f).rough(0.38).tube([ex + 0.045, Math.max(0.3, ey - 0.4), 0.07, ex + 0.043, Math.max(0.3, ey - 0.4) - 0.1, 0.066], 0.014, 8, 0.011);
}
