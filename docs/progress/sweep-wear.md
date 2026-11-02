# Sweep fix C: cracks and stains (`decals-cracks-stains-pasted`)

Stage 4 of the close-up round, rules in `SWEEP.md`. Branch `claude/laughing-antonelli-3a55b3`, port 5233. Switches in `src/core/sweepwear.ts`: `?nosweepwear` all, `?nowearcrack ?nowearpave ?nowearquay ?nowearwall ?nowearrock ?nowearrust ?nowearhand ?noweartag` one.

## What was wrong, by cause

| what the judges saw | cause | fix |
|---|---|---|
| black squiggles on plaster at 3 m | the crack's edge widened with the pixel at full darkness, so a 2 mm crack drew as a black line 6 mm wide at 3 m. Isolated by a zone mask, so it started and stopped dead, in a warped Voronoi, so it wormed | `wearcrack`, below |
| black squiggles on harbour rock | contour lines of a noise, terraced: rings and worms, each riser so steep its normal faced away from the sun | `wearrock` |
| dotted lines on rock | the derivatives work on 2 × 2 blocks: a riser under a few pixels, or a pixel footprint measured from the same noise, comes out as a stipple | `wearrock`: footprint from the position, risers fade with it, no jump at the wrap |
| black and pale stripes on some cliff facets | a facet edge on to the run of the cliff, or lying flat, has one texture coordinate standing still, so the rock smeared; the bedding sawtooth's jump drew lines across it | `wearrock`: such a facet takes its own direction, the sawtooth climbs down |
| cow-spot patches on the quay | quads cut from the solid mesh with a hard discard, a flat colour of their own, hiding the concrete and the close-up layer. Their small height differences also z-fought | `wearquay` |
| brown ovals with an outline on paving | an ellipse with a 4 % edge and a ring | `wearpave` |
| ruled crack across a slab | a straight 8 mm line in the paving shader, and a different squiggle drawn over it close up | `wearpave` + `wearcrack` |
| ruled strips hanging from a coping, stacked flat bands and coloured rectangles at the waterline (not listed by the judges, found on the cutting wall and the lower quay) | opaque quads 1.5 cm proud of the wall | `wearwall` |
| rust as near-black blotches, the same drip on every panel | rust albedo 0.05–0.1 with a hard threshold, every lap and every screw weeping | `wearrust` |
| orange patches like paint on guard rails (found at `cs-furn-bin_3m`) | the props material's chip colour, rust albedo 0.2–0.28 in full sun | `wearrust` |
| flat olive planks in the gutter, a metre long (found at `cs-furn-bin_3m`) | `gutterDrift`: "a drift of grit" as an opaque box on the road. Took four probes: it lives in `props-near-detail`, whose visibility the bubble resets, so hiding it didn't show | `wearpave`: no box, the road's silt a bit stronger, the near grit already lies there |
| black flecks on concrete platform steps | the steps and bricks share `rail-furniture` with the railings, so they got the rusting-steel branch. The mineral test said `sat < 0.12`, but the colours there are linear, and a warm grey reads 0.2 | `wearrust` |
| dark strip under an AC unit | an opaque dark box standing in for a stain, and the unit's small parts 50 cm below it (only one of its two kits was moved) | `wearhand` |
| black arc on an AC unit | its fan was a disc lying flat, poking out through the front | `wearhand` |
| one clean stroke on a cabinet, a dark rectangle behind it | a tag drawn as a single line of even width on a painted rectangle of the door's colour, which never matched the door | `weartag`: letters, cut out |

## The shared crack (`cmFissure`, `closemat/glsl.ts`)

The crack tile's R and G now hold grown cracks instead of a warped Voronoi and a cell id: zig-zags grown both ways from the widest point, forking, tapering to nothing (`growCracks`, `closemat/textures.ts`). R is the distance to the nearest crack, G that crack's half width there. The shader multiplies G by the strain on the surface, so a crack opens out of nothing wherever the strain ends, and no mask cuts it. It covers only its share of a pixel, so it is a faint thread at distance. Up close it is a groove: one fetch toward the light gives the shaded wall and the lit lip.

Strain is where it belongs: off opening corners, wall corners and worked patches on plaster; per block on stone; per panel on concrete; on road paint, the asphalt's own crack comes through. No new sampler: only the near pixels by a crack pay one extra fetch.

Slabs break once, joint to joint. The paving shader and the close-up layer compute the same line (same hash, same zig-zag): the far shader gives the line, the close one its broken edge, lit lip and forks that die out. The offset is a function of one coordinate along the crack, so it can't close into a ring (a noise offset did, on the first try).

Other shaders read only B and A of this tile. Sand and close earth read the old cell id: moved to B and A.

## Stains as a ratio

Three layers, one idea: a stain has no colour of its own, it multiplies what is already drawn, so joints, grain and the close-up surface come through, and its edge dies into the pores.

- `harbor/decals.ts` (`wearquay`): oil, rust, fish-water and wet patches on the harbour's concrete, fingers along the fall to the sea, a mirror for the sky on the wet ones at a low angle. One draw.
- `terrain/stains.ts` (`wearwall`): drips from a coping, rust below a bollard, damp below a weep hole: run down, break into lanes, narrow, die out. The wet at the foot of the river wall and of the cutting wall is one ramp by height above the water or the soil, wandering and running down in fingers, in place of a stack of flat strips with torn edges and weed rectangles. One draw.
- `handheight.ts` (`wearhand`): the hand-height stains are broken by the surface, no polygon edge; what drips off an AC unit goes through `ctx.services.wallStains`.

## Left alone, on purpose

- **The square-on colour fault** belongs to sweep-fix-a. Walls here were judged 8° off.
- **Paving bands** (`area-platform-concrete`, `area-plaza-paving`): the dark strips are a laid material, the band grid in the paving table, not a decal. Their edges are hard and they read flat, but that is `ground-surfaces-flat`, on hold for walkable cells.
- **The open manhole** on the quay lane: a flat dark disc. Props, not a stain.
- The judges' other lines filed under this family: pigeons, tactile stripes, gazebo floor boards. Other causes.
- **Church wall, pale jagged patches** (`lm-church-spire_3m`, low left): **not fixed, not traced.** They stay in the same place at noon and 18.2, so it is not a shadow, and the church's weathering is smooth noise, so it is not that either. The stipple looks like two nearly coplanar faces fighting near the wall's edge. Next step: `landmarks/church.ts`, the wall against the buttress or moulding there.
- **Black band on the amusement pier's piles** (`harbor-carousel_1m`): an algae zone in its own geometry, cut straight at a height, `#4e5541`. A hard edge, but a separate cylinder in the pier builder; judged not worth a shader here.
- **The land under the rock in `place-cutting-wall_1m`**: blocky dark patches on the slope behind the wall. Land albedo up close, not a stain.

## Measured

`abprof.mjs`, one page, alternating windows, on AC, after a rebake (`fac*` up to date), noon, 1920×1025, high. The switch: `CM_FISSURE`, `CM_WEARRUST`, `TH_WEARROCK` removed from the materials at run time, the two stain meshes hidden.

| view | off | on | delta | budget |
|---|---|---|---|---|
| overview | 34.39 | 34.19 | −0.24 ± 0.21 | +0.2 |
| downtown | 32.46 | 32.48 | +0.05 ± 0.36 | +0.2 |
| street | 38.27 | 38.52 | +0.23 ± 0.91 (10 cycles; first run −0.65 ± 1.03) | +0.7 |
| market | 38.3 | 38.37 | +0.01 ± 0.26 (10 cycles; first run +2.94 ± 7.2, thrown out as noise) | +0.7 |
| lower quay, 6 m | 41.21 | 41.29 | +0.25 ± 1.47 | |
| plaster, 4 m | 36.03 | 36.1 | −0.02 ± 0.42 | |

What this does not cover: the paving's `RD_WEARPAVE` is text in the shader, so not switchable at run time; `perf.mjs` at street, reloads, gives 37.17 with and 37.40 without, inside its ±1–2 ms noise. The crack tile's contents and the window-corner crack in the facade shader aren't in the switch either: they cost a texture build at boot and a few instructions. `?nosweepwear` is no measure of cost: it changes the facade shader, so it loses the facade bake (`CLOSE-ROUND.md`). It is for looking at before and after. New triangles: none worth counting. Two more draw calls, one per stain mesh, each touching few pixels. The gutter fix removes some near boxes.

## Final checks

`tsc` clean, `npm run build` fine. `invariants` `{}`, `validate` `[]`, no frame errors, no failed modules at high with speed 4, medium, low and `?diorama`. `ui-test.mjs --q noidle`: 74 passed, 0 failed. `hitch.mjs` overview, street, harbour at noon: `prog+0` in every window. The headless console's only warnings, HLSL compiler notes and a `toNonIndexed` line, are there with the switch off as well.

Run before the last small change (gutter drift, props rust); that one was typechecked and looked at, not put through all of these again.

## Where to look

Frames in `shots/wear/final/` (gitignored), `ab/*_before.jpg` and `*_after.jpg`, `night/`, `dusk/`, `r7/`. Best: `bld-house-residential-gable-plain_3m` (window-corner crack, no squiggles), `harbor-fishquay-netheap_3m` (rock), `quayface` and `cutfoot` (wet ramp), `cs-rail-platform_3m` (steps without rust), `area-quay-concrete_10m` (stains).

## Left, for whoever comes next

- The church wall's patches, above.
- Dark vertical breaks on the cliffs at `cs-rail-track_10m`: geometry.
- The smudge and black strokes on the "TREE WALK" board at `cs-text-quay`: there before this round, not traced.
- Thin dark stipple remains on grazing rock at `netheap_3m`, far less than before.
