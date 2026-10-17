// Sky life + the fireworks barge, one InstancedMesh (see vehicleModels.ts):
//   • hot-air balloon: inflates lying on the stadium pitch at dawn, stands up, lifts off at 06:24
//     and drifts on a slow loop over the town at ~95–135 m with occasional burner flares (the
//     envelope glows from inside at dusk), lands back in the stadium at ~19:45 and is packed away;
//   • small commuter plane crossing high (~250 m) every ~2.2 game hours, nav lights + strobes;
//   • advertising blimp ("TINYHAVEN") cruising a wide loop at ~140 m from late morning until
//     23:30, sign lit at night;
//   • the fireworks barge moored in the harbour basin (bobbing; deck lamps at night).
// Positions are functions of the game clock → deterministic screenshots. Pickers let the camera
// follow the balloon / blimp / plane.

import * as THREE from 'three';
import type { CityContext, PickHit } from '../../core/context';
import { hash01 } from '../../core/rng';
import { buildVehicleGeometry, makeBlimpTexture, MODEL } from './vehicleModels';
import type { SparkSystem } from './sparks';
import { absHours, clamp, smooth, type SkylineGrid } from './shared';
import { SECONDS_PER_GAME_HOUR } from '../../core/constants';

const VEH_GLSL_V = /* glsl */ `
attribute float aModel;
attribute float aGlow;
attribute float iModel;
attribute vec4 iGlow;
varying float vGlowMask;
varying vec4 vGlowAmt;
`;

function makeMaterials(tex: THREE.Texture): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.72, metalness: 0.0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VEH_GLSL_V}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(aModel - iModel) > 0.5) transformed = vec3(0.0);\nvGlowMask = aGlow;\nvGlowAmt = iGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlowMask;\nvarying vec4 vGlowAmt;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float gm = vGlowMask;
          vec3 em = vec3(0.0);
          if (gm > 0.3 && gm < 1.5) em += diffuseColor.rgb * vec3(1.0, 0.58, 0.26) * vGlowAmt.x * gm;
          if (gm > 1.5 && gm < 2.5) em += vec3(1.0, 0.78, 0.48) * vGlowAmt.y;
          if (gm > 2.5) em += diffuseColor.rgb * vec3(1.0, 0.95, 0.85) * vGlowAmt.z;
          totalEmissiveRadiance += em;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'tinyhaven-ambient-vehicles-1';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aModel;\nattribute float iModel;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(aModel - iModel) > 0.5) transformed = vec3(0.0);');
  };
  depth.customProgramCacheKey = () => 'tinyhaven-ambient-vehicles-depth-1';
  return { material, depth };
}

interface Catmull {
  pts: { x: number; z: number }[];
  len: number;
  /** cumulative arc length table */
  sx: Float32Array;
  sz: Float32Array;
  ss: Float32Array;
}

/** closed Catmull-Rom loop sampled into an arc-length table */
function buildLoop(pts: { x: number; z: number }[], samples = 600): Catmull {
  const n = pts.length;
  const sx = new Float32Array(samples + 1),
    sz = new Float32Array(samples + 1),
    ss = new Float32Array(samples + 1);
  const at = (t: number) => {
    const u = ((t % 1) + 1) % 1;
    const f = u * n;
    const i = Math.floor(f);
    const k = f - i;
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i % n],
      p2 = pts[(i + 1) % n],
      p3 = pts[(i + 2) % n];
    const k2 = k * k,
      k3 = k2 * k;
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * k + (2 * a - 5 * b + 4 * c - d) * k2 + (-a + 3 * b - 3 * c + d) * k3);
    return { x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) };
  };
  let acc = 0;
  let prev = at(0);
  for (let i = 0; i <= samples; i++) {
    const p = at(i / samples);
    if (i > 0) acc += Math.hypot(p.x - prev.x, p.z - prev.z);
    sx[i] = p.x;
    sz[i] = p.z;
    ss[i] = acc;
    prev = p;
  }
  return { pts, len: acc, sx, sz, ss };
}

function sampleLoop(c: Catmull, s: number, out: { x: number; z: number; dx: number; dz: number }): void {
  const L = c.len;
  const u = ((s % L) + L) % L;
  // binary search
  let lo = 0,
    hi = c.ss.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c.ss[mid] <= u) lo = mid;
    else hi = mid;
  }
  const seg = c.ss[hi] - c.ss[lo] || 1;
  const k = (u - c.ss[lo]) / seg;
  out.x = c.sx[lo] + (c.sx[hi] - c.sx[lo]) * k;
  out.z = c.sz[lo] + (c.sz[hi] - c.sz[lo]) * k;
  const dl = Math.hypot(c.sx[hi] - c.sx[lo], c.sz[hi] - c.sz[lo]) || 1;
  out.dx = (c.sx[hi] - c.sx[lo]) / dl;
  out.dz = (c.sz[hi] - c.sz[lo]) / dl;
}

/** smoothed altitude floor along a loop (rooftops + clearance) */
function floorTable(c: Catmull, skyline: SkylineGrid, radius: number, clearance: number, n = 360): Float32Array {
  const raw = new Float32Array(n);
  const p = { x: 0, z: 0, dx: 0, dz: 0 };
  for (let i = 0; i < n; i++) {
    sampleLoop(c, (i / n) * c.len, p);
    raw[i] = skyline.around(p.x, p.z, radius) + clearance;
  }
  // widen (moving max) then blur so climbs start early and are gentle
  const w = Math.ceil(n * 0.03);
  const mx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = -w; k <= w; k++) m = Math.max(m, raw[(i + k + n) % n]);
    mx[i] = m;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -w; k <= w; k++) s += mx[(i + k + n) % n];
    out[i] = s / (2 * w + 1);
  }
  return out;
}

const lookupFloor = (t: Float32Array, c: Catmull, s: number) => {
  const n = t.length;
  const f = ((((s % c.len) + c.len) % c.len) / c.len) * n;
  const i = Math.floor(f) % n;
  const k = f - Math.floor(f);
  return t[i] * (1 - k) + t[(i + 1) % n] * k;
};

export interface VehicleSystem {
  mesh: THREE.InstancedMesh;
  update(dt: number): void;
  frame(): void;
  locate(name: string): { x: number; y: number; z: number; yaw?: number } | null;
  stats(): Record<string, number | string>;
  invariants(): string[];
}

export function createVehicles(ctx: CityContext, sparks: SparkSystem, skyline: SkylineGrid, bargeSite: { x: number; z: number }): VehicleSystem {
  const { plan } = ctx;
  const geo = buildVehicleGeometry();
  const N = 4;
  const iModel = new THREE.InstancedBufferAttribute(new Float32Array([MODEL.BALLOON, MODEL.PLANE, MODEL.BLIMP, MODEL.BARGE]), 1);
  const iGlow = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iModel', iModel);
  geo.setAttribute('iGlow', iGlow);
  const tex = makeBlimpTexture();
  const { material, depth } = makeMaterials(tex);
  const mesh = new THREE.InstancedMesh(geo, material, N);
  mesh.name = 'ambient-vehicles';
  mesh.customDepthMaterial = depth;
  mesh.castShadow = ctx.quality.shadows;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, ZERO);

  const water = () => ctx.services.water as { surfaceY(x: number, z: number): number } | undefined;
  const ground = (x: number, z: number) => (ctx.services.terrain as { height(x: number, z: number): number } | undefined)?.height(x, z) ?? plan.heightAt(x, z);

  // ── balloon route
  const field = plan.areas.find((a) => a.kind === 'field');
  const site = field ? { x: (field.rect.x0 + field.rect.x1) / 2, z: (field.rect.z0 + field.rect.z1) / 2 } : { x: -27.5, z: 72.5 };
  const siteY = ground(site.x, site.z) + 0.02;
  const bLoop = buildLoop([
    { x: site.x, z: site.z },
    { x: -72, z: 32 },
    { x: -140, z: 12 },
    { x: -165, z: 78 },
    { x: -95, z: 132 },
    { x: 0, z: 130 },
    { x: 88, z: 112 },
    { x: 142, z: 62 },
    { x: 104, z: 6 },
    { x: 44, z: 14 },
    { x: 4, z: 48 },
  ]);
  const bFloor = floorTable(bLoop, skyline, 16, 18);
  const B_SPEED = 3.0;
  const B_BASKET = 4.32; // basket bottom below the envelope mouth

  // ── blimp route
  const mLoop = buildLoop([
    { x: -140, z: 40 },
    { x: -120, z: -20 },
    { x: -40, z: 8 },
    { x: 60, z: -12 },
    { x: 150, z: 20 },
    { x: 140, z: 105 },
    { x: 20, z: 128 },
    { x: -100, z: 120 },
  ]);
  const mFloor = floorTable(mLoop, skyline, 26, 22);
  const M_SPEED = 6.5;

  const light = {
    burner: sparks.glowSlot(),
    pl: [0, 1, 2, 3, 4, 5].map(() => sparks.glowSlot()),
    bl: [0, 1, 2].map(() => sparks.glowSlot()),
    bg: [0, 1].map(() => sparks.glowSlot()),
  };

  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(0, 0, 0, 'YXZ'),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3(),
    tmp = new THREE.Vector3();
  const _tilt = new THREE.Matrix4(),
    _scale = new THREE.Matrix4(),
    _lift = new THREE.Matrix4();
  const P = { x: 0, z: 0, dx: 0, dz: 0 };
  const P2 = { x: 0, z: 0, dx: 0, dz: 0 };

  // live state for pickers / stats
  const st = {
    balloon: { on: false, x: 0, y: 0, z: 0, yaw: 0, phase: 'packed', burner: 0, speed: 0 },
    plane: { on: false, x: 0, y: 0, z: 0, yaw: 0, pass: -1 },
    blimp: { on: false, x: 0, y: 0, z: 0, yaw: 0 },
    barge: { x: bargeSite.x, y: 0, z: bargeSite.z },
  };
  const mats = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];

  const RATE = 1 / SECONDS_PER_GAME_HOUR;
  let fc = absHours(ctx);
  let T = 0;
  let burnTimer = 0,
    burnOn = 0;

  // ───────────────────────────── balloon
  const balloonState = (h: number, abs: number) => {
    const b = st.balloon;
    const day = Math.floor(abs / 24);
    const sOff = hash01(day, 7) * 0; // the route always starts at the stadium
    const tSim = (h - 6.4) * SECONDS_PER_GAME_HOUR;
    const s = sOff + Math.max(0, tSim) * B_SPEED;
    let x = site.x,
      z = site.z,
      y = siteY + B_BASKET,
      tilt = 0,
      radial = 1,
      phase = 'packed';
    let visible = true;
    const cruiseAlt = (ss: number) => {
      sampleLoop(bLoop, ss, P);
      const wave = 112 + 18 * Math.sin(ss * 0.0071 + 0.6) + 7 * Math.sin(ss * 0.019 + 1.3);
      return Math.max(wave, lookupFloor(bFloor, bLoop, ss));
    };
    if (h < 5.75 || h >= 20.2) {
      visible = false;
    } else if (h < 6.4) {
      // inflating lying on the pitch, then standing up
      const k = smooth(5.75, 6.15, h);
      tilt = (1 - smooth(6.0, 6.3, h)) * (Math.PI / 2) * 0.96;
      radial = 0.25 + 0.75 * k;
      phase = h < 6.3 ? 'inflating' : 'ready';
    } else if (h < 19.0) {
      const alt = cruiseAlt(s);
      x = P.x;
      z = P.z;
      const up = smooth(6.4, 7.3, h);
      y = siteY + B_BASKET + (alt - siteY - B_BASKET) * (1 - (1 - up) * (1 - up));
      phase = h < 7.3 ? 'ascending' : 'cruising';
    } else if (h < 19.75) {
      const alt = cruiseAlt(s);
      const k = smooth(19.0, 19.7, h);
      x = P.x + (site.x - P.x) * k;
      z = P.z + (site.z - P.z) * k;
      y = alt + (siteY + 55 - alt) * k;
      phase = 'returning';
    } else if (h < 20.0) {
      const k = smooth(19.75, 20.0, h);
      y = siteY + 55 + (siteY + B_BASKET - siteY - 55) * (1 - (1 - k) * (1 - k));
      phase = 'landing';
    } else {
      const k = smooth(20.0, 20.18, h);
      tilt = k * (Math.PI / 2) * 0.96;
      radial = 1 - 0.75 * k;
      phase = 'packing';
    }
    b.on = visible;
    b.phase = visible ? phase : 'packed';
    b.x = x;
    b.y = y;
    b.z = z;
    b.yaw = 0.35 + s * 0.004 + Math.sin(T * 0.05) * 0.2;
    if (!visible) {
      mats[0].copy(ZERO);
      return;
    }
    // pivot on the basket bottom for the inflate / pack-away tilt (envelope lies on the grass)
    const yawQ = q.setFromEuler(e.set(0, b.yaw, 0, 'YXZ'));
    m4.compose(v.set(x, y - B_BASKET + Math.sin(tilt) * radial * 5.5, z), yawQ, sc.set(1, 1, 1));
    _tilt.makeRotationZ(tilt);
    _scale.makeScale(radial, 1, radial);
    _lift.makeTranslation(0, B_BASKET * (tilt > 0.01 ? 0.25 + 0.75 * Math.cos(tilt) : 1), 0);
    mats[0].copy(m4).multiply(_tilt).multiply(_lift).multiply(_scale);
  };

  // ───────────────────────────── plane
  const PASS_EVERY = 2.2,
    PASS_SIM = 28,
    PASS_LEN = 1500;
  const planeState = (abs: number) => {
    const p = st.plane;
    const k = Math.floor((abs - 0.35) / PASS_EVERY);
    const t0 = k * PASS_EVERY + 0.35;
    const u = ((abs - t0) * SECONDS_PER_GAME_HOUR) / PASS_SIM;
    if (u < 0 || u > 1) {
      p.on = false;
      mats[1].copy(ZERO);
      return;
    }
    // straight crossing at ~200 m over the southern half of the town (that is where the usual
    // camera views — overview, beach, park, stadium — can actually see the sky above the table)
    const hd = hash01(k, 11) * Math.PI * 2;
    const dx = Math.sin(hd),
      dz = Math.cos(hd);
    const cx = -50 + hash01(k, 12) * 150,
      cz = 25 + hash01(k, 14) * 95;
    const s = (u - 0.5) * PASS_LEN;
    p.on = true;
    p.pass = k;
    p.x = cx + dx * s;
    p.z = cz + dz * s;
    p.y = 195 + hash01(k, 13) * 20;
    p.yaw = hd;
    e.set(0, hd, Math.sin(u * 3 + k) * 0.05, 'YXZ');
    mats[1].compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), sc.set(1, 1, 1));
  };

  // ───────────────────────────── blimp
  const blimpState = (h: number) => {
    const m = st.blimp;
    if (h < 9.5 || h > 23.5) {
      m.on = false;
      mats[2].copy(ZERO);
      return;
    }
    const tSim = (h - 9.5) * SECONDS_PER_GAME_HOUR;
    const s = tSim * M_SPEED;
    sampleLoop(mLoop, s, P);
    let x = P.x,
      z = P.z,
      dx = P.dx,
      dz = P.dz;
    const alt = Math.max(140 + 6 * Math.sin(s * 0.004), lookupFloor(mFloor, mLoop, s));
    // arrive from / leave to the west, far beyond the table edge
    const inK = 1 - smooth(9.5, 10.6, h);
    const outK = smooth(22.4, 23.5, h);
    if (inK > 0) {
      sampleLoop(mLoop, 0, P2);
      const far = -950;
      x = x + (far - x) * inK * inK;
      z = z + (P2.z - z) * inK * inK * 0.5;
      dx = dx * (1 - inK) + inK;
      dz = dz * (1 - inK);
    }
    if (outK > 0) {
      const far = 950;
      x = x + (far - x) * outK * outK;
      dx = dx * (1 - outK) + outK;
      dz = dz * (1 - outK);
    }
    m.on = true;
    m.x = x;
    m.y = alt;
    m.z = z;
    m.yaw = Math.atan2(dx, dz);
    e.set(Math.sin(T * 0.13) * 0.02, m.yaw, Math.sin(T * 0.09) * 0.025, 'YXZ');
    mats[2].compose(v.set(x, alt, z), q.setFromEuler(e), sc.set(1, 1, 1));
  };

  // ───────────────────────────── barge
  const bargeState = () => {
    const w = water();
    const bx = bargeSite.x,
      bz = bargeSite.z;
    const y0 = w ? w.surfaceY(bx, bz) : plan.water.level;
    const yF = w ? w.surfaceY(bx, bz + 4) : y0;
    const yB = w ? w.surfaceY(bx, bz - 4) : y0;
    const yL = w ? w.surfaceY(bx + 2, bz) : y0;
    const yR = w ? w.surfaceY(bx - 2, bz) : y0;
    st.barge.y = y0 + 0.35;
    e.set(Math.atan2(yF - yB, 8) * -0.8, 0.35, Math.atan2(yL - yR, 4) * 0.8, 'YXZ');
    mats[3].compose(v.set(bx, y0 + 0.35, bz), q.setFromEuler(e), sc.set(1, 1, 1));
  };

  const place = () => {
    const abs = fc;
    const h = ((abs % 24) + 24) % 24;
    balloonState(h, abs);
    planeState(abs);
    blimpState(h);
    bargeState();
    for (let i = 0; i < N; i++) mesh.setMatrixAt(i, mats[i]);
    mesh.instanceMatrix.needsUpdate = true;
  };

  // ───────────────────────────── lights
  const lightAt = (mat: THREE.Matrix4, x: number, y: number, z: number) => tmp.set(x, y, z).applyMatrix4(mat);
  const updateLights = () => {
    const night = ctx.clock.night;
    const lights = ctx.uniforms.uLights.value;
    const day = 1 - night;
    // balloon burner
    const b = st.balloon;
    const flying = b.on && (b.phase === 'ascending' || b.phase === 'cruising' || b.phase === 'returning' || b.phase === 'ready' || b.phase === 'landing' || b.phase === 'inflating');
    if (flying && burnOn > 0) {
      const f = burnOn * (0.85 + 0.15 * Math.sin(T * 41) * Math.sin(T * 23));
      const p = lightAt(mats[0], 0, -1.25, 0);
      sparks.setGlow(light.burner, p.x, p.y, p.z, 3.2 * f, 1.7 * f, 0.55 * f, 1.5 + 0.6 * f);
    } else sparks.hideGlow(light.burner);
    iGlow.setXYZW(0, flying ? burnOn * (0.08 + 0.55 * night + 0.25 * ctx.clock.dusk) : 0, 0, 0, 0);
    // plane nav lights (steady red / green / white, red beacon, white wingtip strobes)
    const pl = st.plane;
    if (pl.on) {
      const M = mats[1];
      const vis = 0.35 + 0.65 * night;
      let p = lightAt(M, 10.05, 1.2, 0.6);
      sparks.setGlow(light.pl[0], p.x, p.y, p.z, 3 * vis, 0.25 * vis, 0.2 * vis, 1.6);
      p = lightAt(M, -10.05, 1.2, 0.6);
      sparks.setGlow(light.pl[1], p.x, p.y, p.z, 0.25 * vis, 2.6 * vis, 0.5 * vis, 1.6);
      p = lightAt(M, 0, 4.7, -8.3);
      sparks.setGlow(light.pl[2], p.x, p.y, p.z, 2 * vis, 2 * vis, 2 * vis, 1.3);
      const beacon = (T * 1.1) % 1 < 0.12 ? 1 : 0;
      p = lightAt(M, 0, -1.4, 0.5);
      sparks.setGlow(light.pl[3], p.x, p.y, p.z, 5 * beacon, 0.4 * beacon, 0.3 * beacon, 2.2 * beacon);
      const ph = (T * 0.8) % 1;
      const strobe = ph < 0.05 || (ph > 0.1 && ph < 0.15) ? 1 : 0;
      p = lightAt(M, 10.2, 1.25, 0.2);
      sparks.setGlow(light.pl[4], p.x, p.y, p.z, 7 * strobe, 7 * strobe, 7.5 * strobe, 2.6 * strobe);
      p = lightAt(M, -10.2, 1.25, 0.2);
      sparks.setGlow(light.pl[5], p.x, p.y, p.z, 7 * strobe, 7 * strobe, 7.5 * strobe, 2.6 * strobe);
    } else for (const s of light.pl) sparks.hideGlow(s);
    // blimp: nav lights + lit gondola & envelope at night
    const bm = st.blimp;
    if (bm.on) {
      const M = mats[2];
      const vis = 0.3 + 0.7 * night;
      let p = lightAt(M, 5.7, 0, -16.5);
      sparks.setGlow(light.bl[0], p.x, p.y, p.z, 3 * vis, 0.25 * vis, 0.2 * vis, 1.8);
      p = lightAt(M, -5.7, 0, -16.5);
      sparks.setGlow(light.bl[1], p.x, p.y, p.z, 0.25 * vis, 2.6 * vis, 0.5 * vis, 1.8);
      const beacon = (T * 0.9 + 0.3) % 1 < 0.1 ? 1 : 0;
      p = lightAt(M, 0, -6.7, 3.6);
      sparks.setGlow(light.bl[2], p.x, p.y, p.z, 4 * beacon, 0.4 * beacon, 0.3 * beacon, 2 * beacon);
      iGlow.setXYZW(2, 0, lights * 1.4, lights * (0.22 + 0.1 * Math.sin(T * 0.5)), 0);
    } else for (const s of light.bl) sparks.hideGlow(s);
    // barge deck lamps
    const M3 = mats[3];
    if (lights > 0.05) {
      let p = lightAt(M3, 0, 5.3, -3.9);
      sparks.setGlow(light.bg[0], p.x, p.y, p.z, 2.4 * lights, 1.7 * lights, 0.9 * lights, 0.9);
      p = lightAt(M3, 1.6, 1.2, 4.6);
      sparks.setGlow(light.bg[1], p.x, p.y, p.z, 2 * lights, 1.4 * lights, 0.7 * lights, 0.7);
    } else for (const s of light.bg) sparks.hideGlow(s);
    iGlow.setXYZW(3, 0, lights * 1.2, 0, 0);
    iGlow.needsUpdate = true;
    void day;
  };

  // ───────────────────────────── pickers
  const pickSphere = (ray: THREE.Ray, cx: number, cy: number, cz: number, r: number): number => {
    tmp.set(cx, cy, cz);
    const d2 = ray.distanceSqToPoint(tmp);
    if (d2 > r * r) return -1;
    const along = tmp.sub(ray.origin).dot(ray.direction);
    return along > 0 ? along : -1;
  };
  ctx.pickers.push({
    name: 'ambient-sky',
    pick(ray) {
      let best: PickHit | null = null;
      const consider = (d: number, hit: Omit<PickHit, 'distance'>) => {
        if (d > 0 && (!best || d < best.distance)) best = { ...hit, distance: d } as PickHit;
      };
      const b = st.balloon;
      if (b.on) {
        const d = pickSphere(ray, b.x, b.y + 8, b.z, 9.5);
        consider(d, {
          kind: 'other',
          id: 9001,
          label: 'Hot-air balloon',
          getPosition: (o) => (st.balloon.on ? (o.set(st.balloon.x, st.balloon.y + 4, st.balloon.z), true) : false),
          getHeading: () => st.balloon.yaw,
          info: () => [`${st.balloon.phase[0].toUpperCase()}${st.balloon.phase.slice(1)} at ${Math.round(Math.max(0, st.balloon.y - B_BASKET - siteY))} m`, `${Math.round(B_SPEED * 3.6)} km/h with the breeze`],
        });
      }
      const m = st.blimp;
      if (m.on) {
        const fx = Math.sin(m.yaw),
          fz = Math.cos(m.yaw);
        for (const k of [-11, 0, 11]) {
          const d = pickSphere(ray, m.x + fx * k, m.y, m.z + fz * k, 7);
          consider(d, {
            kind: 'other',
            id: 9002,
            label: 'Tinyhaven blimp',
            getPosition: (o) => (st.blimp.on ? (o.set(st.blimp.x, st.blimp.y, st.blimp.z), true) : false),
            getHeading: () => st.blimp.yaw,
            info: () => [`Cruising at ${Math.round(st.blimp.y)} m`, `${Math.round(M_SPEED * 3.6)} km/h`],
          });
        }
      }
      const p = st.plane;
      if (p.on) {
        const d = pickSphere(ray, p.x, p.y, p.z, 12);
        consider(d, {
          kind: 'other',
          id: 9003,
          label: 'Haven Air commuter flight',
          getPosition: (o) => (st.plane.on ? (o.set(st.plane.x, st.plane.y, st.plane.z), true) : false),
          getHeading: () => st.plane.yaw,
          info: () => [`Altitude ${Math.round(st.plane.y)} m`, `${Math.round((PASS_LEN / PASS_SIM) * 3.6)} km/h`],
        });
      }
      const g = st.barge;
      const dB = pickSphere(ray, g.x, g.y, g.z, 6);
      consider(dB, {
        kind: 'other',
        id: 9004,
        label: 'Fireworks barge',
        getPosition: (o) => (o.set(st.barge.x, st.barge.y, st.barge.z), true),
        info: () => ['Moored in the harbour basin', 'Show every night at 22:00'],
      });
      return best;
    },
  });

  place();

  return {
    mesh,
    update(dt) {
      if (dt <= 0) return;
      T += dt;
      if (ctx.clock.holdTime) fc += dt * RATE;
      else fc = absHours(ctx);
      // burner rhythm: frequent while inflating / climbing, short flares while cruising
      const ph = st.balloon.phase;
      burnTimer -= dt;
      if (burnTimer <= 0) {
        const busy = ph === 'inflating' || ph === 'ready' || ph === 'ascending' || ph === 'landing';
        if (burnOn > 0) {
          burnOn = 0;
          burnTimer = busy ? 1.2 + hash01(Math.floor(T * 10), 3) * 2 : 9 + hash01(Math.floor(T * 10), 4) * 14;
        } else {
          burnOn = 1;
          burnTimer = busy ? 2 + hash01(Math.floor(T * 10), 5) * 2.5 : 1.8 + hash01(Math.floor(T * 10), 6) * 2.4;
        }
      }
    },
    frame() {
      if (!ctx.clock.holdTime && ctx.clock.speed === 0) fc = absHours(ctx);
      place();
      updateLights();
    },
    locate(name) {
      if (name === 'balloon') return st.balloon.on ? { x: st.balloon.x, y: st.balloon.y, z: st.balloon.z } : null;
      if (name === 'plane') return st.plane.on ? { x: st.plane.x, y: st.plane.y, z: st.plane.z } : null;
      if (name === 'blimp') return st.blimp.on ? { x: st.blimp.x, y: st.blimp.y, z: st.blimp.z, yaw: st.blimp.yaw } : null;
      if (name === 'barge') return { ...st.barge };
      return null;
    },
    stats() {
      return {
        balloon: st.balloon.on ? `${st.balloon.phase} ${Math.round(st.balloon.y)}m` : 'packed',
        plane: st.plane.on ? `pass ${st.plane.pass}` : 'none',
        blimp: st.blimp.on ? `${Math.round(st.blimp.y)}m` : 'hangar',
      };
    },
    invariants() {
      const out: string[] = [];
      const b = st.balloon;
      if (b.on) {
        const gy = ground(b.x, b.z);
        if (b.y - B_BASKET < gy - 0.3) out.push(`balloon basket below ground (${(b.y - B_BASKET).toFixed(1)} < ${gy.toFixed(1)})`);
        if (b.phase === 'cruising' && b.y < skyline.at(b.x, b.z) + 6) out.push(`balloon too close to rooftops at (${b.x.toFixed(0)}, ${b.z.toFixed(0)})`);
      }
      const m = st.blimp;
      if (m.on && Math.abs(m.x) < 220 && m.y < skyline.at(m.x, m.z) + 8) out.push(`blimp too close to rooftops at (${m.x.toFixed(0)}, ${m.z.toFixed(0)})`);
      for (const k of ['balloon', 'plane', 'blimp'] as const) {
        const s = st[k];
        if (!Number.isFinite(s.x + s.y + s.z)) out.push(`${k}: non-finite position`);
      }
      void clamp;
      return out;
    },
  };
}
