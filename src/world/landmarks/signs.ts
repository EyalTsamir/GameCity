// Lettering & signage for the landmarks: one canvas atlas (shelf-packed) drawn once at
// init, mapped onto quads of a single mesh. Bright letters glow at night (per-quad glow).

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import { Kit, V3 } from './kit';
import { M } from './builder';

export interface AtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export class SignAtlas {
  readonly W: number;
  readonly H: number;
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  /** shelves: y, height, used width */
  private shelves: { y: number; h: number; x: number }[] = [];
  private nextY = 0;
  private cache = new Map<string, AtlasRect>();
  private tex: THREE.CanvasTexture | null = null;
  /** number of requests that did not fit */
  overflow = 0;

  constructor(W = 1024, H = 1024) {
    this.W = W;
    this.H = H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.g.fillStyle = '#808080';
    this.g.fillRect(0, 0, W, H);
  }

  /** fraction of the atlas height in use */
  get fill(): number {
    return this.nextY / this.H;
  }

  /**
   * Reserve a w×h pixel region and draw into it (origin at the region's top-left). With a
   * `key`, identical signs share one region.
   */
  add(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, key?: string): AtlasRect {
    if (key) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }
    const pad = 2;
    // first fit: an existing shelf tall enough (but not wastefully tall) with room left
    let shelf = this.shelves.find((s) => s.h >= h && s.h <= h * 2 + 12 && s.x + w + pad <= this.W);
    if (!shelf) {
      if (this.nextY + h > this.H) {
        this.overflow++;
        return { u0: 0, v0: 1 - 1 / this.H, u1: 1 / this.W, v1: 1 };
      }
      shelf = { y: this.nextY, h, x: 0 };
      this.shelves.push(shelf);
      this.nextY += h + pad;
    }
    const px = shelf.x,
      py = shelf.y;
    this.g.save();
    this.g.translate(px, py);
    this.g.beginPath();
    this.g.rect(0, 0, w, h);
    this.g.clip();
    draw(this.g, w, h);
    this.g.restore();
    shelf.x += w + pad;
    const r = { u0: px / this.W, u1: (px + w) / this.W, v1: 1 - py / this.H, v0: 1 - (py + h) / this.H };
    if (key) this.cache.set(key, r);
    return r;
  }

  texture(): THREE.CanvasTexture {
    if (!this.tex) {
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.anisotropy = 4;
      this.tex.generateMipmaps = true;
      this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    }
    return this.tex;
  }
}

/** Fit text into a box: returns the font size that fits width w (letter-spaced). */
export function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, w: number, h: number, spacing = 0): number {
  let px = Math.floor(h);
  for (; px > 6; px--) {
    g.font = font(px);
    const m = g.measureText(text).width + spacing * px * (text.length - 1);
    if (m <= w) break;
  }
  return px;
}

/** Draw centred, optionally letter-spaced text. */
export function drawText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, font: string, color: string, spacingPx = 0): void {
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  if (!spacingPx) {
    g.textAlign = 'center';
    g.fillText(text, cx, cy);
    return;
  }
  g.textAlign = 'left';
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacingPx * (text.length - 1);
  let x = cx - total / 2;
  [...text].forEach((ch, i) => {
    g.fillText(ch, x, cy);
    x += widths[i] + spacingPx;
  });
}

/**
 * Sign quad: rectangle of w×h metres centred on (x, y+h/2, z) facing local +Z rotated by ry,
 * textured with atlas rect r. glow > 0 makes bright texels glow at night.
 */
export function signQuad(T: Kit, r: AtlasRect, w: number, h: number, x: number, y: number, z: number, ry = 0, glow = 0): void {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const hx = (w / 2) * c,
    hz = -(w / 2) * s;
  const p0: V3 = [x - hx, y, z - hz];
  const p1: V3 = [x + hx, y, z + hz];
  const p2: V3 = [x + hx, y + h, z + hz];
  const p3: V3 = [x - hx, y + h, z - hz];
  const m = M('#ffffff', 0, 0.7, 0, glow);
  T.poly(
    m,
    [p0, p1, p2, p3],
    [
      [r.u0, r.v0],
      [r.u1, r.v0],
      [r.u1, r.v1],
      [r.u0, r.v1],
    ],
  );
}

/** Sign quad wrapped on a vertical cylinder section (e.g. water-tower lettering). */
export function signCylinder(T: Kit, r: AtlasRect, radius: number, h: number, cx: number, y: number, cz: number, a0: number, a1: number, seg = 16, glow = 0): void {
  const m = M('#ffffff', 0, 0.7, 0, glow);
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg,
      t1 = (i + 1) / seg;
    const b0 = a0 + (a1 - a0) * t0,
      b1 = a0 + (a1 - a0) * t1;
    // angle measured from +Z towards +X; text runs left→right when seen from outside
    const P = (a: number, yy: number): V3 => [cx + Math.sin(a) * radius, yy, cz + Math.cos(a) * radius];
    const u0 = r.u0 + (r.u1 - r.u0) * t0,
      u1 = r.u0 + (r.u1 - r.u0) * t1;
    T.poly(
      m,
      [P(b0, y), P(b1, y), P(b1, y + h), P(b0, y + h)],
      [
        [u0, r.v0],
        [u1, r.v0],
        [u1, r.v1],
        [u0, r.v1],
      ],
    );
  }
}

export function signMaterial(g: GlobalUniforms, tex: THREE.Texture): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAtlas = { value: tex };
    sh.uniforms.uLights = g.uLights;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aPuv;\nattribute vec4 aMat;\nvarying vec2 vSUv;\nvarying float vSGlow;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvSUv = aPuv;\nvSGlow = aMat.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas;\nuniform float uLights;\nvarying vec2 vSUv;\nvarying float vSGlow;')
      .replace(
        '#include <map_fragment>',
        `vec4 sTex = texture2D(uAtlas, vSUv);
        diffuseColor.rgb *= sTex.rgb;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sL = dot(sTex.rgb, vec3(0.299, 0.587, 0.114));
        totalEmissiveRadiance += sTex.rgb * smoothstep(0.3, 0.7, sL) * vSGlow * uLights * 2.2;`,
      );
  };
  m.customProgramCacheKey = () => 'lm-signs-v2';
  return m;
}
