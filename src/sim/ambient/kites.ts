// Kites over the beach (daytime): a little flyer standing near the waterline, a sagging string,
// a diamond kite riding the sea breeze (sway, bob, roll) with a waving bow tail. ONE InstancedMesh:
// each instance = flyer + string + kite + tail; the CPU computes the kite offset and the vertex
// shader places the kite, bends the string and waves the tail.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { smooth } from './shared';

const PART = { BODY: 0, KITE: 1, TAIL: 2, STRING: 3, BOW: 4 } as const;
const TAIL_SEG = 12;
const STR_SEG = 14;

function buildKiteGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const prm: number[] = []; // per-vertex parameter (along tail / string, or material slot for body)
  const col: number[] = [];
  const push = (x: number, y: number, z: number, pt: number, s: number, c: number[]) => {
    pos.push(x, y, z);
    part.push(pt);
    prm.push(s);
    col.push(c[0], c[1], c[2]);
  };
  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, c: number[], slot: number) => {
    const x0 = cx - sx / 2,
      x1 = cx + sx / 2,
      y0 = cy - sy / 2,
      y1 = cy + sy / 2,
      z0 = cz - sz / 2,
      z1 = cz + sz / 2;
    const P = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const F = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ];
    for (const f of F)
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const p = P[f[k]];
        push(p[0], p[1], p[2], PART.BODY, slot, c);
      }
  };
  const skin = [0.94, 0.78, 0.64],
    white = [1, 1, 1];
  // flyer (faces +Z, towards the kite), ~1.55 m; slot 0 skin, 1 shirt (instance), 2 shorts (instance)
  box(-0.09, 0.4, 0, 0.13, 0.8, 0.14, skin, 0);
  box(0.09, 0.4, 0, 0.13, 0.8, 0.14, skin, 0);
  box(0, 0.86, 0, 0.36, 0.24, 0.2, white, 2);
  box(0, 1.14, 0, 0.36, 0.42, 0.2, white, 1);
  box(0, 1.47, 0.0, 0.2, 0.22, 0.2, skin, 0);
  box(0, 1.6, -0.01, 0.22, 0.07, 0.22, [0.25, 0.18, 0.12], 3); // hair
  // arms: one holding the string up & forward, one relaxed
  const arm = (x: number, ang: number) => {
    const m = new THREE.Matrix4().makeTranslation(x, 1.3, 0).multiply(new THREE.Matrix4().makeRotationX(-ang)).multiply(new THREE.Matrix4().makeTranslation(0, -0.25, 0));
    const before = pos.length;
    box(0, 0, 0, 0.1, 0.5, 0.1, skin, 0);
    const v = new THREE.Vector3();
    for (let i = before; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
      pos[i] = v.x;
      pos[i + 1] = v.y;
      pos[i + 2] = v.z;
    }
  };
  arm(0.24, 2.3);
  arm(-0.24, 0.25);
  // kite: diamond in kite space (x across, y up along the spine), double sided via two faces
  const K = (x: number, y: number, c: number[], s: number) => push(x, y, 0, PART.KITE, s, c);
  const kc = [
    [0, 0.95],
    [0.55, 0.2],
    [0, -0.75],
    [-0.55, 0.2],
  ];
  const quadT = (a: number[], b: number[], c: number[], s: number) => {
    K(a[0], a[1], white, s);
    K(b[0], b[1], white, s);
    K(c[0], c[1], white, s);
    K(a[0], a[1], white, s);
    K(c[0], c[1], white, s);
    K(b[0], b[1], white, s);
  };
  const ctr = [0, 0.2];
  quadT(kc[0], kc[1], ctr, 0);
  quadT(kc[1], kc[2], ctr, 1);
  quadT(kc[2], kc[3], ctr, 0);
  quadT(kc[3], kc[0], ctr, 1);
  // spars (thin dark strips)
  const spar = [0.18, 0.13, 0.1];
  const strip = (a: number[], b: number[], w: number) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    const nx = (-dy / l) * w,
      ny = (dx / l) * w;
    for (const zz of [0.012, -0.012]) {
      const q = [
        [a[0] + nx, a[1] + ny],
        [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny],
        [a[0] - nx, a[1] - ny],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) push(q[k][0], q[k][1], zz, PART.KITE, 3, spar);
    }
  };
  strip(kc[0], kc[2], 0.02);
  strip(kc[1], kc[3], 0.02);
  // tail: ribbon segments (x = ±half width, s = along)
  for (let i = 0; i < TAIL_SEG; i++) {
    const s0 = i / TAIL_SEG,
      s1 = (i + 1) / TAIL_SEG;
    const w = 0.035;
    const q = [
      [-w, s0],
      [w, s0],
      [w, s1],
      [-w, s1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) push(q[k][0], 0, 0, PART.TAIL, q[k][1], white);
    for (const k of [0, 2, 1, 0, 3, 2]) push(q[k][0], 0, 0, PART.TAIL, q[k][1], white);
  }
  // bows along the tail
  for (let i = 1; i <= 4; i++) {
    const s = i / 4.6;
    const b = 0.16;
    const tri = [
      [0, 0],
      [-b, b * 0.6],
      [-b, -b * 0.6],
      [0, 0],
      [b, -b * 0.6],
      [b, b * 0.6],
    ];
    for (const t of tri) push(t[0], t[1], 0, PART.BOW, s, white);
    for (const t of [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]]) push(t[0], t[1], 0, PART.BOW, s, white);
  }
  // string: crossed ribbons (x and y offsets), s = along
  for (let i = 0; i < STR_SEG; i++) {
    const s0 = i / STR_SEG,
      s1 = (i + 1) / STR_SEG;
    for (const [ox, oy] of [
      [1, 0],
      [0, 1],
    ]) {
      const q = [
        [-ox, -oy, s0],
        [ox, oy, s0],
        [ox, oy, s1],
        [-ox, -oy, s1],
      ];
      for (const k of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) push(q[k][0], q[k][1], 0, PART.STRING, q[k][2], [0.92, 0.9, 0.86]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aPrm', new THREE.Float32BufferAttribute(prm, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const KITE_GLSL = /* glsl */ `
attribute float aPart;
attribute float aPrm;
attribute vec4 iKite;   // kite centre (instance space) xyz, roll
attribute vec4 iKite2;  // pitch (face tilt), tail phase, string sag, deploy 0..1
attribute vec3 iCol1;
attribute vec3 iCol2;
attribute vec3 iShirt;
varying vec3 vKiteCol;
mat3 kiteBasis() {
  // kite faces back towards the flyer (-Z), tilted by pitch, rolled by roll
  float r = iKite.w, p = iKite2.x;
  float cr = cos(r), sr = sin(r), cp = cos(p), sp = sin(p);
  vec3 X = vec3(cr, sr, 0.0);
  vec3 Y = vec3(-sr, cr, 0.0);
  // tilt about X: Y leans downwind (+Z)
  Y = normalize(Y * cp + vec3(0.0, 0.0, 1.0) * sp);
  vec3 Z = normalize(cross(X, Y));
  return mat3(X, Y, Z);
}
void kitePose(inout vec3 p, inout vec3 n) {
  vKiteCol = color;
  if (aPart < 0.5) {
    if (aPrm > 0.5 && aPrm < 1.5) vKiteCol = iShirt;
    else if (aPrm > 1.5 && aPrm < 2.5) vKiteCol = iCol2 * 0.7 + 0.1;
    return;
  }
  mat3 B = kiteBasis();
  vec3 C = iKite.xyz;
  vec3 tailTop = C + B * vec3(0.0, -0.75, 0.0);
  vec3 hand = vec3(0.24, 1.64, 0.38);
  float t = iKite2.y;
  if (aPart < 1.5) {
    p = C + B * p;
    n = B * n;
    vKiteCol = aPrm < 0.5 ? iCol1 : aPrm < 1.5 ? iCol2 : vec3(0.18, 0.13, 0.1);
    return;
  }
  if (aPart < 2.5 || aPart > 3.5) {
    // tail hangs downwind & down from the bottom corner, waving
    float s = aPrm;
    float L = 4.2;
    vec3 dir = normalize(vec3(0.0, -0.75, 0.66));
    vec3 side = vec3(1.0, 0.0, 0.0);
    float wave = sin(s * 9.0 - t * 7.0) * 0.32 * s + sin(s * 4.0 - t * 3.1) * 0.15 * s;
    float lift = sin(s * 7.0 - t * 5.0) * 0.12 * s;
    vec3 c = tailTop + dir * s * L + side * wave + vec3(0.0, lift, 0.0);
    if (aPart < 2.5) {
      p = c + side * p.x;
      n = vec3(0.0, 1.0, 0.0);
      vKiteCol = iCol1 * 0.9 + 0.05;
    } else {
      p = c + vec3(p.x, p.y, 0.0) * 0.9;
      n = vec3(0.0, 0.0, -1.0);
      vKiteCol = iCol2;
    }
    return;
  }
  // string: hand → bridle with a sag, crossed ribbons ~2.5 cm
  float s = aPrm;
  vec3 a = hand;
  vec3 b = C + B * vec3(0.0, 0.05, -0.05);
  vec3 c = mix(a, b, s) + vec3(0.0, -iKite2.z * 4.0 * s * (1.0 - s), 0.0);
  n = normalize(vec3(p.x * 0.3, 1.0, 0.0));
  // a real kite line is a hair-thin cord: draw it ~1.4 cm wide, darker than the sky, and let it vanish
  // once it would be thinner than ~0.6 px (no hard bright line across the sea at grazing angles)
  vec3 wc = (modelMatrix * instanceMatrix * vec4(c, 1.0)).xyz;
  float pxw = 0.014 * projectionMatrix[1][1] * 500.0 / max(length(cameraPosition - wc), 0.5);
  p = c + vec3(p.x, p.y, 0.0) * 0.014 * smoothstep(0.35, 0.9, pxw);
  vKiteCol = vec3(0.62, 0.6, 0.55);
}
`;

function makeKiteMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${KITE_GLSL}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 kiteP = vec3( position );\nkitePose( kiteP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = kiteP;\nvColor.rgb = vKiteCol;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>');
  };
  m.customProgramCacheKey = () => 'tinyhaven-ambient-kite-2';
  return m;
}

export interface KiteSystem {
  mesh: THREE.InstancedMesh;
  update(dt: number): void;
  locate(i: number): { x: number; y: number; z: number } | null;
  stats(): Record<string, number>;
  invariants(): string[];
}

export function createKites(ctx: CityContext): KiteSystem {
  const rng = ctx.rng('ambient-kites');
  const { plan } = ctx;
  const ground = (x: number, z: number) => (ctx.services.terrain as { height(x: number, z: number): number } | undefined)?.height(x, z) ?? plan.heightAt(x, z);
  const beach = plan.areas.find((a) => a.kind === 'beach');
  const zs = [16, 44, 66, 92];
  const anchors: { x: number; y: number; z: number }[] = [];
  for (const z0 of zs) {
    const z = z0 + rng.range(-3, 3);
    // stand on dry sand just above the water line
    let x = beach ? beach.rect.x1 - 4 : 140;
    for (let k = 0; k < 14; k++) {
      const gy = ground(x, z);
      if (gy > plan.water.level + 0.45 && !plan.isWater(x, z)) break;
      x -= 0.8;
    }
    anchors.push({ x, y: ground(x, z), z });
  }
  const N = anchors.length;
  const geo = buildKiteGeometry();
  const mk = (n: number, dyn = false) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(N * n), n);
    if (dyn) a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const aK = mk(4, true),
    aK2 = mk(4, true),
    aC1 = mk(3),
    aC2 = mk(3),
    aSh = mk(3);
  geo.setAttribute('iKite', aK);
  geo.setAttribute('iKite2', aK2);
  geo.setAttribute('iCol1', aC1);
  geo.setAttribute('iCol2', aC2);
  geo.setAttribute('iShirt', aSh);
  const mesh = new THREE.InstancedMesh(geo, makeKiteMaterial(), N);
  mesh.name = 'ambient-kites';
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pal: [string, string][] = [
    ['#e63946', '#f4d35e'],
    ['#2a9df4', '#ffffff'],
    ['#7b2cbf', '#ff9f1c'],
    ['#2ec4b6', '#e71d36'],
  ];
  const shirts = ['#f4a261', '#3a86ff', '#ff006e', '#8ac926'];
  const c = new THREE.Color();
  const kites = anchors.map((a, i) => {
    const [k1, k2] = pal[i % pal.length];
    c.set(k1);
    aC1.setXYZ(i, c.r, c.g, c.b);
    c.set(k2);
    aC2.setXYZ(i, c.r, c.g, c.b);
    c.set(shirts[i % shirts.length]);
    aSh.setXYZ(i, c.r, c.g, c.b);
    return { a, seed: rng.range(0, 100), len: rng.range(26, 34), elev: rng.range(0.62, 0.8), deploy: 0, x: 0, y: 0, z: 0 };
  });
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    v = new THREE.Vector3(),
    s = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let T = 0;
  const want = () => {
    const h = ctx.clock.hours;
    return smooth(8.8, 9.4, h) * (1 - smooth(18.2, 18.8, h)) * (1 - smooth(0.12, 0.3, ctx.uniforms.uRain.value)) * smooth(0.5, 0.8, ctx.clock.daylight);
  };
  const write = () => {
    const w = ctx.uniforms.uWind.value;
    const yaw = Math.atan2(w.x, w.y);
    const strength = Math.min(1.5, Math.hypot(w.x, w.y));
    kites.forEach((k, i) => {
      const d = k.deploy;
      if (d < 0.01) {
        mesh.setMatrixAt(i, ZERO);
        return;
      }
      const t = T + k.seed;
      const L = k.len * (0.35 + 0.65 * d);
      const el = k.elev * (0.25 + 0.75 * d) + Math.sin(t * 0.37) * 0.05;
      const sway = Math.sin(t * 0.29) * 0.22 + Math.sin(t * 0.83) * 0.06;
      // kite position in instance space (+Z downwind)
      const kx = Math.sin(sway) * L * Math.cos(el);
      const ky = 1.8 + Math.sin(el) * L + Math.sin(t * 1.3) * 0.4;
      const kz = Math.cos(sway) * L * Math.cos(el);
      aK.setXYZW(i, kx, ky, kz, -sway * 1.6 + Math.sin(t * 2.1) * 0.12);
      aK2.setXYZW(i, 0.5 + Math.sin(t * 0.9) * 0.08, t * (0.8 + 0.4 * strength), 0.6 + 0.4 * (1 - d), d);
      q.setFromAxisAngle(up, yaw + Math.sin(t * 0.21) * 0.15);
      m4.compose(v.set(k.a.x, k.a.y, k.a.z), q, s.set(1, 1, 1));
      mesh.setMatrixAt(i, m4);
      // world position of the kite (for locate / invariants)
      v.set(kx, ky, kz).applyQuaternion(q);
      k.x = k.a.x + v.x;
      k.y = k.a.y + v.y;
      k.z = k.a.z + v.z;
    });
    mesh.instanceMatrix.needsUpdate = true;
    aK.needsUpdate = true;
    aK2.needsUpdate = true;
  };
  const snap = () => {
    const target = want();
    for (const k of kites) k.deploy = target;
    write();
  };
  ctx.events.on('timejump', snap);
  snap();
  return {
    mesh,
    update(dt) {
      if (dt <= 0) return;
      T += dt;
      const target = want();
      kites.forEach((k, i) => {
        // flyers go home one by one
        const tk = target > 0.5 + i * 0.08 ? 1 : target < 0.3 - i * 0.05 ? 0 : k.deploy > 0.5 ? 1 : 0;
        k.deploy += (tk - k.deploy) * Math.min(1, dt * 0.15);
      });
      write();
    },
    locate(i) {
      const k = kites[Math.max(0, Math.min(kites.length - 1, i))];
      return k ? { x: k.x, y: k.y, z: k.z } : null;
    },
    stats() {
      return { kites: kites.filter((k) => k.deploy > 0.5).length };
    },
    invariants() {
      const out: string[] = [];
      for (const k of kites) if (k.deploy > 0.5 && k.y < k.a.y + 3) out.push(`kite too low (${k.y.toFixed(1)} m)`);
      return out;
    },
  };
}
