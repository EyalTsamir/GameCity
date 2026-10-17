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
  const clouds = new CloudShadowEffect(cloudU, camera, { x0: sl.x0 - 260, z0: sl.z0 - 260, x1: sl.x1 + 260, z1: sl.z1 + 260 });
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
    const fog = scene.fog as THREE.Fog | null;
    if (fog && (fog as THREE.Fog).isFog) aoU.uAOFog.value.set(fog.near, fog.far);
    else aoU.uAOFog.value.set(0, 0);
  };
  const tilt = new TiltShiftEffect(camera, cloudU, aoU);
  const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.35, intensity: 0.6, radius: 0.7, levels: +(params.get('bloomlv') ?? 6) });
  bloom.luminancePass.resolution.scale = +(params.get('bloomres') ?? 0.5);
  const look = new LookEffect(TONE_MAPPING);
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

  const applyEnabled = () => {
    const dofOn = enabledAll && dofUser && quality.dof;
    tilt.enabled = dofOn;
    bloomOn = enabledAll && bloomUser && quality.bloom;
    bloom.intensity = bloomOn ? bloom.intensity : 0;
    if (ao) ao.enabled = enabledAll && aoUser && quality.ao;
  };

  const applyStep = (s: QualityStep) => {
    step = s;
    const changedScale = Math.abs(quality.renderScale - s.renderScale) > 1e-3;
    quality.renderScale = s.renderScale;
    quality.ao = wantAO && s.ao;
    quality.dof = s.dof !== 'off';
    applyEnabled();
    if (changedScale) resize(ctx.size.width, ctx.size.height);
  };

  const ladder = buildLadder(wantAO, quality.dof);
  const adaptive = new AdaptiveController(
    ladder,
    (s) => {
      applyStep(s);
      ctx.events.emit('quality', quality);
      if (ctx.debug.enabled) console.info(`[postfx] quality → ${s.name}`);
    },
    params.get('adaptive') !== '0',
  );
  step = ladder[0];
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

  if (ctx.debug.enabled) ctx.services.postfxInternals = { composer, ao, aoFx, clouds, tilt, bloom, look, smaa, fxPass, renderPass, setAOPath };

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
  };

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
    const hScale = _sz.y / 930;
    const zoom = smooth(30, 560, camDist);
    const lite = step.dof === 'lite';
    kPx = (4.5 + 14.5 * zoom) * hScale * (lite ? 0.8 : 1);
    tilt.params.focus = focusPlanar;
    tilt.params.k = kPx;
    tilt.params.band = 0.035 + 0.03 * (1 - zoom);
    tilt.params.skyCoc = Math.min(kPx * 0.35, 4 * hScale);

    // ── bloom & grade by time of day
    const night = ctx.clock.night;
    const dusk = ctx.clock.dusk;
    if (bloomOn) {
      bloom.intensity = 0.32 + 0.85 * night;
      bloom.luminanceMaterial.threshold = 1.15 - 0.45 * night;
    }
    look.set('uWarm', 0.012 * (1 - night) + 0.018 * dusk - 0.025 * night);
    look.set('uSat', 1.2 - 0.08 * night);

    // ── cloud shadows (data published by the sky module)
    clouds.source = ctx.services.cloudShadows as CloudShadowData | undefined;

    // ── AO radius follows the zoom (contact shadows in close-ups, broad grounding from afar)
    if (ao && ao.enabled) {
      const c = ao.configuration;
      const r = THREE.MathUtils.clamp(camDist * 0.02, 1.6, 9);
      if (Math.abs(c.aoRadius - r) > 0.05) c.aoRadius = r;
      const f = 1.0;
      if (c.distanceFalloff !== f) c.distanceFalloff = f;
    }

    // the whole frame's GPU time (shadow map + scene + post), read back asynchronously
    gpuTimer.poll(gpuSample);
    gpuTimer.begin();
    composer.render(realDt);
    gpuTimer.end();
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
        renderScale: quality.renderScale,
        ao: ao && ao.enabled ? 'on' : 'off',
        dof: tilt.enabled ? 'on' : 'off',
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
