// One shared MeshStandardMaterial for every vehicle model (keeps fog, shadows,
// tone mapping) with shader injections for:
//   * instance body colour only on painted parts (aMeta.x)
//   * per-instance wheel spin + front-wheel steering (aWheel, aInst.zw)
//   * variant parts (taxi sign, police bar, cargo) collapsed when not used (aPart vs aInst2.x)
//   * decal atlas row per variant (bus route sign, van logos)
//   * emissive lights: head/tail/brake/blinkers/police bar/signs/cabin glow
//   * per-part finishes (aMeta.w = roughness + 4 × class): 1 clear-coated paint (a sharp, Fresnel-weighted
//     sky reflection over the base colour — MeshPhysical clearcoat, so it costs one more specular lobe and
//     no extra pass), 2 glass (the same coat over a near-mirror dark base), 3 chrome (metallic)
// Per-instance attributes (InstancedBufferAttribute on each model geometry):
//   aInst  = (brake 0..1, blinker 0 none|1 left|2 right|3 hazard, wheel angle, steer angle)
//   aInst2 = (variant, siren 0|1, phase 0..1, lights-on factor 0..1)

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { patchLampMaterial } from '../../world/lamps/integrate';

const VERT_PARS = /* glsl */ `
attribute vec4 aMeta;
attribute vec4 aWheel;
attribute float aPart;
attribute vec4 aInst;
attribute vec4 aInst2;
uniform float uTime;
uniform float uLights;
varying vec4 vEmit;
varying float vRough;
varying float vCoat;
varying float vMetal;
// variant parts: n = only for variant n - 1; 16 + bits = for the variants whose bit is set
bool thHidden(float part, float variant) {
  if (part < 0.5) return false;
  if (part > 15.5) return mod(floor((part - 16.0) / exp2(floor(variant + 0.5))), 2.0) < 0.5;
  return abs(part - variant - 1.0) > 0.25;
}
vec3 thWheel(vec3 p) {
  // wheels spin by the wheel angle, a bicycle crank (w = 3) by the pedalling angle (aInst2.y)
  float wa = aWheel.w > 2.5 ? aInst2.y : aInst.z;
  float c = cos(wa), s = sin(wa);
  p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  if (aWheel.w > 1.5 && aWheel.w < 2.5) {
    float cs = cos(aInst.w), ss = sin(aInst.w);
    p = vec3(p.x * cs + p.z * ss, p.y, -p.x * ss + p.z * cs);
  }
  return p;
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
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, aMeta.x );
#endif
`;

const VERT_BEGIN = /* glsl */ `
if ( aWheel.w > 0.5 ) transformed = aWheel.xyz + thWheel( transformed - aWheel.xyz );
if ( thHidden( aPart, aInst2.x ) ) transformed = vec3( 0.0 );
{
  int lt = int( aMeta.y + 0.5 );
  float lon = uLights * aInst2.w;
  float bOn = step( fract( uTime * 1.45 + aInst2.z ), 0.5 );
  int bl = int( aInst.y + 0.5 );
  vec3 e = vec3( 0.0 );
  float useD = 1.0;
  if ( lt == 1 ) e = vec3( 0.35 + 3.6 * lon );
  else if ( lt == 2 ) e = vec3( 0.18 + 1.6 * lon + 3.2 * aInst.x );
  else if ( lt == 3 ) e = vec3( ( bl == 1 || bl == 3 ) ? bOn * 4.5 : 0.0 );
  else if ( lt == 4 ) e = vec3( ( bl == 2 || bl == 3 ) ? bOn * 4.5 : 0.0 );
  else if ( lt == 5 || lt == 6 ) {
    float f = fract( uTime * 2.2 + aInst2.z + ( lt == 6 ? 0.5 : 0.0 ) );
    float fl = step( f, 0.16 ) + step( 0.26, f ) * step( f, 0.4 );
    e = vec3( aInst2.y * ( 0.25 + fl * 7.0 ) );
  }
  else if ( lt == 7 ) e = vec3( 0.25 + 2.2 * uLights );
  else if ( lt == 8 ) e = vec3( 0.3 + 2.0 * uLights );
  else if ( lt == 9 ) { e = vec3( 1.0, 0.8, 0.55 ) * ( 0.9 * uLights * aInst2.w ); useD = 0.0; }
  vEmit = vec4( e, useD );
  float fin = floor( aMeta.w * 0.25 );
  vRough = aMeta.w - fin * 4.0;
  vCoat = ( fin > 0.5 && fin < 2.5 ) ? 1.0 : 0.0;
  vMetal = ( fin > 2.5 ) ? 1.0 : 0.0;
}
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vEmit;
varying float vRough;
varying float vCoat;
varying float vMetal;
`;

export function createVehicleMaterial(uniforms: GlobalUniforms, atlas: THREE.Texture): { material: THREE.MeshPhysicalMaterial; depth: THREE.MeshDepthMaterial } {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: atlas,
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
  });
  material.name = 'traffic-vehicle';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uLights = uniforms.uLights;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv.y -= aMeta.z * aInst2.x;\n#endif')
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif ( aWheel.w > 0.5 ) objectNormal = thWheel( objectNormal );')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BEGIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp( roughness * vRough, 0.04, 1.0 );')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMetal;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n  material.clearcoat = vCoat;\n#endif')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit.rgb * mix( vec3( 1.0 ), diffuseColor.rgb, vEmit.a );');
  };
  material.customProgramCacheKey = () => 'traffic-vehicle-v3';
  patchLampMaterial(material); // night street-light map (night agent)

  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'traffic-vehicle-depth';
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aPart;\nattribute vec4 aInst2;\nbool thHidden(float part, float variant) {\n  if (part < 0.5) return false;\n  if (part > 15.5) return mod(floor((part - 16.0) / exp2(floor(variant + 0.5))), 2.0) < 0.5;\n  return abs(part - variant - 1.0) > 0.25;\n}',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif ( thHidden( aPart, aInst2.x ) ) transformed = vec3( 0.0 );');
  };
  depth.customProgramCacheKey = () => 'traffic-vehicle-depth-v2';
  return { material, depth };
}
