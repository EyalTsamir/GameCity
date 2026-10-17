// Inline SVG icons (24×24, stroke = currentColor). Hand-drawn to match the
// "model-kit instruction sheet" look: round caps, 1.8 px strokes, a few fills.

const S = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  play: S('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>'),
  pause: S('<rect x="6.5" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.9" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor" stroke="none"/>'),
  tiltshift: S('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9.2h18M3 14.8h18" stroke-dasharray="1.6 2.4" opacity=".75"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>'),
  tour: S('<path d="M4 17c2.6-6.4 6.3-9.6 11-9.6"/><path d="M12.8 4.6 15.6 7.4l-2.8 2.8"/><circle cx="5" cy="17.5" r="1.6" fill="currentColor" stroke="none"/><path d="M15 13.5l5 3-5 3z" fill="currentColor" stroke="none"/>'),
  soundOn: S('<path d="M4.5 9.5h3.2L12 5.8v12.4L7.7 14.5H4.5z" fill="currentColor" stroke-width="1.4"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6M17.8 6.8a7.3 7.3 0 0 1 0 10.4"/>'),
  soundOff: S('<path d="M4.5 9.5h3.2L12 5.8v12.4L7.7 14.5H4.5z" fill="currentColor" stroke-width="1.4"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  labels: S('<path d="M4 12.2V5.5A1.5 1.5 0 0 1 5.5 4h6.7l7.8 7.8a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8.4" cy="8.4" r="1.5" fill="currentColor" stroke="none"/>'),
  places: S('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3" fill="currentColor" stroke="none"/>'),
  quality: S('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/><path d="M4 12h5M13 12h7"/><circle cx="11" cy="12" r="2.2"/>'),
  help: S('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/>'),
  weatherAuto: S('<circle cx="9" cy="9" r="3.4"/><path d="M9 2.5v1.3M2.5 9h1.3M4.4 4.4l.9.9M13.6 4.4l-.9.9"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.4 1.3 2.9 2.9 0 0 0 .1 5.7z" style="fill: rgba(var(--paper), 1)"/>'),
  weatherClear: S('<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  weatherRain: S('<path d="M7.5 14.5h10a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-9.8 1.4 2.9 2.9 0 0 0-.5 5.8z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>'),
  close: S('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  map: S('<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13L15 19.5l-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>'),
  chase: S('<path d="M3 15.5c3-1 5.5-1.5 9-1.5s6 .5 9 1.5"/><path d="M7 11.5l2.2-3.7h5.6l2.2 3.7"/><rect x="5.5" y="11.4" width="13" height="4.4" rx="1.6"/><circle cx="8.6" cy="17.4" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.4" cy="17.4" r="1.4" fill="currentColor" stroke="none"/>'),
  stop: S('<circle cx="12" cy="12" r="8.5"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none"/>'),
  // kinds for the info card
  vehicle: S('<path d="M5 13l1.8-4.4A2 2 0 0 1 8.6 7.4h6.8a2 2 0 0 1 1.8 1.2L19 13"/><rect x="3.5" y="12.8" width="17" height="4.6" rx="1.6"/><circle cx="7.5" cy="17.6" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.5" cy="17.6" r="1.6" fill="currentColor" stroke="none"/>'),
  bus: S('<rect x="4" y="4" width="16" height="13.5" rx="2.6"/><path d="M4 11h16M8 4v7M16 4v7"/><circle cx="8" cy="19.2" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="19.2" r="1.5" fill="currentColor" stroke="none"/>'),
  train: S('<rect x="6" y="3.5" width="12" height="14" rx="3"/><path d="M6 10.5h12"/><circle cx="9.3" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="14" r="1" fill="currentColor" stroke="none"/><path d="M8.5 17.5 6.5 21M15.5 17.5l2 3.5"/>'),
  boat: S('<path d="M3 15.5h18l-2.6 4H5.6z" fill="currentColor" stroke-width="1.2"/><path d="M12 3.5v11"/><path d="M12 4.5l6 8.5h-6z"/>'),
  pedestrian: S('<circle cx="12" cy="4.8" r="2"/><path d="M12 8v6.5M12 14.5l-3 5.5M12 14.5l3 5.5M8 11l4-2.5 4 2.5"/>'),
  building: S('<path d="M4 20.5h16M6 20.5V8l6-4 6 4v12.5"/><path d="M10 20.5v-4.5h4v4.5M9 10.5h1.5M13.5 10.5H15M9 13.5h1.5M13.5 13.5H15"/>'),
  landmark: S('<path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.3L12 15.5l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>'),
  other: S('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2 3"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** Small sun/moon dial: a horizon with the sun (day) or moon (night) travelling on an arc. */
export const SKY_DIAL = `<svg class="th-dial" viewBox="0 0 64 34" width="56" height="30" aria-hidden="true">
  <defs>
    <radialGradient id="th-sun-g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".6" stop-color="#f5b942"/><stop offset="1" stop-color="#f5b942" stop-opacity="0"/></radialGradient>
  </defs>
  <path class="th-dial-arc" d="M6 29 A26 26 0 0 1 58 29" fill="none" stroke-width="1.3" stroke-dasharray="1.5 3"/>
  <path class="th-dial-horizon" d="M2 29.5h60" stroke-width="1.6" stroke-linecap="round"/>
  <g class="th-dial-body">
    <circle class="th-dial-glow" r="8" fill="url(#th-sun-g)"/>
    <circle class="th-dial-sun" r="4.2"/>
    <path class="th-dial-moon" d="M2.2-4.2a4.6 4.6 0 1 0 2.4 7.6 3.7 3.7 0 1 1-2.4-7.6z"/>
  </g>
</svg>`;
