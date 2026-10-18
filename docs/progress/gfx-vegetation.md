# gfx-vegetation — audit item 6 (trees that look crafted, not plastic)

Owner files: `src/world/vegetation.ts`, `src/world/vegetation/*` (species.ts generators, geo.ts sink, material.ts
foliage/wind material, plants.ts, `legacy/` = frozen pre-overhaul copies for `?legacyveg`).

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
4. [in progress] final full-city captures queued (FIFO): shots/vegetation/finA|B|C (5173) vs baseA|B|C (5174),
   legv (5173 &legacyveg, isolates vegetation); perf2a/b (scratchpad/vperf.mjs = perf.mjs with 2 h lock wait).
   perf1 (park, SwiftShader) was too noisy to use (legacy slower than new, skip slower than all).
   (old item: tune shading, check triangle counts vs budget (baseline near: trees 118k, far 53k, forest 46k, plants 45k, fine 33k)
3. V5 full-city before/after + perf A/B.

## Baseline numbers (pre-change, only=sky,terrain,water,vegetation,postfx, park 11h)
trees 944 (forest 469), treeTris 118336, treeFarTris 52830, forestTris 45940, plantTris 45180, fineTris 32762, verts 218303.

## Requests to other areas
—
## Changes outside my area
—
