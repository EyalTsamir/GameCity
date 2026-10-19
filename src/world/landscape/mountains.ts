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
  { r0: 2300, rc: 3300, r1: 4300, a0: 168, a1: 370, step: 0.16, hS: 70, hW: 150, hN: 330, scale: 1500, seed: 1 },
  { r0: 4300, rc: 5800, r1: 7600, a0: 176, a1: 368, step: 0.14, hS: 130, hW: 330, hN: 900, scale: 2300, seed: 2 },
  { r0: 7600, rc: 9800, r1: 12500, a0: 190, a1: 366, step: 0.12, hS: 220, hW: 620, hN: 1750, scale: 3200, seed: 3 },
  { r0: 12000, rc: 14800, r1: 18500, a0: 214, a1: 364, step: 0.12, hS: 380, hW: 1100, hN: 2700, scale: 4200, seed: 4 },
];

/** depth rows (0 = front foot, 1 = back) — dense around the crest (~0.4..0.6) */
const ROWS = [0, 0.16, 0.3, 0.4, 0.47, 0.53, 0.6, 0.72, 1];

export interface MountainResult {
  mesh: THREE.Mesh;
  triangles: number;
  vertices: number;
}

/** azimuth (deg) of the direction from the town centre */
function dirOf(aDeg: number): [number, number] {
  const a = aDeg * DEG;
  return [Math.sin(a), -Math.cos(a)];
}

export function buildMountains(model: LandscapeModel, uniforms: Record<string, THREE.IUniform>, fog: boolean): MountainResult {
  const pos: number[] = [];
  const idx: number[] = [];
  // the river valley notch (the river comes down from the hills in the WNW)
  const rvA = 288;
  for (const L of LAYERS) {
    const nA = Math.ceil((L.a1 - L.a0) / L.step);
    const nR = ROWS.length;
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
      // peaks and saddles along the range
      const env = 0.55 + 0.6 * ridged(aDeg / 9, L.seed * 3.1, 3, 70 + L.seed);
      // the far ends dip into the sea / fade
      const endF = smooth(L.a0, L.a0 + 10, aDeg) * (1 - smooth(L.a1 - 8, L.a1, aDeg));
      // river valley notch
      const notch = 1 - 0.55 * Math.exp(-((am - rvA) ** 2) / (2 * 3.2 ** 2));
      // crest distance wobbles
      const rc = L.rc + (vnoise(aDeg / 6, L.seed * 7.3, 71) - 0.5) * (L.r1 - L.r0) * 0.35;
      for (let j = 0; j < nR; j++) {
        const t = ROWS[j];
        const r = t < 0.5 ? lerp(L.r0, rc, t / 0.5) : lerp(rc, L.r1, (t - 0.5) / 0.5);
        const x = CX + dx * r,
          z = CZ + dz * r;
        // across-range profile: rise to the crest, fall behind it
        const prof = t < 0.5 ? Math.pow(Math.sin((t / 0.5) * Math.PI * 0.5), 1.25) : Math.pow(Math.cos(((t - 0.5) / 0.5) * Math.PI * 0.5), 0.8);
        // ridged relief across the layer (valleys and spurs run across the range)
        const rel = 0.45 + 0.7 * ridged(x / L.scale, z / L.scale, 4, 80 + L.seed);
        const fine = 1 + 0.12 * fbm(x / (L.scale * 0.18), z / (L.scale * 0.18), 3, 90 + L.seed);
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
  const mat = mountainMaterial(uniforms, fog);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'land-mountains';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, triangles: idx.length / 3, vertices: pos.length / 3 };
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
  vec3 forest = mix(cForestB, cForestC, smoothstep(250.0, 900.0, alt)) * (0.8 + 0.35 * n3.b);
  vec3 meadow = mix(cMeadow, cMeadowDry, n2.b) * (0.85 + 0.3 * n3.r);
  vec3 rock = mix(cRock, cRock2, smoothstep(0.35, 0.65, n3.g + 0.25 * sin(p.y * 0.05 + n2.r * 5.0)));
  float treeline = 1350.0 + (n2.r - 0.5) * 300.0;
  float fM = 1.0 - smoothstep(treeline - 120.0, treeline + 80.0, alt);
  fM *= 1.0 - smoothstep(0.5, 0.75, slope);
  vec3 col = mix(meadow, forest, fM);
  float rM = smoothstep(0.32, 0.55, slope + (n3.a - 0.5) * 0.2) * (1.0 - fM * 0.6);
  rM = max(rM, smoothstep(treeline + 250.0, treeline + 650.0, alt) * 0.8);
  col = mix(col, rock, rM);
  float snowLine = 1950.0 + (n2.a - 0.5) * 380.0;
  float sM = smoothstep(snowLine - 60.0, snowLine + 140.0, alt) * (1.0 - smoothstep(0.55, 0.85, slope + (n3.r - 0.5) * 0.25));
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
