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
* `?legacylight` — original palette, shadow filtering, IBL, contact decal, no table, legacy bloom/grade/AO.
* `?notable` — studio key without the table (old contact decal shown; perf A/B of the table alone).
* runtime: `__city.ctx.services.sky.setLegacy(bool)`, `.setTable(bool)`, `.tune = {sun,hemi,env,exposure,pcf,bias}`.
* `?debug`: `ctx.services.postfxInternals.adaptive.set(level)` / `.ladder` to force ladder steps.

## Status
* S1 DONE (announced 20:25): studio key live. First A/B on the private frozen copy :5175 →
  shots/stage/s1b/<view>_<h>_{new,old}.png (overview/park/oldtown/cu × 11/16.5/18.2). Findings + fixes:
  - shadows measured navy (cu 11 shadow asphalt sRGB 25,42,67) → hemi sky greyer, env sky desaturated 55/35 %,
    AO tint #25262c, grade shadow tint (−.004,0,.007);
  - golden-hour tree crowns near-black → hemi 0.58–0.64, warmer brighter hemiGround, exposure 1.15–1.22.
* S1 check on the shared tree (5173, everyone's WIP): shots/stage/s1c/<overview|park|harbor|cu>_<11|18h2|21h5|2>_new.png.
  Shadow fit: park 130 m → half 128 m / texel 12.5 cm / PCF 1.5 texel; overview 28 cm / 1.0; cu 2.2 cm / 3.2.
  Shadow asphalt cu 11 now sRGB (29,39,57) (was 25,42,67 → navy). Golden hour: long crisp warm shadows, cool
  crown sides. Night unlit p25 luminance (sRGB) −40 % overview, −45 % park vs baseline; roofs a bit too dark →
  moon 0.40→0.50, night cyc #131a37, table→indigo fade pulled in at night (uFade 60/640 → 32/370).
* S2: table + dome studio floor working (overview: model grounded on planks, analytic slab shadow visible
  east of the plinth at 16.5). First oak texture too orange/busy → paler limed oak, fade 60→640 m.
* S2 verified on :5175 (shots/stage/s2a/<view>_<h>_new.png; views overview, edge=0,0,-20,700,210,10,
  low=-5,0,-15,450,120,14, top=0,0,-20,720,0,85, corner=203,-20,153,70,45,20, south=0,-10,150,160,0,12 ×
  11/18.2/21.5): no table edge/seam/z-fight from any of them; top-down shows the hill-profile slab shadow north
  at noon and the long slab shadow east at 18.2; edge-on shows the soft floor→sky sweep (pale blue by day, amber
  at 18.2, indigo at night); corner close-up: strata, plinth, contact shadow, planks. Draw calls equal to
  baseline (table replaces the decal). Fixes after review: moonlit varnish sheen read as haze → uTableSpec
  1→0.3 at night; day fade far 640→560 so the time-of-day backdrop shows at the top of the hero frame.
* S3: aircraft routes moved (balloon/blimp loops NW, plane crossing N and left↔right in the hero view; blimp
  leaves north). Adaptive ladder: full → refl-low → no-ao → scale-0.85 → dof-lite → scale-0.72 → refl-off → scale-0.6.
* S4: not started.

* Dawn 6.5 (s1d): rose key / mauve backdrop, distinct from the amber dusk; exposure 1.16–1.18 at 5.3–6.7.
* Queued: S4 before (5174) / after (5173) sets → shots/stage/{before,after}/<view>_<h>.png, ladder test
  (shots/stage/ladder), single-page perf A/B on :5175 (shots/stage/perf_overview.log).

* Dome now drawn after the opaque queue with a depth test (renderOrder 1000, z at the far plane): only
  uncovered pixels are shaded — with the table in the background that is usually none (was a full-screen
  pass, overdrawn). Offsets the table's fragment cost.
* Aircraft (S3): at 140 m no position is both inside the hero frame and near its focus depth (computed by
  projecting the loop points), so the blimp stays just above the hero frame (crisp in edge-on / low views);
  the balloon (94–137 m) appears crisply at the top edge. Old routes sat ~180 m in front of the focus plane.

## Test setup notes
* :5175 = /home/user/GameCity-stage (git archive f5ff0a5 + my files via sync.sh, own Vite cacheDir).
* scratchpad stage-cap.mjs: views × hours × runtime variants in one page load (`S.setLegacy(true)`).

## Requests to other areas
(none yet)

## Changes outside my area
(none)
