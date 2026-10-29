// Procedural signage atlas: every sign in the city is drawn once into one canvas
// (colour) plus a matching half-resolution "glow" canvas (what lights up at night).
// Signs are then plain quads in the `signs` builder with UVs into the atlas.

import * as THREE from 'three';

export interface SignRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** width / height of the cell in pixels (for keeping text proportions) */
  aspect: number;
}

type Draw = (g: CanvasRenderingContext2D, w: number, h: number, glow: boolean) => void;

const SIZE_W = 2048;
const SIZE_H = 1024;
const PAD = 4;

interface Shelf {
  y: number;
  h: number;
  x: number;
}

export class SignAtlas {
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private gcv: HTMLCanvasElement;
  private gg: CanvasRenderingContext2D;
  private shelves: Shelf[] = [];
  private nextY = 0;
  private cache = new Map<string, SignRect>();
  full = false;
  used = 0;

  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.width = SIZE_W;
    this.cv.height = SIZE_H;
    this.g = this.cv.getContext('2d')!;
    this.gcv = document.createElement('canvas');
    this.gcv.width = SIZE_W / 2;
    this.gcv.height = SIZE_H / 2;
    this.gg = this.gcv.getContext('2d')!;
    this.gg.fillStyle = '#000';
    this.gg.fillRect(0, 0, SIZE_W / 2, SIZE_H / 2);
    this.gg.scale(0.5, 0.5);
  }

  /** Allocate + draw a cell (cached by key). Best-fit shelf packing. */
  add(key: string, w: number, h: number, draw: Draw): SignRect {
    const hit = this.cache.get(key);
    if (hit) return hit;
    w = Math.min(w, SIZE_W - 2 * PAD);
    // best shelf: smallest height that fits, with room left
    let best: Shelf | null = null;
    for (const sh of this.shelves) {
      if (sh.h >= h && sh.h <= h * 1.35 + 8 && sh.x + w + PAD <= SIZE_W && (!best || sh.h < best.h)) best = sh;
    }
    if (!best) {
      if (this.nextY + h + PAD > SIZE_H) {
        this.full = true;
        const first = this.cache.values().next().value as SignRect | undefined;
        return first ?? { u0: 0, v0: 0, u1: 0.01, v1: 0.01, aspect: 1 };
      }
      best = { y: this.nextY, h, x: 0 };
      this.shelves.push(best);
      this.nextY += h + PAD;
    }
    const x = best.x + PAD,
      y = best.y + PAD;
    best.x += w + PAD;
    this.used += w * h;
    for (const [ctx, glow] of [
      [this.g, false],
      [this.gg, true],
    ] as [CanvasRenderingContext2D, boolean][]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.translate(x, y);
      draw(ctx, w, h, glow);
      ctx.restore();
    }
    // inset UVs by half a texel so mip filtering doesn't bleed neighbours
    const r: SignRect = {
      u0: (x + 0.5) / SIZE_W,
      u1: (x + w - 0.5) / SIZE_W,
      v1: 1 - (y + 0.5) / SIZE_H,
      v0: 1 - (y + h - 0.5) / SIZE_H,
      aspect: w / h,
    };
    this.cache.set(key, r);
    return r;
  }

  textures(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
    const map = new THREE.CanvasTexture(this.cv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.generateMipmaps = true;
    const glow = new THREE.CanvasTexture(this.gcv);
    glow.colorSpace = THREE.SRGBColorSpace;
    glow.generateMipmaps = true;
    return { map, glow };
  }
}

// ───────────────────────────────────────────────────── sign painters ──

export interface BoardStyle {
  bg: string;
  fg: string;
  font?: string;
  border?: string;
  /** glow brightness of the lettering at night 0..1 */
  glow?: number;
  /** text glow colour (defaults to fg) */
  glowColor?: string;
  italic?: boolean;
  weight?: string;
  /** letter spacing hint (adds spaces) */
  spaced?: boolean;
}

function fitFont(g: CanvasRenderingContext2D, text: string, family: string, weight: string, italic: boolean, maxW: number, maxH: number): number {
  let size = Math.floor(maxH);
  for (; size > 8; size -= 2) {
    g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
    if (g.measureText(text).width <= maxW) break;
  }
  return size;
}

/** A painted board with centred lettering (shop fascias, nameplates). */
export function boardSign(text: string, s: BoardStyle): Draw {
  return (g, w, h, glow) => {
    const family = s.font ?? 'Georgia, "Times New Roman", serif';
    const weight = s.weight ?? 'bold';
    if (!glow) {
      g.fillStyle = s.bg;
      g.fillRect(0, 0, w, h);
      // subtle painted gradient
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      if (s.border) {
        g.strokeStyle = s.border;
        g.lineWidth = Math.max(2, h * 0.06);
        g.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
      }
    } else {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
    }
    const t = s.spaced ? text.split('').join(' ') : text;
    const size = fitFont(g, t, family, weight, !!s.italic, w * 0.86, h * 0.62);
    g.font = `${s.italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (!glow) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillText(t, w / 2 + size * 0.05, h / 2 + size * 0.07);
      g.fillStyle = s.fg;
      g.fillText(t, w / 2, h / 2 + size * 0.02);
    } else {
      const a = s.glow ?? 0.5;
      g.globalAlpha = a;
      g.fillStyle = s.glowColor ?? s.fg;
      g.fillText(t, w / 2, h / 2 + size * 0.02);
      g.globalAlpha = 1;
    }
  };
}

/** Free-standing letters (transparent background) — rooftop & neon signs. */
export function letterSign(text: string, color: string, glowColor: string, font = '"Arial Black", "Segoe UI Black", Impact, sans-serif', glowAmt = 1, outline?: string): Draw {
  return (g, w, h, glow) => {
    if (glow) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
    }
    const size = fitFont(g, text, font, '900', false, w * 0.96, h * 0.86);
    g.font = `900 ${size}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (!glow) {
      if (outline) {
        g.lineWidth = Math.max(3, size * 0.12);
        g.strokeStyle = outline;
        g.lineJoin = 'round';
        g.strokeText(text, w / 2, h / 2 + size * 0.04);
      }
      g.fillStyle = color;
      g.fillText(text, w / 2, h / 2 + size * 0.04);
    } else {
      g.globalAlpha = glowAmt;
      g.fillStyle = glowColor;
      g.fillText(text, w / 2, h / 2 + size * 0.04);
      g.globalAlpha = 1;
    }
  };
}

/** Round / oval hanging blade sign with an initial or short word. */
export function bladeSign(text: string, bg: string, fg: string, rim: string): Draw {
  return (g, w, h, glow) => {
    g.fillStyle = glow ? '#000' : 'rgba(0,0,0,0)';
    g.fillRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.46;
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    if (!glow) {
      g.fillStyle = bg;
      g.fill();
      g.lineWidth = r * 0.14;
      g.strokeStyle = rim;
      g.stroke();
    }
    const size = fitFont(g, text, 'Georgia, serif', 'bold', true, r * 1.5, r * 1.25);
    g.font = `italic bold ${size}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = glow ? 0.35 : 1;
    g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2 + size * 0.05);
    g.globalAlpha = 1;
  };
}

/** Clock face (harbour master, school). */
export function clockFace(): Draw {
  return (g, w, h, glow) => {
    const r = Math.min(w, h) * 0.47;
    g.fillStyle = glow ? '#000' : 'rgba(0,0,0,0)';
    g.fillRect(0, 0, w, h);
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.fillStyle = glow ? 'rgba(255,236,190,0.55)' : '#f6f1e2';
    g.fill();
    if (glow) return;
    g.lineWidth = r * 0.1;
    g.strokeStyle = '#2b2f33';
    g.stroke();
    g.fillStyle = '#2b2f33';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rr = i % 3 === 0 ? r * 0.1 : r * 0.05;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * r * 0.78, h / 2 + Math.sin(a) * r * 0.78, rr * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.lineCap = 'round';
    g.lineWidth = r * 0.09;
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 + r * 0.42, h / 2 - r * 0.2);
    g.stroke();
    g.lineWidth = r * 0.06;
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 - r * 0.1, h / 2 - r * 0.66);
    g.stroke();
  };
}

/** Helipad marking (H in a circle) — drawn as a sign so it can glow faintly at night. */
export function helipadMark(): Draw {
  return (g, w, h, glow) => {
    if (glow) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
    } else {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#4a5056';
      g.beginPath();
      g.arc(w / 2, h / 2, Math.min(w, h) * 0.495, 0, Math.PI * 2);
      g.fill();
    }
    const r = Math.min(w, h) * 0.44;
    g.lineWidth = r * 0.09;
    g.strokeStyle = glow ? 'rgba(120,255,160,0.35)' : '#f2c94c';
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.stroke();
    if (glow) return;
    g.fillStyle = '#f4f4f0';
    const s = r * 0.95;
    g.fillRect(w / 2 - s * 0.45, h / 2 - s * 0.55, s * 0.2, s * 1.1);
    g.fillRect(w / 2 + s * 0.25, h / 2 - s * 0.55, s * 0.2, s * 1.1);
    g.fillRect(w / 2 - s * 0.3, h / 2 - s * 0.1, s * 0.6, s * 0.2);
  };
}

/**
 * School noticeboard contents: a cork back with pinned sheets (typed notices, a coloured poster, a child's
 * drawing, a timetable grid), each with a drop shadow and a coloured pin; seeded per board.
 */
export function noticeBoard(seed: number): Draw {
  return (g, w, h, glow) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    if (glow) return;
    let s = seed * 9301 + 49297;
    const r = (): number => ((s = (s * 9301 + 49297) % 233280) / 233280);
    // cork with speckle
    g.fillStyle = '#a77c4f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(70,40,15,0.25)' : 'rgba(230,190,140,0.22)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    const sheets: [number, number, number, number][] = [];
    const cols = 4;
    for (let c = 0; c < cols; c++) {
      let y = h * (0.05 + r() * 0.06);
      while (y < h * 0.8) {
        const sw = (w / cols) * (0.68 + r() * 0.22),
          sh = sw * (r() < 0.7 ? 1.41 : 0.72);
        if (y + sh > h * 0.96) break;
        sheets.push([(w / cols) * c + (w / cols - sw) / 2 + (r() - 0.5) * 6, y, sw, sh]);
        y += sh + h * (0.03 + r() * 0.05);
      }
    }
    const paper = ['#f4f1e8', '#f6f3ea', '#fbf0a8', '#f7c9d6', '#cfe6f7', '#d9efc7', '#f4f1e8'];
    for (const [x, y, sw, sh] of sheets) {
      const kind = Math.floor(r() * 5);
      g.save();
      g.translate(x + sw / 2, y + sh / 2);
      g.rotate((r() - 0.5) * 0.08);
      g.fillStyle = 'rgba(30,15,5,0.35)';
      g.fillRect(-sw / 2 + 2, -sh / 2 + 3, sw, sh);
      g.fillStyle = kind === 1 ? ['#e2483a', '#2f6fd0', '#3c9a52', '#f2b233'][Math.floor(r() * 4)] : paper[Math.floor(r() * paper.length)];
      g.fillRect(-sw / 2, -sh / 2, sw, sh);
      if (kind === 1) {
        // poster: big heading + a picture block
        g.fillStyle = '#ffffff';
        g.fillRect(-sw * 0.4, -sh * 0.4, sw * 0.8, sh * 0.16);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.beginPath();
        g.arc(0, sh * 0.08, sw * 0.24, 0, Math.PI * 2);
        g.fill();
        g.fillRect(-sw * 0.35, sh * 0.36, sw * 0.7, sh * 0.04);
      } else if (kind === 2) {
        // child's drawing: sun, house, green ground
        g.fillStyle = '#4bb04a';
        g.fillRect(-sw / 2, sh * 0.25, sw, sh * 0.25);
        g.fillStyle = '#f2c230';
        g.beginPath();
        g.arc(sw * 0.25, -sh * 0.3, sw * 0.12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#d2463a';
        g.fillRect(-sw * 0.3, -sh * 0.05, sw * 0.32, sh * 0.3);
        g.beginPath();
        g.moveTo(-sw * 0.36, -sh * 0.05);
        g.lineTo(-sw * 0.14, -sh * 0.22);
        g.lineTo(sw * 0.08, -sh * 0.05);
        g.fill();
      } else if (kind === 3) {
        // timetable grid
        g.strokeStyle = 'rgba(40,40,60,0.7)';
        g.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
          g.beginPath();
          g.moveTo(-sw * 0.42 + (sw * 0.84 * i) / 5, -sh * 0.32);
          g.lineTo(-sw * 0.42 + (sw * 0.84 * i) / 5, sh * 0.4);
          g.stroke();
        }
        for (let j = 0; j <= 7; j++) {
          g.beginPath();
          g.moveTo(-sw * 0.42, -sh * 0.32 + (sh * 0.72 * j) / 7);
          g.lineTo(sw * 0.42, -sh * 0.32 + (sh * 0.72 * j) / 7);
          g.stroke();
        }
        g.fillStyle = '#26314a';
        g.fillRect(-sw * 0.42, -sh * 0.44, sw * 0.6, sh * 0.06);
      } else {
        // typed notice: heading + text lines
        g.fillStyle = '#1e2433';
        g.fillRect(-sw * 0.38, -sh * 0.4, sw * (0.4 + r() * 0.36), sh * 0.06);
        g.fillStyle = 'rgba(40,44,58,0.6)';
        for (let ly = -sh * 0.26; ly < sh * 0.38; ly += sh * 0.055) g.fillRect(-sw * 0.38, ly, sw * (0.5 + r() * 0.26), Math.max(1, sh * 0.018));
      }
      g.fillStyle = ['#d83030', '#2a62c8', '#f0c020', '#2a9a4a'][Math.floor(r() * 4)];
      g.beginPath();
      g.arc(0, -sh / 2 + 4, 2.6, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  };
}
