// One dynamic mesh for every moving vehicle of the landscape (distant ships, country cars, the tractor):
// small vertex-coloured templates (front = +z, y up) transformed on the CPU each frame into a shared
// position buffer — one draw call, no per-frame allocation. Emissive vertices (windows, headlights,
// navigation lights) glow with the city's lights.

import * as THREE from 'three';

export interface FleetTemplate {
  pos: number[];
  col: number[];
  /** 0..1 emissive weight per vertex */
  emi: number[];
}

export class Fleet {
  private items: { tpl: FleetTemplate; base: number }[] = [];
  private nv = 0;
  private pos!: Float32Array;
  private attr!: THREE.BufferAttribute;
  mesh: THREE.Mesh | null = null;

  /** register an instance of a template; `tint` replaces the colour of vertices flagged by `tintMask` */
  add(tpl: FleetTemplate): number {
    this.items.push({ tpl, base: this.nv });
    this.nv += tpl.pos.length / 3;
    return this.items.length - 1;
  }

  /** build the mesh once every instance is registered; tint(i, v) may override a vertex colour */
  finish(lights: { value: number }, fog: boolean, tint?: (item: number, vertex: number, out: number[]) => boolean): THREE.Mesh {
    const nv = this.nv;
    this.pos = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const emi = new Float32Array(nv);
    const c = [0, 0, 0];
    this.items.forEach((it, k) => {
      const t = it.tpl;
      for (let i = 0; i < t.pos.length / 3; i++) {
        const o = it.base + i;
        c[0] = t.col[i * 3];
        c[1] = t.col[i * 3 + 1];
        c[2] = t.col[i * 3 + 2];
        tint?.(k, i, c);
        col[o * 3] = c[0];
        col[o * 3 + 1] = c[1];
        col[o * 3 + 2] = c[2];
        emi[o] = t.emi[i];
      }
    });
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aEmi', new THREE.BufferAttribute(emi, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 30000);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, fog, flatShading: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uLights = lights;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aEmi;\nvarying float vEmi;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmi = aEmi;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying float vEmi;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += mix(vec3(1.0, 0.8, 0.5), diffuseColor.rgb, 0.5) * vEmi * (0.08 + 2.4 * uLights);');
    };
    mat.customProgramCacheKey = () => 'th-landfleet-v1';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'land-ships'; // name kept: the water reflection pass opts it in
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
    return mesh;
  }

  /** place item k: position, yaw (model +z → (sin yaw, cos yaw)), pitch (nose up), roll (to starboard) */
  set(k: number, x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0): void {
    if (!this.pos) return; // before finish()
    const it = this.items[k];
    const src = it.tpl.pos;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    let o = it.base * 3;
    const p = this.pos;
    for (let i = 0; i < src.length; i += 3) {
      const lx = src[i],
        ly = src[i + 1],
        lz = src[i + 2];
      // pitch about the lateral axis, roll about the forward axis (small angles)
      const y1 = ly + lz * pitch + lx * roll;
      const x1 = lx - ly * roll;
      p[o] = x + x1 * cy + lz * sy;
      p[o + 1] = y + y1;
      p[o + 2] = z - x1 * sy + lz * cy;
      o += 3;
    }
  }

  commit(): void {
    if (this.attr) this.attr.needsUpdate = true;
  }
}

/** rotate a template whose front is +x into the fleet convention (front = +z) */
export function frontXtoZ(t: FleetTemplate): FleetTemplate {
  const pos = t.pos.slice();
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i],
      z = pos[i + 2];
    pos[i] = -z;
    pos[i + 2] = x;
  }
  return { pos, col: t.col, emi: t.emi };
}
