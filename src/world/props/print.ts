// Printed matter for props (F4): magazine covers and kiosk sign lettering drawn once with real fonts into one
// canvas atlas and placed as textured quads (one small extra mesh), instead of 3×5 pixel-block letters.
// Cells are cached by key, so a title used on several stands is drawn once. ?noprint = the old pixel text.

import * as THREE from 'three';
import { GeoSink, type Shaper } from '../vegetation/geo';
import { globalUniforms } from '../../core/uniforms';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const W = 1024,
  H = 1024,
  PAD = 2;

export class Printer {
  readonly sink = new GeoSink([
    { name: 'uv', size: 2 },
    { name: 'aGlow', size: 1 },
  ]);
  private cv = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private cache = new Map<string, [number, number, number, number]>();
  private x = 0;
  private y = 0;
  private rowH = 0;
  private _v = new THREE.Vector3();
  private _o = new THREE.Vector3();
  private _n = new THREE.Vector3();
  constructor() {
    this.cv.width = W;
    this.cv.height = H;
    this.g = this.cv.getContext('2d')!;
    this.g.fillStyle = '#808080';
    this.g.fillRect(0, 0, W, H);
  }

  private cell(key: string, w: number, h: number, draw: Draw): [number, number, number, number] | null {
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.x + w + PAD > W) {
      this.x = 0;
      this.y += this.rowH + PAD;
      this.rowH = 0;
    }
    if (this.y + h > H) return null;
    const g = this.g;
    g.save();
    g.translate(this.x, this.y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    draw(g, w, h);
    g.restore();
    const r: [number, number, number, number] = [(this.x + 0.5) / W, 1 - (this.y + h - 0.5) / H, (this.x + w - 0.5) / W, 1 - (this.y + 0.5) / H];
    this.cache.set(key, r);
    this.x += w + PAD;
    this.rowH = Math.max(this.rowH, h);
    return r;
  }

  /** a printed quad (w × h, local plane z facing +Z, centred at cx, cy) in the Shaper's frame; false when the
   *  atlas is full (the caller falls back to its own geometry). glow: night emission (lit signs). */
  quad(sh: Shaper, key: string, cx: number, cy: number, z: number, w: number, h: number, pxW: number, pxH: number, draw: Draw, glow = 0): boolean {
    const r = this.cell(key, pxW, pxH, draw);
    if (!r) return false;
    const s = this.sink;
    s.color('#ffffff');
    s.setEx(1, glow);
    const o = sh.world(0, 0, z, this._o),
      n = sh.world(0, 0, z + 1, this._n).sub(o).normalize();
    const corner = (u: number, v: number, x: number, y: number) => {
      s.setEx(0, u, v);
      const p = sh.world(x, y, z, this._v);
      return s.vert(p.x, p.y, p.z, n.x, n.y, n.z);
    };
    const a = corner(r[0], r[1], cx - w / 2, cy - h / 2);
    const b = corner(r[2], r[1], cx + w / 2, cy - h / 2);
    const c = corner(r[2], r[3], cx + w / 2, cy + h / 2);
    const d = corner(r[0], r[3], cx - w / 2, cy + h / 2);
    s.quad(a, b, c, d);
    return true;
  }

  mesh(): THREE.Mesh | null {
    if (this.sink.vcount === 0) return null;
    const tex = new THREE.CanvasTexture(this.cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLights = globalUniforms.uLights;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uLights;');
    };
    const geo = this.sink.build();
    const m = new THREE.Mesh(geo, mat);
    m.name = 'props-print';
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  }
}

// ───────────────────────────────────────────────────────────── drawings ──

const HEAD = '"Arial Black", "Segoe UI Black", Impact, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Arial, Helvetica, sans-serif';

/** text squeezed to fit a width */
function fit(g: CanvasRenderingContext2D, t: string, x: number, y: number, maxW: number): void {
  const w = g.measureText(t).width;
  if (w <= maxW) g.fillText(t, x, y);
  else {
    g.save();
    g.translate(x, y);
    g.scale(maxW / w, 1);
    g.fillText(t, 0, 0);
    g.restore();
  }
}

function hash(s: string, k: number): number {
  let h = 2166136261 ^ k;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const LINES = ['EXCLUSIVE', 'SPECIAL ISSUE', 'TOP 50', 'NEW!', 'INSIDE:', 'HOW TO', 'BEST OF', 'FREE GIFT', 'SUMMER', 'THE BIG', 'WIN', '10 WAYS'];

/** a magazine cover: paper, cover photo (sky/backdrop, a portrait / car / dish), masthead, cover lines,
 *  price flash and barcode */
export function coverDraw(title: string, paper: string, ink: string, photo: string, kind: number): Draw {
  return (g, w, h) => {
    const r = (k: number) => hash(title + paper, k);
    g.fillStyle = paper;
    g.fillRect(0, 0, w, h);
    // photo
    const py = h * 0.2,
      ph = h * 0.8;
    const grd = g.createLinearGradient(0, py, 0, h);
    grd.addColorStop(0, photo);
    grd.addColorStop(1, '#2a2a30');
    g.fillStyle = grd;
    g.fillRect(0, py, w, ph);
    if (kind === 0) {
      // portrait: shoulders, neck, face, hair
      const cx = w * (0.45 + 0.15 * r(1));
      g.fillStyle = ['#2b2b2b', '#7a2f35', '#f1faee', '#2a9d8f', '#e9c46a'][Math.floor(r(2) * 5)];
      g.beginPath();
      g.ellipse(cx, h * 1.02, w * 0.42, h * 0.28, 0, Math.PI, 0);
      g.fill();
      const skin = ['#e9b99a', '#c98f6a', '#8d5a3b', '#f1cdb4'][Math.floor(r(3) * 4)];
      g.fillStyle = skin;
      g.fillRect(cx - w * 0.06, h * 0.62, w * 0.12, h * 0.14);
      g.beginPath();
      g.ellipse(cx, h * 0.52, w * 0.15, h * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ['#2a1d14', '#6b4a2b', '#d9b36a', '#111111', '#8a3b1d'][Math.floor(r(4) * 5)];
      g.beginPath();
      g.ellipse(cx, h * 0.45, w * 0.17, h * 0.1, 0, Math.PI, 0);
      g.fill();
      g.fillRect(cx - w * 0.17, h * 0.45, w * 0.06, h * 0.16 * r(5) + h * 0.04);
      g.fillStyle = '#c0605a';
      g.fillRect(cx - w * 0.04, h * 0.58, w * 0.08, h * 0.012);
    } else if (kind === 1) {
      // a car on a road
      g.fillStyle = '#4a4e52';
      g.fillRect(0, h * 0.78, w, h * 0.22);
      g.fillStyle = ['#d62f2f', '#f2f0e8', '#1d3557', '#f2c230'][Math.floor(r(6) * 4)];
      g.beginPath();
      g.roundRect(w * 0.1, h * 0.64, w * 0.8, h * 0.13, h * 0.03);
      g.fill();
      g.beginPath();
      g.roundRect(w * 0.28, h * 0.56, w * 0.4, h * 0.1, h * 0.03);
      g.fill();
      g.fillStyle = '#9fb7c9';
      g.fillRect(w * 0.32, h * 0.58, w * 0.32, h * 0.06);
      g.fillStyle = '#151515';
      for (const sx of [0.27, 0.73]) {
        g.beginPath();
        g.arc(w * sx, h * 0.78, w * 0.07, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // a dish on a table
      g.fillStyle = ['#8a5a3b', '#e9e2d4', '#3e6f5a'][Math.floor(r(7) * 3)];
      g.fillRect(0, h * 0.68, w, h * 0.32);
      g.fillStyle = '#f4f1ea';
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.72, w * 0.36, h * 0.09, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ['#d62f2f', '#4f9a3a', '#f39a1f', '#8d6cab'][Math.floor(r(8) * 4)];
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.69, w * 0.22, h * 0.07, 0, 0, Math.PI * 2);
      g.fill();
    }
    // masthead
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `${r(9) < 0.5 ? '900' : 'bold'} ${Math.round(h * 0.17)}px ${r(9) < 0.5 ? HEAD : SERIF}`;
    fit(g, title, w / 2, h * 0.19, w * 0.92);
    // cover lines with a shadow so they read on the photo
    g.textAlign = 'left';
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 2;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i === 0 ? (r(10) < 0.5 ? '#f2c230' : '#ffffff') : '#ffffff';
      g.font = `bold ${Math.round(h * (i === 0 ? 0.07 : 0.045))}px ${SANS}`;
      fit(g, LINES[Math.floor(r(11 + i) * LINES.length)], w * 0.06, h * (0.3 + i * 0.075), w * 0.5);
    }
    g.shadowBlur = 0;
    // price flash + barcode
    g.fillStyle = ['#f2c230', '#e63946', '#ffffff'][Math.floor(r(14) * 3)];
    g.beginPath();
    g.arc(w * 0.82, h * 0.32, w * 0.11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.font = `bold ${Math.round(h * 0.045)}px ${SANS}`;
    g.textAlign = 'center';
    g.fillText(`${(2 + Math.floor(r(15) * 6)).toString()}.${r(16) < 0.5 ? '50' : '95'}`, w * 0.82, h * 0.335);
    g.fillStyle = '#fff';
    g.fillRect(w * 0.06, h * 0.88, w * 0.2, h * 0.08);
    g.fillStyle = '#111';
    for (let i = 0; i < 14; i++) if (hash(title, 30 + i) < 0.6) g.fillRect(w * 0.07 + i * w * 0.0128, h * 0.89, w * 0.008, h * 0.06);
  };
}

/** a cover behind others: only its colour and the masthead band show */
export function coverBackDraw(title: string, paper: string, ink: string): Draw {
  return (g, w, h) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.font = `900 ${Math.round(h * 0.17)}px ${HEAD}`;
    fit(g, title, w / 2, h * 0.19, w * 0.92);
  };
}

/** kiosk fascia: cream panel, red title, strap line */
export function kioskSignDraw(title: string, strap: string): Draw {
  return (g, w, h) => {
    g.fillStyle = '#f2ead6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8322c';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `900 ${Math.round(h * 0.56)}px ${HEAD}`;
    fit(g, title, w / 2, h * 0.62, w * 0.9);
    g.fillStyle = '#2c2c2c';
    g.font = `bold ${Math.round(h * 0.17)}px ${SANS}`;
    fit(g, strap, w / 2, h * 0.88, w * 0.9);
  };
}

/** phone box sign band: black capitals on the opal panel */
export function phoneSignDraw(): Draw {
  return (g, w, h) => {
    g.fillStyle = '#f4f1e8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1c1c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * 0.62)}px Gill Sans, "Gill Sans MT", Calibri, ${SANS}`;
    fit(g, 'TELEPHONE', w / 2, h * 0.54, w * 0.9);
  };
}
