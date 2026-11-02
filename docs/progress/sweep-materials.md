# Sweep: wrong and stretched materials, then what was left open (`textures-smeared-stretched`, `sign-lettering-clipped`)

Branch `claude/laughing-antonelli-3a55b3`, port 5233. Switches in `src/core/sweepmat.ts`: `?nosweepmat` all, `?nomatclass ?nomatframe ?nomatriser ?nomatportal ?nomatsiding ?nomatboard ?nomattop ?nomathedge ?nomatcloth ?nomatsticker ?nomatsign ?nomatcard ?nomatcurtain ?nomatplank ?nomatcorner` one.

## What was wrong, by cause

| what the judges saw | cause | fix |
|---|---|---|
| wood grain on the stone ring of the road tunnel, on steel containers, on plastic bins and post boxes, concrete speckle on a rubber mat | the close-up layer's material came from a guess at the colour, and these colours are linear: sandstone `#b4a388` reads as sat 0.46, g/r 0.8, and passed for timber; a paint red passed as well | `matclass`: a per-vertex class from what the mesh itself knows (`aRM` on props, `aMas` on terrain, `aMat` on landmarks, `aPat` on the harbour); the colour test stays for what can't say, with thresholds that fit linear colour |
| smeared streaks and a mirrored seam down anything round: post box, bollard caps, fountain tiers | the close layer's coordinate was `dot(P, cross(N, G))` with the smoothed normal: across a facet of a round thing N turns, P is hundreds of metres from the origin, so the texture was multiplied many times over, with a seam where the turn stood still | `matframe`: the frame comes from the facet's own plane |
| vertical zebra stripes on the raised edge of a pad or a step | paving coordinates are x, z; on a riser one of them stands still | `matriser`, both in `rdHard` and the close layer |
| smudge, grass and roots on the printed part of a council board | the board was two transparent quads with nothing between them: no depth, so the AO of what stood behind came through, and no edge | `matboard`: a real panel and post, one draw (`lettering/boardBody.ts`) |
| flower heads as slabs across the sky in a sunflower field | the row's top strip is made to be seen from above; from under it the heads stretch | `mattop`: not drawn from under it, for maize and vines too |
| clapboard like brushed metal, planks 30 cm high | 30 cm boards, and bare fibre on pale boards | `matsiding`: 18 cm in both shaders; `matclass`: a pale board is painted |
| a garage door like brushed steel | fibre in the gloss-paint branch, on a piece five metres wide | `matclass`: a third of it |
| polka dots on a suit | the print is chosen per person without looking at what they wear | `matcloth`: no print on a jacket but a check |
| coloured squares all over a container | one sticker per 1.2 m² of painted metal | `matsticker`: a third |
| a hedge in camouflage | one size of soft blob | `mathedge`: two finer octaves up close, the leaves |
| tunnel ring one flat band, lamps plain slabs | no joints; a lit bar on the wall | `matportal`: 2 cm joints open to the wall behind, a bulkhead fitting with a guard |
| "AVEN HEIGHTS", "URNSTILES · PAY HER" | text wider than its atlas slot, cut by the slot's clip | `matsign`: `drawText` knows the slot's width and brings the letters in |
| TINYBUILD's T in the hazard stripes | stripes ran on under the name | `matsign` |
| "TOMS WAREHOUSE" | a 28 m sign on a shorter wall | `matsign` |
| poster column: bills cut by wide concrete ribs | the bills lay half a step off the drum's facets, so its corners came through them | `matsign` |
| gold lettering floating over a pier, or cut by it | one spot across all the panes of a shop front | `matsign`: one spot per pane (every second pane on a tower's shops) |
| NO SMOKING across the works plate | same height, same place | `matsign`: above it |
| red containers, post boxes and phone boxes like cork or granite | the planter-soil test (blue just over green, under red) is true of a bright linear red, so they were drawn as crumbs of soil | `matclass`: soil only if the mesh doesn't say metal, and only dark and not saturated |
| chevrons down the fountain's tiers | each ring of a water sheet had its own number of streaks (`round(r * 6)`), so they sheared one way and back between rings | `matcurtain`: one number for the whole sheet |
| cardboard as planks | it was the timber material | `matcard`: its own, matt, no grain |
| grain across the boards of a jetty ("motion blur") | the close layer took the grain from the long side of the quad | `matplank`: harbour decks say which way their boards run |
| letters past the fold of a bill: a star on the air beside a poster column | a clipped letter was drawn whole on the side of its centre | `matsign`: cut at the fold, on both sides |
| pale torn patches and fine stripes at both sides of the church tower (`lm-church-spire_3m`) | real z-fighting: each 0.7 m thick tower wall has an end face, and it lies in the plane of the next wall's front, with other pattern coordinates. It takes both sides of the corner, the last 0.7 m of each wall. Not AO, shadow, clouds, edge wear, the lens or shafts: all switched off one by one, TAA off only shows it as raw stripes | `matcorner`: `wall({ meets: true })` has no end faces, the fronts meet at the corner line. Same triangles otherwise, 4 fewer per corner |

## Not bugs

- `feat-cargoship_3m`, `feat-breakwater_1m` ("hull like melted marble", "shards"): the view's target is below sea level, so the camera is under the water. Nobody can stand there.
- `land-country-cars_10m` ("en Bakery"), `letter-prop-adpanel_1m`, `cs-text-ad_1m`: cut by the frame of the picture.
- `cs-rail-track_10m`, dark vertical breaks: real gaps between cliff blocks, end caps in shadow, deepened by AO (`?noao`: dark grey, not black). They read as fissures. Left.
- `hand-intercom_1m`, `letter-prop-bellplate`: the seam beside the plate is a plain wall section (`towers.ts` `wallPlain`) next to a textured one. Architecture.
- `lm-townhall-clocktower`, `place-oldlane-square`: blurred balustrades are the background seen through the gaps with the lens on.
- `cs-tree-street`: a plane tree's bark does look like camouflage.
- Lobby signs behind mullions (`HAVEN TOWER`, `BEACON HOUSE`, `LUMEN & CO`): real mullions in front of a real wall, parallax. Left.

## Still open

- **The same corner overlap on other walls.** Only the church tower has `meets`. The station's towers (`station.ts:278`) and other pairs of `wall()` that meet at a corner have the same geometry; a pair with one wall ending free needs one end kept, so `meets` as it stands doesn't fit them. No scan for coplanar overlaps across the city was run.
- **Half a face rough, half smooth, split on a line of 8 m cells** (`lm-station-clock_3m` at x = 0, `feat-lighthouse_1m` at x = 184). The close-up copy of a face is missing on one side of the line, for faces near z = -130.11. Cells are visible and built, the clip code reads right, and `keep` is not the plain answer. Of 264 pieces checked near that plane, 3 had no copy in the right cell, all at the station: the two triangles of a plaque (`landmarks-static-station-91`, x -0.8 to 0.8, y 14.2 to 14.7, z -130.11, plain surface) and one detail triangle (x 2.3 to 0, y 13.2 to 13.6, z -130.06). Their own attributes show nothing odd, other faces crossing x = 0 at z -130.13 are fine, and reading `TriGrid` (buckets, then `clip`) by hand finds no fault. Next step: call `grid.build` for that cell in the page and look for these triangles at each stage. **Cause unknown.**
- `keep` in `closemat.ts` also shows that `cmMasonry` has `top` 8: above about 20 m the close-up layer is off, so a camera up a tower sees plain landmark material. By design, noted because it looks like a bug.
- Crop atlas 128 px per band: blocky sunflowers, and `land-village` leaf cards close up. Needs more texture, a budget question.
- `lm-room-stadium_1m`: a green hard-edged patch on the ceiling and faint looping fissures on plaster. Not looked into.
- `bld-tower-scheme-6_1m`: blue mottled door frames (the view is blurred, so unconfirmed). A thin red line near the bus stop flag.
- Garage doors keep some brushed look, softer than before.
- Console: `THREE.BufferGeometry.toNonIndexed(): already non-indexed` is older than this work (`smalllife/litter.ts` or near it). The final check filters it out.
- Most of this was checked by eye at noon. 18.2 and 21.5 were not gone through for every fix.

## Measurements (AC throughout, guard reported no drop, rebaked first)

`abprof.mjs`, same page, 10 cycles of 3 s, the three shader switches that can be toggled live (`CM_MATCLASS`, `CM_MATFRAME`, `CM_MATRISER`), delta = with the fixes minus without:

| view | base ms | with ms | delta |
|---|---|---|---|
| street | 40.51 | 40.27 | -0.47 ±0.62 |
| market | 37.04 | 36.89 | -0.14 ±0.28 |

Both inside +0.3 ms by this measure, and no cost can be told from zero. The other switches are written into shader text or geometry at boot, so abprof can't reach them. For those, `perf.mjs` over page loads, `;nosweepmat` against baseline: street 37.80 vs 37.41 (+0.39), market 37.52 vs 37.35 (+0.17). Reload noise is ±1-2 ms, so this doesn't confirm the +0.3 ms limit for street, it only finds nothing above the noise. Street also differed by 39 draw calls and 625 k triangles between the two runs, and market by 1 draw and 2 k: most likely how far the near bubble had filled, not explained. `matcorner` went in while this was queued: the `perf.mjs` pages have it, the abprof page may not. It is geometry only, 16 triangles fewer.

## Checks

- `npm run typecheck`: clean at `6b46702`.
- `finalcheck` (overview at speed 4, high / medium / low / `?diorama`): no console errors, invariants `{}`, validate `[]`, no frame errors, no failed modules.
- `npm run build`: passes.
- `ui-test.mjs --q noidle`, in full: 74 passed, none failed.
- `hitch.mjs` (its default, overview at 12 and 21.5): `prog+0` in every window, so no mid-run compiles. Street and market were not in that run.
- Church: `shots/mat/v3/church_base.jpg` clean, `church_nomatcorner.jpg` for the patches, `churchfar_base.jpg` corners whole from 30 m.
