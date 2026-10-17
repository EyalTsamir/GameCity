// Night glows (camera-facing halos and flat light pools) in ONE additive draw call, with
// per-glow slots that can be moved every frame (train lamps, boat navigation lights) or
// written once (platform lamps). Flash groups let the GPU blink crossing lamps / show signal
// aspects without CPU work:
//   group 0 steady · 1..4 crossing lamps (c0A, c0B, c1A, c1B) · 5/6 boom lamps (c0/c1)
//   7..14 signal i red (7+2i) / green (8+2i)

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec4 aInfo; // half size, flat (0 halo / 1 pool), intensity, day fraction
attribute vec4 aTint; // rgb, flash group
uniform float uLights;
uniform float uTime;
uniform vec4 uXing;
uniform vec4 uSig;
varying vec2 vUv;
varying vec3 vCol;
#include <common>
#include <fog_pars_vertex>
float glGroup(float gr) {
  int g = int(gr + 0.5);
  if (g == 0) return 1.0;
  if (g <= 4) {
    float fl = g <= 2 ? uXing.x : uXing.y;
    float ph = (g == 1 || g == 3) ? 0.0 : 0.5;
    return step(0.5, fract(uTime * 0.95 + ph)) * fl;
  }
  if (g <= 6) {
    float fl = g == 5 ? uXing.x : uXing.y;
    float gt = g == 5 ? uXing.z : uXing.w;
    return fl * step(0.02, gt) * (0.6 + 0.4 * step(0.5, fract(uTime * 0.95)));
  }
  int si = (g - 7) / 2;
  bool green = (g - 7 - si * 2) == 1;
  float asp = si == 0 ? uSig.x : (si == 1 ? uSig.y : (si == 2 ? uSig.z : uSig.w));
  return green ? asp : 1.0 - asp;
}
void main() {
  vUv = aCorner;
  float k = aInfo.z * max(uLights, aInfo.w) * glGroup(aTint.w);
  vCol = aTint.rgb * k;
  vec4 mvPosition;
  if (aInfo.y > 0.5) {
    mvPosition = modelViewMatrix * vec4(aCenter + vec3(aCorner.x, 0.0, aCorner.y) * aInfo.x, 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
    mvPosition.xy += aCorner * aInfo.x;
    // pull halos slightly toward the camera so they are not buried in their lamp housing
    mvPosition.xyz += normalize(-mvPosition.xyz) * min(aInfo.x * 0.6, 0.6);
  }
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
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}
`;

export interface GlowUniforms {
  uXing?: { value: THREE.Vector4 };
  uSig?: { value: THREE.Vector4 };
}

export class Glows {
  readonly mesh: THREE.Mesh;
  private center: THREE.BufferAttribute;
  private info: THREE.BufferAttribute;
  private tint: THREE.BufferAttribute;
  private dirtyC = false;
  private dirtyI = false;
  readonly capacity: number;
  private _c = new THREE.Color();

  constructor(ctx: CityContext, capacity: number, name: string, extra: GlowUniforms = {}) {
    this.capacity = capacity;
    const n = capacity;
    const center = new Float32Array(n * 4 * 3);
    const corner = new Float32Array(n * 4 * 2);
    const info = new Float32Array(n * 4 * 4);
    const tint = new Float32Array(n * 4 * 4);
    const idx = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
    const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let i = 0; i < n; i++) {
      corner.set(corners, i * 8);
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    this.center = new THREE.BufferAttribute(center, 3);
    this.info = new THREE.BufferAttribute(info, 4);
    this.tint = new THREE.BufferAttribute(tint, 4);
    this.center.setUsage(THREE.DynamicDrawUsage);
    this.info.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    geo.setAttribute('aCenter', this.center);
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setAttribute('aInfo', this.info);
    geo.setAttribute('aTint', this.tint);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    // the glows are updated freely: never frustum-cull the whole batch
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    });
    mat.uniforms.uLights = ctx.uniforms.uLights;
    mat.uniforms.uTime = ctx.uniforms.uTime;
    mat.uniforms.uXing = extra.uXing ?? { value: new THREE.Vector4() };
    mat.uniforms.uSig = extra.uSig ?? { value: new THREE.Vector4() };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = name;
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** configure glow slot i (colour, size, kind, flash group); position via move() */
  setup(i: number, color: THREE.ColorRepresentation, halfSize: number, intensity: number, pool = false, day = 0, group = 0): void {
    this._c.set(color);
    for (let k = 0; k < 4; k++) {
      this.info.setXYZW(i * 4 + k, halfSize, pool ? 1 : 0, intensity, day);
      this.tint.setXYZW(i * 4 + k, this._c.r, this._c.g, this._c.b, group);
    }
    this.dirtyI = true;
    this.tint.needsUpdate = true;
  }

  /** change intensity only (0 hides the glow) */
  intensity(i: number, v: number): void {
    const cur = this.info.getZ(i * 4);
    if (Math.abs(cur - v) < 1e-4) return;
    for (let k = 0; k < 4; k++) this.info.setZ(i * 4 + k, v);
    this.dirtyI = true;
  }

  move(i: number, x: number, y: number, z: number): void {
    const a = this.center.array as Float32Array;
    const o = i * 12;
    if (a[o] === x && a[o + 1] === y && a[o + 2] === z) return;
    for (let k = 0; k < 4; k++) {
      a[o + k * 3] = x;
      a[o + k * 3 + 1] = y;
      a[o + k * 3 + 2] = z;
    }
    this.dirtyC = true;
  }

  commit(): void {
    if (this.dirtyC) {
      this.center.needsUpdate = true;
      this.dirtyC = false;
    }
    if (this.dirtyI) {
      this.info.needsUpdate = true;
      this.dirtyI = false;
    }
  }
}
