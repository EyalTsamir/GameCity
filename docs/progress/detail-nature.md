# detail-nature — nature and the horizon (detail round, 2026-10-31)

Owns `src/world/vegetation*`, `src/world/groundcover*`, `src/world/landscape*`. Port 5204. Rules: `DETAIL-ROUND.md`.
Switch file: `src/core/nature.ts` (`?nonature`, `?no<feature>`).

## Resume here
Six rounds done, final checks run (end of the Log). Nothing in progress. Left, in order of worth: bare hills at 1–4 km could
take more copses (each costs impostors); grass blades still a little dark against the ground at 18.2; country limbs are
angular at under 15 m; a leaf card smears when the free camera sits inside a country crown. None is worth its cost now.
Dev server: `npx vite --port 5204 --strictPort --host 127.0.0.1` from this worktree. Captures from the main checkout with
`--url http://127.0.0.1:5204/`, output into `shots/nat/` (ignored). The shared browser lock can hold a capture for minutes: no
`timeout` round the scripts, it kills the wait silently.

## Audit, round 0 (shots/nat/a0, a1: 25 views at 11 and 18.2)
What reads as fake, ranked by how much of the first impression it costs:
1. Overview foreground: fields are flat pastel quads that end in a bevel on a blank sand strip. Half the hero shot.
2. Eye level in a field: flat colour bands with sparse straw sticks (`outer.ts`: fields get 12 % density long grass).
3. Country trees: all one lollipop (trunk to 48 % of the height, dark plum bark, leaf cards as big as a table), far too
   many hedgerow trees for the size of the plots. City trees are far better than these.
4. At 18.2 country trees are near-black teal silhouettes (backlit, translucency too weak).
5. Hills at 1–4 km are felt with a few specks: the villages are at 1.7 km W and 1.65 km S, none on the hills in frame.
   No power lines, no road leading the eye, no spire on the skyline.
6. Beach and dunes south of the town: empty tan strip.
7. Forest interior: near-black floor, huge plain trunks. Hedges in the west lane: clay lumps with sparse cards.
8. River banks: reeds are sparse sticks, flat grass, no willows that read as willows.
Good already: park planting, city trees, mountains' silhouette, hamlet from 120 m.

## Plan
- A. Row strips (`landscape/rows.ts`): alpha-cut leaf-wall ribbons, one atlas, static merged mesh. Vineyards, maize,
  sunflowers, hedges, windbreaks; rows and their shadows are what make a field read as farmed. Plus bales, polytunnels.
- B. Blades know the crop (`groundcover/outer.ts` + `field.ts`): wheat stands, maize, stubble at eye level, no new vertices.
- C. Country tree shapes, bark, leaf size, species; fewer and clumped hedge trees (saves impostors).
- D. Golden-hour colour of country trees.
- E. Coast: meadow belt before the dunes, marram, sand fences, shacks.
- F. Horizon: hill towns with campanile, road, power line, ridge monastery.
- G. Forest floor, hedges, kerb planters, river banks.

## Log
### Round 1 (8d33e7c, 73cb1ba)
Added: row strips and farm kit (vines, maize, sunflowers, hedges, bales, polytunnels, wire and stone fences, reeds, dune
fences, marram, duckboards, boats), crop blades, eight tree species with new shapes, bark and backlight, hill towns with
campanile, abbey, lane out of town, high-voltage line, telephone poles, dune belt, hill copses, cypress avenues.
Perf (`perf1`, on AC, overview / downtown / street / market vs `?nonature`): +1.3 / +0.35 / +0.4 / 0 ms, draw calls +72 / +12 / +18 / +19.
The overview's +1.3 ms is in `msPerFrame` only (GPU total unchanged): the kit's 512 m chunks were 60 draw calls.
Trim: chunks 1400 m (10 meshes). Triangles over 40 frames: +230 k in the overview (kit ~115 k, its shadows ~100 k).

### Round 2
Audit (w1, w2): wood interiors had a smooth tan floor, lampshade conifer cones, starfish limbs on a post; west-lane
hedge a clay bank; pale wires drawn across the plain at 18.2; clipped hedges clay at 2 m.
Added: forest floor litter (`shader.ts`), `landscape/woods.ts` (bracken mounds, hazel, logs, stumps, mossy boulders within
420 m of the slab; river boulders; cut-out strips over the west hedge, core shrunk), limbs that bow, taper and fork
(`treelimbs`, also removes the conifer cone), leaf-scale detail on clipped hedges (`hedgeleaf`), wires fade with distance,
second row of flowers in kerb planters (`fullplanters`), meadow mottling softened, hedge stubs dropped.

Toggles so far: `?nonature`, `?nofarmkit`, `?nostriphedges`, `?nofarmrows`, `?nobales`, `?nofarmfences`, `?noreedbeds`,
`?nodunekit`, `?nopowerlines`, `?notreekinds`, `?noskyline`, `?nohillscatter`, `?noavenues`, `?nocropblades`,
`?nowoodfloor`, `?noriverrocks`, `?noedgehedge`, `?notreelimbs`, `?nohedgeleaf`, `?nofullplanters`, `?nofarmyard`, `?notownglow`.

### Round 3
Fresh audit (w5, w6): overview and farms hold up at noon and 18.2; yards were bare; lights in the country hard to see at 21.5.
Added: farm yards (`farmyard`, `farmstead.ts`: gravel surface, muck heap, log stack, trough, drums, pallets, two ricks, wind pump
on ~70 % of the three real farms); country lights 1.7 m / min 2.3 px / brighter (`townglow`). A big town halo was tried and
removed: the sprite is depth-clipped by the hill and reads as a rising moon.
Trim: kit in three meshes (north, south, far; far casts no shadow), draw calls from +72 to about +10.
Checks so far: typecheck, build 4.11 MB, overview `{}` / `[]` at speed 4, hitch prog+0 in all windows, quality medium / low
and `?diorama` clean, film sheet fine (nature hardly in it), ui-test 70 passed + `kinds` (known flake, rerun alone).

Undergrowth moved to a fourth mesh without a shadow pass, ferns thinned (fewer triangles), hedge core drops into shade near the camera.

### Final state
Perf `perf5` (on AC, 3 repeats, `;nonature`, high, 1920×1025), overview / downtown / street / market:
+0.37 / +0.54 / +0.47 / +0.46 ms; triangles −22 k / +213 k / +141 k / +260 k (frame-to-frame swing of the shadow passes is ±200 k; market
is at the +250 k line within it); draw calls −12 / +7 / +3 / +11. Static: kit ~100 k tris, build ~650 ms at boot.
Checks at the last code commit (2cd67a6): typecheck, build 4.11 MB; overview at speed 4 invariants `{}`, validate `[]`; hitch prog+0 in every window;
`quality=medium`, `quality=low` and `?diorama` clean with `{}` / `[]`; film sheet looked at in seek mode, nature hardly in it; ui-test 70 passed + `kinds` (flake, alone: see below).
Before / after sheets in `docs/progress/detail/nature/`.
Best views: farmland `farm=-340,4,300,70,30,14` at noon and 18.2; sunflowers and pylon `-300,3,-130,60,30,6`; wood `-250,6,-260,30,160,8`
at noon; river at eye level `-520,0.5,160,16,250,5`; hill towns from `overview` at noon; farm yard `-382,3,97,34,60,14`; dune pines `330,2,420,60,70,8`.
Files outside my folders: none. `src/core/nature.ts` is new.

### Rounds 4 to 6
Round 4 (audit `shots/nat/r4a`): country crowns near black, wires pale at 18.2, flat beach, smooth lanes, bare clipped hedge tops,
pink reed plumes, crude boats. Added `treefill` (crown lighter, floor on the leaf AO), `hedgetops` (second row of top clusters),
wires without fog and fading earlier, close sand (grain, scuffs, shell; a dark weed term made a honeycomb and was dropped), rutted
gravel lanes, `beachwood` (driftwood as kinked boughs with a broken branch, stones on the tide line), boats with chine and thwarts.
Round 5: `treefill` also lifts bark ×1.5; `RowSink.dome` (one rounded sheet with bowed shoulders) replaces the crossed strips of hazel
(a vase, 3 sheets) and bracken (mound, 2 sheets).
Night audit: past the last house the ground was black at 21.5. `moonlit` (`moonLift()` in `core/nature.ts`): land, trees, impostors, rows,
buildings, roads and herds lit ×3.6 by uNight and shifted toward blue; the land fades it in over 8–80 m from the slab so there is no seam.
No geometry and no extra texture fetch. `farmwindows`: 60 % of farmhouse windows lit, curtains glowing, a lamp by the door. Near lamp sprites clamped
to 8 px (they read as a moon on the wall at 70 m).
Round 6: `soilclods` (ploughed land under 0.25 m per pixel: turned slices as a normal, clods, a few stones; relief down at low sun, or it turns
to leopard skin), `fieldblades` (blades beyond the slab: root occlusion floor 0.78, colour up: they read as black ticks).
Bug found by a winding scan (`shots/nat/winding2.js`): the same frame maths in `log()`, `bale()`, the pylon `rod` and the boat hull wound faces inward, and a
double-sided material then flips the normal, so all of them were lit from the wrong side, hence the black logs and bales. Fixed; 5 faces of 30 k still disagree (a boat's underside, never seen).
Undergrowth reach 420 → 320 m to stay on the triangle budget.

### Final state of the round
Triangles swing ±240 k with the shadow cycle, so only compare samples in the same mode. Same-mode against `;nonature`, `perf11` (on AC, 3 repeats, high, 1920×1025), noon / 21.5:
overview +153 k / +157 k; downtown +215 k / +250 k; street +215 k / +235 k; market +210 k / about +175 k (no same-mode pair at 21.5: read against the high mode of `perf8`).
Undergrowth reach went from 420 to 320 m and the undergrowth (70 k) hides with the camera above 130 m (no visible pop: the canopy covers it from there).
Timing is noisy and the means mix shadow modes. `perf11`, frame ms, noon / 21.5: overview +1.58 / +0.63, downtown +0.75 / +0.80, street +0.49 / +0.78, market +0.30 / +0.33. GPU timers: overview +0.07 / +0.81, downtown +0.37 / +1.00, street +0.81 / +0.36, market +0.31 / +0.39.
The overview noon figure is the one over the line. Its samples are 36.78, 36.13 and 38.23 against 35.46, the GPU timer says +0.07, and the gap is on the CPU side. `hitch.mjs` on overview at noon shows why: steady window 36.71 vs 35.94 ms (+0.77), the window right after the camera cut 38.03 vs 36.18 (+1.85, cpu 13.55 vs 10.1). So the steady cost is under 1 ms and the excess is a transient after arrival, which `perf.mjs` catches in its short window. Not traced further.
JS allocation is the same with nature on and off (35 vs 37 MB/s steady at overview): not from this work, see Hand-offs. Per-feature run `perf10` at overview: no feature of rounds 4 to 6 stands out above the noise (each within ±0.15 ms).
Checks: see the last entry below.
New toggles: `treefill`, `hedgetops`, `beachwood`, `moonlit`, `farmwindows`, `soilclods`, `fieldblades`. Sheet `docs/progress/detail/nature/night_soil_beach.jpg`.
Best views: moonlit land `-1100,12,300,80,90,6` at 21.5; farmhouse `-382,3,97,70,200,6` at 21.5; wood edge `-420,1.6,-120,14,60,10` at 18.2; ploughed land `-560,1.6,60,10,90,6` at noon; beach `170,1.6,345,8,10,10` at noon.
Files outside my folders: `src/core/nature.ts` only (already mine).

## Hand-offs
- Streets / places: pale green ellipses on the gravel ruts of the west lane (`hedge_lane=-196.4,1.6,20,10,180,4`): read as stains.
- Streets: weeds in pavement joints stand well proud of the paving at the market planter view; fine at distance.
- Coordinator / whoever owns the frame loop: `hitch.mjs` reports 35 MB/s of JS allocation at overview and 12–19 MB/s at street, with `?nonature` too (rule: no per-frame allocations). I did not trace it; check it is not the harness.
