// What a wall carries because the building needs it, placed by the kind of building and never scattered. Each piece has a
// reason: air bricks vent the floor of an old house, a meter cupboard sits where the mains come in, the telephone line drops
// down the corner, a bathroom's overflow stains the wall under it. All in wall coordinates: u along the wall, o out of it.

import type { HandPipe, HandSpot } from '../buildings/anchors';
import type { HandSink } from './sink';

/** a saddle clip on a pipe */
function pipeClip(s: HandSink, y: number, p: HandPipe, c: number): void {
  const R = p.r + 0.005;
  const path: number[] = [];
  for (let k = -5; k <= 5; k++) {
    const a = (k / 5) * 1.9;
    path.push(Math.sin(a) * R, y, p.po + Math.cos(a) * R);
  }
  s.ink(c, 0.82).metal(0.5).tube(path, 0.0045, 6);
  // the lugs to the wall, screwed on either side
  s.ink(c, 0.78).metal(0.5).box(-R - 0.018, -R + 0.006, y - 0.011, y + 0.011, 0, 0.012, 0.002);
  s.box(R - 0.006, R + 0.018, y - 0.011, y + 0.011, 0, 0.012, 0.002);
  s.tube([-R, y, p.po - 0.02, -R, y, 0.012], 0.0035, 5);
  s.tube([R, y, p.po - 0.02, R, y, 0.012], 0.0035, 5);
}

/** a rainwater pipe that is round: length, sockets, a shoe turned out over a gully */
export function rainPipe(s: HandSink, p: HandPipe): void {
  const r = p.r + 0.0022;
  const lit = p.color;
  s.ink(lit).rough(0.42);
  // the plain pipe from the top down to the shoe
  s.tube([0, p.y1, p.po, 0, 0.36, p.po], r, 14);
  // sockets: a thicker short length every length of pipe
  s.ink(lit, 0.95);
  for (let y = 0.36 + 0.14; y < p.y1 - 0.2; y += 2.0) s.tube([0, y, p.po, 0, y + 0.1, p.po], r + 0.0035, 14);
  // the shoe
  const out = Math.max(p.po + 0.03, Math.min(0.15, p.room - 0.01));
  s.ink(lit, 0.97).tube([0, 0.38, p.po, 0, 0.26, p.po, 0, 0.17, p.po + (out - p.po) * 0.45, 0, 0.1, out], r, 14, r + 0.006);
  // clips
  for (let y = 1.2; y < p.y1 - 0.25; y += 2.0) pipeClip(s, y, p, lit);
}

/** the grating at the foot of a rainwater pipe; `y` the ground */
export function gully(s: HandSink, p: HandPipe, y: number): void {
  const out = Math.max(p.po + 0.03, Math.min(0.15, p.room - 0.01));
  const a = out - 0.13,
    b = out + 0.13;
  if (a < 0.01) return;
  s.ink(0x4a4b49).metal(0.68).box(-0.13, 0.13, y, y + 0.008, a, b, 0.0);
  s.ink(0x1d1e1d).metal(0.75);
  for (let k = -3; k <= 3; k++) s.floor(k * 0.032 - 0.008, k * 0.032 + 0.008, a + 0.016, b - 0.016, y + 0.0083);
}

/** an air brick: a terracotta or cast iron grille low in the wall */
export function airBrick(s: HandSink, u: number, y: number, iron: boolean, tone: number): void {
  const w = 0.115,
    h = 0.0375;
  s.ink(iron ? 0x37383a : 0xa2563c, tone).rough(iron ? 0.7 : 0.9).box(u - w, u + w, y - h, y + h, 0, 0.009, 0.003);
  s.ink(0x050505).rough(1);
  const nx = iron ? 7 : 6;
  for (let k = 0; k < nx; k++) {
    const c = u - w + ((k + 0.5) / nx) * 2 * w;
    for (const dy of [-0.016, 0.016]) s.plate(c - 0.011, c + 0.011, y + dy - 0.009, y + dy + 0.009, 0.0093);
  }
}

/** a round plastic grille, as a plastered wall has */
export function roundVent(s: HandSink, u: number, y: number, r: number, c: number): void {
  s.ink(c).rough(0.5).disc(u, y, 0, 0.012, r, 18, 0.3);
  s.ink(0x09090a).rough(1);
  for (let k = -2; k <= 2; k++) {
    const hw = Math.sqrt(Math.max(0, (r * 0.72) ** 2 - (k * r * 0.26) ** 2));
    s.plate(u - hw, u + hw, y + k * r * 0.26 - r * 0.075, y + k * r * 0.26 + r * 0.075, 0.0123);
  }
}

/** a square louvre: kitchen or bathroom extract */
export function louvre(s: HandSink, u: number, y: number, c: number): void {
  const w = 0.085;
  s.ink(c).rough(0.5).box(u - w, u + w, y - w, y + w, 0, 0.012, 0.004);
  s.ink(0x0c0c0c).rough(1).plate(u - w + 0.012, u + w - 0.012, y - w + 0.012, y + w - 0.012, 0.0123);
  s.ink(c, 1.03).rough(0.5);
  for (let k = 0; k < 6; k++) {
    const yy = y - w + 0.018 + k * 0.0255;
    s.quad([u - w + 0.012, yy, 0.022], [u + w - 0.012, yy, 0.022], [u + w - 0.012, yy + 0.016, 0.0125], [u - w + 0.012, yy + 0.016, 0.0125]);
  }
}

/** an electricity cupboard: a moulded box, a door with a shadow gap, a triangle key lock, slots at the foot, the mains cable going down */
export function meterCupboard(s: HandSink, u: number, y0: number, w: number, h: number, c: number, cable: boolean, seed: number): void {
  const d = 0.14;
  s.ink(c).rough(0.55).box(u - w / 2, u + w / 2, y0, y0 + h, 0, d, 0.012);
  // the door
  s.ink(0x0e0e0d).rough(0.9).plate(u - w / 2 + 0.018, u + w / 2 - 0.018, y0 + 0.018, y0 + h - 0.018, d + 0.0002);
  s.ink(c, 1.04).rough(0.5).box(u - w / 2 + 0.0205, u + w / 2 - 0.0205, y0 + 0.0205, y0 + h - 0.0205, d, d + 0.006, 0.004);
  // lock
  s.ink(0x6d6f70).metal(0.4).disc(u + w / 2 - 0.05, y0 + h / 2, d + 0.006, d + 0.0095, 0.012, 12, 0.3);
  s.ink(0x070707).rough(0.9).disc(u + w / 2 - 0.05, y0 + h / 2, d + 0.0095, d + 0.0098, 0.0052, 3, 0.1);
  // ventilation slots in the door's foot
  s.ink(0x0a0a0a).rough(1);
  for (let k = 0; k < 4; k++) s.plate(u - 0.07, u + 0.07, y0 + 0.05 + k * 0.016, y0 + 0.058 + k * 0.016, d + 0.0064);
  if (cable) {
    const cu = u - w / 2 + 0.09 + (seed % 3) * 0.05;
    s.ink(0x1c1d1e).rough(0.55).tube([cu, y0 + 0.01, 0.03, cu, 0.0, 0.03], 0.016, 8);
    s.ink(0x3a3b3c).metal(0.5);
    for (let y = y0 - 0.2; y > 0.05; y -= 0.25) s.box(cu - 0.02, cu + 0.02, y - 0.008, y + 0.008, 0, 0.05, 0.002);
  }
}

/** a gas meter box, low on the wall: the yellow pipe comes out of the ground, goes in underneath */
export function gasBox(s: HandSink, u: number, y0: number, seed: number): void {
  const w = 0.42,
    h = 0.42,
    d = 0.17;
  const c = seed % 2 ? 0xd9d6cc : 0xc5c7c6;
  s.ink(c).rough(0.55).box(u - w / 2, u + w / 2, y0, y0 + h, 0, d, 0.012);
  s.ink(0x0d0d0d).rough(0.9).plate(u - w / 2 + 0.03, u + w / 2 - 0.03, y0 + 0.03, y0 + h - 0.03, d + 0.0002);
  s.ink(c, 1.03).rough(0.52).box(u - w / 2 + 0.033, u + w / 2 - 0.033, y0 + 0.033, y0 + h - 0.033, d, d + 0.005, 0.004);
  s.ink(0x222324).rough(0.5).disc(u, y0 + h - 0.075, d + 0.005, d + 0.0085, 0.013, 10, 0.3);
  s.ink(0xd9ab1f).rough(0.42).tube([u + 0.12, y0 + 0.01, 0.07, u + 0.12, 0.005, 0.07], 0.016, 10);
}

/** the telephone line down a corner: a small box, a thin black cable and its clips, an inch of slack at the box */
export function telecomDrop(s: HandSink, u: number, yBox: number, yTop: number): void {
  s.ink(0xb9b7ae).rough(0.55).box(u - 0.045, u + 0.045, yBox - 0.06, yBox + 0.06, 0, 0.026, 0.006);
  s.ink(0x8e8c84).rough(0.6).plate(u - 0.03, u + 0.03, yBox + 0.02, yBox + 0.022, 0.0264);
  s.ink(0x8e8c84).rough(0.6).plate(u - 0.03, u + 0.03, yBox + 0.012, yBox + 0.014, 0.0264);
  const path: number[] = [u, yBox + 0.06, 0.014];
  path.push(u + 0.008, yBox + 0.12, 0.012);
  path.push(u + 0.002, yBox + 0.2, 0.0065);
  let y = yBox + 0.45;
  for (; y < yTop; y += 0.42) path.push(u + 0.003 * Math.sin(y * 3.7), y, 0.0065);
  path.push(u, yTop, 0.0065);
  s.ink(0x18191a).rough(0.5).tube(path, 0.0028, 5);
  s.ink(0xdedcd4).rough(0.5);
  for (let c = yBox + 0.3; c < yTop - 0.1; c += 0.42) s.box(u - 0.0075, u + 0.0075, c - 0.0035, c + 0.0035, 0, 0.0095, 0.002);
}

/** a burglar alarm's bell box, up out of reach */
export function alarmBox(s: HandSink, u: number, y: number, seed: number): void {
  const c = [0x1f4fa0, 0xc9c6bb, 0xc32a22, 0xd8b21c][seed % 4];
  s.ink(c).rough(0.42).box(u - 0.125, u + 0.125, y - 0.15, y + 0.15, 0, 0.055, 0.016);
  s.ink(0xf0efe8).rough(0.5).box(u - 0.09, u + 0.09, y + 0.05, y + 0.1, 0.055, 0.057, 0.002);
  s.ink(c, 0.82).rough(0.45);
  for (let k = 0; k < 3; k++) s.box(u - 0.09, u + 0.09, y - 0.1 + k * 0.03, y - 0.086 + k * 0.03, 0.055, 0.058, 0.002);
}

/** a security camera on a short arm */
export function camera(s: HandSink, u: number, y: number, tiltU: number): void {
  s.ink(0xd8d8d2).rough(0.45).disc(u, y, 0, 0.012, 0.045, 12, 0.3);
  s.ink(0xcfcfc9).rough(0.42).tube([u, y, 0.012, u, y - 0.01, 0.07, u + tiltU * 0.02, y - 0.03, 0.09], 0.012, 8);
  s.ink(0xe6e6e0).rough(0.38).tube([u + tiltU * 0.01, y - 0.015, 0.075, u + tiltU * 0.05, y - 0.05, 0.2], 0.036, 12);
  s.ink(0x08090c).metal(0.08).disc(u + tiltU * 0.05, y - 0.05, 0.2, 0.2005, 0.024, 10, 0.1);
}

/** a bib tap with its wheel, and the pipe into the wall */
export function bibTap(s: HandSink, u: number, y: number): void {
  s.ink(0xad8c4a).metal(0.4).disc(u, y, 0, 0.006, 0.024, 10, 0.3);
  s.tube([u, y, 0, u, y, 0.06, u, y - 0.03, 0.078, u, y - 0.075, 0.085], 0.0095, 8);
  s.tube([u, y + 0.004, 0.04, u, y + 0.045, 0.04], 0.0052, 6);
  s.ink(0xb32a22).rough(0.5).tube([u - 0.022, y + 0.05, 0.04, u + 0.022, y + 0.05, 0.04], 0.0048, 6);
  s.tube([u, y + 0.05, 0.018, u, y + 0.05, 0.062], 0.0048, 6);
}

/** a short overflow from a bathroom, its end cut at an angle */
export function overflow(s: HandSink, u: number, y: number): void {
  s.ink(0xe6e3da).rough(0.5).tube([u, y, 0, u, y - 0.002, 0.075, u, y - 0.012, 0.095], 0.012, 8);
}

/** a stainless flue terminal with a guard, low on the wall of a house with a boiler behind it */
export function flue(s: HandSink, u: number, y: number): void {
  s.ink(0xbcbfbf).metal(0.42).disc(u, y, 0, 0.006, 0.075, 16, 0.2);
  s.tube([u, y, 0.006, u, y, 0.14], 0.05, 14);
  s.ink(0x171717).rough(1).disc(u, y, 0.14, 0.141, 0.042, 12, 0.1);
  s.ink(0xcfd2d2).metal(0.34);
  for (const a of [0.5, 1.2, 1.9, 2.6, 3.3, 4.0, 4.7, 5.4]) s.tube([u + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05, 0.12, u + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05, 0.16], 0.002, 4);
}

/** where a bracket was once: four plugs and a paler patch where it stood */
export function oldFixing(s: HandSink, u: number, y: number, c: number, seed: number): void {
  const hw = 0.05 + (seed % 3) * 0.02,
    hh = 0.05 + (seed % 2) * 0.03;
  for (const su of [-hw, hw]) {
    for (const sy of [-hh, hh]) {
      s.ink(c === 0 ? 0x806d55 : c, 0.82).rough(0.8).disc(u + su, y + sy, 0, 0.0016, 0.0058, 6, 0.3);
      s.ink(0x0a0a09).rough(0.9).disc(u + su, y + sy, 0.0016, 0.0019, 0.0024, 5, 0.1);
    }
  }
}

/** an isolator with its conduit going up to the roof, on the wall of a works */
export function worksConduit(s: HandSink, u: number, y: number, yTop: number, seed: number): void {
  const c = seed % 2 ? 0x8e9498 : 0x7c8286;
  s.ink(c).metal(0.46).box(u - 0.09, u + 0.09, y - 0.13, y + 0.13, 0, 0.09, 0.006);
  s.ink(0xb82a22).rough(0.5).box(u - 0.016, u + 0.016, y - 0.03, y + 0.05, 0.09, 0.113, 0.004);
  s.ink(0xe6c72c).rough(0.5).plate(u - 0.05, u + 0.05, y - 0.05, y + 0.07, 0.0902);
  s.ink(c, 1.05).metal(0.42).tube([u + 0.04, y + 0.13, 0.03, u + 0.04, yTop, 0.03], 0.012, 8);
  s.ink(c, 0.9).metal(0.5);
  for (let yy = y + 0.45; yy < yTop - 0.1; yy += 1.1) {
    s.tube([u + 0.022, yy, 0.012, u + 0.024, yy, 0.03, u + 0.04, yy, 0.046, u + 0.056, yy, 0.03, u + 0.058, yy, 0.012], 0.0028, 4);
    s.box(u + 0.01, u + 0.07, yy - 0.01, yy + 0.01, 0, 0.003, 0.001);
  }
}

/** the near face of a meter box a generator built on a home's side wall */
export function homeMeter(s: HandSink, f: HandSpot): void {
  const u = f.w / 2;
  s.ink(0x0e0e0d).rough(0.9).plate(0.03, f.w - 0.03, f.y + 0.03, f.y + f.h - 0.03, f.o + 0.0042);
  s.ink(f.color, 1.04).rough(0.5).box(0.033, f.w - 0.033, f.y + 0.033, f.y + f.h - 0.033, f.o + 0.004, f.o + 0.009, 0.004);
  s.ink(0x6d6f70).metal(0.4).disc(f.w - 0.07, f.y + f.h / 2, f.o + 0.009, f.o + 0.012, 0.012, 12, 0.3);
  s.ink(0x070707).rough(0.9).disc(f.w - 0.07, f.y + f.h / 2, f.o + 0.012, f.o + 0.0123, 0.005, 3, 0.1);
  s.ink(0x0a0a0a).rough(1);
  for (let k = 0; k < 4; k++) s.plate(u - 0.08, u + 0.08, f.y + 0.07 + k * 0.016, f.y + 0.078 + k * 0.016, f.o + 0.0094);
}
