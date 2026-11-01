# gfx-terrain — graphics overhaul, audit item 10 + lamp light on the ground

## Resume here
* ALL DONE (T1–T5 + lead items a, b, c). Final report below under "## Final report" (also sent to the lead).
* Last verification: `shots/terrain/final2/` complete (8 frames, report clean), sheets built
  (`sheet_final2_lawns.png`, `sheet_final_night_rock.png`). Nothing running; tree committed (auto-checkpoint).
* DONE + verified (fix request lead/night): `landmarks/stadiumLife.ts` floodlights snap (`flood = want`) on
  ctx.events 'timejump' (flag applied on the next update; normal clock flow keeps the ease). Capture jump
  21.5 → 2 h at the stadium (`shots/terrain/sheet_flood_jump.png`): floodlit post-match at 21:30, pitch and
  masts dark at 02:00 (only the NIGHT-mode fascia lights stay on); console clean, invariants {}.
* If resumed again: nothing left except the lead's QA questions.

Owner: terrain agent. Files: `src/world/terrain.ts`, `src/world/terrain/*` (except `slab.ts`, `glow.ts`),
`src/world/landmarks.ts`, `src/world/landmarks/*` (except `glows.ts`, `shaders.ts`, `materials.ts`).

## Brief
T1 cliffs & rock · T2 lawns & ground · T3 stadium shell · T4 lamp light in the ground shader · T5 verification.

## Design / state
* **T4 lamp light — DONE (integrated, waits for the night agent's bake).** `ground.ts` and `masonry.ts`
  (quay walls, portals, rocks, cliffs) add `diffuseColor * thLampLight(worldPos, worldNormal)` after
  `lights_fragment_end` (uniforms via `lampUniforms()`).
* **T1 cliffs — DONE (it3), final verification pending.** New `terrain/cliffs.ts`: stratified faceted rock skin on
  the ridge escarpment (x −180…111 minus the road-portal wings), both spur noses and the harbour cliff.
  Columns every ~1.5 m march the heightfield along the face's outward normal (terrain heights untouched;
  every vertex = ground point at its height pushed out by D, D < 0 buried). Global strata (0.8–2.1 m,
  dipping), blocks of 2–4 columns with own protrusion, crease + bulge + lip + ledge top, flat facets.
  Merged into the masonry mesh (no extra draw call), new masonry kind `KIND.cliff = 6` with its own
  shader branch (sub-bedding lines fwidth-faded, streaks, lichen, cracks, moss/grass on ledges).
  Scree stones at the feet (masonry boulders), `cliffFeet` → gravel aprons in the ground mask.
* **T2 ground — DONE (it3), final verification pending.** Mask is now an RGBA DataTexture: B wear (+ desire
  lines at path corners, gate fans at path ends, doorsteps, scree aprons), A lawn tone (mowing stripes in
  park / lawns / courtyards / gardens, minus edge darkening along kerbs, walls, garden borders, hard areas,
  features). Shader: macro lush/sunny patches (~40 m), clumps, clover drifts, stripes, edge tint;
  meadows with heather/gorse drifts, south-slope warmth, steep-bank bleaching; ground rock matches cliffs.
* **T3 stadium — DONE (it3), final verification pending.** New `landmarks/stadiumShell.ts`: brick facades
  between four corner stair towers (plinth, pilasters, sill/string courses, stepped cornice, parapet,
  coping), arched gates with stone surrounds/keystones/iron gates/"GATE A–D" signs + lanterns, exit gates
  and the club crest roundel on the river side, arched windows + louvres per bay, towers with quoins,
  stacked lit stair windows, doors, flags (south), exposed lattice girders ON the main roof and end
  canopies, lattice floodlight masts (legs, cut-out bracing, rings, platform with railings, tilted frame
  with 15 lamp housings; glows unchanged in kind/mode so the night agent's spot pairing still works).
  Fixed: the back parapet and last tread were coplanar with the facade's outer face (grey z-fight panel).
* Hill outcrops: same rocks, but faceted/slabby with the cliff shading, the big one stacked into a tor.
* it1 review (11 h): cliffs read as stratified rock (big win), but too brick-like → it2: per-column
  boundary wobble, tapered block ends (V joints), thin beds recessed+dark (shale bands), slanted
  mid-row facets, more moss; portal approach cuts dressed too. Lawn stripes/macro too weak → boosted.

* Perf structure (offline geometry count, node + rolldown, scratchpad/geo/masstat.ts): masonry mesh
  legacy 25.7k tris / 51.5k verts → new 39.0k tris / 37.4k verts (cliff skin 12k tris / 9k verts,
  scree 225 stones as 20-facet chunks). The masonry material is now `flatShading` (facets from
  derivatives) so the skin + every boulder are indexed with shared vertices: FEWER vertices than before
  despite the new rock. Cliff build 0.17 s at boot.
* Stage S1 lighting is live (stronger warmer sun, weaker fill): re-tune under it.
* it2 (S1 lighting, same build A/B `?legacyterrain`): sheet `shots/terrain/sheet_it2_day.png` — cliffs and
  stadium clearly better; lawn only subtly better → it3: stronger park stripes (±13 %), clump hue/value
  ±15 %, cooler lusher palette. Stadium tower tops were big cream slabs → parapet ring + dark roof + hut.
  Stats (subset page): masonry 26.9k → 38.5k tris (cliffs 15.5k incl. scree), landmarks 102k → 110k
  (stadium 5.6k → 11.5k, floodlights 0.9k → 2.8k), draw calls unchanged, atlas 0.66 → 0.74, invariants
  and validate clean, no console errors (a GL_INVALID_OPERATION sampler warning appears in BOTH variants —
  not from my materials). terrain buildMs 3.7 s → 20.7 s (SwiftShader page): per-shape canvas blur on
  hundreds of mask shapes → now drawn sharp and blurred once (verify in it3).

* it3 (`shots/terrain/it3/`): park POI shows mowing stripes + worn path edges, stadium POI reads as a
  brick ground with towers, dark roofs and lattice masts; cliffs in golden hour show warm strata bands.
  terrain buildMs back to 1.9 s (single blur pass). Lawn/courtyard stripes bumped to ±12 % after review.

## Toggles
`?legacyterrain` (everything old), `?nocliffs` (no rock skin / tors), `?legacyground`, `?legacystadium`.

## Shots
Baseline close-ups (5174, subset `only=sky,terrain,water,roads,landmarks,vegetation,rail,postfx`, 1280×720):
`shots/terrain/base/{station,cliff,hcliff,wspur,lawn,stadiumc}_{11,21h5}.png`. Iterations: `shots/terrain/it*/`.
Views: cliff `-30,5,-160,55,-15,18`, harbour cliff `136,4,-162,75,75,22`, west spur `-184,4,-150,60,70,22`,
lawn `-40,0,20,45,10,38`, stadium `-27,0,72,60,0,35`, hills/station `0,2,-142,120,-95,42`.

## Final verification (2026-10-17 23:38–00:06, full city 5173 vs 5174, 1280×720)
* `shots/terrain/final_new/`, `shots/terrain/final_old/` (10 views × 11 / 18.2 / 21.5 h). Sheets:
  `shots/terrain/sheet_final_11a.png` (overview, station, industry, harbour), `sheet_final_11b.png` (park,
  riverside, stadium, stadium north), `sheet_final_golden.png`, `sheet_final_night.png`; isolated A/B of my
  areas only (`?legacyterrain`, same build/lighting): `shots/terrain/sheet_it2_day.png`.
* New page: 0 console errors/warnings, invariants {}, validate [] ; terrain masonry 26.9k → 38.5k tris,
  landmarks stadium 5.6k → 11.9k, floodlights 0.9k → 2.8k tris; terrain buildMs ≈ legacy (1.3 s).
* T4 verified at night: lamp pools light the park / riverside lawns (albedo × lamp map).
* After the restart: lawns still too subtle at 130 m → it4: per-lawn tone patchwork (±11 %), park stripes
  ±20 %, lawn stripes ±17 %, gardens ±10 % (A/B in `shots/terrain/it4/`).

## it4 result (lawns, isolated A/B `?legacyterrain`): `shots/terrain/sheet_it4_lawns.png`
Park, riverside, westbrook gardens and the apartment lawns now read clearly (stripes + per-lawn patchwork)
at 120–140 m; console/invariants/validate clean in both variants. T2 considered done.

## Resume 2 (2026-10-18 afternoon) — lead's remaining scope
* (a) Night readability: masonry shader `mNightLift()` — soft wrap-lit moon + sky term for rock
  (cliffs ×1, boulders/tors ×0.8, walls/portals ×0.35; none on lamps / dark bore), shaped so upper facets
  and ledges are brightest and creases stay dark; scales with uNight; moon direction copied from
  ctx.clock.moonDir in terrain.frame(). Strength `?nightrock=<k>` (default 0.07, 0 = off); off in legacy.
  Verification run: `shots/terrain/night1/` (new vs nightrock=0, 21.5 h and 2 h).
* (b) small 5174 sheet with the final lawns: pending (`scratchpad/finalchain.sh`, captures part only).
* (c) optional: smooth slope beside the west rail portal.

## Perf variants for lead
`;legacyterrain;nocliffs;legacyground;legacystadium;nightrock=0` (views: station POI for cliffs, park POI for
lawns, stadium POI, overview; 12 h — plus 21.5 h for nightrock=0).

## Next steps
Review night1 → tune → final2 captures (park, riverside, westbrook, stadium @11 h, 5173 vs 5174) → sheets →
final report.

## Requests to other areas
(none yet)

## Changes outside my area
(none)

## Final report

**What changed (files)**
- **T1 cliffs** (`terrain/cliffs.ts`, `masonry.ts`): layered, faceted rock skin on the escarpment, spur noses and flanks, and the harbour cliff. Strata are broken into blocks with jagged joints, darker thin bands, mossy ledges, scree stones and a gravel strip at the foot. Hill boulders became chunky stacked rocks. Terrain heights are untouched, and the rock is merged into the masonry mesh, so no extra draw call.
- **Moonlit rock at night**: `mNightLift()` in `masonry.ts` lifts upper facets and ledges while creases stay dark. Measured at 21.5 h: rock median 20 vs 14–16 for the lawns beside it (5 before); harbour cliff 26–35 vs grass 14–17.
- **T2 lawns** (`ground.ts`, new RGBA mask): mowing stripes, a different tone per lawn, large-scale patches, clover, darker grass along kerbs, walls and fences, and worn shortcuts at path corners, path ends, benches and doorsteps. Hill meadows got heather and gorse; ground rock matches the cliffs.
- **T3 stadium** (`landmarks/stadiumShell.ts`, `stadium.ts`): brick facades with pilasters and cornice, arched gates with signs and lanterns, and the club crest. Four corner stair towers, lattice girders on the roofs, and lattice floodlight masts with real lamp heads. Also fixed a grey z-fighting panel on the facade.
- **T4**: ground and masonry take light from `thLampLight`; verified on the park and riverside lawns at night.

**Toggles:** `?legacyterrain`, `?nocliffs`, `?legacyground`, `?legacystadium`, `?nightrock=0`

**Before/after sheets** (`shots/terrain/`)
- My changes only (same build): `sheet_it2_day.png`, `sheet_it4_lawns.png`.
- Full city, original build (5174) vs current (5173): `sheet_final_11a.png`, `sheet_final_11b.png`, `sheet_final_golden.png`, `sheet_final_night.png`, `sheet_final2_lawns.png`.
- Night rock: `sheet_final_night_rock.png`.

**Stats**
- Draw calls: +0.
- Masonry: 26.9k → 38.4k triangles, but vertices fell 51k → 37k (flat shading via derivatives with shared vertices).
- Landmarks: static mesh +4.5k triangles, detail +3.2k, kinetic +0.2k, lights +0.2k.
- No console errors or warnings; invariants and validation clean.
- GPU estimate: about +0.1–0.2 ms on high (reasoned, not measured).

**Perf variants for lead:** `;legacyterrain;nocliffs;legacyground;legacystadium;nightrock=0`

**Open**
- Garden stripes look deliberately model-railway.
- Forests on the hills are still dark at night (vegetation's area).
- `nightrock` has no adaptive tie-in (none needed).
