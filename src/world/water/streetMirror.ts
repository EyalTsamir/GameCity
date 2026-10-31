// Wet streets mirror the town. While the ground is wet and the camera is down in the streets with no water in view, the
// water's planar reflection pass (water/reflection.ts) moves up to the road surface: the same pass, the same cost, a
// different plane. Asphalt and paving then read it through their water film: a rough, smeared image on the wet surface
// (lamps and shop windows drawn out into long streaks toward the viewer), a crisp, rippling one in the puddles.
// Off (level 0, medium / low quality): uSRefl.x stays 0 and the lookup returns at once; the ground keeps its sky sheen.

import * as THREE from 'three';

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
blank.needsUpdate = true;

/** shared by the road materials and the reflection pass */
export const streetMirror = {
  tSRefl: { value: blank as THREE.Texture },
  uSReflMat: { value: new THREE.Matrix4() },
  /** x strength (0 off), y simulation time */
  uSRefl: { value: new THREE.Vector4(0, 0, 0, 0) },
};
export const STREET_MIRROR_BLANK = blank;

/** GLSL (road materials): needs rdHash (COMMON), cameraPosition, uRain. */
export const STREET_MIRROR_GLSL = /* glsl */ `
uniform sampler2D tSRefl;
uniform mat4 uSReflMat;
uniform vec4 uSRefl;
float rdSpecOcc = 1.0;
// rain rings on standing water: one drop per cell, an expanding wave (returns a slope, x / z)
vec2 rdRainRings(vec2 p) {
  vec2 c = floor(p / 0.55);
  float h = rdHash(c);
  float ph = fract(uSRefl.y * (0.9 + h) + h * 7.0);
  vec2 d = (p / 0.55 - c - 0.5 - (vec2(h, rdHash(c + 3.7)) - 0.5) * 0.5) * 0.55;
  float r = length(d) + 1e-4;
  float w = sin((r - ph * 0.3) * 62.0) * exp(-r * 9.0) * (1.0 - ph) * (1.0 - smoothstep(0.1, 0.27, r));
  return d / r * w * step(h, 0.3 + 0.6 * uRain) * step(0.05, uRain);
}
// pud 0..1 standing water, film 0..1 wet surface, nn noise 0..1
vec3 rdStreetMirror(vec3 wp, float pud, float film, vec2 nn) {
  if (uSRefl.x < 0.004) return vec3(0.0);
  float w = max(pud, film);
  if (w < 0.004) return vec3(0.0);
  vec3 V = cameraPosition - wp;
  float dist = length(V);
  V /= dist;
  // (a rough wet surface mirrors more than a smooth one's Fresnel at these angles: its facets tilt toward the viewer)
  float F = mix(0.1, 1.0, pow(1.0 - max(V.y, 0.0), 3.0)) * mix(1.0, 0.8, pud);
  vec2 vh = normalize(V.xz + vec2(1e-5, 0.0));
  // the film smears the image toward the viewer and wobbles it; standing water only ripples
  vec2 q = wp.xz + (nn - 0.5) * mix(0.5, 0.06, pud) * min(1.0 + dist * 0.05, 3.0);
  if (pud > 0.01) q += rdRainRings(wp.xz) * pud * 0.9;
  float smear = mix(1.6 + dist * 0.2, 0.12, pud);
  float lod = mix(2.0, 0.4, pud);
  vec2 sv = vh * smear;
  vec4 c0 = uSReflMat * vec4(q.x, 0.0, q.y, 1.0);
  vec4 c1 = uSReflMat * vec4(q.x + sv.x, 0.0, q.y + sv.y, 1.0);
  vec4 c2 = uSReflMat * vec4(q.x - sv.x, 0.0, q.y - sv.y, 1.0);
  vec2 uv = c0.xy / c0.w;
  vec4 r = textureLod(tSRefl, uv, lod) * 0.46 + (textureLod(tSRefl, c1.xy / c1.w, lod + 0.3) + textureLod(tSRefl, c2.xy / c2.w, lod + 0.3)) * 0.27;
  vec2 ed = min(uv, 1.0 - uv);
  float k = uSRefl.x * w * smoothstep(0.0, 0.03, min(ed.x, ed.y));
  // what the mirror covers, the sky sheen of the IBL no longer shows
  rdSpecOcc = 1.0 - clamp(r.a * k, 0.0, 1.0);
  return min(r.rgb, vec3(6.0)) * F * k * 1.6;
}
`;
