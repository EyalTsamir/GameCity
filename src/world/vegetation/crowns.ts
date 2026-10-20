// Leaf-card plant generators: every tree / palm / bush is described once by a deterministic STRUCTURE
// (crown envelope as lobes = leaf masses, trunk, limbs toward the lobes, branches inside them, branch tips
// where leaf clusters hang), then emitted twice:
//   far  — trunk + main limbs (static wood) and a few big dense cards per leaf mass (static cards);
//   near — branches/twigs (dynamic wood) and fine leaf-cluster cards on every tip + dense inner cards.
// Both come from the same lobes, so the LOD cross-fade keeps the silhouette. Near detail is generated lazily
// (first time a plant comes close) from the same seed.

import * as THREE from 'three';
import { Rng, hash01 } from '../../core/rng';
import { InstBuf, pushCard, pushWood, CARD_SPECS, WOOD_SPECS, STILL, type PlantRef, type Sway, type CardIn } from './foliage';
import { getLeafAtlas, type LeafTile, type UvRect } from './atlas';

export type Form = 'dome' | 'oval' | 'spread' | 'irregular' | 'umbrella' | 'vase' | 'column' | 'weep' | 'cone' | 'palm' | 'fan' | 'bush' | 'hedge';

/** species definition (art parameters) */
export interface Kind {
  form: Form | Form[];
  /** near cluster tile, dense tile (inner + far cards) */
  tile: LeafTile;
  dense: LeafTile;
  leaf: string[];
  bark: string[];
  /** bark pattern code (foliage.ts WOOD shader) */
  pattern: number;
  /** clear trunk as a fraction of the height */
  clear: [number, number];
  /** trunk girth multiplier */
  girth: number;
  /** cluster card half-size (m) for a crown of radius 2.5 */
  card: number;
  /** cards per branch tip */
  density: number;
  gloss: number;
  trans: number;
  flutter: number;
  flowers?: string[];
  /** fraction of cluster cards drawn with the flower colour (flower tiles carry the mask) */
  bloom?: number;
  /** stems from the ground (olive) */
  stems?: [number, number];
  moss?: number;
}

const KIND_TABLE = {
  // broadleaf city / park trees
  linden: { form: ['dome', 'oval', 'dome', 'irregular'], tile: 'broad', dense: 'broadDense', leaf: ['#4f8a33', '#55913a', '#5a9636', '#4c8538', '#5f9a3a'], bark: ['#5a4a3c', '#625040', '#55463a'], pattern: 0.1, clear: [0.26, 0.34], girth: 1, card: 0.46, density: 1.5, gloss: 0.25, trans: 0.9, flutter: 1, moss: 0.25 },
  maple: { form: ['dome', 'spread', 'irregular'], tile: 'plane', dense: 'broadDense', leaf: ['#5a9238', '#62983b', '#4f8a36'], bark: ['#5e5048', '#6a5a4c'], pattern: 0.3, clear: [0.24, 0.32], girth: 0.95, card: 0.48, density: 1.2, gloss: 0.2, trans: 1, flutter: 1.1, moss: 0.2 },
  oak: { form: ['spread', 'irregular', 'dome'], tile: 'oak', dense: 'broadDense', leaf: ['#4a7a30', '#52823a', '#466f2e'], bark: ['#4e4238', '#57493c'], pattern: 0.1, clear: [0.2, 0.28], girth: 1.25, card: 0.46, density: 1.25, gloss: 0.15, trans: 0.75, flutter: 0.8, moss: 0.45 },
  plane: { form: ['vase', 'spread', 'irregular'], tile: 'plane', dense: 'broadDense', leaf: ['#5b8f35', '#64963a', '#55892f'], bark: ['#8a8470', '#958c74'], pattern: 0.5, clear: [0.3, 0.38], girth: 1.1, card: 0.55, density: 1.1, gloss: 0.2, trans: 1, flutter: 1, moss: 0 },
  ficus: { form: ['dome', 'spread', 'dome'], tile: 'small', dense: 'smallDense', leaf: ['#2f5e2a', '#356630', '#2c5a2e', '#3a6a2c'], bark: ['#8b877c', '#7d786e'], pattern: 0.3, clear: [0.22, 0.3], girth: 1.35, card: 0.4, density: 1.45, gloss: 0.75, trans: 0.55, flutter: 0.7, moss: 0 },
  olive: { form: ['irregular', 'dome'], tile: 'olive', dense: 'smallDense', leaf: ['#6f8250', '#76885a', '#68794c'], bark: ['#77736a', '#6b665c'], pattern: 0.3, clear: [0.3, 0.4], girth: 1.4, card: 0.42, density: 1.0, gloss: 0.35, trans: 0.45, flutter: 1.1, stems: [0.45, 3], moss: 0.15 },
  jacaranda: { form: ['umbrella', 'spread'], tile: 'jacaranda', dense: 'broadDense', leaf: ['#5f9140', '#679a44'], bark: ['#6a6058', '#625a52'], pattern: 0.3, clear: [0.36, 0.44], girth: 0.95, card: 0.5, density: 1.15, gloss: 0.2, trans: 1, flutter: 1.2, flowers: ['#8a78d8', '#9686e0', '#7f6cd0'], bloom: 1, moss: 0 },
  blossom: { form: ['spread', 'umbrella'], tile: 'blossom', dense: 'broadDense', leaf: ['#6f9a48', '#77a04f'], bark: ['#4a3a32', '#52413a'], pattern: 0.3, clear: [0.3, 0.36], girth: 0.9, card: 0.46, density: 1.25, gloss: 0.2, trans: 0.9, flutter: 1, flowers: ['#f2a9c4', '#f5bccf', '#eda0bd', '#f4e6ea'], bloom: 1, moss: 0.1 },
  autumn: { form: ['dome', 'irregular', 'spread'], tile: 'plane', dense: 'broadDense', leaf: ['#d08a34', '#c9652f', '#c4552e', '#d3a23f', '#bf7a2a'], bark: ['#5a4a3c'], pattern: 0.1, clear: [0.26, 0.32], girth: 1, card: 0.47, density: 1.2, gloss: 0.15, trans: 1.2, flutter: 1.1, moss: 0.2 },
  fruit: { form: ['dome'], tile: 'citrus', dense: 'smallDense', leaf: ['#3c6e30', '#43763a'], bark: ['#5e4c3e'], pattern: 0.1, clear: [0.24, 0.3], girth: 0.9, card: 0.36, density: 1.35, gloss: 0.65, trans: 0.6, flutter: 0.8, flowers: ['#f08a1e', '#f3a426', '#ecc43a'], bloom: 1, moss: 0.1 },
  birch: { form: ['oval', 'irregular'], tile: 'birch', dense: 'broadDense', leaf: ['#8fbb52', '#97c25a', '#86b24e'], bark: ['#e6e1d6'], pattern: 0.9, clear: [0.32, 0.4], girth: 0.7, card: 0.42, density: 1.1, gloss: 0.3, trans: 1.2, flutter: 1.5, moss: 0 },
  poplar: { form: ['column'], tile: 'broad', dense: 'broadDense', leaf: ['#4a8238', '#52893c', '#447a36'], bark: ['#6a604f'], pattern: 0.1, clear: [0.08, 0.14], girth: 0.85, card: 0.4, density: 1.2, gloss: 0.35, trans: 0.9, flutter: 1.6, moss: 0.2 },
  cypress: { form: ['column'], tile: 'cypress', dense: 'needleDense', leaf: ['#3b6136', '#3f6739', '#375c34'], bark: ['#5a4a3e'], pattern: 0.1, clear: [0.02, 0.05], girth: 0.8, card: 0.36, density: 1.6, gloss: 0.15, trans: 0.3, flutter: 0.4, moss: 0 },
  willow: { form: ['weep'], tile: 'willow', dense: 'broadDense', leaf: ['#86ad48', '#8fb550', '#7da244'], bark: ['#4f4438'], pattern: 0.1, clear: [0.42, 0.5], girth: 1.2, card: 0.5, density: 1.1, gloss: 0.3, trans: 1.1, flutter: 1.6, moss: 0.3 },
  spruce: { form: ['cone'], tile: 'needle', dense: 'needleDense', leaf: ['#33683f', '#376d44', '#30623f', '#346648'], bark: ['#4e3a2d', '#5a4232'], pattern: 0.1, clear: [0.04, 0.1], girth: 1, card: 0.5, density: 2, gloss: 0.25, trans: 0.35, flutter: 0.45, moss: 0.3 },
  fir: { form: ['cone'], tile: 'needle', dense: 'needleDense', leaf: ['#3a7546', '#3f7c4a', '#376e42'], bark: ['#5a4a3e'], pattern: 0.3, clear: [0.04, 0.1], girth: 0.95, card: 0.5, density: 2, gloss: 0.25, trans: 0.35, flutter: 0.45, moss: 0.25 },
  pine: { form: ['umbrella', 'irregular'], tile: 'pine', dense: 'needleDense', leaf: ['#3d6a36', '#44723b', '#39653a'], bark: ['#7a4f34', '#835639'], pattern: 0.1, clear: [0.55, 0.65], girth: 0.9, card: 0.5, density: 1.1, gloss: 0.3, trans: 0.5, flutter: 0.7, moss: 0.1 },
  stonepine: { form: ['umbrella'], tile: 'pine', dense: 'needleDense', leaf: ['#3c6634', '#426d38'], bark: ['#7a5a42', '#866248'], pattern: 0.5, clear: [0.55, 0.66], girth: 1.1, card: 0.55, density: 1.15, gloss: 0.3, trans: 0.5, flutter: 0.7, moss: 0 },
  datepalm: { form: ['palm'], tile: 'frond', dense: 'frond', leaf: ['#5c8a4a', '#64904e', '#577f48', '#6e9452'], bark: ['#8a7356', '#7f6a50'], pattern: 0.7, clear: [1, 1], girth: 1, card: 1, density: 1, gloss: 0.45, trans: 0.8, flutter: 1.2, moss: 0 },
  canarypalm: { form: ['palm'], tile: 'frond', dense: 'frond', leaf: ['#4e8a3e', '#579444', '#4a8238'], bark: ['#7d6a52', '#86735a'], pattern: 0.7, clear: [1, 1], girth: 1.8, card: 1, density: 1.6, gloss: 0.45, trans: 0.8, flutter: 1.1, moss: 0 },
  fanpalm: { form: ['fan'], tile: 'fan', dense: 'fan', leaf: ['#5f8f45', '#67974a', '#5a8a42'], bark: ['#8a7d6c', '#948674'], pattern: 0.63, clear: [1, 1], girth: 0.75, card: 1, density: 1, gloss: 0.5, trans: 0.8, flutter: 1, moss: 0 },
  shrub: { form: ['bush'], tile: 'shrub', dense: 'shrub', leaf: ['#4a8a3b', '#53913d', '#447f37', '#5b9843', '#3e7836', '#5e8f36'], bark: ['#4a3e34'], pattern: 0.1, clear: [0, 0], girth: 1, card: 0.3, density: 1, gloss: 0.4, trans: 0.7, flutter: 0.8, moss: 0 },
  oleander: { form: ['bush'], tile: 'oleander', dense: 'shrub', leaf: ['#3f6e36', '#46763a'], bark: ['#4a3e34'], pattern: 0.1, clear: [0, 0], girth: 1, card: 0.36, density: 1, gloss: 0.5, trans: 0.6, flutter: 0.9, flowers: ['#f08fb3', '#f7c6d6', '#e8628f', '#f6f0ea'], bloom: 1, moss: 0 },
  hedge: { form: ['hedge'], tile: 'shrub', dense: 'shrub', leaf: ['#3f7a35'], bark: ['#4a3e34'], pattern: 0.1, clear: [0, 0], girth: 1, card: 0.26, density: 1, gloss: 0.4, trans: 0.6, flutter: 0.5, moss: 0 },
  bougain: { form: ['bush'], tile: 'bougain', dense: 'shrub', leaf: ['#3f7a35', '#468039'], bark: ['#4a3e34'], pattern: 0.1, clear: [0, 0], girth: 1, card: 0.34, density: 1, gloss: 0.4, trans: 0.8, flutter: 0.9, flowers: ['#d4237a', '#c21e6a', '#e0408e', '#b5229a'], bloom: 1, moss: 0 },
} satisfies Record<string, Kind>;

export type KindName = keyof typeof KIND_TABLE;
export const KINDS: Record<KindName, Kind> = KIND_TABLE as Record<KindName, Kind>;

export interface PlantDef {
  kind: KindName;
  x: number;
  y: number;
  z: number;
  h: number;
  r: number;
  seed: number;
  /** clear trunk height (street trees keep ≥ 3.4 m for buses) */
  clear?: number;
  /** 0..1 tone (darker/bluer ↔ lighter/yellower) */
  tone?: number;
  /** crown growth bias (toward light / the street), length 0..1 */
  bx?: number;
  bz?: number;
  /** forest: lighter far LOD */
  forest?: boolean;
  /** 0 young .. 1 old */
  age?: number;
  /** explicit leaf colour (hedges match their clipped core) */
  color?: string;
  /** hedge segment: ax, az, bx, bz, width */
  seg?: [number, number, number, number, number];
  /** crown stretched along a horizontal axis (street trees grow along the street gap): ax, az, factor */
  stretch?: [number, number, number];
  /** raised planter at the foot (y = its soil): trailing ivy over the rim + groundcover (near LOD) */
  planter?: { round: boolean; yaw: number };
}

type V3 = [number, number, number];

interface Lobe3 {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  tint: number;
  /** limb phase (wind) */
  ph: number;
  /** limb weight at the lobe (wind) */
  w: number;
}

interface Seg {
  a: V3;
  b: V3;
  ra: number;
  rb: number;
  sa: Sway;
  sb: Sway;
  /** 0 trunk/limb (static, far too) · 1 branch (near) */
  near: boolean;
  aoA: number;
  aoB: number;
}

interface Tip {
  p: V3;
  d: V3;
  sway: Sway;
  lobe: number;
  /** card size multiplier */
  s: number;
  /** hanging curtain (willow) / special orientation code */
  hang?: boolean;
}

/** frond / leaf strips (palms) */
interface Frond {
  pts: V3[];
  width: number;
  sway: Sway;
  dry: boolean;
  fan: boolean;
}

export interface Struct {
  def: PlantDef;
  kind: Kind;
  form: Form;
  c: V3;
  /** crown radii (horizontal, vertical) */
  cr: number;
  cry: number;
  lobes: Lobe3[];
  segs: Seg[];
  tips: Tip[];
  fronds: Frond[];
  leaf: THREE.Color;
  bark: THREE.Color;
  flower: THREE.Color | null;
  cardHalf: number;
}

// ───────────────────────────────────────────────────────────── helpers ──

const smooth01 = (x: number): number => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};
const sstep = (a: number, b: number, x: number): number => smooth01((x - a) / (b - a));
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const randDir = (rng: Rng): V3 => {
  const u = rng.range(-1, 1),
    a = rng.range(0, Math.PI * 2);
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(a), u, s * Math.sin(a)];
};

const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };
function pickColor(rng: Rng, list: string[], tone: number, jitter = 0.05): THREE.Color {
  _c.set(rng.pick(list));
  _c.getHSL(_hsl);
  const tt = tone - 0.5;
  return new THREE.Color().setHSL(
    _hsl.h + (rng.next() - 0.5) * jitter * 0.5 - tt * 0.03,
    Math.min(1, Math.max(0, _hsl.s + (rng.next() - 0.5) * jitter + tt * 0.06)),
    Math.min(1, Math.max(0, _hsl.l + (rng.next() - 0.5) * jitter + tt * 0.06)),
  );
}

/** how deep (0 surface … 1 centre) p sits inside the deepest lobe containing it */
function lobeDepth(st: Struct, p: V3): number {
  let d = 0;
  for (const L of st.lobes) {
    const ex = (p[0] - L.x) / L.rx,
      ey = (p[1] - L.y) / L.ry,
      ez = (p[2] - L.z) / L.rz;
    const e = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (e < 1) d = Math.max(d, 1 - e);
  }
  return d;
}

/** baked crown occlusion of a card centre: depth into the crown, underside, whole-crown radial */
function crownAO(st: Struct, p: V3): number {
  const depth = lobeDepth(st, p);
  const vy = (p[1] - st.c[1]) / Math.max(0.3, st.cry);
  const rad = Math.hypot((p[0] - st.c[0]) / st.cr, (p[1] - st.c[1]) / st.cry, (p[2] - st.c[2]) / st.cr);
  return (0.45 + 0.55 * (1 - sstep(0.05, 0.75, depth))) * (0.68 + 0.32 * sstep(-1.1, 0.7, vy)) * (0.76 + 0.24 * sstep(0.35, 1.0, rad));
}

/** spherized normal: crown direction (ellipsoid-corrected) blended with the lobe direction and the card face */
function sphereNormal(st: Struct, p: V3, lobe: Lobe3 | null, face: V3, k = 0.82): V3 {
  const cdir = norm([(p[0] - st.c[0]) / (st.cr * st.cr), (p[1] - st.c[1]) / (st.cry * st.cry) + 0.05 / st.cry, (p[2] - st.c[2]) / (st.cr * st.cr)]);
  let s = cdir;
  if (lobe) {
    const ldir = norm([(p[0] - lobe.x) / lobe.rx, (p[1] - lobe.y) / lobe.ry, (p[2] - lobe.z) / lobe.rz]);
    s = norm(add(add([0, 0, 0], cdir, 0.6), ldir, 0.4));
  }
  const f = dot(face, s) < 0 ? ([-face[0], -face[1], -face[2]] as V3) : face;
  return norm(lerp3(f, s, k));
}

// ──────────────────────────────────────────────────────────── structure ──

export function structure(def: PlantDef): Struct {
  const kind = KINDS[def.kind];
  const rng = new Rng(def.seed ^ 0x2c1b3c6d);
  const forms = Array.isArray(kind.form) ? kind.form : [kind.form];
  const form = forms[Math.floor(rng.next() * forms.length)];
  const tone = def.tone ?? 0.5;
  const leaf = def.color ? new THREE.Color(def.color) : pickColor(rng, kind.leaf, tone, 0.06);
  const bark = pickColor(rng, kind.bark, 0.5, 0.04);
  const flower = kind.flowers ? new THREE.Color(rng.pick(kind.flowers)) : null;
  const st: Struct = { def, kind, form, c: [def.x, def.y + def.h * 0.6, def.z], cr: def.r, cry: def.h * 0.3, lobes: [], segs: [], tips: [], fronds: [], leaf, bark, flower, cardHalf: kind.card };
  if (form === 'palm' || form === 'fan') palmStruct(st, rng);
  else if (form === 'cone') coneStruct(st, rng);
  else if (form === 'bush') bushStruct(st, rng);
  else if (form === 'hedge') hedgeStruct(st, rng);
  else broadStruct(st, rng);
  return st;
}

/** lobes (relative to the crown centre) for a broadleaf form */
function makeLobes(form: Form, r: number, Rv: number, rng: Rng, bx: number, bz: number): Omit<Lobe3, 'ph' | 'w'>[] {
  const L: Omit<Lobe3, 'ph' | 'w'>[] = [];
  const bias = Math.hypot(bx, bz);
  const ba = Math.atan2(bz, bx);
  const sideK = (th: number) => 1 + 0.38 * bias * Math.cos(th - ba);
  if (form === 'column') {
    // spindle: slim core + alternating side bulges stacked up + pointed top
    L.push({ x: 0, y: -Rv * 0.05, z: 0, rx: r * 0.72, ry: Rv * 0.9, rz: r * 0.72, tint: 0.95 });
    const n = 6;
    const th0 = rng.range(0, 6.28);
    for (let i = 0; i < n; i++) {
      const f = -0.7 + (i / (n - 1)) * 1.3;
      const th = th0 + i * 2.4 + rng.range(-0.3, 0.3);
      const rad = r * (0.66 - Math.max(0, f) * 0.3) * rng.range(0.85, 1.05);
      const off = r * rng.range(0.15, 0.32);
      L.push({ x: Math.cos(th) * off, y: f * Rv * 0.8, z: Math.sin(th) * off, rx: rad, ry: Rv * 0.3, rz: rad, tint: rng.range(0.86, 1.1) });
    }
    L.push({ x: 0, y: Rv * 0.68, z: 0, rx: r * 0.4, ry: Rv * 0.36, rz: r * 0.4, tint: 1.08 });
    return L;
  }
  const flat = form === 'umbrella' ? 0.55 : form === 'spread' ? 0.8 : form === 'vase' ? 0.9 : 1;
  const coreR = form === 'umbrella' ? 0.45 : form === 'vase' ? 0.5 : 0.6;
  L.push({ x: 0, y: form === 'vase' ? Rv * 0.1 : 0, z: 0, rx: r * coreR, ry: Rv * (form === 'oval' ? 0.82 : 0.72) * flat, rz: r * coreR, tint: rng.range(0.88, 0.96) });
  const n2 = form === 'umbrella' ? rng.int(7, 9) : form === 'spread' || form === 'vase' ? rng.int(7, 9) : rng.int(6, 8);
  const th0 = rng.range(0, Math.PI * 2);
  const gap = form === 'irregular' ? rng.int(0, n2 - 1) : -1;
  for (let i = 0; i < n2; i++) {
    if (i === gap) continue;
    const th = th0 + (i / n2) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const el =
      form === 'umbrella' ? rng.range(0.0, 0.35) : form === 'spread' ? rng.range(-0.3, 0.4) : form === 'vase' ? rng.range(0.05, 0.6) : form === 'oval' ? rng.range(-0.6, 0.8) : rng.range(-0.5, 0.7);
    const sk = sideK(th) * (form === 'irregular' ? rng.range(0.82, 1.12) : rng.range(0.93, 1.05));
    const rad = r * (form === 'umbrella' ? rng.range(0.36, 0.44) : rng.range(0.34, 0.46)) * Math.min(1.12, sk);
    let d = r * (form === 'spread' || form === 'umbrella' ? rng.range(0.56, 0.66) : form === 'vase' ? rng.range(0.52, 0.64) : rng.range(0.46, 0.58)) * sk;
    if (d * Math.cos(el) + rad > r * 1.08 * sk) d = (r * 1.08 * sk - rad) / Math.max(0.3, Math.cos(el));
    L.push({
      x: Math.cos(th) * Math.cos(el) * d,
      y: Math.sin(el) * Rv * (form === 'oval' ? 0.72 : 0.62) * flat + (form === 'vase' ? Rv * 0.12 : 0),
      z: Math.sin(th) * Math.cos(el) * d,
      rx: rad,
      ry: rad * rng.range(0.78, 0.98) * flat * Math.min(1.2, Math.max(0.85, Rv / r)),
      rz: rad,
      tint: rng.range(0.84, 1.12),
    });
  }
  const nTop = form === 'dome' || form === 'oval' ? 1 : rng.int(2, 3);
  for (let i = 0; i < nTop; i++) {
    const a = rng.range(0, 6.28),
      off = nTop > 1 ? rng.range(0.16, 0.3) * r : rng.range(0, 0.1) * r;
    const rad = r * (nTop > 1 ? rng.range(0.32, 0.4) : 0.44);
    L.push({ x: Math.cos(a) * off + bx * r * 0.12, y: Rv * (form === 'oval' ? 0.56 : 0.46) * flat, z: Math.sin(a) * off + bz * r * 0.12, rx: rad, ry: Rv * 0.38 * flat, rz: rad, tint: rng.range(1.02, 1.12) });
  }
  return L;
}

/** broadleaf: trunk (+ stems), limbs to every leaf mass, branches inside the masses, tips on the shell */
function broadStruct(st: Struct, rng: Rng): void {
  const { def, kind, form } = st;
  const { x, y, z, h, r } = def;
  const bx = def.bx ?? 0,
    bz = def.bz ?? 0;
  let clear = def.clear ?? h * rng.range(kind.clear[0], kind.clear[1]);
  clear = Math.min(clear, h - 1.2);
  const crownH = h - clear;
  const Rv = crownH / 2;
  // lean: random + toward the bias (light / street)
  const la = rng.range(0, Math.PI * 2),
    lm = rng.range(0.01, form === 'irregular' ? 0.06 : 0.035) * h;
  const lx = Math.cos(la) * lm + bx * 0.07 * h,
    lz = Math.sin(la) * lm + bz * 0.07 * h;
  const cy = y + clear + Rv * (form === 'umbrella' ? 1.15 : form === 'column' ? 0.98 : 0.82);
  const c: V3 = [x + lx, cy, z + lz];
  st.c = c;
  st.cr = r;
  st.cry = Rv;
  const rel = makeLobes(form, r, Rv, rng, bx, bz);
  if (def.stretch) {
    const [sx, sz, k] = def.stretch;
    for (const L of rel) {
      const along = L.x * sx + L.z * sz;
      L.x += sx * along * (k - 1);
      L.z += sz * along * (k - 1);
      const g = Math.sqrt(k);
      L.rx *= 1 + (g - 1) * Math.abs(sx);
      L.rz *= 1 + (g - 1) * Math.abs(sz);
    }
  }
  const ph0 = rng.next();
  st.lobes = rel.map((L, i) => ({ ...L, x: c[0] + L.x, y: c[1] + L.y, z: c[2] + L.z, ph: (ph0 + i * 0.381966) % 1, w: Math.min(1, Math.hypot(L.x, L.z, L.y * 0.5) / 2.2 + 0.25) }));
  st.cardHalf = kind.card * Math.min(1.3, Math.max(0.72, r / 2.5));
  // trunk(s)
  const age = def.age ?? 0.5;
  const r0 = Math.max(0.06, Math.min(0.42, (0.016 * h + 0.022 * r) * kind.girth * (0.8 + 0.45 * age)));
  const trunkTop: V3 = [x + lx * 0.75, y + clear + Rv * (form === 'umbrella' ? 0.75 : form === 'column' ? 0.2 : 0.3), z + lz * 0.75];
  const stems: { base: V3; top: V3; r: number }[] = [];
  const multi = kind.stems && rng.chance(kind.stems[0]) ? rng.int(2, kind.stems[1]) : 1;
  if (multi > 1) {
    // olive-like: stems diverge from a gnarled base, each heading for its share of the crown
    const sa = rng.range(0, 6.28);
    for (let i = 0; i < multi; i++) {
      const a = sa + (i / multi) * 6.28 + rng.range(-0.4, 0.4);
      const top: V3 = [trunkTop[0] + Math.cos(a) * r * 0.32, trunkTop[1] - rng.range(0, Rv * 0.3), trunkTop[2] + Math.sin(a) * r * 0.32];
      stems.push({ base: [x + Math.cos(a) * r0 * 0.4, y, z + Math.sin(a) * r0 * 0.4], top, r: r0 * 0.7 });
    }
  } else stems.push({ base: [x, y, z], top: trunkTop, r: r0 });
  const sway0 = STILL;
  for (const s of stems) {
    // S-curved trunk in 3 segments with a root flare
    const mid = lerp3(s.base, s.top, 0.5);
    const wob = (form === 'irregular' || multi > 1 ? 0.06 : 0.022) * h;
    mid[0] += rng.range(-wob, wob);
    mid[2] += rng.range(-wob, wob);
    const flare: V3 = [s.base[0] + (mid[0] - s.base[0]) * 0.08, s.base[1] + Math.min(0.55, h * 0.06), s.base[2] + (mid[2] - s.base[2]) * 0.08];
    st.segs.push({ a: [s.base[0], s.base[1] - 0.2, s.base[2]], b: flare, ra: s.r * 1.5, rb: s.r * 1.04, sa: sway0, sb: sway0, near: false, aoA: 0.5, aoB: 0.78 });
    st.segs.push({ a: flare, b: mid, ra: s.r * 1.04, rb: s.r * 0.86, sa: sway0, sb: sway0, near: false, aoA: 0.78, aoB: 0.9 });
    st.segs.push({ a: mid, b: s.top, ra: s.r * 0.86, rb: s.r * 0.64, sa: sway0, sb: sway0, near: false, aoA: 0.9, aoB: 0.72 });
  }
  // limbs: from the stem tops / upper trunk to each leaf mass
  const stemFor = (L: Lobe3) => {
    let best = stems[0],
      bd = 1e9;
    for (const s of stems) {
      const d = Math.hypot(L.x - s.top[0], L.z - s.top[2]);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  st.lobes.forEach((L, li) => {
    const s = stemFor(L);
    const outward = Math.hypot(L.x - s.top[0], L.z - s.top[2]);
    const low = (L.y - c[1]) / Math.max(0.5, Rv);
    // limb start: lower lobes branch off lower on the stem
    const sf = Math.min(1, Math.max(0.55, 0.85 + low * 0.25));
    const start = lerp3(lerp3(s.base, s.top, 0.6), s.top, sf);
    const lr = Math.max(0.03, s.r * (0.42 + 0.18 * Math.min(1, outward / r)) * (li === 0 ? 0.9 : 1));
    // aim into the mass, stop ~30 % short of its centre
    const tgt: V3 = [L.x - (L.x - start[0]) * 0.22, L.y - L.ry * 0.25, L.z - (L.z - start[2]) * 0.22];
    const m: V3 = lerp3(start, tgt, 0.5);
    m[1] += (form === 'vase' ? 0.05 : form === 'spread' || form === 'umbrella' ? 0.14 : 0.1) * Math.hypot(tgt[0] - start[0], tgt[2] - start[2]);
    const lsA: Sway = { ph1: L.ph, w1: 0, ph2: 0, w2: 0 };
    const lsM: Sway = { ph1: L.ph, w1: L.w * 0.45, ph2: 0, w2: 0 };
    const lsB: Sway = { ph1: L.ph, w1: L.w, ph2: 0, w2: 0 };
    // limbs belong to the near LOD (the far cards hide them; the static part keeps trunks only)
    st.segs.push({ a: start, b: m, ra: lr, rb: lr * 0.78, sa: lsA, sb: lsM, near: true, aoA: 0.7, aoB: 0.65 });
    st.segs.push({ a: m, b: tgt, ra: lr * 0.78, rb: lr * 0.5, sa: lsM, sb: lsB, near: true, aoA: 0.65, aoB: 0.55 });
    // branches radiating to the lobe's shell
    const lobeR = (L.rx + L.ry + L.rz) / 3;
    const nb = Math.max(3, Math.round(2.6 + lobeR * 2.6));
    const out = norm([L.x - c[0], (L.y - c[1]) * 0.6 + 0.3 * Rv, L.z - c[2]]);
    for (let k = 0; k < nb; k++) {
      let d = norm(add(add(randDir(rng), out, li === 0 ? 0.3 : 0.75), [0, 1, 0], form === 'weep' ? -0.1 : 0.25));
      // keep branches mostly in the outer half of the mass
      const len = lobeR * rng.range(0.62, 0.98);
      const b: V3 = [tgt[0] + d[0] * len * (L.rx / lobeR), tgt[1] + d[1] * len * (L.ry / lobeR), tgt[2] + d[2] * len * (L.rz / lobeR)];
      d = norm([b[0] - tgt[0], b[1] - tgt[1], b[2] - tgt[2]]);
      const bph = rng.next();
      const w2 = Math.min(1, len / 1.6);
      const sA: Sway = { ph1: L.ph, w1: L.w, ph2: bph, w2: 0 };
      const sB: Sway = { ph1: L.ph, w1: L.w, ph2: bph, w2 };
      const br0 = Math.max(0.018, lr * 0.42);
      st.segs.push({ a: tgt, b, ra: br0, rb: Math.max(0.008, br0 * 0.3), sa: sA, sb: sB, near: true, aoA: 0.5, aoB: 0.75 });
      // tips along the branch; curtains for weeping forms
      const nt = 4;
      for (let q = 0; q < nt; q++) {
        const f = 0.35 + (q / (nt - 1)) * 0.65;
        const p = lerp3(tgt, b, f);
        // a little sideways scatter so clusters don't line up on the branch
        p[0] += rng.range(-0.18, 0.18) * lobeR;
        p[1] += rng.range(-0.12, 0.12) * lobeR;
        p[2] += rng.range(-0.18, 0.18) * lobeR;
        st.tips.push({ p, d, sway: { ph1: L.ph, w1: L.w, ph2: bph, w2: w2 * f }, lobe: li, s: rng.range(0.82, 1.12) * (q === nt - 1 ? 1.05 : 0.95) });
      }
      if (form === 'weep' && li > 0) {
        for (let q = 0; q < 2; q++) st.tips.push({ p: [b[0] + d[0] * 0.2, b[1] - q * st.cardHalf * 1.6, b[2] + d[2] * 0.2], d: [0, -1, 0], sway: { ph1: L.ph, w1: L.w, ph2: bph, w2: Math.min(1, w2 + 0.4 + q * 0.3) }, lobe: li, s: 1, hang: true });
      }
    }
  });
}

/** spruce / fir: trunk to the top, whorls of drooping branches with needle sprays */
function coneStruct(st: Struct, rng: Rng): void {
  const { def, kind } = st;
  const { x, y, z, h, r } = def;
  const fir = def.kind === 'fir';
  const y0 = y + (def.clear ?? h * rng.range(kind.clear[0], kind.clear[1]));
  const top = y + h;
  const r0 = Math.max(0.08, Math.min(0.4, 0.026 * h * kind.girth));
  st.c = [x, y0 + (top - y0) * 0.4, z];
  st.cr = r * 1.1;
  st.cry = (top - y0) * 0.55;
  st.cardHalf = kind.card * Math.min(1.25, Math.max(0.7, r / 2.2));
  const lean: V3 = [rng.range(-0.02, 0.02) * h, 0, rng.range(-0.02, 0.02) * h];
  const T: V3 = [x + lean[0], top, z + lean[2]];
  const m1 = lerp3([x, y, z], T, 0.35),
    m2 = lerp3([x, y, z], T, 0.7);
  st.segs.push({ a: [x, y - 0.15, z], b: [x, y + 0.35, z], ra: r0 * 1.45, rb: r0, sa: STILL, sb: STILL, near: false, aoA: 0.5, aoB: 0.7 });
  st.segs.push({ a: [x, y + 0.35, z], b: m1, ra: r0, rb: r0 * 0.75, sa: STILL, sb: STILL, near: false, aoA: 0.7, aoB: 0.6 });
  st.segs.push({ a: m1, b: m2, ra: r0 * 0.75, rb: r0 * 0.45, sa: STILL, sb: STILL, near: false, aoA: 0.6, aoB: 0.6 });
  st.segs.push({ a: m2, b: T, ra: r0 * 0.45, rb: 0.015, sa: STILL, sb: STILL, near: false, aoA: 0.6, aoB: 0.9 });
  // whorls
  const span = top - y0;
  const step = rng.range(0.42, 0.55) * Math.max(0.8, h / 10);
  const nW = Math.max(4, Math.floor(span / step));
  const per = fir ? 5 : 6;
  let rot = rng.range(0, 6.28);
  // crown "lobes" for AO: stacked discs
  for (let i = 0; i < 4; i++) {
    const f = (i + 0.5) / 4;
    const rr = st.cr * Math.pow(1 - f * 0.85, 0.9);
    st.lobes.push({ x, y: y0 + span * f * 0.92, z, rx: Math.max(0.3, rr), ry: span * 0.22, rz: Math.max(0.3, rr), tint: 1, ph: rng.next(), w: 0.6 });
  }
  for (let i = 0; i < nW; i++) {
    const f = i / nW; // 0 bottom .. 1 top
    const yy = y0 + span * f;
    const prof = Math.pow(1 - f, fir ? 0.85 : 0.95);
    const L0 = st.cr * prof * rng.range(0.88, 1.06);
    if (L0 < 0.18) continue;
    rot += 2.39996 + rng.range(-0.3, 0.3);
    const lph = rng.next();
    const n = Math.max(3, Math.round(per * (0.6 + 0.4 * prof)));
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const L = L0 * rng.range(0.85, 1.08);
      // branches leave slightly upward and droop at the tips (more on the lower whorls)
      const pitch = (0.05 + 0.3 * f) - (1 - f) * 0.25;
      const ax = lerp3([x, y, z], T, (yy - y) / (top - y));
      const tip: V3 = [ax[0] + Math.cos(a) * L, yy + Math.sin(pitch) * L - (1 - f) * 0.12 * L, ax[2] + Math.sin(a) * L];
      const d = norm([tip[0] - ax[0], tip[1] - yy, tip[2] - ax[2]]);
      const w1 = Math.min(1, L / 2.5);
      st.segs.push({ a: [ax[0], yy, ax[2]], b: tip, ra: Math.max(0.012, r0 * 0.25 * prof + 0.012), rb: 0.008, sa: { ph1: lph, w1: 0, ph2: 0, w2: 0 }, sb: { ph1: lph, w1, ph2: 0, w2: 0 }, near: true, aoA: 0.4, aoB: 0.8 });
      const nt = Math.max(1, Math.round(L / (st.cardHalf * 1.3)));
      for (let q = 0; q < nt; q++) {
        const ff = (q + 0.7) / (nt + 0.2);
        const p = lerp3([ax[0], yy, ax[2]], tip, ff);
        st.tips.push({ p, d, sway: { ph1: lph, w1: w1 * ff, ph2: rng.next(), w2: 0.4 * ff }, lobe: Math.min(3, Math.floor(f * 4)), s: rng.range(0.85, 1.1) * (0.75 + 0.25 * prof) });
      }
    }
  }
}

/** palms: curved ringed trunk + fronds (pinnate) or fan leaves on petioles + a skirt of dry fronds */
function palmStruct(st: Struct, rng: Rng): void {
  const { def, kind, form } = st;
  const { x, y, z, h } = def;
  const canary = def.kind === 'canarypalm';
  const fan = form === 'fan';
  const la = rng.range(0, 6.28),
    lm = rng.range(0.3, canary ? 0.6 : 1.4) * (h / 8);
  const th = h - (fan ? 0.4 : 0.6);
  const segs = 7;
  const pt = (f: number): V3 => [x + Math.cos(la) * lm * f * f, y + th * f, z + Math.sin(la) * lm * f * f];
  // trunk radius: slender Washingtonia, medium date palm, massive Canary palm
  const rBase = fan ? 0.18 : canary ? 0.44 : 0.23;
  for (let k = 0; k < segs; k++) {
    const fa = k / segs,
      fb = (k + 1) / segs;
    const ra = rBase * (k === 0 ? 1.3 : canary ? 1 - 0.1 * fa + 0.12 * Math.sin(fa * 3) : 1 - 0.25 * fa);
    const rb = rBase * (canary ? 1 - 0.1 * fb + 0.12 * Math.sin(fb * 3) : 1 - 0.25 * fb);
    st.segs.push({ a: pt(fa), b: pt(fb), ra, rb, sa: { ph1: 0, w1: 0, ph2: 0, w2: 0 }, sb: { ph1: 0, w1: 0, ph2: 0, w2: 0 }, near: false, aoA: k === 0 ? 0.6 : 0.85, aoB: 0.9 });
  }
  const T = pt(1);
  st.c = [T[0], T[1], T[2]];
  st.cr = fan ? 1.6 : canary ? 3.8 : 3.0 * (h / 9);
  st.cry = 1.6;
  st.lobes.push({ x: T[0], y: T[1] - 0.3, z: T[2], rx: 0.8, ry: 0.9, rz: 0.8, tint: 1, ph: rng.next(), w: 0.5 });
  // crown shaft / boss (wood with leaf-base pattern)
  st.segs.push({ a: T, b: [T[0], T[1] + 0.5, T[2]], ra: rBase * (canary ? 1.25 : 1.15), rb: rBase * 0.6, sa: STILL, sb: STILL, near: false, aoA: 0.8, aoB: 0.85 });
  const n = fan ? rng.int(18, 24) : canary ? rng.int(36, 46) : rng.int(22, 30);
  const a0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 2.39996 + rng.range(-0.1, 0.1);
    // elevation: young fronds up, old ones drooping (spiral by age)
    const ageF = i / n;
    const el = (fan ? 0.9 : 1.05) - ageF * (fan ? 1.5 : 1.75) + rng.range(-0.12, 0.12);
    const L = (fan ? rng.range(1.0, 1.4) : rng.range(2.6, 3.6) * (canary ? 1.35 : 1)) * Math.min(1.25, h / 8);
    const droop = (fan ? 0.2 : 0.55) * (0.6 + ageF) * L;
    const pts: V3[] = [];
    const base: V3 = [T[0], T[1] + 0.35, T[2]];
    for (let k = 0; k <= 4; k++) {
      const s = k / 4;
      pts.push([base[0] + Math.cos(a) * Math.cos(el) * L * s, base[1] + Math.sin(el) * L * s - droop * s * s, base[2] + Math.sin(a) * Math.cos(el) * L * s]);
    }
    const ph = rng.next();
    st.fronds.push({ pts, width: fan ? 0.8 : L * 0.24, sway: { ph1: ph, w1: 0.9, ph2: rng.next(), w2: 0.6 }, dry: false, fan });
  }
  if (fan) {
    // the Washingtonia petticoat: dry leaves hanging against the trunk
    const ns = rng.int(10, 16);
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * 6.28 + rng.range(-0.2, 0.2);
      const base: V3 = [T[0] + Math.cos(a) * rBase * 1.1, T[1] + 0.1, T[2] + Math.sin(a) * rBase * 1.1];
      const L = rng.range(1.4, 2.4);
      const pts: V3[] = [];
      for (let k = 0; k <= 4; k++) {
        const s = k / 4;
        pts.push([base[0] + Math.cos(a) * (0.35 * s), base[1] - L * s, base[2] + Math.sin(a) * (0.35 * s)]);
      }
      st.fronds.push({ pts, width: 0.5, sway: { ph1: rng.next(), w1: 0.25, ph2: 0, w2: 0 }, dry: true, fan: false });
    }
  }
}

/** shrub: leaf masses on the ground, no trunk; tips sampled on the shell */
function bushStruct(st: Struct, rng: Rng): void {
  const { def } = st;
  const { x, y, z, h, r } = def;
  st.c = [x, y + h * 0.45, z];
  st.cr = r;
  st.cry = h * 0.55;
  st.cardHalf = st.kind.card * Math.min(1.3, Math.max(0.6, r / 0.9));
  const ph = rng.next();
  st.lobes.push({ x, y: y + h * 0.42, z, rx: r * 0.8, ry: h * 0.5, rz: r * 0.8, tint: 0.95, ph, w: 0.3 });
  const n = rng.int(3, 4);
  const a0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.28 + rng.range(-0.4, 0.4);
    const rad = r * rng.range(0.45, 0.6);
    st.lobes.push({ x: x + Math.cos(a) * r * 0.45, y: y + h * rng.range(0.32, 0.55), z: z + Math.sin(a) * r * 0.45, rx: rad, ry: rad * (h / r) * 0.9, rz: rad, tint: rng.range(0.88, 1.1), ph: rng.next(), w: 0.35 });
  }
  st.lobes.forEach((L, li) => {
    const nt = Math.max(4, Math.round(((L.rx * L.rz) / (st.cardHalf * st.cardHalf)) * 3.2));
    for (let k = 0; k < nt; k++) {
      const d = randDir(rng);
      if (d[1] < -0.45) d[1] = -d[1] * 0.4;
      const e = rng.range(0.7, 1.0);
      const p: V3 = [L.x + d[0] * L.rx * e, Math.max(y + 0.08, L.y + d[1] * L.ry * e), L.z + d[2] * L.rz * e];
      st.tips.push({ p, d, sway: { ph1: L.ph, w1: L.w, ph2: rng.next(), w2: 0.4 }, lobe: li, s: rng.range(0.8, 1.15) });
    }
  });
}

/** clipped hedge: tips spread over both faces and the top (cards lie along the faces, tops break the line) */
function hedgeStruct(st: Struct, rng: Rng): void {
  const { def } = st;
  const [ax, az, bx, bz, wd] = def.seg ?? [def.x, def.z, def.x + 1, def.z, 0.6];
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L,
    uz = (bz - az) / L;
  const vx = -uz,
    vz = ux;
  const hw = wd / 2,
    hh = def.h,
    y = def.y;
  st.c = [(ax + bx) / 2, y + hh * 0.5, (az + bz) / 2];
  st.cr = Math.max(hw, L / 2);
  st.cry = hh * 0.6;
  st.cardHalf = st.kind.card;
  const ph = rng.next();
  // AO "lobes": a row of ellipsoids along the hedge
  const nl = Math.max(1, Math.round(L / 1.2));
  for (let i = 0; i < nl; i++) {
    const f = (i + 0.5) / nl;
    st.lobes.push({ x: ax + ux * L * f, y: y + hh * 0.5, z: az + uz * L * f, rx: Math.max(hw, 0.7), ry: hh * 0.55, rz: Math.max(hw, 0.7), tint: rng.range(0.94, 1.06), ph: (ph + i * 0.37) % 1, w: 0.15 });
  }
  const step = 0.3;
  for (let u = 0.15; u < L - 0.1; u += step * rng.range(0.8, 1.2)) {
    const cx = ax + ux * u,
      cz = az + uz * u;
    const li = Math.min(nl - 1, Math.floor((u / L) * nl));
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const hy = y + rng.range(0.12, hh * 0.92);
        const p: V3 = [cx + vx * side * (hw + 0.02), hy, cz + vz * side * (hw + 0.02)];
        st.tips.push({ p, d: [vx * side, 0, vz * side], sway: { ph1: ph, w1: 0.08, ph2: rng.next(), w2: 0.2 }, lobe: li, s: rng.range(0.85, 1.15) });
      }
    }
    // top
    const p: V3 = [cx + vx * rng.range(-hw, hw) * 0.8, y + hh + 0.01, cz + vz * rng.range(-hw, hw) * 0.8];
    st.tips.push({ p, d: [0, 1, 0], sway: { ph1: ph, w1: 0.1, ph2: rng.next(), w2: 0.25 }, lobe: li, s: rng.range(0.9, 1.2) });
  }
}

// ─────────────────────────────────────────────────────────────── emission ──

const tmpCard: CardIn = {
  cx: 0,
  cy: 0,
  cz: 0,
  ux: 0,
  uy: 0,
  uz: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  nx: 0,
  ny: 1,
  nz: 0,
  ao: 1,
  flutter: 1,
  lod: 0,
  uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
  r: 0,
  g: 0,
  b: 0,
  trans: 1,
  fr: 0,
  fg: 0,
  fb: 0,
  gloss: 0,
  sway: STILL,
};

const DRY = new THREE.Color('#9a7f55');

function card(buf: InstBuf, ref: PlantRef, st: Struct, centre: V3, U: V3, V: V3, normal: V3, ao: number, lod: number, uv: UvRect, tint: number, sway: Sway, flutter = 1, col: THREE.Color = st.leaf): void {
  const k = st.kind;
  const c = tmpCard;
  c.cx = centre[0];
  c.cy = centre[1];
  c.cz = centre[2];
  c.ux = U[0];
  c.uy = U[1];
  c.uz = U[2];
  c.vx = V[0];
  c.vy = V[1];
  c.vz = V[2];
  c.nx = normal[0];
  c.ny = normal[1];
  c.nz = normal[2];
  c.ao = ao;
  c.flutter = Math.min(1, 0.5 * flutter * k.flutter);
  c.lod = lod;
  c.uv = uv;
  c.r = col.r * tint;
  c.g = col.g * tint;
  c.b = col.b * tint;
  c.trans = Math.min(1, k.trans * 0.8);
  const fl = st.flower;
  c.fr = fl ? fl.r : 1;
  c.fg = fl ? fl.g : 1;
  c.fb = fl ? fl.b : 1;
  c.gloss = k.gloss;
  c.sway = sway;
  pushCard(buf, ref, c);
}

function wood(buf: InstBuf, ref: PlantRef, st: Struct, s: Seg, lod: number): void {
  const b = st.bark;
  pushWood(buf, ref, {
    ax: s.a[0],
    ay: s.a[1],
    az: s.a[2],
    ra: s.ra,
    bx: s.b[0],
    by: s.b[1],
    bz: s.b[2],
    rb: s.rb,
    lod,
    aoA: s.aoA,
    aoB: s.aoB,
    a: s.sa,
    b: s.sb,
    pattern: st.kind.pattern,
    r: b.r,
    g: b.g,
    bl: b.b,
    moss: st.kind.moss ?? 0,
  });
}

/** card frame: V = leaf-out direction, U = across; returns [U*hu, V*hv, faceNormal] */
function frame(rng: Rng, out: V3, d: V3, hu: number, hv: number, rollRange = Math.PI): [V3, V3, V3] {
  const V = norm(add(add(d, out, 0.9), randDir(rng), 0.45));
  const ref: V3 = Math.abs(V[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let U = norm(cross(V, ref));
  // roll around V
  const W = cross(V, U);
  const a = rng.range(-rollRange, rollRange);
  U = norm(add([U[0] * Math.cos(a), U[1] * Math.cos(a), U[2] * Math.cos(a)], W, Math.sin(a)));
  const F = norm(cross(U, V));
  return [
    [U[0] * hu, U[1] * hu, U[2] * hu],
    [V[0] * hv, V[1] * hv, V[2] * hv],
    F,
  ];
}

/** FAR LOD: trunk + limbs (static wood, always) and a few big dense cards per leaf mass */
export function emitFar(st: Struct, ref: PlantRef, cards: InstBuf, woodBuf: InstBuf): void {
  const rng = new Rng(st.def.seed ^ 0x51f15e);
  for (const s of st.segs) if (!s.near) wood(woodBuf, ref, st, s, 0);
  const atlas = getLeafAtlas();
  if (st.form === 'hedge') return;
  if (st.form === 'palm' || st.form === 'fan') {
    emitFronds(st, ref, cards, rng, -1, st.def.forest ? 0.35 : 0.5);
    return;
  }
  const uv = atlas.uv(st.kind.dense);
  const forest = !!st.def.forest;
  st.lobes.forEach((L, li) => {
    const lobeR = (L.rx + L.ry + L.rz) / 3;
    const out = norm([L.x - st.c[0], L.y - st.c[1] + 0.2 * st.cry, L.z - st.c[2]]);
    const n = st.form === 'cone' ? (forest ? 3 : 4) : st.form === 'bush' ? 2 : (forest ? 2 : 3) + (lobeR > 1.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const off = randDir(rng);
      const e = li === 0 && st.form !== 'cone' ? 0.15 : 0.32;
      const p: V3 = [L.x + (out[0] * 0.55 + off[0] * 0.45) * L.rx * e, L.y + (out[1] * 0.55 + off[1] * 0.45) * L.ry * e, L.z + (out[2] * 0.55 + off[2] * 0.45) * L.rz * e];
      const hs = lobeR * (st.form === 'cone' ? 1.1 : 1.12) * rng.range(0.92, 1.1);
      const [U, V, F] = frame(rng, out, randDir(rng), hs, hs * Math.min(1.2, L.ry / Math.max(0.2, (L.rx + L.rz) / 2)) + 0.0);
      // centre the clump drawing on the mass (the dense tile's twig base sits at the bottom)
      const c: V3 = [p[0] - V[0] * 0.15, p[1] - V[1] * 0.15, p[2] - V[2] * 0.15];
      card(cards, ref, st, c, U, V, sphereNormal(st, p, L, F, 0.86), crownAO(st, p) * 0.95, -1, uv, L.tint * rng.range(0.94, 1.06), { ph1: L.ph, w1: L.w * 0.8, ph2: rng.next(), w2: 0.2 }, 0.6);
    }
  });
}

const IVY = new THREE.Color('#2f5a2a');
const GROUNDCOVER = new THREE.Color('#4a7a34');

/** trailing ivy over a planter rim + a little groundcover on its soil */
function emitPlanter(st: Struct, ref: PlantRef, cards: InstBuf, rng: Rng): void {
  const pl = st.def.planter;
  if (!pl) return;
  const atlas = getLeafAtlas();
  const uvI = atlas.uv('ivy'),
    uvS = atlas.uv('shrub');
  const { x, y, z } = st.def;
  const cs = Math.cos(pl.yaw),
    sn = Math.sin(pl.yaw);
  // rim outline in local xz (same polygons as plants.ts stonePlanter)
  const rim = (a: number): V3 => {
    let lx: number, lz: number;
    if (pl.round) {
      lx = Math.cos(a) * 1.03;
      lz = Math.sin(a) * 1.03;
    } else {
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const k = Math.min(0.79 / Math.max(1e-3, Math.abs(ca)), 0.38 / Math.max(1e-3, Math.abs(sa)));
      lx = ca * k;
      lz = sa * k;
    }
    // Shaper frame: local x → (cos yaw, −sin yaw), local z → (sin yaw, cos yaw)
    return [x + lx * cs + lz * sn, y + 0.095, z - lx * sn + lz * cs];
  };
  const n = pl.round ? rng.int(5, 8) : rng.int(3, 5);
  const a0 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.28 + rng.range(-0.3, 0.3);
    const p = rim(a);
    const out = norm([p[0] - x, 0, p[2] - z]);
    const hv = rng.range(0.16, 0.26),
      hu = rng.range(0.14, 0.22);
    const V: V3 = [out[0] * 0.12 * hv, -hv, out[2] * 0.12 * hv];
    const U: V3 = [-out[2] * hu, 0, out[0] * hu];
    const c: V3 = [p[0] + out[0] * 0.03 + V[0], p[1] + V[1], p[2] + out[2] * 0.03 + V[2]];
    card(cards, ref, st, c, U, V, norm([out[0], 0.35, out[2]]), 0.8, 1, uvI, rng.range(0.85, 1.1), STILL, 0.6, IVY);
  }
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, 6.28),
      d = rng.range(0.3, 0.6);
    const p: V3 = [x + Math.cos(a) * d, y + 0.02, z + Math.sin(a) * d];
    const hs = rng.range(0.16, 0.24);
    const dir: V3 = norm([Math.cos(a), 0.25, Math.sin(a)]);
    const V: V3 = [dir[0] * hs, dir[1] * hs, dir[2] * hs];
    const U: V3 = [-dir[2] * hs, 0, dir[0] * hs];
    card(cards, ref, st, [p[0] + V[0], p[1] + V[1], p[2] + V[2]], U, V, [0, 1, 0], 0.75, 1, uvS, rng.range(0.85, 1.1), STILL, 0.4, GROUNDCOVER);
  }
}

/** NEAR LOD: branches (dynamic wood) + fine cluster cards on every tip + dense inner cards */
export function emitNear(st: Struct, ref: PlantRef, cards: InstBuf, woodBuf: InstBuf): void {
  const rng = new Rng(st.def.seed ^ 0x7ea4f00d);
  for (const s of st.segs) if (s.near) wood(woodBuf, ref, st, s, 1);
  emitPlanter(st, ref, cards, new Rng(st.def.seed ^ 0x9a17));
  const atlas = getLeafAtlas();
  if (st.form === 'palm' || st.form === 'fan') {
    emitFronds(st, ref, cards, rng, 1, 1);
    return;
  }
  const k = st.kind;
  const uvLeaf = atlas.uv(k.tile);
  const uvDense = atlas.uv(k.dense);
  const half = st.cardHalf;
  // inner dense cards: fill the core of every leaf mass (no sky through the middle of a crown)
  if (st.form !== 'bush') {
    st.lobes.forEach((L) => {
      const lobeR = (L.rx + L.ry + L.rz) / 3;
      const n = st.form === 'cone' ? 1 : lobeR > 1.1 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const p: V3 = [L.x + rng.range(-0.25, 0.25) * L.rx, L.y + rng.range(-0.2, 0.2) * L.ry, L.z + rng.range(-0.25, 0.25) * L.rz];
        const out = norm([p[0] - st.c[0], p[1] - st.c[1], p[2] - st.c[2]]);
        const hs = lobeR * 0.85;
        const [U, V, F] = frame(rng, out, randDir(rng), hs, hs);
        card(cards, ref, st, p, U, V, sphereNormal(st, p, L, F, 0.9), crownAO(st, p) * 0.75, 1, uvDense, L.tint * 0.9, { ph1: L.ph, w1: L.w * 0.7, ph2: 0, w2: 0 }, 0.3);
      }
    });
  }
  for (const t of st.tips) {
    const L = st.lobes[t.lobe];
    const nC = Math.max(1, Math.round(k.density + rng.range(-0.45, 0.45)));
    for (let i = 0; i < nC; i++) {
      const out = norm([t.p[0] - st.c[0], (t.p[1] - st.c[1]) * 0.8, t.p[2] - st.c[2]]);
      let hu = half * t.s * rng.range(0.85, 1.12);
      let hv = hu;
      let U: V3, V: V3, F: V3;
      if (t.hang) {
        // hanging curtain (willow): vertical cards, strands down
        hv = hu * 1.5;
        hu *= 0.75;
        const a = rng.range(0, 6.28);
        const side: V3 = norm([Math.cos(a), 0, Math.sin(a)]);
        U = [side[0] * hu, 0, side[2] * hu];
        V = [rng.range(-0.1, 0.1) * hv, -hv, rng.range(-0.1, 0.1) * hv];
        F = norm(cross(U, V));
      } else if (st.form === 'hedge') {
        // clusters lying along the clipped face: leaves point up/along, a little outward
        const d = t.d;
        const up = d[1] > 0.5;
        const Vd = up ? norm(add([rng.range(-0.6, 0.6), 0.25, rng.range(-0.6, 0.6)], [0, 0, 0])) : norm(add([0, 1, 0], add(d, randDir(rng), 0.6), 0.45));
        const Ud = norm(cross(Vd, up ? [0, 1, 0] : d));
        U = [Ud[0] * hu, Ud[1] * hu, Ud[2] * hu];
        V = [Vd[0] * hv, Vd[1] * hv, Vd[2] * hv];
        F = norm(cross(Ud, Vd));
      } else if (st.form === 'cone') {
        // needle sprays: along the branch, mostly flat, rolled ±35°
        const d = t.d;
        const Vd = norm(add(d, randDir(rng), 0.15));
        let Ud = norm(cross([0, 1, 0], Vd));
        const W = cross(Vd, Ud);
        const a = rng.range(-0.6, 0.6);
        Ud = norm(add([Ud[0] * Math.cos(a), Ud[1] * Math.cos(a), Ud[2] * Math.cos(a)], W, Math.sin(a)));
        hv = hu * 1.15;
        U = [Ud[0] * hu * 0.85, Ud[1] * hu * 0.85, Ud[2] * hu * 0.85];
        V = [Vd[0] * hv, Vd[1] * hv, Vd[2] * hv];
        F = norm(cross(Ud, Vd));
      } else {
        [U, V, F] = frame(rng, out, t.d, hu, hv);
      }
      // the twig base of the drawing sits at the tip; the cluster extends outwards
      const c: V3 = t.hang
        ? [t.p[0], t.p[1] - hv, t.p[2]]
        : st.form === 'hedge'
          ? [t.p[0] + V[0] * 0.55 + t.d[0] * 0.04, t.p[1] + V[1] * 0.55, t.p[2] + V[2] * 0.55 + t.d[2] * 0.04]
          : [t.p[0] + V[0] * 0.75, t.p[1] + V[1] * 0.75, t.p[2] + V[2] * 0.75];
      const ao = crownAO(st, c);
      // fresh growth on the sunny top is lighter/yellower, shaded underside cooler
      const vy = (c[1] - st.c[1]) / Math.max(0.3, st.cry);
      const tint = L.tint * rng.range(0.9, 1.08) * (0.94 + 0.1 * smooth01(vy * 0.6 + 0.5));
      const nrm = st.form === 'hedge' ? norm(lerp3(dot(F, t.d) < 0 ? ([-F[0], -F[1], -F[2]] as V3) : F, add(t.d, [0, 0.35, 0]), 0.7)) : sphereNormal(st, c, L, F, st.form === 'bush' ? 0.85 : 0.78);
      card(cards, ref, st, c, U, V, nrm, st.form === 'hedge' ? 0.55 + 0.45 * smooth01((c[1] - st.def.y) / Math.max(0.3, st.def.h)) : ao, 1, uvLeaf, tint, t.sway, 1);
    }
  }
}

/** palm fronds as strips of consecutive cards (v sub-ranges of the frond tile) */
function emitFronds(st: Struct, ref: PlantRef, cards: InstBuf, rng: Rng, lod: number, keep: number): void {
  const atlas = getLeafAtlas();
  const uvF = atlas.uv('frond');
  const uvD = atlas.uv('dryFrond');
  const uvFan = atlas.uv('fan');
  st.fronds.forEach((fr, i) => {
    // far LOD keeps a subset (every other frond, the big outer ones)
    if (keep < 1 && hash01(i, st.def.seed % 977, 7) > keep && !fr.dry) return;
    if (fr.fan) {
      // petiole (near only) + one fan card at its end, facing out and up
      const a = fr.pts[0],
        b = fr.pts[fr.pts.length - 1];
      const dir = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const side = norm(cross([0, 1, 0], dir));
      const up = norm(cross(dir, side));
      const hs = fr.width * rng.range(0.9, 1.1);
      const V: V3 = [(dir[0] * 0.5 + up[0] * 0.6) * hs, (dir[1] * 0.5 + up[1] * 0.6) * hs, (dir[2] * 0.5 + up[2] * 0.6) * hs];
      const U: V3 = [side[0] * hs, side[1] * hs, side[2] * hs];
      const c: V3 = [b[0] + V[0] * 0.6, b[1] + V[1] * 0.6, b[2] + V[2] * 0.6];
      const F = norm(cross(U, V));
      card(cards, ref, st, c, U, V, sphereNormal(st, c, null, F, 0.5), 0.9, lod, uvFan, rng.range(0.9, 1.08), fr.sway, 0.8);
      return;
    }
    const uv = fr.dry ? uvD : uvF;
    const n = fr.pts.length - 1;
    const tint = fr.dry ? 1 : rng.range(0.9, 1.08);
    for (let k = 0; k < n; k++) {
      const a = fr.pts[k],
        b = fr.pts[k + 1];
      const c: V3 = lerp3(a, b, 0.5);
      const V: V3 = [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2];
      const vd = norm(V);
      const side = norm(cross([0, 1, 0], vd));
      // keel: leaflets rise in a shallow V → tilt the card plane a little per segment
      const up = norm(cross(vd, side));
      const w = fr.width;
      // v sub-range of the (bottom → top) frond drawing
      const v0 = uv.v0 + (uv.v1 - uv.v0) * (k / n),
        v1 = uv.v0 + (uv.v1 - uv.v0) * ((k + 1) / n);
      const sw: Sway = { ph1: fr.sway.ph1, w1: fr.sway.w1 * (0.3 + 0.7 * ((k + 0.5) / n)), ph2: fr.sway.ph2, w2: fr.sway.w2 * ((k + 0.5) / n) };
      const ao = fr.dry ? 0.7 : 0.75 + 0.25 * (k / n);
      const colr = fr.dry ? DRY : st.leaf;
      if (lod > 0 && !fr.dry) {
        // near: two half-cards per segment forming the keeled V of a real frond (leaflets rise from the
        // rachis), so the crown reads from below and from the side, not only from above
        const keel = 0.62 - 0.25 * (k / n);
        const um = (uv.u0 + uv.u1) / 2;
        for (const sgn of [-1, 1]) {
          const t: V3 = norm([side[0] * sgn * Math.cos(keel) + up[0] * Math.sin(keel), side[1] * sgn * Math.cos(keel) + up[1] * Math.sin(keel), side[2] * sgn * Math.cos(keel) + up[2] * Math.sin(keel)]);
          const hc: V3 = [c[0] + t[0] * w * 0.5, c[1] + t[1] * w * 0.5, c[2] + t[2] * w * 0.5];
          // x = -1 at the rachis for the right half, at the tip for the left half (tile is symmetric)
          const U: V3 = [t[0] * w * 0.5 * sgn, t[1] * w * 0.5 * sgn, t[2] * w * 0.5 * sgn];
          const F = norm(cross(U, V));
          const sub = sgn < 0 ? { u0: uv.u0, v0, u1: um, v1 } : { u0: um, v0, u1: uv.u1, v1 };
          const nrm = sphereNormal(st, hc, null, F, 0.4);
          card(cards, ref, st, hc, U, V, [nrm[0], nrm[1] + 0.3, nrm[2]], ao, lod, sub, tint * (sgn < 0 ? 0.97 : 1.03), sw, 0.8, colr);
        }
        continue;
      }
      const tilt = 0.25;
      const U: V3 = [(side[0] + up[0] * tilt) * w, (side[1] + up[1] * tilt) * w, (side[2] + up[2] * tilt) * w];
      const F = norm(cross(U, V));
      const sub = { u0: uv.u0, v0, u1: uv.u1, v1 };
      const nrm = sphereNormal(st, c, null, F, 0.35);
      card(cards, ref, st, c, U, V, [nrm[0], nrm[1] + 0.25, nrm[2]], ao, lod, sub, tint, sw, 0.8, colr);
    }
  });
}

export function newCardBuf(cap = 256): InstBuf {
  return new InstBuf(CARD_SPECS, cap);
}
export function newWoodBuf(cap = 64): InstBuf {
  return new InstBuf(WOOD_SPECS, cap);
}
