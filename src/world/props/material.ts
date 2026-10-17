// Street-furniture material: one vertex-coloured MeshStandardMaterial for every prop, with
// per-vertex roughness/metalness (aRM) and per-vertex emission (aEmit = rgb * strength, a = mode):
//   mode 0 — lit only when the street lights are on (uLights): lamp glass, lit adverts, signs
//   mode 1 — always lit (subtle day emission, e.g. LED panels)
// Small props never cast shadows; they receive them.

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';

export function furnitureMaterial(u: GlobalUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
  mat.name = 'props-furniture';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = u.uLights;
    Object.assign(shader.uniforms, lampUniforms());
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aRM;
attribute vec4 aEmit;
uniform float uLights;
varying vec2 vRM;
varying vec3 vEmit;
varying vec3 vPW;
varying vec3 vPN;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRM = aRM;
vEmit = aEmit.rgb * mix( uLights, 1.0, aEmit.a );
vPW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vPN = mat3( modelMatrix ) * objectNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vRM;
varying vec3 vEmit;
varying vec3 vPW;
varying vec3 vPN;
${LAMP_GLSL}`,
      )
      // night street-light map: lamp light multiplies the albedo (black until baked)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight( vPW, normalize( vPN ) );')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEmit;');
  };
  mat.customProgramCacheKey = () => 'props-furniture-2';
  return mat;
}

/** Glass panes (bus shelters): transparent, slightly reflective, faintly lit at night. */
export function glassMaterial(u: GlobalUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false });
  mat.name = 'props-glass';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = u.uLights;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * 0.06 * uLights;');
  };
  mat.customProgramCacheKey = () => 'props-glass-1';
  return mat;
}
