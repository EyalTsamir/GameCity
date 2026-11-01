// Carriageways, curbs, gutters and raised sidewalks.
//
// Every junction is described by its curb "chains": walking clockwise from one present arm to
// the next, the curb line is
//   * a concave fillet (radius CURB_R) between two present arms (turning cars clear the corner),
//   * straight across a missing arm (T-junctions),
//   * a convex quarter circle (CURB_RO) at the outer corner of a bend.
// The carriageway polygon is the loop of all chains; the sidewalk is everything between a chain and
// the 13x13 m junction box. Each chain is extruded with the curb profile (gutter, curb face, chamfer,
// curb top, paving rows) and dropped kerbs are carved at every crosswalk end (linear ramp + flares).

import type { CityContext } from '../../core/context';
import type { Dir, P2 } from '../../core/geom';
import type { DistrictKind } from '../../core/plan';
import { CORRIDOR_HALF, ROAD_HALF, SIDEWALK_Y } from '../../core/constants';
import { hash01 } from '../../core/rng';
import { streetDetail } from '../../core/streetdetail';
import type { MeshBuilder } from './builder';
import { HM, surf } from './surfaces';

export const Y = {
  ground: -0.04,
  asphalt: 0.01,
  gutter: 0.014,
  shoulder: 0.012,
  cover: 0.02,
  path: 0.03,
  pathPaved: 0.035,
  walk: SIDEWALK_Y,
  deck: 0.3,
} as const;

export { HM };

export const CURB_R = 2.5;
export const CURB_RO = 3.5;
const GUTTER = 0.3;
const CHAMFER = 0.025;
const CURB_TOP = 0.2;
/** dropped kerb: along-arm window (flare start, core start, core end, flare end), ramp length, drop */
const RAMP = { a0: 3.9, a1: 4.3, a2: 6.0, a3: 6.4, len: 1.5, drop: 0.115 };
/** vehicle crossover at a driveway mouth: kerb lowered to ~2.5 cm, ramp within the first row, flares */
const DRIVE = { flare: 0.5, len: 0.86, drop: 0.11 };
const ROWS_JUNCTION = [CURB_TOP, 0.86, 1.5, 1.7];
const ROWS_SEGMENT = [CURB_TOP, 0.86, 1.5, 1.7, CORRIDOR_HALF - ROAD_HALF];

const V: P2[] = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const m4 = (i: number) => ((i % 4) + 4) % 4;
const add = (a: P2, b: P2): P2 => ({ x: a.x + b.x, z: a.z + b.z });
const mul = (a: P2, s: number): P2 => ({ x: a.x * s, z: a.z * s });

type Part = { kind: 'line'; a: P2; b: P2; n: P2 } | { kind: 'arc'; c: P2; r: number; a0: number; a1: number; convex: boolean };

/** Chain sample (junction-local or world coordinates) with the sidewalk-side normal and curb arclength. */
export interface CurbPt {
  x: number;
  z: number;
  nx: number;
  nz: number;
  u: number;
}

export interface StreetStats {
  junctions: number;
  segments: number;
  rampEnds: number;
  /** dropped kerbs at driveway mouths */
  driveKerbs: number;
}

/** paving style of a sidewalk by the district it borders */
export function walkStyle(kind: DistrictKind | undefined): number {
  switch (kind) {
    case 'downtown':
    case 'midtown':
    case 'civic':
    case 'station':
      return 0;
    case 'oldtown':
    case 'market':
      return 1;
    case 'industrial':
    case 'harbor':
      return 3;
    default:
      return 2;
  }
}

function win(a: number): [number, number] {
  const { a0, a1, a2, a3 } = RAMP;
  if (a <= a0 || a >= a3) return [0, 0];
  if (a < a1) return [(a - a0) / (a1 - a0), 1 / (a1 - a0)];
  if (a > a2) return [(a3 - a) / (a3 - a2), -1 / (a3 - a2)];
  return [1, 0];
}

/** Curb chains of a junction in local coordinates. `present[i]` for sides N,E,S,W. */
export function junctionChains(present: boolean[]): { start: number; end: number; pts: CurbPt[] }[] {
  const H = ROAD_HALF,
    B = CORRIDOR_HALF;
  const out: { start: number; end: number; pts: CurbPt[] }[] = [];
  for (let i = 0; i < 4; i++) {
    if (!present[i]) continue;
    const parts: Part[] = [];
    let k = i;
    let cur = add(mul(V[i], B), mul(V[m4(i + 1)], H));
    let curN = V[m4(i + 1)];
    let end = -1;
    for (let guard = 0; guard < 5 && end < 0; guard++) {
      const k1 = m4(k + 1);
      const pk = present[k],
        pq = present[k1];
      if (pk && pq) {
        const F = add(mul(V[k], H + CURB_R), mul(V[k1], H + CURB_R));
        const s = add(mul(V[k], H + CURB_R), mul(V[k1], H));
        parts.push({ kind: 'line', a: cur, b: s, n: curN });
        parts.push({ kind: 'arc', c: F, r: CURB_R, a0: Math.atan2(-V[k1].z, -V[k1].x), a1: Math.atan2(-V[k].z, -V[k].x), convex: false });
        const e = add(mul(V[k], H), mul(V[k1], H + CURB_R));
        parts.push({ kind: 'line', a: e, b: add(mul(V[k1], B), mul(V[k], H)), n: V[k] });
        end = k1;
      } else if (pk && !pq) {
        k = k1; // straight on along the missing side's edge (same line)
      } else if (!pk && pq) {
        parts.push({ kind: 'line', a: cur, b: add(mul(V[k1], B), mul(V[k], H)), n: curN });
        end = k1;
      } else {
        const C = add(mul(V[k], H - CURB_RO), mul(V[k1], H - CURB_RO));
        const s = add(mul(V[k], H), mul(V[k1], H - CURB_RO));
        parts.push({ kind: 'line', a: cur, b: s, n: curN });
        parts.push({ kind: 'arc', c: C, r: CURB_RO, a0: Math.atan2(V[k].z, V[k].x), a1: Math.atan2(V[k1].z, V[k1].x), convex: true });
        cur = add(mul(V[k1], H), mul(V[k], H - CURB_RO));
        curN = V[k1];
        k = k1;
      }
    }
    out.push({ start: i, end, pts: samplePartsLocal(parts) });
  }
  return out;
}

function samplePartsLocal(parts: Part[]): CurbPt[] {
  const pts: CurbPt[] = [];
  const push = (x: number, z: number, nx: number, nz: number) => {
    const q = pts[pts.length - 1];
    if (q && Math.abs(q.x - x) < 1e-5 && Math.abs(q.z - z) < 1e-5) return;
    pts.push({ x, z, nx, nz, u: 0 });
  };
  const breaks = [RAMP.a0, RAMP.a1, RAMP.a2, RAMP.a3];
  for (const p of parts) {
    if (p.kind === 'line') {
      const dx = p.b.x - p.a.x,
        dz = p.b.z - p.a.z;
      const L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const ux = dx / L,
        uz = dz / L;
      const ts = [0, 1];
      // break points where |along| hits the ramp window edges (along = position projected on the line direction)
      const pa = p.a.x * ux + p.a.z * uz;
      for (const b of breaks) {
        for (const sgn of [1, -1]) {
          const t = (sgn * b - pa) / L;
          if (t > 1e-4 && t < 1 - 1e-4) ts.push(t);
        }
      }
      ts.sort((a, b) => a - b);
      for (const t of ts) push(p.a.x + dx * t, p.a.z + dz * t, p.n.x, p.n.z);
    } else {
      let d = p.a1 - p.a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const n = Math.max(4, Math.ceil(Math.abs(d) / (Math.PI / 24)));
      for (let s = 0; s <= n; s++) {
        const a = p.a0 + (d * s) / n;
        const cx = Math.cos(a),
          cz = Math.sin(a);
        const x = p.c.x + cx * p.r,
          z = p.c.z + cz * p.r;
        if (p.convex) push(x, z, cx, cz);
        else push(x, z, -cx, -cz);
      }
    }
  }
  let u = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) u += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].u = u;
  }
  return pts;
}

type HeightFn = (x: number, z: number, d: number, nx: number, nz: number) => { y: number; gx: number; gz: number };
const FLAT: HeightFn = () => ({ y: SIDEWALK_Y, gx: 0, gz: 0 });
/** along-arm coordinate of a sidewalk point next to a crosswalk (or -1 when it is not beside one) */
type TactileFn = (x: number, z: number) => number;

/**
 * Extrude the curb profile along a chain (world coordinates): gutter, curb face, chamfer, curb top and
 * paving rows at the given offsets. Paving rows next to crosswalks carry (distance from curb, along-arm
 * coordinate) in aS.zw for the tactile paving.
 */
function extrudeCurb(H: MeshBuilder, pts: CurbPt[], rows: number[], height: HeightFn, style: number, tactile: TactileFn | null, stoneSeed = 0): void {
  const n = pts.length;
  if (n < 2) return;
  // (kerb stones on: the continuous kerb stays as a dark backing just behind the stones, so a joint never opens a hole)
  const back = stoneSeed ? 0.014 : 0;
  // vertex columns per part, filled per sample
  const cols: number[][] = [];
  for (const p of pts) {
    const col: number[] = [];
    const h0 = height(p.x, p.z, 0, p.nx, p.nz);
    const yTop0 = h0.y;
    const yFace = Math.max(Y.gutter, yTop0 - CHAMFER - back);
    // gutter (d = distance from the kerb face: channel grime line, silt)
    surf(H, HM.gutter, 0, GUTTER, p.u);
    col.push(H.v(p.x - p.nx * GUTTER, Y.gutter, p.z - p.nz * GUTTER));
    surf(H, HM.gutter, 0, 0, p.u);
    col.push(H.v(p.x, Y.gutter, p.z));
    // curb face (normal towards the road); kerb d = profile coordinate: −height down the face, 0 at the arris,
    // + across the top (the shader's arris wear, foot grime and tyre scuffs)
    surf(H, HM.curbFace, 0, -(yFace - Y.gutter) - CHAMFER, p.u);
    col.push(H.v(p.x, Y.gutter - 0.004, p.z, -p.nx, 0, -p.nz));
    surf(H, HM.curbFace, 0, -CHAMFER, p.u);
    col.push(H.v(p.x, yFace, p.z, -p.nx, 0, -p.nz));
    // chamfer
    surf(H, HM.curb, 0, -CHAMFER, p.u);
    const cn = Math.SQRT1_2;
    const hc = height(p.x + p.nx * CHAMFER, p.z + p.nz * CHAMFER, CHAMFER, p.nx, p.nz);
    col.push(H.v(p.x, yFace, p.z, -p.nx * cn, cn, -p.nz * cn));
    surf(H, HM.curb, 0, CHAMFER, p.u);
    col.push(H.v(p.x + p.nx * CHAMFER, hc.y - back, p.z + p.nz * CHAMFER, -p.nx * cn, cn, -p.nz * cn));
    // curb top
    const pushTop = (d: number, mat: number) => {
      const x = p.x + p.nx * d,
        z = p.z + p.nz * d;
      const h = height(x, z, d, p.nx, p.nz);
      const l = Math.hypot(h.gx, 1, h.gz);
      if (mat === HM.walk) {
        const a = tactile ? tactile(x, z) : -1;
        surf(H, mat, style, a >= 0 ? d : 9, a >= 0 ? a : 0);
      } else surf(H, mat, 0, mat === HM.curb ? d : 9, p.u);
      return H.v(x, h.y - (mat === HM.curb ? back : 0), z, -h.gx / l, 1 / l, -h.gz / l);
    };
    col.push(pushTop(CHAMFER, HM.curb));
    col.push(pushTop(CURB_TOP, HM.curb));
    // paving rows
    for (const d of rows) col.push(pushTop(d, HM.walk));
    cols.push(col);
  }
  const quadsBetween = (k0: number, k1: number) => {
    for (let i = 0; i < n - 1; i++) {
      const a = cols[i],
        b = cols[i + 1];
      // orientation: walking along the chain, the sidewalk is on the left (normal side) -> pick winding by normal
      H.quadFacing(a[k0], b[k0], b[k1], a[k1], 0, 1, 0);
    }
  };
  // gutter (0-1), chamfer (4-5), curb top (6-7), paving rows (7.. but separate vertex at index 8)
  quadsBetween(0, 1);
  for (let i = 0; i < n - 1; i++) {
    const a = cols[i],
      b = cols[i + 1];
    // curb face: front faces the road (-normal)
    const nx = -(pts[i].nx + pts[i + 1].nx) / 2,
      nz = -(pts[i].nz + pts[i + 1].nz) / 2;
    H.quadFacing(a[2], b[2], b[3], a[3], nx, 0, nz);
    if (!stoneSeed) H.quadFacing(a[4], b[4], b[5], a[5], nx, 1, nz);
  }
  quadsBetween(6, 7);
  for (let r = 0; r < rows.length - 1; r++) quadsBetween(8 + r, 9 + r);
  if (stoneSeed) kerbStones(H, pts, height, stoneSeed);
}

/**
 * The kerb as separate granite units, one per metre of arclength (the shader's joints): each set by hand a few
 * millimetres proud of its neighbours and tilted its own way, the arris worn to its own width along the stone, and
 * every twelfth stone with a corner knocked off by a tyre. The inner edge stays pinned to the paving. Dropped kerbs
 * lay their units flat (the variance fades with the drop). A dead straight line becomes a line somebody laid.
 */
function kerbStones(H: MeshBuilder, pts: CurbPt[], height: HeightFn, seed: number): void {
  const cn = Math.SQRT1_2;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i],
      B = pts[i + 1];
    const span = B.u - A.u;
    if (span < 1e-4) continue;
    let u = A.u;
    while (u < B.u - 1e-4) {
      const k = Math.floor(u + 1e-4);
      const ue = Math.min(B.u, k + 1);
      const h = (s: number) => hash01(k, seed, s);
      const lat0 = 0.002 + 0.012 * h(1) * h(1);
      const latS = (h(2) - 0.5) * 0.007;
      const dy0 = (h(3) - 0.5) * 0.012;
      const dyS = (h(4) - 0.5) * 0.007;
      const camA = 0.012 + 0.034 * h(5),
        camB = 0.012 + 0.034 * h(6);
      const tilt = (h(7) - 0.5) * 0.1;
      const chipped = h(8) < 0.08;
      const chipF = h(9) < 0.5 ? 0.13 + 0.1 * h(10) : -(0.13 + 0.1 * h(10));
      const breaks = [u, ue];
      if (chipped) {
        const uc = chipF > 0 ? k + chipF : k + 1 + chipF;
        if (uc > u + 0.01 && uc < ue - 0.01) breaks.splice(1, 0, uc);
      }
      const col = (uu: number) => {
        const t = (uu - A.u) / span;
        let nx = A.nx + (B.nx - A.nx) * t,
          nz = A.nz + (B.nz - A.nz) * t;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        const x = A.x + (B.x - A.x) * t,
          z = A.z + (B.z - A.z) * t;
        const f = uu - k - 0.5;
        const chip = !chipped ? 0 : chipF > 0 ? Math.max(0, 1 - (uu - k) / chipF) : Math.max(0, 1 - (k + 1 - uu) / -chipF);
        const h0 = height(x, z, 0, nx, nz);
        const firm = Math.max(0, Math.min(1, (h0.y - Y.gutter - 0.03) / 0.09));
        const lat = (lat0 + latS * f) * firm + 0.0015;
        const cham = (camA + (camB - camA) * (f + 0.5)) * (0.45 + 0.55 * firm) + 0.05 * chip * firm;
        const yT = h0.y + (dy0 + dyS * f) * firm;
        const yF = Math.max(Y.gutter + 0.001, yT - cham - 0.03 * chip * firm);
        const hc = height(x + nx * cham, z + nz * cham, cham, nx, nz);
        const yC = hc.y + (dy0 + dyS * f) * firm * 0.8;
        const hi = height(x + nx * CURB_TOP, z + nz * CURB_TOP, CURB_TOP, nx, nz);
        const tx = -nz,
          tz = nx;
        const fnx = -nx + tx * tilt,
          fnz = -nz + tz * tilt;
        const topS = (hi.y - yC) / Math.max(0.05, CURB_TOP - cham);
        const tl = Math.hypot(topS, 1);
        surf(H, HM.curbFace, 0, -(yF - Y.gutter) - CHAMFER, uu);
        const foot = H.v(x - nx * lat, Y.gutter - 0.004, z - nz * lat, fnx, 0, fnz);
        surf(H, HM.curbFace, 0, -CHAMFER, uu);
        const face = H.v(x - nx * lat, yF, z - nz * lat, fnx, 0, fnz);
        surf(H, HM.curb, 0, -CHAMFER, uu);
        const c0 = H.v(x - nx * lat, yF, z - nz * lat, -nx * cn, cn, -nz * cn);
        surf(H, HM.curb, 0, CHAMFER, uu);
        const c1 = H.v(x + nx * cham, yC, z + nz * cham, -nx * cn, cn, -nz * cn);
        const t0 = H.v(x + nx * cham, yC, z + nz * cham, (-nx * topS) / tl, 1 / tl, (-nz * topS) / tl);
        surf(H, HM.curb, 0, CURB_TOP, uu);
        const t1 = H.v(x + nx * CURB_TOP, hi.y, z + nz * CURB_TOP, (-nx * topS) / tl, 1 / tl, (-nz * topS) / tl);
        return { foot, face, c0, c1, t0, t1, nx, nz };
      };
      let a = col(breaks[0]);
      for (let b = 1; b < breaks.length; b++) {
        const c = col(breaks[b]);
        const nx = -(a.nx + c.nx) / 2,
          nz = -(a.nz + c.nz) / 2;
        H.quadFacing(a.foot, c.foot, c.face, a.face, nx, 0, nz);
        H.quadFacing(a.c0, c.c0, c.c1, a.c1, nx, 1, nz);
        H.quadFacing(a.t0, c.t0, c.t1, a.t1, 0, 1, 0);
        a = c;
      }
      u = ue;
    }
  }
}

export function buildStreets(ctx: CityContext, A: MeshBuilder, H: MeshBuilder): StreetStats {
  const plan = ctx.plan;
  const net = ctx.roads;
  const stats: StreetStats = { junctions: 0, segments: 0, rampEnds: 0, driveKerbs: 0 };
  const B = CORRIDOR_HALF;
  const stones = streetDetail(ctx, 'kerbstones') && !ctx.debug.params.has('nokerbdetail');
  const promenade = plan.areas.find((a) => a.kind === 'promenade');
  const inRaised = (x: number, z: number) => !!promenade && x > promenade.rect.x0 && x < promenade.rect.x1 && z > promenade.rect.z0 && z < promenade.rect.z1;
  const styleAt = (x: number, z: number) => walkStyle(plan.districtAt(x, z)?.kind);

  const segHasWalk = (I: (typeof net.intersections)[number], side: number): boolean => {
    const lid = I.outLane[DIRS[side]];
    if (lid === undefined) return false;
    return plan.roadSegments[net.lanes[lid].segment].sidewalks;
  };

  // ── junctions
  for (const I of net.intersections) {
    if (I.control === 'portal') continue;
    stats.junctions++;
    const present = DIRS.map((d) => I.arms.includes(d));
    const walk = DIRS.map((_, s) => present[s] && segHasWalk(I, s));
    const cwArms = new Set(I.crosswalks.map((c) => DIRS.indexOf(c.arm)));
    stats.rampEnds += cwArms.size * 2;
    const chains = junctionChains(present);
    // carriageway polygon (all chains in order)
    const poly: P2[] = [];
    for (const c of chains) for (const p of c.pts) poly.push({ x: I.x + p.x, z: I.z + p.z });
    A.set('aA', 1, 0);
    A.polygon(poly, Y.asphalt);

    const height: HeightFn = (x, z, d, nx, nz) => {
      const lx = x - I.x,
        lz = z - I.z;
      let best = 0,
        bi = -1,
        bwp = 0;
      for (const s of cwArms) {
        const [w, wp] = win(lx * V[s].x + lz * V[s].z);
        if (w > best) {
          best = w;
          bi = s;
          bwp = wp;
        }
      }
      if (bi < 0 || d >= RAMP.len) return { y: SIDEWALK_Y, gx: 0, gz: 0 };
      const r = 1 - d / RAMP.len,
        rp = -1 / RAMP.len;
      return {
        y: SIDEWALK_Y - RAMP.drop * best * r,
        gx: -RAMP.drop * (bwp * r * V[bi].x + best * rp * nx),
        gz: -RAMP.drop * (bwp * r * V[bi].z + best * rp * nz),
      };
    };

    // along-arm coordinate for sidewalk points in the stub of an arm with a crosswalk
    const tactile: TactileFn = (x, z) => {
      const lx = x - I.x,
        lz = z - I.z;
      let best = -1;
      for (const s of cwArms) best = Math.max(best, lx * V[s].x + lz * V[s].z);
      return best >= ROAD_HALF + 0.05 ? best : -1;
    };

    for (const c of chains) {
      const wpts: CurbPt[] = c.pts.map((p) => ({ x: I.x + p.x, z: I.z + p.z, nx: p.nx, nz: p.nz, u: p.u }));
      const mid = wpts[Math.floor(wpts.length / 2)];
      const style = styleAt(mid.x + mid.nx * 5, mid.z + mid.nz * 5);
      extrudeCurb(H, wpts, ROWS_JUNCTION, height, style, tactile, stones ? 1 + I.id * 8 + c.start : 0);
      // flat fill between the last row and the junction box
      const dl = ROWS_JUNCTION[ROWS_JUNCTION.length - 1];
      const fill: P2[] = wpts.map((p) => ({ x: p.x + p.nx * dl, z: p.z + p.nz * dl }));
      const boxPath: P2[] = [];
      for (let s = c.end; m4(s) !== m4(c.start); s--) {
        const a = V[m4(s)],
          b = V[m4(s - 1)];
        boxPath.push({ x: I.x + (a.x + b.x) * B, z: I.z + (a.z + b.z) * B });
      }
      surf(H, HM.walk, style, 9, 0);
      H.polygon([...fill, ...boxPath], SIDEWALK_Y);
      // outer faces along the junction box (block side) and capped ends towards walk-less arms
      const q0 = wpts[0],
        qn = wpts[wpts.length - 1];
      const path: { p: P2; side: number }[] = [{ p: { x: qn.x, z: qn.z }, side: m4(c.end) }];
      let side = m4(c.end);
      for (const bp of boxPath) {
        path.push({ p: bp, side });
        side = m4(side - 1);
      }
      path.push({ p: { x: q0.x, z: q0.z }, side: m4(c.start) });
      surf(H, HM.side, 0, 9, 0);
      for (let e = 0; e < path.length - 1; e++) {
        const a = path[e].p,
          b = path[e + 1].p;
        // edge e lies on the box edge of side: first edge -> end arm, last -> start arm, else missing side
        const s = e === 0 ? m4(c.end) : e === path.length - 2 ? m4(c.start) : m4(c.end - e);
        const isArmEdge = (e === 0 && present[m4(c.end)]) || (e === path.length - 2 && present[m4(c.start)]);
        if (isArmEdge && walk[s]) continue;
        const mx = (a.x + b.x) / 2 + V[s].x * 0.3,
          mz = (a.z + b.z) / 2 + V[s].z * 0.3;
        if (inRaised(mx, mz)) continue;
        if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-3) continue;
        H.wall(a.x, a.z, b.x, b.z, Y.ground, SIDEWALK_Y, V[s].x, V[s].z);
      }
    }
  }

  // ── segments
  const drives = plan.areas.filter((a) => a.kind === 'driveway');
  for (const seg of plan.roadSegments) {
    const Na = plan.roadNodes[seg.a],
      Nb = plan.roadNodes[seg.b];
    const L = Math.hypot(Nb.x - Na.x, Nb.z - Na.z);
    const dx = (Nb.x - Na.x) / L,
      dz = (Nb.z - Na.z) / L;
    const rx = -dz,
      rz = dx; // right of a->b
    const s0 = Na.kind === 'portal' ? 0 : B;
    const s1 = Nb.kind === 'portal' ? L : L - B;
    const P = (s: number, lat: number): P2 => ({ x: Na.x + dx * s + rx * lat, z: Na.z + dz * s + rz * lat });
    stats.segments++;
    if (seg.sidewalks) {
      // asphalt
      A.set('aA', 1, 0);
      const c0 = P(s0, -ROAD_HALF),
        c1 = P(s1, -ROAD_HALF),
        c2 = P(s1, ROAD_HALF),
        c3 = P(s0, ROAD_HALF);
      A.quadUp(A.v(c0.x, Y.asphalt, c0.z), A.v(c1.x, Y.asphalt, c1.z), A.v(c2.x, Y.asphalt, c2.z), A.v(c3.x, Y.asphalt, c3.z));
      for (const sd of [1, -1]) {
        const nx = rx * sd,
          nz = rz * sd;
        const a = P(s0, ROAD_HALF * sd),
          b = P(s1, ROAD_HALF * sd);
        // driveways opening onto this sidewalk get a dropped kerb (along-segment window [u0, u1])
        const xo: [number, number][] = [];
        for (const d of drives) {
          let l0 = Infinity,
            u0 = Infinity,
            u1 = -Infinity;
          for (const cx of [d.rect.x0, d.rect.x1])
            for (const cz of [d.rect.z0, d.rect.z1]) {
              const ox = cx - Na.x,
                oz = cz - Na.z;
              l0 = Math.min(l0, ox * nx + oz * nz);
              const u = ox * dx + oz * dz;
              u0 = Math.min(u0, u);
              u1 = Math.max(u1, u);
            }
          const f = DRIVE.flare;
          if (Math.abs(l0 - CORRIDOR_HALF) > 0.3 || u1 < s0 + 2 * f || u0 > s1 - 2 * f) continue;
          xo.push([Math.max(u0, s0 + f), Math.min(u1, s1 - f)]);
        }
        const us = [s0, s1];
        for (const [u0, u1] of xo) us.push(u0 - DRIVE.flare, u0, u1, u1 + DRIVE.flare);
        us.sort((p, q) => p - q);
        const pts: CurbPt[] = [];
        for (const u of us) {
          if (pts.length && u - pts[pts.length - 1].u < 1e-3) continue;
          const p = P(u, ROAD_HALF * sd);
          pts.push({ x: p.x, z: p.z, nx, nz, u });
        }
        const drop: HeightFn = (x, z, d, hx, hz) => {
          if (d >= DRIVE.len) return FLAT(x, z, d, hx, hz);
          const u = (x - Na.x) * dx + (z - Na.z) * dz;
          let w = 0,
            wp = 0;
          for (const [u0, u1] of xo) {
            const f = DRIVE.flare;
            const [ww, wwp] = u <= u0 - f || u >= u1 + f ? [0, 0] : u < u0 ? [(u - u0 + f) / f, 1 / f] : u > u1 ? [(u1 + f - u) / f, -1 / f] : [1, 0];
            if (ww > w) [w, wp] = [ww, wwp];
          }
          if (w <= 0) return FLAT(x, z, d, hx, hz);
          const r = 1 - d / DRIVE.len,
            rp = -1 / DRIVE.len;
          return { y: SIDEWALK_Y - DRIVE.drop * w * r, gx: -DRIVE.drop * (wp * r * dx + w * rp * hx), gz: -DRIVE.drop * (wp * r * dz + w * rp * hz) };
        };
        stats.driveKerbs += xo.length;
        const mx = (a.x + b.x) / 2 + nx * 5,
          mz = (a.z + b.z) / 2 + nz * 5;
        const style = styleAt(mx, mz);
        extrudeCurb(H, pts, ROWS_SEGMENT, xo.length ? drop : FLAT, style, null, stones ? 5000 + seg.a * 300 + seg.b * 2 + (sd > 0 ? 1 : 0) : 0);
        // back face towards the block (unless it borders the raised promenade)
        const W = CORRIDOR_HALF - ROAD_HALF;
        if (!inRaised(mx - nx * 1.7, mz - nz * 1.7)) {
          surf(H, HM.side, 0, 9, 0);
          H.wall(a.x + nx * W, a.z + nz * W, b.x + nx * W, b.z + nz * W, Y.ground, SIDEWALK_Y, nx, nz);
        }
      }
    } else {
      buildTunnelRoad(ctx, A, H, seg.a, seg.b);
    }
  }
  return stats;
}

/** Tunnel approach road: asphalt into the bore, gravel shoulders up to the portal, kerbed service ledges inside. */
function buildTunnelRoad(ctx: CityContext, A: MeshBuilder, H: MeshBuilder, a: number, b: number): void {
  const plan = ctx.plan;
  const Na = plan.roadNodes[a],
    Nb = plan.roadNodes[b];
  const portalNode = Na.kind === 'portal' ? Na : Nb;
  const junction = Na.kind === 'portal' ? Nb : Na;
  // axis-aligned N-S road (x constant); z runs from the portal end to the junction box
  const x = junction.x;
  const zJ = junction.z + (portalNode.z < junction.z ? -CORRIDOR_HALF : CORRIDOR_HALF);
  const sgn = portalNode.z < junction.z ? -1 : 1; // direction from the junction towards the portal
  const portals = (ctx.services.terrain as { portals?: { kind: string; x: number; z: number }[] } | undefined)?.portals;
  const portal = portals?.find((p) => p.kind === 'road' && Math.abs(p.x - x) < 1) ?? plan.features.find((f) => f.kind === 'roadportal' && Math.abs(f.x - x) < 1);
  const zFace = portal ? portal.z : portalNode.z - sgn * 1; // facade front
  const zEnd = portalNode.z + sgn * 1.8; // a little past the lane end, inside the bore
  // asphalt
  A.set('aA', 1, 0);
  A.rect(x - ROAD_HALF, Math.min(zJ, zEnd), x + ROAD_HALF, Math.max(zJ, zEnd), Y.asphalt);
  // gravel shoulders (outside the hill) with a little skirt
  const zs0 = Math.min(zJ, zFace),
    zs1 = Math.max(zJ, zFace);
  const W0 = ROAD_HALF,
    W1 = ROAD_HALF + 1.25;
  for (const sd of [-1, 1]) {
    const xa = x + sd * W0,
      xb = x + sd * W1;
    surf(H, HM.shoulder, 0, 9, 0);
    H.rect(Math.min(xa, xb), zs0, Math.max(xa, xb), zs1, Y.shoulder);
    surf(H, HM.side, 1, 9, 0);
    H.wall(xb, zs0, xb, zs1, Y.ground, Y.shoulder, sd, 0);
  }
  // kerbed service ledges inside the bore
  const L0 = ROAD_HALF + 0.08,
    L1 = 4.88,
    yL = 0.24;
  const zi0 = zFace - sgn * 0.02,
    zi1 = zEnd;
  for (const sd of [-1, 1]) {
    const xa = x + sd * L0,
      xb = x + sd * L1;
    surf(H, HM.curb, 0, 9, 0);
    H.rect(Math.min(xa, xb), Math.min(zi0, zi1), Math.max(xa, xb), Math.max(zi0, zi1), yL);
    surf(H, HM.curbFace, 0, 9, 0);
    H.wall(xa, zi0, xa, zi1, Y.asphalt - 0.005, yL, -sd, 0);
    surf(H, HM.side, 1, 9, 0);
    H.wall(xa, zi0, xb, zi0, Y.asphalt - 0.005, yL, 0, -sgn);
  }
}
