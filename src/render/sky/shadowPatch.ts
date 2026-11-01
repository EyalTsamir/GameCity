// One-time patch of three's shadow-map chunk (applied by the sky module before any
// material compiles): shadows fade out smoothly near the border of the shadow camera
// instead of ending in a hard line. The sun's shadow frustum is fitted around the
// camera focus, so this border always lies in the distance (where the tilt-shift
// blur is strong) and the transition becomes invisible.
//
// Only the 2D getShadow() used by directional & spot lights is touched; point-light
// cube shadows are left unchanged.

import * as THREE from 'three';
import { closeLightOn } from '../../core/closelight';

let patched = false;

export function patchShadowChunk(): boolean {
  if (patched) return true;
  const key = 'shadowmap_pars_fragment';
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunks[key];
  if (typeof src !== 'string') return false;
  const start = src.indexOf('float getShadow( sampler2DShadow');
  if (start < 0) return false;
  const ret = 'return mix( 1.0, shadow, shadowIntensity );';
  const at = src.indexOf(ret, start);
  if (at < 0) return false;
  const fade =
    'vec2 tsEdge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );\n' +
    '\t\t\tfloat tsFade = smoothstep( 0.0, 0.07, min( tsEdge.x, tsEdge.y ) );\n' +
    '\t\t\treturn mix( 1.0, shadow, shadowIntensity * tsFade );';
  let out = src.slice(0, at) + fade + src.slice(at + ret.length);
  if (closeLightOn('shadowclean')) out = cleanFilter(out, start);
  chunks[key] = out;
  patched = true;
  return true;
}

// three rotates a 5-tap disc by per-pixel noise: at walking distance, where a texel covers many pixels, that noise is a woven
// halftone along every sun-shadow edge. Instead four hardware-filtered taps placed and weighted to make a tent 3 texels wide
// (Castaño's optimised PCF, as in The Witness): the same softness with no pattern, for one tap less. `shadowRadius` keeps
// its meaning: the spacing follows it within the range where the tent stays smooth. ?noshadowclean = three's disc.
function cleanFilter(src: string, start: number): string {
  const a = src.indexOf('vec2 texelSize = vec2( 1.0 ) / shadowMapSize;', start);
  const endMark = ') * 0.2;';
  const b = src.indexOf(endMark, a);
  if (a < 0 || b < 0) return src;
  const tent = /* glsl */ `
				vec2 tsUv = shadowCoord.xy * shadowMapSize;
				vec2 tsBase = floor( tsUv + 0.5 );
				vec2 tsF = tsUv + 0.5 - tsBase;
				vec2 tsW0 = 3.0 - 2.0 * tsF;
				vec2 tsW1 = 1.0 + 2.0 * tsF;
				float tsK = clamp( shadowRadius / 1.5, 0.7, 1.0 );
				// tap offsets from the point, in texels
				vec2 tsD = tsBase - 0.5 - tsUv;
				vec2 tsO0 = ( tsD + ( 2.0 - tsF ) / tsW0 - 1.0 ) * tsK / shadowMapSize;
				vec2 tsO1 = ( tsD + tsF / tsW1 + 1.0 ) * tsK / shadowMapSize;
				shadow = (
					tsW0.x * tsW0.y * texture( shadowMap, vec3( shadowCoord.xy + vec2( tsO0.x, tsO0.y ), shadowCoord.z ) ) +
					tsW1.x * tsW0.y * texture( shadowMap, vec3( shadowCoord.xy + vec2( tsO1.x, tsO0.y ), shadowCoord.z ) ) +
					tsW0.x * tsW1.y * texture( shadowMap, vec3( shadowCoord.xy + vec2( tsO0.x, tsO1.y ), shadowCoord.z ) ) +
					tsW1.x * tsW1.y * texture( shadowMap, vec3( shadowCoord.xy + vec2( tsO1.x, tsO1.y ), shadowCoord.z ) )
				) / 16.0;`;
  return src.slice(0, a) + tent + src.slice(b + endMark.length);
}
