// How each kind of printed thing is laid out: an hours card, a menu, a bill, a timetable. Every painter writes on the
// surface the sink's frame is set to, x right and y up from the lower left corner, in metres. A thing is written in tiers:
// its paper and big words go in a wider ring, its small print only where it can be read.

import { FACE, ICON } from './font';
import { fadeFor, shade, type LetterSink, type TextOpts } from './sink';
import { billOf, firm, houseName, noticeOf, paperOf, phone, pick, placard, plaqueOf, price, residents, stream, tenants, weekLines, COUNCIL, type Shop, type R } from './wording';

/** tiers: 0 big (name boards), 1 middle (paper, headings), 2 fine (body text) */
export type Tier = 0 | 1 | 2;

const INK = 0x1c1c22;
const GREY = 0x55565c;

function line(s: LetterSink, x0: number, y0: number, x1: number, y1: number, col: number, t: number, z = 0): void {
  if (Math.abs(y1 - y0) < 1e-6) s.solid(x0, y0 - t / 2, x1, y0 + t / 2, col, z);
  else s.solid(x0 - t / 2, y0, x0 + t / 2, y1, col, z);
}

// ─────────────────────────────────────────────────────────── shop fronts ──

/** the name board, over the far sign's painted lettering */
export function fascia(s: LetterSink, w: number, h: number, shop: Shop, bg: number, fg: number, upper: boolean): void {
  const face = shop.face;
  // the board's own paint covers the far atlas' letters; a moulded line inside it, as on the far sign
  s.fadeAt(60);
  s.solid(0, 0, w, h, bg);
  const b = Math.max(0.012, h * 0.06);
  if (!upper) {
    s.solid(h * 0.08, h * 0.08, w - h * 0.08, h * 0.08 + b, fg, 0.0005);
    s.solid(h * 0.08, h - h * 0.08 - b, w - h * 0.08, h - h * 0.08, fg, 0.0005);
    s.solid(h * 0.08, h * 0.08, h * 0.08 + b, h - h * 0.08, fg, 0.0005);
    s.solid(w - h * 0.08 - b, h * 0.08, w - h * 0.08, h - h * 0.08, fg, 0.0005);
  }
  const title = upper ? shop.title.toUpperCase() : shop.title;
  const hasStrap = h > 0.42 && !upper;
  const tH = hasStrap ? h * 0.46 : h * 0.62;
  const size = s.fit(title, w * 0.84, tH, face);
  const yT = hasStrap ? h * 0.42 : h / 2 - size * 0.34;
  // the signwriter's drop shadow
  if (!upper) s.text(title, w / 2 + size * 0.03, yT - size * 0.04, size, { face, color: shade(bg, 0.45), align: 'center', z: 0.001 });
  s.text(title, w / 2, yT, size, { face, color: fg, align: 'center', z: 0.0015, glow: 0.75 });
  if (hasStrap) {
    s.fadeAt(Math.min(60, fadeFor(h * 0.14)));
    const st = shop.strap;
    const ss = s.fit(st, w * 0.74, h * 0.15, FACE.SANS_B, 0.04);
    s.text(st, w / 2, h * 0.19, ss, { face: FACE.SANS_B, color: fg, align: 'center', z: 0.0015, track: 0.04, glow: 0.3 });
  }
}

/** a shop's name on a band with no board of its own, near only */
export function band(s: LetterSink, w: number, h: number, shop: Shop, fg: number): void {
  s.fadeAt(46);
  const title = shop.title.toUpperCase();
  const size = s.fit(title, w * 0.9, h * 0.6, FACE.HUMAN, 0.05);
  s.text(title, w / 2, h / 2 - size * 0.34, size, { face: FACE.HUMAN, color: fg, align: 'center', track: 0.05, glow: 0.9 });
}

const GILT = 0xd8b45a;

/** painted on the window: gilt letters with a dark edge, or white with a black one; `which`: this window's share of the shop's words */
export function windowWords(s: LetterSink, w: number, h: number, shop: Shop, which: number, tier: Tier): void {
  const r = stream(shop.seed + which * 7);
  const words = shop.glass[which % shop.glass.length];
  if (tier === 1) {
    const gilt = shop.seed % 3 !== 0;
    const col = gilt ? 0xf4cf6a : 0xffffff;
    const edge = gilt ? 0x20150a : 0x101218;
    const face = gilt ? shop.face : FACE.HUMAN;
    s.fadeAt(30);
    const size = s.fit(words, w * 0.86, Math.min(0.17, h * 0.2), face);
    const y = h * (0.56 + r() * 0.05);
    s.text(words, w / 2, y, size, { face, color: edge, align: 'center', z: 0.0005, weight: 0.42 });
    s.text(words, w / 2, y, size, { face, color: col, align: 'center', z: 0.001, glow: 0.15 });
    // the shop's mark under the words
    if (which % 2 === 0 && h > 1) {
      const ms = size * 1.2;
      s.text(shop.icon, w / 2, y - ms * 1.15, ms, { face, color: edge, align: 'center', z: 0.0005, weight: 0.42 });
      s.text(shop.icon, w / 2, y - ms * 1.15, ms, { face, color: col, align: 'center', z: 0.001 });
    }
  }
  // a sheet taped inside the glass, marker on paper
  const sheet = shop.offers[(which + 1) % shop.offers.length];
  const sw = 0.2,
    sh = 0.28;
  const left = which % 2 === 0;
  const cx = left ? sw * 0.62 + r() * 0.05 : w - sw * 0.62 - r() * 0.05,
    cy = sh * 0.6 + r() * 0.1;
  if (w < 0.8 || h < 0.6) return;
  const rot = (r() - 0.5) * 0.05;
  if (tier === 1) {
    s.fadeAt(20);
    s.sheet(cx, cy, sw, sh, rot, r() < 0.3 ? 0xf2e49a : 0xf6f3ea, 0.001);
    s.sheet(cx, cy + sh / 2 - 0.004, 0.05, 0.016, rot * 2, 0xc9bb8c, 0.0014, 0.8);
  } else if (tier === 2) {
    s.fadeAt(fadeFor(0.03));
    const size = 0.026;
    s.para(sheet, cx - sw / 2 + 0.018, cy + sh / 2 - 0.05, sw - 0.036, size, { face: FACE.HAND, color: 0x24242c, z: 0.002 }, 1.32, 8);
  }
}

/** the hours card and the sign that turns, inside the glass of a shop door (on one leaf, clear of the handles) */
export function shopDoor(s: LetterSink, w: number, shop: Shop, address: string, tier: Tier): void {
  const cx = w > 1 ? w * 0.75 : w / 2;
  const open = shop.today;
  if (tier === 1) {
    // OPEN / CLOSED on a chain, turned by the hour
    s.fadeAt(30);
    const sw = 0.25,
      sh = 0.1,
      y = 1.86;
    s.solid(cx - 0.05, y + sh / 2, cx - 0.046, y + 0.14, 0x202020, 0.001);
    s.solid(cx + 0.046, y + sh / 2, cx + 0.05, y + 0.14, 0x202020, 0.001);
    s.solid(cx - sw / 2 - 0.008, y - sh / 2 - 0.008, cx + sw / 2 + 0.008, y + sh / 2 + 0.008, 0x20252a, 0.001);
    const a = open ? open[0] : 0,
      b = open ? open[1] : 0;
    if (open) {
      s.solid(cx - sw / 2, y - sh / 2, cx + sw / 2, y + sh / 2, 0x2c7a48, 0.0015, 0, a, b);
      s.text('OPEN', cx, y - 0.026, 0.07, { face: FACE.BLACK, color: 0xf8f6ee, align: 'center', z: 0.002, from: a, to: b, glow: 0.4 });
    }
    s.solid(cx - sw / 2, y - sh / 2, cx + sw / 2, y + sh / 2, 0xa8322a, 0.0015, 0, b, a);
    s.text('CLOSED', cx, y - 0.024, 0.062, { face: FACE.BLACK, color: 0xf8f6ee, align: 'center', z: 0.002, from: b, to: a, maxW: sw - 0.02 });
    // the card under it
    s.solid(cx - 0.11, 1.38, cx + 0.11, 1.74, 0xf6f4ec, 0.001);
    s.solid(cx - 0.11, 1.68, cx + 0.11, 1.74, 0x2e3238, 0.0012);
    // stickers on the glass low down: cards, the owner's line
    s.solid(cx - 0.11, 1.24, cx - 0.005, 1.3, 0x2a4a8a, 0.001);
    s.solid(cx + 0.005, 1.24, cx + 0.11, 1.3, 0xe8e4d8, 0.001);
    s.text(shop.title, w / 2, 2.2, 0.05, { face: shop.face, color: 0xf4cf6a, align: 'center', z: 0.001, maxW: w * 0.72 });
    return;
  }
  if (tier !== 2) return;
  s.fadeAt(fadeFor(0.014));
  s.text('Opening hours', cx, 1.698, 0.024, { face: FACE.SANS_B, color: 0xf4f2ea, align: 'center', z: 0.0016 });
  let y = 1.645;
  for (const [d, t] of weekLines(shop.week)) {
    s.text(d, cx - 0.098, y, 0.0165, { face: FACE.SANS_B, color: INK, z: 0.0016 });
    s.text(t, cx + 0.098, y, 0.0165, { face: FACE.SANS, color: INK, align: 'right', z: 0.0016, maxW: 0.115 });
    y -= 0.033;
  }
  s.text(address, cx, 1.445, 0.0135, { face: FACE.SANS, color: GREY, align: 'center', z: 0.0016, maxW: 0.2 });
  s.text(shop.phone, cx, 1.42, 0.0135, { face: FACE.SANS, color: GREY, align: 'center', z: 0.0016, maxW: 0.2 });
  s.text(`${ICON.card} Cards`, cx - 0.058, 1.262, 0.019, { face: FACE.SANS_B, color: 0xf0f0ea, align: 'center', z: 0.0016, maxW: 0.095 });
  s.text(`${shop.owner}, prop.`, cx + 0.058, 1.265, 0.0105, { face: FACE.SANS, color: INK, align: 'center', z: 0.0016, maxW: 0.095 });
}

/** the menu, in a brass frame on the glass */
export function menuCard(s: LetterSink, x: number, y: number, shop: Shop, tier: Tier): void {
  const menu = shop.menu;
  if (!menu) return;
  const w = 0.3,
    h = 0.44;
  if (tier === 1) {
    s.fadeAt(26);
    s.box(x - 0.016, y - 0.016, x + w + 0.016, y + h + 0.016, 0.012, 0xa88a4a);
    s.solid(x, y, x + w, y + h, 0xf6f1e2, 0.0125);
    s.text(shop.title, x + w / 2, y + h - 0.042, 0.03, { face: shop.face, color: 0x2a2018, align: 'center', z: 0.013, maxW: w - 0.04 });
    s.text(menu.head, x + w / 2, y + h - 0.066, 0.016, { face: FACE.SERIF, color: 0x5a4a38, align: 'center', z: 0.013, slant: 0.2 });
    return;
  }
  if (tier !== 2) return;
  s.fadeAt(fadeFor(0.009));
  let yy = y + h - 0.086;
  const fs = 0.0105;
  const count = menu.sections.reduce((n, sec) => n + sec[1].length + 1.5, 0);
  const lead = Math.min(fs * 1.5, (h - 0.1) / count);
  for (const [head, items] of menu.sections) {
    if (yy < y + 0.02) break;
    s.text(head, x + 0.02, yy, fs * 1.1, { face: FACE.SERIF_B, color: 0x7a2a22, z: 0.013 });
    yy -= lead * 1.2;
    for (const [name, p] of items) {
      if (yy < y + 0.012) break;
      s.text(name, x + 0.02, yy, fs, { face: FACE.SERIF, color: INK, z: 0.013, maxW: w - 0.09 });
      s.text(price(p), x + w - 0.02, yy, fs, { face: FACE.SERIF, color: INK, align: 'right', z: 0.013 });
      yy -= lead;
    }
    yy -= lead * 0.3;
  }
}

/** a chalk board: a board and four lines; writes on the current frame, its lower left at the origin */
export function chalkBoard(s: LetterSink, w: number, h: number, shop: Shop, tier: Tier): void {
  const lines = shop.chalk;
  if (!lines) return;
  if (tier === 1) {
    s.fadeAt(26);
    s.solid(0, 0, w, h, 0x8a6a3e);
    s.solid(0.03, 0.03, w - 0.03, h - 0.03, 0x25292a, 0.001);
    s.text(shop.icon, w / 2, h - 0.15, 0.1, { face: FACE.HAND, color: 0xe8e6d8, align: 'center', z: 0.002 });
  }
  if (tier === 2 || tier === 1) {
    s.fadeAt(tier === 1 ? 22 : fadeFor(0.02));
    const r = stream(shop.seed + 3);
    let y = h - 0.22;
    lines.forEach((l, i) => {
      const size = s.fit(l, w - 0.12, 0.05, FACE.HAND);
      const col = i === 0 ? 0xf0e8b0 : i === 2 ? 0xf0c8c8 : 0xf0efe6;
      if ((tier === 1) === (size >= 0.04)) s.text(l, w / 2, y, size, { face: FACE.HAND, color: col, align: 'center', z: 0.002, rot: (r() - 0.5) * 0.04 });
      y -= Math.max(size * 1.5, 0.06);
    });
  }
}

// ────────────────────────────────────────────────────────── doors of homes ──

/** a lit-push and name by a house door, a sticker on the letterbox */
export function homeBells(s: LetterSink, flats: number, seed: number, tier: Tier): void {
  const names = residents(seed, flats);
  const pw = 0.14,
    rowH = 0.045,
    ph = 0.024 + flats * rowH;
  if (tier === 1) {
    s.fadeAt(14);
    s.box(0, 0, pw, ph, 0.006, seed % 2 ? 0xb9a468 : 0xa8acae);
    for (let k = 0; k < flats; k++) {
      s.box(pw - 0.03, 0.016 + k * rowH, pw - 0.012, 0.034 + k * rowH, 0.003, 0x34363a, undefined, 0.006);
      s.solid(0.008, 0.012 + k * rowH, pw - 0.036, 0.04 + k * rowH, 0xf4f1e6, 0.0062);
    }
    return;
  }
  if (tier !== 2) return;
  s.fadeAt(fadeFor(0.008));
  for (let k = 0; k < flats; k++) s.text(names[k], 0.012, 0.021 + k * rowH, 0.011, { face: FACE.MONO, color: INK, z: 0.0066, maxW: pw - 0.05 });
}

/** a slate or ceramic name by the door of a house */
export function housePlate(s: LetterSink, seed: number): void {
  const r = stream(seed + 4441);
  const name = houseName(r);
  const slate = seed % 2 === 0;
  const w = 0.3,
    h = 0.11;
  s.fadeAt(16);
  s.box(0, 0, w, h, 0.008, slate ? 0x34383c : 0xf0ebdc);
  const col = slate ? 0xe6e2d4 : 0x24406c;
  const size = s.fit(name, w - 0.04, 0.05, FACE.SERIF);
  s.text(name, w / 2, h / 2 - size * 0.32, size, { face: FACE.SERIF, color: col, align: 'center', z: 0.0085 });
}

/** by the door of a works: its name, and what callers are to do */
export function worksPlate(s: LetterSink, seed: number, tier: Tier): void {
  const r = stream(seed + 9001);
  const w = 0.5,
    h = 0.34;
  const head = firm(r);
  if (tier === 1) {
    s.fadeAt(26);
    s.box(0, 0, w, h, 0.006, 0xf2f0e8);
    s.solid(0, h - 0.1, w, h, 0x1e3a5c, 0.0065);
    const size = s.fit(head, w - 0.04, 0.042, FACE.SANS_B);
    s.text(head, w / 2, h - 0.066, size, { face: FACE.SANS_B, color: 0xffffff, align: 'center', z: 0.0068 });
    return;
  }
  if (tier !== 2) return;
  const lines = pick(r, [
    ['All visitors report', 'to reception', 'Hi-vis beyond this point'],
    ['Deliveries Mon – Fri', '7.30 am – 3.30 pm', 'Sound horn for attention'],
    ['Goods in round the side', 'No waiting at this door', 'Keep access clear'],
    ['Authorised staff only', 'Mind reversing vehicles', 'This site is monitored'],
  ]);
  s.fadeAt(fadeFor(0.012));
  s.text(lines[0], 0.024, h - 0.14, 0.024, { face: FACE.SANS_B, color: INK, z: 0.0068, maxW: w - 0.048 });
  s.text(lines[1], 0.024, h - 0.178, 0.024, { face: FACE.SANS, color: INK, z: 0.0068, maxW: w - 0.048 });
  s.text(lines[2], 0.024, h - 0.222, 0.018, { face: FACE.SANS, color: GREY, z: 0.0068, maxW: w - 0.048 });
  s.text(phone(r), 0.024, 0.024, 0.018, { face: FACE.MONO, color: INK, z: 0.0068 });
}

/** the enamel or ceramic plate over a door, written again at full sharpness */
export function numberPlate(s: LetterSink, w: number, h: number, n: number, style: number): void {
  s.fadeAt(18);
  const txt = String(n);
  if (style === 2) {
    const size = s.fit(txt, w * 0.92, h * 0.96, FACE.SERIF_B);
    s.text(txt, w / 2 + size * 0.02, h / 2 - size * 0.36, size, { face: FACE.SERIF_B, color: 0x3a2a10, align: 'center', z: 0.0004 });
    s.text(txt, w / 2, h / 2 - size * 0.33, size, { face: FACE.SERIF_B, color: 0xc9a54e, align: 'center', z: 0.001 });
    return;
  }
  const bg = style === 0 ? 0x1d3f8a : 0xf2efe6,
    fg = style === 0 ? 0xf4f4f4 : 0x161616;
  s.solid(0.002, 0.002, w - 0.002, h - 0.002, bg);
  const t = 0.004,
    m = h * 0.09;
  s.solid(m, m, w - m, m + t, fg, 0.0003);
  s.solid(m, h - m - t, w - m, h - m, fg, 0.0003);
  s.solid(m, m, m + t, h - m, fg, 0.0003);
  s.solid(w - m - t, m, w - m, h - m, fg, 0.0003);
  const face = style === 0 ? FACE.SANS_B : FACE.SERIF;
  const size = s.fit(txt, w * 0.7, h * 0.66, face);
  s.text(txt, w / 2, h / 2 - size * 0.35, size, { face, color: fg, align: 'center', z: 0.0006 });
}

/** a stuck-on line on a door: "No junk mail please" */
export function doorSticker(s: LetterSink, x: number, y: number, words: string, seed: number): void {
  const w = 0.13,
    h = 0.032;
  s.fadeAt(fadeFor(0.008));
  s.solid(x, y, x + w, y + h, seed % 2 ? 0xf2efe2 : 0xf6d94a, 0.002);
  s.text(words, x + w / 2, y + 0.011, 0.0115, { face: FACE.SANS_B, color: INK, align: 'center', z: 0.0024, maxW: w - 0.01 });
}

/** the directory of an office building on its black board */
export function tenantBoard(s: LetterSink, w: number, h: number, seed: number, floors: number, tier: Tier): void {
  const list = tenants(seed, Math.min(floors, 9));
  if (tier === 1) {
    s.fadeAt(20);
    s.solid(0, 0, w, h, 0x15191d, 0.0004);
    s.text('DIRECTORY', w / 2, h - 0.055, 0.026, { face: FACE.HUMAN, color: 0xc9ced2, align: 'center', z: 0.0008, track: 0.12 });
    s.solid(0.03, h - 0.075, w - 0.03, h - 0.072, 0x7d848a, 0.0008);
    return;
  }
  if (tier !== 2) return;
  s.fadeAt(fadeFor(0.009));
  const lead = Math.min(0.062, (h - 0.11) / list.length);
  let y = h - 0.105;
  for (const l of list) {
    s.text(l, 0.03, y, 0.0165, { face: FACE.HUMAN, color: 0xdfe2e4, z: 0.0008, maxW: w - 0.05 });
    y -= lead;
  }
}

// ─────────────────────────────────────────────────── bills and notices ──

/** a bill on a wall or a column; w × h */
export function billPaint(s: LetterSink, w: number, h: number, seed: number, tier: Tier): void {
  const b = billOf(seed);
  if (tier === 1) {
    s.fadeAt(34);
    s.solid(0, 0, w, h, b.bg);
    const k = w * 0.5;
    if (b.form === 0) {
      // a sun or a moon
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        s.sheet(w / 2, h * 0.5, w * 0.9, h * 0.012, a, b.accent, 0.0002, 0.35);
      }
      s.sheet(w / 2, h * 0.5, k * 0.7, k * 0.7, 0, b.accent, 0.0003);
      s.sheet(w / 2, h * 0.5, k * 0.7, k * 0.7, Math.PI / 4, b.accent, 0.0003);
    } else if (b.form === 1) {
      for (let i = 0; i < 5; i++) s.solid(0, h * (0.36 + i * 0.055), w, h * (0.36 + i * 0.055 + 0.022), b.accent, 0.0002, 0, 0, 24, 0.8);
    } else if (b.form === 2) {
      // a sail
      s.solid(0, h * 0.34, w, h * 0.42, b.accent, 0.0002, 0, 0, 24, 0.55);
      s.sheet(w * 0.5, h * 0.52, w * 0.34, h * 0.26, 0.5, b.accent, 0.0003);
    } else {
      s.solid(w * 0.08, h * 0.32, w * 0.92, h * 0.62, b.accent, 0.0002, 0, 0, 24, 0.9);
      s.text(ICON.star, w / 2, h * 0.38, h * 0.22, { color: b.bg, face: FACE.SANS, align: 'center', z: 0.0004 });
    }
    // the headline: as big as the width lets it, in as many lines as it has words (or two)
    const words = b.head.split(' ');
    const rows = words.length <= 2 ? words : [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')];
    let y = h * 0.965;
    for (const row of rows) {
      const size = s.fit(row, w * 0.9, h * 0.16, b.face);
      y -= size * 0.82;
      s.text(row, w / 2, y, size, { face: b.face, color: b.ink, align: 'center', z: 0.0005 });
      y -= size * 0.14;
    }
    const ss = s.fit(b.sub, w * 0.88, h * 0.04, FACE.SANS_B);
    s.text(b.sub, w / 2, h * 0.255, ss, { face: FACE.SANS_B, color: b.ink, align: 'center', z: 0.0005 });
    return;
  }
  if (tier !== 2) return;
  const fs = Math.min(h * 0.024, w * 0.05);
  s.fadeAt(fadeFor(fs * 0.7));
  let y = h * 0.2;
  for (const l of b.lines) {
    s.text(l, w / 2, y, fs, { face: FACE.SANS, color: b.ink, align: 'center', z: 0.0005, maxW: w * 0.9 });
    y -= fs * 1.35;
  }
  s.text(b.foot, w / 2, h * 0.03, fs * 0.8, { face: FACE.SANS_B, color: b.ink, align: 'center', z: 0.0005, maxW: w * 0.9 });
}

/** a neighbour's notice, in marker or typed */
export function noticePaint(s: LetterSink, w: number, h: number, seed: number, tier: Tier): void {
  const n = noticeOf(seed);
  const m = w * 0.08;
  const tabsH = n.tabs ? h * 0.18 : 0;
  if (tier === 1) {
    s.fadeAt(18);
    s.solid(0, tabsH, w, h, n.paper);
    if (n.tabs) {
      for (let k = 0; k < 7; k++) {
        const tw = w / 7;
        if ((seed >> k) & 1 && k % 3 !== 0) continue;
        s.solid(k * tw + 0.001, 0, (k + 1) * tw - 0.001, tabsH, n.paper);
      }
    }
    const size = s.fit(n.head, w - 2 * m, h * 0.11, n.face);
    s.text(n.head, w / 2, h - m - size * 0.8, size, { face: n.face, color: INK, align: 'center', z: 0.0005 });
    return;
  }
  if (tier !== 2) return;
  const fs = w * 0.062;
  s.fadeAt(fadeFor(fs * 0.7));
  let y = h - m - h * 0.16;
  if (n.cat) {
    s.text(ICON.dog, w / 2, y - fs * 3, fs * 4, { face: FACE.SANS, color: 0x26262c, align: 'center', z: 0.0005 });
    y -= fs * 5;
  }
  const hand = n.face === FACE.HAND;
  for (const l of n.lines) y = s.para(l, m, y, w - 2 * m, fs, { face: hand ? FACE.HAND : FACE.SANS, color: INK, z: 0.0005 }, 1.3) - fs * 0.25;
  if (n.tabs) {
    const tw = w / 7;
    const cr = Math.PI / 2;
    for (let k = 0; k < 7; k++) {
      if ((seed >> k) & 1 && k % 3 !== 0) continue;
      s.text(n.tabs, k * tw + tw * 0.68, tabsH * 0.06, Math.min(tw * 0.42, tabsH / (n.tabs.length * 0.52)), { face: FACE.SANS, color: INK, z: 0.0005, rot: cr });
    }
  }
}

// ───────────────────────────────────────────────────────────── the bus stop ──

export interface StopInfo {
  name: string;
  line: number;
  color: number;
  next: string[];
  from: string;
  to: string;
  /** minutes past the hour, this stop's offset along the route */
  offset: number;
  headway: number;
}

const minutes = (off: number, every: number): string => {
  const out: string[] = [];
  for (let m = off % every; m < 60; m += every) out.push(String(m).padStart(2, '0'));
  return out.join(' ');
};

export function timetable(s: LetterSink, w: number, h: number, st: StopInfo, tier: Tier): void {
  if (tier === 1) {
    s.fadeAt(20);
    s.solid(0, 0, w, h, 0xf6f4ec, 0.0005);
    s.solid(0, h - 0.052, w, h, st.color, 0.0008);
    s.text(`Line ${st.line}`, 0.012, h - 0.037, 0.028, { face: FACE.HUMAN, color: 0xffffff, z: 0.001, weight: 0.1 });
    s.text(st.name, w - 0.012, h - 0.036, 0.022, { face: FACE.HUMAN, color: 0xffffff, align: 'right', z: 0.001, maxW: w * 0.6 });
    return;
  }
  if (tier !== 2) return;
  s.fadeAt(fadeFor(0.007));
  const fs = 0.0102;
  let y = h - 0.068;
  s.text(`Towards ${st.to}`, 0.012, y, fs * 1.15, { face: FACE.SANS_B, color: INK, z: 0.001, maxW: w - 0.024 });
  y -= fs * 1.45;
  const stops = st.next.slice(0, 5);
  stops.forEach((n, i) => {
    s.text(`${n}`, 0.018, y, fs * 0.9, { face: FACE.SANS, color: INK, z: 0.001, maxW: w * 0.7 });
    s.text(`${(i + 1) * 4 + 1} min`, w - 0.012, y, fs * 0.9, { face: FACE.SANS, color: INK, align: 'right', z: 0.001 });
    y -= fs * 1.2;
  });
  y -= fs * 0.3;
  line(s, 0.012, y + fs * 0.9, w - 0.012, y + fs * 0.9, GREY, 0.0006, 0.001);
  s.text('Hr', 0.012, y, fs * 0.9, { face: FACE.SANS_B, color: INK, z: 0.001 });
  s.text('Mon – Fri', 0.042, y, fs * 0.9, { face: FACE.SANS_B, color: INK, z: 0.001 });
  s.text('Sat / Sun', 0.04 + (w - 0.05) * 0.55, y, fs * 0.9, { face: FACE.SANS_B, color: INK, z: 0.001 });
  y -= fs * 1.2;
  const wk = st.headway,
    we = st.headway * 2;
  for (let hr = 6; hr <= 23 && y > 0.008; hr++) {
    const peak = (hr >= 7 && hr < 10) || (hr >= 16 && hr < 19);
    const late = hr >= 21;
    s.text(String(hr).padStart(2, '0'), 0.012, y, fs, { face: FACE.MONO, color: INK, z: 0.001, weight: 0.1 });
    s.text(minutes(st.offset, late ? 30 : peak ? Math.max(5, wk - 2) : wk), 0.042, y, fs * 0.85, { face: FACE.MONO, color: INK, z: 0.001, maxW: (w - 0.05) * 0.53 });
    s.text(minutes(st.offset + 3, late || hr < 8 ? 60 : we), 0.04 + (w - 0.05) * 0.55, y, fs * 0.85, { face: FACE.MONO, color: INK, z: 0.001, maxW: (w - 0.05) * 0.44 });
    y -= fs * 1.1;
  }
}

/** the stop flag over its old pixel letters */
export function stopFlag(s: LetterSink, w: number, h: number, st: StopInfo): void {
  s.fadeAt(34);
  s.solid(0, 0, w, h, 0xf4f2ea, 0.0005);
  s.solid(0, h - 0.13, w, h, st.color, 0.0008);
  s.text('BUS', w / 2, h - 0.103, 0.075, { face: FACE.HUMAN, color: 0xffffff, align: 'center', z: 0.001, weight: 0.12, track: 0.06 });
  s.text(ICON.bus, w * 0.5, h * 0.42, 0.13, { face: FACE.SANS, color: st.color, align: 'center', z: 0.001 });
  s.fadeAt(22);
  s.text(String(st.line), w * 0.85, h * 0.43, 0.09, { face: FACE.SANS_B, color: INK, align: 'right', z: 0.001 });
  const size = s.fit(st.name, w - 0.04, 0.042, FACE.HUMAN);
  s.text(st.name, w / 2, 0.066, size, { face: FACE.HUMAN, color: INK, align: 'center', z: 0.001, weight: 0.08 });
  s.text(`towards ${st.to}`, w / 2, 0.026, 0.021, { face: FACE.SANS, color: GREY, align: 'center', z: 0.001, maxW: w - 0.04 });
}

// ──────────────────────────────────────────────────────────── papers ──

/** a front page */
export function frontPage(s: LetterSink, w: number, h: number, seed: number, tier: Tier): void {
  const p = paperOf(seed);
  const mast = p.serif ? FACE.SERIF_B : FACE.TALL;
  if (tier === 1) {
    s.fadeAt(14);
    s.solid(0, 0, w, h, 0xece8da);
    const ms = s.fit(p.masthead, w * 0.92, h * 0.1, mast);
    s.text(p.masthead, w / 2, h - ms * 0.9 - h * 0.012, ms, { face: mast, color: p.serif ? INK : 0xb0221c, align: 'center', z: 0.0003 });
    s.solid(w * 0.04, h - ms * 1.1 - h * 0.03, w * 0.96, h - ms * 1.1 - h * 0.026, INK, 0.0003);
    const words = p.headline.split(' ');
    const a = words.slice(0, Math.ceil(words.length / 2)).join(' '),
      b = words.slice(Math.ceil(words.length / 2)).join(' ');
    let y = h - ms * 1.1 - h * 0.05;
    for (const row of [a, b]) {
      const size = s.fit(row, w * 0.92, h * 0.1, FACE.TALL);
      y -= size * 0.84;
      s.text(row, w / 2, y, size, { face: FACE.TALL, color: INK, align: 'center', z: 0.0003 });
      y -= size * 0.1;
    }
    // the photograph
    s.solid(w * 0.05, h * 0.3, w * 0.58, h * 0.53, 0x7c7f80, 0.0003);
    s.solid(w * 0.05, h * 0.3, w * 0.58, h * 0.38, 0x55585a, 0.0004);
    return;
  }
  if (tier !== 2) return;
  const fs = w * 0.021;
  s.fadeAt(fadeFor(fs * 0.7));
  const ms = s.fit(p.masthead, w * 0.92, h * 0.1, mast);
  s.text(`${p.date} · ${p.price}`, w / 2, h - ms * 1.1 - h * 0.022, fs * 0.9, { face: FACE.SANS, color: INK, align: 'center', z: 0.0004 });
  s.para(p.stand, w * 0.61, h * 0.53, w * 0.34, fs * 1.15, { face: FACE.SERIF_B, color: INK, z: 0.0004 }, 1.2, 8);
  s.text('A crowd on the quay yesterday', w * 0.05, h * 0.28, fs * 0.8, { face: FACE.SANS, color: GREY, z: 0.0004, slant: 0.2 });
  const cols = 3;
  const cw = (w * 0.92 - (cols - 1) * w * 0.02) / cols;
  for (let c = 0; c < cols; c++) {
    let y = h * 0.25;
    const x = w * 0.04 + c * (cw + w * 0.02);
    for (let k = 0; k < 2 && y > h * 0.02; k++) y = s.para(p.body[(c * 2 + k) % p.body.length], x, y, cw, fs, { face: FACE.SERIF, color: INK, z: 0.0004 }, 1.18, 9);
  }
}

/** the placard on a newsagent's stand */
export function placardPaint(s: LetterSink, w: number, h: number, seed: number): void {
  const [a, b] = placard(seed);
  s.fadeAt(26);
  s.solid(0, 0, w, h, 0xf4efe2);
  s.solid(0, h - h * 0.14, w, h, 0xb0221c, 0.0003);
  s.text('HAVEN POST', w / 2, h - h * 0.112, h * 0.09, { face: FACE.SERIF_B, color: 0xffffff, align: 'center', z: 0.0005, maxW: w * 0.9 });
  const size = Math.min(s.fit(a, w * 0.9, h * 0.3, FACE.TALL), s.fit(b, w * 0.9, h * 0.3, FACE.TALL));
  s.text(a, w / 2, h * 0.47, size, { face: FACE.TALL, color: INK, align: 'center', z: 0.0005 });
  s.text(b, w / 2, h * 0.14, size, { face: FACE.TALL, color: INK, align: 'center', z: 0.0005 });
}

// ──────────────────────────────────────────────────────── small municipal things ──

/** a small brass plate on a bench's back */
export function benchPlaque(s: LetterSink, seed: number): void {
  const lines = plaqueOf(seed).filter(Boolean);
  const w = 0.17,
    h = 0.055;
  s.fadeAt(fadeFor(0.012));
  s.box(-w / 2, 0, w / 2, h, 0.002, 0xb79a56);
  lines.forEach((l, i) => s.text(l, 0, h - 0.019 - i * 0.015, 0.0115, { face: FACE.SERIF, color: 0x2a2010, align: 'center', z: 0.0024, maxW: w - 0.012 }));
}

/** the collection times on a post box */
export function mailPlate(s: LetterSink, w: number, h: number, seed: number): void {
  s.fadeAt(fadeFor(0.008));
  const st = 8 + (seed % 3);
  s.text('Tinyhaven Post', w / 2, h - 0.018, 0.0125, { face: FACE.SANS_B, color: 0xa81e24, align: 'center', maxW: w - 0.012 });
  s.text('Collections', w / 2, h - 0.036, 0.0105, { face: FACE.SANS_B, color: INK, align: 'center' });
  s.text(`Mon – Fri  ${st}.30am  5.${15 + (seed % 4) * 5}pm`, w / 2, h - 0.054, 0.0095, { face: FACE.SANS, color: INK, align: 'center', maxW: w - 0.012 });
  s.text(`Saturday  ${st + 2}.45am`, w / 2, h - 0.069, 0.0095, { face: FACE.SANS, color: INK, align: 'center', maxW: w - 0.012 });
  s.text('Sunday  no collection', w / 2, h - 0.084, 0.0095, { face: FACE.SANS, color: INK, align: 'center', maxW: w - 0.012 });
  s.text(`Box no. TH${100 + (seed % 800)}`, w / 2, h - 0.104, 0.0095, { face: FACE.MONO, color: GREY, align: 'center' });
  s.text('Nearest post office:', w / 2, h - 0.125, 0.0085, { face: FACE.SANS, color: GREY, align: 'center', maxW: w - 0.012 });
  s.text('Market Street', w / 2, h - 0.138, 0.0085, { face: FACE.SANS, color: GREY, align: 'center', maxW: w - 0.012 });
}

/** a market trader's card: what it is and what it costs, chalked over the printed price */
export function priceCard(s: LetterSink, w: number, h: number, lines: string[]): void {
  s.fadeAt(fadeFor(0.009));
  s.solid(0, 0, w, h, 0x1d211f);
  const ns = s.fit(lines[0], w * 0.9, h * 0.3, FACE.HAND);
  s.text(lines[0], w / 2, h * 0.64, ns, { face: FACE.HAND, color: 0xf2efe6, align: 'center', z: 0.0003 });
  const ps = s.fit(lines[1] ?? '', w * 0.9, h * 0.36, FACE.HAND);
  s.text(lines[1] ?? '', w / 2, h * 0.25, ps, { face: FACE.HAND, color: 0xf2d890, align: 'center', z: 0.0003, weight: 0.1 });
  s.text(lines[2] ?? '', w / 2, h * 0.07, h * 0.15, { face: FACE.HAND, color: 0xd9d4c4, align: 'center', z: 0.0003, maxW: w * 0.9 });
}

/** the small plate under a road sign */
export function signPlate(s: LetterSink, w: number, h: number, lines: string[]): void {
  s.fadeAt(26);
  s.solid(0, 0, w, h, 0xf6f3ea);
  const t = 0.005;
  s.solid(0.004, 0.004, w - 0.004, 0.004 + t, INK, 0.0003);
  s.solid(0.004, h - 0.004 - t, w - 0.004, h - 0.004, INK, 0.0003);
  s.solid(0.004, 0.004, 0.004 + t, h - 0.004, INK, 0.0003);
  s.solid(w - 0.004 - t, 0.004, w - 0.004, h - 0.004, INK, 0.0003);
  const size = Math.min(s.fit(lines[0], w * 0.88, h * 0.36, FACE.SANS_B), s.fit(lines[1] ?? '', w * 0.88, h * 0.36, FACE.SANS_B));
  s.text(lines[0], w / 2, h * 0.57, size, { face: FACE.SANS_B, color: INK, align: 'center', z: 0.0005 });
  s.text(lines[1] ?? '', w / 2, h * 0.15, size, { face: FACE.SANS_B, color: INK, align: 'center', z: 0.0005 });
}

const CAB = [
  ['Haven Telecom', 'Cabinet'],
  ['Haven Electricity', 'Feeder pillar'],
  ['Tinyhaven Gas', 'Governor'],
  ['Traffic Signals', 'Controller'],
];

/** who owns a street cabinet, and its number */
export function cabinetLabel(s: LetterSink, w: number, h: number, seed: number, kind: number): void {
  const [a, b] = CAB[kind % CAB.length];
  s.fadeAt(fadeFor(0.008));
  s.text(a, w / 2, h - 0.016, 0.0115, { face: FACE.SANS_B, color: INK, align: 'center', maxW: w - 0.008 });
  s.text(`${b} ${100 + (seed % 899)}`, w / 2, h - 0.031, 0.0095, { face: FACE.SANS, color: INK, align: 'center', maxW: w - 0.008 });
  s.text('Fault? 0800 555 0142', w / 2, h - 0.044, 0.0075, { face: FACE.SANS, color: GREY, align: 'center', maxW: w - 0.008 });
}

export function cabinetWarning(s: LetterSink, w: number, h: number): void {
  s.fadeAt(fadeFor(0.012));
  s.text('!', w / 2, h * 0.3, h * 0.5, { face: FACE.BLACK, color: INK, align: 'center' });
  s.text('DANGER', w / 2, h * 0.08, h * 0.15, { face: FACE.SANS_B, color: INK, align: 'center', maxW: w * 0.9 });
}

/** the label on the door of a litter bin */
export function binLabel(s: LetterSink, w: number, h: number): void {
  s.fadeAt(fadeFor(0.012));
  s.solid(0, 0, w, h, 0xe9e4d6);
  s.text('LITTER', w / 2, h * 0.5, 0.027, { face: FACE.HUMAN, color: INK, align: 'center', z: 0.0004, track: 0.08, weight: 0.1 });
  s.text('Please keep Tinyhaven tidy', w / 2, h * 0.27, 0.0085, { face: FACE.SANS, color: INK, align: 'center', z: 0.0004, maxW: w - 0.012 });
  s.text(COUNCIL, w / 2, h * 0.09, 0.007, { face: FACE.SANS, color: GREY, align: 'center', z: 0.0004, maxW: w - 0.012 });
}

/** a lamp post's number on its yellow tag */
export function lampTag(s: LetterSink, n: number): void {
  s.fadeAt(fadeFor(0.012));
  s.solid(0, 0, 0.09, 0.075, 0xe6c21e);
  s.text('TH', 0.045, 0.046, 0.02, { face: FACE.SANS_B, color: INK, align: 'center', z: 0.0004 });
  s.text(String(n), 0.045, 0.012, 0.028, { face: FACE.SANS_B, color: INK, align: 'center', z: 0.0004 });
}

const STREET_CHALK = [
  ['TODAY', 'Fresh fish', 'Soup & bread £5', 'Hot coffee'],
  ['SPECIALS', 'Crab salad', 'Mackerel pâté', 'Lemon tart'],
  ['OPEN', 'Teas · Cakes', 'Dogs welcome', 'Come on in!'],
  ['MARKET', 'Fri & Sat', 'Local honey', 'Cheese stall'],
  ['LUNCH', '2 courses £12', 'Pie of the day', 'Ale £4.20'],
  ['ICE CREAMS', 'Cones £2.50', 'Tubs to go', 'Lollies'],
  ['SALE', 'Everything', 'must go', 'Half price'],
];

/** words on a chalk board that belongs to no shop (a market, a pitch) */
export function chalkWords(s: LetterSink, w: number, h: number, seed: number, tier: Tier): void {
  const lines = STREET_CHALK[seed % STREET_CHALK.length];
  const r = stream(seed);
  if (tier === 1) {
    s.fadeAt(26);
    s.solid(0, 0, w, h, 0x1f2421);
    const size = s.fit(lines[0], w * 0.86, 0.1, FACE.HAND);
    s.text(lines[0], w / 2, h - 0.14, size, { face: FACE.HAND, color: 0xf0efe0, align: 'center', z: 0.0005, weight: 0.1 });
    s.solid(w * 0.15, h - 0.165, w * 0.85, h - 0.16, 0xe8e6d8, 0.0005, 0, 0, 24, 0.7);
    return;
  }
  if (tier !== 2) return;
  s.fadeAt(fadeFor(0.03));
  let y = h - 0.25;
  for (let i = 1; i < lines.length; i++) {
    const size = s.fit(lines[i], w * 0.88, 0.062, FACE.HAND);
    s.text(lines[i], w / 2, y, size, { face: FACE.HAND, color: i === 2 ? 0xf0d890 : 0xeeeee2, align: 'center', z: 0.0005, rot: (r() - 0.5) * 0.04 });
    y -= 0.115;
  }
}

/** the council's small print on things it owns */
export function councilLabel(s: LetterSink, w: number, words: string, opts: TextOpts = {}): void {
  s.fadeAt(fadeFor(0.008));
  s.text(COUNCIL, w / 2, 0.015, 0.0105, { face: FACE.SANS, align: 'center', maxW: w * 0.95, ...opts });
  s.text(words, w / 2, 0.0, 0.0105, { face: FACE.SANS, align: 'center', maxW: w * 0.95, ...opts });
}

export const rnd = (r: R, a: number, b: number): number => a + (b - a) * r();
