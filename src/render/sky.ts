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
import { EnvironmentBaker, type EnvPhysical } from './sky/env';
import { patchShadowChunk } from './sky/shadowPatch';
import { patchIBLChunk } from './sky/iblPatch';
import { createRain } from './sky/rain';
import { cameraFocus } from './focus';
import { TONE_MAPPING } from './look';
import type { RenderTest } from './sky/renderTest';
import { MAX_CLOUDS, type CloudShadowData } from './postfx/cloudShadow';
import { createStageUniforms, type StageService } from './stage/table';
import { PLINTH_BOTTOM_Y } from './stage/constants';
import { WORLD_MODE } from '../core/world';
import { installAtmosphere, evalRing } from './atmosphere';
import { AtmosphereDriver, skyElevationDeg } from './sky/atmoDrive';
import { cloudLayerUniforms } from './sky/cloudLayer';
import { CloudVolume } from './sky/cloudVolume';

const _focus = new THREE.Vector3();
const _L = new THREE.Vector3();
const _sunSky = new THREE.Vector3();
const _sunVisual = new THREE.Vector3();
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
  // world mode (default): real sky to the horizon + aerial perspective replacing three's fog chunks
  // (installed before ANY material compiles); ?diorama keeps the studio tabletop exactly as it was.
  // ?noatmo = world sky but three's linear fog (A/B of the atmosphere alone)
  const world = WORLD_MODE;
  const atmoOn = world && !ctx.debug.params.has('noatmo');
  if (atmoOn) installAtmosphere();
  // world sky: physical single scattering (?paintsky = the painted gradient instead)
  const physSky = world && !ctx.debug.params.has('paintsky');
  const atmo = new AtmosphereDriver(physSky);
  const atmoParam = Number(ctx.debug.params.get('atmo'));
  if (Number.isFinite(atmoParam) && ctx.debug.params.has('atmo')) atmo.hazeK = Math.max(0, atmoParam);
  atmo.mistOn = !ctx.debug.params.has('nomist');
  const atmoSvc = atmo.service(atmoOn);
  if (world) ctx.services.atmosphere = atmoSvc;
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
  // world: the high cloud sky (cumulus deck + cirrus), shared with the cloud-shadow map (?noclouds)
  const cloudLayer = world && !ctx.debug.params.has('noclouds') ? cloudLayerUniforms() : null;
  const cloudCovParam = ctx.debug.params.has('clouds') ? Number(ctx.debug.params.get('clouds')) : NaN;
  const cloudDayRng = ctx.rng('cloud-days');
  const cloudDay = { day: -1, cu: 1, ci: 1 };
  const dome = createSkyDome(world, physSky, cloudLayer);
  // the cumulus deck is raymarched at half resolution for the final camera of each frame: post-processing
  // calls renderClouds() right before the scene pass; without it the sky module renders it in frame()
  const cloudVol = cloudLayer ? new CloudVolume(cloudLayer) : null;
  cloudVol?.setQuality(ctx.quality.level);
  ctx.events.on('quality', () => cloudVol?.setQuality(ctx.quality.level));
  // a time jump changes the light on every cloud at once: start the temporal history afresh
  ctx.events.on('timejump', () => cloudVol?.reset());
  let cloudVolFrame = -1;
  let frameNo = 0;
  const renderClouds = (r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera) => {
    if (!cloudVol || cloudVolFrame === frameNo) return;
    cloudVolFrame = frameNo;
    cloudVol.render(r, cam);
    dome.setCloudVolume(cloudVol.texture, cloudVol.fullRes);
  };
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
  // world mode: the low cotton puffs are a tabletop prop (the high cloud sky replaces them)
  const cottonClouds = !world;
  clouds.setShadows(ctx.quality.shadows && cottonClouds);
  clouds.mesh.visible = cottonClouds;
  scene.add(clouds.mesh);

  const rainRng = ctx.rng('rain-streaks');
  const rain = createRain(Math.round(6000 * Math.max(0.5, ctx.quality.density)), () => rainRng.next());
  scene.add(rain.mesh);

  // ── fog, background, environment
  const fog = new THREE.Fog('#d4e2ec', 800, 4000);
  scene.fog = fog;
  scene.background = new THREE.Color('#d8e8f2');
  const env = new EnvironmentBaker(renderer, 128, physSky);
  const envPhys: EnvPhysical | null = atmo.lut ? { lut: atmo.lut.texture, scale: 1, nightZen: new THREE.Color(), nightHor: new THREE.Color(), nightW: 0, lobe: new THREE.Color(), lobeExp: 7, sat: 0.7 } : null;
  env.phys = envPhys;
  env.studio = !legacy;
  scene.environmentIntensity = 0.7;

  // world: the ground continues beyond the slab (landscape near ring) — the visible region is limited
  // by the radius around the focus instead of by the slab
  const shadowArea = world ? { x0: plan.slab.x0 - 1400, x1: plan.slab.x1 + 1400, z0: plan.slab.z0 - 1400, z1: plan.slab.z1 + 1400 } : plan.slab;
  const fitter = new ShadowFitter({ slab: shadowArea, minY: -8, maxY: Math.max(maxStructure + 10, 175), sampleHeights: [0, 28] });
  const fitStudio = () => {
    // studio: the table (y ≈ plinth bottom) is a receiver and a strip of it around the plinth is covered
    fitter.params.minY = legacy || world ? -8 : PLINTH_BOTTOM_Y - 2;
    fitter.params.margin = legacy || world ? 6 : 14;
  };
  fitStudio();

  // ── studio set: table uniforms (the terrain slab builds the table mesh after us)
  const stage: StageService = { uniforms: createStageUniforms(), table: null, legacyContact: null };
  ctx.services.stage = stage;
  const _cyc = new THREE.Color();
  // ?notable: studio key without the table (perf A/B of the table alone; the dome floor stays)
  let noTable = ctx.debug.params.has('notable');
  const applyStageVisibility = () => {
    if (stage.table) stage.table.visible = !legacy && !noTable;
    if (stage.legacyContact) stage.legacyContact.visible = legacy || noTable;
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
  const cloudShadows: CloudShadowData = { data: new Float32Array(MAX_CLOUDS * 8), count: 0, light: new THREE.Vector3(0, 1, 0), strength: 0, tint: new THREE.Color(0.6, 0.64, 0.74), field: cloudLayer ?? undefined };
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
    /** A/B: show / hide the studio table at runtime (same as ?notable) */
    setTable(on: boolean) {
      noTable = !on;
      applyStageVisibility();
    },
    tune,
    /** world: render the raymarched cumulus deck for this frame's final camera (postfx calls it) */
    renderClouds,
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
    frameNo++;
    // no post-processing to call renderClouds() with the final camera: render with last frame's camera
    if (cloudVol && !ctx.services.postfx) renderClouds(renderer, ctx.camera);
    samplePalette(clock.hours, state, legacy);
    // world: the rendered sun follows the authored golden key — the clock's sine path keeps the sun ~17° up
    // 1.3 h before sunset, a real late-afternoon sun sinks almost linearly (~10–12°) — so light, shadows
    // (long and raking), disc, glow, sky and clouds all use one lower "visual" sun at golden hour
    _sunVisual.copy(clock.sunDir);
    if (world) {
      const elT = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(clock.sunDir.y, -1, 1)));
      const elV = THREE.MathUtils.degToRad(skyElevationDeg(elT, clock.hours));
      const hz = Math.hypot(clock.sunDir.x, clock.sunDir.z);
      if (hz > 1e-6) _sunVisual.set((clock.sunDir.x / hz) * Math.cos(elV), Math.sin(elV), (clock.sunDir.z / hz) * Math.cos(elV));
      // shared with every shader (backlight / translucency): the sun they light by is the one shown
      ctx.uniforms.uSunDir.value.copy(_sunVisual);
    }
    // (sun height of the rendered sun: direct light, disc, clouds and twilight follow the visual sunset)
    const sh = world ? _sunVisual.y : clock.sunHeight;

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
    else liftElevation(_sunVisual, Math.sin(THREE.MathUtils.degToRad(6.5)), _L);
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
    _sunSky.copy(_sunVisual);
    dome.update(state, _sunSky, clock.moonDir, sunVis, moonVis, clock.realTime, overcast);
    if (world) {
      // sky glow of the lit town (and the villages around): warm, low, only with the street lights on
      atmo.cityGlow.setRGB(1.0, 0.6, 0.32).multiplyScalar(0.045 * ctx.uniforms.uLights.value * (1 - overcast * 0.3) + 0.03 * overcast * ctx.uniforms.uLights.value);
      dome.setCityGlow(atmo.cityGlow);
      atmo.update(renderer, state, _sunSky, sunVis, overcast, ctx.camera.position.y, ctx.uniforms.uWind.value, clock.speed > 0 ? realDt * clock.speed : 0, clock.hours);
      // the horizon other modules mirror (water): the haze ~120° from the sun — the sea mostly reflects
      // the sky away from the sun; the sun side is the palette glow they already add
      // Belt of Venus: strongest with the (visual) sun from ~+3° to −5°, a faint pink arch at golden hour
      {
        const el = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(_sunVisual.y, -1, 1)));
        const k = smooth(-9, -3, el) * (1 - smooth(4, 16, el) * 0.7) * (1 - smooth(16, 22, el));
        const l = THREE.MathUtils.clamp(lum(atmo.params.ring[0]), 0, 2);
        _belt.setRGB(1.0, 0.6, 0.66).multiplyScalar(0.32 * k * l * (1 - overcast));
        dome.setBelt(_belt);
        dome.setSkySat(0.4 * atmo.golden);
      }
      // (35 % toward the blue air: the sea's body reads blue/teal, not lilac, under the earth-shadow band)
      evalRing(atmo.params.ring, 2.1, _hor).lerp(atmo.params.airColor, 0.35);
      if (atmo.lut) dome.setPhysical(atmo.lut.texture, atmo.skyScale, state.zenith, state.horizon, atmo.nightW, atmo.sunColor, atmo.zenith, _hor);
      if (envPhys) {
        envPhys.scale = atmo.skyScale;
        envPhys.nightZen.copy(state.zenith);
        envPhys.nightHor.copy(state.horizon);
        envPhys.nightW = atmo.nightW;
        // the broad part of the sun lobe only (the direct light owns the highlight)
        envPhys.lobe.copy(atmo.params.lobeColor).multiplyScalar(0.35);
        envPhys.lobeExp = atmo.params.lobeExp;
      }
    }
    if (!legacy && !world) {
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
    (scene.background as THREE.Color).copy(state.horizon);
    if (world) {
      // the atmosphere owns the look; these values only serve CPU consumers (reflection horizons)
      // and the ?noatmo A/B (three's linear fog over the same distances)
      atmo.fogColor(fog.color);
      fog.near = atmoSvc.distanceFor(0.97, Math.max(0, camPos.y));
      fog.far = Math.max(fog.near + 10, atmoSvc.distanceFor(0.08, Math.max(0, camPos.y)));
    } else {
      fog.color.copy(_tmpC);
      const camH = Math.max(1, camPos.y);
      fog.near = (dist * 1.1 + 160) * (1 - overcast * 0.45);
      fog.far = (dist * 3.2 + 1700 + camH * 1.5) * (1 - overcast * 0.5);
    }

    renderer.toneMappingExposure = state.exposure * (1 + overcast * 0.12) * tune.exposure;
    scene.environmentIntensity = state.env * (1 - overcast * 0.2) * tune.env;

    if (sun.castShadow) {
      // world: no tilt-shift blur hides the distance → a wider shadowed region, not trimmed behind the focus
      // (overview distances: the long golden-hour shadows of trees, hedgerows and towers across the fields
      // around the town need the map out to ~1 km; texels stay ≈ 1 m there, ≈ 0.3 m at POI distances)
      const maxR = world ? THREE.MathUtils.clamp(dist * 1.6 + 120, 140, 950) : legacy ? THREE.MathUtils.clamp(dist * 1.55 + 30, 70, 420) : THREE.MathUtils.clamp(dist * 1.2 + 24, 60, 420);
      const minR = legacy ? THREE.MathUtils.clamp(dist * 0.55, 28, 200) : THREE.MathUtils.clamp(dist * 0.45, 22, 200);
      fitter.fit(ctx.camera, sun, _L, _focus, maxR, minR, legacy || world ? 1 : 0.62);
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
    // at night the table gives way to the indigo backdrop sooner (the lit town sits in a pool)
    const nightK = clock.night;
    stage.uniforms.uFade.value.set(60 - 28 * nightK, 560 - 200 * nightK);
    stage.uniforms.uTableSpec.value = 1 - 0.7 * nightK;
    if (stage.table && stage.table.visible !== (!legacy && !noTable)) applyStageVisibility();
    // clouds go dim + translucent only after the afterglow / blue hour (dusk keeps its pink glow)
    const cloudNight = smooth(-0.07, -0.3, sh);
    if (cottonClouds) clouds.frame(ctx.camera, state, _L, sun.color, lightI, sunVis, lights * (1 - sunVis * 0.8), overcast, cloudNight);
    const shStrength = (usingMoon ? 0.3 * moonW : sunW) * (1 - overcast * 0.85);
    _shTint.setRGB(0.6, 0.645, 0.75);
    clouds.writeShadows(cloudShadows, _L, shStrength, _shTint);
    if (cloudLayer) {
      const cu = cloudLayer;
      // fair-weather cumulus: few in the morning, building up by early afternoon, thinning at dusk;
      // every day a little different; rain fills the sky
      if (cloudDay.day !== clock.day) {
        cloudDay.day = clock.day;
        cloudDay.cu = cloudDayRng.range(0.65, 1.3);
        cloudDay.ci = cloudDayRng.range(0.4, 1.4);
      }
      const h = clock.hours;
      // fair-weather cumulus build up after the morning and dissolve in the evening (convection stops):
      // the golden hour is mostly clear, a few clouds left to catch the sunset
      let cov = (0.17 + 0.26 * smooth(8.5, 14, h) - 0.2 * smooth(15.5, 19.2, h)) * cloudDay.cu;
      if (Number.isFinite(cloudCovParam)) cov = cloudCovParam;
      cov += (0.97 - cov) * overcast;
      cu.uCu.value.x = Math.min(1, Math.max(0, cov));
      // humilis (~0.4–0.6 km) when sparse, mediocris (~1 km) when the deck fills in
      cu.uCuSlab.value.x = 380 + 700 * Math.min(1, cu.uCu.value.x * 1.6); // wider than tall
      cu.uCi.value.x = Math.min(0.85, 0.32 * cloudDay.ci) * (1 - overcast * 0.6);
      // light on the clouds: the sun after the atmosphere at deck height (pink after sunset), or the moon
      const comp = Math.pow(Math.max(1, atmo.comp), 0.6);
      if (usingMoon) {
        cu.uCloudL.value.copy(clock.moonDir);
        cu.uCloudSun.value.copy(state.sun).multiplyScalar(0.16 * moonW);
      } else {
        cu.uCloudL.value.copy(_sunSky);
        cu.uCloudSun.value.copy(atmo.cloudSunT).multiplyScalar(2.5 * comp * (1 - overcast * 0.7));
      }
      // ambient from the (blue) sky dome above the deck — not from the horizon haze (warm at golden hour)
      cu.uCloudAmbTop.value.copy(atmo.zenith).lerp(atmo.params.ring[0], 0.3).multiplyScalar(1.15);
      cu.uCloudAmbBot.value.copy(state.hemiGround).multiplyScalar(state.hemiI * 0.55).add(_tmpC.copy(state.sun).multiplyScalar(lightI * 0.04));
      if (overcast > 0) {
        const g = lum(cu.uCloudAmbTop.value);
        cu.uCloudAmbTop.value.lerp(_grey.setRGB(g, g * 1.02, g * 1.06), overcast * 0.7).multiplyScalar(1 - overcast * 0.35);
      }
      cu.uCloudCity.value.setRGB(1.0, 0.62, 0.34).multiplyScalar(0.1 * lights);
      // shadows on the ground from the same field (soft, faded by the haze in front of them)
      cloudShadows.light.copy(_L);
      // at a low sun the deck's shadows land far away, smeared over long slant paths: weaker
      const lowSun = smooth(0.1, 0.45, _L.y);
      cloudShadows.strength = shStrength * smooth(0.0, 0.1, cu.uCu.value.x) * (0.55 + 0.45 * lowSun);
      // under a real cloud only the (blue) sky light remains: darker and cooler than the toy puffs' shade
      cloudShadows.tint.setRGB(0.48, 0.53, 0.65);
      cloudShadows.haze = atmo.params.haze + atmo.params.rayleigh.y;
    }
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
      if (cottonClouds) clouds.step(dt, ctx.uniforms.uWind.value);
      if (cloudLayer && dt > 0) {
        // the deck drifts with the (veering) wind, ~12 m/s at full strength; cirrus faster (in the shader)
        const w = ctx.uniforms.uWind.value;
        const ws = Math.hypot(w.x, w.y);
        cloudLayer.uCu.value.w = (cloudLayer.uCu.value.w + (4 + 9 * ws) * dt) % 1e7;
        if (ws > 1e-3) cloudLayer.uCloudWind.value.lerp(_w2.set(w.x / ws, w.y / ws), Math.min(1, dt * 0.02)).normalize();
      }
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
        key: legacy ? 'legacy' : world ? 'world' : 'studio',
        hazeKm: world ? Math.round(3.912 / Math.max(1e-6, atmo.params.haze + atmo.params.rayleigh.y) / 100) / 10 : -1,
        mist: world ? Math.round(atmo.params.mist * 1e4) / 1e4 : 0,
        clouds: cloudLayer ? Math.round(cloudLayer.uCu.value.x * 100) / 100 : clouds.count,
        cloudVolRenders: cloudVol ? cloudVol.renders : 0,
        cloudsActive: cottonClouds ? clouds.stats().active : 0,
        cloudsOverCity: cottonClouds ? clouds.stats().overCity : 0,
        envBakes: env.bakes,
        skyLut: atmo.lutUpdates,
        skyScale: Math.round(atmo.skyScale * 10) / 10,
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
const _w2 = new THREE.Vector2();
const _hor = new THREE.Color();
const _belt = new THREE.Color();
