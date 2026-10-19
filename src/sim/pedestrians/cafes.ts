// Café terraces as pedestrian destinations: every bistro table the props module placed (plaza terraces,
// the coffee kiosk's tables, the station kiosk) becomes a CafePlace with one seat per chair, a walkway
// node to come from / leave to, and per seat a free-walk path from that node to a standing point beside
// the chair (planned once on a 0.25 m grid round the other tables, chairs, planters, lamps, trees and
// buildings), so patrons walk in between the tables, sit down, stay a while and leave the same way.
//
// Table / chair geometry: from `ctx.services.props.cafes` when the props module exposes it (requested
// from wear), otherwise derived read-only from the same deterministic planner the props module runs
// (planScatter) plus a replica of the RNG draws of props/kit.ts cafe() (chairs at 0.62 m round the
// table, facing it, backrest 0.19 m behind the chair centre, seat top 0.4575 m, table top 0.7375 m).

import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import { Rng } from '../../core/rng';
import { getLayout, MASK_WALK } from '../../world/props/layout';
import { planScatter, type ScatterItem } from '../../world/props/scatter';
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
  /** walkway node the patrons come from / leave to */
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
  /** a waiter's standing point next to the table (towards the walkway) */
  wx: number;
  wz: number;
  district: string;
  label: string;
  /** party sitting here (-1 none) */
  taken: number;
  /** sim time the current party sat down (table items appear a little later) */
  since: number;
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

interface PropsCafeService {
  cafes?: { x: number; z: number; yaw?: number; tableY: number; y?: number; r?: number; seats: { x: number; z: number; yaw: number; seatY: number }[]; source?: string }[];
}

interface TerrainSvc {
  height(x: number, z: number): number;
}

/** chair layout of props/kit.ts cafe(): RNG draws replayed from the scatter item's seed */
function chairsOf(it: ScatterItem): { lx: number; lz: number; yaw: number }[] {
  const rng = new Rng(it.seed || 1);
  rng.next(); // metal colour
  rng.next(); // top colour
  rng.next(); // wood / stone
  const n = rng.int(2, 4);
  rng.next(); // chair colour
  const out: { lx: number; lz: number; yaw: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.3, 0.3) + 0.4;
    const yaw = a + Math.PI + rng.range(-0.25, 0.25);
    out.push({ lx: Math.sin(a) * 0.62, lz: Math.cos(a) * 0.62, yaw });
  }
  return out;
}

/** Café tables of the city (props service, or the deterministic replica). */
export function cafeTables(ctx: CityContext): { tables: CafeTable[]; scatter: ScatterItem[] } {
  const terrain = ctx.services.terrain as TerrainSvc | undefined;
  const H = (x: number, z: number) => (terrain ? terrain.height(x, z) : ctx.plan.heightAt(x, z));
  const svc = ctx.services.props as PropsCafeService | undefined;
  if (svc?.cafes && svc.cafes.length) {
    const tables = svc.cafes.map((c) => {
      const y = c.y ?? H(c.x, c.z) + 0.02;
      return {
        x: c.x,
        z: c.z,
        y,
        top: c.tableY,
        r: c.r ?? 0.36,
        chairs: c.seats.map((s) => ({ x: s.x, z: s.z, yaw: s.yaw, seatTop: s.seatY, back: 0.19 })),
        source: c.source ?? 'props',
      };
    });
    return { tables, scatter: [] };
  }
  if (ctx.debug.params.has('noscatter')) return { tables: [], scatter: [] };
  // replica: the props module's own planner, same inputs
  const layout = getLayout(ctx);
  const vegTrees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined)?.trees ?? [];
  const scatter = planScatter({ plan: ctx.plan, occ: ctx.occupancy, walkAt: (x, z) => (layout.walk.get(x, z) & MASK_WALK) !== 0, trees: vegTrees, discs: layout.furniture });
  const tables: CafeTable[] = [];
  for (const it of scatter) {
    if (it.kind !== 'cafe') continue;
    const y = H(it.x, it.z) + 0.02;
    const c = Math.cos(it.yaw),
      s = Math.sin(it.yaw);
    const chairs = chairsOf(it).map((ch) => ({
      x: it.x + ch.lx * c + ch.lz * s,
      z: it.z - ch.lx * s + ch.lz * c,
      yaw: it.yaw + ch.yaw,
      seatTop: y + 0.4575,
      back: 0.19,
    }));
    tables.push({ x: it.x, z: it.z, y, top: y + 0.7375, r: 0.36, chairs, source: 'scatter' });
  }
  return { tables, scatter };
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
export function buildCafes(ctx: CityContext, districtName: (x: number, z: number) => string): CafePlace[] {
  const { tables, scatter } = cafeTables(ctx);
  if (!tables.length) return [];
  const { peds, occupancy: occ } = ctx;
  const layout = getLayout(ctx);
  // static obstacles: street furniture, trees, other scatter items, every table top and chair
  const discs: Disc[] = [];
  for (const f of layout.furniture) discs.push({ x: f.x, z: f.z, r: Math.min(f.r, 1.2) });
  const vegTrees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number }[] } | undefined)?.trees ?? [];
  for (const t of vegTrees) discs.push({ x: t.x, z: t.z, r: 0.35 });
  for (const T of tables) {
    discs.push({ x: T.x, z: T.z, r: TOP_R });
    for (const ch of T.chairs) discs.push({ x: ch.x, z: ch.z, r: CHAIR_R });
  }
  const rects: { x: number; z: number; c: number; s: number; hw: number; hd: number }[] = [];
  for (const it of scatter) if (it.kind !== 'cafe') rects.push({ x: it.x, z: it.z, c: Math.cos(it.yaw), s: Math.sin(it.yaw), hw: it.w / 2, hd: it.d / 2 });
  // walkway nodes a patron may come from (not doors / bus stops / crosswalk ends)
  const cand = peds.nodes.filter((n) => n.kind !== 'door' && n.kind !== 'busstop' && n.edges.length >= 2 && !n.edges.some((e) => peds.edges[e].kind === 'crosswalk'));

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
    for (const r of rects) {
      if (!inBox(r.x, r.z, 5)) continue;
      const ext = Math.hypot(r.hw, r.hd) + BODY;
      stamp(r.x - ext, r.z - ext, r.x + ext, r.z + ext, (x, z) => {
        const dx = x - r.x,
          dz = z - r.z;
        const lx = dx * r.c - dz * r.s,
          lz = dx * r.s + dz * r.c;
        return Math.abs(lx) < r.hw + BODY && Math.abs(lz) < r.hd + BODY;
      });
    }
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
    // one Dijkstra per candidate node over the cluster grid
    const near = cand.filter((n) => n.x > bx0 - MARGIN + 1 && n.x < bx1 + MARGIN - 1 && n.z > bz0 - MARGIN + 1 && n.z < bz1 + MARGIN - 1 && cellOf(n.x, n.z) >= 0 && !blocked[cellOf(n.x, n.z)]);
    const dist = new Float32Array(NX * NZ);
    const prev = new Int32Array(NX * NZ);
    const results: { node: number; dist: Float32Array; prev: Int32Array }[] = [];
    for (const n of near) {
      dijkstra(blocked, NX, NZ, cellOf(n.x, n.z), dist, prev, MAX_WALK);
      results.push({ node: n.id, dist: dist.slice(), prev: prev.slice() });
    }
    members.forEach((ti, mi) => {
      const T = tables[ti];
      const seats = seatsOf[mi];
      if (!seats.length || !results.length) return;
      // the node with the shortest total walk to all the table's seats
      let best: (typeof results)[number] | null = null;
      let bestCost = Infinity;
      for (const r of results) {
        let c = 0;
        for (const s of seats) c += r.dist[cellOf(s.sx, s.sz)];
        if (c < bestCost) {
          bestCost = c;
          best = r;
        }
      }
      if (!best || !isFinite(bestCost)) return;
      const nd = peds.nodes[best.node];
      for (const s of seats) {
        const pts: [number, number][] = [];
        for (let c = cellOf(s.sx, s.sz); c >= 0; c = best.prev[c]) pts.push([cx(c % NX), cz(Math.floor(c / NX))]);
        pts.reverse(); // node → standing point
        pts[0] = [nd.x, nd.z];
        pts[pts.length - 1] = [s.sx, s.sz];
        const simp: [number, number][] = [pts[0]];
        let a = 0;
        while (a < pts.length - 1) {
          let b = pts.length - 1;
          for (; b > a + 1; b--) if (losFree(pts[a], pts[b], blocked, NX, NZ, ox, oz)) break;
          simp.push(pts[b]);
          a = b;
        }
        for (let q = 1; q < simp.length; q++) s.path.push(simp[q][0], simp[q][1], T.y);
      }
      // a waiter stands next to the table on the side towards the walkway
      const wl = Math.hypot(nd.x - T.x, nd.z - T.z) || 1;
      out.push({
        id: out.length,
        node: best.node,
        x: T.x,
        z: T.z,
        y: T.y,
        top: T.top,
        r: T.r,
        seats,
        wx: T.x + ((nd.x - T.x) / wl) * 1.25,
        wz: T.z + ((nd.z - T.z) / wl) * 1.25,
        district: districtName(T.x, T.z),
        label: `Sitting at a café in ${districtName(T.x, T.z)}`,
        taken: -1,
        since: 0,
      });
    });
  }
  return out;
}

/** 8-connected Dijkstra from cell s0 over the free cells (no corner cutting), up to maxD metres */
function dijkstra(blocked: Uint8Array, NX: number, NZ: number, s0: number, dist: Float32Array, prev: Int32Array, maxD: number): void {
  dist.fill(Infinity);
  prev.fill(-1);
  const heap: number[] = [s0];
  dist[s0] = 0;
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
