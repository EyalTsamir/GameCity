// What a cell of lettering is built into: letters and small flat parts (paper, frames, plates) in one mesh, one draw, in
// the order they are written (paper first, ink over it). A surface is a frame in the world: origin, right, up; x and y
// in metres on it, z out of it. Nothing here touches a canvas: a cell of 2000 letters builds in well under a millisecond.

import * as THREE from 'three';
import { FACE, type Face, type GlyphAtlas } from './font';
import { nearRadiusFor } from '../../core/nearDetail';

export type Align = 'left' | 'center' | 'right';

export interface TextOpts {
  face?: Face;
  /** css hex */
  color?: number;
  align?: Align;
  /** squeezed to this width (m) when longer */
  maxW?: number;
  /** -0.3 .. 0.5: thinner .. bolder */
  weight?: number;
  /** a slant, as a share of the height */
  slant?: number;
  /** extra space between letters, in em */
  track?: number;
  /** night glow 0..1 */
  glow?: number;
  /** height off the surface (m) */
  z?: number;
  /** shown only between these hours (from > to wraps midnight) */
  from?: number;
  to?: number;
  /** turn about the text's start, radians */
  rot?: number;
}

/** per vertex: 5 floats (position, uv) and 12 bytes (normal + pad, ink, params), two buffers since a buffer has one type */
const FLOATS = 5;
const BYTES = 12;

export class LetterSink {
  private f = new Float32Array(FLOATS * 4 * 4096);
  private b = new Uint8Array(BYTES * 4 * 4096);
  private idx = new Uint32Array(6 * 4096);
  private nv = 0;
  private ni = 0;

  // the frame
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private rx = 1;
  private ry = 0;
  private rz = 0;
  private ux = 0;
  private uy = 1;
  private uz = 0;
  private nx = 0;
  private ny = 0;
  private nz = 1;
  /** added to every part's z */
  private z0 = 0.004;
  private fade = 255;
  private glowBase = 0;
  private clipOn = false;
  private clipA = 0;
  private clipB = 0;

  constructor(readonly atlas: GlyphAtlas) {}

  reset(): void {
    this.nv = 0;
    this.ni = 0;
  }

  /** the surface everything is written on from here on; right and up need not be level */
  frame(ox: number, oy: number, oz: number, rx: number, ry: number, rz: number, ux: number, uy: number, uz: number, z0 = 0.004): this {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.rx = rx;
    this.ry = ry;
    this.rz = rz;
    this.ux = ux;
    this.uy = uy;
    this.uz = uz;
    this.nx = ry * uz - rz * uy;
    this.ny = rz * ux - rx * uz;
    this.nz = rx * uy - ry * ux;
    this.z0 = z0;
    return this;
  }

  /** an upright surface facing (nx, nz) with its origin at (x, y, z); right = up × normal */
  wall(x: number, y: number, z: number, nx: number, nz: number, z0 = 0.004): this {
    return this.frame(x, y, z, nz, 0, -nx, 0, 1, 0, z0);
  }

  /** everything from here on is gone beyond this radius (m, reference view): its smallest detail's own limit */
  fadeAt(radius: number): this {
    this.fade = Math.max(1, Math.min(255, Math.round(radius / FADE_UNIT)));
    return this;
  }

  /** from here on only what lies between x = a and b on the surface (a bill folded round a column's facets); no arguments: all */
  clip(a?: number, b?: number): this {
    this.clipOn = a !== undefined;
    this.clipA = a ?? 0;
    this.clipB = b ?? 0;
    return this;
  }

  /** everything from here on glows at night at least this much (a panel lit from behind); 0 ends it */
  glowAll(v: number): this {
    this.glowBase = v;
    return this;
  }

  private grow(): void {
    const f = new Float32Array(this.f.length * 2);
    f.set(this.f);
    this.f = f;
    const b = new Uint8Array(this.b.length * 2);
    b.set(this.b);
    this.b = b;
    const idx = new Uint32Array(this.idx.length * 2);
    idx.set(this.idx);
    this.idx = idx;
  }

  private vert(x: number, y: number, z: number, u: number, v: number, nx: number, ny: number, nz: number, col: number, weight: number, glow: number, from: number, to: number): void {
    const k = this.nv * BYTES;
    const fo = this.nv * FLOATS;
    const f = this.f,
      b = this.b;
    f[fo] = this.ox + this.rx * x + this.ux * y + this.nx * z;
    f[fo + 1] = this.oy + this.ry * x + this.uy * y + this.ny * z;
    f[fo + 2] = this.oz + this.rz * x + this.uz * y + this.nz * z;
    f[fo + 3] = u;
    f[fo + 4] = v;
    b[k + 0] = (nx * 127.5 + 127.5) | 0;
    b[k + 1] = (ny * 127.5 + 127.5) | 0;
    b[k + 2] = (nz * 127.5 + 127.5) | 0;
    b[k + 3] = 255;
    b[k + 4] = (col >> 16) & 255;
    b[k + 5] = (col >> 8) & 255;
    b[k + 6] = col & 255;
    b[k + 7] = (Math.max(glow, this.glowBase) * 255) | 0;
    b[k + 8] = ((weight + 0.5) * 255) | 0;
    b[k + 9] = this.fade;
    b[k + 10] = (from * 10) | 0;
    b[k + 11] = (to * 10) | 0;
    this.nv++;
  }

  private quadIdx(): void {
    const v = this.nv - 4;
    const i = this.idx;
    const n = this.ni;
    i[n] = v;
    i[n + 1] = v + 1;
    i[n + 2] = v + 2;
    i[n + 3] = v;
    i[n + 4] = v + 2;
    i[n + 5] = v + 3;
    this.ni += 6;
  }

  /** a flat part: paper, a plate, a shadow. u < 0 in the shader: solid */
  solid(x0: number, y0: number, x1: number, y1: number, color: number, z = 0, glow = 0, from = 0, to = 24, alpha = 1): this {
    if (this.clipOn) {
      x0 = Math.max(x0, this.clipA);
      x1 = Math.min(x1, this.clipB);
      if (x1 <= x0) return this;
    }
    if ((this.nv + 4) * FLOATS > this.f.length || this.ni + 6 > this.idx.length) this.grow();
    const zz = this.z0 + z,
      nx = this.nx,
      ny = this.ny,
      nz = this.nz;
    const w = alpha - 0.5;
    this.vert(x0, y0, zz, -1, 0, nx, ny, nz, color, w, glow, from, to);
    this.vert(x1, y0, zz, -1, 0, nx, ny, nz, color, w, glow, from, to);
    this.vert(x1, y1, zz, -1, 0, nx, ny, nz, color, w, glow, from, to);
    this.vert(x0, y1, zz, -1, 0, nx, ny, nz, color, w, glow, from, to);
    this.quadIdx();
    return this;
  }

  /** a part turned about its centre (a sheet not pasted quite straight) */
  sheet(cx: number, cy: number, w: number, h: number, rot: number, color: number, z = 0, alpha = 1): this {
    if ((this.nv + 4) * FLOATS > this.f.length || this.ni + 6 > this.idx.length) this.grow();
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const zz = this.z0 + z,
      nx = this.nx,
      ny = this.ny,
      nz = this.nz;
    for (const [a, b] of [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ]) {
      this.vert(cx + a * c - b * s, cy + a * s + b * c, zz, -1, 0, nx, ny, nz, color, alpha - 0.5, 0, 0, 24);
    }
    this.quadIdx();
    return this;
  }

  /** a box standing on the surface (x, y on it, from z to z + d): a frame's rail, a case, a plate with an edge */
  box(x0: number, y0: number, x1: number, y1: number, d: number, color: number, side = shade(color, 0.72), z = 0): this {
    const a = this.z0 + z,
      t = a + d;
    const sideQuad = (px0: number, py0: number, px1: number, py1: number, nx: number, ny: number, nz: number) => {
      if ((this.nv + 4) * FLOATS > this.f.length || this.ni + 6 > this.idx.length) this.grow();
      this.vert(px0, py0, a, -1, 0, nx, ny, nz, side, 0.5, 0, 0, 24);
      this.vert(px1, py1, a, -1, 0, nx, ny, nz, side, 0.5, 0, 0, 24);
      this.vert(px1, py1, t, -1, 0, nx, ny, nz, side, 0.5, 0, 0, 24);
      this.vert(px0, py0, t, -1, 0, nx, ny, nz, side, 0.5, 0, 0, 24);
      this.quadIdx();
    };
    const { rx, ry, rz, ux, uy, uz } = this;
    sideQuad(x0, y0, x1, y0, -ux, -uy, -uz); // bottom
    sideQuad(x1, y1, x0, y1, ux, uy, uz); // top
    sideQuad(x0, y1, x0, y0, -rx, -ry, -rz); // left
    sideQuad(x1, y0, x1, y1, rx, ry, rz); // right
    this.solid(x0, y0, x1, y1, color, z + d);
    return this;
  }

  /** width (m) of a string at this size */
  measure(text: string, size: number, face: Face = FACE.SANS, track = 0): number {
    return (this.atlas.width(text, face) + track * text.length) * size;
  }

  /** one line, its baseline at (x, y); returns the width drawn */
  text(str: string, x: number, y: number, size: number, o: TextOpts = {}): number {
    const atlas = this.atlas;
    const face = o.face ?? FACE.SANS;
    const track = o.track ?? 0;
    let w = (atlas.width(str, face) + track * str.length) * size;
    let sx = 1;
    if (o.maxW !== undefined && w > o.maxW && w > 0) {
      sx = o.maxW / w;
      w = o.maxW;
    }
    const col = o.color ?? 0x1a1a1e;
    const weight = o.weight ?? 0;
    const glow = o.glow ?? 0;
    const from = o.from ?? 0,
      to = o.to ?? 24;
    const zz = this.z0 + (o.z ?? 0);
    const slant = (o.slant ?? 0) * size;
    const q = atlas.quadEm * size;
    const base = atlas.baseEm * size;
    const cu = atlas.cellUv;
    const align = o.align ?? 'left';
    const cr = Math.cos(o.rot ?? 0),
      sr = Math.sin(o.rot ?? 0);
    let pen = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    const nx = this.nx,
      ny = this.ny,
      nz = this.nz;
    for (let i = 0; i < str.length; i++) {
      const k = atlas.glyph(face, str.charCodeAt(i));
      const adv = atlas.advance(k) * size * sx;
      const xc = x + pen + adv / 2;
      if (k >= 0 && str.charCodeAt(i) !== 32 && (!this.clipOn || (xc >= this.clipA && xc < this.clipB))) {
        if ((this.nv + 4) * FLOATS > this.f.length || this.ni + 6 > this.idx.length) this.grow();
        const u0 = atlas.u0(k),
          v0 = atlas.v0(k);
        const qx = pen + adv / 2,
          hw = (q * sx) / 2;
        // the quad's corners, from the pen on the baseline
        const corner = (a: number, b: number, u: number, v: number) => {
          const lx = qx + a * hw + (b > 0 ? slant : -slant * 0.3);
          const ly = b > 0 ? q - base : -base;
          this.vert(x + lx * cr - ly * sr, y + lx * sr + ly * cr, zz, u, v, nx, ny, nz, col, weight, glow, from, to);
        };
        // (the texture's rows run top down, flipY off)
        corner(-1, -1, u0, v0 + cu);
        corner(1, -1, u0 + cu, v0 + cu);
        corner(1, 1, u0 + cu, v0);
        corner(-1, 1, u0, v0);
        this.quadIdx();
      }
      pen += adv + track * size * sx;
    }
    return w;
  }

  /** the largest size up to `max` at which the string fits a width */
  fit(str: string, width: number, max: number, face: Face = FACE.SANS, track = 0): number {
    const em = this.atlas.width(str, face) + track * str.length;
    return em <= 0 ? max : Math.min(max, width / em);
  }

  /** running text in a column, top line's baseline at y; returns the y after the last line */
  para(str: string, x: number, y: number, width: number, size: number, o: TextOpts = {}, leading = 1.28, maxLines = 99): number {
    const face = o.face ?? FACE.SANS;
    const atlas = this.atlas;
    const sp = atlas.advance(atlas.glyph(face, 32));
    let line = '';
    let lw = 0;
    let lines = 0;
    const flush = () => {
      if (line && lines < maxLines) {
        this.text(line, o.align === 'center' ? x + width / 2 : o.align === 'right' ? x + width : x, y, size, o);
        y -= size * leading;
        lines++;
      }
    };
    for (const wd of str.split(' ')) {
      const ww = atlas.width(wd, face);
      if (line && (lw + sp + ww) * size > width) {
        flush();
        line = wd;
        lw = ww;
      } else {
        line = line ? line + ' ' + wd : wd;
        lw = line === wd ? ww : lw + sp + ww;
      }
    }
    flush();
    return y;
  }

  get vertices(): number {
    return this.nv;
  }

  finish(): THREE.BufferGeometry | null {
    if (this.ni === 0) return null;
    const geo = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(this.f.slice(0, this.nv * FLOATS), FLOATS);
    const u8 = new THREE.InterleavedBuffer(this.b.slice(0, this.nv * BYTES), BYTES);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 3));
    geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(u8, 3, 0, true));
    geo.setAttribute('aInk', new THREE.InterleavedBufferAttribute(u8, 4, 4, true));
    geo.setAttribute('aPar', new THREE.InterleavedBufferAttribute(u8, 4, 8, true));
    geo.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1));
    return geo;
  }
}

/** metres per step of the fade radius in a vertex */
export const FADE_UNIT = 0.4;

export function shade(col: number, k: number): number {
  const r = Math.min(255, ((col >> 16) & 255) * k) | 0,
    g = Math.min(255, ((col >> 8) & 255) * k) | 0,
    b = Math.min(255, (col & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

/** where a letter this tall (m) falls to about a pixel: it can leave unseen */
export function fadeFor(size: number): number {
  return nearRadiusFor(size * 0.55);
}
