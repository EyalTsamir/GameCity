# Close materials: every surface at one metre

Stage 2 of `CLOSE-ROUND.md`. Worktree `objective-proskuriakova-485af7`, port 5212. Owns close-range surface detail.

## Resume here
Round 1 nearly closed. System built (`src/world/closemat*`, `src/core/closemat.ts`) and committed. Families on: walls (brick, plaster, timber, stone, panel, sheet, smooth, incl. window reveals), asphalt, slabs, loose ground, decks, solids (trim = joinery, masonry + landmarks + harbour, street furniture, metal), sills (`winGeo.ts`), real litter replacing the painted one (`closemat/litter.ts`, `RD_LITTER` in the road shaders). Autofocus now also raycasts these surfaces (`services.closeMat.rayHit`, used in `ui/camera.ts`).

Harness notes for resuming:
- Perf: `bash <scratchpad>/perf.sh <outdir> [views] [hours]` = bake to `public/bake` of this worktree (`--out`, the main-checkout script would otherwise write to the main checkout!) then `abprof` hiding every `near-cm*` object in one page, behind power-guard. Equivalent by hand: `abprof --ab "cm=<traverse scene, near-cm* visible=false>|<restore>"`.
- Captures: `closeset.mjs --out shots/mN --ids ... --d 1,3 --hours 12 --tile 960 --cols 2 --rows 6`; 5–15 min in the queue with four sessions. Sheets are PNG8: their colours lie (red flakes that are not there), read the JPGs for colour.
- Don't use `python3` in Bash here (a Store stub that hangs). Patch with a node script file in the scratchpad or Edit.

Open items, in order:
1. Cost so far (AC, fresh bake, overlay hidden in the page): overview none, downtown none, street 0.45 ±0.52, market 0.84 ±0.49, 3 m from a brick wall 1.58 ±0.17. Budget +0.2 far, +0.7 street/market. By family at street the ground is nearly all of it (road ≈ 1.0, paving ≈ 0.7 before the cuts, walls and solids ≈ 0), so: `GROUND_R` 10, relief and crack fetches only in the first metres. Sorting draws by layer: nothing. Writing 1 instead of `discard`: nothing. Market still to pin down (repeat; family split in `scratchpad/perf3.sh`).
2. Focus fixed: the lot's box in front of a porch pulled the lens to 0.5 m; now the exact ray wins outside rooms (`explore.focusAt` remains the fallback).
3. Retuned after looking: timber, joinery paint, plaster and stone relief, rust colour (the light is HDR and AgX kind: rust needs albedo ≈ 0.05–0.1 and low saturation), base blow holes (`materials.ts`), iron rust and rust chips on furniture (`props/material.ts`). Round 2 captures: `shots/m5`.
4. `cmPaint` is in (`roads-markings`, offset −4 so it sits above the markings' −2): look at it, `ground-road`.
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
