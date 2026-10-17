// Module "rail": the electrified single-track line along the northern edge of the city.
//
//   static   ballast bed, sleepers, rails sinking flush into two level-crossing decks, overhead
//            line masts + wires, lineside fence, colour-light signals, Tinyhaven Central's
//            platform with a Victorian canopy, benches, lamps, clock, name signs and an LED
//            departure board — 2 static draw calls + wires + signs + one glow batch
//   trains   regional EMUs (3–4 cars, stop at the platform, doors open, lit windows at night)
//            and container freight trains (pass without stopping), instanced per car type
//   crossings ETA-based protection: lights flash 4 s, booms lower, stay down until the tail
//            has cleared + 2 s; trains hold short of an occupied crossing
//
// Events: 'train:arrive' / 'train:depart' {station, trainId}, 'crossing' {id, closed}.
// Service: ctx.services.rail = { trains(), sim } (see RailService).

import * as THREE from 'three';
import type { CityContext, CityModule, PickHit } from '../core/context';
import { Geo } from './rail/geo';
import { makeProfile } from './rail/profile';
import { createRailStaticMaterial } from './rail/staticMaterial';
import { buildTrack } from './rail/track';
import { buildStation } from './rail/station';
import { buildCrossingGear } from './rail/crossingGear';
import { createSigns } from './rail/signs';
import { Glows } from './rail/glows';
import { RailSim, type Train } from './rail/trains';
import { TrainRenderer } from './rail/trainRender';
import { ROAD_HALF } from '../core/constants';
import { addLampLights } from '../core/lampLight';

export interface RailService {
  trains(): number;
  sim: RailSim;
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const plan = ctx.plan;
  const rng = ctx.rng('rail');
  const prof = makeProfile(plan);
  const station = plan.rail.stations[0];
  const root = new THREE.Group();
  root.name = 'rail';

  // ── static geometry
  const gFlat = new Geo();
  const gTall = new Geo();
  const track = buildTrack(gFlat, gTall, gFlat, plan, prof, rng.fork('track'));
  const st = buildStation(gTall, station);
  const gear = ctx.roads.crossings.map((lc) => buildCrossingGear(gTall, lc.id, lc.x, lc.z));
  const { material, depth, uniforms: su } = createRailStaticMaterial(ctx.uniforms);
  const flatGeo = gFlat.build();
  const tallGeo = gTall.build();
  // the low track bed (incl. the level-crossing decks) uses a polygon offset so the decks win
  // over the road markings painted on the same asphalt (roads markings: factor −2)
  const bedMat = createRailStaticMaterial(ctx.uniforms, su, true).material;
  const flatMesh = new THREE.Mesh(flatGeo, bedMat);
  flatMesh.name = 'rail-bed';
  flatMesh.receiveShadow = true;
  flatMesh.castShadow = false;
  const tallMesh = new THREE.Mesh(tallGeo, material);
  tallMesh.name = 'rail-furniture';
  tallMesh.receiveShadow = true;
  tallMesh.castShadow = true;
  tallMesh.customDepthMaterial = depth;
  for (const m of [flatMesh, tallMesh]) {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
  }
  root.add(flatMesh, tallMesh);

  // overhead wires
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(track.wires, 3));
  wireGeo.computeBoundingSphere();
  const wireMat = new THREE.LineBasicMaterial({ color: '#3a3531', transparent: true, opacity: 0.8, fog: true });
  const wires = new THREE.LineSegments(wireGeo, wireMat);
  wires.name = 'rail-wires';
  wires.matrixAutoUpdate = false;
  root.add(wires);

  // sign faces + departure board
  const signs = createSigns(ctx.uniforms, st.signs, station.name);
  root.add(signs.mesh);
  const signCentre = { x: (station.x0 + station.x1) / 2, z: (station.platform.z0 + station.platform.z1) / 2 };

  // ── glows: platform lamps, canopy pools, crossing lamps, boom lamps, signals, trains
  const nStatic = st.lamps.length * 2 + st.strips.length + gear.reduce((n, g) => n + g.lamps.length + g.boomLamps.length, 0) + track.signals.length * 2;
  const glows = new Glows(ctx, nStatic + TrainRenderer.glowSlots(), 'rail-glows', { uXing: su.uXing, uSig: su.uSig });
  let gi = 0;
  // platform lamps + canopy strips light the platform through the shared lamp light map (night
  // agent); the old flat additive pools only come back with ?legacylamps
  const legacyLamps = ctx.debug.params.has('legacylamps');
  for (const l of st.lamps) {
    glows.setup(gi, '#ffd08c', 0.95, 1.0);
    glows.move(gi++, l.x, l.y, l.z);
    glows.setup(gi, '#ffbe72', 3.2, legacyLamps ? 0.28 : 0, true);
    glows.move(gi++, l.x, station.platformY + 0.03, l.z + 0.3);
  }
  // canopy strip lights → soft pools on the platform
  for (const sl of st.strips) {
    glows.setup(gi, '#fff0d2', 3.4, legacyLamps ? 0.26 : 0, true);
    glows.move(gi++, sl.x, station.platformY + 0.03, sl.z);
  }
  addLampLights(st.lamps.map((l) => ({ x: l.x, y: l.y, z: l.z, pole: l.y - station.platformY, radius: 3.8, color: '#ffc979', intensity: 1.15, kind: 'path' as const })));
  addLampLights(st.strips.map((sl) => ({ x: sl.x, y: sl.y, z: sl.z, pole: Math.max(1, sl.y - station.platformY), radius: 3.6, color: '#fff0d2', intensity: 0.8, kind: 'plaza' as const })));
  for (const g of gear) {
    for (const l of g.lamps) {
      glows.setup(gi, '#ff3018', 0.42, 1.6, false, 0.6, 1 + l.id * 2 + l.phase);
      glows.move(gi++, l.x, l.y, l.z);
    }
  }
  const boomBase = gi;
  const boomLamps = gear.flatMap((g) => g.boomLamps);
  for (const b of boomLamps) {
    glows.setup(gi, '#ff3018', 0.22, 1.1, false, 0.5, 5 + b.id);
    glows.move(gi++, b.x, b.y, b.z);
  }
  for (const s of track.signals) {
    // lamp centres (see track.ts: head at local z ≈ 0.2 toward the train)
    const face = -s.dir;
    const lx = s.x + face * 0.24;
    const z = plan.rail.z - 2.35;
    glows.setup(gi, '#ff2a14', 0.3, 1.2, false, 0.45, 7 + s.id * 2);
    glows.move(gi++, lx, 3.12, z);
    glows.setup(gi, '#36ff8a', 0.3, 1.2, false, 0.45, 8 + s.id * 2);
    glows.move(gi++, lx, 3.6, z);
  }
  const trainGlowBase = gi;
  root.add(glows.mesh);

  // ── simulation + trains
  const clipX0 = plan.rail.x0 + 0.7,
    clipX1 = plan.rail.x1 - 0.5;
  const sim = new RailSim(ctx, rng.fork('ops'), { stationX: (station.x0 + station.x1) / 2, clipX0, clipX1, signals: track.signals, platformX0: station.x0, platformX1: station.x1 }, prof.top);
  const trains = new TrainRenderer(ctx, sim, glows, trainGlowBase, clipX0, clipX1);
  root.add(trains.group);
  ctx.scene.add(root);

  const emit = (name: string, payload: unknown) => ctx.events.emit(name, payload);
  const service: RailService = { trains: () => sim.trains.length, sim };
  ctx.services.rail = service;

  // ── picker
  const pickOut = { train: null as Train | null, car: 0, distance: Infinity };
  ctx.pickers.push({
    name: 'rail',
    pick(ray: THREE.Ray): PickHit | null {
      trains.pick(ray, pickOut);
      const tr = pickOut.train;
      if (!tr) return null;
      const carIdx = Math.min(pickOut.car, tr.cars.length - 1);
      return {
        kind: 'train',
        id: tr.id,
        distance: pickOut.distance,
        label: sim.label(tr),
        getPosition(out: THREE.Vector3): boolean {
          if (!sim.trains.includes(tr)) return false;
          const c = tr.cars[carIdx];
          out.set(c.x, c.y + 2.2, plan.rail.z);
          return true;
        },
        getHeading: () => (tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
        info: () => sim.describe(tr),
      };
    },
  });

  // ── board text
  const fmt = (simT: number): string => {
    let h = ctx.clock.hours + (simT - sim.now) * ctx.clock.rate;
    h = ((h % 24) + 24) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  let boardT = 0;
  const refreshBoard = () => {
    const rows = sim.boardRows().map((r) => ({ time: fmt(r.time), dest: r.dest, info: r.info, hot: r.hot }));
    const h = ctx.clock.hours;
    const clock = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    signs.setBoard(rows, clock);
  };
  refreshBoard();
  const unsub = ctx.events.on('timejump', () => refreshBoard());

  const buildMs = performance.now() - t0;
  // per-frame JS cost (EMA, ms) for stats()
  let cpuMs = 0;

  return {
    name: 'rail',
    update(dt) {
      const a = performance.now();
      sim.update(dt, emit);
      cpuMs += (performance.now() - a) * 0.05;
    },
    frame(realDt) {
      const a = performance.now();
      // uniforms: crossings, signals, clock
      const c0 = sim.crossings[0],
        c1 = sim.crossings[1];
      su.uXing.value.set(c0?.flash ? 1 : 0, c1?.flash ? 1 : 0, c0?.lc.gate ?? 0, c1?.lc.gate ?? 0);
      su.uSig.value.set(sim.sigAspect[0], sim.sigAspect[1], sim.sigAspect[2], sim.sigAspect[3]);
      const h = ctx.clock.hours;
      su.uClock.value.set(((h % 12) / 12) * Math.PI * 2, (h % 1) * Math.PI * 2);
      // boom lamp halos follow the booms
      for (let k = 0; k < boomLamps.length; k++) {
        const b = boomLamps[k];
        const gate = sim.crossings[b.id]?.lc.gate ?? 0;
        const th = b.sign * (1 - gate) * 1.5359;
        const dx = b.x - b.pivotX,
          dy = b.y - b.pivotY;
        const cs = Math.cos(th),
          sn = Math.sin(th);
        glows.move(boomBase + k, b.pivotX + dx * cs - dy * sn, b.pivotY + dx * sn + dy * cs, b.z);
      }
      trains.update();
      glows.commit();
      // sign faces are unreadable (sub-pixel text) from far away: skip their draw call
      const cam = ctx.camera.position;
      signs.mesh.visible = Math.hypot(cam.x - signCentre.x, cam.y, cam.z - signCentre.z) < 260;
      // the glow batch only matters at night or while a crossing flashes
      glows.mesh.visible = ctx.uniforms.uLights.value > 0.01 || !!c0?.flash || !!c1?.flash;
      boardT -= realDt;
      if (boardT <= 0) {
        boardT = 0.5;
        refreshBoard();
      }
      cpuMs = cpuMs * 0.95 + (performance.now() - a) * 0.05;
    },
    stats() {
      const tr = sim.trains[0];
      return {
        trains: sim.trains.length,
        cpuMs: Math.round(cpuMs * 1000) / 1000,
        carsDrawn: trains.drawn,
        train: tr ? `${tr.number} ${tr.kind} ${tr.phase} x=${sim.headX(tr).toFixed(1)} v=${tr.v.toFixed(1)}` : '-',
        nextIn: sim.queue[0] ? Math.max(0, sim.queue[0].spawnAt - sim.now).toFixed(0) + ' s' : '-',
        spawned: sim.stats.spawned,
        arrivals: sim.stats.arrivals,
        departures: sim.stats.departures,
        freight: sim.stats.freight,
        holds: sim.stats.holds,
        closures: sim.stats.closures,
        crossings: sim.crossings.map((c) => `${c.state}${c.lc.occupied ? '*' + c.lc.occupied : ''}`).join(','),
        staticTris: (flatGeo.index!.count + tallGeo.index!.count) / 3,
        trainTris: trains.triangles,
        wires: track.wires.length / 6,
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      const out: string[] = [];
      for (const tr of sim.trains) {
        const xa = Math.min(sim.headX(tr), sim.tailX(tr)),
          xb = Math.max(sim.headX(tr), sim.tailX(tr));
        for (const c of sim.crossings) {
          if (xb < c.x - ROAD_HALF || xa > c.x + ROAD_HALF) continue;
          if (c.lc.occupied > 0) out.push(`train ${tr.number} inside occupied crossing ${c.lc.id} (${c.lc.occupied} vehicles)`);
          if (!c.lc.closed) out.push(`train ${tr.number} on open crossing ${c.lc.id}`);
          else if (c.lc.gate < 0.9) out.push(`train ${tr.number} on crossing ${c.lc.id} before the booms were down (gate ${c.lc.gate.toFixed(2)})`);
        }
        if (tr.phase === 'dwell' && Math.abs(tr.head - tr.stopU) > 0.6) out.push(`train ${tr.number} stopped ${(tr.head - tr.stopU).toFixed(2)} m off its platform mark`);
        if (tr.v > tr.vLine + 0.6) out.push(`train ${tr.number} overspeed ${tr.v.toFixed(1)} m/s`);
        if (!Number.isFinite(tr.head) || !Number.isFinite(tr.v)) out.push(`train ${tr.number} has a non-finite state`);
      }
      if (sim.trains.length > 1) out.push(`${sim.trains.length} trains on the single track at once`);
      for (const c of sim.crossings) {
        if (c.state === 'down' && !c.lc.closed) out.push(`crossing ${c.lc.id} booms down but not closed`);
        if (c.lc.gate < 0 || c.lc.gate > 1) out.push(`crossing ${c.lc.id} gate out of range`);
      }
      return out;
    },
    dispose() {
      unsub();
    },
  };
}
