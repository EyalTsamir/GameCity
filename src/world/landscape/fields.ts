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

/** crop hash → grazing-land crop (pasture 0.48–0.66 / hay 0.66–0.76 / fallow 0.83–0.91), GLSL twin in the shader */
export function grazeCrop(ch: number, g: number): number {
  if (g < 0.5) return ch;
  return ch < 0.6 ? 0.48 + ch * 0.3 : ch < 0.85 ? 0.66 + (ch - 0.6) * 0.4 : 0.83 + (ch - 0.85) * 0.5;
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

export interface Field extends Parcel {
  /** field id after the strip split (hash key for crop / tone) */
  pid: number;
}

/** the field (a parcel or one of its 2–3 strips) at a field-frame point — the shader's split, on the CPU */
export function fieldAt(qx: number, qy: number, out: Field): Field {
  parcelAt(qx, qy, out);
  let pid = out.k * 13 + out.j;
  const longX = out.x1 - out.x0 >= out.y1 - out.y0;
  const sub = lhash(pid, 31);
  if (sub < 0.5) {
    const n = sub < 0.2 ? 3 : 2;
    if (longX) {
      const w = (out.x1 - out.x0) / n;
      const si = Math.min(n - 1, Math.max(0, Math.floor((qx - out.x0) / w)));
      out.x0 += si * w;
      out.x1 = out.x0 + w;
      pid += si * 977;
    } else {
      const w = (out.y1 - out.y0) / n;
      const si = Math.min(n - 1, Math.max(0, Math.floor((qy - out.y0) / w)));
      out.y0 += si * w;
      out.y1 = out.y0 + w;
      pid += si * 977;
    }
    out.crop = lhash(pid, 17);
  }
  out.pid = pid;
  return out;
}

/** the fields (strips) of parcel (k, j), given its centre in the field frame */
export function fieldsOfParcel(cx: number, cy: number): Field[] {
  const P: Field = { k: 0, j: 0, x0: 0, y0: 0, x1: 0, y1: 0, crop: 0, pid: 0 };
  parcelAt(cx, cy, P);
  const longX = P.x1 - P.x0 >= P.y1 - P.y0;
  const sub = lhash(P.k * 13 + P.j, 31);
  const n = sub < 0.2 ? 3 : sub < 0.5 ? 2 : 1;
  const out: Field[] = [];
  for (let si = 0; si < n; si++) {
    const qx = longX ? P.x0 + ((si + 0.5) * (P.x1 - P.x0)) / n : cx;
    const qy = longX ? cy : P.y0 + ((si + 0.5) * (P.y1 - P.y0)) / n;
    out.push(fieldAt(qx, qy, { k: 0, j: 0, x0: 0, y0: 0, x1: 0, y1: 0, crop: 0, pid: 0 }));
  }
  return out;
}
