// Planar water reflection (sea + river share the plane y = WATER_LEVEL).
//
// A mirrored copy of the main camera renders only LAYERS.REFLECT objects into a small HalfFloat
// target (1/3 of the drawing buffer on 'full', 1/4.5 on 'low') right before the main scene pass:
// the pass runs from scene.onBeforeRender when the main camera renders, so it sees this frame's
// camera (the camera module updates after the water module), sits inside postfx's GPU timer
// (the adaptive controller sees its cost) and its draw calls show up in renderer.info.
//
//   * oblique near plane = the water plane (nothing below the water is drawn; no clip-plane
//     shader variants, so no material recompiles)
//   * cleared to transparent black: the water shader composites the texture as premultiplied
//     colour over its own analytic sky (texture alpha = coverage), so medium/low quality (no pass)
//     and high quality share the same sky
//   * mipmapped: the water shader picks a blur level from roughness / distance / pixel footprint
//   * shadow maps are not re-rendered for the mirrored view; the renderer state is restored
//
// Meshes of other modules opt in by name at 'modules:ready' (BASE below); level 2 adds the bank trees
// while the river is in view, level 1 renders the base set at a lower resolution, level 0 disables
// the pass (analytic sky only). Budget: ≲ 0.2 M triangles, ≲ 20 draw calls (night, emitters included).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { LAYERS } from '../../core/layers';
import { WATER_LEVEL, SLAB, RIVER } from '../../core/constants';

export type ReflectionLevel = 0 | 1 | 2;

/** the river channel (+ bank trees' reach) */
const RIVER_BOX = new THREE.Box3(new THREE.Vector3(SLAB.x0, WATER_LEVEL, RIVER.z0 - 2), new THREE.Vector3(121, WATER_LEVEL + 0.5, RIVER.z1 + 2));

/** reflected at every level (cheap, or essential for contact: hulls, quays, emitters) */
// Budget ≲ 0.2 M triangles in harbour / overview views: facade trim chunks (~90k), railings, signs,
// aircraft and waterfowl were tried and dropped — invisible in a blurred 1/3-res reflection.
const BASE: RegExp[] = [
  /^buildings-shell$/,
  /^buildings-lights$/,
  /^harbor-(north|beach|river|animated|rides|glows)$/,
  /^landmarks-(lights|glows)$/,
  /^terrain-glows$/,
  /^props-glows$/,
  /^boats-(big|small|lights)$/,
  /^terrain-masonry$/,
];
/**
 * level 2 only, and only while the river is in view (the bank trees are what makes it read as
 * water): the far-LOD tree mesh is forced on for the pass (near tree chunks forced off)
 */
const TREES_FAR = 'veg-trees-far';
/** camera distance (m, orbit distance) beyond which SMALL meshes and the bank trees are skipped */
const FAR_VIEW = 330;
const SMALL = /^boats-small$/;
/** emitter meshes skipped by day (their modules may keep them visible with zero intensity) */
const NIGHT_ONLY = /-(glows|lights)$/;
const TREES_NEAR = /^veg-trees-(w|e)$/;

export interface ReflectionUniforms {
  tRefl: { value: THREE.Texture | null };
  uReflMat: { value: THREE.Matrix4 };
  /** x = on (0/1), y = texture width, z = texture height, w = max mip level */
  uReflInfo: { value: THREE.Vector4 };
}

export class PlanarReflection {
  readonly uniforms: ReflectionUniforms;
  private rt: THREE.WebGLRenderTarget;
  private cam = new THREE.PerspectiveCamera();
  private level: ReflectionLevel;
  private pending = false;
  private busy = false;
  private base: THREE.Object3D[] = [];
  private night: THREE.Object3D[] = [];
  private small: THREE.Object3D[] = [];
  private treesFar: THREE.Object3D | null = null;
  private treesNear: THREE.Object3D[] = [];
  private attached = false;
  private prevBefore: ((...args: unknown[]) => void) | null = null;
  // scratch
  private camPos = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private up = new THREE.Vector3();
  private target = new THREE.Vector3();
  private rot = new THREE.Matrix4();
  private plane = new THREE.Plane();
  private clip = new THREE.Vector4();
  private q = new THREE.Vector4();
  private sz = new THREE.Vector2();
  private clearCol = new THREE.Color();
  private visSave: boolean[] = [];
  private lights: THREE.DirectionalLight[] = [];
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private dbg: boolean;
  private dbgList: THREE.Object3D[] = [];
  // stats
  calls = 0;
  tris = 0;
  renders = 0;
  width = 0;
  height = 0;
  meshes = 0;

  constructor(
    private ctx: CityContext,
    initial: ReflectionLevel,
  ) {
    this.level = initial;
    this.dbg = ctx.debug.params.has('refldbg');
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });
    this.rt.texture.name = 'water-reflection';
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.cam.layers.set(LAYERS.REFLECT);
    this.cam.matrixAutoUpdate = true;
    this.uniforms = {
      tRefl: { value: this.rt.texture },
      uReflMat: { value: new THREE.Matrix4() },
      uReflInfo: { value: new THREE.Vector4(0, 4, 4, 0) },
    };
  }

  /** opt meshes of other modules in (call once every module exists) */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const scene = this.ctx.scene;
    scene.traverse((o) => {
      // lights must be in the pass, or the materials compile a second (unlit) program variant
      if ((o as THREE.Light).isLight) {
        o.layers.enable(LAYERS.REFLECT);
        if ((o as THREE.DirectionalLight).shadow) this.lights.push(o as THREE.DirectionalLight);
        return;
      }
      if (!(o as THREE.Mesh).isMesh || !o.name) return;
      if (BASE.some((r) => r.test(o.name))) {
        o.layers.enable(LAYERS.REFLECT);
        this.base.push(o);
        if (NIGHT_ONLY.test(o.name)) this.night.push(o);
        if (SMALL.test(o.name)) this.small.push(o);
        return;
      }
      if (o.name === TREES_FAR) {
        o.layers.enable(LAYERS.REFLECT);
        this.treesFar = o;
        return;
      }
      if (TREES_NEAR.test(o.name)) this.treesNear.push(o);
    });
    this.meshes = this.base.length + (this.treesFar ? 1 : 0);
    this.dbgList = [...this.base, ...(this.treesFar ? [this.treesFar] : [])];
    // render from inside the main scene pass (see the header)
    this.prevBefore = scene.onBeforeRender as unknown as (...args: unknown[]) => void;
    const self = this;
    const hook = function (this: unknown, ...args: unknown[]) {
      self.prevBefore?.apply(this, args);
      const camera = args[2];
      if (self.pending && !self.busy && camera === self.ctx.camera) {
        self.pending = false;
        self.render(camera as THREE.PerspectiveCamera);
      }
    };
    scene.onBeforeRender = hook as unknown as THREE.Scene['onBeforeRender'];
  }

  setLevel(level: ReflectionLevel): void {
    this.level = level;
    if (level === 0) this.uniforms.uReflInfo.value.x = 0;
  }

  getLevel(): ReflectionLevel {
    return this.level;
  }

  /** arm the pass for this frame (module frame()) */
  request(): void {
    this.pending = this.level > 0 && this.attached;
    if (!this.pending) this.uniforms.uReflInfo.value.x = 0;
  }

  private resize(): void {
    const r = this.ctx.renderer;
    r.getDrawingBufferSize(this.sz);
    const k = (this.level === 2 ? 1 / 3 : 1 / 4.5) * Math.max(0.5, Math.min(1, this.ctx.quality.renderScale || 1));
    const w = Math.max(64, Math.round(this.sz.x * k)),
      h = Math.max(36, Math.round(this.sz.y * k));
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.rt.setSize(w, h);
      const info = this.uniforms.uReflInfo.value;
      info.y = w;
      info.z = h;
      info.w = Math.floor(Math.log2(Math.max(w, h)));
    }
  }

  private render(camera: THREE.PerspectiveCamera): void {
    const { renderer, scene } = this.ctx;
    const L = WATER_LEVEL;
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    if (this.camPos.y < L + 0.3) {
      this.uniforms.uReflInfo.value.x = 0;
      return;
    }
    // a shadow-casting light without its shadow map yet (first frame, map re-created after a size
    // change): three would bind an invalid placeholder to the shadow samplers in this pass (the main
    // pass renders shadows first) → skip this frame, keep last frame's reflection
    if (renderer.shadowMap.enabled) {
      for (const l of this.lights) if (l.castShadow && l.visible && !l.shadow.map) return;
    }
    this.busy = true;
    this.resize();
    const cam = this.cam;
    // mirrored eye, forward and up
    this.rot.extractRotation(camera.matrixWorld);
    this.dir.set(0, 0, -1).applyMatrix4(this.rot);
    this.up.set(0, 1, 0).applyMatrix4(this.rot);
    cam.position.set(this.camPos.x, 2 * L - this.camPos.y, this.camPos.z);
    this.dir.y = -this.dir.y;
    this.up.y = -this.up.y;
    cam.up.copy(this.up);
    this.target.copy(cam.position).add(this.dir);
    cam.lookAt(this.target);
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    // projective lookup matrix (before the oblique clip edit: it leaves x/y/w untouched)
    const tm = this.uniforms.uReflMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near plane = water plane (Lengyel), in the mirrored camera's view space
    this.plane.set(this.up.set(0, 1, 0), -L).applyMatrix4(cam.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const e = cam.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x) + e[8]) / e[0], (Math.sign(this.clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    e[2] = this.clip.x;
    e[6] = this.clip.y;
    e[10] = this.clip.z + 1;
    e[14] = this.clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    // ── state save
    const prevTarget = renderer.getRenderTarget();
    const prevFace = renderer.getActiveCubeFace();
    const prevMip = renderer.getActiveMipmapLevel();
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(this.clearCol);
    const prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevBg = scene.background;
    const prevMWAU = scene.matrixWorldAutoUpdate;
    // level-dependent visibility overrides
    const vs = this.visSave;
    let n = 0;
    const full = this.level === 2;
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    // far views (overview): small boats and bank trees mirror to a few pixels — skip them
    const camSvc = this.ctx.services.camera;
    const far = (camSvc ? camSvc.getState().distance : this.camPos.y * 1.6) > FAR_VIEW;
    const trees = full && !far && this.frustum.intersectsBox(RIVER_BOX);
    if (this.treesFar) {
      vs[n++] = this.treesFar.visible;
      this.treesFar.visible = trees;
    }
    for (const o of this.treesNear) {
      vs[n++] = o.visible;
      o.visible = false;
    }
    const day = this.ctx.uniforms.uLights.value < 0.02;
    for (const o of this.night) {
      vs[n++] = o.visible;
      o.visible = !day && o.visible;
    }
    for (const o of this.small) {
      vs[n++] = o.visible;
      o.visible = !far && o.visible;
    }

    // ?refldbg: draw one opted-in mesh at a time (cycling every 6 passes) with console markers,
    // to attribute driver warnings to a mesh
    let dbgHidden = 0;
    if (this.dbg) {
      const list = this.dbgList;
      const k = Math.floor(this.renders / 6) % (list.length + 1);
      if (this.renders % 6 === 0) console.warn(`[refldbg] ${k < list.length ? list[k].name : 'all'} (${k})`);
      if (k < list.length) {
        for (const o of list) {
          vs[n + dbgHidden++] = o.visible;
          if (o !== list[k]) o.visible = false;
        }
      }
    }
    const auto = renderer.info.autoReset;
    const c0 = auto ? 0 : renderer.info.render.calls,
      t0 = auto ? 0 : renderer.info.render.triangles;
    try {
      scene.background = null;
      scene.matrixWorldAutoUpdate = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.setRenderTarget(this.rt);
      renderer.render(scene, cam);
    } finally {
      this.calls = renderer.info.render.calls - c0;
      this.tris = renderer.info.render.triangles - t0;
      // ── state restore
      n = 0;
      if (this.treesFar) this.treesFar.visible = vs[n++];
      for (const o of this.treesNear) o.visible = vs[n++];
      for (const o of this.night) o.visible = vs[n++];
      for (const o of this.small) o.visible = vs[n++];
      if (dbgHidden) for (const o of this.dbgList) o.visible = vs[n++];
      scene.background = prevBg;
      scene.matrixWorldAutoUpdate = prevMWAU;
      renderer.shadowMap.autoUpdate = prevShadow;
      renderer.setClearColor(this.clearCol, prevAlpha);
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget, prevFace, prevMip);
      this.busy = false;
    }
    this.renders++;
    this.uniforms.uReflInfo.value.x = 1;
  }

  dispose(): void {
    if (this.attached && this.prevBefore) this.ctx.scene.onBeforeRender = this.prevBefore as unknown as THREE.Scene['onBeforeRender'];
    this.rt.dispose();
  }
}
