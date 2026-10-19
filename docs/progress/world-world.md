# world-world — the frame: a city in a landscape that continues to the horizon

## Resume here
* 2026-10-19 20:35 — resumed after the usage-limit stop + container reboot (all my files intact, committed fe25a85).
  State: M1 done (frame off, landscape model/service, ring terrain, mountains, sea/river extension, camera far/FOV)
  + first fixes after m1a (mountain shapes, sand width, canopy edges, flowers) + M2 code (landscape/trees.ts: 3D near
  set + impostors; landscape/settlements.ts: farms/hamlets/villages + church spires) — typecheck clean, NOT yet
  captured (m1b died in the reboot / screenshot timeout under load 20).
* Air's atmosphere is in the tree: drop ?landfog=0 (switches ?noatmo, ?atmo=<k>, ?nomist).
* Lead review of m1a to address: (a) fields = flat paint with ruler edges → hedgerows/tree lines, crop texture,
  soft irregular edges, tracks, farmsteads; (b) mountains must tower over the hills: rock faces/scree, snow on the
  highest, layered haze; (c) north forest flat until trees; (d) island reads as a small mound; river embankment →
  natural transition must be gradual.
* 21:00 — m1c captured (shots/world/world/m1c/, subset with atmosphere): city in a landscape, impostor forest,
  farms, hedgerows read well (hero_n, wb_out); 3D countryside trees were faceted blobs → rebuilt as clump crowns
  sharing one shape with the impostor atlas (trees.ts shapeOf), near radius 125 m (impostors beyond); foliage band
  overlap (my forest starts ~33–48 m beyond the north edge, their tones); taller far ranges (L2 2.1 km, L3 3.7 km),
  bigger N-S rocky island (r 640, 230 m), field borders warped ±1.8 m + headlands + in-field patches, embankment →
  riprap → grass bank shader transition + towpath on the north bank (aCov3 = riverU, slabD, side), meadow
  tussocks, dune marram, distant ships (landscape/ships.ts, one dynamic mesh), reflection proxies
  (land-reflect = coastal land triangles sharing the land buffers, land-reflect-mtn = coarse mountains; opted in
  water/reflection.ts BASE with land-ships), quality tiers (tree near radius 1 / 0.7 / 0) + service.setTreeDetail(k).
* 20:50 — second container restart (all edits committed in a69c834). Added since: village/farm night lights
  (landscape/lights.ts, additive points ≥1.6 px, distance-dimmed), island fishing hamlet + lighthouse (white
  tower, beacon light). Re-running: m2a capture (hero_n, wb_out, sw_corner, vista_w × 11/18.2, east_eye) →
  shots/world/world/m2a; stats probes → shots/world/world/stats/hero_n{,_noland}.json.
* 21:15 — m2a judged (shots/world/world/m2a): wb_out/vista_w/east_eye good; golden hour is fog soup (air's
  haze — reported to the lead with POI proposals vista/country/coast/riverbend). Since m2a: land build refactor
  (terrain.ts buildLand: heights → normals → slope → cover, no 5× height evals), coarser near rings (≥1.6 m radial,
  ≥2.1 m tangential), mountains in 5 frustum-culled azimuth chunks + coarser L0/L1, field striation / lodged
  patches / meadow mottling, poplar shape, rugged island (cliffs all round, a cove with the hamlet), colours
  (stubble, sand, canopy). Stats (subset hero_n before the cuts): 50 dc / 562k tris, landscape land 108k, mtn 85k,
  impostors 16.4k trees, refl +98k (pass total). invariants {}, console clean.
* 21:20 — lead review of M2 (fields still flat blocks at 150–700 m; beige strip SE of the river = make it
  meadow; clump trees blob-like; farm life) → done in code: fields split into 2–3 strips/paddocks per parcel
  (fields.ts fieldAt/fieldsOfParcel = CPU twin of the shader split), tramlines kept ≥1 px, mown swaths, pasture
  paths, row-crop soil patches, weedy margins + fences between strips, poppy haze in fallow; coastal grazing
  meadow (no fields within ~260–460 m of the south coast); denser hedgerow trees; broadleaf crown = core + 8
  shell masses with gaps; landscape/farmlife.ts (herds of cattle/sheep with grazing head-bob in the vertex
  shader, a tractor working a stubble/ploughed field near the town with a dust trail via the smoke service);
  chimney smoke for villages/hamlets/some farms (cool hours) via ctx.services.smoke at modules:ready.
  Lead added POIs vista / country / coast / riverbend (world mode) and world overview = 600 m / pitch 20.
* Running: m2c (overview, vista, country, coast, riverbend × 11/18.2, subset incl. ambient) + m2c_noatmo.
* Next: judge m2c; night 21.5; ?diorama check; full-city capture; perf numbers vs noland.
* Tools: my capture script copy with 20-min load timeout = scratchpad `cap.mjs` (scratchpad is SHARED with other
  agents — keep my files under scratchpad/world* or land/). Offline map tool: scratchpad `land/map.ts` (bundle:
  `npx rolldown land/map.ts --platform node -o land/map.mjs`; `node land/map.mjs x0 z0 x1 z1 N out.bin &&
  python3 -I land/map.py out.bin out.png`).

## Brief (from WORLD-PLAN.md scope 1 + briefs "### world")
Remove the frame in world mode (soil faces, plinth, nameplate, table, cyclorama, sea cut-away, slab shadow) and
continue the land seamlessly beyond the slab edge to the horizon: countryside W and S (fields patchwork, hedgerows,
farm tracks, orchards, copses, farmsteads/barns, a distant village with a spire), the northern ridge rolling into
forested hills and a mountain range 4–15 km out (rock, snow, aerial-perspective layers), the river continuing W into
the country, open sea E to the horizon (headland, island, distant ships/sails). Near ring (≤ 1 km) real geometry +
instanced trees; far ring shaded terrain; mountains as layered silhouettes. Service `ctx.services.landscape =
{ height(x,z), isWater(x,z), cover(x,z) }` (= terrain.height inside the slab). Camera far/FOV for a world (wider at
eye level ~45–55°, far ≥ mountains). Sea to the horizon, reflections of the coast. Propose hero POIs with the horizon.
`?diorama` keeps the original tabletop exactly. Owns: `src/world/landscape.ts` + `landscape/*`,
`src/world/terrain/slab.ts`, `src/render/stage/*`, `src/world/water.ts` + `water/*`; grant: near/far/FOV in
`src/ui/camera.ts`. Air owns sky/fog (agree on the horizon through the lead). Budget (high): ~1.2 ms GPU, few draw calls.

## World map (1 unit = 1 m, north = −z, east = +x; slab x −200..200, z −190..150)
* N: the slab's ridge (crest 11–27 m at z ≈ −186) continues; behind it a shallow wooded valley, then forested hills
  (60–300 m at 0.8–3 km), then mountain layers (4–15 km, 0.8–2.8 km high, rock + snow).
* W: farmland (fields patchwork, hedgerows with trees, tracks, copses, farmsteads), the west spur hill continues as
  low wooded hills NW; distant village with a spire ~2 km W; low hills on the far horizon.
* River: leaves the slab at x = −200, z 110–126 (walled); outside it widens (16 → ~26 m) with natural grassy banks
  and meanders W/SW; water level stays −1.6 (same reflection plane as the sea).
* S: meadows + fields rising to low hills (≤ 80 m at 2–3 km), orchards.
* E: open sea to the horizon. Coast continues N from the harbour cliff (x ≈ 136 at z = −190) as a cliffy coast to a
  NE headland; S from the beach waterline (x ≈ 141 at z = 150) as dunes/beach to a SE headland. Island ENE.

## Design
* **Mode**: `WORLD_MODE` (core/world.ts). slab.ts builds nothing visible in world mode (placeholders; stage.table
  stays null so the sky's table code is skipped). Water: no cut-away, no slab-edge reflection fade, extended surface.
* **Landscape model** (`landscape/model.ts`, CPU, three-free): `height(x,z)` = terrain.height inside the slab; outside
  = slab-edge height (nearest boundary point) blended into the world height over ~40 m. World height = region relief
  (plains / ridge continuation / hills) carved by the river (polyline centreline, natural profile) and cut by the
  coast (polyline, signed distance → beach / cliff profile, sea floor). `cover(x,z)` = kind + densities (field, forest,
  meadow, beach, rock, water, village…); `isWater`.
* **Terrain mesh** (`landscape/terrain.ts`): one indexed mesh of rounded-rectangle rings around the slab, ring 0 = the
  exact slab edge vertices (from terrain/layout.ts slabEdges, + GROUND_DROP) → crack-free; ring step ~1.5 m near,
  growing ~4.5 %/ring to ~20 km; ring vertex counts adapt, consecutive rings zipper-stitched. ~40–60 k verts.
  Normals from the height function. MeshStandardMaterial + onBeforeCompile (standard fog chunks → air's atmosphere
  applies), lamp light, shadows received near.
* **Shading** (per pixel): field patchwork = rotated jittered grid (rows of varying height, columns per row) → parcel
  id → crop (wheat, green crop, maize, ploughed, stubble, hay, pasture, fallow meadow), crop rows faded by footprint,
  tramlines, grassy margins; hedgerow / track masks from the border distance (same function on CPU for placing
  hedgerow trees); forest canopy (crown cells with a fake dome normal lit by the sun); rock on steep slopes; sand
  near the coast; snow by altitude; macro tonal patches (10–40 m) and micro grain faded by footprint.
* **Mountains** (`landscape/mountains.ts`): 3 polar ring layers (≈4–6, 7–10, 11–16 km) over the land sector, ridged
  multifractal crests, high angular resolution (silhouette), rows concentrated near the crest; rock/snow/forest by
  altitude + slope; one draw call for all layers.
* **Trees** (`landscape/trees.ts`, M2): near ring (≤ ~350 m outside the slab) instanced low-poly 3D trees (sectors,
  frustum-culled), far trees as boot-baked or procedural billboard impostors (one instanced draw), big forests as
  canopy-raised terrain with crown shading.
* **Water** (owned): sea + river extension meshes from the same ring topology (triangles where the landscape is
  wet), per-vertex field attributes (depth, shore, beach, region) outside the slab instead of the slab field texture;
  swell amplitude fades far out; the far sea reaches ~40 km (fully hazed → the horizon).
* **Camera** (grant): world mode far = 40 km; FOV widens at eye level (≈ 50° at ≤ 15 m → 34° at ≥ 400 m), diorama
  unchanged.
* **Toggles**: `?noland` (no landscape meshes), `?nomountains`, `?landtrees=0`, `?landfog=0` (my materials without
  fog — judge geometry before air's atmosphere lands), `?diorama` (original).
* **GPU estimate** (high, to be measured): terrain ~50 k verts + mountains ~50 k + trees ≤ 100 k tris; fragment cost
  of the land shader on ~40–60 % of the screen in horizon views (cheap ALU + 2–3 noise taps). Target ≤ 1.2 ms.

## Milestones
* M1 frame + basic world: slab off in world mode, landscape model/service, terrain ring mesh + shader, mountains,
  sea/river extension, camera far/FOV. Captures: overview, eye-level at all four edges, horizon views; 11/18.2/21.5.
* M2 near-ring life: hedgerow/copse/forest/orchard trees, farmsteads, distant village with spire, tracks.
* M3 coast & sea: headlands, island, dunes, distant ships/sails, river banks (reeds via ground), reflections.
* M4 night (farm/village lights), quality tiers + toggles, perf numbers, POI proposals, final report.

## Shots
* before (5174, subset sky,terrain,water,roads,buildings,landmarks,harbor,vegetation,postfx,camera):
  `shots/world/world/before/` — views overview, hero_n, west_eye, south_eye, east_eye, river_w, north_ridge, ne_coast.

## Requests to other areas
(none yet)

## Changes outside my area
(none yet)
