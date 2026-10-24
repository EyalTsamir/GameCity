# world-foliage — leafy, living trees (world round, workstream 4)

## Resume here (update after EVERY step)
* 2026-10-20 01:35 — RESUMED after the 3rd stop/reboot. M1 + species/bushes/hedges/forest band in code.
  m1a (shots/world/foliage/m1a_sheet.png, 11 h): leafy trees render everywhere, no errors; verdict: crowns
  too SPARSE at every distance (atlas tiles only ~30 % filled, few far cards), trunks too thick (street trees
  look like tufts on poles), palms sparse. Since: atlas clusters fill their tiles (clipStem, more/smaller
  leaves, denser pine/citrus/blossom/jacaranda), trunk girth ↓, 4 tips/branch, 2–3 inner dense cards per lobe,
  far cards 2–4 per lobe ×1.12 size, edge-on fade softened. Typechecks.
* m1b (m1b_sheet.png): fuller; still lollipop street crowns, sparse palms (fronds edge-on from below),
  forest = trees on a lawn. Since: atlas side shoots/denser tiles, street crowns stretched ×1.4 along the
  street (PlantDef.stretch), palm fronds = keeled V half-cards (near), forest crowns ×1.18 + forest-floor
  shrubs (42 % of forest trees), lead note → weathered octagonal/box planters (plants.ts stonePlanter: grime,
  algae, worn chipped rim, damp soil, fallen leaves) + trailing ivy / groundcover cards (crowns emitPlanter,
  atlas 'ivy' tile). Typechecks.
* m1c/m1d (m1d_sheet.png): date palms now full arching crowns ✔, planters weathered ✔, ot street tree reads
  as a real leafy tree ✔; Washingtonia crowns looked like stacked tufts → fixed (28–36 fans on short petioles,
  blade ⟂ petiole facing out, petiole wood). Pond reeds/lilies removed (groundcover owns them, lead request).
* m1e (m1e_11/18h2/21h5.png): park at golden hour reads as a real park ✔; spruce = sparse skeleton of
  sprays (needs density); unexplained bare trunk stubs in the park view (investigating: scratchpad/proj.js
  prints plant roots projected to screen via console.warn after 15 s); fan palms fixed after m1e.
* Lead notes done in code (to verify): sky fill on cards (cardKnobs.skyFill 0.7 × sky-facing × AO) so shaded
  crowns are dark green not black; cards within ~0.7–1.9 m of the camera dissolve.
* Stats (quiet machine, full-ish city, high): veg build 0.6–2.2 s (atlas 0.23 s, far 0.15–1 s); park eye:
  cards 50.1k static + 2.9k near, wood 7.8k + 0.6k; scene 1.59 M tris vs 1.55 M with ?noleafcards; draws 84 vs 86.
  → cut: trunks 2 segments, forest far cards 1–2/lobe (cone 2), band density 0.9 → 0.6. Quality tiers: far-card
  keep (cardKnobs.farKeep high 1 / medium 0.85 / low 0.6) + leafDist 75/42/0.
* 2026-10-24 ~09:30 — m1f verified lead notes (sky fill: 18.2 street crowns dark green ✔; inside-crown clean ✔);
  stub mystery = cypress trunk top showing under a crown → leaders added (trunks taper on into the crown);
  spruce alternates flat + hanging spray cards (reads as a conifer now, wind_1.png); far cards and ~half of
  near clusters face OUT of the crown (tangentFrame) so crowns are not see-through face-on. Wind verified
  (wind_sheet.png diff: crowns, trunks and dappled shadows move). M1 milestone message sent to lead
  (ba_m1.png before/after sheet).
* Lead review of M1 (approved) → 3 notes, all coded (to verify):
  (1) "hat on a stick": broadleaf trunks now taper and FORK at 0.74–0.86 × clear into 2–4 scaffold limbs
      (vase/spread/umbrella 3–4) bowing up/out (first scaffold segment static, rest near), central leader for
      dome/oval; limbs to leaf masses start from scaffold anchors (anchorFor: direction + reach). Columns and
      olive multi-stems keep their own stems.
  (2) conifers: emitConeShell — every whorl tier gets a ring of drooping needle sprays lying on the cone
      (inner end at the trunk, needles over the tier below), 2 dark inner cards per lobe, upright leader spray;
      far LOD = same shell every 2nd (forest 3rd) tier with needleDense; sprays density 1 (40 % hanging).
  (3) forest understory: mantle of young birch/oak in front of edge trees (veg-forest-mantle), 1–3 shrubs
      per edge tree on the city side, fern clumps (atlas 'fern', kind fern, 0–3 per forest tree) + shrubs under
      the canopy. Asked ground (via lead) for a forest-floor shading under the canopy.
* m1g (m1g_sheet.png): spruces now read as real cones (forest view) ✔, parkair crowns fuller (tangent cards) ✔,
  street trees fork (Y) ✔ but far/crossfading trees showed cut scaffold stubs → scaffolds fully static
  (non-forest); after a camera jump near detail is generated in one batch (budget 60) and weights snap.
* m1h (m1h_sheet.png) verified the review fixes: ot street tree forks into scaffolds with a full crown ✔,
  spruce cones ✔, forest with mantle/understory ✔. Milestone note sent.
* 2026-10-24 13:35 resumed after 6th stop. RUNNING: stats2 shots (ovw / parkeye / oteye × cards / ?noleafcards)
  → shots/world/foliage/stats2_*.json.
* NEXT: GPU estimate + final report (≤ 350 words) in this log; message lead; SubagentHandback.
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
* world (via lead, 2026-10-20 ~20:35, accepted): world's 3D landscape trees start at z < −225 with a 15 m ramp;
  foliage plants its hill forest in a 45 m band beyond the slab N edge (landscape.cover().forest/height).
  Tones: spruce/fir ≈ #33683f…#3f7c4a, pine #3d6a36, broadleaf #4f8a33…#5a9636 (vertex colour, pre-light).
* ground (pending, to send at M3): under the hill forest canopy the floor still reads as lawn — a forest-floor
  look (needle/leaf litter, darker, ferns/moss patches) where `services.vegetation.trees` are dense / landscape
  cover.forest > 0.5 would complete the woodland. Foliage adds shrubs + saplings under the canopy.

## Changes outside my area
(none)
