// Drives the world atmosphere (render/atmosphere.ts) from the sky state every frame:
// haze / mist densities from the palette, in-scatter colours from the dome's own horizon (so the
// fog at infinity IS the sky at the horizon), the sun lobe, mist drift with the wind.
// No allocations per frame.

import * as THREE from 'three';
import type { SkyState } from './palette';
import { createAtmosphereParams, fitRing, writeAtmosphere, atmoDistanceFor, atmoTransmittance, type AtmosphereParams } from '../atmosphere';
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

const _c = new THREE.Color();
const _g = new THREE.Color();

function grey(c: THREE.Color, k: number): void {
  const g = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  c.r += (g * 0.92 - c.r) * k;
  c.g += (g * 0.96 - c.g) * k;
  c.b += (g * 1.02 - c.b) * k;
}

export class AtmosphereDriver {
  readonly params: AtmosphereParams = createAtmosphereParams();
  /** multiplier on the haze (?atmo=k) */
  hazeK = 1;
  mistOn = true;
  private drift = new THREE.Vector2();
  private sd = new THREE.Vector3();
  private state: SkyState | null = null;
  private overcast = 0;
  private band0 = 1;

  constructor() {
    this.params.waterY = WATER_LEVEL;
  }

  /**
   * dome horizon colour (y = 0) at azimuth φ from the sun — the CPU twin of dome.ts above the
   * horizon without the narrow sun term (that one is the lobe), overcast greying included
   */
  private horizonAt = (phi: number, out: THREE.Color): void => {
    const s = this.state!;
    const az = Math.cos(phi) * 0.5 + 0.5;
    out.copy(s.horizon).add(_g.copy(s.glow).multiplyScalar(s.glowI * az * az * az * 0.85 * this.band0));
    if (this.overcast > 0) grey(out, this.overcast * 0.75);
  };

  update(state: SkyState, sunDir: THREE.Vector3, sunVis: number, overcast: number, wind: THREE.Vector2, dt: number): void {
    const p = this.params;
    this.state = state;
    this.overcast = overcast;
    // the dome's horizon glow band at y = 0 (dome.ts: exp(-|y - max(sd.y,0)·0.35|·5))
    this.sd.set(sunDir.x, Math.max(sunDir.y, -0.25), sunDir.z).normalize();
    this.band0 = Math.exp(-Math.abs(Math.max(this.sd.y, 0) * 0.35) * 5);
    fitRing(p.ring, this.horizonAt);

    p.sunDir.copy(this.sd);
    // the dome's narrow glow toward the sun (pow 24, 0.6·band at the horizon) continues below it as
    // the fog's sun lobe; plus a little bright forward-scattering haze around the sun by day
    p.lobeExp = 18;
    p.lobeColor.copy(state.glow).multiplyScalar(state.glowI * 0.6 * this.band0);
    p.lobeColor.add(_c.copy(state.sun).multiplyScalar(0.07 * sunVis));
    if (overcast > 0) {
      grey(p.lobeColor, overcast * 0.75);
      p.lobeColor.multiplyScalar(1 - overcast * 0.6);
    }

    // rays looking up see the sky a little above the horizon band
    p.up.copy(state.horizon).lerp(state.zenith, 0.35);
    if (overcast > 0) grey(p.up, overcast * 0.75);
    p.upBlend = 0.3;

    // densities: palette × weather × URL multiplier
    p.haze = state.haze * (1 + overcast * 2.2) * this.hazeK;
    p.hazeScaleHeight = 1200;
    p.desat = 0.38;

    // ground mist: denser in calm air, colour = lit haze (dawn rose / dusk lilac), drifts downwind
    const ws = Math.hypot(wind.x, wind.y);
    const calm = 1 / (1 + ws * 1.2);
    p.mist = this.mistOn ? state.mist * calm * (1 + overcast * 0.5) : 0;
    p.mistScaleHeight = state.mistH;
    p.mistColor.copy(p.ring[0]).lerp(_c.copy(state.hemiSky).multiplyScalar(state.hemiI * 1.1), 0.35);
    p.mistForward = 0.8;
    // patches drift with the wind (sim seconds; offset wraps far beyond the noise period)
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
