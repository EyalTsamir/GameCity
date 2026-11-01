# close-windows: real depth behind every window near the camera

Stage 3 of the close-up round (`CLOSE-ROUND.md`). One system, no hero rooms and nothing to walk into: within 34 m of the eye every
window of the city shows a generated room, drawn as a small additive quad over its glass.

## Resume here

Branch `claude/quizzical-greider-ce4b00`, dev server port 5217. See "Left" at the bottom. Run `npm run bake` before any perf number
(this work changes the facade shell, so the bake must be redone).

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

`?noclosewin` everything. `?cwsun` sub-switch: `?nocwsun` (sun patches). `?cwr=<m>` the radius. `?cwatlas` puts the atlas on
`window.__cwAtlas` for dumps.

## Other people's files touched

`buildings/materials.ts` (uCloseWin, cwK, exports `GLASS_COLS`, `COMMON_FRAG`, faint night reflection near), `buildings/mesh.ts`
(`recordWindows` records every window, partial ones too), `buildings/winGeo.ts` (`WIN_REC` 24, partial windows get no sill),
`buildings.ts` (records always collected, `buildings-winrec`), `water/reflection.ts` (rooms off during the pass), `water/glassMirror.ts`
(4 taps against stair steps in the mirror), `main.ts` (module list).

## Lessons

- A hash of a varying is not stable, even if the varying is constant over the quad: take the integer back with `floor(x + 0.5)`.
- A point exactly on a room's wall is on a grid boundary give or take rounding. Anything that floors it (the lamp's cell) needs a point
  inside the room, or the wall comes out speckled in worm shapes. Looks like z-fighting, is not.
- Three's clear premultiplies: white with alpha 0 is black. The wall pages draw an explicit white rect at z = 0.
- `Kit.bar` winds backwards: the page material is DoubleSide. Before that no chair, table or hanger had legs.
- Shadow from a light above, sampled quadratically, turns a shelf board into stripes. Steps must be finer than the board.
