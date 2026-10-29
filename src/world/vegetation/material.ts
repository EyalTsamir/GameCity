// Foliage materials for the merged vegetation meshes: wind sway + painted-miniature leaf shading.
//
// Every vegetation vertex carries
//   aWind = (anchorX, anchorZ, flex, flutter)            (float)
//     anchor  — world xz of the plant's root (phase + gust field lookup, so a whole tree moves as one)
//     flex    — bendiness at this vertex (0 at the trunk base, ≈1 at the top of a 10 m tree);
//               the displacement grows with flex² so trunks stay planted
//     flutter — leaf shimmer amplitude (along the normal, high frequency)
//   aLeaf = (ao, model+tone, leafiness, clump)           (normalized Uint8)
//     ao        — baked occlusion (depth into the crown / seams / undersides); darkens the ambient
//                 light fully and the sun partly, so sunlit leaves stay vivid and interiors go deep
//     model+tone— y < 0.5: clump cells, y ≥ 0.5: billowed relief (needles, clipped hedges); the rest
//                 (·4) is the clump tone-drift amplitude (1 = default) — see species.ts leafTone()
//     leafiness — 0 bark / hard parts … 1 foliage: drives clump relief, wrap, translucency
//     clump     — leaf-clump size code: size = 0.1 + clump * 1.5 m
// Gust fronts travel downwind across the city (driven by uniforms.uWind / uTime — deterministic).
// The shadow pass uses a depth material with the same displacement so shadows sway too.
//
// Fragment shading (MeshStandardMaterial patched in onBeforeCompile, define TH_FOLIAGE):
//   • clump relief — two octaves of billowed 3D gradient noise on the REST position (the pattern sticks
//     to the leaves while they sway) perturb the normal into leaf-clump domes with creases between
//     them; each octave fades out by its screen footprint (fwidth) before it could sparkle;
//   • creases darken (occlusion), clumps drift in tone (warm/light vs cool/dark families);
//   • soft wrap lighting on foliage; less grazing env sheen (the "plastic" rim);
//   • backlit translucency: leaves seen against a low sun glow at the silhouette (unshadowed by design —
//     the lit side of the crown is what the camera cannot see);
//   • night street light (core/lampLight.ts) on trunks, foliage and canopy undersides.

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';

/** integer-hash 3D gradient noise with analytic derivatives (thHash, thNoised) — shared with foliage.ts */
export const NOISE_GLSL = /* glsl */ `
vec3 thHash( vec3 p ) {
  uvec3 q = uvec3( ivec3( p ) ) * uvec3( 1597334673u, 3812015801u, 2798796415u );
  q = ( q.x ^ q.y ^ q.z ) * uvec3( 1597334673u, 3812015801u, 2798796415u );
  return vec3( q ) * ( 2.0 / 4294967295.0 ) - 1.0;
}
// 3D gradient noise: value in x, analytic derivatives in yzw (after I. Quilez)
vec4 thNoised( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = x - i;
  vec3 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  vec3 du = 30.0 * f * f * ( f * ( f - 2.0 ) + 1.0 );
  vec3 ga = thHash( i );
  vec3 gb = thHash( i + vec3( 1.0, 0.0, 0.0 ) );
  vec3 gc = thHash( i + vec3( 0.0, 1.0, 0.0 ) );
  vec3 gd = thHash( i + vec3( 1.0, 1.0, 0.0 ) );
  vec3 ge = thHash( i + vec3( 0.0, 0.0, 1.0 ) );
  vec3 gf = thHash( i + vec3( 1.0, 0.0, 1.0 ) );
  vec3 gg = thHash( i + vec3( 0.0, 1.0, 1.0 ) );
  vec3 gh = thHash( i + vec3( 1.0, 1.0, 1.0 ) );
  float va = dot( ga, f );
  float vb = dot( gb, f - vec3( 1.0, 0.0, 0.0 ) );
  float vc = dot( gc, f - vec3( 0.0, 1.0, 0.0 ) );
  float vd = dot( gd, f - vec3( 1.0, 1.0, 0.0 ) );
  float ve = dot( ge, f - vec3( 0.0, 0.0, 1.0 ) );
  float vf = dot( gf, f - vec3( 1.0, 0.0, 1.0 ) );
  float vg = dot( gg, f - vec3( 0.0, 1.0, 1.0 ) );
  float vh = dot( gh, f - vec3( 1.0, 1.0, 1.0 ) );
  float k1 = va - vb - vc + vd, k2 = va - vc - ve + vg, k3 = va - vb - ve + vf, k4 = -va + vb + vc - vd + ve - vf - vg + vh;
  return vec4(
    va + u.x * ( vb - va ) + u.y * ( vc - va ) + u.z * ( ve - va ) + u.x * u.y * k1 + u.y * u.z * k2 + u.z * u.x * k3 + k4 * u.x * u.y * u.z,
    ga + u.x * ( gb - ga ) + u.y * ( gc - ga ) + u.z * ( ge - ga ) + u.x * u.y * ( ga - gb - gc + gd ) + u.y * u.z * ( ga - gc - ge + gg ) + u.z * u.x * ( ga - gb - ge + gf ) + ( -ga + gb + gc - gd + ge - gf - gg + gh ) * u.x * u.y * u.z
      + du * ( vec3( vb, vc, ve ) - va + u.yzx * vec3( k1, k2, k3 ) + u.zxy * vec3( k3, k1, k2 ) + u.yzx * u.zxy * k4 ) );
}
`;

const WIND_PARS = /* glsl */ `
attribute vec4 aWind;
uniform float uTime;
uniform vec2 uWind;
`;

const WIND_MAIN = /* glsl */ `
vec3 transformed = vec3( position );
{
  float wl = length( uWind );
  vec2 wd = wl > 1e-4 ? uWind / wl : vec2( 1.0, 0.0 );
  vec2 pd = vec2( -wd.y, wd.x );
  vec2 an = aWind.xy;
  float ph = fract( sin( dot( an, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831;
  // gust fronts sweeping downwind (slightly wavy fronts)
  float g = 0.5 + 0.5 * sin( dot( an, wd ) * 0.05 - uTime * 0.85 + sin( dot( an, pd ) * 0.031 + 1.7 ) * 1.8 );
  g = g * g * ( 3.0 - 2.0 * g );
  float flex = aWind.z;
  float bend = flex * flex * 0.17 * wl;
  float osc = sin( uTime * 1.55 + ph ) * 0.62 + sin( uTime * 2.6 + ph * 1.7 ) * 0.38;
  vec2 d = wd * bend * ( 0.3 + 0.65 * g + 0.4 * osc * ( 0.35 + g ) )
         + pd * bend * 0.24 * sin( uTime * 1.21 + ph * 2.3 );
  transformed.xz += d;
  transformed.y -= dot( d, d ) * 0.12;
  // leaf flutter
  float f = sin( uTime * 7.3 + position.x * 1.9 + position.y * 1.3 + position.z * 2.3 ) * 0.6
          + sin( uTime * 11.7 + position.x * 3.1 - position.z * 2.7 + position.y ) * 0.4;
  transformed += normal * ( f * aWind.w * 0.03 * ( 0.4 + g ) * wl );
}
`;

const LEAF_VERT_PARS = /* glsl */ `
attribute vec4 aLeaf;
varying vec4 vThLeaf;
varying vec3 vThRest;
`;

const LEAF_VERT_MAIN = /* glsl */ `
vThLeaf = aLeaf;
vThRest = position;
`;

const LEAF_FRAG_PARS = /* glsl */ `
varying vec4 vThLeaf;
varying vec3 vThRest;
uniform float uThBump;
uniform float uThTrans;
uniform float uThWrap;
uniform float uThTone;
uniform float uThModel;
uniform float uThScale;
uniform float uThCrease;
uniform float uThFine;
uniform float uThCheap;
uniform float uThFx;
uniform float uThBark;
uniform float uThNight;
uniform float uNight;
float thWrap;
${LAMP_GLSL}
${NOISE_GLSL}
// 3D cellular clumps (3x3x3 search, well-jittered feature points so clumps never look gridded):
// d = p - nearest feature point, edge = F2 - F1, id = per-clump random (-1..1)
void thCell( vec3 p, out vec3 d, out float edge, out float id ) {
  vec3 b = floor( p ) - 1.0;
  float f1 = 1e9, f2 = 1e9;
  d = vec3( 0.0 );
  id = 0.0;
  for ( int k = 0; k < 27; k++ ) {
    vec3 c = b + vec3( float( k % 3 ), float( ( k / 3 ) % 3 ), float( k / 9 ) );
    vec3 h = thHash( c );
    vec3 v = p - ( c + 0.5 + h * 0.45 );
    float dd = dot( v, v );
    if ( dd < f1 ) {
      f2 = f1;
      f1 = dd;
      d = v;
      id = h.y;
    } else if ( dd < f2 ) f2 = dd;
  }
  edge = sqrt( f2 ) - sqrt( f1 );
}
// cheaper 2x2x2 variant (medium / low quality): smaller jitter keeps the short search nearly exact
void thCell8( vec3 p, out vec3 d, out float edge, out float id ) {
  vec3 b = floor( p - 0.5 );
  float f1 = 1e9, f2 = 1e9;
  d = vec3( 0.0 );
  id = 0.0;
  for ( int k = 0; k < 8; k++ ) {
    vec3 c = b + vec3( float( k & 1 ), float( ( k >> 1 ) & 1 ), float( k >> 2 ) );
    vec3 h = thHash( c );
    vec3 v = p - ( c + 0.5 + h * 0.3 );
    float dd = dot( v, v );
    if ( dd < f1 ) {
      f2 = f1;
      f1 = dd;
      d = v;
      id = h.y;
    } else if ( dd < f2 ) f2 = dd;
  }
  edge = sqrt( f2 ) - sqrt( f1 );
}
`;

// after normal_fragment_maps: clump relief, crease occlusion, tone drift
const LEAF_FRAG_NORMAL = /* glsl */ `
float thAmt = vThLeaf.z;
float thAO = vThLeaf.x;
thWrap = uThWrap * thAmt * uThFx;
if ( thAmt > 0.02 && uThFx > 0.5 ) {
  float cs = ( 0.1 + vThLeaf.w * 1.5 ) * uThScale;
  // aLeaf.y packs the relief model (≥ 0.5 → billowed needles/clipped leaves, else clump cells) and the tone amplitude
  float billow = uThModel > 1.5 ? 0.0 : uThModel > 0.5 ? 1.0 : step( 0.5, vThLeaf.y );
  float toneAmp = ( vThLeaf.y - step( 0.5, vThLeaf.y ) * 0.5 ) * 4.0;
  vec3 p = vThRest / cs;
  float foot = length( fwidth( vThRest ) ) / cs;
  float f1 = thAmt * ( 1.0 - smoothstep( 0.12, 0.42, foot ) );
  float f2 = thAmt * ( 1.0 - smoothstep( 0.12, 0.42, foot * 2.37 ) );
  vec3 g = vec3( 0.0 );
  if ( f1 > 0.001 ) {
    float t;
    if ( billow > 0.5 ) {
      // billowed gradient noise (meandering creases)
      vec4 n1 = thNoised( p );
      // soft sign: crease width follows the pixel footprint (no stair-stepping)
      float e1 = max( 0.02, foot * 0.9 );
      float s1 = n1.x / sqrt( n1.x * n1.x + e1 * e1 );
      g += s1 * n1.yzw * f1;
      thAO *= mix( 1.0, smoothstep( 0.0, 0.2, abs( n1.x ) ), f1 * uThCrease );
      t = s1 * smoothstep( 0.02, 0.22, abs( n1.x ) ) * f1 * uThTone * toneAmp;
    } else {
      // leaf clumps: every cell is a little dome (normal tilts away from its centre), creases between
      vec3 cd;
      float edge, cid;
      if ( uThCheap > 0.5 ) thCell8( p, cd, edge, cid );
      else thCell( p, cd, edge, cid );
      g -= cd * ( 1.6 * f1 ); // height = -|d|² → the normal tilts outward from the clump centre
      thAO *= mix( 1.0, smoothstep( 0.0, 0.28 + foot * 0.6, edge ), f1 * uThCrease );
      t = cid * f1 * uThTone * toneAmp;
    }
    // clump tone families: warm/light vs cool/dark
    diffuseColor.rgb *= vec3( 1.0 ) + vec3( 0.11, 0.07, -0.05 ) * t;
    if ( f2 > 0.001 ) {
      vec4 n2 = thNoised( p * 2.37 + vec3( 17.3, 5.1, 9.7 ) );
      float e2 = max( 0.02, foot * 2.1 );
      float s2 = n2.x / sqrt( n2.x * n2.x + e2 * e2 );
      g += s2 * n2.yzw * ( uThFine * f2 );
      thAO *= mix( 1.0, smoothstep( 0.0, 0.18, abs( n2.x ) ), f2 * uThFine * 0.3 );
    }
    vec3 gv = mat3( viewMatrix ) * g;
    gv -= dot( gv, normal ) * normal;
    normal = normalize( normal - gv * uThBump );
  }
} else if ( vThLeaf.w > 0.01 && uThFx > 0.5 ) {
  // bark painted in-shader (faded to its mean by the pixel footprint): birch dashes / furrows
  float foot = length( fwidth( vThRest ) );
  if ( vThLeaf.w > 0.5 ) {
    float fade = 1.0 - smoothstep( 0.035, 0.11, foot );
    float n = thNoised( vThRest * vec3( 3.2, 10.0, 3.2 ) ).x;
    float m = mix( 0.13, smoothstep( 0.12, 0.22, n ), fade );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.045, 0.04 ), m * 0.9 );
  } else {
    float fade = 1.0 - smoothstep( 0.025, 0.09, foot );
    vec4 nb = thNoised( vThRest * vec3( 9.0, 1.4, 9.0 ) );
    float n = nb.x;
    diffuseColor.rgb *= 1.0 - 0.32 * mix( 0.45, smoothstep( -0.08, 0.22, n ), fade );
    if ( uThBark > 0.5 && fade > 0.01 ) {
      // judge 3 #10: furrowed bark in relief (ridges tilt the normal, grey-lit plates between dark furrows),
      // near only — the furrow tone above keeps its mean further out
      float pl = thNoised( vThRest * vec3( 26.0, 5.0, 26.0 ) + vec3( 3.1, 0.0, 7.7 ) ).x;
      diffuseColor.rgb *= 1.0 + fade * ( 0.12 * smoothstep( 0.0, 0.5, n ) * ( 0.6 + 0.4 * pl ) - 0.18 * smoothstep( 0.05, -0.3, n ) );
      vec3 g = nb.yzw * vec3( 9.0, 1.4, 9.0 ) * ( 0.045 * fade );
      vec3 gv = mat3( viewMatrix ) * g;
      gv -= dot( gv, normal ) * normal;
      normal = normalize( normal - gv );
    }
  }
}
`;

const LEAF_FRAG_TRANS = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
if ( thAmt > 0.02 && uThTrans > 0.0 && uThFx > 0.5 ) {
  vec3 tL = directionalLights[ 0 ].direction;
  float back = saturate( dot( -geometryViewDir, tL ) );
  back *= back;
  float rim = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
  float away = saturate( 0.5 - 0.5 * dot( geometryNormal, tL ) );
  float k = uThTrans * thAmt * back * ( 0.22 + 0.78 * rim * rim ) * ( 0.3 + 0.7 * away ) * ( 0.35 + 0.65 * thAO );
  // light through leaves is filtered by them twice: deeper, yellower green
  vec3 tc = material.diffuseColor * ( 0.35 + 1.3 * material.diffuseColor ) * vec3( 1.04, 1.0, 0.66 );
  reflectedLight.directDiffuse += tc * directionalLights[ 0 ].color * k;
}
#endif
`;

const LEAF_FRAG_AO = /* glsl */ `
vec3 thWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
// night: crown occlusion relaxes so canopies keep reading as masses under the (deliberately dark) night key
float thAOn = mix( thAO, 1.0 - ( 1.0 - thAO ) * 0.35, uNight );
if ( uThFx > 0.5 ) {
  reflectedLight.indirectDiffuse *= thAOn;
  reflectedLight.directDiffuse *= mix( 1.0, thAOn, 0.35 );
  reflectedLight.indirectSpecular *= mix( thAOn, 0.3 * thAOn, thAmt );
  reflectedLight.directSpecular *= mix( 1.0, 0.55, thAmt );
  if ( uNight > 0.01 && thAmt > 0.02 ) {
    // night readability: foliage albedo is ~3x darker than lawn, so under the same faint sky/moon light
    // the forest went black. Lift the sky fill on foliage and the moonlight on crown tops (multiplies the
    // night key, so it follows whatever the stage palette does): massed silhouettes with moonlit tops.
    float top = smoothstep( -0.2, 0.85, thWN.y );
    float lift = uNight * uThNight * min( 1.0, thAmt * 1.25 );
    reflectedLight.indirectDiffuse *= 1.0 + lift * ( 0.55 + 0.45 * top );
    reflectedLight.directDiffuse *= 1.0 + lift * 1.2 * top;
  }
}
if ( uLampGain > 0.001 ) {
  vec3 lamp = thLampLight( vThRest, thWN );
  // canopy undersides catch the lamp below them
  float under = saturate( -thWN.y );
  if ( under > 0.01 ) lamp += thLampLight( vThRest - vec3( 0.0, 2.5, 0.0 ), vec3( 0.0, 1.0, 0.0 ) ) * ( under * 0.7 );
  reflectedLight.indirectDiffuse += material.diffuseColor * lamp * ( 0.45 + 0.55 * thAO );
}
`;

export interface FoliageKnobs {
  bump: { value: number };
  trans: { value: number };
  wrap: { value: number };
  tone: { value: number };
  /** relief model: 0 per vertex (cells for broadleaf, billow for needles/hedges), 1 all billow, 2 all cells */
  model: { value: number };
  /** clump size multiplier */
  scale: { value: number };
  /** crease occlusion strength 0..1 */
  crease: { value: number };
  /** fine (2nd octave) relief amplitude */
  fine: { value: number };
  /** 1 = cheaper 2x2x2 clump search (medium / low quality) */
  cheap: { value: number };
  /** 0 = plain shading (runtime A/B of the whole foliage shading, for cost measurement) */
  fx: { value: number };
  /** night readability lift of sky fill / moonlight on foliage (× uNight) */
  night: { value: number };
  /** bark furrow relief on trunks (?nobarkrelief, quality low: off) */
  bark: { value: number };
}

/** shared tuning uniforms (one object drives every foliage material) */
export const foliageKnobs: FoliageKnobs = {
  bump: { value: 0.5 },
  trans: { value: 0.6 },
  wrap: { value: 0.45 },
  tone: { value: 1.0 },
  model: { value: 0 },
  scale: { value: 1.5 },
  crease: { value: 0.2 },
  fine: { value: 0.35 },
  cheap: { value: 0 },
  fx: { value: 1 },
  night: { value: 2.0 },
  bark: { value: 1 },
};

let physPars: string | null = null;
/**
 * three's physical lighting functions with a wrapped N·L for the DIFFUSE part of direct light only
 * (thWrap = 0 → unchanged). The specular keeps the true N·L: GGX visibility explodes for back-lit grazing
 * normals, so wrapped irradiance there turns into fireflies.
 */
export function wrappedPhysicalPars(): string {
  if (physPars) return physPars;
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const irr = 'vec3 irradiance = dotNL * directLight.color;';
  const dif = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  const a = src.indexOf(irr),
    b = src.indexOf(dif);
  if (a < 0 || b < a) physPars = src;
  else
    physPars =
      src.slice(0, a + irr.length) +
      '\n\tvec3 thIrrW = saturate( ( dot( geometryNormal, directLight.direction ) + thWrap ) / ( 1.0 + thWrap ) ) * directLight.color;' +
      src.slice(a + irr.length, b) +
      'reflectedLight.directDiffuse += thIrrW * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );' +
      src.slice(b + dif.length);
  return physPars;
}

function injectWind(shader: THREE.WebGLProgramParametersWithUniforms, u: GlobalUniforms, pars = '', main = ''): void {
  shader.uniforms.uTime = u.uTime;
  shader.uniforms.uWind = u.uWind;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${WIND_PARS}${pars}`).replace('#include <begin_vertex>', WIND_MAIN + main);
}

function injectFoliage(shader: THREE.WebGLProgramParametersWithUniforms, u: GlobalUniforms): void {
  injectWind(shader, u, LEAF_VERT_PARS, LEAF_VERT_MAIN);
  Object.assign(shader.uniforms, lampUniforms(), { uThBump: foliageKnobs.bump, uThTrans: foliageKnobs.trans, uThWrap: foliageKnobs.wrap, uThTone: foliageKnobs.tone, uThModel: foliageKnobs.model, uThScale: foliageKnobs.scale, uThCrease: foliageKnobs.crease, uThFine: foliageKnobs.fine, uThCheap: foliageKnobs.cheap, uThFx: foliageKnobs.fx, uThNight: foliageKnobs.night, uThBark: foliageKnobs.bark, uNight: u.uNight });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${LEAF_FRAG_PARS}`)
    .replace('#include <lights_physical_pars_fragment>', wrappedPhysicalPars())
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${LEAF_FRAG_NORMAL}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${LEAF_FRAG_TRANS}`)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${LEAF_FRAG_AO}`);
}

export interface WindMaterials {
  mat: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
}

/**
 * Vertex-coloured, matte foliage material with wind sway (+ matching shadow depth material).
 * kind 'standard' gets the foliage shading (needs the aLeaf attribute) unless `fx` is false;
 * 'lambert' / 'basic' are cost-measurement variants (wind only).
 */
export function windMaterials(u: GlobalUniforms, name: string, roughness = 0.9, kind = 'standard', fx = true): WindMaterials {
  const foliage = kind === 'standard' && fx;
  const mat =
    kind === 'basic'
      ? (new THREE.MeshBasicMaterial({ vertexColors: true }) as unknown as THREE.MeshStandardMaterial)
      : kind === 'lambert'
        ? (new THREE.MeshLambertMaterial({ vertexColors: true }) as unknown as THREE.MeshStandardMaterial)
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
  mat.name = name;
  mat.onBeforeCompile = (shader) => (foliage ? injectFoliage(shader, u) : injectWind(shader, u));
  mat.customProgramCacheKey = () => `veg-wind-2-${kind}-${foliage ? 'leaf' : 'plain'}`;
  const depth = new THREE.MeshDepthMaterial();
  depth.name = `${name}-depth`;
  depth.onBeforeCompile = (shader) => injectWind(shader, u);
  depth.customProgramCacheKey = () => 'veg-wind-depth-2';
  return { mat, depth };
}
