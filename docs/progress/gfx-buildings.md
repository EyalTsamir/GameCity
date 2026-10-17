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
* [ ] M1 first captures + fixes (iteration 1 running: shots/buildings/it1, baseline subset shots/buildings/base)
* [ ] tuning passes (glass, weathering strength, roofs, night far field), house validation (`?validate`, invariants)
* [ ] re-tune under stage's new lighting
* [ ] B6 full before/after sheets + perf A/B

## Shots
* baseline subset (5174, only=sky,terrain,roads,buildings,postfx, 1280×720): `shots/buildings/base/`
* iteration 1: `shots/buildings/it1/`

## Requests to other areas
* (none yet)

## Changes outside my area
* none. Dependency: `buildings.ts` imports `samplePalette`, `SkyState` from `src/render/sky/palette.ts` (stage) —
  please keep that API.
