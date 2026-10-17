// Hull contact data for the water shader: up to MAX_HULLS oriented waterline footprints
// (moored cargo ship from ctx.services.harbor, every boat of ctx.services.boats.fleet), culled to
// the camera frustum each frame. The shader draws a contact shadow (occluded sky / darker water)
// and a thin lacy foam line hugging each hull, heavier at the bow and with speed.
//
// Per hull i (vec4 uniforms):
//   uHullA[i] = (x, z, sin yaw, cos yaw)          yaw: model +Z (bow) faces (sin yaw, cos yaw)
//   uHullB[i] = (half length, half beam, bow-curve start u, stern-curve start u)   u: -1 stern .. 1 bow
//   uHullC[i] = (transom width factor, speed m/s, foam strength, contact-shadow strength)

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

export const MAX_HULLS = 16;

interface ShipSvc {
  x: number;
  z: number;
  yaw: number;
  length: number;
  beam: number;
}
interface BoatLike {
  type: string;
  x: number;
  z: number;
  yaw: number;
  v: number;
  dims: { L: number; B: number };
}

/** waterline shape per boat type: [bow start u, stern start u, transom factor, foam, contact shadow] */
const SHAPE: Record<string, [number, number, number, number, number]> = {
  ferry: [0.1, -0.24, 0.82, 1.0, 1.0],
  tug: [0.1, -0.24, 0.86, 1.0, 1.0],
  tour: [0.1, -0.24, 0.9, 0.8, 0.9],
  sail: [0.1, -0.24, 0.6, 0.7, 0.75],
  motor: [0.1, -0.24, 0.86, 0.8, 0.75],
  row: [0.1, -0.24, 0.15, 0.35, 0.4],
};

export class HullContacts {
  readonly uniforms = {
    uHullA: { value: Array.from({ length: MAX_HULLS }, () => new THREE.Vector4()) },
    uHullB: { value: Array.from({ length: MAX_HULLS }, () => new THREE.Vector4(1, 1, 0.1, -0.24)) },
    uHullC: { value: Array.from({ length: MAX_HULLS }, () => new THREE.Vector4()) },
    uHullN: { value: 0 },
  };
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  count = 0;

  constructor(private ctx: CityContext) {}

  update(): void {
    const cam = this.ctx.camera;
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const U = this.uniforms;
    let n = 0;
    const push = (x: number, z: number, yaw: number, a: number, b: number, ub: number, us: number, transom: number, speed: number, foam: number, dark: number) => {
      if (n >= MAX_HULLS) return;
      this.sphere.center.set(x, -1.6, z);
      this.sphere.radius = a + 8;
      if (!this.frustum.intersectsSphere(this.sphere)) return;
      U.uHullA.value[n].set(x, z, Math.sin(yaw), Math.cos(yaw));
      U.uHullB.value[n].set(a, b, ub, us);
      U.uHullC.value[n].set(transom, speed, foam, dark);
      n++;
    };
    const ship = (this.ctx.services.harbor as { ship?: ShipSvc | null } | undefined)?.ship;
    if (ship) {
      // waterline: stern at local z -37, stem at ~+35.2; bow curve from z 15, stern curve from z -25
      const half = ship.length / 2;
      const zs = -half,
        zb = half - 1.8;
      const hl = (zb - zs) / 2,
        zc = (zb + zs) / 2;
      const cx = ship.x + Math.sin(ship.yaw) * zc,
        cz = ship.z + Math.cos(ship.yaw) * zc;
      push(cx, cz, ship.yaw, hl, ship.beam / 2, (15 - zc) / hl, (-25 - zc) / hl, 0.8, 0, 0.7, 1.2);
    }
    const boats = (this.ctx.services.boats as { fleet?: { boats: BoatLike[] } } | undefined)?.fleet?.boats;
    if (boats) {
      for (const b of boats) {
        const s = SHAPE[b.type] ?? SHAPE.motor;
        push(b.x, b.z, b.yaw, b.dims.L * 0.485, b.dims.B * 0.475, s[0], s[1], s[2], Math.abs(b.v), s[3], s[4]);
      }
    }
    U.uHullN.value = n;
    this.count = n;
  }
}
