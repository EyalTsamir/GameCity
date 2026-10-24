// Small things carried by the air, only where the camera looks (they need not exist elsewhere):
//   • leaves (and the odd petal) torn from the trees around the camera focus by gusts, tumbling and
//     side-slipping as they fall with the shared wind (core/wind.ts), lying a while on the ground
//     (a strong gust skids them along), then fading — ONE instanced draw;
//   • dust motes / pollen floating in a box around the camera, lit only by forward scattering of the
//     low sun (golden hour: a glittering haze when looking towards the sun) — and moths circling the
//     street lamps nearest to the camera at night — ONE additive points draw, animated on the GPU.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { lampLights } from '../../core/lampLight';
import { gustAt, windAt } from '../../core/wind';
import { Rng } from '../../core/rng';

interface TreeLike {
  x: number;
  z: number;
  r: number;
  h: number;
}

const LEAF_COLS = ['#5f7f2f', '#6f8a35', '#7d9a3a', '#8a9a3c', '#a59a3c', '#b8933a', '#9a6a30', '#c4a040', '#6a7a32', '#8aa040'];
const PETAL_COLS = ['#f4c8d8', '#f8dfe8', '#ffffff', '#c8a8e8'];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _w = new THREE.Vector2();
const _c = new THREE.Color();
const _f = new THREE.Vector3();
const _m2 = new THREE.Matrix4();

export class Drift {
  readonly group = new THREE.Group();
  private leaves: THREE.InstancedMesh | null = null;
  private N = 0;
  // leaf state (SoA)
  private px!: Float32Array;
  private py!: Float32Array;
  private pz!: Float32Array;
  private vx!: Float32Array;
  private vy!: Float32Array;
  private vz!: Float32Array;
  private rx!: Float32Array;
  private ry!: Float32Array;
  private rz!: Float32Array;
  private wx!: Float32Array;
  private wy!: Float32Array;
  private wz!: Float32Array;
  private gy!: Float32Array;
  private age!: Float32Array;
  private rest!: Float32Array;
  private size!: Float32Array;
  private ph!: Float32Array;
  /** 0 dead, 1 falling, 2 lying */
  private st!: Uint8Array;
  private rng = new Rng('life-drift');
  private near: TreeLike[] = [];
  private refresh = 0;
  private spawnAcc = 0;
  private fx = 0;
  private fz = 0;
  live = 0;
  // sparkles
  private points: THREE.Points | null = null;
  private readonly su = {
    uWindOff: { value: new THREE.Vector3() },
    uMoteGain: { value: 0 },
    uMothGain: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uPxK: { value: 0.001 },
    uLamps: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, -100, 0, 0)) },
  };
  private lampRefresh = 0;
  private bestD = new Float32Array(12);
  private bestP = new Float32Array(36);
  private motes = 0;
  private moths = 0;

  constructor(
    private ctx: CityContext,
    private trees: readonly TreeLike[],
    opts: { leaves: number; motes: number; moths: number; butterflies?: number; bees?: number },
  ) {
    this.group.name = 'life-drift';
    this.NB = opts.butterflies ?? 0;
    this.NE = opts.bees ?? 0;
    if ((opts.leaves > 0 && trees.length) || this.NB + this.NE > 0) this.buildLeaves(trees.length ? opts.leaves : 0);
    if (opts.motes + opts.moths > 0) this.buildSparkles(opts.motes, opts.moths);
  }

  // ──────────────────────────────────────────────────────────── leaves ──
  private buildLeaves(n: number): void {
    this.N = n;
    const f = () => new Float32Array(n);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.rx = f();
    this.ry = f();
    this.rz = f();
    this.wx = f();
    this.wy = f();
    this.wz = f();
    this.gy = f();
    this.age = f();
    this.rest = f();
    this.size = f();
    this.ph = f();
    this.st = new Uint8Array(n);
    // a leaf: two triangles folded along the midrib (local +z = tip)
    const g = new THREE.BufferGeometry();
    const P = [0, 0, -0.5, 0.32, 0.06, 0.02, 0, 0, 0.5, -0.32, 0.06, 0.02];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0.15, 0.98, 0, 0, 1, 0, -0.15, 0.98, 0], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide });
    mat.name = 'life-leaves';
    const total = n + this.NB * 2 + this.NE;
    const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, total));
    mesh.name = 'life-leaves';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < total; i++) {
      mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      mesh.setColorAt(i, _c.set('#7d9a3a'));
    }
    mesh.count = total;
    this.leaves = mesh;
    this.group.add(mesh);
    this.initInsects(n);
  }

  private ground(x: number, z: number): number {
    const t = this.ctx.services.terrain as { height(x: number, z: number): number } | undefined;
    const h = t ? t.height(x, z) : this.ctx.plan.heightAt(x, z);
    return Math.max(h, this.ctx.plan.water.level);
  }

  private spawn(i: number, tr: TreeLike): void {
    const r = this.rng;
    const a = r.range(0, Math.PI * 2),
      d = Math.sqrt(r.next()) * tr.r * 0.85;
    const x = tr.x + Math.cos(a) * d,
      z = tr.z + Math.sin(a) * d;
    const g0 = this.ground(tr.x, tr.z);
    this.px[i] = x;
    this.pz[i] = z;
    this.py[i] = g0 + tr.h * r.range(0.5, 0.92);
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.rx[i] = r.range(0, 6.28);
    this.ry[i] = r.range(0, 6.28);
    this.rz[i] = r.range(0, 6.28);
    this.wx[i] = r.range(-6, 6);
    this.wy[i] = r.range(-3, 3);
    this.wz[i] = r.range(-6, 6);
    this.gy[i] = this.ground(x, z);
    this.age[i] = 0;
    this.rest[i] = r.range(5, 14);
    this.ph[i] = r.range(0, 6.28);
    const petal = r.chance(0.08);
    this.size[i] = petal ? r.range(0.035, 0.05) : r.range(0.055, 0.09);
    this.st[i] = 1;
    this.leaves!.setColorAt(i, _c.set(petal ? r.pick(PETAL_COLS) : r.pick(LEAF_COLS)).multiplyScalar(r.range(0.85, 1.1)));
    this.live++;
  }

  private kill(i: number): void {
    this.st[i] = 0;
    this.live--;
    this.leaves!.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }

  private focus(): void {
    const cam = this.ctx.services.camera as { getState?: () => { target: { x: number; z: number }; distance: number } } | undefined;
    const s = cam?.getState?.();
    if (s) {
      this.fx = s.target.x;
      this.fz = s.target.z;
    } else {
      this.ctx.camera.getWorldDirection(_f);
      this.fx = this.ctx.camera.position.x + _f.x * 30;
      this.fz = this.ctx.camera.position.z + _f.z * 30;
    }
  }

  // butterflies (2 wing instances each) and bees (1 instance) around flower patches near the camera
  private NB = 0;
  private NE = 0;
  private ins0 = 0;
  private ix!: Float32Array;
  private iy!: Float32Array;
  private iz!: Float32Array;
  private ivx!: Float32Array;
  private ivy!: Float32Array;
  private ivz!: Float32Array;
  private itx!: Float32Array;
  private ity!: Float32Array;
  private itz!: Float32Array;
  private iT!: Float32Array;
  private iph!: Float32Array;
  private iyaw!: Float32Array;
  /** 0 hidden, 1 flying, 2 resting on a flower */
  private ist!: Uint8Array;
  private ipatch!: Int16Array;
  private patches: { x: number; z: number; r: number }[] = [];
  private patchD: number[] = [];
  private insectsOn = 0;
  insectsVisible = 0;

  private lastFx = 1e9;
  private lastFz = 1e9;
  private warm = 0;

  update(dt: number): void {
    if (!this.leaves || dt <= 0) return;
    this.step(dt);
    // the camera jumped somewhere new (or the time jumped): fast-forward a few seconds of leaf fall
    if (this.warm > 0) {
      const w = this.warm;
      this.warm = 0;
      for (let t = 0; t < w; t += 0.15) this.step(0.15);
    }
  }

  /** time jump: refill the air around the camera */
  timejump(): void {
    this.warm = 8;
  }

  private step(dt: number): void {
    const leaves = this.leaves!;
    const ctx = this.ctx;
    const t = ctx.uniforms.uTime.value;
    const wind = ctx.uniforms.uWind.value;
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 1;
      const cp = ctx.camera.position;
      this.focus();
      if (Math.hypot(this.fx - this.lastFx, this.fz - this.lastFz) > 25) this.warm = 8;
      this.lastFx = this.fx;
      this.lastFz = this.fz;
      // only worth it when the camera is near the ground: leaves are invisible from the overview
      const camH = cp.y - this.ground(cp.x, cp.z);
      this.near.length = 0;
      this.patches.length = 0;
      if (camH < 40 && this.NB + this.NE > 0) {
        const gc = ctx.services.groundcover as { flowerPatches?: { x: number; z: number; r: number; density: number }[] } | undefined;
        // the flower patches closest to the camera (insects are only seen within ~20 m)
        const all = gc?.flowerPatches ?? [];
        ctx.camera.getWorldDirection(_f);
        const fl = Math.hypot(_f.x, _f.z) || 1;
        const fwdX = _f.x / fl,
          fwdZ = _f.z / fl;
        this.patchD.length = 0;
        for (let k = 0; k < all.length; k++) {
          const p = all[k];
          if (p.density < 0.15) continue;
          const dx = p.x - cp.x,
            dz = p.z - cp.z;
          let d = Math.hypot(dx, dz) - p.r;
          // prefer patches in front of the camera (insects behind it are wasted)
          if (dx * fwdX + dz * fwdZ < -p.r) d += 20;
          if (d < 28) this.patchD.push(k + Math.max(0, d) / 64);
        }
        this.patchD.sort((a, b) => (a % 1) - (b % 1));
        for (let k = 0; k < Math.min(4, this.patchD.length); k++) this.patches.push(all[Math.floor(this.patchD[k])]);
      }
      if (camH < 90) {
        for (const tr of this.trees) {
          const d1 = Math.hypot(tr.x - this.fx, tr.z - this.fz),
            d2 = Math.hypot(tr.x - cp.x, tr.z - cp.z);
          if (d1 < 40 || d2 < 30) this.near.push(tr);
          if (this.near.length > 160) break;
        }
      }
    }
    // spawn: leaves come off in gusts
    if (this.near.length) {
      const n = this.near.length;
      const gs = gustAt(this.fx, this.fz, t, wind);
      const ws = Math.hypot(wind.x, wind.y);
      // a trickle in calm air, a flurry when a gust front passes through the crowns
      const rate = Math.min(90, n * (0.03 + 1.6 * gs * gs * gs) * (0.3 + ws));
      this.spawnAcc += rate * dt;
      let guard = 0;
      while (this.spawnAcc >= 1 && guard++ < 20) {
        this.spawnAcc -= 1;
        if (this.live >= this.N) break;
        let i = -1;
        for (let k = 0; k < this.N; k++)
          if (this.st[k] === 0) {
            i = k;
            break;
          }
        if (i < 0) break;
        const tr = this.near[Math.floor(this.rng.next() * n)];
        // a calm crown sheds little: the gust at that tree decides
        if (this.rng.next() > 0.25 + 0.75 * gustAt(tr.x, tr.z, t, wind)) continue;
        this.spawn(i, tr);
      }
      if (this.spawnAcc > 5) this.spawnAcc = 5;
    }
    // integrate
    const cp = ctx.camera.position;
    const steps = dt > 0.1 ? Math.ceil(dt / 0.1) : 1;
    const h = dt / steps;
    for (let i = 0; i < this.N; i++) {
      if (this.st[i] === 0) continue;
      for (let s = 0; s < steps; s++) {
        this.age[i] += h;
        if (this.st[i] === 1) {
          windAt(this.px[i], this.pz[i], t, wind, _w);
          const hag = Math.max(0.5, this.py[i] - this.gy[i]);
          const k = 2.6 * Math.pow(hag / 10, 0.2);
          // falling leaf: pendulum side-slip + flutter, terminal fall speed ~0.8 m/s
          const sw = Math.sin(this.age[i] * 2.6 + this.ph[i]);
          const tx = _w.x * k + Math.cos(this.ph[i]) * sw * 0.9,
            tz = _w.y * k + Math.sin(this.ph[i]) * sw * 0.9;
          const ty = -0.75 + 0.2 * Math.cos(this.age[i] * 5.2 + this.ph[i]);
          const a = 1 - Math.exp(-h * 2.2);
          this.vx[i] += (tx - this.vx[i]) * a;
          this.vz[i] += (tz - this.vz[i]) * a;
          this.vy[i] += (ty - this.vy[i]) * a;
          this.px[i] += this.vx[i] * h;
          this.py[i] += this.vy[i] * h;
          this.pz[i] += this.vz[i] * h;
          this.rx[i] += this.wx[i] * h;
          this.ry[i] += this.wy[i] * h;
          this.rz[i] += this.wz[i] * h;
          if ((s & 1) === 0) this.gy[i] = this.ground(this.px[i], this.pz[i]);
          if (this.py[i] <= this.gy[i] + 0.012) {
            this.py[i] = this.gy[i] + 0.012;
            this.st[i] = 2;
            this.age[i] = 0;
            // lie flat (keep the heading)
            this.rx[i] = 0;
            this.rz[i] = this.rng.range(-0.25, 0.25);
          }
        } else {
          // lying: a strong gust skids it along the ground
          const gs = gustAt(this.px[i], this.pz[i], t, wind);
          if (gs > 0.7) {
            windAt(this.px[i], this.pz[i], t, wind, _w);
            const k = (gs - 0.7) * 2.5;
            this.px[i] += _w.x * k * h;
            this.pz[i] += _w.y * k * h;
            this.ry[i] += k * h * 3;
          }
        }
      }
      const far = Math.hypot(this.px[i] - cp.x, this.pz[i] - cp.z) > 140;
      if (far || (this.st[i] === 2 && this.age[i] > this.rest[i]) || this.age[i] > 90 || !Number.isFinite(this.px[i] + this.py[i] + this.pz[i])) {
        this.kill(i);
        continue;
      }
      let sc = this.size[i];
      if (this.st[i] === 2) sc *= Math.min(1, (this.rest[i] - this.age[i]) / 1.5);
      _e.set(this.rx[i], this.ry[i], this.rz[i]);
      _q.setFromEuler(_e);
      _p.set(this.px[i], this.py[i], this.pz[i]);
      _s.set(sc, sc, sc);
      leaves.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.stepInsects(dt);
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  }

  // ─────────────────────────────────────────────────── butterflies + bees ──
  private initInsects(base: number): void {
    const m = this.NB + this.NE;
    this.ins0 = base;
    const f = () => new Float32Array(m);
    this.ix = f();
    this.iy = f();
    this.iz = f();
    this.ivx = f();
    this.ivy = f();
    this.ivz = f();
    this.itx = f();
    this.ity = f();
    this.itz = f();
    this.iT = f();
    this.iph = f();
    this.iyaw = f();
    this.ist = new Uint8Array(m);
    this.ipatch = new Int16Array(m).fill(-1);
    const BF = ['#f4f2e8', '#f4f2e8', '#f2e08a', '#e8902e', '#7aa0e0', '#f0eee4'];
    for (let k = 0; k < this.NB; k++) {
      const c = this.rng.pick(BF);
      this.leaves!.setColorAt(base + k * 2, _c.set(c));
      this.leaves!.setColorAt(base + k * 2 + 1, _c.set(c));
      this.iph[k] = this.rng.range(0, 6.28);
    }
    for (let k = 0; k < this.NE; k++) {
      this.leaves!.setColorAt(base + this.NB * 2 + k, _c.set(this.rng.chance(0.7) ? '#b8862a' : '#3a2e1a'));
      this.iph[this.NB + k] = this.rng.range(0, 6.28);
    }
  }

  private pickFlower(k: number): void {
    const p = this.patches[this.ipatch[k]];
    const a = this.rng.range(0, Math.PI * 2),
      d = Math.sqrt(this.rng.next()) * p.r * 0.9;
    this.itx[k] = p.x + Math.cos(a) * d;
    this.itz[k] = p.z + Math.sin(a) * d;
    const bee = k >= this.NB;
    this.ity[k] = this.ground(this.itx[k], this.itz[k]) + (bee ? this.rng.range(0.25, 0.6) : this.rng.range(0.35, 1.4));
    this.iT[k] = bee ? this.rng.range(0.6, 2.2) : this.rng.range(1.5, 4.5);
  }

  private stepInsects(dt: number): void {
    const m = this.NB + this.NE;
    if (!m || !this.leaves) return;
    const ctx = this.ctx;
    const t = ctx.uniforms.uTime.value;
    const leaves = this.leaves;
    // daytime, not too windy, flowers nearby (refreshed with the tree list)
    const wind = ctx.uniforms.uWind.value;
    const on = ctx.uniforms.uDaylight.value > 0.45 && Math.hypot(wind.x, wind.y) < 1.15 && this.patches.length > 0;
    this.insectsOn += ((on ? 1 : 0) - this.insectsOn) * Math.min(1, dt * 2.5);
    let vis = 0;
    for (let k = 0; k < m; k++) {
      const bee = k >= this.NB;
      const slot = bee ? this.ins0 + this.NB * 2 + (k - this.NB) : this.ins0 + k * 2;
      if (!on || this.ipatch[k] < 0 || this.ipatch[k] >= this.patches.length) {
        if (on && this.patches.length) {
          // (re)assign to a nearby patch and appear on a flower there
          this.ipatch[k] = Math.floor(this.rng.next() * this.patches.length);
          this.pickFlower(k);
          this.ix[k] = this.itx[k];
          this.iy[k] = this.ity[k];
          this.iz[k] = this.itz[k];
          this.ist[k] = 1;
        } else {
          this.ist[k] = 0;
          leaves.setMatrixAt(slot, _m.makeScale(0, 0, 0));
          if (!bee) leaves.setMatrixAt(slot + 1, _m.makeScale(0, 0, 0));
          continue;
        }
      }
      this.iT[k] -= dt;
      if (this.ist[k] === 2) {
        // resting on a flower, wings folded up, now and then a slow open
        if (this.iT[k] <= 0) {
          this.ist[k] = 1;
          this.pickFlower(k);
        }
      } else {
        const dx = this.itx[k] - this.ix[k],
          dy = this.ity[k] - this.iy[k],
          dz = this.itz[k] - this.iz[k];
        const d = Math.hypot(dx, dy, dz);
        if (d < 0.15 || this.iT[k] <= 0) {
          if (!bee && this.rng.chance(0.35)) {
            this.ist[k] = 2;
            this.iT[k] = this.rng.range(2, 6);
            this.iy[k] = this.ground(this.ix[k], this.iz[k]) + this.rng.range(0.2, 0.5);
          } else this.pickFlower(k);
        }
        // erratic flight: seek + jitter, drifted a little by the wind
        windAt(this.ix[k], this.iz[k], t, wind, _w);
        const sp = bee ? 2.2 : 1.1;
        const jx = Math.sin(t * (bee ? 13 : 3.1) + this.iph[k] * 7) * (bee ? 1.5 : 1.2),
          jy = Math.sin(t * (bee ? 11 : 4.3) + this.iph[k] * 3) * (bee ? 0.6 : 0.9),
          jz = Math.cos(t * (bee ? 12 : 2.7) + this.iph[k] * 5) * (bee ? 1.5 : 1.2);
        const inv = 1 / Math.max(d, 0.2);
        const a = 1 - Math.exp(-dt * (bee ? 6 : 3));
        this.ivx[k] += (dx * inv * sp + jx + _w.x * 0.5 - this.ivx[k]) * a;
        this.ivy[k] += (dy * inv * sp + jy - this.ivy[k]) * a;
        this.ivz[k] += (dz * inv * sp + jz + _w.y * 0.5 - this.ivz[k]) * a;
        this.ix[k] += this.ivx[k] * dt;
        this.iy[k] += this.ivy[k] * dt;
        this.iz[k] += this.ivz[k] * dt;
        const g = this.ground(this.ix[k], this.iz[k]) + 0.12;
        if (this.iy[k] < g) this.iy[k] = g;
        const h = Math.hypot(this.ivx[k], this.ivz[k]);
        if (h > 0.05) this.iyaw[k] = Math.atan2(this.ivx[k], this.ivz[k]);
      }
      const sc = this.insectsOn * (bee ? 0.018 : 0.06);
      _p.set(this.ix[k], this.iy[k], this.iz[k]);
      if (bee) {
        _e.set(0.2, this.iyaw[k], 0);
        _q.setFromEuler(_e);
        _s.set(sc * 0.8, sc, sc * 1.2);
        leaves.setMatrixAt(slot, _m.compose(_p, _q, _s));
      } else {
        // two wings hinged on the body axis, beating (or slowly opening when resting)
        const flap = this.ist[k] === 2 ? 1.25 + 0.25 * Math.sin(t * 1.3 + this.iph[k]) : 0.15 + 1.15 * Math.abs(Math.sin(t * 9 + this.iph[k]));
        for (let w = 0; w < 2; w++) {
          const sg = w === 0 ? 1 : -1;
          _m.makeRotationY(this.iyaw[k]);
          _m2.makeRotationZ(sg * flap);
          _m.multiply(_m2);
          _m2.makeTranslation(sg * 0.32 * sc, 0, 0);
          _m.multiply(_m2);
          _m2.makeScale(sc, sc, sc * 0.8);
          _m.multiply(_m2);
          _m.setPosition(_p.x + _m.elements[12], _p.y + _m.elements[13], _p.z + _m.elements[14]);
          leaves.setMatrixAt(slot + w, _m);
        }
      }
      vis++;
    }
    this.insectsVisible = this.insectsOn > 0.05 ? vis : 0;
  }

  // ───────────────────────────────────────────────────────── sparkles ──
  private buildSparkles(motes: number, moths: number): void {
    this.motes = motes;
    this.moths = moths;
    const n = motes + moths;
    const seed = new Float32Array(n * 4);
    const r = new Rng('life-sparkles');
    for (let i = 0; i < n; i++) {
      const moth = i >= motes;
      // motes: position in the unit box; moths: lamp slot, orbit radius, phase
      if (!moth) seed.set([r.next(), r.next(), r.next(), r.next()], i * 4);
      else {
        const k = i - motes;
        seed.set([k % 12, r.range(0.25, 0.9), r.range(0, 6.283), 2 + r.next()], i * 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const u = this.ctx.uniforms;
    const mat = new THREE.ShaderMaterial({
      name: 'life-sparkles',
      uniforms: { uTime: u.uTime, ...this.su },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uWindOff;
        uniform float uMoteGain;
        uniform float uMothGain;
        uniform vec3 uSunDir;
        uniform float uPxK;
        uniform vec4 uLamps[12];
        varying float vA;
        varying float vKind;
        const float BOX = 18.0;
        void main() {
          vec3 p;
          float a;
          float size;
          if (aSeed.w < 1.5) {
            // dust mote / pollen: wraps around the camera inside a BOX³ volume, drifts with the wind
            vec3 q = aSeed.xyz * BOX + uWindOff * ( 0.6 + 0.8 * aSeed.w );
            q += vec3( sin( uTime * 0.31 + aSeed.w * 40.0 ), sin( uTime * 0.23 + aSeed.x * 30.0 ) * 0.6, cos( uTime * 0.27 + aSeed.z * 50.0 ) ) * 0.6;
            p = cameraPosition + mod( q - cameraPosition + BOX * 0.5, BOX ) - BOX * 0.5;
            vec3 v = p - cameraPosition;
            float d = length( v );
            // forward scattering of the sun: only motes between the camera and the sun light up
            float mu = dot( v / max( d, 1e-3 ), uSunDir );
            float hg = 0.4375 / pow( max( 1.5625 - 1.5 * mu, 1e-3 ), 1.5 ); // HG g=0.75 (×4π/…)
            a = uMoteGain * min( hg, 6.0 ) * smoothstep( 0.8, 2.5, d ) * ( 1.0 - smoothstep( BOX * 0.3, BOX * 0.5, d ) );
            a *= 0.5 + 0.5 * sin( uTime * ( 1.5 + aSeed.y * 3.0 ) + aSeed.z * 20.0 );
            size = 0.014 + 0.012 * aSeed.y;
            vKind = 0.0;
          } else {
            // moth around a lamp head: erratic orbit, darting in and out
            vec4 L = uLamps[ int( aSeed.x ) ];
            float t = uTime * aSeed.w + aSeed.z;
            float rr = aSeed.y * ( 0.7 + 0.3 * sin( t * 2.3 ) );
            p = L.xyz + vec3( cos( t * 1.7 ) * rr, 0.35 * sin( t * 3.1 + aSeed.z ) - 0.15, sin( t * 1.3 + 0.7 ) * rr );
            float d = length( p - cameraPosition );
            a = uMothGain * L.w * ( 1.0 - smoothstep( 25.0, 45.0, d ) );
            size = 0.02;
            vKind = 1.0;
          }
          vec4 mv = viewMatrix * vec4( p, 1.0 );
          gl_Position = projectionMatrix * mv;
          float px = size / max( -mv.z * uPxK, 1e-4 );
          // keep ≥ 1.5 px (fade the energy instead of shrinking below a pixel: no crawling)
          a *= clamp( px / 1.5, 0.0, 1.0 );
          gl_PointSize = max( px, 1.5 );
          vA = a;
          if ( a < 0.004 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunCol;
        varying float vA;
        varying float vKind;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot( c, c );
          if ( r2 > 1.0 ) discard;
          float k = ( 1.0 - r2 ) * ( 1.0 - r2 );
          vec3 col = vKind < 0.5 ? uSunCol : vec3( 1.0, 0.82, 0.55 ) * 1.6;
          gl_FragColor = vec4( col * vA * k, 1.0 );
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, mat);
    pts.name = 'life-sparkles';
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    this.points = pts;
    this.group.add(pts);
  }

  frame(realDt: number, simDt: number): void {
    if (!this.points) return;
    const ctx = this.ctx;
    const u = ctx.uniforms;
    const wind = u.uWind.value;
    // integrated drift of the air (sim time)
    const off = this.su.uWindOff.value;
    off.x += wind.x * 2.2 * simDt;
    off.z += wind.y * 2.2 * simDt;
    off.y += 0.05 * simDt;
    const h = Math.max(1, ctx.size.height * ctx.renderer.getPixelRatio());
    this.su.uPxK.value = (2 * Math.tan((ctx.camera.fov * Math.PI) / 360)) / h;
    // sun: motes show in low, warm light (strongest at golden hour, faint at noon, none at night)
    const sd = u.uSunDir.value as THREE.Vector3;
    this.su.uSunDir.value.copy(sd);
    const elev = sd.y;
    const low = Math.max(0, Math.min(1, (elev + 0.02) / 0.08)) * (1 - Math.min(1, Math.max(0, (elev - 0.15) / 0.5)) * 0.75);
    this.su.uMoteGain.value = this.motes ? 0.22 * low * u.uDaylight.value : 0;
    const sky = ctx.services.sky as { sun?: THREE.DirectionalLight } | undefined;
    if (sky?.sun) this.su.uSunCol.value.copy(sky.sun.color).multiplyScalar(Math.min(3, sky.sun.intensity) * 0.5);
    else this.su.uSunCol.value.setRGB(1, 0.85, 0.6);
    // moths: nearest lit lamps to the camera, refreshed every second
    const lights = Math.max(0, Math.min(1, u.uLights.value));
    this.su.uMothGain.value = this.moths ? 0.9 * lights * u.uNight.value : 0;
    this.lampRefresh -= realDt;
    if (this.moths && lights > 0.05 && this.lampRefresh <= 0) {
      this.lampRefresh = 1;
      const cp = ctx.camera.position;
      const bd = this.bestD,
        bp = this.bestP;
      bd.fill(Infinity);
      for (const l of lampLights()) {
        if (l.kind !== 'street' && l.kind !== 'path' && l.kind !== 'plaza') continue;
        if (l.channel) continue;
        const d = Math.hypot(l.x - cp.x, l.y - cp.y, l.z - cp.z);
        if (d > 50) continue;
        let wi = 0;
        for (let k = 1; k < 12; k++) if (bd[k] > bd[wi]) wi = k;
        if (d < bd[wi]) {
          bd[wi] = d;
          bp[wi * 3] = l.x;
          bp[wi * 3 + 1] = l.y;
          bp[wi * 3 + 2] = l.z;
        }
      }
      const L = this.su.uLamps.value;
      for (let k = 0; k < 12; k++) {
        if (Number.isFinite(bd[k])) L[k].set(bp[k * 3], bp[k * 3 + 1] - 0.15, bp[k * 3 + 2], 1);
        else L[k].set(0, -100, 0, 0);
      }
    }
  }
}
