// Instanced rendering of the rolling stock: one InstancedMesh per car type (cab, middle,
// loco, wagon) sharing the train material; per-instance wheel angle, light role, door state,
// container load/colours. Head/tail-light halos and a headlight pool on the track are
// written into the shared rail glow batch.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { composeMatrix } from './geo';
import { createTrainMaterials, type TrainMaterials } from './trainMaterial';
import { buildEmu, buildLoco, buildWagon, EMU } from './trainModels';
import type { RailSim, CarType, Train } from './trains';
import type { Glows } from './glows';

/** instanced pools: cab and middle cars share one geometry ('emu') */
type PoolId = 'emu' | 'loco' | 'wagon';
const POOLS: PoolId[] = ['emu', 'loco', 'wagon'];
const POOL_OF: Record<CarType, PoolId> = { cab: 'emu', mid: 'emu', loco: 'loco', wagon: 'wagon' };
const CAP: Record<PoolId, number> = { emu: 10, loco: 2, wagon: 20 };

interface Pool {
  mesh: THREE.InstancedMesh;
  inst: THREE.InstancedBufferAttribute;
  inst2: THREE.InstancedBufferAttribute;
  col2: THREE.InstancedBufferAttribute;
  n: number;
}

/** local light positions (model space, +Z = model front) */
const ZF = EMU.len / 2 + 0.02;
const HEADS: Record<CarType, [number, number, number][]> = {
  cab: [
    [-0.78, 1.6, ZF],
    [0.78, 1.6, ZF],
  ],
  mid: [],
  loco: [
    [-0.83, 1.72, 8.37],
    [0.83, 1.72, 8.37],
  ],
  wagon: [],
};
const TAILS: Record<CarType, [number, number, number][]> = {
  cab: [
    [-1.08, 1.6, ZF],
    [1.08, 1.6, ZF],
  ],
  mid: [],
  loco: [],
  wagon: [
    [-1.05, 1.42, 6.6],
    [1.05, 1.42, 6.6],
  ],
};

export class TrainRenderer {
  readonly group = new THREE.Group();
  readonly mats: TrainMaterials;
  private pools = new Map<PoolId, Pool>();
  private m4 = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private glowBase: number;
  private glowCount: number;
  triangles = 0;

  constructor(
    private ctx: CityContext,
    private sim: RailSim,
    private glows: Glows,
    glowBase: number,
    clipX0: number,
    clipX1: number,
  ) {
    this.group.name = 'rail-trains';
    this.mats = createTrainMaterials(ctx.uniforms, clipX0, clipX1);
    const geos: Record<PoolId, THREE.BufferGeometry> = { emu: buildEmu(), loco: buildLoco(), wagon: buildWagon() };
    for (const type of POOLS) {
      const geo = geos[type];
      this.triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const cap = CAP[type];
      const inst = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      const inst2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      const col2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      for (const a of [inst, inst2, col2]) a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aInst', inst);
      geo.setAttribute('aInst2', inst2);
      geo.setAttribute('aCol2', col2);
      const mesh = new THREE.InstancedMesh(geo, this.mats.material, cap);
      mesh.name = `rail-${type}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.customDepthMaterial = this.mats.depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = true;
      this.group.add(mesh);
      this.pools.set(type, { mesh, inst, inst2, col2, n: 0 });
    }
    this.glowBase = glowBase;
    // 2 trains × (3 head + 2 tail + 1 pool)
    this.glowCount = 12;
    for (let i = 0; i < this.glowCount; i++) glows.setup(glowBase + i, '#ffffff', 0.5, 0, false, 0);
  }

  static glowSlots(): number {
    return 12;
  }

  private slotKind: number[] = [];
  /** configure glow slot k as 0 off, 1 head lamp, 2 tail lamp, 3 headlight pool (only on change) */
  private slot(k: number, kind: number): void {
    if (this.slotKind[k] === kind) return;
    this.slotKind[k] = kind;
    const i = this.glowBase + k;
    if (kind === 0) this.glows.intensity(i, 0);
    else if (kind === 1) this.glows.setup(i, '#fff4dc', 0.55, 1.1, false, 0.3);
    else if (kind === 2) this.glows.setup(i, '#ff2a12', 0.32, 0.9, false, 0.25);
    else this.glows.setup(i, '#ffe6b8', 4.2, 0.32, true, 0);
  }

  update(): void {
    for (const p of this.pools.values()) p.n = 0;
    let gi = 0;
    for (const tr of this.sim.trains) {
      this.sim.place(tr);
      for (let ci = 0; ci < tr.cars.length; ci++) {
        const c = tr.cars[ci];
        if (!c.visible) continue;
        const pid = POOL_OF[c.type];
        const p = this.pools.get(pid)!;
        if (p.n >= CAP[pid]) continue;
        const i = p.n++;
        // model +Z points along s (world x direction)
        const s = tr.dir * (c.flip ? -1 : 1);
        const yaw = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        // pitch: model nose (+Z end) up → negative rotation about local X
        const pitch = -s * c.pitch;
        composeMatrix(this.m4, c.x, c.y, this.ctx.plan.rail.z, yaw, pitch, c.roll);
        p.mesh.setMatrixAt(i, this.m4);
        const r = this.sim.wheelRadius(c.type);
        // wheels: forward travel along the model's +Z → positive angle; flipped cars run backwards
        const wheel = ((c.flip ? -1 : 1) * tr.dist) / r;
        // platform (doors) side in model space: world +z ↔ local −x when yaw = +π/2
        const platformSide = s > 0 ? -1 : 1;
        p.inst.setXYZW(i, wheel % (Math.PI * 2), c.role, tr.doorOpen, platformSide);
        p.inst2.setXYZW(i, c.load, c.type === 'cab' || c.type === 'mid' ? 1 : 0, c.type === 'cab' ? 1 : 0, 0);
        p.mesh.instanceColor!.setXYZ(i, c.color.r, c.color.g, c.color.b);
        p.col2.setXYZ(i, c.color2.r, c.color2.g, c.color2.b);
        // lamps → glows
        const clip0 = this.sim.opt.clipX0,
          clip1 = this.sim.opt.clipX1;
        const lights = c.role === 1 ? HEADS[c.type] : c.role === 2 ? TAILS[c.type] : [];
        for (const L of lights) {
          if (gi >= this.glowCount) break;
          this.v.set(L[0], L[1], L[2] + 0.06).applyMatrix4(this.m4);
          if (this.v.x < clip0 || this.v.x > clip1) continue;
          this.slot(gi, c.role === 1 ? 1 : 2);
          this.glows.move(this.glowBase + gi, this.v.x, this.v.y, this.v.z);
          gi++;
        }
        // headlight pool on the track ahead (night)
        if (c.role === 1 && gi < this.glowCount) {
          const ahead = c.x + s * (c.half + 7);
          if (ahead > clip0 + 3 && ahead < clip1 - 3) {
            this.slot(gi, 3);
            this.glows.move(this.glowBase + gi, ahead, this.sim.top(ahead) + 0.05, this.ctx.plan.rail.z);
            gi++;
          }
        }
      }
    }
    for (let k = gi; k < this.glowCount; k++) this.slot(k, 0);
    for (const p of this.pools.values()) {
      p.mesh.count = p.n;
      p.mesh.visible = p.n > 0;
      if (p.n > 0) {
        p.mesh.instanceMatrix.needsUpdate = true;
        p.mesh.instanceColor!.needsUpdate = true;
        p.inst.needsUpdate = true;
        p.inst2.needsUpdate = true;
        p.col2.needsUpdate = true;
        p.mesh.computeBoundingSphere();
      }
    }
  }

  /** ray pick: nearest visible car box */
  pick(ray: THREE.Ray, out: { train: Train | null; car: number; distance: number }): void {
    out.train = null;
    out.distance = Infinity;
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    const z = this.ctx.plan.rail.z;
    for (const tr of this.sim.trains) {
      tr.cars.forEach((c, ci) => {
        if (!c.visible) return;
        box.min.set(c.x - c.half, c.y + 0.3, z - 1.5);
        box.max.set(c.x + c.half, c.y + 4.3, z + 1.5);
        if (!ray.intersectBox(box, hit)) return;
        const d = hit.distanceTo(ray.origin);
        if (d < out.distance) {
          out.distance = d;
          out.train = tr;
          out.car = ci;
        }
      });
    }
  }

  get drawn(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.n;
    return n;
  }
}
