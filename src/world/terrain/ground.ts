// Ground heightfield mesh (bands + zippers) and its painted-diorama shader:
// grass with mottling / mowing stripes, wild flower meadows on the hills, sand + wet sand,
// rock on steep slopes, sandy -> muddy beds under water with animated caustics.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB } from '../../core/constants';
import { PALETTE } from '../../core/gfx';
import type { TerrainModel } from './height';
import { GROUND_DROP } from './height';
import { groundBands, slabEdges, type Band, type SlabEdges } from './layout';
import { noiseTexture } from './noise';

export interface GroundResult {
  mesh: THREE.Mesh;
  edges: SlabEdges;
  bands: Band[];
  triangles: number;
  vertices: number;
  mask: THREE.CanvasTexture;
}

function slopePick(m: number, c: number, p: number, e: number): number {
  const dm = (c - m) / e,
    dp = (p - c) / e;
  const big = 9;
  if (Math.abs(dm) > big && Math.abs(dp) <= big) return dp;
  if (Math.abs(dp) > big && Math.abs(dm) <= big) return dm;
  if (Math.abs(dp) > big && Math.abs(dm) > big) return 0;
  return (dm + dp) * 0.5;
}

export function buildGroundGeometry(model: TerrainModel): { geo: THREE.BufferGeometry; bands: Band[]; edges: SlabEdges } {
  const bands = groundBands(model);
  let nv = 0;
  for (const b of bands) nv += b.xs.length * b.zs.length;
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const H = model.height;
  const e = 0.06;
  let k = 0;
  const rowStart: number[][] = [];
  for (const b of bands) {
    const rs: number[] = [];
    for (const z of b.zs) {
      rs.push(k);
      for (const x of b.xs) {
        const h = H(x, z);
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const gx = slopePick(H(x - e, z), h, H(x + e, z), e);
        const gz = slopePick(H(x, z - e), h, H(x, z + e), e);
        const il = 1 / Math.hypot(gx, 1, gz);
        nor[k * 3] = -gx * il;
        nor[k * 3 + 1] = il;
        nor[k * 3 + 2] = -gz * il;
        k++;
      }
    }
    rowStart.push(rs);
  }
  const idx: number[] = [];
  const keep = (i0: number, i1: number, i2: number): boolean => {
    const cx = (pos[i0 * 3] + pos[i1 * 3] + pos[i2 * 3]) / 3;
    const cz = (pos[i0 * 3 + 2] + pos[i1 * 3 + 2] + pos[i2 * 3 + 2]) / 3;
    return !(cz < -130 && model.inPortalMouth(cx, cz));
  };
  const tri = (i0: number, i1: number, i2: number) => {
    if (keep(i0, i1, i2)) idx.push(i0, i1, i2);
  };
  bands.forEach((b, bi) => {
    const nx = b.xs.length;
    const rs = rowStart[bi];
    for (let r = 0; r < b.zs.length - 1; r++) {
      const r0 = rs[r],
        r1 = rs[r + 1];
      for (let c = 0; c < nx - 1; c++) {
        const a = r0 + c,
          bb = r0 + c + 1,
          cc = r1 + c + 1,
          d = r1 + c;
        // choose the diagonal that follows the surface better (less folding on slopes)
        const ha = pos[a * 3 + 1],
          hb = pos[bb * 3 + 1],
          hc = pos[cc * 3 + 1],
          hd = pos[d * 3 + 1];
        if (Math.abs(ha - hc) <= Math.abs(hb - hd)) {
          tri(a, cc, bb);
          tri(a, d, cc);
        } else {
          tri(a, d, bb);
          tri(bb, d, cc);
        }
      }
    }
    // zipper to the next band
    if (bi < bands.length - 1) {
      const nb = bands[bi + 1];
      const T = rs[rs.length - 1];
      const B = rowStart[bi + 1][0];
      const xa = b.xs,
        xb = nb.xs;
      let i = 0,
        j = 0;
      while (i < xa.length - 1 || j < xb.length - 1) {
        if (i < xa.length - 1 && (j === xb.length - 1 || xa[i + 1] <= xb[j + 1])) {
          tri(T + i, B + j, T + i + 1);
          i++;
        } else {
          tri(T + i, B + j, B + j + 1);
          j++;
        }
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, bands, edges: slabEdges(model, bands) };
}

// ───────────────────────────────────────────────────────────── mask ──

const MASK_W = 1024;

/**
 * Ground mask (canvas): R = sand, G = wildness (0 manicured lawn … 1 meadow), B = path wear.
 * Drawn with 2D canvas primitives; the shader domain-warps R/G for organic boundaries.
 */
function buildMask(ctx: CityContext): THREE.CanvasTexture {
  const { plan } = ctx;
  const W = MASK_W;
  const sx = W / (SLAB.x1 - SLAB.x0);
  const Hh = Math.round((SLAB.z1 - SLAB.z0) * sx);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = Hh;
  const g = cv.getContext('2d')!;
  const X = (x: number) => (x - SLAB.x0) * sx;
  const Z = (z: number) => (z - SLAB.z0) * sx;
  g.fillStyle = 'rgb(0,30,0)';
  g.fillRect(0, 0, W, Hh);
  g.globalCompositeOperation = 'lighter';
  // ── wildness (green channel): hills, north strip, south bank meadow, verges
  const grad = g.createLinearGradient(0, Z(-166), 0, Z(-150));
  grad.addColorStop(0, 'rgb(0,225,0)');
  grad.addColorStop(1, 'rgb(0,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, Z(-150));
  g.fillStyle = 'rgb(0,60,0)';
  g.fillRect(0, Z(-150), W, Z(-137) - Z(-150));
  // spurs (fully wild)
  g.fillStyle = 'rgb(0,100,0)';
  g.fillRect(0, Z(-150), X(-181), Z(-137) - Z(-150));
  g.fillRect(X(111), Z(-150), X(SLAB.x1) - X(111), Z(-137) - Z(-150));
  // south bank: a meadowy lawn
  g.fillStyle = 'rgb(0,70,0)';
  g.fillRect(0, Z(127), X(117), Z(SLAB.z1) - Z(127));
  // west margin verge
  g.fillStyle = 'rgb(0,35,0)';
  g.fillRect(0, Z(-126), X(-172), Z(106) - Z(-126));
  // ── sand (red channel): beach east of the boardwalk + river mouth + south beach
  g.fillStyle = 'rgb(255,0,0)';
  g.beginPath();
  g.moveTo(X(118.2), Z(-6.5));
  g.lineTo(X(SLAB.x1), Z(-6.5));
  g.lineTo(X(SLAB.x1), Z(SLAB.z1));
  g.lineTo(X(117.6), Z(SLAB.z1));
  g.lineTo(X(118.4), Z(138));
  g.lineTo(X(117.4), Z(127));
  g.lineTo(X(119.5), Z(126.4));
  g.lineTo(X(119.5), Z(109.6));
  g.lineTo(X(117.8), Z(108));
  g.closePath();
  g.fill();
  // sea floor everywhere east of the quay (under water)
  g.fillRect(X(135.6), 0, X(SLAB.x1) - X(135.6), Z(-6.5));
  // ── path wear (blue channel), blurred
  g.filter = 'blur(1.5px)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of plan.paths) {
    if (!p.draw) continue;
    g.strokeStyle = p.surface === 'paving' ? 'rgb(0,0,110)' : 'rgb(0,0,190)';
    g.lineWidth = (p.width + 1.1) * sx;
    g.beginPath();
    p.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z))));
    g.stroke();
  }
  // dirt patches under benches, picnic tables and around the playground
  for (const b of plan.benches) {
    g.fillStyle = 'rgb(0,0,120)';
    g.beginPath();
    g.arc(X(b.x), Z(b.z), 1.4 * sx, 0, Math.PI * 2);
    g.fill();
  }
  for (const f of plan.features) {
    if (f.kind === 'picnic' || f.kind === 'bandstand' || f.kind === 'gazebo') {
      g.fillStyle = 'rgb(0,0,90)';
      g.beginPath();
      g.arc(X(f.x), Z(f.z), (f.radius + 1.6) * sx, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; // canvas row 0 = north edge (v = 0)
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// ───────────────────────────────────────────────────────── material ──

const GROUND_PARS = /* glsl */ `
uniform sampler2D tNoise;
uniform sampler2D tMask;
uniform vec4 uSlabXf;
uniform vec4 uPondXf;
uniform vec4 uStripe;
uniform float uTime;
uniform float uDaylight;
uniform vec3 gGrassA;
uniform vec3 gGrassB;
uniform vec3 gLawn;
uniform vec3 gMeadowA;
uniform vec3 gMeadowB;
uniform vec3 gDry;
uniform vec3 gFlowerA;
uniform vec3 gFlowerB;
uniform vec3 gFlowerC;
uniform vec3 gSoil;
uniform vec3 gSand;
uniform vec3 gSandWet;
uniform vec3 gRockA;
uniform vec3 gRockB;
uniform vec3 gBedA;
uniform vec3 gBedB;
uniform vec3 gMud;
varying vec3 vGW;
varying vec3 vGN;
float gRough = 0.95;

vec3 groundColor() {
  vec3 p = vGW;
  vec3 n = normalize(vGN);
  vec4 nA = texture2D(tNoise, p.xz * 0.0104);
  vec4 nB = texture2D(tNoise, p.xz * 0.111);
  vec4 nC = texture2D(tNoise, p.xz * 0.77);
  vec2 muv = (p.xz - uSlabXf.xy) * uSlabXf.zw;
  vec2 warp = ((nA.zw - 0.5) * 5.0 + (nB.xy - 0.5) * 0.9) * uSlabXf.zw;
  vec4 m = texture2D(tMask, muv + warp);
  float wear = texture2D(tMask, muv).b;
  float sand = smoothstep(0.25, 0.75, m.r);
  float wild = m.g;

  // grass: soft painted mottling + grain
  float mott = nA.g * 0.5 + nA.b * 0.3 + nB.r * 0.2;
  vec3 grass = mix(gGrassA, gGrassB, smoothstep(0.4, 0.85, mott) * 0.7);
  grass = mix(grass, gLawn, smoothstep(0.55, 0.85, nA.r) * 0.3);
  grass *= 0.94 + 0.12 * nC.r;
  // mowing stripes in the park
  vec2 sr = step(uStripe.xy, p.xz) * step(p.xz, uStripe.zw);
  float stp = fract(p.x * 0.125);
  grass *= 1.0 + sr.x * sr.y * (smoothstep(0.42, 0.5, stp) - smoothstep(0.92, 1.0, stp) - 0.5) * 0.08;
  // wild meadow: richer variation, dry patches and flower speckles
  vec3 meadow = mix(gMeadowB, gMeadowA, smoothstep(0.25, 0.75, nA.g * 0.6 + nB.r * 0.4));
  meadow = mix(meadow, gDry, smoothstep(0.58, 0.85, nA.r * 0.6 + nB.g * 0.4) * 0.55);
  meadow *= 0.88 + 0.24 * nC.g;
  float fl = smoothstep(0.78, 0.84, nC.b) * smoothstep(0.42, 0.66, nB.a) * smoothstep(0.3, 0.62, nA.a);
  vec3 flc = nB.b > 0.62 ? gFlowerC : (nB.b > 0.4 ? gFlowerA : gFlowerB);
  meadow = mix(meadow, flc, fl * 0.9);
  grass = mix(grass, meadow, wild);
  grass = mix(grass, gSoil, smoothstep(0.08, 0.85, wear) * 0.55);

  // local water level (pond vs sea/river)
  vec2 pe = (p.xz - uPondXf.xy) * uPondXf.zw;
  float inPond = 1.0 - step(1.5, dot(pe, pe));
  float wl = mix(-1.6, -0.3, inPond);
  float above = p.y - wl;

  // sand + wet sand at the waterline
  vec3 sandC = gSand * (0.93 + 0.12 * nC.r) * (0.95 + 0.1 * nB.b);
  float wet = 1.0 - smoothstep(0.04, 0.5 + 0.25 * nB.r, above);
  sandC = mix(sandC, gSandWet, wet * 0.92);
  vec3 col = mix(grass, sandC, sand);
  // damp earth right at grassy waterlines (pond, banks)
  col = mix(col, gMud, (1.0 - smoothstep(0.02, 0.2, above)) * (1.0 - sand) * 0.75);

  // rock on steep slopes, with faint strata
  float slope = 1.0 - n.y;
  float rockAmt = smoothstep(0.26, 0.5, slope + (nB.r - 0.5) * 0.22);
  vec3 rock = mix(gRockB, gRockA, smoothstep(0.25, 0.75, nB.g * 0.55 + nA.b * 0.45));
  float strata = smoothstep(0.3, 0.7, fract(p.y * 0.62 + nA.r * 2.2 + nB.a * 0.25));
  rock *= 0.84 + 0.24 * strata;
  float crack = 1.0 - smoothstep(0.0, 0.035, abs(nB.r - 0.5));
  rock *= (1.0 - 0.3 * crack) * (0.9 + 0.18 * nC.a);
  // earthy sections and darker gullies break up the long escarpment
  rock = mix(rock, gSoil * 0.95, smoothstep(0.55, 0.8, nA.g) * 0.55);
  rock *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.12, abs(fract(p.x * 0.11 + nB.r * 0.6 + nA.b) - 0.5)));
  // a little moss on the gentler rock ledges
  rock = mix(rock, gMeadowB, smoothstep(0.55, 0.3, slope) * 0.35);
  col = mix(col, rock, rockAmt);

  // submerged beds: sandy shallows -> darker silt, animated caustics
  float depth = -above;
  if (depth > 0.0) {
    vec3 bed = mix(gBedA, gBedB, smoothstep(0.2, 6.0, depth));
    bed = mix(bed, gMud, inPond * 0.75);
    bed *= 0.9 + 0.16 * nB.b;
    vec2 cp = p.xz * 0.23;
    float c1 = texture2D(tNoise, cp + vec2(uTime * 0.011, uTime * 0.007)).g;
    float c2 = texture2D(tNoise, cp * 1.37 + vec2(-uTime * 0.009, uTime * 0.012)).g;
    float caus = 1.0 - smoothstep(0.0, 0.07, abs(c1 - c2));
    caus *= smoothstep(0.05, 0.45, depth) * (1.0 - smoothstep(0.8, 3.8, depth)) * uDaylight * (1.0 - inPond * 0.6);
    bed += vec3(0.85, 1.0, 0.95) * caus * 0.3;
    col = mix(col, bed, smoothstep(0.0, 0.3, depth));
  }
  gRough = mix(0.96, 0.72, wet * sand);
#ifdef TH_DEBUG
  return TH_DEBUG;
#endif
  return col;
}
`;

export function createGround(ctx: CityContext, model: TerrainModel): GroundResult {
  const { geo, bands, edges } = buildGroundGeometry(model);
  const mask = buildMask(ctx);
  const pond = model.pond;
  const park = ctx.plan.blocks.find((b) => b.kind === 'park');
  const C = (h: string) => ({ value: new THREE.Color(h) });
  const uniforms = {
    tNoise: { value: noiseTexture() },
    tMask: { value: mask },
    uSlabXf: { value: new THREE.Vector4(SLAB.x0, SLAB.z0, 1 / (SLAB.x1 - SLAB.x0), 1 / (SLAB.z1 - SLAB.z0)) },
    uPondXf: { value: pond ? new THREE.Vector4(pond.cx, pond.cz, 1 / pond.rx, 1 / pond.rz) : new THREE.Vector4(0, 0, 1e-4, 1e-4) },
    uStripe: { value: park ? new THREE.Vector4(park.rect.x0, park.rect.z0, park.rect.x1, park.rect.z1) : new THREE.Vector4(0, 0, -1, -1) },
    uTime: ctx.uniforms.uTime,
    uDaylight: ctx.uniforms.uDaylight,
    gGrassA: C(PALETTE.grass),
    gGrassB: C(PALETTE.grassDark),
    gLawn: C(PALETTE.lawn),
    gMeadowA: C('#aac663'),
    gMeadowB: C('#6c9a44'),
    gDry: C('#c9bd78'),
    gFlowerA: C('#f6f1e2'),
    gFlowerB: C('#f2cf48'),
    gFlowerC: C('#d98fc0'),
    gSoil: C('#8d7655'),
    gSand: C(PALETTE.sand),
    gSandWet: C('#c4af7e'),
    gRockA: C('#a89a86'),
    gRockB: C('#7a7268'),
    gBedA: C('#d3bf8e'),
    gBedB: C('#6b6a58'),
    gMud: C('#6a5c42'),
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 2;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_PARS)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( groundColor(), opacity );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;');
  };
  const dbg = ctx.debug.enabled ? ctx.debug.params.get('tdebug') : null;
  if (dbg) mat.defines = { TH_DEBUG: dbg };
  mat.customProgramCacheKey = () => 'th-ground-v1' + (dbg ?? '');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain-ground';
  mesh.position.y = GROUND_DROP;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  const vertices = geo.attributes.position.count;
  const triangles = (geo.index?.count ?? 0) / 3;
  return { mesh, edges, bands, triangles, vertices, mask };
}
