// Street-furniture material: one vertex-coloured MeshStandardMaterial for every prop, with
// per-vertex roughness/metalness (aRM) and per-vertex emission (aEmit = rgb * strength, a = mode):
//   mode 0 — lit only when the street lights are on (uLights): lamp glass, lit adverts, signs
//   mode 1 — always lit (subtle day emission, e.g. LED panels)
// Small props never cast shadows; they receive them.

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { roadNoise } from '../roads/materials';

// Weathering by material class (recognised from the per-vertex roughness / metalness of furniture.ts MAT):
// stone / concrete — grime at the foot, rain streaks, lichen spots, green algae on the north side;
// iron — rust spots and run-down rust streaks; painted metal — chipped paint, scuffs at the foot, the odd
// sticker on poles and boxes at hand height; wood — silvery greying and dark grain streaks; plastic —
// sun-faded. World-space noise (roads' tileable fBm), projected by the dominant normal axis; fine detail
// fades with the pixel footprint. ?nowear turns it off.
const WEAR_GLSL = /* glsl */ `
uniform sampler2D tPN;
uniform float uPWear;
void pWear(inout vec3 col, inout float rgh, inout float mtl, vec3 pw, vec3 n) {
  if (uPWear < 0.5) return;
  vec3 an = abs(n);
  vec2 uvp = an.y > 0.65 ? pw.xz : (an.x > an.z ? pw.zy : pw.xy);
  vec4 nA = texture2D(tPN, uvp * 0.45);                       // r ~0.55 m … a ~7 cm
  vec4 nB = texture2D(tPN, vec2(uvp.x * 1.6, uvp.y * 0.12));  // vertical streaks
  float fw = length(fwidth(pw)) + 1e-5;
  float fine = 1.0 - smoothstep(0.01, 0.04, fw);
  float foot = 1.0 - smoothstep(0.05, 0.55, pw.y - 0.12);
  float north = smoothstep(0.2, 0.9, -n.z) * (1.0 - an.y);
  if (rgh > 0.84 && rgh < 0.9 && mtl < 0.05) {
    // stone / concrete
    col *= 1.0 - 0.22 * foot * (0.6 + 0.4 * nA.g);
    col *= 1.0 - 0.18 * smoothstep(0.55, 0.85, nB.b) * (1.0 - an.y);
    col = mix(col, col * vec3(0.66, 0.76, 0.52), clamp(north * (0.35 + 0.5 * foot) * smoothstep(0.35, 0.7, nA.r), 0.0, 0.7));
    float lich = smoothstep(0.74, 0.8, nA.a * 0.6 + nA.b * 0.4) * fine;
    col = mix(col, vec3(0.78, 0.76, 0.62), lich * 0.45);
    col *= 0.92 + 0.14 * nA.g;
    // exposed aggregate / pores: fine light and dark specks, near only
    vec4 nF = texture2D(tPN, uvp * 5.3);
    col *= 1.0 + fine * (0.16 * smoothstep(0.72, 0.8, nF.a) - 0.2 * smoothstep(0.74, 0.82, nF.r));
  } else if (mtl > 0.5) {
    // galvanised / stainless steel: dull mottling, a grime band at the foot, rougher where handled
    float mot = smoothstep(0.3, 0.8, nA.r);
    col *= 0.9 + 0.16 * mot;
    rgh = clamp(rgh + 0.22 * (1.0 - mot) + 0.15 * foot, 0.0, 1.0);
    col *= 1.0 - 0.3 * foot * (0.5 + 0.5 * nA.g);
    col = mix(col, col * vec3(0.95, 0.9, 0.82), 0.25 * smoothstep(0.6, 0.9, nB.b) * (1.0 - an.y));
  } else if (rgh > 0.3 && rgh < 0.4 && mtl < 0.05) {
    // fired clay / glaze: white salt bloom and a damp band at the foot, dark run-down streaks
    float bloom = foot * smoothstep(0.45, 0.75, nA.g);
    col = mix(col, vec3(0.82, 0.8, 0.74), bloom * 0.45);
    col *= 1.0 - 0.15 * smoothstep(0.6, 0.85, nB.b) * (1.0 - an.y);
    rgh = mix(rgh, 0.85, bloom);
  } else if (mtl > 0.3 && mtl < 0.5) {
    // wrought / cast iron: rust spots, run-down streaks
    float rs = smoothstep(0.68, 0.76, nA.a * 0.55 + nA.r * 0.45);
    float st = smoothstep(0.6, 0.85, nB.b) * (1.0 - an.y) * 0.5;
    float r = clamp(rs + st * smoothstep(0.4, 0.7, nA.g), 0.0, 1.0);
    vec3 rc = mix(vec3(0.32, 0.13, 0.05), vec3(0.5, 0.25, 0.1), nA.g);
    col = mix(col, rc, r * 0.8);
    rgh = mix(rgh, 0.85, r);
    mtl = mix(mtl, 0.1, r);
    col *= 1.0 - 0.15 * foot;
  } else if (mtl > 0.15 && mtl < 0.3) {
    // painted metal: chips (lighter primer / dark metal), scuffs at the foot, stickers at hand height
    float ch = smoothstep(0.8, 0.84, nA.a * 0.7 + nA.b * 0.3) * fine;
    col = mix(col, mix(vec3(0.55, 0.53, 0.5), vec3(0.18, 0.17, 0.16), step(0.5, nA.r)), ch * 0.8);
    col *= 1.0 - 0.18 * foot * (0.5 + 0.5 * nA.g);
    col = mix(col, col * vec3(1.05, 0.95, 0.85), 0.12 * smoothstep(0.6, 0.9, nB.b));
    if (an.y < 0.3 && pw.y > 0.95 && pw.y < 1.95) {
      vec2 sc = floor(vec2(uvp.x / 0.13, uvp.y / 0.11));
      float h = fract(sin(dot(sc, vec2(127.1, 311.7))) * 43758.5453);
      vec2 f = fract(vec2(uvp.x / 0.13, uvp.y / 0.11));
      float stk = step(0.94, h) * step(0.15, f.x) * step(f.x, 0.85) * step(0.15, f.y) * step(f.y, 0.85) * fine;
      vec3 sCol = h > 0.985 ? vec3(0.85, 0.2, 0.15) : (h > 0.97 ? vec3(0.95, 0.85, 0.2) : vec3(0.92, 0.92, 0.9));
      col = mix(col, sCol, stk);
      rgh = mix(rgh, 0.6, stk);
    }
  } else if (rgh > 0.78 && rgh < 0.84) {
    // wood: silvery greying in patches + dark grain streaks
    float gr = smoothstep(0.35, 0.75, nA.r);
    col = mix(col, vec3(dot(col, vec3(0.33))) * vec3(1.0, 0.98, 0.95) * 1.15, gr * 0.45);
    col *= 1.0 - 0.18 * smoothstep(0.55, 0.9, nB.b) * fine;
    col *= 1.0 - 0.15 * foot;
  } else if (mtl < 0.05 && rgh < 0.5 && rgh > 0.4) {
    // plastic: sun-faded
    col = mix(col, vec3(dot(col, vec3(0.33))) * 1.1, 0.18 * (0.5 + 0.5 * nA.r));
  }
}
`;

export function furnitureMaterial(u: GlobalUniforms, wear = true): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
  mat.name = 'props-furniture';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = u.uLights;
    shader.uniforms.tPN = { value: roadNoise() };
    shader.uniforms.uPWear = { value: wear ? 1 : 0 };
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
${LAMP_GLSL}
${WEAR_GLSL}`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\n  float pRgh = vRM.x, pMtl = vRM.y;\n  pWear(diffuseColor.rgb, pRgh, pMtl, vPW, normalize(vPN));')
      // night street-light map: lamp light multiplies the albedo (black until baked)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight( vPW, normalize( vPN ) );')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = pRgh;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = pMtl;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEmit;');
  };
  mat.customProgramCacheKey = () => 'props-furniture-4' + (wear ? 'w' : '');
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
      // lit shelter glass only (bluish panes); greenhouse glass (neutral / greenish tint) stays dark at night
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * 0.06 * uLights * step(0.05, vColor.b - vColor.r);');
  };
  mat.customProgramCacheKey = () => 'props-glass-2';
  return mat;
}
