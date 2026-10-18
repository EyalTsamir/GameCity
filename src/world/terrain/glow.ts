// Night glows for the terrain's own lights (promenade lamps, portal lanterns, tunnel lamps):
// camera-facing halos in ONE additive draw call; intensity follows uniforms.uLights (tunnel lamps
// keep a faint glow by day). The ground pools are registered as real light sources in the shared
// lamp light map (core/lampLight.ts) instead of being drawn — each pool is paired with the halo of
// its lamp (head height, aim); ?legacylamps draws the old flat additive pools again.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { addLampLights, type LampLight } from '../../core/lampLight';

const LEGACY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('legacylamps');

function registerPools(points: GlowPoint[]): void {
  const halos = points.filter((p) => p.kind === 'halo');
  const out: LampLight[] = [];
  for (const p of points) {
    if (p.kind !== 'pool') continue;
    let best: GlowPoint | null = null,
      bd = 2.6;
    for (const h of halos) {
      if (h.y < p.y + 1) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    const color = '#' + new THREE.Color(p.color).getHexString();
    const intensity = (p.intensity / 0.22) * 0.95;
    if (best) {
      const pole = best.y - p.y;
      const portal = pole > 5.5;
      // promenade lamps: wider and gentler so the row along the river reads as one lit walk
      const rad = p.size * (portal ? 1.1 : 1.4);
      const l: LampLight = { x: best.x, y: best.y, z: best.z, pole, radius: rad, color, intensity: intensity * (portal ? 1 : 0.8), kind: portal ? 'portal' : 'path' };
      if (bd > 0.3) {
        // wall / railing lamp throwing its light forward: aimed at the old pool centre
        l.aim = [p.x, p.y, p.z];
        l.cone = Math.atan2(rad, Math.hypot(bd, pole)) + 0.25;
      }
      out.push(l);
    } else {
      out.push({ x: p.x, y: p.y + 3, z: p.z, pole: 3, radius: p.size, color, intensity: intensity * 0.7, kind: 'spill' });
    }
  }
  addLampLights(out);
}

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

export function createGlows(ctx: CityContext, allPoints: GlowPoint[]): THREE.Mesh {
  let points = allPoints;
  if (!LEGACY) {
    registerPools(allPoints);
    points = allPoints.filter((p) => p.kind !== 'pool');
  }
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
