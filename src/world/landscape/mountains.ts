// Distant relief as polar layers around the town: low hills S/SW, rolling hills W, a mountain range
// N/NW rising behind the forested hills. Each layer is a polar strip (azimuth × a few depth rows
// concentrated around the crest) with high angular resolution, so the skyline stays crisp at any
// window size while the vertex count stays small. The layers' feet are buried below the landscape
// mesh; their far ends dip into the sea at the coasts. One merged mesh, one draw call.
//
// Shading: forest below a treeline, alpine meadow, rock on steep faces, snow above a snow line that
// follows slope and noise; aerial perspective comes from the scene fog (air's atmosphere).

import * as THREE from 'three';
import { CX, CZ, WL } from './model';
import type { LandscapeModel } from './model';
import { ridged, fbm, smooth, lerp, vnoise } from './noise';

const DEG = Math.PI / 180;

interface LayerDef {
  /** front foot / crest / back distance from the town centre (m) */
  r0: number;
  rc: number;
  r1: number;
  /** azimuth span (deg; 0 = north, 90 = east, 270 = west; may exceed 360) */
  a0: number;
  a1: number;
  /** angular step (deg) */
  step: number;
  /** crest height by azimuth: south / west / north (m) */
  hS: number;
  hW: number;
  hN: number;
  /** ridged-noise scale (m) */
  scale: number;
  seed: number;
}

const LAYERS: LayerDef[] = [
  { r0: 2400, rc: 3500, r1: 4700, a0: 168, a1: 370, step: 0.21, hS: 45, hW: 80, hN: 230, scale: 1600, seed: 1 },
  { r0: 4600, rc: 6300, r1: 8200, a0: 176, a1: 368, step: 0.17, hS: 85, hW: 170, hN: 560, scale: 2600, seed: 2 },
  { r0: 8000, rc: 11000, r1: 14500, a0: 196, a1: 366, step: 0.12, hS: 150, hW: 520, hN: 2100, scale: 3400, seed: 3 },
  { r0: 13500, rc: 17500, r1: 22000, a0: 226, a1: 364, step: 0.11, hS: 260, hW: 1100, hN: 3700, scale: 4600, seed: 4 },
];

/** depth rows (0 = front foot, 1 = back) — dense around the crest (~0.4..0.6) */
const ROWS = [0, 0.16, 0.3, 0.4, 0.47, 0.53, 0.6, 0.72, 1];

export interface MountainResult {
  /** a group of azimuth chunks (frustum-culled separately), or one mesh for the coarse proxy */
  mesh: THREE.Object3D;
  material: THREE.Material;
  triangles: number;
  vertices: number;
}

/** azimuth (deg) of the direction from the town centre */
function dirOf(aDeg: number): [number, number] {
  const a = aDeg * DEG;
  return [Math.sin(a), -Math.cos(a)];
}

/**
 * `decimate` > 1 builds a coarse copy (angular step × decimate, 5 rows) — the water reflection proxy.
 * `mat` reuses an existing material (same program).
 */
export function buildMountains(model: LandscapeModel, uniforms: Record<string, THREE.IUniform>, fog: boolean, decimate = 1, mat0: THREE.Material | null = null): MountainResult {
  const rows = decimate > 1 ? [0, 0.3, 0.5, 0.7, 1] : ROWS;
  const pos: number[] = [];
  const idx: number[] = [];
  // the river valley notch (the river comes down from the hills in the WNW)
  const rvA = 288;
  for (const L of LAYERS) {
    const nA = Math.ceil((L.a1 - L.a0) / (L.step * decimate));
    const nR = rows.length;
    const base = pos.length / 3;
    for (let i = 0; i <= nA; i++) {
      const aDeg = L.a0 + ((L.a1 - L.a0) * i) / nA;
      const [dx, dz] = dirOf(aDeg);
      const am = ((aDeg % 360) + 360) % 360;
      // crest height envelope by azimuth: S (180) → W (270) → N (360)
      let hA: number;
      if (am >= 160 && am < 270) hA = lerp(L.hS, L.hW, smooth(180, 270, am));
      else if (am >= 270) hA = lerp(L.hW, L.hN, smooth(270, 345, am));
      else hA = L.hN * (1 - smooth(0, 14, am)); // NNE: the range runs out toward the coast
      // massifs and saddles along the range (broad), secondary summits (smaller)
      const env = (0.62 + 0.45 * fbm(aDeg / 26, L.seed * 3.1, 3, 70 + L.seed)) * (0.82 + 0.3 * ridged(aDeg / 7, L.seed * 1.7, 2, 75 + L.seed));
      // rolling hills in the S / W, ridged mountains toward the N
      const alp = smooth(285, 335, am < 90 ? am + 360 : am) * Math.min(1, L.seed / 2.5);
      // the far ends dip into the sea / fade
      const endF = smooth(L.a0, L.a0 + 10, aDeg) * (1 - smooth(L.a1 - 8, L.a1, aDeg));
      // river valley notch
      const notch = 1 - 0.55 * Math.exp(-((am - rvA) ** 2) / (2 * 3.2 ** 2));
      // crest distance wobbles
      const rc = L.rc + (vnoise(aDeg / 6, L.seed * 7.3, 71) - 0.5) * (L.r1 - L.r0) * 0.35;
      for (let j = 0; j < nR; j++) {
        const t = rows[j];
        const r = t < 0.5 ? lerp(L.r0, rc, t / 0.5) : lerp(rc, L.r1, (t - 0.5) / 0.5);
        const x = CX + dx * r,
          z = CZ + dz * r;
        // across-range profile: a broad massif rising to the crest, falling behind it
        const prof = t < 0.5 ? Math.pow(Math.sin((t / 0.5) * Math.PI * 0.5), 0.9) : Math.pow(Math.cos(((t - 0.5) / 0.5) * Math.PI * 0.5), 0.7);
        // relief across the layer: ridged (valleys and spurs) in the mountains, soft fbm in the hills
        const rr = ridged(x / L.scale, z / L.scale, 4, 80 + L.seed);
        const ff = 0.5 + 0.5 * fbm(x / L.scale, z / L.scale, 3, 85 + L.seed);
        const rel = lerp(0.55 + 0.45 * ff, 0.4 + 0.6 * rr, alp);
        const fine = 1 + 0.08 * fbm(x / (L.scale * 0.15), z / (L.scale * 0.15), 3, 90 + L.seed);
        let y = hA * env * prof * rel * fine * endF * notch;
        // feet: buried below the landscape surface; at sea the foot sinks below the water
        const ground = model.world(x, z);
        if (j === 0 || j === nR - 1) y = Math.min(ground, y) - 25;
        else y = Math.max(y, ground - 25 * (1 - prof));
        if (j === 0 && ground < WL) y = WL - 40;
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < nA; i++) {
      for (let j = 0; j < nR - 1; j++) {
        const a = base + i * nR + j,
          b = a + nR,
          c = b + 1,
          d = a + 1;
        // viewed from the town (inside), outward = increasing j
        idx.push(a, b, d, d, b, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mat = mat0 ?? mountainMaterial(uniforms, fog);
  const mk = (g: THREE.BufferGeometry, name: string) => {
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  };
  if (decimate > 1) return { mesh: mk(geo, 'land-mountains'), material: mat, triangles: idx.length / 3, vertices: pos.length / 3 };
  // azimuth chunks (all layers of a sector in one mesh): sectors behind the camera are culled
  const CH = 5;
  const bins: number[][] = Array.from({ length: CH }, () => []);
  for (let t = 0; t < idx.length; t += 3) {
    const v = idx[t];
    const a = Math.atan2(pos[v * 3] - CX, -(pos[v * 3 + 2] - CZ)) / DEG; // 0 = north, 90 = east
    const am = (((a - 165) % 360) + 360) % 360; // 0 at the S end of the layers
    const k = Math.min(CH - 1, Math.floor(am / (210 / CH)));
    bins[k].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const group = new THREE.Group();
  group.name = 'land-mountains';
  for (let k = 0; k < CH; k++) {
    if (!bins[k].length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geo.getAttribute('position'));
    g.setAttribute('normal', geo.getAttribute('normal'));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(bins[k]), 1));
    // tight bounds from this chunk's vertices
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (const v of bins[k]) box.expandByPoint(p.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
    g.boundingBox = box;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    group.add(mk(g, 'land-mountains'));
  }
  return { mesh: group, material: mat, triangles: idx.length / 3, vertices: pos.length / 3 };
}

function mountainMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, fog });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMW;\nvarying vec3 vMN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvMN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vMW;
varying vec3 vMN;
uniform sampler2D tLN;
uniform vec3 cForestC, cForestB, cMeadow, cMeadowDry, cRock, cRock2;
vec3 mtnAlbedo() {
  vec3 p = vMW;
  vec3 N = normalize(vMN);
  float slope = 1.0 - N.y;
  vec4 n1 = texture2D(tLN, p.xz * (1.0 / 2600.0));
  vec4 n2 = texture2D(tLN, p.xz * (1.0 / 640.0));
  vec4 n3 = texture2D(tLN, p.xz * (1.0 / 150.0));
  float alt = p.y + (n1.r - 0.5) * 260.0 + (n2.g - 0.5) * 120.0;
  // forest (conifers dominate up high), alpine meadow, rock, snow
  vec4 n4 = texture2D(tLN, p.xz * (1.0 / 47.0));
  vec3 forest = mix(cForestB, cForestC, smoothstep(250.0, 900.0, alt) * 0.7 + 0.3 * smoothstep(0.4, 0.6, n2.b)) * (0.72 + 0.3 * n3.b + 0.18 * n4.r);
  vec3 meadow = mix(cMeadow, cMeadowDry, n2.b) * (0.85 + 0.3 * n3.r);
  vec3 rock = mix(cRock, cRock2, smoothstep(0.35, 0.65, n3.g + 0.25 * sin(p.y * 0.05 + n2.r * 5.0)));
  float treeline = 1350.0 + (n2.r - 0.5) * 300.0;
  float fM = 1.0 - smoothstep(treeline - 120.0, treeline + 80.0, alt);
  fM *= 1.0 - smoothstep(0.5, 0.75, slope);
  vec3 col = mix(meadow, forest, fM);
  float rM = smoothstep(0.32, 0.55, slope + (n3.a - 0.5) * 0.2) * (1.0 - fM * 0.6);
  rM = max(rM, smoothstep(treeline + 250.0, treeline + 650.0, alt) * 0.8);
  col = mix(col, rock, rM);
  float snowLine = 2050.0 + (n2.a - 0.5) * 420.0 - 120.0 * N.z;
  // snow lies in gullies and on gentler ledges, steep faces stay dark
  float gully = smoothstep(0.35, 0.7, n3.g * 0.6 + n4.b * 0.4);
  float sM = smoothstep(snowLine - 80.0, snowLine + 220.0, alt + gully * 160.0) * (1.0 - smoothstep(0.5, 0.8, slope + (n3.r - 0.5) * 0.3));
  col = mix(col, vec3(0.86, 0.88, 0.92), sM);
  return col;
}
`,
      )
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( mtnAlbedo(), opacity );');
  };
  mat.customProgramCacheKey = () => 'th-mtn-v1';
  return mat;
}
