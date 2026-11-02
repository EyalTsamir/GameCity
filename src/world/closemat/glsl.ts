// The fragment programs of the close-up materials. Each outputs a ratio that multiplies what the city's own shader already
// drew on that pixel (lighting, shadow, night, weathering stay its work); colour targets are ratios to the base pattern the
// wall or slab was given, which these programs know exactly: same coordinates, same hashes, same layout. All of it fades
// to exactly 1 by the pixel footprint `CM_LIM` (radius / 1099 m), so a cell not on show has nothing to show and no edge can
// be seen. One small program per family, chosen by geometry: program size costs even for the path not taken (baking.md).
// Fetches use textureGrad with derivatives taken up front: the early-out is a real branch, the seams of a per-brick window
// don't pick a wrong mip.

import { SIDING_BH } from '../../core/sweepmat';

export const CM_VERT = /* glsl */ `
varying vec3 vP;
varying vec3 vN;
#ifdef CM_WALL
attribute vec3 aCol;
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aD;
varying vec2 vFac;
varying vec3 vCol;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
#endif
#ifdef CM_GROUND
attribute vec2 aA;
varying vec2 vKind;
#endif
#ifdef CM_HARD
attribute vec4 aS;
attribute vec4 aP;
attribute vec4 aV;
attribute vec3 aC;
attribute vec4 aX;
varying vec4 vS;
varying vec4 vPp;
varying vec4 vV;
varying vec3 vCl;
varying vec4 vX;
#endif
#ifdef CM_SOLID
attribute vec3 aCol;
attribute vec3 aGrain;
varying vec3 vCol;
varying vec3 vGr;
#ifdef CM_MATCLASS
attribute float aWhat;
varying float vWhat;
#endif
#endif
void main() {
  vP = position;
  vN = normal;
#ifdef CM_WALL
  vFac = uv;
  vCol = aCol;
  vA = aA;
  vB = aB;
  vC = aC;
  vD = aD;
#endif
#ifdef CM_GROUND
  vKind = aA;
#endif
#ifdef CM_HARD
  vS = aS;
  vPp = aP;
  vV = aV;
  vCl = aC;
  vX = aX;
#endif
#ifdef CM_SOLID
  vCol = aCol;
  vGr = aGrain;
#ifdef CM_MATCLASS
  vWhat = aWhat;
#endif
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

export const CM_COMMON = /* glsl */ `
uniform sampler2D tGrain;
uniform sampler2D tCrack;
uniform sampler2D tFibre;
uniform sampler2D tStones;
uniform vec3 uSunDir;
uniform float uDaylight;
varying vec3 vP;
varying vec3 vN;
vec2 gx, gy;
#define CMT(tx, uv, s) textureGrad(tx, (uv), gx * (s), gy * (s))
float cmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// what a tilted normal does to the light that reached this pixel: sky from above, sun if there is one
float cmLight(vec3 N, vec3 n) {
  float hemi = (0.62 + 0.38 * n.y) / (0.62 + 0.38 * N.y);
  float l0 = max(dot(N, uSunDir), 0.0), l1 = max(dot(n, uSunDir), 0.0);
  return hemi * mix(1.0, (0.42 + l1) / (0.42 + l0), uDaylight);
}
// footprint of a pixel in metres, as an area (a grazing view keeps its detail across the line of sight)
float cmArea(vec2 dx, vec2 dy) {
  return sqrt(abs(dx.x * dy.y - dx.y * dy.x)) + 1e-6;
}
#ifdef CM_FISSURE
// A crack in the surface, as a ratio. c: the crack tile read at uv (s to the metre). stress 0..1 opens the network from nothing,
// so a crack thins out wherever the strain ends and never stops dead. Thinner than a pixel it is a faint thread, not a black line:
// it covers only that part of the pixel. Up close a groove: dark at heart, the wall facing away from the light l in shade, the
// other wall and its lip catching it. rough: the edge of a break, in metres.
float cmFissure(vec4 c, vec2 uv, float s, float stress, float fa, vec2 l, float rough) {
  float w = c.g * 0.0034 * stress;
  if (w < 0.00012) return 1.0;
  float d = c.r * 0.04 + rough;
  float aa = fa * 0.7 + 0.0002;
  float band = w + 0.0035 + aa;
  if (d > band) return 1.0;
  float cov = pow(min(w / aa, 1.0), 0.8) * (1.0 - smoothstep(max(w - aa, 0.0), w + aa, d));
  float r = mix(1.0, mix(0.64, 0.3, smoothstep(0.0004, 0.002, w)), cov);
  float near = 1.0 - smoothstep(0.001, 0.0035, fa);
  if (near > 0.0) {
    float st = w + 0.002;
    float side = clamp((d - CMT(tCrack, uv + l * st * s, s).r * 0.04 - rough) / st, -1.0, 1.0);
    float lip = 1.0 - smoothstep(w, band, d);
    r *= 1.0 + near * lip * side * (side > 0.0 ? 0.2 : 0.3) * mix(0.5, 1.0, uDaylight);
  }
  return r;
}
#endif
`;

/** walls: the same coordinates as bhWall; a 1 outside window openings */
const WALL_HEAD = /* glsl */ `
varying vec2 vFac;
varying vec3 vCol;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
uniform float uWinDepth;
float cmOpen(float px) {
  if (vB.x < 0.5 || vB.y < 0.5) return 1.0;
  vec2 cell = floor(vFac);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= vB.x || cell.y >= vB.y) return 1.0;
  vec2 pm = (vFac - cell) * vC.xy;
  float d = max(max(vA.x - pm.x, pm.x - vA.y), max(vA.z - pm.y, pm.y - vA.w));
  return smoothstep(0.0, 0.004 + px, d);
}
`;

const WALL_MAIN = /* glsl */ `
  vec3 N = normalize(vN);
  vec3 T = vec3(N.z, 0.0, -N.x);
  float tl = length(T);
  T = tl > 1e-3 ? T / tl : vec3(1.0, 0.0, 0.0);
  vec3 U = vec3(0.0, 1.0, 0.0);
  vec2 q = vec2(dot(vP, T), vP.y);
  gx = dFdx(q);
  gy = dFdy(q);
  float fa = cmArea(gx, gy);
  if (fa >= CM_LIM) discard;
  float k = 1.0 - smoothstep(CM_LIM * 0.45, CM_LIM, fa);
  float seed = floor(vB.z + 0.5);
  float open = cmOpen(fa);
  if (open <= 0.0) {
    // in the opening: bhWall's reveal. The jambs and the head carry the wall's surface turned through 90°; the rest is glass and frame
    vec2 cell = floor(vFac);
    vec2 pm = (vFac - cell) * vC.xy;
    float style = floor(mod(floor(vB.w + 0.5), 64.0) / 8.0 + 0.01);
    float revD = (style > 6.5 ? 0.07 : (style > 5.5 ? 0.09 : (style > 2.5 && style < 3.5 ? 0.06 : (style > 3.5 && style < 4.5 ? 0.1 : 0.14)))) * uWinDepth;
    if (revD < 0.001) discard;
    float uSign = dot(vec2(dFdx(vFac.x), dFdy(vFac.x)), vec2(gx.x, gy.x)) < 0.0 ? -1.0 : 1.0;
    vec3 Tu = T * uSign;
    vec3 V = normalize(vP - cameraPosition);
    vec2 kd = vec2(dot(V, Tu), V.y) / max(-dot(V, N), 0.06) * revD;
    vec2 kdS = mix(vec2(1e-5), sign(kd) * max(abs(kd), vec2(1e-5)), abs(sign(kd)));
    vec2 sEx = vec2(kd.x > 0.0 ? (vA.y - pm.x) : (vA.x - pm.x), kd.y > 0.0 ? (vA.w - pm.y) : (vA.z - pm.y)) / kdS;
    float sHit = min(min(sEx.x, sEx.y), 1.0);
    bool jamb = sEx.x < sEx.y;
    // (the inner sill is drawn as stone by the base: left to it)
    if (sHit >= 1.0 || (!jamb && kd.y <= 0.0)) discard;
    vec2 dQ = q + kd * sHit * vec2(uSign, 1.0);
    q = jamb ? vec2(sHit * revD + 0.37, dQ.y) : vec2(dQ.x, sHit * revD + 0.21);
    gx = dFdx(q);
    gy = dFdy(q);
    fa = cmArea(gx, gy);
    k *= 1.0 - smoothstep(0.012, 0.03, fa);
    vec3 Nw = N;
    if (jamb) {
      N = -Tu * sign(kd.x);
      T = Nw;
    } else {
      N = vec3(0.0, -1.0, 0.0);
      U = Nw;
    }
    seed += 3.0;
    open = 1.0;
  }
  k *= open;
  vec2 so = vec2(fract(seed * 0.1373), fract(seed * 0.3119)) * 17.0;
  vec3 col = max(vCol, vec3(0.02));
  // the plinth course of bhWall: another material, drawn by its own branch below
  float hp = fract(seed * 0.5317 + 0.11);
`;

/** a hard mineral surface at q: fine relief, pits, tone. Writes the ratio. The plinth of every wall and the plaster's base. */
const MINERAL = /* glsl */ `
vec3 cmMineral(vec2 q, vec2 off, vec3 N, vec3 T, vec3 U, float amp) {
  vec4 g = CMT(tGrain, q * 1.667 + off, 1.667);
  vec2 s = (g.rg - 0.5) * amp;
  float l = cmLight(N, normalize(N - T * s.x - U * s.y));
  return vec3(l * (1.0 + (g.b - 0.5) * 0.3 * amp) * (1.0 - 0.45 * g.a));
}
`;

export const CM_BRICK = /* glsl */ `
${WALL_HEAD}
${MINERAL}
vec4 cmBrick(vec2 q, float seed, out vec2 id) {
  float ch = 0.075;
  float row = floor(q.y / ch);
  float bond = fract(seed * 0.4371);
  float odd = mod(row, 2.0);
  float len = 0.235;
  float off = odd * 0.5;
  if (bond > 0.75) { len = odd > 0.5 ? 0.1175 : 0.235; off = odd * 0.25; }
  else if (bond > 0.5) { len = 0.3525; off = odd * 0.5 + 0.16; }
  float bx = q.x / len + off;
  float c = floor(bx);
  float fx = fract(bx) * len;
  float lb = len;
  if (bond > 0.5 && bond <= 0.75) {
    if (fx > 0.235) { fx -= 0.235; lb = 0.1175; c += 0.5; } else lb = 0.235;
  }
  id = vec2(c, row);
  return vec4(fx, fract(q.y / ch) * ch, lb, ch);
}
void main() {
  ${WALL_MAIN}
  float pH = 0.3 + 0.32 * hp;
  vec3 ratio;
  if (vP.y < pH) {
    ratio = cmMineral(q, so, N, T, U, 0.8);
  } else {
    vec2 id;
    vec4 bl = cmBrick(q, seed, id);
    float bn = cmHash(id + seed);
    float rnd = cmHash(id + seed * 3.3 + 7.1);
    // every brick its own window of the tiles
    vec2 win = vec2(rnd * 37.0, fract(rnd * 7.31) * 41.0);
    vec4 g = CMT(tGrain, q * 1.667 + win, 1.667);
    vec4 c = CMT(tCrack, q * 0.39 + win * 0.37 + so, 0.39);
    // the base pattern's value here
    vec3 tint = mix(vec3(1.0), vec3(0.9, 0.92, 0.98), step(0.82, fract(bn * 7.31)));
    vec3 base = vec3(0.8 + 0.34 * bn) * tint;
    float flem = bl.z < 0.12 && fract(seed * 0.4371) > 0.5 && fract(seed * 0.4371) <= 0.75 && fract(seed * 0.913) > 0.5 ? 1.0 : 0.0;
    base *= mix(vec3(1.0), vec3(0.62, 0.6, 0.66), flem);
    float d = min(min(bl.x, bl.z - bl.x), min(bl.y, bl.w - bl.y));
    // arrises: no brick has straight edges. The noise bites into the face, some corners go altogether
    float cor = min(bl.x, bl.z - bl.x) + min(bl.y, bl.w - bl.y);
    float bite = step(0.7, fract(rnd * 13.7)) * (1.0 - smoothstep(0.0, 0.03, cor)) * 0.012;
    float e = d - (g.b - 0.42) * 0.018 - (c.a - 0.5) * 0.012 - bite;
    float aaE = 0.0035 + fa * 0.9;
    float m = 1.0 - smoothstep(0.0065 - aaE, 0.0065 + aaE, e);
    // face: fired surface, sand pits, a blush of darker firing over some of its length
    float rough = 0.25 + 0.5 * fract(rnd * 23.1);
    vec2 s = (g.rg - 0.5) * rough + (vec2(rnd, fract(rnd * 5.1)) - 0.5) * 0.07;
    float light = cmLight(N, normalize(N - T * s.x - U * s.y));
    float fire = smoothstep(0.42, 0.72, c.b + (rnd - 0.5) * 0.5);
    vec3 face = vec3(1.05 * light * (1.0 + (g.b - 0.5) * 0.3) * (1.0 - 0.42 * rough * g.a));
    face *= mix(vec3(1.06, 1.02, 0.98), vec3(0.8, 0.76, 0.76), fire * fract(rnd * 3.7));
    // the arris catches the sky above and hides below
    float top = 1.0 - smoothstep(0.0, 0.014, bl.w - bl.y - 0.006);
    float bot = 1.0 - smoothstep(0.0, 0.012, bl.y - 0.006);
    face *= (1.0 + 0.1 * top * g.b * 2.0) * (1.0 - 0.2 * bot);
    // a spalled face here and there: the crust has come off
    float sp = step(0.965, fract(rnd * 29.3)) * smoothstep(0.5, 0.56, c.a * 0.7 + g.b * 0.3 + (fract(rnd * 3.1) - 0.5) * 0.2);
    if (sp > 0.0) {
      vec2 s2 = (g.rg - 0.5) * 2.2;
      float l2 = cmLight(N, normalize(N - T * s2.x - U * s2.y));
      face = mix(face, vec3(1.22, 1.1, 0.98) * l2 * (0.8 + 0.5 * g.b), sp);
    }
    // lime washed out of the joint above, on a few bricks
    float eff = step(0.9, fract(rnd * 17.9)) * (1.0 - smoothstep(0.0, 0.05, bl.w - bl.y)) * smoothstep(0.35, 0.7, g.b * 0.5 + c.a * 0.5);
    face = mix(face, vec3(0.72, 0.71, 0.68) / max(col * base, vec3(0.05)), 0.55 * eff);
    // mortar: its own colour, not the brick's. Recessed: shaded under the brick above, lit along the brick below
    float inJ = 1.0 - smoothstep(0.0, 0.012, bl.y);
    vec3 mort = vec3(0.4, 0.385, 0.35) * (0.72 + 0.56 * g.b + 0.3 * (c.b - 0.5)) * (1.0 - 0.3 * g.a);
    mort *= mix(0.95, 0.7, inJ);
    // what the base drew under the new edge: the mortar band or the brick
    float baseM = 1.0 - smoothstep(0.004, 0.0085, d);
    vec3 under = mix(base, vec3(1.3) * (0.94 + 0.12 * c.a), baseM);
    vec3 mr = min(mort / max(col * under, vec3(0.04)), vec3(1.9));
    // pale mortar joints would fight the lit arris the base draws on the upper-left of each joint: pull it down
    vec3 fr = face / mix(vec3(1.0), under / base, baseM);
    ratio = mix(fr, mr, m);
  }
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

export const CM_PLASTER = /* glsl */ `
${WALL_HEAD}
void main() {
  ${WALL_MAIN}
  float pH = 0.3 + 0.32 * hp;
  vec4 g = CMT(tGrain, q * 1.667 + so, 1.667);
  vec4 c = CMT(tCrack, q * 0.39 + so * 0.61, 0.39);
  // a wider sweep of the float: the surface is not flat at hand scale
  vec4 w = CMT(tGrain, q * 0.31 + so.yx, 0.31);
  vec2 s = (g.rg - 0.5) * 0.4 + (w.rg - 0.5) * 0.25;
  float light = cmLight(N, normalize(N - T * s.x - U * s.y));
  vec3 ratio = vec3(light * (1.0 + (g.b - 0.5) * 0.14) * (1.0 - 0.15 * g.a));
  ratio *= 0.93 + 0.14 * c.b;
#ifndef CM_FISSURE
  // hairline crazing where the render has been working, the odd longer crack
  float dist = c.r * 0.04;
  float zone = smoothstep(0.55, 0.72, c.b + 0.18 * (w.b - 0.5)) * step(0.3, fract(seed * 0.71 + 0.2));
  float width = 0.0007 + 0.0016 * c.a;
  float crack = zone * (1.0 - smoothstep(width, width + 0.0012 + fa * 0.8, dist));
  float halo = zone * (1.0 - smoothstep(0.0, 0.012, dist));
  ratio *= (1.0 - 0.1 * halo) * (1.0 - 0.62 * crack);
#endif
  // chips: the paint and the coat of render gone, at the foot, at the corners and here and there. A ragged lip of paint
  float y = vP.y;
  float flg = floor(vD.w + 0.01);
  float dl = mod(floor(flg * 0.5), 2.0) > 0.5 ? vD.x : 1e3;
  float dr = mod(floor(flg * 0.25), 2.0) > 0.5 ? vD.y - vD.x : 1e3;
  float corner = step(0.5, vD.w) * (1.0 - smoothstep(0.0, 0.35, min(dl, dr)));
  float where = 0.1 + 0.55 * (1.0 - smoothstep(0.4, 1.6, y)) + 0.5 * corner;
  float fl = c.a * 0.66 + g.b * 0.2 + w.b * 0.14;
  float thr = 0.79 - 0.2 * where;
  float chip = smoothstep(thr, thr + 0.008 + fa * 0.5, fl);
  float rim = smoothstep(thr - 0.025, thr, fl) * (1.0 - chip);
  if (chip > 0.0) {
    // what is under: a browner, coarser coat, in a pit
    vec2 s2 = (g.rg - 0.5) * 1.9;
    float l2 = cmLight(N, normalize(N - T * s2.x - U * s2.y));
    vec3 under = mix(col * 0.55, vec3(0.34, 0.31, 0.27), 0.4) * (0.65 + 0.7 * g.b) * l2 * (1.0 - 0.5 * g.a);
    ratio = mix(ratio, min(under / max(col, vec3(0.05)), vec3(1.6)), chip);
  }
  ratio *= 1.0 + 0.16 * rim;
#ifdef CM_FISSURE
  // render cracks where it is strained: off the corners of the openings, at the wall's own corners, and in patches where it has
  // been working. Some walls were rendered last year
  float strain = smoothstep(0.5, 0.68, c.b + 0.22 * (w.b - 0.5));
  if (vB.x > 0.5 && vB.y > 0.5) {
    vec2 pmC = fract(vFac) * vC.xy;
    vec2 eC = vec2(min(abs(pmC.x - vA.x), abs(pmC.x - vA.y)), min(abs(pmC.y - vA.z), abs(pmC.y - vA.w)));
    strain = max(strain * 0.8, (1.0 - smoothstep(0.03, 0.75, length(eC))) * step(0.4, cmHash(floor(vFac) + seed)));
  }
  strain = max(strain, corner * smoothstep(0.42, 0.6, c.b));
  ratio *= cmFissure(c, q * 0.39 + so * 0.61, 0.39, strain * step(0.3, fract(seed * 0.71 + 0.2)), fa, normalize(vec2(dot(uSunDir, T), max(uSunDir.y, 0.2))), (g.b - 0.5) * 0.002);
#endif
  if (vP.y < pH) ratio = mix(ratio, vec3(light * (1.0 - 0.3 * g.a)), 0.7);
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

export const CM_TIMBER = /* glsl */ `
${WALL_HEAD}
void main() {
  ${WALL_MAIN}
  float pH = 0.3 + 0.32 * hp;
  float bh = ${SIDING_BH};
  float row = floor(q.y / bh);
  float fy = fract(q.y / bh);
  float join = floor(q.x / 3.7 + cmHash(vec2(row, seed)));
  float rnd = cmHash(vec2(row, join) + seed * 0.37);
  // each board its own window; a tile runs 1.2 m along and 0.3 m across
  vec2 uv = vec2(q.x / 1.2 + rnd * 7.0, fy + rnd * 13.0);
  vec2 dgx = gx, dgy = gy;
  vec4 f = textureGrad(tFibre, uv, dgx * vec2(0.833, 1.0 / bh), dgy * vec2(0.833, 1.0 / bh));
  vec4 c = CMT(tCrack, q * 0.39 + so + rnd * 3.0, 0.39);
  float paint = step(0.3, fract(seed * 0.6113 + 0.3));
#ifdef CM_MATCLASS
  // bare timber is timber-coloured: a pale board with the grain on it read as brushed metal (linear: green under 0.72 of red)
  paint = max(paint, step(col.r * 0.72, col.g));
  paint = max(paint, step(0.42, dot(col, vec3(0.3, 0.59, 0.11))));
#endif
  vec2 s = (f.rg - 0.5) * mix(0.38, 0.07, paint);
  float light = min(cmLight(N, normalize(N - T * s.x - U * s.y)), 1.12);
  vec3 ratio = vec3(light * (1.0 + (f.b - 0.5) * mix(0.24, 0.03, paint)) * (1.0 - mix(0.26, 0.03, paint) * f.a));
  // the paint has gone along the grain, first at the foot and under the lap: grey old wood
  float yy = vP.y;
  float wear = 0.74 - 0.14 * (1.0 - smoothstep(0.3, 1.8, yy)) - 0.08 * (1.0 - smoothstep(0.0, 0.12, fy));
  float fl = c.a * 0.5 + f.b * 0.35 + c.b * 0.15;
  float bare = smoothstep(wear, wear + 0.015 + fa, fl) * paint;
  vec3 raw = vec3(0.3, 0.26, 0.21) * (0.6 + 0.8 * f.b) * light * (1.0 - 0.6 * f.a);
  ratio = mix(ratio, raw / max(col, vec3(0.05)), bare);
  // the butt joint and its two nails at each end of a length, nails every stud
  float dj = abs(fract(q.x / 3.7 + cmHash(vec2(row, seed))) - 0.5);
  float butt = 1.0 - smoothstep(0.4985, 0.4995, dj + fa * 0.12);
  ratio *= 1.0 - 0.0 * butt;
  ratio *= mix(1.0, 0.45, smoothstep(0.4985, 0.4996, dj));
  vec2 nq = vec2(fract(q.x / 0.6 + 0.5) - 0.5, (fy - 0.82)) * vec2(0.6, 0.3);
  float nail = 1.0 - smoothstep(0.0035, 0.0055, length(nq));
  ratio *= 1.0 - 0.4 * nail;
  float rust = (1.0 - smoothstep(0.0, 0.02 + 0.03 * c.a, length(vec2(nq.x, min(nq.y, 0.0) * 0.25)))) * (1.0 - nail);
  ratio *= mix(vec3(1.0), vec3(0.8, 0.72, 0.62), rust * paint);
  // the shadow under the lap is never a ruled line
  ratio *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.03 + 0.04 * f.b, fy));
  if (vP.y < pH) ratio = vec3(light);
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

export const CM_STONE = /* glsl */ `
${WALL_HEAD}
void main() {
  ${WALL_MAIN}
  float pH = 0.3 + 0.32 * hp;
  float ch = 0.62;
  float row = floor(q.y / ch);
  float fy = fract(q.y / ch);
  float bx = q.x / 1.25 + mod(row, 2.0) * 0.5;
  float fx = fract(bx);
  vec2 id = vec2(floor(bx), row);
  float rnd = cmHash(id + seed + 3.3);
  vec2 win = vec2(rnd * 29.0, fract(rnd * 3.7) * 31.0);
  vec4 g = CMT(tGrain, q * 1.667 + win, 1.667);
  vec4 c = CMT(tCrack, q * 0.39 + win * 0.21, 0.39);
  vec4 w = CMT(tGrain, q * 0.47 + win.yx, 0.47);
  // bed: tooled stone. Fine diagonal strokes of the chisel over the whole face, on some blocks
  float d = min(min(fx, 1.0 - fx) * 1.25, min(fy, 1.0 - fy) * ch);
  float e = d - (w.b - 0.45) * 0.03 - (g.b - 0.5) * 0.012;
  vec2 s = (g.rg - 0.5) * 0.34 + (w.rg - 0.5) * 0.26;
  float tool = step(0.5, fract(rnd * 5.7));
  float stroke = sin(dot(q, vec2(0.7, 1.0)) * 420.0 + g.b * 6.0) * tool * (1.0 - smoothstep(0.0012, 0.003, fa));
  s += vec2(0.7, 1.0) * stroke * 0.09;
  float light = cmLight(N, normalize(N - T * s.x - U * s.y));
  vec3 ratio = vec3(light * (1.0 + (g.b - 0.5) * 0.2) * (1.0 - 0.3 * g.a));
  ratio *= mix(vec3(0.93, 0.92, 0.9), vec3(1.05, 1.03, 0.99), c.b);
  // veins and fine fissures, in some blocks
#ifdef CM_FISSURE
  ratio *= cmFissure(c, q * 0.39 + win * 0.21, 0.39, step(0.75, fract(rnd * 9.1)) * smoothstep(0.42, 0.62, c.b + 0.2 * w.b) * 0.7, fa, normalize(vec2(dot(uSunDir, T), max(uSunDir.y, 0.2))), (g.b - 0.5) * 0.002);
#else
  float dist = c.r * 0.04;
  float crack = step(0.75, fract(rnd * 9.1)) * (1.0 - smoothstep(0.0009, 0.0024 + fa * 0.8, dist));
  ratio *= 1.0 - 0.55 * crack;
#endif
  // lichen in the damp (a few pale and dark crusts)
  float lich = smoothstep(0.72, 0.76, c.a * 0.7 + w.b * 0.3) * smoothstep(0.45, 0.7, c.b);
  ratio = mix(ratio, ratio * vec3(1.12, 1.12, 0.92), lich * 0.8);
  // the joint: worn arrises, a deep shadow line at its heart
  float m = 1.0 - smoothstep(0.004, 0.014 + fa, e);
  ratio *= mix(1.0, 0.56 + 0.3 * g.b, m);
  ratio *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.03, min(fy, 1.0 - fy) * ch)) * step(0.5, fy);
  if (vP.y < pH) ratio = mix(ratio, vec3(light), 0.5);
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

export const CM_PANEL = /* glsl */ `
${WALL_HEAD}
void main() {
  ${WALL_MAIN}
  float csx = vB.x > 0.5 && vB.y > 0.5 ? vC.x : 3.0;
  float csy = vB.x > 0.5 && vB.y > 0.5 ? vC.y : 1.6;
  // panel coordinates by the window grid when there is one (as bhPG does; the sign of u is folded out by the distance to a joint)
  vec2 cellF = vB.x > 0.5 && vB.y > 0.5 ? fract(vFac) * vec2(csx, csy) : mod(q, vec2(csx, csy));
  vec2 cid = vB.x > 0.5 && vB.y > 0.5 ? floor(vFac) : floor(q / vec2(csx, csy));
  float rnd = cmHash(cid + seed);
  vec2 win = vec2(rnd * 23.0, fract(rnd * 3.3) * 19.0);
  vec4 g = CMT(tGrain, q * 1.667 + win, 1.667);
  vec4 c = CMT(tCrack, q * 0.39 + win * 0.23, 0.39);
  vec4 st = CMT(tStones, q * 1.25 + win, 1.25);
  vec2 s = (g.rg - 0.5) * 0.55;
  float light = cmLight(N, normalize(N - T * s.x - U * s.y));
  // cast concrete: blow holes, the aggregate showing where the skin has worn, the board marks of the formwork
  vec3 ratio = vec3(light * (1.0 - 0.42 * g.a * smoothstep(0.42, 0.68, c.b)));
  ratio *= 1.0 + (st.g - 0.5) * 0.14 * smoothstep(0.4, 0.75, c.b) ;
  float board = abs(fract(cellF.y / 0.22 + rnd) - 0.5);
  ratio *= 1.0 - 0.1 * (1.0 - smoothstep(0.47, 0.495, board + 0.012 * (g.b - 0.5)));
  // the tie holes: rows of cones, each weeping a little rust
  vec2 tq = vec2(fract(cellF.x / (csx * 0.5)) - 0.5, cellF.y / csy - 0.5) * vec2(csx * 0.5, csy);
  tq.y = abs(tq.y) - csy * 0.25;
  float hole = 1.0 - smoothstep(0.011, 0.015, length(tq));
  float ring = (1.0 - smoothstep(0.015, 0.019, length(tq))) * (1.0 - hole);
  float weep = (1.0 - smoothstep(0.0, 0.012 + 0.012 * c.a, abs(tq.x))) * smoothstep(0.0, -0.01, tq.y) * (1.0 - smoothstep(-0.32 - 0.25 * g.b, -0.03, -tq.y * -1.0 - 0.32));
  ratio *= (1.0 - 0.72 * hole) * (1.0 - 0.14 * ring);
  ratio = mix(ratio, ratio * vec3(0.78, 0.68, 0.56), clamp(weep, 0.0, 1.0) * 0.5 * step(0.35, rnd));
  // a crack or two
#ifdef CM_FISSURE
  ratio *= cmFissure(c, q * 0.39 + win * 0.23, 0.39, smoothstep(0.56, 0.75, c.b) * step(0.45, fract(rnd * 3.9)), fa, normalize(vec2(dot(uSunDir, T), max(uSunDir.y, 0.2))), (g.b - 0.5) * 0.002);
#else
  float dist = c.r * 0.04;
  float zone = smoothstep(0.6, 0.75, c.b) * step(0.45, fract(rnd * 3.9));
  float crack = zone * (1.0 - smoothstep(0.0009, 0.0024 + fa * 0.8, dist));
  ratio *= (1.0 - 0.6 * crack);
#endif
  // spalled arris along the joints
  vec2 dj = min(cellF, vec2(csx, csy) - cellF);
  float jd = min(dj.x, dj.y);
  float spall = (1.0 - smoothstep(0.02, 0.05, jd + (c.a - 0.45) * 0.09 + (g.b - 0.5) * 0.015));
  ratio *= mix(1.0, 0.82 + 0.34 * g.b, spall);
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

export const CM_SHEET = /* glsl */ `
${WALL_HEAD}
void main() {
  ${WALL_MAIN}
  float pH = 0.7 + 0.5 * hp;
  vec4 g = CMT(tGrain, q * 1.667 + so, 1.667);
  vec4 c = CMT(tCrack, q * 0.39 + so * 0.3, 0.39);
  vec2 fuv = vec2(q.y / 1.2, q.x / 0.3) + so;
  vec4 f = textureGrad(tFibre, fuv, vec2(gx.y * 0.833, gx.x * 3.33), vec2(gy.y * 0.833, gy.x * 3.33));
  float ph = fract(q.x / 0.32);
  float crown = 1.0 - min(smoothstep(0.1, 0.24, ph), 1.0 - smoothstep(0.6, 0.74, ph));
  vec3 ratio = vec3(1.0);
  if (vP.y < pH) {
    vec2 s = (g.rg - 0.5) * 0.8;
    ratio = vec3(cmLight(N, normalize(N - T * s.x - U * s.y)) * (1.0 - 0.45 * g.a));
  } else {
    // galvanised sheet under old paint: fine scratches down the fall of the rain, pinholes
    vec2 s = (g.rg - 0.5) * 0.14;
    ratio = vec3(cmLight(N, normalize(N - T * s.x - U * s.y)));
    ratio *= 1.0 + (f.b - 0.5) * 0.14;
    float lap = abs(fract(q.x / 1.92 + fract(seed * 0.37)) - 0.5);
    float bot = abs(fract(q.y / 2.8 + fract(seed * 0.73)) - 0.5);
    // fixings: a row of screws on the crowns at every purlin, each with a bleed of rust below
    float py = (fract(q.y / 1.3 + fract(seed * 0.17)) - 0.5) * 1.3;
    float px = (fract(q.x / 0.32 + 0.33) - 0.5) * 0.32;
    float dsc = length(vec2(px, py));
    float screw = 1.0 - smoothstep(0.006, 0.0085, dsc);
    float bleed = (1.0 - smoothstep(0.004, 0.012 + 0.012 * c.a, abs(px))) * smoothstep(0.004, -0.02, py) * (1.0 - smoothstep(0.03, 0.14 + 0.3 * g.b, -py));
#ifdef CM_WEARRUST
    // only the screws that have let go weep
    bleed *= step(0.68, cmHash(floor(vec2(q.x / 0.32 + 0.33, q.y / 1.3 + fract(seed * 0.17))) + seed));
    // a lap rusts where it holds water, not along its whole length, and some sheets were replaced
    float lapAge = smoothstep(0.3, 0.8, cmHash(vec2(floor(q.x / 1.92 + fract(seed * 0.37)), seed + 3.1)));
    lapAge *= smoothstep(0.28, 0.62, CMT(tCrack, vec2(q.x * 0.11, q.y * 0.53) + so.yx, 0.5).b);
#endif
    // rust: from the foot of a sheet, from laps and fixings, where the paint has broken
    float reach = 0.28 * (1.0 - smoothstep(0.0, 0.2, bot < 0.45 ? 1.0 : 0.0));
#ifdef CM_WEARRUST
    float edge = (1.0 - smoothstep(0.0, 0.1, 0.5 - bot)) * 0.26 + (1.0 - smoothstep(0.0, 0.025, 0.5 - lap)) * 0.34 * lapAge + (1.0 - smoothstep(pH, pH + 0.9, vP.y)) * 0.2;
#else
    float edge = (1.0 - smoothstep(0.0, 0.1, 0.5 - bot)) * 0.3 + (1.0 - smoothstep(0.0, 0.025, 0.5 - lap)) * 0.34 + (1.0 - smoothstep(pH, pH + 1.6, vP.y)) * 0.26;
#endif
    float fl = c.a * 0.55 + c.b * 0.32 + g.b * 0.13 + edge + reach * 0.0;
    fl += (fract(seed * 0.91) - 0.6) * 0.14;
    float rust = smoothstep(0.76, 0.81, fl);
    float rrim = smoothstep(0.68, 0.76, fl) * (1.0 - rust);
#ifdef CM_WEARRUST
    vec3 rc = mix(vec3(0.11, 0.055, 0.028), vec3(0.24, 0.115, 0.05), g.b * 0.6 + c.a * 0.4) * (1.0 - 0.3 * g.a);
    // what ran down from the rust above: thin orange-brown along the fall of the rain, gone in a hand's length
    float flUp = CMT(tCrack, (q + vec2(0.0, 0.08 + 0.08 * g.b)) * 0.39 + so * 0.3, 0.39).a * 0.55 + c.b * 0.32 + g.b * 0.13 + edge;
    float run = smoothstep(0.66, 0.84, flUp) * (1.0 - rust) * (0.45 + 0.9 * f.b);
    ratio *= mix(vec3(1.0), vec3(0.82, 0.66, 0.5), clamp(run, 0.0, 1.0) * 0.7);
#else
    vec3 rc = mix(vec3(0.05, 0.033, 0.021), vec3(0.1, 0.062, 0.036), g.b) * (1.0 - 0.3 * g.a);
#endif
    vec2 s2 = (g.rg - 0.5) * 0.7;
    float lr = cmLight(N, normalize(N - T * s2.x - U * s2.y));
    ratio = mix(ratio, rc * lr / max(col, vec3(0.04)), rust);
    ratio *= mix(vec3(1.0), vec3(0.88, 0.76, 0.62), rrim);
    ratio = mix(ratio, ratio * vec3(0.66, 0.48, 0.32), clamp(bleed, 0.0, 1.0) * 0.8);
    ratio = mix(ratio, vec3(0.7), screw);
    ratio *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.004 + fa, abs(0.5 - lap) * 1.92));
    ratio *= 1.0 - 0.08 * crown * 0.0;
  }
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

export const CM_SMOOTH = /* glsl */ `
${WALL_HEAD}
void main() {
  ${WALL_MAIN}
  vec4 g = CMT(tGrain, q * 1.667 + so, 1.667);
  vec4 st = CMT(tStones, q * 2.6 + so, 2.6);
  vec4 c = CMT(tCrack, q * 0.39 + so * 0.3, 0.39);
  vec2 fuv = vec2(q.y / 1.2, q.x / 0.3) + so;
  vec4 f = textureGrad(tFibre, fuv, vec2(gx.y * 0.833, gx.x * 3.33), vec2(gy.y * 0.833, gy.x * 3.33));
  vec2 s = (g.rg - 0.5) * 0.18;
  vec3 ratio = vec3(cmLight(N, normalize(N - T * s.x - U * s.y)));
  // honed stone or coated sheet: minerals in it, a film of grime down the fall of the rain, rubbed at hand height, nicks
  ratio *= 1.0 + (st.g - 0.5) * 0.3 * smoothstep(0.1, 0.3, st.r);
  ratio *= 1.0 + (c.b - 0.5) * 0.28 + (f.b - 0.5) * 0.2;
  float hand = 1.0 - smoothstep(0.8, 2.2, vP.y);
  ratio *= 1.0 + 0.22 * smoothstep(0.55, 0.9, f.a + c.a * 0.4) * hand;
  float nick = smoothstep(0.76, 0.8, c.a * 0.7 + g.b * 0.3);
  ratio = mix(ratio, vec3(1.7), nick * 0.7);
  vec3 dust = vec3(0.26, 0.25, 0.235) * (0.7 + 0.6 * g.b) / col;
  float film = (0.04 + 0.16 * smoothstep(0.3, 0.8, c.b) + 0.22 * (1.0 - smoothstep(0.0, 1.4, vP.y))) * (0.6 + 0.8 * f.b);
  film += 0.3 * smoothstep(0.7, 0.92, f.a);
  ratio = mix(ratio, dust, clamp(film, 0.0, 1.0) * smoothstep(0.32, 0.1, dot(col, vec3(0.3, 0.59, 0.11))));
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** asphalt: stone by stone in black binder, seen from above */
export const CM_ASPHALT = /* glsl */ `
varying vec2 vKind;
void main() {
  vec3 N = normalize(vN);
  vec2 p = vP.xz;
  gx = dFdx(p);
  gy = dFdy(p);
  float fa = cmArea(gx, gy);
  if (fa >= CM_LIM) discard;
  float k = 1.0 - smoothstep(CM_LIM * 0.45, CM_LIM, fa);
  // the ground is most of a street view: only the first metres pay for grain, relief and cracks
  float fine = 1.0 - smoothstep(CM_LIM * 0.3, CM_LIM * 0.5, fa);
  vec4 g = fine > 0.0 ? mix(vec4(0.5), CMT(tGrain, p * 1.667, 1.667), fine) : vec4(0.5);
  // (the grain pushes the lookup about: no straight polygon edges)
  vec2 sq = p * 1.8 + (g.rg - 0.5) * 0.035;
  vec4 s0 = CMT(tStones, sq, 1.8);
  // the stones' relief against the light: the same tile a little toward the sun
  vec2 ld = uSunDir.xz / max(uSunDir.y, 0.25);
  vec4 s1 = fine > 0.0 ? CMT(tStones, sq + ld * 0.0035, 1.8) : s0;
  float id = s0.g;
  // some stones lie under the binder, the road is not a mosaic
  float buried = smoothstep(0.3, 0.36, fract(id * 5.7));
  float stone = smoothstep(0.16, 0.42, s0.r) * buried;
  // limestone and basalt chippings: most grey, some warm, a few nearly white, in near-black binder; worn tops
  vec3 tone = vec3(0.92 + 0.4 * id);
  tone *= mix(vec3(1.0), vec3(1.1, 1.03, 0.92), step(0.72, fract(id * 7.3)));
  tone = mix(tone, vec3(1.7, 1.66, 1.58), step(0.95, fract(id * 13.7)));
  tone = mix(tone, vec3(0.5, 0.5, 0.52), step(0.82, fract(id * 3.1)) * step(fract(id * 13.7), 0.93));
  float binder = 0.56 + 0.22 * g.b;
  vec3 ratio = mix(vec3(binder), tone, stone);
  // sun on one side of each stone, shade on the other
  float rel = (s0.b - s1.b) * 2.6 * fine * uDaylight * smoothstep(0.02, 0.3, uSunDir.y);
  ratio *= 1.0 + clamp(-rel, -0.32, 0.42) + (s0.b - 0.3) * 0.42;
  vec2 sl = (g.rg - 0.5) * 0.5;
  ratio *= cmLight(N, normalize(N - vec3(sl.x, 0.0, sl.y)));
  // coarser stones standing out, hairline cracks in the old wearing course, a dusty film in the hollows
  ratio *= 1.0 + (0.5 - s0.a) * 0.16 * (1.0 - stone * 0.5);
  if (fine > 0.0) {
    vec4 c = CMT(tCrack, p * 0.39, 0.39);
#ifdef CM_FISSURE
    ratio *= mix(1.0, cmFissure(c, p * 0.39, 0.39, smoothstep(0.54, 0.74, c.b), fa, normalize(uSunDir.xz + 1e-3), (g.b - 0.5) * 0.003), fine);
#else
    float dist = c.r * 0.04;
    float zone = smoothstep(0.56, 0.72, c.b);
    float crack = zone * (1.0 - smoothstep(0.0008 + 0.0012 * c.a, 0.002 + 0.002 * c.a + fa * 0.8, dist));
    ratio *= 1.0 - 0.6 * crack * fine;
#endif
  }
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** the parametric slab of rdHard, stone by stone: the same joints in the same places */
const HARD_HEAD = /* glsl */ `
uniform sampler2D tRN;
varying vec4 vS;
varying vec4 vPp;
varying vec4 vV;
varying vec3 vCl;
varying vec4 vX;
float cmHerring(vec2 q, out vec2 cell) {
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
// (cell, edge distance): the stone this pixel belongs to; rdHard's layout
void cmSlab(vec2 p, vec2 q, float frame, vec2 size, out vec2 cell, out float edge, out vec2 lo) {
  float minS = min(size.x, size.y);
  lo = vec2(0.0);
  if (vV.z < -1.5) {
    float u = size.y;
    edge = cmHerring(q / u, cell) * u;
    return;
  }
  float hand = (frame < 1.5 && minS < 0.35) ? 1.0 : 0.0;
  float qy = q.y;
  if (hand > 0.5) qy += (textureGrad(tRN, p * 0.0625, gx * 0.0625, gy * 0.0625).r - 0.5) * 0.5 * size.y;
  float row = floor(qy / size.y);
  float off = vV.z >= 0.0 ? mod(row, 2.0) * vV.z : cmHash(vec2(row, 3.7));
  off += hand * (cmHash(vec2(row, 1.9)) - 0.5) * 0.22;
  float qx = q.x / size.x + off;
  float J = hand * 0.34;
  float i0 = floor(qx);
  float aL = (cmHash(vec2(i0, row + 0.37)) - 0.5) * J;
  float aR = (cmHash(vec2(i0 + 1.0, row + 0.37)) - 0.5) * J;
  float ci = i0;
  if (qx - i0 < aL) {
    ci = i0 - 1.0;
    aR = aL;
    aL = (cmHash(vec2(i0 - 1.0, row + 0.37)) - 0.5) * J;
  } else if (qx - i0 >= 1.0 + aR) {
    ci = i0 + 1.0;
    aL = aR;
    aR = (cmHash(vec2(i0 + 2.0, row + 0.37)) - 0.5) * J;
  }
  float lx = qx - ci;
  cell = vec2(ci, row);
  float dx = min(lx - aL, 1.0 + aR - lx) * size.x;
  float dy = abs(fract(qy / size.y + 0.5) - 0.5) * size.y;
  edge = min(dx, dy);
  lo = (vec2((lx - aL) / (1.0 + aR - aL), fract(qy / size.y)) - 0.5) * size;
}
`;

const HARD_MAIN = /* glsl */ `
  vec3 N = normalize(vN);
  vec2 p = vP.xz;
  gx = dFdx(p);
  gy = dFdy(p);
  float frame = vS.w;
  // a kerb: along it and across it, so a vertical face gets a surface as well (height and distance from the kerb)
  vec2 uv = frame < 0.5 ? p : (frame < 1.5 ? p.yx : vec2(vS.y, vP.y + min(vS.x, 3.0)));
  vec2 ug = frame < 0.5 ? gx : (frame < 1.5 ? gx.yx : vec2(dFdx(vS.y), dFdx(vP.y + min(vS.x, 3.0))));
  vec2 uh = frame < 0.5 ? gy : (frame < 1.5 ? gy.yx : vec2(dFdy(vS.y), dFdy(vP.y + min(vS.x, 3.0))));
  gx = ug;
  gy = uh;
  float fa = cmArea(gx, gy);
  if (fa >= CM_LIM) discard;
  float k = 1.0 - smoothstep(CM_LIM * 0.45, CM_LIM, fa);
  vec3 TX = normalize(vec3(1.0 - N.x * N.x, -N.x * N.y, -N.x * N.z) + vec3(1e-4));
  vec3 TZ = normalize(cross(TX, N));
`;

/** slabs, setts, kerbs, pavers */
export const CM_SLAB = /* glsl */ `
${HARD_HEAD}
void main() {
  ${HARD_MAIN}
  vec2 size = vPp.xy;
  float minS = min(size.x, size.y);
  vec2 q = frame < 1.5 ? uv : vec2(vS.y, 0.5);
  vec2 cell, lo;
  float edge;
  cmSlab(p, q, frame, size, cell, edge, lo);
  float rnd = cmHash(cell + 11.7);
  vec2 win = vec2(rnd * 31.0, fract(rnd * 7.7) * 37.0);
  float fine = 1.0 - smoothstep(CM_LIM * 0.3, CM_LIM * 0.5, fa);
  vec4 g = fine > 0.0 ? mix(vec4(0.5), CMT(tGrain, uv * 1.667 + win, 1.667), fine) : vec4(0.5);
  vec4 c = CMT(tCrack, uv * 0.39 + win * 0.17, 0.39);
  vec4 st = fine > 0.0 ? CMT(tStones, uv * 2.1 + win, 2.1) : vec4(0.5);
  // stone: flecks of its minerals, relief, pits; a fired clay brick (red pavers) shows no flecks
  vec2 s = (g.rg - 0.5) * 0.62;
  float light = cmLight(N, normalize(N - TX * s.x - TZ * s.y));
  float clay = step(vCl.g * 1.5, vCl.r);
  vec3 ratio = vec3(light * (1.0 + (g.b - 0.5) * 0.24) * (1.0 - 0.24 * g.a));
  ratio *= 1.0 + (st.g - 0.5) * mix(0.3, 0.05, clay) * fine * smoothstep(0.08, 0.3, st.r);
  ratio *= 0.92 + 0.16 * c.b;
  // the edge of each stone: worn, nibbled by frost and wheels; corners go first; a wide dirty margin
  vec2 sa = max(size, vec2(minS));
  float e = edge - (c.a - 0.46) * 0.016 - (g.b - 0.5) * 0.006;
  float jw = max(vPp.z, 0.006);
  float nib = 1.0 - smoothstep(jw * 0.5, jw * 0.5 + 0.005 + fa, e);
  // joints: grit, dark at heart, here and there a line of moss in the shade
  vec3 jc = vec3(0.44 + 0.3 * g.b, 0.42 + 0.27 * g.b, 0.36 + 0.24 * g.b) * (0.62 + 0.3 * st.r);
  float moss = smoothstep(0.5, 0.74, c.b + (g.b - 0.5) * 0.4) * step(0.45, fract(rnd * 3.3));
  jc = mix(jc, vec3(0.42, 0.56, 0.18) * (0.5 + g.b), moss * 0.75);
  jc = jc * vec3(0.3) / max(vCl, vec3(0.1));
  ratio = mix(ratio, jc, nib);
  ratio *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, min(0.05, minS * 0.3), edge)) * (1.0 - nib);
  // a crack across some big slabs; the spot of old gum and the rust ring of a table leg belong to a town's floor
  if (minS > 0.35) {
#ifdef CM_FISSURE
    if (frame < 1.5 && vV.z > -1.5 && cmHash(cell + 23.9) < 0.08) {
      // a slab breaks once, from joint to joint: the line the paving's shader draws (wearpave), with its broken edge and a lit lip
      // here, and the forks that leave it and die out
      vec2 dn = normalize(vec2(cmHash(cell + 2.2) - 0.5, cmHash(cell + 4.4) - 0.5) + 1e-3);
      float zt = dot(lo, vec2(-dn.y, dn.x));
      float z0 = floor(zt / 0.31), z1 = floor(zt / 0.07);
      float zig = (mix(cmHash(vec2(z0, cell.x)), cmHash(vec2(z0 + 1.0, cell.x)), fract(zt / 0.31)) - 0.5) * 0.13 + (mix(cmHash(vec2(z1, cell.y)), cmHash(vec2(z1 + 1.0, cell.y)), fract(zt / 0.07)) - 0.5) * 0.035;
      float lv = dot(lo, dn) + (cmHash(cell + 6.6) - 0.5) * minS * 0.4 + zig;
      float dm = abs(lv);
      vec2 lq = normalize(frame < 0.5 ? uSunDir.xz + 1e-3 : uSunDir.zx + 1e-3);
      ratio *= cmFissure(c, uv * 0.39 + win * 0.17, 0.39, (1.0 - smoothstep(0.012, 0.26, dm)) * 0.75, fa, lq, (g.b - 0.5) * 0.002);
      float aa = fa * 0.7 + 0.0002;
      float dj = dm + (g.b - 0.5) * 0.0035 + (g.a - 0.3) * 0.0015;
      float near = 1.0 - smoothstep(0.001, 0.0035, fa);
      ratio *= 1.0 - 0.42 * near * (1.0 - smoothstep(0.0012 - aa, 0.0012 + aa, dj));
      ratio *= 1.0 + near * (1.0 - smoothstep(0.0012, 0.0055 + aa, dj)) * clamp(-dot(lq, dn) * sign(lv), -1.0, 1.0) * 0.2;
    }
    vec2 gq = uv / 0.55 + rnd;
    float gr = cmHash(floor(gq) + 41.3);
    vec2 gc = fract(gq) - 0.2 - 0.6 * vec2(cmHash(floor(gq) + 3.1), cmHash(floor(gq) + 7.7));
    // gum trodden flat: no two the same shape, paler as it ages, with the grit in it
    float gs = 0.02 + 0.02 * fract(gr * 9.0);
    float gum = step(0.86, gr) * (1.0 - smoothstep(gs * 0.7, gs * 1.5, length(gc * vec2(1.0, 0.75 + 0.5 * fract(gr * 5.0))) + (g.b - 0.5) * 0.03 + (c.a - 0.5) * 0.05));
    ratio *= 1.0 - gum * (0.34 - 0.2 * fract(gr * 17.0)) * (0.75 + 0.5 * g.b);
#else
    float dist = c.r * 0.04;
    float crack = step(0.82, fract(rnd * 19.3)) * smoothstep(0.42, 0.55, c.b) * (1.0 - smoothstep(0.0012, 0.0032 + fa * 0.8, dist));
    ratio *= 1.0 - 0.7 * crack;
    vec2 gq = uv / 0.55 + rnd;
    vec2 gi = floor(gq);
    float gr = cmHash(gi + 41.3);
    vec2 gc = fract(gq) - 0.2 - 0.6 * vec2(cmHash(gi + 3.1), cmHash(gi + 7.7));
    float gum = step(0.86, gr) * (1.0 - smoothstep(0.022 + 0.02 * fract(gr * 9.0), 0.04 + 0.03 * fract(gr * 9.0), length(gc) + (g.b - 0.5) * 0.03));
    ratio *= 1.0 - 0.34 * gum;
#endif
  }
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** loose ground: gravel, sand, cinders, bare earth */
export const CM_LOOSE = /* glsl */ `
${HARD_HEAD}
void main() {
  ${HARD_MAIN}
  // how coarse: the table's speckle says gravel (0.3 and up), sand or soil (below)
  float coarse = smoothstep(0.2, 0.34, vV.w) ;
  float sc = mix(5.0, 1.8, coarse);
  vec4 s0 = CMT(tStones, uv * sc, sc);
  vec2 ld = uSunDir.xz / max(uSunDir.y, 0.25);
  float fine = 1.0 - smoothstep(CM_LIM * 0.3, CM_LIM * 0.5, fa);
  vec4 s1 = fine > 0.0 ? CMT(tStones, uv * sc + ld * 0.012, sc) : s0;
  vec4 g = fine > 0.0 ? mix(vec4(0.5), CMT(tGrain, uv * 1.667, 1.667), fine) : vec4(0.5);
  vec4 c = fine > 0.0 ? CMT(tCrack, uv * 0.39, 0.39) : vec4(0.5);
  float st = smoothstep(0.05, 0.3, s0.r);
  float id = s0.g;
  vec3 tone = vec3(0.7 + 0.62 * id);
  tone *= mix(vec3(1.0), vec3(1.12, 1.0, 0.86), step(0.6, fract(id * 7.3)));
  tone = mix(tone, vec3(1.5), step(0.9, fract(id * 13.7)) * coarse);
  vec3 ratio = mix(vec3(0.42 + 0.3 * g.b), tone, st);
  float rel = (s0.b - s1.b) * 2.4 * fine * uDaylight * smoothstep(0.02, 0.3, uSunDir.y);
  ratio *= 1.0 + clamp(-rel, -0.35, 0.4) + (s0.b - 0.3) * 0.3;
  vec2 sl = (g.rg - 0.5) * 0.7;
  ratio *= cmLight(N, normalize(N - vec3(sl.x, 0.0, sl.y)));
  ratio *= 0.88 + 0.24 * c.b;
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** decking and boardwalks */
export const CM_DECK = /* glsl */ `
${HARD_HEAD}
void main() {
  ${HARD_MAIN}
  vec2 size = vPp.xy;
  vec2 cell, lo;
  float edge;
  cmSlab(p, uv, frame, size, cell, edge, lo);
  float rnd = cmHash(cell + 5.3);
  vec2 fu = vec2(uv.x / 1.2 + rnd * 7.0, uv.y / 0.3 + rnd * 11.0);
  vec4 f = textureGrad(tFibre, fu, gx * vec2(0.833, 3.33), gy * vec2(0.833, 3.33));
  vec4 c = CMT(tCrack, uv * 0.39 + rnd * 5.0, 0.39);
  vec2 s = (f.rg - 0.5) * 0.85;
  float light = cmLight(N, normalize(N - TX * s.x - TZ * s.y));
  vec3 ratio = vec3(light * (1.0 + (f.b - 0.5) * 0.38) * (1.0 - 0.38 * f.a));
  // weathered silver over the old brown, worn pale where people walk
  float grey = smoothstep(0.4, 0.68, c.b + (rnd - 0.5) * 0.5);
  float lum = dot(vCl, vec3(0.3, 0.59, 0.11));
  ratio = mix(ratio, ratio * (vec3(lum * 1.1) / max(vCl, vec3(0.05))), grey * 0.7);
  // fastenings at the joists: two screws across each board every 0.6 m, each with a dark stain
  vec2 nq = vec2((fract(uv.x / 0.6 + rnd) - 0.5) * 0.6, edge);
  float nail = (1.0 - smoothstep(0.003, 0.005, length(vec2(nq.x, nq.y - 0.03))));
  float stain = (1.0 - smoothstep(0.004, 0.018 + 0.016 * f.b, length(vec2(nq.x * 0.5, nq.y - 0.03))));
  ratio *= (1.0 - 0.34 * nail) * (1.0 - 0.14 * stain);
  // a shake opening at the board's end
  ratio *= 1.0 - 0.55 * step(0.8, fract(rnd * 7.1)) * (1.0 - smoothstep(0.0, 0.002 + fa, abs(fract(uv.y / size.y) - 0.5 - 0.1 * (f.b - 0.5))));
  ratio *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.012, edge));
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** everything else built from boxes and tubes, by what its colour says it is: wood, metal under paint, stone or render. */
export const CM_SOLID = /* glsl */ `
varying vec3 vCol;
varying vec3 vGr;
#ifdef CM_MATCLASS
varying float vWhat;
#endif
// a coordinate in the plane of the face: along the grain, across it
void main() {
  vec3 N = normalize(vN);
#ifdef CM_MATFRAME
  // the coordinate lies in the facet, not along the smoothed normal: on anything round that normal turns across the facet, and P being
  // hundreds of metres from the origin, the turn multiplied the texture many times over, with a mirrored seam where it stood still
  vec3 Nf = cross(dFdx(vP), dFdy(vP));
  float Nl = length(Nf);
  Nf = Nl > 1e-12 ? Nf / Nl : N;
  if (dot(Nf, N) < 0.0) Nf = -Nf;
  vec3 G = normalize(vGr.xyz - Nf * dot(vGr.xyz, Nf) + vec3(1e-5));
  vec3 C = cross(Nf, G);
#else
  vec3 G = normalize(vGr.xyz - N * dot(vGr.xyz, N) + vec3(1e-5));
  vec3 C = cross(N, G);
#endif
  vec2 q = vec2(dot(vP, G), dot(vP, C));
  gx = dFdx(q);
  gy = dFdy(q);
  float fa = cmArea(gx, gy);
  if (fa >= CM_LIM) discard;
  float k = 1.0 - smoothstep(CM_LIM * 0.45, CM_LIM, fa);
  vec3 col = max(vCol, vec3(0.01));
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
  float sat = (mx - mn) / max(mx, 0.02);
  // warm mid-to-dark browns are timber; the rest is paint on metal when dark or saturated, mineral when pale and grey
  float wood = step(0.28, sat) * step(col.b, col.g) * step(col.g, col.r) * step(0.03, lum) * step(lum, 0.42) * step(col.g, col.r * 0.82);
  float paint = (1.0 - wood) * max(step(0.3, sat), step(lum, 0.12));
  float smoothPiece = 0.0;
#if defined(CM_MATCLASS) && !defined(CM_JOINERY) && !defined(CM_RUST)
  // these colours are linear: sandstone reads as sat 0.46, green over red 0.8, and a paint red under 0.3 or an ochre over sat 0.9. The guess is for what can't say
  float what = floor(vWhat + 0.5);
  if (what < 0.5) {
    wood = step(0.28, sat) * step(sat, 0.9) * step(col.b, col.g) * step(col.r * 0.3, col.g) * step(col.g, col.r * 0.72) * step(0.02, lum) * step(lum, 0.42);
    paint = (1.0 - wood) * max(step(0.6, sat), step(lum, 0.12));
  } else {
    wood = 1.0 - step(0.5, abs(what - 1.0));
    paint = 1.0 - step(0.5, abs(what - 2.0));
    smoothPiece = step(3.5, what);
  }
#endif
#ifdef CM_JOINERY
  wood *= step(lum, 0.06);
  paint = 1.0 - wood;
#endif
#ifdef CM_RUST
  paint = 1.0;
  wood = 0.0;
#ifdef CM_WEARRUST
  // the platform's steps, edges and bricks share a mesh with its railings (these colours are linear, so a warm grey reads as sat 0.2):
  // pale is mineral, warm brown is brick or timber, and neither rusts
  if (lum > 0.18 || (lum > 0.06 && col.b <= col.g && col.g < col.r * 0.7)) paint = 0.0;
#endif
#endif
  vec3 ratio;
  vec4 c = CMT(tCrack, q * 0.39 + vGr.xz * 3.0, 0.39);
#if !defined(CM_JOINERY) && !defined(CM_RUST)
  // planter soil (props/furniture.ts gives it away with blue just over green): crumbs and damp, and the brown it was meant to be
  if (col.b > col.g && col.b < col.r * 0.85) {
    vec4 s0 = CMT(tStones, q * 3.1, 3.1);
    vec4 s2 = CMT(tStones, q.yx * 7.3 + 0.37, 7.3);
    float tone = mix(0.66, 0.76 + 0.56 * s0.g, smoothstep(0.02, 0.3, s0.a)) * mix(0.5, 0.74 + 0.6 * s2.g, smoothstep(0.05, 0.34, s2.r));
    ratio = vec3(0.98, 1.0, 0.72) * tone * (0.8 + 0.36 * c.b);
    vec2 sl = (CMT(tGrain, q * 1.667, 1.667).rg - 0.5) * 0.8;
    ratio *= cmLight(N, normalize(N - vec3(sl.x, 0.0, sl.y)));
    gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
    return;
  }
#endif
  if (smoothPiece > 0.5) {
    // moulded, glazed: the odd scuff and nothing that belongs to a mineral or to paint
    vec4 g = CMT(tGrain, q * 1.667, 1.667);
    vec2 s = (g.rg - 0.5) * 0.05;
    ratio = vec3(cmLight(N, normalize(N - G * s.x - C * s.y)) * (1.0 + (c.b - 0.5) * 0.05));
  } else if (wood > 0.5) {
    vec2 fu = vec2(q.x / 1.2, q.y / 0.3);
    vec4 f = textureGrad(tFibre, fu, gx * vec2(0.833, 3.33), gy * vec2(0.833, 3.33));
    vec2 s = (f.rg - 0.5) * 0.7;
    float light = cmLight(N, normalize(N - G * s.x - C * s.y));
    ratio = vec3(light * (1.0 + (f.b - 0.5) * 0.3) * (1.0 - 0.34 * f.a));
    ratio *= mix(vec3(1.0), vec3(1.1, 1.06, 1.0), smoothstep(0.45, 0.8, c.b));
  } else {
    vec4 g = CMT(tGrain, q * 1.667, 1.667);
    if (paint > 0.5) {
      vec2 fu = vec2(q.x / 1.2, q.y / 0.3);
      vec4 f = textureGrad(tFibre, fu, gx * vec2(0.833, 3.33), gy * vec2(0.833, 3.33));
      vec4 cs = CMT(tCrack, q * 1.3 + vGr.xz * 5.0, 1.3);
      float fl = cs.a * 0.62 + c.b * 0.26 + g.b * 0.12;
      float chip = smoothstep(0.73, 0.745 + fa, fl);
      float rim = smoothstep(0.69, 0.73, fl) * (1.0 - chip);
#ifdef CM_RUST
      // enamel on steel: orange peel, a scratch, rust where it has chipped, weeping below
      vec2 s = (g.rg - 0.5) * 0.16;
      ratio = vec3(cmLight(N, normalize(N - G * s.x - C * s.y)));
      ratio *= 1.0 + (f.b - 0.5) * 0.08;
#ifdef CM_WEARRUST
      vec3 rc = mix(vec3(0.075, 0.04, 0.024), vec3(0.17, 0.08, 0.038), g.b) * (1.0 - 0.3 * g.a);
      ratio = mix(ratio, min(rc / col, vec3(3.0)), chip);
      ratio *= mix(vec3(1.0), vec3(0.92, 0.82, 0.7), smoothstep(0.6, 0.71, fl) * (1.0 - chip));
      // weeping below the chip, down the face if the face has a down
      vec2 dq = vec2(G.y, C.y);
      if (dot(dq, dq) > 0.1) {
        float flU = CMT(tCrack, (q + normalize(dq) * (0.04 + 0.05 * g.b)) * 1.3 + vGr.xz * 5.0, 1.3).a * 0.62 + c.b * 0.26 + g.b * 0.12;
        ratio *= mix(vec3(1.0), vec3(0.84, 0.7, 0.56), smoothstep(0.66, 0.76, flU) * (1.0 - chip) * 0.6);
      }
#else
      vec3 rc = mix(vec3(0.05, 0.033, 0.021), vec3(0.1, 0.062, 0.036), g.b) * (1.0 - 0.3 * g.a);
      ratio = mix(ratio, min(rc / col, vec3(3.0)), chip);
      ratio *= mix(vec3(1.0), vec3(0.92, 0.82, 0.7), smoothstep(0.6, 0.71, fl) * (1.0 - chip));
#endif
#else
      // gloss paint on joinery: the grain and the brush show through; where it has chipped, the primer, then old wood
#ifdef CM_MATCLASS
      // (the fibre on a door five metres wide read as brushed steel)
      vec2 s = (f.rg - 0.5) * 0.03 + (g.rg - 0.5) * 0.05;
      ratio = vec3(min(cmLight(N, normalize(N - G * s.x - C * s.y)), 1.1));
      ratio *= 1.0 + (f.b - 0.5) * 0.015;
#else
      vec2 s = (f.rg - 0.5) * 0.1 + (g.rg - 0.5) * 0.05;
      ratio = vec3(min(cmLight(N, normalize(N - G * s.x - C * s.y)), 1.1));
      ratio *= 1.0 + (f.b - 0.5) * 0.04;
#endif
      chip *= smoothstep(0.74, 0.8, fl);
      float dustK = smoothstep(0.3, 0.08, lum) * (0.05 + 0.14 * smoothstep(0.3, 0.8, c.b) + 0.16 * (1.0 - smoothstep(0.0, 1.4, vP.y))) * (0.6 + 0.8 * g.b);
      ratio = mix(ratio, vec3(0.24, 0.23, 0.215) / col, clamp(dustK, 0.0, 1.0));
      vec3 under = mix(vec3(0.3, 0.27, 0.22), vec3(0.42, 0.4, 0.36), smoothstep(0.76, 0.86, fl)) * (0.7 + 0.6 * f.b);
      ratio = mix(ratio, min(under / col, vec3(3.0)), chip);
#endif
      ratio *= 1.0 + 0.12 * rim;
    } else {
      vec2 s = (g.rg - 0.5) * 0.5;
      ratio = vec3(cmLight(N, normalize(N - G * s.x - C * s.y)) * (1.0 + (g.b - 0.5) * 0.2) * (1.0 - 0.3 * g.a));
      ratio *= 0.93 + 0.14 * c.b;
#ifdef CM_FISSURE
      ratio *= cmFissure(c, q * 0.39 + vGr.xz * 3.0, 0.39, smoothstep(0.58, 0.74, c.b) * 0.7, fa, normalize(vec2(uSunDir.x * G.x + uSunDir.y * G.y + uSunDir.z * G.z, uSunDir.x * C.x + uSunDir.y * C.y + uSunDir.z * C.z) + 1e-3), (g.b - 0.5) * 0.002);
#else
      float dist = c.r * 0.04;
      ratio *= 1.0 - 0.5 * smoothstep(0.6, 0.72, c.b) * (1.0 - smoothstep(0.0008, 0.0022 + fa * 0.8, dist));
#endif
    }
  }
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** road paint: thin on the stones, gone from their tops where the wheels run */
export const CM_PAINT = /* glsl */ `
void main() {
  vec3 N = normalize(vN);
  vec2 p = vP.xz;
  gx = dFdx(p);
  gy = dFdy(p);
  float fa = cmArea(gx, gy);
  if (fa >= CM_LIM) discard;
  float k = 1.0 - smoothstep(CM_LIM * 0.45, CM_LIM, fa);
  float fine = 1.0 - smoothstep(CM_LIM * 0.3, CM_LIM * 0.5, fa);
  vec4 g = fine > 0.0 ? mix(vec4(0.5), CMT(tGrain, p * 1.667, 1.667), fine) : vec4(0.5);
  vec4 c = CMT(tCrack, p * 0.39, 0.39);
  vec2 sq = p * 1.8 + (g.rg - 0.5) * 0.035;
  vec4 s0 = CMT(tStones, sq, 1.8);
  vec2 ld = uSunDir.xz / max(uSunDir.y, 0.25);
  vec4 s1 = fine > 0.0 ? CMT(tStones, sq + ld * 0.0035, 1.8) : s0;
  float rel = (s0.b - s1.b) * 1.5 * fine * uDaylight * smoothstep(0.02, 0.3, uSunDir.y);
  vec3 ratio = vec3(1.0 + clamp(-rel, -0.2, 0.2));
  ratio *= 0.9 + 0.2 * smoothstep(0.1, 0.4, s0.r);
  // worn: dark where the binder shows through, in patches
  float wear = smoothstep(0.42, 0.72, c.b + (g.b - 0.5) * 0.5);
  float gone = wear * smoothstep(0.42, 0.2, s0.r + (0.5 - s0.b) * 0.3);
  ratio *= 1.0 - 0.72 * gone;
  ratio *= 1.0 - 0.3 * g.a;
#ifdef CM_FISSURE
  ratio *= cmFissure(c, p * 0.39, 0.39, smoothstep(0.54, 0.74, c.b), fa, normalize(uSunDir.xz + 1e-3), (g.b - 0.5) * 0.003);
#else
  float dist = c.r * 0.04;
  ratio *= 1.0 - 0.5 * smoothstep(0.56, 0.72, c.b) * (1.0 - smoothstep(0.0008, 0.002 + fa * 0.8, dist));
#endif
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** sand: grains, wind ripples, the marks of feet and the odd bit of shell. The wet edge and its colour stay with the base */
export const CM_SAND = /* glsl */ `
void main() {
  vec3 N = normalize(vN);
  vec2 p = vP.xz;
  gx = dFdx(p);
  gy = dFdy(p);
  float fa = cmArea(gx, gy);
  if (fa >= CM_LIM) discard;
  float k = 1.0 - smoothstep(CM_LIM * 0.45, CM_LIM, fa);
  float fine = 1.0 - smoothstep(CM_LIM * 0.3, CM_LIM * 0.5, fa);
  vec4 c = CMT(tCrack, p * 0.39, 0.39);
  vec4 g = CMT(tGrain, p * 1.667, 1.667);
  // the ripples run across the wind and wander; trampled where people go
  float trod = smoothstep(0.42, 0.64, c.b);
#ifdef CM_FISSURE
  vec2 cj = c.ba;
#else
  vec2 cj = c.gb;
#endif
  vec2 rq = p + (cj - 0.5) * 1.6;
  float ph = dot(rq, vec2(0.86, 0.5)) * 7.5 + g.b * 1.4;
  float rip = cos(ph) * (1.0 - trod);
  // the grain, in two sizes: sand is not one colour
  vec2 sl = (g.rg - 0.5) * 0.9 + vec2(0.86, 0.5) * rip * 0.16;
  // dimples of old footprints
  sl += (cj - 0.5) * 0.35 * trod;
  vec3 ratio = vec3(cmLight(N, normalize(N - vec3(sl.x, 0.0, sl.y))));
  ratio *= 1.0 + (g.b - 0.5) * 0.14;
  if (fine > 0.0) {
    vec4 s0 = CMT(tStones, p * 9.0, 9.0);
    float id = s0.g;
    vec3 tone = vec3(0.86 + 0.3 * id);
    tone *= mix(vec3(1.0), vec3(1.08, 1.0, 0.86), step(0.5, fract(id * 7.3)));
    tone = mix(tone, vec3(0.5, 0.46, 0.42), step(0.9, fract(id * 3.1)));
    tone = mix(tone, vec3(1.14), step(0.97, fract(id * 13.7)));
    ratio *= mix(vec3(1.0), mix(vec3(0.84), tone, smoothstep(0.05, 0.3, s0.r)), fine);
    // a shell, a bit of weed
    vec4 s1 = CMT(tStones, p * 1.1 + 3.7, 1.1);
    float shell = step(0.965, fract(s1.g * 11.3)) * smoothstep(0.32, 0.4, s1.r) * fine;
    ratio = mix(ratio, vec3(1.35, 1.3, 1.2) * (0.7 + 0.6 * s1.b), shell);
  }
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;
