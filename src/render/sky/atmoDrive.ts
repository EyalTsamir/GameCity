// Drives the world sky + atmosphere every frame (no allocations per frame):
//   * physical sky (sky/physical.ts): the LUT is re-rendered and the CPU twin re-evaluated only when
//     the sun / haze / camera height moved noticeably; brightness is normalised against the
//     art-directed light rig (the palette's exposure does the rest), so a low sun keeps a glowing sky;
//   * the fog's in-scatter colours (render/atmosphere.ts): the horizon ring is the sky's own horizon
//     (physical twin or the painted gradient) → distant land melts into the sky with no seam;
//   * the sun lobe (glowing haze / aureole) from the authored sun colour & intensity — the dome draws
//     exactly the same lobe above the horizon;
//   * haze / mist densities from the palette, mist drifting with the wind.

import * as THREE from 'three';
import type { SkyState } from './palette';
import { createAtmosphereParams, fitRing, writeAtmosphere, atmoDistanceFor, atmoTransmittance, type AtmosphereParams } from '../atmosphere';
import { SkyLUT, skyRadiance, sunTransmittance, type PhysSkyParams } from './physical';
import { WATER_LEVEL } from '../../core/constants';

export interface AtmosphereService {
  params: AtmosphereParams;
  /** luminance-weighted haze transmittance camera (height yc) → point at distance t, height yp */
  transmittance(t: number, yc: number, yp: number): number;
  /** distance (m, horizontal at height y) where the haze transmittance falls to T */
  distanceFor(T: number, y: number): number;
  /** true when the fog chunks were replaced (false with ?noatmo / ?diorama) */
  active: boolean;
}

const RING_N = 12;
/** sky aerosol relative to the fog's boundary-layer haze (vertical AOD is far smaller than the
 *  horizontal haze suggests; a 1:1 sky turns the noon zenith white) */
const SKY_HAZE = 0.2;
/** Mie phase in the LUT: isotropic — the forward peak depends on the TRUE scattering angle, so it lives
 *  in the analytic sun lobe (dome and fog alike), never in the azimuth-only horizon ring */
const SKY_G = 0;
const SKY_MS = 0.15;
/** elevation of the horizon ring: the sky ~3° up (the true horizon is a long, reddened, yellowish path) */
const RING_EL = 0.052;

const _c = new THREE.Color();
const _g = new THREE.Color();
const _t = [0, 0, 0];

function grey(c: THREE.Color, k: number): void {
  const g = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  c.r += (g * 0.92 - c.r) * k;
  c.g += (g * 0.96 - c.g) * k;
  c.b += (g * 1.02 - c.b) * k;
}
function lum(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export class AtmosphereDriver {
  readonly params: AtmosphereParams = createAtmosphereParams();
  /** multiplier on the haze (?atmo=k) */
  hazeK = 1;
  mistOn = true;
  /** physical sky (null = painted gradient) */
  readonly lut: SkyLUT | null;
  readonly phys: PhysSkyParams = { sunSin: 1, sunCos: 0, camH: 50, haze: 1e-4, g: SKY_G, ms: SKY_MS };
  /** current scale from LUT radiance to scene units (normalised per time of day) */
  skyScale = 1;
  /** physical zenith colour (scene units, incl. the night sky) — for the water / reflections */
  readonly zenith = new THREE.Color();
  /** physical sun colour after the atmosphere (normalised to max 1) — the sun disc */
  readonly sunColor = new THREE.Color(1, 1, 1);
  /** sunlight reaching the cumulus deck (absolute transmittance incl. the earth shadow) */
  readonly cloudSunT = new THREE.Color(1, 1, 1);
  /** night gradient weight (authored moonlit sky) */
  nightW = 0;
  /** the lit town's sky glow at the horizon (set by the sky module; part of the night haze) */
  readonly cityGlow = new THREE.Color(0, 0, 0);
  /** brightness compensation of the sky at this time of day (skyScale / noon scale, ≥ 1) */
  comp = 1;
  private s0 = 1;
  private ringRaw = new Float32Array(RING_N * 3);
  private zenRaw = new THREE.Color();
  private refL = 1;
  private refNoon = 1;
  private drift = new THREE.Vector2();
  private sd = new THREE.Vector3();
  private state: SkyState | null = null;
  private overcast = 0;
  private band0 = 1;
  lutUpdates = 0;

  constructor(physical: boolean) {
    this.params.waterY = WATER_LEVEL;
    this.lut = physical ? new SkyLUT(64) : null;
    if (physical) {
      // calibration: noon, clear — the horizon 90° from the sun maps to the authored noon horizon
      const p = this.phys;
      const e = THREE.MathUtils.degToRad(58);
      p.sunSin = Math.sin(e);
      p.sunCos = Math.cos(e);
      p.camH = 60;
      p.haze = 1e-4 * SKY_HAZE;
      this.evalCPU();
      this.refNoon = this.refL;
      skyRadiance(p, 0, Math.sin(RING_EL), Math.cos(RING_EL), _c);
      this.s0 = 0.72 / Math.max(1e-6, lum(_c));
      p.sunSin = NaN; // force the first real update
    }
  }

  /** CPU twin: horizon ring, zenith, reference luminance, sun colour */
  private evalCPU(): void {
    const p = this.phys;
    const ce = Math.cos(RING_EL),
      se = Math.sin(RING_EL);
    for (let j = 0; j < RING_N; j++) {
      const phi = ((j + 0.5) / RING_N) * Math.PI;
      skyRadiance(p, ce * Math.cos(phi), se, ce * Math.sin(phi), _c);
      this.ringRaw[j * 3] = _c.r;
      this.ringRaw[j * 3 + 1] = _c.g;
      this.ringRaw[j * 3 + 2] = _c.b;
    }
    skyRadiance(p, 0.02, 0.9998, 0, this.zenRaw);
    // reference brightness away from the sun (its Mie side varies wildly): zenith, side and anti-sun
    let L = lum(this.zenRaw);
    skyRadiance(p, 0, 0.5, 0.866, _c);
    L += lum(_c);
    skyRadiance(p, -0.866, 0.5, 0, _c);
    L += lum(_c);
    const j90 = Math.floor(RING_N / 2);
    L += 0.2126 * this.ringRaw[j90 * 3] + 0.7152 * this.ringRaw[j90 * 3 + 1] + 0.0722 * this.ringRaw[j90 * 3 + 2];
    this.refL = L / 4;
    sunTransmittance(Math.max(1, p.camH), p.sunSin, p.haze, _t);
    const m = Math.max(_t[0], _t[1], _t[2], 1e-6);
    this.sunColor.setRGB(_t[0] / m, _t[1] / m, _t[2] / m);
    // clouds at ~1.8 km stay lit (reddening) after the ground has lost the sun
    sunTransmittance(1800, p.sunSin, p.haze, _t);
    this.cloudSunT.setRGB(_t[0], _t[1], _t[2]);
  }

  /**
   * dome horizon colour (y = 0) at azimuth φ from the sun, without the sun lobe — painted mode: the
   * CPU twin of dome.ts; physical mode: the physical twin at the current normalisation + night sky
   */
  private horizonAt = (phi: number, out: THREE.Color): void => {
    const s = this.state!;
    if (this.lut) {
      const j = Math.min(RING_N - 1, Math.max(0, Math.round((phi / Math.PI) * RING_N - 0.5)));
      const k = this.skyScale;
      out.setRGB(this.ringRaw[j * 3] * k, this.ringRaw[j * 3 + 1] * k, this.ringRaw[j * 3 + 2] * k);
      out.add(_g.copy(s.horizon).multiplyScalar(this.nightW)).add(this.cityGlow);
    } else {
      const az = Math.cos(phi) * 0.5 + 0.5;
      out.copy(s.horizon).add(_g.copy(s.glow).multiplyScalar(s.glowI * az * az * az * 0.85 * this.band0));
    }
    if (this.overcast > 0) grey(out, this.overcast * 0.75);
  };

  /**
   * @param sunDir true sun direction (not the lifted light direction)
   * @param sunVis 0..1 sun above the horizon
   */
  update(renderer: THREE.WebGLRenderer, state: SkyState, sunDir: THREE.Vector3, sunVis: number, overcast: number, camY: number, wind: THREE.Vector2, dt: number): void {
    const p = this.params;
    this.state = state;
    this.overcast = overcast;
    this.sd.set(sunDir.x, Math.max(sunDir.y, -0.25), sunDir.z).normalize();
    this.band0 = Math.exp(-Math.abs(Math.max(this.sd.y, 0) * 0.35) * 5);
    const haze = state.haze * (1 + overcast * 2.2) * this.hazeK;

    // ── physical sky: LUT + CPU twin (only when something moved)
    // night: the authored moonlit gradient takes over once the sun is ~2° below the horizon
    const sh = sunDir.y;
    const tn = Math.min(1, Math.max(0, (sh + 0.03) / -0.15));
    this.nightW = tn * tn * (3 - 2 * tn);
    if (this.lut) {
      const ph = this.phys;
      ph.sunSin = sh;
      ph.sunCos = Math.sqrt(Math.max(0, 1 - sh * sh));
      ph.camH = Math.min(3000, Math.max(1, camY));
      ph.haze = haze * SKY_HAZE;
      if (this.lut.update(renderer, ph)) {
        this.evalCPU();
        this.lutUpdates++;
      }
      // brightness normalisation: the key light stays strong at a low sun, so the sky must too
      // (partial: twilight still darkens; exposure in the palette does the rest)
      const r = this.refNoon / Math.max(1e-9, this.refL);
      const k = 0.85 - 0.25 * (1 - Math.min(1, Math.max(0, (sh + 0.06) / 0.16)));
      this.skyScale = this.s0 * Math.min(2000, Math.pow(Math.max(1, r), k));
      this.comp = this.skyScale / this.s0;
      this.zenith.copy(this.zenRaw).multiplyScalar(this.skyScale).add(_g.copy(state.zenith).multiplyScalar(this.nightW));
    } else this.zenith.copy(state.zenith);
    fitRing(p.ring, this.horizonAt, this.lut ? RING_N : 16);

    // ── sun lobe: the glow of sunlit haze around the sun (authored light colour × intensity)
    p.sunDir.copy(this.sd);
    if (this.lut) {
      const vis = sunVis * (1 - overcast * 0.7);
      p.lobeExp = 7;
      p.lobeColor.copy(state.sun).multiplyScalar(Math.min(4.5, state.sunI) * vis * (0.03 + 0.09 * state.glowI));
      p.lobe2 = 2.2;
      p.lobe2Exp = 90;
    } else {
      // painted sky: its narrow glow toward the sun (pow 24, 0.6·band at the horizon) + a little haze
      p.lobeExp = 18;
      p.lobeColor.copy(state.glow).multiplyScalar(state.glowI * 0.6 * this.band0);
      p.lobeColor.add(_c.copy(state.sun).multiplyScalar(0.07 * sunVis));
      p.lobe2 = 0;
    }
    if (overcast > 0) {
      grey(p.lobeColor, overcast * 0.75);
      p.lobeColor.multiplyScalar(1 - overcast * 0.6);
    }

    // rays looking up see the sky a little above the horizon band
    p.up.copy(p.ring[0]).lerp(this.zenith, 0.3);
    if (overcast > 0) grey(p.up, overcast * 0.75);
    p.upBlend = 0.3;

    p.haze = haze;
    p.hazeScaleHeight = 1200;
    p.desat = 0.38;

    // ground mist: denser in calm air, colour = lit haze (dawn rose / dusk lilac), drifts downwind
    const ws = Math.hypot(wind.x, wind.y);
    const calm = 1 / (1 + ws * 1.2);
    p.mist = this.mistOn ? state.mist * calm * (1 + overcast * 0.5) : 0;
    p.mistScaleHeight = state.mistH;
    p.mistColor.copy(p.ring[0]).lerp(_c.copy(state.hemiSky).multiplyScalar(state.hemiI * 1.1), 0.35);
    p.mistForward = 0.8;
    this.drift.x = (this.drift.x - wind.x * dt * 1.6) % 40000;
    this.drift.y = (this.drift.y - wind.y * dt * 1.6) % 40000;
    p.mistDrift.copy(this.drift);
    p.mistFreq = 1 / 70;
    p.mistPatchiness = 0.7;
    p.startDist = 0;
    p.gain = 1;
    writeAtmosphere(p);
  }

  /** a representative fog colour for CPU consumers (scene.fog.color): the mean horizon haze */
  fogColor(out: THREE.Color): THREE.Color {
    return out.copy(this.params.ring[0]);
  }

  service(active: boolean): AtmosphereService {
    const p = this.params;
    return {
      params: p,
      transmittance: (t, yc, yp) => atmoTransmittance(p, t, yc, yp),
      distanceFor: (T, y) => atmoDistanceFor(p, T, y),
      active,
    };
  }
}
