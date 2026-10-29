// One shared MeshStandardMaterial for every vehicle model (keeps fog, shadows,
// tone mapping) with shader injections for:
//   * instance body colour only on painted parts (aMeta.x)
//   * per-instance wheel spin + front-wheel steering (aWheel, aInst.zw)
//   * variant parts (taxi sign, police bar, cargo) collapsed when not used (aPart vs aInst2.x)
//   * decal atlas row per variant (bus route sign, van logos)
//   * emissive lights: head/tail/brake/blinkers/police bar/signs/cabin glow
//   * per-part finishes (aMeta.w = roughness + 4 × class): 1 clear-coated paint (a sharp, Fresnel-weighted
//     sky reflection over the base colour — MeshPhysical clearcoat, so it costs one more specular lobe and
//     no extra pass), 2 glass (the same coat over a near-mirror dark base), 3 chrome (metallic)
// Per-instance attributes (InstancedBufferAttribute on each model geometry):
//   aInst  = (brake 0..1, blinker 0 none|1 left|2 right|3 hazard, wheel angle, steer angle)
//   aInst2 = (variant, siren 0|1, phase 0..1, lights-on factor 0..1)
// Close-up detail ("real things" round, W2), per part through aDetA / aDetB / aDetC (class) and uVehDetail
// (x interior, y panel lines, z wear, w paint layers; 0 = off, set per quality tier and ?nocarinterior / ?nopanelgaps /
// ?novehiclewear / ?nocarpaint):
//   class 1 lofted car paint: panel gaps (door cuts, bonnet, boot) + shoulder crease, drawn in object space
//            A = (door cut z ×3, cowl z), B = (boot z, sill y, fender seam |x|, belt y)
//   class 2 car glass, 4 bus glass, 5 van cab glass: interior mapping (ray-traced seats, dash, headrests,
//            a driver when the vehicle is moving) A = (half width, belt y, roof y, dash z), B = (rear z, front
//            seat-back z, rear seat-back z, -)
//   class 3 tyre: the contact patch flattens (A.x = flattened radius)
//   all exterior parts: per-vehicle road grime on the lower body, a dent / faded paint / a mismatched door

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { patchLampMaterial } from '../../world/lamps/integrate';
import { PLATE_CELLS } from './models';

const VERT_PARS = /* glsl */ `
attribute vec4 aMeta;
attribute vec4 aWheel;
attribute float aPart;
attribute vec4 aInst;
attribute vec4 aInst2;
attribute vec4 aDetA;
attribute vec4 aDetB;
uniform float uTime;
uniform float uLights;
varying vec4 vObj;
varying vec4 vObjN;
varying vec4 vCamObj;
varying vec3 vUpV;
varying vec3 vFwdV;
varying vec4 vDetA;
varying vec4 vDetB;
varying vec4 vEmit;
varying float vRough;
varying float vCoat;
varying float vMetal;
varying float vGain;
// 1 = real occupants sit in this cabin (pedestrians/occupants.ts, aInst2.w = 2): the shader draws none of its own
// and the glass writes the depth of the cabin surface behind it, so the figures inside show through
varying float vSeated;
// variant parts: n = only for variant n - 1; 16 + bits = for the variants whose bit is set
bool thHidden(float part, float variant, float phase) {
  part -= 100.0 * floor( part * 0.01 + 0.001 );
  if (part < 0.5) return false;
  // 90: an accessory a few vehicles carry (roof box), picked by the phase
  if (part > 89.5) return fract( phase * 7.31 ) < 0.8;
  if (part > 15.5) return mod(floor((part - 16.0) / exp2(floor(variant + 0.5))), 2.0) < 0.5;
  return abs(part - variant - 1.0) > 0.25;
}
vec3 thWheel(vec3 p) {
  // wheels spin by the wheel angle, a bicycle crank (w = 3) by the pedalling angle (aInst2.y)
  float wa = aWheel.w > 2.5 ? aInst2.y : aInst.z;
  float c = cos(wa), s = sin(wa);
  p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  if (aWheel.w > 1.5 && aWheel.w < 2.5) {
    float cs = cos(aInst.w), ss = sin(aInst.w);
    p = vec3(p.x * cs + p.z * ss, p.y, -p.x * ss + p.z * cs);
  }
  return p;
}
`;

const VERT_COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
  vColor *= color;
#elif defined( USE_COLOR )
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, aMeta.x );
#endif
`;

const VERT_BEGIN = /* glsl */ `
float aDetC = floor( aPart * 0.01 + 0.001 );
if ( aWheel.w > 0.5 ) transformed = aWheel.xyz + thWheel( transformed - aWheel.xyz );
// tyre contact patch: the rubber flattens where it meets the road (after the spin, so it stays at the bottom)
if ( aDetC > 2.5 && aDetC < 3.5 ) transformed.y = max( transformed.y, aWheel.y - aDetA.x );
if ( thHidden( aPart, aInst2.x, aInst2.z ) ) transformed = vec3( 0.0 );
vObj = vec4( transformed, aDetC );
vObjN = vec4( objectNormal, aInst2.z );
vDetA = aDetA;
vDetB = aDetB;
{
  mat4 thM = modelMatrix;
#ifdef USE_INSTANCING
  thM = thM * instanceMatrix;
#endif
  vCamObj = vec4( transpose( mat3( thM ) ) * ( cameraPosition - thM[3].xyz ), min( aInst2.w, 1.0 ) );
  vSeated = step( 1.5, aInst2.w );
  vUpV = normalize( ( viewMatrix * vec4( thM[1].xyz, 0.0 ) ).xyz );
  vFwdV = normalize( ( viewMatrix * vec4( thM[2].xyz, 0.0 ) ).xyz );
}
{
  int lt = int( aMeta.y + 0.5 );
  float lon = uLights * min( aInst2.w, 1.0 );
  float bOn = step( fract( uTime * 1.45 + aInst2.z ), 0.5 );
  int bl = int( aInst.y + 0.5 );
  vec3 e = vec3( 0.0 );
  float useD = 1.0;
  if ( lt == 1 ) e = vec3( 0.35 + 3.6 * lon );
  else if ( lt == 2 ) e = vec3( 0.18 + 1.6 * lon + 3.2 * aInst.x );
  else if ( lt == 3 ) e = vec3( ( bl == 1 || bl == 3 ) ? bOn * 4.5 : 0.0 );
  else if ( lt == 4 ) e = vec3( ( bl == 2 || bl == 3 ) ? bOn * 4.5 : 0.0 );
  else if ( lt == 5 || lt == 6 ) {
    float f = fract( uTime * 2.2 + aInst2.z + ( lt == 6 ? 0.5 : 0.0 ) );
    float fl = step( f, 0.16 ) + step( 0.26, f ) * step( f, 0.4 );
    e = vec3( aInst2.y * ( 0.25 + fl * 7.0 ) );
  }
  else if ( lt == 7 ) e = vec3( 0.25 + 2.2 * uLights );
  else if ( lt == 8 ) e = vec3( 0.3 + 2.0 * uLights );
  else if ( lt == 9 ) { e = vec3( 1.0, 0.8, 0.55 ) * ( 0.9 * uLights * min( aInst2.w, 1.0 ) ); useD = 0.0; }
  vEmit = vec4( e, useD );
  float fin = floor( aMeta.w * 0.25 );
  vRough = aMeta.w - fin * 4.0;
  vCoat = ( fin > 0.5 && fin < 2.5 ) ? 1.0 + aMeta.x : 0.0; // > 1.5: body-coloured paint
  vMetal = ( fin > 2.5 ) ? 1.0 : 0.0;
  vGain = fin < 0.5 ? 1.0 : fin < 1.5 ? 2.9 : fin < 2.5 ? 3.6 : 1.5;
}
`;

// after color_fragment: interior through the glass, panel lines, crease, wear (diffuse, coat, roughness, normal tilt)
const FRAG_DETAIL = /* glsl */ `
float thCoatK = 1.0;
float thRoughAdd = 0.0;
vec3 thGlassEmit = vec3( 0.0 );
float thCabinK = 1.0;
vec3 thTiltN = vec3( 0.0 );
float thMetal = 0.0;
float thBaseSpec = 1.0;
{
  float cls = floor( vObj.w + 0.5 );
  vec3 p = vObj.xyz;
  vec3 on = normalize( vObjN.xyz );
  float ph = vObjN.w;
  float pix = length( fwidth( p ) ) * 0.7;
  float side = smoothstep( 0.3, 0.55, abs( on.x ) );
  float top = smoothstep( 0.3, 0.5, on.y );
  bool glass = cls > 1.5 && ( cls < 2.5 || cls > 3.5 );
  if ( glass && uVehDetail.x > 0.5 ) {
    vec3 rd = normalize( p - vCamObj.xyz );
    // the cabin is lit by daylight through all its windows, not by the light on this pane: emitted, under the
    // glass reflection (the diffuse base goes almost black)
    vec3 inside = thInterior( p, rd, cls, vCamObj.w, ph );
    // (F2: a bus saloon is daylit through a whole wall of glass — at 0.32 its flank panes, which mirror only the
    // dark street, read as opaque black panels)
    thGlassEmit = inside * vec3( 0.8, 0.88, 0.9 ) * ( 1.0 - 0.92 * uLights ) * ( abs( cls - 4.0 ) < 0.5 ? 0.85 : 0.32 );
    // lit cabins at night (bus, LIGHT_CABIN): the lamps light the seats and passengers, not a flat panel
    if ( vEmit.a < 0.5 ) {
      thGlassEmit += inside * vec3( 1.0, 0.82, 0.6 ) * ( 3.6 * uLights * vCamObj.w );
      thCabinK = 0.18;
    }
    diffuseColor.rgb *= 0.25;
  }
  if ( abs( cls - 1.0 ) < 0.5 ) {
    if ( uVehDetail.y > 0.5 ) {
      // panel gaps: door cuts on the flanks, door bottoms, bonnet (cowl + fender seams), boot lid. Each gap is a
      // dark core with the panel edges rolled into it (normal tilt over ~1.5 cm: a highlight on one lip, shade on
      // the other), which is what makes a 4 mm shut line read at a few metres; the roll fades out with distance
      float w = 0.0035;
      float roll = 0.35 * ( 1.0 - smoothstep( 0.002, 0.006, pix ) );
      vec3 sideV = cross( vUpV, vFwdV );
      float g = 0.0;
      vec3 rollN = vec3( 0.0 );
      float ab = step( vDetB.y + 0.07, p.y );
      float rearCut = vDetA.z > -50.0 ? vDetA.z : vDetA.y;
      #define TH_GAP( D, DIR, M ) { float dd_ = ( D ); float mm_ = ( M ); g = max( g, mm_ * thLine( dd_, w, pix ) ); float ad_ = abs( dd_ ); rollN -= ( DIR ) * ( mm_ * sign( dd_ ) * smoothstep( 0.017, 0.004, ad_ ) * step( w, ad_ ) ); }
      TH_GAP( p.z - vDetA.x, vFwdV, side * ab )
      TH_GAP( p.z - vDetA.y, vFwdV, side * ab )
      TH_GAP( p.z - vDetA.z, vFwdV, side * ab )
      TH_GAP( p.y - ( vDetB.y + 0.075 ), vUpV, side * step( p.z, vDetA.x ) * step( rearCut, p.z ) )
      TH_GAP( p.z - vDetA.w, vFwdV, top )
      TH_GAP( abs( p.x ) - vDetB.z, sideV * sign( p.x ), top * step( vDetA.w, p.z ) )
      TH_GAP( p.z - vDetB.x, vFwdV, top )
      TH_GAP( abs( p.x ) - vDetB.z, sideV * sign( p.x ), top * step( p.z, vDetB.x ) )
      #undef TH_GAP
      diffuseColor.rgb *= 1.0 - 0.85 * g;
      thCoatK *= 1.0 - g;
      thTiltN += rollN * roll;
      // shoulder crease: a sharp ridge under the belt line that catches a highlight
      float dy = p.y - ( vDetB.w - 0.13 );
      thTiltN += vUpV * ( 0.3 * side * clamp( dy / 0.007, -1.0, 1.0 ) * exp( -abs( dy ) / 0.03 ) );
    }
    if ( uVehDetail.z > 0.5 ) {
      float hd = thH1( ph * 57.1 );
      if ( hd > 0.78 ) {
        // a dent in a door
        vec2 c = vec2( mix( vDetA.y, vDetA.x, 0.25 + 0.5 * thH1( ph * 3.1 ) ), vDetB.w - 0.22 - 0.15 * thH1( ph * 4.7 ) );
        vec2 o = vec2( p.z, p.y ) - c;
        float r = length( o );
        float k = side * step( 0.0, p.x * ( hd > 0.89 ? 1.0 : -1.0 ) ) * step( r, 0.15 );
        thTiltN -= ( vFwdV * o.x + vUpV * o.y ) / max( r, 1e-3 ) * ( 0.32 * k * sin( 3.14159 * r / 0.15 ) );
      }
      if ( thH1( ph * 23.9 ) > 0.92 && side > 0.5 && p.z < vDetA.x && p.z > vDetA.y && p.y < vDetB.w )
        diffuseColor.rgb *= vec3( 1.07, 1.02, 0.9 ); // a replacement door, never quite the same paint
      if ( thH1( ph * 41.3 ) > 0.72 ) {
        // old, sun-faded paint
        float l = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( l ), 0.2 ) * 1.04 + 0.02;
        thCoatK *= 0.55;
        thRoughAdd += 0.15;
      }
    }
  }
  if ( vCoat > 1.5 && vGain < 3.0 && uVehDetail.w > 0.5 ) {
    // two-layer car paint: under the lacquer the colour coat hardly reflects (the index step between them is
    // tiny), so the satin sheen of a single-layer plastic goes and the sharp clear-coat reflection carries the
    // gloss; about half the cars wear metallic paint (aluminium flake: a tinted, tighter base reflection)
    thBaseSpec = 0.22;
    if ( thH1( ph * 57.3 + 0.4 ) > 0.55 ) {
      thMetal = 0.45;
      thRoughAdd -= 0.12;
    }
  }
  if ( !glass && uVehDetail.z > 0.5 ) {
    // road grime: every vehicle carries a film of road dust low down, some a lot; it fades up the body with a
    // noisy edge, darkest along the sills and bumper bottoms (spray off the wheels), streaked vertically
    float h = thH1( ph * 91.3 );
    float dirt = 0.3 + 0.7 * h * h;
    float low = 1.0 - smoothstep( 0.1, 0.38 + 0.5 * dirt, p.y + 0.12 * thVN( p * vec3( 3.0, 1.0, 3.0 ) ) );
    float n = thVN( p * vec3( 5.0, 16.0, 5.0 ) );
    float film = 1.0 - smoothstep( 0.06, 0.2 + 0.12 * dirt, p.y );
    float m = dirt * low * ( 0.45 + 0.55 * n ) + film * ( 0.25 + 0.5 * dirt ) + 0.07 * dirt * thVN( p * 9.0 );
    // tyres: the sidewalls go grey-brown with dried road dust (never showroom black), most towards the rim edge
    if ( cls > 2.5 && cls < 3.5 ) m = max( m, ( 0.28 + 0.4 * dirt ) * ( 0.55 + 0.45 * thVN( p * 14.0 ) ) );
    // the sills catch spray off the wheels: a darker band along the bottom edge of the doors
    m += dirt * 0.35 * side * ( 1.0 - smoothstep( 0.3, 0.5, p.y ) ) * smoothstep( 0.15, 0.25, p.y ) * ( 0.6 + 0.4 * n );
    vec3 mud = mix( vec3( 0.36, 0.33, 0.28 ), vec3( 0.2, 0.19, 0.17 ), film );
    diffuseColor.rgb = mix( diffuseColor.rgb, mud, clamp( m, 0.0, 1.0 ) * 0.82 );
    thCoatK *= 1.0 - clamp( m * 1.2, 0.0, 1.0 );
    thRoughAdd += m * 0.6;
    thMetal *= 1.0 - clamp( m * 1.5, 0.0, 1.0 );
    thBaseSpec = mix( thBaseSpec, 1.0, clamp( m * 1.5, 0.0, 1.0 ) );
  }
}
`;

const FRAG_PARS = /* glsl */ `
uniform vec4 uVehDetail;
uniform float uLights;
varying vec4 vObj;
varying vec4 vObjN;
varying vec4 vCamObj;
varying vec3 vUpV;
varying vec3 vFwdV;
varying vec4 vDetA;
varying vec4 vDetB;
varying vec4 vEmit;
varying float vRough;
varying float vCoat;
varying float vMetal;
varying float vGain;
// 1 = real occupants sit in this cabin (pedestrians/occupants.ts, aInst2.w = 2): the shader draws none of its own
// and the glass writes the depth of the cabin surface behind it, so the figures inside show through
varying float vSeated;
// A street, not a studio: what a glossy car reflects below the horizon is asphalt (dark), just above it the
// facades across the street (a blocky skyline over the azimuth, mid-grey), then a bright band of hazy sky and
// the sky dome. The PMREM sky alone is too smooth to read as gloss (a uniform sheen reads as dust), so the
// sharp reflections are shaped by the reflected direction: crisp horizon / skyline lines run along the
// flanks and shoulders, windscreens mirror the roofline. The horizon is lifted a little because the diorama
// camera looks down. A few ALU; no extra pass or texture.
// sin-free hash (stable on mobile GPUs for large arguments)
float thH1( float n ) {
  n = fract( n * 0.1031 );
  n *= n + 33.33;
  n *= n + n;
  return fract( n );
}
float thVN( vec3 p ) {
  vec3 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float n = dot( i, vec3( 1.0, 57.0, 113.0 ) );
  return mix( mix( mix( thH1( n ), thH1( n + 1.0 ), f.x ), mix( thH1( n + 57.0 ), thH1( n + 58.0 ), f.x ), f.y ),
              mix( mix( thH1( n + 113.0 ), thH1( n + 114.0 ), f.x ), mix( thH1( n + 170.0 ), thH1( n + 171.0 ), f.x ), f.y ), f.z );
}
float thRH( float n ) { return fract( fract( n * 0.1031 ) * ( n * 0.1031 + 33.33 ) * 7.31 ); }
// detail fade: 1 where the reflected direction changes slowly across a pixel, 0 where it swings fast
// (tight curvature or far away) — set once per fragment in uniform control flow (fwidth)
float thReflDet = 1.0;
float thStreetRefl( vec3 viewDir, vec3 n, float soft ) {
  vec3 R = inverseTransformDirection( reflect( -viewDir, n ), viewMatrix );
  float e = R.y + 0.12;
  float w = 0.022 + soft;
  float az = atan( R.x, R.z );
  // two rows of facades: near blocks (~25 around) with their roof lines over far, lower ones; soft block edges
  float a1 = az * 4.0, b1 = floor( a1 ), f1 = fract( a1 );
  float h1 = thRH( b1 + 17.0 ), h1n = thRH( b1 + 18.0 );
  float hs = 0.1 + 0.42 * mix( h1, h1n, smoothstep( 0.9, 1.0, f1 ) );
  float a2 = az * 9.0, h2 = thRH( floor( a2 ) + 51.0 );
  float hf = 0.06 + 0.16 * h2;
  // trees in front of some blocks: lumpy crowns that break the roof line
  float tr = step( 0.62, thRH( floor( az * 6.0 ) + 7.0 ) );
  float crown = 0.16 + 0.12 * thVN( vec3( az * 22.0, 0.0, 3.0 ) );
  float sky = smoothstep( hs - w, hs + w, e ) * smoothstep( hf - w, hf + w, e ) * ( 1.0 - tr * smoothstep( crown + w, crown - w, e ) );
  float gnd = smoothstep( -w, w, e );
  // facade: per-block tone, window rows / columns (darker glass) fading with the pixel footprint
  float fac = 0.08 + 0.36 * fract( h1 * 7.13 );
  // window rows (storeys) and columns per block, soft-edged: the lacquer is never a perfect mirror
  float cols = 3.0 + floor( h1n * 5.0 );
  float win = smoothstep( 0.15, 0.5, fract( e * 16.0 + h1 ) ) * smoothstep( 0.1, 0.45, fract( f1 * cols ) ) * step( 0.3, fract( h1 * 3.1 ) );
  fac *= 1.0 - 0.38 * win * thReflDet;
  fac = mix( fac, 0.06 + 0.08 * thVN( vec3( az * 40.0, e * 40.0, 1.0 ) ), tr * smoothstep( crown + w, crown - w, e ) );
  // sky: hazy bright band over the roofs, darker blue zenith, soft cumulus lumps
  float up = max( e - hs, 0.0 );
  vec2 cp = R.xz / ( R.y + 0.25 ) * 2.2;
  float cl = smoothstep( 0.45, 0.8, thVN( vec3( cp, 5.0 ) ) * 0.65 + thVN( vec3( cp * 2.3, 9.0 ) ) * 0.35 );
  float skyL = 1.1 + 1.5 * exp( -up * 6.0 ) + 0.7 * cl * thReflDet;
  // ground: asphalt, a lighter pavement / kerb band just below the horizon
  float pav = smoothstep( -0.09, -0.06, e ) * ( 1.0 - smoothstep( -0.012, 0.0, e ) );
  float road = 0.07 + 0.18 * pav;
  return mix( road, mix( fac, skyL, sky ), gnd );
}
// anti-aliased line of half width w at signed distance d (pix = metres per pixel); thins to its coverage far away
float thLine( float d, float w, float pix ) {
  float lw = max( w, pix * 0.5 );
  return clamp( ( lw - abs( d ) ) / pix + 0.5, 0.0, 1.0 ) * ( w / lw );
}
// nearest ray / box hit in front of the ray (cabin interior)
void thBox( vec3 ro, vec3 rd, vec3 ird, vec3 b0, vec3 b1, vec3 col, inout float tb, inout vec3 nb, inout vec3 cb ) {
  vec3 t0 = ( b0 - ro ) * ird, t1 = ( b1 - ro ) * ird;
  vec3 tn = min( t0, t1 ), tf = max( t0, t1 );
  float a = max( max( tn.x, tn.y ), tn.z ), b = min( min( tf.x, tf.y ), tf.z );
  if ( a < b && a > 0.0 && a < tb ) {
    tb = a;
    cb = col;
    nb = -sign( rd ) * step( tn.yzx, tn ) * step( tn.zxy, tn );
  }
}
// nearest ray / ellipsoid hit (centre c, radii r)
void thEll( vec3 ro, vec3 rd, vec3 c, vec3 r, vec3 col, inout float tb, inout vec3 nb, inout vec3 cb ) {
  vec3 o = ( ro - c ) / r, d = rd / r;
  float a = dot( d, d ), b = dot( o, d ), cc = dot( o, o ) - 1.0;
  float h = b * b - a * cc;
  if ( h > 0.0 ) {
    float t = ( -b - sqrt( h ) ) / a;
    if ( t > 0.0 && t < tb ) {
      tb = t;
      cb = col;
      nb = normalize( ( o + d * t ) / r );
    }
  }
}
// seat: back, cushion, headrest (x centre, half width, seat-back z, cushion y, back top y, headrest top y)
void thSeat( vec3 ro, vec3 rd, vec3 ird, float cx, float hw, float z, float cy, float ty, float hy, vec3 col, inout float tb, inout vec3 nb, inout vec3 cb ) {
  thBox( ro, rd, ird, vec3( cx - hw, cy - 0.06, z - 0.11 ), vec3( cx + hw, ty, z ), col, tb, nb, cb );
  thBox( ro, rd, ird, vec3( cx - hw, cy - 0.16, z ), vec3( cx + hw, cy, z + 0.48 ), col * 1.08, tb, nb, cb );
  thBox( ro, rd, ird, vec3( cx - 0.13, ty + 0.05, z - 0.09 ), vec3( cx + 0.13, hy, z - 0.01 ), col, tb, nb, cb );
}
// distance along the view ray (object frame) from the pane to the cabin surface seen through it, −1 = none
float thHitT = -1.0;
// (three sets it on every program; the fragment stage only has to declare it: the glass depth below)
uniform mat4 projectionMatrix;
// what is seen through a window: the cabin, ray-traced in the object frame (seats, dash, steering wheel, a driver)
vec3 thInterior( vec3 ro, vec3 rd, float style, float occupied, float ph ) {
  float hw = vDetA.x, belt = vDetA.y, roof = vDetA.z, zd = vDetA.w, zr = vDetB.x, fz = vDetB.y, rz = vDetB.z;
  vec3 ird = 1.0 / ( rd + vec3( 1e-6 ) );
  float floorY = belt - 0.62;
  // the shell: exit through a wall (inside view of the box)
  vec3 b0 = vec3( -hw, floorY, zr ), b1 = vec3( hw, roof, zd );
  vec3 t1 = max( ( b0 - ro ) * ird, ( b1 - ro ) * ird );
  float tb = min( min( t1.x, t1.y ), t1.z );
  vec3 nb = -sign( rd ) * step( t1, t1.yzx ) * step( t1, t1.zxy );
  float sh = thH1( ph * 31.7 );
  vec3 trimC = sh < 0.5 ? vec3( 0.075, 0.075, 0.08 ) : sh < 0.8 ? vec3( 0.2, 0.18, 0.15 ) : vec3( 0.11, 0.1, 0.095 );
  vec3 cb = nb.y < -0.5 ? vec3( 0.42, 0.4, 0.37 ) : nb.y > 0.5 ? vec3( 0.06 ) : trimC;
  if ( style > 3.5 && style < 4.5 ) {
    // bus: rows of seats both sides of the aisle, grab poles, grey floor, light ceiling
    cb = nb.y < -0.5 ? vec3( 0.62, 0.62, 0.6 ) : nb.y > 0.5 ? vec3( 0.2, 0.2, 0.21 ) : vec3( 0.42, 0.43, 0.45 );
    vec3 seatC = vec3( 0.12, 0.2, 0.42 );
    float cy = belt - 0.42, ty = belt + 0.12, hy = ty + 0.02;
    for ( int k = 0; k < 11; k++ ) {
      float z = fz - float( k ) * 0.82;
      if ( z < zr + 0.5 ) break;
      thBox( ro, rd, ird, vec3( 0.3, cy - 0.06, z - 0.09 ), vec3( hw - 0.06, ty, z ), seatC, tb, nb, cb );
      thBox( ro, rd, ird, vec3( 0.3, cy - 0.12, z ), vec3( hw - 0.06, cy, z + 0.44 ), seatC * 1.1, tb, nb, cb );
      thBox( ro, rd, ird, vec3( -hw + 0.06, cy - 0.06, z - 0.09 ), vec3( -0.3, ty, z ), seatC, tb, nb, cb );
      thBox( ro, rd, ird, vec3( -hw + 0.06, cy - 0.12, z ), vec3( -0.3, cy, z + 0.44 ), seatC * 1.1, tb, nb, cb );
      // a seated passenger now and then
      float hp = thH1( ph * 7.0 + float( k ) * 1.37 );
      if ( hp > 0.55 && vSeated < 0.5 ) {
        float px = hp > 0.78 ? hw * 0.62 : -hw * 0.62;
        vec3 cl = vec3( thH1( hp * 9.1 ), thH1( hp * 5.3 ), thH1( hp * 3.7 ) ) * 0.35 + 0.05;
        thEll( ro, rd, vec3( px, cy + 0.28, z + 0.15 ), vec3( 0.19, 0.27, 0.12 ), cl, tb, nb, cb );
        thEll( ro, rd, vec3( px, cy + 0.69, z + 0.16 ), vec3( 0.08, 0.1, 0.09 ), vec3( 0.55, 0.4, 0.3 ) * ( 0.5 + 0.6 * thH1( hp * 2.3 ) ), tb, nb, cb );
      }
    }
    if ( occupied > 0.5 && vSeated < 0.5 ) {
      // the driver, behind the windscreen on the left
      vec3 dc = vec3( hw - 0.62, belt + 0.05, zd - 0.95 );
      thBox( ro, rd, ird, vec3( dc.x - 0.25, belt - 0.5, dc.z - 0.2 ), vec3( dc.x + 0.25, belt + 0.25, dc.z - 0.1 ), vec3( 0.08 ), tb, nb, cb );
      thEll( ro, rd, dc, vec3( 0.21, 0.27, 0.13 ), vec3( 0.42, 0.5, 0.62 ), tb, nb, cb );
      thEll( ro, rd, dc + vec3( 0.0, 0.36, 0.02 ), vec3( 0.08, 0.1, 0.092 ), vec3( 0.62, 0.45, 0.34 ), tb, nb, cb );
    }
    // yellow grab poles along the aisle
    for ( int k = 0; k < 5; k++ ) {
      float z = fz + 0.2 - float( k ) * 1.64;
      vec2 oc = ro.xz - vec2( 0.34, z );
      float bq = dot( oc, rd.xz ), cq = dot( oc, oc ) - 0.0007, aq = dot( rd.xz, rd.xz );
      float dq = bq * bq - aq * cq;
      if ( dq > 0.0 ) {
        float t = ( -bq - sqrt( dq ) ) / aq;
        if ( t > 0.0 && t < tb ) { tb = t; cb = vec3( 0.75, 0.6, 0.08 ); nb = vec3( 0.0, 1.0, 0.0 ); }
      }
    }
  } else {
    vec3 seatC = trimC * ( 0.9 + 0.5 * thH1( ph * 3.3 ) );
    float hy = roof - 0.12, ty = hy - 0.22, cy = belt - 0.36;
    float sx = hw * 0.5, shw = min( 0.25, hw * 0.45 );
    // dashboard under the windscreen, steering wheel on the left (driver) side
    thBox( ro, rd, ird, vec3( -hw, belt - 0.3, zd - 0.45 ), vec3( hw, belt + 0.06, zd ), vec3( 0.05, 0.05, 0.055 ), tb, nb, cb );
    {
      float t = ( zd - 0.6 - ro.z ) * ird.z;
      vec3 q = ro + rd * t;
      float r = length( q.xy - vec2( sx, belt + 0.06 ) );
      if ( t > 0.0 && t < tb && abs( r - 0.17 ) < 0.022 ) { tb = t; cb = vec3( 0.04 ); nb = vec3( 0.0, 0.0, 1.0 ); }
    }
    thSeat( ro, rd, ird, sx, shw, fz, cy, ty, hy, seatC, tb, nb, cb );
    thSeat( ro, rd, ird, -sx, shw, fz, cy, ty, hy, seatC, tb, nb, cb );
    if ( style > 4.5 ) {
      // van: bulkhead behind the cab
      thBox( ro, rd, ird, vec3( -hw, floorY, zr ), vec3( hw, roof, fz - 0.16 ), vec3( 0.3, 0.3, 0.31 ), tb, nb, cb );
    } else if ( rz > zr ) {
      // rear bench
      thBox( ro, rd, ird, vec3( -hw + 0.04, cy - 0.06, rz - 0.12 ), vec3( hw - 0.04, ty - 0.04, rz ), seatC, tb, nb, cb );
      thBox( ro, rd, ird, vec3( -hw + 0.04, cy - 0.16, rz ), vec3( hw - 0.04, cy, rz + 0.45 ), seatC * 1.08, tb, nb, cb );
      thBox( ro, rd, ird, vec3( sx - 0.12, ty + 0.01, rz - 0.1 ), vec3( sx + 0.12, hy - 0.04, rz - 0.02 ), seatC, tb, nb, cb );
      thBox( ro, rd, ird, vec3( -sx - 0.12, ty + 0.01, rz - 0.1 ), vec3( -sx + 0.12, hy - 0.04, rz - 0.02 ), seatC, tb, nb, cb );
    }
    if ( occupied > 0.5 && vSeated < 0.5 ) {
      // the driver: rounded torso and shoulders, arms to the wheel, neck, head with hair
      float hc0 = thH1( ph * 9.1 );
      vec3 cl = hc0 < 0.2 ? vec3( 0.06, 0.08, 0.14 ) : hc0 < 0.4 ? vec3( 0.07 ) : hc0 < 0.55 ? vec3( 0.55, 0.55, 0.52 ) : hc0 < 0.7 ? vec3( 0.25, 0.06, 0.07 ) : hc0 < 0.85 ? vec3( 0.32, 0.27, 0.2 ) : vec3( 0.12, 0.2, 0.32 );
      thEll( ro, rd, vec3( sx, ty - 0.14, fz + 0.14 ), vec3( 0.2, 0.27, 0.12 ), cl, tb, nb, cb );
      for ( float e = -1.0; e < 1.5; e += 2.0 ) {
        vec3 a0 = vec3( sx + e * 0.17, ty - 0.06, fz + 0.16 ), a1 = vec3( sx + e * 0.14, belt + 0.02, zd - 0.62 );
        for ( float k = 0.15; k < 1.0; k += 0.3 ) thEll( ro, rd, mix( a0, a1, k ), vec3( 0.055, 0.055, 0.12 ), cl * 0.92, tb, nb, cb );
      }
      float sk = thH1( ph * 13.1 );
      vec3 skin = mix( vec3( 0.8, 0.58, 0.45 ), vec3( 0.3, 0.18, 0.12 ), sk * sk );
      thEll( ro, rd, vec3( sx, ty + 0.04, fz + 0.15 ), vec3( 0.045, 0.06, 0.045 ), skin * 0.85, tb, nb, cb );
      vec3 hc = vec3( sx, ty + 0.15, fz + 0.15 );
      float tb0 = tb;
      thEll( ro, rd, hc, vec3( 0.078, 0.1, 0.092 ), skin, tb, nb, cb );
      if ( tb < tb0 ) {
        vec3 q = ro + rd * tb - hc;
        float hr = thH1( ph * 17.3 );
        vec3 hair = hr < 0.5 ? vec3( 0.04, 0.03, 0.025 ) : hr < 0.8 ? vec3( 0.2, 0.12, 0.06 ) : vec3( 0.55, 0.5, 0.45 );
        if ( q.y > 0.02 - 0.05 * hr || q.z < -0.03 ) cb = hair;
      }
    }
  }
  // inside light: the roof shades the cabin, faces turned up catch the sky through the glass
  float lit = 0.5 + 0.3 * nb.y + 0.15 * abs( nb.x );
  thHitT = tb;
  return cb * lit * mix( 1.0, 0.55, clamp( ( tb - 0.3 ) * 0.5, 0.0, 1.0 ) );
}
`;

export function createVehicleMaterial(
  uniforms: GlobalUniforms,
  atlas: THREE.Texture,
): { material: THREE.MeshPhysicalMaterial; depth: THREE.MeshDepthMaterial; detail: { value: THREE.Vector4 } } {
  const detail = { value: new THREE.Vector4(1, 1, 1, 0) };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: atlas,
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  material.name = 'traffic-vehicle';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uLights = uniforms.uLights;
    shader.uniforms.uVehDetail = detail;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace(
        '#include <uv_vertex>',
        // decal rows per variant; aMeta.z < 0: a per-vehicle cell of the number-plate grid (by the phase)
        `#include <uv_vertex>\n#ifdef USE_MAP\n  if ( aMeta.z < -0.5 ) { float c = floor( aInst2.z * ${PLATE_CELLS.n * PLATE_CELLS.n}.0 ); vMapUv += vec2( mod( c, ${PLATE_CELLS.n}.0 ) * ${PLATE_CELLS.du.toFixed(6)}, -floor( c / ${PLATE_CELLS.n}.0 ) * ${PLATE_CELLS.dv.toFixed(6)} ); }\n  else vMapUv.y -= aMeta.z * aInst2.x;\n#endif`,
      )
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif ( aWheel.w > 0.5 ) objectNormal = thWheel( objectNormal );')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BEGIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_DETAIL}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp( roughness * vRough + thRoughAdd, 0.04, 1.0 );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( normal + thTiltN );')
      .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n#ifdef USE_CLEARCOAT\n  clearcoatNormal = normalize( clearcoatNormal + thTiltN );\n#endif')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = max( vMetal, thMetal );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n{ float thK = mix( thBaseSpec, 1.0, thMetal * 2.0 ); material.specularColor *= thK; material.specularColorBlended *= thK; }\n#ifdef USE_CLEARCOAT\n  material.clearcoat = min( vCoat, 1.0 ) * thCoatK;\n  // body lacquer: a stronger Fresnel coat (F0 0.09) instead of a brighter reflection — the coat both adds the\n  // reflected street and takes the same share from the colour under it, so dark reflections show on white too\n  if ( vCoat > 1.5 && uVehDetail.w > 0.5 ) material.clearcoatF0 = vec3( 0.09 );\n#endif')
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
  { vec3 thRw = reflect( -geometryViewDir, geometryNormal ); thReflDet = clamp( 1.6 - length( fwidth( thRw ) ) * 9.0, 0.0, 1.0 ) * step( 0.5, uVehDetail.w ); }
  #ifdef USE_CLEARCOAT
    // body paint (vCoat > 1.5) gets the street at more contrast: a lacquered panel mirrors it clearly
    clearcoatRadiance *= vGain * thStreetRefl( geometryViewDir, geometryClearcoatNormal, 0.0 ) * ( vCoat > 1.5 && uVehDetail.w > 0.5 ? 1.8 : 1.0 );
  #endif
  if ( vMetal > 0.5 ) radiance *= vGain * thStreetRefl( geometryViewDir, geometryNormal, material.roughness * 0.3 );
#endif`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit.rgb * mix( vec3( 1.0 ), diffuseColor.rgb, vEmit.a ) * thCabinK + thGlassEmit;')
      // cabins with real occupants: the glass takes the depth of the ray-traced cabin surface behind it (every other
      // fragment keeps its own), so the seated figures (drawn by the pedestrians module) show through the windows
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
gl_FragDepth = gl_FragCoord.z;
if ( vSeated > 0.5 && thHitT > 0.0 ) {
  vec3 thMv = -vViewPosition;
  vec4 thCp = projectionMatrix * vec4( thMv * ( 1.0 + thHitT / length( thMv ) ), 1.0 );
  gl_FragDepth = clamp( 0.5 * thCp.z / thCp.w + 0.5, 0.0, 1.0 );
}`,
      );
  };
  material.customProgramCacheKey = () => 'traffic-vehicle-v11';
  patchLampMaterial(material); // night street-light map (night agent)

  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'traffic-vehicle-depth';
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aPart;\nattribute vec4 aInst2;\nbool thHidden(float part, float variant, float phase) {\n  part -= 100.0 * floor( part * 0.01 + 0.001 );\n  if (part < 0.5) return false;\n  if (part > 89.5) return fract( phase * 7.31 ) < 0.8;\n  if (part > 15.5) return mod(floor((part - 16.0) / exp2(floor(variant + 0.5))), 2.0) < 0.5;\n  return abs(part - variant - 1.0) > 0.25;\n}',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif ( thHidden( aPart, aInst2.x, aInst2.z ) ) transformed = vec3( 0.0 );');
  };
  depth.customProgramCacheKey = () => 'traffic-vehicle-depth-v4';
  return { material, depth, detail };
}
