// Module "lamps": bakes the night street-light map (see core/lampLight.ts) and drives its gain.
// Loaded right after "props", so every static light source has been registered by then; the
// bake itself waits for 'modules:ready' (CPU, ~20–60 ms, one RGBA8 texture 1636×696).
//
//  • uLampGain eases in with the street lights (uLights), slightly stronger in deep night.
//  • scheduled / moving lights (registered with `channel`) are packed every frame into the
//    analytic spot uniforms (stadium floodlights follow the 'stadium' channel, crane work lights
//    the built-in 'lights' channel).
//  • ?legacylamps  — the old flat additive pools come back (glow meshes) and the map stays dark (A/B)
//  • ?lampall      — preview: add the lamp light to EVERY lit material that does not integrate it yet
//  • ?lampk=1.0    — overall lamp-light gain (tuning)
//  • ?lampdebug    — ctx.services.lamps.preview() returns a PNG data URL of the baked panels

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { LAMP_MAP, TH_LAMP_SPOTS, bindLampChannel, lampChannel, lampLights, lampSpotUniforms, type LampLight } from '../core/lampLight';
import { bakeLampMap, type BakeResult } from './lamps/bake';
import { patchLampScene } from './lamps/integrate';

export interface LampsService {
  baked: boolean;
  /** PNG data URL of the baked map (debug, ?lampdebug only) */
  preview(): string;
}

interface Spot {
  l: LampLight;
  r: number;
  g: number;
  b: number;
  /** spatial group (0/1): each group gets its own early-out box in the shader */
  group: number;
}

export default function create(ctx: CityContext): CityModule {
  const params = ctx.debug.params;
  const legacy = params.has('legacylamps');
  const K = parseFloat(params.get('lampk') ?? '1') || 1;
  const terrain = ctx.services.terrain as { height?(x: number, z: number): number } | undefined;
  const ground = (x: number, z: number): number => (terrain?.height ? terrain.height(x, z) : ctx.plan.heightAt(x, z));

  // built-in channel: street-light state (for moving lights that follow the street-light schedule)
  const lightsCh = { value: 0 };
  bindLampChannel('lights', lightsCh);

  let tex: THREE.DataTexture | null = null;
  let result: BakeResult | null = null;
  let autoPatched = 0;
  const spots: Spot[] = [];
  const _c = new THREE.Color();

  const bake = () => {
    if (legacy) return;
    const all = lampLights();
    result = bakeLampMap(all, ground, 1);
    tex = new THREE.DataTexture(result.data, result.width, result.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = false;
    tex.name = 'lamp-map';
    tex.needsUpdate = true;
    ctx.uniforms.uLampMap.value = tex;
    ctx.uniforms.uLampXf.value.set(LAMP_MAP.x0, LAMP_MAP.z0, 1 / (LAMP_MAP.x1 - LAMP_MAP.x0), 1 / (LAMP_MAP.z1 - LAMP_MAP.z0));
    let first: LampLight | null = null;
    for (const l of all) {
      if (!l.channel) continue;
      _c.set(l.color);
      const lum = Math.max(1e-3, 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b);
      first ??= l;
      const group = Math.hypot(l.x - first.x, l.z - first.z) < 90 ? 0 : 1;
      spots.push({ l, r: _c.r / lum, g: _c.g / lum, b: _c.b / lum, group });
    }
    spots.sort((a, b) => a.group - b.group);
    service.baked = true;
    if (ctx.debug.enabled) console.info(`[lamps] baked ${result.lights} lights (${spots.length} dynamic) in ${result.ms.toFixed(0)} ms, peak ${result.peak.toFixed(2)}`);
    if (params.has('lampall')) autoPatched = patchLampScene(ctx.scene);
  };
  ctx.events.on('modules:ready', bake);

  const P = lampSpotUniforms.uLampSpotP.value,
    C = lampSpotUniforms.uLampSpotC.value,
    D = lampSpotUniforms.uLampSpotD.value;
  const BOX = [lampSpotUniforms.uLampSpotBox.value, lampSpotUniforms.uLampSpotBox2.value];
  const packSpots = () => {
    let n = 0;
    let split = 0;
    for (const b of BOX) {
      b[0] = b[1] = Infinity;
      b[2] = b[3] = -Infinity;
    }
    for (const s of spots) {
      if (n >= TH_LAMP_SPOTS) break;
      const l = s.l;
      const g = lampChannel(l.channel!) * K;
      if (g < 0.002) continue;
      let ax = 0,
        ay = -1,
        az = 0,
        dl = Math.max(0.8, l.pole ?? 6),
        reach = l.radius * 1.5,
        cosO = 0.2,
        cosI = 0.9,
        cosGA = 1;
      if (l.aim) {
        const dx = l.aim[0] - l.x,
          dy = l.aim[1] - l.y,
          dz = l.aim[2] - l.z;
        dl = Math.hypot(dx, dy, dz) || 1;
        ax = dx / dl;
        ay = dy / dl;
        az = dz / dl;
        const half = l.cone ?? Math.atan2(l.radius, dl);
        cosO = Math.cos(Math.min(1.45, half * 1.35));
        cosI = Math.cos(half * 0.35);
        cosGA = Math.max(0.08, -ay);
        reach = dl + l.radius * 1.6;
      }
      const norm = (l.intensity * g * (dl * dl + 1)) / cosGA;
      const o = n * 4;
      P[o] = l.x;
      P[o + 1] = l.y;
      P[o + 2] = l.z;
      P[o + 3] = reach;
      C[o] = s.r * norm;
      C[o + 1] = s.g * norm;
      C[o + 2] = s.b * norm;
      C[o + 3] = cosO;
      D[o] = ax;
      D[o + 1] = ay;
      D[o + 2] = az;
      D[o + 3] = cosI;
      const b = BOX[s.group];
      b[0] = Math.min(b[0], l.x - reach);
      b[1] = Math.min(b[1], l.z - reach);
      b[2] = Math.max(b[2], l.x + reach);
      b[3] = Math.max(b[3], l.z + reach);
      n++;
      if (s.group === 0) split = n;
    }
    lampSpotUniforms.uLampSpotN.value = n;
    lampSpotUniforms.uLampSpotSplit.value = split;
    // empty groups never match
    for (const b of BOX) if (!(b[0] < b[2])) b[0] = b[1] = b[2] = b[3] = 0;
  };

  const service: LampsService = {
    baked: false,
    preview(): string {
      if (!result || !params.has('lampdebug')) return '';
      const cv = document.createElement('canvas');
      cv.width = result.width;
      cv.height = result.height;
      const g = cv.getContext('2d')!;
      const img = g.createImageData(result.width, result.height);
      for (let i = 0; i < result.data.length; i += 4) {
        img.data[i] = result.data[i];
        img.data[i + 1] = result.data[i + 1];
        img.data[i + 2] = result.data[i + 2];
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    },
  };
  ctx.services.lamps = service;

  return {
    name: 'lamps',
    frame() {
      const u = ctx.uniforms;
      const lights = u.uLights.value;
      // lamps read stronger once the sky is fully dark (eye adaptation, like the windows)
      const on = lights * lights * (3 - 2 * lights);
      lightsCh.value = on * (0.8 + 0.2 * u.uNight.value);
      u.uLampGain.value = tex ? lightsCh.value * K : 0;
      packSpots();
    },
    stats() {
      return {
        registered: lampLights().length,
        baked: result?.lights ?? 0,
        dynamic: spots.length,
        activeSpots: lampSpotUniforms.uLampSpotN.value,
        bakeMs: Math.round(result?.ms ?? 0),
        texels: result?.texelsTouched ?? 0,
        autoPatched,
      };
    },
    invariants() {
      const out: string[] = [];
      if (!legacy && !tex && lampLights().length > 0) out.push('lamp map not baked');
      for (const l of lampLights()) {
        if (![l.x, l.y, l.z, l.radius, l.intensity].every(Number.isFinite)) {
          out.push(`lamp light with non-finite values at (${l.x}, ${l.z})`);
          break;
        }
      }
      return out;
    },
    dispose() {
      tex?.dispose();
    },
  };
}
