// Lofted car bodies (compact, hatchback, saloon, SUV): one smooth shell swept along the car's length from
// cross-sections whose height follows the side profile (bonnet → windscreen → roof → rear window → boot),
// with a tumblehome greenhouse, rounded shoulders and sills, a nose / tail that round in plan, and wheel
// arches cut into the sides over dark wheel wells. Faces are coloured by region (paint, glass, dark trim,
// wells, SUV cladding), so the window outlines are crisp: stations sit on the pillar / screen edges and the
// ring has vertices on the belt line and the glass edges. Vehicle frame as in models.ts: +Z forward, y up,
// left = +X. Simplified with the level of detail (fewer stations, fewer ring points).

import * as THREE from 'three';

export interface CarShape {
  L: number;
  W: number;
  /** sill height (body bottom between the wheels) */
  sill: number;
  /** belt line (bottom of the side windows) and roof height */
  belt: number;
  roof: number;
  /** the roof falls this much from the windscreen top to the rear window (hatchbacks) */
  roofDrop?: number;
  /** bonnet height at the nose and at the windscreen base */
  noseH: number;
  hoodH: number;
  /** windscreen base / top, rear window top / base (z) */
  wsBase: number;
  wsTop: number;
  rwTop: number;
  rwBase: number;
  /** boot height at the rear window base and at the tail */
  deckH: number;
  tailH: number;
  /** B pillar (z), an optional C pillar (between rear door glass and quarter light), rear end of the side glass */
  pillarB: number;
  pillarC?: number;
  glassRear: number;
  /** greenhouse inset at the roof (m each side) */
  tumble: number;
  /** wheel arches: axle z, wheel radius */
  axF: number;
  axR: number;
  wheelR: number;
  /** dark plastic cladding along the bottom and round the arches (SUV) */
  clad?: boolean;
}

export type LoftRegion = 'body' | 'glass' | 'trim' | 'seal' | 'well' | 'clad' | 'bumper' | 'gap';
export type LoftParts = Record<LoftRegion, THREE.BufferGeometry | null>;

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** height of the body top along z (side profile) */
export function topAt(s: CarShape, z: number): number {
  const h = s.L / 2;
  if (z >= s.wsBase) {
    // bonnet: rises from the nose, rounded over the front
    const t = (h - z) / Math.max(0.01, h - s.wsBase);
    const front = smooth((h - z) / 0.3);
    return s.noseH + (s.hoodH - s.noseH) * Math.min(1, 0.55 * front + 0.45 * t);
  }
  if (z >= s.wsTop) {
    // windscreen: a slightly convex rise
    const t = (s.wsBase - z) / (s.wsBase - s.wsTop);
    return s.hoodH + (s.roof - s.hoodH) * Math.sin((t * Math.PI) / 2);
  }
  const drop = s.roofDrop ?? 0;
  if (z >= s.rwTop) {
    // roof, crowned a little
    const t = (z - s.rwTop) / Math.max(0.01, s.wsTop - s.rwTop);
    return s.roof - drop * (1 - t) * (1 - t * 0.5) + 0.015 * Math.sin(t * Math.PI);
  }
  if (z >= s.rwBase) {
    const t = (s.rwTop - z) / Math.max(0.01, s.rwTop - s.rwBase);
    const r0 = s.roof - drop;
    return r0 + (s.deckH - r0) * (1 - Math.cos((t * Math.PI) / 2));
  }
  // boot to the tail
  const t = (s.rwBase - z) / Math.max(0.01, s.rwBase + h);
  const rear = smooth((z + h) / 0.2);
  return s.tailH + (s.deckH - s.tailH) * Math.min(1, 0.6 * rear + 0.4 * (1 - t));
}

/** half width in plan along z: a slight taper over the overhangs (the corners round in the end zones below) */
function halfWidthAt(s: CarShape, z: number): number {
  const d = s.L / 2 - Math.abs(z);
  const k = d < 0.6 ? 1 - d / 0.6 : 0;
  return s.W / 2 - 0.03 * k * k;
}

/** body bottom along z: sill, a little rise at the overhangs (wheel arches excluded) */
function sillAt(s: CarShape, z: number): number {
  const ra = s.wheelR + 0.075;
  const h = s.L / 2;
  const over = Math.max(0, z - (s.axF + ra + 0.05), s.axR - ra - 0.05 - z) / Math.max(0.1, h - s.axF - ra);
  return s.sill + 0.06 * Math.min(1, over);
}

/** lower edge of the body side: the sill, cut up round the wheels */
function archAt(s: CarShape, z: number): number {
  let y = sillAt(s, z);
  const ra = s.wheelR + 0.075;
  for (const az of [s.axF, s.axR]) {
    const dz = z - az;
    if (Math.abs(dz) < ra) y = Math.max(y, s.wheelR + Math.sqrt(ra * ra - dz * dz) * 0.93);
  }
  return y;
}

/** top of the bumpers (the seam between bumper and wing / quarter panel) */
export const bumperTop = (s: CarShape): number => s.sill + 0.27;

// End zones: every ring point (0 bottom centre … 9 roof centre) has its own end, set back from the car's end
// by `sb` (the fascia rakes back above the bumper, the chin tucks under), and over the last `r` metres before
// it rounds in plan by `ix` and in elevation by `dy` along a quarter ellipse. The bumper line (point 3) reaches
// furthest; the bonnet rolls down into the fascia; the corners round in plan, so the nose is no box.
interface EndProfile {
  sb: number[];
  ix: number[];
  dy: number[];
  r: number[];
}
const NOSE: EndProfile = {
  sb: [0.08, 0.08, 0.04, 0, 0.045, 0.095, 0.11, 0.115, 0.12, 0.125],
  ix: [0, 0.05, 0.14, 0.17, 0.19, 0.21, 0.21, 0.2, 0.17, 0],
  dy: [0.03, 0.03, 0.025, 0, 0, -0.02, -0.045, -0.05, -0.06, -0.065],
  r: [0.12, 0.2, 0.38, 0.44, 0.44, 0.38, 0.3, 0.26, 0.24, 0.22],
};
const TAIL: EndProfile = {
  sb: [0.07, 0.07, 0.035, 0, 0.03, 0.05, 0.055, 0.06, 0.06, 0.06],
  ix: [0, 0.05, 0.12, 0.15, 0.16, 0.17, 0.17, 0.16, 0.14, 0],
  dy: [0.025, 0.025, 0.01, 0, 0, -0.01, -0.025, -0.03, -0.037, -0.042],
  r: [0.1, 0.18, 0.32, 0.36, 0.36, 0.32, 0.22, 0.18, 0.16, 0.15],
};
const ZONE = 0.5;
const RING = 10;
/** the ends also curve in plan across their whole width: set-back at the corners relative to the centre */
const SWEEP_NOSE = 0.07,
  SWEEP_TAIL = 0.05;
const sweepAt = (s: CarShape, x: number, d: number, sg: number) => (sg > 0 ? SWEEP_NOSE : SWEEP_TAIL) * ((2 * x) / s.W) ** 2 * smooth(1 - d / ZONE);

const quarter = (u: number) => (u >= 1 ? 0 : 1 - Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u))));

/** the 10 ring points (one side, x ≥ 0) at station z → P[k*3 .. k*3+2] = x, y, z; returns the profile top */
function ringAt(s: CarShape, z: number, P: Float64Array): number {
  const h = s.L / 2;
  const ra = s.wheelR + 0.075;
  const w = halfWidthAt(s, z);
  const T = topAt(s, z);
  const yb = sillAt(s, z);
  const y0 = archAt(s, z);
  const belt = Math.min(T - 0.03, s.belt);
  // greenhouse blend: 0 on the bonnet / boot deck, 1 where the glass stands clear of the belt
  const c = smooth(clamp01((T - s.belt - 0.05) / 0.14));
  const wt = w - s.tumble * clamp01((T - s.belt) / Math.max(0.05, s.roof - s.belt));
  // flared wheel arches: the wing bulges out round each wheel, most at the arch lip
  let fl = 0;
  for (const az of [s.axF, s.axR]) fl = Math.max(fl, smooth(1 - Math.abs(z - az) / (ra + 0.22)));
  fl *= s.clad ? 0.032 : 0.022;
  // the bumper line runs level from each arch to the end
  const bz = Math.max(smooth((z - (s.axF + ra - 0.06)) / 0.1), smooth((s.axR - ra + 0.06 - z) / 0.1));
  const by = Math.max(y0 + 0.16, y0 + 0.16 + (bumperTop(s) - y0 - 0.16) * bz);
  const set = (k: number, x: number, y: number) => {
    P[k * 3] = x;
    P[k * 3 + 1] = y;
    P[k * 3 + 2] = z;
  };
  const lerp = (a: number, b: number) => a + (b - a) * c;
  set(0, 0, yb);
  set(1, w - 0.27, yb);
  // the flank is a curved surface, not a slab: the lower door tucks under towards the sill, the shoulder (4) is
  // the widest line and rolls in over the top to the belt, where the side glass starts leaning in (tumblehome)
  set(2, w - 0.062 + fl, Math.min(y0 + 0.05 - 0.02 * bz, belt - 0.2));
  set(3, w - 0.02 + fl * 0.85, Math.min(by, belt - 0.17));
  set(4, w + 0.008 + fl * 0.3, belt - 0.15);
  set(5, w - 0.026, belt);
  set(6, lerp(w - 0.05, w - 0.046), lerp(T - 0.008, belt + 0.03));
  set(7, lerp(w - 0.09, wt + 0.015), lerp(T, Math.max(belt + 0.035, T - 0.05)));
  // crowned bonnet / boot lid / roof
  set(8, lerp(w - 0.3, wt - 0.09), T + lerp(0.018, 0.004));
  set(9, 0, T + 0.033);
  // end zones
  const d = h - Math.abs(z);
  if (d < ZONE) {
    const e = z > 0 ? NOSE : TAIL;
    const sg = z > 0 ? 1 : -1;
    let rMax = ZONE;
    // the tail's upper points round only within the boot deck (hatchbacks / SUVs end in the tailgate glass)
    if (z < 0) rMax = Math.max(0.06, h + s.rwBase - 0.07);
    for (let k = 0; k < RING; k++) {
      const sb = e.sb[k];
      const ek = (d - ZONE) * ((ZONE - sb) / ZONE) + ZONE - sb; // the point's own distance to its end
      const r = k >= 6 ? Math.min(e.r[k], rMax) : e.r[k];
      const f = quarter(ek / r);
      P[k * 3] = Math.max(0, P[k * 3] - e.ix[k] * f);
      P[k * 3 + 1] += e.dy[k] * f;
      P[k * 3 + 2] = sg * (h - sb - ek - sweepAt(s, P[k * 3], d, sg));
    }
  }
  return T;
}

// ring points (one side, bottom centre → roof centre):
// 0 bottom centre, 1 bottom inner (wheel-well wall), 2 sill corner / arch edge, 3 lower side / bumper top,
// 4 widest, 5 shoulder (belt), 6 glass bottom, 7 glass top, 8 roof / bonnet crown, 9 roof centre
const KEEP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 2, 3, 5, 7, 8, 9],
  [0, 2, 5, 7, 8, 9],
];

const _P = new Float64Array(RING * 3);

/**
 * The end surface (front: sign 1, rear: −1) at (x, y): z and the outward normal, for lamps, grilles and plates.
 * y must lie between the bottom lip and the shoulder (ring points 1 … 5).
 */
export function endSurface(s: CarShape, x: number, y: number, sign: number): { z: number; n: THREE.Vector3 } {
  const zAt = (ax: number, yy: number) => {
    const h = s.L / 2;
    let px = 0,
      pz = 0;
    for (let i = 0; i <= 40; i++) {
      const d = (ZONE * i) / 40;
      ringAt(s, sign * (h - d), _P);
      // the side's x and z at height yy (points 1 … 5 rise monotonically)
      let k = 1;
      while (k < 4 && _P[(k + 1) * 3 + 1] < yy) k++;
      const ya = _P[k * 3 + 1],
        yb2 = _P[(k + 1) * 3 + 1];
      const t = clamp01((yy - ya) / Math.max(1e-4, yb2 - ya));
      const xx = _P[k * 3] + (_P[(k + 1) * 3] - _P[k * 3]) * t;
      const zz = _P[k * 3 + 2] + (_P[(k + 1) * 3 + 2] - _P[k * 3 + 2]) * t;
      if (i === 0 && ax <= xx) return zz + (sign * ((sign > 0 ? SWEEP_NOSE : SWEEP_TAIL) * 4 * (xx * xx - ax * ax))) / (s.W * s.W); // on the end cap
      if (ax <= xx) {
        const u = (ax - px) / Math.max(1e-5, xx - px);
        return pz + (zz - pz) * u;
      }
      px = xx;
      pz = zz;
    }
    return pz;
  };
  const ax = Math.abs(x);
  const z = zAt(ax, y);
  const e = 0.01;
  const fx = ((zAt(ax + e, y) - zAt(Math.max(0, ax - e), y)) / (ax + e - Math.max(0, ax - e))) * (x < 0 ? -1 : 1);
  const fy = (zAt(ax, y + e) - zAt(ax, y - e)) / (2 * e);
  const n = sign > 0 ? new THREE.Vector3(-fx, -fy, 1) : new THREE.Vector3(fx, fy, -1);
  return { z, n: n.normalize() };
}

/** the last ring at an end (sign 1 front, −1 rear): x, y, z of ring points 0 … 9 */
export function endRing(s: CarShape, sign: number): Float64Array {
  const P = new Float64Array(RING * 3);
  ringAt(s, (sign * s.L) / 2, P);
  return P;
}

export function loftCar(s: CarShape, lod: number): LoftParts {
  const h = s.L / 2;
  const ra = s.wheelR + 0.075;
  // stations: uniform + the edges the window outlines and the arches run along + dense end zones
  const nU = lod === 0 ? 30 : lod === 1 ? 8 : 4;
  const zs: number[] = [];
  for (let i = 0; i <= nU; i++) zs.push(-h + (s.L * i) / nU);
  const keys = [s.wsBase, s.wsTop, s.rwTop, s.rwBase, s.glassRear];
  if (lod < 2) {
    keys.push(s.pillarB - 0.05, s.pillarB + 0.05);
    if (s.pillarC !== undefined) keys.push(s.pillarC - 0.035, s.pillarC + 0.035);
  }
  const arch = lod === 0 ? [-1, -0.82, -0.58, -0.3, 0, 0.3, 0.58, 0.82, 1] : lod === 1 ? [-1, -0.62, 0, 0.62, 1] : [-1, 0, 1];
  for (const az of [s.axF, s.axR]) for (const d of arch) keys.push(az + d * ra);
  const ends = lod === 0 ? [0.006, 0.02, 0.04, 0.065, 0.1, 0.14, 0.19, 0.25, 0.32, 0.4] : lod === 1 ? [0.03, 0.1, 0.22, 0.38] : [0.08, 0.25];
  for (const d of ends) keys.push(h - d, -h + d);
  for (const k of keys) if (k > -h + 0.003 && k < h - 0.003) zs.push(k);
  zs.sort((a, b) => a - b);
  for (let i = zs.length - 2; i > 0; i--) if (zs[i] - zs[i - 1] < (Math.abs(zs[i]) > h - 0.08 ? 0.004 : 0.02)) zs.splice(i, 1);

  const keep = KEEP[Math.min(2, lod)];
  const R = keep.length;
  const full = new Float64Array(RING * 3);
  const NS = zs.length;
  // full ring: left half (x > 0) from the roof centre down to the bottom centre, then the right half (x < 0)
  // back up to its roof edge: 2R − 2 unique points
  const RU = 2 * R - 2;
  const P = new Float64Array(NS * RU * 3);
  const Ts: number[] = [];
  for (let j = 0; j < NS; j++) {
    Ts.push(ringAt(s, zs[j], full));
    for (let i = 0; i < RU; i++) {
      const left = i < R;
      const k = keep[left ? R - 1 - i : i - R + 1];
      const o = (j * RU + i) * 3;
      P[o] = left ? full[k * 3] : -full[k * 3];
      P[o + 1] = full[k * 3 + 1];
      P[o + 2] = full[k * 3 + 2];
    }
  }
  // smooth normals from the grid: (along z) × (round the ring) points outwards with this ring order
  const N = new Float64Array(P.length);
  for (let j = 0; j < NS; j++)
    for (let i = 0; i < RU; i++) {
      const oi0 = (j * RU + ((i - 1 + RU) % RU)) * 3,
        oi1 = (j * RU + ((i + 1) % RU)) * 3,
        oj0 = (Math.max(0, j - 1) * RU + i) * 3,
        oj1 = (Math.min(NS - 1, j + 1) * RU + i) * 3;
      const ax = P[oi1] - P[oi0],
        ay = P[oi1 + 1] - P[oi0 + 1],
        az = P[oi1 + 2] - P[oi0 + 2];
      const bx = P[oj1] - P[oj0],
        by = P[oj1 + 1] - P[oj0 + 1],
        bz = P[oj1 + 2] - P[oj0 + 2];
      let nx = by * az - bz * ay,
        ny = bz * ax - bx * az,
        nz = bx * ay - by * ax;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (j * RU + i) * 3;
      N[o] = nx;
      N[o + 1] = ny;
      N[o + 2] = nz;
    }

  const out: Record<LoftRegion, { p: number[]; n: number[] }> = {
    body: { p: [], n: [] },
    glass: { p: [], n: [] },
    trim: { p: [], n: [] },
    seal: { p: [], n: [] },
    well: { p: [], n: [] },
    clad: { p: [], n: [] },
    bumper: { p: [], n: [] },
    gap: { p: [], n: [] },
  };
  const vert = (g: LoftRegion, j: number, i: number) => {
    const o = (j * RU + (i % RU)) * 3;
    out[g].p.push(P[o], P[o + 1], P[o + 2]);
    out[g].n.push(N[o], N[o + 1], N[o + 2]);
  };
  const ringIdx = (i: number) => keep[i < R ? R - 1 - i : i - R + 1];
  const tall = s.belt + 0.12;
  const bumpF = s.axF + ra - 0.02,
    bumpR = s.axR - ra + 0.02;
  for (let j = 0; j < NS - 1; j++) {
    const zc = (zs[j] + zs[j + 1]) / 2;
    const screen = zc > s.wsTop + 0.02 && zc < s.wsBase - 0.02;
    const rear = zc > s.rwBase + 0.02 && zc < s.rwTop - 0.02;
    const sideGlass = Ts[j] > tall && Ts[j + 1] > tall && zc > s.glassRear && zc < s.wsBase;
    const pillar = Math.abs(zc - s.pillarB) < 0.05 || (s.pillarC !== undefined && Math.abs(zc - s.pillarC) < 0.035);
    const inArch = Math.abs(zc - s.axF) < ra || Math.abs(zc - s.axR) < ra;
    const bumper = zc > bumpF || zc < bumpR;
    for (let i = 0; i < RU; i++) {
      const k0 = ringIdx(i),
        k1 = ringIdx((i + 1) % RU);
      const a = Math.min(k0, k1),
        b = Math.max(k0, k1);
      // the flat underside is never seen from above the sill: only the wheel-well walls are kept
      if (a === 0 && (b === 1 || !inArch)) continue;
      // the bands (a, a+1) … (b−1, b) this face covers; pick the most telling one
      let g: LoftRegion = 'body';
      if (a <= 6 && b >= 7) g = sideGlass ? (pillar ? 'trim' : 'glass') : 'body';
      else if (a >= 8) g = screen || rear ? 'glass' : 'body';
      else if (bumper && a >= 1 && b <= 3) g = 'bumper';
      else if (b <= 2) g = 'well';
      else if (a === 5 && b === 6) g = pillar ? 'trim' : sideGlass ? 'seal' : 'body';
      else if (s.clad && a >= 1 && b <= 3) g = 'clad';
      // two triangles per quad (wound outwards below)
      vert(g, j, i);
      vert(g, j, i + 1);
      vert(g, j + 1, i + 1);
      vert(g, j, i);
      vert(g, j + 1, i + 1);
      vert(g, j + 1, i);
    }
  }
  // end caps: horizontal bands across the last ring, curved in plan (bumper below the seam)
  const A = new THREE.Vector3(),
    B = new THREE.Vector3(),
    C = new THREE.Vector3();
  const nC = lod === 0 ? 8 : lod === 1 ? 3 : 1;
  const sw = (sg: number) => (sg > 0 ? SWEEP_NOSE : SWEEP_TAIL) * 4 / (s.W * s.W);
  for (const j of [0, NS - 1]) {
    const sg = j === 0 ? -1 : 1;
    const k2 = sw(sg);
    const pt = (k: number) => {
      const o = (j * RU + R - 1 - keep.indexOf(k)) * 3;
      return [P[o], P[o + 1], P[o + 2]];
    };
    for (let q = 0; q < R - 1; q++) {
      const ka = keep[q],
        kb = keep[q + 1];
      const g: LoftRegion = kb <= 3 && ka >= 1 ? 'bumper' : 'body';
      const a = pt(ka),
        b = pt(kb);
      if (Math.abs(a[1] - b[1]) < 1e-4 && Math.abs(a[2] - b[2]) < 1e-4) continue;
      const dzdy = (b[2] - a[2]) / Math.max(1e-4, b[1] - a[1]);
      // a point across the cap at fraction u (−1 right … 1 left) of the band's half-widths, curved in plan
      const at = (e: number[], u: number) => {
        const x = e[0] * u;
        return [x, e[1], e[2] + sg * k2 * (e[0] * e[0] - x * x)];
      };
      const nrm = (x: number) => {
        const dzdx = -sg * 2 * k2 * x;
        A.set(-dzdx * sg, -dzdy * sg, sg).normalize();
        return [A.x, A.y, A.z];
      };
      for (let c = 0; c < nC * 2; c++) {
        const u0 = -1 + c / nC,
          u1 = -1 + (c + 1) / nC;
        const p00 = at(a, u0),
          p01 = at(a, u1),
          p10 = at(b, u0),
          p11 = at(b, u1);
        for (const v of [p00, p01, p11, p00, p11, p10]) {
          out[g].p.push(v[0], v[1], v[2]);
          out[g].n.push(...nrm(v[0]));
        }
      }
    }
  }
  // the shut line between the bumpers and the body: a thin dark strip just proud of ring point 3
  if (lod === 0) {
    const i3L = R - 1 - keep.indexOf(3),
      i3R = R - 1 + keep.indexOf(3);
    const strip = (j0: number, j1: number, i: number) => {
      for (const [j, up] of [
        [j0, 0],
        [j1, 0],
        [j1, 1],
        [j0, 0],
        [j1, 1],
        [j0, 1],
      ]) {
        const o = (j * RU + i) * 3;
        out.gap.p.push(P[o] + N[o] * 0.0015, P[o + 1] + N[o + 1] * 0.0015 + up * 0.009, P[o + 2] + N[o + 2] * 0.0015);
        out.gap.n.push(N[o], N[o + 1], N[o + 2]);
      }
    };
    for (let j = 0; j < NS - 1; j++) {
      const zc = (zs[j] + zs[j + 1]) / 2;
      if (zc < bumpF + 0.03 && zc > bumpR - 0.03) continue;
      strip(j, j + 1, i3L);
      strip(j, j + 1, i3R);
    }
    // across the end caps
    for (const j of [0, NS - 1]) {
      const sg = j === 0 ? -1 : 1;
      const oL = (j * RU + i3L) * 3,
        oR = (j * RU + i3R) * 3;
      const y = P[oL + 1],
        xe = P[oL],
        k2 = sw(sg);
      for (let c = 0; c < nC * 2; c++) {
        const x0 = xe * (-1 + c / nC),
          x1 = xe * (-1 + (c + 1) / nC);
        const z0 = P[oL + 2] + sg * (0.0015 + k2 * (xe * xe - x0 * x0)),
          z1 = P[oL + 2] + sg * (0.0015 + k2 * (xe * xe - x1 * x1));
        out.gap.p.push(x0, y, z0, x1, y, z1, x1, y + 0.009, z1, x0, y, z0, x1, y + 0.009, z1, x0, y + 0.009, z0);
        for (let e = 0; e < 6; e++) out.gap.n.push(0, 0, sg);
      }
      void oR;
    }
  }
  const mk = (r: { p: number[]; n: number[] }): THREE.BufferGeometry | null => {
    if (r.p.length === 0) return null;
    const p = r.p,
      n = r.n;
    // winding: every triangle faces along its vertex normals
    for (let t = 0; t < p.length; t += 9) {
      A.set(p[t], p[t + 1], p[t + 2]);
      B.set(p[t + 3] - A.x, p[t + 4] - A.y, p[t + 5] - A.z);
      C.set(p[t + 6] - A.x, p[t + 7] - A.y, p[t + 8] - A.z);
      B.cross(C);
      if (B.x * (n[t] + n[t + 3] + n[t + 6]) + B.y * (n[t + 1] + n[t + 4] + n[t + 7]) + B.z * (n[t + 2] + n[t + 5] + n[t + 8]) < 0)
        for (const q of [p, n])
          for (let e = 0; e < 3; e++) {
            const x = q[t + 3 + e];
            q[t + 3 + e] = q[t + 6 + e];
            q[t + 6 + e] = x;
          }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    return g;
  };
  return {
    body: mk(out.body),
    glass: mk(out.glass),
    trim: mk(out.trim),
    seal: mk(out.seal),
    well: mk(out.well),
    clad: mk(out.clad),
    bumper: mk(out.bumper),
    gap: mk(out.gap),
  };
}
