// Shared material for all boats. Two InstancedMeshes use it (big: ferry/tug/tour boat, small:
// sailboat/motorboat/rowing shell); each holds several models, the vertex shader keeps only
// the instance's variant (aKind = tag + 100·variant, aBoat.x = variant). Per-vertex tags drive
//   * tinted hull paint (instanceColor), sail / shirt colour (aCol2)
//   * sails: boom/jib rotation about the mast / tack, camber (fill) and luffing flutter
//   * rowing: oars sweep + feather about their oarlocks, rowers swing fore and aft
//   * flags wave; emissive cabin windows at night, navigation-light lenses
// Per-instance: aBoat = (variant, boom angle, luff 0..1, rowing phase)
//               aBoat2 = (camber −1..1, lights 0..1, jib angle, coloured-sail mix)

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';

export const BT = {
  PLAIN: 0,
  TINT: 1,
  WINDOW: 2,
  GLASS: 3,
  LAMP_R: 4,
  LAMP_G: 5,
  LAMP_W: 6,
  /** mainsail cloth: aExtra = (u, v, mast z, 0) */
  SAIL: 7,
  /** jib cloth: aExtra = (u, v, tack z, 0) */
  JIB: 8,
  /** oar: aExtra = (pivot x, pivot y, pivot z, side) */
  OAR: 9,
  /** rower torso/head/arms: aExtra = (hip y, hip z, 0, 0) */
  ROWER: 10,
  /** boom (rotates with the mainsail): aExtra.z = mast z */
  BOOM: 11,
  LAMP_WARM: 12,
  /** flag cloth: aExtra = (u along the fly, 0, 0, 0) */
  FLAG: 13,
  /** coloured part taking aCol2 (shirts, sail stripes, seats) */
  ACCENT: 14,
} as const;

/** jib tack and head (sailboat model, local) — the jib swings about the forestay line between them */
export const JIB_TACK: [number, number, number] = [0, 1.15, 3.25];
export const JIB_HEAD: [number, number, number] = [0, 7.6, 1.75];
const JA = new THREE.Vector3(JIB_HEAD[0] - JIB_TACK[0], JIB_HEAD[1] - JIB_TACK[1], JIB_HEAD[2] - JIB_TACK[2]).normalize();
const f3 = (v: number) => v.toFixed(5);

const COMMON = /* glsl */ `
attribute float aKind;
attribute vec4 aExtra;
attribute vec4 aBoat;
attribute vec4 aBoat2;
uniform float uTime;
int btTag(float k) { int r = int(k + 0.5); return r - (r / 100) * 100; }
bool btHidden(float k) { int vm = int(k + 0.5) / 100; return vm != int(aBoat.x + 0.5); }
vec3 btRotY(vec3 p, vec2 c, float a) {
  float cs = cos(a), sn = sin(a);
  vec2 q = vec2(p.x - c.x, p.z - c.y);
  return vec3(c.x + q.x * cs + q.y * sn, p.y, c.y - q.x * sn + q.y * cs);
}
vec3 btRotAxis(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
const vec3 JIB_T = vec3(${f3(JIB_TACK[0])}, ${f3(JIB_TACK[1])}, ${f3(JIB_TACK[2])});
const vec3 JIB_K = vec3(${f3(JA.x)}, ${f3(JA.y)}, ${f3(JA.z)});
vec3 btAnimate(vec3 p, int tg) {
  if (tg == ${BT.SAIL} || tg == ${BT.BOOM}) {
    if (tg == ${BT.SAIL}) {
      float u = aExtra.x, v = aExtra.y;
      float bulge = sin(3.14159 * u) * (1.0 - 0.55 * v);
      p.x += aBoat2.x * 0.42 * bulge;
      float fl = aBoat.z * (0.12 + 0.3 * u) * sin(uTime * 11.0 + u * 7.0 + v * 5.0);
      p.x += fl * (1.0 - 0.6 * v);
    }
    return btRotY(p, vec2(0.0, aExtra.z), aBoat.y);
  }
  if (tg == ${BT.JIB}) {
    float u = aExtra.x, v = aExtra.y;
    float bulge = sin(3.14159 * u) * (1.0 - 0.5 * v);
    p.x += aBoat2.x * 0.3 * bulge;
    p.x += aBoat.z * (0.1 + 0.35 * u) * sin(uTime * 12.5 + u * 8.0 + v * 3.0);
    return JIB_T + btRotAxis(p - JIB_T, JIB_K, aBoat2.z);
  }
  if (tg == ${BT.OAR}) {
    float ph = aBoat.w;
    float side = aExtra.w;
    // sweep: catch (blades aft... toward the bow of a stern-facing rower) → finish
    float sweep = 0.55 * sin(ph);
    vec3 piv = aExtra.xyz;
    vec3 q = p - piv;
    float cs = cos(sweep * side), sn = sin(sweep * side);
    q = vec3(q.x * cs + q.z * sn, q.y, -q.x * sn + q.z * cs);
    // blade dips during the drive (cos > 0), lifts on the recovery
    float reach = clamp(abs(q.x) / 2.6, 0.0, 1.0);
    q.y += (-0.22 * max(0.0, cos(ph)) + 0.18 * max(0.0, -cos(ph))) * reach;
    return piv + q;
  }
  if (tg == ${BT.ROWER}) {
    float lean = 0.42 * sin(aBoat.w);
    vec2 hip = aExtra.xy;
    vec2 q = vec2(p.y - hip.x, p.z - hip.y);
    float cs = cos(lean), sn = sin(lean);
    q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
    return vec3(p.x, hip.x + q.x, hip.y + q.y);
  }
  if (tg == ${BT.FLAG}) {
    float u = aExtra.x;
    p.x += 0.12 * u * sin(uTime * 7.0 - u * 6.0);
    return p;
  }
  return p;
}
`;

const VERT_PARS = /* glsl */ `
${COMMON}
attribute vec3 aCol2;
uniform float uLights;
varying vec3 vEmit;
varying float vTagF;
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
  int tg = btTag(aKind);
  #ifdef USE_INSTANCING_COLOR
  if (tg == ${BT.TINT}) vColor.rgb *= instanceColor.rgb;
  #endif
  if (tg == ${BT.ACCENT}) vColor.rgb *= aCol2;
  if (tg == ${BT.SAIL}) vColor.rgb = mix(vColor.rgb, vColor.rgb * aCol2, aBoat2.w);
}
`;

const VERT_BEGIN = /* glsl */ `
{
  int tg = btTag(aKind);
  transformed = btAnimate(transformed, tg);
  if (btHidden(aKind)) transformed = vec3(0.0);
  vTagF = float(tg);
  float lit = uLights * aBoat2.y;
  vec3 e = vec3(0.0);
  if (tg == ${BT.WINDOW}) e = vec3(1.0, 0.8, 0.5) * 1.5 * lit;
  else if (tg == ${BT.LAMP_R}) e = vec3(1.0, 0.08, 0.05) * (0.15 + 3.0 * lit);
  else if (tg == ${BT.LAMP_G}) e = vec3(0.1, 1.0, 0.35) * (0.15 + 3.0 * lit);
  else if (tg == ${BT.LAMP_W}) e = vec3(1.0, 0.95, 0.85) * (0.1 + 3.0 * lit);
  else if (tg == ${BT.LAMP_WARM}) e = vec3(1.0, 0.78, 0.45) * (0.05 + 2.4 * lit);
  vEmit = e;
}
`;

export interface BoatMaterials {
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
}

export function createBoatMaterials(globals: GlobalUniforms): BoatMaterials {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide });
  material.name = 'boats';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uLights = globals.uLights;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        {
          int tg = btTag(aKind);
          float ra = (tg == ${BT.SAIL} || tg == ${BT.BOOM}) ? aBoat.y : 0.0;
          if (tg == ${BT.SAIL} || tg == ${BT.JIB}) objectNormal = normalize(objectNormal - vec3(0.0, 0.0, aBoat2.x * 0.35 * cos(3.14159 * aExtra.x)));
          if (ra != 0.0) objectNormal = btRotY(objectNormal, vec2(0.0), ra);
          if (tg == ${BT.JIB}) objectNormal = btRotAxis(objectNormal, JIB_K, aBoat2.z);
        }`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BEGIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmit;\nvarying float vTagF;')
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        { int tg = int(vTagF + 0.5); if (tg == ${BT.GLASS} || tg == ${BT.WINDOW}) roughnessFactor = 0.15; if (tg == ${BT.SAIL} || tg == ${BT.JIB} || tg == ${BT.FLAG}) roughnessFactor = 0.85; }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit;');
  };
  material.customProgramCacheKey = () => 'boats-v2';

  const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depth.name = 'boats-depth';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = btAnimate(transformed, btTag(aKind));\nif (btHidden(aKind)) transformed = vec3(0.0);');
  };
  depth.customProgramCacheKey = () => 'boats-depth-v2';
  return { material, depth };
}
