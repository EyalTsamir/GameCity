// Café terraces as pedestrian destinations: every bistro table the props module placed (plaza terraces,
// the coffee kiosk's tables, the station kiosk) becomes a CafePlace with one seat per chair, a walkway
// node to come from / leave to, and per seat a free-walk path from that node to a standing point beside
// the chair (planned once on a 0.25 m grid round the other tables, chairs, planters, lamps, trees and
// buildings), so patrons walk in between the tables, sit down, stay a while and leave the same way.
//
// Table / chair geometry: `ctx.services.props.cafes` (props/service.ts — chair centres, the direction the
// sitter faces, seat and table-top heights); obstacles: `ctx.services.props.discs` + trees.

import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import type { PropsService } from '../../world/props/service';
import type { Spot } from './places';
import { SEAT_TOP, BACKREST_Z } from './animate';

const TAU = Math.PI * 2;

export interface CafeSeat extends Spot {
  /** chair centre */
  cx: number;
  cz: number;
  /** standing point beside the chair (end of the approach walk, start of the leave walk) */
  sx: number;
  sz: number;
  /** free-walk polyline from the café's walkway node to the standing point: x, z, y triples (excl. start) */
  path: number[];
  /** index of this chair round its table */
  k: number;
  /** direction (rad) of the table centre seen from the seat, relative to the sitter's facing */
  rel: number;
}

export interface CafePlace {
  id: number;
  /** walkway edge (and its end nodes) where the patrons leave / join their walk, at distance u from ea */
  edge: number;
  ea: number;
  eb: number;
  u: number;
  /** that entry point (on the edge's centre line) */
  bx: number;
  bz: number;
  /** goal node of the current approach (ea or eb, whichever the walk ends at) */
  node: number;
  /** table centre and the ground height under it */
  x: number;
  z: number;
  y: number;
  /** table top height (world) */
  top: number;
  /** table top radius */
  r: number;
  seats: CafeSeat[];
  /** a waiter's standing point next to the table, the way there from the terrace's service point (x, z, y
   * triples excl. the service point; empty: no waiter serves this table) */
  wx: number;
  wz: number;
  wpath: number[];
  /** terrace (cluster of neighbouring tables) this table belongs to */
  terrace: number;
  district: string;
  label: string;
  /** party sitting here (-1 none) */
  taken: number;
  /** sim time the current party sat down (table items appear a little later) */
  since: number;
  /** service of the current party: 0 waiting for the waiter, 1 ordered, 2 order on the table */
  served: number;
  servedAt: number;
  /** waiter (party id) on the way to / at this table, -1 none */
  waiter: number;
}

/** a cluster of café tables with a service point (by the café's facade) its waiters work from */
export interface Terrace {
  id: number;
  x: number;
  z: number;
  y: number;
  /** direction the waiter faces while waiting (towards the tables) */
  yaw: number;
  cafes: CafePlace[];
}

/** table + chairs as placed by props: chair centres and the direction each chair faces */
export interface CafeTable {
  x: number;
  z: number;
  y: number;
  top: number;
  r: number;
  chairs: { x: number; z: number; yaw: number; seatTop: number; back: number }[];
  source: string;
}

interface TerrainSvc {
  height(x: number, z: number): number;
}

/** Café tables of the city, from the props module's service (no props → no café tables). */
export function cafeTables(ctx: CityContext): { tables: CafeTable[]; discs: { x: number; z: number; r: number }[] } {
  const svc = ctx.services.props as PropsService | undefined;
  if (!svc?.cafes?.length) return { tables: [], discs: [] };
  const terrain = ctx.services.terrain as TerrainSvc | undefined;
  const H = (x: number, z: number) => (terrain ? terrain.height(x, z) : ctx.plan.heightAt(x, z));
  const tables = svc.cafes.map((c) => ({
    x: c.x,
    z: c.z,
    y: H(c.x, c.z) + 0.02,
    top: c.tableY,
    r: c.tableR ?? 0.36,
    // bistro chairs (props/kit.ts cafe()): backrest 0.19 m behind the chair centre
    chairs: c.seats.map((s) => ({ x: s.x, z: s.z, yaw: s.yaw, seatTop: s.seatY, back: 0.19 })),
    source: c.source,
  }));
  return { tables, discs: svc.discs ?? [] };
}

// ───────────────────────────────────────────────────────── planning ──

const CELL = 0.25;
const BODY = 0.26; // walker radius + a little
const CHAIR_R = 0.34;
const TOP_R = 0.4;
/** margin of the planning grid round a cluster of tables (m) */
const MARGIN = 13;
/** longest approach walk considered (m) */
const MAX_WALK = 22;

interface Disc {
  x: number;
  z: number;
  r: number;
}

/** Build the café places: seats, walkway nodes and approach paths. */
export function buildCafes(ctx: CityContext, districtName: (x: number, z: number) => string): { cafes: CafePlace[]; terraces: Terrace[] } {
  const terraces: Terrace[] = [];
  const { tables, discs: keep } = cafeTables(ctx);
  if (!tables.length) return { cafes: [], terraces };
  const { peds, occupancy: occ } = ctx;
  // static obstacles: every placed item (props keep-clear discs, which include the café sets themselves:
  // those are replaced by the finer table-top + chair discs), trees, every table top and chair
  const discs: Disc[] = [];
  for (const f of keep) {
    if (tables.some((T) => Math.abs(T.x - f.x) < 0.05 && Math.abs(T.z - f.z) < 0.05)) continue;
    discs.push({ x: f.x, z: f.z, r: Math.min(f.r, 2.5) });
  }
  const vegTrees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number }[] } | undefined)?.trees ?? [];
  for (const t of vegTrees) discs.push({ x: t.x, z: t.z, r: 0.35 });
  for (const T of tables) {
    discs.push({ x: T.x, z: T.z, r: TOP_R });
    for (const ch of T.chairs) discs.push({ x: ch.x, z: ch.z, r: CHAIR_R });
  }

  // clusters of neighbouring tables share one planning grid
  const cl = tables.map((_, i) => i);
  const find = (i: number): number => (cl[i] === i ? i : (cl[i] = find(cl[i])));
  for (let i = 0; i < tables.length; i++)
    for (let j = i + 1; j < tables.length; j++) if (Math.hypot(tables[i].x - tables[j].x, tables[i].z - tables[j].z) < 7) cl[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < tables.length; i++) {
    const g = groups.get(find(i));
    if (g) g.push(i);
    else groups.set(find(i), [i]);
  }

  const out: CafePlace[] = [];
  for (const members of groups.values()) {
    let bx0 = Infinity,
      bz0 = Infinity,
      bx1 = -Infinity,
      bz1 = -Infinity;
    for (const i of members) {
      bx0 = Math.min(bx0, tables[i].x);
      bz0 = Math.min(bz0, tables[i].z);
      bx1 = Math.max(bx1, tables[i].x);
      bz1 = Math.max(bz1, tables[i].z);
    }
    const ox = bx0 - MARGIN,
      oz = bz0 - MARGIN;
    const NX = Math.ceil((bx1 - bx0 + 2 * MARGIN) / CELL),
      NZ = Math.ceil((bz1 - bz0 + 2 * MARGIN) / CELL);
    const cx = (i: number) => ox + (i + 0.5) * CELL;
    const cz = (j: number) => oz + (j + 0.5) * CELL;
    const blocked = new Uint8Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (occ.get(cx(i), cz(j)) & (OCC.BUILDING | OCC.WATER | OCC.ROAD | OCC.RAIL | OCC.SOLID)) blocked[j * NX + i] = 1;
    const stamp = (x0: number, z0: number, x1: number, z1: number, inside: (x: number, z: number) => boolean) => {
      const i0 = Math.max(0, Math.floor((x0 - ox) / CELL)),
        i1 = Math.min(NX - 1, Math.floor((x1 - ox) / CELL));
      const j0 = Math.max(0, Math.floor((z0 - oz) / CELL)),
        j1 = Math.min(NZ - 1, Math.floor((z1 - oz) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!blocked[j * NX + i] && inside(cx(i), cz(j))) blocked[j * NX + i] = 1;
    };
    const inBox = (x: number, z: number, m: number) => x > ox - m && x < ox + NX * CELL + m && z > oz - m && z < oz + NZ * CELL + m;
    for (const d of discs) {
      if (!inBox(d.x, d.z, d.r + 1)) continue;
      const rr = d.r + BODY;
      stamp(d.x - rr, d.z - rr, d.x + rr, d.z + rr, (x, z) => (x - d.x) ** 2 + (z - d.z) ** 2 < rr * rr);
    }
    const cellOf = (x: number, z: number): number => {
      const i = Math.floor((x - ox) / CELL),
        j = Math.floor((z - oz) / CELL);
      return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i;
    };
    // seats: spot on the chair + standing point beside it
    const seatsOf: CafeSeat[][] = [];
    for (const ti of members) {
      const T = tables[ti];
      const nch = T.chairs.length;
      const list: CafeSeat[] = [];
      for (let k = 0; k < nch; k++) {
        const ch = T.chairs[k];
        const fx = Math.sin(ch.yaw),
          fz = Math.cos(ch.yaw);
        // seat spot: the bench-sit pose expects the backrest 0.30 m behind the spot (chair: `back` behind its centre)
        const back = -BACKREST_Z - ch.back;
        const sx0 = ch.x + fx * back,
          sz0 = ch.z + fz * back;
        const ux0 = ch.x - T.x,
          uz0 = ch.z - T.z;
        const ol = Math.hypot(ux0, uz0) || 1;
        const ux = ux0 / ol,
          uz = uz0 / ol;
        // standing point beside the chair, on the side of the larger gap to the neighbouring chairs
        const a0 = Math.atan2(ux0, uz0);
        let gapL = TAU,
          gapR = TAU;
        for (const o of T.chairs) {
          if (o === ch) continue;
          let d = Math.atan2(o.x - T.x, o.z - T.z) - a0;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          if (d > 0) gapL = Math.min(gapL, d);
          else gapR = Math.min(gapR, -d);
        }
        let stx = 0,
          stz = 0,
          found = false;
        for (const side of gapL >= gapR ? [1, -1] : [-1, 1]) {
          for (const [o, t] of [
            [0.3, 0.58],
            [0.5, 0.5],
            [0.7, 0.3],
          ]) {
            // tangent: left of the outward direction for side +1
            const x = ch.x + ux * o + uz * side * t,
              z = ch.z + uz * o - ux * side * t;
            const c = cellOf(x, z);
            if (c >= 0 && !blocked[c]) {
              stx = x;
              stz = z;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (!found) continue;
        let rel = Math.atan2(T.x - sx0, T.z - sz0) - ch.yaw;
        while (rel > Math.PI) rel -= TAU;
        while (rel < -Math.PI) rel += TAU;
        list.push({ x: sx0, z: sz0, y: ch.seatTop - SEAT_TOP, yaw: ch.yaw, taken: -1, cx: ch.x, cz: ch.z, sx: stx, sz: stz, path: [], k, rel });
      }
      seatsOf.push(list);
    }
    // entry points: samples every 0.5 m along the walkway edges round the cluster (patrons leave / join
    // their walk there, so the café needs no graph node of its own)
    const bandCell = new Int32Array(NX * NZ).fill(-1);
    const bands: { e: number; u: number; x: number; z: number }[] = [];
    for (const e of peds.edges) {
      if (e.kind === 'crosswalk' || e.kind === 'door' || e.kind === 'link') continue;
      const A = peds.nodes[e.a],
        B = peds.nodes[e.b];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      if (L < 1) continue;
      if (Math.max(A.x, B.x) < ox || Math.min(A.x, B.x) > ox + NX * CELL || Math.max(A.z, B.z) < oz || Math.min(A.z, B.z) > oz + NZ * CELL) continue;
      for (let u = 0.6; u < L - 0.6; u += 0.5) {
        const x = A.x + ((B.x - A.x) * u) / L,
          z = A.z + ((B.z - A.z) * u) / L;
        const c = cellOf(x, z);
        if (c < 0 || blocked[c] || bandCell[c] >= 0) continue;
        bandCell[c] = bands.length;
        bands.push({ e: e.id, u, x, z });
      }
    }
    const dist = new Float32Array(NX * NZ);
    const prev = new Int32Array(NX * NZ);
    members.forEach((ti, mi) => {
      const T = tables[ti];
      const seats = seatsOf[mi];
      if (!seats.length || !bands.length) return;
      // nearest entry point (walking) from the table: one search from all its standing points at once
      dijkstra(blocked, NX, NZ, seats.map((st) => cellOf(st.sx, st.sz)), dist, prev, MAX_WALK);
      let best = -1;
      for (let q = 0; q < bands.length; q++) {
        const d = dist[cellOf(bands[q].x, bands[q].z)];
        if (isFinite(d) && (best < 0 || d < dist[cellOf(bands[best].x, bands[best].z)])) best = q;
      }
      if (best < 0) return;
      const bp = bands[best];
      // paths: from the entry point to every seat's standing point
      dijkstra(blocked, NX, NZ, [cellOf(bp.x, bp.z)], dist, prev, MAX_WALK);
      let unreached = false;
      for (const st of seats) if (!isFinite(dist[cellOf(st.sx, st.sz)])) unreached = true;
      if (unreached) return;
      for (const st of seats) {
        const pts: [number, number][] = [];
        for (let c = cellOf(st.sx, st.sz); c >= 0; c = prev[c]) pts.push([cx(c % NX), cz(Math.floor(c / NX))]);
        pts.reverse(); // entry → standing point
        pts[0] = [bp.x, bp.z];
        pts[pts.length - 1] = [st.sx, st.sz];
        const simp: [number, number][] = [pts[0]];
        let a = 0;
        while (a < pts.length - 1) {
          let b = pts.length - 1;
          for (; b > a + 1; b--) if (losFree(pts[a], pts[b], blocked, NX, NZ, ox, oz)) break;
          simp.push(pts[b]);
          a = b;
        }
        for (let q = 1; q < simp.length; q++) st.path.push(simp[q][0], simp[q][1], T.y - 0.02);
      }
      const e = peds.edges[bp.e];
      // a waiter stands next to the table on the side towards the walkway
      const wl = Math.hypot(bp.x - T.x, bp.z - T.z) || 1;
      out.push({
        id: out.length,
        edge: e.id,
        ea: e.a,
        eb: e.b,
        u: bp.u,
        bx: bp.x,
        bz: bp.z,
        node: e.b,
        x: T.x,
        z: T.z,
        y: T.y,
        top: T.top,
        r: T.r,
        seats,
        wx: T.x + ((bp.x - T.x) / wl) * 1.25,
        wz: T.z + ((bp.z - T.z) / wl) * 1.25,
        wpath: [],
        terrace: -1,
        district: districtName(T.x, T.z),
        label: `Sitting at a café in ${districtName(T.x, T.z)}`,
        taken: -1,
        since: 0,
        served: 2,
        servedAt: 0,
        waiter: -1,
      });
    });
    // ── the terrace's service point and the waiter's way to every table
    const mine = out.filter((c) => c.terrace === -1);
    if (mine.length >= 2) {
      let mx = 0,
        mz = 0;
      for (const c of mine) {
        mx += c.x;
        mz += c.z;
      }
      mx /= mine.length;
      mz /= mine.length;
      // nearest building cell to the tables' centroid: the café is that side
      let bxB = 0,
        bzB = 0,
        bd = Infinity;
      for (let j = 0; j < NZ; j += 2)
        for (let i = 0; i < NX; i += 2) {
          if (!(occ.get(cx(i), cz(j)) & OCC.BUILDING)) continue;
          const d = Math.hypot(cx(i) - mx, cz(j) - mz);
          if (d < bd) {
            bd = d;
            bxB = cx(i);
            bzB = cz(j);
          }
        }
      const nearEdge = (x: number, z: number): boolean => {
        for (const e of peds.edges) {
          const A = peds.nodes[e.a],
            B = peds.nodes[e.b];
          if (Math.min(A.x, B.x) - 3 > x || Math.max(A.x, B.x) + 3 < x || Math.min(A.z, B.z) - 3 > z || Math.max(A.z, B.z) + 3 < z) continue;
          if (segDist(A.x, A.z, B.x, B.z, x, z) < e.halfWidth + 0.55) return true;
        }
        return false;
      };
      // service point: a free cell ~1.2–2.5 m off the facade, close to the tables, off the walkways
      let sc = -1,
        sBest = Infinity;
      if (isFinite(bd)) {
        for (let j = 0; j < NZ; j++)
          for (let i = 0; i < NX; i++) {
            const c = j * NX + i;
            if (blocked[c]) continue;
            const x = cx(i),
              z = cz(j);
            const dB = Math.hypot(x - bxB, z - bzB);
            if (dB > 6) continue;
            let wall = Infinity;
            for (let q = -10; q <= 10 && wall > 0.6; q++) {
              for (const [di, dj] of [
                [q, -10],
                [q, 10],
                [-10, q],
                [10, q],
              ]) {
                // coarse: distance to the nearest building cell within 2.5 m
                const ii = i + Math.round((di * 2.5) / 10 / CELL),
                  jj = j + Math.round((dj * 2.5) / 10 / CELL);
                if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
                if (occ.get(cx(ii), cz(jj)) & OCC.BUILDING) wall = Math.min(wall, Math.hypot(cx(ii) - x, cz(jj) - z));
              }
            }
            if (wall < 0.9 || wall > 3) continue;
            if (mine.some((t) => Math.hypot(t.x - x, t.z - z) < 1.5)) continue;
            const score = Math.hypot(x - mx, z - mz) + Math.abs(wall - 1.6) * 2;
            if (score >= sBest || nearEdge(x, z)) continue;
            sBest = score;
            sc = c;
          }
      }
      if (sc >= 0) {
        const sx = cx(sc % NX),
          sz = cz(Math.floor(sc / NX));
        dijkstra(blocked, NX, NZ, [sc], dist, prev, 30);
        const ty = mine[0].y - 0.02;
        const T: Terrace = { id: terraces.length, x: sx, z: sz, y: ty, yaw: Math.atan2(mx - sx, mz - sz), cafes: [] };
        for (const c of mine) {
          // waiter's spot: round the table at 1.15 m, free, reachable, nearest to the service point
          let best = -1,
            bdist = Infinity;
          for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * TAU;
            const x = c.x + Math.sin(ang) * 1.15,
              z = c.z + Math.cos(ang) * 1.15;
            const q = cellOf(x, z);
            if (q < 0 || blocked[q] || !isFinite(dist[q])) continue;
            if (c.seats.some((st) => Math.hypot(st.sx - x, st.sz - z) < 0.55)) continue;
            if (dist[q] < bdist) {
              bdist = dist[q];
              best = q;
            }
          }
          if (best < 0) continue;
          const pts: [number, number][] = [];
          for (let q = best; q >= 0; q = prev[q]) pts.push([cx(q % NX), cz(Math.floor(q / NX))]);
          pts.reverse();
          pts[0] = [sx, sz];
          const simp: [number, number][] = [pts[0]];
          let a = 0;
          while (a < pts.length - 1) {
            let b = pts.length - 1;
            for (; b > a + 1; b--) if (losFree(pts[a], pts[b], blocked, NX, NZ, ox, oz)) break;
            simp.push(pts[b]);
            a = b;
          }
          c.wx = pts[pts.length - 1][0];
          c.wz = pts[pts.length - 1][1];
          for (let q = 1; q < simp.length; q++) c.wpath.push(simp[q][0], simp[q][1], ty);
          c.terrace = T.id;
          T.cafes.push(c);
        }
        if (T.cafes.length) terraces.push(T);
      }
    }
    for (const c of mine) if (c.terrace === -1) c.terrace = -2;
  }
  return { cafes: out, terraces };
}

function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax,
    dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** 8-connected Dijkstra from the source cells over the free cells (no corner cutting), up to maxD metres */
function dijkstra(blocked: Uint8Array, NX: number, NZ: number, src: number[], dist: Float32Array, prev: Int32Array, maxD: number): void {
  dist.fill(Infinity);
  prev.fill(-1);
  const heap: number[] = [];
  for (const s0 of src) {
    if (s0 < 0 || dist[s0] === 0) continue;
    dist[s0] = 0;
    heap.push(s0);
  }
  const free = (i: number, j: number) => i >= 0 && j >= 0 && i < NX && j < NZ && !blocked[j * NX + i];
  while (heap.length) {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let a = 0;
      for (;;) {
        const l = a * 2 + 1,
          r = l + 1;
        let m = a;
        if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
        if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
        if (m === a) break;
        const t = heap[a];
        heap[a] = heap[m];
        heap[m] = t;
        a = m;
      }
    }
    const d0 = dist[top];
    if (d0 > maxD) break;
    const ti = top % NX,
      tj = (top - ti) / NX;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ti + di,
          nj = tj + dj;
        if (!free(ni, nj)) continue;
        if (di && dj && (!free(ti + di, tj) || !free(ti, tj + dj))) continue;
        const nd = d0 + (di && dj ? 1.4142 : 1) * CELL;
        const id = nj * NX + ni;
        if (nd < dist[id] - 1e-6) {
          dist[id] = nd;
          prev[id] = top;
          heap.push(id);
          let a = heap.length - 1;
          while (a > 0) {
            const p = (a - 1) >> 1;
            if (dist[heap[p]] <= dist[heap[a]]) break;
            const t = heap[a];
            heap[a] = heap[p];
            heap[p] = t;
            a = p;
          }
        }
      }
    }
  }
}

/** straight walk between two points stays on free cells (sampled every half cell) */
function losFree(a: [number, number], b: [number, number], blocked: Uint8Array, NX: number, NZ: number, ox: number, oz: number): boolean {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / (CELL * 0.5)));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const i = Math.floor((a[0] + (b[0] - a[0]) * t - ox) / CELL),
      j = Math.floor((a[1] + (b[1] - a[1]) * t - oz) / CELL);
    if (i < 0 || j < 0 || i >= NX || j >= NZ || blocked[j * NX + i]) return false;
  }
  return true;
}
