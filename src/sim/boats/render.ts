// Instanced rendering of the fleet (two InstancedMeshes sharing one material: big boats and
// small boats, every model a variant of its mesh's geometry), per-boat pose on the swell
// (heave / pitch / roll smoothed per hull size), frustum-compacted instance lists, navigation
// light halos, picking (oriented boxes).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { composeMatrix } from '../rail/geo';
import type { Glows } from '../rail/glows';
import { createBoatMaterials } from './material';
import { buildBigBoats, buildSmallBoats, DIMS } from './models';
import type { Boat } from './fleet';

interface Pool {
  mesh: THREE.InstancedMesh;
  a1: THREE.InstancedBufferAttribute;
  a2: THREE.InstancedBufferAttribute;
  c2: THREE.InstancedBufferAttribute;
  n: number;
}

const LIGHT_COL = ['#ff2a14', '#33ff77', '#fff4dc'];

export class BoatRenderer {
  readonly group = new THREE.Group();
  private pools: Record<'big' | 'small', Pool>;
  private m4 = new THREE.Matrix4();
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private v = new THREE.Vector3();
  private glowKind: number[] = [];
  triangles = 0;
  /** boats drawn this frame */
  drawn = 0;
  /** boats whose foam trail may be in view */
  nearView = 0;
  /** world matrices per boat id (for lights, smoke, picking) */
  readonly mats = new Map<number, THREE.Matrix4>();

  constructor(
    private ctx: CityContext,
    private glows: Glows,
    private glowBase: number,
    private glowCount: number,
    capBig: number,
    capSmall: number,
  ) {
    this.group.name = 'boats';
    const { material, depth } = createBoatMaterials(ctx.uniforms);
    const mk = (geo: THREE.BufferGeometry, cap: number, name: string): Pool => {
      this.triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const a1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      const a2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      const c2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      for (const a of [a1, a2, c2]) a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aBoat', a1);
      geo.setAttribute('aBoat2', a2);
      geo.setAttribute('aCol2', c2);
      const mesh = new THREE.InstancedMesh(geo, material, cap);
      mesh.name = name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.customDepthMaterial = depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, a1, a2, c2, n: 0 };
    };
    this.pools = { big: mk(buildBigBoats(), capBig, 'boats-big'), small: mk(buildSmallBoats(), capSmall, 'boats-small') };
    for (let i = 0; i < glowCount; i++) glows.setup(glowBase + i, '#ffffff', 0.3, 0);
  }

  /** compose each boat's world matrix (call after the pose update) */
  compose(b: Boat): THREE.Matrix4 {
    let m = this.mats.get(b.id);
    if (!m) {
      m = new THREE.Matrix4();
      this.mats.set(b.id, m);
    }
    // rowing surge: the shell pulses forward with each stroke
    const surge = b.type === 'row' && b.v > 0.3 ? 0.12 * Math.sin(b.rowPhase) : 0;
    composeMatrix(m, b.x + Math.sin(b.yaw) * surge, b.y, b.z + Math.cos(b.yaw) * surge, b.yaw, b.pitch + b.trim, b.roll + b.heel);
    return m;
  }

  update(boats: Boat[], camera: THREE.Camera, night: boolean): void {
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    this.pools.big.n = 0;
    this.pools.small.n = 0;
    this.drawn = 0;
    this.nearView = 0;
    let gi = 0;
    for (const b of boats) {
      const m = this.compose(b);
      this.sphere.center.set(b.x, b.y + 2, b.z);
      this.sphere.radius = b.dims.L * 0.5 + 40;
      if (this.frustum.intersectsSphere(this.sphere)) this.nearView++;
      else continue;
      this.sphere.radius = b.dims.L * 0.5 + (b.type === 'sail' ? 9 : 6);
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const p = this.pools[b.dims.mesh];
      if (p.n >= p.mesh.instanceMatrix.count) continue;
      const i = p.n++;
      this.drawn++;
      p.mesh.setMatrixAt(i, m);
      p.a1.setXYZW(i, b.dims.variant, b.boom, b.luff, b.rowPhase);
      p.a2.setXYZW(i, b.camber, 1, b.jib, b.sailMix);
      p.mesh.instanceColor!.setXYZ(i, b.tint.r, b.tint.g, b.tint.b);
      p.c2.setXYZ(i, b.accent.r, b.accent.g, b.accent.b);
      // navigation lights
      if (night) {
        for (const L of DIMS[b.type].lights) {
          if (gi >= this.glowCount) break;
          this.v.set(L[0], L[1], L[2]).applyMatrix4(m);
          this.slot(gi, L[3] + 1);
          this.glows.move(this.glowBase + gi, this.v.x, this.v.y, this.v.z);
          gi++;
        }
      }
    }
    for (let k = gi; k < this.glowCount; k++) this.slot(k, 0);
    for (const p of [this.pools.big, this.pools.small]) {
      p.mesh.count = p.n;
      p.mesh.visible = p.n > 0;
      if (p.n > 0) {
        p.mesh.instanceMatrix.needsUpdate = true;
        p.mesh.instanceColor!.needsUpdate = true;
        p.a1.needsUpdate = true;
        p.a2.needsUpdate = true;
        p.c2.needsUpdate = true;
        p.mesh.computeBoundingSphere();
      }
    }
  }

  /** 0 off, 1 red, 2 green, 3 white */
  private slot(k: number, kind: number): void {
    if (this.glowKind[k] === kind) return;
    this.glowKind[k] = kind;
    if (kind === 0) this.glows.intensity(this.glowBase + k, 0);
    else this.glows.setup(this.glowBase + k, LIGHT_COL[kind - 1], kind === 3 ? 0.34 : 0.3, kind === 3 ? 1.0 : 1.25, false, 0);
  }

  /** ray vs each boat's oriented box; nearest hit */
  pick(ray: THREE.Ray, boats: Boat[]): { boat: Boat; distance: number } | null {
    let best: Boat | null = null;
    let bd = Infinity;
    const inv = new THREE.Matrix4();
    const r = new THREE.Ray();
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    for (const b of boats) {
      const m = this.mats.get(b.id);
      if (!m) continue;
      inv.copy(m).invert();
      r.copy(ray).applyMatrix4(inv);
      const D = b.dims;
      const top = D.mesh === 'big' ? (b.type === 'tour' ? 2.0 : 5.5) : b.type === 'sail' ? 10 : 1.8;
      const half = b.type === 'row' ? 2.8 : D.B * 0.5;
      box.min.set(-half, -0.3, -D.L * 0.5);
      box.max.set(half, top, D.L * 0.5);
      if (!r.intersectBox(box, hit)) continue;
      hit.applyMatrix4(m);
      const d = hit.distanceTo(ray.origin);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best ? { boat: best, distance: bd } : null;
  }
}
