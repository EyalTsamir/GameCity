// Light rain: streaks falling around the camera focus (computed entirely in the
// vertex shader from a static seed buffer — no per-frame CPU work), slanted by the
// wind and scaled with zoom so a shower still reads from the overview.

import * as THREE from 'three';

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aSeed;   // xyz: position in the unit box, w: phase
uniform vec3 uCenter;
uniform float uSize;
uniform float uHeight;
uniform float uTime;
uniform float uLen;
uniform vec2 uWind;
uniform float uAmount;
varying float vAlpha;
void main() {
  float fall = 15.0;
  float h = uHeight;
  float y = h - mod(uTime * fall + aSeed.w * h, h);
  vec2 rel = aSeed.xz * uSize;
  // drift with the wind while falling
  rel += uWind * (h - y) * 0.18;
  // world-anchored wrap into the box around the focus (streaks don't slide with the camera)
  vec3 c = uCenter;
  vec2 lo = c.xz - uSize * 0.5;
  vec3 wp;
  wp.xz = lo + mod(rel - lo, uSize);
  wp.y = c.y + y - h * 0.15;
  // the second vertex of each streak sits higher (position.y = 1 for the tail)
  vec3 vel = normalize(vec3(uWind * 0.18 * fall, -fall));
  wp -= vel * uLen * position.y;
  // only a fraction of streaks for light rain
  vAlpha = step(aSeed.y, uAmount) * (0.55 + 0.45 * position.y);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  if (vAlpha < 0.01) discard;
  gl_FragColor = vec4(uColor, uOpacity * vAlpha);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface Rain {
  mesh: THREE.LineSegments;
  update(time: number, amount: number, center: THREE.Vector3, distance: number, wind: THREE.Vector2, color: THREE.Color): void;
}

export function createRain(count: number, seed: () => number): Rain {
  const pos = new Float32Array(count * 2 * 3);
  const seeds = new Float32Array(count * 2 * 4);
  for (let i = 0; i < count; i++) {
    const sx = seed(),
      sy = seed(),
      sz = seed(),
      sw = seed();
    for (let k = 0; k < 2; k++) {
      const v = i * 2 + k;
      pos[v * 3] = 0;
      pos[v * 3 + 1] = k; // 0 head, 1 tail
      pos[v * 3 + 2] = 0;
      seeds[v * 4] = sx;
      seeds[v * 4 + 1] = sy;
      seeds[v * 4 + 2] = sz;
      seeds[v * 4 + 3] = sw;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uCenter: { value: new THREE.Vector3() },
      uSize: { value: 120 },
      uHeight: { value: 60 },
      uTime: { value: 0 },
      uLen: { value: 1.2 },
      uWind: { value: new THREE.Vector2() },
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color(0.75, 0.8, 0.88) },
      uOpacity: { value: 0.32 },
    },
  ]);
  const material = new THREE.ShaderMaterial({
    name: 'Rain',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.LineSegments(geo, material);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 6;
  return {
    mesh,
    update(time, amount, center, distance, wind, color) {
      mesh.visible = amount > 0.01;
      if (!mesh.visible) return;
      const u = material.uniforms;
      const size = Math.min(420, Math.max(70, distance * 1.25));
      (u.uCenter.value as THREE.Vector3).copy(center);
      u.uSize.value = size;
      u.uHeight.value = Math.min(160, Math.max(40, distance * 0.55));
      u.uTime.value = time;
      u.uLen.value = Math.max(1.0, distance / 70);
      (u.uWind.value as THREE.Vector2).copy(wind);
      u.uAmount.value = Math.min(1, amount);
      (u.uColor.value as THREE.Color).copy(color);
      u.uOpacity.value = 0.18 + 0.2 * Math.min(1, amount);
    },
  };
}
