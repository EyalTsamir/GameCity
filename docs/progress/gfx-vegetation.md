# gfx-vegetation — audit item 6 (trees that look crafted, not plastic)

Owner files: `src/world/vegetation.ts`, `src/world/vegetation/*` (species.ts generators, geo.ts sink, material.ts
foliage/wind material, plants.ts, `legacy/` = frozen pre-overhaul copies for `?legacyveg`).


## Resume here (updated every step)
* DONE + verified: V1–V4, final before/after sheets (shots/vegetation/final_*.png), tris +7.9 % vs 5174.
* CURRENT STEP (lead item a, night readability): material.ts LEAF_FRAG_AO now relaxes crown AO with uNight
  (thAOn) and lifts sky fill ×(1+uNight·night·(0.55+0.45·top)) and moon on tops ×(1+uNight·night·1.2·top);
  knob `foliageKnobs.night` default 2.0 (`?vegnight=`). Test run night1 → shots/vegetation/night1/
  (ov21/st21 with night=0/2/3, fo21, pk21, ov2, fo2). Evaluate with luma medians (canopy vs unlit lawn).
* Also done (unverified in browser): hedge tops lighter/yellower (species.ts hedge(), HEDGE_FRESH lerp 0.14, ×1.06).
* night1 RESULT (shots/vegetation/night1_sheet.png): night=0 forest median luma 1.9 (station) / 9 (overview NE);
  night=2 → 4.3 / 18.2 with moonlit tops clearly separated (90th pct 20–33), park crowns 46–48 vs unlit lawn 19;
  night=3 slightly brighter, birches start to glow. DECISION: keep default 2.0, conifers now get the full lift
  (lift ∝ min(1, leafiness·1.25)); verify once more in the final night sheet.
* NEXT: tune `night` from night1 → write the value here → final sheets refresh (night + gardens + downtown
  street view dtst=-16,0,-65,30,30,30 and oldtown ot=77,0,-14,34,20,32 instead of plaza_11) → Final report.
* Refresh runs DONE + verified (no errors, invariants empty): finA (11 h), finC (21.5 h), baseD. Sheets rebuilt
  (scratchpad/sheets.sh; dtst/ot street views dropped — framing missed the trees). Night lift verified in
  final_night.png (forest/park crowns read as green masses with moonlit tops; station forest no longer a hole).
* STATUS: FINISHED — see "## Final report" at the end. Jobs: none running. Legacy toggle + legacy/ kept for QA.

## Brief
V1 foliage shading · V2 silhouettes/species/conifers/forest variety · V3 bushes & hedges · V4 lamp light ·
V5 verification (before/after 5174 vs 5173, perf A/B). Budgets: tris ≤ +15 %, shader ≤ 0.3 ms GPU.

## Design (implemented, first pass — iterating)
* New per-vertex attribute `aLeaf` (normalized Uint8 vec4: ao, tone amplitude, leafiness, clump size code) —
  GeoSink extras gained `u8: true` (props unaffected). Written by `leafAttr()`; `Wind.at()` resets it
  (fluttering parts → soft leafiness, static parts → hard).
* material.ts (MeshStandard + onBeforeCompile, define-free runtime branches on leafiness):
  billowed 3D gradient noise (2 octaves, integer hash, analytic derivatives) on the REST position →
  leaf-clump relief normals, crease occlusion, clump tone drift; each octave fades by fwidth footprint
  (no sparkle). Wrapped N·L (patched `lights_physical_pars_fragment`), unshadowed backlit translucency
  (rim-weighted, directionalLights[0]), aLeaf AO on indirect (+35 % on direct), reduced grazing env sheen,
  lamp light (`thLampLight`) on foliage/trunks + canopy undersides. Bark painted in-shader
  (aLeaf.w code: furrows / birch dashes) → birch trunk is a plain tube now.
* species.ts: lobed-union canopies with AO in aLeaf; broadleaf families dome/oval/spread/irregular,
  small silhouette bumps on detail-3 crowns; birch = 3–4 separate leaf clouds + twigs; poplar flame;
  conifers rebuilt: spruce/fir drooping skirts (apex → shoulder → scalloped rim, alternating
  tips/gaps, tip highlights, golden-angle tiers, wobble, leader spike) + pine (clear trunk, flat pads);
  bushes 4–6 lobes, dark foot, blossoms on flowering shrubs; hedges with AO foot / fresh top.
* vegetation.ts: per-tree tone (hash), forest stand tones, forest edge = more broadleaf/birch/young trees.

## URL switches
`?legacyveg` (old generators + material, same placement) · `?vegfx=0` (new geometry, plain shading) ·
`?vegbump= &vegtrans= &vegwrap= &vegtone= &vegscale= &vegcrease= &vegfine=` (shading knobs), `?vegclump=billow` (all billow); runtime: `__city.ctx.services.vegetation.knobs.*.value` (model 0 per-vertex, 1 billow, 2 cells) · existing `?vegparts=trees,forest,plants&vegshadow=0&vegmat=`.

## Status / next steps
1. [done] it1 new vs legacy (shots/vegetation/it1, it1L): FIREFLIES — wrapped N·L fed GGX specular (visibility
   explodes at back-lit grazing) → wrap now only on the diffuse term. Conifer scallops too star-like → softened
   (gap 0.83, 7/5 tips, less droop). Billow relief read as "brain folds" → added cellular-dome clump model
   (uThModel 0 = cells default, 1 = billow; `?vegclump=billow`), knobs exposed at ctx.services.vegetation.knobs.
   Forest birch = union crown (fewer tris). Forest rim undergrowth (shrubs under edge trees).
   Tri estimate: near ≈ +7.5 %, far ≈ +2 % (it1 stats: treeTris 120.9k vs 114.3k legacy; forest 64.4k→~53k after fixes).
   Scratch tool: scratchpad/vcap.mjs = many knob variants in one page load (list sep '@@').
2. [done] it2 broken by core/lampLight.ts textureLod bug (reported, lead fixed). it3/it4 = knob grids
   (shots/vegetation/it3, it4, it4_c.png, it4_b.png; legacy it3L): DECISION relief = clump CELLS (3x3x3
   Voronoi, jitter .45) for broadleaf/bushes, BILLOW for needles / clipped hedges / willow / palm / small
   plants (packed into aLeaf.y with the tone amplitude: species.ts leafTone()). Defaults: scale 1.5,
   bump 0.5, crease 0.25, fine 0.35, trans 0.6, wrap 0.45. Translucency colour toned down (yellow glow).
   Offline geometry preview (no browser): scratchpad/export.mjs + raster.py (numpy rasterizer) — used to
   redesign birch (notched narrow crown + satellite cloud on a twig), pine (separate flat pads on limbs),
   conifers (stepped wide skirts, convex profile, scalloped rim, geometric profile normals).
   Forest rim broadleafs → detail 2. ctx1 (overview/night/riverside/industry, shots/vegetation/ctx1_sheet.png) OK.
3. [done] it5 (shots/vegetation/it5_a/b/c.png vs legacy): clumpy crowns with interior depth, backlit glow at
   18.2 h (legacy: flat dark blobs with plastic rim sheen), forest richer. Follow-ups applied: forest rim now
   also = top of a cliff/cut (terrain drop to the south) → rim gets broadleaf/birch/young trees, finer
   crowns and undergrowth; softer creases (0.2, wider); deeper blossom pinks; flowering shrubs = real
   blooms (7–11 little 4-petal flowers) instead of blotchy vertex speckles; cheap 2x2x2 clump search on
   medium/low (`?vegcells=8|27`).
   Tris (it5, only=sky,terrain,water,vegetation,lamps,postfx): treeTris 122.2k (legacy 114.3k), forest 62.2k
   (45.9k), plants 43.8k (43.0k), fine 32.8k → near total +10.6 %, far total +9.2 % (budget +15 %).
4. [done] final full-city captures (5174 baseline vs 5173): shots/vegetation/finA|B|C vs baseA|B|C,
   legacyveg isolation: legv. Sheets: shots/vegetation/final_day.png, final_golden.png, final_night.png,
   final_close.png (closeups/backlit/forest edge/gardens/allotments), final_isolated.png (same build,
   ?legacyveg vs new), final_lod.png (285 m near LOD vs 320 m far LOD), rev_forest.png.
   First final pass found the cliff-rim criterion (terrain drop over 9 m) marked 80 % of the forest as
   "edge" → forest 106k tris, plants 59k (+32 % total!). Fixed: rim = steep step (>1.5–2.5 m within 2 m)
   in the first 6 m to the south (~20 % of the forest), rim birch weight 1.4+1.6·edge, undergrowth 60 %
   chance of one shrub, forest pines 2 pads (weight 0.9), forest birch crown detail 1 (rim: 2),
   near conifers 6 tips + underside only on the lowest skirt, far conifers 4 tips.
   Final stats (finA, full city): trees 948 (forest 497), bushes 413; treeTris 118.5k (base 118.3k),
   treeFarTris 45.2k (52.8k), forestTris 63.8k (45.9k), plantTris 46.2k (45.2k), fine 32.8k →
   near +7.9 % / far +7.9 % vs 5174 (+11.8 % vs ?legacyveg in today's tree). Draw calls unchanged (same meshes).
5. Perf: SwiftShader perf.mjs runs were dominated by machine contention (variants ordered randomly in
   cost). Added runtime knob fx (uThFx) and scratchpad/vperf2.mjs: ONE page load, states alternated
   (hidden / plain / full 27-cell / cheap 8-cell / billow), medians. perf3 (park 1280x720, 3 rounds) was
   still noise (3–5 s/frame, load avg 20 on 4 cores; hidden 3421 / plain 4573 / full27 4231 / cheap8 3665 /
   billow 4297 ms medians — not usable). perf4 (960x540, 5 rounds) was KILLED by the pause before it ran.

## PAUSED (user budget pause, 2026-10-18 ~10:35) — exact state
* Code: complete for V1–V4, typechecks (`npm run typecheck | grep world/vegetation` clean); committed by the
  lead in b929af3 (+ later edits: runtime uThFx knob, runtime-editable cheap knob — also typechecked).
  No edit half-way. No background jobs of mine running.
* V5 done except a usable perf A/B. Final sheets exist (see item 4).
* NEXT on resume:
  1. Perf A/B when the machine is quiet: `scratchpad/veg_launch.sh perf4 node scratchpad/vperf2.mjs --q
     "only=sky,terrain,water,vegetation,postfx&nointro&noidle&quality=high" --view park --hours 12
     --seconds 4 --rounds 5 --width 960 --height 540` (reads shots/vegetation/perf4.log). Report draw calls
     (unchanged: veg meshes same), triangles (+7.9 % near/far vs 5174), SwiftShader relative cost, GPU estimate.
  2. GPU estimate to write up: +4 B/vertex (aLeaf u8), +2 varyings; fragment ≈ 27-cell Voronoi (~25 ops/cell
     ≈ 700 ALU) + billow octave (~120) + lighting extras (~40) per near-foliage pixel; billow-only surfaces
     (needles/hedges) ≈ 250; fades to ~40 ops beyond the clump footprint (overview). ~0.4 M foliage px at
     1920×1025 POI views → ≈ 0.2–0.35 ms on Adreno X1-45; medium/low use the 8-cell path (≈ 4× cheaper).
     If over budget on high: switch high to 8-cell too, or fade cells by distance earlier (smoothstep 0.12→0.42).
  3. Polish candidates: hedge tops a touch lighter/yellower; replace the useless `plaza_11` view in the sheet
     set with a downtown planter street (find a downtown 'tree' slot); check night trunk lighting near lamps.
  4. Final report (≤ 350 words) via SubagentHandback.

## Perf variants for lead
Consolidated A/B (same view list as everyone, quality=high): `;legacyveg;vegfx=0;vegcells=8;skip=vegetation`
* `legacyveg` = whole pre-overhaul vegetation (geometry + material) → total vegetation delta
* `vegfx=0` = new geometry, plain (wind-only) material → shader cost = baseline − vegfx=0
* `vegcells=8` = cheap 2x2x2 clump search (what medium/low use) → if high is over budget, switch high to it
* `skip=vegetation` = reference
(optional `vegclump=billow` = cheapest relief model, all surfaces)

## Baseline numbers (pre-change, only=sky,terrain,water,vegetation,postfx, park 11h)
trees 944 (forest 469), treeTris 118336, treeFarTris 52830, forestTris 45940, plantTris 45180, fineTris 32762, verts 218303.

## Requests to other areas
—
## Changes outside my area
—

## Final report
Vegetation (audit item 6) — done; legacy toggle + `legacy/` kept for QA.

**What changed (files)**
- `vegetation/material.ts`: foliage shader on MeshStandard. Leaf-clump relief on the rest position (3x3x3 Voronoi
  domes for broadleaf/bushes, billowed noise for needles/hedges/willow/palm), footprint-faded (no sparkle); crease
  occlusion, per-clump tone drift, diffuse-only wrap, reduced plastic rim sheen, unshadowed backlit translucency
  (golden-hour glow), crown occlusion from the new `aLeaf` attribute, `thLampLight` on trunks/canopies (+underside),
  in-shader bark (furrows, birch dashes); night readability lift (relaxed AO, sky fill/moon on crown tops × uNight).
- `species.ts`: crown families, silhouette bumps; birch (notched crown + detached cloud), poplar flame, pine pads;
  conifers rebuilt as stepped drooping skirts with branch tips; bushes with blossoms; hedges with dark foot/fresh top.
- `vegetation.ts`: per-tree/stand tones; forest rim above the cut gets broadleaf/birch/young trees, finer crowns,
  undergrowth. `geo.ts`: u8 attributes.

**Toggles**: `?legacyveg`, `?vegfx=0`, `?vegcells=8|27` (medium/low auto 8), `?vegclump=billow`,
`?vegnight=`, `?vegbump/trans/wrap/tone/scale/crease/fine`; runtime `services.vegetation.knobs`.

**Sheets** (shots/vegetation/): final_day, final_golden, final_night, final_close (5174 vs 5173),
final_isolated (same build, legacyveg vs new), final_lod, rev_forest, night1_sheet.

**Perf**: draw calls unchanged. Vegetation tris near 261k vs 242k (+7.9 %), far 155k vs 144k (+7.9 %); +11.8 % vs
legacyveg. SwiftShader A/Bs were contention noise → deferred to the lead's consolidated run (variants listed above).
GPU estimate: +4 B/vertex, 2 varyings, ≈860 ALU per near-foliage pixel (27 cells) → ≈0.2–0.35 ms on X1-45 at POI
views; 8-cell path ≈4× cheaper (switch high to it if over budget).

**Trade-offs / open**: relief fades at overview (trees rely on vertex AO + glow there); forest tris +39 %;
night lift is a stylised boost (knob `night`=2); terrain cliffs at night are terrain's.

