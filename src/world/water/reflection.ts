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
import { perfOn } from '../../core/perfdeep';
import { streetMirror, STREET_MIRROR_BLANK, STREAK_FRAG, STREAKS_ON } from './streetMirror';
import { FS_VERT, FullscreenPass } from '../../render/postfx/fullscreen';
import { glassMirror, GLASS_MIRROR_BLANK, type GlassPlane } from './glassMirror';

export type ReflectionLevel = 0 | 1 | 2;

/** the river channel (+ bank trees' reach) */
const RIVER_BOX = new THREE.Box3(new THREE.Vector3(SLAB.x0, WATER_LEVEL, RIVER.z0 - 2), new THREE.Vector3(121, WATER_LEVEL + 0.5, RIVER.z1 + 2));

/** reflected at every level (cheap, or essential for contact: hulls, quays, emitters) */
// Budget ≲ 0.2 M triangles in harbour / overview views: facade trim chunks (~90k), railings, signs,
// aircraft and waterfowl were tried and dropped — invisible in a blurred 1/3-res reflection.
const BASE: RegExp[] = [
  /^buildings-shell(-shop|-roof|-far)?$/,
  /^buildings-lights$/,
  /^harbor-(north|beach|river|animated|rides|glows)$/,
  // landmarks-glows dropped: all inland (bbox ≥16 m from the river, ≥27 m from the sea), 1 draw call
  /^landmarks-lights$/,
  /^terrain-glows$/,
  /^props-glows$/,
  /^boats-(big|small|lights)$/,
  /^terrain-masonry$/,
  // world mode: the coast, island and mountain layers (reflection-only proxies of the landscape module)
  /^land-reflect(-mtn)?$/,
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
/** only in the street mirror (water/streetMirror.ts): what a wet road shows right in front of the eye */
const STREET_ONLY = /^traffic-(.*-lod\d|flares)$/;
/** only in the glass mirror (water/glassMirror.ts): the street itself, from the eye of a shop window */
const GLASS_ONLY = /^(roads-(asphalt|hardscape|markings)|terrain-ground|props-casters|traffic-signal-poles|peds-(close|near|far)|veg-(wood-near|wood-far|cards)|landmarks-(static|detail).*)$/;

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
  private streetOnly: THREE.Object3D[] = [];
  private glassOnly: THREE.Object3D[] = [];
  /** the pass mirrors a plane of shop fronts (water/glassMirror.ts) */
  private glass: GlassPlane | null = null;
  private glassK = 0;
  private glassN = new THREE.Vector3();
  private streakRT: THREE.WebGLRenderTarget | null = null;
  private streakPass: FullscreenPass | null = null;
  /** the pass mirrors the road surface instead of the water (water/streetMirror.ts) */
  private street = false;
  private streetK = 0;
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
  private black: THREE.DataTexture;
  private additive: THREE.Material[] = [];
  private blendSave: (number | null)[] = [];
  /** debug: restrict the pass to opted-in meshes matching this (null = all) */
  filter: RegExp | null = null;
  private lights: THREE.DirectionalLight[] = [];
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private dbg: boolean;
  private dbgList: THREE.Object3D[] = [];
  /** ?reflfacade: facades at full detail in the pass (A/B) */
  private facadeDetail: boolean;
  private halfRate = perfOn('reflhalf');
  private skip = false;
  private lastEye = new THREE.Vector3();
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
    this.facadeDetail = ctx.debug.params.has('reflfacade');
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
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.black.needsUpdate = true;
    // (setLevel only runs when the adaptive ladder moves: with it frozen the wet road and the glass would read the blank texel)
    if (initial > 0) {
      streetMirror.tSRefl.value = this.rt.texture;
      glassMirror.tGM.value = this.rt.texture;
    }
    this.uniforms = {
      tRefl: { value: initial > 0 ? this.rt.texture : this.black },
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
      if (STREET_ONLY.test(o.name)) {
        o.layers.enable(LAYERS.REFLECT);
        this.streetOnly.push(o);
      }
      if (GLASS_ONLY.test(o.name)) {
        o.layers.enable(LAYERS.REFLECT);
        this.glassOnly.push(o);
      }
    });
    this.meshes = this.base.length + (this.treesFar ? 1 : 0);
    // (compiled behind the loading screen, not at the first shower)
    if (STREAKS_ON && this.level > 0) {
      this.renderStreaks();
      this.ctx.renderer.setRenderTarget(null);
    }
    // additive (glow) materials: in the pass they must not write coverage alpha (see render())
    for (const o of this.base) {
      const mm = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mm) ? mm : [mm]) if (m && m.blending === THREE.AdditiveBlending && !this.additive.includes(m)) this.additive.push(m);
    }
    this.dbgList = [...this.base, ...this.glassOnly, ...(this.treesFar ? [this.treesFar] : [])];
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
    if (level === 0) {
      // off: never sample the (now stale) target — bind a black texel and free the GPU memory;
      // the target is re-allocated by resize() when a level > 0 comes back
      this.uniforms.uReflInfo.value.x = 0;
      this.uniforms.tRefl.value = this.black;
      streetMirror.tSRefl.value = STREET_MIRROR_BLANK;
      streetMirror.uSRefl.value.x = 0;
      glassMirror.tGM.value = GLASS_MIRROR_BLANK;
      glassMirror.uGM.value.x = 0;
      this.glass = null;
      this.glassK = 0;
      this.rt.dispose();
      this.width = this.height = 0;
    } else {
      this.uniforms.tRefl.value = this.rt.texture;
      streetMirror.tSRefl.value = this.rt.texture;
      glassMirror.tGM.value = this.rt.texture;
    }
  }

  getLevel(): ReflectionLevel {
    return this.level;
  }

  /**
   * the wet-street mode: wanted 0..1 (ground wet, camera in the streets, no water in view). Switches at once (a mirror of
   * the other plane is useless), the road's strength eases; the water falls back on its analytic sky meanwhile.
   */
  setStreet(wanted: number, realDt: number): void {
    const on = wanted > 0 && this.level > 0;
    this.streetK += ((on ? wanted : 0) - this.streetK) * Math.min(1, realDt * 1.6);
    if (on !== this.street && (on || this.streetK < 0.02)) {
      this.street = on;
      this.renders = 0; // redraw at once
      if (!on) streetMirror.uSRefl.value.x = 0;
    }
    if (this.street) streetMirror.uSRefl.value.x = this.streetK;
    streetMirror.uSRefl.value.y = this.ctx.uniforms.uTime.value;
  }

  /**
   * the shop-glass mode: the plane the eye is on (null: none). A change of plane fades out, switches, fades in; a camera cut
   * (`snap`) goes at once. While the wet street has the pass, glass stays out.
   */
  setGlass(plane: GlassPlane | null, realDt: number, snap: boolean): void {
    const want = this.level > 0 && !this.street ? plane : null;
    // (the road reads the same target and matrix: the wet street takes the pass at once, no fade)
    if (this.glass !== want && (snap || this.street || !this.glass || this.glassK < 0.03)) {
      this.glass = want;
      this.glassK = 0;
      this.renders = 0; // redraw at once
    }
    const target = want && this.glass === want ? 1 : 0;
    this.glassK = snap ? target : this.glassK + (target - this.glassK) * Math.min(1, realDt * 5);
    const u = glassMirror.uGM.value;
    if (this.glass) u.set(this.glassK, this.glass.nx, this.glass.nz, this.glass.d);
    else u.x = 0;
  }

  /** arm the pass for this frame (module frame()) */
  request(): void {
    this.pending = this.level > 0 && this.attached;
    if (!this.pending) {
      this.uniforms.uReflInfo.value.x = 0;
      return;
    }
    // every other frame (?noreflhalf: every frame): the lookup uses the matrix of the camera that drew the mirror, so a
    // frame-old mirror stays in place on the water; only a camera cut redraws at once
    if (this.halfRate) {
      const cp = this.ctx.camera.position;
      const moved = this.lastEye.distanceToSquared(cp);
      const cut = moved > 25 && moved > 0.0025 * cp.y * cp.y;
      if (!cut && this.renders > 0 && this.skip) this.pending = false;
      this.skip = this.pending;
    }
  }

  private resize(): void {
    const r = this.ctx.renderer;
    r.getDrawingBufferSize(this.sz);
    // (the street mirror is only ever read blurred: the lower resolution)
    const k = (this.level === 2 && !this.street ? 1 / 3 : 1 / 4.5) * Math.max(0.5, Math.min(1, this.ctx.quality.renderScale || 1));
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
    const L = this.street ? 0.02 : WATER_LEVEL;
    const G = this.glass;
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    if (G) {
      // (behind the plane: nothing to mirror; the lookup keeps the last image while uGM fades it)
      this.glassN.set(G.nx, 0, G.nz);
      if (this.glassN.dot(this.camPos) + G.d < 0.05) return;
    } else if (this.camPos.y < L + 0.3) {
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
    if (G) {
      const n = this.glassN;
      cam.position.copy(this.camPos).addScaledVector(n, -2 * (n.dot(this.camPos) + G.d));
      this.dir.addScaledVector(n, -2 * n.dot(this.dir));
      this.up.addScaledVector(n, -2 * n.dot(this.up));
    } else {
      cam.position.set(this.camPos.x, 2 * L - this.camPos.y, this.camPos.z);
      this.dir.y = -this.dir.y;
      this.up.y = -this.up.y;
    }
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
    if (G) this.plane.set(this.glassN, G.d).applyMatrix4(cam.matrixWorldInverse);
    else this.plane.set(this.up.set(0, 1, 0), -L).applyMatrix4(cam.matrixWorldInverse);
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
    const st = camSvc ? camSvc.getState() : null;
    const far = (st ? st.distance : this.camPos.y * 1.6) > FAR_VIEW;
    // bank trees only when the view is about the river (not a river mouth glimpsed at the edge)
    if (st) this.target.set(st.target.x, WATER_LEVEL, st.target.z);
    const nearRiver = !st || RIVER_BOX.distanceToPoint(this.target) < 45;
    const trees = !!G || (!this.street && full && !far && nearRiver && this.frustum.intersectsBox(RIVER_BOX));
    if (this.treesFar) {
      vs[n++] = this.treesFar.visible;
      this.treesFar.visible = trees;
    }
    for (const o of this.treesNear) {
      vs[n++] = o.visible;
      o.visible = false;
    }
    for (const o of this.streetOnly) {
      vs[n++] = o.visible;
      o.visible = (this.street || !!G) && o.visible;
    }
    for (const o of this.glassOnly) {
      vs[n++] = o.visible;
      o.visible = !!G && o.visible;
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

    // debug filter (water service `_debugReflectFilter`): only opted-in meshes whose name matches
    let dbgHidden = 0;
    if (this.filter) {
      for (const o of this.dbgList) {
        vs[n + dbgHidden++] = o.visible;
        if (!this.filter.test(o.name)) o.visible = false;
      }
    }
    // ?refldbg: draw one opted-in mesh at a time (cycling every 6 passes) with console markers,
    // to attribute driver warnings to a mesh
    if (this.dbg) {
      const list = this.dbgList;
      const k = Math.floor(this.renders / 6) % (list.length + 1);
      if (this.renders % 6 === 0) console.warn(`[refldbg] ${k < list.length ? list[k].name : 'all'} (${k})`);
      if (k < list.length && !this.filter) {
        for (const o of list) {
          vs[n + dbgHidden++] = o.visible;
          if (o !== list[k]) o.visible = false;
        }
      }
    }
    const auto = renderer.info.autoReset;
    const c0 = auto ? 0 : renderer.info.render.calls,
      t0 = auto ? 0 : renderer.info.render.triangles;
    // three's non-premultiplied AdditiveBlending adds the source alpha too (ONE, ONE): a glow quad would
    // mark its whole footprint as covered and erase the mirrored sky under it (dark squares) → same colour
    // blending, alpha untouched
    // the facades' window interiors, frames and mirrored street are sub-pixel in this 1/3-res, blurred mirror: the
    // facade shader's 'low' tier (averaged windows, wall weathering kept) for the pass, −0.4…0.7 ms in the overview /
    // harbour (?reflfacade keeps full detail)
    // (in the glass mirror the opposite row stands close and sharp, and its windows are what makes it a street: full detail, without
    // the painted street in its panes)
    const bu = (this.ctx.services.buildings as { uniforms?: Record<string, { value: unknown }> } | undefined)?.uniforms;
    const fd = this.facadeDetail || G ? null : (bu?.uDetail ?? null);
    const prevDetail = fd ? (fd.value as number) : 1;
    if (fd) fd.value = Math.min(prevDetail, 0.4);
    const wr = G ? (bu?.uWinRefl ?? null) : null;
    const prevWR = wr ? (wr.value as number) : 0;
    if (wr) wr.value = 0;
    const bs = this.blendSave;
    let bi = 0;
    for (const m of this.additive) {
      bs[bi++] = m.blending;
      bs[bi++] = m.blendEquation;
      bs[bi++] = m.blendSrc;
      bs[bi++] = m.blendDst;
      bs[bi++] = m.blendEquationAlpha;
      bs[bi++] = m.blendSrcAlpha;
      bs[bi++] = m.blendDstAlpha;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrcAlpha = THREE.ZeroFactor;
      m.blendDstAlpha = THREE.OneFactor;
    }
    // the pass draws materials that read this very target: unbound for its length
    const prevGM = glassMirror.tGM.value;
    const prevSR = streetMirror.tSRefl.value;
    const prevGK = glassMirror.uGM.value.x;
    glassMirror.tGM.value = GLASS_MIRROR_BLANK;
    streetMirror.tSRefl.value = STREET_MIRROR_BLANK;
    glassMirror.uGM.value.x = 0;
    try {
      scene.background = null;
      scene.matrixWorldAutoUpdate = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.setRenderTarget(this.rt);
      renderer.render(scene, cam);
      if (this.street && STREAKS_ON) this.renderStreaks();
    } finally {
      this.calls = renderer.info.render.calls - c0;
      this.tris = renderer.info.render.triangles - t0;
      // ── state restore
      glassMirror.tGM.value = prevGM;
      streetMirror.tSRefl.value = prevSR;
      glassMirror.uGM.value.x = prevGK;
      if (fd) fd.value = prevDetail;
      if (wr) wr.value = prevWR;
      bi = 0;
      for (const m of this.additive) {
        m.blending = bs[bi++] as THREE.Blending;
        m.blendEquation = bs[bi++] as THREE.BlendingEquation;
        m.blendSrc = bs[bi++] as THREE.BlendingSrcFactor;
        m.blendDst = bs[bi++] as THREE.BlendingDstFactor;
        m.blendEquationAlpha = bs[bi++] as THREE.BlendingEquation | null;
        m.blendSrcAlpha = bs[bi++] as THREE.BlendingSrcFactor | null;
        m.blendDstAlpha = bs[bi++] as THREE.BlendingDstFactor | null;
      }
      n = 0;
      if (this.treesFar) this.treesFar.visible = vs[n++];
      for (const o of this.treesNear) o.visible = vs[n++];
      for (const o of this.streetOnly) o.visible = vs[n++];
      for (const o of this.glassOnly) o.visible = vs[n++];
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
    this.lastEye.copy(this.camPos);
    this.uniforms.uReflInfo.value.x = this.street || G ? 0 : 1;
    streetMirror.uSReflMat.value.copy(this.uniforms.uReflMat.value);
    glassMirror.uGMMat.value.copy(this.uniforms.uReflMat.value);
  }

  /** the mirror drawn out along its vertical, for the rough wet surface (streetMirror.ts); the target exists from the first wet frame on */
  private renderStreaks(): void {
    const renderer = this.ctx.renderer;
    if (!this.streakRT || !this.streakPass) {
      this.streakRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      this.streakRT.texture.name = 'street-streaks';
      this.streakPass = new FullscreenPass(
        new THREE.ShaderMaterial({
          name: 'StreetStreaks',
          uniforms: { tSrc: { value: this.rt.texture } },
          vertexShader: FS_VERT,
          fragmentShader: STREAK_FRAG,
          depthTest: false,
          depthWrite: false,
          blending: THREE.NoBlending,
          toneMapped: false,
        }),
      );
      streetMirror.tSStreak.value = this.streakRT.texture;
    }
    const w = Math.max(32, this.width >> 1),
      h = Math.max(18, this.height >> 1);
    if (this.streakRT.width !== w || this.streakRT.height !== h) this.streakRT.setSize(w, h);
    this.streakPass.render(renderer, this.streakRT);
  }

  dispose(): void {
    this.streakRT?.dispose();
    this.streakPass?.dispose();
    if (this.attached && this.prevBefore) this.ctx.scene.onBeforeRender = this.prevBefore as unknown as THREE.Scene['onBeforeRender'];
    this.rt.dispose();
    this.black.dispose();
  }
}
