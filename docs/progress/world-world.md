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
* 21:15 — m2c judged (shots/world/world/m2c*): overview at pitch 20 still has no sky (propose 15°, see ov15);
  coast POI is blocked by downtown towers (propose coast2 = 230,3,-40,140,-40,6); riverbend good; south coastal
  strip became a featureless lawn → now grazing parcels (pasture/hay/fallow remap, shader + CPU via
  fields.ts grazeCrop + model.grazing, aCov3.w). Mountains: domain-warped two-scale ridges (no row of cones);
  far ranges L2/L3 now also cover the south (a0 172/176); land mesh to 45 km (no land edge at the horizon);
  no farms right behind the ridge (z < -200 for x > -700).
* M3 in code (typecheck clean, not yet captured): country roads (model.ts ROAD_DEFS: 2 roads out of tunnel
  portals behind the ridge at (-110,-372) / (55,-372), a road S through the villages, 2 lanes; smoothed levels,
  bridge decks over water, terrain bench carving, no carving behind portals; cover/forestAt clear the corridor),
  landscape/roads.ts (draped ribbons asphalt/gravel, portals with wing walls + dark bore, bridge parapets + piers,
  8 cars with headlights). Trees/herds avoid roads. Toggles: ?landroads=0 ?landlife=0.
* 01:45 (10-20, after the 21:30 usage stop + reboot) — m3a (pre-roads) + m3b (with air's new atmosphere) judged:
  vista/ov15/coast2/country good; ?diorama verified unchanged (shots/world/world/dio/). Fixed after: near-tree
  meshes hidden when empty, meadow far field = ground's palette (gcGrassColor/gcTopColor, same noise scales;
  import from groundcover/palette.ts), narrower beach (sand ≤ 32 m, dunes ≤ 62 m), stronger wheat tramlines +
  field tonal drift. POI corrections sent to the lead (overview pitch 13 / distance 640, coast = coast2
  230,3,-40,140,-40,6, riverbend = -300,1,118,70,95,7).
* m3b stats (subset sky…vegetation+ambient+landmarks+harbor+groundcover): vista 135 dc / 2.05 M tris.
* 02:10 — lead applied the POIs (overview d640/p13, coast, riverbend). Lead note: hills at 1–4 km = smooth
  felt → done: northern hill country is now a patchwork (woods on ridges/steep ground, hill pastures + hay
  meadows via the grazing remap with hedgerows and herds, hill farms beyond a 400 m wood belt behind the ridge),
  spurs/gullies relief on the slopes (ridged 360 m + fbm 140 m). Draw-call consolidation: towers + lighthouse
  are kind-3 instances of the gable unit (ridge collapses to a spire) → one building mesh; ships + country
  cars + tractor share one dynamic mesh (landscape/fleet.ts, name 'land-ships' for the reflection pass).
* Running: m3c (overview, vista, country, coast, riverbend × 11/18.2), m3c_med (overview, country, medium),
  stats2 probes (vista/country ± ?noland). NOTE: m3c may have loaded mid-refactor — check failedModules.
* 02:00 — m3c overview (d640/p13) = best hero so far (hill patchwork, farms, ranges, beach, sea). Then: far
  land cells stretched along the rings (tangential ×1.8 beyond 1.5 km: fewer vertices), beach narrower again
  (sand ≤ 24 m, dunes ≤ 46 m) + greener marram (ground's gcMarram) + darker sand + wrack line. Water (air's
  request): world-mode sky reflection = the atmosphere's horizon ring per azimuth (thHazeColor·gain, warm
  toward the sun, blue away; water FRAG_PARS now inserted after fog_pars_fragment), golden-hour glitter
  narrower/hotter, teal body kept under warm light. NOT yet captured.
* Stats (subset incl. landmarks/harbor/ambient, vista): 133 dc / 2.25 M tris; reflection pass 184k / 10 calls;
  landscape land 108k tris (before the stretch), mtn 84k, 19.3k trees (impostors), 1024 animals, 27 chimneys,
  buildMs 2.5 s (calm machine). vista_noland pending → delta.
* 02:15 — PERF DELTA (vista, subset, ?noland vs on): 110 → 133 dc (+23), 1.54 → 2.25 M tris (+712k incl.
  shadow + reflection passes; reflection 130k → 184k / 7 → 10 calls; water surface 15k → 43k). Too much → cut:
  herds 72 → 28 tris/animal, cap 1100 → 720, no shadow pass for herds; mountains L2/L3 step 0.12 → 0.15, 8 rows;
  reflection land proxy only ≤ 1.2 km from the coast; fleet removed from the reflection pass; far land cells
  stretched. Pond (lead, low prio): peat-dark middle + bank-vegetation reflection band (warm when backlit).
* Running: m3d (overview, vista, coast, pond × 11/18.2) + stats2/vista2.json (after the cuts).
* Next: judge m3d (golden-hour sea, pond); full-city check; quality tiers; final report.
* 02:40 (10-20) — m3d judged: hero overview good; after the cuts vista2 = 131 dc / 2.10 M tris (?noland 110 /
  1.54 M). Air's notes done: sea "milky tea" → haze-ring sky reflection + glitter + teal body; "lime trees at
  19.3" → tree translucency scaled by the sun colour (trees.ts, both materials).
* 03:45 (10-24, after the weekly stop) — lead integration review: the hero foreground farmland (city → beach)
  reads as flat pale-ochre rectangles, hard pale beach strip, empty pasture with one lone tree; sea at 18.2 pale
  grey. In code (typecheck clean): town-edge SMALLHOLDING belt (fields.ts isSmall/fSmall: parcel centre < 470 m
  from the slab, not north of z −150) = parcels cut into ~44 m plots (PLOT) with their own crop mix — market
  gardens (bed blocks), maize, greens, paddocks, orchards, polytunnels (shaded half-cylinders), plus wheat/
  plough/hay/fallow/sunflower; crop kinds shared CPU/GPU via fields.ts cropKind/fCropKind (CK codes; grazeCrop
  removed); hedges on interior plot borders (plotHedge; trees.ts plants bushes + tree lines there); wider
  wildflower margins (poppy / cow parsley / buttercup tint per field); herds in paddocks smaller; irregular dune
  edge (shader noise in the sand transition: blowouts, grass tongues) + dune scrub (shader clumps + ~low bushes in
  trees.ts). Running: m4b (overview, fields_w=180,2,330,260,32,18, coast, bay_w, pond_w × 11/18.2).
* Next: judge m4b → golden-hour sea (saturate away from the sun, lower F at dusk), pond; full-city check;
  medium/low; final report.
* 04:40 → 08:31 (10-24) usage stop + reboot; edits committed by the lead (9399c3f). Since 03:45:
  m4b/m4c judged (smallholding patchwork reads well in the hero overview; pond at golden hour fine).
  Lead notes done in code: landscape trees = leaf-card crowns (trees.ts: each clump → 8–20 alpha-tested
  cards from a procedural leaf-cluster texture, rounded lighting normals, DoubleSide + face-flip undo, card
  depth material for shadows; conifers = dark core cone + branch-spray cards), darker / varied greens
  (treeAlbedo shared with impostors), weaker lime translucency; impostor atlas gets leafy surface clusters
  (z-buffer splat) and transparent texels bleed mean values (no black / brown mips; also the leaf texture);
  river banks = narrow mud line + reed patches + lush bank grass (no tan band), narrower worn towpath,
  riprap only to ~75 m with grass between stones; water: far reflections shorter / darker / weaker
  (farR), golden-hour sea mirrors more of the zenith with lower F + body scattering term (wBodyGlow, world
  only); polytunnels only west of the town (fields.ts tunnelsOK / fTun: the white block in the hero beach
  foreground was a tunnel plot at the dune edge), greyer plastic; market-garden beds narrower + brown soil;
  dune pines / scrub never in fields (cover check); far forest: crisp noisy edges, stands (conifer dark /
  broadleaf light), crown-group texture to 60 m footprint; hill meadows greener with height; hedges keep
  ≥ ~1.5 px width far away; dune hummock normals + marram tussocks.
* 09:15 — m5a/m5b judged: hills at 11 now green with textured woods + patchwork; leafy trees good;
  sea at 18.2 still grey-blue — ?noatmo diagnostic (shots/world/world/diag/ov_noatmo_18h2.png) shows the
  same sea colour without the atmosphere → it is the water (reflection-dominated, body too dark at dusk)
  → wBodyGlow now = body hue (unit luminance) × sky luminance × 0.3 at dusk. Hills grey-brown at 18.2 are
  the haze: without atmosphere they are green-olive. Dune "leopard" blotches = field colours showing
  through my noisy sand edge (not ground's tufts; ?only without groundcover identical) → the noise now
  moves only the marram / bare-sand boundary; scrub clumps sparser. Riverbank pale band = rock cover from
  bank slope → model.cover: rock × (1 − 0.9·wet). Water: TH_ATMO define (thHazeColor only when air's
  chunks are installed — ?noatmo compiled to an error before). Herds (lead): new animal geometry ~54 tris
  (lumpy icosahedron body with smooth normals, tapered head lowered when grazing, 4 thin prism legs),
  sheep = fat wool barrel with dirty underside + dark head/legs, cattle coats incl. piebald, size ±12 %.
* 13:31 (after the 3rd usage stop, 7a27edf) — m5c judged: banks grassy + reeds (good); sea still grey at
  18.2 because uDusk ≈ 0.07 at 18.2 h (it peaks at sunset) → water uses TH_GOLD = max(uDusk, wGoldK())
  in world mode (wGoldK from the sun height: ~0.66 at 18.2) for body tint, zenith mirroring / lower F,
  body scattering, narrow hot glitter, pond bank warmth. Dunes still camo (marram dark vs golden sand) →
  marram lighter / closer to sand, less 13 m noise. Lead note (cliffs, granted to me): north-edge rock
  wall = beige shelves → cliffs.ts: greyer/darker bed tones with more spread, bigger ledge wobble, 24 %
  overhanging lips, more rubble; masonry.ts cliff shading: stronger water streaks, damp dark seeps,
  grey-green lichen, vertical joints per bed, shrub clumps on ledges, darker undersides.
* 14:30 — m5d/cliff1/m5e/final1 judged. Sea at 18.2 teal-blue (83,112,138 vs 97,107,120). Cliffs read as rock
  (+ faults stepping the beds). Lead camera fix (pivot roams 320 m into the land) → riverbend frames x = −300.
  Lead notes done since: river edge foam broken (water: edge × lace flecks on rivers) + dark wet mud at the
  waterline (land); open-coast surf band in the land shader (> 400 m from the slab); island reshaped
  (asymmetric ridge, crest east with a steep sea side, 3 summits / saddles, cliffed rim with a beach cove,
  peak 190, scrub woods on the west slopes, shingle on low flat shore); dunes: smooth marram gradient
  (fore-dune sparse → vegetated back-dune) + sub-metre tufts close up, no fake hummock normals (low sun
  turned any tilt into leopard blotches), scrub dots only < 1.2 m footprint; low tier keeps a 0.35 near
  radius (no impostor lollipops at eye level). Full city (final1): console clean, invariants {}, overview
  177 dc / 2.62 M tris (all passes). stats3 vista full city: land 186 dc / 2.65 M vs ?noland 165 / 2.14 M.
* 14:30 — final2 + dio2 judged: dunes clean (no blotches), island irregular, ?diorama tabletop unchanged.
  console clean, invariants {}. DONE — see "## Final report".
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
* src/world/terrain/cliffs.ts + the cliff branch of src/world/terrain/masonry.ts (granted by the lead,
  10-24): rock tones, faults, ledge wobble, overhangs, rubble; streaks / seeps / lichen / joints / ledge
  shrubs. `?nocliffs` / `?legacyterrain` unchanged.

## Final report
**Changes.** In world mode the tabletop is gone. The city sits in a continuous landscape out to 45 km of
land and 52 km of sea: farmland W/S, forested hill country rising to four domain-warped mountain layers N,
the river from the W, and the open sea E with a rugged island. The town edge has a smallholding patchwork
(CPU/GPU twin crop kinds, plot hedges, wildflower margins); hedgerows, orchards, farms, hamlets, villages
and roads with tunnels and bridges fill the country. Life: herds, a tractor, cars, ships, chimney smoke and
night lights. Landscape trees are leaf-card crowns with impostors beyond 125 m. Other passes: river banks
(mud, reeds, towpath), dunes, the water (haze-ring sky, golden-hour body, glitter, short far reflections,
pond mirror), the cliffs (granted), and camera far/FOV. `?diorama` keeps the original tabletop (dio2).
**Files.** src/world/landscape.ts + landscape/*, terrain/slab.ts, water.ts + water/*, ui/camera.ts constants;
granted: terrain/cliffs.ts, masonry.ts cliff branch.
**Toggles.** ?diorama ?noland ?nomountains ?landdbg ?landtrees=0 ?landbld=0 ?landships=0 ?landlife=0
?landroads=0 ?nocliffs ?waterdebug=refl. Tiers (low/med/high): land rings ×1.7/1.3/1, mountain decimation
2.2/1.5/1, 3D-tree radius 0.35/0.7/1 (also on the adaptive ladder via setTreeDetail).
**Shots.** before: shots/world/world/before/. after: final1/ (overview, vista, riverbend, country, coast,
dunes, island × 11/18.2), final2/, cliff1/, m5d/sheep_*, qlow/, qmed/, diag/ (?noatmo A/B).
**Cost.** Full city vista: 186 dc / 2.65 M tris, against 165 / 2.14 M with ?noland (+21 dc, +0.51 M, all passes).
The landscape itself: land 92k tris, mountains 65k, reflection proxy 48k, 20.9k trees, 750 animals ×
54 tris, build ≈1.8 s. Measured on software GL only. My estimate is +2–3 ms on the Adreno X1-45 at
1920×1025; it needs `perf.mjs --variants ";noland"` on the target.
**Trade-offs / open.** At 18.2 the hills read grey-brown mostly through air's haze (the ?noatmo A/B shows them
green). Sheep keep a 20-face body: faceted at under 5 m, cheap. The island peak is still a little conical from the
SW. Shader plot hedges have no gaps, unlike the CPU hedge trees. The cliffs.ts rng changes moved the scree.
