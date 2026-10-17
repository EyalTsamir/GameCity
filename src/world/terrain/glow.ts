// Night glows for the terrain's own lights (promenade lamps, portal lanterns, tunnel lamps):
// camera-facing halos + soft light pools on the ground, all in ONE additive draw call.
// Intensity follows uniforms.uLights (tunnel lamps keep a faint glow by day).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

export interface GlowPoint {
  x: number;
  y: number;
  z: number;
  /** half size (m) */
  size: number;
  /** 'halo' faces the camera, 'pool' lies flat on the ground */
  kind: 'halo' | 'pool';
  color: THREE.ColorRepresentation;
  intensity: number;
  /** fraction of the glow kept in daylight (0..1) */
  day?: number;
}

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec4 aInfo; // size, flat, intensity, day
attribute vec3 aTint;
uniform float uLights;
varying vec2 vUv;
varying vec3 vCol;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = aCorner;
  float k = aInfo.z * max(uLights, aInfo.w);
  vCol = aTint * k;
  vec4 mvPosition;
  if (aInfo.y > 0.5) {
    mvPosition = modelViewMatrix * vec4(aCenter + vec3(aCorner.x, 0.0, aCorner.y) * aInfo.x, 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
    mvPosition.xy += aCorner * aInfo.x;
  }
  // collapse invisible glows (daytime) to nothing
  if (k < 0.002) mvPosition = vec4(0.0, 0.0, 2.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
#include <common>
#include <fog_pars_fragment>
void main() {
  float r = length(vUv);
  float g = exp(-r * r * 5.0) * (1.0 - smoothstep(0.75, 1.0, r));
  g += exp(-r * r * 40.0) * 0.6;
  gl_FragColor = vec4(vCol * g, 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor; // additive: fade out, never add fog colour
  #endif
}
`;

export function createGlows(ctx: CityContext, points: GlowPoint[]): THREE.Mesh {
  const n = points.length;
  const center = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const info = new Float32Array(n * 4 * 4);
  const tint = new Float32Array(n * 4 * 3);
  const idx: number[] = [];
  const c = new THREE.Color();
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  points.forEach((p, i) => {
    c.set(p.color);
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      center.set([p.x, p.y, p.z], v * 3);
      corner.set(corners[k], v * 2);
      info.set([p.size, p.kind === 'pool' ? 1 : 0, p.intensity, p.day ?? 0], v * 4);
      tint.set([c.r, c.g, c.b], v * 3);
    }
    const b = i * 4;
    // pools are seen from above (+y); halos face the camera
    if (p.kind === 'pool') idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    else idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(center.slice(), 3));
  geo.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 4;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  mat.uniforms.uLights = ctx.uniforms.uLights;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain-glows';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
