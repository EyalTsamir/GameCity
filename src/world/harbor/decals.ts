// Stains on the harbour's concrete (`wearquay`, docs/progress/sweep-wear.md): oil, rust, fish-water, wet patches. They used to be
// quads cut out of the solid mesh with a hard edge and a flat colour of their own, lying on the ground like stickers and hiding its
// grain. Here they are a ratio on what is already drawn, as closemat and the hand-height stains are: no light of their own, the
// concrete's joints, grain and close-up surface come through, and the edge dies away into the pores. One draw, only where the
// harbour is on screen. The ground falls to the sea (+X), so what is spilled runs out in fingers that way.

import * as THREE from 'three';
import { roadNoise } from '../roads/materials';

/** the quay's concrete (surfaces.ts), which the old colours were chosen against */
const BASE = [0.42, 0.405, 0.375];
const _c = new THREE.Color();

const VERT = /* glsl */ `
attribute vec3 aTone;
attribute vec3 aLoc;
varying vec3 vT;
varying vec3 vL;
varying vec3 vW;
void main() {
  vT = aTone;
  vL = aLoc;
  vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tN;
varying vec3 vT;
varying vec3 vL;
varying vec3 vW;
void main() {
  vec2 p = vW.xz;
  float dist = length(cameraPosition - vW);
  if (dist > 280.0) discard;
  // the shape: long along the fall, broken at three sizes
  vec2 fq = p * vec2(0.42, 1.15);
  float n = texture2D(tN, fq * 0.22).r * 0.5 + texture2D(tN, fq * 0.8).g * 0.3 + texture2D(tN, p * 2.3).b * 0.2;
  float e = length(vL.xy);
  float a = 1.0 - smoothstep(0.3, 1.02, e + (n - 0.5) * 1.5);
  float wet = step(0.5, abs(vL.z));
  vec3 ratio = vT;
  if (wet > 0.5) {
    // a film of water: darker, and a mirror for the sky at a low angle; loose drops at the rim
    vec2 dc = p / 0.07;
    vec2 di = floor(dc);
    float dh = fract(sin(dot(di, vec2(7.13, 3.71))) * 43758.5453);
    float drop = step(0.86, dh) * (1.0 - step(0.3 + 0.14 * fract(dh * 9.0), length(fract(dc) - 0.5))) * (1.0 - smoothstep(0.7, 1.25, e));
    a = max(smoothstep(0.0, 0.25, a), drop);
    float fres = pow(1.0 - clamp((cameraPosition.y - vW.y) / max(dist, 0.01), 0.0, 1.0), 4.0);
    ratio = mix(ratio, vec3(1.35, 1.4, 1.45), fres * 0.75);
  } else {
    // soaked into the pores
    a *= 0.72 + 0.56 * texture2D(tN, p * 7.3).a;
  }
  if (a <= 0.003) discard;
  ratio = mix(vec3(1.0), ratio, clamp(a, 0.0, 1.0) * (1.0 - smoothstep(140.0, 280.0, dist)));
  gl_FragColor = vec4(ratio, 1.0);
}
`;

export class QuayDecals {
  private P: number[] = [];
  private L: number[] = [];
  private T: number[] = [];
  private I: number[] = [];

  /** col: the stain's old flat colour; strength 0..1 how much of the difference from the concrete it takes */
  add(x: number, y: number, z: number, w: number, d: number, col: THREE.ColorRepresentation, wet: boolean, strength = 1): void {
    _c.set(col);
    // (a soft stain reads far darker than the same colour cut out with an edge, and the ground shows through it)
    const k = 0.36 * strength;
    const tone = [Math.pow(_c.r / BASE[0], k), Math.pow(_c.g / BASE[1], k), Math.pow(_c.b / BASE[2], k)];
    const n = this.P.length / 3;
    const hx = w / 2,
      hz = d / 2;
    for (const [sx, sz] of [
      [-1, -1],
      [-1, 1],
      [1, 1],
      [1, -1],
    ]) {
      this.P.push(x + sx * hx, y, z + sz * hz);
      this.L.push(sx, sz, wet ? 1 : 0);
      this.T.push(tone[0], tone[1], tone[2]);
    }
    this.I.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }

  mesh(): THREE.Mesh | null {
    if (this.I.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('aLoc', new THREE.Float32BufferAttribute(this.L, 3));
    g.setAttribute('aTone', new THREE.Float32BufferAttribute(this.T, 3));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    const m = new THREE.ShaderMaterial({
      name: 'harbor-stains',
      uniforms: { tN: { value: roadNoise() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'harbor-stains';
    mesh.renderOrder = -79;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
