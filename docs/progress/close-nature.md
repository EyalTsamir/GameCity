# close-nature: nature when you stand in it

Stage 3 of the close-up round (`CLOSE-ROUND.md`), port 5218. All of it lives in the near-detail bubble or in a boot-time tile;
nothing here is drawn from the air. Master switch `?noclosenature`, one feature `?no<name>` (`src/core/closenature.ts`).

## Resume here

Stopped at the coordinator's limit, committed, not merged. Read "Left" below, then capture with:
`node C:/Projects/GameCity/scripts/closeset.mjs --url http://127.0.0.1:5218/ --out <abs path> --ids tree-park,tree-street,furn-planter,country-forest,ground-lawn,ground-garden,country-field --d 1,3 --hours 12`
Read `report.json` errors before the images.

## What exists

| Switch | Tier | What | Where |
|---|---|---|---|
| `closetrunks` | medium | Every trunk within 36 m (× lens) is one continuous skin, foot to fork, with flutes, lobes, burls, surface roots half in the ground; limbs and leaders have their own. Five barks: furrowed, smooth, pine, plane, birch. Two 512² tiles at boot. The tube of that plant is hidden per plant once the skin's cell is on show (still in the shadow pass) | `closenature/trunks.ts`, `barkTiles.ts` |
| `closelandtrunks` | medium | Country trees too: a lighter skin (12 sides) just outside the instanced trunk | `trunks.ts`, `landscape/trees.ts` `landTrunk` |
| `closeflowers` | medium | Poppy, cornflower, ox-eye, buttercup, cow parsley, knapweed, lawn daisy, dandelion, clover as real small plants, from the cover maps in town and the land cover outside. Painted flower dots and the blade field's own heads stop where these start | `closenature/flora.ts`, `groundcover/field.ts`, `terrain/ground.ts`, `landscape/shader.ts` |
| `closeleaves` | medium | Fallen leaves that curl, two shapes, in drifts by the litter map | `flora.ts` |
| `closeweeds` | medium | Rosettes and moss cushions in paving joints; the comb-like blades there shorter, thinner, half as many | `flora.ts`, `field.ts` |
| `closesward` | high | A fourth blade ring (2 m tiles, 1000 blades, out to 7 m): low blades only, only where the grass is thick | `field.ts` |
| `closesprigs` | medium | Twigs with folded leaves / needles at the card tips of foliage under 4.2 m; woods' shrubs and bracken planted for real, and their far strips lie down within 10 m | `closenature/sprigs.ts`, `landscape/woods.ts`, `rows.ts` |
| `closecards` | - | A leaf card fades only within ~0.3 m of the eye (it was 0.7-1.9 m, which left bare twigs at a metre) | `vegetation/foliage.ts` |
| `closeearth` | medium | Ground between blades: crumbs in two sizes, dead grass thatch, damp, as a multiply overlay on an exact copy of the ground triangles. Town: terrain mesh; beyond: land mesh within 1400 m | `closenature/earth.ts` |

| `closereed` | medium | Reeds on river banks, on the land's cover | `flora.ts` |
| `closepitsoil` | medium | Crumbs on the bare soil of tree pits and worn patches: both lie a little above the ground, so they have their own overlay copy (`soilTriangles` in `vegetation/plants.ts`). The pit's flat green blobs became tufts of real blades in the near cells, under `closeweeds` | `earth.ts`, `plants.ts` |
| `caustweb` | - | Near water: a web of light, only with a sun, instead of the far caustics' contour lines (a scribble from close by). A uniform, so the land bake's fingerprint doesn't change | `core/closenature.ts`, `landscape/shader.ts`, `terrain/ground.ts` |

Also fixed, everywhere: the collars on all wood tubes (`foliage.ts` rawT), plane camouflage frequency; gravel lane as stones instead of a checkerboard, nothing repeating at the noise tile's 1.9 m, a crown and edges broken by grit
(`landscape/roads.ts`, **changes no bake**, it is a separate material); painted meadow dots (`landscape/shader.ts`, **needs a land rebake**). Country limbs without the bole's furrows (chevrons), trunks that narrow into the fork. Fallen leaves in warped drifts (the noise's lattice laid them out in rows).
Planter soil was being read by `CM_SOLID` as timber: its colours now carry blue just over green and that branch draws crumbs (`closemat/glsl.ts`, `props/furniture.ts`, `props/kit.ts`). The wood-grain chips and plank-like "splashes" on the rim are gone. Petunia heads have round lobes, leaves of bed flowers are folded (`vegetation/plants.ts`).

## Lessons

- Read the report before the images: one crash blanks every shot.
- Bugs that looked like art: white leaves were `petal = 0` (keep the vertex colour); dark teal polygons were back faces with the normal flipped. `plantMaterial` now keeps the authored normal on both faces.
- Thresholds on mip-averaged data make staircases. Use it as a soft multiplier and let hard edges come from the tile's own cells.
- `git`: run nothing with a bare `cd` from Bash; it moves the session's directory.
- A switch in the land shader must be a uniform: a text switch changes the bake's fingerprint and silently loses the bake.
- A texture of noise at 0.53/m repeats every 1.9 m. On a lane that read as bands of green across it. Mix in a slower one.

## Costs (after a rebake, on AC, power guard; baseline vs `noclosenature`, ms per frame)

| View | On | Off | Triangles on / off |
|---|---|---|---|
| overview | 32.9 / 32.64 | 31.7 / 32.95 | |
| downtown | 29.1 / 31.11 | 29.71 / 30.9 | |
| street `5,1.5,-65,9,0,6` | 32.56 / 32.49 | 32.89 / 32.89 | |
| market `27.5,1,78.5,16,200,28` | 33.94 / 33.87 | 33.64 / 33.86 | |
| forest `-350,1.5,-150,6,40,4` | 30.18 / 30.51 | 39.16 / 40.33 | 1.80 M / 2.00 M (off is costlier, cause not looked into) |
| park `-165,1.4,142,6,-30,6` | 45.14 / 41.83 / 41.68 | 44.87 / 45.01 / 45.99 | 5.7-6.1 M / 5.1-5.6 M (off is no cheaper) |

All within noise and budget; those rows predate the third pass (pit tufts, lanes, roots), which adds near-only geometry and a little lane shader. **Perf pending for the third pass**: the market run at 931734a lost the charger and was discarded (the coordinator measures at the merge, after a rebake).

Final checks at a212800 (2026-11-01): typecheck and build pass, invariants `{}`, validate `[]`, `hitch` 0 mid-run compiles, `walkhitch` 0 new programs and 0 freezes, `?diorama`, `?quality=medium`, `?quality=low` without errors, `ui-test` 73 passed, `kinds` failed in the full run. It passed alone at 5da51d8, before the third pass; the rerun alone at a212800 hit my 5-minute limit on battery with the machine in use, so **`kinds` is unconfirmed on the last commits**: rerun it at the merge.

## Left

Worth doing, biggest first:
- Plane bark at 1 m: the plates' edges step, the tile is magnified (512² over about 1.5 m). Plates read as camouflage from a metre.
- `medium` and `low`: the shaded side of the nearest trunks and leaf cards is close to pure black, large at eye level in the park. Same with `noclosenature`, so not this stage's; it looks like the missing AO/ambient on those tiers. For whoever owns light.
- Blades at 3 m on thin meadow show dark beads along their length ("bamboo"): it is the half-resolution AO on sub-pixel blades, `?noao` clears it completely and the grass looks far better (`country-forest`, 3 m). Needs a depth-aware fix in `postfx/aoApply.ts` or a way to keep blades out of AO. This is the cheapest big win left for grass everywhere.
- Lane and woodland floor blades are sparse, single hairs on bare ground rather than tufts.
- A ring-like seam on some park trunks, about 2 m up, where the skin meets the leader (`tree-park`, 3 m).
- Water: the river bank's pink ragged polygon and a pale grey band at the edge (`water-riverbank`, 3 m). Thin ripples look like hairs.
- Woodland shrub stems: sharp elbows. Trailing plants on planters shatter at 1 m (`green.hang`).
- Night: hot spot on trunks near a lamp (`tree-park`, 3 m, 21.5). Lawn shade very dark at noon.
- Weed blades on mid-slab inside a weed spot (needs the slab layout in JS). Birch and pine not looked at closely; puddle edges not audited.
- Not nature, for other owners: barcode stripes on a slab edge at `-8.8,0.2,-58.6` (closemat/paving), bin bags are black low-poly, a thin bright sliver at the wall foot in `ground-garden`.
