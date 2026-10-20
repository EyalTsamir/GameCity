# world-ground — grass, meadows, flowers, weeds, litter, reeds (world round)

## Resume here
* 2026-10-20 02:05 — t5 judged (shots/world/ground/t5): pond verified (reed stands, cattails, lily pads,
  shore meadow) → lead asked to have foliage remove their pond reeds/lilies; golden hour glows (pond_18h2:
  backlit meadow + reeds warm and luminous — the reference's foreground feeling); landscape band works
  (edge_s: blades continue into world's meadow beyond z=150); lawn near/far step fixed (park_eye_11).
  Fixed after t5: pavement weeds = own habitat code 120 (leafy rosettes, 7 % dandelions, more spots along
  walls 0.5 / kerbs 0.26 / gutters 0.2 per 0.9 m), shaded meadow brighter (root AO 0.46, turf lighter),
  more/larger meadow flowers (ring A 20 %, species patches wider), meadow tussock heights ±34 %, ring
  budgets A 576 / B 448 / C 512 (edge_s had 653 k verts). Boot: maps 1.7 s + band 0.9 s (load ~13).
* Running: t6 (ot_walk weeds, fence tufts, park_eye, bank_band × 11 / 21.5 h night, overview) → t6.
* Next: judge t6 → perf/stat numbers in the log → gust motion check (2 frames) → M4 far-field polish
  (overview) → quality tiers (medium/low captures) → final report.

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
- [ ] M0 survey, log, before captures
- [ ] M1 cover mask + height texture + blade field rings A/B/C (lawns + meadows), wind, ground shader
      palette + seam
- [ ] M2 flowers (meadow species + lawn dandelion/clover), unmown edge tufts, pavement weeds
- [ ] M3 shore: reeds/cattails/shore grass, lily pads; dunes (marram); leaf litter under trees
- [ ] M4 ground far field: gust sheen, flower dots, backlit lift, desire lines; overview judged
- [ ] M5 landscape near-ring meadows (needs world's `ctx.services.landscape`), quality tiers, service,
      adaptive hook, perf report, final report

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
(pending)
