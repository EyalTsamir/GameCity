// Module "traffic": vehicles, buses, parked cars, traffic signals & stop signs.
//
//   sim.ts      driving simulation (IDM, junction reservations, crossings, buses, population)
//   render.ts   instanced vehicles (moving + parked), night light pools & flares
//   models.ts   procedural toy vehicles + decal atlas
//   signals.ts  signal poles / pedestrian heads / stop signs with live lamps

import * as THREE from 'three';
import type { CityContext, CityModule, PickHit } from '../core/context';
import { OCC } from '../core/occupancy';
import { TrafficSim, Vehicle, St } from './traffic/sim';
import { VehicleRenderer, ParkedCar, pickParkedModel } from './traffic/render';
import { SignalRenderer } from './traffic/signals';
import { BODY_COLORS, SPECS, SEDAN_TAXI } from './traffic/specs';
import { debugGround } from './traffic/debugGround';

const LOGO_NAMES = ['Haven Bakery van', 'Haven Post van', 'Fresh Fish Co. van', 'Bloom Florist van'];

export default function create(ctx: CityContext): CityModule {
  const sim = new TrafficSim(ctx);
  sim.events = {
    busStop: (stopId, busId, phase) => ctx.events.emit('bus:stop', { stopId, busId, phase }),
  };
  const parked = buildParked(ctx);
  const renderer = new VehicleRenderer(ctx, sim, parked);
  const signals = new SignalRenderer(ctx);
  if (ctx.debug.params.has('tground')) ctx.scene.add(debugGround(ctx));
  // ?hide=traffic: simulate but draw nothing (isolates the rendering cost in perf runs)
  if ((ctx.debug.params.get('hide') ?? '').split(',').includes('traffic')) renderer.group.visible = signals.group.visible = false;
  if (ctx.debug.params.has('tlineup')) renderer.addLineup(-17, 22, ctx.debug.params.get('tlineup') === 'lods');
  sim.populate(ctx.clock.hours);
  renderer.frame(0);

  let simMs = 0;
  let frameMs = 0;

  // ── picking
  const sphere = new THREE.Sphere();
  const hitP = new THREE.Vector3();
  ctx.pickers.push({
    name: 'traffic',
    pick(ray: THREE.Ray): PickHit | null {
      let best: Vehicle | null = null;
      let bestP: ParkedCar | null = null;
      let bd = Infinity;
      for (const V of sim.vehicles) {
        sphere.center.set(V.x, V.spec.height * 0.5, V.z);
        sphere.radius = Math.max(1.3, V.len * 0.5);
        if (!ray.intersectSphere(sphere, hitP)) continue;
        const d = hitP.distanceTo(ray.origin);
        if (d < bd) {
          bd = d;
          best = V;
        }
      }
      for (const p of parked) {
        sphere.center.set(p.x, 0.75, p.z);
        sphere.radius = 1.6;
        if (!ray.intersectSphere(sphere, hitP)) continue;
        const d = hitP.distanceTo(ray.origin);
        if (d < bd) {
          bd = d;
          best = null;
          bestP = p;
        }
      }
      if (best) return vehicleHit(best, bd);
      if (bestP) return parkedHit(bestP, bd);
      return null;
    },
  });

  function vehicleLabel(V: Vehicle): string {
    if (V.route >= 0) return `${ctx.roads.busRoutes[V.route].name} bus`;
    if (V.police) return 'Police car';
    if (V.icecream) return 'Ice-cream van';
    if (V.spec.model === 'sedan' && V.variant === SEDAN_TAXI) return 'Taxi';
    if (V.spec.model === 'delivery') return LOGO_NAMES[V.variant] ?? 'Delivery van';
    if (V.spec.model === 'lorry') return V.variant === 0 ? 'Lorry with crates' : 'Haven Haulage lorry';
    return V.spec.label;
  }

  function districtNear(V: Vehicle): string {
    const rx = Math.cos(V.yaw),
      rz = -Math.sin(V.yaw);
    for (const s of [-9, 9, -14, 14]) {
      const d = ctx.plan.districtAt(V.x + rx * s, V.z + rz * s);
      if (d) return d.name;
    }
    return 'Tinyhaven';
  }

  function activity(V: Vehicle): string {
    switch (V.status) {
      case St.Red:
        return V.v < 0.5 ? 'Waiting at a red light' : 'Slowing for the lights';
      case St.StopSign:
        return V.v < 0.3 ? 'Stopped at a stop sign' : 'Slowing for a stop sign';
      case St.Yield:
        return 'Giving way';
      case St.LeftTurn:
        return 'Waiting to turn left';
      case St.Peds:
        return 'Letting pedestrians cross';
      case St.Blocked:
        return 'Waiting for space ahead';
      case St.Crossing: {
        const lane = V.elem < sim.NL ? sim.lanes[V.elem] : null;
        const c = lane?.crossing ? ctx.roads.crossings[lane.crossing.id] : null;
        return c?.closed ? 'Waiting at the level crossing' : 'Crossing the railway';
      }
      case St.BusStop:
        return `Boarding at ${sim.stopName.get(V.dwellStop) ?? 'the stop'}`;
      case St.Turning:
        return 'Turning';
      case St.Junction:
        return 'Crossing the junction';
      case St.Queue:
        return 'Queueing';
      case St.Tunnel:
        return 'Entering the tunnel';
      default:
        return V.v < 0.3 ? 'Waiting' : `Driving through ${districtNear(V)}`;
    }
  }

  function purpose(V: Vehicle): string {
    if (V.route >= 0) {
      const n = sim.nextStopName(V);
      return n ? `Next stop: ${n}` : 'In service';
    }
    if (V.police) return V.siren > 0 ? 'Responding to a call' : 'On patrol';
    if (V.icecream) return V.leaving ? 'Heading home for the night' : 'Selling ice cream around town';
    if (V.leaving) return `Leaving town via the ${sim.lanePortalName(V)} tunnel`;
    if (V.spec.model === 'sedan' && V.variant === SEDAN_TAXI) return V.id % 3 === 0 ? 'Looking for a fare' : 'Carrying a passenger';
    if (V.spec.model === 'delivery') return 'Out on deliveries';
    if (V.spec.model === 'moto' && V.spec.variant === 1) return ['Delivering a takeaway', 'On the way to a pickup', 'Racing the clock with a pizza'][V.id % 3];
    if (V.spec.model === 'bike' && V.spec.variant === 1) return ['Scooting to a meeting', 'Last mile home', 'Off to the beach'][V.id % 3];
    if (V.spec.model === 'lorry') return 'Hauling freight';
    const h = ctx.clock.hours;
    const k = V.id % 3;
    if (h >= 6 && h < 10) return ['Commuting to work', 'On the school run', 'Off to an early meeting'][k];
    if (h >= 10 && h < 16) return ['Running errands', 'Going shopping', 'Visiting friends'][k];
    if (h >= 16 && h < 20) return ['Heading home', 'Off to the beach', 'Picking up dinner'][k];
    return ['Driving home late', 'Night shift', 'Back from the cinema'][k];
  }

  function vehicleHit(V: Vehicle, distance: number): PickHit {
    return {
      kind: V.route >= 0 ? 'bus' : 'vehicle',
      id: V.id,
      distance,
      label: vehicleLabel(V),
      getPosition(out: THREE.Vector3): boolean {
        if (V.dead) return false;
        out.set(V.x, V.spec.height * 0.5, V.z);
        return true;
      },
      getHeading: () => V.yaw,
      info: () => {
        const lines = [`${Math.round(V.v * 3.6)} km/h`, activity(V), purpose(V)];
        return lines;
      },
    };
  }

  function parkedHit(p: ParkedCar, distance: number): PickHit {
    return {
      kind: 'vehicle',
      id: -1 - parked.indexOf(p),
      distance,
      label: `Parked ${SPECS[p.model].label.toLowerCase()}`,
      getPosition(out: THREE.Vector3): boolean {
        out.set(p.x, 0.7, p.z);
        return true;
      },
      getHeading: () => p.yaw,
      info: () => ['Parked', 'Engine off'],
    };
  }

  // ── service
  const service = {
    count: () => sim.vehicles.length,
    /** live vehicle list (the array is replaced when vehicles leave: fetch it every frame); riders of the
     * two-wheelers (V.twoWheel) are drawn by the pedestrians module from V.x/z/yaw/lean/crank */
    vehicles: () => sim.vehicles,
    busCount: () => sim.busCount(),
    /** number of moving vehicles within r of (x, z) — handy for ambient audio */
    near: (x: number, z: number, r: number) => {
      let n = 0;
      for (const V of sim.vehicles) if ((V.x - x) ** 2 + (V.z - z) ** 2 < r * r && V.v > 1) n++;
      return n;
    },
  };
  ctx.services.traffic = service;
  // debug helper for automated soak tests (window.__city.ctx.services.trafficDebug())
  ctx.services.trafficDebug = () => {
    const counts: Record<string, number> = {};
    const names = Object.keys(St) as (keyof typeof St)[];
    for (const V of sim.vehicles) {
      const n = names.find((k) => St[k] === V.status) ?? String(V.status);
      counts[n] = (counts[n] ?? 0) + 1;
    }
    const stuck = sim.vehicles
      .filter((V) => V.progT > 20 || (V.elem >= sim.NL && V.progT > 4))
      .sort((a, b) => (b.elem >= sim.NL ? 1000 : 0) + b.progT - (a.elem >= sim.NL ? 1000 : 0) - a.progT)
      .slice(0, 12)
      .map((V) => {
        const n = names.find((k) => St[k] === V.status) ?? String(V.status);
        let node = -1,
          ctl = '',
          asp = '';
        if (V.m1 >= 0) {
          node = sim.movs[V.m1].node;
          ctl = ctx.roads.intersections[node].control;
          asp = ctl === 'signal' ? ctx.intersections.aspect(node, sim.movs[V.m1].fromArm) : '';
        }
        let occ = '';
        if (node >= 0 && !V.entered) {
          const o = ctx.intersections.occupancy(node);
          occ =
            ' occ[' +
            o.vehicles
              .map((r) => {
                const W = sim.vehicles.find((x) => x.id === r.id);
                return W ? `#${W.id}:m${r.movement}/${sim.movs[r.movement].turn} e${W.elem} s${W.s.toFixed(1)} v${W.v.toFixed(1)} t${W.progT.toFixed(0)}` : `#${r.id}:DEAD`;
              })
              .join(', ') +
            `] peds=${o.peds.length} appr=${o.approaching}`;
        }
        return `#${V.id} ${V.spec.model} ${n} t=${V.progT.toFixed(0)} (${V.x.toFixed(0)},${V.z.toFixed(0)}) elem=${V.elem}${V.elem >= sim.NL ? 'M' : 'L'} s=${V.s.toFixed(1)}/${sim.elemLen[V.elem].toFixed(1)} v=${V.v.toFixed(2)} m1=${V.m1}(${V.m1 >= 0 ? sim.movs[V.m1].turn : ''}) node=${node} ${ctl} ${asp} res=${V.resNode} ent=${V.entered} lead=#${V.leaderId}@${V.leaderGapDbg.toFixed(1)} maxAdv=${V.maxAdv.toFixed(2)}${occ}`;
      });
    // queue hotspots: waiting vehicles per junction (node:control:count)
    const hot = new Map<number, number>();
    for (const V of sim.vehicles) {
      if (V.v > 0.5 || V.m1 < 0) continue;
      const node = sim.movs[V.m1].node;
      hot.set(node, (hot.get(node) ?? 0) + 1);
    }
    const hotspots = [...hot]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n, c]) => `${n}(${ctx.roads.intersections[n].x},${ctx.roads.intersections[n].z})${ctx.roads.intersections[n].control[0]}:${c}`)
      .join(' ');
    return { counts, stuck, hotspots };
  };

  return {
    name: 'traffic',
    update(dt: number): void {
      const t0 = performance.now();
      sim.update(dt);
      simMs = simMs * 0.9 + (performance.now() - t0) * 0.1;
    },
    frame(realDt: number): void {
      const t0 = performance.now();
      renderer.frame(realDt);
      signals.update();
      frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
    },
    stats() {
      let moving = 0,
        sum = 0,
        waiting = 0;
      for (const V of sim.vehicles) {
        sum += V.v;
        if (V.v > 0.5) moving++;
        else waiting++;
      }
      return {
        vehicles: sim.vehicles.length,
        buses: sim.busCount(),
        target: sim.target,
        moving,
        waiting,
        avgKmh: Math.round((sum / Math.max(1, sim.vehicles.length)) * 36) / 10,
        parked: parked.length,
        signals: signals.poleCount,
        stopSigns: signals.stopSignCount,
        spawned: sim.stats.spawned,
        despawned: sim.stats.despawned,
        tunnelIn: sim.stats.tunnelIn,
        tunnelOut: sim.stats.tunnelOut,
        hiddenSpawns: sim.stats.hiddenSpawns,
        hiddenDespawns: sim.stats.hiddenDespawns,
        reroutes: sim.stats.reroutes,
        watchdog: sim.stats.watchdog,
        simMs: Math.round(simMs * 100) / 100,
        renderMs: Math.round(frameMs * 100) / 100,
        drawCalls: renderer.drawCallsEstimate() + 2,
        drawn: renderer.drawn,
        lod: renderer.lodCounts.join('/'),
        vehicleTris: renderer.triangles,
      };
    },
    invariants(): string[] {
      return sim.invariants((x, z) => ctx.occupancy.has(x, z, OCC.ROAD | OCC.PAVED));
    },
    dispose(): void {
      ctx.scene.remove(renderer.group);
      ctx.scene.remove(signals.group);
    },
  };
}

function buildParked(ctx: CityContext): ParkedCar[] {
  const rng = ctx.rng('traffic-parked');
  const out: ParkedCar[] = [];
  for (const a of ctx.plan.areas) {
    if (!a.stalls) continue;
    for (const st of a.stalls) {
      if (!st.filled) continue;
      out.push({ model: pickParkedModel(rng.next()), variant: 0, color: rng.pick(BODY_COLORS), x: st.x, z: st.z, yaw: st.yaw });
    }
  }
  return out;
}
