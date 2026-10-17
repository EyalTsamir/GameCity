// Shared material for all rolling stock (one InstancedMesh per car type). Per-vertex tags
// (aKind) + per-instance data drive:
//   * livery / container colours (instanceColor, aCol2) on tagged parts only
//   * wheel rotation about each axle (aExtra.xy = axle y, z) by aInst.x
//   * sliding doors on the platform side (aExtra.z = slide dir, aExtra.w = side) by aInst.z
//   * container load variants (40 ft / 2×20 ft / one 20 ft / empty) via aInst2.x
//   * emissive: lit windows at night, head lights (leading end), tail lights (trailing end),
//     destination display
//   * tunnel clip: fragments beyond the bore ends are discarded (uClip.x .. uClip.y in world x)

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';

export const T = {
  PLAIN: 0,
  LIVERY: 1,
  WHEEL: 2,
  DOOR: 3,
  WINDOW: 4,
  HEAD: 5,
  TAIL: 6,
  DEST: 7,
  CONT40: 8,
  CONT20A: 9,
  CONT20B: 10,
  DOORWIN: 11,
  GLASS: 12,
  /** container corrugated faces (same visibility as CONT*, plus ribs) handled via CONT tags */
} as const;

const VERT_PARS = /* glsl */ `
attribute float aKind;
attribute vec4 aExtra;
attribute vec4 aInst;
attribute vec4 aInst2;
attribute vec3 aCol2;
uniform float uLights;
uniform float uTime;
varying vec3 vEmit;
varying float vWX;
varying vec3 vLoc;
varying float vTagF;
vec3 trWheel(vec3 p) {
  float c = cos(aInst.x), s = sin(aInst.x);
  vec2 q = p.yz - aExtra.xy;
  return vec3(p.x, aExtra.x + q.x * c - q.y * s, aExtra.y + q.x * s + q.y * c);
}
bool trHidden(int tg) {
  int load = int(aInst2.x + 0.5);
  if (tg == ${T.CONT40}) return load != 0;
  if (tg == ${T.CONT20A}) return !(load == 1 || load == 2);
  if (tg == ${T.CONT20B}) return load != 1;
  return false;
}
int trTagOf(float k) { int r = int(k + 0.5); return r - (r / 100) * 100; }
bool trVariantHidden(float k) {
  int vm = int(k + 0.5) / 100;
  if (vm == 1) return aInst2.z < 0.5;
  if (vm == 2) return aInst2.z > 0.5;
  return false;
}
`;

const VERT_COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
  vColor *= color;
#elif defined( USE_COLOR )
  vColor.rgb *= color;
#endif
{
  int tg = trTagOf(aKind);
  #ifdef USE_INSTANCING_COLOR
  if (tg == ${T.LIVERY} || tg == ${T.CONT40} || tg == ${T.CONT20A}) vColor.rgb *= instanceColor.rgb;
  #endif
  if (tg == ${T.CONT20B}) vColor.rgb *= aCol2;
}
`;

const VERT_BEGIN = /* glsl */ `
{
  int tg = trTagOf(aKind);
  if (tg == ${T.WHEEL}) transformed = trWheel(transformed);
  if ((tg == ${T.DOOR} || tg == ${T.DOORWIN}) && abs(aExtra.w - aInst.w) < 0.5) {
    float o = clamp(aInst.z, 0.0, 1.0);
    transformed.z += aExtra.z * 0.64 * smoothstep(0.15, 1.0, o);
    transformed.x += aExtra.w * 0.035 * smoothstep(0.0, 0.2, o);
  }
  if (trHidden(tg) || trVariantHidden(aKind)) transformed = vec3(0.0);
  vLoc = position;
  vTagF = aKind;
  int role = int(aInst.y + 0.5);
  float lit = uLights;
  vec3 e = vec3(0.0);
  if (tg == ${T.WINDOW} || tg == ${T.DOORWIN}) e = vec3(1.0, 0.8, 0.52) * (1.7 * lit) * aInst2.y;
  else if (tg == ${T.HEAD} && role == 1) e = vec3(1.0, 0.95, 0.85) * (0.9 + 4.0 * lit);
  else if (tg == ${T.TAIL} && role == 2) e = vec3(1.0, 0.07, 0.03) * (0.7 + 2.6 * lit);
  else if (tg == ${T.DEST} && role == 1) e = vec3(1.0, 0.62, 0.16) * (0.9 + 0.6 * lit);
  vEmit = e;
}
`;

const FRAG_PARS = /* glsl */ `
uniform vec2 uClip;
varying vec3 vEmit;
varying float vWX;
varying vec3 vLoc;
varying float vTagF;
`;

export interface TrainMaterials {
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  clip: { value: THREE.Vector2 };
}

export function createTrainMaterials(globals: GlobalUniforms, clipX0: number, clipX1: number): TrainMaterials {
  const clip = { value: new THREE.Vector2(clipX0, clipX1) };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.08 });
  material.name = 'rail-train';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = globals.uLights;
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uClip = clip;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        { int tg = trTagOf(aKind); if (tg == ${T.WHEEL}) { float c = cos(aInst.x), s = sin(aInst.x); objectNormal = vec3(objectNormal.x, objectNormal.y * c - objectNormal.z * s, objectNormal.y * s + objectNormal.z * c); } }`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BEGIN}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          #endif
          vWX = (modelMatrix * wp).x;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vWX < uClip.x || vWX > uClip.y) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          int tg = int(vTagF + 0.5); tg -= (tg / 100) * 100;
          if (tg == ${T.CONT40} || tg == ${T.CONT20A} || tg == ${T.CONT20B}) {
            // corrugated container walls: ribs every 0.28 m along the side, 0.2 m across the ends
            float along = abs(vLoc.x) > 1.18 ? vLoc.z : vLoc.x;
            float f = fract(along / 0.28);
            float rib = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.5, 0.62, f));
            float fw = fwidth(along);
            float amp = 1.0 - smoothstep(0.05, 0.16, fw);
            float top = step(2.6, vLoc.y - 1.2) * step(abs(vLoc.x), 1.18);
            diffuseColor.rgb *= 1.0 - (0.16 * rib * amp) * (1.0 - top);
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        { int tg = int(vTagF + 0.5); tg -= (tg / 100) * 100; if (tg == ${T.GLASS} || tg == ${T.WINDOW} || tg == ${T.DOORWIN}) roughnessFactor = 0.18; if (tg == ${T.WHEEL}) roughnessFactor = 0.62; }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit;');
  };
  material.customProgramCacheKey = () => 'rail-train-v2';

  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'rail-train-depth';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uClip = clip;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aKind;\nattribute vec4 aInst2;\nvarying float vWX;\nbool trHidden(int tg) { int load = int(aInst2.x + 0.5); if (tg == ${T.CONT40}) return load != 0; if (tg == ${T.CONT20A}) return !(load == 1 || load == 2); if (tg == ${T.CONT20B}) return load != 1; return false; }
bool trVariantHidden(float k) { int vm = int(k + 0.5) / 100; if (vm == 1) return aInst2.z < 0.5; if (vm == 2) return aInst2.z > 0.5; return false; }`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ int r = int(aKind + 0.5); if (trHidden(r - (r / 100) * 100) || trVariantHidden(aKind)) transformed = vec3(0.0); }')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          #endif
          vWX = (modelMatrix * wp).x;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uClip;\nvarying float vWX;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWX < uClip.x || vWX > uClip.y) discard;');
  };
  depth.customProgramCacheKey = () => 'rail-train-depth-v2';
  return { material, depth, clip };
}
