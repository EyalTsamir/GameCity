# gfx-terrain — graphics overhaul, audit item 10 + lamp light on the ground

Owner: terrain agent. Files: `src/world/terrain.ts`, `src/world/terrain/*` (except `slab.ts`, `glow.ts`),
`src/world/landmarks.ts`, `src/world/landmarks/*` (except `glows.ts`, `shaders.ts`, `materials.ts`).

## Brief
T1 cliffs & rock · T2 lawns & ground · T3 stadium shell · T4 lamp light in the ground shader · T5 verification.

## Design / state
* **T4 lamp light — DONE (integrated, waits for the night agent's bake).** `ground.ts` and `masonry.ts`
  (quay walls, portals, rocks, cliffs) add `diffuseColor * thLampLight(worldPos, worldNormal)` after
  `lights_fragment_end` (uniforms via `lampUniforms()`).
* **T1 cliffs — first implementation, iterating.** New `terrain/cliffs.ts`: stratified faceted rock skin on
  the ridge escarpment (x −180…111 minus the road-portal wings), both spur noses and the harbour cliff.
  Columns every ~1.5 m march the heightfield along the face's outward normal (terrain heights untouched;
  every vertex = ground point at its height pushed out by D, D < 0 buried). Global strata (0.8–2.1 m,
  dipping), blocks of 2–4 columns with own protrusion, crease + bulge + lip + ledge top, flat facets.
  Merged into the masonry mesh (no extra draw call), new masonry kind `KIND.cliff = 6` with its own
  shader branch (sub-bedding lines fwidth-faded, streaks, lichen, cracks, moss/grass on ledges).
  Scree stones at the feet (masonry boulders), `cliffFeet` → gravel aprons in the ground mask.
* **T2 ground — first implementation, iterating.** Mask is now an RGBA DataTexture: B wear (+ desire
  lines at path corners, gate fans at path ends, doorsteps, scree aprons), A lawn tone (mowing stripes in
  park / lawns / courtyards / gardens, minus edge darkening along kerbs, walls, garden borders, hard areas,
  features). Shader: macro lush/sunny patches (~40 m), clumps, clover drifts, stripes, edge tint;
  meadows with heather/gorse drifts, south-slope warmth, steep-bank bleaching; ground rock matches cliffs.
* **T3 stadium — first implementation (untested).** New `landmarks/stadiumShell.ts`: brick facades
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

## Toggles
`?legacyterrain` (everything old), `?nocliffs` (no rock skin / tors), `?legacyground`, `?legacystadium`.

## Shots
Baseline close-ups (5174, subset `only=sky,terrain,water,roads,landmarks,vegetation,rail,postfx`, 1280×720):
`shots/terrain/base/{station,cliff,hcliff,wspur,lawn,stadiumc}_{11,21h5}.png`. Iterations: `shots/terrain/it*/`.
Views: cliff `-30,5,-160,55,-15,18`, harbour cliff `136,4,-162,75,75,22`, west spur `-184,4,-150,60,70,22`,
lawn `-40,0,20,45,10,38`, stadium `-27,0,72,60,0,35`, hills/station `0,2,-142,120,-95,42`.

## Next steps
1. Review it1 captures of cliffs/lawns, refine. 2. Stadium shell (T3). 3. Full-city before/after sheets, perf A/B.

## Requests to other areas
(none yet)

## Changes outside my area
(none)
