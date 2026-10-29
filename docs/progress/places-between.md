# places-between — spaces between buildings become places

## Resume here

- Branch `claude/places-between-586a7e` (worktree `.claude/worktrees/places-between-586a7e`), based on `claude/pensive-gates-bim12i`.
- Dev server: `npx vite --port 5186 --strictPort` in the worktree; harness from the main checkout with `--url http://127.0.0.1:5186/`.
- Done: data layer (`src/core/places.ts`), renderer (`src/world/terrain/places.ts`, drawn into the masonry + railing
  meshes), lower quay + old-town lane working (shots `shots/places/t2/*`), validate + invariants clean at first check.
- Next: walk-mode check on the stairs (`ui-test --steps walk` + probe), perf A/B (`?noplaces` variant), pond-island
  footbridge (3rd place) if budget allows, before/after shot set, build, final log.

## What exists

| place | where (view `x,y,z,dist,yaw,pitch`) | toggle |
| --- | --- | --- |
| Lower quay ("low quay"): paved ledge 0.85 m above the river along the north wall, x −63.2..10.9, z 110.25..114; two 7-riser flights from landings flush with the wall coping (gaps in the promenade railing), iron handrails, bollards, benches facing the water | top `-25,0,112,45,15,40`, eye `-58,0,111,22,10,6`, promenade `8,-0.3,112,10,-120,15` | `?nolowquay` |
| Old-town lane, block (4,1): archway passage under a gatehouse (stone arch ring, barrel vault, window, lanterns, tiled roof) from the avenue z=−10 into a paved pocket square (y 0.15); raised garden terrace (y 1.05) behind an ashlar retaining wall with coping + balustrade and a recessed 6-riser flight on the archway axis; stepped lane (2×3 risers + landing) down through the north row to the street z=−65 | top `82,1,-37,45,20,55`, square `83.7,1.2,-39,9,0,4`, arch `83.7,2.5,-22,13,0,3`, lane `80,1.5,-50,12,180,3` | `?nooldlane` |

All: `?noplaces`. Detail tier: `quality=low` or `?noplacedetail` → solid parapets instead of balusters, no arch ring / gatehouse windows.

## How it works (contracts)

- `src/core/places.ts` — `buildPlaces(plan)` runs at the very end of `generatePlan()` (rng stream untouched → the
  rest of the city is identical). Produces `plan.places` (`PlacesDef`): render data (`quay`, `lane`), `height(x,z)`
  (NaN outside places; stairs are true steps: tread i of n is i+1 risers up), `dry(x,z)` (quay ledge inside the river),
  `walls` (thin solid boxes for the walk mode), `railGaps`, `dropLadder`.
- Walkways: `WalkPath.ys?: number[]` (per-vertex heights) — pedNetwork uses `ys[k] ?? y`; walkSurface too. New paths
  are kind `promenade` (quay) / `plaza` (lane), `draw: false` (the stonework draws the surfaces).
- Footprint change (for the massing merge): block (4,1) — the south-row townhouse at the archway and the north-row
  townhouse at the lane are trimmed by 1.6 / 1.4 m each side (at an existing party wall when one is within 4 m, else
  a house is split and the east half appended as a new lot). Doors clamped onto the remaining facade.
- The (4,1) courtyard area keeps kind `courtyard` but its rect is now only the terrace (trees, bins, bikes stand on it
  via `terrain.height`).
- `plan.isWater` is false on the quay ledge → occupancy has no WATER there; boats' rowing loop (x 43..77) and the tour
  lane (z 118.25) are clear of it. River-wall ladder at x=−48 dropped (it would end on the ledge).
- `ctx.services.terrain.height` = places height where defined, else the terrain model (ground mesh unchanged —
  the places stand on it as solids). Vegetation / props / lamps / walk mode all read the service.
- Rendering: `buildPlacesStone` into the masonry GeoBuilder (`masonry.ts`), `buildPlacesIron` into the railing builder
  (`railings.ts` got an optional `extra` callback). 0 extra draw calls. Gatehouse lanterns → masonry `lights` (halos).

## Files touched

- new: `src/core/places.ts`, `src/world/terrain/places.ts`, this log
- `src/core/plan.ts` (import, `WalkPath.ys`, `CityPlan.places`, `buildPlaces` call, `isWaterAt` dry check)
- `src/core/pedNetwork.ts` (1 line: `ys`), `src/ui/camera/walkSurface.ts` (`ys` + places walls)
- `src/world/terrain.ts` (service height), `src/world/terrain/masonry.ts` (call + ladders + gaps), `src/world/terrain/railings.ts` (extra callback)

## Log

- 2026-10-29 — survey, design, data layer + renderer; first shots good (quay + lane), validate/invariants clean.
