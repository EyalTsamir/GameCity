// Procedural toy-vehicle models + the shared decal atlas.
//
// Every model is one merged BufferGeometry, facing +Z (front), ground at y = 0,
// left side = +X, right side = -X. Per-vertex attributes drive the shared
// vehicle shader (see vehicleMaterial.ts):
//   color   base colour (white where the instance body colour should show)
//   aMeta   x: paint mask (1 = multiply by instance colour)
//           y: light type (LIGHT_*), z: decal row step in UV units, w: roughness multiplier
//   aWheel  xyz: wheel centre, w: 0 none / 1 wheel / 2 steered (front) wheel / 3 crank (pedals, angle aInst2.y)
//   aPart   0 = always drawn, n = only drawn for instance variant n-1, 16 + bits = drawn for the variants whose
//           bit is set (two-wheelers share parts between variants)
//   uv      atlas coordinates (non-decal parts point at a white texel)

//
// Levels of detail (buildModel(kind, lod)): every model is built three times by the
// same code, the shape helpers below simplifying with the level —
//   0  full detail (close-ups)
//   1  mid: 2-facet rounded bodies, bevelled small parts, 10-sided wheels with a hub
//      disc (no spokes), paper-thin parts as single quads, sub-2.5 cm parts dropped
//   2  far: bevelled bodies, plain boxes, 6-sided wheels, sub-6 cm parts dropped
// Lights and decals are always kept (they glow / carry the colour identity).
// The merged geometry is indexed (welded) so shared vertices are shaded once.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelKind } from './specs';
import { loftCar, topAt, type CarShape } from './carBody';

/** number of detail levels buildModel() can produce */
export const MODEL_LODS = 3;
/** level the shape helpers are currently building at (set by buildModel) */
let LOD = 0;
/** parts whose second-largest extent is below this are dropped (per level; lights/decals exempt) */
const MIN_FEATURE = [0, 0.025, 0.12];
/** radial segment count for round parts at the current level */
const sg = (n: number): number => (LOD === 0 ? n : LOD === 1 ? Math.max(6, Math.round(n * 0.62)) : Math.max(5, Math.round(n * 0.42)));

export const LIGHT_HEAD = 1;
export const LIGHT_TAIL = 2;
export const LIGHT_BLINK_L = 3;
export const LIGHT_BLINK_R = 4;
export const LIGHT_POLICE_RED = 5;
export const LIGHT_POLICE_BLUE = 6;
export const LIGHT_TAXI = 7;
export const LIGHT_SIGN = 8;
export const LIGHT_CABIN = 9;

// ───────────────────────────────────────────────────────────── atlas ──

export const ATLAS_SIZE = 1024;
export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const R_WHITE: AtlasRect = { x: 0, y: 0, w: 16, h: 16 };
const R_BUS_SIGN: AtlasRect = { x: 0, y: 16, w: 256, h: 32 }; // 4 rows downwards (route variants)
const R_TAXI: AtlasRect = { x: 256, y: 0, w: 128, h: 32 };
const R_POLICE: AtlasRect = { x: 256, y: 32, w: 256, h: 48 };
const R_DELIVERY: AtlasRect = { x: 256, y: 96, w: 256, h: 96 }; // 4 rows downwards (logos)
const R_ICECREAM: AtlasRect = { x: 0, y: 144, w: 256, h: 96 };
const R_BUS_SIDE: AtlasRect = { x: 0, y: 240, w: 256, h: 48 };
const R_TARP: AtlasRect = { x: 0, y: 288, w: 256, h: 96 };
// close-up detail (W2): number plates (4 × 4 cells, one per vehicle by its phase), lamp lenses, tyre strip,
// wheel faces for the middle level, grilles
const R_PLATE: AtlasRect = { x: 512, y: 0, w: 128, h: 28 };
const PLATE_GRID = 4;
export const PLATE_CELLS = { n: PLATE_GRID, du: R_PLATE.w / ATLAS_SIZE, dv: R_PLATE.h / ATLAS_SIZE };
const R_HEAD: AtlasRect = { x: 512, y: 112, w: 128, h: 64 };
const R_HEAD_ROUND: AtlasRect = { x: 640, y: 112, w: 64, h: 64 };
const R_TAIL: AtlasRect = { x: 704, y: 112, w: 128, h: 64 };
const R_BUS_HEAD: AtlasRect = { x: 832, y: 112, w: 128, h: 64 };
const R_TYRE: AtlasRect = { x: 512, y: 176, w: 512, h: 64 };
const R_FACE_ALLOY: AtlasRect = { x: 512, y: 240, w: 128, h: 128 };
const R_FACE_CAP: AtlasRect = { x: 640, y: 240, w: 128, h: 128 };
const R_FACE_STEEL: AtlasRect = { x: 768, y: 240, w: 128, h: 128 };
const R_HUBCAP: AtlasRect = { x: 896, y: 240, w: 128, h: 128 };
const R_GRILLE: AtlasRect = { x: 512, y: 368, w: 128, h: 48 };
const R_BUS_GRILLE: AtlasRect = { x: 640, y: 368, w: 128, h: 48 };

/** close-up detail textures (plates, lamps, tyres, wheel faces, grilles) */
function drawDetailAtlas(g: CanvasRenderingContext2D, font: (px: number, w?: string) => string): void {
  // number plates: white reflective, blue band with "TH", black letters; 16 different registrations
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  for (let k = 0; k < PLATE_GRID * PLATE_GRID; k++) {
    const x = R_PLATE.x + (k % PLATE_GRID) * R_PLATE.w,
      y = R_PLATE.y + Math.floor(k / PLATE_GRID) * R_PLATE.h;
    g.fillStyle = '#1b1c1e';
    g.fillRect(x, y, R_PLATE.w, R_PLATE.h);
    g.fillStyle = '#f2f0ea';
    g.fillRect(x + 2, y + 2, R_PLATE.w - 4, R_PLATE.h - 4);
    g.fillStyle = '#1f4fb4';
    g.fillRect(x + 2, y + 2, 14, R_PLATE.h - 4);
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(x + 9, y + 9, 3.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = font(7);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TH', x + 9, y + R_PLATE.h - 8);
    const reg = `${L[(rnd() * L.length) | 0]}${L[(rnd() * L.length) | 0]}-${100 + ((rnd() * 900) | 0)}-${L[(rnd() * L.length) | 0]}${L[(rnd() * L.length) | 0]}`;
    g.fillStyle = '#141414';
    g.font = font(19);
    g.fillText(reg, x + 18 + (R_PLATE.w - 20) / 2, y + R_PLATE.h / 2 + 1, R_PLATE.w - 24);
  }
  // headlamp cluster: dark housing, two reflector bowls with chrome rings, an LED strip along the bottom
  {
    const r = R_HEAD;
    g.fillStyle = '#2b2e33';
    g.fillRect(r.x, r.y, r.w, r.h);
    const bowl = (cx: number, cy: number, rad: number) => {
      const gr = g.createRadialGradient(cx - rad * 0.2, cy - rad * 0.25, rad * 0.1, cx, cy, rad);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.35, '#d7dde3');
      gr.addColorStop(0.8, '#8d959e');
      gr.addColorStop(1, '#4a5058');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c9ced4';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#fbfbf6';
      g.beginPath();
      g.arc(cx, cy, rad * 0.32, 0, Math.PI * 2);
      g.fill();
    };
    bowl(r.x + 34, r.y + 28, 20);
    bowl(r.x + 86, r.y + 30, 15);
    g.fillStyle = '#f4f8ff';
    g.fillRect(r.x + 10, r.y + r.h - 12, r.w - 30, 5);
    g.fillStyle = '#e8a640';
    g.fillRect(r.x + r.w - 18, r.y + 10, 12, r.h - 22);
  }
  {
    const r = R_HEAD_ROUND;
    g.fillStyle = '#3a3d42';
    g.fillRect(r.x, r.y, r.w, r.h);
    const cx = r.x + r.w / 2,
      cy = r.y + r.h / 2;
    const gr = g.createRadialGradient(cx - 6, cy - 7, 3, cx, cy, 30);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, '#cfd5db');
    gr.addColorStop(1, '#69717a');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, 29, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    for (let i = -24; i <= 24; i += 6) {
      g.beginPath();
      g.moveTo(cx + i, cy - 26);
      g.lineTo(cx + i, cy + 26);
      g.stroke();
    }
    g.strokeStyle = '#d9dde2';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, 29.5, 0, Math.PI * 2);
    g.stroke();
  }
  // tail lamp: ribbed red lens, brighter inner bars, a white reversing lamp
  {
    const r = R_TAIL;
    g.fillStyle = '#7a1414';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#d43a2e';
    g.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    g.fillStyle = '#ff7a62';
    for (let i = 0; i < 3; i++) g.fillRect(r.x + 10, r.y + 10 + i * 15, 70, 6);
    g.fillStyle = '#efe9e4';
    g.fillRect(r.x + 88, r.y + 10, 30, 22);
    g.fillStyle = '#e8902f';
    g.fillRect(r.x + 88, r.y + 38, 30, 16);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let x = r.x + 6; x < r.x + r.w - 4; x += 5) {
      g.beginPath();
      g.moveTo(x, r.y + 4);
      g.lineTo(x, r.y + r.h - 4);
      g.stroke();
    }
  }
  // bus headlamps: twin round lamps in a black bezel
  {
    const r = R_BUS_HEAD;
    g.fillStyle = '#18191b';
    g.fillRect(r.x, r.y, r.w, r.h);
    for (const cx of [r.x + 34, r.x + 94]) {
      const gr = g.createRadialGradient(cx - 5, r.y + 26, 3, cx, r.y + 32, 24);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.5, '#d2d8de');
      gr.addColorStop(1, '#5e666e');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, r.y + 32, 23, 0, Math.PI * 2);
      g.fill();
    }
  }
  // tyre strip (u around the wheel, v across the profile: inner sidewall → tread → outer sidewall; matches
  // the lathe in tyre()): rubber with lettering on both walls, tread blocks with grooves
  {
    const r = R_TYRE;
    g.fillStyle = '#2a2c2f';
    g.fillRect(r.x, r.y, r.w, r.h);
    const vy = (v: number) => r.y + r.h - v * r.h;
    // tread band (v 0.36..0.64)
    const t0 = vy(0.64),
      t1 = vy(0.36);
    g.fillStyle = '#2f3134';
    g.fillRect(r.x, t0, r.w, t1 - t0);
    g.fillStyle = '#151618';
    for (let x = 0; x < r.w; x += 8) {
      g.fillRect(r.x + x, t0, 2, (t1 - t0) * 0.42);
      g.fillRect(r.x + x + 4, t0 + (t1 - t0) * 0.58, 2, (t1 - t0) * 0.42);
    }
    g.fillRect(r.x, t0 + (t1 - t0) * 0.3, r.w, 2);
    g.fillRect(r.x, t0 + (t1 - t0) * 0.68, r.w, 2);
    // lettering (twice around) on both sidewalls, upside-down on the inner one is invisible anyway
    g.fillStyle = '#5a5d61';
    g.font = font(9);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const v of [0.14, 0.86])
      for (const u of [0.25, 0.75]) {
        g.fillText('TINYHAVEN  ALLGRIP', r.x + u * r.w - 60, vy(v));
        g.fillText('205/55 R16  91V', r.x + u * r.w + 60, vy(v));
      }
  }
  // wheel faces (middle level: one textured disc): tyre ring, rim lip, spokes / cap / steel disc
  const face = (r: AtlasRect, kind: 'alloy' | 'cap' | 'steel') => {
    const cx = r.x + r.w / 2,
      cy = r.y + r.h / 2,
      R = r.w / 2 - 1;
    g.fillStyle = '#2a2c2f';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#323438';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    const rr = R * 0.64;
    g.fillStyle = kind === 'steel' ? '#d8dadc' : '#1a1c1f';
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c8cdd2';
    g.lineWidth = 3;
    g.stroke();
    if (kind === 'alloy') {
      g.fillStyle = '#c6cbd0';
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        g.beginPath();
        g.moveTo(-3, 0);
        g.lineTo(3, 0);
        g.lineTo(7, -rr + 2);
        g.lineTo(-7, -rr + 2);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.fillStyle = '#9aa0a6';
      g.beginPath();
      g.arc(cx, cy, 8, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'cap') {
      const gr = g.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, rr);
      gr.addColorStop(0, '#eef1f3');
      gr.addColorStop(1, '#9ca3aa');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, rr - 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4b5056';
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI * 2) / 10;
        g.beginPath();
        g.arc(cx + Math.cos(a) * rr * 0.68, cy + Math.sin(a) * rr * 0.68, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.fillStyle = '#8e9398';
      g.beginPath();
      g.arc(cx, cy, rr * 0.45, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2e3135';
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI * 2) / 10;
        g.beginPath();
        g.arc(cx + Math.cos(a) * rr * 0.32, cy + Math.sin(a) * rr * 0.32, 2.4, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx + Math.cos(a + 0.31) * rr * 0.72, cy + Math.sin(a + 0.31) * rr * 0.72, 4, 7, a + 0.31, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  face(R_FACE_ALLOY, 'alloy');
  face(R_FACE_CAP, 'cap');
  face(R_FACE_STEEL, 'steel');
  // plastic hub cap (close level, on a domed disc): radial vents, centre badge
  {
    const r = R_HUBCAP;
    const cx = r.x + r.w / 2,
      cy = r.y + r.h / 2;
    const gr = g.createRadialGradient(cx - 10, cy - 14, 4, cx, cy, r.w / 2);
    gr.addColorStop(0, '#f3f5f7');
    gr.addColorStop(1, '#9aa1a8');
    g.fillStyle = gr;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#2c3034';
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI * 2) / 12;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      g.fillRect(-3, -54, 6, 24);
      g.restore();
    }
    g.strokeStyle = '#7f868d';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, 26, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#5b6168';
    g.beginPath();
    g.arc(cx, cy, 11, 0, Math.PI * 2);
    g.fill();
  }
  // grilles: car honeycomb, bus horizontal slats
  {
    const r = R_GRILLE;
    g.fillStyle = '#0f1012';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#34373c';
    for (let y = 2; y < r.h - 2; y += 6)
      for (let x = (y / 6) % 2 ? 4 : 1; x < r.w - 2; x += 7) {
        g.beginPath();
        g.moveTo(r.x + x, r.y + y + 2);
        g.lineTo(r.x + x + 3, r.y + y);
        g.lineTo(r.x + x + 6, r.y + y + 2);
        g.lineTo(r.x + x + 3, r.y + y + 4);
        g.fill();
      }
    g.strokeStyle = '#8a9096';
    g.lineWidth = 2;
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
  {
    const r = R_BUS_GRILLE;
    g.fillStyle = '#141517';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#4a4e54';
    for (let y = 4; y < r.h - 3; y += 6) g.fillRect(r.x + 3, r.y + y, r.w - 6, 2);
  }
}

const WHITE_U = (R_WHITE.x + R_WHITE.w / 2) / ATLAS_SIZE;
const WHITE_V = 1 - (R_WHITE.y + R_WHITE.h / 2) / ATLAS_SIZE;

export interface BusRouteSign {
  number: string;
  text: string;
  color: string;
}

/** Draw the decal atlas (signs, logos, liveries). */
export function makeAtlas(routes: BusRouteSign[]): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_SIZE;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  const font = (px: number, w = 'bold') => `${w} ${px}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;

  // bus destination signs: amber LED text on black, route badge on the left
  for (let k = 0; k < 4; k++) {
    const r = routes[k] ?? { number: String(k + 1), text: 'NOT IN SERVICE', color: '#666666' };
    const y = R_BUS_SIGN.y + k * R_BUS_SIGN.h;
    g.fillStyle = '#16181b';
    g.fillRect(R_BUS_SIGN.x, y, R_BUS_SIGN.w, R_BUS_SIGN.h);
    g.fillStyle = r.color;
    g.fillRect(R_BUS_SIGN.x + 4, y + 3, 34, R_BUS_SIGN.h - 6);
    g.fillStyle = '#ffffff';
    g.font = font(22);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(r.number, R_BUS_SIGN.x + 21, y + R_BUS_SIGN.h / 2 + 1);
    g.fillStyle = '#ffb53b';
    g.font = font(19);
    g.textAlign = 'left';
    g.fillText(r.text.toUpperCase(), R_BUS_SIGN.x + 46, y + R_BUS_SIGN.h / 2 + 1, R_BUS_SIGN.w - 52);
  }

  // taxi roof sign
  g.fillStyle = '#ffd531';
  g.fillRect(R_TAXI.x, R_TAXI.y, R_TAXI.w, R_TAXI.h);
  g.fillStyle = '#1b1b1b';
  g.font = font(24);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TAXI', R_TAXI.x + R_TAXI.w / 2, R_TAXI.y + R_TAXI.h / 2 + 1);

  // police livery: Battenburg band with lettering
  {
    const r = R_POLICE;
    g.fillStyle = '#1f3f9a';
    g.fillRect(r.x, r.y, r.w, r.h);
    const sq = 12;
    for (let i = 0; i < r.w / sq; i++) {
      g.fillStyle = i % 2 === 0 ? '#ffd23f' : '#1f3f9a';
      g.fillRect(r.x + i * sq, r.y, sq, sq);
      g.fillStyle = i % 2 === 1 ? '#ffd23f' : '#1f3f9a';
      g.fillRect(r.x + i * sq, r.y + r.h - sq, sq, sq);
    }
    g.fillStyle = '#ffffff';
    g.font = font(22);
    g.fillText('POLICE', r.x + r.w / 2, r.y + r.h / 2 + 1);
  }

  // delivery van logos
  const logos: { bg: string; fg: string; text: string; sub: string; icon: (x: number, y: number) => void }[] = [
    {
      bg: '#f6ead0',
      fg: '#7a4526',
      text: 'Haven Bakery',
      sub: 'fresh every morning',
      icon: (x, y) => {
        g.fillStyle = '#d29a52';
        g.beginPath();
        g.ellipse(x, y, 26, 15, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#8a5428';
        g.lineWidth = 3;
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(x + i * 11 - 5, y - 9);
          g.lineTo(x + i * 11 + 5, y + 9);
          g.stroke();
        }
      },
    },
    {
      bg: '#d83a2e',
      fg: '#ffffff',
      text: 'HAVEN POST',
      sub: 'letters & parcels',
      icon: (x, y) => {
        g.fillStyle = '#ffd23f';
        g.fillRect(x - 26, y - 16, 52, 32);
        g.strokeStyle = '#d83a2e';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x - 26, y - 16);
        g.lineTo(x, y + 4);
        g.lineTo(x + 26, y - 16);
        g.stroke();
      },
    },
    {
      bg: '#2f78b0',
      fg: '#ffffff',
      text: 'Fresh Fish Co.',
      sub: 'straight off the quay',
      icon: (x, y) => {
        g.fillStyle = '#bfe3f2';
        g.beginPath();
        g.ellipse(x - 4, y, 22, 12, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x + 14, y);
        g.lineTo(x + 30, y - 12);
        g.lineTo(x + 30, y + 12);
        g.closePath();
        g.fill();
        g.fillStyle = '#2f78b0';
        g.beginPath();
        g.arc(x - 16, y - 3, 3, 0, Math.PI * 2);
        g.fill();
      },
    },
    {
      bg: '#4f9a5b',
      fg: '#ffffff',
      text: 'Bloom Florist',
      sub: 'flowers for every day',
      icon: (x, y) => {
        const cols = ['#f7a8c4', '#ffd23f', '#ffffff'];
        for (let i = 0; i < 3; i++) {
          const cx = x - 16 + i * 16,
            cy = y + (i === 1 ? -6 : 4);
          g.fillStyle = cols[i];
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            g.beginPath();
            g.arc(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 5, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = '#e9a23b';
          g.beginPath();
          g.arc(cx, cy, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      },
    },
  ];
  logos.forEach((L, k) => {
    const r = R_DELIVERY;
    const y = r.y + k * r.h;
    g.fillStyle = L.bg;
    g.fillRect(r.x, y, r.w, r.h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(r.x, y + r.h - 16, r.w, 6);
    L.icon(r.x + 40, y + r.h / 2);
    g.fillStyle = L.fg;
    g.textAlign = 'left';
    g.font = font(25);
    g.fillText(L.text, r.x + 76, y + r.h / 2 - 8, r.w - 84);
    g.font = font(15, 'italic');
    g.fillText(L.sub, r.x + 78, y + r.h / 2 + 17, r.w - 86);
  });

  // ice-cream van side
  {
    const r = R_ICECREAM;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 === 0 ? '#fbe3ec' : '#ffffff';
      g.fillRect(r.x + i * 16, r.y, 16, r.h);
    }
    g.fillStyle = '#e9547e';
    g.fillRect(r.x, r.y + r.h - 18, r.w, 18);
    g.fillStyle = '#7b3f26';
    g.textAlign = 'center';
    g.font = font(34);
    g.fillText('ICE CREAM', r.x + r.w / 2 + 18, r.y + 38, r.w - 50);
    g.fillStyle = '#ffffff';
    g.font = font(13);
    g.fillText('cones · lollies · sundaes', r.x + r.w / 2, r.y + r.h - 9);
    // cone icon
    g.fillStyle = '#d9a35b';
    g.beginPath();
    g.moveTo(r.x + 14, r.y + 34);
    g.lineTo(r.x + 34, r.y + 34);
    g.lineTo(r.x + 24, r.y + 70);
    g.closePath();
    g.fill();
    g.fillStyle = '#f48fb1';
    g.beginPath();
    g.arc(r.x + 24, r.y + 30, 11, 0, Math.PI * 2);
    g.fill();
  }

  // bus side lettering
  {
    const r = R_BUS_SIDE;
    g.fillStyle = '#f3efe6';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#4a4f57';
    g.textAlign = 'center';
    g.font = font(23);
    g.fillText('TINYHAVEN TRANSIT', r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 10);
  }

  // lorry tarp
  {
    const r = R_TARP;
    g.fillStyle = '#6d8768';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#e9e1c8';
    g.fillRect(r.x, r.y + 12, r.w, 5);
    g.fillRect(r.x, r.y + r.h - 17, r.w, 5);
    g.textAlign = 'center';
    g.font = font(30);
    g.fillText('HAVEN HAULAGE', r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 16);
  }

  drawDetailAtlas(g, font);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ─────────────────────────────────────────────────────────── builder ──

export interface PartOpts {
  color: THREE.ColorRepresentation;
  paint?: boolean;
  light?: number;
  rough?: number;
  part?: number;
  wheel?: { x: number; y: number; z: number; front: boolean; crank?: boolean };
  /** map the geometry's own 0..1 UVs into this atlas rect */
  decal?: AtlasRect;
  /** UV step per instance variant (rows downwards) */
  decalRows?: boolean;
  /** a number plate: the decal cell is picked per vehicle (PLATE_CELLS) */
  plate?: boolean;
  /** close-up detail class + data for the shader (vehicleMaterial.ts header: 1 car paint, 2/4/5 glass, 3 tyre) */
  det?: Det;
  /** surface finish (see FINISH); default: clear-coated for painted parts without a decal, glass for GLASS,
   *  chrome for CHROME / RIM, plain otherwise */
  finish?: Finish;
}

/** surface finishes, packed into aMeta.w as roughness + 4 × class (vehicleMaterial.ts decodes them) */
type Finish = 'plain' | 'coat' | 'glass' | 'chrome';
const FINISH: Record<Finish, number> = { plain: 0, coat: 1, glass: 2, chrome: 3 };

export interface Det {
  c: number;
  a?: readonly number[];
  b?: readonly number[];
}

const _col = new THREE.Color();

class Builder {
  private geos: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, o: PartOpts): this {
    if (LOD > 0 && !o.light && !o.decal) {
      // too small to read at this level → drop
      g.computeBoundingBox();
      const s = g.boundingBox!.getSize(_size);
      const e = [s.x, s.y, s.z].sort((a, b) => b - a);
      if (e[1] < MIN_FEATURE[LOD]) {
        g.dispose();
        return this;
      }
    }
    const geo = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    const n = geo.attributes.position.count;
    _col.set(o.color);
    const col = new Float32Array(n * 3);
    const meta = new Float32Array(n * 4);
    const wheel = new Float32Array(n * 4);
    const part = new Float32Array(n);
    const detA = new Float32Array(n * 4);
    const detB = new Float32Array(n * 4);
    const dt = o.det;
    const uv = new Float32Array(n * 2);
    const srcUv = geo.attributes.uv as THREE.BufferAttribute | undefined;
    const step = o.plate ? -1 : o.decal && o.decalRows ? o.decal.h / ATLAS_SIZE : 0;
    const fin = FINISH[o.finish ?? (o.paint && !o.decal && !o.light ? 'coat' : o.color === GLASS ? 'glass' : o.color === CHROME || o.color === RIM ? 'chrome' : 'plain')];
    const rough = Math.min(3.9, o.rough ?? 1) + 4 * fin;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _col.r;
      col[i * 3 + 1] = _col.g;
      col[i * 3 + 2] = _col.b;
      meta[i * 4] = o.paint ? 1 : 0;
      meta[i * 4 + 1] = o.light ?? 0;
      meta[i * 4 + 2] = step;
      meta[i * 4 + 3] = rough;
      if (o.wheel) {
        wheel[i * 4] = o.wheel.x;
        wheel[i * 4 + 1] = o.wheel.y;
        wheel[i * 4 + 2] = o.wheel.z;
        wheel[i * 4 + 3] = o.wheel.crank ? 3 : o.wheel.front ? 2 : 1;
      }
      // the detail class rides in aPart (+100 per class; vehicleMaterial.ts splits it): 16 attributes max
      part[i] = (o.part ?? 0) + 100 * (dt?.c ?? 0);
      if (dt) {
        for (let k = 0; k < 4; k++) {
          detA[i * 4 + k] = dt.a?.[k] ?? 0;
          detB[i * 4 + k] = dt.b?.[k] ?? 0;
        }
      }
      if (o.decal && srcUv) {
        const r = o.decal;
        const pu = srcUv.getX(i),
          pv = srcUv.getY(i);
        // inset half a texel so filtering never bleeds into neighbours
        uv[i * 2] = (r.x + 1 + pu * (r.w - 2)) / ATLAS_SIZE;
        uv[i * 2 + 1] = 1 - (r.y + r.h - 1 - pv * (r.h - 2)) / ATLAS_SIZE;
      } else {
        uv[i * 2] = WHITE_U;
        uv[i * 2 + 1] = WHITE_V;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aMeta', new THREE.BufferAttribute(meta, 4));
    geo.setAttribute('aWheel', new THREE.BufferAttribute(wheel, 4));
    geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    geo.setAttribute('aDetA', new THREE.BufferAttribute(detA, 4));
    geo.setAttribute('aDetB', new THREE.BufferAttribute(detB, 4));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geos.push(geo);
    return this;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos, false);
    if (!merged) throw new Error('vehicle model merge failed');
    for (const x of this.geos) x.dispose();
    // weld identical vertices → indexed geometry (each shared vertex is shaded once)
    const g = mergeVertices(merged, 1e-5);
    merged.dispose();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _size = new THREE.Vector3();

// ─────────────────────────────────────────────────────────── shapes ──

/** Rounded box with its bottom at y (centre x, z). Simplified with the level (see header). */
function rbox(w: number, h: number, d: number, r: number, x: number, y: number, z: number, seg = 1): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const flat = thinQuad(w, h, d, x, y, z);
  if (flat) return flat;
  let g: THREE.BufferGeometry;
  if (LOD === 0) g = new RoundedBoxGeometry(w, h, d, seg, rr);
  else if (LOD === 1) g = r >= 0.15 ? new RoundedBoxGeometry(w, h, d, 1, rr) : r >= 0.08 ? bevelBox(w, h, d, rr) : new THREE.BoxGeometry(w, h, d);
  else g = r >= 0.15 ? bevelBox(w, h, d, rr) : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Plain box with its bottom at y (simplified with the level like rbox). */
function bx(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const flat = thinQuad(w, h, d, x, y, z);
  if (flat) return flat;
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

/** thickness (m) below which a box off the centre plane is drawn as its outer face only, per level */
const THIN = [0, 0.035, 0.09];

/** From level 1 on, a thin box (plate, light lens, stripe…) lying off the centre plane → one quad: its outer face. */
function thinQuad(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry | null {
  if (LOD === 0) return null;
  const t = Math.min(w, h, d);
  if (t > THIN[LOD]) return null;
  if (t === w && Math.abs(x) > 0.3) return decalPlane(d, h, x + (Math.sign(x) * w) / 2, y + h / 2, z, x > 0 ? 'px' : 'nx');
  if (t === d && Math.abs(z) > 0.3) return decalPlane(w, h, x, y + h / 2, z + (Math.sign(z) * d) / 2, z > 0 ? 'pz' : 'nz');
  return null;
}

/**
 * Box with 45° bevelled edges/corners (44 triangles) whose normals blend across the
 * bevels like a rounded box — reads as RoundedBoxGeometry at a distance for a sixth
 * of the triangles. Centred at the origin; non-indexed, position + normal + uv.
 */
function bevelBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const hx = w / 2,
    hy = h / 2,
    hz = d / 2;
  const pos: number[] = [];
  const nor: number[] = [];
  // the three points of corner (sx, sy, sz) lying on the X / Y / Z faces
  const P = (sx: number, sy: number, sz: number, ax: number): number[] =>
    ax === 0 ? [sx * hx, sy * (hy - r), sz * (hz - r), sx, 0, 0] : ax === 1 ? [sx * (hx - r), sy * hy, sz * (hz - r), 0, sy, 0] : [sx * (hx - r), sy * (hy - r), sz * hz, 0, 0, sz];
  const tri = (a: number[], b: number[], c: number[]): void => {
    // orient counter-clockwise as seen from outside (geometric normal along the vertex normals)
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    const gx = uy * vz - uz * vy,
      gy = uz * vx - ux * vz,
      gz = ux * vy - uy * vx;
    const dot = gx * (a[3] + b[3] + c[3]) + gy * (a[4] + b[4] + c[4]) + gz * (a[5] + b[5] + c[5]);
    for (const v of dot >= 0 ? [a, b, c] : [a, c, b]) {
      pos.push(v[0], v[1], v[2]);
      nor.push(v[3], v[4], v[5]);
    }
  };
  const quad = (a: number[], b: number[], c: number[], e: number[]): void => {
    tri(a, b, c);
    tri(a, c, e);
  };
  const S = [-1, 1];
  const ring: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const s of S) {
    const [a, b, c, e] = ring;
    quad(P(s, a[0], a[1], 0), P(s, b[0], b[1], 0), P(s, c[0], c[1], 0), P(s, e[0], e[1], 0)); // ±X face
    quad(P(a[0], s, a[1], 1), P(b[0], s, b[1], 1), P(c[0], s, c[1], 1), P(e[0], s, e[1], 1)); // ±Y face
    quad(P(a[0], a[1], s, 2), P(b[0], b[1], s, 2), P(c[0], c[1], s, 2), P(e[0], e[1], s, 2)); // ±Z face
  }
  for (const s of S)
    for (const t of S) {
      quad(P(s, t, -1, 0), P(s, t, 1, 0), P(s, t, 1, 1), P(s, t, -1, 1)); // edge along Z
      quad(P(-1, s, t, 1), P(1, s, t, 1), P(1, s, t, 2), P(-1, s, t, 2)); // edge along X
      quad(P(s, -1, t, 0), P(s, 1, t, 0), P(s, 1, t, 2), P(s, -1, t, 2)); // edge along Y
      for (const u of S) tri(P(s, t, u, 0), P(s, t, u, 1), P(s, t, u, 2)); // corner
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

/**
 * Taper the upper part of a geometry spanning [y0, y1]: narrows x and pulls the
 * front (z > zc) back by `front` and the rear forward by `rear` at the top.
 */
function taper(g: THREE.BufferGeometry, y0: number, y1: number, zc: number, sx: number, front: number, rear: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
    p.setX(i, p.getX(i) * (1 - sx * t));
    const z = p.getZ(i);
    p.setZ(i, z > zc ? z - front * t : z + rear * t);
  }
  p.needsUpdate = true;
  return g;
}

/** Decal plane (w x h) centred at (x, y, z) facing direction 'px' | 'nx' | 'pz' | 'nz'. */
function decalPlane(w: number, h: number, x: number, y: number, z: number, face: 'px' | 'nx' | 'pz' | 'nz'): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  if (face === 'px') g.rotateY(Math.PI / 2);
  else if (face === 'nx') g.rotateY(-Math.PI / 2);
  else if (face === 'nz') g.rotateY(Math.PI);
  g.translate(x, y, z);
  return g;
}

const TYRE = '#26292d';
const RIM = '#cfd3d7';
const GLASS = '#2c3c4b';
const DARK = '#34373c';
const CHROME = '#b9bfc5';
const HEAD = '#fff3d2';
const TAIL = '#d8352c';
const AMBER = '#ffad3d';
const PLATE = '#f3f0e7';

type WheelStyle = 'alloy' | 'cap' | 'steel';
const FACE: Record<WheelStyle, AtlasRect> = { alloy: R_FACE_ALLOY, cap: R_FACE_CAP, steel: R_FACE_STEEL };

/** flip a geometry inside out (seen from within: rim barrels) */
function inward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const t = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, t);
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** a disc facing ±x (side), centred at (x, y, z); `dome` pushes the centre out (hub caps) */
function sideDisc(r: number, n: number, side: number, x: number, y: number, z: number, dome = 0): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, n);
  if (dome) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const q = Math.hypot(p.getX(i), p.getY(i)) / r;
      p.setZ(i, dome * (1 - q * q));
    }
    g.computeVertexNormals();
  }
  g.rotateY((side * Math.PI) / 2);
  g.translate(x, y, z);
  return g;
}

/**
 * Wheel: a lathed tyre (rounded shoulders, sidewall lettering, tread blocks; it flattens at the contact patch in
 * the shader) on an alloy (five tapered spokes, lip, nuts, cap, brake disc behind), a steel wheel with a domed hub
 * cap, or a steel truck / bus wheel (boss + ten nuts). Middle level: tread + one textured face; far: plain discs.
 */
function wheel(b: Builder, x: number, y: number, z: number, r: number, w: number, front: boolean, rim = RIM, style: WheelStyle = 'cap'): void {
  const side = Math.sign(x) || 1;
  const wh = { x, y, z, front };
  const hw = w / 2;
  if (LOD > 0) {
    // tyre tread + outer sidewall only (the inner one faces the chassis); level 1: the face is textured
    const n = LOD === 1 ? 12 : 6;
    const tread = new THREE.CylinderGeometry(r, r, w, n, 1, true);
    tread.rotateZ(Math.PI / 2);
    tread.translate(x, y, z);
    b.add(tread, { color: TYRE, rough: 1.8, wheel: wh });
    if (LOD === 1) {
      b.add(sideDisc(r, n, side, x + side * hw, y, z), { color: style === 'steel' ? rim : '#ffffff', rough: 0.9, wheel: wh, decal: FACE[style] });
      return;
    }
    b.add(sideDisc(r, n, side, x + side * hw, y, z), { color: TYRE, rough: 1.8, wheel: wh });
    b.add(sideDisc(r * 0.58, 6, side, x + side * (hw + 0.019), y, z), { color: rim, rough: 0.7, wheel: wh });
    return;
  }
  const R = r * 1.025,
    rr = r * 0.64;
  // tyre profile (radius, axial): inner bead → inner wall → tread → outer wall → outer bead (uv v 0..1 → R_TYRE)
  const prof: [number, number][] = [
    [rr, -0.9],
    [rr + 0.3 * (R - rr), -1.0],
    [rr + 0.65 * (R - rr), -1.03],
    [R - 0.035, -0.97],
    [R - 0.01, -0.84],
    [R, -0.6],
    [R, 0.6],
    [R - 0.01, 0.84],
    [R - 0.035, 0.97],
    [rr + 0.65 * (R - rr), 1.03],
    [rr + 0.3 * (R - rr), 1.0],
    [rr, 0.9],
  ];
  const ty = new THREE.LatheGeometry(
    prof.map(([a, h]) => new THREE.Vector2(a, h * hw)),
    28,
  );
  ty.rotateZ(-Math.PI / 2);
  ty.translate(x, y, z);
  b.add(ty, { color: '#ffffff', rough: 1.7, wheel: wh, decal: R_TYRE, det: { c: 3, a: [r] } });
  // rim barrel (seen from outside through the spokes) and the dark inner dish
  const bar = inward(new THREE.CylinderGeometry(rr, rr, w * 0.9, 20, 1, true));
  bar.rotateZ(Math.PI / 2);
  bar.translate(x, y, z);
  b.add(bar, { color: '#2a2d31', rough: 1.1, wheel: wh });
  b.add(sideDisc(rr, 20, side, x - side * hw * 0.5, y, z), { color: '#141518', rough: 1.4, wheel: wh });
  const face = x + side * hw * 0.9;
  if (style === 'alloy') {
    // brake disc + hat behind the spokes
    b.add(sideDisc(rr * 0.8, 20, side, x + side * hw * 0.15, y, z), { color: '#75797e', rough: 0.9, finish: 'chrome', wheel: wh });
    b.add(sideDisc(r * 0.24, 12, side, x + side * hw * 0.2, y, z), { color: '#4a4e53', rough: 1, wheel: wh });
    for (let k = 0; k < 5; k++) {
      // tapered spoke, dished: the hub end stands proud of the rim lip
      const sp = new THREE.BoxGeometry(0.026, rr - r * 0.12, 1, 1, 1, 1);
      const p = sp.attributes.position;
      const len = rr - r * 0.12;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + len / 2) / len; // 0 hub → 1 lip
        p.setZ(i, p.getZ(i) * r * (0.1 + 0.09 * t));
        p.setX(i, p.getX(i) + side * 0.014 * (1 - t));
      }
      sp.computeVertexNormals();
      sp.translate(0, r * 0.12 + len / 2, 0);
      sp.rotateX((k * 2 * Math.PI) / 5);
      sp.translate(face - side * 0.012, y, z);
      b.add(sp, { color: rim, rough: 0.5, wheel: wh });
      const nut = new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6);
      nut.rotateZ(Math.PI / 2);
      const a = ((k + 0.5) * 2 * Math.PI) / 5;
      nut.translate(face + side * 0.004, y + Math.cos(a) * r * 0.2, z + Math.sin(a) * r * 0.2);
      b.add(nut, { color: '#8d939a', rough: 0.6, finish: 'chrome', wheel: wh });
    }
    const lip = new THREE.TorusGeometry(rr - 0.004, 0.011, 5, 28);
    lip.rotateY(Math.PI / 2);
    lip.translate(face - side * 0.006, y, z);
    b.add(lip, { color: rim, rough: 0.45, wheel: wh });
    const cap = new THREE.CylinderGeometry(r * 0.12, r * 0.14, 0.03, 14, 1);
    cap.rotateZ((-side * Math.PI) / 2);
    cap.translate(face + side * 0.008, y, z);
    b.add(cap, { color: '#9aa1a8', rough: 0.4, finish: 'chrome', wheel: wh });
    return;
  }
  if (style === 'cap') {
    // pressed steel wheel under a domed plastic hub cap
    b.add(sideDisc(rr, 20, side, face - side * 0.012, y, z), { color: '#3a3d41', rough: 1, wheel: wh });
    b.add(sideDisc(rr * 0.96, 24, side, face - side * 0.004, y, z, 0.03), { color: '#ffffff', rough: 0.55, wheel: wh, decal: R_HUBCAP });
    return;
  }
  // truck / bus steel wheel: painted disc with hand holes, a hub boss and ten nuts
  const fx = R_FACE_STEEL.x + R_FACE_STEEL.w / 2,
    fy = R_FACE_STEEL.y + R_FACE_STEEL.h / 2,
    fr = (R_FACE_STEEL.w / 2 - 1) * 0.64;
  b.add(sideDisc(rr, 20, side, face - side * 0.03, y, z), { color: rim, rough: 0.9, wheel: wh, decal: { x: fx - fr, y: fy - fr, w: 2 * fr, h: 2 * fr } });
  const boss = new THREE.CylinderGeometry(r * 0.2, r * 0.26, 0.07, 14, 1);
  boss.rotateZ((-side * Math.PI) / 2);
  boss.translate(face, y, z);
  b.add(boss, { color: '#6f757b', rough: 0.8, finish: 'chrome', wheel: wh });
  for (let k = 0; k < 10; k++) {
    const a = (k * 2 * Math.PI) / 10;
    const nut = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6);
    nut.rotateZ(Math.PI / 2);
    nut.translate(face - side * 0.012, y + Math.cos(a) * r * 0.32, z + Math.sin(a) * r * 0.32);
    b.add(nut, { color: '#9aa0a6', rough: 0.6, finish: 'chrome', wheel: wh });
  }
}

interface CarDims {
  L: number;
  W: number;
  wheelR: number;
  wheelW: number;
  axF: number;
  axR: number;
  wheelX: number;
  /** body (lower) */
  bodyY: number;
  bodyH: number;
  bodyR: number;
  /** headlight / taillight heights (centre) */
  lightY: number;
  roundLights?: boolean;
  wheel?: WheelStyle;
  rim?: string;
  /** bumper finish: dark plastic (default), body colour with a dark insert, or chrome */
  bumper?: 'dark' | 'paint' | 'chrome';
}

/** Wheels, bumpers, lights, plates, mirrors common to the cars. */
function carDetails(b: Builder, d: CarDims): void {
  const { L, W } = d;
  const ws = d.wheel ?? 'alloy';
  const rc = d.rim ?? RIM;
  wheel(b, d.wheelX, d.wheelR, d.axF, d.wheelR, d.wheelW, true, rc, ws);
  wheel(b, -d.wheelX, d.wheelR, d.axF, d.wheelR, d.wheelW, true, rc, ws);
  wheel(b, d.wheelX, d.wheelR, d.axR, d.wheelR, d.wheelW, false, rc, ws);
  wheel(b, -d.wheelX, d.wheelR, d.axR, d.wheelR, d.wheelW, false, rc, ws);
  // bumpers: dark plastic, body colour with a dark lower insert, or chrome
  const bum = d.bumper ?? 'dark';
  const bo: PartOpts = bum === 'paint' ? { color: '#ffffff', paint: true, rough: 0.85 } : bum === 'chrome' ? { color: CHROME, rough: 0.3 } : { color: DARK, rough: 1.2 };
  for (const e of [1, -1]) {
    b.add(rbox(W - 0.05, 0.17, 0.2, 0.08, 0, d.bodyY - 0.02, e * (L / 2 - 0.08)), bo);
    if (bum === 'paint') b.add(bx(W * 0.62, 0.05, 0.02, 0, d.bodyY - 0.01, e * (L / 2 + 0.018)), { color: '#1d1f22', rough: 1.3 });
  }
  // headlights (lens decal with reflector bowls on the emissive housing), tail lights, blinkers
  const hw = d.roundLights ? 0.26 : 0.36,
    hh = d.roundLights ? 0.22 : 0.13;
  for (const s of [1, -1]) {
    b.add(rbox(hw, hh, 0.08, d.roundLights ? 0.1 : 0.04, s * (W / 2 - 0.3), d.lightY - hh / 2, L / 2 - 0.02), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    b.add(rbox(0.3, 0.13, 0.07, 0.04, s * (W / 2 - 0.26), d.lightY - 0.04, -L / 2 + 0.015), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    const hl = decalPlane(hw - (d.roundLights ? 0.04 : 0.02), hh - (d.roundLights ? 0.04 : 0.02), s * (W / 2 - 0.3), d.lightY, L / 2 + 0.022, 'pz');
    if (s < 0) flipU(hl);
    b.add(hl, { color: '#ffffff', light: LIGHT_HEAD, rough: 0.15, decal: d.roundLights ? R_HEAD_ROUND : R_HEAD });
    const tl = decalPlane(0.28, 0.11, s * (W / 2 - 0.26), d.lightY + 0.025, -L / 2 - 0.022, 'nz');
    if (s > 0) flipU(tl);
    b.add(tl, { color: '#ffffff', light: LIGHT_TAIL, rough: 0.2, decal: R_TAIL });
    // blinkers (front corners + beside the tail lights)
    // (flush lenses under the lamps, inside the rounded corners of the nose and tail)
    b.add(rbox(0.16, 0.05, 0.05, 0.015, s * (W / 2 - 0.3), d.lightY - hh / 2 - 0.065, L / 2 - 0.012), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R, rough: 0.3 });
    b.add(rbox(0.12, 0.05, 0.05, 0.015, s * (W / 2 - 0.26), d.lightY - 0.1, -L / 2 + 0.01), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R, rough: 0.3 });
  }
  // grille (honeycomb in a chrome surround) with a badge, number plates on holders front and rear
  b.add(rbox(W * 0.36, 0.11, 0.05, 0.03, 0, d.lightY - 0.12, L / 2 + 0.005), { color: '#25282c', rough: 1.2 });
  b.add(decalPlane(W * 0.36 - 0.02, 0.095, 0, d.lightY - 0.065, L / 2 + 0.032, 'pz'), { color: '#ffffff', rough: 0.8, decal: R_GRILLE });
  if (LOD === 0) {
    for (const [zb, yb, f] of [
      [L / 2 + 0.034, d.lightY - 0.065, 'pz'],
      [-L / 2 - 0.006, d.lightY + 0.1, 'nz'],
    ] as const) {
      const bg = decalPlane(0.08, 0.05, 0, yb, zb, f);
      b.add(bg, { color: '#d5dade', rough: 0.25, finish: 'chrome' });
    }
  }
  for (const e of [1, -1]) {
    b.add(bx(0.49, 0.12, 0.012, 0, d.bodyY + 0.01, e * (L / 2 + 0.026)), { color: '#16171a', rough: 1.2 });
    b.add(decalPlane(0.46, 0.1, 0, d.bodyY + 0.07, e * (L / 2 + 0.0335), e > 0 ? 'pz' : 'nz'), { color: '#ffffff', rough: 0.6, decal: R_PLATE, plate: true });
  }
}

/** mirror a plane's texture left ↔ right */
function flipU(g: THREE.BufferGeometry): void {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
}

// ─────────────────────────────────────────────────────────── models ──

const TRIM = '#1b1e22';
const WELL = '#121315';

/** Lofted body shell (paint, glass, trim, wheel wells, cladding) + mirrors, door seams and handles. Returns the roof top. */
function loftBody(b: Builder, s: CarShape, doors4: boolean, chrome = false): { topY: number; topZ: number; topW: number; topD: number } {
  const p = loftCar(s, LOD);
  const hw = s.W / 2;
  const ra = s.wheelR + 0.075;
  // panel lines and the cabin are drawn by the shader (vehicleMaterial.ts, classes 1 and 2)
  const cuts = [s.axF - ra - 0.05, s.pillarB, doors4 ? Math.max(s.axR + ra + 0.04, s.glassRear - 0.02) : -99];
  const paint: Det = { c: 1, a: [cuts[0], cuts[1], cuts[2], s.wsBase + 0.035], b: [s.rwBase - 0.04, s.sill, hw - 0.14, s.belt] };
  const rearSeat = (s.pillarC ?? s.glassRear + 0.1) - 0.22;
  const cabin: Det = { c: 2, a: [hw - 0.13, s.belt, topAt(s, (s.wsTop + s.rwTop) / 2) - 0.07, s.wsBase - 0.04], b: [s.rwBase + 0.04, s.pillarB - 0.02, rearSeat, 0] };
  if (p.body) b.add(p.body, { color: '#ffffff', paint: true, rough: 0.85, det: paint });
  if (p.glass) b.add(p.glass, { color: GLASS, rough: 0.22, det: cabin });
  if (p.trim) b.add(p.trim, { color: TRIM, rough: 0.9, finish: 'coat' });
  if (p.seal) b.add(p.seal, chrome ? { color: CHROME, rough: 0.3 } : { color: TRIM, rough: 0.9, finish: 'coat' });
  if (p.well) b.add(p.well, { color: WELL, rough: 1.6 });
  if (p.clad) b.add(p.clad, { color: '#3b3e43', rough: 1.3 });
  for (const sd of [1, -1]) {
    // mirror on a short arm at the base of the A pillar (dropped at the far level): painted cap, dark base, glass
    const mz = s.wsBase - 0.13;
    b.add(rbox(0.1, 0.085, 0.14, 0.035, sd * (hw + 0.045), s.belt + 0.015, mz), { color: '#ffffff', paint: true, rough: 0.85 });
    b.add(bx(0.06, 0.03, 0.05, sd * (hw - 0.01), s.belt + 0.03, mz + 0.02), { color: TRIM });
    if (LOD === 0) {
      b.add(decalPlane(0.075, 0.06, sd * (hw + 0.05), s.belt + 0.057, mz - 0.071, 'nz'), { color: '#8c9aa6', rough: 0.15, finish: 'chrome' });
      const handles = doors4 ? [s.pillarB + 0.14, cuts[2] + 0.14] : [s.pillarB + 0.16];
      for (const z of handles) {
        // pull handle in a dark recess
        b.add(decalPlane(0.15, 0.045, sd * (hw + 0.0035), s.belt - 0.085, z, sd > 0 ? 'px' : 'nx'), { color: '#2a2c30', rough: 1.2 });
        b.add(rbox(0.022, 0.026, 0.13, 0.008, sd * (hw + 0.008), s.belt - 0.097, z), chrome ? { color: CHROME, rough: 0.3 } : { color: '#ffffff', paint: true, rough: 0.5 });
      }
    }
  }
  if (LOD === 0) {
    // wipers parked along the base of the windscreen
    const yb = topAt(s, s.wsBase - 0.04);
    for (const x of [0.32, -0.18]) {
      const w = bx(0.62, 0.018, 0.022, x, yb + 0.004, s.wsBase - 0.05);
      w.rotateY(0.07);
      b.add(w, { color: '#17191c', rough: 1.4 });
    }
  }
  const topZ = (s.wsTop + s.rwTop) / 2;
  return { topY: topAt(s, topZ) + 0.012, topZ, topW: 2 * (s.W / 2 - s.tumble - 0.07), topD: s.wsTop - s.rwTop };
}

function compact(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 3.55,
    W = 1.66;
  loftBody(
    b,
    { L, W, sill: 0.28, belt: 0.93, roof: 1.46, noseH: 0.78, hoodH: 0.9, wsBase: 0.92, wsTop: 0.12, rwTop: -1.18, rwBase: -1.6, deckH: 1.0, tailH: 0.93, pillarB: -0.36, glassRear: -1.12, tumble: 0.15, axF: 1.155, axR: -1.145, wheelR: 0.29 },
    false,
  );
  carDetails(b, { L, W, wheelR: 0.29, wheelW: 0.22, axF: 1.155, axR: -1.145, wheelX: W / 2 - 0.08, bodyY: 0.3, bodyH: 0.62, bodyR: 0.26, lightY: 0.66, roundLights: true, wheel: 'cap', bumper: 'chrome' });
  return b.build();
}

function hatch(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 4.0,
    W = 1.74;
  const shape: CarShape = { L, W, sill: 0.3, belt: 0.9, roof: 1.45, roofDrop: 0.06, noseH: 0.76, hoodH: 0.9, wsBase: 0.88, wsTop: 0.02, rwTop: -1.02, rwBase: -1.76, deckH: 0.98, tailH: 0.93, pillarB: -0.42, glassRear: -0.98, tumble: 0.14, axF: 1.22, axR: -1.33, wheelR: 0.31 };
  const c = loftBody(b, shape, true);
  // small roof spoiler over the rear window
  b.add(rbox(c.topW - 0.12, 0.045, 0.2, 0.02, 0, topAt(shape, shape.rwTop + 0.06) - 0.025, shape.rwTop - 0.02), { color: '#ffffff', paint: true });
  carDetails(b, { L, W, wheelR: 0.31, wheelW: 0.23, axF: 1.22, axR: -1.33, wheelX: W / 2 - 0.09, bodyY: 0.31, bodyH: 0.6, bodyR: 0.2, lightY: 0.68, bumper: 'paint', rim: '#6d737a' });
  return b.build();
}

function sedan(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 4.45,
    W = 1.78;
  const c = loftBody(
    b,
    { L, W, sill: 0.31, belt: 0.9, roof: 1.42, noseH: 0.76, hoodH: 0.88, wsBase: 1.0, wsTop: 0.2, rwTop: -0.85, rwBase: -1.5, deckH: 0.99, tailH: 0.96, pillarB: -0.3, pillarC: -1.0, glassRear: -1.25, tumble: 0.15, axF: 1.375, axR: -1.325, wheelR: 0.32 },
    true,
    true,
  );
  carDetails(b, { L, W, wheelR: 0.32, wheelW: 0.24, axF: 1.375, axR: -1.325, wheelX: W / 2 - 0.1, bodyY: 0.33, bodyH: 0.58, bodyR: 0.18, lightY: 0.69, bumper: 'paint' });
  // taxi (variant 1 → part 2): roof sign + chequer band
  b.add(rbox(0.6, 0.18, 0.28, 0.05, 0, c.topY - 0.01, c.topZ), { color: '#fff3b8', light: LIGHT_TAXI, part: 2, rough: 0.6 });
  b.add(decalPlane(0.54, 0.15, 0, c.topY + 0.08, c.topZ + 0.142, 'pz'), { color: '#ffffff', decal: R_TAXI, light: LIGHT_TAXI, part: 2 });
  b.add(decalPlane(0.54, 0.15, 0, c.topY + 0.08, c.topZ - 0.142, 'nz'), { color: '#ffffff', decal: R_TAXI, light: LIGHT_TAXI, part: 2 });
  for (const s of [1, -1]) {
    for (let i = 0; i < 8; i++) {
      b.add(bx(0.012, 0.07, 0.17, s * (W / 2 + 0.01), 0.66 + (i % 2) * 0.07, -0.88 + i * 0.22), { color: '#1d1d1d', part: 2 });
      b.add(bx(0.012, 0.07, 0.17, s * (W / 2 + 0.01), 0.66 + ((i + 1) % 2) * 0.07, -0.88 + i * 0.22), { color: '#ffffff', part: 2 });
    }
  }
  // police (variant 2 → part 3): light bar + livery band
  b.add(rbox(1.18, 0.08, 0.32, 0.03, 0, c.topY - 0.01, c.topZ), { color: '#2b2e33', part: 3 });
  b.add(rbox(0.52, 0.13, 0.26, 0.05, 0.29, c.topY + 0.06, c.topZ), { color: '#ff3b30', light: LIGHT_POLICE_RED, part: 3, rough: 0.4 });
  b.add(rbox(0.52, 0.13, 0.26, 0.05, -0.29, c.topY + 0.06, c.topZ), { color: '#3d6dff', light: LIGHT_POLICE_BLUE, part: 3, rough: 0.4 });
  b.add(decalPlane(1.8, 0.28, W / 2 + 0.014, 0.72, -0.05, 'px'), { color: '#ffffff', decal: R_POLICE, part: 3 });
  b.add(decalPlane(1.8, 0.28, -W / 2 - 0.014, 0.72, -0.05, 'nx'), { color: '#ffffff', decal: R_POLICE, part: 3 });
  return b.build();
}

function suv(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 4.55,
    W = 1.86;
  const c = loftBody(
    b,
    { L, W, sill: 0.42, belt: 1.1, roof: 1.72, noseH: 0.98, hoodH: 1.08, wsBase: 1.1, wsTop: 0.4, rwTop: -1.95, rwBase: -2.15, deckH: 1.2, tailH: 1.15, pillarB: -0.35, pillarC: -1.3, glassRear: -1.85, tumble: 0.1, axF: 1.425, axR: -1.325, wheelR: 0.37, clad: true },
    true,
    true,
  );
  // roof rails
  for (const s of [1, -1]) b.add(bx(0.05, 0.06, c.topD - 0.3, s * (c.topW / 2 - 0.08), c.topY - 0.01, c.topZ), { color: '#2e3136' });
  // spare wheel on the tailgate
  const sp = new THREE.CylinderGeometry(0.31, 0.31, 0.2, sg(14));
  sp.rotateX(Math.PI / 2);
  sp.translate(0, 0.84, -L / 2 - 0.09);
  b.add(sp, { color: TYRE, rough: 1.8 });
  const cov = new THREE.CylinderGeometry(0.24, 0.24, 0.05, sg(14));
  cov.rotateX(Math.PI / 2);
  cov.translate(0, 0.84, -L / 2 - 0.2);
  b.add(cov, { color: '#ffffff', paint: true });
  carDetails(b, { L, W, wheelR: 0.37, wheelW: 0.27, axF: 1.425, axR: -1.325, wheelX: W / 2 - 0.1, bodyY: 0.4, bodyH: 0.74, bodyR: 0.18, lightY: 0.9 });
  return b.build();
}

/** windscreen raked back by `rake` (m over its height h): a seal and a pane with the cabin behind it */
function rakedScreen(b: Builder, w: number, h: number, yc: number, zc: number, rake: number, glass: PartOpts): void {
  const ang = -Math.atan2(rake, h);
  const len = Math.hypot(rake, h);
  for (const [dw, dz, o] of [
    [0.07, 0.004, { color: '#1a1c1f', rough: 1.1 } as PartOpts],
    [0, 0.01, glass],
  ] as const) {
    const g = roundPane(w + dw, len + dw, 0.08, 0, 0, 0, 'pz');
    g.rotateX(ang);
    g.translate(0, yc, zc + dz);
    b.add(g, o);
  }
}

/** cab side window in a seal, door seam behind it and a handle (cab side at |x| = x) */
function cabSide(b: Builder, x: number, w: number, h: number, yc: number, zc: number, doorZ: number, doorY0: number, glass: PartOpts): void {
  for (const s of [1, -1]) {
    const f = s > 0 ? 'px' : 'nx';
    b.add(roundPane(w + 0.06, h + 0.06, 0.07, s * (x + 0.006), yc, zc, f), { color: '#1a1c1f', rough: 1.1 });
    b.add(roundPane(w, h, 0.06, s * (x + 0.011), yc, zc, f), glass);
    if (LOD === 0) {
      b.add(decalPlane(0.008, yc + h / 2 - doorY0, s * (x + 0.004), (yc + h / 2 + doorY0) / 2, doorZ, f), { color: '#121315', rough: 1.3 });
      b.add(rbox(0.024, 0.03, 0.15, 0.01, s * (x + 0.012), yc - h / 2 - 0.12, doorZ + 0.16), { color: '#2a2c30', rough: 1 });
    }
  }
}

/** a wheel-arch liner (inward half cylinder) across the body at axle z */
function archLiner(b: Builder, z: number, y: number, r: number, w: number): void {
  const lin = inward(new THREE.CylinderGeometry(r, r, w, LOD === 0 ? 12 : 6, 1, true, -Math.PI / 2, Math.PI));
  lin.rotateZ(Math.PI / 2);
  lin.translate(0, y, z);
  b.add(lin, { color: WELL, rough: 1.6 });
}

/**
 * Box van (Luton style): cab with a front wheel arch, raked windscreen and side windows in seals over a cabin,
 * door seams and handles, grille and lamp lenses; an aluminium-framed cargo box (corner posts, roof rails, rear
 * doors with hinges and locking bars, marker lamps, side guard), logo decals per variant.
 */
function delivery(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 6.1,
    W = 2.1;
  const zCab = L / 2 - 0.9;
  const axF = L / 2 - 1.0,
    axR = axF - 3.6;
  const ALU = '#b9bec4';
  // chassis
  b.add(bx(1.5, 0.28, L - 0.5, 0, 0.42, -0.1), { color: '#2e3135', rough: 1.4 });
  // cab: lower body with the front arch, upper body tapering into the roof
  b.add(archedSlab(1.8, 0.42, 1.34, 2.04, [axF - zCab], 0.42, 0.5, 0.12, 0.05, 0.05).translate(0, 0, zCab), { color: '#ffffff', paint: true, rough: 0.85 });
  archLiner(b, axF, 0.42, 0.49, 1.9);
  const cg = rbox(1.98, 0.78, 1.5, 0.12, 0, 1.3, zCab - 0.1, 1);
  taper(cg, 1.3, 2.08, zCab - 0.1, 0.04, 0.42, 0);
  b.add(cg, { color: '#ffffff', paint: true, rough: 0.85 });
  b.add(rbox(1.94, 0.1, 1.12, 0.04, 0, 2.03, zCab - 0.27), { color: '#ffffff', paint: true, rough: 0.85 });
  const glass: PartOpts = { color: GLASS, rough: 0.2, det: { c: 5, a: [0.92, 1.32, 2.0, zCab + 0.5], b: [zCab - 0.85, zCab - 0.25, -9, 0] } };
  rakedScreen(b, 1.74, 0.66, 1.68, zCab + 0.44, 0.38, glass);
  cabSide(b, 0.975, 0.78, 0.56, 1.66, zCab - 0.02, zCab - 0.55, 0.5, glass);
  // cargo box with aluminium corner posts and roof rails
  const boxD = 4.25,
    boxZ = -L / 2 + boxD / 2 + 0.02;
  b.add(rbox(2.14, 2.22, boxD, 0.08, 0, 0.6, boxZ, 1), { color: '#f3f1ec', rough: 0.9 });
  b.add(decalPlane(3.7, 1.4, W / 2 + 0.035, 1.72, boxZ, 'px'), { color: '#ffffff', decal: R_DELIVERY, decalRows: true });
  b.add(decalPlane(3.7, 1.4, -W / 2 - 0.035, 1.72, boxZ, 'nx'), { color: '#ffffff', decal: R_DELIVERY, decalRows: true });
  for (const sx of [1, -1]) {
    for (const ez of [1, -1]) b.add(rbox(0.07, 2.24, 0.07, 0.015, sx * 1.055, 0.59, boxZ + ez * (boxD / 2 - 0.02)), { color: ALU, rough: 0.6, finish: 'chrome' });
    b.add(bx(0.06, 0.06, boxD, sx * 1.055, 2.77, boxZ), { color: ALU, rough: 0.6, finish: 'chrome' });
    b.add(bx(0.05, 0.08, boxD, sx * 1.06, 0.58, boxZ), { color: ALU, rough: 0.6, finish: 'chrome' });
    // side guard between the axles, amber marker lamps along the bottom rail
    b.add(bx(0.03, 0.08, 2.2, sx * 1.0, 0.5, (axF + axR) / 2 - 0.25), { color: '#3b3f44', rough: 1 });
    if (LOD === 0) for (const z of [boxZ - 1.6, boxZ, boxZ + 1.6]) b.add(bx(0.02, 0.04, 0.07, sx * 1.085, 0.6, z), { color: AMBER, rough: 0.3 });
  }
  // rear doors: two leaves, seam, hinges, locking bars with handles, plate, under-run bar
  const zb = -L / 2 + 0.01;
  b.add(bx(0.03, 2.0, 0.02, 0, 0.7, zb), { color: '#9aa0a6' });
  for (const s of [1, -1]) {
    for (const x of [0.25, 0.75]) b.add(tube(s * x, 0.8, zb - 0.025, s * x, 2.55, zb - 0.025, 0.012), { color: '#8a9096', rough: 0.5 });
    if (LOD === 0) {
      for (const y of [0.85, 1.65, 2.45]) b.add(bx(0.12, 0.08, 0.025, s * 0.99, y, zb - 0.012), { color: '#7c8287', rough: 0.6 });
      b.add(bx(0.06, 0.18, 0.035, s * 0.25, 1.4, zb - 0.03), { color: '#5d6267', rough: 0.6 });
    }
  }
  // front: bumper, grille, lamp lenses, flush blinkers; plates; mirrors on arms
  b.add(rbox(W, 0.2, 0.22, 0.07, 0, 0.36, L / 2 - 0.07), { color: DARK, rough: 1.2 });
  b.add(rbox(W, 0.2, 0.22, 0.07, 0, 0.36, -L / 2 + 0.06), { color: DARK, rough: 1.2 });
  b.add(rbox(W * 0.5, 0.2, 0.05, 0.03, 0, 0.62, L / 2 + 0.005), { color: '#25282c' });
  b.add(decalPlane(W * 0.5 - 0.03, 0.17, 0, 0.72, L / 2 + 0.032, 'pz'), { color: '#ffffff', rough: 0.8, decal: R_GRILLE });
  for (const e of [1, -1]) {
    b.add(bx(0.49, 0.12, 0.012, 0, 0.4, e * (L / 2 + 0.05)), { color: '#16171a', rough: 1.2 });
    b.add(decalPlane(0.46, 0.1, 0, 0.46, e * (L / 2 + 0.0565), e > 0 ? 'pz' : 'nz'), { color: '#ffffff', rough: 0.6, decal: R_PLATE, plate: true });
  }
  for (const s of [1, -1]) {
    b.add(rbox(0.32, 0.16, 0.07, 0.04, s * 0.72, 0.64, L / 2 - 0.01), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    const hl = decalPlane(0.3, 0.14, s * 0.72, 0.72, L / 2 + 0.027, 'pz');
    if (s < 0) flipU(hl);
    b.add(hl, { color: '#ffffff', light: LIGHT_HEAD, rough: 0.15, decal: R_HEAD });
    b.add(rbox(0.1, 0.07, 0.04, 0.015, s * 0.94, 0.68, L / 2 + 0.0), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R, rough: 0.3 });
    b.add(bx(0.2, 0.3, 0.05, s * 0.9, 0.62, -L / 2 - 0.01), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    const tl = decalPlane(0.19, 0.28, s * 0.9, 0.77, -L / 2 - 0.037, 'nz');
    if (s > 0) flipU(tl);
    b.add(tl, { color: '#ffffff', light: LIGHT_TAIL, rough: 0.2, decal: R_TAIL });
    b.add(bx(0.2, 0.1, 0.05, s * 0.9, 0.94, -L / 2 - 0.01), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(tube(s * 0.98, 1.45, zCab + 0.42, s * 1.14, 1.45, zCab + 0.48, 0.018), { color: DARK });
    b.add(rbox(0.1, 0.3, 0.17, 0.03, s * 1.16, 1.32, zCab + 0.5), { color: DARK });
    if (LOD === 0) b.add(decalPlane(0.08, 0.26, s * 1.16, 1.47, zCab + 0.414, 'nz'), { color: '#8c9aa6', rough: 0.15, finish: 'chrome' });
  }
  for (const s of [1, -1]) {
    wheel(b, s * 0.93, 0.42, axF, 0.42, 0.3, true);
    wheel(b, s * 0.93, 0.42, axR, 0.42, 0.34, false, '#c9ccd0', 'steel');
  }
  return b.build();
}

/**
 * Cab-over lorry with a flatbed (crates, or a strapped tarp): windscreen and side windows in seals over a cabin,
 * slatted grille with a badge, lamp lenses, door seams, handles and boarding steps, mirrors on arms, fuel tank,
 * side guards, mud flaps; steered front axle + tandem rear on steel wheels.
 */
function lorry(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 7.6,
    W = 2.35;
  const zCab = L / 2 - 0.95;
  const axF = L / 2 - 1.3;
  b.add(bx(1.4, 0.32, L - 0.4, 0, 0.5, -0.1), { color: '#2b2e33', rough: 1.4 });
  // cab-over, with the front arch cut into its lower half
  b.add(archedSlab(1.88, 0.6, 2.62, 2.3, [axF - zCab], 0.48, 0.58, 0.14, 0.2, 0.07).translate(0, 0, zCab), { color: '#ffffff', paint: true, rough: 0.85 });
  archLiner(b, axF, 0.48, 0.57, 2.16);
  const glass: PartOpts = { color: GLASS, rough: 0.2, det: { c: 5, a: [1.05, 1.58, 2.5, L / 2 - 0.25], b: [zCab - 0.9, zCab - 0.2, -9, 0] } };
  b.add(roundPane(2.1, 0.86, 0.1, 0, 1.99, L / 2 + 0.004, 'pz'), { color: '#1a1c1f', rough: 1.1 });
  b.add(roundPane(2.02, 0.78, 0.08, 0, 1.99, L / 2 + 0.009, 'pz'), glass);
  if (LOD === 0) for (const x of [-0.5, 0.48]) b.add(tube(x - 0.05, 1.63, L / 2 + 0.03, x + 0.3, 2.2, L / 2 + 0.03, 0.012), { color: '#141518', rough: 1.4 });
  cabSide(b, 1.15, 0.86, 0.62, 1.99, zCab + 0.32, zCab - 0.2, 0.75, glass);
  b.add(bx(2.12, 0.07, 0.3, 0, 2.43, L / 2 - 0.08), { color: '#ffffff', paint: true });
  // grille + badge, bumper, steps, lamps, mirrors
  b.add(rbox(1.5, 0.5, 0.05, 0.03, 0, 0.82, L / 2 + 0.005), { color: '#3a3d42', rough: 1.2 });
  b.add(decalPlane(1.46, 0.46, 0, 1.07, L / 2 + 0.032, 'pz'), { color: '#ffffff', rough: 1, decal: R_BUS_GRILLE });
  if (LOD === 0) b.add(decalPlane(0.16, 0.08, 0, 1.4, L / 2 + 0.012, 'pz'), { color: '#d5dade', rough: 0.25, finish: 'chrome' });
  b.add(rbox(W + 0.02, 0.24, 0.24, 0.08, 0, 0.5, L / 2 - 0.08), { color: DARK, rough: 1.2 });
  b.add(bx(0.49, 0.12, 0.012, 0, 0.55, L / 2 + 0.046), { color: '#16171a', rough: 1.2 });
  b.add(decalPlane(0.46, 0.1, 0, 0.61, L / 2 + 0.0525, 'pz'), { color: '#ffffff', rough: 0.6, decal: R_PLATE, plate: true });
  for (const s of [1, -1]) {
    b.add(rbox(0.32, 0.18, 0.07, 0.04, s * 0.82, 0.72, L / 2 - 0.0), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    const hl = decalPlane(0.3, 0.16, s * 0.82, 0.81, L / 2 + 0.037, 'pz');
    if (s < 0) flipU(hl);
    b.add(hl, { color: '#ffffff', light: LIGHT_HEAD, rough: 0.15, decal: R_HEAD });
    b.add(rbox(0.1, 0.08, 0.04, 0.015, s * 1.06, 0.76, L / 2 + 0.0), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R, rough: 0.3 });
    b.add(bx(0.24, 0.16, 0.05, s * 0.95, 0.8, -L / 2 - 0.01), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    const tl = decalPlane(0.22, 0.14, s * 0.95, 0.88, -L / 2 - 0.037, 'nz');
    if (s > 0) flipU(tl);
    b.add(tl, { color: '#ffffff', light: LIGHT_TAIL, rough: 0.2, decal: R_TAIL });
    b.add(bx(0.12, 0.16, 0.05, s * 0.72, 0.8, -L / 2 - 0.01), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(tube(s * 1.15, 2.3, zCab + 0.75, s * 1.32, 2.3, zCab + 0.82, 0.02), { color: DARK });
    b.add(rbox(0.1, 0.34, 0.18, 0.03, s * 1.34, 1.85, zCab + 0.84), { color: DARK });
    if (LOD === 0) {
      b.add(decalPlane(0.08, 0.3, s * 1.34, 2.02, zCab + 0.749, 'nz'), { color: '#8c9aa6', rough: 0.15, finish: 'chrome' });
      // boarding steps under the door
      for (const y of [0.42, 0.78]) b.add(bx(0.24, 0.035, 0.4, s * 1.08, y, zCab - 0.45), { color: '#4a4e53', rough: 0.9 });
    }
    // fuel tank (driver side) / battery box, side guards, mud flaps behind the rear axles
    if (s > 0) {
      const tk = new THREE.CylinderGeometry(0.26, 0.26, 1.1, sg(14), 1);
      tk.rotateX(Math.PI / 2);
      tk.translate(0.92, 0.66, axF - 1.5);
      b.add(tk, { color: '#b7bcc1', rough: 0.5, finish: 'chrome' });
    } else b.add(rbox(0.4, 0.4, 0.7, 0.03, -0.92, 0.46, axF - 1.4), { color: '#26282b', rough: 1.2 });
    b.add(bx(0.03, 0.1, 1.6, s * 1.12, 0.55, axF - 3.1), { color: '#c0c4c8', rough: 0.7 });
    b.add(bx(0.03, 0.1, 1.6, s * 1.12, 0.78, axF - 3.1), { color: '#c0c4c8', rough: 0.7 });
    b.add(bx(0.4, 0.42, 0.02, s * 1.0, 0.18, axF - 6.1), { color: '#18191b', rough: 1.4 });
  }
  // flatbed + headboard
  const bedZ = -0.95,
    bedD = 5.5;
  b.add(bx(W, 0.18, bedD, 0, 0.88, bedZ), { color: '#a87f58', rough: 1.1 });
  b.add(bx(W - 0.05, 1.2, 0.12, 0, 1.06, bedZ + bedD / 2 - 0.06), { color: '#8b98a3', rough: 0.8 });
  b.add(bx(W + 0.04, 0.16, 0.12, 0, 0.76, -L / 2 + 0.06), { color: '#3a3d42' });
  // variant 0: crates
  const crates: [number, number, number, number, number, number, string][] = [
    [1.05, 1.0, 1.35, 0.56, 1.06, 0.95, '#c8955a'],
    [1.05, 0.86, 1.35, -0.56, 1.06, 0.95, '#457b9d'],
    [2.2, 1.12, 1.5, 0, 1.06, -0.65, '#e9c46a'],
    [1.05, 0.8, 1.3, 0.56, 1.06, -2.35, '#2a9d8f'],
    [1.05, 1.08, 1.3, -0.56, 1.06, -2.35, '#c8955a'],
    [0.8, 0.6, 0.9, 0.5, 2.06, 0.95, '#d98c6a'],
  ];
  for (const [w, h, d, x, y, z, c] of crates) b.add(rbox(w - 0.06, h, d - 0.06, 0.04, x, y, z), { color: c, part: 1, rough: 1.1 });
  // variant 1: tarp with lettering, ratchet straps over it
  b.add(rbox(W - 0.02, 1.7, bedD - 0.2, 0.14, 0, 1.06, bedZ - 0.05, 2), { color: '#6d8768', part: 2, rough: 1.2 });
  b.add(decalPlane(4.6, 1.15, W / 2 + 0.002, 1.9, bedZ - 0.1, 'px'), { color: '#ffffff', decal: R_TARP, part: 2 });
  b.add(decalPlane(4.6, 1.15, -W / 2 - 0.002, 1.9, bedZ - 0.1, 'nx'), { color: '#ffffff', decal: R_TARP, part: 2 });
  for (const z of [bedZ + 2.3, bedZ - 2.4]) b.add(rbox(W + 0.01, 1.71, 0.05, 0.14, 0, 1.065, z), { color: '#d9a326', part: 2, rough: 1.1 });
  // wheels: steered front axle + tandem rear
  for (const s of [1, -1]) {
    wheel(b, s * 1.0, 0.48, axF, 0.48, 0.34, true, '#c9ccd0', 'steel');
    wheel(b, s * 1.0, 0.48, axF - 4.4, 0.48, 0.38, false, '#c9ccd0', 'steel');
    wheel(b, s * 1.0, 0.48, axF - 5.5, 0.48, 0.38, false, '#c9ccd0', 'steel');
    b.add(bx(0.42, 0.06, 2.2, s * 1.0, 1.0, axF - 4.95), { color: '#2b2e33' });
  }
  return b.build();
}

/** side profile (z, y) with wheel arches cut into the bottom edge (axle height ay, radius ra), rounded ends,
 *  extruded across x to width w (centred) with bevelled edges */
function archedSlab(L: number, y0: number, y1: number, w: number, arches: number[], ay: number, ra: number, rBot: number, rTop: number, bevel: number): THREE.BufferGeometry {
  const h = L / 2 - bevel;
  const b0 = y0 + bevel,
    b1 = y1 - bevel;
  const sh = new THREE.Shape();
  sh.moveTo(-h + rBot, b0);
  const da = Math.asin(Math.max(-1, Math.min(1, (b0 - ay) / (ra + bevel))));
  for (const az of [...arches].sort((p, q) => p - q)) {
    const dz = Math.cos(da) * (ra + bevel);
    sh.lineTo(az - dz, b0);
    sh.absarc(az, ay, ra + bevel, Math.PI - da, da, true);
  }
  sh.lineTo(h - rBot, b0);
  sh.quadraticCurveTo(h, b0, h, b0 + rBot);
  sh.lineTo(h, b1 - rTop);
  sh.quadraticCurveTo(h, b1, h - rTop, b1);
  sh.lineTo(-h + rTop, b1);
  sh.quadraticCurveTo(-h, b1, -h, b1 - rTop);
  sh.lineTo(-h, b0 + rBot);
  sh.quadraticCurveTo(-h, b0, -h + rBot, b0);
  const depth = w - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: LOD < 2,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: LOD === 0 ? 3 : 1,
    curveSegments: LOD === 0 ? 10 : LOD === 1 ? 5 : 3,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}

/** flat rounded rectangle facing ±x (side) or ±z, centred at (x, y, z); u along the face width */
function roundPane(w: number, h: number, r: number, x: number, y: number, z: number, face: 'px' | 'nx' | 'pz' | 'nz'): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const a = w / 2,
    c = h / 2,
    q = Math.min(r, a - 0.001, c - 0.001);
  sh.moveTo(-a + q, -c);
  sh.lineTo(a - q, -c);
  sh.quadraticCurveTo(a, -c, a, -c + q);
  sh.lineTo(a, c - q);
  sh.quadraticCurveTo(a, c, a - q, c);
  sh.lineTo(-a + q, c);
  sh.quadraticCurveTo(-a, c, -a, c - q);
  sh.lineTo(-a, -c + q);
  sh.quadraticCurveTo(-a, -c, -a + q, -c);
  const g = new THREE.ShapeGeometry(sh, LOD === 0 ? 4 : 1);
  if (face === 'px') g.rotateY(Math.PI / 2);
  else if (face === 'nx') g.rotateY(-Math.PI / 2);
  else if (face === 'nz') g.rotateY(Math.PI);
  g.translate(x, y, z);
  return g;
}

/**
 * City bus (11 m, low floor): an extruded body with real wheel arches, a route-coloured skirt, rounded windows in
 * black rubber seals (some with a top hopper), glazed two-leaf folding doors on the kerb (−X) side, a tall
 * windscreen in a black surround with wipers, destination display, grille, twin lamps, mirrors on arms, roof
 * units; seats, poles and passengers through the glass (vehicleMaterial.ts class 4).
 */
function bus(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 11.0,
    W = 2.5;
  const CREAM = '#f4f0e6';
  const SEAL = '#1a1c1f';
  const axF = L / 2 - 2.6,
    axR = axF - 6.0;
  const ra = 0.6;
  b.add(archedSlab(L, 0.35, 3.05, W, [axF, axR], 0.48, ra, 0.18, 0.3, 0.07), { color: CREAM, rough: 0.85 });
  // route-coloured skirt (follows the arches) + window-top stripes
  b.add(archedSlab(L + 0.02, 0.33, 0.95, W + 0.03, [axF, axR], 0.48, ra, 0.16, 0.05, 0.04), { color: '#ffffff', paint: true, rough: 0.8 });
  for (const s of [1, -1]) b.add(bx(0.02, 0.12, L - 0.9, s * (W / 2 + 0.006), 2.46, -0.1), { color: '#ffffff', paint: true });
  // wheel-arch liners
  for (const az of [axF, axR]) {
    const lin = inward(new THREE.CylinderGeometry(ra - 0.01, ra - 0.01, W - 0.12, LOD === 0 ? 14 : 6, 1, true, -Math.PI / 2, Math.PI));
    lin.rotateZ(Math.PI / 2);
    lin.translate(0, 0.48, az);
    b.add(lin, { color: WELL, rough: 1.6 });
  }
  const cabin: Det = { c: 4, a: [W / 2 - 0.1, 1.3, 2.86, L / 2 - 0.35], b: [-L / 2 + 0.3, L / 2 - 2.55, 0, 0] };
  const glass: PartOpts = { color: GLASS, light: LIGHT_CABIN, rough: 0.2, det: cabin };
  const yw0 = 1.3,
    yw1 = 2.38;
  const pane = (s: number, z0: number, z1: number, hopper: boolean) => {
    const x = s * (W / 2);
    const w = z1 - z0,
      zc = (z0 + z1) / 2,
      yc = (yw0 + yw1) / 2;
    b.add(roundPane(w + 0.07, yw1 - yw0 + 0.07, 0.1, x + s * 0.004, yc, zc, s > 0 ? 'px' : 'nx'), { color: SEAL, rough: 1.1 });
    b.add(roundPane(w, yw1 - yw0, 0.08, x + s * 0.009, yc, zc, s > 0 ? 'px' : 'nx'), glass);
    if (hopper && LOD === 0) b.add(bx(0.012, 0.03, w, x + s * 0.012, yw1 - 0.3, zc), { color: SEAL, rough: 1.1 });
  };
  const run = (s: number, z0: number, z1: number, n: number, k0: number) => {
    const step = (z1 - z0) / n;
    for (let k = 0; k < n; k++) pane(s, z0 + k * step + 0.07, z0 + (k + 1) * step - 0.07, (k + k0) % 2 === 0);
  };
  // driver side (+X): seven panes and the driver's window
  run(1, -4.95, 4.0, 7, 0);
  pane(1, 4.12, 5.12, false);
  // kerb side (−X): panes round the doors
  run(-1, -4.95, -0.42, 3, 1);
  run(-1, 0.92, 3.7, 2, 0);
  // folding doors: two glazed leaves each in a dark frame, a seal down the middle, a step plate
  for (const z of [4.35, 0.25]) {
    const x = -W / 2 - 0.004;
    b.add(decalPlane(1.16, 2.1, x, 0.36 + 1.05, z, 'nx'), { color: '#2b2f33', rough: 0.8 });
    for (const lz of [z - 0.28, z + 0.28]) {
      b.add(roundPane(0.44, 1.12, 0.05, x - 0.006, 1.78, lz, 'nx'), glass);
      b.add(roundPane(0.44, 0.62, 0.05, x - 0.006, 0.84, lz, 'nx'), glass);
    }
    b.add(bx(0.02, 2.06, 0.03, x - 0.008, 0.37, z), { color: SEAL });
    b.add(bx(0.06, 0.04, 1.12, -W / 2 + 0.01, 0.32, z), { color: '#7d8287', rough: 0.7, finish: 'chrome' });
  }
  // front: windscreen in a black surround, wipers, destination display
  const zf = L / 2;
  b.add(roundPane(2.36, 1.62, 0.14, 0, 1.92, zf + 0.004, 'pz'), { color: SEAL, rough: 1.1 });
  b.add(roundPane(2.26, 1.5, 0.12, 0, 1.9, zf + 0.009, 'pz'), { color: GLASS, light: LIGHT_CABIN, rough: 0.2, det: cabin });
  if (LOD === 0)
    for (const x of [-0.55, 0.5]) {
      b.add(tube(x - 0.05, 1.2, zf + 0.025, x + 0.25, 1.95, zf + 0.025, 0.012), { color: '#141518', rough: 1.4 });
    }
  b.add(bx(2.02, 0.36, 0.03, 0, 2.62, zf + 0.012), { color: '#16181b' });
  b.add(decalPlane(1.93, 0.28, 0, 2.8, zf + 0.03, 'pz'), { color: '#ffffff', decal: R_BUS_SIGN, decalRows: true, light: LIGHT_SIGN });
  // rear window, rear sign, engine louvres
  b.add(roundPane(1.9, 0.72, 0.1, 0, 2.31, -zf - 0.009, 'nz'), { color: GLASS, light: LIGHT_CABIN, rough: 0.2, det: cabin });
  b.add(decalPlane(0.9, 0.22, 0, 2.86, -zf - 0.012, 'nz'), { color: '#ffffff', decal: R_BUS_SIGN, decalRows: true, light: LIGHT_SIGN });
  b.add(decalPlane(1.5, 0.5, 0, 0.87, -zf - 0.012, 'nz'), { color: '#ffffff', rough: 1, decal: R_BUS_GRILLE });
  // side lettering under the windows
  b.add(decalPlane(3.0, 0.32, W / 2 + 0.022, 1.13, -1.6, 'px'), { color: '#ffffff', decal: R_BUS_SIDE });
  b.add(decalPlane(3.0, 0.32, -W / 2 - 0.022, 1.13, -1.9, 'nx'), { color: '#ffffff', decal: R_BUS_SIDE });
  // roof: AC unit, two hatches
  b.add(rbox(1.7, 0.3, 2.7, 0.09, 0, 3.02, -1.7), { color: '#d4d7da', rough: 0.9 });
  if (LOD < 2) for (const z of [2.6, 0.6]) b.add(rbox(0.78, 0.07, 0.78, 0.03, 0, 3.03, z), { color: '#c3c6c9', rough: 0.9 });
  // bumpers, grille, lamps (twin round lamps in a bezel), plates
  b.add(rbox(W + 0.03, 0.26, 0.24, 0.09, 0, 0.32, zf - 0.08), { color: DARK, rough: 1.2 });
  b.add(rbox(W + 0.03, 0.26, 0.24, 0.09, 0, 0.32, -zf + 0.08), { color: DARK, rough: 1.2 });
  b.add(decalPlane(1.1, 0.3, 0, 0.78, zf + 0.008, 'pz'), { color: '#ffffff', rough: 1, decal: R_BUS_GRILLE });
  for (const e of [1, -1]) {
    b.add(bx(0.49, 0.12, 0.012, 0, e > 0 ? 0.36 : 0.36, e * (zf + 0.04)), { color: '#16171a', rough: 1.2 });
    b.add(decalPlane(0.46, 0.1, 0, 0.42, e * (zf + 0.0475), e > 0 ? 'pz' : 'nz'), { color: '#ffffff', rough: 0.6, decal: R_PLATE, plate: true });
  }
  for (const s of [1, -1]) {
    b.add(rbox(0.36, 0.17, 0.07, 0.05, s * 0.85, 0.72, zf + 0.005), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    b.add(decalPlane(0.34, 0.16, s * 0.85, 0.805, zf + 0.042, 'pz'), { color: '#ffffff', light: LIGHT_HEAD, rough: 0.15, decal: R_BUS_HEAD });
    b.add(bx(0.11, 0.11, 0.06, s * 1.12, 0.74, zf - 0.01), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(bx(0.16, 0.42, 0.05, s * 1.06, 0.8, -zf - 0.02), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    b.add(bx(0.16, 0.12, 0.05, s * 1.06, 1.26, -zf - 0.02), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    // mirrors on curved arms ("ram's horns") from the roof corners, heads hanging ahead of the windscreen
    const xa = s * 1.18,
      xb = s * 1.36;
    b.add(tube(xa, 2.78, zf - 0.04, xb, 2.82, zf + 0.22, 0.025), { color: DARK });
    b.add(tube(xb, 2.82, zf + 0.22, xb, 2.5, zf + 0.36, 0.025), { color: DARK });
    b.add(rbox(0.1, 0.38, 0.2, 0.04, xb, 2.12, zf + 0.38), { color: DARK });
    if (LOD === 0) b.add(decalPlane(0.08, 0.34, xb, 2.31, zf + 0.277, 'nz'), { color: '#8c9aa6', rough: 0.15, finish: 'chrome' });
  }
  for (const s of [1, -1]) {
    wheel(b, s * 1.07, 0.48, axF, 0.48, 0.32, true, '#d9dcdf', 'steel');
    wheel(b, s * 1.07, 0.48, axR, 0.48, 0.36, false, '#d9dcdf', 'steel');
  }
  return b.build();
}

function icecream(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 5.0,
    W = 2.0;
  const axF = L / 2 - 0.9,
    axR = axF - 3.0;
  b.add(archedSlab(L, 0.38, 2.3, W, [axF, axR], 0.36, 0.45, 0.3, 0.4, 0.08), { color: '#ffffff', paint: true, rough: 0.8 });
  b.add(archedSlab(L + 0.02, 0.36, 0.7, W + 0.03, [axF, axR], 0.36, 0.45, 0.2, 0.05, 0.04), { color: '#f7f4ee', rough: 0.9 });
  for (const az of [axF, axR]) archLiner(b, az, 0.36, 0.44, W - 0.12);
  // windscreen + cab side windows in seals, over a cab interior
  const glass: PartOpts = { color: GLASS, rough: 0.2, det: { c: 5, a: [0.88, 1.36, 2.1, L / 2 - 0.3], b: [L / 2 - 1.6, L / 2 - 1.0, -9, 0] } };
  b.add(roundPane(1.84, 0.68, 0.1, 0, 1.69, L / 2 + 0.004, 'pz'), { color: '#1a1c1f', rough: 1.1 });
  b.add(roundPane(1.76, 0.6, 0.08, 0, 1.69, L / 2 + 0.009, 'pz'), glass);
  if (LOD === 0) for (const x of [-0.45, 0.4]) b.add(tube(x - 0.05, 1.42, L / 2 + 0.025, x + 0.25, 1.85, L / 2 + 0.025, 0.011), { color: '#141518', rough: 1.4 });
  cabSide(b, W / 2, 0.82, 0.5, 1.7, L / 2 - 0.72, L / 2 - 1.2, 0.75, glass);
  // serving hatch (kerb side) with striped awning
  b.add(bx(0.03, 0.74, 1.95, -W / 2 - 0.005, 1.18, -0.55), { color: '#3a2a22', light: LIGHT_CABIN, rough: 0.3 });
  for (let i = 0; i < 6; i++) b.add(bx(0.62, 0.05, 0.36, -W / 2 - 0.27, 1.98 - 0.0, -1.45 + i * 0.36), { color: i % 2 === 0 ? '#e9547e' : '#ffffff' });
  b.add(decalPlane(2.1, 0.42, -W / 2 - 0.012, 0.86, -0.55, 'nx'), { color: '#ffffff', decal: R_ICECREAM });
  b.add(decalPlane(3.2, 1.0, W / 2 + 0.012, 1.42, -0.5, 'px'), { color: '#ffffff', decal: R_ICECREAM });
  for (const e of [1, -1]) {
    b.add(bx(0.49, 0.12, 0.012, 0, 0.44, e * (L / 2 + 0.05)), { color: '#16171a', rough: 1.2 });
    b.add(decalPlane(0.46, 0.1, 0, 0.5, e * (L / 2 + 0.0565), e > 0 ? 'pz' : 'nz'), { color: '#ffffff', rough: 0.6, decal: R_PLATE, plate: true });
  }
  // the giant cone on the roof
  const cone = new THREE.ConeGeometry(0.42, 0.95, sg(14), 1);
  cone.rotateX(Math.PI);
  cone.translate(0, 2.3 + 0.475, -0.6);
  b.add(cone, { color: '#d9a35b', rough: 1.1 });
  const scoop = new THREE.SphereGeometry(0.47, sg(14), sg(10));
  scoop.translate(0, 3.38, -0.6);
  b.add(scoop, { color: '#fbd0de', rough: 0.9 });
  const cherry = new THREE.SphereGeometry(0.11, sg(8), sg(6));
  cherry.translate(0.04, 3.9, -0.6);
  b.add(cherry, { color: '#d62839', rough: 0.4 });
  // bumpers + lights
  b.add(rbox(W + 0.03, 0.2, 0.22, 0.07, 0, 0.36, L / 2 - 0.07), { color: CHROME, rough: 0.5 });
  b.add(rbox(W + 0.03, 0.2, 0.22, 0.07, 0, 0.36, -L / 2 + 0.07), { color: CHROME, rough: 0.5 });
  for (const s of [1, -1]) {
    b.add(rbox(0.3, 0.26, 0.08, 0.12, s * 0.66, 0.66, L / 2 - 0.0), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    b.add(decalPlane(0.24, 0.22, s * 0.66, 0.79, L / 2 + 0.042, 'pz'), { color: '#ffffff', light: LIGHT_HEAD, rough: 0.15, decal: R_HEAD_ROUND });
    b.add(bx(0.1, 0.09, 0.06, s * 0.92, 0.62, L / 2 - 0.04), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(rbox(0.2, 0.26, 0.06, 0.06, s * 0.75, 0.7, -L / 2 + 0.0), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    b.add(bx(0.1, 0.09, 0.06, s * 0.92, 1.02, -L / 2 + 0.02), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
  }
  for (const s of [1, -1]) {
    wheel(b, s * 0.88, 0.36, axF, 0.36, 0.26, true);
    wheel(b, s * 0.88, 0.36, axR, 0.36, 0.26, false);
  }
  return b.build();
}

/** Build one vehicle model at detail level `lod` (0 full .. MODEL_LODS-1 far). */
export function buildModel(kind: ModelKind, lod = 0): THREE.BufferGeometry {
  LOD = Math.max(0, Math.min(MODEL_LODS - 1, lod | 0));
  try {
    return buildKind(kind);
  } finally {
    LOD = 0;
  }
}

function buildKind(kind: ModelKind): THREE.BufferGeometry {
  switch (kind) {
    case 'compact':
      return compact();
    case 'hatch':
      return hatch();
    case 'sedan':
      return sedan();
    case 'suv':
      return suv();
    case 'delivery':
      return delivery();
    case 'lorry':
      return lorry();
    case 'bus':
      return bus();
    case 'icecream':
      return icecream();
    case 'bike':
      return bikes();
    case 'moto':
      return motos();
  }
}

// ──────────────────────────────────────────────────────── two-wheelers ──
// Kinds 'bike' (variants 0 city bicycle, 1 e-scooter, 2 Dutch bike with basket and rack) and 'moto'
// (0 Vespa-style scooter, 1 delivery scooter with a top box, 2 motorbike). Body centre at z = 0; the axle
// positions match specs.ts; rider anchor points (saddle, bars, pedals / pegs / deck) are in RIDE below.

/** variant bitmask part id (aPart ≥ 16) */
const VB = (...v: number[]): number => 16 + v.reduce((m, x) => m | (1 << x), 0);

/** a round tube between two points (radius r), simplified with the level */
function tube(ax: number, ay: number, az: number, bx2: number, by: number, bz: number, r: number): THREE.BufferGeometry {
  const dx = bx2 - ax,
    dy = by - ay,
    dz = bz - az;
  const L = Math.hypot(dx, dy, dz);
  const g = LOD === 0 ? new THREE.CylinderGeometry(r, r, L, 6, 1, true) : LOD === 1 ? new THREE.CylinderGeometry(r * 1.2, r * 1.2, L, 4, 1, true) : new THREE.BoxGeometry(r * 2.4, L, r * 2.4);
  // cylinder axis = +Y → along (dx, dy, dz)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  g.applyQuaternion(q);
  g.translate((ax + bx2) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

/** thin spoked wheel (bicycle / kick scooter): tyre ring, rim, hub, a few spokes; spins about its axle */
function thinWheel(b: Builder, z: number, r: number, front: boolean, part: number, tyreW = 0.02, spokes = true): void {
  const wh = { x: 0, y: r, z, front };
  const tyre = new THREE.TorusGeometry(r - tyreW, tyreW, LOD === 0 ? 5 : 3, LOD === 0 ? 20 : LOD === 1 ? 12 : 8);
  tyre.rotateY(Math.PI / 2);
  tyre.translate(0, r, z);
  b.add(tyre, { color: TYRE, rough: 1.8, wheel: wh, part });
  if (LOD === 0) {
    const rim = new THREE.TorusGeometry(r - tyreW * 2.2, tyreW * 0.45, 3, 18);
    rim.rotateY(Math.PI / 2);
    rim.translate(0, r, z);
    b.add(rim, { color: RIM, rough: 0.6, wheel: wh, part });
  }
  if (spokes && LOD < 2) {
    for (let k = 0; k < (LOD === 0 ? 6 : 3); k++) {
      const a = (k / (LOD === 0 ? 6 : 3)) * Math.PI;
      const ca = Math.cos(a) * (r - tyreW * 2),
        sa = Math.sin(a) * (r - tyreW * 2);
      b.add(tube(0, r - sa, z - ca, 0, r + sa, z + ca, 0.004), { color: '#aeb4ba', rough: 0.6, wheel: wh, part });
    }
  }
  const hub = new THREE.CylinderGeometry(r * 0.12, r * 0.12, 0.1, 6);
  hub.rotateZ(Math.PI / 2);
  hub.translate(0, r, z);
  b.add(hub, { color: DARK, wheel: wh, part });
}

/** fat wheel (scooter / motorbike): tyre + hub discs on both sides */
function fatWheel(b: Builder, z: number, r: number, w: number, front: boolean, part: number): void {
  const wh = { x: 0, y: r, z, front };
  const n = LOD === 0 ? 14 : LOD === 1 ? 9 : 6;
  const tyre = new THREE.CylinderGeometry(r, r, w, n, 1, LOD > 0);
  tyre.rotateZ(Math.PI / 2);
  tyre.translate(0, r, z);
  b.add(tyre, { color: TYRE, rough: 1.8, wheel: wh, part });
  for (const sd of [1, -1]) {
    const hub = new THREE.CircleGeometry(r * 0.62, LOD === 0 ? 10 : 6);
    hub.rotateY((sd * Math.PI) / 2);
    hub.translate((sd * w) / 2 + sd * 0.003, r, z);
    b.add(hub, { color: RIM, rough: 0.7, wheel: wh, part });
  }
}

/**
 * Rider anchor points per (kind, variant), vehicle frame (m, body centre at z = 0, +Z forward): saddle top
 * (seatY, seatZ), grips (barY, barZ, ±barX), pedal crank centre / crank length (bicycles), foot rests (scooter
 * floorboard, motorbike pegs, scooter deck), and how the rider holds the body (lean: torso forward, rad).
 */
export interface RideGeom {
  /** 1 bicycle (pedals), 2 seated with feet on a floor / pegs, 3 standing (kick scooter) */
  mode: number;
  seatY: number;
  seatZ: number;
  barY: number;
  barZ: number;
  barX: number;
  /** crank centre and length (mode 1) or foot rest (mode 2/3: y, z, x half-spread; mode 3 second foot behind) */
  footY: number;
  footZ: number;
  footX: number;
  crank: number;
  lean: number;
}
export const RIDE: Record<'bike' | 'moto', RideGeom[]> = {
  bike: [
    { mode: 1, seatY: 0.93, seatZ: -0.22, barY: 1.0, barZ: 0.32, barX: 0.27, footY: 0.29, footZ: -0.01, footX: 0.11, crank: 0.17, lean: 0.38 },
    { mode: 3, seatY: 0.0, seatZ: -0.05, barY: 1.04, barZ: 0.36, barX: 0.22, footY: 0.13, footZ: 0.1, footX: 0.07, crank: 0, lean: 0.06 },
    { mode: 1, seatY: 0.92, seatZ: -0.26, barY: 1.06, barZ: 0.26, barX: 0.29, footY: 0.29, footZ: -0.04, footX: 0.11, crank: 0.17, lean: 0.12 },
  ],
  moto: [
    { mode: 2, seatY: 0.78, seatZ: -0.3, barY: 1.03, barZ: 0.44, barX: 0.3, footY: 0.33, footZ: 0.18, footX: 0.11, crank: 0, lean: 0.1 },
    { mode: 2, seatY: 0.78, seatZ: -0.3, barY: 1.03, barZ: 0.44, barX: 0.3, footY: 0.33, footZ: 0.18, footX: 0.11, crank: 0, lean: 0.12 },
    { mode: 2, seatY: 0.84, seatZ: -0.28, barY: 1.0, barZ: 0.38, barX: 0.33, footY: 0.36, footZ: -0.12, footX: 0.17, crank: 0, lean: 0.42 },
  ],
};

/** a passenger on the back of a Vespa: hands round the rider's waist, feet on the floorboard's rear */
export const RIDE_PILLION: RideGeom = { mode: 2, seatY: 0.8, seatZ: -0.6, barY: 0.98, barZ: -0.38, barX: 0.15, footY: 0.31, footZ: -0.3, footX: 0.15, crank: 0, lean: 0.06 };

function bikes(): THREE.BufferGeometry {
  const b = new Builder();
  // ── bicycles (v0 city / sport, v2 Dutch): frame painted, black parts
  const BK = VB(0, 2);
  const zf = 0.52,
    zr = -0.53,
    R = 0.34;
  thinWheel(b, zf, R, true, BK);
  thinWheel(b, zr, R, false, BK);
  for (const v of [0, 2]) {
    const part = VB(v);
    const dutch = v === 2;
    const bbY = 0.29,
      bbZ = dutch ? -0.04 : -0.01;
    const seatC = dutch ? [0.72, -0.2] : [0.84, -0.17];
    const headTop = dutch ? [0.98, 0.33] : [0.88, 0.37],
      headBot = dutch ? [0.72, 0.39] : [0.7, 0.42];
    const tr = 0.017;
    // top tube (Dutch: low step-through tube), down tube, seat tube, stays, fork
    if (dutch) b.add(tube(0, 0.48, bbZ + 0.12, 0, headBot[0] + 0.02, headBot[1] - 0.02, tr), { color: '#ffffff', paint: true, rough: 0.8, part });
    else b.add(tube(0, seatC[0], seatC[1], 0, headTop[0] - 0.04, headTop[1] - 0.01, tr), { color: '#ffffff', paint: true, rough: 0.8, part });
    b.add(tube(0, headBot[0], headBot[1], 0, bbY, bbZ, tr * 1.15), { color: '#ffffff', paint: true, rough: 0.8, part });
    b.add(tube(0, bbY, bbZ, 0, seatC[0], seatC[1], tr), { color: '#ffffff', paint: true, rough: 0.8, part });
    b.add(tube(0, headBot[0], headBot[1], 0, headTop[0], headTop[1], tr * 1.2), { color: '#ffffff', paint: true, rough: 0.8, part });
    for (const sd of [1, -1]) {
      b.add(tube(sd * 0.05, bbY, bbZ - 0.02, sd * 0.06, R, zr, 0.009), { color: '#ffffff', paint: true, rough: 0.8, part });
      b.add(tube(sd * 0.03, seatC[0] - 0.02, seatC[1] - 0.01, sd * 0.06, R, zr, 0.008), { color: '#ffffff', paint: true, rough: 0.8, part });
      b.add(tube(sd * 0.03, headBot[0], headBot[1], sd * 0.05, R, zf, 0.009), { color: dutch ? '#ffffff' : CHROME, paint: dutch, rough: 0.6, part });
    }
    // seat post + saddle
    const sy = dutch ? 0.92 : 0.93,
      sz = dutch ? -0.26 : -0.22;
    b.add(tube(0, seatC[0], seatC[1], 0, sy - 0.03, sz + 0.01, 0.011), { color: CHROME, rough: 0.5, part });
    b.add(rbox(dutch ? 0.2 : 0.13, 0.05, dutch ? 0.24 : 0.27, 0.02, 0, sy - 0.05, sz), { color: dutch ? '#4a3426' : '#1d1f22', rough: 1.1, part });
    // stem + handlebar (Dutch: swept-back upright bar) + grips
    const by = dutch ? 1.06 : 1.0,
      bz = dutch ? 0.26 : 0.32;
    b.add(tube(0, headTop[0], headTop[1], 0, by, bz + 0.06, 0.012), { color: CHROME, rough: 0.5, part });
    if (dutch) {
      for (const sd of [1, -1]) b.add(tube(0, by, bz + 0.06, sd * 0.29, by - 0.01, bz, 0.011), { color: CHROME, rough: 0.5, part });
    } else b.add(tube(0.28, by, bz + 0.03, -0.28, by, bz + 0.03, 0.012), { color: '#2a2c30', rough: 0.9, part });
    for (const sd of [1, -1]) b.add(tube(sd * 0.24, by, bz + (dutch ? 0.0 : 0.03), sd * 0.31, by, bz + (dutch ? 0.0 : 0.03), 0.017), { color: '#1d1f22', rough: 1.2, part });
    // mudguards
    for (const [z0, front] of [
      [zf, true],
      [zr, false],
    ] as const) {
      const g = new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.06, LOD === 0 ? 10 : 6, 1, true, front ? -0.3 : Math.PI * 0.45, Math.PI * 0.7);
      g.rotateZ(Math.PI / 2);
      g.translate(0, R, z0);
      if (dutch || v === 0) b.add(g, { color: dutch ? '#ffffff' : '#2a2c30', paint: dutch, rough: 0.9, part });
    }
    // chainring + crank arms + pedals (turn with the pedalling: wheel tag 3 about the bottom bracket)
    const ck = { x: 0, y: bbY, z: bbZ, front: false, crank: true };
    const ring = new THREE.CircleGeometry(0.09, LOD === 0 ? 12 : 6);
    ring.rotateY(-Math.PI / 2);
    ring.translate(-0.045, bbY, bbZ);
    b.add(ring, { color: '#5b6066', rough: 0.6, wheel: ck, part });
    for (const sd of [1, -1]) {
      const ang = sd > 0 ? 0 : Math.PI;
      const pz = bbZ + Math.sin(ang) * 0.17,
        py = bbY - Math.cos(ang) * 0.17;
      b.add(tube(sd * 0.07, bbY, bbZ, sd * 0.08, py, pz, 0.01), { color: '#3c4046', rough: 0.6, wheel: ck, part });
      b.add(bx(0.09, 0.025, 0.07, sd * 0.13, py - 0.012, pz), { color: '#1d1f22', rough: 1.2, wheel: ck, part });
    }
    if (dutch) {
      // front basket (wicker) and rear rack
      b.add(rbox(0.36, 0.2, 0.28, 0.03, 0, 0.84, zf + 0.04), { color: '#a07a48', rough: 1.4, part });
      b.add(bx(0.2, 0.025, 0.36, 0, R + 0.32, zr + 0.1), { color: '#2a2c30', rough: 0.8, part });
      // lamp on the basket
      b.add(rbox(0.07, 0.07, 0.05, 0.02, 0, 0.8, zf + 0.2), { color: HEAD, light: LIGHT_HEAD, rough: 0.4, part });
    } else b.add(rbox(0.05, 0.05, 0.04, 0.015, 0, 0.9, 0.42), { color: HEAD, light: LIGHT_HEAD, rough: 0.4, part });
    b.add(rbox(0.05, 0.04, 0.025, 0.01, 0, dutch ? 0.62 : 0.66, zr - 0.08), { color: TAIL, light: LIGHT_TAIL, rough: 0.5, part });
  }
  // ── e-scooter (v1): deck, stem, T-bar, small wheels; painted in the operator's colour
  {
    const part = VB(1);
    const r = 0.11;
    thinWheel(b, 0.4, r, true, part, 0.03, false);
    thinWheel(b, -0.4, r, false, part, 0.03, false);
    b.add(rbox(0.15, 0.05, 0.66, 0.02, 0, 0.07, -0.02), { color: '#ffffff', paint: true, rough: 0.8, part });
    b.add(bx(0.13, 0.008, 0.5, 0, 0.12, -0.04), { color: '#1d1f22', rough: 1.6, part });
    b.add(tube(0, 0.12, 0.33, 0, 1.0, 0.4, 0.022), { color: '#ffffff', paint: true, rough: 0.8, part });
    b.add(tube(0.23, 1.02, 0.4, -0.23, 1.02, 0.4, 0.014), { color: '#2a2c30', rough: 0.9, part });
    for (const sd of [1, -1]) b.add(tube(sd * 0.17, 1.02, 0.4, sd * 0.24, 1.02, 0.4, 0.019), { color: '#1d1f22', rough: 1.2, part });
    b.add(tube(0, 0.2, 0.4, 0, 0.11, 0.4, 0.012), { color: '#2a2c30', rough: 0.9, part });
    b.add(rbox(0.06, 0.05, 0.03, 0.015, 0, 0.92, 0.43), { color: HEAD, light: LIGHT_HEAD, rough: 0.4, part });
    b.add(rbox(0.06, 0.02, 0.02, 0.008, 0, 0.17, -0.38), { color: TAIL, light: LIGHT_TAIL, rough: 0.5, part });
    // rear mudguard
    b.add(bx(0.08, 0.012, 0.18, 0, 0.23, -0.38), { color: '#2a2c30', rough: 1.0, part });
  }
  return b.build();
}

function motos(): THREE.BufferGeometry {
  const b = new Builder();
  // ── Vespa-style scooter (v0) + delivery scooter (v1, same body + top box)
  {
    const SC = VB(0, 1);
    const zf = 0.65,
      zr = -0.65,
      R = 0.24;
    fatWheel(b, zf, R, 0.1, true, SC);
    fatWheel(b, zr, R, 0.11, false, SC);
    // rear cowl (body colour), tapering towards the top
    const cowl = rbox(0.5, 0.42, 0.78, 0.16, 0, 0.26, -0.42, 2);
    taper(cowl, 0.26, 0.68, -0.42, 0.18, 0.1, 0.12);
    b.add(cowl, { color: '#ffffff', paint: true, rough: 0.7, part: SC });
    // floorboard + leg shield + front fender + headset
    b.add(rbox(0.36, 0.07, 0.56, 0.03, 0, 0.24, 0.1), { color: '#2c2f33', rough: 1.4, part: SC });
    const shield = rbox(0.48, 0.62, 0.07, 0.03, 0, 0.27, 0.44);
    taper(shield, 0.27, 0.89, 0.44, 0.35, 0.0, 0.0);
    b.add(shield, { color: '#ffffff', paint: true, rough: 0.7, part: SC });
    b.add(rbox(0.16, 0.12, 0.42, 0.05, 0, 0.42, 0.66), { color: '#ffffff', paint: true, rough: 0.7, part: SC });
    b.add(tube(0, 0.5, 0.6, 0, 0.98, 0.5, 0.03), { color: '#2c2f33', rough: 0.9, part: SC });
    b.add(rbox(0.3, 0.12, 0.16, 0.05, 0, 0.94, 0.5), { color: '#ffffff', paint: true, rough: 0.7, part: SC });
    b.add(tube(0.3, 1.03, 0.45, -0.3, 1.03, 0.45, 0.014), { color: CHROME, rough: 0.5, part: SC });
    for (const sd of [1, -1]) {
      b.add(tube(sd * 0.24, 1.03, 0.45, sd * 0.32, 1.03, 0.45, 0.02), { color: '#1d1f22', rough: 1.2, part: SC });
      b.add(tube(sd * 0.2, 1.03, 0.47, sd * 0.25, 1.2, 0.47, 0.006), { color: CHROME, rough: 0.5, part: SC });
      b.add(rbox(0.08, 0.05, 0.02, 0.015, sd * 0.26, 1.19, 0.47), { color: '#7d8a94', rough: 0.3, part: SC });
    }
    b.add(rbox(0.13, 0.1, 0.06, 0.04, 0, 0.92, 0.6), { color: HEAD, light: LIGHT_HEAD, rough: 0.4, part: SC });
    // seat + tail light + blinkers
    b.add(rbox(0.3, 0.1, 0.62, 0.05, 0, 0.66, -0.32), { color: '#2a241f', rough: 1.1, part: SC });
    b.add(rbox(0.14, 0.06, 0.04, 0.02, 0, 0.52, -0.83), { color: TAIL, light: LIGHT_TAIL, rough: 0.5, part: SC });
    for (const sd of [1, -1]) {
      b.add(bx(0.05, 0.04, 0.04, sd * 0.17, 0.86, 0.56), { color: AMBER, light: sd > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R, part: SC });
      b.add(bx(0.05, 0.04, 0.04, sd * 0.13, 0.5, -0.83), { color: AMBER, light: sd > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R, part: SC });
    }
    // delivery: rack + insulated top box (light grey with a coloured lid)
    const DV = VB(1);
    b.add(bx(0.32, 0.03, 0.34, 0, 0.74, -0.66), { color: '#2a2c30', rough: 0.9, part: DV });
    b.add(rbox(0.46, 0.4, 0.44, 0.05, 0, 0.77, -0.68), { color: '#ffffff', paint: true, rough: 1.0, part: DV });
    b.add(rbox(0.47, 0.06, 0.45, 0.03, 0, 1.15, -0.68), { color: '#f2f2f0', rough: 1.0, part: DV });
  }
  // ── motorbike (v2): tank in the body colour, dark engine, chrome exhaust and forks
  {
    const MB = VB(2);
    const zf = 0.71,
      zr = -0.71,
      R = 0.3;
    fatWheel(b, zf, R, 0.11, true, MB);
    fatWheel(b, zr, R, 0.15, false, MB);
    b.add(rbox(0.3, 0.32, 0.5, 0.06, 0, 0.24, 0.05), { color: '#3a3d42', rough: 0.9, part: MB });
    b.add(rbox(0.22, 0.12, 0.4, 0.04, 0, 0.56, 0.1), { color: '#2c2f33', rough: 0.9, part: MB });
    const tank = rbox(0.32, 0.22, 0.5, 0.1, 0, 0.66, 0.2, 2);
    taper(tank, 0.66, 0.88, 0.2, 0.25, 0.05, 0.12);
    b.add(tank, { color: '#ffffff', paint: true, rough: 0.6, part: MB });
    b.add(rbox(0.27, 0.09, 0.55, 0.04, 0, 0.76, -0.3), { color: '#1d1f22', rough: 1.2, part: MB });
    // side covers under the seat (body colour) and the frame between tank and engine
    b.add(rbox(0.25, 0.22, 0.42, 0.05, 0, 0.53, -0.24), { color: '#ffffff', paint: true, rough: 0.6, part: MB });
    b.add(rbox(0.16, 0.2, 0.3, 0.03, 0, 0.5, 0.36), { color: '#2c2f33', rough: 0.9, part: MB });
    const tail = rbox(0.22, 0.12, 0.38, 0.05, 0, 0.74, -0.66);
    taper(tail, 0.74, 0.86, -0.66, 0.3, 0.0, 0.1);
    b.add(tail, { color: '#ffffff', paint: true, rough: 0.6, part: MB });
    for (const sd of [1, -1]) {
      b.add(tube(sd * 0.08, R, zf, sd * 0.08, 0.98, 0.52, 0.022), { color: CHROME, rough: 0.4, part: MB });
      // swing arm to the engine, a shock absorber up to the seat frame
      b.add(tube(sd * 0.1, R, zr, sd * 0.11, 0.36, -0.12, 0.022), { color: '#2c2f33', rough: 0.9, part: MB });
      b.add(tube(sd * 0.1, 0.4, -0.52, sd * 0.1, 0.72, -0.36, 0.018), { color: '#c99a2e', rough: 0.5, part: MB });
      // foot pegs
      b.add(tube(sd * 0.12, 0.36, -0.12, sd * 0.2, 0.36, -0.12, 0.012), { color: '#2c2f33', rough: 0.9, part: MB });
    }
    b.add(tube(0.34, 1.0, 0.42, -0.34, 1.0, 0.42, 0.013), { color: '#2a2c30', rough: 0.8, part: MB });
    for (const sd of [1, -1]) b.add(tube(sd * 0.27, 1.0, 0.42, sd * 0.35, 1.0, 0.42, 0.02), { color: '#1d1f22', rough: 1.2, part: MB });
    const lamp = new THREE.CylinderGeometry(0.09, 0.08, 0.08, LOD === 0 ? 12 : 6);
    lamp.rotateX(Math.PI / 2);
    lamp.translate(0, 0.92, 0.62);
    b.add(lamp, { color: HEAD, light: LIGHT_HEAD, rough: 0.4, part: MB });
    b.add(tube(-0.15, 0.26, 0.1, -0.18, 0.44, -0.78, 0.035), { color: CHROME, rough: 0.35, part: MB });
    b.add(rbox(0.12, 0.05, 0.04, 0.02, 0, 0.8, -0.86), { color: TAIL, light: LIGHT_TAIL, rough: 0.5, part: MB });
    const fender = new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.13, LOD === 0 ? 10 : 6, 1, true, -0.4, Math.PI * 0.6);
    fender.rotateZ(Math.PI / 2);
    fender.translate(0, R, zf);
    b.add(fender, { color: '#ffffff', paint: true, rough: 0.6, part: MB });
  }
  return b.build();
}
