// Lightning: in a storm, every few seconds of real time, a flash in the deck, and sometimes a stroke to the ground in the
// direction the camera looks at. A flash is a short train of decaying pulses; the sky module turns the value into light
// (ambient, sky, the deck around the stroke). The stroke is one small ribbon mesh, rebuilt into preallocated arrays.
// Emits 'lightning' ({ distance, power }): thunder is a matter of whoever makes sound.

import * as THREE from 'three';
import type { EventBus } from '../../core/events';

const MAX_SEG = 96;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 aDir;
attribute vec2 aSide; // x side -1..1, y width (m)
uniform vec2 uRes;
varying float vX;
void main() {
  vec4 mvPosition = viewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mvPosition;
  vec4 c2 = projectionMatrix * viewMatrix * vec4(position + aDir, 1.0);
  vec2 d = c2.xy / c2.w - clip.xy / clip.w;
  d = normalize(d * uRes + vec2(1e-5));
  float px = max(1.3, aSide.y * projectionMatrix[1][1] * uRes.y * 0.5 / max(-mvPosition.z, 1.0));
  clip.xy += vec2(-d.y, d.x) * aSide.x * px * clip.w * 2.0 / uRes;
  gl_Position = clip;
  vX = aSide.x;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#define TH_FOG_ADDITIVE
#include <common>
#include <fog_pars_fragment>
uniform float uI;
varying float vX;
void main() {
  float k = 1.0 - vX * vX;
  gl_FragColor = vec4(vec3(0.82, 0.88, 1.0) * uI * k * k, 1.0);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface LightningRng {
  next(): number;
  range(a: number, b: number): number;
}

export class Lightning {
  readonly mesh: THREE.Mesh;
  /** current flash brightness (0 none, ~1–3 at the peak) */
  value = 0;
  /** where the deck lights up (world) */
  readonly at = new THREE.Vector3();
  /** unit bearing from the camera */
  readonly dir = new THREE.Vector3(0, 0.3, 1);
  private pos = new Float32Array((MAX_SEG + 1) * 2 * 3);
  private adir = new Float32Array((MAX_SEG + 1) * 2 * 3);
  private side = new Float32Array((MAX_SEG + 1) * 2 * 2);
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private next = 6;
  private t = 99;
  private pulses = [0, 0, 0, 0];
  private gains = [0, 0, 0, 0];
  private path: number[] = [];
  strikes = 0;

  constructor(
    private rng: LightningRng,
    private events: EventBus,
  ) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aDir', new THREE.BufferAttribute(this.adir, 3));
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(this.side, 2));
    const idx = new Uint16Array(MAX_SEG * 6);
    for (let i = 0; i < MAX_SEG; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6);
    }
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      name: 'Lightning',
      uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), uI: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1025) } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'lightning';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
  }

  /** a strike now (tests, ?weather=storm screenshots) */
  strike(camera: THREE.Camera, deck: number, bolt: boolean): void {
    const r = this.rng;
    camera.getWorldDirection(_f);
    const yaw = Math.atan2(_f.x, _f.z) + r.range(-0.55, 0.55);
    const d = r.range(1400, 6500);
    this.at.set(camera.position.x + Math.sin(yaw) * d, deck, camera.position.z + Math.cos(yaw) * d);
    this.dir.copy(this.at).sub(camera.position).normalize();
    const power = r.range(0.6, 1.3) * (1 - (d / 6500) * 0.45);
    // leader + return strokes
    const n = 2 + Math.floor(r.next() * 3);
    let tt = 0;
    for (let i = 0; i < 4; i++) {
      this.pulses[i] = tt;
      this.gains[i] = i < n ? power * r.range(0.45, 1.25) : 0;
      tt += r.range(0.05, 0.16);
    }
    this.t = 0;
    this.strikes++;
    if (bolt) this.buildBolt(this.at.x, deck, this.at.z, r.range(4, 9));
    else this.geo.setDrawRange(0, 0);
    this.events.emit('lightning', { distance: d, power, bolt });
  }

  private buildBolt(x: number, top: number, z: number, width: number): void {
    const r = this.rng;
    const path = this.path;
    path.length = 0;
    // main channel: jagged walk to the ground, plus a few branches
    let px = x,
      py = top,
      pz = z;
    const steps = 46;
    const dy = top / steps;
    let wx = r.range(-1, 1),
      wz = r.range(-1, 1);
    path.push(px, py, pz, width);
    for (let i = 1; i <= steps; i++) {
      wx += r.range(-0.8, 0.8);
      wz += r.range(-0.8, 0.8);
      wx *= 0.82;
      wz *= 0.82;
      px += wx * dy * 0.42;
      pz += wz * dy * 0.42;
      py = top - i * dy;
      path.push(px, py, pz, width * (0.7 + 0.3 * (i / steps)));
    }
    const main = path.length / 4;
    const end: number[] = [];
    end.push(main);
    for (let b = 0; b < 3; b++) {
      const k = 4 + Math.floor(r.next() * (main - 14));
      let bx = path[k * 4],
        by = path[k * 4 + 1],
        bz = path[k * 4 + 2];
      const a = r.range(0, Math.PI * 2);
      let vx = Math.cos(a),
        vz = Math.sin(a);
      path.push(bx, by, bz, width * 0.4);
      const m = 7 + Math.floor(r.next() * 6);
      for (let i = 1; i < m && path.length / 4 < MAX_SEG; i++) {
        vx += r.range(-0.6, 0.6);
        vz += r.range(-0.6, 0.6);
        bx += vx * dy * 0.6;
        bz += vz * dy * 0.6;
        by -= dy * r.range(0.4, 1);
        path.push(bx, Math.max(by, 0), bz, width * 0.4 * (1 - i / m));
      }
      end.push(path.length / 4);
    }
    // write the ribbon: degenerate links between the branches
    const nV = path.length / 4;
    let chain = 0;
    for (let i = 0; i < nV && i <= MAX_SEG; i++) {
      if (end[chain] === i) chain++;
      const last = i + 1 >= nV || end[chain] === i + 1;
      const j = last ? i - 1 : i + 1;
      const sign = last ? -1 : 1;
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        this.pos[o] = path[i * 4];
        this.pos[o + 1] = path[i * 4 + 1];
        this.pos[o + 2] = path[i * 4 + 2];
        this.adir[o] = (path[j * 4] - path[i * 4]) * sign;
        this.adir[o + 1] = (path[j * 4 + 1] - path[i * 4 + 1]) * sign;
        this.adir[o + 2] = (path[j * 4 + 2] - path[i * 4 + 2]) * sign;
        this.side[(i * 2 + k) * 2] = k ? 1 : -1;
        this.side[(i * 2 + k) * 2 + 1] = path[i * 4 + 3] * (last ? 0 : 1);
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aDir as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSide as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, Math.min(nV - 1, MAX_SEG) * 6);
  }

  /** @param storm 0..1 at the town */
  update(realDt: number, storm: number, camera: THREE.Camera, deck: number, resX: number, resY: number): void {
    this.t += realDt;
    if (storm > 0.25) {
      this.next -= realDt * storm;
      if (this.next <= 0) {
        this.next = this.rng.range(3, 12);
        this.strike(camera, deck, this.rng.next() < 0.6);
      }
    }
    let v = 0;
    if (this.t < 2) {
      for (let i = 0; i < 4; i++) {
        const dt = this.t - this.pulses[i];
        if (dt >= 0) v += this.gains[i] * Math.exp(-dt / 0.075);
      }
    }
    this.value = v;
    const on = v > 0.04 && this.geo.drawRange.count > 0;
    this.mesh.visible = on;
    if (on) {
      this.mat.uniforms.uI.value = 42 * Math.min(1.6, v);
      (this.mat.uniforms.uRes.value as THREE.Vector2).set(resX, resY);
    }
  }
}

const _f = new THREE.Vector3();
