// Night glows of the landmarks (lamp halos, light pools, floodlight beams, aviation-light
// halos) — all in ONE additive draw call. Intensity follows uLights / uFlood / blink modes.

import * as THREE from 'three';

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

export function buildGlows(points: GlowPoint[], material: THREE.ShaderMaterial): THREE.Mesh | null {
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
