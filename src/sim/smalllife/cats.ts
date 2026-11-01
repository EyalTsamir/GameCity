// Cats, where a town keeps them: on a garden wall in the sun, on a bench, on a doorstep. A cat sits or loafs, its tail
// tip alive; it watches whoever goes by and gives you a slow blink. Come too close and it gets up without hurry and goes
// along the wall, or down off it into the garden. Now and then it moves on by itself. At most three at a time, the nearest
// spots of the near-detail bubble, always the same cat on the same wall when you come back.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import { SIDEWALK_Y } from '../../core/constants';
import { DIR_VEC } from '../../core/geom';
import { nearOf, nearRandom, type NearCell } from '../../core/nearDetail';
import { getLayout } from '../../world/props/layout';
import { buildBlobGeometry, makeBlobMaterial } from '../pedestrians/figure';
import { SEAT_TOP } from '../pedestrians/animate';
import { makeCatKit } from './catBody';
import type { Movers } from './movers';

const POOL = 3;
const CELL = 32;
const RADIUS = 30;

const enum K {
  Wall,
  Bench,
  Door,
  Ground,
}

interface Spot {
  kind: K;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** along a wall: its ends; the top is level at y */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  coat: number;
  hash: number;
  loaf: boolean;
  cat: Cat | null;
  d2: number;
}

const enum S {
  Rest,
  Rise,
  Walk,
  Jump,
}

class Cat {
  spot: Spot | null = null;
  state: S = S.Rest;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  tx = 0;
  tz = 0;
  ty = 0;
  surfY = 0;
  onWall = false;
  sit = 1;
  loaf = 0;
  sitGoal = 1;
  loafGoal = 0;
  phase = 0;
  amp = 0;
  speed = 0.5;
  head = 0;
  pitch = 0;
  headGoal = 0;
  pitchGoal = 0;
  swish = 0.15;
  swishGoal = 0.15;
  bend = 0;
  blink = 0;
  blinkT = 2;
  blinkHold = 0;
  lookT = 0;
  moveT = 40;
  scared = false;
  jumpT = 0;
  jumpDur = 0;
  jx = 0;
  jz = 0;
  jy = 0;
  fade = 0;
  thinkT = 0;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = (a: number, b: number) => a + (b - a) * Math.random();
const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Cats {
  private readonly mesh: THREE.InstancedMesh;
  private readonly blobs: THREE.InstancedMesh;
  private readonly a1: THREE.InstancedBufferAttribute;
  private readonly a2: THREE.InstancedBufferAttribute;
  private readonly a3: THREE.InstancedBufferAttribute;
  private readonly aB: THREE.InstancedBufferAttribute;
  private readonly cats: Cat[] = [];
  private readonly spots: Spot[] = [];
  private readonly walls = new Map<number, { ax: number; az: number; bx: number; bz: number }[]>();
  private readonly benches = new Map<number, { x: number; z: number; yaw: number }[]>();
  private readonly doors = new Map<number, { x: number; z: number; nx: number; nz: number }[]>();
  private assignT = 0;
  private readonly time = { value: 0 };
  /** for tests: nothing disturbs them */
  tame = false;

  constructor(
    private readonly ctx: CityContext,
    private readonly movers: Movers,
    root: THREE.Object3D,
  ) {
    const kit = makeCatKit(this.time);
    const g = kit.geometry;
    const attr = (name: string) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.a1 = attr('iC1');
    this.a2 = attr('iC2');
    this.a3 = attr('iC3');
    const mesh = new THREE.InstancedMesh(g, kit.material, POOL);
    mesh.name = 'smalllife-cats';
    mesh.customDepthMaterial = kit.depth;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = ctx.quality.shadows;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false;
    root.add(mesh);
    this.mesh = mesh;
    const bg = buildBlobGeometry();
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
    this.aB.setUsage(THREE.DynamicDrawUsage);
    bg.setAttribute('iBlobA', this.aB);
    const blobs = new THREE.InstancedMesh(bg, makeBlobMaterial(), POOL);
    blobs.name = 'smalllife-cat-blobs';
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blobs.frustumCulled = false;
    blobs.matrixAutoUpdate = false;
    blobs.count = 0;
    blobs.visible = false;
    root.add(blobs);
    this.blobs = blobs;
    for (let i = 0; i < POOL; i++) this.cats.push(new Cat());
    this.index();
    nearOf(ctx).addCells<Spot>({
      name: 'nearCats',
      radius: RADIUS,
      cell: CELL,
      top: 5,
      make: (c) => this.plan(c),
      show: (s, on) => {
        if (on) this.spots.push(s);
        else {
          this.spots.splice(this.spots.indexOf(s), 1);
          if (s.cat) {
            s.cat.spot = null;
            s.cat = null;
          }
        }
      },
      drop: () => {},
    });
  }

  private key(x: number, z: number): number {
    return (Math.floor(x / CELL) + 4096) * 8192 + (Math.floor(z / CELL) + 4096);
  }

  private index(): void {
    const push = <T>(map: Map<number, T[]>, x: number, z: number, v: T) => {
      const k = this.key(x, z);
      let l = map.get(k);
      if (!l) map.set(k, (l = []));
      l.push(v);
    };
    for (const b of getLayout(this.ctx).borders) {
      if (b.style !== 'wall' || Math.hypot(b.bx - b.ax, b.bz - b.az) < 2.5) continue;
      push(this.walls, (b.ax + b.bx) / 2, (b.az + b.bz) / 2, { ax: b.ax, az: b.az, bx: b.bx, bz: b.bz });
    }
    for (const b of this.ctx.plan.benches) push(this.benches, b.x, b.z, { x: b.x, z: b.z, yaw: b.yaw });
    for (const L of this.ctx.plan.lots) {
      if (L.kind === 'office' || L.kind === 'tower') continue;
      for (const d of L.doors) {
        const v = DIR_VEC[d.dir];
        push(this.doors, d.x, d.z, { x: d.x, z: d.z, nx: v.x, nz: v.z });
      }
    }
  }

  private groundY(x: number, z: number): number {
    const f = this.ctx.occupancy.get(x, z);
    if (f & OCC.ROAD) return 0.012;
    if (f & OCC.SIDEWALK) return SIDEWALK_Y;
    const t = this.ctx.services.terrain as { height(x: number, z: number): number } | undefined;
    return t ? t.height(x, z) : this.ctx.plan.heightAt(x, z);
  }

  private free(x: number, z: number): boolean {
    return !this.ctx.occupancy.has(x, z, OCC.BUILDING | OCC.SOLID | OCC.WATER | OCC.RAIL | OCC.ROAD);
  }

  private plan(c: NearCell): Spot | null {
    const { plan } = this.ctx;
    if (c.x1 < plan.slab.x0 || c.x0 > plan.slab.x1 || c.z1 < plan.slab.z0 || c.z0 > plan.slab.z1) return null;
    const r = nearRandom(c.seed);
    const k = this.key((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2);
    const u = r(),
      pick = r(),
      along = r(),
      coatR = r(),
      hash = r(),
      loaf = r(),
      side = r();
    // coats by how common they are in a town
    const coat = coatR < 0.3 ? 0 : coatR < 0.48 ? 1 : coatR < 0.62 ? 2 : coatR < 0.76 ? 3 : coatR < 0.9 ? 4 : 5;
    const base = { coat, hash, loaf: loaf < 0.45, cat: null, d2: 0, ax: 0, az: 0, bx: 0, bz: 0 };
    const walls = this.walls.get(k);
    if (walls && u < 0.75) {
      const w = walls[Math.floor(pick * walls.length)];
      const L = Math.hypot(w.bx - w.ax, w.bz - w.az);
      const t = (0.7 + along * (L - 1.4)) / L;
      const x = w.ax + (w.bx - w.ax) * t,
        z = w.az + (w.bz - w.az) * t;
      const y = this.groundY(x, z) + 0.64;
      const a = Math.atan2(w.bx - w.ax, w.bz - w.az);
      return { ...base, kind: K.Wall, x, y, z, yaw: a + (side < 0.5 ? 0 : Math.PI) + (side < 0.25 || side > 0.75 ? Math.PI / 2 : 0) * 0.35, ax: w.ax, az: w.az, bx: w.bx, bz: w.bz };
    }
    const doors = this.doors.get(k);
    if (doors && u < 0.32) {
      const d = doors[Math.floor(pick * doors.length)];
      const sx = (side - 0.5) * 2.4;
      const x = d.x + d.nx * 0.55 + -d.nz * (0.75 + Math.abs(sx) * 0.2) * Math.sign(sx),
        z = d.z + d.nz * 0.55 + d.nx * (0.75 + Math.abs(sx) * 0.2) * Math.sign(sx);
      if (!this.free(x, z)) return null;
      return { ...base, kind: K.Door, x, y: this.groundY(x, z), z, yaw: Math.atan2(d.nx, d.nz) + (along - 0.5) * 1.2 };
    }
    const benches = this.benches.get(k);
    if (benches && u < 0.42) {
      const b = benches[Math.floor(pick * benches.length)];
      const s = (side - 0.5) * 1.2;
      return { ...base, kind: K.Bench, x: b.x + Math.cos(b.yaw) * s, y: this.groundY(b.x, b.z) + SEAT_TOP, z: b.z - Math.sin(b.yaw) * s, yaw: b.yaw + (along - 0.5) * 1.6, loaf: loaf < 0.7 };
    }
    return null;
  }

  private assign(): void {
    const p = this.ctx.camera.position;
    for (const s of this.spots) s.d2 = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
    this.spots.sort((a, b) => a.d2 - b.d2);
    // a free cat goes to the nearest spot without one; a far cat gives way only while out of sight behind the camera's reach
    for (let i = 0; i < this.spots.length && i < POOL; i++) {
      const s = this.spots[i];
      if (s.cat) continue;
      let c = this.cats.find((q) => q.spot === null);
      if (!c) {
        for (const q of this.cats) {
          const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
          if (d > 26 * 26 && (!c || d > (c.x - p.x) ** 2 + (c.z - p.z) ** 2)) c = q;
        }
        if (c && c.spot) c.spot.cat = null;
      }
      if (!c) continue;
      this.place(c, s);
    }
  }

  private place(c: Cat, s: Spot): void {
    c.spot = s;
    s.cat = c;
    c.state = S.Rest;
    c.x = s.x;
    c.y = c.surfY = s.y;
    c.z = s.z;
    c.yaw = s.yaw;
    c.sit = s.loaf ? 0 : 1;
    c.loaf = s.loaf ? 1 : 0;
    c.sitGoal = c.sit;
    c.loafGoal = c.loaf;
    c.amp = 0;
    c.head = c.headGoal = 0;
    c.pitch = c.pitchGoal = 0;
    c.bend = (s.hash - 0.5) * 1.2;
    c.onWall = s.kind === K.Wall;
    c.moveT = rnd(30, 110);
    c.scared = false;
    c.fade = 1;
  }

  /** simulation time */
  update(dt: number): void {
    if (dt <= 0) return;
    this.time.value = this.ctx.uniforms.uTime.value as number;
    this.assignT -= dt;
    if (this.assignT <= 0) {
      this.assignT = 0.5;
      this.assign();
    }
    const steps = Math.min(4, Math.ceil(dt / 0.05));
    const h = dt / steps;
    for (let i = 0; i < POOL; i++) {
      const c = this.cats[i];
      if (!c.spot) continue;
      for (let s = 0; s < steps; s++) this.step(c, h);
    }
  }

  private nearest = { d: 1e9, x: 0, z: 0 };

  /** who is closest to this cat, of the eye and the people walking by */
  private look(c: Cat): number {
    const M = this.movers,
      N = this.nearest;
    N.d = 1e9;
    if (this.tame) return N.d;
    if (M.low && M.sinceCut > 0.8) {
      const d = Math.hypot(c.x - M.camX, c.z - M.camZ);
      N.d = d;
      N.x = M.camX;
      N.z = M.camZ;
    }
    const P = M.people;
    for (let i = 0; i < M.nPeople; i++) {
      const d = Math.hypot(c.x - P[i * 4], c.z - P[i * 4 + 1]);
      if (d < N.d) {
        N.d = d;
        N.x = P[i * 4];
        N.z = P[i * 4 + 1];
      }
    }
    return N.d;
  }

  private step(c: Cat, h: number): void {
    const s = c.spot as Spot;
    // poses
    const rate = h * 1.6;
    c.sit += clamp(c.sitGoal - c.sit, -rate, rate);
    c.loaf += clamp(c.loafGoal - c.loaf, -rate, rate);
    c.head += (c.headGoal - c.head) * Math.min(1, h * 5);
    c.pitch += (c.pitchGoal - c.pitch) * Math.min(1, h * 5);
    c.swish += (c.swishGoal - c.swish) * Math.min(1, h * 2);
    // blinks: quick, and a long slow one for someone it has decided to tolerate
    c.blinkT -= h;
    if (c.blinkT <= 0) {
      c.blinkT = rnd(2, 7);
      c.blinkHold = this.nearest.d < 3 && Math.random() < 0.5 ? rnd(0.5, 1.1) : 0.09;
    }
    if (c.blinkHold > 0) {
      c.blinkHold -= h;
      c.blink = Math.min(1, c.blink + h * 9);
    } else c.blink = Math.max(0, c.blink - h * 7);

    c.thinkT -= h;
    const think = c.thinkT <= 0;
    if (think) c.thinkT = 0.25;

    if (c.state === S.Rest) {
      c.amp += (0 - c.amp) * Math.min(1, h * 6);
      if (think) {
        const d = this.look(c);
        const N = this.nearest;
        if (d < 8) {
          // it watches, as far as a neck goes; the tail tip says what it thinks
          const a = angleDiff(c.yaw, Math.atan2(N.x - c.x, N.z - c.z));
          c.headGoal = clamp(a, -1.45, 1.45);
          c.pitchGoal = clamp(-Math.atan2(1.2, Math.max(0.5, d)) * 0.55, -0.55, 0.1);
          c.swishGoal = d < 3 ? 0.65 : 0.35;
        } else {
          c.lookT -= 0.25;
          if (c.lookT <= 0) {
            c.lookT = rnd(1.5, 6);
            c.headGoal = Math.random() < 0.5 ? rnd(-1, 1) : 0;
            c.pitchGoal = rnd(-0.1, 0.25);
            c.swishGoal = rnd(0.08, 0.28);
          }
        }
        // too close for comfort: a bold cat lets you come nearer, a wall is safer than the ground
        const limit = (c.onWall ? 0.75 : 1.5) * (0.65 + s.hash * 0.9);
        if (d < limit) this.leave(c, N.x, N.z);
      }
      c.moveT -= h;
      if (c.moveT <= 0) {
        c.moveT = rnd(35, 120);
        if (s.kind === K.Wall || s.kind === K.Ground) this.leave(c, c.x - Math.sin(c.yaw), c.z - Math.cos(c.yaw));
        else {
          // changes position where it is
          const t = Math.random();
          c.sitGoal = t < 0.5 ? 1 : 0;
          c.loafGoal = 1 - c.sitGoal;
        }
      }
    } else if (c.state === S.Rise) {
      if (c.sit < 0.02 && c.loaf < 0.02) c.state = S.Walk;
    } else if (c.state === S.Walk) {
      const dx = c.tx - c.x,
        dz = c.tz - c.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      const off = angleDiff(c.yaw, want);
      c.yaw += clamp(off, -h * 3.2, h * 3.2);
      c.headGoal = clamp(off * 0.6, -0.6, 0.6);
      c.pitchGoal = 0.08;
      c.swishGoal = 0.22;
      const sp = Math.abs(off) > 0.9 ? c.speed * 0.25 : c.speed;
      c.amp += (Math.min(1.25, sp / 0.5) - c.amp) * Math.min(1, h * 5);
      c.x += Math.sin(c.yaw) * sp * h;
      c.z += Math.cos(c.yaw) * sp * h;
      c.phase += (sp / 0.27) * 3.14159 * h;
      if (!c.onWall) {
        const gy = this.groundY(c.x, c.z);
        c.surfY += (gy - c.surfY) * Math.min(1, h * 12);
      }
      c.y = c.surfY;
      if (d < 0.08) {
        if (c.jumpDur > 0) this.jump(c);
        else this.settle(c);
      }
    } else if (c.state === S.Jump) {
      c.jumpT += h;
      const f = Math.min(1, c.jumpT / c.jumpDur);
      c.x = c.jx + (c.tx - c.jx) * f;
      c.z = c.jz + (c.tz - c.jz) * f;
      c.y = c.jy + (c.ty - c.jy) * f + 0.28 * Math.sin(f * 3.14159);
      c.amp += (0.7 - c.amp) * Math.min(1, h * 6);
      if (f >= 1) {
        c.onWall = false;
        c.surfY = c.y = c.ty;
        c.jumpDur = 0;
        const a = c.yaw + rnd(-0.6, 0.6);
        const x = c.x + Math.sin(a) * rnd(1.5, 3.5),
          z = c.z + Math.cos(a) * rnd(1.5, 3.5);
        c.tx = this.free(x, z) ? x : c.x;
        c.tz = this.free(x, z) ? z : c.z;
        c.state = S.Walk;
      }
    }
  }

  /** gets up and goes, away from (fromX, fromZ) */
  private leave(c: Cat, fromX: number, fromZ: number): void {
    const s = c.spot as Spot;
    c.state = S.Rise;
    c.sitGoal = 0;
    c.loafGoal = 0;
    c.jumpDur = 0;
    c.speed = rnd(0.42, 0.6);
    if (c.onWall) {
      // along the wall, away; off the end of it, or down into the garden if there is no room left
      const ux = s.bx - s.ax,
        uz = s.bz - s.az;
      const L = Math.hypot(ux, uz);
      const dir = (c.x - fromX) * ux + (c.z - fromZ) * uz >= 0 ? 1 : -1;
      const t = ((c.x - s.ax) * ux + (c.z - s.az) * uz) / L;
      const room = dir > 0 ? L - t - 0.45 : t - 0.45;
      if (room > 1) {
        const go = Math.min(room, rnd(1.2, 3.5));
        c.tx = c.x + ((ux / L) * dir * go);
        c.tz = c.z + ((uz / L) * dir * go);
      } else {
        c.tx = c.x;
        c.tz = c.z;
        c.jumpDur = 0.55;
      }
    } else {
      const a = Math.atan2(c.x - fromX, c.z - fromZ) + rnd(-0.7, 0.7);
      const d = rnd(2.5, 6);
      c.speed = rnd(0.55, 0.85);
      let found = false;
      for (let k = 0; k < 5 && !found; k++) {
        const x = c.x + Math.sin(a + k * 0.5) * d,
          z = c.z + Math.cos(a + k * 0.5) * d;
        if (this.free(x, z)) {
          c.tx = x;
          c.tz = z;
          found = true;
        }
      }
      if (!found) {
        c.state = S.Rest;
        c.sitGoal = 1;
      }
      if (s.kind === K.Bench) {
        // down off the bench first
        c.tx = c.x;
        c.tz = c.z;
        c.jumpDur = 0.42;
      }
    }
  }

  private jump(c: Cat): void {
    const s = c.spot as Spot;
    // the side of the wall away from the street, or simply in front of the bench
    let nx = Math.sin(c.yaw),
      nz = Math.cos(c.yaw);
    if (s.kind === K.Wall) {
      const ux = s.bx - s.ax,
        uz = s.bz - s.az;
      const L = Math.hypot(ux, uz);
      nx = -uz / L;
      nz = ux / L;
      if (!this.free(c.x + nx * 0.9, c.z + nz * 0.9) || this.ctx.occupancy.has(c.x + nx * 0.9, c.z + nz * 0.9, OCC.SIDEWALK)) {
        nx = -nx;
        nz = -nz;
      }
    }
    const x = c.x + nx * 0.8,
      z = c.z + nz * 0.8;
    if (!this.free(x, z)) {
      c.jumpDur = 0;
      this.settle(c);
      return;
    }
    c.jx = c.x;
    c.jy = c.y;
    c.jz = c.z;
    c.tx = x;
    c.tz = z;
    c.ty = this.groundY(x, z);
    c.yaw = Math.atan2(nx, nz);
    c.jumpT = 0;
    c.state = S.Jump;
  }

  private settle(c: Cat): void {
    c.state = S.Rest;
    const t = Math.random();
    c.sitGoal = t < 0.6 ? 1 : 0;
    c.loafGoal = 1 - c.sitGoal;
    c.moveT = rnd(40, 130);
    c.lookT = 0;
  }

  /** per frame */
  frame(): void {
    const A1 = this.a1.array as Float32Array,
      A2 = this.a2.array as Float32Array,
      A3 = this.a3.array as Float32Array,
      AB = this.aB.array as Float32Array;
    let n = 0;
    for (let i = 0; i < POOL; i++) {
      const c = this.cats[i];
      const s = c.spot;
      if (!s) continue;
      _e.set(0, c.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      const sc = 0.92 + 0.16 * s.hash;
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(n, _m);
      const j = n * 4;
      A1[j] = c.phase;
      A1[j + 1] = c.amp;
      A1[j + 2] = c.sit;
      A1[j + 3] = c.loaf;
      A2[j] = c.head;
      A2[j + 1] = c.pitch;
      A2[j + 2] = c.swish;
      A2[j + 3] = c.blink;
      A3[j] = s.coat;
      A3[j + 1] = s.hash;
      A3[j + 2] = c.bend;
      A3[j + 3] = 0;
      const lying = Math.max(c.sit, c.loaf);
      const b = 0.27 + 0.1 * (1 - lying);
      _m.compose(_p.set(c.x, c.y + 0.008, c.z - 0.02), _q, _s.set(b, 1, b * 2.1));
      this.blobs.setMatrixAt(n, _m);
      AB[n] = c.state === S.Jump ? 0.1 : 0.42;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.blobs.count = n;
    this.blobs.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.blobs.instanceMatrix.needsUpdate = true;
      this.a1.needsUpdate = this.a2.needsUpdate = this.a3.needsUpdate = this.aB.needsUpdate = true;
    }
  }

  setShadows(on: boolean): void {
    this.mesh.castShadow = on;
  }

  stats(): Record<string, number> {
    return { catSpots: this.spots.length, cats: this.mesh.count };
  }

  /** for tests */
  get all(): { i: number; x: number; y: number; z: number; info: string }[] {
    return this.cats.filter((c) => c.spot).map((c, i) => ({ i, x: c.x, y: c.y, z: c.z, info: `spot ${c.spot?.kind} coat ${c.spot?.coat}` }));
  }
}
