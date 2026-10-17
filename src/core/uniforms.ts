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
  /** night street-light map (top-down, see core/lampLight.ts) — black until the lamps module bakes it */
  uLampMap: { value: blankLampMap() as THREE.Texture },
  /** world xz → lamp-map uv: (x0, z0, 1/width, 1/depth) */
  uLampXf: { value: new THREE.Vector4(0, 0, 1, 1) },
  /** overall lamp-light gain (0 by day, eases to 1 with the street lights) */
  uLampGain: { value: 0 },
};

function blankLampMap(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
}

export type GlobalUniforms = typeof globalUniforms;
