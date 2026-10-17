// The original (pre-overhaul) facade / roof shader of the buildings shell, kept verbatim for
// A/B comparisons: ?legacyfacade switches the shell material back to it (see materials.ts).
// Not maintained: new features (weathering, reflection model, far-field glow, lamp light) live in
// materials.ts only.

const LEGACY_COMMON_FRAG = /* glsl */ `
uniform float uHours;
uniform float uTime;
uniform float uRealTime;
uniform float uNight;
uniform float uDaylight;
uniform float uDusk;
uniform float uLights;
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uGround;
uniform float uDetail;
uniform vec3 uFrameCols[8];
uniform vec3 uGlassCols[8];

float bhHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float bhHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float bhNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = bhHash12(i), b = bhHash12(i + vec2(1.0, 0.0)), c = bhHash12(i + vec2(0.0, 1.0)), d = bhHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float bhBump(float h, float a, float b, float c, float d) {
  return smoothstep(a, b, h) * (1.0 - smoothstep(c, d, h));
}
// probability that a room of this profile has its light on at hour h
float bhOccupancy(float h, float prof) {
  float he = h < 12.0 ? h + 24.0 : h;
  float p = 0.0;
  if (prof < 0.5) p = 0.05 + 0.26 * bhBump(h, 5.4, 6.4, 7.6, 8.6) + 0.08 * bhBump(h, 8.5, 9.5, 16.0, 17.0) + 0.56 * bhBump(he, 16.6, 19.4, 22.4, 25.2);
  else if (prof < 1.5) p = 0.04 + 0.86 * bhBump(h, 6.6, 8.2, 17.4, 21.2) + 0.10 * bhBump(he, 18.0, 19.0, 22.6, 23.8);
  else if (prof < 2.5) p = 0.05 + 0.92 * bhBump(h, 7.0, 8.0, 21.6, 22.3) + 0.22 * bhBump(he, 21.6, 22.0, 23.8, 25.8);
  else if (prof < 3.5) p = 0.14 + 0.18 * bhBump(h, 6.0, 7.0, 9.0, 10.0) + 0.58 * bhBump(he, 17.4, 19.6, 23.4, 25.8);
  else if (prof < 4.5) p = 0.28 + 0.6 * bhBump(h, 5.5, 6.5, 18.0, 20.0);
  else if (prof < 5.5) p = 1.0;
  else if (prof < 6.5) p = 0.03 + 0.85 * bhBump(h, 7.0, 7.7, 16.0, 18.4);
  return p;
}
vec3 bhSkyRefl(vec3 R) {
  float ry = R.y;
  vec3 sky = mix(uSkyHor, uSkyZen, sqrt(clamp(ry, 0.0, 1.0)));
  vec3 gnd = mix(uSkyHor * 0.45, uGround, clamp(-ry * 3.0, 0.0, 1.0));
  return mix(gnd, sky, step(0.0, ry));
}
`;

export const LEGACY_SHELL_FRAG_PARS = /* glsl */ `
varying vec2 vFac;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec3 vWPos;
varying vec3 vWNrm;
${LEGACY_COMMON_FRAG}

// albedo multiplier for the wall surface pattern; q = (along wall, height) in metres
float bhWallPattern(float pat, vec2 q, float seed) {
  float n = bhNoise(q * 0.35 + seed * 7.0);
  float m = 0.94 + 0.08 * n;
  float res = 0.98 + 0.03 * n; // smooth metal / glass spandrel
  if (pat < 0.5) { // plaster: soft blotches
    res = m * (0.97 + 0.05 * bhNoise(q * 1.7 + 3.1));
  } else if (pat < 1.5) { // brick
    float ch = 0.26;
    float row = floor(q.y / ch);
    float fy = fract(q.y / ch);
    float bx = q.x / 0.58 + mod(row, 2.0) * 0.5;
    float bcol = floor(bx);
    float fx = fract(bx);
    float aa = clamp(fwidth(q.y / ch) * 2.2, 0.0, 1.0);
    float mortar = max(1.0 - smoothstep(0.0, 0.11, fy), 1.0 - smoothstep(0.0, 0.05, min(fx, 1.0 - fx)));
    float bn = bhHash12(vec2(bcol, row) + seed);
    float brick = (0.86 + 0.24 * bn) * mix(1.0, 1.32, mortar);
    res = m * mix(brick, 1.02, aa);
  } else if (pat < 2.5) { // corrugated metal: vertical ribs
    float aa = clamp(fwidth(q.x / 0.32) * 2.0, 0.0, 1.0);
    float rib = 0.86 + 0.16 * sin(q.x * 6.2832 / 0.32);
    float streak = 0.95 + 0.07 * bhNoise(vec2(q.x * 0.8, q.y * 0.08) + seed);
    res = mix(rib, 0.94, aa) * streak;
  } else if (pat < 3.5) { // timber siding: horizontal boards
    float bh = 0.3;
    float fy = fract(q.y / bh);
    float aa = clamp(fwidth(q.y / bh) * 2.0, 0.0, 1.0);
    float board = mix(0.72, 1.0, smoothstep(0.0, 0.18, fy)) * (0.92 + 0.12 * bhHash12(vec2(floor(q.y / bh), floor(q.x / 3.7)) + seed));
    res = m * mix(board, 0.93, aa);
  } else if (pat < 4.5) { // ashlar stone blocks
    float ch = 0.62;
    float row = floor(q.y / ch);
    float fy = fract(q.y / ch);
    float bx = q.x / 1.25 + mod(row, 2.0) * 0.5;
    float fx = fract(bx);
    float aa = clamp(fwidth(q.y / ch) * 2.5, 0.0, 1.0);
    float joint = max(1.0 - smoothstep(0.0, 0.05, fy), 1.0 - smoothstep(0.0, 0.025, min(fx, 1.0 - fx)));
    float sn = bhHash12(vec2(floor(bx), row) + seed);
    res = m * mix((0.93 + 0.1 * sn) * mix(1.0, 0.8, joint), 0.97, aa);
  } else if (pat < 5.5) { // concrete panels
    vec2 gg = q / vec2(3.0, 1.6);
    vec2 fg = fract(gg);
    float aa = clamp(fwidth(gg.y) * 3.0, 0.0, 1.0);
    float joint = max(1.0 - smoothstep(0.0, 0.03, min(fg.y, 1.0 - fg.y)), 1.0 - smoothstep(0.0, 0.016, min(fg.x, 1.0 - fg.x)));
    float pn = bhHash12(floor(gg) + seed);
    res = m * mix((0.95 + 0.07 * pn) * mix(1.0, 0.82, joint), 0.97, aa);
  }
  return res;
}

// fake room behind the window (interior mapping); returns radiance before glass
vec3 bhRoom(vec2 pm, vec2 csz, vec3 rd, float rs, float litI, vec3 lcol, float prof, float style) {
  float depth = max(3.2, csz.x * 1.5);
  vec3 ro = vec3(pm, 0.0);
  vec3 pos = step(0.0, rd);
  vec3 ard = max(abs(rd), vec3(1e-4));
  vec3 bmax = vec3(csz, depth);
  vec3 tt = (pos * bmax - ro) * (pos * 2.0 - 1.0) / ard;
  float t = min(tt.x, min(tt.y, tt.z));
  vec3 h = ro + rd * t;
  float hue = bhHash12(vec2(rs, rs * 3.7));
  vec3 wallC = prof > 0.5 && prof < 1.5 ? mix(vec3(0.55, 0.57, 0.58), vec3(0.72, 0.7, 0.66), hue)
             : mix(mix(vec3(0.78, 0.66, 0.5), vec3(0.62, 0.7, 0.66), step(0.6, hue)), vec3(0.8, 0.62, 0.6), step(0.85, hue));
  vec3 floorC = prof > 0.5 && prof < 1.5 ? vec3(0.22, 0.25, 0.3) : mix(vec3(0.42, 0.28, 0.18), vec3(0.5, 0.42, 0.34), hue);
  vec3 ceilC = vec3(0.86, 0.84, 0.8);
  vec3 c;
  float lf;
  float eps = 1e-3;
  if (tt.z <= t + eps) {
    c = wallC;
    lf = 0.8;
    // furniture / desks / shelves silhouettes on the back wall
    float fx = h.x / csz.x;
    if (style > 5.5 && style < 6.5) {
      // shop: colourful shelves of goods
      vec2 gq = vec2(floor(h.x / 0.32), floor(h.y / 0.38));
      float gn = bhHash12(gq + rs * 13.0);
      vec3 goods = 0.35 + 0.65 * vec3(bhHash12(gq + 1.3), bhHash12(gq + 2.7), bhHash12(gq + 4.1));
      c = mix(c, goods, step(0.35, gn) * step(h.y, csz.y * 0.75) * step(0.25, h.y));
    } else {
      float furn = step(h.y, 0.95) * step(0.12, bhHash12(vec2(floor(fx * 3.0), rs)));
      c *= mix(1.0, 0.45, furn);
      // a picture frame / lamp shape
      float pic = step(abs(fx - 0.5 - (hue - 0.5) * 0.4), 0.13) * step(abs(h.y - 1.75), 0.32);
      c = mix(c, vec3(0.28, 0.32, 0.4) + hue * 0.4, pic * 0.8);
    }
  } else if (tt.y <= t + eps) {
    if (rd.y < 0.0) { c = floorC; lf = 0.5; }
    else { c = ceilC; lf = 1.05; }
  } else {
    c = wallC * 0.86;
    lf = 0.62;
  }
  float dz = clamp(h.z / depth, 0.0, 1.0);
  vec3 amb = c * (0.035 + 0.2 * uDaylight) * (1.0 - 0.55 * dz);
  // ceiling lamp falloff
  vec3 lamp = c * lcol * lf * (1.0 - 0.4 * dz);
  return amb + lamp * litI;
}

void bhWall(inout vec3 albedo, inout float rough, inout vec3 emit, vec3 N, vec3 V) {
  float kind = vB.w;
  float style = floor(mod(kind, 64.0) / 8.0 + 0.01);
  float prof = floor(mod(kind, 8.0) + 0.01);
  float seed = vB.z;
  vec2 csz = vC.xy;
  float pat = vC.z;
  float packCol = vC.w + 0.01;
  int frameIdx = int(mod(packCol, 8.0));
  int glassIdx = int(mod(floor(packCol / 8.0), 8.0));
  vec3 T = vec3(N.z, 0.0, -N.x);
  float tl = length(T);
  T = tl > 1e-3 ? T / tl : vec3(1.0, 0.0, 0.0);
  vec2 q = vec2(dot(vWPos, T), vWPos.y);
  albedo *= bhWallPattern(pat, q, seed);
  // grime near the ground, slightly lighter towards the top
  albedo *= mix(0.78, 1.0, smoothstep(0.0, 1.1, vWPos.y)) * (0.97 + 0.03 * smoothstep(0.0, 40.0, vWPos.y));

  vec2 cell = floor(vFac);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= vB.x || cell.y >= vB.y) return;
  vec2 f = vFac - cell;
  vec2 pm = f * csz;
  vec4 wr = vA;
  bool curtain = style > 1.5 && style < 2.5;
  vec2 wc = vec2(wr.x + wr.y, wr.z + wr.w) * 0.5;
  vec2 wh = vec2(wr.y - wr.x, wr.w - wr.z) * 0.5;
  vec2 d = abs(pm - wc) - wh;
  float edge = -max(d.x, d.y);
  if (style > 4.5 && style < 5.5) {
    float r = wh.x;
    float yc = wr.w - r;
    if (pm.y > yc) edge = min(pm.x - wr.x, min(wr.y - pm.x, r - length(vec2(pm.x - wc.x, pm.y - yc))));
  }
  if (curtain) edge = 1.0; // the whole cell is glazing (vision + spandrel glass)
  // level of detail: cells smaller than a few pixels fade to an average look
  float px = max(fwidth(vFac.x), fwidth(vFac.y));
  float detail = (1.0 - smoothstep(0.3, 0.75, px)) * uDetail;
  float winFrac = curtain ? 1.0 : clamp((4.0 * wh.x * wh.y) / max(csz.x * csz.y, 1e-3), 0.0, 1.0);
  // close-up wall pixel: nothing below changes it (only the far 'average window' fold-in does) → skip the rest
  if (edge < 0.0 && detail >= 0.999) return;

  // per-room random values
  float r1 = bhHash13(vec3(cell, seed));
  float r2 = bhHash13(vec3(cell.yx + 17.0, seed * 1.37 + 5.0));
  float r3 = bhHash13(vec3(cell + 3.1, seed * 0.71 + 9.0));
  // office floors switch in groups
  vec2 unit = cell;
  if (prof > 0.5 && prof < 1.5) unit = vec2(floor(cell.x / 4.0), cell.y);
  float u1 = bhHash13(vec3(unit, seed + 2.0));
  float u2 = bhHash13(vec3(unit.yx + 7.0, seed + 4.0));
  float hr = mod(uHours + (u2 - 0.5) * 1.6 + 24.0, 24.0);
  float occ = bhOccupancy(hr, prof);
  float lit = step(u1, occ);
  if (prof > 0.5 && prof < 1.5) lit *= step(r3, 0.9);
  // light colour
  vec3 lcol = vec3(1.0, 0.5, 0.17);
  if (r2 > 0.72) lcol = vec3(1.0, 0.62, 0.28);
  if (r2 < 0.12) lcol = vec3(1.0, 0.42, 0.12);
  if (prof > 0.5 && prof < 1.5) lcol = mix(vec3(0.62, 0.74, 0.95), vec3(1.0, 0.8, 0.5), r2);
  if (prof > 1.5 && prof < 2.5) lcol = vec3(1.0, 0.66, 0.32);
  if (prof > 2.5 && prof < 3.5) lcol = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.7, 0.4), r2);
  if (prof < 0.5 && r3 < 0.1) {
    float hh = mod(uHours + 24.0, 24.0);
    float tvOn = bhBump(hh < 12.0 ? hh + 24.0 : hh, 18.5, 19.0, 23.6, 24.4);
    float fl = 0.55 + 0.45 * sin(uTime * 7.3 + r1 * 40.0) * sin(uTime * 2.9 + r2 * 17.0);
    lcol = mix(lcol, vec3(0.35, 0.55, 1.0) * (0.6 + 0.7 * fl), tvOn);
  }
  float nightF = clamp(uLights * (0.42 + 0.58 * uNight), 0.0, 1.0);
  float glowI = mix(0.07, 2.0, nightF) * (0.75 + 0.5 * r2);
  if (prof > 1.5 && prof < 2.5) glowI *= 1.25;
  if (prof > 4.5 && prof < 5.5) glowI *= 1.1;

  // reflection (stylised: glass mostly mirrors the sky, with soft cloud streaks)
  vec3 gt = uGlassCols[glassIdx];
  vec3 R = reflect(V, N);
  vec3 Rs = normalize(vec3(R.x, mix(R.y, abs(R.y), 0.7) + 0.1, R.z));
  float cloud = bhNoise(vec2(q.x * 0.035 + R.x * 1.7 + R.z * 1.3, q.y * 0.022 + Rs.y * 2.0) + seed * 0.01);
  vec3 refl = bhSkyRefl(Rs) * mix(0.72, 1.18, cloud) * gt * 1.25;
  float cosv = clamp(-dot(V, N), 0.0, 1.0);
  float baseF = curtain ? 0.42 : (style > 2.5 && style < 3.5 ? 0.3 : 0.14);
  float F = clamp((baseF + (1.0 - baseF) * pow(1.0 - cosv, 5.0)) * (0.85 + 0.3 * r1), 0.0, 1.0);
  float avgLit = bhOccupancy(mod(uHours + 24.0, 24.0), prof);
  vec3 avgGlass = refl * F + gt * 0.05 * (0.25 + uDaylight) + avgLit * glowI * vec3(1.0, 0.55, 0.22) * 0.42 * (curtain ? 0.75 : 1.0);

  if (edge < 0.0) {
    // wall pixel - but far away fold in the average window look
    if (detail < 0.999) {
      albedo = mix(mix(albedo, vec3(0.03), winFrac * 0.85), albedo, detail);
      emit += (1.0 - detail) * winFrac * avgGlass;
    }
    return;
  }
  if (detail <= 0.0) {
    // window far too small to resolve: exactly the faded result below (glass = avgGlass, frame = 0) without the interior
    albedo = vec3(0.02, 0.025, 0.03);
    rough = 0.14;
    emit += avgGlass;
    return;
  }

  // inside the window opening
  float fw = style > 2.5 && style < 3.5 ? 0.045 : 0.075;
  float frame = 1.0 - smoothstep(fw * 0.7, fw, edge);
  float spandrel = 0.0;
  if (curtain) {
    float ex = min(pm.x, csz.x - pm.x);
    float ey = min(pm.y, csz.y - pm.y);
    float mull = max(1.0 - smoothstep(0.03, 0.045, ex), 1.0 - smoothstep(0.035, 0.055, ey));
    float tr = 1.0 - smoothstep(0.018, 0.03, abs(pm.y - wr.z));
    frame = max(mull, tr * detail);
    spandrel = step(pm.y, wr.z);
  } else if (style > 0.5 && style < 1.5 || style > 4.5 && style < 5.5) {
    float mv = 1.0 - smoothstep(0.022, 0.034, abs(pm.x - wc.x));
    float mh = 1.0 - smoothstep(0.022, 0.034, abs(pm.y - (wr.z + (wr.w - wr.z) * 0.62)));
    frame = max(frame, max(mv, mh) * detail);
  } else if (style > 3.5 && style < 4.5) {
    vec2 gq = (pm - wr.xz) / vec2(0.62, 0.5);
    vec2 gf = abs(fract(gq) - 0.5);
    float bars = 1.0 - smoothstep(0.43, 0.46, gf.x);
    float barsH = 1.0 - smoothstep(0.42, 0.46, gf.y);
    frame = max(frame, (1.0 - bars * barsH) * detail);
  } else if (style > 5.5 && style < 6.5) {
    float kick = 1.0 - step(0.42, pm.y - wr.z);
    float transom = 1.0 - smoothstep(0.03, 0.045, abs(pm.y - (wr.w - 0.55)));
    float mull = 1.0 - smoothstep(0.03, 0.045, abs(fract((pm.x - wr.x) / 1.9 + 0.5) - 0.5) * 1.9);
    frame = max(frame, max(kick, max(transom, mull * step(2.6, wr.y - wr.x))));
  } else if (style > 6.5) {
    float mv = 1.0 - smoothstep(0.03, 0.045, abs(pm.x - wc.x));
    frame = max(frame, mv);
  }
  vec3 fcol = uFrameCols[frameIdx];
  if (curtain || (style > 2.5 && style < 3.5)) fcol = albedo * 0.85;

  // glass: interior seen through the pane
  vec3 rd = vec3(dot(V, T), V.y, -dot(V, N));
  rd.z = max(rd.z, 0.04);
  float litI = lit * glowI;
  vec3 interior;
  if (uDetail > 0.5) interior = bhRoom(pm, csz, normalize(rd), r1 * 31.0 + seed, litI, lcol, prof, style);
  else interior = mix(vec3(0.05, 0.06, 0.07) * (0.3 + uDaylight), lcol * 0.8, litI);
  // curtains / blinds
  float wx = (pm.x - wr.x) / max(wr.y - wr.x, 1e-3);
  float wy = (pm.y - wr.z) / max(wr.w - wr.z, 1e-3);
  if ((prof < 0.5 || prof > 2.5 && prof < 3.5) && r3 > 0.45) {
    float cov = r3 > 0.85 ? 0.5 : 0.24;
    float side = step(wx, cov) + step(1.0 - cov, wx);
    float folds = 0.85 + 0.15 * sin(wx * 60.0);
    vec3 cc = mix(vec3(0.85, 0.78, 0.66), vec3(0.75, 0.42, 0.38), step(0.7, r2)) * folds;
    vec3 curtainC = cc * (0.06 + 0.22 * uDaylight) + cc * lcol * litI * 0.75;
    interior = mix(interior, curtainC, clamp(side, 0.0, 1.0));
  } else if (prof > 0.5 && prof < 1.5 && r2 < 0.42) {
    float blindTo = 1.0 - (0.25 + 0.6 * r1);
    float slat = 0.75 + 0.25 * step(0.5, fract(pm.y * 9.0));
    vec3 bc = vec3(0.78, 0.78, 0.74) * slat;
    vec3 blind = bc * (0.08 + 0.3 * uDaylight) + bc * lcol * litI * 0.6;
    interior = mix(interior, blind, step(blindTo, wy));
  }
  // recess shadow under the lintel and beside the jambs
  float recess = curtain ? 1.0 : smoothstep(0.0, 0.22, wr.w - pm.y) * mix(0.75, 1.0, smoothstep(0.0, 0.12, min(pm.x - wr.x, wr.y - pm.x)));
  interior *= mix(0.45, 1.0, recess);
  // spandrel glass: opaque, slightly darker backing
  interior = mix(interior, gt * 0.04 * (0.3 + uDaylight), spandrel);
  float Fs = mix(F, min(1.0, F * 1.15 + 0.08), spandrel);
  vec3 glass = interior * (1.0 - Fs) * mix(vec3(1.0), gt, curtain ? 0.6 : 0.35) + refl * Fs * mix(0.65, 1.0, recess);
  if (detail < 0.999) {
    glass = mix(avgGlass, glass, detail);
    frame *= detail;
  }
  albedo = mix(vec3(0.02, 0.025, 0.03), fcol, frame);
  rough = mix(0.14, 0.7, frame);
  emit += glass * (1.0 - frame);
}

void bhRoof(inout vec3 albedo, inout float rough, inout vec3 emit, vec3 N, vec3 V) {
  float pat = vA.x;
  float seed = vA.y;
  vec2 p = vFac;
  if (pat < 0.5) { // flat roof membrane / gravel
    float n = bhNoise(p * 0.9 + seed);
    float g = bhHash12(floor(p * 6.0) + seed);
    float aa = clamp(fwidth(p.x * 6.0), 0.0, 1.0);
    albedo *= (0.9 + 0.12 * n) * mix(0.93 + 0.1 * g, 0.98, aa);
    rough = 0.96;
    return;
  }
  if (pat < 1.5 || (pat > 1.5 && pat < 2.5)) { // clay tiles / slate
    bool slate = pat > 1.5;
    float course = slate ? 0.3 : 0.4;
    float tw = slate ? 0.46 : 0.32;
    float row = floor(p.y / course);
    float fy = fract(p.y / course);
    float bx = p.x / tw + mod(row, 2.0) * 0.5;
    float col = floor(bx);
    float fx = fract(bx);
    float aa = clamp(fwidth(p.y / course) * 1.8, 0.0, 1.0);
    float tn = bhHash12(vec2(col, row) + seed);
    float shade = mix(1.0, 0.62, smoothstep(0.62, 1.0, fy));
    float lip = 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.1, fy));
    float curve = slate ? 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.06, min(fx, 1.0 - fx))) : 0.8 + 0.22 * sin(fx * 3.14159);
    float v = shade * lip * curve * ((slate ? 0.84 : 0.86) + (slate ? 0.3 : 0.26) * tn);
    float weather = 0.92 + 0.12 * bhNoise(p * 0.5 + seed * 3.0);
    albedo *= mix(v, 0.9, aa) * weather;
    rough = slate ? 0.7 : 0.88;
    return;
  }
  if (pat < 3.5) { // standing seam metal
    float s = fract(p.x / 0.6);
    float aa = clamp(fwidth(p.x / 0.6) * 2.0, 0.0, 1.0);
    float seam = 1.0 - smoothstep(0.0, 0.07, min(s, 1.0 - s));
    albedo *= mix(0.95 + 0.25 * seam, 1.0, aa) * (0.95 + 0.07 * bhNoise(p * vec2(0.3, 0.05) + seed));
    rough = 0.5;
    return;
  }
  if (pat < 4.5) { // corrugated sheet
    float aa = clamp(fwidth(p.x / 0.26) * 2.0, 0.0, 1.0);
    albedo *= mix(0.86 + 0.16 * sin(p.x * 6.2832 / 0.26), 0.94, aa) * (0.93 + 0.1 * bhNoise(p * vec2(0.4, 0.1) + seed));
    rough = 0.6;
    return;
  }
  if (pat < 5.5) { // copper patina
    float n = bhNoise(p * vec2(1.4, 0.35) + seed);
    float s = fract(p.x / 0.55);
    float aa = clamp(fwidth(p.x / 0.55) * 2.0, 0.0, 1.0);
    float seam = 1.0 - smoothstep(0.0, 0.08, min(s, 1.0 - s));
    albedo *= (0.85 + 0.3 * n) * mix(1.0 + 0.2 * seam, 1.0, aa);
    rough = 0.65;
    return;
  }
  if (pat < 6.5) { // skylight glazing
    vec2 g = p / vec2(1.2, 0.9);
    vec2 gf = abs(fract(g) - 0.5);
    float aa = clamp(fwidth(g.x) * 2.0, 0.0, 1.0);
    float bar = mix(max(1.0 - smoothstep(0.42, 0.46, gf.x * 1.0) * (1.0 - smoothstep(0.4, 0.46, gf.y)), 0.0), 0.25, aa);
    vec3 R = reflect(V, N);
    float cosv = clamp(-dot(V, N), 0.0, 1.0);
    float F = 0.2 + 0.8 * pow(1.0 - cosv, 5.0);
    float nightF = clamp(uLights * (0.42 + 0.58 * uNight), 0.0, 1.0);
    float occ = bhOccupancy(mod(uHours + 24.0, 24.0), 4.0);
    float litc = step(bhHash12(floor(g * vec2(0.34, 1.0)) + seed), occ);
    vec3 inside = vec3(0.06, 0.07, 0.075) * (0.4 + uDaylight) + litc * vec3(1.0, 0.82, 0.6) * mix(0.05, 1.5, nightF);
    vec3 gl = inside * (1.0 - F) + bhSkyRefl(R) * vec3(0.7, 0.82, 0.9) * F;
    albedo = mix(vec3(0.03), albedo * 0.7, bar);
    rough = mix(0.15, 0.6, bar);
    emit += gl * (1.0 - bar);
    return;
  }
  // deck / painted concrete (helipads, terraces)
  albedo *= 0.94 + 0.08 * bhNoise(p * 0.7 + seed);
  rough = 0.9;
}
`;

export const LEGACY_SHELL_FRAG_MAIN = /* glsl */ `
float bhRough = -1.0;
vec3 bhEmit = vec3(0.0);
{
  vec3 bN = normalize(vWNrm);
  vec3 bV = normalize(vWPos - cameraPosition);
  vec3 alb = diffuseColor.rgb;
  float rgh = -1.0;
  if (vB.w < 63.5) bhWall(alb, rgh, bhEmit, bN, bV);
  else bhRoof(alb, rgh, bhEmit, bN, bV);
  diffuseColor.rgb = alb;
  bhRough = rgh;
}
`;

