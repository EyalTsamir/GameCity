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
import { patchLampMaterial } from '../../world/lamps/integrate';

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
  /** the open doorway's back (vestibule seen through it): ray-traced like the windows, aExtra.x = door centre z */
  VESTIB: 13,
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
varying vec3 vLocDir;
varying float vDoorZ;
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
  // door centre for the vestibule; −1e5 flags an open leaf (its window then lies over the body, no saloon behind)
  vDoorZ = tg == ${T.VESTIB} ? aExtra.x : tg == ${T.DOORWIN} && aInst.z > 0.1 && abs(aExtra.w - aInst.w) < 0.5 ? -1e5 : 1e4;
  if (tg == ${T.WINDOW} || tg == ${T.DOORWIN} || tg == ${T.VESTIB}) e = vec3(1.0, 0.8, 0.52) * (1.7 * lit) * aInst2.y;
  else if (tg == ${T.HEAD} && role == 1) e = vec3(1.0, 0.95, 0.85) * (0.9 + 4.0 * lit);
  else if (tg == ${T.TAIL} && role == 2) e = vec3(1.0, 0.07, 0.03) * (0.7 + 2.6 * lit);
  else if (tg == ${T.DEST} && role == 1) e = vec3(1.0, 0.62, 0.16) * (0.9 + 0.6 * lit);
  vEmit = e;
}
`;

const FRAG_PARS = /* glsl */ `
uniform vec2 uClip;
uniform float uGrime;
uniform float uLights;
uniform float uTrInt;
varying vec3 vEmit;
varying float vWX;
varying vec3 vLoc;
varying float vTagF;
varying vec3 vLocDir;
varying float vDoorZ;
vec3 trIntE = vec3(0.0);
float trEmK = 1.0;
float trH(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
// Saloon behind the glass, ray-traced in the car frame (interior mapping; no geometry): far wall with its
// window band, floor, ceiling with the light strip, seat backs in 1.9 m bays with a few seated heads, yellow
// grab poles in the vestibule. Returns the colour lit as daylight / cabin light, darkened with depth.
vec3 trInterior(vec3 o, vec3 d, float doorZ) {
  const float FL = 1.13, CE = 3.2, WX = 1.36;
  float sx = -sign(o.x);
  float tW = (sx * WX - o.x) / d.x;
  float tF = d.y < 0.0 ? (FL - o.y) / d.y : 1e9;
  float tC = d.y > 0.0 ? (CE - o.y) / d.y : 1e9;
  float t = min(tW, min(tF, tC));
  vec3 p = o + d * t;
  vec3 col;
  if (t == tF) col = vec3(0.16, 0.17, 0.19) * (0.85 + 0.3 * trH(floor(p.x * 9.0) + floor(p.z * 9.0) * 57.0));
  else if (t == tC) col = abs(p.x) < 0.16 ? vec3(1.5, 1.45, 1.35) : vec3(0.55, 0.56, 0.55);
  else {
    // far side: wall panels, the window band shows the bright outside through the far glass
    bool win = p.y > 2.05 && p.y < 2.95 && fract(p.z / 1.9 + 0.12) < 0.82 && abs(p.z - doorZ) > 0.75;
    col = win ? vec3(0.62, 0.72, 0.82) * 2.6 : (p.y < 1.25 ? vec3(0.2, 0.21, 0.23) : vec3(0.46, 0.46, 0.45));
  }
  // seat backs (both sides of the aisle, transverse) at the bay planes ahead of the ray
  if (abs(d.z) > 1e-3) {
    for (int k = 0; k < 3; k++) {
      float bay = floor(o.z / 1.9) + (d.z > 0.0 ? 1.0 + float(k) : -float(k));
      float zn = bay * 1.9;
      float ts = (zn - o.z) / d.z;
      if (ts <= 0.02 || ts >= t) continue;
      vec3 q = o + d * ts;
      float ax = abs(q.x);
      if (abs(q.z - doorZ) < 0.9) continue;
      float h = trH(bay * 7.0 + sign(q.x) * 3.0);
      // a seated passenger's head over the back (by bay + side)
      vec2 hd = vec2((ax - 0.95) / 0.095, (q.y - 2.4) / 0.13);
      if (h > 0.55 && dot(hd, hd) < 1.0) {
        // hair over the crown and the back of the head (we mostly see heads from behind / the side)
        float hair = step(0.35 - 0.5 * fract(h * 13.0), hd.y) + step(0.6, fract(h * 5.3));
        col = hair > 0.5 ? vec3(0.07, 0.05, 0.04) + 0.25 * vec3(0.9, 0.7, 0.4) * fract(h * 3.7) : vec3(0.55, 0.4, 0.32) * (0.6 + 0.5 * h);
        t = ts;
        break;
      }
      // seat back above the cushion (under it only the pedestal at the wall side: the floor shows between)
      if (ax > 0.38 && ax < WX && q.y < FL + 1.15 && (q.y > FL + 0.42 || (ax > 1.15 && q.y > FL))) {
        float top = smoothstep(FL + 1.08, FL + 1.15, q.y);
        col = mix(vec3(0.12, 0.2, 0.34), vec3(0.06, 0.08, 0.1), top) * (0.9 + 0.2 * trH(floor(q.x * 30.0) + floor(q.y * 30.0) * 31.0));
        if (ax > 0.86 && ax < 0.9) col *= 0.6;
        t = ts;
        break;
      }
    }
  }
  // grab poles in the vestibule: two by the door edges, one in the middle
  if (doorZ < 1e3) {
    vec2 o2 = o.xz, d2 = d.xz;
    float dd = dot(d2, d2);
    for (int k = 0; k < 3; k++) {
      vec2 c = k == 0 ? vec2(0.0, doorZ) : vec2(-sx * 1.12, doorZ + (k == 1 ? -0.8 : 0.8));
      float tp = dot(c - o2, d2) / dd;
      if (tp > 0.0 && tp < t && length(o2 + d2 * tp - c) < 0.022) {
        float yy = o.y + d.y * tp;
        if (yy < CE) { col = vec3(0.85, 0.68, 0.12); t = tp; }
      }
    }
  }
  return col * (1.0 - 0.45 * clamp((t - 0.5) / 3.0, 0.0, 1.0));
}
`;

export interface TrainMaterials {
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  clip: { value: THREE.Vector2 };
  /** saloon interior behind the glass: 1 on, 0 off (URL off → stays 0; quality low → 0, set by trainRender) */
  interior: { value: number };
  interiorUrlOff: boolean;
}

export function createTrainMaterials(globals: GlobalUniforms, clipX0: number, clipX1: number): TrainMaterials {
  const clip = { value: new THREE.Vector2(clipX0, clipX1) };
  // ?notraingrime: clean rolling stock (W2 real-things toggle)
  const grime = { value: typeof location !== 'undefined' && new URLSearchParams(location.search).has('notraingrime') ? 0 : 1 };
  // ?notraininterior: plain dark glass (the ray-traced saloon is also off on quality low — trainRender)
  const interior = { value: typeof location !== 'undefined' && new URLSearchParams(location.search).has('notraininterior') ? 0 : 1 };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.08 });
  material.name = 'rail-train';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = globals.uLights;
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uClip = clip;
    shader.uniforms.uGrime = grime;
    shader.uniforms.uTrInt = interior;
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
          // camera ray in the car frame (rotations only, so the transpose inverts; a mirrored car too)
          mat3 mm = mat3(modelMatrix);
          #ifdef USE_INSTANCING
          mm = mm * mat3(instanceMatrix);
          #endif
          vLocDir = transpose(mm) * ((modelMatrix * wp).xyz - cameraPosition);
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
          if (uGrime > 0.5 && tg != ${T.WINDOW} && tg != ${T.DOORWIN} && tg != ${T.GLASS}) {
            // brake dust and track dirt: running gear rust-brown, a film up the lower body that fades with a noisy
            // edge, dust on the roof; weathering ages the rolling stock with the street around it
            vec3 q = vLoc;
            float n = fract(sin(dot(floor(q * vec3(3.0, 9.0, 1.3)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float gear = (1.0 - smoothstep(0.9, 1.05, q.y)) * step(abs(q.x), 1.3);
            float low = (1.0 - smoothstep(0.95, 1.55 + 0.15 * n, q.y)) * (1.0 - gear);
            float roof = smoothstep(3.3, 3.7, q.y) * 0.35;
            vec3 dust = vec3(0.33, 0.26, 0.2);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + dust * 0.35, gear * (0.55 + 0.25 * n));
            diffuseColor.rgb = mix(diffuseColor.rgb, dust * 0.9, low * (0.32 + 0.12 * n));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.36), roof * (0.6 + 0.4 * n));
          }
          if ((tg == ${T.WINDOW} || tg == ${T.DOORWIN} || tg == ${T.VESTIB}) && uTrInt > 0.5) {
            vec3 d = normalize(vLocDir);
            if (d.x * vLoc.x < 0.0 && vDoorZ > -1e4) {
              vec3 ic = trInterior(vLoc, d, vDoorZ);
              // daylight inside (dimmer than out), cabin lamps at night; the glass keeps its reflection
              trIntE = ic * (0.1 * (1.0 - uLights)) + vEmit * (0.2 + 0.8 * ic);
              trEmK = 0.0;
              diffuseColor.rgb *= tg == ${T.VESTIB} ? 0.0 : 0.45;
            }
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        { int tg = int(vTagF + 0.5); tg -= (tg / 100) * 100; if (tg == ${T.GLASS} || tg == ${T.WINDOW} || tg == ${T.DOORWIN}) roughnessFactor = 0.18; if (tg == ${T.VESTIB}) roughnessFactor = 1.0; if (tg == ${T.WHEEL}) roughnessFactor = 0.62; }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit * trEmK + trIntE;');
  };
  material.customProgramCacheKey = () => 'rail-train-v4';
  patchLampMaterial(material); // night street-light map (night agent)

  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'rail-train-depth';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uClip = clip;
    shader.uniforms.uGrime = grime;
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
  return { material, depth, clip, interior, interiorUrlOff: interior.value === 0 };
}
