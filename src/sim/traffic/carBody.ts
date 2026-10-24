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

export type LoftRegion = 'body' | 'glass' | 'trim' | 'well' | 'clad';
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

/** half width in plan along z: the nose and tail round in */
function halfWidthAt(s: CarShape, z: number): number {
  const d = s.L / 2 - Math.abs(z);
  const k = d < 0.38 ? 1 - d / 0.38 : 0;
  return s.W / 2 - 0.085 * k * k - (d < 0.05 ? 0.05 * (1 - d / 0.05) : 0);
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

// ring points (one side, bottom centre → roof centre):
// 0 bottom centre, 1 bottom inner (wheel-well wall), 2 sill corner / arch edge, 3 lower side, 4 widest,
// 5 shoulder (belt), 6 glass bottom, 7 glass top, 8 roof edge, 9 roof centre
const KEEP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 2, 3, 5, 7, 8, 9],
  [0, 2, 5, 7, 8, 9],
];

export function loftCar(s: CarShape, lod: number): LoftParts {
  const h = s.L / 2;
  const ra = s.wheelR + 0.075;
  // stations: uniform + the edges the window outlines and the arches run along
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
  for (const k of keys) if (k > -h + 0.03 && k < h - 0.03) zs.push(k);
  zs.sort((a, b) => a - b);
  for (let i = zs.length - 2; i > 0; i--) if (zs[i] - zs[i - 1] < 0.02) zs.splice(i, 1);

  const keep = KEEP[Math.min(2, lod)];
  const R = keep.length;
  const full = new Float64Array(20);
  const ring = (z: number) => {
    const w = halfWidthAt(s, z);
    const T = topAt(s, z);
    const yb = sillAt(s, z);
    const y0 = archAt(s, z);
    const belt = Math.min(T - 0.03, s.belt);
    // greenhouse blend: 0 on the bonnet / boot deck, 1 where the glass stands clear of the belt
    const c = smooth(clamp01((T - s.belt - 0.05) / 0.14));
    const wt = w - s.tumble * clamp01((T - s.belt) / Math.max(0.05, s.roof - s.belt));
    const P = full;
    const set = (k: number, x: number, y: number) => {
      P[k * 2] = x;
      P[k * 2 + 1] = y;
    };
    set(0, 0, yb);
    set(1, w - 0.27, yb);
    set(2, w - 0.03, Math.min(y0 + 0.05, belt - 0.2));
    set(3, w, Math.min(y0 + 0.16, belt - 0.17));
    set(4, w + 0.005, belt - 0.15);
    set(5, w - 0.012, belt);
    const lerp = (a: number, b: number) => a + (b - a) * c;
    set(6, lerp(w - 0.045, w - 0.035), lerp(T - 0.008, belt + 0.03));
    set(7, lerp(w - 0.09, wt + 0.015), lerp(T, Math.max(belt + 0.035, T - 0.05)));
    set(8, lerp(w - 0.16, wt - 0.07), T + 0.004 * (1 - c));
    set(9, 0, T + 0.012);
    return T;
  };

  const NS = zs.length;
  // full ring: left half (x > 0) from the roof centre down to the bottom centre, then the right half (x < 0)
  // back up to its roof edge: 2R − 2 unique points
  const RU = 2 * R - 2;
  const P = new Float64Array(NS * RU * 3);
  const Ts: number[] = [];
  for (let j = 0; j < NS; j++) {
    Ts.push(ring(zs[j]));
    for (let i = 0; i < RU; i++) {
      const left = i < R;
      const k = keep[left ? R - 1 - i : i - R + 1];
      const o = (j * RU + i) * 3;
      P[o] = left ? full[k * 2] : -full[k * 2];
      P[o + 1] = full[k * 2 + 1];
      P[o + 2] = zs[j];
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
    well: { p: [], n: [] },
    clad: { p: [], n: [] },
  };
  const vert = (g: LoftRegion, j: number, i: number) => {
    const o = (j * RU + (i % RU)) * 3;
    out[g].p.push(P[o], P[o + 1], P[o + 2]);
    out[g].n.push(N[o], N[o + 1], N[o + 2]);
  };
  const ringIdx = (i: number) => keep[i < R ? R - 1 - i : i - R + 1];
  const tall = s.belt + 0.12;
  for (let j = 0; j < NS - 1; j++) {
    const zc = (zs[j] + zs[j + 1]) / 2;
    const screen = zc > s.wsTop + 0.02 && zc < s.wsBase - 0.02;
    const rear = zc > s.rwBase + 0.02 && zc < s.rwTop - 0.02;
    const sideGlass = Ts[j] > tall && Ts[j + 1] > tall && zc > s.glassRear && zc < s.wsBase;
    const pillar = Math.abs(zc - s.pillarB) < 0.05 || (s.pillarC !== undefined && Math.abs(zc - s.pillarC) < 0.035);
    const inArch = Math.abs(zc - s.axF) < ra || Math.abs(zc - s.axR) < ra;
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
      else if (b <= 2) g = 'well';
      else if (a === 5 && b === 6) g = sideGlass || pillar ? 'trim' : 'body';
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
  // end caps: fans to the section's centre
  for (const j of [0, NS - 1]) {
    let cy = 0;
    for (let i = 0; i < RU; i++) cy += P[(j * RU + i) * 3 + 1];
    cy /= RU;
    const z = zs[j];
    const nz = j === 0 ? -1 : 1;
    for (let i = 0; i < RU; i++) {
      const o0 = (j * RU + i) * 3,
        o1 = (j * RU + ((i + 1) % RU)) * 3;
      out.body.p.push(0, cy, z, P[o0], P[o0 + 1], z, P[o1], P[o1 + 1], z);
      out.body.n.push(0, 0, nz, 0, 0, nz, 0, 0, nz);
    }
  }
  const A = new THREE.Vector3(),
    B = new THREE.Vector3(),
    C = new THREE.Vector3();
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
  return { body: mk(out.body), glass: mk(out.glass), trim: mk(out.trim), well: mk(out.well), clad: mk(out.clad) };
}
