// Night light for street furniture: soft additive light pools on the ground under every lamp
// and camera-facing halos around the lamp heads — all in ONE draw call. Intensity follows
// uniforms.uLights; invisible glows collapse to nothing in the vertex shader (no fill cost by day).
// Halos gently fade when the camera is very close (no giant sprite in the face).

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';

export interface Glow {
  x: number;
  y: number;
  z: number;
  /** half size (m) */
  size: number;
  halo: boolean;
  color: THREE.ColorRepresentation;
  intensity: number;
  /** pools only: stretch along local x (1 = round) and rotation */
  stretch?: number;
  yaw?: number;
}

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec4 aInfo; // size, halo, intensity, flicker phase
attribute vec3 aTint;
attribute vec2 aShape; // stretch, yaw
uniform float uLights;
uniform float uTime;
varying vec2 vUv;
varying vec3 vCol;
varying float vHalo;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = aCorner;
  vHalo = aInfo.y;
  float k = aInfo.z * uLights;
  vec4 mvPosition;
  if (aInfo.y < 0.5) {
    float c = cos(aShape.y), s = sin(aShape.y);
    vec2 q = vec2(aCorner.x * aShape.x, aCorner.y) * aInfo.x;
    vec3 off = vec3(q.x * c + q.y * s, 0.0, -q.x * s + q.y * c);
    mvPosition = modelViewMatrix * vec4(aCenter + off, 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
    // fade halos that get very close to the camera
    k *= smoothstep(3.0, 12.0, -mvPosition.z);
    mvPosition.xy += aCorner * aInfo.x;
    mvPosition.z += aInfo.x * 0.6; // pull towards the camera so the lamp glass does not clip it
  }
  vCol = aTint * k;
  if (k < 0.002) mvPosition = vec4(0.0, 0.0, 2.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vHalo;
#include <common>
#include <fog_pars_fragment>
void main() {
  float r = length(vUv);
  float g;
  if (vHalo > 0.5) {
    g = exp(-r * r * 4.2) * (1.0 - smoothstep(0.72, 1.0, r));
    g += exp(-r * r * 34.0) * 0.55;
  } else {
    // ground pool: soft, no hot core
    g = exp(-r * r * 2.6) * (1.0 - smoothstep(0.55, 1.0, r));
  }
  gl_FragColor = vec4(vCol * g, 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}
`;

export function createGlowMesh(u: GlobalUniforms, glows: Glow[]): THREE.Mesh {
  const n = glows.length;
  const center = new Float32Array(n * 12);
  const corner = new Float32Array(n * 8);
  const info = new Float32Array(n * 16);
  const tint = new Float32Array(n * 12);
  const shape = new Float32Array(n * 8);
  const idx = new Uint32Array(n * 6);
  const c = new THREE.Color();
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  glows.forEach((p, i) => {
    c.set(p.color);
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      center.set([p.x, p.y, p.z], v * 3);
      corner[v * 2] = corners[k * 2];
      corner[v * 2 + 1] = corners[k * 2 + 1];
      info.set([p.size, p.halo ? 1 : 0, p.intensity, 0], v * 4);
      tint.set([c.r, c.g, c.b], v * 3);
      shape[v * 2] = p.stretch ?? 1;
      shape[v * 2 + 1] = p.yaw ?? 0;
    }
    const b = i * 4;
    // pools are seen from above (+y); halos face the camera
    if (!p.halo) idx.set([b, b + 2, b + 1, b, b + 3, b + 2], i * 6);
    else idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(center.slice(), 3));
  geo.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  geo.setAttribute('aShape', new THREE.BufferAttribute(shape, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
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
  mat.uniforms.uLights = u.uLights;
  mat.uniforms.uTime = u.uTime;
  mat.name = 'props-glow';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'props-glows';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
