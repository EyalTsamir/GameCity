// Lofted city-bus shell: cross-sections swept along the length (+Z forward, y up, left = +X), flat flanks with
// the wheel arches cut into the skirt, corners that round in plan at both ends, the roof edge rolled over the
// front and rear, and a wrap-round windscreen that is part of the shell (region 'glass', so its edge follows the
// curved corners). Regions: skirt (route colour), body (cream), bumper (dark), glass, seal (dark), well.

import * as THREE from 'three';

export interface BusShape {
  L: number;
  W: number;
  /** body bottom, bumper top, skirt top, windscreen bottom / top, roof */
  y0: number;
  bump: number;
  skirt: number;
  ws0: number;
  ws1: number;
  roof: number;
  axles: number[];
  /** wheel arch radius and centre height */
  ra: number;
  ay: number;
  /** optional end profiles (default: the city bus); a cab uses its own nose (bonnet, raked windscreen) and a flat tail */
  nose?: EndProfile;
  tail?: EndProfile;
  /** roof-edge roll: inset and drop of ring point 8 (default 0.07 / 0.06) */
  roofIn?: number;
  roofDrop?: number;
  /** side glass leaning in: inset of ring point 7 (windscreen top / side glass top) — tumblehome (default 0) */
  tumble?: number;
  /** depth of the nose zone whose band 6–7 is glass (default 0.24) */
  glassD?: number;
}

/** per ring point: set-back, plan inset, vertical shift, rounding length; zone depth and plan sweep of the end */
export interface EndProfile {
  sb: number[];
  ix: number[];
  dy: number[];
  r: number[];
  zone: number;
  sweep: number;
}

export type BusRegion = 'body' | 'skirt' | 'bumper' | 'glass' | 'seal' | 'well';

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const quarter = (u: number) => (u >= 1 ? 0 : 1 - Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u))));
const RING = 10;
const ZONE = 0.45;
// end profiles per ring point (0 bottom centre, 1 bottom inner, 2 skirt edge, 3 skirt lip, 4 bumper top, 5 skirt top,
// 6 windscreen bottom, 7 windscreen top, 8 roof edge, 9 roof centre): set-back, plan inset, vertical shift, length
const NOSE: EndProfile = {
  zone: ZONE,
  sweep: 0.035,
  sb: [0.03, 0.03, 0.0, 0.0, 0.0, 0.03, 0.04, 0.1, 0.13, 0.14],
  ix: [0, 0.12, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.2, 0],
  dy: [0, 0, 0, 0, 0, 0, 0, 0, -0.06, -0.09],
  r: [0.2, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.2, 0.15],
};
const TAIL: EndProfile = {
  zone: ZONE,
  sweep: 0.035,
  sb: [0.03, 0.03, 0.0, 0.0, 0.0, 0.015, 0.02, 0.04, 0.07, 0.08],
  ix: [0, 0.1, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.17, 0],
  dy: [0, 0, 0, 0, 0, 0, 0, 0, -0.05, -0.07],
  r: [0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.17, 0.12],
};

function edgeAt(s: BusShape, z: number): number {
  let y = s.y0;
  for (const az of s.axles) {
    const dz = z - az;
    if (Math.abs(dz) < s.ra) y = Math.max(y, s.ay + Math.sqrt(s.ra * s.ra - dz * dz) * 0.97);
  }
  return y;
}

function ringAt(s: BusShape, z: number, P: Float64Array): void {
  const hw = s.W / 2,
    h = s.L / 2;
  const ye = edgeAt(s, z);
  const pts = [
    [0, s.y0],
    [hw - 0.3, s.y0],
    [hw - 0.015, ye],
    [hw, ye + 0.04],
    [hw, Math.max(s.bump, ye + 0.08)],
    [hw, Math.max(s.skirt, ye + 0.12)],
    [hw, s.ws0],
    [hw - (s.tumble ?? 0), s.ws1],
    [hw - (s.roofIn ?? 0.07), s.roof - (s.roofDrop ?? 0.06)],
    [0, s.roof],
  ];
  const d = h - Math.abs(z);
  const sg = z > 0 ? 1 : -1;
  const e = z > 0 ? s.nose ?? NOSE : s.tail ?? TAIL;
  const Z = e.zone;
  for (let k = 0; k < RING; k++) {
    let x = pts[k][0],
      y = pts[k][1],
      zz = z;
    if (d < Z) {
      const ek = (d - Z) * ((Z - e.sb[k]) / Z) + Z - e.sb[k];
      const f = quarter(ek / e.r[k]);
      x = Math.max(0, x - e.ix[k] * f);
      y += e.dy[k] * f;
      zz = sg * (h - e.sb[k] - ek - e.sweep * ((2 * x) / s.W) ** 2 * smooth(1 - d / Z));
    }
    P[k * 3] = x;
    P[k * 3 + 1] = y;
    P[k * 3 + 2] = zz;
  }
}

const _P = new Float64Array(RING * 3);

/** the end surface (sign 1 front, −1 rear) at (x, y), y between the skirt edge and the windscreen top */
export function busEndSurface(s: BusShape, x: number, y: number, sign: number): { z: number; n: THREE.Vector3 } {
  const h = s.L / 2;
  const e = sign > 0 ? s.nose ?? NOSE : s.tail ?? TAIL;
  const zAt = (ax: number, yy: number) => {
    let px = 0,
      pz = 0;
    for (let i = 0; i <= 36; i++) {
      const d = (e.zone * i) / 36;
      ringAt(s, sign * (h - d), _P);
      let k = 2;
      while (k < 7 && _P[(k + 1) * 3 + 1] < yy) k++;
      const ya = _P[k * 3 + 1],
        yb = _P[(k + 1) * 3 + 1];
      const t = Math.min(1, Math.max(0, (yy - ya) / Math.max(1e-4, yb - ya)));
      const xx = _P[k * 3] + (_P[(k + 1) * 3] - _P[k * 3]) * t;
      const zz = _P[k * 3 + 2] + (_P[(k + 1) * 3 + 2] - _P[k * 3 + 2]) * t;
      if (i === 0 && ax <= xx) return zz + (sign * e.sweep * 4 * (xx * xx - ax * ax)) / (s.W * s.W);
      if (ax <= xx) return pz + ((zz - pz) * (ax - px)) / Math.max(1e-5, xx - px);
      px = xx;
      pz = zz;
    }
    return pz;
  };
  const ax = Math.abs(x);
  const z = zAt(ax, y);
  const eps = 0.01;
  const fx = ((zAt(ax + eps, y) - zAt(Math.max(0, ax - eps), y)) / (ax + eps - Math.max(0, ax - eps))) * (x < 0 ? -1 : 1);
  const fy = (zAt(ax, y + eps) - zAt(ax, y - eps)) / (2 * eps);
  const n = sign > 0 ? new THREE.Vector3(-fx, -fy, 1) : new THREE.Vector3(fx, fy, -1);
  return { z, n: n.normalize() };
}

export function loftBus(s: BusShape, lod: number): Record<BusRegion, THREE.BufferGeometry | null> {
  const h = s.L / 2;
  const zs: number[] = [];
  const nU = lod === 0 ? 24 : lod === 1 ? 10 : 4;
  for (let i = 0; i <= nU; i++) zs.push(-h + (s.L * i) / nU);
  const arch = lod === 0 ? [-1, -0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85, 1] : lod === 1 ? [-1, -0.6, 0, 0.6, 1] : [-1, 0, 1];
  for (const az of s.axles) for (const a of arch) zs.push(az + a * s.ra);
  const ends = lod === 0 ? [0.005, 0.015, 0.03, 0.05, 0.08, 0.12, 0.17, 0.23, 0.32] : lod === 1 ? [0.03, 0.1, 0.25] : [0.1];
  const nz = (s.nose ?? NOSE).zone / ZONE,
    tz = (s.tail ?? TAIL).zone / ZONE;
  for (const d of ends) zs.push(h - d * nz, -h + d * tz);
  zs.sort((a, b) => a - b);
  for (let i = zs.length - 2; i > 0; i--) if (zs[i] - zs[i - 1] < 0.004) zs.splice(i, 1);
  const NS = zs.length;
  // full ring: left (x > 0) from the roof centre (9) down to the bottom centre (0), then the right half back up
  const RU = 2 * RING - 2;
  const kOf = (i: number) => (i < RING ? RING - 1 - i : i - RING + 1);
  const P = new Float64Array(NS * RU * 3);
  const ring = new Float64Array(RING * 3);
  for (let j = 0; j < NS; j++) {
    ringAt(s, zs[j], ring);
    for (let i = 0; i < RU; i++) {
      const k = kOf(i);
      const o = (j * RU + i) * 3;
      P[o] = i < RING ? ring[k * 3] : -ring[k * 3];
      P[o + 1] = ring[k * 3 + 1];
      P[o + 2] = ring[k * 3 + 2];
    }
  }
  // normals from the grid; the flanks keep crisp corners (flat sides, the roof edge and skirt edge are separate)
  const N = new Float64Array(P.length);
  for (let j = 0; j < NS; j++)
    for (let i = 0; i < RU; i++) {
      const o = (j * RU + i) * 3;
      const a0 = (j * RU + ((i - 1 + RU) % RU)) * 3,
        a1 = (j * RU + ((i + 1) % RU)) * 3,
        b0 = (Math.max(0, j - 1) * RU + i) * 3,
        b1 = (Math.min(NS - 1, j + 1) * RU + i) * 3;
      const ax = P[a1] - P[a0],
        ay = P[a1 + 1] - P[a0 + 1],
        az = P[a1 + 2] - P[a0 + 2];
      const bx = P[b1] - P[b0],
        by = P[b1 + 1] - P[b0 + 1],
        bz = P[b1 + 2] - P[b0 + 2];
      const nx = by * az - bz * ay,
        ny = bz * ax - bx * az,
        nz = bx * ay - by * ax;
      const l = Math.hypot(nx, ny, nz) || 1;
      N[o] = nx / l;
      N[o + 1] = ny / l;
      N[o + 2] = nz / l;
    }
  const out: Record<BusRegion, { p: number[]; n: number[] }> = {
    body: { p: [], n: [] },
    skirt: { p: [], n: [] },
    bumper: { p: [], n: [] },
    glass: { p: [], n: [] },
    seal: { p: [], n: [] },
    well: { p: [], n: [] },
  };
  // per-face normals on the flat flanks (|n.x| ≈ 1) keep the box corners crisp where the shell should be flat
  const push = (g: BusRegion, o: number, flat: number[] | null) => {
    out[g].p.push(P[o], P[o + 1], P[o + 2]);
    if (flat) out[g].n.push(flat[0], flat[1], flat[2]);
    else out[g].n.push(N[o], N[o + 1], N[o + 2]);
  };
  const fz = h - 0.24,
    gz = h - (s.glassD ?? 0.24),
    rz = -h + 0.2;
  const fFlat = h - Math.max(0.24, (s.nose ?? NOSE).zone * 0.55),
    rFlat = -h + Math.max(0.2, (s.tail ?? TAIL).zone * 0.45);
  for (let j = 0; j < NS - 1; j++) {
    const zc = (zs[j] + zs[j + 1]) / 2;
    const inArch = s.axles.some((az) => Math.abs(zc - az) < s.ra);
    const nose = zc > fz,
      tail = zc < rz;
    const curved = zc > fFlat || zc < rFlat;
    for (let i = 0; i < RU; i++) {
      const k0 = kOf(i),
        k1 = kOf((i + 1) % RU);
      const a = Math.min(k0, k1),
        b = Math.max(k0, k1);
      if (a === 0 && (b === 1 || !inArch)) continue;
      let g: BusRegion = 'body';
      if (b <= 2) g = 'well';
      else if (b <= 4) g = nose || tail ? 'bumper' : 'skirt';
      else if (b === 5) g = 'skirt';
      else if (a === 6 && b === 7 && zc > gz) g = 'glass';
      const o00 = (j * RU + i) * 3,
        o01 = (j * RU + ((i + 1) % RU)) * 3,
        o10 = ((j + 1) * RU + i) * 3,
        o11 = ((j + 1) * RU + ((i + 1) % RU)) * 3;
      // the flat flanks between the skirt lip and the windscreen top: one normal per face (no smoothing into the roof)
      const flank = a >= 3 && b <= 7 && !curved;
      let fn: number[] | null = null;
      if (flank) {
        // face normal (crisp corners; the side glass may lean in), facing out
        const ux = P[o11] - P[o00],
          uy = P[o11 + 1] - P[o00 + 1],
          uz = P[o11 + 2] - P[o00 + 2];
        const vx = P[o01] - P[o10],
          vy = P[o01 + 1] - P[o10 + 1],
          vz = P[o01 + 2] - P[o10 + 2];
        let nx = uy * vz - uz * vy,
          ny = uz * vx - ux * vz,
          nz = ux * vy - uy * vx;
        const l = (Math.hypot(nx, ny, nz) || 1) * (nx * P[o00] < 0 ? -1 : 1);
        nx /= l;
        ny /= l;
        nz /= l;
        fn = [nx, ny, nz];
      }
      push(g, o00, fn);
      push(g, o01, fn);
      push(g, o11, fn);
      push(g, o00, fn);
      push(g, o11, fn);
      push(g, o10, fn);
    }
  }
  // end caps: bands across the last ring, curved in plan
  const nC = lod === 0 ? 8 : lod === 1 ? 3 : 1;
  const A = new THREE.Vector3();
  for (const j of [0, NS - 1]) {
    const sg = j === 0 ? -1 : 1;
    const k2 = ((sg > 0 ? s.nose ?? NOSE : s.tail ?? TAIL).sweep * 4) / (s.W * s.W);
    const pt = (k: number) => {
      const o = (j * RU + RING - 1 - k) * 3;
      return [P[o], P[o + 1], P[o + 2]];
    };
    for (let k = 0; k < RING - 1; k++) {
      const a = pt(k),
        b = pt(k + 1);
      if (Math.abs(a[1] - b[1]) < 1e-4 && Math.abs(a[2] - b[2]) < 1e-4) continue;
      let g: BusRegion = 'body';
      if (k + 1 <= 2) g = 'bumper';
      else if (k + 1 <= 4) g = 'bumper';
      else if (k + 1 === 5) g = 'skirt';
      else if (k === 6 && sg > 0) g = 'glass';
      const dzdy = (b[2] - a[2]) / Math.max(1e-4, b[1] - a[1]);
      const at = (e: number[], u: number) => {
        const x = e[0] * u;
        return [x, e[1], e[2] + sg * k2 * (e[0] * e[0] - x * x)];
      };
      for (let c = 0; c < nC * 2; c++) {
        const u0 = -1 + c / nC,
          u1 = -1 + (c + 1) / nC;
        const q = [at(a, u0), at(a, u1), at(b, u1), at(a, u0), at(b, u1), at(b, u0)];
        for (const v of q) {
          out[g].p.push(v[0], v[1], v[2]);
          A.set(-sg * (-sg * 2 * k2 * v[0]), -sg * dzdy, sg).normalize();
          out[g].n.push(A.x, A.y, A.z);
        }
      }
    }
  }
  // the windscreen's black surround: strips along its top and bottom edges (round the corners and across the end
  // cap), each running 5 cm up / down the surface, and down its side edges where the glass meets the body
  if (lod < 2) {
    const SW = 0.05;
    const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
      for (const v of [a, b, c, a, c, d]) {
        out.seal.p.push(v[0] + n[0] * 0.004, v[1] + n[1] * 0.004, v[2] + n[2] * 0.004);
        out.seal.n.push(n[0], n[1], n[2]);
      }
    };
    const pt = (o: number) => [P[o], P[o + 1], P[o + 2]];
    const nrm = (o: number) => [N[o], N[o + 1], N[o + 2]];
    // a point SW along the surface from o towards o2
    const toward = (o: number, o2: number) => {
      const dx = P[o2] - P[o],
        dy = P[o2 + 1] - P[o + 1],
        dz = P[o2 + 2] - P[o + 2];
      const l = Math.hypot(dx, dy, dz) || 1;
      const t = Math.min(1, SW / l);
      return [P[o] + dx * t, P[o + 1] + dy * t, P[o + 2] + dz * t];
    };
    let jb = -1;
    for (let j = 0; j < NS - 1; j++) {
      if ((zs[j] + zs[j + 1]) / 2 < gz) continue;
      if (jb < 0) jb = j;
      for (const k of [6, 7]) {
        const k2o = k === 6 ? 7 : 6;
        for (const side of [-1, 1]) {
          const ia = RING - 1 + side * k,
            ib = RING - 1 + side * k2o;
          const oa = (j * RU + ia) * 3,
            ob = ((j + 1) * RU + ia) * 3;
          quad(pt(oa), pt(ob), toward(ob, ((j + 1) * RU + ib) * 3), toward(oa, (j * RU + ib) * 3), nrm(oa));
        }
      }
    }
    if (jb >= 0) {
      // side edges: along the first glass ring, SW towards the front
      for (const side of [-1, 1]) {
        const oa = (jb * RU + RING - 1 + side * 6) * 3,
          ob = (jb * RU + RING - 1 + side * 7) * 3;
        const n = nrm(oa);
        const fa = toward(oa, ((jb + 1) * RU + RING - 1 + side * 6) * 3),
          fb = toward(ob, ((jb + 1) * RU + RING - 1 + side * 7) * 3);
        quad(pt(oa), pt(ob), fb, fa, n);
      }
      // across the end cap
      const j = NS - 1;
      const k2 = ((s.nose ?? NOSE).sweep * 4) / (s.W * s.W);
      const o6 = (j * RU + RING - 1 - 6) * 3,
        o7 = (j * RU + RING - 1 - 7) * 3;
      const capAt = (e: number[], u: number) => {
        const x = e[0] * u;
        return [x, e[1], e[2] + k2 * (e[0] * e[0] - x * x)];
      };
      for (const [oa, ob] of [
        [o6, o7],
        [o7, o6],
      ]) {
        const a = pt(oa),
          b2 = toward(oa, ob);
        const n = nrm(oa);
        const nc = lod === 0 ? 8 : 3;
        for (let c = 0; c < nc * 2; c++) {
          const u0 = -1 + c / nc,
            u1 = -1 + (c + 1) / nc;
          quad(capAt(a, u0), capAt(a, u1), capAt(b2, u1), capAt(b2, u0), [0, n[1] / Math.hypot(n[1], n[2]), n[2] / Math.hypot(n[1], n[2])]);
        }
      }
    }
  }
  const mk = (r: { p: number[]; n: number[] }): THREE.BufferGeometry | null => {
    if (r.p.length === 0) return null;
    const p = r.p,
      n = r.n;
    const B = new THREE.Vector3(),
      C = new THREE.Vector3();
    for (let t = 0; t < p.length; t += 9) {
      B.set(p[t + 3] - p[t], p[t + 4] - p[t + 1], p[t + 5] - p[t + 2]);
      C.set(p[t + 6] - p[t], p[t + 7] - p[t + 1], p[t + 8] - p[t + 2]);
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
  return { body: mk(out.body), skirt: mk(out.skirt), bumper: mk(out.bumper), glass: mk(out.glass), seal: mk(out.seal), well: mk(out.well) };
}
