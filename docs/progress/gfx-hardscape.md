# gfx-hardscape — progress (hardscape agent)

Owner files: `src/world/roads.ts`, `src/world/roads/*`, `src/world/props.ts`, `src/world/props/*` (not `glow.ts`).
Audit items: 7 (empty / faint hardscape), garden half of 9 (bare back gardens), lamp light on roads/props.

## Brief
- H1 surfaces: macro asphalt patchwork, crack seal, patches, lane wear, queue oil, gutters; readable paving
  (bands, borders, district bonds, tonal patchwork, stains, drains); quays (slab joints, rust, edge line);
  yards (oil, tyre marks); colourful multi-sport schoolyard court. Box-filtered.
- H2 scatter on plazas / station forecourt / yards / quay / parking / courtyards (≤ +2 draw calls).
- H3 back-garden kit per house lot.
- H4 `thLampLight` in asphalt / hardscape / markings / props furniture materials.
- H5 before/after + perf.

## Design (as built so far)
- Garden layout: `src/world/props/gardenPlan.ts` (deterministic per lot, 0.25 m free-cell packing), exposed as
  `layout.gardens` (new field in `layout.ts`; existing exports unchanged). Every item is also pushed into
  `layout.furniture` keep-clear discs, which vegetation's `treeOk`/`bushOk` already honour → trees and bushes
  stay off pools/trampolines/sheds automatically. `?nogardens` disables the kit.
- Garden models: `src/world/props/garden.ts`. Big silhouettes go to a new `props-casters` mesh
  (castShadow; +1 draw call + its shadow pass; `?propscast=0` turns the shadows off). Small items in the
  existing fine furniture mesh (LOD-hidden > 300 m), pools in the coarse mesh.
- Lamp light (H4): done in roads materials (all three, via `inject()`) and props furniture material.

- Surfaces v2: `src/world/roads/glsl.ts` (ASPHALT2 / HARD2 / COMMON2), wired in `materials.ts`; the original
  shaders stay in materials.ts for `?legacyground` (also skips the new painted extras). New Voronoi texture
  `roadCracks()` (crack network, oil spots). Hardscape gets two more attributes: `aR` (cover rectangle) and
  `aB` (band period, band width, border width, macro tint) set by `band()` / `coverRect()` in surfaces.ts.
  District-specific plazas in covers.ts: downtown granite + basalt band grid (7.5 m), station clay herringbone
  + bands, midtown buff pavers, civic sandstone + border; block paving with a 10.5 m band grid; yards / quay
  specials (oil blobs, tyre streaks, rust halos at the quay bollards); herringbone driveways.
  Asphalt: resurfacing sections per street segment (cut point, one-lane resurfacing, junction boxes) with
  seams, sealed cracks on worn sections, trench cuts, patches, wheel polish, lane-centre oil + queue zones,
  gutter band; car-park oil spots; schoolyard court fill (blue court, green run-off, terracotta keys).
- Markings v2 (markings.ts, block "painted extras"): four-square + target + futsal outline in the schoolyard,
  yellow hatched keep-clear boxes at industrial/harbour loading doors, dashed quay lane line, blue/green bays.
- Scatter: `src/world/props/scatter.ts` (planner; per-zone 0.25 m free grid) + `src/world/props/kit.ts`
  (models). Built in props.ts after vegetation (uses its real trees), before the bollards; each item is
  pushed into `layout.furniture`. `?noscatter` disables it.

## Milestones
- [x] H4 lamp light integrated (black until the night agent bakes the map)
- [x] H3 gardens: layout + models + patios (first capture it1 looked good; roof pitch sign fixed)
- [~] H1 surfaces: v2 shaders written, first full capture pending (shots/hardscape/it3)
- [~] H2 scatter: planner + models written, capture pending
- [ ] H5 verification

## Iteration notes
- it3 (shots/hardscape/it3, subset modules, 11 h + 21.5 h): gardens read great (pools, trampolines, parasols,
  sheds, veg beds, stepping stones; caster shadows); plaza band grids + station herringbone read clearly; court
  is a strong accent; lamp light shows on roads/props at night. Weak: asphalt macro too subtle from afar,
  yards too sparse (wall-offset bug), concourse surface flat, sculpture next to the statue.
- round 2: bimodal asphalt ages + stronger cracks, concourse band grid, court desaturated 14 %, pool glow 0.32,
  yards denser (+ containers, pipes, timber, forklifts alongside walls), kiosk seating, café on more towers,
  public art ≥ 10 m from statues/fountains, patio pot plants, wheelie-bin rows fixed, props invariants check
  scatter/garden items against walk lines / roads / buildings.
- Note: the lead's view "0,0,-65,60,30,45" is blocked by a tower at this angle; plaza 40 is best seen from
  "-28,0,-24,40,15,45".

## Toggles
`?nogardens` · `?noscatter` · `?legacyground` (old asphalt/hardscape shaders + no painted extras) · `?propscast=0`

## Requests to other areas
- vegetation: none required (garden spots are in `layout.furniture`, already honoured).

## Changes outside my area
- none

## Notes
- Offline plan tools in the scratchpad (rolldown-bundled plan/occupancy/ped graph + PIL map) are used for placement.
