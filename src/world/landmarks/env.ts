// Shared state handed to every landmark generator: the builders (static per region,
// kinetic/cutout, lights, signs), the glow list, the sign atlas, frames, footprint checks,
// pick targets and per-frame updaters.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Rect } from '../../core/geom';
import { MeshBuilder, AnimSpec } from './builder';
import { Kit } from './kit';
import type { GlowPoint } from './glows';
import { SignAtlas } from './signs';
import type { LmUniforms } from './materials';

export interface PickTarget {
  id: number;
  label: string;
  box: THREE.Box3;
  info: () => string[];
}

export type Updater = (dt: number, ctx: CityContext) => void;

/**
 * Static geometry region key. Measured: per-object CPU overhead (cull, uniforms, shadow pass)
 * outweighs the frustum-culling gain of splitting in the wide views, so everything shares ONE
 * static mesh. (Return per-area keys here to split again.)
 */
/** spatial cell of a landmark origin: the static and detail meshes are split per cell so the frustum (and, for the
 *  detail meshes, the LOD distance) can drop whole cells — one city-wide mesh was drawn in full from every view */
export const REGION_CELL = 150;
export function regionOf(x: number, z: number): string {
  return `${Math.floor(x / REGION_CELL)}_${Math.floor(z / REGION_CELL)}`;
}

export class Env {
  readonly ctx: CityContext;
  readonly u: LmUniforms;
  readonly regions = new Map<string, MeshBuilder>();
  S!: Kit;
  readonly K: Kit;
  readonly L: Kit;
  readonly T: Kit;
  /** ornament builder (receives clock / flag / rose / stained-glass primitives of the static kits) */
  readonly O: Kit;
  /** detail builder of the current region: small trims of the static kits, collapsed beyond ~100 m (distance LOD) */
  D: Kit;
  /** region of the landmark being generated (big landmarks: their own), null = by REGION_CELL cell */
  regionTag: string | null = null;
  /** per-region detail builders (same keys as `regions`) */
  readonly details = new Map<string, MeshBuilder>();
  readonly glows: GlowPoint[] = [];
  readonly atlas = new SignAtlas(1024, 1536);
  readonly picks: PickTarget[] = [];
  readonly updaters: Updater[] = [];
  readonly problems: string[] = [];
  /** extra meshes created by generators (fountain water, crowd…) */
  readonly extra: THREE.Object3D[] = [];
  readonly stats: Record<string, number | string> = {};
  private fx = new THREE.Matrix4();
  private yaw = 0;
  private violations = 0;
  private violationNote = '';
  private checkFn: ((x: number, y: number, z: number) => void) | null = null;

  constructor(ctx: CityContext, u: LmUniforms) {
    this.ctx = ctx;
    this.u = u;
    this.K = new Kit(new MeshBuilder(true));
    this.L = new Kit(new MeshBuilder(true));
    this.T = new Kit(new MeshBuilder(false));
    this.O = new Kit(new MeshBuilder(false));
    this.S = this.region('mideast');
    this.D = new Kit(this.S.b.detail!);
  }

  region(key: string): Kit {
    let b = this.regions.get(key);
    if (!b) {
      b = new MeshBuilder(false);
      // ornament patterns (clock / flag / rose / stained glass) go to the kinetic mesh, whose
      // shader compiles the full pattern set anyway — keeps the static program lean, no extra draw
      b.ornament = this.K.b;
      const d = new MeshBuilder(true);
      this.details.set(key, d);
      b.detail = d;
      this.regions.set(key, b);
    }
    return new Kit(b);
  }

  /** Start a landmark: local origin at world (x, y, z), local +Z facing yaw. */
  begin(x: number, y: number, z: number, yaw = 0): void {
    this.S = this.region(this.regionTag ?? regionOf(x, z));
    this.D = new Kit(this.S.b.detail!);
    for (const k of [this.S, this.K, this.L, this.T, this.O, this.D]) {
      k.b.setFrame(x, y, z, yaw);
      k.b.anim = null;
      k.b.check = this.checkFn;
    }
    this.S.b.forceDetail = false;
    this.S.b.keepCore = false;
    this.fx.makeRotationY(yaw).setPosition(x, y, z);
    this.yaw = yaw;
  }

  /** Footprint rule for lots: inside the rect, overhangs <= 1.2 m only above 2.4 m. */
  checkLot(fp: Rect | null, label: string): void {
    if (!fp) {
      this.checkFn = null;
    } else {
      this.checkFn = (x, y, z) => {
        const dx = Math.max(fp.x0 - x, 0, x - fp.x1);
        const dz = Math.max(fp.z0 - z, 0, z - fp.z1);
        const d = Math.max(dx, dz);
        if (d <= 0.015) return;
        if (y < 2.4 - 1e-3 || d > 1.2 + 0.015) {
          if (this.violations++ < 3) this.violationNote += `${label} (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}) ${d.toFixed(2)}m out; `;
        }
      };
    }
    for (const k of [this.S, this.K, this.L, this.T, this.O, this.D]) k.b.check = this.checkFn;
  }

  /** Feature rule: everything below 2.2 m inside radius r (+5 cm) of (cx, cz). */
  checkRadius(cx: number, cz: number, r: number | null, label: string): void {
    if (r === null) {
      this.checkFn = null;
    } else {
      this.checkFn = (x, y, z) => {
        if (y > 2.2) return;
        const d = Math.hypot(x - cx, z - cz);
        if (d > r + 0.05) {
          if (this.violations++ < 3) this.violationNote += `${label} (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}) ${(d - r).toFixed(2)}m outside r=${r}; `;
        }
      };
    }
    for (const k of [this.S, this.K, this.L, this.T, this.O, this.D]) k.b.check = this.checkFn;
  }

  /** Rect rule for rect features (solid parts below 2.2 m must stay inside). */
  checkRect(rc: Rect | null, label: string, margin = 0.05): void {
    if (!rc) {
      this.checkFn = null;
    } else {
      this.checkFn = (x, y, z) => {
        if (y > 2.2) return;
        const d = Math.max(rc.x0 - x, 0, x - rc.x1, rc.z0 - z, 0, z - rc.z1);
        if (d > margin) {
          if (this.violations++ < 3) this.violationNote += `${label} (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}) ${d.toFixed(2)}m outside rect; `;
        }
      };
    }
    for (const k of [this.S, this.K, this.L, this.T, this.O, this.D]) k.b.check = this.checkFn;
  }

  endChecks(): void {
    this.checkFn = null;
    for (const k of [this.S, this.K, this.L, this.T, this.O, this.D]) k.b.check = null;
  }

  footprintReport(): string[] {
    return this.violations ? [`${this.violations} vertices outside footprints/radii: ${this.violationNote}`] : [];
  }

  /** Kinetic animation for subsequent K / L primitives (pivot & axis in landmark-local space). */
  anim(spec: AnimSpec | null): void {
    this.K.b.anim = spec;
    this.L.b.anim = spec;
  }

  /** landmark-local → world */
  w(lx: number, ly: number, lz: number): [number, number, number] {
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(this.fx);
    return [v.x, v.y, v.z];
  }
  /** rotate a local direction into world */
  wdir(dx: number, dy: number, dz: number): [number, number, number] {
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    return [dx * c + dz * s, dy, -dx * s + dz * c];
  }
  get frameYaw(): number {
    return this.yaw;
  }

  /** Add a glow at landmark-local coordinates. */
  glow(lx: number, ly: number, lz: number, g: Omit<GlowPoint, 'x' | 'y' | 'z'>): void {
    const [x, y, z] = this.w(lx, ly, lz);
    const p: GlowPoint = { ...g, x, y, z };
    if (g.dir) p.dir = this.wdir(g.dir[0], g.dir[1], g.dir[2]);
    if (g.pivot) p.pivot = this.w(g.pivot[0], g.pivot[1], g.pivot[2]);
    this.glows.push(p);
  }

  pick(id: number, label: string, box: THREE.Box3, info: () => string[]): void {
    this.picks.push({ id, label, box, info });
  }

  /** world-space box from local extents of the current frame */
  boxLocal(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Box3 {
    const b = new THREE.Box3();
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) b.expandByPoint(new THREE.Vector3(...this.w(x, y, z)));
    return b;
  }

  hours(): number {
    return this.ctx.clock.hours;
  }
}
