// Ground-surface shaders v2 (audit item 7: detail must survive viewing distance).
//
// Asphalt: macro resurfacing patchwork along every street segment (fresh dark / worn grey sections,
// one-lane resurfacing, separately surfaced junction boxes) with sealed seams, sealed cracks on worn
// sections (longitudinal, transverse, crack network near the kerb), utility trench cuts and patch
// repairs, wheel-track polish, oil drips in the lane centres (heavy where cars queue at the stop
// lines), dusty / damp gutter band; car parks with oil spots; the schoolyard's painted multi-sport court.
//
// Hardscape: the parametric tile pattern (+ herringbone bond) with per-cover band layouts (border
// band, inner line, band grid aligned to the plaza / block rectangle, macro tint per band cell),
// linear drains, large-scale weathering; quay specials (rust halos at the bollards, oil, tyre
// streaks) and yard specials (oil blobs, tyre streaks).
//
// Everything thin is box-filtered with fwidth (rdLine) so lines fade into their mean tone with
// distance; macro tones (10-25 %) are not faded — that is what keeps the ground readable from afar.

import { CORRIDOR_HALF, XS, ZS } from '../../core/constants';

const XS0 = XS[0].toFixed(1),
  ZS0 = ZS[0].toFixed(1),
  P = (XS[1] - XS[0]).toFixed(1),
  PH = ((XS[1] - XS[0]) / 2).toFixed(1);
// junction surface patch reaches just behind the stop line
const JBOX = (CORRIDOR_HALF + 1.4).toFixed(2);

/** shared by v2 asphalt + hardscape (needs COMMON from materials.ts) */
export const COMMON2 = /* glsl */ `
uniform sampler2D tRC;
// Voronoi crack network: cell borders as box-filtered lines, fading to their mean coverage with distance
float rdCrackNet(vec2 p, float cell, float w, float fw) {
  vec4 v = texture2D(tRC, p / (cell * 8.0));
  float d = v.r * 0.5 * cell;
  float det = 1.0 - smoothstep(0.12, 0.45, fw / cell);
  return mix(clamp(2.0 * w / cell, 0.0, 1.0), rdLine(d, w, fw), det);
}
`;

export const ASPHALT2 = /* glsl */ `
uniform vec3 uAsph;
uniform vec4 uCourt;
uniform vec3 uCourtA;
uniform vec3 uCourtB;
uniform vec3 uCourtC;
vec3 rdAsphalt(inout float rough) {
  vec2 p = vWP.xz;
  vec2 fwP = fwidth(p);
  float fw = max(fwP.x, fwP.y) + 1e-5;
  vec4 nL = texture2D(tRN, p * 0.015625);
  vec4 nM = texture2D(tRN, p * 0.0625);
  vec4 nS = texture2D(tRN, p * 0.5);
  vec3 c = uAsph;
  float kind = vA.y;
  if (kind > 1.5) c = mix(c, vec3(0.105, 0.072, 0.066), 0.55);   // schoolyard: warm red-brown tarmac
  else if (kind > 0.5) c *= 1.08;                                 // car parks: older, sun-bleached
  // ── macro: resurfacing sections
  float age = 0.5;
  float seam = 0.0;
  float lat = 9.0, dj = 99.0, onRoad = 0.0, t = 0.0, al = 0.0;
  vec2 sg = vec2(0.0);
  if (vA.x > 0.5) {
    float lx = mod(p.x - (${XS0}) + ${PH}, ${P}) - ${PH};
    float lz = mod(p.y - (${ZS0}) + ${PH}, ${P}) - ${PH};
    bool ns = abs(lx) < abs(lz);
    lat = ns ? lx : lz;
    dj = abs(ns ? lz : lx);
    float sid = ns ? floor((p.x - (${XS0})) / ${P} + 0.5) : 20.0 + floor((p.y - (${ZS0})) / ${P} + 0.5);
    float a0 = ns ? ${ZS0} : ${XS0};
    al = ns ? p.y : p.x;
    float seg = floor((al - a0) / ${P});
    t = al - a0 - seg * ${P};
    sg = vec2(sid, seg);
    onRoad = 1.0 - smoothstep(3.25, 3.55, abs(lat));
    float cut = 13.0 + 29.0 * rdHash(sg + 0.37);
    float sec = step(cut, t);
    float oneLane = step(rdHash(sg + 5.1), 0.3);
    float side = step(0.0, lat);
    age = rdHash(vec2(sid * 3.7 + sec + oneLane * side * 7.0, seg * 1.9 + 11.0));
    float jb = ${JBOX};
    if (dj < jb) age = rdHash(floor((p - vec2(${XS0}, ${ZS0})) / ${P} + 0.5) + 1.7) * 0.8;
    seam = max(seam, rdLine(abs(t - cut), 0.05, fw) * step(jb, dj) * onRoad);
    seam = max(seam, rdLine(abs(dj - jb), 0.05, fw) * onRoad * step(abs(lat), 3.4));
    seam = max(seam, rdLine(abs(lat), 0.05, fw) * oneLane * step(jb, dj));
  } else {
    age = clamp(0.35 + 0.9 * (nL.g - 0.5) + 0.35 * (rdHash(floor(p / vec2(13.0, 9.0)) + 3.3) - 0.5), 0.0, 1.0);
  }
  float ag = smoothstep(0.0, 1.0, age);
  c *= mix(vec3(0.76, 0.78, 0.85), vec3(1.2, 1.18, 1.11), ag);
  c *= 0.9 + 0.12 * nL.r + 0.06 * nL.b;
  float spk = nS.a * 0.6 + nS.b * 0.4;
  c *= 1.0 + (spk - 0.5) * mix(0.1, 0.26, ag);
  c += vec3(0.024, 0.023, 0.021) * smoothstep(0.78, 0.95, nS.a) * ag * (1.0 - smoothstep(0.1, 0.35, fw / 0.06));
  rough = mix(0.8, 0.95, ag);
  if (vA.x > 0.5) {
    float alat = abs(lat);
    float fadeJ = smoothstep(6.0, 13.0, dj);
    float trk = max(1.0 - smoothstep(0.12, 0.45, abs(alat - 0.95)), 1.0 - smoothstep(0.12, 0.45, abs(alat - 2.55)));
    trk *= fadeJ * onRoad * (0.7 + 0.6 * nM.g);
    c *= 1.0 - 0.12 * trk * (0.45 + 0.55 * ag);
    rough -= 0.16 * trk;
    float lane = 1.0 - smoothstep(0.1, 0.55, abs(alat - 1.75));
    float queue = smoothstep(7.6, 8.8, dj) * (1.0 - smoothstep(13.0, 27.0, dj));
    c *= 1.0 - lane * onRoad * smoothstep(7.6, 9.0, dj) * (0.05 + 0.1 * queue);
    float oil = lane * onRoad * queue * smoothstep(0.45, 0.75, nM.a * 0.55 + nS.r * 0.45);
    c *= 1.0 - 0.4 * oil;
    rough -= 0.35 * oil;
    // gutter: dusty band along the kerb, darker damp line right at it
    c = mix(c, c * 1.16 + vec3(0.008), smoothstep(2.85, 3.35, alat) * onRoad * 0.6);
    c *= 1.0 - 0.2 * smoothstep(3.3, 3.48, alat) * onRoad;
    // sealed cracks on worn sections
    float worn = smoothstep(0.55, 0.8, age) * onRoad * step(${JBOX}, dj);
    if (worn > 0.001) {
      float h2 = rdHash(sg + 2.3);
      float wig = 0.14 * sin(al * 0.37 + h2 * 6.0) + 0.1 * (nM.r - 0.5);
      float off = h2 < 0.5 ? 0.38 : -0.38;
      float lon = rdLine(abs(lat - off - wig), 0.06 + 0.04 * nS.g, fw) * step(0.32, nM.b);
      float tsp = 6.5 + 4.0 * h2;
      float kk = floor((al + h2 * 17.0) / tsp);
      float hk = rdHash(vec2(kk, sg.x + 0.5));
      float tr = (fract((al + h2 * 17.0) / tsp) - 0.5) * tsp + 0.22 * sin(lat * 1.7 + hk * 9.0) + 0.12 * (nS.b - 0.5);
      float span = 1.0 - smoothstep(0.9 + 2.6 * fract(hk * 7.3), 1.2 + 2.6 * fract(hk * 7.3), abs(lat - (hk - 0.5) * 3.0));
      float trans = rdLine(abs(tr), 0.055, fw) * span * step(0.25, hk);
      float net = rdCrackNet(p + sg * 13.0, 2.6, 0.035, fw) * smoothstep(1.9, 3.1, alat) * smoothstep(0.45, 0.6, nL.a);
      float crack = max(max(lon, trans), net) * worn;
      c *= 1.0 - 0.55 * crack;
      rough -= 0.25 * crack;
    }
    c *= 1.0 - 0.5 * seam;
    rough -= 0.2 * seam;
    // utility trench cut across one lane
    float tc = rdHash(sg + 8.8);
    if (tc < 0.45) {
      float tpos = 10.0 + 35.0 * fract(tc * 13.7);
      float tw = 0.7 + 0.6 * fract(tc * 7.1);
      float dt = abs(t - tpos);
      float sideSel = fract(tc * 3.3) < 0.5 ? step(0.0, lat) : step(lat, 0.0);
      float inT = (1.0 - smoothstep(tw * 0.5 - fw, tw * 0.5 + fw, dt)) * sideSel * onRoad;
      c = mix(c, c * 0.74, inT);
      c *= 1.0 - 0.45 * rdLine(abs(dt - tw * 0.5), 0.04, fw) * sideSel * onRoad;
      rough -= 0.08 * inT;
    }
  }
  // patch repairs in a world-aligned cell grid
  vec2 cs = vec2(9.0, 6.5);
  vec2 pc = floor(p / cs);
  float h = rdHash(pc);
  if (h < 0.12) {
    vec2 f = p - pc * cs;
    vec2 lo = vec2(0.6 + 3.0 * rdHash(pc + 3.1), 0.5 + 2.0 * rdHash(pc + 5.7));
    vec2 hi = lo + vec2(1.6 + 3.2 * rdHash(pc + 1.3), 1.2 + 2.4 * rdHash(pc + 7.9));
    vec2 inLo = smoothstep(lo - fwP, lo + fwP, f), inHi = 1.0 - smoothstep(hi - fwP, hi + fwP, f);
    float inside = inLo.x * inLo.y * inHi.x * inHi.y;
    vec2 de = min(abs(f - lo), abs(f - hi));
    float ps = max(rdLine(de.x, 0.05, fwP.x) * step(lo.y, f.y) * step(f.y, hi.y), rdLine(de.y, 0.05, fwP.y) * step(lo.x, f.x) * step(f.x, hi.x));
    c = mix(c, c * (h < 0.06 ? 0.74 : 1.16), inside);
    c *= 1.0 - 0.45 * ps;
    rough -= 0.06 * inside;
  }
  // car parks: oil spots where cars stand
  if (kind > 0.5 && kind < 1.5) {
    vec4 v = texture2D(tRC, p / 20.0);
    float spot = (1.0 - smoothstep(0.07, 0.17, v.b)) * step(0.5, v.g);
    c *= 1.0 - 0.32 * spot * (0.6 + 0.4 * nS.r);
    rough -= 0.2 * spot;
  }
  // schoolyard: painted multi-sport court (blue playing area, green run-off, terracotta keys + centre circle)
  if (kind > 1.5 && uCourt.z > uCourt.x) {
    vec2 lo = p - uCourt.xy, hi = uCourt.zw - p;
    float inR = smoothstep(-fw, fw, min(min(lo.x, hi.x), min(lo.y, hi.y)) - 0.15);
    vec2 cc = (uCourt.xy + uCourt.zw) * 0.5;
    vec2 hs = vec2(min(11.0, (uCourt.z - uCourt.x) * 0.5 - 0.5), min(6.5, (uCourt.w - uCourt.y) * 0.5 - 0.5));
    vec2 d = abs(p - cc);
    float inC = smoothstep(-fw, fw, min(hs.x - d.x, hs.y - d.y));
    float key = smoothstep(-fw, fw, min(d.x - (hs.x - 5.2), 2.2 - d.y)) * inC;
    float keyArc = (1.0 - smoothstep(1.8 - fw, 1.8 + fw, length(vec2(d.x - (hs.x - 5.2), d.y)))) * step(d.x, hs.x - 5.2) * inC;
    float circ = 1.0 - smoothstep(1.8 - fw, 1.8 + fw, length(p - cc));
    vec3 paint = mix(uCourtB, uCourtA, inC);
    paint = mix(paint, uCourtC, max(max(key, keyArc), circ));
    paint *= 0.94 + 0.1 * nS.r;
    float scuff = smoothstep(0.62, 0.8, nM.g * 0.6 + nS.a * 0.4) * 0.25;
    c = mix(c, mix(paint, c * 1.3, scuff), inR);
    rough = mix(rough, 0.7, inR);
  }
  float puddle = smoothstep(0.64, 0.72, nL.g * 0.6 + nM.r * 0.4) * uRain;
  c *= mix(1.0, 0.58, uRain) * (1.0 - 0.18 * puddle);
  rough = mix(rough, 0.22, clamp(uRain * 0.75 + puddle * 0.5, 0.0, 1.0));
  return c;
}
`;

export const HARD2 = /* glsl */ `
uniform vec4 uRad[3];
uniform vec3 uTactile;
uniform vec3 uBandCol;
// herringbone of 2u x u bricks (q in units of u): edge distance in units, writes a cell id
float rdHerring(vec2 q, out vec2 cell) {
  float b0 = floor((q.y - q.x + 2.0) * 0.25);
  float e = -1.0;
  cell = vec2(0.0);
  for (int k = -1; k <= 1; k++) {
    float b = b0 + float(k);
    vec2 r = vec2(q.x + 2.0 * b, q.y - 2.0 * b);
    float n = floor(r.y);
    float hx = r.x - n;
    if (e < 0.0 && hx >= 0.0 && hx < 2.0) {
      e = min(min(hx, 2.0 - hx), min(r.y - n, n + 1.0 - r.y));
      cell = vec2(n, b);
    }
    float m = floor(r.x);
    float vy = r.y - m - 1.0;
    if (e < 0.0 && vy >= 0.0 && vy < 2.0) {
      e = min(min(r.x - m, m + 1.0 - r.x), min(vy, 2.0 - vy));
      cell = vec2(m + 0.5, b + 0.5);
    }
  }
  return max(e, 0.0);
}
vec3 rdHard(inout float rough) {
  vec2 p = vWP.xz;
  vec2 fwp = fwidth(p);
  float fwm = max(fwp.x, fwp.y) + 1e-5;
  float fwu = fwidth(vS.y) + 1e-5;
  float fwd = fwidth(vS.x) + 1e-5;
  vec4 nL = texture2D(tRN, p * 0.015625);
  vec4 nM = texture2D(tRN, p * 0.0625);
  vec4 nS = texture2D(tRN, p * 0.5);
  float frame = vS.w;
  vec2 q = frame < 0.5 ? p : (frame < 1.5 ? p.yx : vec2(vS.y, 0.5));
  vec2 fq = frame < 0.5 ? fwp : (frame < 1.5 ? fwp.yx : vec2(fwu, 1e-4));
  vec2 size = vP.xy;
  float minS = min(size.x, size.y);
  vec2 cell;
  float joint, edge;
  if (vV.z < -1.5) {
    // herringbone (size.y = brick width)
    float u = size.y;
    float e = rdHerring(q / u, cell) * u;
    joint = rdLine(e, vP.z, fwm);
    edge = e;
  } else {
    float row = floor(q.y / size.y);
    float off = vV.z >= 0.0 ? mod(row, 2.0) * vV.z : rdHash(vec2(row, 3.7));
    float qx = q.x / size.x + off;
    cell = vec2(floor(qx), row);
    float dx = abs(fract(qx + 0.5) - 0.5) * size.x;
    float dy = abs(fract(q.y / size.y + 0.5) - 0.5) * size.y;
    joint = max(rdLine(dx, vP.z, fq.x), rdLine(dy, vP.z, fq.y));
    edge = min(dx, dy);
  }
  float det = 1.0 - smoothstep(0.1, 0.35, fwm / minS);
  vec3 c = vC * (1.0 + (rdHash(cell) - 0.5) * vV.x * det);
  c *= 1.0 - vV.y * det * (1.0 - smoothstep(0.0, minS * 0.32, edge));
  c *= 1.0 - vP.w * joint;
  // bands: border band + inner line + band grid aligned to the cover rectangle, macro tint per band cell
  float band = 0.0;
  vec2 bcell = floor(p / 4.5);
  if (vR.z > vR.x) {
    vec2 lo = p - vR.xy, hi = vR.zw - p;
    float dEdge = min(min(lo.x, hi.x), min(lo.y, hi.y));
    if (vB.z > 0.0) {
      band = 1.0 - smoothstep(vB.z - fwm, vB.z + fwm, dEdge);
      band = max(band, 0.75 * rdLine(abs(dEdge - vB.z - 0.32), 0.12, fwm));
    }
    if (vB.x > 0.0) {
      vec2 g = (p - (vR.xy + vR.zw) * 0.5) / vB.x + 0.5;
      vec2 gd = abs(fract(g) - 0.5) * vB.x;
      band = max(band, max(rdLine(gd.x, vB.y, fwp.x), rdLine(gd.y, vB.y, fwp.y)) * step(vB.z + 0.5, dEdge));
      bcell = floor(g) + floor(vR.xy);
    }
    // linear drain along the inner edge of the border on the long sides
    if (vB.z > 0.0 && vB.x > 0.0) {
      bool wide = vR.z - vR.x > vR.w - vR.y;
      float dl = wide ? min(lo.y, hi.y) : min(lo.x, hi.x);
      float drain = rdLine(abs(dl - vB.z - 0.95), 0.14, fwm) * step(vB.z + 0.6, wide ? min(lo.x, hi.x) : min(lo.y, hi.y));
      float slots = mix(0.75, step(0.5, fract((wide ? p.x : p.y) / 0.08)), 1.0 - smoothstep(0.004, 0.02, fwm));
      c = mix(c, vec3(0.05, 0.05, 0.055) * (0.6 + 0.6 * slots), drain * 0.9);
    }
  }
  float macro = vB.w > 0.0 ? vB.w : 0.035;
  c *= 1.0 + (rdHash(bcell + 0.71) - 0.5) * 2.0 * macro;
  vec3 bandC = uBandCol * (0.92 + 0.16 * nS.g) * (1.0 + (rdHash(cell * 1.7) - 0.5) * 0.1 * det);
  c = mix(c, bandC, band * 0.85);
  // grain, mottling, stains, large-scale weathering
  c *= 1.0 + vV.w * (nS.a * 0.6 + nS.g * 0.4 - 0.5) * 1.6;
  c *= 0.93 + 0.1 * nM.b;
  c *= 0.95 + 0.08 * nL.r;
  c *= 1.0 - vX.x * smoothstep(0.58, 0.82, nM.a * 0.65 + nS.r * 0.35);
  // stripes along q.y (pitch mowing / furrows / ripples)
  float tS = fract(q.y / max(vX.y, 1e-3));
  float st = vX.z > 0.0 ? smoothstep(0.5 - fq.y / max(vX.y, 1e-3), 0.5 + fq.y / max(vX.y, 1e-3), tS) : abs(tS - 0.5) * 2.0;
  c *= 1.0 + step(1e-3, vX.y) * abs(vX.z) * (st - 0.5);
  rough = vX.w;
  float sp = vS.z;
  if (sp > 0.5 && sp < 1.5) {
    // tactile paving beside the crosswalks (vS.x = distance from curb, vS.y = along the arm)
    float a = vS.y, dC = vS.x;
    float tw = smoothstep(4.35 - fwu, 4.35 + fwu, a) * (1.0 - smoothstep(5.95 - fwu, 5.95 + fwu, a))
             * smoothstep(0.26 - fwd, 0.26 + fwd, dC) * (1.0 - smoothstep(0.92 - fwd, 0.92 + fwd, dC));
    vec2 dq = abs(fract(p / 0.12) - 0.5);
    float dots = (1.0 - smoothstep(0.18, 0.3, length(dq))) * (1.0 - smoothstep(0.1, 0.35, fwm / 0.12));
    c = mix(c, uTactile * (1.0 + 0.12 * dots) * (0.95 + 0.1 * nS.r), tw);
  } else if (sp > 1.5 && sp < 2.5) {
    // concentric rings of setts around fountains / statues
    for (int i = 0; i < 3; i++) {
      vec4 R = uRad[i];
      vec2 d = p - R.xy;
      float rr = length(d);
      if (R.z > 0.0 && rr < R.z) {
        float ring = floor(rr / 0.55);
        float qa = atan(d.y, d.x + 1e-5) * (ring + 0.5) * 0.55 / 0.62 + ring * 0.37;
        float rj = rdLine(abs(fract(rr / 0.55 + 0.5) - 0.5) * 0.55, 0.018, fwm);
        float aj = rdLine(abs(fract(qa + 0.5) - 0.5) * 0.62, 0.018, fwm);
        float bnd = mod(ring, 4.0) < 0.5 ? 1.0 : 0.0;
        float det2 = 1.0 - smoothstep(0.1, 0.35, fwm / 0.55);
        vec3 rc = mix(vC, vC * vec3(0.66, 0.7, 0.78), bnd) * (1.0 + (rdHash(vec2(floor(qa), ring)) - 0.5) * 0.12 * det2);
        rc *= 1.0 - 0.38 * max(rj, aj);
        c = mix(c, rc * (0.95 + 0.08 * nM.b), 1.0 - smoothstep(R.z - 0.6, R.z, rr));
      }
    }
  } else if (sp > 2.5 && sp < 3.5) {
    // grass creeping into gravel
    float g = smoothstep(0.5, 0.75, nM.g * 0.5 + nS.r * 0.5);
    c = mix(c, vec3(0.3, 0.45, 0.17) * (0.85 + 0.3 * nS.b), g * 0.7);
  } else if (sp > 3.5) {
    // working surfaces: oil blobs + tyre streaks along the long axis (quays, yards)
    vec4 v = texture2D(tRC, p / 26.0);
    float blob = (1.0 - smoothstep(0.06, 0.18, v.b)) * step(0.55, v.g);
    c *= 1.0 - 0.34 * blob * (0.5 + 0.5 * nS.r);
    rough -= 0.25 * blob;
    bool wide = vR.z - vR.x > vR.w - vR.y;
    vec2 ax = wide ? p : p.yx;
    float ln = floor(ax.y / 1.7);
    float hl = rdHash(vec2(ln, 4.4));
    float sd = abs(fract(ax.y / 1.7) - 0.5) * 1.7;
    float brk = smoothstep(0.35, 0.65, texture2D(tRN, vec2(ax.x * 0.035, ln * 0.37)).g);
    float streak = (1.0 - smoothstep(0.1, 0.24, sd)) * step(0.5, hl) * brk;
    c *= 1.0 - 0.13 * streak;
    if (sp < 4.5) {
      // quay: rust halos around the bollards on the edge (x 135.8, every 13 m from z -138)
      float zb = mod(p.y + 138.0 + 6.5, 13.0) - 6.5;
      float db = length(vec2(p.x - 135.8, zb * 0.8));
      float rust = (1.0 - smoothstep(0.25, 1.7, db)) * smoothstep(0.3, 0.6, nS.g * 0.6 + nM.r * 0.4);
      c = mix(c, vec3(0.24, 0.1, 0.045), rust * 0.65);
      // salt-bleached, weathered seaward strip
      c *= 1.0 + 0.08 * smoothstep(131.0, 135.5, p.x);
    }
  }
  c *= mix(1.0, 0.76, uRain);
  rough = mix(rough, rough * 0.55, uRain);
  return c;
}
`;
