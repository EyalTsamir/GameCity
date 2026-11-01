// The door, as somebody standing on the step sees it. One kit per door, chosen by what kind of building it belongs to: a
// house has a lever or a knob with a night latch above it, an old townhouse a knocker, a works a steel door that opens
// outwards so its hinges show, a ledged cottage door strap hinges and a thumb latch and no letter plate. Close up these take
// over from the boxes in the merged trim (gen.ts, handDoorsLive).

import type { BuildingKind, DistrictKind } from '../../core/plan';
import type { HandDoor, HandSpot, DoorLamp } from '../buildings/anchors';
import type { HandSink } from './sink';

export interface DoorPlace {
  kind: BuildingKind;
  district: DistrictKind;
}

const BRASS = 0xc9a54e;
const IRON = 0x26282b;
const SCREW = 0x9a9488;

/** how a metal is finished: brass polished by hands, iron dull, chrome bright */
function hardware(s: HandSink, metal: number, k = 1): HandSink {
  if (metal === BRASS) return s.ink(0xbfa266, k).metal(0.3);
  if (metal === IRON) return s.ink(0x34363a, k).metal(0.52);
  return s.ink(0xc2c6c9, k).metal(0.26);
}

const works = (kind: BuildingKind): boolean => kind === 'warehouse' || kind === 'factory' || kind === 'depot' || kind === 'boathouse';
const old = (p: DoorPlace): boolean => p.district === 'oldtown' || p.kind === 'townhouse' || p.kind === 'church' || p.kind === 'townhall';

/** a slotted screw head */
function screw(s: HandSink, u: number, y: number, o: number, r = 0.0035): void {
  s.ink(SCREW).metal(0.45).disc(u, y, o, o + 0.0014, r, 6, 0.3);
  s.ink(0x24221e).rough(0.8).plate(u - r * 0.8, u + r * 0.8, y - r * 0.14, y + r * 0.14, o + 0.0016);
}

/** bevels round the raised field of a panel, so that it turns in the light; the top edge no longer glints as a dashed line */
/** closemat's dust on dark joinery (CM_SOLID) worked out once for a colour at a height: it settles more towards the foot */
function dusted(c: number, y: number): number {
  const lin = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => Math.pow(v / 255, 2.2));
  const lum = 0.3 * lin[0] + 0.59 * lin[1] + 0.11 * lin[2];
  const step = (a: number, b: number, v: number): number => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const k = (1 - step(0.08, 0.3, lum)) * (0.12 + 0.16 * (1 - step(0, 1.4, y)));
  const dust = [0.24, 0.23, 0.215];
  const out = lin.map((v, i) => Math.round(255 * Math.pow(v * (1 - k) + dust[i] * k, 1 / 2.2)));
  return (out[0] << 16) | (out[1] << 8) | out[2];
}

/** one coat over the whole leaf round its panels and its glass, so that stiles and fields are the same door up close */
export function leafCoat(s: HandSink, d: HandDoor): void {
  const oL = -d.d;
  const P = d.panels;
  if (P.length === 0) return;
  const holes: number[][] = [];
  for (let k = 0; k + 3 < P.length; k += 4) holes.push([P[k] - 0.008, P[k + 1] + 0.008, P[k + 2] - 0.008, P[k + 3] + 0.008]);
  const h0 = 0.14;
  if (d.v === 2) holes.push([0.12, d.w - 0.12, h0 + (d.leafH - h0) * 0.52, d.leafH - 0.12]);
  const a = 0.03,
    b = d.w - 0.03,
    top = d.leafH - 0.03;
  const ys = [h0, top, ...holes.flatMap((q) => [q[2], q[3]])].filter((y) => y >= h0 && y <= top).sort((p, q) => p - q);
  s.rough(0.48);
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i],
      y1 = ys[i + 1];
    if (y1 - y0 < 0.0005) continue;
    const cut = holes.filter((q) => q[2] < y1 - 0.0002 && q[3] > y0 + 0.0002).sort((p, q) => p[0] - q[0]);
    s.ink(dusted(d.doorCol, (y0 + y1) / 2), 1.02);
    let u = a;
    for (const q of cut) {
      if (q[0] > u) s.plate(u, q[0], y0, y1, oL + 0.0009);
      u = Math.max(u, q[1]);
    }
    if (b > u) s.plate(u, b, y0, y1, oL + 0.0009);
  }
  panelMoulds(s, d, oL);
  // chips where a door gets knocked: by the lock and at the foot
  s.ink(0x74685a).rough(0.8);
  for (let k = 0; k < 7; k++) {
    const h = (d.seed * 17 + k * 131) >>> 0;
    const low = k < 3;
    const cu = low ? 0.06 + ((h % 97) / 97) * (d.w - 0.12) : d.w - 0.045 - ((h % 7) / 7) * 0.03;
    const cy = low ? 0.21 + ((h >>> 4) % 11) * 0.009 : 0.9 + ((h >>> 4) % 13) * 0.05;
    const r = 0.0022 + ((h >>> 8) % 5) * 0.0011;
    const o = oL + 0.0014;
    s.quad([cu - r, cy - r * 0.6, o], [cu + r * 0.7, cy - r, o], [cu + r, cy + r * 0.5, o], [cu - r * 0.5, cy + r * 0.9, o]);
  }
}

function panelMoulds(s: HandSink, d: HandDoor, oL: number): void {
  const c = d.doorCol;
  const P = d.panels;
  for (let k = 0; k + 3 < P.length; k += 4) {
    const u0 = P[k],
      u1 = P[k + 1],
      y0 = P[k + 2],
      y1 = P[k + 3];
    const a = oL + 0.0125,
      b = oL + 0.0238;
    const i = 0.035;
    s.rough(0.5);
    // the field itself, one coat of the door's paint, as dusty as the stiles round it
    const painted = dusted(c, (y0 + y1) / 2);
    s.ink(painted, 1.02).rough(0.48).plate(u0 + i, u1 - i, y0 + i, y1 - i, b, 1.02);
    // a sloped band from the frame up to the field, on all four sides
    s.ink(painted, 1.0);
    s.quad([u0 + i, y1 - i, b], [u1 - i, y1 - i, b], [u1 - 0.006, y1 - 0.006, a], [u0 + 0.006, y1 - 0.006, a]);
    s.quad([u0 + 0.006, y0 + 0.006, a], [u1 - 0.006, y0 + 0.006, a], [u1 - i, y0 + i, b], [u0 + i, y0 + i, b]);
    s.quad([u0 + 0.006, y0 + 0.006, a], [u0 + i, y0 + i, b], [u0 + i, y1 - i, b], [u0 + 0.006, y1 - 0.006, a]);
    s.quad([u1 - i, y0 + i, b], [u1 - 0.006, y0 + 0.006, a], [u1 - 0.006, y1 - 0.006, a], [u1 - i, y1 - i, b]);
    // the small sloped lip where the frame leaves the stiles, instead of a sharp ledge
    const q = oL + 0.0009;
    s.ink(painted, 0.92);
    s.quad([u0 + 0.006, y1 - 0.006, a], [u1 - 0.006, y1 - 0.006, a], [u1 + 0.008, y1 + 0.008, q], [u0 - 0.008, y1 + 0.008, q]);
    s.quad([u0 - 0.008, y0 - 0.008, q], [u1 + 0.008, y0 - 0.008, q], [u1 - 0.006, y0 + 0.006, a], [u0 + 0.006, y0 + 0.006, a]);
    s.quad([u0 - 0.008, y0 - 0.008, q], [u0 + 0.006, y0 + 0.006, a], [u0 + 0.006, y1 - 0.006, a], [u0 - 0.008, y1 + 0.008, q]);
    s.quad([u1 - 0.006, y0 + 0.006, a], [u1 + 0.008, y0 - 0.008, q], [u1 + 0.008, y1 + 0.008, q], [u1 - 0.006, y1 - 0.006, a]);
  }
}

/** a lever on a round rose */
function lever(s: HandSink, u: number, y: number, oL: number, metal: number): void {
  hardware(s, metal, 0.9).disc(u, y, oL, oL + 0.007, 0.026, 16, 0.35);
  hardware(s, metal).tube([u, y, oL + 0.004, u, y, oL + 0.048, u - 0.012, y, oL + 0.058, u - 0.05, y - 0.001, oL + 0.06, u - 0.1, y - 0.003, oL + 0.056, u - 0.122, y - 0.007, oL + 0.048], 0.0095, 8, 0.0075);
}

/** a round knob on a rose */
function knob(s: HandSink, u: number, y: number, oL: number, metal: number): void {
  hardware(s, metal, 0.88).disc(u, y, oL, oL + 0.006, 0.03, 16, 0.35);
  hardware(s, metal, 0.95).tube([u, y, oL + 0.004, u, y, oL + 0.028], 0.011, 8);
  hardware(s, metal, 1.08).ball(u, y, oL + 0.046, 0.029, 12, 0.72);
}

/** the lock under a handle */
function keyhole(s: HandSink, u: number, y: number, oL: number, metal: number): void {
  hardware(s, metal, 0.85).disc(u, y, oL, oL + 0.004, 0.017, 12, 0.35);
  s.ink(0x070707).rough(0.9).plate(u - 0.0035, u + 0.0035, y - 0.009, y + 0.002, oL + 0.0043);
  s.disc(u, y + 0.003, oL + 0.0042, oL + 0.0046, 0.0052, 8, 0.1);
}

/** a night latch: a round cylinder with its keyway */
function nightLatch(s: HandSink, u: number, y: number, oL: number, metal: number): void {
  hardware(s, metal, 0.92).disc(u, y, oL, oL + 0.016, 0.02, 14, 0.3);
  s.ink(0x1a1a18).metal(0.6).disc(u, y, oL + 0.016, oL + 0.017, 0.012, 10, 0.1);
  s.ink(0x050505).rough(0.9).plate(u - 0.0012, u + 0.0012, y - 0.007, y + 0.005, oL + 0.0174);
}

/** a letter plate: a back plate, a hinged flap that hides the slot, a shadow under it */
function letterPlate(s: HandSink, u: number, y: number, oL: number, metal: number): void {
  hardware(s, metal, 0.86).box(u - 0.155, u + 0.155, y - 0.04, y + 0.04, oL, oL + 0.0145, 0.004);
  s.ink(0x060606).rough(0.9).plate(u - 0.122, u + 0.122, y - 0.0185, y + 0.0185, oL + 0.0147);
  hardware(s, metal, 1.05).box(u - 0.122, u + 0.122, y - 0.0155, y + 0.0165, oL + 0.0145, oL + 0.0195, 0.0025);
  hardware(s, metal, 1.14).tube([u - 0.124, y + 0.0175, oL + 0.0165, u + 0.124, y + 0.0175, oL + 0.0165], 0.0034, 6);
  hardware(s, metal, 1.0).tube([u - 0.025, y - 0.008, oL + 0.0195, u + 0.025, y - 0.008, oL + 0.0195], 0.0026, 6);
}

/** a ring knocker on its plate */
function knocker(s: HandSink, u: number, y: number, oL: number, metal: number): void {
  hardware(s, metal, 0.9).box(u - 0.018, u + 0.018, y + 0.012, y + 0.055, oL, oL + 0.01, 0.004);
  hardware(s, metal, 1).disc(u, y + 0.038, oL + 0.008, oL + 0.02, 0.012, 10, 0.3);
  const R = 0.033;
  const path: number[] = [];
  for (let k = 0; k <= 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    path.push(u + Math.sin(a) * R, y + 0.03 - R + Math.cos(a) * R, oL + 0.02 - Math.cos(a) * 0.004);
  }
  hardware(s, metal, 1.1).tube(path, 0.0052, 7);
  hardware(s, metal, 0.9).disc(u, y - 0.04, oL, oL + 0.008, 0.009, 8, 0.4);
}

/** a bell push on the architrave */
function bellPush(s: HandSink, u: number, y: number, o: number, metal: number, seed: number): void {
  if (metal === BRASS || seed % 3 === 0) {
    hardware(s, metal === IRON ? BRASS : metal, 0.95).disc(u, y, o, o + 0.007, 0.021, 14, 0.4);
    s.ink(0xefe8d6).rough(0.32).disc(u, y, o + 0.007, o + 0.0115, 0.0095, 10, 0.4, 0.002);
  } else {
    s.ink(0xe6e2d8).rough(0.42).box(u - 0.021, u + 0.021, y - 0.036, y + 0.036, o, o + 0.014, 0.004);
    s.ink(0xcfc9ba).rough(0.5).box(u - 0.012, u + 0.012, y - 0.024, y + 0.008, o + 0.014, o + 0.016, 0.0015);
    s.ink(0xf5f2ea).rough(0.34).disc(u, y + 0.021, o + 0.014, o + 0.0185, 0.0075, 8, 0.4);
  }
}

/** one door hinge on the outside, as on a door that opens outwards */
function knuckle(s: HandSink, u: number, y: number, o: number, c: number): void {
  s.ink(c, 0.9).metal(0.5).tube([u, y - 0.05, o, u, y + 0.05, o], 0.0085, 8);
  s.ink(c, 1.1).metal(0.42).tube([u, y - 0.055, o, u, y - 0.05, o], 0.0065, 6);
  s.tube([u, y + 0.05, o, u, y + 0.056, o], 0.0065, 6);
}

/** handles, plates and joinery of a solid door: the ring that shows from 20 m */
export function solidDoor(s: HandSink, d: HandDoor, p: DoorPlace): void {
  const oL = -d.d;
  const w = d.w;
  const hu = w - 0.1;
  const m = d.metal;
  const lu = w / 2;
  const seed = d.seed;
  // the stop the leaf closes against, in the frame's paint, and the gap between
  const fr = d.frameCol;
  s.ink(fr, 0.95).rough(0.55);
  s.box(0, 0.03, 0.14, d.leafH, oL, oL + 0.028, 0.004);
  s.box(w - 0.03, w, 0.14, d.leafH, oL, oL + 0.028, 0.004);
  s.box(0, w, d.leafH - 0.03, d.leafH + 0.002, oL, oL + 0.028, 0.004);
  s.ink(0x0b0a09).rough(0.9);
  s.plate(0.03, 0.0345, 0.145, d.leafH - 0.03, oL + 0.0012);
  s.plate(w - 0.0345, w - 0.03, 0.145, d.leafH - 0.03, oL + 0.0012);
  s.plate(0.03, w - 0.03, d.leafH - 0.0345, d.leafH - 0.03, oL + 0.0012);

  // a weather bar along the foot, its drip hiding the gap on the threshold
  if (!d.kick) {
    s.ink(d.doorCol, 0.97).rough(0.5).box(0.035, w - 0.035, 0.148, 0.2, oL, oL + 0.024, 0.008);
  }
  s.ink(0x0c0c0b).rough(0.9).plate(0.035, w - 0.035, 0.14, 0.149, oL + 0.001);

  if (d.transom) s.ink(fr).rough(0.55).box(0, w, d.leafH - 0.012, d.leafH + 0.03, oL, oL + 0.042, 0.006);

  if (works(p.kind)) {
    // a steel door: lever on a long plate, the cylinder below it, hinges outside, a closer at the head
    hardware(s, 0xb7bbbe, 0.8).box(hu - 0.024, hu + 0.024, 0.87, 1.17, oL, oL + 0.005, 0.003);
    lever(s, hu, 1.03, oL + 0.004, 0xb7bbbe);
    keyhole(s, hu, 0.915, oL + 0.005, 0xb7bbbe);
    for (const y of [0.42, 1.2, 1.95]) if (y < d.leafH - 0.1) knuckle(s, 0.032, y, oL + 0.03, 0x4a4e52);
    s.ink(0x8d9296).metal(0.45).box(0.2, 0.48, d.leafH - 0.14, d.leafH - 0.07, oL, oL + 0.052, 0.006);
    s.ink(0x777c80).metal(0.5).tube([0.46, d.leafH - 0.1, oL + 0.05, 0.62, d.leafH - 0.055, oL + 0.055, 0.82, d.leafH - 0.035, oL + 0.03], 0.0065, 6);
  } else if (d.v === 3) {
    // ledged boards: strap hinges and a thumb latch; the post goes in a box on the wall
    for (const y of [0.14 + 0.3, d.leafH - 0.32]) {
      s.ink(0x1d1e20).metal(0.58);
      s.quad([0.02, y - 0.022, oL + 0.02], [0.55, y - 0.008, oL + 0.02], [0.55, y + 0.008, oL + 0.02], [0.02, y + 0.022, oL + 0.02]);
      s.ball(0.56, y, oL + 0.02, 0.014, 8, 0.25);
      s.tube([0.024, y - 0.03, oL + 0.024, 0.024, y + 0.03, oL + 0.024], 0.0085, 8);
    }
    s.ink(0x202124).metal(0.55).box(hu - 0.02, hu + 0.02, 0.92, 1.22, oL + 0.016, oL + 0.02, 0.005);
    s.ink(0x2a2b2e).metal(0.5).tube([hu, 0.98, oL + 0.02, hu, 0.98, oL + 0.05, hu, 1.14, oL + 0.05, hu, 1.14, oL + 0.02], 0.0065, 7);
    s.ink(0x25262a).metal(0.55).tube([hu - 0.008, 1.195, oL + 0.022, hu - 0.012, 1.19, oL + 0.042], 0.005, 6);
    s.tube([hu - 0.12, 1.18, oL + 0.03, hu + 0.04, 1.18, oL + 0.03], 0.0045, 6);
  } else if (old(p) ? seed % 2 === 0 : seed % 5 === 0) {
    knob(s, hu, 1.03, oL, m);
    keyhole(s, hu, 0.9, oL, m);
    if (seed % 3 !== 1) nightLatch(s, hu, 1.4, oL, m);
  } else if (p.kind === 'apartment' || p.kind === 'hotel') {
    // shared door: a fixed pull and a cylinder, the closer at the head pulls it shut
    hardware(s, m === IRON ? 0xb7bbbe : m, 1).tube([hu, 0.93, oL + 0.002, hu, 0.93, oL + 0.042, hu + 0.002, 1.28, oL + 0.042, hu, 1.28, oL + 0.002], 0.0105, 8);
    keyhole(s, hu, 0.82, oL, m === IRON ? 0xb7bbbe : m);
    s.ink(0x8d9296).metal(0.45).box(0.26, 0.5, d.leafH - 0.12, d.leafH - 0.06, oL, oL + 0.045, 0.006);
  } else {
    lever(s, hu, 1.03, oL, m);
    keyhole(s, hu, 0.9, oL, m);
    if (seed % 2 === 0) nightLatch(s, hu, 1.4, oL, m);
  }

  if (d.letterY > 0) letterPlate(s, lu, d.letterY, oL, m === IRON && seed % 2 ? 0xb7bbbe : m);
  if (old(p) && d.v !== 2 && seed % 3 === 0) knocker(s, lu, 1.42, oL, m === 0xb7bbbe ? BRASS : m);
  else if ((p.kind === 'house' || p.kind === 'townhouse') && d.v !== 2 && seed % 4 === 1) {
    hardware(s, m, 0.95).disc(lu, 1.5, oL, oL + 0.005, 0.0105, 10, 0.4);
    s.ink(0x0a0c10).metal(0.1).disc(lu, 1.5, oL + 0.005, oL + 0.0062, 0.0055, 8, 0.1);
  }

  // the bell on the architrave
  if (!d.plain && !works(p.kind)) bellPush(s, w + 0.07, 1.26, d.fo, m, seed);
}

/** what you only see from a metre: screws, a hairline in the paint at the arrises */
export function solidDoorFine(s: HandSink, d: HandDoor): void {
  const oL = -d.d;
  const w = d.w;
  const lu = w / 2;
  if (d.letterY > 0) {
    for (const u of [lu - 0.14, lu + 0.14]) screw(s, u, d.letterY, oL + 0.0145);
  }
  if (d.kick) {
    for (const u of [0.07, w / 2, w - 0.07]) for (const y of [0.165, 0.325]) screw(s, u, y, oL + 0.0062, 0.003);
  }
  if (d.v === 3) {
    for (const y of [0.14 + 0.3, d.leafH - 0.32]) for (const u of [0.14, 0.3, 0.46]) s.ink(0x101012).metal(0.6).disc(u, y, oL + 0.02, oL + 0.0235, 0.0055, 6, 0.5);
  }
}

/** a shop's or an office's glazed door: pull bars either side of the meeting stiles, seen through the glass too; a closer, a floor lock, a metal threshold */
export function glassDoor(s: HandSink, d: HandDoor, _p: DoorPlace): void {
  const oL = -d.d;
  const w = d.w;
  const c = w / 2;
  const wide = w >= 2.3;
  const off = wide ? 0.16 : 0.11;
  const brass = d.metal === BRASS;
  const dark = d.metal === 0x26282b;
  const steel = (k = 1): HandSink => (brass ? s.ink(0xb89d64, k).metal(0.3) : dark ? s.ink(0x2a2c2f, k).rough(0.42) : s.ink(0xc4c7c9, k).metal(0.28));
  const y0 = 0.92,
    y1 = wide ? 1.72 : 1.42;
  for (const sg of [-1, 1]) {
    const u = c + sg * off;
    for (const side of [1, -1]) {
      const o = oL + side * 0.046;
      steel().tube([u, y0 - 0.05, o, u, y1 + 0.05, o], 0.0135, 12);
      steel(0.9).tube([u, y0, oL, u, y0, o], 0.0075, 8);
      steel(0.9).tube([u, y1, oL, u, y1, o], 0.0075, 8);
    }
  }
  // closer over the leaf: a body and an arm
  const hy = d.leafH - 0.1;
  steel(0.72).box(c - 0.42, c - 0.16, hy - 0.03, hy + 0.03, oL + 0.002, oL + 0.05, 0.006);
  steel(0.65).tube([c - 0.17, hy, oL + 0.05, c - 0.05, hy + 0.04, oL + 0.056, c + 0.1, hy + 0.05, oL + 0.024], 0.006, 6);
  // the floor lock in the bottom rail
  steel(0.95).disc(c - off - 0.02, 0.25, oL + 0.002, oL + 0.008, 0.016, 12, 0.3);
  s.ink(0x060606).rough(0.9).plate(c - off - 0.0225, c - off - 0.0175, 0.241, 0.258, oL + 0.0083);
  // threshold
  s.ink(0x93918a).metal(0.42).box(0.02, w - 0.02, 0.141, 0.149, oL - 0.02, oL + d.d + 0.0, 0.002);
}

/** a pair of lobby doors: the bars close up, the closer */
export function lobbyDoors(s: HandSink, f: HandSpot): void {
  const c = f.w / 2;
  for (const sg of [-1, 1]) {
    const u = c + sg * 0.16;
    s.ink(f.color).metal(0.28).tube([u, 0.85, f.o + 0.09, u, 2.05, f.o + 0.09], 0.0195, 12);
    for (const y of [1.01, 1.91]) s.ink(f.color, 0.9).metal(0.3).tube([u, y, f.o, u, y, f.o + 0.09], 0.0105, 8);
  }
}

/** a garage door: a turning T handle and its lock, a rubber strip at the foot */
export function garage(s: HandSink, f: HandSpot): void {
  const c = f.w / 2;
  const o = f.o;
  s.ink(0x1b1c1e).rough(0.8).box(0.03, f.w - 0.03, 0, 0.022, o - 0.01, o + 0.012, 0.004);
  s.ink(0x8a8e92).metal(0.42).box(c - 0.035, c + 0.035, 0.86, 1.02, o, o + 0.006, 0.004);
  s.ink(0x4a4d51).metal(0.5).tube([c, 0.95, o + 0.002, c, 0.95, o + 0.03], 0.007, 6);
  s.ink(0x303234).metal(0.52).tube([c - 0.055, 0.95, o + 0.03, c + 0.055, 0.95, o + 0.03], 0.0085, 8);
  s.ink(0xb7b0a0).metal(0.42).disc(c, 0.895, o + 0.006, o + 0.012, 0.011, 10, 0.3);
  s.ink(0x050505).rough(0.9).plate(c - 0.001, c + 0.001, 0.889, 0.901, o + 0.0123);
}

/** a roller door: a hasp with a padlock at the foot and a hand chain coming out of its box at the side */
export function rollup(s: HandSink, f: HandSpot): void {
  const u = f.w / 2 + 0.32;
  const o = f.o;
  s.ink(0x4c4f52).metal(0.55).box(u - 0.05, u + 0.05, 0.26, 0.4, o, o + 0.006, 0.003);
  s.ink(0x5a5d60).metal(0.5).tube([u, 0.335, o + 0.006, u, 0.335, o + 0.03], 0.012, 8);
  // the lock: a brass body, a steel shackle through the staple
  s.ink(0xb29a55).metal(0.34).box(u - 0.021, u + 0.021, 0.245, 0.3, o + 0.016, o + 0.032, 0.004);
  s.ink(0xb7bbbe).metal(0.26).tube([u - 0.012, 0.3, o + 0.024, u - 0.012, 0.325, o + 0.024, u, 0.338, o + 0.024, u + 0.012, 0.325, o + 0.024, u + 0.012, 0.3, o + 0.024], 0.0034, 6);
  s.ink(0x2b2b2a).rough(0.8).disc(u, 0.262, o + 0.032, o + 0.0326, 0.0045, 8, 0.1);
}

/** a lantern round a lamp's lit box: frame, four posts, a cap, a wall bracket; glass that looks like glass by day and glows at night */
export function lantern(s: HandSink, L: DoorLamp, seed: number, modern: boolean): void {
  const hw = L.w / 2 + 0.006,
    hh = L.h / 2,
    hd = L.d / 2 + 0.006;
  const tx = L.nz,
    tz = -L.nx;
  const paint = seed % 5 === 0 ? 0x3c2a1c : seed % 7 === 0 ? 0x2c3d33 : 0x17181a;
  const faces: [number, number, number, number, number][] = [
    // t, n, half width of the face, half depth from the centre
    [tx, tz, L.nx, L.nz, 0],
    [L.nx, L.nz, -tx, -tz, 1],
    [-L.nx, -L.nz, tx, tz, 2],
  ];
  // glass on three sides
  for (const f of faces) {
    const side = f[4] > 0;
    const a = side ? hd : hw,
      b = side ? hw : hd;
    s.frame(L.x + (f[2] * b) as number, L.y, L.z + f[3] * b, f[0], f[1], f[2], f[3]);
    s.ink(0xffe3b4).lamp().glow(-a, a, -hh, hh, 0);
    if (!modern) {
      // glazing bars
      s.ink(paint).metal(0.48).box(-a, a, -0.004, 0.004, 0, 0.004, 0.001);
    }
  }
  s.frame(L.x, L.y, L.z, tx, tz, L.nx, L.nz);
  s.ink(paint).metal(modern ? 0.34 : 0.5);
  const back = -(L.d / 2 + L.back);
  if (modern) {
    // a flat housing above and below; slim posts at the back
    s.box(-hw - 0.012, hw + 0.012, hh - 0.012, hh + 0.042, back + 0.002, hd + 0.012, 0.005);
    s.box(-hw - 0.012, hw + 0.012, -hh - 0.042, -hh + 0.012, back + 0.002, hd + 0.012, 0.005);
    s.box(-hw - 0.004, -hw + 0.012, -hh, hh, back + 0.002, hd - 0.04, 0.002);
    s.box(hw - 0.012, hw + 0.004, -hh, hh, back + 0.002, hd - 0.04, 0.002);
    return;
  }
  for (const [u, o] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) s.tube([u, -hh - 0.012, o, u, hh + 0.012, o], 0.0065, 6);
  // base and top frames
  s.box(-hw - 0.008, hw + 0.008, -hh - 0.024, -hh + 0.004, -hd - 0.008, hd + 0.008, 0.004);
  s.box(-hw - 0.008, hw + 0.008, hh - 0.004, hh + 0.012, -hd - 0.008, hd + 0.008, 0.003);
  // a cap running up to a small chimney, then a finial
  const r = hw + 0.02,
    q = hd + 0.02,
    y0 = hh + 0.012,
    y1 = hh + 0.085;
  s.quad([-r, y0, q], [r, y0, q], [0.022, y1, 0.022], [-0.022, y1, 0.022]);
  s.quad([r, y0, q], [r, y0, -q], [0.022, y1, -0.022], [0.022, y1, 0.022]);
  s.quad([-r, y0, -q], [-r, y0, q], [-0.022, y1, 0.022], [-0.022, y1, -0.022]);
  s.quad([r, y0, -q], [-r, y0, -q], [-0.022, y1, -0.022], [0.022, y1, -0.022]);
  s.box(-0.026, 0.026, y1 - 0.002, y1 + 0.012, -0.026, 0.026, 0.003);
  s.ball(0, y1 + 0.03, 0, 0.016, 8);
  // the foot, and a bracket back to the wall with a plate
  s.tube([0, -hh - 0.024, 0, 0, -hh - 0.05, 0], 0.012, 8, 0.004);
  s.tube([0, hh - 0.08, -hd, 0, hh - 0.08, back + 0.002], 0.0085, 8);
  s.tube([0, hh + 0.03, -q + 0.012, 0, hh + 0.09, back + 0.05, 0, hh + 0.09, back + 0.002], 0.0065, 7);
  s.box(-0.034, 0.034, hh - 0.14, hh + 0.135, back, back + 0.008, 0.004);
}
