// Procedural boats, built facing +Z (bow) with the still waterline at y = 0.
//   big mesh:   1 harbour ferry · 2 tug · 3 river tour boat (glass roof)
//   small mesh: 1 sailing yacht (main + jib) · 2 motorboat · 3 rowing double scull
// Hulls are lofted from stations (smooth normals, sheer, raked stem, transom, boot-top);
// every vertex carries aKind = tag + 100·variant (see material.ts).

import * as THREE from 'three';
import { Geo, type V3 } from '../rail/geo';
import { BT, HC, HC_STEP, JIB_HEAD, JIB_TACK } from './material';
import { QUAY_X, WATER_LEVEL } from '../../core/constants';

export type BoatType = 'ferry' | 'tug' | 'tour' | 'sail' | 'motor' | 'row' | 'fish' | 'punt';

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
  fish: {
    L: 10.5,
    B: 3.7,
    draft: 1.3,
    mesh: 'big',
    variant: 4,
    lights: [
      [-1.25, 3.55, 2.4, 0],
      [1.25, 3.55, 2.4, 1],
      [0, 6.3, 1.9, 2],
      [0, 1.9, -5.0, 2],
    ],
  },
  punt: {
    L: 3.4,
    B: 1.45,
    draft: 0.25,
    mesh: 'small',
    variant: 4,
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
  /** surface detail class in the shader (material.ts HC): welded steel plating or moulded GRP */
  hc?: number;
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
    const fl = smooth((t - 0.45) / 0.5);
    for (let r = 0; r < R; r++) {
      const y = rows[r].y(S.D);
      const fh = Math.min(1, Math.max(0, (y + s.draft) / (S.D + s.draft)));
      // flared bow: the entry at the waterline is finer than the deck above it (concave topsides forward)
      const flare = 1 - 0.42 * fl * (1 - fh) * (1 - fh * 0.4);
      row.push([rows[r].xf * S.W * flare, y, S.z - s.rake * (1 - fh) * bow]);
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
  // emit bands (both sides); hull vertices carry the class offset + aExtra.x = sheer height at the station
  const hc = (s.hc ?? 0) * HC_STEP;
  for (let bi = 0; bi < R - 1; bi++) {
    g.kind(bands[bi].tag + (s.rub && bi === R - 2 ? 0 : hc)).color(bands[bi].color);
    for (const side of [1, -1]) {
      const base = g.vertexCount;
      for (let i = 0; i < N; i++) {
        for (const r of [bi, bi + 1]) {
          const p = P[i][r],
            q = nrm[i][r];
          g.extra(st[i].D);
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
  g.extra(0);
  // deck (flat across the sheer line)
  g.kind((s.deckTag ?? BT.PLAIN) + (s.hc === HC.STEEL ? HC.DECK * HC_STEP : 0)).color(s.deck);
  for (let i = 0; i < N - 1; i++) {
    const A = P[i][R - 1],
      B2 = P[i + 1][R - 1];
    g.quad([A[0], A[1] - 0.02, A[2]], [-A[0], A[1] - 0.02, A[2]], [-B2[0], B2[1] - 0.02, B2[2]], [B2[0], B2[1] - 0.02, B2[2]]);
  }
  // transom
  g.kind(bands[R - 2].tag + hc).color(s.side).extra(st[0].D);
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
  g.extra(0);
}

/** sheer height & half-width at a local z (for placing deck fittings) */
export function sheerAt(s: { L: number; B: number; fb: [number, number, number]; transom: number }, z: number): { W: number; D: number } {
  const t = Math.min(1, Math.max(0, (z + s.L / 2) / s.L));
  const S = station({ ...s, draft: 0, rake: 0, side: '', boot: '', anti: '', deck: '' }, t);
  return { W: S.W, D: S.D };
}

// ───────────────────────────────────────────── small helpers

/** window frame: a dark rubber gasket + painted frame around the pane rectangle in the plane x = xx (sd = facing ±x)
 *  or z = zz (facing ±z); 5 cm wide, standing 2.5 cm proud of the wall */
function paneFrame(g: Geo, plane: 'x' | 'z', c: number, sd: number, a0: number, a1: number, y0: number, y1: number, frame: string): void {
  const fw = 0.05,
    fd = 0.03;
  const off = c + sd * (fd / 2 - 0.004);
  g.kind(BT.PLAIN).color(frame);
  const span = a1 - a0,
    mid = (a0 + a1) / 2;
  if (plane === 'x') {
    g.box(off, y1 + fw / 2, mid, fd, fw, span + fw * 2, 0);
    g.box(off, y0 - fw / 2, mid, fd, fw, span + fw * 2, 0);
    g.box(off, (y0 + y1) / 2, a0 - fw / 2, fd, y1 - y0, fw, 0);
    g.box(off, (y0 + y1) / 2, a1 + fw / 2, fd, y1 - y0, fw, 0);
  } else {
    g.box(mid, y1 + fw / 2, off, span + fw * 2, fw, fd, 0);
    g.box(mid, y0 - fw / 2, off, span + fw * 2, fw, fd, 0);
    g.box(a0 - fw / 2, (y0 + y1) / 2, off, fw, y1 - y0, fd, 0);
    g.box(a1 + fw / 2, (y0 + y1) / 2, off, fw, y1 - y0, fd, 0);
  }
}

/** rounded-rectangle ring (plan view) of half-size hx × hz around z centre zc, corner radius r, counter-clockwise
 *  seen from above; each point carries its outward normal */
function roundRing(hx: number, zc: number, hz: number, r: number, seg = 4): { p: [number, number]; n: [number, number] }[] {
  const out: { p: [number, number]; n: [number, number] }[] = [];
  const cs: [number, number, number][] = [
    [hx - r, zc + hz - r, 0],
    [-(hx - r), zc + hz - r, Math.PI / 2],
    [-(hx - r), zc - hz + r, Math.PI],
    [hx - r, zc - hz + r, (Math.PI * 3) / 2],
  ];
  for (const [cx, cz, a0] of cs)
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      const nx = Math.cos(a),
        nz = Math.sin(a);
      out.push({ p: [cx + nx * r, cz + nz * r], n: [nx, nz] });
    }
  return out;
}

/** steel / GRP deckhouse: welded walls (shader HC.SUPER, aExtra.x = window sill) on a rounded plan, framed panes with
 *  a rain eyebrow over each band; the front of a wheelhouse is split into three panes with wipers. The finished
 *  box is warped: tumblehome (sides lean in by tumble·height), a raked front (rake m at the roof: > 0 leans the
 *  windscreen forward like a workboat wheelhouse, < 0 sweeps it back like a saloon). Built in the identity frame. */
function deckhouse(
  g: Geo,
  o: { x: number; y0: number; y1: number; z0: number; z1: number; wall: string; roof: string; win: [number, number]; winTag: number; winCol: string; pane?: number; frontWin?: boolean; backWin?: boolean; wipers?: boolean; frame?: string; rake?: number; tumble?: number; radius?: number },
): void {
  const { x, y0, y1, z0, z1 } = o;
  const [wy0, wy1] = o.win;
  const frame = o.frame ?? '#3a3e42';
  const v0 = g.vertexCount;
  const zc = (z0 + z1) / 2,
    hz = (z1 - z0) / 2;
  const rad = Math.min(o.radius ?? 0.2, x * 0.4, hz * 0.4);
  // walls: one band around the rounded plan, smooth normals
  g.kind(BT.PLAIN + HC.SUPER * HC_STEP).color(o.wall).extra(wy0);
  const ring = roundRing(x, zc, hz, rad);
  for (let i = 0; i < ring.length; i++) {
    const A = ring[i],
      B = ring[(i + 1) % ring.length];
    if (Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]) < 1e-5) continue;
    const ia = g.vert(A.p[0], y0, A.p[1], A.n[0], 0, A.n[1]);
    g.vert(B.p[0], y0, B.p[1], B.n[0], 0, B.n[1]);
    g.vert(B.p[0], y1, B.p[1], B.n[0], 0, B.n[1]);
    g.vert(A.p[0], y1, A.p[1], A.n[0], 0, A.n[1]);
    g.I.push(ia, ia + 2, ia + 1, ia, ia + 3, ia + 2);
  }
  g.extra(0);
  // roof: a slab overhanging 6 cm with a rounded edge, then a raised coaming lip
  const roofSlab = (grow: number, ya: number, yb: number, col: string, top: boolean): void => {
    const rr = roundRing(x + grow, zc, hz + grow, rad + grow);
    g.color(col);
    for (let i = 0; i < rr.length; i++) {
      const A = rr[i],
        B = rr[(i + 1) % rr.length];
      if (Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]) < 1e-5) continue;
      const ia = g.vert(A.p[0], ya, A.p[1], A.n[0], 0, A.n[1]);
      g.vert(B.p[0], ya, B.p[1], B.n[0], 0, B.n[1]);
      g.vert(B.p[0], yb, B.p[1], B.n[0], 0, B.n[1]);
      g.vert(A.p[0], yb, A.p[1], A.n[0], 0, A.n[1]);
      g.I.push(ia, ia + 2, ia + 1, ia, ia + 3, ia + 2);
    }
    if (top) {
      const c = g.vert(0, yb, zc, 0, 1, 0);
      for (const q of rr) g.vert(q.p[0], yb, q.p[1], 0, 1, 0);
      for (let i = 0; i < rr.length; i++) g.I.push(c, c + 1 + ((i + 1) % rr.length), c + 1 + i);
      const d = g.vert(0, ya, zc, 0, -1, 0);
      for (const q of rr) g.vert(q.p[0], ya, q.p[1], 0, -1, 0);
      for (let i = 0; i < rr.length; i++) g.I.push(d, d + 1 + i, d + 1 + ((i + 1) % rr.length));
    }
  };
  g.kind(BT.PLAIN);
  roofSlab(0.06, y1, y1 + 0.08, o.roof, true);
  roofSlab(0.07, y1 + 0.08, y1 + 0.12, o.wall, false);
  // wheelhouse: a sun visor carried forward over the windscreen on two brackets
  if (o.wipers) {
    g.color(o.roof);
    g.box(0, y1 + 0.03, z1 + 0.2, x * 2 - 0.1, 0.035, 0.36, 0);
    g.color(o.wall);
    for (const sd of [-1, 1]) g.beam([sd * (x - 0.15), y1 - 0.12, z1 + 0.01], [sd * (x - 0.15), y1 + 0.02, z1 + 0.34], 0.03, 0.03);
  }
  const pane = o.pane ?? 0;
  for (const sd of [-1, 1]) {
    const xx = sd * (x + 0.012);
    const panes: [number, number][] = [];
    if (pane > 0) {
      const n = Math.max(1, Math.round((z1 - z0 - 0.3) / pane));
      const w = (z1 - z0 - 0.3) / n;
      for (let k = 0; k < n; k++) panes.push([z0 + 0.15 + k * w + 0.08, z0 + 0.15 + (k + 1) * w - 0.08]);
    } else panes.push([z0 + 0.22, z1 - 0.22]);
    for (const [za, zb] of panes) {
      g.kind(o.winTag).color(o.winCol).extra(wy0, wy1);
      if (sd > 0) g.quad([xx, wy0, zb], [xx, wy0, za], [xx, wy1, za], [xx, wy1, zb]);
      else g.quad([xx, wy0, za], [xx, wy0, zb], [xx, wy1, zb], [xx, wy1, za]);
      g.extra(0);
      paneFrame(g, 'x', sd * x, sd, za, zb, wy0, wy1, frame);
    }
    // rain eyebrow over the band
    g.kind(BT.PLAIN).color(o.wall);
    g.box(sd * (x + 0.04), wy1 + 0.11, (z0 + z1) / 2, 0.08, 0.035, z1 - z0 - 0.2, 0);
  }
  const ends: [number, number][] = [];
  if (o.frontWin !== false) ends.push([z1, 1]);
  if (o.backWin) ends.push([z0, -1]);
  for (const [zc, sd] of ends) {
    const zz = zc + sd * 0.012;
    const n = sd > 0 && o.wipers ? 3 : x > 1.2 ? 2 : 1;
    const span = 2 * x - 0.36,
      w = span / n;
    for (let k = 0; k < n; k++) {
      const xa = -x + 0.18 + k * w + 0.05,
        xb = -x + 0.18 + (k + 1) * w - 0.05;
      g.kind(o.winTag).color(o.winCol).extra(wy0, wy1);
      if (sd > 0) g.quad([xa, wy0, zz], [xb, wy0, zz], [xb, wy1, zz], [xa, wy1, zz]);
      else g.quad([xb, wy0, zz], [xa, wy0, zz], [xa, wy1, zz], [xb, wy1, zz]);
      g.extra(0);
      paneFrame(g, 'z', zc, sd, xa, xb, wy0, wy1, frame);
      if (sd > 0 && o.wipers) {
        // wiper parked at an angle: pivot under the pane, arm + blade
        const px = (xa + xb) / 2 - (xb - xa) * 0.3,
          h = (wy1 - wy0) * 0.8;
        g.kind(BT.PLAIN).color('#151618');
        g.beam([px, wy0 + 0.04, zz + 0.03], [px + h * 0.5, wy0 + h * 0.85, zz + 0.03], 0.018, 0.012);
        g.beam([px + h * 0.42, wy0 + h * 0.62, zz + 0.045], [px + h * 0.58, wy0 + h * 1.0, zz + 0.045], 0.022, 0.012);
        g.cyl(px, wy0 + 0.02, zz + 0.02, 0.025, 0.025, 0.04, 6, 1);
      }
    }
    g.kind(BT.PLAIN).color(o.wall);
    g.box(0, wy1 + 0.11, zc + sd * 0.04, 2 * x - 0.2, 0.035, 0.08, 0);
  }
  // warp: tumblehome + raked front, positions and normals (inverse-transpose of the Jacobian)
  const rake = o.rake ?? 0,
    tb = o.tumble ?? 0.035;
  if (rake === 0 && tb === 0) return;
  const h = y1 - y0,
    P = g.P,
    Nn = g.N;
  for (let v = v0; v < g.vertexCount; v++) {
    const px = P[v * 3],
      py = P[v * 3 + 1],
      pz = P[v * 3 + 2];
    const tu = (py - y0) / h,
      t = Math.min(1.08, Math.max(0, tu)),
      inY = tu > 0 && tu < 1.08 ? 1 : 0;
    const zu = (pz - zc) / hz,
      zf = Math.min(1, Math.max(0, zu)),
      inZ = zu > 0 && zu < 1 ? 1 : 0;
    const a = 1 - tb * t,
      c = 1 + (rake * t * inZ) / hz,
      bxy = (-px * tb * inY) / h,
      bzy = (rake * zf * inY) / h;
    P[v * 3] = px * a;
    P[v * 3 + 2] = pz + rake * t * zf;
    const n0 = Nn[v * 3],
      n1 = Nn[v * 3 + 1],
      n2 = Nn[v * 3 + 2];
    const m0 = n0 / a,
      m2 = n2 / c,
      m1 = n1 - bxy * m0 - bzy * m2;
    const l = Math.hypot(m0, m1, m2) || 1;
    Nn[v * 3] = m0 / l;
    Nn[v * 3 + 1] = m1 / l;
    Nn[v * 3 + 2] = m2 / l;
  }
}

/** torus in the current frame's XZ plane (axis = local Y); colour per segment from colAt(u 0..1) */
function torus(g: Geo, R: number, r: number, seg: number, tube: number, colAt?: (u: number) => string): void {
  for (let i = 0; i < seg; i++) {
    if (colAt) g.color(colAt((i + 0.5) / seg));
    const base = g.vertexCount;
    for (const ii of [i, i + 1]) {
      const a = (ii / seg) * Math.PI * 2,
        ca = Math.cos(a),
        sa = Math.sin(a);
      for (let k = 0; k <= tube; k++) {
        const b = (k / tube) * Math.PI * 2,
          cb = Math.cos(b),
          sb = Math.sin(b);
        g.vert((R + r * cb) * ca, r * sb, (R + r * cb) * sa, cb * ca, sb, cb * sa);
      }
    }
    for (let k = 0; k < tube; k++) {
      const a0 = base + k,
        b0 = base + tube + 1 + k;
      g.I.push(a0, a0 + 1, b0 + 1, a0, b0 + 1, b0);
    }
  }
}

/** flat rope coil lying on a deck (3–4 turns), manila or blue polyprop */
function ropeCoil(g: Geo, x: number, y: number, z: number, R: number, col: string): void {
  g.kind(BT.PLAIN).color(col);
  g.push().at(x, y, z);
  for (let k = 0; k < 4; k++) {
    g.push().at(0.01 * k, 0.026 + k * 0.045, 0.012 * k).rotX(0.05 * (k - 1.5));
    torus(g, R - k * 0.025, 0.026, 14, 4);
    g.pop();
  }
  g.pop();
}

/** horn cleat on a base plate, along local z */
function cleat(g: Geo, x: number, y: number, z: number, yaw = 0): void {
  g.kind(BT.PLAIN).color('#2c2f33');
  g.push().at(x, y, z, yaw);
  g.box(0, 0.01, 0, 0.1, 0.02, 0.22, 2);
  g.box(0, 0.06, 0, 0.05, 0.09, 0.08, 2);
  g.box(0, 0.11, 0, 0.05, 0.035, 0.36, 0);
  g.pop();
}

/** twin bitts (pair of mooring posts with caps) on a base plate, with a figure-eight of rope on some */
function bitts(g: Geo, x: number, y: number, z: number, rope?: string): void {
  g.kind(BT.PLAIN).color('#2a2c2e');
  g.box(x, y + 0.015, z, 0.36, 0.03, 0.82, 2);
  for (const dz of [-0.24, 0.24]) {
    g.cyl(x, y, z + dz, 0.11, 0.11, 0.42, 9, 0);
    g.cyl(x, y + 0.42, z + dz, 0.14, 0.14, 0.05, 9, 1);
  }
  if (rope) {
    g.color(rope);
    for (const yy of [0.18, 0.26]) {
      g.beam([x - 0.13, y + yy, z - 0.26], [x + 0.13, y + yy + 0.03, z + 0.26], 0.05, 0.05);
      g.beam([x + 0.13, y + yy + 0.015, z - 0.26], [x - 0.13, y + yy + 0.045, z + 0.26], 0.05, 0.05);
    }
  }
}

/** gooseneck / mushroom vent */
function vent(g: Geo, x: number, y: number, z: number, h: number, col: string): void {
  g.kind(BT.PLAIN).color(col);
  g.cyl(x, y, z, 0.09, 0.09, h, 8, 0);
  g.push().at(x, y + h, z).rotX(Math.PI / 2);
  g.cyl(0, -0.02, 0, 0.11, 0.11, 0.2, 8, 3);
  g.pop();
}

/** stowed anchor in a hawse pocket on the bow flank (side sd), z along the hull */
function anchor(g: Geo, s: HullSpec, z: number, y: number, sd: number): void {
  const W = sheerAt(s, z).W * 0.93;
  g.kind(BT.PLAIN).color('#141516');
  g.push().at(sd * W, y, z).rotY(sd * 0.35);
  g.box(sd * 0.01, 0, 0, 0.04, 0.38, 0.5, 0);
  g.color('#23262a');
  g.box(sd * 0.05, -0.05, 0, 0.06, 0.48, 0.1, 0);
  g.box(sd * 0.05, -0.3, 0, 0.08, 0.06, 0.44, 0);
  g.box(sd * 0.06, -0.24, 0.2, 0.06, 0.16, 0.05, 0);
  g.box(sd * 0.06, -0.24, -0.2, 0.06, 0.16, 0.05, 0);
  g.pop();
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
      g.cyl(x, y, z, 0.024, 0.022, h, 6, 0);
      g.box(x, y + 0.008, z, 0.1, 0.016, 0.1, 2);
    }
    g.beam([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.048, 0.048);
    g.beam([a[0], a[1] + h * 0.62, a[2]], [b[0], b[1] + h * 0.62, b[2]], 0.026, 0.026);
    g.beam([a[0], a[1] + h * 0.3, a[2]], [b[0], b[1] + h * 0.3, b[2]], 0.026, 0.026);
    // toe board along the deck
    g.beam([a[0], a[1] + 0.05, a[2]], [b[0], b[1] + 0.05, b[2]], 0.012, 0.1);
  }
}

function lifeRing(g: Geo, x: number, y: number, z: number, faceX: number): void {
  // bracket on the wall behind
  g.kind(BT.PLAIN).color('#cfccc4');
  g.box(x - faceX * 0.01, y + 0.24, z, 0.04, 0.05, 0.12, 0);
  g.push().at(x + faceX * 0.04, y, z).rotZ((faceX * Math.PI) / 2);
  // orange ring with four white retro-reflective tape bands
  torus(g, 0.25, 0.055, 20, 6, (u) => (Math.abs(((u * 4) % 1) - 0.5) < 0.09 ? '#f2f0ea' : '#e8582a'));
  // grab line in four loops
  g.color('#e9e2c8');
  torus(g, 0.315, 0.009, 24, 3);
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
  hc: HC.STEEL,
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
  deckhouse(g, { x: 2.25, y0: D - 0.02, y1: 3.05, z0: -6.0, z1: 4.2, wall: '#f4f1ea', roof: '#d9d5cc', win: [1.65, 2.6], winTag: BT.WINDOW, winCol: '#2f3d48', pane: 1.15, backWin: true, rake: -0.35, radius: 0.3 });
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
  deckhouse(g, { x: 1.45, y0: uy, y1: 4.95, z0: 0.6, z1: 3.6, wall: '#f4f1ea', roof: '#c7c3ba', win: [4.0, 4.75], winTag: BT.GLASS, winCol: '#22303a', pane: 0, backWin: true, wipers: true, rake: 0.3 });
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
  // life rings hung on the outside of the upper-deck railing
  for (const z of [-4.2, 2.9]) for (const sd of [-1, 1]) lifeRing(g, sd * 2.19, uy + 0.4, z, sd);
  // mooring gear: twin bitts fore and aft (rope belayed on two), cleats along the deck edge, rope coils, anchors
  bitts(g, -1.55, D, 5.4, '#d9c9a0');
  bitts(g, 1.55, D, 5.4);
  bitts(g, -1.7, D, -7.0);
  bitts(g, 1.7, D, -7.0, '#d9c9a0');
  for (const z of [-4.2, 0.2, 3.4]) for (const sd of [-1, 1]) cleat(g, sd * (sheerAt(FERRY_HULL, z).W - 0.18), D - 0.01, z);
  ropeCoil(g, 0.0, D, 7.2, 0.36, '#d9c9a0');
  ropeCoil(g, -0.55, D, -7.95, 0.28, '#2f5f9a');
  for (const sd of [-1, 1]) anchor(g, FERRY_HULL, 6.6, 0.55, sd);
  vent(g, -1.7, uy, -2.6, 0.55, '#f4f1ea');
  vent(g, 1.7, uy, -2.6, 0.55, '#f4f1ea');
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
  hc: HC.STEEL,
  L: 12,
  B: 4.6,
  draft: 1.5,
  fb: [0.9, 1.0, 1.65],
  transom: 0.86,
  rake: 0.6,
  side: '#b83a2c',
  boot: '#1c1c1c',
  anti: '#5d2620',
  deck: '#5d6158',
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
  // old lorry tyres hung on short chains over the bulwark, lying against the hull side
  for (const sd of [-1, 1]) {
    for (let z = -4.4; z <= 3.6; z += 1.6) {
      const W = sheerAt(TUG_HULL, z).W;
      const yy = 0.62 + 0.06 * Math.sin(z * 3.1 + sd);
      g.kind(BT.PLAIN).color('#151617');
      g.push().at(sd * (W + 0.13), yy, z).rotZ(Math.PI / 2).rotY(0.05 * sd);
      torus(g, 0.25, 0.11, 14, 6);
      g.pop();
      g.color('#3d3a36');
      g.beam([sd * (W + 0.1), yy + 0.33, z], [sd * 1.98, D + 0.55, z], 0.025, 0.025);
    }
  }
  // deckhouse + wheelhouse with all-round windows
  deckhouse(g, { x: 1.55, y0: D - 0.02, y1: 2.6, z0: -1.2, z1: 3.0, wall: '#efe9dc', roof: '#d8d1c2', win: [1.85, 2.1], winTag: BT.WINDOW, winCol: '#2a333b', pane: 0.6, frontWin: false, radius: 0.25 });
  deckhouse(g, { x: 1.3, y0: 2.6, y1: 4.2, z0: 0.0, z1: 2.6, wall: '#efe9dc', roof: '#b83a2c', win: [3.3, 4.0], winTag: BT.WINDOW, winCol: '#26313a', pane: 0, backWin: true, wipers: true, rake: 0.34 });
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
  // tow line flaked on the aft deck, bitts and cleats on the bulwark cap, vents, anchors
  ropeCoil(g, -1.0, D, -3.9, 0.42, '#d6c48e');
  ropeCoil(g, 1.2, D, -3.5, 0.28, '#2f5f9a');
  bitts(g, 0, D, 4.1, '#d6c48e');
  for (const z of [-4.2, 2.4]) for (const sd of [-1, 1]) cleat(g, sd * 1.7, D, z);
  vent(g, -1.2, D, -1.9, 0.7, '#efe9dc');
  vent(g, 1.2, D, -1.9, 0.7, '#efe9dc');
  for (const sd of [-1, 1]) anchor(g, TUG_HULL, 4.5, 0.75, sd);
  figure(g, 0.9, D, -4.4, Math.PI, '#e2a23a', false);
}

// ───────────────────────────────────────────── river tour boat (glass roof)

const TOUR_HULL: HullSpec = {
  hc: HC.STEEL,
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
  hc: HC.GRP,
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
  hc: HC.GRP,
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
  // outboard engine: rounded cowling with a split line and badge stripe, mid-section, leg with cavitation
  // plate + skeg, three-blade propeller, transom clamp bracket
  g.push().at(0, 0, -3.18);
  g.kind(BT.PLAIN).color('#1f2327');
  g.box(0, 0.8, 0.05, 0.3, 0.22, 0.34, 0);
  g.push().at(0, 1.08, -0.02).rotX(Math.PI / 2);
  g.cyl(0, -0.27, 0, 0.21, 0.19, 0.54, 10, 3);
  g.pop();
  g.color('#e4e6e8');
  g.box(0, 1.0, -0.02, 0.425, 0.035, 0.56, 0);
  g.color('#c92f2a');
  g.box(0, 1.12, -0.02, 0.38, 0.05, 0.3, 0);
  g.color('#2a2e33');
  g.box(0, 0.36, -0.02, 0.13, 0.62, 0.16, 0);
  g.box(0, 0.16, -0.04, 0.28, 0.02, 0.36, 0);
  g.box(0, -0.12, 0.0, 0.03, 0.2, 0.12, 0);
  g.push().at(0, -0.02, -0.14).rotX(Math.PI / 2);
  g.cyl(0, -0.03, 0, 0.045, 0.03, 0.12, 6, 1);
  g.pop();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    g.push().at(0, -0.02, -0.12).rotZ(a).rotY(0.5);
    g.box(0, 0.09, 0, 0.012, 0.15, 0.07, 0);
    g.pop();
  }
  g.color('#4a4f55');
  g.box(0, 0.78, 0.2, 0.32, 0.12, 0.06, 0);
  g.pop();
  // steering wheel on the console, bow + quarter cleats, stainless grab rails on the foredeck, stern fenders
  g.color('#1d1f22');
  g.push().at(0.45, 1.3, 0.12).rotX(-0.9);
  torus(g, 0.15, 0.015, 14, 4);
  g.pop();
  cleat(g, 0, 0.94, 2.55);
  cleat(g, -0.82, 0.86, -2.8);
  cleat(g, 0.82, 0.86, -2.8);
  g.kind(BT.PLAIN).color('#c9cdd0');
  for (const sd of [-1, 1]) {
    g.beam([sd * 0.7, 1.08, 0.75], [sd * 0.52, 1.08, 2.5], 0.022, 0.022);
    for (const z of [0.85, 2.4]) g.box(sd * (0.7 - (z - 0.75) * 0.1), 1.0, z, 0.02, 0.14, 0.02, 0);
  }
  ropeCoil(g, -0.45, 0.8, -1.55, 0.2, '#2f5f9a');
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

// ───────────────────────────────────────────── moored at the fish quay (north end of the harbour quay)

/** berths (world): the crabber lies starboard-side-to the quay wall bow north, the dinghy at the ladder */
export const FISH_BERTH = { x: QUAY_X + 2.45, z: -123.4, yaw: Math.PI };
export const PUNT_BERTH = { x: QUAY_X + 0.95, z: -131.6, yaw: Math.PI };
/** quay coping above the still water, quay bollards (world z) used by the mooring lines */
const QUAY_TOP = 0.12 - WATER_LEVEL;
const QUAY_BOLLARDS = [-138, -125, -112];
/** world point on the quay → local frame of a boat at a berth with yaw π (local +x = west = toward the quay) */
const quayLocal = (b: { x: number; z: number }, wx: number, wy: number, wz: number): V3 => [b.x - wx, wy, -(wz - b.z)];

/** a rope hanging between two local points: a round 3-strand-looking tube (lay ridges from the colour band) on a
 *  catenary-like curve whose dip is at least 5 % of the span (an unloaded line never runs straight); the low point
 *  shifts toward the lower end as on a real line */
function rope(g: Geo, a: V3, b: V3, sag: number, r: number, col: string): void {
  g.kind(BT.PLAIN).color(col);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const s = Math.max(sag, L * 0.05);
  const n = Math.max(8, Math.min(20, Math.ceil(L / 0.35))),
    seg = 6;
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * s * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  const T = new THREE.Vector3(),
    S = new THREE.Vector3(),
    U = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const base = g.vertexCount;
  for (let i = 0; i <= n; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[Math.min(n, i + 1)];
    T.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    S.crossVectors(T, Math.abs(T.y) > 0.95 ? _X : up).normalize();
    U.crossVectors(S, T);
    for (let k = 0; k <= seg; k++) {
      const an = (k / seg) * Math.PI * 2 + i * 0.9; // the twist reads as the lay of the strands
      const nx = S.x * Math.cos(an) + U.x * Math.sin(an),
        ny = S.y * Math.cos(an) + U.y * Math.sin(an),
        nz = S.z * Math.cos(an) + U.z * Math.sin(an);
      g.vert(pts[i][0] + nx * r, pts[i][1] + ny * r, pts[i][2] + nz * r, nx, ny, nz);
    }
  }
  for (let i = 0; i < n; i++)
    for (let k = 0; k < seg; k++) {
      const q = base + i * (seg + 1) + k,
        w = q + seg + 1;
      g.I.push(q, w, w + 1, q, w + 1, q + 1);
    }
}
const _X = new THREE.Vector3(1, 0, 0);

/** parlour creel: weighted base frame, three hoops with a netting skin (BT.NET), an entrance eye */
function creel(g: Geo, x: number, y: number, z: number, yaw: number): void {
  g.push().at(x, y, z, yaw);
  g.kind(BT.PLAIN).color('#2b2d2f');
  g.box(0, 0.025, 0, 0.62, 0.05, 0.44, 0);
  // hoops (half rings over the base, along x) + netting skin
  g.color('#3c4a3a');
  for (const hx of [-0.27, 0, 0.27]) {
    g.push().at(hx, 0.05, 0).rotZ(Math.PI / 2).rotY(Math.PI / 2);
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI,
        a1 = ((k + 1) / 6) * Math.PI;
      g.beam([0, Math.sin(a0) * 0.34, Math.cos(a0) * 0.22], [0, Math.sin(a1) * 0.34, Math.cos(a1) * 0.22], 0.016, 0.016);
    }
    g.pop();
  }
  g.kind(BT.NET).color('#4f7a5a');
  const N = 8;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI,
      a1 = ((k + 1) / N) * Math.PI;
    const p0: V3 = [-0.29, 0.05 + Math.sin(a0) * 0.34, Math.cos(a0) * 0.22],
      p1: V3 = [-0.29, 0.05 + Math.sin(a1) * 0.34, Math.cos(a1) * 0.22];
    g.quad([0.29, p0[1], p0[2]], [0.29, p1[1], p1[2]], p1, p0);
  }
  // end walls of netting
  for (const ex of [-0.29, 0.29]) {
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI,
        a1 = ((k + 1) / N) * Math.PI;
      g.quad([ex, 0.05, 0], [ex, 0.05 + Math.sin(a0) * 0.34, Math.cos(a0) * 0.22], [ex, 0.05 + Math.sin(a1) * 0.34, Math.cos(a1) * 0.22], [ex, 0.05, 0]);
    }
  }
  g.kind(BT.PLAIN).color('#d9cf9a');
  g.cyl(0, 0.3, 0.14, 0.05, 0.05, 0.08, 6, 0);
  g.pop();
}

/** stack of blue/red plastic fish boxes */
function fishBoxes(g: Geo, x: number, y: number, z: number, n: number, yaw: number, seed: number): void {
  g.push().at(x, y, z, yaw);
  for (let k = 0; k < n; k++) {
    g.kind(BT.PLAIN).color((seed + k) % 3 === 2 ? '#c44a2c' : '#2f6fb3');
    const yy = k * 0.27;
    g.box(0, yy + 0.02, 0, 0.74, 0.04, 0.46, 0);
    for (const sd of [-1, 1]) {
      g.box(sd * 0.36, yy + 0.15, 0, 0.025, 0.27, 0.46, 0);
      g.box(0, yy + 0.15, sd * 0.22, 0.74, 0.27, 0.025, 0);
      // hand hole
      g.color('#1a2836');
      g.box(sd * 0.375, yy + 0.21, 0, 0.012, 0.05, 0.14, 0);
      g.color((seed + k) % 3 === 2 ? '#c44a2c' : '#2f6fb3');
    }
  }
  g.pop();
}

/** dan buoy: pole with flag + radar reflector, float collar, ballast weight; leaning when stowed */
function danBuoy(g: Geo, x: number, y: number, z: number, lean: number, flagCol: string): void {
  g.push().at(x, y, z).rotX(lean);
  g.kind(BT.PLAIN).color('#d8d4c8');
  g.cyl(0, 0, 0, 0.025, 0.02, 3.2, 5, 1);
  g.color('#e8582a');
  g.cyl(0, 0.5, 0, 0.17, 0.17, 0.36, 10, 3);
  g.color('#3a3d40');
  g.cyl(0, 0.0, 0, 0.05, 0.05, 0.3, 6, 1);
  g.kind(BT.FLAG).color(flagCol);
  g.extra(0.5);
  g.quad([0, 2.75, 0.02], [0, 2.75, 0.4], [0, 3.15, 0.4], [0, 3.15, 0.02]);
  g.extra(0);
  g.pop();
}

/** orange pot buoy */
function potBuoy(g: Geo, x: number, y: number, z: number): void {
  g.kind(BT.PLAIN).color('#e8672c');
  g.sphere(x, y + 0.17, z, 0.18, 8, 5);
  g.color('#e9e2c8');
  g.cyl(x, y + 0.32, z, 0.025, 0.025, 0.08, 5, 1);
}

const FISH_HULL: HullSpec = {
  hc: HC.STEEL,
  L: 10.5,
  B: 3.7,
  draft: 1.3,
  fb: [1.2, 1.1, 1.95],
  transom: 0.8,
  rake: 0.7,
  side: '#1f4f7c',
  boot: '#f2efe6',
  anti: '#7a2e24',
  deck: '#8a8d88',
  rub: '#1b1c1e',
  stripe: { y0: 0.72, y1: 0.8, color: '#f2efe6' },
};

/** inshore crabber: forward wheelhouse, pot hauler on a davit, creels stacked aft, dan buoys, fish boxes,
 *  tyre fenders on the quay side and her mooring lines to the quay bollards */
function fishingBoat(g: Geo): void {
  hull(g, FISH_HULL);
  const D = 1.1;
  // bulwarks with a capping rail, freeing ports along the foot
  for (const sd of [-1, 1]) {
    for (let z = -4.6; z < 3.6; z += 0.9) {
      const W = sheerAt(FISH_HULL, z).W - 0.05;
      const W2 = sheerAt(FISH_HULL, z + 0.9).W - 0.05;
      g.kind(BT.PLAIN + HC.SUPER * HC_STEP).color('#1f4f7c').extra(D + 0.15);
      g.beam([sd * W, D + 0.36, z], [sd * W2, D + 0.36, z + 0.9], 0.06, 0.5);
      g.extra(0);
      g.kind(BT.PLAIN).color('#d9d4c6');
      g.beam([sd * W, D + 0.64, z], [sd * W2, D + 0.64, z + 0.9], 0.1, 0.05);
    }
  }
  // wheelhouse forward (welded steel, framed windows, wipers), whaleback forward of it
  deckhouse(g, { x: 1.25, y0: D - 0.02, y1: D + 2.15, z0: 0.7, z1: 3.3, wall: '#efebe2', roof: '#d9d4c6', win: [D + 1.25, D + 1.85], winTag: BT.GLASS, winCol: '#23303a', pane: 0.8, backWin: true, wipers: true, rake: 0.32 });
  g.kind(BT.PLAIN).color('#efebe2');
  g.box(0, D + 0.25, 4.0, 1.9, 0.5, 1.2, 0);
  // door on the port side of the wheelhouse
  g.color('#d9d4c6');
  g.box(-1.262, D + 0.85, 1.05, 0.02, 1.6, 0.6, 0);
  // mast with radar scanner + lights, aerials, searchlight
  g.color('#efebe2');
  g.cyl(0, D + 2.2, 1.9, 0.06, 0.045, 3.0, 6, 1);
  g.box(0, D + 4.2, 1.9, 1.3, 0.05, 0.08, 0);
  g.color('#e8e6de');
  g.box(0, D + 2.35, 2.5, 1.2, 0.08, 0.16, 0);
  g.color('#3a3d40');
  g.cyl(0, D + 2.2, 2.5, 0.08, 0.08, 0.15, 6, 1);
  g.color('#cfccc4');
  for (const sx of [-0.9, 0.9]) g.cyl(sx, D + 2.2, 1.0, 0.012, 0.008, 1.6, 4, 1);
  for (const L of DIMS.fish.lights) navLamp(g, L[0], L[1], L[2], L[3]);
  // pot hauler on a davit at the starboard shoulder, behind the wheelhouse
  g.kind(BT.PLAIN).color('#d6b23a');
  g.cyl(1.35, D, 0.2, 0.07, 0.06, 1.7, 8, 1);
  g.beam([1.35, D + 1.7, 0.2], [1.95, D + 1.95, 0.2], 0.08, 0.08);
  g.color('#2a2c2e');
  g.push().at(1.95, D + 1.82, 0.2).rotZ(Math.PI / 2);
  g.cyl(0, -0.04, 0, 0.13, 0.13, 0.08, 10, 3);
  g.pop();
  g.color('#3a3d40');
  g.push().at(1.3, D + 0.95, -0.1).rotX(Math.PI / 2);
  g.cyl(0, -0.15, 0, 0.2, 0.2, 0.3, 10, 3);
  g.pop();
  // creels stacked on the aft deck (fleet of pots), with their back rope
  let k = 0;
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 2; col++)
      for (let lev = 0; lev < (row === 2 ? 2 : 3); lev++) {
        creel(g, -0.42 + col * 0.84 - 0.1, D + lev * 0.4, -1.1 - row * 0.62, ((k++ * 37) % 7) * 0.02);
      }
  rope(g, [0.62, D + 1.25, -1.1], [0.62, D + 0.85, -2.4], 0.06, 0.02, '#c9b97a');
  ropeCoil(g, -1.0, D, -3.6, 0.38, '#c9b97a');
  ropeCoil(g, 0.9, D, -3.9, 0.3, '#2f5f9a');
  // fish boxes, buoys, dan buoys leaning in the stern corner, gallows at the stern
  fishBoxes(g, 0.7, D, -4.55, 3, 0.1, 1);
  fishBoxes(g, -0.15, D, -4.65, 2, -0.05, 2);
  for (const [bx, bz] of [
    [-1.1, -2.7],
    [-1.25, -3.0],
    [-0.95, -3.05],
  ])
    potBuoy(g, bx, D, bz);
  danBuoy(g, -1.3, D, -4.6, -0.5, '#1d1f22');
  danBuoy(g, -1.05, D, -4.8, -0.45, '#e2c22a');
  g.kind(BT.PLAIN).color('#d6b23a');
  for (const sd of [-1, 1]) g.beam([sd * 1.3, D, -4.9], [sd * 0.9, D + 2.2, -4.9], 0.1, 0.1);
  g.beam([-0.9, D + 2.2, -4.9], [0.9, D + 2.2, -4.9], 0.1, 0.1);
  g.color('#2a2c2e');
  g.cyl(0, D + 1.95, -4.9, 0.1, 0.1, 0.12, 8, 1);
  // deck gear: bitts fore and aft, cleats, a hose, a deckhand in oilskins sorting the catch
  bitts(g, 0.9, D, 4.45, '#c9b97a');
  bitts(g, -0.9, D, 4.45);
  for (const z of [-4.4, -0.3]) for (const sd of [-1, 1]) cleat(g, sd * (sheerAt(FISH_HULL, z).W - 0.25), D, z);
  rope(g, [-1.0, D + 0.05, 0.4], [0.3, D + 0.05, -0.4], 0.0, 0.03, '#d6c43a');
  lifeRing(g, -1.272, D + 1.0, 2.6, -1);
  figure(g, 0.2, D, -3.0, Math.PI * 0.8, '#e8a21c', false);
  // tyre fenders on the quay side (+x) on short lines over the bulwark
  for (const z of [-3.2, -0.6, 2.0]) {
    const W = sheerAt(FISH_HULL, z).W;
    g.kind(BT.PLAIN).color('#151617');
    g.push().at(W + 0.13, 0.75, z).rotZ(Math.PI / 2);
    torus(g, 0.26, 0.11, 14, 6);
    g.pop();
    rope(g, [W + 0.12, 1.06, z], [W - 0.03, D + 0.66, z], 0.0, 0.016, '#c9b97a');
  }
  // mooring lines (bow line, spring, stern line) from the cleats/bitts to the quay bollards
  const bol = QUAY_BOLLARDS.map((z) => quayLocal(FISH_BERTH, QUAY_X + 0.06, QUAY_TOP + 0.035, z));
  rope(g, [0.9, D + 0.32, 4.45], bol[0], 0.7, 0.03, '#d6c48e');
  rope(g, [sheerAt(FISH_HULL, -0.3).W - 0.25, D + 0.12, -0.3], bol[1], 0.25, 0.028, '#d6c48e');
  rope(g, [sheerAt(FISH_HULL, -4.4).W - 0.25, D + 0.12, -4.4], bol[2], 0.6, 0.03, '#2f5f9a');
}

const PUNT_HULL: HullSpec = {
  hc: HC.GRP,
  L: 3.4,
  B: 1.45,
  draft: 0.25,
  fb: [0.42, 0.4, 0.52],
  transom: 0.78,
  rake: 0.25,
  side: '#e7e2d4',
  boot: '#5b6b4a',
  anti: '#5b6b4a',
  deck: '#b9a27e',
  stripe: { y0: 0.3, y1: 0.34, color: '#2f6f8a' },
};

/** open dinghy at the quay ladder: thwarts, oars stowed, a tarp over the bow, a small tilted outboard,
 *  bilge water, a bucket, the painter up to the ladder */
function punt(g: Geo): void {
  hull(g, PUNT_HULL);
  const D = 0.4;
  // floor boards inside (the hull deck sits at the sheer — lower floor + inner sides)
  g.kind(BT.PLAIN).color('#9a8462');
  for (const z of [-0.9, 0.0, 0.85]) g.box(0, D - 0.02, z, sheerAt(PUNT_HULL, z).W * 1.8, 0.04, 0.22, 0);
  // gunwale rubbing strip
  for (const sd of [-1, 1]) {
    g.color('#6b4a2e');
    for (let z = -1.6; z < 1.5; z += 0.4) {
      const a = sheerAt(PUNT_HULL, z),
        b = sheerAt(PUNT_HULL, z + 0.4);
      g.beam([sd * a.W, a.D + 0.02, z], [sd * b.W, b.D + 0.02, z + 0.4], 0.05, 0.05);
    }
  }
  // oars along the thwarts (looms + blades), rowlocks
  g.color('#c9a46a');
  for (const sd of [-1, 1]) {
    g.beam([sd * 0.3, D + 0.12, -1.3], [sd * 0.38, D + 0.12, 1.15], 0.04, 0.04);
    g.box(sd * 0.38, D + 0.12, 1.3, 0.13, 0.015, 0.45, 0);
    g.color('#3a3d40');
    g.cyl(sd * 0.62, D + 0.02, -0.15, 0.015, 0.015, 0.1, 5, 1);
    g.color('#c9a46a');
  }
  // tarp lashed over the bow (folds), bucket, bilge water
  g.kind(BT.PLAIN).color('#4f7fa8');
  const tz0 = 0.55,
    tz1 = 1.6;
  for (let i = 0; i < 4; i++) {
    const za = tz0 + ((tz1 - tz0) * i) / 4,
      zb = tz0 + ((tz1 - tz0) * (i + 1)) / 4;
    const wa = sheerAt(PUNT_HULL, za).W + 0.02,
      wb = sheerAt(PUNT_HULL, zb).W + 0.02;
    const ha = D + 0.18 + 0.05 * (i % 2),
      hb = D + 0.18 + 0.05 * ((i + 1) % 2);
    g.quad([-wa, D + 0.02, za], [-wb, D + 0.02, zb], [0, hb, zb], [0, ha, za]);
    g.quad([0, ha, za], [0, hb, zb], [wb, D + 0.02, zb], [wa, D + 0.02, za]);
  }
  g.color('#d7d2c6');
  g.cyl(-0.3, D, -1.0, 0.12, 0.1, 0.25, 8, 1);
  g.kind(BT.GLASS).color('#4a5a52');
  g.box(0.1, D + 0.005, -0.4, 0.7, 0.01, 0.6, 0);
  // small outboard, tilted up out of the water
  g.push().at(0, D + 0.05, -1.72).rotX(-0.9);
  g.kind(BT.PLAIN).color('#d8d9d6');
  g.box(0, 0.2, 0, 0.26, 0.3, 0.32, 0);
  g.color('#3a3f45');
  g.box(0, -0.3, 0.02, 0.08, 0.6, 0.1, 0);
  g.pop();
  // painter from the bow eye up the quay to the ladder top
  const top = quayLocal(PUNT_BERTH, QUAY_X - 0.1, QUAY_TOP + 0.05, PUNT_BERTH.z - 0.6);
  rope(g, [0, D + 0.1, 1.68], top, 0.4, 0.014, '#e9e2c8');
}

export function buildBigBoats(): THREE.BufferGeometry {
  const g = new Geo();
  g.variant(1);
  ferry(g);
  g.variant(2);
  tug(g);
  g.variant(3);
  tour(g);
  g.variant(4);
  fishingBoat(g);
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
  g.variant(4);
  punt(g);
  g.variant(0);
  return g.build({ anim: false, extra: true });
}
