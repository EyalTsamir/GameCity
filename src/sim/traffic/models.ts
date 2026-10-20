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

export const ATLAS_SIZE = 512;
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

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ─────────────────────────────────────────────────────────── builder ──

interface PartOpts {
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
    const uv = new Float32Array(n * 2);
    const srcUv = geo.attributes.uv as THREE.BufferAttribute | undefined;
    const step = o.decal && o.decalRows ? o.decal.h / ATLAS_SIZE : 0;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _col.r;
      col[i * 3 + 1] = _col.g;
      col[i * 3 + 2] = _col.b;
      meta[i * 4] = o.paint ? 1 : 0;
      meta[i * 4 + 1] = o.light ?? 0;
      meta[i * 4 + 2] = step;
      meta[i * 4 + 3] = o.rough ?? 1;
      if (o.wheel) {
        wheel[i * 4] = o.wheel.x;
        wheel[i * 4 + 1] = o.wheel.y;
        wheel[i * 4 + 2] = o.wheel.z;
        wheel[i * 4 + 3] = o.wheel.crank ? 3 : o.wheel.front ? 2 : 1;
      }
      part[i] = o.part ?? 0;
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

function wheel(b: Builder, x: number, y: number, z: number, r: number, w: number, front: boolean, rim = RIM): void {
  const side = Math.sign(x) || 1;
  const wh = { x, y, z, front };
  if (LOD > 0) {
    // tyre tread + outer sidewall only (the inner one faces the chassis), hub as a disc, no spokes
    const n = LOD === 1 ? 10 : 6;
    const tread = new THREE.CylinderGeometry(r, r, w, n, 1, true);
    tread.rotateZ(Math.PI / 2);
    tread.translate(x, y, z);
    b.add(tread, { color: TYRE, rough: 1.8, wheel: wh });
    const wall = new THREE.CircleGeometry(r, n);
    wall.rotateY((side * Math.PI) / 2);
    wall.translate(x + (side * w) / 2, y, z);
    b.add(wall, { color: TYRE, rough: 1.8, wheel: wh });
    const hub = new THREE.CircleGeometry(r * 0.58, LOD === 1 ? 8 : 6);
    hub.rotateY((side * Math.PI) / 2);
    hub.translate(x + side * (w / 2 + 0.019), y, z);
    b.add(hub, { color: rim, rough: 0.7, wheel: wh });
    return;
  }
  const tyre = new THREE.CylinderGeometry(r, r, w, 16, 1);
  tyre.rotateZ(Math.PI / 2);
  tyre.translate(x, y, z);
  b.add(tyre, { color: TYRE, rough: 1.8, wheel: wh });
  const hub = new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.03, 12, 1);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x + side * (w / 2 + 0.004), y, z);
  b.add(hub, { color: rim, rough: 0.7, wheel: wh });
  // two crossing spokes so the spin reads up close
  const s1 = new THREE.BoxGeometry(0.02, r * 1.05, r * 0.16);
  s1.translate(x + side * (w / 2 + 0.02), y, z);
  b.add(s1, { color: '#6a7077', wheel: wh });
  const s2 = new THREE.BoxGeometry(0.02, r * 0.16, r * 1.05);
  s2.translate(x + side * (w / 2 + 0.02), y, z);
  b.add(s2, { color: '#6a7077', wheel: wh });
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
}

/** Wheels, bumpers, lights, plates, mirrors common to the cars. */
function carDetails(b: Builder, d: CarDims): void {
  const { L, W } = d;
  wheel(b, d.wheelX, d.wheelR, d.axF, d.wheelR, d.wheelW, true);
  wheel(b, -d.wheelX, d.wheelR, d.axF, d.wheelR, d.wheelW, true);
  wheel(b, d.wheelX, d.wheelR, d.axR, d.wheelR, d.wheelW, false);
  wheel(b, -d.wheelX, d.wheelR, d.axR, d.wheelR, d.wheelW, false);
  // bumpers
  b.add(rbox(W - 0.05, 0.17, 0.2, 0.08, 0, d.bodyY - 0.02, L / 2 - 0.08), { color: DARK, rough: 1.2 });
  b.add(rbox(W - 0.05, 0.17, 0.2, 0.08, 0, d.bodyY - 0.02, -L / 2 + 0.08), { color: DARK, rough: 1.2 });
  // headlights
  const hw = d.roundLights ? 0.26 : 0.36,
    hh = d.roundLights ? 0.22 : 0.13;
  for (const s of [1, -1]) {
    b.add(rbox(hw, hh, 0.08, d.roundLights ? 0.1 : 0.04, s * (W / 2 - 0.3), d.lightY - hh / 2, L / 2 - 0.02), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    b.add(rbox(0.3, 0.13, 0.07, 0.04, s * (W / 2 - 0.26), d.lightY - 0.04, -L / 2 + 0.015), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    // blinkers (front corners + beside the tail lights)
    b.add(bx(0.09, 0.08, 0.06, s * (W / 2 - 0.06), d.lightY - 0.15, L / 2 - 0.05), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(bx(0.09, 0.08, 0.06, s * (W / 2 - 0.07), d.lightY - 0.17, -L / 2 + 0.03), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
  }
  // grille + plates
  b.add(rbox(W * 0.36, 0.11, 0.05, 0.03, 0, d.lightY - 0.12, L / 2 + 0.005), { color: '#25282c', rough: 1.2 });
  b.add(bx(0.38, 0.1, 0.02, 0, d.bodyY + 0.02, L / 2 + 0.02), { color: PLATE });
  b.add(bx(0.38, 0.1, 0.02, 0, d.bodyY + 0.02, -L / 2 - 0.02), { color: '#f4d35e' });
}

// ─────────────────────────────────────────────────────────── models ──

const TRIM = '#1b1e22';
const WELL = '#121315';

/** Lofted body shell (paint, glass, trim, wheel wells, cladding) + mirrors, door seams and handles. Returns the roof top. */
function loftBody(b: Builder, s: CarShape, doors4: boolean): { topY: number; topZ: number; topW: number; topD: number } {
  const p = loftCar(s, LOD);
  if (p.body) b.add(p.body, { color: '#ffffff', paint: true, rough: 0.85 });
  if (p.glass) b.add(p.glass, { color: GLASS, rough: 0.22 });
  if (p.trim) b.add(p.trim, { color: TRIM, rough: 0.9 });
  if (p.well) b.add(p.well, { color: WELL, rough: 1.6 });
  if (p.clad) b.add(p.clad, { color: '#3b3e43', rough: 1.3 });
  const hw = s.W / 2;
  for (const sd of [1, -1]) {
    // mirror on a short arm at the base of the A pillar (dropped at the far level)
    const mz = s.wsBase - 0.13;
    b.add(rbox(0.1, 0.085, 0.14, 0.035, sd * (hw + 0.045), s.belt + 0.015, mz), { color: '#ffffff', paint: true, rough: 0.85 });
    b.add(bx(0.06, 0.03, 0.05, sd * (hw - 0.01), s.belt + 0.03, mz + 0.02), { color: TRIM });
    // door seams + handles (fine detail: close level only)
    if (LOD === 0) {
      const ra = s.wheelR + 0.075;
      const cuts = [s.axF - ra - 0.05, s.pillarB];
      if (doors4) cuts.push(Math.max(s.axR + ra + 0.04, s.glassRear - 0.02));
      for (const z of cuts) {
        const y0 = s.sill + 0.13,
          y1 = s.belt - 0.012;
        b.add(decalPlane(0.008, y1 - y0, sd * (hw + 0.0075), (y0 + y1) / 2, z, sd > 0 ? 'px' : 'nx'), { color: TRIM, rough: 1.2 });
      }
      const handles = doors4 ? [s.pillarB + 0.14, cuts[2] + 0.14] : [s.pillarB + 0.16];
      for (const z of handles) b.add(bx(0.016, 0.024, 0.12, sd * (hw + 0.004), s.belt - 0.085, z), { color: '#ffffff', paint: true, rough: 0.5 });
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
    { L, W, sill: 0.27, belt: 0.86, roof: 1.47, noseH: 0.75, hoodH: 0.86, wsBase: 0.82, wsTop: 0.08, rwTop: -1.32, rwBase: -1.6, deckH: 0.96, tailH: 0.9, pillarB: -0.42, glassRear: -1.28, tumble: 0.14, axF: 1.155, axR: -1.145, wheelR: 0.29 },
    false,
  );
  carDetails(b, { L, W, wheelR: 0.29, wheelW: 0.22, axF: 1.155, axR: -1.145, wheelX: W / 2 - 0.08, bodyY: 0.3, bodyH: 0.62, bodyR: 0.26, lightY: 0.62, roundLights: true });
  return b.build();
}

function hatch(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 4.0,
    W = 1.74;
  const c = loftBody(
    b,
    { L, W, sill: 0.3, belt: 0.9, roof: 1.46, noseH: 0.76, hoodH: 0.9, wsBase: 0.85, wsTop: -0.05, rwTop: -1.5, rwBase: -1.86, deckH: 1.0, tailH: 0.95, pillarB: -0.5, pillarC: -1.2, glassRear: -1.45, tumble: 0.13, axF: 1.22, axR: -1.33, wheelR: 0.31 },
    true,
  );
  // small roof spoiler
  b.add(rbox(c.topW - 0.1, 0.05, 0.22, 0.02, 0, c.topY - 0.03, -1.5 + 0.06), { color: '#ffffff', paint: true });
  carDetails(b, { L, W, wheelR: 0.31, wheelW: 0.23, axF: 1.22, axR: -1.33, wheelX: W / 2 - 0.09, bodyY: 0.31, bodyH: 0.6, bodyR: 0.2, lightY: 0.68 });
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
  );
  carDetails(b, { L, W, wheelR: 0.32, wheelW: 0.24, axF: 1.375, axR: -1.325, wheelX: W / 2 - 0.1, bodyY: 0.33, bodyH: 0.58, bodyR: 0.18, lightY: 0.69 });
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

function delivery(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 6.1,
    W = 2.1;
  const zCab = L / 2 - 0.9;
  // chassis
  b.add(bx(1.5, 0.28, L - 0.5, 0, 0.42, -0.1), { color: '#2e3135', rough: 1.4 });
  // cab
  b.add(rbox(2.04, 0.92, 1.8, 0.18, 0, 0.42, zCab, 2), { color: '#ffffff', paint: true, rough: 0.85 });
  const cg = rbox(1.98, 0.78, 1.5, 0.12, 0, 1.3, zCab - 0.1, 1);
  taper(cg, 1.3, 2.08, zCab - 0.1, 0.04, 0.42, 0);
  b.add(cg, { color: GLASS, rough: 0.22 });
  b.add(rbox(1.94, 0.1, 1.12, 0.04, 0, 2.03, zCab - 0.27), { color: '#ffffff', paint: true, rough: 0.85 });
  // cargo box
  const boxD = 4.25,
    boxZ = -L / 2 + boxD / 2 + 0.02;
  b.add(rbox(2.14, 2.22, boxD, 0.08, 0, 0.6, boxZ, 1), { color: '#f3f1ec', rough: 0.9 });
  b.add(decalPlane(3.7, 1.4, W / 2 + 0.035, 1.72, boxZ, 'px'), { color: '#ffffff', decal: R_DELIVERY, decalRows: true });
  b.add(decalPlane(3.7, 1.4, -W / 2 - 0.035, 1.72, boxZ, 'nx'), { color: '#ffffff', decal: R_DELIVERY, decalRows: true });
  // rear door seam + handles + roof marker lights
  b.add(bx(0.03, 2.0, 0.02, 0, 0.7, -L / 2 + 0.01), { color: '#9aa0a6' });
  for (const s of [1, -1]) b.add(bx(0.05, 0.24, 0.04, s * 0.12, 1.4, -L / 2 + 0.01), { color: '#6f757b' });
  // bumpers, lights
  b.add(rbox(W, 0.2, 0.22, 0.07, 0, 0.36, L / 2 - 0.07), { color: DARK, rough: 1.2 });
  b.add(rbox(W, 0.2, 0.22, 0.07, 0, 0.36, -L / 2 + 0.06), { color: DARK, rough: 1.2 });
  b.add(rbox(W * 0.5, 0.2, 0.05, 0.03, 0, 0.62, L / 2 + 0.005), { color: '#25282c' });
  for (const s of [1, -1]) {
    b.add(rbox(0.32, 0.16, 0.07, 0.04, s * 0.72, 0.64, L / 2 - 0.01), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    b.add(bx(0.1, 0.09, 0.06, s * 0.98, 0.64, L / 2 - 0.04), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(bx(0.2, 0.3, 0.05, s * 0.9, 0.62, -L / 2 - 0.01), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    b.add(bx(0.2, 0.1, 0.05, s * 0.9, 0.94, -L / 2 - 0.01), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(rbox(0.1, 0.22, 0.16, 0.03, s * 1.1, 1.38, zCab + 0.5), { color: DARK });
  }
  const axF = L / 2 - 1.0,
    axR = axF - 3.6;
  for (const s of [1, -1]) {
    wheel(b, s * 0.93, 0.42, axF, 0.42, 0.3, true);
    wheel(b, s * 0.93, 0.42, axR, 0.42, 0.34, false);
  }
  return b.build();
}

function lorry(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 7.6,
    W = 2.35;
  const zCab = L / 2 - 0.95;
  b.add(bx(1.4, 0.32, L - 0.4, 0, 0.5, -0.1), { color: '#2b2e33', rough: 1.4 });
  // cab-over
  b.add(rbox(2.3, 2.02, 1.88, 0.2, 0, 0.6, zCab, 2), { color: '#ffffff', paint: true, rough: 0.85 });
  b.add(rbox(2.02, 0.78, 0.08, 0.03, 0, 1.6, L / 2 - 0.02), { color: GLASS, rough: 0.22 });
  for (const s of [1, -1]) b.add(bx(0.04, 0.62, 0.86, s * 1.152, 1.68, zCab + 0.32), { color: GLASS, rough: 0.22 });
  b.add(bx(2.12, 0.07, 0.3, 0, 2.43, L / 2 - 0.08), { color: '#ffffff', paint: true });
  b.add(rbox(1.5, 0.5, 0.05, 0.03, 0, 0.82, L / 2 + 0.005), { color: '#3a3d42', rough: 1.2 });
  b.add(rbox(W + 0.02, 0.24, 0.24, 0.08, 0, 0.5, L / 2 - 0.08), { color: DARK, rough: 1.2 });
  for (const s of [1, -1]) {
    b.add(rbox(0.32, 0.18, 0.07, 0.04, s * 0.82, 0.72, L / 2 - 0.0), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    b.add(bx(0.1, 0.1, 0.06, s * 1.08, 0.72, L / 2 - 0.03), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(bx(0.24, 0.16, 0.05, s * 0.95, 0.8, -L / 2 - 0.01), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    b.add(bx(0.12, 0.16, 0.05, s * 0.72, 0.8, -L / 2 - 0.01), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(rbox(0.1, 0.26, 0.18, 0.03, s * 1.25, 1.62, zCab + 0.75), { color: DARK });
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
  // variant 1: tarp with lettering
  b.add(rbox(W - 0.02, 1.7, bedD - 0.2, 0.14, 0, 1.06, bedZ - 0.05, 2), { color: '#6d8768', part: 2, rough: 1.2 });
  b.add(decalPlane(4.6, 1.15, W / 2 + 0.002, 1.9, bedZ - 0.1, 'px'), { color: '#ffffff', decal: R_TARP, part: 2 });
  b.add(decalPlane(4.6, 1.15, -W / 2 - 0.002, 1.9, bedZ - 0.1, 'nx'), { color: '#ffffff', decal: R_TARP, part: 2 });
  // wheels: steered front axle + tandem rear
  const axF = L / 2 - 1.3;
  for (const s of [1, -1]) {
    wheel(b, s * 1.0, 0.48, axF, 0.48, 0.34, true);
    wheel(b, s * 1.0, 0.48, axF - 4.4, 0.48, 0.38, false);
    wheel(b, s * 1.0, 0.48, axF - 5.5, 0.48, 0.38, false);
    b.add(bx(0.42, 0.06, 2.2, s * 1.0, 1.0, axF - 4.95), { color: '#2b2e33' });
  }
  return b.build();
}

function bus(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 11.0,
    W = 2.5;
  const CREAM = '#f4f0e6';
  b.add(rbox(W, 2.7, L, 0.24, 0, 0.35, 0, 2), { color: CREAM, rough: 0.85 });
  // route-coloured skirt + window-top stripes
  b.add(rbox(W + 0.03, 0.62, L - 0.04, 0.2, 0, 0.33, 0, 1), { color: '#ffffff', paint: true, rough: 0.8 });
  for (const s of [1, -1]) b.add(bx(0.02, 0.12, L - 0.9, s * (W / 2 + 0.012), 2.42, -0.1), { color: '#ffffff', paint: true });
  // window bands (lit inside at night)
  for (const s of [1, -1]) {
    b.add(bx(0.02, 0.98, 9.25, s * (W / 2 + 0.006), 1.36, -0.45), { color: GLASS, light: LIGHT_CABIN, rough: 0.22 });
    for (let k = 0; k < 8; k++) b.add(bx(0.03, 0.98, 0.13, s * (W / 2 + 0.014), 1.36, -4.95 + k * 1.28), { color: CREAM });
  }
  // doors on the kerb (right, -X) side
  for (const z of [4.35, 0.25]) {
    b.add(bx(0.03, 2.08, 1.12, -W / 2 - 0.016, 0.36, z), { color: '#1e2a33', light: LIGHT_CABIN, rough: 0.25 });
    b.add(bx(0.035, 2.08, 0.05, -W / 2 - 0.02, 0.36, z), { color: '#9aa0a6' });
  }
  // windscreen, rear window, destination signs
  b.add(rbox(2.32, 1.42, 0.05, 0.05, 0, 1.12, L / 2 + 0.0), { color: GLASS, light: LIGHT_CABIN, rough: 0.2 });
  b.add(bx(2.02, 0.36, 0.03, 0, 2.59, L / 2 + 0.015), { color: '#16181b' });
  b.add(decalPlane(1.93, 0.28, 0, 2.77, L / 2 + 0.033, 'pz'), { color: '#ffffff', decal: R_BUS_SIGN, decalRows: true, light: LIGHT_SIGN });
  b.add(rbox(1.9, 0.72, 0.05, 0.04, 0, 1.95, -L / 2 - 0.0), { color: GLASS, light: LIGHT_CABIN, rough: 0.2 });
  b.add(decalPlane(0.9, 0.22, 0, 2.86, -L / 2 - 0.03, 'nz'), { color: '#ffffff', decal: R_BUS_SIGN, decalRows: true, light: LIGHT_SIGN });
  b.add(bx(1.5, 0.5, 0.03, 0, 0.62, -L / 2 - 0.02), { color: '#3a3d42' });
  // side lettering under the windows
  b.add(decalPlane(3.0, 0.32, W / 2 + 0.018, 1.13, -1.6, 'px'), { color: '#ffffff', decal: R_BUS_SIDE });
  b.add(decalPlane(3.0, 0.32, -W / 2 - 0.018, 1.13, -1.9, 'nx'), { color: '#ffffff', decal: R_BUS_SIDE });
  // roof AC unit
  b.add(rbox(1.7, 0.3, 2.7, 0.09, 0, 3.0, -1.7), { color: '#d4d7da', rough: 0.9 });
  // front details
  b.add(rbox(W + 0.03, 0.26, 0.24, 0.09, 0, 0.32, L / 2 - 0.08), { color: DARK, rough: 1.2 });
  b.add(rbox(W + 0.03, 0.26, 0.24, 0.09, 0, 0.32, -L / 2 + 0.08), { color: DARK, rough: 1.2 });
  for (const s of [1, -1]) {
    b.add(rbox(0.36, 0.17, 0.07, 0.05, s * 0.85, 0.72, L / 2 + 0.005), { color: HEAD, light: LIGHT_HEAD, rough: 0.4 });
    b.add(bx(0.11, 0.11, 0.06, s * 1.17, 0.74, L / 2 - 0.02), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(bx(0.16, 0.42, 0.05, s * 1.1, 0.8, -L / 2 - 0.02), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    b.add(bx(0.16, 0.12, 0.05, s * 1.1, 1.26, -L / 2 - 0.02), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    // mirror stalks
    b.add(bx(0.08, 0.05, 0.42, s * 1.32, 2.35, L / 2 - 0.05), { color: DARK });
    b.add(rbox(0.08, 0.34, 0.18, 0.03, s * 1.42, 2.02, L / 2 + 0.12), { color: DARK });
  }
  const axF = L / 2 - 2.6,
    axR = axF - 6.0;
  for (const s of [1, -1]) {
    wheel(b, s * 1.07, 0.48, axF, 0.48, 0.32, true, '#d9dcdf');
    wheel(b, s * 1.07, 0.48, axR, 0.48, 0.36, false, '#d9dcdf');
  }
  return b.build();
}

function icecream(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 5.0,
    W = 2.0;
  b.add(rbox(W, 1.92, L, 0.4, 0, 0.38, 0, 2), { color: '#ffffff', paint: true, rough: 0.8 });
  b.add(rbox(W + 0.03, 0.34, L - 0.06, 0.15, 0, 0.36, 0), { color: '#f7f4ee', rough: 0.9 });
  // windscreen + cab side windows
  b.add(rbox(1.78, 0.62, 0.08, 0.05, 0, 1.38, L / 2 - 0.02), { color: GLASS, rough: 0.2 });
  for (const s of [1, -1]) b.add(bx(0.03, 0.56, 0.86, s * (W / 2 + 0.003), 1.42, L / 2 - 0.72), { color: GLASS, rough: 0.2 });
  // serving hatch (kerb side) with striped awning
  b.add(bx(0.03, 0.74, 1.95, -W / 2 - 0.005, 1.18, -0.55), { color: '#3a2a22', light: LIGHT_CABIN, rough: 0.3 });
  for (let i = 0; i < 6; i++) b.add(bx(0.62, 0.05, 0.36, -W / 2 - 0.27, 1.98 - 0.0, -1.45 + i * 0.36), { color: i % 2 === 0 ? '#e9547e' : '#ffffff' });
  b.add(decalPlane(2.1, 0.42, -W / 2 - 0.012, 0.86, -0.55, 'nx'), { color: '#ffffff', decal: R_ICECREAM });
  b.add(decalPlane(3.2, 1.0, W / 2 + 0.012, 1.42, -0.5, 'px'), { color: '#ffffff', decal: R_ICECREAM });
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
    b.add(bx(0.1, 0.09, 0.06, s * 0.92, 0.62, L / 2 - 0.04), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
    b.add(rbox(0.2, 0.26, 0.06, 0.06, s * 0.75, 0.7, -L / 2 + 0.0), { color: TAIL, light: LIGHT_TAIL, rough: 0.5 });
    b.add(bx(0.1, 0.09, 0.06, s * 0.92, 1.02, -L / 2 + 0.02), { color: AMBER, light: s > 0 ? LIGHT_BLINK_L : LIGHT_BLINK_R });
  }
  const axF = L / 2 - 0.9,
    axR = axF - 3.0;
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
