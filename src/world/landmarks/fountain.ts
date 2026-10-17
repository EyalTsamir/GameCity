// The Town Square fountain: a moulded stone basin with a two-tier pedestal, rippling
// water surfaces, a central geyser with an umbrella sheet, overflow curtains from both
// bowls, eight arcing jets from the rim, and droplets/splashes (GPU-animated Points).
// Night: underwater lights tint the water and sprays.
// Draw calls: water surfaces (1) + sprays/curtains (1) + droplets (1); stone goes to the
// shared static mesh.

import * as THREE from 'three';
import type { Feature } from '../../core/plan';
import type { GlobalUniforms } from '../../core/uniforms';
import { FLOOD, M, PAT } from './builder';
import type { Env } from './env';

const SPRAY_VERT = /* glsl */ `
attribute vec2 aSp;   // u around, t along the stream (0 nozzle .. 1 end)
attribute float aLen; // stream length (m)
varying vec2 vSp;
varying float vLen;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <fog_pars_vertex>
void main() {
  vSp = aSp;
  vLen = aLen;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const SPRAY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLights;
uniform float uDaylight;
varying vec2 vSp;
varying float vLen;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <fog_pars_fragment>
float sh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh(i), sh(i + vec2(1.0, 0.0)), f.x), mix(sh(i + vec2(0.0, 1.0)), sh(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float s = vSp.y * vLen;
  float flow = sn(vec2(vSp.x * 9.0, s * 2.2 - uTime * 4.5)) * 0.6 + sn(vec2(vSp.x * 23.0, s * 6.0 - uTime * 7.0)) * 0.4;
  float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = (0.28 + 0.55 * flow) * (0.55 + 0.6 * fres);
  a *= smoothstep(0.0, 0.04, vSp.y) * (1.0 - smoothstep(0.86, 1.0, vSp.y) * 0.6);
  vec3 day = mix(vec3(0.72, 0.84, 0.9), vec3(1.0), flow * 0.6) * (0.55 + 0.5 * uDaylight);
  vec3 night = mix(vec3(0.45, 0.85, 1.0), vec3(1.0, 0.95, 0.85), flow) * 1.25;
  vec3 col = mix(day, night, uLights);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
}
`;

const DROP_VERT = /* glsl */ `
attribute vec3 aV0;
attribute vec4 aInfo; // phase, lifetime, size, kind
uniform float uTime;
uniform float uScale;
varying float vA;
#include <common>
#include <fog_pars_vertex>
void main() {
  float life = aInfo.y;
  float t = fract(uTime / life + aInfo.x) * life;
  vec3 p = position + aV0 * t + vec3(0.0, -4.9, 0.0) * t * t;
  vA = (1.0 - smoothstep(0.7, 1.0, t / life)) * smoothstep(0.0, 0.08, t / life);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aInfo.z * uScale / max(-mvPosition.z, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const DROP_FRAG = /* glsl */ `
uniform float uLights;
uniform float uDaylight;
varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float a = (1.0 - smoothstep(0.25, 0.5, r)) * vA * 0.8;
  vec3 col = mix(vec3(0.85, 0.93, 1.0) * (0.6 + 0.45 * uDaylight), vec3(0.7, 0.95, 1.0) * 1.4, uLights);
  gl_FragColor = vec4(col, a);
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
}
`;

function waterMaterial(g: GlobalUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#235f74', roughness: 0.06, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = g.uTime;
    sh.uniforms.uLights = g.uLights;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uLights;\nvarying vec3 vFW;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 p = vFW.xz;
          float t = uTime;
          vec2 grad = vec2(0.0);
          // concentric ripples around the jets' landing rings + wind chop
          float r = length(p - uFC.xz);
          grad += normalize(p - uFC.xz + 1e-4) * cos(r * 9.0 - t * 6.0) * 0.12;
          grad += vec2(cos(p.x * 3.1 + t * 1.7), cos(p.y * 2.7 - t * 1.3)) * 0.06;
          grad += vec2(cos((p.x + p.y) * 7.0 - t * 3.0), cos((p.x - p.y) * 6.0 + t * 2.4)) * 0.05;
          vec3 nW = normalize(vec3(-grad.x, 1.0, -grad.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float r = length(vFW.xz - uFC.xz);
          float caust = 0.5 + 0.5 * sin(r * 5.0 - uTime * 2.0);
          totalEmissiveRadiance += vec3(0.25, 0.75, 0.95) * uLights * (0.35 + 0.25 * caust) * (1.0 - smoothstep(1.0, 4.6, r) * 0.6);
        }`,
      );
    sh.uniforms.uFC = { value: (m.userData.center as THREE.Vector3) ?? new THREE.Vector3() };
    sh.fragmentShader = sh.fragmentShader.replace('uniform float uTime;', 'uniform float uTime;\nuniform vec3 uFC;');
  };
  m.customProgramCacheKey = () => 'lm-fountain-water-v1';
  return m;
}

/** Tube along a polyline of points with radius per point. */
function streamTube(pts: THREE.Vector3[], radii: number[], seg: number, pos: number[], nrm: number[], sp: number[], len: number[], idx: number[]): void {
  const n = pts.length;
  let total = 0;
  for (let i = 1; i < n; i++) total += pts[i].distanceTo(pts[i - 1]);
  const base = pos.length / 3;
  const T = new THREE.Vector3(),
    N = new THREE.Vector3(),
    B = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
    const a = pts[Math.max(i - 1, 0)],
      b = pts[Math.min(i + 1, n - 1)];
    T.subVectors(b, a).normalize();
    N.crossVectors(T, Math.abs(T.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    B.crossVectors(T, N).normalize();
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const dx = Math.cos(th),
        dy = Math.sin(th);
      const nx = N.x * dx + B.x * dy,
        ny = N.y * dx + B.y * dy,
        nz = N.z * dx + B.z * dy;
      pos.push(pts[i].x + nx * radii[i], pts[i].y + ny * radii[i], pts[i].z + nz * radii[i]);
      nrm.push(nx, ny, nz);
      sp.push(k / seg, acc / total);
      len.push(total);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = base + i * (seg + 1) + k;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/** Sheet of revolution (curtain / umbrella) from profile (r, y) points around (cx, cz). */
function curtain(cx: number, cz: number, prof: [number, number][], seg: number, pos: number[], nrm: number[], sp: number[], len: number[], idx: number[]): void {
  const base = pos.length / 3;
  let total = 0;
  for (let i = 1; i < prof.length; i++) total += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
  let acc = 0;
  for (let i = 0; i < prof.length; i++) {
    if (i > 0) acc += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
    const [r, y] = prof[i];
    const j0 = Math.max(i - 1, 0),
      j1 = Math.min(i + 1, prof.length - 1);
    const dr = prof[j1][0] - prof[j0][0],
      dy = prof[j1][1] - prof[j0][1];
    const l = Math.hypot(dr, dy) || 1;
    // outward normal of the profile (perpendicular to tangent)
    const nr = dy / l,
      ny = -dr / l;
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const c = Math.cos(th),
        s = Math.sin(th);
      pos.push(cx + c * r, y, cz + s * r);
      nrm.push(c * nr, ny, s * nr);
      sp.push(k / seg * Math.max(1, Math.round(r * 6)), acc / total);
      len.push(total);
    }
  }
  for (let i = 0; i < prof.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = base + i * (seg + 1) + k;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
}

export function genFountain(env: Env, f: Feature, g: GlobalUniforms): void {
  const R = Math.min(Number(f.params?.radius ?? f.radius ?? 5), f.radius || 5);
  env.begin(f.x, 0, f.z, 0);
  env.checkRadius(f.x, f.z, f.radius || R, 'fountain');
  const K = env.S;
  const stone = M('#ddd3c0', PAT.STONE, 0.75, 0, 0, FLOOD.SOFT, 0.15);
  const stoneTrim = M('#e8e0cf', PAT.PLAIN, 0.7, 0, 0, FLOOD.SOFT);
  const mosaic = M('#24566a', PAT.STONE, 0.6, 0, 0, 0, 0.1);
  const bronze = M('#5f7d5c', PAT.PLAIN, 0.4, 0.7);
  const rOut = R - 0.06;
  const rIn = rOut - 0.62;
  const wY = 0.42; // water level in the basin
  // basin rim (lathe) + floor
  K.lathe(
    stone,
    [
      [rIn, 0.0],
      [rIn, 0.5],
      [rIn + 0.06, 0.58],
      [rIn + 0.3, 0.63],
      [rOut - 0.08, 0.6],
      [rOut, 0.52],
      [rOut, 0.14],
      [rOut + 0.04, 0.08],
      [rOut + 0.04, 0.0],
    ].reverse() as [number, number][],
    0,
    0,
    0,
    64,
  );
  K.cyl(mosaic, rIn, rIn, 0.06, 0, 0.0, 0, 48);
  // pedestal: base drum, stem, lower bowl, stem, upper bowl, finial
  K.lathe(
    stone,
    [
      [0.0, 1.02],
      [0.95, 1.02],
      [1.0, 0.9],
      [0.95, 0.0],
    ].reverse() as [number, number][],
    0,
    0.06,
    0,
    24,
  );
  K.lathe(
    stoneTrim,
    [
      [0.0, 2.1],
      [0.36, 2.1],
      [0.3, 1.85],
      [0.42, 1.5],
      [0.55, 1.12],
      [0.0, 1.12],
    ].reverse() as [number, number][],
    0,
    0,
    0,
    20,
  );
  // lower bowl (dish)
  K.lathe(
    stone,
    [
      [0.0, 1.32],
      [0.6, 1.3],
      [1.25, 1.42],
      [1.72, 1.6],
      [1.82, 1.72],
      [1.78, 1.8],
      [1.6, 1.76],
      [1.55, 1.68],
      [0.0, 1.66],
    ],
    0,
    0,
    0,
    36,
  );
  K.lathe(
    stoneTrim,
    [
      [0.0, 2.95],
      [0.18, 2.95],
      [0.22, 2.6],
      [0.3, 2.1],
      [0.0, 2.1],
    ].reverse() as [number, number][],
    0,
    0,
    0,
    16,
  );
  // upper bowl
  K.lathe(
    stone,
    [
      [0.0, 2.7],
      [0.45, 2.72],
      [0.82, 2.86],
      [0.98, 3.0],
      [0.94, 3.07],
      [0.82, 3.02],
      [0.0, 2.98],
    ],
    0,
    0,
    0,
    28,
  );
  // bronze finial (pine cone) the geyser springs from
  K.lathe(
    bronze,
    [
      [0.0, 3.0],
      [0.16, 3.05],
      [0.2, 3.22],
      [0.14, 3.42],
      [0.06, 3.52],
      [0.0, 3.55],
    ],
    0,
    0,
    0,
    12,
  );
  // four little bronze spouting fish on the lower drum
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a),
      s = Math.sin(a);
    K.sphere(bronze, 0.22, c * 1.0, 0.75, s * 1.0, 10, 8, 0.8);
    K.cone(bronze, 0.15, 0.3, c * 0.82, 0.65, s * 0.82, 8);
  }

  // ── water surfaces (one mesh)
  const wGeo: THREE.BufferGeometry[] = [];
  const disc = (r: number, y: number) => {
    const d = new THREE.CircleGeometry(r, 48);
    d.rotateX(-Math.PI / 2);
    d.translate(f.x, y, f.z);
    d.deleteAttribute('uv');
    wGeo.push(d);
  };
  disc(rIn + 0.01, wY);
  disc(1.6, 1.7);
  disc(0.84, 3.0);
  const wm = waterMaterial(g);
  wm.userData.center = new THREE.Vector3(f.x, 0, f.z);
  const wMerged = new THREE.Mesh(mergeSimple(wGeo), wm);
  wMerged.name = 'landmarks-fountain-water';
  wMerged.receiveShadow = true;
  wMerged.matrixAutoUpdate = false;
  env.extra.push(wMerged);

  // ── sprays & curtains (one transparent mesh)
  const pos: number[] = [],
    nrm: number[] = [],
    sp: number[] = [],
    len: number[] = [],
    idx: number[] = [];
  // lower-bowl overflow curtain
  curtain(f.x, f.z, [
    [1.8, 1.78],
    [1.88, 1.6],
    [1.98, 1.25],
    [2.08, 0.85],
    [2.14, wY],
  ], 48, pos, nrm, sp, len, idx);
  // upper-bowl curtain
  curtain(f.x, f.z, [
    [0.97, 3.05],
    [1.03, 2.85],
    [1.12, 2.4],
    [1.2, 1.9],
    [1.24, 1.7],
  ], 36, pos, nrm, sp, len, idx);
  // geyser umbrella (from the top of the jet flaring down onto the upper bowl)
  curtain(f.x, f.z, [
    [0.05, 4.55],
    [0.22, 4.5],
    [0.42, 4.25],
    [0.6, 3.8],
    [0.72, 3.3],
    [0.78, 3.04],
  ], 28, pos, nrm, sp, len, idx);
  // geyser column
  {
    const pts: THREE.Vector3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector3(f.x, 3.5 + t * 1.05, f.z));
      radii.push(0.05 + 0.04 * t);
    }
    streamTube(pts, radii, 8, pos, nrm, sp, len, idx);
  }
  // eight arcing jets from the rim towards the pedestal
  const jets: { p0: THREE.Vector3; v0: THREE.Vector3; T: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a),
      s = Math.sin(a);
    const p0 = new THREE.Vector3(f.x + c * (rIn + 0.12), 0.66, f.z + s * (rIn + 0.12));
    const land = new THREE.Vector3(f.x + c * 2.3, wY, f.z + s * 2.3);
    const T = 0.95;
    const v0 = new THREE.Vector3((land.x - p0.x) / T, (land.y - p0.y + 4.9 * T * T) / T, (land.z - p0.z) / T);
    jets.push({ p0, v0, T });
    const pts: THREE.Vector3[] = [];
    const radii: number[] = [];
    for (let k = 0; k <= 14; k++) {
      const t = (k / 14) * T;
      pts.push(new THREE.Vector3(p0.x + v0.x * t, p0.y + v0.y * t - 4.9 * t * t, p0.z + v0.z * t));
      radii.push(0.035 + 0.05 * (k / 14));
    }
    streamTube(pts, radii, 6, pos, nrm, sp, len, idx);
    // nozzle (bronze) on the rim (frame is centred on the fountain, yaw 0)
    K.cyl(bronze, 0.05, 0.08, 0.12, p0.x - f.x, 0.58, p0.z - f.z, 8);
  }
  env.endChecks();
  // the four fish spout small jets into the basin
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a),
      s = Math.sin(a);
    const p0 = new THREE.Vector3(f.x + c * 0.7, 0.62, f.z + s * 0.7);
    const v0 = new THREE.Vector3(c * 1.5, 0.6, s * 1.5);
    const pts: THREE.Vector3[] = [];
    const radii: number[] = [];
    const T = 0.36;
    for (let k = 0; k <= 8; k++) {
      const t = (k / 8) * T;
      pts.push(new THREE.Vector3(p0.x + v0.x * t, p0.y + v0.y * t - 4.9 * t * t, p0.z + v0.z * t));
      radii.push(0.025 + 0.025 * (k / 8));
    }
    streamTube(pts, radii, 6, pos, nrm, sp, len, idx);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  sg.setAttribute('aSp', new THREE.Float32BufferAttribute(sp, 2));
  sg.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
  sg.setIndex(idx);
  sg.computeBoundingSphere();
  const smat = new THREE.ShaderMaterial({
    vertexShader: SPRAY_VERT,
    fragmentShader: SPRAY_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  Object.assign(smat.uniforms, { uTime: g.uTime, uLights: g.uLights, uDaylight: g.uDaylight });
  const spray = new THREE.Mesh(sg, smat);
  spray.name = 'landmarks-fountain-spray';
  spray.renderOrder = 2;
  spray.matrixAutoUpdate = false;
  env.extra.push(spray);

  // ── droplets & splashes (Points, animated in the vertex shader)
  const dp: number[] = [],
    dv: number[] = [],
    di: number[] = [];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const j of jets) {
    for (let k = 0; k < 10; k++) {
      dp.push(j.p0.x, j.p0.y, j.p0.z);
      dv.push(j.v0.x * (0.96 + rnd() * 0.08) + (rnd() - 0.5) * 0.25, j.v0.y * (0.95 + rnd() * 0.08), j.v0.z * (0.96 + rnd() * 0.08) + (rnd() - 0.5) * 0.25);
      di.push(rnd(), j.T * 1.02, 26 + rnd() * 14, 0);
    }
    // splash at the landing point
    const land = new THREE.Vector3(j.p0.x + j.v0.x * j.T, wY + 0.02, j.p0.z + j.v0.z * j.T);
    for (let k = 0; k < 8; k++) {
      const a = rnd() * Math.PI * 2;
      const sp2 = 0.4 + rnd() * 0.6;
      dp.push(land.x, land.y, land.z);
      dv.push(Math.cos(a) * sp2, 1.2 + rnd() * 1.0, Math.sin(a) * sp2);
      di.push(rnd(), 0.35 + rnd() * 0.2, 20 + rnd() * 12, 1);
    }
  }
  // geyser crown spray
  for (let k = 0; k < 40; k++) {
    const a = rnd() * Math.PI * 2;
    const sp2 = 0.3 + rnd() * 0.7;
    dp.push(f.x, 4.45, f.z);
    dv.push(Math.cos(a) * sp2, 0.6 + rnd() * 1.2, Math.sin(a) * sp2);
    di.push(rnd(), 0.6 + rnd() * 0.3, 26 + rnd() * 16, 2);
  }
  // splashes around the curtains' foot
  for (let k = 0; k < 36; k++) {
    const a = rnd() * Math.PI * 2;
    const r = k % 2 ? 2.14 : 1.24;
    const y = k % 2 ? wY : 1.7;
    dp.push(f.x + Math.cos(a) * r, y, f.z + Math.sin(a) * r);
    dv.push(Math.cos(a) * 0.5, 0.9 + rnd() * 0.6, Math.sin(a) * 0.5);
    di.push(rnd(), 0.3 + rnd() * 0.15, 18 + rnd() * 10, 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.setAttribute('aV0', new THREE.Float32BufferAttribute(dv, 3));
  dg.setAttribute('aInfo', new THREE.Float32BufferAttribute(di, 4));
  dg.boundingSphere = new THREE.Sphere(new THREE.Vector3(f.x, 2, f.z), R + 3);
  const dmat = new THREE.ShaderMaterial({
    vertexShader: DROP_VERT,
    fragmentShader: DROP_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 1 } }]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  Object.assign(dmat.uniforms, { uTime: g.uTime, uLights: g.uLights, uDaylight: g.uDaylight });
  const drops = new THREE.Points(dg, dmat);
  drops.name = 'landmarks-fountain-drops';
  drops.renderOrder = 2;
  drops.matrixAutoUpdate = false;
  env.extra.push(drops);
  // point size: world size (m) → pixels: size * (viewport height / (2 tan(fov/2))) / depth.
  env.updaters.push((_dt, ctx) => {
    const cam = ctx.camera;
    const h = ctx.renderer.domElement.height;
    dmat.uniforms.uScale.value = (h / (2 * Math.tan((cam.fov * Math.PI) / 360))) * 0.004;
  });

  // ── night: underwater lights
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    env.glow(Math.cos(a) * 3.0, wY + 0.03, Math.sin(a) * 3.0, { size: 1.6, kind: 'pool', color: '#5fd0ff', intensity: 0.35 });
  }
  env.glow(0, 3.9, 0, { size: 2.4, kind: 'halo', color: '#9fe6ff', intensity: 0.28 });
  env.glow(0, 0.05, 0, { size: R + 1.5, kind: 'pool', color: '#7fd6ff', intensity: 0.12 });

  env.pick(f.id, 'Town Square fountain', new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, 4.6, f.z + R)), () => [
    'Two-tier fountain · 8 arc jets & a geyser',
    'Lit from below at night',
    'A favourite meeting point',
  ]);
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0,
    ni = 0;
  for (const g of geos) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let vo = 0,
    io = 0;
  for (const g of geos) {
    const p = g.attributes.position.array as Float32Array;
    const n = g.attributes.normal.array as Float32Array;
    pos.set(p, vo * 3);
    nrm.set(n, vo * 3);
    const I = g.index!;
    for (let i = 0; i < I.count; i++) idx[io++] = vo + I.getX(i);
    vo += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
