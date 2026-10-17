// Stylised cotton-ball clouds that FRAME the diorama.
//
// Each cloud is a little cluster of lumpy, flat-bottomed puffs; all puffs of all clouds are one
// InstancedMesh (1 draw call; cloud shadows are drawn by post-processing, see writeShadows).
//
// Composition — in a tilt-shift diorama the clouds frame the model instead of hiding it:
// * every cloud drifts with the wind along a straight *path* that plan() chooses so that, seen from
//   the hero camera (the overview POI), the cloud stays beside / beyond the slab's edges or above
//   its back edge, never in front of the city;
// * a cloud forms at the upwind end of its path (its puffs bubble up one after another) and
//   dissolves before the downwind end — i.e. before it would drift in front of the model — then
//   re-forms somewhere else a little later;
// * now and then one small, high "passer" crosses over the city (its soft shadow sweeps the streets);
// * from any other camera, a cloud whose projection lands on the slab thins out to a wisp
//   (view-dependent, visual only).
// Cloud shadows use exactly the same positions, sizes and formation state, so they always match.
// Clouds rise gently over the tallest towers and fade when the camera gets close.
// Night: dim, translucent shapes with a faint moonlit rim (never a grey blob over the lit city).

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rect } from '../../core/geom';
import type { Rng } from '../../core/rng';
import type { SkyState } from './palette';
import type { CloudShadowData } from '../postfx/cloudShadow';

const NOISE = /* glsl */ `
float cHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

// Shared vertex transform: lumpy puff, flattened base. Outputs world position + normal.
const VERT_COMMON = /* glsl */ `
attribute vec4 aCloud; // x: fade, y: base height (world), z: seed, w: city uplight (0 far from the model)
${NOISE}
vec3 cloudWorld(out vec3 nW) {
  vec3 n = normalize(position);
  float lump = cNoise(n * 2.3 + aCloud.z) * 0.24 + cNoise(n * 5.1 + aCloud.z * 1.7) * 0.09;
  vec3 p = n * (0.86 + lump);
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  float below = aCloud.y - wp.y;
  if (below > 0.0) {
    // squash everything under the base into a soft, nearly flat bottom
    wp.y = aCloud.y - below * 0.12;
    wn = normalize(mix(wn, vec3(0.0, -1.0, 0.0), clamp(below * 0.25, 0.0, 0.85)));
  }
  nW = wn;
  return wp.xyz;
}
`;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${VERT_COMMON}
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vFade;
varying float vRel;
varying float vGlow;
void main() {
  vec3 nW;
  vec3 wp = cloudWorld(nW);
  vNormalW = nW;
  vPosW = wp;
  vFade = aCloud.x;
  vGlow = aCloud.w;
  vRel = clamp((wp.y - aCloud.y) / 14.0, 0.0, 1.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uLightDir;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uRim;
uniform vec3 uMoonRim;
uniform vec3 uGlowBelow;
uniform float uOpacity;
uniform float uRimAlpha;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vFade;
varying float vRel;
varying float vGlow;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, uLightDir);
  float wrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
  wrap = wrap * wrap * (3.0 - 2.0 * wrap);
  vec3 col = mix(uShade, uLit, wrap);
  // darker, cooler belly; bright crown
  col *= mix(0.8, 1.04, smoothstep(0.0, 0.8, vRel));
  // silver lining toward the light
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - nv, 3.0);
  float toward = pow(clamp(dot(-V, uLightDir), 0.0, 1.0), 3.0);
  col += uRim * fres * (0.18 + 0.9 * toward);
  // night: faint moonlit rim on the moon-facing edges (just inside the silhouette)
  float rimN = (1.0 - nv) * (1.0 - nv) * smoothstep(-0.2, 0.8, ndl);
  col += uMoonRim * rimN;
  // warm uplight from the city at night (only above / near the lit model)
  col += uGlowBelow * (clamp(-N.y * 0.8 + 0.25, 0.0, 1.0) * vGlow);
  float body = smoothstep(0.0, 0.42, nv);
  float alpha = min(1.0, body * uOpacity + rimN * smoothstep(0.0, 0.18, nv) * uRimAlpha) * vFade;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** m/s of drift per unit of uWind */
const SPEED = 2.6;
/** base altitude of regular clouds (bottom of the puffs) */
const ALT_MIN = 128;
const ALT_MAX = 168;
/** the occasional small cloud that crosses over the city flies higher */
const PASSER_ALT_MIN = 172;
const PASSER_ALT_MAX = 192;
/** clouds live within slab ± this */
const BOX_MARGIN = 320;
/** share of paths anchored anywhere around the model instead of inside the hero picture
 *  (keeps the rest of the sky populated for other views and cloud shadows from every side) */
const OFFSCREEN_P = 0.14;
/** max deviation (rad) of a regular cloud's drift from the surface wind */
const DIR_JITTER = 0.45;
/** max hero-view coverage along a regular cloud's path */
const COVER_MAX = 0.05;
/** visibility of a cloud right in front of the city (non-hero cameras) */
const WISP = 0.12;
const PASSER_WISP = 0.85; // the passer stays a crisp little cloud, never a grey smudge

interface Puff {
  ox: number;
  oy: number;
  oz: number;
  r: number;
  sy: number;
  rot: number;
  /** formation offset (0..0.6): the core puffs bubble up first, small side puffs last */
  form: number;
}

interface Cloud {
  x: number;
  z: number;
  alt: number;
  baseAlt: number;
  yaw: number;
  /** footprint radius at size 1 */
  radius: number;
  /** current size multiplier (re-rolled when the cloud re-forms) */
  size: number;
  puffs: Puff[];
  seed: number;
  speed: number;
  /** shadow ellipse half-axes along / across the cloud (size 1) */
  halfLen: number;
  halfWid: number;
  passer: boolean;
  // path: start, unit direction, length, travelled distance, formation / dissolve lengths
  sx: number;
  sz: number;
  dx: number;
  dz: number;
  len: number;
  s: number;
  formLen: number;
  fadeLen: number;
  /** 0..1 formation envelope along the path (shared by the puffs and the shadow) */
  life: number;
  /** > 0: dissolved, waiting to re-form (sim seconds) */
  sleep: number;
  /** smoothed view-dependent visibility */
  fade: number;
  /** 0..1 how much warm city light reaches its belly (1 above the model, 0 far beyond it) */
  glow: number;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  top: number;
}

/** the camera the composition is designed for (the overview POI) */
export interface HeroView {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface CloudSystem {
  mesh: THREE.InstancedMesh;
  count: number;
  /** move clouds (sim seconds) */
  step(dt: number, wind: THREE.Vector2): void;
  /** per-frame visual update; `night` 0..1 turns the clouds into dim translucent shapes with moonlit rims */
  frame(camera: THREE.Camera, state: SkyState, lightDir: THREE.Vector3, lightCol: THREE.Color, lightI: number, sunVis: number, cityGlow: number, overcast: number, night: number): void;
  setShadows(on: boolean): void;
  /** publish soft shadow ellipses for the post-processing cloud-shadow pass */
  writeShadows(out: CloudShadowData, light: THREE.Vector3, strength: number, tint: THREE.Color): void;
  stats(): { active: number; overCity: number };
  invariants(): string[];
  /** debug / tests: live cloud states (read-only) */
  list(): ReadonlyArray<Readonly<{ x: number; z: number; alt: number; life: number; sleep: number; passer: boolean; fade: number; size: number; radius: number }>>;
}

export function createClouds(rng: Rng, slab: Rect, obstacles: Obstacle[], count: number, hero: HeroView | null, initialWind: THREE.Vector2): CloudSystem {
  const wind = initialWind.clone(); // latest wind seen by step(); new paths follow it
  const box = { x0: slab.x0 - BOX_MARGIN, x1: slab.x1 + BOX_MARGIN, z0: slab.z0 - BOX_MARGIN, z1: slab.z1 + BOX_MARGIN };

  /** signed distance from (x, z) to the slab rectangle (> 0 outside) */
  const sdSlab = (x: number, z: number): number => {
    const dx = Math.max(slab.x0 - x, x - slab.x1),
      dz = Math.max(slab.z0 - z, z - slab.z1);
    return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
  };
  /**
   * How much a cloud (centre x/alt/z, footprint radius R) seen from (cx, cy, cz) hides the model:
   * 0 = it hangs beside / beyond the slab (frames it), 1 = it sits in front of the city.
   * Uses the ground point hidden behind the cloud's centre and the footprint projected onto the ground.
   */
  const coverage = (cx: number, cy: number, cz: number, x: number, z: number, alt: number, R: number): number => {
    if (alt > cy - 12) return 0; // at / above eye level the cloud is in the sky, not in front of the model
    const k = alt / (cy - alt);
    const rg = R * (1 + k);
    return smooth(0.1 * rg, -(0.55 * rg + 25), sdSlab(x + (x - cx) * k, z + (z - cz) * k));
  };

  // hero camera (no overview POI → a virtual camera straight above: clouds simply avoid the slab)
  const heroPos = hero ? hero.position.clone() : new THREE.Vector3(0, 1e6, 0);
  const heroCam = new THREE.PerspectiveCamera(32, 1.78, 1, 6000);
  if (hero) {
    heroCam.position.copy(hero.position);
    heroCam.lookAt(hero.target);
    heroCam.updateMatrixWorld(true);
    heroCam.updateProjectionMatrix();
  }
  const heroCover = (x: number, z: number, alt: number, R: number) => coverage(heroPos.x, heroPos.y, heroPos.z, x, z, alt, R);
  /** altitude a cloud needs at (x, z): rises over the tallest towers (orographic lift) */
  const liftAt = (x: number, z: number, base: number, R: number): number => {
    let need = base;
    for (const o of obstacles) {
      const d = Math.hypot(o.x - x, o.z - z) - R - o.r;
      if (d < 40) {
        const k = d <= 0 ? 1 : 1 - d / 40;
        need = Math.max(need, base + (o.top + 14 - base) * k * k * (3 - 2 * k));
      }
    }
    return need;
  };

  // ── cloud shapes (size 1); a cloud keeps its shape for life, size / yaw / path change on re-forming
  const clouds: Cloud[] = [];
  const passers = count >= 6 ? 1 : 0;
  for (let i = 0; i < count; i++) {
    const puffs: Puff[] = [];
    const len = rng.range(22, 34);
    const nMain = 3 + Math.floor(rng.next() * 3);
    let maxR = 0;
    for (let k = 0; k < nMain; k++) {
      const t = nMain === 1 ? 0 : k / (nMain - 1) - 0.5;
      const r = 9.5 - Math.abs(t) * 7 + rng.range(-1, 1.5);
      puffs.push({ ox: t * len, oy: r * 0.32, oz: rng.range(-2.5, 2.5), r, sy: rng.range(0.78, 0.92), rot: rng.next() * 6.28, form: Math.abs(t) * 0.36 + rng.range(0, 0.08) });
      maxR = Math.max(maxR, Math.abs(t * len) + r);
    }
    const nSmall = 2 + Math.floor(rng.next() * 4);
    for (let k = 0; k < nSmall; k++) {
      const ang = rng.next() * Math.PI * 2;
      const r = rng.range(3.5, 6.5);
      const ox = Math.cos(ang) * len * rng.range(0.25, 0.55);
      const oz = Math.sin(ang) * rng.range(4, 8);
      puffs.push({ ox, oy: r * 0.25 + rng.range(0, 2.5), oz, r, sy: rng.range(0.8, 0.95), rot: rng.next() * 6.28, form: rng.range(0.3, 0.6) });
      maxR = Math.max(maxR, Math.hypot(ox, oz) + r);
    }
    let hl = 0,
      hw = 0;
    for (const p of puffs) {
      hl = Math.max(hl, Math.abs(p.ox) + p.r * 0.85);
      hw = Math.max(hw, Math.abs(p.oz) + p.r * 0.8);
    }
    clouds.push({
      x: 0,
      z: 0,
      alt: ALT_MIN,
      baseAlt: ALT_MIN,
      yaw: 0,
      radius: maxR,
      size: 1,
      puffs,
      seed: rng.range(0, 50),
      speed: i < passers ? 1.25 : rng.range(0.8, 1.2), // the high passer rides faster winds aloft
      halfLen: hl,
      halfWid: hw,
      passer: i < passers,
      sx: 0,
      sz: 0,
      dx: 1,
      dz: 0,
      len: 1,
      s: 0,
      formLen: 1,
      fadeLen: 1,
      life: 0,
      sleep: 0,
      fade: 0,
      glow: 0,
    });
  }
  const nPuffs = clouds.reduce((a, c) => a + c.puffs.length, 0);

  // ── paths
  const place = (c: Cloud) => {
    c.x = c.sx + c.dx * c.s;
    c.z = c.sz + c.dz * c.s;
    c.life = Math.max(0, Math.min(1, c.s / c.formLen, (c.len - c.s) / c.fadeLen));
  };
  /** distance a regular cloud can drift from (ax, az) along (ux, uz) without hiding the city (hero view) */
  const march = (ax: number, az: number, ux: number, uz: number, maxD: number, alt: number, R: number): number => {
    let d = 0;
    while (d < maxD) {
      const nd = d + 10,
        x = ax + ux * nd,
        z = az + uz * nd;
      if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) break;
      if (heroCover(x, z, liftAt(x, z, alt, R), R) > COVER_MAX) break;
      d = nd;
    }
    return d;
  };
  /** passers: distance until the whole cloud is clear of the slab, so they form and dissolve off the model */
  const marchOut = (ax: number, az: number, ux: number, uz: number, R: number): number => {
    let d = 0;
    while (d < 640 && sdSlab(ax + ux * d, az + uz * d) < R + 45) d += 10;
    return d;
  };
  const windDir = new THREE.Vector2(1, 0);
  const plan = (c: Cloud, initial: boolean) => {
    const wl = Math.hypot(wind.x, wind.y);
    if (wl > 1e-4) windDir.set(wind.x / wl, wind.y / wl);
    for (let attempt = 0; attempt < 80; attempt++) {
      // each layer drifts a little off the surface wind (shear): lets clouds slide *along* the
      // model's edges in the hero view instead of only toward it
      const veer = rng.range(-1, 1) * (c.passer ? 0.15 : DIR_JITTER);
      const cv = Math.cos(veer),
        sv = Math.sin(veer);
      const dx = windDir.x * cv - windDir.y * sv,
        dz = windDir.x * sv + windDir.y * cv;
      const size = c.passer ? rng.range(0.5, 0.62) : rng.range(0.92, 1.36);
      const R = c.radius * size;
      const alt = c.passer ? rng.range(PASSER_ALT_MIN, PASSER_ALT_MAX) : rng.range(ALT_MIN, ALT_MAX);
      let ax: number, az: number, back: number, fwd: number;
      if (c.passer) {
        ax = rng.range(slab.x0 + 80, slab.x1 - 80);
        az = rng.range(slab.z0 + 80, slab.z1 - 80);
        back = marchOut(ax, az, -dx, -dz, R);
        fwd = marchOut(ax, az, dx, dz, R);
      } else {
        if (hero && rng.next() > OFFSCREEN_P) {
          // anchor anywhere in the hero picture (uniform on screen): random pixel → ray → cloud altitude
          // (not behind the HUD strip at the bottom)
          _d.set(rng.range(-1, 1), rng.range(-0.55, 1), 0.5).unproject(heroCam).sub(heroCam.position).normalize();
          if (_d.y > -0.02) continue;
          const t = (alt - heroCam.position.y) / _d.y;
          if (!(t > 0)) continue; // hero camera below the cloud layer: anchor around the model instead
          ax = heroCam.position.x + _d.x * t;
          az = heroCam.position.z + _d.z * t;
          if (ax < box.x0 || ax > box.x1 || az < box.z0 || az > box.z1) continue;
        } else {
          // …or anywhere around the model (other views, cloud shadows from every side)
          ax = rng.range(box.x0, box.x1);
          az = rng.range(box.z0, box.z1);
        }
        if (heroCover(ax, az, liftAt(ax, az, alt, R), R) > COVER_MAX) continue;
        back = march(ax, az, -dx, -dz, rng.range(40, 170), alt, R);
        fwd = march(ax, az, dx, dz, rng.range(50, 190), alt, R);
        if (back < 30 || fwd < 30) continue;
      }
      const len = back + fwd;
      if (len < 110) continue;
      c.size = size;
      c.baseAlt = alt;
      c.dx = dx;
      c.dz = dz;
      c.sx = ax - dx * back;
      c.sz = az - dz * back;
      c.len = len;
      // fully formed around the anchor: it bubbles up on the way there and dissolves after it
      c.formLen = Math.max(25, Math.min(75, back * 0.85));
      c.fadeLen = Math.max(25, Math.min(85, fwd * 0.85));
      c.s = initial ? rng.range(c.formLen * 0.6, len - c.fadeLen * 0.6) : 0; // at load: mostly fully formed
      c.yaw = -Math.atan2(dz, dx) + rng.range(-0.45, 0.45); // stretched roughly along its drift
      place(c);
      c.alt = liftAt(c.x, c.z, alt, R);
      return;
    }
    c.life = 0;
    c.sleep = 4; // nothing suitable this time: try again a little later
  };
  for (const c of clouds) {
    if (c.passer) {
      c.sleep = rng.range(45, 180); // the first impression is clean: the passer shows up later
      continue;
    }
    plan(c, true);
  }

  // ── mesh
  const ico = new THREE.IcosahedronGeometry(1, 2);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const geo = mergeVertices(ico, 1e-4);
  ico.dispose();
  const aCloud = new THREE.InstancedBufferAttribute(new Float32Array(nPuffs * 4), 4);
  aCloud.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCloud', aCloud);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      uLit: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.6, 0.65, 0.75) },
      uRim: { value: new THREE.Color(1, 0.9, 0.8) },
      uMoonRim: { value: new THREE.Color(0, 0, 0) },
      uGlowBelow: { value: new THREE.Color(0, 0, 0) },
      uOpacity: { value: 0.92 },
      uRimAlpha: { value: 0 },
    },
  ]);
  const material = new THREE.ShaderMaterial({
    name: 'CottonClouds',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });

  const mesh = new THREE.InstancedMesh(geo, material, nPuffs);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  mesh.castShadow = false; // cloud shadows are drawn by post-processing (soft, screen-space)
  mesh.receiveShadow = false;
  mesh.renderOrder = 5; // after other transparents near the ground (glows, water)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.treatAsOpaque = false;

  // per-puff scratch for back-to-front sorting
  const owner = new Uint16Array(nPuffs);
  const pIdx = new Uint16Array(nPuffs);
  {
    let k = 0;
    clouds.forEach((c, ci) => c.puffs.forEach((_, pi) => ((owner[k] = ci), (pIdx[k] = pi), k++)));
  }
  const order = new Uint16Array(nPuffs);
  for (let i = 0; i < nPuffs; i++) order[i] = i;
  const keys = new Float32Array(nPuffs);
  const wx = new Float32Array(nPuffs),
    wy = new Float32Array(nPuffs),
    wz = new Float32Array(nPuffs),
    pr = new Float32Array(nPuffs),
    pa = new Float32Array(nPuffs);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _e = new THREE.Euler();
  // shadow-slot selection scratch
  const rel = new Float32Array(count);
  const sel = new Uint8Array(count);

  let shadowsOn = true;

  return {
    mesh,
    count: clouds.length,
    step(dt, w) {
      if (dt <= 0) return;
      wind.copy(w);
      const ws = Math.hypot(w.x, w.y) * SPEED;
      for (const c of clouds) {
        if (c.sleep > 0) {
          c.sleep -= dt;
          if (c.sleep <= 0) {
            c.sleep = 0;
            plan(c, false);
          }
          continue;
        }
        c.s += ws * c.speed * dt;
        if (c.s >= c.len) {
          // dissolved at the end of its path: rest a while, then re-form elsewhere
          c.life = 0;
          c.sleep = c.passer ? rng.range(200, 480) : rng.range(3, 25);
          continue;
        }
        place(c);
        c.alt += (liftAt(c.x, c.z, c.baseAlt, c.radius * c.size) - c.alt) * Math.min(1, dt * 0.35);
      }
    },
    frame(camera, state, lightDir, lightCol, lightI, sunVis, cityGlow, overcast, night) {
      const cam = camera.position;
      // shading uniforms
      const u = material.uniforms;
      (u.uLightDir.value as THREE.Vector3).copy(lightDir);
      const li = Math.min(1.25, 0.35 + lightI * 0.3);
      const dim = 1 - 0.6 * night; // night: a darker body…
      (u.uLit.value as THREE.Color).copy(state.cloudLit).multiplyScalar(li * dim);
      (u.uShade.value as THREE.Color).copy(state.cloudShade).multiplyScalar((0.55 + 0.45 * Math.min(1, lightI / 2)) * dim);
      (u.uRim.value as THREE.Color).copy(lightCol).multiplyScalar(0.55 * Math.max(sunVis, 0.25) * Math.min(1, lightI) * (1 - night));
      (u.uMoonRim.value as THREE.Color).copy(lightCol).multiplyScalar(0.34 * night); // …a faint moonlit edge
      (u.uGlowBelow.value as THREE.Color).setRGB(1.0, 0.62, 0.34).multiplyScalar(0.07 * cityGlow);
      if (overcast > 0) {
        const g = lum(u.uLit.value as THREE.Color);
        (u.uLit.value as THREE.Color).lerp(_c.setRGB(g, g, g * 1.04), overcast * 0.7).multiplyScalar(1 - overcast * 0.35);
        (u.uShade.value as THREE.Color).multiplyScalar(1 - overcast * 0.3);
      }
      u.uOpacity.value = 0.93 * (1 - 0.62 * night); // …and translucent
      u.uRimAlpha.value = 0.14 * night;

      // transforms + fades
      let k = 0;
      for (const c of clouds) {
        const R = c.radius * c.size;
        let target = 0;
        if (c.sleep <= 0 && c.life > 0) {
          const dc = Math.hypot(cam.x - c.x, cam.y - c.alt, cam.z - c.z);
          const near = smooth(R * 0.5 + 8, R * 1.15 + 45, dc);
          // never let a cloud hide what the camera is looking at (the hero view is handled by the paths)
          const cover = coverage(cam.x, cam.y, cam.z, c.x, c.z, c.alt + 4, R);
          target = near * (1 - cover * (1 - (c.passer ? PASSER_WISP : WISP)));
        }
        c.fade += (target - c.fade) * 0.12;
        c.glow = smooth(150, 0, sdSlab(c.x, c.z));
        const spread = c.size * (0.62 + 0.38 * c.life); // puffs huddle together while forming / dissolving
        const cy = Math.cos(c.yaw),
          sy = Math.sin(c.yaw);
        for (const p of c.puffs) {
          const t = Math.max(0, Math.min(1, (c.life - p.form) / (1 - p.form)));
          const e = t * t * (3 - 2 * t);
          const ox = p.ox * spread,
            oz = p.oz * spread;
          wx[k] = c.x + ox * cy + oz * sy;
          wy[k] = c.alt + p.oy * spread;
          wz[k] = c.z - ox * sy + oz * cy;
          pr[k] = p.r * c.size * (0.3 + 0.7 * e);
          pa[k] = c.fade * smooth(0, 0.45, t);
          k++;
        }
      }
      // only puffs that are visible and inside the view frustum are drawn (mesh.count): dormant,
      // dissolved and off-screen clouds cost nothing on the GPU
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pm);
      let nVis = 0;
      // back-to-front (farthest first); hidden puffs sort last; insertion sort is ~O(n) frame to frame
      for (let i = 0; i < nPuffs; i++) {
        const j = order[i];
        const dx = wx[j] - cam.x,
          dy = wy[j] - cam.y,
          dz = wz[j] - cam.z;
        _sph.center.set(wx[j], wy[j], wz[j]);
        _sph.radius = pr[j] * 1.3 + 8; // lumps + flattened base + one frame of camera lag
        if (pa[j] >= 0.004 && _frustum.intersectsSphere(_sph)) {
          keys[j] = dx * dx + dy * dy + dz * dz;
          nVis++;
        } else keys[j] = -1;
      }
      for (let i = 1; i < nPuffs; i++) {
        const v = order[i];
        const kv = keys[v];
        let j = i - 1;
        while (j >= 0 && keys[order[j]] < kv) {
          order[j + 1] = order[j];
          j--;
        }
        order[j + 1] = v;
      }
      const arr = aCloud.array as Float32Array;
      for (let slot = 0; slot < nVis; slot++) {
        const j = order[slot];
        const c = clouds[owner[j]];
        const p = c.puffs[pIdx[j]];
        const a = pa[j];
        _p.set(wx[j], wy[j], wz[j]);
        _e.set(0, c.yaw + p.rot, 0);
        _q.setFromEuler(_e);
        const r = pr[j];
        _s.set(r, r * p.sy, r);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(slot, _m);
        arr[slot * 4] = a;
        arr[slot * 4 + 1] = c.alt;
        arr[slot * 4 + 2] = c.seed + pIdx[j] * 3.7;
        arr[slot * 4 + 3] = c.glow;
      }
      mesh.count = nVis;
      mesh.instanceMatrix.needsUpdate = true;
      aCloud.needsUpdate = true;
    },
    setShadows(on) {
      shadowsOn = on;
    },
    writeShadows(out, light, strength, tint) {
      // Only clouds whose shadow can land on the model are sent (nothing else is visible: there is no
      // ground beyond the slab); with more clouds than slots, the ones nearest the model win.
      const ly = Math.max(light.y, 0.08), // same clamp as the shadow pass
        kx = light.x / ly,
        kz = light.z / ly;
      let m = 0;
      if (shadowsOn) {
        for (let i = 0; i < clouds.length; i++) {
          const c = clouds[i];
          if (c.sleep > 0 || c.life <= 0.01) continue;
          const h = c.alt + 2;
          const d = sdSlab(c.x - kx * h, c.z - kz * h) - c.halfLen * c.size * 1.4 - 40;
          if (d > 0) continue;
          rel[i] = d;
          let j = m++;
          while (j > 0 && rel[sel[j - 1]] > d) {
            sel[j] = sel[j - 1];
            j--;
          }
          sel[j] = i;
        }
      }
      const n = Math.min(m, out.data.length / 8);
      for (let s = 0; s < n; s++) {
        const c = clouds[sel[s]];
        const o = s * 8;
        const sc = c.size * (0.62 + 0.38 * c.life); // same footprint as the puffs
        out.data[o] = c.x;
        out.data[o + 1] = c.z;
        out.data[o + 2] = c.halfLen * sc;
        out.data[o + 3] = c.halfWid * sc;
        out.data[o + 4] = Math.cos(c.yaw);
        out.data[o + 5] = Math.sin(c.yaw);
        out.data[o + 6] = c.alt + 2;
        out.data[o + 7] = c.life;
      }
      out.count = n;
      out.light.copy(light);
      out.strength = shadowsOn ? strength : 0;
      out.tint.copy(tint);
    },
    stats() {
      let active = 0,
        overCity = 0;
      for (const c of clouds) {
        if (c.sleep > 0 || c.life <= 0) continue;
        active++;
        if (sdSlab(c.x, c.z) < 0) overCity++;
      }
      return { active, overCity };
    },
    invariants() {
      const out: string[] = [];
      for (const c of clouds) {
        if (!Number.isFinite(c.x + c.z + c.alt + c.life)) out.push(`cloud state not finite (${c.x}, ${c.alt}, ${c.z}, life ${c.life})`);
        else if (c.sleep <= 0 && (c.x < box.x0 - 50 || c.x > box.x1 + 50 || c.z < box.z0 - 50 || c.z > box.z1 + 50)) out.push(`cloud outside its box at (${c.x.toFixed(0)}, ${c.z.toFixed(0)})`);
      }
      return out;
    },
    list() {
      return clouds;
    },
  };
}

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pm = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sph = new THREE.Sphere();

function lum(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
