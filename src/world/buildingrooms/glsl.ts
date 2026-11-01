// The program of the near-only rooms: one small quad over the glass of each window near the camera, added to what the facade drew. The
// facade fades its own interior out over the same distance (materials.ts, uCloseWin) and keeps the frame, the reveal and the reflection,
// so all the light of the room comes from here: a ray through the pane into a box the size of the room behind it, walls of 3D shelving
// from the atlas with their real relief, furniture standing on planes in the room, the lamp the room really has.
//
// The lit state, the colour of the light and the curtains are the facade's own decisions (same hashes on the same cell), so a window seen
// from afar and from here is the same window.

import { COMMON_FRAG } from '../buildings/materials';
import { CARD_RELIEF, MOD_H, MOD_RELIEF, MOD_W } from './pages';

const f = (v: number) => v.toFixed(3);

export const ROOM_VERT = /* glsl */ `
${COMMON_FRAG}
attribute vec2 aQ;      // this corner in the room's coordinates on the wall plane (x along the wall, y up from the room's floor)
attribute vec4 aRoom;   // width, height, depth, seed
attribute vec4 aRect;   // the opening in the room's coordinates: x0, x1, y0, y1
attribute vec4 aWin;    // the facade's cell: col, row, seed, kind (style * 8 + profile)
attribute vec4 aWalls;  // four wall pages to choose from
attribute vec4 aCards;  // mid-room card a, b; window card a, b
attribute vec4 aMisc;   // floor, lamp, chance of a mid-room card, chance of a window card
attribute vec3 aPaint;  // the walls' paint
attribute vec4 aDir;    // along the wall (x, z), cell width, cell height
attribute vec3 aGlass;  // the pane's tint
uniform float uCwRadius;
uniform vec3 uNearEye;
uniform float uNearLens;
varying vec3 vW;
varying vec2 vQ;
varying vec4 vRoom;
varying vec4 vRect;
varying vec4 vWalls;
varying vec4 vCards;
varying vec4 vMisc;
varying vec3 vPaint;
varying vec4 vDir;
varying vec4 vLit;      // lamp radiance (rgb), lit 0..1
varying vec4 vRnd;      // r1, r2, r3, u1
varying vec4 vKind;     // style, profile, shutter's lower edge (room y; 1e3 none), u2
varying vec3 vGlass;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vQ = aQ;
  vRoom = aRoom;
  vRect = aRect;
  vWalls = aWalls;
  vCards = aCards;
  vMisc = aMisc;
  vPaint = aPaint;
  vDir = aDir;
  vGlass = aGlass;
  vec2 cell = aWin.xy;
  float seed = aWin.z;
  float kind = floor(aWin.w + 0.5);
  float style = floor(mod(kind, 64.0) / 8.0 + 0.01);
  float prof = floor(mod(kind, 8.0) + 0.01);
  // the same decisions as the facade (bhWall)
  float r1 = bhHash13(vec3(cell, seed));
  float r2 = bhHash13(vec3(cell.yx + 17.0, seed * 1.37 + 5.0));
  float r3 = bhHash13(vec3(cell + 3.1, seed * 0.71 + 9.0));
  bool office = prof > 0.5 && prof < 1.5;
  vec2 unit = cell;
  if (office) unit = vec2(floor(cell.x / 4.0), cell.y);
  float u1 = bhHash13(vec3(unit, seed + 2.0));
  float u2 = bhHash13(vec3(unit.yx + 7.0, seed + 4.0));
  float hr = mod(uHours + (u2 - 0.5) * 1.6 + 24.0, 24.0);
  float occ = bhOccupancy(hr, prof);
  float lit = step(u1, occ);
  if (office) lit *= step(r3, 0.9);
  vec3 lcol = vec3(1.0, 0.5, 0.17);
  if (r2 > 0.72) lcol = vec3(1.0, 0.62, 0.28);
  if (r2 < 0.12) lcol = vec3(1.0, 0.42, 0.12);
  if (office) lcol = mix(vec3(0.62, 0.74, 0.95), vec3(1.0, 0.8, 0.5), r2);
  if (prof > 1.5 && prof < 2.5) lcol = vec3(1.0, 0.66, 0.32);
  if (prof > 2.5 && prof < 3.5) lcol = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.7, 0.4), r2);
  if (prof < 0.5 && r3 < 0.1) {
    float hh = mod(uHours + 24.0, 24.0);
    float tvOn = bhBump(hh < 12.0 ? hh + 24.0 : hh, 18.5, 19.0, 23.6, 24.4);
    float fl = 0.55 + 0.45 * sin(uTime * 7.3 + r1 * 40.0) * sin(uTime * 2.9 + r2 * 17.0);
    lcol = mix(lcol, vec3(0.35, 0.55, 1.0) * (0.6 + 0.7 * fl), tvOn);
  }
  float nightF = clamp(uLights * (0.42 + 0.58 * uNight), 0.0, 1.0);
  float glowI = mix(office ? 0.35 : 0.07, 2.7, nightF) * (0.75 + 0.5 * r2);
  if (prof > 1.5 && prof < 2.5) glowI *= 1.25;
  if (prof > 4.5 && prof < 5.5) glowI *= 1.1;
  float litI = lit * glowI;
  bool shopWin = style > 5.5 && style < 6.5;
  bool lobbyWin = style > 6.5 && aDir.w > 2.6 && prof > 4.5 && prof < 5.5;
  if (shopWin) litI = lit * mix(0.62 + 0.25 * r2, 0.9 + 0.25 * r2, nightF);
  if (lobbyWin) { litI = lit * mix(0.55 + 0.2 * r2, 0.85 + 0.2 * r2, nightF); lcol = vec3(1.0, 0.82, 0.6); }
  else if (style > 6.5) litI = lit * mix(0.5 + 0.2 * r2, 1.0 + 0.3 * r2, nightF);
  vLit = vec4(lcol * litI, lit);
  vRnd = vec4(r1, r2, r3, u1);
  // closed shops pull the roller shutter down (bhWall): nothing of the room shows on it
  float shutter = 1e3;
  if (shopWin) {
    float sh = bhHash12(vec2(seed, 4.4));
    float hs = mod(uHours + 24.0, 24.0);
    float open = step(sh * 0.5 + 0.25, bhOccupancy(hs, 2.0));
    float hasShutter = step(sh, 0.62);
    float halfD = (1.0 - step(0.5, fract(sh * 7.3))) * bhBump(hs, 6.2, 6.6, 8.2, 8.8);
    if (hasShutter * max(1.0 - open, halfD) > 0.5) shutter = mix(aRect.z - 0.01, aRect.z + (aRect.w - aRect.z) * 0.55, halfD);
  }
  vKind = vec4(style, prof, shutter, u2);
  // beyond the range it costs no pixels at all
  vec3 ey = vW - uNearEye;
  vec4 mv = viewMatrix * vec4(vW, 1.0);
  gl_Position = dot(ey, ey) > uCwRadius * uCwRadius * uNearLens * uNearLens * 1.21 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}
`;

export const ROOM_FRAG = /* glsl */ `
${COMMON_FRAG}
#define MOD_W ${f(MOD_W)}
#define MOD_H ${f(MOD_H)}
#define MOD_RELIEF ${f(MOD_RELIEF)}
#define CARD_RELIEF ${f(CARD_RELIEF)}
uniform sampler2D tWall;
uniform sampler2D tCard;
uniform vec4 uGridW;   // columns, rows, gutter x, gutter y (fractions of a cell)
uniform vec4 uGridC;
uniform vec3 uCwDay;   // what daylight at the pane does to an albedo
uniform vec3 uSunDir;
uniform vec3 uCwSun;   // direct sun on an albedo
uniform float uCwRadius;
uniform float uCwGm;   // the street mirror is on
uniform vec3 uNearEye;
uniform float uNearLens;
#ifdef CW_SUN
uniform highp sampler2DShadow tCwShadow;
uniform mat4 uCwSunM;
#endif
varying vec3 vW;
varying vec2 vQ;
varying vec4 vRoom;
varying vec4 vRect;
varying vec4 vWalls;
varying vec4 vCards;
varying vec4 vMisc;
varying vec3 vPaint;
varying vec4 vDir;
varying vec4 vLit;
varying vec4 vRnd;
varying vec4 vKind;
varying vec3 vGlass;

float bhStripeI(float t) { return floor(t) * 0.5 + max(fract(t) - 0.5, 0.0); }
float bhStripe(float x, float w) {
  w = max(w, 1e-4);
  return (bhStripeI(x + 0.5 * w) - bhStripeI(x - 0.5 * w)) / w;
}
float rmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 bhPal(float h) {
  vec3 c = vec3(0.62, 0.14, 0.12);
  c = mix(c, vec3(0.12, 0.26, 0.5), step(0.14, h));
  c = mix(c, vec3(0.16, 0.4, 0.22), step(0.28, h));
  c = mix(c, vec3(0.86, 0.76, 0.52), step(0.42, h));
  c = mix(c, vec3(0.18, 0.18, 0.2), step(0.55, h));
  c = mix(c, vec3(0.82, 0.48, 0.16), step(0.66, h));
  c = mix(c, vec3(0.52, 0.28, 0.5), step(0.77, h));
  c = mix(c, vec3(0.9, 0.88, 0.84), step(0.88, h));
  return c;
}

// the page of a wall bay: q (along the wall, up) at the hit, dir = q per metre towards the viewer, with its gradients.
// A ray through a bay of shelving meets what stands out of the wall first: 6 steps down the height stored in alpha
vec4 rmWall(vec2 q, vec2 dqx, vec2 dqy, vec2 dir, float face, out float outH) {
  float mi = floor(q.x / MOD_W);
  float h = rmHash(vec2(mi + face * 37.0, floor(vRoom.w + 0.5) + face * 5.0));
  float id = floor(vWalls[int(h * 4.0)] + 0.5);
  float flip = step(0.5, fract(h * 7.31));
  float lx = q.x - mi * MOD_W;
  float sx = 1.0;
  if (flip > 0.5) { lx = MOD_W - lx; sx = -1.0; }
  vec2 cell = vec2(mod(id, uGridW.x), floor(id / uGridW.x));
  vec2 scale = (1.0 - 2.0 * uGridW.zw) / vec2(MOD_W, MOD_H) / uGridW.xy;
  vec2 org = (cell + uGridW.zw) / uGridW.xy;
  vec2 m = vec2(lx, q.y);
  vec2 d = vec2(dir.x * sx, dir.y);
  vec2 gx = vec2(dqx.x * sx, dqx.y) * scale, gy = vec2(dqy.x * sx, dqy.y) * scale;
  float fp = max(dot(gx, gx), dot(gy, gy)) * uGridW.x * uGridW.x * 2.2e5;
  float lod = max(0.5 * log2(max(fp, 1e-6)), 0.0);
  vec2 hit = m;
  outH = 0.0;
  if (lod < 3.0) {
    float prev = MOD_RELIEF;
    vec2 lim = vec2(MOD_W, MOD_H);
    for (int i = 0; i < 6; i++) {
      float s = MOD_RELIEF * (1.0 - (float(i) + 1.0) / 6.0);
      vec2 p = clamp(m - d * s, vec2(0.0), lim);
      float a = textureLod(tWall, org + p * scale, lod).a * MOD_RELIEF;
      if (a >= s) {
        hit = p;
        outH = a;
        break;
      }
      prev = s;
    }
  }
  return textureGrad(tWall, org + clamp(hit, vec2(0.0), vec2(MOD_W, MOD_H)) * scale, gx, gy);
}
// a card standing in the room on the plane z, one every S metres; returns rgb (linear, not premultiplied), a
vec4 rmCard(vec3 ro, vec3 rd, float z, float S, float idA, float idB, float chance, float salt, float yoff, out vec3 p) {
  float tz = (z - ro.z) / rd.z;
  p = ro + rd * tz;
  vec2 q = vec2(p.x, p.y - yoff);
  float rq = floor(vRoom.w + 0.5);
  float off = rq * 3.7 + salt;
  float sl = (q.x + off) / S;
  float mi = floor(sl);
  float h = rmHash(vec2(mi, rq + salt));
  if (h > chance || q.y < 0.0 || q.y > S || idA < 0.0) return vec4(0.0);
  float id = floor((fract(h * 13.7) < 0.5 || idB < 0.0 ? idA : idB) + 0.5);
  float lx = fract(sl);
  float sx = 1.0;
  if (fract(h * 5.13) < 0.5) { lx = 1.0 - lx; sx = -1.0; }
  vec2 cell = vec2(mod(id, uGridC.x), floor(id / uGridC.x));
  vec2 scale = (1.0 - 2.0 * uGridC.zw) / uGridC.xy;
  vec2 uv = (cell + uGridC.zw) / uGridC.xy + vec2(lx, q.y / S) * scale;
  // (x derivative before the fract: no seam at a slot's edge)
  vec2 gx = vec2(dFdx(q.x) * sx, dFdx(q.y)) / S * scale, gy = vec2(dFdy(q.x) * sx, dFdy(q.y)) / S * scale;
  vec4 c = textureGrad(tCard, uv, gx, gy);
  vec3 rgb = c.rgb / max(c.a, 0.02);
  return vec4(rgb * rgb, c.a);
}
// the light fittings on a ceiling, at a point of it
float rmFitting(vec2 cq, float lampK) {
  if (lampK > 1.5 && lampK < 2.5) {
    vec2 lp = abs(fract(cq / vec2(1.8, 2.4)) - 0.5) * vec2(1.8, 2.4);
    return step(lp.x, 0.29) * step(lp.y, 0.59) * 1.6;
  }
  if (lampK > 2.5) {
    vec2 lp = abs(fract(cq / vec2(2.4, 1.6)) - 0.5) * vec2(2.4, 1.6);
    return step(lp.x, 0.05) * step(lp.y, 0.62) * 2.2;
  }
  if (lampK > 0.5) {
    vec2 lp = (fract(cq / vec2(1.6, 1.8)) - 0.5) * vec2(1.6, 1.8);
    return (1.0 - smoothstep(0.045, 0.07, length(lp))) * 2.6;
  }
  return 0.0;
}
// how much of a card stands over the floor at x along its plane: its silhouette from a small mip
float rmCardFoot(float x, float S, float idA, float idB, float chance, float salt) {
  float rq = floor(vRoom.w + 0.5);
  float sl = (x + rq * 3.7 + salt) / S;
  float h = rmHash(vec2(floor(sl), rq + salt));
  if (h > chance || idA < 0.0) return 0.0;
  float id = floor((fract(h * 13.7) < 0.5 || idB < 0.0 ? idA : idB) + 0.5);
  float lx = fract(sl);
  if (fract(h * 5.13) < 0.5) lx = 1.0 - lx;
  vec2 cell = vec2(mod(id, uGridC.x), floor(id / uGridC.x));
  vec2 scale = (1.0 - 2.0 * uGridC.zw) / uGridC.xy;
  return textureLod(tCard, (cell + uGridC.zw) / uGridC.xy + vec2(lx, 0.14) * scale, 4.5).a;
}
#ifdef CW_SUN
// the sun on a point of the room: back along the sun's ray to the plane of the glass, is that inside the pane, and does the sun reach it there
float rmSunAt(vec3 p, vec3 Lr, vec4 wr, vec3 W0, vec3 Tu, vec3 N, float cross) {
  vec2 q = p.xy + Lr.xy * (p.z / -Lr.z);
  float w = 0.012 + 0.02 * p.z;
  float k = smoothstep(0.07 - w, 0.07 + w, min(min(q.x - wr.x, wr.y - q.x), min(q.y - wr.z, wr.w - q.y)));
  if (k <= 0.0) return 0.0;
  if (cross > 0.5) {
    k *= smoothstep(0.025 - w, 0.025 + w, abs(q.x - (wr.x + wr.y) * 0.5));
    k *= smoothstep(0.025 - w, 0.025 + w, abs(q.y - (wr.z + (wr.w - wr.z) * 0.62)));
  }
  vec4 S = uCwSunM * vec4(W0 + Tu * q.x + vec3(0.0, q.y, 0.0) + N * 0.15, 1.0);
  if (S.x > 0.0 && S.y > 0.0 && S.x < 1.0 && S.y < 1.0 && S.z < 1.0) k *= textureLod(tCwShadow, vec3(S.xy, S.z - 0.0006), 0.0);
  return k;
}
#endif

void main() {
  vec2 T2 = vDir.xy;
  vec3 Tu = vec3(T2.x, 0.0, T2.y);
  vec3 N = vec3(-T2.y, 0.0, T2.x);
  vec3 V = normalize(vW - cameraPosition);
  float vn = -dot(V, N);
  vec3 ey = vW - uNearEye;
  float cwR = uCwRadius * uNearLens;
  float near = 1.0 - smoothstep(cwR * 0.7, cwR, length(ey));
  if (near <= 0.0 || vn <= 0.0) discard;

  float style = floor(vKind.x + 0.5), prof = floor(vKind.y + 0.5);
  bool curtain = style > 1.5 && style < 2.5, ribbon = style > 2.5 && style < 3.5;
  bool shopWin = style > 5.5 && style < 6.5;
  bool office = prof > 0.5 && prof < 1.5;
  bool homey = prof < 0.5 || prof > 2.5 && prof < 3.5;
  bool lobbyWin = style > 6.5 && vDir.w > 2.6 && prof > 4.5 && prof < 5.5;
  vec4 wrR = vRect;
  float r1 = vRnd.x, r2 = vRnd.y, r3 = vRnd.z, u1 = vRnd.w, u2 = vKind.w;
  vec2 csz = vDir.zw;

  // ── the pane: the reveal shifts it with the view, as in the facade (bhWall)
  vec2 fQ = fwidth(vQ);
  float px = max(fQ.x / csz.x, fQ.y / csz.y);
  float depthK = 1.0 - smoothstep(0.05, 0.2, px);
  float revD = (curtain ? 0.0 : (style > 6.5 ? 0.07 : (shopWin ? 0.09 : (ribbon ? 0.06 : (style > 3.5 && style < 4.5 ? 0.1 : 0.14))))) * depthK;
  vec3 rd0 = vec3(dot(V, Tu), V.y, max(vn, 0.04));
  vec2 pm = vQ + rd0.xy / max(rd0.z, 0.06) * revD;
  if (pm.x < wrR.x || pm.x > wrR.y || pm.y < wrR.z || pm.y > wrR.w) discard;
  if (pm.y >= vKind.z) discard;

  vec2 wc = vec2(wrR.x + wrR.y, wrR.z + wrR.w) * 0.5;
  vec2 wh = vec2(wrR.y - wrR.x, wrR.w - wrR.z) * 0.5;
  vec2 dd = abs(pm - wc) - wh;
  float edge = -max(dd.x, dd.y);
  if (style > 4.5 && style < 5.5) {
    float r = wh.x;
    float yc = wrR.w - r;
    if (pm.y > yc) edge = min(pm.x - wrR.x, min(wrR.y - pm.x, r - length(vec2(pm.x - wc.x, pm.y - yc))));
    if (edge < 0.0) discard;
  }
  float fw = ribbon ? 0.045 : 0.075;
  float frame = 1.0 - smoothstep(fw * 0.7, fw, edge);
  float spandrel = 0.0;
  if (curtain) {
    float ex = min(pm.x - wrR.x, wrR.y - pm.x);
    float ey2 = min(pm.y - wrR.z, wrR.w - pm.y);
    frame = max(1.0 - smoothstep(0.03, 0.045, ex), 1.0 - smoothstep(0.035, 0.055, ey2));
    spandrel = step(pm.y, wrR.z + vMisc.z * 0.0);
  } else if (style > 0.5 && style < 1.5 || style > 4.5 && style < 5.5) {
    float mv = 1.0 - smoothstep(0.022, 0.034, abs(pm.x - wc.x));
    float mh = 1.0 - smoothstep(0.022, 0.034, abs(pm.y - (wrR.z + (wrR.w - wrR.z) * 0.62)));
    frame = max(frame, max(mv, mh));
  } else if (style < 0.5 && office && wrR.y - wrR.x > 1.3) {
    float np = max(2.0, floor((wrR.y - wrR.x) / 0.85 + 0.5));
    float pw = (wrR.y - wrR.x) / np;
    float lx = fract((pm.x - wrR.x) / pw + 0.5) - 0.5;
    float mv = 1.0 - smoothstep(0.022, 0.034, abs(lx) * pw);
    float mh = 1.0 - smoothstep(0.02, 0.032, abs(pm.y - (wrR.w - 0.42)));
    frame = max(frame, max(mv, mh));
  } else if (style > 3.5 && style < 4.5) {
    vec2 gq = (pm - wrR.xz) / vec2(0.62, 0.5);
    vec2 gf = abs(fract(gq) - 0.5);
    float bars = 1.0 - smoothstep(0.43, 0.46, gf.x);
    float barsH = 1.0 - smoothstep(0.42, 0.46, gf.y);
    frame = max(frame, 1.0 - bars * barsH);
  } else if (shopWin) {
    float kick = 1.0 - step(0.42, pm.y - wrR.z);
    float transom = 1.0 - smoothstep(0.03, 0.045, abs(pm.y - (wrR.w - 0.55)));
    float mull = 1.0 - smoothstep(0.03, 0.045, abs(fract((pm.x - wrR.x) / 1.9 + 0.5) - 0.5) * 1.9);
    frame = max(frame, max(kick, max(transom, mull * step(2.6, wrR.y - wrR.x))));
  } else if (style > 6.5) {
    float mv = 1.0 - smoothstep(0.03, 0.045, abs(pm.x - wc.x));
    frame = max(frame, mv);
  }
  float gk = 1.0 - frame;
  if (gk <= 0.0) discard;

  // ── the room: which face the ray meets
  float W = vRoom.x, H = vRoom.y, D = vRoom.z;
  vec3 rd = normalize(rd0);
  vec3 ro = vec3(pm, 0.0);
  vec3 pos = step(0.0, rd);
  vec3 ard = max(abs(rd), vec3(1e-4));
  vec3 bmax = vec3(W, H, D);
  vec3 tt = (pos * bmax - ro) * (pos * 2.0 - 1.0) / ard;
  float t = min(tt.x, min(tt.y, tt.z));
  vec3 hS = ro + rd * tt.x, hF = ro + rd * tt.y, hB = ro + rd * tt.z;
  vec2 qS = hS.zy, qF = hF.xz, qB = hB.xy;
  vec2 qSx = dFdx(qS), qSy = dFdy(qS), qFx = dFdx(qF), qFy = dFdy(qF), qBx = dFdx(qB), qBy = dFdy(qB);
  float eps = 1e-3;
  bool onBack = tt.z <= t + eps;
  bool onFlat = !onBack && tt.y <= t + eps;
  vec3 h = ro + rd * t;
  vec3 n = onBack ? vec3(0.0, 0.0, -1.0) : (onFlat ? vec3(0.0, rd.y < 0.0 ? 1.0 : -1.0, 0.0) : vec3(rd.x > 0.0 ? -1.0 : 1.0, 0.0, 0.0));

  float floorK = floor(vMisc.x + 0.5), lampK = floor(vMisc.y + 0.5);
  float rs = floor(vRoom.w + 0.5);
  float zMid = D * (0.34 + 0.26 * fract(rs * 1.91));
#ifdef CW_WALK
  // an open shop has someone in it: over to one end, a pause, back again, on the plane behind what stands mid-room
  float zWalk = -1.0, xWalk = 0.0, dirW = 1.0, stepW = 1.0;
  if (shopWin && vLit.a > 0.5 && W > 2.4 && fract(rs * 3.77) < 0.75) {
    float uw = fract(uTime / (15.0 + 11.0 * fract(rs * 1.37)) + fract(rs * 0.613));
    float gw = smoothstep(0.06, 0.4, uw) - smoothstep(0.56, 0.9, uw);
    xWalk = mix(W * (0.14 + 0.18 * fract(rs * 2.17)), W * (0.86 - 0.18 * fract(rs * 4.91)), gw);
    dirW = uw < 0.48 ? 1.0 : -1.0;
    zWalk = min(zMid + 0.7, D - 0.55);
    // (a frame per step, by the ground covered; standing still, the feet together)
    stepW = gw > 0.004 && gw < 0.996 ? step(0.5, fract(xWalk / 1.15)) : 1.0;
  }
#endif
  vec3 c;
  float selfL = 0.0;
  vec3 relief = vec3(0.0);
  if (onFlat) {
    if (rd.y < 0.0) {
      // floor
      vec2 fq = hF.xz;
      vec3 fc = vec3(0.3);
      float fr = rmHash(vec2(rs, 3.1));
      if (floorK < 0.5) {
        float bw = 0.14;
        float bi = floor(fq.x / bw);
        float bh = rmHash(vec2(bi, rs));
        float bl = fq.y / 1.8 + bh * 7.0;
        float joint = bhStripe(fq.x / bw, fwidth(fq.x) / bw);
        vec3 wood = mix(vec3(0.3, 0.17, 0.09), vec3(0.46, 0.3, 0.16), fr);
        fc = wood * (0.72 + 0.5 * rmHash(vec2(bi, floor(bl)))) * (0.78 + 0.22 * joint);
      } else if (floorK < 1.5) {
        vec2 ti = fq / 0.3;
        vec2 tf = abs(fract(ti) - 0.5);
        float chk = mod(floor(ti.x) + floor(ti.y), 2.0);
        vec3 a = mix(vec3(0.62, 0.6, 0.55), vec3(0.42, 0.44, 0.45), fr), b = fr > 0.6 ? vec3(0.08) : a * 0.82;
        fc = mix(a, b, chk) * (0.92 + 0.14 * rmHash(floor(ti) + rs));
        fc *= 1.0 - 0.45 * smoothstep(0.46, 0.49, max(tf.x, tf.y)) * (1.0 - smoothstep(0.02, 0.08, fwidth(ti.x)));
      } else if (floorK < 2.5) {
        fc = mix(vec3(0.22, 0.22, 0.24), mix(vec3(0.34, 0.26, 0.2), vec3(0.2, 0.28, 0.36), step(0.5, fr)), step(0.25, fr));
        vec2 cg = abs(fract(fq / 0.5) - 0.5);
        fc *= 0.9 + 0.12 * rmHash(floor(fq / 0.5) + rs) - 0.08 * step(0.47, max(cg.x, cg.y));
      } else if (floorK < 3.5) {
        vec2 ti = fq / vec2(0.9, 0.6);
        vec2 tf = abs(fract(ti) - 0.5);
        fc = mix(vec3(0.42, 0.4, 0.37), vec3(0.3, 0.3, 0.31), fr) * (0.86 + 0.24 * rmHash(floor(ti) + rs));
        fc *= 1.0 - 0.3 * smoothstep(0.47, 0.495, max(tf.x, tf.y)) * (1.0 - smoothstep(0.02, 0.08, fwidth(ti.x)));
      } else if (floorK < 4.5) {
        fc = mix(vec3(0.42, 0.44, 0.42), vec3(0.34, 0.3, 0.26), fr);
      } else {
        // parquet: a herringbone read as alternate blocks
        vec2 ti = fq / 0.36;
        vec2 fl = floor(ti);
        float flipP = mod(fl.x + fl.y, 2.0);
        float gr = flipP > 0.5 ? fract(ti.x * 4.0) : fract(ti.y * 4.0);
        float sl = flipP > 0.5 ? floor(ti.x * 4.0) : floor(ti.y * 4.0);
        fc = mix(vec3(0.34, 0.2, 0.1), vec3(0.5, 0.33, 0.17), fr) * (0.74 + 0.42 * rmHash(vec2(sl, fl.x * 3.0 + fl.y + rs))) * (0.93 + 0.07 * smoothstep(0.0, 0.1, gr));
      }
      c = fc;
      // a rug under the furniture in homes
      if (homey && floorK != 2.0 && fract(rs * 3.3) > 0.45) {
        vec2 rg = abs(fq - vec2(W * 0.5, D * 0.5)) - vec2(W * 0.32, D * 0.26);
        float rug = 1.0 - smoothstep(-0.005, 0.005, max(rg.x, rg.y));
        vec3 rc = bhPal(fract(rs * 7.7));
        float bord = 1.0 - smoothstep(-0.14, -0.12, max(rg.x, rg.y));
        c = mix(c, mix(rc * 0.6, vec3(0.75, 0.68, 0.55) * 0.75, bord * 0.0 + (1.0 - bord) * 0.85), rug);
      }
      // a polished floor (tile, stone, lino, parquet) mirrors the fittings over it, more the flatter it is seen
      if (floorK > 0.5 && floorK != 2.0 && lampK > 0.5) {
        vec2 mq = fq + rd.xz / max(-rd.y, 0.05) * H;
        float gl = (floorK > 4.5 ? 0.09 : 0.14) + 0.5 * pow(1.0 - min(-rd.y * 1.6, 1.0), 3.0);
        selfL += rmFitting(mq, lampK) * gl * step(mq.y, D) * step(0.0, mq.x) * step(mq.x, W);
      }
#ifdef CW_WALK
      if (zWalk > 0.0) c *= 1.0 - 0.5 * (1.0 - smoothstep(0.06, 0.5, length((fq - vec2(xWalk, zWalk)) * vec2(1.0, 1.8))));
#endif
      // what stands in the room stands on the floor: its soft shadow
      float dz = abs(fq.y - zMid);
      if (dz < 0.8) c *= 1.0 - 0.62 * (1.0 - smoothstep(0.05, 0.8, dz)) * rmCardFoot(fq.x, 3.0, vCards.x, vCards.y, vMisc.z, 0.0);
    } else {
      // ceiling
      c = vec3(0.82, 0.8, 0.76);
      vec2 cq = hF.xz;
      selfL = rmFitting(cq, lampK);
      if (lampK > 1.5 && lampK < 2.5) {
        vec2 cg = abs(fract(cq / 0.6) - 0.5);
        c *= 1.0 - 0.12 * step(0.46, max(cg.x, cg.y));
      } else if (lampK > 0.5 && lampK < 1.5) {
        vec2 lp = (fract(cq / vec2(1.6, 1.8)) - 0.5) * vec2(1.6, 1.8);
        c *= 1.0 - 0.25 * (1.0 - smoothstep(0.07, 0.09, length(lp)));
      }
    }
  } else {
    // walls: a bay of the atlas (with the relief of its shelves), bare wall takes the room's paint
    float hgt;
    vec4 pg = onBack ? rmWall(qB, qBx, qBy, -rd.xy / ard.z, 0.0, hgt) : rmWall(qS, qSx, qSy, -vec2(rd.z, rd.y) / ard.x, 1.0 + pos.x, hgt);
    vec3 alb = pg.rgb * pg.rgb;
    float bare = 1.0 - smoothstep(0.0, 0.03, pg.a);
    c = mix(alb, alb * vPaint, bare);
    // a plain cornice where the wall meets the ceiling
    float top = H - (onBack ? hB.y : hS.y);
    float corn = 1.0 - smoothstep(0.08, 0.09, top);
    c = mix(c, vec3(0.78, 0.76, 0.72) * (0.8 + 0.5 * smoothstep(0.0, 0.08, top)), corn);
    h -= n * -hgt; // what stands out of the wall stands nearer the room
  }

  // ── what stands in the room
  float zDisp = 0.5;
  vec3 pMid, pDisp;
  vec4 cm = vec4(0.0), cd = vec4(0.0);
  float tMid = zMid / rd.z, tDisp = zDisp / rd.z;
  if (tMid < t) cm = rmCard(ro, rd, zMid, 3.0, vCards.x, vCards.y, vMisc.z, 0.0, 0.0, pMid);
  // (at home what stands in the window stands on its sill, a hand behind the glass)
  if (homey) { zDisp = 0.16; tDisp = zDisp / rd.z; }
  if (tDisp < t) cd = rmCard(ro, rd, zDisp, 2.0, vCards.z, vCards.w, vMisc.w, 11.0, homey ? wrR.z - 0.82 : 0.0, pDisp);

  // ── the light
  vec3 lq = h + n * 0.03;
  vec3 LP;
  vec2 g = lampK < 0.5 ? vec2(3.6, 100.0) : (lampK < 1.5 ? vec2(1.6, 1.8) : (lampK < 2.5 ? vec2(1.8, 2.4) : vec2(2.4, 3.2)));
  // (a shade hangs: 0.6 m under the ceiling; fittings are on it)
  float ly = H - (lampK < 0.5 ? 0.62 : 0.04);
  LP = vec3((floor(lq.x / g.x) + 0.5) * g.x, ly, lampK < 0.5 ? D * (0.34 + 0.3 * fract(rs * 2.3)) : (floor(lq.z / g.y) + 0.5) * g.y);
  LP.xz = clamp(LP.xz, vec2(0.4), vec2(W, D) - 0.4); // (the grid's nearest fitting can lie beyond the wall, which would leave that wall black)
  // half the homes have no ceiling light on but a lamp standing in a corner: a pool of light, dark corners
  bool cornerL = lampK < 0.5 && homey && fract(rs * 9.13) > 0.45;
  vec3 LC = vec3(fract(rs * 4.7) > 0.5 ? W - 0.42 : 0.42, 1.42, D * (0.5 + 0.35 * fract(rs * 6.1)));
  if (cornerL) LP = LC;
  vec3 toL = LP - lq;
  float d2 = dot(toL, toL);
  float ndl = max(dot(n, toL) / sqrt(max(d2, 1e-3)), 0.0);
  float ex = min(h.x, W - h.x), ey3 = min(h.y, H - h.y), ez = D - h.z;
  float ao = onBack ? smoothstep(0.0, 0.5, min(ex, ey3)) : (onFlat ? smoothstep(0.0, 0.45, min(ex, ez)) : smoothstep(0.0, 0.45, min(ey3, ez)));
  ao = 0.42 + 0.58 * ao;
  float att = cornerL ? 3.6 / (1.0 + d2 * 0.95) : (lampK < 0.5 ? 2.6 : 1.5) / (1.0 + d2 * (lampK < 0.5 ? 0.55 : 0.75));
  // (the far look of a lit room is a glow for the whole district to read; from close by, the walls of a room in lamplight)
  float nearCalm = mix(0.58, 1.0, smoothstep(cwR * 0.3, cwR * 0.85, length(ey)));
  vec3 lit = vLit.rgb * nearCalm;
  vec3 lamp = lit * ((cornerL ? 0.09 : 0.16) + ndl * att) * ao;
  // daylight comes through the pane: bright by the glass, falling off into the room
  float fall = 1.0 / (1.0 + h.z * h.z * 0.28) + 0.1;
  vec3 dayA = c * fall * ao * (onFlat && rd.y > 0.0 ? 0.55 : (onBack ? 0.9 : 0.75));
  vec3 interior = c * lamp + lit * selfL;
  // the sun through this pane: a patch on the floor or up the wall, crossed by the glazing bars
  vec3 sunA = vec3(0.0);
#ifdef CW_SUN
  vec3 Lr = vec3(dot(uSunDir, Tu), uSunDir.y, -dot(uSunDir, N));
  bool sunIn = Lr.z < -0.04 && Lr.y > 0.03 && dot(uCwSun, uCwSun) > 1e-4;
  vec3 W0 = vW - Tu * vQ.x - vec3(0.0, vQ.y, 0.0);
  float sunCross = (style > 0.5 && style < 1.5 || style > 4.5 && style < 5.5) ? 1.0 : 0.0;
  if (sunIn) sunA = c * uCwSun * max(dot(n, Lr), 0.0) * rmSunAt(h, Lr, wrR, W0, Tu, N, sunCross);
#endif

#ifdef CW_WALK
  if (zWalk > 0.0 && zWalk / rd.z < t) {
    float tW = zWalk / rd.z;
    vec3 pW = ro + rd * tW;
    vec2 qW = vec2((pW.x - xWalk) * dirW * 0.5 + 0.5, pW.y * 0.5);
    if (qW.x > 0.2 && qW.x < 0.8 && qW.y > 0.0 && qW.y < 1.0) {
      float idW = float(CW_WALK) + 2.0 * floor(fract(rs * 7.19) * 3.0) + stepW;
      vec2 scW = (1.0 - 2.0 * uGridC.zw) / uGridC.xy;
      vec2 uvW = (vec2(mod(idW, uGridC.x), floor(idW / uGridC.x)) + uGridC.zw) / uGridC.xy + qW * scW;
      vec4 cw = textureGrad(tCard, uvW, dFdx(qW) * scW, dFdy(qW) * scW);
      if (cw.a > 0.0) {
        vec3 rgbW = cw.rgb / max(cw.a, 0.02);
        rgbW *= rgbW;
        vec3 toW = (cornerL ? LC : vec3((floor(pW.x / g.x) + 0.5) * g.x, ly, zWalk - 0.4)) - pW;
        float dw = dot(toW, toW);
        interior = mix(interior, rgbW * lit * (0.3 + 0.75 * max(-toW.z + 0.7, 0.3) / sqrt(dw + 0.3) * (lampK < 0.5 ? 2.2 : 1.3) / (1.0 + dw * 0.55)), cw.a);
        dayA = mix(dayA, rgbW * (1.0 / (1.0 + zWalk * zWalk * 0.28) + 0.1), cw.a);
#ifdef CW_SUN
        sunA *= 1.0 - cw.a;
#endif
        t = mix(t, tW, step(0.5, cw.a));
        selfL *= 1.0 - cw.a;
      }
    }
  }
#endif
  // a card is lit where it stands, facing the window
  if (cm.a > 0.0) {
    vec3 toM = (cornerL ? LC : (lampK < 0.5 ? vec3((floor(pMid.x / g.x) + 0.5) * g.x, ly, LP.z) : vec3((floor(pMid.x / g.x) + 0.5) * g.x, ly, zMid - 0.4))) - pMid;
    float dm = dot(toM, toM);
    vec3 lm = lit * (0.3 + 0.75 * max(-toM.z + 0.7, 0.3) / sqrt(dm + 0.3) * (lampK < 0.5 ? 2.2 : 1.3) / (1.0 + dm * 0.55));
    float fm = 1.0 / (1.0 + zMid * zMid * 0.28) + 0.1;
    interior = mix(interior, cm.rgb * lm, cm.a);
    dayA = mix(dayA, cm.rgb * fm, cm.a);
#ifdef CW_SUN
    sunA = mix(sunA, sunIn ? cm.rgb * uCwSun * -Lr.z * rmSunAt(pMid, Lr, wrR, W0, Tu, N, sunCross) : vec3(0.0), cm.a);
#endif
    t = mix(t, tMid, step(0.5, cm.a));
    selfL *= 1.0 - cm.a;
  }
  // the shade of a hanging lamp, in front of whatever lies behind it (a ball on a cord)
  if (lampK < 0.5) {
    float lxi = floor((ro.x + rd.x * (LP.z / rd.z)) / g.x);
    vec3 C0 = cornerL ? LC : vec3((lxi + 0.5) * g.x, ly, LP.z);
    float tl = dot(C0 - ro, rd);
    if (tl > 0.0 && tl < t) {
      vec3 cl = ro + rd * tl - C0;
      float dl = length(cl);
      float kind = cornerL ? 1.0 : fract(rs * 5.7);
      float rl = 0.15 + 0.06 * fract(rs * 2.9);
      float shade = 1.0 - smoothstep(rl - 0.012, rl + 0.012, kind < 0.5 ? dl : length(cl * vec3(1.0, cl.y > 0.0 ? 1.8 : 40.0, 1.0)));
      // (a cord up to the ceiling, a corner lamp's stem down to the floor)
      float cord = (1.0 - smoothstep(0.004, 0.012, length(cl.xz))) * (cornerL ? step(cl.y, 0.0) * step(-1.42, cl.y) : step(0.0, cl.y) * step(cl.y, 0.7));
      vec3 sc = kind < 0.5 ? vec3(0.95, 0.9, 0.78) : (cornerL ? vec3(0.95, 0.86, 0.68) : bhPal(fract(rs * 3.3)) * 0.6 + 0.2);
      // (a glass globe burns brightest in the middle and has no outline; a fabric shade glows evenly, brighter low down)
      float dq = clamp(dl / rl, 0.0, 1.0);
      vec3 sg = kind < 0.5 ? sc * lit * (1.3 + 2.2 * (1.0 - dq * dq)) : sc * lit * (cornerL ? 2.6 - 1.2 * smoothstep(-0.02, 0.1, cl.y) : 2.2);
      interior = mix(interior, sg, shade);
      dayA = mix(dayA, sc * 0.5, shade);
      interior = mix(interior, vec3(0.01), cord);
      dayA = mix(dayA, vec3(0.03), cord);
    }
  }
  if (cd.a > 0.0) {
    // (shops light their windows: spots right over the display; a sill at home stands in the window's own light)
    float dk = shopWin ? 1.25 : 0.55;
    interior = mix(interior, cd.rgb * lit * dk, cd.a);
    dayA = mix(dayA, cd.rgb * 1.05, cd.a);
#ifdef CW_SUN
    sunA = mix(sunA, sunIn ? cd.rgb * uCwSun * -Lr.z * rmSunAt(pDisp, Lr, wrR, W0, Tu, N, sunCross) : vec3(0.0), cd.a);
#endif
  }

  // ── curtains, blinds, what stands on the sill and is taped to the glass: the facade's own (bhWall), a hand's breadth behind the glass
  vec3 lcol = lit / max(max(lit.r, max(lit.g, lit.b)), 1e-3);
  float litI = max(lit.r, max(lit.g, lit.b));
  vec4 wr = wrR;
  vec2 pc = pm + rd.xy / rd.z * 0.07;
  float wx = (pc.x - wr.x) / max(wr.y - wr.x, 1e-3);
  float wy = (pc.y - wr.z) / max(wr.w - wr.z, 1e-3);
  float fpy = fQ.y, fpx = fQ.x;
  float nearL = 0.0;
  float detail = 1.0;
  if (homey) {
    float cr = fract(r3 * 7.13 + r1 * 0.37);
    vec3 cc = mix(vec3(0.86, 0.8, 0.68), vec3(0.76, 0.42, 0.38), step(0.7, r2));
    cc = mix(cc, vec3(0.42, 0.55, 0.66), step(0.9, r2));
    float hcf = fract(r2 * 5.77 + r1 * 0.31);
    cc = hcf < 0.4 ? cc : (hcf < 0.55 ? vec3(0.62, 0.66, 0.58) : (hcf < 0.68 ? vec3(0.55, 0.6, 0.72) : (hcf < 0.8 ? vec3(0.8, 0.72, 0.62) : (hcf < 0.9 ? vec3(0.6, 0.3, 0.28) : vec3(0.7, 0.7, 0.68)))));
    float fpat = fract(r1 * 9.13);
    float fstr = bhStripe(wx * (wr.y - wr.x) * 9.0, fpx * 9.0);
    if (fpat > 0.8) cc *= 0.88 + 0.16 * fstr;
    float fa = 1.0 - smoothstep(0.15, 0.6, fpx * 60.0 / max(wr.y - wr.x, 0.3) / 6.2832);
    if (r3 > 0.66) {
      // side curtains: they hang in folds, gathered towards the jamb, lit through from behind
      float cov = r3 > 0.86 ? 0.5 : (r3 > 0.72 ? 0.3 : 0.2);
      float oneSide = step(0.85, fract(r1 * 3.3));
      float side = clamp(step(wx, cov) * (1.0 - oneSide) + step(1.0 - cov * (1.0 + oneSide), wx), 0.0, 1.0);
      float folds = 0.74 + 0.26 * sin(wx * 60.0 + r1 * 6.0 + 2.2 * sin(wx * 17.0 + r2 * 9.0)) * (0.6 + 0.4 * sin(wx * 23.0 + r3 * 5.0)) * fa;
      float tie = step(0.5, fract(r2 * 4.1)) * (1.0 - smoothstep(0.0, 0.05, abs(wy - 0.45))) * 0.25 * fa;
      vec3 c2 = cc * folds * (1.0 - tie);
      float pel = step(0.92, wy) * step(0.6, fract(r3 * 17.0));
      c2 = mix(c2, cc * 0.7, pel);
      side = max(side, pel);
      float netB = step(0.75, fract(r1 * 2.71)) * (1.0 - side);
      // (a net curtain: the room shows through it, it hangs in shallow folds)
      float netF = (0.4 + 0.2 * sin(wx * (wr.y - wr.x) * 19.0 + r1 * 9.0)) * (0.92 + 0.08 * bhStripe(wx * (wr.y - wr.x) * 30.0, fpx * 30.0));
      interior = mix(interior, vec3(0.95, 0.92, 0.86) * lcol * litI * 0.5, netB * netF);
      dayA = mix(dayA, vec3(0.56, 0.56, 0.54), netB * netF);
      interior = mix(interior, c2 * lcol * litI * 0.75, side);
      dayA = mix(dayA, c2 * 0.7, side);
      nearL = max(side, netB * 0.7);
    } else if (r3 > 0.5) {
      float netTop = cr > 0.45 ? 1.0 : 0.55;
      float hem = (1.0 - smoothstep(0.0, 0.03, abs(wy - netTop + 0.04))) * fa;
      float lace = 0.9 + 0.1 * bhStripe(wx * (wr.y - wr.x) * 24.0, fpx * 24.0) * fa;
      float net = step(wy, netTop) * (0.42 + 0.14 * sin(wx * (wr.y - wr.x) * 19.0 + r1 * 9.0) + 0.3 * hem);
      interior = mix(interior, vec3(0.95, 0.9, 0.8) * lcol * litI * 0.55, net);
      dayA = mix(dayA, vec3(0.68, 0.68, 0.65) * lace, net);
      nearL = net;
    } else if (r3 > 0.37) {
      float blindTo = 1.0 - (0.15 + 0.6 * cr);
      vec3 rb = mix(vec3(0.88, 0.84, 0.74), cc, step(0.6, cr));
      float ven = step(0.5, fract(r2 * 7.9));
      if (ven > 0.5) rb = mix(vec3(0.85, 0.84, 0.8), vec3(0.62, 0.46, 0.3), step(0.7, cr)) * (0.72 + 0.28 * bhStripe(pc.y * 22.0, fpy * 22.0));
      float bl = step(blindTo, wy);
      rb *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.025, wy - blindTo)) * fa;
      interior = mix(interior, rb * lcol * litI * 0.6, bl);
      dayA = mix(dayA, rb * 0.62, bl);
      nearL = bl;
    } else if (r3 > 0.29) {
      float gap = 1.0 - smoothstep(0.0, 0.02, abs(wx - 0.5 - (cr - 0.5) * 0.1) - 0.012);
      float folds = 0.8 + 0.2 * sin(wx * 70.0 + 2.4 * sin(wx * 19.0 + r1 * 7.0)) * (0.55 + 0.45 * sin(wx * 29.0 + r2 * 4.0)) * fa;
      vec3 c2 = cc * folds * (1.0 - 0.5 * gap);
      interior = mix(interior, c2 * lcol * litI * 0.8, 1.0 - gap * 0.6);
      dayA = mix(dayA, c2 * 0.72, 1.0 - gap * 0.6);
      nearL = 1.0 - gap;
    }
  } else if (office) {
    float os = fract(r2 * 7.13 + r3 * 3.31);
    float fo = 1.0 - smoothstep(0.15, 0.6, fpx * 60.0 / max(wr.y - wr.x, 0.3) / 6.2832);
    if (fract(u1 * 3.71 + floor(vMisc.x * 0.0) * 0.37) < 0.4 || os < 0.12) {
      float blindTo = fract(r1 * 11.3) < 0.15 ? 0.97 : 1.0 - clamp(0.2 + 0.65 * fract(u2 * 5.3) + (r1 - 0.5) * 0.4 * step(0.45, r3), 0.08, 0.92);
      float shut = step(0.75, fract(r3 * 5.7));
      float slat = mix(0.75 + 0.25 * bhStripe(pc.y * 9.0, fpy * 9.0), 0.92 + 0.08 * bhStripe(pc.y * 18.0, fpy * 18.0), shut);
      vec3 bc = mix(vec3(0.78, 0.78, 0.74), vec3(0.62, 0.64, 0.66), step(0.7, fract(u1 * 9.7))) * slat;
      float bl = step(blindTo, wy);
      bl *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.02, wy - blindTo)) * fo;
      interior = mix(interior, bc * lcol * litI * 0.6, bl);
      dayA = mix(dayA, bc * mix(0.55, 0.7, shut), bl);
      nearL = bl * 0.8;
    } else if (os < 0.22) {
      float vb = step(wx, 0.3 + 0.65 * fract(r1 * 4.3));
      if (fract(r3 * 2.9) > 0.5) vb = step(1.0 - 0.3 - 0.65 * fract(r1 * 4.3), wx);
      vec3 vc = mix(vec3(0.8, 0.78, 0.72), vec3(0.52, 0.58, 0.64), step(0.6, fract(r3 * 9.1))) * (0.84 + 0.16 * bhStripe(pc.x * 10.0, fpx * 10.0));
      interior = mix(interior, vc * lcol * litI * 0.6, vb);
      dayA = mix(dayA, vc * 0.66, vb);
      nearL = vb;
    } else if (os < 0.29) {
      vec2 q = vec2((wx - 0.15 - 0.45 * fract(r1 * 6.1)) * (wr.y - wr.x), pc.y - wr.z - 0.55 - 0.35 * fract(r3 * 4.7));
      bool big = fract(r1 * 3.3) > 0.7;
      vec2 hs2 = big ? vec2(0.3, 0.42) : vec2(0.105, 0.149);
      float sheet = step(abs(q.x), hs2.x) * step(abs(q.y), hs2.y);
      if (!big && fract(r2 * 8.1) > 0.5) sheet = max(sheet, step(abs(q.x - 0.25), hs2.x) * step(abs(q.y), hs2.y));
      vec3 pc2 = big ? mix(vec3(0.85, 0.3, 0.15), vec3(0.15, 0.4, 0.7), step(0.5, fract(r3 * 7.7))) : vec3(0.9, 0.9, 0.86);
      pc2 *= 1.0 - (big ? 0.6 * step(abs(q.y - 0.12), 0.08) : 0.35 * bhStripe(q.y * 40.0, fpy * 40.0) * step(abs(q.x), 0.08)) * fo;
      interior = mix(interior, pc2 * lcol * litI * 0.4, sheet);
      dayA = mix(dayA, pc2 * 0.8, sheet);
      nearL = sheet;
    }
  } else if (prof > 5.5 && prof < 6.5) {
    float ww = wr.y - wr.x;
    float ss = fract(r2 * 5.31 + r1 * 0.7);
    float yb = pc.y - wr.z;
    if (ss < 0.72) {
      float nS = 2.0 + floor(fract(r3 * 3.7) * 3.0);
      float sl = clamp(wx * nS, 0.0, nS - 0.001);
      float si = floor(sl);
      float sh = fract(r1 * 13.1 + si * 0.618);
      vec2 sq = vec2((fract(sl) - 0.5) * ww / nS, yb - 0.5 - 0.12 * sh);
      vec2 hsz = sh > 0.6 ? vec2(0.21, 0.15) : vec2(0.15, 0.21);
      float sheet = step(abs(sq.x), hsz.x) * step(abs(sq.y), hsz.y) * step(0.18, fract(sh * 7.3));
      vec3 paper = fract(sh * 3.9) < 0.6 ? vec3(0.92, 0.91, 0.86) : bhPal(fract(sh * 5.3)) * 0.55 + 0.35;
      vec2 lq2 = sq / hsz;
      float pk = fract(sh * 11.7);
      vec3 ink = bhPal(fract(sh * 2.3 + 0.4));
      float pic = 0.0;
      if (pk < 0.3) pic = 1.0 - smoothstep(0.3, 0.38, length(lq2 - vec2(0.35, 0.4)));
      else if (pk < 0.6) pic = step(abs(lq2.x), 0.45) * step(-0.7, lq2.y) * step(lq2.y, 0.05) + step(abs(lq2.x) - 0.5, -lq2.y * 0.9 + 0.05) * step(0.05, lq2.y) * step(lq2.y, 0.55);
      else if (pk < 0.8) pic = step(0.55, fract(lq2.y * 3.0 + 0.5 * sin(lq2.x * 6.0 + sh * 9.0))) * step(abs(lq2.x), 0.8) * step(abs(lq2.y), 0.75);
      else pic = step(length(lq2 - vec2(0.0, 0.45)), 0.2) + step(abs(lq2.x), 0.08) * step(abs(lq2.y + 0.15), 0.4);
      pic = clamp(pic, 0.0, 1.0);
      vec3 sc = mix(paper, ink, pic * 0.85);
      sc = mix(sc, vec3(0.25, 0.55, 0.2), step(lq2.y, -0.78) * step(0.5, pk));
      interior = mix(interior, sc * lcol * litI * 0.35, sheet);
      dayA = mix(dayA, sc * 0.82, sheet);
      nearL = sheet;
    } else {
      float blindTo = 1.0 - clamp(0.15 + 0.6 * fract(r1 * 7.9), 0.1, 0.8);
      float bl = step(blindTo, wy);
      vec3 bc = mix(vec3(0.8, 0.79, 0.74), vec3(0.42, 0.52, 0.66), step(0.6, fract(r3 * 4.1)));
      interior = mix(interior, bc * lcol * litI * 0.6, bl);
      dayA = mix(dayA, bc * 0.65, bl);
      nearL = bl;
    }
  }

  // ── through the glass (the facade's own factors)
  float recess = curtain ? 1.0 : smoothstep(0.0, 0.22, wr.w - pm.y) * mix(0.75, 1.0, smoothstep(0.0, 0.12, min(pm.x - wr.x, wr.y - pm.x)));
  interior *= mix(0.45, 1.0, recess);
  dayA *= mix(0.4, 1.0, recess);
  float cosv = clamp(vn, 0.0, 1.0);
  float F0 = curtain ? 0.3 : (ribbon ? 0.22 : 0.1);
  float Fs = F0 + (1.0 - F0) * pow(1.0 - cosv, 5.0);
  vec3 transTint = mix(vec3(1.0), vGlass, curtain ? 0.75 : 0.3);
  float nightF = clamp(uLights * (0.42 + 0.58 * uNight), 0.0, 1.0);
  float dayK = 1.0 - nightF;
  if (!curtain && !ribbon) {
    if (shopWin || lobbyWin) {
      Fs = max(Fs, mix(0.04, 0.11 + 0.05 * r3, dayK));
      interior *= mix(1.0, 0.82, dayK);
      Fs = mix(Fs, max(Fs, 0.14), uCwGm * dayK);
    }
    transTint *= mix(vec3(0.93, 1.0, 0.97), vec3(1.0, 0.98, 0.95), fract(r3 * 4.7 + r1 * 0.3)) * mix(0.92, 1.04, fract(r2 * 6.1));
  }
  float roomK = mix(0.62, 1.0, fract(r1 * 3.71));
  float albK = curtain ? 0.4 : (ribbon ? 0.7 : (homey ? mix(0.62 * roomK, 1.0, nearL) : mix(roomK, 1.0, nearL)));
  vec3 col = (interior + dayA * albK * uCwDay + sunA * (1.0 - nearL * 0.8) * 0.6) * (1.0 - Fs) * transTint;
  gl_FragColor = vec4(col * gk * near * (1.0 - spandrel), 1.0);
}
`;
