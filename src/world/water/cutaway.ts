// Translucent water cross-sections where the sea / river reaches the cut faces of the slab
// (the classic cut-away diorama look). The top edge follows the same swell as the surface;
// the bottom edge sits exactly on the soil-face profile (shared ground layout).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB, WATER_LEVEL, RIVER } from '../../core/constants';
import type { TerrainModel } from '../terrain/height';
import { GROUND_DROP } from '../terrain/height';
import type { EdgeProfile, SlabEdges } from '../terrain/layout';
import { noiseTexture, GLSL_HASH } from '../terrain/noise';
import type { WaterField } from './field';
import { ampFrom } from './field';
import { WAVES_GLSL } from './waves';

export interface CutawayResult {
  mesh: THREE.Mesh;
  triangles: number;
  /** wet spans per side (for stats / invariants) */
  spans: { side: string; u0: number; u1: number }[];
}

function interp(prof: EdgeProfile, u: number): number {
  const U = prof.u;
  if (u <= U[0]) return prof.h[0];
  if (u >= U[U.length - 1]) return prof.h[U.length - 1];
  let lo = 0,
    hi = U.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (U[m] <= u) lo = m;
    else hi = m;
  }
  const t = (u - U[lo]) / Math.max(1e-9, U[hi] - U[lo]);
  return prof.h[lo] + (prof.h[hi] - prof.h[lo]) * t;
}

export function createCutaway(ctx: CityContext, model: TerrainModel, field: WaterField, edges: SlabEdges): CutawayResult {
  void model;
  const pos: number[] = [];
  const nor: number[] = [];
  const edge: number[] = [];
  const amp: number[] = [];
  const reg: number[] = [];
  const idx: number[] = [];
  const spans: { side: string; u0: number; u1: number }[] = [];
  const level = WATER_LEVEL;
  const sides: { side: 'N' | 'S' | 'W' | 'E'; prof: EdgeProfile; lim?: [number, number] }[] = [
    { side: 'N', prof: edges.north },
    { side: 'S', prof: edges.south },
    { side: 'W', prof: edges.west, lim: [RIVER.z0 + 0.003, RIVER.z1 - 0.003] },
    { side: 'E', prof: edges.east },
  ];
  for (const { side, prof, lim } of sides) {
    const nx = side === 'W' ? -1 : side === 'E' ? 1 : 0;
    const nz = side === 'N' ? -1 : side === 'S' ? 1 : 0;
    const XZ = (u: number): [number, number] => (side === 'N' ? [u, SLAB.z0] : side === 'S' ? [u, SLAB.z1] : side === 'W' ? [SLAB.x0, u] : [SLAB.x1, u]);
    const bottom = (u: number) => interp(prof, u) + GROUND_DROP;
    // candidate columns: profile vertices + 2 m surface-grid vertices + wet/dry crossings
    const lo = lim ? lim[0] : prof.u[0],
      hi = lim ? lim[1] : prof.u[prof.u.length - 1];
    const us = new Set<number>();
    for (const u of prof.u) if (u >= lo && u <= hi) us.add(u);
    for (let u = Math.ceil(lo / 2) * 2; u <= hi; u += 2) us.add(u);
    us.add(lo);
    us.add(hi);
    const sorted = [...us].sort((a, b) => a - b);
    const cols: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const u = sorted[i];
      if (i > 0) {
        const up = sorted[i - 1];
        const b0 = bottom(up) - level,
          b1 = bottom(u) - level;
        if (b0 * b1 < 0) cols.push(up + ((u - up) * b0) / (b0 - b1));
      }
      cols.push(u);
    }
    let spanStart: number | null = null;
    for (let i = 0; i < cols.length - 1; i++) {
      const u0 = cols[i],
        u1 = cols[i + 1];
      const um = (u0 + u1) / 2;
      if (bottom(um) >= level - 1e-4 || u1 - u0 < 1e-5) {
        if (spanStart !== null) {
          spans.push({ side, u0: spanStart, u1: u0 });
          spanStart = null;
        }
        continue;
      }
      if (spanStart === null) spanStart = u0;
      const base = pos.length / 3;
      for (const u of [u0, u1]) {
        const [x, z] = XZ(u);
        const by = Math.min(bottom(u), level);
        const dep = field.sample(field.depth, x, z);
        const rg = field.sample(field.region, x, z);
        const a = ampFrom(Math.max(0, dep), rg);
        // top, bottom
        pos.push(x, level, z, x, by, z);
        nor.push(nx, 0, nz, nx, 0, nz);
        edge.push(1, 0);
        amp.push(a, a);
        reg.push(rg, rg);
      }
      const t0 = base,
        b0 = base + 1,
        t1 = base + 2,
        b1 = base + 3;
      if (side === 'S' || side === 'W') idx.push(b0, b1, t1, b0, t1, t0);
      else idx.push(b1, b0, t0, b1, t0, t1);
    }
    if (spanStart !== null) spans.push({ side, u0: spanStart, u1: cols[cols.length - 1] });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  geo.setAttribute('aAmp', new THREE.Float32BufferAttribute(amp, 1));
  geo.setAttribute('aRegion', new THREE.Float32BufferAttribute(reg, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const uniforms = {
    tNoise: { value: noiseTexture() },
    uTime: ctx.uniforms.uTime,
    uDaylight: ctx.uniforms.uDaylight,
    uNight: ctx.uniforms.uNight,
    uDusk: ctx.uniforms.uDusk,
    cTop: { value: new THREE.Color('#57bccf') },
    cDeep: { value: new THREE.Color('#0f3557') },
    cRivTop: { value: new THREE.Color('#58a6a0') },
    cRivDeep: { value: new THREE.Color('#1f4f5c') },
  };
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.FrontSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float aEdge;\nattribute float aAmp;\nattribute float aRegion;\nuniform float uTime;\nvarying vec3 vCW;\nvarying float vSurfY;\nvarying float vCU;\nvarying float vCR;\n${WAVES_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 cw0 = (modelMatrix * vec4(position, 1.0)).xyz;
float cdisp = th_swell(cw0.xz, uTime) * aAmp;
transformed.y += cdisp * aEdge;
vSurfY = ${WATER_LEVEL.toFixed(3)} + cdisp;
vCW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vCU = abs(normal.x) > 0.5 ? vCW.z : vCW.x;
vCR = aRegion;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tNoise;
uniform float uTime;
uniform float uDaylight;
uniform float uNight;
uniform float uDusk;
uniform vec3 cTop;
uniform vec3 cDeep;
uniform vec3 cRivTop;
uniform vec3 cRivDeep;
varying vec3 vCW;
varying float vSurfY;
varying float vCU;
varying float vCR;
${GLSL_HASH}
vec4 cutColor() {
  float d = max(vSurfY - vCW.y, 0.0);
  float riv = smoothstep(0.2, 0.45, vCR);
  vec3 top = mix(cTop, cRivTop, riv);
  vec3 deep = mix(cDeep, cRivDeep, riv);
  vec3 c = mix(top, deep, smoothstep(-0.4, mix(5.2, 2.4, riv), d));
  // slow light shafts from the surface
  float sh = texture2D(tNoise, vec2(vCU * 0.03 + uTime * 0.0035, 0.37 + d * 0.012)).r;
  float rays = smoothstep(0.58, 0.88, sh) * (1.0 - smoothstep(0.0, 6.5, d));
  c += top * rays * 0.32 * uDaylight;
  // caustic ripple under the surface
  float cr = texture2D(tNoise, vec2(vCU * 0.21 - uTime * 0.02, d * 0.35 + uTime * 0.01)).g;
  c += top * smoothstep(0.62, 0.8, cr) * 0.15 * (1.0 - smoothstep(0.0, 2.2, d)) * uDaylight;
  // suspended specks
  float sp = step(0.988, th_hash12(floor(vec2(vCU * 7.0, vCW.y * 7.0))));
  c += vec3(0.6, 0.8, 0.85) * sp * 0.22 * (1.0 - smoothstep(0.0, 6.0, d));
  // bright meniscus at the surface line
  float men = 1.0 - smoothstep(0.0, 0.13, d);
  c = mix(c, vec3(0.9, 0.98, 1.0), men * 0.6);
  // time of day
  c *= mix(0.15, 1.0, uDaylight);
  c = mix(c, c * vec3(1.15, 0.92, 0.85), uDusk * 0.5);
  float a = mix(0.62, 0.88, smoothstep(0.0, 5.0, d)) + men * 0.15;
  return vec4(c, min(a, 0.97));
}`,
      )
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = cutColor();');
  };
  mat.customProgramCacheKey = () => 'th-cutaway-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water-cutaway';
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh, triangles: idx.length / 3, spans };
}
