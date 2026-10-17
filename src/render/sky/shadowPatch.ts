// One-time patch of three's shadow-map chunk (applied by the sky module before any
// material compiles): shadows fade out smoothly near the border of the shadow camera
// instead of ending in a hard line. The sun's shadow frustum is fitted around the
// camera focus, so this border always lies in the distance (where the tilt-shift
// blur is strong) and the transition becomes invisible.
//
// Only the 2D getShadow() used by directional & spot lights is touched; point-light
// cube shadows are left unchanged.

import * as THREE from 'three';

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
  chunks[key] = src.slice(0, at) + fade + src.slice(at + ret.length);
  patched = true;
  return true;
}
