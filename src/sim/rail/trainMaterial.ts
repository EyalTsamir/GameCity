// Shared material for all rolling stock (one InstancedMesh per car type). Per-vertex tags
// (aKind) + per-instance data drive:
//   * livery / container colours (instanceColor, aCol2) on tagged parts only
//   * wheel rotation about each axle (aExtra.xy = axle y, z) by aInst.x
//   * sliding doors on the platform side (aExtra.z = slide dir, aExtra.w = side) by aInst.z
//   * container load variants (40 ft / 2×20 ft / one 20 ft / empty) via aInst2.x
//   * emissive: lit windows at night, head lights (leading end), tail lights (trailing end),
//     destination display
//   * tunnel clip: fragments beyond the bore ends are discarded (uClip.x .. uClip.y in world x)

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { patchLampMaterial } from '../../world/lamps/integrate';

export const T = {
  PLAIN: 0,
  LIVERY: 1,
  WHEEL: 2,
  DOOR: 3,
  WINDOW: 4,
  HEAD: 5,
  TAIL: 6,
  DEST: 7,
  CONT40: 8,
  CONT20A: 9,
  CONT20B: 10,
  DOORWIN: 11,
  GLASS: 12,
  /** the open doorway's back (vestibule seen through it): ray-traced like the windows, aExtra.x = door centre z */
  VESTIB: 13,
  /** the open-door push button on a leaf: slides with it, its ring lit green while the doors are released */
  DOORBTN: 14,
  /** container corrugated faces (same visibility as CONT*, plus ribs) handled via CONT tags */
} as const;

// livery decal atlas cells (px; drawn by decalTexture below)
export const DECAL = {
  logo: [8, 8, 1008, 112],
  digit0: [8, 136], // 10 cells of 60 × 104, pitch 64
  wheel: [8, 264, 112, 112],
  bike: [136, 264, 112, 112],
  lean: [264, 264, 112, 112],
  hv: [392, 264, 112, 112],
  release: [520, 264, 112, 112],
  data: [8, 392, 496, 112],
  stripe: [520, 392, 496, 112],
} as const;

const VERT_PARS = /* glsl */ `
attribute float aKind;
attribute vec4 aExtra;
attribute vec4 aInst;
attribute vec4 aInst2;
attribute vec3 aCol2;
uniform float uLights;
uniform float uTime;
varying vec3 vEmit;
varying float vWX;
varying vec3 vLoc;
varying float vTagF;
varying vec3 vLocDir;
varying float vDoorZ;
varying vec3 vCar;
varying vec3 vAxY;
varying vec3 vAxZ;
vec3 trWheel(vec3 p) {
  float c = cos(aInst.x), s = sin(aInst.x);
  vec2 q = p.yz - aExtra.xy;
  return vec3(p.x, aExtra.x + q.x * c - q.y * s, aExtra.y + q.x * s + q.y * c);
}
bool trHidden(int tg) {
  int load = int(aInst2.x + 0.5);
  if (tg == ${T.CONT40}) return load != 0;
  if (tg == ${T.CONT20A}) return !(load == 1 || load == 2);
  if (tg == ${T.CONT20B}) return load != 1;
  return false;
}
int trTagOf(float k) { int r = int(k + 0.5); return r - (r / 100) * 100; }
bool trVariantHidden(float k) {
  int vm = int(k + 0.5) / 100;
  if (vm == 1) return aInst2.z < 0.5;
  if (vm == 2) return aInst2.z > 0.5;
  return false;
}
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
  int tg = trTagOf(aKind);
  #ifdef USE_INSTANCING_COLOR
  if (tg == ${T.LIVERY} || tg == ${T.CONT40} || tg == ${T.CONT20A} || (tg == ${T.DOOR} && color.r > 0.6)) vColor.rgb *= instanceColor.rgb;
  #endif
  if (tg == ${T.CONT20B}) vColor.rgb *= aCol2;
}
`;

const VERT_BEGIN = /* glsl */ `
{
  int tg = trTagOf(aKind);
  if (tg == ${T.WHEEL}) transformed = trWheel(transformed);
  if ((tg == ${T.DOOR} || tg == ${T.DOORWIN} || tg == ${T.DOORBTN}) && abs(aExtra.w - aInst.w) < 0.5) {
    float o = clamp(aInst.z, 0.0, 1.0);
    transformed.z += aExtra.z * 0.64 * smoothstep(0.15, 1.0, o);
    transformed.x += aExtra.w * 0.035 * smoothstep(0.0, 0.2, o);
  }
  if (trHidden(tg) || trVariantHidden(aKind)) transformed = vec3(0.0);
  vLoc = position;
  vTagF = aKind;
  vCar = vec3(aInst2.y, aInst2.z, aInst2.w);
  int role = int(aInst.y + 0.5);
  float lit = uLights;
  vec3 e = vec3(0.0);
  // door centre for the vestibule; −1e5 flags an open leaf (its window then lies over the body, no saloon behind)
  vDoorZ = tg == ${T.VESTIB} ? aExtra.x : tg == ${T.DOORWIN} && aInst.z > 0.1 && abs(aExtra.w - aInst.w) < 0.5 ? -1e5 : 1e4;
  if (tg == ${T.WINDOW} || tg == ${T.DOORWIN} || tg == ${T.VESTIB}) e = vec3(1.0, 0.8, 0.52) * (1.7 * lit) * min(aInst2.y, 1.0);
  else if (tg == ${T.HEAD} && role == 1) e = vec3(1.0, 0.95, 0.85) * (0.9 + 4.0 * lit);
  else if (tg == ${T.TAIL} && role == 2) e = vec3(1.0, 0.07, 0.03) * (0.7 + 2.6 * lit);
  else if (tg == ${T.DOORBTN} && color.g > color.r * 2.0) e = vec3(0.15, 1.0, 0.3) * (aInst.z > 0.05 ? 1.6 + 2.0 * lit : 0.0);
  else if (tg == ${T.DEST} && role == 1) e = vec3(1.0, 0.62, 0.16) * (0.9 + 0.6 * lit);
  vEmit = e;
}
`;

const FRAG_PARS = /* glsl */ `
uniform vec2 uClip;
uniform float uGrime;
uniform float uLights;
uniform float uTrInt;
varying vec3 vEmit;
varying float vWX;
varying vec3 vLoc;
varying float vTagF;
varying vec3 vLocDir;
varying float vDoorZ;
varying vec3 vCar;
varying vec3 vAxY;
varying vec3 vAxZ;
float trPaint = 0.0;
uniform sampler2D uTrDecal;
uniform float uTrDec;
vec3 trIntE = vec3(0.0);
float trDecA = 0.0;
// atlas cell r (px x, y, w, h; y down) at local l (0..1, y up) with the gradients of l; premultiplied rgba, 0 outside
vec4 trDec(vec4 r, vec2 l, vec2 dx, vec2 dy) {
  vec2 sc = r.zw / vec2(1024.0, -512.0);
  vec2 uv = vec2(r.x / 1024.0, 1.0 - (r.y + r.w) / 512.0) + l * abs(sc);
  vec4 c = textureGrad(uTrDecal, uv, dx * abs(sc), dy * abs(sc));
  return c * (step(0.0, l.x) * step(l.x, 1.0) * step(0.0, l.y) * step(l.y, 1.0));
}
vec4 trOver(vec4 a, vec4 b) { return b + a * (1.0 - b.a); }
// EMU side lettering in the car frame: u runs left → right as seen from the side, y up
vec4 trLivery(vec3 q, float unit) {
  float sd = sign(q.x);
  vec2 sp = vec2(-q.z * sd, q.y);
  vec2 gx = dFdx(sp), gy = dFdy(sp);
  vec2 fx = dFdx(q.xy), fy = dFdy(q.xy);
  vec4 o = vec4(0.0);
  // cab front: the unit number under the windscreen on the nose face (z = 7.75, cab cars only)
  if (vCar.y > 0.5 && q.z > 7.74 && abs(q.x) < 1.2) {
    vec2 l = vec2(q.x / 0.62 + 0.5, (q.y - 1.93) / 0.13 + 0.5);
    float ci = floor(l.x * 3.0);
    float d = mod(floor(unit / pow(10.0, 2.0 - ci)), 10.0);
    vec2 sc = vec2(3.0 * 64.0 / 60.0 / 0.62, 1.0 / 0.13);
    if (l.x >= 0.0 && l.x < 1.0) o = trDec(vec4(${DECAL.digit0[0]}.0 + d * 64.0, ${DECAL.digit0[1]}.0, 60.0, 104.0), vec2(fract(l.x * 3.0) * 64.0 / 60.0, l.y), fx * sc, fy * sc);
    return o;
  }
  // a decal of height h centred at (zc, yc): local coords from the side position
  #define TR_L(zc, yc, w, h) (vec2((-(q.z - (zc)) * sd) / (w) + 0.5, (q.y - (yc)) / (h) + 0.5))
  #define TR_G(w, h) gx / vec2(w, h), gy / vec2(w, h)
  if (abs(q.x) < 1.44 || abs(q.x) > 1.52) return o;
  // operator name between the doors on the lower band
  o = trOver(o, trDec(vec4(${DECAL.logo.join('.0, ')}.0), TR_L(-0.425, 1.6, 3.24, 0.36), TR_G(3.24, 0.36)));
  // fleet number "442 nnn" + technical data at the rear end
  {
    vec2 l = TR_L(-6.0, 1.74, 0.95, 0.2);
    float ci = floor(l.x * 7.0);
    float d = ci < 0.5 ? 4.0 : ci < 1.5 ? 4.0 : ci < 2.5 ? 2.0 : ci < 3.5 ? -1.0 : mod(floor(unit / pow(10.0, 6.0 - ci)), 10.0);
    if (d >= 0.0 && l.x >= 0.0 && l.x < 1.0)
      o = trOver(o, trDec(vec4(${DECAL.digit0[0]}.0 + d * 64.0, ${DECAL.digit0[1]}.0, 60.0, 104.0), vec2(fract(l.x * 7.0) * 64.0 / 60.0, l.y), gx * vec2(7.0 * 64.0 / 60.0 / 0.95, 1.0 / 0.2), gy * vec2(7.0 * 64.0 / 60.0 / 0.95, 1.0 / 0.2)));
  }
  o = trOver(o, trDec(vec4(${DECAL.data.join('.0, ')}.0), TR_L(-6.0, 1.33, 0.71, 0.16), TR_G(0.71, 0.16)));
  // pictograms by the doors, the emergency release beside each portal, the HV triangle at the car ends
  o = trOver(o, trDec(vec4(${DECAL.wheel.join('.0, ')}.0), TR_L(-3.0, 1.86, 0.22, 0.22), TR_G(0.22, 0.22)));
  o = trOver(o, trDec(vec4(${DECAL.bike.join('.0, ')}.0), TR_L(2.15, 1.86, 0.22, 0.22), TR_G(0.22, 0.22)));
  for (int k = 0; k < 2; k++) {
    float dz = k == 0 ? -3.975 : 3.125;
    o = trOver(o, trDec(vec4(${DECAL.release.join('.0, ')}.0), TR_L(dz - 0.9, 1.62, 0.12, 0.12), TR_G(0.12, 0.12)));
    // no-leaning stickers on both leaves (the leaf frame moves with the leaf: q is pre-slide)
    for (int j = 0; j < 2; j++)
      o = trOver(o, trDec(vec4(${DECAL.lean.join('.0, ')}.0), TR_L(dz + (j == 0 ? -0.33 : 0.33), 2.33, 0.14, 0.14), TR_G(0.14, 0.14)));
  }
  for (int k = 0; k < 2; k++)
    o = trOver(o, trDec(vec4(${DECAL.hv.join('.0, ')}.0), TR_L(k == 0 ? -7.35 : 7.35, 3.03, 0.16, 0.16), TR_G(0.16, 0.16)));
  #undef TR_L
  #undef TR_G
  return o;
}
float trEmK = 1.0;
float trVN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453), c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453), d = fract(sin(dot(i + 1.0, vec2(12.9898, 78.233))) * 43758.5453); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float trH(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
// Saloon behind the glass, ray-traced in the car frame (interior mapping; no geometry): far wall with its
// window band, floor, ceiling with the light strip, seat backs in 1.9 m bays with a few seated heads, yellow
// grab poles in the vestibule. Returns the colour lit as daylight / cabin light, darkened with depth.
// distance to the interior surface the window shows (cars with real seated passengers write its depth: F2)
float trHitT = -1.0;
uniform mat4 projectionMatrix;
vec3 trInterior(vec3 o, vec3 d, float doorZ) {
  const float FL = 1.13, CE = 3.2, WX = 1.36;
  float sx = -sign(o.x);
  float tW = (sx * WX - o.x) / d.x;
  float tF = d.y < 0.0 ? (FL - o.y) / d.y : 1e9;
  float tC = d.y > 0.0 ? (CE - o.y) / d.y : 1e9;
  float t = min(tW, min(tF, tC));
  vec3 p = o + d * t;
  vec3 col;
  if (t == tF) col = vec3(0.16, 0.17, 0.19) * (0.85 + 0.3 * trH(floor(p.x * 9.0) + floor(p.z * 9.0) * 57.0));
  else if (t == tC) col = abs(p.x) < 0.16 ? vec3(1.5, 1.45, 1.35) : vec3(0.55, 0.56, 0.55);
  else {
    // far side: wall panels, the window band shows the bright outside through the far glass
    bool win = p.y > 2.05 && p.y < 2.95 && fract(p.z / 1.9 + 0.12) < 0.82 && abs(p.z - doorZ) > 0.75;
    col = win ? vec3(0.62, 0.72, 0.82) * 2.6 : (p.y < 1.25 ? vec3(0.2, 0.21, 0.23) : vec3(0.46, 0.46, 0.45));
  }
  // seat backs (both sides of the aisle, transverse) at the bay planes ahead of the ray
  if (abs(d.z) > 1e-3) {
    for (int k = 0; k < 3; k++) {
      float bay = floor(o.z / 1.9) + (d.z > 0.0 ? 1.0 + float(k) : -float(k));
      float zn = bay * 1.9;
      float ts = (zn - o.z) / d.z;
      if (ts <= 0.02 || ts >= t) continue;
      vec3 q = o + d * ts;
      float ax = abs(q.x);
      if (abs(q.z - doorZ) < 0.9) continue;
      float h = trH(bay * 7.0 + sign(q.x) * 3.0);
      // a seated passenger's head over the back (by bay + side)
      vec2 hd = vec2((ax - 0.95) / 0.095, (q.y - 2.4) / 0.13);
      if (h > 0.55 && vCar.x < 1.5 && dot(hd, hd) < 1.0) {
        // hair over the crown and the back of the head (we mostly see heads from behind / the side)
        float hair = step(0.35 - 0.5 * fract(h * 13.0), hd.y) + step(0.6, fract(h * 5.3));
        col = hair > 0.5 ? vec3(0.07, 0.05, 0.04) + 0.25 * vec3(0.9, 0.7, 0.4) * fract(h * 3.7) : vec3(0.55, 0.4, 0.32) * (0.6 + 0.5 * h);
        t = ts;
        break;
      }
      // seat back above the cushion (under it only the pedestal at the wall side: the floor shows between)
      if (ax > 0.38 && ax < WX && q.y < FL + 1.15 && (q.y > FL + 0.42 || (ax > 1.15 && q.y > FL))) {
        float top = smoothstep(FL + 1.08, FL + 1.15, q.y);
        col = mix(vec3(0.12, 0.2, 0.34), vec3(0.06, 0.08, 0.1), top) * (0.9 + 0.2 * trH(floor(q.x * 30.0) + floor(q.y * 30.0) * 31.0));
        if (ax > 0.86 && ax < 0.9) col *= 0.6;
        t = ts;
        break;
      }
    }
  }
  // grab poles in the vestibule: two by the door edges, one in the middle
  if (doorZ < 1e3) {
    vec2 o2 = o.xz, d2 = d.xz;
    float dd = dot(d2, d2);
    for (int k = 0; k < 3; k++) {
      vec2 c = k == 0 ? vec2(0.0, doorZ) : vec2(-sx * 1.12, doorZ + (k == 1 ? -0.8 : 0.8));
      float tp = dot(c - o2, d2) / dd;
      if (tp > 0.0 && tp < t && length(o2 + d2 * tp - c) < 0.022) {
        float yy = o.y + d.y * tp;
        if (yy < CE) { col = vec3(0.85, 0.68, 0.12); t = tp; }
      }
    }
  }
  trHitT = t;
  return col * (1.0 - 0.45 * clamp((t - 0.5) / 3.0, 0.0, 1.0));
}
`;

// ───────────────────────────────────────────── livery decals (W2 s6)
// One 1024×512 canvas atlas, sampled in the car frame (no UVs): operator name + emblem, fleet-number digits,
// pictograms (wheelchair, bicycle, no-leaning, HV warning, door-release), technical data panel. Cells (px):

let decalTex: THREE.CanvasTexture | null = null;
function decalTexture(): THREE.Texture {
  if (decalTex) return decalTex;
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const x = cv.getContext('2d')!;
  x.clearRect(0, 0, 1024, 512);
  // operator: emblem (a ring with a wave) + "TINYHAVEN" wordmark + a small "regional" tag
  {
    const [lx, ly, , lh] = DECAL.logo;
    const cy = ly + lh / 2;
    x.fillStyle = '#fff';
    x.strokeStyle = '#fff';
    x.lineWidth = 9;
    x.beginPath();
    x.arc(lx + 56, cy, 44, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 8;
    x.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const px = lx + 22 + t * 68,
        py = cy + 6 + Math.sin(t * Math.PI * 2) * 10;
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    x.stroke();
    x.fillRect(lx + 38, cy - 26, 36, 8);
    x.textBaseline = 'middle';
    x.font = 'bold 84px Arial, Helvetica, sans-serif';
    x.fillText('TINYHAVEN', lx + 124, cy + 4);
    const w = x.measureText('TINYHAVEN').width;
    x.font = 'italic 40px Arial, Helvetica, sans-serif';
    x.fillText('regional', lx + 140 + w, cy + 18);
  }
  // fleet-number digits (white, condensed)
  x.font = 'bold 100px "Arial Narrow", Arial, Helvetica, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let d = 0; d < 10; d++) {
    x.save();
    x.translate(DECAL.digit0[0] + d * 64 + 30, DECAL.digit0[1] + 54);
    x.scale(0.62, 1);
    x.fillText(String(d), 0, 0);
    x.restore();
  }
  const cell = (c: readonly number[], draw: (cx: number, cy: number, r: number) => void) => draw(c[0] + c[2] / 2, c[1] + c[3] / 2, c[2] / 2);
  // wheelchair: blue square, white symbol
  cell(DECAL.wheel, (cx, cy, r) => {
    x.fillStyle = '#1f5fbf';
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
    x.strokeStyle = '#fff';
    x.fillStyle = '#fff';
    x.lineWidth = 9;
    x.beginPath();
    x.arc(cx - 4, cy + 14, 26, 0.2, Math.PI * 1.8);
    x.stroke();
    x.beginPath();
    x.arc(cx - 6, cy - 34, 9, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(cx - 8, cy - 20);
    x.lineTo(cx - 6, cy + 8);
    x.lineTo(cx + 22, cy + 8);
    x.lineTo(cx + 30, cy + 32);
    x.stroke();
  });
  // bicycle
  cell(DECAL.bike, (cx, cy, r) => {
    x.fillStyle = '#1f5fbf';
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
    x.strokeStyle = '#fff';
    x.lineWidth = 7;
    for (const s of [-1, 1]) {
      x.beginPath();
      x.arc(cx + s * 26, cy + 14, 18, 0, Math.PI * 2);
      x.stroke();
    }
    x.beginPath();
    x.moveTo(cx - 26, cy + 14);
    x.lineTo(cx - 6, cy - 14);
    x.lineTo(cx + 18, cy - 14);
    x.lineTo(cx + 26, cy + 14);
    x.moveTo(cx - 6, cy - 14);
    x.lineTo(cx + 2, cy + 14);
    x.lineTo(cx + 18, cy - 14);
    x.moveTo(cx - 10, cy - 24);
    x.lineTo(cx, cy - 24);
    x.moveTo(cx + 16, cy - 26);
    x.lineTo(cx + 26, cy - 22);
    x.stroke();
  });
  // no leaning on the doors: white disc, red ring + bar over a hand
  cell(DECAL.lean, (cx, cy, r) => {
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(cx, cy, r - 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#222';
    x.fillRect(cx - 14, cy - 22, 28, 40);
    for (let i = 0; i < 4; i++) x.fillRect(cx - 14 + i * 7.5, cy - 38, 5, 18);
    x.fillRect(cx + 14, cy - 10, 10, 6);
    x.strokeStyle = '#d0201c';
    x.lineWidth = 11;
    x.beginPath();
    x.arc(cx, cy, r - 9, 0, Math.PI * 2);
    x.moveTo(cx - 34, cy - 34);
    x.lineTo(cx + 34, cy + 34);
    x.stroke();
  });
  // high-voltage warning triangle
  cell(DECAL.hv, (cx, cy, r) => {
    x.fillStyle = '#111';
    x.beginPath();
    x.moveTo(cx, cy - r + 2);
    x.lineTo(cx + r - 2, cy + r - 10);
    x.lineTo(cx - r + 2, cy + r - 10);
    x.closePath();
    x.fill();
    x.fillStyle = '#f2c230';
    x.beginPath();
    x.moveTo(cx, cy - r + 18);
    x.lineTo(cx + r - 16, cy + r - 18);
    x.lineTo(cx - r + 16, cy + r - 18);
    x.closePath();
    x.fill();
    x.fillStyle = '#111';
    x.beginPath();
    x.moveTo(cx + 6, cy - 22);
    x.lineTo(cx - 12, cy + 8);
    x.lineTo(cx + 2, cy + 8);
    x.lineTo(cx - 6, cy + 34);
    x.lineTo(cx + 14, cy);
    x.lineTo(cx, cy);
    x.closePath();
    x.fill();
  });
  // emergency door release: red square, white handle mark
  cell(DECAL.release, (cx, cy, r) => {
    x.fillStyle = '#c8211b';
    x.fillRect(cx - r * 0.7, cy - r, r * 1.4, r * 2);
    x.fillStyle = '#fff';
    x.fillRect(cx - 10, cy - 30, 20, 44);
    x.beginPath();
    x.moveTo(cx - 22, cy + 18);
    x.lineTo(cx + 22, cy + 18);
    x.lineTo(cx, cy + 40);
    x.closePath();
    x.fill();
  });
  // technical data panel (small white lettering on the solebar end)
  {
    const [dx, dy] = DECAL.data;
    x.textAlign = 'left';
    x.textBaseline = 'top';
    x.fillStyle = '#fff';
    x.font = 'bold 24px Arial, Helvetica, sans-serif';
    x.fillText('94 80 0442 1 - 3   D-TH', dx + 6, dy + 4);
    x.font = '20px Arial, Helvetica, sans-serif';
    x.fillText('Tara 47,2 t    Vmax 160 km/h', dx + 6, dy + 36);
    x.fillText('Rev  TH 14.03.26   Bremse  R+Mg', dx + 6, dy + 62);
    x.fillRect(dx + 4, dy + 92, 300, 3);
  }
  // door edge stripe: yellow / black hazard bands
  {
    const [sx, sy, sw, sh] = DECAL.stripe;
    x.fillStyle = '#f2c230';
    x.fillRect(sx, sy, sw, sh);
    x.fillStyle = '#151515';
    for (let i = -4; i < 20; i++) {
      x.beginPath();
      x.moveTo(sx + i * 40, sy + sh);
      x.lineTo(sx + i * 40 + 20, sy + sh);
      x.lineTo(sx + i * 40 + 20 + sh, sy);
      x.lineTo(sx + i * 40 + sh, sy);
      x.closePath();
      x.fill();
    }
  }
  decalTex = new THREE.CanvasTexture(cv);
  decalTex.colorSpace = THREE.SRGBColorSpace;
  decalTex.anisotropy = 4;
  decalTex.premultiplyAlpha = true;
  decalTex.name = 'rail-decals';
  return decalTex;
}

export interface TrainMaterials {
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  clip: { value: THREE.Vector2 };
  /** saloon interior behind the glass: 1 on, 0 off (URL off → stays 0; quality low → 0, set by trainRender) */
  interior: { value: number };
  interiorUrlOff: boolean;
}

export function createTrainMaterials(globals: GlobalUniforms, clipX0: number, clipX1: number): TrainMaterials {
  const clip = { value: new THREE.Vector2(clipX0, clipX1) };
  // ?notraingrime: clean rolling stock (W2 real-things toggle)
  const grime = { value: typeof location !== 'undefined' && new URLSearchParams(location.search).has('notraingrime') ? 0 : 1 };
  // ?notraininterior: plain dark glass (the ray-traced saloon is also off on quality low — trainRender)
  const interior = { value: typeof location !== 'undefined' && new URLSearchParams(location.search).has('notraininterior') ? 0 : 1 };
  // ?notraindecals: no livery lettering / pictograms (W2 s6)
  const decals = { value: typeof location !== 'undefined' && new URLSearchParams(location.search).has('notraindecals') ? 0 : 1 };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.08 });
  material.name = 'rail-train';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = globals.uLights;
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uClip = clip;
    shader.uniforms.uGrime = grime;
    shader.uniforms.uTrInt = interior;
    shader.uniforms.uTrDecal = { value: decalTexture() };
    shader.uniforms.uTrDec = decals;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        { int tg = trTagOf(aKind); if (tg == ${T.WHEEL}) { float c = cos(aInst.x), s = sin(aInst.x); objectNormal = vec3(objectNormal.x, objectNormal.y * c - objectNormal.z * s, objectNormal.y * s + objectNormal.z * c); } }`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BEGIN}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          #endif
          vWX = (modelMatrix * wp).x;
          // camera ray in the car frame (rotations only, so the transpose inverts; a mirrored car too)
          mat3 mm = mat3(modelMatrix);
          #ifdef USE_INSTANCING
          mm = mm * mat3(instanceMatrix);
          #endif
          vLocDir = transpose(mm) * ((modelMatrix * wp).xyz - cameraPosition);
          // the car's y and z axes in view space (body panel waviness tilts the normal along them)
          mat3 mv = mat3(viewMatrix) * mm;
          vAxY = normalize(mv * vec3(0.0, 1.0, 0.0));
          vAxZ = normalize(mv * vec3(0.0, 0.0, 1.0));
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vWX < uClip.x || vWX > uClip.y) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          int tg = int(vTagF + 0.5); tg -= (tg / 100) * 100;
          // livery lettering (uniform control flow: the decal lookup takes screen derivatives)
          vec4 dec = trLivery(vLoc, vCar.z);
          if (vCar.x > 0.5 && uTrDec > 0.5 && (tg == ${T.LIVERY} || tg == ${T.PLAIN} || tg == ${T.DOOR} || tg == ${T.DOORWIN})) {
            diffuseColor.rgb = diffuseColor.rgb * (1.0 - dec.a) + dec.rgb;
            trDecA = dec.a;
          }
          // lacquered body paint: livery, door leaves, the cream side band (not the dark gaskets / seals)
          {
            float lum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
            bool side = abs(vLoc.x) > 1.4 && vLoc.y > 1.1 && vLoc.y < 3.4;
            if (vCar.x > 0.5 && lum > 0.12 && (tg == ${T.LIVERY} || (tg == ${T.DOOR} && side) || (tg == ${T.PLAIN} && side))) trPaint = 1.0;
          }
          if (tg == ${T.CONT40} || tg == ${T.CONT20A} || tg == ${T.CONT20B}) {
            // corrugated container walls: ribs every 0.28 m along the side, 0.2 m across the ends
            float along = abs(vLoc.x) > 1.18 ? vLoc.z : vLoc.x;
            float f = fract(along / 0.28);
            float rib = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.5, 0.62, f));
            float fw = fwidth(along);
            float amp = 1.0 - smoothstep(0.05, 0.16, fw);
            float top = step(2.6, vLoc.y - 1.2) * step(abs(vLoc.x), 1.18);
            diffuseColor.rgb *= 1.0 - (0.16 * rib * amp) * (1.0 - top);
          }
          if (uGrime > 0.5 && tg != ${T.WINDOW} && tg != ${T.DOORWIN} && tg != ${T.GLASS}) {
            // brake dust and track dirt: running gear rust-brown, a film up the lower body that fades with a noisy
            // edge, dust on the roof; weathering ages the rolling stock with the street around it
            vec3 q = vLoc;
            float n = fract(sin(dot(floor(q * vec3(3.0, 9.0, 1.3)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float gear = (1.0 - smoothstep(0.9, 1.05, q.y)) * step(abs(q.x), 1.3);
            float low = (1.0 - smoothstep(0.95, 1.55 + 0.15 * n, q.y)) * (1.0 - gear);
            // roof: brake / catenary dust in soft blotches (strong colours — insulators, lamps — keep theirs)
            vec3 bc = diffuseColor.rgb;
            float sat = max(bc.r, max(bc.g, bc.b)) - min(bc.r, min(bc.g, bc.b));
            float bl = trVN(q.xz * vec2(1.3, 0.45)) * 0.6 + trVN(q.xz * vec2(4.0, 1.6) + 7.0) * 0.4;
            float roof = smoothstep(3.3, 3.7, q.y) * (0.5 + 0.45 * bl) * (1.0 - smoothstep(0.12, 0.3, sat));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.235, 0.215), roof);
            // roof sheets: transverse seams every 1.55 m (welded strips over the hoops), fading with distance
            if (q.y > 3.5 && abs(q.x) < 1.4) {
              float fz = abs(fract(q.z / 1.55) - 0.5) * 1.55;
              float pw = fwidth(q.z);
              float seam = (1.0 - smoothstep(0.012, 0.012 + pw, 0.775 - fz)) * (1.0 - smoothstep(0.05, 0.12, pw));
              diffuseColor.rgb *= 1.0 - 0.35 * seam;
            }
            vec3 dust = vec3(0.33, 0.26, 0.2);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + dust * 0.35, gear * (0.55 + 0.25 * n));
            diffuseColor.rgb = mix(diffuseColor.rgb, dust * 0.9, low * (0.32 + 0.12 * n));
            // a long soft gradient of track dirt up the side, and rain streaks: run-off from the gutter over the
            // cant rail and from window sills, thin vertical runs that fade downwards (EMU / loco sides only)
            if (abs(q.x) > 1.38 && q.y < 3.4 && q.y > 1.0) {
              float up = 1.0 - smoothstep(1.0, 2.3, q.y);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.82 + dust * 0.12, up * 0.55);
              float zc = q.z * 14.0 + sign(q.x) * 31.0;
              float sa = trH(floor(zc)), sb = trH(floor(zc) + 1.0);
              float sn = mix(sa, sb, smoothstep(0.2, 0.8, fract(zc)));
              float gut = (1.0 - smoothstep(0.0, 0.12 + 0.55 * sn * sn, 3.34 - q.y)) * step(q.y, 3.34);
              float sl = trH(floor(q.z * 2.3) + 7.0);
              float sill = (1.0 - smoothstep(0.0, 0.1 + 0.6 * sn, 2.15 - q.y)) * step(q.y, 2.15) * step(0.45, sl) * step(0.35, sn);
              float st = clamp(gut * (0.5 + 0.5 * sn) + sill * 0.8, 0.0, 1.0);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62 + vec3(0.05, 0.045, 0.04), st * 0.45);
            }
          }
          if ((tg == ${T.WINDOW} || tg == ${T.DOORWIN} || tg == ${T.VESTIB}) && uTrInt > 0.5) {
            vec3 d = normalize(vLocDir);
            if (d.x * vLoc.x < 0.0 && vDoorZ > -1e4) {
              vec3 ic = trInterior(vLoc, d, vDoorZ);
              // daylight inside (dimmer than out), cabin lamps at night; the glass keeps its reflection
              trIntE = (ic * (0.1 * (1.0 - uLights)) + vEmit * (0.2 + 0.8 * ic)) * (1.0 - trDecA);
              trEmK = 0.0;
              diffuseColor.rgb *= tg == ${T.VESTIB} ? 0.0 : mix(0.45, 1.0, trDecA);
            }
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        { int tg = int(vTagF + 0.5); tg -= (tg / 100) * 100; if (tg == ${T.GLASS} || tg == ${T.WINDOW} || tg == ${T.DOORWIN}) roughnessFactor = 0.18; if (tg == ${T.VESTIB}) roughnessFactor = 1.0; if (tg == ${T.WHEEL}) roughnessFactor = 0.62; if (trPaint > 0.5) roughnessFactor = 0.26 + 0.3 * (1.0 - smoothstep(1.0, 2.0, vLoc.y)) * uGrime; }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // sheet-metal side: the skin bows a little between the body hoops (~0.78 m) and the reflection of the
          // sky swims over it — the cue that tells a painted car body from a plastic tube; fades with distance
          float pz = fwidth(vLoc.z);
          float P = 0.78;
          float k = trH(floor(vLoc.z / P) + 3.0 * sign(vLoc.x)) * 0.8 + 0.6;
          float sz = 0.016 * k * sin(6.2832 * vLoc.z / P) * (1.0 - smoothstep(0.03, 0.12, pz));
          float sy = 0.008 * sin(6.2832 * (vLoc.y - 1.15) / 1.1) * (1.0 - smoothstep(0.03, 0.12, pz));
          if (trPaint > 0.5) normal = normalize(normal + vAxZ * sz + vAxY * sy);
        }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit * trEmK + trIntE;')
      // cars with real seated passengers (aInst2.y = 2, pedestrians/occupants.ts): the window takes the depth of the
      // saloon surface behind it, so the figures inside show through the glass; every other fragment keeps its own
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
gl_FragDepth = gl_FragCoord.z;
if (vCar.x > 1.5 && trHitT > 0.0) {
  vec3 trMv = -vViewPosition;
  vec4 trCp = projectionMatrix * vec4(trMv * (1.0 + trHitT / length(trMv)), 1.0);
  gl_FragDepth = clamp(0.5 * trCp.z / trCp.w + 0.5, 0.0, 1.0);
}`,
      );
  };
  material.customProgramCacheKey = () => 'rail-train-v8';
  patchLampMaterial(material); // night street-light map (night agent)

  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'rail-train-depth';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uClip = clip;
    shader.uniforms.uGrime = grime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aKind;\nattribute vec4 aInst2;\nvarying float vWX;\nbool trHidden(int tg) { int load = int(aInst2.x + 0.5); if (tg == ${T.CONT40}) return load != 0; if (tg == ${T.CONT20A}) return !(load == 1 || load == 2); if (tg == ${T.CONT20B}) return load != 1; return false; }
bool trVariantHidden(float k) { int vm = int(k + 0.5) / 100; if (vm == 1) return aInst2.z < 0.5; if (vm == 2) return aInst2.z > 0.5; return false; }`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ int r = int(aKind + 0.5); if (trHidden(r - (r / 100) * 100) || trVariantHidden(aKind)) transformed = vec3(0.0); }')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          #endif
          vWX = (modelMatrix * wp).x;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uClip;\nvarying float vWX;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWX < uClip.x || vWX > uClip.y) discard;');
  };
  depth.customProgramCacheKey = () => 'rail-train-depth-v2';
  return { material, depth, clip, interior, interiorUrlOff: interior.value === 0 };
}
