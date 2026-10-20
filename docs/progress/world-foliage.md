# world-foliage — leafy, living trees (world round, workstream 4)

## Resume here (update after EVERY step)
* 2026-10-20 01:35 — RESUMED after the 3rd stop/reboot. M1 + species/bushes/hedges/forest band in code.
  m1a (shots/world/foliage/m1a_sheet.png, 11 h): leafy trees render everywhere, no errors; verdict: crowns
  too SPARSE at every distance (atlas tiles only ~30 % filled, few far cards), trunks too thick (street trees
  look like tufts on poles), palms sparse. Since: atlas clusters fill their tiles (clipStem, more/smaller
  leaves, denser pine/citrus/blossom/jacaranda), trunk girth ↓, 4 tips/branch, 2–3 inner dense cards per lobe,
  far cards 2–4 per lobe ×1.12 size, edge-on fade softened. Typechecks.
* NEXT: dumpatlas.sh + capset.sh m1b 11 → judge; then palms, golden hour/night, overview, perf counts.
* Tools: scratchpad/{capset.sh OUT HOURS [q] [views], dumpatlas.sh, vstat.py, bench/}.
* Views: park=-55,4,15,26,200,6; ot=66,3.5,-13.9,13,25,4; dt=-22,3.5,-68.9,14,35,4; palms=118,5,30,18,90,6;
  forest=10,10,-158,70,10,10; parkair=-55,0,17,90,30,30; overview.

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

## Captures
(pending)

## Requests to other areas
(none yet)

## Changes outside my area
(none)
