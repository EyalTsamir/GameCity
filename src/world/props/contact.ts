// Ground contact for props: a darkened, blotchy grime band where furniture meets the paving / lawn
// (REAL.md "Contact (all)": 5–30 cm dirty band, nothing looks pasted on). One merged mesh of flat
// quads drawn with multiply blending after the opaque pass (depth test, no depth write), so it darkens
// whatever ground is below at any time of day without its own lighting. Fades out by 70 m.
//  • footprints are rounded rectangles (bins, posts: a circle = a square with full corner radius);
//    the band peaks at the footprint edge and fades `pad` metres outward; under the object a lighter
//    shade (the ground beneath a bench or a stall is dirtier than the open pavement).
//  • landmarks (park structures, market stalls) are built before props: they queue their footprints
//    with `queueContact(ctx, …)`; props builds the mesh from its own and the queued ones.
//  • ?nocontact disables it (and the low tier).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

export interface ContactSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** footprint half extents (local x / z) */
  hw: number;
  hd: number;
  /** corner radius (≤ min(hw, hd)) */
  r: number;
  /** band width outside the footprint (m) */
  pad: number;
  /** 0..1 darkness of the band */
  k: number;
}

const queues = new WeakMap<CityContext, ContactSpot[]>();

/** footprint of an object built by an earlier module (landmarks); consumed by props */
export function queueContact(ctx: CityContext, s: ContactSpot): void {
  let q = queues.get(ctx);
  if (!q) queues.set(ctx, (q = []));
  q.push(s);
}

export function takeQueuedContacts(ctx: CityContext): ContactSpot[] {
  const q = queues.get(ctx) ?? [];
  queues.delete(ctx);
  return q;
}

const VERT = /* glsl */ `
attribute vec4 aBox;   // hw, hd, r, pad
attribute float aK;
varying vec2 vL;
varying vec4 vBox;
varying float vK;
varying vec2 vW;
void main() {
  vL = uv;
  vBox = aBox;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz;
  float d = distance(cameraPosition, wp.xyz);
  vK = aK * (1.0 - smoothstep(45.0, 70.0, d));
  gl_Position = projectionMatrix * viewMatrix * wp;
  if (vK <= 0.0) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vL;
varying vec4 vBox;
varying float vK;
varying vec2 vW;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 q = abs(vL) - vBox.xy + vBox.z;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vBox.z;
  float pad = vBox.w;
  // blotchy edge: the band's reach wanders along the footprint
  float n = vn(vW * 3.1) * 0.65 + vn(vW * 9.0) * 0.35;
  float reach = pad * (0.75 + 0.6 * n);
  float out_ = 1.0 - smoothstep(0.0, reach, d);
  out_ = out_ * (0.6 + 0.4 * out_);
  float inside = d < 0.0 ? 0.6 + 0.4 * smoothstep(-0.15, 0.0, d) : 1.0;
  // grit: fine dark specks in the band
  float grit = step(0.8, h2(floor(vW * 60.0))) * 0.4;
  // gain 3.4: at 1.9 the band only darkened the paving by ~15 % and vanished in its texture (judge-1)
  float a = clamp(vK * out_ * inside * (0.8 + 0.6 * n) * 3.4 + vK * out_ * grit, 0.0, 0.72);
  // brownish grey grime (multiplied onto the ground colour)
  vec3 dirt = vec3(0.33, 0.3, 0.26);
  gl_FragColor = vec4(mix(vec3(1.0), dirt, a), 1.0);
}
`;

/** one mesh for all spots (null when there are none) */
export function buildContactMesh(spots: ContactSpot[]): THREE.Mesh | null {
  if (!spots.length) return null;
  const n = spots.length;
  const pos = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const box = new Float32Array(n * 16);
  const kk = new Float32Array(n * 4);
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    const ex = s.hw + s.pad * 1.35,
      ez = s.hd + s.pad * 1.35;
    const c = Math.cos(s.yaw),
      sn = Math.sin(s.yaw);
    const corners = [
      [-ex, -ez],
      [ex, -ez],
      [ex, ez],
      [-ex, ez],
    ];
    for (let j = 0; j < 4; j++) {
      const [lx, lz] = corners[j];
      const o = (i * 4 + j) * 3;
      pos[o] = s.x + lx * c + lz * sn;
      pos[o + 1] = s.y;
      pos[o + 2] = s.z - lx * sn + lz * c;
      uv[(i * 4 + j) * 2] = lx;
      uv[(i * 4 + j) * 2 + 1] = lz;
      box.set([s.hw, s.hd, Math.min(s.r, s.hw, s.hd), s.pad], (i * 4 + j) * 4);
      kk[i * 4 + j] = s.k;
    }
    idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aBox', new THREE.BufferAttribute(box, 4));
  geo.setAttribute('aK', new THREE.BufferAttribute(kk, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'props-contact';
  m.renderOrder = 1;
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = false;
  m.matrixAutoUpdate = false;
  return m;
}

/** queue a footprint given in an object frame (landmarks Env: `w` = local → world, `frameYaw`) */
export function queueContactLocal(
  env: { ctx: CityContext; w(lx: number, ly: number, lz: number): [number, number, number]; readonly frameYaw: number },
  lx: number,
  ly: number,
  lz: number,
  hw: number,
  hd: number,
  r: number,
  pad: number,
  k: number,
  yaw = 0,
): void {
  if (env.ctx.debug.params.has('nocontact') || env.ctx.quality.level === 'low') return;
  const [x, y, z] = env.w(lx, ly, lz);
  queueContact(env.ctx, { x, y: y + 0.012, z, yaw: env.frameYaw + yaw, hw, hd, r, pad, k });
}
