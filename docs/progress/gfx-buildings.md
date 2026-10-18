# gfx-buildings — graphics overhaul, buildings workstream

## Resume here (updated every step)
* FINISHED — final report below ("## Final report"). Nothing running. All B1–B6 items done except my own perf A/B
  (handed to the lead's consolidated run, variants under "Perf variants for lead").
* Final full-city sets (1600×900, 0 console errors / warnings, invariants {} in every run): shots/buildings/final
  (11 h), final18 (18.2 h), final21 (21.5 h); baseline close-ups shots/buildings/final_base. Sheets:
  shots/buildings/ba_day_11.png, ba_day_11b.png, ba_gold_18.png, ba_night_21.png, ba_closeups.png, ba_more.png.

## Brief (B1–B6)
* B1 glass: coherent stylised reflection model (horizon line, reflected skyline + neighbours, cloud streaks,
  per-panel oil-canning instead of tint noise, sky-tinted Fresnel, sun glint streak, mullion sheen, lit crowns,
  band-limited blinds).
* B2 facades/roofs: macro weathering readable at 100–300 m, stronger filtered wall patterns, daytime windows
  (sky reflection, curtains / nets / blinds / plants / open windows), roofs (tile patches, lichen, streaks;
  flat roofs with membrane seams, gravel, stains, drains, moss).
* B3 house massing variants in `genHouse` (inside footprints, doors kept, `?validate` clean).
* B4 far-field night glow (district keeps contrast when windows are sub-pixel).
* B5 `thLampLight` in shell + trim.
* B6 before/after sheets, perf A/B.

## Design (as implemented)
* `materials.ts` — shell shader rewritten (original kept verbatim in `legacyShell.ts`, `?legacyfacade`).
  - 256² RGBA mip-mapped procedural noise texture (`makeNoiseTexture`): r macro fbm, g mid fbm, b streak field,
    a grain. Mip-mapping = free box filtering at distance (no shimmer).
  - New vertex attribute `aD` (Builder.wall writes it): metres from the quad's left end, quad length, world top
    of the quad, flags (corner bits). Drives dirt under copings / cornices, corner darkening.
  - Walls: stronger patterns that fade to their mean + keep ±8–12 % mid-scale tone; weathering = top wash in
    ragged streaks, AO under the band top, splash zone + base band, corners, 25 m blotches, per-floor drift,
    rain streaks below sills + sill-end drips (window-cell aware).
  - Glass: `bhEnv()` stylised environment (sky gradient + sun-side glow + cloud plane streaks + hazy far skyline
    + near neighbours whose roofline depends on the fragment height + ground), horizon lifted by `uReflLift`
    (follows the camera tilt, set in buildings.ts), per-panel normal wobble (oil-canning), reflection tinted only
    partly by the glass colour (golden hour reads warm), sun glint streak from `uSunDir`, metallic mullions
    (metalness override), lit crown wash on tall office towers at night.
  - Windows: brighter daylight interiors, side curtains / net curtains / roller blinds / pot plants / open sashes;
    office venetian blinds coherent per unit with box-filtered slats.
  - Far field: stochastic block LOD — blocks of 2^k cells switch together (k from the pixel footprint), expected
    brightness = occupancy, blend between levels (no popping), warm/cool per block.
  - Roofs: flat = membrane sheets + seams + repairs + gravel ballast + ponding stains + drains + moss;
    tiles/slate = patches, down-slope streaks, eave dirt, lichen; metal/corrugated/copper streaks.
  - Lamp light (`LAMP_GLSL`) added to shell and trim.
* `buildings.ts` — uniforms from `samplePalette()` (stage's palette API, read-only import) + live sun/hemi lights.
* `homes.ts` — new `genHouse` (plans classic / veranda / lplan / garage / bay; roofs gableX / gableZ / hip /
  halfhip / gambrel; rear extension; two-tone; dormer mix). Original kept as `genHouseLegacy` (`?legacyhouses`).

## Toggles
`?legacyfacade` (original shell shader), `?legacyhouses` (original house generator), existing `?bdbg=…`.

## Status
* [x] M0 code: shader rewrite, aD attribute, homes.ts variants, lamp light — typecheck clean (19:4x).
* [x] M1 first captures (shots/buildings/it1, subset only=sky,terrain,roads,buildings,postfx at 1280×720) —
  invariants {} / validate [] / 0 console errors; house variants confirmed (26 houses: 7 classic, 6 veranda,
  5 bay, 6 lplan, 2 garage). Findings → fixes: noise lookups were 10–50× too fine (scale rule now documented in
  materials.ts); roof lichen used the anisotropic streak channel (scratch marks) → isotropic; glass lost its
  colour identity (pale grey / beige at golden hour) → coated-glass reflection tint 0.78, F0 0.26, daylight
  interiors + curtains moved to ALBEDO (follow sun / shade / shadow; emission = lamps + reflection only);
  reflected-neighbour window specks (glitter at night) removed → soft floor bands; panel wobble halved;
  weathering strengthened (dirt tint darker, top wash longer, rain streaks 0.5).
* [x] M2 iteration 2 (shots/buildings/it2): glass identity restored (blue Haven Tower, teal octagon), reflected
  skyline / neighbour silhouettes read as reflections, night overview glows by district with lit crowns.
  Then: reflected neighbours lighter (mixed 30 % toward the horizon colour) and lower; office late-evening
  occupancy 0.10→0.20; lit-room intensity 2.0→2.7 (bloom threshold at night ≈ 0.9 lum); wall noise fetches merged
  (5→3 per wall pixel, 4→3 per roof pixel); far-field block glow computed only when detail < 1.
  NOTE: at the overview (560 m) window cells are still ≥ 5 px, so the far-field path matters only beyond ~2 km /
  on low resolutions; the overview night glow comes from window brightness + bloom + crown washes.
* [x] Debug: `?bdbg=weather` (weathering mask on white), `?bdbg=wallinfo` (aD info), and
  `__city.ctx.services.buildings.setDebug(n)` / `.houses()` (per-house plan log for close-up views).
  The mask showed weathering far too weak (mix toward the dirt tint halves every weight; squared streak channel
  has a low mean) → weights roughly doubled, streak channels linearised (sqrt).
* [x] House plan / roof weights rebalanced (garage plans 2 → more, gambrel weight 0.3 for single-storey gables).
* [x] M3 iteration 3 (shots/buildings/it3): variant close-ups hB/hC/hD (garage wing + two-tone + dormer +
  solar; L-plan with porch; veranda + dormers; hip bungalow with door hood; full-width verandas) all read well at
  11 h and 18.2 h; weathering now visible at POI distance (rain streaks under the hotel windows, darker bases, top
  wash). Fixes: no solar panels on slopes that carry dormers; rain streaks 0.8→0.7; garage wing feasibility relaxed
  (garage 2.9–3.6 m, main body ≥ 4.3 m). Tri cost: shell 3816→3962, trim 139.4k→140.4k, lights 5424→5496, meshes 15.
* [~] M4 full-city night (shots/buildings/full21, 1600×900, all modules): big step up — lamp light washes the
  hotel / shop fronts warm (B5 works with the night agent's baked map), districts glow from the overview, tower
  crowns lit, westbrook windows warm. Draw calls 132–167, 1.6–1.9 M tris (full city).
  OPEN: (a) lit house windows show fine dark speckles (also in the subset run → buildings path or postfx
  interaction) — diagnosing with no-postfx / no-AO shots (shots/buildings/speck); (b) one frame (house 21.5) had a
  black rectangle (NaN-style bloom/DOF blackout) — checking whether it comes from the shell.
  Octagon tower crown wash slightly strong → trimmed (glass 0.7→0.55).
  (a) SOLVED in code (not yet re-verified by a capture): speckles = per-pixel lit/curtain flips. `seed` (an integer
  per primitive) arrives as an interpolated varying with ~1e-4 jitter, which the chaotic hashes + `fract(r·k)`
  re-hashes amplify; present without postfx (shots/buildings/speck/nopost.png). Fix: `seed = floor(vB.z + 0.5)`
  (walls) and `floor(vA.x/.y + 0.5)` (roofs) in materials.ts. (The legacy shader has the same flaw.)
  (b) black rectangle: only seen in a full-city frame, never in subset runs → probably not the shell; as a safety
  measure Builder.quad/triangle now give degenerate faces a valid normal (a zero normal → NaN in shaders), and the
  flat-roof drain smoothstep width is clamped ≥ 1e-3.

## PAUSED (user budget pause) — exact state
* All files typecheck (npx tsc --noEmit: no buildings errors). No background jobs of mine running.
* Last capture launched (speck2: house/downtown/tower at 21.5 + 11, subset, 1600×900) was killed before finishing.
## Next steps on resume
1. Re-run speck2 (≤ 15 min lock): confirm speckles gone + crown trim; check night tower glass.
2. Full-city day/golden chunks for B6 (POIs downtown, oldtown, westbrook, industry, overview + tower/house
   close-ups at 11 and 18.2, 1600×900; one hour per run to stay ≤ 15 min); night chunk exists in shots/buildings/full21
   but predates the speckle fix → re-run 21.5 too. Before = shots/baseline/<poi>_<h>.png (5174, 1600×900) +
   close-ups from 5174 (shots/buildings/base is 1280×720 subset → re-capture close-ups on 5174 full city).
3. Sheets: python3 -I shots/tools/sheet.py shots/buildings/ba_<x>.png 2 900 "before|…" "after|…".
4. perf.mjs A/B (two runs ≤ 15 min each): downtown 12 h and overview 21.5 h, variants
   ";legacyfacade&legacyhouses;skip=buildings" (+ ";legacyfacade" if time). Report draw calls (unchanged, 15
   building meshes), tris (+~1.2 k), SwiftShader relative ms, GPU estimate.
5. Final report to the lead (≤ 350 words).
* [ ] tuning passes (glass, weathering strength, roofs, night far field), house validation (`?validate`, invariants)
* [ ] re-tune under stage's new lighting
* [ ] B6 full before/after sheets + perf A/B

## Shots
* baseline subset (5174, only=sky,terrain,roads,buildings,postfx, 1280×720): `shots/buildings/base/`
* iteration 1: `shots/buildings/it1/`, iteration 2: `shots/buildings/it2/` (+ otclose, overview),
  weathering mask: `shots/buildings/dbg/`, validation: `shots/buildings/val/` (inv1.json: invariants {}, validate [])

## Perf variants for lead (consolidated A/B on a quiet machine)
`;legacyfacade&legacyhouses;skip=buildings` (+ optionally `;legacyfacade` and `;legacyhouses` separately).
Views: downtown 12 h and overview 21.5 h. Expected: draw calls identical (15 building meshes), tris +~1.2 k.

## Requests to other areas
* (none yet)

## Changes outside my area
* none. Dependency: `buildings.ts` imports `samplePalette`, `SkyState` from `src/render/sky/palette.ts` (stage) —
  please keep that API.

## Final report
**Visual changes** (`src/world/buildings/*`):
* Glass (materials.ts shell shader rewrite): stylised reflected environment — sky gradient, warm glow toward the
  sun, cloud streaks, per-facade horizon (lift follows camera tilt), hazy reflected skyline + neighbour silhouettes
  (lower floors mirror the street canyon → vertical gradient), per-panel oil-canning, luminance-based coated-glass
  tint (identity kept, no olive at golden hour), sun-glint streaks, metallic mullions, lit crowns at night,
  box-filtered blinds/curtain folds.
* Facades: readable weathering (coping/cornice dirt washing down in streaks, rain streaks under sills, splash zone,
  corner darkening, 8 m blotches, per-floor drift) via a mip-mapped procedural noise texture + new per-wall `aD`
  attribute (mesh.ts); stronger filtered brick/stone/plaster/siding/panels.
* Windows: daylight interiors/curtains lit by the scene (albedo) so shaded facades no longer glow; nets, roller
  blinds, plants, open sashes; pane reflection gradient. Fixed two speckle bugs (interpolated seeds; `mod(kind,8)`
  wrapping for home windows — pre-existing, visible as sparkly panes in the baseline).
* Roofs: membranes with seams/repairs/gravel/stains/drains/moss; tiles/slate with patches, streaks, lichen.
* Night: brighter lit rooms (bloom-friendly), more late office lights, far-field block glow, `thLampLight` in shell
  + trim (warm wash on fronts near lamps).
* Houses (homes.ts): classic / veranda / L-plan wing / garage wing / bay plans × gable / front gable / hip /
  half-hip / gambrel roofs, rear extensions, two-tone walls, dormer mix. invariants {} / validate [].

**Toggles:** `?legacyfacade`, `?legacyhouses`, `?bdbg=weather|wallinfo`, `__city.ctx.services.buildings.setDebug/houses`.

**Perf:** building meshes unchanged (15 → draw calls unchanged; full city 117–166 dc); tris shell 3816→3960,
trim 139.4k→140.3k, lights 5424→5496. GPU estimate: shell fragment ALU +25–35 % (3 noise fetches per wall pixel,
reflection model on glass; far-field hashing only when sub-pixel; lamp fetch gated by uniform) → ≈ +0.2–0.4 ms in
glass-heavy downtown close views, less elsewhere; may exceed the 0.3 ms budget in downtown — to confirm in the lead's
consolidated A/B (`;legacyfacade&legacyhouses;skip=buildings`).

**Open:** garage-wing plan is rare (1–2 of 26 houses: door/driveway constraints); black-rectangle blackout under
stage's investigation; sun glints only appear with the sun behind the camera (physically placed).

