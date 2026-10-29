// Near-LOD window geometry: a real stone / metal sill (weathered top, drip groove underneath) under every
// sill-carrying window and, on rendered / stone walls of some buildings, a projecting surround (jambs + head)
// around the opening, so the window reads as set into the wall from every angle (silhouette, real shadow
// receiving). The facade shader keeps its ray-traced sill box beyond the range (and the reveal everywhere);
// inside it the shader drops its sill on wall() quads (uGeoWin) and this geometry takes over.
//
// Windows come from Builder.wall() (Builder.winRec, WIN_REC floats each), are binned in a grid, and the two
// instanced meshes are refilled from the bins near the camera whenever it has moved a few metres (no
// per-frame allocations). `?nowingeo` disables it; range by quality (low 22 m, medium 32 m, high 42 m).

import * as THREE from 'three';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { WIN, WALLPAT } from './materials';

/** floats per window record: wx, wy, wz, dx, dz, w, h, wy0(in cell), seed, kind, pattern, r, g, b, col, row */
export const WIN_REC = 16;
const BIN = 16;
const MAX_SILL = 4096;
const MAX_BOX = 8192;
const SILL_OUT = 0.06;
const SILL_H = 0.065;
const SILL_EXT = 0.05;

function hash(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Sill profile extruded along +x over [0, 1]: back face on the wall plane (z = 0), weathered top falling
 *  outward, front nose, underside with a drip groove; end caps. Vertex colour = white (instance colour tints). */
function sillGeometry(): THREE.BufferGeometry {
  // profile (z, y), counter-clockwise seen from +x
  const P: [number, number][] = [
    [0, 0],
    [SILL_OUT, -0.009],
    [SILL_OUT, -SILL_H],
    [0.044, -SILL_H],
    [0.044, -SILL_H + 0.012],
    [0.034, -SILL_H + 0.012],
    [0.034, -SILL_H],
    [0.0, -SILL_H],
  ];
  const pos: number[] = [];
  const nrm: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0], v[1], v[2]);
      nrm.push(n[0], n[1], n[2]);
    }
  };
  for (let k = 0; k < P.length - 1; k++) {
    const [z0, y0] = P[k];
    const [z1, y1] = P[k + 1];
    if (z1 === 0 && z0 === 0) continue;
    // outward normal of the segment (profile runs clockwise seen from -x → normal = (dy, -dz) rotated)
    const ez = z1 - z0,
      ey = y1 - y0;
    const l = Math.hypot(ez, ey);
    const n = [0, ez / l, -ey / l];
    quad([1, y0, z0], [0, y0, z0], [0, y1, z1], [1, y1, z1], n);
  }
  // end caps: the outer quad (the groove is hidden inside it)
  const cap = (x: number, s: number) => {
    const a = [x, 0, 0],
      b = [x, -0.009, SILL_OUT],
      c = [x, -SILL_H, SILL_OUT],
      d = [x, -SILL_H, 0];
    if (s > 0) quad(a, b, c, d, [1, 0, 0]);
    else quad(d, c, b, a, [-1, 0, 0]);
  };
  cap(1, 1);
  cap(0, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
  fixWinding(g);
  return g;
}

/** Unit box [0,1]³ without its back (z = 0) face. */
function boxGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5).toNonIndexed();
  // drop the -z face (BoxGeometry face order: +x, -x, +y, -y, +z, -z; 6 vertices each)
  const p = g.getAttribute('position').array as Float32Array;
  const n = g.getAttribute('normal').array as Float32Array;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(p.slice(0, 30 * 3), 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n.slice(0, 30 * 3), 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(new Array(90).fill(1), 3));
  g.dispose();
  return out;
}

/** Make every triangle's winding agree with its normal (front faces outward). */
function fixWinding(g: THREE.BufferGeometry): void {
  const p = g.getAttribute('position').array as Float32Array;
  const n = g.getAttribute('normal').array as Float32Array;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let t = 0; t < p.length; t += 9) {
    a.set(p[t], p[t + 1], p[t + 2]);
    b.set(p[t + 3], p[t + 4], p[t + 5]).sub(a);
    c.set(p[t + 6], p[t + 7], p[t + 8]).sub(a);
    b.cross(c);
    if (b.x * n[t] + b.y * n[t + 1] + b.z * n[t + 2] < 0) {
      for (let k = 0; k < 3; k++) {
        const s = p[t + 3 + k];
        p[t + 3 + k] = p[t + 6 + k];
        p[t + 6 + k] = s;
      }
    }
  }
}

function makeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 });
  m.name = 'buildings-wingeo';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lampUniforms());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vThWPos;\nvarying vec3 vThWNrm;\nvarying vec3 vThLoc;`)
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
mat4 thM = modelMatrix;
#ifdef USE_INSTANCING
thM = modelMatrix * instanceMatrix;
#endif
vThWPos = (thM * vec4(transformed, 1.0)).xyz;
vThWNrm = normalize(mat3(thM) * objectNormal);
vThLoc = transformed;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vThWPos;\nvarying vec3 vThWNrm;\nvarying vec3 vThLoc;\n${LAMP_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  // weathering: grime + lichen speckle on the top, a darker underside lip, fine grit everywhere
  vec3 wn = normalize(vThWNrm);
  vec3 wp = vThWPos;
  float g1 = fract(sin(dot(floor(wp * 41.0), vec3(12.99, 78.23, 37.71))) * 43758.55);
  float g2 = fract(sin(dot(floor(wp * 9.0), vec3(3.17, 11.3, 5.71))) * 1731.3);
  diffuseColor.rgb *= 0.93 + 0.1 * g1;
  float top = smoothstep(0.6, 0.9, wn.y);
  diffuseColor.rgb *= mix(1.0, mix(0.72, 0.9, g2), top * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.34, 0.22), top * step(0.93, g1) * 0.35);
  diffuseColor.rgb *= mix(1.0, 0.62, smoothstep(-0.5, -0.9, wn.y));
}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vThWPos, normalize(vThWNrm));`,
      );
  };
  m.customProgramCacheKey = () => 'tinyhaven-buildings-wingeo-v1';
  return m;
}

export interface WinGeo {
  group: THREE.Group;
  /** call every frame; refills the instances when the camera moved > 3 m; writes uGeoWin (centre, range) */
  frame(cam: THREE.Vector3, uGeoWin: THREE.Vector4): void;
  stats(): { winRecs: number; winSills: number; winBoxes: number };
}

export function createWinGeo(rec: number[], range: number): WinGeo {
  const nRec = (rec.length / WIN_REC) | 0;
  const R = new Float32Array(rec);
  const bins = new Map<number, number[]>();
  const key = (bx: number, bz: number) => (bx + 512) * 1024 + (bz + 512);
  // per-window decision (sill, surround) fixed once
  const flags = new Uint8Array(nRec);
  for (let i = 0; i < nRec; i++) {
    const o = i * WIN_REC;
    const kind = Math.round(R[o + 9]);
    const style = Math.floor((kind % 64) / 8);
    const pat = Math.round(R[o + 10]) % 16;
    const seed = Math.round(R[o + 8]);
    const sillW = (style === WIN.PLAIN || style === WIN.MUNTIN || style === WIN.INDUSTRIAL || style === WIN.ARCHED) && pat !== WALLPAT.CORRUGATED;
    if (!sillW || R[o + 7] <= 0.2) continue;
    let f = 1;
    const rendered = pat === WALLPAT.PLASTER || pat === WALLPAT.SMOOTH || pat === WALLPAT.STONE;
    if (rendered && style !== WIN.INDUSTRIAL && hash(seed, 3.7) < 0.62) f |= style === WIN.ARCHED ? 2 : 6; // 2 jambs, 4 head
    flags[i] = f;
    const bk = key(Math.floor(R[o] / BIN), Math.floor(R[o + 2] / BIN));
    let b = bins.get(bk);
    if (!b) bins.set(bk, (b = []));
    b.push(i);
  }
  const mat = makeMaterial();
  const sills = new THREE.InstancedMesh(sillGeometry(), mat, MAX_SILL);
  const boxes = new THREE.InstancedMesh(boxGeometry(), mat, MAX_BOX);
  for (const m of [sills, boxes]) {
    m.count = 0;
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  sills.name = 'buildings-sills';
  boxes.name = 'buildings-surrounds';
  sills.setColorAt(0, new THREE.Color());
  boxes.setColorAt(0, new THREE.Color());
  const group = new THREE.Group();
  group.name = 'buildings-wingeo';
  group.userData.rec = { R, flags, WIN_REC };
  group.add(sills, boxes);

  const last = new THREE.Vector3(1e9, 0, 0);
  const M = new THREE.Matrix4();
  const C = new THREE.Color();
  const me = M.elements;
  let nS = 0,
    nB = 0;
  // instance matrix: x along the wall (scaled), y up (scaled), z outward (scaled), origin p
  const put = (mesh: THREE.InstancedMesh, k: number, dx: number, dz: number, sx: number, sy: number, sz: number, px: number, py: number, pz: number) => {
    me[0] = dx * sx;
    me[1] = 0;
    me[2] = dz * sx;
    me[3] = 0;
    me[4] = 0;
    me[5] = sy;
    me[6] = 0;
    me[7] = 0;
    me[8] = -dz * sz;
    me[9] = 0;
    me[10] = dx * sz;
    me[11] = 0;
    me[12] = px;
    me[13] = py;
    me[14] = pz;
    me[15] = 1;
    mesh.setMatrixAt(k, M);
  };
  const refill = (cam: THREE.Vector3) => {
    nS = nB = 0;
    const r2 = (range + 2) * (range + 2);
    const b0x = Math.floor((cam.x - range - 2) / BIN),
      b1x = Math.floor((cam.x + range + 2) / BIN);
    const b0z = Math.floor((cam.z - range - 2) / BIN),
      b1z = Math.floor((cam.z + range + 2) / BIN);
    for (let bx = b0x; bx <= b1x; bx++)
      for (let bz = b0z; bz <= b1z; bz++) {
        const b = bins.get(key(bx, bz));
        if (!b) continue;
        for (const i of b) {
          const o = i * WIN_REC;
          const dx = R[o + 3],
            dz = R[o + 4],
            w = R[o + 5],
            h = R[o + 6];
          const cx = R[o] + dx * w * 0.5 - cam.x,
            cy = R[o + 1] + h * 0.5 - cam.y,
            cz = R[o + 2] + dz * w * 0.5 - cam.z;
          if (cx * cx + cy * cy + cz * cz > r2) continue;
          // the window faces away from the camera: nothing of it can show
          if (-dz * cx + dx * cz > 0.5) continue;
          const f = flags[i];
          const seed = R[o + 8];
          const pat = Math.round(R[o + 10]) % 16;
          const x0 = R[o] - dx * SILL_EXT,
            z0 = R[o + 2] - dz * SILL_EXT;
          if (nS < MAX_SILL) {
            put(sills, nS, dx, dz, w + 2 * SILL_EXT, 1, 1, x0, R[o + 1], z0);
            if (pat === WALLPAT.PANELS || pat === WALLPAT.SMOOTH) C.setRGB(0.5, 0.51, 0.52);
            else {
              const t = 0.86 + 0.18 * (seed * 0.731 - Math.floor(seed * 0.731));
              C.setRGB(0.8 * t, 0.78 * t, 0.73 * t);
            }
            sills.setColorAt(nS++, C);
          }
          if (f & 6 && nB + 3 <= MAX_BOX) {
            // surround: lighter render / dressed stone band 11 cm wide, 2.5 cm proud; head 16 cm, 3.5 cm proud
            const lr = R[o + 11] * 0.45 + 0.82 * 0.55,
              lg = R[o + 12] * 0.45 + 0.8 * 0.55,
              lb = R[o + 13] * 0.45 + 0.75 * 0.55;
            C.setRGB(lr, lg, lb);
            const bw = 0.11,
              y0 = R[o + 1],
              y1 = y0 + h;
            put(boxes, nB, dx, dz, bw, h, 0.025, R[o] - dx * bw, y0, R[o + 2] - dz * bw);
            boxes.setColorAt(nB++, C);
            put(boxes, nB, dx, dz, bw, h, 0.025, R[o] + dx * w, y0, R[o + 2] + dz * w);
            boxes.setColorAt(nB++, C);
            if (f & 4) {
              put(boxes, nB, dx, dz, w + 2 * bw + 0.04, 0.16, 0.035, R[o] - dx * (bw + 0.02), y1, R[o + 2] - dz * (bw + 0.02));
              boxes.setColorAt(nB++, C);
            }
          }
        }
      }
    sills.count = nS;
    boxes.count = nB;
    sills.instanceMatrix.needsUpdate = true;
    boxes.instanceMatrix.needsUpdate = true;
    if (sills.instanceColor) sills.instanceColor.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
  };
  return {
    group,
    frame(cam, u) {
      if (cam.distanceToSquared(last) > 9) {
        last.copy(cam);
        refill(cam);
      }
      u.set(last.x, last.y, last.z, range);
    },
    stats: () => ({ winRecs: nRec, winSills: nS, winBoxes: nB }),
  };
}
