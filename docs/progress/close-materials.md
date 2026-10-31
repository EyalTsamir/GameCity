# Close materials: every surface at one metre

Stage 2 of `CLOSE-ROUND.md`. Worktree `objective-proskuriakova-485af7`, port 5212. Owns close-range surface detail.

## Resume here
Round 1 nearly closed. System built (`src/world/closemat*`, `src/core/closemat.ts`) and committed. Families on: walls (brick, plaster, timber, stone, panel, sheet, smooth, incl. window reveals), asphalt, slabs, loose ground, decks, solids (trim = joinery, masonry + landmarks + harbour, street furniture, metal), sills (`winGeo.ts`), real litter replacing the painted one (`closemat/litter.ts`, `RD_LITTER` in the road shaders). Autofocus now also raycasts these surfaces (`services.closeMat.rayHit`, used in `ui/camera.ts`).

Harness notes for resuming:
- Perf: `bash <scratchpad>/perf.sh <outdir> [views] [hours]` = bake to `public/bake` of this worktree (`--out`, the main-checkout script would otherwise write to the main checkout!) then `abprof` hiding every `near-cm*` object in one page, behind power-guard. Equivalent by hand: `abprof --ab "cm=<traverse scene, near-cm* visible=false>|<restore>"`.
- Captures: `closeset.mjs --out shots/mN --ids ... --d 1,3 --hours 12 --tile 960 --cols 2 --rows 6`; 5–15 min in the queue with four sessions. Sheets are PNG8: their colours lie (red flakes that are not there), read the JPGs for colour.
- Don't use `python3` in Bash here (a Store stub that hangs). Patch with a node script file in the scratchpad or Edit.

Open items, in order:
1. Read `shots/perf1/ab.txt` (first A/B: overview, downtown, street, market, wall 3 m, road 3 m). Budget +0.2 far, +0.7 street/market.
2. Re-check at 1 m after the focus fix: wall-suburb, wall-house, wall-factory, door-house, ground-kerb were all blurred (stale pick, then porch). White joinery should no longer look like pumice (`CM_JOINERY`). Lamp post orange patches at `furn-lamp`: compare `?noclosemat`, may be the base's `pWear`.
3. Sample walls of each pattern not yet seen: timber after fibre retune, stone, panel, corrugated (findwalls output in the background task; `wall-warehouse` is brick).
4. Add `cmPaint`: road markings (`roads-markings`, position + normal) multiplied with aggregate relief and worn specks; polygon offset stronger than the markings' −2.
5. Night (21.5) and dusk (18.2) pass; `walkhitch`, `hitch`; boot cost (stats of module `closemat`: `tilesMs`, `bootMs`, triangles per layer; the slowest cell in `__city.near.stats()`, keep under 2 ms).
6. Final checks of CLOSE-ROUND.md; end with CLOSE-DONE.

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
`?noclosemat` all. `?nocmwalls ?nocmroad ?nocmpaving ?nocmsolid` a family. `?nocmBrick ?nocmPlaster ?nocmTimber ?nocmStone ?nocmPanel ?nocmSheet ?nocmSmooth ?nocmRoad ?nocmSlab ?nocmLoose ?nocmDeck ?nocmTrim ?nocmMasonry ?nocmStreet ?nocmMetal` a layer. `?cmr=<k>` scales the radii. `?nearr` and `?neardebug` of the bubble work too. Tier: medium and up (the bubble's default); low has none.
