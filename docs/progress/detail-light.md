# Detail round: light, sky, water, weather (branch claude/detail-light-4be02a, port 5206)

Shared rules: `docs/progress/DETAIL-ROUND.md`. Switches: `src/core/detaillight.ts` (`?nodetaillight`, `?no<name>`). Image sheets: `docs/progress/detail/light/`.

## Resume here
Dev server: `npx vite --port 5206 --strictPort --host 127.0.0.1`. Harness from the main checkout with `--url http://127.0.0.1:5206/`. Scratch probes and captures: `shots/detail-light/` (ignored by git).
The coordinator stopped the round here, for the merge. What was not built is under "Left", in order of value.

## What was added, and where to see it
| What | Switch | Best view and hour |
|---|---|---|
| A storm: a band of deck moving along the wind, rain, slate sky, lightning, wet town, whitecaps | `?nostorm` (old shower), `?weather=storm` | weather button, 4th state; `150,1,0,120,90,6` at 19 h |
| Storm arriving by the button: the front sweeps in (rain after about 20 s) and leaves (about 20 s, then the sun under the deck) | — | same, watch it from 16–18 h |
| Thunder: crack when close, long roll, delay distance / 340 m/s | — | any storm, sound on |
| Rain curtains under the band's edge, seen from outside | `?stormfront=-3` to pin | `150,30,0,200,90,-6` at 17 h; `280,5,10,60,270,-2` with `stormfront=32` |
| Rainbow, primary and secondary, also on the far water | `?stormfront=28&time=17.3` | `280,5,10,60,270,-2` |
| Wet town: darker, glossier walls and roofs | `?nowetfacade` | any storm or after one |
| Wet streets mirroring the town (the water's planar pass moved to the road) | `?nostreetmirror` | `5,1.5,-65,9,0,6` after rain at 19.3 h, or night storm |
| Sea fog rolling in | `?weather=fog&fogx=60&time=7.2` | beach, `150,1,0,120,90,6`; day 3 morning on its own |
| Low sun: a long broken column of light on the water | `?noglitter` | `290,8,-10,60,270,2` at 6.4–7 h; the canal at 18.4 h. The harbour at sunset stays in the town's shadow: correct, the sun is behind the town |
| Sunset sky: more cumulus left in the evening, more cirrus at low sun | `?nosunsetsky` | `340,15,60,120,250,3` at 18.4 h |
| Lamps on before sunset | — | `150,1,0,120,90,6` at 19.2 h |
| Night: a little more moon and sky light on the land | — | overview at 22 h |
| Far smoke: puffs overlap into a thin plume instead of a string of dark blobs | — | `150,1,0,120,90,6` at 18.2 h |
| Ground mist 2 ms cheaper, same look | `?nomistfast` (old noise) | every night and dawn |

## Storm: how it works
`src/render/sky/weather.ts`. `lead` and `trail` are the band's edges in metres from the town along the wind. Overcast, rain, sun, rainbow all derive from them. Test with `?weather=storm` (held), `rain`, `clear`, `passage` (one lap about 4 real minutes), `?stormfront=<km>` (pins the lead edge; width 26 km), `?weather=fog`, `?fogx=<m>`.
Schedule: day 1 none; day 2 the showpiece (trail passes at 17.3 h, so sun under the deck and a rainbow); day 3 morning sea fog; later days random. Held weather (button, `sky.setWeather`) is a band with one edge at infinity, sweeping at 900 m/s; a time jump or a URL parameter skips the sweep.
- Sky, deck and shadows share `uStorm` / `uStormK` / `clStorm()` (`sky/cloudLayer.ts`); the haze ring follows per azimuth (`atmoDrive.horizonAt`).
- `sky/rain.ts`: streak quads, near box + wide box, lamp-lit per streak in the vertex shader; splashes on a baked 1 m ground map.
- `sky/lightning.ts`: flash pulses, ribbon bolt, emits `'lightning'` ({ distance, power, bolt, x, z }); `ctx.services.sky.strike()` forces one. `ui/audio.ts` makes the thunder from the event.
- `sky/wetSurfaces.ts`: global patch of the physical chunk, gated by one uniform. `water/streetMirror.ts`: the water's planar pass moves to the road while wet, low and with no water in view.
- Water: higher swell, rain rings near the eye, whitecaps on crests away from the shore, the band and the bow in the mirrored sky (`water/surface.ts`).
- Sea fog: `thMistOD` in `atmosphere.ts` counts only the part of a ray east of the bank's edge; `thAtmo[11].w` is the edge, 0 = plain mist.

## What the A/B runs taught
- The storm cost +1.4 to +1.9 ms until its near-ground mist went: the mist branch computes value noise on every fragment. As low haze it costs nothing and the held storm became slightly cheaper than clear weather. A runtime A/B by piece (`abprof.mjs`, market) had shown wet surfaces -0.43, splashes -0.47, rain -0.22, mirror 0, which did not add up to the total: that gap is what led to the mist.
- The same palette mist lay over every night and dawn: `?nomist` at 21.5 h saved 3.4 (overview), 1.5 (street), 2.5 ms (market) on the head of that moment. Now most fragments stop at the plain optical depth and the patches are warped sines. Stills against the old noise at 6 h and 21.5 h, seaw, a close facade and overview, look the same; the patches differ in shape only.
- Rain streaks ran the full atmosphere per fragment on about one screenful of needles: now a distance fade in the vertex shader. Rain's `discard` went (blending covers it).

## Cost, final head (perf.mjs --gpu 1, 1920×1025, high, adaptive off, on AC behind the guard, 2 interleaved repeats, ms/frame)
`?nodetaillight` turns off every switched feature, the fast mist included, so at night it is slower. It does not undo the earlier lamps, the moon or the smoke numbers.
| view@h | `?nodetaillight` | clear, all on | held storm |
|---|---|---|---|
| overview@12 | 36.19 / 36.50 | 36.94 / 35.98 | 35.59 / 35.81 |
| downtown@12 | 35.35 / 35.45 | 35.91 / 35.37 | 35.14 / 35.38 |
| street@12 | 33.88 / 34.16 | 34.11 / 34.13 | 33.60 / 33.73 |
| market@12 | 32.59 / 32.59 | 32.69 / 32.66 | 31.93 / 32.03 |
| overview@21.5 | 38.96 / 39.47 | 37.76 / 38.24 | 37.83 / 37.94 |
| downtown@21.5 | 37.72 / 37.97 | 36.31 / 37.40 | 36.69 / 37.51 |
| street@21.5 | 33.02 / 33.52 | 32.92 / 33.26 | 33.05 / 34.75 |
| market@21.5 | 36.47 / 36.90 | 36.25 / 36.14 | 36.81 / 37.84 |
Clear weather by day: +0.1 to +0.2 ms. Clear at night: -1.2 (overview), -1.0 (downtown), -0.2 (street), -0.5 (market). Held storm by day: under clear weather by 0.3 to 0.7. Held storm at night against clear at night: about 0 at overview and +0.25 downtown, +0.8 street and +1.15 market on noisy repeats (budget +1.5). Not measured: a storm's front in view (the curtains add two texture fetches on sky and deck pixels only), sunrise with the sun column (one exp on water).
Triangles: rain and splashes (22 k quads on high, about 44 k triangles) only while raining; collapsed otherwise.

## Final checks on this head
Typecheck and build clean. Invariants `{}`, validate `[]`, console, modules and frame errors empty, at overview, speed 4, 20 s, clear and held storm. `hitch.mjs` 0 new programs in every window, clear and held storm. `ui-test --q noidle` 70 passed; `kinds` failed in the full run and passed alone (the known flake). The weather button has no ui-test step: its four states and the sweep were driven with real clicks in `stormbtn.mjs`. Console clean on medium, low and diorama, images fine at overview. `?diorama` ignores the band, as before: no director there. Film: 0 new programs, frames over 50 ms 23–29 against 26 with `?nodetaillight`, no freeze over 100 ms, seek sheet fine (the sun column shows on the river at 18:22 and 18:43).

## Half-rate water mirror in motion
Paired stills, not video: same path, paused clock, 1.2 m per frame (36 m/s at 30 fps), `?noreflhalf` against the default (`shots/detail-light/probe2.mjs`). Mean difference over the water 1.7–1.9 of 255 at every step; the worst pair shows no visible difference. It stays in place because the lookup uses the matrix of the camera that drew it. Boats moving in the mirror were not tested (paused clock). Nobody has watched it as live video.

## A storm passage in real time
Headless, button clicks, 5 s stills over 2 minutes at 16.2–19.3 h, about 48 fps at 1280×720 (`shots/detail-light/stormbtn.mjs`, sheet `after-rain-passage.jpg`): the front comes in, rain starts at about 20 s and is full at about 30 s, storm dark at about 30 s; after the click back to auto rain stops at about 22 s, the sun comes out under the leaving deck, the rainbow value reaches 0.97, lit clouds at sunset with the ground still wet. No errors, no jumps in the logged values. Judged from stills at 5 s spacing, not by a person watching it; the day-2 schedule itself was not sat through.

## The street after rain
A real shower ending at about 19.2 h (`shots/detail-light/after.mjs`). It reads wet: sky sheen on the asphalt, a blurred image of the facades, headlights in the road. A first check that only forced `weather.wet` looked dry, because the road's own `uWet` follows `uRain`: use a real shower, or `?wet=1` as well. Lamps on the road are wide flat lozenges rather than streaks. Those come from `roads/puddles.ts` (a change of the mirror's blur left them identical, so that change was reverted): see Left.

## Edits outside my files (small and additive)
- `src/world/roads/materials.ts`: imports, `TH_NO_WET` define in `inject`, spec occlusion line, mirror GLSL and uniforms on asphalt and hard, `emit` on hard.
- `src/world/roads/glsl.ts`: one `rdEmit += rdStreetMirror(...)` line in asphalt and one in hardscape.
- `src/core/time.ts`: the two lamp thresholds. `src/sim/ambient.ts`: the factory chimney emitter's numbers. `src/sim/ambient/smoke.ts`: far-puff size and opacity (mine by the brief).
- `src/ui/ui.ts`, `src/ui/hud/icons.ts`: the fourth weather state and its icon. `src/ui/audio.ts`, `src/ui/audio/synth.ts`: `thunder()` and the `lightning` listener. Approved by the coordinator.

## Left, in order of value (none built)
1. Lamps on a wet road as vertical streaks instead of wide lozenges: `roads/puddles.ts`, streets' file. Seen at `5,1.5,-65,9,0,6` after rain at 19.3 h. No cost expected.
2. Storm seen from above has no structure: a grey wash at overview. About 1 h, 0–0.3 ms estimated.
3. Speckled edge on the storm's wall clouds at `?stormfront=-5` (`150,30,0,200,90,-6`): may be only stills not settling, not diagnosed. About 30 min.
4. Fog with more depth and a soft sun disc. About 45 min, 0.1 ms estimated.
5. City glow on the low night sky (the land is still dark at overview). About 30 min, 0.1 ms estimated.
6. Wet lamp streaks on medium / low, which have no street mirror. About 45 min, 0.3 ms estimated.
7. Water wake and shore interaction. 1–2 h, 0.2–0.5 ms estimated.
8. Headlight cones on a wet road. About 1 h. Contact-hardening shadows: subtle and likely over budget, I would drop them.
Also not verified: thunder was rendered offline and its levels read (peak 0.3–0.59, 5–8 s long) but no person has listened to it, in the mix or against the rain bed.

## Hand-offs
- people-vehicles: car spray and tyre hiss in rain; umbrellas do appear in rain, check them at uRain = 1.
- buildings: window emission variety. Closed shops' roller shutters (`buildings/materials.ts`, the ribbed steel) read as orange-lit horizontal stripes at blue hour, e.g. `5,0.6,-30,5,0,1.7` at 19.3 h.
- vegetation: canopy translucency.
- ambient: small white motes hang in the sky at dawn and in storms (`290,8,-10,60,270,2` at 6.4 h): pollen or birds, not mine, they read as stars by day.

