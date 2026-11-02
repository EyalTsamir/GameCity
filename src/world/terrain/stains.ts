// Drips and rust on the stonework of the places (`wearwall`, docs/progress/sweep-wear.md). They used to be opaque quads a little
// proud of the wall, a flat colour with ruled edges hanging from the coping, and their colour hid the courses behind them. Here they
// are a ratio on what is already drawn, as the harbour's stains are: the joints come through, the run is broken into lanes by the
// way water goes down a wall, it narrows and dies out as it falls. The wet bands at the foot of a wall are one ramp by height above
// the water or the soil, wandering and running down in fingers, in place of a stack of flat strips with torn edges. One draw for the
// whole town, only over its own few pixels.

import * as THREE from 'three';
import { roadNoise } from '../roads/materials';

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
  float dist = length(cameraPosition - vW);
  if (vL.z > 1.5) {
    // a band: vL.x 0..1 up the quad, vL.y metres above the water or the soil
    vec2 q = vW.xy;
    float pore = texture2D(tN, q * 5.1).a - 0.5;
    float h = vL.y + (texture2D(tN, q * vec2(0.13, 0.05)).r - 0.5) * 0.25 + (texture2D(tN, q * vec2(1.1, 0.6)).g - 0.5) * 0.12 + (texture2D(tN, q * vec2(2.3, 0.22)).b - 0.5) * 0.22 + pore * 0.04;
    vec3 ratio;
    if (vL.z < 2.5) {
      ratio = mix(vec3(1.0), vec3(0.58, 0.57, 0.54), 1.0 - smoothstep(0.0, 0.62, h));
      ratio = mix(ratio, vec3(0.24, 0.24, 0.22), 1.0 - smoothstep(-0.02, 0.26, h));
      vec3 slime = mix(vec3(0.11, 0.15, 0.07), vec3(0.16, 0.25, 0.08), smoothstep(0.52, 0.72, texture2D(tN, q * vec2(0.9, 1.4)).r));
      ratio = mix(ratio, slime, 1.0 - smoothstep(-0.06, 0.12, h));
    } else {
      ratio = mix(vec3(1.0), vec3(0.72, 0.7, 0.63), 1.0 - smoothstep(0.05, 0.5, h));
      ratio = mix(ratio, vec3(0.42, 0.48, 0.28), 1.0 - smoothstep(0.0, 0.2, h));
    }
    ratio = mix(vec3(1.0), ratio, (1.0 - smoothstep(0.7, 1.0, vL.x)) * (1.0 - smoothstep(300.0, 700.0, dist)));
    gl_FragColor = vec4(ratio, 1.0);
    return;
  }
  if (dist > 280.0) discard;
  // across the run, along the fall (vL.z: lying on a flat top, it runs towards +Z)
  vec2 p = vec2(vW.x, vL.z > 0.5 ? vW.z : vW.y);
  float lane = texture2D(tN, p * vec2(1.7, 0.16)).r * 0.6 + texture2D(tN, p * vec2(5.3, 0.55)).g * 0.4;
  float fine = texture2D(tN, p * 2.3).b;
  float a = 1.0 - smoothstep(0.3, 1.0, abs(vL.x) + (lane - 0.5) * 1.1);
  // wettest where it starts, gone before the quad ends, and the end is ragged
  float v = vL.y + (fine - 0.5) * 0.3;
  a *= (1.0 - smoothstep(0.15, 0.95, v)) * smoothstep(-0.2, 0.02, vL.y);
  a *= (0.45 + 1.1 * lane) * (0.72 + 0.56 * texture2D(tN, p * 7.3).a);
  if (a <= 0.003) discard;
  vec3 ratio = mix(vec3(1.0), vT, clamp(a, 0.0, 1.0) * (1.0 - smoothstep(140.0, 280.0, dist)));
  gl_FragColor = vec4(ratio, 1.0);
}
`;

export type Tone = readonly [number, number, number];

export class PlaceStains {
  private P: number[] = [];
  private L: number[] = [];
  private T: number[] = [];
  private I: number[] = [];

  private quad(a: number[], b: number[], c: number[], d: number[], tone: Tone, flat: number): void {
    const n = this.P.length / 3;
    const loc = [
      [-1, 1],
      [1, 1],
      [1, 0],
      [-1, 0],
    ];
    [a, b, c, d].forEach((p, i) => {
      this.P.push(p[0], p[1], p[2]);
      this.L.push(loc[i][0], loc[i][1], flat);
      this.T.push(tone[0], tone[1], tone[2]);
    });
    this.I.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }

  /** a run down a wall facing +Z, starting at (x, top): `w` wide at the start, `len` long */
  run(x: number, z: number, top: number, w: number, len: number, tone: Tone): void {
    const h = w * 1.5,
      lo = h * 0.75;
    this.quad([x - lo, top - len, z], [x + lo, top - len, z], [x + h, top, z], [x - h, top, z], tone, 0);
  }

  /** a run across a flat top from (x, z0) towards +Z */
  flat(x: number, y: number, z0: number, z1: number, w: number, tone: Tone): void {
    const h = w * 1.5,
      lo = h * 0.75;
    this.quad([x - lo, y, z1], [x + lo, y, z1], [x + h, y, z0], [x - h, y, z0], tone, 1);
  }

  /** the wet at the foot of a wall facing +Z, from y0 up to y1. y00: what its height is measured from; moss: soil and moss, not river */
  band(x0: number, x1: number, z: number, y0: number, y1: number, y00: number, moss: boolean): void {
    const n = this.P.length / 3;
    for (const [x, y, u] of [
      [x0, y0, 0],
      [x1, y0, 0],
      [x1, y1, 1],
      [x0, y1, 1],
    ]) {
      this.P.push(x, y, z);
      this.L.push(u, y - y00, moss ? 3 : 2);
      this.T.push(1, 1, 1);
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
      name: 'terrain-stains',
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
    mesh.name = 'terrain-stains';
    mesh.renderOrder = -79;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
