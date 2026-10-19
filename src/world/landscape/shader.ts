// Landscape ground shading (MeshStandardMaterial + onBeforeCompile, so three's lighting, shadows and
// the standard fog chunks — i.e. the air agent's atmosphere — all apply).
//
// Per vertex (CPU, landscape/model.ts): aCov = (forest, field, sand, rock), aCov2 = (wet, meadow,
// seam, canopy). Per pixel: field patchwork (landscape/fields.ts, same parcels as the CPU), crop
// rows / tramlines / margins faded by the pixel footprint, hedgerow and track strips on parcel
// borders, forest canopy as sun-lit crown domes, meadow, sand, rock, wet banks; macro tonal patches
// (10–60 m) and gust bands from the shared wind (core/wind.ts) on crops and long grass.

import * as THREE from 'three';
import { FIELDS_GLSL } from './fields';
import { WIND_GLSL } from '../../core/wind';
import { LAMP_GLSL, lampUniforms } from '../../core/lampLight';
import { noiseTexture } from '../terrain/noise';
import { WL } from './model';

const C = (hex: string) => ({ value: new THREE.Color(hex) });

export function landUniforms(globals: { uTime: { value: number }; uWind: { value: THREE.Vector2 }; uNight: { value: number }; uSunDir: { value: THREE.Vector3 } }) {
  return {
    uTime: globals.uTime,
    uWind: globals.uWind,
    uNight: globals.uNight,
    uSunDir: globals.uSunDir,
    tLN: { value: noiseTexture() },
    ...lampUniforms(),
    // natural summer palette (sRGB hex → linear by THREE.Color)
    cWheat: C('#b39550'),
    cStubble: C('#c2ad79'),
    cGreens: C('#58772f'),
    cSoil: C('#6a523a'),
    cPasture: C('#66843b'),
    cHay: C('#9c9c55'),
    cPlough: C('#6a5039'),
    cFallow: C('#6c8642'),
    cSunfl: C('#c39a22'),
    cMeadow: C('#68833e'),
    cMeadowDry: C('#9a9558'),
    cForestB: C('#3c5628'),
    cForestC: C('#2a4226'),
    cGap: C('#16220f'),
    cHedge: C('#36502a'),
    cTrack: C('#988567'),
    cSand: C('#d2c094'),
    cWetSand: C('#9c8f70'),
    cRock: C('#8b8478'),
    cRock2: C('#6d665d'),
    cMud: C('#5a5040'),
    uLandDbg: { value: 0 },
  };
}

export const LAND_VERT_PARS = /* glsl */ `
attribute vec4 aCov;
attribute vec4 aCov2;
varying vec3 vLW;
varying vec3 vLN;
varying vec4 vCov;
varying vec4 vCov2;
`;

export const LAND_VERT_MAIN = /* glsl */ `
vLW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vLN = normalize(mat3(modelMatrix) * objectNormal);
vCov = aCov;
vCov2 = aCov2;
`;

export const LAND_FRAG_PARS = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
uniform float uNight;
uniform vec3 uSunDir;
uniform sampler2D tLN;
uniform vec3 cWheat, cStubble, cGreens, cSoil, cPasture, cHay, cPlough, cFallow, cSunfl;
uniform vec3 cMeadow, cMeadowDry, cForestB, cForestC, cGap, cHedge, cTrack;
uniform vec3 cSand, cWetSand, cRock, cRock2, cMud;
uniform float uLandDbg;
varying vec3 vLW;
varying vec3 vLN;
varying vec4 vCov;
varying vec4 vCov2;
${FIELDS_GLSL}
${WIND_GLSL}
${LAMP_GLSL}

vec3 lnN = vec3(0.0, 1.0, 0.0);

float lhash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 lhash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// stripes with period P along coordinate t (box-filtered by the footprint): 0 between, 1 on the line
float lStripe(float t, float P, float w, float fpt) {
  float f = abs(fract(t / P) - 0.5) * 2.0;
  float aa = fpt / P * 2.0;
  float s = 1.0 - smoothstep(w - aa, w + aa, f);
  return mix(s, w, smoothstep(0.35, 0.9, fpt / P));
}

vec3 landAlbedo() {
  vec3 p = vLW;
  float fp = max(length(fwidth(p.xz)), 1e-3);
  float forest = vCov.x, field = vCov.y, sand = vCov.z, rock = vCov.w;
  float wet = vCov2.x, meadowW = vCov2.y, seam = vCov2.z;
  vec3 Ng = normalize(vLN);
  lnN = Ng;
  // macro tonal patches (survive any distance) + mid variation (faded by the footprint)
  vec4 nM = texture2D(tLN, p.xz * (1.0 / 1900.0));
  vec4 nA = texture2D(tLN, p.xz * (1.0 / 420.0));
  vec4 nB = texture2D(tLN, p.xz * (1.0 / 47.0));
  float macro = (nM.g - 0.5) * 0.9 + (nA.r - 0.5) * 0.6;
  float midF = 1.0 - smoothstep(1.5, 6.0, fp);
  float gust = thGust(p.xz) * clamp(length(uWind) * 1.3, 0.0, 1.0);

  // ── meadow (wild grass): green ↔ dry patches
  vec3 meadow = mix(cMeadow, cMeadowDry, smoothstep(0.35, 0.85, nA.b * 0.7 + nB.g * 0.5 * midF + 0.15 * macro));
  meadow *= 0.88 + 0.24 * nB.a * midF + 0.12 * macro;
  meadow = mix(meadow, meadow * vec3(1.12, 1.13, 1.05), gust * 0.5);
  // wildflower specks (footprint-faded to an average tint)
  if (fp < 1.2) {
    vec2 fc = p.xz * 1.7;
    vec2 hh = lhash22(floor(fc));
    float rr = length(fract(fc) - 0.5 - (hh - 0.5) * 0.5);
    float dotM = step(hh.x, 0.18) * (1.0 - smoothstep(0.12, 0.12 + fp * 1.7, rr));
    vec3 fcol = hh.y < 0.3 ? vec3(0.75, 0.08, 0.05) : hh.y < 0.55 ? vec3(0.25, 0.32, 0.8) : hh.y < 0.8 ? vec3(0.9, 0.88, 0.8) : vec3(0.9, 0.75, 0.1);
    meadow = mix(meadow, fcol, dotM * (1.0 - smoothstep(0.3, 1.2, fp)) * 0.85);
  }
  vec3 col = meadow;

  // ── field patchwork
  float hedgeM = 0.0, trackM = 0.0;
  if (field > 0.01) {
    vec2 q = FROT * p.xz;
    ivec2 id; vec4 box;
    float ch = fParcel(q, id, box);
    float dx0 = q.x - box.x, dx1 = box.z - q.x, dy0 = q.y - box.y, dy1 = box.w - q.y;
    float dB = min(min(dx0, dx1), min(dy0, dy1));
    float longX = step(box.w - box.y, box.z - box.x);
    // rows run along the parcel's long side (or across, by hash)
    float flip = step(0.8, lhash(id.x * 13 + id.y, 19));
    float along = mix(longX, 1.0 - longX, flip);
    float tr = mix(q.y, q.x, along);   // coordinate across the rows
    float fpt = fp;
    vec3 fc;
    float pv = lhash(id.x * 13 + id.y, 23);   // parcel tone
    if (ch < 0.22) {
      // ripe wheat: faint drill rows, tramlines, wind sheen
      fc = cWheat * (0.92 + 0.16 * pv);
      fc *= 1.0 - 0.07 * lStripe(tr, 0.6, 0.35, fpt);
      fc *= 1.0 - 0.18 * lStripe(tr + pv * 20.0, 20.0, 0.05, fpt);
      fc = mix(fc, fc * vec3(1.16, 1.12, 1.0), gust * 0.75);
    } else if (ch < 0.33) {
      // stubble with straw windrows
      fc = cStubble * (0.92 + 0.12 * pv);
      fc = mix(fc, fc * 1.15, lStripe(tr, 6.0, 0.18, fpt));
      fc *= 1.0 - 0.12 * lStripe(tr, 0.4, 0.4, fpt);
    } else if (ch < 0.48) {
      // row crop: green rows on soil
      float rw = lStripe(tr, 0.75, 0.55, fpt);
      fc = mix(cSoil, cGreens * (0.9 + 0.2 * pv), 0.35 + 0.65 * rw);
    } else if (ch < 0.66) {
      // pasture: patchy green, darker tufts, cattle paths
      fc = cPasture * (0.86 + 0.22 * nB.r * midF + 0.1 * pv);
      fc *= 1.0 - 0.06 * smoothstep(0.55, 0.75, nB.b) * midF;
    } else if (ch < 0.76) {
      // hay meadow, cut: pale lanes + green
      fc = mix(cHay, cMeadow, 0.35 * pv);
      fc = mix(fc, fc * 1.18 + 0.01, lStripe(tr, 4.5, 0.3, fpt));
      fc = mix(fc, fc * vec3(1.1, 1.12, 1.04), gust * 0.4);
    } else if (ch < 0.83) {
      // ploughed: furrows
      fc = cPlough * (0.9 + 0.2 * pv);
      fc *= 1.0 - 0.18 * lStripe(tr, 0.9, 0.45, fpt);
    } else if (ch < 0.91) {
      // fallow wildflower meadow
      fc = mix(meadow, cFallow, 0.4);
    } else if (ch < 0.95) {
      // sunflowers: yellow heads in rows over green
      float rw = lStripe(tr, 0.75, 0.6, fpt);
      fc = mix(cGreens * 0.8, cSunfl, 0.55 + 0.35 * rw);
    } else {
      // orchard floor (the trees are instanced): mown grass with darker rows
      fc = cPasture * 1.05;
      fc *= 1.0 - 0.15 * lStripe(tr, 6.0, 0.3, fpt);
    }
    // in-field moisture / growth patches
    fc *= 0.9 + 0.2 * mix(0.5, nB.g, midF) + 0.1 * macro;
    // grassy margin inside each border
    float margin = 1.0 - smoothstep(1.2, 3.2 + 2.0 * pv, dB);
    fc = mix(fc, meadow * 0.92, margin);
    // hedgerows and tracks on the borders
    bool onRow = min(dy0, dy1) < min(dx0, dx1);
    int bk = dy0 < dy1 ? id.x : id.x + 1;
    int bj = dx0 < dx1 ? id.y : id.y + 1;
    float hedge = onRow ? step(lhash(bk, 44), 0.55) : step(lhash(id.x * 7 + bj, 55), 0.45);
    float track = onRow ? step(lhash(bk, 45), 0.16) : 0.0;
    float hw = 1.6 + 0.8 * nB.a;
    hedgeM = hedge * (1.0 - smoothstep(hw - fp * 0.5, hw + fp * 0.5, dB));
    trackM = track * (1.0 - smoothstep(1.4 - fp * 0.5, 1.4 + fp * 0.5, abs(dB - 0.0)));
    col = mix(col, fc, field);
  }

  // ── forest canopy: crowns as sun-lit domes (fake normals), dark gaps
  if (forest > 0.01) {
    vec3 fcol = mix(cForestB, cForestC, smoothstep(0.35, 0.65, nA.g + 0.2 * (nB.r - 0.5)));
    fcol *= 0.85 + 0.3 * nB.b * midF + 0.15 * macro;
    vec3 Nf = Ng;
    if (fp < 2.5) {
      vec2 cc = p.xz / 5.5;
      vec2 ci = floor(cc);
      float best = 9.0; vec2 bo = vec2(0.0); float bh = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 c = ci + vec2(float(i), float(j));
        vec2 o = lhash22(c) * 0.8 + 0.1;
        vec2 dv = cc - (c + o);
        float r = 0.55 + 0.3 * lhash2(c + 3.7);
        float dd = length(dv) / r;
        if (dd < best) { best = dd; bo = dv / r; bh = lhash2(c + 9.1); }
      }
      float inC = 1.0 - smoothstep(0.85, 1.0, best);
      vec3 dome = normalize(vec3(bo.x * 1.4, max(0.05, sqrt(max(0.0, 1.0 - best * best))), bo.y * 1.4));
      float fade = 1.0 - smoothstep(1.0, 2.5, fp);
      Nf = normalize(mix(Ng, dome, inC * fade * 0.85));
      fcol *= mix(1.0, 0.82 + 0.36 * bh, fade);
      fcol = mix(fcol, cGap, (1.0 - inC) * fade * 0.8);
    } else {
      fcol *= 0.82;   // average of crowns + gaps
    }
    col = mix(col, fcol, forest);
    lnN = normalize(mix(lnN, Nf, forest));
  }

  // hedgerows / tracks above fields
  col = mix(col, cHedge * (0.85 + 0.3 * nB.r), hedgeM * field * (1.0 - forest));
  col = mix(col, cTrack * (0.9 + 0.2 * nB.g), trackM * field * (1.0 - forest));

  // ── wet banks / mud
  col = mix(col, mix(cMud, cMeadow * 0.8, smoothstep(-1.2, 0.3, p.y)), wet * 0.85);
  // ── sand (dunes, beach) — wet near the waterline
  vec3 sc = mix(cWetSand, cSand, smoothstep(${(WL + 0.2).toFixed(2)}, ${(WL + 1.0).toFixed(2)}, p.y));
  sc *= 0.94 + 0.08 * nB.g * midF;
  if (fp < 0.4) sc *= 1.0 - 0.05 * lStripe(p.x * 0.8 + p.z * 0.6 + nB.r * 3.0, 0.7, 0.4, fp);
  col = mix(col, sc, sand);
  // ── rock (steep slopes, cliffs)
  vec3 rc = mix(cRock, cRock2, smoothstep(0.3, 0.7, nB.r + 0.3 * sin(p.y * 0.9 + nA.g * 6.0)));
  col = mix(col, rc, rock);
  // ── under water: seabed darkens with depth (the water surface tints it further)
  float uw = smoothstep(${(WL - 0.1).toFixed(2)}, ${(WL - 2.5).toFixed(2)}, p.y);
  col = mix(col, mix(sc, cMud, 0.4) * 0.7, uw * (1.0 - rock * 0.5));
  if (uLandDbg > 0.5) col = vec3(forest, field, sand);
  return col;
}
`;

/** build the land material (MeshStandardMaterial; the standard fog chunks stay in) */
export function landMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, fog });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + LAND_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + LAND_VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LAND_FRAG_PARS)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( landAlbedo(), opacity );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(lnN, 0.0)).xyz);')
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vLW, lnN);',
      );
  };
  mat.customProgramCacheKey = () => 'th-land-v1';
  return mat;
}
