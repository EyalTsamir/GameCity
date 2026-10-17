// Night street-light illumination shared by every ground / facade / foliage shader.
//
// Contract (stable — other modules rely on these names):
//   • Static light sources (street + path lamps, plaza lights, quay / stadium floodlights, shop
//     windows spilling onto the pavement…) are registered with addLampLights() while modules are
//     created. Registering is cheap and has no effect by itself.
//   • The "lamps" module (src/world/lamps.ts) bakes the registry once, after 'modules:ready', into
//     a top-down light map stored in globalUniforms.uLampMap (+ uLampXf), and eases
//     globalUniforms.uLampGain with the street lights. Until then the map is black and the gain 0,
//     so integrating the GLSL below is always safe.
//   • A material integrates it by merging lampUniforms() into its shader uniforms, adding
//     LAMP_GLSL to the fragment pars, and adding  albedo * thLampLight(worldPos, worldNormal)
//     to the outgoing radiance — for MeshStandard/Lambert-based shaders after
//     `#include <lights_fragment_end>`:
//         reflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vThWorldPos, thWorldNormal);
//     (worldPos/worldNormal in world space; how a shader obtains them is up to the shader).
//
// thLampLight returns linear irradiance-like light (already scaled by uLampGain): multiply by the
// surface albedo, never add it unmodulated (that is what made the old additive pools look like
// grey stickers).

import { globalUniforms } from './uniforms';

export type LampKind = 'street' | 'path' | 'plaza' | 'flood' | 'spill' | 'portal';

export interface LampLight {
  /** light head position (world, m) */
  x: number;
  y: number;
  z: number;
  /** reach of the pool on the ground (m) */
  radius: number;
  /** sRGB hex colour (e.g. '#ffc979') */
  color: string;
  /** relative strength (street lamp ≈ 1) */
  intensity: number;
  kind: LampKind;
  /** elongated pools (e.g. floodlights, shop spill): stretch along local x and yaw (rad) */
  stretch?: number;
  yaw?: number;
}

const registry: LampLight[] = [];

/** Register static light sources for the night light map (call during module creation). */
export function addLampLights(list: readonly LampLight[]): void {
  for (const l of list) registry.push(l);
}

/** Everything registered so far (read by the lamps module when it bakes). */
export function lampLights(): readonly LampLight[] {
  return registry;
}

/** Uniforms to merge into a shader that uses LAMP_GLSL (shared objects: one update drives all). */
export function lampUniforms(): { uLampMap: typeof globalUniforms.uLampMap; uLampXf: typeof globalUniforms.uLampXf; uLampGain: typeof globalUniforms.uLampGain } {
  return { uLampMap: globalUniforms.uLampMap, uLampXf: globalUniforms.uLampXf, uLampGain: globalUniforms.uLampGain };
}

/**
 * Fragment chunk. Declares its own uniforms (guarded against double inclusion) and
 *   vec3 thLampLight(vec3 worldPos, vec3 worldNormal)
 * The map stores ground-level irradiance in rgb and the mean light-head height (/16 m) in a;
 * the lamps module owns the exact encoding and may refine this function without changing its
 * signature.
 */
export const LAMP_GLSL = /* glsl */ `
#ifndef TH_LAMP_GLSL
#define TH_LAMP_GLSL
uniform sampler2D uLampMap;
uniform vec4 uLampXf;
uniform float uLampGain;
vec3 thLampLight(vec3 wp, vec3 wn) {
  if (uLampGain <= 0.001) return vec3(0.0);
  vec2 uv = (wp.xz - uLampXf.xy) * uLampXf.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec3(0.0);
  vec4 m = texture2D(uLampMap, uv);
  float headY = m.a * 16.0;
  // surfaces above the light heads only catch a little spill; walls facing up/sideways both receive
  float above = clamp((wp.y - headY) / max(headY, 1.0), 0.0, 1.5);
  float facing = mix(0.55, 1.0, clamp(wn.y * 0.5 + 0.5, 0.0, 1.0));
  return m.rgb * uLampGain * facing / (1.0 + above * above * 6.0);
}
#endif
`;
