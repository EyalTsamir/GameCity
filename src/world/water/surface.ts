// Water surfaces (sea, river, pond) as one mesh / one draw call. Stylised shader:
// depth-tinted turquoise -> deep blue, transparent shallows over the sandy bed, shoreline
// foam + swash, breaking wave lines on the beach, wall lapping, fresnel sky reflection
// driven by the time of day, sun glints & sparkles, moon glint and warm city shimmer at night.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB, WATER_LEVEL, RIVER } from '../../core/constants';
import type { TerrainModel } from '../terrain/height';
import { noiseTexture } from '../terrain/noise';
import type { WaterField } from './field';
import { ampFrom } from './field';
import { WAVES_GLSL } from './waves';

export interface SurfaceResult {
  mesh: THREE.Mesh;
  triangles: number;
  uniforms: Record<string, THREE.IUniform>;
  /** grid cells included, for invariants: key `${domain}:${i}:${j}` */
  covered(x: number, z: number): boolean;
}

interface Domain {
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  step: number;
  level: number;
}

export function createSurface(ctx: CityContext, model: TerrainModel, field: WaterField, lamps: { x: number; y: number; z: number }[] = []): SurfaceResult {
  const pond = model.pond;
  const domains: Domain[] = [
    { name: 'sea', x0: 112, z0: SLAB.z0, x1: SLAB.x1, z1: SLAB.z1, step: 2, level: WATER_LEVEL },
    { name: 'river', x0: SLAB.x0, z0: RIVER.z0 - 2, x1: 112, z1: RIVER.z1 + 2, step: 2, level: WATER_LEVEL },
  ];
  if (pond) {
    const x0 = Math.floor(pond.cx - pond.rx * 1.2),
      z0 = Math.floor(pond.cz - pond.rz * 1.25);
    domains.push({ name: 'pond', x0, z0, x1: Math.ceil(pond.cx + pond.rx * 1.2), z1: Math.ceil(pond.cz + pond.rz * 1.25), step: 1, level: pond.level });
  }
  const pos: number[] = [];
  const wav: number[] = [];
  const idx: number[] = [];
  const coverSets = new Map<string, Set<number>>();
  for (const d of domains) {
    const nx = Math.round((d.x1 - d.x0) / d.step),
      nz = Math.round((d.z1 - d.z0) / d.step);
    const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const wetAt = (x: number, z: number) => {
      const lv = d.name === 'pond' ? pond!.level : WATER_LEVEL;
      return lv - model.height(x, z) > -0.3;
    };
    const cs = new Set<number>();
    coverSets.set(d.name, cs);
    const V = (i: number, j: number): number => {
      const key = j * (nx + 1) + i;
      if (vid[key] >= 0) return vid[key];
      const x = d.x0 + i * d.step,
        z = d.z0 + j * d.step;
      const dep = field.sample(field.depth, x, z);
      const reg = d.name === 'pond' ? 1 : field.sample(field.region, x, z);
      pos.push(x, d.level, z);
      wav.push(ampFrom(dep, reg), reg);
      vid[key] = pos.length / 3 - 1;
      return vid[key];
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = d.x0 + i * d.step,
          z = d.z0 + j * d.step,
          s = d.step;
        if (!(wetAt(x, z) || wetAt(x + s, z) || wetAt(x, z + s) || wetAt(x + s, z + s) || wetAt(x + s / 2, z + s / 2))) continue;
        cs.add(j * nx + i);
        const a = V(i, j),
          b = V(i + 1, j),
          c = V(i + 1, j + 1),
          e = V(i, j + 1);
        idx.push(a, c, b, a, e, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('aWave', new THREE.Float32BufferAttribute(wav, 2));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  // generous bounds: waves move the surface a little
  geo.boundingBox!.expandByScalar(0.5);

  const C = (h: string) => ({ value: new THREE.Color(h) });
  const uniforms: Record<string, THREE.IUniform> = {
    tNoise: { value: noiseTexture() },
    tField: { value: field.tex },
    uSlabXf: { value: new THREE.Vector4(SLAB.x0, SLAB.z0, 1 / (SLAB.x1 - SLAB.x0), 1 / (SLAB.z1 - SLAB.z0)) },
    uTime: ctx.uniforms.uTime,
    uNight: ctx.uniforms.uNight,
    uDaylight: ctx.uniforms.uDaylight,
    uDusk: ctx.uniforms.uDusk,
    uLights: ctx.uniforms.uLights,
    uSunDir: ctx.uniforms.uSunDir,
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uLamps: { value: Array.from({ length: 16 }, (_, i) => (lamps[i] ? new THREE.Vector4(lamps[i].x, lamps[i].y, lamps[i].z, 1) : new THREE.Vector4(0, -100, 0, 0))) },
    uLampCount: { value: Math.min(16, lamps.length) },
    wShallow: C('#62d0c6'),
    wMid: C('#2b9bc2'),
    wDeep: C('#1b5d8d'),
    wRivS: C('#4a9a8f'),
    wRivD: C('#1f5762'),
    wPondS: C('#5f9476'),
    wPondD: C('#2f5642'),
    wFoam: C('#f4fbff'),
    skyDayH: C('#d5e7f2'),
    skyDayZ: C('#7fb0dc'),
    skyDuskH: C('#f6b98a'),
    skyDuskZ: C('#8e8fc4'),
    skyNightH: C('#22304b'),
    skyNightZ: C('#0b1426'),
  };

  const VERT_PARS = /* glsl */ `
attribute vec2 aWave;
uniform float uTime;
varying vec3 vWW;
varying vec2 vWave;
varying float vDisp;
float th_disp;
${WAVES_GLSL}
`;
  const FRAG_PARS = /* glsl */ `
uniform sampler2D tNoise;
uniform sampler2D tField;
uniform vec4 uSlabXf;
uniform float uTime;
uniform float uNight;
uniform float uDaylight;
uniform float uDusk;
uniform float uLights;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec4 uLamps[16];
uniform int uLampCount;
uniform vec3 wShallow;
uniform vec3 wMid;
uniform vec3 wDeep;
uniform vec3 wRivS;
uniform vec3 wRivD;
uniform vec3 wPondS;
uniform vec3 wPondD;
uniform vec3 wFoam;
uniform vec3 skyDayH;
uniform vec3 skyDayZ;
uniform vec3 skyDuskH;
uniform vec3 skyDuskZ;
uniform vec3 skyNightH;
uniform vec3 skyNightZ;
varying vec3 vWW;
varying vec2 vWave;
varying float vDisp;
vec3 wN = vec3(0.0, 1.0, 0.0);
vec3 wEmit = vec3(0.0);
float wRough = 0.3;
${WAVES_GLSL}

vec4 waterBase() {
  vec3 p = vWW;
  vec4 fld = texture2D(tField, (p.xz - uSlabXf.xy) * uSlabXf.zw);
  float depth = fld.r + vDisp;
  float shore = fld.g;
  float beach = fld.b;
  float region = fld.a;
  float amp = vWave.x;

  // per-pixel normal: analytic swell + ripples + scrolling noise
  vec2 g = vec2(0.0);
  th_swellG(p.xz, uTime, g);
  g *= amp;
  vec2 gr = vec2(0.0);
  th_ripple(p.xz, uTime, gr);
  float calm = 0.35 + 0.65 * smoothstep(0.05, 1.2, depth);
  g += gr * calm * (0.6 + 0.4 * amp);
  vec4 n1 = texture2D(tNoise, p.xz * 0.045 + vec2(uTime * 0.011, uTime * 0.006));
  vec4 n2 = texture2D(tNoise, p.xz * 0.13 - vec2(uTime * 0.009, -uTime * 0.013));
  g += ((n1.xy - 0.5) * 0.10 + (n2.zw - 0.5) * 0.07) * calm;
  // the river drifts east
  float flow = smoothstep(0.3, 0.5, region) * (1.0 - smoothstep(0.75, 0.95, region));
  vec4 nf = texture2D(tNoise, vec2(p.x * 0.07 - uTime * 0.04, p.z * 0.16));
  g += (nf.xy - 0.5) * 0.08 * flow;
  wN = normalize(vec3(-g.x, 1.0, -g.y));

  // body colour by depth and region
  float d = max(depth, 0.0);
  vec3 seaC = mix(wShallow, wMid, smoothstep(0.0, 2.4, d));
  seaC = mix(seaC, wDeep, smoothstep(2.2, 7.5, d));
  vec3 rivC = mix(wRivS, wRivD, smoothstep(0.0, 2.2, d));
  vec3 pondC = mix(wPondS, wPondD, smoothstep(0.0, 0.9, d));
  vec3 wc = mix(seaC, rivC, smoothstep(0.15, 0.45, region));
  wc = mix(wc, pondC, smoothstep(0.7, 0.9, region));
  wc *= 0.93 + 0.1 * n1.b;
  wc *= mix(1.0, 0.55, uNight);

  // fresnel sky reflection (time-of-day colours)
  vec3 V = normalize(cameraPosition - p);
  float ndv = clamp(dot(wN, V), 0.0, 1.0);
  float sea = 1.0 - smoothstep(0.15, 0.4, region);
  float F = mix(0.04, mix(0.42, 0.7, sea), pow(1.0 - ndv, 3.0));
  vec3 R = reflect(-V, wN);
  vec3 skyH = mix(skyDayH, skyDuskH, uDusk);
  skyH = mix(skyH, skyNightH, uNight);
  vec3 skyZ = mix(skyDayZ, skyDuskZ, uDusk * 0.7);
  skyZ = mix(skyZ, skyNightZ, uNight);
  vec3 sky = mix(skyH, skyZ, smoothstep(0.0, 0.65, R.y));

  // sun glint + sparkles
  float sunUp = smoothstep(-0.05, 0.08, uSunDir.y);
  float sd = max(dot(R, normalize(uSunDir)), 0.0);
  float spark = smoothstep(0.78, 0.95, texture2D(tNoise, p.xz * 0.41 + vec2(uTime * 0.07, -uTime * 0.05)).a);
  vec3 sunC = mix(vec3(1.0, 0.6, 0.34), vec3(1.0, 0.97, 0.9), smoothstep(0.03, 0.4, uSunDir.y));
  vec3 glint = sunC * (pow(sd, 420.0) * 3.5 + pow(sd, 60.0) * 0.18 + spark * pow(sd, 14.0) * 1.6) * sunUp;
  // moon glint
  float md = max(dot(R, normalize(uMoonDir)), 0.0);
  vec3 moon = vec3(0.62, 0.72, 1.0) * (pow(md, 260.0) * 1.8 + spark * pow(md, 30.0) * 0.9) * uNight;
  // warm city-light shimmer near the quays and banks at night
  float near = 1.0 - smoothstep(0.6, 10.0, shore);
  float shim = smoothstep(0.62, 0.92, texture2D(tNoise, vec2(p.x * 0.55, p.z * 1.9) + vec2(uTime * 0.02, uTime * 0.035)).b);
  vec3 city = vec3(1.0, 0.7, 0.36) * near * shim * uLights * mix(0.25, 0.6, smoothstep(0.1, 0.5, region));
  // reflections of the promenade lamps (reflected view ray vs. each lamp head)
  if (uLights > 0.01 && region > 0.2 && region < 0.8) {
    // anisotropic ripple normal: reflections smear into vertical streaks
    vec3 Ns = normalize(vec3(-g.x * 0.45, 1.0, -g.y * 2.6 - (n2.w - 0.5) * 0.35));
    vec3 Rs = reflect(-V, Ns);
    float lr = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uLampCount) break;
      vec3 L = uLamps[i].xyz - p;
      float a = max(dot(Rs, normalize(L)), 0.0);
      lr += pow(a, 900.0) * 3.0 + pow(a, 160.0) * 0.12;
    }
    float brk = 0.35 + 0.65 * smoothstep(0.35, 0.7, texture2D(tNoise, p.xz * vec2(0.5, 2.2) + vec2(0.0, uTime * 0.05)).r);
    city += vec3(1.0, 0.62, 0.28) * lr * brk * uLights;
  }

  // foam: shoreline + swash, beach wave lines, wall lapping
  float nb = texture2D(tNoise, p.xz * 0.33 + vec2(uTime * 0.03, uTime * 0.017)).r;
  float swash = 0.5 + 0.5 * sin(uTime * 0.85 - shore * 0.9);
  float edge = (1.0 - smoothstep(0.0, (0.12 + 0.16 * nb + 0.1 * swash) * mix(1.0, 0.35, smoothstep(0.75, 0.95, region)), depth)) * smoothstep(-0.02, 0.02, depth);
  float ph = fract(shore * 0.17 + uTime * 0.11);
  float line = smoothstep(0.84, 0.95, ph) * (1.0 - smoothstep(0.95, 0.995, ph));
  line *= beach * sea * smoothstep(0.8, 2.5, shore) * (1.0 - smoothstep(7.0, 15.0, shore));
  line *= smoothstep(0.42, 0.68, texture2D(tNoise, p.xz * 0.021 + vec2(0.0, uTime * 0.006)).g);
  float lap = (1.0 - smoothstep(0.2, 0.95, shore)) * (1.0 - beach) * (0.55 + 0.45 * sin(uTime * 1.6 + (p.x + p.z) * 0.8));
  float foam = clamp(max(edge, max(line * 0.8, lap * 0.55)), 0.0, 1.0);
  foam *= mix(0.55, 1.0, smoothstep(0.25, 0.65, nb));
  float pondF = smoothstep(0.75, 0.95, region);
  foam *= 1.0 - 0.85 * pondF;

  // transparency: clear sandy shallows -> opaque deep water
  float alpha = smoothstep(0.0, 0.28, depth) * mix(0.5, 0.93, smoothstep(0.25, 3.6, depth));
  float riv = smoothstep(0.2, 0.45, region) * (1.0 - smoothstep(0.75, 0.95, region));
  alpha = mix(alpha, max(alpha, smoothstep(0.0, 0.2, depth) * 0.8), riv);
  alpha = mix(alpha, min(1.0, alpha * 1.3 + 0.1), smoothstep(0.75, 0.95, region));
  alpha = max(alpha, foam * 0.92);

  vec3 foamC = wFoam * mix(1.0, 0.45, uNight);
  vec3 base = mix(wc * (1.0 - F * 0.6), foamC, foam);
  wEmit = (sky * F * 0.9 + glint + moon + city) * (1.0 - foam * 0.8);
  wRough = mix(0.22, 0.85, foam);
  return vec4(base, alpha);
}
`;

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0, transparent: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
vec3 th_wp = (modelMatrix * vec4(position, 1.0)).xyz;
vec2 th_g = vec2(0.0);
th_disp = th_swellG(th_wp.xz, uTime, th_g) * aWave.x;
th_g *= aWave.x;
vec3 objectNormal = normalize(vec3(-th_g.x, 1.0, -th_g.y));
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += th_disp;\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWave = aWave;\nvDisp = th_disp;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = waterBase();')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = wRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wEmit;');
  };
  mat.customProgramCacheKey = () => 'th-water-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water-surface';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 0;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  const covered = (x: number, z: number): boolean => {
    for (const d of domains) {
      if (x < d.x0 || x >= d.x1 || z < d.z0 || z >= d.z1) continue;
      const nx = Math.round((d.x1 - d.x0) / d.step);
      const i = Math.floor((x - d.x0) / d.step),
        j = Math.floor((z - d.z0) / d.step);
      if (coverSets.get(d.name)!.has(j * nx + i)) return true;
    }
    return false;
  };
  return { mesh, triangles: idx.length / 3, uniforms, covered };
}
