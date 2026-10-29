// Materials of the roads module. All three are MeshStandardMaterials with injected procedural
// colour (onBeforeCompile) so they keep three's lighting, shadows and fog:
//   * asphalt  — aggregate, mottling, tyre tracks + oil in the lanes (from the street grid), patch repairs, rain
//   * hardscape — one shader for every paved / natural surface, selected per vertex (aS.x = material id)
//   * markings — paint + glyph atlas (alphaTest), worn in the wheel paths, sub-pixel lines fade into the base colour
// Joint patterns are box-filtered analytically with fwidth so they fade out cleanly with distance.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { XS, ZS } from '../../core/constants';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { ASPHALT2, COMMON2, HARD2 } from './glsl';
import { PUDDLE_GLSL } from './puddles';

// ─────────────────────────────────────────────────────────────── noise ──

function hashLattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 256² RGBA tileable fBm value noise; channel periods R 4, G 8, B 16, A 32 cells per tile. */
let _noise: THREE.DataTexture | null = null;
export function roadNoise(): THREE.DataTexture {
  if (_noise) return _noise;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const periods = [4, 8, 16, 32];
  const tmp = new Float32Array(S * S);
  for (let ch = 0; ch < 4; ch++) {
    let lo = Infinity,
      hi = -Infinity;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let v = 0,
          amp = 1,
          norm = 0;
        for (let o = 0; o < 3; o++) {
          const P = periods[ch] << o;
          const fx = (x / S) * P,
            fy = (y / S) * P;
          const xi = Math.floor(fx),
            yi = Math.floor(fy);
          let ux = fx - xi,
            uy = fy - yi;
          ux = ux * ux * (3 - 2 * ux);
          uy = uy * uy * (3 - 2 * uy);
          const x0 = xi % P,
            y0 = yi % P,
            x1 = (xi + 1) % P,
            y1 = (yi + 1) % P;
          const seed = ch * 17 + o * 5 + 3;
          const a = hashLattice(x0, y0, seed),
            b = hashLattice(x1, y0, seed),
            c = hashLattice(x0, y1, seed),
            d = hashLattice(x1, y1, seed);
          v += amp * (a + (b - a) * ux + (c + (d - c) * ux - (a + (b - a) * ux)) * uy);
          norm += amp;
          amp *= 0.5;
        }
        v /= norm;
        tmp[y * S + x] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    for (let i = 0; i < S * S; i++) data[i * 4 + ch] = Math.round(((tmp[i] - lo) / Math.max(1e-6, hi - lo)) * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  _noise = t;
  return t;
}

/**
 * 256² RGBA tileable Voronoi of 8 x 8 jittered cells: R = distance to the nearest cell border
 * (cell units, / 0.5), G = random id of the nearest cell, B = distance to its point (cell units),
 * A = border distance of a 16 x 16 Voronoi. Crack networks, oil spots, stains.
 */
let _cracks: THREE.DataTexture | null = null;
export function roadCracks(): THREE.DataTexture {
  if (_cracks) return _cracks;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const vor = (N: number, seed: number, out: (i: number, edge: number, id: number, f1: number) => void) => {
    const px = new Float32Array(N * N),
      py = new Float32Array(N * N),
      pid = new Float32Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        px[j * N + i] = i + 0.1 + 0.8 * hashLattice(i, j, seed);
        py[j * N + i] = j + 0.1 + 0.8 * hashLattice(i, j, seed + 7);
        pid[j * N + i] = hashLattice(i, j, seed + 13);
      }
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const fx = ((x + 0.5) / S) * N,
          fy = ((y + 0.5) / S) * N;
        const ci = Math.floor(fx),
          cj = Math.floor(fy);
        let d1 = 1e9,
          d2 = 1e9,
          b1x = 0,
          b1y = 0,
          id = 0;
        const cand: [number, number][] = [];
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const ii = ci + di,
              jj = cj + dj;
            const wi = ((ii % N) + N) % N,
              wj = ((jj % N) + N) % N;
            const qx = px[wj * N + wi] + (ii - wi),
              qy = py[wj * N + wi] + (jj - wj);
            cand.push([qx, qy]);
            const d = Math.hypot(qx - fx, qy - fy);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              b1x = qx;
              b1y = qy;
              id = pid[wj * N + wi];
            } else if (d < d2) d2 = d;
          }
        // exact distance to the nearest bisector
        let e = 1e9;
        for (const [qx, qy] of cand) {
          if (qx === b1x && qy === b1y) continue;
          const mx = (qx + b1x) / 2,
            my = (qy + b1y) / 2;
          let nx = qx - b1x,
            ny = qy - b1y;
          const l = Math.hypot(nx, ny) || 1;
          nx /= l;
          ny /= l;
          const dd = (mx - fx) * nx + (my - fy) * ny;
          if (dd < e) e = dd;
        }
        void d2;
        out(y * S + x, Math.max(0, e), id, d1);
      }
  };
  vor(8, 101, (i, e, id, f1) => {
    data[i * 4] = Math.round(Math.min(1, e / 0.5) * 255);
    data[i * 4 + 1] = Math.round(id * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, f1) * 255);
  });
  vor(16, 211, (i, e) => {
    data[i * 4 + 3] = Math.round(Math.min(1, e / 0.5) * 255);
  });
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  _cracks = t;
  return t;
}

// ──────────────────────────────────────────────────────────── shared GLSL ──

const XS0 = XS[0],
  ZS0 = ZS[0],
  PITCH = XS[1] - XS[0];

const COMMON = /* glsl */ `
uniform sampler2D tRN;
uniform float uRain;
varying vec3 vWP;
float rdHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// box-filtered coverage of a line of width w at distance dist (pixel footprint fw)
float rdLine(float dist, float w, float fw) {
  fw = max(fw, 1e-4);
  float lo = max(dist - 0.5 * fw, -0.5 * w);
  float hi = min(dist + 0.5 * fw, 0.5 * w);
  return clamp((hi - lo) / fw, 0.0, 1.0);
}
float rdGrid(vec2 q, vec2 c, float w) {
  vec2 fw = fwidth(q);
  vec2 d = abs(fract(q / c + 0.5) - 0.5) * c;
  return max(rdLine(d.x, w, fw.x), rdLine(d.y, w, fw.y));
}
// running bond; returns joint coverage, writes the brick cell id and the distance to its nearest edge
float rdBond(vec2 q, vec2 c, float w, out vec2 cell, out float edge) {
  vec2 fw = fwidth(q);
  float row = floor(q.y / c.y);
  float qx = q.x + mod(row, 2.0) * 0.5 * c.x;
  cell = vec2(floor(qx / c.x), row);
  float dy = abs(fract(q.y / c.y + 0.5) - 0.5) * c.y;
  float dx = abs(fract(qx / c.x + 0.5) - 0.5) * c.x;
  edge = min(dx, dy);
  return max(rdLine(dx, w, fw.x), rdLine(dy, w, fw.y));
}
// 1 while cells of size 'cell' are comfortably larger than a pixel, fading to 0 when they shrink below ~3 px
float rdDetail(vec2 q, float cell) {
  float fw = max(fwidth(q.x), fwidth(q.y));
  return 1.0 - smoothstep(0.1, 0.35, fw / cell);
}
// street grid coordinates: x = signed offset from the nearest street centre line, y = distance from the nearest junction
vec2 rdStreet(vec2 p) {
  float lx = mod(p.x - (${XS0.toFixed(1)}) + ${(PITCH / 2).toFixed(1)}, ${PITCH.toFixed(1)}) - ${(PITCH / 2).toFixed(1)};
  float lz = mod(p.y - (${ZS0.toFixed(1)}) + ${(PITCH / 2).toFixed(1)}, ${PITCH.toFixed(1)}) - ${(PITCH / 2).toFixed(1)};
  return abs(lx) < abs(lz) ? vec2(lx, abs(lz)) : vec2(lz, abs(lx));
}
`;

function inject(mat: THREE.MeshStandardMaterial, opts: { attrs: string; varyings: string; assign: string; pars: string; color: string; key: string; uniforms: Record<string, THREE.IUniform>; after?: string; emit?: string; nrm?: string }): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, opts.uniforms, lampUniforms());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${opts.attrs}\n${opts.varyings}\nvarying vec3 vWP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.assign}\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    let fs = shader.fragmentShader.replace('#include <common>', `#include <common>\n${opts.varyings}\n${LAMP_GLSL}\n${COMMON}\n${opts.pars}`);
    // night street-light map (black until the lamps module bakes it): light multiplies the albedo.
    // world normal from the view-space shading normal (rotation only: inverse = transpose)
    fs = fs.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vWP, inverseTransformDirection(normal, viewMatrix));');
    if (opts.color) {
      fs = fs
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `float rdRough = 0.9;\nvec4 diffuseColor = vec4( ${opts.color}, opacity );`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rdRough;');
    }
    if (opts.nrm) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${opts.nrm}`);
    if (opts.after) fs = fs.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n${opts.after}`);
    if (opts.emit) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += ${opts.emit};`);
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => opts.key;
}

// ───────────────────────────────────────────────────────────────── asphalt ──

const ASPHALT = /* glsl */ `
uniform vec3 uAsph;
vec3 rdAsphalt(inout float rough) {
  vec2 p = vWP.xz;
  vec2 fwP = fwidth(p);
  vec4 nL = texture2D(tRN, p * 0.015625);
  vec4 nM = texture2D(tRN, p * 0.0625);
  vec4 nS = texture2D(tRN, p * 0.5);
  vec3 c = uAsph;
  if (vA.y > 1.5) c = mix(c, vec3(0.105, 0.072, 0.066), 0.55);      // schoolyard: warm red-brown tarmac
  else if (vA.y > 0.5) c *= 1.12;                                    // parking: older, sun-bleached
  c *= 0.91 + 0.11 * nL.r + 0.06 * nL.b;                             // large mottling
  float spk = nS.a * 0.6 + nS.b * 0.4;
  c *= 0.92 + 0.16 * spk;                                            // aggregate
  c += vec3(0.022, 0.021, 0.019) * smoothstep(0.8, 0.95, nS.a) * (1.0 - smoothstep(0.1, 0.35, max(fwP.x, fwP.y) / 0.06));
  rough = 0.9;
  if (vA.x > 0.5) {
    vec2 st = rdStreet(p);
    float lat = abs(st.x), al = st.y;
    float onRoad = 1.0 - smoothstep(3.25, 3.55, lat);
    float fadeJ = smoothstep(6.0, 13.0, al);
    float trk = max(1.0 - smoothstep(0.12, 0.42, abs(lat - 0.95)), 1.0 - smoothstep(0.12, 0.42, abs(lat - 2.55)));
    trk *= fadeJ * onRoad * (0.7 + 0.6 * nM.g);
    c *= 1.0 - 0.12 * trk;
    rough -= 0.14 * trk;
    float lane = 1.0 - smoothstep(0.08, 0.5, abs(lat - 1.75));
    float queue = smoothstep(7.4, 8.6, al) * (1.0 - smoothstep(12.0, 24.0, al));
    float oil = lane * onRoad * (0.25 + 0.75 * queue) * smoothstep(0.5, 0.78, nM.a * 0.55 + nS.r * 0.45);
    c *= 1.0 - 0.3 * oil;
    rough -= 0.3 * oil;
    // dusty edge along the gutter
    c = mix(c, c * 1.18 + vec3(0.01), smoothstep(2.9, 3.4, lat) * onRoad * 0.6);
  }
  // patch repairs in a world-aligned cell grid
  vec2 cs = vec2(9.0, 6.5);
  vec2 pc = floor(p / cs);
  float h = rdHash(pc);
  if (h < 0.1) {
    vec2 f = p - pc * cs;
    vec2 lo = vec2(0.6 + 3.0 * rdHash(pc + 3.1), 0.5 + 2.0 * rdHash(pc + 5.7));
    vec2 hi = lo + vec2(1.6 + 3.2 * rdHash(pc + 1.3), 1.2 + 2.4 * rdHash(pc + 7.9));
    vec2 fw = fwP;
    vec2 inLo = smoothstep(lo - fw, lo + fw, f), inHi = 1.0 - smoothstep(hi - fw, hi + fw, f);
    float inside = inLo.x * inLo.y * inHi.x * inHi.y;
    vec2 de = min(abs(f - lo), abs(f - hi));
    float seam = max(rdLine(de.x, 0.05, fw.x) * step(lo.y, f.y) * step(f.y, hi.y), rdLine(de.y, 0.05, fw.y) * step(lo.x, f.x) * step(f.x, hi.x));
    c = mix(c, c * (h < 0.05 ? 0.8 : 1.12), inside);
    c *= 1.0 - 0.35 * seam;
    rough -= 0.06 * inside;
  }
  // rain: darker, glossier, puddles in the dips
  float puddle = smoothstep(0.64, 0.72, nL.g * 0.6 + nM.r * 0.4) * uRain;
  c *= mix(1.0, 0.58, uRain) * (1.0 - 0.18 * puddle);
  rough = mix(rough, 0.22, clamp(uRain * 0.75 + puddle * 0.5, 0.0, 1.0));
  return c;
}
`;

// ─────────────────────────────────────────────────────────────── hardscape ──

const HARD = /* glsl */ `
uniform vec4 uRad[3];
uniform vec3 uTactile;
// single code path for every surface: parameters come per vertex (see surfaces.ts)
vec3 rdHard(inout float rough) {
  vec2 p = vWP.xz;
  vec2 fwp = fwidth(p);
  float fwm = max(fwp.x, fwp.y) + 1e-5;
  float fwu = fwidth(vS.y) + 1e-5;
  float fwd = fwidth(vS.x) + 1e-5;
  vec4 nM = texture2D(tRN, p * 0.0625);
  vec4 nS = texture2D(tRN, p * 0.5);
  float frame = vS.w;
  vec2 q = frame < 0.5 ? p : (frame < 1.5 ? p.yx : vec2(vS.y, 0.5));
  vec2 fq = frame < 0.5 ? fwp : (frame < 1.5 ? fwp.yx : vec2(fwu, 1e-4));
  vec2 size = vP.xy;
  float minS = min(size.x, size.y);
  // tiles: running bond / grid / random row offsets
  float row = floor(q.y / size.y);
  float off = vV.z >= 0.0 ? mod(row, 2.0) * vV.z : rdHash(vec2(row, 3.7));
  float qx = q.x / size.x + off;
  vec2 cell = vec2(floor(qx), row);
  float dx = abs(fract(qx + 0.5) - 0.5) * size.x;
  float dy = abs(fract(q.y / size.y + 0.5) - 0.5) * size.y;
  float joint = max(rdLine(dx, vP.z, fq.x), rdLine(dy, vP.z, fq.y));
  float det = 1.0 - smoothstep(0.1, 0.35, fwm / minS);
  vec3 c = vC * (1.0 + (rdHash(cell) - 0.5) * vV.x * det);
  c *= 1.0 - vV.y * det * (1.0 - smoothstep(0.0, minS * 0.32, min(dx, dy)));
  c *= 1.0 - vP.w * joint;
  // grain, mottling, stains
  c *= 1.0 + vV.w * (nS.a * 0.6 + nS.g * 0.4 - 0.5) * 1.6;
  c *= 0.95 + 0.08 * nM.b;
  c *= 1.0 - vX.x * smoothstep(0.58, 0.82, nM.a * 0.65 + nS.r * 0.35);
  // stripes along q.y (pitch mowing / furrows / ripples)
  float tS = fract(q.y / max(vX.y, 1e-3));
  float st = vX.z > 0.0 ? smoothstep(0.5 - fq.y / max(vX.y, 1e-3), 0.5 + fq.y / max(vX.y, 1e-3), tS) : abs(tS - 0.5) * 2.0;
  c *= 1.0 + step(1e-3, vX.y) * abs(vX.z) * (st - 0.5);
  rough = vX.w;
  float sp = vS.z;
  if (sp > 0.5 && sp < 1.5) {
    // tactile paving beside the crosswalks (vS.x = distance from curb, vS.y = along the arm)
    float a = vS.y, dC = vS.x;
    float tw = smoothstep(4.35 - fwu, 4.35 + fwu, a) * (1.0 - smoothstep(5.95 - fwu, 5.95 + fwu, a))
             * smoothstep(0.26 - fwd, 0.26 + fwd, dC) * (1.0 - smoothstep(0.92 - fwd, 0.92 + fwd, dC));
    vec2 dq = abs(fract(p / 0.12) - 0.5);
    float dots = (1.0 - smoothstep(0.18, 0.3, length(dq))) * (1.0 - smoothstep(0.1, 0.35, fwm / 0.12));
    c = mix(c, uTactile * (1.0 + 0.12 * dots) * (0.95 + 0.1 * nS.r), tw);
  } else if (sp > 1.5 && sp < 2.5) {
    // concentric rings of setts around fountains / statues
    for (int i = 0; i < 3; i++) {
      vec4 R = uRad[i];
      vec2 d = p - R.xy;
      float rr = length(d);
      if (R.z > 0.0 && rr < R.z) {
        float ring = floor(rr / 0.55);
        float qa = atan(d.y, d.x + 1e-5) * (ring + 0.5) * 0.55 / 0.62 + ring * 0.37;
        float rj = rdLine(abs(fract(rr / 0.55 + 0.5) - 0.5) * 0.55, 0.018, fwm);
        float aj = rdLine(abs(fract(qa + 0.5) - 0.5) * 0.62, 0.018, fwm);
        float band = mod(ring, 4.0) < 0.5 ? 1.0 : 0.0;
        float det2 = 1.0 - smoothstep(0.1, 0.35, fwm / 0.55);
        vec3 rc = mix(vC, vC * vec3(0.66, 0.7, 0.78), band) * (1.0 + (rdHash(vec2(floor(qa), ring)) - 0.5) * 0.12 * det2);
        rc *= 1.0 - 0.38 * max(rj, aj);
        c = mix(c, rc * (0.95 + 0.08 * nM.b), 1.0 - smoothstep(R.z - 0.6, R.z, rr));
      }
    }
  } else if (sp > 2.5) {
    // grass creeping into gravel
    float g = smoothstep(0.5, 0.75, nM.g * 0.5 + nS.r * 0.5);
    c = mix(c, vec3(0.3, 0.45, 0.17) * (0.85 + 0.3 * nS.b), g * 0.7);
  }
  c *= mix(1.0, 0.76, uRain);
  rough = mix(rough, rough * 0.55, uRain);
  return c;
}
`;

// ───────────────────────────────────────────────────────────────── markings ──

const PAINT_AFTER = /* glsl */ `
{
  vec2 st = rdStreet(vWP.xz);
  float lat = abs(st.x);
  float wheel = max(1.0 - smoothstep(0.15, 0.5, abs(lat - 0.95)), 1.0 - smoothstep(0.15, 0.5, abs(lat - 2.55)));
  float wearAmt = max(vM.y, 0.35) * (0.5 + 0.6 * wheel);
  float nw = texture2D(tRN, vWP.xz * 0.8).a * 0.6 + texture2D(tRN, vWP.xz * 0.21).b * 0.4;
  // (detail fade from the geometric-mean pixel footprint: at eye level the paint is seen at grazing angles)
  vec2 fwq = fwidth(vWP.xz);
  float detq = 1.0 - smoothstep(0.1, 0.35, sqrt(fwq.x * fwq.y) / 0.1);
  // (wear < 0 flags cast iron — manholes, gullies, lids: no paint to wear off; dirt sits in the recesses instead)
  float worn = smoothstep(0.7 - 0.5 * wearAmt, 0.76 - 0.5 * wearAmt, nw) * detq * step(-0.5, vM.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.82 + vB * 0.18, 0.6);   // dirty, sun-faded paint
  diffuseColor.rgb = mix(diffuseColor.rgb, vB, worn * 0.9);
  float fw = length(fwidth(vWP.xz));
  diffuseColor.rgb = mix(vB, diffuseColor.rgb, clamp(vM.x / max(fw, 1e-4), 0.0, 1.0));
  diffuseColor.rgb *= mix(1.0, 0.7, uRain);
}
`;

export interface RoadMaterials {
  asphalt: THREE.MeshStandardMaterial;
  hard: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  asphaltColor: THREE.Color;
}

export interface SurfaceInfo {
  radial: { x: number; z: number; r: number }[];
  court: { x0: number; z0: number; x1: number; z1: number } | null;
}

/** ?legacyground: the original (pre-overhaul) asphalt + hardscape shaders, for A/B. */
export function legacyGround(ctx: CityContext): boolean {
  return ctx.debug.params.has('legacyground');
}

export function createMaterials(ctx: CityContext, info: SurfaceInfo, atlas: THREE.Texture, puddles: Record<string, THREE.IUniform>): RoadMaterials {
  const radial = info.radial;
  const legacy = legacyGround(ctx);
  const noise = roadNoise();
  const cracks = roadCracks();
  // perf experiments (debug only): roadsFlat=1 constant colours, roadsLambert=1 Lambert lighting
  const flatQ = ctx.debug.params.get('roadsFlat') ?? '';
  const flatA = flatQ === '1' || flatQ.includes('a');
  const flat = flatQ === '1' || flatQ.includes('h');
  const Std = (p: THREE.MeshStandardMaterialParameters) => (ctx.debug.params.get('roadsLambert') === '1' ? (new THREE.MeshLambertMaterial(p as THREE.MeshLambertMaterialParameters) as unknown as THREE.MeshStandardMaterial) : new THREE.MeshStandardMaterial(p));
  const asphaltColor = new THREE.Color('#4a4d52');
  const shared = { tRN: { value: noise }, uRain: ctx.uniforms.uRain, uRdWear: { value: ctx.debug.params.has('nowear') ? 0 : 1 }, uKerbD: { value: ctx.debug.params.has('nokerbdetail') || ctx.quality.level === 'low' ? 0 : 1 }, uRdHand: { value: ctx.debug.params.has('nohandlaid') ? 0 : 1 } };

  const lin = (h: string) => new THREE.Color(h);
  const court = info.court ? new THREE.Vector4(info.court.x0, info.court.z0, info.court.x1, info.court.z1) : new THREE.Vector4(0, 0, 0, 0);
  const asphalt = Std({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  inject(asphalt, {
    attrs: 'attribute vec2 aA;',
    varyings: 'varying vec2 vA;',
    assign: 'vA = aA;',
    pars: legacy ? ASPHALT : COMMON2 + PUDDLE_GLSL + ASPHALT2,
    color: flatA ? 'uAsph' : 'rdAsphalt(rdRough)',
    emit: legacy || flatA ? undefined : 'rdEmit',
    key: 'roads-asphalt-v4' + (flatA ? 'f' : '') + (legacy ? 'L' : ''),
    uniforms: {
      ...shared,
      ...puddles,
      tRC: { value: cracks },
      uAsph: { value: asphaltColor },
      uCourt: { value: court },
      uCourtA: { value: lin('#3d78ae') },
      uCourtB: { value: lin('#4b8c5e') },
      uCourtC: { value: lin('#c25a40') },
    },
  });

  const rad = [0, 1, 2].map((i) => {
    const r = radial[i];
    return r ? new THREE.Vector4(r.x, r.z, r.r, 1) : new THREE.Vector4(0, 0, 0, 0);
  });
  const hard = Std({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  inject(hard, {
    attrs: 'attribute vec4 aS;\nattribute vec4 aP;\nattribute vec4 aV;\nattribute vec3 aC;\nattribute vec4 aX;\nattribute vec4 aR;\nattribute vec4 aB;',
    varyings: 'varying vec4 vS;\nvarying vec4 vP;\nvarying vec4 vV;\nvarying vec3 vC;\nvarying vec4 vX;\nvarying vec4 vR;\nvarying vec4 vB;',
    assign: 'vS = aS; vP = aP; vV = aV; vC = aC; vX = aX; vR = aR; vB = aB;',
    pars: legacy ? HARD : COMMON2 + HARD2,
    color: flat ? 'vec3(0.5)' : 'rdHard(rdRough)',
    nrm: flat || legacy ? undefined : 'normal = normalize(normal + (viewMatrix * vec4(rdN, 0.0)).xyz);',
    key: 'roads-hard-v6' + (flat ? 'f' : '') + (legacy ? 'L' : ''),
    uniforms: { ...shared, tRC: { value: cracks }, uRad: { value: rad }, uTactile: { value: new THREE.Color('#c09c4e') }, uBandCol: { value: new THREE.Color(0.16, 0.165, 0.175) }, uWetH: puddles.uWet },
  });

  const paint = Std({
    color: 0xffffff,
    vertexColors: true,
    map: atlas,
    alphaTest: 0.5,
    roughness: 0.62,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  inject(paint, {
    attrs: 'attribute vec2 aM;\nattribute vec3 aB;',
    varyings: 'varying vec2 vM;\nvarying vec3 vB;',
    assign: 'vM = aM;\nvB = aB;',
    pars: '',
    color: '',
    after: PAINT_AFTER,
    key: 'roads-paint-v5',
    uniforms: shared,
  });
  return { asphalt, hard, paint, asphaltColor };
}
