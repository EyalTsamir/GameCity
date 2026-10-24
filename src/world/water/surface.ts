// Water surfaces (sea, river, pond) as one mesh / one draw call.
//
// Shading (per pixel, world space):
//   * normals: analytic swell + two scrolling ripple-map samples (water/noise.ts, mip-filtered;
//     the lost normal variance widens glitter and blurs reflections instead of shimmering) +
//     fine analytic ripples faded by the pixel footprint; strength follows a macro "wind" field
//     (glassy slicks vs ruffled streaks, 60–250 m features) so the sea reads from the overview
//   * body colour: sea depth bands (sand-lit turquoise → teal → deep blue) with broad colour
//     patches, clear green-teal river with flow streaks, mossy pond; deep indigo at night;
//     lit by three's lights (shadows, hemisphere, environment) + the night lamp map
//   * reflection (Fresnel weighted, independent of transparency): analytic sky that mirrors the
//     sky dome (gradient + warm sun-side glow, read from the dome's uniforms each frame) under the
//     planar reflection texture (water/reflection.ts, premultiplied, distorted by the normals,
//     smeared toward the viewer, mip-blurred by roughness and footprint)
//   * sun glitter path (GGX lobe widened by roughness/variance) + sparkles, moon glint; with the
//     reflection pass off, lamp streaks come from the lamp light map
//   * contact: oblique hull footprints (water/hulls.ts) → contact shadow + lacy foam line
//   * foam: shoreline + swash, breaking lines on the beach, wall lapping
// Specular from three's lighting is dropped; the final colour is composited so that
// out = body·α·(1−F) + reflection·F + glints, alpha = α(1−F) + F.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { SLAB, WATER_LEVEL, RIVER } from '../../core/constants';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import type { TerrainModel } from '../terrain/height';
import type { WaterField } from './field';
import { ampFrom } from './field';
import { WAVES_GLSL } from './waves';
import { rippleTexture, macroTexture } from './noise';
import type { ReflectionUniforms } from './reflection';
import type { HullContacts } from './hulls';
import { MAX_HULLS } from './hulls';
import type { WaterExtension } from './extension';
import { WORLD_MODE } from '../../core/world';

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

/** sky uniforms the water mirrors (values copied from the sky dome every frame by water.ts) */
export function createSkyUniforms(): Record<string, THREE.IUniform> {
  return {
    uSkyZen: { value: new THREE.Color('#5896d8') },
    uSkyHor: { value: new THREE.Color('#d8e8f2') },
    uSkyGlow: { value: new THREE.Color('#fff2dc') },
    uSkyGlowI: { value: 0.3 },
    uSkySunCol: { value: new THREE.Color('#fff4e0') },
    uSkySunVis: { value: 1 },
    uSkyMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uSkyMoonVis: { value: 0 },
    uSkyOvercast: { value: 0 },
  };
}

export function createSurface(
  ctx: CityContext,
  model: TerrainModel,
  field: WaterField,
  refl: ReflectionUniforms,
  hulls: HullContacts,
  sky: Record<string, THREE.IUniform>,
  ext: WaterExtension | null = null,
): SurfaceResult {
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
  // slab vertices sample the field texture (aFld.w = −1); world mode appends the sea / river
  // extension beyond the slab with its own per-vertex field values (water/extension.ts)
  const fldA: number[] = new Array((pos.length / 3) * 4).fill(0);
  for (let k = 3; k < fldA.length; k += 4) fldA[k] = -1;
  if (ext) {
    const base = pos.length / 3;
    for (let k = 0; k < ext.pos.length; k++) pos.push(ext.pos[k]);
    for (let k = 0; k < ext.wave.length; k++) wav.push(ext.wave[k]);
    for (let k = 0; k < ext.fld.length; k++) fldA.push(ext.fld[k]);
    for (let k = 0; k < ext.index.length; k++) idx.push(ext.index[k] + base);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('aWave', new THREE.Float32BufferAttribute(wav, 2));
  geo.setAttribute('aFld', new THREE.Float32BufferAttribute(fldA, 4));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  // generous bounds: waves move the surface a little
  geo.boundingBox!.expandByScalar(0.5);

  const C = (h: string) => ({ value: new THREE.Color(h) });
  const uniforms: Record<string, THREE.IUniform> = {
    tWN: { value: rippleTexture() },
    tWM: { value: macroTexture() },
    tField: { value: field.tex },
    uSlabXf: { value: new THREE.Vector4(SLAB.x0, SLAB.z0, 1 / (SLAB.x1 - SLAB.x0), 1 / (SLAB.z1 - SLAB.z0)) },
    uSlabBox: { value: new THREE.Vector4(SLAB.x0, SLAB.z0, SLAB.x1, SLAB.z1) },
    uTime: ctx.uniforms.uTime,
    uNight: ctx.uniforms.uNight,
    uDaylight: ctx.uniforms.uDaylight,
    uDusk: ctx.uniforms.uDusk,
    uLights: ctx.uniforms.uLights,
    uSunDir: ctx.uniforms.uSunDir,
    uWind: ctx.uniforms.uWind,
    ...sky,
    ...refl,
    ...hulls.uniforms,
    ...lampUniforms(),
    wShallow: C('#4cc6b6'),
    wMid: C('#1a6f8e'),
    wDeep: C('#0f3d62'),
    wRivS: C('#4aa48a'),
    wRivD: C('#1a5552'),
    wPondS: C('#6d9a72'),
    wPondD: C('#2c5640'),
    wFoam: C('#f4fbff'),
    wNightTint: C('#5a68b0'),
    /** debug: x = reflection gain, y = body gain, z = glint gain, w = foam gain */
    wDebug: { value: new THREE.Vector4(1, 1, 1, 1) },
  };

  const VERT_PARS = /* glsl */ `
attribute vec2 aWave;
attribute vec4 aFld;
uniform float uTime;
varying vec3 vWW;
varying vec2 vWave;
varying vec4 vFld;
varying float vDisp;
float th_disp;
${WAVES_GLSL}
`;
  const FRAG_PARS = /* glsl */ `
uniform sampler2D tWN;
uniform sampler2D tWM;
uniform sampler2D tField;
uniform sampler2D tRefl;
uniform mat4 uReflMat;
uniform vec4 uReflInfo;
uniform vec4 uSlabXf;
uniform vec4 uSlabBox;
uniform float uTime;
uniform float uNight;
uniform float uDaylight;
uniform float uDusk;
uniform float uLights;
uniform vec3 uSunDir;
uniform vec2 uWind;
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uSkyGlow;
uniform float uSkyGlowI;
uniform vec3 uSkySunCol;
uniform float uSkySunVis;
uniform vec3 uSkyMoonDir;
uniform float uSkyMoonVis;
uniform float uSkyOvercast;
uniform vec4 uHullA[${MAX_HULLS}];
uniform vec4 uHullB[${MAX_HULLS}];
uniform vec4 uHullC[${MAX_HULLS}];
uniform int uHullN;
uniform vec3 wShallow;
uniform vec3 wMid;
uniform vec3 wDeep;
uniform vec3 wRivS;
uniform vec3 wRivD;
uniform vec3 wPondS;
uniform vec3 wPondD;
uniform vec3 wFoam;
uniform vec3 wNightTint;
uniform vec4 wDebug;
varying vec3 vWW;
varying vec2 vWave;
varying vec4 vFld;
varying float vDisp;
${LAMP_GLSL}
${WAVES_GLSL}

vec3 wN = vec3(0.0, 1.0, 0.0);
vec3 wRefl = vec3(0.0);
vec3 wBodyGlow = vec3(0.0);
vec3 wGlint = vec3(0.0);
float wAlphaB = 1.0;
float wF = 0.0;
float wFoamA = 0.0;
float wShadow = 1.0;
float wGlintK = 0.0;
vec3 wSunL = vec3(0.0, 1.0, 0.0);
float wGlintA2 = 0.01;
float wSparkle = 0.0;

float wHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// the sky dome's painted gradient + sun-side glow (render/sky/dome.ts), without disc/stars
vec3 wSky(vec3 d) {
  float y = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uSkyHor, uSkyZen, smoothstep(0.0, 1.0, pow(y, 0.55)));
  vec3 sd = normalize(vec3(uSunDir.x, max(uSunDir.y, -0.25), uSunDir.z));
  vec2 dh = normalize(d.xz + vec2(1e-5));
  vec2 sh = normalize(sd.xz + vec2(1e-5));
  float az = dot(dh, sh) * 0.5 + 0.5;
  float band = exp(-abs(d.y - max(sd.y, 0.0) * 0.35) * 5.0);
  float glow = (pow(az, 3.0) * 0.85 + pow(max(dot(d, sd), 0.0), 24.0) * 0.6) * band;
  col += uSkyGlow * uSkyGlowI * glow;
#if defined(TH_ATMO) && defined(USE_FOG)
  // world: the low sky in this azimuth is the atmosphere's horizon haze (warm toward the sun, cool and
  // blue away from it) — exactly what the dome shows at the horizon, so the sea mirrors the real sky
  vec3 hz = thHazeColor(normalize(vec3(d.x, max(d.y, 0.0), d.z) + vec3(1e-5, 0.0, 0.0))) * thAtmo[10].y;
  col = mix(hz, col, smoothstep(0.02, 0.4, y));
#endif
  float grey = dot(col, vec3(0.3, 0.55, 0.15));
  return mix(col, vec3(grey) * vec3(0.92, 0.96, 1.02), uSkyOvercast * 0.75);
}

// waterline half-width of hull i at u (-1 stern .. 1 bow)
float wHullW(float u, vec4 B, float transom) {
  if (u > B.z) {
    float s = clamp((u - B.z) / (1.0 - B.z), 0.0, 1.0);
    return B.y * sqrt(max(0.0, 1.0 - pow(s, 2.2)));
  }
  if (u < B.w) {
    float s = clamp((u + 1.0) / (B.w + 1.0), 0.0, 1.0);
    return B.y * (transom + (1.0 - transom) * sqrt(s * s * (3.0 - 2.0 * s)));
  }
  return B.y;
}

vec4 waterBase() {
  vec3 p = vWW;
  float t = uTime;
  // slab: baked field texture; beyond the slab (world mode): per-vertex field values
  vec4 fld = vFld.w < -0.5 ? texture2D(tField, (p.xz - uSlabXf.xy) * uSlabXf.zw) : vFld;
  float depth = fld.r + vDisp;
  float shore = fld.g;
  float beach = fld.b;
  float region = fld.a;
  float amp = vWave.x;
  float mSea = 1.0 - smoothstep(0.15, 0.4, region);
  float mPond = smoothstep(0.75, 0.95, region);
  float mRiv = (1.0 - mSea) * (1.0 - mPond);

  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  // metres per pixel (box-filter scale for everything procedural)
  float fp = max(length(fwidth(p.xz)), 1e-3);

  // ── wind frame + macro field (survives the overview distance)
  vec2 wdir = normalize(uWind + vec2(1e-4, 0.0));
  vec2 wper = vec2(-wdir.y, wdir.x);
  vec2 pw = vec2(dot(p.xz, wdir), dot(p.xz, wper));
  vec4 mA = texture2D(tWM, pw * (1.0 / 270.0) + vec2(-t * 0.0019, 0.0));
  vec4 mB = texture2D(tWM, p.xz * (1.0 / 160.0) + vec2(-t * 0.0012, t * 0.0008));
  vec2 pr = vec2(p.x - t * 0.33, p.z);
  vec4 mR = texture2D(tWM, pr * vec2(1.0 / 70.0, 1.0 / 16.0));
  // 0 glassy slick .. 1 ruffled: broad patches + long glassy wind slicks (lanes along the wind)
  float slick = smoothstep(0.6, 0.78, mA.r) * mSea;
  float ruff = clamp(0.55 + 1.5 * (mB.g - 0.5) + 0.5 * (mA.r - 0.5), 0.0, 1.0);
  ruff *= 1.0 - 0.85 * slick;
  ruff = mix(ruff, clamp(0.38 + 1.2 * (mR.r - 0.5), 0.0, 1.0), mRiv);
  ruff = mix(ruff, 0.12, mPond);
  float calm = 0.3 + 0.7 * smoothstep(0.05, 1.4, depth);

  // ── normals
  vec2 g = vec2(0.0);
  th_swellG(p.xz, t, g);
  vec2 tilt = -g * amp;
  // ripple map, two scales: tile frame (u = downwind)
  vec4 r1 = texture2D(tWN, pw * (1.0 / 29.0) + vec2(-t * 0.024, 0.0));
  vec2 pw2 = vec2(dot(pw, vec2(0.80, 0.60)), dot(pw, vec2(-0.60, 0.80)));
  vec4 r2 = texture2D(tWN, pw2 * (1.0 / 10.3) + vec2(-t * 0.052, t * 0.009));
  vec3 n1 = r1.xyz * 2.0 - 1.0;
  vec3 n2 = r2.xyz * 2.0 - 1.0;
  float l1 = length(n1), l2 = length(n2);
  float var1 = (1.0 - l1) / max(l1, 0.05);
  float var2 = (1.0 - l2) / max(l2, 0.05);
  vec2 s1 = n1.xz / max(n1.y, 0.25);
  vec2 s2 = n2.xz / max(n2.y, 0.25);
  // the finer octave fades with the pixel footprint (no distant 'dash' noise), the coarse one less
  float k1 = mix(0.1, 0.34, ruff) * calm * mix(1.0, 0.55, mRiv) * mix(1.0, 0.25, mPond) * (1.0 - 0.4 * smoothstep(0.15, 0.45, fp));
  float k2 = mix(0.06, 0.25, ruff) * calm * mix(1.0, 0.7, mRiv) * mix(1.0, 0.3, mPond) * (1.0 - 0.75 * smoothstep(0.07, 0.3, fp));
  vec2 rt = s1 * k1 + s2 * k2;
  tilt += wdir * rt.x + wper * rt.y;
  // river: flow ripples drift east
  vec4 rf = texture2D(tWN, vec2(p.x * 0.11 - t * 0.075, p.z * 0.23));
  tilt += (rf.xz * 2.0 - 1.0) * vec2(0.05, 0.12) * mRiv * calm;
  // fine analytic ripples, box-filtered by the footprint
  vec2 gr = vec2(0.0);
  th_ripple(p.xz, t, gr);
  tilt -= gr * calm * (0.6 + 0.4 * amp) * (1.0 - smoothstep(0.12, 0.45, fp));
  wN = normalize(vec3(tilt.x, 1.0, tilt.y));
  // unresolved slope variance (mip + footprint) → roughness
  float wVar = var1 * k1 * k1 * 2.2 + var2 * k2 * k2 * 2.2 + smoothstep(0.1, 0.6, fp) * 0.004;

  // ── body colour
  float d = max(depth, 0.0);
  float band = d / 1.5;
  float dq = (floor(band) + smoothstep(0.3, 0.7, fract(band))) * 1.5;
  float dS = mix(d, dq, 0.3);
  vec3 seaC = mix(wShallow, wMid, smoothstep(0.0, 2.3, dS));
  seaC = mix(seaC, wDeep, smoothstep(2.0, 7.5, dS));
  // broad patches: greener / bluer, lighter / darker (readable from far away)
  float pt = mB.g - 0.5;
  seaC *= vec3(1.0 - 0.3 * pt, 1.0 + 0.08 * pt, 1.0 + 0.16 * pt) * (0.88 + 0.26 * mA.g);
  vec3 rivC = mix(wRivS, wRivD, smoothstep(0.0, 2.0, d));
  rivC *= 0.9 + 0.2 * mR.r;
  // pond: peat-dark in the middle, clearer and greener over the shallow margins
  vec3 pondC = mix(wPondS, wPondD * 0.75, smoothstep(0.0, 0.8, d));
  vec3 wc = mix(seaC, rivC, smoothstep(0.15, 0.45, region));
  wc = mix(wc, pondC, mPond);
  wc = mix(wc, wc * wNightTint, uNight * 0.85);
  // golden hour: keep a saturated teal body under the warm light (not milky tea)
  wc = mix(wc, wc * vec3(0.72, 1.06, 1.22), 0.55 * uDusk * (1.0 - uNight));

  // ── Fresnel
  float ndv = clamp(dot(wN, V), 0.0, 1.0);
  float F0 = mix(mix(0.38, 0.3, mRiv), 0.34, mPond);
  float F = mix(F0, 0.92, pow(1.0 - ndv, 4.0));
  // glassy slicks mirror more than ruffled patches (macro tonal variation that survives distance)
  F = min(0.95, F * mix(1.16, 0.84, ruff) * (1.0 + 0.22 * slick));
  // blue hour: less mirror, more macro variation (else the sea is one flat sky-coloured plane)
  float bhF = smoothstep(0.08, 0.4, uNight) * (1.0 - smoothstep(0.75, 1.0, uNight));
  F *= (1.0 - 0.25 * bhF) * mix(1.0, mix(1.12, 0.85, ruff) * (1.0 + 0.15 * slick), bhF);
  // turquoise shallows keep their colour (stylised: less mirror over the sandy shelf)
  F *= mix(0.62, 1.0, smoothstep(0.3, 2.2, depth));

  // ── reflection: analytic sky under the planar reflection
  vec3 R = reflect(-V, wN);
  R.y = abs(R.y) + 0.01;
  vec3 sky = wSky(normalize(R));
  // daytime: the studio horizon is near white; mirror it a little deeper so grazing water stays blue
  sky = mix(sky, uSkyZen * 1.05, 0.22 * (1.0 - uDusk) * (1.0 - uNight));
  // blue hour: the horizon / table go lilac — mirror more of the deep-blue zenith so the water keeps
  // reading as water (golden hour has uNight ≈ 0 and is untouched)
  float bh = smoothstep(0.08, 0.4, uNight) * (1.0 - smoothstep(0.75, 1.0, uNight));
  sky = mix(sky, uSkyZen * 1.3, 0.4 * bh);
  // night: keep the sea a deep readable indigo (the night zenith alone mirrors to near black)
  sky = mix(sky, uSkyHor * 1.5 + vec3(0.004, 0.006, 0.02), 0.45 * smoothstep(0.75, 1.0, uNight));
#ifdef TH_WORLD
  // golden hour (world): the low sky is a pale warm haze, and a sea mirroring it reads pale grey from the
  // hero views — mirror the deeper sky above the haze band and show more of the teal body, except close
  // to the sun's azimuth (the warm sky path under the sun stays)
  {
    vec2 rh = normalize(R.xz + vec2(1e-5, 0.0));
    vec2 shz = normalize(uSunDir.xz + vec2(1e-5, 0.0));
    float gk = uDusk * (1.0 - uNight) * (1.0 - 0.75 * smoothstep(0.55, 0.95, dot(rh, shz)));
    sky = mix(sky, uSkyZen * vec3(0.85, 1.0, 1.12), 0.55 * gk);
    F *= 1.0 - 0.38 * gk;
  }
#endif
  vec4 rc = vec4(0.0);
  float reflW = uReflInfo.x * (1.0 - mPond);
#ifdef TH_DIORAMA
  // fade toward the slab's cut faces
  vec2 eb = min(p.xz - uSlabBox.xy, uSlabBox.zw - p.xz);
  reflW *= smoothstep(0.0, 2.5, min(eb.x, eb.y));
#endif
  if (reflW > 0.001) {
    vec2 vh = normalize(V.xz + vec2(1e-5, 0.0));
    vec2 vs = vec2(-vh.y, vh.x);
    // distortion (m): reflections smear toward the viewer more than sideways
    vec2 dt = tilt - (-g * amp) * 0.6;
    float kd = mix(2.2, 5.0, ruff) * (0.6 + 0.4 * min(dist / 150.0, 1.5)) * (1.0 - 0.35 * smoothstep(200.0, 600.0, dist));
    vec2 off = vh * dot(dt, vh) * kd * 2.4 + vs * dot(dt, vs) * kd * 0.8;
    vec4 c0 = uReflMat * vec4(p.x, ${WATER_LEVEL.toFixed(2)}, p.z, 1.0);
    vec2 uv0 = c0.xy / c0.w;
    vec4 c1 = uReflMat * vec4(p.x + off.x, ${WATER_LEVEL.toFixed(2)}, p.z + off.y, 1.0);
    vec2 uv = c1.xy / c1.w;
    vec4 c2 = uReflMat * vec4(p.x + off.x + vh.x, ${WATER_LEVEL.toFixed(2)}, p.z + off.y + vh.y, 1.0);
    vec2 su = c2.xy / c2.w - uv;
    vec2 duv = fwidth(uv0) * uReflInfo.yz;
    float lod0 = log2(max(max(duv.x, duv.y), 1e-3));
    float lod = clamp(lod0 + 0.35 + 1.4 * ruff + min(25.0 * wVar, 2.0), 0.0, uReflInfo.w);
    // far away the waves break a reflection into a soft, short, darker smear (no ghost copies)
    float farR = smoothstep(140.0, 520.0, dist);
    float sl = (0.8 + 2.2 * ruff) * exp2(lod) * mix(1.0, 0.45, farR);
    vec2 st = su * (sl / max(length(su * uReflInfo.yz), 1e-3));
    rc = textureLod(tRefl, uv, lod) * 0.5;
    rc += textureLod(tRefl, uv + st, lod) * 0.25;
    rc += textureLod(tRefl, uv - st, lod + 0.5) * 0.25;
    vec2 ed = min(uv, 1.0 - uv);
    rc *= smoothstep(0.0, 0.02, min(ed.x, ed.y)) * reflW;
    rc.rgb *= mix(1.0, 0.62, farR);
    rc *= 1.0 - farR * (0.3 + 0.35 * ruff);
  }

  // ── hull contact: contact shadow + foam line
  float hDark = 0.0, hFoam = 0.0;
  for (int i = 0; i < ${MAX_HULLS}; i++) {
    if (i >= uHullN) break;
    vec4 A = uHullA[i];
    vec4 B = uHullB[i];
    vec4 Ch = uHullC[i];
    vec2 dp = p.xz - A.xy;
    float rr = B.x + 9.0;
    if (dot(dp, dp) > rr * rr) continue;
    float qa = dot(dp, A.zw);
    float qx = dot(dp, vec2(A.w, -A.z));
    float u = qa / B.x;
    float w = wHullW(u, B, Ch.x);
    float dx = abs(qx) - w;
    float dy = abs(qa) - B.x;
    float sd = max(dx, dy);
    if (dx > 0.0 && dy > 0.0) sd = length(vec2(dx, dy));
    float sc = clamp(B.y * 0.45, 0.25, 3.0);
    float dk = exp(-max(sd, 0.0) / (0.75 * sc + 0.35)) * smoothstep(-0.4, 0.02, sd);
    hDark = max(hDark, dk * Ch.w);
    float bow = smoothstep(0.15, 0.95, u);
    float spd = min(Ch.y / 3.0, 1.5);
    float fw = (0.14 + 0.09 * min(sc, 1.6)) * (1.0 + bow * (0.5 + spd) + spd * 0.35);
    float ring = (1.0 - smoothstep(0.0, fw, sd)) * smoothstep(-0.3, 0.0, sd);
    hFoam = max(hFoam, ring * Ch.z * (0.6 + 0.4 * bow + 0.35 * spd));
  }

  // ── foam: shoreline + swash, beach wave lines, wall lapping, hull lines
  vec4 lc = texture2D(tWM, p.xz * (1.0 / 9.0) + vec2(t * 0.011, -t * 0.007));
  vec4 lf = texture2D(tWM, p.xz * (1.0 / 3.1) - vec2(t * 0.017, t * 0.023));
  float lace = lc.b * 0.6 + lf.b * 0.4;
  float swash = 0.5 + 0.5 * sin(t * 0.85 - shore * 0.9);
  float edge = (1.0 - smoothstep(0.0, (0.12 + 0.16 * lace + 0.1 * swash) * mix(1.0, 0.35, mPond), depth)) * smoothstep(-0.02, 0.02, depth);
  float ph = fract(shore * 0.17 + t * 0.11);
  float lw = max(0.05, fp * 0.25);
  float line = smoothstep(0.84 - lw, 0.95, ph) * (1.0 - smoothstep(0.95, 0.995 + lw, ph));
  line *= beach * mSea * smoothstep(0.8, 2.5, shore) * (1.0 - smoothstep(7.0, 15.0, shore));
  line *= smoothstep(0.42, 0.68, mB.b);
  float lap = (1.0 - smoothstep(0.2, 0.95, shore)) * (1.0 - beach) * (0.55 + 0.45 * sin(t * 1.6 + (p.x + p.z) * 0.8));
  hFoam *= smoothstep(0.2, 0.62, lace * (0.7 + 0.6 * hFoam) + 0.15 * sin(t * 2.1 + dot(p.xz, vec2(1.3, 0.9))));
  float foam = clamp(max(max(edge, line * 0.8), max(lap * 0.55, hFoam * 0.95)), 0.0, 1.0);
  foam *= mix(0.55, 1.0, smoothstep(0.25, 0.65, lace));
  foam *= 1.0 - 0.85 * mPond;
  foam *= wDebug.w;

  // ── glints (sun / moon), evaluated after lighting (needs the shadow term)
  wSunL = normalize(uSunDir);
  // golden hour: a hotter, narrower path toward the low sun
  float roughA2 = clamp(0.0012 + wVar * 0.9 + ruff * ruff * 0.006, 0.0008, 0.06) * mix(1.0, 0.6, uDusk);
  wGlintA2 = roughA2;
  float sunUp = smoothstep(-0.03, 0.06, wSunL.y) * uSkySunVis;
  wGlintK = sunUp * (1.0 - uSkyOvercast * 0.9) * (1.0 + 0.6 * uDusk);
  // sparkles: point glints — random wave facets on a 0.35 m grid flash when they face the light;
  // ~1-2 px wide whatever the distance, faded out before they could alias
  {
    float cs = 0.35;
    vec2 cq = p.xz / cs;
    vec2 ci = floor(cq);
    float seed = wHash12(ci);
    float h = wHash12(ci + floor(t * (1.3 + seed * 1.6) + seed * 7.0) * 13.17);
    vec2 o = (vec2(wHash12(ci + 3.1), wHash12(ci + 7.7)) - 0.5) * 0.6;
    float r = length(fract(cq) - 0.5 - o) * cs;
    float rad = max(0.025, fp * 0.75);
    wSparkle = step(mix(0.94 - 0.03 * ruff, 0.975, uNight), h) * (1.0 - smoothstep(rad * 0.4, rad, r)) * (1.0 - smoothstep(0.05, 0.2, fp)) * (0.3 + 0.7 * ruff) * calm * (1.0 - mPond);
  }
  // moon
  // moon path: a calm, narrow silvery streak — Beckmann lobe about the half vector (tight, short
  // tails), a faint sheen and sparse pinpoint glints inside the lobe; peak capped well below the night
  // bloom threshold (only single glints may touch it), much weaker than the sun path
  vec3 moon = vec3(0.0);
  float moonI = uSkyMoonVis * uNight * (1.0 - 0.7 * mRiv) * (1.0 - 0.9 * uSkyOvercast);
  if (moonI > 0.001) {
    vec3 Lm = normalize(uSkyMoonDir);
    float nhm = max(dot(wN, normalize(Lm + V)), 1e-3);
    float c2m = nhm * nhm;
    float t2m = (1.0 - c2m) / c2m;
    float a2m = clamp(0.0012 + wVar * 0.5 + ruff * ruff * 0.003, 0.0008, 0.02);
    float core = exp(-t2m / a2m);
    float sheen = exp(-t2m / (a2m * 6.0 + 0.006));
    float pins = wSparkle * exp(-t2m / (a2m * 2.5 + 0.002));
    moon = vec3(0.72, 0.8, 1.0) * min(core * 0.26 + sheen * 0.025 + pins * 0.7, 0.75) * moonI;
  }

  // night lights when the reflection pass is off: the lamp light (contract function of
  // core/lampLight.ts — never decode the map here, its encoding belongs to the lamps module) where the
  // reflected ray reaches lamp-head height (streaks toward the viewer through the anisotropic normal)
  vec3 lampR = vec3(0.0);
  if (uReflInfo.x < 0.5 && uLampGain > 0.01 && mPond < 0.5) {
    vec2 vh = normalize(V.xz + vec2(1e-5, 0.0));
    vec2 dt = tilt + g * amp;
    vec3 Ns = normalize(vec3(dt.x * 0.4, 1.0, dt.y * 0.4) + vec3(vh.x, 0.0, vh.y) * dot(dt, vh) * 3.0);
    vec3 Rs = reflect(-V, Ns);
    vec2 q = p.xz + Rs.xz / max(Rs.y, 0.12) * 6.0;
    lampR = min(thLampLight(vec3(q.x, 0.2, q.y), vec3(0.0, 1.0, 0.0)), vec3(3.0)) * 0.12;
  }

  // ── outputs for the final composite
  float alpha = smoothstep(0.0, 0.28, depth) * mix(0.6, 0.94, smoothstep(0.25, 3.4, depth));
  alpha = mix(alpha, smoothstep(0.0, 0.25, depth) * mix(0.55, 0.88, smoothstep(0.2, 2.2, depth)), mRiv);
  alpha = mix(alpha, min(1.0, alpha * 1.3 + 0.1), mPond);
  wAlphaB = max(alpha, foam * 0.95);
  wFoamA = foam;
  wF = F * (1.0 - foam) * wDebug.x;
  // without the reflection pass: quay walls / steep banks still mirror as a dark band at the waterline
  float wallR = (1.0 - smoothstep(0.2, 2.6, shore)) * (1.0 - beach) * (1.0 - uReflInfo.x) * (1.0 - mPond);
  vec3 skyD = sky * (1.0 - hDark * 0.55) * (1.0 - 0.55 * wallR);
  // the pond has no planar reflection (another plane): its banks — reeds, shrubs, trees — mirror as a
  // dark band that thins toward the middle; backlit at golden hour they glow warm
  float pondBank = (1.0 - smoothstep(0.6, 5.5, shore + 1.2 * (lc.g - 0.5))) * mPond;
  vec3 vegR = vec3(0.025, 0.04, 0.018) + uSkySunCol * vec3(0.05, 0.04, 0.012) * uDusk;
  if (mPond > 0.01) {
    // beyond the band, the park round the pond (trees ~8–12 m tall, ~30 m away) fills the low part of
    // its mirror: reflected rays below an irregular tree line see foliage, above it the sky
    vec3 Rn = normalize(R);
    float tanE = Rn.y / max(length(Rn.xz), 1e-3);
    float az = atan(Rn.z, Rn.x);
    float tline = 0.24 + 0.07 * sin(az * 5.0 + 1.3) + 0.05 * sin(az * 11.0 + 0.7) + 0.03 * sin(az * 23.0 + 2.1);
    float veg = (1.0 - smoothstep(tline - 0.03, tline + 0.03, tanE)) * mPond;
    vec3 trees = vec3(0.03, 0.05, 0.026) * (0.8 + 0.4 * lc.b) + uSkySunCol * vec3(0.045, 0.05, 0.016) * (0.5 + 0.8 * uDusk);
    skyD = mix(skyD, trees * (1.0 - 0.85 * uNight), veg * 0.88);
  }
  skyD = mix(skyD, vegR, pondBank * 0.85);
  wRefl = skyD * (1.0 - rc.a) + rc.rgb + moon + lampR;
  wGlint = vec3(0.0);
  vec3 foamC = wFoam * mix(1.0, 0.45, uNight);
  vec3 base = mix(wc * (1.0 - hDark * 0.4) * wDebug.y, foamC, foam);
#ifdef TH_WORLD
  // golden hour (world): sky light scattered inside the water keeps the body a readable teal-blue
  // under the weak low sun (without it the sea is only a dim mirror of the pale haze)
  {
    // radiance tied to the sky's brightness, hue from the body colour (unit luminance, a little greyed)
    vec3 LW = vec3(0.2126, 0.7152, 0.0722);
    float skyL = dot(uSkyZen * 0.5 + uSkyHor * 0.5, LW);
    vec3 wcN = mix(vec3(1.0), wc / max(dot(wc, LW), 1e-4), 0.7);
    wBodyGlow = wcN * skyL * 0.3 * uDusk * (1.0 - uNight) * (1.0 - foam) * (1.0 - mPond) * wDebug.y;
  }
#endif
  return vec4(base, wAlphaB);
}
`;

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true });
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
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += th_disp;\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWave = aWave;\nvFld = aFld;\nvDisp = th_disp;');
    shader.fragmentShader = shader.fragmentShader
      // after the fog pars: the world-mode sky reflection uses the atmosphere's horizon ring
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + FRAG_PARS)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = waterBase();')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
  // direct-light visibility (shadow) = actual / unshadowed diffuse of the key light
  float th_dnl = saturate(dot(normal, directionalLights[0].direction));
  vec3 th_un = th_dnl * directionalLights[0].color * diffuseColor.rgb * RECIPROCAL_PI;
  float th_lu = dot(th_un, vec3(0.3, 0.6, 0.1));
  wShadow = th_lu > 1e-5 ? clamp(dot(reflectedLight.directDiffuse, vec3(0.3, 0.6, 0.1)) / th_lu, 0.0, 1.0) : 1.0;
}
#endif
reflectedLight.directSpecular = vec3(0.0);
reflectedLight.indirectSpecular = vec3(0.0);
reflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vWW, vec3(0.0, 1.0, 0.0)) * 0.55;
{
  // sun glitter: Beckmann lobe (roughness from ripples, variance, wind) + point glints, shadowed
  vec3 th_V = normalize(cameraPosition - vWW);
  vec3 th_H = normalize(wSunL + th_V);
  float th_nh = max(dot(wN, th_H), 1e-3);
  float th_c2 = th_nh * th_nh;
  float th_t2 = (1.0 - th_c2) / th_c2;
  // Beckmann lobe (short tails: a path, not a sheen over the whole sea)
  float th_lobe = exp(-th_t2 / wGlintA2);
  float th_D = th_lobe / (PI * wGlintA2 * th_c2 * th_c2);
  float th_nl = max(dot(wN, wSunL), 0.0);
  float th_wide = exp(-th_t2 / (wGlintA2 * 5.0 + 0.004));
  float th_sp = th_D * th_nl * 0.05 + wSparkle * 4.0 * th_wide;
  wGlint = uSkySunCol * th_sp * wGlintK * wShadow * (1.0 - wFoamA) * wDebug.z;
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
  vec3 th_col = (outgoingLight + wBodyGlow) * wAlphaB * (1.0 - wF) + wRefl * wF + wGlint;
  float th_a = clamp(wAlphaB * (1.0 - wF) + wF, 0.0, 1.0);
  gl_FragColor = vec4(th_col / max(th_a, 1e-3), th_a);
#ifdef TH_WATER_DEBUG
  gl_FragColor = vec4(wRefl, 1.0);
#endif
}`,
      );
  };
  const dbg = ctx.debug.params.get('waterdebug');
  const defs: Record<string, number> = {};
  if (dbg === 'refl') defs.TH_WATER_DEBUG = 1;
  if (!WORLD_MODE) defs.TH_DIORAMA = 1;
  else defs.TH_WORLD = 1;
  // the atmosphere's fog chunks (thHazeColor / thAtmo) exist only when air installed them (not ?noatmo)
  const atmoActive = (ctx.services.atmosphere as { active?: boolean } | undefined)?.active === true;
  if (WORLD_MODE && atmoActive) defs.TH_ATMO = 1;
  mat.defines = defs;
  mat.customProgramCacheKey = () => 'th-water-v3' + (dbg ?? '') + (WORLD_MODE ? 'w' : 'd') + (atmoActive ? 'a' : '');
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
