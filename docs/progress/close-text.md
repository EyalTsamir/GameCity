# Close text: writing you can read (close-up round, stage 2)

Branch `claude/eloquent-proskuriakova-a6cf97`, port 5215. Rules: `CLOSE-ROUND.md`.

## Resume here
Round 2. All families written and committed; noon views judged by eye (`--area text` in `scripts/closeset-views.json`). Not done yet: night views, number plates on cars, the newest labels (bin, cabinet, sign plate, A-board, market cards) by eye, bake + perf on `?nolettering`, final checks.

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
Shop names by trade with a strap line (far sign has the same title), a shop per side of a tower, opening hours and OPEN/CLOSED by the clock, window words, menus, chalk boards, bells and tenant boards, house numbers that count along the street, house names, works plates, flyposters on blank walls, notices with tear-off phone strips, column bills, bus flags and timetables from the plan's real lines, newspapers and placards at kiosks, shelter ad panels lit at night, street posts at junctions, plates under road signs, cabinet stickers, bin labels, lamp post numbers, market price cards by what is in the crate, bench plaques, mailbox collection plates, car plates in a finer format.

## Edits in others' files
`buildings/{anchors,gen,oldtown,towers}.ts`, `buildings.ts` (spots, address init, shop title on the info card), `props/{streetkit,furniture,kit}.ts` (`markProp`), `landmarks/civic.ts` (price cards), `sim/traffic/{models,vehicleMaterial,signals}.ts` (plate region, shared street names), `ui/camera.ts` (one line: focus on what you read).

## Found on the way
The autofocus focused behind anything small (the close-foundation limit): a mailbox plate at 1 m was out of focus with the ground sharp. Written faces now answer the ray, so reading something brings it into focus.
