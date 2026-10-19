// One wind for the whole world: every swaying, rippling, drifting or flapping thing (grass, trees,
// flags, laundry, smoke, water ripples, kites, sails) reads the same field, so a gust visibly
// travels across a meadow, then bends the trees, then tugs the flags further downwind.
//
//   • Prevailing wind — globalUniforms.uWind = direction (xz, unit) × strength (0..1.5). It changes
//     slowly over the game day (calm night, light morning breeze, fresh afternoon, easing evening)
//     with a slow veer of ±18° and minute-scale swells; updateWind(clock) (main.ts) sets it every frame.
//   • Gust fronts — wavy bands of stronger wind travelling downwind at the wind's speed, broken into
//     patches by a slow cross-wind envelope (thGust ∈ 0..1). Typical spacing 55–140 m, so a gust takes
//     a few seconds to cross a lawn: the "wave through a wheat field".
//
// GLSL (WIND_GLSL; needs `uniform float uTime; uniform vec2 uWind;` declared by the includer):
//   float thGust(vec2 xz)          0..1 gust intensity at a world position
//   vec2  thWindAt(vec2 xz)        local wind vector (same units as uWind) = uWind · (0.45 + 1.1·gust)
// JS (identical math, for CPU-side consumers such as smoke, flags, kites, boats):
//   gustAt(x, z, t, wind)          / windAt(x, z, t, wind, out)
// `t` is simulation seconds (globalUniforms.uTime / clock.simTime) so everything freezes when paused.
// Debug: ?wind=<strength> pins the strength, ?winddir=<deg> pins the direction (0 = towards +X).

import * as THREE from 'three';
import type { WorldClock } from './time';

/** front speed (m/s) per unit of wind strength, plus a floor so calm air still shows slow swells */
const FRONT_SPEED = 7.5;
const FRONT_MIN = 1.6;

export const WIND_GLSL = /* glsl */ `
float thGust( vec2 xz ) {
  float wl = length( uWind );
  vec2 wd = wl > 1e-4 ? uWind / wl : vec2( 1.0, 0.0 );
  vec2 pd = vec2( -wd.y, wd.x );
  float a = dot( xz, wd ) - uTime * ( ${FRONT_MIN.toFixed(2)} + ${FRONT_SPEED.toFixed(2)} * wl );
  float c = dot( xz, pd );
  float f1 = sin( a * 0.071 + sin( c * 0.023 + 1.7 ) * 1.6 );
  float f2 = sin( a * 0.043 + sin( c * 0.037 + 0.4 ) * 1.2 + 2.1 );
  float g = smoothstep( 0.15, 1.0, 0.5 + 0.5 * f1 ) * ( 0.55 + 0.45 * ( 0.5 + 0.5 * f2 ) );
  float env = 0.5 + 0.5 * sin( c * 0.0125 + a * 0.004 + 0.9 );
  return clamp( g * ( 0.35 + 0.65 * env ), 0.0, 1.0 );
}
vec2 thWindAt( vec2 xz ) {
  return uWind * ( 0.45 + 1.1 * thGust( xz ) );
}
`;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 0..1 gust intensity at (x, z) for sim time t and prevailing wind `wind` (= uWind value). */
export function gustAt(x: number, z: number, t: number, wind: THREE.Vector2): number {
  const wl = Math.hypot(wind.x, wind.y);
  const wx = wl > 1e-4 ? wind.x / wl : 1;
  const wz = wl > 1e-4 ? wind.y / wl : 0;
  const a = x * wx + z * wz - t * (FRONT_MIN + FRONT_SPEED * wl);
  const c = -x * wz + z * wx;
  const f1 = Math.sin(a * 0.071 + Math.sin(c * 0.023 + 1.7) * 1.6);
  const f2 = Math.sin(a * 0.043 + Math.sin(c * 0.037 + 0.4) * 1.2 + 2.1);
  const g = smoothstep(0.15, 1.0, 0.5 + 0.5 * f1) * (0.55 + 0.45 * (0.5 + 0.5 * f2));
  const env = 0.5 + 0.5 * Math.sin(c * 0.0125 + a * 0.004 + 0.9);
  return Math.min(1, Math.max(0, g * (0.35 + 0.65 * env)));
}

/** Local wind vector at (x, z) (same units as uWind): uWind · (0.45 + 1.1·gust). */
export function windAt(x: number, z: number, t: number, wind: THREE.Vector2, out: THREE.Vector2): THREE.Vector2 {
  const k = 0.45 + 1.1 * gustAt(x, z, t, wind);
  return out.set(wind.x * k, wind.y * k);
}

// ── prevailing wind over the day

/** strength by hour (piecewise smooth): calm night, morning breeze, fresh afternoon, calm evening */
function dayStrength(h: number): number {
  const knots: [number, number][] = [
    [0, 0.28],
    [5, 0.22],
    [8, 0.42],
    [11, 0.62],
    [14.5, 0.86],
    [17, 0.7],
    [19.5, 0.42],
    [22, 0.32],
    [24, 0.28],
  ];
  for (let i = 0; i < knots.length - 1; i++) {
    const [h0, s0] = knots[i];
    const [h1, s1] = knots[i + 1];
    if (h >= h0 && h <= h1) {
      const u = (h - h0) / (h1 - h0);
      return s0 + (s1 - s0) * u * u * (3 - 2 * u);
    }
  }
  return 0.3;
}

const BASE_DIR = Math.atan2(0.35, 0.8); // the city's historic wind (towards ENE)
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const PIN_STRENGTH = params.has('wind') ? Math.max(0, Math.min(1.5, Number(params.get('wind')) || 0)) : null;
const PIN_DIR = params.has('winddir') ? ((Number(params.get('winddir')) || 0) * Math.PI) / 180 : null;

/** Current prevailing wind for a clock (direction × strength); deterministic in (hours, simTime). */
export function prevailingWind(hours: number, simTime: number, out: THREE.Vector2): THREE.Vector2 {
  const t = simTime;
  // minute-scale swells and a slow veer (incommensurate periods → never visibly loops)
  const swell = 0.12 * Math.sin(t * 0.021 + 0.6) + 0.07 * Math.sin(t * 0.0537 + 2.3) + 0.04 * Math.sin(t * 0.131 + 4.1);
  const s = PIN_STRENGTH ?? Math.max(0.08, dayStrength(hours) * (1 + swell));
  const veer = 0.22 * Math.sin(t * 0.0071 + 1.3) + 0.09 * Math.sin(t * 0.0213 + 0.2) + 0.12 * Math.sin((hours / 24) * Math.PI * 2 - 0.8);
  const a = PIN_DIR ?? BASE_DIR + veer;
  return out.set(Math.cos(a) * s, Math.sin(a) * s);
}

/** Called once per frame by main.ts after the clock advanced. */
export function updateWind(clock: WorldClock, uWind: THREE.Vector2): void {
  prevailingWind(clock.hours, clock.simTime, uWind);
}
