// Module "boats": life on the water.
//
//   * harbour ferry — loads ~12 s at the ferry-dock pontoon, then sails a loop round the bay
//   * tug — assists the moored cargo ship (pushes at the bow and the stern, prop wash)
//   * river tour boat — glass-roofed, cruises the river under the footbridges, pivots at the ends
//   * rowing club — two double sculls train on a loop near the jetty (wait for the tour boat)
//   * 4 sailing yachts tacking / reaching in the open sea (heel, sail trim, luffing)
//   * 2 motorboats (planing, big wakes)
// All boats bob/pitch/roll with ctx.services.water, avoid structures (navigation clearance
// field from the water depth + harbour obstacles) and each other; foam wakes, navigation
// lights at night, funnel smoke (ctx.services.smoke). Draw calls: 2 boat meshes (+shadows),
// 1 foam, 1 light-halo batch (night only).

import * as THREE from 'three';
import type { CityContext, CityModule, PickHit } from '../core/context';
import type { Rect } from '../core/geom';
import { QUAY_X, WATER_LEVEL } from '../core/constants';
import { NavField } from './boats/nav';
import { Fleet, FreePilot, RoutePilot, SmoothPath, ROW_HALF_SPAN, type Boat, type P2, type Step, type Zone } from './boats/fleet';
import { BoatRenderer } from './boats/render';
import { Wakes } from './boats/wakes';
import { DIMS } from './boats/models';
import { Glows } from './rail/glows';

interface WaterSvc {
  waveHeight(x: number, z: number, t: number): number;
  depth(x: number, z: number): number;
}
interface HarborSvc {
  obstacles?: Rect[];
  ferryBerth?: { x: number; z: number; yaw: number } | null;
  ship?: { x: number; z: number; length: number; beam: number } | null;
}
interface SmokeSvc {
  addEmitter(o: { getPosition(out: THREE.Vector3): void | boolean; rate?: number; size?: number; color?: THREE.ColorRepresentation; life?: number; rise?: number }): { remove(): void; set(o: Record<string, unknown>): void };
}

const RIVER_LANE = 118.25;

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const plan = ctx.plan;
  const rng = ctx.rng('boats');
  const water = ctx.services.water as WaterSvc | undefined;
  const harbor = ctx.services.harbor as HarborSvc | undefined;

  // ── obstacles (harbour structures; fallbacks from the plan when the harbour module is absent)
  const obstacles: Rect[] = [];
  if (harbor?.obstacles?.length) obstacles.push(...harbor.obstacles);
  else {
    for (const f of plan.features) {
      if (f.kind === 'cargoship') {
        const L = Number(f.params?.length ?? 74);
        obstacles.push({ x0: QUAY_X, z0: f.z - L / 2 - 1, x1: QUAY_X + 16, z1: f.z + L / 2 + 1 });
      } else if (f.kind === 'breakwater' && f.a && f.b) obstacles.push({ x0: Math.min(f.a.x, f.b.x) - 1, z0: f.a.z - 8.5, x1: Math.max(f.a.x, f.b.x), z1: f.a.z + 7.5 });
      else if (f.kind === 'lighthouse') obstacles.push({ x0: f.x - 9, z0: f.z - 9, x1: f.x + 9, z1: f.z + 9 });
      else if ((f.kind === 'ferrydock' || f.kind === 'jetty') && f.rect) obstacles.push({ ...f.rect });
      else if (f.kind === 'jetty' && f.a && f.b) obstacles.push({ x0: f.x - 3.3, z0: Math.min(f.a.z, f.b.z) - 0.2, x1: f.x + 3.3, z1: Math.max(f.a.z, f.b.z) });
      else if (f.kind === 'pier' && f.a && f.b) {
        const w = Number(f.params?.width ?? 13);
        obstacles.push({ x0: Math.min(f.a.x, f.b.x), z0: f.a.z - w / 2 - 0.2, x1: Math.max(f.a.x, f.b.x) + 0.3, z1: f.a.z + w / 2 + 0.2 });
      }
    }
  }
  // fireworks barge moored by the ambient module
  obstacles.push({ x0: 176.4, z0: -62.6, x1: 183.6, z1: -53.4 });
  const nav = new NavField(plan, water ?? null, obstacles, { minDepth: 0.9, edgeMargin: 3, obstaclePad: 0.6 });

  const fleet = new Fleet(nav);
  const problems: string[] = [];
  const wind = ctx.uniforms.uWind;

  // ── harbour ferry
  const berth = harbor?.ferryBerth ?? { x: 144.2, z: -14, yaw: Math.PI };
  const fB = DIMS.ferry.B;
  const bx = berth.x + fB / 2 + 0.14,
    bz = berth.z;
  // berth line (alongside the pontoon) and a stand-off line 3.5 m out: the ferry crabs sideways
  // between the two with its thrusters, so its stern never swings into the pontoon
  const ox = bx + 3.5;
  const crabOut = new SmoothPath(
    [
      { x: bx, z: bz },
      { x: (bx + ox) / 2, z: bz },
      { x: ox, z: bz },
    ],
    0.6,
    1,
  );
  const crabIn = new SmoothPath(
    [
      { x: ox, z: bz },
      { x: (bx + ox) / 2, z: bz },
      { x: bx, z: bz },
    ],
    0.6,
    1,
  );
  const ferryLoop = new SmoothPath(
    [
      { x: ox, z: bz },
      { x: ox + 0.1, z: bz - 5 },
      { x: ox + 2, z: bz - 9.8 },
      { x: ox + 6.5, z: bz - 12.8 },
      { x: ox + 13.5, z: bz - 14.2 },
      { x: ox + 23.5, z: bz - 13.5 },
      { x: ox + 32.5, z: bz - 8 },
      { x: ox + 38, z: bz + 2 },
      { x: ox + 40, z: bz + 16 },
      { x: ox + 39.5, z: bz + 32 },
      { x: ox + 36, z: bz + 45 },
      { x: ox + 28.5, z: bz + 54 },
      { x: ox + 19, z: bz + 56.5 },
      { x: ox + 12.5, z: bz + 52 },
      { x: ox + 10, z: bz + 42 },
      { x: ox + 10.5, z: bz + 31 },
      { x: ox + 9.5, z: bz + 22.5 },
      { x: ox + 6, z: bz + 16.5 },
      { x: ox + 2, z: bz + 12.5 },
      { x: ox + 0.2, z: bz + 8 },
      { x: ox, z: bz + 4 },
      { x: ox, z: bz },
    ],
    4.6,
    0.55,
  );
  const ferryPilot = new RoutePilot(
    [
      { kind: 'dwell', t: 12.5, status: 'Boarding at the ferry dock', wash: 0.15 },
      { kind: 'path', path: crabOut, vMax: 0.55, vEnd: 0, status: 'Casting off', yaw: berth.yaw, wash: 0.6 },
      { kind: 'path', path: ferryLoop, vMax: 4.6, vEnd: 0, status: 'Harbour cruise' },
      { kind: 'path', path: crabIn, vMax: 0.55, vEnd: 0, status: 'Berthing', yaw: berth.yaw, wash: 0.6 },
    ],
    {
      accel: 0.28,
      decel: 0.24,
      turnRate: 0.2,
      describe: (b, step, left) => {
        if (step.kind === 'dwell') return ['Boarding at the ferry dock', `Departs in ${Math.ceil(left)} s`];
        if (step.status !== 'Harbour cruise') return [step.status, 'Thrusters working'];
        const p = ferryPilot.s / ferryLoop.length;
        return [p > 0.85 ? 'Approaching the ferry dock' : p < 0.1 ? 'Leaving the ferry dock' : 'Harbour cruise round the bay', `${Math.round(b.v * 3.6)} km/h`];
      },
    },
  );
  const ferry = fleet.add('ferry', 'Tinyhaven Belle', ferryPilot, '#ffffff', '#ffffff', 6);
  ferryPilot.place(ferry, 0);
  ferry.x = bx;
  ferry.z = bz;
  ferry.yaw = berth.yaw;
  ferryPilot.t = rng.range(0, 9);

  // ── tug working the cargo ship (pushes at the bow and the stern sections)
  const shipX = (harbor?.ship?.x ?? 145) + (harbor?.ship?.beam ?? 13) / 2;
  const pushX = shipX + DIMS.tug.L / 2 + 0.55;
  const zA = -100,
    zB = -55;
  const tugSteps: Step[] = [
    {
      kind: 'path',
      path: new SmoothPath(
        [
          { x: pushX + 6, z: zB },
          { x: pushX + 8.5, z: zB - 6 },
          { x: pushX + 10, z: zB - 17 },
          { x: pushX + 9.5, z: zB - 31 },
          { x: pushX + 7, z: zA + 4 },
          { x: pushX + 3.5, z: zA + 0.4 },
          { x: pushX, z: zA },
        ],
        3.2,
        0.8,
      ),
      vMax: 3.2,
      vEnd: 0,
      status: 'Moving to the bow',
    },
    { kind: 'dwell', t: 14, status: 'Pushing the cargo ship', wash: 1 },
    {
      kind: 'path',
      path: new SmoothPath(
        [
          { x: pushX, z: zA },
          { x: pushX + 3, z: zA },
          { x: pushX + 6.5, z: zA },
        ],
        1.2,
        0.8,
      ),
      vMax: 1.1,
      vEnd: 0,
      reverse: true,
      status: 'Backing off',
      wash: 0.7,
    },
    {
      kind: 'path',
      path: new SmoothPath(
        [
          { x: pushX + 6.5, z: zA },
          { x: pushX + 9.5, z: zA + 5 },
          { x: pushX + 11.5, z: zA + 16 },
          { x: pushX + 11, z: zA + 30 },
          { x: pushX + 8.5, z: zB - 5 },
          { x: pushX + 4, z: zB - 0.4 },
          { x: pushX, z: zB },
        ],
        3.2,
        0.8,
      ),
      vMax: 3.2,
      vEnd: 0,
      status: 'Moving to the stern',
    },
    { kind: 'dwell', t: 12, status: 'Pushing the cargo ship', wash: 1 },
    {
      kind: 'path',
      path: new SmoothPath(
        [
          { x: pushX, z: zB },
          { x: pushX + 3, z: zB },
          { x: pushX + 6, z: zB },
        ],
        1.2,
        0.8,
      ),
      vMax: 1.1,
      vEnd: 0,
      reverse: true,
      status: 'Backing off',
      wash: 0.7,
    },
  ];
  const tugPilot = new RoutePilot(tugSteps, {
    accel: 0.45,
    decel: 0.4,
    turnRate: 0.42,
    describe: (b, step, left) => [step.status, step.kind === 'dwell' ? `${Math.ceil(left)} s more` : `${Math.round(b.v * 3.6)} km/h`],
  });
  const tug = fleet.add('tug', 'Haven Bull', tugPilot, '#ffffff', '#ffffff', 5);
  tugPilot.place(tug, 3, rng.range(0, 20));

  // ── river tour boat
  const xW = -178,
    xE = 110;
  const tourW = new SmoothPath(
    [
      { x: xE, z: RIVER_LANE },
      { x: (xE + xW) / 2, z: RIVER_LANE },
      { x: xW, z: RIVER_LANE },
    ],
    2.4,
    0.5,
  );
  const tourE = new SmoothPath(
    [
      { x: xW, z: RIVER_LANE },
      { x: (xE + xW) / 2, z: RIVER_LANE },
      { x: xE, z: RIVER_LANE },
    ],
    2.4,
    0.5,
  );
  const tourPilot = new RoutePilot(
    [
      { kind: 'path', path: tourW, vMax: 2.4, vEnd: 0, status: 'River cruise · heading upstream' },
      { kind: 'pivot', to: Math.PI / 2, t: 16, status: 'Turning round' },
      { kind: 'path', path: tourE, vMax: 2.4, vEnd: 0, status: 'River cruise · heading for the harbour' },
      { kind: 'pivot', to: -Math.PI / 2, t: 16, status: 'Turning round' },
    ],
    {
      accel: 0.2,
      decel: 0.18,
      turnRate: 0.3,
      describe: (b, step) => [step.status, step.kind === 'path' ? `${Math.round(b.v * 3.6)} km/h · 26 passengers` : 'Pivoting on the spot'],
    },
  );
  const tour = fleet.add('tour', 'River Lark', tourPilot, '#ffffff', '#ffffff', 5);
  tourPilot.place(tour, 0, rng.range(30, 200));

  // ── rowing club: two double sculls on a training loop west of the jetty
  const zN = 113.4,
    zS = 122.85;
  const cxW = 43,
    cxE = 77;
  const rr = (zS - zN) / 2,
    zc = (zN + zS) / 2;
  const loopPts: P2[] = [];
  for (let x = cxE; x > cxW; x -= 8.5) loopPts.push({ x, z: zN });
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 - (k / 6) * Math.PI;
    loopPts.push({ x: cxW + Math.cos(a) * rr, z: zc + Math.sin(a) * rr });
  }
  for (let x = cxW + 8.5; x < cxE; x += 8.5) loopPts.push({ x, z: zS });
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 - (k / 6) * Math.PI;
    loopPts.push({ x: cxE + Math.cos(a) * rr, z: zc + Math.sin(a) * rr });
  }
  const rowLoop = new SmoothPath(loopPts, 2.7, 1.2, true);
  const inTurn = (s: number): boolean => {
    const p = rowLoop.at(((s % rowLoop.length) + rowLoop.length) % rowLoop.length, { x: 0, z: 0 });
    return Math.abs(p.z - zN) > 0.35 && Math.abs(p.z - zS) > 0.35;
  };
  const rowSteps = (): Step[] => [{ kind: 'path', path: rowLoop, vMax: 2.6, vEnd: 2.6, status: 'Training on the river' }];
  const rowHold = (b: Boat, _step: Step, s: number): boolean => {
    // wait before crossing the tour boat's fairway (the semicircle turns)
    if (!inTurn(s) && inTurn(s + 9)) {
      const p = rowLoop.at((s + 9) % rowLoop.length, { x: 0, z: 0 });
      const cx = p.x < (cxW + cxE) / 2 ? cxW : cxE;
      if (Math.abs(tour.x - cx) < 26) return true;
    }
    // keep a gap to the other scull
    for (const o of fleet.boats) {
      if (o === b || o.type !== 'row') continue;
      const op = o.pilot as RoutePilot;
      const gap = (((op.s - s) % rowLoop.length) + rowLoop.length) % rowLoop.length;
      if (gap > 0 && gap < 22) return true;
    }
    return false;
  };
  const rowers: Boat[] = [];
  for (let k = 0; k < 2; k++) {
    const p = new RoutePilot(rowSteps(), {
      accel: 0.5,
      decel: 0.6,
      turnRate: 0.6,
      hold: rowHold,
      describe: (b) => [b.holding ? 'Easy oars — waiting for the tour boat' : 'Training on the river', `${Math.round(b.v * 3.6)} km/h · stroke rate 28`],
    });
    const b = fleet.add('row', k === 0 ? 'Kingfisher (rowing club)' : 'Heron (rowing club)', p, k === 0 ? '#f2efe6' : '#e9c84a', '#ffffff', 2);
    p.place(b, 0, k * rowLoop.length * 0.5 + 3);
    rowers.push(b);
  }

  // ── sailing yachts and motorboats (free pilots)
  const zones: Record<string, Zone> = {
    south: { x0: 160, x1: 192, z0: 78, z1: 142 },
    north: { x0: 146, x1: 192, z0: -182, z1: -156 },
    bay: { x0: 166, x1: 192, z0: -32, z1: 44 },
    basin: { x0: 156, x1: 192, z0: -128, z1: 40 },
  };
  const sails: [string, string, keyof typeof zones, string, number][] = [
    ['Puffin', '#f2f0ea', 'south', '#d33a2e', 0],
    ['Sea Breeze', '#23395b', 'south', '#f2c94c', 0.55],
    ['Avocet', '#b0322a', 'north', '#2a9d8f', 0],
    ['Halcyon', '#2e5e4e', 'bay', '#e9c46a', 0],
  ];
  for (const [name, hullC, zoneKey, accent, mix] of sails) {
    const p = new FreePilot(rng.fork(name), nav, zones[zoneKey], wind);
    const b = fleet.add('sail', name, p, hullC, accent, 3);
    b.sailMix = mix;
    placeFree(b, p, zones[zoneKey]);
  }
  const motors: [string, string, keyof typeof zones, string, number][] = [
    ['Zippy', '#e2a23a', 'south', '#c94d5b', 6.4],
    ['Harbour Launch', '#2f6fd0', 'basin', '#e9e4d8', 5.4],
  ];
  for (const [name, stripe, zoneKey, seats, vc] of motors) {
    const p = new FreePilot(rng.fork(name), nav, zones[zoneKey], wind, vc);
    const b = fleet.add('motor', name, p, stripe, seats, 1);
    placeFree(b, p, zones[zoneKey]);
  }

  function placeFree(b: Boat, p: FreePilot, z: Zone): void {
    for (let k = 0; k < 200; k++) {
      const x = rng.range(z.x0, z.x1),
        zz = rng.range(z.z0, z.z1);
      if (nav.clearance(x, zz) < b.dims.L * 0.5 + 3) continue;
      if (fleet.boats.some((o) => o !== b && Math.hypot(o.x - x, o.z - zz) < 25)) continue;
      b.x = x;
      b.z = zz;
      break;
    }
    b.yaw = rng.range(-Math.PI, Math.PI);
    b.v = b.type === 'motor' ? 3 : 1.5;
    p.pickTarget(b);
  }

  // ── validate the scripted routes against the strict open-water test
  const fwd = { x: 0, z: 0 };
  const checkPath = (label: string, path: SmoothPath, L: number, B: number, skipEnds = 0) => {
    let bad = 0;
    for (let s = skipEnds; s <= path.length - skipEnds; s += 2) {
      path.at(s, fwd);
      const h = path.heading(s);
      const sx = Math.sin(h),
        sz = Math.cos(h);
      for (const [a, l] of [
        [0.45, 0],
        [-0.45, 0],
        [0.3, 0.45],
        [0.3, -0.45],
        [-0.3, 0.45],
        [-0.3, -0.45],
      ]) {
        const x = fwd.x + sx * a * L + sz * l * B,
          z = fwd.z + sz * a * L - sx * l * B;
        if (!nav.isOpenWater(x, z)) {
          if (bad++ < 2) problems.push(`${label}: hull point (${x.toFixed(1)}, ${z.toFixed(1)}) off open water at s=${s.toFixed(0)}`);
        }
      }
    }
  };
  checkPath('ferry loop', ferryLoop, DIMS.ferry.L, DIMS.ferry.B);
  for (const st of tugSteps) if (st.kind === 'path') checkPath('tug route', st.path, DIMS.tug.L, DIMS.tug.B);
  checkPath('tour boat route', tourW, DIMS.tour.L, DIMS.tour.B);
  checkPath('rowing loop', rowLoop, DIMS.row.L, ROW_HALF_SPAN * 2);

  // ── rendering
  const nLights = fleet.boats.reduce((n, b) => n + DIMS[b.type].lights.length, 0);
  const glows = new Glows(ctx, nLights, 'boats-lights');
  const renderer = new BoatRenderer(ctx, glows, 0, nLights, 3, 8);
  const wakes = new Wakes(ctx, 1100);
  const root = new THREE.Group();
  root.name = 'boats';
  root.add(renderer.group, wakes.mesh, glows.mesh);
  ctx.scene.add(root);

  // funnel smoke
  const smoke = ctx.services.smoke as SmokeSvc | undefined;
  const handles: { remove(): void; set(o: Record<string, unknown>): void }[] = [];
  const v3 = new THREE.Vector3();
  if (smoke?.addEmitter) {
    for (const b of [ferry, tug]) {
      const f = DIMS[b.type].funnel;
      if (!f) continue;
      try {
        const h = smoke.addEmitter({
          getPosition: (out) => {
            const m = renderer.mats.get(b.id);
            if (!m) return false;
            out.set(f[0], f[1], f[2]).applyMatrix4(m);
          },
          rate: b.type === 'tug' ? 3.2 : 2.4,
          size: 0.7,
          color: '#8d8b88',
          life: 7,
          rise: 1.6,
        });
        handles.push(h);
      } catch {
        /* smoke is optional */
      }
    }
  }

  // ── poses on the swell + wakes
  const pose = new Map<number, { y: number; p: number; r: number; acc: number; washAcc: number }>();
  const TAU: Record<string, number> = { ferry: 0.9, tug: 0.7, tour: 0.6, sail: 0.4, motor: 0.25, row: 0.3 };
  const fx = rng.fork('fx');
  const ampAt = (x: number, z: number): number => {
    const region = x < 117 && z > 110 && z < 126 ? 0.3 : 1;
    const d = nav.depthAt(x, z);
    const t = Math.min(1, Math.max(0, (d - 0.08) / (1.8 - 0.08)));
    return region * t * t * (3 - 2 * t);
  };
  function updatePose(b: Boat, dt: number, t: number): void {
    let st = pose.get(b.id);
    if (!st) {
      st = { y: WATER_LEVEL, p: 0, r: 0, acc: 0, washAcc: 0 };
      pose.set(b.id, st);
    }
    const L = b.dims.L,
      B = b.dims.B;
    const sx = Math.sin(b.yaw),
      sz = Math.cos(b.yaw);
    const px = Math.cos(b.yaw),
      pz = -Math.sin(b.yaw);
    let hb = 0,
      hs = 0,
      hp = 0,
      hq = 0;
    if (water) {
      hb = water.waveHeight(b.x + sx * L * 0.4, b.z + sz * L * 0.4, t);
      hs = water.waveHeight(b.x - sx * L * 0.4, b.z - sz * L * 0.4, t);
      hp = water.waveHeight(b.x + px * B * 0.45, b.z + pz * B * 0.45, t);
      hq = water.waveHeight(b.x - px * B * 0.45, b.z - pz * B * 0.45, t);
    }
    const a = 1 - Math.exp(-dt / (TAU[b.type] ?? 0.5));
    const lift = b.type === 'motor' ? 0.08 * Math.min(1, b.v / 6) : 0;
    st.y += (WATER_LEVEL + (hb + hs + hp + hq) * 0.25 + lift - st.y) * a;
    st.p += (-Math.atan2(hb - hs, L * 0.8) * 1.4 - st.p) * a;
    st.r += (Math.atan2(hp - hq, B * 0.9) * (b.type === 'row' ? 0.4 : 1.2) - st.r) * a;
    b.y = st.y;
    b.pitch = st.p;
    b.roll = st.r;
    // scullers: ~30 strokes a minute while rowing; blades rest on the water while easy-oaring
    if (b.type === 'row' && b.v > 0.4 && !b.holding) b.rowPhase += dt * Math.PI * 2 * 0.5;
  }

  function spawnWakes(b: Boat, dt: number, now: number): void {
    const st = pose.get(b.id)!;
    const L = b.dims.L,
      B = b.dims.B;
    const sx = Math.sin(b.yaw),
      sz = Math.cos(b.yaw);
    const px = Math.cos(b.yaw),
      pz = -Math.sin(b.yaw);
    const v = Math.abs(b.vSigned);
    const spacing = b.type === 'motor' ? 1.0 : b.type === 'ferry' ? 1.5 : 1.1;
    st.acc += v * dt;
    let guard = 0;
    while (st.acc >= spacing && guard++ < 6) {
      st.acc -= spacing;
      if (v < 0.35) continue;
      const k = Math.min(1, v / (b.type === 'motor' ? 5 : 2.6));
      const big = b.type === 'ferry' || b.type === 'tug' ? 1.2 : b.type === 'row' ? 0.4 : b.type === 'tour' ? 0.75 : b.type === 'sail' ? 0.7 : 1;
      const soft = b.type === 'sail' ? 0.7 : 1;
      const fwdSign = b.vSigned >= 0 ? 1 : -1;
      // bow wave (both shoulders): crests that run outward → the V of the Kelvin wake
      if (fwdSign > 0) {
        const bxw = b.x + sx * L * 0.36,
          bzw = b.z + sz * L * 0.36;
        for (const side of [-1, 1]) {
          const x = bxw + px * side * B * 0.45,
            z = bzw + pz * side * B * 0.45;
          const lat = (0.12 + 0.07 * v) * big;
          spawnPuff(now, x, z, px * side * lat, pz * side * lat, 0.16 + 0.04 * B, (0.12 + 0.02 * v) * big, 5.5 + v * 0.3, 0.7 * k * soft, 1.2);
        }
      }
      // turbulent wash behind the stern
      const tx = b.x - sx * fwdSign * L * 0.46,
        tz = b.z - sz * fwdSign * L * 0.46;
      spawnPuff(now, tx, tz, -sx * fwdSign * 0.08 * v, -sz * fwdSign * 0.08 * v, 0.25 + B * 0.13, (0.16 + 0.03 * v) * big, 6.5 + v * 0.4, 0.85 * k * soft, 0.2);
      if (b.type === 'motor' && v > 3) {
        for (const side of [-1, 1]) spawnPuff(now, tx + px * side * 0.45, tz + pz * side * 0.45, px * side * 0.55, pz * side * 0.55, 0.14, 0.18, 2.4, 0.9, 0.8);
      }
    }
    if (st.acc > spacing * 6) st.acc = 0;
    // prop wash while manoeuvring / pushing
    if (b.wash > 0.01) {
      st.washAcc += dt * 7 * b.wash;
      while (st.washAcc >= 1) {
        st.washAcc -= 1;
        const dir = b.vSigned < 0 ? 1 : -1;
        const tx = b.x - sx * L * 0.5,
          tz = b.z - sz * L * 0.5;
        const j = (fx.next() - 0.5) * 0.6;
        spawnPuff(now, tx + px * j, tz + pz * j, sx * dir * 0.9 * b.wash + px * j * 0.4, sz * dir * 0.9 * b.wash + pz * j * 0.4, 0.3, 0.28, 3.4, 0.6 * b.wash, 0.4);
      }
    }
  }

  function spawnPuff(now: number, x: number, z: number, vx: number, vz: number, size0: number, grow: number, life: number, alpha: number, stretch: number): void {
    const c = nav.clearance(x, z);
    if (c <= 0.05 && !nav.isOpenWater(x, z)) return;
    // never let the puff grow over the bank / into a structure
    const room = Math.max(0.2, c + 0.45);
    const g = Math.min(grow, Math.max(0.02, (room - size0) / Math.sqrt(life)));
    const vl = Math.hypot(vx, vz);
    const drift = vl / 0.35;
    const s = drift > room * 0.6 ? (room * 0.6) / drift : 1;
    wakes.spawn(now, x, z, vx * s, vz * s, Math.min(size0, room), g, life, alpha, ampAt(x, z), stretch);
  }

  // ── service + picker
  ctx.services.boats = { count: () => fleet.boats.length, fleet };
  ctx.pickers.push({
    name: 'boats',
    pick(ray: THREE.Ray): PickHit | null {
      const hit = renderer.pick(ray, fleet.boats);
      if (!hit) return null;
      const b = hit.boat;
      const kind = { ferry: 'Harbour ferry', tug: 'Tug', tour: 'River tour boat', sail: 'Sailing yacht', motor: 'Motorboat', row: 'Double scull' }[b.type];
      return {
        kind: 'boat',
        id: b.id,
        distance: hit.distance,
        label: `${kind} “${b.name}”`,
        getPosition(out: THREE.Vector3): boolean {
          out.set(b.x, b.y + 1.5, b.z);
          return true;
        },
        getHeading: () => b.yaw,
        info: () => {
          const lines = b.pilot.describe(b);
          if (b.type === 'sail' || b.type === 'motor') lines.push(`${Math.round(b.v * 3.6)} km/h`);
          return lines;
        },
      };
    },
  });

  const buildMs = performance.now() - t0;
  let cpuMs = 0;
  let simT = 0;

  return {
    name: 'boats',
    update(dt) {
      if (dt <= 0) return;
      const a = performance.now();
      let rem = Math.min(dt, 1.0);
      const now = ctx.uniforms.uTime.value;
      while (rem > 1e-6) {
        const h = Math.min(rem, 0.1);
        simT += h;
        fleet.update(h);
        // last-resort separation (never let hulls interpenetrate)
        for (let i = 0; i < fleet.boats.length; i++) {
          for (let j = i + 1; j < fleet.boats.length; j++) {
            const A = fleet.boats[i],
              B = fleet.boats[j];
            if (Math.abs(A.x - B.x) > 30 || Math.abs(A.z - B.z) > 30) continue;
            const gap = Fleet.gap(A, B);
            if (gap >= 0.05) continue;
            const lo = A.priority <= B.priority ? A : B;
            if (!(lo.pilot instanceof FreePilot)) continue;
            const hi = lo === A ? B : A;
            const dx = lo.x - hi.x,
              dz = lo.z - hi.z;
            const d = Math.hypot(dx, dz) || 1;
            lo.x += (dx / d) * (0.06 - gap) * 0.5;
            lo.z += (dz / d) * (0.06 - gap) * 0.5;
          }
        }
        for (const b of fleet.boats) {
          updatePose(b, h, now);
          spawnWakes(b, h, now);
        }
        rem -= h;
      }
      cpuMs += (performance.now() - a) * 0.05;
    },
    frame() {
      const a = performance.now();
      const night = ctx.uniforms.uLights.value > 0.01;
      renderer.update(fleet.boats, ctx.camera, night);
      glows.mesh.visible = night && renderer.drawn > 0;
      glows.commit();
      wakes.commit();
      wakes.mesh.visible = renderer.nearView > 0;
      cpuMs = cpuMs * 0.95 + (performance.now() - a) * 0.05;
    },
    stats() {
      const byStatus = (b: Boat) => `${b.name}: ${b.status}${b.holding ? ' (holding)' : ''}`;
      return {
        boats: fleet.boats.length,
        drawn: renderer.drawn,
        cpuMs: Math.round(cpuMs * 1000) / 1000,
        foamSpawned: wakes.spawned,
        navCells: nav.navigableCells,
        navMs: Math.round(nav.buildMs),
        boatTris: renderer.triangles,
        ferry: byStatus(ferry),
        tug: byStatus(tug),
        tour: `${byStatus(tour)} x=${tour.x.toFixed(0)}`,
        rowers: rowers.map((r) => (r.holding ? 'hold' : r.v.toFixed(1))).join(','),
        tourAhead: `${fleet.blockers(tour)} holdT=${tour.holdT.toFixed(1)} yaw=${tour.yaw.toFixed(2)}`,
        rowPos: rowers.map((r) => `${r.x.toFixed(0)},${r.z.toFixed(1)}`).join(' '),
        smoke: handles.length,
        buildMs: Math.round(buildMs),
        simT: Math.round(simT),
      };
    },
    invariants() {
      const out: string[] = [...problems];
      const pts: [number, number][] = [
        [0.44, 0],
        [-0.44, 0],
        [0.25, 0.44],
        [0.25, -0.44],
        [-0.25, 0.44],
        [-0.25, -0.44],
        [0, 0.46],
        [0, -0.46],
      ];
      for (const b of fleet.boats) {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.z) || !Number.isFinite(b.yaw) || !Number.isFinite(b.y)) {
          out.push(`${b.name}: non-finite state`);
          continue;
        }
        const sx = Math.sin(b.yaw),
          sz = Math.cos(b.yaw);
        let bad = 0;
        for (const [a, l] of pts) {
          const x = b.x + sx * a * b.dims.L + sz * l * b.dims.B,
            z = b.z + sz * a * b.dims.L - sx * l * b.dims.B;
          if (!nav.isOpenWater(x, z)) bad++;
        }
        if (bad) out.push(`${b.name} (${b.type}) hull off open water at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}): ${bad} outline points`);
      }
      for (let i = 0; i < fleet.boats.length; i++) {
        for (let j = i + 1; j < fleet.boats.length; j++) {
          const g = Fleet.gap(fleet.boats[i], fleet.boats[j]);
          if (g < -0.05) out.push(`${fleet.boats[i].name} overlaps ${fleet.boats[j].name} (${g.toFixed(2)} m)`);
        }
      }
      return out;
    },
    dispose() {
      for (const h of handles) h.remove();
    },
  };
}
