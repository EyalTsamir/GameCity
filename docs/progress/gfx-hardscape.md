# gfx-hardscape — progress (hardscape agent)

## Resume here
- DONE + verified: H1-H4 implemented and captured (full city: shots/hardscape/final, chunks A-D); sheets
  shots/hardscape/sheets/ab_*.png (7). invariants() empty in full city; console clean.
- DONE: school re-shot (shots/hardscape/final2/school_11.png) — the black rectangle did NOT persist.
- FINDING (quay): every quay view < 100 m is pulled in by the camera module: src/ui/camera.ts
  `LOS_DIST = 100` ("below this orbit distance the camera keeps a line of sight to the pivot") — cranes, ship
  and container stacks block the line of sight, so quayN (32 m), quayS (48 m), quayT (55 m) all render as
  ~5 m close-ups (final2/quayS_11.png, quayT_11.png; before3 same). Not editing the camera.
- RUNNING (started 2026-10-18 after resume): quay views at 105 m (no LOS clamp), after + before:
  `capture-set.mjs --views "quayN2=124,0,-118,105,-110,55;quayS2=124,0,-16,105,120,50" --hours 11 --width 1600
  --height 900 --hideui 1 --q "nointro&noidle&adaptive=0&quality=high&time=11"` → out shots/hardscape/final2
  (log final2b.log) and with `--url http://127.0.0.1:5174/` → shots/hardscape/before3 (log before3b.log).
- NEXT: (1) read those PNGs; (2) rebuild shots/hardscape/sheets/ab_court_quay.png with before school
  (shots/hardscape/before/school_11.png) vs final2/school_11.png and quayN2/quayS2 before/after (+ harbour
  POI pair if the quay views are weak); (3) write "## Final report" here and send it to the lead.
- Plaza view for sheets/report: "-28,0,-24,40,15,45" (lead agreed).

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
- [x] H4 lamp light integrated (roads asphalt/hardscape/markings + props furniture; verified at night)
- [x] H3 gardens: 26 lots, 235 items (pools, trampolines, sheds, patios, parasols, swings, veg beds, …)
- [x] H1 surfaces v2 (asphalt patchwork/cracks/patches, plaza bands + bonds, yards/quay specials, court)
- [x] H2 scatter: 268 items over plazas, station, yards, quay, car parks, courtyards, schoolyard
- [x] H5 verification: final set shots/hardscape/final (+ final2 re-shots), sheets shots/hardscape/sheets/ab_*.png

## Final numbers (full city, westbrook 11 h)
- invariants(): empty (full-city run, shots/hardscape/stats_full.json); console clean.
- draw calls: +2 (props-casters main pass + its shadow pass): 130 → 132 (perf.mjs variants).
- triangles in view: 1.535 M → 1.642 M (+107 k incl. the casters' shadow pass). props module: 152 k tris
  (fine 110 k, casters 15.7 k); roads 36.6 k tris (unchanged geometry except patios + painted extras).
- SwiftShader perf (one run, noisy): 576 ms all on · 472 noscatter&nogardens · 560 legacyground · 352 both off.
  SwiftShader rasterises on the CPU, so vertex-heavy props dominate there. GPU estimate (Adreno X1-45):
  ≈ +0.1 ms vertex work for ~110 k extra tris (whole fine mesh is drawn ≤ 300 m), ≈ +0.02 ms casters
  shadow pass, ≈ +0.05 ms extra ALU / 1-2 fetches in the ground shaders → ≈ 0.2 ms (budget 0.4 ms).

## Iteration notes
- it3 (shots/hardscape/it3, subset modules, 11 h + 21.5 h): gardens read great (pools, trampolines, parasols,
  sheds, veg beds, stepping stones; caster shadows); plaza band grids + station herringbone read clearly; court
  is a strong accent; lamp light shows on roads/props at night. Weak: asphalt macro too subtle from afar,
  yards too sparse (wall-offset bug), concourse surface flat, sculpture next to the statue.
- round 2: bimodal asphalt ages + stronger cracks, concourse band grid, court desaturated 14 %, pool glow 0.32,
  yards denser (+ containers, pipes, timber, forklifts alongside walls), kiosk seating, café on more towers,
  public art ≥ 10 m from statues/fountains, patio pot plants, wheelie-bin rows fixed, props invariants check
  scatter/garden items against walk lines / roads / buildings.
- round 3: lead's night note on pools → only ~35 % of pools have a (subtle) underwater lamp; the rest are dark
  water that only takes thLampLight; wider coping (0.38) + visible dark waterline tile band; round / paddling
  pools no longer emissive. Trimmed tris: bikes in racks use open-ring tyres (bikeLite ~90 tris), planter
  flowers 5-6 blobs, veg-bed heads 10. Asphalt: cracks start at age 0.42, transverse every 4.5-8.5 m, 18 % patch
  cells. Taxi rank sign at the station.
- perf (SwiftShader, westbrook 11 h): run was useless (same variant 816 vs 1051 ms; machine load ~10). Reliable:
  draw calls 142 → 144 with scatter+gardens (props-casters + its shadow pass), triangles +120 k in that view
  (before the trims; includes the casters' shadow pass). To redo in a quieter window.
- it6 (after the usage-limit restart, files intact): asphalt patchwork + crack lines now read at street-view
  distance (wbN "-160,0,40,60,-30,45" is the best asphalt showcase, day and night under the lamp map); pools at
  night = dark water + coping, a few with an underwater lamp; patio tables got candle lanterns (warm dots).
  Fixed: greenhouse glass glowed at night (props-glass emission now gated to the bluish shelter panes);
  planters on downtown/midtown band-grid crossings; more kiosk seating.
- Final verification set: shots/hardscape/final (chunks A-D, ≤ 15 min lock each), before = shots/baseline
  (POIs) + shots/hardscape/before (+ before2 for wbN), sheets → shots/hardscape/sheets (script in the
  scratchpad: sheets.sh).
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

## STATE AT PAUSE (user-requested pause, 2026-10-18 ~10:40)
- All code done and typechecking (my files); nothing half-edited. Final full-city captures done
  (shots/hardscape/final, chunks A-D) and 7 sheets built in shots/hardscape/sheets/ab_*.png.
- Left to do (small):
  1. Re-shoot two views — both attempts timed out loading (page-load 300 s on the busy machine):
     `capture-set.mjs --views "school=-76,0,80,55,10,50;quayS=124,0,-20,48,60,42" --hours 11 --width 1600
     --height 900 --hideui 1 --q "nointro&noidle&adaptive=0&quality=high&time=11" --out shots/hardscape/final2`
     and quayS on 5174 (`--url http://127.0.0.1:5174/ --out shots/hardscape/before3`). Reason: final
     school_11.png has a black rectangle (transient, not my geometry; subset runs were clean) and quayN gets
     pulled into a close-up by the camera module in full-city mode.
  2. Rebuild ab_court_quay.png with final2/school_11 + before school, harbour POI pair (shots/baseline vs
     final harbor_11) and quayS before/after.
  3. Optional: a second perf.mjs A/B in a quiet window (≤ 15 min lock): `--view westbrook --seconds 6
     --variants ";noscatter&nogardens;legacyground;noscatter&nogardens&legacyground"`.
  4. Send the final report (≤ 350 words) to the lead.

## Perf variants for lead (one consolidated quiet-machine A/B)
- variants: `;noscatter&nogardens;legacyground;propscast=0;noscatter&nogardens&legacyground`
- views: `westbrook` (gardens), `downtown` (plazas + asphalt), `station` (bike parking / concourse),
  `overview` (fine props LOD'd off, casters + ground shaders only)
- expected: noscatter&nogardens = props vertex cost (fine mesh ~110 k tris drawn ≤ 300 m + casters);
  legacyground = ground-shader ALU delta; propscast=0 = the casters' shadow pass.

## RESUME (after the user pause)
- Plaza view switched to "-28,0,-24,40,15,45" (lead agreed). Re-shooting school + quay (final2 / before3).
