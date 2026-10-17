// Geometry accumulator for the landmarks module.
//
// Every primitive is transformed into world space and appended to a few growable
// typed arrays, so a whole district of landmarks becomes ONE draw call per material.
// Each vertex carries:
//   position, normal, color          (standard)
//   aPuv  (vec2)  pattern coordinates in metres (u along the surface, v up / up-slope)
//                 or 0..1 for "native" patterns (windows, clock faces, flags)
//   aMat  (vec4)  x = pattern id, y = metal*9 (int) + roughness (frac),
//                 z = pattern parameter (night glow / lattice width…),
//                 w = flood-light type (int) + per-object seed (frac)
// Kinetic builders additionally carry aPivot (vec3), aAxis (vec3) and aAnim (vec4)
// which the vertex shader uses to spin / swing / slide parts (see shaders.ts).

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Surface patterns understood by the landmark shader (keep in sync with shaders.ts). */
export const PAT = {
  PLAIN: 0,
  BRICK: 1,
  STONE: 2,
  TILES: 3,
  SLATE: 4,
  SEAM: 5,
  GLAZING: 6,
  WINDOW: 7,
  CONCRETE: 8,
  PLANKS: 9,
  CORRUGATED: 10,
  SEATS: 11,
  STRIPES: 12,
  CLOCK: 13,
  FLAG: 14,
  LATTICE: 15,
  SCAFFOLD: 16,
  MESH: 17,
  LOUVRE: 18,
  ROSE: 19,
  STAINED: 20,
  GRAVEL: 21,
  RAILING: 22,
  PANELS: 23,
  RUST: 24,
  DOOR: 25,
  SHUTTER: 26,
} as const;

/** Patterns compiled only into the ornament / kinetic shaders (rare, register-heavy). */
export const ORNAMENT_PATS: ReadonlySet<number> = new Set([PAT.CLOCK, PAT.FLAG, PAT.ROSE, PAT.STAINED]);

/** Flood-light (night uplight) types, see shaders.ts. */
export const FLOOD = { NONE: 0, WARM: 1, TOWER: 2, CHURCH: 3, SOFT: 4 } as const;

/** Kinetic animation modes (vertex shader). */
export const ANIM = {
  STATIC: 0,
  /** angle = a * t + b */
  SPIN: 1,
  /** angle = a * sin(b * t + c) */
  SWING: 2,
  /** crane slewing parts: angle = uCrane.x about +Y through the pivot */
  CRANE_SLEW: 5,
  /** crane trolley: slide along aAxis by uCrane.y, then slew */
  CRANE_TROLLEY: 6,
  /** crane cable / hook / load: like the trolley, plus drop by uCrane.z * a (a = weight); b = 1 → load (hidden when uCrane.w < .5) */
  CRANE_HOOK: 7,
  /** flag cloth: a = flag length, b = phase; points down-wind, waves */
  FLAG: 8,
  /** angle = uSpin[b] * a + c (CPU-accumulated angles: TV ring, turbines, roundabout, bells) */
  SPIN_U: 9,
  /** visible only while uVis[a] > .5; sways by c * sin(2.2 t + phase)… (a = group, b = amplitude, c = phase) */
  VIS: 10,
} as const;

export interface Mat {
  c: THREE.Color;
  pat: number;
  rough: number;
  metal: number;
  glow: number;
  flood: number;
  seed: number;
  /** raw aMat override (lights / signs use their own channel meanings) */
  raw?: [number, number, number, number];
}

/** Make a surface description. */
export function M(
  color: THREE.ColorRepresentation,
  pat: number = PAT.PLAIN,
  rough = 0.85,
  metal = 0,
  glow = 0,
  flood = 0,
  seed = 0,
): Mat {
  return { c: new THREE.Color(color), pat, rough, metal, glow, flood, seed };
}

/** Copy of a Mat with some fields replaced. */
export function withM(m: Mat, o: Partial<Omit<Mat, 'c'>> & { c?: THREE.ColorRepresentation }): Mat {
  return {
    c: o.c !== undefined ? new THREE.Color(o.c) : m.c,
    pat: o.pat ?? m.pat,
    rough: o.rough ?? m.rough,
    metal: o.metal ?? m.metal,
    glow: o.glow ?? m.glow,
    flood: o.flood ?? m.flood,
    seed: o.seed ?? m.seed,
    raw: m.raw,
  };
}

/** Lights-mesh surface: mode (see shaders LIGHTS_VERT), HDR intensity, blink phase, day level. */
export function LM(color: THREE.ColorRepresentation, mode: number, intensity: number, phase = 0, day = 0): Mat {
  return { c: new THREE.Color(color), pat: 0, rough: 0, metal: 0, glow: 0, flood: 0, seed: 0, raw: [mode, intensity, phase, day] };
}

/** Light modes of the lights mesh. */
export const LMODE = { NIGHT: 0, BLINK: 1, ALWAYS: 2, CHASE: 3, SCORE: 4, FLOOD: 5, STROBE: 6, WARM: 7 } as const;

export type UvMode = 'box' | 'cyl' | 'native' | 'world';

class FBuf {
  a: Float32Array;
  n = 0;
  constructor(cap = 1024) {
    this.a = new Float32Array(cap);
  }
  reserve(k: number): void {
    if (this.n + k <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + k) cap *= 2;
    const b = new Float32Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  trimmed(): Float32Array {
    return this.a.slice(0, this.n);
  }
}

class IBuf {
  a: Uint32Array;
  n = 0;
  constructor(cap = 1024) {
    this.a = new Uint32Array(cap);
  }
  reserve(k: number): void {
    if (this.n + k <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + k) cap *= 2;
    const b = new Uint32Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
}

export interface AnimSpec {
  mode: number;
  /** pivot in LANDMARK-local coordinates (transformed by the frame) */
  pivot: THREE.Vector3;
  /** axis in landmark-local coordinates (rotated by the frame) */
  axis: THREE.Vector3;
  a: number;
  b: number;
  c: number;
}

const _up1 = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _lm = new THREE.Matrix4();
const _nmLocal = new THREE.Matrix3();

export class MeshBuilder {
  readonly kinetic: boolean;
  private pos = new FBuf(4096);
  private nrm = new FBuf(4096);
  private col = new FBuf(4096);
  private puv = new FBuf(2048);
  private mat = new FBuf(4096);
  private piv: FBuf | null = null;
  private axs: FBuf | null = null;
  private anm: FBuf | null = null;
  private idx = new IBuf(8192);
  private vcount = 0;
  /** landmark-local → world */
  readonly frame = new THREE.Matrix4();
  private frameN = new THREE.Matrix3();
  private frameYaw = 0;
  /** current animation (kinetic builders only) */
  anim: AnimSpec | null = null;
  /** primitives with rare/complex patterns (clock, flag, rose, stained glass) are forwarded here
   *  so the common static shader can be compiled without them (smaller, faster program) */
  ornament: MeshBuilder | null = null;
  /** detail sink (distance-LOD mesh): small trims are forwarded here with their centre as pivot */
  detail: MeshBuilder | null = null;
  /** force every primitive into the detail sink (window surrounds, quoins, goods…) */
  forceDetail = false;
  /** never route to the detail sink (statues, people: must stay visible from afar) */
  keepCore = false;
  /** optional per-vertex check (world coordinates) — footprint validation */
  check: ((x: number, y: number, z: number) => void) | null = null;
  /** world-space bounds of everything added */
  readonly bounds = new THREE.Box3();

  constructor(kinetic = false) {
    this.kinetic = kinetic;
    if (kinetic) {
      this.piv = new FBuf(1024);
      this.axs = new FBuf(1024);
      this.anm = new FBuf(1024);
    }
  }

  get vertexCount(): number {
    return this.vcount;
  }
  get triangleCount(): number {
    return this.idx.n / 3;
  }

  /** Set the landmark frame: local +Z rotated to face `yaw`, origin at (x, y, z). */
  setFrame(x: number, y: number, z: number, yaw = 0): void {
    this.frame.makeRotationY(yaw).setPosition(x, y, z);
    this.frameN.getNormalMatrix(this.frame);
    this.frameYaw = yaw;
  }
  get yaw(): number {
    return this.frameYaw;
  }

  /**
   * Append a geometry. `local` places it inside the landmark frame.
   * uv: 'box' (planar by dominant normal, primitive space + local translation, metres),
   *     'cyl' (u = native uv.x * circumference, v = height), 'native' (geometry uv * scale),
   *     'world' (planar by dominant normal in landmark space).
   */
  add(geo: THREE.BufferGeometry, m: Mat, local?: THREE.Matrix4 | null, uv: UvMode = 'box', su = 1, sv = 1): void {
    if (this.ornament && !m.raw && ORNAMENT_PATS.has(m.pat)) {
      // forward as a static (non-animated) primitive with the same frame
      const keepAnim = this.ornament.anim;
      this.ornament.anim = null;
      this.ornament.add(geo, m, local, uv, su, sv);
      this.ornament.anim = keepAnim;
      return;
    }
    if (this.detail && !m.raw && !this.keepCore) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      _q.subVectors(bb.max, bb.min);
      const sc = local ? _t.setFromMatrixScale(local) : _t.set(1, 1, 1);
      const ex = [Math.abs(_q.x * sc.x), Math.abs(_q.y * sc.y), Math.abs(_q.z * sc.z)].sort((a, b) => a - b);
      // tiny bits (< 25 cm) and thin rods / bars (< 5 cm thick, < 3 m long) are sub-pixel from afar
      const small = ex[2] < 0.25 || (ex[0] < 0.05 && ex[1] < 0.05 && ex[2] < 3.0);
      if (this.forceDetail || small) {
        const c = bb.getCenter(new THREE.Vector3());
        if (local) c.applyMatrix4(local);
        const keep = this.detail.anim;
        this.detail.anim = { mode: 0, pivot: c, axis: _up1, a: 0, b: 0, c: 0 };
        this.detail.add(geo, m, local, uv, su, sv);
        this.detail.anim = keep;
        return;
      }
    }
    // weld triangle soups (ExtrudeGeometry, ShapeGeometry lids…) so shared corners are shaded
    // once: the vertex stage (and on tiled GPUs the varyings bandwidth) was the measured bottleneck
    if (!geo.index && geo.attributes.position.count > 6) {
      const welded = mergeVertices(geo, 1e-4);
      this.add(welded, m, local, uv, su, sv);
      welded.dispose();
      return;
    }
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    let N = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!N) {
      geo.computeVertexNormals();
      N = geo.getAttribute('normal') as THREE.BufferAttribute;
    }
    const UV = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const C = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    const n = P.count;
    const base = this.vcount;
    this.pos.reserve(n * 3);
    this.nrm.reserve(n * 3);
    this.col.reserve(n * 3);
    this.puv.reserve(n * 2);
    this.mat.reserve(n * 4);
    if (this.kinetic) {
      this.piv!.reserve(n * 3);
      this.axs!.reserve(n * 3);
      this.anm!.reserve(n * 4);
    }
    if (local) {
      _lm.copy(local);
      _nmLocal.getNormalMatrix(local);
      _t.setFromMatrixPosition(local);
    } else {
      _lm.identity();
      _nmLocal.identity();
      _t.set(0, 0, 0);
    }
    _m3.copy(this.frameN).multiply(_nmLocal);
    const yv = m.metal > 0 ? Math.floor(m.metal * 9 + 0.5) : 0;
    const matX = m.raw ? m.raw[0] : m.pat;
    const matY = m.raw ? m.raw[1] : yv + Math.min(Math.max(m.rough, 0.02), 0.99);
    const matZ = m.raw ? m.raw[2] : m.glow;
    const matW = m.raw ? m.raw[3] : m.flood + Math.min(Math.max(m.seed, 0), 0.999);
    const pa = this.pos.a,
      na = this.nrm.a,
      ca = this.col.a,
      ua = this.puv.a,
      ma = this.mat.a;
    let pi = this.pos.n,
      ui = this.puv.n,
      mi = this.mat.n;
    // anim (constant per call)
    let apx = 0,
      apy = 0,
      apz = 0,
      aax = 0,
      aay = 1,
      aaz = 0;
    if (this.kinetic && this.anim) {
      _q.copy(this.anim.pivot).applyMatrix4(this.frame);
      apx = _q.x;
      apy = _q.y;
      apz = _q.z;
      _q.copy(this.anim.axis).applyMatrix3(this.frameN).normalize();
      aax = _q.x;
      aay = _q.y;
      aaz = _q.z;
    }
    for (let i = 0; i < n; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      // pattern coordinates
      let u = 0,
        v = 0;
      if (uv === 'native') {
        u = (UV ? UV.getX(i) : 0) * su;
        v = (UV ? UV.getY(i) : 0) * sv;
      } else if (uv === 'cyl') {
        if (Math.abs(_n.y) > 0.9) {
          u = _p.x + _t.x;
          v = _p.z + _t.z;
        } else {
          u = (UV ? UV.getX(i) : 0) * su;
          v = _p.y + _t.y;
        }
      } else {
        let qx: number, qy: number, qz: number, nx: number, ny: number, nz: number;
        if (uv === 'world') {
          _q.copy(_p).applyMatrix4(_lm);
          qx = _q.x;
          qy = _q.y;
          qz = _q.z;
          _q.copy(_n).applyMatrix3(_nmLocal);
          nx = Math.abs(_q.x);
          ny = Math.abs(_q.y);
          nz = Math.abs(_q.z);
        } else {
          qx = _p.x + _t.x;
          qy = _p.y + _t.y;
          qz = _p.z + _t.z;
          nx = Math.abs(_n.x);
          ny = Math.abs(_n.y);
          nz = Math.abs(_n.z);
        }
        if (ny >= nx && ny >= nz) {
          u = qx;
          v = qz;
        } else if (nx >= nz) {
          u = qz;
          v = qy;
        } else {
          u = qx;
          v = qy;
        }
        u *= su;
        v *= sv;
      }
      // transform
      _p.applyMatrix4(_lm).applyMatrix4(this.frame);
      _n.applyMatrix3(_m3).normalize();
      pa[pi] = _p.x;
      pa[pi + 1] = _p.y;
      pa[pi + 2] = _p.z;
      na[pi] = _n.x;
      na[pi + 1] = _n.y;
      na[pi + 2] = _n.z;
      if (C) {
        ca[pi] = C.getX(i) * m.c.r;
        ca[pi + 1] = C.getY(i) * m.c.g;
        ca[pi + 2] = C.getZ(i) * m.c.b;
      } else {
        ca[pi] = m.c.r;
        ca[pi + 1] = m.c.g;
        ca[pi + 2] = m.c.b;
      }
      if (this.kinetic) {
        const kp = this.piv!.a,
          ka = this.axs!.a,
          kn = this.anm!.a;
        kp[pi] = apx;
        kp[pi + 1] = apy;
        kp[pi + 2] = apz;
        ka[pi] = aax;
        ka[pi + 1] = aay;
        ka[pi + 2] = aaz;
        const j = (base + i) * 4;
        kn[j] = this.anim ? this.anim.mode : 0;
        kn[j + 1] = this.anim ? this.anim.a : 0;
        kn[j + 2] = this.anim ? this.anim.b : 0;
        kn[j + 3] = this.anim ? this.anim.c : 0;
      }
      ua[ui] = u;
      ua[ui + 1] = v;
      ma[mi] = matX;
      ma[mi + 1] = matY;
      ma[mi + 2] = matZ;
      ma[mi + 3] = matW;
      if (this.check) this.check(_p.x, _p.y, _p.z);
      this.bounds.expandByPoint(_p);
      pi += 3;
      ui += 2;
      mi += 4;
    }
    this.pos.n = pi;
    this.nrm.n = pi;
    this.col.n = pi;
    this.puv.n = ui;
    this.mat.n = mi;
    if (this.kinetic) {
      this.piv!.n = pi;
      this.axs!.n = pi;
      this.anm!.n = (base + n) * 4;
    }
    // indices
    const I = geo.getIndex();
    if (I) {
      this.idx.reserve(I.count);
      const ia = this.idx.a;
      let k = this.idx.n;
      for (let i = 0; i < I.count; i++) ia[k++] = base + I.getX(i);
      this.idx.n = k;
    } else {
      this.idx.reserve(n);
      const ia = this.idx.a;
      let k = this.idx.n;
      for (let i = 0; i < n; i++) ia[k++] = base + i;
      this.idx.n = k;
    }
    this.vcount += n;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.trimmed(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.trimmed(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.trimmed(), 3));
    g.setAttribute('aPuv', new THREE.BufferAttribute(this.puv.trimmed(), 2));
    g.setAttribute('aMat', new THREE.BufferAttribute(this.mat.trimmed(), 4));
    if (this.kinetic) {
      g.setAttribute('aPivot', new THREE.BufferAttribute(this.piv!.trimmed(), 3));
      g.setAttribute('aAxis', new THREE.BufferAttribute(this.axs!.trimmed(), 3));
      g.setAttribute('aAnim', new THREE.BufferAttribute(this.anm!.trimmed(), 4));
    }
    const ia = this.idx.a.slice(0, this.idx.n);
    g.setIndex(new THREE.BufferAttribute(this.vcount > 65535 ? ia : new Uint16Array(ia), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
