# gfx-night — night showcase (audit item 2: emitters + shared lamp light map)

Owner: night agent. Files: `src/world/lamps.ts`, `src/world/lamps/*` (bake.ts, integrate.ts, …),
`src/core/lampLight.ts` (internals; API kept), `src/world/props/glow.ts`, `src/world/terrain/glow.ts`,
`src/world/landmarks/{glows,shaders,materials}.ts`, glow/floodlight parts of `src/world/harbor.ts` +
`src/world/harbor/material.ts`.

## Brief
Replace the flat additive "polka-dot" light pools by real light: every static light is registered in
`core/lampLight.ts`, baked once into a top-down light map, and every integrated material multiplies it
by its own albedo (`thLampLight(worldPos, worldNormal)`). Harbour gets floodlights / crane work lights,
the stadium pitch becomes a crisp cool floodlit island. Halos / lamp heads stay.

## Design (implemented)
* **Registry** (`addLampLights`): `LampLight` gained optional `aim` (aimed spots), `cone`, `pole` (head
  height above its ground), `channel` (scheduled / moving lights, not baked). New exports (additive):
  `bindLampChannel(name, {value})`, `lampChannel`, `LAMP_MAP`, `TH_LAMP_SPOTS`, `lampSpotUniforms`,
  `LAMP_APPLY_VIEW` (drop-in GLSL after `#include <lights_fragment_end>` for Lambert/Phong/Standard —
  rebuilds world pos/normal from vViewPosition/normal, no varyings).
* **Bake** (`lamps/bake.ts`, CPU, after `'modules:ready'`): domain x −204..204, z −194..154, 0.5 m/texel,
  one RGBA8 texture 1636×696 = two panels side by side (gap 4 texels):
  * panel A: rgb = sqrt(E/4) ground irradiance (sum of lights, luminance soft-compressed
    K·(1−e^(−Y/K)), K 2.4), a = (head y + 10)/50 (luminance-weighted mean)
  * panel B: rg = mean horizontal direction towards the lights (·0.5+0.5; length = one-sidedness),
    b = mean horizontal distance / 20 m, a = mean head height above ground / 32 m
  * light model: down-light E = I·(P/d)^(3+k) (k per kind: street 1.6, path 1.1, plaza 1.4, portal 1.0),
    aimed spot = smooth cone normalised so the aim point receives I; window ends the pool at 1.5×radius;
    stretch/yaw → elliptic falloff. Colours normalised to luminance 1 (intensity = brightness).
* **thLampLight**: rebuilds one virtual lamp per texel (direction, distance, head height) and
  re-projects the baked ground irradiance to any height/orientation: ratio = (N·L·cut/d²) / (ground
  reference), softly bounded (×1.3/(1+0.3r)) → walls facing a lamp get a scalloped wash that stops at
  the head, roofs above the heads stay dark, crowns lit from below, ratio 1 on the baked ground.
  Mixed with an isotropic term when lights surround the point (|D| small).
* **Analytic spots** (scheduled/moving): ≤ TH_LAMP_SPOTS packed every frame by the lamps module from
  lights with `channel`; channel 'stadium' = landmarks uFlood (bound in landmarks/materials.ts),
  built-in channel 'lights' = street-light state. Box early-out.
* **Gain**: uLampGain = smoothstep(uLights)·(0.8+0.2·uNight)·?lampk.
* **Glow files**: pools are no longer drawn — props/terrain/landmark/harbour glow builders register each
  pool as a light (paired with the halo of the same lamp for head height / aim); halos, beams, aviation
  lights, underwater fountain lights stay additive. Stadium pools → 4 aimed spots on 'stadium'.

## Toggles
`?legacylamps` old additive pools, map dark (A/B) · `?lampall` preview: lamp light on every lit
material not integrated yet (`lamps/integrate.ts`, never double-applies) · `?lampk=1` gain ·
`?lampdebug` (+ `ctx.services.lamps.preview()` PNG of the panels).

## State
* 2026-10-17 ~19:30: lampLight.ts internals + bake + lamps module + props/terrain/landmarks glow
  registration + landmarks material integration written; typechecks.
* ~20:40: harbour done in code: harbor/material.ts integrates thLampLight (solid + rigged), pools →
  lights, crane work lights = 3×2 moving spots (channel 'lights', `followCraneLamps` in harbor.ts frame),
  4 floodlight masts (2 quay apron ends, 2 north-strip yard ends; `lamps/harborLights.ts`, geometry in
  harbor-north, 8 aimed cool luminaires), ferris wheel + carousel light. Shop-window spill
  (`lamps/spill.ts`, plan lots with shopfront, ~4.5 m spacing, 15 % "closed"). Spots: 12 max, two
  spatial groups with their own early-out boxes; softened 1/(d²+(reach/4)²) + luminance knee.
  Offline replica test of bake+shader math: scratchpad baketest.mjs (rolldown bundle of bake.ts).
* Bugs found: my sed dropped textureLod's lod arg (lead fixed); pools looked missing because uLights
  went negative / ramped slowly in harness runs (main.ts realDt; lead fixed). Map verified:
  shots/night/dbg_wb.png (westbrook, warm pools on all streets).
* vehicles + trains: `patchLampMaterial()` one-liners (approved by lead).
* ~22:30: it2/it3 (shots/night/it2, it3): westbrook/park/oldtown/beach/stadium/overview/station/street
  views judged good; full city 0 console errors, 138–158 draw calls. Tuning done: tall street poles
  widen (radius ≥ 0.95·pole), reach 2×radius; stadium spots cross-aimed past centre, cone 0.46,
  intensity 0.9, near-side visor + softened 1/(d²+(reach/4)²) + luminance knee 3, `shield` flag
  (roofs high up near the head get ≤15 %); flood lamp-bank halos ×0.55 size; harbour masts 0.9–0.95,
  crane spots 1.1. Rail platform pools retired (rail.ts, approved).
* Perf A/B (SwiftShader, downtown 21.5 h, 1280×720, one run): new 560 ms vs legacy 455 ms per frame
  (second pair; first pair 923 vs 871 = warm-up). → added early-outs before the 2nd fetch (no light /
  surface > head + 2.5 m). Rerun pending.
* 2026-10-18 ~00:xx: resumed after the usage-limit stop (container restarted, checkpoint 01b96a3).

## Next
1. Harbour: integrate thLampLight in harbor/material.ts; register harbour pools; crane work lights as
   moving spots (follow uCrane); add quay / container-yard floodlight masts (geometry in a lamps/ file).
2. First captures with `?lampall` (21.5 h, 2 h): westbrook, park, oldtown, downtown, harbor, beach,
   riverside, stadium, overview + street level; tune intensities/colours/compression.
3. Stadium pitch island; dusk 19.8 h fade; perf A/B (`?legacylamps`), draw calls.
4. Re-tune after stage's night ambient lands; verify other owners' integrations; report gaps.

## Requests to other areas
* boats (water agent) / pedestrians (people workstream): can get lamp light with one
  `patchLampMaterial(material)` call (src/world/lamps/integrate.ts) — lead relayed.

## Changes outside my area
* src/sim/traffic/vehicleMaterial.ts, src/sim/rail/trainMaterial.ts: import + `patchLampMaterial(material)`
  (lead-approved) so cars and trains catch the street lights.
* src/sim/rail.ts (lead-approved): platform-lamp + canopy-strip pools set to intensity 0 unless
  ?legacylamps; the lights are registered with addLampLights (rail loads before the bake).
* src/world/harbor.ts: floodlight masts call (buildHarborFloodlights), carousel light, followCraneLamps
  in frame(), floodMasts stat (harbour glow/floodlight parts = my area).
