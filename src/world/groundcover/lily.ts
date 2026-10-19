// Lily pads (with a few water lilies) floating in clusters on the park pond's calm, shallow water.
// One merged static mesh (one draw call), bobbing gently in the vertex shader (uTime); the pads stay
// clear of the reed stands' deep core and of the island.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { getTerrainModel } from '../terrain/height';
import { LAMP_APPLY_VIEW, LAMP_GLSL, lampUniforms } from '../../core/lampLight';

export interface Lilies {
  mesh: THREE.Mesh | null;
  pads: number;
  flowers: number;
}

export function createLilies(ctx: CityContext): Lilies {
  const model = getTerrainModel(ctx.plan);
  const pond = model.pond;
  if (!pond) return { mesh: null, pads: 0, flowers: 0 };
  const rng = ctx.rng('groundcover-lilies');
  const level = pond.level;
  const isl = model.island;
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const bob: number[] = [];
  const padCols = ['#46702f', '#557d33', '#3d6430', '#6a8a3a', '#5b7a2e'].map((h) => new THREE.Color(h));
  const rimRed = new THREE.Color('#7a4636');
  const tmp = new THREE.Color();
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, cx: number, cz: number, ph: number) => {
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    col.push(c.r, c.g, c.b);
    bob.push(cx, cz, ph);
  };
  const okAt = (x: number, z: number): boolean => {
    const ex = (x - pond.cx) / pond.rx,
      ez = (z - pond.cz) / pond.rz;
    if (ex * ex + ez * ez > 0.8) return false;
    const depth = level - model.height(x, z);
    if (depth < 0.18 || depth > 1.4) return false;
    if (isl && Math.hypot(x - isl.x, z - isl.z) < isl.r + 1.2) return false;
    return true;
  };
  const placed: { x: number; z: number; r: number }[] = [];
  let pads = 0,
    flowers = 0;
  const addPad = (x: number, z: number, r: number) => {
    const yaw = rng.range(0, Math.PI * 2);
    const notch = rng.range(0.16, 0.3);
    const N = 12;
    const ph = rng.range(0, Math.PI * 2);
    const base = padCols[rng.int(0, padCols.length - 1)];
    const red = rng.next() < 0.25;
    const y0 = level + 0.012;
    tmp.copy(base).multiplyScalar(rng.range(0.85, 1.12));
    const centre = tmp.clone();
    const rimC = red ? centre.clone().lerp(rimRed, 0.45) : centre.clone().multiplyScalar(1.08);
    for (let k = 0; k < N; k++) {
      const a0 = yaw + notch + (k / N) * (Math.PI * 2 - 2 * notch);
      const a1 = yaw + notch + ((k + 1) / N) * (Math.PI * 2 - 2 * notch);
      const lift = 0.012;
      vert(x, y0, z, 0, 1, 0, centre, x, z, ph);
      vert(x + Math.cos(a1) * r, y0 + lift, z + Math.sin(a1) * r, -Math.cos(a1) * 0.15, 1, -Math.sin(a1) * 0.15, rimC, x, z, ph);
      vert(x + Math.cos(a0) * r, y0 + lift, z + Math.sin(a0) * r, -Math.cos(a0) * 0.15, 1, -Math.sin(a0) * 0.15, rimC, x, z, ph);
    }
    pads++;
    if (rng.next() < 0.16) {
      // water lily: a small star cup of petals, white or pink, yellow heart
      const pink = rng.next() < 0.35;
      const pc = new THREE.Color(pink ? '#e9a8bf' : '#f3f0e6');
      const hc = new THREE.Color('#e7c13b');
      const fr = r * rng.range(0.32, 0.45);
      const fx = x + Math.cos(yaw + Math.PI) * r * 0.25,
        fz = z + Math.sin(yaw + Math.PI) * r * 0.25;
      const P = 8;
      for (let k = 0; k < P; k++) {
        const a0 = (k / P) * Math.PI * 2,
          a1 = ((k + 0.5) / P) * Math.PI * 2,
          a2 = ((k + 1) / P) * Math.PI * 2;
        const hy = y0 + 0.035;
        vert(fx, y0 + 0.02, fz, 0, 1, 0, hc, x, z, ph);
        vert(fx + Math.cos(a1) * fr, hy + 0.02, fz + Math.sin(a1) * fr, Math.cos(a1) * 0.4, 1, Math.sin(a1) * 0.4, pc, x, z, ph);
        vert(fx + Math.cos(a0) * fr * 0.55, y0 + 0.03, fz + Math.sin(a0) * fr * 0.55, 0, 1, 0, pc, x, z, ph);
        vert(fx, y0 + 0.02, fz, 0, 1, 0, hc, x, z, ph);
        vert(fx + Math.cos(a2) * fr * 0.55, y0 + 0.03, fz + Math.sin(a2) * fr * 0.55, 0, 1, 0, pc, x, z, ph);
        vert(fx + Math.cos(a1) * fr, hy + 0.02, fz + Math.sin(a1) * fr, Math.cos(a1) * 0.4, 1, Math.sin(a1) * 0.4, pc, x, z, ph);
      }
      flowers++;
    }
  };
  // clusters along the calmer edges of the pond
  const nClusters = 4;
  for (let c = 0; c < nClusters; c++) {
    let cx = 0,
      cz = 0,
      found = false;
    for (let t = 0; t < 60 && !found; t++) {
      const a = rng.range(0, Math.PI * 2),
        rr = rng.range(0.45, 0.78);
      cx = pond.cx + Math.cos(a) * pond.rx * rr;
      cz = pond.cz + Math.sin(a) * pond.rz * rr;
      found = okAt(cx, cz);
    }
    if (!found) continue;
    const n = rng.int(10, 22);
    for (let k = 0, tries = 0; k < n && tries < n * 12; tries++) {
      const r = rng.range(0.14, 0.32);
      const a = rng.range(0, Math.PI * 2),
        d = Math.sqrt(rng.next()) * 2.6;
      const x = cx + Math.cos(a) * d,
        z = cz + Math.sin(a) * d;
      if (!okAt(x, z)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.92)) continue;
      placed.push({ x, z, r });
      addPad(x, z, r);
      k++;
    }
  }
  if (!pads) return { mesh: null, pads: 0, flowers: 0 };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aBob', new THREE.Float32BufferAttribute(bob, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, side: THREE.DoubleSide });
  const lu = lampUniforms();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lu, { uTime: ctx.uniforms.uTime, uWind: ctx.uniforms.uWind });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBob;\nuniform float uTime;\nuniform vec2 uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  // slow bob + a little drift-sway in the wind (pads are anchored by their stems)
  float t = uTime * 0.7 + aBob.z;
  transformed.y += sin( t ) * 0.006 + sin( t * 1.7 + 1.3 ) * 0.003;
  vec2 d = transformed.xz - aBob.xy;
  float a = sin( t * 0.43 ) * 0.05 * ( 0.4 + length( uWind ) );
  transformed.xz = aBob.xy + vec2( d.x * cos( a ) - d.y * sin( a ), d.x * sin( a ) + d.y * cos( a ) ) + uWind * 0.03 * sin( t * 0.31 );
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LAMP_GLSL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LAMP_APPLY_VIEW);
  };
  mat.customProgramCacheKey = () => 'gc-lily';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'groundcover-lilies';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, pads, flowers };
}
