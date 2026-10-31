# Close materials: every surface at one metre

Stage 2 of `CLOSE-ROUND.md`. Worktree `objective-proskuriakova-485af7`, port 5212. Owns close-range surface detail.

## Resume here
Round 1 in progress. System built (`src/world/closemat*`, `src/core/closemat.ts`), first families on. See "What is left".

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
