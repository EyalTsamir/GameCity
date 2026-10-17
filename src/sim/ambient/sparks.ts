// Additive light points — ONE draw call (instanced GL points) for everything that glows:
//   • GPU-analytic fireworks stars: each star stores (p0, v0, t0, life, drag, gravity) and the
//     vertex shader evaluates its trajectory — plus K earlier samples of the same curve, which
//     gives free, correctly curved trails (drooping willows!). The CPU only writes a star once.
//   • CPU-driven glows ("static" slots re-written every frame): aircraft nav lights & strobes,
//     the balloon burner, fireflies, barge lamps.
// Colours are linear HDR (values > 1 bloom). Distance fog fades the light out (additive-safe).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

export const SPARK = { STAR: 0, STROBE: 1, ROCKET: 2, GLOW: 3, FLASH: 4, CRACKLE: 5, WILLOW: 6, SMOKEGLOW: 7 } as const;

const K = 8; // samples per star (head + trail)

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uT;
uniform float uScale;
uniform float uMaxPx;
uniform vec4 uRefl; // water y, x0, x1, strength
attribute float aTrail;
attribute vec4 iA; // p0.xyz, t0
attribute vec4 iB; // v0.xyz, life
attribute vec4 iC; // rgb, size (m)
attribute vec4 iD; // drag, gravity, trail spacing (s), type
varying vec3 vCol;
varying float vSoft;
float sHash(float n) { return fract(sin(n) * 43758.5453123); }
void cull() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); vSoft = 0.0; }
void main() {
  float type = iD.w;
  vec3 p;
  float bright = 1.0;
  float size = iC.w;
  vSoft = 0.0;
  if (type > 2.5 && type < 3.5) {
    if (aTrail > 0.5 || size <= 0.0) { cull(); return; }
    p = iA.xyz;
  } else {
    // the last sample of every star is its reflection on the sea (head position, mirrored)
    bool refl = aTrail > ${(K - 1.5).toFixed(1)};
    float age = uT - iA.w - (refl ? 0.0 : aTrail * iD.z);
    float life = iB.w;
    if (age < 0.0 || age > life) { cull(); return; }
    float k = max(iD.x, 1e-3);
    float e = exp(-k * age);
    vec3 g = vec3(0.0, -iD.y, 0.0);
    p = iA.xyz + iB.xyz * (1.0 - e) / k + g * (age / k - (1.0 - e) / (k * k));
    float lf = age / life;
    float tf = aTrail / ${K.toFixed(1)};
    float id = iA.x * 12.9898 + iA.z * 78.233 + iA.w * 3.17 + iB.x * 1.3;
    if (type > 3.5 && type < 4.5) {
      // flash: big soft sprite, very fast decay
      if (aTrail > 0.5 && !refl) { cull(); return; }
      bright = exp(-age * 9.0) * (1.0 - lf);
      size *= 0.75 + age * 2.5;
      vSoft = 1.0;
    } else if (type > 6.5) {
      // glow of the lit burst smoke: slow, soft
      if (aTrail > 0.5 && !refl) { cull(); return; }
      bright = smoothstep(0.0, 0.08, lf) * pow(1.0 - lf, 2.0);
      size *= 0.8 + lf * 0.6;
      vSoft = 1.0;
    } else {
      bright = 1.0 - smoothstep(0.62, 1.0, lf);
      if (!refl) {
        bright *= pow(1.0 - tf, 1.5);
        size *= mix(1.0, 0.5, tf);
      }
      if (type > 0.5 && type < 1.5) {
        // strobe / glitter: hard flicker in the second half
        float on = step(0.45, sHash(id + floor(uT * 22.0) + aTrail * 7.0));
        bright *= mix(1.0, on * 1.6, smoothstep(0.35, 0.55, lf));
      } else if (type > 1.5 && type < 2.5) {
        // rising shell: sparkly gold tail
        bright *= aTrail < 0.5 ? 1.0 : 0.45 + 0.55 * sHash(id + aTrail * 3.1 + floor(uT * 30.0));
      } else if (type > 4.5 && type < 5.5) {
        // crackle: the star bursts into micro-sparks near the end
        float c = smoothstep(0.55, 0.7, lf);
        vec3 h = vec3(sHash(id + aTrail), sHash(id * 1.7 + aTrail), sHash(id * 2.3 + aTrail)) - 0.5;
        p += h * c * 2.4 * (aTrail > 0.5 ? 1.0 : 0.0);
        bright *= mix(1.0, 0.4 + 1.6 * step(0.5, sHash(id + aTrail * 5.0 + floor(uT * 26.0))), c);
        bright *= aTrail > 0.5 ? mix(0.6, 1.3, c) : 1.0;
      } else if (type > 5.5) {
        // willow: long golden drip, sparkling trail
        bright = (1.0 - smoothstep(0.75, 1.0, lf)) * pow(1.0 - tf, 0.9);
        bright *= aTrail < 0.5 ? 1.0 : 0.55 + 0.45 * sHash(id + aTrail + floor(uT * 18.0));
      }
      // colour ageing: hot white core → the star's colour → dim ember
      vec3 base = iC.rgb;
      base = mix(base, vec3(dot(base, vec3(0.33))) * 1.2 + base * 0.2, smoothstep(0.08, 0.0, lf) * 0.6);
      base *= mix(1.0, 0.7, lf);
      vCol = base;
    }
  }
  if (type > 2.5 && type < 3.5 || type > 3.5 && type < 4.5 || type > 6.5) vCol = iC.rgb;
  #ifdef PREPASS
  // depth pre-pass: only the bright star cores (so the tilt-shift DOF sees the bursts at their
  // true distance instead of the far background behind them)
  if (type > 2.5 && type < 4.5 || type > 6.5 || aTrail > ${(K - 1.5).toFixed(1)} || bright < 0.3) { cull(); return; }
  #endif
  if (!(type > 2.5 && type < 3.5) && aTrail > ${(K - 1.5).toFixed(1)}) {
    // mirror across the water plane and drop the point onto the surface along the view ray
    vec3 Pm = vec3(p.x, 2.0 * uRefl.x - p.y, p.z);
    vec3 Cm = cameraPosition;
    float tt = (Cm.y - uRefl.x) / max(1e-3, Cm.y - Pm.y);
    vec3 R = Cm + (Pm - Cm) * tt;
    if (uRefl.w <= 0.0 || Cm.y < uRefl.x + 0.5 || p.y < uRefl.x || R.x < uRefl.y || R.x > uRefl.z) { cull(); return; }
    float idr = iA.x * 7.31 + iA.w * 1.7;
    p = R + vec3(0.0, 0.06, 0.0);
    bright *= uRefl.w * (0.55 + 0.45 * sHash(idr + floor(uT * 14.0)));
  }
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  float px = size * uScale / max(0.1, -mvPosition.z);
  #ifndef PREPASS
  // pull the additive pass a little towards the camera so it never fails against the pre-pass
  if (!(type > 2.5 && type < 3.5)) mvPosition.z += min(2.5, -mvPosition.z * 0.02);
  #endif
  float cl = max(px, 1.8);
  bright *= min(1.0, (px * px) / (cl * cl) * 1.8);
  gl_PointSize = min(cl, uMaxPx);
  vCol *= bright;
  gl_Position = projectionMatrix * mvPosition;
  if (bright < 0.002) cull();
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec3 vCol;
varying float vSoft;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * mix(7.0, 3.2, vSoft));
  float halo = (1.0 - r2);
  vec3 col = vCol * (core + halo * halo * mix(0.18, 0.35, vSoft));
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    col *= 1.0 - fogF * 0.92;
  #endif
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_PREPASS = /* glsl */ `
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  if (dot(d, d) > 0.16) discard;
  gl_FragColor = vec4(0.0);
}
`;

export interface SparkSystem {
  points: THREE.Points;
  /** depth-only pre-pass of the star cores (add next to `points`) */
  prepass: THREE.Points;
  /** sim clock of the spark system (seconds) */
  readonly time: number;
  /** allocate a CPU-driven glow slot */
  glowSlot(): number;
  /** position/colour (linear HDR) / size (m) of a glow slot; size 0 hides it */
  setGlow(slot: number, x: number, y: number, z: number, r: number, g: number, b: number, size: number): void;
  hideGlow(slot: number): void;
  /** spawn a GPU star now (+ delay seconds) */
  star(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number, size: number, drag: number, gravity: number, spacing: number, type: number, delay?: number): void;
  /** expected stars still alive */
  liveStars(): number;
  update(dt: number): void;
  frame(): void;
  stats(): Record<string, number>;
  invariants(): string[];
}

export function createSparks(ctx: CityContext, maxStars = 4096, nStatic = 64): SparkSystem {
  const total = nStatic + maxStars;
  const geo = new THREE.InstancedBufferGeometry();
  const base = new Float32Array(K * 3);
  const trail = new Float32Array(K);
  for (let i = 0; i < K; i++) trail[i] = i;
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aTrail', new THREE.BufferAttribute(trail, 1));
  const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const A = mk(),
    B = mk(),
    C = mk(),
    D = mk();
  geo.setAttribute('iA', A);
  geo.setAttribute('iB', B);
  geo.setAttribute('iC', C);
  geo.setAttribute('iD', D);
  geo.instanceCount = 0;
  // static slots default to hidden glows
  for (let i = 0; i < nStatic; i++) D.setW(i, SPARK.GLOW);

  const gl = ctx.renderer.getContext();
  const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | number[] | null;
  const maxPx = range ? Math.max(16, Math.min(512, range[1])) : 256;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uScale: { value: 800 }, uMaxPx: { value: maxPx }, uRefl: { value: new THREE.Vector4(-1.6, 147, 200, 0.22) } }]);
  const material = new THREE.ShaderMaterial({
    name: 'ambient-sparks',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'ambient-sparks';
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.visible = false;
  const preMat = new THREE.ShaderMaterial({
    name: 'ambient-sparks-depth',
    uniforms: material.uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG_PREPASS,
    defines: { PREPASS: 1 },
    transparent: true,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    fog: true,
  });
  const prepass = new THREE.Points(geo, preMat);
  prepass.name = 'ambient-sparks-depth';
  prepass.frustumCulled = false;
  prepass.renderOrder = 5.9;
  prepass.visible = false;

  let T = 0;
  let nextStatic = 0;
  let ring = 0;
  let lastDeath = -1;
  let spawned = 0;
  let overwritten = 0;
  const deathAt = new Float32Array(maxStars);
  const staticUsed = new Uint8Array(nStatic);
  let staticDirty = false;
  let dirtyLo = Infinity,
    dirtyHi = -1;
  const sz = new THREE.Vector2();

  const markDirty = (i: number) => {
    if (i < dirtyLo) dirtyLo = i;
    if (i > dirtyHi) dirtyHi = i;
  };

  const sys: SparkSystem = {
    points,
    prepass,
    get time() {
      return T;
    },
    glowSlot() {
      if (nextStatic >= nStatic) return -1;
      staticUsed[nextStatic] = 1;
      return nextStatic++;
    },
    setGlow(slot, x, y, z, r, g, b, size) {
      if (slot < 0) return;
      A.setXYZW(slot, x, y, z, 0);
      C.setXYZW(slot, r, g, b, size);
      staticDirty = true;
    },
    hideGlow(slot) {
      if (slot < 0) return;
      if (C.getW(slot) !== 0) {
        C.setW(slot, 0);
        staticDirty = true;
      }
    },
    star(x, y, z, vx, vy, vz, life, r, g, b, size, drag, gravity, spacing, type, delay = 0) {
      const k = ring;
      ring = (ring + 1) % maxStars;
      const t0 = T + delay;
      if (deathAt[k] > T) overwritten++;
      const die = t0 + life + spacing * K;
      deathAt[k] = die;
      if (die > lastDeath) lastDeath = die;
      const i = nStatic + k;
      A.setXYZW(i, x, y, z, t0);
      B.setXYZW(i, vx, vy, vz, life);
      C.setXYZW(i, r, g, b, size);
      D.setXYZW(i, drag, gravity, spacing, type);
      markDirty(i);
      spawned++;
    },
    liveStars() {
      let n = 0;
      for (let k = 0; k < maxStars; k++) if (deathAt[k] > T) n++;
      return n;
    },
    update(dt) {
      T += dt;
    },
    frame() {
      // upload changed ranges
      if (staticDirty) {
        for (const at of [A, C]) {
          at.addUpdateRange(0, nStatic * 4);
          at.needsUpdate = true;
        }
        staticDirty = false;
      }
      if (dirtyHi >= dirtyLo) {
        for (const at of [A, B, C, D]) {
          at.addUpdateRange(dirtyLo * 4, (dirtyHi - dirtyLo + 1) * 4);
          at.needsUpdate = true;
        }
        dirtyLo = Infinity;
        dirtyHi = -1;
      }
      const starsLive = lastDeath > T;
      let anyStatic = false;
      for (let i = 0; i < nextStatic; i++)
        if (C.getW(i) > 0) {
          anyStatic = true;
          break;
        }
      geo.instanceCount = starsLive ? total : anyStatic ? nextStatic : 0;
      points.visible = geo.instanceCount > 0;
      prepass.visible = starsLive;
      if (!points.visible) return;
      material.uniforms.uT.value = T;
      ctx.renderer.getDrawingBufferSize(sz);
      material.uniforms.uScale.value = sz.y * 0.5 * ctx.quality.renderScale * ctx.camera.projectionMatrix.elements[5];
    },
    stats() {
      return { sparkStars: sys.liveStars(), sparkSpawned: spawned, sparkOverwritten: overwritten, glowSlots: nextStatic };
    },
    invariants() {
      const out: string[] = [];
      if (overwritten > 0) out.push(`sparks: ${overwritten} live fireworks stars overwritten (ring buffer of ${maxStars} too small)`);
      if (!Number.isFinite(T)) out.push('sparks: clock is not finite');
      return out;
    },
  };
  // the update range API accumulates; clear before the first frame
  for (const at of [A, B, C, D]) at.clearUpdateRanges();
  return sys;
}
