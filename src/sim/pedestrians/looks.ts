// Appearance of the little people: clothing, skin, hair, accessories, names and ages.
// Colours are packed sRGB 0xRRGGBB integers (unpacked in the vertex shader).

import type { Rng } from '../../core/rng';
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
}

const hex = (s: string) => parseInt(s.slice(1), 16);
const H = (list: string[]) => list.map(hex);

const SKIN = H(['#f7dcc8', '#f1cfb5', '#eac0a0', '#dfab86', '#cf9670', '#b97c56', '#9c6443', '#7d4c33', '#5f3825', '#f3d2bb']);
const HAIR_YOUNG = H(['#1d1a19', '#2b211c', '#3d2a1f', '#5a3b26', '#6e4527', '#8a5a33', '#b8894f', '#d2ad6b', '#a4542b', '#efe0b0']);
const HAIR_OLD = H(['#9c9893', '#b7b3ad', '#d9d6d0', '#eeebe6', '#6e6a66']);
const TOPS = H([
  '#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#f1faee', '#264653', '#8d6cab', '#d98c6a', '#a8c8d8', '#c9d9a8',
  '#ffffff', '#3d5a80', '#ee6c4d', '#98c1d9', '#6d597a', '#b56576', '#ffb4a2', '#81b29a', '#f2cc8f', '#e07a5f', '#5b8e7d',
  '#f6bd60', '#84a59d', '#f28482', '#4a4e69', '#c44536', '#ffd166', '#06d6a0', '#118ab2',
]);
const TOPS_MUTED = H(['#8a7f72', '#a39887', '#6b705c', '#7a6c5d', '#5c6b73', '#9a8c98', '#b7a99a', '#566573', '#8d775f', '#6d6875']);
const BOTTOMS = H(['#3d5a80', '#2b2d42', '#4a4e69', '#c2b280', '#7d8491', '#232323', '#6b4f3a', '#5a6f8f', '#3f4a5a', '#8b7d6b', '#506680', '#2f3e46']);
const SHORTS = H(['#e8e4da', '#c2b280', '#3d5a80', '#2b2d42', '#8fb3c4', '#e9c46a', '#5b8e7d', '#f1faee', '#c44536']);
const SKIRTS = H(['#2b2d42', '#6d597a', '#b56576', '#3d5a80', '#e9c46a', '#264653', '#c44536', '#8d6cab', '#f4a261', '#4a4e69']);
const SHOES = H(['#222222', '#3b2a20', '#f0f0f0', '#7a5230', '#2b2d42', '#c0392b', '#5a5a5a']);
const SUITS = H(['#2c3e50', '#3a3d42', '#1f2124', '#4b5563', '#34495e', '#2d3436']);
const TIES = H(['#c0392b', '#2e86c1', '#7d3c98', '#d4ac0d', '#117a65', '#922b21', '#1b4f72']);
const BAGS = H(['#7a5230', '#3b2a20', '#c0392b', '#2b2d42', '#e9c46a', '#8d6cab', '#a8c8d8', '#f1faee', '#264653']);
const PAPER_BAGS = H(['#d8b98a', '#f1faee', '#e63946', '#2a9d8f', '#e9c46a', '#c9a27a']);
const HATS = H(['#d8c49a', '#f1faee', '#3a3d42', '#c2b280', '#e63946', '#457b9d', '#2a9d8f', '#8d6cab']);
const CAPS = H(['#e63946', '#2a9d8f', '#264653', '#e9c46a', '#3d5a80', '#ffffff', '#f4a261', '#222222']);
const HARDHATS = H(['#ffd400', '#ffffff', '#ff7b00', '#ffd400', '#3d7dd8']);
const VESTS = H(['#f5d000', '#ff8a00', '#c6e600']);
const SPORT = H(['#00b4d8', '#ff006e', '#8ac926', '#ffbe0b', '#fb5607', '#3a86ff', '#ff4d6d', '#06d6a0', '#ffffff']);
const TOWELS = H(['#e63946', '#2a9d8f', '#e9c46a', '#457b9d', '#f4a261', '#ff4d6d', '#06d6a0', '#8d6cab', '#3a86ff', '#ffbe0b']);
const UMBRELLAS = H(['#e63946', '#264653', '#2a9d8f', '#e9c46a', '#3d5a80', '#222222', '#8d6cab', '#f4a261']);
const SWIM = H(['#e63946', '#3a86ff', '#ff006e', '#2a9d8f', '#ffbe0b', '#222222', '#8d6cab', '#06d6a0']);
const FUR: [string, string][] = [
  ['#8a5a33', '#5a3b26'],
  ['#2a2522', '#151312'],
  ['#efe6d8', '#c9b8a0'],
  ['#d2a35c', '#a8783c'],
  ['#8d8a86', '#5e5b58'],
  ['#f2efe9', '#2a2522'],
  ['#b5703a', '#f2efe9'],
];
const COLLARS = H(['#e63946', '#3a86ff', '#ffbe0b', '#06d6a0', '#ff006e']);
const PRAMS = H(['#3d5a80', '#264653', '#8d6cab', '#e9c46a', '#a8c8d8', '#2b2d42', '#b56576', '#81b29a']);

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

export function makeLook(rng: Rng, o: LookOptions): Look {
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
  const girth = ageClass === 'child' ? rng.range(0.92, 1.02) : rng.range(0.94, 1.14) + (ageClass === 'elderly' ? 0.04 : 0);

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
      top = rng.pick(H(['#3d5a80', '#5c6b73', '#2b2d42', '#7d8491', '#a0522d']));
      bottom = rng.pick(H(['#2b2d42', '#3d5a80', '#4a4e69', '#5a4a3a']));
      shoes = hex('#3b2a20');
      accent = rng.pick(VESTS);
      flags |= F.VEST;
      if (rng.chance(0.7)) flags |= F.HARDHAT, (hat = rng.pick(HARDHATS));
      if (warm && rng.chance(0.4)) flags |= F.SHORTSLEEVE;
      break;
    }
    case 'jogger': {
      top = rng.pick(SPORT);
      bottom = rng.pick(H(['#222222', '#2b2d42', '#3d5a80', '#4a4e69']));
      shoes = rng.pick(H(['#f0f0f0', '#ff006e', '#00b4d8', '#ffbe0b']));
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
      shoes = rng.pick(H(['#f0f0f0', '#e9c46a', '#c0392b', '#3a86ff', '#8b5a2b']));
      if (rng.chance(0.4)) flags |= F.HAT, (hat = rng.pick(H(['#e8d8a8', '#f1faee', '#f4a261', '#e9c46a'])));
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
      top = rng.pick(H(['#5b8e7d', '#6b705c', '#3d5a80', '#c44536', '#e9c46a']));
      bottom = rng.pick(H(['#3f4a5a', '#5a4a3a', '#2b2d42']));
      flags |= F.ROD;
      if (rng.chance(0.6)) flags |= F.CAP, (hat = rng.pick(H(['#5b8e7d', '#2b2d42', '#e9c46a'])));
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
  return look;
}

export function describeAge(l: Look): string {
  return `${l.name}, ${l.age}`;
}
