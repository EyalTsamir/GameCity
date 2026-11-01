# Close vehicles (close-up round, stage 3)

Any vehicle has to hold up at 1 and 3 m: seats, dashboard and wheel through the glass, a driver who is one of the city's people, lamps with real
lenses, tyres and arches, door lines, dirt and small dents. By system, fine detail only near the camera. Trains: `close-vehicles-trains.md`.

## Resume here
- Branch `claude/cool-davinci-ad96c9`, dev server port 5219, harness from the main checkout (shared browser lock). Don't merge, push or deploy: the coordinator merges.
- Open now: rear ambers of delivery and ice-cream, torn shard at the ice-cream's arch, brake lamps blow out to pink; A/B for the parked-car glint; merge the trains.
- The trains subagent works in `.claude/worktrees/agent-a5f7c964b54e7ba16`, branch `worktree-agent-a5f7c964b54e7ba16`, port 5229. Merge only after it reports. Its `f71c60e` is a WIP commit made by this session, not by it.
- Not yet done: a fresh round over ordinary places, the final checks, perf at the end (the figures below are from round 1 only).

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
