// Module "ambient" — ambient life & effects: smoke/steam, birds (flocks, gulls, pigeons,
// ducks & swans), sky life (hot-air balloon, airplane, blimp), harbour fireworks, beach
// kites, park butterflies and pond fireflies. Everything is instanced (≈10 draw calls).
//
// ── Service: ctx.services.smoke (registered synchronously at creation; the module loads
//    right after "water", so every later module can use it in its factory) ──────────────
//
//   ctx.services.smoke = {
//     addEmitter(opts: {
//       getPosition(out: THREE.Vector3): void;  // world emission point, polled every sim step
//                                              //   (may return false to pause emission)
//       rate?: number;                          // puffs per second           (default 5)
//       size?: number;                          // initial puff radius, m     (default 1.0; grows ~4x)
//       color?: THREE.ColorRepresentation;      // albedo tint                (default '#ebe7e1' steam;
//                                              //   ~'#8d8b88' sooty funnel smoke)
//       life?: number;                          // seconds a puff lives       (default 9)
//       rise?: number;                          // initial rise speed, m/s    (default 2.4)
//       glow?: number;                          // optional 0..1 warm under-glow at night
//       opacity?: number;                       // optional opacity multiplier (thin wood smoke ~0.5)
//     }): { remove(): void; set(opts: Partial<…>): void };
//     burst(position: THREE.Vector3, count: number, opts?): void;   // optional one-shot puffs
//   }
//
//   Example (a ship funnel):
//     const smoke = ctx.services.smoke as SmokeService | undefined;
//     const h = smoke?.addEmitter({ getPosition: (o) => o.set(x, 14, z), rate: 4, size: 0.9, color: '#9a9894' });
//     … h?.remove();
//   Puffs live in sim time (frozen while paused) and drift with the shared wind field
//   (core/wind.ts windAt: gust fronts, stronger aloft). All emitters share one particle budget
//   (~1400 puffs, scaled by quality.density); distant emitters emit fewer, larger puffs, and rates
//   are scaled down together when the city would exceed the budget.
//
// ── Events
//   listens  'fireworks:launch' (payload optional { duration?: seconds, x?, z? }) → starts a show
//   emits    'fireworks' { phase: 'burst', x, y, z, kind } once per shell burst (audio)
//            'fireworks:show' { phase: 'start' | 'end' }
//   The nightly show starts when the clock is in 22:00–22:03 and runs ~50 sim seconds.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { createSmoke, type SmokeService } from './ambient/smoke';
import { createBirds } from './ambient/birds';
import { createWaterfowl } from './ambient/waterfowl';
import { createSparks } from './ambient/sparks';
import { createFireworks } from './ambient/fireworks';
import { createVehicles } from './ambient/vehicles';
import { createKites } from './ambient/kites';
import { createFireflies } from './ambient/fireflies';
import { SkylineGrid } from './ambient/shared';

export type { SmokeService, SmokeEmitterOptions, SmokeHandle } from './ambient/smoke';

/** A sub-system of the ambient module (all methods optional). */
interface Part {
  update?(dt: number): void;
  frame?(): void;
  timejump?(): void;
  stats?(): Record<string, number | string>;
  invariants?(): string[];
}

export default function create(ctx: CityContext): CityModule {
  const root = new THREE.Group();
  root.name = 'ambient';
  ctx.scene.add(root);

  // ── smoke first: other modules depend on the service (registered before anything can fail)
  const smoke = createSmoke(ctx);
  root.add(smoke.mesh);
  const smokeService: SmokeService = smoke.service;
  ctx.services.smoke = smokeService;

  // factory chimneys from the plan
  let chimneys = 0;
  for (const f of ctx.plan.features) {
    if (f.kind !== 'chimney' || !f.params?.smoke) continue;
    const h = typeof f.params.height === 'number' ? f.params.height : 30;
    const r = typeof f.params.radius === 'number' ? f.params.radius : 1.5;
    const top = Math.max(0, ctx.plan.heightAt(f.x, f.z)) + h + 0.4;
    const x = f.x,
      z = f.z;
    smokeService.addEmitter({ getPosition: (o) => void o.set(x, top, z), rate: 9, size: r * 1.15, life: 12, rise: 3.0, color: '#f2efea', glow: 0.8 });
    chimneys++;
  }

  // ── everything else is fault-isolated per sub-system: one failing part never takes the
  //    smoke service (or the rest of the module) down with it
  const parts = new Map<string, Part>();
  const broken: string[] = [];
  const build = <T extends Part>(name: string, fn: () => T): T | null => {
    try {
      const p = fn();
      parts.set(name, p);
      return p;
    } catch (err) {
      broken.push(`${name}: failed to build (${err instanceof Error ? err.message : String(err)})`);
      console.error(`[ambient] ${name} failed to build`, err);
      return null;
    }
  };
  const partMs = new Map<string, number>();
  const run = (name: string, p: Part, fn: (p: Part) => void) => {
    try {
      const t0 = performance.now();
      fn(p);
      partMs.set(name, (partMs.get(name) ?? 0) + performance.now() - t0);
    } catch (err) {
      parts.delete(name);
      broken.push(`${name}: disabled after an error (${err instanceof Error ? err.message : String(err)})`);
      console.error(`[ambient] ${name} disabled after an error`, err);
    }
  };

  parts.set('smoke', smoke);
  const skyline = new SkylineGrid(ctx);
  const birds = build('birds', () => createBirds(ctx, skyline));
  if (birds) root.add(birds.mesh);
  const fowl = build('waterfowl', () => createWaterfowl(ctx));
  if (fowl) root.add(fowl.mesh);
  const sparks = build('sparks', () => createSparks(ctx));
  if (sparks) root.add(sparks.prepass, sparks.points);
  const fireworks = sparks ? build('fireworks', () => createFireworks(ctx, sparks)) : null;
  const vehicles = sparks ? build('vehicles', () => createVehicles(ctx, sparks, skyline, fireworks?.site ?? { x: 180, z: -58 })) : null;
  if (vehicles) root.add(vehicles.mesh);
  const kites = build('kites', () => createKites(ctx));
  if (kites) root.add(kites.mesh);
  if (sparks) build('fireflies', () => createFireflies(ctx, sparks));
  // order of per-frame work: vehicles & fireflies write glow slots before the sparks upload them
  const frameOrder = ['vehicles', 'fireflies', 'smoke', 'sparks'];
  const updateOrder = ['smoke', 'birds', 'waterfowl', 'sparks', 'fireworks', 'vehicles', 'kites', 'fireflies'];

  ctx.events.on('timejump', () => {
    for (const [name, p] of parts) if (p.timejump) run(name, p, (q) => q.timejump!());
  });

  // debug / automation: where is creature X?  __city.ctx.services.ambientDebug.locate('pigeon', 0)
  ctx.services.ambientDebug = {
    locate: (kind: string, i = 0) => {
      if (kind === 'fowl') return fowl?.locate(i) ?? null;
      if (kind === 'kite') return kites?.locate(i) ?? null;
      if (['balloon', 'plane', 'blimp', 'barge'].includes(kind)) return vehicles?.locate(kind) ?? null;
      return birds?.locate(kind, i) ?? null;
    },
  };

  // own CPU cost (update + frame), exponential moving average in ms
  let cpuMs = 0,
    tUpdate = 0,
    frames = 0;
  return {
    name: 'ambient',
    update(dt) {
      const t0 = performance.now();
      if (dt > 0) {
        for (const name of updateOrder) {
          const p = parts.get(name);
          if (p?.update) run(name, p, (q) => q.update!(dt));
        }
      }
      tUpdate = performance.now() - t0;
    },
    frame() {
      const t0 = performance.now();
      for (const name of frameOrder) {
        const p = parts.get(name);
        if (p?.frame) run(name, p, (q) => q.frame!());
      }
      cpuMs = cpuMs * 0.97 + (tUpdate + performance.now() - t0) * 0.03;
      frames++;
    },
    stats() {
      const out: Record<string, number | string> = { cpuMs: Math.round(cpuMs * 1000) / 1000, chimneys };
      // average CPU ms per frame for each part since the last stats() call
      if (frames > 0) for (const [k, v] of partMs) out[`ms_${k}`] = Math.round((v / frames) * 1000) / 1000;
      partMs.clear();
      frames = 0;
      for (const p of parts.values()) if (p.stats) Object.assign(out, p.stats());
      return out;
    },
    invariants() {
      const out: string[] = [...broken];
      for (const p of parts.values()) if (p.invariants) out.push(...p.invariants());
      return out;
    },
  };
}
