// GLSL for the landmarks module.
//
//  LM_COMMON     hashes, noise, anti-aliased line helpers
//  LM_KIN        kinetic vertex transform (spin / swing / crane / flag), driven by
//                per-vertex aPivot/aAxis/aAnim + uniforms (uTime, uCrane, uSpin, uWind)
//  LM_CUT        cutout test (lattice, scaffold, fence mesh, railings) — shared by the
//                colour pass and the shadow depth pass
//  LM_SURFACE    procedural surface patterns (brick, stone, tiles, glazing, windows,
//                clock faces showing the live time, flags, rose windows…), roughness /
//                metalness per vertex, night emission and facade uplighting
//
// Pattern ids are listed in builder.ts (PAT); keep both in sync.

import { WIND_GLSL } from '../../core/wind';

export const LM_COMMON = /* glsl */ `
float lmH12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lmNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = lmH12(i), b = lmH12(i + vec2(1.0, 0.0)), c = lmH12(i + vec2(0.0, 1.0)), d = lmH12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// All helpers take the pixel footprint f of their coordinate explicitly: derivatives are
// computed ONCE at the top of the pattern functions (uniform control flow). Calling fwidth()
// inside the pattern branches would force the D3D compiler (ANGLE) to flatten the whole
// if-chain and evaluate every pattern for every pixel.
// 1 on lines of half-width hw repeating every period; fades to the average coverage when the
// lines get thinner than a pixel.
float lmLines(float x, float period, float hw, float f) {
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  float m = 1.0 - smoothstep(hw - f * 0.5, hw + f * 0.5, d);
  float avg = clamp(2.0 * hw / period, 0.0, 1.0);
  return mix(m, avg, smoothstep(0.3, 0.9, f / period * 2.0));
}
// same, but never thinner than ~1 pixel (for cutouts: stays connected)
float lmBar(float x, float period, float hw, float f) {
  float w = max(hw, f * 0.55);
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  return 1.0 - smoothstep(w - f * 0.5, w + f * 0.5, d);
}
// band test: 1 inside [a, b] (anti-aliased, min ~1px thick)
float lmBand(float x, float a, float b, float f) {
  float c = (a + b) * 0.5;
  float h = max((b - a) * 0.5, f * 0.55);
  return 1.0 - smoothstep(h - f * 0.5, h + f * 0.5, abs(x - c));
}
// 1 while a pattern of this period is resolvable, 0 when it would alias
float lmDetail(float f, float period) {
  return 1.0 - smoothstep(0.25, 0.6, f / period);
}
`;

export const LM_KIN_PARS = /* glsl */ `
attribute vec3 aPivot;
attribute vec3 aAxis;
attribute vec4 aAnim;
uniform float uTime;
uniform vec4 uCrane;
uniform vec4 uSpin;
uniform vec4 uVis;
uniform vec2 uWind;
${WIND_GLSL}
vec3 lmRot(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
void lmKin(inout vec3 p, inout vec3 n) {
  float mode = aAnim.x;
  if (mode < 0.5) return;
  vec3 piv = aPivot;
  if (mode < 1.5) {
    float a = aAnim.y * uTime + aAnim.z;
    p = piv + lmRot(p - piv, aAxis, a);
    n = lmRot(n, aAxis, a);
  } else if (mode < 2.5) {
    float a = aAnim.y * sin(aAnim.z * uTime + aAnim.w);
    p = piv + lmRot(p - piv, aAxis, a);
    n = lmRot(n, aAxis, a);
  } else if (mode < 3.5) {
    // [W6] stall canopy cloth in the shared wind: billows inside the rails (zero on them: a = half width
    // along aAxis, b = half depth between the rails), the overhang + valance beyond the rails flaps; c = phase
    vec3 cx = aAxis;
    vec3 cz = normalize(cross(cx, vec3(0.0, 1.0, 0.0)));
    float sx = dot(p - piv, cx), sz = dot(p - piv, cz);
    float wx = clamp(1.0 - (sx * sx) / (aAnim.y * aAnim.y), 0.0, 1.0);
    float wz = clamp(1.0 - (sz * sz) / (aAnim.z * aAnim.z), 0.0, 1.0);
    float ov = max(abs(sz) - aAnim.z, 0.0);
    vec2 lw = thWindAt(piv.xz);
    float ws = clamp(length(lw), 0.0, 1.5);
    float t = uTime * (1.6 + 1.4 * ws) + aAnim.w;
    float bil = (0.012 + 0.022 * ws) * wx * wz * (0.6 + 0.4 * sin(t + sx * 1.7) * sin(t * 0.63 + sz * 2.3));
    float flap = (0.05 + 0.12 * ws) * ov * (0.5 + 0.5 * wx) * sin(t * 2.3 + sx * 3.1 + aAnim.w);
    p.y += bil + flap;
    p += cz * sign(sz) * flap * 0.5;
  } else if (mode < 4.5) {
    // reserved
  } else if (mode < 5.5) {
    float a = uCrane.x;
    p = piv + lmRot(p - piv, vec3(0.0, 1.0, 0.0), a);
    n = lmRot(n, vec3(0.0, 1.0, 0.0), a);
  } else if (mode < 7.5) {
    p += aAxis * uCrane.y;
    if (mode > 6.5) {
      // cable: stretch a 1 m rest length to the hook drop; hook/load: rigid drop
      if (aAnim.y < 0.0) p.y = piv.y + (p.y - piv.y) * max(uCrane.z, 0.05);
      else p.y -= uCrane.z * aAnim.y;
      if (aAnim.z > 0.5 && uCrane.w < 0.5) p = piv;
    }
    float a = uCrane.x;
    p = piv + lmRot(p - piv, vec3(0.0, 1.0, 0.0), a);
    n = lmRot(n, vec3(0.0, 1.0, 0.0), a);
  } else if (mode < 8.5) {
    // flag: rest pose extends from the pole along aAxis (horizontal), cloth in the vertical plane.
    // [life agent, flag-cloth grant] local wind from the shared gust field (core/wind.ts): the flag
    // flies out and flutters faster as a gust passes, droops along the pole and folds in a calm.
    float L = aAnim.y;
    vec3 d = aAxis;
    vec3 sd = normalize(cross(vec3(0.0, 1.0, 0.0), d));
    float s = dot(p - piv, d);
    float u = clamp(s / L, 0.0, 1.0);
    vec2 lw = thWindAt(piv.xz);
    float wl = length(lw);
    float ws = clamp(wl, 0.05, 1.5);
    float lift = smoothstep(0.06, 0.6, wl);
    float amp = L * (0.045 + 0.07 * ws) * (1.0 + 0.9 * (1.0 - lift));
    float ph = 7.0 * u - uTime * (3.2 + 6.0 * ws) + aAnim.z;
    float w = amp * u * sin(ph) + amp * 0.35 * u * sin(ph * 1.7 + 1.3);
    float dw = (amp * (sin(ph) + u * 7.0 * cos(ph)) + amp * 0.35 * (sin(ph * 1.7 + 1.3) + u * 11.9 * cos(ph * 1.7 + 1.3))) / L;
    p += sd * w;
    // droop: the fly end swings down towards the pole (shear keeps the hoist on the mast)
    float droop = (1.0 - lift) * 1.0 + 0.05 + 0.04 * sin(uTime * 0.9 + aAnim.z);
    p += d * (s * (cos(droop) - 1.0)) - vec3(0.0, s * sin(droop), 0.0);
    n = normalize(n - d * dot(n, sd) * dw);
    // turn down-wind (local wind; keeps its heading in a dead calm)
    vec3 wd = wl > 0.01 ? normalize(vec3(lw.x, 0.0, lw.y)) : d;
    float a = atan(d.z * wd.x - d.x * wd.z, dot(d, wd)) + (0.06 + 0.1 * lift) * sin(uTime * 0.7 + aAnim.z);
    p = piv + lmRot(p - piv, vec3(0.0, 1.0, 0.0), a);
    n = lmRot(n, vec3(0.0, 1.0, 0.0), a);
  } else if (mode < 9.5) {
    float a = (aAnim.z < 0.5 ? uSpin.x : aAnim.z < 1.5 ? uSpin.y : aAnim.z < 2.5 ? uSpin.z : uSpin.w) * aAnim.y + aAnim.w;
    p = piv + lmRot(p - piv, aAxis, a);
    n = lmRot(n, aAxis, a);
  } else if (mode < 10.5) {
    // visibility group (uVis[a]) + gentle sway (b = amplitude, c = phase)
    float v = aAnim.y < 0.5 ? uVis.x : aAnim.y < 1.5 ? uVis.y : aAnim.y < 2.5 ? uVis.z : uVis.w;
    float a = aAnim.z * sin(uTime * 2.2 + aAnim.w);
    p = piv + lmRot(p - piv, aAxis, a);
    n = lmRot(n, aAxis, a);
    if (v < 0.5) p = piv;
  }
}
`;

/** Cutout patterns. q = pattern coords, mt = aMat. Returns true when the fragment is a hole. */
export const LM_CUT = /* glsl */ `
float lmBayer4(vec2 fc) {
  vec2 p = mod(floor(fc), 4.0);
  float b = 0.0;
  if (p.y < 0.5) b = p.x < 0.5 ? 0.0 : p.x < 1.5 ? 8.0 : p.x < 2.5 ? 2.0 : 10.0;
  else if (p.y < 1.5) b = p.x < 0.5 ? 12.0 : p.x < 1.5 ? 4.0 : p.x < 2.5 ? 14.0 : 6.0;
  else if (p.y < 2.5) b = p.x < 0.5 ? 3.0 : p.x < 1.5 ? 11.0 : p.x < 2.5 ? 1.0 : 9.0;
  else b = p.x < 0.5 ? 15.0 : p.x < 1.5 ? 7.0 : p.x < 2.5 ? 13.0 : 5.0;
  return (b + 0.5) / 16.0;
}
// returns coverage of solid members (0 = hole); 'kind' tells which member (for colouring)
float lmCutMask(vec2 q, vec4 mt, out float kind) {
  vec2 FQ = fwidth(q) + 1e-5;
  float pat = floor(mt.x + 0.5);
  float res = 1.0;
  kind = 0.0;
  if (pat == 15.0) {
    // lattice truss: u along the member, v across, face width W = mt.z
    float W = max(mt.z, 0.2);
    float cw = 0.045 + 0.035 * W;
    float chord = max(lmBand(q.y, 0.0, cw, FQ.y), lmBand(q.y, W - cw, W, FQ.y));
    float vert = lmBar(q.x, W, 0.02 + 0.02 * W, FQ.x);
    float t = fract(q.x / W);
    float dir = mod(floor(q.x / W), 2.0);
    float vl = (dir < 0.5 ? t : 1.0 - t) * W;
    float fwv = FQ.y;
    float hw = max(0.018 + 0.012 * W, fwv * 0.55);
    float diag = 1.0 - smoothstep(hw - fwv * 0.5, hw + fwv * 0.5, abs(q.y - vl) * 0.7071);
    res = max(max(chord, vert), diag);
  } else if (pat == 16.0) {
    // scaffold: u along the facade, v up (metres from the base)
    float stdn = lmBar(q.x, 2.5, 0.03, FQ.x);
    float lift = fract(q.y / 2.0) * 2.0;
    float ledger = lmBand(lift, 0.0, 0.06, FQ.y);
    float rail = max(lmBand(lift, 0.98, 1.03, FQ.y), lmBand(lift, 0.5, 0.54, FQ.y));
    float toe = lmBand(lift, 0.06, 0.2, FQ.y);
    float bay = floor(q.x / 2.5);
    float t = fract(q.x / 2.5);
    float br = 0.0;
    float fwv = FQ.y;
    float hw = max(0.025, fwv * 0.55);
    float bd = abs(lift - t * 2.0) * 0.78;
    br = (mod(bay, 3.0) < 0.5) ? 1.0 - smoothstep(hw - fwv * 0.5, hw + fwv * 0.5, bd) : 0.0;
    kind = toe > 0.5 ? 1.0 : 0.0;
    res = max(max(max(stdn, ledger), max(rail, br)), toe);
  } else if (pat == 17.0) {
    // temporary fence panels (3.5 m) with a fine mesh (dithered)
    bool isNet = fract(mt.w) > 0.5;
    float frame = isNet ? 0.0 : max(lmBar(q.x, 3.5, 0.025, FQ.x), max(lmBand(q.y, 0.05, 0.1, FQ.y), lmBand(q.y, 1.9, 1.96, FQ.y)));
    float mesh = (lmBayer4(gl_FragCoord.xy) < (isNet ? 0.38 : 0.3) && (isNet || (q.y < 1.96 && q.y > 0.05))) ? 1.0 : 0.0;
    kind = frame > 0.5 ? 0.0 : 1.0;
    res = max(frame, mesh);
  } else if (pat == 22.0) {
    // railings / balustrades: u along, v up from the base; H = mt.z rail height
    float H = max(mt.z, 0.3);
    float seed = fract(mt.w);
    float top = lmBand(q.y, H - 0.06, H, FQ.y);
    float bot = lmBand(q.y, 0.04, 0.1, FQ.y);
    float bars = lmBar(q.x, 0.14, 0.012, FQ.x);
    if (seed > 0.5) {
      // stone balustrade: vase-shaped balusters
      float tt = clamp(q.y / H, 0.0, 1.0);
      float bw = 0.045 + 0.035 * sin(tt * 3.14159) * (0.7 + 0.3 * sin(tt * 9.0));
      bars = lmBar(q.x, 0.3, bw, FQ.x);
      top = lmBand(q.y, H - 0.12, H, FQ.y);
      bot = lmBand(q.y, 0.0, 0.12, FQ.y);
    }
    res = (q.y > H || q.y < 0.0) ? 0.0 : max(max(top, bot), bars);
  }
  return res;
}
`;

/** Fragment surface model. Expects varyings vPuv, vMat, vYN (world y, world normal y) and vColor. */
export const LM_SURFACE = /* glsl */ `
uniform float uLights;
uniform float uNight;
uniform float uHours;
uniform float uTimeF;
uniform float uFloodOn;

vec3 lmFlagColor(float id, vec2 uv) {
  float u = uv.x, v = uv.y;
  vec3 white = vec3(0.96, 0.95, 0.91);
  if (id < 0.5) {
    // Tinyhaven: sky blue, white wave, golden sun
    vec3 c = vec3(0.16, 0.42, 0.74);
    if (abs(v - 0.42 - 0.05 * sin(u * 9.0)) < 0.07) c = white;
    if (length((uv - vec2(0.24, 0.72)) * vec2(1.6, 1.0)) < 0.13) c = vec3(0.98, 0.78, 0.2);
    return c;
  } else if (id < 1.5) {
    // harbour: white field, two blue waves, red hoist triangle
    vec3 c = white;
    if (abs(v - 0.3 - 0.04 * sin(u * 12.0)) < 0.06 || abs(v - 0.55 - 0.04 * sin(u * 12.0 + 1.0)) < 0.06) c = vec3(0.12, 0.36, 0.68);
    if (u < 0.3 * (1.0 - abs(v - 0.5) * 2.0)) c = vec3(0.82, 0.16, 0.18);
    return c;
  } else if (id < 2.5) {
    // park county: green / cream diagonal with a golden leaf disc
    vec3 c = (u + v > 1.0) ? vec3(0.18, 0.5, 0.3) : vec3(0.93, 0.9, 0.78);
    if (length((uv - vec2(0.5, 0.5)) * vec2(1.6, 1.0)) < 0.15) c = vec3(0.92, 0.72, 0.2);
    return c;
  } else if (id < 3.5) {
    // old town: red field, white battlements along the bottom
    vec3 c = vec3(0.74, 0.14, 0.16);
    float crenel = step(0.5, fract(u * 6.0)) * 0.08;
    if (v < 0.28 + crenel) c = white;
    if (length((uv - vec2(0.5, 0.66)) * vec2(1.6, 1.0)) < 0.1) c = vec3(0.98, 0.8, 0.25);
    return c;
  } else if (id < 4.5) {
    // market: saffron / teal halves with a white star
    vec3 c = v > 0.5 ? vec3(0.95, 0.66, 0.16) : vec3(0.12, 0.52, 0.55);
    vec2 p = (uv - vec2(0.3, 0.5)) * vec2(1.6, 1.0);
    float a = atan(p.y, p.x);
    float r = length(p);
    if (r < 0.1 + 0.06 * cos(a * 5.0)) c = white;
    return c;
  } else if (id < 5.5) {
    return mod(floor(u * 7.0), 2.0) < 0.5 ? vec3(0.85, 0.12, 0.14) : white;
  } else if (id < 6.5) {
    float ch = abs(v - 0.5) * 1.2 + u * 0.6;
    return (ch > 0.42 && ch < 0.6) ? white : vec3(0.1, 0.16, 0.36);
  }
  return mod(floor((u + v) * 5.0), 2.0) < 0.5 ? vec3(0.98, 0.78, 0.1) : vec3(0.12, 0.12, 0.12);
}

float lmSegment(vec2 p, vec2 a, vec2 b, float w, float fw) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  return 1.0 - smoothstep(w - fw, w + fw, d);
}

void lmSurface(inout vec3 albedo, inout float rough, inout float metal, inout vec3 emit, vec2 yn) {
  vec2 q = vPuv;
  vec2 FQ = fwidth(q) + 1e-5;
  float FM = max(FQ.x, FQ.y);
  float pat = floor(vMat.x + 0.5);
  float glow = vMat.z;
  float seed = fract(vMat.w);
  float flood = floor(vMat.w);
  vec3 base = albedo;
  float lights = uLights;

  // far mode: once a fine surface pattern is smaller than ~half a pixel, use its average
  // shade and skip the work (most landmark pixels in the wide views)
  float fineP = pat < 0.5 ? 0.25 : pat == 1.0 ? 0.19 : pat == 2.0 ? 0.48 : pat == 3.0 ? 0.3 : pat == 4.0 ? 0.22 : pat == 5.0 ? 0.45 : pat == 8.0 ? 0.6 : pat == 9.0 ? 0.16 : pat == 10.0 ? 0.12 : pat == 21.0 ? 0.15 : pat == 23.0 ? 0.6 : pat == 24.0 ? 0.3 : pat == 26.0 ? 0.09 : 0.0;
  if (fineP > 0.0 && FM > fineP * 0.45) {
    float k = pat == 1.0 ? 0.97 : pat == 2.0 ? 0.96 : pat == 3.0 ? 0.83 : pat == 4.0 ? 0.9 : pat == 8.0 ? 0.95 : pat == 9.0 ? 0.95 : pat == 21.0 ? 0.94 : pat == 26.0 ? 0.95 : 0.99;
    albedo *= k;
    if (pat == 1.0) albedo = mix(albedo, vec3(0.8, 0.77, 0.72), 0.08);
    if (pat == 24.0) albedo = mix(albedo, vec3(0.45, 0.25, 0.14), 0.18);
    if (pat == 3.0) rough = 0.75;
    else if (pat == 4.0) rough = 0.6;
    else if (pat == 24.0) rough = 0.85;
  } else if (pat < 0.5) {
    // plain painted surface: soft blotches
    albedo *= 0.95 + 0.07 * lmNoise(q * 0.6 + seed * 13.0);
  } else if (pat == 1.0) {
    // brick
    float bh = 0.19, bw = 0.42;
    float row = floor(q.y / bh);
    float bx = q.x / bw + mod(row, 2.0) * 0.5;
    float col = floor(bx);
    float det = lmDetail(FQ.y, bh);
    float h = lmH12(vec2(col, row) + seed * 37.0);
    albedo *= mix(1.0, 0.86 + 0.24 * h - (h > 0.94 ? 0.18 : 0.0), det);
    float mort = max(lmLines(q.y, bh, 0.011, FQ.y), lmLines(q.x + mod(row, 2.0) * bw * 0.5, bw, 0.011, FQ.x) * det);
    albedo = mix(albedo, mix(base, vec3(0.8, 0.77, 0.72), 0.7), mort * 0.85);
    albedo *= 0.93 + 0.1 * lmNoise(q * 0.5 + 3.0);
  } else if (pat == 2.0) {
    // ashlar stone (seed > .5: rusticated)
    bool rust = seed > 0.5;
    float bh = rust ? 0.6 : 0.48, bw = rust ? 1.25 : 1.05;
    float row = floor(q.y / bh);
    float off = mod(row, 2.0) * 0.5 * bw;
    float col = floor((q.x + off) / bw);
    float det = lmDetail(FQ.y, bh);
    float h = lmH12(vec2(col, row) + seed * 17.0);
    albedo *= mix(1.0, 0.93 + 0.12 * h, det);
    float jw = rust ? 0.035 : 0.01;
    float j = max(lmLines(q.y, bh, jw, FQ.y), lmLines(q.x + off, bw, jw, FQ.x) * det);
    albedo = mix(albedo, albedo * (rust ? 0.62 : 0.8), j);
    albedo *= 0.94 + 0.09 * lmNoise(q * 0.8 + 7.0);
  } else if (pat == 3.0) {
    // clay roof tiles: u along the eaves, v up-slope
    float rh = 0.3, tw = 0.27;
    float row = floor(q.y / rh);
    float fy = fract(q.y / rh);
    float off = mod(row, 2.0) * 0.5 * tw;
    float col = floor((q.x + off) / tw);
    float fx = fract((q.x + off) / tw);
    float det = lmDetail(FQ.y, rh);
    float h = lmH12(vec2(col, row) + seed * 11.0);
    float shade = 1.0 - 0.3 * smoothstep(0.62, 1.0, fy) - 0.12 * pow(abs(fx - 0.5) * 2.0, 3.0);
    albedo *= mix(0.9, shade * (0.88 + 0.22 * h), det);
    albedo *= 0.9 + 0.14 * lmNoise(q * vec2(0.25, 0.4) + seed * 5.0);
    rough = 0.75;
  } else if (pat == 4.0) {
    // slate
    float rh = 0.22, tw = 0.3;
    float row = floor(q.y / rh);
    float fy = fract(q.y / rh);
    float off = mod(row, 2.0) * 0.5 * tw;
    float col = floor((q.x + off) / tw);
    float det = lmDetail(FQ.y, rh);
    float h = lmH12(vec2(col, row) + seed * 7.0);
    float shade = 1.0 - 0.22 * smoothstep(0.7, 1.0, fy);
    albedo *= mix(0.93, shade * (0.9 + 0.17 * h), det);
    float gap = lmLines(q.x + off, tw, 0.01, FQ.x) * det;
    albedo *= 1.0 - 0.25 * gap;
    rough = 0.6;
  } else if (pat == 5.0) {
    // standing seam metal (copper / zinc)
    float s = lmLines(q.x, 0.45, 0.018, FQ.x);
    float sh = lmDetail(FQ.x, 0.45) * 0.06 * sin(fract(q.x / 0.45) * 6.2831);
    albedo *= 1.0 + 0.18 * s + sh;
    albedo *= 0.9 + 0.16 * lmNoise(vec2(q.x * 2.2, q.y * 0.15) + seed * 9.0);
  } else if (pat == 6.0) {
    // glazing grid (iron mullions = vertex colour)
    float pw = seed > 0.5 ? 0.75 : 1.1, ph = seed > 0.5 ? 0.9 : 0.8;
    float m = max(lmLines(q.x, pw, 0.035, FQ.x), lmLines(q.y, ph, 0.03, FQ.y));
    vec2 cell = floor(q / vec2(pw, ph));
    float h = lmH12(cell + 3.7);
    vec3 glass = mix(vec3(0.07, 0.1, 0.12), vec3(0.22, 0.29, 0.34), 0.2 + 0.5 * h);
    albedo = mix(glass, base, m);
    rough = mix(0.1, 0.55, m);
    metal = mix(0.0, 0.3, m);
    float lit = (0.55 + 0.5 * h) * glow * lights;
    emit += vec3(1.0, 0.6, 0.27) * lit * (1.0 - m) * 0.62;
  } else if (pat == 7.0) {
    // window: uv 0..1 over the opening; frame/muntins = vertex colour
    vec2 uv = q;
    float fwu = 0.075, fwv = 0.05;
    float frame = max(max(lmBand(uv.x, 0.0, fwu, FQ.x), lmBand(uv.x, 1.0 - fwu, 1.0, FQ.x)), max(lmBand(uv.y, 0.0, fwv, FQ.y), lmBand(uv.y, 1.0 - fwv, 1.0, FQ.y)));
    float mun = max(lmBand(uv.x, 0.485, 0.515, FQ.x), seed > 0.55 ? max(lmBand(uv.y, 0.32, 0.345, FQ.y), lmBand(uv.y, 0.655, 0.68, FQ.y)) : lmBand(uv.y, 0.58, 0.61, FQ.y));
    float bars = max(frame, mun * lmDetail(FQ.y, 0.25));
    vec3 glass = mix(vec3(0.035, 0.05, 0.07), vec3(0.17, 0.23, 0.29), 0.2 + 0.6 * uv.y);
    // curtains at the sides
    float cur = smoothstep(0.2, 0.17, uv.x) + smoothstep(0.8, 0.83, uv.x);
    vec3 curC = seed > 0.7 ? vec3(0.62, 0.22, 0.2) : vec3(0.86, 0.8, 0.66);
    glass = mix(glass, curC * 0.55, cur * 0.6);
    albedo = mix(glass, base, bars);
    rough = mix(0.18, 0.6, bars);
    float on = step(seed, glow) * lights;
    float bright = 0.75 + 0.5 * fract(seed * 7.13);
    vec3 lc = mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.7, 0.4), fract(seed * 3.7));
    emit += lc * on * bright * (1.0 - bars) * (0.85 + cur * 0.3) * (0.8 + 0.3 * (1.0 - uv.y));
  } else if (pat == 8.0) {
    // board-formed concrete
    float l = max(lmLines(q.x, 2.4, 0.006, FQ.x), lmLines(q.y, 1.2, 0.006, FQ.y));
    vec2 hp = fract(q / vec2(0.6, 0.6)) - 0.5;
    float tie = (1.0 - smoothstep(0.03, 0.05, length(hp * vec2(0.6, 0.6)))) * lmDetail(FQ.x, 0.6);
    albedo *= (1.0 - 0.12 * l) * (1.0 - 0.2 * tie);
    albedo *= 0.9 + 0.14 * lmNoise(q * 0.45 + seed * 3.0);
    albedo *= 0.96 + 0.05 * lmNoise(vec2(q.x * 4.0, q.y * 0.25));
  } else if (pat == 9.0) {
    // wooden boards
    vec2 p = seed > 0.5 ? q.yx : q;
    vec2 fp = seed > 0.5 ? FQ.yx : FQ;
    float bh = 0.16;
    float row = floor(p.y / bh);
    float h = lmH12(vec2(row, 1.3 + seed));
    float g = lmLines(p.y, bh, 0.007, fp.y);
    albedo *= (0.88 + 0.2 * h) * (1.0 - 0.35 * g);
    albedo *= 0.92 + 0.1 * lmNoise(vec2(p.x * 1.2, p.y * 14.0) + row);
  } else if (pat == 10.0) {
    // corrugated metal (ribs along v)
    float det = lmDetail(FQ.x, 0.12);
    albedo *= 1.0 + det * 0.12 * cos(q.x / 0.12 * 6.2831);
    albedo *= 0.92 + 0.12 * lmNoise(q * vec2(0.6, 0.3) + seed * 4.0);
  } else if (pat == 11.0) {
    // stadium seats: u along the row, v across the tread
    float cw = 0.5;
    float fx = fract(q.x / cw);
    float det = lmDetail(FQ.x, cw);
    float seat = smoothstep(0.08, 0.12, fx) * smoothstep(0.92, 0.88, fx);
    float fv = fract(q.y / 0.8);
    float back = smoothstep(0.55, 0.6, fv) * smoothstep(0.85, 0.8, fv);
    vec3 concrete = vec3(0.62, 0.61, 0.58);
    vec3 c = mix(concrete, base * (0.9 + 0.2 * back), max(seat * smoothstep(0.08, 0.15, fv) * smoothstep(0.88, 0.8, fv), 0.0));
    albedo = mix(mix(concrete, base, 0.6), c, det);
  } else if (pat == 12.0) {
    // awning stripes along u
    float s = step(0.5, fract(q.x / 0.5));
    float det = lmDetail(FQ.x, 0.5);
    albedo = mix(mix(base, vec3(0.96, 0.94, 0.88), 0.45), mix(base, vec3(0.97, 0.95, 0.9), s), det);
#ifndef LM_NO_ORNAMENT
  } else if (pat == 13.0) {
    // clock face (uv 0..1 over the disc): live time from uHours
    vec2 p = q * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.x, p.y);
    vec3 face = base;
    float ink = 0.0;
    float FR = 2.0 * FM;
    ink = max(ink, lmBand(r, 0.86, 0.95, FR));
    float hp = abs(fract(a / 6.2831853 * 12.0 + 0.5) - 0.5);
    float big = abs(fract(a / 6.2831853 * 4.0 + 0.5) - 0.5);
    ink = max(ink, step(hp, 0.045) * lmBand(r, 0.66, 0.82, FR));
    ink = max(ink, step(big, 0.025) * lmBand(r, 0.6, 0.82, FR));
    float mp = abs(fract(a / 6.2831853 * 60.0 + 0.5) - 0.5);
    ink = max(ink, step(mp, 0.08) * lmBand(r, 0.77, 0.82, FR) * lmDetail(FR, 0.05));
    float hh = mod(uHours, 12.0) / 12.0 * 6.2831853;
    float mm = fract(uHours) * 6.2831853;
    vec2 dh = vec2(sin(hh), cos(hh));
    vec2 dm = vec2(sin(mm), cos(mm));
    ink = max(ink, lmSegment(p, -dh * 0.1, dh * 0.5, 0.055, FR));
    ink = max(ink, lmSegment(p, -dm * 0.14, dm * 0.76, 0.034, FR));
    ink = max(ink, 1.0 - smoothstep(0.06, 0.08, r));
    vec3 inkC = vec3(0.06, 0.06, 0.07);
    albedo = mix(face, inkC, ink);
    rough = 0.45;
    emit += vec3(1.0, 0.88, 0.62) * glow * lights * (1.0 - ink) * step(r, 0.95) * 0.85;
  } else if (pat == 14.0) {
    albedo = lmFlagColor(floor(seed * 8.0), q);
    rough = 0.92;
#endif
  } else if (pat == 18.0) {
    // louvres
    float s = fract(q.y / 0.17);
    albedo *= mix(0.35, 1.0, smoothstep(0.15, 0.3, s) * smoothstep(0.95, 0.75, s));
#ifndef LM_NO_ORNAMENT
  } else if (pat == 19.0) {
    // rose window: uv 0..1 over the disc, tracery = vertex colour
    vec2 p = q * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float sec = fract(a / 6.2831853 * 12.0);
    float spoke = step(r, 0.92) * step(0.3, r) * (1.0 - smoothstep(0.03, 0.05, abs(sec - 0.5) * r * 0.52));
    float FR = 2.0 * FM;
    float rings = max(lmBand(r, 0.9, 1.0, FR), max(lmBand(r, 0.28, 0.34, FR), 1.0 - smoothstep(0.1, 0.12, r)));
    vec2 pc = vec2(cos((floor(a / 6.2831853 * 12.0) + 0.5) / 12.0 * 6.2831853), sin((floor(a / 6.2831853 * 12.0) + 0.5) / 12.0 * 6.2831853)) * 0.62;
    float foil = lmBand(length(p - pc), 0.17, 0.21, FR);
    float tr = max(max(spoke, rings), foil);
    float sectorId = floor(a / 6.2831853 * 12.0);
    vec3 gc = r < 0.3 ? vec3(1.0, 0.75, 0.25) : (length(p - pc) < 0.17 ? (mod(sectorId, 2.0) < 0.5 ? vec3(0.2, 0.35, 0.95) : vec3(0.9, 0.2, 0.25)) : vec3(0.25, 0.45, 0.9));
    if (r > 0.75 && r < 0.9) gc = mod(sectorId, 2.0) < 0.5 ? vec3(0.95, 0.3, 0.2) : vec3(0.2, 0.6, 0.45);
    albedo = mix(gc * 0.32, base, tr);
    rough = mix(0.2, 0.8, tr);
    emit += gc * glow * lights * (1.0 - tr) * 1.5;
  } else if (pat == 20.0) {
    // stained-glass lancet: uv 0..1, lead quarries + coloured panes
    vec2 g = q * vec2(3.0, 9.0);
    vec2 d = vec2(g.x + g.y, g.x - g.y);
    vec2 cell = floor(d);
    float FD = 3.0 * FQ.x + 9.0 * FQ.y;
    float lead = max(lmLines(d.x, 1.0, 0.05, FD), lmLines(d.y, 1.0, 0.05, FD));
    float h = lmH12(cell + seed * 9.0);
    vec3 gc = h < 0.3 ? vec3(0.2, 0.32, 0.9) : h < 0.55 ? vec3(0.85, 0.2, 0.22) : h < 0.75 ? vec3(0.98, 0.78, 0.25) : h < 0.9 ? vec3(0.25, 0.7, 0.45) : vec3(0.75, 0.4, 0.85);
    float frame = max(lmBand(q.x, 0.0, 0.07, FQ.x), lmBand(q.x, 0.93, 1.0, FQ.x));
    float mull = lmBand(q.x, 0.47, 0.53, FQ.x);
    float tr = max(max(frame, mull), lead * 0.85);
    albedo = mix(gc * 0.3, base, tr);
    rough = mix(0.2, 0.8, tr);
    emit += gc * glow * lights * (1.0 - tr) * 1.35;
#endif
  } else if (pat == 21.0) {
    // gravel / sand / soil speckle
    float n1 = lmNoise(q * 9.0 + seed * 4.0);
    float n2 = lmNoise(q * 2.3 + 1.7);
    albedo *= 0.78 + 0.3 * mix(0.5, n1, lmDetail(FQ.x, 0.15)) + 0.12 * n2;
  } else if (pat == 23.0) {
    // metal cladding panels
    float pw = 1.2, ph = 0.6;
    float l = max(lmLines(q.x, pw, 0.008, FQ.x), lmLines(q.y, ph, 0.008, FQ.y));
    vec2 cell = floor(q / vec2(pw, ph));
    albedo *= (0.95 + 0.08 * lmH12(cell + seed * 5.0)) * (1.0 - 0.3 * l);
  } else if (pat == 24.0) {
    // weathered / rusty steel
    float n = lmNoise(q * vec2(1.5, 0.6) + seed * 8.0);
    float st = lmNoise(vec2(q.x * 6.0, q.y * 0.4));
    float r2 = smoothstep(0.55, 0.85, n * 0.7 + st * 0.4);
    albedo = mix(albedo, vec3(0.45, 0.25, 0.14), r2 * 0.7);
    rough = 0.85;
  } else if (pat == 25.0) {
    // panelled door: uv 0..1, wood = vertex colour; upper glazing when seed < .5
    float frame = max(max(lmBand(q.x, 0.0, 0.06, FQ.x), lmBand(q.x, 0.94, 1.0, FQ.x)), lmBand(q.y, 0.95, 1.0, FQ.y));
    float split = lmBand(q.x, 0.49, 0.51, FQ.x);
    vec2 lp = vec2(fract(q.x * 2.0), q.y);
    float panel = lmBand(lp.x, 0.18, 0.82, 2.0 * FQ.x) * (lmBand(lp.y, 0.1, 0.42, FQ.y) + lmBand(lp.y, 0.5, 0.88, FQ.y));
    bool glazed = seed < 0.5 && q.y > 0.5 && q.y < 0.9 && lp.x > 0.16 && lp.x < 0.84;
    albedo = base * (1.0 - 0.18 * panel) * (1.0 - 0.35 * max(frame, split));
    if (glazed) {
      albedo = vec3(0.12, 0.15, 0.18);
      rough = 0.15;
      emit += vec3(1.0, 0.76, 0.45) * glow * lights;
    }
  } else if (pat == 26.0) {
    // roller shutter
    albedo *= 1.0 - 0.18 * lmLines(q.y, 0.09, 0.012, FQ.y);
  }

  // ── church weathering (flood CHURCH = only the church's stone + dressings): a century of town air on
  // sandstone — blotchy soot that settles where rain does not wash, pale rain-washed runs and dark drip
  // streaks down the walls, green algae + damp in the splash zone at the foot. Walls only (not caps / sills).
  if (flood > 2.5 && flood < 3.5 && (pat == 2.0 || pat < 0.5) && abs(yn.y) < 0.5) {
    float y = yn.x;
    float n1 = lmNoise(q * vec2(0.35, 0.22) + 11.0), n2 = lmNoise(q * vec2(1.3, 0.9) + 4.0);
    // soot: patches grow with height (less rain-wash under the eaves / buttress offsets)
    float soot = smoothstep(0.42, 0.78, n1 * 0.75 + n2 * 0.35 + 0.12 * smoothstep(3.0, 14.0, y));
    // vertical run streaks: dark drips and pale washed lanes (column noise stretched along y)
    float sx = lmNoise(vec2(q.x * 2.6, q.y * 0.07 + 3.0));
    float drip = smoothstep(0.62, 0.86, sx) * (0.6 + 0.4 * n2);
    float wash = smoothstep(0.66, 0.9, lmNoise(vec2(q.x * 1.9 + 5.0, q.y * 0.05)));
    vec3 sootC = vec3(0.24, 0.22, 0.2);
    albedo = mix(albedo, albedo * 0.45 + sootC * 0.25, soot * 0.55);
    albedo = mix(albedo, albedo * 0.62, drip * 0.45);
    albedo = mix(albedo, min(albedo * 1.12, vec3(0.9)), wash * 0.35 * (1.0 - soot));
    // foot: damp darkening up to ~1.1 m with a ragged tide line, algae green in the lowest ~60 cm
    float edge = 0.75 + 0.35 * lmNoise(vec2(q.x * 1.7, 2.0)) + 0.2 * n2;
    float damp = 1.0 - smoothstep(edge - 0.25, edge + 0.08, y);
    float alg = (1.0 - smoothstep(0.15, 0.55 + 0.25 * n1, y)) * (0.55 + 0.45 * lmNoise(q * 2.4 + 1.0));
    albedo *= 1.0 - 0.32 * damp;
    albedo = mix(albedo, vec3(0.2, 0.27, 0.14), alg * 0.55);
    rough = min(1.0, rough + 0.05 * soot);
  }

  // ── night uplighting of facades (flood type in the integer part of aMat.w)
  if (flood > 0.5 && lights > 0.01) {
    float h = max(yn.x, 0.0);
    float up = 1.0 - max(yn.y, 0.0);
    vec3 lc = vec3(1.0, 0.78, 0.5);
    float k = 0.0;
    if (flood < 1.5) {
      float sp = 3.4;
      float c = (fract(q.x / sp + 0.5) - 0.5) * sp;
      float spread = 0.32 + h * 0.2;
      k = exp(-(c * c) / (spread * spread)) * smoothstep(0.0, 0.7, h) * exp(-h / 6.0) * 0.85;
    } else if (flood < 2.5) {
      float cyc = 0.5 + 0.5 * sin(uTimeF * 0.04);
      lc = mix(vec3(0.55, 0.75, 1.0), vec3(0.8, 0.6, 1.0), cyc);
      k = (0.25 + 0.75 * exp(-h / 55.0)) * 0.9;
    } else if (flood < 3.5) {
      float sp = 4.6;
      float c = (fract(q.x / sp + 0.5) - 0.5) * sp;
      float spread = 0.5 + h * 0.22;
      k = exp(-(c * c) / (spread * spread)) * smoothstep(0.0, 0.8, h) * exp(-h / 11.0) * 0.8;
    } else {
      k = smoothstep(0.0, 0.4, h) * exp(-h / 5.0) * 0.7;
    }
    emit += albedo * lc * k * lights * up;
  }
}
`;

// ───────────────────────────────────────────────────────────── lights ──

export const LIGHTS_VERT = /* glsl */ `
attribute vec4 aMat;   // mode, intensity, phase, day level
attribute vec2 aPuv;
uniform float uLights;
uniform float uFlood;
varying vec3 vCol;
varying vec2 vLuv;
varying float vMode;
#include <common>
#include <fog_pars_vertex>
${LM_KIN_PARS}
void main() {
  vec3 p = position;
  vec3 n = normal;
  lmKin(p, n);
  float mode = aMat.x;
  float k = 0.0;
  if (mode < 0.5) k = mix(aMat.w, 1.0, uLights);
  else if (mode < 1.5) {
    float ph = fract(uTime * 0.7 + aMat.z);
    float on = smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.16, 0.24, ph));
    k = mix(aMat.w, 1.0, uLights) * (0.05 + 0.95 * on);
  } else if (mode < 2.5) k = 1.0;
  else if (mode < 3.5) {
    float ph = fract(aPuv.x - uTime * 0.035 + aMat.z);
    k = uLights * (0.25 + 0.75 * pow(max(cos(ph * 6.2831853), 0.0), 8.0));
  } else if (mode < 4.5) k = 1.0;
  else if (mode < 5.5) k = uFlood;
  else if (mode < 6.5) {
    float ph = fract(uTime * 0.45 + aMat.z);
    k = step(ph, 0.05) + step(abs(ph - 0.13), 0.025);
    k *= mix(0.6, 1.0, uLights);
  } else k = uLights * (0.9 + 0.1 * sin(uTime * 2.3 + aMat.z * 40.0));
  vCol = color * k * aMat.y;
  vLuv = aPuv;
  vMode = mode;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  if (k * aMat.y < 0.003) mvPosition = vec4(0.0, 0.0, 2.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const LIGHTS_FRAG = /* glsl */ `
uniform float uHours;
uniform vec4 uScore;   // home, away, minute, state (0 idle → clock, 1 match, 2 goal flash)
uniform float uRealT;
varying vec3 vCol;
varying vec2 vLuv;
varying float vMode;
#include <common>
#include <fog_pars_fragment>
float lsSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return 1.0 - smoothstep(0.07, 0.11, length(pa - ba * h));
}
float lsDigit(vec2 p, int d) {
  if (p.x < -0.1 || p.x > 1.1 || p.y < -0.1 || p.y > 1.1) return 0.0;
  int bits = d == 0 ? 63 : d == 1 ? 6 : d == 2 ? 91 : d == 3 ? 79 : d == 4 ? 102 : d == 5 ? 109 : d == 6 ? 125 : d == 7 ? 7 : d == 8 ? 127 : d == 9 ? 111 : 64;
  float v = 0.0;
  if ((bits & 1) != 0) v = max(v, lsSeg(p, vec2(0.12, 1.0), vec2(0.88, 1.0)));
  if ((bits & 2) != 0) v = max(v, lsSeg(p, vec2(0.92, 0.96), vec2(0.92, 0.54)));
  if ((bits & 4) != 0) v = max(v, lsSeg(p, vec2(0.92, 0.46), vec2(0.92, 0.04)));
  if ((bits & 8) != 0) v = max(v, lsSeg(p, vec2(0.12, 0.0), vec2(0.88, 0.0)));
  if ((bits & 16) != 0) v = max(v, lsSeg(p, vec2(0.08, 0.46), vec2(0.08, 0.04)));
  if ((bits & 32) != 0) v = max(v, lsSeg(p, vec2(0.08, 0.96), vec2(0.08, 0.54)));
  if ((bits & 64) != 0) v = max(v, lsSeg(p, vec2(0.12, 0.5), vec2(0.88, 0.5)));
  return v;
}
void main() {
  vec3 c = vCol;
  float fwc = fwidth(vLuv.x) * 120.0;
  if (vMode > 3.5 && vMode < 4.5) {
    // scoreboard LED display, uv 0..1 (aspect ~3:1)
    vec2 uv = vLuv;
    vec2 cell = uv * vec2(120.0, 40.0);
    float dotm = 1.0 - smoothstep(0.32, 0.46, length(fract(cell) - 0.5));
    float fw = fwc;
    dotm = mix(dotm, 0.55, smoothstep(0.4, 1.2, fw));
    vec2 dc = (floor(cell) + 0.5) / vec2(120.0, 40.0);
    float on = 0.0;
    vec3 col = vec3(1.0, 0.62, 0.12);
    if (uScore.w < 0.5) {
      // idle: show the time HH:MM
      float hh = floor(uHours);
      float mi = floor(fract(uHours) * 60.0);
      vec2 o = vec2(0.2, 0.28);
      vec2 sz = vec2(0.1, 0.44);
      on = max(on, lsDigit((dc - o) / sz, int(hh / 10.0)));
      on = max(on, lsDigit((dc - o - vec2(0.14, 0.0)) / sz, int(mod(hh, 10.0))));
      on = max(on, lsDigit((dc - o - vec2(0.33, 0.0)) / sz, int(mi / 10.0)));
      on = max(on, lsDigit((dc - o - vec2(0.47, 0.0)) / sz, int(mod(mi, 10.0))));
      float colon = step(length((dc - vec2(0.5, 0.4)) * vec2(3.0, 1.0)), 0.03) + step(length((dc - vec2(0.5, 0.62)) * vec2(3.0, 1.0)), 0.03);
      on = max(on, colon);
      col = vec3(1.0, 0.75, 0.3);
    } else {
      vec2 sz = vec2(0.13, 0.5);
      on = max(on, lsDigit((dc - vec2(0.17, 0.36)) / sz, int(uScore.x)));
      on = max(on, lsDigit((dc - vec2(0.7, 0.36)) / sz, int(uScore.y)));
      on = max(on, step(abs(dc.x - 0.5), 0.05) * step(abs(dc.y - 0.61), 0.025));
      // minute (small digits, bottom centre)
      float mn = min(uScore.z, 99.0);
      vec2 s2 = vec2(0.05, 0.2);
      float small = max(lsDigit((dc - vec2(0.445, 0.08)) / s2, int(mn / 10.0)), lsDigit((dc - vec2(0.51, 0.08)) / s2, int(mod(mn, 10.0))));
      on = max(on, small);
      if (uScore.w > 1.5) {
        // goal! flashing frame
        float fl = step(0.5, fract(uRealT * 2.5));
        float border = 1.0 - step(0.06, min(min(dc.x, 1.0 - dc.x), min(dc.y, 1.0 - dc.y)));
        on = max(on, border * fl);
        col = mix(col, vec3(1.0, 0.9, 0.4), fl * 0.5);
      }
    }
    c = mix(vec3(0.02, 0.025, 0.03), col * 3.2, on) * dotm + vec3(0.015);
  }
  gl_FragColor = vec4(c, 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
}
`;

// ───────────────────────────────────────────────────────────── glows ──

export const GLOW_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec4 aInfo;   // size, kind (0 halo, 1 pool, 2 beam), intensity, mode
attribute vec4 aExtra;  // beam: direction xyz * length, w = end width; others: day level in w, phase in x
attribute vec3 aTint;
uniform float uLights;
uniform float uTime;
uniform float uFlood;
uniform vec4 uCrane;
varying vec2 vUv;
varying vec3 vCol;
varying float vKind;
#include <common>
#include <fog_pars_vertex>
vec3 gRot(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
void main() {
  vUv = aCorner;
  float mode = aInfo.w;
  float k = 0.0;
  vec3 center = aCenter;
  if (mode < 0.5) k = max(uLights, aExtra.w);
  else if (mode < 1.5) {
    float ph = fract(uTime * 0.7 + aExtra.x);
    float on = smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.16, 0.24, ph));
    k = mix(0.25, 1.0, uLights) * on;
  } else if (mode < 2.5) k = uFlood;
  else if (mode < 3.5) {
    // crane jib-tip light: aExtra.xyz = pivot, rotate the rest position by the slew angle
    float ph = fract(uTime * 0.7 + 0.3);
    float on = smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.16, 0.24, ph));
    k = mix(0.2, 1.0, uLights) * on;
    center = aExtra.xyz + gRot(aCenter - aExtra.xyz, uCrane.x);
  } else k = 1.0;
  float inten = aInfo.z * k;
  vCol = aTint * inten;
  vKind = aInfo.y;
  vec4 mvPosition;
  if (aInfo.y > 1.5) {
    // beam: quad from center along dir, widening, facing the camera around its axis
    vec3 dir = aExtra.xyz;
    vec3 a = (modelViewMatrix * vec4(center, 1.0)).xyz;
    vec3 b = (modelViewMatrix * vec4(center + dir, 1.0)).xyz;
    vec3 ax = b - a;
    vec3 side = normalize(cross(ax, normalize(a + b)));
    float t = aCorner.y * 0.5 + 0.5;
    float w = mix(aInfo.x, aExtra.w, t);
    mvPosition = vec4(mix(a, b, t) + side * aCorner.x * w, 1.0);
  } else if (aInfo.y > 0.5) {
    mvPosition = modelViewMatrix * vec4(center + vec3(aCorner.x, 0.0, aCorner.y) * aInfo.x, 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(center, 1.0);
    mvPosition.xy += aCorner * aInfo.x;
  }
  if (inten < 0.002) mvPosition = vec4(0.0, 0.0, 2.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vKind;
#include <common>
#include <fog_pars_fragment>
void main() {
  float g;
  if (vKind > 1.5) {
    float t = vUv.y * 0.5 + 0.5;
    float x = abs(vUv.x);
    g = (1.0 - smoothstep(0.0, 1.0, x)) * (1.0 - x * x) * pow(1.0 - t, 1.6) * smoothstep(0.0, 0.08, t);
  } else {
    float r = length(vUv);
    g = exp(-r * r * 4.5) * (1.0 - smoothstep(0.7, 1.0, r));
    if (vKind < 0.5) g += exp(-r * r * 36.0) * 0.7;
  }
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
