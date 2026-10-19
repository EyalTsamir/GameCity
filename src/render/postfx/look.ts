// Final "look" effect: tone mapping (AgX, exposure = renderer.toneMappingExposure),
// gentle painted-model grade (saturation, soft S-curve, warm highlights / cool
// shadows, lifted matte blacks) and a soft vignette — all in one shader pass.

import * as THREE from 'three';
import { Effect } from 'postprocessing';

/**
 * NaN/Inf guard for scene colour (GLSL). One bad pixel from any material must never spread: the
 * bloom mip chain and the tilt-shift blur would smear it into big black blocks. min/max first
 * (they return the non-NaN operand on D3D/most GPUs), isnan/isinf as the explicit test.
 */
export const SAFE_COLOR_GLSL = /* glsl */ `
vec3 thSafeColor(vec3 c) {
#ifdef TH_NAN_VIZ
  // ?nanviz: flag bad pixels magenta (tested BEFORE the clamp so they cannot hide)
  if (any(isnan(c)) || any(isinf(c)) || any(greaterThan(c, vec3(64000.0)))) return vec3(40.0, 0.0, 40.0);
#endif
  c = min(max(c, vec3(0.0)), vec3(64000.0));
  return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : c;
}
`;

/**
 * AgX with an ASC-CDL "look" in AgX log space (after the sigmoid, before the outset — where Blender /
 * Filament put agxLook; three.js leaves it out). Same constants and steps as three's AgXToneMapping.
 * Golden: slope (1, 0.9, 0.5), power 0.8, sat 0.8; neutral = slope 1, power 1, sat 1.
 */
const AGX_LOOK_GLSL = /* glsl */ `
uniform vec3 uLookSlope;
uniform float uLookPower;
uniform float uLookSat;
vec3 thAgX(vec3 color) {
  const mat3 AgXInsetMatrix = mat3(
    vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 AgXOutsetMatrix = mat3(
    vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float AgxMinEv = -12.47393;
  const float AgxMaxEv = 4.026069;
  color *= toneMappingExposure;
  color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
  color = AgXInsetMatrix * color;
  color = max(color, 1e-10);
  color = log2(color);
  color = (color - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  color = clamp(color, 0.0, 1.0);
  color = agxDefaultContrastApprox(color);
  // look (ASC CDL)
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = pow(max(color * uLookSlope, vec3(0.0)), vec3(uLookPower));
  color = luma + uLookSat * (color - luma);
  color = AgXOutsetMatrix * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
  return clamp(color, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
#include <tonemapping_pars_fragment>
${SAFE_COLOR_GLSL}
#ifdef TH_WORLD_LOOK
${AGX_LOOK_GLSL}
#endif
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform float uVigStart;
uniform float uWarm;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = thSafeColor(inputColor.rgb);
  // white-balance nudge (warm by day, cool by night) before the curve
  c *= vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
#ifdef TH_WORLD_LOOK
  c = thAgX(c);
#else
  c = TONE_FN(c);
#endif
  vec3 g = pow(c, vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g += uShadowTint * (1.0 - smoothstep(0.05, 0.55, l)) + uHighTint * smoothstep(0.45, 1.0, l);
  l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, uSat);
  g = clamp(g, 0.0, 1.0);
  g = mix(g, g * g * (3.0 - 2.0 * g), uContrast);
  g = uLift + g * (1.0 - uLift);
  vec2 d = (uv - 0.5) * vec2(aspect, 1.0);
  float v = smoothstep(uVigStart, uVigStart + 0.75, length(d));
  g *= 1.0 - v * uVignette;
  outputColor = vec4(pow(max(g, vec3(0.0)), vec3(2.2)), inputColor.a);
}
`;

export class LookEffect extends Effect {
  /** @param worldLook AgX with a time-of-day CDL look (world mode); false = three's tone map (diorama) */
  constructor(toneMapping: THREE.ToneMapping, nanViz = false, worldLook = false) {
    const fn = toneMapping === THREE.ACESFilmicToneMapping ? 'ACESFilmicToneMapping' : toneMapping === THREE.NeutralToneMapping ? 'NeutralToneMapping' : 'AgXToneMapping';
    const defines = new Map([['TONE_FN', fn]]);
    if (nanViz) defines.set('TH_NAN_VIZ', '1');
    if (worldLook && toneMapping === THREE.AgXToneMapping) defines.set('TH_WORLD_LOOK', '1');
    super('LookEffect', FRAG, {
      defines,
      uniforms: new Map<string, THREE.Uniform>([
        ['uSat', new THREE.Uniform(1.18)],
        ['uContrast', new THREE.Uniform(0.22)],
        ['uLift', new THREE.Uniform(new THREE.Vector3(0.018, 0.02, 0.03))],
        ['uShadowTint', new THREE.Uniform(new THREE.Vector3(-0.01, 0.0, 0.018))],
        ['uHighTint', new THREE.Uniform(new THREE.Vector3(0.016, 0.006, -0.012))],
        ['uVignette', new THREE.Uniform(0.28)],
        ['uVigStart', new THREE.Uniform(0.42)],
        ['uWarm', new THREE.Uniform(0.0)],
        ['uLookSlope', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['uLookPower', new THREE.Uniform(1.0)],
        ['uLookSat', new THREE.Uniform(1.0)],
      ]),
    });
  }
  set(name: string, value: number): void {
    const u = this.uniforms.get(name);
    if (u) u.value = value;
  }
  setVec(name: string, x: number, y: number, z: number): void {
    const u = this.uniforms.get(name);
    if (u && (u.value as THREE.Vector3).isVector3) (u.value as THREE.Vector3).set(x, y, z);
  }
}
