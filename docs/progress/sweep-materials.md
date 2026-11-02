# Sweep: wrong and stretched materials, then what was left open (`textures-smeared-stretched`, `sign-lettering-clipped`)

Branch `claude/laughing-antonelli-3a55b3`, port 5233. Switches in `src/core/sweepmat.ts`: `?nosweepmat` all, `?nomatclass ?nomatframe ?nomatriser ?nomatportal ?nomatsiding ?nomatboard ?nomattop ?nomathedge ?nomatcloth ?nomatsticker ?nomatsign` one.

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

## Not bugs

- `feat-cargoship_3m`, `feat-breakwater_1m` ("hull like melted marble", "shards"): the view's target is below sea level, so the camera is under the water. Nobody can stand there.
- `land-country-cars_10m` ("en Bakery"), `letter-prop-adpanel_1m`, `cs-text-ad_1m`: cut by the frame of the picture.
- Lobby signs behind mullions (`HAVEN TOWER`, `BEACON HOUSE`, `LUMEN & CO`): real mullions in front of a real wall, parallax. Left.
