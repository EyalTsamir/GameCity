// Baked land albedo (docs/progress/baking.md): the land shader's procedural surface evaluated once, top down, into two
// textures. The land's fragment cost is nearly all procedural (8.7 ms at the overview), a texture fetch next to nothing,
// and a separate small program beats a branch in the big one by 2 ms (measured).
//
//   land0  a square round the town at constant density
//   land1  everything else (46 km): log warp, coarser with distance, coarser still along the radius than across it,
//          because land is seen at grazing angles from the town
//
// The mesh is cut into tiles. A tile draws from the bake (far program) only when every pixel of it gets at most LAND_SOFT
// screen pixels per texel from this camera; the others keep the procedural shader (near program), which melts into the
// bake per pixel. So baked land is never soft, whatever the camera does: only the frame time changes. Wind stays live:
// the gust is evaluated per vertex.

import * as THREE from 'three';
import { SLAB } from '../../core/constants';
import { WIND_GLSL } from '../../core/wind';
import { LAND_FRAG_PARS, LAND_VERT_PARS } from './shader';
import type { Cover } from './model';

/** warp centre: the middle of the slab */
const CX0 = (SLAB.x0 + SLAB.x1) / 2,
  CZ0 = (SLAB.z0 + SLAB.z1) / 2;
/** half size (m) of the square of land0 */
const H0 = 1400;
/** land1: linear up to R1 (where land0 takes over anyway), logarithmic to RMAX; rho = 0..1 is the distance from its centre */
const R1 = 1320;
const RHO1 = 0.6;
const RMAX = 46000;
const LOG_K = (1 - RHO1) / Math.log(RMAX / R1);
/** both textures are this size */
export const LAND_BAKE_SIZE = 4096;
/**
 * How many screen pixels one texel may cover, beyond the camera's foreground. In the foreground, where the eye rests and
 * nothing hides softness, a little over half of that (LAND_NEAR_K): the haze and the distance take care of the rest.
 */
export const LAND_SOFT = 4;
const LAND_NEAR_K = 0.55;
const LAND_NEAR_D = [700, 1500] as const;
/** GLSL float: the limit at a distance d, with `soft` substituted */
export const landSoftGlsl = (soft: number, d: string) => `(${f(soft)} * mix(${f(LAND_NEAR_K)}, 1.0, smoothstep(${f(LAND_NEAR_D[0])}, ${f(LAND_NEAR_D[1])}, ${d})))`;
function softAt(soft: number, d: number): number {
  const t = Math.min(1, Math.max(0, (d - LAND_NEAR_D[0]) / (LAND_NEAR_D[1] - LAND_NEAR_D[0])));
  return soft * (LAND_NEAR_K + (1 - LAND_NEAR_K) * t * t * (3 - 2 * t));
}

const f = (v: number) => v.toFixed(6);

const POLAR = /* glsl */ `
    float r = length(d) + 1e-3;
    float rho = r < ${f(R1)} ? r * ${f(RHO1 / R1)} : ${f(RHO1)} + ${f(LOG_K)} * log(r / ${f(R1)});
    // (the radial and tangential scales differ: the gradient of the warped coordinate, by the chain rule in polar form)
    vec2 e = d / r;
    float kt = 0.5 * rho / r;
    float kr = 0.5 * (r < ${f(R1)} ? ${f(RHO1 / R1)} : ${f(LOG_K)} / r);
    vec2 gx = e * dot(e, dx) * kr + (dx - e * dot(e, dx)) * kt;
    vec2 gy = e * dot(e, dy) * kr + (dy - e * dot(e, dy)) * kt;`;

/** GLSL: the baked albedo at a world position (needs tLB0, tLB1 and the world derivatives of xz) */
export const LAND_BAKE_GLSL = /* glsl */ `
uniform sampler2D tLB0;
uniform sampler2D tLB1;
vec3 landBake(vec2 xz, vec2 dx, vec2 dy) {
  vec2 d = xz - vec2(${f(CX0)}, ${f(CZ0)});
  float m = max(abs(d.x), abs(d.y));
  vec3 c0 = vec3(0.0), c1 = vec3(0.0);
  float k = smoothstep(${f(H0 - 70)}, ${f(H0 - 8)}, m);
  if (k < 1.0) c0 = textureGrad(tLB0, 0.5 + d * ${f(0.5 / H0)}, dx * ${f(0.5 / H0)}, dy * ${f(0.5 / H0)}).rgb;
  if (k > 0.0) {
    ${POLAR}
    c1 = textureGrad(tLB1, 0.5 + e * rho * 0.5, gx, gy).rgb;
  }
  return mix(c0, c1, k);
}
/** texels per screen pixel along the worse screen axis */
float landBakeDensity(vec2 xz, vec2 dx, vec2 dy) {
  vec2 d = xz - vec2(${f(CX0)}, ${f(CZ0)});
  if (max(abs(d.x), abs(d.y)) < ${f(H0 - 70)}) return min(length(dx), length(dy)) * ${f(LAND_BAKE_SIZE / (2 * H0))};
  ${POLAR}
  return min(length(gx), length(gy)) * ${f(LAND_BAKE_SIZE)};
}
`;

/** vertex part of the gust (needs aCov, vLW, thGust, uWind): on crops and grass, not on the woods, the sand or the rock */
export const LAND_GUST_VERT = /* glsl */ `
vLGust = thGust(vLW.xz) * clamp(length(uWind) * 1.3, 0.0, 1.0) * (1.0 - aCov.x) * (1.0 - aCov.z) * (1.0 - aCov.w) * step(-1.6, vLW.y);
`;

/** metres per texel of the bake at a distance r from the centre (a point inside land0's square, if `inner`) */
function texelAt(r: number, inner: boolean, out: { radial: number; tangent: number }): void {
  if (inner) {
    out.radial = out.tangent = (2 * H0) / LAND_BAKE_SIZE;
    return;
  }
  const lin = r < R1;
  const rho = lin ? (r * RHO1) / R1 : RHO1 + LOG_K * Math.log(r / R1);
  out.tangent = r / (rho * 0.5 * LAND_BAKE_SIZE);
  out.radial = 1 / ((lin ? RHO1 / R1 : LOG_K / r) * 0.5 * LAND_BAKE_SIZE);
}

/**
 * What the bake depends on: the shader's text and the land it is evaluated on (coarse samples of height and cover over the
 * world, independent of quality's mesh density). A stale file, or another ?seed, is then simply not used.
 */
export function landBakeKey(height: (x: number, z: number) => number, cover: (x: number, z: number) => Cover): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193);
  };
  const text = LAND_VERT_PARS + LAND_FRAG_PARS;
  for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
  const S = 48;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      // denser near the town: the same warp as the texture
      const a = (i / S) * Math.PI * 2,
        r = 240 * Math.exp((j / S) * 5);
      const x = CX0 + Math.cos(a) * r,
        z = CZ0 + Math.sin(a) * r;
      mix(height(x, z) * 100);
      const c = cover(x, z);
      mix((c.sand + 2 * c.rock + 4 * c.forest + 8 * c.field + 16 * c.meadow) * 100);
    }
  return (h >>> 0).toString(36);
}

export interface LandBakeSource {
  geometry: THREE.BufferGeometry;
  /** y offset of the mesh */
  y: number;
}

/**
 * Evaluate the land shader's albedo into one of the two RGBA8 sRGB targets (the program runs once per texel).
 * The bake build reads it back (scripts/bake.mjs); ?landbake=rt samples it directly (no files, for development).
 */
export function renderLandBake(renderer: THREE.WebGLRenderer, sources: LandBakeSource[], uniforms: Record<string, THREE.IUniform>, which: 0 | 1, size = LAND_BAKE_SIZE): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: true,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    anisotropy: 8,
  });
  // the wind, the blade rings and the caustics stay live: a bake without them (shared uniform objects are shadowed here)
  const u: Record<string, THREE.IUniform> = {
    ...uniforms,
    uWind: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uNight: { value: 1 },
    uBladeFade: { value: new THREE.Vector2(-3, -2) },
    uBakeSize: { value: size },
    uBakeY: { value: 0 },
  };
  const toUV =
    which === 0
      ? `vec2 d = position.xz - vec2(${f(CX0)}, ${f(CZ0)}); vec2 uv = 0.5 + d * ${f(0.5 / H0)};`
      : `vec2 d = position.xz - vec2(${f(CX0)}, ${f(CZ0)}); float r = length(d) + 1e-3; float rho = r < ${f(R1)} ? r * ${f(RHO1 / R1)} : ${f(RHO1)} + ${f(LOG_K)} * log(r / ${f(R1)}); vec2 uv = 0.5 + d / r * rho * 0.5;`;
  const toXZ =
    which === 0
      ? `vec2 lbXZ(vec2 uv) { return vec2(${f(CX0)}, ${f(CZ0)}) + (uv - 0.5) * ${f(2 * H0)}; }`
      : `vec2 lbXZ(vec2 uv) {
  vec2 q = (uv - 0.5) * 2.0;
  float rho = length(q) + 1e-7;
  float r = rho < ${f(RHO1)} ? rho * ${f(R1 / RHO1)} : ${f(R1)} * exp((rho - ${f(RHO1)}) / ${f(LOG_K)});
  return vec2(${f(CX0)}, ${f(CZ0)}) + q / rho * r;
}`;
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
${LAND_VERT_PARS}
uniform float uBakeY;
void main() {
  vLW = position + vec3(0.0, uBakeY, 0.0);
  vLN = normalize(normal);
  vCov = aCov;
  vCov2 = aCov2;
  vCov3 = aCov3;
  ${toUV}
  gl_Position = vec4(uv * 2.0 - 1.0, clamp(-position.y / 4000.0, -1.0, 1.0), 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform float uBakeSize;
${toXZ}
${LAND_FRAG_PARS.replace('vec3 p = vLW;', 'vec3 p = vec3(0.0, vLW.y, 0.0); p.xz = lbXZ(gl_FragCoord.xy / uBakeSize);')}
void main() {
  // (the mesh's skirt under the slab: nobody sees it, and a filter must not fetch it. scripts/bake.mjs fills the hole)
  vec2 lbQ = lbXZ(gl_FragCoord.xy / uBakeSize);
  if (lbQ.x > ${f(SLAB.x0)} && lbQ.x < ${f(SLAB.x1)} && lbQ.y > ${f(SLAB.z0)} && lbQ.y < ${f(SLAB.z1)}) discard;
  gl_FragColor = vec4(landAlbedo(), 1.0);
}`,
  });
  const scene = new THREE.Scene();
  const cam = new THREE.Camera();
  for (const s of sources) {
    const m = new THREE.Mesh(s.geometry, mat);
    m.frustumCulled = false;
    m.onBeforeRender = () => {
      u.uBakeY.value = s.y;
      mat.uniformsNeedUpdate = true;
    };
    scene.add(m);
  }
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevA = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevA);
  renderer.shadowMap.autoUpdate = prevShadow;
  mat.dispose();
  return rt;
}

const FAR_VERT = /* glsl */ `
attribute vec4 aCov;
attribute vec4 aCov3;
varying vec3 vLW;
varying float vLGust;
varying float vLMoon;
uniform float uTime;
uniform vec2 uWind;
${WIND_GLSL}
`;

/** the far land: the bake, the live gust per vertex, three's lighting + atmosphere */
export function landFarMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean, textures: { tLB0: THREE.IUniform; tLB1: THREE.IUniform }, moon: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, fog });
  mat.name = 'land-far';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, textures);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FAR_VERT}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLW = (modelMatrix * vec4(transformed, 1.0)).xyz;
${LAND_GUST_VERT}
vLMoon = aCov3.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLW;
varying float vLGust;
varying float vLMoon;
uniform float uNight;
${LAND_BAKE_GLSL}`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 lbA = landBake(vLW.xz, dFdx(vLW.xz), dFdy(vLW.xz));
lbA = mix(lbA, lbA * vec3(1.14, 1.12, 1.0), vLGust * 0.6);
vec4 diffuseColor = vec4(lbA, opacity);`,
      )
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${moon}`);
  };
  mat.customProgramCacheKey = () => 'th-land-far-v2';
  return mat;
}

// ── the tile switch

const BANDS = [0, 150, 300, 500, 800, 1100, 1500, 2000, 3000, 4500, 7000, 10000, 15000, 25000, Infinity];
const SECTORS = 32;

/** the blend program (shader.ts) is all bake up to this many times the far limit, all procedural from the second */
export const LAND_BLEND = [1.05, 1.35] as const;

const tileV = new THREE.Vector3();
const texel = { radial: 0, tangent: 0 };

interface LandTile {
  start: number;
  count: number;
  box: THREE.Box3;
  /** the coarsest and finest texels in it */
  radial: number;
  tangent: number;
  radial0: number;
  tangent0: number;
  /** 0 procedural, 1 blend, 2 far */
  side: number;
}

/**
 * The land mesh's triangles, grouped by tile, in one index buffer that three draws share with the mesh's vertices:
 *   pure   no pixel of the tile can use the bake: the procedural program, exactly as without a bake
 *   blend  some can: the procedural program with the melt into the bake (costs about 1 ms more per screen of it)
 *   far    all can: the bake's small program
 * When a tile changes sides after a camera move, the buffer is sorted again.
 */
export class LandTiles {
  readonly pure: THREE.BufferGeometry;
  readonly blend: THREE.BufferGeometry;
  readonly far: THREE.BufferGeometry;
  private readonly tiles: LandTile[] = [];
  private readonly order: Uint32Array;
  private readonly index: THREE.BufferAttribute;
  private lastX = 1e12;
  private lastY = 1e12;
  private lastZ = 1e12;
  private lastPx = 0;
  /** tiles on the far program right now */
  farCount = 0;
  enabled = false;

  constructor(geo: THREE.BufferGeometry, yOffset: number) {
    const idx = geo.index!.array;
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    const lists = new Map<number, number[]>();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t],
        b = idx[t + 1],
        c = idx[t + 2];
      const x = (P.getX(a) + P.getX(b) + P.getX(c)) / 3,
        z = (P.getZ(a) + P.getZ(b) + P.getZ(c)) / 3;
      const dx = x - CX0,
        dz = z - CZ0;
      const r = Math.hypot(dx, dz);
      let band = 0;
      while (r >= BANDS[band + 1]) band++;
      const sec = Math.min(SECTORS - 1, Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * SECTORS));
      const key = band * SECTORS + sec;
      let l = lists.get(key);
      if (!l) lists.set(key, (l = []));
      l.push(a, b, c);
    }
    this.order = new Uint32Array(idx.length);
    let n = 0;
    for (const l of lists.values()) {
      const box = new THREE.Box3();
      let radial = 0,
        tangent = 0,
        radial0 = 1e9,
        tangent0 = 1e9;
      for (const w of l) {
        tileV.fromBufferAttribute(P, w);
        tileV.y += yOffset;
        box.expandByPoint(tileV);
        const dx = tileV.x - CX0,
          dz = tileV.z - CZ0;
        texelAt(Math.hypot(dx, dz), Math.max(Math.abs(dx), Math.abs(dz)) < H0 - 70, texel);
        radial = Math.max(radial, texel.radial);
        tangent = Math.max(tangent, texel.tangent);
        radial0 = Math.min(radial0, texel.radial);
        tangent0 = Math.min(tangent0, texel.tangent);
      }
      this.tiles.push({ start: n, count: l.length, box, radial, tangent, radial0, tangent0, side: 0 });
      this.order.set(l, n);
      n += l.length;
    }
    this.index = new THREE.BufferAttribute(this.order.slice(), 1);
    const mk = () => {
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.getAttribute(name));
      g.setIndex(this.index);
      g.boundingSphere = geo.boundingSphere?.clone() ?? null;
      g.boundingBox = geo.boundingBox?.clone() ?? null;
      return g;
    };
    this.pure = mk();
    this.blend = mk();
    this.far = mk();
    this.blend.setDrawRange(0, 0);
    this.far.setDrawRange(0, 0);
  }

  /** returns true when tiles changed sides. pxAt1m: screen pixels per metre at 1 m distance */
  update(cam: THREE.Vector3, pxAt1m: number, soft: number): boolean {
    if (!this.enabled) return false;
    if (Math.abs(cam.x - this.lastX) + Math.abs(cam.y - this.lastY) + Math.abs(cam.z - this.lastZ) < 6 && pxAt1m === this.lastPx) return false;
    this.lastX = cam.x;
    this.lastY = cam.y;
    this.lastZ = cam.z;
    this.lastPx = pxAt1m;
    let changed = false;
    for (const t of this.tiles) {
      // the worst pixel of the tile is about its nearest point. A texel seen from a distance d covers
      // texel * sin(angle to the ray) * pxAt1m / d pixels: radial texels are long, and only harmless where seen end-on
      t.box.clampPoint(cam, tileV);
      const vx = tileV.x - cam.x,
        vy = tileV.y - cam.y,
        vz = tileV.z - cam.z;
      const d = Math.max(0.01, Math.hypot(vx, vy, vz));
      const ex = (t.box.min.x + t.box.max.x) / 2 - CX0,
        ez = (t.box.min.z + t.box.max.z) / 2 - CZ0;
      const el = Math.max(1e-3, Math.hypot(ex, ez));
      const along = (vx * ex + vz * ez) / (el * d);
      const across = (vz * ex - vx * ez) / (el * d);
      const sr = Math.sqrt(Math.max(0, 1 - along * along));
      const st = Math.sqrt(Math.max(0, 1 - across * across));
      const worst = (Math.max(t.radial * sr, t.tangent * st) * pxAt1m) / d;
      // the best pixel: the finest texel at the farthest corner
      const fx = Math.max(Math.abs(t.box.min.x - cam.x), Math.abs(t.box.max.x - cam.x)),
        fy = Math.max(Math.abs(t.box.min.y - cam.y), Math.abs(t.box.max.y - cam.y)),
        fz = Math.max(Math.abs(t.box.min.z - cam.z), Math.abs(t.box.max.z - cam.z));
      const df = Math.hypot(fx, fy, fz);
      const best = (Math.max(t.radial0 * sr, t.tangent0 * st) * pxAt1m) / df;
      const side = worst <= softAt(soft, d) ? 2 : best >= softAt(soft, df) * LAND_BLEND[1] ? 0 : 1;
      if (side !== t.side) {
        t.side = side;
        changed = true;
      }
    }
    if (!changed) return false;
    const out = this.index.array as Uint32Array;
    let n = 0,
      nf = 0;
    const ranges = [this.pure, this.blend, this.far];
    for (let side = 0; side < 3; side++) {
      const from = n;
      for (const t of this.tiles) {
        if (t.side !== side) continue;
        out.set(this.order.subarray(t.start, t.start + t.count), n);
        n += t.count;
        if (side === 2) nf++;
      }
      ranges[side].setDrawRange(from, n - from);
    }
    this.index.needsUpdate = true;
    this.farCount = nf;
    return true;
  }
}
