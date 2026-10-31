// Rain: thin streak quads computed entirely in the vertex shader from a static seed buffer (no per-frame CPU work).
//
//   near layer   a dense box in front of the eye (only low down): drops with real size, width from their distance
//   wide layer   a sparser box round the camera's focus, so that a shower still reads from further out
//   splashes     crowns on the ground round the eye (ground height from a small baked map; hidden by depth elsewhere)
//
// Every streak samples the street-lamp map at its own position, so at night the rain shows up as bright needles in the
// lamps' pools and disappears in the dark between them: the look of a wet night.

import * as THREE from 'three';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';

const VERT = /* glsl */ `
#include <common>
attribute vec4 aSeed;   // xyz: position in the unit box, w: phase
attribute float aKind;  // 0 near, 1 wide
${LAMP_GLSL}
uniform vec3 uNear;
uniform vec3 uCenter;
uniform vec4 uBox;      // near size, near height, wide size, wide height
uniform float uTime;
uniform float uLen;
uniform vec2 uWind;
uniform vec2 uAmount;   // x fraction of streaks on, y near layer weight
uniform vec2 uRes;
uniform vec3 uColor;
varying float vAlpha;
varying vec3 vLit;
varying float vAcross;
void main() {
  float size = mix(uBox.x, uBox.z, aKind);
  float h = mix(uBox.y, uBox.w, aKind);
  vec3 c = mix(uNear, uCenter, aKind);
  float fall = 8.0 + 3.0 * aSeed.z;
  float y = h - mod(uTime * fall + aSeed.w * h, h);
  vec2 slant = uWind * 0.5;
  vec2 rel = aSeed.xz * size + slant * (h - y);
  // world-anchored wrap into the box (streaks don't slide with the camera)
  vec2 lo = c.xz - size * 0.5;
  vec3 wp;
  wp.xz = lo + mod(rel - lo, size);
  wp.y = c.y + y - h * 0.3;
  vec3 vel = normalize(vec3(slant.x * fall, -fall, slant.y * fall));
  float len = mix(0.5 + 0.35 * aSeed.z, uLen, aKind);
  vec3 wt = wp - vel * len;
  vec4 ca = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(wt, 1.0);
  vec4 mvPosition = viewMatrix * vec4(mix(wp, wt, position.y), 1.0);
  float dist = max(-mvPosition.z, 0.05);
  vec2 sa = ca.xy / max(ca.w, 0.01) * uRes;
  vec2 sb = cb.xy / max(cb.w, 0.01) * uRes;
  vec2 dir = sb - sa;
  dir /= max(length(dir), 1e-3);
  float px = max(1.0, 0.0038 * projectionMatrix[1][1] * uRes.y / dist);
  vec4 clip = mix(ca, cb, position.y);
  clip.xy += vec2(-dir.y, dir.x) * position.x * px * clip.w / uRes;
  gl_Position = clip;
  vAcross = position.x;
  // thin drops carry less light than the pixels they cover; none right at the lens
  float on = step(aSeed.y, uAmount.x) * mix(uAmount.y, 1.0, aKind);
  // (the air, per streak: the atmosphere's fragment fog on a screenful of needles costs more than they do)
  vAlpha = on * (1.05 / px) * smoothstep(0.6, 2.2, dist) * (0.55 + 0.45 * position.y) * exp(-dist * 0.0016);
  if (on <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vLit = uColor + min(thLampLight(wp, vec3(0.0, 1.0, 0.0)), vec3(3.5)) * 1.1;
}
`;

const FRAG = /* glsl */ `
#include <common>
uniform float uOpacity;
varying float vAlpha;
varying vec3 vLit;
varying float vAcross;
void main() {
  if (vAlpha < 0.004) discard;
  gl_FragColor = vec4(vLit, uOpacity * vAlpha * (1.0 - vAcross * vAcross));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SPLASH_VERT = /* glsl */ `
#include <common>
attribute vec4 aSeed;
${LAMP_GLSL}
uniform vec3 uNear;
uniform float uSize;
uniform float uTime;
uniform float uAmount;
uniform vec3 uColor;
uniform sampler2D tGround;
uniform vec4 uGroundXf;
varying vec2 vQ;
varying float vLife;
varying vec3 vLit;
void main() {
  float rate = 1.6 + 1.4 * aSeed.z;
  float t = uTime * rate + aSeed.w * 13.7;
  float cyc = floor(t);
  float life = t - cyc;
  // a new spot for every drop
  vec2 s = fract(aSeed.xy + cyc * vec2(0.6180339, 0.7548776));
  vec2 lo = uNear.xz - uSize * 0.5;
  vec2 q = lo + mod(s * uSize - lo, uSize);
  vec2 uv = (q - uGroundXf.xy) * uGroundXf.zw;
  float g = textureLod(tGround, uv, 0.0).r;
  vec3 wp = vec3(q.x, g + 0.015, q.y);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float r = 0.012 + 0.05 * sqrt(life) * (0.6 + 0.8 * aSeed.z);
  vec4 mvPosition = viewMatrix * vec4(wp + right * position.x * r + vec3(0.0, (position.y + 1.0) * r * 0.42, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vQ = position.xy;
  float on = step(aSeed.y, uAmount) * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vLife = on * (1.0 - life) * smoothstep(0.0, 0.08, life) * smoothstep(0.6, 3.0, -mvPosition.z);
  if (on <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vLit = uColor * 1.5 + min(thLampLight(wp, vec3(0.0, 1.0, 0.0)), vec3(3.0)) * 1.25;
}
`;

const SPLASH_FRAG = /* glsl */ `
#include <common>
varying vec2 vQ;
varying float vLife;
varying vec3 vLit;
void main() {
  if (vLife < 0.01) discard;
  // a thin, broken ring seen from the side
  float d = length(vec2(vQ.x, vQ.y * 0.55 + 0.42));
  float ring = smoothstep(0.55, 0.85, d) * (1.0 - smoothstep(0.85, 1.0, d));
  gl_FragColor = vec4(vLit, ring * vLife * 0.5);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface Rain {
  mesh: THREE.Mesh;
  splash: THREE.Mesh;
  update(time: number, amount: number, center: THREE.Vector3, distance: number, camera: THREE.Camera, wind: THREE.Vector2, color: THREE.Color, resX: number, resY: number): void;
  /** ground height map for the splashes (R32F, nearest), world xz → uv: (x0, z0, 1/w, 1/d) */
  setGround(tex: THREE.Texture, xf: THREE.Vector4): void;
}

const _fwd = new THREE.Vector3();
const _near = new THREE.Vector3();

function quads(count: number, fill: (i: number, seed: Float32Array, o: number) => void): THREE.BufferGeometry {
  const pos = new Float32Array(count * 4 * 3);
  const seeds = new Float32Array(count * 4 * 4);
  const idx = new Uint32Array(count * 6);
  const s = new Float32Array(4);
  for (let i = 0; i < count; i++) {
    fill(i, s, 0);
    const corners = [-1, 0, 1, 0, -1, 1, 1, 1];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos[v * 3] = corners[k * 2];
      pos[v * 3 + 1] = corners[k * 2 + 1];
      seeds.set(s, v * 4);
    }
    const a = i * 4;
    idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

export function createRain(density: number, seed: () => number): Rain {
  const nNear = Math.round(13000 * density);
  const nWide = Math.round(5000 * density);
  const geo = quads(nNear + nWide, (_i, s) => {
    s[0] = seed();
    s[1] = seed();
    s[2] = seed();
    s[3] = seed();
  });
  const kind = new Float32Array((nNear + nWide) * 4);
  kind.fill(1, nNear * 4);
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const uniforms = {
    ...lampUniforms(),
    uNear: { value: new THREE.Vector3() },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector4(44, 26, 120, 60) },
    uTime: { value: 0 },
    uLen: { value: 1.2 },
    uWind: { value: new THREE.Vector2() },
    uAmount: { value: new THREE.Vector2(0, 1) },
    uRes: { value: new THREE.Vector2(1920, 1025) },
    uColor: { value: new THREE.Color(0.75, 0.8, 0.88) },
    uOpacity: { value: 0.32 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Rain',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 6;

  const nSplash = Math.round(6000 * density);
  const sg = quads(nSplash, (_i, s) => {
    s[0] = seed();
    s[1] = seed();
    s[2] = seed();
    s[3] = seed();
  });
  const su = {
    ...lampUniforms(),
    uNear: uniforms.uNear,
    uSize: { value: 34 },
    uTime: uniforms.uTime,
    uAmount: { value: 0 },
    uColor: uniforms.uColor,
    tGround: { value: null as THREE.Texture | null },
    uGroundXf: { value: new THREE.Vector4(0, 0, 1, 1) },
  };
  const sm = new THREE.ShaderMaterial({
    name: 'RainSplash',
    uniforms: su,
    vertexShader: SPLASH_VERT,
    fragmentShader: SPLASH_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const splash = new THREE.Mesh(sg, sm);
  splash.name = 'rain-splash';
  splash.frustumCulled = false;
  splash.visible = false;
  splash.renderOrder = 6;

  let warmFrames = 6;
  return {
    mesh,
    splash,
    setGround(tex, xf) {
      su.tGround.value = tex;
      su.uGroundXf.value.copy(xf);
    },
    update(time, amount, center, distance, camera, wind, color, resX, resY) {
      // (the first frames draw both with nothing on, so that their programs compile at boot, not when the first rain falls)
      const warm = warmFrames > 0;
      if (warm) warmFrames--;
      mesh.visible = amount > 0.01 || warm;
      const low = 1 - Math.min(1, Math.max(0, (camera.position.y - 25) / 90));
      splash.visible = warm || (mesh.visible && low > 0 && !!su.tGround.value);
      if (!mesh.visible) return;
      const u = uniforms;
      camera.getWorldDirection(_fwd);
      _near.copy(camera.position).addScaledVector(_fwd.setY(0), 15);
      u.uNear.value.copy(_near);
      u.uCenter.value.copy(center);
      u.uBox.value.set(44, 26, Math.min(520, Math.max(90, distance * 1.3)), Math.min(240, Math.max(50, distance * 0.6)));
      u.uTime.value = time;
      u.uLen.value = Math.max(0.9, distance / 130);
      u.uWind.value.copy(wind);
      u.uAmount.value.set(Math.min(1, amount * 1.1), low);
      u.uColor.value.copy(color);
      u.uRes.value.set(resX, resY);
      u.uOpacity.value = 0.17 + 0.17 * Math.min(1, amount);
      su.uAmount.value = Math.min(1, amount * amount * 1.3) * low;
    },
  };
}
