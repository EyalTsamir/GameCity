# Close text: writing you can read (close-up round, stage 2)

Branch `claude/eloquent-proskuriakova-a6cf97`, port 5215. Rules: `CLOSE-ROUND.md`.

## Resume here
Done: all families written, committed and judged by eye at noon and at night (`--area text`, `--area walk` in `scripts/closeset-views.json`), measured, final checks passed. If more is wanted, see "Left" at the end.

## The system
- `src/core/closetext.ts`: master switch `?nolettering`, one `?no<family>` per family: `shopsigns`, `shopwindows`, `doorwords`, `chalkboards`, `flyposters`, `streetnotices`, `busstops`, `newspapers`, `streetlabels`, `streetnames`; rings `?noletterBig`, `?noletterMid`, `?noletterFine`. Off at `?quality=low`.
- `src/world/lettering/font.ts`: one 2048² distance-field atlas (10 faces, 40 pictograms), made at boot from the system's fonts. A letter is two triangles, sharp at any distance and through any lens, no canvas or upload at run time.
- `src/world/lettering/sink.ts`: writes letters and flat parts into one mesh per bubble cell, in order (paper, then ink).
- `src/world/lettering/wording.ts`: the words. Deterministic per lot.
- `src/world/lettering/shopname.ts`: street numbering and the shop's name for the far sign.
- `src/world/lettering/spots.ts` and `LetterSpot` in `buildings/anchors.ts`: where text can go (doors, fascias, windows, plain walls, kit faces).
- `src/world/lettering/paint.ts`: layout of each printed thing.
- `src/world/lettering.ts`: the module, three bubble rings (`letterBig` 60 m, `letterMid` 34 m, `letterFine` 14 m; lens scales them). Also `focusOn`: the autofocus ray against written faces in reach.

## What reads now
Shop names by trade with a strap line (far sign has the same title), a shop per side of a tower, opening hours and OPEN/CLOSED by the clock, window words, menus, chalk boards, bells and tenant boards, house numbers that count along the street, house names, works plates, flyposters on blank walls, notices with tear-off phone strips, column bills, bus flags and timetables from the plan's real lines, newspapers and placards at kiosks, shelter ad panels lit at night, street posts at junctions, plates under road signs, cabinet stickers, bin labels, lamp post numbers, market price cards by what is in the crate, bench plaques, mailbox collection plates, car plates in a finer format (`HV13 BAR`), names on awnings, enamel street plates on corner walls, round blue plaques, estate agents' boards in gardens, council boards by benches at the water and on park paths.

## Edits in others' files
`buildings/{anchors,gen,oldtown,towers}.ts`, `buildings.ts` (spots, address init, shop title on the info card), `props/{streetkit,furniture,kit}.ts` (`markProp`), `landmarks/civic.ts` (price cards), `sim/traffic/{models,vehicleMaterial,signals}.ts` (plate region, shared street names), `ui/camera.ts` (one line: focus on what you read).

## Found on the way
The autofocus focused behind anything small (the close-foundation limit): a mailbox plate at 1 m was out of focus with the ground sharp. Written faces now answer the ray, so reading something brings it into focus.

## Cost (1920×1025, high, AC behind power-guard, bake current)
Text on/off in one page (`abprof`, layers hidden; delta = hidden minus shown, so a real cost shows as negative):

| view | noon | night |
|---|---|---|
| overview | no cell drawn above 9 m | no cell drawn |
| downtown | no cell drawn | no cell drawn |
| street `5,1.5,-65,9,0,6` | +0.07 ±0.26, +0.18 ±0.62 | −0.01 ±0.32, −0.07 ±0.66 |
| market `27.5,1,78.5,16,200,28` | +0.17 ±0.35, +0.21 ±0.33, +0.30 ±0.83 | −0.11 ±0.50, −0.37 ±0.57, −0.42 ±0.42 |

Inside the noise everywhere, at worst about 0.4 ms at the market at night; budget 0.7. One night street run read −2.6 ±3.31: no information.
Overview and downtown at night read −0.45 and −0.55 while `near.stats()` shows 0 letter cells shown and 0 triangles: nothing of this module is drawn there, so that difference is not text. Not explained. Page-reload `perf.mjs` at overview, noon: 25.32 / 26.11 with, 25.80 / 25.94 with `?nolettering`, the same triangles once settled (3.2 M). The first row, 3.64 M, was the page before the first view had settled.
- Triangles: about 6 200 in the street view (a letter is 2). 3 extra draw calls per visible ring cell group: 13 + 11 + 6 cells in the street view, 30 draws, one program.
- `hitch.mjs`: 0 new programs in every window. Maxima of 350 ms (overview steady, noon) and 267 ms (street arrive, noon) occurred once, with other sessions on the machine; the same windows at night stayed at 51 ms. Not shown to be this module.
- `walkhitch.mjs` 85 m: max 51.0 ms with, 50.2 ms without; 0 new programs; 16 new geometries (one per built cell); slowest cell build 1.3 ms.
- Boot: 278 ms for the atlas and the items (measured once, on the first version, with fewer items). GPU: one 2048² R8 atlas with mips, about 5.6 MB.
- Quality: `medium` keeps it, `low` has none (far atlas names stay).

## Final checks
typecheck, build (4.5 MB). `ui-test --q noidle`: 73 passed, `kinds` failed; passes alone (known flake). Overview at speed 4 with `?diorama`: invariants `{}`, validate `[]`. `?quality=medium|low` and `?nolettering`: no errors, invariants `{}`.

## Left
Not worth it yet or not reached: office and lobby door numbers in sharp type, ghost signs on party walls, school noticeboard and platform poster board in the sharp font, classic benches' plaques, shelter route map, chalk edge roughness, boat names. Window words in full noon sun are pale at 1 m (the glass reflection competes). Autofocus reads the written faces of street things, doors and windows only: wall plates and blue plaques rely on the wall itself.
