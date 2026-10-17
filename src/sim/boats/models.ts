// Procedural boats, built facing +Z (bow) with the still waterline at y = 0.
//   big mesh:   1 harbour ferry · 2 tug · 3 river tour boat (glass roof)
//   small mesh: 1 sailing yacht (main + jib) · 2 motorboat · 3 rowing double scull
// Hulls are lofted from stations (smooth normals, sheer, raked stem, transom, boot-top);
// every vertex carries aKind = tag + 100·variant (see material.ts).

import * as THREE from 'three';
import { Geo, type V3 } from '../rail/geo';
import { BT, JIB_HEAD, JIB_TACK } from './material';

export type BoatType = 'ferry' | 'tug' | 'tour' | 'sail' | 'motor' | 'row';

export interface BoatDims {
  /** overall length / beam / draft (m) */
  L: number;
  B: number;
  draft: number;
  /** mesh + variant */
  mesh: 'big' | 'small';
  variant: number;
  /** navigation lights (local): [x, y, z, colour 0 red / 1 green / 2 white] */
  lights: [number, number, number, number][];
  /** funnel top (local) for smoke, if any */
  funnel?: V3;
  /** cabin glow points (local) for night halos */
  glow?: V3[];
}

export const DIMS: Record<BoatType, BoatDims> = {
  ferry: {
    L: 17,
    B: 5.4,
    draft: 1.1,
    mesh: 'big',
    variant: 1,
    lights: [
      [-1.5, 4.35, 2.9, 0],
      [1.5, 4.35, 2.9, 1],
      [0, 6.75, 2.0, 2],
      [0, 3.45, -8.3, 2],
    ],
    funnel: [0, 5.7, -1.0],
  },
  tug: {
    L: 12,
    B: 4.6,
    draft: 1.5,
    mesh: 'big',
    variant: 2,
    lights: [
      [-1.36, 3.9, 1.7, 0],
      [1.36, 3.9, 1.7, 1],
      [0, 6.1, 0.9, 2],
      [0, 5.6, 0.9, 2],
      [0, 1.6, -5.9, 2],
    ],
    funnel: [0, 4.75, -1.4],
  },
  tour: {
    L: 13,
    B: 3.0,
    draft: 0.6,
    mesh: 'big',
    variant: 3,
    lights: [
      [-1.36, 1.2, 4.05, 0],
      [1.36, 1.2, 4.05, 1],
      [0, 1.9, -5.45, 2],
      [0, 1.3, -6.3, 2],
    ],
  },
  sail: {
    L: 7,
    B: 2.4,
    draft: 0.5,
    mesh: 'small',
    variant: 1,
    lights: [
      [-0.35, 1.05, 3.25, 0],
      [0.35, 1.05, 3.25, 1],
      [0, 10.15, 1.0, 2],
    ],
  },
  motor: {
    L: 6,
    B: 2.2,
    draft: 0.45,
    mesh: 'small',
    variant: 2,
    lights: [
      [-0.32, 1.1, 2.6, 0],
      [0.32, 1.1, 2.6, 1],
      [0, 1.95, -2.6, 2],
    ],
  },
  row: {
    L: 8.6,
    B: 0.5,
    draft: 0.12,
    mesh: 'small',
    variant: 3,
    lights: [],
  },
};

// ───────────────────────────────────────────── lofted hull

interface HullSpec {
  L: number;
  B: number;
  draft: number;
  /** deck-edge height above the waterline at stern / midships / bow */
  fb: [number, number, number];
  /** half-width factor at the transom */
  transom: number;
  /** stem rake (m): deck-level stem ahead of the keel-level stem */
  rake: number;
  side: string;
  sideTag?: number;
  boot: string;
  anti: string;
  deck: string;
  deckTag?: number;
  rub?: string;
  /** optional band (y0, y1 above the waterline) */
  stripe?: { y0: number; y1: number; color: string; tag?: number };
  stations?: number;
}

function smooth(t: number): number {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

/** half-width, sheer height, z for hull station t (0 stern .. 1 bow) */
function station(s: HullSpec, t: number): { W: number; D: number; z: number } {
  let f: number;
  if (t < 0.38) f = s.transom + (1 - s.transom) * Math.sqrt(smooth(t / 0.38));
  else if (t < 0.55) f = 1;
  else {
    const u = (t - 0.55) / 0.45;
    f = Math.sqrt(Math.max(0, 1 - u * u));
  }
  const [a, b, c] = s.fb;
  const D = t < 0.5 ? b + (a - b) * (1 - 2 * t) * (1 - 2 * t) : b + (c - b) * (2 * t - 1) * (2 * t - 1);
  return { W: (s.B / 2) * f, D, z: -s.L / 2 + t * s.L };
}

export function hull(g: Geo, s: HullSpec): void {
  const N = s.stations ?? 16;
  // rows: [x factor, y (or sheer offset)], bands between consecutive rows
  type Row = { xf: number; y: (D: number) => number };
  const rows: Row[] = [
    { xf: 0, y: () => -s.draft },
    { xf: 0.72, y: () => -s.draft * 0.55 },
    { xf: 0.95, y: () => -0.04 },
    { xf: 0.975, y: () => 0.1 },
  ];
  const bands: { color: string; tag: number }[] = [
    { color: s.anti, tag: BT.PLAIN },
    { color: s.anti, tag: BT.PLAIN },
    { color: s.boot, tag: BT.PLAIN },
  ];
  if (s.stripe) {
    rows.push({ xf: 0.985, y: () => s.stripe!.y0 });
    bands.push({ color: s.side, tag: s.sideTag ?? BT.PLAIN });
    rows.push({ xf: 0.99, y: () => s.stripe!.y1 });
    bands.push({ color: s.stripe.color, tag: s.stripe.tag ?? BT.PLAIN });
  }
  if (s.rub) {
    rows.push({ xf: 0.995, y: (D) => D - 0.11 });
    bands.push({ color: s.side, tag: s.sideTag ?? BT.PLAIN });
    rows.push({ xf: 1, y: (D) => D });
    bands.push({ color: s.rub, tag: BT.PLAIN });
  } else {
    rows.push({ xf: 1, y: (D) => D });
    bands.push({ color: s.side, tag: s.sideTag ?? BT.PLAIN });
  }
  const R = rows.length;
  // grid of points (starboard side, x ≥ 0)
  const P: V3[][] = [];
  const st: { W: number; D: number; z: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = Math.pow(i / (N - 1), 0.88);
    const S = station(s, t);
    st.push(S);
    const row: V3[] = [];
    const bow = smooth((t - 0.6) / 0.4);
    for (let r = 0; r < R; r++) {
      const y = rows[r].y(S.D);
      const fh = Math.min(1, Math.max(0, (y + s.draft) / (S.D + s.draft)));
      row.push([rows[r].xf * S.W, y, S.z - s.rake * (1 - fh) * bow]);
    }
    P.push(row);
  }
  // smooth normals from the grid tangents
  const nrm: V3[][] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const nr: V3[] = [];
    for (let r = 0; r < R; r++) {
      const i0 = Math.max(0, i - 1),
        i1 = Math.min(N - 1, i + 1);
      const r0 = Math.max(0, r - 1),
        r1 = Math.min(R - 1, r + 1);
      a.set(P[i][r1][0] - P[i][r0][0], P[i][r1][1] - P[i][r0][1], P[i][r1][2] - P[i][r0][2]);
      b.set(P[i1][r][0] - P[i0][r][0], P[i1][r][1] - P[i0][r][1], P[i1][r][2] - P[i0][r][2]);
      n.crossVectors(a, b);
      if (n.lengthSq() < 1e-10) n.set(1, 0, 0);
      n.normalize();
      nr.push([n.x, n.y, n.z]);
    }
    nrm.push(nr);
  }
  // emit bands (both sides)
  for (let bi = 0; bi < R - 1; bi++) {
    g.kind(bands[bi].tag).color(bands[bi].color);
    for (const side of [1, -1]) {
      const base = g.vertexCount;
      for (let i = 0; i < N; i++) {
        for (const r of [bi, bi + 1]) {
          const p = P[i][r],
            q = nrm[i][r];
          g.vert(side * p[0], p[1], p[2], side * q[0], q[1], q[2]);
        }
      }
      for (let i = 0; i < N - 1; i++) {
        const v0 = base + i * 2,
          v1 = v0 + 1,
          v2 = v0 + 2,
          v3 = v0 + 3;
        // starboard: (lower i, upper i, upper i+1, lower i+1) faces outward
        if (side > 0) g.I.push(v0, v1, v3, v0, v3, v2);
        else g.I.push(v0, v3, v1, v0, v2, v3);
      }
    }
  }
  // deck (flat across the sheer line)
  g.kind(s.deckTag ?? BT.PLAIN).color(s.deck);
  for (let i = 0; i < N - 1; i++) {
    const A = P[i][R - 1],
      B2 = P[i + 1][R - 1];
    g.quad([A[0], A[1] - 0.02, A[2]], [-A[0], A[1] - 0.02, A[2]], [-B2[0], B2[1] - 0.02, B2[2]], [B2[0], B2[1] - 0.02, B2[2]]);
  }
  // transom
  g.kind(bands[R - 2].tag).color(s.side);
  const tp: V3[] = [];
  for (let r = 0; r < R; r++) tp.push([P[0][r][0], P[0][r][1], P[0][r][2]]);
  for (let r = R - 1; r >= 0; r--) tp.push([-P[0][r][0], P[0][r][1], P[0][r][2]]);
  // fan facing −z from the centroid
  let cx = 0,
    cy = 0;
  for (const p of tp) {
    cx += p[0];
    cy += p[1];
  }
  cx /= tp.length;
  cy /= tp.length;
  const c0 = g.vert(cx, cy, P[0][0][2], 0, 0, -1);
  const b0 = g.vertexCount;
  for (const p of tp) g.vert(p[0], p[1], p[2], 0, 0, -1);
  for (let i = 0; i < tp.length - 1; i++) g.I.push(c0, b0 + i + 1, b0 + i);
}

/** sheer height & half-width at a local z (for placing deck fittings) */
export function sheerAt(s: { L: number; B: number; fb: [number, number, number]; transom: number }, z: number): { W: number; D: number } {
  const t = Math.min(1, Math.max(0, (z + s.L / 2) / s.L));
  const S = station({ ...s, draft: 0, rake: 0, side: '', boot: '', anti: '', deck: '' }, t);
  return { W: S.W, D: S.D };
}

// ───────────────────────────────────────────── small helpers

/** box-shaped deckhouse with a window band on all four sides */
function deckhouse(
  g: Geo,
  o: { x: number; y0: number; y1: number; z0: number; z1: number; wall: string; roof: string; win: [number, number]; winTag: number; winCol: string; pane?: number; frontWin?: boolean; backWin?: boolean },
): void {
  const { x, y0, y1, z0, z1 } = o;
  g.kind(BT.PLAIN).color(o.wall);
  g.box(0, (y0 + y1) / 2, (z0 + z1) / 2, x * 2, y1 - y0, z1 - z0, 4 | 8);
  g.color(o.roof);
  g.box(0, y1 + 0.04, (z0 + z1) / 2, x * 2 + 0.12, 0.08, z1 - z0 + 0.12, 8);
  const [wy0, wy1] = o.win;
  const pane = o.pane ?? 0;
  g.kind(o.winTag).color(o.winCol);
  for (const sd of [-1, 1]) {
    const xx = sd * (x + 0.012);
    if (pane > 0) {
      const n = Math.max(1, Math.round((z1 - z0 - 0.3) / pane));
      const w = (z1 - z0 - 0.3) / n;
      for (let k = 0; k < n; k++) {
        const za = z0 + 0.15 + k * w + 0.06,
          zb = z0 + 0.15 + (k + 1) * w - 0.06;
        if (sd > 0) g.quad([xx, wy0, zb], [xx, wy0, za], [xx, wy1, za], [xx, wy1, zb]);
        else g.quad([xx, wy0, za], [xx, wy0, zb], [xx, wy1, zb], [xx, wy1, za]);
      }
    } else {
      const za = z0 + 0.2,
        zb = z1 - 0.2;
      if (sd > 0) g.quad([xx, wy0, zb], [xx, wy0, za], [xx, wy1, za], [xx, wy1, zb]);
      else g.quad([xx, wy0, za], [xx, wy0, zb], [xx, wy1, zb], [xx, wy1, za]);
    }
  }
  if (o.frontWin !== false) g.quad([-x + 0.15, wy0, z1 + 0.012], [x - 0.15, wy0, z1 + 0.012], [x - 0.15, wy1, z1 + 0.012], [-x + 0.15, wy1, z1 + 0.012]);
  if (o.backWin) g.quad([x - 0.15, wy0, z0 - 0.012], [-x + 0.15, wy0, z0 - 0.012], [-x + 0.15, wy1, z0 - 0.012], [x - 0.15, wy1, z0 - 0.012]);
}

/** railing along a polyline (posts + top rail) */
function railing(g: Geo, pts: V3[], h: number, color: string, step = 1.1): void {
  g.kind(BT.PLAIN).color(color);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue;
      const t = k / n;
      const x = a[0] + (b[0] - a[0]) * t,
        y = a[1] + (b[1] - a[1]) * t,
        z = a[2] + (b[2] - a[2]) * t;
      g.box(x, y + h / 2, z, 0.045, h, 0.045, 0);
    }
    g.beam([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.05, 0.05);
    g.beam([a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.03, 0.03);
  }
}

function lifeRing(g: Geo, x: number, y: number, z: number, faceX: number): void {
  g.kind(BT.PLAIN).color('#e8672c');
  g.push().at(x, y, z).rotZ((faceX * Math.PI) / 2);
  g.cyl(0, -0.04, 0, 0.3, 0.3, 0.08, 10, 0);
  g.color('#f2efe6');
  g.cyl(0, -0.041, 0, 0.17, 0.17, 0.082, 10, 0);
  g.pop();
}

function navLamp(g: Geo, x: number, y: number, z: number, kind: number): void {
  g.kind(BT.PLAIN).color('#2a2c2e');
  g.box(x, y - 0.08, z, 0.14, 0.05, 0.14, 0);
  g.kind(kind === 0 ? BT.LAMP_R : kind === 1 ? BT.LAMP_G : BT.LAMP_W).color(kind === 0 ? '#8a1c14' : kind === 1 ? '#1c7a3c' : '#e8e6de');
  g.box(x, y, z, 0.12, 0.12, 0.12, 0);
}

/** seated / standing figure (simple: legs, torso, head); torso colour via ACCENT when shirt = null */
function figure(g: Geo, x: number, y: number, z: number, facing: number, shirt: string | null, seated = true, tag = BT.PLAIN, hip: [number, number] | null = null): void {
  g.push().at(x, y, z, facing);
  if (hip) g.extra(hip[0], hip[1], 0, 0);
  g.kind(BT.PLAIN).color('#2f3a4c');
  if (seated) g.box(0, 0.08, 0.18, 0.34, 0.14, 0.42, 0);
  else {
    g.box(-0.09, 0.42, 0, 0.12, 0.84, 0.14, 0);
    g.box(0.09, 0.42, 0, 0.12, 0.84, 0.14, 0);
  }
  const ty = seated ? 0.15 : 0.84;
  if (shirt) g.kind(tag).color(shirt);
  else g.kind(tag === BT.PLAIN ? BT.ACCENT : tag).color('#ffffff');
  if (hip) g.kind(BT.ROWER);
  g.box(0, ty + 0.27, 0, 0.36, 0.54, 0.22, 0);
  g.color('#e9c6a5');
  g.sphere(0, ty + 0.66, 0, 0.11, 8, 5);
  g.color('#4a3426');
  g.sphere(0, ty + 0.7, -0.015, 0.105, 8, 4, 0.7);
  g.extra(0, 0, 0, 0);
  g.pop();
}

function flag(g: Geo, x: number, y: number, z: number, colors: [string, string]): void {
  g.kind(BT.PLAIN).color('#d8d6d0');
  g.cyl(x, y, z, 0.025, 0.02, 1.3, 5, 1);
  // cloth: two stripes, waving (u along the fly, toward −z)
  const fy = y + 0.85;
  for (let k = 0; k < 4; k++) {
    const u0 = k / 4,
      u1 = (k + 1) / 4;
    g.kind(BT.FLAG).color(colors[k % 2 === 0 ? 0 : 1]);
    const za = z - 0.05 - u0 * 0.7,
      zb = z - 0.05 - u1 * 0.7;
    const i0 = g.vertexCount;
    g.extra(u0, 0, 0, 0);
    g.vert(x, fy, za, 1, 0, 0);
    g.vert(x, fy + 0.42, za, 1, 0, 0);
    g.extra(u1, 0, 0, 0);
    g.vert(x, fy + 0.42, zb, 1, 0, 0);
    g.vert(x, fy, zb, 1, 0, 0);
    g.I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  g.extra(0, 0, 0, 0);
}

// ───────────────────────────────────────────── ferry

const FERRY_HULL: HullSpec = {
  L: 17,
  B: 5.4,
  draft: 1.1,
  fb: [1.05, 1.0, 1.55],
  transom: 0.82,
  rake: 1.3,
  side: '#244a73',
  boot: '#f2efe6',
  anti: '#8a3a2e',
  deck: '#b7b1a5',
  rub: '#1d2024',
  stripe: { y0: 0.55, y1: 0.68, color: '#f2efe6' },
};

function ferry(g: Geo): void {
  hull(g, FERRY_HULL);
  const D = 1.0;
  // main saloon
  deckhouse(g, { x: 2.25, y0: D - 0.02, y1: 3.05, z0: -6.0, z1: 4.2, wall: '#f4f1ea', roof: '#d9d5cc', win: [1.65, 2.6], winTag: BT.WINDOW, winCol: '#2f3d48', pane: 1.15, backWin: true });
  // dark skirting band + doors on both sides aft
  g.kind(BT.PLAIN).color('#244a73');
  g.box(0, D + 0.18, -0.9, 4.52, 0.36, 10.22, 4 | 8 | 16 | 32);
  for (const sd of [-1, 1]) {
    g.color('#c9c2b4');
    g.box(sd * 2.262, 1.85, -5.1, 0.02, 1.7, 0.85, 0);
  }
  // upper deck: railing, benches, wheelhouse, funnel, mast
  const uy = 3.12;
  railing(
    g,
    [
      [-2.15, uy, -5.85],
      [2.15, uy, -5.85],
      [2.15, uy, 4.05],
      [-2.15, uy, 4.05],
      [-2.15, uy, -5.85],
    ],
    0.85,
    '#f4f1ea',
  );
  for (const z of [-4.8, -3.6]) {
    g.kind(BT.PLAIN).color('#2c6e9c');
    g.box(0, uy + 0.25, z, 3.2, 0.08, 0.45, 0);
    g.box(0, uy + 0.5, z - 0.2, 3.2, 0.42, 0.06, 0);
    g.color('#3a3d40');
    for (const sx of [-1.4, 1.4]) g.box(sx, uy + 0.12, z, 0.06, 0.24, 0.4, 0);
  }
  deckhouse(g, { x: 1.45, y0: uy, y1: 4.95, z0: 0.6, z1: 3.6, wall: '#f4f1ea', roof: '#c7c3ba', win: [4.0, 4.75], winTag: BT.GLASS, winCol: '#22303a', pane: 0, backWin: true });
  // wheelhouse visor + wings
  g.kind(BT.PLAIN).color('#244a73');
  g.box(0, 4.92, 3.75, 3.1, 0.12, 0.35, 0);
  // funnel (yellow, black top)
  g.push().at(0, uy, -1.0);
  g.color('#e6ae32');
  g.cyl(0, 0, 0, 0.5, 0.46, 2.2, 12, 0);
  g.color('#1e2022');
  g.cyl(0, 2.2, 0, 0.46, 0.44, 0.38, 12, 1);
  g.pop();
  // mast with lamps + radar
  g.kind(BT.PLAIN).color('#f4f1ea');
  g.cyl(0, 4.95, 2.0, 0.06, 0.045, 1.9, 6, 1);
  g.box(0, 6.0, 2.0, 0.9, 0.05, 0.08, 0);
  g.color('#3a3d40');
  g.box(0, 6.25, 2.0, 1.1, 0.06, 0.16, 0);
  for (const L of DIMS.ferry.lights) navLamp(g, L[0], L[1], L[2], L[3]);
  // life rings on the saloon ends, bollards fore and aft
  lifeRing(g, -2.27, 2.0, -2.4, -1);
  lifeRing(g, 2.27, 2.0, -2.4, 1);
  lifeRing(g, -2.27, 2.0, 2.4, -1);
  lifeRing(g, 2.27, 2.0, 2.4, 1);
  g.kind(BT.PLAIN).color('#2a2c2e');
  for (const [x, z] of [
    [-1.6, 5.6],
    [1.6, 5.6],
    [-1.8, -7.2],
    [1.8, -7.2],
  ])
    g.cyl(x, D, z, 0.13, 0.13, 0.3, 7, 1);
  // foredeck life-raft canisters + aft bench
  g.color('#f2efe6');
  for (const x of [-0.6, 0.6]) {
    g.push().at(x, D + 0.28, 6.4).rotX(Math.PI / 2);
    g.cyl(0, -0.4, 0, 0.26, 0.26, 0.8, 8, 3);
    g.pop();
  }
  g.color('#2c6e9c');
  g.box(0, D + 0.3, -7.3, 2.6, 0.08, 0.4, 0);
  // aft flag
  flag(g, 0, D, -8.2, ['#d33a2e', '#f2efe6']);
  // passengers on the upper deck
  figure(g, -1.0, uy + 0.2, -4.75, 0, '#e2a23a');
  figure(g, 0.8, uy + 0.2, -4.75, 0, '#3f7fbf');
  figure(g, 1.6, uy, -1.8, Math.PI / 2, '#c94d5b', false);
}

// ───────────────────────────────────────────── tug

const TUG_HULL: HullSpec = {
  L: 12,
  B: 4.6,
  draft: 1.5,
  fb: [0.9, 1.0, 1.65],
  transom: 0.86,
  rake: 0.6,
  side: '#b83a2c',
  boot: '#1c1c1c',
  anti: '#5d2620',
  deck: '#7c7a74',
  rub: '#1b1b1b',
};

function tug(g: Geo): void {
  hull(g, TUG_HULL);
  const D = 1.0;
  // bulwark (low red wall with white top) along the sides
  for (const sd of [-1, 1]) {
    g.kind(BT.PLAIN).color('#b83a2c');
    g.box(sd * 1.98, D + 0.25, -1.5, 0.08, 0.5, 7.6, 0);
    g.color('#f2efe6');
    g.box(sd * 1.98, D + 0.52, -1.5, 0.14, 0.05, 7.6, 0);
  }
  // heavy bow fender (black rubber) + side tyre fenders
  g.kind(BT.PLAIN).color('#151617');
  g.push().at(0, 1.25, 5.85).rotX(Math.PI / 2);
  g.cyl(0, -0.5, 0, 0.42, 0.42, 1.0, 10, 3);
  g.pop();
  for (const sd of [-1, 1]) {
    for (let z = -4.4; z <= 3.6; z += 1.6) {
      const W = sheerAt(TUG_HULL, z).W;
      g.push().at(sd * (W + 0.1), 0.55, z).rotZ(Math.PI / 2);
      g.cyl(0, -0.12, 0, 0.32, 0.32, 0.24, 10, 3);
      g.pop();
    }
  }
  // deckhouse + wheelhouse with all-round windows
  deckhouse(g, { x: 1.55, y0: D - 0.02, y1: 2.6, z0: -1.2, z1: 3.0, wall: '#efe9dc', roof: '#d8d1c2', win: [1.85, 2.1], winTag: BT.WINDOW, winCol: '#2a333b', pane: 0.6, frontWin: false });
  deckhouse(g, { x: 1.3, y0: 2.6, y1: 4.2, z0: 0.0, z1: 2.6, wall: '#efe9dc', roof: '#b83a2c', win: [3.3, 4.0], winTag: BT.WINDOW, winCol: '#26313a', pane: 0, backWin: true });
  // funnel: black with red band
  g.push().at(0, 2.6, -1.4);
  g.kind(BT.PLAIN).color('#1c1d1f');
  g.cyl(0, 0, 0, 0.5, 0.45, 2.15, 12, 1);
  g.color('#b83a2c');
  g.cyl(0, 1.25, 0, 0.495, 0.48, 0.4, 12, 0);
  g.pop();
  // mast with towing lights, searchlight
  g.kind(BT.PLAIN).color('#efe9dc');
  g.cyl(0, 4.2, 0.9, 0.06, 0.045, 2.0, 6, 1);
  g.box(0, 5.3, 0.9, 0.8, 0.05, 0.08, 0);
  for (const L of DIMS.tug.lights) navLamp(g, L[0], L[1], L[2], L[3]);
  g.kind(BT.LAMP_WARM).color('#fff4d6');
  g.box(0, 4.35, 2.4, 0.22, 0.18, 0.2, 0);
  // aft deck: towing bitt, winch drum, hook
  g.kind(BT.PLAIN).color('#2a2c2e');
  g.cyl(0, D, -3.4, 0.22, 0.22, 0.55, 8, 1);
  g.box(0, D + 0.6, -3.4, 0.9, 0.12, 0.16, 0);
  g.color('#4a4d50');
  g.push().at(0, D + 0.35, -2.2).rotZ(Math.PI / 2);
  g.cyl(0, -0.65, 0, 0.3, 0.3, 1.3, 10, 3);
  g.pop();
  g.color('#c79a2e');
  g.box(0, D + 0.12, -4.9, 1.2, 0.12, 0.2, 0);
  lifeRing(g, -1.57, 1.9, -0.5, -1);
  lifeRing(g, 1.57, 1.9, -0.5, 1);
  figure(g, 0.9, D, -4.4, Math.PI, '#e2a23a', false);
}

// ───────────────────────────────────────────── river tour boat (glass roof)

const TOUR_HULL: HullSpec = {
  L: 13,
  B: 3.0,
  draft: 0.6,
  fb: [0.55, 0.52, 0.66],
  transom: 0.9,
  rake: 0.35,
  side: '#1f3d5c',
  boot: '#e9e4d8',
  anti: '#5a2a22',
  deck: '#a98c66',
  rub: '#121417',
  stripe: { y0: 0.3, y1: 0.38, color: '#d9b45a' },
};

function tour(g: Geo): void {
  hull(g, TOUR_HULL);
  const D = 0.52;
  const x = 1.32;
  const z0 = -4.4,
    z1 = 3.9;
  // open passenger well: low cream bulwarks with a varnished cap rail
  g.kind(BT.PLAIN).color('#ede7da');
  for (const sd of [-1, 1]) g.box(sd * x, D + 0.24, (z0 + z1) / 2, 0.08, 0.48, z1 - z0, 0);
  g.box(0, D + 0.24, z1, x * 2, 0.48, 0.08, 0);
  g.color('#9a6a42');
  for (const sd of [-1, 1]) g.box(sd * x, D + 0.5, (z0 + z1) / 2, 0.14, 0.05, z1 - z0 + 0.1, 0);
  g.box(0, D + 0.5, z1, x * 2 + 0.1, 0.05, 0.14, 0);
  // low glass wind-screen at the bow end of the well
  g.kind(BT.GLASS).color('#8fb3c4');
  g.quad([-x + 0.1, D + 0.52, z1 + 0.02], [x - 0.1, D + 0.52, z1 + 0.02], [x - 0.2, D + 0.95, z1 - 0.15], [-x + 0.2, D + 0.95, z1 - 0.15]);
  // benches across the boat (aisle in the middle) with passengers
  const shirts = ['#c94d5b', '#3f7fbf', '#e2a23a', '#5a9c5a', '#8d6cab', '#f2efe6', '#d07a3a', '#2f4a6a', '#e9c84a', '#4aa3a3'];
  const hairs = ['#3a2a1e', '#6b4a2e', '#c9a46a', '#1e1c1a', '#8a8a86', '#a0522d'];
  let k = 0;
  for (let z = z0 + 0.55; z < z1 - 0.3; z += 0.92) {
    for (const sd of [-1, 1]) {
      g.kind(BT.PLAIN).color('#7a5236');
      g.box(sd * 0.72, D + 0.22, z, 1.0, 0.06, 0.34, 0);
      g.box(sd * 0.72, D + 0.4, z - 0.16, 1.0, 0.3, 0.05, 0);
      for (const px of [0.48, 0.96]) {
        if ((k * 7 + 3) % 6 === 0) {
          k++;
          continue;
        }
        const cx = sd * px;
        g.color(shirts[k % shirts.length]);
        g.box(cx, D + 0.48, z + 0.02, 0.3, 0.38, 0.2, 0);
        g.color(k % 4 === 0 ? '#c99a7a' : '#e9c6a5');
        g.sphere(cx, D + 0.77, z + 0.03, 0.095, 7, 4);
        g.color(hairs[k % hairs.length]);
        g.sphere(cx, D + 0.81, z + 0.0, 0.09, 7, 3, 0.65);
        if (k % 5 === 2) {
          g.color('#f2efe6');
          g.cyl(cx, D + 0.84, z + 0.02, 0.15, 0.15, 0.02, 8, 1);
          g.cyl(cx, D + 0.86, z + 0.02, 0.08, 0.07, 0.1, 8, 1);
        }
        k++;
      }
    }
  }
  // striped sun awning over the stern half of the well
  // (kept below 2 m above the waterline: the footbridges' arches clear ~2.8 m mid-river)
  const ay = D + 1.42;
  g.kind(BT.PLAIN).color('#d9d4c8');
  for (const sd of [-1, 1]) for (const z of [z0 + 0.1, -0.35]) g.cyl(sd * (x - 0.06), D + 0.5, z, 0.03, 0.03, 0.88, 5, 1);
  for (let i = 0; i < 8; i++) {
    const za = z0 - 0.05 + (i * (4.2 + 0.05)) / 8,
      zb = z0 - 0.05 + ((i + 1) * (4.2 + 0.05)) / 8;
    g.color(i % 2 === 0 ? '#f4f1ea' : '#2f6fd0');
    // one face (the boat material is double-sided); faces up
    g.quad([x + 0.05, ay - 0.06, za], [-x - 0.05, ay - 0.06, za], [-x - 0.05, ay - 0.06, zb], [x + 0.05, ay - 0.06, zb]);
  }
  // valance edge of the awning (scalloped band)
  g.color('#2f6fd0');
  for (const sd of [-1, 1]) g.box(sd * (x + 0.05), ay - 0.14, z0 + 2.07, 0.02, 0.16, 4.25, 0);
  // festoon bulbs along the cap rails (warm at night)
  g.kind(BT.LAMP_WARM).color('#fff1c8');
  for (const sd of [-1, 1]) for (let z = z0 + 0.4; z < z1; z += 0.9) g.box(sd * (x + 0.02), D + 0.62, z, 0.06, 0.06, 0.06, 0);
  // stern helm: small wheelhouse roof on posts, skipper at the wheel
  g.kind(BT.PLAIN).color('#1f3d5c');
  g.box(0, D + 1.3, z0 - 1.05, 1.5, 0.06, 1.3, 0);
  g.color('#d9d4c8');
  for (const sx of [-0.65, 0.65]) for (const z of [z0 - 1.6, z0 - 0.5]) g.cyl(sx, D, z, 0.03, 0.03, 1.28, 5, 1);
  g.color('#2a2c2e');
  g.cyl(0.35, D, z0 - 0.75, 0.05, 0.05, 0.75, 6, 1);
  g.push().at(0.35, D + 0.8, z0 - 0.75).rotX(Math.PI / 2.6);
  g.cyl(0, -0.02, 0, 0.17, 0.17, 0.04, 10, 0);
  g.pop();
  // skipper seated on a stool under the helm roof (keeps the boat under 2 m for the footbridges)
  g.kind(BT.PLAIN).color('#2a2c2e');
  g.cyl(0.35, D, z0 - 1.2, 0.14, 0.14, 0.32, 8, 1);
  figure(g, 0.35, D + 0.3, z0 - 1.15, 0, '#efe9dc', true);
  flag(g, 0, D, -6.1, ['#2f6fd0', '#f2efe6']);
  g.kind(BT.PLAIN).color('#2a2c2e');
  g.cyl(0, D + 0.1, 5.3, 0.08, 0.08, 0.18, 6, 1);
  lifeRing(g, -x - 0.06, D + 0.25, -0.9, -1);
  lifeRing(g, x + 0.06, D + 0.25, 1.6, 1);
  for (const L of DIMS.tour.lights) navLamp(g, L[0], L[1], L[2], L[3]);
}

// ───────────────────────────────────────────── sailing yacht

const SAIL_HULL: HullSpec = {
  L: 7,
  B: 2.4,
  draft: 0.5,
  fb: [0.66, 0.68, 0.98],
  transom: 0.6,
  rake: 0.65,
  side: '#ffffff',
  sideTag: BT.TINT,
  boot: '#c9372c',
  anti: '#3a3f46',
  deck: '#d8cfbf',
  rub: '#b08a5a',
  stripe: { y0: 0.4, y1: 0.47, color: '#f2efe6' },
  stations: 14,
};
export const MAST_Z = 1.0;
export const MAST_TOP = 10.1;

function sailCloth(g: Geo, tag: number, luff: [V3, V3], clewOf: (v: number) => V3, pivotZ: number, cols = 5, rowsN = 7): void {
  // u: luff (0) → leech (1); v: foot (0) → head (1)
  const grid: V3[][] = [];
  for (let j = 0; j <= rowsN; j++) {
    const v = j / rowsN;
    const L0: V3 = [luff[0][0] + (luff[1][0] - luff[0][0]) * v, luff[0][1] + (luff[1][1] - luff[0][1]) * v, luff[0][2] + (luff[1][2] - luff[0][2]) * v];
    const C1 = clewOf(v);
    const row: V3[] = [];
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      row.push([L0[0] + (C1[0] - L0[0]) * u, L0[1] + (C1[1] - L0[1]) * u, L0[2] + (C1[2] - L0[2]) * u]);
    }
    grid.push(row);
  }
  g.kind(tag).color('#f7f4ec');
  const base = g.vertexCount;
  for (let j = 0; j <= rowsN; j++) {
    for (let i = 0; i <= cols; i++) {
      const p = grid[j][i];
      g.extra(i / cols, j / rowsN, pivotZ, 0);
      g.vert(p[0], p[1], p[2], 1, 0, 0);
    }
  }
  g.extra(0, 0, 0, 0);
  const W = cols + 1;
  for (let j = 0; j < rowsN; j++) {
    for (let i = 0; i < cols; i++) {
      const a = base + j * W + i;
      g.I.push(a, a + 1, a + W + 1, a, a + W + 1, a + W);
    }
  }
}

function sailboat(g: Geo): void {
  hull(g, SAIL_HULL);
  // cabin top, cockpit coamings, rudder head
  g.kind(BT.PLAIN).color('#f4f2ec');
  g.box(0, 0.86, 0.4, 1.5, 0.3, 2.5, 8);
  g.color('#22303a');
  for (const sd of [-1, 1]) g.box(sd * 0.755, 0.88, 0.4, 0.01, 0.12, 1.6, 0);
  g.color('#a9865a');
  for (const sd of [-1, 1]) g.box(sd * 0.95, 0.82, -2.0, 0.08, 0.14, 2.4, 0);
  // mast + spreaders + forestay/backstay (thin rods)
  g.color('#c9cdd0');
  g.cyl(0, 0.7, MAST_Z, 0.065, 0.05, MAST_TOP - 0.7, 6, 1);
  g.box(0, 6.0, MAST_Z, 1.4, 0.04, 0.05, 0);
  g.color('#8a8f93');
  g.rod([0, JIB_TACK[1] - 0.15, JIB_TACK[2] + 0.04], [0, JIB_HEAD[1] + (JIB_HEAD[1] - JIB_TACK[1]) * 0.33, JIB_HEAD[2] + (JIB_HEAD[2] - JIB_TACK[2]) * 0.33], 0.012, 3);
  g.rod([0, 0.85, -3.4], [0, MAST_TOP - 0.05, MAST_Z - 0.05], 0.012, 3);
  // boom (rotates with the mainsail)
  g.extra(0, 0, MAST_Z, 0);
  g.kind(BT.BOOM).color('#c9cdd0');
  g.box(0, 1.95, MAST_Z - 1.6, 0.08, 0.1, 3.3, 0);
  g.extra(0, 0, 0, 0);
  // mainsail: luff along the mast, foot along the boom, leech to the clew
  const clewZ = MAST_Z - 3.15;
  sailCloth(
    g,
    BT.SAIL,
    [
      [0, 2.05, MAST_Z - 0.08],
      [0, MAST_TOP - 0.25, MAST_Z - 0.08],
    ],
    (v) => [0, 2.05 + (MAST_TOP - 0.25 - 2.05) * v, clewZ + (MAST_Z - 0.12 - clewZ) * Math.pow(v, 1.15)],
    MAST_Z,
  );
  // jib: tack at the bow, head up the forestay, clew aft of the mast
  const tackZ = JIB_TACK[2];
  sailCloth(
    g,
    BT.JIB,
    [
      [JIB_TACK[0], JIB_TACK[1], JIB_TACK[2]],
      [JIB_HEAD[0], JIB_HEAD[1], JIB_HEAD[2]],
    ],
    (v) => [0, 1.3 + (JIB_HEAD[1] - 1.3) * v, MAST_Z - 0.55 + (JIB_HEAD[2] - (MAST_Z - 0.55)) * Math.pow(v, 1.3)],
    tackZ,
    4,
    6,
  );
  // crew in the cockpit
  figure(g, -0.4, 0.62, -1.6, Math.PI * 0.5, null);
  figure(g, 0.45, 0.62, -2.5, Math.PI * 1.1, '#f2efe6');
  for (const L of DIMS.sail.lights) navLamp(g, L[0], L[1] - 0.04, L[2], L[3]);
}

// ───────────────────────────────────────────── motorboat

const MOTOR_HULL: HullSpec = {
  L: 6,
  B: 2.2,
  draft: 0.45,
  fb: [0.78, 0.82, 1.08],
  transom: 0.86,
  rake: 0.9,
  side: '#f4f2ec',
  boot: '#f4f2ec',
  anti: '#2c3440',
  deck: '#e8e1d2',
  rub: '#2c3440',
  stripe: { y0: 0.42, y1: 0.58, color: '#ffffff', tag: BT.TINT },
  stations: 14,
};

function motorboat(g: Geo): void {
  hull(g, MOTOR_HULL);
  // foredeck (raised, white) + windscreen
  g.kind(BT.PLAIN).color('#f6f4ee');
  g.box(0, 0.86, 1.6, 1.6, 0.16, 2.2, 8);
  g.kind(BT.GLASS).color('#2b3a46');
  g.quad([-0.85, 0.94, 0.55], [0.85, 0.94, 0.55], [0.75, 1.42, 0.2], [-0.75, 1.42, 0.2]);
  g.kind(BT.PLAIN).color('#c9cdd0');
  g.beam([-0.85, 0.94, 0.55], [-0.75, 1.42, 0.2], 0.04, 0.04);
  g.beam([0.85, 0.94, 0.55], [0.75, 1.42, 0.2], 0.04, 0.04);
  // console, seats (accent colour), stern bench
  g.color('#e8e3d8');
  g.box(0.45, 0.95, 0.0, 0.55, 0.5, 0.5, 8);
  g.kind(BT.ACCENT).color('#ffffff');
  for (const sx of [-0.45, 0.45]) {
    g.box(sx, 0.86, -0.75, 0.55, 0.12, 0.55, 0);
    g.box(sx, 1.1, -1.0, 0.55, 0.45, 0.1, 0);
  }
  g.box(0, 0.86, -2.25, 1.7, 0.14, 0.55, 0);
  // outboard engine
  g.kind(BT.PLAIN).color('#22262a');
  g.box(0, 0.95, -3.2, 0.42, 0.62, 0.55, 0);
  g.color('#3a3f45');
  g.box(0, 0.35, -3.25, 0.16, 0.7, 0.18, 0);
  // stern light pole + bow lights
  g.color('#c9cdd0');
  g.cyl(0, 0.85, -2.6, 0.02, 0.02, 1.05, 5, 1);
  for (const L of DIMS.motor.lights) navLamp(g, L[0], L[1], L[2], L[3]);
  figure(g, 0.45, 0.8, -0.75, 0, '#f2efe6');
}

// ───────────────────────────────────────────── rowing double scull

const ROW_HULL: HullSpec = {
  L: 8.6,
  B: 0.5,
  draft: 0.12,
  fb: [0.2, 0.22, 0.24],
  transom: 0.15,
  rake: 0.12,
  side: '#ffffff',
  sideTag: BT.TINT,
  boot: '#ffffff',
  anti: '#d9d4c8',
  deck: '#e4ddcc',
  stations: 12,
};

function rowingShell(g: Geo): void {
  hull(g, ROW_HULL);
  // closed decks fore/aft (slightly darker), cockpits
  g.kind(BT.PLAIN).color('#3a3a3a');
  g.box(0, 0.23, 0.0, 0.34, 0.02, 3.6, 8);
  for (const zr of [-0.95, 0.85]) {
    // riggers
    g.color('#b9bec2');
    for (const sd of [-1, 1]) g.rod([sd * 0.2, 0.25, zr], [sd * 0.78, 0.36, zr - 0.15], 0.018, 4);
    // rower (faces the stern: yaw π), torso leans about the hip
    figure(g, 0, 0.22, zr - 0.1, Math.PI, zr < 0 ? '#2f4a6a' : '#c94d5b', true, BT.PLAIN, [0.22 + 0.15, zr - 0.1]);
    // oars (two sculls): loom + blade, pivot at the oarlock
    for (const sd of [-1, 1]) {
      const piv: V3 = [sd * 0.78, 0.36, zr - 0.15];
      g.extra(piv[0], piv[1], piv[2], sd);
      g.kind(BT.OAR).color('#e9e4d8');
      g.rod([piv[0] - sd * 0.8, 0.5, piv[2]], [piv[0] + sd * 1.5, 0.14, piv[2]], 0.02, 4);
      g.color('#e2a23a');
      g.box(piv[0] + sd * 1.72, 0.1, piv[2], 0.42, 0.03, 0.19, 0);
      g.extra(0, 0, 0, 0);
    }
  }
}

// ───────────────────────────────────────────── build

export function buildBigBoats(): THREE.BufferGeometry {
  const g = new Geo();
  g.variant(1);
  ferry(g);
  g.variant(2);
  tug(g);
  g.variant(3);
  tour(g);
  g.variant(0);
  return g.build({ anim: false, extra: true });
}

export function buildSmallBoats(): THREE.BufferGeometry {
  const g = new Geo();
  g.variant(1);
  sailboat(g);
  g.variant(2);
  motorboat(g);
  g.variant(3);
  rowingShell(g);
  g.variant(0);
  return g.build({ anim: false, extra: true });
}
