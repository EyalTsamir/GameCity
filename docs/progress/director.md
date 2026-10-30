# Director: opening film + photo mode — progress log

Branch `claude/director-mode-bc531f`, cut from `claude/pensive-gates-bim12i` @ 078430f. Dev server for this worktree:
`npx vite --port 5190 --strictPort --host 127.0.0.1`. Harness runs from the main checkout (shared lock); the new scripts
(`film-sheet.mjs`, `film-hitch.mjs`, ui-test steps) are copied there only for the run, and removed afterwards.

## Resume here
* Film + photo mode implemented and committed; `film` / `photo` ui-test steps pass; film hitch: 0 new programs, 0 freezes.
* Done since: storyboard read at full resolution and weak shots retuned (harbour end, night crane, title, end card);
  phones checked with real touch at 390×844, 360×740, 844×390 (flow passes, toolbar fits).
* Left: full ui-test, `npm run build` + film from `file://`, final hitch and `docs/progress/director/storyboard.png`,
  then delete the temporary `film-sheet.mjs` / `film-hitch.mjs` from the MAIN checkout and restore its `ui-test.mjs`
  (`git -C C:/Projects/GameCity status --short` must be clean).
* The laptop was on battery (2026-10-30) during the last runs: GPU timings are throttled, so numbers measured then are
  marked as battery numbers and prove nothing about cost.

## Design
* `src/ui/camera/film.ts` (`FilmDirector`), `filmShots.ts` (data only). The camera module runs it in `frame()` like the
  walk mode; `FilmRig.place` sets the camera directly, `release` hands an orbit pose that reproduces it.
* Who gets the film: `filmWanted()` — `?film` forces it; `navigator.webdriver` (every harness script), `?nofilm`,
  `?nointro`, any start-state param (`time, speed, only, skip, planview, tour, seed, hide, camdebug, view`), `?diorama`,
  reduced motion and the `tinyhaven.filmSeen` flag skip it. Those visitors get the old 5 s glide (unless `?nointro`).
* Clock: `WorldClock.glideHours` (new) — no `timejump`, so the crowd keeps walking and lights ease.
* Train: `RailSim.bookArrival(seconds, dir)` clears the line behind the curtain and schedules a regional.
* Weather held clear during the film (ui re-applies the visitor's choice on the `film` event).
* Handback: any key / press / wheel / touch, on window in capture (registered before the UI's listeners). Movement keys
  and P pass through; other keys are swallowed. The press that ends the film follows nothing.

## Smoothness measures (added after the first hitch run: 40–60 ms means, 635 frames > 50 ms, one 166 ms freeze)
* The letterbox bars are not rendered: `ctx.cropView(rows)` sizes the canvas to the band between them (−22 % pixels at
  1920×1025). Lens is converted so that handing back only reveals more picture.
* Even cadence: where the curtain frames measure > 20 ms, `ctx.frameCap = 30` (33 / 50 alternation reads as stutter).
  `?filmfps=30|60` forces it.
* Start quality: `adaptive.startAt` picks a ladder step from the GPU time measured behind the curtain.
* During shots quality is held (`adaptive.hold`); it can step down once per fade, while the picture is black.
* Real bug found: sun-shaft mask / blur programs never compiled in the warm-up (strength 0 skips them), stalling the
  first low sun for anyone. Fixed in `postfx.ts`.

## Numbers (film-hitch, 1920×1025, vsync, living-scenes session on the GPU at the same time)
| | before crop/cadence | after |
|---|---|---|
| new programs during the film | 2 | 0 |
| frames > 100 ms | 2 | 0 |
| frames > 50 ms | 635 | 46 |
| worst frame | 166.7 ms | 66.6 ms |
