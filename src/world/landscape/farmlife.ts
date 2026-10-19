// Life on the farmland: grazing herds (cattle, sheep) in the pasture fields and a tractor working a
// field near the town, raising a dust trail (ambient smoke service, when present). Herds are one
// instanced mesh (grazing head-bob in the vertex shader, no CPU per frame); the tractor is one small
// instanced mesh whose single matrix is updated per frame.

import * as THREE from 'three';
import type { LandscapeModel } from './model';
import { WL, CX, CZ } from './model';
import { FROW, toField, fromField, rowB, colB, colOff, colW, lhash, fieldsOfParcel, grazeCrop, type Field } from './fields';
import { hash2i } from './noise';
import { SLAB } from '../../core/constants';

/** unit cow (faces +z, length ~2.2 m): body, head, four legs; aPart 0 body, 1 head, 2 legs */
function animalGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, number][] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, part: number) => {
    const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
    g.translate(x, y, z);
    parts.push([g, part]);
  };
  box(0.72, 0.68, 1.55, 0, 1.0, 0, 0);
  box(0.36, 0.38, 0.55, 0, 1.12, 1.02, 1);
  for (const [lx, lz] of [
    [-0.24, 0.6],
    [0.24, 0.6],
    [-0.24, -0.6],
    [0.24, -0.6],
  ])
    box(0.15, 0.7, 0.15, lx, 0.35, lz, 2);
  const pos: number[] = [],
    nrm: number[] = [],
    part: number[] = [];
  for (const [g, p] of parts) {
    const a = g.getAttribute('position'),
      n = g.getAttribute('normal');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      part.push(p);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return g;
}

function tractorGeometry(): THREE.BufferGeometry {
  const pos: number[] = [],
    col: number[] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, c: [number, number, number]) => {
    const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
    g.translate(x, y, z);
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(c[0], c[1], c[2]);
    }
  };
  const red: [number, number, number] = [0.45, 0.06, 0.04];
  const dark: [number, number, number] = [0.03, 0.03, 0.03];
  box(1.1, 1.0, 2.4, 0, 1.15, 0.6, red); // bonnet / engine
  box(1.5, 1.5, 1.3, 0, 2.0, -0.6, [0.12, 0.14, 0.15]); // cab (glass)
  box(1.6, 0.12, 1.4, 0, 2.8, -0.6, red); // roof
  box(0.5, 1.6, 1.6, -1.05, 0.8, -0.8, dark); // rear wheels
  box(0.5, 1.6, 1.6, 1.05, 0.8, -0.8, dark);
  box(0.35, 0.95, 0.95, -0.75, 0.48, 1.3, dark); // front wheels
  box(0.35, 0.95, 0.95, 0.75, 0.48, 1.3, dark);
  box(2.8, 0.5, 2.6, 0, 0.6, -3.2, [0.35, 0.33, 0.3]); // cultivator / trailer
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export interface FarmLife {
  group: THREE.Group;
  animals: number;
  update(dt: number): void;
  /** attach the tractor's dust trail to the ambient smoke service (after all modules exist) */
  attachSmoke(smoke: { addEmitter(o: { getPosition(out: THREE.Vector3): void | boolean; rate?: number; size?: number; color?: THREE.ColorRepresentation; life?: number; rise?: number; opacity?: number }): unknown } | undefined): void;
}

export function createFarmLife(model: LandscapeModel, uniforms: Record<string, THREE.IUniform>, fog: boolean, density: number): FarmLife {
  const group = new THREE.Group();
  group.name = 'land-farmlife';
  const H = model.height;
  const slabD = model.slabDist;
  // ── herds in pasture fields
  const R = 1400;
  const inst: number[] = []; // x, y, z, yaw, species(0 cow / 1 sheep), tint, phase
  const q = { x: 0, y: 0 };
  const w = { x: 0, z: 0 };
  let qx0 = Infinity,
    qx1 = -Infinity,
    qy0 = Infinity,
    qy1 = -Infinity;
  for (const [cx, cz] of [
    [SLAB.x0 - R, SLAB.z0 - R],
    [SLAB.x1 + R, SLAB.z0 - R],
    [SLAB.x0 - R, SLAB.z1 + R],
    [SLAB.x1 + R, SLAB.z1 + R],
  ]) {
    toField(cx, cz, q);
    qx0 = Math.min(qx0, q.x);
    qx1 = Math.max(qx1, q.x);
    qy0 = Math.min(qy0, q.y);
    qy1 = Math.max(qy1, q.y);
  }
  const fieldOK = (x: number, z: number) => {
    if (slabD(x, z) < 12) return false;
    const y = H(x, z);
    if (y < WL + 0.6 || y > 120) return false;
    if (model.forestAt(x, z, y) > 0.3 || model.siteAt(x, z, 5) >= 0 || model.coastSD(x, z) < 60) return false;
    return true;
  };
  let tractorField: Field | null = null;
  let bestT = Infinity;
  const k0 = Math.floor(qy0 / FROW) - 1,
    k1 = Math.ceil(qy1 / FROW) + 1;
  const maxN = Math.round(1100 * Math.max(0.4, density));
  for (let k = k0; k <= k1 && inst.length / 7 < maxN; k++) {
    const y0 = rowB(k),
      y1 = rowB(k + 1);
    const cw = colW(k),
      off = colOff(k);
    const j0 = Math.floor((qx0 - off) / cw) - 1,
      j1 = Math.ceil((qx1 - off) / cw) + 1;
    for (let j = j0; j <= j1; j++) {
      const cx = (colB(k, j) + colB(k, j + 1)) / 2 + off,
        cy = (y0 + y1) / 2;
      fromField(cx, cy, w);
      const dc = Math.hypot(w.x - CX, w.z - CZ);
      if (dc > R + 300) continue;
      for (const F of fieldsOfParcel(cx, cy)) {
        const fx = (F.x0 + F.x1) / 2,
          fy = (F.y0 + F.y1) / 2;
        fromField(fx, fy, w);
        if (!fieldOK(w.x, w.z)) continue;
        F.crop = grazeCrop(F.crop, model.grazing(w.x, w.z));
        const sd = slabD(w.x, w.z);
        // the tractor works a stubble / ploughed field in view of the town (W or S)
        if ((F.crop >= 0.22 && F.crop < 0.33) || (F.crop >= 0.76 && F.crop < 0.83)) {
          const score = Math.abs(sd - 330) + (w.x > SLAB.x1 ? 1e4 : 0);
          if (score < bestT && (F.x1 - F.x0) > 60 && (F.y1 - F.y0) > 40) {
            bestT = score;
            tractorField = { ...F };
          }
        }
        if (!(F.crop >= 0.48 && F.crop < 0.66) || lhash(F.pid, 71) > 0.6) continue;
        const sheep = lhash(F.pid, 72) < 0.35;
        const n = sheep ? 14 + Math.floor(22 * lhash(F.pid, 73)) : 6 + Math.floor(12 * lhash(F.pid, 74));
        const hx = F.x0 + (F.x1 - F.x0) * (0.25 + 0.5 * lhash(F.pid, 75)),
          hy = F.y0 + (F.y1 - F.y0) * (0.25 + 0.5 * lhash(F.pid, 76));
        const spread = sheep ? 9 : 14;
        const tintBase = lhash(F.pid, 77);
        for (let a = 0; a < n; a++) {
          const r1 = hash2i(F.pid, a, 78),
            r2 = hash2i(F.pid, a, 79);
          const rad = spread * Math.sqrt(-2 * Math.log(Math.max(1e-4, r1)));
          let ax = hx + Math.cos(r2 * 6.283) * rad,
            ay = hy + Math.sin(r2 * 6.283) * rad;
          ax = Math.min(F.x1 - 3, Math.max(F.x0 + 3, ax));
          ay = Math.min(F.y1 - 3, Math.max(F.y0 + 3, ay));
          fromField(ax, ay, w);
          if (!fieldOK(w.x, w.z)) continue;
          // most of a herd faces the same way (grazing into the wind), a few stray
          const yaw = (hash2i(F.pid, 1, 80) * 6.283 + (hash2i(F.pid, a, 81) - 0.5) * (hash2i(F.pid, a, 82) < 0.7 ? 0.9 : 6.28));
          const tint = sheep ? hash2i(F.pid, a, 83) : (tintBase + 0.35 * hash2i(F.pid, a, 83)) % 1;
          inst.push(w.x, H(w.x, w.z), w.z, yaw, sheep ? 1 : 0, tint, hash2i(F.pid, a, 84));
        }
      }
    }
  }
  const nA = inst.length / 7;
  const geo = animalGeometry();
  const iA = new Float32Array(nA * 4),
    iB = new Float32Array(nA * 4);
  for (let i = 0; i < nA; i++) {
    iA.set([inst[i * 7], inst[i * 7 + 1], inst[i * 7 + 2], inst[i * 7 + 3]], i * 4);
    iB.set([inst[i * 7 + 4], inst[i * 7 + 5], inst[i * 7 + 6], 0], i * 4);
  }
  const ig = new THREE.InstancedBufferGeometry();
  ig.setAttribute('position', geo.getAttribute('position'));
  ig.setAttribute('normal', geo.getAttribute('normal'));
  ig.setAttribute('aPart', geo.getAttribute('aPart'));
  ig.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
  ig.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4));
  ig.instanceCount = nA;
  ig.boundingSphere = new THREE.Sphere(new THREE.Vector3(CX, 0, CZ), R + 600);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, fog });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 iA;
attribute vec4 iB;
attribute float aPart;
uniform float uTime;
varying vec3 vAc;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = position;
{
  bool sheep = iB.x > 0.5;
  vec3 sc = sheep ? vec3(0.62, 0.62, 0.62) : vec3(1.0);
  if (sheep && aPart < 0.5) sc = vec3(0.85, 0.72, 0.62);   // a woolly barrel
  vec3 p = position * sc;
  // grazing: the head goes down to the grass most of the time, comes up now and then
  float t = uTime * 0.35 + iB.z * 37.0;
  float down = smoothstep(-0.3, 0.3, sin(t) + 0.4 * sin(t * 2.7 + 1.0));
  if (aPart > 0.5 && aPart < 1.5) { p.y -= 0.55 * down * sc.y; p.z += 0.12 * down; }
  float c = cos(iA.w), s = sin(iA.w);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  transformed = p + iA.xyz;
  vec3 cow = iB.y < 0.3 ? vec3(0.13, 0.08, 0.05) : iB.y < 0.55 ? vec3(0.02, 0.02, 0.02) : iB.y < 0.8 ? vec3(0.55, 0.52, 0.47) : vec3(0.22, 0.09, 0.04);
  vec3 wool = vec3(0.6, 0.57, 0.5) * (0.85 + 0.2 * iB.y);
  vAc = sheep ? (aPart < 0.5 ? wool : vec3(0.05, 0.045, 0.04)) : (aPart > 1.5 ? cow * 0.7 : cow);
}`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ float c = cos(iA.w), s = sin(iA.w); objectNormal = vec3(c * objectNormal.x + s * objectNormal.z, objectNormal.y, -s * objectNormal.x + c * objectNormal.z); }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAc;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vAc, opacity );');
  };
  mat.customProgramCacheKey = () => 'th-landherd-v1';
  const herd = new THREE.Mesh(ig, mat);
  herd.name = 'land-herds';
  herd.frustumCulled = false;
  herd.castShadow = true;
  herd.receiveShadow = true;
  // three's default depth material ignores the custom vertex code: give the shadow pass the same placement
  herd.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  herd.customDepthMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 iA;\nattribute vec4 iB;')
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = position * (iB.x > 0.5 ? 0.62 : 1.0);
{ float c = cos(iA.w), s = sin(iA.w); transformed = vec3(c * transformed.x + s * transformed.z, transformed.y, -s * transformed.x + c * transformed.z) + iA.xyz; }`,
      );
  };
  group.add(herd);

  // ── the tractor
  let update = (_dt: number) => {};
  let tractorPos: THREE.Vector3 | null = null;
  let working = false;
  if (tractorField) {
    const F = tractorField;
    const tg = tractorGeometry();
    const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, fog });
    const tractor = new THREE.Mesh(tg, tm);
    tractor.name = 'land-tractor';
    tractor.castShadow = true;
    tractor.receiveShadow = true;
    group.add(tractor);
    const longX = F.x1 - F.x0 >= F.y1 - F.y0;
    const len = longX ? F.x1 - F.x0 - 16 : F.y1 - F.y0 - 16;
    const across = longX ? F.y1 - F.y0 - 16 : F.x1 - F.x0 - 16;
    const passW = 6;
    const passes = Math.max(2, Math.floor(across / passW));
    let s = 0; // distance along the whole serpentine
    const speed = 2.6;
    tractorPos = new THREE.Vector3();
    const P = { x: 0, z: 0 };
    update = (dt) => {
      s += dt * speed;
      const turnLen = (Math.PI * passW) / 2;
      const cycle = len + turnLen;
      const total = cycle * passes;
      let u = s % (total * 2);
      if (u > total) u = total * 2 - u; // back over the field again
      const pass = Math.min(passes - 1, Math.floor(u / cycle));
      const r = u - pass * cycle;
      const dir = pass % 2 === 0 ? 1 : -1;
      let a: number, b: number, heading: number;
      const baseA = longX ? F.x0 + 8 : F.y0 + 8;
      const baseB = (longX ? F.y0 : F.x0) + 8 + pass * passW;
      if (r < len) {
        a = dir > 0 ? baseA + r : baseA + len - r;
        b = baseB;
        heading = dir > 0 ? 0 : Math.PI;
        working = true;
      } else {
        // headland turn: a half circle to the next pass
        const t = (r - len) / turnLen;
        const ang = t * Math.PI;
        a = (dir > 0 ? baseA + len : baseA) + (dir > 0 ? 1 : -1) * Math.sin(ang) * passW * 0.5;
        b = baseB + (1 - Math.cos(ang)) * passW * 0.5;
        heading = dir > 0 ? ang : Math.PI - ang;
        working = false;
      }
      const fx = longX ? a : b,
        fy = longX ? b : a;
      fromField(fx, fy, P);
      const y = H(P.x, P.z);
      tractor.position.set(P.x, y, P.z);
      // field-frame heading → world yaw (model faces +z; field x axis = world (cos r, sin r))
      const hx = longX ? Math.cos(heading) : Math.sin(heading),
        hy = longX ? Math.sin(heading) : Math.cos(heading);
      const dx = hx * 0.990268 - hy * 0.139173,
        dz = hx * 0.139173 + hy * 0.990268;
      tractor.rotation.y = Math.atan2(dx, dz);
      tractorPos!.set(P.x - dx * 3.5, y + 0.6, P.z - dz * 3.5);
    };
    update(0);
  }
  return {
    group,
    animals: nA,
    update,
    attachSmoke(smoke) {
      if (!smoke || !tractorPos) return;
      const tp = tractorPos;
      smoke.addEmitter({
        getPosition: (out) => {
          if (!working) return false;
          out.copy(tp);
        },
        rate: 3,
        size: 1.3,
        color: '#b9a888',
        life: 6,
        rise: 0.5,
        opacity: 0.45,
      });
    },
  };
}
