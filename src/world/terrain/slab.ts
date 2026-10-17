// The diorama base: soil cross-section on the four slab faces (procedural strata with
// roots and pebbles), the varnished wooden plinth with its brass nameplate, and the studio
// table it stands on (src/render/stage/table.ts: oak top fading into the cyclorama, analytic
// slab shadow + contact occlusion). ?legacylight shows the original blurred contact decal instead.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB, SLAB_BOTTOM, CITY_NAME } from '../../core/constants';
import type { Rng } from '../../core/rng';
import type { TerrainModel } from './height';
import { GROUND_DROP } from './height';
import type { EdgeProfile, SlabEdges } from './layout';
import { noiseTexture, GLSL_HASH } from './noise';
import { WATER_LEVEL } from '../../core/constants';
import { createStageUniforms, createTable, type StageService } from '../../render/stage/table';

export const PLINTH = {
  /** ledge width around the slab */
  ledge: 2.0,
  /** outer offset of the plinth face from the slab edge */
  out: 3.05,
  top: SLAB_BOTTOM,
  faceTop: SLAB_BOTTOM - 0.95,
  faceBottom: SLAB_BOTTOM - 5.4,
  bottom: SLAB_BOTTOM - 6.6,
} as const;

// ───────────────────────────────────────────────────────── soil faces ──

const STRATA_PARS = /* glsl */ `
uniform sampler2D tNoise;
uniform vec3 sGrass;
uniform vec3 sGrass2;
uniform vec3 sSoil;
uniform vec3 sSoil2;
uniform vec3 sRoot;
uniform vec3 sClay;
uniform vec3 sClay2;
uniform vec3 sSand;
uniform vec3 sSand2;
uniform vec3 sGravel;
uniform vec3 sStone;
uniform vec3 sStone2;
uniform vec3 sBed;
uniform vec3 sBed2;
uniform vec3 sSilt;
uniform vec3 sMud;
uniform vec3 sPeb1;
uniform vec3 sPeb2;
uniform vec3 sPeb3;
varying vec3 vSW;
varying float vTop;
varying float vSurf;
varying float vU;
${GLSL_HASH}

float th_pebbles(vec2 q, float density, out float shade, out float pid) {
  vec2 cell = floor(q);
  vec2 f = q - cell;
  float best = 9.0;
  float sh = 0.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      float h = th_hash12(c);
      if (h > density) continue;
      vec2 o = th_hash22(c) * 0.56 + 0.22;
      float r = 0.2 + 0.24 * th_hash12(c + 17.31);
      vec2 dv = f - (vec2(float(i), float(j)) + o);
      dv.y *= 1.5;
      float dd = length(dv) / r;
      if (dd < best) {
        best = dd;
        sh = dv.y / r;
        id = th_hash12(c + 3.7);
      }
    }
  }
  shade = sh;
  pid = id;
  return 1.0 - smoothstep(0.82, 1.0, best);
}

vec3 th_deep(float y, float bend, vec4 n1, vec4 n2, vec4 n3, vec4 n4, out float pebD) {
  float b2 = -3.2 + 0.62 * bend + 1.1 * (n1.g - 0.5);
  float b3 = -6.1 + 0.45 * bend + 1.2 * (n1.b - 0.5);
  float b4 = -8.6 + 0.32 * bend + 0.9 * (n2.g - 0.5);
  float b5 = -12.3 + 0.2 * bend + 1.0 * (n1.r - 0.5);
  vec3 col;
  if (y > b2) {
    col = mix(sClay, sClay2, smoothstep(0.3, 0.7, n3.r));
    col *= 0.94 + 0.08 * sin(y * 7.0 + n1.a * 9.0);
    pebD = 0.09;
  } else if (y > b3) {
    col = mix(sSand, sSand2, smoothstep(0.35, 0.65, n3.g));
    col *= 0.93 + 0.08 * sin(y * 23.0 + n2.b * 9.0);
    pebD = 0.06;
  } else if (y > b4) {
    col = sGravel * (0.9 + 0.2 * n4.r);
    pebD = 0.8;
  } else if (y > b5) {
    float band = smoothstep(0.42, 0.58, fract(y * 0.55 + n1.b * 0.9 + n3.r * 0.15));
    col = mix(sStone2, sStone, band);
    col *= 0.92 + 0.1 * n3.b;
    pebD = 0.0;
  } else {
    col = mix(sBed2, sBed, smoothstep(0.3, 0.7, n3.a));
    float crack = 1.0 - smoothstep(0.0, 0.035, abs(n3.g - 0.5));
    col *= 1.0 - crack * 0.35;
    pebD = 0.0;
  }
  // soft transition lines between layers
  float edge = min(min(abs(y - b2), abs(y - b3)), min(abs(y - b4), abs(y - b5)));
  col *= 0.86 + 0.14 * smoothstep(0.0, 0.07, edge);
  return col;
}

vec3 strataColor() {
  float y = vSW.y;
  float u = vU;
  float d = vTop - y;
  vec4 n1 = texture2D(tNoise, vec2(u * 0.011, 0.137));
  vec4 n2 = texture2D(tNoise, vec2(u * 0.047, 0.531));
  vec4 n3 = texture2D(tNoise, vec2(u, y * 1.4) * 0.27);
  vec4 n4 = texture2D(tNoise, vec2(u, y) * 1.9);
  float bend = max(vTop, 0.0);
  float land = 1.0 - step(1.5, vSurf);
  float beach = step(0.5, vSurf) * land;
  vec3 col = vec3(0.0);
  float pebD = 0.0;
  bool deep = true;
  float lip = 0.42 + 0.14 * (n2.a - 0.5) + 0.08 * (texture2D(tNoise, vec2(u * 2.3, 0.77)).b - 0.5);
  if (land > 0.5 && beach < 0.5) {
    float topsoil = 1.35 + 0.5 * (n2.r - 0.5);
    if (d < lip) {
      col = mix(sGrass, sGrass2, smoothstep(0.0, lip, d)) * (0.85 + 0.3 * texture2D(tNoise, vec2(u * 3.1, y * 0.4)).a);
      deep = false;
    } else if (d < topsoil) {
      col = mix(sSoil, sSoil2, smoothstep(0.3, 0.7, n3.b)) * (0.9 + 0.2 * n4.g);
      // roots hanging down from the turf
      float rc = floor(u / 0.8);
      float rh = th_hash12(vec2(rc, 3.7));
      float rx = (rc + 0.15 + 0.7 * rh) * 0.8 + 0.1 * sin(d * 6.5 + rh * 21.0);
      float rlen = 0.5 + 1.2 * th_hash12(vec2(rc, 9.1));
      float rw = 0.035 * (1.0 - smoothstep(0.0, rlen, d - lip));
      float root = (1.0 - smoothstep(rw * 0.45, rw, abs(u - rx))) * step(d - lip, rlen) * step(0.3, rh);
      col = mix(col, sRoot, root * 0.8);
      // shadow under the turf lip
      col *= mix(0.72, 1.0, smoothstep(lip, lip + 0.2, d));
      pebD = 0.05;
      deep = false;
    }
  } else if (beach > 0.5) {
    if (d < 1.7 + 0.5 * (n2.r - 0.5)) {
      col = mix(sSand2, sSand, smoothstep(0.0, 1.5, d)) * (0.95 + 0.07 * sin(y * 26.0 + n2.b * 7.0));
      pebD = 0.03;
      deep = false;
    }
  } else {
    if (d < 0.45 + 0.15 * (n2.b - 0.5)) {
      col = sSilt * (0.92 + 0.12 * n4.r);
      deep = false;
    } else if (d < 1.55 + 0.4 * (n2.r - 0.5)) {
      col = sMud * (0.9 + 0.15 * n3.b);
      pebD = 0.07;
      deep = false;
    }
  }
  if (deep) col = th_deep(y, bend, n1, n2, n3, n4, pebD);
  if (pebD > 0.0) {
    float sh, pid;
    float pm = th_pebbles(vec2(u, y) * (pebD > 0.5 ? 2.4 : 1.35), pebD, sh, pid);
    if (pm > 0.0) {
      vec3 pc = pid < 0.33 ? sPeb1 : (pid < 0.66 ? sPeb2 : sPeb3);
      pc *= 1.0 + 0.28 * sh;
      col = mix(col * 0.75, pc, pm);
    }
  }
  col *= 0.92 + 0.14 * n4.a;
  col *= 0.7 + 0.3 * smoothstep(${SLAB_BOTTOM.toFixed(1)}, ${(SLAB_BOTTOM + 2.2).toFixed(1)}, y);
  return col;
}
`;

function surfAt(model: TerrainModel, x: number, z: number, h: number): number {
  if (h < model.waterLevel(x, z) - 0.05) return 2;
  if (x > 117.5 && z > -6.5) return 1; // beach / river mouth / south beach
  return 0;
}

function buildFaces(model: TerrainModel, edges: SlabEdges): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const top: number[] = [];
  const surf: number[] = [];
  const idx: number[] = [];
  const add = (prof: EdgeProfile, side: 'N' | 'S' | 'W' | 'E') => {
    const base = pos.length / 3;
    const n = prof.u.length;
    let nx = 0,
      nz = 0;
    if (side === 'N') nz = -1;
    if (side === 'S') nz = 1;
    if (side === 'W') nx = -1;
    if (side === 'E') nx = 1;
    for (let i = 0; i < n; i++) {
      const u = prof.u[i];
      const x = side === 'N' || side === 'S' ? u : side === 'W' ? SLAB.x0 : SLAB.x1;
      const z = side === 'N' ? SLAB.z0 : side === 'S' ? SLAB.z1 : u;
      const t = prof.h[i] + GROUND_DROP;
      const s = surfAt(model, x, z, prof.h[i]);
      // top vertex, bottom vertex
      pos.push(x, t, z, x, SLAB_BOTTOM, z);
      nor.push(nx, 0, nz, nx, 0, nz);
      top.push(t, t);
      surf.push(s, s);
    }
    for (let i = 0; i < n - 1; i++) {
      const t0 = base + i * 2,
        b0 = t0 + 1,
        t1 = t0 + 2,
        b1 = t0 + 3;
      // winding so the face looks outward
      if (side === 'S' || side === 'W') idx.push(b0, b1, t1, b0, t1, t0);
      else idx.push(b1, b0, t0, b1, t0, t1);
    }
  };
  add(edges.north, 'N');
  add(edges.south, 'S');
  add(edges.west, 'W');
  add(edges.east, 'E');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function facesMaterial(): THREE.MeshStandardMaterial {
  const C = (h: string) => ({ value: new THREE.Color(h) });
  const uniforms = {
    tNoise: { value: noiseTexture() },
    sGrass: C('#7cab4a'),
    sGrass2: C('#5a8435'),
    sSoil: C('#4a3122'),
    sSoil2: C('#5e402b'),
    sRoot: C('#b49670'),
    sClay: C('#8c5d3a'),
    sClay2: C('#a3704a'),
    sSand: C('#cfae78'),
    sSand2: C('#e0c794'),
    sGravel: C('#978670'),
    sStone: C('#a69582'),
    sStone2: C('#86776a'),
    sBed: C('#7b7169'),
    sBed2: C('#645b54'),
    sSilt: C('#a99a76'),
    sMud: C('#5f5141'),
    sPeb1: C('#b9ad9b'),
    sPeb2: C('#8d8a85'),
    sPeb3: C('#a78f74'),
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTop;\nattribute float aSurf;\nvarying vec3 vSW;\nvarying float vTop;\nvarying float vSurf;\nvarying float vU;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTop = aTop;\nvSurf = aSurf;\nvU = abs(objectNormal.x) > 0.5 ? vSW.z : vSW.x;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + STRATA_PARS)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( strataColor(), opacity );');
  };
  mat.customProgramCacheKey = () => 'th-strata-v1';
  return mat;
}

// ─────────────────────────────────────────────────────────── plinth ──

function woodTexture(rng: Rng): THREE.CanvasTexture {
  const W = 1024,
    H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#5b3722');
  grd.addColorStop(0.45, '#4a2b19');
  grd.addColorStop(1, '#56331e');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const TAU = Math.PI * 2;
  for (let i = 0; i < 260; i++) {
    const y0 = rng.next() * H;
    const k1 = 1 + Math.floor(rng.next() * 3),
      k2 = 3 + Math.floor(rng.next() * 5);
    const a1 = 1.5 + rng.next() * 6,
      a2 = 0.4 + rng.next() * 1.6;
    const p1 = rng.next() * TAU,
      p2 = rng.next() * TAU;
    const dark = rng.next() < 0.62;
    g.strokeStyle = dark ? `rgba(28,14,6,${(0.1 + rng.next() * 0.28).toFixed(3)})` : `rgba(150,98,56,${(0.05 + rng.next() * 0.12).toFixed(3)})`;
    g.lineWidth = 0.6 + rng.next() * 2.4;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + Math.sin((x / W) * TAU * k1 + p1) * a1 + Math.sin((x / W) * TAU * k2 + p2) * a2;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // faint pores
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(20,10,4,${(0.08 + rng.next() * 0.14).toFixed(3)})`;
    g.fillRect(rng.next() * W, rng.next() * H, 2 + rng.next() * 5, 1);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.MirroredRepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function buildPlinth(rng: Rng): THREE.Mesh {
  // profile: [outward offset from the slab edge, y]
  const T = PLINTH;
  const prof: [number, number][] = [
    [-0.4, T.top],
    [T.ledge, T.top],
    [T.ledge + 0.42, T.top - 0.06],
    [T.ledge + 0.74, T.top - 0.22],
    [T.ledge + 0.94, T.top - 0.5],
    [T.out, T.faceTop],
    [T.out, T.faceBottom],
    [T.out + 0.12, T.faceBottom - 0.08],
    [T.out + 0.3, T.faceBottom - 0.24],
    [T.out + 0.36, T.faceBottom - 0.5],
    [T.out + 0.36, T.bottom],
    [T.out - 0.4, T.bottom],
  ];
  const { x0, x1, z0, z1 } = SLAB;
  // arc length along the profile (v texture coordinate)
  const vlen: number[] = [0];
  for (let i = 1; i < prof.length; i++) vlen.push(vlen[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // sides: [corner A (x,z), corner B, outward normal]
  const sides: { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }[] = [
    { ax: x0, az: z1, bx: x1, bz: z1, nx: 0, nz: 1 },
    { ax: x1, az: z1, bx: x1, bz: z0, nx: 1, nz: 0 },
    { ax: x1, az: z0, bx: x0, bz: z0, nx: 0, nz: -1 },
    { ax: x0, az: z0, bx: x0, bz: z1, nx: -1, nz: 0 },
  ];
  const UREP = 1 / 28;
  for (const s of sides) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const tx = (s.bx - s.ax) / len,
      tz = (s.bz - s.az) / len;
    for (let k = 0; k < prof.length - 1; k++) {
      const [d0, y0] = prof[k],
        [d1, y1] = prof[k + 1];
      // segment normal in the (outward, up) plane: travel direction rotated +90 degrees
      const dd = d1 - d0,
        dy = y1 - y0;
      const sl = Math.hypot(dd, dy) || 1;
      const no = -dy / sl,
        nu = dd / sl;
      // corners move outward diagonally (mitre)
      const P = (d: number, end: 0 | 1): [number, number] => {
        const cx = end === 0 ? s.ax : s.bx,
          cz = end === 0 ? s.az : s.bz;
        const along = end === 0 ? -d : d;
        return [cx + s.nx * d + tx * along, cz + s.nz * d + tz * along];
      };
      const a0 = P(d0, 0),
        b0 = P(d0, 1),
        a1 = P(d1, 0),
        b1 = P(d1, 1);
      const base = pos.length / 3;
      const ua0 = -d0 * UREP,
        ub0 = (len + d0) * UREP,
        ua1 = -d1 * UREP,
        ub1 = (len + d1) * UREP;
      pos.push(a0[0], y0, a0[1], b0[0], y0, b0[1], b1[0], y1, b1[1], a1[0], y1, a1[1]);
      const nx = s.nx * no,
        nz = s.nz * no;
      for (let q = 0; q < 4; q++) nor.push(nx, nu, nz);
      uv.push(ua0, vlen[k] / 7, ub0, vlen[k] / 7, ub1, vlen[k + 1] / 7, ua1, vlen[k + 1] / 7);
      // profile runs outward/downward: (a0,b0,b1,a1) faces outward for these windings
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ map: woodTexture(rng), color: '#ffffff', roughness: 0.4, metalness: 0.0 });
  const m = new THREE.Mesh(g, mat);
  m.name = 'terrain-plinth';
  m.receiveShadow = false;
  m.castShadow = false;
  return m;
}

function nameplateTexture(): THREE.CanvasTexture {
  const W = 2048,
    H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  // brushed brass
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#f1d589');
  grd.addColorStop(0.18, '#d9b25b');
  grd.addColorStop(0.55, '#c39a45');
  grd.addColorStop(0.85, '#a9812f');
  grd.addColorStop(1, '#8c6a25');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * H;
    g.strokeStyle = Math.random() < 0.5 ? `rgba(255,240,190,${(Math.random() * 0.12).toFixed(3)})` : `rgba(90,60,15,${(Math.random() * 0.1).toFixed(3)})`;
    g.lineWidth = 1;
    g.beginPath();
    const x0 = Math.random() * W;
    g.moveTo(x0, y);
    g.lineTo(x0 + 80 + Math.random() * 500, y + (Math.random() - 0.5) * 1.5);
    g.stroke();
  }
  // bevelled border
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,236,170,0.85)';
  g.strokeRect(5, 5, W - 10, H - 10);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(80,52,12,0.75)';
  g.strokeRect(16, 16, W - 32, H - 32);
  g.strokeStyle = 'rgba(255,236,170,0.5)';
  g.strokeRect(19, 19, W - 38, H - 38);
  // screws
  for (const [sx, sy] of [
    [44, 44],
    [W - 44, 44],
    [44, H - 44],
    [W - 44, H - 44],
  ]) {
    const rg = g.createRadialGradient(sx - 4, sy - 4, 2, sx, sy, 15);
    rg.addColorStop(0, '#fff2c4');
    rg.addColorStop(0.6, '#b38b3c');
    rg.addColorStop(1, '#5e4515');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(sx, sy, 14, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(50,32,8,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(sx - 9, sy + 5);
    g.lineTo(sx + 9, sy - 5);
    g.stroke();
  }
  // engraved lettering: dark fill + bright lower lip
  const engrave = (text: string, font: string, y: number, spacing: string) => {
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = spacing;
    g.fillStyle = 'rgba(255,240,190,0.75)';
    g.fillText(text, W / 2 + 1.5, y + 2.5);
    g.fillStyle = '#3a2809';
    g.fillText(text, W / 2, y);
    g.fillStyle = 'rgba(20,12,2,0.35)';
    g.fillText(text, W / 2 - 1, y - 1.5);
  };
  engrave(CITY_NAME.toUpperCase(), 'bold 132px Georgia, "Times New Roman", serif', 160, '34px');
  engrave('Est. 1897   ·   Scale 1:160   ·   A Living Miniature', 'italic 38px Georgia, "Times New Roman", serif', 216, '4px');
  // little ornaments either side of the title
  g.fillStyle = '#3a2809';
  for (const sx of [W / 2 - 720, W / 2 + 720]) {
    g.save();
    g.translate(sx, 118);
    g.rotate(Math.PI / 4);
    g.fillRect(-11, -11, 22, 22);
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildNameplate(): THREE.Mesh {
  const w = 30,
    h = 3.75;
  const tex = nameplateTexture();
  const geo = new THREE.BoxGeometry(w, h, 0.16);
  // single draw call: every face except the front (+z, vertices 16..19) samples the brass bevel
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) if (i < 16 || i > 19) uv.setXY(i, 0.002, 0.5);
  geo.clearGroups();
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.34, metalness: 0.45, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.06 });
  const m = new THREE.Mesh(geo, front);
  m.position.set(0, (PLINTH.faceTop + PLINTH.faceBottom) / 2, SLAB.z1 + PLINTH.out + 0.08);
  m.name = 'terrain-nameplate';
  return m;
}

function buildContactShadow(): THREE.Mesh {
  const margin = 38;
  const w = SLAB.x1 - SLAB.x0 + 2 * (PLINTH.out + margin);
  const d = SLAB.z1 - SLAB.z0 + 2 * (PLINTH.out + margin);
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = Math.round((S * d) / w);
  const g = cv.getContext('2d')!;
  const ix = (margin / w) * S,
    iz = (margin / d) * cv.height;
  g.filter = 'blur(9px)';
  g.fillStyle = 'rgba(0,0,0,0.7)';
  g.fillRect(ix + 4, iz + 4, S - 2 * ix - 8, cv.height - 2 * iz - 8);
  g.filter = 'blur(3px)';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(ix + 2, iz + 2, S - 2 * ix - 4, cv.height - 2 * iz - 4);
  g.filter = 'none';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: '#1d1712', toneMapped: false });
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set((SLAB.x0 + SLAB.x1) / 2, PLINTH.bottom - 0.05, (SLAB.z0 + SLAB.z1) / 2);
  m.renderOrder = -2;
  m.name = 'terrain-contact-shadow';
  return m;
}

export interface SlabResult {
  faces: THREE.Mesh;
  plinth: THREE.Mesh;
  nameplate: THREE.Mesh;
  /** the studio table (+ the legacy contact decal, hidden unless ?legacylight) */
  shadow: THREE.Object3D;
  triangles: number;
}

/** resample an edge profile's face-top heights uniformly over [a, b] */
function sampleEdge(prof: EdgeProfile, a: number, b: number, n: number): Float32Array {
  const out = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const u = a + ((b - a) * i) / (n - 1);
    while (j < prof.u.length - 2 && prof.u[j + 1] < u) j++;
    const u0 = prof.u[j],
      u1 = prof.u[Math.min(j + 1, prof.u.length - 1)];
    const t = u1 > u0 ? Math.min(1, Math.max(0, (u - u0) / (u1 - u0))) : 0;
    const h = prof.h[j] + (prof.h[Math.min(j + 1, prof.h.length - 1)] - prof.h[j]) * t;
    out[i] = Math.max(h, WATER_LEVEL) + GROUND_DROP;
  }
  return out;
}

export function createSlab(ctx: CityContext, model: TerrainModel, edges: SlabEdges): SlabResult {
  const fg = buildFaces(model, edges);
  const faces = new THREE.Mesh(fg, facesMaterial());
  faces.name = 'terrain-slab-faces';
  faces.receiveShadow = true;
  faces.castShadow = false;
  const plinth = buildPlinth(ctx.rng('terrain-wood'));
  const nameplate = buildNameplate();
  const contact = buildContactShadow();
  // the studio table (dynamic uniforms owned by the sky module; static fallback without it)
  let stage = ctx.services.stage as StageService | undefined;
  if (!stage) stage = { uniforms: createStageUniforms(), table: null, legacyContact: null };
  const NE = 256;
  const table = createTable(
    ctx.rng('stage-table'),
    {
      slab: SLAB,
      y: PLINTH.bottom - 0.03,
      plinthOut: PLINTH.out + 0.36,
      plinthTop: PLINTH.top - 0.3,
      plinthFace: PLINTH.out,
      edgeN: sampleEdge(edges.north, SLAB.x0, SLAB.x1, NE),
      edgeS: sampleEdge(edges.south, SLAB.x0, SLAB.x1, NE),
      edgeW: sampleEdge(edges.west, SLAB.z0, SLAB.z1, NE),
      edgeE: sampleEdge(edges.east, SLAB.z0, SLAB.z1, NE),
    },
    stage.uniforms,
  );
  stage.table = table;
  stage.legacyContact = contact;
  const legacy = ctx.debug.params.has('legacylight') || ctx.debug.params.has('notable');
  table.visible = !legacy;
  contact.visible = legacy;
  const shadow = new THREE.Group();
  shadow.name = 'stage';
  shadow.add(table, contact);
  for (const m of [faces, plinth, nameplate, contact, shadow]) {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
  }
  const triangles = (fg.index?.count ?? 0) / 3 + (plinth.geometry.index?.count ?? 0) / 3 + 12 + 2;
  return { faces, plinth, nameplate, shadow, triangles };
}
