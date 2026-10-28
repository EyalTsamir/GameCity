// Instanced rendering of all vehicles (moving + parked), plus night-time
// headlight pools on the asphalt and additive light flares.
//
// Every model kind is built at three levels of detail (models.ts) and each
// (kind, level) pair is one InstancedMesh. Per frame each vehicle is
//   * culled against the view frustum — with the radius grown by the current
//     sun/moon shadow length so cars just off-screen still cast into the view;
//   * put in the level its on-screen size calls for (camera distance, scaled by
//     the drawing-buffer height and the field of view, so a car switches only
//     when the simpler model is visually equivalent);
// and only the used part of each instance buffer is uploaded. Parked cars keep
// precomputed matrices and are just copied into the right bucket.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { glowTexture } from '../../core/gfx';
import { MODEL_KINDS, ModelKind, SPECS } from './specs';
import { buildModel, makeAtlas, BusRouteSign, MODEL_LODS } from './models';
import { createVehicleMaterial } from './vehicleMaterial';
import { TrafficSim, Vehicle, St } from './sim';

export interface ParkedCar {
  model: ModelKind;
  variant: number;
  color: string;
  x: number;
  z: number;
  yaw: number;
  /** two-wheelers on the pavement: lean on the stand / lying on the side (rad), height, card label */
  roll?: number;
  y?: number;
  label?: string;
}

const MOVING_CAP: Record<ModelKind, number> = { compact: 70, hatch: 80, sedan: 90, suv: 60, delivery: 40, lorry: 30, bus: 10, icecream: 4, bike: 70, moto: 70 };
const ROAD_Y = 0.012;
/** beyond this camera distance a car popping in/out is a sub-4-pixel event */
const POP_DIST = 290;
/**
 * Camera distances (m) where a vehicle switches to the next simpler level, for the
 * reference view (930 px tall drawing buffer, 32° vertical fov): level 0 inside
 * ~62 m (a car ≥ 115 px long), level 1 out to ~150 m (≥ 47 px), level 2 beyond.
 */
const LOD_DIST = [62, 150];
const REF_HEIGHT = 930;
const REF_TAN = Math.tan((32 * Math.PI) / 360);
/** cap on how far (m) a vehicle's shadow can reach into the view from off-screen */
const MAX_SHADOW_REACH = 26;

/** one InstancedMesh: a model kind at one level of detail */
interface Layer {
  mesh: THREE.InstancedMesh;
  a1: THREE.InstancedBufferAttribute;
  a2: THREE.InstancedBufferAttribute;
  tris: number;
  n: number;
}

export class VehicleRenderer {
  readonly group = new THREE.Group();
  /** [model index][level] */
  private layers: Layer[][] = [];
  readonly parked: ParkedCar[];
  /** parked cars: model index, precomputed instance data */
  private pModel: Int32Array;
  private pMat: Float32Array;
  private pA1: Float32Array;
  private pA2: Float32Array;
  private pCol: Float32Array;
  private pools: THREE.InstancedMesh;
  private poolMat: THREE.MeshBasicMaterial;
  private flares: THREE.Points;
  private flareMat: THREE.PointsMaterial;
  private flarePos: Float32Array;
  private flareCol: Float32Array;
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private eul = new THREE.Euler(0, 0, 0, 'YXZ');
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private colorCache = new Map<string, THREE.Color>();
  private maxPools: number;
  private maxFlares: number;
  /** instances per level drawn last frame, and their triangles (main pass) */
  readonly lodCounts = [0, 0, 0];
  triangles = 0;
  drawn = 0;

  constructor(
    private ctx: CityContext,
    private sim: TrafficSim,
    parked: ParkedCar[],
  ) {
    this.parked = parked;
    this.group.name = 'traffic';
    const signs: BusRouteSign[] = ctx.roads.busRoutes.map((r, i) => ({
      number: String(i + 1),
      text: i === 0 ? 'Station · Beach' : i === 1 ? 'Westbrook · River' : r.name,
      color: r.color,
    }));
    const atlas = makeAtlas(signs);
    const { material, depth, detail } = createVehicleMaterial(ctx.uniforms, atlas);
    this.detail = detail.value;
    const q = ctx.debug.params;
    this.detailOff = [q.has('nocarinterior'), q.has('nopanelgaps'), q.has('novehiclewear')];

    MODEL_KINDS.forEach((kind) => {
      const cap = parked.filter((p) => p.model === kind).length + MOVING_CAP[kind];
      const row: Layer[] = [];
      for (let lod = 0; lod < MODEL_LODS; lod++) {
        const geo = buildModel(kind, lod);
        const a1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        const a2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        a1.setUsage(THREE.DynamicDrawUsage);
        a2.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aInst', a1);
        geo.setAttribute('aInst2', a2);
        const mesh = new THREE.InstancedMesh(geo, material, cap);
        mesh.name = `traffic-${kind}-lod${lod}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // culled per instance in frame()
        mesh.customDepthMaterial = depth;
        mesh.count = 0;
        mesh.visible = false;
        row.push({ mesh, a1, a2, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3, n: 0 });
        this.group.add(mesh);
      }
      this.layers.push(row);
    });

    // parked instances: static data computed once
    const P = parked.length;
    this.pModel = new Int32Array(P);
    this.pMat = new Float32Array(P * 16);
    this.pA1 = new Float32Array(P * 4);
    this.pA2 = new Float32Array(P * 4);
    this.pCol = new Float32Array(P * 3);
    parked.forEach((p, i) => {
      this.pModel[i] = MODEL_KINDS.indexOf(p.model);
      this.eul.set(0, p.yaw, p.roll ?? 0);
      this.q.setFromEuler(this.eul);
      this.pos.set(p.x, p.y ?? ROAD_Y + 0.005, p.z);
      this.m4.compose(this.pos, this.q, this.scl);
      this.m4.toArray(this.pMat, i * 16);
      const c = this.colorOf(p.color);
      this.pCol[i * 3] = c.r;
      this.pCol[i * 3 + 1] = c.g;
      this.pCol[i * 3 + 2] = c.b;
      this.pA1.set([0, 0, (p.x * 7.13) % 6.28, 0], i * 4);
      // phase (plates, wear, dents, roof box) from a hash of the position: the old linear mix of x and z gave
      // neighbours along an east-west row nearly the same phase (5.5 m × 0.37 ≈ 2.03 → +0.03), hence twin cars
      const hp = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453;
      this.pA2.set([p.variant, 0, hp - Math.floor(hp), 0], i * 4);
    });

    // headlight pools + tail glows on the road (night only)
    this.maxPools = 260;
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: true,
    });
    this.pools = new THREE.InstancedMesh(poolGeo, this.poolMat, this.maxPools);
    this.pools.name = 'traffic-light-pools';
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 2;
    this.pools.setColorAt(0, this.col.set('#ffffff'));
    this.pools.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.pools.count = 0;
    this.pools.visible = false;
    this.group.add(this.pools);

    // point-sprite flares at the lamps (night only)
    this.maxFlares = 4 * 260;
    this.flarePos = new Float32Array(this.maxFlares * 3);
    this.flareCol = new Float32Array(this.maxFlares * 3);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.flarePos, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setAttribute('color', new THREE.BufferAttribute(this.flareCol, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setDrawRange(0, 0);
    this.flareMat = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: true,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.flares = new THREE.Points(fg, this.flareMat);
    this.flares.name = 'traffic-flares';
    this.flares.frustumCulled = false;
    this.flares.renderOrder = 3;
    this.flares.visible = false;
    this.group.add(this.flares);

    ctx.scene.add(this.group);
    // "visible" for spawning purposes: on screen and close enough that a pop-in would be noticed
    sim.isVisible = (x, z, r) => {
      this.sphere.center.set(x, 1.5, z);
      this.sphere.radius = r;
      if (!this.frustum.intersectsSphere(this.sphere)) return false;
      const c = this.ctx.camera.position;
      return (c.x - x) ** 2 + (c.y - 1.5) ** 2 + (c.z - z) ** 2 < POP_DIST * POP_DIST;
    };
    this.updateFrustum();
  }

  private colorOf(hex: string): THREE.Color {
    let c = this.colorCache.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colorCache.set(hex, c);
    }
    return c;
  }

  private updateFrustum(): void {
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    this.projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
  }

  /** how far (m) a shadow can fall per metre of caster height (current sun or moon) */
  private shadowReachPerM(): number {
    const clk = this.ctx.clock;
    const L = clk.sunDir.y > 0.02 ? clk.sunDir : clk.moonDir;
    const s = Math.max(0.12, L.y);
    return Math.sqrt(1 - s * s) / s;
  }

  /** squared camera distances where the level changes, for the current viewport / fov */
  private lodLimits(out: number[]): void {
    const cam = this.ctx.camera;
    const h = Math.max(200, this.ctx.size.height * this.ctx.renderer.getPixelRatio());
    const k = (h / REF_HEIGHT) * (REF_TAN / Math.tan((cam.fov * Math.PI) / 360));
    out[0] = (LOD_DIST[0] * k) ** 2;
    out[1] = (LOD_DIST[1] * k) ** 2;
  }
  private lim = [0, 0];
  /** close-up detail switches (vehicleMaterial.ts uVehDetail: interior, panel lines, wear) */
  private detail: THREE.Vector4;
  private detailOff: boolean[];

  /** the layer (model mi, level for squared camera distance d2) a new instance goes to; null when full */
  private slot(mi: number, d2: number): Layer | null {
    const lod = d2 < this.lim[0] ? 0 : d2 < this.lim[1] ? 1 : 2;
    const L = this.layers[mi][lod];
    if (L.n >= L.mesh.instanceMatrix.count) return null;
    this.lodCounts[lod]++;
    return L;
  }

  /** per-frame: poses → instance buffers */
  frame(realDt: number): void {
    this.updateFrustum();
    this.lodLimits(this.lim);
    // tiers: the ray-traced cabin is skipped on low; panel lines and wear are a few ALU everywhere
    const off = this.detailOff;
    this.detail.set(off[0] || this.ctx.quality.level === 'low' ? 0 : 1, off[1] ? 0 : 1, off[2] ? 0 : 1, 0);
    const sim = this.sim;
    const night = this.ctx.uniforms.uLights.value;
    const k = 1 - Math.exp(-Math.min(realDt, 0.1) * 7);
    const kb = 1 - Math.exp(-Math.min(realDt, 0.1) * 14);
    for (const row of this.layers) for (const L of row) L.n = 0;
    this.lodCounts[0] = this.lodCounts[1] = this.lodCounts[2] = 0;
    const reach = this.ctx.renderer.shadowMap.enabled ? this.shadowReachPerM() : 0;
    const cp = this.ctx.camera.position;
    const showLights = night > 0.02;
    let np = 0,
      nf = 0;
    const poolCol = this.col;
    for (const V of sim.vehicles) {
      sim.computePose(V);
      const sp = V.spec;
      // body pitch (braking dips the nose) and roll (lean out of turns)
      let pitchT = Math.max(-0.035, Math.min(0.035, -V.a * 0.0085));
      let rollT = Math.max(-0.045, Math.min(0.045, ((V.v * V.v) / sp.wheelbase) * Math.tan(V.steer) * 0.011));
      if (V.dwell > 0) {
        rollT = -0.022; // the bus kneels towards the kerb
        pitchT = 0;
      }
      if (V.twoWheel) {
        // two-wheelers lean into turns (curvature from the heading change per metre ridden); stopped,
        // the rider has a foot down and the bike tips a little to the left
        const ds = V.odo - V.lastOdo;
        if (ds > 0.04 || ds < 0) {
          let dy = V.yaw - V.lastYaw;
          dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
          const kap = ds > 0 ? Math.max(-0.5, Math.min(0.5, dy / ds)) : 0;
          V.kappa += (kap - V.kappa) * Math.min(1, ds * 0.9);
          V.lastOdo = V.odo;
          V.lastYaw = V.yaw;
        }
        rollT = V.v < 0.35 ? -0.1 : -Math.atan((V.v * V.v * V.kappa) / 9.81);
        rollT = Math.max(-0.5, Math.min(0.5, rollT));
        pitchT *= 0.3;
        V.lean += (rollT - V.lean) * k;
        V.roll = V.lean;
      }
      V.pitch += (pitchT - V.pitch) * k;
      if (!V.twoWheel) V.roll += (rollT - V.roll) * k;
      const braking = V.a < -0.6 || (V.v < 0.25 && V.status !== St.Cruise) || V.dwell > 0;
      V.brakeVis += ((braking ? 1 : 0) - V.brakeVis) * kb;
      this.sphere.center.set(V.x, 1.5, V.z);
      this.sphere.radius = sp.len / 2 + 1;
      V.onScreen = this.frustum.intersectsSphere(this.sphere);
      const d2 = (cp.x - V.x) ** 2 + (cp.y - 1) ** 2 + (cp.z - V.z) ** 2;
      V.visible = V.onScreen && (cp.x - V.x) ** 2 + cp.y * cp.y + (cp.z - V.z) ** 2 < POP_DIST * POP_DIST;

      // draw it if it is in view, or its shadow may reach into the view
      let draw = V.onScreen;
      if (!draw && reach > 0) {
        this.sphere.radius += Math.min(MAX_SHADOW_REACH, sp.height * reach);
        draw = this.frustum.intersectsSphere(this.sphere);
      }
      const L = draw ? this.slot(sp.modelIndex, d2) : null;
      if (L) {
        const idx = L.n++;
        this.eul.set(V.pitch, V.yaw, V.roll);
        this.q.setFromEuler(this.eul);
        this.pos.set(V.x, ROAD_Y, V.z);
        this.m4.compose(this.pos, this.q, this.scl);
        L.mesh.setMatrixAt(idx, this.m4);
        L.mesh.setColorAt(idx, this.colorOf(V.color));
        L.a1.setXYZW(idx, V.brakeVis, this.blinker(V), (V.odo / sp.wheelR) % (Math.PI * 2), V.steer);
        L.a2.setXYZW(idx, V.variant, V.twoWheel ? V.crank : V.siren, V.phase, 1);
      }

      if (showLights && V.onScreen) {
        const fx = Math.sin(V.yaw),
          fz = Math.cos(V.yaw);
        const rx = Math.cos(V.yaw),
          rz = -Math.sin(V.yaw);
        const hl = sp.len / 2;
        if (np + 2 <= this.maxPools) {
          // headlight pool ahead
          const L = V.spec.model === 'bus' ? 9 : 7.5,
            W = sp.width * 1.9;
          this.eul.set(0, V.yaw, 0);
          this.q.setFromEuler(this.eul);
          this.pos.set(V.x + fx * (hl + L * 0.42), 0.03, V.z + fz * (hl + L * 0.42));
          this.scl.set(W, 1, L);
          this.m4.compose(this.pos, this.q, this.scl);
          this.pools.setMatrixAt(np, this.m4);
          poolCol.setRGB(1.0, 0.82, 0.55);
          this.pools.setColorAt(np, poolCol);
          np++;
          // red glow behind (pool texture is brightest at local -Z → turn it round)
          const tl = 1.6 + V.brakeVis * 0.8;
          this.eul.set(0, V.yaw + Math.PI, 0);
          this.q.setFromEuler(this.eul);
          this.pos.set(V.x - fx * (hl + tl * 0.38), 0.03, V.z - fz * (hl + tl * 0.38));
          this.scl.set(sp.width * 1.3, 1, tl);
          this.m4.compose(this.pos, this.q, this.scl);
          this.pools.setMatrixAt(np, this.m4);
          const r = 0.35 + V.brakeVis * 0.55;
          poolCol.setRGB(r, r * 0.06, r * 0.04);
          this.pools.setColorAt(np, poolCol);
          np++;
          this.scl.set(1, 1, 1);
        }
        if (nf + 4 <= this.maxFlares) {
          const hy = V.twoWheel ? 0.92 : sp.model === 'bus' ? 0.8 : sp.model === 'lorry' || sp.model === 'delivery' ? 0.72 : sp.model === 'suv' ? 0.92 : 0.72;
          const hx = V.twoWheel ? 0 : sp.width / 2 - 0.3;
          for (let side = 1; side >= (V.twoWheel ? 1 : -1); side -= 2) {
            let o = nf * 3;
            this.flarePos[o] = V.x + fx * (hl + 0.05) + rx * hx * side;
            this.flarePos[o + 1] = hy;
            this.flarePos[o + 2] = V.z + fz * (hl + 0.05) + rz * hx * side;
            this.flareCol[o] = 1.0;
            this.flareCol[o + 1] = 0.88;
            this.flareCol[o + 2] = 0.66;
            nf++;
            o = nf * 3;
            const b = 0.45 + V.brakeVis * 0.8;
            this.flarePos[o] = V.x - fx * (hl + 0.05) + rx * hx * side;
            this.flarePos[o + 1] = hy + 0.02;
            this.flarePos[o + 2] = V.z - fz * (hl + 0.05) + rz * hx * side;
            this.flareCol[o] = b;
            this.flareCol[o + 1] = b * 0.08;
            this.flareCol[o + 2] = b * 0.05;
            nf++;
          }
        }
      }
    }

    // parked cars: precomputed instance data, culled + bucketed like the rest
    const parked = this.parked;
    const pReach = reach > 0 ? Math.min(MAX_SHADOW_REACH, 1.75 * reach) : 0;
    for (let i = 0; i < parked.length; i++) {
      const p = parked[i];
      this.sphere.center.set(p.x, 1.2, p.z);
      this.sphere.radius = 3.4 + pReach;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const d2 = (cp.x - p.x) ** 2 + (cp.y - 1) ** 2 + (cp.z - p.z) ** 2;
      const L = this.slot(this.pModel[i], d2);
      if (!L) continue;
      const idx = L.n++;
      (L.mesh.instanceMatrix.array as Float32Array).set(this.pMat.subarray(i * 16, i * 16 + 16), idx * 16);
      (L.mesh.instanceColor!.array as Float32Array).set(this.pCol.subarray(i * 3, i * 3 + 3), idx * 3);
      (L.a1.array as Float32Array).set(this.pA1.subarray(i * 4, i * 4 + 4), idx * 4);
      (L.a2.array as Float32Array).set(this.pA2.subarray(i * 4, i * 4 + 4), idx * 4);
    }

    // upload only the used range of each layer
    let tris = 0,
      drawn = 0;
    for (const row of this.layers)
      for (const L of row) {
        const n = L.n;
        L.mesh.count = n;
        L.mesh.visible = n > 0;
        if (n === 0) continue;
        tris += n * L.tris;
        drawn += n;
        for (const a of [L.mesh.instanceMatrix, L.mesh.instanceColor!, L.a1, L.a2]) {
          a.clearUpdateRanges();
          a.addUpdateRange(0, n * a.itemSize);
          a.needsUpdate = true;
        }
      }
    this.triangles = tris;
    this.drawn = drawn;

    // night extras
    this.pools.visible = showLights && np > 0;
    this.pools.count = np;
    this.poolMat.opacity = 0.42 * night;
    if (np > 0) {
      for (const a of [this.pools.instanceMatrix, this.pools.instanceColor!]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, np * a.itemSize);
        a.needsUpdate = true;
      }
    }
    this.flares.visible = showLights && nf > 0;
    this.flareMat.opacity = 0.85 * night;
    const fg = this.flares.geometry;
    fg.setDrawRange(0, nf);
    if (nf > 0) {
      for (const name of ['position', 'color']) {
        const a = fg.attributes[name] as THREE.BufferAttribute;
        a.clearUpdateRanges();
        a.addUpdateRange(0, nf * 3);
        a.needsUpdate = true;
      }
    }
  }

  private blinker(V: Vehicle): number {
    if (V.progT > 45) return 3;
    if (V.departBlink > 0) return 1;
    const sim = this.sim;
    if (V.elem >= sim.NL) {
      const t = sim.movs[V.elem - sim.NL].turn;
      return t === 'left' ? 1 : t === 'right' ? 2 : 0;
    }
    if (V.m1 >= 0 && sim.elemLen[V.elem] - V.s < 32) {
      const t = sim.movs[V.m1].turn;
      return t === 'left' ? 1 : t === 'right' ? 2 : 0;
    }
    return 0;
  }

  /** debug: a static showroom row of every model/variant (?tlineup), one block per level of detail (?tlineup=lods) */
  addLineup(x0: number, z0: number, allLods = false): void {
    const items: { kind: ModelKind; variant: number; color: string; brake?: number; blink?: number; siren?: number }[] = [
      { kind: 'compact', variant: 0, color: '#e63946' },
      { kind: 'compact', variant: 0, color: '#9fd3c4', brake: 1 },
      { kind: 'hatch', variant: 0, color: '#f4a261', blink: 1 },
      { kind: 'sedan', variant: 0, color: '#457b9d' },
      { kind: 'sedan', variant: 1, color: '#f5c518' },
      { kind: 'sedan', variant: 2, color: '#f7f7f4', siren: 1 },
      { kind: 'suv', variant: 0, color: '#2a9d8f' },
      { kind: 'delivery', variant: 0, color: '#f4f2ec' },
      { kind: 'delivery', variant: 1, color: '#e63946' },
      { kind: 'delivery', variant: 2, color: '#457b9d' },
      { kind: 'delivery', variant: 3, color: '#2a9d8f' },
      { kind: 'lorry', variant: 0, color: '#e9c46a' },
      { kind: 'lorry', variant: 1, color: '#457b9d' },
      { kind: 'bus', variant: 0, color: this.ctx.roads.busRoutes[0]?.color ?? '#d94a3d' },
      { kind: 'bus', variant: 1, color: this.ctx.roads.busRoutes[1]?.color ?? '#2f6fd0' },
      { kind: 'icecream', variant: 0, color: '#f6b8cf' },
    ];
    for (let lod = 0; lod < (allLods ? MODEL_LODS : 1); lod++) {
      let x = x0;
      let z = z0 + lod * 28;
      items.forEach((it, i) => {
        const src = this.layers[MODEL_KINDS.indexOf(it.kind)][lod].mesh;
        const geo = src.geometry.clone();
        const a1 = new THREE.InstancedBufferAttribute(new Float32Array([it.brake ?? 0, it.blink ?? 0, 0.3, 0]), 4);
        const a2 = new THREE.InstancedBufferAttribute(new Float32Array([it.variant, it.siren ?? 0, (0.07 + i * 0.381) % 1, 1]), 4);
        geo.setAttribute('aInst', a1);
        geo.setAttribute('aInst2', a2);
        const mesh = new THREE.InstancedMesh(geo, src.material, 1);
        const sp = SPECS[it.kind];
        if (x + sp.width > x0 + 34) {
          x = x0;
          z += 13;
        }
        this.eul.set(0, 0.35, 0);
        this.q.setFromEuler(this.eul);
        this.m4.compose(this.pos.set(x + sp.width / 2, ROAD_Y, z), this.q, this.scl.set(1, 1, 1));
        mesh.setMatrixAt(0, this.m4);
        mesh.setColorAt(0, this.colorOf(it.color));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.customDepthMaterial = src.customDepthMaterial;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        x += sp.width + 1.6;
      });
    }
  }

  /** triangles of one instance of each model at each level (debug / stats) */
  modelTris(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    MODEL_KINDS.forEach((k, mi) => (out[k] = this.layers[mi].map((L) => L.tris)));
    return out;
  }

  drawCallsEstimate(): number {
    let n = 0;
    for (const row of this.layers) for (const L of row) if (L.n > 0) n += 2;
    if (this.pools.visible) n++;
    if (this.flares.visible) n++;
    return n;
  }
}

let _poolTex: THREE.Texture | null = null;
/** soft fan of light: bright near the car (v = 0 edge), fading forward and sideways */
function poolTexture(): THREE.Texture {
  if (_poolTex) return _poolTex;
  const w = 64,
    h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w - 0.5; // -0.5..0.5 across
      const v = (j + 0.5) / h; // 0 at the car end (texture top → local -Z) .. 1 far
      const spread = 0.18 + v * 0.32;
      const lat = Math.max(0, 1 - (Math.abs(u) / spread) ** 2);
      const lon = Math.sin(Math.min(1, v * 1.15) * Math.PI) ** 0.8 * (1 - v * 0.35);
      const a = Math.max(0, Math.min(1, lat * lon));
      const k = (j * w + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  _poolTex = new THREE.CanvasTexture(cv);
  _poolTex.colorSpace = THREE.SRGBColorSpace;
  return _poolTex;
}

export function pickParkedModel(r: number): ModelKind {
  if (r < 0.22) return 'compact';
  if (r < 0.5) return 'hatch';
  if (r < 0.78) return 'sedan';
  return 'suv';
}

export { SPECS };
