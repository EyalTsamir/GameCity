// Photo mode (P / toolbar): the HUD steps aside, the free camera stays, and a small panel sets the picture — time of
// day, exposure, aperture, focus (or click the scene to focus there), a few looks — and saves a PNG of the frame.
// Leaving restores the clock, speed, lens, look and quality handling; the camera stays where it was framed.

import * as THREE from 'three';
import type { CityContext, PhotoLook } from '../../core/context';
import { ICONS } from './icons';
import type { CameraServiceExt } from '../shared';

interface Look {
  id: string;
  name: string;
  /** without exposure (that is the panel's own slider) */
  look: Omit<PhotoLook, 'exposure'>;
}

const NEUTRAL: Look['look'] = { saturation: 1, contrast: 0, warm: 0, vignette: 0, lift: 0, miniature: false };
const LOOKS: Look[] = [
  { id: 'natural', name: 'Natural', look: NEUTRAL },
  { id: 'golden', name: 'Golden film', look: { ...NEUTRAL, saturation: 1.06, contrast: 0.06, warm: 0.035, vignette: 0.1, lift: 0.012 } },
  { id: 'noir', name: 'Noir', look: { ...NEUTRAL, saturation: 0, contrast: 0.32, vignette: 0.22, lift: -0.002 } },
  { id: 'postcard', name: 'Postcard', look: { ...NEUTRAL, saturation: 1.28, contrast: 0.12, warm: 0.008 } },
  { id: 'miniature', name: 'Miniature', look: { ...NEUTRAL, saturation: 1.24, contrast: 0.08, miniature: true } },
];

const FOCUS_MIN = 1;
const FOCUS_MAX = 800;
const F_MIN = 0.5;
const F_MAX = 22;
const ZOOM_MAX = 8;
/** the clock eases back to where it was over this long when leaving */
const RESTORE_S = 0.9;

const logTo = (u: number, a: number, b: number) => a * Math.pow(b / a, u);
const logFrom = (v: number, a: number, b: number) => Math.log(v / a) / Math.log(b / a);

export class PhotoMode {
  active = false;
  readonly el: HTMLDivElement;
  private readonly look: PhotoLook = { exposure: 1, ...NEUTRAL };
  private lookBtns = new Map<string, HTMLButtonElement>();
  private readonly time: HTMLInputElement;
  private readonly timeVal: HTMLElement;
  private readonly expo: HTMLInputElement;
  private readonly expoVal: HTMLElement;
  private readonly zoom: HTMLInputElement;
  private readonly zoomVal: HTMLElement;
  private readonly aperture: HTMLInputElement;
  private readonly apertureVal: HTMLElement;
  private readonly focus: HTMLInputElement;
  private readonly focusVal: HTMLElement;
  private readonly focusAuto: HTMLButtonElement;
  private readonly freeze: HTMLButtonElement;
  private readonly hideBtn: HTMLButtonElement;
  private readonly flash: HTMLDivElement;
  private manualFocus: number | null = null;
  private saved: { hours: number; hold: boolean; speed: number; dof: boolean; qualityDof: boolean } | null = null;
  private restore: { from: number; to: number; t: number } | null = null;
  private readonly _p = new THREE.Vector3();
  private saving = false;

  constructor(
    private ctx: CityContext,
    private cam: () => CameraServiceExt | null,
    private root: HTMLElement,
    private toast: (msg: string) => void,
    private dofPref: () => boolean,
  ) {
    const el = document.createElement('div');
    el.className = 'th-photo th-card';
    el.setAttribute('aria-label', 'Photo mode');
    const lookHtml = LOOKS.map((l) => `<button type="button" class="th-chip" data-look="${l.id}">${l.name}</button>`).join('');
    el.innerHTML = `<div class="th-photo-body">
        <div class="th-photo-head">Photo mode<span class="th-photo-note">Drag to frame · click to focus</span></div>
        <div class="th-chips" role="radiogroup" aria-label="Look">${lookHtml}</div>
        <label class="th-photo-row"><span>Time</span><input type="range" class="th-range" data-k="time" min="0" max="24" step="0.01" aria-label="Time of day"><b data-v="time"></b></label>
        <label class="th-photo-row"><span>Exposure</span><input type="range" class="th-range" data-k="expo" min="-2" max="2" step="0.05" aria-label="Exposure"><b data-v="expo"></b></label>
        <label class="th-photo-row"><span>Zoom</span><input type="range" class="th-range" data-k="zoom" min="0" max="1" step="0.002" aria-label="Zoom"><b data-v="zoom"></b></label>
        <label class="th-photo-row"><span>Aperture</span><input type="range" class="th-range" data-k="aperture" min="0" max="1" step="0.005" aria-label="Aperture"><b data-v="aperture"></b></label>
        <label class="th-photo-row"><span>Focus</span><input type="range" class="th-range" data-k="focus" min="0" max="1" step="0.002" aria-label="Focus distance"><b data-v="focus"></b></label>
        <div class="th-photo-opts"><button type="button" class="th-chip" data-act="auto">Auto focus</button><button type="button" class="th-chip" data-act="freeze">Freeze the moment</button></div>
      </div>
      <div class="th-photo-dock">
        <button type="button" class="th-pill th-photo-save" data-act="save">${ICONS.photo}<span>Save picture</span></button>
        <button type="button" class="th-pill" data-act="hide"><span>Hide</span><span class="th-kbd">U</span></button>
        <button type="button" class="th-pill" data-act="exit"><span>Exit</span><span class="th-kbd">P</span></button>
      </div>`;
    this.el = el;
    root.appendChild(el);
    const q = <T extends Element>(s: string) => el.querySelector(s) as T;
    this.time = q('[data-k="time"]');
    this.timeVal = q('[data-v="time"]');
    this.expo = q('[data-k="expo"]');
    this.expoVal = q('[data-v="expo"]');
    this.zoom = q('[data-k="zoom"]');
    this.zoomVal = q('[data-v="zoom"]');
    this.aperture = q('[data-k="aperture"]');
    this.apertureVal = q('[data-v="aperture"]');
    this.focus = q('[data-k="focus"]');
    this.focusVal = q('[data-v="focus"]');
    this.focusAuto = q('[data-act="auto"]');
    this.freeze = q('[data-act="freeze"]');
    this.hideBtn = q('[data-act="hide"]');
    this.flash = document.createElement('div');
    this.flash.className = 'th-photo-flash';
    ctx.uiRoot.appendChild(this.flash);

    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-look]')) {
      this.lookBtns.set(b.dataset.look as string, b);
      b.addEventListener('click', () => this.setLook(b.dataset.look as string));
    }
    this.time.addEventListener('input', () => this.applyTime());
    this.expo.addEventListener('input', () => this.applyExposure());
    this.zoom.addEventListener('input', () => this.applyZoom());
    this.aperture.addEventListener('input', () => this.applyAperture());
    this.focus.addEventListener('input', () => this.applyFocus(logTo(parseFloat(this.focus.value), FOCUS_MIN, FOCUS_MAX)));
    this.focusAuto.addEventListener('click', () => this.applyFocus(null));
    this.freeze.addEventListener('click', () => this.setFrozen(ctx.clock.speed > 0));
    q<HTMLButtonElement>('[data-act="save"]').addEventListener('click', () => void this.savePicture());
    this.hideBtn.addEventListener('click', () => this.togglePanel());
    q<HTMLButtonElement>('[data-act="exit"]').addEventListener('click', () => this.exit());
    // (keys keep working: sliders and buttons give the focus back)
    for (const c of el.querySelectorAll<HTMLElement>('input,button')) c.addEventListener('pointerup', () => setTimeout(() => c.blur(), 0));
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(): void {
    if (this.active) return;
    const { ctx } = this;
    const c = this.cam();
    c?.film.stop();
    c?.film.dropPrint();
    c?.releaseAll();
    c?.setFreeOverride(true);
    this.restore = null;
    this.saved = { hours: ctx.clock.hours, hold: ctx.clock.holdTime, speed: ctx.clock.speed, dof: this.dofPref(), qualityDof: ctx.quality.dof };
    this.active = true;
    ctx.clock.holdTime = true;
    const fx = ctx.services.postfx;
    ctx.quality.dof = true;
    fx?.setEnabled('dof', true);
    fx?.holdQuality?.(true);
    this.time.value = String(ctx.clock.hours);
    this.expo.value = '0';
    this.zoom.value = '0';
    this.aperture.value = String(logFrom(2.8, F_MIN, F_MAX));
    Object.assign(this.look, NEUTRAL, { exposure: 1 });
    this.setLook('natural');
    this.applyExposure();
    this.applyZoom();
    this.applyAperture();
    this.applyFocus(null);
    this.applyTime();
    this.setFrozen(ctx.clock.speed === 0);
    this.el.classList.remove('th-away');
    this.root.classList.add('th-photoing');
    ctx.events.emit('photo', true);
  }

  exit(): void {
    if (!this.active) return;
    const { ctx } = this;
    const s = this.saved;
    this.active = false;
    this.root.classList.remove('th-photoing');
    const fx = ctx.services.postfx;
    fx?.setPhoto?.(null);
    fx?.setFocus?.(null);
    fx?.setLens?.(null);
    this.cam()?.setLens(1);
    fx?.holdQuality?.(false);
    if (s) {
      ctx.quality.dof = s.qualityDof;
      fx?.setEnabled('dof', s.dof);
      ctx.clock.speed = s.speed;
      // the clock eases back to the hour the photo session started at, then runs on
      if (Math.abs(ctx.clock.hours - s.hours) > 1e-3) this.restore = { from: ctx.clock.hours, to: s.hours, t: 0 };
      else ctx.clock.holdTime = s.hold;
    }
    this.cam()?.setFreeOverride(false);
    ctx.events.emit('photo', false);
  }

  /** U: the panel out of the way (the dock stays, so touch can bring it back) */
  togglePanel(): void {
    const away = this.el.classList.toggle('th-away');
    (this.hideBtn.querySelector('span') as HTMLElement).textContent = away ? 'Show' : 'Hide';
  }

  private setLook(id: string): void {
    const l = LOOKS.find((x) => x.id === id) ?? LOOKS[0];
    Object.assign(this.look, l.look);
    for (const [k, b] of this.lookBtns) {
      const on = k === l.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    this.ctx.services.postfx?.setPhoto?.(this.look);
  }

  private applyZoom(): void {
    const k = logTo(parseFloat(this.zoom.value), 1, ZOOM_MAX);
    this.cam()?.setLens(k);
    this.zoomVal.textContent = `${k.toFixed(1)}×`;
    this.setFill(this.zoom);
  }

  private applyTime(): void {
    const h = parseFloat(this.time.value);
    this.ctx.clock.glideHours(Math.min(23.99, h));
    this.timeVal.textContent = this.ctx.clock.label();
    this.setFill(this.time);
  }

  private applyExposure(): void {
    const ev = parseFloat(this.expo.value);
    this.look.exposure = Math.pow(2, ev);
    this.expoVal.textContent = `${ev > 0 ? '+' : ev < 0 ? '−' : ''}${Math.abs(ev).toFixed(1)} EV`;
    this.setFill(this.expo);
  }

  private applyAperture(): void {
    const n = logTo(parseFloat(this.aperture.value), F_MIN, F_MAX);
    this.ctx.services.postfx?.setLens?.(n);
    this.apertureVal.textContent = `f/${n < 10 ? n.toFixed(1) : Math.round(n)}`;
    this.setFill(this.aperture);
  }

  private applyFocus(d: number | null): void {
    this.manualFocus = d;
    this.ctx.services.postfx?.setFocus?.(d);
    this.focusAuto.classList.toggle('on', d === null);
    if (d !== null) {
      this.focus.value = String(logFrom(Math.min(FOCUS_MAX, Math.max(FOCUS_MIN, d)), FOCUS_MIN, FOCUS_MAX));
      this.focusVal.textContent = d < 10 ? `${d.toFixed(1)} m` : `${Math.round(d)} m`;
    } else this.focusVal.textContent = 'Auto';
    this.setFill(this.focus);
  }

  private setFrozen(on: boolean): void {
    const s = this.saved;
    this.ctx.clock.speed = on ? 0 : s && s.speed > 0 ? s.speed : 1;
    this.freeze.classList.toggle('on', on);
  }

  private setFill(r: HTMLInputElement): void {
    const u = (parseFloat(r.value) - parseFloat(r.min)) / (parseFloat(r.max) - parseFloat(r.min));
    r.style.setProperty('--fill', `${Math.round(u * 100)}%`);
  }

  /** a plain click on the scene: focus there */
  click(x: number, y: number): boolean {
    if (!this.active) return false;
    const c = this.cam();
    if (c?.surfacePoint(x, y, this._p)) this.applyFocus(Math.max(FOCUS_MIN, this._p.distanceTo(this.ctx.camera.position)));
    return true;
  }

  /** PNG of the current frame: drawn and read in one task, so the drawing buffer needs no preserving */
  async savePicture(): Promise<void> {
    const { ctx } = this;
    const capture = ctx.services.postfx?.capture;
    if (!capture || this.saving) return;
    this.saving = true;
    try {
      const blob = await capture('image/png');
      if (!blob) {
        this.toast('Could not save the picture in this browser');
        return;
      }
      const name = `tinyhaven-${ctx.clock.label().replace(':', '-')}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      this.flash.classList.remove('go');
      void this.flash.offsetWidth;
      this.flash.classList.add('go');
      this.toast(`Saved ${name}`);
    } finally {
      this.saving = false;
    }
  }

  frame(realDt: number): void {
    const r = this.restore;
    if (r) {
      r.t += realDt / RESTORE_S;
      const k = Math.min(1, r.t);
      this.ctx.clock.glideHours(r.from + (r.to - r.from) * k * k * (3 - 2 * k));
      if (k >= 1) {
        this.restore = null;
        this.ctx.clock.holdTime = this.saved?.hold ?? false;
      }
      return;
    }
    if (!this.active) return;
    // the panel gives way while the camera is being dragged
    const dragging = !!this.cam()?.pointer.dragging;
    if (this.el.classList.contains('th-dim') !== dragging) this.el.classList.toggle('th-dim', dragging);
  }

  dispose(): void {
    this.el.remove();
    this.flash.remove();
  }
}
