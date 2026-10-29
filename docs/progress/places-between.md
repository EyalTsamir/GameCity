# places-between — spaces between buildings become places

## Resume here

- **Round 2 (overnight backlog from the coordinator)**, branch merged with `claude/pensive-gates-bim12i` at 083a507.
  Backlog order: 1 station ✔ · 2 river slipway/steps + harbour water stairs ✔ · 3 tunnel-portal cuttings · 4 old town
  (back-yard gate + path, church close (4,3), reeds off the island landing) · 5 town↔countryside edge · 6 REAL-REPORT
  ground items (colonnade dots, cut ledges, gravel relief) · 7 walk audit → fix the 10 weakest spots.
- Dev server `npx vite --port 5186 --strictPort`; harness from the main checkout with `--url http://127.0.0.1:5186/`.
  Walk probe: scratch `walkstairs.mjs` (copy in the session scratchpad; recreate from the Log section if lost).
- Round 1 is done (see below). Shots of round 2: `shots/r2/*`.

## What exists

| place | where (view `x,y,z,dist,yaw,pitch`) | toggle |
| --- | --- | --- |
| Lower quay ("low quay"): paved ledge 0.85 m above the river along the north wall, x −63.2..10.9, z 110.25..114; two 7-riser flights from landings flush with the wall coping (gaps in the promenade railing), iron handrails, bollards, benches facing the water | top `-25,0,112,45,15,40`, eye `-58,0,111,22,10,6`, promenade `8,-0.3,112,10,-120,15` | `?nolowquay` |
| Quay east access: 12 m ramp (1:11) down along the wall from the east landing, setts, kerb, iron handrail | `2,0,111,22,15,10` | (part of `?nolowquay`) |
| Pond-island footbridge (Central Park): humped timber bridge (planks, stringers, posts, handrails, stone abutment) from the pond loop to the island; plank landing on piles with a bench | top `-74,0,11,30,120,35`, eye `-74,0.8,9,10,160,8` | `?noislandbridge` |
| Station front: facade set back 2.5 m (station lot footprint z1 −127.5 → −130, doors moved), granite forecourt flush with the sidewalk, 2-step perron across the three doors (x ±16.5) with cheek blocks + lamp standards, a walk per door | eye `0,2,-128,22,0,6`, side `-12,1.5,-129,12,-55,10` | `?nostationfront` |
| Rock-cut retaining wall behind the tracks: ashlar wall x −88..33, face z −161.8, 2.7 m, 1.7 m thick, coping, pilasters every ~7.5 m, weep holes; scree suppressed in front of it | track `-20,1.8,-162,9,20,8`, air `-30,2,-162,30,30,35` | `?nocutwall` |
| Water stairs (`?nowaterstairs`): south river wall by the rowing-club jetty (top landing x 87.7..89.3 on the coping, 11 risers west along the wall face, wet landing at the waterline, handrail); harbour sea wall south of the cargo ship (z −24.6..−31.6, 12 risers north, ladder at z −31 dropped); boat slipway x 99..103 cut through the south river wall (wall-body hole + parapet gap; setts, kerbs, timber skid rails) | slip `95,-0.5,124.5,22,160,15`, harbour `137.2,-0.5,-29,10,-60,25` | `?nowaterstairs` |
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

## Cost (perf.mjs, 1920×1025, high, 12:00, `;noplaces` variant, 2 interleaved repeats)

| view | with places ms | `?noplaces` ms | Δ triangles | Δ draw calls |
| --- | --- | --- | --- | --- |
| overview | 48.58 / 48.56 | 48.37 / 48.11 | +29k | 0..+1 |
| street `5,1.5,-65,9,0,6` | 42.72 / 42.31 | 41.96 / 42.01 | +26k | +2 |
| quay `-25,0,112,45,15,40` | 36.94 / 37.41 | 38.13 / 38.10 | +31k | +2 |
| lane `82,1,-37,45,20,55` | 37.44 / 37.23 | 38.23 / 38.18 | +21k | +2 |
| island `-74,0,11,30,120,35` | 38.78 / 38.68 | 38.17 / 37.35 | +24k | 0..+2 |

Differences are within run-to-run noise (mixed sign, ≤ ~1 ms). The stonework/ironwork adds no draw calls of its own
(merged into the terrain masonry + railing meshes); the +2 is probably the split townhouse lot in the buildings
module and/or the extra glow sprites (not investigated). Lights added after this run (lanterns, bollard lights) are
a few boxes + glow sprites.

## Files touched

- new: `src/core/places.ts`, `src/world/terrain/places.ts`, this log
- `src/core/plan.ts` (import, `WalkPath.ys`, `CityPlan.places`, `buildPlaces` call, `isWaterAt` dry check)
- `src/core/pedNetwork.ts` (1 line: `ys`), `src/ui/camera/walkSurface.ts` (`ys` + places walls)
- `src/world/terrain.ts` (service height), `src/world/terrain/masonry.ts` (call + ladders + gaps), `src/world/terrain/railings.ts` (extra callback)

## Log

- 2026-10-30 — round 2 item 2: water stairs (river + harbour), slipway. masonry.ts `buildWall` got `holes` (wall-body
  openings, end faces at both hole sides, coping skipped); south parapet takes `places.southParapetGaps`; south and sea
  ladders filtered by `places.dropLadder`. Boats: stairs/slipway are dry above the waterline only (nav grid).

- 2026-10-30 — round 2 item 1: station forecourt + perron, cutting retaining wall (first try at z −162.6 had cliff-skin
  slabs and scree poking through the face → moved 1.2 m in front of the ridge foot, scree callback in masonry.ts skips
  the wall zone). validate + invariants clean.

- 2026-10-29 — survey, design, data layer + renderer; first shots good (quay + lane), validate/invariants clean.
- 2026-10-29 — walk-mode probe (first-person, real W key, `only=terrain,roads,buildings,camera,ui&camdebug`):
  landing→down the west flight 0.34→−0.75; promenade→through the railing gap onto the landing 0.15→0.34 (stops at
  the handrail); square→up the recessed flight 0.15→1.05; terrace→down the stepped lane →0.15 at the street;
  street→up the lane →1.05; terrace→balustrade: stopped at z −37.74 (balustrade box −37.32 − body radius 0.42).
- 2026-10-29 — perf A/B (table above); `ui-test --steps walk` 9/9; build OK; shot review (sonnet): no floating /
  z-fighting / seams; fixed: lane handrail stood off the wall, thin arch-lantern bracket + too bright halo, quay and
  lane unlit at night → wall lanterns (archway both faces, lane landing) and low bollard lights on the quay with light
  pools.
- 2026-10-29 — walk probe 2: up the west flight −0.75→0.34; down the ramp 0.34→−0.75 (linear); over the island bridge
  0→0.73 (crown)→0.16 (landing) and back.
- 2026-10-29 — east flight replaced by a ramp; pond-island bridge added (island feature radius → 0 so it is no
  longer a solid disc — `params.radius` still drives the terrain bowl/island and the willow + birch).
