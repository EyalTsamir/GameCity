// The near-detail bubble (close-up round, docs/progress/close-foundation.md): fine detail that exists only around the
// camera, for any module. Cells of a world grid are built on demand by a budgeted queue, ahead of the camera, shown
// inside a radius and dropped behind it. No cost in far views (nothing built, nothing drawn, one short test per frame),
// no stutter when it appears (materials compiled at boot, at most ~1 ms of building per frame, faded by distance).
//
//   const near = nearOf(ctx);
//   near.addScatter({ name: 'nearGrit', radius: 18, geometry, material, capacity: 4000, fill(cell, out) { out.put(x, y, z, yaw, s); } });
//   near.addMeshes({ name: 'handles', radius: nearRadiusFor(0.03), material, build(cell) { return geometryOrNull; } });
//   near.addCells({ name: 'cats', cell: 48, radius: 40, make(cell) { return item; }, show(item, on) {}, drop(item) {} });
//   near.job(() => drawOneMenuIntoTheAtlas());           // any other work: one at a time, inside the same budget
//   nearGrow(material, 18) / nearDither(material, 30)    // fade by distance, no pop (see below)
//
// Radius: choose it where the detail falls under a pixel, `nearRadiusFor(sizeInMetres)`, and appearing is invisible
// even without a fade. It is scaled by the lens (`nearLens.value`): a magnified view brings the detail in further out,
// so anything picked by distance should use `nearDistance()` or multiply its limit by `nearLens.value`.
//
// Per-pixel detail in a shader: `#include`-style string `NEAR_GLSL` gives `thNearK(worldPos, radius)`. Beware that on
// this GPU a bigger program costs even for the path not taken (docs/progress/baking.md): prefer geometry that exists
// only here, or a second program chosen by geometry, to a branch in a city-wide shader.
//
// Switches: ?nonear all of it, ?no<layer name> one layer, spec.min the lowest quality tier, ?nearr=<k> scales every
// radius (to look for the edge), ?neardebug paints what the bubble holds. `__city.near` in the page: stats(), flush().

import * as THREE from 'three';
import type { CityContext, QualityLevel } from './context';
import { globalUniforms } from './uniforms';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const RADIUS_K = Math.max(0.1, parseFloat(params?.get('nearr') ?? '1') || 1);
const DEBUG = !!params?.has('neardebug');

/** is the bubble's layer `name` on regardless of tier (`?no<name>` / `?nonear` off)? */
export function nearOn(name?: string): boolean {
  return !(params && (params.has('nonear') || (name !== undefined && params.has('no' + name))));
}

/** the reference view: walking, 50° vertical fov, a drawing buffer 1025 px tall */
const REF_FOV = 50;
const REF_HEIGHT = 1025;
const REF_TAN = Math.tan((REF_FOV * Math.PI) / 360);
/** pixels one metre covers at 1 m in the reference view */
const REF_PX = REF_HEIGHT / (2 * REF_TAN);

/**
 * How big things look. `value`: pixels per metre against the reference view, all in (0.72 walking at 1025 px, 1 orbiting
 * close, 2.9 through a ×4 lens while walking); read it for a detail radius. `zoom`: only the magnification the user
 * asked for (1 unless the lens is in use); multiply the limits of an older level of detail by it, so that it brings the
 * detail in through a lens and changes nothing otherwise. Updated per frame.
 */
export const nearLens = { value: 1, zoom: 1 };

/** how far (m, reference view) something `size` metres across still covers `px` pixels: the radius where it can appear unseen */
export function nearRadiusFor(size: number, px = 1): number {
  return (size * REF_PX) / px;
}

/** the distance a lens makes `d` metres look like */
export function nearDistance(d: number): number {
  return d / nearLens.value;
}

/** the magnification of a camera: the same formula the bubble uses, for a level of detail picked in a module */
export function lensOf(fovDeg: number, pxHeight: number): number {
  return (Math.max(200, pxHeight) / REF_HEIGHT) * (REF_TAN / Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * Vertex or fragment GLSL: 1 well inside radius R (metres, reference view; the lens scales it) of the main camera, 0 at
 * and beyond it. `uNearEye` stays the main camera in the shadow and reflection passes, where `cameraPosition` does not.
 */
export const NEAR_GLSL = /* glsl */ `
uniform vec3 uNearEye;
uniform float uNearLens;
float thNearK(vec3 p, float R) {
  float r = R * uNearLens;
  return 1.0 - smoothstep(r * 0.7, r, distance(p, uNearEye));
}
`;

const addNearUniforms = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.uniforms.uNearEye = globalUniforms.uNearEye;
  shader.uniforms.uNearLens = globalUniforms.uNearLens;
};

/** chain onto a material's own onBeforeCompile and program key */
function patch(material: THREE.Material, key: string, fn: (shader: THREE.WebGLProgramParametersWithUniforms) => void): void {
  const prev = material.onBeforeCompile;
  // (the default key is the source of onBeforeCompile: capture it before wrapping)
  const own = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null;
  const base = own ? '' : prev.toString();
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    addNearUniforms(shader);
    fn(shader);
  };
  material.customProgramCacheKey = () => (own ? own.call(material) : base) + key;
  material.needsUpdate = true;
}

/** instances of this material grow out of nothing from 100 % to 70 % of radius R (instance origin); the vertices beyond it collapse, so they cost no pixels */
export function nearGrow(material: THREE.Material, radius: number): void {
  const R = (radius * RADIUS_K).toFixed(2);
  patch(material, `|nearGrow${R}`, (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${NEAR_GLSL}`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  transformed *= thNearK((modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz, ${R});
#endif`,
    );
  });
}

/** this material dissolves in a screen-door pattern from 70 % to 100 % of radius R (a discard: for near-only meshes, not city-wide ones) */
export function nearDither(material: THREE.Material, radius: number): void {
  const R = (radius * RADIUS_K).toFixed(2);
  patch(material, `|nearDither${R}`, (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNearW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vNearW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vNearW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vNearW;\n${NEAR_GLSL}`).replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
  { // interleaved gradient noise
    float nk = thNearK(vNearW, ${R});
    if (nk < 0.999 && nk <= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
  }`,
    );
  });
}

/** one cell of a layer's grid, handed to its builder */
export interface NearCell {
  i: number;
  j: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** a stable number for this layer and cell: the same detail every time the camera comes back */
  seed: number;
}

/** a small fast random stream from a cell's seed (mulberry32) */
export function nearRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LayerBase {
  /** names the `?no<name>` switch and the stats entry */
  name: string;
  /** shown while the camera is within this many metres of the cell rectangle (reference view; the lens scales it) */
  radius: number;
  /** cell size (m), default 16; about half the radius is a good start */
  cell?: number;
  /** the detail stands this high above the ground (m), default 4: the camera's height above that counts as distance */
  top?: number;
  /** built this much further out than shown (m), default one cell */
  margin?: number;
  /** lowest quality tier, default medium */
  min?: QualityLevel;
}

export interface NearCellsSpec<T> extends LayerBase {
  make(cell: NearCell): T | null;
  show(item: T, on: boolean, cell: NearCell): void;
  drop(item: T, cell: NearCell): void;
  /** cells kept built behind the camera, default four times what the ring holds */
  keep?: number;
}

export interface NearMeshSpec extends LayerBase {
  material: THREE.Material;
  build(cell: NearCell): THREE.BufferGeometry | null;
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
  /** a geometry with the attributes of a built cell, for the shader compile at boot; default position + normal + uv + rgb colour */
  standIn?: THREE.BufferGeometry;
  keep?: number;
  /** a built cell comes on show or goes */
  onShow?(cell: NearCell, on: boolean): void;
}

export interface NearEmit {
  /** one instance: position, turn about Y, uniform or (sx, sy, sz) size, a small tilt about X and Z (radians), an rgb colour */
  put(x: number, y: number, z: number, yaw: number, sx: number, sy?: number, sz?: number, tiltX?: number, tiltZ?: number, r?: number, g?: number, b?: number): void;
}

export interface NearScatterSpec extends LayerBase {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** instances at most, over all the cells on show: nearest cells win */
  capacity: number;
  /** instances at most in one cell, default capacity / 4 */
  perCell?: number;
  colors?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
  fill(cell: NearCell, out: NearEmit): void;
  keep?: number;
}

type Slot<T> = NearCell & { key: number; item: T | null; state: 0 | 1 | 2; shown: boolean; stamp: number; d2: number; layer: Layer<T> };

const QUEUED = 0;
const BUILT = 1;
const EMPTY = 2;

class Layer<T> {
  readonly name: string;
  readonly radius: number;
  readonly cell: number;
  readonly top: number;
  readonly margin: number;
  readonly keep: number;
  private readonly hash: number;
  readonly map = new Map<number, Slot<T>>();
  /** built, non-empty */
  readonly live: Slot<T>[] = [];
  shownCount = 0;
  buildMs = 0;
  builds = 0;
  /** a change in what is shown, seen once by the owner this frame */
  changed = false;

  constructor(
    spec: LayerBase & { keep?: number },
    private readonly make: (c: NearCell) => T | null,
    private readonly showFn: (item: T, on: boolean, c: NearCell) => void,
    private readonly dropFn: (item: T, c: NearCell) => void,
    private readonly bubble: NearDetail,
  ) {
    this.name = spec.name;
    this.radius = spec.radius * RADIUS_K;
    this.cell = spec.cell ?? 16;
    this.top = spec.top ?? 4;
    this.margin = spec.margin ?? this.cell;
    const across = Math.ceil((2 * (this.radius + this.margin)) / this.cell) + 1;
    this.keep = spec.keep ?? across * across * 4;
    let h = 2166136261;
    for (let k = 0; k < this.name.length; k++) h = Math.imul(h ^ this.name.charCodeAt(k), 16777619);
    this.hash = h >>> 0;
  }

  private slot(i: number, j: number, key: number): Slot<T> {
    const size = this.cell;
    const seed = (Math.imul(i + 4096, 73856093) ^ Math.imul(j + 4096, 19349663) ^ this.hash) >>> 0;
    const s: Slot<T> = { i, j, key, x0: i * size, z0: j * size, x1: (i + 1) * size, z1: (j + 1) * size, seed, item: null, state: QUEUED, shown: false, stamp: 0, d2: 0, layer: this };
    this.map.set(key, s);
    return s;
  }

  /** note every cell the camera (now, and where it is heading) will want */
  scan(ex: number, ez: number, ax: number, az: number, lens: number, agl: number, stamp: number, queue: Slot<unknown>[]): void {
    const dy = Math.max(0, agl - this.top);
    const R = this.radius * lens + this.margin;
    if (dy >= R) return;
    const r = Math.sqrt(R * R - dy * dy);
    const size = this.cell;
    const i0 = Math.floor((Math.min(ex, ax) - r) / size),
      i1 = Math.floor((Math.max(ex, ax) + r) / size);
    const j0 = Math.floor((Math.min(ez, az) - r) / size),
      j1 = Math.floor((Math.max(ez, az) + r) / size);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const x0 = i * size,
          z0 = j * size;
        const d2 = Math.min(rectD2(ex, ez, x0, z0, size), rectD2(ax, az, x0, z0, size));
        if (d2 > r * r) continue;
        const key = (i + 32768) * 65536 + (j + 32768);
        let s = this.map.get(key);
        if (!s) {
          s = this.slot(i, j, key);
          queue.push(s as Slot<unknown>);
        }
        s.stamp = stamp;
        s.d2 = d2;
      }
    }
  }

  build(s: Slot<T>): void {
    const t0 = performance.now();
    const item = this.make(s);
    this.builds++;
    if (item === null) s.state = EMPTY;
    else {
      s.item = item;
      s.state = BUILT;
      this.live.push(s);
      if (this.live.length > this.keep) this.evict();
    }
    this.buildMs = Math.max(this.buildMs, performance.now() - t0);
    this.bubble.spent += performance.now() - t0;
  }

  forget(s: Slot<T>): void {
    this.map.delete(s.key);
  }

  /** show and hide the built cells; once per frame */
  tick(ex: number, ez: number, lens: number, agl: number): void {
    const dy = Math.max(0, agl - this.top);
    const R = this.radius * lens;
    const live = this.live;
    for (let k = 0; k < live.length; k++) {
      const s = live[k];
      const d2 = rectD2(ex, ez, s.x0, s.z0, this.cell) + dy * dy;
      s.d2 = d2;
      const on = d2 < R * R * (s.shown ? 1.1 : 1);
      if (on !== s.shown) {
        s.shown = on;
        this.shownCount += on ? 1 : -1;
        this.showFn(s.item as T, on, s);
        this.changed = true;
      }
    }
  }

  /** the furthest cell not on show goes */
  private evict(): void {
    let worst = -1,
      wd = -1;
    for (let k = 0; k < this.live.length; k++) {
      const s = this.live[k];
      if (!s.shown && s.d2 > wd) {
        wd = s.d2;
        worst = k;
      }
    }
    if (worst < 0) return;
    const s = this.live[worst];
    this.live[worst] = this.live[this.live.length - 1];
    this.live.pop();
    this.dropFn(s.item as T, s);
    s.item = null;
    this.map.delete(s.key);
  }
}

const rectD2 = (x: number, z: number, x0: number, z0: number, size: number): number => {
  const dx = Math.max(x0 - x, 0, x - (x0 + size)),
    dz = Math.max(z0 - z, 0, z - (z0 + size));
  return dx * dx + dz * dz;
};

/** the scratch an emitter fills: 16 floats + 3 per instance */
class Emit implements NearEmit {
  n = 0;
  constructor(
    readonly m: Float32Array,
    readonly c: Float32Array | null,
    readonly cap: number,
  ) {}
  put(x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx, tiltX = 0, tiltZ = 0, r = 1, g = 1, b = 1): void {
    if (this.n >= this.cap) return;
    const k = this.n * 16,
      m = this.m;
    const cy = Math.cos(yaw),
      sn = Math.sin(yaw);
    const ca = Math.cos(tiltX),
      sa = Math.sin(tiltX);
    const cb = Math.cos(tiltZ),
      sb = Math.sin(tiltZ);
    // R = Ry(yaw) · Rx(tiltX) · Rz(tiltZ)
    m[k] = (cy * cb + sn * sa * sb) * sx;
    m[k + 1] = ca * sb * sx;
    m[k + 2] = (-sn * cb + cy * sa * sb) * sx;
    m[k + 3] = 0;
    m[k + 4] = (-cy * sb + sn * sa * cb) * sy;
    m[k + 5] = ca * cb * sy;
    m[k + 6] = (sn * sb + cy * sa * cb) * sy;
    m[k + 7] = 0;
    m[k + 8] = sn * ca * sz;
    m[k + 9] = -sa * sz;
    m[k + 10] = cy * ca * sz;
    m[k + 11] = 0;
    m[k + 12] = x;
    m[k + 13] = y;
    m[k + 14] = z;
    m[k + 15] = 1;
    if (this.c) {
      const q = this.n * 3;
      this.c[q] = r;
      this.c[q + 1] = g;
      this.c[q + 2] = b;
    }
    this.n++;
  }
}

/** building budget per frame (ms), and after a camera cut (the picture has just jumped: nobody sees a slow frame) */
const BUDGET = 1;
const BUDGET_CUT = 10;
const CUT_FRAMES = 12;
/** one frame this far is a cut, not a flight */
const CUT_METRES = 30;
/** faster than this (m/s) the camera is on its way somewhere: nothing new is built */
const FLYING = 90;
/** how far ahead (s) the cells are wanted */
const LOOK_AHEAD = 1.2;

export class NearDetail {
  private readonly layers: Layer<unknown>[] = [];
  private readonly scatters: { flush(): void }[] = [];
  private readonly queue: Slot<unknown>[] = [];
  private readonly jobs: (() => void)[] = [];
  private readonly last = new THREE.Vector3();
  private readonly lastScan = new THREE.Vector3(1e9, 0, 0);
  private readonly vel = new THREE.Vector3();
  private lastLens = 0;
  private stamp = 0;
  private cutLeft = 0;
  private flushNext = true;
  private started = false;
  private agl = 0;
  /** ms spent building this frame (cells and jobs) */
  spent = 0;
  private maxFrameMs = 0;
  readonly root = new THREE.Group();

  constructor(private readonly ctx: CityContext) {
    this.root.name = 'near-detail';
    ctx.scene.add(this.root);
  }

  /** would a layer with this name and tier be built at all? */
  wants(name: string, min: QualityLevel = 'medium'): boolean {
    return nearOn(name) && RANK[this.ctx.quality.level] >= RANK[min];
  }

  /** the general form: anything made per cell, shown and hidden with it */
  addCells<T>(spec: NearCellsSpec<T>): void {
    if (!this.wants(spec.name, spec.min)) return;
    this.layers.push(new Layer<T>(spec, spec.make, spec.show, spec.drop, this) as unknown as Layer<unknown>);
  }

  /** a merged mesh per cell */
  addMeshes(spec: NearMeshSpec): void {
    if (!this.wants(spec.name, spec.min)) return;
    const group = new THREE.Group();
    group.name = `near-${spec.name}`;
    this.root.add(group);
    const material = DEBUG ? this.tinted(spec.material) : spec.material;
    // never drawn: the boot warm-up shows every hidden object, so its program is ready before the first cell
    const stand = new THREE.Mesh(spec.standIn ?? standInGeometry(), material);
    stand.name = `near-${spec.name}-standin`;
    stand.visible = false;
    stand.frustumCulled = false;
    stand.castShadow = !!spec.castShadow;
    stand.receiveShadow = spec.receiveShadow !== false;
    group.add(stand);
    this.addCells<THREE.Mesh>({
      ...spec,
      make: (c) => {
        const geo = spec.build(c);
        if (!geo) return null;
        const m = new THREE.Mesh(geo, material);
        m.name = `near-${spec.name}`;
        m.castShadow = !!spec.castShadow;
        m.receiveShadow = spec.receiveShadow !== false;
        m.renderOrder = spec.renderOrder ?? 0;
        m.matrixAutoUpdate = false;
        m.visible = false;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        group.add(m);
        return m;
      },
      show: (m, on, c) => {
        m.visible = on;
        spec.onShow?.(c, on);
      },
      drop: (m) => {
        group.remove(m);
        m.geometry.dispose();
      },
    });
  }

  /** one instanced draw over all the cells on show */
  addScatter(spec: NearScatterSpec): void {
    if (!this.wants(spec.name, spec.min)) return;
    const material = DEBUG ? this.tinted(spec.material) : spec.material;
    const pool = new THREE.InstancedMesh(spec.geometry, material, spec.capacity);
    pool.name = `near-${spec.name}`;
    pool.count = 0;
    pool.visible = false; // (the boot warm-up shows it: compiled with the rest)
    pool.frustumCulled = false; // the pool is around the camera
    pool.castShadow = !!spec.castShadow;
    pool.receiveShadow = spec.receiveShadow !== false;
    pool.renderOrder = spec.renderOrder ?? 0;
    pool.matrixAutoUpdate = false;
    pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const useColor = !!spec.colors;
    if (useColor) {
      pool.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spec.capacity * 3), 3);
      pool.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.root.add(pool);
    const perCell = Math.max(1, spec.perCell ?? Math.ceil(spec.capacity / 4));
    const emit = new Emit(new Float32Array(perCell * 16), useColor ? new Float32Array(perCell * 3) : null, perCell);
    type Chunk = { n: number; m: Float32Array; c: Float32Array | null; shown: boolean; d2: () => number };
    const shown: Chunk[] = [];
    const layerRef: { layer?: Layer<Chunk> } = {};
    const byD = (a: Chunk, b: Chunk) => a.d2() - b.d2();
    const layer = new Layer<Chunk>(
      spec,
      (c) => {
        emit.n = 0;
        spec.fill(c, emit);
        if (emit.n === 0) return null;
        const slot = c as Slot<Chunk>;
        return { n: emit.n, m: emit.m.slice(0, emit.n * 16), c: emit.c ? emit.c.slice(0, emit.n * 3) : null, shown: false, d2: () => slot.d2 };
      },
      (ch, on) => {
        ch.shown = on;
        if (on) shown.push(ch);
        else shown.splice(shown.indexOf(ch), 1);
      },
      () => {},
      this,
    );
    layerRef.layer = layer;
    this.layers.push(layer as unknown as Layer<unknown>);
    const flush = () => {
      if (!layer.changed) return;
      layer.changed = false;
      shown.sort(byD);
      const M = pool.instanceMatrix.array as Float32Array;
      const C = pool.instanceColor ? (pool.instanceColor.array as Float32Array) : null;
      let n = 0;
      for (let k = 0; k < shown.length; k++) {
        const ch = shown[k];
        const take = Math.min(ch.n, spec.capacity - n);
        if (take <= 0) break;
        M.set(take === ch.n ? ch.m : ch.m.subarray(0, take * 16), n * 16);
        if (C && ch.c) C.set(take === ch.n ? ch.c : ch.c.subarray(0, take * 3), n * 3);
        n += take;
      }
      pool.count = n;
      pool.visible = n > 0;
      pool.instanceMatrix.clearUpdateRanges();
      pool.instanceMatrix.addUpdateRange(0, n * 16);
      pool.instanceMatrix.needsUpdate = true;
      if (pool.instanceColor) {
        pool.instanceColor.clearUpdateRanges();
        pool.instanceColor.addUpdateRange(0, n * 3);
        pool.instanceColor.needsUpdate = true;
      }
    };
    this.scatters.push({ flush });
  }

  /** other work near the camera (a texture to draw, say): one at a time, inside the frame's building budget */
  job(fn: () => void): void {
    this.jobs.push(fn);
  }

  /** build everything wanted at the next update, whatever it takes (automation: a view that is about to be looked at) */
  flush(): void {
    this.flushNext = true;
  }

  /** once per frame, after the camera has moved and before the render */
  update(realDt: number): void {
    const cam = this.ctx.camera;
    const p = cam.position;
    const lens = Math.min(8, Math.max(0.5, lensOf(cam.fov, this.ctx.size.height * this.ctx.renderer.getPixelRatio())));
    nearLens.value = lens;
    globalUniforms.uNearEye.value.copy(p);
    globalUniforms.uNearLens.value = lens;
    if (this.layers.length === 0) return;

    const moved = this.started ? p.distanceTo(this.last) : 0;
    if (moved > CUT_METRES) {
      this.cutLeft = CUT_FRAMES;
      this.vel.set(0, 0, 0);
    } else if (realDt > 0) {
      const k = Math.min(1, realDt * 4);
      this.vel.x += ((p.x - this.last.x) / realDt - this.vel.x) * k;
      this.vel.y += ((p.y - this.last.y) / realDt - this.vel.y) * k;
      this.vel.z += ((p.z - this.last.z) / realDt - this.vel.z) * k;
    }
    this.started = true;
    this.last.copy(p);
    const speed = this.vel.length();

    // what is wanted: only when the camera or the lens has moved enough to change it
    const ax = p.x + this.vel.x * LOOK_AHEAD,
      az = p.z + this.vel.z * LOOK_AHEAD;
    if (this.lastScan.distanceToSquared(p) > 1 || Math.abs(lens - this.lastLens) > 0.05 * this.lastLens || this.flushNext) {
      this.lastScan.copy(p);
      this.lastLens = lens;
      const land = this.ctx.services.landscape as { height?(x: number, z: number): number } | undefined;
      const g = land?.height ? land.height(p.x, p.z) : 0;
      this.agl = Math.max(0, p.y - Math.max(0, g));
      this.stamp++;
      for (const l of this.layers) l.scan(p.x, p.z, ax, az, lens, this.agl, this.stamp, this.queue);
      // what the camera has turned away from before it was built is forgotten
      const q = this.queue;
      for (let k = q.length - 1; k >= 0; k--) {
        if (q[k].stamp !== this.stamp) {
          q[k].layer.forget(q[k]);
          q[k] = q[q.length - 1];
          q.pop();
        }
      }
    }

    for (const l of this.layers) l.tick(p.x, p.z, lens, this.agl);

    this.spent = 0;
    const budget = this.flushNext ? 1e9 : this.cutLeft > 0 ? BUDGET_CUT : BUDGET;
    if (this.cutLeft > 0) this.cutLeft--;
    if ((speed < FLYING || this.flushNext) && (this.queue.length > 0 || this.jobs.length > 0)) {
      while (this.spent < budget) {
        const q = this.queue;
        if (q.length > 0) {
          // the nearest first
          let best = 0;
          for (let k = 1; k < q.length; k++) if (q[k].d2 < q[best].d2) best = k;
          const s = q[best];
          q[best] = q[q.length - 1];
          q.pop();
          s.layer.build(s);
        } else if (this.jobs.length > 0) {
          const t0 = performance.now();
          (this.jobs.shift() as () => void)();
          this.spent += performance.now() - t0;
        } else break;
      }
      if (this.spent > 0) for (const l of this.layers) l.tick(p.x, p.z, lens, this.agl);
    }
    if (this.spent > this.maxFrameMs && !this.flushNext) this.maxFrameMs = this.spent;
    this.flushNext = false;
    for (const s of this.scatters) s.flush();
  }

  stats(): Record<string, string | number> {
    const out: Record<string, string | number> = { lens: Math.round(nearLens.value * 100) / 100, queue: this.queue.length, maxBuildFrameMs: Math.round(this.maxFrameMs * 10) / 10 };
    for (const l of this.layers) out[l.name] = `${l.shownCount} shown, ${l.live.length} built, ${l.builds} builds, slowest ${l.buildMs.toFixed(1)} ms`;
    return out;
  }

  /** ?neardebug: everything the bubble holds in one colour */
  private tinted(material: THREE.Material): THREE.Material {
    const m = material.clone() as THREE.MeshStandardMaterial;
    if (m.color) m.color.set('#ff2bd6');
    m.vertexColors = false;
    return m;
  }
}

function standInGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  for (const a of ['position', 'normal', 'color']) geo.setAttribute(a, new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  return geo;
}

/** the bubble of this city (main.ts makes it before any module) */
export function nearOf(ctx: CityContext): NearDetail {
  return ctx.services.nearDetail as NearDetail;
}
