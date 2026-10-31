# Close text: writing you can read (close-up round, stage 2)

Branch `claude/eloquent-proskuriakova-a6cf97`, port 5215. Rules: `CLOSE-ROUND.md`.

## Resume here
Round 1 in progress: engine and first families written, not yet judged by eye. Next: look at `shots/t1`, fix, measure.

## The system
- `src/core/closetext.ts`: master switch `?nolettering`, one `?no<family>` per family.
- `src/world/lettering/font.ts`: one 2048² distance-field atlas (10 faces, 40 pictograms), made at boot from the system's fonts. A letter is two triangles, sharp at any distance and through any lens, no canvas or upload at run time.
- `src/world/lettering/sink.ts`: writes letters and flat parts into one mesh per bubble cell, in order (paper, then ink).
- `src/world/lettering/wording.ts`: the words. Deterministic per lot.
- `src/world/lettering/shopname.ts`: street numbering and the shop's name for the far sign.
- `src/world/lettering/spots.ts` and `LetterSpot` in `buildings/anchors.ts`: where text can go (doors, fascias, windows, plain walls, kit faces).
- `src/world/lettering/paint.ts`: layout of each printed thing.
- `src/world/lettering.ts`: the module, three bubble rings (`letterBig` 60 m, `letterMid` 34 m, `letterFine` 14 m; lens scales them).
