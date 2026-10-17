// Night glows of the landmarks (lamp halos, floodlight beams, aviation-light halos, underwater
// fountain lights) — all in ONE additive draw call. Intensity follows uLights / uFlood / blink modes.
// Ground light pools are registered as real light sources in the shared lamp light map
// (core/lampLight.ts) instead: each pool is paired with the halo of its lamp; the stadium
// floodlight pools become analytic spot lights on the 'stadium' channel (uFlood), aimed from the
// mast heads at the pitch. ?legacylamps draws the old flat additive pools again.

import * as THREE from 'three';
import { addLampLights, type LampLight } from '../../core/lampLight';

const LEGACY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('legacylamps');

/** stadium floodlight colour (cool LED, night palette) */
const FLOOD_COL = '#dfeaff';

function bluish(c: THREE.Color): boolean {
  return c.b > c.r * 1.25;
}

/** Register the pools as lamp lights; returns the glows that are still drawn. */
function registerPools(points: GlowPoint[]): GlowPoint[] {
  const keep: GlowPoint[] = [];
  const out: LampLight[] = [];
  const c = new THREE.Color();
  const heads = points.filter((p) => p.kind === 'halo' && p.mode !== GLOW_MODE.BLINK && p.mode !== GLOW_MODE.CRANE);
  for (const p of points) {
    if (p.kind !== 'pool') {
      // floodlight lamp-bank halos: a tight bright glare, not a puff of smoke (the bank itself is emissive)
      if (p.mode === GLOW_MODE.FLOOD && p.kind === 'halo') keep.push({ ...p, size: p.size * 0.55, intensity: p.intensity * 0.8 });
      else keep.push(p);
      continue;
    }
    c.set(p.color);
    // underwater fountain lights glow through the water: they stay additive
    if (bluish(c)) {
      keep.push(p);
      continue;
    }
    const flood = p.mode === GLOW_MODE.FLOOD;
    let best: GlowPoint | null = null,
      bd = flood ? 40 : 4;
    for (const h of heads) {
      if (h.y < p.y + 1.2 || (h.mode === GLOW_MODE.FLOOD) !== flood) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    const color = flood ? FLOOD_COL : '#' + c.getHexString();
    if (flood && best) {
      // floodlight: from the lamp bank to the pitch; four masts overlap into a crisp bright island
      // cross-aimed past the pitch centre (each mast lights the far half, as real stadium rigs do)
      const ax = best.x + (p.x - best.x) * 1.7,
        az = best.z + (p.z - best.z) * 1.7;
      out.push({ x: best.x, y: best.y - 0.4, z: best.z, pole: best.y, radius: p.size * 1.9, color, intensity: 0.9, kind: 'flood', aim: [ax, p.y, az], cone: 0.46, channel: 'stadium' });
      continue;
    }
    const intensity = (p.intensity / 0.22) * 0.95;
    if (best) {
      const pole = best.y - p.y;
      const l: LampLight = { x: best.x, y: best.y, z: best.z, pole, radius: p.size * 1.1, color, intensity, kind: pole > 4.5 ? 'flood' : 'path' };
      if (bd > 0.3) {
        l.aim = [p.x, p.y, p.z];
        l.cone = Math.atan2(p.size * 1.1, Math.hypot(bd, pole)) + 0.25;
      }
      out.push(l);
    } else {
      // entrance / arcade / kiosk spill: a low soft source above the pool
      out.push({ x: p.x, y: p.y + 2.8, z: p.z, pole: 2.8, radius: p.size * 1.1, color, intensity: intensity * 0.75, kind: 'spill' });
    }
  }
  addLampLights(out);
  return keep;
}

export const GLOW_MODE = { NIGHT: 0, BLINK: 1, FLOOD: 2, CRANE: 3, ALWAYS: 4 } as const;

export interface GlowPoint {
  x: number;
  y: number;
  z: number;
  /** half size (m); for beams: start half-width */
  size: number;
  kind: 'halo' | 'pool' | 'beam';
  color: THREE.ColorRepresentation;
  intensity: number;
  mode?: number;
  /** blink phase (BLINK) */
  phase?: number;
  /** fraction kept by day (NIGHT) */
  day?: number;
  /** beam direction * length */
  dir?: [number, number, number];
  /** beam end half-width */
  endSize?: number;
  /** crane pivot (CRANE mode) */
  pivot?: [number, number, number];
}

export function buildGlows(allPoints: GlowPoint[], material: THREE.ShaderMaterial): THREE.Mesh | null {
  const points = LEGACY ? allPoints : registerPools(allPoints);
  const n = points.length;
  if (n === 0) return null;
  const center = new Float32Array(n * 12);
  const corner = new Float32Array(n * 8);
  const info = new Float32Array(n * 16);
  const extra = new Float32Array(n * 16);
  const tint = new Float32Array(n * 12);
  const idx: number[] = [];
  const c = new THREE.Color();
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  points.forEach((p, i) => {
    c.set(p.color);
    const kind = p.kind === 'pool' ? 1 : p.kind === 'beam' ? 2 : 0;
    const mode = p.mode ?? 0;
    let ex: [number, number, number, number] = [p.phase ?? 0, 0, 0, p.day ?? 0];
    if (kind === 2) ex = [p.dir![0], p.dir![1], p.dir![2], p.endSize ?? p.size * 4];
    else if (mode === GLOW_MODE.CRANE && p.pivot) ex = [p.pivot[0], p.pivot[1], p.pivot[2], 0];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      center.set([p.x, p.y, p.z], v * 3);
      corner.set(corners[k], v * 2);
      info.set([p.size, kind, p.intensity, mode], v * 4);
      extra.set(ex, v * 4);
      tint.set([c.r, c.g, c.b], v * 3);
    }
    const b = i * 4;
    if (kind === 1) idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    else idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(center.slice(), 3));
  geo.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.setAttribute('aExtra', new THREE.BufferAttribute(extra, 4));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'landmarks-glows';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
