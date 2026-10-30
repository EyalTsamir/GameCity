# Director: opening film + photo mode — progress log

Branch `claude/director-mode-bc531f`, cut from `claude/pensive-gates-bim12i` @ 078430f. Dev server for this worktree:
`npx vite --port 5190 --strictPort --host 127.0.0.1`. Harness runs from the main checkout (shared lock); the new scripts
(`film-sheet.mjs`, `film-hitch.mjs`, ui-test steps) are copied there only for the run, and removed afterwards.

## Resume here
* DONE, all committed on the branch; waiting for the coordinator to merge. Nothing is pending here.
* Verified: typecheck, build (3.97 MB single file), film from `file://` as a real visitor (`navigator.webdriver` false:
  plays on first load, not on the second; `?nofilm`, `?time`, `?nointro` skip it, `?film` forces it), ui-test 71/71 with
  `--q noidle`, phones with real touch at 390×844, 360×740, 844×390, film hitch on AC power (below).
* Not measured: the hitch on a quiet machine. living-scenes and geometry-hunt were on the GPU in every run.
* Storyboard: `director/storyboard.png` (real time, every 5 s, 1600×855 frames).

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

## Keys and params
* `P` / toolbar button: photo mode. `O`: Places (moved from `P`). In photo mode `U` hides the panel, `Esc` or `P` leaves.
* `?film` forces, `?nofilm` skips, `?filmfps=30|60` pins the cadence. localStorage `tinyhaven.filmSeen`.
* Photo: looks natural / golden film / noir / postcard / miniature; time, exposure (±2 EV), aperture (f/0.5–22), focus
  (1–800 m or auto, a click focuses there), freeze. Save downloads `tinyhaven-<hh-mm>.png`, rendered and read in one task
  (no `preserveDrawingBuffer`), at the top quality step.

## Shot list (95 s)
| film s | shot | hours | what |
|---|---|---|---|
| 0–14 | dawn-sea | 06:43–07:06 | in from the open sea, title card over the town |
| 14–26 | harbour | 07:06–07:39 | same take: down the ship's flank, out to all of her under the cranes |
| 26–35 | archway | 09:18–09:48 | eye level, through the gatehouse arch into the old-town square |
| 35–45 | market | 11:42–12:24 | noon, craning down between the stalls |
| 45–58 | platform | 14:36–15:24 | the regional arrives on cue, focus pull from the line to the cars |
| 58–70 | quay | 18:18–18:48 | low over the river into the sun, under the footbridge |
| 70–78 | churchyard | 19:12–19:54 | blue hour, candles and lanterns on |
| 78–95 | night-rise | 19:54–21:12 | same take: crane out of the walls over the roofs to the night overview, end card |

## Handback
Any input ends the film from the current pose: the free camera's first frame is the same pose (step 0.0 m in the trace),
and the motion carries on, capped at 40 m/s. The guided camera (`G`, stored) has a 10° minimum pitch and pivot bounds the
film's low poses break: `handback.pitch` / `handback.margin` in `camera.ts` let those limits close in at 0.1 rad/s and
70 m/s instead of pulling the camera up. Found only by the full ui-test, because its `freecam` step leaves `guidedCam`
stored: the film step alone runs the free camera, the full run the guided one. Both are covered that way.

## Numbers (film-hitch, 1920×1025, vsync)
Living-scenes and geometry-hunt on the GPU in the last column; living-scenes in the first two (power state not recorded).
| | before crop/cadence | after | final (AC, 2026-10-30) |
|---|---|---|---|
| new programs during the film | 2 | 0 | 0 |
| frames > 100 ms | 2 | 0 | 0 |
| frames > 50 ms | 635 | 46 | 28 |
| worst frame | 166.7 ms | 66.6 ms | 66.5 ms |

Final run per shot (drawn-frame interval, cap 30 fps = 33.3 ms, quality step at the end of the shot):
dawn-sea 35.7 detail-low, harbour 35.7 detail-low, archway 33.7 detail-low, market 37.9 dof-lite, platform 37.6 scale-0.72,
quay 33.4 scale-0.72, churchyard 33.4 scale-0.72, night-rise 38.8 scale-0.72. Steps fall at the fades only. The
scale-0.72 is what the machine gave under this load: re-measure on a quiet machine to see what a visitor gets.

Observation, not chased: `alloc` reads 105 MB/s in dawn-sea and 50 MB/s in night-rise against ~20 MB/s elsewhere (film
code allocates nothing per frame, per the earlier allocation profile; 1 frame > 50 ms in dawn-sea).
