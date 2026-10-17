// World clock: compressed day/night cycle + sun & moon directions.
// One in-game hour lasts SECONDS_PER_GAME_HOUR real seconds at 1x speed.
// `speed` scales both the clock and every simulation (0 = paused).

import * as THREE from 'three';
import { SECONDS_PER_GAME_HOUR } from './constants';
import { smoothstep } from './geom';
import type { EventBus } from './events';

export const SUNRISE = 6.0;
export const SUNSET = 19.5;

export class WorldClock {
  /** hour of day, [0, 24) */
  hours: number;
  day = 1;
  /** simulation speed multiplier (0 = paused, 1 = normal, up to 8) */
  speed = 1;
  /** game-hours per real second at speed 1 */
  rate = 1 / SECONDS_PER_GAME_HOUR;
  /** freeze the time of day while still simulating (UI toggle) */
  holdTime = false;
  /** unscaled seconds since start */
  realTime = 0;
  /** scaled simulation seconds since start */
  simTime = 0;

  /** unit vector from the world towards the sun / moon */
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly moonDir = new THREE.Vector3(0, 1, 0);
  /** sin(sun elevation) */
  sunHeight = 1;
  /** 0 (night) .. 1 (full daylight) */
  daylight = 1;
  /** 0 (day) .. 1 (deep night): drives lit windows, streetlights, headlights */
  night = 0;
  /** 0..1 bump around sunrise/sunset: warm tints, long shadows */
  dusk = 0;
  /** streetlights & lit windows (with hysteresis) */
  lightsOn = false;

  private events: EventBus | null = null;
  private lastHour = -1;

  constructor(startHours = 16.25) {
    this.hours = startHours;
    this.recompute();
  }

  attach(events: EventBus): void {
    this.events = events;
  }

  /** Advance with a real frame delta; returns the scaled sim delta for this frame. */
  update(realDt: number): number {
    this.realTime += realDt;
    const simDt = realDt * this.speed;
    this.simTime += simDt;
    if (!this.holdTime && simDt > 0) {
      this.hours += simDt * this.rate;
      while (this.hours >= 24) {
        this.hours -= 24;
        this.day++;
        this.events?.emit('day', this.day);
      }
    }
    this.recompute();
    return simDt;
  }

  setHours(h: number): void {
    this.hours = ((h % 24) + 24) % 24;
    this.recompute();
    this.events?.emit('timejump', this.hours);
  }

  /** "HH:MM" */
  label(): string {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private recompute(): void {
    const h = this.hours;
    // Sun: rises in the east (+X), culminates in the south (+Z), sets in the west (-X).
    const dayLen = SUNSET - SUNRISE;
    const theta = ((h - SUNRISE) / dayLen) * Math.PI; // 0 at sunrise, PI at sunset
    const maxEl = THREE.MathUtils.degToRad(58);
    const el = Math.sin(theta) * maxEl; // negative at night
    const az = theta + 0.18; // slight skew so noon shadows aren't perfectly axis-aligned
    this.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    // Moon: roughly opposite, a little higher so night scenes keep some modelling
    const mTheta = theta + Math.PI;
    const mEl = Math.max(Math.sin(mTheta), 0.25) * THREE.MathUtils.degToRad(48);
    this.moonDir.set(Math.cos(mTheta + 0.6) * Math.cos(mEl), Math.sin(mEl), Math.sin(mTheta + 0.6) * Math.cos(mEl) + 0.3).normalize();

    this.sunHeight = Math.sin(el);
    this.daylight = smoothstep(-0.12, 0.22, this.sunHeight);
    this.night = 1 - smoothstep(-0.2, 0.06, this.sunHeight);
    this.dusk = Math.exp(-(((this.sunHeight - 0.04) / 0.16) ** 2));
    const wasOn = this.lightsOn;
    if (!this.lightsOn && this.sunHeight < 0.05) this.lightsOn = true;
    else if (this.lightsOn && this.sunHeight > 0.09) this.lightsOn = false;
    if (wasOn !== this.lightsOn) this.events?.emit('lights', this.lightsOn);
    const hr = Math.floor(h);
    if (hr !== this.lastHour) {
      this.lastHour = hr;
      this.events?.emit('hour', hr);
    }
  }
}
