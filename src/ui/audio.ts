// Module "audio": a fully synthesised, location-aware soundscape (WebAudio, no files).
// OFF until the user switches it on (autoplay policy). Ambience follows the camera:
// traffic rumble near busy streets, birdsong in parks by day, gulls & waves at the water,
// wind at height / on the hills, crickets at night, a carousel tune on the pier. One-shots
// come from simulation events: level-crossing bells, train horns & brakes, bus door hisses,
// church bells on the hour, ship horns, fireworks.
//
// Registers ctx.services.audio = { setEnabled, enabled, setVolume, volume, available }.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { RAIL_Z } from '../core/constants';
import { EnvMap, type EnvSample } from './audio/env';
import {
  makeNoise,
  makeImpulse,
  noiseBed,
  biquad,
  bird,
  gull,
  Cricket,
  churchBell,
  crossingDing,
  trainHorn,
  shipHorn,
  carHorn,
  airHiss,
  brakeSqueal,
  firework,
  clank,
  musicBoxPhrase,
  type NoiseBank,
  type BirdSpecies,
} from './audio/synth';
import type { AudioServiceExt } from './shared';
import { audioSelfTest } from './audio/selftest';

interface Graph {
  ac: AudioContext;
  analyser: AnalyserNode;
  noise: NoiseBank;
  master: GainNode;
  amb: GainNode;
  fx: GainNode;
  wet: GainNode;
  traffic: GainNode;
  tires: GainNode;
  wind: GainNode;
  windFilter: BiquadFilterNode;
  windPan: StereoPannerNode;
  waves: GainNode;
  foam: GainNode;
  wavePan: StereoPannerNode;
  river: GainNode;
  rain: GainNode;
  crickets: Cricket[];
  cricketBus: GainNode;
  sources: AudioScheduledSourceNode[];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

export default function create(ctx: CityContext): CityModule {
  const { plan, events, clock, roads } = ctx;
  const envMap = new EnvMap(plan, ctx.occupancy);
  const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as AnyWindow).webkitAudioContext;

  let g: Graph | null = null;
  let on = false;
  let volume = 0.7;
  let pendingGesture = false;
  let voices = 0; // active scheduled one-shot voices (approx.)

  // landmarks that make sounds
  const lotCenter = (kind: string) => {
    const l = plan.lots.find((x) => x.kind === kind);
    return l ? { x: (l.footprint.x0 + l.footprint.x1) / 2, y: l.height * 0.85, z: (l.footprint.z0 + l.footprint.z1) / 2 } : null;
  };
  const church = lotCenter('church');
  const townhall = lotCenter('townhall');
  const stadium = lotCenter('stadium');
  const feat = (kind: string) => plan.features.find((f) => f.kind === kind);
  const carousel = feat('carousel');
  const crane = feat('towercrane');
  const ship = feat('cargoship');
  const ferry = feat('ferrydock');

  // ───────────────────────────────────────── listener & spatialisation
  const camPos = new THREE.Vector3();
  const camRight = new THREE.Vector3(1, 0, 0);
  const focus = new THREE.Vector3();
  let camDist = 500;
  const updateListener = () => {
    const c = ctx.camera;
    camPos.copy(c.position);
    camRight.setFromMatrixColumn(c.matrixWorld, 0);
    const st = ctx.services.camera?.getState();
    if (st) {
      focus.set(st.target.x, st.target.y, st.target.z);
      camDist = st.distance;
    } else {
      focus.set(0, 0, 0);
      camDist = c.position.length();
    }
  };

  /** output chain for a sound at a world position: gain → air absorption → pan (+ reverb send) */
  const spot = (x: number, y: number, z: number, opts: { ref?: number; wet?: number; gain?: number; life?: number } = {}): { input: AudioNode; dist: number } | null => {
    if (!g) return null;
    const ac = g.ac;
    const dx = x - camPos.x,
      dy = y - camPos.y,
      dz = z - camPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ref = opts.ref ?? 70;
    const gain = (opts.gain ?? 1) / (1 + Math.pow(d / ref, 1.5));
    if (gain < 0.004) return null;
    const input = ac.createGain();
    input.gain.value = gain;
    const lp = biquad(ac, 'lowpass', clamp(17000 / (1 + d / 140), 700, 17000), 0.5);
    const pan = ac.createStereoPanner();
    const len = Math.hypot(dx, dz) || 1;
    pan.pan.value = clamp(((dx * camRight.x + dz * camRight.z) / len) * 0.85, -0.9, 0.9);
    input.connect(lp);
    lp.connect(pan);
    pan.connect(g.fx);
    const wet = opts.wet ?? 0.25;
    let send: GainNode | null = null;
    if (wet > 0) {
      send = ac.createGain();
      send.gain.value = wet * (0.5 + 0.5 * Math.min(1, d / 200));
      pan.connect(send);
      send.connect(g.wet);
    }
    // the voice disconnects its own nodes; free the chain once it has surely finished
    const life = (opts.life ?? 8) + d / 340 + 3;
    setTimeout(() => {
      try {
        input.disconnect();
        lp.disconnect();
        pan.disconnect();
        send?.disconnect();
      } catch {
        /* ignore */
      }
    }, life * 1000);
    return { input, dist: d };
  };

  // ───────────────────────────────────────── graph
  const build = (): Graph | null => {
    if (!AC) return null;
    let ac: AudioContext;
    try {
      ac = new AC({ latencyHint: 'playback' });
    } catch {
      return null;
    }
    const noise = makeNoise(ac, 4);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.008;
    comp.release.value = 0.3;
    comp.connect(ac.destination);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    comp.connect(analyser);
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(comp);
    const amb = ac.createGain();
    amb.connect(master);
    const fx = ac.createGain();
    fx.connect(master);
    const verb = ac.createConvolver();
    verb.buffer = makeImpulse(ac, 2.4, 3.4);
    const verbOut = ac.createGain();
    verbOut.gain.value = 0.55;
    verb.connect(verbOut);
    verbOut.connect(master);
    const wet = ac.createGain();
    wet.connect(verb);
    const sources: AudioScheduledSourceNode[] = [];
    // traffic rumble + tyre hiss
    const tr = noiseBed(ac, noise.brown, [biquad(ac, 'lowpass', 240, 0.6), biquad(ac, 'peaking', 85, 1, 4)], amb);
    const ti = noiseBed(ac, noise.pink, [biquad(ac, 'bandpass', 1150, 0.55), biquad(ac, 'highshelf', 3000, 0.7, -8)], amb);
    // wind
    const windFilter = biquad(ac, 'bandpass', 520, 0.85);
    const windPan = ac.createStereoPanner();
    const wi = noiseBed(ac, noise.pink, [windFilter], windPan);
    windPan.connect(amb);
    // waves (swell) + foam
    const wavePan = ac.createStereoPanner();
    wavePan.connect(amb);
    const wa = noiseBed(ac, noise.brown, [biquad(ac, 'lowpass', 680, 0.5)], wavePan);
    const fo = noiseBed(ac, noise.white, [biquad(ac, 'highpass', 1500, 0.6), biquad(ac, 'lowpass', 6500, 0.5)], wavePan);
    // river murmur
    const rv = noiseBed(ac, noise.pink, [biquad(ac, 'bandpass', 2400, 0.45)], amb);
    // rain: soft broadband hiss with a bright patter band
    const ra = noiseBed(ac, noise.white, [biquad(ac, 'highpass', 650, 0.5), biquad(ac, 'lowpass', 7000, 0.4), biquad(ac, 'peaking', 2600, 0.8, 3)], amb);
    sources.push(tr.src, ti.src, wi.src, wa.src, fo.src, rv.src, ra.src);
    // crickets
    const cricketBus = ac.createGain();
    cricketBus.gain.value = 0;
    cricketBus.connect(amb);
    const crickets: Cricket[] = [];
    for (let i = 0; i < 4; i++) {
      const p = ac.createStereoPanner();
      p.pan.value = [-0.7, -0.2, 0.3, 0.75][i];
      p.connect(cricketBus);
      crickets.push(new Cricket(ac, p, 4300 + i * 260 + Math.random() * 120));
    }
    return {
      ac,
      analyser,
      noise,
      master,
      amb,
      fx,
      wet,
      traffic: tr.gain,
      tires: ti.gain,
      wind: wi.gain,
      windFilter,
      windPan,
      waves: wa.gain,
      foam: fo.gain,
      wavePan,
      river: rv.gain,
      rain: ra.gain,
      crickets,
      cricketBus,
      sources,
    };
  };

  const hasGesture = (): boolean => {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return ua ? ua.hasBeenActive : true;
  };

  const onFirstGesture = () => {
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
    if (pendingGesture && on) {
      pendingGesture = false;
      start();
    }
  };

  const start = () => {
    if (!g) g = build();
    if (!g) return;
    const ac = g.ac;
    if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
    const t = ac.currentTime;
    g.master.gain.cancelScheduledValues(t);
    g.master.gain.setValueAtTime(g.master.gain.value, t);
    g.master.gain.linearRampToValueAtTime(volume, t + 0.8);
    mixT = 1; // mix immediately
  };

  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  const setEnabled = (v: boolean) => {
    on = v;
    if (suspendTimer) {
      clearTimeout(suspendTimer);
      suspendTimer = null;
    }
    if (v) {
      if (!hasGesture()) {
        // wait for the first real gesture instead of tripping the autoplay policy
        pendingGesture = true;
        window.addEventListener('pointerdown', onFirstGesture, true);
        window.addEventListener('keydown', onFirstGesture, true);
        return;
      }
      start();
    } else if (g) {
      const t = g.ac.currentTime;
      g.master.gain.cancelScheduledValues(t);
      g.master.gain.setValueAtTime(g.master.gain.value, t);
      g.master.gain.linearRampToValueAtTime(0, t + 0.35);
      const ac = g.ac;
      suspendTimer = setTimeout(() => {
        if (!on && ac.state === 'running') void ac.suspend().catch(() => undefined);
      }, 600);
    }
  };

  const setVolume = (v: number) => {
    volume = clamp(v, 0, 1);
    if (g && on) {
      const t = g.ac.currentTime;
      g.master.gain.cancelScheduledValues(t);
      g.master.gain.setTargetAtTime(volume, t, 0.05);
    }
  };

  const onVisibility = () => {
    if (!g) return;
    if (document.hidden) void g.ac.suspend().catch(() => undefined);
    else if (on) void g.ac.resume().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', onVisibility);

  const service: AudioServiceExt = {
    setEnabled,
    enabled: () => on,
    setVolume,
    volume: () => volume,
    available: () => !!AC,
    selfTest: () => audioSelfTest(),
  };
  ctx.services.audio = service;

  const live = () => !!g && on && g.ac.state === 'running';

  // ───────────────────────────────────────── event one-shots
  const crossingState = new Map<number, { closed: boolean; next: number; until: number }>();
  const startCrossing = (id: number) => {
    const s = crossingState.get(id) ?? { closed: false, next: 0, until: 0 };
    if (!s.closed) {
      s.closed = true;
      s.next = 0;
      s.until = performance.now() + 45000;
    }
    crossingState.set(id, s);
  };
  const stopCrossing = (id: number) => {
    const s = crossingState.get(id);
    if (s) s.closed = false;
  };
  events.on('crossing', (p: { id?: number; closed?: boolean } | undefined) => {
    if (!p || typeof p.id !== 'number') return;
    if (p.closed) startCrossing(p.id);
    else stopCrossing(p.id);
  });
  const lastCrossing: boolean[] = roads.crossings.map((c) => c.closed);

  const stationPos = (i: unknown) => {
    const st = plan.rail.stations[typeof i === 'number' ? i : 0] ?? plan.rail.stations[0];
    return st ? { x: (st.x0 + st.x1) / 2, z: RAIL_Z } : { x: 0, z: RAIL_Z };
  };
  events.on('train:depart', (p: { station?: number } | undefined) => {
    if (!live()) return;
    const s = stationPos(p?.station);
    const o = spot(s.x, 4, s.z, { ref: 150, wet: 0.45, gain: 1.1, life: 3 });
    if (o) trainHorn(g!.ac, o.input, g!.ac.currentTime + 0.05 + o.dist / 340);
  });
  events.on('train:arrive', (p: { station?: number } | undefined) => {
    if (!live()) return;
    const s = stationPos(p?.station);
    const o = spot(s.x, 2, s.z, { ref: 80, wet: 0.3 });
    if (o) brakeSqueal(g!.ac, o.input, g!.ac.currentTime + 0.05);
  });
  events.on('bus:stop', (p: { stopId?: number; phase?: string } | undefined) => {
    if (!live() || !p || typeof p.stopId !== 'number') return;
    const st = plan.busStops[p.stopId];
    if (!st) return;
    const o = spot(st.x, 1.5, st.z, { ref: 45, wet: 0.15 });
    if (o) airHiss(g!.ac, o.input, g!.noise, g!.ac.currentTime + 0.02 + Math.random() * 0.1, 1, p.phase !== 'depart');
  });
  events.on('hour', (hour: number) => {
    if (!live() || typeof hour !== 'number') return;
    if (hour < 7 || hour > 22) return; // quiet hours
    const bellPos = church ?? townhall;
    if (!bellPos) return;
    const ac = g!.ac;
    const hourSecs = 40 / Math.max(0.25, clock.speed);
    const spacing = 2.4;
    let n = hour % 12 || 12;
    n = Math.min(n, Math.max(1, Math.floor((hourSecs * 0.55) / spacing)));
    let t = ac.currentTime + 0.1;
    // carillon phrase from the town hall at noon and six
    if ((hour === 12 || hour === 18) && townhall && clock.speed <= 2) {
      const o = spot(townhall.x, townhall.y, townhall.z, { ref: 160, wet: 0.5, gain: 0.8, life: 12 });
      if (o) {
        const notes = [329.6, 261.6, 293.7, 196.0, 196.0, 293.7, 329.6, 261.6];
        notes.forEach((f, i) => churchBell(ac, o.input, t + i * 0.62 + o.dist / 340, f * 2, 0.45));
        t += notes.length * 0.62 + 1.2;
      }
    }
    const o = spot(bellPos.x, bellPos.y, bellPos.z, { ref: 180, wet: 0.55, gain: 1.2, life: t - ac.currentTime + n * spacing + 8 });
    if (!o) return;
    for (let i = 0; i < n; i++) churchBell(ac, o.input, t + i * spacing + o.dist / 340, 174.6, 1);
  });
  events.on('fireworks', (p: { x?: number; y?: number; z?: number; count?: number } | number | undefined) => {
    if (!live()) return;
    const ac = g!.ac;
    const base = typeof p === 'object' && p ? p : {};
    const count = typeof p === 'number' ? p : (base.count ?? 1);
    for (let i = 0; i < Math.min(12, count); i++) {
      const x = (base.x ?? 160) + (Math.random() - 0.5) * 30,
        z = (base.z ?? 75) + (Math.random() - 0.5) * 30,
        y = base.y ?? 60;
      const o = spot(x, y, z, { ref: 220, wet: 0.6, gain: 1.2 });
      if (o) firework(ac, o.input, g!.noise, ac.currentTime + i * (0.35 + Math.random() * 0.8), o.dist / 340);
    }
  });

  // ───────────────────────────────────────── per-frame mixing & ambient scheduling
  const es: EnvSample = { green: 0, sea: 0, river: 0, coast: 0, road: 0, urban: 0, hills: 0 };
  let mixT = 0;
  const lv = { traffic: 0, birds: 0, gulls: 0, waves: 0, wind: 0, crickets: 0, urban: 0, closeness: 0, coastDir: 0, rain: 0 };
  let windPhase = Math.random() * 100;
  let wavePhase = Math.random() * 100;
  let carouselNext = 0;
  let shipNext = performance.now() + 30000 + Math.random() * 40000;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  const mix = () => {
    if (!g) return;
    const ac = g.ac;
    const t = ac.currentTime;
    const r = clamp(camDist * 0.42, 25, 210);
    envMap.sample(focus.x, focus.z, r, es);
    const closeness = 1 - smoothstep(70, 650, camDist);
    const day = clock.daylight,
      night = clock.night;
    const tsvc = ctx.services.traffic as { count?: () => number; near?: (x: number, z: number, r: number) => number } | undefined;
    let traffic: number;
    try {
      if (tsvc && typeof tsvc.near === 'function') {
        // moving vehicles around the focus
        const n = tsvc.near(focus.x, focus.z, r);
        traffic = clamp(n / (4 + r * 0.12), 0, 1.2) * (0.35 + 0.65 * closeness) * (0.6 + 0.4 * day);
      } else {
        const vehicles = typeof tsvc?.count === 'function' ? tsvc.count() : 70;
        const vf = clamp(vehicles / 110, 0.12, 1.3);
        traffic = (0.1 + 0.9 * Math.pow(es.road * 2.2, 0.7)) * vf * (0.3 + 0.7 * closeness) * (0.5 + 0.5 * day);
      }
    } catch {
      traffic = 0.2;
    }
    const wind = clamp(0.1 + 0.55 * smoothstep(160, 720, camDist) + 0.55 * es.hills + 0.15 * es.sea, 0, 1);
    const waves = clamp((es.coast * 1.1 + es.sea * 0.45) * (0.35 + 0.65 * closeness), 0, 1);
    lv.traffic = traffic;
    lv.wind = wind;
    lv.waves = waves;
    lv.closeness = closeness;
    lv.urban = es.urban;
    const dawn = Math.exp(-(((clock.hours - 6.6) / 1.1) ** 2));
    lv.birds = es.green * day * (0.45 + 0.55 * closeness) * (1 + 1.6 * dawn);
    lv.gulls = clamp(es.coast * 1.2 + es.sea * 0.3, 0, 1) * (0.25 + 0.75 * day) * (0.4 + 0.6 * closeness);
    lv.crickets = night * (0.2 + 0.8 * es.green) * (0.35 + 0.65 * closeness);
    // rain hushes the birds and sends the gulls & crickets for cover
    const rain = clamp(ctx.uniforms.uRain.value, 0, 1);
    lv.rain = rain;
    lv.birds *= 1 - 0.85 * rain;
    lv.gulls *= 1 - 0.6 * rain;
    lv.crickets *= 1 - 0.9 * rain;
    g.rain.gain.setTargetAtTime(0.16 * rain * (0.55 + 0.45 * closeness), t, 0.6);
    const T = 0.25;
    g.traffic.gain.setTargetAtTime(0.38 * traffic, t, T);
    g.tires.gain.setTargetAtTime(0.1 * traffic * (0.4 + 0.6 * closeness), t, T);
    g.river.gain.setTargetAtTime(0.06 * es.river * (0.3 + 0.7 * closeness), t, T);
    g.cricketBus.gain.setTargetAtTime(lv.crickets, t, 0.6);
    // the sea pans towards where the water is relative to the view
    const sx = 150 - focus.x;
    const sideways = (sx * camRight.x) / (Math.abs(sx) + 40);
    g.wavePan.pan.setTargetAtTime(clamp(sideways * 0.8, -0.8, 0.8), t, 0.5);
  };

  const scheduleAmbient = (dt: number) => {
    if (!g) return;
    const ac = g.ac;
    const t = ac.currentTime;
    // wind gusts: slow random walk on gain / filter / pan
    windPhase += dt;
    const gust = 0.55 + 0.25 * Math.sin(windPhase * 0.31) + 0.2 * Math.sin(windPhase * 0.83 + 1.3) * Math.sin(windPhase * 0.17);
    g.wind.gain.setTargetAtTime(0.16 * lv.wind * gust, t, 0.3);
    g.windFilter.frequency.setTargetAtTime(360 + 520 * gust, t, 0.4);
    g.windPan.pan.setTargetAtTime(0.5 * Math.sin(windPhase * 0.13), t, 0.5);
    // swell: two slow periods beating against each other; foam on the crests
    wavePhase += dt;
    const sw1 = 0.5 + 0.5 * Math.sin(wavePhase * ((2 * Math.PI) / 7.3));
    const sw2 = 0.5 + 0.5 * Math.sin(wavePhase * ((2 * Math.PI) / 11.1) + 1.7);
    const swell = 0.35 + 0.65 * sw1 * (0.6 + 0.4 * sw2);
    g.waves.gain.setTargetAtTime(0.46 * lv.waves * swell, t, 0.35);
    g.foam.gain.setTargetAtTime(0.09 * lv.waves * Math.pow(sw1, 6) * (0.5 + 0.5 * sw2), t, 0.25);
    // crickets
    for (const c of g.crickets) c.schedule(t, 0.35, 1);
    if (voices > 10) return;
    // birds
    if (lv.birds > 0.02 && Math.random() < dt * 0.55 * lv.birds) {
      const species: BirdSpecies[] = es.urban > 0.25 ? ['coo', 'tit', 'robin', 'trill'] : ['tit', 'trill', 'warble', 'robin', 'robin'];
      const sp = species[Math.floor(Math.random() * species.length)];
      const rr = clamp(camDist * 0.35, 12, 120);
      const o = spot(focus.x + rnd(-rr, rr), focus.y + rnd(4, 10), focus.z + rnd(-rr, rr), { ref: 40, wet: 0.2, gain: 0.9 });
      if (o) {
        const d = bird(ac, o.input, t + Math.random() * 0.2, sp, 1);
        voiceFor(d);
      }
    }
    // gulls
    if (lv.gulls > 0.05 && Math.random() < dt * 0.16 * lv.gulls) {
      const rr = clamp(camDist * 0.4, 20, 140);
      const o = spot(Math.max(focus.x, 120) + rnd(-rr, rr), rnd(8, 25), focus.z + rnd(-rr, rr), { ref: 60, wet: 0.35, gain: 1 });
      if (o) voiceFor(gull(ac, o.input, t + Math.random() * 0.2, 1));
    }
    // occasional polite car horn downtown
    if (lv.traffic > 0.25 && Math.random() < dt * 0.02 * lv.traffic * (0.4 + es.urban * 2)) {
      const rr = clamp(camDist * 0.4, 20, 150);
      const o = spot(focus.x + rnd(-rr, rr), 1.2, focus.z + rnd(-rr, rr), { ref: 50, wet: 0.2, gain: 0.8 });
      if (o) {
        carHorn(ac, o.input, t + 0.05);
        voiceFor(0.6);
      }
    }
    // construction site clanks during working hours
    if (crane && clock.hours > 7.5 && clock.hours < 17 && clock.speed > 0) {
      if (Math.random() < dt * 0.5) {
        const o = spot(crane.x + rnd(-10, 10), rnd(1, 12), crane.z + rnd(-10, 10), { ref: 35, wet: 0.25, gain: 0.8 });
        if (o) {
          clank(ac, o.input, t + 0.02);
          voiceFor(0.4);
        }
      }
    }
    // carousel music box on the pier (afternoon & evening)
    if (carousel && clock.hours > 9 && clock.hours < 23 && t > carouselNext) {
      const o = spot(carousel.x, 3, carousel.z, { ref: 45, wet: 0.3, gain: 0.9, life: 9 });
      if (o) carouselNext = t + musicBoxPhrase(ac, o.input, t + 0.05, 1, 523.25 * (Math.random() < 0.5 ? 1 : 0.8909)) + 0.4;
      else carouselNext = t + 2;
    }
    // ship horn in the harbour now and then
    const now = performance.now();
    if (now > shipNext) {
      shipNext = now + 70000 + Math.random() * 90000;
      const src = Math.random() < 0.5 ? ship : ferry;
      if (src) {
        const o = spot(src.x, 8, src.z, { ref: 200, wet: 0.6, gain: 1, life: 5 });
        if (o) shipHorn(ac, o.input, t + o.dist / 340);
      }
    }
    // a roar from the stadium on match evenings
    if (stadium && clock.hours > 18.5 && clock.hours < 21.5 && Math.random() < dt * 0.03) {
      const o = spot(stadium.x, 8, stadium.z, { ref: 120, wet: 0.5, gain: 1 });
      if (o) crowdRoar(ac, o.input, g.noise, t + 0.1);
    }
  };

  let audioMs = 0;
  const voiceFor = (secs: number) => {
    voices++;
    setTimeout(() => (voices = Math.max(0, voices - 1)), Math.max(200, secs * 1000));
  };

  const crossingBells = () => {
    // poll the crossings too (the rail sim may not emit events)
    for (let i = 0; i < roads.crossings.length; i++) {
      const c = roads.crossings[i];
      if (c.closed !== lastCrossing[i]) {
        lastCrossing[i] = c.closed;
        if (c.closed) startCrossing(c.id);
        else stopCrossing(c.id);
      }
    }
    if (!g) return;
    const now = performance.now();
    const t = g.ac.currentTime;
    for (const [id, s] of crossingState) {
      if (!s.closed) continue;
      if (now > s.until) {
        s.closed = false;
        continue;
      }
      if (t < s.next) continue;
      s.next = t + 0.46;
      const c = roads.crossings.find((x) => x.id === id);
      if (!c) continue;
      const o = spot(c.x, 3, c.z, { ref: 55, wet: 0.2, gain: 0.9 });
      if (o) crossingDing(g.ac, o.input, t + 0.02);
    }
  };

  return {
    name: 'audio',
    frame(realDt) {
      if (!live()) return;
      const t0 = performance.now();
      updateListener();
      mixT -= realDt;
      if (mixT <= 0) {
        mixT = 0.1;
        mix();
      }
      scheduleAmbient(Math.min(realDt, 0.1));
      crossingBells();
      audioMs = audioMs * 0.95 + (performance.now() - t0) * 0.05;
    },
    stats() {
      return {
        enabled: on ? 'on' : 'off',
        state: g ? g.ac.state : 'none',
        traffic: Math.round(lv.traffic * 100) / 100,
        birds: Math.round(lv.birds * 100) / 100,
        waves: Math.round(lv.waves * 100) / 100,
        crickets: Math.round(lv.crickets * 100) / 100,
        rain: Math.round(lv.rain * 100) / 100,
        voices,
        frameMs: Math.round(audioMs * 1000) / 1000,
        outRms: g ? measureRms(g.analyser) : 0,
      };
    },
    invariants() {
      const out: string[] = [];
      if (g && !on && g.master.gain.value > 0.05 && g.ac.state === 'running') {
        // allow the fade-out to finish
        if (g.ac.currentTime > 1 && suspendTimer === null) out.push('audio disabled but master gain is still up');
      }
      for (const k of Object.keys(lv) as (keyof typeof lv)[]) if (!isFinite(lv[k])) out.push(`audio level ${k} is not finite`);
      return out;
    },
    dispose() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onFirstGesture, true);
      window.removeEventListener('keydown', onFirstGesture, true);
      if (g) {
        for (const c of g.crickets) c.dispose();
        for (const s of g.sources) {
          try {
            s.stop();
          } catch {
            /* ignore */
          }
        }
        void g.ac.close().catch(() => undefined);
        g = null;
      }
    },
  };
}

let _rmsBuf: Float32Array<ArrayBuffer> | null = null;
function measureRms(a: AnalyserNode): number {
  if (!_rmsBuf || _rmsBuf.length !== a.fftSize) _rmsBuf = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(_rmsBuf);
  let sum = 0;
  for (let i = 0; i < _rmsBuf.length; i++) sum += _rmsBuf[i] * _rmsBuf[i];
  return Math.round(Math.sqrt(sum / _rmsBuf.length) * 10000) / 10000;
}

/** a swelling stadium crowd cheer */
function crowdRoar(ac: AudioContext, out: AudioNode, noise: NoiseBank, t: number): void {
  const src = ac.createBufferSource();
  src.buffer = noise.pink;
  const bp = biquad(ac, 'bandpass', 900, 0.5);
  const bp2 = biquad(ac, 'peaking', 2200, 1.2, 4);
  const gn = ac.createGain();
  gn.gain.setValueAtTime(0, t);
  gn.gain.linearRampToValueAtTime(0.2, t + 0.9);
  gn.gain.setValueAtTime(0.22, t + 2.2);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
  src.connect(bp);
  bp.connect(bp2);
  bp2.connect(gn);
  gn.connect(out);
  src.start(t, Math.random() * 2);
  src.stop(t + 4.6);
  src.onended = () => {
    try {
      src.disconnect();
      bp.disconnect();
      bp2.disconnect();
      gn.disconnect();
    } catch {
      /* ignore */
    }
  };
}
