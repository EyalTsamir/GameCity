# close-nature: nature when you stand in it

Stage 3 of the close-up round (`CLOSE-ROUND.md`), port 5218. All of it lives in the near-detail bubble or in a boot-time tile;
nothing here is drawn from the air. Master switch `?noclosenature`, one feature `?no<name>` (`src/core/closenature.ts`).

## Resume here

Read "Left" below, then capture with:
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

Also fixed, everywhere: the collars on all wood tubes (`foliage.ts` rawT), plane camouflage frequency; gravel lane as stones instead of a checkerboard
(`landscape/roads.ts`, **changes no bake**, it is a separate material); painted meadow dots (`landscape/shader.ts`, **needs a land rebake**).
Planter soil was being read by `CM_SOLID` as timber: its colours now carry blue just over green and that branch draws crumbs (`closemat/glsl.ts`, `props/furniture.ts`, `props/kit.ts`). The wood-grain chips and plank-like "splashes" on the rim are gone. Petunia heads have round lobes, leaves of bed flowers are folded (`vegetation/plants.ts`).

## Lessons

- Read the report before the images: one crash blanks every shot.
- Bugs that looked like art: white leaves were `petal = 0` (keep the vertex colour); dark teal polygons were back faces with the normal flipped. `plantMaterial` now keeps the authored normal on both faces.
- Thresholds on mip-averaged data make staircases. Use it as a soft multiplier and let hard edges come from the tile's own cells.
- `git`: run nothing with a bare `cd` from Bash; it moves the session's directory.

## Left

(See the latest audit.)
