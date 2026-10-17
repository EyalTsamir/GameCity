// One material for every static (or rigidly animated) piece of the railway: track,
// platform, canopy, catenary masts, signals, level-crossing gear. Vertex colours carry the
// paint; `aKind` selects procedural surface detail / emissive behaviour and `aAnim`
// rotates barrier booms and clock hands about their pivots on the GPU — so the whole
// railway infrastructure is a single draw call (+1 shadow draw).

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';

/** aKind codes */
export const K = {
  PLAIN: 0,
  BALLAST: 1,
  LAMP: 2,
  XL0A: 3,
  XL0B: 4,
  XL1A: 5,
  XL1B: 6,
  BOOM0: 7,
  BOOM1: 8,
  PAVING: 9,
  RAILHEAD: 10,
  /** signal i red = SIG + 2i, green = SIG + 2i + 1 (i = 0..3) */
  SIG: 11,
  WINDOW: 19,
  STRIP: 20,
  CLOCK: 21,
  GRAVEL: 22,
  CONCRETE: 23,
  BRICK: 24,
  WOOD: 25,
  TACTILE: 26,
} as const;

/** aAnim codes: ±1 / ±2 barrier boom of crossing 0 / 1 (sign = boom direction along x), ±3 hour, ±4 minute hand (sign = face normal along z) */
export const ANIM = { BOOM0: 1, BOOM1: 2, HOUR: 3, MINUTE: 4 } as const;

export interface RailStaticUniforms {
  /** flash0, flash1, gate0, gate1 */
  uXing: { value: THREE.Vector4 };
  /** signal aspects (0 red, 1 green) */
  uSig: { value: THREE.Vector4 };
  /** hour-hand angle, minute-hand angle (radians, clockwise from 12) */
  uClock: { value: THREE.Vector2 };
}

const ANIM_GLSL = /* glsl */ `
attribute float aKind;
attribute vec4 aAnim;
uniform vec4 uXing;
uniform vec2 uClock;
float rlAngle() {
  float c = aAnim.x;
  float a = abs(c);
  if (a < 0.5) return 0.0;
  float sg = sign(c);
  if (a < 1.5) return sg * (1.0 - uXing.z) * 1.5359;
  if (a < 2.5) return sg * (1.0 - uXing.w) * 1.5359;
  if (a < 3.5) return -sg * uClock.x;
  return -sg * uClock.y;
}
vec3 rlRotZ(vec3 p, float ang) {
  float c = cos(ang), s = sin(ang);
  return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}
`;

const VERT_PARS = /* glsl */ `
${ANIM_GLSL}
varying float vKind;
varying vec3 vWPos;
`;

const FRAG_PARS = /* glsl */ `
uniform float uTime;
uniform float uLights;
uniform vec4 uXing;
uniform vec4 uSig;
varying float vKind;
varying vec3 vWPos;
float rlHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float rlNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = rlHash(i), b = rlHash(i + vec2(1.0, 0.0)), c = rlHash(i + vec2(0.0, 1.0)), d = rlHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const FRAG_COLOR = /* glsl */ `
{
  int rk = int(vKind + 0.5);
  vec2 wp = vWPos.xz;
  float fw = max(fwidth(wp.x), fwidth(wp.y));
  if (rk == ${K.BALLAST} || rk == ${K.GRAVEL}) {
    float sc = rk == ${K.BALLAST} ? 9.0 : 14.0;
    float g = rlHash(floor(wp * sc));
    float g2 = rlNoise(wp * 1.3);
    float amp = 1.0 - smoothstep(0.03, 0.14, fw);
    diffuseColor.rgb *= mix(1.0, 0.72 + 0.5 * g, amp * 0.85) * (0.9 + 0.2 * g2);
  } else if (rk == ${K.PAVING}) {
    vec2 t = fract(wp / vec2(0.9, 0.6));
    vec2 e = min(t, 1.0 - t) * vec2(0.9, 0.6);
    float j = 1.0 - smoothstep(0.012, 0.03, min(e.x, e.y));
    float amp = 1.0 - smoothstep(0.02, 0.06, fw);
    float tile = rlHash(floor(wp / vec2(0.9, 0.6)));
    diffuseColor.rgb *= (1.0 - 0.16 * j * amp) * (0.96 + 0.06 * tile);
  } else if (rk == ${K.CONCRETE}) {
    diffuseColor.rgb *= 0.93 + 0.1 * rlNoise(wp * 2.1) + 0.04 * rlNoise(wp * 9.0);
  } else if (rk == ${K.BRICK}) {
    // brick courses on vertical faces (u = along the face, v = height)
    float u = vWPos.x + vWPos.z;
    float v = vWPos.y;
    float row = floor(v / 0.075);
    float off = mod(row, 2.0) * 0.11;
    vec2 bt = vec2(fract((u + off) / 0.22), fract(v / 0.075));
    vec2 be = min(bt, 1.0 - bt) * vec2(0.22, 0.075);
    float mortar = 1.0 - smoothstep(0.004, 0.011, min(be.x, be.y));
    float amp = 1.0 - smoothstep(0.015, 0.05, max(fw, fwidth(v)));
    float bh = rlHash(vec2(floor((u + off) / 0.22), row));
    diffuseColor.rgb *= 0.88 + 0.22 * bh * amp;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.74, 0.68), mortar * amp * 0.8);
  } else if (rk == ${K.WOOD}) {
    diffuseColor.rgb *= 0.86 + 0.24 * rlNoise(vec2(wp.x * 30.0, wp.y * 1.5));
  } else if (rk == ${K.TACTILE}) {
    vec2 t = fract(wp / 0.1) - 0.5;
    float dot1 = 1.0 - smoothstep(0.18, 0.28, length(t));
    float amp = 1.0 - smoothstep(0.01, 0.03, fw);
    diffuseColor.rgb *= 1.0 - 0.18 * dot1 * amp;
  }
}
`;

const FRAG_EMIT = /* glsl */ `
{
  int rk = int(vKind + 0.5);
  vec3 em = vec3(0.0);
  if (rk == ${K.LAMP}) {
    em = vec3(1.0, 0.78, 0.48) * (0.05 + 2.6 * uLights);
  } else if (rk == ${K.STRIP}) {
    em = vec3(1.0, 0.93, 0.8) * (0.02 + 2.2 * uLights);
  } else if (rk == ${K.WINDOW}) {
    em = vec3(1.0, 0.82, 0.55) * (1.4 * uLights);
  } else if (rk == ${K.CLOCK}) {
    em = vec3(1.0, 0.97, 0.9) * (0.75 * uLights);
  } else if (rk >= ${K.XL0A} && rk <= ${K.XL1B}) {
    float fl = rk <= ${K.XL0B} ? uXing.x : uXing.y;
    float ph = (rk == ${K.XL0A} || rk == ${K.XL1A}) ? 0.0 : 0.5;
    float on = step(0.5, fract(uTime * 0.95 + ph)) * fl;
    em = vec3(1.0, 0.08, 0.03) * (0.25 + 6.0 * on);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.03, 0.02), 0.6);
  } else if (rk == ${K.BOOM0} || rk == ${K.BOOM1}) {
    float fl = rk == ${K.BOOM0} ? uXing.x : uXing.y;
    float gt = rk == ${K.BOOM0} ? uXing.z : uXing.w;
    float on = fl * step(0.02, gt) * (0.6 + 0.4 * step(0.5, fract(uTime * 0.95)));
    em = vec3(1.0, 0.1, 0.04) * (0.1 + 3.2 * on);
  } else if (rk >= ${K.SIG} && rk < ${K.SIG + 8}) {
    int si = (rk - ${K.SIG}) / 2;
    bool green = ((rk - ${K.SIG}) - si * 2) == 1;
    float asp = si == 0 ? uSig.x : (si == 1 ? uSig.y : (si == 2 ? uSig.z : uSig.w));
    float on = green ? asp : 1.0 - asp;
    vec3 c = green ? vec3(0.1, 1.0, 0.45) : vec3(1.0, 0.1, 0.05);
    em = c * (0.06 + on * (1.6 + 2.4 * uLights));
    diffuseColor.rgb *= 0.25;
  }
  totalEmissiveRadiance += em;
}
`;

export function createRailStaticMaterial(
  globals: GlobalUniforms,
  shared?: RailStaticUniforms,
  polygonOffset = false,
): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial; uniforms: RailStaticUniforms } {
  const uniforms: RailStaticUniforms = shared ?? {
    uXing: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSig: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClock: { value: new THREE.Vector2(0, 0) },
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.0 });
  if (polygonOffset) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -6;
  }
  material.name = 'rail-static';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uLights = globals.uLights;
    shader.uniforms.uXing = uniforms.uXing;
    shader.uniforms.uSig = uniforms.uSig;
    shader.uniforms.uClock = uniforms.uClock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nfloat rlA = rlAngle();\nif (rlA != 0.0) objectNormal = rlRotZ(objectNormal, rlA);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (rlA != 0.0) transformed = aAnim.yzw + rlRotZ(transformed - aAnim.yzw, rlA);')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvKind = aKind;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMIT}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        { int rk = int(vKind + 0.5); if (rk == ${K.RAILHEAD}) roughnessFactor = 0.32; }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        { int rk = int(vKind + 0.5); if (rk == ${K.RAILHEAD}) metalnessFactor = 0.65; }`,
      );
  };
  material.customProgramCacheKey = () => 'rail-static-v1';

  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'rail-static-depth';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uXing = uniforms.uXing;
    shader.uniforms.uClock = uniforms.uClock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ANIM_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float rlA = rlAngle(); if (rlA != 0.0) transformed = aAnim.yzw + rlRotZ(transformed - aAnim.yzw, rlA); }');
  };
  depth.customProgramCacheKey = () => 'rail-static-depth-v1';
  return { material, depth, uniforms };
}
