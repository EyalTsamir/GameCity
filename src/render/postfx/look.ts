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
  c = min(max(c, vec3(0.0)), vec3(64000.0));
  return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : c;
}
`;

const FRAG = /* glsl */ `
#include <tonemapping_pars_fragment>
${SAFE_COLOR_GLSL}
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
  c = TONE_FN(c);
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
  constructor(toneMapping: THREE.ToneMapping) {
    const fn = toneMapping === THREE.ACESFilmicToneMapping ? 'ACESFilmicToneMapping' : toneMapping === THREE.NeutralToneMapping ? 'NeutralToneMapping' : 'AgXToneMapping';
    super('LookEffect', FRAG, {
      defines: new Map([['TONE_FN', fn]]),
      uniforms: new Map<string, THREE.Uniform>([
        ['uSat', new THREE.Uniform(1.18)],
        ['uContrast', new THREE.Uniform(0.22)],
        ['uLift', new THREE.Uniform(new THREE.Vector3(0.018, 0.02, 0.03))],
        ['uShadowTint', new THREE.Uniform(new THREE.Vector3(-0.01, 0.0, 0.018))],
        ['uHighTint', new THREE.Uniform(new THREE.Vector3(0.016, 0.006, -0.012))],
        ['uVignette', new THREE.Uniform(0.28)],
        ['uVigStart', new THREE.Uniform(0.42)],
        ['uWarm', new THREE.Uniform(0.0)],
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
