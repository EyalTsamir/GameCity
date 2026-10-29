import * as THREE from 'three';
import './style.css';
import { generatePlan } from './core/plan';
import { buildRoadNetwork } from './core/roadNetwork';
import { OccupancyGrid } from './core/occupancy';
import { buildPedNetwork } from './core/pedNetwork';
import { IntersectionManager } from './core/intersections';
import { WorldClock } from './core/time';
import { EventBus } from './core/events';
import { globalUniforms } from './core/uniforms';
import { updateWind } from './core/wind';
import { Rng } from './core/rng';
import type { CityContext, CityModule, ModuleFactory, QualityState, CameraState, DebugFlags } from './core/context';
import { validateWorld } from './debug/validate';

// Load order matters: static world → simulations → post-processing → camera → UI.
const MODULES: [string, () => Promise<{ default: ModuleFactory }>][] = [
  ['sky', () => import('./render/sky')],
  ['terrain', () => import('./world/terrain')],
  ['landscape', () => import('./world/landscape')],
  ['water', () => import('./world/water')],
  ['ambient', () => import('./sim/ambient')],
  ['roads', () => import('./world/roads')],
  ['buildings', () => import('./world/buildings')],
  ['landmarks', () => import('./world/landmarks')],
  ['harbor', () => import('./world/harbor')],
  ['vegetation', () => import('./world/vegetation')],
  ['props', () => import('./world/props')],
  ['groundcover', () => import('./world/groundcover')],
  ['life', () => import('./world/life')],
  ['lamps', () => import('./world/lamps')],
  ['traffic', () => import('./sim/traffic')],
  ['pedestrians', () => import('./sim/pedestrians')],
  ['rail', () => import('./sim/rail')],
  ['boats', () => import('./sim/boats')],
  ['postfx', () => import('./render/postfx')],
  ['camera', () => import('./ui/camera')],
  ['ui', () => import('./ui/ui')],
  ['audio', () => import('./ui/audio')],
];

interface LoadFailure {
  name: string;
  error: string;
}

const params = new URLSearchParams(location.search);
const debug: DebugFlags = {
  enabled: params.has('debug'),
  only: (params.get('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  skip: (params.get('skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  params,
};

function initialQuality(): QualityState {
  const q = (params.get('quality') ?? 'high') as QualityState['level'];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const base: Record<QualityState['level'], QualityState> = {
    low: { level: 'low', pixelRatio: Math.min(dpr, 1), renderScale: 1, shadows: true, shadowMapSize: 1024, ao: false, dof: false, bloom: true, density: 0.5 },
    medium: { level: 'medium', pixelRatio: Math.min(dpr, 1.25), renderScale: 1, shadows: true, shadowMapSize: 2048, ao: false, dof: true, bloom: true, density: 0.8 },
    high: { level: 'high', pixelRatio: Math.min(dpr, 1.5), renderScale: 1, shadows: true, shadowMapSize: 2048, ao: true, dof: true, bloom: true, density: 1 },
  };
  return base[q] ?? base.high;
}

function setLoading(text: string, frac: number): void {
  const el = document.getElementById('loading-status');
  const bar = document.getElementById('loading-bar-fill');
  if (el) el.textContent = text;
  if (bar) (bar as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('city') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const quality = initialQuality();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    preserveDrawingBuffer: params.has('preserve'),
  });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186: soft PCF via light.shadow.radius

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfdde6');
  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 1, 6000);

  setLoading('Surveying the land…', 0.02);
  await nextFrame();
  const seed = params.get('seed') ?? 'tinyhaven';
  const plan = generatePlan(seed);
  const roads = buildRoadNetwork(plan);
  const occupancy = new OccupancyGrid(plan, roads);
  const peds = buildPedNetwork(plan, roads, occupancy);
  const intersections = new IntersectionManager(roads);
  const events = new EventBus();
  const startHours = params.has('time') ? parseFloat(params.get('time')!) : 16.25;
  const clock = new WorldClock(startHours);
  clock.attach(events);
  if (params.has('speed')) clock.speed = parseFloat(params.get('speed')!);
  const rootRng = new Rng(seed);

  const ctx: CityContext = {
    renderer,
    scene,
    camera,
    canvas,
    uiRoot,
    plan,
    roads,
    peds,
    occupancy,
    intersections,
    clock,
    uniforms: globalUniforms,
    events,
    quality,
    services: {},
    pickers: [],
    render: () => renderer.render(scene, camera),
    debug,
    rng: (label: string) => rootRng.fork(label),
    size: { width: window.innerWidth, height: window.innerHeight },
  };

  // Fallback lighting so any module can be inspected alone (?only=...). The sky
  // module removes these when it installs the real light rig.
  const fallback = new THREE.Group();
  fallback.name = 'fallback-lights';
  const hemi = new THREE.HemisphereLight('#ffffff', '#8a7a66', 1.6);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(180, 300, 220);
  fallback.add(hemi, sun);
  scene.add(fallback);

  applyView(ctx, plan.pois[0]);

  if (debug.enabled || params.has('validate')) {
    const problems = validateWorld(ctx);
    for (const p of problems) console.warn('[validate]', p);
    console.info(`[validate] ${problems.length} issue(s)`);
  }

  // ── load modules (fault isolated)
  const modules: CityModule[] = [];
  const failed: LoadFailure[] = [];
  const wanted: typeof MODULES = params.has('planview')
    ? [['planview', () => import('./debug/planView')]]
    : MODULES.filter(([name]) => (debug.only.length === 0 || debug.only.includes(name)) && !debug.skip.includes(name));
  let k = 0;
  for (const [name, loader] of wanted) {
    setLoading(`Building ${name}…`, 0.05 + (0.9 * k++) / wanted.length);
    await nextFrame();
    try {
      const mod = await loader();
      const t0 = performance.now();
      const inst = await mod.default(ctx);
      if (inst) modules.push(inst);
      const ms = performance.now() - t0;
      if (debug.enabled) console.info(`[boot] ${name} ready in ${ms.toFixed(0)} ms`);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      failed.push({ name, error: msg });
      console.error(`[boot] module "${name}" failed to load`, err);
    }
  }
  if (ctx.services.sky) scene.remove(fallback);
  ctx.events.emit('modules:ready', modules.map((m) => m.name));
  // street lights follow the clock with a short ease, but a clock jump (time slider, setHours) snaps them
  let snapLights = true;
  ctx.events.on('timejump', () => (snapLights = true));

  // ── main loop
  const timer = new THREE.Timer();
  timer.connect(document);
  let fpsAcc = 0,
    fpsFrames = 0,
    fps = 60,
    frameMs = 16.7;
  const moduleTimes = new Map<string, number>();
  let frameCount = 0;
  // ?fps=30: draw every other display refresh (an even 33 ms cadence instead of 33/50 ms alternation when a frame
  // does not fit in one refresh); off by default
  const fpsCap = Number(params.get('fps')) || 0;
  const minInterval = fpsCap > 0 ? 1000 / fpsCap - 4 : 0;
  let lastDraw = -1e9;
  const loop = (timestamp: number) => {
    if (minInterval > 0) {
      if (timestamp - lastDraw < minInterval) return;
      lastDraw = timestamp;
    }
    timer.update(timestamp);
    // never negative (out-of-order timestamps would ease uniforms away from their targets)
    const realDt = Math.max(0, Math.min(timer.getDelta(), 0.1));
    const t0 = performance.now();
    const simDt = clock.update(realDt);
    globalUniforms.uTime.value = clock.simTime;
    globalUniforms.uRealTime.value = clock.realTime;
    globalUniforms.uNight.value = clock.night;
    globalUniforms.uDaylight.value = clock.daylight;
    globalUniforms.uDusk.value = clock.dusk;
    const lightsTarget = clock.lightsOn ? 1 : 0;
    if (snapLights) globalUniforms.uLights.value = lightsTarget;
    else globalUniforms.uLights.value += (lightsTarget - globalUniforms.uLights.value) * Math.min(1, realDt * 0.8);
    snapLights = false;
    globalUniforms.uSunDir.value.copy(clock.sunDir);
    updateWind(clock, globalUniforms.uWind.value);
    // signals advance in small steps so phase changes are never skipped
    let rem = simDt;
    while (rem > 1e-6) {
      const st = Math.min(rem, 0.05);
      intersections.update(st);
      rem -= st;
    }
    for (const m of modules) {
      if (!m.update) continue;
      const a = performance.now();
      try {
        m.update(simDt, ctx);
      } catch (err) {
        reportFrameError(m.name, err);
      }
      if (debug.enabled) moduleTimes.set(m.name, (moduleTimes.get(m.name) ?? 0) * 0.95 + (performance.now() - a) * 0.05);
    }
    for (const m of modules) {
      if (!m.frame) continue;
      try {
        m.frame(realDt, ctx);
      } catch (err) {
        reportFrameError(m.name, err);
      }
    }
    try {
      ctx.render(realDt);
    } catch (err) {
      reportFrameError('render', err);
    }
    frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
    fpsAcc += realDt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }
    frameCount++;
    if (frameCount === 2) hideLoading();
  };
  if (params.get('drawsort') !== '0') lateDraws(scene);
  // shader warm-up behind the loading screen (?nowarmup to skip): every program the city will ever use is
  // compiled now — objects that only show up later (night market, glows, LOD levels, near sets, far views) would
  // otherwise compile on their first draw and stall that frame by 50–300 ms
  if (!params.has('nowarmup')) {
    setLoading('Warming up…', 0.98);
    await nextFrame();
    const t0 = performance.now();
    await warmUp(ctx);
    if (debug.enabled) console.info(`[boot] warm-up ${(performance.now() - t0).toFixed(0)} ms, ${renderer.info.programs?.length ?? 0} programs`);
  }
  renderer.setAnimationLoop(loop);

  const onResize = () => {
    const w = window.innerWidth,
      h = window.innerHeight;
    ctx.size.width = w;
    ctx.size.height = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    for (const m of modules) m.resize?.(w, h, ctx);
  };
  window.addEventListener('resize', onResize);

  // ── debug / automation API
  const api = {
    ctx,
    ready: true,
    modules: modules.map((m) => m.name),
    failed,
    frames: () => frameCount,
    setHours: (h: number) => clock.setHours(h),
    setSpeed: (s: number) => (clock.speed = s),
    view: (v: Partial<CameraState> | string) => {
      const poi = typeof v === 'string' ? plan.pois.find((p) => p.id === v) : undefined;
      const state = poi ?? (v as Partial<CameraState>);
      if (ctx.services.camera) ctx.services.camera.flyTo(state, 0);
      else applyView(ctx, state);
    },
    stats: () => {
      const info = renderer.info;
      const out: Record<string, unknown> = {
        fps: Math.round(fps * 10) / 10,
        frameMs: Math.round(frameMs * 100) / 100,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        time: clock.label(),
        pixelRatio: renderer.getPixelRatio(),
      };
      for (const m of modules) {
        try {
          const s = m.stats?.();
          if (s) out[m.name] = s;
        } catch {
          /* ignore */
        }
      }
      if (debug.enabled) out.moduleMs = Object.fromEntries([...moduleTimes].map(([k2, v]) => [k2, Math.round(v * 100) / 100]));
      out.intersections = intersections.stats;
      return out;
    },
    invariants: () => {
      const out: Record<string, string[]> = {};
      for (const m of modules) {
        try {
          const r = m.invariants?.();
          if (r && r.length) out[m.name] = r.slice(0, 50);
        } catch (err) {
          out[m.name] = [`invariants() threw: ${String(err)}`];
        }
      }
      return out;
    },
    validate: () => validateWorld(ctx),
    frameErrors,
  };
  (window as unknown as { __city: typeof api }).__city = api;
  window.dispatchEvent(new CustomEvent('city-ready'));
}

const frameErrors: { module: string; error: string; count: number }[] = [];
function reportFrameError(module: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const existing = frameErrors.find((e) => e.module === module && e.error === msg);
  if (existing) {
    existing.count++;
    return;
  }
  frameErrors.push({ module, error: msg, count: 1 });
  console.error(`[frame] ${module}:`, err);
}

/**
 * Opaque draw order for the big, expensive full-screen shaders: three sorts opaque draws by renderOrder, then by
 * the object's ORIGIN depth — every city-wide merged mesh sits at the origin, so they tied and went in creation
 * order, and the facades / ground were shaded first and then hidden behind the stalls, trees, people and vehicles
 * drawn after them. Drawn after everything small (renderOrder 0 / −1), their hidden pixels fail the early depth
 * test. Relative order kept: facades, then roads (before the terrain they cover), far trees, then the ground. Order-
 * independent result: opaque, depth-tested (decals use polygonOffset); the sky dome (1000) stays last.
 * ?drawsort=0 restores the old order (A/B).
 */
const LATE_DRAWS: Record<string, number> = {
  'buildings-shell': 1,
  'roads-asphalt': 2,
  'roads-hardscape': 2,
  // the countryside impostor trees: behind the town's facades (street views) but in front of the land they stand on
  'land-trees-far': 2.5,
  'terrain-ground': 3,
  'land-ground': 3,
  'land-island': 3,
};
function lateDraws(scene: THREE.Scene): void {
  scene.traverse((o) => {
    const r = LATE_DRAWS[o.name];
    if (r !== undefined) o.renderOrder = r;
  });
}

/**
 * Compile every program the city can use before the first frame, with every object drawn (hidden ones shown, culling
 * off): the main-view programs in parallel (compileAsync on an off-screen target, i.e. the post chain's variants —
 * with the screen bound it would build tone-mapped ones), then one frame through the real pipeline for the
 * shadow-pass, reflection and post programs. The frame is never shown.
 */
async function warmUp(ctx: CityContext): Promise<void> {
  const forced: [THREE.Object3D, boolean, boolean][] = [];
  ctx.scene.traverse((o) => {
    if (!o.visible || o.frustumCulled) {
      forced.push([o, o.visible, o.frustumCulled]);
      // pinned for the frame: modules also set visibility inside the render call (scene.onBeforeRender)
      Object.defineProperty(o, 'visible', { configurable: true, get: () => true, set: () => {} });
      Object.defineProperty(o, 'frustumCulled', { configurable: true, get: () => false, set: () => {} });
    }
  });
  try {
    // 1) every main-view program at once, compiled in parallel (KHR_parallel_shader_compile: ANGLE / D3D11 took ~0.35 s
    //    per program serially — 50 s for the city on a fresh shader cache). Bound to an off-screen target so the
    //    variants match the post chain's (linear, no tone mapping).
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const prev = ctx.renderer.getRenderTarget();
    ctx.renderer.setRenderTarget(rt);
    try {
      await ctx.renderer.compileAsync(ctx.scene, ctx.camera);
    } finally {
      ctx.renderer.setRenderTarget(prev);
      rt.dispose();
    }
    // 2) one frame through the real pipeline: shadow-pass depth programs, reflection and post passes
    ctx.services.postfx?.warmUp?.();
    ctx.render(0);
  } catch (err) {
    reportFrameError('warm-up', err);
  } finally {
    for (const [o, v, f] of forced) {
      delete (o as { visible?: boolean }).visible;
      delete (o as { frustumCulled?: boolean }).frustumCulled;
      o.visible = v;
      o.frustumCulled = f;
    }
  }
}

/** Place the camera directly (used before the camera module takes over). */
function applyView(ctx: CityContext, v: Partial<CameraState>): void {
  const t = v.target ?? { x: 0, y: 0, z: 0 };
  const d = v.distance ?? 500;
  const yaw = THREE.MathUtils.degToRad(v.yaw ?? 30);
  const pitch = THREE.MathUtils.degToRad(v.pitch ?? 40);
  const cam = ctx.camera;
  cam.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * d, t.y + Math.sin(pitch) * d, t.z + Math.cos(yaw) * Math.cos(pitch) * d);
  cam.lookAt(t.x, t.y, t.z);
  cam.updateMatrixWorld();
}

function hideLoading(): void {
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.add('done');
  setTimeout(() => el.remove(), 1200);
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

boot().catch((err) => {
  console.error('[boot] fatal', err);
  setLoading('Something went wrong while building the city. See console for details.', 1);
});
