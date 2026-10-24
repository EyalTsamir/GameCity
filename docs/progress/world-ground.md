# world-ground — grass, meadows, flowers, weeds, litter, reeds (world round)

## Resume here
* 2026-10-24 16:10 — DONE (forest-floor tune verified, final report updated). Nothing running.
  If resumed: only follow-ups from the lead's full-city review.

## Brief (from WORLD-PLAN.md + world-briefs.md "### ground")
Owner of `src/world/terrain/ground.ts` (+ its mask), `src/world/groundcover.ts` + `src/world/groundcover/*`.
Gap: every lawn, verge, riverbank and park is one flat lime-green felt (at eye level a green floor).
Deliver: instanced grass blades in camera-centred LOD rings (dense near, sparser/wider further, then the
ground shader); short mown lawns vs long meadow grass (0.4–0.8 m) with wildflowers (poppies, cornflowers,
daisies, buttercups, cow parsley); unmown tufts along walls/fences/kerbs/poles/tree bases; clover/dandelions
in lawns; weeds in pavement joints and kerb gaps; fallen leaves under trees; worn earth on desire lines;
reeds/cattails, shore grass, lily pads; pond + beach dunes (marram). All bending with the one wind
(`src/core/wind.ts`, visible gust waves). Ground shader far field reads as grass/meadow and blends seamlessly
into the blades (overview pixel ≈ 31 cm: blade-average colour patchwork, gust sheen bands, flower dots with
fwidth fade, sheen toward the sun). Meadows of the landscape near ring via `ctx.services.landscape`.
Expose `ctx.services.groundcover` (flower patches for life, density setter for air's adaptive ladder).
Budget (high): ≈ 1.8 ms GPU, ≤ ~0.5 M grass vertices, few draw calls; medium/low scale down; `?nograss`.

## Design
**Blade field (`groundcover/field.ts`)** — camera-snapped square tiles, one instanced draw per LOD ring
(instance = tile: origin, size, ring). Blades are generated in the vertex shader from the vertex index
(blade index × verts-per-blade) + a hash of the blade's world root — no per-blade attributes, deterministic
(recycled tiles never re-randomise). Root positions: R2 low-discrepancy sequence shifted per tile (fract),
so no visible repetition. CPU per frame: walk the candidate tiles of each ring (≤ ~600), reject by
precomputed per-tile coverage (empty / lawn-only tiles skipped in the mid/far rings), distance and frustum;
write survivors front-to-back into a preallocated InstancedBufferAttribute (early-Z) — no allocations.
* Ring A (≤ ~12 m): 2 m tiles, ~160 blades/m², 7 verts (3 segments + tip), rounded normals.
* Ring B (≤ ~35 m): 4 m tiles, ~40 blades/m², 5 verts, ×2 wider; only tiles with long grass/edges/reeds.
* Ring C (≤ ~70 m): 8 m tiles, ~12 blades/m², 3 verts, ×4 wider; meadows/reeds only.
* Crossfade: per-blade personal cut distance (hash) — blades shrink to nothing over ~1.5 m; the next
  ring's blades grow in over the same band. Min on-screen width ≈ 1 px; edge-on widening.
* Mask (`groundcover/mask.ts`): RGBA8 at 0.25 m over the slab — R density (where grass can grow:
  plan blocks/areas by top-most surface like roads/covers.ts, minus roads/sidewalks, drawn+undrawn paths,
  buildings, solid features, water, garden items, allotment beds, rail, rock), G length (mown lawn 5–9 cm
  … unmown edge tufts 15–35 cm … meadow 40–80 cm), B wet/shore (reeds/cattails/shore grass), A litter
  (fallen leaves under trees). Plus a half-float height texture = rendered ground height (sidewalk tops for
  pavement weeds). Kerb/wall/fence/pole/tree-base bands raise G (unmown tufts); pavement-joint weeds = a
  sparse band on sidewalks/plazas next to walls and kerbs.
* Species by blade hash: grass (clump Voronoi cells 0.5–2 m set height/tone/lean), seed-headed grass,
  flowers (poppy, cornflower, daisy, buttercup, cow parsley; dandelion + clover heads in lawns), reeds +
  cattails in the wet band, marram on dunes, flat leaves for litter. Flower patches from per-species
  noise fields (the same functions in the ground shader → far-field flower dots match).
* Wind: `thWindAt(root)` (core/wind.ts) bends each blade with a length-preserving t² bend + per-blade
  flutter; pressed blades show their pale underside → the gust fronts read as travelling light waves.
* Shading: MeshStandardMaterial + onBeforeCompile (same lighting/IBL/fog as the ground → colour match),
  root→tip gradient, AO by height, normal blended toward the terrain normal with distance, sun
  translucency through a wrapped RE_Direct (uses the shadowed light colour, so shaded blades don't glow),
  night lamp light (LAMP_GLSL). No shadow casting; receives shadows.
**Ground shader (`terrain/ground.ts`)** — new natural palette (olive / yellow-green / blue-green / straw,
no lime), blade-average colour, darker turf under the near blade rings (same fade function as the blades
→ no seam), gust sheen bands (thGust), flower-patch dots (fwidth-faded), backlit warm lift toward the sun,
worn earth on desire lines consistent with the blade mask.
**Separate small meshes**: lily pads (pond, river mouth; bob on the water), maybe reeds as static
instances if the field can't place them well.
**Service** `ctx.services.groundcover = { density(x,z), flowerPatches[], setDensity(k), getDensity() }`.
**Quality**: high = rings A+B+C; medium = A+B at ~60 % density, shorter radii; low = ring A only at
~40 % (or `?nograss`). Reacts to the 'quality' event; `setDensity(k)` for air's adaptive ladder.
**GPU estimate (to verify)**: worst case eye level in a meadow ≈ 0.45 M verts (A 180 k + B 200 k + C
100 k); typical park view ≈ 0.2 M; overview ≈ 0 (shader only).
**Toggles**: `?nograss` (no blades), `?grass=<k>` (density scale), `?gcrings=A,B,C`, `?nolitter`,
`?noreeds`, `?gcflowers=0`, `?legacyground` (old ground shader, shared with wear's hardscape).

## Milestones
- [x] M0 survey, log, before captures (shots/world/ground/before_base, 5174)
- [x] M1 cover maps + height map + blade rings A/B/C, wind, shared palette, ground shader v3, edge seam
- [x] M2 clustered meadow flowers + lawn daisies/dandelions/clover, unmown edge tufts, pavement weeds
- [x] M3 reed stands/cattails/shore meadow, lily pads (pond), marram dunes, fallen leaves, forest floor
- [x] M4 far field: gust sheen, flower dots/tint, backlit glow, tuft bump, desire-line wear
- [x] M5 roaming landscape window (blades anywhere beyond the slab), tiers, service, density setter

## Requests to other areas
* world (via lead, pending): include `GC_PALETTE_GLSL` + `gcPalette()` (src/world/groundcover/palette.ts,
  shared uniform objects) in the land shader for meadows that match the slab exactly; my gcMeadowA is now
  their cMeadow #68833e. Seam fix on my side: meadow margin within 10 m of the W/S slab edges.
* foliage (via lead, after my reeds/lilies are verified): remove the pond reeds + lily pads from
  src/world/vegetation.ts (pond section ~l.917–965) — groundcover now draws reed stands, cattails, shore
  grass and lily pads.

## Changes outside my area
(none)

## Best views
(pending)

## Perf notes
* Draw calls: +3 instanced (rings A/B/C, only when tiles are visible; 0 at the overview) + 1 (lilies).
  Blades never cast shadows; they receive them (Standard material, sun shadow map).
* Blade vertices (high, 1600×900 captures, t8): bank_meadow 400 k, pond 506 k, park_eye 481 k,
  park_mid (45 m) 183 k, overview 0. Rings: A 2 m tiles × 576 blades × 7 verts (≤ 12.5 m), B 4 m × 448
  × 5 (≤ 35 m), C 8 m × 512 × 3 (≤ 66 m). Dead blades (density < 1) collapse to degenerate triangles
  after the cover fetch — cheap vertex work, no raster.
* Vertex shader ≈ 350–450 ALU + 8 fetches (cover, flower, 4 height taps, 2 noise) per vertex.
  GPU estimate (Adreno X1-45, eye level in a meadow, worst case ≈ 0.5 M verts / 0.35 M tris):
  vertex ≈ 0.3–0.45 ms, raster/fragment (thin triangles, ~1.5 M fragments incl. overdraw, Standard
  + PCF shadow) ≈ 0.6–0.9 ms → ≈ 1.0–1.4 ms; POI/overview views: ground shader only, ≈ +0.05–0.1 ms
  (≈ 60 extra ALU + 2 texture taps per ground pixel). Budget 1.8 ms.
* Boot: slab cover maps ≈ 1.1–1.5 s on this loaded 4-core box (raster 0.4 s, lattice 0.1 s, combine
  0.4–0.6 s, flowers 0.15 s); landscape band built incrementally after boot (≈ 1 s CPU spread over
  frames, 4 ms/frame at 60 fps). GPU memory: tCover 8.7 MB (+mips), tFlower 2.2 MB, tGH 8.7 MB R32F,
  band 5 + 1.1 + 5 MB.

## Final report

**What changed.** An instanced blade field in three
camera-centred rings (A ≤ 12.5 m 7-vertex blades, B ≤ 35 m, C ≤ 66 m; one instanced draw each; blades
generated in the vertex shader from tile + blade hashes) draws mown lawns with daisies/dandelions/clover,
unmown tufts at walls/fences/kerbs/trees/poles, wildflower meadows (clustered poppies, cornflowers, daisies,
buttercups, cow parsley, knapweed; taller stems), pavement-joint weeds, fallen leaves, forest floor, reed
stands with cattails and loosestrife, shore meadow, marram on dunes, and lily pads. Everything bends with
core/wind.ts gust fronts and glows when backlit at golden hour. The ground shader shares the blade palette
(natural greens, no lime), shades the turf under the rings, adds flower dots/tints, gust sheen, tuft
bump, a forest floor under closed stands (umber leaf litter ↔ reddish needles, damp hollows, moss, muted
clustered leaves; no slope-rock under trees) and a 15 m meadow margin at the W/S edges (world seam). A roaming 224 m cover
window, double-buffered and built in the background from landscape.cover/height, extends blades to any
landscape meadow, bank or dune near the camera (riverbend).

**Files.** src/world/groundcover.ts + groundcover/*, src/world/terrain/ground.ts.

**Toggles.** ?nograss ?grass=k ?gcrings ?gcflowers=0 ?nolitter ?nolilies ?nogcouter; service
groundcover {density, flowerPatches, setDensity, palette}.

**Shots.** sheet_before_after_11.png, sheet_before_after_golden.png (shots/world/ground);
sheet_forest_floor.png (t15), t8/pond_18h2 (best), t10b/riverbend_*, hop2/*, gust_{1,2}.

**Cost** (t12, high vs ?nograss, eye level): +3 draw calls, +0.45 M triangles (incl. degenerate),
≈ 0.5 M blade vertices worst case; medium 0.29 M; low 0.09 M; overview +0. GPU estimate (Adreno X1-45):
≈ 1.0–1.4 ms at eye level in meadows, ≈ 0.1 ms at POI/overview (ground shader only). Boot ≈ 1.5 s (loaded box);
window ≈ 0.3 s over frames.

**Regression caught.** A refactor (04:20) had dropped `setGroundCover()`: the ground ran without cover
maps until 15:40 (t10–t14 ground only); fixed, plus a groundcover invariant that flags it.

**Open.** Measure perf.mjs `;nograss;grass=0.5;gcrings=A` on the real GPU. Reeds are not in the water
reflection. Flower heads are flat cards (crude below ~2 m). Fields beyond the slab get only sparse
blades. A window rebuild uploads ~1.8 MB in one frame. Medium lawns read lighter (AO off: air).
