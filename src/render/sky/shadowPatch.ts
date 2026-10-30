// One-time patch of three's shadow-map chunk (applied by the sky module before any
// material compiles): shadows fade out smoothly near the border of the shadow camera
// instead of ending in a hard line. The sun's shadow frustum is fitted around the
// camera focus, so this border always lies in the distance (where the tilt-shift
// blur is strong) and the transition becomes invisible.
//
// Only the 2D getShadow() used by directional & spot lights is touched; point-light
// cube shadows are left unchanged.

import * as THREE from 'three';
import { perfOn } from '../../core/perfdeep';

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
  if (perfOn('shadowfast')) out = fastTaps(out);
  chunks[key] = out;
  if (perfOn('shadowfast')) chunks.lights_fragment_begin = gateBackfacing(chunks.lights_fragment_begin);
  patched = true;
  return true;
}

/**
 * Same five samples, cheaper (perf-deep, ?noshadowfast): the disk is rotated once (2 trig calls instead of 10, 5 sqrt
 * folded into constants), and the taps use the level-0 fetch: the map has no mips, so the result is identical, but
 * the implicit-gradient form forces the D3D compiler to flatten every enclosing branch — all taps ran on every pixel,
 * also outside the shadow frustum and on the faces turned away from the sun.
 */
function fastTaps(src: string): string {
  const G = 2.399963229728653;
  let taps = '';
  let decl = '';
  for (let i = 0; i < 5; i++) {
    const r = Math.sqrt((i + 0.5) / 5);
    const x = (Math.cos(i * G) * r).toFixed(8),
      y = (Math.sin(i * G) * r).toFixed(8);
    decl += `\t\t\t\tvec2 thTap${i} = vec2( ${x} * thRc - ${y} * thRs, ${x} * thRs + ${y} * thRc ) * radius;\n`;
    taps += `${i ? ' +\n' : ''}\t\t\t\t\ttextureLod( shadowMap, vec3( shadowCoord.xy + thTap${i}, shadowCoord.z ), 0.0 )`;
  }
  const a = src.indexOf('shadow = (', src.indexOf('float getShadow( sampler2DShadow'));
  const b = src.indexOf(') * 0.2;', a);
  if (a < 0 || b < 0) return src;
  return src.slice(0, a) + `float thRc = cos( phi ), thRs = sin( phi );\n${decl}\t\t\t\tshadow = (\n${taps}\n\t\t\t\t` + src.slice(b);
}

/**
 * Skip the shadow lookup on faces turned away from the light: their direct term is exactly 0. Materials with a wrapped
 * or translucent RE_Direct (leaves, grass, cloth, figures, tree-lit ground) light those faces, they define
 * TH_LIGHT_WRAPS and keep the lookup.
 */
function gateBackfacing(src: string): string {
  const old = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  if (!src.includes(old)) return src;
  const call = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  return src.replace(
    old,
    `#ifdef TH_LIGHT_WRAPS
		directLight.color *= ( directLight.visible && receiveShadow ) ? ${call} : 1.0;
		#else
		if ( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) directLight.color *= ${call};
		#endif`,
  );
}
