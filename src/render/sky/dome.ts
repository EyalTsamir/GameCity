// The painted-sky backdrop: a camera-centred dome rendered behind everything.
// Soft time-of-day gradient, warm horizon glow toward the sun, sun disc + halo,
// a softly textured moon and gently twinkling stars at night. Below the horizon it
// fades into a calm haze so the diorama floats in front of a studio backdrop.

import * as THREE from 'three';
import type { SkyState } from './palette';
import { ATMO_FUNCS, ATMO_N, atmoData } from '../atmosphere';
import { SKY_LUT_GLSL } from './physical';
import { CLOUD_LAYER_GLSL, CLOUD_SHADE_GLSL, type CloudLayerUniforms } from './cloudLayer';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + position * 1500.0, 1.0);
  // pin to (just inside) the far plane: always behind the diorama, never clipped
  p.z = p.w * 0.999995;
  gl_Position = p;
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform float uGlowI;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunVis;
uniform vec3 uMoonDir;
uniform float uMoonVis;
uniform float uStars;
uniform float uTime;
uniform float uOvercast;
uniform float uDiscScale;
uniform vec2 uBelow;
uniform float uStudio;
uniform float uSunDisc;
uniform float uMilky;
uniform vec3 uCityGlow;
varying vec3 vDir;
#ifdef TH_WORLD
uniform vec4 thAtmo[${ATMO_N}];
${ATMO_FUNCS}
#endif
#ifdef TH_PHYS
uniform sampler2D uSkyLUT;
uniform float uSkyScale;
uniform vec3 uNightZen;
uniform vec3 uNightHor;
uniform float uNightW;
uniform vec3 uDiscCol;
${SKY_LUT_GLSL}
#endif
#ifdef TH_CLOUDS
${CLOUD_LAYER_GLSL}
${CLOUD_SHADE_GLSL}
uniform sampler2D tCloudVol;
uniform vec2 uCloudVolRes;
#endif

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(vec3(i, 1.7)), b = hash13(vec3(i + vec2(1.0, 0.0), 1.7));
  float c = hash13(vec3(i + vec2(0.0, 1.0), 1.7)), d = hash13(vec3(i + vec2(1.0, 1.0), 1.7));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// the galactic band: a great circle tilted across the night sky, brighter toward its centre
float milkyWay(vec3 d) {
  const vec3 N = vec3(0.4146, 0.5528, -0.7230);
  float b = dot(d, N);
  float band = exp(-b * b / (2.0 * 0.11 * 0.11));
  if (band < 0.01) return 0.0;
  vec3 u = normalize(cross(N, vec3(0.0, 1.0, 0.0)));
  vec3 v = cross(N, u);
  float lon = atan(dot(d, v), dot(d, u));
  float bulge = exp(-(lon - 1.1) * (lon - 1.1) / 0.9);
  float n = vnoise3(d * 7.0) * 0.55 + vnoise3(d * 17.0 + 3.1) * 0.3 + vnoise3(d * 41.0 + 7.7) * 0.15;
  float lane = vnoise3(d * 11.0 + 1.3);
  float dust = smoothstep(0.05, 0.0, abs(b + (lane - 0.5) * 0.06)) * smoothstep(0.35, 0.65, n + lane * 0.3);
  return band * smoothstep(0.25, 0.85, n) * (0.5 + 1.1 * bulge) * (1.0 - 0.8 * dust);
}

vec3 starLayer(vec3 d, float scale, float threshold) {
  vec3 p = d * scale;
  vec3 cell = floor(p);
  float h = hash13(cell);
  if (h < threshold) return vec3(0.0);
  vec3 off = hash33(cell + 7.1) * 0.6 + 0.2;
  vec3 q = fract(p) - off;
  float r2 = dot(q, q);
  // keep stars ~1.5 px wide regardless of zoom (fwidth = cell units per pixel)
  float px = max(length(fwidth(p)), 1e-4);
  float size = max(0.05, px * 1.1);
  float s = exp(-r2 / (size * size));
  float tw = 0.72 + 0.28 * sin(uTime * (1.3 + h * 2.7) + h * 91.0);
  float mag = pow((h - threshold) / (1.0 - threshold), 1.6);
  vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.72), hash13(cell + 3.3));
  return tint * s * tw * (0.35 + 2.6 * mag);
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float up = clamp(y, 0.0, 1.0);

#ifdef TH_PHYS
  // physical sky (single scattering LUT, earth shadow at twilight) + the authored moonlit night sky
  vec3 col = thSkyLUT(uSkyLUT, d, uSunDir) * uSkyScale;
  col += mix(uNightHor, uNightZen, smoothstep(0.0, 1.0, pow(up, 0.55))) * uNightW;
  // the glow of sunlit haze around the sun: exactly the fog's sun lobe (continues below the horizon)
  col += thSunLobe(d) * thAtmo[10].y;
#else
  // painted gradient: broad horizon band easing into the zenith colour
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, pow(up, 0.55)));

  // warm glow toward the sun, hugging the horizon (also lingers after sunset)
  vec3 sd = normalize(vec3(uSunDir.x, max(uSunDir.y, -0.25), uSunDir.z));
  vec2 dh = normalize(d.xz + vec2(1e-5));
  vec2 sh = normalize(sd.xz + vec2(1e-5));
  float az = dot(dh, sh) * 0.5 + 0.5;
  float band = exp(-abs(y - max(sd.y, 0.0) * 0.35) * 5.0);
  float glow = (pow(az, 3.0) * 0.85 + pow(max(dot(d, sd), 0.0), 24.0) * 0.6) * band;
  col += uGlow * uGlowI * glow;
#endif

  // overcast (rain): flatten toward a soft grey
  float grey = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, vec3(grey) * vec3(0.92, 0.96, 1.02), uOvercast * 0.75);

#ifdef TH_WORLD
  // world: the horizon band and everything below it is the atmosphere's haze at infinity (the
  // exact colour distant land and sea fade into in every material's fog → no seam at the horizon)
  vec3 hz = thHazeColor(d) * thAtmo[10].y;
  col = mix(hz, col, smoothstep(-0.002, 0.1, y));
#else
  // below the horizon: legacy = a calm haze; studio = the cyclorama floor colour (exactly the
  // colour the table fades into, overcast already applied by the caller) sweeping up into the sky
  float below = smoothstep(uBelow.x, uBelow.y, y);
  vec3 groundCol = uGround * mix(1.0, mix(0.84, 1.0, uStudio), smoothstep(-0.25, -0.95, y));
  if (uStudio < 0.5) {
    float g2 = dot(groundCol, vec3(0.3, 0.55, 0.15));
    groundCol = mix(groundCol, vec3(g2) * vec3(0.92, 0.96, 1.02), uOvercast * 0.75);
  }
  col = mix(col, groundCol, below);
#endif

  float aboveH = smoothstep(-0.02, 0.06, y);
  vec3 skyBase = col;

  // stars (hidden by haze near the horizon)
  if (uStars > 0.001) {
    float ext = smoothstep(0.02, 0.35, y);
#ifdef TH_WORLD
    // a real night sky: the Milky Way (clumpy band with dark dust lanes) and more, fainter stars in it;
    // the town's own glow washes the low sky
    float mw = milkyWay(d);
    vec3 st = starLayer(d, 240.0, 0.9965 - 0.004 * mw) + starLayer(d.zxy, 130.0, 0.9975) * 1.3 + starLayer(d.yzx, 420.0, 0.9955 - 0.006 * mw) * 0.45;
    float lp = 1.0 - smoothstep(0.0, 0.5, y) * 0.75; // light pollution near the horizon
    col += (st + vec3(0.78, 0.84, 1.0) * mw * uMilky) * uStars * ext * (1.0 - uOvercast) * mix(1.0, 0.35, clamp(lp * uCityGlow.r * 12.0, 0.0, 1.0));
#else
    vec3 st = starLayer(d, 240.0, 0.9965) + starLayer(d.zxy, 130.0, 0.9975) * 1.3;
    col += st * uStars * ext * (1.0 - uOvercast);
#endif
  }
#ifdef TH_WORLD
  // sky glow of the lit town and the villages: warm, hugging the horizon, a little overhead
  col += uCityGlow * (exp(-max(y, 0.0) * 7.0) * 0.85 + 0.15) * (1.0 - smoothstep(-0.05, -0.3, y));
#endif

  // sun: soft disc + halo
  float ca = dot(d, uSunDir);
  float a = max(1.0 - ca, 0.0);
  float r2 = 2.6e-4 * uDiscScale;
  float disc = smoothstep(r2 * 1.25, r2 * 0.75, a);
#ifdef TH_PHYS
  // physical sun: its colour after the atmosphere; the glare around it is the sun lobe (above)
  col += uDiscCol * (disc * uSunDisc + exp(-a * 2500.0) * 0.6) * uSunVis * aboveH * (1.0 - uOvercast * 0.85);
#else
  float halo = exp(-a * 900.0) * 0.5 + exp(-a * 90.0) * 0.18;
  col += uSunCol * (disc * uSunDisc + halo) * uSunVis * aboveH * (1.0 - uOvercast * 0.85);
#endif

  // moon: textured disc + faint halo
  if (uMoonVis > 0.001) {
    float cm = dot(d, uMoonDir);
    float am = max(1.0 - cm, 0.0);
    float mr2 = 3.4e-4 * uDiscScale;
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(right, uMoonDir);
    float mr = sqrt(mr2 * 2.0);
    vec2 lp = vec2(dot(d, right), dot(d, upv)) / mr;
    float maria = vnoise(lp * 2.3 + 4.0) * 0.6 + vnoise(lp * 5.1 + 1.3) * 0.4;
    float mdisc = smoothstep(mr2 * 1.2, mr2 * 0.8, am);
    vec3 moonCol = vec3(1.0, 0.97, 0.9) * mix(0.62, 1.0, smoothstep(0.35, 0.65, maria));
    // a gentle terminator for a gibbous look
    float shade = smoothstep(-0.9, 0.2, lp.x + 0.25 * lp.y);
    col = mix(col, moonCol * (1.6 + 1.2 * shade), mdisc * uMoonVis * aboveH * (1.0 - uOvercast));
    col += vec3(0.55, 0.62, 0.85) * (exp(-am * 2500.0) * 0.25 + exp(-am * 160.0) * 0.06) * uMoonVis * aboveH;
  }

#ifdef TH_CLOUDS
  // the high cloud sky over everything else in the dome (sun, moon and stars hide behind it): the cirrus
  // veil, then the raymarched cumulus deck (half-res, rendered for this frame's camera)
  vec4 cl = thClouds(d, skyBase);
  col = col * (1.0 - cl.a) + cl.rgb;
  // 5-tap rotated-grid filter over the half-res march: hides its per-pixel step jitter
  vec2 cuv = gl_FragCoord.xy / uCloudVolRes;
  vec2 ct = 1.5 / uCloudVolRes;
  vec4 cv = texture2D(tCloudVol, cuv) * 0.36
    + (texture2D(tCloudVol, cuv + vec2(ct.x, 0.4 * ct.y)) + texture2D(tCloudVol, cuv - vec2(ct.x, 0.4 * ct.y))
     + texture2D(tCloudVol, cuv + vec2(-0.4 * ct.x, ct.y)) + texture2D(tCloudVol, cuv - vec2(-0.4 * ct.x, ct.y))) * 0.16;
  col = col * (1.0 - cv.a) + cv.rgb;
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

export interface SkyDome {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** world mode, physical sky: LUT, scale, night gradient (zenith, horizon) and its weight */
  setPhysical(lut: THREE.Texture, scale: number, nightZen: THREE.Color, nightHor: THREE.Color, nightW: number, discCol: THREE.Color, zenith: THREE.Color, horizon: THREE.Color): void;
  /** world mode: the night sky glow of the lit town (warm, near the horizon) */
  setCityGlow(c: THREE.Color): void;
  /** world mode: the raymarched cumulus image and the full-resolution size it maps to */
  setCloudVolume(tex: THREE.Texture, fullRes: THREE.Vector2): void;
  update(state: SkyState, sunDir: THREE.Vector3, moonDir: THREE.Vector3, sunVis: number, moonVis: number, time: number, overcast: number): void;
  /** studio backdrop: below-horizon colour (already overcast-adjusted) or null for the legacy haze */
  setStudio(cyc: THREE.Color | null): void;
}

/**
 * @param world world mode: real sky to the horizon (haze below it), near real-size sun
 * @param phys world mode with the physical sky LUT (else the painted gradient)
 * @param clouds world mode: the high cloud layers (uniform objects shared with the cloud-shadow map)
 */
export function createSkyDome(world = false, phys = false, clouds: CloudLayerUniforms | null = null): SkyDome {
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uGlowI: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uSunVis: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonVis: { value: 0 },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uOvercast: { value: 0 },
    uDiscScale: { value: 1 },
    uBelow: { value: new THREE.Vector2(0.015, -0.22) },
    uStudio: { value: 0 },
    uSunDisc: { value: world ? 40 : 9 },
    uMilky: { value: 0.05 },
    uCityGlow: { value: new THREE.Color(0, 0, 0) },
    thAtmo: { value: atmoData },
    uSkyLUT: { value: null as THREE.Texture | null },
    uSkyScale: { value: 1 },
    uNightZen: { value: new THREE.Color() },
    uNightHor: { value: new THREE.Color() },
    uNightW: { value: 0 },
    uDiscCol: { value: new THREE.Color(1, 1, 1) },
    ...(clouds ?? {}),
    tCloudVol: { value: null as THREE.Texture | null },
    uCloudVolRes: { value: new THREE.Vector2(1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'SkyDome',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    // drawn AFTER the opaque scene with a depth test (z pinned just inside the far plane): only
    // pixels nothing else covered are shaded. With the studio table filling the background of most
    // views, that is often no pixel at all (it used to be a full-screen pass that got overdrawn).
    depthTest: true,
    fog: false,
    dithering: true,
    defines: world ? { TH_WORLD: '', ...(phys ? { TH_PHYS: '' } : {}), ...(clouds ? { TH_CLOUDS: '' } : {}) } : {},
  });
  // world: the sun disc near its real size (0.27° radius → ~0.38° here; 1.3° in the diorama)
  if (world) uniforms.uDiscScale.value = 0.085;
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sky-dome';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000; // last of the opaque queue (transparents still follow)
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  // the dome is positioned in the shader; keep it out of AO/transparency heuristics
  mesh.userData.treatAsOpaque = true;

  return {
    mesh,
    material,
    update(state, sunDir, moonDir, sunVis, moonVis, time, overcast) {
      uniforms.uZenith.value.copy(state.zenith);
      uniforms.uHorizon.value.copy(state.horizon);
      uniforms.uGround.value.copy(state.ground);
      uniforms.uGlow.value.copy(state.glow);
      uniforms.uGlowI.value = state.glowI;
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunCol.value.copy(state.sun);
      uniforms.uSunVis.value = sunVis;
      uniforms.uMoonDir.value.copy(moonDir);
      uniforms.uMoonVis.value = moonVis;
      uniforms.uStars.value = state.stars;
      uniforms.uTime.value = time;
      uniforms.uOvercast.value = overcast;
    },
    setPhysical(lut, scale, nightZen, nightHor, nightW, discCol, zenith, horizon) {
      uniforms.uSkyLUT.value = lut;
      uniforms.uSkyScale.value = scale;
      uniforms.uNightZen.value.copy(nightZen);
      uniforms.uNightHor.value.copy(nightHor);
      uniforms.uNightW.value = nightW;
      uniforms.uDiscCol.value.copy(discCol);
      // what other modules read from the dome (water reflections): the sky actually shown
      uniforms.uZenith.value.copy(zenith);
      uniforms.uHorizon.value.copy(horizon);
    },
    setCityGlow(c) {
      uniforms.uCityGlow.value.copy(c);
    },
    setCloudVolume(tex, fullRes) {
      uniforms.tCloudVol.value = tex;
      uniforms.uCloudVolRes.value.copy(fullRes);
    },
    setStudio(cyc) {
      if (cyc) {
        uniforms.uGround.value.copy(cyc);
        uniforms.uBelow.value.set(0.06, -0.002);
        uniforms.uStudio.value = 1;
      } else {
        uniforms.uBelow.value.set(0.015, -0.22);
        uniforms.uStudio.value = 0;
      }
    },
  };
}
