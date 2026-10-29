# places-between — spaces between buildings become places

## Resume here

- **Round 2 (overnight backlog from the coordinator)**, branch merged with `claude/pensive-gates-bim12i` at 083a507.
  Backlog order: 1 station ✔ · 2 river slipway/steps + harbour water stairs ✔ · 3 tunnel-portal cuttings ✔ · 4 old
  town (churchyard, yard gate, island landing) ✔ · 5 town↔countryside edge (west farm lane) ✔ — 3–5 committed together;
  verification shots `shots/r2/p5` (portal bank, arched headstones, edge) + walk probe `walk3.mjs` were queued on the
  browser lock · 6 REAL-REPORT ground items: cliff ledges ✔ (`?nocliffledge`), colonnade dots → the plaza slot drain
  (prepared in scratch `drain_fix.py`, verify with `probe6.mjs` rddbg A/B first), gravel/ballast relief (G2 already
  added `?nobedrelief` — judge on a close shot) · 7 walk audit → fix the 10 weakest spots.
- Headless plan check (no browser, no lock): scratch `planssr.mjs` (Vite SSR → generatePlan + roads + occupancy +
  pedNetwork; prints `peds.warnings`, optional eval file). Copy it into the worktree root to run (`node planssr.tmp.mjs
  <worktree> [eval.js]`) so `vite` resolves.
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

| Tunnel portals (`?noportalcut`): the ground on the headwall top is no longer dropped with the mouth slab (the dark slot behind the parapet), no bald lawn strip over the road bores (groundcover kept the road's no-grass rect up to the portal node 18 m inside the hill), scrub on the steep bank behind the coping and on the hood above each headwall (shrubs, ferns, a few young birches / oaks) | road `55,4,-164,16.2,0,-8.5`, air `55,2,-170,60,10,40`, `-110,2,-170,60,-10,40` | `?noportalcut` |
| St Mary's churchyard, block (4,3) (`?noclose`): the gap between the church and the south row opened to the street by a lych-gate (oak frame, tiled roof, seats, lantern) in a low railed wall with capped piers; flagged path to a wheel-head memorial cross; the courtyard is a churchyard lawn with ~60 headstones (limestone / slate / lichen, some leaning, rounded heads, kerbed plots), chest tombs, two benches, Irish yews + a lime; lawn strips along the church flank and in the gap; no washing line across it | eye `80.1,1.5,90,11,0,6`, inside `85,1.2,72.5,10,315,12`, air `82,0,78,45,25,50` | `?noclose` |
| Back-yard gate, block (4,2) (`?noyardgate`): gravel path from the street through the south gap into the W6 back yard; the close-board fence opens at one panel slot (props leave it out: walkway) with a painted ledged-and-braced gate standing open | `84.3,1.5,22,12,0,4`, air `84,0,22,30,20,45` | `?noyardgate` |
| Pond-island landing: no reed stand on the bridge abutment / landing (groundcover habitat skip) | `-74.2,0.4,12,10,180,14` | (with `?noislandbridge`) |
| West edge (`?noedgelane`): Westbrook's back gardens (and the allotments) end 3.8 m earlier at a farm lane — two gravel ruts, grass crown, long-grass verges — from the river promenade north to a field gate at the hill foot; a field hedgerow (untrimmed, 1.75–2.25 m, in pieces) with standard oaks along the slab edge, two five-bar field gates (one open) and a step stile; a fingerpost at the promenade | `-200,1,30,45,-90,10`, lane `-196.4,1.6,20,10,180,4`, air `-205,0,40,90,-60,40` | `?noedgelane` |
| Cliffs (REAL judge 3 #6): broken ledges — every stratum lip sags and juts by its own amount along the face (value noise) | track `-20,1.8,-162,9,20,8` | `?nocliffledge` (off on low) |

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

- 2026-10-30 — round 2 items 3–5 (+ cliff ledges of 6). Portals: `inPortalMouth` takes the triangle's lowest y (ground
  triangles on the headwall top are no longer dropped with the mouth slab), the shelf behind the coping ramps up to the
  hillside (height.ts), groundcover keeps its no-grass rect only to the portal face, scrub/fern/birch hood (rng
  `veg-portal-hood`). Churchyard: `buildClose` (core) + `closeStone`/`closeIron` (renderer); props scatter skips the
  courtyard, vegetation skips its area and plants yews/lime itself; washing-line spans over it dropped (buildings.ts).
  Yard gate: replicates props' back-yard court choice, fence slot left open, gravel path. West edge: Westbrook back
  lots (and the allotment areas) trimmed to `gardenX` = slab x0 + 5.8; two-rut lane, hedgerow pieces (rng `veg-edge`),
  gates + stile + fingerpost. Fix: the lane's branch rut was a 4-node island (pedNetwork's split ignores the outer 1 %
  of a 229 m segment) → branch points are vertices of rut A. Island landing: reed habitat skip near the bridge.

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
