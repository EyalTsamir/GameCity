// Puddles on the asphalt: a few always stand in low spots of the gutters (AC drips, hosed-down
// pavements, the last shower), many more grow after rain and dry out over a couple of game hours.
// Inside a puddle the surface is a dark, mirror-smooth water film (the PMREM sky shows in it through
// the standard IBL); at night it mirrors the nearest street lamps: a crisp image of the lamp head
// plus the vertical glare streak typical of wet streets.
//
// The lamp heads come from the shared light registry (core/lampLight.ts lampLights(), filled by the
// props / landmarks modules while they are created); at 'modules:ready' the two nearest heads of every
// 4 m cell are baked into a small float texture (tPdLamp). Before that the texture is empty (no glints).
//
// Uniforms: uWet (0..1 wetness, follows uRain with a slow drying tail), uPdBase (dry-weather puddles),
// tPdLamp / uPdXf (lamp-head grid), uLampGain (from lampUniforms: night switch of the street lights).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { lampLights } from '../../core/lampLight';

const CELL = 4;
const X0 = -212,
  Z0 = -200,
  X1 = 212,
  Z1 = 160;
const W = Math.ceil((X1 - X0) / CELL),
  H = Math.ceil((Z1 - Z0) / CELL);

export interface PuddleState {
  uniforms: {
    uWet: { value: number };
    uPdBase: { value: number };
    tPdLamp: { value: THREE.DataTexture };
    uPdXf: { value: THREE.Vector4 };
  };
  update(simDt: number): void;
  stats(): Record<string, number>;
  dispose(): void;
}

export function createPuddles(ctx: CityContext): PuddleState {
  // two RGBA32F texels per cell (side by side): (x, y, z, intensity) of the nearest and second-nearest head
  const data = new Float32Array(W * 2 * H * 4);
  const tex = new THREE.DataTexture(data, W * 2, H, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const off = ctx.debug.params.has('nopuddles');
  // ?wet=0..1 pins the wetness (tests / screenshots of a wet street without waiting for a shower)
  const wetPin = ctx.debug.params.has('wet') ? Math.min(1, Math.max(0, Number(ctx.debug.params.get('wet')) || 0)) : null;
  const uniforms = {
    uWet: { value: 0 },
    uPdBase: { value: off ? 0 : 1 },
    tPdLamp: { value: tex },
    uPdXf: { value: new THREE.Vector4(X0, Z0, 1 / CELL, 0) },
  };
  let heads = 0;
  const bake = () => {
    const ls = lampLights().filter((l) => !l.channel && (l.kind === 'street' || l.kind === 'path' || l.kind === 'plaza' || l.kind === 'portal'));
    heads = ls.length;
    if (!ls.length) return;
    // bucket the heads on a coarse grid for the nearest search
    const B = 16;
    const bw = Math.ceil((X1 - X0) / B),
      bh = Math.ceil((Z1 - Z0) / B);
    const buckets: number[][] = Array.from({ length: bw * bh }, () => []);
    ls.forEach((l, i) => {
      const bx = Math.floor((l.x - X0) / B),
        bz = Math.floor((l.z - Z0) / B);
      if (bx >= 0 && bz >= 0 && bx < bw && bz < bh) buckets[bz * bw + bx].push(i);
    });
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const cx = X0 + (i + 0.5) * CELL,
          cz = Z0 + (j + 0.5) * CELL;
        let b1 = -1,
          b2 = -1,
          d1 = 24 * 24,
          d2 = 24 * 24;
        const bx = Math.floor((cx - X0) / B),
          bz = Math.floor((cz - Z0) / B);
        for (let z = bz - 2; z <= bz + 2; z++) {
          for (let x = bx - 2; x <= bx + 2; x++) {
            if (x < 0 || z < 0 || x >= bw || z >= bh) continue;
            for (const k of buckets[z * bw + x]) {
              const l = ls[k];
              const d = (l.x - cx) ** 2 + (l.z - cz) ** 2;
              if (d < d1) {
                d2 = d1;
                b2 = b1;
                d1 = d;
                b1 = k;
              } else if (d < d2) {
                d2 = d;
                b2 = k;
              }
            }
          }
        }
        for (const [slot, k] of [
          [0, b1],
          [1, b2],
        ] as [number, number][]) {
          const o = (j * W * 2 + i + slot * W) * 4;
          if (k < 0) {
            data[o + 3] = 0;
            continue;
          }
          const l = ls[k];
          data[o] = l.x;
          data[o + 1] = l.y;
          data[o + 2] = l.z;
          data[o + 3] = Math.min(2, l.intensity) * (l.kind === 'path' ? 0.7 : 1);
        }
      }
    }
    tex.needsUpdate = true;
  };
  ctx.events.on('modules:ready', bake);
  let wet = 0;
  return {
    uniforms,
    update(simDt: number) {
      // wetness follows the rain quickly, then dries over ~2 game hours
      const rain = ctx.uniforms.uRain.value;
      const hrs = simDt * ctx.clock.rate;
      if (rain > wet) wet += (rain - wet) * Math.min(1, hrs * 6);
      else wet = Math.max(rain, wet - hrs * 0.45);
      if (wetPin !== null) wet = wetPin;
      uniforms.uWet.value = off ? 0 : Math.min(1, wet);
    },
    stats() {
      return { puddleLampHeads: heads, wet: Math.round(wet * 100) / 100 };
    },
    dispose() {
      tex.dispose();
    },
  };
}

/** GLSL (asphalt): needs COMMON (rdHash, rdLine, tRN), LAMP_GLSL (uLampGain) and cameraPosition. */
export const PUDDLE_GLSL = /* glsl */ `
uniform float uWet;
uniform float uPdBase;
uniform sampler2D tPdLamp;
uniform vec4 uPdXf;
vec3 rdEmit = vec3(0.0);
// image of the lamp heads mirrored in a water film at wp (V = view direction, towards the surface). The lamp a
// puddle mirrors is where its reflected ray reaches lamp height — usually several times further away than the
// puddle itself — so the ray is followed to two typical head heights and the lamps nearest to those points
// are tested (exact direction → crisp image + a vertical glare streak).
vec3 rdPuddleLamps(vec3 wp, vec3 V) {
  if (uLampGain < 0.01) return vec3(0.0);
  vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
  if (R.y < 0.01) return vec3(0.0);
  float F = 0.02 + 0.98 * pow(1.0 - clamp(R.y, 0.0, 1.0), 5.0);
  vec2 sz = vec2(textureSize(tPdLamp, 0));
  float halfW = sz.x * 0.5;
  vec2 rh = normalize(R.xz + vec2(1e-5, 0.0));
  vec3 acc = vec3(0.0);
  for (int pl = 0; pl < 2; pl++) {
    float hgt = pl == 0 ? 4.4 : 6.6;
    float tH = min((hgt - wp.y) / R.y, 90.0);
    vec2 hp = wp.xz + R.xz * tH;
    vec2 cell = floor((hp - uPdXf.xy) * uPdXf.z);
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= halfW || cell.y >= sz.y) continue;
    for (int s = 0; s < 2; s++) {
      vec4 L = texelFetch(tPdLamp, ivec2(int(cell.x) + s * int(halfW), int(cell.y)), 0);
      if (L.w <= 0.0) continue;
      vec3 D = L.xyz - wp;
      float dl = length(D);
      vec3 Ld = D / max(dl, 1e-3);
      vec2 lh = normalize(Ld.xz + vec2(1e-5, 0.0));
      float az = rh.x * lh.y - rh.y * lh.x;
      float el = R.y - Ld.y;
      float core = exp(-(az * az + el * el) / 0.0007);
      float streak = exp(-(az * az) / 0.0018 - (el * el) / 0.05) * 0.25;
      acc += vec3(1.0, 0.78, 0.5) * L.w * (core * 10.0 + streak * 2.6);
    }
  }
  return acc * F * uLampGain;
}
`;
