// Module "harbor": harbour, beach and waterfront structures.
//
//  * quay: crane rails, bollards, fenders, container stacks (quay strip, north-strip yard,
//    industrial freight area), three animated ship-to-shore gantry cranes that work the
//    moored cargo ship (travel, trolley, hoist, sway; warning beacons & aviation lights)
//  * cargo ship: lofted hull, superstructure, deck containers, lights, mooring lines, funnel smoke
//  * breakwater (rock armour + tetrapods, walkway) and lighthouse with a rotating beam
//  * amusement pier (deck at y 0.3 on piles, railings, lamps), ferris wheel, carousel
//  * beach furniture, lifeguard towers, ferry dock, rowing-club jetty, river footbridges
//
// Draw calls: 4 static merged meshes (north / beach+pier / river / yards), ONE rigged mesh for
// everything that moves (vertex-shader rig), one additive glow mesh, one lighthouse beam.
//
// Service: ctx.services.harbor (see HarborService) — moving crane/ship state, berths, obstacles.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import type { Feature } from '../core/plan';
import { rect, type P2, type Rect } from '../core/geom';
import { QUAY_X, RIVER, WATER_LEVEL } from '../core/constants';
import { HB, RIG } from './harbor/geo';
import { createBeamMesh, createHarborMaterials, createGlowMesh, followCraneLamps, NMOB, type GlowPoint } from './harbor/material';
import { buildBreakwater } from './harbor/breakwater';
import { buildCarouselRotating, buildCarouselStatic, buildPier, buildWheelRotating, buildWheelStatic, type WheelSpec } from './harbor/pier';
import { buildFerryDock, lifeguardTower, scatterBeach } from './harbor/beach';
import { bridgeProfile, buildFootbridge, buildJetty, type BridgeInfo } from './harbor/river';
import { buildCrane, buildCraneRails, CraneSim, type MobileBox } from './harbor/cranes';
import { buildMooring, buildQuayEdge, buildShip, mobileShipPos, SHIP, type MobileSlot } from './harbor/ship';
import { addContainer, CH, CW, fillYard, L20, pickLook, yardRows } from './harbor/containers';
import { buildHarborFloodlights } from './lamps/harborLights';
import { addLampLights } from '../core/lampLight';

export interface HarborService {
  /** current crane states (world): gantry z, trolley x, spreader bottom y, busy phase */
  cranes(): { x: number; z: number; trolleyX: number; spreaderY: number; phase: string }[];
  /** moored ship pose */
  ship: { x: number; z: number; yaw: number; length: number; beam: number; heave(): number } | null;
  /** where the ferry should berth (alongside the pontoon's seaward face) */
  ferryBerth: { x: number; z: number; yaw: number } | null;
  /** water-side obstacle rectangles boats must avoid (world xz) */
  obstacles: Rect[];
  /** clearance (soffit height above WATER_LEVEL) of the footbridges at a river point, Infinity elsewhere */
  bridgeClearance(x: number, z: number): number;
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const plan = ctx.plan;
  const mats = createHarborMaterials(ctx.uniforms, ctx.debug.params.get('harborStandard') !== '1');
  const rig = mats.rig;
  const glows: GlowPoint[] = [];
  const north = new HB();
  const yards = new HB();
  const beach = new HB();
  const river = new HB();
  const anim = new HB(true); // ship, cranes, mobile boxes, mooring lines
  const rides = new HB(true); // ferris wheel + carousel
  const feats = (k: Feature['kind']) => plan.features.filter((f) => f.kind === k);
  const obstacles: Rect[] = [];
  const terrain = ctx.services.terrain as { height?(x: number, z: number): number } | undefined;
  const ground = (x: number, z: number): number => (terrain?.height ? terrain.height(x, z) : plan.heightAt(x, z));
  const problems: string[] = [];

  // ───────────────────────────────────────────── cargo ship
  const shipF = feats('cargoship')[0];
  const craneF = feats('gantrycrane').sort((a, b) => a.z - b.z);
  // mobile boxes: two 20ft slots per crane (bow → stern pairs 0/1, 3/4, 6/7)
  const slotPairs: [number, number][] = [
    [0, 1],
    [3, 4],
    [6, 7],
  ];
  const rowsFor = [1, 2, 3, 1, 2, 0];
  const mobSlots: MobileSlot[] = [];
  slotPairs.slice(0, craneF.length).forEach(([a, b], i) => {
    mobSlots.push({ slot: a, row: rowsFor[i * 2] }, { slot: b, row: rowsFor[i * 2 + 1] });
  });
  const ship = shipF ? buildShip(anim, shipF.x, shipF.z, shipF.yaw, ctx.rng('harbor-ship'), mobSlots, glows) : null;

  // ───────────────────────────────────────────── quay, cranes, containers
  const quayStack = feats('containerstack').find((f) => f.rect && f.rect.x0 > 110 && f.rect.z1 > -60);
  const mobs: MobileBox[] = [];
  const sims: CraneSim[] = [];
  if (ship && craneF.length && quayStack?.rect) {
    const rows = yardRows(quayStack.rect, 'z');
    const quayX = rows[rows.length - 1];
    mobSlots.forEach((ms, i) => {
      const sp = mobileShipPos(ship, ms.slot, ms.row);
      mobs.push({ id: i, state: i % 2 === 0 ? 'ship' : 'quay', ship: sp, quay: new THREE.Vector3(quayX, 0.03, sp.z) });
    });
    const rail = craneF[0];
    buildCraneRails(north, rail.x, Math.min(rail.a?.z ?? -122, rail.b?.z ?? -24), Math.max(rail.a?.z ?? -122, rail.b?.z ?? -24));
    craneF.forEach((f, i) => {
      const m0 = mobs[i * 2],
        m1 = mobs[i * 2 + 1];
      if (!m0 || !m1) return;
      const geom = buildCrane(anim, i, f.x, m0.ship.z, glows);
      sims.push(new CraneSim(i, geom, [m0.ship.z, m1.ship.z], [m0, m1], 2 + i * 6.5));
    });
    // the mobile boxes themselves (rig MOBILE, built at the origin)
    const mrng = ctx.rng('harbor-mobiles');
    for (const m of mobs) {
      anim.rig(RIG.MOBILE, m.id);
      addContainer(anim, 0, 0, 0, L20, pickLook(mrng), 0, true);
    }
    anim.rig(RIG.STATIC);
  }
  // quay yard strip (keep the crane drop spots free)
  const reserved = mobs.map((m) => rect(m.quay.x - CW / 2, m.quay.z - L20 / 2, m.quay.x + CW / 2, m.quay.z + L20 / 2));
  let containerCount = 0;
  for (const f of feats('containerstack')) {
    if (!f.rect) continue;
    const r = f.rect;
    const maxH = Number(f.params?.maxHeight ?? 3);
    const wide = r.x1 - r.x0 > r.z1 - r.z0;
    const target = f === quayStack ? north : yards;
    containerCount += fillYard(target, r, ctx.rng(`harbor-yard-${f.id}`), {
      axis: wide ? 'x' : 'z',
      maxHeight: maxH,
      reserved: f === quayStack ? reserved : [],
      rowsPerBlock: wide ? 3 : 2,
      blockLen: wide ? 2 : 3,
    });
  }
  // quay edge furniture + mooring lines
  const QX = 136;
  const ladderZ = [-131, -97, -58, -31, -2];
  const shipZ: [number, number] = shipF ? [shipF.z - SHIP.half, shipF.z + SHIP.half] : [0, 0];
  const edge = buildQuayEdge(north, QX, -140, -6, ladderZ, shipZ);
  if (ship && shipF) {
    const near = (z: number) => edge.bollards.reduce((best, b) => (Math.abs(b - z) < Math.abs(best - z) ? b : best), edge.bollards[0]);
    // fairleads (local) bow → stern; bollards spread fore and aft of the ship
    const fair: [number, number, number][] = [
      [5.2, SHIP.fcY + 0.6, 33.5],
      [6.1, SHIP.deckY + 0.9, 26.5],
      [6.2, SHIP.deckY + 0.9, -20.5],
      [5.3, SHIP.deckY + 1.4, -35.5],
    ];
    const wz = fair.map(([lx, ly, lz]) => ship.toWorld(lx, ly, lz).z);
    const dir = Math.sign(wz[3] - wz[0]) || 1;
    const bol = [near(wz[0] - dir * 12), near(wz[1] + dir * 10), near(wz[2] - dir * 10), near(wz[3] + dir * 12)].map((z) => ({ z }));
    buildMooring(anim, ship, QX - 0.2, bol, fair);
    obstacles.push(rect(QX, shipF.z - SHIP.half - 1, QX + 16, shipF.z + SHIP.half + 1));
  }

  // night work lighting (night agent): floodlight masts on the quay apron + in the container yard
  const flood = buildHarborFloodlights(north, ground, ctx.occupancy, glows);
  problems.push(...flood.skipped);

  // ───────────────────────────────────────────── breakwater + lighthouse
  const bwF = feats('breakwater')[0];
  const lhF = feats('lighthouse')[0];
  let lantern: THREE.Vector3 | null = null;
  if (bwF?.a && bwF.b) {
    const info = buildBreakwater(north, bwF.a, bwF.b, ground, ctx.rng('harbor-breakwater'), lhF ? { x: lhF.x, z: lhF.z, height: Number(lhF.params?.height ?? 24) } : null, glows);
    if (lhF) lantern = info.lantern;
    obstacles.push(rect(info.rootX, bwF.a.z - 8.5, bwF.b.x, bwF.a.z + 7.5));
    if (lhF) obstacles.push(rect(lhF.x - 9, lhF.z - 9, lhF.x + 9, lhF.z + 9));
  }

  // ───────────────────────────────────────────── ferry dock
  let ferryBerth: HarborService['ferryBerth'] = null;
  const fdF = feats('ferrydock')[0];
  if (fdF?.rect) {
    const fd = buildFerryDock(north, fdF.rect, QUAY_X, glows);
    ferryBerth = fd.berth;
    obstacles.push(fd.rect);
  }

  // ───────────────────────────────────────────── amusement pier, ferris wheel, carousel
  const pierF = feats('pier')[0];
  const deckY = Number(pierF?.params?.deckY ?? 0.3);
  let wheel: WheelSpec | null = null;
  let carousel: { x: number; z: number } | null = null;
  let gondolas = 0,
    horses = 0;
  if (pierF?.a && pierF.b) {
    const width = Number(pierF.params?.width ?? 13);
    const pz = pierF.a.z;
    const x0 = Math.min(pierF.a.x, pierF.b.x),
      x1 = Math.max(pierF.a.x, pierF.b.x);
    const benchX = plan.benches.filter((bb) => Math.abs(bb.z - pz) < width / 2 + 0.5 && bb.x > x0).map((bb) => bb.x);
    buildPier(beach, { xa: x0, xb: x1, z: pz, width, deckY, benchX }, ground, ctx.rng('harbor-pier'), glows);
    obstacles.push(rect(x0, pz - width / 2 - 0.2, x1 + 0.3, pz + width / 2 + 0.2));
    const wf = feats('ferriswheel')[0];
    if (wf?.rect) {
      wheel = { x: wf.x, z: wf.z, radius: Number(wf.params?.radius ?? 15), hubY: deckY + Number(wf.params?.hub ?? 17.5), rect: wf.rect, deckY };
      buildWheelStatic(beach, wheel, glows);
      gondolas = buildWheelRotating(rides, wheel);
    }
    const cf = feats('carousel')[0];
    if (cf) {
      const r = Number(cf.params?.radius ?? 3.8);
      carousel = { x: cf.x, z: cf.z };
      buildCarouselStatic(beach, cf.x, cf.z, r, deckY);
      horses = buildCarouselRotating(rides, cf.x, cf.z, r, deckY, ctx.rng('harbor-carousel'));
      // night agent: the carousel's marquee bulbs light the deck around it (lamp light map)
      addLampLights([{ x: cf.x, y: deckY + 3.3, z: cf.z, pole: 3.3, radius: r + 2.2, color: '#ffd08a', intensity: 0.6, kind: 'plaza' }]);
    }
  }

  // ───────────────────────────────────────────── beach
  for (const f of feats('lifeguard')) lifeguardTower(beach, f.x, f.z, f.yaw, ground);
  const beachPaths = plan.paths.filter((p) => p.kind === 'beach' || p.kind === 'boardwalk' || p.kind === 'pier');
  const spots: P2[] = plan.paths.filter((p) => p.kind === 'beach').map((p) => p.pts[p.pts.length - 1]);
  const blocks = feats('lifeguard').flatMap((f) => [
    { x: f.x, z: f.z, r: 1.9 },
    { x: f.x - Math.sin(f.yaw) * 3.0, z: f.z - Math.cos(f.yaw) * 3.0, r: 1.4 },
  ]);
  const pierW = Number(pierF?.params?.width ?? 13);
  const pierZ: [number, number][] = pierF?.a ? [[pierF.a.z - pierW / 2 - 1.2, pierF.a.z + pierW / 2 + 1.2]] : [];
  const beachStats = scatterBeach(
    beach,
    {
      rects: feats('umbrellas')
        .filter((f) => f.rect)
        .map((f) => ({ r: f.rect!, count: Number(f.params?.count ?? 12) })),
      paths: beachPaths.map((p) => ({ pts: p.pts, half: p.width / 2 })),
      spots,
      blocks,
      noZ: pierZ,
    },
    ground,
    ctx.rng('harbor-beach'),
    {
      balls: 5,
      castles: 2,
      kayaks: [
        { x0: 137.5, x1: 139.5, z0: 0, z1: 9, n: 2 },
        { x0: 137.5, x1: 139.5, z0: 99, z1: 106, n: 2 },
      ],
    },
  );

  // ───────────────────────────────────────────── river: footbridges + jetty
  const bridges: { x: number; info: BridgeInfo; profileFromGraph: boolean; profile: (z: number) => number; zN: number; zS: number }[] = [];
  for (const f of feats('footbridge')) {
    if (!f.a || !f.b) continue;
    const zN = Math.min(f.a.z, f.b.z),
      zS = Math.max(f.a.z, f.b.z);
    const width = Number(f.params?.width ?? 3.6);
    const fromGraph = bridgeProfile(ctx.peds, f.x, zN, zS);
    const wallN = RIVER.z0,
      wallS = RIVER.z1;
    const fallback = (z: number): number => {
      const a = wallN - 0.5,
        c = wallS + 0.5;
      if (z <= a) return 0.15 + (0.45 * (z - zN)) / (a - zN);
      if (z >= c) return 0.6 + ((0.03 - 0.6) * (z - c)) / (zS - c);
      return 0.6 + 1.3 * Math.sin((Math.PI * (z - a)) / (c - a));
    };
    const profile = fromGraph ?? fallback;
    if (!fromGraph) problems.push(`footbridge x=${f.x}: no bridge edges in the pedestrian graph (fallback profile)`);
    const info = buildFootbridge(river, { x: f.x, zN, zS, wallN, wallS, width, gapHalf: width / 2 + 0.45, profile }, ground, glows);
    bridges.push({ x: f.x, info, profileFromGraph: !!fromGraph, profile, zN, zS });
  }
  let jettyBoats = 0;
  for (const f of feats('jetty')) {
    if (!f.a || !f.b) continue;
    const j = buildJetty(river, f.x, f.a.z, f.b.z, ctx.rng('harbor-jetty'), glows);
    jettyBoats += j.boats;
    obstacles.push(j.rect);
  }

  // ───────────────────────────────────────────── meshes
  const meshes: THREE.Mesh[] = [];
  let tris = 0;
  const addStatic = (b: HB, name: string, cast = true) => {
    if (b.count === 0) return null;
    tris += b.triangles;
    const m = new THREE.Mesh(b.build(), mats.solid);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    ctx.scene.add(m);
    meshes.push(m);
    return m;
  };
  addStatic(north, 'harbor-north');
  addStatic(yards, 'harbor-yards');
  addStatic(beach, 'harbor-beach');
  addStatic(river, 'harbor-river');
  const animMeshes: THREE.Mesh[] = [];
  const addRigged = (b: HB, name: string) => {
    if (b.count === 0) return;
    tris += b.triangles;
    const m = new THREE.Mesh(b.build(), mats.rigged);
    m.name = name;
    m.customDepthMaterial = mats.riggedDepth;
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    // rigged vertices move: enlarge the bounds so culling never clips them
    if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius += 12;
    ctx.scene.add(m);
    animMeshes.push(m);
  };
  addRigged(anim, 'harbor-animated');
  addRigged(rides, 'harbor-rides');
  const glowMesh = createGlowMesh(ctx.uniforms, rig, glows);
  ctx.scene.add(glowMesh);
  // perf diagnostics: ?harborHide=north,yards,beach,river,animated,glows  ?harborNoShadow=1
  {
    const hide = (ctx.debug.params.get('harborHide') ?? '').split(',').filter(Boolean);
    for (const m of [...meshes, ...animMeshes, glowMesh]) if (hide.some((h) => m.name === `harbor-${h}`)) m.visible = false;
    if (ctx.debug.params.get('harborNoShadow')) for (const m of [...meshes, ...animMeshes]) m.castShadow = false;
  }
  // lighthouse beam
  const beam = lantern ? createBeamMesh(80, 0.4, 7.0, 0.035) : null;
  if (beam && lantern) {
    beam.mesh.position.copy(lantern);
    ctx.scene.add(beam.mesh);
  }

  // ───────────────────────────────────────────── animation state
  const water = ctx.services.water as { waveHeight(x: number, z: number, t: number): number } | undefined;
  const pivot = ship ? ship.center.clone() : new THREE.Vector3();
  let heave = 0,
    roll = 0,
    pitch = 0;
  const shipM = rig.uShip.value;
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _t = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const halfL = SHIP.half,
    halfB = SHIP.beam / 2;
  const shipYaw = shipF?.yaw ?? 0;
  const fwd = new THREE.Vector2(Math.sin(shipYaw), Math.cos(shipYaw));
  const pose = {
    dy(x: number, z: number): number {
      // vertical displacement of the rest point (x, z) under the current ship matrix
      _p.set(x, 0, z).applyMatrix4(shipM);
      return _p.y;
    },
  };
  const updateShip = (dt: number) => {
    if (!ship) return;
    const t = ctx.uniforms.uTime.value;
    let hb = 0,
      hs = 0,
      hp = 0,
      hs2 = 0;
    if (water) {
      const cx = pivot.x,
        cz = pivot.z;
      hb = water.waveHeight(cx + fwd.x * halfL * 0.8, cz + fwd.y * halfL * 0.8, t);
      hs = water.waveHeight(cx - fwd.x * halfL * 0.8, cz - fwd.y * halfL * 0.8, t);
      hp = water.waveHeight(cx + fwd.y * halfB, cz - fwd.x * halfB, t);
      hs2 = water.waveHeight(cx - fwd.y * halfB, cz + fwd.x * halfB, t);
    }
    const tgtHeave = ((hb + hs + hp + hs2) / 4) * 0.55 + 0.035 * Math.sin(t * 0.37);
    const tgtPitch = Math.atan2(hb - hs, halfL * 1.6) * 0.35;
    const tgtRoll = Math.atan2(hp - hs2, halfB * 2) * 0.3 + 0.004 * Math.sin(t * 0.29 + 1.3);
    const k = 1 - Math.exp(-dt * 0.9);
    heave += (tgtHeave - heave) * k;
    pitch += (tgtPitch - pitch) * k;
    roll += (tgtRoll - roll) * k;
    // rotation about the waterline pivot: roll about the ship's long axis, pitch about the beam
    _e.set(pitch * fwd.y, 0, -pitch * fwd.x);
    _q.setFromEuler(_e);
    const qr = new THREE.Quaternion().setFromAxisAngle(_p.set(fwd.x, 0, fwd.y), roll);
    _q.multiply(qr);
    shipM.makeTranslation(pivot.x, pivot.y + heave, pivot.z);
    shipM.multiply(_t.makeRotationFromQuaternion(_q));
    shipM.multiply(_t.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  };
  const beacons = [0, 0, 0];
  const updateRig = (dt: number) => {
    sims.forEach((s, i) => {
      s.update(dt, pose);
      rig.uCrane.value[i].set(s.z - s.geom.z0, s.tx - s.geom.tx0, s.hy - s.geom.hy0, s.sway);
      const target = s.travelling ? 1 : 0;
      beacons[i] += (target - beacons[i]) * Math.min(1, dt * 3);
    });
    rig.uFx.value.set(beacons[0], beacons[1], beacons[2], rig.uFx.value.w);
    for (const m of mobs) {
      const M = rig.uMob.value[m.id];
      if (m.state === 'ship') M.copy(shipM).multiply(_t.makeTranslation(m.ship.x, m.ship.y, m.ship.z));
      else if (m.state === 'quay') M.makeTranslation(m.quay.x, m.quay.y, m.quay.z);
      else {
        const s = sims.find((q) => q.carrying === m.id);
        if (s) M.makeTranslation(s.tx + s.sway, s.hy - CH, s.z);
      }
    }
  };
  // ferris wheel, carousel, lighthouse
  let wheelAng = 0,
    carAng = 0,
    carSpeed = 0,
    carClock = 0,
    beamAng = 0;
  const updateRides = (dt: number) => {
    if (wheel) {
      wheelAng = (wheelAng + dt * ((Math.PI * 2) / 140)) % (Math.PI * 2);
      rig.uWheel.value.set(wheel.x, wheel.hubY, wheel.z, wheelAng);
    }
    if (carousel) {
      carClock = (carClock + dt) % 68;
      const target = carClock < 52 ? (Math.PI * 2) / 13 : 0;
      carSpeed += (target - carSpeed) * Math.min(1, dt * 0.45);
      carAng = (carAng + carSpeed * dt) % (Math.PI * 200);
      rig.uCar.value.set(carousel.x, 0, carousel.z, carAng);
    }
    beamAng = (beamAng + dt * ((Math.PI * 2) / 9)) % (Math.PI * 2);
  };
  updateShip(0);
  updateRig(0);
  updateRides(0);
  const _cam = new THREE.Vector3();

  // funnel smoke (ambient module, optional)
  type SmokeSvc = { addEmitter(o: { getPosition(out: THREE.Vector3): void | boolean; rate?: number; size?: number; color?: THREE.ColorRepresentation; life?: number; rise?: number }): { remove(): void } };
  const smoke = ctx.services.smoke as SmokeSvc | undefined;
  let smokeHandle: { remove(): void } | null = null;
  if (ship && smoke && typeof smoke.addEmitter === 'function') {
    const fp = ship.funnel.clone();
    try {
      smokeHandle = smoke.addEmitter({
        getPosition(out) {
          out.copy(fp).applyMatrix4(shipM);
        },
        // moored ship idling on its generators: a thin light wisp, not a plume (lead: the old
        // 1.6/s grey plume read as a smudge over the harbour in the hero overview)
        rate: 0.6,
        size: 0.55,
        color: '#c4c0ba',
        life: 6,
        rise: 1.9,
      });
    } catch (err) {
      if (ctx.debug.enabled) console.warn('[harbor] smoke emitter failed', err);
    }
  }

  const service: HarborService = {
    cranes: () => sims.map((s) => ({ x: s.geom.xc, z: s.z, trolleyX: s.tx, spreaderY: s.hy, phase: s.phase })),
    ship: shipF ? { x: shipF.x, z: shipF.z, yaw: shipF.yaw, length: SHIP.half * 2, beam: SHIP.beam, heave: () => heave } : null,
    ferryBerth,
    obstacles,
    bridgeClearance: (x: number, z: number) => {
      for (const br of bridges) {
        if (Math.abs(x - br.x) > 2.3) continue;
        const s = br.info.soffit(z);
        if (s !== Infinity) return s - WATER_LEVEL;
      }
      return Infinity;
    },
  };
  ctx.services.harbor = service;
  const buildMs = performance.now() - t0;

  return {
    name: 'harbor',
    update(dt) {
      if (dt <= 0) return;
      updateShip(dt);
      updateRig(dt);
      updateRides(dt);
    },
    frame() {
      const u = ctx.uniforms;
      // the glows are night lights (blinking aviation bulbs stay emissive by day)
      glowMesh.visible = u.uLights.value > 0.01 || u.uNight.value > 0.05;
      // crane work lights (lamp light map spots) travel with their gantries
      followCraneLamps(glowMesh, rig);
      if (!beam || !lantern) return;
      const lightsF = Math.min(1, Math.max(0, u.uLights.value * (0.45 + 0.55 * u.uNight.value)));
      beam.uniforms.uBeam.value = lightsF * 0.32;
      beam.mesh.visible = lightsF > 0.01;
      beam.mesh.rotation.y = beamAng;
      // flash when one of the two beams sweeps towards the camera
      _cam.copy(ctx.camera.position).sub(lantern);
      _cam.y = 0;
      _cam.normalize();
      const bx = Math.cos(beamAng),
        bz = -Math.sin(beamAng);
      const d = Math.abs(bx * _cam.x + bz * _cam.z);
      rig.uFx.value.w = Math.pow(d, 40);
    },
    stats() {
      return {
        triangles: tris,
        meshes: meshes.length + animMeshes.length + 2,
        glows: glows.length,
        floodMasts: flood.masts,
        containers: containerCount + (ship?.containers ?? 0) + mobs.length,
        craneJobs: sims.reduce((a, s) => a + s.jobs, 0),
        cranePhases: sims.map((s) => s.phase).join(','),
        umbrellas: beachStats.umbrellas,
        towels: beachStats.towels,
        beachProps: beachStats.extras,
        gondolas,
        horses,
        bridges: bridges.length,
        jettyBoats,
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      const out: string[] = [];
      // cranes never closer than their own width
      for (let i = 0; i < sims.length; i++)
        for (let j = i + 1; j < sims.length; j++) {
          const d = Math.abs(sims[i].z - sims[j].z);
          if (d < 12.6) out.push(`cranes ${i} and ${j} only ${d.toFixed(1)} m apart`);
        }
      // every mobile box is somewhere sensible
      for (const m of mobs) {
        if (m.state === 'crane' && !sims.some((s) => s.carrying === m.id)) out.push(`container ${m.id} lost (crane state without a crane)`);
      }
      if (NMOB < mobs.length) out.push(`too many mobile containers (${mobs.length} > ${NMOB})`);
      out.push(...problems);
      // footbridge decks follow the pedestrian surface exactly; boats fit underneath
      for (const br of bridges) {
        for (const e of ctx.peds.edges) {
          if (e.kind !== 'bridge') continue;
          const A = ctx.peds.nodes[e.a],
            B = ctx.peds.nodes[e.b];
          if (Math.abs(A.x - br.x) > 0.05) continue;
          for (let k = 0; k <= 8; k++) {
            const t = k / 8;
            const z = A.z + (B.z - A.z) * t;
            const d = Math.abs(br.profile(z) - ctx.peds.edgeY(e, t));
            if (d > 0.02) {
              out.push(`footbridge x=${br.x}: deck off the walking surface by ${d.toFixed(3)} m at z=${z.toFixed(2)}`);
              break;
            }
          }
        }
        if (br.info.clearanceMid < 2.2) out.push(`footbridge x=${br.x}: clearance ${br.info.clearanceMid.toFixed(2)} m < 2.2 m`);
      }
      // the pier deck is where the pier walk is
      const pw = plan.paths.find((p) => p.kind === 'pier');
      if (pw && pierF && Math.abs(pw.y - deckY) > 0.005) out.push(`pier deck ${deckY} != pier walk y ${pw.y}`);
      const e = rig.uShip.value.elements;
      if (e.some((v) => !Number.isFinite(v))) out.push('ship matrix not finite');
      return out;
    },
    dispose() {
      smokeHandle?.remove();
    },
  };
}
