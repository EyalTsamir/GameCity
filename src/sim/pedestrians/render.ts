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
import { rigOf, type Rig } from './rig';
import { styleFromFlags, type Look, type Style } from './looks';
import type { Crowd, Member } from './crowd';
import { patchLampMaterial } from '../../world/lamps/integrate';
import { Tableware, HELD_CUP, HELD_GLASS } from './tableware';

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const q8 = (h: number) => clamp(Math.round(((h + 0.1) / 1.275) * 255), 0, 255);
const bit = (b: number) => (1 << b) >>> 0;
/** colour word: rgb24 + parameter byte (module level: a closure made per call is an allocation) */
const w = (rgb: number, p: number) => ((rgb & 0xffffff) | ((p & 255) << 24)) >>> 0;

// Per-figure hot path without garbage: the pose is packed from named field reads (a keyed read with a varying
// key, pose[POSE_KEYS[k]], is megamorphic and boxes every double it returns), and instance matrices are written
// element by element (three's setters take doubles as arguments, boxed when the call is not inlined).
const PV = new Float64Array(POSE_KEYS.length);
const PACK_ORDER = 'scale fade w c b bodyPitch rootX rootY rootZ pelvisYaw pelvisRoll waistBend waistTwist chestBend chestTwist headYaw headPitch hipFlexL hipAbdL kneeL ankleL hipFlexR hipAbdR kneeR ankleR shFlexL shAbdL shTwistL elbowL wristL shFlexR shAbdR shTwistR elbowR wristR gripL gripR caneX caneZ bagSwingL bagSwingR tailFloor headRoll chestRoll footYawL footYawR spare1 spare2';
if (PACK_ORDER !== POSE_KEYS.join(' ')) throw new Error('render.ts packPose: field order differs from POSE_KEYS');
function packPose(p: Pose, o: Uint32Array): void {
  const v = PV;
  v[0] = p.scale; v[1] = p.fade; v[2] = p.w; v[3] = p.c; v[4] = p.b; v[5] = p.bodyPitch; v[6] = p.rootX; v[7] = p.rootY;
  v[8] = p.rootZ; v[9] = p.pelvisYaw; v[10] = p.pelvisRoll; v[11] = p.waistBend; v[12] = p.waistTwist; v[13] = p.chestBend;
  v[14] = p.chestTwist; v[15] = p.headYaw; v[16] = p.headPitch; v[17] = p.hipFlexL; v[18] = p.hipAbdL; v[19] = p.kneeL;
  v[20] = p.ankleL; v[21] = p.hipFlexR; v[22] = p.hipAbdR; v[23] = p.kneeR; v[24] = p.ankleR; v[25] = p.shFlexL;
  v[26] = p.shAbdL; v[27] = p.shTwistL; v[28] = p.elbowL; v[29] = p.wristL; v[30] = p.shFlexR; v[31] = p.shAbdR;
  v[32] = p.shTwistR; v[33] = p.elbowR; v[34] = p.wristR; v[35] = p.gripL; v[36] = p.gripR; v[37] = p.caneX; v[38] = p.caneZ;
  v[39] = p.bagSwingL; v[40] = p.bagSwingR; v[41] = p.tailFloor; v[42] = p.headRoll; v[43] = p.chestRoll; v[44] = p.footYawL;
  v[45] = p.footYawR; v[46] = p.spare1; v[47] = p.spare2;
  for (let k = 0; k < POSE_UINTS; k++) {
    let a = Math.round((v[2 * k] + 8) * 4096),
      b = Math.round((v[2 * k + 1] + 8) * 4096);
    a = a < 0 ? 0 : a > 65535 ? 65535 : a;
    b = b < 0 ? 0 : b > 65535 ? 65535 : b;
    o[k] = (a | (b << 16)) >>> 0;
  }
}
/** pose word 0 with the scale and a given fade (LOD cross-fades) */
function packScaleFade(scale: number, fade: number, o: Uint32Array): void {
  PV[0] = scale;
  PV[1] = fade;
  let a = Math.round((PV[0] + 8) * 4096),
    b = Math.round((PV[1] + 8) * 4096);
  a = a < 0 ? 0 : a > 65535 ? 65535 : a;
  b = b < 0 ? 0 : b > 65535 ? 65535 : b;
  o[0] = (a | (b << 16)) >>> 0;
}
// instance matrix inputs: x, y, z, yaw, sx, sy, sz (written by the caller)
const MI = new Float64Array(7);
/** m ← T(x, y, z) · Ry(yaw) · S(sx, sy, sz) from MI (what compose(pos, quatY(yaw), scl) gives) */
function yawMatrix(m: THREE.Matrix4): void {
  const e = m.elements;
  const c = Math.cos(MI[3]),
    s = Math.sin(MI[3]);
  e[0] = c * MI[4]; e[1] = 0; e[2] = -s * MI[4]; e[3] = 0;
  e[4] = 0; e[5] = MI[5]; e[6] = 0; e[7] = 0;
  e[8] = s * MI[6]; e[9] = 0; e[10] = c * MI[6]; e[11] = 0;
  e[12] = MI[0]; e[13] = MI[1]; e[14] = MI[2]; e[15] = 1;
}

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
  // (a ponytail's 2 cm would hang the sheet as a ledge beside the ears: only real lengths get one)
  if (s.hairLen > 0.03) f |= bit(FB.HAIRLONG);
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

/** close-level face bits: age lines 2 | eye colour 2 | lipstick 1 | stubble 1 (deterministic per look) */
function faceBits(L: Look, s: Style): number {
  let h = (L.skin * 2654435761) ^ (L.hair * 40503) ^ (L.top * 2246822519) ^ (L.age * 3266489917);
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  const r = (k: number) => ((h >>> k) & 255) / 255;
  const age = L.age >= 72 ? 3 : L.age >= 58 ? 2 : L.age >= 44 ? 1 : 0;
  // darker skin: dark brown eyes; lighter: brown / hazel / blue-grey
  const sk = ((L.skin >> 16) & 255) + ((L.skin >> 8) & 255) + (L.skin & 255);
  const light = sk > 420;
  const eye = !light ? (r(0) < 0.8 ? 0 : 1) : r(0) < 0.3 ? 1 : r(0) < 0.55 ? 2 : r(0) < 0.85 ? 3 : 0;
  const female = L.kind === 'woman' || L.kind === 'girl';
  const lip = female && L.age >= 17 && L.age < 75 && r(8) < 0.3 ? 1 : 0;
  const stub = !female && L.age >= 19 && s.beard === 0 && r(16) < 0.4 ? 1 : 0;
  return age | (eye << 2) | (lip << 4) | (stub << 5);
}

function writeColours(col: Uint32Array, L: Look, s: Style, top: number, bottom: number): void {
  const tailSrc = s.tail === 2 ? 1 : s.tail === 3 ? 2 : 0;
  col[0] = w(L.skin, q8(s.sleeve));
  col[1] = w(top, q8(s.topHem));
  col[2] = w(bottom, q8(s.trouserEnd));
  col[3] = w(L.shoes, (Math.round(clamp(s.bootTop, 0, 0.63) * 100) & 63) | (s.sole << 6));
  col[4] = w(L.hair, Math.round(clamp(s.hairLen / 0.5, 0, 1) * 255));
  col[5] = w(L.hat, (s.hat & 7) | ((s.hat > 0 ? 0 : Math.round(clamp(s.hairVol ?? 0, 0, 1) * 31)) << 3));
  col[6] = w(L.bag, Math.round(clamp(s.tailHem, 0, 1) * 255));
  col[7] = w(s.outer, tailSrc << 5);
  col[8] = w(L.accent, (s.legwear & 3) | (Math.round(clamp(s.trouserFit ?? 0, 0, 1) * 15) << 2));
  col[9] = w(L.towel, s.jacketHem < -0.05 ? 0 : q8(s.jacketHem));
  col[10] = 0;
  col[11] = ((q8((s.neckTop - 0.95) / 0.4 * 1.275 - 0.1) << 24) | (q8(-0.1) << 16) | ((s.collar === 1 ? 1 : 0) << 8) | (faceBits(L, s) << 9) | Math.round(clamp(s.tailFlare * 1000, 0, 255))) >>> 0;
}

function makeAttr(geo: THREE.BufferGeometry, name: string, arr: Float32Array | Uint32Array, size: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(arr, size);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute(name, a);
  return a;
}

// one persistent update range per attribute (three's addUpdateRange pushes a new object every call; the
// renderer only empties the array after the upload, so the same range object can be pushed again each frame)
const ranges = new WeakMap<object, { start: number; count: number }>();
function flush(attr: THREE.BufferAttribute | THREE.InstancedBufferAttribute | THREE.InterleavedBuffer, count: number, itemSize: number): void {
  attr.updateRanges.length = 0;
  if (count > 0) {
    let r = ranges.get(attr);
    if (!r) {
      r = { start: 0, count: 0 };
      ranges.set(attr, r);
    }
    r.start = 0;
    r.count = count * itemSize;
    attr.updateRanges.push(r);
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
/** close level (sculpted face, fingers); 0 turns it off (`?nopeopledetail`) */
const LOD_CLOSE = 15;
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
  readonly close: Layer;
  readonly near: Layer;
  readonly far: Layer;
  readonly tiny: Layer;
  /** pin figures for the hero overview (beyond LOD_PIN) */
  readonly pin: Layer;
  /** shadow-only proxy: every figure near the camera, drawn with the tiny mesh into the shadow map */
  readonly shadow: Layer;
  /** debug: force every figure to one level (0 close, 1 near, 2 far, 3 tiny, 4 pin), -1 = by distance */
  forceLod = -1;
  /** debug hook (tests): called with every posed figure — (member, pose, rig, level 0 close / 1 near / 2 other) */
  probe: ((m: Member, o: Pose, r: Rig, lv: number) => void) | null = null;
  /** cross-fade level switches (tools turn it off for synchronous censuses) */
  xfade = true;
  readonly pram: THREE.InstancedMesh;
  readonly dog: THREE.InstancedMesh;
  readonly blob: THREE.InstancedMesh;
  /** cups, plates and glasses on the café tables in front of seated patrons */
  readonly tableware = new Tableware(256);
  readonly group = new THREE.Group();
  private pramMisc: THREE.InstancedBufferAttribute;
  private dogA: THREE.InstancedBufferAttribute;
  private dogCol: THREE.InstancedBufferAttribute;
  private dogHand: THREE.InstancedBufferAttribute;
  private blobA: THREE.InstancedBufferAttribute;
  readonly frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private m4 = new THREE.Matrix4();
  readonly sph = new THREE.Sphere();
  private fPlanes = new Float64Array(24);
  private hand = { x: 0, y: 0, z: 0 };
  private cam = new THREE.Vector3();
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
  /** members drawn this frame (reused, no garbage) */
  private list: Member[] = [];
  private edges = [0, 0, 0, 0];
  /** close-level distance (m at the reference view); 0 = off */
  closeDist = LOD_CLOSE;
  private camRef: THREE.PerspectiveCamera | null = null;

  constructor(scene: THREE.Scene, capacity: number, castShadow: boolean) {
    this.capacity = capacity;
    const pm = makePeopleMaterials();
    patchLampMaterial(pm.material);
    patchLampMaterial(pm.far);
    // ?pedfar=0: tiny / pin figures with the full shader (A/B of the far variant)
    const farMat = new URLSearchParams(location.search).get('pedfar') === '0' ? pm.material : pm.far;
    // ?pednear=far (debug A/B): the near level drawn with the far program — the upper bound of a leaner near shader
    const nearMat = new URLSearchParams(location.search).get('pednear') === 'far' ? pm.far : pm.material;
    this.close = new Layer(4, pm.material, null, Math.min(capacity, 48));
    this.near = new Layer(0, nearMat, null, Math.min(capacity, 96));
    this.far = new Layer(1, pm.material, null, capacity);
    this.tiny = new Layer(2, farMat, null, capacity);
    this.pin = new Layer(3, farMat, null, capacity);
    this.shadow = new Layer(2, makeInvisibleMaterial(), pm.depth, capacity);
    this.shadow.mesh.castShadow = true;
    this.shadow.mesh.receiveShadow = false;
    this.levels = [this.close, this.near, this.far, this.tiny, this.pin];
    this.layers = [this.close, this.near, this.far, this.tiny, this.pin, this.shadow];
    ['peds-close', 'peds-near', 'peds-far', 'peds-tiny', 'peds-pin', 'peds-shadow'].forEach((n, i) => (this.layers[i].mesh.name = n));
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
    this.group.add(this.tableware.mesh);

    for (const mesh of [this.close.mesh, this.near.mesh, this.far.mesh, this.tiny.mesh, this.pin.mesh, this.shadow.mesh, this.pram, this.dog, this.blob]) {
      mesh.frustumCulled = mesh === this.shadow.mesh;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).count = 0;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
    for (const l of [this.close, this.near, this.far, this.tiny, this.pin]) {
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
  write(crowd: Crowd, camera: THREE.PerspectiveCamera, t: number, rain: number, night: number, pxHeight = REF_HEIGHT, extra: Member[] | null = null, nExtra = 0): void {
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
    // table settings only where a 5–15 cm object still covers a few pixels
    const tableD = 70 * ls;
    this.tableware.begin();
    const closeD = this.closeDist * ls;
    edges[0] = closeD;
    edges[1] = nearD;
    edges[2] = tinyD;
    edges[3] = pinD;
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
    // frustum planes as plain numbers (the sphere test is inlined: three's Plane.distanceToPoint returns a
    // double through an un-inlined call — garbage per figure; index loops for the same reason as for-of)
    const FP = this.fPlanes;
    for (let i = 0; i < 6; i++) {
      const pl = this.frustum.planes[i];
      FP[i * 4] = pl.normal.x;
      FP[i * 4 + 1] = pl.normal.y;
      FP[i * 4 + 2] = pl.normal.z;
      FP[i * 4 + 3] = pl.constant;
    }
    // the crowd's members, then the extra figures (riders of the two-wheelers)
    const list = this.list;
    let nl = 0;
    const parties = crowd.parties;
    for (let pi = 0; pi < parties.length; pi++) {
      const p = parties[pi];
      if (p.state === 'gone') continue;
      const members = p.members;
      for (let mi = 0; mi < members.length; mi++) list[nl++] = members[mi];
    }
    for (let i = 0; i < nExtra; i++) list[nl++] = extra![i];
    for (let li = 0; li < nl; li++) {
      const m = list[li];
      const p = m.party;
      {
        if (!m.present || m.fade <= 0.01) continue;
        const L = m.look;
        const rad = 1.4 + (L.pram || L.dog ? 1.4 : L.flags & F.ROD ? 2.2 : 0);
        const cyS = m.y + 0.9;
        let inside = true;
        for (let i = 0; i < 24; i += 4) {
          if (FP[i] * m.x + FP[i + 1] * cyS + FP[i + 2] * m.z + FP[i + 3] < -rad) {
            inside = false;
            break;
          }
        }
        if (!inside) continue;
        const d2 = (m.x - this.cam.x) ** 2 + (m.y - this.cam.y) ** 2 + (m.z - this.cam.z) ** 2;
        const d = Math.sqrt(d2);
        let st = states.get(m);
        if (!st) {
          st = { lod: -1, gait: newGaitState(), prev: -1, xf: 1 };
          states.set(m, st);
        }
        // level with hysteresis around each switch distance
        let lv = d < closeD ? 0 : d < nearD ? 1 : d < tinyD ? 2 : d < pinD ? 3 : 4;
        if (st.lod >= 0 && Math.abs(lv - st.lod) === 1) {
          const edge = edges[Math.min(lv, st.lod)];
          if (Math.abs(d - edge) < HYST * Math.max(0.5, Math.min(lv, st.lod))) lv = st.lod;
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
        if (layer.n >= layer.capacity) layer = layer === this.close ? this.near : this.far;
        if (layer.n >= layer.capacity) layer = this.far;
        if (layer.n >= layer.capacity) continue;
        const out = st.prev >= 0 ? levels[st.prev] : null;
        const r = rigOf(L);
        const umbrella = raining && L.umbrellaOwner && m.sit < 0.3 && m.lie < 0.1 && m.ground < 0.1 && !L.pram;
        const gaitOn = m.rideG === null && (layer === this.close || layer === this.near || layer === this.far || out === this.close || out === this.near || out === this.far);
        poseIn.t = t + m.seed * 10;
        computePoseA(m, umbrella, r, pose, gaitOn ? st.gait : null, this.frame);
        if (this.probe !== null) this.probe(m, pose, r, layer === this.close ? 0 : layer === this.near ? 1 : 2);
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
        if (m.bag) flags |= bit(FB.SHOPBAG);
        if (umbrella) {
          flags |= bit(FB.UMBRELLA);
          CC[9] = ((L.umbrella & 0xffffff) | (CC[9] & 0xff000000)) >>> 0;
        }
        if ((m.reading && m.sit > 0.75 && m.cafe === 0) || (pose.spare1 > 2.5 && pose.spare1 < 3.5)) flags |= bit(FB.NEWSPAPER);
        else if (pose.spare1 > 0.5 && pose.spare1 < 2.5) flags |= bit(pose.spare1 < 1.5 ? FB.PHONE : FB.CUP);
        // café: what stands on the table in front of a seated patron (the cup / glass not while in the hand)
        if (m.cafe > 0 && m.sit > 0.85 && d < tableD && p.state === 'act' && ((p.goal?.cafe?.served ?? 2) >= 2 || p.timer > 50)) {
          const held = pose.spare1 > 1.5 && pose.spare1 < 2.5 ? HELD_CUP : pose.spare1 > 3.5 ? HELD_GLASS : 0;
          const fxT = Math.sin(m.yaw),
            fzT = Math.cos(m.yaw);
          const off = m.tabD + 0.05;
          this.tableware.add(m.x + fxT * off, m.y + m.tabH, m.z + fzT * off, m.yaw, m.order & ~held);
        }
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
        packPose(pose, PP);
        CC[10] = flags >>> 0;
        if (shadows && d2 < shadowD2 && this.shadow.n < this.shadow.capacity) this.shadow.put(R, PP, CC);
        if (out && out !== layer && out.n < out.capacity) {
          // incoming level keeps the dither cells below xf, the outgoing one (negative fade) the rest
          packScaleFade(pose.scale, -Math.max(0.002, st.xf), PP);
          out.put(R, PP, CC);
          packScaleFade(pose.scale, Math.min(0.994, st.xf), PP);
        }
        layer.put(R, PP, CC);
        // blob shadow
        const fx = Math.sin(m.yaw),
          fz = Math.cos(m.yaw);
        MI[3] = m.yaw;
        const lying = Math.max(m.lie, m.ground * 0.6);
        const ms = Math.min(1, m.sit);
        const sitK = ms * ms * (3 - 2 * ms);
        const bw = (0.56 + 0.18 * Math.max(sitK, lying)) * r.stature / 1.76;
        const bl = (0.56 + 0.12 * m.amp + 0.25 * sitK + 1.4 * lying) * r.stature / 1.76;
        if (nb < bcap) {
          const off = 0.08 * sitK + 0.1 * lying;
          MI[0] = mx + fx * off;
          MI[1] = m.y + 0.018;
          MI[2] = mz + fz * off;
          MI[4] = bw;
          MI[5] = 1;
          MI[6] = bl;
          yawMatrix(this.m4);
          this.blob.setMatrixAt(nb, this.m4);
          BA[nb++] = blobAlpha * m.fade;
        }
        // pram
        if (L.pram && np < this.pram.instanceMatrix.count) {
          MI[0] = mx;
          MI[1] = m.y;
          MI[2] = mz;
          MI[4] = MI[5] = MI[6] = Math.min(1.05, Math.max(0.95, L.scale));
          yawMatrix(this.m4);
          this.pram.setMatrixAt(np, this.m4);
          PM[np * 4] = L.pram.fabric;
          PM[np * 4 + 1] = m.fade;
          PM[np * 4 + 2] = 0;
          PM[np * 4 + 3] = 0;
          np++;
          if (nb < bcap) {
            MI[0] = mx + fx * 0.9;
            MI[1] = m.y + 0.016;
            MI[2] = mz + fz * 0.9;
            MI[4] = 0.55;
            MI[5] = 1;
            MI[6] = 0.95;
            yawMatrix(this.m4);
            this.blob.setMatrixAt(nb, this.m4);
            BA[nb++] = blobAlpha * 0.9 * m.fade;
          }
        }
        // dog
        if (L.dog && nd < this.dog.instanceMatrix.count) {
          MI[0] = mx;
          MI[1] = m.y;
          MI[2] = mz;
          MI[4] = MI[5] = MI[6] = L.scale;
          yawMatrix(this.m4);
          this.dog.setMatrixAt(nd, this.m4);
          const d4 = nd * 4;
          const dogAmp = Math.min(1.5, m.speed / (0.95 * L.dog.size));
          DA[d4] = m.dogPhase;
          DA[d4 + 1] = dogAmp;
          DA[d4 + 2] = m.dogSit * m.dogSit * (3 - 2 * m.dogSit);
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
            MI[0] = mx + (fz * DOG_OFFSET.x + fx * DOG_OFFSET.z) * sc;
            MI[1] = m.y + 0.017;
            MI[2] = mz + (-fx * DOG_OFFSET.x + fz * DOG_OFFSET.z) * sc;
            MI[4] = 0.32 * L.dog.size;
            MI[5] = 1;
            MI[6] = 0.6 * L.dog.size;
            yawMatrix(this.m4);
            this.blob.setMatrixAt(nb, this.m4);
            BA[nb++] = blobAlpha * 0.85 * m.fade;
          }
        }
      }
    }
    for (let i = 0; i < all.length; i++) all[i].finish();
    this.tableware.finish();
    this.visible = this.close.n + this.near.n + this.far.n + this.tiny.n + this.pin.n;
    this.triangles = this.close.n * this.close.tris + this.near.n * this.near.tris + this.far.n * this.far.tris + this.tiny.n * this.tiny.tris + this.pin.n * this.pin.tris;
    this.vertices = this.close.n * this.close.verts + this.near.n * this.near.verts + this.far.n * this.far.verts + this.tiny.n * this.tiny.verts + this.pin.n * this.pin.verts;
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
    for (const l of [this.close, this.near, this.far, this.tiny, this.pin, this.shadow]) {
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
    this.tableware.dispose();
    this.group.removeFromParent();
  }
}

/** sunbathing: swimwear colours / hems, accessories off */
export function swimwear(L: Look, s: Style, flags: number, C: Uint32Array): number {
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
