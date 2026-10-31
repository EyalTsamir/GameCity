// Far facades (docs/progress/baking.md): the walls' procedural surface baked straight-on into an atlas, for walls far enough
// from the camera that a texel is about a pixel. What changes with the time of day or the camera stays live, per window, in
// a small program: which rooms are lit, the reflection, the sun's glint, the crown lights, the sun, the shadows, the lamps.
//
//   fac0  daylight albedo (with windows, frames, weathering)                       4096, sRGB
//   fac1  what a room gives off when lit at night / 4                              2048, sRGB
//   fac2  r roughness, g how much the pane mirrors (at normal incidence), b metal  2048, linear
//
// The vertex shader picks the side per wall (a wall = the triangles that share vertices): the near shell collapses the walls
// the far mesh draws and the other way round, so no index ever changes and the shadow and depth passes keep all of them.
// Beyond the walls: 100 000 m² of wall and 5 000 triangles, so an atlas this size is about 8.5 cm a texel.

import * as THREE from 'three';

/** atlas size of fac0 */
export const FAR_ATLAS = 4096;
/** empty texels round a chart (filled with its colours by scripts/bake.mjs) */
const GUTTER = 4;
/** how many screen pixels a texel may cover */
export const FAR_SOFT = 1.5;

export interface FarShell {
  geometry: THREE.BufferGeometry;
  /** metres per texel of fac0 */
  texel: number;
}

interface Chart {
  /** triangles: chunk geometry index, first index of the triangle */
  tris: [number, number][];
  tx: THREE.Vector3;
  ty: THREE.Vector3;
  u0: number;
  v0: number;
  w: number;
  h: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  sphere: [number, number, number, number];
}

const place = (charts: Chart[], texel: number): boolean => {
  let x = GUTTER,
    y = GUTTER,
    rowH = 0;
  for (const c of charts) {
    c.sx = Math.max(1, Math.ceil(c.w / texel));
    c.sy = Math.max(1, Math.ceil(c.h / texel));
    if (x + c.sx + GUTTER > FAR_ATLAS) {
      x = GUTTER;
      y += rowH + 2 * GUTTER;
      rowH = 0;
    }
    if (c.sx + 2 * GUTTER > FAR_ATLAS || y + c.sy + GUTTER > FAR_ATLAS) return false;
    c.x = x;
    c.y = y;
    x += c.sx + 2 * GUTTER;
    rowH = Math.max(rowH, c.sy);
  }
  return true;
};

/**
 * Give each wall of the shell chunks its bounding sphere (attribute aFarC, on the chunks too) and a chart of the atlas, and
 * return all their triangles as one mesh. Deterministic: the same chunks give the same atlas at the bake and in the page.
 */
export function buildFarShell(chunks: THREE.BufferGeometry[]): FarShell | null {
  const charts: Chart[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3(),
    e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();
  chunks.forEach((g, gi) => {
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    const idx = g.index!.array;
    // walls: triangles that share vertices
    const parent = new Int32Array(P.count).map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const r = find(idx[t]);
      parent[find(idx[t + 1])] = r;
      parent[find(idx[t + 2])] = r;
    }
    const walls = new Map<number, Map<string, Chart>>();
    const boxes = new Map<number, THREE.Box3>();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(P, idx[t]);
      b.fromBufferAttribute(P, idx[t + 1]);
      c.fromBufferAttribute(P, idx[t + 2]);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      const len = n.length();
      if (len < 1e-6) continue;
      n.divideScalar(len);
      const root = find(idx[t]);
      let box = boxes.get(root);
      if (!box) boxes.set(root, (box = new THREE.Box3()));
      box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      let wall = walls.get(root);
      if (!wall) walls.set(root, (wall = new Map()));
      const key = `${Math.round(n.x * 200)},${Math.round(n.y * 200)},${Math.round(n.z * 200)},${Math.round(n.dot(a) * 20)}`;
      let ch = wall.get(key);
      if (!ch) {
        const tx = Math.abs(n.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(n.z, 0, -n.x).normalize();
        wall.set(key, (ch = { tris: [], tx, ty: new THREE.Vector3().crossVectors(n, tx), u0: 1e9, v0: 1e9, w: 0, h: 0, x: 0, y: 0, sx: 0, sy: 0, sphere: [0, 0, 0, 0] }));
      }
      ch.tris.push([gi, t]);
    }
    // per vertex: the wall's sphere
    const farC = new Float32Array(P.count * 4);
    const spheres = new Map<number, [number, number, number, number]>();
    const s = new THREE.Sphere();
    for (const [root, box] of boxes) {
      box.getBoundingSphere(s);
      spheres.set(root, [s.center.x, s.center.y, s.center.z, s.radius]);
    }
    for (let i = 0; i < P.count; i++) {
      const sp = spheres.get(find(i));
      if (sp) farC.set(sp, i * 4);
    }
    g.setAttribute('aFarC', new THREE.BufferAttribute(farC, 4));
    for (const [root, wall] of walls)
      for (const ch of wall.values()) {
        ch.sphere = spheres.get(root)!;
        let u1 = -1e9,
          v1 = -1e9;
        for (const [, t] of ch.tris)
          for (let k = 0; k < 3; k++) {
            a.fromBufferAttribute(P, idx[t + k]);
            const u = a.dot(ch.tx),
              v = a.dot(ch.ty);
            ch.u0 = Math.min(ch.u0, u);
            ch.v0 = Math.min(ch.v0, v);
            u1 = Math.max(u1, u);
            v1 = Math.max(v1, v);
          }
        ch.w = u1 - ch.u0;
        ch.h = v1 - ch.v0;
        charts.push(ch);
      }
  });
  if (!charts.length) return null;
  // shelves, tallest first. The finest density that fits
  charts.sort((p, q) => q.h - p.h || q.w - p.w || p.u0 - q.u0 || p.v0 - q.v0);
  let area = 0;
  for (const ch of charts) area += ch.w * ch.h;
  let texel = Math.sqrt(area) / FAR_ATLAS;
  while (!place(charts, texel)) texel *= 1.015;
  // one mesh of all the triangles, each with its own vertices
  let tris = 0;
  for (const ch of charts) tris += ch.tris.length;
  const names = Object.keys(chunks[0].attributes);
  const out: Record<string, Float32Array> = {};
  for (const name of names) out[name] = new Float32Array(tris * 3 * chunks[0].getAttribute(name).itemSize);
  const atlas = new Float32Array(tris * 3 * 2);
  let v = 0;
  for (const ch of charts)
    for (const [gi, t] of ch.tris) {
      const g = chunks[gi];
      const idx = g.index!.array;
      const P = g.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < 3; k++, v++) {
        const i = idx[t + k];
        for (const name of names) {
          const A = g.getAttribute(name);
          const src = A.array,
            sz = A.itemSize;
          for (let j = 0; j < sz; j++) out[name][v * sz + j] = src[i * sz + j];
        }
        a.fromBufferAttribute(P, i);
        atlas[v * 2] = (ch.x + (a.dot(ch.tx) - ch.u0) / texel) / FAR_ATLAS;
        atlas[v * 2 + 1] = (ch.y + (a.dot(ch.ty) - ch.v0) / texel) / FAR_ATLAS;
      }
    }
  const geometry = new THREE.BufferGeometry();
  for (const name of names) geometry.setAttribute(name, new THREE.BufferAttribute(out[name], chunks[0].getAttribute(name).itemSize));
  geometry.setAttribute('aAtlas', new THREE.BufferAttribute(atlas, 2));
  return { geometry, texel };
}

/** the hash of what the atlas depends on: the shader's text and the walls */
export function farBakeKey(text: string, geo: THREE.BufferGeometry): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193);
  };
  for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
  for (const name of ['position', 'aA', 'aB', 'aC', 'aAtlas', 'color']) {
    const A = geo.getAttribute(name).array;
    for (let i = 0; i < A.length; i += 7) mix(A[i] * 1024);
  }
  return (h >>> 0).toString(36);
}

/** the collapse in the far program's vertex shader */
export const FAR_VERT_PARS = /* glsl */ `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aD;
attribute vec4 aFarC;
attribute vec2 aAtlas;
uniform float uFarD;
varying vec2 vFac;
varying vec2 vAtlas;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
varying vec3 vWPos;
varying vec3 vWNrm;
`;

export const FAR_VERT_MAIN = /* glsl */ `
vFac = uv;
vAtlas = aAtlas;
vB = aB;
vC = aC;
vD = aD;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);
if (uFarD <= 0.0 || distance(cameraPosition, aFarC.xyz) - aFarC.w <= uFarD) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`;

/** the same choice, the other way round, for the near shell's vertex shader */
export const NEAR_VERT_PARS = /* glsl */ `
attribute vec4 aFarC;
uniform float uFarD;
`;

export const NEAR_VERT_MAIN = /* glsl */ `
if (uFarD > 0.0 && distance(cameraPosition, aFarC.xyz) - aFarC.w > uFarD) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`;

/** declarations of the far program (needs bhEnv and the hashes before main) */
export const FAR_FRAG_PARS = /* glsl */ `
varying vec2 vFac;
varying vec2 vAtlas;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
varying vec3 vWPos;
varying vec3 vWNrm;
uniform sampler2D tFF0;
uniform sampler2D tFF1;
uniform sampler2D tFF2;
uniform sampler2D uBhNoise;
uniform vec3 uSkyGlow;
uniform vec3 uSunCol;
uniform vec3 uCityCol;
uniform vec3 uCloudCol;
uniform float uReflLift;
uniform float uMirror;
uniform vec3 uSunDir;
`;

/** the live part, a shortened copy of materials.ts bhWall: every term there that depends on the hour or the camera */
export const FAR_FRAG_MAIN = /* glsl */ `
float ffRough, ffMetal;
vec3 ffEmit = vec3(0.0);
vec4 diffuseColor = vec4(texture2D(tFF0, vAtlas).rgb, opacity);
{
  vec3 ffE = texture2D(tFF1, vAtlas).rgb;
  vec3 ffM = texture2D(tFF2, vAtlas).rgb;
  ffRough = ffM.r;
  ffMetal = ffM.b;
  vec3 N = normalize(vWNrm);
  vec3 V = normalize(vWPos - cameraPosition);
  vec3 R0 = reflect(V, N);
  float fR = fwidth(R0.y);
  float lodC = clamp(log2(max(fwidth(R0.x) + fwidth(R0.z), 1e-5) * 256.0 * 0.4), 0.0, 8.0);
  float kind = floor(vB.w + 0.5);
  float style = floor(mod(kind, 64.0) / 8.0 + 0.01);
  float prof = floor(mod(kind, 8.0) + 0.01);
  float seed = floor(vB.z + 0.5);
  bool curtain = style > 1.5 && style < 2.5;
  bool ribbon = style > 2.5 && style < 3.5;
  float y = vWPos.y;
  int glassIdx = int(mod(floor((vC.w + 0.01) / 8.0), 8.0));
  vec3 gt = uGlassCols[glassIdx];
  float nightF = clamp(uLights * (0.42 + 0.58 * uNight), 0.0, 1.0);
  float info = step(0.5, vD.w);
  float crown = (curtain || ribbon) && prof > 0.5 && prof < 1.5 ? info * step(44.0, vD.z) * smoothstep(vD.z - 11.0, vD.z - 0.6, y) * nightF : 0.0;
  vec2 cell = floor(vFac);
  if (vB.x > 0.5 && vB.y > 0.5 && cell.x >= 0.0 && cell.y >= 0.0 && cell.x < vB.x && cell.y < vB.y) {
    vec2 f = vFac - cell;
    float r1 = bhHash13(vec3(cell, seed));
    float r2 = bhHash13(vec3(cell.yx + 17.0, seed * 1.37 + 5.0));
    float r3 = bhHash13(vec3(cell + 3.1, seed * 0.71 + 9.0));
    bool office = prof > 0.5 && prof < 1.5;
    vec2 unit = office ? vec2(floor(cell.x / 4.0), cell.y) : cell;
    float u1 = bhHash13(vec3(unit, seed + 2.0));
    float u2 = bhHash13(vec3(unit.yx + 7.0, seed + 4.0));
    float lit = step(u1, bhOccupancy(mod(uHours + (u2 - 0.5) * 1.6 + 24.0, 24.0), prof));
    if (office) lit *= step(r3, 0.9);
    float glow = mix(office ? 0.35 : 0.07, 2.7, nightF) / 2.7;
    vec3 T = vec3(N.z, 0.0, -N.x);
    float tl = length(T);
    T = tl > 1e-3 ? T / tl : vec3(1.0, 0.0, 0.0);
    float wob = curtain ? 1.0 : (ribbon ? 0.7 : 1.3);
    vec3 Np = normalize(N + (T * ((r1 - 0.5) * 0.04 + (f.x - 0.5) * 0.03) + vec3(0.0, (r2 - 0.5) * 0.03 + (f.y - 0.5) * 0.025, 0.0)) * wob);
    vec3 R = reflect(V, Np);
    vec3 env = bhEnv(R, y, seed, fR, lodC, nightF);
    vec2 sh = normalize(uSunDir.xz + vec2(1e-5, 0.0));
    float hAl = dot(normalize(R.xz + vec2(1e-5, 0.0)), sh);
    float vAl = 1.0 - smoothstep(0.05, 0.7, abs(R.y + uReflLift - uSunDir.y));
    float glint = smoothstep(0.972, 0.9985, hAl) * (0.25 + 0.75 * vAl) * (curtain ? 1.6 : (ribbon ? 1.1 : 0.7));
    float cosv = clamp(-dot(V, Np), 0.0, 1.0);
    float F0 = curtain ? mix(0.26, 0.32, uMirror) : (ribbon ? mix(0.2, 0.24, uMirror) : 0.1);
    float F = F0 + (1.0 - F0) * pow(1.0 - cosv, 5.0);
    float tintAmt = curtain ? mix(0.72, 0.42, uMirror) : (ribbon ? mix(0.5, 0.36, uMirror) : 0.2);
    vec3 gtN = gt / max(dot(gt, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    float envL = dot(env, vec3(0.2126, 0.7152, 0.0722));
    vec3 refl = mix(env, envL * gtN, tintAmt) * (curtain ? mix(0.8, 0.92, uMirror) : 1.0) + uSunCol * glint;
    ffEmit = refl * (F / F0) * ffM.g + ffE * 4.0 * lit * glow;
    ffEmit += gt * crown * 0.55 * step(0.01, ffM.g);
  }
  ffEmit += diffuseColor.rgb * crown * vec3(0.55, 0.62, 0.75) * (1.0 - step(0.01, ffM.g));
  ffEmit = min(ffEmit, vec3(16.0));
}
`;

/** the end of the bake's fragment main: what this pass of the atlas wants */
export const FAR_BAKE_OUT = /* glsl */ `
if (uBakePass < 0.5) { gl_FragColor = vec4(diffuseColor.rgb, 1.0); return; }
if (uBakePass < 1.5) { gl_FragColor = vec4(min(bhEmit * 0.25, vec3(1.0)), 1.0); return; }
gl_FragColor = vec4(bhRough < 0.0 ? roughness : bhRough, clamp(dot(bhEmit, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), max(bhMetal, 0.0), 1.0);
return;
`;
