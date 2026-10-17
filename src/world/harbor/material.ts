// Materials of the harbour module.
//
//  harbor  — MeshStandardMaterial + onBeforeCompile (keeps lights, shadows, fog, env):
//            vertex colours, procedural surface patterns (corrugated steel, deck planks with
//            seams & butt joints, hull grime, glass), per-vertex night emission with
//            behaviours (street-light schedule, aviation blink, crane beacons, ferris-wheel
//            chase / rainbow / sparkle, carousel marquee, lighthouse lantern).
//            The RIGGED variant (define HARBOR_RIG) also animates vertices on the GPU from a
//            handful of uniforms: the ship's bob, crane gantry/trolley/hoist/sway, free
//            containers, ferris wheel rotation with upright gondolas, carousel + horses.
//  depth   — MeshDepthMaterial with the same rig, so animated parts cast correct shadows.
//  glow    — additive camera-facing halos / flat light pools (one draw call), can follow cranes.
//  beam    — the lighthouse's soft rotating light cones.

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';

export const NMOB = 6;

export interface RigUniforms {
  uShip: { value: THREE.Matrix4 };
  /** per crane: gantry z offset, trolley x offset, hoist y offset, sway x */
  uCrane: { value: THREE.Vector4[] };
  uMob: { value: THREE.Matrix4[] };
  /** hub xyz, angle */
  uWheel: { value: THREE.Vector4 };
  /** centre xyz, angle */
  uCar: { value: THREE.Vector4 };
  /** crane beacons on/off (x,y,z), w = lighthouse lantern flash */
  uFx: { value: THREE.Vector4 };
}

export function createRigUniforms(): RigUniforms {
  return {
    uShip: { value: new THREE.Matrix4() },
    uCrane: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uMob: { value: Array.from({ length: NMOB }, () => new THREE.Matrix4()) },
    uWheel: { value: new THREE.Vector4() },
    uCar: { value: new THREE.Vector4() },
    uFx: { value: new THREE.Vector4() },
  };
}

// ───────────────────────────────────────────────────────────── GLSL ──

const RIG_PARS = /* glsl */ `
attribute vec4 aRig;
attribute vec3 aPivot;
uniform mat4 uShip;
uniform vec4 uCrane[3];
uniform mat4 uMob[${NMOB}];
uniform vec4 uWheel;
uniform vec4 uCar;
uniform float uTime;
mat3 rigR;
vec3 rigT;
mat3 hbRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 hbRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
void rigSetup() {
  rigR = mat3(1.0);
  rigT = vec3(0.0);
  int type = int(aRig.x + 0.5);
  int idx = int(aRig.y + 0.5);
  if (type == 1) {
    float w = aRig.z;
    rigR = mat3(1.0) + (mat3(uShip) - mat3(1.0)) * w;
    rigT = uShip[3].xyz * w;
  } else if (type >= 2 && type <= 5) {
    vec4 c = uCrane[idx];
    rigT.z = c.x;
    if (type >= 3) rigT.x = c.y;
    if (type == 4) { rigT.y = c.z; rigT.x += c.w; }
    if (type == 5) { rigT.y = c.z * aRig.z; rigT.x += c.w * aRig.z; }
  } else if (type == 6) {
    mat4 M = uMob[idx];
    rigR = mat3(M);
    rigT = M[3].xyz;
  } else if (type == 7) {
    rigR = hbRotZ(uWheel.w);
    rigT = uWheel.xyz - rigR * uWheel.xyz;
  } else if (type == 8) {
    mat3 R = hbRotZ(uWheel.w);
    vec3 np = uWheel.xyz + R * (aPivot - uWheel.xyz);
    rigR = hbRotZ(0.045 * sin(uTime * 1.1 + aRig.z * 6.2832));
    rigT = np - rigR * aPivot;
  } else if (type == 9 || type == 10) {
    rigR = hbRotY(uCar.w);
    rigT = uCar.xyz - rigR * uCar.xyz;
    if (type == 10) rigT.y += 0.2 * sin(uCar.w * 3.0 + aRig.z * 6.2832);
  }
}
`;

const VERT_PARS = /* glsl */ `
attribute vec4 aEmit;
attribute vec2 aPat;
varying vec4 vEmit;
varying vec4 vPat;
`;

const VERT_PAT = /* glsl */ `
{
  float pid = aPat.x;
  vec2 puv = vec2(position.x + position.z, position.y);
  if (pid > 0.5 && pid < 1.5) puv = vec2(position.x * -normal.z + position.z * normal.x, position.y);
  else if (pid > 1.5 && pid < 2.5) puv = position.xz;
  else if (pid > 2.5 && pid < 3.5) puv = position.zx;
  vPat = vec4(pid, aPat.y, puv);
  vEmit = aEmit;
}
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vEmit;
varying vec4 vPat;
uniform float uLights;
uniform float uNight;
uniform float uRealTime;
uniform vec4 uFx;
float hbHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec3 hbHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

// surface patterns (after color_fragment): modulate albedo, store a tangent tilt for the normal
const FRAG_COLOR = /* glsl */ `
float hbTilt = 0.0;
float hbRough = -1.0;
{
  float pid = vPat.x;
  if (pid > 0.5 && pid < 1.5) {
    float x = vPat.z / max(vPat.y, 0.05);
    float fw = fwidth(x);
    float fade = 1.0 - smoothstep(0.3, 0.85, fw);
    float ph = x * 6.2832;
    diffuseColor.rgb *= 1.0 + 0.08 * sin(ph) * fade;
    hbTilt = cos(ph) * 0.5 * fade;
  } else if (pid > 1.5 && pid < 3.5) {
    float x = vPat.z / max(vPat.y, 0.05);
    float fi = floor(x);
    float f = fract(x);
    float fw = fwidth(x);
    float fade = 1.0 - smoothstep(0.25, 0.75, fw);
    float seam = 1.0 - smoothstep(0.0, fw * 1.2 + 0.05, min(f, 1.0 - f));
    float y = vPat.w / 3.7 + hbHash(fi * 0.37);
    float fy = fract(y);
    float wy = fwidth(y);
    float joint = 1.0 - smoothstep(0.0, wy * 1.2 + 0.006, min(fy, 1.0 - fy));
    float tone = 0.88 + 0.24 * hbHash(fi * 1.71 + floor(y) * 3.13);
    diffuseColor.rgb *= mix(1.0, tone, fade) * (1.0 - 0.42 * max(seam, joint) * fade);
  } else if (pid > 3.5 && pid < 4.5) {
    // hull: soft rust / grime streaks running down from the deck edge
    float s = vPat.z * 1.7;
    float n = hbHash(floor(s)) * 0.6 + hbHash(floor(s * 0.37) + 7.0) * 0.4;
    float streak = smoothstep(0.62, 1.0, n) * smoothstep(vPat.y - 2.6, vPat.y, vPat.w);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.48), streak * 0.55);
  } else if (pid > 4.5 && pid < 5.5) {
    // stone / concrete blocks: subtle block joints
    float bx = vPat.z / max(vPat.y, 0.2);
    float by = vPat.w / max(vPat.y * 0.5, 0.1);
    float row = floor(by);
    float fx = fract(bx + 0.5 * mod(row, 2.0));
    float fy = fract(by);
    float fw = max(fwidth(bx), fwidth(by));
    float fade = 1.0 - smoothstep(0.2, 0.6, fw);
    float j = 1.0 - smoothstep(0.0, fw + 0.03, min(min(fx, 1.0 - fx), min(fy, 1.0 - fy)));
    float tone = 0.93 + 0.12 * hbHash(floor(bx + 0.5 * mod(row, 2.0)) * 1.3 + row * 7.1);
    diffuseColor.rgb *= mix(1.0, tone * (1.0 - 0.3 * j), fade);
  } else if (pid > 5.5 && pid < 6.5) {
    hbRough = 0.12;
  }
}
`;

const FRAG_NORMAL = /* glsl */ `
if (abs(hbTilt) > 0.001) {
  vec3 hbUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 hbT = cross(hbUp, normal);
  float hbL = length(hbT);
  if (hbL > 0.25) normal = normalize(normal + hbT / hbL * hbTilt);
}
`;

const FRAG_EMIT = /* glsl */ `
if (dot(vEmit.rgb, vEmit.rgb) > 0.0) {
  float mode = floor(vEmit.w + 0.0005);
  float ph = fract(vEmit.w + 0.0005);
  float nightF = clamp(uLights * (0.45 + 0.55 * uNight), 0.0, 1.0);
  float t = uRealTime;
  float on = nightF;
  vec3 ec = vEmit.rgb;
  if (mode > 0.5 && mode < 1.5) {
    float c = fract(t * 0.7 + ph);
    on = (1.0 - smoothstep(0.05, 0.22, c)) * mix(0.6, 1.0, nightF) + 0.05 * nightF;
  } else if (mode > 1.5 && mode < 2.5) {
    float pi = mod(floor(t / 14.0), 3.0);
    if (pi < 0.5) {
      ec = hbHue(ph * 2.0 - t * 0.12) * 2.4;
    } else if (pi < 1.5) {
      float k = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin((ph * 18.0 - t * 1.4) * 6.2832));
      ec *= 0.2 + 1.25 * k;
    } else {
      float tw = step(0.5, hbHash(floor(t * 4.0) * 0.731 + floor(ph * 120.0) * 1.37));
      ec = mix(ec, hbHue(t * 0.04) * 2.4, 0.55) * (0.3 + 0.9 * tw);
    }
  } else if (mode > 2.5 && mode < 3.5) {
    on = mix(0.4, 1.0, nightF);
  } else if (mode > 3.5 && mode < 4.5) {
    int ci = int(ph * 4.0 + 0.5);
    float b = ci == 0 ? uFx.x : (ci == 1 ? uFx.y : uFx.z);
    float rot = pow(max(0.0, sin(t * 6.5 + ph * 9.0)), 4.0);
    on = b * (0.2 + 1.1 * rot);
  } else if (mode > 4.5 && mode < 5.5) {
    float k = step(0.5, fract(ph * 2.0 + floor(t * 2.2) * 0.5));
    on = mix(0.25, 1.0, nightF) * (0.45 + 0.55 * k);
  } else if (mode > 5.5 && mode < 6.5) {
    on = nightF * (0.8 + 0.6 * uFx.w);
  } else if (mode > 6.5) {
    float pi = mod(floor(t / 14.0), 3.0);
    float k;
    if (pi < 0.5) k = 0.75 + 0.25 * sin(t * 1.7 + ph * 3.0);
    else if (pi < 1.5) k = 0.15 + 1.1 * smoothstep(0.7, 1.0, 1.0 - abs(fract(ph * 1.5 - t * 0.7) - 0.5) * 2.0);
    else k = 0.25 + 0.75 * step(0.5, fract(t * 1.25 + ph * 0.5));
    on = nightF * k;
  }
  totalEmissiveRadiance += ec * on;
}
`;

// ──────────────────────────────────────────────────────── factories ──

export interface HarborMaterials {
  /** static meshes */
  solid: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  /** animated mesh (GPU rig) */
  rigged: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  /** shadow depth for the animated mesh */
  riggedDepth: THREE.MeshDepthMaterial;
  rig: RigUniforms;
}

export function createHarborMaterials(g: GlobalUniforms, lambert = false): HarborMaterials {
  const rig = createRigUniforms();
  const make = (rigged: boolean): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial => {
    const m = lambert ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
    m.name = rigged ? 'harbor-rigged' : 'harbor-solid';
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uLights: g.uLights,
        uNight: g.uNight,
        uRealTime: g.uRealTime,
        uFx: rig.uFx,
      });
      if (rigged) {
        Object.assign(shader.uniforms, {
          uTime: g.uTime,
          uShip: rig.uShip,
          uCrane: rig.uCrane,
          uMob: rig.uMob,
          uWheel: rig.uWheel,
          uCar: rig.uCar,
        });
      }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}${rigged ? RIG_PARS : ''}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${rigged ? 'rigSetup();\nobjectNormal = rigR * objectNormal;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${rigged ? 'transformed = rigR * transformed + rigT;' : ''}\n${VERT_PAT}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nif (hbRough >= 0.0) roughnessFactor = hbRough;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_NORMAL}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMIT}`);
    };
    m.customProgramCacheKey = () => (rigged ? 'tinyhaven-harbor-rigged-v1' : 'tinyhaven-harbor-solid-v1') + (lambert ? '-l' : '');
    return m;
  };
  const solid = make(false);
  const rigged = make(true);

  const riggedDepth = new THREE.MeshDepthMaterial();
  riggedDepth.name = 'harbor-rigged-depth';
  riggedDepth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: g.uTime,
      uShip: rig.uShip,
      uCrane: rig.uCrane,
      uMob: rig.uMob,
      uWheel: rig.uWheel,
      uCar: rig.uCar,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RIG_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nrigSetup();\ntransformed = rigR * transformed + rigT;`);
  };
  riggedDepth.customProgramCacheKey = () => 'tinyhaven-harbor-rigged-depth-v1';

  return { solid, rigged, riggedDepth, rig };
}

// ─────────────────────────────────────────────────────────── glows ──

/** glow behaviours (aMode.x) */
export const GLOW = { LIGHTS: 0, BLINK: 1, BEACON: 4, LANTERN: 6, FERRIS: 8 } as const;

export interface GlowPoint {
  x: number;
  y: number;
  z: number;
  /** half size (m) */
  size: number;
  /** flat light pool (on the ground) instead of a camera-facing halo */
  pool?: boolean;
  color: THREE.ColorRepresentation;
  intensity: number;
  /** fraction kept in daylight */
  day?: number;
  mode?: number;
  phase?: number;
  /** follow crane `crane` (0..2): 1 = gantry only, 2 = gantry + trolley */
  crane?: number;
  craneRig?: 1 | 2;
}

const GLOW_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aInfo;   // size, pool, intensity, day
attribute vec3 aTint;
attribute vec4 aMode;   // mode, phase, crane index (-1 none), crane rig (1 gantry, 2 + trolley)
uniform float uLights;
uniform float uNight;
uniform float uRealTime;
uniform vec4 uCrane[3];
uniform vec4 uFx;
varying vec2 vUv;
varying vec3 vCol;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = aCorner;
  float nightF = clamp(uLights * (0.45 + 0.55 * uNight), 0.0, 1.0);
  float mode = aMode.x;
  float on = max(nightF, aInfo.w);
  if (mode > 0.5 && mode < 1.5) {
    float c = fract(uRealTime * 0.7 + aMode.y);
    on = (1.0 - smoothstep(0.05, 0.22, c)) * max(nightF, aInfo.w);
  } else if (mode > 3.5 && mode < 4.5) {
    int ci = int(aMode.y * 4.0 + 0.5);
    float b = ci == 0 ? uFx.x : (ci == 1 ? uFx.y : uFx.z);
    on = b * pow(max(0.0, sin(uRealTime * 6.5 + aMode.y * 9.0)), 4.0) * max(nightF, 0.35);
  } else if (mode > 5.5 && mode < 6.5) {
    on = nightF * (0.35 + 1.4 * uFx.w);
  } else if (mode > 7.5) {
    on = nightF * (0.8 + 0.2 * sin(uRealTime * 0.9));
  }
  float k = aInfo.z * on;
  vCol = aTint * k;
  vec3 c = position;
  if (aMode.z > -0.5) {
    vec4 cr = uCrane[int(aMode.z + 0.5)];
    c.z += cr.x;
    if (aMode.w > 1.5) c.x += cr.y;
  }
  vec4 mvPosition;
  if (aInfo.y > 0.5) {
    mvPosition = modelViewMatrix * vec4(c + vec3(aCorner.x, 0.0, aCorner.y) * aInfo.x, 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(c, 1.0);
    mvPosition.xy += aCorner * aInfo.x;
  }
  if (k < 0.002) mvPosition = vec4(0.0, 0.0, 2.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
#include <common>
#include <fog_pars_fragment>
void main() {
  float r = length(vUv);
  float g = exp(-r * r * 5.0) * (1.0 - smoothstep(0.75, 1.0, r));
  g += exp(-r * r * 40.0) * 0.6;
  gl_FragColor = vec4(vCol * g, 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}
`;

export function createGlowMesh(g: GlobalUniforms, rig: RigUniforms, points: GlowPoint[]): THREE.Mesh {
  const n = points.length;
  const pos = new Float32Array(n * 12);
  const corner = new Float32Array(n * 8);
  const info = new Float32Array(n * 16);
  const tint = new Float32Array(n * 12);
  const mode = new Float32Array(n * 16);
  const idx: number[] = [];
  const c = new THREE.Color();
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  points.forEach((p, i) => {
    c.set(p.color);
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set([p.x, p.y, p.z], v * 3);
      corner.set(corners[k], v * 2);
      info.set([p.size, p.pool ? 1 : 0, p.intensity, p.day ?? 0], v * 4);
      tint.set([c.r, c.g, c.b], v * 3);
      mode.set([p.mode ?? 0, p.phase ?? 0, p.crane ?? -1, p.craneRig ?? 1], v * 4);
    }
    const b = i * 4;
    if (p.pool) idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    else idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  geo.setAttribute('aMode', new THREE.BufferAttribute(mode, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 8;
  const mat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  mat.name = 'harbor-glow';
  mat.uniforms.uLights = g.uLights;
  mat.uniforms.uNight = g.uNight;
  mat.uniforms.uRealTime = g.uRealTime;
  mat.uniforms.uCrane = rig.uCrane;
  mat.uniforms.uFx = rig.uFx;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'harbor-glows';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

// ──────────────────────────────────────────────────── lighthouse beam ──

const BEAM_VERT = /* glsl */ `
attribute float aT;
varying float vT;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <fog_pars_vertex>
void main() {
  vT = aT;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const BEAM_FRAG = /* glsl */ `
uniform float uBeam;
uniform vec3 uColor;
varying float vT;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <fog_pars_fragment>
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 3.2);
  float along = pow(1.0 - vT, 2.3) * smoothstep(0.0, 0.05, vT);
  float k = uBeam * core * along;
  gl_FragColor = vec4(uColor * k, 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}
`;

/** two opposite soft cones along ±X from the origin (rotate the mesh about Y) */
export function createBeamMesh(length: number, r0: number, r1: number, tilt: number): { mesh: THREE.Mesh; uniforms: { uBeam: { value: number } } } {
  const seg = 18,
    rows = 10;
  const P: number[] = [],
    N: number[] = [],
    T: number[] = [],
    I: number[] = [];
  for (const dir of [1, -1]) {
    const base = P.length / 3;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const x = t * length;
      const r = r0 + (r1 - r0) * t;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const cy = Math.cos(a),
          sz = Math.sin(a);
        P.push(dir * x, -x * tilt + cy * r, sz * r);
        N.push(0, cy, sz);
        T.push(t);
      }
    }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i;
        const b = a + seg + 1;
        I.push(a, b, b + 1, a, b + 1, a + 1);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  geo.setIndex(I);
  geo.computeBoundingSphere();
  const uniforms = { uBeam: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#fff1c9') } }]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  mat.name = 'harbor-lighthouse-beam';
  mat.uniforms.uBeam = uniforms.uBeam;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'harbor-lighthouse-beam';
  mesh.renderOrder = 4;
  return { mesh, uniforms };
}
