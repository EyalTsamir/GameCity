// Materials of the landmarks module (all share the global uniforms, so one update per
// frame drives every shader):
//   solid      MeshStandardMaterial + procedural surface patterns (static, merged)
//   kinetic    same surface model + vertex animation (spin / swing / crane / flags) and
//              cutouts (lattice, scaffold, railings); DoubleSide; custom depth material
//              so animated parts and lattices cast correct shadows
//   lights     unlit emissive bits (lamps, aviation lights, LED scoreboard, chase rings)
//   glows      additive halos / light pools / beams (one draw call)

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { LM_COMMON, LM_CUT, LM_KIN_PARS, LM_SURFACE, LIGHTS_VERT, LIGHTS_FRAG, GLOW_VERT, GLOW_FRAG } from './shaders';
import { LAMP_APPLY_VIEW, LAMP_GLSL, bindLampChannel, lampUniforms } from '../../core/lampLight';

export interface LmUniforms {
  uHours: { value: number };
  /** crane: slew angle, trolley distance, hook drop, load visible */
  uCrane: { value: THREE.Vector4 };
  /** accumulated angles for speed-varying spinners (TV ring, turbines, roundabout, spare) */
  uSpin: { value: THREE.Vector4 };
  /** stadium floodlights 0..1 */
  uFlood: { value: number };
  /** visibility groups: x = construction work hours, y = bandstand concert, z = market open, w = spare */
  uVis: { value: THREE.Vector4 };
  /** scoreboard: home, away, minute, state */
  uScore: { value: THREE.Vector4 };
  /** analytic sky for reflections (updated per frame from daylight / fog) */
  uSkyZen: { value: THREE.Color };
  uSkyHor: { value: THREE.Color };
  uGround: { value: THREE.Color };
  uEnvK: { value: number };
  /** distance (m) beyond which detail-mesh primitives collapse */
  uDetailDist: { value: number };
}

export interface LmMaterials {
  /** common static surfaces (compiled without the ornament patterns) */
  solid: THREE.MeshStandardMaterial;
  /** clock faces, flags, rose windows, stained glass (full pattern set) */
  ornament: THREE.MeshStandardMaterial;
  /** small trims with per-primitive distance LOD (no shadows) */
  detail: THREE.MeshStandardMaterial;
  kinetic: THREE.MeshStandardMaterial;
  kineticDepth: THREE.MeshDepthMaterial;
  lights: THREE.ShaderMaterial;
  glows: THREE.ShaderMaterial;
  u: LmUniforms;
}

const VERT_PARS = /* glsl */ `
attribute vec2 aPuv;
attribute vec4 aMat;
varying vec2 vPuv;
flat varying vec4 vMat;
varying vec2 vYN;
`;

const FRAG_PARS = /* glsl */ `
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uGround;
uniform float uEnvK;
uniform vec3 uSunDir;
uniform float uSunUp;
varying vec2 vPuv;
flat varying vec4 vMat;
varying vec2 vYN;
${LM_COMMON}
`;

// Lambert lighting + a cheap analytic sky reflection / sun glint for glossy surfaces (glass,
// metal, glazed tiles). Measured on the target iGPU: MeshStandardMaterial with this shader
// cost ~0.3 ms more per frame; ?lmstandard=1 switches back for comparison.
const STANDARD = typeof location !== 'undefined' && new URLSearchParams(location.search).has('lmstandard');

// Detail mesh: per-primitive distance LOD — every vertex carries its primitive's centre (aPivot);
// beyond uDetailDist the whole primitive collapses outside the clip volume (no raster cost).
const DETAIL_PARS = /* glsl */ `
attribute vec3 aPivot;
uniform float uDetailDist;
`;
const DETAIL_EARLY = /* glsl */ `
if (distance(aPivot, cameraPosition) > uDetailDist) {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  return;
}
`;

const REFLECT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += lmEmit;
#ifndef LM_STANDARD
{
  float gl = 1.0 - lmRough;
  gl *= gl;
  if (gl > 0.05) {
    vec3 V = normalize(vViewPosition);
    vec3 N = normal;
    float NdV = clamp(dot(N, V), 0.0, 1.0);
    vec3 R = reflect(-V, N);
    vec3 upV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    float ry = dot(R, upV);
    vec3 env = ry > 0.0 ? mix(uSkyHor, uSkyZen, sqrt(ry)) : mix(uSkyHor * 0.55, uGround, clamp(-ry * 3.0, 0.0, 1.0));
    float F = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
    vec3 tint = mix(vec3(F), lmBase * (0.45 + 0.55 * F), lmMetal);
    vec3 Ls = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
    float glint = pow(max(dot(R, Ls), 0.0), 90.0) * 3.0 * uSunUp;
    totalEmissiveRadiance += (env * uEnvK + glint) * tint * gl;
  }
}
#endif
`;

function surfaceMaterial(g: GlobalUniforms, u: LmUniforms, kinetic: boolean, noOrnament = false, detail = false): THREE.MeshStandardMaterial {
  const side = kinetic ? THREE.DoubleSide : THREE.FrontSide;
  const m = (STANDARD ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side }) : new THREE.MeshLambertMaterial({ vertexColors: true, side })) as THREE.MeshStandardMaterial;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLights = g.uLights;
    sh.uniforms.uNight = g.uNight;
    sh.uniforms.uHours = u.uHours;
    sh.uniforms.uTimeF = g.uTime;
    sh.uniforms.uFloodOn = u.uFlood;
    sh.uniforms.uSkyZen = u.uSkyZen;
    sh.uniforms.uSkyHor = u.uSkyHor;
    sh.uniforms.uGround = u.uGround;
    sh.uniforms.uEnvK = u.uEnvK;
    sh.uniforms.uSunDir = g.uSunDir;
    sh.uniforms.uSunUp = g.uDaylight;
    if (detail) sh.uniforms.uDetailDist = u.uDetailDist;
    // night street lights + stadium floodlights (shared lamp light map)
    Object.assign(sh.uniforms, lampUniforms());
    if (kinetic) {
      sh.uniforms.uTime = g.uTime;
      sh.uniforms.uCrane = u.uCrane;
      sh.uniforms.uSpin = u.uSpin;
      sh.uniforms.uVis = u.uVis;
      sh.uniforms.uWind = g.uWind;
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${VERT_PARS}
${kinetic ? LM_KIN_PARS : ''}
${detail ? DETAIL_PARS : ''}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
vec3 lmP = position;
${kinetic ? 'lmKin(lmP, objectNormal);' : ''}`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = lmP;')
      .replace('#include <uv_vertex>', detail ? `${DETAIL_EARLY}\n#include <uv_vertex>` : '#include <uv_vertex>')
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vPuv = aPuv;
        vMat = aMat;
        vYN = vec2((modelMatrix * vec4(transformed, 1.0)).y, normalize(mat3(modelMatrix) * objectNormal).y);
`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${FRAG_PARS}
${LAMP_GLSL}
${kinetic ? LM_CUT : ''}
${LM_SURFACE}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${LAMP_APPLY_VIEW}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lmRough = fract(vMat.y);
        float lmMetal = floor(vMat.y) / 9.0;
        vec3 lmEmit = vec3(0.0);
        ${
          kinetic
            ? `{
          float ck;
          float cov = lmCutMask(vPuv, vMat, ck);
          if (cov < 0.5) discard;
          if (ck > 0.5) {
            float pt = floor(vMat.x + 0.5);
            if (pt == 16.0) diffuseColor.rgb = vec3(0.86, 0.66, 0.2);
            else if (pt == 17.0) diffuseColor.rgb *= 0.8;
          }
        }`
            : ''
        }
        lmSurface(diffuseColor.rgb, lmRough, lmMetal, lmEmit, vYN);
        vec3 lmBase = diffuseColor.rgb;
        ${STANDARD ? '' : 'diffuseColor.rgb *= 1.0 - 0.55 * lmMetal;'}`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = lmRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = lmMetal;')
      .replace('#include <emissivemap_fragment>', REFLECT);
  };
  m.defines = { ...(noOrnament ? { LM_NO_ORNAMENT: '' } : {}), ...(STANDARD ? { LM_STANDARD: '' } : {}) };
  m.customProgramCacheKey = () => (STANDARD ? 'S-' : 'L-') + (kinetic ? 'lm-kinetic-v4' : detail ? 'lm-detail-v4' : noOrnament ? 'lm-solid-v4' : 'lm-ornament-v4');
  return m;
}

function depthMaterial(g: GlobalUniforms, u: LmUniforms): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = g.uTime;
    sh.uniforms.uCrane = u.uCrane;
    sh.uniforms.uSpin = u.uSpin;
    sh.uniforms.uVis = u.uVis;
    sh.uniforms.uWind = g.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}\n${LM_KIN_PARS}`)
      .replace(
        '#include <begin_vertex>',
        `vec3 lmP = position;
        vec3 lmN = vec3(0.0, 1.0, 0.0);
        lmKin(lmP, lmN);
        vec3 transformed = lmP;
        vPuv = aPuv;
        vMat = aMat;
        vYN = vec2(0.0, 1.0);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${LM_CUT}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        { float ck; if (lmCutMask(vPuv, vMat, ck) < 0.5) discard; }`,
      );
  };
  m.customProgramCacheKey = () => 'lm-kinetic-depth-v1';
  return m;
}

export function createMaterials(g: GlobalUniforms): LmMaterials {
  const u: LmUniforms = {
    uHours: { value: 12 },
    uCrane: { value: new THREE.Vector4(0, 10, 10, 1) },
    uSpin: { value: new THREE.Vector4() },
    uFlood: { value: 0 },
    uVis: { value: new THREE.Vector4(1, 0, 1, 1) },
    uScore: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSkyZen: { value: new THREE.Color('#4f86c6') },
    uSkyHor: { value: new THREE.Color('#cfdfe8') },
    uGround: { value: new THREE.Color('#2e2b26') },
    uEnvK: { value: 1 },
    uDetailDist: { value: 100 },
  };
  // the stadium floodlights' analytic spot lights follow uFlood
  bindLampChannel('stadium', u.uFlood);
  const lights = new THREE.ShaderMaterial({
    vertexShader: LIGHTS_VERT,
    fragmentShader: LIGHTS_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexColors: true,
    fog: true,
  });
  Object.assign(lights.uniforms, {
    uLights: g.uLights,
    uTime: g.uTime,
    uWind: g.uWind,
    uCrane: u.uCrane,
    uSpin: u.uSpin,
    uVis: u.uVis,
    uFlood: u.uFlood,
    uHours: u.uHours,
    uScore: u.uScore,
    uRealT: g.uRealTime,
  });
  const glows = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  Object.assign(glows.uniforms, { uLights: g.uLights, uTime: g.uTime, uFlood: u.uFlood, uCrane: u.uCrane });
  return {
    solid: surfaceMaterial(g, u, false, true),
    ornament: surfaceMaterial(g, u, false, false),
    detail: surfaceMaterial(g, u, false, true, true),
    kinetic: surfaceMaterial(g, u, true),
    kineticDepth: depthMaterial(g, u),
    lights,
    glows,
    u,
  };
}
