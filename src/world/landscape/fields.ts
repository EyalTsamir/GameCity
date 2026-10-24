// The farmland patchwork, identical on the CPU (hedgerow / orchard / farm placement) and the GPU
// (landscape shader): integer hashes only, so both sides agree on every parcel.
//
// Field frame: world xz rotated by FIELD_ROT. Rows of jittered height (≈ FROW), each row cut into
// columns of its own width (square fields … long strips), column boundaries jittered per row.
// A parcel = (row k, column j). Borders carry a hedgerow or a farm track by hash. Parcels are split into
// 2–3 strips, or — in the belt round the town — into a grid of small plots (market gardens, paddocks).

import { SLAB } from '../../core/constants';

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

/** a stronger integer hash (murmur3 finaliser) for structured ids (plot ids are base·37 + ix·131 + iy·977:
 *  lhash's single round left neighbouring plots with near-equal values, so whole blocks got one crop) —
 *  GLSL twin: fhmix() */
export function hmix(a: number, b: number): number {
  // (all multipliers < 2³¹: the GLSL twin's uint literals stay in the range every compiler handles)
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
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


export interface Field extends Parcel {
  /** field id after the split (hash key for crop / tone) */
  pid: number;
  /** a town-edge smallholding plot (market gardens, paddocks …) */
  small: boolean;
  /** plot grid of the parent parcel (small) and this plot's cell */
  nx: number;
  ny: number;
  ix: number;
  iy: number;
  /** the parent parcel's id (k·13 + j) */
  ppid: number;
  /** polytunnels allowed (smallholdings west of the town, never in the beach foreground) */
  tun: boolean;
}

/** the belt of small plots round the town (parcel centre within this of the slab, not in the north) */
export const TOWN_EDGE = 470;
/** target size of a smallholding plot (m) */
export const PLOT = 44;

function slabDistXZ(x: number, z: number): number {
  const dx = Math.max(SLAB.x0 - x, x - SLAB.x1, 0),
    dz = Math.max(SLAB.z0 - z, z - SLAB.z1, 0);
  return Math.hypot(dx, dz);
}
const _w = { x: 0, z: 0 };
/** smallholding test of a parcel box (by its centre) — GLSL twin in FIELDS_GLSL fSmall() */
export function isSmall(x0: number, y0: number, x1: number, y1: number): boolean {
  fromField((x0 + x1) / 2, (y0 + y1) / 2, _w);
  return slabDistXZ(_w.x, _w.z) < TOWN_EDGE && _w.z > -150;
}
/** polytunnels only west of the town (twin: fTun) */
export function tunnelsOK(x0: number, y0: number, x1: number, y1: number): boolean {
  fromField((x0 + x1) / 2, (y0 + y1) / 2, _w);
  return _w.x < -40;
}

/** the field at a field-frame point — parcel, its 2–3 strips, or (town edge) its grid of small plots */
export function fieldAt(qx: number, qy: number, out: Field): Field {
  parcelAt(qx, qy, out);
  let pid = out.k * 13 + out.j;
  out.ppid = pid;
  out.small = isSmall(out.x0, out.y0, out.x1, out.y1);
  out.tun = out.small && tunnelsOK(out.x0, out.y0, out.x1, out.y1);
  out.nx = out.ny = 1;
  out.ix = out.iy = 0;
  if (out.small) {
    const nx = Math.max(1, Math.round((out.x1 - out.x0) / PLOT)),
      ny = Math.max(1, Math.round((out.y1 - out.y0) / PLOT));
    const wx = (out.x1 - out.x0) / nx,
      wy = (out.y1 - out.y0) / ny;
    const ix = Math.min(nx - 1, Math.max(0, Math.floor((qx - out.x0) / wx))),
      iy = Math.min(ny - 1, Math.max(0, Math.floor((qy - out.y0) / wy)));
    out.x0 += ix * wx;
    out.x1 = out.x0 + wx;
    out.y0 += iy * wy;
    out.y1 = out.y0 + wy;
    out.nx = nx;
    out.ny = ny;
    out.ix = ix;
    out.iy = iy;
    pid = pid * 37 + ix * 131 + iy * 977 + 7;
    out.crop = hmix(pid, 17);
    out.pid = pid;
    return out;
  }
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

const newField = (): Field => ({ k: 0, j: 0, x0: 0, y0: 0, x1: 0, y1: 0, crop: 0, pid: 0, small: false, nx: 1, ny: 1, ix: 0, iy: 0, ppid: 0, tun: false });

/** the fields (strips / plots) of the parcel at field-frame point (cx, cy) */
export function fieldsOfParcel(cx: number, cy: number): Field[] {
  const P = newField();
  fieldAt(cx, cy, P);
  parcelAt(cx, cy, P);
  const out: Field[] = [];
  if (isSmall(P.x0, P.y0, P.x1, P.y1)) {
    const nx = Math.max(1, Math.round((P.x1 - P.x0) / PLOT)),
      ny = Math.max(1, Math.round((P.y1 - P.y0) / PLOT));
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++)
        out.push(fieldAt(P.x0 + ((ix + 0.5) * (P.x1 - P.x0)) / nx, P.y0 + ((iy + 0.5) * (P.y1 - P.y0)) / ny, newField()));
    return out;
  }
  const longX = P.x1 - P.x0 >= P.y1 - P.y0;
  const sub = lhash(P.k * 13 + P.j, 31);
  const n = sub < 0.2 ? 3 : sub < 0.5 ? 2 : 1;
  for (let si = 0; si < n; si++) {
    const qx = longX ? P.x0 + ((si + 0.5) * (P.x1 - P.x0)) / n : cx;
    const qy = longX ? cy : P.y0 + ((si + 0.5) * (P.y1 - P.y0)) / n;
    out.push(fieldAt(qx, qy, newField()));
  }
  return out;
}

/** hedge on the interior plot border (axis 0 = between columns at index i, 1 = between rows) — not on the
 *  border that carries the farm track (plotTrack) */
export function plotHedge(ppid: number, axis: number, i: number, nx: number, ny: number): boolean {
  const t = plotTrack(ppid, nx, ny);
  if (t >= 0 && Math.floor(t / 1000) === axis && t % 1000 === i) return false;
  return hmix(ppid * 3 + axis, i * 7 + 61) < 0.5;
}
/** the farm track through half the smallholdings: the middle row border (or column border when there is
 *  one row), encoded axis·1000 + index, −1 = none — GLSL twin in the shader's plot block */
export function plotTrack(ppid: number, nx: number, ny: number): number {
  const axis = ny >= 2 ? 1 : 0;
  const n = axis ? ny : nx;
  if (n < 2 || hmix(ppid, 71) >= 0.5) return -1;
  return axis * 1000 + Math.floor(n * 0.5);
}

/** crop kinds (the shader switches on the same codes) */
export const CK = { wheat: 0, stubble: 1, greens: 2, pasture: 3, hay: 4, ploughed: 5, fallow: 6, sunflower: 7, orchard: 8, veg: 9, maize: 10, tunnels: 11 } as const;
const CUM_N = [0.22, 0.33, 0.48, 0.66, 0.76, 0.83, 0.91, 0.95, 1.01];
const KIND_N = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const CUM_S = [0.16, 0.26, 0.36, 0.48, 0.56, 0.66, 0.74, 0.82, 0.9, 0.95, 1.01];
const KIND_S = [9, 10, 2, 3, 8, 0, 5, 4, 6, 7, 11];
/** crop kind of a field: smallholding mix, grazing land (pasture / hay / fallow) or the farmland mix */
export function cropKind(ch: number, small: boolean, graze: number, tun = false): number {
  if (small) {
    for (let i = 0; i < CUM_S.length; i++) if (ch < CUM_S[i]) return KIND_S[i] === 11 && !tun ? 9 : KIND_S[i];
    return tun ? 11 : 9;
  }
  if (graze >= 0.5) return ch < 0.6 ? 3 : ch < 0.85 ? 4 : 6;
  for (let i = 0; i < CUM_N.length; i++) if (ch < CUM_N[i]) return KIND_N[i];
  return 8;
}

// (after the tables it interpolates)
export const FIELDS_GLSL = /* glsl */ `
#define FROW ${FROW.toFixed(1)}
#define FPLOT ${PLOT.toFixed(1)}
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
uint fhmixU(int a, int b) {
  uint h = (uint(a) * 668265261u) ^ (uint(b) * 374761393u);
  h ^= h >> 15u;
  h *= 739982445u;
  h ^= h >> 12u;
  h *= 695872825u;
  h ^= h >> 15u;
  return h;
}
float fhmix(int a, int b) { return float(fhmixU(a, b)) * (1.0 / 4294967296.0); }
// smallholding belt round the town (twin of isSmall)
bool fSmall(vec4 box) {
  vec2 c = 0.5 * (box.xy + box.zw);
  vec2 w = vec2(FROT[0][0] * c.x + FROT[0][1] * c.y, FROT[1][0] * c.x + FROT[1][1] * c.y);
  vec2 d = max(max(vec2(${SLAB.x0.toFixed(1)}, ${SLAB.z0.toFixed(1)}) - w, w - vec2(${SLAB.x1.toFixed(1)}, ${SLAB.z1.toFixed(1)})), 0.0);
  return length(d) < ${TOWN_EDGE.toFixed(1)} && w.y > -150.0;
}
// polytunnels only west of the town (twin of tunnelsOK)
bool fTun(vec4 box) {
  vec2 c = 0.5 * (box.xy + box.zw);
  return FROT[0][0] * c.x + FROT[0][1] * c.y < -40.0;
}
// crop kind (twin of cropKind): 0 wheat 1 stubble 2 greens 3 pasture 4 hay 5 ploughed 6 fallow
// 7 sunflower 8 orchard 9 market garden 10 maize 11 polytunnels
int fCropKind(float ch, bool small, float graze, bool tun) {
  if (small) {
    return ch < ${CUM_S[0]} ? 9 : ch < ${CUM_S[1]} ? 10 : ch < ${CUM_S[2]} ? 2 : ch < ${CUM_S[3]} ? 3 : ch < ${CUM_S[4]} ? 8 :
      ch < ${CUM_S[5]} ? 0 : ch < ${CUM_S[6]} ? 5 : ch < ${CUM_S[7]} ? 4 : ch < ${CUM_S[8]} ? 6 : ch < ${CUM_S[9]} ? 7 : (tun ? 11 : 9);
  }
  if (graze >= 0.5) return ch < 0.6 ? 3 : ch < 0.85 ? 4 : 6;
  return ch < ${CUM_N[0]} ? 0 : ch < ${CUM_N[1]} ? 1 : ch < ${CUM_N[2]} ? 2 : ch < ${CUM_N[3]} ? 3 : ch < ${CUM_N[4]} ? 4 :
    ch < ${CUM_N[5]} ? 5 : ch < ${CUM_N[6]} ? 6 : ch < ${CUM_N[7]} ? 7 : 8;
}
`;
