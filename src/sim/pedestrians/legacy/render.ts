// LEGACY renderer (frozen copy of the original, used by ?legacypeople for A/B and before/after).
// Writes the crowd into instanced meshes every frame: culls against the camera
// frustum, computes each figure's joint angles (walk / run / idle / sit / sit on
// the sand / lie / wave / push a pram / hold a leash or umbrella) and packs the
// per-instance attributes the figure shaders read.

import * as THREE from 'three';
import { F, buildBlobGeometry, buildDogGeometry, buildPersonGeometry, buildPramGeometry, buildTinyPersonGeometry, makeBlobMaterial, makeDogMaterials, makePersonMaterials, makePramMaterials, RIG } from './figure';
import type { Crowd, Member } from '../crowd';

const SEAT_H = 0.45;

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** joint angles, see figure.ts shader for the meaning of each slot */
export interface Pose {
  hipL: number;
  kneeL: number;
  hipR: number;
  kneeR: number;
  shL: number;
  elL: number;
  shR: number;
  elR: number;
  rollL: number;
  rollR: number;
  pitch: number;
  rootY: number;
  lean: number;
  head: number;
}

export function computePose(m: Member, t: number, umbrella: boolean, o: Pose): Pose {
  const L = m.look;
  const a = m.amp;
  const walk = Math.min(1, a);
  const run = Math.max(0, a - 1);
  const ph = m.phase;
  const s = Math.sin(ph),
    c = Math.cos(ph);
  const elderly = L.age >= 70;
  const kid = L.kind === 'boy' || L.kind === 'girl';
  const hipA = (0.4 * walk + 0.3 * run) * (elderly ? 0.78 : 1);
  let hipL = -hipA * s,
    hipR = hipA * s;
  const kneeA = 0.55 * walk + 0.95 * run;
  let kneeL = 0.05 + kneeA * Math.max(0, c) + 0.32 * run,
    kneeR = 0.05 + kneeA * Math.max(0, -c) + 0.32 * run;
  const armA = (0.34 * walk + 0.32 * run) * (elderly ? 0.55 : kid ? 1.15 : 1);
  let shL = armA * s,
    shR = -armA * s;
  const elBase = -0.12 - 0.14 * walk - 1.25 * Math.min(1, run * 2.5);
  let elL = elBase,
    elR = elBase;
  let rollL = 0.07,
    rollR = -0.07;
  let lean = 0.035 * walk + 0.16 * run + (elderly ? 0.1 : 0);
  let rootY = (0.022 * walk + 0.05 * run) * (Math.abs(c) - 0.6);
  let pitch = 0;
  let head = m.headYaw;
  // idle: weight shifts and small fidgets
  const idle = 1 - Math.min(1, a / 0.25);
  if (idle > 0 && m.sit < 0.5 && m.lie < 0.5 && m.ground < 0.5) {
    const w = Math.sin(t * 0.55 + m.seed * 20);
    lean += 0.012 * Math.sin(t * 0.9 + m.seed * 7) * idle;
    hipL += 0.04 * w * idle;
    hipR -= 0.025 * w * idle;
    kneeL += 0.05 * Math.max(0, w) * idle;
    kneeR += 0.05 * Math.max(0, -w) * idle;
    shL += 0.035 * Math.sin(t * 0.6 + m.seed * 3) * idle;
    shR += 0.035 * Math.sin(t * 0.52 + m.seed * 5) * idle;
  }
  // props held in the hands
  const fl = L.flags;
  if (L.pram) {
    shL = shR = -0.8 + 0.02 * s;
    elL = elR = -0.5;
    rollL = -0.05;
    rollR = 0.05;
    lean += 0.07;
  }
  if (L.dog) {
    shL = -0.42 + 0.12 * shL;
    elL = -0.42;
    rollL = 0.13;
  }
  if (fl & (F.SHOPBAG | F.CANE)) {
    shR *= 0.55;
    rollR = -0.1;
  }
  if (fl & F.CANE) elR = -0.18;
  if (fl & F.BRIEFCASE) {
    shL *= 0.5;
    rollL = 0.1;
  }
  if (fl & F.ROD) {
    shR = -0.5;
    elR = -0.6;
    shL = -0.7;
    elL = -0.95;
    rollL = -0.2;
  }
  if (umbrella) {
    shR = -0.55;
    elR = -1.25;
    rollR = -0.02;
  }
  if (m.wave > 0) {
    const w = smooth(Math.min(1, m.wave));
    const osc = Math.sin(t * 9 + m.seed * 6);
    shR = mix(shR, -0.25, w);
    elR = mix(elR, -0.5 + 0.28 * osc, w);
    rollR = mix(rollR, -2.55 - 0.2 * osc, w);
  }
  // sitting on a bench
  if (m.sit > 0) {
    const k = smooth(Math.min(1, m.sit));
    hipL = mix(hipL, -1.52, k);
    hipR = mix(hipR, -1.46, k);
    kneeL = mix(kneeL, 1.5, k);
    kneeR = mix(kneeR, 1.4, k);
    let sL = -0.42,
      eL = -0.9,
      sR = -0.4,
      eR = -0.86,
      rl = 0.03,
      rr = -0.03;
    if (m.reading) {
      sL = sR = -1.0;
      eL = eR = -1.05;
      rl = -0.2;
      rr = 0.2;
    }
    shL = mix(shL, sL, k);
    elL = mix(elL, eL, k);
    rollL = mix(rollL, rl, k);
    if (m.wave <= 0) {
      shR = mix(shR, sR, k);
      elR = mix(elR, eR, k);
      rollR = mix(rollR, rr, k);
    }
    lean = mix(lean, m.reading ? -0.03 : -0.1, k);
    rootY = mix(rootY, SEAT_H / L.scale + 0.075 - RIG.hipY, k);
  }
  // sitting on the sand / a towel
  if (m.ground > 0) {
    const k = smooth(Math.min(1, m.ground));
    hipL = mix(hipL, -1.42, k);
    hipR = mix(hipR, -1.2, k);
    kneeL = mix(kneeL, 0.3, k);
    kneeR = mix(kneeR, 1.0, k);
    shL = mix(shL, 0.55, k);
    shR = mix(shR, 0.5, k);
    elL = mix(elL, -0.05, k);
    elR = mix(elR, -0.05, k);
    rollL = mix(rollL, 0.22, k);
    rollR = mix(rollR, -0.22, k);
    lean = mix(lean, -0.3, k);
    rootY = mix(rootY, 0.13 - RIG.hipY, k);
  }
  // lying on the back
  if (m.lie > 0) {
    const k = smooth(Math.min(1, m.lie));
    pitch = (-Math.PI / 2) * k;
    const kneeUp = m.lieVariant === 2;
    hipL = mix(hipL, kneeUp ? -0.85 : 0.0, k);
    kneeL = mix(kneeL, kneeUp ? 1.55 : 0.04, k);
    hipR = mix(hipR, 0.02, k);
    kneeR = mix(kneeR, 0.04, k);
    if (m.lieVariant === 0) {
      shL = mix(shL, -2.85, k);
      shR = mix(shR, -2.85, k);
      elL = mix(elL, -1.9, k);
      elR = mix(elR, -1.9, k);
      rollL = mix(rollL, 0.3, k);
      rollR = mix(rollR, -0.3, k);
    } else {
      shL = mix(shL, 0.04, k);
      shR = mix(shR, 0.04, k);
      elL = mix(elL, -0.08, k);
      elR = mix(elR, -0.08, k);
      rollL = mix(rollL, 0.14, k);
      rollR = mix(rollR, -0.14, k);
    }
    lean = mix(lean, 0, k);
    rootY = mix(rootY, 0.12 - RIG.hipY, k);
    head *= 1 - 0.7 * k;
  }
  o.hipL = hipL;
  o.kneeL = kneeL;
  o.hipR = hipR;
  o.kneeR = kneeR;
  o.shL = shL;
  o.elL = elL;
  o.shR = shR;
  o.elR = elR;
  o.rollL = rollL;
  o.rollR = rollR;
  o.pitch = pitch;
  o.rootY = rootY;
  o.lean = lean;
  o.head = head;
  return o;
}

/** Left hand position in the figure's local (unscaled) frame — where the dog's leash starts. */
function leftHand(p: Pose, girth: number, out: THREE.Vector3): THREE.Vector3 {
  const sx = 0.215 + (girth - 1) * 0.17;
  let hx = 0,
    hy = -0.29 * Math.cos(p.elL),
    hz = -0.29 * Math.sin(p.elL);
  hx += 0.007;
  hy += -0.27;
  const cs = Math.cos(p.shL),
    ss = Math.sin(p.shL);
  const y1 = cs * hy - ss * hz,
    z1 = ss * hy + cs * hz,
    x1 = hx;
  const cr = Math.cos(p.rollL),
    sr = Math.sin(p.rollL);
  const x2 = cr * x1 - sr * y1,
    y2 = sr * x1 + cr * y1;
  const px = sx + x2,
    py = RIG.shoulderY + y2,
    pz = z1;
  const cl = Math.cos(p.lean),
    sl = Math.sin(p.lean);
  const ry = py - RIG.leanY;
  return out.set(px, RIG.leanY + cl * ry - sl * pz + p.rootY, sl * ry + cl * pz);
}

function makeAttr(geo: THREE.BufferGeometry, name: string, cap: number, size: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute(name, a);
  return a;
}

function flush(attr: THREE.BufferAttribute | THREE.InstancedBufferAttribute, count: number): void {
  attr.clearUpdateRanges();
  if (count > 0) {
    attr.addUpdateRange(0, count * attr.itemSize);
    attr.needsUpdate = true;
  }
}

/** One LOD level of the figure mesh with its per-instance attributes. */
class PersonLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly pa: THREE.InstancedBufferAttribute;
  readonly pb: THREE.InstancedBufferAttribute;
  readonly pc: THREE.InstancedBufferAttribute;
  readonly pd: THREE.InstancedBufferAttribute;
  readonly ca: THREE.InstancedBufferAttribute;
  readonly cb: THREE.InstancedBufferAttribute;
  readonly cc: THREE.InstancedBufferAttribute;
  readonly capacity: number;
  readonly tris: number;
  n = 0;
  constructor(geo: THREE.BufferGeometry, mats: { material: THREE.Material; depth: THREE.Material }, capacity: number) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geo, mats.material, capacity);
    this.mesh.customDepthMaterial = mats.depth;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pa = makeAttr(geo, 'iPoseA', capacity, 4);
    this.pb = makeAttr(geo, 'iPoseB', capacity, 4);
    this.pc = makeAttr(geo, 'iPoseC', capacity, 4);
    this.pd = makeAttr(geo, 'iPoseD', capacity, 4);
    this.ca = makeAttr(geo, 'iColA', capacity, 4);
    this.cb = makeAttr(geo, 'iColB', capacity, 4);
    this.cc = makeAttr(geo, 'iColC', capacity, 4);
    this.tris = (geo.index?.count ?? 0) / 3;
  }
  finish(): void {
    const n = this.n;
    this.mesh.count = n;
    for (const a of [this.pa, this.pb, this.pc, this.pd, this.ca, this.cb, this.cc]) flush(a, n);
    flush(this.mesh.instanceMatrix, n);
    this.mesh.visible = n > 0;
  }
}

/**
 * Camera distances (m) for the reference view (930 px tall drawing buffer, 32° vertical fov):
 * figures closer than LOD_NEAR use the detailed mesh, beyond LOD_TINY the tiny one (≤ ~22 px tall);
 * both scale with the drawing-buffer height and the field of view.
 */
const LOD_NEAR = 55;
const LOD_TINY = 130;
const REF_HEIGHT = 930;
const REF_TAN = Math.tan((32 * Math.PI) / 360);

export class CrowdRenderer {
  readonly near: PersonLayer;
  readonly far: PersonLayer;
  readonly tiny: PersonLayer;
  /** debug: force every figure to one level (0 near, 1 far, 2 tiny), -1 = by distance */
  forceLod = -1;
  readonly pram: THREE.InstancedMesh;
  readonly dog: THREE.InstancedMesh;
  readonly blob: THREE.InstancedMesh;
  readonly group = new THREE.Group();
  private pramMisc: THREE.InstancedBufferAttribute;
  private dogA: THREE.InstancedBufferAttribute;
  private dogCol: THREE.InstancedBufferAttribute;
  private dogHand: THREE.InstancedBufferAttribute;
  private blobA: THREE.InstancedBufferAttribute;
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  private sph = new THREE.Sphere();
  private hand = new THREE.Vector3();
  private cam = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private pose: Pose = { hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, shL: 0, elL: 0, shR: 0, elR: 0, rollL: 0, rollR: 0, pitch: 0, rootY: 0, lean: 0, head: 0 };
  readonly capacity: number;
  visible = 0;
  triangles = 0;

  constructor(scene: THREE.Scene, capacity: number, castShadow: boolean) {
    this.capacity = capacity;
    const pm = makePersonMaterials();
    this.near = new PersonLayer(buildPersonGeometry(false), pm, Math.min(capacity, 260));
    this.far = new PersonLayer(buildPersonGeometry(true), pm, capacity);
    this.tiny = new PersonLayer(buildTinyPersonGeometry(), pm, capacity);

    const prg = buildPramGeometry();
    const prm = makePramMaterials();
    const pcap = Math.max(16, Math.round(capacity * 0.08));
    this.pram = new THREE.InstancedMesh(prg, prm.material, pcap);
    this.pram.customDepthMaterial = prm.depth;
    this.pram.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pramMisc = makeAttr(prg, 'iMisc', pcap, 4);

    const dg = buildDogGeometry();
    const dm = makeDogMaterials();
    const dcap = Math.max(16, Math.round(capacity * 0.1));
    this.dog = new THREE.InstancedMesh(dg, dm.material, dcap);
    this.dog.customDepthMaterial = dm.depth;
    this.dog.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dogA = makeAttr(dg, 'iDog', dcap, 4);
    this.dogCol = makeAttr(dg, 'iDogCol', dcap, 4);
    this.dogHand = makeAttr(dg, 'iHand', dcap, 4);

    const bg = buildBlobGeometry();
    const bcap = capacity + pcap + dcap;
    this.blob = new THREE.InstancedMesh(bg, makeBlobMaterial(), bcap);
    this.blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobA = makeAttr(bg, 'iBlobA', bcap, 1);
    this.blob.renderOrder = 2;

    for (const mesh of [this.near.mesh, this.far.mesh, this.tiny.mesh, this.pram, this.dog, this.blob]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
    this.setShadows(castShadow);
    this.blob.castShadow = false;
    this.blob.receiveShadow = false;
    this.group.name = 'pedestrians';
    scene.add(this.group);
  }

  private shadowsOn = true;

  setShadows(on: boolean): void {
    this.shadowsOn = on;
    for (const mesh of [this.near.mesh, this.far.mesh, this.tiny.mesh, this.pram, this.dog]) {
      mesh.castShadow = on;
      mesh.receiveShadow = true;
    }
  }

  /** @param pxHeight drawing-buffer height (px): level distances scale with it */
  write(crowd: Crowd, camera: THREE.PerspectiveCamera, t: number, rain: number, night: number, pxHeight = REF_HEIGHT): void {
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    camera.getWorldPosition(this.cam);
    // from high up the figures' shadows are sub-pixel: skip them in the shadow pass
    const high = this.cam.y > 150;
    this.far.mesh.castShadow = this.tiny.mesh.castShadow = this.shadowsOn && !high;
    this.pram.castShadow = this.dog.castShadow = this.shadowsOn && !high;
    const raining = rain > 0.15;
    this.near.n = 0;
    this.far.n = 0;
    this.tiny.n = 0;
    let np = 0,
      nd = 0,
      nb = 0;
    const PM = this.pramMisc.array as Float32Array;
    const DA = this.dogA.array as Float32Array,
      DC = this.dogCol.array as Float32Array,
      DH = this.dogHand.array as Float32Array;
    const BA = this.blobA.array as Float32Array;
    const blobAlpha = 0.36 * (1 - 0.45 * night);
    const pose = this.pose;
    const ls = (Math.max(200, pxHeight) / REF_HEIGHT) * (REF_TAN / Math.tan((camera.fov * Math.PI) / 360));
    const nearD2 = (LOD_NEAR * ls) ** 2;
    const tinyD2 = (LOD_TINY * ls) ** 2;
    const levels = [this.near, this.far, this.tiny];
    const bcap = this.blob.instanceMatrix.count;
    for (const p of crowd.parties) {
      if (p.state === 'gone') continue;
      for (const m of p.members) {
        if (!m.present || m.fade <= 0.01) continue;
        const L = m.look;
        const extra = L.pram || L.dog ? 1.4 : L.flags & F.ROD ? 2.2 : 0;
        this.sph.center.set(m.x, m.y + 0.9, m.z);
        this.sph.radius = 1.4 + extra;
        if (!this.frustum.intersectsSphere(this.sph)) continue;
        const d2 = (m.x - this.cam.x) ** 2 + (m.y - this.cam.y) ** 2 + (m.z - this.cam.z) ** 2;
        let layer = this.forceLod >= 0 ? levels[this.forceLod] : d2 < nearD2 ? this.near : d2 < tinyD2 ? this.far : this.tiny;
        if (layer.n >= layer.capacity) layer = this.far;
        if (layer.n >= layer.capacity) continue;
        const umbrella = raining && L.umbrellaOwner && m.sit < 0.3 && m.lie < 0.1 && m.ground < 0.1 && !L.pram;
        computePose(m, t + m.seed * 10, umbrella, pose);
        // root transform
        this.q.setFromAxisAngle(this.up, m.yaw);
        this.pos.set(m.x, m.y, m.z);
        this.scl.setScalar(L.scale);
        this.m4.compose(this.pos, this.q, this.scl);
        const n = layer.n;
        layer.mesh.setMatrixAt(n, this.m4);
        const i4 = n * 4;
        const PA = layer.pa.array as Float32Array,
          PB = layer.pb.array as Float32Array,
          PC = layer.pc.array as Float32Array,
          PD = layer.pd.array as Float32Array,
          CA = layer.ca.array as Float32Array,
          CB = layer.cb.array as Float32Array,
          CC = layer.cc.array as Float32Array;
        PA[i4] = pose.hipL;
        PA[i4 + 1] = pose.kneeL;
        PA[i4 + 2] = pose.hipR;
        PA[i4 + 3] = pose.kneeR;
        PB[i4] = pose.shL;
        PB[i4 + 1] = pose.elL;
        PB[i4 + 2] = pose.shR;
        PB[i4 + 3] = pose.elR;
        PC[i4] = pose.rollL;
        PC[i4 + 1] = pose.rollR;
        PC[i4 + 2] = pose.pitch;
        PC[i4 + 3] = pose.rootY;
        PD[i4] = pose.lean;
        PD[i4 + 1] = pose.head;
        PD[i4 + 2] = m.fade;
        PD[i4 + 3] = L.girth;
        let flags = L.flags;
        let top = L.top;
        let bottom = L.bottom;
        if (m.towel) flags |= F.TOWEL;
        if (umbrella) flags |= F.UMBRELLA;
        if (m.reading && m.sit > 0.75) flags |= F.NEWSPAPER;
        if (m.sunbathing && (m.lie > 0.3 || m.ground > 0.3)) {
          // into swimwear
          top = L.swim || L.skin;
          bottom = L.swim || L.bottom;
          flags = (flags | F.SHORTS | F.SHORTSLEEVE) & ~(F.SKIRT | F.TIGHTS | F.BACKPACK | F.HANDBAG | F.SHOPBAG | F.BRIEFCASE | F.VEST | F.SUIT | F.CANE);
        }
        if (m.sit > 0.5 || m.lie > 0.3 || m.ground > 0.3) flags &= ~F.ROD;
        CA[i4] = L.skin;
        CA[i4 + 1] = top;
        CA[i4 + 2] = bottom;
        CA[i4 + 3] = L.shoes;
        CB[i4] = L.hair;
        CB[i4 + 1] = L.hat;
        CB[i4 + 2] = L.bag;
        CB[i4 + 3] = flags;
        CC[i4] = L.towel;
        CC[i4 + 1] = L.umbrella;
        CC[i4 + 2] = L.accent;
        CC[i4 + 3] = 0;
        layer.n++;
        // blob shadow
        const fx = Math.sin(m.yaw),
          fz = Math.cos(m.yaw);
        const lying = Math.max(m.lie, m.ground * 0.6);
        const bw = (0.62 + 0.18 * Math.max(m.sit, lying)) * L.scale;
        const bl = (0.62 + 0.25 * m.sit + 1.4 * lying) * L.scale;
        if (nb < bcap) {
          this.pos.set(m.x + fx * (0.12 * m.sit + 0.1 * lying), m.y + 0.018, m.z + fz * (0.12 * m.sit + 0.1 * lying));
          this.scl.set(bw, 1, bl);
          this.m4.compose(this.pos, this.q, this.scl);
          this.blob.setMatrixAt(nb, this.m4);
          BA[nb++] = blobAlpha * m.fade;
        }
        // pram
        if (L.pram && np < this.pram.instanceMatrix.count) {
          this.pos.set(m.x, m.y, m.z);
          this.scl.setScalar(Math.min(1.05, Math.max(0.95, L.scale)));
          this.m4.compose(this.pos, this.q, this.scl);
          this.pram.setMatrixAt(np, this.m4);
          PM[np * 4] = L.pram.fabric;
          PM[np * 4 + 1] = m.fade;
          PM[np * 4 + 2] = 0;
          PM[np * 4 + 3] = 0;
          np++;
          if (nb < bcap) {
            this.pos.set(m.x + fx * 0.9, m.y + 0.016, m.z + fz * 0.9);
            this.scl.set(0.55, 1, 0.95);
            this.m4.compose(this.pos, this.q, this.scl);
            this.blob.setMatrixAt(nb, this.m4);
            BA[nb++] = blobAlpha * 0.9 * m.fade;
          }
        }
        // dog
        if (L.dog && nd < this.dog.instanceMatrix.count) {
          this.pos.set(m.x, m.y, m.z);
          this.scl.setScalar(L.scale);
          this.m4.compose(this.pos, this.q, this.scl);
          this.dog.setMatrixAt(nd, this.m4);
          const d4 = nd * 4;
          const dogAmp = Math.min(1.5, m.speed / (0.95 * L.dog.size));
          DA[d4] = m.dogPhase;
          DA[d4 + 1] = dogAmp;
          DA[d4 + 2] = smooth(m.dogSit);
          DA[d4 + 3] = m.fade;
          DC[d4] = L.dog.fur;
          DC[d4 + 1] = L.dog.fur2;
          DC[d4 + 2] = L.dog.collar;
          DC[d4 + 3] = L.dog.size;
          leftHand(pose, L.girth, this.hand);
          DH[d4] = this.hand.x;
          DH[d4 + 1] = this.hand.y - 0.02;
          DH[d4 + 2] = this.hand.z;
          DH[d4 + 3] = m.seed;
          nd++;
          if (nb < bcap) {
            // left of the walker: (fz, -fx)
            const s = L.scale;
            this.pos.set(m.x + (fz * 0.44 + fx * 0.6) * s, m.y + 0.017, m.z + (-fx * 0.44 + fz * 0.6) * s);
            this.scl.set(0.32 * L.dog.size, 1, 0.6 * L.dog.size);
            this.m4.compose(this.pos, this.q, this.scl);
            this.blob.setMatrixAt(nb, this.m4);
            BA[nb++] = blobAlpha * 0.85 * m.fade;
          }
        }
      }
    }
    this.near.finish();
    this.far.finish();
    this.tiny.finish();
    this.visible = this.near.n + this.far.n + this.tiny.n;
    this.triangles = this.near.n * this.near.tris + this.far.n * this.far.tris + this.tiny.n * this.tiny.tris;
    this.pram.count = np;
    this.dog.count = nd;
    this.blob.count = nb;
    flush(this.pramMisc, np);
    flush(this.pram.instanceMatrix, np);
    flush(this.dogA, nd);
    flush(this.dogCol, nd);
    flush(this.dogHand, nd);
    flush(this.dog.instanceMatrix, nd);
    flush(this.blobA, nb);
    flush(this.blob.instanceMatrix, nb);
    this.pram.visible = np > 0;
    this.dog.visible = nd > 0;
    this.blob.visible = nb > 0;
  }

  dispose(): void {
    const mats = new Set<THREE.Material>();
    for (const mesh of [this.near.mesh, this.far.mesh, this.tiny.mesh, this.pram, this.dog, this.blob]) {
      mesh.geometry.dispose();
      mats.add(mesh.material as THREE.Material);
      if (mesh.customDepthMaterial) mats.add(mesh.customDepthMaterial);
    }
    for (const m of mats) m.dispose();
    this.group.removeFromParent();
  }
}
