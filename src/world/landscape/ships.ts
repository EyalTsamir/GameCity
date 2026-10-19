// Distant shipping on the open sea (decoration far beyond the harbour's own boats): cargo ships and
// a tanker in the shipping lane, a ferry, fishing boats and sailing yachts closer in. Each vessel is
// a small vertex-coloured template; all of them are transformed on the CPU into one dynamic mesh
// every frame (≈ 3 k vertices → one draw call, no per-frame allocation). Gentle pitch / roll, white
// bow waves, navigation and deck lights at night.

import * as THREE from 'three';
import type { LandscapeModel } from './model';
import { WL } from './model';
import { hash2i } from './noise';

interface Template {
  pos: number[];
  col: number[];
  /** 1 = lit at night (portholes, mast lights) */
  emi: number[];
  len: number;
}

function box(t: Template, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: [number, number, number], e = 0, taperTop = 0): void {
  // axis-aligned box (ship frame: x = length (bow +x), y up, z = beam); 5 faces (no bottom)
  const P = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
    [x0 + taperTop, y1, z0],
    [x1 - taperTop, y1, z0],
    [x1 - taperTop, y1, z1],
    [x0 + taperTop, y1, z1],
  ];
  const F = [
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [3, 0, 4, 7],
  ];
  for (const f of F) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const p = P[f[k]];
      t.pos.push(p[0], p[1], p[2]);
      t.col.push(c[0], c[1], c[2]);
      t.emi.push(e);
    }
  }
}

function hull(t: Template, L: number, B: number, D: number, c: [number, number, number], deck: [number, number, number]): void {
  // a pointed bow, square stern: sides + deck as a fan (y 0 = waterline, hull reaches -0.6 below)
  const pts: [number, number][] = [
    [-L / 2, -B / 2],
    [L / 2 - B * 1.2, -B / 2],
    [L / 2, 0],
    [L / 2 - B * 1.2, B / 2],
    [-L / 2, B / 2],
  ];
  const yb = -0.8,
    yt = D;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    for (const p of [
      [a[0], yb, a[1]],
      [b[0], yb, b[1]],
      [b[0], yt, b[1]],
      [a[0], yb, a[1]],
      [b[0], yt, b[1]],
      [a[0], yt, a[1]],
    ]) {
      t.pos.push(p[0], p[1], p[2]);
      // boot-topping: dark red below ~0.6 m
      const low = p[1] < 0.6;
      const cc = low ? [0.25, 0.06, 0.05] : c;
      t.col.push(cc[0], cc[1], cc[2]);
      t.emi.push(0);
    }
  }
  // deck (fan from the centre)
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    for (const p of [
      [0, yt, 0],
      [b[0], yt, b[1]],
      [a[0], yt, a[1]],
    ]) {
      t.pos.push(p[0], p[1], p[2]);
      t.col.push(deck[0], deck[1], deck[2]);
      t.emi.push(0);
    }
  }
}

function sail(t: Template, x: number, h: number, foot: number, c: [number, number, number]): void {
  // a triangular sail in the x-y plane (two-sided: both windings)
  const a = [x, 1.2, 0],
    b = [x - foot, 1.2, 0],
    top = [x, h, 0];
  for (const tri of [
    [a, b, top],
    [a, top, b],
  ]) {
    for (const p of tri) {
      t.pos.push(p[0], p[1], p[2]);
      t.col.push(c[0], c[1], c[2]);
      t.emi.push(0);
    }
  }
}

function wake(t: Template, L: number, B: number): void {
  // flat bow wave / wake streaks at the waterline (pale foam)
  const y = 0.05;
  const f: [number, number, number] = [0.85, 0.88, 0.9];
  for (const s of [-1, 1]) {
    for (const p of [
      [L / 2, y, 0],
      [-L * 0.9, y, s * B * 1.6],
      [-L * 0.9, y, s * B * 1.1],
    ]) {
      t.pos.push(p[0], p[1], p[2]);
      t.col.push(f[0], f[1], f[2]);
      t.emi.push(0);
    }
  }
}

function makeTemplates(): Template[] {
  const T: Template[] = [];
  // 0 container ship (150 m)
  {
    const t: Template = { pos: [], col: [], emi: [], len: 150 };
    hull(t, 150, 24, 11, [0.12, 0.16, 0.22], [0.35, 0.33, 0.3]);
    const cols: [number, number, number][] = [
      [0.55, 0.12, 0.08],
      [0.12, 0.25, 0.5],
      [0.6, 0.45, 0.12],
      [0.2, 0.45, 0.25],
      [0.5, 0.5, 0.52],
    ];
    for (let i = 0; i < 9; i++) {
      const x0 = -50 + i * 12.5;
      box(t, x0, 11, -10, x0 + 11.5, 11 + 2.6 * (3 + (i % 3)), 10, cols[i % cols.length]);
    }
    box(t, -72, 11, -10, -58, 33, 10, [0.92, 0.92, 0.9], 1);
    box(t, -70, 33, -3, -66, 38, 3, [0.2, 0.2, 0.22], 1);
    wake(t, 150, 12);
    T.push(t);
  }
  // 1 tanker (180 m, low, red deck)
  {
    const t: Template = { pos: [], col: [], emi: [], len: 180 };
    hull(t, 180, 30, 9, [0.1, 0.11, 0.12], [0.45, 0.2, 0.15]);
    box(t, -88, 9, -12, -72, 27, 12, [0.9, 0.9, 0.88], 1);
    box(t, -84, 27, -2, -80, 33, 2, [0.6, 0.15, 0.1], 1);
    wake(t, 180, 15);
    T.push(t);
  }
  // 2 ferry (110 m, white, tall)
  {
    const t: Template = { pos: [], col: [], emi: [], len: 110 };
    hull(t, 110, 20, 6, [0.9, 0.9, 0.9], [0.8, 0.8, 0.8]);
    box(t, -45, 6, -9, 35, 13, 9, [0.95, 0.95, 0.95], 1, 2);
    box(t, -35, 13, -8, 20, 19, 8, [0.93, 0.94, 0.95], 1, 2);
    box(t, -10, 19, -2.5, -2, 26, 2.5, [0.15, 0.3, 0.6], 0);
    wake(t, 110, 10);
    T.push(t);
  }
  // 3 fishing boat (22 m)
  {
    const t: Template = { pos: [], col: [], emi: [], len: 22 };
    hull(t, 22, 6, 2.2, [0.25, 0.4, 0.55], [0.6, 0.55, 0.45]);
    box(t, 0, 2.2, -2, 6, 5.2, 2, [0.9, 0.9, 0.85], 1);
    box(t, -6, 2.2, -0.15, -5.7, 10, 0.15, [0.3, 0.3, 0.3]);
    wake(t, 22, 3);
    T.push(t);
  }
  // 4 sailing yacht (12 m)
  {
    const t: Template = { pos: [], col: [], emi: [], len: 12 };
    hull(t, 12, 3.6, 1.2, [0.95, 0.95, 0.95], [0.7, 0.6, 0.45]);
    box(t, 1.5, 1.2, -0.08, 1.7, 15, 0.08, [0.85, 0.85, 0.85], 1);
    sail(t, 1.5, 14.5, 6.5, [0.97, 0.96, 0.92]);
    sail(t, 6.2, 11, 4, [0.95, 0.94, 0.9]);
    T.push(t);
  }
  return T;
}

interface Vessel {
  type: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
  /** course bounds: the vessel turns back at these z (lane runs N-S) */
  z0: number;
  z1: number;
}

export interface Ships {
  mesh: THREE.Mesh;
  update(t: number, dt: number): void;
  count: number;
}

export function createShips(model: LandscapeModel, fog: boolean, lights: { value: number }): Ships {
  const T = makeTemplates();
  const vessels: Vessel[] = [];
  const add = (type: number, x: number, z: number, heading: number, speed: number, z0: number, z1: number) => vessels.push({ type, x, z, heading, speed, phase: hash2i(vessels.length, type, 5) * 6.28, z0, z1 });
  // shipping lane far out (N-S), both directions
  add(0, 7800, -5200, 0, 7.5, -12000, 12000);
  add(1, 9400, 3600, Math.PI, 6.2, -12000, 12000);
  add(0, 11800, 800, Math.PI, 8, -14000, 14000);
  add(2, 4600, -2600, 0.08, 9, -9000, 9000);
  // fishing boats and yachts closer in (avoid the island)
  add(3, 2600, 1500, 1.2, 3.2, -4000, 4000);
  add(3, 1700, -2300, -0.6, 2.6, -4000, 4000);
  add(4, 1250, 450, 0.4, 3.0, -1800, 2400);
  add(4, 1500, 1300, -2.6, 2.4, -1800, 2600);
  add(4, 3300, -300, 2.2, 3.4, -3000, 3000);
  add(4, 950, -950, 0.9, 2.2, -1600, 1200);
  // keep them at sea
  for (const v of vessels) {
    for (let i = 0; i < 30 && model.coastSD(v.x, v.z) > -260; i++) v.x += 150;
  }
  let nv = 0;
  for (const v of vessels) nv += T[v.type].pos.length / 3;
  const pos = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const emi = new Float32Array(nv);
  let o = 0;
  for (const v of vessels) {
    const t = T[v.type];
    col.set(t.col, o * 3);
    emi.set(t.emi, o);
    o += t.pos.length / 3;
  }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3);
  pa.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aEmi', new THREE.BufferAttribute(emi, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(6000, 0, 0), 20000);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, fog, flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = lights;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aEmi;\nvarying float vEmi;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmi = aEmi;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying float vEmi;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * vEmi * uLights * 0.9;');
  };
  mat.customProgramCacheKey = () => 'th-landships-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'land-ships';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;

  const update = (time: number, dt: number) => {
    let o2 = 0;
    for (const v of vessels) {
      // sail along the course, turn round at the ends (or when the coast comes near)
      v.x += Math.sin(v.heading) * v.speed * dt;
      v.z -= Math.cos(v.heading) * v.speed * dt;
      if ((v.z < v.z0 && Math.cos(v.heading) > 0) || (v.z > v.z1 && Math.cos(v.heading) < 0)) v.heading += Math.PI;
      const t = T[v.type];
      const ch = Math.cos(v.heading),
        sh = Math.sin(v.heading);
      const pitch = Math.sin(time * 0.7 + v.phase) * (v.type >= 3 ? 0.03 : 0.006);
      const roll = Math.sin(time * 0.53 + v.phase * 1.7) * (v.type >= 3 ? 0.06 : 0.01);
      const heel = v.type === 4 ? 0.12 : 0;
      const src = t.pos;
      for (let i = 0; i < src.length; i += 3) {
        const lx = src[i],
          ly = src[i + 1],
          lz = src[i + 2];
        // pitch (about z) and roll / heel (about x) in the ship frame
        const y1 = ly + lx * pitch + lz * (roll + heel);
        const z1 = lz - ly * (roll + heel);
        // ship frame (bow +x) → world: heading 0 = sailing north (−z)
        const wx = v.x + sh * lx + ch * z1;
        const wz = v.z - ch * lx + sh * z1;
        pos[o2 * 3] = wx;
        pos[o2 * 3 + 1] = WL + y1;
        pos[o2 * 3 + 2] = wz;
        o2++;
      }
    }
    pa.needsUpdate = true;
  };
  update(0, 0);
  return { mesh, update, count: vessels.length };
}
