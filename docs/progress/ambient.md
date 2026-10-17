# ambient — progress

Owner files: `src/sim/ambient.ts`, `src/sim/ambient/*` (shared, smoke, birdModel, birds, waterfowl,
sparks, fireworks, vehicleModels, vehicles, kites, fireflies). ~5000 lines. Status: **feature-complete**.

## Done
- [x] Smoke service `ctx.services.smoke.addEmitter({getPosition, rate, size, color, life, rise, glow?})` → `{remove(), set()}` + `burst()`; signature documented at the top of `src/sim/ambient.ts`. 1 draw call, shared budget (~900 puffs, rates scaled together), lit by the live sky lights (+ warm city under-glow at night), wind drift, back-to-front sorted. Registered before anything else; every other sub-system is fault-isolated (`build()`/`run()` in ambient.ts) so a failure never takes the smoke service down. Used by: factory chimneys (plan), harbor (ship funnel), boats.
- [x] Birds (1 InstancedMesh, direct matrix writes): starling flocks (boids around wandering leaders; roost in trees at dusk), gulls (soar/bank, rest on the sea by day, float on rafts at night, take off when a boat comes), pigeons (town square, market, downtown plaza: walk/peck/flutter up/roost on a roof), butterflies (park, daytime).
- [x] Waterfowl (1 InstancedMesh): mallard family (ducklings in a line), drakes, swan pair on the pond; ducks on two river stretches; dabbling, sleeping at night; **give way to boats** (`ctx.services.boats.fleet.boats`, guarded): paddle out of an approaching hull's path, never inside a hull (invariant).
- [x] Sparks (instanced GL points, 1 draw + 1 depth pre-pass only while fireworks are live): GPU-analytic stars with curved trails + sea reflections; CPU glow slots (nav lights, burner, fireflies, barge lamps).
- [x] Fireworks: nightly show starting when the clock is in 22:00–22:03 (runs ~50 sim s — 22:00–22:03 alone is only 2 real seconds at 1x), `fireworks:launch` event ({duration?}), emits `fireworks` {phase:'burst',x,y,z,kind} per burst + `fireworks:show` {phase}. Barge moored at (180,-58) yaw 0.35 — **boats.ts hard-codes this footprint as a nav obstacle: do not move it**.
- [x] Vehicles (1 InstancedMesh + shadow): balloon (inflates lying in the stadium 05:45, lifts off 06:24, loop at 95–135 m with burner flares and inner glow at dusk, lands ~19:45 and packs away), commuter plane (every 2.2 game h at ~200 m over the south half, nav lights + strobes), blimp "TINYHAVEN" (09:30–23:30 at ~140 m, sign + gondola lit at night; both flanks verified), fireworks barge. Pickers (balloon/blimp/plane/barge) → camera follow / info card.
- [x] Kites (1 InstancedMesh): 4 flyers at the beach waterline, kites over the sea 09:00–18:30.
- [x] Fireflies around the pond / riverside on summer nights (glow slots).
- [x] Stats: `cpuMs` (EMA) + `ms_<part>` per-part CPU; counts. Invariants: smoke budget, non-finite states, birds below ground, gulls under the sea, fowl out of water / inside hulls, kites too low, balloon/blimp vs rooftops, firework ring-buffer overwrite, broken parts.

## Measured cost (perf.mjs, full city, 1300×930, alternating variants)
- overview 12h: 15.81 vs 15.56 ms (3 pairs) → **~0.25 ms**, +7 draw calls
- park 12h: 13.25 vs 12.89 ms (2 pairs) → **~0.36 ms**
- fireworks view 22.02: 13.74 vs 13.04 ms (2 pairs) → **~0.7 ms** during the show, +8 draws
- CPU (`cpuMs`): 0.17–0.24 ms/frame; birds ≈ 0.13, smoke ≈ 0.04, waterfowl ≈ 0.03, vehicles ≈ 0.03

## Next (optional polish, nothing blocking)
- [ ] fireworks smoke haze lit by bursts (smoke.burst at burst points)
- [ ] perched gulls on breakwater/bollards (needs harbour geometry heights)

## Known issues / notes
- Camera clamps target y ≤ 140 and pitch ≥ 10°: aircraft close-ups need a high camera; `shot.mjs` evals run right after `setHours` before a frame updates positions — delay aims with `setTimeout(…, 1000)`.
- Fireworks reflections only appear where the reflected ray lands on the slab's sea (not for cameras far out east).
- Birds are small at POI distances by design (starlings ~1 m wingspan, 2.5× real) — they read as moving specks.

## Best views
- chimney smoke: `--view "-116,42,-98,95,-40,12"` (day 12h or night 21.4; needs the sim running a few seconds)
- park ducks/swans: `--view "-78,0,17,45,20,35"`; pond close-up via `--eval` + `ambientDebug.locate('fowl',0)`
- fireworks: `--view "160,10,-60,250,80,15" --hours 22.02 --shots 4 --interval 700`
- balloon/blimp/plane: `--view overview --hours 11.62`; dusk balloon return `--hours 19.3`; night blimp `--hours 21.4`
- kites: `--view beach --hours 12`; fireflies: `--view "-78,0,17,45,20,35" --hours 21.5`
- debug: `__city.ctx.services.ambientDebug.locate(kind, i)` kinds: flock, gull, pigeon, butterfly, fowl, kite, balloon, plane, blimp, barge
