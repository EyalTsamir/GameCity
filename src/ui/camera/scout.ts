// Finds interesting moving entities (bus, train, boat, car, pedestrian) for the auto-tour
// using only the generic picker interface: rays are cast along the places where such
// entities live (bus lanes, the rail line, the sea, sidewalks) and hits of the wanted kind
// are collected. Work is time-sliced so it never costs more than ~1 ms per frame.

import * as THREE from 'three';
import type { CityContext, PickHit } from '../../core/context';
import { RAIL_Z, WATER_LEVEL, QUAY_X, RIVER } from '../../core/constants';

export type ScoutKind = PickHit['kind'];

interface RaySpec {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

interface Job {
  kinds: ScoutKind[];
  rays: RaySpec[];
  next: number;
  found: PickHit[];
  near?: { x: number; z: number };
  resolve: (hit: PickHit | null) => void;
}

const _ray = new THREE.Ray();
const _pos = new THREE.Vector3();

/** pickers that only return static things — skipped when looking for vehicles / boats */
const STATIC_PICKERS = new Set(['buildings', 'landmarks', 'props', 'vegetation', 'terrain', 'roads', 'water']);
/** the census only wants buses, trains and boats: the crowd picker (every pedestrian per ray) never returns one */
const CENSUS_SKIP = new Set([...STATIC_PICKERS, 'pedestrians']);

export interface LiveEntity {
  x: number;
  z: number;
  kind: PickHit['kind'];
  color: string;
}

interface Tracked {
  hit: PickHit;
  color: string;
}

export class Scout {
  private job: Job | null = null;
  /** recent bus-stop arrivals: likely bus positions */
  private busHints: { x: number; z: number; t: number }[] = [];
  /** background census of buses / trains / boats for the minimap */
  private census = new Map<string, Tracked>();
  private censusRays: RaySpec[] = [];
  private censusNext = 0;
  private censusAt = -1e9;

  constructor(private ctx: CityContext) {
    ctx.events.on('bus:stop', (p: { stopId?: number; phase?: string } | undefined) => {
      const stop = p && typeof p.stopId === 'number' ? ctx.plan.busStops[p.stopId] : undefined;
      if (!stop) return;
      this.busHints.push({ x: stop.x, z: stop.z, t: performance.now() });
      if (this.busHints.length > 12) this.busHints.shift();
    });
  }

  get busy(): boolean {
    return this.job !== null;
  }

  cancel(): void {
    if (this.job) this.job.resolve(null);
    this.job = null;
  }

  /** Pick the nearest hit over all pickers (fault isolated). */
  pick(ray: THREE.Ray): PickHit | null {
    let best: PickHit | null = null;
    for (const p of this.ctx.pickers) {
      let h: PickHit | null = null;
      try {
        h = p.pick(ray);
      } catch {
        h = null;
      }
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    return best;
  }

  /** Start looking for an entity of one of `kinds`. Resolves with a random hit (or null). */
  find(kinds: ScoutKind[], near?: { x: number; z: number }): Promise<PickHit | null> {
    this.cancel();
    return new Promise((resolve) => {
      if (this.ctx.pickers.length === 0) {
        resolve(null);
        return;
      }
      const rays: RaySpec[] = [];
      for (const k of kinds) this.raysFor(k, rays);
      // shuffle so a time-limited scan still samples the whole city
      for (let i = rays.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = rays[i];
        rays[i] = rays[j];
        rays[j] = t;
      }
      this.job = { kinds, rays, next: 0, found: [], near, resolve };
    });
  }

  /** advance the current job (call once per frame) */
  update(): void {
    const job = this.job;
    if (!job) return;
    const t0 = performance.now();
    while (job.next < job.rays.length && performance.now() - t0 < 1.0) {
      const r = job.rays[job.next++];
      _ray.origin.set(r.ox, r.oy, r.oz);
      _ray.direction.set(r.dx, r.dy, r.dz).normalize();
      // collect hits of the wanted kind (pickers return the nearest only, so also try each picker)
      for (const p of this.ctx.pickers) {
        if (STATIC_PICKERS.has(p.name)) continue;
        let h: PickHit | null = null;
        try {
          h = p.pick(_ray);
        } catch {
          h = null;
        }
        if (h && job.kinds.includes(h.kind)) job.found.push(h);
      }
      if (job.found.length >= 6) break;
    }
    if (job.found.length >= 6 || job.next >= job.rays.length) {
      this.job = null;
      job.resolve(this.choose(job));
    }
  }

  /** low-priority rolling scan that keeps track of buses, trains and boats (for the minimap) */
  updateCensus(budgetMs: number): void {
    if (this.job || this.ctx.pickers.length === 0) return;
    const now = performance.now();
    if (this.censusNext >= this.censusRays.length) {
      if (now - this.censusAt < 3500) return;
      this.censusRays = [];
      this.raysFor('bus', this.censusRays);
      this.raysFor('train', this.censusRays);
      this.raysFor('boat', this.censusRays);
      this.censusNext = 0;
      this.censusAt = now;
    }
    const t0 = performance.now();
    while (this.censusNext < this.censusRays.length && performance.now() - t0 < budgetMs) {
      const r = this.censusRays[this.censusNext++];
      _ray.origin.set(r.ox, r.oy, r.oz);
      _ray.direction.set(r.dx, r.dy, r.dz).normalize();
      for (const p of this.ctx.pickers) {
        if (CENSUS_SKIP.has(p.name)) continue;
        let h: PickHit | null = null;
        try {
          h = p.pick(_ray);
        } catch {
          h = null;
        }
        if (!h || (h.kind !== 'bus' && h.kind !== 'train' && h.kind !== 'boat')) continue;
        const key = `${h.kind}:${h.id}`;
        if (!this.census.has(key)) this.census.set(key, { hit: h, color: this.colorFor(h) });
      }
    }
  }

  private colorFor(h: PickHit): string {
    if (h.kind === 'train') return '#c0392b';
    if (h.kind === 'boat') return '#f6f2ea';
    for (const r of this.ctx.roads.busRoutes) if (h.label.startsWith(r.name)) return r.color;
    return '#e9b23a';
  }

  /** live positions of the tracked entities (drops the ones that have gone) */
  live(out: LiveEntity[]): LiveEntity[] {
    out.length = 0;
    for (const [key, t] of this.census) {
      let ok = false;
      try {
        ok = t.hit.getPosition(_pos);
      } catch {
        ok = false;
      }
      if (!ok || !isFinite(_pos.x)) {
        this.census.delete(key);
        continue;
      }
      out.push({ x: _pos.x, z: _pos.z, kind: t.hit.kind, color: t.color });
    }
    return out;
  }

  private choose(job: Job): PickHit | null {
    if (job.found.length === 0) return null;
    // dedupe by kind+id, prefer ones near the requested point, otherwise random
    const uniq = new Map<string, PickHit>();
    for (const h of job.found) uniq.set(`${h.kind}:${h.id}`, h);
    const list = [...uniq.values()];
    if (job.near) {
      const v = new THREE.Vector3();
      let best: PickHit | null = null,
        bd = Infinity;
      for (const h of list) {
        if (!h.getPosition(v)) continue;
        const d = Math.hypot(v.x - job.near.x, v.z - job.near.z);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      return best;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  private raysFor(kind: ScoutKind, out: RaySpec[]): void {
    const { plan, roads } = this.ctx;
    switch (kind) {
      case 'train': {
        const y = plan.rail.railY + 1.8;
        out.push({ ox: plan.rail.x0 - 40, oy: y, oz: RAIL_Z, dx: 1, dy: 0, dz: 0 });
        out.push({ ox: plan.rail.x1 + 40, oy: y, oz: RAIL_Z, dx: -1, dy: 0, dz: 0 });
        out.push({ ox: plan.rail.x0 - 40, oy: y + 1.2, oz: RAIL_Z + 0.6, dx: 1, dy: 0, dz: 0 });
        out.push({ ox: plan.rail.x1 + 40, oy: y + 1.2, oz: RAIL_Z - 0.6, dx: -1, dy: 0, dz: 0 });
        // a few top-down probes along the track
        for (let x = plan.rail.x0; x <= plan.rail.x1; x += 9) out.push({ ox: x, oy: 30, oz: RAIL_Z, dx: 0, dy: -1, dz: 0 });
        break;
      }
      case 'boat': {
        const y = WATER_LEVEL + 0.9;
        for (let z = plan.slab.z0 + 6; z < plan.slab.z1; z += 10) {
          out.push({ ox: QUAY_X + 0.5, oy: y, oz: z, dx: 1, dy: 0, dz: 0 });
          out.push({ ox: plan.slab.x1 + 5, oy: y + 0.5, oz: z + 5, dx: -1, dy: 0, dz: 0 });
        }
        for (let x = QUAY_X + 4; x < plan.slab.x1; x += 9) out.push({ ox: x, oy: y, oz: plan.slab.z0, dx: 0, dy: 0, dz: 1 });
        for (const z of [RIVER.z0 + 4, (RIVER.z0 + RIVER.z1) / 2, RIVER.z1 - 4]) {
          out.push({ ox: plan.slab.x0 - 5, oy: y, oz: z, dx: 1, dy: 0, dz: 0 });
          out.push({ ox: plan.slab.x1 + 5, oy: y, oz: z, dx: -1, dy: 0, dz: 0 });
        }
        break;
      }
      case 'bus': {
        const seen = new Set<number>();
        for (const r of roads.busRoutes) {
          for (const li of r.lanes) {
            if (seen.has(li)) continue;
            seen.add(li);
            const lane = roads.lanes[li];
            if (!lane) continue;
            const a = lane.path.pts[0],
              b = lane.path.pts[lane.path.pts.length - 1];
            const dx = b.x - a.x,
              dz = b.z - a.z;
            out.push({ ox: a.x, oy: 2.7, oz: a.z, dx, dy: 0, dz });
            for (let s = 4; s < lane.length; s += 8) {
              const p = lane.path.at(s);
              out.push({ ox: p.x, oy: 25, oz: p.z, dx: 0, dy: -1, dz: 0 });
            }
          }
        }
        const now = performance.now();
        for (const h of this.busHints) {
          if (now - h.t > 30000) continue;
          for (let k = 0; k < 6; k++) out.push({ ox: h.x + (Math.random() - 0.5) * 6, oy: 25, oz: h.z + (Math.random() - 0.5) * 6, dx: 0, dy: -1, dz: 0 });
        }
        break;
      }
      case 'vehicle': {
        for (const lane of roads.lanes) {
          if (lane.sink || lane.source) continue;
          const a = lane.path.pts[0],
            b = lane.path.pts[lane.path.pts.length - 1];
          out.push({ ox: a.x, oy: 0.8, oz: a.z, dx: b.x - a.x, dy: 0, dz: b.z - a.z });
        }
        break;
      }
      case 'pedestrian': {
        const peds = this.ctx.peds;
        const edges = peds.edges;
        for (let i = 0; i < edges.length; i += 3) {
          const e = edges[i];
          const A = peds.nodes[e.a],
            B = peds.nodes[e.b];
          if (!A || !B) continue;
          out.push({ ox: A.x, oy: 1.0 + (A.y ?? 0), oz: A.z, dx: B.x - A.x, dy: 0, dz: B.z - A.z });
        }
        break;
      }
      default:
        break;
    }
  }
}
