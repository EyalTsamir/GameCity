// Foam: bow waves, wake trails and prop wash as soft puffs lying on the water (ONE instanced
// draw call). Each puff is written once when spawned (position, drift velocity, birth time,
// size/growth, life, alpha, local swell amplitude); the vertex shader ages it, lets it drift
// and spread, and rides it on the same swell as the water surface (WAVES_GLSL).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { WATER_LEVEL } from '../../core/constants';
import { WAVES_GLSL } from '../../world/water/waves';

const VERT = /* glsl */ `
attribute vec4 aP0; // x0, z0, vx, vz
attribute vec4 aP1; // birth, life, size0, grow
attribute vec4 aP2; // alpha, swell amp, seed, stretch
uniform float uTime;
uniform float uLevel;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vAge;
#include <common>
#include <fog_pars_vertex>
${WAVES_GLSL}
void main() {
  float age = uTime - aP1.x;
  float life = aP1.y;
  if (age < 0.0 || age > life || aP2.x <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vA = 0.0;
    vAge = 1.0;
    return;
  }
  float drift = (1.0 - exp(-0.35 * age)) / 0.35;
  vec2 c = aP0.xy + aP0.zw * drift;
  float size = aP1.z + aP1.w * sqrt(age);
  float u = age / life;
  vA = aP2.x * smoothstep(0.0, 0.05, u) * (1.0 - u * u);
  vAge = u;
  vec2 vel = aP0.zw;
  float vl = length(vel);
  vec2 dir = vl > 1e-3 ? vel / vl : vec2(1.0, 0.0);
  vec2 side = vec2(-dir.y, dir.x);
  vec2 q = position.xz;
  vec2 p = c + (dir * q.x * (1.0 + aP2.w) + side * q.y) * size;
  float y = uLevel + 0.025 + th_swell(p, uTime) * aP2.y;
  vUv = q;
  vSeed = aP2.z;
  vec4 mvPosition = viewMatrix * vec4(p.x, y, p.y, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uDay;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vAge;
#include <common>
#include <fog_pars_fragment>
float wkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wkNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wkHash(i), wkHash(i + vec2(1.0, 0.0)), f.x), mix(wkHash(i + vec2(0.0, 1.0)), wkHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float r = length(vUv);
  if (r > 1.0 || vA <= 0.002) discard;
  float edge = 1.0 - smoothstep(0.45, 1.0, r);
  // lacy, breaking foam: fresh foam is solid, older foam tears into streaks
  float n = wkNoise(vUv * 2.7 + vSeed * 31.0) * 0.62 + wkNoise(vUv * 6.5 - vSeed * 17.0) * 0.38;
  float th = mix(0.18, 0.56, vAge);
  float lace = smoothstep(th, th + 0.2, n * (0.55 + 0.45 * edge)) * edge;
  float a = clamp(vA * lace * 1.15, 0.0, 0.95);
  vec3 col = vec3(1.0, 1.0, 1.0) * (0.09 + 1.0 * uDay);
  gl_FragColor = vec4(col, a);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
}
`;

export class Wakes {
  readonly mesh: THREE.Mesh;
  readonly cap: number;
  private p0: THREE.InstancedBufferAttribute;
  private p1: THREE.InstancedBufferAttribute;
  private p2: THREE.InstancedBufferAttribute;
  private head = 0;
  private lo = Infinity;
  private hi = -1;
  private wrapped = false;
  spawned = 0;

  constructor(ctx: CityContext, cap = 1024) {
    this.cap = cap;
    const base = new THREE.PlaneGeometry(2, 2, 1, 1);
    base.rotateX(-Math.PI / 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    this.p0 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.p1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.p2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.p0, this.p1, this.p2]) a.setUsage(THREE.DynamicDrawUsage);
    // all puffs start dead (birth far in the past)
    for (let i = 0; i < cap; i++) this.p1.setXYZW(i, -1e6, 1, 0, 0);
    geo.setAttribute('aP0', this.p0);
    geo.setAttribute('aP1', this.p1);
    geo.setAttribute('aP2', this.p2);
    geo.instanceCount = cap;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLevel: { value: WATER_LEVEL } }]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    mat.uniforms.uTime = ctx.uniforms.uTime;
    mat.uniforms.uDay = ctx.uniforms.uDaylight;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'boats-wakes';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** add one puff (world xz, drift velocity, birth = now) */
  spawn(now: number, x: number, z: number, vx: number, vz: number, size0: number, grow: number, life: number, alpha: number, amp: number, stretch = 0): void {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    if (this.head === 0) this.wrapped = true;
    this.p0.setXYZW(i, x, z, vx, vz);
    this.p1.setXYZW(i, now, life, size0, grow);
    this.p2.setXYZW(i, alpha, amp, (i * 0.618034) % 1, stretch);
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    this.spawned++;
  }

  commit(): void {
    if (this.hi < 0) return;
    for (const a of [this.p0, this.p1, this.p2]) {
      a.clearUpdateRanges();
      if (this.wrapped) a.addUpdateRange(0, this.cap * 4);
      else a.addUpdateRange(this.lo * 4, (this.hi - this.lo + 1) * 4);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
    this.wrapped = false;
  }
}
