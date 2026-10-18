// Night light for street furniture.
//  • Light pools are NOT drawn any more: every pool is registered as a real light source in the
//    shared lamp light map (core/lampLight.ts), which lights the ground, walls, crowns and people
//    multiplied by their own colour. The head height comes from the halo of the same lamp.
//  • What stays here: camera-facing halos around the lamp heads — ONE draw call. Intensity follows
//    uniforms.uLights; invisible glows collapse to nothing in the vertex shader (no fill cost by day).
//    Halos gently fade when the camera is very close (no giant sprite in the face).
//  • ?legacylamps restores the old flat additive pools (A/B).

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { addLampLights, type LampLight } from '../../core/lampLight';

const LEGACY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('legacylamps');

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Turn the pools of a glow list into lamp lights (pool + halo of the same lamp = one light). */
function registerPools(glows: Glow[]): void {
  const lights: LampLight[] = [];
  for (let i = 0; i < glows.length; i++) {
    const p = glows[i];
    if (p.halo) continue;
    const c = '#' + new THREE.Color(p.color).getHexString();
    const jitter = 0.9 + 0.2 * hash2(p.x, p.z);
    // the lamp's halo is pushed right before its pool, at the same xz
    let head: Glow | null = null;
    for (const j of [i - 1, i + 1]) {
      const h = glows[j];
      if (h && h.halo && Math.abs(h.x - p.x) < 0.05 && Math.abs(h.z - p.z) < 0.05) head = h;
    }
    if (head) {
      const pole = Math.max(1, head.y - p.y);
      const white = c === '#fff1d6';
      // a little life in the rows of warm lamps: some older amber sodium heads, a few paler ones
      // (the lamp's halo gets the same tint)
      let col = c;
      if (!white) {
        const h = hash2(p.z * 1.7, p.x * 0.9);
        col = h < 0.16 ? '#ffb866' : h > 0.9 ? '#ffd9a0' : c;
        if (col !== c) head.color = col;
      }
      const kind: LampLight['kind'] = pole >= 4.5 ? 'street' : white ? 'plaza' : 'path';
      // park / riverbank / boardwalk lanterns: a broader, gentler glow (isolated bright cores on dark
      // lawns read as polka dots again once the tilt-shift blurs the foreground)
      const soft = kind === 'path';
      lights.push({
        x: head.x,
        y: head.y - 0.12,
        z: head.z,
        pole,
        radius: p.size * (soft ? 1.35 : 1.05),
        color: col,
        intensity: (p.intensity / 0.22) * jitter * (soft ? 0.72 : 1),
        kind,
      });
    } else {
      // kiosk / phone box / bus shelter spill: low, soft, slightly elongated
      lights.push({
        x: p.x,
        y: p.y + 2.3,
        z: p.z,
        pole: 2.3,
        radius: p.size * 1.15,
        color: c,
        intensity: (p.intensity / 0.22) * 0.55 * jitter,
        kind: 'spill',
        stretch: p.stretch,
        yaw: p.yaw,
      });
    }
  }
  addLampLights(lights);
}

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

export function createGlowMesh(u: GlobalUniforms, allGlows: Glow[]): THREE.Mesh {
  let glows = allGlows;
  if (!LEGACY) {
    registerPools(allGlows);
    glows = allGlows.filter((g) => g.halo);
  }
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
