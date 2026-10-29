// Shared GLSL of the life module: hanging lines (bunting, festoons, laundry) and hinged cloth.
//
// A line hangs between two fixed ends P0 / P1 with a parabolic sag. A cross wind swings the whole
// sag about the chord like a pendulum (steady lean + the line's own slow oscillation), so a gust
// crossing the street visibly lifts the bunting. Every consumer (cloth pieces, wires, bulbs)
// evaluates the same function, so pieces stay on their wire.
//
// Needs WIND_GLSL (src/core/wind.ts) and `uniform float uTime; uniform vec2 uWind;`.

/** lifeLine(P0, P1, sag, seed, s, out T): point at parameter s ∈ [0,1] and the unit tangent T. */
export const LIFE_LINE_GLSL = /* glsl */ `
vec3 lifeLine( vec3 P0, vec3 P1, float sag, float seed, float s, out vec3 T ) {
  vec3 chord = P1 - P0;
  float L = max( length( chord ), 1e-3 );
  vec3 C = chord / L;
  vec3 dn = vec3( 0.0, -1.0, 0.0 ) - C * ( -C.y );
  dn = normalize( dn + vec3( 0.0, -1e-4, 0.0 ) );
  vec3 sd = cross( C, dn );
  vec3 mid = 0.5 * ( P0 + P1 );
  vec2 w = thWindAt( mid.xz );
  float wp = dot( vec3( w.x, 0.0, w.y ), sd );
  float wl = length( w );
  float fr = fract( seed * 7.13 );
  // steady lean (drag ~ v^2) + pendulum oscillation + gusty jitter
  float phi = atan( 0.9 * wp * abs( wp ) + 0.3 * wp );
  phi += ( 0.035 + 0.09 * wl ) * sin( uTime * ( 1.9 + 0.6 * fr ) + seed * 6.2832 );
  phi += 0.025 * wl * sin( uTime * ( 4.7 + fr ) + seed * 2.7 + s * 3.0 );
  vec3 dir = dn * cos( phi ) + sd * sin( phi );
  float bow = 4.0 * s * ( 1.0 - s );
  float rip = 0.035 * sag * ( 0.25 + wl ) * sin( 12.566 * s - uTime * ( 2.6 + 2.0 * wl ) + seed * 4.0 ) * bow;
  T = normalize( chord + dir * ( 4.0 * sag * ( 1.0 - 2.0 * s ) ) );
  return P0 + chord * s + dir * ( sag * bow + rip );
}
`;

/**
 * Hinged cloth piece (pennant, flag, laundry). Instance attributes:
 *   aP0   xyz line end A (mode 0) / hoist top (mode 1),  w = sag (m)
 *   aP1   xyz line end B / hoist bottom,                 w = line seed
 *   aPiece  x = s of the piece centre on the line, y = hinge width (m), z = length away from the hinge (m), w = shape
 *   aMisc   x = phase, y = weight (1 light cloth … 3 wet sheet), z = mode (0 on a line, 1 pole flag), w = flutter gain
 *   aCol / aCol2  rgb colours, aCol.w = pattern
 * position.xy of the base grid = (u along the hinge 0..1, v away from the hinge 0..1).
 * Shapes: 0 triangle pennant, 1 rectangle, 2 shirt, 3 trousers, 4 sheet / towel, 5 swallow-tail.
 */
export const LIFE_CLOTH_PARS = /* glsl */ `
attribute vec4 aP0;
attribute vec4 aP1;
attribute vec4 aPiece;
attribute vec4 aMisc;
attribute vec4 aCol;
attribute vec4 aCol2;
uniform float uLifeFarFlutter;
varying vec2 vLifeUv;
varying float vLifeShape;
#ifndef LIFE_DEPTH
varying vec3 vLifeCol;
varying vec3 vLifeCol2;
varying float vLifePat;
#endif
void lifePiece( out vec3 pos, out vec3 nrm ) {
  float u = position.x, v = position.y;
  float shape = aPiece.w;
  float mode = aMisc.z;
  float uu = shape < 0.5 ? 0.5 + ( u - 0.5 ) * ( 1.0 - v ) : u;
  vec3 P0 = aP0.xyz, P1 = aP1.xyz;
  vec3 T, H;
  if ( mode < 0.5 ) {
    float L = max( length( P1 - P0 ), 1e-3 );
    float s = aPiece.x + ( uu - 0.5 ) * aPiece.y / L;
    H = lifeLine( P0, P1, aP0.w, aP1.w, s, T );
  } else {
    T = normalize( P1 - P0 );
    H = mix( P0, P1, uu );
  }
  vec2 w2 = thWindAt( H.xz );
  float wl = length( w2 );
  vec3 wv = vec3( w2.x, 0.0, w2.y );
  float weight = aMisc.y;
  vec3 D = vec3( 0.0, -weight, 0.0 ) + wv * ( 1.6 * wl + 0.3 );
  vec3 F = D - T * dot( D, T );
  float fl = length( F );
  // dead calm on a pole: keep the last sensible direction (along +x of the hoist frame)
  F = fl > 1e-4 ? F / fl : normalize( vec3( 1.0, 0.0, 0.3 ) - T * dot( vec3( 1.0, 0.0, 0.3 ), T ) );
  float lenP = aPiece.z;
  // each piece also swings / twists on its own about the hinge (no two pennants alike)
  vec3 N1 = normalize( cross( T, F ) );
  float tw = ( 0.1 + 0.2 * min( wl, 1.2 ) ) * sin( uTime * ( 1.0 + 0.6 * fract( aMisc.x * 3.7 ) ) / sqrt( weight ) + aMisc.x * 2.3 ) * ( mode < 0.5 ? 1.0 : 0.25 );
  F = normalize( F * cos( tw ) + N1 * sin( tw ) );
  vec3 N0 = normalize( cross( T, F ) );
  vec3 Fd = F;
  if ( mode > 0.5 ) {
    // pole flag: flies out with the wind, droops (and folds) in a calm
    float lift = smoothstep( 0.05, 0.55, wl );
    Fd = normalize( F * ( 0.35 + 0.65 * lift ) + T * ( 0.95 * ( 1.0 - lift ) + 0.06 ) );
  }
  float camD = length( cameraPosition - H );
  float near = 1.0 - smoothstep( uLifeFarFlutter * 0.5, uLifeFarFlutter, camD );
  float calm = mode > 0.5 ? 1.0 + 1.3 * ( 1.0 - smoothstep( 0.05, 0.45, wl ) ) : 1.0;
  float A = lenP * ( 0.035 + 0.085 * min( wl, 1.3 ) ) * aMisc.w * calm * near / sqrt( weight );
  float om = 5.5 + 9.0 * min( wl, 1.4 ) / sqrt( weight );
  float k = 6.2832 / max( 0.3, 0.75 * lenP + 0.2 );
  float arg = k * v * lenP - om * uTime + aMisc.x + u * 1.4;
  float arg2 = 1.7 * arg + 1.1 + u * 0.8;
  float disp = A * v * ( sin( arg ) + 0.4 * sin( arg2 ) );
  float ddv = A * ( sin( arg ) + 0.4 * sin( arg2 ) ) + A * v * k * lenP * ( cos( arg ) + 0.68 * cos( arg2 ) );
  pos = H + Fd * ( v * lenP ) + N0 * disp;
  nrm = normalize( N0 - Fd * ( ddv / max( lenP, 0.05 ) ) );
  float drape = aCol2.w;
  if ( shape > 5.5 ) {
    // clothes peg: a rigid little clip standing on the line, proud of the cloth on the viewer's side
    vec3 side = dot( N0, cameraPosition - H ) > 0.0 ? N0 : -N0;
    pos = H + vec3( 0.0, 0.024 - v * lenP, 0.0 ) + side * 0.009;
    nrm = side;
  } else if ( drape > 0.0 ) {
    // laundry: the top edge sags between the pegs (and the hem with it), vertical folds that deepen towards the
    // hem, the hem gathered in a little; folds every ~12 cm across the width, varied per piece
    float wP = aPiece.y;
    float pin = smoothstep( 0.0, 0.08, u ) * smoothstep( 1.0, 0.92, u );
    float topSag = drape * min( 0.035, wP * 0.05 ) * sin( 3.14159 * clamp( ( u - 0.08 ) / 0.84, 0.0, 1.0 ) );
    float nf = max( 2.0, floor( wP / 0.12 ) );
    float fa = 6.2832 * nf * u + aMisc.x * 3.0;
    float famp = drape * ( 0.006 + 0.026 * v ) * ( 0.6 + 0.4 * sin( aMisc.x * 5.1 + u * 3.0 ) ) * pin;
    float fold = famp * sin( fa );
    pos += N0 * fold - vec3( 0.0, topSag * ( 1.0 - 0.3 * v ), 0.0 ) - T * ( u - 0.5 ) * wP * 0.08 * v * drape;
    nrm = normalize( nrm - T * ( famp * 6.2832 * nf * cos( fa ) / max( wP, 0.05 ) ) );
  }
  vLifeUv = vec2( u, v );
  vLifeShape = shape;
  #ifndef LIFE_DEPTH
  vLifeCol = aCol.rgb;
  vLifeCol2 = aCol2.rgb;
  vLifePat = aCol.w;
  #endif
}
`;

/** Shape mask (true = keep). Shared by the colour and the shadow-depth programs. */
export const LIFE_MASK_GLSL = /* glsl */ `
bool lifeKeep( vec2 uv, float shape ) {
  float du = abs( uv.x - 0.5 );
  if ( shape > 1.5 && shape < 2.5 ) {
    // shirt: sleeves in the top quarter, body below; a little collar notch
    if ( uv.y > 0.27 && du > 0.31 ) return false;
    if ( uv.y < 0.05 && du < 0.08 ) return false;
  } else if ( shape > 2.5 && shape < 3.5 ) {
    // trousers: two legs below the seat
    if ( uv.y > 0.32 && du < 0.045 ) return false;
  } else if ( shape > 4.5 && shape < 5.5 ) {
    // swallow-tail
    if ( uv.y > 0.7 && du < ( uv.y - 0.7 ) * 1.2 ) return false;
  }
  return true;
}
`;

/** Printed patterns (vLifePat): 0 plain, 1 bands across the hinge, 2 bands along, 3 diagonal halves,
 *  4 prayer-flag print, 5 vertical tricolour (pole flags), 6 Nordic cross, 7 border, 8 stripes (towel / shirt). */
export const LIFE_PATTERN_GLSL = /* glsl */ `
vec3 lifePattern( vec2 uv, vec3 c1, vec3 c2, float pat ) {
  if ( pat < 0.5 ) return c1;
  if ( pat < 1.5 ) return fract( uv.x * 2.0 ) < 0.5 ? c1 : c2;
  if ( pat < 2.5 ) return uv.y > 0.33 && uv.y < 0.66 ? c2 : c1;
  if ( pat < 3.5 ) return uv.x + uv.y * 0.5 < 0.75 ? c1 : c2;
  if ( pat < 4.5 ) {
    vec2 q = abs( uv - vec2( 0.5, 0.48 ) );
    float m = max( q.x, q.y * 1.2 );
    float ink = step( m, 0.22 ) * ( 0.55 + 0.45 * step( 0.5, fract( ( uv.x + uv.y ) * 9.0 ) ) );
    return mix( c1, c1 * 0.45 + c2 * 0.25, ink * 0.75 );
  }
  if ( pat < 5.5 ) return uv.y < 0.333 ? c1 : uv.y < 0.666 ? c2 : c1 * 0.25 + vec3( 0.75 );
  if ( pat < 6.5 ) return abs( uv.x - 0.5 ) < 0.1 || abs( uv.y - 0.36 ) < 0.08 ? c2 : c1;
  if ( pat < 7.5 ) return min( min( uv.x, 1.0 - uv.x ), min( uv.y, 1.0 - uv.y ) * 0.7 ) < 0.09 ? c2 : c1;
  return fract( uv.x * 5.0 ) < 0.4 ? c2 : c1;
}
`;
