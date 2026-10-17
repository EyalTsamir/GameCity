// Module "sky" — light rig, painted-sky backdrop, sun/moon/stars, cotton clouds,
// fog/haze, exposure, PMREM environment, shadow fitting and (rare) light rain.
//
// Loads first. Everything that depends on the camera looks the camera service up
// lazily each frame (it is created later in the load order).

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { samplePalette, SkyState } from './sky/palette';
import { createSkyDome } from './sky/dome';
import { createClouds, type HeroView, type Obstacle } from './sky/clouds';
import { ShadowFitter } from './sky/shadowFit';
import { EnvironmentBaker } from './sky/env';
import { patchShadowChunk } from './sky/shadowPatch';
import { patchIBLChunk } from './sky/iblPatch';
import { createRain } from './sky/rain';
import { cameraFocus } from './focus';
import { TONE_MAPPING } from './look';
import type { RenderTest } from './sky/renderTest';
import { MAX_CLOUDS, type CloudShadowData } from './postfx/cloudShadow';
import { createStageUniforms, type StageService } from './stage/table';
import { PLINTH_BOTTOM_Y } from './stage/constants';

const _focus = new THREE.Vector3();
const _L = new THREE.Vector3();
const _sunSky = new THREE.Vector3();
const _tmpC = new THREE.Color();
const _grey = new THREE.Color();

function lum(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** copy `src` into `out`, lifting it to at least `minSin` elevation (azimuth kept) */
function liftElevation(src: THREE.Vector3, minSin: number, out: THREE.Vector3): THREE.Vector3 {
  out.copy(src).normalize();
  if (out.y < minSin) {
    const h = Math.hypot(out.x, out.z) || 1;
    const c = Math.sqrt(1 - minSin * minSin);
    out.set((out.x / h) * c, minSin, (out.z / h) * c);
  }
  return out;
}

export default async function create(ctx: CityContext): Promise<CityModule> {
  const { renderer, scene, clock, plan } = ctx;
  // ?legacylight = the original light rig (palette, shadow filtering, IBL) for A/B runs
  const legacyParam = ctx.debug.params.has('legacylight');
  let legacy = legacyParam;
  patchShadowChunk();
  if (!legacyParam) patchIBLChunk();
  renderer.toneMapping = TONE_MAPPING;
  renderer.shadowMap.enabled = ctx.quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ── light rig
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'sun';
  sun.castShadow = ctx.quality.shadows;
  sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.radius = 2.5;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.25;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 1200;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight('#c4dcf4', '#8a8472', 1.1);
  hemi.name = 'sky-hemi';
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  // ── backdrop, clouds, rain
  const dome = createSkyDome();
  scene.add(dome.mesh);

  const obstacles: Obstacle[] = [];
  for (const lot of plan.lots) {
    if (lot.height < 50) continue;
    const f = lot.footprint;
    obstacles.push({ x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2, r: Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2, top: lot.height + (lot.kind === 'tvtower' ? 8 : 0) });
  }
  for (const f of plan.features) {
    const h = typeof f.params?.height === 'number' ? (f.params.height as number) : 0;
    if (h >= 45) obstacles.push({ x: f.x, z: f.z, r: 6 + (typeof f.params?.jib === 'number' ? (f.params.jib as number) : 0), top: h + plan.heightAt(f.x, f.z) });
  }
  const maxStructure = obstacles.reduce((a, o) => Math.max(a, o.top), 40);
  // more clouds than shadow slots (MAX_CLOUDS): only those whose shadows can reach the model are sent
  const cloudCount = Math.max(10, Math.round(20 * Math.min(1, 0.55 + 0.45 * ctx.quality.density)));
  // the clouds' composition is designed around the hero view (overview POI): they frame the model there
  const heroPoi = plan.pois.find((p) => p.id === 'overview');
  let hero: HeroView | null = null;
  if (heroPoi) {
    const yaw = THREE.MathUtils.degToRad(heroPoi.yaw),
      pitch = THREE.MathUtils.degToRad(heroPoi.pitch);
    const target = new THREE.Vector3(heroPoi.target.x, heroPoi.target.y, heroPoi.target.z);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    hero = { target, position: target.clone().addScaledVector(dir, heroPoi.distance) };
  }
  const clouds = createClouds(ctx.rng('clouds'), plan.slab, obstacles, cloudCount, hero, ctx.uniforms.uWind.value);
  clouds.setShadows(ctx.quality.shadows);
  scene.add(clouds.mesh);

  const rainRng = ctx.rng('rain-streaks');
  const rain = createRain(Math.round(6000 * Math.max(0.5, ctx.quality.density)), () => rainRng.next());
  scene.add(rain.mesh);

  // ── fog, background, environment
  const fog = new THREE.Fog('#d4e2ec', 800, 4000);
  scene.fog = fog;
  scene.background = new THREE.Color('#d8e8f2');
  const env = new EnvironmentBaker(renderer, 128);
  env.studio = !legacy;
  scene.environmentIntensity = 0.7;

  const fitter = new ShadowFitter({ slab: plan.slab, minY: -8, maxY: Math.max(maxStructure + 10, 175), sampleHeights: [0, 28] });
  const fitStudio = () => {
    // studio: the table (y ≈ plinth bottom) is a receiver and a strip of it around the plinth is covered
    fitter.params.minY = legacy ? -8 : PLINTH_BOTTOM_Y - 2;
    fitter.params.margin = legacy ? 6 : 14;
  };
  fitStudio();

  // ── studio set: table uniforms (the terrain slab builds the table mesh after us)
  const stage: StageService = { uniforms: createStageUniforms(), table: null, legacyContact: null };
  ctx.services.stage = stage;
  const _cyc = new THREE.Color();
  const applyStageVisibility = () => {
    if (stage.table) stage.table.visible = !legacy;
    if (stage.legacyContact) stage.legacyContact.visible = legacy;
  };
  const state = new SkyState();

  // ── weather (rare light showers; ?weather=rain|clear overrides)
  const wRng = ctx.rng('weather');
  const weatherParam = ctx.debug.params.get('weather');
  let forced: number | null = weatherParam === 'rain' ? 0.8 : weatherParam === 'clear' ? 0 : null;
  let episode: { start: number; end: number } | null = null;
  let plannedDay = clock.day; // no shower on the first day
  let rainAmt = forced ?? 0;
  const absHours = () => (clock.day - 1) * 24 + clock.hours;
  const planDay = (day: number) => {
    plannedDay = day;
    if (wRng.next() < 0.4) {
      const start = (day - 1) * 24 + wRng.range(8, 20.5);
      episode = { start, end: start + wRng.range(0.7, 1.4) };
    }
  };

  // soft cloud shadows are drawn by post-processing from this shared data
  const cloudShadows: CloudShadowData = { data: new Float32Array(MAX_CLOUDS * 8), count: 0, light: new THREE.Vector3(0, 1, 0), strength: 0, tint: new THREE.Color(0.6, 0.64, 0.74) };
  ctx.services.cloudShadows = cloudShadows;
  const _shTint = new THREE.Color();

  /** live multipliers on top of the palette (debug / tuning sessions only) */
  const tune = { sun: 1, hemi: 1, env: 1, exposure: 1, pcf: 1, bias: 1 };
  const skyService = {
    sun,
    hemi,
    setWeather(r: number) {
      forced = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : null;
    },
    /** A/B: switch palette + shadow filtering to the original rig at runtime (IBL patch stays as loaded) */
    setLegacy(on: boolean) {
      legacy = !!on;
      env.studio = !legacy;
      fitStudio();
      applyStageVisibility();
      lastJump = true;
    },
    isLegacy: () => legacy,
    tune,
  };
  ctx.services.sky = skyService;

  let test: RenderTest | null = null;
  if (ctx.debug.params.has('rendertest')) {
    const mod = await import('./sky/renderTest');
    test = mod.buildRenderTest(ctx);
  }

  let lastJump = true;
  ctx.events.on('timejump', () => (lastJump = true));

  let lightI = 0;
  let usingMoon = false;
  let sunVis = 1,
    moonVis = 0;
  let overcast = 0;
  let realTime = 0;
  let lastShadowHs = 0;

  const frameUpdate = (realDt: number) => {
    realTime += realDt;
    samplePalette(clock.hours, state, legacy);
    const sh = clock.sunHeight;

    // ── weather envelope
    let target = 0;
    if (forced !== null) target = forced;
    else {
      const now = absHours();
      if (clock.day > plannedDay) planDay(clock.day);
      const ep = episode as { start: number; end: number } | null;
      if (ep) {
        const ramp = smooth(ep.start, ep.start + 0.25, now) * (1 - smooth(ep.end - 0.3, ep.end, now));
        target = 0.75 * ramp;
        if (now > ep.end) episode = null;
      }
    }
    rainAmt += (target - rainAmt) * Math.min(1, realDt * (lastJump ? 100 : 0.6));
    overcast = Math.min(1, rainAmt * 1.25);
    ctx.uniforms.uRain.value = rainAmt;

    // ── direct light: sun by day, moon by night, crossfading through ~zero at twilight
    const sunW = smooth(-0.035, 0.07, sh);
    const moonW = smooth(0.0, -0.12, sh);
    usingMoon = moonW > sunW;
    if (usingMoon) liftElevation(clock.moonDir, Math.sin(THREE.MathUtils.degToRad(14)), _L);
    else liftElevation(clock.sunDir, Math.sin(THREE.MathUtils.degToRad(6.5)), _L);
    lightI = state.sunI * Math.max(sunW, moonW) * (1 - overcast * 0.72) * tune.sun;
    sun.color.copy(state.sun);
    if (overcast > 0) sun.color.lerp(_grey.setRGB(0.85, 0.88, 0.95), overcast * 0.6);
    sun.intensity = lightI;
    if (legacy) sun.shadow.radius = usingMoon ? 3.5 : 2.2 + 1.2 * state.glowI * 0.5 + overcast * 2;

    hemi.color.copy(state.hemiSky);
    hemi.groundColor.copy(state.hemiGround);
    hemi.intensity = state.hemiI * (1 + overcast * (legacy ? 0.12 : 0.5)) * tune.hemi;
    if (overcast > 0) {
      const g = lum(hemi.color);
      hemi.color.lerp(_grey.setRGB(g, g * 1.02, g * 1.08), overcast * 0.55);
    }

    // ── backdrop
    sunVis = smooth(-0.06, 0.03, sh);
    moonVis = smooth(0.06, -0.1, sh);
    _sunSky.copy(clock.sunDir);
    dome.update(state, _sunSky, clock.moonDir, sunVis, moonVis, clock.realTime, overcast);
    if (!legacy) {
      _cyc.copy(state.cyc);
      if (overcast > 0) {
        const g = lum(_cyc);
        _cyc.lerp(_grey.setRGB(g * 0.92, g * 0.96, g * 1.02), overcast * 0.75);
      }
      dome.setStudio(_cyc);
      stage.uniforms.uCyc.value.copy(_cyc);
    } else dome.setStudio(null);

    // ── camera-dependent: focus, fog, shadows, clouds, rain
    const dist = cameraFocus(ctx, _focus);
    const camPos = ctx.camera.position;
    _tmpC.copy(state.fog);
    if (overcast > 0) {
      const g = lum(_tmpC);
      _tmpC.lerp(_grey.setRGB(g * 1.05, g * 1.08, g * 1.14), overcast * 0.6);
    }
    fog.color.copy(_tmpC);
    (scene.background as THREE.Color).copy(state.horizon);
    const camH = Math.max(1, camPos.y);
    fog.near = (dist * 1.1 + 160) * (1 - overcast * 0.45);
    fog.far = (dist * 3.2 + 1700 + camH * 1.5) * (1 - overcast * 0.5);

    renderer.toneMappingExposure = state.exposure * (1 + overcast * 0.12) * tune.exposure;
    scene.environmentIntensity = state.env * (1 - overcast * 0.2) * tune.env;

    if (sun.castShadow) {
      const maxR = legacy ? THREE.MathUtils.clamp(dist * 1.55 + 30, 70, 420) : THREE.MathUtils.clamp(dist * 1.2 + 24, 60, 420);
      const minR = legacy ? THREE.MathUtils.clamp(dist * 0.55, 28, 200) : THREE.MathUtils.clamp(dist * 0.45, 22, 200);
      fitter.fit(ctx.camera, sun, _L, _focus, maxR, minR, legacy ? 1 : 0.62);
      const cam = sun.shadow.camera;
      const range = Math.max(10, cam.far - cam.near);
      const texel = fitter.texel;
      if (legacy) {
        sun.shadow.normalBias = texel * 1.1;
        sun.shadow.bias = -(texel * 0.35 + 0.02) / range;
      } else {
        // penumbra in WORLD units (a small sun-disc softness that grows a little at low sun and
        // for the moon), converted to texels of the fitted map: close views get soft-but-crisp
        // edges, far views stay at ~1 texel instead of smearing over several texels
        const world = usingMoon ? 0.42 : 0.15 + 0.12 * state.glowI + overcast * 0.9;
        sun.shadow.radius = THREE.MathUtils.clamp((world / texel) * tune.pcf, 1.0, 3.2);
        // normal offset scaled with the texel (acne) but smaller than before: it shortens small
        // casters' shadows by bias·cot(elevation) at low sun
        sun.shadow.normalBias = texel * 0.8 * tune.bias;
        sun.shadow.bias = -(texel * 0.3 + 0.02) / range;
      }
      lastShadowHs = fitter.halfSize;
    } else {
      sun.position.copy(_focus).addScaledVector(_L, 400);
      sun.target.position.copy(_focus);
      sun.updateMatrixWorld();
      sun.target.updateMatrixWorld();
    }

    const lights = ctx.uniforms.uLights.value;
    // studio table: analytic slab shadow follows the shadow-casting light; city spill at night
    stage.uniforms.uStageL.value.copy(_L);
    stage.uniforms.uStageShadow.value = (usingMoon ? 0.6 * moonW : sunW) * (1 - overcast * 0.85);
    stage.uniforms.uCityGlow.value = lights;
    if (stage.table && stage.table.visible === legacy) applyStageVisibility();
    // clouds go dim + translucent only after the afterglow / blue hour (dusk keeps its pink glow)
    const cloudNight = smooth(-0.07, -0.3, sh);
    clouds.frame(ctx.camera, state, _L, sun.color, lightI, sunVis, lights * (1 - sunVis * 0.8), overcast, cloudNight);
    const shStrength = (usingMoon ? 0.3 * moonW : sunW) * (1 - overcast * 0.85);
    _shTint.setRGB(0.6, 0.645, 0.75);
    clouds.writeShadows(cloudShadows, _L, shStrength, _shTint);
    _tmpC.copy(state.cloudShade).lerp(state.fog, 0.4).multiplyScalar(1.3);
    rain.update(clock.simTime, rainAmt, _focus, dist, ctx.uniforms.uWind.value, _tmpC);

    // ── environment (only when the palette drifted noticeably)
    env.maybeBake(scene, state, _sunSky, sunVis, lights, realTime, lastJump);
    lastJump = false;

    test?.update(lights);
  };

  // initial state + first environment bake so every material compiles once with USE_ENVMAP
  frameUpdate(0);

  return {
    name: 'sky',
    update(dt) {
      clouds.step(dt, ctx.uniforms.uWind.value);
    },
    frame(realDt) {
      frameUpdate(realDt);
    },
    stats() {
      return {
        sunElevDeg: Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(clock.sunHeight, -1, 1))) * 10) / 10,
        light: usingMoon ? 'moon' : 'sun',
        lightI: Math.round(lightI * 100) / 100,
        exposure: Math.round(renderer.toneMappingExposure * 100) / 100,
        shadowHalf: Math.round(lastShadowHs),
        shadowTexelCm: Math.round(fitter.texel * 1000) / 10,
        shadowRadius: Math.round(sun.shadow.radius * 100) / 100,
        hemiI: Math.round(hemi.intensity * 100) / 100,
        envI: Math.round(scene.environmentIntensity * 100) / 100,
        key: legacy ? 'legacy' : 'studio',
        clouds: clouds.count,
        cloudsActive: clouds.stats().active,
        cloudsOverCity: clouds.stats().overCity,
        envBakes: env.bakes,
        rain: Math.round(rainAmt * 100) / 100,
      };
    },
    invariants() {
      const out: string[] = [];
      if (!Number.isFinite(sun.intensity) || sun.intensity < 0) out.push(`sun intensity invalid: ${sun.intensity}`);
      if (!Number.isFinite(hemi.intensity) || hemi.intensity <= 0) out.push(`hemi intensity invalid: ${hemi.intensity}`);
      const dir = _tmpV.copy(sun.position).sub(sun.target.position);
      if (!Number.isFinite(dir.lengthSq()) || dir.lengthSq() < 1) out.push('sun direction degenerate');
      else if (dir.normalize().y < 0.05) out.push(`light below horizon (y=${dir.y.toFixed(3)})`);
      if (!(fog.near < fog.far)) out.push(`fog near ${fog.near} >= far ${fog.far}`);
      const e = renderer.toneMappingExposure;
      if (!(e > 0.3 && e < 3)) out.push(`exposure out of range: ${e}`);
      if (!scene.environment) out.push('no environment map');
      if (!scene.children.includes(sun) || !scene.children.includes(hemi)) out.push('light rig missing from scene');
      out.push(...clouds.invariants());
      if (sun.castShadow) {
        // the focus point must be inside the shadow camera's frustum
        const cam = sun.shadow.camera;
        cam.updateMatrixWorld();
        const p = _tmpV.copy(_focus).applyMatrix4(cam.matrixWorldInverse);
        if (Math.abs(p.x) > cam.right || Math.abs(p.y) > cam.top || -p.z < cam.near || -p.z > cam.far) out.push('camera focus outside the shadow frustum');
      }
      return out;
    },
  };
}

const _tmpV = new THREE.Vector3();
