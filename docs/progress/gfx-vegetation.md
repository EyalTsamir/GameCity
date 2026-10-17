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
`?vegbump= &vegtrans= &vegwrap= &vegtone=` (shading knobs) · existing `?vegparts=trees,forest,plants&vegshadow=0&vegmat=`.

## Status / next steps
1. [in progress] first capture iteration new vs legacy (shots/vegetation/it1*, park/closeup/forest/station, 11 & 18.2 h)
2. tune shading, check triangle counts vs budget (baseline near: trees 118k, far 53k, forest 46k, plants 45k, fine 33k)
3. V5 full-city before/after + perf A/B.

## Baseline numbers (pre-change, only=sky,terrain,water,vegetation,postfx, park 11h)
trees 944 (forest 469), treeTris 118336, treeFarTris 52830, forestTris 45940, plantTris 45180, fineTris 32762, verts 218303.

## Requests to other areas
—
## Changes outside my area
—
