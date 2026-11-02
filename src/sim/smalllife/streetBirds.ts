// Birds of the pavement, only around the camera: sparrows round a bench or a cafe table, pigeons walking with their
// heads going, a blackbird running and stopping on a lawn, a gull on the quay. They eat, look up, shuffle along; let
// anyone come too near and the nearest goes up, the rest a moment later, off to a tree or a roof, and they come back
// when the coast is clear. Groups are planned per cell of the near-detail bubble from what stands there, so the same
// corner has the same birds when you come back; nothing exists beyond the bubble. One instanced draw, one for shadows.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import { SIDEWALK_Y } from '../../core/constants';
import { nearOf, nearRandom, type NearCell } from '../../core/nearDetail';
import { makeBlobMaterial, buildBlobGeometry } from '../pedestrians/figure';
import { KIND, makeBirdKit } from './birdBody';
import type { Movers } from './movers';

const POOL = 56;
const RADIUS = 38;
const CELL = 16;

/** per kind: size, wing beats per second in flight, how near anyone may come (m), how it gets about on foot */
const SPEC = [
  { size: 0.46, flap: 17, flush: 2.6, step: 0.12, pause: 0.5, hop: true, climb: 3.4, speed: 7.5 },
  { size: 1.0, flap: 8.5, flush: 1.25, step: 0.095, pause: 0.25, hop: false, climb: 3.0, speed: 6.5 },
  { size: 1.42, flap: 3.8, flush: 2.8, step: 0.17, pause: 1.6, hop: false, climb: 1.9, speed: 6 },
  { size: 0.72, flap: 12, flush: 3.2, step: 0.2, pause: 1.1, hop: true, climb: 3.2, speed: 8 },
];

const enum S {
  /** on the ground or a perch: eating, looking, walking */
  Down,
  /** going up and away */
  Flee,
  /** hidden in a crown or over a roof */
  Away,
  /** on the way back down */
  Back,
  /** not in use */
  Free,
}
const enum A {
  Look,
  Peck,
  Move,
  Preen,
  Shake,
  Court,
}

class Bird {
  group: Group | null = null;
  kind = 0;
  tone = [0, 0, 0, 0];
  state: S = S.Free;
  act: A = A.Look;
  actT = 0;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** where it walks to, or lands */
  tx = 0;
  tz = 0;
  ty = 0;
  pitch = 0;
  roll = 0;
  /** seconds until it follows the first one up (< 0 none) */
  alarm = -1;
  /** seconds before it starts for home */
  wait = 0;
  // pose, smoothed
  flapPh = 0;
  flapAmp = 0;
  open = 0;
  puff = 0;
  puffGoal = 0;
  head = 0;
  headGoal = 0;
  turn = 0;
  turnGoal = 0;
  thrust = 0;
  tail = 0;
  tailGoal = 0;
  legPh = 0;
  legAmp = 0;
  tuck = 0;
  fade = 0;
  /** a hop under way: seconds left, its length and height */
  hopT = 0;
  hopLen = 0;
  groundY = 0;
  phase = Math.random() * 6;
  /** height of its perch above the ground; 0 on the ground */
  perched = false;
}

interface Perch {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** half length along yaw's side */
  len: number;
}

interface Group {
  kind: number;
  count: number;
  x: number;
  z: number;
  r: number;
  seed: number;
  perch: Perch | null;
  birds: Bird[];
  on: boolean;
  /** seconds to the next time it may come back */
  backT: number;
  away: boolean;
  /** where they fled to */
  hideX: number;
  hideY: number;
  hideZ: number;
  /** another flit about */
  flitT: number;
  sinceShow: number;
  /** gathered round someone on a bench with crumbs */
  fed: boolean;
}

const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** small fast random for behaviour: nothing here has to be the same twice */
const rnd = (a: number, b: number) => a + (b - a) * Math.random();

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class StreetBirds {
  readonly birds: Bird[] = [];
  private readonly groups: Group[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private readonly blobs: THREE.InstancedMesh;
  private readonly a1: THREE.InstancedBufferAttribute;
  private readonly a2: THREE.InstancedBufferAttribute;
  private readonly a3: THREE.InstancedBufferAttribute;
  private readonly aT: THREE.InstancedBufferAttribute;
  private readonly aB: THREE.InstancedBufferAttribute;
  private readonly tGrid = new Map<number, { x: number; z: number; r: number; h: number }[]>();
  private readonly attract = new Map<number, { x: number; z: number; r: number; w: number; perch?: Perch }[]>();
  private readonly discs = new Map<number, { x: number; z: number; r: number }[]>();
  private drawn = 0;
  private flushes = 0;
  private dayK = 1;
  private readonly plazaRects: { x0: number; x1: number; z0: number; z1: number }[] = [];
  /** for tests: nobody frightens them */
  tame = false;

  constructor(
    private readonly ctx: CityContext,
    private readonly movers: Movers,
    root: THREE.Object3D,
  ) {
    const kit = makeBirdKit();
    const g = kit.geometry;
    const attr = (name: string) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.a1 = attr('iP1');
    this.a2 = attr('iP2');
    this.a3 = attr('iP3');
    this.aT = attr('iTone');
    const mesh = new THREE.InstancedMesh(g, kit.material, POOL);
    mesh.name = 'smalllife-birds';
    mesh.customDepthMaterial = kit.depth;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = ctx.quality.shadows;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false; // (the boot warm-up shows it: compiled with the rest)
    root.add(mesh);
    this.mesh = mesh;

    const bg = buildBlobGeometry();
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
    this.aB.setUsage(THREE.DynamicDrawUsage);
    bg.setAttribute('iBlobA', this.aB);
    const blobs = new THREE.InstancedMesh(bg, makeBlobMaterial(), POOL);
    blobs.name = 'smalllife-bird-blobs';
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blobs.frustumCulled = false;
    blobs.matrixAutoUpdate = false;
    blobs.count = 0;
    blobs.visible = false;
    root.add(blobs);
    this.blobs = blobs;

    for (let i = 0; i < POOL; i++) this.birds.push(new Bird());
    this.indexThePlan();
    nearOf(ctx).addCells<Group>({
      name: 'streetBirds',
      radius: RADIUS,
      cell: CELL,
      top: 5,
      make: (c) => this.plan(c),
      show: (g, on) => (on ? this.showGroup(g) : this.hideGroup(g)),
      drop: () => {},
    });
  }

  // ───────────────────────────────────────────────────────── planning ──

  private key(x: number, z: number, size: number): number {
    return (Math.floor(x / size) + 4096) * 8192 + (Math.floor(z / size) + 4096);
  }

  /** what birds gather round and where they can sit, binned once at boot */
  private indexThePlan(): void {
    const { plan } = this.ctx;
    const add = (x: number, z: number, r: number, w: number, perch?: Perch) => {
      const k = this.key(x, z, CELL);
      let l = this.attract.get(k);
      if (!l) this.attract.set(k, (l = []));
      l.push({ x, z, r, w, perch });
    };
    for (const b of plan.benches) {
      // the top of the backrest (props/furniture.ts bench): 0.3 m behind the seat spot, 0.86 up
      const bx = b.x - Math.sin(b.yaw) * 0.3,
        bz = b.z - Math.cos(b.yaw) * 0.3;
      add(b.x, b.z, 1.8, 0.9, { x: bx, y: 0.86, z: bz, yaw: b.yaw, len: 0.75 });
    }
    for (const s of plan.slots) {
      if (s.kind === 'bin') add(s.x, s.z, 1.8, 0.7);
      else if (s.kind === 'bench') add(s.x, s.z, 1.8, 0.7);
      else if (s.kind === 'busstop') add(s.x, s.z, 2.4, 0.7);
      else if (s.kind === 'newsstand') add(s.x, s.z, 2, 0.5);
    }
    const props = this.ctx.services.props as { cafes?: { x: number; z: number; tableY: number; tableR: number }[]; discs?: { x: number; z: number; r: number }[] } | undefined;
    for (const c of props?.cafes ?? []) add(c.x, c.z, 2.2, 0.8);
    for (const a of plan.areas) {
      if (a.kind === 'market' || a.kind === 'plaza') this.plazaRects.push(a.rect);
    }
    for (const d of props?.discs ?? []) {
      const k = this.key(d.x, d.z, 8);
      let l = this.discs.get(k);
      if (!l) this.discs.set(k, (l = []));
      l.push(d);
    }
    const veg = this.ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined;
    for (const t of veg?.trees ?? []) {
      if (t.h < 3.5) continue;
      // sparrows feed under the street trees
      if (this.ctx.occupancy.anyInCircle(t.x, t.z, 2.5, OCC.SIDEWALK)) add(t.x, t.z, 2.2, 0.45);
      const k = this.key(t.x, t.z, 24);
      let l = this.tGrid.get(k);
      if (!l) this.tGrid.set(k, (l = []));
      l.push(t);
    }
  }

  private blocked(x: number, z: number): boolean {
    if (this.ctx.occupancy.has(x, z, OCC.BUILDING | OCC.SOLID | OCC.WATER | OCC.RAIL | OCC.ROAD)) return true;
    const i = Math.floor(x / 8),
      j = Math.floor(z / 8);
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++) {
        const l = this.discs.get((a + 4096) * 8192 + (b + 4096));
        if (!l) continue;
        for (let k = 0; k < l.length; k++) {
          const d = l[k];
          const r = d.r * 0.8;
          if ((d.x - x) * (d.x - x) + (d.z - z) * (d.z - z) < r * r) return true;
        }
      }
    return false;
  }

  private groundY(x: number, z: number): number {
    const f = this.ctx.occupancy.get(x, z);
    if (f & OCC.ROAD) return 0.012;
    if (f & OCC.SIDEWALK) return SIDEWALK_Y;
    const t = this.ctx.services.terrain as { height(x: number, z: number): number } | undefined;
    return t ? t.height(x, z) : this.ctx.plan.heightAt(x, z);
  }

  private plan(c: NearCell): Group | null {
    const { plan, occupancy: occ } = this.ctx;
    if (c.x1 < plan.slab.x0 || c.x0 > plan.slab.x1 || c.z1 < plan.slab.z0 || c.z0 > plan.slab.z1) return null;
    const r = nearRandom(c.seed);
    // something to gather round in this cell?
    const list = this.attract.get(this.key((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, CELL));
    const lure = list && list.length ? list[Math.floor(r() * list.length)] : null;
    const u = r(),
      v = r(),
      roll = r(),
      roll2 = r(),
      roll3 = r();
    let x = lure ? lure.x + (u - 0.5) * 2 * lure.r : c.x0 + u * CELL;
    let z = lure ? lure.z + (v - 0.5) * 2 * lure.r : c.z0 + v * CELL;
    if (this.blocked(x, z)) {
      let found = false;
      for (let k = 0; k < 5 && !found; k++) {
        x = c.x0 + r() * CELL;
        z = c.z0 + r() * CELL;
        found = !this.blocked(x, z);
      }
      if (!found) return null;
    }
    const f = occ.get(x, z);
    const paved = (f & (OCC.SIDEWALK | OCC.PAVED | OCC.PATH)) !== 0;
    const nearWater = occ.anyInCircle(x, z, 5, OCC.WATER);
    let want = lure ? lure.w : paved ? 0.32 : 0.2;
    if (nearWater) want = Math.max(want, 0.3);
    if (roll > want) return null;
    let kind: number;
    if (nearWater) kind = roll2 < 0.6 ? KIND.GULL : KIND.PIGEON;
    else if (!paved) kind = roll2 < 0.45 ? KIND.BLACKBIRD : KIND.SPARROW;
    else if (this.inPlaza(x, z)) kind = roll2 < 0.55 ? KIND.PIGEON : KIND.SPARROW;
    else kind = roll2 < 0.7 ? KIND.SPARROW : KIND.PIGEON;
    const n = kind === KIND.SPARROW ? 3 + Math.floor(roll3 * 6) : kind === KIND.PIGEON ? 2 + Math.floor(roll3 * 5) : kind === KIND.GULL ? 1 + Math.floor(roll3 * 3) : 1 + Math.floor(roll3 * 1.6);
    return {
      kind,
      count: n,
      x,
      z,
      r: kind === KIND.BLACKBIRD ? 2.2 : 1.1 + n * 0.28,
      seed: c.seed,
      perch: kind === KIND.SPARROW ? (lure?.perch ?? null) : null,
      birds: [],
      on: false,
      backT: 0,
      away: false,
      hideX: x,
      hideY: 10,
      hideZ: z,
      flitT: rnd(8, 30),
      sinceShow: 0,
      fed: false,
    };
  }

  private inPlaza(x: number, z: number): boolean {
    const P = this.plazaRects;
    for (let i = 0; i < P.length; i++) if (x > P[i].x0 && x < P[i].x1 && z > P[i].z0 && z < P[i].z1) return true;
    return false;
  }

  private showGroup(g: Group): void {
    g.on = true;
    g.sinceShow = 0;
    this.groups.push(g);
    const r = nearRandom(g.seed ^ 0x5bd1e995);
    for (let i = 0; i < g.count; i++) {
      const b = this.birds.find((q) => q.state === S.Free);
      if (!b) break;
      b.group = g;
      b.kind = g.kind;
      b.tone[0] = r();
      b.tone[1] = r();
      b.tone[2] = r();
      b.tone[3] = r();
      g.birds.push(b);
      this.setDown(b, g, r);
    }
    g.away = false;
    g.backT = 0;
  }

  private hideGroup(g: Group): void {
    g.on = false;
    const i = this.groups.indexOf(g);
    if (i >= 0) {
      this.groups[i] = this.groups[this.groups.length - 1];
      this.groups.pop();
    }
    for (const b of g.birds) {
      b.state = S.Free;
      b.group = null;
    }
    g.birds.length = 0;
  }

  /** put a bird down where it belongs, as if it had been there all along */
  private setDown(b: Bird, g: Group, r: () => number): void {
    b.state = S.Down;
    b.act = A.Look;
    b.actT = r() * 2;
    b.alarm = -1;
    b.yaw = r() * 6.283;
    b.open = 0;
    b.flapAmp = 0;
    b.tuck = 0;
    b.fade = 1;
    b.pitch = 0;
    b.roll = 0;
    b.vx = b.vy = b.vz = 0;
    b.hopT = 0;
    b.puff = b.puffGoal = 0;
    b.perched = false;
    if (g.perch && r() < 0.4) {
      const p = g.perch;
      const s = (r() - 0.5) * 2 * p.len;
      b.x = p.x + Math.cos(p.yaw) * s;
      b.z = p.z - Math.sin(p.yaw) * s;
      b.groundY = b.y = p.y;
      b.perched = true;
      b.yaw = p.yaw + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.5;
    } else {
      this.spot(g, b, r);
      b.x = b.tx;
      b.z = b.tz;
      b.groundY = b.y = this.groundY(b.x, b.z);
    }
    b.tx = b.x;
    b.tz = b.z;
  }

  /** a free place in the group's patch: into b.tx, b.tz */
  private spot(g: Group, b: Bird, r: () => number = Math.random): void {
    for (let k = 0; k < 6; k++) {
      const a = r() * 6.283,
        d = Math.sqrt(r()) * g.r;
      const x = g.x + Math.cos(a) * d,
        z = g.z + Math.sin(a) * d;
      if (!this.blocked(x, z)) {
        b.tx = x;
        b.tz = z;
        return;
      }
    }
    b.tx = g.x;
    b.tz = g.z;
  }

  // ───────────────────────────────────────────────────────── behaviour ──

  /** simulation time */
  update(dt: number): void {
    if (dt <= 0) return;
    const u = this.ctx.uniforms;
    // up at dawn, gone at dusk; rain sends them in
    const want = clamp((u.uDaylight.value - 0.22) / 0.2, 0, 1) * (u.uRain.value > 0.35 ? 0 : 1);
    this.dayK += (want - this.dayK) * Math.min(1, dt * 0.5);
    this.feedT -= dt;
    if (this.feedT <= 0) {
      this.feedT = 2;
      this.serveFeeders();
    }
    const h = Math.min(dt, 0.08);
    const steps = Math.min(4, Math.ceil(dt / 0.08));
    for (let i = 0; i < this.groups.length; i++) {
      const g = this.groups[i];
      g.sinceShow += dt;
      this.stepGroup(g, dt);
      for (let k = 0; k < g.birds.length; k++) for (let s = 0; s < steps; s++) this.stepBird(g.birds[k], g, h);
    }
  }

  /** someone on a bench is throwing crumbs: the nearest flock comes over, in ones and twos, and stays round their feet */
  private feedT = 3;
  private serveFeeders(): void {
    const M = this.movers,
      F = M.feeders;
    for (let i = 0; i < this.groups.length; i++) {
      const g = this.groups[i];
      if (!g.fed) continue;
      let still = false;
      for (let k = 0; k < M.nFeeders; k++) if ((F[k * 4] - g.x) ** 2 + (F[k * 4 + 1] - g.z) ** 2 < 9) still = true;
      if (!still) g.fed = false;
    }
    for (let k = 0; k < M.nFeeders; k++) {
      // in front of them, as far out as there is room
      let x = 0,
        z = 0,
        room = false;
      for (let d = 1.4; d > 0.75 && !room; d -= 0.2) {
        x = F[k * 4] + F[k * 4 + 2] * d;
        z = F[k * 4 + 1] + F[k * 4 + 3] * d;
        room = !this.blocked(x, z);
      }
      if (!room) continue;
      let best: Group | null = null;
      let bd = 26 * 26;
      let taken = false;
      for (let i = 0; i < this.groups.length; i++) {
        const g = this.groups[i];
        const d = (g.x - x) ** 2 + (g.z - z) ** 2;
        if (g.fed && d < 9) taken = true;
        if (g.fed || g.kind === KIND.GULL || g.kind === KIND.BLACKBIRD) continue;
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (taken || !best) continue;
      best.fed = true;
      best.x = x;
      best.z = z;
      best.r = 0.55 + best.birds.length * 0.09;
      best.perch = null;
      // (a flock that has flown off comes back here, and soon)
      if (best.away) best.backT = Math.min(best.backT, rnd(1, 4));
      for (let i = 0; i < best.birds.length; i++) {
        const b = best.birds[i];
        if (b.state !== S.Down) continue;
        this.spot(best, b);
        this.shortFlight(b, b.tx, this.groundY(b.tx, b.tz), b.tz);
        b.wait = rnd(0, 7);
      }
    }
  }

  /** how close the nearest threat is to this point, relative to the flush distance, or 2 for nothing near; also which way */
  private threat = { d: 0, x: 0, z: 0 };
  private nearest(x: number, z: number, reach: number): number {
    const M = this.movers;
    const T = this.threat;
    let best = 1e9;
    if (this.tame) return (T.d = best);
    if (M.low && M.sinceCut > 1.2) {
      const dx = x - M.camX,
        dz = z - M.camZ;
      // the eye counts for more when it comes on quickly
      const d = Math.hypot(dx, dz) / (1 + Math.min(1, M.camV * 0.22));
      if (d < best) {
        best = d;
        T.x = M.camX;
        T.z = M.camZ;
      }
    }
    const P = M.people;
    for (let i = 0; i < M.nPeople; i++) {
      const dx = x - P[i * 4],
        dz = z - P[i * 4 + 1];
      if (Math.abs(dx) > reach * 2.2 || Math.abs(dz) > reach * 2.2) continue;
      const v = Math.hypot(P[i * 4 + 2], P[i * 4 + 3]);
      if (v < 0.15) continue;
      // town birds let a walker come close, a runner not; one standing still is furniture
      const d = (Math.hypot(dx, dz) * (v > 2.2 ? 0.7 : 1.45)) / reach;
      if (d * reach < best) {
        best = d * reach;
        T.x = P[i * 4];
        T.z = P[i * 4 + 1];
      }
    }
    T.d = best;
    return best;
  }

  private stepGroup(g: Group, dt: number): void {
    // coming back
    if (g.away) {
      g.backT -= dt;
      let allAway = true;
      for (let k = 0; k < g.birds.length; k++) if (g.birds[k].state !== S.Away) allAway = false;
      if (allAway && g.backT <= 0 && this.dayK > 0.5) {
        const near = this.nearest(g.x, g.z, 3.5);
        if (near > (g.fed ? 2.5 : 7)) {
          g.away = false;
          for (let k = 0; k < g.birds.length; k++) {
            const b = g.birds[k];
            b.state = S.Back;
            b.wait = rnd(0, 3.5);
            this.spot(g, b);
            b.ty = this.groundY(b.tx, b.tz);
            b.x = g.hideX + rnd(-1.2, 1.2);
            b.y = g.hideY + rnd(-0.6, 0.6);
            b.z = g.hideZ + rnd(-1.2, 1.2);
            b.fade = 0;
            b.vx = b.vy = b.vz = 0;
          }
        } else g.backT = 2.5;
      }
      return;
    }
    // out at night or in the rain: gone to roost
    if (this.dayK < 0.15) {
      this.flee(g, g.x + rnd(-1, 1), g.z + rnd(-1, 1), true);
      return;
    }
    // now and then one flits to another place, and some follow
    g.flitT -= dt;
    if (g.flitT <= 0) {
      g.flitT = rnd(9, 40);
      const b = g.birds[Math.floor(Math.random() * g.birds.length)];
      if (b && b.state === S.Down && g.kind !== KIND.GULL) {
        this.spot(g, b);
        this.shortFlight(b, b.tx, this.groundY(b.tx, b.tz), b.tz);
      }
    }
  }

  private shortFlight(b: Bird, x: number, y: number, z: number): void {
    b.state = S.Back;
    b.wait = 0;
    b.tx = x;
    b.ty = y;
    b.tz = z;
    b.vy = 2.4;
    b.perched = false;
  }

  /** the whole group goes, the nearest first, and the rest on its alarm */
  private flee(g: Group, fromX: number, fromZ: number, slow = false): void {
    if (g.away) return;
    g.away = true;
    g.backT = rnd(12, 34);
    this.flushes++;
    this.pickHide(g, fromX, fromZ);
    for (let k = 0; k < g.birds.length; k++) {
      const b = g.birds[k];
      if (b.state !== S.Down && b.state !== S.Back) continue;
      const d = Math.hypot(b.x - fromX, b.z - fromZ);
      b.alarm = slow ? rnd(0, 6) : Math.min(0.5, d * 0.07) * rnd(0.5, 1.4) + rnd(0, 0.06);
    }
  }

  /** somewhere to go: the nearest crown away from the threat, a roof, or simply away */
  private pickHide(g: Group, fromX: number, fromZ: number): void {
    let best = 1e9;
    let found = false;
    const i = Math.floor(g.x / 24),
      j = Math.floor(g.z / 24);
    const ax = g.x - fromX,
      az = g.z - fromZ;
    const al = Math.hypot(ax, az) || 1;
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++) {
        const l = this.tGrid.get((a + 4096) * 8192 + (b + 4096));
        if (!l) continue;
        for (let k = 0; k < l.length; k++) {
          const t = l[k];
          const dx = t.x - g.x,
            dz = t.z - g.z;
          const d = Math.hypot(dx, dz);
          if (d < 5 || d > 34) continue;
          // not towards whoever frightened them
          const away = (dx * ax + dz * az) / (al * (d || 1));
          const score = d - away * 10;
          if (score < best) {
            best = score;
            found = true;
            g.hideX = t.x;
            g.hideY = this.groundY(t.x, t.z) + t.h * 0.68;
            g.hideZ = t.z;
          }
        }
      }
    if (found) return;
    const { plan } = this.ctx;
    for (let k = 0; k < plan.lots.length; k++) {
      const L = plan.lots[k];
      const f = L.footprint;
      const cx = clamp(g.x, f.x0, f.x1),
        cz = clamp(g.z, f.z0, f.z1);
      const d = Math.hypot(cx - g.x, cz - g.z);
      if (d > 30 || L.height > 26) continue;
      const score = d - ((cx - g.x) * ax + (cz - g.z) * az) / (al * (d || 1)) * 10;
      if (score < best) {
        best = score;
        found = true;
        g.hideX = (cx + (f.x0 + f.x1) / 2) / 2;
        g.hideY = L.height + 1;
        g.hideZ = (cz + (f.z0 + f.z1) / 2) / 2;
      }
    }
    if (found) return;
    g.hideX = g.x + (ax / al) * 34;
    g.hideY = this.groundY(g.x, g.z) + 14;
    g.hideZ = g.z + (az / al) * 34;
  }

  private takeOff(b: Bird, g: Group): void {
    const spec = SPEC[b.kind];
    b.state = S.Flee;
    b.alarm = -1;
    b.perched = false;
    // up at once and a little away from the others, in the direction it was going to leave
    const a = Math.atan2(g.hideX - b.x, g.hideZ - b.z) + rnd(-0.9, 0.9);
    b.vx = Math.sin(a) * 1.5;
    b.vz = Math.cos(a) * 1.5;
    b.vy = spec.climb * rnd(0.85, 1.2);
    b.yaw = a;
  }

  private stepBird(b: Bird, g: Group, h: number): void {
    const spec = SPEC[b.kind];
    if (b.state === S.Down) {
      // alarmed?
      if (b.alarm >= 0) {
        b.alarm -= h;
        b.headGoal = -0.25;
        if (b.alarm < 0) this.takeOff(b, g);
      } else {
        b.phase -= h * 4;
        if (b.phase < 0) {
          b.phase = rnd(0.8, 1.2);
          // (with food about they let you come much closer)
          const flush = spec.flush * (g.fed ? 0.45 : 1);
          const near = this.nearest(b.x, b.z, flush);
          if (near < flush && g.sinceShow > 1) {
            this.flee(g, this.threat.x, this.threat.z);
            if (b.alarm < 0) b.alarm = 0;
          } else if (near < flush * 2.2 && b.act !== A.Move && !b.perched) {
            // it has seen you: head up, and a pigeon walks off rather than fly
            b.headGoal = -0.3;
            b.act = A.Look;
            b.actT = rnd(0.5, 1.2);
            b.turnGoal = clamp(angleDiff(b.yaw, Math.atan2(this.threat.x - b.x, this.threat.z - b.z)), -1.1, 1.1);
            if (b.kind === KIND.PIGEON && near < flush * 1.7) {
              const a = Math.atan2(b.x - this.threat.x, b.z - this.threat.z) + rnd(-0.6, 0.6);
              const x = b.x + Math.sin(a) * 1.2,
                z = b.z + Math.cos(a) * 1.2;
              if (!this.blocked(x, z)) {
                b.tx = x;
                b.tz = z;
                b.act = A.Move;
                b.actT = 2;
              }
            }
          }
        }
        this.stepDown(b, g, h);
      }
      b.flapAmp += (0 - b.flapAmp) * Math.min(1, h * 10);
      b.open += (0 - b.open) * Math.min(1, h * 14);
      b.tuck += (0 - b.tuck) * Math.min(1, h * 12);
      b.pitch += (0 - b.pitch) * Math.min(1, h * 8);
      b.roll += (0 - b.roll) * Math.min(1, h * 8);
      b.fade = Math.min(1, b.fade + h * 3);
    } else if (b.state === S.Flee) {
      const dx = g.hideX - b.x,
        dy = g.hideY - b.y,
        dz = g.hideZ - b.z;
      const d = Math.hypot(dx, dz);
      const k = 1 - Math.exp(-h * 2.4);
      const sp = spec.speed * clamp(d / 4, 0.35, 1);
      const wig = Math.sin(b.phase * 3 + b.tone[3] * 9) * 0.7;
      b.phase += h;
      b.vx += ((dx / (d || 1)) * sp + wig * (dz / (d || 1)) - b.vx) * k;
      b.vz += ((dz / (d || 1)) * sp - wig * (dx / (d || 1)) - b.vz) * k;
      const climb = clamp(dy * 1.1, -2.5, spec.climb);
      b.vy += (climb - b.vy) * (1 - Math.exp(-h * 3));
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      this.flyPose(b, h, spec.flap, b.vy > 0.8 ? 1.15 : 0.85);
      if (d < 1.2 && Math.abs(dy) < 1.4) {
        b.fade -= h * 3;
        if (b.fade <= 0) {
          b.fade = 0;
          b.state = S.Away;
        }
      }
    } else if (b.state === S.Back) {
      b.wait -= h;
      if (b.wait > 0) return;
      b.fade = Math.min(1, b.fade + h * 3);
      const dx = b.tx - b.x,
        dz = b.tz - b.z;
      const d = Math.hypot(dx, dz);
      const gy = b.ty;
      const sp = clamp(d * 1.1 + 0.3, 0.5, spec.speed * 0.8);
      const k = 1 - Math.exp(-h * 3);
      b.vx += ((dx / (d || 1)) * sp - b.vx) * k;
      b.vz += ((dz / (d || 1)) * sp - b.vz) * k;
      const wantY = gy + Math.min(6, d * 0.55);
      b.vy += (clamp((wantY - b.y) * 1.8, -3, 3) - b.vy) * (1 - Math.exp(-h * 5));
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      this.flyPose(b, h, spec.flap, d < 1.2 ? 1.2 : 0.8);
      if (d < 1) {
        // flare: body up, tail fanned, legs out
        b.pitch += (-0.75 - b.pitch) * Math.min(1, h * 8);
        b.tuck += (0 - b.tuck) * Math.min(1, h * 10);
      }
      if (d < 0.1 && b.y < gy + 0.1) {
        b.state = S.Down;
        b.y = b.groundY = gy;
        b.vx = b.vy = b.vz = 0;
        b.act = A.Look;
        b.actT = rnd(0.4, 1.4);
        b.tx = b.x;
        b.tz = b.z;
      }
      // something moved in while it was coming down
      if (this.nearest(b.tx, b.tz, spec.flush) < spec.flush * (g.fed ? 0.36 : 0.8) && !g.away) this.flee(g, this.threat.x, this.threat.z);
    }
  }

  private flyPose(b: Bird, h: number, flap: number, amp: number): void {
    b.flapPh += h * flap * 6.283;
    b.flapAmp += (amp - b.flapAmp) * Math.min(1, h * 16);
    b.open += (1 - b.open) * Math.min(1, h * 22);
    b.tuck += (1 - b.tuck) * Math.min(1, h * 7);
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.4) b.yaw += angleDiff(b.yaw, Math.atan2(b.vx, b.vz)) * Math.min(1, h * 6);
    const up = Math.atan2(b.vy, Math.max(0.6, sp));
    b.pitch += (-up * 0.8 - b.pitch) * Math.min(1, h * 6);
    b.headGoal = 0.1 + up * 0.5;
    b.turnGoal = 0;
    b.tailGoal = -0.15;
    b.head += (b.headGoal - b.head) * Math.min(1, h * 10);
    b.turn += (b.turnGoal - b.turn) * Math.min(1, h * 10);
    b.thrust += (0 - b.thrust) * Math.min(1, h * 10);
    b.tail += (b.tailGoal - b.tail) * Math.min(1, h * 10);
    b.legAmp += (0 - b.legAmp) * Math.min(1, h * 10);
  }

  private stepDown(b: Bird, g: Group, h: number): void {
    const spec = SPEC[b.kind];
    b.actT -= h;
    if (b.actT <= 0) this.nextAct(b, g);
    let moving = false;
    if (b.act === A.Move && !b.perched) {
      const dx = b.tx - b.x,
        dz = b.tz - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.03) {
        b.actT = 0;
      } else {
        b.yaw += clamp(angleDiff(b.yaw, Math.atan2(dx, dz)), -h * 9, h * 9);
        if (spec.hop) {
          // hops: both feet, a little arc, a beat between them
          if (b.hopT > 0) {
            const dur = b.kind === KIND.BLACKBIRD ? 0.1 : 0.13;
            const adv = Math.min(d, (b.hopLen / dur) * h);
            b.x += Math.sin(b.yaw) * adv;
            b.z += Math.cos(b.yaw) * adv;
            b.hopT -= h;
            moving = true;
          } else {
            b.legPh -= h;
            if (b.legPh < -spec.pause * rnd(0.1, 0.5)) {
              b.hopT = b.kind === KIND.BLACKBIRD ? 0.1 : 0.13;
              b.hopLen = Math.min(d, spec.step * rnd(0.7, 1.3));
              b.legPh = 0;
              if (Math.random() < 0.18) b.tailGoal = 0.55;
            }
          }
        } else {
          // a walk: the head goes forward with each step and waits for the body
          const sp = b.kind === KIND.GULL ? 0.5 : 0.42;
          b.x += Math.sin(b.yaw) * sp * h;
          b.z += Math.cos(b.yaw) * sp * h;
          b.legPh += (h * sp * 6.283) / spec.step / 2;
          moving = true;
        }
      }
      if (this.blocked(b.x + Math.sin(b.yaw) * 0.12, b.z + Math.cos(b.yaw) * 0.12)) b.actT = 0;
      const gy = this.groundY(b.x, b.z);
      b.groundY += (gy - b.groundY) * Math.min(1, h * 16);
    }
    // the body over the feet
    const hop = spec.hop && b.hopT > 0 ? Math.sin(((b.kind === KIND.BLACKBIRD ? 0.1 : 0.13) - b.hopT) * 3.14159 / (b.kind === KIND.BLACKBIRD ? 0.1 : 0.13)) : 0;
    b.y = b.groundY + hop * spec.step * 0.32 * spec.size;
    const walkAmp = spec.hop ? hop : moving ? 1 : 0;
    b.legAmp += (walkAmp - b.legAmp) * Math.min(1, h * 18);
    // head
    let thrust = 0;
    if (b.act === A.Peck) {
      // a quick stab and back, a look between
      const ph = (b.phase * 0 + b.actT * (b.kind === KIND.SPARROW ? 3.3 : 2.4)) % 1;
      const stab = ph < 0.3 ? Math.sin((ph / 0.3) * 3.14159) : 0;
      b.headGoal = 0.25 + stab * (b.kind === KIND.GULL ? 1.2 : 1.55);
      b.turnGoal = 0;
    } else if (b.act === A.Look) {
      if (Math.random() < h * (b.kind === KIND.SPARROW ? 3 : 0.9)) {
        b.turnGoal = rnd(-1.1, 1.1);
        b.headGoal = rnd(-0.28, 0.1);
      }
    } else if (b.act === A.Move) {
      b.turnGoal = 0;
      b.headGoal = b.kind === KIND.PIGEON ? 0.1 : b.kind === KIND.BLACKBIRD ? -0.15 : 0.15;
      if (b.kind === KIND.PIGEON && moving) thrust = 0.022 * Math.sin(b.legPh * 2);
    } else if (b.act === A.Preen) {
      // the bill into the shoulder
      b.headGoal = 0.75 + 0.12 * Math.sin(b.actT * 22);
      b.turnGoal = (b.tone[3] > 0.5 ? 1 : -1) * 2.0;
    } else if (b.act === A.Court) {
      // a cock pigeon: puffed up, bowing, turning about
      b.puffGoal = 1;
      b.headGoal = 0.32 + 0.5 * Math.max(0, Math.sin(b.actT * 7));
      b.tailGoal = -0.35;
      b.yaw += h * 1.4 * (b.tone[3] > 0.5 ? 1 : -1);
      b.legPh += h * 7;
      b.legAmp = Math.max(b.legAmp, 0.5);
      thrust = 0;
    }
    if (b.act === A.Shake) {
      // a shake of the feathers, wings half out for an instant
      b.puffGoal = 0.8;
      b.roll = 0.09 * Math.sin(b.actT * 45);
    } else if (b.act !== A.Court) b.puffGoal = 0;
    b.head += (b.headGoal - b.head) * Math.min(1, h * (b.act === A.Peck ? 34 : 12));
    b.turn += (b.turnGoal - b.turn) * Math.min(1, h * (b.kind === KIND.SPARROW ? 22 : 9));
    b.thrust += (thrust - b.thrust) * Math.min(1, h * 20);
    b.puff += (b.puffGoal - b.puff) * Math.min(1, h * 8);
    b.tailGoal *= 1 - Math.min(1, h * 6);
    b.tail += (b.tailGoal - b.tail) * Math.min(1, h * 22);
  }

  private nextAct(b: Bird, g: Group): void {
    const u = Math.random();
    b.perched = b.perched && b.y > b.groundY - 0.01;
    b.turnGoal = 0;
    if (b.kind === KIND.BLACKBIRD) {
      // run, stop, listen with the head on one side, stab
      if (b.act === A.Move) {
        b.act = A.Look;
        b.actT = rnd(0.8, 2.4);
        b.turnGoal = rnd(-0.9, 0.9);
        b.headGoal = 0.1;
        return;
      }
      if (u < 0.55) {
        this.spot(g, b);
        b.act = A.Move;
        b.actT = 2.5;
      } else {
        b.act = A.Peck;
        b.actT = rnd(0.6, 1.4);
      }
      return;
    }
    if (b.perched) {
      b.act = u < 0.65 ? A.Look : A.Preen;
      b.actT = rnd(0.8, 3.5);
      return;
    }
    const courting = b.kind === KIND.PIGEON && b.tone[2] > 0.6;
    if (u < 0.4) {
      b.act = A.Peck;
      b.actT = rnd(0.7, 2.6);
    } else if (u < 0.72) {
      this.spot(g, b);
      b.act = A.Move;
      b.actT = 5;
    } else if (u < 0.88) {
      b.act = A.Look;
      b.actT = rnd(0.5, 2.6);
    } else if (u < 0.94) {
      b.act = A.Preen;
      b.actT = rnd(0.8, 2);
    } else if (courting) {
      b.act = A.Court;
      b.actT = rnd(2.5, 5);
    } else {
      b.act = A.Shake;
      b.actT = 0.35;
    }
  }

  // ─────────────────────────────────────────────────────────── drawing ──

  /** per frame: write what is out */
  frame(): void {
    const mesh = this.mesh,
      A1 = this.a1.array as Float32Array,
      A2 = this.a2.array as Float32Array,
      A3 = this.a3.array as Float32Array,
      AT = this.aT.array as Float32Array,
      AB = this.aB.array as Float32Array;
    let n = 0;
    let nb = 0;
    const G = this.groups;
    for (let i = 0; i < G.length; i++) {
      const B = G[i].birds;
      for (let k = 0; k < B.length; k++) {
        const b = B[k];
        if (b.state === S.Away || b.state === S.Free || b.fade <= 0.01) continue;
        const spec = SPEC[b.kind];
        // grows in and out of its crown, not in one frame
        const sc = spec.size * b.fade * (0.94 + 0.12 * b.tone[3]);
        _e.set(b.pitch, b.yaw, b.roll, 'YXZ');
        _q.setFromEuler(_e);
        // (a pitch about the feet would swing the body: about its middle)
        _p.set(b.x, b.y, b.z);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n, _m);
        const j = n * 4;
        A1[j] = b.flapPh;
        A1[j + 1] = b.flapAmp;
        A1[j + 2] = b.open;
        A1[j + 3] = b.puff;
        A2[j] = b.head;
        A2[j + 1] = b.turn;
        A2[j + 2] = b.thrust;
        A2[j + 3] = b.tail;
        A3[j] = spec.hop ? 0 : b.legPh * 2;
        A3[j + 1] = spec.hop ? -b.legAmp : b.legAmp;
        A3[j + 2] = b.tuck;
        A3[j + 3] = b.kind;
        AT[j] = b.tone[0];
        AT[j + 1] = b.tone[1];
        AT[j + 2] = b.tone[2];
        AT[j + 3] = b.tone[3];
        n++;
        // a soft dark patch under whoever is on or just above the ground
        const hag = b.y - this.groundYFast(b);
        if (hag < 0.9 && nb < POOL) {
          const a = (1 - hag / 0.9) * 0.34 * b.fade;
          const w = (b.kind === KIND.SPARROW ? 0.17 : b.kind === KIND.BLACKBIRD ? 0.22 : b.kind === KIND.PIGEON ? 0.29 : 0.42) * (1 + hag);
          _q.setFromEuler(_e.set(0, b.yaw, 0));
          _m.compose(_p.set(b.x, this.groundYFast(b) + 0.006, b.z), _q, _s.set(w * 0.8, 1, w * 1.25));
          this.blobs.setMatrixAt(nb, _m);
          AB[nb] = a;
          nb++;
        }
      }
    }
    this.drawn = n;
    mesh.count = n;
    mesh.visible = n > 0;
    if (n > 0) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 4; i++) {
        const a = i === 0 ? this.a1 : i === 1 ? this.a2 : i === 2 ? this.a3 : this.aT;
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 4);
        a.needsUpdate = true;
      }
    }
    this.blobs.count = nb;
    this.blobs.visible = nb > 0;
    if (nb > 0) {
      this.blobs.instanceMatrix.clearUpdateRanges();
      this.blobs.instanceMatrix.addUpdateRange(0, nb * 16);
      this.blobs.instanceMatrix.needsUpdate = true;
      this.aB.clearUpdateRanges();
      this.aB.addUpdateRange(0, nb);
      this.aB.needsUpdate = true;
    }
  }

  private groundYFast(b: Bird): number {
    return b.state === S.Down ? (b.perched ? 1e3 : b.groundY) : b.ty;
  }

  /** the clock jumped: everyone back where they belong */
  timejump(): void {
    for (const g of this.groups) {
      g.away = false;
      g.backT = 0;
      g.sinceShow = 0;
      for (const b of g.birds) this.setDown(b, g, Math.random);
    }
  }

  /** for tests */
  scare(): void {
    for (const g of this.groups) this.flee(g, this.movers.camX, this.movers.camZ);
  }

  setShadows(on: boolean): void {
    this.mesh.castShadow = on;
  }

  stats(): Record<string, number> {
    let fed = 0;
    for (let i = 0; i < this.groups.length; i++) if (this.groups[i].fed) fed++;
    return { birdGroups: this.groups.length, birds: this.drawn, birdFlushes: this.flushes, birdsFed: fed, feeders: this.movers.nFeeders };
  }

  get allGroups(): readonly { kind: number; x: number; z: number; birds: readonly unknown[] }[] {
    return this.groups;
  }
}
