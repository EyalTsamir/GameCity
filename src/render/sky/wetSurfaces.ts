// Everything in town gets wet in the rain: one global patch of three's physical material chunk (`?nowetfacade`): when
// wet, a surface darkens and turns glossy. Facing up it is fully wet, walls in rain-washed bands that run down them,
// undersides stay dry. The gate is one uniform: dry weather pays a compare per fragment. Materials with their own wet
// model (asphalt, paving, water) `#define TH_NO_WET`.
//
// The uniform is one shared typed array (three keeps typed arrays by reference when it clones uniforms, as for thAtmo).

import * as THREE from 'three';

/** x wetness 0..1 */
export const wetData = new Float32Array(4);

const PARS = /* glsl */ `
#ifndef TH_NO_WET
uniform vec4 thWet[1];
#endif
`;

const APPLY = /* glsl */ `
#ifndef TH_NO_WET
if (thWet[0].x > 0.002) {
  mat3 thWm = mat3(viewMatrix);
  vec3 thWn = transpose(thWm) * normal;
  vec3 thWp = transpose(thWm) * (-vViewPosition - viewMatrix[3].xyz);
  // walls: bands of run-off, wandering a little on their way down
  float thWs = 0.5 + 0.5 * sin(thWp.x * 2.3 + thWp.z * 1.9 + 1.7 * sin(thWp.y * 0.35 + (thWp.x + thWp.z) * 0.9));
  float thWk = thWet[0].x * mix(0.45 + 0.55 * thWs, 1.0, smoothstep(0.2, 0.75, thWn.y)) * smoothstep(-0.6, -0.1, thWn.y);
  material.diffuseColor *= 1.0 - 0.4 * thWk;
  material.roughness = mix(material.roughness, max(0.16, material.roughness * 0.42), thWk);
}
#endif
`;

let patched = false;

/** call before any material compiles */
export function patchWetChunk(): boolean {
  if (patched) return true;
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  if (typeof chunks.lights_physical_fragment !== 'string' || typeof chunks.lights_physical_pars_fragment !== 'string') return false;
  chunks.lights_physical_pars_fragment = PARS + chunks.lights_physical_pars_fragment;
  chunks.lights_physical_fragment = chunks.lights_physical_fragment + APPLY;
  const lib = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>;
  for (const k of ['standard', 'physical']) if (lib[k]) lib[k].uniforms.thWet = { value: wetData };
  patched = true;
  return true;
}
