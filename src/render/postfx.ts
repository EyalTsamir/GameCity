// Module "postfx" — the photographic look of the miniature.
//
//   RenderPass ─▶ N8AO (half-res, high quality only) ─▶ EffectPass[
//     SMAA ▸ soft cloud shadows ▸ depth-aware tilt-shift DOF ▸ bloom ▸ AgX + grade + vignette ]
//
// Replaces ctx.render. Tone mapping happens exactly once, inside LookEffect (the
// scene renders into a half-float target where three applies none). An adaptive
// controller trades AO / DOF quality / resolution for frame rate.

import * as THREE from 'three';
import { BlendFunction, BloomEffect, EdgeDetectionMode, Effect, EffectAttribute, EffectComposer, EffectPass, FXAAEffect, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { CityContext, CityModule } from '../core/context';
import { cameraFocus } from './focus';
import { TONE_MAPPING } from './look';
import { TiltShiftEffect } from './postfx/tiltShift';
import { LookEffect } from './postfx/look';
import { CloudShadowEffect, cloudShadowUniforms, type CloudShadowData } from './postfx/cloudShadow';
import { AOApplyEffect, aoUniforms } from './postfx/aoApply';
import { AdaptiveController, GpuTimer, buildLadder, type QualityStep } from './postfx/adaptive';
import { WORLD_MODE } from '../core/world';
import type { AtmosphereService } from './sky/atmoDrive';

/** previous frame's scene depth for soft particles (see ctx.services.postfx.softDepth) */
export interface SoftDepth {
  /** full-resolution depth texture (raw depth-buffer values, perspective) of the previous frame */
  texture: THREE.Texture;
  /** false: raw [0,1] depth — linear view depth = near·far / (far − d·(far − near)) */
  linear: boolean;
  near: number;
  far: number;
  /** size in pixels: uv = gl_FragCoord.xy / (width, height) in the main view */
  width: number;
  height: number;
}

const _focus = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _sz = new THREE.Vector2();

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type FxName = 'dof' | 'bloom' | 'ao';

export default function create(ctx: CityContext): CityModule {
  const { renderer, scene, camera, quality } = ctx;
  const params = ctx.debug.params;
  // world mode: natural optics — a thin-lens DOF that only shows at close focus instead of the
  // tilt-shift miniature blur (?tiltshift forces the miniature DOF back for comparison), and a natural
  // grade (AgX + time-of-day CDL look; ?gradeold = the diorama grade)
  const world = WORLD_MODE;
  const lensMode = world && !params.has('tiltshift');
  const lensN = Math.max(0.7, Number(params.get('lensN') ?? 1.6) || 1.6);
  const worldGrade = world && !params.has('gradeold');
  const atmo = () => ctx.services.atmosphere as AtmosphereService | undefined;

  const fbType = params.get('fbtype') === 'u8' ? THREE.UnsignedByteType : THREE.HalfFloatType;
  const composer = new EffectComposer(renderer, { frameBufferType: fbType, multisampling: 0, stencilBuffer: false });
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  renderer.getDrawingBufferSize(_sz);
  let ao: N8AOPostPass | null = null;
  /** AO composited by our effect pass (true) or by N8AO's own full-res passes (debug A/B) */
  let aoFused = false;
  let setAOPath: (fused: boolean) => void = () => {};
  const wantAO = quality.ao && !params.has('noao');
  if (wantAO) {
    ao = new N8AOPostPass(scene, camera, _sz.x, _sz.y);
    const c = ao.configuration;
    c.transparencyAware = false; // never re-render transparents (and no per-frame scene traversal)
    c.gammaCorrection = false;
    c.halfRes = true;
    c.depthAwareUpsampling = params.get('aoup') !== '0';
    const aoq = params.get('aoq') ?? 'perf';
    c.aoSamples = aoq === 'med' ? 16 : aoq === 'low' ? 12 : 8;
    c.denoiseSamples = aoq === 'med' ? 8 : 4;
    c.denoiseRadius = 10;
    c.denoiseIterations = aoq === 'perf1' ? 1 : 2;
    c.distanceFalloff = 1.0;
    c.intensity = 2.4;
    c.aoRadius = 4;
    c.color = new THREE.Color('#1c2433');
    composer.addPass(ao);
    // N8AO copies its result into the composer's output buffer with a depth-tested
    // full-screen triangle; that buffer's depth attachment is never cleared, so the copy
    // can be rejected entirely. Copy without depth testing.
    const aoQuads = ao as unknown as Record<string, { material?: THREE.Material; render?: (r: THREE.WebGLRenderer) => void } | undefined>;
    for (const key of ['copyQuad', 'effectCompositerQuad', 'accumulationQuad', 'effectShaderQuad', 'poissonBlurQuad', 'depthDownsampleQuad']) {
      const m = aoQuads[key]?.material;
      if (m) {
        m.depthTest = false;
        m.depthWrite = false;
      }
    }
    // The AO is applied inside the final effect pass (postfx/aoApply.ts): skip N8AO's own
    // full-resolution composite + copy (and the accumulation copy, unused without temporal
    // accumulation). The pass then leaves the colour buffer untouched, so the composer must
    // not swap; its full-size output targets are shrunk to 1x1.
    // (`postfxInternals.setAOPath(false)` restores N8AO's own path — debug A/B only.)
    const stubbed = ['effectCompositerQuad', 'copyQuad', 'accumulationQuad'];
    const origRender = stubbed.map((k) => aoQuads[k]?.render);
    const aoInt = ao as unknown as Record<string, THREE.WebGLRenderTarget | undefined>;
    const spare = ['outputTargetInternal', 'accumulationRenderTarget'].map((k) => aoInt[k]).filter((rt): rt is THREE.WebGLRenderTarget => !!rt);
    const origSetSize = spare.map((rt) => rt.setSize.bind(rt));
    const aoRef = ao;
    setAOPath = (fused: boolean) => {
      aoFused = fused;
      stubbed.forEach((k, i) => {
        const q = aoQuads[k];
        if (q) q.render = fused ? () => {} : origRender[i];
      });
      aoRef.needsSwap = !fused;
      spare.forEach((rt, i) => {
        rt.setSize = origSetSize[i];
        if (fused) {
          rt.setSize(1, 1);
          rt.setSize = () => rt;
        } else {
          const half = aoRef.configuration.halfRes && rt === aoInt.accumulationRenderTarget;
          const w = composer.inputBuffer.width,
            h = composer.inputBuffer.height;
          rt.setSize(half ? Math.floor(w / 2) : w, half ? Math.floor(h / 2) : h);
        }
      });
    };
    setAOPath(true);
    // N8AO's denoise shader trips a benign HLSL warning (X3595) on ANGLE/D3D. Compile its
    // programs once up front with the info-log check off; they are never recompiled later.
    const dbg = renderer.debug;
    const prev = dbg.checkShaderErrors;
    dbg.checkShaderErrors = false;
    try {
      ao.render(renderer, composer.inputBuffer, composer.outputBuffer);
    } finally {
      dbg.checkShaderErrors = prev;
    }
  }

  const cloudU = cloudShadowUniforms();
  const sl = ctx.plan.slab;
  const cloudField = (ctx.services.cloudShadows as CloudShadowData | undefined)?.field ?? null;
  const clouds = new CloudShadowEffect(cloudU, camera, { x0: sl.x0 - 260, z0: sl.z0 - 260, x1: sl.x1 + 260, z1: sl.z1 + 260 }, 256, cloudField);
  // ambient occlusion applied in the effect pass (and in the tilt-shift prefilter), see postfx/aoApply.ts
  const aoU = aoUniforms();
  const aoFx = new AOApplyEffect(aoU, params.has('aoexact'));
  const aoTint = new THREE.Color();
  aoFx.onUpdate = () => {
    const on = !!ao && ao.enabled && aoFused;
    aoU.uAOOn.value = on ? 1 : 0;
    if (!ao || !on) return;
    const int = ao as unknown as { writeTargetInternal: THREE.WebGLRenderTarget; depthDownsampleTarget: { textures: THREE.Texture[] } | null };
    aoU.tAO.value = int.writeTargetInternal.texture;
    aoU.tAODepth.value = int.depthDownsampleTarget ? int.depthDownsampleTarget.textures[0] : null;
    const c = ao.configuration;
    aoU.uAOIntensity.value = c.intensity;
    aoU.uAOFalloff.value = c.distanceFalloff;
    aoU.uAOTint.value.copy(aoTint.copy(c.color).convertSRGBToLinear());
    aoU.uAOProjInv.value.copy(camera.projectionMatrixInverse);
    aoU.uAORes.value.set(composer.inputBuffer.width, composer.inputBuffer.height);
    const at = atmo();
    const fog = scene.fog as THREE.Fog | null;
    if (at && at.active) {
      // AO multiplies the final colour (incl. the haze in front): fade it out as the haze takes over
      const y = Math.max(0, camera.position.y);
      aoU.uAOFog.value.set(at.distanceFor(0.9, y), at.distanceFor(0.35, y));
    } else if (fog && (fog as THREE.Fog).isFog) aoU.uAOFog.value.set(fog.near, fog.far);
    else aoU.uAOFog.value.set(0, 0);
  };
  const tilt = new TiltShiftEffect(camera, cloudU, aoU);
  const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.35, intensity: 0.6, radius: 0.7, levels: +(params.get('bloomlv') ?? 6) });
  bloom.luminancePass.resolution.scale = +(params.get('bloomres') ?? 0.5);
  // NaN/Inf guard where scene colour enters the bloom chain: a single bad pixel would otherwise be
  // spread by the mip downsample/upsample into big black blocks (seen in full-city frames)
  {
    const lm = bloom.luminanceMaterial;
    const src = 'vec4 texel=texture2D(inputBuffer,vUv);';
    if (lm.fragmentShader.includes(src)) {
      lm.fragmentShader = lm.fragmentShader.replace(src, src + 'texel.rgb=min(max(texel.rgb,vec3(0.0)),vec3(64000.0));if(any(isnan(texel))||any(isinf(texel)))texel=vec4(0.0);');
      lm.needsUpdate = true;
    }
  }
  // ?nanviz (debug): NaN/Inf scene pixels show up magenta in the final image instead of black
  const look = new LookEffect(TONE_MAPPING, params.has('nanviz'), worldGrade);
  const aaMode = params.get('aa') ?? 'smaa';
  let smaa: Effect;
  if (aaMode === 'fxaa') {
    const fx = new FXAAEffect();
    // FXAA reads its neighbours from the input buffer: it must run first in the pass
    (fx as unknown as { setAttributes(a: number): void }).setAttributes(EffectAttribute.CONVOLUTION);
    smaa = fx;
  } else {
    const sm = new SMAAEffect({ preset: quality.level === 'low' ? SMAAPreset.LOW : SMAAPreset.MEDIUM, edgeDetectionMode: EdgeDetectionMode.COLOR });
    sm.edgeDetectionMaterial.edgeDetectionThreshold = 0.06;
    smaa = sm;
  }
  // ?fx=smaa,ao,clouds,tilt,bloom,look (debug: build the chain from a subset). SMAA's blending
  // samples the input buffer itself, so the AO step comes right after it.
  const fxList = (params.get('fx') ?? (aaMode === 'none' ? 'ao,clouds,tilt,bloom,look' : 'smaa,ao,clouds,tilt,bloom,look')).split(',').filter((k) => k !== 'ao' || !!ao);
  const all = { smaa, ao: aoFx, clouds, tilt, bloom, look } as const;
  const fxPass = new EffectPass(camera, ...(Object.keys(all) as (keyof typeof all)[]).filter((k) => fxList.includes(k)).map((k) => all[k]));
  fxPass.dithering = true;
  composer.addPass(fxPass);

  // bloom passes are skipped entirely while bloom is off
  const bloomUpdate = bloom.update.bind(bloom);
  let bloomOn = quality.bloom;
  bloom.update = (r, i, d) => {
    if (bloomOn) bloomUpdate(r, i, d);
  };

  // ── state & services
  let enabledAll = true;
  let dofUser = true;
  let bloomUser = true;
  let aoUser = true;
  let focusOverride: number | null = null;
  let step: QualityStep;
  /** world lens: blur too small to see this frame → the DOF passes are skipped */
  let lensIdle = false;
  let dofWanted = true;

  const applyEnabled = () => {
    const dofOn = enabledAll && dofUser && quality.dof;
    dofWanted = dofOn;
    tilt.enabled = dofOn && !lensIdle;
    bloomOn = enabledAll && bloomUser && quality.bloom;
    bloom.intensity = bloomOn ? bloom.intensity : 0;
    if (ao) ao.enabled = enabledAll && aoUser && quality.ao;
  };

  // world round: expensive features of other modules, thinned through their setters
  type Grass = { setDensity?(k: number): void; getDensity?(): number };
  type Leaves = { setLeafDistance?(m: number | null): void; getLeafDistance?(): number };
  const grassSvc = ctx.services.groundcover as Grass | undefined;
  const leafSvc = ctx.services.vegetation as Leaves | undefined;
  const grassBase = grassSvc?.getDensity?.() ?? 0;
  const leafBase = leafSvc?.getLeafDistance?.() ?? 0;
  let grassK = 1,
    leafK = 1;
  const applyDetail = (s: QualityStep) => {
    if (grassSvc?.setDensity && grassBase > 0 && s.grass !== grassK) {
      grassK = s.grass;
      grassSvc.setDensity(Math.max(0.25, grassBase * grassK));
    }
    if (leafSvc?.setLeafDistance && leafBase > 0 && s.leaf !== leafK) {
      leafK = s.leaf;
      leafSvc.setLeafDistance(leafK >= 1 ? null : leafBase * leafK);
    }
  };

  const applyStep = (s: QualityStep) => {
    step = s;
    applyDetail(s);
    const changedScale = Math.abs(quality.renderScale - s.renderScale) > 1e-3;
    quality.renderScale = s.renderScale;
    quality.ao = wantAO && s.ao;
    quality.dof = s.dof !== 'off';
    applyEnabled();
    if (changedScale) resize(ctx.size.width, ctx.size.height);
  };

  // water planar reflections (water module, loaded before us): the ladder caps their level
  type WaterRefl = { setReflectionQuality?(l: 0 | 1 | 2): void; reflectionQuality?(): number };
  const water = () => ctx.services.water as WaterRefl | undefined;
  const reflAtLoad = (water()?.reflectionQuality?.() ?? 0) > 0;
  /** apply the step's reflection cap — AFTER the 'quality' event (the water module resets to its preset on it) */
  const applyRefl = (s: QualityStep) => {
    const w = water();
    if (!w?.setReflectionQuality || !w.reflectionQuality) return;
    const cur = w.reflectionQuality();
    if (cur > s.refl) w.setReflectionQuality(s.refl);
  };
  // any 'quality' event (ours, or a preset change in the UI) makes the water module restore its
  // preset level; re-apply the current step's cap right after (water's handler was registered first)
  ctx.events.on('quality', () => applyRefl(step));
  const ladder = buildLadder(wantAO, quality.dof, reflAtLoad, grassBase > 0 && !!grassSvc?.setDensity, leafBase > 0 && !!leafSvc?.setLeafDistance);
  const adaptive = new AdaptiveController(
    ladder,
    (s) => {
      applyStep(s);
      ctx.events.emit('quality', quality);
      applyRefl(s);
      if (ctx.debug.enabled) console.info(`[postfx] quality → ${s.name}`);
    },
    params.get('adaptive') !== '0',
  );
  step = ladder[0];
  if (ctx.debug.enabled) ctx.services.postfxInternals = { composer, ao, aoFx, clouds, tilt, bloom, look, smaa, fxPass, renderPass, setAOPath, adaptive, ladder };
  // per-frame GPU time for the adaptive controller (only while it is enabled: no queries otherwise)
  const gpuTimer = new GpuTimer(renderer.getContext() as WebGL2RenderingContext);
  const gpuSample = (ms: number) => adaptive.gpuSample(ms);
  if (!adaptive.enabled) {
    gpuTimer.begin = () => {};
    gpuTimer.end = () => {};
  }

  const resize = (w: number, h: number) => {
    renderer.setPixelRatio(quality.pixelRatio * quality.renderScale);
    composer.setSize(w, h, false);
  };



  ctx.services.postfx = {
    setEnabled(effect, on) {
      if (effect === 'all') enabledAll = on;
      else if (effect === 'dof') dofUser = on;
      else if (effect === 'bloom') bloomUser = on;
      else if (effect === 'ao') aoUser = on;
      applyEnabled();
    },
    isEnabled(effect: FxName) {
      if (!enabledAll) return false;
      if (effect === 'dof') return tilt.enabled;
      if (effect === 'bloom') return bloomOn;
      return !!ao && ao.enabled;
    },
    setFocus(distance) {
      focusOverride = distance !== null && Number.isFinite(distance) && distance > 0 ? distance : null;
    },
    softDepth(): SoftDepth | null {
      return softDepth.texture && enabledAll ? softDepth : null;
    },
  };
  // the composer's "stable" depth target is blitted right after the RenderPass every frame; during the
  // next frame's scene pass it still holds the previous frame (a separate FBO: legal to sample)
  const softDepth: SoftDepth = { texture: null as unknown as THREE.Texture, linear: false, near: camera.near, far: camera.far, width: 1, height: 1 };

  applyStep(ladder[0]);

  let focusPlanar = 200;
  let camDist = 200;
  let kPx = 10;
  let firstFrame = true;

  // count every pass of a frame (scene + shadow + post) in renderer.info
  renderer.info.autoReset = false;

  ctx.render = (realDt: number) => {
    renderer.info.reset();
    camera.updateMatrixWorld();
    if (!enabledAll) {
      const ac = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      renderer.autoClear = ac;
      return;
    }
    // ── focus (planar depth of the camera target) and blur strength
    const d = cameraFocus(ctx, _focus);
    camera.getWorldDirection(_fwd);
    let planar = _fwd.dot(_tmp.copy(_focus).sub(camera.position));
    if (!(planar > 0.5)) planar = d;
    if (focusOverride !== null) planar = focusOverride;
    // ease focus pulls a little (fly-tos), but snap on the first frame / big jumps
    const k = firstFrame || Math.abs(planar - focusPlanar) > focusPlanar * 0.6 ? 1 : Math.min(1, realDt * 12);
    focusPlanar += (planar - focusPlanar) * k;
    camDist = d;
    firstFrame = false;

    renderer.getDrawingBufferSize(_sz);
    const lite = step.dof === 'lite';
    if (lensMode) {
      // thin lens, 35 mm full-frame equivalent (24 mm sensor height, focal length from the vertical
      // FOV), aperture f/lensN: blur-circle radius at infinity in output pixels. coc(z) = K·(1 − F/z)
      // is exactly the tilt-shift model with no sharp band. Beyond ~40 m focus it is sub-pixel → skipped.
      const fmm = 12 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const Fmm = Math.max(focusPlanar * 1000, fmm * 2);
      kPx = 0.5 * ((fmm * fmm) / (lensN * (Fmm - fmm)) / 24) * _sz.y * (lite ? 0.8 : 1);
      kPx = Math.min(kPx, 24);
      tilt.params.focus = focusPlanar;
      tilt.params.k = kPx;
      tilt.params.band = 0.004;
      tilt.params.skyCoc = kPx;
      const idle = kPx < 0.6;
      if (idle !== lensIdle) {
        lensIdle = idle;
        tilt.enabled = dofWanted && !lensIdle;
      }
    } else {
      const hScale = _sz.y / 930;
      const zoom = smooth(30, 560, camDist);
      kPx = (4.5 + 14.5 * zoom) * hScale * (lite ? 0.8 : 1);
      tilt.params.focus = focusPlanar;
      tilt.params.k = kPx;
      tilt.params.band = 0.035 + 0.03 * (1 - zoom);
      tilt.params.skyCoc = Math.min(kPx * 0.35, 4 * hScale);
    }

    // ── bloom & grade by time of day
    const night = ctx.clock.night;
    const dusk = ctx.clock.dusk;
    const skySvc = ctx.services.sky as { isLegacy?: () => boolean } | undefined;
    const legacy = skySvc?.isLegacy ? skySvc.isLegacy() : params.has('legacylight');
    if (legacy) {
      if (bloomOn) {
        bloom.intensity = 0.32 + 0.85 * night;
        bloom.luminanceMaterial.threshold = 1.15 - 0.45 * night;
      }
      look.set('uWarm', 0.012 * (1 - night) + 0.018 * dusk - 0.025 * night);
      look.set('uSat', 1.2 - 0.08 * night);
      look.set('uVignette', 0.28);
      look.setVec('uShadowTint', -0.01, 0.0, 0.018);
    } else if (worldGrade) {
      // world: natural grade — AgX with a time-of-day look: neutral by day, a partial "Golden" CDL
      // when the sun is low (warm, slightly compressed highlights), cool and calm at night; little
      // extra saturation (saturation comes from the light), clean blacks, a faint lens vignette
      if (bloomOn) {
        bloom.intensity = 0.26 + 0.74 * night;
        bloom.luminanceMaterial.threshold = 1.45 - 0.57 * night;
        bloom.luminanceMaterial.smoothing = 0.32 - 0.08 * night;
      }
      const gold = dusk * (1 - night);
      const gk = 0.32 * gold;
      look.setVec('uLookSlope', 1, 1 - 0.1 * gk, 1 - 0.5 * gk);
      look.set('uLookPower', 1 - 0.2 * gk);
      look.set('uLookSat', 1 + 0.06 * gold - 0.08 * night);
      look.set('uSat', 1.04);
      look.set('uContrast', 0.14);
      look.setVec('uLift', 0.006, 0.007, 0.011);
      look.set('uWarm', 0.006 * (1 - night) + 0.008 * dusk - 0.012 * night);
      look.set('uVignette', 0.16 + 0.12 * night);
      look.setVec('uShadowTint', -0.003, 0.0, 0.006);
    } else {
      // studio key: sunlit whites sit higher (stronger sun), so the day threshold rises to keep
      // daylight crisp; at night only real emitters (lamps, windows, neon) cross it — the dark
      // moonlit city never feeds the bloom, so there is no veil
      if (bloomOn) {
        bloom.intensity = 0.26 + 0.74 * night;
        bloom.luminanceMaterial.threshold = 1.45 - 0.57 * night;
        bloom.luminanceMaterial.smoothing = 0.32 - 0.08 * night;
      }
      look.set('uWarm', 0.014 * (1 - night) + 0.02 * dusk - 0.012 * night);
      look.set('uSat', 1.2 - 0.1 * night);
      // a deeper vignette at night: the lit town sits in a soft pool, the backdrop sinks to indigo
      look.set('uVignette', 0.28 + 0.14 * night);
      look.setVec('uShadowTint', -0.004, 0.0, 0.007);
    }

    // ── cloud shadows (data published by the sky module)
    clouds.source = ctx.services.cloudShadows as CloudShadowData | undefined;

    // ── AO radius follows the zoom (contact shadows in close-ups, broad grounding from afar)
    if (ao && ao.enabled) {
      const c = ao.configuration;
      // studio key: a neutral, barely cool occlusion tint (the legacy navy tint turned every
      // contact shadow blue on top of the blue sky fill)
      c.color.copy(legacy ? aoTintLegacy : aoTintStudio);
      const r = legacy ? THREE.MathUtils.clamp(camDist * 0.02, 1.6, 9) : THREE.MathUtils.clamp(camDist * 0.022, 1.6, 10);
      if (Math.abs(c.aoRadius - r) > 0.05) c.aoRadius = r;
      // studio: contact shading a little stronger from POI distance outwards, where the sun-dominated
      // key leaves less fill for AO to darken (it multiplies the final colour)
      const ai = legacy ? 2.4 : 2.4 + 0.7 * smooth(80, 420, camDist);
      if (Math.abs(c.intensity - ai) > 0.02) c.intensity = ai;
      const f = 1.0;
      if (c.distanceFalloff !== f) c.distanceFalloff = f;
    }

    // the whole frame's GPU time (shadow map + scene + post), read back asynchronously
    gpuTimer.poll(gpuSample);
    gpuTimer.begin();
    composer.render(realDt);
    gpuTimer.end();
    // what softDepth() hands out during the next frame
    const sd = (composer as unknown as { stableDepthTexture: THREE.Texture | null }).stableDepthTexture;
    if (sd) {
      softDepth.texture = sd;
      softDepth.near = camera.near;
      softDepth.far = camera.far;
      softDepth.width = composer.inputBuffer.width;
      softDepth.height = composer.inputBuffer.height;
    }
  };

  return {
    name: 'postfx',
    frame(realDt) {
      adaptive.frame(realDt);
    },
    resize(w, h) {
      resize(w, h);
    },
    stats() {
      return {
        step: step.name,
        grassK,
        leafK,
        refl: water()?.reflectionQuality?.() ?? -1,
        renderScale: quality.renderScale,
        ao: ao && ao.enabled ? 'on' : 'off',
        dof: tilt.enabled ? 'on' : lensMode && dofWanted ? 'lens-idle' : 'off',
        bloom: bloomOn ? 'on' : 'off',
        focus: Math.round(focusPlanar),
        cocPx: Math.round(kPx * 10) / 10,
        fpsWin: Math.round(adaptive.fps),
        gpuMs: Math.round(adaptive.gpuMs * 10) / 10,
        capped: adaptive.capped ? 1 : 0,
      };
    },
    invariants() {
      const out: string[] = [];
      renderer.getDrawingBufferSize(_sz);
      if (composer.inputBuffer.width !== _sz.x || composer.inputBuffer.height !== _sz.y) out.push(`composer buffer ${composer.inputBuffer.width}x${composer.inputBuffer.height} != drawing buffer ${_sz.x}x${_sz.y}`);
      if (!Number.isFinite(focusPlanar) || focusPlanar <= 0) out.push(`invalid focus distance ${focusPlanar}`);
      if (!(kPx >= 0 && kPx < 80)) out.push(`CoC scale out of range: ${kPx}`);
      if (renderer.toneMapping !== TONE_MAPPING) out.push('renderer tone mapping differs from the post chain');
      if (quality.renderScale < 0.5 || quality.renderScale > 1) out.push(`renderScale out of range ${quality.renderScale}`);
      return out;
    },
    dispose() {
      composer.dispose();
    },
  };
}

const _tmp = new THREE.Vector3();
const aoTintLegacy = new THREE.Color('#1c2433');
const aoTintStudio = new THREE.Color('#25262c');
