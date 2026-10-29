// Shared material for all boats. Two InstancedMeshes use it (big: ferry/tug/tour boat, small:
// sailboat/motorboat/rowing shell); each holds several models, the vertex shader keeps only
// the instance's variant (aKind = tag + 100·variant, aBoat.x = variant). Per-vertex tags drive
//   * tinted hull paint (instanceColor), sail / shirt colour (aCol2)
//   * sails: boom/jib rotation about the mast / tack, camber (fill) and luffing flutter
//   * rowing: oars sweep + feather about their oarlocks, rowers swing fore and aft
//   * flags wave; emissive cabin windows at night, navigation-light lenses
// Per-instance: aBoat = (variant, boom angle, luff 0..1, rowing phase)
//               aBoat2 = (camber −1..1, lights 0..1, jib angle, coloured-sail mix)

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';

export const BT = {
  PLAIN: 0,
  TINT: 1,
  WINDOW: 2,
  GLASS: 3,
  LAMP_R: 4,
  LAMP_G: 5,
  LAMP_W: 6,
  /** mainsail cloth: aExtra = (u, v, mast z, 0) */
  SAIL: 7,
  /** jib cloth: aExtra = (u, v, tack z, 0) */
  JIB: 8,
  /** oar: aExtra = (pivot x, pivot y, pivot z, side) */
  OAR: 9,
  /** rower torso/head/arms: aExtra = (hip y, hip z, 0, 0) */
  ROWER: 10,
  /** boom (rotates with the mainsail): aExtra.z = mast z */
  BOOM: 11,
  LAMP_WARM: 12,
  /** flag cloth: aExtra = (u along the fly, 0, 0, 0) */
  FLAG: 13,
  /** coloured part taking aCol2 (shirts, sail stripes, seats) */
  ACCENT: 14,
  /** netting (creels): holes discarded near the camera */
  NET: 15,
} as const;

/** surface-detail classes, stored as tag + HC_STEP·class (tags stay < HC_STEP):
 *  STEEL = welded hull plating (strakes, butts, frame dishing, scuppers with rust streaks, waterline grime),
 *  GRP = moulded hull (scum line, fender scuffs), SUPER = steel deckhouse walls (panel seams, streaks under
 *  the windows), DECK = welded steel deck (plate grid, worn paths, rust pits). aExtra.x on these vertices = deck-edge (hull) or window-sill (deckhouse) height. */
export const HC = { NONE: 0, STEEL: 1, GRP: 2, SUPER: 3, DECK: 4 } as const;
export const HC_STEP = 20;

/** jib tack and head (sailboat model, local) — the jib swings about the forestay line between them */
export const JIB_TACK: [number, number, number] = [0, 1.15, 3.25];
export const JIB_HEAD: [number, number, number] = [0, 7.6, 1.75];
const JA = new THREE.Vector3(JIB_HEAD[0] - JIB_TACK[0], JIB_HEAD[1] - JIB_TACK[1], JIB_HEAD[2] - JIB_TACK[2]).normalize();
const f3 = (v: number) => v.toFixed(5);

const COMMON = /* glsl */ `
attribute float aKind;
attribute vec4 aExtra;
attribute vec4 aBoat;
attribute vec4 aBoat2;
uniform float uTime;
int btRaw(float k) { int r = int(k + 0.5); return r - (r / 100) * 100; }
int btTag(float k) { int r = btRaw(k); return r - (r / ${HC_STEP}) * ${HC_STEP}; }
bool btHidden(float k) { int vm = int(k + 0.5) / 100; return vm != int(aBoat.x + 0.5); }
vec3 btRotY(vec3 p, vec2 c, float a) {
  float cs = cos(a), sn = sin(a);
  vec2 q = vec2(p.x - c.x, p.z - c.y);
  return vec3(c.x + q.x * cs + q.y * sn, p.y, c.y - q.x * sn + q.y * cs);
}
vec3 btRotAxis(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
const vec3 JIB_T = vec3(${f3(JIB_TACK[0])}, ${f3(JIB_TACK[1])}, ${f3(JIB_TACK[2])});
const vec3 JIB_K = vec3(${f3(JA.x)}, ${f3(JA.y)}, ${f3(JA.z)});
vec3 btAnimate(vec3 p, int tg) {
  if (tg == ${BT.SAIL} || tg == ${BT.BOOM}) {
    if (tg == ${BT.SAIL}) {
      float u = aExtra.x, v = aExtra.y;
      float bulge = sin(3.14159 * u) * (1.0 - 0.55 * v);
      p.x += aBoat2.x * 0.42 * bulge;
      float fl = aBoat.z * (0.12 + 0.3 * u) * sin(uTime * 11.0 + u * 7.0 + v * 5.0);
      p.x += fl * (1.0 - 0.6 * v);
    }
    return btRotY(p, vec2(0.0, aExtra.z), aBoat.y);
  }
  if (tg == ${BT.JIB}) {
    float u = aExtra.x, v = aExtra.y;
    float bulge = sin(3.14159 * u) * (1.0 - 0.5 * v);
    p.x += aBoat2.x * 0.3 * bulge;
    p.x += aBoat.z * (0.1 + 0.35 * u) * sin(uTime * 12.5 + u * 8.0 + v * 3.0);
    return JIB_T + btRotAxis(p - JIB_T, JIB_K, aBoat2.z);
  }
  if (tg == ${BT.OAR}) {
    float ph = aBoat.w;
    float side = aExtra.w;
    // sweep: catch (blades aft... toward the bow of a stern-facing rower) → finish
    float sweep = 0.55 * sin(ph);
    vec3 piv = aExtra.xyz;
    vec3 q = p - piv;
    float cs = cos(sweep * side), sn = sin(sweep * side);
    q = vec3(q.x * cs + q.z * sn, q.y, -q.x * sn + q.z * cs);
    // blade dips during the drive (cos > 0), lifts on the recovery
    float reach = clamp(abs(q.x) / 2.6, 0.0, 1.0);
    q.y += (-0.22 * max(0.0, cos(ph)) + 0.18 * max(0.0, -cos(ph))) * reach;
    return piv + q;
  }
  if (tg == ${BT.ROWER}) {
    float lean = 0.42 * sin(aBoat.w);
    vec2 hip = aExtra.xy;
    vec2 q = vec2(p.y - hip.x, p.z - hip.y);
    float cs = cos(lean), sn = sin(lean);
    q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
    return vec3(p.x, hip.x + q.x, hip.y + q.y);
  }
  if (tg == ${BT.FLAG}) {
    float u = aExtra.x;
    p.x += 0.12 * u * sin(uTime * 7.0 - u * 6.0);
    return p;
  }
  return p;
}
`;

const VERT_PARS = /* glsl */ `
${COMMON}
attribute vec3 aCol2;
uniform float uLights;
varying vec3 vEmit;
varying float vTagF;
varying vec3 vLoc;
varying vec3 vLocN;
varying vec3 vHC;
varying float vExY;
`;

const VERT_COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
  vColor *= color;
#elif defined( USE_COLOR )
  vColor.rgb *= color;
#endif
{
  int tg = btTag(aKind);
  #ifdef USE_INSTANCING_COLOR
  if (tg == ${BT.TINT}) vColor.rgb *= instanceColor.rgb;
  #endif
  if (tg == ${BT.ACCENT}) vColor.rgb *= aCol2;
  if (tg == ${BT.SAIL}) vColor.rgb = mix(vColor.rgb, vColor.rgb * aCol2, aBoat2.w);
}
`;

const VERT_BEGIN = /* glsl */ `
{
  int tg = btTag(aKind);
  transformed = btAnimate(transformed, tg);
  if (btHidden(aKind)) transformed = vec3(0.0);
  vTagF = float(tg);
  // surface detail: model-space position / normal, (class, deck-edge or sill height, per-boat seed)
  vLoc = position;
  vLocN = normal;
  vExY = aExtra.y;
  vHC = vec3(float(btRaw(aKind) / ${HC_STEP}), aExtra.x, fract(sin(float(gl_InstanceID) * 12.9898 + aBoat.x * 4.13) * 43758.5453));
  float lit = uLights * aBoat2.y;
  vec3 e = vec3(0.0);
  if (tg == ${BT.WINDOW}) e = vec3(1.0, 0.8, 0.5) * 1.5 * lit;
  else if (tg == ${BT.LAMP_R}) e = vec3(1.0, 0.08, 0.05) * (0.15 + 3.0 * lit);
  else if (tg == ${BT.LAMP_G}) e = vec3(0.1, 1.0, 0.35) * (0.15 + 3.0 * lit);
  else if (tg == ${BT.LAMP_W}) e = vec3(1.0, 0.95, 0.85) * (0.1 + 3.0 * lit);
  else if (tg == ${BT.LAMP_WARM}) e = vec3(1.0, 0.78, 0.45) * (0.05 + 2.4 * lit);
  vEmit = e;
}
`;


const FRAG_PARS = /* glsl */ `
varying vec3 vEmit;
varying float vTagF;
varying vec3 vLoc;
varying vec3 vLocN;
varying vec3 vHC;
varying float vExY;
uniform float uBoatDetail;
uniform float uDaylight;
float bH = 0.0;
vec3 bN = vec3(0.0, 0.0, 1.0); // view-space normal, set in main (vNormal is declared after these pars)
float bRough = -1.0;
float bh1(float n) { return fract(sin(n) * 43758.5453); }
float bh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bn2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh2(i), bh2(i + vec2(1.0, 0.0)), f.x), mix(bh2(i + vec2(0.0, 1.0)), bh2(i + 1.0), f.x), f.y);
}
float bfbm(vec2 p) { return bn2(p) * 0.55 + bn2(p * 2.07 + 3.7) * 0.3 + bn2(p * 4.31 + 7.1) * 0.15; }
// distance (m) to the nearest line of a family spaced s apart, offset o
float bLine(float x, float s, float o) { return (0.5 - abs(fract((x + o) / s) - 0.5)) * s; }
// a streak hanging from height top at column centre cx: 1 at the top fading over L, width growing downward
float bStreak(float u, float y, float cx, float top, float L, float w0) {
  float t = top - y;
  if (t < 0.0 || t > L) return 0.0;
  float w = w0 * (1.0 + 1.6 * t / L);
  float k = 1.0 - smoothstep(w * 0.35, w, abs(u - cx));
  return k * (1.0 - t / L) * (0.55 + 0.45 * bn2(vec2(u * 30.0, y * 4.0)));
}
// applies the class detail to the albedo, sets bH (bump height, m) and bRough
// a glimpse into a saloon behind a side window (aExtra.xy = pane bottom / top): the opposite windows bright,
// a ceiling light strip, seat backs and the odd head below, a soft sky sheen on top
vec3 boatWindow(vec3 col) {
  float h = vExY - vHC.y;
  if (h <= 0.05 || uBoatDetail < 0.5) return col;
  float v = clamp((vLoc.y - vHC.y) / h, 0.0, 1.0);
  float u = abs(vLocN.z) > 0.7 ? vLoc.x : vLoc.z;
  float seed = vHC.z * 13.0;
  vec3 c = col * 0.8;
  c = mix(c, vec3(0.42, 0.5, 0.56), 0.55 * smoothstep(0.32, 0.4, v) * (1.0 - smoothstep(0.8, 0.86, v)));
  c = mix(c, vec3(0.75, 0.74, 0.7), 0.5 * smoothstep(0.9, 0.95, v));
  float cell = floor(u / 0.75);
  float fu = fract(u / 0.75);
  float back = 0.36 + 0.06 * sin(fu * 3.14159);
  c = mix(c, vec3(0.12, 0.16, 0.24) + 0.05 * bh1(cell), step(v, back) * step(0.1, fu) * step(fu, 0.9));
  float head = bh1(cell * 3.7 + seed);
  if (head < 0.35) {
    vec2 q = vec2((fu - 0.5) * 0.75 / 0.11, (v * h - (back * h + 0.13)) / 0.13);
    c = mix(c, mix(vec3(0.55, 0.4, 0.3), vec3(0.18, 0.13, 0.1), step(0.5, bh1(cell + 9.0))), 1.0 - smoothstep(0.8, 1.0, length(q)));
  }
  return mix(c, vec3(0.6, 0.7, 0.78), 0.18 * v);
}
// glazing seen from outside: the dim interior through the pane (a far window band, the frame of the opposite
// side) under a reflection of the sky / shore picked by the reflected ray's elevation, Fresnel-weighted, with a
// faint dirty film toward the bottom edge — never a flat black hole
vec3 boatGlass(vec3 inside, float v) {
  vec3 n = normalize(bN);
  vec3 vd = normalize(vViewPosition);
  if (dot(n, vd) > 0.0) n = -n;
  float c = clamp(-dot(n, vd), 0.0, 1.0);
  float F = 0.06 + 0.94 * pow(1.0 - c, 5.0);
  vec3 r = reflect(vd, n);
  float ry = dot(r, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
  vec3 sky = mix(vec3(0.66, 0.74, 0.8), vec3(0.42, 0.58, 0.78), smoothstep(0.05, 0.7, ry));
  vec3 shore = mix(vec3(0.3, 0.33, 0.32), vec3(0.55, 0.6, 0.62), smoothstep(-0.25, 0.05, ry));
  vec3 refl = mix(shore, sky, smoothstep(-0.02, 0.06, ry)) * mix(0.08, 1.0, uDaylight);
  float k = (0.32 + 0.6 * F) * (0.85 + 0.15 * bn2(vLoc.xz * 3.0 + vLoc.y));
  vec3 g = mix(inside, refl, k);
  return mix(g, g * 0.8 + vec3(0.04, 0.04, 0.035), smoothstep(0.25, 0.0, v) * 0.5);
}
vec3 boatSurface(vec3 col) {
  int tgS = int(vTagF + 0.5);
  if ((tgS == ${BT.SAIL} || tgS == ${BT.JIB}) && uBoatDetail > 0.5) {
    // F4 (judge 2 "flat sheets, no seams or battens"): cross-cut panels with stitched overlaps, tapes along luff,
    // leech and foot, layered patches at head / tack / clew, batten pockets (main), telltales, a class insignia,
    // a faint crinkle of the laminate. u = luff → leech, v = foot → head (aExtra of the cloth grid)
    bool main = tgS == ${BT.SAIL};
    float su = vHC.y, sv = vExY;
    float Hs = main ? 7.8 : 6.6;
    float chord = (main ? 3.1 : 2.7) * pow(1.0 - sv, 1.1) + 0.12;
    float x = su * chord, y = sv * Hs;
    float nearS = 1.0 - smoothstep(30.0, 80.0, length(vViewPosition));
    float sy = (y + x * 0.12) / 0.95;
    float d = min(fract(sy), 1.0 - fract(sy)) * 0.95;
    float seam = 1.0 - smoothstep(0.003, 0.009, d);
    float lap = step(fract(sy), 0.026);
    col *= 0.975 + 0.04 * bh1(floor(sy) * 7.3 + (main ? 0.0 : 3.0));
    col *= 1.0 - nearS * (0.05 * lap + 0.13 * seam);
    float edge = max(max(1.0 - smoothstep(0.03, 0.05, x), 1.0 - smoothstep(0.02, 0.04, chord - x)), 1.0 - smoothstep(0.03, 0.05, y));
    col *= 1.0 - 0.12 * edge;
    // corner patches (two layers, the inner one smaller)
    float pt = min(length(vec2(x, y)), min(length(vec2(chord - x, y)), Hs - y + x * 0.3));
    col *= 1.0 - 0.06 * (1.0 - smoothstep(0.42, 0.45, pt)) - 0.05 * (1.0 - smoothstep(0.24, 0.27, pt));
    if (main) {
      // four batten pockets from the leech, longer higher up
      for (int k = 1; k <= 4; k++) {
        float bv = float(k) * 0.2;
        float by = bv * Hs;
        float bl = 0.55 + 0.12 * float(k);
        float inB = step(chord - x, bl) * (1.0 - smoothstep(0.03, 0.045, abs(y - by - (chord - x) * 0.05)));
        float rim = inB * smoothstep(0.02, 0.035, abs(y - by - (chord - x) * 0.05));
        col = mix(col, col * 1.04 + 0.01, inB * 0.6);
        col *= 1.0 - 0.1 * rim * nearS;
      }
      // class insignia: a red chevron pair high on the sail
      vec2 q = vec2(x - chord * 0.42, y - Hs * 0.8);
      float chev = abs(q.y - (0.18 - abs(q.x) * 0.6));
      float ins = step(abs(q.x), 0.28) * (step(chev, 0.035) + step(abs(chev - 0.12), 0.035));
      col = mix(col, vec3(0.62, 0.08, 0.07), min(ins, 1.0) * 0.9);
    } else {
      // telltales: wool tufts a hand's width behind the luff, red on one side, green the other
      for (int k = 1; k <= 3; k++) {
        float ty = float(k) * 0.25 * Hs;
        float tt = 1.0 - step(0.035, length(vec2(x - 0.3, (y - ty) * 0.6)));
        col = mix(col, gl_FrontFacing ? vec3(0.7, 0.08, 0.06) : vec3(0.08, 0.5, 0.15), tt * nearS);
      }
    }
    col *= 0.97 + 0.05 * bn2(vec2(x, y) * 9.0) * nearS;
    return col;
  }
  if (int(vTagF + 0.5) == ${BT.GLASS} && uBoatDetail > 0.5) {
    // wheelhouse: console + a figure-less dark interior with the far windows light (v = height on the pane)
    float h = max(0.05, vExY - vHC.y);
    float v = clamp((vLoc.y - vHC.y) / h, 0.0, 1.0);
    vec3 inside = col * 0.9;
    inside = mix(inside, vec3(0.36, 0.42, 0.46), 0.45 * smoothstep(0.35, 0.45, v) * (1.0 - smoothstep(0.88, 0.95, v)));
    inside = mix(inside, vec3(0.08, 0.09, 0.1), step(v, 0.22));
    return boatGlass(inside, vExY > vHC.y ? v : 0.5);
  }
  if (int(vTagF + 0.5) == ${BT.WINDOW}) return uBoatDetail > 0.5 ? boatGlass(boatWindow(col), clamp((vLoc.y - vHC.y) / max(0.05, vExY - vHC.y), 0.0, 1.0)) : col;
  if (int(vTagF + 0.5) == ${BT.NET}) {
    // 4 cm netting: knotted cords, the holes cut out near the camera (far: a darker see-through tint)
    vec3 an = abs(vLocN);
    vec2 q = (an.x > an.y && an.x > an.z ? vLoc.zy : an.y > an.z ? vLoc.xz : vLoc.xy) / 0.04;
    vec2 f = abs(fract(q) - 0.5);
    float cord = step(0.36, max(f.x, f.y));
    float d = length(vViewPosition);
    if (cord < 0.5 && d < 25.0) discard;
    return col * mix(0.55, 1.0, cord);
  }
  int hc = int(vHC.x + 0.5);
  if (hc == 0 || uBoatDetail < 0.5) return col;
  float dist = length(vViewPosition);
  float near = 1.0 - smoothstep(18.0, 45.0, dist);
  float seed = vHC.z * 17.0;
  float y = vLoc.y;
  // along-hull coordinate: z on the sides, x on the transom / deckhouse ends
  float u = abs(vLocN.z) > 0.7 ? vLoc.x : vLoc.z;
  float top = vHC.y;
  if (hc == 1) {
    // plating: 1.05 m strakes, staggered butts every 3.4 m, frames every 0.55 m (dished "hungry horse" plates)
    float sy = (y + 3.0) / 1.05;
    float ks = floor(sy);
    float dS = bLine(y + 3.0, 1.05, 0.0);
    float dB = bLine(u, 3.4, bh1(ks * 3.1) * 3.4);
    float weld = max(1.0 - smoothstep(0.006, 0.016, dS), 1.0 - smoothstep(0.006, 0.016, dB)) * near;
    float fz = fract(u / 0.55);
    float dish = sin(3.14159 * fz) * sin(3.14159 * fract(sy));
    bH = (-0.006 * dish + 0.0022 * weld) * near;
    col *= 1.0 - 0.16 * weld;
    // paint touch-ups and fading
    float pn = bfbm(vec2(u, y * 1.6) * 0.8 + seed);
    col *= 0.94 + 0.1 * pn;
    if (pn > 0.66) col = mix(col, col * vec3(1.05, 1.02, 0.97) + 0.015, 0.6 * smoothstep(0.66, 0.7, pn));
    // scuppers below the deck edge, rust streaks running down from them and from the plate seams
    float cell = floor(u / 1.25 + seed);
    float cx = (cell - seed + 0.5 + 0.3 * (bh1(cell * 1.7) - 0.5)) * 1.25;
    float sc = top - 0.16;
    float rust = 0.0;
    if (bh1(cell * 7.3 + seed) < 0.55) {
      float hole = (1.0 - step(0.07, abs(u - cx))) * (1.0 - step(0.035, abs(y - sc)));
      col = mix(col, vec3(0.05, 0.045, 0.04), hole * near);
      rust = bStreak(u, y, cx, sc, 0.45 + 1.4 * bh1(cell * 5.1), 0.04);
    }
    rust = max(rust, weld * 0.25 * bn2(vec2(u * 3.0, y * 9.0) + seed));
    // chipped paint along the deck edge (fenders, quays)
    float chip = smoothstep(0.62, 0.7, bn2(vec2(u * 7.0, y * 11.0) + seed)) * smoothstep(top - 0.45, top - 0.1, y);
    rust = max(rust, chip * 0.8);
    col = mix(col, vec3(0.36, 0.17, 0.07), clamp(rust, 0.0, 1.0) * 0.75);
    // waterline: green-brown growth and a dirty band, ragged by the swell
    float wl = 0.06 + 0.22 * bfbm(vec2(u * 0.9, seed));
    float g = 1.0 - smoothstep(-0.02, wl, y);
    col = mix(col, vec3(0.16, 0.18, 0.09), 0.7 * g);
    col *= 1.0 - 0.18 * (1.0 - smoothstep(wl, wl + 0.5, y));
    bRough = 0.55 + 0.3 * max(rust, g);
  } else if (hc == 2) {
    // moulded GRP: a yellow-brown scum line at the waterline, grey fender scuffs amidships
    float wl = 0.03 + 0.05 * bn2(vec2(u * 2.0, seed));
    float g = 1.0 - smoothstep(-0.01, wl, y);
    col = mix(col, vec3(0.42, 0.38, 0.22) * col + vec3(0.05, 0.05, 0.02), 0.6 * g);
    float sc = smoothstep(0.6, 0.85, bfbm(vec2(u * 3.0, y * 9.0) + seed)) * smoothstep(0.08, 0.3, y) * (1.0 - smoothstep(1.2, 2.2, abs(u)));
    col *= 1.0 - 0.22 * sc * near;
    bRough = 0.32 + 0.3 * g;
  } else if (hc == 4) {
    // steel deck: 1.5 × 4 m plates, paint worn to primer and rust along the walkways and at the plate joints
    vec2 p = vLoc.xz;
    float dX = bLine(p.x, 1.5, 0.75), dZ = bLine(p.y, 4.0, bh1(floor(p.x / 1.5 + 0.5)) * 4.0);
    float weld = max(1.0 - smoothstep(0.006, 0.016, dX), 1.0 - smoothstep(0.006, 0.016, dZ)) * near;
    bH = 0.002 * weld;
    float wn = bfbm(p * 1.3 + seed);
    float walk = smoothstep(0.55, 0.8, wn) * (1.0 - smoothstep(0.3, 1.0, abs(abs(p.x) - 0.9)));
    col = mix(col, col * 0.62 + vec3(0.05, 0.04, 0.03), 0.5 * walk);
    float pit = smoothstep(0.8, 0.86, bn2(p * 14.0 + seed) * 0.6 + bfbm(p * 0.9 + seed) * 0.4) * near;
    col = mix(col, vec3(0.34, 0.17, 0.08), max(pit * 0.45, weld * 0.3));
    col *= 0.9 + 0.12 * bn2(p * 23.0);
    bRough = 0.75;
  } else {
    // steel deckhouse: welded panel seams, dirt streaks from the window corners
    float dP = bLine(u, 1.2, 0.0);
    float seam = (1.0 - smoothstep(0.005, 0.014, dP)) * near;
    bH = 0.0015 * seam * near;
    col *= 1.0 - 0.1 * seam;
    float cell = floor(u / 0.6 + seed);
    float cx = (cell - seed + 0.25 + 0.5 * bh1(cell * 2.3)) * 0.6;
    float st = bh1(cell * 9.1 + seed) < 0.6 ? bStreak(u, y, cx, top - 0.02, 0.35 + 0.9 * bh1(cell * 3.7), 0.05) : 0.0;
    col = mix(col, col * vec3(0.62, 0.58, 0.52), st * 0.6);
    bRough = 0.6 + 0.2 * st;
  }
  return col;
}
`;

export interface BoatMaterials {
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
}

/** ?noboatdetail (or quality low) turns the shader surface detail off */
export function createBoatMaterials(globals: GlobalUniforms, detail = true): BoatMaterials {
  const detailU = { value: detail ? 1 : 0 };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide });
  material.name = 'boats';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uLights = globals.uLights;
    shader.uniforms.uBoatDetail = detailU;
    shader.uniforms.uDaylight = globals.uDaylight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        {
          int tg = btTag(aKind);
          float ra = (tg == ${BT.SAIL} || tg == ${BT.BOOM}) ? aBoat.y : 0.0;
          if (tg == ${BT.SAIL} || tg == ${BT.JIB}) objectNormal = normalize(objectNormal - vec3(0.0, 0.0, aBoat2.x * 0.35 * cos(3.14159 * aExtra.x)));
          if (ra != 0.0) objectNormal = btRotY(objectNormal, vec2(0.0), ra);
          if (tg == ${BT.JIB}) objectNormal = btRotAxis(objectNormal, JIB_K, aBoat2.z);
        }`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BEGIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nbN = vNormal;\ndiffuseColor.rgb = boatSurface(diffuseColor.rgb);')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (bH != 0.0) {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(bH), hy = dFdy(bH);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        { int tg = int(vTagF + 0.5); if (tg == ${BT.GLASS} || tg == ${BT.WINDOW}) roughnessFactor = 0.15; if (tg == ${BT.SAIL} || tg == ${BT.JIB} || tg == ${BT.FLAG}) roughnessFactor = 0.85; if (bRough >= 0.0) roughnessFactor = bRough; }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit;');
  };
  material.customProgramCacheKey = () => 'boats-v4';

  const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depth.name = 'boats-depth';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = btAnimate(transformed, btTag(aKind));\nif (btHidden(aKind)) transformed = vec3(0.0);');
  };
  depth.customProgramCacheKey = () => 'boats-depth-v2';
  return { material, depth };
}
