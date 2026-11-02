# close-windows: real depth behind every window near the camera

Stage 3 of the close-up round (`CLOSE-ROUND.md`). One system, no hero rooms and nothing to walk into: within 34 m of the eye every
window of the city shows a generated room, drawn as a small additive quad over its glass.

## Resume here

Second round finished 2026-11-02, on branch `claude/quizzical-greider-ce4b00`, not merged. See "Second round" and "Left" at the bottom. Run
`npm run bake` before any perf number (this work changes the facade shell, so the bake must be redone).

## Status and cost

**Second round, OVER BUDGET at street level, cause not found.** Same page, on minus off, baked, on AC, behind the power guard, 2026-11-02, after
the merge of bfd0206 and after commit 9ceac08 (ms, ± between cycles):

| view | noon | 21.5 | budget |
|---|---|---|---|
| overview | 0.14 ±0.28 | | 0.2 |
| downtown | -0.08 ±0.13 | | 0.2 |
| street `5,1.5,-65,9,0,6` | **2.08 ±0.81** | **1.77 ±0.21** | 0.7 |
| market `27.5,1,78.5,16,200,28` | 0.76 ±0.53 | 0.91 ±0.70 | 0.7 |
| shop from 4 m `6.5,1.7,-100.9,4,-110,2` | 1.42 ±0.48 | 5.42 ±0.51 | |

The first round's table below was measured before the merge, so this jump can come from my second-round work (the walker, the near glint, more
different wall pages per room) or from how the rooms sit with what the merge brought. No run separates them: the walker needs a reload to switch off
(`?nocwwalk`), and reloads give ±1-2 ms. Next step: make `CW_WALK` a uniform for one A/B in a page, or compare frozen builds of df10458 and 9ceac08.
Other checks of the second round: typecheck and build pass, bake redone, `shot --view overview` invariants `{}` validate `[]`, 0 GL warnings in five
start states, `hitch` prog+0 in every window, one freeze flag in `overview@21.5 arrive` (116 ms max, the arrival). Not rerun: `walkhitch`, `ui-test`,
`?diorama`.

First round, 2026-11-01:

Final checks 2026-11-01: typecheck and build pass, `shot --view overview` invariants `{}` validate `[]`, `?diorama` and `?quality=medium|low`
clean, `hitch` prog+0 in every window, walk of 85 m no new programs, no freeze, slowest bubble build 1.7 ms. `ui-test --q noidle` 73 passed;
only `kinds` failed, the known flake, and it passed when rerun alone. The checks and the table below predate two last small edits, seen only
in captures: lamps kept inside the room (`LP` clamp), a lighter pallet rack colour. Neither touches the facade shell or the bake.

Same page, rooms on against off, behind the power guard, baked, on AC (ms, on minus off, ± between cycles):

| view | noon | 21.5 | budget |
|---|---|---|---|
| overview | 0.11 ±0.14 | | 0.2 |
| downtown | 0.00 ±0.12 | | 0.2 |
| street `5,1.5,-65,9,0,6` | 0.35 ±0.51 | 0.03 ±0.71 | 0.7 |
| market `27.5,1,78.5,16,200,28` | 0.23 ±0.22 | 0.50 ±0.81 | 0.7 |
| shop from 4 m `6.5,1.7,-100.9,4,-110,2` | 0.38 ±0.74 | -0.16 ±1.03 | |

This switch cannot show what the larger shell program costs, it stays compiled with the rooms off. Compare frozen builds at the merge if that
matters. The rooms replace the shell's own interior near the camera, which is why the difference is small. Triangles: 2 per window in the
bubble (a few thousand). Memory: two 4096×2048 RGBA8 atlases with mips, about 86 MB on high, a quarter of that on medium, none on low.
Best to see: `shop-downtown` at 3 m, 21.5 (a bookshop, deep shelves, books in the window); `wall-oldtown` 3 m, 21.5, compared with
`?noclosewin`; a sun-facing wall at 18.2 for the sun patch.

## How it works

- `src/world/buildingrooms.ts` (module, right after closemat). Reads the window records `buildings/mesh.ts` writes (`buildings-winrec`,
  24 floats per window), groups windows side by side on one floor of one wall into rooms, gives each room a kind, depth, paint, floor,
  lamp, four wall pages, two furniture cards and two window cards. Bins windows into 16 m cells of the near-detail bubble.
- The kind of a room follows the building's style and profile, and for a shop the words on its own window (`letterSpots`): a window that
  says flowers is a florist.
- `buildingrooms/atlas.ts`: two 4096×2048 RGBA8 atlases drawn at boot, in 3D, from `buildingrooms/pages.ts` + `goods.ts` + `kit.ts`. Wall
  pages (a bay of shelving 1.2 × 3.6 m) keep height in alpha. Cards (a row of furniture) keep coverage in alpha. A post step adds occlusion
  and the shadow from a light above. Half size on medium, off on low.
- `buildingrooms/glsl.ts`: a ray through the pane into the room's box. Walls with relief (6 steps through the height in alpha, then a
  gradient fetch), analytic floors and ceilings, cards standing on two planes, the lamp, curtains and blinds at the glass. The lit state,
  light colour and curtains use the facade's hashes on the same cell, so a window seen from afar and from here is the same window.
- Facade hand-over (`buildings/materials.ts`): `cwK` fades the shell's own interior out over the same distance, frames, reveal and
  reflection stay. `BH_BAKE` has `cwK = 0`.

## Switches

`?noclosewin` everything (also the near glint, which goes back to the far streak). Sub-switches: `?nocwsun` (sun patches), `?nocwwalk` (the
person behind the counter). `?cwr=<m>` the radius. `?cwatlas` puts the atlas on
`window.__cwAtlas` for dumps.

## Other people's files touched

`buildings/materials.ts` (uCloseWin, cwK, exports `GLASS_COLS`, `COMMON_FRAG`, faint night reflection near), `buildings/mesh.ts`
(`recordWindows` records every window, partial ones too), `buildings/winGeo.ts` (`WIN_REC` 24, partial windows get no sill),
`buildings.ts` (records always collected, `buildings-winrec`), `water/reflection.ts` (rooms off during the pass), `water/glassMirror.ts`
(4 taps against stair steps in the mirror), `main.ts` (module list). Second round: `render/postfx/contact.ts` (close-light's: `tCShadow` holds a
real depth map every frame), `buildings/materials.ts` again (near glint, `oppA`). New shared helper: `core/shadowBlank.ts`.

## Lessons

- A hash of a varying is not stable, even if the varying is constant over the quad: take the integer back with `floor(x + 0.5)`.
- A point exactly on a room's wall is on a grid boundary give or take rounding. Anything that floors it (the lamp's cell) needs a point
  inside the room, or the wall comes out speckled in worm shapes. Looks like z-fighting, is not.
- Three's clear premultiplies: white with alpha 0 is black. The wall pages draw an explicit white rect at z = 0.
- `Kit.bar` winds backwards: the page material is DoubleSide. Before that no chair, table or hanger had legs.
- Shadow from a light above, sampled quadratically, turns a shelf board into stripes. Steps must be finer than the board.
- The hairline through every window, reported by close-materials, was in the facade's reveal: at kd = 0 exactly the ray left through the
  wrong side. Fixed in `materials.ts`, and it fixes the dotted line at eye level too (kd.y).

- A `sampler2DShadow` must never hold null. Three's stand-in is a DepthTexture that was never uploaded, so an empty colour texture is bound and the
  draw is rejected ("Mismatch between texture format and sampler type"). It only shows when the sun has no map yet, so it hits a page opened at night.
  These are console type `warning`: `closeset` (errors only) never sees them. Filter `shot.mjs`'s `consoleWarnings` on `/GL_|WebGL-|INVALID|Mismatch/`.
- One atlas page tiled along a whole wall reads as a grid, however good the page. A room's pages are dealt from its kind's list, not drawn.
- `?bdbg=refl` returns before the glint. A pane that looks flat with a fine reflection under `?bdbg=refl` is the glint.

## Added, in the order it was built

Rooms by ray with relief walls; about 56 wall pages and 46 furniture and window cards covering 28 room kinds; shop kind from the sign; lamp
models per room kind (pendant, spots, panels, strips); near-lamp calm so a lit room shows its walls instead of a glow; floor shadows under
furniture from a card's own silhouette; corner lamps in about half the homes with dark corners; sun patches through the pane with glazing bars
and the sun's shadow map (high tier, `?nocwsun`); polished floors mirroring the fittings; net curtains you can see through; fainter street in
night glass near the camera; shop doors lit like the shop.

## Second round (2026-11-01/02)

1. GL warning. Reproduced with `?time=21.5&nointro`: 261 warnings, the mismatch line repeating on `glDrawArrays`. The fullscreen contact pass
   (`postfx/contact.ts`) was the main offender: its `tCShadow` stayed null all night on a page opened at night. The rooms had the same hole
   (`tCwShadow`, first frames). Both now hold `blankShadowMap()` (`core/shadowBlank.ts`) until the sun has a map. It reads as lit. 0 GL warnings in
   five start states (21.5, 12, 6 medium, 21.5 low, default). The published build showed it only once because it depends on the hour at load.
2. Restaurant back wall at `person-street` 21.5. It was one page (`cafeWall`, dado and two small frames) tiled along the wall in mud-brown paint under
   orange light, with a picture rail that stopped short of the bay and read as dashes. Now: wall pages dealt, not drawn, for every room; three new cafe
   pages (`cafeMirror`, `cafeShelf`, `cafeBench`); a whole rail; lighter cafe paints.
3. Factory window at `wall-factory` 18.2. Not the rooms and not the reflection (`?bdbg=refl` showed a good street there, so my first note was wrong):
   the facade's sun streak, `smoothstep(0.972, 0.9985, hAl)`, 27 degrees wide so that it reads on a far facade, covers a whole pane from 3 m. Within
   the rooms' radius a pane now shows only the sun itself (a `dot(R, sun)^32` lobe), and not where the mirrored street stands in front of it (`oppA`).
   The far streak is unchanged.
4. Door lamp cream wash at `wall-oldtown`: not mine. close-hand's A/B with `?nodoorlamps` is nearly identical, so it is not the door lamp either: it is
   the street lamp about 3 m from that wall (`lamps`), and it sets the whole night look. Left unchanged. I did not repeat that A/B. Rooms draw only on glass.
5. Someone moving behind a counter. In open shops (75 %, wider than 2.4 m), one person walks across on a plane behind the mid-room cards, pauses, walks
   back, on a 15-26 s round of sim time, so it stops with the clock. Six side-on cards in the atlas (three people, two frames of a stride; `walk*` in
   `pages.ts`, `G.walker`), the frame picked by the ground covered, feet together when standing, and a soft contact shadow on the floor. Lit as the
   mid-room card is. One extra atlas fetch only where the ray meets the figure, a few floats on other shop pixels. `?nocwwalk`, medium and up. Seen
   moving across two panes of the restaurant over 8 s at 8 m, 21.5. Not seen on a real walk or at 1 m.

## Cost hunt (2026-11-02, limit 03:30): cause narrowed, cost NOT cut

Same page, baked, on AC, merged build with TAA. Tools: page code swapping the rooms material's `defines` (three keeps compiled programs, so a
compile-time switch can be A/B'd in one page), and `uCloseWin` set by hand.

On minus off now, no-discard in (ms):

| view | noon | 21.5 | budget |
|---|---|---|---|
| overview | -0.09 ±0.24 | -0.16 ±0.14 | 0.2 |
| downtown | -0.26 ±0.21 | 0.06 ±0.14 | 0.2 |
| street | **1.84 ±0.51** | **1.55 ±0.66** | 0.7 |
| market | 0.12 ±0.56 | 0.69 ±0.11 | 0.7 |
| shop from 4 m | 1.42 ±0.17 | 6.01 ±0.02 | |

What was found:
- Shop at night: rooms hidden saves only 0.5-0.6 ms; `uCloseWin` = 0 saves 5-7 ms. So most of it is the facade at `cwK` = 1, not the rooms. `uCloseWin` = 0.01 (cwK 0 everywhere, the near-glint block still runs) saves the same, so it is not the near glint. 1000 (cwK 1 everywhere) adds nothing, so it comes from near panes. At noon the value makes no difference.
- This is the wrong way round on paper: `cwK` = 1 skips `bhShop`/`bhRoom`, and a pane should get cheaper.
- **The lead:** one run (ab3, `?bdbg=x`, `bool cwOff = cwK >= 0.999 && uBhDebug > -0.5`, the same with `uBhDebug` on `interior *= 1 - cwK` and the night dimming) had the shop at night at base 35-38 ms against 42-45 in every other run, with the 5-7 ms gap gone, and running the interior cost +1.1 to +1.6 as it should. Without those edits (ab4) the gap came back, so it is not the no-discard. The fix is probably in how the facade program compiles (FXC, the perf-deep gates: `FG_DBG_OFF` folds `uBhDebug`). `?bdbg` and the `cwOff` expression were not separated. Next: one 3-minute abprof with only the `cwOff` expression, then only `?bdbg`.
- Street: rooms hidden saves 1.2-1.9 ms, returning black at the top of the fragment shader only 0.2-0.5, so about half or more looks like vertices, draws and varyings (noisy; not proved). `r17` (radius 17 m) saved 1.1-1.9 ms there. Next: drop windows from the vertex work early, or shrink the radius for upper floors.
- Ruled out at street level, each within noise: walker, sun patches, relief, cards. At the shop by noon: cards -1.5 ±1.0, no-discard -1.13 ±0.29, relief -0.87 ±0.72, sun -0.81 ±1.1.
- The number of wall pages was not A/B'd: dealing changes which atlas cell a pixel reads, not how many.

Kept: rooms return black instead of `discard` (additive, so by construction the same picture; not compared in a capture).

## Left

- Lobby floor in `buildings/lobby.ts`: the checks read oversized from 1 m (`door-office`). Not part of this work.
- Lit fins of some curtain walls bloom hard from close by (style 2, profile 5). Facade's own, unchanged.
- The mirror shows far buildings as coarse blocks at 1 m (far atlas in the reflection pass).
- Nothing moves in homes and offices except TV light. The person behind the counter could cross a lit living room the same way (`CW_WALK`, drop the `shopWin` test).
- The bookshop at `shop-downtown`: paint `0x8a7a68` under orange light still reads brown above the shelves, the same thing as the cafe paints. Paints of other kinds were not revisited.
- Hand-over 24–34 m checked on stills only, and it showed no pop. Worth one look on a real walk.
- Doors and shops at 18.2 were last seen before the lamp clamp, at 3 m only.
