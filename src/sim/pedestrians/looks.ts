// Appearance of the little people: clothing, skin, hair, accessories, names and ages.
// Colours are packed sRGB 0xRRGGBB integers (unpacked in the vertex shader).
//
// IMPORTANT: makeLook() draws from the crowd's main random stream. Every draw it makes must stay
// exactly as it is (same calls, same branch conditions), otherwise the whole crowd simulation
// (personas, speeds, routes) reshuffles. Palettes may change freely (a pick is one draw whatever
// the list length). Everything the new figures need beyond the original fields (hair style, hat
// style, hems, jackets / coats / dresses, legwear, shoes) lives in `style`, drawn from a private
// generator seeded by a hash of the main draws.

import { Rng } from '../../core/rng';
import { F } from './figure';

export type Persona =
  | 'commuter'
  | 'shopper'
  | 'stroller'
  | 'tourist'
  | 'beachgoer'
  | 'jogger'
  | 'dogwalker'
  | 'parent'
  | 'elderly'
  | 'worker'
  | 'couple'
  | 'family'
  | 'student'
  | 'nightowl'
  | 'angler';

export type BodyKind = 'man' | 'woman' | 'boy' | 'girl';

export type HairStyle = 'bald' | 'crop' | 'side' | 'curly' | 'long' | 'bob' | 'ponytail' | 'bun' | 'pixie' | 'manbun';

/** Garment / hair parameters of the new figures (see shader.ts for the units). */
export interface Style {
  hair: HairStyle;
  /** hang length below the cap edge (m; 0 = short) */
  hairLen: number;
  /** extra hair volume 0…1 (curly / afro ≈ 1) */
  hairVol: number;
  fringe: boolean;
  /** 0 none, 1 full beard, 2 moustache */
  beard: 0 | 1 | 2;
  /** hat style (shader.ts HAT_STYLES; 0 = none) */
  hat: number;
  /** sleeve end on the arm (1 shoulder … 0.5 elbow … 0 wrist; > 1 sleeveless) */
  sleeve: number;
  /** top / bottom boundary on the torso (0 crotch … 1 neck base; tucked ≈ 0.3) */
  topHem: number;
  /** trouser end on the leg (0.08 ankle … 0.5 knee … 1 hip) */
  trouserEnd: number;
  /** legs below the trousers / skirt: 0 skin, 1 dark tights, 2 sheer tights, 3 light socks */
  legwear: number;
  /** trouser cut from mid-thigh down: 0 skin-tight (leggings) … 0.6 jeans … 1 loose work / suit trousers */
  trouserFit: number;
  /** jacket / coat / cardigan: hem on the torso (< 0 = none) and colour */
  jacketHem: number;
  outer: number;
  collar: 0 | 1 | 2;
  tie: boolean;
  lapels: boolean;
  hood: boolean;
  /** 0 none, 1 skirt, 2 dress, 3 coat */
  tail: 0 | 1 | 2 | 3;
  /** hem height as a fraction of the hip-joint height, flare (m) */
  tailHem: number;
  tailFlare: number;
  /** 0 dark leather sole, 1 white trainer sole, 2 tonal */
  sole: 0 | 1 | 2;
  /** boot shaft top on the leg (0 = shoes) */
  bootTop: number;
  /** turtleneck / high collar top on the neck (0.95 = none … 1.25 under the chin) */
  neckTop: number;
  /** vest stripes (hi-vis) */
  vest: boolean;
}

export interface Look {
  kind: BodyKind;
  name: string;
  age: number;
  skin: number;
  top: number;
  bottom: number;
  shoes: number;
  hair: number;
  hat: number;
  bag: number;
  towel: number;
  umbrella: number;
  accent: number;
  /** base feature flags (umbrella / towel / newspaper are toggled at runtime) */
  flags: number;
  scale: number;
  girth: number;
  /** owns an umbrella (shown while it rains) */
  umbrellaOwner: boolean;
  /** swimwear colour used while sunbathing (0 = shirtless) */
  swim: number;
  dog: { fur: number; fur2: number; collar: number; size: number } | null;
  pram: { fabric: number } | null;
  /** new-figure garments (absent on hand-built looks: derived from the flags) */
  style?: Style;
}

const hex = (s: string) => parseInt(s.slice(1), 16);
const H = (list: string[]) => list.map(hex);
/** list with repeated entries (weights as counts) */
const W = (pairs: [string, number][]) => pairs.flatMap(([c, n]) => Array.from({ length: n }, () => hex(c)));

const SKIN = H(['#efcfb8', '#e9c3a6', '#e0b494', '#d4a17c', '#c48c64', '#ad754e', '#94603f', '#7a4b31', '#5e3825', '#e8bfa0']);
const HAIR_YOUNG = W([
  ['#15110f', 3],
  ['#221913', 3],
  ['#2f2119', 3],
  ['#40291b', 3],
  ['#563a24', 2],
  ['#6b4a2e', 2],
  ['#86603a', 1],
  ['#a2804e', 1],
  ['#c4a067', 1],
  ['#7a3b1f', 1],
  ['#a55a2c', 1],
  ['#d9c08a', 1],
]);
const HAIR_OLD = H(['#8e8b87', '#a9a6a1', '#c9c6c0', '#e4e1dc', '#66625e']);
// tops: ~55 % neutrals, ~30 % muted mid-tones, ~15 % accents
const TOPS = W([
  ['#1e1f22', 3],
  ['#2f3236', 2],
  ['#4a4e55', 2],
  ['#6f7378', 2],
  ['#a7a9aa', 2],
  ['#e9e7e2', 4],
  ['#253045', 3],
  ['#34466a', 2],
  ['#c7b89b', 2],
  ['#5d6045', 2],
  ['#4b6385', 2],
  ['#8b7b6b', 1],
  ['#d8cfbf', 2],
  ['#8c5a4a', 1],
  ['#7a8c7a', 1],
  ['#9e8466', 1],
  ['#6e5a7a', 1],
  ['#a8746a', 1],
  ['#5f7f8c', 1],
  ['#b49a6a', 1],
  ['#a37f86', 1],
  ['#5c7266', 1],
  ['#9aa7b5', 1],
  ['#c9a59a', 1],
  ['#7d4440', 1],
  ['#b8323c', 1],
  ['#d17a2c', 1],
  ['#2f7f8a', 1],
  ['#d4b13a', 1],
  ['#3d6fb3', 1],
  ['#2e8a5a', 1],
]);
const TOPS_MUTED = H(['#8a7f72', '#a39887', '#6b705c', '#7a6c5d', '#5c6b73', '#9a8c98', '#b7a99a', '#566573', '#8d775f', '#6d6875']);
// trousers: denim on ≥ 35 %
const BOTTOMS = W([
  ['#2f4566', 3],
  ['#3a5478', 3],
  ['#24334c', 2],
  ['#4b6487', 2],
  ['#1d1e20', 3],
  ['#2e3034', 2],
  ['#55585d', 1],
  ['#232c3d', 2],
  ['#9c8f72', 1],
  ['#c2b48f', 1],
  ['#4f3d2e', 1],
  ['#565a40', 1],
]);
const SHORTS = H(['#c8bc9e', '#9c8f72', '#33486a', '#4c6587', '#2e3034', '#e2ddd0', '#5d6045', '#253045', '#b9a07a']);
const SKIRTS = H(['#1f2024', '#2c2f3a', '#3b3f4a', '#4a3a3f', '#6a5a4f', '#253045', '#7a6a5a', '#8c3a3f', '#3d5a4a', '#c4b598', '#6b4f6b', '#a07a4a']);
const SHOES = W([
  ['#1c1c1d', 3],
  ['#3a2a20', 2],
  ['#5e3e28', 1],
  ['#e8e6e2', 2],
  ['#7a7f86', 1],
  ['#2a2d38', 1],
]);
const SUITS = H(['#262d38', '#33363b', '#1c1d20', '#454b55', '#2c3a4d', '#2d3032']);
const TIES = H(['#9c2f2f', '#2b6a9e', '#5e3a7a', '#b8902a', '#1f6656', '#7a2522', '#1b3f63']);
const BAGS = H(['#6b4a2e', '#3a2a20', '#1e1f22', '#253045', '#c2a77f', '#8c3a3f', '#5c6b73', '#a9895f', '#2f3236']);
const PAPER_BAGS = H(['#cfae7f', '#ede7da', '#b8323c', '#2f7f8a', '#d9c08a', '#c49a6c']);
const HATS = H(['#d8c49a', '#efe9da', '#3a3d42', '#c2b280', '#8a6a4a', '#5a6a7a', '#b8a27a', '#6b5a4a']);
const CAPS = H(['#b8323c', '#2f7f8a', '#253045', '#d4b13a', '#3b5579', '#efeee8', '#d17a2c', '#1e1f22']);
const HARDHATS = H(['#f2c400', '#f2f2ee', '#ec7a12', '#f2c400', '#3d7dd8']);
const VESTS = H(['#e9d000', '#f2861a', '#bfe01a']);
const SPORT = H(['#1f9bc4', '#d6336c', '#7fb032', '#e8b21f', '#e2622b', '#3f78d6', '#e04a64', '#22b38c', '#f2f2f0', '#2a2c30']);
const KIDS = H(['#e2513c', '#f0b52a', '#3f8fd6', '#55b04a', '#e65b8f', '#8a5bc4', '#29a6a6', '#f2f2ee', '#f08a2c', '#2f4a8a']);
const TOWELS = H(['#d9434e', '#2f8f86', '#e3c35a', '#4a78a6', '#e8955a', '#e0607a', '#3fb58f', '#8a6bb0', '#4a86e0', '#f0bf3a']);
const UMBRELLAS = H(['#b8323c', '#253045', '#2f7f8a', '#d4b13a', '#34466a', '#1e1f22', '#6e5a7a', '#d17a2c']);
const SWIM = H(['#c83a44', '#2f6fd0', '#d4336f', '#2a8f86', '#e3a920', '#1e1f22', '#6e4f9a', '#1fa37c']);
const OUTERS = W([
  ['#1e1f22', 2],
  ['#2f3236', 2],
  ['#253045', 2],
  ['#4a4e55', 1],
  ['#9e8466', 2],
  ['#5d6045', 2],
  ['#6b4a2e', 1],
  ['#7d4440', 1],
  ['#3a5478', 1],
  ['#8a8d90', 1],
  ['#c7b89b', 1],
]);
const FUR: [string, string][] = [
  ['#8a5a33', '#5a3b26'],
  ['#2a2522', '#151312'],
  ['#efe6d8', '#c9b8a0'],
  ['#d2a35c', '#a8783c'],
  ['#8d8a86', '#5e5b58'],
  ['#f2efe9', '#2a2522'],
  ['#b5703a', '#f2efe9'],
];
const COLLARS = H(['#c8323c', '#2f6fd0', '#e3a920', '#1fa37c', '#d4336f']);
const PRAMS = H(['#34466a', '#253045', '#6e5a7a', '#c7b89b', '#8a9aa8', '#2b2d42', '#8c5a5a', '#6a8a72']);

const MEN = [
  'Liam', 'Noah', 'Oliver', 'Elias', 'Theo', 'Hugo', 'Leo', 'Felix', 'Oscar', 'Arthur', 'Jonas', 'Mateo', 'Luca', 'Samuel',
  'Daniel', 'Tomás', 'Kenji', 'Ravi', 'Omar', 'Yusuf', 'Ivan', 'Pieter', 'Henrik', 'Marco', 'Diego', 'Kwame', 'Finn',
  'Jasper', 'Milo', 'Ezra', 'Arjun', 'Malik', 'Sven', 'Bruno', 'Albert', 'Walter', 'George', 'Frank', 'Harold', 'Edwin',
];
const WOMEN = [
  'Emma', 'Olivia', 'Mia', 'Sophie', 'Ava', 'Isla', 'Clara', 'Lena', 'Nora', 'Alice', 'Freya', 'Maya', 'Zoe', 'Hana',
  'Amira', 'Priya', 'Yuki', 'Lucia', 'Sara', 'Ingrid', 'Elena', 'Chloe', 'Ruby', 'Ada', 'Iris', 'Leila', 'Mei', 'Nina',
  'Rosa', 'Elsa', 'Fatima', 'Grace', 'Hazel', 'Ivy', 'Maud', 'Edith', 'Dorothy', 'Margaret', 'Agnes', 'Beatrice',
];
const KIDS_B = ['Max', 'Ben', 'Sam', 'Toby', 'Jamie', 'Kai', 'Otto', 'Remy', 'Nico', 'Alfie'];
const KIDS_G = ['Lily', 'Ella', 'Rosie', 'Poppy', 'Tilly', 'Luna', 'Daisy', 'Mila', 'Evie', 'Pia'];

export interface LookOptions {
  persona: Persona;
  kind?: BodyKind;
  /** 'adult' | 'elderly' | 'teen' | 'child' */
  age?: 'adult' | 'elderly' | 'teen' | 'child';
  warm: boolean;
  /** match an existing person's family (skin/hair) */
  family?: Look;
}

/** Wrap the main generator: identical draws, plus a running hash of them (seed for `style`). */
function recording(rng: Rng): { r: Rng; hash: () => number } {
  let h = 0x811c9dc5 >>> 0;
  const r = Object.create(rng) as Rng;
  r.next = () => {
    const v = rng.next();
    h = Math.imul(h ^ Math.floor(v * 4294967296), 16777619) >>> 0;
    return v;
  };
  return { r, hash: () => h };
}

export function makeLook(rng0: Rng, o: LookOptions): Look {
  const { r: rng, hash } = recording(rng0);
  const ageClass = o.age ?? (o.persona === 'elderly' ? 'elderly' : o.persona === 'student' ? 'teen' : 'adult');
  let kind: BodyKind = o.kind ?? (ageClass === 'child' ? (rng.chance(0.5) ? 'boy' : 'girl') : rng.chance(0.5) ? 'man' : 'woman');
  if (ageClass === 'child' && (kind === 'man' || kind === 'woman')) kind = kind === 'man' ? 'boy' : 'girl';
  const female = kind === 'woman' || kind === 'girl';
  const age =
    ageClass === 'child' ? rng.int(5, 11) : ageClass === 'teen' ? rng.int(13, 18) : ageClass === 'elderly' ? rng.int(66, 89) : o.persona === 'parent' || o.persona === 'family' ? rng.int(27, 45) : rng.int(19, 64);
  const name = ageClass === 'child' ? rng.pick(female ? KIDS_G : KIDS_B) : rng.pick(female ? WOMEN : MEN);
  const skin = o.family && rng.chance(0.85) ? o.family.skin : rng.pick(SKIN);
  let hair = ageClass === 'elderly' ? rng.pick(HAIR_OLD) : o.family && rng.chance(0.6) ? o.family.hair : rng.pick(HAIR_YOUNG);
  if (age > 50 && ageClass !== 'elderly' && rng.chance(0.4)) hair = rng.pick(HAIR_OLD);
  let flags = F.HAIR;
  // hair style
  if (female) {
    const r = rng.next();
    if (r < 0.5) flags |= F.LONGHAIR;
    else if (r < 0.72) flags |= F.BUN;
  } else {
    if (ageClass !== 'child' && rng.chance(age > 45 ? 0.22 : 0.06)) flags &= ~F.HAIR; // bald
    if (ageClass !== 'child' && ageClass !== 'teen' && rng.chance(0.18)) flags |= F.BEARD;
  }
  const scale =
    ageClass === 'child' ? rng.range(0.6, 0.74) : ageClass === 'teen' ? rng.range(0.88, 0.98) : female ? rng.range(0.92, 1.0) : rng.range(0.97, 1.07);
  // builds: a slim-to-solid spread plus a heavy tail (about one adult in six), so a crowd never reads as one body
  const girth = ageClass === 'child' ? rng.range(0.92, 1.02) : rng.range(0.93, 1.12) + (ageClass === 'elderly' ? 0.04 : 0) + (ageClass !== 'teen' && rng.chance(0.17) ? rng.range(0.07, 0.2) : 0);

  let top = rng.pick(TOPS);
  let bottom = rng.pick(BOTTOMS);
  let shoes = rng.pick(SHOES);
  let hat = rng.pick(HATS);
  let bag = rng.pick(BAGS);
  let accent = rng.pick(TIES);
  const warm = o.warm;

  // generic casual wardrobe
  const casual = () => {
    if (female && rng.chance(0.38)) {
      flags |= F.SKIRT;
      bottom = rng.chance(0.3) ? top : rng.pick(SKIRTS);
      if (!warm && rng.chance(0.5)) flags |= F.TIGHTS;
    } else if (warm && rng.chance(0.38)) {
      flags |= F.SHORTS;
      bottom = rng.pick(SHORTS);
    }
    if (warm && rng.chance(0.55)) flags |= F.SHORTSLEEVE;
    if (female && rng.chance(0.3)) flags |= F.HANDBAG;
    else if (rng.chance(0.12)) flags |= F.BACKPACK;
    if (rng.chance(0.08)) flags |= F.CAP, (hat = rng.pick(CAPS));
    else if (warm && rng.chance(0.06)) flags |= F.HAT;
  };

  switch (o.persona) {
    case 'commuter': {
      if (rng.chance(0.6)) {
        top = rng.pick(SUITS);
        bottom = rng.chance(0.85) ? top : rng.pick(BOTTOMS);
        shoes = rng.chance(0.6) ? hex('#1a1a1a') : hex('#4a2e1d');
        if (!female || rng.chance(0.4)) flags |= F.SUIT;
        else if (rng.chance(0.5)) flags |= F.SKIRT, (flags |= F.TIGHTS);
        if (rng.chance(0.35)) flags |= F.BRIEFCASE, (bag = rng.chance(0.5) ? hex('#3b2a20') : hex('#1f1f1f'));
        else if (female && rng.chance(0.5)) flags |= F.HANDBAG;
      } else {
        casual();
        if (rng.chance(0.3)) flags |= F.BACKPACK;
      }
      break;
    }
    case 'worker': {
      top = rng.pick(H(['#34466a', '#5c6b73', '#2b2d42', '#6f7378', '#7a4a32']));
      bottom = rng.pick(H(['#2b2d42', '#34466a', '#3f4248', '#4f4232']));
      shoes = hex('#3b2a20');
      accent = rng.pick(VESTS);
      flags |= F.VEST;
      if (rng.chance(0.7)) flags |= F.HARDHAT, (hat = rng.pick(HARDHATS));
      if (warm && rng.chance(0.4)) flags |= F.SHORTSLEEVE;
      break;
    }
    case 'jogger': {
      top = rng.pick(SPORT);
      bottom = rng.pick(H(['#1d1e20', '#2b2d42', '#34466a', '#3f4248']));
      shoes = rng.pick(H(['#efeeea', '#d6336c', '#1f9bc4', '#e8b21f']));
      flags |= F.SHORTS | F.SHORTSLEEVE;
      flags &= ~(F.LONGHAIR | F.SKIRT);
      if (female) flags |= F.BUN;
      if (rng.chance(0.2)) flags |= F.CAP, (hat = rng.pick(CAPS));
      break;
    }
    case 'beachgoer': {
      top = rng.pick(TOPS);
      bottom = rng.pick(SHORTS);
      flags |= F.SHORTSLEEVE;
      if (female && rng.chance(0.35)) flags |= F.SKIRT, (bottom = rng.pick(SKIRTS));
      else flags |= F.SHORTS;
      shoes = rng.pick(H(['#efeeea', '#d9c08a', '#b8323c', '#3d6fb3', '#8b5a2b']));
      if (rng.chance(0.4)) flags |= F.HAT, (hat = rng.pick(H(['#e3d3a6', '#efe9da', '#d9a066', '#d9c08a'])));
      else if (rng.chance(0.15)) flags |= F.CAP, (hat = rng.pick(CAPS));
      if (rng.chance(0.4)) flags |= F.HANDBAG, (bag = rng.pick(TOWELS));
      break;
    }
    case 'elderly': {
      top = rng.pick(TOPS_MUTED);
      bottom = rng.pick(H(['#5c6b73', '#6b4f3a', '#4a4e69', '#8b7d6b', '#3f4a5a', '#7d8491']));
      shoes = rng.pick(H(['#3b2a20', '#222222', '#5a4a3a']));
      if (female && rng.chance(0.5)) flags |= F.SKIRT, (bottom = rng.pick(H(['#6d597a', '#4a4e69', '#8b7d6b', '#5c6b73'])));
      if (rng.chance(0.4)) flags |= F.HAT, (hat = rng.pick(H(['#5a4a3a', '#3a3d42', '#c2b280', '#6d597a'])));
      if (rng.chance(0.28)) flags |= F.CANE;
      else if (female && rng.chance(0.5)) flags |= F.HANDBAG, (bag = rng.pick(H(['#3b2a20', '#6b4f3a', '#2b2d42'])));
      if (warm && rng.chance(0.3)) flags |= F.SHORTSLEEVE;
      break;
    }
    case 'student': {
      casual();
      flags |= F.BACKPACK;
      flags &= ~F.HANDBAG;
      bag = rng.pick(SPORT);
      break;
    }
    case 'shopper': {
      casual();
      if (rng.chance(0.55)) flags |= F.SHOPBAG, (bag = rng.pick(PAPER_BAGS));
      break;
    }
    case 'tourist': {
      casual();
      if (rng.chance(0.4)) flags |= F.BACKPACK;
      if (warm && rng.chance(0.25)) flags |= F.HAT;
      break;
    }
    case 'angler': {
      top = rng.pick(H(['#5c7266', '#5d6045', '#34466a', '#8c3a3f', '#b49a6a']));
      bottom = rng.pick(H(['#3f4a5a', '#5a4a3a', '#2b2d42']));
      flags |= F.ROD;
      if (rng.chance(0.6)) flags |= F.CAP, (hat = rng.pick(H(['#5c7266', '#2b2d42', '#b49a6a'])));
      break;
    }
    default:
      casual();
  }
  if (ageClass === 'child') {
    top = rng.pick(SPORT.concat(TOPS));
    flags &= ~(F.BEARD | F.HANDBAG | F.BRIEFCASE | F.SUIT | F.CANE | F.TIGHTS);
    if (warm && rng.chance(0.6)) flags |= F.SHORTS | F.SHORTSLEEVE;
    if (rng.chance(0.2)) flags |= F.CAP, (hat = rng.pick(CAPS));
  }
  if (flags & F.SKIRT) flags &= ~F.SHORTS;

  const umbrellaOwner = o.persona !== 'jogger' && o.persona !== 'beachgoer' && rng.chance(0.6);
  const swim = female ? rng.pick(SWIM) : rng.chance(0.6) ? 0 : rng.pick(SWIM);
  const look: Look = {
    kind,
    name,
    age,
    skin,
    top,
    bottom,
    shoes,
    hair,
    hat,
    bag,
    towel: rng.pick(TOWELS),
    umbrella: rng.pick(UMBRELLAS),
    accent,
    flags,
    scale,
    girth,
    umbrellaOwner,
    swim,
    dog: null,
    pram: null,
  };
  if (o.persona === 'dogwalker') {
    const [a, b] = rng.pick(FUR);
    look.dog = { fur: hex(a), fur2: hex(b), collar: rng.pick(COLLARS), size: rng.range(0.72, 1.28) };
  }
  if (o.persona === 'parent' && ageClass === 'adult') look.pram = { fabric: rng.pick(PRAMS) };
  // ── everything below uses a private generator (the main stream is untouched from here on)
  dressUp(look, new Rng(hash() ^ 0x5bd1e995), o.persona, ageClass, warm);
  // per-person shade of every palette colour (dye lots, fading, wear): two people who drew the same
  // swatch never wear the identical colour; a suit's jacket and trousers keep matching
  const jr = new Rng(hash() ^ 0x2545f491);
  const suitMatch = look.bottom === look.top;
  look.top = shade(look.top, jr, 0.13, 0.05);
  look.bottom = suitMatch ? look.top : shade(look.bottom, jr, 0.13, 0.05);
  look.shoes = shade(look.shoes, jr, 0.1, 0.03);
  look.hair = shade(look.hair, jr, 0.1, 0.03);
  look.skin = shade(look.skin, jr, 0.05, 0.015);
  return look;
}

/** a colour scaled in value by ±v and tinted per channel by ±t (deterministic per generator) */
function shade(c: number, r: Rng, v: number, t: number): number {
  const k = 1 + (r.next() * 2 - 1) * v;
  let out = 0;
  for (let i = 16; i >= 0; i -= 8) {
    const ch = (c >> i) & 255;
    out = (out << 8) | Math.max(0, Math.min(255, Math.round(ch * (k + (r.next() * 2 - 1) * t))));
  }
  return out;
}

export function describeAge(l: Look): string {
  return `${l.name}, ${l.age}`;
}

// ──────────────────────────────────────────────────────────── wardrobe ──

const lum = (c: number) => {
  const r = ((c >> 16) & 255) / 255,
    g = ((c >> 8) & 255) / 255,
    b = (c & 255) / 255;
  return 0.2126 * r * r + 0.7152 * g * g + 0.0722 * b * b;
};
const valueOf = (c: number) => Math.sqrt(lum(c));

/** Hats: style codes (shader.ts HAT_STYLES). */
const HAT = { NONE: 0, CAP: 1, FLATCAP: 2, SUNHAT: 3, FEDORA: 4, HARDHAT: 5, BEANIE: 6, BUCKET: 7 };

function baseStyle(): Style {
  return {
    hair: 'crop',
    hairLen: 0,
    hairVol: 0,
    fringe: false,
    beard: 0,
    hat: 0,
    sleeve: 0.02,
    topHem: 0.24,
    trouserEnd: 0.06,
    legwear: 0,
    trouserFit: 0.75,
    jacketHem: -1,
    outer: 0x2f3236,
    collar: 0,
    tie: false,
    lapels: false,
    hood: false,
    tail: 0,
    tailHem: 0.5,
    tailFlare: 0.035,
    sole: 0,
    bootTop: 0,
    neckTop: 0.95,
    vest: false,
  };
}

/** Garments, hair and hats from the base look; persona wardrobes; outfit value contrast. */
function dressUp(L: Look, r: Rng, persona: Persona, ageClass: string, warm: boolean): void {
  const s = baseStyle();
  const fl = L.flags;
  const female = L.kind === 'woman' || L.kind === 'girl';
  const child = ageClass === 'child';
  const old = ageClass === 'elderly' || L.age >= 66;
  // ── hair
  if (!(fl & F.HAIR)) s.hair = 'bald';
  else if (female) {
    if (fl & F.LONGHAIR) {
      const k = r.next();
      s.hair = k < 0.42 ? 'long' : k < 0.72 ? 'ponytail' : 'bob';
      s.hairLen = s.hair === 'long' ? r.range(0.14, child ? 0.26 : 0.4) : s.hair === 'bob' ? r.range(0.04, 0.08) : 0.02;
    } else if (fl & F.BUN) s.hair = 'bun';
    else {
      s.hair = r.chance(0.5) ? 'pixie' : 'bob';
      s.hairLen = s.hair === 'bob' ? r.range(0.03, 0.07) : 0;
    }
    s.fringe = r.chance(child ? 0.45 : 0.28);
  } else {
    const k = r.next();
    s.hair = k < 0.6 ? 'crop' : k < 0.82 ? 'side' : k < 0.93 ? 'curly' : ageClass === 'adult' && k < 0.97 ? 'manbun' : 'crop';
    if (child) s.fringe = r.chance(0.35);
    if (ageClass !== 'elderly' && !child && r.chance(0.04)) {
      s.hair = 'long';
      s.hairLen = r.range(0.06, 0.16);
    }
  }
  if (fl & F.BEARD) s.beard = r.chance(0.62) ? 1 : 2;
  s.hairVol = s.hair === 'curly' ? r.range(0.6, 1) : s.hair === 'bald' ? 0 : r.chance(0.12) ? r.range(0.5, 0.9) : r.range(0, 0.25);
  // ── hats
  if (fl & F.HARDHAT) s.hat = HAT.HARDHAT;
  else if (fl & F.CAP) s.hat = old && !female && r.chance(0.6) ? HAT.FLATCAP : HAT.CAP;
  else if (fl & F.HAT) {
    if (old && !female) s.hat = r.chance(0.7) ? HAT.FEDORA : HAT.FLATCAP;
    else if (!warm) s.hat = HAT.BEANIE;
    else s.hat = r.chance(0.7) ? HAT.SUNHAT : HAT.BUCKET;
  } else if (!warm && !child && r.chance(0.06)) s.hat = HAT.BEANIE;
  // ── upper body
  s.sleeve = fl & F.SHORTSLEEVE ? (female && r.chance(0.25) ? 1.08 : r.range(0.74, 0.84)) : r.chance(0.18) ? r.range(0.18, 0.3) : 0.02;
  s.topHem = r.chance(0.35) ? 0.31 : r.range(0.16, 0.24);
  if (fl & F.SUIT) {
    // suit jacket over a shirt, collar and tie
    s.outer = L.top;
    L.top = r.pick([0xe9e7e2, 0xe9e7e2, 0xdfe6ee, 0xcdd8e6, 0xf1ece0]);
    s.jacketHem = 0.1;
    s.collar = 1;
    s.tie = r.chance(0.8);
    s.lapels = true;
    s.topHem = 0.3;
    s.sleeve = 0.02;
  } else if (fl & F.VEST) {
    s.vest = true;
    s.topHem = 0.18;
    s.bootTop = 0.12;
  } else if (persona === 'commuter' && L.top !== L.bottom && valueOf(L.top) < 0.3 && r.chance(0.5)) {
    // dark casual commuter: blazer
    s.outer = L.top;
    L.top = r.pick([0xe9e7e2, 0xa7a9aa, 0x253045, 0xd8cfbf]);
    s.jacketHem = 0.12;
    s.lapels = true;
    s.collar = r.chance(0.5) ? 1 : 0;
    s.sleeve = 0.02;
  } else if (!child && persona !== 'jogger' && persona !== 'beachgoer') {
    const k = r.next();
    if (!warm && k < 0.38) {
      // coat (knee length) or short jacket
      s.outer = r.pick(OUTERS_LIST);
      s.sleeve = 0.02;
      if (r.chance(0.55)) {
        s.tail = 3;
        s.jacketHem = 0.0;
        s.tailHem = r.range(0.48, 0.6);
        s.tailFlare = r.range(0.015, 0.04);
        s.collar = 2;
      } else {
        s.jacketHem = r.range(0.12, 0.2);
        s.hood = r.chance(0.3);
      }
    } else if (k < (warm ? 0.12 : 0.55)) {
      // zip jacket / cardigan / hoodie
      s.outer = old ? r.pick(TOPS_MUTED) : r.pick(OUTERS_LIST);
      s.jacketHem = r.range(0.14, 0.22);
      s.sleeve = warm ? r.range(0.2, 0.3) : 0.02;
      s.hood = !old && r.chance(0.4);
      if (s.hood) s.outer = r.pick(TOPS);
    } else if (!warm && k < 0.68) s.neckTop = 1.18; // turtleneck / high collar
    else if (r.chance(0.25) && !female) s.collar = 2; // polo / shirt collar
  }
  // ── lower body
  if (fl & F.SKIRT) {
    const dress = !(fl & F.SUIT) && L.top !== L.bottom && r.chance(child ? 0.5 : 0.35);
    s.tail = dress ? 2 : 1;
    if (dress) L.bottom = L.top;
    s.tailHem = old ? r.range(0.25, 0.38) : r.chance(0.2) ? r.range(0.18, 0.3) : r.range(0.42, 0.62);
    s.tailFlare = r.range(0.015, 0.06);
    s.trouserEnd = 1.2;
    s.legwear = fl & F.TIGHTS ? (r.chance(0.7) ? 1 : 2) : 0;
    if (!warm && !old && r.chance(0.3)) s.bootTop = r.range(0.3, 0.42);
  } else if (fl & F.SHORTS) {
    s.trouserEnd = child ? r.range(0.5, 0.62) : r.range(0.52, 0.72);
    if (persona === 'jogger' && female && r.chance(0.5)) s.trouserEnd = r.chance(0.5) ? 0.06 : 0.3; // leggings / capri
  } else if (female && !old && r.chance(0.12)) s.trouserEnd = r.range(0.24, 0.34); // capri
  // ── shoes
  const casualShoe = persona === 'jogger' || persona === 'student' || persona === 'beachgoer' || child || (!(fl & F.SUIT) && r.chance(0.45));
  s.sole = casualShoe ? (r.chance(0.75) ? 1 : 2) : 0;
  if (persona === 'jogger') s.sole = 1;
  if (s.sole === 1 && valueOf(L.shoes) < 0.15 && r.chance(0.5)) L.shoes = r.pick([0xe8e6e2, 0x7a7f86, 0x2a2d38]);
  // ── outfit value contrast: legs must read against the top
  const upper = s.jacketHem >= 0 && s.tail !== 3 ? s.outer : L.top;
  if (s.tail === 0 && Math.abs(valueOf(upper) - valueOf(L.bottom)) < 0.14 && !(fl & F.SUIT) && !s.vest) {
    L.bottom = valueOf(upper) > 0.45 ? r.pick([0x2f4566, 0x1d1e20, 0x24334c, 0x2e3034, 0x3a5478, 0x4a4e55]) : r.pick([0x6f86a8, 0x7d8a99, 0x8a8d90, 0x9c8f72, 0x5f7896, 0xa7a9aa, 0xb5ab95, 0x6b7f5a]);
  }
  // ── trouser cut (no RNG draw: the outfits drawn above stay as they were)
  s.trouserFit = trouserFitOf(L, s, persona, child, old);
  L.style = s;
}

const OUTERS_LIST = OUTERS;

/** trouser cut from the outfit: blue (denim) slim, suits / chinos / workwear loose, leggings tight */
function trouserFitOf(L: Look, s: Style, persona: Persona, child: boolean, old: boolean): number {
  if (s.tail > 0 || s.trouserEnd > 1) return 0;
  if (persona === 'jogger') return s.trouserEnd < 0.4 ? (L.kind === 'woman' || L.kind === 'girl' ? 0 : 0.55) : 0.9; // leggings / track pants, loose shorts
  if (s.trouserEnd > 0.45) return 0.95; // shorts
  const c = L.bottom;
  const r = ((c >> 16) & 255) / 255,
    g = ((c >> 8) & 255) / 255,
    b = (c & 255) / 255;
  const denim = b > r * 1.22 && b >= g;
  let fit = L.flags & F.SUIT ? 0.85 : denim ? 0.6 : persona === 'worker' ? 1 : 0.8;
  if (old) fit = Math.min(1, fit + 0.15);
  if (child) fit = Math.min(fit, 0.6);
  if (s.trouserEnd > 0.2) fit *= 0.7; // capri
  return fit;
}

/** Style for looks built without one (hand-made looks in tools): derived from the flags only. */
export function styleFromFlags(L: Look): Style {
  if (L.style) return L.style;
  const s = baseStyle();
  const fl = L.flags;
  const female = L.kind === 'woman' || L.kind === 'girl';
  if (!(fl & F.HAIR)) s.hair = 'bald';
  else if (fl & F.LONGHAIR) {
    s.hair = 'long';
    s.hairLen = 0.22;
  } else if (fl & F.BUN) s.hair = 'bun';
  else s.hair = female ? 'bob' : 'crop';
  if (fl & F.BEARD) s.beard = 1;
  s.hat = fl & F.HARDHAT ? HAT.HARDHAT : fl & F.CAP ? HAT.CAP : fl & F.HAT ? (L.age >= 66 && !female ? HAT.FEDORA : HAT.SUNHAT) : 0;
  s.sleeve = fl & F.SHORTSLEEVE ? 0.78 : 0.02;
  if (fl & F.SUIT) {
    s.outer = L.top;
    s.jacketHem = 0.1;
    s.collar = 1;
    s.tie = true;
    s.lapels = true;
  }
  if (fl & F.VEST) s.vest = true;
  if (fl & F.SKIRT) {
    s.tail = 1;
    s.trouserEnd = 1.2;
    s.tailHem = 0.5;
    s.legwear = fl & F.TIGHTS ? 1 : 0;
  } else if (fl & F.SHORTS) s.trouserEnd = 0.6;
  s.trouserFit = s.tail > 0 ? 0 : fl & F.SUIT ? 0.85 : fl & F.SHORTS ? 0.95 : 0.6;
  return s;
}
