// Smoke & steam: one shared pool of soft, lit billboard puffs (ONE draw call for every
// chimney, funnel and locomotive in the city). Puffs rise, slow down, drift with the shared
// wind field (core/wind.ts: gust fronts push a plume over as they pass; wind grows with height so
// a plume bends over as it rises), grow and erode (thin edges vanish first); they are shaded from
// a procedural pseudo-normal atlas with the live sun/moon + sky light, a Henyey–Greenstein forward
// scatter rim (backlit smoke glows at golden hour, dense cores stay grey), warm under-glow from the
// city at night, and sorted back-to-front every frame (insertion sort — temporally coherent).
// Distant emitters emit fewer, larger puffs (same plume, smaller particle count).
//
// Public API: see SmokeService below (registered as ctx.services.smoke by ambient.ts).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Rng } from '../../core/rng';
import { makeLight, sampleLight, smooth } from './shared';
import { windAt } from '../../core/wind';

export interface SmokeEmitterOptions {
  /** World position of the emission point (polled every sim step). Return `false` to pause emission. */
  getPosition(out: THREE.Vector3): void | boolean;
  /** puffs per second (default 5) */
  rate?: number;
  /** initial puff radius in metres (default 1.0); puffs grow to ~4x over their life */
  size?: number;
  /** albedo tint (default '#ebe7e1' = white steam; ~'#8d8b88' for sooty funnel smoke) */
  color?: THREE.ColorRepresentation;
  /** seconds a puff lives (default 9) */
  life?: number;
  /** initial rise speed in m/s (default 2.4) */
  rise?: number;
  /** extra (optional): 0..1 warm under-glow at night (furnace / yard lights), default 0 */
  glow?: number;
  /** extra (optional): opacity multiplier (thin wood smoke ≈ 0.5), default 1 */
  opacity?: number;
}

export interface SmokeHandle {
  remove(): void;
  /** extra (optional): change parameters on the fly (e.g. a ship idling vs. steaming) */
  set(opts: Partial<Omit<SmokeEmitterOptions, 'getPosition'>>): void;
}

export interface SmokeService {
  addEmitter(opts: SmokeEmitterOptions): SmokeHandle;
  /** extra (optional): one-shot burst of `count` puffs at a point (steam chuff, horn blast…) */
  burst(position: THREE.Vector3, count: number, opts?: Partial<Omit<SmokeEmitterOptions, 'getPosition'>>): void;
}

interface Emitter {
  id: number;
  getPosition: (out: THREE.Vector3) => void | boolean;
  rate: number;
  size: number;
  life: number;
  rise: number;
  glow: number;
  opacity: number;
  color: THREE.Color;
  acc: number;
  prev: THREE.Vector3;
  cur: THREE.Vector3;
  hasPrev: boolean;
  active: boolean;
  removed: boolean;
  failed: boolean;
  /** slow "production" modulation phase */
  phase: number;
  /** distance LOD: < 1 = fewer, larger puffs */
  lod: number;
}

export interface SmokeSystem {
  service: SmokeService;
  mesh: THREE.Mesh;
  update(dt: number): void;
  frame(): void;
  stats(): Record<string, number>;
  invariants(): string[];
}

const DEFAULTS = { rate: 5, size: 1.0, life: 9, rise: 2.4, glow: 0 };

// ─────────────────────────────────────────────────────────────── puff atlas ──
// 2×2 variants. RG = pseudo-normal xy (0.5 = flat), B = thickness, A = coverage.
function makePuffAtlas(rng: Rng): THREE.DataTexture {
  const S = 128,
    N = 2,
    W = S * N;
  const data = new Uint8Array(W * W * 4);
  const field = new Float32Array(S * S);
  for (let v = 0; v < N * N; v++) {
    const blobs: { x: number; y: number; r: number; w: number }[] = [{ x: rng.range(-0.06, 0.06), y: rng.range(-0.08, 0.02), r: 0.5, w: 1 }];
    const nb = 7 + v * 2;
    for (let i = 0; i < nb; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.12, 0.44);
      const r = rng.range(0.17, 0.3) * (1.1 - d * 0.6);
      blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.9 + 0.05, r, w: rng.range(0.6, 1) });
    }
    let maxF = 0;
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S) * 2 - 1,
          y = ((j + 0.5) / S) * 2 - 1;
        let f = 0;
        for (const b of blobs) {
          const dx = (x - b.x) / b.r,
            dy = (y - b.y) / b.r;
          const q = 1 - (dx * dx + dy * dy);
          if (q > 0) f += q * q * b.w;
        }
        // keep a clean margin so mip levels don't bleed into the neighbouring variant
        const rr = Math.sqrt(x * x + y * y);
        f *= 1 - smooth(0.78, 0.97, rr);
        field[j * S + i] = f;
        if (f > maxF) maxF = f;
      }
    const ox = (v % N) * S,
      oy = Math.floor(v / N) * S;
    const H = (i: number, j: number) => {
      i = Math.min(S - 1, Math.max(0, i));
      j = Math.min(S - 1, Math.max(0, j));
      return Math.sqrt(field[j * S + i] / maxF);
    };
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const f = field[j * S + i] / maxF;
        const h = Math.sqrt(f);
        const gx = (H(i + 2, j) - H(i - 2, j)) * 3.6;
        const gy = (H(i, j + 2) - H(i, j - 2)) * 3.6;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * inv,
          ny = -gy * inv;
        const a = smooth(0.02, 0.42, f);
        const k = ((oy + j) * W + ox + i) * 4;
        data[k] = Math.round((nx * 0.5 + 0.5) * 255);
        data[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[k + 2] = Math.round(Math.min(1, h * 1.15) * 255);
        data[k + 3] = Math.round(a * 255);
      }
  }
  const tex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 iPosSize;
attribute vec4 iColor;
attribute vec4 iMisc; // rotation, variant, age (0..1), glow
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vRot;
varying vec2 vAgeGlow;
varying float vH;
varying vec2 vSoft; // view depth of the puff, soft range
void main() {
  vec4 mvPosition = viewMatrix * vec4(iPosSize.xyz, 1.0);
  float c = cos(iMisc.x), s = sin(iMisc.x);
  vec2 q = position.xy;
  float r = iPosSize.w;
  mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * r * 2.0;
  float d = -mvPosition.z;
  // fade when the camera gets close (avoids full-screen overdraw when flying through a plume)
  float nearFade = smoothstep(r * 0.9, r * 3.5, d);
  vColor = vec4(iColor.rgb, iColor.a * nearFade);
  float v = iMisc.y;
  vUv = (position.xy + 0.5) * 0.5 + vec2(mod(v, 2.0), floor(v * 0.5)) * 0.5;
  vRot = vec2(c, s);
  vAgeGlow = iMisc.zw;
  vH = iPosSize.y;
  vSoft = vec2(-mvPosition.z, clamp(r * 0.7, 0.25, 3.0));
  gl_Position = projectionMatrix * mvPosition;
  if (vColor.a < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uTex;
uniform vec3 uKeyDir;
uniform vec3 uKey;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uBack;
uniform float uScatter;
uniform sampler2D uDepth;
uniform vec4 uDepthInfo; // width, height, near, far (width 0 = no soft depth)
varying vec2 vSoft;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vRot;
varying vec2 vAgeGlow;
varying float vH;
float smokeHG(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5);
}
void main() {
  vec4 t = texture2D(uTex, vUv);
  float age = vAgeGlow.x;
  // erosion: the thin fringe of a puff dissolves first as it ages, the core lasts
  float er = age * age * 0.7;
  float cov = smoothstep(er, er + 0.32, t.a);
  float a = cov * vColor.a;
  // soft particles: fade where the puff meets the scene (previous frame's depth from postfx)
  if (uDepthInfo.x > 0.5) {
    float dz = texture2D(uDepth, gl_FragCoord.xy / uDepthInfo.xy).r;
    float sceneZ = uDepthInfo.z * uDepthInfo.w / (uDepthInfo.w - dz * (uDepthInfo.w - uDepthInfo.z));
    float x = clamp((sceneZ - vSoft.x) / vSoft.y, 0.0, 1.0);
    a *= x * x * (3.0 - 2.0 * x);
  }
  // dither against 8-bit banding in thin smoke
  a += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (2.0 / 255.0);
  if (a < 0.004) discard;
  vec2 n2 = t.rg * 2.0 - 1.0;
  n2 = vec2(vRot.x * n2.x - vRot.y * n2.y, vRot.y * n2.x + vRot.x * n2.y);
  float nz = sqrt(max(0.05, 1.0 - dot(n2, n2)));
  vec3 n = normalize(uRight * n2.x + uUp * n2.y + uBack * nz);
  float ndl = dot(n, uKeyDir);
  float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
  float dens = t.b * (1.0 - age * 0.55);
  float self = mix(1.0, 0.6, dens * (1.0 - clamp(ndl, 0.0, 1.0)));
  vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
  // forward scattering (Henyey-Greenstein, g 0.65 + a weak back lobe) when looking towards the
  // light: thin edges glow ("silver lining"), dense cores stay grey
  float mu = dot(-uBack, uKeyDir);
  float phase = 0.8 * smokeHG(mu, 0.65) + 0.2 * smokeHG(mu, -0.2);
  float thin = (1.0 - t.b * 0.85) * (0.35 + 0.65 * (1.0 - cov * 0.6));
  float fwd = min(phase * thin * uScatter, 3.0);
  float under = clamp(0.55 - 0.45 * n.y, 0.0, 1.0) * vAgeGlow.y;
  vec3 col = vColor.rgb * (uKey * (wrap * wrap * self * 1.15 + fwd) + hemi * 1.25 + uGlow * under);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createSmoke(ctx: CityContext): SmokeSystem {
  const rng = ctx.rng('ambient-smoke');
  const MAX = 2000;
  const budget = () => Math.round(MAX * (0.55 + 0.45 * Math.min(1, Math.max(0.4, ctx.quality.density))));

  // ── particle state (SoA)
  const px = new Float32Array(MAX),
    py = new Float32Array(MAX),
    pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX),
    vy = new Float32Array(MAX),
    vz = new Float32Array(MAX);
  const age = new Float32Array(MAX),
    life = new Float32Array(MAX),
    size0 = new Float32Array(MAX),
    grow = new Float32Array(MAX),
    alpha0 = new Float32Array(MAX),
    rot = new Float32Array(MAX),
    rotV = new Float32Array(MAX),
    seed = new Float32Array(MAX),
    glow = new Float32Array(MAX),
    gy = new Float32Array(MAX),
    variant = new Uint8Array(MAX);
  const cr = new Float32Array(MAX),
    cg = new Float32Array(MAX),
    cb = new Float32Array(MAX);
  const alive = new Uint8Array(MAX);
  const bornFlag = new Uint8Array(MAX);
  const free = new Uint16Array(MAX);
  let freeTop = 0;
  for (let i = MAX - 1; i >= 0; i--) free[freeTop++] = i;
  const order = new Uint16Array(MAX);
  let orderLen = 0;
  const born = new Uint16Array(MAX);
  let bornLen = 0;
  const depth = new Float32Array(MAX);

  let dropped = 0;
  let spawnedTotal = 0;
  let rateScale = 1;

  // ── render resources
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPosSize', aPos);
  geo.setAttribute('iColor', aCol);
  geo.setAttribute('iMisc', aMisc);
  geo.instanceCount = 0;

  const light = makeLight();
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTex: { value: null },
      uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
      uKey: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uBack: { value: new THREE.Vector3(0, 0, 1) },
      uScatter: { value: 0.22 },
      uDepth: { value: null },
      uDepthInfo: { value: new THREE.Vector4(0, 0, 1, 1000) },
    },
  ]);
  uniforms.uTex.value = makePuffAtlas(rng.fork('atlas'));
  const material = new THREE.ShaderMaterial({
    name: 'ambient-smoke',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'ambient-smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;

  // ── emitters
  const emitters: Emitter[] = [];
  let nextId = 1;
  const wind = ctx.uniforms.uWind.value;
  const terrainSvc = () => ctx.services.terrain as { height(x: number, z: number): number } | undefined;
  const groundAt = (x: number, z: number): number => {
    const t = terrainSvc();
    const h = t ? t.height(x, z) : ctx.plan.heightAt(x, z);
    return Number.isFinite(h) ? Math.max(h, ctx.plan.water.level) : 0;
  };
  const _w = new THREE.Vector2();

  const spawn = (x: number, y: number, z: number, a0: number, o: { size: number; life: number; rise: number; color: THREE.Color; glow: number; opacity: number }): void => {
    if (freeTop === 0 || MAX - freeTop >= budget()) {
      dropped++;
      return;
    }
    const i = free[--freeTop];
    alive[i] = 1;
    bornFlag[i] = 1;
    if (bornLen < MAX) born[bornLen++] = i;
    spawnedTotal++;
    const s = o.size * rng.range(0.8, 1.2);
    const rise = o.rise * rng.range(0.85, 1.15);
    const j = o.size * 0.35;
    px[i] = x + rng.range(-j, j);
    py[i] = y + rng.range(-0.1, 0.2) * o.size;
    pz[i] = z + rng.range(-j, j);
    vx[i] = rng.range(-0.3, 0.3) * rise * 0.3;
    vy[i] = rise;
    vz[i] = rng.range(-0.3, 0.3) * rise * 0.3;
    age[i] = 0;
    life[i] = o.life * rng.range(0.82, 1.18);
    size0[i] = s;
    grow[i] = rng.range(2.8, 3.8);
    alpha0[i] = rng.range(0.5, 0.68) * o.opacity;
    rot[i] = rng.range(0, Math.PI * 2);
    rotV[i] = rng.range(-0.25, 0.25);
    seed[i] = rng.next() * 100;
    glow[i] = o.glow;
    gy[i] = groundAt(px[i], pz[i]);
    variant[i] = rng.int(0, 3);
    const lj = rng.range(0.94, 1.04);
    cr[i] = o.color.r * lj;
    cg[i] = o.color.g * lj;
    cb[i] = o.color.b * lj;
    if (a0 > 0) step(i, a0);
  };

  const step = (i: number, dt: number): void => {
    const a = (age[i] += dt);
    if (a >= life[i]) {
      alive[i] = 0;
      free[freeTop++] = i;
      return;
    }
    // buoyancy fades, a little lift remains
    const keep = Math.exp(-dt * 0.42);
    vy[i] = vy[i] * keep + (1 - keep) * 0.35;
    // wind: the shared field (gust fronts bend the plume as they pass), stronger aloft
    // (power-law profile from the ground under the puff's birth point); gentle eddies
    const hag = Math.min(Math.max(py[i] - gy[i], 1.5), 160);
    const wf = 3.1 * Math.pow(hag / 10, 0.22);
    windAt(px[i], pz[i], ctx.uniforms.uTime.value, wind, _w);
    const sd = seed[i];
    const ea = Math.min(1, a * 0.25);
    const ex = (Math.sin(a * 0.8 + sd) * 0.5 + Math.sin(a * 1.9 + sd * 1.7) * 0.2) * ea;
    const ez = (Math.cos(a * 0.7 + sd * 1.3) * 0.5 + Math.sin(a * 1.6 + sd * 0.6) * 0.2) * ea;
    const k = 1 - Math.exp(-dt * 0.75);
    vx[i] += (_w.x * wf + ex - vx[i]) * k;
    vz[i] += (_w.y * wf + ez - vz[i]) * k;
    px[i] += vx[i] * dt;
    py[i] += (vy[i] + Math.sin(a * 1.3 + sd * 2.1) * 0.15) * dt;
    pz[i] += vz[i] * dt;
    rot[i] += rotV[i] * dt;
  };

  const tmp = new THREE.Vector3();
  const emitOpts = { size: 1, life: 1, rise: 1, color: new THREE.Color(), glow: 0, opacity: 1 };

  const service: SmokeService = {
    addEmitter(opts) {
      const e: Emitter = {
        id: nextId++,
        getPosition: opts.getPosition,
        rate: opts.rate ?? DEFAULTS.rate,
        size: opts.size ?? DEFAULTS.size,
        life: opts.life ?? DEFAULTS.life,
        rise: opts.rise ?? DEFAULTS.rise,
        glow: opts.glow ?? DEFAULTS.glow,
        opacity: opts.opacity ?? 1,
        color: new THREE.Color(opts.color ?? '#ebe7e1'),
        acc: rng.next(),
        prev: new THREE.Vector3(),
        cur: new THREE.Vector3(),
        hasPrev: false,
        active: true,
        removed: false,
        failed: false,
        phase: rng.range(0, 100),
        lod: 1,
      };
      emitters.push(e);
      return {
        remove() {
          if (e.removed) return;
          e.removed = true;
          const k = emitters.indexOf(e);
          if (k >= 0) emitters.splice(k, 1);
        },
        set(o) {
          if (o.rate !== undefined) e.rate = o.rate;
          if (o.size !== undefined) e.size = o.size;
          if (o.life !== undefined) e.life = o.life;
          if (o.rise !== undefined) e.rise = o.rise;
          if (o.glow !== undefined) e.glow = o.glow;
          if (o.opacity !== undefined) e.opacity = o.opacity;
          if (o.color !== undefined) e.color.set(o.color);
        },
      };
    },
    burst(p, count, o) {
      emitOpts.size = o?.size ?? DEFAULTS.size;
      emitOpts.life = o?.life ?? DEFAULTS.life;
      emitOpts.rise = o?.rise ?? DEFAULTS.rise;
      emitOpts.glow = o?.glow ?? 0;
      emitOpts.opacity = o?.opacity ?? 1;
      emitOpts.color.set(o?.color ?? '#ebe7e1');
      const n = Math.min(64, Math.max(0, Math.round(count)));
      for (let k = 0; k < n; k++) spawn(p.x, p.y, p.z, rng.range(0, 0.3), emitOpts);
    },
  };

  const density = () => 0.6 + 0.4 * Math.min(1, Math.max(0.4, ctx.quality.density));
  const softOff = ctx.debug.params.has('nosoftsmoke');
  /** seconds of plume history to fast-forward on the next update (start-up, time jumps) */
  let prewarm = 14;
  ctx.events.on('timejump', () => {
    prewarm = 14;
  });

  const advance = (dt: number): void => {
    // integrate the living
    for (let i = 0; i < MAX; i++) if (alive[i] && !bornFlag[i]) step(i, dt);
    for (let k = 0; k < bornLen; k++) {
      const i = born[k];
      if (alive[i]) step(i, dt);
    }
    // distance LOD per emitter (fewer, larger puffs far from the camera), then keep the whole city
    // inside the shared budget: scale every emitter's rate together
    const ce = ctx.camera.matrixWorld.elements;
    let expected = 0;
    for (const e of emitters) {
      if (e.hasPrev) {
        const d = Math.hypot(e.cur.x - ce[12], e.cur.y - ce[13], e.cur.z - ce[14]);
        e.lod = Math.min(1, Math.max(0.28, 120 / Math.max(1, d)));
      }
      if (e.active && !e.failed) expected += e.rate * e.lod * e.life;
    }
    const dens = density();
    expected *= dens;
    rateScale = expected > 0 ? Math.min(1, (budget() * 0.9) / expected) : 1;
    // emit
    for (const e of emitters) {
      if (e.failed) continue;
      let res: void | boolean;
      try {
        res = e.getPosition(tmp);
      } catch (err) {
        e.failed = true;
        if (ctx.debug.enabled) console.warn('[ambient] smoke emitter getPosition threw — disabled', err);
        continue;
      }
      if (res === false || !Number.isFinite(tmp.x + tmp.y + tmp.z)) {
        e.active = false;
        e.hasPrev = false;
        continue;
      }
      e.active = true;
      e.cur.copy(tmp);
      if (!e.hasPrev) {
        e.prev.copy(tmp);
        e.hasPrev = true;
      }
      e.phase += dt * 0.12;
      const mod = 0.8 + 0.2 * Math.sin(e.phase) + 0.12 * Math.sin(e.phase * 3.7);
      e.acc += e.rate * e.lod * rateScale * dens * mod * dt;
      let n = Math.floor(e.acc);
      e.acc -= n;
      if (n > 0) {
        if (n > 40) n = 40;
        emitOpts.size = e.size * (1 + (1 - Math.min(1, rateScale * dens)) * 0.35) / Math.pow(e.lod, 0.4);
        emitOpts.life = e.life;
        emitOpts.rise = e.rise;
        emitOpts.glow = e.glow;
        emitOpts.opacity = e.opacity;
        emitOpts.color.copy(e.color);
        for (let k = 0; k < n; k++) {
          const f = (k + rng.next()) / n;
          const x = e.prev.x + (e.cur.x - e.prev.x) * f,
            y = e.prev.y + (e.cur.y - e.prev.y) * f,
            z = e.prev.z + (e.cur.z - e.prev.z) * f;
          spawn(x, y, z, (1 - f) * dt, emitOpts);
        }
      }
      e.prev.copy(e.cur);
    }
  };

  return {
    service,
    mesh,
    update(dt) {
      if (dt <= 0) return;
      if (prewarm > 0) {
        // fast-forward the plumes (start-up and after every time jump) so they appear fully formed
        const p = prewarm;
        prewarm = 0;
        for (let t = 0; t < p; t += 0.25) {
          advance(0.25);
          for (let k = 0; k < bornLen; k++) bornFlag[born[k]] = 0;
          bornLen = 0;
        }
        orderLen = 0;
        for (let i = 0; i < MAX; i++) if (alive[i]) order[orderLen++] = i;
      }
      advance(dt);
    },
    frame() {
      // compact the draw order (drop the dead & the newborn, then append the newborn)
      let w = 0;
      for (let k = 0; k < orderLen; k++) {
        const i = order[k];
        if (alive[i] && !bornFlag[i]) order[w++] = i;
      }
      for (let k = 0; k < bornLen; k++) {
        const i = born[k];
        bornFlag[i] = 0;
        if (alive[i]) order[w++] = i;
      }
      orderLen = w;
      bornLen = 0;
      if (orderLen === 0) {
        mesh.visible = false;
        geo.instanceCount = 0;
        return;
      }
      mesh.visible = true;
      // back-to-front by view depth
      const cam = ctx.camera;
      const e = cam.matrixWorld.elements;
      const fx = -e[8],
        fy = -e[9],
        fz = -e[10];
      const cx = e[12],
        cy = e[13],
        cz = e[14];
      for (let k = 0; k < orderLen; k++) {
        const i = order[k];
        depth[i] = (px[i] - cx) * fx + (py[i] - cy) * fy + (pz[i] - cz) * fz;
      }
      for (let k = 1; k < orderLen; k++) {
        const i = order[k];
        const d = depth[i];
        let m = k - 1;
        while (m >= 0 && depth[order[m]] < d) {
          order[m + 1] = order[m];
          m--;
        }
        order[m + 1] = i;
      }
      // write instances
      const P = aPos.array as Float32Array,
        C = aCol.array as Float32Array,
        M = aMisc.array as Float32Array;
      for (let k = 0; k < orderLen; k++) {
        const i = order[k];
        const t = age[i] / life[i];
        const o = k * 4;
        P[o] = px[i];
        P[o + 1] = py[i];
        P[o + 2] = pz[i];
        P[o + 3] = size0[i] * (1 + grow[i] * Math.pow(t, 0.55));
        C[o] = cr[i];
        C[o + 1] = cg[i];
        C[o + 2] = cb[i];
        // fade in, erode (shader), thin out; soft where the puff dips into the ground / a roof
        const rr = P[o + 3];
        C[o + 3] = alpha0[i] * smooth(0, 0.05, t) * Math.pow(1 - t, 0.75) * smooth(-0.3 * rr, 0.7 * rr, py[i] - gy[i]);
        M[o] = rot[i];
        M[o + 1] = variant[i];
        M[o + 2] = t;
        M[o + 3] = glow[i] * (1 - t * 0.7);
      }
      const n4 = orderLen * 4;
      for (const a of [aPos, aCol, aMisc]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n4);
        a.needsUpdate = true;
      }
      geo.instanceCount = orderLen;
      // light + camera basis
      sampleLight(ctx, light);
      const u = material.uniforms;
      (u.uKeyDir.value as THREE.Vector3).copy(light.dir);
      (u.uKey.value as THREE.Color).copy(light.key);
      (u.uSky.value as THREE.Color).copy(light.sky);
      (u.uGround.value as THREE.Color).copy(light.ground);
      (u.uGlow.value as THREE.Color).copy(light.glow);
      (u.uRight.value as THREE.Vector3).set(e[0], e[1], e[2]);
      (u.uUp.value as THREE.Vector3).set(e[4], e[5], e[6]);
      (u.uBack.value as THREE.Vector3).set(e[8], e[9], e[10]);
      // soft particles: the previous frame's scene depth (postfx loads after us — look it up lazily)
      const pf = ctx.services.postfx as { softDepth?: () => { texture: THREE.Texture; linear: boolean; near: number; far: number; width: number; height: number } | null } | undefined;
      const sd = softOff ? null : (pf?.softDepth?.() ?? null);
      const di = u.uDepthInfo.value as THREE.Vector4;
      if (sd && !sd.linear) {
        u.uDepth.value = sd.texture;
        di.set(sd.width, sd.height, sd.near, sd.far);
      } else {
        u.uDepth.value = null;
        di.x = 0;
      }
    },
    stats() {
      return { smokePuffs: MAX - freeTop, smokeBudget: budget(), smokeEmitters: emitters.length, smokeDropped: dropped, smokeRateScale: Math.round(rateScale * 100) / 100, smokeSpawned: spawnedTotal };
    },
    invariants() {
      const out: string[] = [];
      const live = MAX - freeTop;
      if (live > budget()) out.push(`smoke: ${live} live puffs exceed the budget ${budget()}`);
      let bad = 0;
      for (let i = 0; i < MAX; i++) if (alive[i] && !Number.isFinite(px[i] + py[i] + pz[i] + vx[i] + vy[i] + vz[i])) bad++;
      if (bad) out.push(`smoke: ${bad} puffs with non-finite state`);
      const failed = emitters.filter((e) => e.failed).length;
      if (failed) out.push(`smoke: ${failed} emitter(s) disabled after getPosition() threw`);
      return out;
    },
  };
}
