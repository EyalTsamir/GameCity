# Close materials: every surface at one metre

Stage 2 of `CLOSE-ROUND.md`. Worktree `objective-proskuriakova-485af7`, port 5212. Owns close-range surface detail.

## Resume here
Finished: three rounds and the final checks are done (2026-11-01). Not merged: that is the coordinator's. What is left is under "Left for later".

System: `src/world/closemat*`, `src/core/closemat.ts`. Families: walls (brick, plaster, timber, stone, panel, sheet, smooth, incl. window reveals), asphalt, road paint, slabs, loose ground, decks, sand, solids (trim = joinery, masonry + landmarks + harbour + rail bed, street furniture, metal), sills (`winGeo.ts`), real litter replacing the painted one (`closemat/litter.ts`, `RD_LITTER` in the road shaders). Autofocus raycasts these surfaces (`services.closeMat.rayHit`, `ui/camera.ts`).

## Final numbers (AC, fresh bake, overlay hidden in one page, after the disk scan)
| view | cost | budget |
|---|---|---|
| overview | 0.02 ±0.08 ms | +0.2 |
| downtown | 0.13 ±0.16 ms | +0.2 |
| street | 0.45 ±0.08 ms | +0.7 |
| market | 0.57 ±0.3 ms | +0.7 |
| 3 m from a brick wall (no budget set) | 1.18 ±0.33 ms | |
| 3 m over a road (no budget set) | 0.95 ±0.61 ms | |

Measured earlier: the ground is nearly all of the cost at street, hence `GROUND_R` 10 and one fetch in the outer band. Sorting draws by layer: nothing. Writing 1 instead of `discard`: nothing. That table does not include the saving from removing the painted litter (`rdLitter`), which was not measured.

Triangles drawn by the overlay: 0 at overview, 7,392 in 46 meshes at street, 39,035 in 32 at market (dense landmark detail), about 0.1 ms at 2.5 ns each. Vertex data of the meshes on show: 5.4 MB at street, 22.9 MB at market; built but hidden cells come on top, not measured. Boot: tiles 831 ms (paid by `winGeo`, first caller), grids 288 ms when last read, before sand and rail bed were added. Slowest cell seen 1.3 ms (`cmSlab`), budget 2 ms.

Checks: typecheck, build (`dist/index.html` 4.5 MB) clean; invariants {} and validate [] at overview, 4x, 20 s; `hitch.mjs` prog+0, freeze 0; `walkhitch` freeze 0, 33 hitches with the overlay against 48 without (noise, not a gain); `ui-test` 73 passed, `kinds` failed in the full run and passed alone (the known flake); `?diorama`, `?quality=medium`, `?quality=low` looked fine (low has no overlay).

Harness notes:
- Perf: bake with `--out <worktree>/public/bake` (the main-checkout script otherwise writes to the main checkout), then `abprof` hiding every `near-cm*` object in one page, behind power-guard.
- `shot.mjs` resolves a relative `--out` against the main checkout: pass an absolute path. `closeset.mjs` has no `--help`: it runs the whole set. Contact sheets are PNG8 and their colours lie: read the JPGs for colour.
- Don't use `python3` in Bash here (a Store stub that hangs).

## Rounds
- Round 1: the system, walls, ground, solids, litter. Round 2: focus (the lot's box pulled the lens to 0.5 m in front of every porch), then a look at every wall family: timber, joinery, plaster, stone, rust, blow holes, cost split by family. Round 3: audit of doors, ground, furniture at 1 and 3 m: sand layer from the ground mask, rail bed, dust on dark paint, runs under sills.
- Left for later: the ballast is a flat painted Voronoi at 1 m (real stones in the bubble would be the fix, close-vehicles or a later wave); black grit cloud on the boardwalk by the kiosk at `furn-busstop` (not this layer); a vertical hairline through window glass and a dotted horizon line in reflections (close-windows); roofs have no overlay (`w >= 63.5` skipped), never seen on foot.

## Edits in other people's files
`src/ui/camera.ts` (focus: exact ray), `src/main.ts` (module after `scenes`), `src/world/roads/{glsl,materials}.ts` (`RD_LITTER`: painted litter off when real litter is on), `src/world/buildings/winGeo.ts` (sills: `cmsills`), `src/world/buildings/materials.ts` (sill streak wander, rivulets, rarer blow holes; the fac bake needs a rebake), `src/world/props/material.ts` (iron rust small and dark). Service: `ctx.services.closeMat.rayHit`.

## The idea
A near-only copy of the wall, road, paving and trim triangles, cut to the cells of the bubble, is drawn **after** everything opaque with a small program whose output **multiplies** what the city's shader drew (`DST_COLOR, ZERO` on the scene's float target; ratios above 1 work). So:
- Lighting, shadows, night, lamp light, weathering and fog stay the work of the city's shaders. The overlay only knows albedo ratios and what a tilted normal does to the light.
- The bakes and far versions are untouched: `materials.ts` and the road shaders are not edited, no rebake, and a city-wide program does not grow by a byte (program size is what costs on this GPU).
- It costs only pixels near the camera. From the air: nothing built, nothing drawn.
- It knows the base exactly (same `q`, same hashes, same brick layout, same slab layout), so it lines up with the joints the base drew and can even change a colour (a target colour divided by the base colour): mortar is no longer brick-coloured.
- **No pop:** everything fades to exactly 1 by pixel footprint at `CM_LIM = radius / 1099` m, and a cell comes on at `radius × lens` metres, where the footprint is already that. So nothing is left to pop at a cell's edge, with or without the lens.

Parts:
- `src/world/closemat/textures.ts`: four tiles made at boot (grain, crack, fibre, stones), each 512² RGBA8 with mips. A fetch is cheap here and procedural code is not (baking.md), so the look lives in the tiles and each brick or slab reads its own window of them.
- `src/world/closemat/source.ts`: `TriGrid`, triangles of merged geometries indexed by a world grid at boot (reads the source arrays, keeps no copy), cut exactly to a cell when the bubble asks. Neighbouring cells share cut edges bit for bit, so no pixel is multiplied twice.
- `src/world/closemat/glsl.ts`: one small fragment program per family, chosen by geometry.
- `src/world/closemat.ts`: module, layers.

## Switches
`?noclosemat` all. `?nocmwalls ?nocmroad ?nocmpaving ?nocmsolid` a family. `?nocmBrick ?nocmPlaster ?nocmTimber ?nocmStone ?nocmPanel ?nocmSheet ?nocmSmooth ?nocmRoad ?nocmSlab ?nocmLoose ?nocmDeck ?nocmPaint ?nocmSand ?nocmTrim ?nocmMasonry ?nocmStreet ?nocmMetal` a layer. `?cmr=<k>` scales the radii. `?nearr` and `?neardebug` of the bubble work too. Tier: medium and up (the bubble's default); low has none.
