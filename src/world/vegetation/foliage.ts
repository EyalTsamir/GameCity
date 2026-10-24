// Leaf-card foliage: instanced leaf-cluster cards + instanced wood segments (trunks, limbs, branches).
//
// Two instanced meshes draw every tree, bush and palm of the city (+ their two shadow passes):
//   cards — one quad per leaf cluster, textured from the procedural leaf atlas (atlas.ts), alpha-tested;
//   wood  — one tapered 8-sided tube per segment.
// Each instance buffer has a STATIC part (all plants' far LOD: a few big dense cards per leaf mass, trunks
// and main limbs) followed by a DYNAMIC part (fine cluster cards, branches and twigs of the plants near the
// camera, rewritten by vegetation.ts whenever that set changes). A per-plant LOD texture (R8, one texel per
// plant) holds the near weight 0..1: near cards dissolve in leaf by leaf, far cards dissolve out — the same
// texture drives the shadow pass, so shadows cross-fade consistently.
//
// Wind (one field, core/wind.ts): Crysis-style main bending from thWindAt(root) (a gust front bends a row
// of trees in sequence), two levels of branch bob with per-branch phases shared by a branch's twigs and its
// cards (cards stay attached), leaf flutter along the card normal scaled by the local gust.
//
// Shading (MeshStandard patched): spherized normals baked per card (crown-centred, Bruno Simon / Polycount
// practice) + per-leaf tilt from the atlas leaf id, no back-face flip, wrapped diffuse, shadow-aware backlit
// translucency inside RE_Direct (only leaves the sun really reaches glow), received-shadow lookup shifted
// toward the light (no self-acne between neighbouring cards), crown AO, night lift + street-lamp light.

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { WIND_GLSL } from '../../core/wind';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { wrappedPhysicalPars, NOISE_GLSL } from './material';

// ─────────────────────────────────────────────────────────── instance buffers ──

type TA = Float32Array | Int16Array | Uint16Array | Int8Array | Uint8Array;
type TACtor = Float32ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Int8ArrayConstructor | Uint8ArrayConstructor;

export interface AttrSpec {
  name: string;
  ctor: TACtor;
  normalized: boolean;
}

/** growable struct-of-arrays instance storage (every attribute is a vec4) */
export class InstBuf {
  arrays: TA[];
  n = 0;
  cap: number;
  constructor(
    readonly specs: AttrSpec[],
    cap = 256,
  ) {
    this.cap = cap;
    this.arrays = specs.map((s) => new s.ctor(cap * 4));
  }
  /** reserve one more instance and return its index */
  add(): number {
    if (this.n >= this.cap) this.grow(this.cap * 2);
    return this.n++;
  }
  grow(cap: number): void {
    this.arrays = this.arrays.map((a, i) => {
      const b = new this.specs[i].ctor(cap * 4);
      b.set(a.subarray(0, this.n * 4));
      return b;
    });
    this.cap = cap;
  }
  /** shrink storage to the used size (master copies of generated plants) */
  trim(): this {
    if (this.cap !== this.n) this.grow(Math.max(1, this.n));
    return this;
  }
}

const enc = {
  /** signed normalized (Int16) */
  s16: (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * 32767))),
  u16: (v: number) => Math.max(0, Math.min(65535, Math.round(v * 65535))),
  s8: (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127))),
  u8: (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))),
};

/** card half-axes are stored as snorm16 / AXIS_SCALE metres */
export const AXIS_SCALE = 6;

export const CARD_SPECS: AttrSpec[] = [
  { name: 'iC', ctor: Float32Array, normalized: false }, // centre xyz, plant height H
  { name: 'iR', ctor: Float32Array, normalized: false }, // root xyz, plant index
  { name: 'iU', ctor: Int16Array, normalized: true }, // U half-axis / AXIS_SCALE, flutter
  { name: 'iV', ctor: Int16Array, normalized: true }, // V half-axis / AXIS_SCALE, ao
  { name: 'iN', ctor: Int8Array, normalized: true }, // spherized normal, lod (1 near, -1 far, 0 always)
  { name: 'iUV', ctor: Uint16Array, normalized: true }, // u0 v0 u1 v1
  { name: 'iK', ctor: Uint8Array, normalized: true }, // leaf rgb, translucency
  { name: 'iF', ctor: Uint8Array, normalized: true }, // flower rgb, gloss
  { name: 'iB', ctor: Uint8Array, normalized: true }, // ph1 w1 ph2 w2
];

export const WOOD_SPECS: AttrSpec[] = [
  { name: 'iA', ctor: Float32Array, normalized: false }, // start xyz, radius
  { name: 'iE', ctor: Float32Array, normalized: false }, // end xyz, radius
  { name: 'iR', ctor: Float32Array, normalized: false }, // root xyz, plant index
  { name: 'iX', ctor: Float32Array, normalized: false }, // H, lod (1 near, 0 always), ao start, ao end
  { name: 'iW', ctor: Uint8Array, normalized: true }, // ph1 w1A w1B ph2
  { name: 'iW2', ctor: Uint8Array, normalized: true }, // w2A w2B pattern side-bias
  { name: 'iK', ctor: Uint8Array, normalized: true }, // bark rgb, moss
];

export interface PlantRef {
  /** root (world) */
  x: number;
  y: number;
  z: number;
  /** plant height (main-bend normalisation) */
  h: number;
  /** plant index (LOD texel) */
  id: number;
}

/** wind attachment: limb level (ph1, w1) + branch level (ph2, w2), weights 0..1 */
export interface Sway {
  ph1: number;
  w1: number;
  ph2: number;
  w2: number;
}

export const STILL: Sway = { ph1: 0, w1: 0, ph2: 0, w2: 0 };

export interface CardIn {
  cx: number;
  cy: number;
  cz: number;
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
  nx: number;
  ny: number;
  nz: number;
  ao: number;
  flutter: number;
  /** 1 near, -1 far, 0 always */
  lod: number;
  uv: { u0: number; v0: number; u1: number; v1: number };
  /** leaf colour (linear) */
  r: number;
  g: number;
  b: number;
  trans: number;
  /** flower colour (linear) */
  fr: number;
  fg: number;
  fb: number;
  gloss: number;
  sway: Sway;
}

export function pushCard(buf: InstBuf, p: PlantRef, c: CardIn): void {
  const i = buf.add() * 4;
  const A = buf.arrays;
  const C = A[0] as Float32Array,
    R = A[1] as Float32Array,
    U = A[2] as Int16Array,
    V = A[3] as Int16Array,
    N = A[4] as Int8Array,
    UV = A[5] as Uint16Array,
    K = A[6] as Uint8Array,
    F = A[7] as Uint8Array,
    B = A[8] as Uint8Array;
  C[i] = c.cx;
  C[i + 1] = c.cy;
  C[i + 2] = c.cz;
  C[i + 3] = p.h;
  R[i] = p.x;
  R[i + 1] = p.y;
  R[i + 2] = p.z;
  R[i + 3] = p.id;
  U[i] = enc.s16(c.ux / AXIS_SCALE);
  U[i + 1] = enc.s16(c.uy / AXIS_SCALE);
  U[i + 2] = enc.s16(c.uz / AXIS_SCALE);
  U[i + 3] = enc.s16(c.flutter);
  V[i] = enc.s16(c.vx / AXIS_SCALE);
  V[i + 1] = enc.s16(c.vy / AXIS_SCALE);
  V[i + 2] = enc.s16(c.vz / AXIS_SCALE);
  V[i + 3] = enc.s16(c.ao);
  const nl = Math.hypot(c.nx, c.ny, c.nz) || 1;
  N[i] = enc.s8(c.nx / nl);
  N[i + 1] = enc.s8(c.ny / nl);
  N[i + 2] = enc.s8(c.nz / nl);
  N[i + 3] = enc.s8(c.lod);
  UV[i] = enc.u16(c.uv.u0);
  UV[i + 1] = enc.u16(c.uv.v0);
  UV[i + 2] = enc.u16(c.uv.u1);
  UV[i + 3] = enc.u16(c.uv.v1);
  K[i] = enc.u8(Math.sqrt(c.r));
  K[i + 1] = enc.u8(Math.sqrt(c.g));
  K[i + 2] = enc.u8(Math.sqrt(c.b));
  K[i + 3] = enc.u8(c.trans);
  F[i] = enc.u8(Math.sqrt(c.fr));
  F[i + 1] = enc.u8(Math.sqrt(c.fg));
  F[i + 2] = enc.u8(Math.sqrt(c.fb));
  F[i + 3] = enc.u8(c.gloss);
  B[i] = enc.u8(c.sway.ph1);
  B[i + 1] = enc.u8(c.sway.w1);
  B[i + 2] = enc.u8(c.sway.ph2);
  B[i + 3] = enc.u8(c.sway.w2);
}

export interface WoodIn {
  ax: number;
  ay: number;
  az: number;
  ra: number;
  bx: number;
  by: number;
  bz: number;
  rb: number;
  /** 1 near only, 0 always */
  lod: number;
  aoA: number;
  aoB: number;
  /** sway at the start / end (phases constant along a segment) */
  a: Sway;
  b: Sway;
  /** bark pattern code (see WOOD shader): 0.1 furrow, 0.3 smooth/grey, 0.5 plane, 0.7 palm rings, 0.9 birch */
  pattern: number;
  r: number;
  g: number;
  bl: number;
  moss: number;
}

export function pushWood(buf: InstBuf, p: PlantRef, w: WoodIn): void {
  const i = buf.add() * 4;
  const A = buf.arrays;
  const SA = A[0] as Float32Array,
    SE = A[1] as Float32Array,
    R = A[2] as Float32Array,
    X = A[3] as Float32Array,
    W = A[4] as Uint8Array,
    W2 = A[5] as Uint8Array,
    K = A[6] as Uint8Array;
  SA[i] = w.ax;
  SA[i + 1] = w.ay;
  SA[i + 2] = w.az;
  SA[i + 3] = w.ra;
  SE[i] = w.bx;
  SE[i + 1] = w.by;
  SE[i + 2] = w.bz;
  SE[i + 3] = w.rb;
  R[i] = p.x;
  R[i + 1] = p.y;
  R[i + 2] = p.z;
  R[i + 3] = p.id;
  X[i] = p.h;
  X[i + 1] = w.lod;
  X[i + 2] = w.aoA;
  X[i + 3] = w.aoB;
  W[i] = enc.u8(w.a.ph1);
  W[i + 1] = enc.u8(w.a.w1);
  W[i + 2] = enc.u8(w.b.w1);
  W[i + 3] = enc.u8(w.b.ph2);
  W2[i] = enc.u8(w.a.w2);
  W2[i + 1] = enc.u8(w.b.w2);
  W2[i + 2] = enc.u8(w.pattern);
  W2[i + 3] = 0;
  K[i] = enc.u8(Math.sqrt(w.r));
  K[i + 1] = enc.u8(Math.sqrt(w.g));
  K[i + 2] = enc.u8(Math.sqrt(w.bl));
  K[i + 3] = enc.u8(w.moss);
}

// ──────────────────────────────────────────────────────────────── knobs ──

export const cardKnobs = {
  /** main bend, limb bob, branch bob, leaf flutter */
  windK: { value: new THREE.Vector4(0.034, 0.12, 0.08, 0.045) },
  /** backlit translucency strength */
  trans: { value: 1.0 },
  /** diffuse wrap on cards */
  wrap: { value: 0.5 },
  /** per-leaf normal tilt */
  tilt: { value: 0.55 },
  /** received-shadow lookup shift toward the light (world vector, m) — set per frame */
  shadowShift: { value: new THREE.Vector3() },
  /** received-shadow shift length (m) */
  shadowShiftLen: { value: 0.45 },
  /** night readability lift */
  night: { value: 2.0 },
  /** 0 = plain (A/B of the leaf shading) */
  fx: { value: 1 },
  /** dissolve cards seen edge-on (0 off .. 1 full) */
  edgeFade: { value: 1 },
  /** fraction of far cards kept (quality tiers: high 1, medium 0.85, low 0.6) */
  farKeep: { value: 1 },
};

// ──────────────────────────────────────────────────────────────── GLSL ──

const VERT_COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
uniform sampler2D uThLod;
uniform vec4 uThWindK;
uniform float uThFarKeep;
${WIND_GLSL}
/** near weight of plant #id (LOD texture, 1024 texels per row) */
float thLodW( float id ) {
  int i = int( id + 0.5 );
  return texelFetch( uThLod, ivec2( i % 1024, i / 1024 ), 0 ).r;
}
/** main bending of point p (world) of a plant rooted at r with height H, local wind w */
vec3 thMainBend( vec3 p, vec3 r, float H, vec2 w, float ph ) {
  float hy = max( 0.0, p.y - r.y );
  float f = hy / max( 1.0, H );
  float bf = f * f * ( 1.6 - 0.6 * f );
  float sway = 0.62 + 0.26 * sin( uTime * ( 0.95 + 0.3 * ph ) + ph * 6.2831 ) + 0.12 * sin( uTime * 1.83 + ph * 11.0 );
  vec2 d = w * ( sway * bf * H * uThWindK.x );
  d += vec2( -w.y, w.x ) * ( sin( uTime * 0.77 + ph * 4.0 ) * 0.14 * bf * H * uThWindK.x );
  return vec3( d.x, -dot( d, d ) / max( 1.0, 2.0 * hy ), d.y );
}
/** two-level branch bob: br = (ph1, w1, ph2, w2) */
vec3 thBob( vec4 br, vec2 w ) {
  float wl = length( w );
  vec2 wd = w / max( 1e-4, wl );
  float a1 = br.x * 6.2831, a2 = br.z * 6.2831;
  float o1 = sin( uTime * 1.55 + a1 ) * 0.62 + sin( uTime * 2.47 + a1 * 1.7 ) * 0.38;
  float o2 = sin( uTime * 3.1 + a2 ) * 0.6 + sin( uTime * 4.9 + a2 * 1.3 ) * 0.4;
  float k1 = br.y * uThWindK.y * wl, k2 = br.w * uThWindK.z * wl;
  float h = o1 * k1 * 0.7 + o2 * k2 * 0.55;
  return vec3( wd.x * h + wd.y * o2 * k2 * 0.3, o1 * k1 + o2 * k2, wd.y * h - wd.x * o2 * k2 * 0.3 );
}
float thPlantPhase( vec3 r ) {
  return fract( sin( dot( r.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}
`;

const CARD_VERT_PARS = /* glsl */ `
attribute vec4 iC;
attribute vec4 iR;
attribute vec4 iU;
attribute vec4 iV;
attribute vec4 iN;
attribute vec4 iUV;
attribute vec4 iK;
attribute vec4 iF;
attribute vec4 iB;
varying vec2 vThUv;
varying float vThVis;
${VERT_COMMON}
#ifndef TH_DEPTH
uniform float uThEdgeFade;
varying vec4 vThK;
varying vec4 vThF;
varying float vThAO;
varying vec3 vThU;
varying vec3 vThV;
varying vec3 vThWPos;
#endif
void thCard( out vec3 P, out vec3 N ) {
  float nearW = thLodW( iR.w );
  float vis = iN.w > 0.5 ? nearW : iN.w < -0.5 ? 1.0 - nearW : 1.0;
  // lower quality tiers keep a subset of the far cards
  if ( iN.w < -0.5 && fract( iB.z * 7.13 + iB.x * 3.1 ) > uThFarKeep ) vis = 0.0;
  vThVis = vis;
  vec3 U = iU.xyz * ${AXIS_SCALE.toFixed(1)};
  vec3 V = iV.xyz * ${AXIS_SCALE.toFixed(1)};
  P = iC.xyz + U * position.x + V * position.y;
  N = normalize( iN.xyz );
  vThUv = vec2( mix( iUV.x, iUV.z, position.x * 0.5 + 0.5 ), mix( iUV.y, iUV.w, position.y * 0.5 + 0.5 ) );
  if ( vis < 0.004 ) {
    P = iR.xyz;
  } else {
    vec2 w = thWindAt( iR.xz );
    float ph = thPlantPhase( iR.xyz );
    float vph = dot( P, vec3( 2.13, 1.71, 2.97 ) );
    P += thMainBend( P, iR.xyz, iC.w, w, ph );
    P += thBob( iB, w );
    float g = thGust( iR.xz );
    float fl = sin( uTime * 7.3 + vph ) * 0.6 + sin( uTime * 11.1 + vph * 1.37 ) * 0.4;
    P += N * ( fl * iU.w * uThWindK.w * ( 0.3 + g ) * length( uWind ) );
  }
#ifndef TH_DEPTH
  // cards seen edge-on dissolve (their leaves would smear into streaks); the others cover for them
  vec3 fN = normalize( cross( U, V ) );
  vec3 toCam = normalize( cameraPosition - P );
  vThVis *= mix( 1.0, smoothstep( 0.04, 0.22, abs( dot( fN, toCam ) ) ), uThEdgeFade );
  vThK = iK;
  vThF = iF;
  vThAO = iV.w;
  vThU = normalize( U );
  vThV = normalize( V );
  vThWPos = P;
#endif
}
`;

const WOOD_VERT_PARS = /* glsl */ `
attribute vec4 iA;
attribute vec4 iE;
attribute vec4 iR;
attribute vec4 iX;
attribute vec4 iW;
attribute vec4 iW2;
attribute vec4 iK;
${VERT_COMMON}
#ifndef TH_DEPTH
varying vec4 vThK;
varying float vThAO;
varying vec3 vThRest;
varying vec3 vThWPos;
varying float vThPat;
varying vec3 vThWN;
varying float vThAng;
#endif
void thWood( out vec3 P, out vec3 N ) {
  float nearW = thLodW( iR.w );
  bool hide = iX.y > 0.5 && nearW < 0.5;
  float t = position.y;
  vec3 A = iA.xyz, B = iE.xyz;
  vec3 ax = B - A;
  float L = max( 1e-4, length( ax ) );
  vec3 d = ax / L;
  // overlap neighbours a little at the joints (ring planes differ at a bend → no cracks)
  A -= d * iA.w * 0.45;
  B += d * iE.w * 0.45;
  ax = B - A;
  L = length( ax );
  vec3 ref = abs( d.y ) > 0.95 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
  vec3 s1 = normalize( cross( ref, d ) );
  vec3 s2 = cross( d, s1 );
  float r = mix( iA.w, iE.w, t );
  vec3 ring = s1 * position.x + s2 * position.z;
  vec3 C = mix( A, B, t );
  P = C + ring * r;
  float slope = ( iA.w - iE.w ) / L;
  N = normalize( ring + d * slope );
#ifndef TH_DEPTH
  vThRest = P;
  vThK = iK;
  vThAO = mix( iX.z, iX.w, t );
  vThPat = iW2.z;
  vThWN = N;
  vThAng = atan( position.z, position.x );
#endif
  if ( hide ) {
    P = iR.xyz;
  } else {
    vec2 w = thWindAt( iR.xz );
    float ph = thPlantPhase( iR.xyz );
    vec3 disp = thMainBend( C, iR.xyz, iX.x, w, ph );
    vec4 br = vec4( iW.x, mix( iW.y, iW.z, t ), iW.w, mix( iW2.x, iW2.y, t ) );
    disp += thBob( br, w );
    P += disp;
  }
#ifndef TH_DEPTH
  vThWPos = P;
#endif
}
`;

const CARD_FRAG_PARS = /* glsl */ `
uniform sampler2D uThAtlas;
uniform float uThTrans;
uniform float uThWrapK;
uniform float uThTilt;
uniform float uThNightK;
uniform float uThFx;
uniform float uNight;
varying vec2 vThUv;
varying float vThVis;
varying vec4 vThK;
varying vec4 vThF;
varying float vThAO;
varying vec3 vThU;
varying vec3 vThV;
varying vec3 vThWPos;
float thWrap;
float thTransK;
float thId;
${LAMP_GLSL}
`;

const CARD_FRAG_MAP = /* glsl */ `
vec4 thTx = texture2D( uThAtlas, vThUv );
if ( thTx.a < 0.5 ) discard;
thId = thTx.g;
if ( thId > vThVis ) discard;
{
  float wood = 1.0 - smoothstep( 0.02, 0.07, thId );
  float flw = smoothstep( 0.55, 0.9, thTx.b );
  float br = 0.28 + 0.92 * thTx.r;
  vec3 leafC = vThK.rgb * vThK.rgb * br;
  float hd = ( thId - 0.55 ) * uThFx;
  leafC *= vec3( 1.0 + 0.2 * hd, 1.0 + 0.08 * hd, 1.0 - 0.26 * hd );
  vec3 c = mix( leafC, vec3( 0.2, 0.15, 0.11 ) * br, wood );
  c = mix( c, vThF.rgb * vThF.rgb * ( 0.45 + 0.65 * thTx.r ), flw );
  diffuseColor.rgb = c;
  thTransK = uThTrans * vThK.a * ( 1.0 - wood ) * ( 1.0 - 0.6 * flw ) * uThFx;
  thWrap = uThWrapK * ( 1.0 - wood );
}
`;

const CARD_FRAG_NORMAL = /* glsl */ `
if ( uThFx > 0.5 ) {
  float ta = ( thId - 0.55 ) * 2.0;
  float tb = fract( thId * 13.71 ) * 2.0 - 1.0;
  vec3 tU = normalize( mat3( viewMatrix ) * vThU );
  vec3 tV = normalize( mat3( viewMatrix ) * vThV );
  normal = normalize( normal + ( tU * ta + tV * tb ) * uThTilt );
}
`;

const CARD_FRAG_AO = /* glsl */ `
{
  float ao = vThAO;
  float aoN = mix( ao, 1.0 - ( 1.0 - ao ) * 0.35, uNight );
  reflectedLight.indirectDiffuse *= aoN;
  reflectedLight.directDiffuse *= mix( 1.0, aoN, 0.25 );
  reflectedLight.indirectSpecular *= aoN * 0.5;
  vec3 wN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  if ( uNight > 0.01 ) {
    float top = smoothstep( -0.2, 0.85, wN.y );
    float lift = uNight * uThNightK;
    reflectedLight.indirectDiffuse *= 1.0 + lift * ( 0.55 + 0.45 * top );
    reflectedLight.directDiffuse *= 1.0 + lift * 1.2 * top;
  }
  if ( uLampGain > 0.001 ) {
    vec3 lamp = thLampLight( vThWPos, wN );
    float under = saturate( -wN.y );
    if ( under > 0.01 ) lamp += thLampLight( vThWPos - vec3( 0.0, 2.5, 0.0 ), vec3( 0.0, 1.0, 0.0 ) ) * ( under * 0.7 );
    reflectedLight.indirectDiffuse += diffuseColor.rgb * lamp * ( 0.45 + 0.55 * ao );
  }
}
`;

const WOOD_FRAG_PARS = /* glsl */ `
uniform float uNight;
uniform float uThFx;
varying vec4 vThK;
varying float vThAO;
varying vec3 vThRest;
varying vec3 vThWPos;
varying float vThPat;
varying vec3 vThWN;
varying float vThAng;
float thWrap;
${NOISE_GLSL}
${LAMP_GLSL}
`;

/** bark painted in-shader, faded to its mean by the pixel footprint */
const WOOD_FRAG_MAP = /* glsl */ `
thWrap = 0.0;
{
  vec3 bc = vThK.rgb * vThK.rgb;
  float foot = length( fwidth( vThRest ) );
  float pat = vThPat;
  if ( uThFx > 0.5 ) {
    if ( pat > 0.8 ) {
      // birch: white with dark horizontal dashes
      float fade = 1.0 - smoothstep( 0.035, 0.11, foot );
      float n = thNoised( vThRest * vec3( 3.2, 10.0, 3.2 ) ).x;
      float m = mix( 0.13, smoothstep( 0.12, 0.22, n ), fade );
      bc = mix( bc, vec3( 0.05, 0.045, 0.04 ), m * 0.9 );
    } else if ( pat > 0.6 ) {
      float fade = 1.0 - smoothstep( 0.03, 0.12, foot );
      float yy = vThRest.y;
      if ( pat > 0.66 ) {
        // date / Canary palm: diamond lattice of old leaf-base scars (two families of helices)
        float n = 7.0 / 6.2831853;
        float u = fract( yy * 3.1 + vThAng * n ), v = fract( yy * 3.1 - vThAng * n );
        float d = min( min( u, 1.0 - u ), min( v, 1.0 - v ) );
        float boss = smoothstep( 0.0, 0.2, d );
        float n2 = thNoised( vThRest * 7.0 ).x;
        bc *= mix( 0.84, ( 0.58 + 0.52 * boss ) * ( 0.92 + 0.16 * n2 ), fade );
      } else {
        // Washingtonia: fine horizontal growth rings on a smooth grey-brown column
        float ring = abs( fract( yy * 4.6 + 0.08 * sin( vThAng * 2.0 ) ) - 0.5 );
        bc *= mix( 0.93, 0.8 + 0.24 * smoothstep( 0.04, 0.22, ring ), fade );
      }
    } else if ( pat > 0.4 ) {
      // plane: camouflage mottling (cream, olive, grey-brown plates)
      float fade = 1.0 - smoothstep( 0.04, 0.16, foot );
      float n = thNoised( vThRest * 1.6 ).x + 0.5 * thNoised( vThRest * 3.7 + 7.1 ).x;
      vec3 cream = vec3( 0.62, 0.6, 0.48 ), olive = vec3( 0.36, 0.37, 0.27 ), grey = vec3( 0.42, 0.38, 0.33 );
      vec3 mc = n > 0.18 ? cream : n > -0.12 ? olive : grey;
      bc = mix( bc, mc * mc, 0.85 * mix( 0.4, 1.0, fade ) );
    } else if ( pat > 0.2 ) {
      // smooth grey bark (ficus, olive): fine fissures
      float fade = 1.0 - smoothstep( 0.025, 0.09, foot );
      float n = thNoised( vThRest * vec3( 6.0, 2.2, 6.0 ) ).x;
      bc *= 1.0 - 0.28 * mix( 0.35, smoothstep( -0.05, 0.25, abs( n ) * 2.0 ), fade );
    } else {
      // furrowed bark
      float fade = 1.0 - smoothstep( 0.025, 0.09, foot );
      float n = thNoised( vThRest * vec3( 9.0, 1.4, 9.0 ) ).x;
      bc *= 1.0 - 0.34 * mix( 0.45, smoothstep( -0.08, 0.22, n ), fade );
    }
    // moss / green algae on the shaded north side
    vec3 wNm = normalize( vThWN );
    float moss = vThK.a * smoothstep( 0.1, -0.7, wNm.z ) * ( 0.6 + 0.4 * thNoised( vThRest * 2.3 ).x );
    bc = mix( bc, vec3( 0.075, 0.1, 0.035 ), saturate( moss ) * 0.7 );
  }
  diffuseColor.rgb = bc;
}
`;

const WOOD_FRAG_AO = /* glsl */ `
{
  float ao = vThAO;
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.directDiffuse *= mix( 1.0, ao, 0.3 );
  reflectedLight.indirectSpecular *= ao * 0.5;
  vec3 wN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  if ( uNight > 0.01 ) reflectedLight.indirectDiffuse *= 1.0 + uNight * 0.8;
  if ( uLampGain > 0.001 ) reflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight( vThWPos, wN ) * ( 0.5 + 0.5 * ao );
}
`;

/** RE_Direct with wrapped diffuse (thWrap) + backlit translucency for cards (thTransK) */
let cardPars: string | null = null;
function cardPhysicalPars(): string {
  if (cardPars) return cardPars;
  const src = wrappedPhysicalPars();
  const anchor = 'reflectedLight.directDiffuse += thIrrW * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  const k = src.indexOf(anchor);
  if (k < 0) {
    cardPars = src;
    return src;
  }
  const trans = `
	{
		// Barré-Brisebois translucency: light through thin leaves toward the eye, already shadowed
		vec3 tL = normalize( directLight.direction + geometryNormal * 0.35 );
		float t = pow( saturate( dot( geometryViewDir, -tL ) ), 4.0 );
		float a = saturate( 0.4 - 0.6 * dot( geometryNormal, directLight.direction ) );
		vec3 tc = material.diffuseContribution * ( 0.45 + 1.4 * material.diffuseContribution ) * vec3( 1.06, 1.0, 0.62 );
		reflectedLight.directDiffuse += directLight.color * tc * ( t * 2.2 + a * 0.18 ) * thTransK;
	}`;
  cardPars = src.slice(0, k + anchor.length) + trans + src.slice(k + anchor.length);
  return cardPars;
}

/** the standard normal_fragment_begin without the back-face flip (normals are crown-spherized) */
const NORMAL_BEGIN_NOFLIP = THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, '');

/** shadowmap_vertex with the received-shadow lookup shifted toward the light (uThShadowShift, world) */
const SHADOW_VERT_SHIFT = THREE.ShaderChunk.shadowmap_vertex.replace(
  'shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );',
  'shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias + uThShadowShift, 0 );',
);

export interface FoliageMaterials {
  mat: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
}

function commonUniforms(u: GlobalUniforms, lod: THREE.Texture): Record<string, THREE.IUniform> {
  return { uTime: u.uTime, uWind: u.uWind, uThLod: { value: lod }, uThWindK: cardKnobs.windK, uThFarKeep: cardKnobs.farKeep };
}

export function cardMaterials(u: GlobalUniforms, atlas: THREE.Texture, lod: THREE.Texture): FoliageMaterials {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'veg-cards';
  mat.shadowSide = THREE.DoubleSide;
  const lodU = { value: lod };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, commonUniforms(u, lod), lampUniforms(), {
      uThLod: lodU,
      uThAtlas: { value: atlas },
      uThTrans: cardKnobs.trans,
      uThWrapK: cardKnobs.wrap,
      uThTilt: cardKnobs.tilt,
      uThNightK: cardKnobs.night,
      uThFx: cardKnobs.fx,
      uThShadowShift: cardKnobs.shadowShift,
      uThEdgeFade: cardKnobs.edgeFade,
      uNight: u.uNight,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${CARD_VERT_PARS}\nuniform vec3 uThShadowShift;\nvec3 thP; vec3 thN;`)
      .replace('#include <beginnormal_vertex>', 'thCard( thP, thN );\nvec3 objectNormal = thN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = thP;')
      .replace('#include <shadowmap_vertex>', SHADOW_VERT_SHIFT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${CARD_FRAG_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', cardPhysicalPars())
      .replace('#include <map_fragment>', CARD_FRAG_MAP)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.82, 0.42, vThF.a );',
      )
      .replace('#include <normal_fragment_begin>', NORMAL_BEGIN_NOFLIP)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CARD_FRAG_NORMAL}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${CARD_FRAG_AO}`);
  };
  mat.customProgramCacheKey = () => 'veg-cards-1';
  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'veg-cards-depth';
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, commonUniforms(u, lod), { uThLod: lodU, uThAtlas: { value: atlas } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n#define TH_DEPTH\n${CARD_VERT_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 thP; vec3 thN;\nthCard( thP, thN );\nvec3 transformed = thP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uThAtlas;\nvarying vec2 vThUv;\nvarying float vThVis;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{ vec4 thTx = texture2D( uThAtlas, vThUv ); if ( thTx.a < 0.5 || thTx.g > vThVis ) discard; }');
  };
  depth.customProgramCacheKey = () => 'veg-cards-depth-1';
  return { mat, depth };
}

export function woodMaterials(u: GlobalUniforms, lod: THREE.Texture): FoliageMaterials {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.name = 'veg-wood';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, commonUniforms(u, lod), lampUniforms(), { uNight: u.uNight, uThFx: cardKnobs.fx });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${WOOD_VERT_PARS}\nvec3 thP; vec3 thN;`)
      .replace('#include <beginnormal_vertex>', 'thWood( thP, thN );\nvec3 objectNormal = thN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = thP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${WOOD_FRAG_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', wrappedPhysicalPars())
      .replace('#include <map_fragment>', WOOD_FRAG_MAP)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${WOOD_FRAG_AO}`);
  };
  mat.customProgramCacheKey = () => 'veg-wood-1';
  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'veg-wood-depth';
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, commonUniforms(u, lod));
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n#define TH_DEPTH\n${WOOD_VERT_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 thP; vec3 thN;\nthWood( thP, thN );\nvec3 transformed = thP;');
  };
  depth.customProgramCacheKey = () => 'veg-wood-depth-1';
  return { mat, depth };
}

// ─────────────────────────────────────────────────────────── instanced mesh ──

function quadGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const TUBE_SIDES = 8;
function tubeGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  const pos: number[] = [];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < TUBE_SIDES; i++) {
      const a = (i / TUBE_SIDES) * Math.PI * 2;
      pos.push(Math.cos(a), r, Math.sin(a));
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < TUBE_SIDES; i++) {
    const i1 = (i + 1) % TUBE_SIDES;
    idx.push(i, i1, TUBE_SIDES + i1, i, TUBE_SIDES + i1, TUBE_SIDES + i);
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

/**
 * Instanced mesh over [static part | dynamic part]: the static part is uploaded once; `setDynamic`
 * copies plants' master buffers behind it and uploads only that range.
 */
export class FoliageLayer {
  readonly mesh: THREE.Mesh;
  readonly geo: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[] = [];
  readonly staticCount: number;
  dynCount = 0;
  readonly dynCap: number;

  constructor(kind: 'cards' | 'wood', stat: InstBuf, dynCap: number, mats: FoliageMaterials, name: string) {
    this.geo = kind === 'cards' ? quadGeometry() : tubeGeometry();
    this.staticCount = stat.n;
    this.dynCap = dynCap;
    const total = stat.n + dynCap;
    stat.specs.forEach((s, i) => {
      const arr = new s.ctor(Math.max(1, total) * 4);
      arr.set(stat.arrays[i].subarray(0, stat.n * 4));
      const a = new THREE.InstancedBufferAttribute(arr, 4, s.normalized);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(s.name, a);
      this.attrs.push(a);
    });
    this.geo.instanceCount = stat.n;
    this.mesh = new THREE.Mesh(this.geo, mats.mat);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.customDepthMaterial = mats.depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  /** replace the dynamic part with the concatenation of `parts` (stops at capacity); returns count written */
  setDynamic(parts: InstBuf[]): number {
    let n = 0;
    const base = this.staticCount;
    for (const p of parts) {
      if (n + p.n > this.dynCap) break;
      for (let i = 0; i < this.attrs.length; i++) {
        (this.attrs[i].array as TA).set(p.arrays[i].subarray(0, p.n * 4), (base + n) * 4);
      }
      n += p.n;
    }
    this.dynCount = n;
    if (n > 0) {
      for (const a of this.attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(base * 4, n * 4);
        a.needsUpdate = true;
      }
    }
    this.geo.instanceCount = base + n;
    return n;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

/** per-plant near weight texture (R8, 1024 wide) */
export class LodTexture {
  readonly tex: THREE.DataTexture;
  readonly data: Uint8Array;
  dirty = false;
  constructor(n: number) {
    const rows = Math.max(1, Math.ceil(n / 1024));
    this.data = new Uint8Array(1024 * rows);
    this.tex = new THREE.DataTexture(this.data, 1024, rows, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
  }
  set(i: number, w: number): void {
    const v = Math.max(0, Math.min(255, Math.round(w * 255)));
    if (this.data[i] !== v) {
      this.data[i] = v;
      this.dirty = true;
    }
  }
  flush(): void {
    if (this.dirty) {
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
  }
}
