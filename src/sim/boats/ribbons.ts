// Continuous wakes: per boat a short history of its track (one sample every ~0.14 L travelled)
// becomes three foam ribbons every frame — the two arms of the Kelvin V (crest lines leaving the
// bow shoulders and spreading at ~19.5°, i.e. 0.354·v·age sideways) and the turbulent stern wash
// (a widening band, solid near the stern, tearing into lace as it ages). ONE draw call for the
// whole fleet. The geometry is rebuilt on the CPU only for boats near the view (a few hundred
// vertices); the vertex shader rides it on the same swell as the water (WAVES_GLSL), the fragment
// shader breaks the foam up with world-space lace noise that stays put on the water.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { WATER_LEVEL } from '../../core/constants';
import { WAVES_GLSL } from '../../world/water/waves';
import { macroTexture } from '../../world/water/noise';

/** samples kept per boat (ring) */
const S = 40;
/** points per ribbon: live tip + samples */
const P = S + 1;
const RIBBONS_PER_BOAT = 3;
/** floats per vertex: x, amp, z, across, age, strength, kind, seed */
const STRIDE = 8;

const VERT = /* glsl */ `
attribute vec4 aR; // across (-1..1), age 0..1, strength, kind (0 arm, 1 wash)
attribute float aSeed;
uniform float uTime;
uniform float uLevel;
varying vec3 vW;
varying vec4 vR;
varying float vSeed;
#include <common>
#include <fog_pars_vertex>
${WAVES_GLSL}
void main() {
  vec3 p = position;
  float y = uLevel + 0.035 + aR.w * 0.004 + th_swell(p.xz, uTime) * p.y;
  vW = vec3(p.x, y, p.z);
  vR = aR;
  vSeed = aSeed;
  vec4 mvPosition = viewMatrix * vec4(p.x, y, p.z, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tWM;
uniform float uTime;
uniform vec3 uFoamLight;
varying vec3 vW;
varying vec4 vR;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  float across = abs(vR.x);
  float age = vR.y;
  float str = vR.z;
  float wash = vR.w;
  if (str <= 0.002) discard;
  vec2 q = vW.xz;
  float n1 = texture2D(tWM, q * (1.0 / 6.3) + vec2(vSeed * 0.37, uTime * 0.004)).b;
  float n2 = texture2D(tWM, q * (1.0 / 2.1) - vec2(uTime * 0.011, vSeed * 0.53)).b;
  float n3 = texture2D(tWM, q * (1.0 / 0.83) + vec2(vSeed, uTime * 0.02)).b;
  float n = n1 * 0.5 + n2 * 0.33 + n3 * 0.17;
  n = smoothstep(0.28, 0.72, n);
  float aa = max(fwidth(n) * 1.5, 0.05);
  // ragged edges: the foam band's outline wanders with the noise
  float ac = across + (n2 - 0.5) * 0.55;
  float a;
  if (wash > 0.5) {
    // stern wash: solid churn right at the stern, then lace that opens up and dissolves
    float prof = 1.0 - smoothstep(0.2, 1.0, ac);
    float cover = mix(0.9, 0.12, pow(age, 0.55));
    float lace = smoothstep(1.0 - cover - aa, 1.0 - cover + aa, n * mix(0.65, 1.1, prof));
    float core = (1.0 - smoothstep(0.0, 0.06, age)) * (1.0 - smoothstep(0.15, 0.7, across));
    a = max(lace * prof, core * 0.95) * str;
    // aerated, smoothed water around the foam (reads from far away)
    a = max(a, 0.1 * (1.0 - smoothstep(0.3, 1.0, across)) * str * (1.0 - age));
  } else {
    // Kelvin arm: a thin breaking crest that frays and fades outward
    float prof = 1.0 - smoothstep(0.05, 0.75, ac);
    float cover = mix(0.75, 0.1, age);
    float lace = smoothstep(1.0 - cover - aa, 1.0 - cover + aa, n * mix(0.6, 1.1, prof));
    a = lace * prof * str;
    a = max(a, 0.06 * (1.0 - smoothstep(0.1, 1.0, across)) * str * (1.0 - age));
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(uFoamLight, clamp(a, 0.0, 0.95));
  #ifdef USE_FOG
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
}
`;

interface Track {
  /** ring of samples: x, z, fx, fz, v, birth, amp, reverse */
  d: Float32Array;
  head: number;
  n: number;
  acc: number;
  lastX: number;
  lastZ: number;
}

export interface RibbonBoat {
  id: number;
  type: string;
  x: number;
  z: number;
  yaw: number;
  v: number;
  vSigned: number;
  dims: { L: number; B: number };
}

/** per type: [arm strength, wash strength, life (s) at speed, spread factor] */
const LOOK: Record<string, [number, number, number, number]> = {
  ferry: [0.85, 1.0, 26, 1.0],
  tug: [0.9, 1.0, 22, 1.0],
  tour: [0.6, 0.7, 20, 0.9],
  sail: [0.45, 0.4, 14, 0.9],
  motor: [1.0, 1.0, 16, 1.1],
  row: [0.25, 0.12, 8, 0.8],
};

export class WakeRibbons {
  readonly mesh: THREE.Mesh;
  private buf: Float32Array;
  private ibuf: THREE.InterleavedBuffer;
  private tracks = new Map<number, Track>();
  private maxRibbons: number;
  private pts = new Float32Array(P * 6); // cx, cz, halfwidth, age01, strength, amp
  private tan = new Float32Array(P * 2);
  readonly foamLight = new THREE.Color(1, 1, 1);
  ribbons = 0;
  verts = 0;

  constructor(ctx: CityContext, maxBoats: number) {
    this.maxRibbons = maxBoats * RIBBONS_PER_BOAT;
    const nv = this.maxRibbons * P * 2;
    this.buf = new Float32Array(nv * STRIDE);
    this.ibuf = new THREE.InterleavedBuffer(this.buf, STRIDE);
    this.ibuf.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(this.ibuf, 3, 0));
    geo.setAttribute('aR', new THREE.InterleavedBufferAttribute(this.ibuf, 4, 3));
    geo.setAttribute('aSeed', new THREE.InterleavedBufferAttribute(this.ibuf, 1, 7));
    const idx: number[] = [];
    for (let r = 0; r < this.maxRibbons; r++) {
      const b = r * P * 2;
      for (let k = 0; k < P - 1; k++) {
        const a = b + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLevel: { value: WATER_LEVEL } }]),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    mat.uniforms.uTime = ctx.uniforms.uTime;
    mat.uniforms.tWM = { value: macroTexture() };
    mat.uniforms.uFoamLight = { value: this.foamLight };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'boats-wake-ribbons';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** record the track (call every sim sub-step) */
  step(b: RibbonBoat, now: number, amp: number): void {
    let tr = this.tracks.get(b.id);
    if (!tr) {
      tr = { d: new Float32Array(S * 8), head: 0, n: 0, acc: 0, lastX: b.x, lastZ: b.z };
      this.tracks.set(b.id, tr);
    }
    if (tr.n > 0 && tr.d[((tr.head - 1 + S) % S) * 8 + 5] > now + 0.5) tr.n = 0;
    const moved = Math.hypot(b.x - tr.lastX, b.z - tr.lastZ);
    tr.lastX = b.x;
    tr.lastZ = b.z;
    if (b.v < 0.3) {
      tr.acc = 0;
      return;
    }
    tr.acc += moved;
    // the ring must span the whole life of the wake at this speed (curves stay smooth enough)
    const look = LOOK[b.type] ?? LOOK.motor;
    const spacing = Math.min(4, Math.max(0.7, b.dims.L * 0.12, (b.v * look[2]) / (S - 3)));
    if (tr.acc < spacing && tr.n > 0) return;
    tr.acc = 0;
    const k = tr.head * 8;
    const d = tr.d;
    d[k] = b.x;
    d[k + 1] = b.z;
    d[k + 2] = Math.sin(b.yaw);
    d[k + 3] = Math.cos(b.yaw);
    d[k + 4] = b.v;
    d[k + 5] = now;
    d[k + 6] = amp;
    d[k + 7] = b.vSigned < 0 ? 1 : 0;
    tr.head = (tr.head + 1) % S;
    tr.n = Math.min(S, tr.n + 1);
  }

  /** rebuild the ribbons of the boats in `near` (call once per frame) */
  build(boats: readonly RibbonBoat[], isNear: (b: RibbonBoat) => boolean, now: number, ampAt: (x: number, z: number) => number): void {
    let r = 0;
    for (const b of boats) {
      if (r + RIBBONS_PER_BOAT > this.maxRibbons) break;
      const tr = this.tracks.get(b.id);
      if (!tr || tr.n === 0 || !isNear(b)) continue;
      // sim time went backwards (time jump): the recorded track is stale
      if (tr.d[((tr.head - 1 + S) % S) * 8 + 5] > now + 0.5) {
        tr.n = 0;
        continue;
      }
      const look = LOOK[b.type] ?? LOOK.motor;
      // usable samples: newest first, younger than the life span
      const life = look[2] * (0.6 + 0.4 * Math.min(1, b.v / 3 + 0.5));
      let m = 0;
      for (let i = 0; i < tr.n; i++) {
        const k = ((tr.head - 1 - i + S) % S) * 8;
        if (now - tr.d[k + 5] > life) break;
        m++;
      }
      if (m === 0 && b.v < 0.3) continue;
      this.cur.kV = Math.min(1, b.v / (b.type === 'motor' ? 5 : 2.6));
      this.cur.look = look;
      this.cur.life = life;
      this.cur.fwd = b.vSigned >= 0;
      const tipAmp = ampAt(b.x, b.z);
      this.ribbon(r++, tr, b, m, now, tipAmp, 0);
      this.ribbon(r++, tr, b, m, now, tipAmp, -1);
      this.ribbon(r++, tr, b, m, now, tipAmp, 1);
    }
    // collapse unused slots of this frame
    this.ribbons = r;
    this.verts = r * P * 2;
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, r * (P - 1) * 6);
    this.ibuf.clearUpdateRanges();
    if (r > 0) {
      this.ibuf.addUpdateRange(0, r * P * 2 * STRIDE);
      this.ibuf.needsUpdate = true;
    }
    this.mesh.visible = r > 0;
  }

  private shape = new Float32Array(4);

  private cur = { kV: 0, look: LOOK.motor, life: 10, fwd: true };

  /**
   * one ribbon into slot `slot`: point 0 = live tip (age 0, the boat now), then the samples.
   * side 0 = stern wash, ±1 = Kelvin arm on that side.
   */
  private ribbon(slot: number, tr: Track, b: RibbonBoat, m: number, now: number, tipAmp: number, side: number): void {
    const { kV, look, life, fwd } = this.cur;
    const L = b.dims.L,
      B = b.dims.B;
    const pts = this.pts;
    const o = this.shape;
    const kind = side === 0 ? 1 : 0;
    const n = m + 1;
    for (let i = 0; i < n; i++) {
      let x: number, z: number, fx: number, fz: number, v: number, age: number, amp: number, rev: number;
      if (i === 0) {
        x = b.x;
        z = b.z;
        fx = Math.sin(b.yaw);
        fz = Math.cos(b.yaw);
        v = b.v;
        age = 0;
        amp = tipAmp;
        rev = b.vSigned < 0 ? 1 : 0;
      } else {
        const k = ((tr.head - i + S) % S) * 8;
        const d = tr.d;
        x = d[k];
        z = d[k + 1];
        fx = d[k + 2];
        fz = d[k + 3];
        v = d[k + 4];
        age = Math.min(1, Math.max(0, (now - d[k + 5]) / life));
        amp = d[k + 6];
        rev = d[k + 7];
      }
      if (side === 0) {
        const back = rev > 0.5 ? -1 : 1;
        o[0] = -fx * L * 0.47 * back;
        o[1] = -fz * L * 0.47 * back;
        o[2] = B * 0.36 + (0.22 + 0.05 * v) * Math.pow(age * life, 0.75) * look[3];
        o[3] = look[1] * Math.min(1, v / 1.5 + 0.15) * (1 - age) * (1 - age);
      } else {
        const lat = B * 0.46 + 0.354 * v * age * life * look[3];
        o[0] = fx * L * 0.36 + fz * side * lat;
        o[1] = fz * L * 0.36 - fx * side * lat;
        o[2] = 0.22 + 0.06 * B + 0.05 * v * Math.sqrt(age * life);
        o[3] = rev > 0.5 || !fwd ? 0 : look[0] * kV * Math.pow(1 - age, 1.6) * Math.min(1, age * life * 2.5 + 0.35);
      }
      const j = i * 6;
      pts[j] = x + o[0];
      pts[j + 1] = z + o[1];
      pts[j + 2] = o[2];
      pts[j + 3] = age;
      pts[j + 4] = o[3];
      pts[j + 5] = amp;
    }
    // tangents (central differences); a degenerate ribbon falls back to the heading
    const tan = this.tan;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1),
        c = Math.min(n - 1, i + 1);
      let tx = pts[c * 6] - pts[a * 6],
        tz = pts[c * 6 + 1] - pts[a * 6 + 1];
      const l = Math.hypot(tx, tz);
      if (l < 1e-4) {
        tx = Math.sin(b.yaw);
        tz = Math.cos(b.yaw);
      } else {
        tx /= l;
        tz /= l;
      }
      tan[i * 2] = tx;
      tan[i * 2 + 1] = tz;
    }
    const buf = this.buf;
    const seed = (b.id * 0.618 + slot * 0.29) % 1;
    let w = slot * P * 2 * STRIDE;
    for (let i = 0; i < P; i++) {
      const ii = Math.min(i, n - 1);
      const j = ii * 6;
      const hw = pts[j + 2];
      const nx = -tan[ii * 2 + 1],
        nz = tan[ii * 2];
      // the tail beyond the last sample collapses (zero area, zero strength)
      const str = i < n ? pts[j + 4] : 0;
      for (let s = -1; s <= 1; s += 2) {
        buf[w] = pts[j] + nx * hw * s;
        buf[w + 1] = pts[j + 5];
        buf[w + 2] = pts[j + 1] + nz * hw * s;
        buf[w + 3] = s;
        buf[w + 4] = pts[j + 3];
        buf[w + 5] = str;
        buf[w + 6] = kind;
        buf[w + 7] = seed;
        w += STRIDE;
      }
    }
  }
}
