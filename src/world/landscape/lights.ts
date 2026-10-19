// Night lights of the countryside: street lamps in the villages and hamlets, a yard lamp at each farm,
// porch lights scattered on the houses. Tiny additive point sprites (≥ ~1.6 px, so a distant village
// twinkles instead of vanishing), dimmed by distance (approximate aerial extinction — additive glows
// must not take the fog colour), on with the city's lights.

import * as THREE from 'three';
import type { LandscapeModel } from './model';
import { hash2i } from './noise';

export interface LandLights {
  points: THREE.Points;
  count: number;
  /** per frame: framebuffer height (px) for the sprite size, visibility with the lights */
  frame(fbHeight: number): void;
}

export function buildLandLights(model: LandscapeModel, lights: { value: number }, beacon: { x: number; y: number; z: number } | null = null): LandLights {
  const pos: number[] = [];
  const col: number[] = [];
  const sz: number[] = [];
  const H = model.height;
  const add = (x: number, z: number, y: number, warm: number, s: number) => {
    pos.push(x, y, z);
    col.push(1, 0.62 + 0.18 * warm, 0.28 + 0.3 * warm);
    sz.push(s);
  };
  for (const site of model.sites) {
    const n = site.kind === 'village' ? 26 : site.kind === 'hamlet' ? 7 : 2;
    for (let i = 0; i < n; i++) {
      const a = hash2i(site.seed, i, 811) * Math.PI * 2;
      const r = site.r * (site.kind === 'farm' ? 0.3 + 0.4 * hash2i(site.seed, i, 812) : 0.15 + 0.85 * Math.sqrt(hash2i(site.seed, i, 812)));
      const x = site.x + Math.cos(a) * r,
        z = site.z + Math.sin(a) * r;
      add(x, z, H(x, z) + 4 + 2 * hash2i(site.seed, i, 813), hash2i(site.seed, i, 814), site.kind === 'farm' ? 1.0 : 1.3);
    }
  }
  // the island lighthouse: a strong white-gold beacon
  if (beacon) {
    pos.push(beacon.x, beacon.y, beacon.z);
    col.push(1, 0.93, 0.75);
    sz.push(6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLights: lights, uVH: { value: 720 } },
    vertexShader: /* glsl */ `
attribute float aSize;
attribute vec3 color;
uniform float uLights;
uniform float uVH;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  // world size ~aSize m, but never smaller than ~1.6 px
  float px = aSize * 2.2 * projectionMatrix[1][1] * 0.5 * uVH / max(d, 1.0);
  gl_PointSize = max(px, 1.6 * uVH / 1025.0);
  // distance dimming (aerial extinction) and the smallest sprites fainter
  float ext = exp(-d * 1.4e-4);
  vA = uLights * ext * min(1.0, px / 1.6 + 0.35);
  vCol = color;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float g = exp(-r2 * 3.5);
  gl_FragColor = vec4(vCol * g * vA * 2.4, 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'land-lights';
  points.frustumCulled = false;
  points.renderOrder = 5;
  const uVH = (mat.uniforms.uVH as { value: number });
  return {
    points,
    count: pos.length / 3,
    frame(fbHeight: number) {
      points.visible = lights.value > 0.01;
      uVH.value = fbHeight;
    },
  };
}
