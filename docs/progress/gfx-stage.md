# gfx-stage — lighting key, studio tabletop, composition, adaptive ladder

Owner: stage agent. Files: `src/render/**` (sky, sky/*, postfx, postfx/*, stage/*), `src/world/terrain/slab.ts`,
aircraft routes in `src/sim/ambient/vehicles.ts`.

## Brief (audit items 1, 3 + night ambient of 2)
S1 new lighting key (sun-dominated, weak cool fill, exposure comp., golden hour, dawn, crisp shadows, AO, dark night).
S2 studio tabletop (table under the plinth, slab shadow + contact shadow, cyclorama backdrop following time of day).
S3 aircraft out of the hero DOF band; adaptive ladder incl. water reflection steps.
S4 before/after sheets, perf A/B.

## Design
* **Palette** (`sky/palette.ts`): two key sets — `KEYS` (studio, default) and `LEGACY_KEYS` (`?legacylight`).
  Studio day: sunI 4.3–4.4 (was 3.4–3.5), hemiI ~0.54 (was 0.95), env 0.5 with the DIFFUSE part of the
  IBL scaled ×0.6 globally (`sky/iblPatch.ts`, chunk patch → reflections keep full env), exposure 1.06–1.12.
  Golden hour 17.6–18.6: amber sun #ffc68a→#ff9d56 at 4.1–3.6 vs periwinkle fill. Dawn 6.0–6.7 rose/lilac.
  Night: moon #a7b4d6 0.40 (was #8ea3dc 0.62), hemi 0.5 (was 0.95), env 0.42, exposure 1.12.
  New field `cyc` = cyclorama backdrop colour per key.
* **Shadows** (`sky.ts`): PCF radius in world units (0.15 m + golden-hour/moon/overcast terms) converted to
  texels, clamped 1..3.2; normalBias texel×0.8 (was 1.1); fitter maxR 1.2·d+24 (was 1.55·d+30).
* **Env** (`sky/env.ts`): studio = smaller sun lobe, sky part of the fill desaturated 20–30 %.
* **Bloom/grade** (`postfx.ts`): day threshold 1.45 (night 0.88), intensity 0.26→1.0 at night; night WB −0.012.
* **Studio table** (`render/stage/table.ts`, built by `slab.ts`, uniforms owned by sky as `ctx.services.stage`):
  8400 m oak plane at plinth bottom −0.03, fades (after fog) into `uCyc` (= dome below-horizon colour) with
  distance from the plinth outline; analytic slab+plinth shadow traced against the real edge profile (half-float
  256×4 texture) with growing penumbra; analytic contact AO; city spill at night. Dome: studio floor sweep
  (`dome.setStudio`). Shadow fitter covers table strip (margin 14, minY −24.6).

## Toggles
* `?legacylight` — original palette, shadow filtering, IBL, contact decal, no table.
* runtime: `__city.ctx.services.sky.setLegacy(bool)`, `.tune = {sun,hemi,env,exposure,pcf,bias}` multipliers.

## Status
* S1: code in, first look pending (full city was broken by others' WIP; using a private frozen copy on :5175 —
  `/home/user/GameCity-stage`, `sync.sh` overlays my files).
* S2: table + dome code in, untested.
* S3, S4: not started.

## Next steps
1. Capture S1 A/B on :5175 (overview/park/oldtown/close junction × 11/16.5/18.2/21.5), tune, send "S1 done".
2. Tune table fade/colour, check low orbit / top-down / edge-on / follow cams.
3. Aircraft routes, adaptive ladder, sheets, perf.

## Requests to other areas
(none yet)

## Changes outside my area
(none)
