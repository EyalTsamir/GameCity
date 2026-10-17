// Night street-light illumination shared by every ground / facade / foliage shader.
//
// Contract (stable — other modules rely on these names):
//   • Static light sources (street + path lamps, plaza lights, quay / stadium floodlights, shop
//     windows spilling onto the pavement…) are registered with addLampLights() while modules are
//     created. Registering is cheap and has no effect by itself.
//   • The "lamps" module (src/world/lamps.ts) bakes the registry once, after 'modules:ready', into
//     a top-down light map stored in globalUniforms.uLampMap (+ uLampXf), and eases
//     globalUniforms.uLampGain with the street lights. Until then the map is black and the gain 0,
//     so integrating the GLSL below is always safe.
//   • A material integrates it by merging lampUniforms() into its shader uniforms, adding
//     LAMP_GLSL to the fragment pars, and adding  albedo * thLampLight(worldPos, worldNormal)
//     to the outgoing radiance — for MeshStandard/Lambert-based shaders after
//     `#include <lights_fragment_end>`:
//         reflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(vThWorldPos, thWorldNormal);
//     (worldPos/worldNormal in world space; how a shader obtains them is up to the shader).
//     LAMP_APPLY_VIEW (below) does exactly that for any Lambert / Phong / Standard shader from its
//     view-space varyings — no extra varyings needed.
//
// thLampLight returns linear irradiance-like light (already scaled by uLampGain): multiply by the
// surface albedo, never add it unmodulated (that is what made the old additive pools look like
// grey stickers).
//
// Encoding (owned by the lamps module, may change without notice — always go through
// thLampLight): uLampMap holds two panels side by side over the map domain (0.5 m / texel):
//   panel A  rgb = sqrt(E / 4)  ground irradiance of all lamps (soft-compressed), a = (head y + 10) / 50
//   panel B  rg  = dominant horizontal direction towards the lights (·0.5 + 0.5; length = how
//                  one-sided the light is), b = mean horizontal distance to them / 20 m,
//            a   = mean light-head height above its own ground / 32 m
// thLampLight rebuilds one "virtual lamp" per texel from panel B and re-projects the baked ground
// irradiance onto any surface height / orientation (walls facing a lamp get a scalloped wash that
// stops at the lamp head, roofs above the heads stay dark, tree crowns are lit from below…).
// Scheduled / moving lights (stadium floodlights, crane work lights) are evaluated analytically:
// up to TH_LAMP_SPOTS spot lights whose gain follows a named channel (bindLampChannel).

import { globalUniforms } from './uniforms';

export type LampKind = 'street' | 'path' | 'plaza' | 'flood' | 'spill' | 'portal';

export interface LampLight {
  /** light head position (world, m) */
  x: number;
  y: number;
  z: number;
  /** reach of the pool on the ground (m) */
  radius: number;
  /** sRGB hex colour (e.g. '#ffc979') */
  color: string;
  /** relative strength (street lamp ≈ 1) */
  intensity: number;
  kind: LampKind;
  /** elongated pools (e.g. floodlights, shop spill): stretch along local x and yaw (rad) */
  stretch?: number;
  yaw?: number;
  /** aimed lights (floodlights, shop spill): the point the beam axis hits (world); default straight down */
  aim?: [number, number, number];
  /** beam half-angle (rad) of aimed lights; default derived from radius */
  cone?: number;
  /** height of the head above its own ground (m); default from the terrain under the head */
  pole?: number;
  /**
   * Scheduled / moving light: NOT baked; evaluated analytically every frame with its gain taken
   * from the channel of that name (see bindLampChannel). The owner may move it by mutating
   * x/y/z/aim of the registered object (re-read every frame).
   */
  channel?: string;
}

const registry: LampLight[] = [];

/** Register static light sources for the night light map (call during module creation). */
export function addLampLights(list: readonly LampLight[]): void {
  for (const l of list) registry.push(l);
}

/** Everything registered so far (read by the lamps module when it bakes). */
export function lampLights(): readonly LampLight[] {
  return registry;
}

const channels = new Map<string, { value: number }>();

/** Bind a gain channel (0..1, e.g. the stadium floodlight state) for lights registered with `channel`. */
export function bindLampChannel(name: string, ref: { value: number }): void {
  channels.set(name, ref);
}

/** Current value of a gain channel (0 when unbound). */
export function lampChannel(name: string): number {
  return channels.get(name)?.value ?? 0;
}

/** Max number of analytic (scheduled / moving) spot lights evaluated per fragment. */
export const TH_LAMP_SPOTS = 12;

/** Map layout (shared by the baker and LAMP_GLSL). */
export const LAMP_MAP = {
  x0: -204,
  z0: -194,
  x1: 204,
  z1: 154,
  /** metres per texel */
  texel: 0.5,
  /** black texels between the two panels */
  gap: 4,
  get pw(): number {
    return Math.round((this.x1 - this.x0) / this.texel);
  },
  get ph(): number {
    return Math.round((this.z1 - this.z0) / this.texel);
  },
  get width(): number {
    return this.pw * 2 + this.gap;
  },
} as const;

/** Analytic spot lights (packed by the lamps module every frame). */
export const lampSpotUniforms = {
  uLampSpotN: { value: 0 },
  /** xyz head, w = reach (m) */
  uLampSpotP: { value: new Float32Array(TH_LAMP_SPOTS * 4) },
  /** rgb = linear colour × intensity × gain (normalised), w = cos(outer half-angle) */
  uLampSpotC: { value: new Float32Array(TH_LAMP_SPOTS * 4) },
  /** xyz = beam axis, w = cos(inner half-angle) */
  uLampSpotD: { value: new Float32Array(TH_LAMP_SPOTS * 4) },
  /** xz bounds of the two spot groups (x0, z0, x1, z1): group 0 = spots [0, split), group 1 = [split, n) */
  uLampSpotBox: { value: new Float32Array(4) },
  uLampSpotBox2: { value: new Float32Array(4) },
  uLampSpotSplit: { value: 0 },
};

type U<T> = { value: T };
export interface LampUniforms {
  uLampMap: typeof globalUniforms.uLampMap;
  uLampXf: typeof globalUniforms.uLampXf;
  uLampGain: typeof globalUniforms.uLampGain;
  uLampSpotN: U<number>;
  uLampSpotP: U<Float32Array>;
  uLampSpotC: U<Float32Array>;
  uLampSpotD: U<Float32Array>;
  uLampSpotBox: U<Float32Array>;
  uLampSpotBox2: U<Float32Array>;
  uLampSpotSplit: U<number>;
}

/** Uniforms to merge into a shader that uses LAMP_GLSL (shared objects: one update drives all). */
export function lampUniforms(): LampUniforms {
  return {
    uLampMap: globalUniforms.uLampMap,
    uLampXf: globalUniforms.uLampXf,
    uLampGain: globalUniforms.uLampGain,
    uLampSpotN: lampSpotUniforms.uLampSpotN,
    uLampSpotP: lampSpotUniforms.uLampSpotP,
    uLampSpotC: lampSpotUniforms.uLampSpotC,
    uLampSpotD: lampSpotUniforms.uLampSpotD,
    uLampSpotBox: lampSpotUniforms.uLampSpotBox,
    uLampSpotBox2: lampSpotUniforms.uLampSpotBox2,
    uLampSpotSplit: lampSpotUniforms.uLampSpotSplit,
  };
}

const f = (v: number) => v.toFixed(8);

/**
 * Fragment chunk. Declares its own uniforms (guarded against double inclusion) and
 *   vec3 thLampLight(vec3 worldPos, vec3 worldNormal)
 * The lamps module owns the exact encoding (see the header) and may refine this function
 * without changing its signature.
 */
export const LAMP_GLSL = /* glsl */ `
#ifndef TH_LAMP_GLSL
#define TH_LAMP_GLSL
#define TH_LAMP_SPOTS ${TH_LAMP_SPOTS}
uniform sampler2D uLampMap;
uniform vec4 uLampXf;
uniform float uLampGain;
uniform int uLampSpotN;
uniform vec4 uLampSpotP[TH_LAMP_SPOTS];
uniform vec4 uLampSpotC[TH_LAMP_SPOTS];
uniform vec4 uLampSpotD[TH_LAMP_SPOTS];
uniform vec4 uLampSpotBox;
uniform vec4 uLampSpotBox2;
uniform int uLampSpotSplit;
vec3 thLampLight(vec3 wp, vec3 wn) {
  vec3 acc = vec3(0.0);
  wn = normalize(wn);
  if (uLampGain > 0.001) {
    vec2 uv = (wp.xz - uLampXf.xy) * uLampXf.zw;
    if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
      vec2 uvA = vec2(uv.x * ${f(LAMP_MAP.pw / LAMP_MAP.width)}, uv.y);
      vec4 a = textureLod(uLampMap, uvA, 0.0);
      vec3 E0 = a.rgb * a.rgb;
      if (E0.r + E0.g + E0.b > 3e-5) {
        vec4 b = textureLod(uLampMap, uvA + vec2(${f((LAMP_MAP.pw + LAMP_MAP.gap) / LAMP_MAP.width)}, 0.0), 0.0);
        float headY = a.a * 50.0 - 10.0;
        float pole = max(b.a * 32.0, 0.8);
        vec2 D = b.rg * 2.0 - 1.0;
        float dk = min(length(D), 1.0);
        vec2 dir = D / max(dk, 1e-3);
        float dh = b.b * 20.0;
        // virtual lamp seen from this surface point
        float v = headY - wp.y;
        float d2 = dh * dh + v * v + 0.35;
        float id = inversesqrt(d2);
        vec3 L = vec3(dir.x * dh, v, dir.y * dh) * id;
        // shaded heads: (almost) nothing above the lamp; lanterns leak a little sideways
        float cut = smoothstep(-0.22, 0.32, L.y);
        float lamD = dot(wn, L);
        // light from several sides: the horizontal part wraps around the surface
        float lamI = L.y * wn.y + sqrt(max(1.0 - L.y * L.y, 0.0)) * length(wn.xz) * 0.34;
        float lam = max(mix(lamI, lamD, dk), 0.0);
        // re-project relative to the horizontal ground the map was baked on
        float d2g = dh * dh + pole * pole + 0.35;
        float Gg = pole * inversesqrt(d2g) / d2g;
        float Gp = lam * cut / d2;
        float r = Gp / max(Gg, 1e-5);
        r = r * 1.3 / (1.0 + 0.3 * r); // = 1 on the baked ground, bounded near the heads
        acc = E0 * (4.0 * r) * uLampGain;
      }
    }
  }
  if (uLampSpotN > 0) {
    bool in0 = wp.x > uLampSpotBox.x && wp.z > uLampSpotBox.y && wp.x < uLampSpotBox.z && wp.z < uLampSpotBox.w;
    bool in1 = wp.x > uLampSpotBox2.x && wp.z > uLampSpotBox2.y && wp.x < uLampSpotBox2.z && wp.z < uLampSpotBox2.w;
    if (in0 || in1) {
      int s0 = in0 ? 0 : uLampSpotSplit;
      int s1 = in1 ? uLampSpotN : uLampSpotSplit;
      vec3 sp = vec3(0.0);
      for (int i = 0; i < TH_LAMP_SPOTS; i++) {
        int k = s0 + i;
        if (k >= s1) break;
        vec4 P = uLampSpotP[k];
        vec3 toL = P.xyz - wp;
        float d2 = dot(toL, toL);
        if (d2 > P.w * P.w) continue;
        float id = inversesqrt(max(d2, 1e-4));
        vec3 L = toL * id;
        vec4 C = uLampSpotC[k];
        vec4 Dd = uLampSpotD[k];
        float cone = smoothstep(C.w, Dd.w, dot(-L, Dd.xyz));
        // visor: no light steeper than the beam axis (roofs right below a mast stay dark; the near
        // half of a pitch is lit by the opposite masts, as on real stadium rigs)
        cone *= 1.0 - smoothstep(0.04, 0.16, L.y + Dd.y);
        float win = 1.0 - smoothstep(0.55, 1.0, d2 * id / P.w);
        // softened inverse square (no blow-out on surfaces right below the heads)
        sp += C.rgb * (cone * win * max(dot(wn, L), 0.0) / (d2 + 0.0625 * P.w * P.w));
      }
      // overlapping floodlights brighten but compress (luminance knee 3)
      float Y = dot(sp, vec3(0.2126, 0.7152, 0.0722));
      acc += Y > 1e-5 ? sp * (3.0 * (1.0 - exp(-Y / 3.0)) / Y) : vec3(0.0);
    }
  }
  return acc;
}
#endif
`;

/**
 * Drop-in for Lambert / Phong / Standard / Physical shaders (after `#include <lights_fragment_end>`):
 * world position + normal from the built-in view-space varyings, lamp light added to the
 * indirect diffuse term. Needs LAMP_GLSL in the fragment pars and lampUniforms() merged.
 */
export const LAMP_APPLY_VIEW = /* glsl */ `
#ifdef TH_LAMP_GLSL
{
  vec3 thLwp = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz + cameraPosition;
  vec3 thLwn = (vec4(normal, 0.0) * viewMatrix).xyz;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * thLampLight(thLwp, thLwn);
}
#endif
`;
