// River structures: elegant arched footbridges (cream open-spandrel steel arches under a planked
// deck that follows the pedestrian path profile EXACTLY, dark-green iron railings, lamps, stone
// abutments that fit the promenade railing gaps) and the rowing-club jetty (steps down to a
// floating pontoon, guide piles, rowing boats tied up alongside).

import { WATER_LEVEL } from '../../core/constants';
import type { PedNetwork } from '../../core/pedNetwork';
import type { Rng } from '../../core/rng';
import { EMIT, HB, PAT, type V3 } from './geo';
import type { GlowPoint } from './material';

const IRON = '#2f4a3e';
const IRON_HI = '#3d5d4f';
const STONE = '#b8ab95';
const ARCH = '#f0ebe0';

/** Walking-surface profile of the footbridge at x, from the pedestrian graph (exact edgeY). */
export function bridgeProfile(peds: PedNetwork, x: number, zN: number, zS: number): ((z: number) => number) | null {
  const segs: { z0: number; z1: number; f: (t: number) => number }[] = [];
  for (const e of peds.edges) {
    if (e.kind !== 'bridge') continue;
    const A = peds.nodes[e.a],
      B = peds.nodes[e.b];
    if (Math.abs(A.x - x) > 0.05 || Math.abs(B.x - x) > 0.05) continue;
    if (A.z <= B.z) segs.push({ z0: A.z, z1: B.z, f: (t) => peds.edgeY(e, t) });
    else segs.push({ z0: B.z, z1: A.z, f: (t) => peds.edgeY(e, 1 - t) });
  }
  if (!segs.length) return null;
  segs.sort((a, b) => a.z0 - b.z0);
  if (Math.abs(segs[0].z0 - Math.min(zN, zS)) > 0.2 || Math.abs(segs[segs.length - 1].z1 - Math.max(zN, zS)) > 0.2) return null;
  return (z: number) => {
    for (const s of segs) {
      if (z >= s.z0 - 1e-6 && z <= s.z1 + 1e-6) return s.f((z - s.z0) / Math.max(1e-6, s.z1 - s.z0));
    }
    return z < segs[0].z0 ? segs[0].f(0) : segs[segs.length - 1].f(1);
  };
}

export interface BridgeSpec {
  x: number;
  zN: number;
  zS: number;
  /** river wall faces */
  wallN: number;
  wallS: number;
  width: number;
  /** gap half width available in the promenade railing */
  gapHalf: number;
  profile: (z: number) => number;
}

export interface BridgeInfo {
  /** lowest soffit above WATER_LEVEL over the middle 60 % of the river */
  clearanceMid: number;
  soffit: (z: number) => number;
}

export function buildFootbridge(b: HB, s: BridgeSpec, ground: (x: number, z: number) => number, glows: GlowPoint[]): BridgeInfo {
  const { x, zN, zS, wallN, wallS, profile } = s;
  const dy = 0.012; // planks sit a hair above the path surface (no z-fight with the paving at the ends)
  const hd = 1.5; // walking deck half width
  const hf = Math.min(s.width / 2 - 0.05, 1.75); // fascia half width
  const ha = Math.min(s.gapHalf - 0.1, 2.15); // abutment half width
  const deckT = 0.24;
  // sample stations
  const zs: number[] = [];
  for (let z = zN; z < zS - 1e-6; z += 0.25) zs.push(z);
  zs.push(zS);
  for (const k of [wallN, wallS]) if (!zs.some((q) => Math.abs(q - k) < 0.02)) zs.push(k);
  zs.sort((a, c) => a - c);
  const Y = (z: number) => profile(z) + dy;
  b.noEmit();
  // ── deck planks (top), fascia sides, soffit
  b.color('#a9825c').pat(PAT.PLANKS_Z, 0.22);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i],
      z1 = zs[i + 1];
    b.quad([x - hd, Y(z0), z0], [x - hd, Y(z1), z1], [x + hd, Y(z1), z1], [x + hd, Y(z0), z0]);
  }
  b.pat(PAT.NONE);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i],
      z1 = zs[i + 1];
    const a0 = Y(z0),
      a1 = Y(z1);
    // kerbs
    b.color(ARCH);
    for (const sd of [-1, 1]) {
      const xi = x + sd * hd,
        xo = x + sd * hf;
      const k0 = a0 + 0.1,
        k1 = a1 + 0.1;
      b.quad(sd > 0 ? [xi, k0, z0] : [xo, k0, z0], sd > 0 ? [xi, k1, z1] : [xo, k1, z1], sd > 0 ? [xo, k1, z1] : [xi, k1, z1], sd > 0 ? [xo, k0, z0] : [xi, k0, z0]);
      // inner kerb face
      if (sd > 0) b.quad([xi, a0, z0], [xi, a1, z1], [xi, k1, z1], [xi, k0, z0]);
      else b.quad([xi, a0, z0], [xi, k0, z0], [xi, k1, z1], [xi, a1, z1]);
      // outer fascia
      if (sd > 0) b.quad([xo, a0 - deckT, z0], [xo, k0, z0], [xo, k1, z1], [xo, a1 - deckT, z1]);
      else b.quad([xo, a0 - deckT, z0], [xo, a1 - deckT, z1], [xo, k1, z1], [xo, k0, z0]);
    }
    // soffit
    b.color('#d9d2c4');
    b.quad([x - hf, a0 - deckT, z0], [x + hf, a0 - deckT, z0], [x + hf, a1 - deckT, z1], [x - hf, a1 - deckT, z1]);
  }
  // ── stone abutments under both ramps (from the path end to the river wall)
  b.color(STONE).pat(PAT.STONE, 0.9);
  for (const [za, zb] of [
    [zN, wallN],
    [wallS, zS],
  ] as [number, number][]) {
    const zz: number[] = zs.filter((z) => z >= za - 1e-6 && z <= zb + 1e-6);
    for (let i = 0; i < zz.length - 1; i++) {
      const z0 = zz[i],
        z1 = zz[i + 1];
      const t0 = Y(z0) - deckT,
        t1 = Y(z1) - deckT;
      const g0 = Math.min(ground(x - ha, z0), ground(x + ha, z0), 0) - 0.3,
        g1 = Math.min(ground(x - ha, z1), ground(x + ha, z1), 0) - 0.3;
      for (const sd of [-1, 1]) {
        const xo = x + sd * ha;
        const tt0 = Y(z0) + 0.32,
          tt1 = Y(z1) + 0.32;
        if (sd > 0) b.quad([xo, g0, z0], [xo, tt0, z0], [xo, tt1, z1], [xo, g1, z1]);
        else b.quad([xo, g0, z0], [xo, g1, z1], [xo, tt1, z1], [xo, tt0, z0]);
        // cheek wall top + inner face (between the abutment edge and the fascia)
        const xi = x + sd * hf;
        b.quad(sd > 0 ? [xi, tt0, z0] : [xo, tt0, z0], sd > 0 ? [xi, tt1, z1] : [xo, tt1, z1], sd > 0 ? [xo, tt1, z1] : [xi, tt1, z1], sd > 0 ? [xo, tt0, z0] : [xi, tt0, z0]);
        if (sd > 0) b.quad([xi, Y(z0) + 0.1, z0], [xi, Y(z1) + 0.1, z1], [xi, tt1, z1], [xi, tt0, z0]);
        else b.quad([xi, Y(z0) + 0.1, z0], [xi, tt0, z0], [xi, tt1, z1], [xi, Y(z1) + 0.1, z1]);
      }
      void t0;
      void t1;
    }
    // end faces
    for (const [ze, sgn] of [
      [za, -1],
      [zb, 1],
    ] as [number, number][]) {
      const top = Y(ze) + 0.32;
      const g = Math.min(ground(x, ze), 0) - 0.3;
      if (sgn < 0) b.quad([x + ha, g, ze], [x - ha, g, ze], [x - ha, top, ze], [x + ha, top, ze]);
      else b.quad([x - ha, g, ze], [x + ha, g, ze], [x + ha, top, ze], [x - ha, top, ze]);
    }
  }
  b.pat(PAT.NONE);
  // ── arch ribs (open spandrel), cross bracing, spandrel posts + rings
  const zA = wallN + 0.05,
    zB = wallS - 0.05;
  const zc = (zA + zB) / 2;
  const crown = Y(zc) - deckT - 0.2;
  const spring = -0.35;
  const rib = (z: number) => {
    const t = (z - zA) / (zB - zA);
    const u = 2 * t - 1;
    return spring + (crown - spring) * (1 - u * u);
  };
  const ribPts: number[] = [];
  for (let k = 0; k <= 32; k++) ribPts.push(zA + ((zB - zA) * k) / 32);
  b.color(ARCH);
  for (const sd of [-1, 1]) {
    const rx = x + sd * (hf - 0.22);
    for (let k = 0; k < ribPts.length - 1; k++) {
      const z0 = ribPts[k],
        z1 = ribPts[k + 1];
      b.beam([rx, rib(z0), z0], [rx, rib(z1), z1], 0.22, 0.36, k === 0 || k === ribPts.length - 2);
    }
    // spandrel posts
    for (let z = zA + 0.7; z < zB - 0.5; z += 1.05) {
      const yb = rib(z) + 0.15,
        yt = Y(z) - deckT;
      if (yt - yb < 0.12) continue;
      b.box(rx, (yb + yt) / 2, z, 0.09, yt - yb, 0.09, 0, 3);
    }
    // decorative rings in the tall spandrels near the ends
    for (const z of [zA + 1.25, zA + 2.35, zB - 2.35, zB - 1.25]) {
      const yb = rib(z) + 0.15,
        yt = Y(z) - deckT;
      const r = Math.min(0.45, (yt - yb) / 2 - 0.05);
      if (r < 0.15) continue;
      const pts: V3[] = [];
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        pts.push([rx, (yb + yt) / 2 + Math.sin(a) * r, z + Math.cos(a) * r]);
      }
      b.tube(pts, 0.035, 4);
    }
    // bearing blocks on the wall faces
    b.color(STONE);
    b.box(rx, spring - 0.15, sd > 0 ? zA - 0.02 : zA - 0.02, 0.5, 0.5, 0.3, 0, 0);
    b.box(rx, spring - 0.15, zB + 0.02, 0.5, 0.5, 0.3, 0, 0);
    b.color(ARCH);
  }
  b.color('#e3ddd0');
  for (let z = zA + 1.2; z < zB - 1.0; z += 2.0) b.beam([x - hf + 0.3, rib(z), z], [x + hf - 0.3, rib(z), z], 0.08, 0.12);
  // ── railings (follow the deck), dark green iron
  const railX = [x - hf + 0.08, x + hf - 0.08];
  for (const rx of railX) {
    const pts: V3[] = [];
    for (let z = zN + 0.15; z <= zS - 0.15 + 1e-6; z += 0.5) pts.push([rx, Y(z) + 0.1, z]);
    b.color(IRON_HI);
    for (let k = 0; k < pts.length - 1; k++) b.beam([pts[k][0], pts[k][1] + 0.98, pts[k][2]], [pts[k + 1][0], pts[k + 1][1] + 0.98, pts[k + 1][2]], 0.07, 0.06, false);
    b.color(IRON);
    for (let k = 0; k < pts.length - 1; k++) {
      b.beam([pts[k][0], pts[k][1] + 0.5, pts[k][2]], [pts[k + 1][0], pts[k + 1][1] + 0.5, pts[k + 1][2]], 0.04, 0.04, false);
      b.beam([pts[k][0], pts[k][1] + 0.1, pts[k][2]], [pts[k + 1][0], pts[k + 1][1] + 0.1, pts[k + 1][2]], 0.04, 0.04, false);
    }
    for (let k = 0; k < pts.length; k++) {
      const [px, py, pz] = pts[k];
      if (k % 2 === 0) b.box(px, py + 0.5, pz, 0.05, 1.0, 0.05, 0, 3);
      else b.box(px, py + 0.3, pz, 0.02, 0.4, 0.02, 0, 3);
    }
  }
  // ── lamps at the four corners of the span
  for (const lz of [wallN - 0.45, wallS + 0.45]) {
    for (const sd of [-1, 1]) {
      const lx = x + sd * (ha - 0.2);
      const by = Y(lz) + 0.32;
      b.color(IRON);
      b.box(lx, by + 0.18, lz, 0.18, 0.36, 0.18, 0, 1);
      b.cyl([lx, by + 0.36, lz], [lx, by + 3.3, lz], 0.05, 0.04, 6, 0);
      b.box(lx, by + 3.32, lz, 0.22, 0.04, 0.22, 0, 0);
      b.box(lx, by + 3.95, lz, 0.16, 0.03, 0.16, 0, 0);
      b.color('#ffe2a8').emit('#ffd59a', 2.4, EMIT.LIGHTS);
      b.box(lx, by + 3.63, lz, 0.17, 0.27, 0.17, Math.PI / 4, 3);
      b.noEmit();
      glows.push({ x: lx, y: by + 3.63, z: lz, size: 1.1, color: '#ffd08c', intensity: 1.0 });
    }
    glows.push({ x, y: Y(lz) + 0.04, z: lz, size: 3.2, pool: true, color: '#ffbe72', intensity: 0.3 });
  }
  // clearance over the middle 60 % of the river
  let clearanceMid = Infinity;
  const w = wallS - wallN;
  for (let z = wallN + w * 0.2; z <= wallS - w * 0.2; z += 0.25) clearanceMid = Math.min(clearanceMid, rib(z) - 0.18 - WATER_LEVEL, Y(z) - deckT - WATER_LEVEL);
  return { clearanceMid, soffit: (z: number) => (z > zA && z < zB ? Math.min(rib(z) - 0.18, Y(z) - deckT) : Infinity) };
}

// ─────────────────────────────────────────────────────── rowing-club jetty

export interface JettyInfo {
  /** pontoon + boats footprint in the river */
  rect: { x0: number; z0: number; x1: number; z1: number };
  boats: number;
}

export function buildJetty(b: HB, x: number, zBank: number, zTip: number, rng: Rng, glows: GlowPoint[]): JettyInfo {
  const dir = Math.sign(zTip - zBank) || -1; // towards the river (−z on the south bank)
  const top = WATER_LEVEL + 0.32;
  const pw = 1.5; // pontoon half width
  const zP0 = zBank + dir * 2.0; // pontoon starts here
  const zP1 = zTip - dir * 0.4;
  const bankY = 0.2;
  b.noEmit().pat(PAT.NONE);
  // landing on the coping + steps down to the pontoon
  b.color('#9a7651').pat(PAT.PLANKS_Z, 0.25);
  b.boxMM(x - 1.0, bankY - 0.06, Math.min(zBank - dir * 0.2, zBank + dir * 0.35), x + 1.0, bankY + 0.04, Math.max(zBank - dir * 0.2, zBank + dir * 0.35), 1);
  b.pat(PAT.NONE);
  const steps = 7;
  const z0s = zBank + dir * 0.35,
    z1s = zP0;
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps,
      t1 = (k + 1) / steps;
    const za = z0s + (z1s - z0s) * t0,
      zb = z0s + (z1s - z0s) * t1;
    const y = bankY + (top - bankY) * t1;
    b.color(k % 2 === 0 ? '#a07b55' : '#94704b');
    b.boxMM(x - 0.8, y - 0.06, Math.min(za, zb), x + 0.8, y + 0.04, Math.max(za, zb), 0);
  }
  // stringers + handrails
  b.color('#6e5238');
  for (const sd of [-1, 1]) {
    b.beam([x + sd * 0.85, bankY - 0.1, z0s], [x + sd * 0.85, top - 0.05, z1s], 0.08, 0.3);
    b.color('#e8e2d4');
    b.beam([x + sd * 0.9, bankY + 0.95, z0s], [x + sd * 0.9, top + 0.95, z1s], 0.05, 0.05);
    b.box(x + sd * 0.9, bankY + 0.48, z0s, 0.06, 0.95, 0.06, 0, 3);
    b.box(x + sd * 0.9, top + 0.48, z1s, 0.06, 0.95, 0.06, 0, 3);
    b.color('#6e5238');
  }
  // floating pontoon
  const za = Math.min(zP0, zP1),
    zb = Math.max(zP0, zP1);
  b.color('#5d6266');
  b.boxMM(x - pw, WATER_LEVEL - 0.25, za, x + pw, top - 0.1, zb, 1);
  b.color('#a9825c').pat(PAT.PLANKS_X, 0.24);
  b.boxMM(x - pw, top - 0.1, za, x + pw, top, zb, 1);
  b.pat(PAT.NONE);
  b.color('#2a2c2f');
  for (const sd of [-1, 1]) b.boxMM(sd > 0 ? x + pw : x - pw - 0.12, top - 0.3, za + 0.1, sd > 0 ? x + pw + 0.12 : x - pw, top - 0.08, zb - 0.1, 1);
  // guide piles
  b.color('#6b5a46');
  for (const [px, pz] of [
    [x - pw - 0.25, za + 0.4],
    [x + pw + 0.25, za + 0.4],
    [x - pw - 0.25, zb - 0.4],
    [x + pw + 0.25, zb - 0.4],
  ] as [number, number][]) {
    b.cyl([px, WATER_LEVEL - 1.5, pz], [px, top + 0.9, pz], 0.14, 0.13, 7, 2);
  }
  // cleats
  b.color('#2c2f33');
  for (const sd of [-1, 1]) for (const z of [za + 0.6, zb - 0.6]) b.box(x + sd * (pw - 0.2), top + 0.06, z, 0.12, 0.08, 0.35, 0, 1);
  // upturned canoe on trestles on the pontoon
  b.color('#8a6a4a');
  for (const tz of [za + 0.8, zb - 0.8]) b.box(x - 0.6, top + 0.22, tz, 0.5, 0.44, 0.08, 0, 1);
  b.color('#d0603c');
  b.pushT(x - 0.6, top + 0.76, (za + zb) / 2, 0, 0, Math.PI);
  boatHull(b, 2.4, 0.62, 0.3, '#d0603c', '#d0603c', 0, false);
  b.pop();
  // rowing boats alongside (static, afloat)
  const looks: [string, string][] = [
    ['#f2efe6', '#2a9d8f'],
    ['#2a6f97', '#f2efe6'],
    ['#b5583e', '#f2efe6'],
  ];
  let boats = 0;
  for (const sd of [-1, 1]) {
    const [hullC, trimC] = looks[(boats + (sd > 0 ? 1 : 0)) % looks.length];
    const bx = x + sd * (pw + 0.95);
    const bz = (za + zb) / 2 + rng.range(-0.3, 0.3);
    b.pushT(bx, WATER_LEVEL - 0.12, bz, dir < 0 ? Math.PI + rng.range(-0.05, 0.05) : rng.range(-0.05, 0.05));
    boatHull(b, 3.7, 1.25, 0.48, hullC, trimC, 3, true);
    b.pop();
    // painter line to the cleat
    b.color('#d8c8a0');
    b.tube(
      [
        [bx - sd * 0.1, WATER_LEVEL + 0.33, bz + dir * 1.6],
        [x + sd * (pw - 0.2), top + 0.08, bz + dir * 1.2],
      ],
      0.025,
      3,
    );
    boats++;
  }
  // lamp at the landing
  b.color(IRON);
  b.cyl([x + 1.1, bankY, zBank + dir * 0.1], [x + 1.1, bankY + 3.0, zBank + dir * 0.1], 0.05, 0.04, 6, 0);
  b.color('#ffe2a8').emit('#ffd59a', 2.2, EMIT.LIGHTS);
  b.box(x + 1.1, bankY + 3.1, zBank + dir * 0.1, 0.18, 0.26, 0.18, Math.PI / 4, 0);
  b.noEmit();
  glows.push({ x: x + 1.1, y: bankY + 3.1, z: zBank + dir * 0.1, size: 1.0, color: '#ffd08c', intensity: 0.95 });
  glows.push({ x, y: top + 0.03, z: (za + zb) / 2, size: 3.0, pool: true, color: '#ffbe72', intensity: 0.22 });
  return { rect: { x0: x - pw - 1.8, z0: za - 0.3, x1: x + pw + 1.8, z1: Math.max(zBank, zb) }, boats };
}

/** Small open boat in the current frame: length along z (bow +z), bottom at y=0. */
export function boatHull(b: HB, L: number, B: number, D: number, hullC: string, trimC: string, thwarts: number, oars: boolean): void {
  const st = [-0.5, -0.38, -0.2, 0, 0.2, 0.36, 0.5].map((t) => t * L);
  const half = (z: number) => {
    const u = z / (L / 2);
    if (u > 0) return (B / 2) * Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.6);
    return (B / 2) * (1 - 0.32 * Math.pow(-u, 2.5));
  };
  const sheer = (z: number) => D + 0.12 * Math.pow(Math.abs(z) / (L / 2), 2);
  b.noEmit().pat(PAT.NONE);
  for (let i = 0; i < st.length - 1; i++) {
    const z0 = st[i],
      z1 = st[i + 1];
    const w0 = half(z0),
      w1 = half(z1);
    const s0 = sheer(z0),
      s1 = sheer(z1);
    for (const sd of [-1, 1]) {
      const T0: V3 = [sd * w0, s0, z0],
        T1: V3 = [sd * w1, s1, z1],
        B0: V3 = [sd * w0 * 0.45, 0, z0],
        B1: V3 = [sd * w1 * 0.45, 0, z1];
      b.color(hullC);
      if (sd > 0) b.quad(T0, T1, B1, B0);
      else b.quad(T0, B0, B1, T1);
      // inside (wood)
      b.color('#b88a5a');
      const I0: V3 = [sd * (w0 - 0.04), s0 - 0.02, z0],
        I1: V3 = [sd * (w1 - 0.04), s1 - 0.02, z1],
        J0: V3 = [sd * w0 * 0.4, 0.06, z0],
        J1: V3 = [sd * w1 * 0.4, 0.06, z1];
      if (sd > 0) b.quad(I0, J0, J1, I1);
      else b.quad(I0, I1, J1, J0);
      // gunwale
      b.color(trimC);
      b.beam([sd * w0, s0, z0], [sd * w1, s1, z1], 0.07, 0.07, false);
    }
    // bottom outside + floorboards inside
    b.color(hullC);
    b.quad([-w0 * 0.45, 0, z0], [w0 * 0.45, 0, z0], [w1 * 0.45, 0, z1], [-w1 * 0.45, 0, z1]);
    b.color('#a07b55');
    b.quad([-w0 * 0.4, 0.06, z0], [-w1 * 0.4, 0.06, z1], [w1 * 0.4, 0.06, z1], [w0 * 0.4, 0.06, z0]);
  }
  // transom
  const zt = st[0];
  const wt = half(zt),
    stt = sheer(zt);
  b.color(hullC);
  b.quad([wt, stt, zt], [-wt, stt, zt], [-wt * 0.45, 0, zt], [wt * 0.45, 0, zt]);
  b.quad([wt, stt, zt], [wt * 0.45, 0, zt], [-wt * 0.45, 0, zt], [-wt, stt, zt]);
  // thwarts
  b.color('#a07b55');
  for (let k = 0; k < thwarts; k++) {
    const z = -L * 0.3 + (L * 0.6 * (k + 0.5)) / thwarts;
    const w = half(z) - 0.06;
    b.box(0, D * 0.62, z, w * 2, 0.04, 0.22, 0, 0);
  }
  if (oars) {
    b.color('#c9a77a');
    for (const sd of [-1, 1]) {
      b.box(sd * 0.22, D * 0.66, -0.1, 0.05, 0.04, L * 0.72, sd * 0.05, 0);
      b.box(sd * 0.22, D * 0.66, -0.1 + L * 0.34, 0.12, 0.02, 0.4, sd * 0.05, 0);
    }
  }
}
