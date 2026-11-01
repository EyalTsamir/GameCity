// The opening film ("director's cut"): a scripted ~90 s camera sequence through a day in the city, played on a
// visitor's first load. Any key, click, wheel or touch hands the camera back at once, from the pose it is in.
//
//   closing  (replay only) the curtain closes, the crowd is brought back to a daytime size
//   prep     behind the curtain every shot's poses are drawn for a couple of frames: near sets, LOD levels and
//            anything lazily uploaded are ready before the first frame is seen
//   play     shots from ./filmShots.ts: splines for eye / look / lens / focus, the clock gliding through the day
//
// Who gets the film: see filmWanted(). The clock is driven with glideHours (no 'timejump': that makes the crowd
// start over and the lights snap). Adaptive quality only changes at the fades (postfx.holdQuality).
// DOM: the curtain, letterbox bars and title cards, all driven by CSS classes (see ui.css `.th-film`).

import * as THREE from 'three';
import type { CityContext, PhotoLook } from '../../core/context';
import { TAGLINE, DIORAMA } from '../../core/world';
import { CITY_NAME } from '../../core/constants';
import type { RailService } from '../../sim/rail';
import { SHOTS, TRAIN_DIR, TRAIN_STOPS_AT, type FilmShot } from './filmShots';

export const FILM_SEEN_KEY = 'tinyhaven.filmSeen';

/** query parameters that ask for a particular start (a test, a bookmark, a debug view): no film */
const NO_FILM_PARAMS = ['nofilm', 'nointro', 'time', 'speed', 'only', 'skip', 'planview', 'tour', 'seed', 'hide', 'camdebug', 'view'];

/**
 * The film plays once, on a plain visit: ?film forces it; automated browsers (every harness script), reduced-motion
 * visitors, the diorama, URLs that ask for a particular start and returning visitors skip it (the short opening glide
 * is what they get). The toolbar's film button replays it for anyone.
 */
export function filmWanted(params: URLSearchParams): boolean {
  if (params.has('film')) return true;
  if (DIORAMA || (navigator as Navigator & { webdriver?: boolean }).webdriver === true) return false;
  for (const k of NO_FILM_PARAMS) if (params.has(k)) return false;
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (localStorage.getItem(FILM_SEEN_KEY)) return false;
  } catch {
    /* storage unavailable: the film plays */
  }
  return true;
}

/** What the director needs from the camera rig (camera.ts). */
export interface FilmRig {
  /** apply a pose this frame (lens = vertical fov of the whole window in degrees, focus in metres) */
  place(eye: THREE.Vector3, look: THREE.Vector3, fov: number, focus: number): void;
  /** the orbit camera takes over from this pose; carry = velocity of the eye (m/s) */
  release(eye: THREE.Vector3, look: THREE.Vector3, carry: THREE.Vector3): void;
  /** nothing was seen yet: the camera goes back to the overview */
  releaseToOverview(): void;
  /** lowest height the eye may have at (x, z) */
  floorAt(x: number, z: number): number;
  /** a building the point is inside of (null: free) */
  lotAt(x: number, y: number, z: number): { id: number } | null;
  /** the visitor's lens: fov scaling for tall windows */
  aspect(): number;
}

const enum Phase {
  Idle,
  Closing,
  Prep,
  Play,
}

const MIN_BLACK = 2.6; // s: the title stays on black at least this long, while the prep frames run
const PREP_FRAMES = 2;
const END_CARD = 9; // s before the end
const TITLE_OUT = 8; // s into the film
/** the film's own print: a little more contrast and colour than the live city's natural grade */
const PRINT: PhotoLook = { exposure: 1, saturation: 1.08, contrast: 0.07, warm: 0.003, vignette: 0.1, lift: -0.002, miniature: false };
/** s: the print eases away after the film */
const PRINT_OUT = 1.6;
const FADE_IN = 2.4; // s: first picture out of black

function smooth(t: number): number {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/** a shot compiled to flat arrays: per key 8 values (eye xyz, look xyz, ln fov, ln focus) */
interface Track {
  shot: FilmShot;
  start: number;
  end: number;
  times: Float64Array;
  vals: Float64Array;
}

const STRIDE = 8;

function compile(shot: FilmShot, start: number): Track {
  const n = shot.keys.length;
  const times = new Float64Array(n);
  const vals = new Float64Array(n * STRIDE);
  shot.keys.forEach((k, i) => {
    times[i] = k.at;
    const o = i * STRIDE;
    vals[o] = k.eye[0];
    vals[o + 1] = k.eye[1];
    vals[o + 2] = k.eye[2];
    vals[o + 3] = k.look[0];
    vals[o + 4] = k.look[1];
    vals[o + 5] = k.look[2];
    vals[o + 6] = Math.log(k.fov);
    const d = k.focus ?? Math.hypot(k.eye[0] - k.look[0], k.eye[1] - k.look[1], k.eye[2] - k.look[2]);
    vals[o + 7] = Math.log(Math.max(0.5, d));
  });
  return { shot, start, end: start + shot.dur, times, vals };
}

/** non-uniform Catmull-Rom through a track's keys at shot time s → out (STRIDE values) */
function evalTrack(tr: Track, s: number, out: Float64Array): void {
  const { times, vals, shot } = tr;
  const n = times.length;
  if (s <= times[0]) s = times[0];
  if (s >= times[n - 1]) s = times[n - 1];
  let i = 0;
  while (i < n - 2 && s > times[i + 1]) i++;
  const t0 = times[i],
    t1 = times[i + 1];
  const h = t1 - t0;
  const u = h > 0 ? (s - t0) / h : 0;
  const u2 = u * u,
    u3 = u2 * u;
  const a = 2 * u3 - 3 * u2 + 1,
    b = u3 - 2 * u2 + u,
    c = -2 * u3 + 3 * u2,
    d = u3 - u2;
  const prev = Math.max(0, i - 1),
    next = Math.min(n - 1, i + 2);
  const tp = times[prev],
    tn = times[next];
  const atEnd = shot.settle === true && i + 2 >= n;
  for (let k = 0; k < STRIDE; k++) {
    const p0 = vals[i * STRIDE + k],
      p1 = vals[(i + 1) * STRIDE + k];
    const m0 = ((p1 - vals[prev * STRIDE + k]) / Math.max(1e-3, t1 - tp)) * h;
    const m1 = atEnd ? 0 : ((vals[next * STRIDE + k] - p0) / Math.max(1e-3, tn - t0)) * h;
    out[k] = a * p0 + b * m0 + c * p1 + d * m1;
  }
}

export class FilmDirector {
  readonly total: number;
  private readonly tracks: Track[];
  private phase: Phase = Phase.Idle;
  /** the window is being given back */
  leaving = false;
  private t = 0;
  private cur = 0;
  private wait = 0;
  private prepPoses: number[][] = [];
  private prepI = 0;
  private prepFrames = 0;
  private readonly prepDt = new Float32Array(64);
  private prepN = 0;
  private readonly val = new Float64Array(STRIDE);
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly prevEye = new THREE.Vector3();
  private readonly carry = new THREE.Vector3();
  private lastLens = -1;
  private held = false;
  private curtainA = 1;
  private capShown = -1;
  private capUntil = 0;
  private cueTitleOut = false;
  private cueHintIn = false;
  private cueHintOut = false;
  private cueEnd = false;
  private speedBefore = 1;
  private readonly print: PhotoLook = { ...PRINT };
  private printFade = 0;
  private readonly root: HTMLDivElement;
  private readonly curtain: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly endCard: HTMLDivElement;
  /** the film ended by itself (no input): the camera module may start the auto-tour */
  onFinished: (() => void) | null = null;

  constructor(
    private ctx: CityContext,
    private rig: FilmRig,
  ) {
    let start = 0;
    this.tracks = SHOTS.map((s) => {
      const tr = compile(s, start);
      start = tr.end;
      return tr;
    });
    this.total = start;
    const root = document.createElement('div');
    root.className = 'th-film';
    root.innerHTML = `<div class="th-film-bar th-film-top"></div><div class="th-film-bar th-film-bottom"></div>
      <div class="th-film-curtain"></div>
      <div class="th-film-title"><div class="th-film-name">${CITY_NAME}</div><div class="th-film-rule"></div><div class="th-film-tag">${TAGLINE}</div></div>
      <div class="th-film-caption"></div>
      <div class="th-film-end"><div class="th-film-name">${CITY_NAME}</div><div class="th-film-rule"></div><div class="th-film-tag">Every building, person and sunset here is generated by code.</div><div class="th-film-sub">No models, no textures, no photographs.</div></div>
      <div class="th-film-hint">Click, touch or press any key to take the camera</div>`;
    this.root = root;
    this.curtain = root.querySelector('.th-film-curtain') as HTMLDivElement;
    this.title = root.querySelector('.th-film-title') as HTMLDivElement;
    this.caption = root.querySelector('.th-film-caption') as HTMLDivElement;
    this.hint = root.querySelector('.th-film-hint') as HTMLDivElement;
    this.endCard = root.querySelector('.th-film-end') as HTMLDivElement;
    ctx.uiRoot.appendChild(root);
    this.layout();
  }

  get active(): boolean {
    return this.phase !== Phase.Idle;
  }
  /** film seconds (0 before the first picture) */
  get time(): number {
    return this.phase === Phase.Play ? this.t : 0;
  }
  get playing(): boolean {
    return this.phase === Phase.Play;
  }
  get shotId(): string {
    return this.phase === Phase.Play ? this.tracks[this.cur].shot.id : '';
  }

  /** letterbox on wide windows only (phones held upright keep the full height); the bars are not rendered at all */
  layout(): void {
    const w = window.innerWidth,
      h = window.innerHeight;
    const bar = w / Math.max(1, h) > 1.45 ? Math.round(Math.max(0, (h - w / 2.39) / 2)) : 0;
    this.root.style.setProperty('--film-bar', `${bar}px`);
    if (this.phase !== Phase.Idle) this.ctx.cropView?.(bar > 0 ? h - 2 * bar : 0);
  }

  /** first load: the curtain is already closed; `closing` = a replay, close it over what is on screen first */
  play(closing: boolean): void {
    if (this.phase !== Phase.Idle) return;
    const { ctx } = this;
    try {
      localStorage.setItem(FILM_SEEN_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    this.speedBefore = ctx.clock.speed > 0 ? ctx.clock.speed : 1;
    ctx.clock.speed = 1;
    ctx.clock.holdTime = true;
    (ctx.services.sky as { setWeather?(v: number): void } | undefined)?.setWeather?.(0);
    Object.assign(this.print, PRINT);
    this.printFade = 0;
    ctx.services.postfx?.setPhoto?.(this.print);
    this.setHold(true);
    this.root.classList.remove('th-film-done');
    this.root.classList.add('th-film-on');
    this.title.classList.remove('show');
    this.endCard.classList.remove('show');
    this.caption.classList.remove('show');
    this.hint.classList.remove('show');
    this.curtain.classList.remove('th-film-instant');
    this.cueTitleOut = this.cueHintIn = this.cueHintOut = this.cueEnd = false;
    this.capShown = -1;
    this.lastLens = -1;
    ctx.events.emit('film', true);
    if (closing) {
      this.setCurtain(1);
      this.phase = Phase.Closing;
      this.wait = 0.7;
    } else {
      this.curtain.classList.add('th-film-instant');
      this.setCurtain(1);
      this.beginPrep();
      this.layout();
    }
  }

  private beginPrep(): void {
    const { ctx } = this;
    this.curtain.classList.add('th-film-instant');
    this.phase = Phase.Prep;
    this.t = 0;
    this.wait = MIN_BLACK;
    this.prepI = 0;
    this.prepFrames = 0;
    this.prepPoses = [];
    this.prepN = 0;
    for (const tr of this.tracks) {
      const n = tr.shot.keys.length;
      for (const i of n > 2 ? [0, Math.floor(n / 2), n - 1] : [0, n - 1]) {
        const k = tr.shot.keys[i];
        this.prepPoses.push([k.eye[0], k.eye[1], k.eye[2], k.look[0], k.look[1], k.look[2], k.fov]);
      }
    }
    ctx.clock.glideHours(SHOTS[0].hours[0]);
    this.title.classList.add('show');
  }

  /** hand the camera back. natural = the film reached its end */
  stop(natural = false): void {
    if (this.phase === Phase.Idle) return;
    const { ctx } = this;
    const seen = this.phase === Phase.Play;
    this.phase = Phase.Idle;
    // (the camera module's resize leaves the pose alone meanwhile)
    this.leaving = true;
    ctx.cropView?.(0);
    this.leaving = false;
    ctx.frameCap = 0;
    ctx.clock.holdTime = false;
    ctx.clock.speed = this.speedBefore;
    this.setHold(false, false);
    const fx = ctx.services.postfx;
    fx?.setFocus?.(null);
    fx?.setLens?.(null);
    this.printFade = PRINT_OUT;
    if (seen) this.rig.release(this.eye, this.look, this.carry);
    else this.rig.releaseToOverview();
    this.curtain.classList.remove('th-film-instant');
    this.curtainA = 0;
    this.curtain.style.opacity = '0';
    this.root.classList.remove('th-film-on');
    this.root.classList.add('th-film-done');
    this.title.classList.remove('show');
    this.caption.classList.remove('show');
    this.hint.classList.remove('show');
    if (!natural) this.endCard.classList.remove('show');
    setTimeout(() => this.endCard.classList.remove('show'), natural ? 5000 : 0);
    ctx.events.emit('film', false);
    if (natural) this.onFinished?.();
  }

  private setHold(on: boolean, stepDown = false): void {
    if (this.held === on) return;
    this.held = on;
    this.ctx.services.postfx?.holdQuality?.(on, stepDown);
  }

  private setCurtain(a: number): void {
    if (Math.abs(a - this.curtainA) < 0.004 && a !== 0 && a !== 1) return;
    if (a === this.curtainA) return;
    this.curtainA = a;
    this.curtain.style.opacity = a.toFixed(3);
  }

  /** debug / storyboard: jump within the film (the clock follows, the simulations do not) */
  seek(t: number): void {
    if (this.phase === Phase.Idle) this.play(false);
    if (this.phase === Phase.Prep || this.phase === Phase.Closing) this.startPlay();
    this.t = Math.max(0, Math.min(this.total - 0.01, t));
    this.cur = 0;
    this.cueTitleOut = this.t > TITLE_OUT;
    if (this.cueTitleOut) this.title.classList.remove('show');
    this.pose();
  }

  private startPlay(): void {
    this.phase = Phase.Play;
    this.t = 0;
    this.cur = 0;
    this.curtain.classList.remove('th-film-instant');
    this.setCadence();
    // the regional that pulls in during the platform shot (a running train is cleared while nobody can see the line)
    (this.ctx.services.rail as RailService | undefined)?.sim?.bookArrival(TRAIN_STOPS_AT, TRAIN_DIR);
    this.pose();
    this.prevEye.copy(this.eye);
  }

  /**
   * What the curtain frames measured: the starting quality step, and the cadence. A machine that cannot hold 60 fps gets
   * an even 30 (33 / 50 ms alternation reads as stutter in a slow camera move). ?filmfps=30|60 forces it.
   */
  private setCadence(): void {
    const { ctx } = this;
    const n = this.prepN;
    const d = this.prepDt.subarray(0, n).sort();
    const ms = n > 0 ? d[n >> 1] * 1000 : 16;
    ctx.services.postfx?.startQuality?.(ms);
    const forced = Number(ctx.debug.params.get('filmfps'));
    ctx.frameCap = forced > 0 ? (forced >= 60 ? 0 : forced) : ms > 20 ? 30 : 0;
  }

  /** hours at film time t: each shot's range, gliding across the dip between two shots */
  private hoursAt(t: number): number {
    const trs = this.tracks;
    let i = this.cur;
    while (i < trs.length - 1 && t >= trs[i].end) i++;
    while (i > 0 && t < trs[i].start) i--;
    const tr = trs[i];
    const next = trs[i + 1];
    const half = tr.shot.dip / 2;
    // the opening half of this shot's dip: arriving from the previous shot's last hour
    if (i > 0 && half > 0 && t < tr.start + half) {
      const prev = trs[i - 1];
      const a = prev.shot.hours[1];
      const b = tr.shot.hours[0] + ((tr.shot.hours[1] - tr.shot.hours[0]) * half) / tr.shot.dur;
      return a + (b - a) * smooth((t - (tr.start - half)) / (2 * half));
    }
    if (next && next.shot.dip > 0 && t > tr.end - next.shot.dip / 2) {
      const h2 = next.shot.dip / 2;
      const a = tr.shot.hours[0] + ((tr.shot.hours[1] - tr.shot.hours[0]) * (tr.shot.dur - h2)) / tr.shot.dur;
      const b = next.shot.hours[0] + ((next.shot.hours[1] - next.shot.hours[0]) * h2) / next.shot.dur;
      return a + (b - a) * smooth((t - (tr.end - h2)) / (2 * h2));
    }
    return tr.shot.hours[0] + ((tr.shot.hours[1] - tr.shot.hours[0]) * (t - tr.start)) / tr.shot.dur;
  }

  private pose(): void {
    const trs = this.tracks;
    while (this.cur < trs.length - 1 && this.t >= trs[this.cur].end) this.cur++;
    const tr = trs[this.cur];
    const s = this.t - tr.start;
    const v = this.val;
    evalTrack(tr, s, v);
    const focus = Math.exp(v[7]);
    this.eye.set(v[0], v[1], v[2]);
    this.look.set(v[3], v[4], v[5]);
    const floor = this.rig.floorAt(this.eye.x, this.eye.z);
    if (this.eye.y < floor) this.eye.y = floor;
    let fov = Math.exp(v[6]);
    // tall windows (phones held upright): widen the lens instead of cropping the sides away
    const aspect = this.rig.aspect();
    if (aspect < 1.5) fov = Math.min(80, (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * Math.pow(1.5 / aspect, 0.72)) * 180) / Math.PI);
    this.rig.place(this.eye, this.look, fov, focus);
    const lens = tr.shot.lens ?? 1.6;
    if (lens !== this.lastLens) {
      this.lastLens = lens;
      this.ctx.services.postfx?.setLens?.(lens);
    }
    this.ctx.clock.glideHours(this.hoursAt(this.t));
    // fades through black
    let a = 0;
    if (this.t < FADE_IN) a = 1 - smooth(this.t / FADE_IN);
    const half = tr.shot.dip / 2;
    if (half > 0 && s < half) a = Math.max(a, 1 - smooth(s / half));
    const next = trs[this.cur + 1];
    if (next && next.shot.dip > 0) {
      const h2 = next.shot.dip / 2;
      if (tr.end - this.t < h2) a = Math.max(a, smooth(1 - (tr.end - this.t) / h2));
    }
    this.setCurtain(a);
    // quality may only step while the picture is black
    this.setHold(a < 0.95, true);
  }

  private cues(): void {
    const t = this.t;
    if (!this.cueTitleOut && t > TITLE_OUT) {
      this.cueTitleOut = true;
      this.title.classList.remove('show');
    }
    if (!this.cueHintIn && t > 3.5) {
      this.cueHintIn = true;
      this.hint.classList.add('show');
    }
    if (!this.cueHintOut && t > 11) {
      this.cueHintOut = true;
      this.hint.classList.remove('show');
    }
    if (!this.cueEnd && t > this.total - END_CARD) {
      this.cueEnd = true;
      this.endCard.classList.add('show');
    }
    if (this.cur !== this.capShown) {
      this.capShown = this.cur;
      const tr = this.tracks[this.cur];
      this.caption.classList.remove('show');
      this.capUntil = 0;
      if (tr.shot.caption) {
        this.caption.textContent = tr.shot.caption;
        this.capUntil = tr.start + Math.min(6.5, tr.shot.dur - 1.5);
        this.caption.classList.add('show');
      }
    } else if (this.capUntil > 0 && t > this.capUntil) {
      this.capUntil = 0;
      this.caption.classList.remove('show');
    }
  }

  frame(dt: number): void {
    switch (this.phase) {
      case Phase.Closing:
        this.wait -= dt;
        if (this.wait <= 0) {
          // (a replay at night: the warm-started crowd of a morning; the glide then takes it to dawn)
          const h = this.ctx.clock.hours;
          if (h < 9 || h > 20) this.ctx.clock.setHours(10);
          this.beginPrep();
          this.layout();
        }
        return;
      case Phase.Prep: {
        this.wait -= dt;
        const p = this.prepPoses[this.prepI];
        if (p) {
          // (the first frames also upload and settle; the rest measure what the film will cost)
          if (this.prepI > 1 && this.prepN < this.prepDt.length) this.prepDt[this.prepN++] = dt;
          this.eye.set(p[0], p[1], p[2]);
          this.look.set(p[3], p[4], p[5]);
          this.rig.place(this.eye, this.look, p[6], 300);
          if (++this.prepFrames >= PREP_FRAMES) {
            this.prepFrames = 0;
            this.prepI++;
          }
          return;
        }
        if (this.wait <= 0) this.startPlay();
        else {
          this.eye.set(this.tracks[0].vals[0], this.tracks[0].vals[1], this.tracks[0].vals[2]);
          this.look.set(this.tracks[0].vals[3], this.tracks[0].vals[4], this.tracks[0].vals[5]);
          this.rig.place(this.eye, this.look, Math.exp(this.tracks[0].vals[6]), 300);
        }
        return;
      }
      case Phase.Play: {
        this.t += dt;
        this.prevEye.copy(this.eye);
        if (this.t >= this.total) {
          this.t = this.total;
          this.pose();
          this.carry.set(0, 0, 0);
          this.stop(true);
          return;
        }
        this.pose();
        if (dt > 0) this.carry.subVectors(this.eye, this.prevEye).divideScalar(dt);
        this.cues();
        return;
      }
      default:
        return;
    }
  }

  /** while no film plays: the print's last moments (photo mode takes the same slot and simply replaces it) */
  idle(dt: number): void {
    if (this.printFade <= 0) return;
    this.printFade -= dt;
    const fx = this.ctx.services.postfx;
    if (this.printFade <= 0) {
      fx?.setPhoto?.(null);
      return;
    }
    const k = this.printFade / PRINT_OUT;
    const p = this.print;
    p.saturation = 1 + (PRINT.saturation - 1) * k;
    p.contrast = PRINT.contrast * k;
    p.warm = PRINT.warm * k;
    p.vignette = PRINT.vignette * k;
    p.lift = PRINT.lift * k;
  }

  /** photo mode took over the picture settings: nothing left to ease */
  dropPrint(): void {
    this.printFade = 0;
  }

  /** eye positions inside buildings or below the ground along the whole film (tests) */
  check(step = 0.1): string[] {
    const out: string[] = [];
    const v = this.val;
    for (const tr of this.tracks) {
      for (let s = 0; s <= tr.shot.dur; s += step) {
        evalTrack(tr, s, v);
        const lot = this.rig.lotAt(v[0], v[1], v[2]);
        if (lot) out.push(`${tr.shot.id} +${s.toFixed(1)} s: eye inside lot ${lot.id} (${v[0].toFixed(1)}, ${v[1].toFixed(1)}, ${v[2].toFixed(1)})`);
        const f = this.rig.floorAt(v[0], v[2]);
        if (v[1] < f) out.push(`${tr.shot.id} +${s.toFixed(1)} s: eye below the floor (${v[1].toFixed(2)} < ${f.toFixed(2)})`);
      }
    }
    return out;
  }

  dispose(): void {
    this.root.remove();
  }
}
