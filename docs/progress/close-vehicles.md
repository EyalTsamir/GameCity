# Close vehicles (close-up round, stage 3)

Any vehicle has to hold up at 1 and 3 m: seats, dashboard and wheel through the glass, a driver who is one of the city's people, lamps with real
lenses, tyres and arches, door lines, dirt and small dents. By system, fine detail only near the camera. Trains: `close-vehicles-trains.md`.

## Second round (2026-11-02, on bfd0206)
Done: wheel arches and rims round at a metre, on the close level only (`fine` in `loftCar`/`loftBus`: 15 stations per arch instead of 9, more segments on liner, lip, rim, cap); tyre lettering upright and not mirrored on both sides (looked at on a suv, both sides); unlit indicators read amber.

**The train door: "+3 to +5 ms" was a sign error, as far as can be shown here.** abprof prints with - base, and with `apply = closeOn=false`, `with` is the close level OFF. Measured with the camera held on an open door at 1.25 m, clock stopped, on AC behind the guard, 4 cycles:
| | 12 h | 21.5 h |
|---|---|---|
| close level off, against on | +4.15 +-1.88 | +3.67 +-0.09 |
So the close level is about 4 ms CHEAPER than the far level here (the far level ray-traces its interior and writes gl_FragDepth). The subagent's command was not logged, so its reversal is inferred, not seen.
What the close level does cost at that door, each set hidden in one page (with - base): glass -2.06 +-0.11 / -2.26 +-0.39, inner -1.58 +-0.72 / -2.47 +-0.43, body -0.45 +-0.64 / -2.82 +-0.8, pane depth +1.94 +-0.39 / -0.11 +-0.52 (no cost). The depth figure at noon has the wrong sign for a cost, a sign of how noisy this was. Nothing was cut: there is no overrun, and cutting would lose detail.
3 m at a door, off against on: +1.42 +-4.43 / +4.02 +-0.23: cheaper at night, noon unresolved.
1 m at a window: -8.21 +-5.06 / -0.22 +-7.69: **unresolved**, the machine was loaded. If the reversal is real this is the view that may cost something (the subagent's -0.9 flips to +0.9).
**Decision for the coordinator:** the train close level is still on `high` only. That was set because of the wrong figure; put `closeVeh(ctx, 'vehtrain')` back in `trainRender.ts` to give medium the trains' close-up, after measuring the window on a quiet machine. `medium` with it has not been looked at since that change.
Freight looked at, 12 h (loco nose, cab, bogie, wagon, wagon bogie): holds up. Wagon tail lamps still unseen: the `wagonTail` frame lands in the forest. Night sheet not looked at.
**Perf pending** for arches and rims (more triangles on the close level only, not counted), and for the merged state.

## Resume here
Branch `claude/cool-davinci-ad96c9`. Trains merged. Don't merge to main, push or deploy: the coordinator merges. Final check results: see "Final checks" below.

### Trains merged as a squash, on purpose
The trains branch had picked up two commits from `origin/main` by the user (e3056c0, 9caef6a: GitHub Actions workflows that deploy to Pages on every push to main). A plain merge would have brought them in; deleting them after would have removed the user's files on a later merge. So: squash of `54f6230` (9b0c8ee), 12 files, neither adds nor removes them. Local `main` does not have them and `origin/main` does: whoever pushes `main` should know that a push deploys.

### The four things the trains' report flagged
1. **Person lit on a level crossing: real, fixed.** The term was a fixed strip across the city at the track's z. Shown: laying the strip on a real walker, clock stopped, one page: before the fix he brightens (trousers dark to pale grey), after it the two pictures match. The term now also needs `P_rootY > 0.3` (hips raised: riding). `tailFloor` could not be used: riders have it at 0. Passengers still look lit at night in the train set, by eye; there is no A/B of the term on them.
2. **Console warning: fixed.** The merge added 3 x X4000 `f_trLivery` on high and in diorama. `trLivery` had early returns; with one exit all copies are gone, the far level's too (overview 15 warnings to 11, 12 before the merge). Livery and the unit number still draw (looked at, 12 h).
3. **+3 to +5 ms at 1 m into an open door: see "Second round": it looks like a sign error.** What was written at the time: Not profiled, and a smaller reach does not help at 1 m. Conservative step: the train close level is now on `high` only (`closeVeh(ctx, 'vehtrain', 'high')`), so medium never pays it; high still does. The figure is the subagent's, measured before this merge. `?novehtrain` turns the level off.
4. **hitch on trains: run**, views station, overview, street at 12 and 21.5: 0 new programs in all 13 windows (200 programs), no freeze in any window, no errors, invariants {}. It ran on AC behind the guard, before the livery fix. Walking past a train was not tested; walkhitch was not run.

Left, not fixed: more would cost every vehicle at level 0); two-wheelers have no close level; lorry bulkhead reads mottled through the screen; the cream bezel on the compact stays visible at night, lit like the paint.
Other sessions: hard dark rectangles in the blue reflection of ground-floor windows at `veh-parked` 21.5, with and without `?noparklamps` (for close-light). The 110-160 ms freeze on a camera cut, see Numbers.
Road vehicles draw glass as the trains did before their depth fix, so they may carry the same AO mottle on panes (the subagent's guess, not checked).


Seen on trains: a dark blurry smudge on the far door, through the open doorway at noon (door1, 12 h), not at night. Not looked into.
Not seen by this session: freight close up, wagon tail lamps.

## Final checks (merged branch)
typecheck 0, build 0. ui-test 73 passed, 1 failed: `kinds`, which passed when rerun alone (known flake). diorama, medium, low at downtown: no errors, invariants {}, validate [], pictures looked at and fine.
Overview at speed 4, three runs: (1) before the livery fix: invariants not {}: two ordinary pedestrians overlapping 3.1 s at a crosswalk (-103.9, -4.8), parent and beachgoer. crowd.ts and animate.ts have not changed in this round. Did not repeat in the later runs, so a rare event in the crowd, not shown to be unrelated. (2) invariants {} but not valid: the machine's network changed during load (ERR_NETWORK_CHANGED), module harbor did not load. (3) on the head commit: 0 errors, no failed modules, invariants {}, validate [], 11 warnings, none for f_trLivery.
**Perf pending for the merged state:** the user needed the machine and timing runs had to stop. The road-vehicle numbers below are from 2e595b7, before the merge. The trains' numbers are the subagent's. The coordinator measures at the merge.

## What
- A **close level**: one more InstancedMesh per kind (`traffic-<kind>-close-lod0`) and its panes (`traffic-<kind>-glass-lod0`), same instance buffers, within `CLOSE_DIST` 18 x lens k (about 12 m in the usual lens), at most 12 per kind. Two-wheelers have none (level 0 only).
- Own programs by define, so the city-wide programs did not grow: `VEH_NEAR`, `VEH_CLOSE`, `VEH_GLASSPASS`, `VEH_BUSHOLES` (bus only: `discard` disables early-z).
- Real glass (transparent, blend ONE/SRC_ALPHA, alpha = what the cabin keeps), wiper fans in the film, frit, tint band, tax disc, heater lines.
- Built cabins (`cabin.ts`): seats, dash with dials and radio, wheel, door cards, belts, belongings; cab and bus versions. Drivers come from the existing occupants.
- Lamps ray-traced in object space (`closeGlsl.ts` class 8): chrome bowl, projector ball, running-light bar; prisms and bulbs by parallax on tails.
- Wear: chips, scratches, dried runs, dust, orange peel, tread. Body kit: repeater, lock, gutter, fuel flap, washer jets, rear wiper. Wheels: valve, caliper, rim lip, strut, arch liner, floor pan, exhaust.
- `traffic-ground`: a soft dark and wheel lines under vehicles (multiply quads, at most 90).
- Flares at true lamp positions (`LAMP_AT`), faded inside 6-18 m so no haze ball up close. Lamps that are off stay dark at night.

## Switches
`?noclosevehicles` (all), `?novehclose ?novehcabin ?novehlens ?novehwear ?novehwheel ?novehflare ?novehground`, `?novehtrain`. Min tier medium (`src/core/closeVehicles.ts`). In the page: `__city.ctx.services.traffic.closeLevel(bool)`, `closeStats()`.

## Numbers
abprof at 2e595b7, after a rebake, on AC behind the guard. Close level on minus off, in ms (`with` in abprof's output is the level OFF, so cost = base - with):

| view | budget | 12 h (4 cycles) | 21.5 h (4 cycles) | 21.5 h (8 cycles) |
|---|---|---|---|---|
| overview | +0.2 | -0.05 +-0.11 | +0.59 +-0.75 | -0.01 +-0.20 |
| downtown | +0.2 | -0.06 +-0.11 | -0.04 +-0.29 | |
| street | +0.7 | -0.29 +-0.41 | +0.53 +-0.44 | -0.41 +-1.02 |
| market | +0.7 | -0.05 +-0.21 | +0.77 +-0.70 | +0.53 +-0.83 |
| parked | none | +0.51 +-0.47 | -0.33 +-0.23 | |

No cost detected at noon. At night market and street are noisier than the figures: within budget at face value, not a precise number.
Ground quads, on minus off, 12 h: overview +0.01 +-0.20, street -0.71 +-0.67, parked -0.06 +-0.12: nothing measurable. The toggle `closeLevel` leaves them on, so they are not in the table above.
hitch.mjs, 12 and 21.5: prog+0 in every window (195 programs). One freeze of 110-160 ms in the arrive window of street, parked and market at 12 h, with geo+37..60: not ours, the same size with `?noclosevehicles` (off 112, 110, 151 ms; on 111, 113, 154 ms). It comes on a camera cut; the owner is not established (near-detail uploads are the likely cause, not tested).
Triangles of one vehicle at the close level (`closeStats()`): compact 18.6 k, hatch 20.9 k, sedan 22.1 k, suv 23.3 k, estate 21.3 k, mpv 20.9 k, delivery 14.2 k, lorry 30.4 k, bus 20.3 k, ice-cream 13.4 k; at most 12 per kind, only within the close distance.
Boot, one run each: 32.7 s on, 36.0 s off. No penalty seen, but one run can't isolate the time spent building the close models: that figure is not measured.

## Parked-car glint (coordinator's question)
The car's own material, not the car-park lamps. A/B at `veh-parked` 3 m, 21.5, with and without `?noparklamps`: with the lamps off no headlamp is lit either, and the bright bezel ring and bumper strip stay; the lamps only add a warm wash over the whole car. Causes in the material: constant emission on lamps that were off, moon specular on low-roughness glass and lacquer (both fixed earlier), and an even grey in near chrome that did not fall at night (fixed after this A/B; rechecked without the lamps: the bumper strip is visibly dimmer). What still shows is the cream bezel round the lamp, lit like the paint beside it: no lamp reads as on.

Seen in that A/B, not ours: hard dark rectangles in the blue reflection of the ground-floor windows behind the cars (both variants). For whoever owns the mirrors in glass (close-light).

## Edits outside the owned files
`src/ui/camera.ts`: autofocus also asks `services.traffic.rayHit` (parked cars are not pick targets).

## Harness
`scripts/vehset.mjs`: real vehicles from fixed framings. Run it with `TH_BROWSER_LIB=C:/Projects/GameCity/scripts/browser.mjs` from this worktree. Judge with `--q lensN=14`: f/2.8 at 1 m is truly shallow, and the blur hides what you want to see. The script can wait minutes for the lock: don't wrap it in a short `timeout`.
