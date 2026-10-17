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

## Milestones
- [x] H4 lamp light integrated (black until the night agent bakes the map)
- [ ] H3 gardens (layout + models wired; patio surfaces in roads pending; not yet screenshotted)
- [ ] H1 surfaces
- [ ] H2 scatter
- [ ] H5 verification

## Toggles
`?nogardens` · `?propscast=0` (planned: `?noscatter`, `?legacyground`)

## Requests to other areas
- vegetation: none required (garden spots are in `layout.furniture`, already honoured).

## Changes outside my area
- none

## Notes
- Offline plan tools in the scratchpad (rolldown-bundled plan/occupancy/ped graph + PIL map) are used for placement.
