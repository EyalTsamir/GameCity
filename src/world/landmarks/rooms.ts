// Hero interiors: rooms a visitor can walk into. Everything here is drawn only while the camera is near (one mesh per
// room behind a distance test), so the rooms cost nothing in the wide views.
//
// A room is ordinary landmark geometry (Kit + MeshBuilder, the same surface patterns) in a material of its own whose
// light does not come from the scene's lights, because daylight indoors is all about the openings:
//   sky + lamps   baked per vertex at boot (form factors of the windows, inverse square of the lamps): aBake
//   sun           per fragment: the ray towards the sun is intersected with the window wall and looks the pane up in the
//                 room's glass atlas, so a stained-glass window throws its own picture across floor, pews and walls,
//                 and it moves with the clock. The same lookup along the mirror ray reflects the windows in polished stone
//   shafts        additive sheets swept from each sunlit window along the sun (one mesh, drawn from inside only)
//   motes         points that only light up where they float through the sun
// Rooms also tell the walker where it can go: ctx.services.rooms (see ui/camera/walkSurface.ts).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Rect } from '../../core/geom';
import { MeshBuilder, Mat, M } from './builder';
import { Kit, V3 } from './kit';
import { SignAtlas, AtlasRect } from './signs';
import { LM_COMMON, LM_SURFACE } from './shaders';

/** surface patterns only the room shader knows (they continue PAT in builder.ts) */
export const RP = {
  /** worn flagstones: metres in the plane; seed varies the layout */
  FLAGS: 27,
  /** encaustic tiles (chequer + inset quatrefoils in vertex colour and a dark red) */
  ENCAUSTIC: 28,
  /** painted night-blue ceiling with gold stars */
  STARS: 29,
  /** old limewash over stone: blotches, hairline cracks, a damp line near the floor */
  PLASTER: 30,
  /** polished oak: long grain, darker in the arrises */
  OAK: 31,
  /** a glass pane: atlas uv in aPuv */
  GLASS: 32,
  /** a picture from the room atlas (paintings, plaques, boards): atlas uv in aPuv */
  PIC: 33,
  /** a flame or a lamp: emissive vertex colour × glow; seed < 0.5 only when the lamps are on */
  EMIT: 34,
  /** polished marble with veins */
  MARBLE: 35,
  /** herringbone parquet */
  PARQUET: 36,
  /** small-tesserae mosaic */
  MOSAIC: 37,
  /** polished brass or gilt: reflects the windows */
  BRASS: 38,
  /** chequered black and cream marble, 60 cm, veined and polished */
  CHEQUER: 39,
} as const;

const ROOM_VERT = /* glsl */ `
attribute vec2 aPuv;
attribute vec4 aMat;
attribute vec2 aBake;
uniform vec4 uRoomFrame;
varying vec3 vCol;
varying vec2 vPuv;
flat varying vec4 vMat;
varying vec2 vYN;
varying vec2 vBake;
varying vec3 vP;
varying vec3 vN;
void main() {
  vCol = color;
  vPuv = aPuv;
  vMat = aMat;
  vBake = aBake;
  vYN = vec2(position.y, normal.y);
  vec2 d = position.xz - uRoomFrame.xy;
  vP = vec3(uRoomFrame.z * d.x - uRoomFrame.w * d.y, position.y, uRoomFrame.w * d.x + uRoomFrame.z * d.y);
  vN = vec3(uRoomFrame.z * normal.x - uRoomFrame.w * normal.z, normal.y, uRoomFrame.w * normal.x + uRoomFrame.z * normal.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// window array (room-local): the panes stand in the planes x = ±uWinA.x, one every uWinA.z metres from z = uWinA.y,
// uWinA.w of them per side; uWinB = width, sill height, height, (unused). uCell = atlas: u0, stride, cell width, v0;
// uCellH = cell height. Cell index: bay on the +x side, bay + count on the −x side. uRoof: glass roof at height y.
const GLASS_GLSL = /* glsl */ `
uniform vec4 uWinA;
uniform vec4 uWinB;
uniform vec4 uCell;
uniform float uCellH;
uniform vec4 uZone;
uniform vec4 uRoof;
uniform vec4 uRoofOnly;
uniform float uWinSwap;
uniform vec4 uSide;
uniform float uSideH;
uniform sampler2D uGlass;
vec4 glassAlong(vec3 P, vec3 D, float lod) {
  if (P.z < uZone.x || P.z > uZone.y || P.x < uZone.z || P.x > uZone.w) return vec4(0.0);
  if (uRoof.x > 0.0 && abs(P.x) < uRoofOnly.x) {
    if (D.y > 0.02) {
      vec3 H = P + D * ((uRoof.x - P.y) / D.y);
      if (abs(H.x) <= uRoof.y && H.z >= uRoof.z && H.z <= uRoof.w) {
        vec2 cell = fract(H.xz / uRoofOnly.zw);
        vec4 g = textureLod(uGlass, vec2(uCell.x + cell.x * uCell.z, uCell.w + cell.y * uCellH), lod + 2.5);
        return vec4(g.rgb * 0.75, 1.0);
      }
    }
    if (P.z < uRoofOnly.y) return vec4(0.0);
  }
  vec3 Q = uWinSwap > 0.5 ? P.zyx : P;
  vec3 E = uWinSwap > 0.5 ? D.zyx : D;
  if (abs(E.x) >= 0.02) {
    float sd = E.x > 0.0 ? 1.0 : -1.0;
    float t = (sd * uWinA.x - Q.x) / E.x;
    if (t >= 0.0) {
      vec3 H = Q + E * t;
      float bi = floor((H.z - uWinA.y) / uWinA.z + 0.5);
      vec2 uv = vec2((H.z - (uWinA.y + bi * uWinA.z)) / uWinB.x + 0.5, (H.y - uWinB.y) / uWinB.z);
      if (bi >= 0.0 && bi < uWinA.w && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
        float c = bi + (sd > 0.0 ? 0.0 : uWinA.w) + (uRoof.x > 0.0 ? 1.0 : 0.0);
        vec4 g = textureLod(uGlass, vec2(uCell.x + (c + uv.x * uCell.z / uCell.y) * uCell.y, uCell.w + uv.y * uCellH), lod);
        if (g.a > 0.01 || uSide.x <= 0.0) return g;
      }
    }
  }
  // plain windows in the end walls (x = +-X, every period metres, glazing bars): the low sun comes in here
  if (uSide.x > 0.0 && abs(D.x) > 0.02) {
    float t = (sign(D.x) * uSide.x - P.x) / D.x;
    vec3 H = P + D * t;
    float k = floor(H.z / uSide.y + 0.5);
    float dz = H.z - k * uSide.y;
    float dy = H.y - uSide.w;
    if (abs(k) < 1.5 && abs(dz) < uSide.z && dy > 0.0 && dy < uSideH) {
      float bars = step(0.03, abs(dz)) * step(0.03, abs(dy - uSideH * 0.46));
      return vec4(1.0, 0.96, 0.88, bars);
    }
  }
  return vec4(0.0);
}
`;

const ROOM_FRAG = /* glsl */ `
#define LM_NO_ORNAMENT
uniform vec3 uRoomSky;
uniform vec3 uRoomLamp;
uniform vec3 uRoomSun;
uniform vec3 uRoomSunL;
uniform vec3 uRoomCam;
uniform vec3 uGlassLum;
uniform float uRoomT;
uniform float uLampOn;
varying vec3 vCol;
varying vec2 vPuv;
flat varying vec4 vMat;
varying vec2 vYN;
varying vec2 vBake;
varying vec3 vP;
varying vec3 vN;
${LM_COMMON}
${LM_SURFACE}
${GLASS_GLSL}
float rmFlame(float s) {
  return 0.86 + 0.14 * sin(uRoomT * 9.1 + s * 61.0) * sin(uRoomT * 13.7 + s * 23.0);
}
void main() {
  vec3 alb = vCol;
  float rough = fract(vMat.y);
  float metal = floor(vMat.y) / 9.0;
  vec3 emit = vec3(0.0);
  float pat = floor(vMat.x + 0.5);
  float seed = fract(vMat.w);
  vec2 q = vPuv;
  vec3 N = normalize(vN);
  float gloss = 0.0;
  vec2 FQ = fwidth(q) + 1e-5;
  float FM = max(FQ.x, FQ.y);
  if (pat < 26.5) {
    lmSurface(alb, rough, metal, emit, vYN);
    gloss = (1.0 - rough) * (1.0 - rough) * 0.5;
  } else if (pat < 27.5) {
    // flagstones: rows of unequal stones, chamfered joints, blotches, a path worn pale and glossy down the middle
    float rowH = 0.72;
    float row = floor(q.y / rowH);
    float rs = lmH12(vec2(row, seed * 31.0));
    float bw = 0.9 + 0.5 * rs;
    float qx = q.x + rs * 3.7;
    float col = floor(qx / bw);
    float h = lmH12(vec2(col, row) + seed * 17.0);
    float jx = 1.0 - smoothstep(0.012, 0.03 + FQ.x, abs(fract(qx / bw + 0.5) - 0.5) * bw);
    float jy = 1.0 - smoothstep(0.012, 0.03 + FQ.y, abs(fract(q.y / rowH + 0.5) - 0.5) * rowH);
    float j = max(jx, jy);
    alb *= 0.8 + 0.34 * h;
    alb *= 0.9 + 0.18 * lmNoise(q * vec2(1.3, 1.7) + h * 9.0);
    alb *= 0.96 + 0.08 * lmNoise(q * 11.0);
    alb = mix(alb, alb * 0.42, j * 0.85);
    float worn = exp(-(N.y > 0.5 ? vP.x * vP.x : 0.0) / 2.2);
    alb *= 1.0 + 0.1 * worn;
    gloss = (0.05 + 0.13 * worn) * (1.0 - j);
  } else if (pat < 28.5) {
    // encaustic: 15 cm chequer, each second tile with an inset quatrefoil
    vec2 c = floor(q / 0.15);
    vec2 f = fract(q / 0.15) - 0.5;
    float ck = mod(c.x + c.y, 2.0);
    vec3 red = vec3(0.34, 0.09, 0.06), buff = vec3(0.72, 0.57, 0.36), blk = vec3(0.07, 0.06, 0.06);
    vec3 t = ck < 0.5 ? red : buff;
    float r = length(f);
    float qf = (1.0 - smoothstep(0.17, 0.2, r)) + (1.0 - smoothstep(0.1, 0.13, length(abs(f) - 0.19)));
    t = mix(t, ck < 0.5 ? buff : blk, clamp(qf, 0.0, 1.0));
    float g = max(lmLines(q.x, 0.15, 0.004, FQ.x), lmLines(q.y, 0.15, 0.004, FQ.y));
    alb = mix(t, t * 0.55, g) * (0.86 + 0.26 * lmH12(c + 3.0));
    if (FM > 0.09) alb = mix(alb, (red + buff) * 0.5, smoothstep(0.09, 0.2, FM));
    gloss = 0.16;
  } else if (pat < 29.5) {
    // night blue with gold stars in a dropped grid
    vec2 p = q / 0.42;
    p.x += mod(floor(p.y), 2.0) * 0.5;
    vec2 f = fract(p) - 0.5;
    float a = atan(f.y, f.x);
    float r = length(f);
    float star = 1.0 - smoothstep(0.1 + 0.06 * cos(a * 5.0) - FM * 2.0, 0.1 + 0.06 * cos(a * 5.0) + FM * 2.0, r);
    alb = mix(alb * (0.88 + 0.2 * lmNoise(q * 0.8)), vec3(0.95, 0.72, 0.28), star);
    metal = star;
    gloss = 0.3 * star;
  } else if (pat < 30.5) {
    // limewash
    float n = lmNoise(q * 0.7 + seed * 19.0), n2 = lmNoise(q * 3.1);
    alb *= 0.88 + 0.16 * n + 0.05 * n2;
    float crack = 1.0 - smoothstep(0.0, 0.004 + FM, abs(lmNoise(q * 2.3 + 4.0) - 0.5));
    alb *= 1.0 - 0.05 * crack;
    float damp = 1.0 - smoothstep(0.1, 0.75 + 0.3 * n, vYN.x);
    alb *= 1.0 - 0.2 * damp;
    if (seed > 0.5) {
      // Victorian stencil: a dropped lozenge grid of red-ochre lines with a gold fleur in each
      vec2 p = q / 0.56;
      vec2 d = vec2(p.x + p.y, p.x - p.y);
      float line = max(lmLines(d.x, 1.0, 0.012, FM * 3.6), lmLines(d.y, 1.0, 0.012, FM * 3.6));
      vec2 f = fract(d) - 0.5;
      float r = length(f);
      float fleur = (1.0 - smoothstep(0.11, 0.13 + FM * 2.0, r + 0.06 * cos(atan(f.y, f.x) * 4.0)));
      float det = lmDetail(FM, 0.1);
      alb = mix(alb, vec3(0.42, 0.14, 0.09), line * 0.85 * det);
      alb = mix(alb, vec3(0.72, 0.5, 0.2), fleur * 0.9 * det);
    }
  } else if (pat < 31.5) {
    // oak: grain along u, a darker line every board, handled edges pale
    float g = lmNoise(vec2(q.x * 1.6, q.y * 38.0) + seed * 7.0);
    float g2 = lmNoise(vec2(q.x * 7.0, q.y * 110.0));
    alb *= 0.76 + 0.34 * g + 0.1 * g2;
    gloss = 0.1 + 0.05 * g;
  } else if (pat < 32.5) {
    // glass: glows with what is behind it; this pane's wall sees the sun or it does not
    vec4 gl = texture2D(uGlass, q);
    float outward = max(dot(-N, uRoomSunL), 0.0);
    emit = gl.rgb * gl.a * (uGlassLum.x + uGlassLum.y * smoothstep(0.0, 0.5, outward));
    alb = vec3(0.012);
  } else if (pat < 33.5) {
    alb = texture2D(uGlass, q).rgb * vCol;
    gloss = 0.04;
  } else if (pat < 34.5) {
    float on = seed < 0.5 ? uLampOn : 1.0;
    emit = vCol * vMat.z * on * rmFlame(seed);
    alb = vec3(0.0);
  } else if (pat < 35.5) {
    vec2 p = q * 1.4;
    float v = abs(sin(p.x * 2.1 + p.y * 1.3 + 3.0 * lmNoise(p * 1.1)));
    alb *= 0.9 + 0.1 * smoothstep(0.0, 0.25, v);
    gloss = 0.22;
  } else if (pat < 36.5) {
    // herringbone: 8 × 40 cm blocks
    vec2 p = q / 0.08;
    float k = floor((p.x + p.y) / 5.0);
    float odd = mod(k, 2.0);
    vec2 b = odd < 0.5 ? p : p.yx;
    float along = fract(b.x / 5.0 + floor(b.y) * 0.2);
    float cell = floor(b.y) + floor(b.x / 5.0 + floor(b.y) * 0.2) * 7.0;
    float h = lmH12(vec2(cell, k));
    float gap = max(lmLines(b.y, 1.0, 0.03, FM * 12.5), lmLines(along, 1.0, 0.02, FM * 2.5));
    alb *= 0.76 + 0.36 * h;
    alb *= 0.92 + 0.14 * lmNoise(vec2(b.x * 0.4, b.y * 4.0) + h * 11.0);
    alb = mix(alb, alb * 0.5, gap * 0.8);
    gloss = 0.14;
  } else if (pat < 37.5) {
    // tesserae: 3 cm cubes with dark grout, each a little different
    vec2 c = floor(q / 0.03);
    float h = lmH12(c + seed * 5.0);
    float g = max(lmLines(q.x, 0.03, 0.002, FQ.x), lmLines(q.y, 0.03, 0.002, FQ.y));
    float det = lmDetail(FM, 0.03);
    alb *= mix(1.0, (0.84 + 0.28 * h) * (1.0 - 0.45 * g), det);
    gloss = 0.1;
  } else if (pat < 38.5) {
    alb *= 0.92 + 0.12 * lmNoise(q * 9.0);
    metal = 1.0;
    gloss = 0.5;
  } else {
    vec2 c = floor(q / 0.6);
    float ck = mod(c.x + c.y, 2.0);
    float vein = 1.0 - smoothstep(0.0, 0.035 + FM, abs(lmNoise(q * 1.7 + c * 3.1) - 0.5));
    vec3 t = ck < 0.5 ? vec3(0.8, 0.76, 0.68) : vec3(0.075, 0.07, 0.075);
    t = mix(t, vec3(0.44, 0.41, 0.38), vein * 0.55);
    float g = max(lmLines(q.x, 0.6, 0.002, FQ.x), lmLines(q.y, 0.6, 0.002, FQ.y));
    alb = mix(t, t * 0.6, g);
    gloss = 0.2;
  }
  vec3 amb = uRoomSky * vBake.x + uRoomLamp * vBake.y;
  vec3 c = alb * amb;
  // sun through the panes
  float ndl = dot(N, uRoomSunL);
  if (ndl > 0.0 && uRoomSun.r + uRoomSun.g + uRoomSun.b > 0.001) {
    vec4 g = glassAlong(vP, uRoomSunL, 1.2);
    c += alb * uRoomSun * ndl * g.rgb * g.a;
  }
  // polished surfaces mirror the panes, a dull sky-tinted room otherwise
  if (gloss > 0.01) {
    vec3 V = normalize(uRoomCam - vP);
    vec3 R = reflect(-V, N);
    float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    vec3 tint = metal > 0.5 ? alb : vec3(1.0);
    vec4 gr = glassAlong(vP, R, 2.0 + rough * 3.0);
    vec3 env = amb * (R.y > 0.0 ? 0.55 + 0.45 * R.y : 0.3);
    vec3 refl = env + gr.rgb * gr.a * (uGlassLum.x + uGlassLum.z);
    c = mix(c, refl * tint, gloss * mix(F * 6.0, 1.0, metal));
  }
  gl_FragColor = vec4(c + emit, 1.0);
}
`;

const SHAFT_VERT = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aOut;
attribute vec3 aNrm;
attribute float aS;
uniform vec3 uSunW;
uniform float uShaftLen;
varying vec2 vUv;
varying float vS;
varying float vFacing;
void main() {
  vUv = aUv;
  vS = aS;
  float L = uSunW.y > 0.02 ? min(position.y / uSunW.y, uShaftLen) : 0.0;
  vec3 p = position - uSunW * L * aS;
  vec3 wp = p;
  vec3 V = normalize(cameraPosition - wp);
  // a sheet seen edge-on would read as a line: fade it out
  vFacing = smoothstep(0.1, 0.55, abs(dot(V, aNrm)));
  gl_Position = (dot(aOut, uSunW) > 0.03 && uSunW.y > 0.02) ? projectionMatrix * viewMatrix * vec4(p, 1.0) : vec4(0.0, 0.0, 2.0, 1.0);
}
`;

const SHAFT_FRAG = /* glsl */ `
uniform sampler2D uGlass;
uniform vec3 uRoomSun;
uniform float uShaftK;
varying vec2 vUv;
varying float vS;
varying float vFacing;
void main() {
  vec4 g = textureLod(uGlass, vUv, 3.0);
  float along = smoothstep(0.0, 0.05, vS) * pow(1.0 - vS, 1.4);
  gl_FragColor = vec4(g.rgb * g.a * uRoomSun * along * vFacing * uShaftK, 1.0);
}
`;

const MOTE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec4 uRoomFrame;
uniform vec3 uRoomSunL;
uniform vec3 uRoomSun;
uniform float uRoomT;
uniform float uMotePx;
varying vec3 vMote;
${GLASS_GLSL}
void main() {
  // position is the home spot in world space: drifts on slow circles
  float t = uRoomT * (0.05 + aSeed.w * 0.07);
  vec3 p = position + 0.5 * vec3(sin(t + aSeed.x * 6.28), 0.6 * sin(t * 1.3 + aSeed.y * 6.28), cos(t * 0.9 + aSeed.z * 6.28));
  vec2 d = p.xz - uRoomFrame.xy;
  vec3 L = vec3(uRoomFrame.z * d.x - uRoomFrame.w * d.y, p.y, uRoomFrame.w * d.x + uRoomFrame.z * d.y);
  vec4 g = glassAlong(L, uRoomSunL, 2.0);
  vMote = g.rgb * g.a * uRoomSun * (0.4 + 0.6 * aSeed.y);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uMotePx * (0.5 + aSeed.x) / max(-mv.z, 0.5), 1.0, 7.0);
  if (dot(vMote, vec3(1.0)) < 0.004) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}
`;

const MOTE_FRAG = /* glsl */ `
varying vec3 vMote;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.1, 0.5, length(c));
  gl_FragColor = vec4(vMote * a * 0.32, 1.0);
}
`;

const HALO_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aHalo;
attribute vec3 aTint;
uniform float uLampOn;
uniform float uRoomT;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = aCorner;
  float on = aHalo.y < 0.5 ? uLampOn : 1.0;
  vCol = aTint * aHalo.z * on * (0.9 + 0.1 * sin(uRoomT * 7.3 + aHalo.w));
  vec4 mv = viewMatrix * vec4(position, 1.0);
  mv.xy += aCorner * aHalo.x;
  gl_Position = projectionMatrix * mv;
}
`;

const HALO_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float r = length(vUv);
  float g = exp(-r * r * 5.0) * (1.0 - smoothstep(0.75, 1.0, r)) + exp(-r * r * 40.0) * 0.6;
  gl_FragColor = vec4(vCol * g, 1.0);
}
`;

export interface RoomLamp {
  x: number;
  y: number;
  z: number;
  /** relative strength (1 ≈ a chandelier) */
  k: number;
  /** falloff, metres at half strength */
  r?: number;
}

/** a window for the sky bake: centre, inward normal (room-local), area, how much it lets through */
export interface RoomWin {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  area: number;
  trans: number;
  /** a roof light */
  ny?: number;
}

export interface WindowRow {
  /** panes in x = ±X */
  X: number;
  z0: number;
  period: number;
  count: number;
  w: number;
  y0: number;
  h: number;
}

/** 2D outline (x, y) → x range at height y; null above / below */
function rangeAt(pts: [number, number][], y: number): [number, number] | null {
  let lo = Infinity,
    hi = -Infinity;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    if ((ay <= y && by >= y) || (by <= y && ay >= y)) {
      if (Math.abs(by - ay) < 1e-6) {
        lo = Math.min(lo, ax, bx);
        hi = Math.max(hi, ax, bx);
      } else {
        const x = ax + ((y - ay) / (by - ay)) * (bx - ax);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

export interface Hole {
  /** centre along the wall's u */
  u: number;
  /** outline, origin bottom-centre (v above the hole's bottom) */
  pts: [number, number][];
  v0: number;
}

const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Room {
  readonly name: string;
  /** near-only geometry */
  readonly K: Kit;
  readonly atlas: SignAtlas;
  readonly lamps: RoomLamp[] = [];
  readonly wins: RoomWin[] = [];
  /** sky-bake floor (light that has bounced around) */
  ambient = 0.1;
  row: WindowRow | null = null;
  roof: { y: number; hx: number; z0: number; z1: number } | null = null;
  /** only the roof lights a point with |x| < [0] and z < [1]; roof glazing tile [2] x [3] metres */
  roofOnly: [number, number, number, number] = [1e3, 1e3, 1.7, 2.15];
  /** the window row stands in z = +-X instead of x = +-X */
  swapAxes = false;
  /** plain end-wall windows for the sun: x = +-X, period, half width, sill, height */
  side: { X: number; period: number; hw: number; y0: number; h: number } | null = null;
  /** where the sun lookup applies (room-local z0, z1, x0, x1): nothing outside the zone sees these windows */
  zone: [number, number, number, number] = [-1e3, 1e3, -1e3, 1e3];
  /** glass atlas cells of the window row */
  cellStride = 0;
  cellW = 0;
  cellH = 0;
  cellV0 = 0;
  /** additive light sheets (world space): added by addShafts */
  readonly shaft = { pos: [] as number[], uv: [] as number[], out: [] as number[], nrm: [] as number[], s: [] as number[], idx: [] as number[] };
  readonly halos: { x: number; y: number; z: number; size: number; color: THREE.Color; k: number; always: boolean }[] = [];
  /** dust motes: world boxes */
  moteBox: THREE.Box3 | null = null;
  moteCount = 0;
  /** sky / lamp / glass tuning */
  skyK = 1;
  lampK = 1;
  sunK = 1;
  shaftK = 1;
  /** world rectangle the walker asks this room about */
  bounds: Rect = { x0: 0, z0: 0, x1: 0, z1: 0 };
  readonly free: Rect[] = [];
  readonly floors: { r: Rect; y: number | ((x: number, z: number) => number) }[] = [];
  readonly solids: Rect[] = [];
  readonly solidsY: { r: Rect; y0: number; y1: number }[] = [];
  /** floors overlap in plan: pick by the walker's feet; off the floors the footprint is solid and outside it the city answers */
  core: Rect | null = null;
  readonly discs: { x: number; z: number; r: number }[] = [];
  /** distance beyond which nothing of the room is drawn */
  near = 40;
  /** room origin + yaw (the landmark frame) */
  ox = 0;
  oz = 0;
  yaw = 0;
  c = 1;
  s = 0;
  /** room bounding box for the near test (world) */
  readonly box = new THREE.Box3();
  mesh: THREE.Mesh | null = null;
  fx: THREE.Object3D[] = [];
  material: THREE.ShaderMaterial | null = null;
  shaftMat: THREE.ShaderMaterial | null = null;
  moteMat: THREE.ShaderMaterial | null = null;
  haloMat: THREE.ShaderMaterial | null = null;

  constructor(name: string, atlasW: number, atlasH: number) {
    this.name = name;
    this.K = new Kit(new MeshBuilder(false));
    this.atlas = new SignAtlas(atlasW, atlasH);
  }

  /** the landmark frame (same as env.begin) */
  frame(x: number, z: number, yaw: number): void {
    this.K.b.setFrame(x, 0, z, yaw);
    this.ox = x;
    this.oz = z;
    this.yaw = yaw;
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  }

  /** room-local → world */
  wx(lx: number, lz: number): number {
    return this.ox + this.c * lx + this.s * lz;
  }
  wz(lx: number, lz: number): number {
    return this.oz - this.s * lx + this.c * lz;
  }

  /** local rectangle → world rectangle */
  rectL(x0: number, z0: number, x1: number, z1: number): Rect {
    const a = this.wx(x0, z0),
      b = this.wx(x1, z1),
      c = this.wz(x0, z0),
      d = this.wz(x1, z1);
    return { x0: Math.min(a, b), z0: Math.min(c, d), x1: Math.max(a, b), z1: Math.max(c, d) };
  }

  /** walkable floor at height y (local rectangle) */
  walk(x0: number, z0: number, x1: number, z1: number, y: number | ((x: number, z: number) => number) = 0): void {
    const r = this.rectL(x0, z0, x1, z1);
    this.free.push(r);
    this.floors.push({ r, y });
  }

  /** furniture the walker goes round (local rectangle) */
  block(x0: number, z0: number, x1: number, z1: number): void {
    this.solids.push(this.rectL(x0, z0, x1, z1));
  }

  /** furniture that only stands in the way of feet between y0 and y1 (a room with storeys) */
  blockAt(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void {
    this.solidsY.push({ r: this.rectL(x0, z0, x1, z1), y0, y1 });
  }

  /** world → room-local z */
  lz(x: number, z: number): number {
    return this.s * (x - this.ox) + this.c * (z - this.oz);
  }

  /** the floor in reach of these feet (NaN: the lowest) */
  level(x: number, z: number, feet: number): number | undefined {
    let best: number | undefined;
    let bd = Infinity;
    for (const f of this.floors) {
      const q = f.r;
      if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
      const y = typeof f.y === 'number' ? f.y : f.y(x, z);
      const d = Number.isNaN(feet) ? y : Math.abs(y - feet);
      if (d < bd && (Number.isNaN(feet) || d <= 0.62)) {
        bd = d;
        best = y;
      }
    }
    return best;
  }

  blockDisc(x: number, z: number, r: number): void {
    this.discs.push({ x: this.wx(x, z), z: this.wz(x, z), r });
  }

  /** subdivided flat quad p(u, v) for u0..u1, v0..v1 — the sky / lamp bake is per vertex. uv = metres (u, v) */
  grid(m: Mat, p: (u: number, v: number) => V3, u0: number, u1: number, v0: number, v1: number, du = 0.5, dv = 0.5, flip = false): void {
    const nu = Math.max(1, Math.ceil((u1 - u0) / du)),
      nv = Math.max(1, Math.ceil((v1 - v0) / dv));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = u0 + ((u1 - u0) * i) / nu,
          v = v0 + ((v1 - v0) * j) / nv;
        const P = p(u, v);
        pos.push(P[0], P[1], P[2]);
        uv.push(u, v);
      }
    const w = nu + 1;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = j * w + i,
          b = a + 1,
          c = a + w,
          d = c + 1;
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    this.addRaw(m, pos, uv, idx);
  }

  /** wall with holes in the plane p(u, v): trapezoids row by row, so the bake has vertices everywhere and round the openings */
  wall(m: Mat, p: (u: number, v: number) => V3, u0: number, u1: number, v0: number, v1: number, holes: Hole[], du = 0.5, dv = 0.35, flip = false, clip?: (v: number) => [number, number]): void {
    const breaks = new Set<number>([v0, v1]);
    for (let v = v0 + dv; v < v1 - 1e-3; v += dv) breaks.add(v);
    for (const h of holes) {
      for (const [, y] of h.pts) {
        const vv = h.v0 + y;
        if (vv > v0 && vv < v1) breaks.add(vv);
      }
    }
    const vs = [...breaks].sort((a, b) => a - b);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const span = (ua0: number, ua1: number, ub0: number, ub1: number, va: number, vb: number) => {
      const wid = Math.max(ua1 - ua0, ub1 - ub0);
      if (wid < 1e-3) return;
      const n = Math.max(1, Math.ceil(wid / du));
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = ua0 + (ua1 - ua0) * t,
          b = ub0 + (ub1 - ub0) * t;
        const A = p(a, va),
          B = p(b, vb);
        pos.push(A[0], A[1], A[2], B[0], B[1], B[2]);
        uv.push(a, va, b, vb);
      }
      for (let i = 0; i < n; i++) {
        const a = base + i * 2,
          b = a + 1,
          c = a + 2,
          d = a + 3;
        if (flip) idx.push(a, b, c, c, b, d);
        else idx.push(a, c, b, c, d, b);
      }
    };
    for (let r = 0; r < vs.length - 1; r++) {
      const va = vs[r],
        vb = vs[r + 1],
        vm = (va + vb) / 2;
      const inRow = holes
        .map((h) => ({ h, m: rangeAt(h.pts, vm - h.v0) }))
        .filter((o) => o.m)
        .sort((x, y) => x.h.u - y.h.u);
      const ea = clip ? clip(va) : ([u0, u1] as [number, number]),
        eb = clip ? clip(vb) : ([u0, u1] as [number, number]);
      let ca = ea[0],
        cb = eb[0];
      for (const { h } of inRow) {
        const ra = rangeAt(h.pts, Math.max(va - h.v0 + 1e-4, 0)) ?? [0, 0],
          rb = rangeAt(h.pts, vb - h.v0 - 1e-4) ?? [0, 0];
        span(ca, h.u + ra[0], cb, h.u + rb[0], va, vb);
        ca = h.u + ra[1];
        cb = h.u + rb[1];
      }
      span(ca, ea[1], cb, eb[1], va, vb);
    }
    this.addRaw(m, pos, uv, idx);
  }

  /** splayed reveal from an outline in the wall plane (grown by `grow`) back to the outline at depth d (plane p(u, v, depth)). */
  reveal(m: Mat, p: (u: number, v: number, depth: number) => V3, h: Hole, grow: number, d: number, flip = false): void {
    const n = h.pts.length;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let cx = 0,
      cy = 0;
    for (const [x, y] of h.pts) {
      cx += x / n;
      cy += y / n;
    }
    let run = 0;
    for (let i = 0; i <= n; i++) {
      const [x, y] = h.pts[i % n];
      if (i > 0) {
        const [px, py] = h.pts[i - 1];
        run += Math.hypot(x - px, y - py);
      }
      const k = Math.hypot(x - cx, y - cy) || 1;
      const gx = x + ((x - cx) / k) * grow,
        gy = y + ((y - cy) / k) * grow;
      const A = p(h.u + gx, h.v0 + gy, 0),
        B = p(h.u + x, h.v0 + y, d);
      pos.push(A[0], A[1], A[2], B[0], B[1], B[2]);
      uv.push(run, 0, run, d);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2,
        b = a + 1,
        c = a + 2,
        e = a + 3;
      if (flip) idx.push(a, c, b, c, e, b);
      else idx.push(a, b, c, c, b, e);
    }
    this.addRaw(m, pos, uv, idx);
  }

  /** flat convex polygon (fan round the centroid) with atlas uvs from a bounding rectangle */
  pane(m: Mat, p: (u: number, v: number) => V3, h: Hole, r: AtlasRect, flip = false): void {
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const [x, y] of h.pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const tex = (x: number, y: number): [number, number] => [r.u0 + ((x - x0) / (x1 - x0)) * (r.u1 - r.u0), r.v0 + ((y - y0) / (y1 - y0)) * (r.v1 - r.v0)];
    let cx = 0,
      cy = 0;
    for (const [x, y] of h.pts) {
      cx += x / h.pts.length;
      cy += y / h.pts.length;
    }
    const C = p(h.u + cx, h.v0 + cy);
    pos.push(C[0], C[1], C[2]);
    uv.push(...tex(cx, cy));
    for (const [x, y] of h.pts) {
      const P = p(h.u + x, h.v0 + y);
      pos.push(P[0], P[1], P[2]);
      uv.push(...tex(x, y));
    }
    const n = h.pts.length;
    for (let i = 0; i < n; i++) {
      const a = 1 + i,
        b = 1 + ((i + 1) % n);
      if (flip) idx.push(0, b, a);
      else idx.push(0, a, b);
    }
    this.addRaw(m, pos, uv, idx);
  }

  /** a picture quad facing +Z after yaw ry: x, z = centre, y = bottom */
  pic(r: AtlasRect, w: number, h: number, x: number, y: number, z: number, ry = 0, tint: THREE.ColorRepresentation = '#ffffff'): void {
    const c = Math.cos(ry),
      s = Math.sin(ry);
    const hx = (w / 2) * c,
      hz = -(w / 2) * s;
    this.K.poly(
      M(tint, RP.PIC, 0.6),
      [
        [x - hx, y, z - hz],
        [x + hx, y, z + hz],
        [x + hx, y + h, z + hz],
        [x - hx, y + h, z - hz],
      ],
      [
        [r.u0, r.v0],
        [r.u1, r.v0],
        [r.u1, r.v1],
        [r.u0, r.v1],
      ],
    );
  }

  private addRaw(m: Mat, pos: number[], uv: number[], idx: number[]): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.K.b.add(g, m, null, 'native');
    g.dispose();
  }

  /** a soft glow that also shows by day */
  halo(lx: number, y: number, lz: number, size: number, color: THREE.ColorRepresentation, k: number, always = false): void {
    this.halos.push({ x: this.wx(lx, lz), y, z: this.wz(lx, lz), size, color: new THREE.Color(color), k, always });
  }

  /** the lit sheets of one window: `n` lengthwise slices in each direction. Window corners in local coordinates (bottom-left, bottom-right, top-left), uvs from the atlas cell. */
  addShafts(bl: V3, br: V3, tl: V3, out: V3, r: AtlasRect, n = 3, nrmH: V3 = [0, 1, 0]): void {
    const S = this.shaft;
    const w = (p: V3): V3 => [this.wx(p[0], p[2]), p[1], this.wz(p[0], p[2])];
    const wout: V3 = [this.c * out[0] + this.s * out[2], out[1], -this.s * out[0] + this.c * out[2]];
    const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const tr: V3 = [tl[0] + br[0] - bl[0], tl[1] + br[1] - bl[1], tl[2] + br[2] - bl[2]];
    const sheet = (a: V3, b: V3, ua: [number, number], ub: [number, number], normal: V3) => {
      const base = S.pos.length / 3;
      const A = w(a),
        B = w(b);
      for (const [P, Q, s] of [
        [A, ua, 0],
        [B, ub, 0],
        [A, ua, 1],
        [B, ub, 1],
      ] as [V3, [number, number], number][]) {
        S.pos.push(P[0], P[1], P[2]);
        S.uv.push(Q[0], Q[1]);
        S.out.push(wout[0], wout[1], wout[2]);
        S.nrm.push(normal[0], normal[1], normal[2]);
        S.s.push(s);
      }
      S.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    };
    const eu: V3 = [br[0] - bl[0], br[1] - bl[1], br[2] - bl[2]];
    const lu = Math.hypot(eu[0], eu[1], eu[2]) || 1;
    const nrmV: V3 = [(this.c * eu[0] + this.s * eu[2]) / lu, 0, (-this.s * eu[0] + this.c * eu[2]) / lu];
    for (let i = 0; i < n; i++) {
      // slices at constant height (u runs across the window)
      const tv = (i + 0.5) / n;
      const uv0: [number, number] = [r.u0, r.v0 + (r.v1 - r.v0) * tv],
        uv1: [number, number] = [r.u1, r.v0 + (r.v1 - r.v0) * tv];
      sheet(lerp(bl, tl, tv), lerp(br, tr, tv), uv0, uv1, nrmH);
      // slices at constant u (v runs up the window)
      const tu = (i + 0.5) / n;
      const uv2: [number, number] = [r.u0 + (r.u1 - r.u0) * tu, r.v0],
        uv3: [number, number] = [r.u0 + (r.u1 - r.u0) * tu, r.v1];
      sheet(lerp(bl, br, tu), lerp(tl, tr, tu), uv2, uv3, nrmV);
    }
  }

  /** bake aBake and build the meshes */
  finish(ctx: CityContext, group: THREE.Group, g: { uTime: { value: number }; uSunDir: { value: THREE.Vector3 } }): void {
    const geo = this.K.b.toGeometry();
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    const N = geo.getAttribute('normal') as THREE.BufferAttribute;
    const bake = new Float32Array(P.count * 2);
    const world = new THREE.Matrix4().makeRotationY(this.yaw).setPosition(this.ox, 0, this.oz);
    _inv.copy(world).invert();
    _nm.getNormalMatrix(_inv);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_inv);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      let sky = this.ambient * (0.8 + 0.2 * _n.y);
      for (const w of this.wins) {
        const dx = w.x - _v.x,
          dy = w.y - _v.y,
          dz = w.z - _v.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.2;
        const d = Math.sqrt(d2);
        const c1 = (dx * _n.x + dy * _n.y + dz * _n.z) / d;
        const c2 = -(dx * w.nx + dy * (w.ny ?? 0) + dz * w.nz) / d;
        if (c2 <= 0) continue;
        // wrapped: half of what enters has already bounced off something
        sky += (w.trans * w.area * (0.35 + 0.65 * Math.max(c1, 0)) * c2) / (Math.PI * d2);
      }
      let lamp = 0;
      for (const l of this.lamps) {
        const dx = l.x - _v.x,
          dy = l.y - _v.y,
          dz = l.z - _v.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(d2) + 1e-3;
        const c = (dx * _n.x + dy * _n.y + dz * _n.z) / d;
        const r = l.r ?? 3.5;
        lamp += (l.k * (0.25 + 0.75 * Math.max(c, 0))) / (1 + d2 / (r * r));
      }
      bake[i * 2] = sky;
      bake[i * 2 + 1] = lamp;
    }
    geo.setAttribute('aBake', new THREE.BufferAttribute(bake, 2));
    this.box.copy(geo.boundingBox!);
    const tex = this.atlas.texture();
    tex.needsUpdate = true;
    const row = this.row;
    const roomU = {
      uRoomFrame: { value: new THREE.Vector4(this.ox, this.oz, this.c, this.s) },
      uRoomSky: { value: new THREE.Color() },
      uRoomLamp: { value: new THREE.Color() },
      uRoomSun: { value: new THREE.Color() },
      uRoomSunL: { value: new THREE.Vector3(0, 1, 0) },
      uRoomCam: { value: new THREE.Vector3() },
      uGlassLum: { value: new THREE.Vector3(1, 1, 1) },
      uRoomT: g.uTime,
      uLampOn: { value: 1 },
      uWinA: { value: row ? new THREE.Vector4(row.X, row.z0, row.period, row.count) : new THREE.Vector4(1e3, 0, 1, 0) },
      uWinB: { value: row ? new THREE.Vector4(row.w, row.y0, row.h, 0) : new THREE.Vector4(1, 0, 1, 0) },
      uCell: { value: new THREE.Vector4(0, this.cellStride, this.cellW, this.cellV0) },
      uCellH: { value: this.cellH },
      uZone: { value: new THREE.Vector4(this.zone[0], this.zone[1], this.zone[2], this.zone[3]) },
      uRoof: { value: this.roof ? new THREE.Vector4(this.roof.y, this.roof.hx, this.roof.z0, this.roof.z1) : new THREE.Vector4(0, 0, 0, 0) },
      uRoofOnly: { value: new THREE.Vector4(this.roofOnly[0], this.roofOnly[1], this.roofOnly[2], this.roofOnly[3]) },
      uWinSwap: { value: this.swapAxes ? 1 : 0 },
      uSide: { value: this.side ? new THREE.Vector4(this.side.X, this.side.period, this.side.hw, this.side.y0) : new THREE.Vector4(0, 1, 0, 0) },
      uSideH: { value: this.side ? this.side.h : 0 },
      uGlass: { value: tex },
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: ROOM_VERT, fragmentShader: ROOM_FRAG, vertexColors: true, uniforms: roomU as unknown as Record<string, THREE.IUniform> });
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = `landmarks-room-${this.name}`;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    this.mesh = mesh;
    group.add(mesh);
    // sun shafts
    if (this.shaft.pos.length) {
      const s = this.shaft;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
      sg.setAttribute('aUv', new THREE.Float32BufferAttribute(s.uv, 2));
      sg.setAttribute('aOut', new THREE.Float32BufferAttribute(s.out, 3));
      sg.setAttribute('aNrm', new THREE.Float32BufferAttribute(s.nrm, 3));
      sg.setAttribute('aS', new THREE.Float32BufferAttribute(s.s, 1));
      sg.setIndex(s.idx);
      this.shaftMat = new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        uniforms: { uGlass: { value: tex }, uRoomSun: roomU.uRoomSun, uSunW: { value: new THREE.Vector3(0, 1, 0) }, uShaftLen: { value: 13 }, uShaftK: { value: 0.03 * this.shaftK } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const sm = new THREE.Mesh(sg, this.shaftMat);
      sm.name = `landmarks-room-${this.name}-shafts`;
      sm.frustumCulled = false;
      sm.matrixAutoUpdate = false;
      sm.visible = false;
      sm.renderOrder = 5;
      this.fx.push(sm);
      group.add(sm);
    }
    // dust in the light
    if (this.moteBox && this.moteCount) {
      const b = this.moteBox;
      const n = this.moteCount;
      const pos = new Float32Array(n * 3);
      const seeds = new Float32Array(n * 4);
      let h = 12345;
      const rnd = () => {
        h = (h * 16807) % 2147483647;
        return h / 2147483647;
      };
      for (let i = 0; i < n; i++) {
        pos[i * 3] = b.min.x + (b.max.x - b.min.x) * rnd();
        pos[i * 3 + 1] = b.min.y + (b.max.y - b.min.y) * rnd();
        pos[i * 3 + 2] = b.min.z + (b.max.z - b.min.z) * rnd();
        for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rnd();
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      mg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
      this.moteMat = new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        uniforms: { ...roomU, uMotePx: { value: 11 } } as unknown as Record<string, THREE.IUniform>,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(mg, this.moteMat);
      pts.name = `landmarks-room-${this.name}-motes`;
      pts.frustumCulled = false;
      pts.matrixAutoUpdate = false;
      pts.visible = false;
      pts.renderOrder = 6;
      this.fx.push(pts);
      group.add(pts);
    }
    // halos
    if (this.halos.length) {
      const n = this.halos.length;
      const pos = new Float32Array(n * 12);
      const corner = new Float32Array(n * 8);
      const info = new Float32Array(n * 16);
      const tint = new Float32Array(n * 12);
      const idx: number[] = [];
      this.halos.forEach((o, i) => {
        const CS = [-1, -1, 1, -1, 1, 1, -1, 1];
        for (let k = 0; k < 4; k++) {
          pos.set([o.x, o.y, o.z], (i * 4 + k) * 3);
          corner.set([CS[k * 2], CS[k * 2 + 1]], (i * 4 + k) * 2);
          info.set([o.size, o.always ? 1 : 0, o.k, i * 1.7], (i * 4 + k) * 4);
          tint.set([o.color.r, o.color.g, o.color.b], (i * 4 + k) * 3);
        }
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      hg.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
      hg.setAttribute('aHalo', new THREE.BufferAttribute(info, 4));
      hg.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      hg.setIndex(idx);
      this.haloMat = new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: { uLampOn: roomU.uLampOn, uRoomT: g.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const hm = new THREE.Mesh(hg, this.haloMat);
      hm.name = `landmarks-room-${this.name}-halos`;
      hm.frustumCulled = false;
      hm.matrixAutoUpdate = false;
      hm.visible = false;
      hm.renderOrder = 7;
      this.fx.push(hm);
      group.add(hm);
    }
    void ctx;
  }
}

const _sky = new THREE.Color();
const _sun = new THREE.Color();
const _dayZen = new THREE.Color('#b9cfe6');
const _dayHor = new THREE.Color('#fff1d6');
const _dusk = new THREE.Color('#ffb070');
const _night = new THREE.Color('#2a3a5e');
const _sunDay = new THREE.Color('#fff2d8');
const _sunDusk = new THREE.Color('#ff9a4a');
const _lampC = new THREE.Color('#ffc98a');

/** the interiors of one city: near test, per-frame uniforms, what the walker asks */
export class Rooms {
  readonly list: Room[] = [];
  private inside: Room | null = null;
  /** the walker's feet (NaN: not walking), for rooms with storeys */
  feet = NaN;

  add(r: Room): Room {
    this.list.push(r);
    return r;
  }

  /** near test + light of the moment */
  frame(ctx: CityContext, cam: THREE.Camera): void {
    const cp = cam.position;
    const day = ctx.uniforms.uDaylight.value;
    const dusk = ctx.uniforms.uDusk.value;
    const lights = ctx.uniforms.uLights.value;
    const S = ctx.uniforms.uSunDir.value;
    const sunUp = Math.min(1, Math.max(0, S.y / 0.08));
    for (const r of this.list) {
      const near = r.box.distanceToPoint(cp) < r.near;
      if (r.mesh) r.mesh.visible = near;
      const inBox = r.box.distanceToPoint(cp) < 8;
      for (const f of r.fx) f.visible = inBox;
      if (!near || !r.material) continue;
      const u = r.material.uniforms;
      _sky.copy(_night).multiplyScalar(0.22).lerp(_dayZen, day).lerp(_dayHor, 0.35 * day);
      _sky.lerp(_dusk, dusk * 0.45);
      (u.uRoomSky.value as THREE.Color).copy(_sky).multiplyScalar(r.skyK * (0.05 + 0.95 * day));
      (u.uRoomLamp.value as THREE.Color).copy(_lampC).multiplyScalar(r.lampK * (0.4 + 0.6 * lights));
      _sun.copy(_sunDay).lerp(_sunDusk, dusk).multiplyScalar(r.sunK * sunUp * day * 3.2);
      (u.uRoomSun.value as THREE.Color).copy(_sun);
      // room-local sun, room-local camera
      const c = r.c,
        s = r.s;
      (u.uRoomSunL.value as THREE.Vector3).set(c * S.x - s * S.z, S.y, s * S.x + c * S.z);
      const dx = cp.x - r.ox,
        dz = cp.z - r.oz;
      (u.uRoomCam.value as THREE.Vector3).set(c * dx - s * dz, cp.y, s * dx + c * dz);
      (u.uGlassLum.value as THREE.Vector3).set(0.05 + 1.5 * day, 1.5 * sunUp * day, 0.2);
      u.uLampOn.value = 0.25 + 0.75 * lights;
      if (r.shaftMat) {
        const su = r.shaftMat.uniforms;
        (su.uSunW.value as THREE.Vector3).copy(S);
        // a low sun runs its sheets through the whole room: thinner, shorter
        su.uShaftK.value = 0.03 * r.shaftK * (0.45 + 0.55 * Math.min(1, Math.max(0, (S.y - 0.05) / 0.3)));
      }
    }
  }

  // ── the walker (ui/camera/walkSurface.ts) ───────────────────────────────────────────────────
  private at(x: number, z: number): Room | null {
    const i = this.inside;
    if (i) {
      const b = i.bounds;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return i;
    }
    for (const r of this.list) {
      const b = r.bounds;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
        this.inside = r;
        return r;
      }
    }
    return null;
  }

  /** is (x, z) solid? undefined = not in any room: ask the city */
  solid(x: number, z: number): boolean | undefined {
    const r = this.at(x, z);
    if (!r) return undefined;
    if (r.core) {
      const y = r.level(x, z, this.feet);
      if (y === undefined) return x >= r.core.x0 && x <= r.core.x1 && z >= r.core.z0 && z <= r.core.z1 ? true : undefined;
      for (const s of r.solidsY) if (y >= s.y0 && y <= s.y1 && x >= s.r.x0 && x <= s.r.x1 && z >= s.r.z0 && z <= s.r.z1) return true;
      for (const s of r.solids) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return true;
      for (const d of r.discs) if ((x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r) return true;
      return false;
    }
    let free = false;
    for (const f of r.free) {
      if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) {
        free = true;
        break;
      }
    }
    if (!free) return true;
    for (const s of r.solids) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return true;
    for (const d of r.discs) if ((x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r) return true;
    return false;
  }

  /** floor height at (x, z); undefined = not on a room's floor */
  height(x: number, z: number): number | undefined {
    const r = this.at(x, z);
    if (!r) return undefined;
    if (r.core) return r.level(x, z, this.feet);
    for (const f of r.floors) {
      const q = f.r;
      if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return typeof f.y === 'number' ? f.y : f.y(x, z);
    }
    return undefined;
  }
}

