// Shared shader uniforms. Custom materials should reference these objects
// directly (e.g. `material.uniforms.uNight = globalUniforms.uNight`, or inside
// onBeforeCompile: `shader.uniforms.uNight = globalUniforms.uNight`) so a
// single update per frame drives every shader.

import * as THREE from 'three';

export const globalUniforms = {
  /** simulation seconds (freezes while paused) — use for anything that moves */
  uTime: { value: 0 },
  /** real seconds (keeps running while paused) — UI shimmer etc. */
  uRealTime: { value: 0 },
  /** 0 day .. 1 deep night */
  uNight: { value: 0 },
  /** 0 night .. 1 full daylight */
  uDaylight: { value: 1 },
  /** 0..1 warm sunrise/sunset bump */
  uDusk: { value: 0 },
  /** 1 while streetlights / windows are switched on (eased) */
  uLights: { value: 0 },
  /** wind direction (xz) * strength (0..1.5) */
  uWind: { value: new THREE.Vector2(0.8, 0.35) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  /** 0 dry .. 1 heavy rain (optional weather) */
  uRain: { value: 0 },
};

export type GlobalUniforms = typeof globalUniforms;
