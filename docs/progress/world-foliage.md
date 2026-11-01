# world-foliage — leafy, living trees (world round, workstream 4)

## Resume here (update after EVERY step)
* 2026-10-24 ~15:30 — FINISHED (see "## Final report"). Final verification: shots/world/foliage/fin_sheet.png
  (forest eye level with buttress roots + smooth near trunk, park, old town, world overview; no console errors,
  invariants empty). All files typecheck. No jobs running.
* If resumed for follow-ups: tools in scratchpad/{capset.sh, dumpatlas.sh, vstat.py, proj.js, bench/};
  views listed below; lead notes all addressed (sky fill, near-camera dissolve, scaffolds, spruce cones,
  understory, close-range limbs, planter shrubs, near trunks).
* Views: park=-55,4,15,26,200,6; ot=66,3.5,-13.9,13,25,4; palmB=118,8,28,28,40,25; forest=10,10,-158,70,10,10;
  parkair=-55,0,17,90,30,30; ovw=0,0,-20,420,25,38; forest eye via ground's gcap.mjs fe1=-40,-172,9,160,5,1.6.

## Brief (from WORLD-PLAN.md + briefs)
Owns `src/world/vegetation.ts` + `src/world/vegetation/*`. Trees are smooth faceted blobs (lollipops from afar,
green polyhedra at eye level). Deliver: near LOD with leaf-card clusters (procedural leaf atlas, alpha-tested,
cards shadowing), irregular silhouettes with sky gaps, visible branches, asymmetric crowns, species + age variety
incl. Mediterranean (palms done properly, olive, plane, ficus, jacaranda, cypress), undergrowth; far LOD with
leafy silhouette edges; layered forest edges; leafy bushes/hedges; wind from `src/core/wind.ts` (Crysis main +
detail bending, per-tree phase from the root so a gust bends neighbours in sequence, leaf flutter); backlit
translucency at golden hour; night lamp light kept. `?noleafcards` A/B, leaf-LOD distance setter for air's
adaptive ladder, quality tiers. Forest continues into world's landscape forest at the slab edge (via lead).
Budget (high): 1.2 ms GPU net, share of ≤ +25 draw calls; medium/low much less.

## Design
**One truth per tree: its lobes.** Every crown is still described by a lobed envelope (union of ellipsoid leaf
masses, asymmetric per species/site). Near and far LODs are both generated from it, so they match.

* **Leaf atlas** (`atlas.ts`): canvas-drawn at boot, 2048×1024, 256² tiles: broadleaf clusters (linden/maple,
  plane, oak), dense clump (inner/far), small glossy (ficus, citrus), olive (narrow silver-green), birch,
  jacaranda (fern leaves + violet panicles), blossom, needle spray (spruce/fir), pine tufts, cypress sprays,
  palm frond (pinnate), fan palm, shrub leaves, oleander. Channels: R = leaf brightness/shading, G = per-leaf
  random (hue drift + leaf-by-leaf fade), B = flower mask, A = coverage. Mip chain built in JS with
  coverage-preserving alpha (no thinning with distance). One opaque texel region for wood.
* **Cards** (`cards.ts`): instanced quads. Per instance: centre, U/V half-axes, spherized normal + AO, tree root
  + height, colour + flower code, branch phase/weight, tile. One InstancedBufferGeometry holds a STATIC far part
  (all trees: few large dense cards per lobe) and a DYNAMIC near part (fine cluster cards of the trees within
  leafDist of the camera, CPU-selected from a grid, rewritten only when the set changes, sorted near→far).
  Vertex shader: per-tree crossfade (near cards appear leaf-by-leaf, far cards dissolve) from a uniform view
  position (not `cameraPosition`, which is the light in the shadow pass). Material = MeshStandard patched:
  atlas alpha test, spherized normals (no back-face flip), wrap diffuse, shadow-aware backlit translucency in
  RE_Direct, crown AO, received-shadow offset along L (no self-acne), lamp light, fog chunks kept.
* **Wood** (`skeleton.ts`): instanced tapered tube segments (trunk → limbs → branches → twigs) generated toward
  the lobes (each lobe = a limb with its leaf mass), same static far (trunk + main limbs) / dynamic near split,
  per-segment visibility distance (twigs only close). Bark painted in shader (furrows, birch, plane mottling,
  palm leaf-scars).
* **Wind**: Crysis main bend from `thWindAt(root.xz)` (WIND_GLSL) — neighbours bend in sequence as a gust
  front passes; branch bob with per-branch phase/weight shared by a branch's twigs and cards (cards stay
  attached); leaf flutter per vertex along the card normal, amplitude × gust.
* **Draw calls**: cards 1 + wood 1 (+ 2 shadow) replace trees-near/far/forest (+ shadows). `?noleafcards` =
  previous hull meshes (A/B + fallback).
* **Quality**: high leafDist 75 m, medium 40 m, low 0 (far cards only). `services.vegetation.setLeafDistance(m)`
  for air's adaptive ladder. Far part chunked later if vertex cost at eye level is too high.
* **Species** (Mediterranean city): plane, linden/maple, oak, ficus (Tel-Aviv street tree), olive (gnarled,
  multi-stem), jacaranda, Italian cypress, stone pine, date palm, Washingtonia fan palm, Canary palm, citrus,
  cherry blossom, birch, poplar, willow, spruce/fir/pine for the hills; age classes (young/mature/old).
  Placement by district (street trees by district character, plazas olives/palms, beach palms, gardens citrus
  /olive, hills pine/oak + conifers).
* Bushes: card clusters (near) over the existing hull (far); hedges: leafy card fringe near, solid far.

GPU estimate (to verify): near cards ≈ 15–25k instances at eye level (60–100k verts) + wood ≈ 50k verts,
far part ≈ 30k cards (120k verts) + 3k segments; fragment: alpha-tested overdraw ~2–3× on foliage pixels.

## Milestones
* M1 broadleaf near/far cards + skeleton + wind + atlas (biggest visible gain: eye level).
* M2 species: Mediterranean set + conifers + palms; placement by district; age variety; asymmetry.
* M3 bushes, hedges, forest edge layering (+ landscape seam), undergrowth.
* M4 lighting polish (golden-hour translucency, night), quality tiers, adaptive setter, perf/stats.
* M5 final captures, report.

## Captures (shots/world/foliage/)
* before: before_sheet.png (+ before/*). Atlas: atlas.png. Iterations: m1a…m1i sheets (m1x_sheet.png).
* Best: ba_m1.png (before/after), m1h/ot_11.png (forked street tree), m1h/park_11.png + m1i/park_11.png (park,
  spruce cone, plane scaffolds), m1f/park_18h2.png (golden hour), m1d/palmB_11.png (date palms), m1h/forest_18h2.png,
  wind_sheet.png (gust motion diff), fin/ (final verification incl. forest eye level, groundcover on).

## Perf (stats3, quality high, only=sky,terrain,landscape,water,roads,buildings,vegetation,props,lamps,postfx)
| view | leaf cards | ?noleafcards | veg instances |
|---|---|---|---|
| overview (0,0,−20, 420 m) | 1.52 M tris, 90 draws | 1.40 M, 90 | cards 47.6k static, wood 5.6k |
| park eye | 1.70 M, 86 | 1.60 M, 86 | + near 12.0k cards, 3.0k wood |
| old-town eye | 1.72 M, 86 | 1.61 M, 85 | + near 10.8k cards, 3.1k wood |
Build (quiet machine): vegetation 1.1–1.3 s (atlas 0.19–0.29 s, far 0.2–0.3 s); near gen ≈ 1.5–2 ms/plant
(lazy, 4/frame, 60 after a camera jump). Draw calls: cards + far wood + near wood (+3 shadow) replace trees
near/far/forest (+shadows): net ±0. Far wood since then 8 → 6 sides (−25 % of its tris).
GPU estimate (Adreno X1-45, 1920×1025): vertices ≈ 0.40 M per pass at eye level (cards ×4, tubes 2×sides),
≈ 0.8 M with the shadow pass → ≈ 0.6–0.8 ms; fragments: alpha-tested foliage ≈ 35 % of the screen × ~2.5
overdraw × ~180 ALU ≈ 0.3 ms + shadow-map alpha test ≈ 0.1–0.2 ms → ≈ 1.0–1.3 ms at eye level (hulls ≈ 0.5)
→ net ≈ +0.5–0.8 ms; overview ≈ +0.2 ms. Medium: leafDist 42 m, far cards ×0.85; low: no near cards, far ×0.6.

## Toggles / knobs
`?noleafcards` (previous lobed hulls, A/B + fallback), `?legacyveg`, `?vegparts=trees,forest,plants`,
`?vegshadow=0`. Runtime: `services.vegetation.setLeafDistance(m|null)`, `getLeafDistance()`,
`cardKnobs` (windK main/limb/branch/flutter, trans, wrap, tilt, skyFill, edgeFade, farKeep, shadowShiftLen,
night, fx), `debugPlants(x,z,r)`, `atlasTex`. Stats: cards/wood `static+near`, nearPlants, leafDist,
atlasMs, farMs, nearGen, rebuilds, forestBand, forestMantle, ferns.

## Requests to other areas
* world (via lead, 2026-10-20 ~20:35, accepted): world's 3D landscape trees start at z < −225 with a 15 m ramp;
  foliage plants its hill forest in a 45 m band beyond the slab N edge (landscape.cover().forest/height).
  Tones: spruce/fir ≈ #33683f…#3f7c4a, pine #3d6a36, broadleaf #4f8a33…#5a9636 (vertex colour, pre-light).
* ground (pending, to send at M3): under the hill forest canopy the floor still reads as lawn — a forest-floor
  look (needle/leaf litter, darker, ferns/moss patches) where `services.vegetation.trees` are dense / landscape
  cover.forest > 0.5 would complete the woodland. Foliage adds shrubs + saplings under the canopy.

## Changes outside my area
(none) — note: pond reeds/lily pads removed from vegetation.ts at ground's request (groundcover owns them).

## Final report
**What changed.** Trees, palms, shrubs and hedges are leaf-card foliage instead of faceted hull blobs.
A procedural canvas leaf atlas (24 cluster tiles: broadleaf, plane, oak, ficus/citrus, olive, birch,
jacaranda, blossom, spruce/pine/cypress sprays, date frond, fan leaf, ivy, fern, shrubs; coverage-preserving
mips, colour push-pull) feeds instanced cards; instanced tapered tubes draw the skeletons. Every plant is one
deterministic structure (lobed envelope → swept trunk with root buttresses → fork → Bézier scaffold limbs →
limbs → branches → tips). Far LOD: out-facing dense cards per leaf mass, conifer cone shells, straight trunks;
near LOD (≤ 75 m, lazily generated): clusters on every tip (half out-facing), dense inner cards, whorled
spruce cones, keeled palm fronds, 12-sided skeleton; per-plant LOD texture dissolves leaf by leaf (shadows
too). One wind (core/wind.ts): main bend per root (gusts roll through rows), limb + branch bob, flutter.
Shading: spherized normals + per-leaf tilt, wrap, shadow-aware backlit translucency, sky fill, AO, night
lift, lamp light, edge-on and near-camera dissolve. Mediterranean species by district, street crowns along
streets, forest mantle/understory/ferns, 45 m forest band beyond the slab, weathered planters with ivy.

**Files.** `src/world/vegetation.ts`, `vegetation/{atlas,foliage,crowns}.ts` (new), `material.ts`, `plants.ts`.

**Toggles.** `?noleafcards` (old hulls), `services.vegetation.setLeafDistance(m|null)` for air's ladder,
`cardKnobs.*` (farKeep per tier), `debugPlants()`.

**Shots.** ba_m1.png (before/after), m1h_sheet.png, m1i/park_11.png, fin_sheet.png, wind_sheet.png.

**Cost.** Draw calls ±0 (cards + far/near wood + shadows replace 3+3). Triangles vs `?noleafcards`:
overview 1.52 M vs 1.40 M, park eye 1.70 M vs 1.60 M, old town 1.72 M vs 1.61 M. GPU estimate ≈ +0.5–0.8 ms at
eye level, ≈ +0.2 ms overview (high); medium leafDist 42 m + 85 % far cards; low far cards only (60 %).
Build ≈ 1.2 s.

**Open.** Real-GPU perf A/B pending (lead's run); forest floor shading under the canopy is ground's; blossom
and autumn tiles could use smaller leaves; olive/citrus tiles a little sparse.

