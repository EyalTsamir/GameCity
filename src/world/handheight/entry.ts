// By the door, for those who do not live there: what a shared entrance has for callers, the post and the fire brigade. In wall
// coordinates, u along the wall, o out of it.

import type { HandSink } from './sink';

/** an entry panel: speaker, camera, a button per flat. `rows` buttons down the right, with room for a name beside each (lettering writes them) */
export function intercom(s: HandSink, u: number, y: number, rows: number, seed: number): { px: number; py: number; ph: number; rowH: number } {
  const brass = seed % 4 === 0;
  const plate = (k = 1): HandSink => (brass ? s.ink(0xb89a55, k).metal(0.34) : s.ink(0xb9bdc0, k).metal(0.36));
  const pw = 0.17;
  const rowH = 0.045;
  const ph = 0.03 + rows * rowH;
  const H = ph + 0.15;
  plate().box(u - pw / 2, u + pw / 2, y, y + H, 0, 0.011, 0.004);
  // the speaker: rows of small holes
  s.ink(0x060606).rough(1);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) s.disc(u - 0.05 + c * 0.0115 + (r % 2) * 0.005, y + H - 0.03 - r * 0.0105, 0.011, 0.0112, 0.0026, 5, 0.1);
  // the camera, in a dark bezel
  s.ink(0x101114).rough(0.3).disc(u + 0.052, y + H - 0.046, 0.011, 0.0135, 0.0165, 12, 0.3);
  s.ink(0x060810).metal(0.05).disc(u + 0.052, y + H - 0.046, 0.0135, 0.0145, 0.008, 10, 0.3);
  // the buttons
  for (let k = 0; k < rows; k++) {
    plate(1.12).disc(u + pw / 2 - 0.022, y + 0.015 + rowH * (k + 0.5), 0.011, 0.0145, 0.0095, 10, 0.4);
    s.ink(0x24262a).rough(0.5).box(u - pw / 2 + 0.012, u + pw / 2 - 0.042, y + 0.015 + rowH * k + 0.005, y + 0.015 + rowH * (k + 1) - 0.005, 0.011, 0.0125, 0.001);
    s.ink(0xf1eee2).rough(0.55).plate(u - pw / 2 + 0.014, u + pw / 2 - 0.044, y + 0.015 + rowH * k + 0.007, y + 0.015 + rowH * (k + 1) - 0.007, 0.0133);
  }
  return { px: u - pw / 2 + 0.014, py: y + 0.015, ph, rowH };
}

/** a bank of letter boxes on the wall of a block of flats: a door per flat with a slot, a lock and a name card */
export function mailBank(s: HandSink, u: number, y: number, cols: number, rows: number, seed: number): void {
  const bw = 0.26,
    bh = 0.2,
    d = 0.11;
  const W = cols * bw + 0.02,
    H = rows * bh + 0.02;
  const c = [0x6f767a, 0x3d4a44, 0xa9acab, 0x2f3236][seed % 4];
  s.ink(c, 0.86).metal(0.5).box(u - W / 2, u + W / 2, y, y + H, 0, d, 0.006);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = u - W / 2 + 0.01 + i * bw,
        b = y + 0.01 + j * bh;
      const tone = 0.96 + ((seed + i * 5 + j * 3) % 5) * 0.025;
      s.ink(c, tone).metal(0.46).box(a + 0.005, a + bw - 0.005, b + 0.005, b + bh - 0.005, d, d + 0.006, 0.002);
      // slot with a sprung flap
      s.ink(0x050505).rough(1).plate(a + 0.03, a + bw - 0.03, b + bh - 0.058, b + bh - 0.03, d + 0.0062);
      s.ink(c, tone * 1.08).metal(0.42).box(a + 0.03, a + bw - 0.03, b + bh - 0.056, b + bh - 0.03, d + 0.0062, d + 0.009, 0.0012);
      // name card, lock
      s.ink(0xefeada).rough(0.6).plate(a + 0.03, a + 0.145, b + 0.06, b + 0.09, d + 0.0064);
      s.ink(0xb9bcbd).metal(0.34).disc(a + bw - 0.05, b + 0.075, d + 0.006, d + 0.009, 0.0095, 10, 0.35);
      s.ink(0x060606).rough(1).plate(a + bw - 0.0508, a + bw - 0.0492, b + 0.069, b + 0.081, d + 0.0093);
    }
  }
}

/** a letter box on the wall of a house whose door has no plate */
export function wallBox(s: HandSink, u: number, y: number, seed: number): void {
  const c = [0x2f4a3a, 0x7a2e2a, 0x26282b, 0xa8a59b][seed % 4];
  const w = 0.3,
    h = 0.36,
    d = 0.12;
  s.ink(c).metal(0.5).box(u - w / 2, u + w / 2, y, y + h, 0, d, 0.01);
  // a pitched lid that keeps the rain out
  s.ink(c, 1.06).metal(0.46);
  s.quad([u - w / 2 - 0.008, y + h, d + 0.02], [u + w / 2 + 0.008, y + h, d + 0.02], [u + w / 2 + 0.008, y + h + 0.05, 0.01], [u - w / 2 - 0.008, y + h + 0.05, 0.01]);
  s.quad([u - w / 2 - 0.008, y + h + 0.05, 0.01], [u - w / 2 - 0.008, y + h, d + 0.02], [u - w / 2 - 0.008, y + h, 0], [u - w / 2 - 0.008, y + h + 0.05, 0]);
  s.quad([u + w / 2 + 0.008, y + h, d + 0.02], [u + w / 2 + 0.008, y + h + 0.05, 0.01], [u + w / 2 + 0.008, y + h + 0.05, 0], [u + w / 2 + 0.008, y + h, 0]);
  // the door, the slot under the lid, a lock
  s.ink(0x050505).rough(1).plate(u - w / 2 + 0.03, u + w / 2 - 0.03, y + h - 0.06, y + h - 0.03, d + 0.0002);
  s.ink(c, 1.05).metal(0.45).box(u - w / 2 + 0.03, u + w / 2 - 0.03, y + h - 0.059, y + h - 0.03, d, d + 0.003, 0.001);
  s.ink(c, 0.82).metal(0.5).plate(u - w / 2 + 0.03, u + w / 2 - 0.03, y + h - 0.066, y + h - 0.0635, d + 0.0002);
  s.ink(0xc2b278).metal(0.34).disc(u + w / 2 - 0.05, y + 0.1, d, d + 0.004, 0.011, 10, 0.3);
  s.ink(0x060606).rough(1).plate(u + w / 2 - 0.051, u + w / 2 - 0.049, y + 0.093, y + 0.107, d + 0.0044);
}

/** a card reader by a works' or an office's door: a slim black body, a green light, a keypad on some */
export function reader(s: HandSink, u: number, y: number, keypad: boolean): void {
  s.ink(0x15171a).rough(0.32).box(u - 0.045, u + 0.045, y - 0.075, y + 0.075, 0, 0.022, 0.008);
  s.ink(0x1f7a4a).rough(0.2).plate(u - 0.02, u + 0.02, y + 0.052, y + 0.058, 0.0222);
  if (keypad) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) s.ink(0x3a3d41).rough(0.5).box(u - 0.028 + c * 0.021, u - 0.012 + c * 0.021, y - 0.058 + r * 0.023, y - 0.042 + r * 0.023, 0.022, 0.0245, 0.001);
  } else {
    s.ink(0x24272b).rough(0.4).disc(u, y - 0.012, 0.022, 0.0235, 0.026, 12, 0.3);
  }
  s.ink(0x8d8f90).metal(0.45).plate(u - 0.052, u + 0.052, y - 0.08, y + 0.08, 0.0006);
}

/** the fire brigade's inlet on a tall building: a red box, two brass couplings with caps on chains */
export function fireInlet(s: HandSink, u: number, y: number): void {
  s.ink(0xa82119).rough(0.45).box(u - 0.26, u + 0.26, y - 0.18, y + 0.18, 0, 0.018, 0.006);
  for (const su of [-0.12, 0.12]) {
    const c = u + su;
    s.ink(0xb08e45).metal(0.34).disc(c, y - 0.02, 0.018, 0.03, 0.058, 16, 0.2);
    s.ink(0xbf9d52).metal(0.3).tube([c, y - 0.02, 0.03, c, y - 0.02, 0.1], 0.04, 14);
    s.ink(0xc9a75c).metal(0.28).disc(c, y - 0.02, 0.1, 0.116, 0.046, 16, 0.25);
    s.ink(0x8a7036).metal(0.38);
    for (const a of [0, 1.57, 3.14, 4.71]) s.tube([c + Math.cos(a) * 0.046, y - 0.02 + Math.sin(a) * 0.046, 0.102, c + Math.cos(a) * 0.058, y - 0.02 + Math.sin(a) * 0.058, 0.108], 0.0065, 5);
  }
  // the band with its name: lettering writes on it
  s.ink(0xf0ece0).rough(0.5).box(u - 0.2, u + 0.2, y + 0.095, y + 0.16, 0.018, 0.02, 0.001);
}

/** a lid in the pavement: the water's stop tap, the gas valve. On a level y; (u, o) its middle */
export function serviceLid(s: HandSink, u: number, o: number, y: number, kind: number): void {
  const hw = kind === 0 ? 0.075 : 0.055;
  s.ink(kind === 0 ? 0x2a4d78 : kind === 1 ? 0xb99a24 : 0x41423f).metal(kind === 2 ? 0.62 : 0.0).rough(0.75);
  if (kind === 2) s.metal(0.62);
  s.box(u - hw, u + hw, y, y + 0.006, o - hw, o + hw, 0.0);
  s.floor(u - hw, u + hw, o - hw, o + hw, y + 0.006);
  // the frame it sits in and two slots to lift it by
  s.ink(0x3b3c39).metal(0.65);
  s.floor(u - hw - 0.012, u + hw + 0.012, o + hw, o + hw + 0.012, y + 0.0045);
  s.floor(u - hw - 0.012, u + hw + 0.012, o - hw - 0.012, o - hw, y + 0.0045);
  s.floor(u - hw - 0.012, u - hw, o - hw, o + hw, y + 0.0045);
  s.floor(u + hw, u + hw + 0.012, o - hw, o + hw, y + 0.0045);
  s.ink(0x060606).rough(1);
  s.floor(u - hw * 0.45, u - hw * 0.15, o + hw * 0.5, o + hw * 0.62, y + 0.0064);
  s.floor(u + hw * 0.15, u + hw * 0.45, o + hw * 0.5, o + hw * 0.62, y + 0.0064);
}
