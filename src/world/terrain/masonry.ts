// Stonework of the diorama: quay walls (river embankments + harbour sea wall) with coping
// and the south-bank parapet, the four tunnel portals (arched headwalls with voussoirs,
// pilasters, cornices, wing walls, dark lined bores with lamps, darkness veils) and the
// rock outcrops / boulders. One merged mesh (+ one transparent veil mesh).

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityContext } from '../../core/context';
import { RIVER, QUAY_X, SLAB, SIDEWALK_Y } from '../../core/constants';
import { RIDGE_FOOT_Z } from '../../core/plan';
import type { Rng } from '../../core/rng';
import { GeoBuilder, type V3 } from './builder';
import { type TerrainModel, type PortalDef, RIVER_WALL_END_X, SEA_WALL_Z0, SEA_WALL_Z1, RIVER_WALL_T, SEA_WALL_T } from './height';
import { noiseTexture, GLSL_HASH, vnoise } from './noise';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { KIND, type LadderSpot } from './kinds';
import { createRailings, type RailingResult } from './railings';
import { buildCliffs, type CliffResult } from './cliffs';
import type { GlowPoint } from './glow';

export { KIND };
export type { LadderSpot };

export interface WallInfo {
  id: 'riverN' | 'riverS' | 'sea';
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** water-side normal */
  nx: number;
  nz: number;
  thick: number;
  capTop: number;
}

export interface MasonryResult {
  mesh: THREE.Mesh;
  veils: THREE.Mesh;
  rocks: { x: number; z: number; r: number }[];
  ladders: LadderSpot[];
  walls: WallInfo[];
  /** footbridge / jetty x positions on the river walls (railing + parapet gaps) */
  gaps: { x: number; half: number }[];
  railings: RailingResult;
  /** light glows contributed by the stonework (portal lanterns, tunnel lamps) */
  lights: GlowPoint[];
  triangles: number;
  /** tunnel bore roof checks for invariants: sample points (x, z, roofY) */
  boreSamples: { x: number; z: number; roof: number }[];
  /** stratified rock skin on the steep faces (null with ?legacyterrain / ?nocliffs) */
  cliffs: CliffResult | null;
}

const C = (h: string) => new THREE.Color(h);

const COL = {
  riverStone: C('#bfb3a0'),
  seaStone: C('#aaa498'),
  coping: C('#d5cfc3'),
  portal: C('#c4b59c'),
  voussoir: C('#b4a388'),
  keystone: C('#cdbfa3'),
  quoin: C('#b9aa90'),
  bore: C('#9b9186'),
  parapet: C('#bbaf9b'),
  lamp: C('#ffcf86'),
  plaque: C('#d9cdb4'),
  dark: C('#050505'),
};

// ─────────────────────────────────────────────────────────── shader ──

/** shared moon direction (terrain module copies ctx.clock.moonDir every frame) */
export const MOON_DIR = { value: new THREE.Vector3(0, 1, 0) };
/** night lift strength (?nightrock=0 turns it off for A/B) */
const NIGHT_K = typeof location !== 'undefined' ? parseFloat(new URLSearchParams(location.search).get('nightrock') ?? '0.07') || 0 : 0.07;

const MASONRY_PARS = /* glsl */ `
uniform sampler2D tNoise;
uniform float uLights;
uniform vec3 mMortar;
uniform vec3 mAlgae;
uniform vec3 mMoss;
uniform vec3 mGrass;
varying vec4 vMas;
varying vec3 vMW;
varying vec3 vMN;
float mRough = 0.9;
${GLSL_HASH}

vec3 th_ashlar(vec2 uv, float ch, vec3 base) {
  float row = floor(uv.y / ch);
  float rh = th_hash12(vec2(row, 7.13));
  float bl = ch * (1.75 + 1.1 * rh);
  float uu = uv.x / bl + rh * 3.7;
  float cid = floor(uu);
  float fu = fract(uu);
  float fv = fract(uv.y / ch);
  float du = min(fu, 1.0 - fu) * bl;
  float dv = min(fv, 1.0 - fv) * ch;
  float dmin = min(du, dv);
  float joint = 1.0 - smoothstep(0.018, 0.034, dmin);
  float bevel = 1.0 - smoothstep(0.03, 0.11, dmin);
  float bh = th_hash12(vec2(cid, row));
  vec3 c = base * (0.86 + 0.24 * bh);
  c *= 1.0 - bevel * 0.14;
  return mix(c, mMortar * (0.9 + 0.2 * bh), joint);
}

vec3 mN = vec3(0.0, 1.0, 0.0);
// bump-perturbed world normal for rock (cliff skin, boulders) — replaces the flat facet normal for lighting
vec3 mNb = vec3(0.0);
float mTerr = -1.0;
uniform float uNight;
uniform vec3 uMoonDir;
// Moonlit stone: the dark night key barely reaches the steep, mostly south-facing faces, so rock
// (cliffs, boulders) and, less, the walls get a soft wrap-lit moon + sky term — upper facets and
// ledges brightest, creases and undersides stay dark — so the forms still read at night.
vec3 mNightLift() {
  if (uNight < 0.01) return vec3(0.0);
  float kind = vMas.x;
  float k = kind > 5.5 ? 1.0 : (kind > 2.5 && kind < 3.5 ? 0.8 : (kind < 2.5 ? 0.35 : 0.0));
  float up = clamp(mN.y * 0.5 + 0.5, 0.0, 1.0);
  float wrapM = clamp((dot(mN, uMoonDir) + 0.5) / 1.5, 0.0, 1.0);
  float shape = 0.25 + 0.55 * wrapM + 0.6 * up * up;
  return vec3(0.39, 0.46, 0.67) * (uNight * TH_NIGHT_K * k * shape);
}
vec3 masonryColor(vec3 base) {
  float kind = vMas.x;
  vec3 p = vMW;
#ifdef TH_FLATN
  vec3 n = normalize(cross(dFdx(vMW), dFdy(vMW)));
#else
  vec3 n = normalize(vMN);
#endif
  mN = n;
  // cliff face coordinates (u along the face, y up) + derivatives taken outside the kind branches
  vec2 cuv = vec2(dot(p.xz, vMas.zw), p.y);
  vec2 cdx = dFdx(cuv), cdy = dFdy(cuv);
  vec2 pdx = dFdx(p.xz), pdy = dFdy(p.xz);
  float fwY = fwidth(p.y);
  vec2 uv;
  if (abs(n.y) < 0.7) uv = vec2(dot(p.xz, normalize(vec2(-n.z, n.x))), p.y);
  else uv = vec2(dot(p.xz, vMas.zw), dot(p.xz, vec2(-vMas.w, vMas.z)));
  // rock relief (F3): fractured, chipped surface on the cliff skin and boulders so a facet is never a flat plane.
  // Height in metres from ridged noise (sharp fracture creases) + two finer octaves; normal from its screen
  // derivatives (Mikkelsen's surface-gradient bump), faded out once a 0.3 m feature is under ~3 px.
#ifdef TH_FLATN
  if (kind > 2.5 && kind < 3.5 || kind > 5.5) {
    vec2 bq = kind > 5.5 ? cuv : uv;
    // octaves sized so each is a real feature (0.2–0.75 m fractures, 4–14 cm chips), each faded by its own pixel
    // footprint: a derivative bump finer than ~3 px turns into per-pixel speckle (session-1 version did)
    float fp = max(length(dFdx(p)), length(dFdy(p)));
    vec4 b1 = texture2D(tNoise, bq * vec2(0.33, 0.47) + vMas.y * 1.7);
    vec4 b2 = texture2D(tNoise, bq * vec2(0.9, 1.05) + 0.37);
    vec4 b3 = texture2D(tNoise, bq * 0.35 + 0.71);
    // chipped, not pitted: the fracture field is terraced (flat broken planes, steep risers = sharp edges), with
    // thin bedding laminae stepping along the strata on the cliff (cuv.y = height)
    float t1 = (b1.r * 0.8 + b2.b * 0.2) * 5.0;
    float ft = fract(t1);
    float hterr = (floor(t1) + smoothstep(0.72, 1.0, ft) + 0.12 * ft) * 0.2;
    float lam = kind > 5.5 ? fract(bq.y * 5.5 + b2.r * 1.6) : 0.0;
    float fine = 1.0 - smoothstep(0.006, 0.016, fp);
    float hb = 0.16 * hterr + (0.018 * lam * lam + 0.02 * b2.g + 0.008 * b3.b) * fine;
    mTerr = floor(t1);
    // soften the facets: lean the flat normal toward the shared-vertex normal (rounded boulders, no flat triangles)
    vec3 sn = normalize(vMN);
    if (dot(sn, n) > 0.15) n = normalize(mix(n, sn, 0.7));
    vec3 dpx = dFdx(p), dpy = dFdy(p);
    float fade = 1.0 - smoothstep(0.03, 0.1, fp);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(hb) * r1 + dFdy(hb) * r2);
    vec3 bn = abs(det) * n - grad * fade;
    if (dot(bn, bn) > 1e-20) n = normalize(bn);
    mNb = n;
    mN = n;
  }
#endif
  vec4 nz = texture2D(tNoise, (p.xz + p.y * 0.7) * 0.21);
  vec4 nf = texture2D(tNoise, (p.xz * 1.3 + vec2(p.y * 1.1, -p.y * 0.9)) * 0.9);
  vec3 col = base;
  if (kind < 0.5) {
    col *= 0.9 + 0.16 * nf.r;
    mRough = 0.86;
  } else if (kind < 1.5) {
    col = th_ashlar(uv, vMas.y, base);
    col *= 0.93 + 0.12 * nf.g;
    mRough = 0.88;
  } else if (kind < 2.5) {
    float L = 1.65;
    float f = fract(uv.x / L);
    float joint = 1.0 - smoothstep(0.012, 0.024, min(f, 1.0 - f) * L);
    float sh = th_hash12(vec2(floor(uv.x / L), 3.1));
    col *= (0.9 + 0.16 * sh) * (0.94 + 0.1 * nf.b);
    col = mix(col, mMortar, joint * 0.85);
    mRough = 0.78;
  } else if (kind < 3.5) {
    col *= 0.8 + 0.34 * nz.g;
    col *= 0.9 + 0.2 * nf.a;
    // painted look: dark crevices / undersides, dry-brushed light top edges
    col *= 0.72 + 0.36 * smoothstep(-0.6, 0.7, n.y);
    col = mix(col, col * 1.25 + 0.04, smoothstep(0.55, 0.9, nf.b) * smoothstep(0.2, 0.8, n.y) * 0.5);
    float moss = smoothstep(0.45, 0.9, n.y) * smoothstep(0.35, 0.7, nz.b);
    col = mix(col, mMoss, moss * 0.6);
    mRough = 0.93;
  } else if (kind < 4.5) {
    mRough = 1.0;
  } else if (kind < 5.5) {
    mRough = 0.5;
  } else {
    // stratified cliff rock (cliffs.ts): vMas.y = stratum tone seed
    vec2 su = cuv * vec2(0.045, 0.11);
    vec4 nu = textureGrad(tNoise, su, cdx * vec2(0.045, 0.11), cdy * vec2(0.045, 0.11));
    vec2 sv = cuv * vec2(0.31, 0.62) + vMas.y * 3.1;
    vec4 nv = textureGrad(tNoise, sv, cdx * vec2(0.31, 0.62), cdy * vec2(0.31, 0.62));
    vec2 ss = cuv * vec2(0.21, 0.016);
    float streak = textureGrad(tNoise, ss, cdx * vec2(0.21, 0.016), cdy * vec2(0.21, 0.016)).b;
    float side = 1.0 - smoothstep(0.55, 0.9, n.y);
    // sub-bedding: thin dark lines every ~0.4 m that fade out (instead of shimmering) with distance
    float bed = p.y * 2.6 + nu.r * 1.3 + vMas.y * 5.0;
    float fw = fwY * 2.6 + 1e-4;
    float fb = fract(bed);
    float line = (1.0 - smoothstep(0.0, 0.1 + fw, min(fb, 1.0 - fb))) * (1.0 - smoothstep(0.25, 0.7, fw));
    col *= 1.0 - 0.17 * line * side;
    // vertical weathering streaks (water stains) + damp dark seeps + grain + lichen (ochre, grey-green)
    vec4 st4 = textureGrad(tNoise, ss, cdx * vec2(0.21, 0.016), cdy * vec2(0.21, 0.016));
    col *= mix(1.0, 0.64 + 0.44 * smoothstep(0.15, 0.85, streak), side);
    col = mix(col, col * vec3(0.5, 0.53, 0.55), smoothstep(0.6, 0.78, st4.a) * side * 0.75);
    col *= 0.86 + 0.26 * nv.g;
    // each broken plane of the fracture terraces its own weathering: fresher (paler, warmer) or older (greyer)
    if (mTerr >= 0.0) { float ht = th_hash12(vec2(mTerr, floor(cuv.x * 0.7 + mTerr * 0.37))); col *= mix(vec3(0.88, 0.9, 0.92), vec3(1.1, 1.06, 0.98), ht); }
    col = mix(col, col * vec3(1.1, 1.04, 0.86) + vec3(0.035, 0.028, 0.0), smoothstep(0.6, 0.8, nu.a) * 0.55 * side);
    col = mix(col, vec3(0.5, 0.52, 0.44) * (0.85 + 0.3 * nv.b), smoothstep(0.64, 0.8, nv.a) * 0.22 * side);
    // hairline cracks across the strata + vertical joints that split the beds into blocks
    float ck = 1.0 - smoothstep(0.0, 0.03 + fw * 0.2, abs(nv.r - 0.5));
    col *= 1.0 - 0.1 * ck * side * (1.0 - smoothstep(0.15, 0.5, fw));
    float fwu = length(vec2(cdx.x, cdy.x)) * 0.37 + 1e-4;
    float ju = abs(fract(cuv.x * 0.37 + nu.b * 0.9 + vMas.y * 2.3) - 0.5);
    float joint = (1.0 - smoothstep(0.012, 0.03 + fwu, 0.5 - ju)) * (1.0 - smoothstep(0.08, 0.3, fwu));
    col *= 1.0 - 0.45 * joint * side;
    // ledges: moss and grass tufts on everything facing up, the edge broken by noise
    float up = smoothstep(0.6, 0.92, n.y);
    vec2 mp = p.xz * 0.55;
    float mossN = textureGrad(tNoise, mp, pdx * 0.55, pdy * 0.55).g * 0.6 + nv.b * 0.4;
    // patchy: soil, grit and bare rock show between the cushions on a ledge
    float moss = up * smoothstep(0.32, 0.55, mossN + 0.25 * (nf.r - 0.5));
    col = mix(col, vec3(0.3, 0.26, 0.2) * (0.8 + 0.4 * nf.g), up * (1.0 - moss) * 0.45);
    vec3 mossC = mix(mMoss, mGrass, smoothstep(0.35, 0.7, nu.g)) * (0.85 + 0.3 * nv.r) * vec3(0.8, 0.82, 0.72);
    col = mix(col, mossC, moss * 0.88);
    // shrubs and tufts rooting in the ledges (darker clumps in the moss)
    col = mix(col, mGrass * vec3(0.42, 0.48, 0.36), up * smoothstep(0.6, 0.74, nv.r * 0.6 + mossN * 0.4) * 0.85);
    // a little green creeping over the lip of each ledge
    col = mix(col, mMoss * 0.8, smoothstep(0.12, 0.45, n.y) * (1.0 - up) * 0.5 * smoothstep(0.35, 0.6, mossN));
    // undersides / creases in shade (overhanging lips throw a dark band)
    col *= 0.6 + 0.4 * smoothstep(-0.7, 0.1, n.y);
    mRough = 0.94;
  }
  // waterline: wet band + algae, darker below
  if ((kind > 0.5 && kind < 3.5) || kind > 5.5) {
    float wetb = 1.0 - smoothstep(-1.62, -1.15, p.y);
    col *= 1.0 - 0.3 * wetb;
    float alg = (1.0 - smoothstep(-1.75, -1.5, p.y)) * (0.6 + 0.4 * nz.r);
    col = mix(col, mAlgae, alg * 0.55);
    col *= 1.0 - 0.35 * (1.0 - smoothstep(-4.0, -1.8, p.y));
  }
  return col;
}
`;

function masonryMaterial(ctx: CityContext, flat: boolean): THREE.MeshStandardMaterial {
  const uniforms = {
    tNoise: { value: noiseTexture() },
    uLights: ctx.uniforms.uLights,
    uNight: ctx.uniforms.uNight,
    uMoonDir: MOON_DIR,
    mMortar: { value: C('#8a8276') },
    mAlgae: { value: C('#4e5a3a') },
    mMoss: { value: C('#6f8a45') },
    mGrass: { value: C('#86a54e') },
    ...lampUniforms(),
  };
  // flat: faceted shading from screen-space derivatives, so the rock skin and boulders can share
  // vertices (indexed) — ~3–5x fewer vertices than per-triangle normals on a vertex-bound GPU
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: flat });
  // (legacy look: no night lift either)
  mat.defines = flat ? { TH_FLATN: '', TH_NIGHT_K: NIGHT_K.toFixed(4) } : { TH_NIGHT_K: '0.0' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aMas;\nvarying vec4 vMas;\nvarying vec3 vMW;\nvarying vec3 vMN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMas = aMas;\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvMN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LAMP_GLSL + MASONRY_PARS)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * (thLampLight(vMW, mN) + mNightLift());')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = masonryColor(diffuseColor.rgb);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (mNb.x != 0.0 || mNb.y != 0.0 || mNb.z != 0.0) normal = normalize((viewMatrix * vec4(mNb, 0.0)).xyz);')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nif (vMas.x > 4.5 && vMas.x < 5.5) totalEmissiveRadiance += diffuseColor.rgb * (1.1 + 2.6 * uLights);',
      );
  };
  mat.customProgramCacheKey = () => (flat ? 'th-masonry-v6f' : 'th-masonry-v5');
  return mat;
}

// ─────────────────────────────────────────────────────── quay walls ──

interface WallSpec {
  info: WallInfo;
  stone: THREE.Color;
  capH: number;
  capOut: number;
  /** wall body top at arc length s */
  top: (s: number) => number;
  bottom: (s: number) => number;
  parapet?: { h: number; w: number; gaps: [number, number][] };
  pillarA?: boolean;
  pillarB?: boolean;
  course: number;
}

function buildWall(b: GeoBuilder, w: WallSpec): void {
  const { ax, az, bx, bz, nx, nz, thick } = w.info;
  const L = Math.hypot(bx - ax, bz - az);
  const tx = (bx - ax) / L,
    tz = (bz - az) / L;
  const P = (s: number, off: number, y: number): V3 => [ax + tx * s + nx * off, y, az + tz * s + nz * off];
  // stations: every 2 m, denser where the top changes
  const st: number[] = [];
  for (let s = 0; s < L; ) {
    st.push(s);
    const t0 = w.top(s),
      t1 = w.top(Math.min(L, s + 2));
    s += Math.abs(t1 - t0) > 0.05 ? 0.5 : 2;
  }
  st.push(L);
  const back = -thick;
  // water face (ashlar)
  b.color(w.stone).set('aMas', KIND.ashlar, w.course, tx, tz);
  for (let i = 0; i < st.length - 1; i++) {
    const s0 = st[i],
      s1 = st[i + 1];
    b.quadFacing(P(s0, 0, w.bottom(s0)), P(s1, 0, w.bottom(s1)), P(s1, 0, w.top(s1)), P(s0, 0, w.top(s0)), nx, 0, nz);
  }
  // end cross-sections (at slab edges / free ends)
  for (const [s, sign] of [
    [0, -1],
    [L, 1],
  ] as [number, number][]) {
    const t = w.top(s),
      bt = w.bottom(s);
    b.quadFacing(P(s, 0, bt), P(s, back, bt), P(s, back, t), P(s, 0, t), tx * sign, 0, tz * sign);
  }
  // coping
  const c0 = w.capOut,
    c1 = back - 0.02;
  b.color(COL.coping).set('aMas', KIND.coping, 0, tx, tz);
  for (let i = 0; i < st.length - 1; i++) {
    const s0 = st[i],
      s1 = st[i + 1];
    const y0 = w.top(s0),
      y1 = w.top(s1);
    const h = w.capH;
    b.quadFacing(P(s0, c0, y0 + h), P(s1, c0, y1 + h), P(s1, c1, y1 + h), P(s0, c1, y0 + h), 0, 1, 0);
    b.quadFacing(P(s0, c0, y0), P(s1, c0, y1), P(s1, c0, y1 + h), P(s0, c0, y0 + h), nx, 0, nz);
    b.quadFacing(P(s0, c1, y0), P(s1, c1, y1), P(s1, c1, y1 + h), P(s0, c1, y0 + h), -nx, 0, -nz);
    b.quadFacing(P(s0, 0, y0), P(s1, 0, y1), P(s1, c0, y1), P(s0, c0, y0), 0, -1, 0);
  }
  for (const [s, sign] of [
    [0, -1],
    [L, 1],
  ] as [number, number][]) {
    const y = w.top(s);
    b.quadFacing(P(s, c0, y), P(s, c1, y), P(s, c1, y + w.capH), P(s, c0, y + w.capH), tx * sign, 0, tz * sign);
  }
  // parapet on the coping (with gaps)
  if (w.parapet) {
    const ph = w.parapet.h,
      pw = w.parapet.w;
    const o0 = back / 2 + pw / 2,
      o1 = back / 2 - pw / 2;
    let runs: [number, number][] = [[0, L]];
    for (const [g0, g1] of w.parapet.gaps) {
      const next: [number, number][] = [];
      for (const [r0, r1] of runs) {
        if (g1 <= r0 || g0 >= r1) next.push([r0, r1]);
        else {
          if (g0 > r0) next.push([r0, g0]);
          if (g1 < r1) next.push([g1, r1]);
        }
      }
      runs = next;
    }
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 0.5) continue;
      const yb = w.top(r0) + w.capH;
      const yt = yb + ph;
      b.color(COL.parapet).set('aMas', KIND.ashlar, 0.26, tx, tz);
      b.quadFacing(P(r0, o0, yb), P(r1, o0, yb), P(r1, o0, yt), P(r0, o0, yt), nx, 0, nz);
      b.quadFacing(P(r0, o1, yb), P(r1, o1, yb), P(r1, o1, yt), P(r0, o1, yt), -nx, 0, -nz);
      b.quadFacing(P(r0, o0, yb), P(r0, o1, yb), P(r0, o1, yt), P(r0, o0, yt), -tx, 0, -tz);
      b.quadFacing(P(r1, o0, yb), P(r1, o1, yb), P(r1, o1, yt), P(r1, o0, yt), tx, 0, tz);
      // parapet coping
      const q0 = o0 + 0.06,
        q1 = o1 - 0.06,
        qh = 0.1;
      b.color(COL.coping).set('aMas', KIND.coping, 0, tx, tz);
      b.quadFacing(P(r0 - 0.04, q0, yt + qh), P(r1 + 0.04, q0, yt + qh), P(r1 + 0.04, q1, yt + qh), P(r0 - 0.04, q1, yt + qh), 0, 1, 0);
      b.quadFacing(P(r0 - 0.04, q0, yt), P(r1 + 0.04, q0, yt), P(r1 + 0.04, q0, yt + qh), P(r0 - 0.04, q0, yt + qh), nx, 0, nz);
      b.quadFacing(P(r0 - 0.04, q1, yt), P(r1 + 0.04, q1, yt), P(r1 + 0.04, q1, yt + qh), P(r0 - 0.04, q1, yt + qh), -nx, 0, -nz);
      b.quadFacing(P(r0 - 0.04, q0, yt), P(r0 - 0.04, q1, yt), P(r0 - 0.04, q1, yt + qh), P(r0 - 0.04, q0, yt + qh), -tx, 0, -tz);
      b.quadFacing(P(r1 + 0.04, q0, yt), P(r1 + 0.04, q1, yt), P(r1 + 0.04, q1, yt + qh), P(r1 + 0.04, q0, yt + qh), tx, 0, tz);
    }
  }
  // end pillars
  const pillar = (s: number) => {
    const cx = ax + tx * s + nx * (back / 2),
      cz = az + tz * s + nz * (back / 2);
    const yb = w.bottom(s),
      yt = w.top(s) + w.capH + 0.75;
    const yaw = Math.atan2(tx, tz);
    b.color(w.stone).set('aMas', KIND.ashlar, w.course, tx, tz);
    b.box(cx, (yb + yt) / 2, cz, 0.62, (yt - yb) / 2, 0.62, yaw, 4);
    b.color(COL.coping).set('aMas', KIND.coping, 0, tx, tz);
    b.box(cx, yt + 0.09, cz, 0.74, 0.09, 0.74, yaw, 4);
    b.box(cx, yt + 0.26, cz, 0.42, 0.09, 0.42, yaw, 4);
  };
  if (w.pillarA) pillar(0);
  if (w.pillarB) pillar(L);
}

// ───────────────────────────────────────────────────────── portals ──

function Lp(p: PortalDef, lx: number, y: number, lz: number): V3 {
  return [p.x + lx * p.cos + lz * p.sin, y, p.z - lx * p.sin + lz * p.cos];
}

/** extruded polygon (CCW in local x'/y) between local z0 < z1 */
function prism(b: GeoBuilder, p: PortalDef, poly: [number, number][], z0: number, z1: number, opts: { front?: boolean; back?: boolean; edge?: (i: number) => boolean } = {}): void {
  const n = poly.length;
  const Zx = p.sin,
    Zz = p.cos,
    Xx = p.cos,
    Xz = -p.sin;
  if (opts.front !== false) b.polygonFacing(poly.map(([x, y]) => Lp(p, x, y, z1)), poly, Zx, 0, Zz);
  if (opts.back) b.polygonFacing(poly.map(([x, y]) => Lp(p, x, y, z0)), poly, -Zx, 0, -Zz);
  for (let i = 0; i < n; i++) {
    if (opts.edge && !opts.edge(i)) continue;
    const [x0, y0] = poly[i],
      [x1, y1] = poly[(i + 1) % n];
    const ex = y1 - y0,
      ey = -(x1 - x0);
    if (Math.hypot(ex, ey) < 1e-6) continue;
    b.quadFacing(Lp(p, x0, y0, z0), Lp(p, x1, y1, z0), Lp(p, x1, y1, z1), Lp(p, x0, y0, z1), ex * Xx, ey, ex * Xz);
  }
}

function rectPoly(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** arch opening outline from the left jamb foot, over the crown, to the right jamb foot */
function archOutline(p: PortalDef, yb: number, seg = 18): [number, number][] {
  const a = p.width / 2,
    s = p.spring,
    bb = p.height - p.spring;
  const pts: [number, number][] = [
    [-a, yb],
    [-a, s],
  ];
  for (let i = 1; i < seg; i++) {
    const t = Math.PI - (i / seg) * Math.PI;
    pts.push([a * Math.cos(t), s + bb * Math.sin(t)]);
  }
  pts.push([a, s], [a, yb]);
  return pts;
}

function archPoint(p: PortalDef, t: number, off: number): [number, number] {
  const a = p.width / 2,
    s = p.spring,
    bb = p.height - p.spring;
  const ex = a * Math.cos(t),
    ey = s + bb * Math.sin(t);
  let nx = Math.cos(t) / a,
    ny = Math.sin(t) / bb;
  const l = Math.hypot(nx, ny) || 1;
  nx /= l;
  ny /= l;
  return [ex + nx * off, ey + ny * off];
}

function buildPortal(b: GeoBuilder, veils: GeoBuilder, p: PortalDef, rng: Rng, boreSamples: { x: number; z: number; roof: number }[], lights: GlowPoint[]): void {
  const yb = -0.35;
  const a = p.width / 2;
  const T = p.thick;
  const Xx = p.cos,
    Xz = -p.sin;
  const road = p.kind === 'road';
  // ── headwall (U-shaped outline around the opening)
  const outline: [number, number][] = [[-p.halfW, yb]];
  const arch = archOutline(p, yb);
  outline.push(...arch);
  outline.push([p.halfW, yb], [p.halfW, p.top], [-p.halfW, p.top]);
  const nArch = arch.length;
  b.color(COL.portal).set('aMas', KIND.ashlar, 0.62, Xx, Xz);
  // edges to emit: right end (index nArch+1), top (nArch+2), left end (nArch+3)
  prism(b, p, outline, -T, 0, { edge: (i) => i >= nArch + 1 });
  // coping on top
  b.color(COL.coping).set('aMas', KIND.coping, 0, Xx, Xz);
  prism(b, p, rectPoly(-p.halfW - 0.12, p.top, p.halfW + 0.12, p.top + 0.24), -T - 0.08, 0.16, { back: true });
  // cornice / string course
  b.color(COL.keystone).set('aMas', KIND.plain, 0, Xx, Xz);
  prism(b, p, rectPoly(-p.halfW, p.top - 0.95, p.halfW, p.top - 0.68), -0.1, 0.3);
  prism(b, p, rectPoly(-p.halfW, p.top - 0.68, p.halfW, p.top - 0.56), -0.1, 0.18);
  // pilasters
  for (const sx of [-1, 1]) {
    const cx = sx * (p.halfW - 0.6);
    b.color(COL.portal).set('aMas', KIND.ashlar, 0.62, Xx, Xz);
    prism(b, p, rectPoly(cx - 0.55, yb, cx + 0.55, p.top + 0.24), -0.05, 0.32, { edge: (i) => i !== 0 });
    b.color(COL.coping).set('aMas', KIND.coping, 0, Xx, Xz);
    prism(b, p, rectPoly(cx - 0.7, p.top + 0.24, cx + 0.7, p.top + 0.46), -0.2, 0.44, { back: true });
    prism(b, p, rectPoly(cx - 0.42, p.top + 0.46, cx + 0.42, p.top + 0.62), -0.1, 0.3, { back: true });
  }
  // impost blocks at the springing line
  b.color(COL.quoin).set('aMas', KIND.plain, 0, Xx, Xz);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -a - 1.05 : a - 0.02,
      x1 = sx < 0 ? -a + 0.02 : a + 1.05;
    prism(b, p, rectPoly(x0, p.spring - 0.28, x1, p.spring), -0.05, 0.16);
  }
  // jamb quoins (alternating long / short)
  for (const sx of [-1, 1]) {
    let y = yb;
    let k = 0;
    while (y < p.spring - 0.3) {
      const h = Math.min(0.62, p.spring - 0.28 - y);
      const wq = k % 2 === 0 ? 0.95 : 0.6;
      const x0 = sx < 0 ? -a - wq : a,
        x1 = sx < 0 ? -a : a + wq;
      b.color(COL.quoin.clone().multiplyScalar(0.92 + rng.next() * 0.16)).set('aMas', KIND.plain, 0, Xx, Xz);
      prism(b, p, rectPoly(x0, y + 0.02, x1, y + h - 0.02), -0.05, 0.09);
      y += h;
      k++;
    }
  }
  // voussoirs
  const N = road ? 15 : 13;
  const ringW = road ? 0.9 : 0.78;
  let keyTop = p.height + ringW;
  for (let i = 0; i < N; i++) {
    const t0 = Math.PI - (i / N) * Math.PI,
      t1 = Math.PI - ((i + 1) / N) * Math.PI;
    const key = i === (N - 1) / 2;
    const ow = key ? ringW + 0.38 : ringW;
    const pz = key ? 0.26 : 0.14;
    const poly: [number, number][] = [];
    const sub = 3;
    for (let k = 0; k <= sub; k++) poly.push(archPoint(p, t0 + ((t1 - t0) * k) / sub, 0.01));
    for (let k = sub; k >= 0; k--) poly.push(archPoint(p, t0 + ((t1 - t0) * k) / sub, ow));
    if (key) keyTop = Math.max(...poly.map((q) => q[1]));
    const c = (key ? COL.keystone : COL.voussoir).clone().multiplyScalar(0.92 + rng.next() * 0.14);
    b.color(c).set('aMas', KIND.plain, 0, Xx, Xz);
    prism(b, p, poly, -0.05, pz);
  }
  // date plaque between keystone and cornice
  const pl0 = keyTop + 0.14,
    pl1 = p.top - 1.08;
  if (pl1 - pl0 > 0.42) {
    b.color(COL.plaque).set('aMas', KIND.plain, 0, Xx, Xz);
    const ph = Math.min(0.85, pl1 - pl0);
    const pw = road ? 2.8 : 2.2;
    prism(b, p, rectPoly(-pw / 2, pl0, pw / 2, pl0 + ph), -0.05, 0.1);
    b.color(COL.voussoir).set('aMas', KIND.plain, 0, Xx, Xz);
    prism(b, p, rectPoly(-pw / 2 + 0.16, pl0 + 0.16, pw / 2 - 0.16, pl0 + ph - 0.16), 0.08, 0.13);
  }
  // wing walls with sloping coping
  for (const side of [0, 1] as const) {
    const sg = side === 0 ? -1 : 1;
    const reach = p.reach[side];
    if (reach <= p.halfW + 0.6) continue;
    const yTop0 = p.top - 1.1;
    const yEnd = p.wingEnd[side];
    const xs = [p.halfW - 0.02, p.halfW + 0.9, reach];
    const ys = [yTop0, yTop0, yEnd];
    let poly: [number, number][] = [
      [xs[0], yb],
      [xs[2], yb],
      [xs[2], ys[2]],
      [xs[1], ys[1]],
      [xs[0], ys[0]],
    ];
    if (sg < 0) poly = poly.map(([x, y]) => [-x, y] as [number, number]).reverse();
    b.color(COL.portal.clone().multiplyScalar(0.97)).set('aMas', KIND.ashlar, 0.55, Xx, Xz);
    // skip the buried bottom edge
    prism(b, p, poly, -T + 0.15, -0.12, { edge: (i) => Math.abs(poly[i][1] - yb) > 1e-3 || Math.abs(poly[(i + 1) % poly.length][1] - yb) > 1e-3 });
    // coping along the top
    b.color(COL.coping).set('aMas', KIND.coping, 0, Xx, Xz);
    const zc = (-T + 0.15 - 0.12) / 2;
    for (let k = 0; k < 2; k++) {
      const A = Lp(p, sg * xs[k], ys[k] + 0.09, zc),
        B = Lp(p, sg * xs[k + 1], ys[k + 1] + 0.09, zc);
      b.beam(A[0], A[1], A[2], B[0], B[1], B[2], T - 0.05, 0.2);
    }
    // little end pier
    b.color(COL.portal).set('aMas', KIND.ashlar, 0.55, Xx, Xz);
    const ex = sg * (reach - 0.3);
    const E0 = Lp(p, ex, 0, zc);
    b.box(E0[0], (yb + yEnd + 0.35) / 2, E0[2], 0.42, (yEnd + 0.35 - yb) / 2, (T - 0.1) / 2 + 0.12, p.yaw, 4);
    b.color(COL.coping).set('aMas', KIND.coping, 0, Xx, Xz);
    b.box(E0[0], yEnd + 0.44, E0[2], 0.52, 0.09, (T - 0.1) / 2 + 0.2, p.yaw, 4);
  }
  // ── bore lining (inward facing), dark floor, end cap
  const prof = archOutline(p, -0.02, 20);
  const depths: number[] = [0, -0.6, -T, -T - 1.0, -T - 2.2, -T - 3.6, -T - 5.2, -T - 7.2, -T - 10];
  for (let d = -T - 14; d > -p.bore; d -= 5) depths.push(d);
  depths.push(-p.bore);
  const shade = (z: number): number => {
    const d = -z;
    if (d <= T) return 0.78 - 0.28 * (d / T);
    return 0.5 * (1 - smoothstepJS(T, T + 6, d)) + 0.035;
  };
  const floorC = C('#2b2a28');
  for (let j = 0; j < depths.length - 1; j++) {
    const za = depths[j],
      zb = depths[j + 1];
    const ca = COL.bore.clone().multiplyScalar(shade(za)),
      cb = COL.bore.clone().multiplyScalar(shade(zb));
    b.set('aMas', j < 3 ? KIND.ashlar : KIND.plain, 0.5, Xx, Xz);
    for (let k = 0; k < prof.length - 1; k++) {
      const [x0, y0] = prof[k],
        [x1, y1] = prof[k + 1];
      // the outline runs clockwise seen from the mouth: its right-hand side (dy, -dx) is the bore interior
      const ex = y1 - y0,
        ey = -(x1 - x0);
      b.quad4([Lp(p, x0, y0, za), Lp(p, x1, y1, za), Lp(p, x1, y1, zb), Lp(p, x0, y0, zb)], [ca, ca, cb, cb], ex * Xx, ey, ex * Xz);
    }
    // floor
    b.set('aMas', KIND.dark, 0, Xx, Xz);
    const fa = floorC.clone().multiplyScalar(shade(za) * 1.3),
      fb = floorC.clone().multiplyScalar(shade(zb) * 1.3);
    b.quad4([Lp(p, -a, -0.03, za), Lp(p, a, -0.03, za), Lp(p, a, -0.03, zb), Lp(p, -a, -0.03, zb)], [fa, fa, fb, fb], 0, 1, 0);
  }
  // end cap (black), facing the mouth
  const cap = archOutline(p, -0.05, 20);
  b.color(COL.dark).set('aMas', KIND.dark, 0, Xx, Xz);
  b.polygonFacing(
    cap.map(([x, y]) => Lp(p, x, y, -p.bore)),
    cap,
    p.sin,
    0,
    p.cos,
  );
  // lamps along the bore
  b.color(COL.lamp).set('aMas', KIND.lamp, 0, Xx, Xz);
  const lampY = road ? p.spring + 0.55 : p.spring - 0.6;
  const step = road ? 3.6 : 5;
  for (let z = -T - 0.9; z > -p.bore + 1.5; z -= step) {
    for (const sx of [-1, 1]) {
      const c = Lp(p, sx * (a - 0.1), lampY, z);
      b.box(c[0], c[1], c[2], 0.08, 0.07, road ? 0.4 : 0.25, p.yaw, 0);
      const g = Lp(p, sx * (a - 0.35), lampY - 0.05, z);
      lights.push({ x: g[0], y: g[1], z: g[2], size: road ? 0.55 : 0.45, kind: 'halo', color: '#ffc677', intensity: road ? 0.7 : 0.45, day: 0.3 });
    }
  }
  // lanterns on the headwall (road portals)
  if (road) {
    for (const sx of [-1, 1]) {
      const c = Lp(p, sx * (a + 1.75), p.spring + 1.3, 0.34);
      b.color(C('#2c2f30')).set('aMas', KIND.plain, 0, Xx, Xz);
      b.box(c[0], c[1] + 0.42, c[2], 0.24, 0.06, 0.24, p.yaw, 0);
      const br = Lp(p, sx * (a + 1.75), p.spring + 1.0, 0.12);
      b.box(br[0], br[1], br[2], 0.05, 0.05, 0.2, p.yaw, 0);
      b.color(COL.lamp).set('aMas', KIND.lamp, 0, Xx, Xz);
      b.box(c[0], c[1] + 0.08, c[2], 0.17, 0.28, 0.17, p.yaw, 0);
      lights.push({ x: c[0], y: c[1] + 0.08, z: c[2], size: 0.95, kind: 'halo', color: '#ffd08a', intensity: 0.95 });
      const pool = Lp(p, sx * (a + 1.2), 0.07, 2.2);
      lights.push({ x: pool[0], y: pool[1], z: pool[2], size: 3.2, kind: 'pool', color: '#ffbf73', intensity: 0.22 });
    }
  }
  // darkness veils (transparent): progressively darker slices
  const vprof = archOutline(p, -0.04, 20);
  const veilD = [
    [-T - 0.4, 0.2],
    [-T - 1.8, 0.32],
    [-T - 3.6, 0.45],
    [-T - 6.0, 0.6],
    [-T - 9.0, 0.78],
  ];
  for (const [vz, al] of veilD) {
    if (-vz > p.bore - 0.5) continue;
    veils.rgb(0, 0, 0).set('aAlpha', al);
    veils.polygonFacing(
      vprof.map(([x, y]) => Lp(p, x * 0.995, y, vz)),
      vprof,
      p.sin,
      0,
      p.cos,
    );
  }
  // roof samples (for invariants): crown line along the bore
  for (let z = -T - 0.5; z > -p.bore; z -= 2) {
    const c = Lp(p, 0, p.height + 0.6, z);
    boreSamples.push({ x: c[0], z: c[2], roof: c[1] });
    for (const sx of [-1, 1]) {
      const s = Lp(p, sx * a * 0.8, p.spring + (p.height - p.spring) * 0.6 + 0.6, z);
      boreSamples.push({ x: s[0], z: s[2], roof: s[1] });
    }
  }
}

function smoothstepJS(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ─────────────────────────────────────────────────────────── rocks ──

const ROCK_COLS = ['#a39a8c', '#8e8679', '#ab9f8c', '#7f776c', '#b2a894', '#98897a', '#9c9487', '#a08f7a'].map((h) => new THREE.Color(h));
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** set by createMasonry: masonry material is flat-shaded (new look) */
let flatMasonry = false;

function rockGeometry(rng: Rng, detail: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const facet = detail <= 1;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const seed = Math.floor(rng.next() * 1000);
  const flat = 0.15 + rng.next() * 0.25;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const n = vnoise(_p.x * 1.6 + seed, _p.z * 1.6 + _p.y * 1.3, seed) * 0.5 + vnoise(_p.x * 3.4 - seed, _p.y * 3.4 + _p.z * 2.1, seed + 3) * 0.25;
    let r = 0.72 + n * 0.7;
    // flatter bottom, faceted top
    if (_p.y < -flat) r *= 0.82;
    _p.multiplyScalar(r);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  if (facet && !flatMasonry) {
    // chiselled facets on the smaller stones
    const ng = g.toNonIndexed();
    g.dispose();
    ng.computeVertexNormals();
    return ng;
  }
  // (flat-shaded masonry: the facets come from the fragment derivatives, vertices stay shared)
  g.computeVertexNormals();
  return g;
}

interface RockStyle {
  /** masonry kind for the shader (KIND.cliff: strata lines + mossy tops like the cliffs) */
  kind?: number;
  /** always chiselled facets (no smooth detail-2 blobs) */
  facet?: boolean;
  /** vertical squash (slabby stones) */
  squash?: number;
}

function addRock(b: GeoBuilder, rng: Rng, model: TerrainModel, x: number, z: number, size: number, embed: number, out: { x: number; z: number; r: number }[], yOverride?: number, tint = 1, style: RockStyle = {}): void {
  // never poke out through the cut faces of the slab
  const m = size * 1.25 + 0.3;
  x = Math.min(SLAB.x1 - m, Math.max(SLAB.x0 + m, x));
  z = Math.min(SLAB.z1 - m, Math.max(SLAB.z0 + m, z));
  // (new look: small stones are 20-facet chunks — scree is numerous, keep it cheap)
  const g = rockGeometry(rng, size > 1.6 && !style.facet ? 2 : flatMasonry && size < 0.75 ? 0 : 1);
  const sy = size * (0.55 + rng.next() * 0.3) * (style.squash ?? 1);
  _s.set(size * (0.85 + rng.next() * 0.35), sy, size * (0.85 + rng.next() * 0.35));
  _e.set((rng.next() - 0.5) * 0.35, rng.next() * Math.PI * 2, (rng.next() - 0.5) * 0.35);
  _q.setFromEuler(_e);
  const y = yOverride ?? model.height(x, z);
  _p.set(x, y + sy * (1 - 2 * embed) * 0.9, z);
  _m.compose(_p, _q, _s);
  const c = ROCK_COLS[Math.floor(rng.next() * ROCK_COLS.length)].clone().multiplyScalar((0.9 + rng.next() * 0.18) * tint);
  b.color(c).set('aMas', style.kind ?? KIND.rock, style.kind === KIND.cliff ? 0.31 : 0, 1, 0);
  b.geometry(g, _m);
  g.dispose();
  out.push({ x, z, r: size * 1.05 });
}

function placeRocks(b: GeoBuilder, ctx: CityContext, model: TerrainModel, rng: Rng): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  const prm = ctx.debug.params;
  const tors = !prm.has('legacyterrain') && !prm.has('nocliffs');
  const torRng = ctx.rng('terrain-tors');
  const turbines = ctx.plan.features.filter((f) => f.kind === 'windturbine');
  const nearPortal = (x: number, z: number, m: number) =>
    model.portals.some((p) => {
      const dx = x - p.x,
        dz = z - p.z;
      const lx = dx * p.cos - dz * p.sin,
        lz = dx * p.sin + dz * p.cos;
      return Math.abs(lx) < Math.max(p.reach[0], p.reach[1]) + m && lz < 6 + m && lz > -p.bore - m;
    });
  const clearOf = (x: number, z: number, r: number) => out.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + r * 0.9);
  // boulders fallen at the foot of the escarpment
  for (let x = -176; x < 106; ) {
    x += 5 + rng.next() * 11;
    const z = RIDGE_FOOT_Z - 0.2 - rng.next() * 0.6;
    if (nearPortal(x, z, 4) || Math.abs(x + 110) < 28 || Math.abs(x - 55) < 28) continue;
    const s = 0.5 + rng.next() * 1.1;
    if (!clearOf(x, z, s)) continue;
    addRock(b, rng, model, x, z, s, 0.35, out);
    if (rng.chance(0.45)) addRock(b, rng, model, x + 0.9 + rng.next(), z + 0.6 + rng.next() * 0.6, s * 0.55, 0.35, out);
  }
  // outcrops on the hills
  let tries = 0,
    clusters = 0;
  while (clusters < 18 && tries++ < 400) {
    const x = -192 + rng.next() * 324;
    const z = -188 + rng.next() * 20;
    if (x > 128) continue;
    if (turbines.some((t) => Math.hypot(t.x - x, t.z - z) < 9)) continue;
    if (nearPortal(x, z, 6)) continue;
    if (model.height(x, z) < 3) continue;
    const n = 2 + Math.floor(rng.next() * 4);
    const base = 1.1 + rng.next() * 1.9;
    if (!clearOf(x, z, base * 2)) continue;
    clusters++;
    for (let k = 0; k < n; k++) {
      const a = rng.next() * Math.PI * 2,
        d = k === 0 ? 0 : base * (0.9 + rng.next() * 1.2);
      const rx = x + Math.cos(a) * d,
        rz = z + Math.sin(a) * d;
      const sz = base * (k === 0 ? 1 : 0.45 + rng.next() * 0.5);
      if (!tors) {
        addRock(b, rng, model, rx, rz, sz, 0.52, out);
        continue;
      }
      // the same stones as chiselled, slabby tors in the cliff rock's language, the big one stacked
      addRock(b, rng, model, rx, rz, sz, 0.5, out, undefined, 1, { kind: KIND.cliff, facet: true, squash: 0.78 });
      if (k === 0) {
        const ground = model.height(rx, rz);
        let y = ground + sz * 0.42;
        let s2 = sz * 0.72;
        const nStack = 1 + Math.floor(torRng.next() * 2);
        for (let j = 0; j < nStack; j++) {
          const ox = (torRng.next() - 0.5) * s2 * 0.5,
            oz = (torRng.next() - 0.5) * s2 * 0.5;
          addRock(b, torRng, model, rx + ox, rz + oz, s2, 0.5, [], y + s2 * 0.25, 1.02, { kind: KIND.cliff, facet: true, squash: 0.62 });
          y += s2 * 0.42;
          s2 *= 0.7;
        }
      }
    }
  }
  // spurs
  for (let k = 0; k < 7; k++) {
    const x = -198 + rng.next() * 12,
      z = -186 + rng.next() * 40;
    if (nearPortal(x, z, 3)) continue;
    addRock(b, rng, model, x, z, 0.9 + rng.next() * 1.6, 0.45, out);
  }
  for (let k = 0; k < 6; k++) {
    const x = 118 + rng.next() * 12,
      z = -186 + rng.next() * 42;
    if (nearPortal(x, z, 3)) continue;
    addRock(b, rng, model, x, z, 0.8 + rng.next() * 1.4, 0.45, out);
  }
  // cliff-foot boulders along the east spur (half in the harbour water)
  for (let z = -189; z < SEA_WALL_Z0 - 1; ) {
    z += 2.2 + rng.next() * 3.2;
    const toe = 136 + 3.6 * smoothstepJS(SEA_WALL_Z0, SEA_WALL_Z0 - 7, z);
    const x = toe - 0.4 + rng.next() * 1.6;
    const s = 1.0 + rng.next() * 1.6;
    addRock(b, rng, model, x, z, s, 0.3, out, Math.max(model.height(x, z), -4.5));
    if (rng.chance(0.5)) addRock(b, rng, model, x - 1.2 - rng.next(), z + rng.next() * 1.5, s * 0.6, 0.3, out, model.height(x - 1.6, z + 0.6));
  }
  // riprap at the river wall ends
  for (const zc of [RIVER.z0, RIVER.z1]) {
    const sg = zc === RIVER.z0 ? 1 : -1;
    for (let k = 0; k < 7; k++) {
      const x = RIVER_WALL_END_X + 0.5 + rng.next() * 3.2;
      const z = zc + sg * (0.2 + rng.next() * 2.4);
      addRock(b, rng, model, x, z, 0.45 + rng.next() * 0.7, 0.35, out);
    }
  }
  // sea wall south end, on the sand
  for (let k = 0; k < 6; k++) {
    const x = QUAY_X + 0.4 + rng.next() * 2.4,
      z = SEA_WALL_Z1 - 0.5 + rng.next() * 3.5;
    addRock(b, rng, model, x, z, 0.5 + rng.next() * 0.8, 0.35, out);
  }
  // pond: island shore + bank stones
  const pond = model.pond;
  if (model.island) {
    const isl = model.island;
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rng.next() * 0.3;
      const r = isl.r - 0.15 + rng.next() * 0.35;
      addRock(b, rng, model, isl.x + Math.cos(a) * r, isl.z + Math.sin(a) * r, 0.28 + rng.next() * 0.3, 0.4, out, undefined, 0.68);
    }
    addRock(b, rng, model, isl.x + 0.5, isl.z - 0.4, 0.75, 0.4, out, undefined, 0.72);
  }
  if (pond) {
    for (let k = 0; k < 16; k++) {
      const a = rng.next() * Math.PI * 2;
      const rr = 1.0 + rng.next() * 0.06;
      const x = pond.cx + Math.cos(a) * pond.rx * rr,
        z = pond.cz + Math.sin(a) * pond.rz * rr;
      addRock(b, rng, model, x, z, 0.22 + rng.next() * 0.32, 0.4, out, undefined, 0.66);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────── build ──

export function createMasonry(ctx: CityContext, model: TerrainModel): MasonryResult {
  const b = new GeoBuilder({ aMas: 4 });
  const veils = new GeoBuilder({ aAlpha: 1 });
  flatMasonry = !ctx.debug.params.has('legacyterrain');
  const rng = ctx.rng('terrain-masonry');
  const plan = ctx.plan;
  const bed = (x: number, z: number) => model.height(x, z) - 0.35;

  // gaps in the river edge for the footbridges and the rowing-club jetty
  const gaps: { x: number; half: number }[] = [];
  for (const f of plan.features) {
    if (f.kind === 'footbridge') gaps.push({ x: f.x, half: Number(f.params?.width ?? 3.6) / 2 + 0.45 });
    if (f.kind === 'jetty') gaps.push({ x: f.x, half: 1.6 });
  }
  const walls: WallInfo[] = [
    { id: 'riverN', ax: SLAB.x0 + 0.05, az: RIVER.z0, bx: RIVER_WALL_END_X, bz: RIVER.z0, nx: 0, nz: 1, thick: RIVER_WALL_T, capTop: SIDEWALK_Y + 0.2 },
    { id: 'riverS', ax: SLAB.x0 + 0.05, az: RIVER.z1, bx: RIVER_WALL_END_X, bz: RIVER.z1, nx: 0, nz: -1, thick: RIVER_WALL_T, capTop: 0.2 },
    { id: 'sea', ax: QUAY_X, az: SEA_WALL_Z0, bx: QUAY_X, bz: SEA_WALL_Z1, nx: 1, nz: 0, thick: SEA_WALL_T, capTop: 0.12 },
  ];
  // river north (promenade side)
  buildWall(b, {
    info: walls[0],
    stone: COL.riverStone,
    capH: 0.2,
    capOut: 0.12,
    top: () => SIDEWALK_Y,
    bottom: (s) => bed(SLAB.x0 + s, RIVER.z0 + 0.4),
    pillarB: true,
    course: 0.52,
  });
  // river south (park side) with a low parapet
  const sGaps: [number, number][] = gaps.map((g) => [g.x - g.half - SLAB.x0, g.x + g.half - SLAB.x0]);
  buildWall(b, {
    info: walls[1],
    stone: COL.riverStone,
    capH: 0.2,
    capOut: 0.12,
    top: () => 0,
    bottom: (s) => bed(SLAB.x0 + s, RIVER.z1 - 0.4),
    parapet: { h: 0.42, w: 0.34, gaps: sGaps },
    pillarB: true,
    course: 0.52,
  });
  // harbour sea wall; its top follows the rising spur at the north end
  walls[2].capTop = 0.12;
  buildWall(b, {
    info: walls[2],
    stone: COL.seaStone,
    capH: 0.12,
    capOut: 0.1,
    top: (s) => Math.max(0, model.natural(QUAY_X - 0.9, SEA_WALL_Z0 + s) - 0.1),
    bottom: (s) => bed(QUAY_X + 0.4, SEA_WALL_Z0 + s),
    pillarB: true,
    course: 0.6,
  });

  // ladders (positions shared with the railings module)
  const ladders: LadderSpot[] = [];
  for (const x of [-144, -48, 48, 104]) ladders.push({ x, z: RIVER.z0, nx: 0, nz: 1, top: SIDEWALK_Y + 0.2 });
  for (const x of [-168, -112, -20, 62]) ladders.push({ x, z: RIVER.z1, nx: 0, nz: -1, top: 0.2 });
  for (const z of [-131, -97, -58, -31, -2]) ladders.push({ x: QUAY_X, z, nx: 1, nz: 0, top: 0.12 });

  // portals
  const boreSamples: { x: number; z: number; roof: number }[] = [];
  const lights: GlowPoint[] = [];
  for (const p of model.portals) buildPortal(b, veils, p, rng, boreSamples, lights);

  // rocks
  const rocks = placeRocks(b, ctx, model, ctx.rng('terrain-rocks'));

  // stratified rock skin on the cliffs + scree stones at their feet
  const prm = ctx.debug.params;
  let cliffs: CliffResult | null = null;
  if (!prm.has('legacyterrain') && !prm.has('nocliffs')) {
    const srng = ctx.rng('terrain-scree');
    const sink: { x: number; z: number; r: number }[] = [];
    cliffs = buildCliffs(ctx, model, b, ctx.rng('terrain-cliffs'), (x, z, size, embed, y) => {
      if (rocks.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + size * 0.6)) return false;
      addRock(b, srng, model, x, z, size, embed, sink, y, 0.92);
      return true;
    });
    rocks.push(...cliffs.stones);
  }

  // iron railings / ladders (their lamp globes are emissive masonry)
  const railings = createRailings(ladders, gaps, b);

  const geo = b.build(true);
  const mesh = new THREE.Mesh(geo, masonryMaterial(ctx, flatMasonry));
  mesh.name = 'terrain-masonry';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  // veils: black with per-vertex alpha
  const vg = veils.build(true);
  const alpha = vg.getAttribute('aAlpha') as THREE.BufferAttribute;
  const rgba = new Float32Array(alpha.count * 4);
  for (let i = 0; i < alpha.count; i++) rgba[i * 4 + 3] = alpha.getX(i);
  vg.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  vg.deleteAttribute('aAlpha');
  const vmat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  // one pass for both sides: three otherwise draws a transparent double-sided material twice (back, then front),
  // flipping .side + needsUpdate — the program re-derived twice per frame. Black layers blend the same in any order.
  vmat.forceSinglePass = true;
  const vmesh = new THREE.Mesh(vg, vmat);
  vmesh.name = 'terrain-tunnel-veils';
  vmesh.renderOrder = 1;
  vmesh.matrixAutoUpdate = false;
  vmesh.updateMatrix();

  return { mesh, veils: vmesh, rocks, ladders, walls, gaps, railings, lights, triangles: b.triangles + veils.triangles, boreSamples, cliffs };
}
