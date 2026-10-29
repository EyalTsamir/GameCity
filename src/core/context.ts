// The shared context handed to every module, plus the module contract.
//
// A module file default-exports a factory:
//
//   export default function create(ctx: CityContext): CityModule | Promise<CityModule>
//
// Factories run once, in the order listed in src/main.ts (static world first,
// then simulations, then post-processing, camera and UI). A module that throws
// is logged and skipped — the rest of the city still runs.

import type * as THREE from 'three';
import type { CityPlan, Poi } from './plan';
import type { RoadNetwork } from './roadNetwork';
import type { PedNetwork } from './pedNetwork';
import type { OccupancyGrid } from './occupancy';
import type { IntersectionManager } from './intersections';
import type { WorldClock } from './time';
import type { GlobalUniforms } from './uniforms';
import type { EventBus } from './events';
import type { Rng } from './rng';

export interface CityModule {
  name: string;
  /** Simulation step. `dt` = scaled sim seconds this frame (0 while paused; may be up to ~0.8 at 8x — sub-step if you integrate). */
  update?(dt: number, ctx: CityContext): void;
  /** Called every frame with the real (unscaled) frame delta — camera, UI, audio, purely visual easing. */
  frame?(realDt: number, ctx: CityContext): void;
  resize?(width: number, height: number, ctx: CityContext): void;
  /** Extra numbers for window.__city.stats() / the debug overlay. */
  stats?(): Record<string, number | string>;
  /** Self-checks for automated tests: return human-readable problems (empty = fine). */
  invariants?(): string[];
  dispose?(): void;
}

export type ModuleFactory = (ctx: CityContext) => CityModule | Promise<CityModule>;

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityState {
  level: QualityLevel;
  /** renderer pixel ratio cap */
  pixelRatio: number;
  /** dynamic resolution scale applied on top (0.5..1), driven by the adaptive controller */
  renderScale: number;
  shadows: boolean;
  shadowMapSize: number;
  ao: boolean;
  dof: boolean;
  bloom: boolean;
  /** 0.4..1 multiplier for crowd/traffic sizes and particle counts */
  density: number;
}

/** Result of picking an entity under the cursor (for follow-cam & info cards). */
export interface PickHit {
  kind: 'vehicle' | 'bus' | 'pedestrian' | 'train' | 'boat' | 'building' | 'landmark' | 'other';
  id: number;
  /** distance along the ray */
  distance: number;
  label: string;
  /** current world position (write into out); return false if the entity no longer exists */
  getPosition(out: THREE.Vector3): boolean;
  /** heading (yaw about +Y, model +Z forward) if it moves */
  getHeading?(): number;
  /** short lines for the info card, e.g. ["Heading to Old Town", "32 km/h"] */
  info(): string[];
}

export interface Picker {
  name: string;
  /** return the nearest hit along the ray (or null) */
  pick(ray: THREE.Ray): PickHit | null;
}

export interface CameraState {
  target: { x: number; y: number; z: number };
  distance: number;
  /** degrees, same convention as Poi.yaw */
  yaw: number;
  /** degrees above horizon */
  pitch: number;
}

/** Optional services modules expose to each other (all may be missing if a module failed). */
export interface Services {
  camera?: {
    flyTo(view: Partial<CameraState> | Poi, seconds?: number): void;
    follow(hit: PickHit | null): void;
    getState(): CameraState;
    /** true while the user is actively dragging/flying */
    busy(): boolean;
    /** 'orbit' | 'follow' | 'tour' */
    mode(): string;
    startTour(): void;
    stopTour(): void;
  };
  sky?: {
    sun: THREE.DirectionalLight;
    hemi: THREE.HemisphereLight;
    /** set cloud cover / weather 0..1 */
    setWeather?(rain: number): void;
  };
  postfx?: {
    setEnabled(effect: 'dof' | 'bloom' | 'ao' | 'all', on: boolean): void;
    isEnabled(effect: 'dof' | 'bloom' | 'ao'): boolean;
    /** focus distance override (world units) or null for automatic */
    setFocus?(distance: number | null): void;
    /** previous frame's scene depth (soft particles; main view only): raw perspective depth unless `linear` */
    softDepth?(): { texture: THREE.Texture; linear: boolean; near: number; far: number; width: number; height: number } | null;
    /** run every optional pass (DOF, shafts) in the next frame: the boot warm-up compiles their programs */
    warmUp?(): void;
  };
  traffic?: { count(): number; busCount(): number };
  pedestrians?: { count(): number };
  rail?: { trains(): number };
  audio?: { setEnabled(on: boolean): void; enabled(): boolean };
  // water (ctx.services.water, typed in world/water.ts) also offers setReflectionQuality(level 0 off |
  // 1 low | 2 full) for the adaptive quality controller once reflections exist.
  ui?: { toast(msg: string): void };
  [name: string]: unknown;
}

export interface DebugFlags {
  enabled: boolean;
  /** if non-empty: only these module names are loaded (core always loads) */
  only: string[];
  /** module names to skip */
  skip: string[];
  params: URLSearchParams;
}

export interface CityContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** overlay root for HTML UI */
  uiRoot: HTMLElement;
  plan: CityPlan;
  roads: RoadNetwork;
  peds: PedNetwork;
  occupancy: OccupancyGrid;
  intersections: IntersectionManager;
  clock: WorldClock;
  uniforms: GlobalUniforms;
  events: EventBus;
  quality: QualityState;
  services: Services;
  pickers: Picker[];
  /** Renders one frame. The post-processing module replaces this. */
  render: (realDt: number) => void;
  debug: DebugFlags;
  /** independent deterministic RNG stream per label */
  rng(label: string): Rng;
  /** viewport size in CSS pixels */
  size: { width: number; height: number };
}
