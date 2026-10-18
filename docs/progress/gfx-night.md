# gfx-night — night showcase (audit item 2: emitters + shared lamp light map)

Owner: night agent. Files: `src/world/lamps.ts`, `src/world/lamps/*` (bake.ts, integrate.ts, …),
`src/core/lampLight.ts` (internals; API kept), `src/world/props/glow.ts`, `src/world/terrain/glow.ts`,
`src/world/landmarks/{glows,shaders,materials}.ts`, glow/floodlight parts of `src/world/harbor.ts` +
`src/world/harbor/material.ts`.

## Resume here
_Updated 2026-10-18 (resume #3), after every step._
**Done + verified:** bake + thLampLight + analytic spots; all glow files converted (pools → lights,
halos kept); harbour masts / crane spots / ferris + carousel; shop spill; landmarks + harbour materials;
rail platform lights; vehicles/trains patched; stadium roof fix (it4); dusk fade (dusk_sheet); perf A/B
(no measurable delta); 0 console errors (it3, it4, it5). Path-lamp blob fix verified
(shots/night/ov_fg_cmp.png): props/glow.ts `soft` path lanterns radius ×1.35, intensity ×0.72;
bake.ts CORE.path 0.6; terrain/glow.ts promenade radius ×1.4, intensity ×0.8.
People (town square, footbridge, shots/night/it5/peds_21h5.png, boats1) visibly pick up lamp light.
**Verified (program check, shots/night/progcheck.json):** the compiled colour programs of traffic-vehicle,
rail-train, boats and the people (lambert) materials all contain thLampLight (depth programs don't, correct).
**Running / in flight (check outputs on resume):**
1. Final set F1: DONE (0 errors; draw calls 139–161) → shots/night/final/; sheet shots/night/ba_night_A.png (judged: clear win).
2. Baseline street views at 21.5: DONE → shots/night/base215/street{,2}_21h5.png.
3. Final set F3 running: `--views "riverside;stadium;overview" --out shots/night/final3` → final_f3.txt.
4. Final set F2: same flags, `--views "downtown;harbor;beach" --out shots/night/final2` → shots/night/final_f2.txt.
**Next:** F4 `street=55,1.5,52,28,35,12;street2=-150,0,20,32,-35,22`
→ shots/night/final4 (same flags, hours 21.5,2) → sheets
(shots/tools/sheet.py; cols baseline21.5 | new21.5 | baseline2 | new2; baseline = shots/baseline/<poi>_21h5.png,
shots/night/base2h/<poi>_2.png, shots/night/base215/street*_21h5.png) → final report under "## Final report".

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
  it4 (shots/night/it4): stadium roofs 192→141–148 sRGB (no clipping; pitch ~180–195 = bright island),
  station platform lit by registered rail lights (no discs), street level good, 0 console errors.
* Perf A/B after early-outs (SwiftShader, 1280×720, 21.5 h, alternating pairs, ms/frame):
  downtown new 636 / 523 vs legacy 573 / 608; overview new 410 / 375 vs legacy 423 / 509 → no
  measurable difference (noise ±15 %). Draw calls identical (145 / 167): no mesh added or removed
  (pools were vertices in existing glow meshes; masts merged into harbor-north).
* Dusk (shots/night/dusk_sheet.png, oldtown from 19.18 h at 4×): lights + lamp light fade in together
  with uLights, no popping. Frames 1–2 show black bloom blocks (NaN somewhere) while the lamp gain is
  still 0 — being checked with/without ?legacylamps (shots/night/nan/).
* 2026-10-18 10:15: resumed after the second stop (checkpoint b929af3).
* 2026-10-18 ~10:40: PAUSED by the user (budget). No edit in progress; all my files typecheck; no
  background job of mine running (the NaN check shots/night/nan/ was stopped before it produced frames).

* 2026-10-18 resume #3 (branch afdbf92): dusk NaN check handed to stage (lead). Path-lamp blobs fix:
  park/riverbank/boardwalk lanterns radius 1.05→1.35 × old pool size, intensity ×0.72, CORE.path 1.1→0.6;
  promenade lamps (terrain/glow) radius ×1.4, intensity ×0.8. Verification run shots/night/it5
  (overview, park, people under lamps, boats at the jetty / ferry dock).

## Perf variants for lead
Same build, night (hours 21.5) — the lamp light map + analytic spots vs the old additive pools:
* `""` vs `legacylamps` at views downtown, overview, harbor, stadium (21.5 h; stadium floods on ~19.5–22 h)
* day sanity (hours 12): `""` vs `legacylamps` at overview (expected identical: uLampGain = 0 → uniform early-out)
* optional: `nospill` (shop-window spill lights; bake-only, no runtime cost expected)

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
