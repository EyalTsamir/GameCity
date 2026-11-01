// Trunks you can stand next to. Within the bubble each tree's trunk is one continuous skin, foot to fork, with the roots
// grown out of the same surface and bark that belongs to its species; further out the instanced tubes of the crown system
// stand as before (with the same mean tone). The tube is told per plant when its replacement is on show (a small texture,
// so a trunk is never missing while its cell is still being built) and stays in the shadow pass.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { nearDither, nearLens, nearOf, nearRandom, type NearCell } from '../../core/nearDetail';
import { closeNature } from '../../core/closenature';
import { patchLampMaterial } from '../lamps/integrate';
import { woodBendVertex, woodBendUniforms } from '../vegetation/foliage';
import { KIND, landTrunk, type TreeList } from '../landscape/trees';
import type { BarkTiles } from './barkTiles';

/** what a tree's module knows about one trunk */
export interface TrunkSpec {
  /** plant number for the tube's swap texture; -1: nothing to hide (the new skin encloses the old trunk) */
  id: number;
  base: [number, number, number];
  ctl: [number, number, number];
  top: [number, number, number];
  /** radius above the flare and at the top (m) */
  r0: number;
  rTop: number;
  flare: number;
  roots: number;
  /** a limb from the fork: rings across its own axis, no foot */
  limb?: boolean;
  /** bends with this plant's height, as its tube did; 0 = stands still */
  H: number;
  /** stands in a grate or planter: no roots over the iron */
  paved: boolean;
  /** radial limit at the foot, 0 = none */
  limit: number;
  /** where the plant stands, for a limb's bend */
  root?: [number, number, number];
  /** BARK.* */
  bark: number;
  /** one of many in a wood: fewer sides and rings, no surface roots */
  lite?: boolean;
  moss: number;
  r: number;
  g: number;
  b: number;
}

/** bark families, in aB.x of a vertex */
export const BARK = { FURROW: 0.1, SMOOTH: 0.3, PINE: 0.45, PLANE: 0.55, BIRCH: 0.9 } as const;

/** the bark family for a crown kind and its old pattern code */
export function barkOf(kind: string, pattern: number): number {
  if (pattern > 0.8) return BARK.BIRCH;
  if (kind === 'plane') return BARK.PLANE;
  if (pattern > 0.4) return BARK.PINE;
  if (pattern > 0.2) return BARK.SMOOTH;
  return BARK.FURROW;
}

const RADIUS = 36;
const CELL = 24;
/** the tube goes when the skin is opaque all the way up */
const SWAP = 0.6;
const MAX_VERTS = 60000;

const VERT_PARS = /* glsl */ `
attribute vec4 aB;
attribute vec4 aRoot;
varying vec4 vB;
varying vec2 vBUv;
varying vec3 vBN;
`;
const FRAG_PARS = /* glsl */ `
uniform sampler2D tBarkF;
uniform sampler2D tBarkP;
uniform float uNight;
varying vec4 vB;
varying vec2 vBUv;
varying vec3 vBN;
vec2 bkSlope;
float bkCav;
`;
const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 wn = normalize(vBN);
  vec4 tf = texture2D(tBarkF, vBUv);
  vec4 tp = texture2D(tBarkP, vBUv + vB.w);
  float pat = vB.x, foot = vB.z;
  vec3 c = diffuseColor.rgb;
  float grain = 0.84 + 0.32 * tf.a;
  bkCav = 1.0;
  if (pat > 0.8) {
    // birch: chalk white, dark lenticels lying across the stem, peeling warm in places, black and furrowed at the foot
    float d = texture2D(tBarkF, vec2(vBUv.y * 0.9 + vB.w, vBUv.x * 0.21)).b;
    float dash = 1.0 - smoothstep(0.0, 0.2, d);
    c *= mix(vec3(1.0), vec3(0.97, 0.88, 0.74), smoothstep(0.62, 0.9, tp.a) * 0.75) * (0.9 + 0.2 * tf.a);
    c = mix(c, vec3(0.05, 0.045, 0.04), dash * 0.9);
    float low = 1.0 - smoothstep(0.1, 0.7, foot + 0.3 * (tf.a - 0.5) + 0.3 * (tp.a - 0.5));
    c = mix(c, vec3(0.055, 0.05, 0.045) * (0.45 + 1.6 * tf.b), low);
    bkSlope = (tf.rg - 0.5) * 2.0 * (0.06 + 1.3 * low);
    bkCav = mix(1.0 - 0.25 * dash, 0.5 + 0.5 * tf.b, low);
  } else if (pat > 0.5) {
    // plane: flaking jigsaw of cream, olive and grey-brown in soft drifts, each flake a little proud of the one under it
    // each flake its own colour, so every edge in the colour is a flake's; over that a soft drift (the same numbers averaged by the mipmaps)
    float drift = (texture2D(tBarkP, vBUv * 0.31 + vB.w * 1.7, 3.5).a - 0.5) * 2.6;
    float id = tp.a;
    vec3 cream = vec3(0.5, 0.48, 0.34), olive = vec3(0.26, 0.27, 0.165), grey = vec3(0.3, 0.27, 0.215), tan = vec3(0.4, 0.345, 0.225);
    vec3 m = id < 0.3 ? mix(grey, olive, smoothstep(0.1, 0.3, id)) : id < 0.62 ? mix(olive, tan, smoothstep(0.34, 0.6, id)) : mix(tan, cream, smoothstep(0.64, 0.84, id));
    m *= 1.0 + 0.22 * clamp(drift, -1.0, 1.0);
    float step0 = smoothstep(0.42, 0.66, tp.b);
    c = m * clamp(c.g / 0.23, 0.3, 1.15) * (0.9 + 0.2 * tf.a) * (0.82 + 0.18 * step0);
    bkSlope = (tp.rg - 0.5) * 2.0 * 0.8 + (tf.rg - 0.5) * 0.1;
    bkCav = 0.78 + 0.22 * step0;
  } else if (pat > 0.4) {
    // pine: thick long plates, red-brown in the crack, weathered grey on the face
    vec4 t2 = texture2D(tBarkF, vBUv * vec2(0.5, 0.62) + 0.31);
    float e = smoothstep(0.05, 0.5, t2.b);
    c *= mix(0.62, 1.55, e) * grain;
    c = mix(c, c * 0.8 + vec3(0.06, 0.056, 0.05), smoothstep(0.55, 0.9, t2.b) * 0.6);
    bkSlope = (t2.rg - 0.5) * 2.0 * 0.8;
    bkCav = 0.5 + 0.5 * e;
  } else if (pat > 0.2) {
    // smooth grey bark: shallow fissures that run together, fine pores
    vec4 t2 = texture2D(tBarkF, vBUv * vec2(0.62, 0.44) + 0.57);
    float e = smoothstep(0.0, 0.32, t2.b);
    c *= mix(0.7, 1.05, e) * (0.9 + 0.2 * tf.a) * (0.95 + 0.1 * tp.a);
    bkSlope = (t2.rg - 0.5) * 2.0 * 0.45;
    bkCav = 0.7 + 0.3 * e;
  } else {
    // furrowed: lit plate tops, deep dark furrows
    float e = smoothstep(0.03, 0.42, tf.b);
    c *= vec3(2.3, 2.2, 2.05) * mix(0.34, 1.1, e) * (0.58 + 0.84 * tf.a);
    c = mix(c, c * 1.1 + vec3(0.03, 0.028, 0.024), smoothstep(0.6, 0.95, tf.b) * 0.6);
    bkSlope = (tf.rg - 0.5) * 2.0 * 0.85;
    bkCav = 0.56 + 0.44 * e;
  }
  // green algae and moss on the wet side, in the cracks first, thick near the ground; grey lichen on a flake here and there
  float side = smoothstep(0.35, -0.75, wn.z);
  float mossK = vB.y * side * (0.5 + 0.8 * (1.0 - bkCav)) * (1.0 - 0.6 * smoothstep(0.25, 2.4, foot));
  float mossF = smoothstep(0.08, 0.46, mossK + 0.2 * (tf.a - 0.5) + (1.0 - smoothstep(0.0, 0.4, foot)) * 0.16 * side);
  c = mix(c, vec3(0.05, 0.08, 0.022) * (0.7 + 0.6 * tf.a), mossF * 0.9);
  float blot = texture2D(tBarkP, vBUv * 1.37 + vB.w, 2.0).a;
  float lichen = smoothstep(0.02, 0.1, blot - 0.84 + 0.42 * (tf.a - 0.5)) * smoothstep(0.3, 0.6, foot) * (1.0 - smoothstep(2.0, 3.0, foot));
  c = mix(c, vec3(0.3, 0.31, 0.22) * (0.5 + 0.9 * tf.a), lichen * 0.5 * step(pat, 0.5));
  // soil splash and damp at the foot, with a ragged edge
  float st = 1.0 - smoothstep(0.02, 0.26 + 0.26 * (tf.a - 0.3), foot);
  c = mix(c, c * vec3(0.72, 0.64, 0.54) + vec3(0.012, 0.009, 0.006), st * 0.7);
  diffuseColor.rgb = c;
}
`;
const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 wn = normalize(vBN);
  vec3 tx = normalize(cross(vec3(0.0, 1.0, 0.0), wn) + vec3(1e-4, 0.0, 0.0));
  vec3 ty = cross(wn, tx);
  normal = normalize(normal - (viewMatrix * vec4(tx * bkSlope.x + ty * bkSlope.y, 0.0)).xyz);
}
`;
const FRAG_AO = /* glsl */ `
#include <aomap_fragment>
reflectedLight.indirectDiffuse *= bkCav;
reflectedLight.directDiffuse *= 0.55 + 0.45 * bkCav;
reflectedLight.indirectSpecular *= bkCav * 0.5;
if (uNight > 0.01) reflectedLight.indirectDiffuse *= 1.0 + uNight * 0.8;
`;

function barkMaterial(ctx: CityContext, tiles: BarkTiles): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, vertexColors: true });
  mat.name = 'closenature-bark';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, woodBendUniforms(ctx.uniforms), { tBarkF: { value: tiles.furrows }, tBarkP: { value: tiles.flakes }, uNight: ctx.uniforms.uNight });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}\n${woodBendVertex()}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvB = aB;\nvBUv = uv;\nvBN = normal;\nif (aRoot.w > 0.0) { vec2 w = thWindAt(aRoot.xz); transformed += thMainBend(position, aRoot.xyz, aRoot.w, w, thPlantPhase(aRoot.xyz)); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <aomap_fragment>', FRAG_AO);
  };
  mat.customProgramCacheKey = () => 'closenature-bark-6';
  patchLampMaterial(mat);
  nearDither(mat, RADIUS);
  return mat;
}

/** vertex soup for one cell, reused from cell to cell */
class Soup {
  readonly P = new Float32Array(MAX_VERTS * 3);
  readonly N = new Float32Array(MAX_VERTS * 3);
  readonly C = new Float32Array(MAX_VERTS * 3);
  readonly U = new Float32Array(MAX_VERTS * 2);
  readonly B = new Float32Array(MAX_VERTS * 4);
  readonly A = new Float32Array(MAX_VERTS * 4);
  readonly I = new Uint32Array(MAX_VERTS * 6);
  nv = 0;
  ni = 0;
  reset(): void {
    this.nv = 0;
    this.ni = 0;
  }
  room(v: number): boolean {
    return this.nv + v < MAX_VERTS && this.ni + v * 6 < this.I.length;
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, this.nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, this.nv * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, this.nv * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.U.slice(0, this.nv * 2), 2));
    g.setAttribute('aB', new THREE.BufferAttribute(this.B.slice(0, this.nv * 4), 4));
    g.setAttribute('aRoot', new THREE.BufferAttribute(this.A.slice(0, this.nv * 4), 4));
    g.setIndex(new THREE.BufferAttribute(this.I.slice(0, this.ni), 1));
    return g;
  }
}

/** a grid of `rows` rings of `cols` + 1 vertices (the seam doubled for the uv) has been written from `v0`: normals and faces */
function stitch(s: Soup, v0: number, rows: number, cols: number, outward: boolean): void {
  const w = cols + 1;
  const P = s.P,
    N = s.N;
  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < w; i++) {
      const ia = (i + cols - 1) % cols,
        ib = (i + 1) % cols;
      const ka = Math.max(0, k - 1),
        kb = Math.min(rows - 1, k + 1);
      const a = (v0 + k * w + ia) * 3,
        b = (v0 + k * w + ib) * 3,
        c = (v0 + ka * w + (i % cols)) * 3,
        d = (v0 + kb * w + (i % cols)) * 3;
      const ux = P[b] - P[a],
        uy = P[b + 1] - P[a + 1],
        uz = P[b + 2] - P[a + 2];
      const vx = P[d] - P[c],
        vy = P[d + 1] - P[c + 1],
        vz = P[d + 2] - P[c + 2];
      // around × up, turned to face out
      let nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      if (!outward) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      const q = (v0 + k * w + i) * 3;
      N[q] = nx / l;
      N[q + 1] = ny / l;
      N[q + 2] = nz / l;
    }
  }
  let n = s.ni;
  const I = s.I;
  for (let k = 0; k < rows - 1; k++) {
    for (let i = 0; i < cols; i++) {
      const a = v0 + k * w + i,
        b = a + 1,
        c = a + w,
        d = c + 1;
      I[n++] = a;
      I[n++] = c;
      I[n++] = b;
      I[n++] = b;
      I[n++] = c;
      I[n++] = d;
    }
  }
  s.ni = n;
}

const HEIGHTS = [-0.14, 0, 0.025, 0.06, 0.11, 0.18, 0.28, 0.42, 0.62, 0.9, 1.3, 1.8];
const LITE_HEIGHTS = [-0.14, 0.03, 0.14, 0.34, 0.8, 1.5];

function buildTrunk(s: Soup, t: TrunkSpec, gy: (x: number, z: number) => number, seed: number): void {
  const rnd = nearRandom(seed);
  const r0 = t.r0;
  const cols = t.lite ? 12 : r0 > 0.2 ? 32 : r0 > 0.1 ? 24 : 16;
  const y0 = t.base[1];
  const tall = t.top[1] - y0;
  const sc = Math.max(0.6, Math.min(1.7, r0 / 0.2));
  // rings, foot to fork
  const hs: number[] = [];
  for (const h of t.lite ? LITE_HEIGHTS : HEIGHTS) if (h < tall - 0.25) hs.push(h < 0.5 ? h * sc : h);
  for (let h = (hs[hs.length - 1] ?? 0) + 0.7; h < tall - 0.2; h += t.lite ? 1.6 : 0.8) hs.push(h);
  hs.push(tall);
  const rows = hs.length + 1;
  const need = rows * (cols + 1);
  if (!s.room(need + 200)) return;
  // what stands out of the round: root flutes, slow lobes that wander up the stem, a burl or two
  const nR = t.paved ? 3 : Math.max(3, t.roots + (rnd() < 0.5 ? 1 : 0));
  const rA: number[] = [],
    rW: number[] = [],
    rK: number[] = [],
    rH: number[] = [];
  const a0 = rnd() * 6.283;
  for (let i = 0; i < nR; i++) {
    rA.push(a0 + (i / nR) * 6.283 + (rnd() - 0.5) * 0.7);
    rW.push(0.32 + rnd() * 0.3);
    rK.push(t.paved ? 0.1 + rnd() * 0.08 : 0.45 + rnd() * 0.75);
    rH.push(0.1 + rnd() * 0.16);
  }
  const ph1 = rnd() * 6.283,
    ph2 = rnd() * 6.283,
    ph3 = rnd() * 6.283;
  const bA = rnd() * 6.283,
    bH = 0.7 + rnd() * Math.max(0.5, tall - 1.2),
    bS = rnd() < 0.6 ? 0.1 + rnd() * 0.12 : 0;
  const v0 = s.nv;
  const nU = Math.max(1, Math.round((6.283 * r0) / 0.42));
  const uOff = rnd() * 4,
    vOff = rnd() * 4,
    tOff = rnd();
  const P = s.P,
    C = s.C,
    U = s.U,
    B = s.B;
  const [ax, ay, az] = t.base;
  const [cx, cy, cz] = t.ctl;
  const [bx, by, bz] = t.top;
  let q = v0;
  for (let k = 0; k < rows; k++) {
    // the last ring closes over the fork
    const closing = k === rows - 1;
    const h = closing ? tall + t.rTop * (t.lite ? 1.3 : 0.35) : hs[k];
    const f = Math.max(0, Math.min(1, h / tall));
    const u1 = 1 - f;
    const qx = u1 * u1 * ax + 2 * u1 * f * cx + f * f * bx,
      qz = u1 * u1 * az + 2 * u1 * f * cz + f * f * bz;
    const qy = u1 * u1 * ay + 2 * u1 * f * cy + f * f * by;
    const hp = Math.max(0, h);
    const flareK = Math.exp(-hp / (0.26 * sc));
    const rootK = hp / sc;
    let rb = t.r0 + (t.rTop - t.r0) * f;
    rb *= t.lite ? 1 + 0.72 * Math.pow(1 - Math.min(1, hp / tall), 6) : 1 + (t.flare - 1) * flareK;
    rb *= 1 - (t.lite ? 0.2 : 0.14) * Math.max(0, f - 0.8) / 0.2;
    if (closing) rb *= 0.22;
    const lobeK = 0.55 + 0.45 * Math.min(1, Math.exp(-hp * 0.5) + 0.25);
    for (let i = 0; i <= cols; i++) {
      const th = ((i % cols) / cols) * 6.283185;
      let rr = rb * (1 + lobeK * (0.05 * Math.sin(3 * th + ph1 + 0.35 * hp) + 0.028 * Math.sin(5 * th + ph2 - 0.6 * hp) + 0.014 * Math.sin(9 * th + ph3 + 1.2 * hp)));
      let flute = 0;
      for (let j = 0; j < nR; j++) {
        let d = th - rA[j];
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const gw = rW[j] * (0.75 + 0.5 * Math.min(1, rootK * 3));
        const g = Math.exp(-(d * d) / (gw * gw));
        flute = Math.max(flute, g);
        rr += r0 * rK[j] * g * Math.exp(-rootK / rH[j]);
      }
      if (bS > 0) {
        let d = th - bA;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const dh = (hp - bH) / 0.22;
        rr += r0 * bS * Math.exp(-(d * d) / 0.18 - dh * dh);
      }
      if (t.limit > 0) rr = Math.min(rr, t.limit);
      const x = qx + Math.cos(th) * rr,
        z = qz + Math.sin(th) * rr;
      // the foot goes with the ground; above it the stem goes its own way
      let y = y0 + h + (qy - (y0 + f * tall));
      if (hp < 0.5 && !t.paved) {
        const gk = 1 - hp / 0.5;
        y += (gy(x, z) - y0) * gk * gk;
      }
      const w = q * 3;
      P[w] = x;
      P[w + 1] = y;
      P[w + 2] = z;
      // occlusion: the valleys between roots, the ground
      const ao = Math.min(1, 0.66 + 0.34 * Math.min(1, hp / 0.55) + 0.2 * flute * Math.min(1, hp / 0.12 + 0.4));
      C[w] = t.r * ao;
      C[w + 1] = t.g * ao;
      C[w + 2] = t.b * ao;
      const uw = q * 2;
      U[uw] = uOff + (i / cols) * nU;
      U[uw + 1] = vOff + h / 0.95;
      const bw = q * 4;
      B[bw] = t.bark;
      B[bw + 1] = t.moss;
      B[bw + 2] = hp;
      B[bw + 3] = tOff;
      s.A[bw] = ax;
      s.A[bw + 1] = ay;
      s.A[bw + 2] = az;
      s.A[bw + 3] = t.H;
      q++;
    }
  }
  s.nv = q;
  stitch(s, v0, rows, cols, true);
  if (!t.paved && !t.lite) for (let j = 0; j < nR; j++) if (rK[j] > 0.72) surfaceRoot(s, t, gy, rA[j], rK[j], rnd);
}

/** the root goes on past the flute, half in the ground, flat, thinner, wandering as it goes */
function surfaceRoot(s: Soup, t: TrunkSpec, gy: (x: number, z: number) => number, a: number, k: number, rnd: () => number): void {
  const SEG = 7,
    SIDES = 8;
  const rows = SEG + 1;
  if (!s.room(rows * (SIDES + 1))) return;
  const v0 = s.nv;
  const P = s.P,
    C = s.C,
    U = s.U,
    B = s.B;
  const r0 = t.r0;
  const len = r0 * (1.6 + rnd() * 2.4) + 0.3;
  let px = t.base[0] + Math.cos(a) * r0 * (0.3 + k * 0.35),
    pz = t.base[2] + Math.sin(a) * r0 * (0.3 + k * 0.35);
  let dir = a;
  const w1 = 0.6 + rnd() * 0.8,
    w2 = rnd() * 6.28,
    wa = 0.25 + rnd() * 0.35;
  const rr0 = r0 * (0.1 + 0.08 * k);
  let q = v0;
  const uOff = rnd() * 4;
  for (let k2 = 0; k2 < rows; k2++) {
    const f = k2 / SEG;
    const rr = Math.max(0.004, rr0 * (1 - f * f * 0.82));
    const ca = -Math.sin(dir),
      sa = Math.cos(dir);
    const g = gy(px, pz);
    // lies half in the ground, then dives
    const cy = g - rr * 0.2 - f * f * f * rr0 * 1.6;
    for (let i = 0; i <= SIDES; i++) {
      const th = ((i % SIDES) / SIDES) * 6.283185;
      const ox = Math.cos(th) * rr * 1.25,
        oy = Math.sin(th) * rr * 0.7;
      const w = q * 3;
      P[w] = px + ca * ox;
      P[w + 1] = cy + oy;
      P[w + 2] = pz + sa * ox;
      const ao = 0.34 + 0.36 * Math.max(0, Math.sin(th));
      C[w] = t.r * ao;
      C[w + 1] = t.g * ao;
      C[w + 2] = t.b * ao;
      U[q * 2] = uOff + (i / SIDES) * 0.35;
      U[q * 2 + 1] = uOff + f * len;
      B[q * 4] = t.bark === BARK.PLANE ? BARK.SMOOTH : t.bark === BARK.BIRCH ? BARK.FURROW : t.bark;
      B[q * 4 + 1] = t.moss;
      B[q * 4 + 2] = 0.16 + 0.1 * Math.sin(th);
      B[q * 4 + 3] = 0.3;
      s.A[q * 4 + 3] = 0;
      q++;
    }
    dir = a + wa * Math.sin(w1 * f * 3.14 + w2);
    px += Math.cos(dir) * (len / SEG);
    pz += Math.sin(dir) * (len / SEG);
  }
  s.nv = q;
  stitch(s, v0, rows, SIDES, false);
}

/** a limb out of the fork: a smooth arc with its own rings, so the bark goes on up past where the eye stops */
function buildLimb(s: Soup, t: TrunkSpec, seed: number): void {
  const rnd = nearRandom(seed);
  const ROWS = 6,
    cols = t.r0 > 0.1 ? 10 : 7;
  if (!s.room(ROWS * (cols + 1))) return;
  const v0 = s.nv;
  const P = s.P,
    C = s.C,
    U = s.U,
    B = s.B;
  const [ax, ay, az] = t.base;
  const [cx, cy, cz] = t.ctl;
  const [bx, by, bz] = t.top;
  const nU = Math.max(1, Math.round((6.283 * t.r0) / 0.42));
  const uOff = rnd() * 4,
    vOff = rnd() * 4,
    tOff = rnd();
  const [rx, ry, rz] = t.root ?? t.base;
  let q = v0;
  let arc = 0,
    lx = ax,
    ly = ay,
    lz = az;
  for (let k = 0; k < ROWS; k++) {
    const f = k / (ROWS - 1);
    const u1 = 1 - f;
    const x = u1 * u1 * ax + 2 * u1 * f * cx + f * f * bx,
      y = u1 * u1 * ay + 2 * u1 * f * cy + f * f * by,
      z = u1 * u1 * az + 2 * u1 * f * cz + f * f * bz;
    let dx = 2 * u1 * (cx - ax) + 2 * f * (bx - cx),
      dy = 2 * u1 * (cy - ay) + 2 * f * (by - cy),
      dz = 2 * u1 * (cz - az) + 2 * f * (bz - cz);
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    // a frame across the axis
    const up = Math.abs(dy) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    let e1x = up[1] * dz - up[2] * dy,
      e1y = up[2] * dx - up[0] * dz,
      e1z = up[0] * dy - up[1] * dx;
    const el = Math.hypot(e1x, e1y, e1z) || 1;
    e1x /= el;
    e1y /= el;
    e1z /= el;
    const e2x = dy * e1z - dz * e1y,
      e2y = dz * e1x - dx * e1z,
      e2z = dx * e1y - dy * e1x;
    const rr = t.r0 + (t.rTop - t.r0) * f;
    arc += Math.hypot(x - lx, y - ly, z - lz);
    lx = x;
    ly = y;
    lz = z;
    for (let i = 0; i <= cols; i++) {
      const th = ((i % cols) / cols) * 6.283185;
      const c = Math.cos(th),
        sn = Math.sin(th);
      const w = q * 3;
      P[w] = x + (e1x * c + e2x * sn) * rr;
      P[w + 1] = y + (e1y * c + e2y * sn) * rr;
      P[w + 2] = z + (e1z * c + e2z * sn) * rr;
      C[w] = t.r;
      C[w + 1] = t.g;
      C[w + 2] = t.b;
      U[q * 2] = uOff + (i / cols) * nU;
      U[q * 2 + 1] = vOff + arc / 0.95;
      B[q * 4] = t.bark;
      B[q * 4 + 1] = t.moss;
      B[q * 4 + 2] = y - ry;
      B[q * 4 + 3] = tOff;
      s.A[q * 4] = rx;
      s.A[q * 4 + 1] = ry;
      s.A[q * 4 + 2] = rz;
      s.A[q * 4 + 3] = t.H;
      q++;
    }
  }
  s.nv = q;
  stitch(s, v0, ROWS, cols, true);
}

/** the skin of a country tree: the same trunk a little wider, so the instanced one stays inside */
function landSpec(list: TreeList, i: number, gy: (x: number, z: number) => number): TrunkSpec {
  const t = landTrunk(list, i);
  const x = list.x[i],
    z = list.z[i],
    y = gy(x, z);
  const r = t.r * 1.2;
  const bark = t.kind === KIND.pine || t.kind === KIND.conifer ? BARK.PINE : t.kind === KIND.small || t.kind === KIND.olive ? BARK.SMOOTH : BARK.FURROW;
  const pine = t.kind === KIND.pine;
  const olive = t.kind === KIND.olive;
  const v = 0.85 + 0.3 * list.tint[i];
  return {
    id: -1,
    base: [x, y, z],
    ctl: [x, y + t.top * 0.5, z],
    top: [x + t.dx, y + t.top, z + t.dz],
    r0: r,
    rTop: r * 0.72,
    flare: 1.75,
    roots: 3,
    H: 0,
    paved: false,
    limit: 0,
    bark,
    moss: t.kind === KIND.oak || t.kind === KIND.broad ? 0.35 : 0.15,
    lite: true,
    r: (pine ? 0.21 : olive ? 0.2 : 0.16) * v,
    g: (pine ? 0.12 : olive ? 0.18 : 0.133) * v,
    b: (pine ? 0.075 : olive ? 0.15 : 0.105) * v,
  };
}

/** add the layer; returns a per-frame update for the tubes' swap */
export function addTrunks(ctx: CityContext, tiles: BarkTiles, specs: TrunkSpec[], swap: ((id: number, on: boolean) => void) | null, flush: (() => void) | null, landList: TreeList | null): (() => void) | null {
  if (!closeNature(ctx, 'closetrunks')) return null;
  const near = nearOf(ctx);
  const terrain = ctx.services.terrain as { height(x: number, z: number): number } | undefined;
  const land = ctx.services.landscape as { height(x: number, z: number): number } | undefined;
  const { x0, x1, z0, z1 } = ctx.plan.slab;
  const gy = (x: number, z: number): number => {
    if (terrain && x > x0 && x < x1 && z > z0 && z < z1) return terrain.height(x, z);
    return land ? land.height(x, z) : (terrain?.height(x, z) ?? 0);
  };
  // the trunks by cell
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  const byCell = new Map<number, TrunkSpec[]>();
  for (const t of specs) {
    const k = key(Math.floor(t.base[0] / CELL), Math.floor(t.base[2] / CELL));
    let a = byCell.get(k);
    if (!a) byCell.set(k, (a = []));
    a.push(t);
  }
  // the country's are made when their cell is
  const landByCell = new Map<number, number[]>();
  if (landList && closeNature(ctx, 'closelandtrunks')) {
    for (let t = 0; t < landList.n; t++) {
      const k = key(Math.floor(landList.x[t] / CELL), Math.floor(landList.z[t] / CELL));
      let a = landByCell.get(k);
      if (!a) landByCell.set(k, (a = []));
      a.push(t);
    }
  }
  const soup = new Soup();
  const active = new Set<TrunkSpec>();
  const swapped = new Set<TrunkSpec>();
  const stand = new THREE.BufferGeometry();
  stand.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  stand.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  stand.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  stand.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
  stand.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(12), 4));
  stand.setAttribute('aRoot', new THREE.BufferAttribute(new Float32Array(12), 4));
  near.addMeshes({
    name: 'closetrunks',
    radius: RADIUS,
    cell: CELL,
    top: 14,
    material: barkMaterial(ctx, tiles),
    standIn: stand,
    onShow: (c: NearCell, on: boolean) => {
      const a = byCell.get(key(c.i, c.j));
      if (!a) return;
      for (const t of a) {
        if (on) active.add(t);
        else active.delete(t);
      }
    },
    build: (c: NearCell) => {
      const a = byCell.get(key(c.i, c.j));
      const b = landList ? landByCell.get(key(c.i, c.j)) : undefined;
      if (!a && !b) return null;
      soup.reset();
      // the same tree whichever cell order: from its own place
      const seedOf = (t: TrunkSpec) => (Math.imul(Math.round(t.base[0] * 100), 73856093) ^ Math.imul(Math.round(t.base[2] * 100), 19349663)) >>> 0;
      if (a) {
        for (const t of a) {
          if (t.limb) buildLimb(soup, t, seedOf(t));
          else buildTrunk(soup, t, gy, seedOf(t));
        }
      }
      if (b && landList) {
        for (const i of b) {
          const t = landSpec(landList, i, gy);
          buildTrunk(soup, t, gy, seedOf(t));
        }
      }
      return soup.nv ? soup.geometry() : null;
    },
  });
  if (!swap) return null;
  const R2 = (t: TrunkSpec, x: number, y: number, z: number): number => (t.base[0] - x) ** 2 + (t.base[1] - y) ** 2 + (t.base[2] - z) ** 2;
  return () => {
    const e = ctx.camera.position;
    const lim = RADIUS * SWAP * nearLens.value;
    const l2 = lim * lim;
    let changed = false;
    for (const t of swapped) {
      if (!active.has(t) || R2(t, e.x, e.y, e.z) > l2 * 1.1) {
        swapped.delete(t);
        swap(t.id, false);
        changed = true;
      }
    }
    for (const t of active) {
      if (t.id >= 0 && !swapped.has(t) && R2(t, e.x, e.y, e.z) < l2) {
        swapped.add(t);
        swap(t.id, true);
        changed = true;
      }
    }
    if (changed) flush?.();
  };
}
