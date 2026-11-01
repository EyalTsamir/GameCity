# Close vehicles: trains (close-up round)

The sister of `close-vehicles.md` for `src/sim/rail/*`: a close level for every car by system, by the same method.

## What
- `trainRender.ts`: per car type one more InstancedMesh set, `rail-<type>-close` (body, casts shadows), `-inner` (saloon, cab; no shadow caster),
  `-glass` (panes), `-panedepth` (panes again, depth only, last of all). Same instance buffers per set. A car goes to it by the same distance logic
  as road vehicles (`CLOSE_DIST` 18 m in the reference view, shrinks with a wide lens and a small window), nearest point of the car body; a car half in a
  tunnel mouth stays on the far level, because the close programs have no discard. At most 4 EMU cars, 1 loco, 4 wagons.
- `trainMaterial.ts` `make(near)`: defines `TR_NEAR`, `TR_CLOSE`, `TR_GLASSPASS`. The far program keeps its size (all behind `#ifdef`). Close
  programs have no `gl_FragDepth` and no `discard`, so early-z works for them.
- `closeGlsl.ts`: shading by the shared close-up tiles. `closeModel.ts`: saloon, cab, door leaves, bogies, lamps. `trainModels.ts` assembles through `CloseHooks`.
- EMU: real window and door openings, panes that mirror the street, saloon with moquette seats, poles, lamp band, vents, posters, LED display;
  door leaves that slide, lined on the inside; bogies with coil springs, dampers, brake gear, hoses, turned wheels; lens lamps with a bowl behind them
  and LED tail lamps, off when they are off; orange-peel paint, panel joints, rivets, runs of dirt. Cab with desk, screens, controllers, seat, breaker
  cabinet, blind, wipers and a driver in the operator's shirt. Loco: same cab behind its screen, machined bogies. Wagon: sill with a data stencil, rust
  and salt on the containers, coil bogies.

### Things learnt
- **N8AO prints on glass.** The panes draw with no depth write, so the AO pass computes the room behind them and multiplies the result into the pane's reflection.
  A dark cab behind a windscreen then shows a noisy mottle and odd dark strips. `-panedepth` writes the panes' depth after all transparents, and on an open door the doorway's
  plane (`T.DOORPLANE`), so AO and the lens treat the opening as a surface. 
- A black strip on a monitor in the cab was its top poking through the raked screen: it shows no reflection because it is in front of the glass.
- Saloon lighting has to agree with the far level's `trInterior` near the hand-over: `swapK` in `closeGlsl.ts` brings AO and lamps towards it from 6 to 17 m.
- The people's material gets a warm term inside the rail band (`PED_RAIL_Z`, `pedestrians/shader.ts`): the saloon's lamps on the passengers after dark. See Left.

## Switches
`?novehtrain` (this level), `?noclosevehicles` (all close vehicles). Off on quality `low` (`closeVeh(ctx, 'vehtrain')`, min medium; checked: 0 cars close, no errors).
In the page: `__city.ctx.services.rail.render.closeOn = false` puts every car on the far level at once (what the numbers below use).
`node scripts/trainset.mjs --kind regional|freight --state dwell|any --shots ... --hours 12,21.5` is the test set.

## Numbers
All behind `power-guard.mjs`, on AC throughout, after `npm run bake`, 1920×1025, high, ms. Other sessions were at work on the machine (the lock serializes browsers, not the rest).

**Far views, the budget: default against `?novehtrain`** (`perf.mjs --repeat 3`, reloads; mean of 3):

| view | default | `?novehtrain` | difference |
|---|---|---|---|
| `station` 12h | 34.71 | 34.94 | -0.23 |
| `station` 21.5h | 35.72 | 35.60 | +0.12 |
| `overview` 12h | 32.10 | 32.06 | +0.04 |
| `overview` 21.5h | 33.28 | 33.70 (33.38 without one 34.33) | -0.42 (-0.10) |

No cost shows, but the method resolves no better than about ±0.3 ms: repeats of one variant spread by up to 0.4, and the train is in view in some samples and not others (254 against 272 draws).
So "at most +0.2 ms at `station`" is consistent with this and not proven by it. By construction no car is on the close level from there (0 close cars seen at 40 m along the platform): what remains is a distance test
per car. `?novehtrain` does not isolate two things that are in both columns: the far program's doorway-depth fix and the warm term in the people's material (one `dot` per person's pixel). Neither was measured alone.

**Near a train: close level against the far level in one page** (`abprof.mjs`, `rail.render.closeOn`, clock stopped at the platform, doors open; positive = the close level costs more; 12h / 21.5h). Run 2 is the head commit, run 1
is before the doorway plane and the passengers' lamps. Frame times here are 40-45 ms. This is the price compared with the far level, not with no train.

| view | run 1 | run 2 |
|---|---|---|
| 19 m (hand-over) | -2.1 ±2.8 / -1.16 ±0.35 | |
| 8 m | -2.09 ±2.8 / +0.11 ±0.09 | |
| 3 m at a door | -0.18 ±2.9 / +0.87 ±0.16 | +1.2 ±0.18 / +0.63 ±0.14 |
| 1 m into a door | +3.07 ±0.17 / +3.86 ±0.2 | +2.82 ±0.24 / +5.21 ±1.57 |
| 1 m at a window | -0.86 ±0.08 / -0.96 ±0.31 | |

The expensive case is a whole screen of saloon at arm's length, +3 to +5 ms. At a window it comes out cheaper than the far level. The number of cars on the close level was not logged for these views.

Shader programs: 199 at 40 m, 199 at 3 m, 199 at 1 m at night (`renderer.info.programs`, head commit, 1280×720): none compiled mid-run on that path. Walking and `hitch.mjs` were not run. Freight was not part of this check.

## Left
- 1 m into an open door costs +3 to +5 ms. I did not profile it; the fragment work of a full screen of `-inner` is the first suspect.
- Road vehicles draw their glass the same way (no depth write), so they probably have the same AO print on the windscreen. Not looked at, `src/sim/traffic` not touched.
- The console carries four HLSL `X4000` warnings for `f_trLivery` next to the same kind from other modules (D3D only, warnings, no errors). Not compared with the state before this work.
- Not seen in a picture: a wagon's tail lamps (`wagonTail` stands in the forest wherever the freight was caught; try another moment) and the data stencil on the sill, which did not show in the `wagonSill` frame. Nor the freight train since the last commits to the panes (cab of the loco was seen after the pane depth).
- The saloon has no screen-space AO now, by design: seats meet floor and wall through painted shade only.
- The rock wall seen through a far window looks crackled now that it is sharp. Not the pane's dust (same with the dust off); I take it to be the wall itself, not checked further.
- The warm term in the people's material also touches anyone on a level crossing while they are between the rails at night. Not seen, by reasoning from the shader.
- The loco's side windows are panes over a dark plate, no room behind.
