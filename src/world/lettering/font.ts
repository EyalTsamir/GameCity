// One glyph atlas for all the lettering in the city: signed distance fields drawn once at boot from the system's fonts
// (a canvas and a distance transform, no font files), so that a letter is two triangles that stay sharp at any distance
// and through any lens, and no text ever needs a canvas or a texture upload while the city runs.

import * as THREE from 'three';

/** typefaces: index into the atlas */
export const FACE = {
  /** bold old-style serif: painted fascias */
  SERIF_B: 0,
  /** text serif: menus, newspapers */
  SERIF: 1,
  /** plain sans: notices, small print, timetables */
  SANS: 2,
  SANS_B: 3,
  /** heavy display: posters, modern fascias */
  BLACK: 4,
  /** signwriter's script */
  SCRIPT: 5,
  /** typewriter, till rolls, registration numbers on forms */
  MONO: 6,
  /** chalk and marker pen */
  HAND: 7,
  /** tall condensed: bills, headlines */
  TALL: 8,
  /** humanist sans: enamel plates, transport */
  HUMAN: 9,
} as const;
export type Face = (typeof FACE)[keyof typeof FACE];

const FAMILIES: string[] = [
  'bold {s}px Georgia, "Times New Roman", serif',
  '{s}px Georgia, "Times New Roman", serif',
  '{s}px Arial, Helvetica, sans-serif',
  'bold {s}px Arial, Helvetica, sans-serif',
  '900 {s}px "Arial Black", "Segoe UI Black", Impact, sans-serif',
  '{s}px "Segoe Script", "Brush Script MT", "URW Chancery L", cursive',
  '{s}px Consolas, "Courier New", monospace',
  '{s}px "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
  '{s}px Impact, "Arial Narrow", "Haettenschweiler", sans-serif',
  '{s}px "Gill Sans", "Gill Sans MT", Calibri, "Trebuchet MS", sans-serif',
];

/** the same typeface as a canvas font string, for a sign that is also painted into the far atlas */
export function canvasFamily(face: Face): { family: string; weight: string } {
  const f = FAMILIES[face];
  const m = /^(bold |900 )?\{s\}px (.*)$/.exec(f) as RegExpExecArray;
  return { family: m[2], weight: (m[1] ?? 'normal').trim() };
}

const SIZE = 2048;
const CELL = 58;
const EM = 40;
const SPREAD = 7;
const COLS = Math.floor(SIZE / CELL);
const EXTRA = '£€é·—–‘’“”°½×•èàçñüö';

/** pictograms, addressed like characters (`ICON.fish` in a string): small silhouettes for signs and cards */
export const ICON = {
  fish: '',
  cup: '',
  loaf: '',
  scissors: '',
  flower: '',
  book: '',
  glass: '',
  shoe: '',
  cross: '',
  bike: '',
  note: '',
  key: '',
  star: '',
  anchor: '',
  phone: '',
  card: '',
  dog: '',
  hat: '',
  specs: '',
  cake: '',
  pint: '',
  cone: '',
  fork: '',
  right: '',
  left: '',
  up: '',
  bus: '',
  train: '',
  apple: '',
  knife: '',
  hammer: '',
  pizza: '',
  bear: '',
  cheese: '',
  frame: '',
  bank: '',
  env: '',
  wifi: '',
  smoke: '',
  ring: '',
} as const;
const ICON_N = 40;

type P = CanvasRenderingContext2D;
const ICON_PAINT: ((g: P) => void)[] = (() => {
  const blob = (g: P, x: number, y: number, a: number, b: number, r = 0) => {
    g.beginPath();
    g.ellipse(x, y, a, b, r, 0, Math.PI * 2);
    g.fill();
  };
  const poly = (g: P, pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  };
  const ring = (g: P, x: number, y: number, r: number, w: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  };
  const seg = (g: P, a: number, b: number, c: number, d: number, w: number) => {
    g.lineCap = 'round';
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(c, d);
    g.stroke();
  };
  // in a box of ±1 about the centre, y down
  return [
    (g) => {
      blob(g, -0.12, 0, 0.72, 0.36);
      poly(g, [0.5, 0, 0.98, -0.42, 0.98, 0.42]);
      g.globalCompositeOperation = 'destination-out';
      blob(g, -0.52, -0.08, 0.07, 0.07);
      g.globalCompositeOperation = 'source-over';
    },
    (g) => {
      g.beginPath();
      g.roundRect(-0.7, -0.45, 1.1, 0.95, 0.2);
      g.fill();
      ring(g, 0.52, 0, 0.26, 0.14);
      g.fillRect(-0.85, 0.62, 1.5, 0.12);
    },
    (g) => {
      blob(g, -0.45, -0.15, 0.48, 0.48);
      blob(g, 0.05, -0.2, 0.5, 0.52);
      blob(g, 0.5, -0.15, 0.46, 0.46);
      g.fillRect(-0.92, -0.1, 1.84, 0.6);
    },
    (g) => {
      ring(g, -0.55, 0.55, 0.26, 0.15);
      ring(g, 0.55, 0.55, 0.26, 0.15);
      seg(g, -0.4, 0.34, 0.5, -0.9, 0.14);
      seg(g, 0.4, 0.34, -0.5, -0.9, 0.14);
    },
    (g) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        blob(g, Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.2, 0.3, 0.3);
      }
      g.globalCompositeOperation = 'destination-out';
      blob(g, 0, -0.2, 0.17, 0.17);
      g.globalCompositeOperation = 'source-over';
      seg(g, 0, 0.45, 0, 0.98, 0.1);
    },
    (g) => {
      poly(g, [-0.9, -0.6, -0.05, -0.38, -0.05, 0.72, -0.9, 0.5]);
      poly(g, [0.9, -0.6, 0.05, -0.38, 0.05, 0.72, 0.9, 0.5]);
    },
    (g) => {
      poly(g, [-0.55, -0.9, 0.55, -0.9, 0.42, -0.2, 0.1, 0.05, 0.08, 0.68, 0.4, 0.82, 0.4, 0.92, -0.4, 0.92, -0.4, 0.82, -0.08, 0.68, -0.1, 0.05, -0.42, -0.2]);
    },
    (g) => {
      poly(g, [-0.95, 0.15, -0.95, -0.55, -0.45, -0.55, -0.3, -0.1, 0.5, 0.05, 0.95, 0.25, 0.95, 0.55, -0.95, 0.55]);
    },
    (g) => {
      g.fillRect(-0.28, -0.85, 0.56, 1.7);
      g.fillRect(-0.85, -0.28, 1.7, 0.56);
    },
    (g) => {
      ring(g, -0.55, 0.28, 0.38, 0.12);
      ring(g, 0.55, 0.28, 0.38, 0.12);
      seg(g, -0.55, 0.28, -0.15, -0.3, 0.1);
      seg(g, -0.15, -0.3, 0.4, -0.3, 0.1);
      seg(g, 0.4, -0.3, 0.55, 0.28, 0.1);
      seg(g, -0.15, -0.3, 0, 0.28, 0.1);
      seg(g, 0, 0.28, 0.4, -0.3, 0.1);
      seg(g, 0.4, -0.3, 0.35, -0.55, 0.1);
      seg(g, 0.2, -0.55, 0.5, -0.55, 0.1);
    },
    (g) => {
      blob(g, -0.4, 0.6, 0.3, 0.22, -0.3);
      seg(g, -0.14, 0.58, -0.14, -0.7, 0.13);
      seg(g, -0.14, -0.7, 0.55, -0.42, 0.26);
    },
    (g) => {
      ring(g, -0.42, -0.42, 0.34, 0.2);
      seg(g, -0.18, -0.18, 0.75, 0.75, 0.2);
      seg(g, 0.45, 0.45, 0.72, 0.2, 0.16);
    },
    (g) => {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 ? 0.42 : 1;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      poly(g, pts);
    },
    (g) => {
      ring(g, 0, -0.72, 0.17, 0.11);
      seg(g, 0, -0.5, 0, 0.82, 0.14);
      seg(g, -0.42, -0.25, 0.42, -0.25, 0.12);
      g.lineWidth = 0.14;
      g.beginPath();
      g.arc(0, 0.12, 0.72, 0.15, Math.PI - 0.15);
      g.stroke();
    },
    (g) => {
      g.lineWidth = 0.34;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0.1, 0.1, 0.8, Math.PI * 0.6, Math.PI * 1.1);
      g.stroke();
      blob(g, -0.5, -0.55, 0.26, 0.2, -0.7);
      blob(g, 0.3, 0.72, 0.26, 0.2, -0.3);
    },
    (g) => {
      g.beginPath();
      g.roundRect(-0.95, -0.6, 1.9, 1.2, 0.14);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(-0.95, -0.34, 1.9, 0.26);
      g.fillRect(-0.72, 0.18, 0.7, 0.12);
      g.globalCompositeOperation = 'source-over';
    },
    (g) => {
      blob(g, -0.1, 0.1, 0.55, 0.3);
      blob(g, 0.58, -0.28, 0.27, 0.24);
      poly(g, [0.5, -0.5, 0.56, -0.75, 0.72, -0.48]);
      for (const x of [-0.5, -0.3, 0.15, 0.35]) g.fillRect(x, 0.25, 0.1, 0.62);
      seg(g, -0.62, 0.0, -0.9, -0.42, 0.09);
    },
    (g) => {
      blob(g, 0, 0.42, 0.96, 0.2);
      g.beginPath();
      g.roundRect(-0.52, -0.55, 1.04, 0.98, 0.2);
      g.fill();
    },
    (g) => {
      ring(g, -0.48, 0.05, 0.34, 0.13);
      ring(g, 0.48, 0.05, 0.34, 0.13);
      seg(g, -0.14, 0, 0.14, 0, 0.1);
      seg(g, -0.82, 0, -0.98, -0.3, 0.1);
      seg(g, 0.82, 0, 0.98, -0.3, 0.1);
    },
    (g) => {
      g.fillRect(-0.85, 0.05, 1.7, 0.75);
      g.beginPath();
      g.moveTo(-0.85, 0.05);
      g.bezierCurveTo(-0.5, -0.5, 0.5, -0.5, 0.85, 0.05);
      g.fill();
      g.fillRect(-0.04, -0.85, 0.08, 0.5);
      blob(g, 0, -0.9, 0.09, 0.13);
    },
    (g) => {
      poly(g, [-0.55, -0.72, 0.55, -0.72, 0.42, 0.92, -0.42, 0.92]);
      blob(g, -0.28, -0.72, 0.28, 0.2);
      blob(g, 0.25, -0.76, 0.3, 0.22);
    },
    (g) => {
      poly(g, [-0.48, -0.1, 0.48, -0.1, 0, 0.98]);
      blob(g, 0, -0.42, 0.5, 0.48);
    },
    (g) => {
      g.fillRect(-0.72, -0.92, 0.12, 0.8);
      g.fillRect(-0.47, -0.92, 0.12, 0.8);
      g.fillRect(-0.97, -0.92, 0.12, 0.8);
      g.fillRect(-0.97, -0.2, 0.62, 0.24);
      g.fillRect(-0.73, 0, 0.14, 0.95);
      blob(g, 0.5, -0.45, 0.25, 0.5);
      g.fillRect(0.43, 0, 0.14, 0.95);
    },
    (g) => poly(g, [-0.95, -0.2, 0.2, -0.2, 0.2, -0.65, 0.98, 0, 0.2, 0.65, 0.2, 0.2, -0.95, 0.2]),
    (g) => poly(g, [0.95, -0.2, -0.2, -0.2, -0.2, -0.65, -0.98, 0, -0.2, 0.65, -0.2, 0.2, 0.95, 0.2]),
    (g) => poly(g, [-0.2, 0.95, -0.2, -0.2, -0.65, -0.2, 0, -0.98, 0.65, -0.2, 0.2, -0.2, 0.2, 0.95]),
    (g) => {
      g.beginPath();
      g.roundRect(-0.72, -0.85, 1.44, 1.5, 0.22);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(-0.56, -0.6, 1.12, 0.6);
      blob(g, -0.42, 0.33, 0.13, 0.13);
      blob(g, 0.42, 0.33, 0.13, 0.13);
      g.globalCompositeOperation = 'source-over';
      g.fillRect(-0.62, 0.65, 0.26, 0.24);
      g.fillRect(0.36, 0.65, 0.26, 0.24);
    },
    (g) => {
      g.beginPath();
      g.roundRect(-0.65, -0.9, 1.3, 1.45, 0.4);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(-0.48, -0.5, 0.96, 0.46);
      blob(g, -0.32, 0.26, 0.12, 0.12);
      blob(g, 0.32, 0.26, 0.12, 0.12);
      g.globalCompositeOperation = 'source-over';
      seg(g, -0.42, 0.62, -0.68, 0.95, 0.1);
      seg(g, 0.42, 0.62, 0.68, 0.95, 0.1);
    },
    (g) => {
      blob(g, -0.28, 0.12, 0.5, 0.74);
      blob(g, 0.28, 0.12, 0.5, 0.74);
      seg(g, 0.02, -0.6, 0.18, -0.95, 0.1);
      blob(g, 0.42, -0.82, 0.26, 0.11, -0.4);
    },
    (g) => {
      poly(g, [-0.92, 0.28, 0.5, -0.5, 0.82, -0.28, 0.3, 0.3, -0.92, 0.55]);
      seg(g, 0.55, -0.5, 0.95, -0.82, 0.14);
    },
    (g) => {
      seg(g, -0.72, 0.82, 0.3, -0.2, 0.18);
      poly(g, [-0.15, -0.6, 0.35, -0.95, 0.95, -0.35, 0.6, 0.05, 0.3, -0.25, 0.08, -0.32]);
    },
    (g) => {
      poly(g, [0, 0.95, -0.82, -0.55, 0.82, -0.55]);
      g.lineWidth = 0.2;
      g.beginPath();
      g.arc(0, 0.55, 1.28, -Math.PI * 0.72, -Math.PI * 0.28);
      g.stroke();
      g.globalCompositeOperation = 'destination-out';
      blob(g, -0.2, -0.22, 0.13, 0.13);
      blob(g, 0.22, -0.1, 0.13, 0.13);
      blob(g, 0, 0.3, 0.12, 0.12);
      g.globalCompositeOperation = 'source-over';
    },
    (g) => {
      blob(g, -0.56, -0.6, 0.27, 0.27);
      blob(g, 0.56, -0.6, 0.27, 0.27);
      blob(g, 0, -0.1, 0.62, 0.56);
      blob(g, 0, 0.72, 0.5, 0.36);
    },
    (g) => {
      poly(g, [-0.95, 0.65, -0.95, -0.05, 0.75, -0.65, 0.95, 0.65]);
      g.globalCompositeOperation = 'destination-out';
      blob(g, -0.4, 0.28, 0.16, 0.16);
      blob(g, 0.3, -0.05, 0.2, 0.2);
      blob(g, 0.5, 0.42, 0.1, 0.1);
      g.globalCompositeOperation = 'source-over';
    },
    (g) => {
      g.lineWidth = 0.2;
      g.strokeRect(-0.8, -0.85, 1.6, 1.7);
      poly(g, [-0.55, 0.55, -0.15, -0.2, 0.15, 0.2, 0.32, 0, 0.55, 0.55]);
    },
    (g) => {
      poly(g, [0, -0.95, 0.95, -0.4, -0.95, -0.4]);
      for (const x of [-0.7, -0.24, 0.22, 0.56]) g.fillRect(x, -0.28, 0.16, 0.9);
      g.fillRect(-0.95, 0.68, 1.9, 0.22);
    },
    (g) => {
      g.fillRect(-0.92, -0.62, 1.84, 1.24);
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 0.1;
      g.beginPath();
      g.moveTo(-0.92, -0.62);
      g.lineTo(0, 0.1);
      g.lineTo(0.92, -0.62);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    },
    (g) => {
      blob(g, 0, 0.72, 0.13, 0.13);
      g.lineCap = 'round';
      g.lineWidth = 0.17;
      for (const r of [0.48, 0.92, 1.36]) {
        g.beginPath();
        g.arc(0, 0.72, r, -Math.PI * 0.76, -Math.PI * 0.24);
        g.stroke();
      }
    },
    (g) => {
      g.fillRect(-0.95, 0.12, 1.5, 0.3);
      g.fillRect(0.62, 0.12, 0.12, 0.3);
      g.fillRect(0.8, 0.12, 0.12, 0.3);
      seg(g, 0.68, -0.08, 0.68, -0.4, 0.08);
      seg(g, 0.86, -0.08, 0.86, -0.55, 0.08);
      seg(g, -0.8, -0.8, 0.8, 0.8, 0.14);
    },
    (g) => {
      ring(g, 0, 0.18, 0.62, 0.2);
      poly(g, [0, -0.45, -0.28, -0.82, 0, -0.98, 0.28, -0.82]);
    },
  ];
})();

/** Glyph tables: advance and left bearing in em; uv of the cell. */
export class GlyphAtlas {
  readonly texture: THREE.DataTexture;
  private readonly adv = new Float32Array(COLS * COLS);
  private readonly map: Map<number, number>[] = [];
  private readonly ascii: Int16Array[] = [];
  /** quad size in em (the whole cell, spread included) */
  readonly quadEm = CELL / EM;
  readonly faces = FAMILIES.length;

  constructor() {
    const cv = document.createElement('canvas');
    cv.width = SIZE;
    cv.height = SIZE;
    const g = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    g.fillStyle = '#000';
    g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    let n = 0;
    const cell = (k: number): [number, number] => [(k % COLS) * CELL, Math.floor(k / COLS) * CELL];
    const chars: number[] = [];
    for (let c = 32; c < 127; c++) chars.push(c);
    for (let i = 0; i < EXTRA.length; i++) chars.push(EXTRA.charCodeAt(i));
    for (let f = 0; f < FAMILIES.length; f++) {
      g.font = FAMILIES[f].replace('{s}', String(EM));
      const m = new Map<number, number>();
      const a = new Int16Array(128).fill(-1);
      for (const c of chars) {
        const ch = String.fromCharCode(c);
        const w = g.measureText(ch).width;
        const [x, y] = cell(n);
        g.save();
        g.beginPath();
        g.rect(x, y, CELL, CELL);
        g.clip();
        // (centred in the cell, baseline at a fixed height)
        g.fillText(ch, x + (CELL - w) / 2, y + CELL * 0.72);
        g.restore();
        this.adv[n] = w / EM;
        m.set(c, n);
        if (c < 128) a[c] = n;
        n++;
      }
      this.map.push(m);
      this.ascii.push(a);
    }
    // the pictograms belong to every face
    const iconAt = 0xe000;
    const ic = new Map<number, number>();
    for (let i = 0; i < ICON_N; i++) {
      const [x, y] = cell(n);
      g.save();
      g.beginPath();
      g.rect(x, y, CELL, CELL);
      g.clip();
      g.translate(x + CELL / 2, y + CELL * 0.72 - EM * 0.36);
      g.scale(EM * 0.5, EM * 0.5);
      ICON_PAINT[i]?.(g);
      g.restore();
      this.adv[n] = 1.08;
      ic.set(iconAt + i, n);
      n++;
    }
    for (const m of this.map) for (const [k, v] of ic) m.set(k, v);

    const img = g.getImageData(0, 0, SIZE, SIZE).data;
    const out = new Uint8Array(SIZE * SIZE);
    const cover = new Float64Array(CELL * CELL);
    const outer = new Float64Array(CELL * CELL);
    const inner = new Float64Array(CELL * CELL);
    const f1 = new Float64Array(CELL),
      d1 = new Float64Array(CELL),
      v1 = new Int16Array(CELL),
      z1 = new Float64Array(CELL + 1);
    for (let k = 0; k < n; k++) {
      const [x0, y0] = cell(k);
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) cover[y * CELL + x] = img[((y0 + y) * SIZE + x0 + x) * 4] / 255;
      for (let i = 0; i < cover.length; i++) {
        const a = cover[i];
        outer[i] = a >= 1 ? 0 : a <= 0 ? 1e20 : Math.max(0, 0.5 - a) ** 2;
        inner[i] = a >= 1 ? 1e20 : a <= 0 ? 0 : Math.max(0, a - 0.5) ** 2;
      }
      edt(outer, f1, d1, v1, z1);
      edt(inner, f1, d1, v1, z1);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = y * CELL + x;
          const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
          out[(y0 + y) * SIZE + x0 + x] = Math.max(0, Math.min(255, Math.round(255 * (0.5 - d / (2 * SPREAD)))));
        }
      }
    }
    const t = new THREE.DataTexture(out, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    t.unpackAlignment = 1;
    t.flipY = false;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    this.texture = t;
  }

  /** the atlas cell of a character in a face; -1: not in the set (a space takes its place) */
  glyph(face: number, code: number): number {
    if (code < 128) return this.ascii[face][code];
    return this.map[face].get(code) ?? -1;
  }

  advance(k: number): number {
    return k < 0 ? 0.3 : this.adv[k];
  }

  /** width of a string in em */
  width(text: string, face: number): number {
    let w = 0;
    for (let i = 0; i < text.length; i++) w += this.advance(this.glyph(face, text.charCodeAt(i)));
    return w;
  }

  u0(k: number): number {
    return ((k % COLS) * CELL) / SIZE;
  }
  v0(k: number): number {
    return (Math.floor(k / COLS) * CELL) / SIZE;
  }
  readonly cellUv = CELL / SIZE;
  /** the baseline's height in the quad, from its bottom, in em */
  readonly baseEm = (CELL * 0.28) / EM;
  /** distance-field units per em: for the width of the edge */
  readonly spreadEm = SPREAD / EM;
}

/** Felzenszwalb & Huttenlocher, in place over a CELL × CELL grid */
function edt(a: Float64Array, f: Float64Array, d: Float64Array, v: Int16Array, z: Float64Array): void {
  for (let x = 0; x < CELL; x++) {
    for (let y = 0; y < CELL; y++) f[y] = a[y * CELL + x];
    edt1(f, d, v, z);
    for (let y = 0; y < CELL; y++) a[y * CELL + x] = d[y];
  }
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) f[x] = a[y * CELL + x];
    edt1(f, d, v, z);
    for (let x = 0; x < CELL; x++) a[y * CELL + x] = d[x];
  }
}

function edt1(f: Float64Array, d: Float64Array, v: Int16Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < CELL; q++) {
    let s = 0;
    for (;;) {
      const r = v[k];
      s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
      if (s > z[k]) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < CELL; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    d[q] = (q - r) * (q - r) + f[r];
  }
}
