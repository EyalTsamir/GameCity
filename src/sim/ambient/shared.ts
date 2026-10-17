// Shared helpers for the ambient module (smoke, birds, sky life, fireworks, insects).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** shortest signed angle a→b */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Light rig seen by the custom (non-three-lit) shaders of this module: smoke, kite tails… */
export interface AmbientLight {
  /** world direction towards the key light (sun or moon) */
  dir: THREE.Vector3;
  /** key light radiance factor (colour × intensity / π) */
  key: THREE.Color;
  /** hemisphere sky / ground irradiance factors (/ π) */
  sky: THREE.Color;
  ground: THREE.Color;
  /** warm city glow from below at night (/ π) */
  glow: THREE.Color;
}

const _d = new THREE.Vector3();
const _glowCol = new THREE.Color('#ffb46a');

/** Read the live light rig (sky module) into `out`; falls back to clock-derived defaults. */
export function sampleLight(ctx: CityContext, out: AmbientLight): AmbientLight {
  const sky = ctx.services.sky;
  const invPi = 1 / Math.PI;
  if (sky?.sun && sky.hemi) {
    _d.copy(sky.sun.position).sub(sky.sun.target.position);
    if (_d.lengthSq() > 1e-6) out.dir.copy(_d.normalize());
    else out.dir.copy(ctx.clock.sunDir);
    out.key.copy(sky.sun.color).multiplyScalar(sky.sun.intensity * invPi);
    out.sky.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * invPi);
    out.ground.copy(sky.hemi.groundColor).multiplyScalar(sky.hemi.intensity * invPi);
  } else {
    out.dir.copy(ctx.clock.sunDir);
    if (out.dir.y < 0.1) out.dir.y = 0.1;
    out.dir.normalize();
    const d = ctx.clock.daylight;
    out.key.setRGB(1, 0.95, 0.88).multiplyScalar((0.15 + 2.6 * d) * invPi);
    out.sky.setRGB(0.75, 0.85, 1).multiplyScalar((0.25 + 1.1 * d) * invPi);
    out.ground.setRGB(0.55, 0.5, 0.42).multiplyScalar((0.25 + 1.1 * d) * invPi);
  }
  out.glow.copy(_glowCol).multiplyScalar(ctx.uniforms.uLights.value * 0.55 * invPi);
  return out;
}

export function makeLight(): AmbientLight {
  return { dir: new THREE.Vector3(0, 1, 0), key: new THREE.Color(1, 1, 1), sky: new THREE.Color(0.3, 0.3, 0.35), ground: new THREE.Color(0.2, 0.2, 0.18), glow: new THREE.Color(0, 0, 0) };
}

/** Absolute game time in hours (day 1 starts at 0). */
export function absHours(ctx: CityContext): number {
  return (ctx.clock.day - 1) * 24 + ctx.clock.hours;
}

/**
 * Coarse "how high are the roofs here" grid (5 m cells) built from the plan:
 * building lots + tall features. Flying things use it to stay clear of rooftops.
 */
export class SkylineGrid {
  readonly cell = 5;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly top: Float32Array;

  constructor(ctx: CityContext) {
    const { plan } = ctx;
    const s = plan.slab;
    this.x0 = s.x0 - 40;
    this.z0 = s.z0 - 40;
    this.nx = Math.ceil((s.x1 - s.x0 + 80) / this.cell);
    this.nz = Math.ceil((s.z1 - s.z0 + 80) / this.cell);
    this.top = new Float32Array(this.nx * this.nz);
    const raise = (x0: number, z0: number, x1: number, z1: number, h: number) => {
      const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.cell));
      const i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / this.cell));
      const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.cell));
      const j1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / this.cell));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * this.nx + i;
          if (h > this.top[k]) this.top[k] = h;
        }
    };
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const x = this.x0 + (i + 0.5) * this.cell,
          z = this.z0 + (j + 0.5) * this.cell;
        // trees / terrain on land; open water only needs a little clearance
        this.top[j * this.nx + i] = plan.isWater(x, z) ? plan.water.level + 1.5 : Math.max(0, plan.heightAt(x, z)) + 9;
      }
    for (const lot of plan.lots) {
      const f = lot.footprint;
      const base = Math.max(0, plan.heightAt((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2));
      raise(f.x0 - 2, f.z0 - 2, f.x1 + 2, f.z1 + 2, base + lot.height + (lot.kind === 'tvtower' ? 30 : 3));
    }
    for (const f of plan.features) {
      const h = typeof f.params?.height === 'number' ? (f.params.height as number) : 0;
      if (h <= 0) continue;
      const r = Math.max(3, f.radius + 2, typeof f.params?.rotor === 'number' ? (f.params.rotor as number) : 0, typeof f.params?.jib === 'number' ? (f.params.jib as number) : 0);
      const base = Math.max(0, plan.heightAt(f.x, f.z));
      raise(f.x - r, f.z - r, f.x + r, f.z + r, base + h + 4);
    }
  }

  /** top of obstacles (roofs, crowns, masts) at (x, z) */
  at(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell),
      j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 0;
    return this.top[j * this.nx + i];
  }

  /** max obstacle top within radius r of (x, z) (coarse) */
  around(x: number, z: number, r: number): number {
    let m = 0;
    const c = this.cell;
    for (let dz = -r; dz <= r; dz += c) for (let dx = -r; dx <= r; dx += c) m = Math.max(m, this.at(x + dx, z + dz));
    return m;
  }
}

/** Minimal shared GLSL: fog for additive / custom shaders. */
export const GLSL_HASH = /* glsl */ `
float ambHash(float n) { return fract(sin(n) * 43758.5453123); }
float ambHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`;
