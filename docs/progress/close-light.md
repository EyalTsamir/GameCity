# Close light: light and shadow at walking distance

Stage 2 of `CLOSE-ROUND.md`. Branch `claude/ecstatic-zhukovsky-3294fe`. Switches: `src/core/closelight.ts` (`?noclosel` all, `?no<name>` one).

**Port 5223, not 5213.** 5213 is held by an orphan `vite preview` from the detail-streets worktree that serves an old build. It answers with status 200, so captures pointed at it silently show old code. It was left running because it isn't this session's process.

## Resume here
Dev server: `npx vite --port 5223 --strictPort --host 127.0.0.1`. Harness from the main checkout with `--url http://127.0.0.1:5223/`. `shot.mjs --out` needs an absolute path (it resolves against the main checkout); `closeset.mjs --out` is fine relative.
Don't edit source while a capture is queued: a page can load half an edit (one such frame came out in wild colours). Apply multi-file changes as one script, between captures.
A module that throws at creation is skipped silently in a perf run: a missing import once took the whole water module out, and the numbers still looked fine. Check `failedModules` and that `g_refl` is present.

## Features
| What | Switch | Tier | Seen at |
|---|---|---|---|
| Shadow filter: Castaño tent, 4 hardware taps, no noise | `?noshadowclean` | all | `ground-kerb` 1 m noon: the dotted halftone is gone |
| Contact shadows: screen-space ray to the sun (checked against the sun map) or to the lamp-map's virtual lamp | `?nocontact` | high | `furn-bin`, `furn-bench` 3 m |
| Lamp light on street furniture that had none (signal poles, railings, rail furniture, prints, signs) | `?nosignallit` | all | street `5,1.5,-65,9,0,6` 21.5 |
| Bounce from the lit ground in `thLampLight` | `?nolampbounce` | all | poles and bins at night |
| Shop and lobby glass mirrors the real street: the water's planar pass moves to the plane of the fronts in view | `?noglassmirror` | high | `shop-market`, `shop-downtown`, `person-street` 3 m at all three hours |
| A mirrored pane shows the sun as a glare, only where nothing stands in front of it (was a painted streak: the "peach column") | with the mirror | high | `shop-downtown` 3 m 18.2 |
| Wet road: streak pass only from highlights; the mirror draws full-detail facades (the low tier lit the night road cream) | `?nowetstreaks` | high | street 21.5 with `wet=1&weather=rain` |
| Lanterns beside doors and under loading canopies light the wall, the step and the ground (lamp map) | `?nodoorlamps` | all | `wall-house`, `door-house`, `wall-suburb`, `wall-factory` 3 m 21.5 |
| No planar pass at all down in the streets with no water ahead, glass or wet road (a saving) | `?nowaterskip` | all | market and oldtown: `g_refl` 0.6 → 0 |
| Lamps along the long edges of car parks, which were pitch black | `?noparklamps` | all | `ground-parking`, `veh-parked` 10 m 21.5 |

## How the mirror works
`water/reflection.ts` owns one pass with three plane modes: water, wet street, glass. `water/glassMirror.ts`: `createGlassPicker` groups the fronts of shop, tower and office lots into planes and scores them by how much of each the eye faces, with hysteresis so it doesn't flap. The lookup reads where the view ray crosses the plane: a door or pane set back from the plane would otherwise look outside the picture (that was the pale band at the bottom of panes, the door is 0.5 m back).
Glass costs less than the water pass it replaces: a quarter resolution, every fourth frame (a turn past 3° redraws sooner), without harbour, far land or river walls (`NOT_GLASS`).

## Cost
`perf.mjs` 1920×1025, fresh bake, behind `power-guard`, against `?noclosel`, ms/frame and GPU total by timer queries. Final code, median of 3 alternating page loads:

| View | noon ms/frame | noon GPU | 21.5 ms/frame | 21.5 GPU | Budget |
|---|---|---|---|---|---|
| overview | +0.31 | −0.10 | −0.37 | −0.35 | +0.2 |
| downtown | +0.35 | +0.51 | +0.28 | +0.08 | +0.2 |
| street `5,1.5,-65,9,0,6` | +0.93 | +1.30 | +0.60 | +1.01 | +0.7 |
| market `27.5,1,78.5,16,200,28` | −0.85 | −0.15 | −0.25 | −0.78 | +0.7 |

**The street row is not settled.** The same code at the same view with the view alone in the page, 6 repeats of 3 s, gives +0.13 ms/frame and +0.22 GPU; 4 repeats gave +0.17 and +0.64. What differs is `g_scene`: 22.6 ms alone in the page against 25 ms after other views in the same page, and only in the second state does it differ between variants, by up to +0.6. By pass, which repeats across all runs: post (contact) about +0.3, mirror pass +0.13 to +0.35. No switch accounts for the scene difference: `?noshadowclean`, `?nolampbounce` and `?nosignallit` measured nothing distinguishable from zero. So read the street as +0.1 to +0.9 ms/frame, possibly over the +0.7 budget on the top of that range. Far views: the passes that this round touches are flat (post +0.03 to +0.13, mirror pass 0), and what is left is within scene noise, but the downtown noon row is over +0.2 as measured.

Triangles in the main pass: 8 to 20 car-park lamps, not distinguishable in the counts (the count moves by hundreds of thousands between loads with the bubble and traffic). Glass mirror pass about 500 k at street level against 450 k for the water pass it replaces.

## Tried and dropped
- A full-image vertical blur for wet streaks: spread lit shop fronts over the whole road. Now only highlights above 1.6 go into the streak pass.
- Glass at a third resolution, every other frame, with landmarks and all trees: +2.25 ms at street.
- Car-park lamps at the ends of the rows of stalls: arms pointed out of the lot (a lamp's arm reaches against its yaw) and the middle of a long lot stayed dark.
- Contact shadows at 8 steps out to 26 m: 6 steps out to 20 m look the same at 1, 3 and 10 m.

## Found on the way
- `streetMirror.tSRefl` and `tGM` were only bound in `setLevel`, which runs only when the adaptive ladder moves. With `adaptive=0`, which every harness capture uses, the wet road read a blank texel, so earlier wet-road captures never showed the mirror. Bound in the constructor now.
- The debug filter on the pass (`_debugReflectFilter`) restored visibility in the wrong order and left roads hidden in the main view.

## Left
- `?quality=low` towers read pale at night: the low tier's averaged windows, the same cream that lit the wet road. It is there with `?noclosel` too, so it isn't from this round. Worth its own look, since low is what adaptive never reaches but weak machines start on.
- Open-water and low-tier reflections still use the low facade tier. In the harbour at night it may show the same cream; not checked.
- The wet road at noon without rain shows flat blue puddles. Judged only at 21.5 with rain.
- `ground-quay` under the floodlights is brighter than at noon and flat. Not touched: a lower intensity would also dim the harbour from the overview.
- The first shower in a running session was not measured separately. The streak pass is compiled at boot and `hitch.mjs` shows 0 new programs in dry views.
- Reflections are soft at 1 m (quarter resolution). A higher resolution is the first thing to give back if budget turns up.

## Files outside what this session owns (small additive edits)
`src/world/buildings/materials.ts` (mirror lookup, shop program only), `src/world/buildings/lobby.ts`, `src/world/buildings/anchors.ts`, `gen.ts`, `homes.ts`, `houses.ts`, `industry.ts` (door-lamp anchors), `src/world/water.ts`, `src/world/water/reflection.ts`, `src/world/water/streetMirror.ts`, `src/world/roads/puddles.ts`, `src/core/lampLight.ts`, `src/world/lamps.ts`, `src/world/props/layout.ts` (car-park lamps).
