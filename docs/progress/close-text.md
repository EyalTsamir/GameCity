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
| overview (6 cycles) | +0.07 ±0.16 | −0.70 ±0.53 |
| overview (8 cycles, repeat) | | −0.02 ±0.10 |
| downtown (6 cycles) | +0.02 ±0.09 | −0.30 ±0.20 |
| downtown (8 cycles, repeat) | | −0.13 ±0.31 |
| street `5,1.5,-65,9,0,6` | −0.15 ±0.30 | +0.07 ±0.31 |
| market `27.5,1,78.5,16,200,28` | −0.17 ±0.42 | −0.24 ±0.43 |

All from 2026-11-01 01:56–02:46, after the disk scan ended; the earlier runs overlapped it and are dropped. Budget 0.2 at overview and downtown, 0.7 at street and market: inside at every view.
Overview and downtown at night read high twice (6 cycles) although `near.stats()` shows 0 letter cells and 0 triangles there. A placebo in the same page (same traversal, nothing changed) read +0.05 ±0.16 and +0.04 ±0.21, the repeat at 8 cycles above came down to nothing, and page reloads agree: overview 33.04 / 33.41 with, 33.41 / 33.44 with `?nolettering`; downtown 32.08 / 32.14 with, 32.24 / 32.31 without (night, 1920×1025). So those two reads were short runs, not text. Page reloads at overview, noon, 1300×930: 25.84 / 25.72 with, 25.85 / 25.77 without.
`perf.mjs` rows swing between about 3.2 M and 3.7 M triangles (225–271 draws), with and without text alike at noon and downtown at night. At overview at night the swing happened to line up with the variant (271 with, 234 without, both repeats), frame time no higher. Letter cells are 0 there, so that is not this module; what flips it was not looked into.
- Triangles: about 6 200 in the street view (a letter is 2). Draw calls: one per visible cell, 13 + 11 + 6 = 30 in the street view, one program.
- `hitch.mjs`: 0 new programs in every window. Maxima 83 ms (street arrive, noon) and 67 ms (market arrive, noon), elsewhere 50 ms; not compared against a run without text. The 350 and 267 ms spikes of the run during the scan did not come back.
- `walkhitch.mjs` 85 m: max 50.8 ms with, 50.2 ms without; mean 37.79 and 37.99; 0 new programs; 16 new geometries (one per built cell); slowest cell build 2.4 ms, worst build in one frame 1.3 ms (0.6 without).
- Boot: 278 ms for the atlas and the items (measured once, on the first version, with fewer items). GPU: one 2048² R8 atlas with mips, about 5.6 MB.
- Quality: `medium` keeps it, `low` has none (far atlas names stay).

## Final checks
typecheck, build (4.5 MB). `ui-test --q noidle`: 73 passed, `kinds` failed; passes alone (known flake). Overview at speed 4, and `?diorama`: invariants `{}`, validate `[]`, diorama looked at. `?quality=medium|low` and `?nolettering`: no errors, invariants `{}`.

## Left
Not worth it yet or not reached: office and lobby door numbers in sharp type, ghost signs on party walls, school noticeboard and platform poster board in the sharp font, classic benches' plaques, shelter route map, chalk edge roughness, boat names. Window words in full noon sun are pale at 1 m (the glass reflection competes). Autofocus reads the written faces of street things, doors and windows only: wall plates and blue plaques rely on the wall itself.
