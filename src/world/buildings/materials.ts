// Materials for the buildings module.
//
//  shell  — walls + roofs (MeshStandardMaterial + onBeforeCompile):
//           procedural window grids with frames / muntins / curtain walls / shop
//           windows, fake interiors ("interior mapping") with per-room night lighting
//           that follows the clock; a stylised reflection model for glass (sky gradient
//           + sun glow + cloud streaks, per-facade horizon, reflected skyline and
//           neighbour silhouettes, per-panel "oil-canning", sun glint streaks, Fresnel);
//           macro weathering of walls (dirt under copings / cornices washing down in
//           streaks, rain streaks under sills, splash zone, corner darkening, per-floor
//           drift); far-field night glow (window blocks switch together so districts keep
//           contrast when windows are sub-pixel); roof tile / slate / membrane / gravel /
//           metal / skylight patterns with weathering; night street-lamp light (lampLight).
//  trim   — vertex-coloured details (cornices, sills, shutters, railings…) + lamp light
//  lights — unlit emissive bits (aviation lights, lamps, neon) with blink modes
//  signs  — canvas-atlas signage, letters glow at night
//
// Vertex attribute layout of the shell material:
//   uv  wall: window-grid cell coordinates (u along the wall, v up)   roof: metres along ridge / slope
//   aA  wall: window rect inside a cell in metres (x0, x1, y0, y1)    roof: (pattern, seed, 0, 0)
//   aB  (ncols, nrows, seed, kind)   kind = mode*64 + style*8 + profile   (mode 0 wall, 1 roof)
//   aC  wall: (cellW, cellH, wallPattern, frameIdx + 8*glassIdx)      roof: (0, 0, 0, 0)
//   aD  wall quads (Builder.wall): (metres from the quad's left end, quad length, world y of the
//        quad top, flags = 1 + 2·leftCorner + 4·rightCorner);  0 = no wall info (roofs, gables…)
//
// URL switches (read in buildings.ts): ?legacyfacade = the original shell shader (A/B).

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { LEGACY_SHELL_FRAG_PARS, LEGACY_SHELL_FRAG_MAIN } from './legacyShell';

export const WIN = {
  /** single pane + frame */
  PLAIN: 0,
  /** frame + cross muntins (houses, townhouses) */
  MUNTIN: 1,
  /** curtain wall: glass panel per cell, thin mullions, spandrel band */
  CURTAIN: 2,
  /** ribbon window band */
  RIBBON: 3,
  /** industrial steel multi-pane */
  INDUSTRIAL: 4,
  /** arched top with muntins */
  ARCHED: 5,
  /** shop display window (kick plate + transom) */
  SHOP: 6,
  /** glass door / lobby glazing */
  DOOR: 7,
} as const;

export const PROF = {
  HOME: 0,
  OFFICE: 1,
  SHOP: 2,
  HOTEL: 3,
  INDUSTRIAL: 4,
  ALWAYS: 5,
  SCHOOL: 6,
  NEVER: 7,
} as const;

export const WALLPAT = {
  PLASTER: 0,
  BRICK: 1,
  CORRUGATED: 2,
  SIDING: 3,
  STONE: 4,
  PANELS: 5,
  SMOOTH: 6,
} as const;

/** Shop interior type for the facade shader (bhShop), from the name on the sign; wall pattern + 16 × type
 *  on WIN.SHOP windows. 1 café/bar, 2 bakery/deli, 3 books, 4 florist/grocer, 5 fashion, 6 pharmacy/
 *  hardware/optician, 7 gallery/antiques/toys, 8 office lobby (banks). Type 0 = a random one. */
export function shopType(name: string): number {
  if (/Bank/.test(name)) return 8;
  if (/Café|Bistro|Wine|Tea|Pizzeria|Fish|Anchor|Pub|Gelato|Ice|Espresso|Coffee/.test(name)) return 1;
  if (/Bakery|Pâtisserie|Chocolates|Cheese|Deli|Butcher/.test(name)) return 2;
  if (/Books|Records|Stationery|Bookbinder/.test(name)) return 3;
  if (/Florist|Greengrocer/.test(name)) return 4;
  if (/Shoes|Hat|Tailor|Barber|Boutique/.test(name)) return 5;
  if (/Pharmacy|Hardware|Post|Bike|Optic/.test(name)) return 6;
  return 7;
}

export const ROOFPAT = {
  FLAT: 0,
  TILES: 1,
  SLATE: 2,
  SEAM: 3,
  CORRUGATED: 4,
  COPPER: 5,
  SKYLIGHT: 6,
  DECK: 7,
} as const;

/** Frame colour palette (index into uFrameCols). */
export const FRAME = { WHITE: 0, DARK: 1, GREEN: 2, WOOD: 3, BLACK: 4, CREAM: 5, TEAL: 6, ALU: 7 } as const;
/** Glass tint palette (index into uGlassCols). */
export const GLASS = { NEUTRAL: 0, BLUE: 1, LIGHT: 2, DEEP: 3, GREEN: 4, STEEL: 5, BRONZE: 6, DARK: 7 } as const;

const FRAME_COLS = ['#f3efe6', '#2e3a44', '#2f4a3a', '#5a3d2b', '#1f2226', '#e6dbc2', '#2a6f74', '#aab3ba'];
const GLASS_COLS = ['#a3b9c6', '#6aa6d6', '#8cc4e0', '#4a84b8', '#6cbcae', '#7395b5', '#b88f5c', '#465868'];

export const LIGHT_MODE = { STEADY: 0, BLINK: 1, NEON: 2, ALWAYS: 3, PULSE: 4 } as const;

export interface BuildingMaterials {
  shell: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  lights: THREE.MeshBasicMaterial;
  signs: THREE.MeshStandardMaterial;
  /** shared procedural noise texture (facade / roof weathering, reflections) */
  noise: THREE.DataTexture;
  /** true when ?legacyfacade selected the original shell shader */
  legacy: boolean;
  /** module-owned uniforms (update every frame) */
  uniforms: {
    uHours: { value: number };
    uSkyZen: { value: THREE.Color };
    uSkyHor: { value: THREE.Color };
    uGround: { value: THREE.Color };
    uDetail: { value: number };
    /** warm horizon glow toward the sun (colour × strength) */
    uSkyGlow: { value: THREE.Color };
    /** direct sun radiance for glints (0 when the sun is down) */
    uSunCol: { value: THREE.Color };
    /** radiance of the (reflected) surrounding city */
    uCityCol: { value: THREE.Color };
    /** lit cloud colour for reflected cloud streaks */
    uCloudCol: { value: THREE.Color };
    /** stylised horizon lift of reflections (follows the camera tilt) */
    uReflLift: { value: number };
    /** 0 off, 1 weathering mask, 2 wall-quad info (diagnostics via ctx.services.buildings.setDebug) */
    uBhDebug: { value: number };
    /** 1 = eye-level wear masks on (damp, algae, peeling render, roof age / moss); ?nowear sets 0 */
    uWear: { value: number };
    uWinDepth: { value: number };
    uWallRelief: { value: number };
    uPlinth: { value: number };
    /** near-LOD sill geometry: (centre of its range, range m); the shader drops its own sill box inside */
    uGeoWin: { value: THREE.Vector4 };
  };
}

// ─────────────────────────────────────────────────────── noise texture ──
//
// 256² RGBA8, tileable, mip-mapped (so every use is box-filtered for free at distance):
//   r  macro value-noise fbm (4 lattice cells across)      g  mid fbm (16 cells across)
//   b  streak field: 64 cells across in u, 2 in v — sampled stretched it gives vertical streaks
//   a  fine grain (64 cells across)
// Scale rule: for a feature size of S metres on a channel with n cells across, uv = metres / (n·S).

function hash3(x: number, y: number, s: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function makeNoiseTexture(): THREE.DataTexture {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const chan = new Float32Array(N * N);
  // tileable value noise with lattice px × py over the texture
  const vnoise = (u: number, v: number, px: number, py: number, s: number): number => {
    const x = u * px,
      y = v * py;
    const xi = Math.floor(x),
      yi = Math.floor(y);
    let fx = x - xi,
      fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % px) + px) % px,
      x1 = (x0 + 1) % px,
      y0 = ((yi % py) + py) % py,
      y1 = (y0 + 1) % py;
    const a = hash3(x0, y0, s),
      b = hash3(x1, y0, s),
      c = hash3(x0, y1, s),
      d = hash3(x1, y1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fill = (k: number, f: (u: number, v: number) => number) => {
    let lo = Infinity,
      hi = -Infinity;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const val = f((i + 0.5) / N, (j + 0.5) / N);
        chan[j * N + i] = val;
        if (val < lo) lo = val;
        if (val > hi) hi = val;
      }
    const sc = 1 / Math.max(1e-6, hi - lo);
    for (let p = 0; p < N * N; p++) data[p * 4 + k] = Math.round(Math.min(1, Math.max(0, (chan[p] - lo) * sc)) * 255);
  };
  fill(0, (u, v) => 0.5 * vnoise(u, v, 4, 4, 11) + 0.27 * vnoise(u, v, 8, 8, 12) + 0.15 * vnoise(u, v, 16, 16, 13) + 0.08 * vnoise(u, v, 32, 32, 14));
  fill(1, (u, v) => 0.55 * vnoise(u, v, 16, 16, 21) + 0.3 * vnoise(u, v, 32, 32, 22) + 0.15 * vnoise(u, v, 64, 64, 23));
  fill(2, (u, v) => {
    // streaks: mostly 1-D in u (two octaves), weakly modulated along v
    const s = 0.55 * vnoise(u, v, 64, 2, 31) + 0.3 * vnoise(u, v, 128, 3, 32) + 0.15 * vnoise(u, v, 32, 4, 33);
    return s * s;
  });
  fill(3, (u, v) => 0.6 * vnoise(u, v, 64, 64, 41) + 0.4 * vnoise(u, v, 128, 128, 42));
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = 'buildings-noise';
  tex.needsUpdate = true;
  return tex;
}

// ─────────────────────────────────────────────────────────── GLSL ──

const SHELL_VERT_PARS = /* glsl */ `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aD;
varying vec2 vFac;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
varying vec3 vWPos;
varying vec3 vWNrm;
`;

const SHELL_VERT_MAIN = /* glsl */ `
vFac = uv;
vA = aA;
vB = aB;
vC = aC;
vD = aD;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);
`;

const COMMON_FRAG = /* glsl */ `
uniform float uHours;
uniform float uTime;
uniform float uRealTime;
uniform float uNight;
uniform float uDaylight;
uniform float uDusk;
uniform float uLights;
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uGround;
uniform float uDetail;
uniform vec3 uFrameCols[8];
uniform vec3 uGlassCols[8];

float bhHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float bhHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float bhBump(float h, float a, float b, float c, float d) {
  return smoothstep(a, b, h) * (1.0 - smoothstep(c, d, h));
}
// probability that a room of this profile has its light on at hour h
float bhOccupancy(float h, float prof) {
  float he = h < 12.0 ? h + 24.0 : h;
  float p = 0.0;
  if (prof < 0.5) p = 0.05 + 0.26 * bhBump(h, 5.4, 6.4, 7.6, 8.6) + 0.08 * bhBump(h, 8.5, 9.5, 16.0, 17.0) + 0.56 * bhBump(he, 16.6, 19.4, 22.4, 25.2);
  else if (prof < 1.5) p = 0.05 + 0.86 * bhBump(h, 6.6, 8.2, 17.4, 21.2) + 0.2 * bhBump(he, 18.0, 19.0, 22.8, 24.2);
  else if (prof < 2.5) p = 0.05 + 0.92 * bhBump(h, 7.0, 8.0, 21.6, 22.3) + 0.22 * bhBump(he, 21.6, 22.0, 23.8, 25.8);
  else if (prof < 3.5) p = 0.14 + 0.18 * bhBump(h, 6.0, 7.0, 9.0, 10.0) + 0.58 * bhBump(he, 17.4, 19.6, 23.4, 25.8);
  else if (prof < 4.5) p = 0.28 + 0.6 * bhBump(h, 5.5, 6.5, 18.0, 20.0);
  else if (prof < 5.5) p = 1.0;
  else if (prof < 6.5) p = 0.03 + 0.85 * bhBump(h, 7.0, 7.7, 16.0, 18.4);
  return p;
}
`;

const SHELL_FRAG_PARS = /* glsl */ `
varying vec2 vFac;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
varying vec3 vWPos;
varying vec3 vWNrm;
${COMMON_FRAG}
uniform sampler2D uBhNoise;
uniform vec3 uSkyGlow;
uniform vec3 uSunCol;
uniform vec3 uCityCol;
uniform vec3 uCloudCol;
uniform vec3 uSunDir;
uniform float uReflLift;
uniform float uBhDebug;
uniform float uWear;
uniform float uWinDepth;
uniform float uWallRelief;
uniform float uPlinth;
uniform vec4 uGeoWin;
// world-space normal override from bhWall (window reveals, sills, wall relief); zero = keep the geometric normal
vec3 bhNW = vec3(0.0);
float plinthF = 0.0;
${LAMP_GLSL}

// box-filtered square wave: fraction of [x - w/2, x + w/2] where fract(x) > 0.5
float bhStripeI(float t) { return floor(t) * 0.5 + max(fract(t) - 0.5, 0.0); }
float bhStripe(float x, float w) {
  w = max(w, 1e-4);
  return (bhStripeI(x + 0.5 * w) - bhStripeI(x - 0.5 * w)) / w;
}
// box-filtered thin line at the integers of x (half-width hw, footprint w, all in x units)
float bhLine(float x, float hw, float w) {
  float d = abs(fract(x + 0.5) - 0.5);
  float ww = max(w, 1e-4);
  float lo = max(d - 0.5 * ww, -hw), hi = min(d + 0.5 * ww, hw);
  return mix(max(hi - lo, 0.0) / ww, 2.0 * hw, smoothstep(0.5, 1.0, ww));
}

// brick layout per building bond: stretcher (running) bond, Flemish (stretcher + header in every course) or
// English (alternate header / stretcher courses). Returns (x in brick, y in course, brick length, course) in
// metres; id = brick id.
vec4 bhBrick(vec2 q, float seed, out vec2 id) {
  float ch = 0.075;
  float row = floor(q.y / ch);
  float bond = fract(seed * 0.4371);
  float odd = mod(row, 2.0);
  float len = 0.235;
  float off = odd * 0.5;
  if (bond > 0.75) { len = odd > 0.5 ? 0.1175 : 0.235; off = odd * 0.25; }
  else if (bond > 0.5) { len = 0.3525; off = odd * 0.5 + 0.16; }
  float bx = q.x / len + off;
  float col = floor(bx);
  float fx = fract(bx) * len;
  float lb = len;
  if (bond > 0.5 && bond <= 0.75) {
    if (fx > 0.235) { fx -= 0.235; lb = 0.1175; col += 0.5; } else lb = 0.235;
  }
  id = vec2(col, row);
  return vec4(fx, fract(q.y / ch) * ch, lb, ch);
}
// brick face height (1) vs the recessed joint (0), arrises rounded over ~4 mm
float bhBrickH(vec4 bl) {
  float d = min(min(bl.x, bl.z - bl.x), min(bl.y, bl.w - bl.y));
  return smoothstep(0.004, 0.0085, d);
}
float bhStoneH(vec2 q) {
  float ch = 0.62;
  float row = floor(q.y / ch);
  float fy = fract(q.y / ch) * ch;
  float fx = fract(q.x / 1.25 + mod(row, 2.0) * 0.5) * 1.25;
  float d = min(min(fx, 1.25 - fx), min(fy, ch - fy));
  // chamfered joint, then a slightly pillowed (hand-dressed) face
  return smoothstep(0.006, 0.022, d) * (0.85 + 0.15 * smoothstep(0.02, 0.2, d));
}
float bhPanelH(vec2 q) {
  vec2 fg = fract(q / vec2(3.0, 1.6)) * vec2(3.0, 1.6);
  float d = min(min(fg.x, 3.0 - fg.x), min(fg.y, 1.6 - fg.y));
  return smoothstep(0.012, 0.028, d);
}
// surface relief of the wall as a slope (dh/du, dh/dy) of the outward displacement, faded to 0 where the
// structure is unresolved. Brick joints, ashlar chamfers, panel joints, lap boards, corrugation ribs and
// render trowel marks — they catch the light instead of being painted on.
vec2 bhWallSlope(float pat, vec2 q, float seed, vec2 fq, vec2 so) {
  float fp = max(fq.x, fq.y);
  vec2 s = vec2(0.0);
  if (pat < 0.5) { // render: trowel undulation + grit
    float e = 0.02;
    vec2 uq = q * 0.3 + so.yx;
    float h0 = texture2D(uBhNoise, uq).a;
    float hx = texture2D(uBhNoise, uq + vec2(e * 0.3, 0.0)).a, hy = texture2D(uBhNoise, uq + vec2(0.0, e * 0.3)).a;
    vec2 tq = q * vec2(0.045, 0.07) + so;
    float t0 = texture2D(uBhNoise, tq).g;
    float tx = texture2D(uBhNoise, tq + vec2(0.0045, 0.0)).g, ty = texture2D(uBhNoise, tq + vec2(0.0, 0.007)).g;
    s = vec2(hx - h0, hy - h0) / e * 0.004 * (1.0 - smoothstep(0.004, 0.012, fp))
      + vec2(tx - t0, ty - t0) / 0.1 * 0.03 * (1.0 - smoothstep(0.02, 0.06, fp));
  } else if (pat < 1.5) {
    float e = 0.0022;
    vec2 id;
    float h0 = bhBrickH(bhBrick(q, seed, id));
    float hx = bhBrickH(bhBrick(q + vec2(e, 0.0), seed, id)), hy = bhBrickH(bhBrick(q + vec2(0.0, e), seed, id));
    bhBrick(q, seed, id);
    float bn = bhHash12(id + seed * 1.7);
    s = (vec2(hx - h0, hy - h0) / e * 0.006 + (vec2(bn, fract(bn * 7.7)) - 0.5) * 0.06 * h0) * (1.0 - smoothstep(0.003, 0.008, fp));
  } else if (pat < 2.5) { // corrugated sheet: 32 mm deep ribs every 0.32 m
    s = vec2(0.016 * 6.2832 / 0.32 * cos(q.x * 6.2832 / 0.32), 0.0) * (1.0 - smoothstep(0.03, 0.09, fp));
  } else if (pat < 3.5) { // lap boards: each board leans out toward its lower edge
    float fy = fract(q.y / 0.3);
    s = vec2(0.0, -0.08 + 0.9 * (1.0 - smoothstep(0.0, 0.05, fy)) * step(fy, 0.05)) * (1.0 - smoothstep(0.01, 0.04, fp));
  } else if (pat < 4.5) {
    float e = 0.004;
    float h0 = bhStoneH(q);
    s = vec2(bhStoneH(q + vec2(e, 0.0)) - h0, bhStoneH(q + vec2(0.0, e)) - h0) / e * 0.012 * (1.0 - smoothstep(0.006, 0.02, fp));
  } else if (pat < 5.5) {
    float e = 0.004;
    float h0 = bhPanelH(q);
    s = vec2(bhPanelH(q + vec2(e, 0.0)) - h0, bhPanelH(q + vec2(0.0, e)) - h0) / e * 0.012 * (1.0 - smoothstep(0.008, 0.025, fp));
  }
  return s;
}

// albedo multiplier of the wall surface pattern; q = (along wall, height) in metres, fq = fwidth(q).
// Fine structure fades to its own mean when unresolved; a mid-scale tonal variation (±8–12 %) stays
// so walls don't flatten out at 100–300 m.
vec3 bhWallPattern(float pat, vec2 q, float seed, vec2 fq, vec4 nm, float grain) {
  vec3 res = vec3(0.985 + 0.03 * nm.g); // smooth metal / glass spandrel
  if (pat < 0.5) { // plaster / render: soft blotches + stucco grain (grain is mip-filtered)
    res = vec3((0.9 + 0.2 * nm.g) * (0.955 + 0.09 * grain));
  } else if (pat < 1.5) { // brick: real 215 × 65 mm bricks in 10 mm joints, bond per building
    vec2 bid;
    vec4 bl = bhBrick(q, seed, bid);
    float aa = clamp(fq.y / 0.075 * 2.0, 0.0, 1.0);
    float mortar = 1.0 - bhBrickH(bl);
    float bn = bhHash12(bid + seed);
    vec3 brick = vec3(0.8 + 0.34 * bn) * mix(vec3(1.0), vec3(0.9, 0.92, 0.98), step(0.82, fract(bn * 7.31)));
    // Flemish bond: some buildings use dark burnt headers
    if (bl.z < 0.12 && fract(seed * 0.4371) > 0.5 && fract(seed * 0.4371) <= 0.75 && fract(seed * 0.913) > 0.5) brick *= vec3(0.62, 0.6, 0.66);
    // chipped arrises: small pale-mortar-coloured bites at some brick corners
    float chip = step(0.86, fract(bn * 13.7)) * (1.0 - smoothstep(0.012, 0.02, min(bl.x, bl.z - bl.x) + bl.y));
    brick = mix(brick, vec3(1.1), chip * 0.6);
    brick = mix(brick, vec3(1.3, 1.27, 1.22) * (0.94 + 0.12 * grain), mortar);
    res = mix(brick, vec3(1.03), aa) * (0.89 + 0.22 * nm.g);
  } else if (pat < 2.5) { // corrugated metal: vertical ribs
    float aa = clamp(fq.x / 0.32 * 2.0, 0.0, 1.0);
    float rib = 0.84 + 0.18 * sin(q.x * 6.2832 / 0.32);
    res = vec3(mix(rib, 0.93, aa) * (0.9 + 0.2 * nm.g));
  } else if (pat < 3.5) { // timber siding: horizontal boards with shadow lines
    float bh = 0.3;
    float fy = fract(q.y / bh);
    float aa = clamp(fq.y / bh * 2.0, 0.0, 1.0);
    float board = mix(0.7, 1.0, smoothstep(0.0, 0.2, fy)) * (0.9 + 0.16 * bhHash12(vec2(floor(q.y / bh), floor(q.x / 3.7)) + seed));
    res = vec3(mix(board, 0.93, aa) * (0.91 + 0.18 * nm.g));
  } else if (pat < 4.5) { // ashlar stone blocks
    float ch = 0.62;
    float row = floor(q.y / ch);
    float fy = fract(q.y / ch);
    float bx = q.x / 1.25 + mod(row, 2.0) * 0.5;
    float fx = fract(bx);
    float aa = clamp(fq.y / ch * 2.5, 0.0, 1.0);
    float joint = max(1.0 - smoothstep(0.0, 0.05, fy), 1.0 - smoothstep(0.0, 0.025, min(fx, 1.0 - fx)));
    float sn = bhHash12(vec2(floor(bx), row) + seed);
    res = vec3(mix((0.9 + 0.16 * sn) * mix(1.0, 0.78, joint), 0.96, aa) * (0.91 + 0.18 * nm.g));
  } else if (pat < 5.5) { // concrete panels with joints and per-panel tone
    vec2 gg = q / vec2(3.0, 1.6);
    vec2 fg = fract(gg);
    float aa = clamp(fq.y / 1.6 * 3.0, 0.0, 1.0);
    float joint = max(1.0 - smoothstep(0.0, 0.03, min(fg.y, 1.0 - fg.y)), 1.0 - smoothstep(0.0, 0.016, min(fg.x, 1.0 - fg.x)));
    float pn = bhHash12(floor(gg) + seed);
    res = vec3(mix((0.93 + 0.12 * pn) * mix(1.0, 0.8, joint), 0.97, aa) * (0.92 + 0.16 * nm.g));
  }
  return res;
}

// ── shop interiors (style SHOP): a room box per window cell plus parallax layers in front of the back wall
// (display stands / mannequins / buckets near the glass, tables / counters / clothes rails mid-room), each
// shop type with its own goods. Soft edges (~1.5 cm) so the silhouettes don't alias.
float bhBox2(vec2 p, vec2 c, vec2 hs) { vec2 d = abs(p - c) - hs; return 1.0 - smoothstep(-0.012, 0.012, max(d.x, d.y)); }
float bhDisc(vec2 p, vec2 c, float r) { return 1.0 - smoothstep(r - 0.012, r + 0.012, length(p - c)); }
vec3 bhPal(float h) {
  // saturated-but-natural goods palette
  vec3 c = vec3(0.62, 0.14, 0.12);
  c = mix(c, vec3(0.12, 0.26, 0.5), step(0.14, h));
  c = mix(c, vec3(0.16, 0.4, 0.22), step(0.28, h));
  c = mix(c, vec3(0.86, 0.76, 0.52), step(0.42, h));
  c = mix(c, vec3(0.18, 0.18, 0.2), step(0.55, h));
  c = mix(c, vec3(0.82, 0.48, 0.16), step(0.66, h));
  c = mix(c, vec3(0.52, 0.28, 0.5), step(0.77, h));
  c = mix(c, vec3(0.9, 0.88, 0.84), step(0.88, h));
  return c;
}
// shelves of goods on a wall: q = (along the wall, height); kind 0 small boxes, 1 book spines, 2 bottles, 3 loaves
vec3 bhShelves(vec2 q, vec3 wallC, float kind, float rs, float y0, float y1, float rowH) {
  if (q.y < y0 || q.y > y1) return wallC;
  float row = floor((q.y - y0) / rowH);
  float fy = (q.y - y0) / rowH - row;
  vec3 board = vec3(0.32, 0.22, 0.14);
  if (fy < 0.09) return board;
  vec3 c = wallC * 0.55;
  if (kind < 0.5) {
    float w = 0.16 + 0.1 * bhHash12(vec2(row, rs));
    float k = floor(q.x / w);
    float hh = bhHash12(vec2(k, row + rs * 3.1));
    float ht = 0.35 + 0.5 * fract(hh * 7.3);
    if (fy < ht && fract(q.x / w) > 0.08 && hh > 0.12) c = bhPal(fract(hh * 3.7)) * (0.75 + 0.35 * fract(hh * 13.1));
  } else if (kind < 1.5) {
    float w = 0.035 + 0.025 * bhHash12(vec2(floor(q.x / 0.05), row + rs));
    float k = floor(q.x / w + row * 0.37);
    float hh = bhHash12(vec2(k, row * 1.7 + rs));
    float ht = 0.62 + 0.3 * fract(hh * 5.1);
    if (fy < ht) c = bhPal(hh) * (0.6 + 0.5 * fract(hh * 11.3)) * mix(0.82, 1.0, step(0.15, fract(q.x / w)));
  } else if (kind < 2.5) {
    float k = floor(q.x / 0.09);
    float hh = bhHash12(vec2(k, row + rs * 1.3));
    float bx = abs(fract(q.x / 0.09) - 0.5) * 0.09;
    float neck = mix(0.028, 0.01, smoothstep(0.45, 0.6, fy));
    if (fy < 0.78 && bx < neck && hh > 0.08) c = mix(vec3(0.18, 0.32, 0.16), vec3(0.55, 0.32, 0.1), step(0.45, hh)) * (0.7 + 0.6 * fract(hh * 9.1));
    if (fy < 0.78 && bx < neck && hh > 0.8) c = vec3(0.8, 0.78, 0.7);
  } else {
    float k = floor(q.x / 0.26);
    float hh = bhHash12(vec2(k, row + rs * 2.3));
    vec2 lp = vec2((fract(q.x / 0.26) - 0.5) * 0.26, (fy - 0.32) * rowH);
    float loaf = 1.0 - smoothstep(0.9, 1.05, length(lp / vec2(0.11, 0.06 + 0.03 * hh)));
    c = mix(c, mix(vec3(0.72, 0.45, 0.18), vec3(0.5, 0.28, 0.1), fract(hh * 5.0)) * (0.85 + 0.3 * lp.y / 0.08), loaf * step(0.15, hh));
  }
  return c;
}
vec3 bhShop(vec2 pm, vec2 csz, vec3 rd, float rs, float shopT, float litI, vec3 lcol, out vec3 dayAlb) {
  float W = csz.x, Hc = csz.y;
  float depth = max(4.2, W * 1.6);
  vec3 ro = vec3(pm, 0.0);
  vec3 pos = step(0.0, rd);
  vec3 ard = max(abs(rd), vec3(1e-4));
  vec3 tt = (pos * vec3(W, Hc, depth) - ro) * (pos * 2.0 - 1.0) / ard;
  float t = min(tt.x, min(tt.y, tt.z));
  vec3 h = ro + rd * t;
  float T = shopT;
  if (T < 0.5) T = 1.0 + floor(bhHash12(vec2(rs, 3.3)) * 6.99);
  float eps = 1e-3;
  bool onBack = tt.z <= t + eps;
  bool onFlat = !onBack && tt.y <= t + eps;
  // ── type looks
  vec3 wallC = vec3(0.86, 0.84, 0.8);
  vec3 floorC = vec3(0.45, 0.33, 0.22);
  float shelfKind = 0.0;
  // (mid-dark, coloured surfaces: a lit room seen from the street has contrast, not a white glow)
  if (T < 1.5) { wallC = vec3(0.46, 0.3, 0.19); floorC = vec3(0.26, 0.17, 0.11); shelfKind = 2.0; }        // café / bar
  else if (T < 2.5) { wallC = vec3(0.68, 0.58, 0.44); floorC = vec3(0.45, 0.36, 0.28); shelfKind = 3.0; }  // bakery
  else if (T < 3.5) { wallC = vec3(0.32, 0.22, 0.14); floorC = vec3(0.3, 0.2, 0.13); shelfKind = 1.0; }     // books
  else if (T < 4.5) { wallC = vec3(0.42, 0.48, 0.4); floorC = vec3(0.32, 0.31, 0.29); }                     // florist / grocer
  else if (T < 5.5) { wallC = vec3(0.7, 0.66, 0.62); floorC = vec3(0.42, 0.33, 0.26); }                     // fashion
  else if (T < 6.5) { wallC = vec3(0.74, 0.76, 0.76); floorC = vec3(0.5, 0.5, 0.48); shelfKind = 0.0; }    // pharmacy / hardware
  else if (T < 7.5) { wallC = vec3(0.66, 0.64, 0.6); floorC = vec3(0.3, 0.22, 0.16); }                    // gallery / antiques
  else { wallC = vec3(0.56, 0.54, 0.5); floorC = vec3(0.16, 0.16, 0.17); }                                   // office lobby
  vec3 c;
  float lf = 0.85;
  float self = 0.0; // self-lit (lamp bulbs)
  if (onBack) {
    vec2 q = h.xy;
    c = wallC;
    if (T < 1.5) {
      c = h.y < 1.1 ? wallC * 0.6 : bhShelves(vec2(q.x, q.y), wallC, 2.0, rs, 1.25, min(Hc - 0.5, 2.6), 0.42);
      // menu board
      c = mix(c, vec3(0.12, 0.13, 0.12), bhBox2(q, vec2(W * 0.5, Hc - 0.75), vec2(min(0.6, W * 0.25), 0.3)));
    } else if (T < 2.5) c = bhShelves(q, wallC, 3.0, rs, 0.9, min(Hc - 0.4, 2.5), 0.36);
    else if (T < 3.5) c = bhShelves(q, wallC, 1.0, rs, 0.15, Hc - 0.25, 0.34);
    else if (T < 4.5) {
      // greenery / produce wall
      float n = bhHash12(floor(q * 6.0) + rs);
      c = mix(vec3(0.16, 0.3, 0.12), vec3(0.3, 0.45, 0.18), n) * step(q.y, Hc - 0.6);
      float fl = step(0.82, bhHash12(floor(q * 9.0) + rs * 1.7)) * step(0.5, q.y);
      c = mix(c, bhPal(bhHash12(floor(q * 9.0) + 2.0)) * 1.2, fl);
      c = mix(c, wallC, step(Hc - 0.6, q.y));
    } else if (T < 5.5) {
      // shelves of folded clothes / shoe boxes on the back wall
      c = bhShelves(q, wallC, 0.0, rs, 0.4, min(Hc - 0.5, 2.4), 0.45) * mix(1.0, 0.95, step(q.y, 0.4));
    } else if (T < 6.5) c = bhShelves(q, wallC, 0.0, rs, 0.2, min(Hc - 0.4, 2.4), 0.36);
    else if (T > 7.5) {
      // lobby: timber feature wall with a lit logo, stone elsewhere
      // (each bay differs: timber or stone, the logo only on some, artwork on others)
      float hb = bhHash12(vec2(rs, 2.9));
      float pan = step(abs(q.x - W * 0.5), W * 0.42) * step(q.y, Hc - 0.5) * step(0.35, hb);
      c = mix(wallC, vec3(0.42, 0.28, 0.17) * (0.9 + 0.1 * bhStripe(q.x / 0.12, 0.2)), pan);
      float logo = bhBox2(q, vec2(W * 0.5, min(Hc - 1.0, 2.4)), vec2(min(0.8, W * 0.25), 0.12)) * step(0.72, hb);
      float art = bhBox2(q, vec2(W * 0.5, 1.7), vec2(min(0.7, W * 0.22), 0.5)) * step(hb, 0.35);
      c = mix(c, bhPal(fract(hb * 7.0)) * (0.6 + 0.5 * bhHash12(floor(q * 4.0) + rs)), art);
      c = mix(c, vec3(0.95, 0.92, 0.85), logo);
      self = max(self, logo * 0.8);
    } else {
      // framed pictures
      vec2 fc = vec2((floor(q.x / 1.1) + 0.5) * 1.1, 1.65 + 0.25 * (bhHash12(vec2(floor(q.x / 1.1), rs)) - 0.5));
      float hs = bhHash12(vec2(floor(q.x / 1.1), rs + 1.0));
      vec2 fs = vec2(0.3 + 0.15 * hs, 0.24 + 0.18 * fract(hs * 7.0));
      float fr = bhBox2(q, fc, fs + 0.04);
      float pic = bhBox2(q, fc, fs);
      c = mix(c, vec3(0.25, 0.18, 0.1), fr);
      c = mix(c, bhPal(fract(hs * 3.1)) * (0.7 + 0.5 * fract(q.y * 3.0 + q.x)), pic);
    }
    lf = 0.85;
  } else if (onFlat) {
    if (rd.y < 0.0) {
      c = floorC * (0.85 + 0.15 * bhStripe(h.x * 2.0 + h.z * 0.0, 0.5));
      lf = 0.55;
    } else {
      c = vec3(0.9, 0.88, 0.84);
      lf = 1.0;
      // ceiling lamps: bright discs / spot rows
      vec2 lp = vec2(fract(h.x / 1.4) - 0.5, fract(h.z / 1.6) - 0.5) * vec2(1.4, 1.6);
      self = (1.0 - smoothstep(0.07, 0.11, length(lp)));
    }
  } else {
    // side walls
    vec2 q = vec2(h.z, h.y);
    c = wallC * 0.9;
    if (T > 2.5 && T < 3.5) c = bhShelves(q, wallC, 1.0, rs + 5.0, 0.15, Hc - 0.25, 0.34) * 0.9;
    else if (T > 5.5 && T < 6.5) c = bhShelves(q, wallC, 0.0, rs + 5.0, 0.2, min(Hc - 0.4, 2.4), 0.36) * 0.9;
    else if (T < 1.5) c = h.y < 1.1 ? wallC * 0.55 : bhShelves(q, wallC, 2.0, rs + 5.0, 1.3, min(Hc - 0.5, 2.5), 0.42) * 0.85;
    else if (T < 2.5) c = bhShelves(q, wallC, 3.0, rs + 5.0, 0.9, min(Hc - 0.4, 2.3), 0.36) * 0.9;
    else if (T < 5.5 && T > 4.5) c = bhShelves(q, wallC, 0.0, rs + 5.0, 0.5, min(Hc - 0.5, 2.3), 0.5) * 0.9;
    else if (T > 6.5) c = mix(wallC, bhPal(bhHash12(floor(q / vec2(1.1, 0.9)) + rs)) * 0.8, bhBox2(vec2(fract(q.x / 1.1) * 1.1, q.y), vec2(0.55, 1.6), vec2(0.32, 0.26)));
    lf = 0.65;
  }
  // ── parallax layers (front to back), each a plane parallel to the glass
  float dzMid = depth * 0.5;
  // mid layer
  {
    float tz = dzMid / max(rd.z, 1e-3);
    if (tz < t) {
      vec2 q = (ro + rd * tz).xy;
      float m = 0.0;
      vec3 mc = vec3(0.0);
      if (T < 1.5) {
        // café tables with chairs and a few seated guests
        float k = floor(q.x / 1.5);
        float lx = (fract(q.x / 1.5) - 0.5) * 1.5;
        float hk = bhHash12(vec2(k, rs + 9.0));
        float tab = max(bhBox2(vec2(lx, q.y), vec2(0.0, 0.74), vec2(0.34, 0.025)), bhBox2(vec2(lx, q.y), vec2(0.0, 0.37), vec2(0.03, 0.37)));
        float ch = max(bhBox2(vec2(abs(lx), q.y), vec2(0.5, 0.45), vec2(0.18, 0.025)), bhBox2(vec2(abs(lx), q.y), vec2(0.66, 0.68), vec2(0.025, 0.24)));
        float guest = step(0.35, hk) * max(bhDisc(vec2(lx, q.y), vec2(-0.48, 1.22), 0.11), bhBox2(vec2(lx, q.y), vec2(-0.48, 0.88), vec2(0.17, 0.24)));
        float guest2 = step(0.65, hk) * max(bhDisc(vec2(lx, q.y), vec2(0.5, 1.2), 0.1), bhBox2(vec2(lx, q.y), vec2(0.5, 0.86), vec2(0.16, 0.23)));
        m = max(max(tab, ch), max(guest, guest2));
        mc = mix(vec3(0.2, 0.14, 0.1), bhPal(fract(hk * 7.7)) * 0.8, max(guest * step(q.y, 1.1), guest2 * step(q.y, 1.08)));
        mc = mix(mc, vec3(0.62, 0.45, 0.35), max(guest * step(1.1, q.y), guest2 * step(1.08, q.y)));
        // pendant lamps
        float lamp = bhDisc(vec2(lx, q.y), vec2(0.0, Hc - 0.85), 0.13) * step(q.y, Hc - 0.8);
        float cord = bhBox2(vec2(lx, q.y), vec2(0.0, Hc - 0.4), vec2(0.006, 0.42));
        m = max(m, max(lamp, cord));
        mc = mix(mc, vec3(1.0, 0.85, 0.6), lamp);
        self = mix(self, 2.2, lamp);
      } else if (T < 2.5) {
        // glass counter with pastries
        float cnt = step(q.y, 1.0);
        float glassBand = step(0.45, q.y) * step(q.y, 0.92);
        float k = floor(q.x / 0.14);
        float pastry = step(0.3, bhHash12(vec2(k, floor(q.y / 0.16) + rs))) * step(fract(q.y / 0.16), 0.55) * glassBand;
        m = cnt;
        mc = mix(vec3(0.42, 0.3, 0.2), vec3(0.85, 0.85, 0.8) * 0.45, glassBand);
        mc = mix(mc, mix(vec3(0.85, 0.6, 0.3), bhPal(bhHash12(vec2(k, 4.0))), 0.35), pastry);
        mc = mix(mc, vec3(0.9, 0.88, 0.84), step(0.95, q.y));
      } else if (T < 3.5) {
        // table with stacks of books
        float tab = bhBox2(q, vec2(W * 0.5, 0.74), vec2(W * 0.3, 0.03)) + bhBox2(vec2(abs(q.x - W * 0.5), q.y), vec2(W * 0.27, 0.36), vec2(0.03, 0.36));
        float k = floor(q.x / 0.3);
        float hk = bhHash12(vec2(k, rs));
        float stack = step(0.77, q.y) * step(q.y, 0.8 + 0.25 * hk) * step(abs(q.x - W * 0.5), W * 0.28) * step(0.06, fract(q.x / 0.3));
        m = clamp(tab + stack, 0.0, 1.0);
        mc = mix(vec3(0.3, 0.2, 0.12), bhPal(fract(hk * 3.0 + floor(q.y / 0.04) * 0.37)), stack);
      } else if (T > 7.5) {
        // reception desk, a person behind it, lounge chairs
        float desk = bhBox2(q, vec2(W * 0.5, 0.55), vec2(min(1.2, W * 0.3), 0.55));
        float top = bhBox2(q, vec2(W * 0.5, 1.1), vec2(min(1.25, W * 0.31), 0.03));
        float clerk = max(bhDisc(q, vec2(W * 0.5 + 0.3, 1.45), 0.11), bhBox2(q, vec2(W * 0.5 + 0.3, 1.18), vec2(0.18, 0.2)));
        float lounge = bhBox2(vec2(abs(q.x - W * 0.5), q.y), vec2(W * 0.5 - 0.5, 0.35), vec2(0.35, 0.22));
        m = max(max(desk, top), max(clerk, lounge));
        mc = mix(vec3(0.22, 0.2, 0.18), vec3(0.75, 0.72, 0.66), top);
        mc = mix(mc, vec3(0.2, 0.25, 0.35), clerk * (1.0 - step(1.33, q.y)));
        mc = mix(mc, vec3(0.62, 0.5, 0.42), clerk * step(1.33, q.y));
        mc = mix(mc, vec3(0.3, 0.32, 0.36), lounge);
      } else if (T < 5.5 && T > 4.5) {
        // clothes rail
        float rail = bhBox2(q, vec2(W * 0.5, 1.68), vec2(W * 0.38, 0.012));
        float k = floor(q.x / 0.11);
        float hk = bhHash12(vec2(k, rs + 2.0));
        float gar = step(abs(q.x - W * 0.5), W * 0.36) * step(q.y, 1.66) * step(1.66 - (0.55 + 0.45 * hk), q.y) * step(0.1, fract(q.x / 0.11));
        m = max(rail, gar);
        mc = mix(vec3(0.6), bhPal(hk) * 0.85 * (0.7 + 0.3 * fract(q.x / 0.11)) * (0.75 + 0.25 * smoothstep(0.7, 1.6, q.y)), gar);
      }
      c = mix(c, mc, m);
      lf = mix(lf, 0.8, m);
      if (m > 0.5) t = tz;
    }
  }
  // display layer just behind the glass
  {
    float dz = 0.55;
    float tz = dz / max(rd.z, 1e-3);
    if (tz < t) {
      vec2 q = (ro + rd * tz).xy;
      float m = 0.0;
      vec3 mc = vec3(0.0);
      float hk = bhHash12(vec2(rs, 5.0));
      if (T > 4.5 && T < 5.5) {
        // two mannequins
        for (int i = 0; i < 2; i++) {
          float x = W * (0.3 + 0.4 * float(i));
          float body = max(bhDisc(q, vec2(x, 1.72), 0.1), bhBox2(q, vec2(x, 1.28), vec2(0.17, 0.32)));
          float legs = bhBox2(vec2(abs(q.x - x), q.y), vec2(0.07, 0.6), vec2(0.045, 0.4));
          float stand = bhBox2(q, vec2(x, 0.08), vec2(0.18, 0.02));
          float mm = max(max(body, legs), stand);
          vec3 cc = mix(bhPal(fract(hk * 3.0 + float(i) * 0.37)), vec3(0.9, 0.86, 0.8), step(1.62, q.y));
          cc *= 0.62 + 0.45 * (1.0 - smoothstep(0.0, 0.2, abs(q.x - x - 0.05)));    // rounded body
          mc = mix(mc, cc, mm);
          m = max(m, mm);
        }
      } else if (T > 3.5 && T < 4.5) {
        // buckets of flowers / crates of fruit along the window
        float k = floor(q.x / 0.42);
        float lx = (fract(q.x / 0.42) - 0.5) * 0.42;
        float hb = bhHash12(vec2(k, rs + 4.0));
        float bucket = bhBox2(vec2(lx, q.y), vec2(0.0, 0.2), vec2(0.13, 0.2));
        vec2 fq = vec2(lx, q.y - 0.62);
        float bloom = (1.0 - smoothstep(0.17, 0.2, length(fq * vec2(1.0, 1.4)))) * step(0.12, hb);
        float spot = step(0.45, bhHash12(floor(q * 22.0) + k));
        m = max(bucket, bloom);
        mc = mix(vec3(0.55, 0.57, 0.58), mix(vec3(0.2, 0.38, 0.14), bhPal(hb) * 1.15, spot), bloom);
      } else if (T > 7.5) {
        // big potted plant beside the glass
        float x = W * (0.15 + 0.7 * hk);
        float pot = bhBox2(q, vec2(x, 0.25), vec2(0.22, 0.25));
        float leaves = (1.0 - smoothstep(0.85, 1.0, length((q - vec2(x, 1.2)) / vec2(0.5, 0.75)) + 0.25 * (bhHash12(floor(q * 14.0)) - 0.5)));
        m = max(pot, leaves);
        mc = mix(vec3(0.3, 0.3, 0.32), mix(vec3(0.1, 0.22, 0.08), vec3(0.22, 0.38, 0.14), bhHash12(floor(q * 11.0))), leaves);
      } else if (T > 6.5) {
        // a display plinth with an object
        float pl = bhBox2(q, vec2(W * 0.5, 0.45), vec2(0.22, 0.45));
        float ob = bhDisc(q, vec2(W * 0.5, 1.08), 0.16);
        m = max(pl, ob);
        mc = mix(vec3(0.9, 0.9, 0.88), bhPal(hk), ob);
      } else if (T > 5.5 && T < 6.5) {
        // low display stand with products
        float st = bhBox2(q, vec2(W * 0.5, 0.5), vec2(W * 0.3, 0.5));
        float k = floor(q.x / 0.12);
        float pr = step(0.3, bhHash12(vec2(k, floor(q.y / 0.2) + rs))) * step(fract(q.y / 0.2), 0.6) * step(0.25, q.y);
        m = st;
        mc = mix(vec3(0.95), bhPal(bhHash12(vec2(k, 7.0))), pr * step(q.y, 0.95));
      }
      c = mix(c, mc, m);
      lf = mix(lf, 0.9, m);
    }
  }
  float dz = clamp(h.z / depth, 0.0, 1.0);
  // depth cues: corner occlusion where the room's faces meet, pools of light under the ceiling spots
  // (floor + walls), darker towards the back and the floor
  float ex = min(h.x, W - h.x), ey = min(h.y, Hc - h.y), ez = depth - h.z;
  float ao = onBack ? smoothstep(0.0, 0.6, min(ex, ey)) : (onFlat ? smoothstep(0.0, 0.55, min(ex, ez)) : smoothstep(0.0, 0.55, min(ey, ez)));
  ao = 0.35 + 0.65 * ao;
  vec2 lp = vec2(fract(h.x / 1.4) - 0.5, fract(h.z / 1.6) - 0.5) * vec2(1.4, 1.6);
  float pool = onFlat && rd.y < 0.0 ? exp(-dot(lp, lp) / 0.35) : (onBack ? exp(-lp.x * lp.x / 0.12) * smoothstep(0.6, Hc - 0.2, h.y) : 0.0);
  float shade = ao * (0.5 + 0.95 * pool) * mix(1.0, 0.72, smoothstep(1.6, 0.0, h.y) * float(!onFlat));
  // shops are deep: little daylight reaches the back, the lights carry the look
  dayAlb = c * 0.3 * (1.0 - 0.6 * dz) * (0.85 + 0.3 * lf) * ao;
  vec3 lamp = c * lcol * lf * (1.0 - 0.35 * dz) * shade;
  return lamp * litI + lcol * self * max(litI, 0.0) * 2.4 + c * 0.012;
}

// fake room behind the window (interior mapping). Returns the lamp-lit radiance (emission) and
// writes the daylight-lit part as an albedo (dayAlb) so it follows the facade's real lighting
// (sun / shade / shadows) instead of glowing uniformly.
vec3 bhRoom(vec2 pm, vec2 csz, vec3 rd, float rs, float litI, vec3 lcol, float prof, float style, out vec3 dayAlb) {
  float depth = max(3.2, csz.x * 1.5);
  vec3 ro = vec3(pm, 0.0);
  vec3 pos = step(0.0, rd);
  vec3 ard = max(abs(rd), vec3(1e-4));
  vec3 bmax = vec3(csz, depth);
  vec3 tt = (pos * bmax - ro) * (pos * 2.0 - 1.0) / ard;
  float t = min(tt.x, min(tt.y, tt.z));
  vec3 h = ro + rd * t;
  float hue = bhHash12(vec2(rs, rs * 3.7));
  vec3 wallC = prof > 0.5 && prof < 1.5 ? mix(vec3(0.55, 0.57, 0.58), vec3(0.72, 0.7, 0.66), hue)
             : mix(mix(vec3(0.78, 0.66, 0.5), vec3(0.62, 0.7, 0.66), step(0.6, hue)), vec3(0.8, 0.62, 0.6), step(0.85, hue));
  vec3 floorC = prof > 0.5 && prof < 1.5 ? vec3(0.22, 0.25, 0.3) : mix(vec3(0.42, 0.28, 0.18), vec3(0.5, 0.42, 0.34), hue);
  vec3 ceilC = vec3(0.86, 0.84, 0.8);
  vec3 c;
  float lf;
  float eps = 1e-3;
  if (tt.z <= t + eps) {
    c = wallC;
    lf = 0.8;
    // furniture / desks / shelves silhouettes on the back wall
    float fx = h.x / csz.x;
    if (style > 5.5 && style < 6.5) {
      // shop: colourful shelves of goods
      vec2 gq = vec2(floor(h.x / 0.32), floor(h.y / 0.38));
      float gn = bhHash12(gq + rs * 13.0);
      vec3 goods = 0.35 + 0.65 * vec3(bhHash12(gq + 1.3), bhHash12(gq + 2.7), bhHash12(gq + 4.1));
      c = mix(c, goods, step(0.35, gn) * step(h.y, csz.y * 0.75) * step(0.25, h.y));
    } else {
      float furn = step(h.y, 0.95) * step(0.12, bhHash12(vec2(floor(fx * 3.0), rs)));
      c *= mix(1.0, 0.45, furn);
      // a picture frame / lamp shape
      float pic = step(abs(fx - 0.5 - (hue - 0.5) * 0.4), 0.13) * step(abs(h.y - 1.75), 0.32);
      c = mix(c, vec3(0.28, 0.32, 0.4) + hue * 0.4, pic * 0.8);
    }
  } else if (tt.y <= t + eps) {
    if (rd.y < 0.0) { c = floorC; lf = 0.5; }
    else { c = ceilC; lf = 1.05; }
  } else {
    c = wallC * 0.86;
    lf = 0.62;
  }
  float dz = clamp(h.z / depth, 0.0, 1.0);
  // daylight entering through the window: bright near the glass, falling off into the room
  dayAlb = c * 0.55 * (1.0 - 0.7 * dz) * (0.85 + 0.3 * lf);
  // ceiling lamp falloff (+ a faint night ambient)
  vec3 lamp = c * lcol * lf * (1.0 - 0.4 * dz);
  return lamp * litI + c * 0.012 * (1.0 - dz);
}

// Stylised reflected environment seen along R from a facade point at height yW:
// sky (gradient, warm glow toward the sun, cloud streaks on a virtual cloud plane), a hazy far
// skyline, near neighbours whose apparent height grows toward the ground (so the lower floors
// mirror the street canyon and the upper floors the sky — the vertical gradient of real towers),
// and the ground. The horizon is lifted by uReflLift (follows the camera tilt) so every facade
// shows its horizon line from the elevated diorama camera. fR = fwidth of R.y (edge filtering).
vec3 bhEnv(vec3 R, float yW, float seed, float fR, float lodC, float nightF) {
  float e = R.y + uReflLift;
  float az = atan(R.x, R.z);
  float sk = clamp(e, 0.0, 1.0);
  vec3 sky = mix(uSkyHor, uSkyZen, sqrt(sk));
  vec2 rh = normalize(R.xz + vec2(1e-5, 0.0));
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float toSun = max(dot(rh, sh), 0.0);
  sky += uSkyGlow * (toSun * toSun * toSun) * (1.0 - smoothstep(0.0, 0.55, sk));
  vec2 cuv = R.xz / (sk + 0.22) * 0.075 + vec2(seed * 0.0131, seed * 0.0071);
  float cl = textureLod(uBhNoise, vec2(cuv.x, cuv.y * 0.3), lodC).g;
  sky = mix(sky, uCloudCol, smoothstep(0.5, 0.8, cl) * 0.6 * (1.0 - smoothstep(0.12, 0.9, sk)));
  float ew = max(fR * 1.5, 0.005);
  // far skyline (hazy): blocky roofline over the azimuth
  float bF = floor(az * 8.0 + seed * 0.37);
  float hb = bhHash12(vec2(bF, 3.7));
  float hF = 0.012 + 0.1 * hb * hb + 0.05 * step(0.88, hb);
  vec3 farC = mix(uCityCol * (0.85 + 0.35 * fract(hb * 13.1)), uSkyHor, 0.6);
  // near neighbours: roofline of a building of height Hn at distance Dn, seen from height yW
  float bN = floor(az * 2.4 + seed * 0.71 + 0.5);
  float hn1 = bhHash12(vec2(bN, 9.1)), hn2 = bhHash12(vec2(bN, 4.3));
  float hN = (12.0 + 48.0 * hn1 * hn1 - yW) / (30.0 + 70.0 * hn2);
  vec3 nearC = mix(uCityCol * (0.85 + 0.45 * hn2), uSkyHor, 0.3);
  // their floors: soft darker window bands (filtered when tiny); a warm hint of lit floors at night
  float band = 0.5 + 0.5 * sin(e * 150.0 + hn1 * 6.0);
  float baa = clamp(1.0 - fR * 150.0 * 0.6, 0.0, 1.0);
  nearC *= 1.0 - 0.22 * band * baa;
  nearC += vec3(1.0, 0.62, 0.3) * 0.05 * nightF * (0.5 + 0.5 * band * baa) * step(0.45, hn1);
  vec3 c = sky;
  c = mix(c, farC, 1.0 - smoothstep(hF - ew, hF + ew, e));
  c = mix(c, nearC, 1.0 - smoothstep(hN - ew, hN + ew, e));
  // ground / streets (a little warm city light at night)
  vec3 gnd = uGround + vec3(0.05, 0.034, 0.018) * nightF;
  c = mix(c, gnd, 1.0 - smoothstep(-0.34 - ew, -0.24 + ew, e));
  return c;
}

void bhWall(inout vec3 albedo, inout float rough, inout float metal, inout vec3 emit, vec3 N, vec3 V) {
  // kind = style·8 + profile is an integer per primitive; round it first — for profile 0 (homes) the interpolation
  // jitter of the varying made mod(kind, 8) wrap to ~8 on scattered pixels (prof flipped home → 8 = unlit: speckles)
  float kind = floor(vB.w + 0.5);
  float style = floor(mod(kind, 64.0) / 8.0 + 0.01);
  float prof = floor(mod(kind, 8.0) + 0.01);
  // seeds are integers per primitive, but arrive as interpolated varyings with ~1e-4 jitter; the chaotic hashes
  // below would turn that into per-pixel lit / curtain flips (speckles) — snap them
  float seed = floor(vB.z + 0.5);
  vec2 csz = vC.xy;
  // pattern + 16 · shop type (shop type only on SHOP walls; 0 = pick from the seed)
  float patRaw = floor(vC.z + 0.5);
  float pat = mod(patRaw, 16.0);
  float shopT = floor(patRaw / 16.0);
  float packCol = vC.w + 0.01;
  int frameIdx = int(mod(packCol, 8.0));
  int glassIdx = int(mod(floor(packCol / 8.0), 8.0));
  vec3 T = vec3(N.z, 0.0, -N.x);
  float tl = length(T);
  T = tl > 1e-3 ? T / tl : vec3(1.0, 0.0, 0.0);
  vec2 q = vec2(dot(vWPos, T), vWPos.y);
  bool curtain = style > 1.5 && style < 2.5;
  bool ribbon = style > 2.5 && style < 3.5;

  // ── derivatives + texture fetches first (uniform control flow)
  vec2 fq = fwidth(q);
  vec2 fFac = fwidth(vFac);
  // window cells may run along T or against it (depends on how the wall quad was emitted): +u in world space
  float uSign = dot(vec2(dFdx(vFac.x), dFdy(vFac.x)), vec2(dFdx(q.x), dFdy(q.x))) < 0.0 ? -1.0 : 1.0;
  vec3 Tu = T * uSign;
  vec3 R0 = reflect(V, N);
  float fR = fwidth(R0.y);
  float lodC = clamp(log2(max(fwidth(R0.x) + fwidth(R0.z), 1e-5) * 256.0 * 0.4) , 0.0, 8.0);
  vec2 so = vec2(fract(seed * 0.1373), fract(seed * 0.3119)) * 17.0;
  // one fetch serves three scales: r ~8 m blotches, g ~2 m tone patches, b 0.5 m × 16 m streaks
  vec4 nm = texture2D(uBhNoise, q * 0.031 + so);
  float stv = sqrt(nm.b); // the streak channel is stored squared (contrast); linearise for weights
  float grain = texture2D(uBhNoise, q * 0.3 + so.yx).a;                         // a: ~5 cm stucco grain
  float sn = sqrt(texture2D(uBhNoise, vec2(q.x * 0.16, q.y * 0.09) + so.yx).b); // b: 10 cm wide, ~5 m long streaks
  vec4 np = texture2D(uBhNoise, q * 0.105 + so * 1.31);                       // g ~0.6 m blobs (peeling), r ~2.4 m

  // ── 1. surface pattern
  float y = vWPos.y;
  vec3 baseAlb = albedo;
  albedo *= bhWallPattern(pat, q, seed, fq, nm, grain);
  if (uWallRelief > 0.5 && uDetail > 0.5) {
    vec2 rs = bhWallSlope(pat, q, seed, fq, so);
    if (dot(rs, rs) > 1e-6) bhNW = normalize(N - T * rs.x - vec3(0.0, rs.y, 0.0));
  }
  // plinth course: the foot of the wall is a 30–60 cm band of a harder, darker material (rendered / stone /
  // engineering brick; a concrete upstand under corrugated sheds), 2–3 cm proud with a weathered top ledge,
  // splash speckles and damp at the bottom. Drawn on wall pixels only (glass and doors keep their own look).
  plinthF = 0.0;
  if (!curtain && uPlinth > 0.5) {
    float hp = fract(seed * 0.5317 + 0.11);
    float pH = pat > 1.5 && pat < 2.5 ? 0.7 + 0.5 * hp : 0.3 + 0.32 * hp;
    float aaP = max(fq.y, 0.004);
    plinthF = 1.0 - smoothstep(pH - aaP, pH + aaP, y);
    if (plinthF > 0.0) {
      float kindP = fract(seed * 0.271 + 0.6);
      float lw = dot(albedo, vec3(0.3, 0.59, 0.11));
      vec3 pc = kindP < 0.4 ? vec3(0.44, 0.43, 0.41) * (0.9 + 0.2 * nm.g)                 // grey render
              : (kindP < 0.75 ? vec3(0.58, 0.56, 0.52) * (0.88 + 0.16 * np.g)            // stone
              : mix(albedo, vec3(lw), 0.5) * 0.62);                                     // darker same material
      if (pat > 1.5 && pat < 2.5) pc = vec3(0.6, 0.6, 0.58) * (0.9 + 0.15 * nm.g);      // concrete upstand
      if (kindP >= 0.4 && kindP < 0.75 && pat != 2.0) {
        // stone plinth: long blocks with fine joints
        float jx = abs(fract(q.x / 0.9 + fract(seed * 0.7)) - 0.5) * 0.9;
        pc *= 1.0 - 0.3 * (1.0 - smoothstep(0.004, 0.008 + fq.x, jx)) * (1.0 - smoothstep(0.004, 0.012, fq.x));
      }
      pc *= 0.85 + 0.15 * grain;
      // splash speckles + damp toward the ground
      float spl = smoothstep(0.55, 0.75, texture2D(uBhNoise, q * 1.3 + so).a) * (1.0 - smoothstep(0.0, 0.25, y));
      pc *= (1.0 - 0.35 * spl * (1.0 - smoothstep(0.005, 0.02, fq.y))) * mix(0.72, 1.0, smoothstep(0.0, 0.18 + 0.1 * nm.g, y));
      // the ledge on top catches the sky; a thin shadow line just under it
      float led = smoothstep(pH - 0.03 - aaP, pH - 0.012, y) * (1.0 - smoothstep(pH - 0.012, pH, y));
      pc *= 1.0 + 0.08 * led;
      albedo = mix(albedo, pc, plinthF);
      if (led > 0.3 && uWallRelief > 0.5) bhNW = normalize(N + vec3(0.0, 0.55, 0.0));
      else if (plinthF > 0.5) bhNW = vec3(0.0);
    }
    // the wall right above the ledge: a little splash-back from the ledge
    albedo *= 1.0 - 0.1 * (1.0 - smoothstep(pH, pH + 0.12, y)) * (1.0 - plinthF);
  }

  // ── 2. macro weathering (reads at 100–300 m): dirt under the coping / cornice washing down in
  //       ragged streaks, splash zone + darker base, soft corner darkening, large blotches
  float wStr = curtain ? 0.25 : (pat > 5.5 ? 0.4 : (pat > 1.5 && pat < 2.5 ? 1.2 : 1.0));
  float info = step(0.5, vD.w);
  float dTop = mix(1e3, vD.z - y, info);
  float underTop = 1.0 - smoothstep(0.0, 0.9, dTop);
  float topWash = (1.0 - smoothstep(0.0, 1.2 + 6.0 * stv * stv, dTop)) * smoothstep(0.15, 0.85, stv);
  float base = 1.0 - smoothstep(0.02, 0.6 + 0.8 * nm.g, y);
  float baseWide = 1.0 - smoothstep(0.0, 4.0, y);
  float flg = floor(vD.w + 0.01);
  float dl = mod(floor(flg * 0.5), 2.0) > 0.5 ? vD.x : 1e3;
  float dr = mod(floor(flg * 0.25), 2.0) > 0.5 ? vD.y - vD.x : 1e3;
  float corner = info * (1.0 - smoothstep(0.0, 0.6, min(dl, dr)));
  float dirt = (0.6 * underTop + 0.5 * topWash + 0.55 * base + 0.16 * baseWide + 0.3 * corner) * wStr;
  vec3 dirtTint = pat > 1.5 && pat < 2.5 ? vec3(0.6, 0.38, 0.25) : vec3(0.5, 0.46, 0.4);
  float macro = 1.0 + (nm.r - 0.5) * 0.45 * wStr;
  albedo *= macro * mix(vec3(1.0), dirtTint, clamp(dirt, 0.0, 0.9));

  // ── 2b. eye-level wear (reads at 2–40 m): rising damp with a ragged tide mark and a pale salt line,
  //        green algae on north faces near the ground and in the drip streaks, peeling paint / spalled
  //        render showing the substrate, and per-building age (old plaster and stone weather most)
  if (!curtain && uDetail > 0.2 && uWear > 0.5) {
    float age = fract(seed * 0.6180339 + 0.21);
    float oldness = pat < 0.5 || (pat > 3.5 && pat < 4.5) ? mix(0.35, 1.0, age) : (pat < 1.5 ? mix(0.3, 0.8, age) : (pat > 4.5 ? 0.25 * age : mix(0.2, 0.6, age)));
    // macro variation that survives distance (20–300 m): per-building age tone (older = darker, greyer), sun-
    // bleached south / west faces vs damp north faces, a soot / grime gradient under the eaves and a broad
    // darker damp band along the foot of the wall
    float lumA = dot(albedo, vec3(0.299, 0.587, 0.114));
    albedo = mix(albedo, vec3(lumA) * vec3(1.02, 0.99, 0.94), 0.3 * oldness);
    albedo *= mix(1.05, 0.84, oldness * age);
    float sunF = clamp(N.z * 0.75 - N.x * 0.55, -1.0, 1.0);
    albedo = mix(albedo, mix(vec3(lumA), albedo, 0.7) * 1.08, smoothstep(0.1, 0.9, sunF) * 0.35 * oldness);
    albedo *= 1.0 - 0.08 * smoothstep(0.2, 0.9, -sunF) * oldness;
    float eaveG = info * (1.0 - smoothstep(0.0, 2.6 + 2.0 * nm.r, dTop)) * (0.55 + 0.45 * smoothstep(0.2, 0.7, stv));
    albedo *= 1.0 - 0.22 * eaveG * oldness * wStr;
    albedo *= 1.0 - 0.24 * (1.0 - smoothstep(0.2, 1.3 + 0.5 * nm.g, y)) * (0.75 + 0.5 * nm.r) * oldness * wStr; // grimy foot: splash, bikes, hands
    float tide = 0.35 + 0.6 * oldness + 0.35 * (nm.g - 0.5) + 0.1 * (grain - 0.5) + 0.2 * (np.r - 0.5);
    float damp = 1.0 - smoothstep(tide - 0.14, tide + 0.03, y);
    float salt = smoothstep(tide - 0.08, tide + 0.0, y) * (1.0 - smoothstep(tide + 0.0, tide + 0.07, y));
    albedo *= mix(vec3(1.0), vec3(0.74, 0.73, 0.67), damp * 0.75 * oldness * wStr);
    albedo = mix(albedo, vec3(0.86, 0.85, 0.8) * (0.9 + 0.2 * grain), salt * 0.14 * smoothstep(0.35, 0.65, nm.b) * oldness * wStr);
    float north = smoothstep(0.15, 0.85, -N.z);
    float algae = north * oldness * (damp * 0.9 + 0.55 * smoothstep(0.35, 0.9, stv) * (1.0 - smoothstep(0.0, 7.0, y)));
    albedo = mix(albedo, albedo * vec3(0.6, 0.72, 0.46), clamp(algae * wStr, 0.0, 0.75));
    if (pat < 0.5) {
      // peeling paint / spalled render: lower storeys, under the copings and around the corners
      // irregular patches: two noise scales + grain → ragged outlines; mostly at the foot of the wall, under
      // the copings and at the corners, almost none on the open wall
      float pv = np.g * 0.55 + nm.g * 0.25 + grain * 0.2 + 0.12 * (sn - 0.5);
      float zone = 0.9 * (1.0 - smoothstep(0.3, 2.4, y)) + 0.6 * underTop + 0.45 * corner;
      float thr = 0.92 - 0.3 * oldness * zone;
      float ew = 0.006 + fq.x * 0.06;
      float peel = smoothstep(thr, thr + ew, pv) * step(0.3, oldness);
      float rim = smoothstep(thr - 0.02, thr, pv) - peel;
      vec3 sub = fract(seed * 0.377) > 0.62 ? vec3(0.56, 0.36, 0.28) : albedo * 0.72 + vec3(0.12, 0.115, 0.1);
      albedo = mix(albedo, sub * (0.85 + 0.3 * grain), peel * 0.85);
      albedo *= 1.0 - 0.1 * rim * step(0.3, oldness);
    }
  }
  if (uBhDebug > 0.5 && uBhDebug < 2.5) {
    // debug 1: weathering mask on white; debug 2: wall-quad info (red = corner, green = under top)
    albedo = uBhDebug < 1.5 ? vec3(macro) * mix(vec3(1.0), dirtTint, clamp(dirt, 0.0, 0.9))
                            : vec3(1.0 - corner, 1.0 - underTop, info);
    if (vB.x > 0.5 && vB.y > 0.5 && uBhDebug < 1.5) {
      vec2 dcell = floor(vFac);
      vec2 dpm = (vFac - dcell) * csz;
      vec4 dwr = vA;
      float ddS = dpm.y < dwr.z ? dwr.z - dpm.y : (dcell.y + 1.0 < vB.y && dpm.y > dwr.w ? csz.y + dwr.z - dpm.y : 1e3);
      float dinX = smoothstep(dwr.x - 0.1, dwr.x + 0.06, dpm.x) * (1.0 - smoothstep(dwr.y - 0.06, dwr.y + 0.1, dpm.x));
      float drs = dinX * (1.0 - smoothstep(0.0, 0.5 + 2.2 * sn * sn, ddS)) * smoothstep(0.1, 0.8, sn);
      bool inWin = abs(dpm.x - (dwr.x + dwr.y) * 0.5) < (dwr.y - dwr.x) * 0.5 && abs(dpm.y - (dwr.z + dwr.w) * 0.5) < (dwr.w - dwr.z) * 0.5;
      albedo *= mix(vec3(1.0), dirtTint, clamp(drs, 0.0, 1.0) * 0.7 * wStr);
      if (inWin && !curtain) albedo = vec3(0.2, 0.3, 0.5);
    }
    return;
  }

  if (vB.x < 0.5 || vB.y < 0.5) return;
  vec2 cell = floor(vFac);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= vB.x || cell.y >= vB.y) return;
  vec2 f = vFac - cell;
  vec2 pm = f * csz;
  vec4 wr = vA;
  vec2 wc = vec2(wr.x + wr.y, wr.z + wr.w) * 0.5;
  vec2 wh = vec2(wr.y - wr.x, wr.w - wr.z) * 0.5;
  float px = max(fFac.x, fFac.y);

  // ── window depth: the opening is a reveal revD deep with frame + glass at its back, and a stone sill
  //    projects below it. Parallax in the cell's (u, y) metres: the view ray is traced into the hole (jambs,
  //    head and the sill's inner part seen in the reveal) and out against the sill box; reveal and sill also
  //    shade the glass / the wall below from the sun. Fades out with the cell's pixel size (no popping).
  float depthK = uWinDepth * step(0.5, uDetail) * (1.0 - smoothstep(0.05, 0.2, px));
  bool sillW = (style < 1.5 || (style > 3.5 && style < 5.5)) && !(pat > 1.5 && pat < 2.5);
  float revD = (curtain ? 0.0 : (style > 6.5 ? 0.07 : (style > 5.5 ? 0.09 : (ribbon ? 0.06 : (style > 3.5 && style < 4.5 ? 0.1 : 0.14))))) * depthK;
  int dSurf = 0;       // 1 jamb, 2 head, 3 inner sill (in the reveal), 4 sill front, 5 sill top, 6 sill underside, 7 sill end
  float dDepth = 0.0;  // where along the reveal / sill the hit lands (0 = wall plane … 1 = glass / sill nose)
  vec3 dN = N;
  vec2 dQ = q;
  float sunShade = 1.0;
  if (revD > 0.001) {
    vec2 k = vec2(dot(V, Tu), V.y) / max(-dot(V, N), 0.06); // lateral metres per metre into the wall
    vec3 st = vec3(dot(uSunDir, Tu), uSunDir.y, dot(uSunDir, N));
    vec2 ks = st.xy / max(st.z, 0.03);                     // … per metre out toward the sun
    float sunOn = step(0.03, st.z) * step(0.0, uSunDir.y) * uDaylight;
    float sp = 0.06 * depthK;
    vec2 bLo = vec2(wr.x - 0.05, wr.z - 0.065), bHi = vec2(wr.y + 0.05, wr.z);
    // inside the near-LOD range, wall() quads (vD.w > 0) have real sill geometry: keep only its sun shadow
    bool geoSill = vD.w > 0.5 && distance(vWPos, uGeoWin.xyz) < uGeoWin.w;
    if (sillW && wr.z > 0.2) {
      // sill box in front of the wall; the ray from the wall point out toward the camera is (pm - k z, z)
      vec2 dir = -k;
      vec2 dS = mix(vec2(1e-4), sign(dir) * max(abs(dir), vec2(1e-4)), abs(sign(dir)));
      vec2 t1 = (bLo - pm) / dS, t2 = (bHi - pm) / dS;
      vec2 tf = max(t1, t2);
      vec2 tn = min(t1, t2);
      float tIn = max(max(tn.x, tn.y), 0.0);
      float tOut = min(min(tf.x, tf.y), sp);
      if (tIn < tOut && !geoSill) {
        // the face seen = where the camera ray enters = where this outward ray leaves
        dSurf = tOut >= sp - 1e-5 ? 4 : (tf.y < tf.x ? (dir.y > 0.0 ? 5 : 6) : 7);
        dDepth = tOut / sp;
        dN = dSurf == 4 ? N : (dSurf == 5 ? vec3(0.0, 1.0, 0.0) : (dSurf == 6 ? vec3(0.0, -1.0, 0.0) : Tu * sign(dir.x)));
      } else if (sunOn > 0.0) {
        // the sill's shadow on the wall below
        vec2 dL = mix(vec2(1e-4), sign(ks) * max(abs(ks), vec2(1e-4)), abs(sign(ks)));
        vec2 l1 = (bLo - pm) / dL, l2 = (bHi - pm) / dL;
        vec2 lf = max(l1, l2), ln = min(l1, l2);
        float sh = smoothstep(0.0, 0.006, min(min(lf.x, lf.y), sp) - max(max(ln.x, ln.y), 0.0));
        sunShade = 1.0 - 0.5 * sh * sunOn;
      }
    }
    if (dSurf == 0 && all(greaterThan(pm, wr.xz)) && all(lessThan(pm, wr.yw))) {
      vec2 kd = k * revD;
      vec2 kdS = mix(vec2(1e-5), sign(kd) * max(abs(kd), vec2(1e-5)), abs(sign(kd)));
      // fraction of the depth at which the ray leaves the opening through a side
      vec2 sEx = vec2(kd.x > 0.0 ? (wr.y - pm.x) : (wr.x - pm.x), kd.y > 0.0 ? (wr.w - pm.y) : (wr.z - pm.y)) / kdS;
      float sHit = min(min(sEx.x, sEx.y), 1.0);
      vec2 hp = pm + kd * sHit;
      dQ = q + (hp - pm) * vec2(uSign, 1.0);
      if (sHit < 1.0) {
        dSurf = sEx.x < sEx.y ? 1 : (kd.y > 0.0 ? 2 : 3);
        dDepth = sHit;
        dN = dSurf == 1 ? -Tu * sign(kd.x) : vec3(0.0, dSurf == 2 ? -1.0 : 1.0, 0.0);
      } else {
        pm = hp; // the glass plane: frame, panes, curtains and the room shift with the view
        f = pm / csz;
      }
      // sun through the opening: the point (hp, depth) moved out toward the sun must leave through the hole
      vec2 ex = hp + ks * revD * sHit;
      vec2 ed = abs(ex - wc) - wh;
      float inS = 1.0 - smoothstep(-0.006, 0.006, max(ed.x, ed.y));
      sunShade = 1.0 - 0.55 * (1.0 - inS) * sunOn;
    }
  }
  if (uBhDebug > 2.5 && uBhDebug < 3.5 && revD > 0.001) {
    albedo = dSurf == 0 ? albedo * vec3(0.6, 1.0, 1.0) : (dSurf == 1 ? vec3(1, 0, 0) : (dSurf == 2 ? vec3(0, 1, 0) : (dSurf == 3 ? vec3(0, 0, 1) : vec3(1, 1, 0))));
    return;
  }
  if (dSurf > 0) {
    // reveal returns take the wall's own surface; the sill is pale stone / concrete with grime on top
    vec3 sillC = vec3(0.8, 0.78, 0.73) * (0.86 + 0.18 * fract(seed * 0.731)) * (0.94 + 0.08 * grain);
    if (pat > 4.5) sillC = mix(sillC, uFrameCols[frameIdx], 0.6) * 0.95; // panel / smooth walls: metal sill
    // the returns carry the wall's surface turned through 90° (brick headers / render on the reveal), so the
    // arris reads as a corner instead of the pattern running on across it
    vec2 rq = dSurf == 1 ? vec2(dDepth * revD + 0.37, dQ.y) : vec2(dQ.x, dDepth * revD + 0.21);
    vec3 c = baseAlb * bhWallPattern(pat, rq, seed + 3.0, fq, nm, grain) * (albedo / max(baseAlb * bhWallPattern(pat, q, seed, fq, nm, grain), vec3(1e-3)));
    // depth AO toward the frame, a dark contact line where the reveal meets the frame, a worn pale arris
    float arris = (1.0 - smoothstep(0.0, 0.08, dDepth)) * 0.18;
    float contact = smoothstep(0.82, 0.97, dDepth) * 0.35;
    if (dSurf == 1) c *= (1.0 - 0.45 * dDepth) * (1.0 - contact) * (1.0 + arris);
    else if (dSurf == 2) c *= (0.72 - 0.3 * dDepth) * (1.0 - contact);
    else if (dSurf == 3) c = (sillW ? sillC : c) * (1.0 - 0.15 * dDepth);
    else if (dSurf == 5) c = sillC * mix(0.78, 1.0, smoothstep(0.0, 0.7, dDepth)) * (0.9 + 0.1 * nm.g);
    else if (dSurf == 6) c = sillC * mix(0.7, 0.35, step(0.62, dDepth) * step(dDepth, 0.8)); // drip groove
    else c = sillC * (dSurf == 4 ? 0.95 : 0.9);
    albedo = c * sunShade;
    bhNW = dN;
    rough = 0.85;
    return;
  }
  vec2 d = abs(pm - wc) - wh;
  float edge = -max(d.x, d.y);
  if (style > 4.5 && style < 5.5) {
    float r = wh.x;
    float yc = wr.w - r;
    if (pm.y > yc) edge = min(pm.x - wr.x, min(wr.y - pm.x, r - length(vec2(pm.x - wc.x, pm.y - yc))));
  }
  if (curtain) edge = 1.0; // the whole cell is glazing (vision + spandrel glass)
  // level of detail: cells smaller than a few pixels fade to an average look
  float geoDetail = 1.0 - smoothstep(0.3, 0.8, px);
  float detail = geoDetail * uDetail;
  float winFrac = curtain ? 1.0 : clamp((4.0 * wh.x * wh.y) / max(csz.x * csz.y, 1e-3), 0.0, 1.0);
  float nightF = clamp(uLights * (0.42 + 0.58 * uNight), 0.0, 1.0);
  // lit crown of tall office towers at night (uplight wash on the top floors of each tier)
  float crown = (curtain || ribbon) && prof > 0.5 && prof < 1.5 ? info * step(44.0, vD.z) * smoothstep(vD.z - 11.0, vD.z - 0.6, y) * nightF : 0.0;

  if (edge < 0.0) {
    // wall between the windows: per-floor tint drift + rain streaks below the sills
    albedo *= sunShade;
    albedo *= 1.0 + (bhHash12(vec2(cell.y + 0.5, seed * 1.71)) - 0.5) * 0.09 * wStr;
    if (!curtain) {
      // rain streaks under the sills — not under every window (no barcode): per window a different
      // amount, length and darkness; some only drip from the sill ends
      float dS = pm.y < wr.z ? wr.z - pm.y : (cell.y + 1.0 < vB.y && pm.y > wr.w ? csz.y + wr.z - pm.y : 1e3);
      // the window above this wall pixel (the one whose sill drips here)
      vec2 wcell = vec2(cell.x, pm.y < wr.z ? cell.y : cell.y + 1.0);
      float hw1 = bhHash13(vec3(wcell, seed + 31.0)), hw2 = bhHash13(vec3(wcell.yx + 5.0, seed + 47.0));
      float amt = smoothstep(0.25, 0.75, hw1);                  // ~half the windows streak visibly
      float lenK = 0.35 + 1.4 * hw2;                            // short drips … long runs
      float drk = 0.35 + 0.6 * fract(hw1 * 7.31);
      float inX = smoothstep(wr.x - 0.1, wr.x + 0.06, pm.x) * (1.0 - smoothstep(wr.y - 0.06, wr.y + 0.1, pm.x));
      float run = 1.0 - smoothstep(0.0, (0.5 + 2.2 * sn * sn) * lenK, dS);
      float ew = max(0.09, fq.x * 1.25);
      float ends = (1.0 - smoothstep(0.0, ew, abs(pm.x - wr.x - 0.05))) * step(0.3, fract(hw2 * 3.7)) + (1.0 - smoothstep(0.0, ew, abs(pm.x - wr.y + 0.05))) * step(0.3, fract(hw2 * 5.3));
      ends *= 0.09 / ew;
      float rs = inX * run * smoothstep(0.1, 0.8, sn) * amt + ends * (1.0 - smoothstep(0.0, (1.3 + 1.8 * sn) * lenK, dS)) * (0.4 + 0.6 * amt);
      albedo *= mix(vec3(1.0), dirtTint, clamp(rs, 0.0, 1.0) * 0.7 * drk * wStr);
      if ((pat < 0.5 || (pat > 5.5 && pat < 6.5)) && uWallRelief > 0.5) {
        // rendered walls: patched repairs (a slightly different tone in soft rectangles), hairline cracks
        // running off the window head corners, and a string course / slab band at each floor line
        vec2 pq = floor(q / vec2(0.9, 0.7) + vec2(seed * 0.13, 0.0));
        float ph = bhHash12(pq + seed);
        vec2 pf = abs(fract(q / vec2(0.9, 0.7) + vec2(seed * 0.13, 0.0)) - 0.5);
        float rpatch = step(0.9, ph) * (1.0 - smoothstep(0.38, 0.47, max(pf.x, pf.y)));
        albedo *= 1.0 + rpatch * (fract(ph * 17.3) - 0.35) * 0.12;
        float hc = bhHash13(vec3(cell, seed + 71.0));
        if (hc > 0.6 && fq.x < 0.006) {
          // crack from the nearer top corner of this cell's window, up and outward, wandering
          float side = pm.x < wc.x ? -1.0 : 1.0;
          vec2 c0 = vec2(side < 0.0 ? wr.x : wr.y, wr.w);
          vec2 cq = pm - c0;
          float along = cq.y;
          float len = 0.25 + 0.6 * fract(hc * 9.7);
          float wob = (texture2D(uBhNoise, vec2(along * 0.9, seed * 0.07 + cell.x * 0.31)).g - 0.5) * 0.09;
          float off = cq.x * side - along * (0.45 + 0.4 * fract(hc * 5.1)) - wob;
          float cw = max(0.0016, fq.x * 0.7);
          float crack = (1.0 - smoothstep(cw * 0.5, cw * 1.5, abs(off))) * step(0.0, along) * (1.0 - smoothstep(len * 0.7, len, along));
          albedo *= 1.0 - crack * 0.55 * (0.0016 / cw);
        }
        float sc = fract(seed * 0.3917);
        if (sc > 0.35) {
          // band 14–20 cm at the floor line (bottom of the cell), 2–3 cm proud: lit top bevel, shadow under
          float bh = 0.14 + 0.06 * fract(seed * 0.77);
          float yb = pm.y;
          float inB = step(yb, bh) * step(0.5, cell.y);
          vec3 bt = sc > 0.75 ? vec3(0.86, 0.84, 0.8) / max(baseAlb, vec3(0.2)) : vec3(1.06);
          float aaB = clamp(fq.y / 0.04, 0.0, 1.0);
          float topL = (1.0 - smoothstep(0.0, 0.015, abs(yb - bh))) * (1.0 - aaB) * step(0.5, cell.y);
          float shad = (1.0 - smoothstep(0.0, 0.05, csz.y - yb)) * (1.0 - aaB) * step(cell.y + 1.5, vB.y);
          albedo = mix(albedo, albedo * bt, inB * (1.0 - aaB * 0.5));
          albedo *= 1.0 + 0.18 * topL * uDaylight - 0.35 * shad;
          if (inB > 0.5 && uWallRelief > 0.5 && aaB < 0.5) bhNW = vec3(0.0);
        }
      }
    }
    emit += albedo * crown * vec3(0.55, 0.62, 0.75);
    if (detail >= 0.999) return;
  }

  // per-room random values
  float r1 = bhHash13(vec3(cell, seed));
  float r2 = bhHash13(vec3(cell.yx + 17.0, seed * 1.37 + 5.0));
  float r3 = bhHash13(vec3(cell + 3.1, seed * 0.71 + 9.0));
  // office floors switch in groups
  bool office = prof > 0.5 && prof < 1.5;
  vec2 unit = cell;
  if (office) unit = vec2(floor(cell.x / 4.0), cell.y);
  float u1 = bhHash13(vec3(unit, seed + 2.0));
  float u2 = bhHash13(vec3(unit.yx + 7.0, seed + 4.0));
  float hr = mod(uHours + (u2 - 0.5) * 1.6 + 24.0, 24.0);
  float occ = bhOccupancy(hr, prof);
  float lit = step(u1, occ);
  if (office) lit *= step(r3, 0.9);
  // light colour
  vec3 lcol = vec3(1.0, 0.5, 0.17);
  if (r2 > 0.72) lcol = vec3(1.0, 0.62, 0.28);
  if (r2 < 0.12) lcol = vec3(1.0, 0.42, 0.12);
  if (office) lcol = mix(vec3(0.62, 0.74, 0.95), vec3(1.0, 0.8, 0.5), r2);
  if (prof > 1.5 && prof < 2.5) lcol = vec3(1.0, 0.66, 0.32);
  if (prof > 2.5 && prof < 3.5) lcol = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.7, 0.4), r2);
  if (prof < 0.5 && r3 < 0.1) {
    float hh = mod(uHours + 24.0, 24.0);
    float tvOn = bhBump(hh < 12.0 ? hh + 24.0 : hh, 18.5, 19.0, 23.6, 24.4);
    float fl = 0.55 + 0.45 * sin(uTime * 7.3 + r1 * 40.0) * sin(uTime * 2.9 + r2 * 17.0);
    lcol = mix(lcol, vec3(0.35, 0.55, 1.0) * (0.6 + 0.7 * fl), tvOn);
  }
  // lit rooms: bright enough to touch the night bloom threshold so districts glow from afar
  float glowI = mix(0.07, 2.7, nightF) * (0.75 + 0.5 * r2);
  if (prof > 1.5 && prof < 2.5) glowI *= 1.25;
  if (prof > 4.5 && prof < 5.5) glowI *= 1.1;

  // ── reflection: per-panel normal ("oil-canning" on curtain walls, wavy old glass elsewhere)
  vec3 gt = uGlassCols[glassIdx];
  float wob = curtain ? 1.0 : (ribbon ? 0.7 : 0.4);
  vec3 Np = normalize(N + (T * ((r1 - 0.5) * 0.04 + (f.x - 0.5) * 0.03) + vec3(0.0, (r2 - 0.5) * 0.03 + (f.y - 0.5) * 0.025, 0.0)) * wob);
  vec3 R = reflect(V, Np);
  vec3 env = bhEnv(R, y, seed, fR, lodC, nightF);
  // sun glint: panels whose reflected azimuth lines up with the sun flash in a vertical streak
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float hAl = dot(normalize(R.xz + vec2(1e-5, 0.0)), sh);
  float vAl = 1.0 - smoothstep(0.05, 0.7, abs(R.y + uReflLift - uSunDir.y));
  float glint = smoothstep(0.972, 0.9985, hAl) * (0.25 + 0.75 * vAl) * (curtain ? 1.6 : (ribbon ? 1.1 : 0.7));
  float cosv = clamp(-dot(V, Np), 0.0, 1.0);
  float F0 = curtain ? 0.26 : (ribbon ? 0.2 : 0.1);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosv, 5.0);
  // coated glass reflects in its own colour. Tint by luminance (env brightness × the glass hue normalised to
  // unit luminance) instead of multiplying colours: a warm sky × teal glass would otherwise turn olive-grey at
  // golden hour. Part of the environment's own chroma is kept so sunsets still warm the glass.
  float tintAmt = curtain ? 0.72 : (ribbon ? 0.5 : 0.2);
  vec3 gtN = gt / max(dot(gt, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  float envL = dot(env, vec3(0.2126, 0.7152, 0.0722));
  vec3 reflTint = mix(vec3(1.0), gtN, tintAmt) * (curtain ? 0.8 : 1.0); // (for the open-sash strip)
  vec3 refl = mix(env, envL * gtN, tintAmt) * (curtain ? 0.8 : 1.0) + uSunCol * glint;

  vec3 transTint = mix(vec3(1.0), gt, curtain ? 0.75 : 0.3);
  // average daylight albedo of a window (room seen through the glass, curtains), cf. the near path
  vec3 avgAlb = vec3(0.16, 0.15, 0.14) * (1.0 - F) * transTint * (curtain ? 0.4 : 1.0);
  vec3 avgGlass = vec3(0.0);
  if (detail < 0.999) {
    // far field: whole blocks of 2^k × 2^k cells switch together (block size follows the pixel
    // footprint) so districts keep contrast when windows are unresolved, while the expected
    // brightness stays the occupancy average (energy-conserving, no popping between levels)
    float avgOcc = bhOccupancy(mod(uHours + 24.0, 24.0), prof) * (office ? 0.9 : 1.0);
    float farLit = avgOcc;
    float hc = r2;
    if (geoDetail < 0.999) {
      float lvl = clamp(log2(max(px, 1e-4) * 2.4), 0.0, 6.0);
      float l0 = floor(lvl);
      float lfr = lvl - l0;
      vec2 bc0 = floor(cell / exp2(l0)), bc1 = floor(cell / exp2(l0 + 1.0));
      float hb0 = bhHash13(vec3(bc0 + 0.37, seed + l0 * 3.17)), hb1 = bhHash13(vec3(bc1 + 0.37, seed + l0 * 3.17 + 3.17));
      farLit = mix(step(hb0, avgOcc), step(hb1, avgOcc), lfr);
      hc = fract(mix(hb0, hb1, step(0.5, lfr)) * 9.73);
    }
    vec3 farCol = office ? mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.8, 0.52), hc) : mix(vec3(1.0, 0.52, 0.2), vec3(1.0, 0.68, 0.36), hc);
    float farGlow = mix(0.07, 2.7, nightF) * (prof > 1.5 && prof < 2.5 ? 1.25 : 1.0);
    if (style > 5.5 && style < 6.5) farGlow = mix(1.6, 2.6, nightF);  // shop windows: lit by day, toned at night (≈ bhShop mean)
    avgGlass = refl * F + farLit * farGlow * farCol * 0.34 * (curtain ? 0.85 : 1.0) + gt * crown * 0.55;
  }

  if (edge < 0.0) {
    // wall pixel far away: fold in the average window look
    albedo = mix(mix(albedo, avgAlb, winFrac * 0.85), albedo, detail);
    emit += (1.0 - detail) * winFrac * avgGlass;
    return;
  }
  if (detail <= 0.0) {
    // window far too small to resolve: exactly the faded result below (glass = avgGlass, frame = 0)
    albedo = avgAlb;
    rough = 0.5; // the glass mirror image is in emit (bhEnv + glint); a low roughness here put a pin-point GGX sun highlight on every pane (bloomed specks)
    emit += avgGlass;
    return;
  }

  // inside the window opening
  bhNW = vec3(0.0);
  float fw = ribbon ? 0.045 : 0.075;
  float frame = 1.0 - smoothstep(fw * 0.7, fw, edge);
  float spandrel = 0.0;
  if (curtain) {
    float ex = min(pm.x, csz.x - pm.x);
    float ey = min(pm.y, csz.y - pm.y);
    float mull = max(1.0 - smoothstep(0.03, 0.045, ex), 1.0 - smoothstep(0.035, 0.055, ey));
    float tr = 1.0 - smoothstep(0.018, 0.03, abs(pm.y - wr.z));
    frame = max(mull, tr * detail);
    spandrel = step(pm.y, wr.z);
  } else if (style > 0.5 && style < 1.5 || style > 4.5 && style < 5.5) {
    float mv = 1.0 - smoothstep(0.022, 0.034, abs(pm.x - wc.x));
    float mh = 1.0 - smoothstep(0.022, 0.034, abs(pm.y - (wr.z + (wr.w - wr.z) * 0.62)));
    frame = max(frame, max(mv, mh) * detail);
  } else if (style > 3.5 && style < 4.5) {
    vec2 gq = (pm - wr.xz) / vec2(0.62, 0.5);
    vec2 gf = abs(fract(gq) - 0.5);
    float bars = 1.0 - smoothstep(0.43, 0.46, gf.x);
    float barsH = 1.0 - smoothstep(0.42, 0.46, gf.y);
    frame = max(frame, (1.0 - bars * barsH) * detail);
  } else if (style > 5.5 && style < 6.5) {
    float kick = 1.0 - step(0.42, pm.y - wr.z);
    float transom = 1.0 - smoothstep(0.03, 0.045, abs(pm.y - (wr.w - 0.55)));
    float mull = 1.0 - smoothstep(0.03, 0.045, abs(fract((pm.x - wr.x) / 1.9 + 0.5) - 0.5) * 1.9);
    frame = max(frame, max(kick, max(transom, mull * step(2.6, wr.y - wr.x))));
  } else if (style > 6.5) {
    float mv = 1.0 - smoothstep(0.03, 0.045, abs(pm.x - wc.x));
    frame = max(frame, mv);
  }
  vec3 fcol = uFrameCols[frameIdx];
  if (curtain || ribbon) fcol = albedo * 0.85;

  // glass: interior seen through the pane
  vec3 rd = vec3(dot(V, T), V.y, -dot(V, N));
  rd.z = max(rd.z, 0.04);
  float litI = lit * glowI;
  bool shopWin = style > 5.5 && style < 6.5;
  // open shops keep their lights on in daytime too
  // (and at night stay readable rather than a blown-out glow: the interior detail carries the window)
  if (shopWin) litI = lit * mix(0.62 + 0.25 * r2, 0.9 + 0.25 * r2, nightF);
  vec3 interior; // lamp-lit radiance seen through the glass
  vec3 dayA;     // daylight-lit albedo seen through the glass
  bool lobbyWin = style > 6.5 && csz.y > 2.6 && prof > 4.5 && prof < 5.5;
  if (lobbyWin) litI = lit * mix(0.55 + 0.2 * r2, 0.85 + 0.2 * r2, nightF);
  if (uDetail > 0.5 && shopWin) interior = bhShop(pm, csz, normalize(rd), seed * 1.37 + shopT * 11.0, shopT, litI, lcol, dayA);
  else if (uDetail > 0.5 && lobbyWin) interior = bhShop(pm, csz, normalize(rd), seed * 1.37 + cell.x * 3.1, 8.0, litI, vec3(1.0, 0.82, 0.6), dayA);
  else if (uDetail > 0.5) interior = bhRoom(pm, csz, normalize(rd), r1 * 31.0 + seed, litI, lcol, prof, style, dayA);
  else {
    interior = lcol * 0.8 * litI;
    dayA = vec3(0.14, 0.13, 0.12);
  }
  // curtains / blinds / nets / plants — band-limited so nothing aliases into moiré
  float wx = (pm.x - wr.x) / max(wr.y - wr.x, 1e-3);
  float wy = (pm.y - wr.z) / max(wr.w - wr.z, 1e-3);
  float fpy = fFac.y * csz.y; // metres per pixel vertically
  float fpx = fFac.x * csz.x;
  float openW = 0.0;
  bool homey = prof < 0.5 || prof > 2.5 && prof < 3.5;
  if (homey) {
    float cr = fract(r3 * 7.13 + r1 * 0.37);
    vec3 cc = mix(vec3(0.86, 0.8, 0.68), vec3(0.76, 0.42, 0.38), step(0.7, r2));
    cc = mix(cc, vec3(0.42, 0.55, 0.66), step(0.9, r2));
    // fabric colour per window: mostly off-whites / creams, some warm reds, greens, blues, greys
    float hcf = fract(r2 * 5.77 + r1 * 0.31);
    cc = hcf < 0.4 ? cc : (hcf < 0.55 ? vec3(0.62, 0.66, 0.58) : (hcf < 0.68 ? vec3(0.55, 0.6, 0.72) : (hcf < 0.8 ? vec3(0.8, 0.72, 0.62) : (hcf < 0.9 ? vec3(0.6, 0.3, 0.28) : vec3(0.7, 0.7, 0.68)))));
    // a printed / striped fabric on some (band-limited)
    float fpat = fract(r1 * 9.13);
    float fstr = bhStripe(wx * (wr.y - wr.x) * 9.0, fpx * 9.0);
    if (fpat > 0.8) cc *= 0.88 + 0.16 * fstr;
    float fa = 1.0 - smoothstep(0.15, 0.6, fpx * 60.0 / max(wr.y - wr.x, 0.3) / 6.2832);
    if (r3 > 0.58) {
      // side curtains (drawn / half drawn / one side only), folds; a net between them on some
      float cov = r3 > 0.86 ? 0.5 : (r3 > 0.72 ? 0.3 : 0.2);
      float oneSide = step(0.85, fract(r1 * 3.3));
      float side = clamp(step(wx, cov) * (1.0 - oneSide) + step(1.0 - cov * (1.0 + oneSide), wx), 0.0, 1.0);
      float folds = 0.82 + 0.18 * sin(wx * 60.0 + r1 * 6.0) * fa;
      float tie = step(0.5, fract(r2 * 4.1)) * (1.0 - smoothstep(0.0, 0.05, abs(wy - 0.45))) * 0.25 * fa;
      vec3 c2 = cc * folds * (1.0 - tie);
      // pelmet / curtain rail shadow along the top
      float pel = step(0.92, wy) * step(0.6, fract(r3 * 17.0));
      c2 = mix(c2, cc * 0.7, pel);
      side = max(side, pel);
      float netB = step(0.55, fract(r1 * 2.71)) * (1.0 - side);
      interior = mix(interior, vec3(0.95, 0.92, 0.86) * lcol * litI * 0.5, netB * 0.7);
      dayA = mix(dayA, vec3(0.72, 0.72, 0.7) * (0.92 + 0.08 * bhStripe(wx * (wr.y - wr.x) * 30.0, fpx * 30.0)), netB * 0.7);
      interior = mix(interior, c2 * lcol * litI * 0.75, side);
      dayA = mix(dayA, c2 * 0.7, side);
    } else if (r3 > 0.36) {
      // net curtain (full height or café-style lower half): translucent white with a lace hem, glows when lit
      float netTop = cr > 0.45 ? 1.0 : 0.55;
      float hem = (1.0 - smoothstep(0.0, 0.03, abs(wy - netTop + 0.04))) * fa;
      float lace = 0.9 + 0.1 * bhStripe(wx * (wr.y - wr.x) * 24.0, fpx * 24.0) * fa;
      float net = step(wy, netTop) * (0.72 + 0.15 * hem);
      interior = mix(interior, vec3(0.95, 0.9, 0.8) * lcol * litI * 0.55, net);
      dayA = mix(dayA, vec3(0.74, 0.74, 0.72) * lace, net);
    } else if (r3 > 0.2) {
      // roller blind partly down, or a venetian blind (slats, box-filtered)
      float blindTo = 1.0 - (0.15 + 0.6 * cr);
      vec3 rb = mix(vec3(0.88, 0.84, 0.74), cc, step(0.6, cr));
      float ven = step(0.5, fract(r2 * 7.9));
      if (ven > 0.5) rb = mix(vec3(0.85, 0.84, 0.8), vec3(0.62, 0.46, 0.3), step(0.7, cr)) * (0.72 + 0.28 * bhStripe(pm.y * 22.0, fpy * 22.0));
      float bl = step(blindTo, wy);
      // the blind's bottom bar
      rb *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.025, wy - blindTo)) * fa;
      interior = mix(interior, rb * lcol * litI * 0.6, bl);
      dayA = mix(dayA, rb * 0.62, bl);
    } else if (r3 > 0.12) {
      // curtains fully drawn (a bedroom in the daytime): a fabric wall with a gap in the middle
      float gap = 1.0 - smoothstep(0.0, 0.02, abs(wx - 0.5 - (cr - 0.5) * 0.1) - 0.012);
      float folds = 0.84 + 0.16 * sin(wx * 70.0) * fa;
      vec3 c2 = cc * folds * (1.0 - 0.5 * gap);
      interior = mix(interior, c2 * lcol * litI * 0.8, 1.0 - gap * 0.6);
      dayA = mix(dayA, c2 * 0.72, 1.0 - gap * 0.6);
    }
    // a pot plant on some sills
    if (fract(r1 * 5.31) > 0.78) {
      float pxc = 0.22 + 0.56 * fract(r2 * 3.7);
      float leaf = 1.0 - smoothstep(0.1, 0.13, length(vec2((wx - pxc) * (wr.y - wr.x), (pm.y - wr.z - 0.22) * 1.25)));
      float pot = step(abs((wx - pxc) * (wr.y - wr.x)), 0.08) * step(pm.y - wr.z, 0.13);
      vec3 plantC = mix(vec3(0.16, 0.3, 0.1), vec3(0.3, 0.46, 0.16), fract(r3 * 11.0));
      interior = mix(interior, plantC * litI * 0.15, leaf * detail);
      dayA = mix(dayA, plantC, leaf * detail);
      interior = mix(interior, vec3(0.5, 0.26, 0.15) * litI * 0.15, pot * detail);
      dayA = mix(dayA, vec3(0.5, 0.26, 0.15), pot * detail);
    }
    // a few windows stand open in fine weather (no glass reflection in the opening)
    openW = step(0.94, fract(r2 * 13.7 + r1 * 3.1)) * smoothstep(0.55, 0.85, uDaylight) * step(0.5, wx);
  } else if (office && fract(u1 * 3.71 + cell.y * 0.37) < 0.4) {
    // venetian blinds, coherent per office unit; slats box-filtered (no moiré)
    float blindTo = 1.0 - (0.25 + 0.6 * fract(u2 * 5.3));
    float slat = 0.75 + 0.25 * bhStripe(pm.y * 9.0, fpy * 9.0);
    vec3 bc = vec3(0.78, 0.78, 0.74) * slat;
    float bl = step(blindTo, wy);
    interior = mix(interior, bc * lcol * litI * 0.6, bl);
    dayA = mix(dayA, bc * 0.55, bl);
  }
  // recess shadow under the lintel and beside the jambs
  float recess = curtain ? 1.0 : smoothstep(0.0, 0.22, wr.w - pm.y) * mix(0.75, 1.0, smoothstep(0.0, 0.12, min(pm.x - wr.x, wr.y - pm.x)));
  interior *= mix(0.45, 1.0, recess);
  dayA *= mix(0.4, 1.0, recess);
  // spandrel glass: opaque, darker tinted backing
  interior = mix(interior, vec3(0.0), spandrel);
  dayA = mix(dayA, gt * 0.18, spandrel);
  float Fs = mix(F, min(1.0, F * 1.15 + 0.08), spandrel) * (1.0 - openW);
  // reflection: brighter toward the top of each punched pane (sky above, street below)
  float paneGrad = curtain ? 1.0 : mix(0.75, 1.2, wy);
  // punched windows: the reveal and the street canyon cut the reflected sky down, so the curtains / room read
  float reflK = (curtain || ribbon) ? 1.0 : 0.78;
  vec3 glass = interior * (1.0 - Fs) * transTint + refl * Fs * mix(0.65, 1.0, recess) * paneGrad * reflK;
  vec3 glassAlb = dayA * (1.0 - Fs) * transTint * (curtain ? 0.4 : (ribbon ? 0.7 : (homey ? 1.18 : 1.0)));
  // open sash: the swung pane shows a strip of darker, skewed reflection at the hinge side
  glass = mix(glass, env * 0.35 * reflTint, openW * (1.0 - smoothstep(0.62, 0.66, wx)));
  glass += gt * crown * mix(0.55, 0.18, spandrel);
  if (detail < 0.999) {
    glass = mix(avgGlass, glass, detail);
    glassAlb = mix(avgAlb, glassAlb, detail);
    frame *= detail;
  }
  albedo = mix(glassAlb, fcol, frame) * sunShade;
  rough = mix(0.5, (curtain || ribbon) ? 0.34 : 0.7, frame);
  // metallic mullions on curtain walls pick up the environment (sheen lines between panels)
  metal = (curtain || ribbon) ? frame * 0.7 : 0.0;
  // closed shops: many pull down a ribbed steel roller shutter (tagged with graffiti on some), a few leave
  // it half down in the early morning
  if (shopWin && uWear > 0.5) {
    float sh = bhHash12(vec2(seed, 4.4));
    float hs = mod(uHours + 24.0, 24.0);
    float open = step(sh * 0.5 + 0.25, bhOccupancy(hs, 2.0));
    float hasShutter = step(sh, 0.62);
    float halfD = (1.0 - step(0.5, fract(sh * 7.3))) * bhBump(hs, 6.2, 6.6, 8.2, 8.8);
    float downTo = mix(wr.w + 0.01, wr.z + (wr.w - wr.z) * 0.55, halfD);
    float cover = hasShutter * max(1.0 - open, halfD) * step(min(downTo, mix(wr.z - 0.01, downTo, halfD)), pm.y) * step(pm.y, wr.w + 0.02) * step(wr.x - 0.02, pm.x) * step(pm.x, wr.y + 0.02);
    if (cover > 0.5) {
      float rib = 0.82 + 0.18 * bhStripe(pm.y / 0.075, fpy / 0.075 * 1.5);
      vec3 sc = mix(vec3(0.52, 0.53, 0.54), vec3(0.62, 0.6, 0.55), step(0.5, fract(sh * 3.1))) * rib;
      // graffiti tags: blobby letters in 1–2 colours on the lower halfD
      float tagOn = step(0.45, fract(sh * 11.7));
      vec2 tq = vec2(pm.x * 1.4 + seed, pm.y * 2.2);
      float tg = smoothstep(0.55, 0.6, texture2D(uBhNoise, tq * 0.09).g * 0.6 + texture2D(uBhNoise, tq * 0.37).a * 0.4) * step(pm.y, wr.z + (wr.w - wr.z) * 0.7) * tagOn;
      vec3 tc = mix(vec3(0.85, 0.25, 0.3), vec3(0.2, 0.35, 0.75), step(0.5, fract(sh * 5.9)));
      sc = mix(sc, tc * 0.9, tg * 0.85);
      sc *= mix(1.0, 0.75, smoothstep(wr.z + 0.6, wr.z, pm.y));   // grime at the bottom
      albedo = sc;
      rough = 0.55;
      metal = 0.35;
      emit = vec3(0.0);
      return;
    }
  }
  emit += glass * (1.0 - frame) + fcol * crown * 0.4 * frame;
}

void bhRoof(inout vec3 albedo, inout float rough, inout vec3 emit, vec3 N, vec3 V) {
  float pat = floor(vA.x + 0.5);
  float seed = floor(vA.y + 0.5);
  vec2 p = vFac;
  vec2 fp = fwidth(p);
  // world directions of +p.x (along the ridge) and +p.y (up the slope): cotangent frame from derivatives
  vec3 dpx = dFdx(vWPos), dpy = dFdy(vWPos);
  vec2 dux = dFdx(p), duy = dFdy(p);
  vec3 c1 = cross(dpy, N), c2 = cross(N, dpx);
  vec3 rT = c1 * dux.x + c2 * duy.x, rB = c1 * dux.y + c2 * duy.y;
  float rIm = inversesqrt(max(max(dot(rT, rT), dot(rB, rB)), 1e-12));
  rT *= rIm;
  rB *= rIm;
  vec2 so = vec2(fract(seed * 0.1373), fract(seed * 0.3119)) * 17.0;
  vec4 nM = texture2D(uBhNoise, p * 0.035 + so);                          // r ~7 m, g ~1.8 m, b 0.45 m × 14 m streaks
  vec4 nF = texture2D(uBhNoise, p * 0.12 + so.yx);                        // r ~2 m, g ~0.5 m
  float grain = texture2D(uBhNoise, p * 0.5 + so).a;                      // a ~3 cm gravel / grit
  float stv = nM.b;                                                       // down-slope streaks (v runs up the slope)
  if (pat < 0.5) { // flat roof: membrane sheets with seams, repairs, gravel ballast, stains, drains, moss
    float kindR = fract(seed * 0.618 + 0.13);
    float sv = p.y / 1.05;
    float row = floor(sv);
    float seam = bhLine(sv, 0.025, fp.y / 1.05 * 1.3);
    float cu = p.x / 6.2 + bhHash12(vec2(row, seed));
    float seam2 = bhLine(cu, 0.004, fp.x / 6.2 * 1.3);
    float sheet = bhHash12(vec2(row, floor(cu)) + seed * 0.3);
    vec3 mem = vec3(0.92 + 0.12 * sheet) * (1.0 - 0.3 * max(seam, seam2));
    // patched repairs (lighter, newer sheets) in soft rectangles
    vec2 pc = floor(p / vec2(4.4, 3.2) + so);
    vec2 pf = fract(p / vec2(4.4, 3.2) + so);
    float pr = step(0.8, bhHash12(pc + 5.5)) * step(abs(pf.x - 0.5), 0.32) * step(abs(pf.y - 0.5), 0.28);
    mem *= 1.0 + 0.1 * pr;
    vec3 grav = vec3(0.82 + 0.34 * grain) * vec3(1.0, 0.97, 0.92);
    float gz = kindR < 0.34 ? 1.0 : (kindR < 0.62 ? smoothstep(0.42, 0.58, nM.g) : 0.0);
    vec3 c = mix(mem, grav, gz);
    // ponding stains and dirt
    float stain = smoothstep(0.56, 0.8, nF.r) * 0.2 + smoothstep(0.58, 0.85, nM.r) * 0.16;
    c *= 1.0 - stain;
    // drains: one per ~8 m cell, dark mouth, wet ring around it
    vec2 dcl = floor(p / 8.0 + so.yx);
    vec2 dp = (fract(p / 8.0 + so.yx) - 0.5) * 8.0 - (vec2(bhHash12(dcl), bhHash12(dcl + 3.1)) - 0.5) * 3.6;
    float drr = length(dp);
    float fw = max(max(fp.x, fp.y), 1e-3);
    float hasD = step(0.45, bhHash12(dcl + 7.0));
    float mouth = (1.0 - smoothstep(0.13 - fw, 0.13 + fw, drr)) * hasD;
    float wet = (1.0 - smoothstep(0.25, 1.7, drr)) * hasD;
    c *= (1.0 - 0.7 * mouth) * (1.0 - 0.16 * wet);
    albedo *= c * (0.94 + 0.12 * nF.g);
    // moss / sedum on some roofs (green roof patches)
    float green = step(0.7, fract(seed * 0.377 + 0.21)) * smoothstep(0.52, 0.66, nM.g * 0.4 + nF.g * 0.6);
    albedo = mix(albedo, vec3(0.2, 0.3, 0.11) * (0.75 + 0.5 * grain), green * 0.9);
    rough = 0.95;
    return;
  }
  if (pat < 1.5 || (pat > 1.5 && pat < 2.5)) { // clay tiles / slate
    bool slate = pat > 1.5;
    float course = slate ? 0.3 : 0.4;
    float tw = slate ? 0.46 : 0.32;
    float row = floor(p.y / course);
    float fy = fract(p.y / course);
    float bx = p.x / tw + mod(row, 2.0) * 0.5;
    float col = floor(bx);
    float fx = fract(bx);
    float aa = clamp(fp.y / course * 1.8, 0.0, 1.0);
    float tn = bhHash12(vec2(col, row) + seed);
    float shade = mix(1.0, 0.58, smoothstep(0.6, 1.0, fy));
    float lip = 1.0 + 0.14 * (1.0 - smoothstep(0.0, 0.1, fy));
    float curve = slate ? 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.06, min(fx, 1.0 - fx))) : 0.8 + 0.22 * sin(fx * 3.14159);
    float v = shade * lip * curve * ((slate ? 0.82 : 0.84) + (slate ? 0.32 : 0.28) * tn);
    float tileAvg = slate ? 0.88 : 0.86;
    // patches of re-laid / sun-faded tiles and down-slope streaks survive distance
    float patchT = 0.88 + 0.2 * nM.g;
    float streak = 1.0 - 0.2 * stv;
    float eaveD = 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.9, p.y));
    vec3 cT = albedo * mix(v, tileAvg, aa) * patchT * streak * eaveD * (0.92 + 0.16 * nM.r);
    // lichen / moss (yellow-green on clay, pale on slate)
    float lich = smoothstep(0.62, 0.84, nM.g * 0.5 + nF.r * 0.5) * (slate ? 0.3 : 0.38);
    vec3 lichC = slate ? cT * vec3(1.12, 1.16, 1.06) : mix(cT, vec3(0.36, 0.38, 0.2), 0.55);
    albedo = mix(cT, lichC * (0.85 + 0.25 * grain), lich);
    // per-roof age (older roofs darker, browner, flatter in colour) + moss on the shaded north slopes
    float age = fract(seed * 0.6180339 + 0.37) * uWear;
    albedo *= mix(1.06, 0.84, age);
    albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.59, 0.11))) * vec3(1.02, 0.98, 0.9), 0.28 * age);
    float northR = smoothstep(-0.05, 0.45, -N.z) * smoothstep(0.2, 0.7, N.y);
    float moss = northR * smoothstep(0.5, 0.78, nM.g * 0.55 + nF.r * 0.45 + 0.22 * age) * (0.4 + 0.6 * age);
    moss = max(moss, northR * (1.0 - smoothstep(0.0, 1.4, p.y)) * 0.55 * age); // damp eaves
    albedo = mix(albedo, mix(vec3(0.17, 0.21, 0.09), vec3(0.3, 0.32, 0.14), grain), clamp(moss * (slate ? 0.6 : 0.85), 0.0, 0.85));
    rough = slate ? 0.7 : 0.88;
    if (uWallRelief > 0.5 && uDetail > 0.5) {
      // each course leans out toward its butt (the visible thickness of the overlap), clay pantiles roll
      // across their width; a per-tile tilt so no two tiles catch the light alike
      float fade = 1.0 - smoothstep(0.012, 0.035, max(fp.x, fp.y));
      float th = slate ? 0.012 : 0.022;
      float sy = -th / course * 1.4 + (1.0 - smoothstep(0.0, 0.07, fy)) * (slate ? 0.5 : 0.8);
      float sxr = slate ? 0.0 : 0.03 * 3.14159 / tw * cos(fx * 3.14159);
      vec2 sl = (vec2(sxr, sy) + (vec2(tn, fract(tn * 5.3)) - 0.5) * 0.08) * fade;
      bhNW = normalize(N - rT * sl.x - rB * sl.y);
    }
    return;
  }
  if (pat < 3.5) { // standing seam metal
    float s = fract(p.x / 0.6);
    float aa = clamp(fp.x / 0.6 * 2.0, 0.0, 1.0);
    float seam = 1.0 - smoothstep(0.0, 0.07, min(s, 1.0 - s));
    albedo *= mix(0.95 + 0.25 * seam, 1.0, aa) * (0.9 + 0.14 * nM.g) * (1.0 - 0.14 * stv);
    rough = 0.5;
    return;
  }
  if (pat < 4.5) { // corrugated sheet (rust streaks)
    float aa = clamp(fp.x / 0.26 * 2.0, 0.0, 1.0);
    albedo *= mix(0.86 + 0.16 * sin(p.x * 6.2832 / 0.26), 0.94, aa) * (0.88 + 0.18 * nF.g);
    albedo = mix(albedo, albedo * vec3(0.9, 0.62, 0.42), smoothstep(0.3, 0.9, stv) * 0.45 + smoothstep(0.6, 0.85, nM.r) * 0.25);
    rough = 0.6;
    return;
  }
  if (pat < 5.5) { // copper patina
    float s = fract(p.x / 0.55);
    float aa = clamp(fp.x / 0.55 * 2.0, 0.0, 1.0);
    float seam = 1.0 - smoothstep(0.0, 0.08, min(s, 1.0 - s));
    albedo *= (0.84 + 0.32 * nM.g) * mix(1.0 + 0.2 * seam, 1.0, aa) * (1.0 - 0.18 * stv);
    rough = 0.65;
    return;
  }
  if (pat < 6.5) { // skylight glazing
    vec2 g = p / vec2(1.2, 0.9);
    vec2 gf = abs(fract(g) - 0.5);
    float aa = clamp(fwidth(g.x) * 2.0, 0.0, 1.0);
    float bar = mix(max(1.0 - smoothstep(0.42, 0.46, gf.x * 1.0) * (1.0 - smoothstep(0.4, 0.46, gf.y)), 0.0), 0.25, aa);
    vec3 R = reflect(V, N);
    float cosv = clamp(-dot(V, N), 0.0, 1.0);
    float F = 0.2 + 0.8 * pow(1.0 - cosv, 5.0);
    float nightF = clamp(uLights * (0.42 + 0.58 * uNight), 0.0, 1.0);
    float occ = bhOccupancy(mod(uHours + 24.0, 24.0), 4.0);
    float litc = step(bhHash12(floor(g * vec2(0.34, 1.0)) + seed), occ);
    vec3 inside = vec3(0.06, 0.07, 0.075) * (0.4 + uDaylight) + litc * vec3(1.0, 0.82, 0.6) * mix(0.05, 1.5, nightF);
    float sk = clamp(R.y + 0.15, 0.0, 1.0);
    vec3 sky = mix(uSkyHor, uSkyZen, sqrt(sk));
    vec3 gl = inside * (1.0 - F) + sky * vec3(0.7, 0.82, 0.9) * F;
    albedo = mix(vec3(0.03), albedo * 0.7, bar);
    rough = mix(0.15, 0.6, bar);
    emit += gl * (1.0 - bar);
    return;
  }
  // deck / painted concrete (helipads, terraces)
  albedo *= (0.9 + 0.12 * nF.g) * (0.95 + 0.08 * grain);
  rough = 0.9;
}
`;

const SHELL_FRAG_MAIN = /* glsl */ `
float bhRough = -1.0;
float bhMetal = -1.0;
vec3 bhEmit = vec3(0.0);
{
  vec3 bN = normalize(vWNrm);
  vec3 bV = normalize(vWPos - cameraPosition);
  vec3 alb = diffuseColor.rgb;
  float rgh = -1.0;
  float mtl = -1.0;
  if (vB.w < 63.5) bhWall(alb, rgh, mtl, bhEmit, bN, bV);
  else bhRoof(alb, rgh, bhEmit, bN, bV);
  // guard: a handful of reveal / glass pixels produced albedo far above 1 (bloomed into specks at 3–10 m)
  alb = clamp(alb, 0.0, 1.0);
  if (any(isnan(bhEmit))) bhEmit = vec3(0.0);
  bhEmit = min(bhEmit, vec3(16.0));
  if (uBhDebug > 3.5) {
    // red NaN albedo, green NaN / Inf emit, blue emit > 6, yellow albedo > 1.2, cyan NaN normal override
    vec3 flag = any(isnan(alb)) ? vec3(1, 0, 0) : (any(isnan(bhEmit)) || any(isinf(bhEmit)) ? vec3(0, 1, 0) : (max(max(bhEmit.r, bhEmit.g), bhEmit.b) > 6.0 ? vec3(0, 0, 1) : (max(max(alb.r, alb.g), alb.b) > 0.999 ? vec3(1, 1, 0) : (any(isnan(bhNW)) ? vec3(0, 1, 1) : vec3(-1.0)))));
    bool bad = flag.x >= 0.0;
    alb = bad ? flag : alb * 0.4;
    bhEmit = bad ? flag * 3.0 : vec3(0.0);
    if (bad) bhNW = vec3(0.0);
  }
  diffuseColor.rgb = alb;
  bhRough = rgh;
  bhMetal = mtl;
}
`;

const LIGHTS_VERT_PARS = /* glsl */ `
attribute vec4 aL;
varying vec4 vL;
`;
const LIGHTS_FRAG_PARS = /* glsl */ `
varying vec4 vL;
uniform float uRealTime;
uniform float uNight;
uniform float uLights;
uniform float uDaylight;
float blHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
`;
const LIGHTS_FRAG_MAIN = /* glsl */ `
{
  float mode = vL.x;
  float ph = vL.y;
  float rate = vL.z;
  float inten = vL.w;
  float nightF = clamp(uLights * (0.45 + 0.55 * uNight), 0.0, 1.0);
  float on = nightF;
  float dayLook = 0.55;
  if (mode > 0.5 && mode < 1.5) {
    float c = fract(uRealTime * rate + ph);
    float flash = 1.0 - smoothstep(0.0, 0.12, c) * (1.0 - smoothstep(0.85, 1.0, c));
    flash = max(flash, 0.0);
    on = mix(0.25, 1.0, nightF) * smoothstep(0.0, 1.0, flash) + 0.06 * nightF;
    dayLook = 0.65;
  } else if (mode > 1.5 && mode < 2.5) {
    float t = uRealTime * rate + ph * 10.0;
    float k = floor(t);
    float flick = step(0.06, blHash(k + ph * 7.0)) * (0.9 + 0.1 * sin(uRealTime * 60.0 + ph * 5.0));
    on = nightF * flick;
  } else if (mode > 2.5 && mode < 3.5) {
    on = 1.0;
    dayLook = 1.0;
  } else if (mode > 3.5) {
    on = nightF * (0.6 + 0.4 * sin(uRealTime * rate + ph * 6.2832));
  }
  diffuseColor.rgb *= dayLook * (1.0 - on) + on * inten;
}
`;

// trim: world position / normal for the lamp light map
const TRIM_VERT_PARS = /* glsl */ `
varying vec3 vThWPos;
varying vec3 vThWNrm;
`;
const TRIM_VERT_MAIN = /* glsl */ `
vThWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vThWNrm = normalize(mat3(modelMatrix) * objectNormal);
`;
const TRIM_FRAG_PARS = /* glsl */ `
varying vec3 vThWPos;
varying vec3 vThWNrm;
${LAMP_GLSL}
`;

// ───────────────────────────────────────────────────────── factory ──

export function createMaterials(g: GlobalUniforms, opts: { legacy?: boolean; wear?: boolean; winDepth?: boolean; wallRelief?: boolean; plinth?: boolean } = {}): BuildingMaterials {
  const legacy = !!opts.legacy;
  const uniforms = {
    uHours: { value: 12 },
    uSkyZen: { value: new THREE.Color('#5b8fc7') },
    uSkyHor: { value: new THREE.Color('#c9dbe6') },
    uGround: { value: new THREE.Color('#4d4a44') },
    uDetail: { value: 1 },
    uSkyGlow: { value: new THREE.Color(0, 0, 0) },
    uSunCol: { value: new THREE.Color(0, 0, 0) },
    uCityCol: { value: new THREE.Color('#6d6a66') },
    uCloudCol: { value: new THREE.Color('#ffffff') },
    uReflLift: { value: 0.3 },
    uBhDebug: { value: 0 },
    uWear: { value: opts.wear === false ? 0 : 1 },
    uWinDepth: { value: opts.winDepth === false ? 0 : 1 },
    uWallRelief: { value: opts.wallRelief === false ? 0 : 1 },
    uPlinth: { value: opts.plinth === false ? 0 : 1 },
    uGeoWin: { value: new THREE.Vector4(0, -1e5, 0, 0) },
  };
  const frameCols = { value: FRAME_COLS.map((c) => new THREE.Color(c)) };
  const glassCols = { value: GLASS_COLS.map((c) => new THREE.Color(c)) };
  const noise = makeNoiseTexture();

  const shell = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 });
  shell.name = 'buildings-shell';
  shell.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uHours: uniforms.uHours,
      uSkyZen: uniforms.uSkyZen,
      uSkyHor: uniforms.uSkyHor,
      uGround: uniforms.uGround,
      uDetail: uniforms.uDetail,
      uFrameCols: frameCols,
      uGlassCols: glassCols,
      uTime: g.uTime,
      uRealTime: g.uRealTime,
      uNight: g.uNight,
      uDaylight: g.uDaylight,
      uDusk: g.uDusk,
      uLights: g.uLights,
    });
    if (!legacy) {
      Object.assign(shader.uniforms, {
        uBhNoise: { value: noise },
        uSkyGlow: uniforms.uSkyGlow,
        uSunCol: uniforms.uSunCol,
        uCityCol: uniforms.uCityCol,
        uCloudCol: uniforms.uCloudCol,
        uReflLift: uniforms.uReflLift,
        uBhDebug: uniforms.uBhDebug,
        uWear: uniforms.uWear,
        uWinDepth: uniforms.uWinDepth,
        uWallRelief: uniforms.uWallRelief,
        uPlinth: uniforms.uPlinth,
        uGeoWin: uniforms.uGeoWin,
        uSunDir: g.uSunDir,
        ...lampUniforms(),
      });
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SHELL_VERT_PARS}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${SHELL_VERT_MAIN}`);
    if (legacy) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${LEGACY_SHELL_FRAG_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${LEGACY_SHELL_FRAG_MAIN}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nif (bhRough >= 0.0) roughnessFactor = bhRough;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += bhEmit;`);
    } else {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${SHELL_FRAG_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${SHELL_FRAG_MAIN}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nif (bhRough >= 0.0) roughnessFactor = bhRough;`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nif (bhMetal >= 0.0) metalnessFactor = bhMetal;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += bhEmit;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nif (dot(bhNW, bhNW) > 0.5) normal = normalize((viewMatrix * vec4(bhNW, 0.0)).xyz);`)
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vWPos, normalize(vWNrm));`,
        );
    }
  };
  shell.customProgramCacheKey = () => (legacy ? 'tinyhaven-buildings-shell-legacy' : 'tinyhaven-buildings-shell-v2');

  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
  trim.name = 'buildings-trim';
  trim.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lampUniforms());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TRIM_VERT_PARS}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${TRIM_VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TRIM_FRAG_PARS}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vThWPos, normalize(vThWNrm));`,
      );
  };
  trim.customProgramCacheKey = () => 'tinyhaven-buildings-trim-v2';

  const lights = new THREE.MeshBasicMaterial({ vertexColors: true });
  lights.name = 'buildings-lights';
  lights.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uRealTime: g.uRealTime, uNight: g.uNight, uLights: g.uLights, uDaylight: g.uDaylight });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${LIGHTS_VERT_PARS}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\nvL = aL;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LIGHTS_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${LIGHTS_FRAG_MAIN}`);
  };
  lights.customProgramCacheKey = () => 'tinyhaven-buildings-lights-v1';

  const signs = new THREE.MeshStandardMaterial({
    roughness: 0.75,
    metalness: 0.0,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0,
    alphaTest: 0.45,
  });
  signs.name = 'buildings-signs';

  return { shell, trim, lights, signs, noise, legacy, uniforms };
}
