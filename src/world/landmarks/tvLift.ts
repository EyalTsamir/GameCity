// The Skyline Tower's panoramic lift and observation deck (`?notvlift`: the tower as it was, no way up). An open cage on a white
// lattice mast runs up the outside all day long, so from anywhere in town a small lit box climbs the tower; step in on the plaza
// when its gate is down, turn round, and the city opens underneath you on the way to the balcony at 104 m. Round the shaft
// is the deck under a ceiling of stars, with doors out to the wider balcony and coin telescopes.
// Near-only inside (landmarks/rooms.ts). The cage is in the kinetic mesh (ANIM.LIFT, uLift); no draw call of its own.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { addActor } from '../../sim/pedestrians/actorDefs';
import { ANIM, M, PAT } from './builder';
import type { Env } from './env';
import type { V3 } from './kit';
import { RP, Room, Rooms } from './rooms';

const TAU = Math.PI * 2;

/** all in the tower's own frame, polar about its axis */
export const TVL = {
  /** the side the lift runs on: south by east, the whole town ahead and the harbour on the left */
  a: (19.5 / 24) * TAU,
  /** the rail segment left open there (of 24) */
  railGap: 19,
  /** the cage, radially */
  u0: 7.25,
  u1: 8.65,
  /** half its width */
  hv: 0.95,
  balcony: 7.2,
  rail: 7.12,
  /** deck floor above yO */
  deck: 0.2,
  /** the balcony doors: two glazing segments of 48, every quarter turn from `a` */
  glazingSegs: 48,
  doorSeg0: 39,
} as const;

const er: [number, number] = [Math.sin(TVL.a), Math.cos(TVL.a)];
const et: [number, number] = [Math.cos(TVL.a), -Math.sin(TVL.a)];
const P = (u: number, v: number, y: number): V3 => [er[0] * u + et[0] * v, y, er[1] * u + et[1] * v];

/** mast (static) and cage (kinetic). Call inside the tower's env frame */
export function liftKit(env: Env, yO: number, shaftR: (y: number) => number, groundY: number): void {
  const K = env.S;
  const white = M('#e7e9ea', PAT.PLAIN, 0.45, 0.3, 0, 0, 0.3);
  const grey = M('#b9bfc3', PAT.PLAIN, 0.5, 0.4, 0, 0, 0.3);
  const yTop = yO + TVL.deck + 3.1;
  const a = TVL.a;
  const vm = TVL.hv + 0.32;
  const um0 = 7.55,
    um1 = 8.35;
  // ── the mast: a flat lattice beside the cage, tied back to the shaft
  K.box(M('#9a9a94', PAT.CONCRETE, 0.9, 0, 0, 0, 0.3), 1.5, 0.28, 1.5, ...P((um0 + um1) / 2, vm, groundY), a);
  for (const u of [um0, um1]) K.beam(white, P(u, vm, groundY), P(u, vm, yTop), 0.14, 0.14);
  const bay = 4;
  let flip = false;
  for (let y = groundY + bay; y < yTop; y += bay) {
    K.beam(grey, P(um0, vm, y), P(um1, vm, y), 0.07, 0.07);
    K.beam(grey, flip ? P(um0, vm, y - bay) : P(um1, vm, y - bay), flip ? P(um1, vm, y) : P(um0, vm, y), 0.05, 0.05);
    flip = !flip;
  }
  for (const y of [20, 40, 60, 80]) {
    const r = shaftR(y) - 0.1;
    K.beam(grey, P(um0, vm, y), [Math.sin(a + 0.16) * r, y, Math.cos(a + 0.16) * r], 0.1, 0.1);
    K.beam(grey, P(um0, vm, y), [Math.sin(a - 0.16) * r, y, Math.cos(a - 0.16) * r], 0.1, 0.1);
  }
  K.beam(grey, P(um0, vm, yO + TVL.deck - 0.1), P(TVL.balcony - 0.05, vm - 0.2, yO + TVL.deck - 0.1), 0.1, 0.1);

  // ── the cage, built at y = 0: floor, four posts, a lit roof, rails on three sides, and the gate
  const pivot = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  env.anim({ mode: ANIM.LIFT, pivot, axis, a: 0, b: 0, c: 0 });
  const C = env.K;
  const steel = M('#d9dcdd', PAT.PLAIN, 0.45, 0.3, 0, 0, 0.3);
  const dark = M('#4a5054', PAT.PLAIN, 0.7, 0.3, 0, 0, 0.3);
  const uc = (TVL.u0 + TVL.u1) / 2,
    du = TVL.u1 - TVL.u0,
    hv = TVL.hv;
  C.box(dark, hv * 2, 0.1, du, ...P(uc, 0, -0.1), a);
  C.box(steel, hv * 2 + 0.06, 0.2, du + 0.06, ...P(uc, 0, -0.3), a);
  C.box(steel, hv * 2 + 0.08, 0.1, du + 0.08, ...P(uc, 0, 2.4), a);
  C.box(steel, hv * 1.5, 0.12, du * 0.7, ...P(uc, 0, 2.5), a);
  C.box(M('#fff0d0', PAT.PLAIN, 0.5, 0, 2.2, 0, 0.7), 1.1, 0.02, 0.5, ...P(uc, 0, 2.385), a);
  for (const [u, v] of [[TVL.u0, -hv], [TVL.u0, hv], [TVL.u1, -hv], [TVL.u1, hv]] as [number, number][]) C.box(steel, 0.07, 2.42, 0.07, ...P(u, v, 0), a);
  for (const y of [0.5, 1.05]) {
    C.beam(steel, P(TVL.u1, -hv, y), P(TVL.u1, hv, y), 0.035, 0.035);
    C.beam(steel, P(TVL.u0, hv, y), P(TVL.u1, hv, y), 0.035, 0.035);
  }
  // shoes on the mast
  for (const y of [0.1, 2.1]) C.beam(grey, P(um0, hv, y), P(um1, hv, y), 0.1, 0.1);
  // the gate drops into the floor at a stop
  env.anim({ mode: ANIM.LIFT, pivot, axis, a: 1.12, b: 0, c: 0 });
  for (const y of [0.5, 1.05]) C.beam(M('#e0a93a', PAT.PLAIN, 0.5, 0.2, 0, 0, 0.3), P(TVL.u0, -hv, y), P(TVL.u0, hv, y), 0.035, 0.035);
  // the plaza is reached from the side (the pavilion stands close behind): this gate only opens on the ground (c = 1)
  env.anim({ mode: ANIM.LIFT, pivot, axis, a: 1.12, b: 0, c: 1 });
  for (const y of [0.5, 1.05]) C.beam(M('#e0a93a', PAT.PLAIN, 0.5, 0.2, 0, 0, 0.3), P(TVL.u0, -hv, y), P(TVL.u1, -hv, y), 0.035, 0.035);
  // and so does the landing's, once the cage is up (b = 1: stays at the top)
  env.anim({ mode: ANIM.LIFT, pivot, axis, a: 1.12, b: 1, c: 0 });
  const yL = yO + TVL.deck;
  for (const y of [0.5, 1.05]) C.beam(M('#e0a93a', PAT.PLAIN, 0.5, 0.2, 0, 0, 0.3), P(TVL.balcony - 0.02, -hv, yL + y), P(TVL.balcony - 0.02, hv, yL + y), 0.03, 0.03);
  env.anim(null);
}

/** the deck's glazing with the door openings left out (replaces one closed drum) */
export function deckGlazing(env: Env, mat: ReturnType<typeof M>, yO: number, h: number, rTop: number, rBot: number): void {
  const n = TVL.glazingSegs;
  const K = env.S;
  for (let i = 0; i < n; i++) {
    const q = (((i - TVL.doorSeg0 + 1) % 12) + 12) % 12;
    if (q < 2) continue;
    const a0 = (i / n) * TAU,
      a1 = ((i + 1) / n) * TAU;
    K.poly(mat, [
      [Math.sin(a0) * rBot, yO, Math.cos(a0) * rBot],
      [Math.sin(a1) * rBot, yO, Math.cos(a1) * rBot],
      [Math.sin(a1) * rTop, yO + h, Math.cos(a1) * rTop],
      [Math.sin(a0) * rTop, yO + h, Math.cos(a0) * rTop],
    ]);
  }
}

export interface TvLiftRuntime {
  frame(dt: number): void;
}

/** the deck (near-only) and the lift's motion */
export function buildTvLift(ctx: CityContext, rooms: Rooms, uLift: { value: THREE.Vector2 }, cx: number, cz: number, yaw: number, yO: number, groundY: number): TvLiftRuntime {
  const room = rooms.add(new Room('tvdeck', 1024, 256));
  room.frame(cx, cz, yaw);
  room.near = 130;
  const K = room.K;
  const yD = yO + TVL.deck;
  const yC = yD + 2.6;
  const rCore = 2.5,
    rGlass = 5.62;

  const floorM = M('#a39c8f', RP.FLAGS, 0.55, 0, 0, 0, 0.3);
  const stars = M('#2a3654', PAT.PLAIN, 0.8);
  const walnut = M('#4a2f1c', RP.OAK, 0.5);
  const brass = M('#c79c48', RP.BRASS, 0.25, 1);
  const steel = M('#d9dcdd', PAT.PLAIN, 0.45, 0.3);
  const dark = M('#30363a', PAT.PLAIN, 0.6, 0.4);
  const lamp = M('#ffe6bd', RP.EMIT, 0, 0, 4, 0, 0.7);

  // ── floor, the star ceiling, the core in walnut, a brass compass ring in the floor
  room.grid(floorM, (th, r) => [Math.sin(th) * r, yD, Math.cos(th) * r], 0, TAU, rCore, TVL.balcony - 1.42, 0.13, 0.5, true);
  room.grid(stars, (th, r) => [Math.sin(th) * r, yC, Math.cos(th) * r], 0, TAU, rCore, 5.75, 0.13, 0.5);
  room.grid(walnut, (th, y) => [Math.sin(th) * rCore, y, Math.cos(th) * rCore], 0, TAU, yD, yC, 0.1, 0.5);
  K.torus(brass, 3.3, 0.018, 0, yD + 0.004, 0, 5, 64);
  K.torus(brass, rCore + 0.01, 0.03, 0, yC - 0.45, 0, 5, 48);
  K.torus(brass, rCore + 0.01, 0.03, 0, yD + 0.1, 0, 5, 48);

  // ── mullions, except where the doors are; door heads
  const segA = (i: number) => (i / TVL.glazingSegs) * TAU;
  for (let i = 0; i < TVL.glazingSegs; i++) {
    const q = (((i - TVL.doorSeg0 + 1) % 12) + 12) % 12;
    if (q === 1 || (q === 0 ? false : i % 3 !== 0)) continue;
    const c = segA(i);
    K.rod(dark, [Math.sin(c) * rGlass, yD, Math.cos(c) * rGlass], [Math.sin(c) * rGlass, yC, Math.cos(c) * rGlass], 0.03, 4);
  }
  for (let k = 0; k < 4; k++) {
    const c = TVL.a + (k * TAU) / 4;
    const d = TAU / TVL.glazingSegs;
    K.rod(brass, [Math.sin(c - d) * rGlass, yD + 2.15, Math.cos(c - d) * rGlass], [Math.sin(c + d) * rGlass, yD + 2.15, Math.cos(c + d) * rGlass], 0.025, 5);
  }

  // ── boards on the core: what you are looking at
  const boards: [string, string[], number][] = [
    ['North', ['The Northern Hills', 'The rail tunnel', 'Wind farm on the ridge'], Math.PI / 2],
    ['East', ['The container quay', 'Breakwater and lighthouse', 'The open sea'], 0],
    ['South', ["Town Square, St Mary's", 'Old Town and the market', 'The river beyond'], -Math.PI / 2],
    ['West', ['Central Station', 'Northgate Works', 'Westbrook'], Math.PI],
  ];
  for (const [title, lines, c] of boards) {
    const rc = room.atlas.add(256, 180, (g, w, h) => {
      g.fillStyle = '#efe6cf';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8a6a30';
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#3a2a18';
      g.font = 'bold 36px Georgia, serif';
      g.textAlign = 'center';
      g.fillText(title, w / 2, 52);
      g.font = 'italic 19px Georgia, serif';
      lines.forEach((l, i) => g.fillText(l, w / 2, 90 + i * 28));
    });
    const r = rCore + 0.04;
    K.box(brass, 0.84, 0.58, 0.02, Math.sin(c) * (r - 0.02), yD + 1.15, Math.cos(c) * (r - 0.02), c);
    room.pic(rc, 0.8, 0.54, Math.sin(c) * (r + 0.005), yD + 1.17, Math.cos(c) * (r + 0.005), c);
  }

  // ── benches round the core; downlights
  for (let k = 0; k < 4; k++) {
    const c = Math.PI / 4 + (k * TAU) / 4 - 0.25;
    const r = rCore + 0.3;
    K.box(walnut, 1.4, 0.06, 0.42, Math.sin(c) * r, yD + 0.42, Math.cos(c) * r, c);
    K.box(dark, 0.08, 0.42, 0.36, Math.sin(c) * r + Math.cos(c) * 0.55, yD, Math.cos(c) * r - Math.sin(c) * 0.55, c);
    K.box(dark, 0.08, 0.42, 0.36, Math.sin(c) * r - Math.cos(c) * 0.55, yD, Math.cos(c) * r + Math.sin(c) * 0.55, c);
    room.blockDisc(room.wx(Math.sin(c) * r, Math.cos(c) * r), room.wz(Math.sin(c) * r, Math.cos(c) * r), 0.55);
  }
  for (let k = 0; k < 12; k++) {
    const c = (k / 12) * TAU;
    const lx = Math.sin(c) * 4.1,
      lz = Math.cos(c) * 4.1;
    K.cyl(lamp, 0.06, 0.06, 0.012, lx, yC - 0.012, lz, 10);
    room.lamps.push({ x: lx, y: yC - 0.06, z: lz, k: 0.32, r: 2.6 });
    room.halo(lx, yC - 0.05, lz, 0.16, '#ffe0b0', 0.25, true);
  }
  // ── the sky all round
  for (let k = 0; k < 8; k++) {
    const c = (k / 8) * TAU;
    room.wins.push({ x: Math.sin(c) * rGlass, y: yD + 1.4, z: Math.cos(c) * rGlass, nx: -Math.sin(c), nz: -Math.cos(c), area: 7, trans: 1 });
  }
  room.ambient = 0.3;
  room.skyK = 1.15;
  room.lampK = 1;

  // ── coin telescopes on the balcony
  for (const dA of [0.55, 1.85, 3.1, 4.4, 5.6]) {
    const c = TVL.a + dA;
    const r = 6.7;
    const x = Math.sin(c) * r,
      z = Math.cos(c) * r;
    K.cyl(steel, 0.05, 0.09, 1.1, x, yD, z, 8);
    K.cyl(dark, 0.14, 0.17, 0.1, x, yD, z, 8);
    const s = 0.1;
    K.sphere(steel, 0.11, x, yD + 1.18, z, 8, 6);
    K.rod(dark, [x - Math.sin(c) * 0.24, yD + 1.13, z - Math.cos(c) * 0.24], [x + Math.sin(c) * 0.3, yD + 1.27, z + Math.cos(c) * 0.3], s * 0.8, 8);
    room.blockDisc(room.wx(x, z), room.wz(x, z), 0.16);
  }
  // ── people looking out
  for (const [dA, r, h0, h1, p, sh] of [[0.2, 6.5, 10, 22, 0.8, 0x2f4a6b], [1.35, 6.45, 10, 21, 0.7, 0x8f3b3b], [3.4, 6.55, 11, 22, 0.8, 0x4c6b4c], [4.9, 5.0, 10, 22, 0.7, 0x6b5a3a], [2.4, 4.6, 12, 20, 0.6, 0x3b3b5c]] as [number, number, number, number, number, number][]) {
    const c = TVL.a + dA;
    addActor({ x: room.wx(Math.sin(c) * r, Math.cos(c) * r), y: yD, z: room.wz(Math.sin(c) * r, Math.cos(c) * r), yaw: yaw + c, role: 'traveller', idle: 5, shirt: sh, h0, h1, p });
  }

  // ── the lift
  const CRUISE = 5.5;
  const ACC = 1.3;
  let y = groundY,
    v = 0,
    dir = 0,
    wait = 9,
    atTop = false,
    gate = 1,
    riding = false,
    cameWith = false,
    walkerNearStop = false;
  const uc0 = TVL.u0,
    uc1 = TVL.u1;
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const inCage = (x: number, z: number) => {
    const dx = x - cx,
      dz = z - cz;
    const lx = c * dx - s * dz,
      lz = s * dx + c * dz;
    const u = lx * er[0] + lz * er[1],
      w = lx * et[0] + lz * et[1];
    return u >= uc0 && u <= uc1 && Math.abs(w) <= TVL.hv;
  };

  // ── where the walker can go. Off the floors up here is thin air; on the ground the city decides
  const half = 9.4;
  room.bounds = room.rectL(-half, -half, half, half);
  room.core = room.bounds;
  room.skyFrom = 50;
  const doorOpen = (th: number) => {
    for (let k = 0; k < 4; k++) {
      let d = Math.abs(th - (TVL.a + (k * TAU) / 4));
      d = ((d % TAU) + TAU) % TAU;
      if (d > Math.PI) d = TAU - d;
      if (d < TAU / TVL.glazingSegs) return true;
    }
    return false;
  };
  // the deck and the balcony
  room.walk(-half, -half, half, half, (x, z) => {
    const dx = x - cx,
      dz = z - cz;
    const r = Math.hypot(dx, dz);
    if (r < rCore + 0.02 || r > TVL.u0 + 0.03) return NaN;
    if (r > TVL.rail) {
      const lx = c * dx - s * dz,
        lz = s * dx + c * dz;
      let d = Math.abs(Math.atan2(lx, lz) - TVL.a);
      d = ((d % TAU) + TAU) % TAU;
      if (d > Math.PI) d = TAU - d;
      if (d > TAU / 48) return NaN;
    }
    if (r > rGlass - 0.05 && r < 5.8) {
      const lx = c * dx - s * dz,
        lz = s * dx + c * dz;
      if (!doorOpen(Math.atan2(lx, lz))) return NaN;
    }
    return yD;
  });
  // the cage: wherever it is. A rider keeps to it whatever the height; anyone else only steps on when it is level
  room.walk(-half, -half, half, half, (x, z) => {
    if (!inCage(x, z)) return NaN;
    if (riding) return y;
    return gate > 0.9 && Math.abs(y - rooms.feet) < 0.62 ? y : NaN;
  });
  room.floors[room.floors.length - 1].sticky = true;

  uLift.value.set(y, gate);
  return {
    frame(dt) {
      // who is about?
      riding = false;
      walkerNearStop = false;
      const cp = ctx.camera.position;
      if (Math.hypot(cp.x - cx, cp.z - cz) < 26) {
        const cam = ctx.services.camera as { walkDebug?(): { x: number; z: number; feet: number } | null } | undefined;
        const d = cam?.walkDebug?.();
        if (d) {
          riding = inCage(d.x, d.z) && Math.abs(d.feet - y) < 1.5;
          walkerNearStop = riding || Math.abs(d.feet - (atTop ? groundY : yD)) < 3;
        }
      }
      if (dir === 0) {
        gate = Math.min(1, gate + dt * 1.2);
        // someone waiting at the other end, or on board: no dawdling
        if (cameWith) {
          if (!riding) cameWith = false;
        } else if (riding || walkerNearStop) wait = Math.min(wait, 3.5);
        wait -= dt;
        if (wait <= 0) dir = atTop ? -1 : 1;
      } else if (gate > 0) {
        gate = Math.max(0, gate - dt * 1.2);
      } else {
        const to = dir > 0 ? yD : groundY;
        const left = Math.abs(to - y);
        const want = Math.min(CRUISE, Math.sqrt(2 * ACC * left) + 0.02);
        v = Math.min(want, v + ACC * dt);
        y += dir * Math.min(v * dt, left);
        if (left - v * dt <= 0) {
          y = to;
          v = 0;
          dir = 0;
          atTop = to === yD;
          cameWith = riding;
          wait = riding ? 14 : 9;
        }
      }
      uLift.value.set(y, gate);
      rooms.carry = riding ? dir * v : 0;
      rooms.liftY = y;
      room.skyFrom = riding && gate < 0.9 ? -1e3 : 50;
    },
  };
}
