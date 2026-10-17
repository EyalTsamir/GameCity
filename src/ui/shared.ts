// Types shared by the camera, ui and audio modules (all owned by src/ui/*).
//
// The camera module registers `ctx.services.camera` exactly as typed in core/context.ts
// and adds a few extra members (below) that the UI uses. Other modules should only rely
// on the core type; the UI checks for the extras before using them.

import type * as THREE from 'three';
import type { CameraState, PickHit, Services } from '../core/context';
import type { Poi } from '../core/plan';

export type CoreCameraService = NonNullable<Services['camera']>;

export interface PointerInfo {
  /** CSS pixel position relative to the canvas */
  x: number;
  y: number;
  /** pointer is over the canvas (not over UI panels) */
  inside: boolean;
  /** a drag gesture is in progress */
  dragging: boolean;
  /** performance.now() of the last pointer move over the canvas */
  movedAt: number;
}

export interface TourShotInfo {
  title: string;
  subtitle: string;
}

export interface CameraServiceExt extends CoreCameraService {
  /** entity currently followed (or null) */
  following(): PickHit | null;
  /** low chase view behind the followed entity */
  setChase(on: boolean): void;
  chasing(): boolean;
  touring(): boolean;
  /** nearest pickable entity under a canvas-relative CSS pixel position */
  pickAt(x: number, y: number): PickHit | null;
  /** world point (terrain / roofs) under a canvas-relative CSS pixel position */
  surfacePoint(x: number, y: number, out: THREE.Vector3): boolean;
  /** fly to a ground position, keeping the current yaw / pitch */
  flyToPoint(x: number, z: number, distance?: number): void;
  /** fly to a POI by id (also used by the number keys) */
  flyToPoi(id: string): void;
  /** ground footprint of the view (4 corners, clockwise from bottom-left); false if degenerate */
  footprint(out: { x: number; z: number }[]): boolean;
  /** live pointer state (shared with the UI for hover picking) */
  pointer: PointerInfo;
  /** ground height (terrain or water surface) */
  groundAt(x: number, z: number): number;
  pois(): Poi[];
  /** UI hint: the pointer hovers something pickable */
  setHoverCursor(on: boolean): void;
  /** current auto-tour caption (or null) */
  caption(): TourShotInfo | null;
  /** buses / trains / boats found by the background census (live positions) */
  liveEntities(): { x: number; z: number; kind: PickHit['kind']; color: string }[];
  /** UI hook: a plain click at canvas (x, y) — return true when the UI handled it (e.g. a district flag) */
  clickHook?: ((x: number, y: number) => boolean) | null;
}

export interface AudioServiceExt {
  setEnabled(on: boolean): void;
  enabled(): boolean;
  setVolume(v: number): void;
  volume(): number;
  /** true when the browser supports WebAudio */
  available(): boolean;
  /** offline render check of every synthesised voice (peak / rms per voice) */
  selfTest?(): Promise<Record<string, { peak: number; rms: number; finite: boolean }>>;
}

export interface UiServiceExt {
  toast(msg: string): void;
}

/** Narrow helpers (the services bag is loosely typed). */
export function cameraExt(services: Services): CameraServiceExt | null {
  const c = services.camera as Partial<CameraServiceExt> | undefined;
  return c && typeof c.pickAt === 'function' ? (c as CameraServiceExt) : null;
}

export function audioExt(services: Services): AudioServiceExt | null {
  const a = services.audio as Partial<AudioServiceExt> | undefined;
  return a && typeof a.setEnabled === 'function' ? (a as AudioServiceExt) : null;
}

export type { CameraState, PickHit };
