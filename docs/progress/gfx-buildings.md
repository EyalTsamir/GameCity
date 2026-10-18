# gfx-buildings — graphics overhaul, buildings workstream

Owner files: `src/world/buildings.ts`, `src/world/buildings/*`. Audit items 5 (glass towers), 8 (facades / roofs /
daytime windows), house massing half of 9, far-field night windows of 2, lamp-light integration (B5).

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
  Octagon tower crown wash slightly strong → to trim.
* [ ] tuning passes (glass, weathering strength, roofs, night far field), house validation (`?validate`, invariants)
* [ ] re-tune under stage's new lighting
* [ ] B6 full before/after sheets + perf A/B

## Shots
* baseline subset (5174, only=sky,terrain,roads,buildings,postfx, 1280×720): `shots/buildings/base/`
* iteration 1: `shots/buildings/it1/`, iteration 2: `shots/buildings/it2/` (+ otclose, overview),
  weathering mask: `shots/buildings/dbg/`, validation: `shots/buildings/val/` (inv1.json: invariants {}, validate [])

## Requests to other areas
* (none yet)

## Changes outside my area
* none. Dependency: `buildings.ts` imports `samplePalette`, `SkyState` from `src/render/sky/palette.ts` (stage) —
  please keep that API.
