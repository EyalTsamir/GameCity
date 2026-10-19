// One grass palette for the blades AND the ground shader, so the far field (ground only) shows the
// average colour of the near field (blades) and the hand-over is invisible.
//
// Colours are sRGB hex here (THREE.Color converts to linear); the uniform objects are shared by every
// material that includes GC_PALETTE_GLSL (ground + blade rings), so a tweak from the console
// (`__city.ctx.services.groundcover.palette.gcLawnSun.value.set('#…')`) updates all of them at once.
//
// GLSL (needs the gc* uniforms below):
//   vec3 gcGrassColor(vec4 nM, vec4 nA, float len, float wet, float dune)  base (mid-blade) colour
//   vec3 gcTipColor(vec3 base, vec4 nA, float len)                       tip colour
//   vec3 gcTopColor(vec3 base, vec3 tip, float len)                      what the eye sees from above
// nM = tNoise(xz · 0.0031) (macro ~40/20/10/5 m), nA = tNoise(xz · 0.0104) (~12/6/3/1.5 m).

import * as THREE from 'three';

const C = (h: string) => ({ value: new THREE.Color(h) });

export function createPalette() {
  return {
    // mown lawns: deep blue-green ↔ sunny yellow-green ↔ dry, never lime
    gcLawnLush: C('#4d7a38'),
    gcLawnSun: C('#7e9a45'),
    gcLawnDry: C('#a29e60'),
    // long grass / meadows: green ↔ olive, straw where dry or in seed
    gcMeadowA: C('#68833e'),
    gcMeadowB: C('#86894a'),
    gcStraw: C('#c3ae78'),
    // damp shore grass, reeds, dune marram
    gcWet: C('#47703f'),
    gcReed: C('#5b7a4a'),
    gcMarram: C('#97a27c'),
    // shaded thatch between the blades (roots, under the near rings)
    gcThatch: C('#3d3a26'),
  };
}

export type GcPalette = ReturnType<typeof createPalette>;

let shared: GcPalette | null = null;
/** the single palette instance shared by the ground and the blade materials */
export function gcPalette(): GcPalette {
  if (!shared) shared = createPalette();
  return shared;
}

export const GC_PALETTE_GLSL = /* glsl */ `
uniform vec3 gcLawnLush;
uniform vec3 gcLawnSun;
uniform vec3 gcLawnDry;
uniform vec3 gcMeadowA;
uniform vec3 gcMeadowB;
uniform vec3 gcStraw;
uniform vec3 gcWet;
uniform vec3 gcReed;
uniform vec3 gcMarram;
uniform vec3 gcThatch;

vec3 gcLawnColor( vec4 nM, vec4 nA ) {
  float macro = nM.r * 0.5 + nM.g * 0.3 + nA.r * 0.2;
  vec3 c = mix( gcLawnSun, gcLawnLush, smoothstep( 0.36, 0.64, macro ) );
  c = mix( c, gcLawnDry, smoothstep( 0.6, 0.86, nM.b * 0.6 + nA.g * 0.4 ) * 0.4 );
  return c;
}
vec3 gcMeadowColor( vec4 nM, vec4 nA ) {
  vec3 c = mix( gcMeadowA, gcMeadowB, smoothstep( 0.3, 0.7, nA.g * 0.6 + nM.a * 0.4 ) );
  c = mix( c, gcStraw, smoothstep( 0.55, 0.85, nA.r * 0.6 + nM.b * 0.4 ) * 0.45 );
  return c;
}
vec3 gcGrassColor( vec4 nM, vec4 nA, float len, float wet, float dune ) {
  vec3 c = mix( gcLawnColor( nM, nA ), gcMeadowColor( nM, nA ), smoothstep( 0.2, 0.55, len ) );
  c = mix( c, gcWet, wet * 0.65 );
  c = mix( c, gcMarram, dune );
  return c;
}
vec3 gcTipColor( vec3 base, vec4 nA, float len ) {
  vec3 t = base * vec3( 1.2, 1.15, 0.98 );
  return mix( t, gcStraw, smoothstep( 0.42, 0.9, len ) * ( 0.22 + 0.45 * nA.b ) );
}
vec3 gcTopColor( vec3 base, vec3 tip, float len ) {
  // seen from above: mostly upper blades, a little shaded thatch in the gaps (more in long grass)
  return mix( base, tip, 0.5 ) * mix( 0.93, 0.84, smoothstep( 0.2, 0.7, len ) );
}
`;
