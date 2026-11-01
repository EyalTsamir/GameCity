// Fragment code of the close level (vehicleMaterial.ts, programs with VEH_NEAR): only a few vehicles beside the camera ever
// run these programs, the city-wide vehicle programs do not grow by a byte.
//
//   class 7  cabin parts (cabin.ts): vDetA = (half width, belt, roof, dash z), vDetB = (rear z, floor y, trim mode, lit), vSeat
//            the seat a part belongs to. Trim per vehicle, fabric and grain from the close-up tiles (a fetch is cheap here),
//            the dark of a closed cabin in thCabAO (ambient and lamp light only: real sun comes in by the shadow map)
//   glass    drawn after everything, added over the cabin: what it reflects, a little dust, what it lets through in alpha

// paint from a metre away: stone chips where the road throws them, hairline scratches round the door handles, dried runs under
// the window line, a fall of dust on what faces up. Read from the close-up tiles, each car its own window of them
const WEAR = /* glsl */ `
  if ( uVehDetail.z > 0.5 && vCoat > 1.5 ) {
    float sideK = smoothstep( 0.45, 0.7, abs( on.x ) );
    float topK = smoothstep( 0.35, 0.7, on.y );
    vec2 uv = sideK > 0.5 ? p.zy : ( abs( on.z ) > 0.6 ? p.xy : p.xz );
    uv += vec2( ph * 13.7, ph * 7.3 );
    vec4 gr = texture2D( tGrain, uv * 2.1 );
    vec4 gr2 = texture2D( tGrain, uv * 6.3 );
    vec4 crk = texture2D( tCrack, uv * 0.42 );
    float dirtH = thH1( ph * 91.3 );
    // chips: the pits of the grain tile, thick on the nose, the lower doors and behind the wheels
    float nose = smoothstep( 0.0, 1.0, ( p.z - 0.3 ) * 0.7 ) * ( 0.45 + 0.55 * step( abs( on.z ), 0.9 ) );
    float zone = clamp( nose + 0.5 * sideK * ( 1.0 - smoothstep( 0.35, 0.7, p.y ) ), 0.0, 1.0 );
    float ch = smoothstep( 0.9 - 0.05 * zone * dirtH, 0.95, gr2.a ) * smoothstep( 0.45, 0.7, crk.b + 0.3 * zone ) * zone * ( 0.25 + dirtH );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.42, 0.42, 0.41 ), clamp( ch * 1.5, 0.0, 1.0 ) * 0.85 );
    thCoatK *= 1.0 - clamp( ch * 2.0, 0.0, 1.0 );
    thRoughAdd += 0.4 * ch;
    // scratches: long fibres, only just below the belt line where keys and bags go
    if ( sideK > 0.5 ) {
      vec4 fb = texture2D( tFibre, vec2( p.z * 1.3, p.y * 2.6 ) + ph * 3.1 );
      float band = smoothstep( 0.18, 0.05, abs( p.y - ( vDetB.w - 0.13 ) ) );
      float sc = smoothstep( 0.82, 0.92, fb.a ) * band * ( 0.25 + 0.75 * dirtH );
      thRoughAdd += 0.25 * sc;
      thCoatK *= 1.0 - 0.6 * sc;
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.55 ), 0.25 * sc );
      // dried runs down from the window line and the door mirrors
      vec4 fr = texture2D( tFibre, vec2( p.y * 0.35, p.z * 3.6 ) + ph * 5.7 );
      float run = smoothstep( 0.62, 0.86, fr.b ) * smoothstep( vDetB.y + 0.05, vDetB.w - 0.12, p.y ) * smoothstep( vDetB.w + 0.02, vDetB.w - 0.06, p.y );
      diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.86, 0.85, 0.82 ) + vec3( 0.012 ), run * ( 0.2 + 0.6 * dirtH ) );
    }
    // dust on what faces up, in drifts; a car under a tree has more
    float dust = topK * ( 0.08 + 0.42 * dirtH * dirtH ) * ( 0.35 + 0.65 * crk.b ) * ( 0.65 + 0.7 * gr.b );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.44, 0.41, 0.36 ), clamp( dust, 0.0, 0.7 ) );
    thCoatK *= 1.0 - clamp( dust * 1.4, 0.0, 0.85 );
    thRoughAdd += dust * 0.5;
    // the paint's own orange peel, only in the highlight
    thTiltN += ( vUpV * ( gr.g - 0.5 ) + vFwdV * ( gr.r - 0.5 ) ) * 0.016;
  }
  // tread: four grooves round the tyre, sipes across its ribs, turning with the wheel
  if ( abs( cls - 3.0 ) < 0.5 ) {
    float w = max( vDetA.y, 0.1 );
    float ax = ( p.x - vSeat.x ) / ( 0.5 * w );
    float fw = fwidth( ax ) + 1e-4;
    float fade = 1.0 - smoothstep( 0.04, 0.2, fw );
    if ( abs( on.x ) < 0.6 && fade > 0.0 ) {
      float gr = 0.0;
      for ( float k = -0.54; k < 0.6; k += 0.36 ) gr = max( gr, 1.0 - smoothstep( 0.035, 0.075, abs( ax - k ) ) );
      float ang = atan( p.y - vSeat.y, p.z - vSeat.z );
      float sip = 1.0 - smoothstep( 0.0, 0.05, abs( fract( ang * 19.0 + ax * 1.6 ) - 0.5 ) - 0.42 );
      float m = max( gr, sip * 0.65 * step( abs( ax ), 0.9 ) ) * fade;
      diffuseColor.rgb *= 1.0 - 0.72 * m;
      thRoughAdd += 0.2 * m;
    }
  }
`;

export const NEAR_FRAG_PARS = /* glsl */ `
uniform sampler2D tFibre;
uniform sampler2D tGrain;
uniform sampler2D tCrack;
varying vec3 vSeat;
float thCabAO = -1.0;
float thTrans = 0.8;
// a lamp's insides, a door mirror: what the daylight makes of them (albedo) and what they give off themselves
vec3 thLensAlb = vec3( 0.0 );
vec3 thLensEmit = vec3( 0.0 );
`;

export const CLOSE_FRAG_DETAIL = /* glsl */ `
#ifdef VEH_CLOSE
{
  float cls = floor( vObj.w + 0.5 );
  vec3 p = vObj.xyz;
  vec3 on = normalize( vObjN.xyz );
  float ph = vObjN.w;
  float pix = length( fwidth( p ) ) * 0.7;
  #ifdef VEH_BUSHOLES
  if ( abs( cls - 6.0 ) < 0.5 && abs( p.x ) > vDetA.x - 0.06 ) {
    // the openings behind the panes (models.ts bus(), yw0 / yw1, runs of panes), real doorways on the kerb side
    bool inRow = false;
    float z = p.z;
    if ( p.y > vDetA.y + 0.02 && p.y < 2.36 ) {
      if ( p.x > 0.0 ) {
        if ( z > -4.95 && z < 4.0 ) inRow = abs( fract( ( z + 4.95 ) / 1.2857 ) - 0.5 ) * 1.2857 < 0.553;
        else inRow = z > 4.14 && z < 5.1;
      } else {
        if ( z > -4.95 && z < -0.42 ) inRow = abs( fract( ( z + 4.95 ) / 1.51 ) - 0.5 ) * 1.51 < 0.665;
        else if ( z > 0.92 && z < 3.7 ) inRow = abs( fract( ( z - 0.92 ) / 1.39 ) - 0.5 ) * 1.39 < 0.605;
      }
    }
    if ( p.x < 0.0 && p.y > 0.36 && p.y < 2.44 && ( abs( z - vDetB.z ) < 0.58 || abs( z - vDetB.w ) < 0.58 ) ) inRow = true;
    if ( inRow ) discard;
  }
  #endif
  if ( abs( cls - 7.0 ) < 0.5 ) {
    float mode = floor( vDetB.z + 0.5 );
    float hw = vDetA.x, belt = vDetA.y, roof = vDetA.z, floorY = vDetB.y;
    float sh = thH1( ph * 31.7 );
    // the same trims as the farther level's ray-traced cabin: black, biscuit, grey
    vec3 trimC = sh < 0.5 ? vec3( 0.075, 0.075, 0.08 ) : sh < 0.8 ? vec3( 0.2, 0.18, 0.15 ) : vec3( 0.11, 0.1, 0.095 );
    vec3 an = abs( on );
    vec2 puv = ( an.x > an.y && an.x > an.z ) ? p.zy : ( an.y > an.z ? p.xz : p.xy );
    if ( mode > 0.5 && mode < 1.5 ) {
      // a seat: a pleated cloth panel down the middle, plainer bolsters, a seam between them, wear where people slide in
      float dx = abs( p.x - vSeat.x );
      float seam = thLine( dx - 0.125, 0.0025, pix );
      float insert = 1.0 - smoothstep( 0.118, 0.13, dx );
      vec4 cl = texture2D( tFibre, puv * vec2( 7.0, 27.0 ) );
      float rib = insert * ( 0.5 + 0.5 * sin( ( p.y + p.z * 0.6 ) * 150.0 ) ) * ( 1.0 - smoothstep( 0.002, 0.006, pix ) );
      vec3 c = trimC * mix( 2.0, 2.7, insert ) * ( 0.88 + 0.24 * cl.b ) * ( 1.0 - 0.14 * rib );
      if ( thH1( ph * 11.1 ) > 0.72 ) c = mix( c, c * vec3( 1.3, 0.72, 0.62 ) * 1.1, insert ); // a coloured cloth in some
      c *= 1.0 - 0.75 * seam;
      diffuseColor.rgb = c;
      thTiltN += ( vUpV * ( cl.g - 0.5 ) + vFwdV * ( cl.r - 0.5 ) ) * 0.07;
    } else if ( mode < 2.5 && mode > 1.5 ) {
      // plastic: fine leather-like grain on the trim's darker tone
      vec4 g = texture2D( tGrain, puv * 4.5 );
      diffuseColor.rgb = mix( vec3( 0.045 ), trimC, 0.35 ) * ( 0.82 + 0.36 * g.b );
      thTiltN += ( vUpV * ( g.g - 0.5 ) + vFwdV * ( g.r - 0.5 ) ) * 0.2;
    } else if ( mode < 3.5 && mode > 2.5 ) {
      // roof lining: pale felt
      vec4 g = texture2D( tFibre, puv * vec2( 6.0, 22.0 ) );
      diffuseColor.rgb = mix( vec3( 0.46, 0.44, 0.4 ), vec3( 0.28 ), step( 0.5, sh ) * step( sh, 0.5 ) ) * ( 0.9 + 0.2 * g.b );
    } else if ( mode < 4.5 && mode > 3.5 ) {
      // carpet
      vec4 g = texture2D( tGrain, puv * 9.0 );
      diffuseColor.rgb = trimC * 0.75 * ( 0.55 + 0.9 * g.b );
    } else if ( mode > 5.5 ) {
      // bus moquette: flecks of colour on navy; the operator's own
      vec4 g = texture2D( tGrain, puv * 7.0 );
      vec4 cl = texture2D( tFibre, puv * vec2( 5.0, 19.0 ) );
      diffuseColor.rgb = mix( vec3( 0.05, 0.08, 0.2 ), vec3( 0.34, 0.1, 0.09 ), smoothstep( 0.62, 0.72, g.b ) ) * ( 0.7 + 0.6 * cl.b );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.55, 0.47, 0.22 ), smoothstep( 0.74, 0.8, g.a ) * 0.7 );
    } else if ( mode > 4.5 ) {
      // door card: a cloth insert between the armrest line and the sill, plastic round it
      vec4 g = texture2D( tGrain, puv * 4.5 );
      float ins = smoothstep( belt - 0.34, belt - 0.33, p.y ) * ( 1.0 - smoothstep( belt - 0.12, belt - 0.11, p.y ) );
      diffuseColor.rgb = trimC * mix( 0.95, 2.2, ins ) * ( 0.82 + 0.36 * g.b );
      diffuseColor.rgb *= 1.0 - 0.6 * thLine( p.y - ( belt - 0.335 ), 0.003, pix ) - 0.6 * thLine( p.y - ( belt - 0.115 ), 0.003, pix );
    }
    // a closed cabin: dark at the floor, lighter towards the windows; surfaces facing up see the sky through the glass
    float hT = clamp( ( p.y - floorY ) / max( roof - floorY, 0.1 ), 0.0, 1.0 );
    float ao = mix( 0.22, 0.62, hT * hT ) * ( 0.75 + 0.35 * on.y );
    ao += 0.18 * smoothstep( hw * 0.55, hw, abs( p.x ) ) * step( belt, p.y );
    if ( vDetB.w > 0.5 ) ao = ao * 1.5 + 0.1;
    else if ( hw > 0.86 ) ao = ao * 1.4 + 0.06;
    thCabAO = clamp( ao, 0.0, 1.0 );
    thCoatK = 0.0;
    // a saloon's strip lamps, on after dark while it runs
    if ( vDetB.w > 0.5 ) thLensEmit += diffuseColor.rgb * vec3( 1.0, 0.86, 0.68 ) * ( 0.9 + 0.8 * on.y ) * ( 0.45 + 0.75 * hT ) * uLights * vCamObj.w;
    thBaseSpec = 0.6;
  } else if ( abs( cls - 8.0 ) < 0.5 ) {
    // a lamp, seen through its clear cover (geometry = the cover, in class 2's glass finish): a chrome bowl and a projector
    // ball behind it (head), prisms over bulbs (tail), by the ray from the eye: they move against the cover as you walk past
    vec3 c = vDetA.xyz;
    float hx = vDetA.w, hy = vDetB.x, st = vDetB.y;
    vec3 fl = vec3( c.x < 0.0 ? -1.0 : 1.0, 1.0, c.z < 0.0 ? -1.0 : 1.0 );
    vec3 q = ( p - c ) * fl;
    vec3 rd = normalize( p - vCamObj.xyz ) * fl;
    float izd = 1.0 / min( rd.z, -0.15 );
    float lon = vCamObj.w * uLights;
    vec3 col = vec3( 0.0 ), em = vec3( 0.0 );
    if ( st < 2.5 ) {
      float r0 = st < 0.5 ? min( hx, hy ) * 0.92 : st < 1.5 ? min( hy * 0.95, hx * 0.46 ) : hy * 1.05;
      float mx = st < 0.5 ? 0.0 : hx * 0.44;
      float dz = 0.05;
      vec3 h = q + rd * ( ( -dz - q.z ) * izd );
      vec2 m = vec2( st < 0.5 || st > 1.5 ? mx : ( h.x > 0.0 ? mx : -mx ), 0.0 );
      vec2 d = h.xy - m;
      float r = length( d ) / r0;
      // the bowl: chrome that mirrors sky above and road below, stepped into facets
      vec3 nb = normalize( vec3( d / r0 * 0.85, 1.0 ) );
      vec3 Rb = reflect( rd, nb );
      float facet = 0.82 + 0.18 * sin( atan( d.y, d.x ) * 16.0 );
      float bowl = ( 0.12 + 0.88 * smoothstep( -0.25, 0.75, Rb.y ) ) * facet;
      float inB = 1.0 - smoothstep( 0.96, 1.0, r );
      // outside the bowl: the dark housing with its moulded ribs
      float rib = step( 0.5, fract( h.x * 55.0 ) );
      col = mix( vec3( 0.03 + 0.018 * rib ), vec3( 0.85 ) * bowl, inB );
      col += vec3( 0.55 ) * ( 1.0 - smoothstep( 0.0, 0.05, abs( r - 1.0 ) ) );
      // bulb light fills the bowl
      em += lon * vec3( 1.0, 0.93, 0.8 ) * 2.4 * inB * ( 0.35 + bowl * 1.5 ) * exp( -r * 1.3 );
      // the projector ball, standing forward of the bowl
      float R = r0 * 0.46;
      vec3 o = q - vec3( m, -dz * 0.42 );
      float b = dot( o, rd ), cq = dot( o, o ) - R * R, disc = b * b - cq;
      if ( disc > 0.0 ) {
        vec3 n = ( o + rd * ( -b - sqrt( disc ) ) ) / R;
        float fres = pow( 1.0 - clamp( -dot( n, rd ), 0.0, 1.0 ), 3.0 );
        col = vec3( 0.03 ) + vec3( 0.75 ) * pow( max( n.y, 0.0 ), 7.0 ) + vec3( 0.35 ) * fres;
        em = lon * vec3( 1.0, 0.95, 0.85 ) * ( 11.0 * exp( -3.5 * dot( n.xy, n.xy ) ) + 0.6 );
      }
      // daytime running light: a slim light guide along the top of the housing
      float bar = st < 0.5 ? 1.0 - smoothstep( 0.0, 0.05, abs( r - 1.04 ) ) : ( 1.0 - smoothstep( 0.0, 0.007, abs( q.y - hy * 0.74 ) ) ) * step( abs( q.x ), hx * 0.94 );
      col += vec3( 0.3 ) * bar;
      em += bar * vec3( 1.0, 0.98, 0.93 ) * vCamObj.w * ( 1.2 + 2.6 * uLights );
    } else {
      // a tail lamp: red prisms on the cover, a clear reversing lamp inboard, bulbs glowing behind by parallax
      vec3 h = q + rd * ( ( -0.03 - q.z ) * izd );
      vec2 cell = q.xy / 0.0095;
      float odd = mod( floor( cell.y ), 2.0 );
      vec2 f = fract( vec2( cell.x + 0.5 * odd, cell.y ) ) - 0.5;
      float pixL = length( fwidth( q.xy ) );
      float fine = 1.0 - smoothstep( 0.0015, 0.0045, pixL );
      vec3 tn = normalize( vec3( f * 1.1 * fine, 1.0 ) );
      vec3 Rt = reflect( rd, tn );
      float spark = pow( max( Rt.y * 0.8 + 0.25, 0.0 ), 5.0 );
      float rev = ( st < 3.5 && hx > 0.14 && vDetB.z < 0.5 ) ? 1.0 - smoothstep( -0.47, -0.44, q.x / hx ) : 0.0;
      float amb = step( 0.5, vDetB.z );
      vec3 red = ( amb > 0.5 ? vec3( 0.85, 0.42, 0.05 ) : vec3( 0.8, 0.03, 0.022 ) ) * ( 0.42 + 1.5 * spark );
      vec3 clear = vec3( 0.45 ) * ( 0.1 + 1.3 * spark ) + vec3( 0.12 ) * ( 0.5 + 0.5 * sin( h.y * 180.0 ) );
      col = mix( red, clear, rev );
      float bx0 = hx * 0.5, br = max( min( hx, hy ) * 0.5, 0.03 );
      float g = exp( -dot( h.xy - vec2( bx0, 0.0 ), h.xy - vec2( bx0, 0.0 ) ) / ( br * br ) );
      if ( hx > 0.14 ) g += exp( -dot( h.xy - vec2( -bx0 * 0.1, 0.0 ), h.xy - vec2( -bx0 * 0.1, 0.0 ) ) / ( br * br ) );
      float on = vEmit.r;
      float prism = 0.55 + 0.45 * ( 1.0 - fine * 0.7 * smoothstep( 0.25, 0.5, max( abs( f.x ), abs( f.y ) ) ) );
      vec3 glow = amb > 0.5 ? vec3( 1.0, 0.48, 0.06 ) : vec3( 1.0, 0.045, 0.03 );
      em += ( 1.0 - rev ) * glow * max( on - 0.18 * ( 1.0 - uLights ) * ( 1.0 - amb ), 0.0 ) * prism * ( 0.42 + 3.2 * g );
      // the blinker a cluster carries in itself is the separate amber pane; the stop lamp's hot middle goes orange
      em += ( 1.0 - rev ) * vec3( 1.0, 0.3, 0.1 ) * max( on - 2.0, 0.0 ) * g * 1.2;
    }
    diffuseColor.rgb = vec3( 0.008 );
    thLensAlb = col;
    thLensEmit = em;
    thCabinK = 0.0;
    thCoatK = 0.45; // (the cover mirrors less than a window: at glass strength the sky washes the colour out)
  } else if ( abs( cls - 9.0 ) < 0.5 ) {
    // a door mirror's or the cabin mirror's glass: bright sky over a dark road, the street between
    thCabinK = 0.0;
    diffuseColor.rgb = vec3( 0.01 );
    vec3 rd9 = normalize( p - vCamObj.xyz );
    vec3 r9 = reflect( rd9, normalize( vObjN.xyz ) );
    float y9 = r9.y + 0.05 * sin( r9.x * 37.0 + ph * 40.0 ) * 0.4;
    thLensAlb = mix( vec3( 0.26, 0.25, 0.24 ) + 0.04 * sin( r9.z * 31.0 ), mix( vec3( 0.32, 0.31, 0.3 ), vec3( 0.95, 1.05, 1.15 ), smoothstep( 0.06, 0.24, y9 ) ), smoothstep( -0.04, 0.01, y9 ) );
    thLensEmit = thLensAlb * vec3( 0.0 );
  }
  if ( vCoat > 0.5 && vCoat < 1.5 && vGain < 3.0 ) thCoatK *= 0.55; // satin black trim: its sheen, not a mirror of the sky
${WEAR}
}
#endif
#ifdef VEH_GLASSPASS
{
  vec3 p = vObj.xyz;
  vec3 on = normalize( vObjN.xyz );
  float ph = vObjN.w;
  float cls = floor( vObj.w + 0.5 );
  float belt = vDetA.y, roofY = vDetA.z + 0.07;
  float dirt = thH1( ph * 91.3 );
  dirt = 0.12 + 0.6 * dirt * dirt;
  thCabinK = 0.0;
  thTrans = 0.8;
  vec4 blot = texture2D( tCrack, p.zy * 0.7 + p.x * 0.31 );
  vec4 gr = texture2D( tGrain, ( abs( on.x ) > 0.5 ? p.zy : p.xy + p.zz ) * 2.3 );
  float dust = dirt * ( 0.05 + 0.13 * blot.b + 0.02 * gr.b );
  if ( on.z > 0.3 ) {
    // windscreen: wipers have cleared two fans in the film; a tint band across the top, the black frit round its head
    float fanK = max( vDetA.x / 0.7, 1.0 );
    vec2 q0 = vec2( p.x - 0.32 * fanK, length( vec2( p.y - ( belt - 0.02 ), p.z - ( vDetA.w + 0.04 ) ) ) );
    vec2 q1 = vec2( p.x + 0.18 * fanK, q0.y );
    float r0 = length( q0 ), r1 = length( q1 );
    float fan = max( 1.0 - smoothstep( 0.6, 0.63, r0 / fanK ), 1.0 - smoothstep( 0.6, 0.63, r1 / fanK ) );
    dust *= mix( 1.8, 0.22, fan );
    float y01 = ( p.y - belt ) / max( roofY - belt, 0.1 );
    thTrans *= 1.0 - 0.45 * smoothstep( 0.72, 0.9, y01 );
    float cell = 1.0 - smoothstep( 0.0, 0.03, abs( fract( p.x * 90.0 ) - 0.5 ) - 0.2 * step( 0.5, fract( y01 * 30.0 ) ) );
    float frit = smoothstep( 0.93, 0.945, y01 + 0.02 * cell );
    thTrans *= 1.0 - frit;
    diffuseColor.rgb *= 1.0 - frit;
    // the road tax disc in the passenger's corner, a paper square seen from outside
    vec2 sk = vec2( p.x + vDetA.x * 0.72, y01 - 0.74 );
    if ( abs( sk.x ) < 0.035 && abs( sk.y ) < 0.05 ) {
      thTrans *= 0.05;
      float ring = 1.0 - smoothstep( 0.0, 0.004, abs( length( sk * vec2( 1.0, 0.62 ) ) - 0.02 ) );
      diffuseColor.rgb = mix( vec3( 0.62, 0.66, 0.6 ), vec3( 0.1, 0.25, 0.42 ), ring );
    }
  } else if ( abs( on.x ) > 0.5 ) {
    // side glass: rain has dried in runs under the top seal, the rear panes darker on some
    if ( p.z < vDetB.y && thH1( ph * 17.9 ) > 0.55 && cls < 2.5 ) thTrans *= 0.55;
    dust += dirt * 0.08 * smoothstep( 0.45, 1.0, texture2D( tCrack, vec2( p.z * 1.7, p.y * 0.2 ) ).a ) * smoothstep( belt + 0.3, belt, p.y );
  } else if ( on.z < -0.3 ) {
    // rear window: heater lines, a film below the wiper's reach
    if ( cls < 2.5 ) {
      float yy = fract( p.y * 28.0 );
      thTrans *= 1.0 - 0.3 * ( 1.0 - smoothstep( 0.02, 0.06, abs( yy - 0.5 ) ) ) * ( 1.0 - smoothstep( 0.003, 0.006, length( fwidth( p ) ) ) );
    }
    dust *= 1.8;
  }
  dust = clamp( dust, 0.0, 0.6 );
  // no colour of its own but what lies on it: the sun on a dusty pane shows it, a clean one shows the cabin
  diffuseColor.rgb = vec3( 0.42, 0.39, 0.34 ) * dust;
  thTrans *= 1.0 - dust;
}
#endif
`;

/** after the lights: how the transmission falls with the angle; the alpha is what the cabin keeps (blend: ONE, SRC_ALPHA) */
export const GLASS_FRAG_END = /* glsl */ `
#ifdef VEH_GLASSPASS
{
  float nv = abs( dot( normalize( vViewPosition ), normal ) );
  float fr = pow( 1.0 - nv, 5.0 );
  gl_FragColor.a = clamp( thTrans * ( 1.0 - fr ), 0.0, 1.0 );
}
#endif
`;

/** the dark of a closed cabin: everything indirect, ambient and lamp light alike (after lights_fragment_end) */
export const CLOSE_AO = /* glsl */ `
#ifdef VEH_CLOSE
if ( thCabAO >= 0.0 ) {
  reflectedLight.indirectDiffuse *= thCabAO;
  reflectedLight.indirectSpecular *= thCabAO;
}
#endif
`;
