// Module "ui": the HTML overlay — title & live clock, toolbar (pause / speed / time of day /
// tilt-shift / tour / sound / labels / places / quality / help), follow info card, hover
// tooltips, floating district labels, minimap, tour captions, toasts, help & first-run hint,
// FPS meter. Registers ctx.services.ui = { toast }.

import './ui.css';
import * as THREE from 'three';
import type { CityContext, CityModule, PickHit, QualityLevel, QualityState } from '../core/context';
import { CITY_NAME } from '../core/constants';
import { ICONS, SKY_DIAL, type IconName } from './hud/icons';
import { Minimap, type LiveDot } from './hud/minimap';
import { DistrictLabels, type ScreenRect } from './hud/labels';
import { cameraExt, audioExt, type TourShotInfo } from './shared';

type QualityMode = 'auto' | QualityLevel;

const SPEEDS = [1, 2, 4, 8];

const PRESETS: Record<QualityLevel, Omit<QualityState, 'renderScale'>> = (() => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return {
    low: { level: 'low', pixelRatio: Math.min(dpr, 1), shadows: true, shadowMapSize: 1024, ao: false, dof: false, bloom: true, density: 0.5 },
    medium: { level: 'medium', pixelRatio: Math.min(dpr, 1.25), shadows: true, shadowMapSize: 2048, ao: false, dof: true, bloom: true, density: 0.8 },
    high: { level: 'high', pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowMapSize: 2048, ao: true, dof: true, bloom: true, density: 1 },
  };
})();

const POI_NOTES: Record<string, string> = {
  overview: 'The whole model',
  downtown: 'Towers & the TV mast',
  harbor: 'Cranes, containers, ships',
  beach: 'Ferris wheel & parasols',
  park: 'Pond & bandstand',
  oldtown: 'Gables & church square',
  station: 'Trains & the hills',
  riverside: 'Footbridges & picnics',
  stadium: 'Floodlights & stalls',
  westbrook: 'Quiet suburban streets',
  industry: 'Chimneys & warehouses',
};

const KIND_WORD: Record<PickHit['kind'], string> = {
  vehicle: 'Following · car',
  bus: 'Following · bus',
  pedestrian: 'Following · resident',
  train: 'Following · train',
  boat: 'Following · boat',
  building: 'Viewing · building',
  landmark: 'Viewing · landmark',
  other: 'Following',
};

function partOfDay(h: number): string {
  if (h < 4.5) return 'small hours';
  if (h < 6.5) return 'dawn';
  if (h < 11) return 'morning';
  if (h < 13.5) return 'midday';
  if (h < 17) return 'afternoon';
  if (h < 19) return 'golden hour';
  if (h < 21) return 'evening';
  return 'night';
}

function fmtHours(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`tinyhaven.${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, v: unknown): void {
  try {
    localStorage.setItem(`tinyhaven.${key}`, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export default function create(ctx: CityContext): CityModule {
  const { clock, plan, events } = ctx;
  const cam = () => cameraExt(ctx.services);
  const audio = () => audioExt(ctx.services);
  const automated = typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver === true;

  const root = el('div', 'th-ui');
  root.setAttribute('aria-label', `${CITY_NAME} controls`);
  ctx.uiRoot.appendChild(root);

  // ───────────────────────────────────────── layers (back to front)
  const labels = new DistrictLabels(ctx, cam);
  root.appendChild(labels.el);

  const caption = el('div', 'th-caption', '<div class="th-cap-kicker">Auto-tour</div><div class="th-cap-title"></div><div class="th-cap-sub"></div>');
  root.appendChild(caption);

  const tooltip = el('div', 'th-tooltip');
  root.appendChild(tooltip);

  // title + clock
  const title = el(
    'header',
    'th-title th-card',
    `<div class="th-brand"><div class="th-name">${CITY_NAME.slice(0, 4)}<b>${CITY_NAME.slice(4)}</b></div><div class="th-tag">A living miniature city</div></div>
     <div class="th-sep"></div>
     <div class="th-clock">${SKY_DIAL}<div class="th-clock-text"><div class="th-time">--:--</div><div class="th-day">Day 1</div></div></div>`,
  );
  root.appendChild(title);
  const timeEl = title.querySelector('.th-time') as HTMLDivElement;
  const dayEl = title.querySelector('.th-day') as HTMLDivElement;
  const dial = title.querySelector('.th-dial') as SVGSVGElement;
  const dialBody = title.querySelector('.th-dial-body') as SVGGElement;

  // info card
  const info = el(
    'aside',
    'th-info th-card',
    `<div class="th-info-head"><div class="th-info-icon"></div><div class="th-info-title"><div class="th-info-kicker"></div><div class="th-info-label"></div></div>
      <button class="th-btn th-info-close" type="button" data-tip="Stop following (Esc)">${ICONS.close}</button></div>
     <div class="th-info-lines"></div>
     <div class="th-info-actions"><button class="th-pill th-chase" type="button">${ICONS.chase}<span>Chase cam</span><span class="th-kbd">C</span></button>
      <button class="th-pill th-unfollow" type="button">${ICONS.stop}<span>Stop</span><span class="th-kbd">Esc</span></button></div>`,
  );
  root.appendChild(info);
  const infoIcon = info.querySelector('.th-info-icon') as HTMLDivElement;
  const infoKicker = info.querySelector('.th-info-kicker') as HTMLDivElement;
  const infoLabel = info.querySelector('.th-info-label') as HTMLDivElement;
  const infoLines = info.querySelector('.th-info-lines') as HTMLDivElement;
  const chaseBtn = info.querySelector('.th-chase') as HTMLButtonElement;

  // toasts
  const toasts = el('div', 'th-toasts');
  root.appendChild(toasts);
  const toast = (msg: string) => {
    const t = el('div', 'th-toast');
    t.textContent = msg;
    toasts.appendChild(t);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), 3300);
  };

  // first-run hint
  const hint = el(
    'div',
    'th-hint',
    `<span><em>Drag</em> to rotate</span><i class="dot"></i><span><em>Right-drag</em> to pan</span><i class="dot"></i><span><em>Scroll</em> to zoom</span><i class="dot"></i><span><em>Click</em> anything that moves to follow it</span>`,
  );
  root.appendChild(hint);

  // minimap
  const minimap = new Minimap(ctx, cam, 210);
  root.appendChild(minimap.el);

  // toolbar
  const tb = el('nav', 'th-toolbar th-card');
  tb.setAttribute('aria-label', 'Simulation controls');
  root.appendChild(tb);
  const btn = (icon: IconName | '', tip: string, cls = '') => {
    const b = el('button', `th-btn ${cls}`, icon ? ICONS[icon] : '');
    b.type = 'button';
    b.dataset.tip = tip;
    b.setAttribute('aria-label', tip.replace(/\s*\(.*\)$/, ''));
    return b;
  };
  const g1 = el('div', 'th-group');
  const playBtn = btn('pause', 'Pause (Space)', 'th-play');
  const seg = el('div', 'th-seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Simulation speed');
  const speedBtns = SPEEDS.map((s) => {
    const b = el('button', '', `${s}×`);
    b.type = 'button';
    b.dataset.speed = String(s);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `${s} times speed`);
    seg.appendChild(b);
    return b;
  });
  g1.append(playBtn, seg);

  const g2 = el('div', 'th-group th-timegroup');
  const slider = el('input', 'th-range th-time-slider') as HTMLInputElement;
  slider.type = 'range';
  slider.min = '0';
  slider.max = '24';
  slider.step = '0.01';
  slider.setAttribute('aria-label', 'Time of day');
  const timeLabel = el('span', 'th-time-label', 'Time');
  const scrub = el('div', 'th-scrub');
  g2.append(timeLabel, slider, scrub);

  const g3 = el('div', 'th-group');
  const dofBtn = btn('tiltshift', 'Tilt-shift focus (B)');
  const tourBtn = btn('tour', 'Auto-tour (T)');
  const weatherBtn = btn('weatherAuto', 'Weather: automatic');
  const soundBtn = btn('soundOff', 'Sound');
  const volWrap = el('div', 'th-vol-wrap');
  const vol = el('input', 'th-range th-vol') as HTMLInputElement;
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.01';
  vol.setAttribute('aria-label', 'Volume');
  volWrap.appendChild(vol);
  const labelsBtn = btn('labels', 'District labels (L)');
  const placesBtn = btn('places', 'Places (P)');
  const mapBtn = btn('map', 'Minimap (M)');
  const qualityBtn = btn('quality', 'Quality');
  const helpBtn = btn('help', 'Controls & help (H)');
  g3.append(dofBtn, tourBtn, weatherBtn, soundBtn, volWrap, labelsBtn, placesBtn, mapBtn, qualityBtn, helpBtn);
  tb.append(g1, el('div', 'th-divider'), g2, el('div', 'th-divider'), g3);

  // menus
  const placesMenu = el('div', 'th-menu th-card');
  placesMenu.innerHTML = '<h4>Places</h4>';
  const others = plan.pois.filter((p) => p.id !== 'overview');
  const poiKey = (id: string): string => {
    if (id === 'overview') return '0';
    const i = others.findIndex((p) => p.id === id);
    return i >= 0 && i < 9 ? String(i + 1) : '';
  };
  const poiOrder = [...plan.pois].sort((a, b) => (a.id === 'overview' ? -1 : b.id === 'overview' ? 1 : 0));
  for (const p of poiOrder) {
    const b = el('button', '');
    b.type = 'button';
    const key = poiKey(p.id);
    b.innerHTML = `<span class="th-kbd">${key || '·'}</span><span class="th-mtext"><span class="th-mname"></span><span class="th-mnote"></span></span>`;
    (b.querySelector('.th-mname') as HTMLElement).textContent = p.name;
    (b.querySelector('.th-mnote') as HTMLElement).textContent = POI_NOTES[p.id] ?? '';
    b.addEventListener('click', () => {
      cam()?.flyToPoi(p.id);
      closeMenus();
    });
    placesMenu.appendChild(b);
  }
  root.appendChild(placesMenu);

  const qualityMenu = el('div', 'th-menu th-card');
  qualityMenu.innerHTML = '<h4>Quality</h4>';
  const qualityItems: Record<QualityMode, HTMLButtonElement> = {} as Record<QualityMode, HTMLButtonElement>;
  const qualityNotes: Record<QualityMode, string> = {
    auto: 'Adapts to your device',
    low: 'Fast · no AO, no tilt-shift',
    medium: 'Balanced',
    high: 'All effects',
  };
  for (const m of ['auto', 'low', 'medium', 'high'] as QualityMode[]) {
    const b = el('button', '');
    b.type = 'button';
    b.innerHTML = `<span class="th-mtext"><span class="th-mname">${m[0].toUpperCase()}${m.slice(1)}</span><span class="th-mnote">${qualityNotes[m]}</span></span><span class="th-check"></span>`;
    b.addEventListener('click', () => {
      setQualityMode(m, true);
      closeMenus();
    });
    qualityItems[m] = b;
    qualityMenu.appendChild(b);
  }
  root.appendChild(qualityMenu);

  // help overlay
  const helpWrap = el('div', 'th-help-wrap');
  const k = (...keys: string[]) => keys.map((x) => `<span class="th-kbd">${x}</span>`).join('');
  const gst = (t: string) => `<span class="th-gesture">${t}</span>`;
  helpWrap.innerHTML = `<div class="th-help th-card" role="dialog" aria-label="Controls">
    <button class="th-btn th-help-close" type="button" data-tip="Close (Esc)">${ICONS.close}</button>
    <header><h2>Exploring ${CITY_NAME}</h2><p>A tabletop town that lives on its own — watch, follow, listen.</p></header>
    <div class="th-help-cols">
      <section><h3>Mouse</h3><dl>
        <dt>${gst('Left-drag')}</dt><dd>Rotate around the city</dd>
        <dt>${gst('Right-drag')}</dt><dd>Pan (also middle or Shift-drag)</dd>
        <dt>${gst('Scroll')}</dt><dd>Zoom towards the cursor</dd>
        <dt>${gst('Click')}</dt><dd>Follow anything that moves — even the balloon and the plane — or take a look at a building; drag to circle it, right-drag to let go</dd>
        <dt>${gst('Double-click')}</dt><dd>Fly to that spot, or in close to what is there</dd>
        <dt>${gst('Minimap')}</dt><dd>Click to fly, drag to pan</dd>
      </dl></section>
      <section><h3>Keyboard</h3><dl>
        <dt>${k('W', 'A', 'S', 'D')}</dt><dd>Move · arrows too</dd>
        <dt>${k('Shift')}</dt><dd>Move faster</dd>
        <dt>${k('Q', 'E')}</dt><dd>Rotate</dd>
        <dt>${k('R', 'F')}</dt><dd>Tilt</dd>
        <dt>${k('+', '−')}</dt><dd>Zoom</dd>
        <dt>${k('1', '…', '9')}${k('0')}</dt><dd>Places · overview</dd>
        <dt>${k('C')}</dt><dd>Chase view</dd>
        <dt>${k('Esc')}</dt><dd>Let go · stop tour</dd>
      </dl></section>
      <section><h3>Time & view</h3><dl>
        <dt>${k('Space')}</dt><dd>Pause / play</dd>
        <dt>${k(',', '.')}</dt><dd>Slower / faster</dd>
        <dt>${k('T')}</dt><dd>Cinematic auto-tour</dd>
        <dt>${k('B')}</dt><dd>Tilt-shift focus</dd>
        <dt>${k('L')}${k('M')}</dt><dd>Labels · minimap</dd>
        <dt>${k('P')}${k('H')}</dt><dd>Places · this help</dd>
        <dt>${k('U')}</dt><dd>Hide the controls</dd>
        <dt>${k('`')}</dt><dd>Frame-rate meter</dd>
      </dl></section>
    </div>
    <div class="th-help-foot"><b>Touch:</b> one finger rotates, two fingers pan, pinch to zoom and twist to turn, three fingers tilt; tap anything that moves to follow it.
      Sound is off until you switch it on in the toolbar — everything you hear is synthesised live. The cloud button sets the weather.</div>
  </div>`;
  root.appendChild(helpWrap);
  const helpCard = helpWrap.querySelector('.th-help') as HTMLDivElement;

  // fps meter
  const fpsEl = el('div', 'th-fps');
  root.appendChild(fpsEl);

  // ───────────────────────────────────────── state & actions
  let lastSpeed = clock.speed > 0 ? clock.speed : 1;
  let helpOpen = false;
  let openMenu: HTMLElement | null = null;
  let labelsOn = store('labels', true);
  let fpsOn = store('fps', false);
  let mapOn = store('minimap', true);
  let dofPref = store('dof', true);
  let volume = store('volume', 0.7);
  const qualityFromUrl = ctx.debug.params.get('quality');
  let qualityMode: QualityMode = qualityFromUrl === 'low' || qualityFromUrl === 'medium' || qualityFromUrl === 'high' ? qualityFromUrl : store<QualityMode>('quality', 'auto');

  const blurSoon = (e: Event) => {
    const t = e.currentTarget as HTMLElement | null;
    if (t && typeof t.blur === 'function') setTimeout(() => t.blur(), 0);
  };
  for (const b of [playBtn, ...speedBtns, dofBtn, tourBtn, weatherBtn, soundBtn, labelsBtn, placesBtn, mapBtn, qualityBtn, helpBtn]) b.addEventListener('click', blurSoon);

  const setPaused = (p: boolean) => {
    if (p) {
      if (clock.speed > 0) lastSpeed = clock.speed;
      clock.speed = 0;
    } else clock.speed = lastSpeed || 1;
    syncToolbar();
  };
  const setSpeed = (s: number) => {
    lastSpeed = s;
    clock.speed = s;
    syncToolbar();
  };
  playBtn.addEventListener('click', () => setPaused(clock.speed > 0));
  for (const b of speedBtns) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));

  // time slider (scrub → clock.setHours)
  let scrubbing = false;
  let lastScrubSet = 0;
  const onScrub = () => {
    const h = parseFloat(slider.value);
    const now = performance.now();
    if (now - lastScrubSet > 30) {
      clock.setHours(h);
      lastScrubSet = now;
    }
    showScrub(h);
  };
  const showScrub = (h: number) => {
    scrub.textContent = fmtHours(h);
    const r = slider.getBoundingClientRect();
    const g = g2.getBoundingClientRect();
    scrub.style.left = `${r.left - g.left + 9 + (r.width - 18) * (h / 24)}px`;
    scrub.classList.add('show');
  };
  slider.addEventListener('pointerdown', () => {
    scrubbing = true;
  });
  slider.addEventListener('input', onScrub);
  slider.addEventListener('change', () => {
    clock.setHours(parseFloat(slider.value));
    scrubbing = false;
    scrub.classList.remove('show');
    slider.blur();
  });
  const endScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    scrub.classList.remove('show');
    slider.blur();
  };
  slider.addEventListener('pointerup', endScrub);
  slider.addEventListener('pointercancel', endScrub);

  // tilt-shift
  const postfx = () => ctx.services.postfx;
  const applyDof = (on: boolean) => {
    const p = postfx();
    if (!p) return;
    try {
      p.setEnabled('dof', on);
    } catch {
      /* ignore */
    }
  };
  dofBtn.addEventListener('click', () => {
    const p = postfx();
    if (!p) {
      toast('Tilt-shift needs the post-processing module');
      return;
    }
    dofPref = !safeIsEnabled('dof');
    if (dofPref && !ctx.quality.dof) ctx.quality.dof = true;
    applyDof(dofPref);
    save('dof', dofPref);
    toast(dofPref ? 'Tilt-shift focus on' : 'Tilt-shift focus off');
    syncToolbar();
  });
  const safeIsEnabled = (e: 'dof' | 'bloom' | 'ao'): boolean => {
    try {
      return !!postfx()?.isEnabled(e);
    } catch {
      return false;
    }
  };

  // tour
  tourBtn.addEventListener('click', () => {
    const c = cam();
    if (!c) return;
    if (c.touring()) c.stopTour();
    else c.startTour();
    syncToolbar();
  });

  // weather: automatic showers (sky decides) → always clear → rain
  type Weather = 'auto' | 'clear' | 'rain';
  let weather: Weather = 'auto';
  const sky = () => ctx.services.sky;
  const setWeather = (w: Weather, announce: boolean) => {
    weather = w;
    const s = sky();
    try {
      s?.setWeather?.(w === 'auto' ? NaN : w === 'clear' ? 0 : 0.85);
    } catch {
      /* ignore */
    }
    if (announce) toast(w === 'auto' ? 'Weather: the sky decides' : w === 'clear' ? 'Weather: clear skies' : 'Weather: rain showers');
    syncToolbar();
  };
  weatherBtn.addEventListener('click', () => setWeather(weather === 'auto' ? 'clear' : weather === 'clear' ? 'rain' : 'auto', true));

  // sound (the click is the user gesture that unlocks WebAudio)
  const toggleSound = () => {
    const a = audio();
    if (!a || !a.available()) {
      toast('Sound is not available in this browser');
      return;
    }
    const on = !a.enabled();
    a.setVolume(volume);
    a.setEnabled(on);
    toast(on ? 'Sound on — listen to the city' : 'Sound off');
    syncToolbar();
    setTimeout(layout, 360);
  };
  soundBtn.addEventListener('click', toggleSound);
  const setVolFill = () => vol.style.setProperty('--fill', `${Math.round(volume * 100)}%`);
  vol.value = String(volume);
  setVolFill();
  vol.addEventListener('input', () => {
    volume = parseFloat(vol.value);
    setVolFill();
    audio()?.setVolume(volume);
  });
  vol.addEventListener('change', () => {
    save('volume', volume);
    vol.blur();
  });

  // labels, minimap, help, fps
  const setLabels = (on: boolean) => {
    labelsOn = on;
    labels.enabled = on;
    save('labels', on);
    syncToolbar();
  };
  labelsBtn.addEventListener('click', () => setLabels(!labelsOn));
  const setMap = (on: boolean) => {
    mapOn = on;
    minimap.setCollapsed(!on);
    save('minimap', on);
    syncToolbar();
  };
  mapBtn.addEventListener('click', () => setMap(!mapOn));
  const setHelp = (on: boolean) => {
    helpOpen = on;
    helpWrap.classList.toggle('open', on);
    if (on) {
      closeMenus();
      hideHint();
    }
    syncToolbar();
  };
  helpBtn.addEventListener('click', () => setHelp(!helpOpen));
  helpWrap.addEventListener('pointerdown', (e) => {
    if (!helpCard.contains(e.target as Node)) setHelp(false);
  });
  (helpWrap.querySelector('.th-help-close') as HTMLButtonElement).addEventListener('click', () => setHelp(false));
  let hudHidden = false;
  const setHud = (hidden: boolean) => {
    hudHidden = hidden;
    root.classList.toggle('th-hidden', hidden);
    if (hidden) {
      closeMenus();
      tooltip.classList.remove('show');
      // a tiny reminder that survives the hiding
      const wrap = el('div', 'th-toasts th-toast-solo');
      const t = el('div', 'th-toast');
      t.textContent = 'Controls hidden — press U to bring them back';
      wrap.appendChild(t);
      root.appendChild(wrap);
      setTimeout(() => wrap.remove(), 3300);
    }
  };
  const setFps = (on: boolean) => {
    fpsOn = on;
    fpsEl.classList.toggle('show', on);
    save('fps', on);
  };

  // menus
  const placeMenu = (menu: HTMLElement, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth || 230;
    const left = Math.max(10, Math.min(window.innerWidth - mw - 10, r.left + r.width / 2 - mw / 2));
    menu.style.left = `${left}px`;
    menu.style.bottom = `${Math.max(10, window.innerHeight - r.top + 10)}px`;
  };
  const toggleMenu = (menu: HTMLElement, anchor: HTMLElement) => {
    if (openMenu === menu) {
      closeMenus();
      return;
    }
    closeMenus();
    openMenu = menu;
    menu.classList.add('open');
    placeMenu(menu, anchor);
    anchor.classList.add('on');
  };
  const closeMenus = () => {
    if (!openMenu) return;
    openMenu.classList.remove('open');
    openMenu = null;
    syncToolbar();
  };
  placesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu(placesMenu, placesBtn);
  });
  qualityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu(qualityMenu, qualityBtn);
  });
  const onDocDown = (e: PointerEvent) => {
    if (!openMenu) return;
    const t = e.target as Node;
    if (openMenu.contains(t) || placesBtn.contains(t) || qualityBtn.contains(t)) return;
    closeMenus();
  };
  document.addEventListener('pointerdown', onDocDown, true);

  // info card actions
  chaseBtn.addEventListener('click', () => {
    const c = cam();
    if (c) c.setChase(!c.chasing());
    syncInfo();
  });
  const unfollow = () => cam()?.follow(null);
  (info.querySelector('.th-unfollow') as HTMLButtonElement).addEventListener('click', unfollow);
  (info.querySelector('.th-info-close') as HTMLButtonElement).addEventListener('click', unfollow);

  // ───────────────────────────────────────── quality
  const bootLevel: QualityLevel = (ctx.quality.level as QualityLevel) ?? 'high';
  let autoLevel: QualityLevel = bootLevel;
  const applyQuality = (level: QualityLevel) => {
    const p = PRESETS[level];
    const q = ctx.quality;
    const changed = q.level !== level;
    q.level = p.level;
    q.pixelRatio = p.pixelRatio;
    q.shadows = p.shadows;
    q.shadowMapSize = p.shadowMapSize;
    q.ao = p.ao;
    q.bloom = p.bloom;
    q.density = p.density;
    q.dof = p.dof;
    const fx = postfx();
    if (fx) {
      // postfx keeps its own adaptive ladder; the user switches only gate it
      try {
        fx.setEnabled('ao', p.ao);
        fx.setEnabled('bloom', p.bloom);
        fx.setEnabled('dof', p.dof && dofPref);
        (fx as { setAdaptive?: (on: boolean) => void }).setAdaptive?.(qualityMode === 'auto');
      } catch {
        /* ignore */
      }
      // postfx applies pixelRatio × renderScale on resize
      window.dispatchEvent(new Event('resize'));
    } else {
      // nobody else manages the renderer → apply the basics here
      ctx.renderer.setPixelRatio(q.pixelRatio);
      ctx.renderer.setSize(ctx.size.width, ctx.size.height, false);
    }
    events.emit('quality', q);
    root.classList.toggle('th-lowfx', level === 'low');
    return changed;
  };
  const setQualityMode = (m: QualityMode, user: boolean) => {
    qualityMode = m;
    if (user) save('quality', m);
    if (m === 'auto') {
      autoLevel = bootLevel;
      applyQuality(bootLevel);
      perf.reset();
    } else applyQuality(m);
    if (user) toast(m === 'auto' ? 'Quality: automatic' : `Quality: ${m}`);
    syncToolbar();
  };
  // simple, conservative auto controller (steps whole presets; postfx may scale resolution finer)
  const perf = {
    ema: 60,
    lowFor: 0,
    highFor: 0,
    warm: 0,
    stepsDown: 0,
    reset() {
      this.lowFor = 0;
      this.highFor = 0;
      this.warm = 0;
    },
    update(dt: number) {
      if (dt <= 0) return;
      this.ema += (1 / Math.max(dt, 1e-3) - this.ema) * Math.min(1, dt * 1.5);
      this.warm += dt;
      if (qualityMode !== 'auto' || automated || this.warm < 12 || document.hidden || postfx()) return;
      const order: QualityLevel[] = ['low', 'medium', 'high'];
      const i = order.indexOf(autoLevel);
      if (this.ema < 27 && i > 0) {
        this.lowFor += dt;
        this.highFor = 0;
        if (this.lowFor > 6) {
          autoLevel = order[i - 1];
          applyQuality(autoLevel);
          this.stepsDown++;
          this.lowFor = 0;
          this.warm = 4;
          toast(`Quality lowered to ${autoLevel} to keep things smooth`);
          syncToolbar();
        }
      } else if (this.ema > 57 && i < 2 && this.stepsDown < 3) {
        this.highFor += dt;
        this.lowFor = 0;
        if (this.highFor > 20) {
          autoLevel = order[i + 1];
          applyQuality(autoLevel);
          this.highFor = 0;
          this.warm = 0;
          syncToolbar();
        }
      } else {
        this.lowFor = Math.max(0, this.lowFor - dt);
        this.highFor = Math.max(0, this.highFor - dt * 0.5);
      }
    },
  };

  // ───────────────────────────────────────── syncing
  function syncToolbar(): void {
    const paused = clock.speed === 0;
    playBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
    playBtn.classList.toggle('paused', paused);
    playBtn.dataset.tip = paused ? 'Play (Space)' : 'Pause (Space)';
    for (const b of speedBtns) {
      const on = !paused && Number(b.dataset.speed) === clock.speed;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    const hasPost = !!postfx();
    dofBtn.disabled = !hasPost;
    dofBtn.classList.toggle('on', hasPost && safeIsEnabled('dof'));
    const canWeather = typeof sky()?.setWeather === 'function';
    weatherBtn.disabled = !canWeather;
    weatherBtn.innerHTML = ICONS[weather === 'auto' ? 'weatherAuto' : weather === 'clear' ? 'weatherClear' : 'weatherRain'];
    weatherBtn.classList.toggle('on', weather !== 'auto');
    weatherBtn.dataset.tip = weather === 'auto' ? 'Weather: automatic' : weather === 'clear' ? 'Weather: clear' : 'Weather: rain';
    const c = cam();
    tourBtn.disabled = !c;
    tourBtn.classList.toggle('on', !!c?.touring());
    tourBtn.classList.toggle('th-touring', !!c?.touring());
    const a = audio();
    const sOn = !!a?.enabled();
    soundBtn.innerHTML = sOn ? ICONS.soundOn : ICONS.soundOff;
    soundBtn.classList.toggle('on', sOn);
    soundBtn.dataset.tip = sOn ? 'Sound off' : 'Sound on';
    volWrap.classList.toggle('show', sOn);
    labelsBtn.classList.toggle('on', labelsOn);
    mapBtn.classList.toggle('on', mapOn);
    helpBtn.classList.toggle('on', helpOpen);
    placesBtn.classList.toggle('on', openMenu === placesMenu);
    qualityBtn.classList.toggle('on', openMenu === qualityMenu);
    const lvl = ctx.quality.level;
    qualityBtn.dataset.tip = `Quality: ${qualityMode === 'auto' ? `auto (${lvl})` : lvl}`;
    for (const m of Object.keys(qualityItems) as QualityMode[]) qualityItems[m].classList.toggle('on', m === qualityMode);
    (qualityItems.auto.querySelector('.th-mnote') as HTMLElement).textContent = qualityMode === 'auto' ? `Adapts to your device · now ${lvl}` : qualityNotes.auto;
  }

  let followHit: PickHit | null = null;
  let infoTimer = 0;
  const syncInfo = () => {
    const c = cam();
    const hit = c?.following() ?? null;
    followHit = hit;
    info.classList.toggle('show', !!hit);
    fpsEl.classList.toggle('with-info', !!hit);
    if (!hit) return;
    infoIcon.innerHTML = ICONS[(hit.kind in ICONS ? hit.kind : 'other') as IconName];
    const movable = isMovable(hit);
    let kicker = KIND_WORD[hit.kind] ?? 'Following';
    if (hit.kind === 'other') kicker = !movable ? 'Viewing' : isAirborne(hit) ? 'Following · aircraft' : 'Following';
    infoKicker.textContent = kicker;
    infoLabel.textContent = hit.label;
    chaseBtn.style.display = movable ? '' : 'none';
    chaseBtn.classList.toggle('on', !!c?.chasing());
    refreshInfoLines();
  };
  const refreshInfoLines = () => {
    if (!followHit) return;
    let lines: string[] = [];
    try {
      lines = followHit.info() ?? [];
    } catch {
      lines = [];
    }
    const html = lines
      .slice(0, 4)
      .map((l) => `<div>${escapeHtml(String(l))}</div>`)
      .join('');
    if (infoLines.innerHTML !== html) infoLines.innerHTML = html;
  };

  events.on('camera:follow', () => syncInfo());
  events.on('camera:chase', () => syncInfo());
  events.on('camera:tour', (on: boolean) => {
    syncToolbar();
    if (on) toast('Auto-tour — move the camera to take over');
    else showCaption(null);
  });
  events.on('camera:shot', (s: TourShotInfo | null) => showCaption(s));
  events.on('quality', () => {
    root.classList.toggle('th-lowfx', ctx.quality.level === 'low' || ctx.quality.renderScale < 0.8);
    syncToolbar();
  });

  // tour captions
  let captionTimer: ReturnType<typeof setTimeout> | null = null;
  const capTitle = caption.querySelector('.th-cap-title') as HTMLDivElement;
  const capSub = caption.querySelector('.th-cap-sub') as HTMLDivElement;
  function showCaption(s: TourShotInfo | null): void {
    if (captionTimer) clearTimeout(captionTimer);
    caption.classList.remove('show');
    if (!s) return;
    captionTimer = setTimeout(() => {
      capTitle.textContent = s.title;
      capSub.textContent = s.subtitle;
      caption.classList.add('show');
      captionTimer = setTimeout(() => caption.classList.remove('show'), 7000);
    }, 700);
  }

  // ───────────────────────────────────────── hint
  let hintState: 'wait' | 'show' | 'done' = 'wait';
  let hintT = 0;
  let interactions = 0;
  const hideHint = () => {
    if (hintState === 'done') return;
    hintState = 'done';
    hint.classList.remove('show');
  };
  const onCanvasInteract = () => {
    interactions++;
    if (hintState === 'show' && interactions >= 4) setTimeout(hideHint, 1500);
  };
  ctx.canvas.addEventListener('pointerdown', onCanvasInteract, { passive: true });
  ctx.canvas.addEventListener('wheel', onCanvasInteract, { passive: true });
  const hintRuns = store('hintRuns', 0);
  save('hintRuns', hintRuns + 1);
  const hintDuration = hintRuns < 3 ? 15 : 8;

  // ───────────────────────────────────────── keyboard
  const isTyping = (t: EventTarget | null): boolean => {
    const e = t as HTMLElement | null;
    if (!e || !e.tagName) return false;
    const tag = e.tagName;
    if (tag === 'INPUT') {
      const type = (e as HTMLInputElement).type;
      return type !== 'range' && type !== 'checkbox' && type !== 'button';
    }
    return tag === 'TEXTAREA' || tag === 'SELECT' || e.isContentEditable;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      if (helpOpen) {
        setHelp(false);
        e.stopImmediatePropagation();
        return;
      }
      if (openMenu) {
        closeMenus();
        e.stopImmediatePropagation();
        return;
      }
      return;
    }
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (helpOpen && e.code !== 'KeyH' && e.key !== '?') {
      // the help card is modal: keep the camera still behind it
      e.stopImmediatePropagation();
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        setPaused(clock.speed > 0);
        break;
      case 'Comma': {
        const i = SPEEDS.indexOf(clock.speed);
        if (clock.speed === 0) setPaused(false);
        else setSpeed(SPEEDS[Math.max(0, (i < 0 ? 1 : i) - 1)]);
        break;
      }
      case 'Period': {
        const i = SPEEDS.indexOf(clock.speed);
        if (clock.speed === 0) setPaused(false);
        else setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, (i < 0 ? 0 : i) + 1)]);
        break;
      }
      case 'KeyL':
        setLabels(!labelsOn);
        break;
      case 'KeyM':
        setMap(!mapOn);
        break;
      case 'KeyP':
        toggleMenu(placesMenu, placesBtn);
        break;
      case 'KeyB':
        dofBtn.click();
        break;
      case 'KeyH':
        setHelp(!helpOpen);
        break;
      case 'Backquote':
        setFps(!fpsOn);
        break;
      case 'KeyU':
        setHud(!hudHidden);
        break;
      case 'Slash':
        if (e.shiftKey) setHelp(!helpOpen);
        break;
      default:
        break;
    }
  };
  window.addEventListener('keydown', onKey, true);

  // ───────────────────────────────────────── responsive bits
  const layout = () => {
    const w = window.innerWidth,
      h = window.innerHeight;
    minimap.setWidth(w >= 1500 ? 230 : w >= 1100 ? 205 : w >= 760 ? 172 : 150);
    const small = w < 640 || h < 520;
    if (small && mapOn && !store('minimapTouched', false)) minimap.setCollapsed(true);
    else minimap.setCollapsed(!mapOn);
    // toolbar centred unless it would collide with the minimap; then left, then lift the map
    tb.classList.remove('th-left');
    minimap.el.style.bottom = '';
    const tbW = tb.offsetWidth,
      tbH = tb.offsetHeight;
    const mmW = minimap.isCollapsed() ? 0 : minimap.el.offsetWidth;
    const gap = 14;
    const mmLeft = w - 16 - mmW;
    const wrapped = w <= 760;
    if (!wrapped) {
      const centeredRight = (w + tbW) / 2;
      if (mmW > 0 && centeredRight > mmLeft - gap) {
        tb.classList.add('th-left');
        if (16 + tbW > mmLeft - gap) minimap.el.style.bottom = `${16 + tbH + 10}px`;
      }
    } else if (mmW > 0) minimap.el.style.bottom = `${10 + tbH + 10}px`;
    // the hint and captions sit just above the toolbar (the hint centred on it)
    const tbTop = (wrapped ? 10 : 16) + tbH;
    hint.style.bottom = `${tbTop + 12}px`;
    const tbLeft = wrapped ? 10 : tb.classList.contains('th-left') ? 16 : (w - tbW) / 2;
    const hw = hint.offsetWidth;
    hint.style.left = `${Math.max(10 + hw / 2, Math.min(w - 10 - hw / 2, tbLeft + tbW / 2))}px`;
    caption.style.bottom = `${tbTop + 22}px`;
    if (openMenu) placeMenu(openMenu, openMenu === placesMenu ? placesBtn : qualityBtn);
  };
  mapBtn.addEventListener('click', () => save('minimapTouched', true));

  /** HUD panels the district flags keep clear of */
  const hudRects = (): ScreenRect[] => {
    const out: ScreenRect[] = [];
    const add = (e: HTMLElement, pad = 6) => {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x0: r.left - pad, y0: r.top - pad, x1: r.right + pad, y1: r.bottom + pad });
    };
    add(title);
    add(tb);
    if (!minimap.isCollapsed()) add(minimap.el);
    if (hint.classList.contains('show')) add(hint);
    return out;
  };

  // ───────────────────────────────────────── live dots for the minimap
  const tmpV = new THREE.Vector3();
  minimap.liveDots = () => {
    const out: LiveDot[] = [];
    // duck-typed: modules may expose positions for the map
    const tryList = (svc: unknown, fn: string, color: string, r: number) => {
      const f = (svc as Record<string, unknown> | undefined)?.[fn];
      if (typeof f !== 'function') return;
      const list = (f as () => unknown).call(svc);
      if (!Array.isArray(list)) return;
      for (const p of list as { x?: number; z?: number; color?: string }[]) {
        if (typeof p?.x === 'number' && typeof p?.z === 'number') out.push({ x: p.x, z: p.z, color: p.color ?? color, r });
      }
    };
    tryList(ctx.services.traffic, 'busPositions', '#e9b23a', 2.6);
    tryList(ctx.services.rail, 'trainPositions', '#c0392b', 3);
    tryList(ctx.services.boats, 'boatPositions', '#f1faee', 2.4);
    if (out.length === 0) {
      // generic fallback: the camera's background census (found through the pickers)
      const c = cam();
      for (const e of c?.liveEntities() ?? []) out.push({ x: e.x, z: e.z, color: e.color, r: e.kind === 'train' ? 3 : e.kind === 'boat' ? 2.3 : 2.5 });
    }
    void tmpV;
    return out;
  };

  // ───────────────────────────────────────── hover picking
  let hoverAt = 0;
  let hoverX = -1,
    hoverY = -1;
  let restX = -1,
    restY = -1,
    restSince = 0;
  let hoverHit: PickHit | null = null;
  let hoverFlag = false;
  const updateHover = (now: number) => {
    const c = cam();
    if (!c) return;
    const p = c.pointer;
    const active = p.inside && !p.dragging && !helpOpen && now - p.movedAt < 4000 && !c.touring();
    if (!active) {
      labels.setHover(null);
      if (hoverHit || hoverFlag) {
        hoverHit = null;
        hoverFlag = false;
        tooltip.classList.remove('show');
        c.setHoverCursor(false);
      }
      return;
    }
    // district flags sit above the city (they are pointer-transparent; clicks reach them via the camera)
    const flag = labels.hitTest(p.x, p.y);
    labels.setHover(flag);
    if (flag) {
      if (!hoverFlag || tooltip.dataset.flag !== flag.id) {
        tooltip.innerHTML = `${escapeHtml(flag.name)}<small>Click to fly there</small>`;
        tooltip.dataset.flag = flag.id;
      }
      hoverFlag = true;
      hoverHit = null;
      c.setHoverCursor(true);
      tooltip.style.transform = `translate3d(${Math.round(Math.min(p.x + 16, ctx.size.width - 220))}px, ${Math.round(p.y + 18)}px, 0)`;
      tooltip.classList.add('show');
      return;
    }
    if (hoverFlag) {
      hoverFlag = false;
      tooltip.dataset.flag = '';
      tooltip.classList.remove('show');
      c.setHoverCursor(false);
      hoverAt = 0;
    }
    if (Math.abs(p.x - restX) + Math.abs(p.y - restY) > 3) {
      restX = p.x;
      restY = p.y;
      restSince = now;
    }
    const moved = Math.abs(p.x - hoverX) + Math.abs(p.y - hoverY) > 2;
    if (now - hoverAt < (moved ? 110 : 300)) {
      if (hoverHit) tooltip.style.transform = `translate3d(${Math.round(p.x + 16)}px, ${Math.round(p.y + 18)}px, 0)`;
      return;
    }
    hoverAt = now;
    hoverX = p.x;
    hoverY = p.y;
    let hit: PickHit | null = null;
    try {
      hit = c.pickAt(p.x, p.y);
    } catch {
      hit = null;
    }
    const followed = c.following();
    if (hit && followed && followed.kind === hit.kind && followed.id === hit.id) hit = null;
    const movable = !!hit && isMovable(hit);
    // buildings & landmarks are everywhere: only name them once the cursor rests on them
    if (hit && !movable && now - restSince < 650) hit = null;
    hoverHit = hit;
    c.setHoverCursor(movable);
    if (!hit) {
      tooltip.classList.remove('show');
      return;
    }
    tooltip.innerHTML = `${escapeHtml(hit.label)}<small>${movable ? 'Click to follow' : 'Click to take a look'}</small>`;
    // keep the tooltip on screen
    const tx = Math.min(p.x + 16, ctx.size.width - 220);
    tooltip.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(p.y + 18)}px, 0)`;
    tooltip.classList.add('show');
  };

  // ───────────────────────────────────────── clock & theme
  let lastMinute = -1;
  let night = clock.night > 0.55;
  root.classList.toggle('th-night', night);
  const updateClock = () => {
    const h = clock.hours;
    const minute = Math.floor(h * 60);
    if (minute !== lastMinute) {
      lastMinute = minute;
      timeEl.textContent = clock.label();
      dayEl.textContent = `Day ${clock.day} · ${partOfDay(h)}`;
      // sun travels sunrise→sunset; the moon covers the night
      const SUNRISE = 6,
        SUNSET = 19.5;
      let u: number;
      const isDay = h >= SUNRISE && h <= SUNSET;
      if (isDay) u = (h - SUNRISE) / (SUNSET - SUNRISE);
      else u = (((h - SUNSET + 24) % 24) / (24 - SUNSET + SUNRISE));
      const ang = Math.PI * (1 - u);
      const x = 32 + 26 * Math.cos(ang),
        y = 29 - 26 * Math.sin(ang);
      dialBody.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      dial.classList.toggle('night', !isDay);
      if (!scrubbing && document.activeElement !== slider) slider.value = String(h);
    }
    // HUD theme follows the light (with hysteresis)
    if (!night && clock.night > 0.62) night = true;
    else if (night && clock.night < 0.42) night = false;
    if (root.classList.contains('th-night') !== night) root.classList.toggle('th-night', night);
  };

  // ───────────────────────────────────────── service + boot
  const service = { toast };
  ctx.services.ui = service;
  // a plain click on a district flag flies there (flags never block drags: they are pointer-transparent)
  const camForHook = cam();
  if (camForHook)
    camForHook.clickHook = (x, y) => {
      const d = labels.hitTest(x, y);
      if (!d) return false;
      labels.fly(d);
      return true;
    };

  labels.enabled = labelsOn;
  setFps(fpsOn);
  minimap.setCollapsed(!mapOn);
  // apply the stored / URL quality choice (manual modes only — auto keeps the boot preset)
  if (qualityMode !== 'auto' && qualityMode !== ctx.quality.level) applyQuality(qualityMode);
  // honour a stored tilt-shift preference once post-processing exists
  if (!dofPref) applyDof(false);
  layout();
  syncToolbar();
  syncInfo();
  try {
    void document.fonts?.ready.then(() => layout());
  } catch {
    /* ignore */
  }
  // the toolbar animates in; measure again once it has settled
  setTimeout(layout, 1600);

  // fps meter numbers
  let fpsAcc = 0,
    fpsFrames = 0,
    fpsShown = 60,
    msEma = 16;
  let t = 0;
  let lastToolbarSync = 0;
  let frameStart = 0;
  let uiMs = 0;

  return {
    name: 'ui',
    frame(realDt) {
      const now = performance.now();
      t += realDt;
      frameStart = now;
      updateClock();
      labels.update(realDt);
      minimap.draw(now);
      updateHover(now);
      perf.update(realDt);
      // info lines refresh at 4 Hz
      infoTimer += realDt;
      if (followHit && infoTimer > 0.25) {
        infoTimer = 0;
        refreshInfoLines();
      }
      // cheap periodic sync for state changed elsewhere (keyboard in the camera, other modules)
      if (now - lastToolbarSync > 500) {
        lastToolbarSync = now;
        syncToolbar();
        labels.avoid = hudRects();
        const c = cam();
        if ((c?.following() ?? null) !== followHit) syncInfo();
      }
      // first-run hint after the establishing shot
      if (hintState === 'wait' && t > 4.2) {
        if (automated && !ctx.debug.params.has('hint')) hintState = 'done';
        else {
          hintState = 'show';
          hint.classList.add('show');
          hintT = 0;
        }
      } else if (hintState === 'show') {
        hintT += realDt;
        if (hintT > hintDuration) hideHint();
      }
      uiMs = uiMs * 0.95 + (performance.now() - frameStart) * 0.05;
      // fps meter
      fpsAcc += realDt;
      fpsFrames++;
      msEma += (realDt * 1000 - msEma) * 0.05;
      if (fpsAcc > 0.5) {
        fpsShown = fpsFrames / fpsAcc;
        fpsAcc = 0;
        fpsFrames = 0;
        if (fpsOn) {
          const info2 = ctx.renderer.info.render;
          void info2;
          fpsEl.textContent = `${fpsShown.toFixed(0)} fps  ${msEma.toFixed(1)} ms\n${info2.calls} calls  ${(info2.triangles / 1000).toFixed(0)}k tris\nquality ${ctx.quality.level}${qualityMode === 'auto' ? ' (auto)' : ''}`;
        }
      }
    },
    resize() {
      layout();
    },
    stats() {
      return { quality: `${qualityMode}:${ctx.quality.level}`, labels: labelsOn ? 'on' : 'off', following: followHit ? followHit.label : '-', frameMs: Math.round(uiMs * 1000) / 1000 };
    },
    invariants() {
      const out: string[] = [];
      if (!root.isConnected) out.push('ui root detached');
      const r = tb.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) out.push(`toolbar overflows the window (${Math.round(r.left)}..${Math.round(r.right)} of ${window.innerWidth})`);
      const tr = title.getBoundingClientRect();
      if (tr.width > 0 && r.width > 0 && tr.bottom > r.top && tr.right > r.left && tr.left < r.right) out.push('title overlaps the toolbar');
      return out;
    },
    dispose() {
      if (camForHook && camForHook.clickHook) camForHook.clickHook = null;
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDocDown, true);
      ctx.canvas.removeEventListener('pointerdown', onCanvasInteract);
      ctx.canvas.removeEventListener('wheel', onCanvasInteract);
      root.remove();
    },
  };
}

/** things that move (and can be chased) — buildings, landmarks and moored props only get a look */
function isMovable(hit: PickHit): boolean {
  return hit.kind !== 'building' && hit.kind !== 'landmark' && typeof hit.getHeading === 'function';
}

const _airV = new THREE.Vector3();
function isAirborne(hit: PickHit): boolean {
  try {
    return hit.getPosition(_airV) && _airV.y > 20;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
