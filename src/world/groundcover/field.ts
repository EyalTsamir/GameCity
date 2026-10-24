// The blade field: grass, wildflowers, reeds, marram and fallen leaves as camera-centred LOD rings.
//
// Each ring is ONE instanced draw: an instance is a square tile (x0, z0, size, lawn flag); the blades
// inside a tile are generated in the vertex shader from the vertex attributes (side, level, blade index)
// and integer hashes of (tile, blade) — no per-blade data, deterministic, so a recycled tile never
// re-randomises. Root positions: an R2 low-discrepancy sequence shifted per tile + jitter (no visible
// repetition). Every blade reads the cover maps at its root (texelFetch), the surface height (4 taps,
// step-aware) and the one wind (core/wind.ts thWindAt / thGust).
//
//   ring A  2 m tiles, 7-vertex blades, dense (~160/m²): lawns, meadows, flowers, leaves, reeds, weeds
//   ring B  4 m tiles, 5-vertex blades, ~40/m², ×2 wider: long grass, edges, flowers, reeds (+ lawns at
//           grazing views)
//   ring C  8 m tiles, 3-vertex blades, ~12/m², ×4 wider: meadows, reeds, dunes, flower flecks
// Rings cross-fade per blade (personal cut distances from a hash): a blade shrinks to nothing over
// ~1.5 m while the next ring's blades grow in over the same band — no popping, no visible seam.
//
// CPU per frame (scene.onBeforeRender with the final camera of this frame): walk the candidate tiles
// of each ring in near→far order (precomputed spiral), reject empty tiles (boot metadata), by 3D
// distance and frustum, and write the survivors into a preallocated instance buffer (front-to-back
// for early-Z). No allocations.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { WIND_GLSL } from '../../core/wind';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { SLAB } from '../../core/constants';
import { noiseTexture } from '../terrain/noise';
import { GC_PALETTE_GLSL, gcPalette } from './palette';
import { CRES, FRES, CW, CH, FW, FH, type CoverMaps, type TileGrid } from './mask';
import { setGroundBladeFade } from '../terrain/ground';
import type { OuterMaps } from './outer';

export interface RingSpec {
  /** 0 = A, 1 = B, 2 = C */
  index: number;
  tile: number;
  /** vertex-pair levels below the tip (3 → 7 verts, 2 → 5, 1 → 3) */
  levels: number;
  /** blades per tile at full density */
  blades: number;
  /** fade-in band (per-blade cut uniformly in [in0, in1]); negative = none */
  in0: number;
  in1: number;
  /** fade-out band */
  out0: number;
  out1: number;
  /** blade width multiplier (coverage compensation for thinner rings) */
  width: number;
  /** fraction of blades that turn into a flower at full flower density */
  flowers: number;
  lawnFlowers: number;
  litter: number;
}

export type QualityLevel = 'low' | 'medium' | 'high';

/** Ring layouts per quality tier (distances in metres from the camera, 3D). */
export function ringSpecs(level: QualityLevel): RingSpec[] {
  if (level === 'low')
    return [{ index: 0, tile: 2, levels: 3, blades: 300, in0: -10, in1: -10, out0: 7, out1: 9.5, width: 1.45, flowers: 0.24, lawnFlowers: 0.1, litter: 0.45 }];
  if (level === 'medium')
    return [
      { index: 0, tile: 2, levels: 3, blades: 448, in0: -10, in1: -10, out0: 9, out1: 12, width: 1.25, flowers: 0.24, lawnFlowers: 0.09, litter: 0.5 },
      { index: 1, tile: 4, levels: 2, blades: 384, in0: 9, in1: 12, out0: 24, out1: 29, width: 2.6, flowers: 0.15, lawnFlowers: 0, litter: 0 },
    ];
  return [
    { index: 0, tile: 2, levels: 3, blades: 576, in0: -10, in1: -10, out0: 9.5, out1: 12.5, width: 1.06, flowers: 0.24, lawnFlowers: 0.08, litter: 0.55 },
    { index: 1, tile: 4, levels: 2, blades: 448, in0: 9.5, in1: 12.5, out0: 29, out1: 35, width: 2.35, flowers: 0.15, lawnFlowers: 0, litter: 0.12 },
    { index: 2, tile: 8, levels: 1, blades: 512, in0: 29, in1: 35, out0: 56, out1: 66, width: 4.3, flowers: 0.12, lawnFlowers: 0, litter: 0 },
  ];
}

/** max blade height + bend reach used for the tile bounds (m) */
const BLADE_UP = 2.1;
const BLADE_SIDE = 0.9;

// ─────────────────────────────────────────────────────────────── GLSL ──

const HASH_GLSL = /* glsl */ `
uvec3 gcPcg3( uvec3 v ) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 gcRand3( uvec3 v ) { return vec3( gcPcg3( v ) ) * ( 1.0 / 4294967296.0 ); }
`;

const VERT_PARS = /* glsl */ `
attribute vec4 iTile;
uniform sampler2D tCover;
uniform sampler2D tFlower;
uniform sampler2D tGH;
uniform sampler2D tNoise;
uniform vec4 uCovXf;
uniform vec4 uCovDim;
uniform sampler2D tCoverO;
uniform sampler2D tFlowerO;
uniform sampler2D tGHO;
uniform vec4 uOutXf;
uniform vec4 uOutDim;
uniform float uTime;
uniform vec2 uWind;
uniform vec4 uFade;
uniform vec4 uBlade;
uniform vec4 uKind;
uniform vec3 gcFl[ 10 ];
varying vec3 vGcCol;
varying vec3 vGcW;
varying vec3 vGcN;
varying float vGcTrans;
varying float vGcRough;
${WIND_GLSL}
${HASH_GLSL}
${GC_PALETTE_GLSL}

// surface height at xz: 4 taps of a height map (xf = origin.xy, 1/res), taps across a step (kerb) ignored
float gcGroundY( sampler2D tH, vec2 xz, vec4 xf, vec2 dim ) {
  vec2 t = ( xz - xf.xy ) * xf.z - 0.5;
  vec2 fl = floor( t );
  vec2 f = t - fl;
  ivec2 i0 = clamp( ivec2( fl ), ivec2( 0 ), ivec2( dim ) - 2 );
  float h00 = texelFetch( tH, i0, 0 ).r;
  float h10 = texelFetch( tH, i0 + ivec2( 1, 0 ), 0 ).r;
  float h01 = texelFetch( tH, i0 + ivec2( 0, 1 ), 0 ).r;
  float h11 = texelFetch( tH, i0 + ivec2( 1, 1 ), 0 ).r;
  float hn = f.y < 0.5 ? ( f.x < 0.5 ? h00 : h10 ) : ( f.x < 0.5 ? h01 : h11 );
  vec4 w = vec4( ( 1.0 - f.x ) * ( 1.0 - f.y ), f.x * ( 1.0 - f.y ), ( 1.0 - f.x ) * f.y, f.x * f.y );
  w *= step( abs( vec4( h00, h10, h01, h11 ) - hn ), vec4( 0.06 ) );
  return dot( w, vec4( h00, h10, h01, h11 ) ) / max( 1e-4, w.x + w.y + w.z + w.w );
}

// nearest of the 2×2 jittered clump points (cells of 'size' m): xyz hash, w distance / size; centre out
vec4 gcClump( vec2 p, float size, out vec2 centre ) {
  vec2 g = p / size;
  vec2 b = floor( g - 0.5 );
  float best = 1e9;
  vec4 res = vec4( 0.0 );
  centre = p;
  for ( int j = 0; j < 2; j ++ ) {
    for ( int i = 0; i < 2; i ++ ) {
      vec2 c = b + vec2( float( i ), float( j ) );
      vec3 hh = gcRand3( uvec3( uvec2( ivec2( c ) + 70000 ), 31u ) );
      vec2 pt = ( c + 0.5 + ( hh.xy - 0.5 ) * 0.8 ) * size;
      float d = dot( pt - p, pt - p );
      if ( d < best ) { best = d; centre = pt; res = vec4( hh, sqrt( d ) / size ); }
    }
  }
  return res;
}
`;

/** vertex main: replaces <beginnormal_vertex>; <begin_vertex> then takes gcPos */
const VERT_MAIN = /* glsl */ `
vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );
vec3 gcPos = vec3( cameraPosition.x, -500.0, cameraPosition.z );
vGcCol = vec3( 0.0 );
vGcTrans = 0.0;
vGcRough = 0.85;
{
  float side = position.x;
  float lv = position.y;          // 0 … 1 (tip)
  float bi = position.z;
  vec2 tc = floor( iTile.xy / iTile.z + 0.5 );
  uvec2 tcu = uvec2( ivec2( tc ) + 40000 );
  uvec3 s0 = uvec3( tcu, uint( bi ) + uint( uKind.w ) * 65536u );
  vec3 ra = gcRand3( s0 );
  vec3 rb = gcRand3( s0 ^ uvec3( 0x9E3779B9u, 0x85EBCA6Bu, 0xC2B2AE35u ) );
  vec3 rc = gcRand3( s0.zxy ^ uvec3( 0x27D4EB2Fu, 0x165667B1u, 0x61C88647u ) );
  vec2 sh = gcRand3( uvec3( tcu, 977u ) ).xy;
  vec2 r2 = fract( sh + bi * vec2( 0.7548776662466927, 0.5698402909980532 ) );
  float spacing = iTile.z * inversesqrt( uBlade.x );
  vec2 root = iTile.xy + r2 * iTile.z + ( ra.xy - 0.5 ) * spacing * 0.7;
  vec2 cu = ( root - uCovXf.xy ) * uCovXf.z;
  vec2 ou = ( root - uOutXf.xy ) * uOutXf.z;
  bool inS = cu.x >= 0.0 && cu.y >= 0.0 && cu.x < uCovDim.x && cu.y < uCovDim.y;
  bool inO = !inS && uOutDim.z > 0.5 && ou.x >= 0.0 && ou.y >= 0.0 && ou.x < uOutDim.x && ou.y < uOutDim.y;
  if ( inS || inO ) {
    vec4 cov, flw;
    float y0;
    if ( inS ) {
      cov = texelFetch( tCover, ivec2( cu ), 0 );
      flw = texelFetch( tFlower, ivec2( ( root - uCovXf.xy ) * uCovXf.w ), 0 );
      y0 = gcGroundY( tGH, root, uCovXf, uCovDim.xy );
    } else {
      // landscape band around the slab (groundcover/outer.ts)
      cov = texelFetch( tCoverO, ivec2( ou ), 0 );
      flw = texelFetch( tFlowerO, ivec2( ( root - uOutXf.xy ) * uOutXf.w ), 0 );
      y0 = gcGroundY( tGHO, root, uOutXf, uOutDim.xy );
    }
    float hab = cov.b * 255.0;
    float wet = ( hab > 0.5 && hab < 100.5 ) ? hab / 100.0 : 0.0;
    float dune = hab > 149.5 ? clamp( ( hab - 150.0 ) / 105.0, 0.0, 1.0 ) : 0.0;
    float weedH = abs( hab - 120.0 ) < 0.5 ? 1.0 : 0.0;
    float len = cov.g;
    float lawnOK = iTile.w;
    bool leaf = rc.x < cov.a * uKind.z;
    bool alive = ra.z < cov.r * uBlade.z && ( len > 0.22 || wet > 0.0 || lawnOK > 0.5 );
    vec3 rw = vec3( root.x, y0, root.y );
    float dist = distance( rw, cameraPosition );
    float fin = uFade.x + ( uFade.y - uFade.x ) * rb.x;
    float fout = uFade.z + ( uFade.w - uFade.z ) * rb.y;
    float fade = smoothstep( fin - 1.2, fin, dist ) * ( 1.0 - smoothstep( fout - 1.5, fout, dist ) );
    if ( ( alive || leaf ) && fade > 0.0 ) {
      vec2 toCam = cameraPosition.xz - root;
      toCam *= inversesqrt( max( 1e-6, dot( toCam, toCam ) ) );
      vec2 perp = vec2( -toCam.y, toCam.x );
      float pxw = dist * uBlade.w;          // world size of one pixel at the root
      vec4 nM = textureLod( tNoise, root * 0.0031, 0.0 );
      vec4 nA = textureLod( tNoise, root * 0.0104, 0.0 );
      float yaw = rb.z * 6.2831853;
      vec2 wd = vec2( cos( yaw ), sin( yaw ) );
      vec3 nUp = vec3( 0.0, 1.0, 0.0 );
      if ( leaf ) {
        // ── fallen leaf lying on the ground (lawns and paving), slightly curled
        float ll = mix( 0.035, 0.075, rc.y ) * max( 1.0, pxw * 2.0 / 0.04 );
        float lw = ll * mix( 0.45, 0.7, rc.z );
        float prof = lv < 0.01 ? 0.25 : ( lv < 0.4 ? 1.0 : ( lv < 0.8 ? 0.8 : 0.0 ) );
        vec2 along = wd * ( lv - 0.5 ) * ll;
        vec2 across = vec2( -wd.y, wd.x ) * side * lw * 0.5 * prof;
        gcPos = vec3( root.x + along.x + across.x, y0 + 0.012 + lv * ( 1.0 - lv ) * 0.02 * fade, root.y + along.y + across.y );
        gcPos = mix( rw + vec3( 0.0, 0.012, 0.0 ), gcPos, fade );
        float pick = fract( rc.y * 7.13 + rc.z * 3.7 );
        vec3 lc = pick < 0.3 ? vec3( 0.25, 0.13, 0.05 ) : pick < 0.55 ? vec3( 0.45, 0.27, 0.06 ) : pick < 0.72 ? vec3( 0.48, 0.14, 0.035 ) : pick < 0.88 ? vec3( 0.22, 0.24, 0.07 ) : vec3( 0.36, 0.3, 0.16 );
        vGcCol = lc * ( 0.8 + 0.35 * fract( rc.z * 13.1 ) ) * ( 0.75 + 0.25 * abs( side ) );
        objectNormal = normalize( vec3( ( rc.y - 0.5 ) * 0.3, 1.0, ( rc.z - 0.5 ) * 0.3 ) );
        vGcRough = 0.7;
        vGcTrans = 0.15;
      } else {
        // ── a blade: grass / unmown tuft / meadow / reed / marram / flower
        vec2 cc;
        float csz = weedH > 0.5 ? 0.22 : ( dune > 0.0 ? 0.55 : ( len > 0.5 ? 0.9 : 0.7 ) );
        vec4 cl = gcClump( root, csz, cc );
        vec2 outw = root - cc;
        float ol = length( outw );
        outw = ol > 1e-4 ? outw / ol : wd;
        bool reed = wet > 0.0 && fract( rb.z * 13.7 ) < wet * 0.92;
        bool marram = !reed && dune > 0.0;
        if ( marram ) {
          root = mix( root, cc, 0.55 * dune );
          rw.xz = root;
        }
        float kept = 1.0 - smoothstep( 0.18, 0.4, len );
        // length class → metres
        float Lc = len < 0.25 ? mix( 0.045, 0.1, len / 0.25 ) : ( len < 0.5 ? mix( 0.1, 0.36, ( len - 0.25 ) / 0.25 ) : mix( 0.36, 0.85, ( len - 0.5 ) / 0.5 ) );
        float L = Lc * ( 0.62 + 0.62 * rc.y ) * mix( 0.82 + 0.36 * cl.x, 0.66 + 0.68 * cl.x, smoothstep( 0.45, 0.7, len ) );
        float W = mix( 0.008, 0.013, fract( rc.z * 5.3 ) ) * ( 1.0 + 0.25 * kept );
        float stiff = 1.0;
        vec2 lean = mix( wd, outw, 0.6 ) * mix( 0.12, 0.42, fract( rc.z * 9.7 ) ) * ( 0.6 + 0.6 * cl.w );
        vec3 base = gcGrassColor( nM, nA, len, wet, marram ? 1.0 : 0.0 );
        float tone = ( flw.a - 0.502 ) * 2.0;
        base *= 1.0 + clamp( tone, -0.5, 0.5 ) * 0.38 * kept;
        base *= mix( vec3( 1.0 ), vec3( 0.8, 0.88, 0.92 ), clamp( -tone - 0.52, 0.0, 1.0 ) );
        base *= ( 0.9 + 0.2 * cl.y ) * ( 0.92 + 0.16 * fract( rb.z * 21.7 ) );
        vec3 tip = gcTipColor( base, nA, len );
        float aoRoot = mix( 0.66, 0.46, smoothstep( 0.2, 0.6, len ) );
        // long grass has a dense low layer under the tall stems (no dark gaps at the base)
        bool lowLayer = len > 0.45 && fract( rb.x * 7.31 + rc.y * 0.7 ) < 0.38;
        if ( lowLayer ) {
          L *= mix( 0.28, 0.45, fract( rc.z * 3.7 ) );
          W *= 1.25;
          base = mix( base, gcLawnLush, 0.35 ) * 1.05;
          aoRoot = 0.62;
        }
        // seed heads on long grass
        bool seed = len > 0.48 && !lowLayer && fract( rc.x * 17.9 ) < 0.13;
        if ( seed ) {
          float sk = fract( rc.y * 5.1 );
          tip = sk < 0.45 ? mix( tip, gcStraw, 0.55 ) : ( sk < 0.8 ? tip * vec3( 1.05, 1.0, 0.85 ) : mix( tip, vec3( 0.2, 0.12, 0.13 ), 0.55 ) );
        }
        if ( reed ) {
          L = mix( 0.95, 1.9, rc.y ) * ( 0.75 + 0.25 * wet );
          W = mix( 0.012, 0.02, fract( rc.z * 5.3 ) );
          stiff = 0.45;
          lean = mix( wd, outw, 0.5 ) * mix( 0.03, 0.14, fract( rc.z * 9.7 ) );
          base = gcReed * ( 0.85 + 0.25 * cl.y );
          tip = mix( base * 1.15, gcStraw, 0.3 * nA.b );
          aoRoot = 0.45;
        } else if ( weedH > 0.5 ) {
          // pavement weed: broad leaves splayed from a joint (rosette), fresh green
          L = mix( 0.08, 0.24, rc.y );
          W = mix( 0.016, 0.03, fract( rc.z * 5.3 ) );
          lean = outw * mix( 0.3, 0.65, fract( rc.z * 9.7 ) );
          base = vec3( 0.17, 0.32, 0.06 ) * ( 0.8 + 0.4 * cl.y );
          tip = base * vec3( 1.25, 1.2, 1.0 );
          aoRoot = 0.55;
        } else if ( marram ) {
          L = mix( 0.4, 0.82, rc.y );
          W = mix( 0.005, 0.008, fract( rc.z * 5.3 ) );
          stiff = 0.7;
          lean = outw * mix( 0.25, 0.6, fract( rc.z * 9.7 ) );
          base = gcMarram * ( 0.85 + 0.25 * cl.y );
          tip = mix( base * 1.12, gcStraw, 0.55 );
          aoRoot = 0.55;
        }
        // flowers
        int fk = -1;
        float flowerP = flw.r * uKind.x;
        if ( !reed && !marram && rb.z < 1.0 ) {
          // flowers grow in clusters: a third of the clumps carry most of them, one species per clump
          // (the patch's dominant species, a third of the clumps another one)
          float clusterK = cl.z > 0.64 ? 3.0 : 0.25;
          if ( fract( ra.z * 31.7 + rc.x * 3.1 ) < flowerP * clusterK ) {
            fk = fract( cl.y * 7.77 + cl.x * 3.1 ) < 0.34 ? int( fract( cl.y * 9.31 + cl.z * 5.3 ) * 5.99 ) : int( flw.g * 6.0 );
          }
          else if ( weedH > 0.5 && fract( ra.z * 47.3 + rb.x * 2.3 ) < 0.07 && uKind.w < 0.5 ) fk = 6;
          else if ( len < 0.3 && fract( ra.z * 47.3 + rb.x * 2.3 ) < flw.b * uKind.y ) {
            float q = fract( rc.y * 11.3 );
            fk = q < 0.38 ? 6 : ( q < 0.8 ? 7 : 8 );
          }
        }
        bool cattail = reed && fract( rc.x * 23.1 ) < 0.07;
        // wind: local wind (gust fronts) + per-blade flutter, length-preserving bend
        vec2 wv = thWindAt( root );
        float wl = length( wv );
        float ph = rb.x * 6.2831853;
        float osc = sin( uTime * ( 2.6 + 1.9 * rc.y ) + ph + dot( root, vec2( 0.9, 0.7 ) ) );
        vec2 wdir = wl > 1e-4 ? wv / wl : vec2( 1.0, 0.0 );
        float flexK = fk >= 0 ? 0.3 : 0.4;
        vec2 B = lean + wv * flexK * stiff + ( wdir * 0.6 + vec2( -wdir.y, wdir.x ) * 0.8 ) * osc * 0.07 * ( 0.3 + wl ) * stiff;
        float bl = length( B );
        if ( bl > 0.92 ) B *= 0.92 / bl;
        float lift = sqrt( max( 0.0, 1.0 - dot( B, B ) ) );
        // level → height fraction, width profile (flowers and cattails shape the top)
        float hf = lv;
        float wp = 1.0 - pow( lv, 1.6 );
        float headW = 0.0;
        vec3 headC = vec3( 0.0 );
        vec3 eyeC = vec3( 0.0 );
        if ( fk >= 0 ) {
          // stem + head; the head faces the camera
          float hsz = ( fk == 4 ? mix( 0.07, 0.1, rc.y ) : ( fk == 0 ? mix( 0.06, 0.085, rc.y ) : ( fk == 2 ? mix( 0.042, 0.056, rc.y ) : ( fk == 3 ? mix( 0.026, 0.036, rc.y ) : ( fk >= 6 ? mix( 0.016, 0.026, rc.y ) : mix( 0.036, 0.05, rc.y ) ) ) ) ) ) * ( fk < 6 ? 1.35 : 1.15 );
          // stems stand a little above the grass, a few well above it
          if ( fk < 6 ) L = max( L * 1.12, ( fk == 4 ? 0.6 : 0.42 ) + 0.32 * rc.y ) * ( len > 0.5 ? 1.0 : 0.6 ) * ( fract( rc.x * 13.3 ) < 0.2 ? 1.3 : 1.0 );
          else L = mix( 0.06, 0.12, rc.y );
          float ringBoost = uKind.w > 0.5 ? ( uKind.w > 1.5 ? 1.7 : 1.35 ) : 1.0;
          headW = max( hsz * ringBoost, pxw * 1.8 );
          W = max( 0.0035, pxw * 0.6 );
          wd = perp;
          headC = gcFl[ fk ];
          eyeC = fk == 0 ? vec3( 0.03, 0.02, 0.02 ) : ( fk == 2 || fk == 7 ? vec3( 0.75, 0.52, 0.05 ) : headC * 0.75 );
          float cup = fk == 0 || fk == 3 || fk == 6 ? 1.0 : 0.0;
          float flat_ = fk == 4 ? 1.0 : 0.0;
          float hh = headW * mix( 0.85, 0.32, flat_ ) / max( L, 0.02 );   // head height as a fraction of L
          if ( uKind.w < 0.5 ) {
            // ring A: levels 0, 1/3, 2/3, tip → stem base, stem top, head rim, head top
            if ( lv > 0.2 && lv < 0.5 ) { hf = 1.0 - hh * mix( 0.9, 1.0, cup ); wp = 1.0; }
            else if ( lv >= 0.5 && lv < 0.9 ) { hf = 1.0 - hh * mix( 0.45, 0.12, cup ); wp = 0.0; }
            else if ( lv >= 0.9 ) { hf = 1.0; wp = 0.0; }
          } else if ( uKind.w < 1.5 ) {
            // ring B: the head alone, a camera-facing diamond at the stem top (the stem is sub-pixel)
            if ( lv < 0.2 ) { hf = 1.0 - hh; wp = 0.0; }
            else if ( lv < 0.9 ) { hf = 1.0 - hh * 0.5; wp = 0.0; }
          } else {
            // ring C: a fleck — triangle from the head's base to its top
            if ( lv < 0.2 ) { hf = 1.0 - hh; wp = 0.0; }
          }
        } else if ( cattail ) {
          headW = 0.026;
          headC = vec3( 0.16, 0.08, 0.03 );
          eyeC = headC;
          if ( uKind.w < 0.5 ) {
            if ( lv > 0.2 && lv < 0.5 ) { hf = 0.7; wp = 0.45; }
            else if ( lv >= 0.5 && lv < 0.9 ) { hf = 0.9; wp = 0.0; }
          }
        }
        W *= uBlade.y;
        W = max( W, pxw * 0.75 );
        // edge-on blades turn a little toward the camera (no vanishing hairlines)
        float edgeOn = abs( dot( wd, toCam ) );
        wd = normalize( mix( wd, perp * ( dot( wd, perp ) < 0.0 ? -1.0 : 1.0 ), edgeOn * 0.55 ) );
        L *= fade;
        float wNow = W * wp;
        if ( headW > 0.0 ) {
          bool isHead = uKind.w < 0.5 ? ( lv >= 0.5 && lv < 0.9 ) : ( uKind.w < 1.5 ? ( lv > 0.2 && lv < 0.9 ) : lv < 0.2 );
          if ( isHead ) wNow = headW * fade;
        }
        vec2 hoff = B * ( L * hf * hf );
        gcPos = vec3( root.x + hoff.x, y0 + hf * L * lift, root.y + hoff.y );
        gcPos.xz += wd * side * wNow * 0.5;
        // normal: across the (bent) blade, toward the camera, rounded at the edges, then toward up
        vec3 T = normalize( vec3( B.x * 2.0 * hf * L, max( 1e-3, L * lift ), B.y * 2.0 * hf * L ) );
        vec3 wd3 = vec3( wd.x, 0.0, wd.y );
        vec3 N = normalize( cross( wd3, T ) );
        if ( dot( N.xz, toCam ) < 0.0 ) N = -N;
        N = normalize( N + wd3 * side * 0.6 );
        float upK = 0.42 + 0.4 * smoothstep( 3.0, 22.0, dist ) + 0.1 * kept;
        objectNormal = normalize( mix( N, nUp, clamp( upK, 0.0, 0.92 ) ) );
        // colour: shaded roots → mid → tip; gusts press the blades and show the paler side
        float ao = mix( aoRoot, 1.0, smoothstep( 0.0, 0.55, hf ) );
        vec3 col = mix( base, tip, smoothstep( 0.35, 1.0, hf ) ) * ao;
        float press = smoothstep( 0.25, 0.7, wl * flexK * stiff ) * smoothstep( 0.3, 1.0, hf );
        col = mix( col, col * vec3( 1.12, 1.14, 1.05 ) + vec3( 0.015 ), press * 0.6 );
        if ( headW > 0.0 ) {
          float hm = uKind.w < 0.5 ? ( lv >= 0.5 ? 1.0 : ( lv > 0.2 ? 0.0 : -1.0 ) ) : ( fk >= 0 ? 1.0 : ( lv > 0.2 ? 1.0 : -1.0 ) );
          if ( hm > 0.5 ) col = headC * ( 0.85 + 0.25 * fract( rc.y * 9.1 ) );
          else if ( hm > -0.5 ) col = mix( eyeC, base * 0.8, fk == 0 ? 0.0 : 0.55 );
          else col = mix( base * aoRoot, base * 0.9, smoothstep( 0.0, 0.5, lv ) );
        }
        vGcCol = col;
        vGcTrans = smoothstep( 0.25, 0.85, hf ) * ( headW > 0.0 ? 1.0 : 0.85 );
        // waxy upper blades catch a soft sheen of the sun
        vGcRough = headW > 0.0 ? 0.8 : mix( mix( 0.72, 0.5, smoothstep( 0.4, 1.0, hf ) ), 0.8, kept );
      }
    }
  }
  vGcW = gcPos;
  vGcN = objectNormal;
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vGcCol;
varying vec3 vGcW;
varying vec3 vGcN;
varying float vGcTrans;
varying float vGcRough;
uniform float uGcTrans;
${LAMP_GLSL}
`;

/** translucent blades: sun shining through from behind (uses the SHADOWED light colour) */
const RE_GRASS = /* glsl */ `
void RE_Direct_Grass( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float back = saturate( - dot( geometryViewDir, directLight.direction ) );
  // forward-scattered sun through thin blades: a broad glow when looking toward a low sun, plus
  // diffuse transmission whenever the sun lights the far side of the blade
  float lobe = pow( back, 3.0 ) * 1.4 + pow( back, 12.0 ) * 1.6;
  float tr = ( lobe + 0.35 * saturate( - dot( geometryNormal, directLight.direction ) ) ) * vGcTrans * uGcTrans;
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * vec3( 1.1, 1.12, 0.72 ) * tr * RECIPROCAL_PI * 2.4;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Grass
`;

// ─────────────────────────────────────────────────────────────── geometry ──

function bladeGeometry(spec: RingSpec): THREE.InstancedBufferGeometry {
  const L = spec.levels;
  const vpb = L * 2 + 1;
  const n = spec.blades;
  const pos = new Float32Array(n * vpb * 3);
  const tpb = (L - 1) * 2 + 1;
  const idx = new Uint16Array(n * tpb * 3);
  let p = 0,
    q = 0;
  for (let b = 0; b < n; b++) {
    const v0 = b * vpb;
    for (let l = 0; l < L; l++) {
      const t = l / L;
      pos.set([-1, t, b, 1, t, b], p);
      p += 6;
    }
    pos.set([0, 1, b], p);
    p += 3;
    for (let l = 0; l < L - 1; l++) {
      const a = v0 + l * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], q);
      q += 6;
    }
    const top = v0 + (L - 1) * 2;
    idx.set([top, top + 1, v0 + L * 2], q);
    q += 3;
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e5, -1e5, -1e5), new THREE.Vector3(1e5, 1e5, 1e5));
  return geo;
}

// ─────────────────────────────────────────────────────────────── rings ──

interface Ring {
  spec: RingSpec;
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  inst: THREE.InstancedBufferAttribute;
  grid: TileGrid;
  /** candidate tile offsets (di, dj) sorted near→far */
  offsets: Int16Array;
  maxTiles: number;
  uniforms: { uFade: { value: THREE.Vector4 }; uBlade: { value: THREE.Vector4 }; uKind: { value: THREE.Vector4 } };
  count: number;
  trisPerBlade: number;
}

export interface Field {
  group: THREE.Group;
  /** select tiles for this camera (call once per frame with the final camera) */
  update(camera: THREE.PerspectiveCamera, drawHeightPx: number): void;
  setDensity(k: number): void;
  density(): number;
  setQuality(level: QualityLevel): void;
  /** the landscape band's maps became available (built incrementally after boot) */
  setOuter(outer: OuterMaps): void;
  stats(): { tiles: string; blades: number; verts: number };
  dispose(): void;
}

export function createField(ctx: CityContext, maps: CoverMaps, outer: OuterMaps | null, level: QualityLevel, opts: { rings?: string; flowers?: boolean; litter?: boolean }): Field {
  const group = new THREE.Group();
  group.name = 'groundcover-field';
  const pal = gcPalette();
  const flowerCols = ['#c42a1c', '#3c62d4', '#f0ede2', '#ebbf18', '#e9e5d3', '#93549a', '#efb417', '#f2f0e8', '#e6d0dd', '#ffffff'].map((h) => new THREE.Color(h));
  const shared = {
    tCover: { value: maps.texCover },
    tFlower: { value: maps.texFlower },
    tGH: { value: maps.texHeight },
    tNoise: { value: noiseTexture() },
    uCovXf: { value: new THREE.Vector4(SLAB.x0, SLAB.z0, 1 / CRES, 1 / FRES) },
    uCovDim: { value: new THREE.Vector4(CW, CH, FW, FH) },
    tCoverO: { value: (outer?.texCover ?? maps.texCover) as THREE.Texture },
    tFlowerO: { value: (outer?.texFlower ?? maps.texFlower) as THREE.Texture },
    tGHO: { value: (outer?.texHeight ?? maps.texHeight) as THREE.Texture },
    uOutXf: { value: outer ? new THREE.Vector4(outer.x0, outer.z0, 1 / outer.res, 1 / outer.fres) : new THREE.Vector4(0, 0, 1, 1) },
    /** w, h (cover texels), on (z > 0.5) */
    uOutDim: { value: new THREE.Vector4(outer?.w ?? 1, outer?.h ?? 1, outer ? 1 : 0, 0) },
    uTime: ctx.uniforms.uTime,
    uWind: ctx.uniforms.uWind,
    uGcTrans: { value: 1 },
    gcFl: { value: flowerCols },
    ...pal,
    ...lampUniforms(),
  };
  let densityK = 1;
  let rings: Ring[] = [];
  const ringFilter = opts.rings ? new Set(opts.rings.toUpperCase().split(',')) : null;

  const build = (lvl: QualityLevel) => {
    for (const r of rings) {
      group.remove(r.mesh);
      r.geo.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    rings = [];
    for (const spec of ringSpecs(lvl)) {
      if (ringFilter && !ringFilter.has('ABC'[spec.index])) continue;
      if (opts.flowers === false) {
        spec.flowers = 0;
        spec.lawnFlowers = 0;
      }
      if (opts.litter === false) spec.litter = 0;
      const geo = bladeGeometry(spec);
      const radius = spec.out1 + spec.tile;
      const span = Math.ceil(radius / spec.tile) + 1;
      const offs: [number, number, number][] = [];
      for (let dj = -span; dj <= span; dj++)
        for (let di = -span; di <= span; di++) {
          const d = Math.max(0, Math.hypot(di, dj) - 1.5) * spec.tile;
          if (d <= radius) offs.push([di, dj, Math.hypot(di, dj)]);
        }
      offs.sort((a, b) => a[2] - b[2]);
      const offsets = new Int16Array(offs.length * 2);
      offs.forEach((o, i) => {
        offsets[i * 2] = o[0];
        offsets[i * 2 + 1] = o[1];
      });
      const maxTiles = offs.length;
      const inst = new THREE.InstancedBufferAttribute(new Float32Array(maxTiles * 4), 4);
      inst.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iTile', inst);
      geo.instanceCount = 0;
      const u = {
        uFade: { value: new THREE.Vector4(spec.in0, spec.in1, spec.out0, spec.out1) },
        uBlade: { value: new THREE.Vector4(spec.blades, spec.width, 1, 0.001) },
        uKind: { value: new THREE.Vector4(spec.flowers, spec.lawnFlowers, spec.litter, spec.index) },
      };
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, shared, u);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + VERT_PARS)
          .replace('#include <beginnormal_vertex>', VERT_MAIN)
          .replace('#include <begin_vertex>', 'vec3 transformed = gcPos;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vGcCol, 1.0 );')
          .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( ( viewMatrix * vec4( vGcN, 0.0 ) ).xyz );\nvec3 nonPerturbedNormal = normal;')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vGcRough;')
          .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + RE_GRASS)
          .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight( vGcW, vec3( 0.0, 1.0, 0.0 ) );');
      };
      mat.customProgramCacheKey = () => `gc-blades-${spec.index}`;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `groundcover-ring-${'ABC'[spec.index]}`;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      group.add(mesh);
      rings.push({ spec, mesh, geo, inst, grid: maps.grids[spec.index], offsets, maxTiles, uniforms: u, count: 0, trisPerBlade: (spec.levels - 1) * 2 + 1 });
    }
    applyDensity();
  };

  const applyDensity = () => {
    for (const r of rings) {
      const n = Math.max(16, Math.round(r.spec.blades * densityK));
      r.geo.setDrawRange(0, n * r.trisPerBlade * 3);
      r.uniforms.uBlade.value.x = n;
      r.uniforms.uBlade.value.y = r.spec.width / Math.sqrt(Math.max(0.2, densityK));
      // radii shrink a little with density (adaptive quality)
      const rk = 0.6 + 0.4 * densityK;
      const f = r.uniforms.uFade.value;
      f.set(r.spec.in0 < 0 ? r.spec.in0 : r.spec.in0 * rk, r.spec.in0 < 0 ? r.spec.in1 : r.spec.in1 * rk, r.spec.out0 * rk, r.spec.out1 * rk);
    }
    // the ground under the rings darkens exactly where blades stand
    const fa = rings.find((r) => r.spec.index === 0)?.uniforms.uFade.value;
    const fb = rings.find((r) => r.spec.index === 1)?.uniforms.uFade.value ?? fa;
    const fl = rings.length ? rings[rings.length - 1].uniforms.uFade.value : null;
    if (fa && fb && fl) setGroundBladeFade(fa.z, fa.w, fb.z, fb.w, fl.z, fl.w);
    else setGroundBladeFade(-10, -9, -10, -9, -10, -9);
  };

  build(level);

  // ── per-frame tile walk (no allocations)
  let win: OuterMaps | null = outer;
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const box = new THREE.Box3();
  const camPos = new THREE.Vector3();
  const update = (camera: THREE.PerspectiveCamera, drawHeightPx: number) => {
    camera.getWorldPosition(camPos);
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    const pxWorld = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(200, drawHeightPx) / Math.max(0.2, camera.zoom);
    for (const r of rings) {
      const g = r.grid;
      const S = g.size;
      const ci = Math.floor((camPos.x - g.x0) / S),
        cj = Math.floor((camPos.z - g.z0) / S);
      const f = r.uniforms.uFade.value;
      const rIn = r.spec.in0 < 0 ? -1 : f.x - 1.3;
      const rOut = f.w + 0.2;
      const arr = r.inst.array as Float32Array;
      let n = 0;
      const offs = r.offsets;
      // the roaming landscape window's grid for this ring (same global 8 m lattice as the slab's)
      const wg = win ? win.grids[r.spec.index] : null;
      const wdi = wg ? Math.round((g.x0 - wg.x0) / S) : 0,
        wdj = wg ? Math.round((g.z0 - wg.z0) / S) : 0;
      for (let k = 0; k < offs.length; k += 2) {
        const ti = ci + offs[k],
          tj = cj + offs[k + 1];
        let fl = 0,
          y0 = 1e9,
          y1 = -1e9;
        if (ti >= 0 && tj >= 0 && ti < g.nx && tj < g.nz) {
          const t = tj * g.nx + ti;
          fl = g.flags[t];
          if (fl) {
            y0 = g.ymin[t];
            y1 = g.ymax[t];
          }
        }
        if (wg) {
          const wi = ti + wdi,
            wj = tj + wdj;
          if (wi >= 0 && wj >= 0 && wi < wg.nx && wj < wg.nz) {
            const t = wj * wg.nx + wi;
            const wf = wg.flags[t];
            if (wf) {
              fl |= wf;
              y0 = Math.min(y0, wg.ymin[t]);
              y1 = Math.max(y1, wg.ymax[t]);
            }
          }
        }
        if (fl === 0) continue;
        y1 += BLADE_UP;
        const x0 = g.x0 + ti * S,
          z0 = g.z0 + tj * S;
        // distance from the camera to the tile box (3D)
        const dx = Math.max(x0 - BLADE_SIDE - camPos.x, 0, camPos.x - (x0 + S + BLADE_SIDE));
        const dz = Math.max(z0 - BLADE_SIDE - camPos.z, 0, camPos.z - (z0 + S + BLADE_SIDE));
        const dy = Math.max(y0 - camPos.y, 0, camPos.y - y1);
        const dmin = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dmin > rOut) continue;
        if (rIn > 0) {
          // farthest corner still inside the inner ring → nothing of this ring there
          const fx = Math.max(Math.abs(x0 - camPos.x), Math.abs(x0 + S - camPos.x)) + BLADE_SIDE;
          const fz = Math.max(Math.abs(z0 - camPos.z), Math.abs(z0 + S - camPos.z)) + BLADE_SIDE;
          const fy = Math.max(Math.abs(y0 - camPos.y), Math.abs(y1 - camPos.y));
          if (Math.sqrt(fx * fx + fy * fy + fz * fz) < rIn) continue;
        }
        // which content this ring draws here
        let lawn = 1;
        if (r.spec.index >= 1) {
          const camH = Math.max(0.5, camPos.y - y0);
          const horiz = Math.max(1, Math.hypot(x0 + S / 2 - camPos.x, z0 + S / 2 - camPos.z));
          lawn = r.spec.index === 1 && camH / horiz < 0.22 ? 1 : 0;
          if (!lawn && !(fl & 2) && !(fl & 4) && !(fl & 8 && r.spec.litter > 0)) continue;
        }
        box.min.set(x0 - BLADE_SIDE, y0 - 0.1, z0 - BLADE_SIDE);
        box.max.set(x0 + S + BLADE_SIDE, y1, z0 + S + BLADE_SIDE);
        if (!frustum.intersectsBox(box)) continue;
        if (n >= r.maxTiles) break;
        arr[n * 4] = x0;
        arr[n * 4 + 1] = z0;
        arr[n * 4 + 2] = S;
        arr[n * 4 + 3] = lawn;
        n++;
      }
      r.count = n;
      r.geo.instanceCount = n;
      r.mesh.visible = n > 0;
      r.uniforms.uBlade.value.w = pxWorld;
      if (n > 0) {
        r.inst.clearUpdateRanges();
        r.inst.addUpdateRange(0, n * 4);
        r.inst.needsUpdate = true;
      }
    }
  };

  return {
    group,
    update,
    setDensity(k: number) {
      densityK = Math.max(0.25, Math.min(1, k));
      applyDensity();
    },
    density: () => densityK,
    setQuality(lvl: QualityLevel) {
      build(lvl);
    },
    setOuter(o: OuterMaps) {
      win = o;
      shared.tCoverO.value = o.texCover;
      shared.tFlowerO.value = o.texFlower;
      shared.tGHO.value = o.texHeight;
      shared.uOutXf.value.set(o.x0, o.z0, 1 / o.res, 1 / o.fres);
      shared.uOutDim.value.set(o.w, o.h, 1, 0);
    },
    stats() {
      let blades = 0,
        verts = 0;
      const tiles: string[] = [];
      for (const r of rings) {
        const nb = Math.round(r.uniforms.uBlade.value.x);
        blades += r.count * nb;
        verts += r.count * nb * (r.spec.levels * 2 + 1);
        tiles.push(`${'ABC'[r.spec.index]}${r.count}`);
      }
      return { tiles: tiles.join(' '), blades, verts };
    },
    dispose() {
      setGroundBladeFade(-10, -9, -10, -9, -10, -9);
      for (const r of rings) {
        r.geo.dispose();
        (r.mesh.material as THREE.Material).dispose();
      }
    },
  };
}
