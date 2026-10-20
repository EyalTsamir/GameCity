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
import { gcPalette, GC_PALETTE_GLSL } from '../groundcover/palette';

const C = (hex: string) => ({ value: new THREE.Color(hex) });

export function landUniforms(globals: { uTime: { value: number }; uWind: { value: THREE.Vector2 }; uNight: { value: number }; uSunDir: { value: THREE.Vector3 } }) {
  return {
    uTime: globals.uTime,
    uWind: globals.uWind,
    uNight: globals.uNight,
    uSunDir: globals.uSunDir,
    tLN: { value: noiseTexture() },
    ...lampUniforms(),
    // the ground agent's grass palette (shared uniform objects): the land's meadow far field is the
    // average colour of their blades, so the hand-over at the edge of their blade band is invisible
    ...gcPalette(),
    // natural summer palette (sRGB hex → linear by THREE.Color)
    cWheat: C('#b39550'),
    cStubble: C('#b2a26e'),
    cGreens: C('#58772f'),
    cSoil: C('#6a523a'),
    cPasture: C('#66843b'),
    cHay: C('#9c9c55'),
    cPlough: C('#6a5039'),
    cFallow: C('#6c8642'),
    cSunfl: C('#c39a22'),
    cMeadow: C('#68833e'),
    cMeadowDry: C('#9a9558'),
    cForestB: C('#456f30'),
    cForestC: C('#284c31'),
    cGap: C('#16220f'),
    cHedge: C('#36502a'),
    cTrack: C('#988567'),
    cSand: C('#dccfac'),
    cWetSand: C('#9c8f70'),
    cRock: C('#8b8478'),
    cRock2: C('#6d665d'),
    cMud: C('#5a5040'),
    cStone: C('#b3a68f'),
    uLandDbg: { value: 0 },
  };
}

export const LAND_VERT_PARS = /* glsl */ `
attribute vec4 aCov;
attribute vec4 aCov2;
attribute vec4 aCov3;
varying vec4 vCov3;
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
vCov3 = aCov3;
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
varying vec4 vCov3;
uniform vec3 cStone;
${FIELDS_GLSL}
${WIND_GLSL}
${LAMP_GLSL}
${GC_PALETTE_GLSL}

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
  // raised canopy (far woods): its edge slopes are forest too, never lit meadow terraces
  forest = max(forest, smoothstep(0.05, 0.35, vCov2.w));
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
  // = groundcover's long-grass blades seen from above (same palette functions, same noise and scales)
  vec4 gM = texture2D(tLN, p.xz * 0.0031);
  vec4 gA = texture2D(tLN, p.xz * 0.0104);
  vec3 gBase = gcGrassColor(gM, gA, 0.72, wet, 0.0);
  vec3 meadow = gcTopColor(gBase, gcTipColor(gBase, gA, 0.72), 0.72);
  meadow *= 0.94 + 0.12 * nB.a * midF + 0.08 * macro;
  // tussocks and trampled patches (metre scale, faded by the footprint), fresh vs dry tips
  {
    float nf = 1.0 - smoothstep(0.08, 0.5, fp);
    vec4 nT1 = texture2D(tLN, p.xz * (1.0 / 3.7));
    vec4 nT2 = texture2D(tLN, p.zx * (1.0 / 11.0));
    meadow *= 1.0 + (nT1.r - 0.5) * 0.2 * nf + (nT2.g - 0.5) * 0.14 * midF;
    meadow = mix(meadow, meadow * vec3(1.12, 1.07, 0.88), smoothstep(0.55, 0.8, nT2.b) * 0.35 * midF);
    // 5–15 m mottling (clover, rushes, sorrel patches) visible from the town edge
    vec4 nT3 = texture2D(tLN, p.xz * (1.0 / 29.0) + 0.37);
    meadow *= 1.0 + (nT3.a - 0.5) * 0.3 * (1.0 - smoothstep(2.0, 8.0, fp));
    meadow = mix(meadow, meadow * vec3(0.86, 1.04, 0.9), smoothstep(0.6, 0.75, nT3.r) * 0.6);
  }
  meadow = mix(meadow, meadow * vec3(1.12, 1.13, 1.05), gust * 0.5);
  // wildflower specks: tiny and sparse up close, an average tint further away (the ground agent's
  // blades carry the near meadow)
  {
    float fl = smoothstep(0.55, 0.8, nA.a) * 0.5 + 0.12;
    if (fp < 0.25) {
      vec2 fc = p.xz * 3.1;
      vec2 hh = lhash22(floor(fc));
      float rr = length(fract(fc) - 0.5 - (hh - 0.5) * 0.6);
      float dotM = step(hh.x, fl * 0.35) * (1.0 - smoothstep(0.06, 0.06 + fp * 3.0, rr));
      vec3 fcol = hh.y < 0.3 ? vec3(0.55, 0.08, 0.05) : hh.y < 0.5 ? vec3(0.28, 0.34, 0.65) : hh.y < 0.8 ? vec3(0.75, 0.74, 0.68) : vec3(0.72, 0.6, 0.12);
      meadow = mix(meadow, fcol, dotM * (1.0 - smoothstep(0.08, 0.25, fp)) * 0.7);
    }
    meadow *= 1.0 + fl * 0.06 * smoothstep(0.08, 0.4, fp);
  }
  vec3 col = meadow;

  // ── field patchwork
  float hedgeM = 0.0, trackM = 0.0;
  if (field > 0.01) {
    // borders wander a little (hedges and ditches are never ruler-straight)
    vec2 q = FROT * p.xz + (texture2D(tLN, p.xz * (1.0 / 160.0)).ba - 0.5) * 3.6;
    ivec2 id; vec4 box;
    float ch = fParcel(q, id, box);
    int pid = id.x * 13 + id.y;
    vec4 pbox = box;
    float longX = step(box.w - box.y, box.z - box.x);
    // many parcels are worked as 2–3 strips / paddocks (each its own crop, fenced, no hedge)
    float sub = lhash(pid, 31);
    if (sub < 0.5) {
      float n = sub < 0.2 ? 3.0 : 2.0;
      if (longX > 0.5) {
        float w = (box.z - box.x) / n;
        float si = clamp(floor((q.x - box.x) / w), 0.0, n - 1.0);
        box.x += si * w; box.z = box.x + w;
        pid += int(si) * 977;
      } else {
        float w = (box.w - box.y) / n;
        float si = clamp(floor((q.y - box.y) / w), 0.0, n - 1.0);
        box.y += si * w; box.w = box.y + w;
        pid += int(si) * 977;
      }
      ch = lhash(pid, 17);
    }
    // grazing land along the southern coast: pastures, hay meadows, fallow (same remap as fields.ts)
    if (vCov3.w > 0.5) ch = ch < 0.6 ? 0.48 + ch * 0.3 : ch < 0.85 ? 0.66 + (ch - 0.6) * 0.4 : 0.83 + (ch - 0.85) * 0.5;
    float dx0 = q.x - box.x, dx1 = box.z - q.x, dy0 = q.y - box.y, dy1 = box.w - q.y;
    float dB = min(min(dx0, dx1), min(dy0, dy1));
    // distance to the parcel's own (hedged / tracked) borders
    float pdx0 = q.x - pbox.x, pdx1 = pbox.z - q.x, pdy0 = q.y - pbox.y, pdy1 = pbox.w - q.y;
    float pB = min(min(pdx0, pdx1), min(pdy0, pdy1));
    longX = step(box.w - box.y, box.z - box.x);
    // rows run along the field's long side (or across, by hash)
    float flip = step(0.8, lhash(pid, 19));
    float along = mix(longX, 1.0 - longX, flip);
    float tr = mix(q.y, q.x, along);   // coordinate across the rows
    float tl = mix(q.x, q.y, along);   // along the rows
    // headland: the turning strip round the field is drilled parallel to the border
    float hdW = 7.0 + 3.0 * lhash(pid, 29);
    float dAcross = along > 0.5 ? min(dy0, dy1) : min(dx0, dx1);
    float dAlong = along > 0.5 ? min(dx0, dx1) : min(dy0, dy1);
    float head = step(dAlong, hdW) * step(dAlong, dAcross);
    if (head > 0.5) { float t0 = tr; tr = tl; tl = t0; }
    float fpt = fp;
    // striation along the drill direction (passes of the machines): anisotropic noise, metres across ×
    // tens of metres along — it is what reads at 50–700 m where single rows are sub-pixel
    vec4 nS = texture2D(tLN, vec2(tr * (1.0 / 9.0), tl * (1.0 / 140.0)) + vec2(float(id.y) * 0.13, float(id.x) * 0.29));
    vec4 nP = texture2D(tLN, q * (1.0 / 23.0) + vec2(float(id.x) * 0.37, float(id.y) * 0.71));
    vec4 nW = texture2D(tLN, q * (1.0 / 95.0) + vec2(float(id.y) * 0.21, 0.4));
    float stri = (nS.g - 0.5) * smoothstep(0.03, 0.25, fp) * (1.0 - smoothstep(3.0, 9.0, fp));
    // tramlines: paired wheel tracks every 18–24 m, kept ≥ ~1 px wide far away
    float tlP = 18.0 + 6.0 * lhash(pid, 37);
    float tlW = max(0.05, fp * 0.6 / tlP);
    float tram = lStripe(tr + lhash(pid, 41) * tlP, tlP, tlW, fpt) * (1.0 - head);
    vec3 fc;
    float pv = lhash(pid, 23);   // field tone
    if (ch < 0.22) {
      // ripe wheat: drill rows, tramlines, striation, lodged patches, wind sheen
      fc = cWheat * (0.9 + 0.2 * pv);
      fc *= 1.0 - 0.07 * lStripe(tr, 0.6, 0.35, fpt);
      fc *= 1.0 - 0.45 * tram;
      fc *= 1.0 + 0.3 * stri;
      // a gentle tonal drift across the whole field (soil, sowing date) and lodged patches
      fc *= 0.9 + 0.2 * smoothstep(-0.6, 0.6, (dot(q - box.xy, vec2(0.7, 0.7)) / max(10.0, box.z - box.x + box.w - box.y) - 0.35) * 2.0 + (pv - 0.5));
      fc = mix(fc, fc * vec3(1.15, 1.1, 0.93), smoothstep(0.64, 0.78, nP.b) * 0.75);
      fc = mix(fc, fc * vec3(0.9, 0.97, 0.85), smoothstep(0.62, 0.78, nW.r) * 0.5); // greener, later patches
      fc = mix(fc, fc * vec3(1.16, 1.12, 1.0), gust * 0.75);
    } else if (ch < 0.33) {
      // stubble: straw windrows, baler / tractor tracks, burnt-pale and dark bands
      fc = cStubble * (0.9 + 0.16 * pv) * (1.0 + 0.24 * stri);
      fc = mix(fc, fc * 1.2, lStripe(tr, 6.0, 0.2, fpt));
      fc *= 1.0 - 0.12 * lStripe(tr, 0.4, 0.4, fpt);
      fc *= 1.0 - 0.25 * tram;
    } else if (ch < 0.48) {
      // row crop: green rows on soil, the soil showing more where it is drier
      float rw = lStripe(tr, 0.75, 0.55, fpt);
      float cvr = 0.3 + 0.6 * smoothstep(0.25, 0.7, nW.g);
      fc = mix(cSoil, cGreens * (0.88 + 0.24 * pv), cvr + (1.0 - cvr) * rw) * (1.0 + 0.3 * stri);
      fc *= 1.0 - 0.3 * tram;
    } else if (ch < 0.66) {
      // pasture: grazed patchwork, darker rank tufts, worn cattle paths toward the gate
      fc = cPasture * (0.84 + 0.24 * nB.r * midF + 0.12 * pv);
      fc *= 1.0 - 0.1 * smoothstep(0.55, 0.75, nB.b) * midF;
      fc = mix(fc, fc * vec3(1.1, 1.05, 0.85), smoothstep(0.6, 0.8, nW.b) * 0.5);
      float path = 1.0 - smoothstep(0.012, 0.012 + fp * 0.02 + 0.006, abs(nP.g - 0.5));
      fc = mix(fc, cTrack * 0.95, path * 0.55 * (1.0 - smoothstep(1.0, 4.0, fp)));
    } else if (ch < 0.76) {
      // hay meadow, cut: mown swaths alternate light / dark (mower direction), windrows
      fc = mix(cHay, cMeadow, 0.35 * pv);
      float sw = step(0.5, fract(tr / 9.0));
      fc *= mix(1.0, mix(0.9, 1.12, sw), 1.0 - smoothstep(2.0, 6.0, fp));
      fc = mix(fc, fc * 1.18 + 0.01, lStripe(tr, 4.5, 0.3, fpt));
      fc = mix(fc, fc * vec3(1.1, 1.12, 1.04), gust * 0.4);
    } else if (ch < 0.83) {
      // ploughed: furrows, damp dark hollows, drier pale crowns
      fc = cPlough * (0.88 + 0.24 * pv) * (1.0 + 0.32 * stri);
      fc *= 1.0 - 0.2 * lStripe(tr, 0.9, 0.45, fpt);
      fc *= 0.85 + 0.3 * nW.a;
    } else if (ch < 0.91) {
      // fallow wildflower meadow
      fc = mix(meadow, cFallow, 0.4);
      fc = mix(fc, vec3(0.42, 0.12, 0.08), smoothstep(0.7, 0.85, nP.r) * 0.25 * smoothstep(0.1, 0.6, fp)); // poppy haze
    } else if (ch < 0.95) {
      // sunflowers: yellow heads in rows over green
      float rw = lStripe(tr, 0.75, 0.6, fpt);
      fc = mix(cGreens * 0.8, cSunfl, 0.55 + 0.35 * rw) * (1.0 + 0.2 * stri);
      fc *= 1.0 - 0.3 * tram;
    } else {
      // orchard floor (the trees are instanced): mown grass with darker rows
      fc = cPasture * 1.05;
      fc *= 1.0 - 0.15 * lStripe(tr, 6.0, 0.3, fpt);
    }
    // in-field moisture / growth patches (stronger in crops, faint in grass)
    float patchK = (ch < 0.48 || ch > 0.76) ? 0.24 : 0.12;
    fc *= 1.0 - patchK * 0.5 + patchK * mix(0.5, nP.r * 0.6 + nB.g * 0.4, midF) + 0.1 * macro;
    // field edges: weedy margin (rank grass, poppies / cow parsley as a tint far away)
    float margin = 1.0 - smoothstep(0.8, 2.2 + 2.2 * pv + 1.5 * nB.r, dB);
    vec3 weeds = meadow * mix(vec3(0.92), vec3(1.06, 0.92, 0.88), smoothstep(0.55, 0.7, nP.a));
    fc = mix(fc, weeds, margin);
    // fence / ditch line between the strips of one parcel (no hedge)
    float fence = (1.0 - smoothstep(0.25, 0.25 + fp, dB)) * step(0.6, pB - dB + 0.6) * step(0.01, pB - dB);
    fc = mix(fc, meadow * 0.7, fence * 0.8);
    // hedgerows and tracks on the parcel borders
    bool onRow = min(pdy0, pdy1) < min(pdx0, pdx1);
    int bk = pdy0 < pdy1 ? id.x : id.x + 1;
    int bj = pdx0 < pdx1 ? id.y : id.y + 1;
    float hedge = onRow ? step(lhash(bk, 44), 0.55) : step(lhash(id.x * 7 + bj, 55), 0.45);
    float track = onRow ? step(lhash(bk, 45), 0.16) : 0.0;
    float hw = 1.6 + 0.8 * nB.a;
    hedgeM = hedge * (1.0 - smoothstep(hw - fp * 0.5, hw + fp * 0.5, pB));
    trackM = track * (1.0 - smoothstep(1.4 - fp * 0.5, 1.4 + fp * 0.5, pB));
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
      fcol *= 0.93;   // average of crowns + gaps (matches the impostor forest's lit tops)
    }
    col = mix(col, fcol, forest);
    lnN = normalize(mix(lnN, Nf, forest));
  }

  // hedgerows / tracks above fields
  col = mix(col, cHedge * (0.85 + 0.3 * nB.r), hedgeM * field * (1.0 - forest));
  col = mix(col, cTrack * (0.9 + 0.2 * nB.g), trackM * field * (1.0 - forest));

  // ── wet banks / mud
  col = mix(col, mix(cMud, cMeadow * 0.8, smoothstep(-1.2, 0.3, p.y)), wet * 0.85);
  // ── the river leaving the town: the stone embankment carries on for a stretch, steps down into
  // riprap and then into grassy natural banks; a gravel towpath continues the promenade (north bank)
  {
    float ru = vCov3.x, sd = vCov3.y, side = vCov3.z;
    if (ru < 12.0 && sd < 140.0) {
      float steep = smoothstep(0.35, 0.8, 1.0 - Ng.y);
      float bank = (1.0 - smoothstep(1.5, 4.5, ru)) * smoothstep(-6.0, -1.0, ru);
      // dressed stone courses → loose riprap with distance from the town
      float stoneW = 1.0 - smoothstep(18.0, 46.0, sd + nB.r * 10.0);
      vec2 sc = vec2(p.x + p.z * 0.3, p.y);
      float course = floor(sc.y / 0.46);
      float bx = fract(sc.x / 1.15 + lhash(int(course), 7) * 0.5);
      float by = fract(sc.y / 0.46);
      float joint = max(1.0 - smoothstep(0.0, 0.05, bx), 1.0 - smoothstep(0.0, 0.08, by));
      joint *= 1.0 - smoothstep(0.03, 0.12, fp);
      vec3 stone = cStone * (0.88 + 0.16 * lhash(int(floor(sc.x / 1.15)) * 31 + int(course), 9));
      stone = mix(stone, stone * 0.55, joint);
      stone = mix(stone, stone * vec3(0.7, 0.75, 0.6), smoothstep(${(WL + 0.6).toFixed(2)}, ${(WL - 0.2).toFixed(2)}, p.y)); // wet / algae line
      vec2 rc2 = p.xz * 0.9 + vec2(p.y);
      vec2 rh = lhash22(floor(rc2));
      float rr = length(fract(rc2) - 0.5 - (rh - 0.5) * 0.4);
      vec3 riprap = mix(cRock2, cRock, rh.x) * (0.75 + 0.35 * (1.0 - smoothstep(0.25, 0.5, rr)));
      vec3 bankC = mix(riprap, stone, stoneW);
      float rip = (1.0 - smoothstep(60.0, 110.0, sd + nA.r * 30.0));
      col = mix(col, bankC, bank * max(steep * 0.9, stoneW) * rip);
      // towpath along the north bank (continues the town promenade)
      float tp = (1.0 - smoothstep(1.0, 1.0 + fp, abs(ru - 4.2 - 0.6 * nA.g))) * step(0.0, side);
      tp *= 1.0 - smoothstep(1500.0, 1700.0, sd);
      col = mix(col, cTrack * (0.95 + 0.15 * nB.b), tp * (1.0 - forest) * 0.9);
    }
  }
  // ── sand (dunes, beach) — wet near the waterline; marram grass on the dunes
  vec3 sc = mix(cWetSand, cSand, smoothstep(${(WL + 0.2).toFixed(2)}, ${(WL + 1.0).toFixed(2)}, p.y));
  float marram = smoothstep(0.3, 0.8, (1.0 - sand) * 1.4 + nB.b * 0.6 - 0.3) * smoothstep(${(WL + 2.0).toFixed(2)}, ${(WL + 3.0).toFixed(2)}, p.y);
  sc = mix(sc, vec3(0.32, 0.36, 0.2) * (0.8 + 0.4 * nB.r), marram * 0.75);
  sand = max(sand, marram * 0.5 * step(0.05, vCov.z));
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
