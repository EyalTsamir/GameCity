// Life on the farmland: grazing herds (cattle, sheep) in the pasture fields and a tractor working a
// field near the town, raising a dust trail (ambient smoke service, when present). Herds are one
// instanced mesh (grazing head-bob in the vertex shader, no CPU per frame); the tractor is one small
// instanced mesh whose single matrix is updated per frame.

import * as THREE from 'three';
import type { LandscapeModel } from './model';
import { WL, CX, CZ } from './model';
import { FROW, toField, fromField, rowB, colB, colOff, colW, lhash, fieldsOfParcel, cropKind, CK, type Field } from './fields';
import { hash2i } from './noise';
import { SLAB } from '../../core/constants';
import type { Fleet, FleetTemplate } from './fleet';
import { createTractor, FRONT_Z, REAR_Z } from './tractor';
import { sheepGeometry, cowGeometry, createNearHerd, POSE_GLSL } from './animals';

/** unit cow (faces +z, length ~2.2 m): body, head, four legs; aPart 0 body, 1 head, 2 legs */
function animalGeometry(): THREE.BufferGeometry {
  // ~54 tris: a lumpy rounded body (icosahedron with smooth normals = soft, woolly / hide shading), a
  // narrow tapered head, four thin legs (open triangular prisms). Unit = a cow; sheep scale in the shader.
  const pos: number[] = [],
    nrm: number[] = [],
    part: number[] = [];
  // body
  {
    const g = new THREE.IcosahedronGeometry(1, 0); // already non-indexed
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i),
        y = a.getY(i),
        z = a.getZ(i);
      // lumps (a function of the vertex direction: shared corners stay welded)
      const k = 1 + 0.1 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3 - z * 2.1);
      pos.push(x * 0.4 * k, 1.0 + y * 0.36 * k, z * 0.8 * k);
      const l = Math.hypot(x / 0.4, y / 0.36, z / 0.8) || 1;
      nrm.push(x / 0.4 / l, y / 0.36 / l, z / 0.8 / l);
      part.push(0);
    }
  }
  // head: a box tapering to the muzzle (no bottom face), at the front of the body
  {
    const g = new THREE.BoxGeometry(0.26, 0.32, 0.5).toNonIndexed();
    const a = g.getAttribute('position'),
      n = g.getAttribute('normal');
    for (let f = 0; f < 6; f++) {
      if (f === 3) continue; // −y
      for (let v = 0; v < 6; v++) {
        const i = f * 6 + v;
        const front = a.getZ(i) > 0;
        const t = front ? 0.62 : 1;
        pos.push(a.getX(i) * t, 1.12 + a.getY(i) * (front ? 0.75 : 1) - (front ? 0.05 : 0), 0.95 + a.getZ(i));
        nrm.push(n.getX(i), n.getY(i), n.getZ(i));
        part.push(1);
      }
    }
  }
  // legs: thin open triangular prisms
  for (const [lx, lz] of [
    [-0.22, 0.55],
    [0.22, 0.55],
    [-0.22, -0.55],
    [0.22, -0.55],
  ]) {
    const r = 0.065;
    for (let s = 0; s < 3; s++) {
      const a0 = (s / 3) * Math.PI * 2,
        a1 = ((s + 1) / 3) * Math.PI * 2;
      const x0 = lx + Math.cos(a0) * r,
        z0 = lz + Math.sin(a0) * r,
        x1 = lx + Math.cos(a1) * r,
        z1 = lz + Math.sin(a1) * r;
      const am = (a0 + a1) / 2;
      const nx = Math.cos(am),
        nz = Math.sin(am);
      // two triangles, wound outward (front faces seen from outside)
      const quad = [
        [x0, 0, z0],
        [x1, 0, z1],
        [x1, 0.78, z1],
        [x0, 0, z0],
        [x1, 0.78, z1],
        [x0, 0.78, z0],
      ];
      // outward winding check: (p1 - p0) × (p2 - p0) · n > 0, else flip
      const e1 = [x1 - x0, 0, z1 - z0],
        e2 = [x1 - x0, 0.78, z1 - z0];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const flip = cr[0] * nx + cr[2] * nz < 0;
      const order = flip ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
      for (const o of order) {
        pos.push(quad[o][0], quad[o][1], quad[o][2]);
        nrm.push(nx, 0, nz);
        part.push(2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return g;
}

function tractorGeometry(): FleetTemplate {
  const pos: number[] = [],
    col: number[] = [],
    emi: number[] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, c: [number, number, number]) => {
    const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
    g.translate(x, y, z);
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(c[0], c[1], c[2]);
      emi.push(0);
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
  return { pos, col, emi };
}

/** wheel tracks: two compacted, darker ruts along every pass of the tractor's serpentine (one strip mesh) */
function wheelTracks(F: Field, longX: boolean, len: number, passes: number, passW: number, H: (x: number, z: number) => number): THREE.Mesh {
  const pos: number[] = [],
    alpha: number[] = [];
  const P = { x: 0, z: 0 };
  const baseA = longX ? F.x0 + 8 : F.y0 + 8;
  for (let pass = 0; pass < passes; pass++) {
    const b = (longX ? F.y0 : F.x0) + 8 + pass * passW;
    for (const off of [-0.92, 0.92])
      for (let a = 0; a < len; a += 2.5) {
        const a1 = Math.min(len, a + 2.5);
        const q: number[][] = [];
        for (const [u, v] of [
          [a, off - 0.26],
          [a1, off - 0.26],
          [a1, off + 0.26],
          [a, off + 0.26],
        ]) {
          const fx = longX ? baseA + u : b + v,
            fy = longX ? b + v : baseA + u;
          fromField(fx, fy, P);
          q.push([P.x, H(P.x, P.z) + 0.035, P.z]);
        }
        // fade in / out at the headlands
        const k0 = Math.min(1, a / 6, (len - a) / 6),
          k1 = Math.min(1, a1 / 6, (len - a1) / 6);
        for (const [i, k] of [
          [0, k0],
          [1, k1],
          [2, k1],
          [0, k0],
          [2, k1],
          [3, k0],
        ]) {
          pos.push(...q[i]);
          alpha.push(Math.max(0, k) * 0.5);
        }
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.95, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAl;\nvarying vec2 vTw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAl = aAlpha; vTw = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAl;\nvarying vec2 vTw;')
      // tread prints across the rut and a broken edge
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float tp = 0.75 + 0.25 * sin( dot( vTw, vec2( 13.0, 9.0 ) ) ) * sin( dot( vTw, vec2( -7.0, 11.0 ) ) );\nvec4 diffuseColor = vec4( diffuse, vAl * tp );');
  };
  m.customProgramCacheKey = () => 'th-wheeltracks-v1';
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'land-wheeltracks';
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  return mesh;
}

export interface FarmLife {
  group: THREE.Group;
  animals: number;
  update(dt: number): void;
  /** attach the tractor's dust trail to the ambient smoke service (after all modules exist) */
  attachSmoke(smoke: { addEmitter(o: { getPosition(out: THREE.Vector3): void | boolean; rate?: number; size?: number; color?: THREE.ColorRepresentation; life?: number; rise?: number; opacity?: number }): unknown } | undefined): void;
}

export function createFarmLife(model: LandscapeModel, uniforms: Record<string, THREE.IUniform>, fog: boolean, density: number, fleet: Fleet): FarmLife {
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
  const rh = { d: 0, i: 0, s: 0, level: 0, tx: 1, tz: 0 };
  const fieldOK = (x: number, z: number) => {
    if (slabD(x, z) < 12) return false;
    if (model.road(x, z, rh, 10) && rh.d < model.roads[rh.i].halfW + 3) return false;
    const y = H(x, z);
    if (y < WL + 0.6 || y > 120) return false;
    if (model.forestAt(x, z, y) > 0.3 || model.siteAt(x, z, 5) >= 0 || model.coastSD(x, z) < 60) return false;
    return true;
  };
  let tractorField: Field | null = null;
  let bestT = Infinity;
  const k0 = Math.floor(qy0 / FROW) - 1,
    k1 = Math.ceil(qy1 / FROW) + 1;
  const maxN = Math.round(720 * Math.max(0.4, density));
  for (let k = k0; k <= k1; k++) {
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
        const ck = cropKind(F.crop, F.small, model.grazing(w.x, w.z), F.tun);
        const sd = slabD(w.x, w.z);
        // the tractor works a stubble / ploughed field in view of the town (W or S), within the free camera's reach
        // (targets stop at slab + 320 m): ~140 m out, so it can be walked up to
        if (ck === CK.stubble || ck === CK.ploughed) {
          const score = Math.abs(sd - 140) + (w.x > SLAB.x1 ? 1e4 : 0);
          if (score < bestT && (F.x1 - F.x0) > 38 && (F.y1 - F.y0) > 34) {
            bestT = score;
            tractorField = { ...F };
          }
        }
        // (the scan runs on after the herds are full: the tractor's field search needs every row)
        if (ck !== CK.pasture || lhash(F.pid, 71) > 0.6 || inst.length / 7 >= maxN) continue;
        const sheep = lhash(F.pid, 72) < (F.small ? 0.5 : 0.35);
        let n = sheep ? 14 + Math.floor(22 * lhash(F.pid, 73)) : 6 + Math.floor(12 * lhash(F.pid, 74));
        if (F.small) n = Math.ceil(n * 0.4); // a few animals in a paddock
        const hx = F.x0 + (F.x1 - F.x0) * (0.25 + 0.5 * lhash(F.pid, 75)),
          hy = F.y0 + (F.y1 - F.y0) * (0.25 + 0.5 * lhash(F.pid, 76));
        const spread = (sheep ? 9 : 14) * (F.small ? 0.6 : 1);
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
  // read by scripts/bench.mjs (sheep / cow classes): x, y, z, yaw, species, tint, phase per animal
  group.userData.herd = inst;
  const geo = animalGeometry();
  const iA = new Float32Array(nA * 4),
    iB = new Float32Array(nA * 4);
  for (let i = 0; i < nA; i++) {
    iA.set([inst[i * 7], inst[i * 7 + 1], inst[i * 7 + 2], inst[i * 7 + 3]], i * 4);
    iB.set([inst[i * 7 + 4], inst[i * 7 + 5], inst[i * 7 + 6], 0.88 + 0.24 * ((inst[i * 7 + 6] * 7.13) % 1)], i * 4);
  }
  // near detail (W8): the animals closest to the camera are drawn by the full sheep / cow models
  // (animals.ts) and hidden in the coarse mesh (iN = 1). ?noanimaldetail = coarse mesh only.
  const detail = !new URLSearchParams(location.search).has('noanimaldetail');
  const iN = new Float32Array(nA);
  const ig = new THREE.InstancedBufferGeometry();
  ig.setAttribute('position', geo.getAttribute('position'));
  ig.setAttribute('normal', geo.getAttribute('normal'));
  ig.setAttribute('aPart', geo.getAttribute('aPart'));
  ig.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
  ig.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4));
  const iNAttr = new THREE.InstancedBufferAttribute(iN, 1);
  iNAttr.setUsage(THREE.DynamicDrawUsage);
  ig.setAttribute('iN', iNAttr);
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
attribute float iN;
attribute float aPart;
uniform float uTime;
varying vec3 vAc;
${POSE_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = position;
{
  bool sheep = iB.x > 0.5;
  float size = iB.w > 0.0 ? iB.w : 1.0;
  vec3 sc = (sheep ? vec3(0.6) : vec3(1.0)) * size;
  // sheep: a fat woolly barrel on short legs; cattle: a longer, deeper body
  if (aPart < 0.5) sc *= sheep ? vec3(1.45, 1.25, 0.95) : vec3(1.0, 1.05, 1.0);
  vec3 p = position * sc;
  if (sheep && aPart < 0.5) p.y -= 0.12 * size;   // the wool hangs low over the legs
  float lie = herdLying(iB);
  float down = lie > 0.5 ? 0.0 : herdGraze(iB);
  if (aPart > 0.5 && aPart < 1.5) { p.y -= (sheep ? 0.62 : 0.68) * down * sc.y; p.z += 0.14 * down * sc.z; }
  if (lie > 0.5) p.y = herdLie(p.y, (sheep ? 0.17 : 0.5) * size, 0.04 * size);
  p *= 1.0 - iN;                                   // drawn by the near model
  float c = cos(iA.w), s = sin(iA.w);
  vec3 pr = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  transformed = pr + iA.xyz;
  // coats: brown / black / white-black piebald / red; patches from the body position
  float pat = step(0.15, sin(position.x * 9.0 + position.z * 4.0 + iB.z * 20.0) + sin(position.z * 7.0 - position.y * 6.0 + iB.z * 11.0));
  vec3 cow = iB.y < 0.28 ? vec3(0.13, 0.075, 0.045) : iB.y < 0.5 ? vec3(0.02, 0.02, 0.02)
    : iB.y < 0.75 ? mix(vec3(0.02), vec3(0.62, 0.6, 0.55), pat) : vec3(0.24, 0.1, 0.045);
  // wool: off-white with a dirty underside and the lumps catching the light differently
  vec3 wool = vec3(0.6, 0.57, 0.49) * (0.86 + 0.18 * fract(iB.z * 13.7)) * mix(0.55, 1.0, smoothstep(-0.7, 0.3, normal.y));
  vec3 dark = vec3(0.04, 0.035, 0.03) * (0.8 + 0.4 * iB.y);
  vAc = sheep ? (aPart < 0.5 ? wool : dark) : (aPart > 1.5 ? cow * 0.6 : aPart > 0.5 ? cow * 0.8 : cow * mix(0.7, 1.0, smoothstep(-0.7, 0.3, normal.y)));
}`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ float c = cos(iA.w), s = sin(iA.w); objectNormal = vec3(c * objectNormal.x + s * objectNormal.z, objectNormal.y, -s * objectNormal.x + c * objectNormal.z); }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAc;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vAc, opacity );');
  };
  mat.customProgramCacheKey = () => 'th-landherd-v3';
  const herd = new THREE.Mesh(ig, mat);
  herd.name = 'land-herds';
  herd.frustumCulled = false;
  // tiny at the distances they are seen from: no shadow pass (saves a full extra draw of every animal)
  herd.castShadow = false;
  herd.receiveShadow = true;
  group.add(herd);
  if (detail && nA > 0) {
    const cap = density >= 0.95 ? [40, 16] : density >= 0.7 ? [24, 10] : [10, 5];
    const nearR = density >= 0.95 ? 55 : density >= 0.7 ? 42 : 30;
    const near = [createNearHerd(sheepGeometry(), cap[0], 1, uniforms, fog), createNearHerd(cowGeometry(), cap[1], 0, uniforms, fog)];
    for (const n of near) group.add(n.mesh);
    // selection: the nearest animals of each species within nearR, refreshed when the camera moves (one
    // frame late: the attributes upload with the next render, the same frame for both meshes)
    const last = new THREE.Vector3(1e9, 0, 0);
    const best = [new Float32Array(cap[0]), new Float32Array(cap[1])];
    const bestD = [new Float32Array(cap[0]), new Float32Array(cap[1])];
    let tick = 0;
    herd.onBeforeRender = (_r, _s, camera) => {
      const cp = camera.position;
      if (++tick < 20 && cp.distanceToSquared(last) < 0.25) return;
      tick = 0;
      last.copy(cp);
      const cnt = [0, 0];
      const r2 = nearR * nearR;
      iN.fill(0);
      for (let i = 0; i < nA; i++) {
        const dx = iA[i * 4] - cp.x,
          dy = iA[i * 4 + 1] - cp.y,
          dz = iA[i * 4 + 2] - cp.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d > r2) continue;
        const sp = iB[i * 4] > 0.5 ? 0 : 1; // near[0] = sheep
        const b = best[sp],
          bd = bestD[sp];
        let k = cnt[sp];
        if (k === b.length) {
          if (d >= bd[k - 1]) continue;
          k--;
        } else cnt[sp]++;
        // insertion into the sorted list
        while (k > 0 && bd[k - 1] > d) {
          bd[k] = bd[k - 1];
          b[k] = b[k - 1];
          k--;
        }
        bd[k] = d;
        b[k] = i;
      }
      for (let sp = 0; sp < 2; sp++) {
        const n = near[sp];
        for (let k = 0; k < n.cap; k++) {
          if (k < cnt[sp]) {
            const i = best[sp][k];
            iN[i] = 1;
            n.a.set(iA.subarray(i * 4, i * 4 + 4), k * 4);
            n.b.set(iB.subarray(i * 4, i * 4 + 4), k * 4);
          } else n.b[k * 4 + 3] = 0; // size 0: collapsed
        }
        n.aAttr.needsUpdate = true;
        n.bAttr.needsUpdate = true;
        n.mesh.visible = cnt[sp] > 0;
      }
      iNAttr.needsUpdate = true;
    };
  }

  // ── the tractor
  let update = (_dt: number) => {};
  let tractorPos: THREE.Vector3 | null = null;
  let working = false;
  if (tractorField) {
    const F = tractorField;
    // the near-real model (tractor.ts) or, with ?notractordetail, the old box template in the fleet
    const model3 = new URLSearchParams(location.search).has('notractordetail') ? null : createTractor(fog);
    const tid = model3 ? -1 : fleet.add(tractorGeometry());
    if (model3) group.add(model3.group);
    const longX = F.x1 - F.x0 >= F.y1 - F.y0;
    const len = longX ? F.x1 - F.x0 - 16 : F.y1 - F.y0 - 16;
    const across = longX ? F.y1 - F.y0 - 16 : F.x1 - F.x0 - 16;
    const passW = 6;
    const passes = Math.max(2, Math.floor(across / passW));
    if (model3) group.add(wheelTracks(F, longX, len, passes, passW, H));
    let s = 0; // distance along the whole serpentine
    const speed = 2.6;
    tractorPos = new THREE.Vector3();
    const P = { x: 0, z: 0 };
    const tractorState = { x: 0, y: 0, z: 0, yaw: 0 };
    group.userData.tractor = tractorState; // scripts/bench.mjs (tractor class)
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
      // field-frame heading → world yaw (model faces +z; field x axis = world (cos r, sin r))
      const hx = longX ? Math.cos(heading) : Math.sin(heading),
        hy = longX ? Math.sin(heading) : Math.cos(heading);
      const dx = hx * 0.990268 - hy * 0.139173,
        dz = hx * 0.139173 + hy * 0.990268;
      const yaw = Math.atan2(dx, dz);
      if (model3) {
        // pitch from the ground under the front and rear axles; the wheels roll with the distance driven
        const fy = H(P.x + dx * (FRONT_Z - REAR_Z), P.z + dz * (FRONT_Z - REAR_Z));
        model3.set(P.x - dx * REAR_Z, y, P.z - dz * REAR_Z, yaw, Math.atan2(fy - y, FRONT_Z - REAR_Z), s);
      } else fleet.set(tid, P.x, y, P.z, yaw);
      tractorState.x = P.x;
      tractorState.y = y;
      tractorState.z = P.z;
      tractorState.yaw = yaw;
      tractorPos!.set(P.x - dx * 3.9, y + 0.5, P.z - dz * 3.9);
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
