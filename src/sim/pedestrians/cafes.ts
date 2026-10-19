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

interface Disc {
  x: number;
  z: number;
  r: number;
}

/** Build the café places: seats, walkway nodes and approach paths. */
export function buildCafes(ctx: CityContext, districtName: (x: number, z: number) => string): CafePlace[] {
  const { tables, scatter } = cafeTables(ctx);
  if (!tables.length) return [];
  const { peds, occupancy: occ, plan } = ctx;
  const layout = getLayout(ctx);
  // static obstacles (discs): street furniture, trees, other scatter items, features
  const discs: Disc[] = [];
  for (const f of layout.furniture) discs.push({ x: f.x, z: f.z, r: Math.min(f.r, 1.2) });
  const vegTrees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number }[] } | undefined)?.trees ?? [];
  for (const t of vegTrees) discs.push({ x: t.x, z: t.z, r: 0.35 });
  const rects: { x: number; z: number; c: number; s: number; hw: number; hd: number }[] = [];
  for (const it of scatter) {
    if (it.kind === 'cafe') continue;
    rects.push({ x: it.x, z: it.z, c: Math.cos(it.yaw), s: Math.sin(it.yaw), hw: it.w / 2, hd: it.d / 2 });
  }
  for (const T of tables) {
    discs.push({ x: T.x, z: T.z, r: TOP_R });
    for (const ch of T.chairs) discs.push({ x: ch.x, z: ch.z, r: CHAIR_R });
  }
  // walkway nodes a patron may come from (not doors / bus stops / crosswalk ends)
  const cand = peds.nodes.filter((n) => n.kind !== 'door' && n.kind !== 'busstop' && n.edges.length >= 2 && !n.edges.some((e) => peds.edges[e].kind === 'crosswalk' || peds.edges[e].kind === 'door'));

  const out: CafePlace[] = [];
  const R = 15;
  const N = Math.ceil((2 * R) / CELL);
  const blocked = new Uint8Array(N * N);
  const dist = new Float32Array(N * N);
  const prev = new Int32Array(N * N);
  const heap: number[] = [];
  for (const T of tables) {
    const ox = T.x - R,
      oz = T.z - R;
    const cx = (i: number) => ox + (i + 0.5) * CELL;
    const cz = (j: number) => oz + (j + 0.5) * CELL;
    // static blocking for this table's neighbourhood (own chairs handled per seat)
    blocked.fill(0);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cx(i),
          z = cz(j);
        const f = occ.get(x, z);
        let b = (f & (OCC.BUILDING | OCC.WATER | OCC.ROAD | OCC.RAIL | OCC.SOLID)) !== 0;
        if (!b) {
          for (const r of rects) {
            const dx = x - r.x,
              dz = z - r.z;
            if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
            const lx = dx * r.c - dz * r.s,
              lz = dx * r.s + dz * r.c;
            if (Math.abs(lx) < r.hw + BODY && Math.abs(lz) < r.hd + BODY) {
              b = true;
              break;
            }
          }
        }
        if (!b) {
          for (const d of discs) {
            const dx = x - d.x,
              dz = z - d.z;
            const rr = d.r + BODY;
            if (dx * dx + dz * dz < rr * rr) {
              // own table's chairs are re-opened per seat below; mark them 2
              const own = Math.hypot(d.x - T.x, d.z - T.z) < 0.7 && d.r === CHAIR_R;
              b = true;
              if (own) blocked[j * N + i] = 2;
              break;
            }
          }
        }
        if (b && blocked[j * N + i] !== 2) blocked[j * N + i] = 1;
      }
    }
    // nodes within reach
    const near = cand.filter((n) => Math.abs(n.x - T.x) < R - 1 && Math.abs(n.z - T.z) < R - 1).sort((a, b) => Math.hypot(a.x - T.x, a.z - T.z) - Math.hypot(b.x - T.x, b.z - T.z)).slice(0, 6);
    if (!near.length) continue;
    const seats: CafeSeat[] = [];
    let bestNode = -1;
    let bestCost = Infinity;
    const paths: { seat: CafeSeat; per: Map<number, number[]>; cost: Map<number, number> }[] = [];
    const nch = T.chairs.length;
    for (let k = 0; k < nch; k++) {
      const ch = T.chairs[k];
      const fx = Math.sin(ch.yaw),
        fz = Math.cos(ch.yaw);
      // seat spot: the bench-sit pose expects the backrest 0.30 m behind the spot (chair: 0.19 behind its centre)
      const back = -BACKREST_Z - ch.back;
      const sx0 = ch.x + fx * back,
        sz0 = ch.z + fz * back;
      // standing point beside the chair, on the side with the larger gap to the neighbouring chair
      const out0x = ch.x - T.x,
        out0z = ch.z - T.z;
      const ol = Math.hypot(out0x, out0z) || 1;
      const ux = out0x / ol,
        uz = out0z / ol;
      let side = 1;
      if (nch > 2) {
        const a0 = Math.atan2(out0x, out0z);
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
        side = gapL >= gapR ? 1 : -1;
      }
      // tangent (left of the outward direction for side +1)
      const tx = uz * side,
        tz = -ux * side;
      let stx = ch.x + ux * 0.18 + tx * 0.5,
        stz = ch.z + uz * 0.18 + tz * 0.5;
      // relative direction of the table from the sitter's facing
      let rel = Math.atan2(T.x - sx0, T.z - sz0) - ch.yaw;
      while (rel > Math.PI) rel -= TAU;
      while (rel < -Math.PI) rel += TAU;
      // Dijkstra from the standing point over the local grid (own chair open, other own chairs blocked)
      const open = (i: number, j: number): boolean => {
        if (i < 0 || j < 0 || i >= N || j >= N) return false;
        const b = blocked[j * N + i];
        if (b === 0) return true;
        if (b === 1) return false;
        // own chairs: only ours is passable
        const x = cx(i),
          z = cz(j);
        for (let q = 0; q < nch; q++) {
          if (q === k) continue;
          const o = T.chairs[q];
          if ((x - o.x) ** 2 + (z - o.z) ** 2 < (CHAIR_R + BODY) ** 2) return false;
        }
        return (x - T.x) ** 2 + (z - T.z) ** 2 > (TOP_R + BODY) ** 2;
      };
      let si = Math.floor((stx - ox) / CELL),
        sj = Math.floor((stz - oz) / CELL);
      if (!open(si, sj)) {
        // try the other side
        stx = ch.x + ux * 0.18 - tx * 0.5;
        stz = ch.z + uz * 0.18 - tz * 0.5;
        si = Math.floor((stx - ox) / CELL);
        sj = Math.floor((stz - oz) / CELL);
        if (!open(si, sj)) continue;
      }
      dist.fill(Infinity);
      prev.fill(-1);
      heap.length = 0;
      const s0 = sj * N + si;
      dist[s0] = 0;
      heap.push(s0);
      while (heap.length) {
        // tiny binary heap on dist
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
        const ti = top % N,
          tj = (top - ti) / N;
        const d0 = dist[top];
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = ti + di,
              nj = tj + dj;
            if (!open(ni, nj)) continue;
            if (di && dj && (!open(ti + di, tj) || !open(ti, tj + dj))) continue;
            const nd = d0 + (di && dj ? 1.4142 : 1) * CELL;
            const id = nj * N + ni;
            if (nd < dist[id]) {
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
      const seat: CafeSeat = { x: sx0, z: sz0, y: T.y + (ch.seatTop - T.y) - SEAT_TOP, yaw: ch.yaw, taken: -1, cx: ch.x, cz: ch.z, sx: stx, sz: stz, path: [], k, rel };
      const per = new Map<number, number[]>();
      const cost = new Map<number, number>();
      for (const n of near) {
        const ni = Math.floor((n.x - ox) / CELL),
          nj = Math.floor((n.z - oz) / CELL);
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const id = nj * N + ni;
        if (!isFinite(dist[id])) continue;
        // walk back from the node to the standing point, then simplify (line of sight on the grid)
        const cells: number[] = [];
        for (let c = id; c >= 0; c = prev[c]) cells.push(c);
        const pts: [number, number][] = cells.map((c) => [cx(c % N), cz(Math.floor(c / N))]);
        pts[pts.length - 1] = [stx, stz];
        const simp: [number, number][] = [pts[0]];
        let a = 0;
        while (a < pts.length - 1) {
          let b = pts.length - 1;
          for (; b > a + 1; b--) if (losFree(pts[a], pts[b], open, ox, oz)) break;
          simp.push(pts[b]);
          a = b;
        }
        const flat: number[] = [];
        for (let q = 1; q < simp.length; q++) flat.push(simp[q][0], simp[q][1], T.y);
        per.set(n.id, flat);
        cost.set(n.id, dist[id]);
      }
      paths.push({ seat, per, cost });
      seats.push(seat);
    }
    if (!seats.length) continue;
    for (const n of near) {
      let c = 0;
      let ok = true;
      for (const p of paths) {
        const v = p.cost.get(n.id);
        if (v === undefined) {
          ok = false;
          break;
        }
        c += v;
      }
      if (ok && c < bestCost) {
        bestCost = c;
        bestNode = n.id;
      }
    }
    if (bestNode < 0 || bestCost / seats.length > 22) continue;
    for (const p of paths) p.seat.path = p.per.get(bestNode)!;
    // seats keep the table's chair order (k) — pairs sit opposite each other where possible
    const nd = peds.nodes[bestNode];
    let wx = (T.x + nd.x) / 2,
      wz = (T.z + nd.z) / 2;
    const wl = Math.hypot(nd.x - T.x, nd.z - T.z) || 1;
    wx = T.x + ((nd.x - T.x) / wl) * 1.25;
    wz = T.z + ((nd.z - T.z) / wl) * 1.25;
    const lot = plan.lots.find((l) => Math.abs((l.footprint.x0 + l.footprint.x1) / 2 - T.x) < 30 && Math.abs((l.footprint.z0 + l.footprint.z1) / 2 - T.z) < 30 && l.name);
    void lot;
    out.push({
      id: out.length,
      node: bestNode,
      x: T.x,
      z: T.z,
      y: T.y,
      top: T.top,
      r: T.r,
      seats,
      wx,
      wz,
      district: districtName(T.x, T.z),
      label: `Having a coffee on a terrace in ${districtName(T.x, T.z)}`,
      taken: -1,
      since: 0,
    });
  }
  return out;
}

/** straight walk between two points stays on open cells (sampled every half cell) */
function losFree(a: [number, number], b: [number, number], open: (i: number, j: number) => boolean, ox: number, oz: number): boolean {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / (CELL * 0.5)));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = a[0] + (b[0] - a[0]) * t,
      z = a[1] + (b[1] - a[1]) * t;
    if (!open(Math.floor((x - ox) / CELL), Math.floor((z - oz) / CELL))) return false;
  }
  return true;
}
