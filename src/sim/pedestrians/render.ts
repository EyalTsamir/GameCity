// Writes the crowd into the figure layers every frame: culls against the camera frustum, picks a
// level of detail (with hysteresis), computes each figure's pose (animate.ts) and packs the
// per-instance data the people shader reads (shader.ts): root position / yaw, 48 pose values as
// 16-bit fixed pairs, 12 colour words with garment parameters and the feature mask.
//
// Draw calls: LOD0 + lo + tiny (main pass only) + one shadow proxy (tiny mesh, shadow pass only),
// plus prams, dogs and blob contact shadows as before.

import * as THREE from 'three';
import { DOG_OFFSET, F, buildBlobGeometry, buildDogGeometry, buildPramGeometry, makeBlobMaterial, makeDogMaterials, makePramMaterials } from './figure';
import { FB, figureMesh, type Lod } from './body';
import { HAT_STYLES, POSE_KEYS, POSE_UINTS, makeInvisibleMaterial, makePeopleMaterials } from './shader';
import { computePoseA, poseIn } from './animate';
import { newGaitState, type GaitState } from './gait';
import { gripPoint, newPose, type Pose } from './pose';
import { rigOf } from './rig';
import { styleFromFlags, type Look, type Style } from './looks';
import type { Crowd, Member } from './crowd';
import { patchLampMaterial } from '../../world/lamps/integrate';

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const fx16 = (v: number) => {
  const u = Math.round((v + 8) * 4096);
  return u < 0 ? 0 : u > 65535 ? 65535 : u;
};
const q8 = (h: number) => clamp(Math.round(((h + 0.1) / 1.275) * 255), 0, 255);
const bit = (b: number) => (1 << b) >>> 0;

/** per-look static render data (colours with garment parameters, feature mask) */
interface LookCache {
  style: Style;
  col: Uint32Array; // 12 words
  flags: number;
}

const lookCache = new WeakMap<Look, LookCache>();

export function lookData(L: Look): LookCache {
  let c = lookCache.get(L);
  if (c && c.style === (L.style ?? c.style)) return c;
  const s = styleFromFlags(L);
  const col = new Uint32Array(12);
  const fl = L.flags;
  let f = 0;
  if (s.hair !== 'bald') f |= bit(FB.HAIR);
  if (s.hairLen > 0.01) f |= bit(FB.HAIRLONG);
  if (s.hair === 'ponytail') f |= bit(FB.PONY);
  if (s.hair === 'bun' || s.hair === 'manbun') f |= bit(FB.BUN);
  if (s.fringe) f |= bit(FB.FRINGE);
  if (s.beard === 1) f |= bit(FB.BEARD);
  if (s.beard >= 1) f |= bit(FB.MOUSTACHE);
  if (s.hat > 0) {
    f |= bit(FB.HAT);
    if (s.hat === HAT_STYLES.SUNHAT || s.hat === HAT_STYLES.FEDORA || s.hat === HAT_STYLES.HARDHAT || s.hat === HAT_STYLES.BUCKET) f |= bit(FB.BRIM);
    if (s.hat === HAT_STYLES.CAP || s.hat === HAT_STYLES.FLATCAP) f |= bit(FB.VISOR);
    if (s.hair === 'bun') f &= ~bit(FB.BUN);
  }
  if (fl & F.BACKPACK) f |= bit(FB.BACKPACK);
  if (fl & F.HANDBAG) f |= bit(FB.SHOULDERBAG);
  if (fl & F.SHOPBAG) f |= bit(FB.SHOPBAG);
  if (fl & F.BRIEFCASE) f |= bit(FB.BRIEFCASE);
  if (fl & F.CANE) f |= bit(FB.CANE);
  if (fl & F.ROD) f |= bit(FB.ROD);
  if (s.tail > 0) f |= bit(FB.TAIL);
  if (s.tie) f |= bit(FB.TIE);
  if (s.collar > 0) f |= bit(FB.COLLAR);
  if (s.lapels) f |= bit(FB.LAPELS);
  if (s.hood) f |= bit(FB.HOOD);
  if (s.vest) f |= bit(FB.VEST);
  writeColours(col, L, s, L.top, L.bottom);
  c = { style: s, col, flags: f >>> 0 };
  lookCache.set(L, c);
  return c;
}

function writeColours(col: Uint32Array, L: Look, s: Style, top: number, bottom: number): void {
  const w = (rgb: number, p: number) => ((rgb & 0xffffff) | ((p & 255) << 24)) >>> 0;
  const tailSrc = s.tail === 2 ? 1 : s.tail === 3 ? 2 : 0;
  col[0] = w(L.skin, q8(s.sleeve));
  col[1] = w(top, q8(s.topHem));
  col[2] = w(bottom, q8(s.trouserEnd));
  col[3] = w(L.shoes, (Math.round(clamp(s.bootTop, 0, 0.63) * 100) & 63) | (s.sole << 6));
  col[4] = w(L.hair, Math.round(clamp(s.hairLen / 0.5, 0, 1) * 255));
  col[5] = w(L.hat, (s.hat & 7) | ((s.hat > 0 ? 0 : Math.round(clamp(s.hairVol ?? 0, 0, 1) * 31)) << 3));
  col[6] = w(L.bag, Math.round(clamp(s.tailHem, 0, 1) * 255));
  col[7] = w(s.outer, tailSrc << 5);
  col[8] = w(L.accent, s.legwear & 3);
  col[9] = w(L.towel, s.jacketHem < -0.05 ? 0 : q8(s.jacketHem));
  col[10] = 0;
  col[11] = ((q8((s.neckTop - 0.95) / 0.4 * 1.275 - 0.1) << 24) | (q8(-0.1) << 16) | ((s.collar === 1 ? 1 : 0) << 8) | Math.round(clamp(s.tailFlare * 1000, 0, 255))) >>> 0;
}

function makeAttr(geo: THREE.BufferGeometry, name: string, arr: Float32Array | Uint32Array, size: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(arr, size);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute(name, a);
  return a;
}

function flush(attr: THREE.BufferAttribute | THREE.InstancedBufferAttribute | THREE.InterleavedBuffer, count: number, itemSize: number): void {
  attr.clearUpdateRanges();
  if (count > 0) {
    attr.addUpdateRange(0, count * itemSize);
    attr.needsUpdate = true;
  }
}

/** One level of detail of the figure mesh with its per-instance data. */
class Layer {
  readonly mesh: THREE.Mesh;
  readonly geo: THREE.InstancedBufferGeometry;
  readonly root: Float32Array;
  readonly pose: Uint32Array;
  readonly col: Uint32Array;
  private rootAttr: THREE.InstancedBufferAttribute;
  private poseBuf: THREE.InstancedInterleavedBuffer;
  private colBuf: THREE.InstancedInterleavedBuffer;
  readonly capacity: number;
  readonly tris: number;
  readonly verts: number;
  n = 0;
  constructor(lod: Lod, material: THREE.Material, depth: THREE.Material | null, capacity: number) {
    this.capacity = capacity;
    const fm = figureMesh(lod);
    const base = fm.geometry;
    const g = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'aMorph', 'aData']) g.setAttribute(k, base.getAttribute(k));
    g.setIndex(base.index);
    g.boundingSphere = base.boundingSphere;
    this.root = new Float32Array(capacity * 4);
    this.pose = new Uint32Array(capacity * POSE_UINTS);
    this.col = new Uint32Array(capacity * 12);
    this.rootAttr = makeAttr(g, 'iRoot', this.root, 4);
    this.poseBuf = new THREE.InstancedInterleavedBuffer(this.pose, POSE_UINTS);
    this.poseBuf.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < POSE_UINTS / 4; i++) g.setAttribute(`iP${i}`, new THREE.InterleavedBufferAttribute(this.poseBuf, 4, i * 4));
    this.colBuf = new THREE.InstancedInterleavedBuffer(this.col, 12);
    this.colBuf.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 3; i++) g.setAttribute(`iC${i}`, new THREE.InterleavedBufferAttribute(this.colBuf, 4, i * 4));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    if (depth) this.mesh.customDepthMaterial = depth;
    this.tris = fm.triangles;
    this.verts = fm.vertices;
  }
  put(root: Float32Array, pose: Uint32Array, col: Uint32Array): void {
    const n = this.n++;
    this.root.set(root, n * 4);
    this.pose.set(pose, n * POSE_UINTS);
    this.col.set(col, n * 12);
  }
  finish(): void {
    const n = this.n;
    this.geo.instanceCount = n;
    flush(this.rootAttr, n, 4);
    flush(this.poseBuf, n, POSE_UINTS);
    flush(this.colBuf, n, 12);
    this.mesh.visible = n > 0;
  }
}

/** per-member render state (LOD hysteresis; later: foot plants, idle variants) */
interface RenderState {
  lod: number;
  gait: GaitState;
  /** level being faded out (−1 none) and the cross-fade progress 0…1 */
  prev: number;
  xf: number;
}
const states = new WeakMap<Member, RenderState>();

/**
 * Camera distances (m) for the reference view (930 px tall drawing buffer, 32° vertical fov):
 * LOD0 closer than LOD_NEAR, tiny beyond LOD_TINY; both scale with the drawing-buffer height and the
 * field of view; ±HYST m hysteresis so figures do not flicker between levels.
 */
const LOD_NEAR = 40;
const LOD_TINY = 110;
const LOD_PIN = 300;
const HYST = 3;
/** level switch cross-fade time (s, real time) */
const XFADE = 0.4;
const SHADOW_FAR = 150;
const REF_HEIGHT = 930;
const REF_TAN = Math.tan((32 * Math.PI) / 360);

export class CrowdRenderer {
  readonly near: Layer;
  readonly far: Layer;
  readonly tiny: Layer;
  /** pin figures for the hero overview (beyond LOD_PIN) */
  readonly pin: Layer;
  /** shadow-only proxy: every figure near the camera, drawn with the tiny mesh into the shadow map */
  readonly shadow: Layer;
  /** debug: force every figure to one level (0 near, 1 far, 2 tiny, 3 pin), -1 = by distance */
  forceLod = -1;
  /** cross-fade level switches (tools turn it off for synchronous censuses) */
  xfade = true;
  readonly pram: THREE.InstancedMesh;
  readonly dog: THREE.InstancedMesh;
  readonly blob: THREE.InstancedMesh;
  readonly group = new THREE.Group();
  private pramMisc: THREE.InstancedBufferAttribute;
  private dogA: THREE.InstancedBufferAttribute;
  private dogCol: THREE.InstancedBufferAttribute;
  private dogHand: THREE.InstancedBufferAttribute;
  private blobA: THREE.InstancedBufferAttribute;
  readonly frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  readonly sph = new THREE.Sphere();
  private hand = { x: 0, y: 0, z: 0 };
  private cam = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private pose: Pose = newPose();
  private sRoot = new Float32Array(4);
  private sPose = new Uint32Array(POSE_UINTS);
  private sCol = new Uint32Array(12);
  readonly capacity: number;
  visible = 0;
  triangles = 0;
  vertices = 0;
  shadowVertices = 0;
  private frame = 0;
  private lastNow = 0;
  private lastCam = new THREE.Vector3(1e9, 0, 0);
  private layers: Layer[] = [];
  private levels: Layer[] = [];
  private edges = [0, 0, 0];
  private camRef: THREE.PerspectiveCamera | null = null;

  constructor(scene: THREE.Scene, capacity: number, castShadow: boolean) {
    this.capacity = capacity;
    const pm = makePeopleMaterials();
    patchLampMaterial(pm.material);
    this.near = new Layer(0, pm.material, null, Math.min(capacity, 96));
    this.far = new Layer(1, pm.material, null, capacity);
    this.tiny = new Layer(2, pm.material, null, capacity);
    this.pin = new Layer(3, pm.material, null, capacity);
    this.shadow = new Layer(2, makeInvisibleMaterial(), pm.depth, capacity);
    this.shadow.mesh.castShadow = true;
    this.shadow.mesh.receiveShadow = false;
    this.levels = [this.near, this.far, this.tiny, this.pin];
    this.layers = [this.near, this.far, this.tiny, this.pin, this.shadow];
    // the proxy only draws into shadow maps: decline the main camera's frustum (same planes as the
    // culling frustum computed in write()), accept every other (shadow cameras)
    const mainFr = new THREE.Frustum(),
      mainM = new THREE.Matrix4();
    const mainPlanes = mainFr.planes;
    this.shadow.mesh.intersectsFrustum = (f: THREE.Frustum) => {
      const cam = this.camRef;
      if (!cam) return true;
      mainM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      mainFr.setFromProjectionMatrix(mainM);
      for (let i = 0; i < 6; i += 2) {
        const a = f.planes[i],
          b = mainPlanes[i];
        if (Math.abs(a.constant - b.constant) > 1e-3 || a.normal.distanceToSquared(b.normal) > 1e-6) return true;
      }
      return false;
    };

    const prg = buildPramGeometry();
    const prm = makePramMaterials();
    patchLampMaterial(prm.material);
    const pcap = Math.max(16, Math.round(capacity * 0.08));
    this.pram = new THREE.InstancedMesh(prg, prm.material, pcap);
    this.pram.customDepthMaterial = prm.depth;
    this.pram.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pramMisc = makeAttr(prg, 'iMisc', new Float32Array(pcap * 4), 4);

    const dg = buildDogGeometry();
    const dm = makeDogMaterials();
    patchLampMaterial(dm.material);
    const dcap = Math.max(16, Math.round(capacity * 0.1));
    this.dog = new THREE.InstancedMesh(dg, dm.material, dcap);
    this.dog.customDepthMaterial = dm.depth;
    this.dog.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dogA = makeAttr(dg, 'iDog', new Float32Array(dcap * 4), 4);
    this.dogCol = makeAttr(dg, 'iDogCol', new Float32Array(dcap * 4), 4);
    this.dogHand = makeAttr(dg, 'iHand', new Float32Array(dcap * 4), 4);

    const bg = buildBlobGeometry();
    const bcap = capacity + pcap + dcap;
    this.blob = new THREE.InstancedMesh(bg, makeBlobMaterial(), bcap);
    this.blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobA = makeAttr(bg, 'iBlobA', new Float32Array(bcap), 1);
    this.blob.renderOrder = 2;

    for (const mesh of [this.near.mesh, this.far.mesh, this.tiny.mesh, this.pin.mesh, this.shadow.mesh, this.pram, this.dog, this.blob]) {
      mesh.frustumCulled = mesh === this.shadow.mesh;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).count = 0;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
    for (const l of [this.near, this.far, this.tiny, this.pin]) {
      l.mesh.castShadow = false;
      l.mesh.receiveShadow = true;
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
    this.shadow.mesh.castShadow = on;
    for (const mesh of [this.pram, this.dog]) {
      mesh.castShadow = on;
      mesh.receiveShadow = true;
    }
  }

  /** @param pxHeight drawing-buffer height (px): level distances scale with it */
  write(crowd: Crowd, camera: THREE.PerspectiveCamera, t: number, rain: number, night: number, pxHeight = REF_HEIGHT): void {
    this.frame++;
    this.camRef = camera;
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    camera.getWorldPosition(this.cam);
    // from high up the figures' shadows are sub-pixel: skip them in the shadow pass
    const high = this.cam.y > 150;
    const shadows = this.shadowsOn && !high;
    this.shadow.mesh.castShadow = shadows;
    this.pram.castShadow = this.dog.castShadow = shadows;
    const raining = rain > 0.15;
    const all = this.layers;
    for (let i = 0; i < all.length; i++) all[i].n = 0;
    let np = 0,
      nd = 0,
      nb = 0;
    const PM = this.pramMisc.array as Float32Array;
    const DA = this.dogA.array as Float32Array,
      DC = this.dogCol.array as Float32Array,
      DH = this.dogHand.array as Float32Array;
    const BA = this.blobA.array as Float32Array;
    const blobAlpha = (shadows ? 0.28 : 0.36) * (1 - 0.45 * night);
    const pose = this.pose;
    const ls = (Math.max(200, pxHeight) / REF_HEIGHT) * (REF_TAN / Math.tan((camera.fov * Math.PI) / 360));
    const nearD = LOD_NEAR * ls,
      tinyD = LOD_TINY * ls,
      pinD = LOD_PIN * ls,
      shadowD2 = (SHADOW_FAR * ls) ** 2;
    const levels = this.levels;
    const edges = this.edges;
    edges[0] = nearD;
    edges[1] = tinyD;
    edges[2] = pinD;
    const bcap = this.blob.instanceMatrix.count;
    const now = performance.now() * 0.001;
    const xfStep = clamp((now - this.lastNow) / XFADE, 0, 1);
    this.lastNow = now;
    // no cross-fades on camera jumps (view snaps, tools placing the camera): the whole view changes
    const xfOn = this.xfade && this.forceLod < 0 && this.cam.distanceToSquared(this.lastCam) < 16;
    this.lastCam.copy(this.cam);
    const R = this.sRoot,
      PP = this.sPose,
      CC = this.sCol;
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
        const d = Math.sqrt(d2);
        let st = states.get(m);
        if (!st) {
          st = { lod: -1, gait: newGaitState(), prev: -1, xf: 1 };
          states.set(m, st);
        }
        // level with hysteresis around each switch distance
        let lv = d < nearD ? 0 : d < tinyD ? 1 : d < pinD ? 2 : 3;
        if (st.lod >= 0 && Math.abs(lv - st.lod) === 1) {
          const edge = edges[Math.min(lv, st.lod)];
          if (Math.abs(d - edge) < HYST * (1 + Math.min(lv, st.lod))) lv = st.lod;
        }
        // level switches cross-fade (complementary dither, XFADE s) unless the figure is fading anyway
        if (st.lod >= 0 && lv !== st.lod && xfOn && m.fade > 0.99) {
          st.prev = st.lod;
          st.xf = 0;
        }
        st.lod = lv;
        if (st.prev >= 0) {
          st.xf += xfStep;
          if (st.xf >= 1 || !xfOn || m.fade <= 0.99) st.prev = -1;
        }
        let layer = this.forceLod >= 0 ? levels[this.forceLod] : levels[lv];
        if (layer.n >= layer.capacity) layer = this.far;
        if (layer.n >= layer.capacity) continue;
        const out = st.prev >= 0 ? levels[st.prev] : null;
        const r = rigOf(L);
        const umbrella = raining && L.umbrellaOwner && m.sit < 0.3 && m.lie < 0.1 && m.ground < 0.1 && !L.pram;
        const gaitOn = layer === this.near || layer === this.far || out === this.near || out === this.far;
        poseIn.t = t + m.seed * 10;
        computePoseA(m, umbrella, r, pose, gaitOn ? st.gait : null, this.frame);
        // drawn at the gait's smoothed root when the gait ran this frame (corners: the feet were planned
        // around it), else at the crowd's root
        const gs = gaitOn && st.gait.frame === this.frame;
        const mx = gs ? st.gait.sx : m.x,
          mz = gs ? st.gait.sz : m.z;
        pose.scale = r.s;
        pose.fade = m.fade;
        pose.w = r.w;
        pose.c = r.c;
        pose.b = r.b;
        // garments & runtime props
        const ld = lookData(L);
        const s = ld.style;
        let flags = ld.flags;
        CC.set(ld.col);
        if (m.towel) flags |= bit(FB.TOWEL);
        if (umbrella) {
          flags |= bit(FB.UMBRELLA);
          CC[9] = ((L.umbrella & 0xffffff) | (CC[9] & 0xff000000)) >>> 0;
        }
        if (m.reading && m.sit > 0.75) flags |= bit(FB.NEWSPAPER);
        if (pose.spare1 > 0.5) flags |= bit(pose.spare1 < 1.5 ? FB.PHONE : FB.CUP);
        if (m.sit > 0.5 || m.lie > 0.3 || m.ground > 0.3) flags &= ~(bit(FB.ROD) | bit(FB.CANE) | bit(FB.SHOPBAG) | bit(FB.BRIEFCASE));
        if (m.lie > 0.3) flags &= ~(bit(FB.HAT) | bit(FB.BRIM) | bit(FB.VISOR) | bit(FB.BACKPACK));
        if (m.sunbathing && (m.lie > 0.3 || m.ground > 0.3)) {
          flags = swimwear(L, s, flags, CC);
        }
        // pack
        R[0] = mx;
        R[1] = m.y;
        R[2] = mz;
        R[3] = m.yaw;
        for (let k = 0; k < POSE_UINTS; k++) PP[k] = (fx16(pose[POSE_KEYS[2 * k]]) | (fx16(pose[POSE_KEYS[2 * k + 1]]) << 16)) >>> 0;
        CC[10] = flags >>> 0;
        if (shadows && d2 < shadowD2 && this.shadow.n < this.shadow.capacity) this.shadow.put(R, PP, CC);
        if (out && out !== layer && out.n < out.capacity) {
          // incoming level keeps the dither cells below xf, the outgoing one (negative fade) the rest
          const s0 = fx16(pose.scale);
          PP[0] = (s0 | (fx16(-Math.max(0.002, st.xf)) << 16)) >>> 0;
          out.put(R, PP, CC);
          PP[0] = (s0 | (fx16(Math.min(0.994, st.xf)) << 16)) >>> 0;
        }
        layer.put(R, PP, CC);
        // blob shadow
        this.q.setFromAxisAngle(this.up, m.yaw);
        const fx = Math.sin(m.yaw),
          fz = Math.cos(m.yaw);
        const lying = Math.max(m.lie, m.ground * 0.6);
        const sitK = smooth(Math.min(1, m.sit));
        const bw = (0.56 + 0.18 * Math.max(sitK, lying)) * r.stature / 1.76;
        const bl = (0.56 + 0.12 * m.amp + 0.25 * sitK + 1.4 * lying) * r.stature / 1.76;
        if (nb < bcap) {
          const off = 0.08 * sitK + 0.1 * lying;
          this.pos.set(mx + fx * off, m.y + 0.018, mz + fz * off);
          this.scl.set(bw, 1, bl);
          this.m4.compose(this.pos, this.q, this.scl);
          this.blob.setMatrixAt(nb, this.m4);
          BA[nb++] = blobAlpha * m.fade;
        }
        // pram
        if (L.pram && np < this.pram.instanceMatrix.count) {
          this.pos.set(mx, m.y, mz);
          this.scl.setScalar(Math.min(1.05, Math.max(0.95, L.scale)));
          this.m4.compose(this.pos, this.q, this.scl);
          this.pram.setMatrixAt(np, this.m4);
          PM[np * 4] = L.pram.fabric;
          PM[np * 4 + 1] = m.fade;
          PM[np * 4 + 2] = 0;
          PM[np * 4 + 3] = 0;
          np++;
          if (nb < bcap) {
            this.pos.set(mx + fx * 0.9, m.y + 0.016, mz + fz * 0.9);
            this.scl.set(0.55, 1, 0.95);
            this.m4.compose(this.pos, this.q, this.scl);
            this.blob.setMatrixAt(nb, this.m4);
            BA[nb++] = blobAlpha * 0.9 * m.fade;
          }
        }
        // dog
        if (L.dog && nd < this.dog.instanceMatrix.count) {
          this.pos.set(mx, m.y, mz);
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
          // leash from the posed left grip (figure units × figure scale → dog-mesh units of look.scale)
          gripPoint(r, pose, true, this.hand);
          const k = r.s / L.scale;
          DH[d4] = this.hand.x * k;
          DH[d4 + 1] = this.hand.y * k - 0.01;
          DH[d4 + 2] = this.hand.z * k;
          DH[d4 + 3] = m.seed;
          nd++;
          if (nb < bcap) {
            const sc = L.scale;
            this.pos.set(mx + (fz * DOG_OFFSET.x + fx * DOG_OFFSET.z) * sc, m.y + 0.017, mz + (-fx * DOG_OFFSET.x + fz * DOG_OFFSET.z) * sc);
            this.scl.set(0.32 * L.dog.size, 1, 0.6 * L.dog.size);
            this.m4.compose(this.pos, this.q, this.scl);
            this.blob.setMatrixAt(nb, this.m4);
            BA[nb++] = blobAlpha * 0.85 * m.fade;
          }
        }
      }
    }
    for (let i = 0; i < all.length; i++) all[i].finish();
    this.visible = this.near.n + this.far.n + this.tiny.n + this.pin.n;
    this.triangles = this.near.n * this.near.tris + this.far.n * this.far.tris + this.tiny.n * this.tiny.tris + this.pin.n * this.pin.tris;
    this.vertices = this.near.n * this.near.verts + this.far.n * this.far.verts + this.tiny.n * this.tiny.verts + this.pin.n * this.pin.verts;
    this.shadowVertices = this.shadow.n * this.shadow.verts;
    this.pram.count = np;
    this.dog.count = nd;
    this.blob.count = nb;
    flush(this.pramMisc, np, 4);
    flush(this.pram.instanceMatrix, np, 16);
    flush(this.dogA, nd, 4);
    flush(this.dogCol, nd, 4);
    flush(this.dogHand, nd, 4);
    flush(this.dog.instanceMatrix, nd, 16);
    flush(this.blobA, nb, 1);
    flush(this.blob.instanceMatrix, nb, 16);
    this.pram.visible = np > 0;
    this.dog.visible = nd > 0;
    this.blob.visible = nb > 0;
  }

  dispose(): void {
    const mats = new Set<THREE.Material>();
    for (const l of [this.near, this.far, this.tiny, this.pin, this.shadow]) {
      l.geo.dispose();
      mats.add(l.mesh.material as THREE.Material);
      if (l.mesh.customDepthMaterial) mats.add(l.mesh.customDepthMaterial);
    }
    for (const mesh of [this.pram, this.dog, this.blob]) {
      mesh.geometry.dispose();
      mats.add(mesh.material as THREE.Material);
      if (mesh.customDepthMaterial) mats.add(mesh.customDepthMaterial);
    }
    for (const m of mats) m.dispose();
    this.group.removeFromParent();
  }
}

/** sunbathing: swimwear colours / hems, accessories off */
export function swimwear(L: Look, s: Style, flags: number, C: Uint32Array): number {
  const w = (rgb: number, p: number) => ((rgb & 0xffffff) | ((p & 255) << 24)) >>> 0;
  const female = L.kind === 'woman' || L.kind === 'girl';
  const swim = L.swim || L.skin;
  const keep = bit(FB.HAIR) | bit(FB.HAIRLONG) | bit(FB.PONY) | bit(FB.BUN) | bit(FB.FRINGE) | bit(FB.BEARD) | bit(FB.MOUSTACHE) | bit(FB.TOWEL) | bit(FB.HAT) | bit(FB.BRIM) | bit(FB.VISOR);
  flags &= keep;
  C[0] = w(L.skin, q8(1.12)); // sleeveless
  if (female) {
    // one-piece (L.swim) or bikini (swim colour with a bare midriff)
    const bikini = (L.swim & 1) === 1;
    C[1] = w(swim, q8(0.12));
    C[2] = w(swim, q8(0.86));
    C[11] = ((q8(-0.1) << 24) | ((bikini ? q8(0.5) : q8(-0.1)) << 16) | (C[11] & 255)) >>> 0;
  } else {
    // trunks; bare chest unless a swim shirt colour
    C[1] = w(L.skin, q8(0.12));
    C[2] = w(swim === L.skin ? 0x2f4566 : swim, q8(0.74));
    C[11] = ((q8(-0.1) << 24) | (q8(-0.1) << 16) | (C[11] & 255)) >>> 0;
  }
  C[7] = w(0, 0);
  C[9] = (C[9] & 0xffffff) >>> 0; // no jacket
  C[3] = w(L.shoes, 0);
  return flags >>> 0;
}
