// The farmland patchwork, identical on the CPU (hedgerow / orchard / farm placement) and the GPU
// (landscape shader): integer hashes only, so both sides agree on every parcel.
//
// Field frame: world xz rotated by FIELD_ROT. Rows of jittered height (≈ FROW), each row cut into
// columns of its own width (square fields … long strips), column boundaries jittered per row.
// A parcel = (row k, column j). Borders carry a hedgerow or a farm track by hash.

export const FROW = 84;
export const FIELD_ROT = (8 * Math.PI) / 180;
const CR = Math.cos(FIELD_ROT),
  SR = Math.sin(FIELD_ROT);

/** integer lattice hash in [0,1) — GLSL twin: lhash() in FIELDS_GLSL */
export function lhash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function toField(x: number, z: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = CR * x + SR * z;
  out.y = -SR * x + CR * z;
  return out;
}

export function fromField(qx: number, qy: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = CR * qx - SR * qy;
  out.z = SR * qx + CR * qy;
  return out;
}

export function rowB(k: number): number {
  return FROW * (k + 0.4 * (lhash(k, 31) - 0.5));
}
export function colW(k: number): number {
  return FROW * (0.9 + 2.6 * lhash(k, 77));
}
export function colOff(k: number): number {
  return lhash(k, 83) * colW(k);
}
export function colB(k: number, j: number): number {
  return colW(k) * (j + 0.4 * (lhash(k * 7 + j, 91) - 0.5));
}
/** hedgerow on the row boundary at k (between rows k-1 and k) */
export function rowHedge(k: number): boolean {
  return lhash(k, 44) < 0.55;
}
/** farm track on the row boundary at k */
export function rowTrack(k: number): boolean {
  return lhash(k, 45) < 0.16;
}
/** hedgerow on the column boundary j of row k */
export function colHedge(k: number, j: number): boolean {
  return lhash(k * 7 + j, 55) < 0.45;
}

export interface Parcel {
  k: number;
  j: number;
  /** field-frame box: x0, y0, x1, y1 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** crop hash 0..1 */
  crop: number;
}

export function parcelAt(qx: number, qy: number, out: Parcel): Parcel {
  let k = Math.floor(qy / FROW);
  let b0 = rowB(k),
    b1 = rowB(k + 1);
  if (qy < b0) {
    k -= 1;
    b1 = b0;
    b0 = rowB(k);
  } else if (qy >= b1) {
    k += 1;
    b0 = b1;
    b1 = rowB(k + 1);
  }
  const cw = colW(k);
  const off = colOff(k);
  const xq = qx - off;
  let j = Math.floor(xq / cw);
  let c0 = colB(k, j),
    c1 = colB(k, j + 1);
  if (xq < c0) {
    j -= 1;
    c1 = c0;
    c0 = colB(k, j);
  } else if (xq >= c1) {
    j += 1;
    c0 = c1;
    c1 = colB(k, j + 1);
  }
  out.k = k;
  out.j = j;
  out.x0 = c0 + off;
  out.x1 = c1 + off;
  out.y0 = b0;
  out.y1 = b1;
  out.crop = lhash(k * 13 + j, 17);
  return out;
}

/** crop kinds by hash (shader uses the same thresholds) */
export const CROPS = ['wheat', 'stubble', 'greens', 'pasture', 'hay', 'ploughed', 'fallow', 'sunflower', 'orchard'] as const;
export type Crop = (typeof CROPS)[number];
export const CROP_CUM = [0.22, 0.33, 0.48, 0.66, 0.76, 0.83, 0.91, 0.95, 1.0];
export function cropOf(h: number): Crop {
  for (let i = 0; i < CROP_CUM.length; i++) if (h < CROP_CUM[i]) return CROPS[i];
  return 'orchard';
}

export const FIELDS_GLSL = /* glsl */ `
#define FROW ${FROW.toFixed(1)}
const mat2 FROT = mat2(${CR.toFixed(7)}, ${(-SR).toFixed(7)}, ${SR.toFixed(7)}, ${CR.toFixed(7)});
float lhash(int a, int b) {
  uint h = (uint(a) * 374761393u) ^ (uint(b) * 668265263u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) * (1.0 / 4294967296.0);
}
float fRowB(int k) { return FROW * (float(k) + 0.4 * (lhash(k, 31) - 0.5)); }
float fColW(int k) { return FROW * (0.9 + 2.6 * lhash(k, 77)); }
float fColB(int k, int j, float cw) { return cw * (float(j) + 0.4 * (lhash(k * 7 + j, 91) - 0.5)); }
// parcel at field-frame point q: id = (k, j), box = (x0, y0, x1, y1), returns crop hash
float fParcel(vec2 q, out ivec2 id, out vec4 box) {
  int k = int(floor(q.y / FROW));
  float b0 = fRowB(k), b1 = fRowB(k + 1);
  if (q.y < b0) { k -= 1; b1 = b0; b0 = fRowB(k); }
  else if (q.y >= b1) { k += 1; b0 = b1; b1 = fRowB(k + 1); }
  float cw = fColW(k);
  float off = lhash(k, 83) * cw;
  float xq = q.x - off;
  int j = int(floor(xq / cw));
  float c0 = fColB(k, j, cw), c1 = fColB(k, j + 1, cw);
  if (xq < c0) { j -= 1; c1 = c0; c0 = fColB(k, j, cw); }
  else if (xq >= c1) { j += 1; c0 = c1; c1 = fColB(k, j + 1, cw); }
  id = ivec2(k, j);
  box = vec4(c0 + off, b0, c1 + off, b1);
  return lhash(k * 13 + j, 17);
}
`;
