// The baked face (close-up round): what is finer than the head's mesh, drawn once at boot into two small maps, one half of the
// face (mirrored in the shader). U = arc round the head from the nose, Y = up from the eye line, metres of the average man.
//   A  rg  slope of the fine relief (lid folds, nostrils, the crease round the wings, philtrum, lip borders, pores)
//      b   cavity: how much of the sky a point of the whole relief still sees
//      a   blood: where skin runs redder (cheeks, nose, chin, round the mouth)
//   B  rg  slope of the wrinkles, scaled by age in the shader; b  wrinkle depth (dark in the lines)
//      a   shade round the eyes (the thin skin, the socket)
// A sculpt of this resolution in the mesh would cost a hundred thousand triangles a head; a lookup costs one texture read.

import * as THREE from 'three';

export const FACE_U = 0.13;
export const FACE_Y0 = -0.125;
export const FACE_Y1 = 0.075;
/** the eye's opening, shared by the paint (shader.ts), the lids here and the socket in the mesh: half width, top, bottom, iris and
 *  pupil radius. A little larger than life: the style is an animated film's, and eyes are what you look at. */
export const EYE = { x: 0.031, w: 0.0138, up: 0.0056, lo: 0.0035, iris: 0.0067, pupil: 0.0025 };
const W = 256;
const H = 384;

const gs = (x: number, y: number, sx: number, sy: number) => Math.exp(-((x * x) / (sx * sx) + (y * y) / (sy * sy)));
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** distance from a point to a segment */
const seg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const px = x - ax,
    py = y - ay,
    dx = bx - ax,
    dy = by - ay;
  const t = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - dx * t, py - dy * t);
};
// a small stable value noise (cells of size 1)
const hash2 = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x: number, y: number) => {
  const i = Math.floor(x),
    j = Math.floor(y),
    fx = x - i,
    fy = y - j,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j),
    b = hash2(i + 1, j),
    c = hash2(i, j + 1),
    d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** the fine relief, m (ax ≥ 0) */
function fine(ax: number, Y: number): number {
  let r = 0;
  // lids: the eye's opening as the paint draws it (shader.ts), the upper lid's edge standing proud, a fold above it, the
  // lower lid's rim, the soft trough under it
  const ex = ax - EYE.x,
    ey = Y - 0.0004,
    ew = EYE.w;
  const q = 1 - (ex * ex) / (ew * ew);
  if (q > -0.8) {
    const qa = Math.pow(Math.max(q, 0), 0.75);
    const up = EYE.up * qa + (0.0007 * ex) / ew;
    const lo = -EYE.lo * Math.pow(Math.max(q, 0), 0.9) + (0.0005 * ex) / ew;
    const wide = 1 - sstep(0.9, 1.5, Math.abs(ex) / ew);
    const dU = ey - up;
    const dL = lo - ey;
    r += 0.0004 * Math.exp(-((dU - 0.0009) ** 2) / 1.2e-6) * wide;
    r -= 0.0007 * Math.exp(-((dU - 0.0044) ** 2) / 0.8e-6) * wide;
    r += 0.00018 * Math.exp(-((dL - 0.0007) ** 2) / 0.8e-6) * wide;
    r -= 0.0004 * Math.exp(-((dL - 0.0058) ** 2) / 5e-6) * wide;
    r -= 0.0005 * sstep(0, 0.0012, -Math.max(dU, dL)) * (q > 0 ? 1 : 0); // the eye sits behind its lids (no step: the wet ball would show it as a bright jagged line)
  }
  // nose: the ball of the tip, its two lobes, the crease round each wing, the nostrils, the columella between them
  r += 0.0006 * gs(ax - 0.0032, Y + 0.0415, 0.0042, 0.0042);
  r -= 0.00035 * gs(Math.hypot(ax - 0.0108, (Y + 0.0445) * 1.1) - 0.0062, 0, 0.0018, 1) * sstep(-0.034, -0.042, Y + 0.3 * (ax - 0.012));
  r -= 0.0012 * gs(ax - 0.0062, Y + 0.0505, 0.0023, 0.0009);
  r += 0.0004 * gs(ax, Y + 0.0485, 0.0016, 0.004);
  // inner corner of the eye: the hollow against the bridge
  r -= 0.0009 * gs(ax - 0.0165, Y - 0.001, 0.0034, 0.006);
  // nasolabial fold: barely there on the young, soft fullness outside it
  const nl = ax - (0.02 + 0.34 * Math.max(0, -0.045 - Y));
  const nlY = sstep(-0.04, -0.05, Y) * sstep(-0.082, -0.07, Y);
  r -= 0.0003 * gs(nl, 0, 0.0032, 1) * nlY;
  r += 0.0005 * gs(nl - 0.006, 0, 0.005, 1) * nlY;
  // philtrum, the cupid's bow, the mouth line with its corners, a lower lip with a soft centre, the groove above the chin
  r += 0.0006 * gs(ax - 0.0036, Y + 0.0525, 0.0017, 0.0042);
  r -= 0.0004 * gs(ax, Y + 0.0525, 0.0018, 0.004);
  const bow = 0.0012 * (gs(ax - 0.0055, 0, 0.0035, 1) - 0.6 * gs(ax, 0, 0.0025, 1));
  r += 0.0005 * gs(ax, Y + 0.0572 - bow, 0.017, 0.0009);
  const mouth = -0.0665 + 0.0009 * gs(ax, 0, 0.004, 1) - 0.0004 * (ax / 0.021) ** 2;
  r -= 0.001 * gs(ax, Y - mouth, 0.0235, 0.0007);
  r -= 0.0005 * gs(ax - 0.0245, Y + 0.0668, 0.0026, 0.0028);
  r += 0.0005 * gs(ax - 0.007, Y + 0.0722, 0.008, 0.0035);
  r -= 0.0003 * gs(ax, Y + 0.071, 0.0026, 0.0035);
  r += 0.0004 * gs(ax - 0.006, Y + 0.0602, 0.006, 0.0026);
  // chin: a soft pad
  r += 0.0006 * gs(ax - 0.006, Y + 0.103, 0.01, 0.009);
  // pores: fine, on the nose and cheeks; the forehead and the lids are smoother
  const pk = 0.45 + 0.55 * gs(ax - 0.03, Y + 0.035, 0.045, 0.035);
  r += 0.000045 * pk * (noise(ax * 1400, Y * 1400) - 0.5) + 0.00004 * (noise(ax * 500 + 9, Y * 500) - 0.5);
  return r;
}

/** wrinkles at full age, m */
function wrinkles(ax: number, Y: number): number {
  let r = 0;
  const line = (d: number, w: number, a: number) => (r -= a * Math.exp(-(d * d) / (w * w)));
  // nasolabial fold, from the wing past the corner of the mouth, its fullness outside
  line(seg(ax, Y, 0.0185, -0.043, 0.0345, -0.08), 0.0017, 0.0014);
  r += 0.0009 * gs(seg(ax, Y, 0.024, -0.043, 0.04, -0.08), 0, 0.005, 1);
  // marionette lines
  line(seg(ax, Y, 0.0285, -0.073, 0.034, -0.098), 0.0012, 0.0008);
  // forehead: four waving lines, not ruled
  for (let i = 0; i < 4; i++) {
    const y0 = 0.029 + i * 0.0088;
    const wav = 0.0012 * Math.sin(ax * 90 + i * 2.1) + 0.0006 * Math.sin(ax * 230 + i * 4.3) - 0.0035 * gs(ax - 0.02, 0, 0.03, 1);
    const fade = 1 - sstep(0.035, 0.06, ax + 0.0035 * i);
    line(Y - y0 - wav, 0.00075, 0.00042 * fade * (0.7 + 0.5 * noise(ax * 70, i * 3.1)));
  }
  // frown lines between the brows
  line(seg(ax, Y, 0.0058, 0.0055, 0.0072, 0.0235), 0.0009, 0.0006);
  // crow's feet
  line(seg(ax, Y, 0.0455, 0.0015, 0.0585, 0.0075), 0.0007, 0.00042);
  line(seg(ax, Y, 0.046, -0.0015, 0.0605, -0.002), 0.0007, 0.00045);
  line(seg(ax, Y, 0.0455, -0.0045, 0.0575, -0.012), 0.0007, 0.00038);
  // under the eye: the bag and its lower crease
  const ex = ax - 0.032;
  const bag = -0.0115 - 0.012 * Math.max(0, ex / 0.016) ** 2 + 0.002 * (ex / 0.016);
  line(Y - bag, 0.0011, 0.0006 * (1 - sstep(0.012, 0.024, Math.abs(ex))));
  r += 0.0006 * gs(ex, Y + 0.0072, 0.013, 0.0035);
  // lines into the upper lip, a loosened lid
  for (let i = 0; i < 4; i++) line(ax - (0.006 + i * 0.0044) - (Y + 0.058) * 0.2, 0.0004, 0.00024 * gs(0, Y + 0.0552, 1, 0.0034));
  r -= 0.0005 * gs(ax - 0.039, Y - 0.0075, 0.012, 0.0028);
  // fine crazing all over: old skin isn't smooth between the lines
  r += 0.00012 * (noise(ax * 420, Y * 700) - 0.5);
  return r;
}

/** relief of the head's mesh (body.ts faceRelief), for the cavity map */
export type ReliefFn = (u: number, y: number, nose: number) => number;

let cached: { a: THREE.DataTexture; b: THREE.DataTexture } | null = null;

function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = new Float32Array(src.length),
    b = new Float32Array(src.length);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.abs(x)]; // mirrored at the middle of the face
    for (let x = 0; x < w; x++) {
      a[y * w + x] = s * k;
      s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.abs(x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += a[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      b[y * w + x] = s * k;
      s += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
    }
  }
  return b;
}

/** the two maps (built once) */
export function faceMaps(relief: ReliefFn): { a: THREE.DataTexture; b: THREE.DataTexture } {
  if (cached) return cached;
  const du = FACE_U / (W - 1),
    dy = (FACE_Y1 - FACE_Y0) / (H - 1);
  const F = new Float32Array(W * H),
    Wr = new Float32Array(W * H),
    T = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const Y = FACE_Y0 + j * dy;
    for (let i = 0; i < W; i++) {
      const ax = i * du;
      const f = fine(ax, Y);
      F[j * W + i] = f;
      Wr[j * W + i] = wrinkles(ax, Y);
      T[j * W + i] = f + relief(ax, Y, 0.024);
    }
  }
  // the cavity: lower than what is round it, at two scales (the crease, the socket)
  const b1 = blur(T, W, H, 8),
    b2 = blur(T, W, H, 22);
  const A = new Uint8Array(W * H * 4),
    B = new Uint8Array(W * H * 4);
  const enc = (s: number) => clamp(Math.round((s / 1.2) * 127.5 + 127.5), 0, 255);
  const at = (a: Float32Array, i: number, j: number) => a[clamp(j, 0, H - 1) * W + Math.abs(Math.min(i, W - 1))];
  for (let j = 0; j < H; j++) {
    const Y = FACE_Y0 + j * dy;
    for (let i = 0; i < W; i++) {
      const ax = i * du;
      const o = (j * W + i) * 4;
      A[o] = enc((at(F, i + 1, j) - at(F, i - 1, j)) / (2 * du));
      A[o + 1] = enc((at(F, i, j + 1) - at(F, i, j - 1)) / (2 * dy));
      const cav = 1 - clamp(Math.max(0, b1[j * W + i] - T[j * W + i]) * 95 + Math.max(0, b2[j * W + i] - T[j * W + i]) * 10, 0, 0.55);
      A[o + 2] = Math.round(clamp(cav, 0, 1) * 255);
      const blood = 0.62 * gs(ax - 0.046, Y + 0.036, 0.024, 0.021) + 0.5 * gs(ax - 0.005, Y + 0.036, 0.014, 0.014) + 0.3 * gs(ax - 0.012, Y + 0.098, 0.02, 0.014) + 0.28 * gs(ax - 0.009, Y + 0.056, 0.022, 0.012) + 0.22 * gs(ax - 0.03, Y - 0.04, 0.05, 0.022);
      A[o + 3] = Math.round(clamp(blood, 0, 1) * 255);
      B[o] = enc((at(Wr, i + 1, j) - at(Wr, i - 1, j)) / (2 * du));
      B[o + 1] = enc((at(Wr, i, j + 1) - at(Wr, i, j - 1)) / (2 * dy));
      B[o + 2] = Math.round(clamp(-Wr[j * W + i] * 800, 0, 1) * 255);
      // round the eye the skin is thin and the blood under it shows bluish; the socket's top under the brow
      const eyeShade = 0.75 * gs(ax - 0.032, Y + 0.008, 0.017, 0.006) + 0.45 * gs(ax - 0.022, Y - 0.002, 0.008, 0.009) + 0.35 * gs(ax - 0.033, Y - 0.0075, 0.016, 0.0032);
      B[o + 3] = Math.round(clamp(eyeShade, 0, 1) * 255);
    }
  }
  const tex = (d: Uint8Array) => {
    const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  cached = { a: tex(A), b: tex(B) };
  return cached;
}
