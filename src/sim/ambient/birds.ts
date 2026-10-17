// Birds & butterflies — ONE InstancedMesh (see birdModel.ts):
//   • starling flocks wheeling over the park / old town / market / Westbrook (boids around a
//     wandering leader), roosting in trees at dusk (they dive into the canopy and vanish);
//   • seagulls soaring and banking over the harbour, beach and sea (gull-wing glide, short flap
//     bouts), settling on the water for the night;
//   • pigeons on the town square and the market: walking, pecking, bobbing heads; every now and
//     then the whole group flutters up, circles and lands elsewhere; at dusk they fly up to a roof;
//   • butterflies fluttering over the park lawns in daytime.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Rng } from '../../core/rng';
import type { Rect } from '../../core/geom';
import { OCC } from '../../core/occupancy';
import { buildBirdGeometry, makeBirdMaterial } from './birdModel';
import { angleDiff, clamp, smooth, SkylineGrid } from './shared';
import { liveBoats, type BoatLike } from './waterfowl';

type WaterSvc = { surfaceY(x: number, z: number): number; depth(x: number, z: number): number } | undefined;
type TerrainSvc = { height(x: number, z: number): number } | undefined;

const KIND = { BIRD: 0, GULL: 1, PIGEON: 2, BUTTERFLY: 3 } as const;

interface Bird {
  idx: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  yawRate: number;
  phase: number;
  amp: number;
  ampT: number;
  freq: number;
  bout: number;
  fold: number;
  head: number;
  scale: number;
  vis: number;
  th: number;
  mode: number;
  t: number;
  seed: number;
}

function newBird(idx: number, kind: number, rng: Rng, scale: number): Bird {
  return { idx, kind, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, yawRate: 0, phase: rng.range(0, 6.28), amp: 0, ampT: 0, freq: 8, bout: rng.range(0, 2), fold: 0, head: 0, scale, vis: 0, th: 0, mode: 0, t: 0, seed: rng.range(0, 1000) };
}

// ───────────────────────────────────────────────────────────── renderer ──
class BirdMesh {
  readonly mesh: THREE.InstancedMesh;
  private body: THREE.InstancedBufferAttribute;
  private wing: THREE.InstancedBufferAttribute;
  private accent: THREE.InstancedBufferAttribute;
  private anim: THREE.InstancedBufferAttribute;
  private shape: THREE.InstancedBufferAttribute;
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(readonly capacity: number) {
    const geo = buildBirdGeometry();
    const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
    this.body = mk(3);
    this.wing = mk(3);
    this.accent = mk(3);
    this.anim = mk(4).setUsage(THREE.DynamicDrawUsage);
    this.shape = mk(4);
    geo.setAttribute('iBody', this.body);
    geo.setAttribute('iWing', this.wing);
    geo.setAttribute('iAccent', this.accent);
    geo.setAttribute('iAnim', this.anim);
    geo.setAttribute('iShape', this.shape);
    this.mesh = new THREE.InstancedMesh(geo, makeBirdMaterial(), capacity);
    this.mesh.name = 'ambient-birds';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.count = 0;
  }

  colors(i: number, body: THREE.ColorRepresentation, wing: THREE.ColorRepresentation, accent: THREE.ColorRepresentation): void {
    const c = new THREE.Color(body);
    this.body.setXYZ(i, c.r, c.g, c.b);
    c.set(wing);
    this.wing.setXYZ(i, c.r, c.g, c.b);
    c.set(accent);
    this.accent.setXYZ(i, c.r, c.g, c.b);
    this.body.needsUpdate = this.wing.needsUpdate = this.accent.needsUpdate = true;
  }

  setShape(i: number, span: number, bias: number, kink: number, kind: number): void {
    this.shape.setXYZW(i, span, bias, kink, kind);
    this.shape.needsUpdate = true;
  }

  /** writes the instance matrix directly: T · Ry(yaw) · Rx(-pitch) · Rz(roll) · S (same as Euler 'YXZ') */
  pose(b: Bird): void {
    const te = this.mesh.instanceMatrix.array as Float32Array;
    const o = b.idx * 16;
    const sc = b.scale * b.vis;
    if (sc < 1e-3) {
      te.fill(0, o, o + 16);
    } else {
      const a = Math.cos(-b.pitch),
        bb = Math.sin(-b.pitch),
        c = Math.cos(b.yaw),
        d = Math.sin(b.yaw),
        e = Math.cos(b.roll),
        f = Math.sin(b.roll);
      const ce = c * e,
        cf = c * f,
        de = d * e,
        df = d * f;
      te[o] = (ce + df * bb) * sc;
      te[o + 1] = a * f * sc;
      te[o + 2] = (cf * bb - de) * sc;
      te[o + 3] = 0;
      te[o + 4] = (de * bb - cf) * sc;
      te[o + 5] = a * e * sc;
      te[o + 6] = (df + ce * bb) * sc;
      te[o + 7] = 0;
      te[o + 8] = a * d * sc;
      te[o + 9] = -bb * sc;
      te[o + 10] = a * c * sc;
      te[o + 11] = 0;
      te[o + 12] = b.x;
      te[o + 13] = b.y;
      te[o + 14] = b.z;
      te[o + 15] = 1;
    }
    this.anim.setXYZW(b.idx, b.phase, b.amp, b.fold, b.head);
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.anim.needsUpdate = true;
  }
}

// ───────────────────────────────────────────────────── shared kinematics ──
/** orient a flying bird along its velocity; bank into turns */
function orient(b: Bird, dt: number, bankK = 0.11, maxBank = 0.95): void {
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > 0.05) {
    const yaw = Math.atan2(b.vx, b.vz);
    const d = angleDiff(b.yaw, yaw);
    const k = 1 - Math.exp(-dt * 10);
    b.yaw += d * k;
    const rate = dt > 0 ? (d * k) / dt : 0;
    b.yawRate += (rate - b.yawRate) * (1 - Math.exp(-dt * 4));
  }
  const pitch = Math.atan2(b.vy, Math.max(0.5, sp)) * 0.8;
  b.pitch += (pitch - b.pitch) * (1 - Math.exp(-dt * 6));
  const roll = clamp(-b.yawRate * sp * bankK, -maxBank, maxBank);
  b.roll += (roll - b.roll) * (1 - Math.exp(-dt * 5));
}

/** flap/glide bouts: flapping when climbing or slow, gliding otherwise */
function wings(b: Bird, dt: number, rng: Rng, flapAmp: number, glideAmp: number, flapP: number, boutMin: number, boutMax: number): void {
  b.bout -= dt;
  if (b.bout <= 0) {
    const climbing = b.vy > 0.6;
    b.ampT = climbing || rng.next() < flapP ? flapAmp : glideAmp;
    b.bout = rng.range(boutMin, boutMax) * (b.ampT === flapAmp ? 1 : 1.3);
  }
  b.amp += (b.ampT - b.amp) * (1 - Math.exp(-dt * 7));
  b.phase = (b.phase + dt * b.freq * Math.PI * 2 * (0.4 + 0.6 * Math.min(1, b.amp / Math.max(0.01, flapAmp)))) % (Math.PI * 200);
}

// ─────────────────────────────────────────────────────────────── flocks ──
interface Flock {
  birds: Bird[];
  region: Rect;
  alt: [number, number];
  roost: { x: number; y: number; z: number };
  lx: number;
  ly: number;
  lz: number;
  lvx: number;
  lvz: number;
  tx: number;
  ty: number;
  tz: number;
  timer: number;
  swirl: number;
  offs: Float32Array;
}

// ─────────────────────────────────────────────────────────────── system ──
export interface BirdSystem {
  mesh: THREE.InstancedMesh;
  /** debug: world position of a bird ('flock', 'gull', 'pigeon', 'butterfly') */
  locate(kind: string, i: number): { x: number; y: number; z: number } | null;
  update(dt: number): void;
  timejump(): void;
  stats(): Record<string, number>;
  invariants(): string[];
}

export function createBirds(ctx: CityContext, skyline: SkylineGrid): BirdSystem {
  const rng = ctx.rng('ambient-birds');
  const { plan } = ctx;
  const dens = Math.min(1, Math.max(0.4, ctx.quality.density));
  const terrain = () => ctx.services.terrain as TerrainSvc;
  const water = () => ctx.services.water as WaterSvc;
  const ground = (x: number, z: number) => terrain()?.height(x, z) ?? plan.heightAt(x, z);

  const FLOCK_N = Math.round(18 + 8 * dens);
  const GULLS = Math.round(7 + 4 * dens);
  const PIGEONS = Math.round(8 + 4 * dens);
  const BUTTERFLIES = Math.round(14 + 10 * dens);

  // ── regions
  const park = plan.districts.find((d) => d.kind === 'park');
  void park;
  const pond = plan.water.ponds[0];
  const flockDefs: { region: Rect; alt: [number, number]; roost: { x: number; z: number } }[] = [
    { region: { x0: -100, z0: -5, x1: -10, z1: 40 }, alt: [16, 34], roost: { x: -30, z: 33 } }, // central park
    { region: { x0: 62, z0: -60, x1: 108, z1: 95 }, alt: [30, 46], roost: { x: -12, z: 0 } }, // old town
    { region: { x0: -195, z0: 0, x1: -115, z1: 100 }, alt: [20, 36], roost: { x: -100, z: 34 } }, // westbrook
    { region: { x0: -45, z0: 50, x1: 50, z1: 140 }, alt: [26, 44], roost: { x: -60, z: 138 } }, // market & river
  ];

  const total = flockDefs.length * FLOCK_N + GULLS + PIGEONS * 3 + BUTTERFLIES;
  const rm = new BirdMesh(total);
  let nextIdx = 0;
  const all: Bird[] = [];
  const alloc = (kind: number, scale: number): Bird => {
    const b = newBird(nextIdx++, kind, rng, scale);
    all.push(b);
    return b;
  };

  // ── activity (0 night .. 1 day), damped by rain
  const activity = () => smooth(0.1, 0.42, ctx.clock.daylight) * (1 - 0.5 * ctx.uniforms.uRain.value);

  // ───────────────────── flocks
  const flocks: Flock[] = [];
  const starlingBody = ['#2f2c2a', '#3a3531', '#45403a', '#2a2a2e', '#5a4a3a'];
  for (const def of flockDefs) {
    const f: Flock = {
      birds: [],
      region: def.region,
      alt: def.alt,
      roost: { x: def.roost.x, y: ground(def.roost.x, def.roost.z) + 6, z: def.roost.z },
      lx: (def.region.x0 + def.region.x1) / 2,
      ly: (def.alt[0] + def.alt[1]) / 2,
      lz: (def.region.z0 + def.region.z1) / 2,
      lvx: 6,
      lvz: 0,
      tx: 0,
      ty: 0,
      tz: 0,
      timer: 0,
      swirl: rng.range(0, 6.28),
      offs: new Float32Array(FLOCK_N * 3),
    };
    for (let i = 0; i < FLOCK_N; i++) {
      const b = alloc(KIND.BIRD, rng.range(0.42, 0.5));
      b.freq = rng.range(8, 10.5);
      b.th = rng.range(0.18, 0.55);
      const c = rng.pick(starlingBody);
      rm.colors(b.idx, c, c, '#3b3027');
      rm.setShape(b.idx, rng.range(1.0, 1.1), 0.12, -0.05, KIND.BIRD);
      // loose ellipsoidal formation slot
      const a = rng.range(0, Math.PI * 2),
        r = Math.sqrt(rng.next()) * 5.5;
      f.offs[i * 3] = Math.cos(a) * r;
      f.offs[i * 3 + 1] = rng.range(-1.8, 1.8);
      f.offs[i * 3 + 2] = Math.sin(a) * r * 0.75;
      f.birds.push(b);
    }
    flocks.push(f);
  }
  const pickFlockTarget = (f: Flock) => {
    const r = f.region;
    f.tx = rng.range(r.x0, r.x1);
    f.tz = rng.range(r.z0, r.z1);
    f.ty = rng.range(f.alt[0], f.alt[1]);
    f.timer = rng.range(5, 11);
  };
  for (const f of flocks) pickFlockTarget(f);

  const placeFlockBird = (f: Flock, b: Bird, i: number) => {
    b.x = f.lx + f.offs[i * 3];
    b.y = f.ly + f.offs[i * 3 + 1];
    b.z = f.lz + f.offs[i * 3 + 2];
    b.vx = f.lvx;
    b.vy = 0;
    b.vz = f.lvz;
    b.yaw = Math.atan2(b.vx, b.vz);
  };

  const stepLeader = (f: Flock, dt: number) => {
    f.timer -= dt;
    const dx = f.tx - f.lx,
      dz = f.tz - f.lz;
    if (f.timer <= 0 || dx * dx + dz * dz < 100) pickFlockTarget(f);
    const sp = 10.5;
    const want = Math.atan2(dx, dz);
    const cur = Math.atan2(f.lvx, f.lvz);
    const turn = clamp(angleDiff(cur, want), -0.9 * dt, 0.9 * dt);
    const h = cur + turn;
    f.lvx = Math.sin(h) * sp;
    f.lvz = Math.cos(h) * sp;
    f.lx += f.lvx * dt;
    f.lz += f.lvz * dt;
    const floor = skyline.around(f.lx, f.lz, 10) + 10;
    const ty = Math.max(f.ty, floor);
    f.ly += (ty - f.ly) * (1 - Math.exp(-dt * 0.6));
    f.swirl += dt * 0.35;
  };

  const stepFlock = (f: Flock, dt: number, act: number) => {
    stepLeader(f, dt);
    const n = f.birds.length;
    const cs = Math.cos(f.swirl),
      sn = Math.sin(f.swirl);
    for (let i = 0; i < n; i++) {
      const b = f.birds[i];
      if (b.mode === 2) {
        // roosted: wake up when the day comes
        if (act > b.th + 0.06) {
          b.mode = 3;
          b.t = 0;
          b.x = f.roost.x + rng.range(-3, 3);
          b.y = f.roost.y - 2;
          b.z = f.roost.z + rng.range(-3, 3);
          b.vx = b.vz = 0;
          b.vy = 3;
        } else continue;
      }
      let sx: number, sy: number, sz: number;
      let seekK = 1.6;
      let maxSp = 13,
        minSp = 6;
      if (b.mode === 1) {
        // heading home to roost
        sx = f.roost.x + Math.sin(b.seed) * 3;
        sy = f.roost.y;
        sz = f.roost.z + Math.cos(b.seed) * 3;
        seekK = 2.4;
        minSp = 1.5;
        maxSp = 10;
        const d2 = (sx - b.x) ** 2 + (sy - b.y) ** 2 + (sz - b.z) ** 2;
        if (d2 < 9) {
          b.vis = Math.max(0, b.vis - dt * 2.5);
          if (b.vis <= 0) {
            b.mode = 2;
            continue;
          }
        }
      } else {
        if (b.mode === 0 && act < b.th) b.mode = 1;
        if (b.mode === 3) {
          b.t += dt;
          b.vis = Math.min(1, b.vis + dt * 1.5);
          if (b.t > 4) b.mode = 0;
        } else b.vis = Math.min(1, b.vis + dt * 2);
        const ox = f.offs[i * 3],
          oy = f.offs[i * 3 + 1],
          oz = f.offs[i * 3 + 2];
        // swirling slot around the leader
        sx = f.lx + ox * cs - oz * sn;
        sy = f.ly + oy + Math.sin(f.swirl * 2.3 + b.seed) * 1.5;
        sz = f.lz + ox * sn + oz * cs;
      }
      let ax = (sx - b.x) * seekK + (f.lvx - b.vx) * 0.6,
        ay = (sy - b.y) * seekK * 0.8 - b.vy * 1.2,
        az = (sz - b.z) * seekK + (f.lvz - b.vz) * 0.6;
      if (b.mode === 1) {
        ax = (sx - b.x) * seekK - b.vx * 0.9;
        az = (sz - b.z) * seekK - b.vz * 0.9;
        ay = (sy - b.y) * 1.8 - b.vy * 1.5;
      }
      // separation + alignment (boids-lite)
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = f.birds[j];
        if (o.mode === 2) continue;
        const dx = b.x - o.x,
          dy = b.y - o.y,
          dz = b.z - o.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 2.6 && d2 > 1e-4) {
          const k = (2.6 - d2) * 6 / d2;
          ax += dx * k;
          ay += dy * k * 0.5;
          az += dz * k;
        } else if (d2 < 30) {
          ax += (o.vx - b.vx) * 0.04;
          az += (o.vz - b.vz) * 0.04;
        }
      }
      // rooftops below (not while dropping into the roost tree)
      const nearRoost = b.mode === 1 && (f.roost.x - b.x) ** 2 + (f.roost.z - b.z) ** 2 < 400;
      const floor = nearRoost ? -1e9 : skyline.at(b.x, b.z) + 3;
      if (b.y < floor) ay += (floor - b.y) * 6;
      b.vx += ax * dt;
      b.vy += ay * dt;
      b.vz += az * dt;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > maxSp) {
        b.vx *= maxSp / sp;
        b.vz *= maxSp / sp;
      } else if (sp < minSp && b.mode !== 1) {
        const k = minSp / Math.max(0.01, sp);
        b.vx *= k;
        b.vz *= k;
      }
      b.vy = clamp(b.vy, -6, 5);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      orient(b, dt);
      wings(b, dt, rng, 0.85, 0.06, 0.62, 0.35, 1.1);
      b.fold = 0;
    }
  };

  // ───────────────────── gulls
  interface GullState {
    b: Bird;
    cx: number;
    cz: number;
    r: number;
    dir: number;
    theta: number;
    alt: number;
    timer: number;
    raftX: number;
    raftZ: number;
    /** night raft (fixed) */
    nightX: number;
    nightZ: number;
    /** daytime rests on the water */
    restT: number;
    restLeft: number;
  }
  const gullZones: Rect[] = [
    { x0: 150, z0: -130, x1: 192, z1: -25 }, // harbour basin
    { x0: 150, z0: -10, x1: 194, z1: 50 }, // beach & sea
    { x0: 150, z0: 75, x1: 194, z1: 140 }, // south sea
    { x0: 120, z0: 108, x1: 160, z1: 140 }, // river mouth
  ];
  const rafts = [
    { x: 176, z: -112 },
    { x: 182, z: 20 },
    { x: 178, z: 110 },
  ];
  const gulls: GullState[] = [];
  const bargeX = 180,
    bargeZ = -58,
    PIER_Z = plan.features.find((f) => f.kind === 'pier')?.z ?? 62;
  const pickGull = (g: GullState) => {
    const zone = rng.pick(gullZones);
    g.cx = rng.range(zone.x0, zone.x1);
    g.cz = rng.range(zone.z0, zone.z1);
    g.r = rng.range(12, 30);
    g.alt = rng.range(11, 32);
    g.timer = rng.range(14, 32);
    if (rng.next() < 0.3) g.dir = -g.dir;
  };
  for (let i = 0; i < GULLS; i++) {
    const b = alloc(KIND.GULL, rng.range(0.62, 0.72));
    b.freq = rng.range(2.6, 3.2);
    b.th = rng.range(0.22, 0.5);
    rm.colors(b.idx, '#f5f4ef', rng.pick(['#b9c1c9', '#aeb7c0', '#c3c9cf']), '#e8c13a');
    rm.setShape(b.idx, 1.18, 0.1, -0.26, KIND.GULL);
    const raft = rafts[i % rafts.length];
    const rx = raft.x + rng.range(-7, 7),
      rz = raft.z + rng.range(-7, 7);
    const g: GullState = { b, cx: 0, cz: 0, r: 20, dir: rng.chance(0.5) ? 1 : -1, theta: rng.range(0, 6.28), alt: 20, timer: 0, raftX: rx, raftZ: rz, nightX: rx, nightZ: rz, restT: rng.range(20, 160), restLeft: 0 };
    pickGull(g);
    b.x = g.cx + Math.cos(g.theta) * g.r;
    b.z = g.cz + Math.sin(g.theta) * g.r;
    b.y = g.alt;
    gulls.push(g);
  }
  const placeGullOnWater = (g: GullState) => {
    const b = g.b;
    b.mode = 2;
    b.x = g.raftX;
    b.z = g.raftZ;
    b.vx = b.vy = b.vz = 0;
    b.vis = 1;
    b.fold = 1;
    b.amp = 0;
    b.pitch = 0;
    b.roll = 0;
  };
  let boats: BoatLike[] | null = null;
  const boatNear = (x: number, z: number, r: number): boolean => {
    if (!boats) return false;
    for (const bt of boats) {
      const R = (bt.dims?.L ?? 6) * 0.5 + r;
      if ((bt.x - x) ** 2 + (bt.z - z) ** 2 < R * R) return true;
    }
    return false;
  };
  const stepGull = (g: GullState, dt: number, act: number) => {
    const b = g.b;
    const w = water();
    if (b.mode === 2 && boatNear(b.x, b.z, 7)) {
      // a boat is coming: up and away (at night the raft moves somewhere quieter)
      b.mode = 3;
      b.t = 0;
      b.vy = 3;
      g.restLeft = 0;
      if (act < b.th + 0.06) {
        for (let k = 0; k < 6; k++) {
          const nx = clamp(g.nightX + rng.range(-16, 16), 158, 195),
            nz = g.nightZ + rng.range(-16, 16);
          if (plan.isWater(nx, nz) && !boatNear(nx, nz, 10)) {
            g.nightX = nx;
            g.nightZ = nz;
            break;
          }
        }
      }
    }
    if (b.mode === 2) {
      // floating on the water for the night
      const sy = w ? w.surfaceY(b.x, b.z) : plan.water.level;
      b.y = sy + 0.05;
      b.yaw += Math.sin(ctx.clock.simTime * 0.1 + b.seed) * dt * 0.05;
      b.x += 0.04 * dt * Math.sin(b.seed);
      b.fold = 1;
      b.amp = 0;
      b.head = 0.1;
      g.restLeft -= dt;
      if (act > b.th + 0.06 && g.restLeft <= 0) {
        b.mode = 3;
        b.t = 0;
        b.vy = 2.5;
      }
      return;
    }
    if (b.mode === 0 && act < b.th) {
      b.mode = 1;
      g.raftX = g.nightX;
      g.raftZ = g.nightZ;
      g.restLeft = 0;
    }
    if (b.mode === 0) {
      // now and then a gull settles on the water for a rest
      g.restT -= dt;
      if (g.restT <= 0) {
        g.restT = rng.range(70, 200);
        const x = g.cx + rng.range(-6, 6),
          z = g.cz + rng.range(-6, 6);
        const clear = plan.isWater(x, z) && x > 156 && x < 196 && Math.hypot(x - bargeX, z - bargeZ) > 10 && Math.abs(z - PIER_Z) > 10;
        if (clear && rng.next() < 0.5) {
          b.mode = 1;
          g.raftX = x;
          g.raftZ = z;
          g.restLeft = rng.range(25, 70);
        }
      }
    }
    let tx: number, ty: number, tz: number;
    let sp = 8.5;
    if (b.mode === 1) {
      // glide down onto the raft spot
      tx = g.raftX;
      tz = g.raftZ;
      const sy = w ? w.surfaceY(tx, tz) : plan.water.level;
      const dh = Math.hypot(tx - b.x, tz - b.z);
      ty = sy + Math.min(25, dh * 0.35);
      sp = clamp(dh * 0.35 + 1.5, 2, 8.5);
      if (dh < 1.2 && b.y < sy + 0.8) {
        placeGullOnWater(g);
        return;
      }
    } else {
      if (b.mode === 3) {
        b.t += dt;
        if (b.t > 5) b.mode = 0;
      }
      g.timer -= dt;
      if (g.timer <= 0) pickGull(g);
      g.theta += (g.dir * sp * dt) / g.r;
      const lead = g.theta + g.dir * 0.5;
      tx = g.cx + Math.cos(lead) * g.r;
      tz = g.cz + Math.sin(lead) * g.r;
      ty = g.alt + Math.sin(ctx.clock.simTime * 0.21 + b.seed) * 4;
      ty = Math.max(ty, skyline.at(b.x, b.z) + 6);
    }
    const dx = tx - b.x,
      dz = tz - b.z;
    const d = Math.max(0.1, Math.hypot(dx, dz));
    const k = 1 - Math.exp(-dt * 1.4);
    b.vx += ((dx / d) * sp - b.vx) * k;
    b.vz += ((dz / d) * sp - b.vz) * k;
    b.vy += (clamp((ty - b.y) * 0.6, -3, 2.5) - b.vy) * (1 - Math.exp(-dt * 2));
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.fold = Math.max(0, b.fold - dt * 2);
    orient(b, dt, 0.09, 0.7);
    wings(b, dt, rng, 0.62, 0.05, b.mode === 3 ? 1 : 0.18, 1.2, 3.2);
    b.head = 0;
  };

  // ───────────────────── pigeons
  interface PigeonGroup {
    birds: Bird[];
    area: Rect;
    cx: number;
    cz: number;
    state: number; // 0 ground, 1 flying, 2 to roof, 3 roosted
    timer: number;
    fcx: number;
    fcz: number;
    roof: { x: number; y: number; z: number };
    name: string;
  }
  interface PigeonState {
    tx: number;
    tz: number;
    act: number; // 0 walk, 1 peck, 2 idle
    actT: number;
    theta: number;
    r: number;
    alt: number;
  }
  const pstate = new Map<Bird, PigeonState>();
  const groups: PigeonGroup[] = [];
  const blockedForPigeon = (x: number, z: number): boolean => {
    if (ctx.occupancy.has(x, z, OCC.BUILDING | OCC.SOLID | OCC.WATER)) return true;
    for (const f of plan.features) {
      if (f.radius <= 0) continue;
      const dx = f.x - x,
        dz = f.z - z;
      const r = f.radius + 0.8;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };
  const freeSpot = (area: Rect, cx: number, cz: number, rad: number): { x: number; z: number } => {
    for (let k = 0; k < 24; k++) {
      const x = clamp(cx + rng.range(-rad, rad), area.x0 + 1, area.x1 - 1);
      const z = clamp(cz + rng.range(-rad, rad), area.z0 + 1, area.z1 - 1);
      if (!blockedForPigeon(x, z)) return { x, z };
    }
    return { x: cx, z: cz };
  };
  const plazaAreas = plan.areas.filter((a) => a.kind === 'market' || (a.kind === 'plaza' && plan.blocks[a.blockId]?.kind === 'civic'));
  const extra = plan.areas.filter((a) => a.kind === 'plaza' && plan.blocks[a.blockId]?.kind === 'downtown').sort((a, b) => (b.rect.x1 - b.rect.x0) * (b.rect.z1 - b.rect.z0) - (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0));
  if (extra[0]) plazaAreas.push(extra[0]);
  const pigeonCols = [
    ['#8b909b', '#a3a8b2', '#3a3a3e'],
    ['#7d828e', '#9aa0aa', '#3a3a3e'],
    ['#9a9590', '#b5b0a8', '#3a3a3e'],
    ['#6f7480', '#8e939e', '#3a3a3e'],
    ['#c9c5bd', '#d8d4cc', '#3a3a3e'],
  ];
  for (const a of plazaAreas.slice(0, 3)) {
    const r = a.rect;
    // roof: nearest building lot
    let best = { x: (r.x0 + r.x1) / 2, y: 14, z: r.z0 - 4 };
    let bd = Infinity;
    for (const lot of plan.lots) {
      const f = lot.footprint;
      const lx = (f.x0 + f.x1) / 2,
        lz = (f.z0 + f.z1) / 2;
      const d = Math.hypot(lx - (r.x0 + r.x1) / 2, lz - (r.z0 + r.z1) / 2);
      if (d < bd && lot.height > 8 && lot.height < 40) {
        bd = d;
        best = { x: lx, y: lot.height + 1.5, z: lz };
      }
    }
    const c0 = freeSpot(r, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.4);
    const g: PigeonGroup = { birds: [], area: r, cx: c0.x, cz: c0.z, state: 0, timer: rng.range(25, 70), fcx: 0, fcz: 0, roof: best, name: plan.blocks[a.blockId]?.kind ?? 'plaza' };
    for (let i = 0; i < PIGEONS; i++) {
      const b = alloc(KIND.PIGEON, rng.range(0.46, 0.52));
      b.freq = rng.range(6.5, 8);
      b.th = rng.range(0.3, 0.55);
      const c = rng.pick(pigeonCols);
      rm.colors(b.idx, c[0], c[1], c[2]);
      rm.setShape(b.idx, 1.0, 0.15, -0.08, KIND.PIGEON);
      const s = freeSpot(r, g.cx, g.cz, 3.5);
      b.x = s.x;
      b.z = s.z;
      b.y = ground(s.x, s.z) + 0.03;
      b.yaw = rng.range(0, 6.28);
      b.fold = 1;
      b.vis = 1;
      g.birds.push(b);
      pstate.set(b, { tx: s.x, tz: s.z, act: 1, actT: rng.range(0.5, 3), theta: 0, r: 10, alt: 8 });
    }
    groups.push(g);
  }
  const pigeonGroundY = (b: Bird) => ground(b.x, b.z) + 0.02 + b.scale * 0.17;

  const startFlight = (g: PigeonGroup) => {
    g.state = 1;
    g.timer = rng.range(9, 16);
    const r = g.area;
    g.fcx = clamp(g.cx, r.x0 + 4, r.x1 - 4);
    g.fcz = clamp(g.cz, r.z0 + 4, r.z1 - 4);
    const nc = freeSpot(r, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.42);
    g.cx = nc.x;
    g.cz = nc.z;
    for (const b of g.birds) {
      const s = pstate.get(b)!;
      s.theta = Math.atan2(b.z - g.fcz, b.x - g.fcx);
      s.r = rng.range(7, 12);
      s.alt = rng.range(5, 11);
      b.vy = rng.range(2.5, 4);
      b.bout = 0;
      b.mode = 1;
      b.t = rng.range(0, 0.4); // staggered take-off
    }
  };

  const stepPigeons = (g: PigeonGroup, dt: number, act: number) => {
    // group state machine
    if (g.state === 0 || g.state === 1) {
      if (act < 0.45) {
        g.state = 2;
        for (const b of g.birds) {
          b.mode = 2;
          b.t = rng.range(0, 1.5);
          b.bout = 0;
        }
      }
    }
    if (g.state === 3) {
      if (act > 0.6) {
        // morning: flutter down from the roof
        g.state = 1;
        g.timer = rng.range(4, 7);
        g.fcx = g.cx;
        g.fcz = g.cz;
        for (const b of g.birds) {
          const s = pstate.get(b)!;
          b.x = g.roof.x + rng.range(-2, 2);
          b.y = g.roof.y;
          b.z = g.roof.z + rng.range(-2, 2);
          b.mode = 1;
          b.t = 0;
          s.theta = Math.atan2(b.z - g.fcz, b.x - g.fcx);
          s.r = rng.range(6, 10);
          s.alt = rng.range(5, 9);
        }
      } else return;
    }
    g.timer -= dt;
    if (g.state === 0 && g.timer <= 0) startFlight(g);
    if (g.state === 1 && g.timer <= 0) {
      // land
      for (const b of g.birds) if (b.mode === 1) b.mode = 3;
    }
    let allDown = true,
      allGone = true;
    for (const b of g.birds) {
      const s = pstate.get(b)!;
      if (b.mode === 0) {
        // on the ground: walk / peck / idle
        b.vis = Math.min(1, b.vis + dt * 2);
        b.fold = 1;
        b.amp = 0;
        s.actT -= dt;
        if (s.actT <= 0) {
          const roll = rng.next();
          if (roll < 0.45) {
            s.act = 0;
            const p = freeSpot(g.area, g.cx, g.cz, 3.8);
            s.tx = p.x;
            s.tz = p.z;
            s.actT = 6;
          } else if (roll < 0.85) {
            s.act = 1;
            s.actT = rng.range(1.2, 4);
          } else {
            s.act = 2;
            s.actT = rng.range(1, 3);
          }
        }
        if (s.act === 0) {
          const dx = s.tx - b.x,
            dz = s.tz - b.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.08) {
            s.act = 1;
            s.actT = rng.range(1, 3);
          } else {
            const want = Math.atan2(dx, dz);
            b.yaw += clamp(angleDiff(b.yaw, want), -dt * 5, dt * 5);
            const sp = 0.42;
            b.x += Math.sin(b.yaw) * sp * dt;
            b.z += Math.cos(b.yaw) * sp * dt;
            b.phase += dt * 15;
            b.head = 0.18 + Math.sin(b.phase) * 0.2;
          }
        } else if (s.act === 1) {
          b.phase += dt * 13;
          b.head = 0.75 + Math.max(0, Math.sin(b.phase)) * 0.55;
        } else {
          b.head *= 1 - Math.min(1, dt * 6);
          b.yaw += Math.sin(ctx.clock.simTime * 0.7 + b.seed) * dt * 0.6;
        }
        b.y = pigeonGroundY(b);
        b.pitch = 0.08;
        b.roll = 0;
        allGone = false;
        continue;
      }
      allDown = false;
      if (b.mode === 4) {
        continue;
      }
      allGone = false;
      if (b.mode !== 2) b.vis = Math.min(1, b.vis + dt * 2);
      // airborne (1 circle, 2 to roof, 3 landing)
      b.t -= dt;
      if (b.t > 0 && b.mode === 1) {
        // waiting to take off
        b.y = pigeonGroundY(b);
        continue;
      }
      let tx: number, ty: number, tz: number;
      let sp = 6.5;
      b.head = 0;
      if (b.mode === 1) {
        s.theta += (sp * dt) / s.r;
        tx = g.fcx + Math.cos(s.theta + 0.5) * s.r;
        tz = g.fcz + Math.sin(s.theta + 0.5) * s.r;
        ty = ground(b.x, b.z) + s.alt;
      } else if (b.mode === 2) {
        tx = g.roof.x + Math.sin(b.seed) * 2;
        tz = g.roof.z + Math.cos(b.seed) * 2;
        ty = g.roof.y + 1;
        const d = Math.hypot(tx - b.x, tz - b.z);
        sp = clamp(d * 0.6 + 1, 1.5, 7);
        if (d < 2 && Math.abs(ty - b.y) < 2) {
          b.vis = Math.max(0, b.vis - dt * 2);
          if (b.vis <= 0) {
            b.mode = 4;
            continue;
          }
        }
      } else {
        // landing at a spot near the new group centre
        if (s.act !== 3) {
          const p = freeSpot(g.area, g.cx, g.cz, 3.5);
          s.tx = p.x;
          s.tz = p.z;
          s.act = 3;
        }
        tx = s.tx;
        tz = s.tz;
        const d = Math.hypot(tx - b.x, tz - b.z);
        const gy = pigeonGroundY(b);
        ty = gy + Math.min(8, d * 0.5);
        sp = clamp(d * 0.9 + 0.6, 0.8, 6.5);
        if (d < 0.35 && b.y < gy + 0.4) {
          b.mode = 0;
          b.y = gy;
          b.vx = b.vy = b.vz = 0;
          s.act = 1;
          s.actT = rng.range(0.6, 2);
          continue;
        }
      }
      const dx = tx - b.x,
        dz = tz - b.z;
      const d = Math.max(0.05, Math.hypot(dx, dz));
      const k = 1 - Math.exp(-dt * 3);
      b.vx += ((dx / d) * sp - b.vx) * k;
      b.vz += ((dz / d) * sp - b.vz) * k;
      b.vy += (clamp((ty - b.y) * 1.2, -2.5, 3.5) - b.vy) * (1 - Math.exp(-dt * 4));
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const gy = pigeonGroundY(b);
      if (b.y < gy) b.y = gy;
      b.fold = Math.max(0, b.fold - dt * 4);
      orient(b, dt, 0.12, 0.8);
      wings(b, dt, rng, 0.95, 0.1, 0.75, 0.4, 1.0);
      if (b.mode === 3 && d < 3) {
        // flare before touching down
        b.ampT = 1.0;
        b.pitch = Math.max(b.pitch, 0.45);
      }
    }
    if (g.state === 1 && allDown) {
      g.state = 0;
      g.timer = rng.range(35, 110);
    }
    if (g.state === 2 && allGone) g.state = 3;
  };

  // ───────────────────── butterflies
  interface Fly {
    b: Bird;
    tx: number;
    ty: number;
    tz: number;
    rest: number;
    retarget: number;
  }
  const parkBlock = plan.blocks.find((bk) => bk.kind === 'park');
  const flyArea: Rect = parkBlock ? parkBlock.rect : { x0: -100, z0: -3, x1: -8, z1: 38 };
  const inPond = (x: number, z: number) => {
    if (!pond) return false;
    const u = (x - pond.cx) / (pond.rx + 1.5),
      v = (z - pond.cz) / (pond.rz + 1.5);
    return u * u + v * v < 1;
  };
  const flies: Fly[] = [];
  const flyCols = ['#f4d03f', '#f39c34', '#ffffff', '#fdfaf0', '#78a9e8', '#e8705a', '#f7e27a', '#c9a0e8'];
  const flyTarget = (f: Fly, near: boolean) => {
    for (let k = 0; k < 10; k++) {
      const x = near ? f.b.x + rng.range(-5, 5) : rng.range(flyArea.x0 + 2, flyArea.x1 - 2);
      const z = near ? f.b.z + rng.range(-5, 5) : rng.range(flyArea.z0 + 2, flyArea.z1 - 2);
      if (x < flyArea.x0 + 1 || x > flyArea.x1 - 1 || z < flyArea.z0 + 1 || z > flyArea.z1 - 1 || inPond(x, z)) continue;
      f.tx = x;
      f.tz = z;
      f.ty = rng.range(0.35, 2.2);
      return;
    }
  };
  for (let i = 0; i < BUTTERFLIES; i++) {
    const b = alloc(KIND.BUTTERFLY, rng.range(0.16, 0.22));
    b.freq = rng.range(5.5, 8);
    b.th = rng.range(0.75, 0.9);
    const c = rng.pick(flyCols);
    rm.colors(b.idx, '#2b2622', c, c);
    rm.setShape(b.idx, 1.0, 0.55, 0.0, KIND.BUTTERFLY);
    const f: Fly = { b, tx: 0, ty: 1, tz: 0, rest: 0, retarget: rng.range(1, 4) };
    b.x = rng.range(flyArea.x0 + 3, flyArea.x1 - 3);
    b.z = rng.range(flyArea.z0 + 3, flyArea.z1 - 3);
    if (inPond(b.x, b.z)) b.x = flyArea.x1 - 10;
    b.y = ground(b.x, b.z) + 1;
    flyTarget(f, false);
    flies.push(f);
  }
  const flyActivity = () => {
    const h = ctx.clock.hours;
    return smooth(0.55, 0.85, ctx.clock.daylight) * smooth(8.0, 9.0, h) * (1 - smooth(18.0, 19.0, h)) * (1 - smooth(0.05, 0.3, ctx.uniforms.uRain.value));
  };
  const stepFly = (f: Fly, dt: number, act: number) => {
    const b = f.b;
    const on = act > b.th - 0.75 + (b.seed % 1) * 0.2;
    b.vis += ((on ? 1 : 0) - b.vis) * Math.min(1, dt * 1.2);
    if (b.vis < 0.01 && !on) {
      b.vis = 0;
      return;
    }
    const gy = ground(b.x, b.z);
    if (f.rest > 0) {
      f.rest -= dt;
      b.y = gy + 0.12;
      b.amp = 0.35;
      b.phase += dt * 2.5;
      b.pitch = 0;
      b.roll = 0;
      return;
    }
    f.retarget -= dt;
    const dx = f.tx - b.x,
      dz = f.tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4 || f.retarget <= 0) {
      f.retarget = rng.range(1.5, 4);
      if (rng.next() < 0.18 && b.y - gy < 0.8) f.rest = rng.range(1.5, 5);
      flyTarget(f, rng.next() < 0.8);
    }
    const t = ctx.clock.simTime + b.seed;
    const sp = 1.3;
    const wob = Math.sin(t * 3.1) * 0.9 + Math.sin(t * 7.3) * 0.5;
    const hx = dx / Math.max(0.1, d),
      hz = dz / Math.max(0.1, d);
    b.vx += (hx * sp - hz * wob - b.vx) * Math.min(1, dt * 3);
    b.vz += (hz * sp + hx * wob - b.vz) * Math.min(1, dt * 3);
    const ty = gy + f.ty + Math.sin(t * 2.3) * 0.25;
    b.vy = clamp((ty - b.y) * 2 + Math.sin(t * 9) * 0.6, -1.5, 1.5);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.y < gy + 0.1) b.y = gy + 0.1;
    b.yaw = Math.atan2(b.vx, b.vz);
    b.pitch = 0.15;
    b.roll = Math.sin(t * 4.7) * 0.25;
    b.amp = 1.05;
    b.phase += dt * b.freq * Math.PI * 2;
    b.fold = 0;
  };

  // ── time jumps: put everything straight into the right state
  const timejump = () => {
    const act = activity();
    for (const f of flocks) {
      f.birds.forEach((b, i) => {
        if (act < b.th) {
          b.mode = 2;
          b.vis = 0;
        } else {
          b.mode = 0;
          b.vis = 1;
          placeFlockBird(f, b, i);
        }
      });
    }
    for (const g of gulls) {
      g.restLeft = 0;
      if (act < g.b.th) {
        g.raftX = g.nightX;
        g.raftZ = g.nightZ;
        placeGullOnWater(g);
      }
      else if (g.b.mode !== 0) {
        g.b.mode = 0;
        g.b.y = g.alt;
        g.b.fold = 0;
      }
      g.b.vis = 1;
    }
    for (const g of groups) {
      if (act < 0.45) {
        g.state = 3;
        for (const b of g.birds) {
          b.mode = 4;
          b.vis = 0;
        }
      } else {
        g.state = 0;
        g.timer = rng.range(20, 60);
        for (const b of g.birds) {
          const s = freeSpot(g.area, g.cx, g.cz, 3.5);
          b.x = s.x;
          b.z = s.z;
          b.y = pigeonGroundY(b);
          b.mode = 0;
          b.vis = 1;
          b.fold = 1;
        }
      }
    }
    const fa = flyActivity();
    for (const f of flies) f.b.vis = fa > f.b.th - 0.75 ? 1 : 0;
    for (const b of all) rm.pose(b);
    rm.commit();
  };

  rm.mesh.count = nextIdx;
  timejump();

  let acc = 0;
  return {
    mesh: rm.mesh,
    timejump,
    locate(kind, i) {
      const k = kind === 'gull' ? KIND.GULL : kind === 'pigeon' ? KIND.PIGEON : kind === 'butterfly' ? KIND.BUTTERFLY : KIND.BIRD;
      const list = all.filter((b) => b.kind === k);
      const b = list[Math.max(0, Math.min(list.length - 1, i))];
      return b ? { x: b.x, y: b.y, z: b.z } : null;
    },
    update(dt) {
      if (dt <= 0) return;
      acc = dt;
      const act = activity();
      const fa = flyActivity();
      boats = liveBoats(ctx);
      // sub-step (8x speed → dt up to 0.8 s)
      const steps = Math.min(8, Math.ceil(acc / 0.05));
      const h = acc / steps;
      for (let s = 0; s < steps; s++) {
        for (const f of flocks) stepFlock(f, h, act);
        for (const g of gulls) stepGull(g, h, act);
        for (const g of groups) stepPigeons(g, h, act);
        for (const f of flies) stepFly(f, h, fa);
      }
      for (const b of all) rm.pose(b);
      rm.commit();
    },
    stats() {
      let flying = 0,
        roosting = 0,
        perched = 0;
      for (const f of flocks)
        for (const b of f.birds) {
          if (b.mode === 2) roosting++;
          else flying++;
        }
      for (const g of gulls) {
        if (g.b.mode === 2) perched++;
        else flying++;
      }
      for (const g of groups)
        for (const b of g.birds) {
          if (b.mode === 0) perched++;
          else if (b.mode === 4) roosting++;
          else flying++;
        }
      return { birdsFlying: flying, birdsPerched: perched, birdsRoosting: roosting, butterflies: flies.filter((f) => f.b.vis > 0.05).length };
    },
    invariants() {
      const out: string[] = [];
      let bad = 0,
        under = 0;
      for (const b of all) {
        if (!Number.isFinite(b.x + b.y + b.z + b.yaw + b.pitch + b.roll)) bad++;
        if (b.vis > 0.05 && b.kind !== KIND.GULL) {
          const gy = ground(b.x, b.z);
          if (b.y < gy - 0.05) under++;
        }
      }
      if (bad) out.push(`birds: ${bad} with non-finite state`);
      if (under) out.push(`birds: ${under} below the ground`);
      for (const g of gulls) {
        const b = g.b;
        if (b.mode !== 2 && b.y < plan.water.level - 0.5) out.push(`gull ${b.idx} below the sea surface (y=${b.y.toFixed(2)})`);
      }
      return out;
    },
  };
}
