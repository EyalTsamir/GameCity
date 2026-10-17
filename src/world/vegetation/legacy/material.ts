// FROZEN COPY of the pre-overhaul generators (A/B reference for ?legacyveg). Do not edit; delete with the toggle.
// Wind-sway materials for the merged vegetation meshes.
//
// Every vegetation vertex carries `aWind = (anchorX, anchorZ, flex, flutter)`:
//   anchor  — world xz of the plant's root (phase + gust field lookup, so a whole tree moves as one)
//   flex    — bendiness at this vertex (0 at the trunk base, ≈1 at the top of a 10 m tree);
//             the displacement grows with flex² so trunks stay planted
//   flutter — leaf shimmer amplitude (along the normal, high frequency)
// Gust fronts travel downwind across the city (driven by uniforms.uWind / uTime — deterministic).
// The shadow pass uses a depth material with the same displacement so shadows sway too.

import * as THREE from 'three';
import type { GlobalUniforms } from '../../../core/uniforms';

const PARS = /* glsl */ `
attribute vec4 aWind;
uniform float uTime;
uniform vec2 uWind;
`;

const MAIN = /* glsl */ `
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

function inject(shader: THREE.WebGLProgramParametersWithUniforms, u: GlobalUniforms): void {
  shader.uniforms.uTime = u.uTime;
  shader.uniforms.uWind = u.uWind;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${PARS}`).replace('#include <begin_vertex>', MAIN);
}

export interface WindMaterials {
  mat: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
}

/** Vertex-coloured, matte foliage material with wind sway (+ matching shadow depth material). */
export function windMaterials(u: GlobalUniforms, name: string, roughness = 0.9, kind = 'standard'): WindMaterials {
  const mat =
    kind === 'basic'
      ? (new THREE.MeshBasicMaterial({ vertexColors: true }) as unknown as THREE.MeshStandardMaterial)
      : kind === 'lambert'
        ? (new THREE.MeshLambertMaterial({ vertexColors: true }) as unknown as THREE.MeshStandardMaterial)
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
  mat.name = name;
  mat.onBeforeCompile = (shader) => inject(shader, u);
  mat.customProgramCacheKey = () => `veg-wind-1-${kind}`;
  const depth = new THREE.MeshDepthMaterial();
  depth.name = `${name}-depth`;
  depth.onBeforeCompile = (shader) => inject(shader, u);
  depth.customProgramCacheKey = () => 'veg-wind-depth-1';
  return { mat, depth };
}
