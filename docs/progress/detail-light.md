# Detail round: light, sky, water, weather (branch claude/detail-light-4be02a, port 5206)

Shared rules: `docs/progress/DETAIL-ROUND.md`. Switches: `src/core/detaillight.ts` (`?nodetaillight`, `?no<name>`).

## Resume here
Dev server: `npx vite --port 5206 --strictPort --host 127.0.0.1`. Harness from the main checkout with `--url http://127.0.0.1:5206/`.
Baseline captures: `shots/detail-light/base`. Scratch probes: `shots/detail-light/probe*.mjs` (ignored by git).
Round 1 done: storm, wet town, rainbow, sea fog, storm water, early lamps, smoke plume. Checks passed on the head before the last paving-tap trim: invariants `{}` and
validate `[]` dry and in a storm, ui-test 70 passed with `kinds` passing alone (the known flake), hitch 0 new programs in every window dry and in a storm, 148 programs
before and after the weather turns mid-run, console clean on medium, low and diorama. Results in `shots/detail-light/final/`.
Not done yet, in order of value: a look at the medium / low storm; rain curtains seen from afar; rainbow in the water's mirror; contact-hardening shadows and
headlight cones were not priced; window emission variety is the buildings session's (hand-off).

## Storm: how it works
`src/render/sky/weather.ts` (`?nostorm` = the old even shower). A storm is a band of deck cloud carried along the wind; `lead` and
`trail` are its edges in metres from the town. Overcast, rain, sun, rainbow all derive from them. Test with `?weather=storm`
(held), `?weather=rain`, `?weather=clear`, `?weather=passage` (loops), `?stormfront=<km>` (pins the lead edge; width 26 km), `?weather=fog`, `?fogx=<m>`.
Schedule: day 1 none; day 2 the showpiece (trail passes at 17.3 h, so sun under the deck and a rainbow); day 3 morning sea fog; later days random.
- Sky, deck and shadows share `uStorm` / `uStormK` / `clStorm()` (`sky/cloudLayer.ts`); the haze ring follows per azimuth (`atmoDrive.horizonAt`).
- `sky/rain.ts`: streak quads, near box + wide box, lamp-lit per streak in the vertex shader; splashes on a baked 1 m ground map.
- `sky/lightning.ts`: flash pulses, ribbon bolt, emits `'lightning'` ({ distance, power }). `ctx.services.sky.strike()` forces one.
- `sky/wetSurfaces.ts` (`?nowetfacade`): global patch of the physical chunk, gated by one uniform.
- `water/streetMirror.ts` (`?nostreetmirror`): the water's planar pass moves to the road while wet, low and with no water in view.
- Water: higher swell, rain rings near the eye, whitecaps on crests away from the shore, the band in the mirrored sky (`water/surface.ts`).
- Sea fog: `thMistOD` in `atmosphere.ts` counts only the part of a ray east of the bank's edge; `thAtmo[11].w` is the edge, 0 = plain mist.
- Lamps switch on at sun height 0.1 instead of 0.05 (`core/time.ts`): at 19.2 h the town is already lit. Biggest gain per millisecond of the round.
- Factory smoke (`sim/ambient.ts`): lower rate and opacity, longer life, so a thinning plume rather than a cotton ball.

## Cost (perf.mjs --gpu 1, 1920×1025, high, adaptive off, on AC behind the guard, 2 interleaved repeats, ms/frame)
Sibling sessions were running, so read differences of less than about 1 ms as noise.
| view@h | `?nodetaillight` | dry, all on | held storm |
|---|---|---|---|
| street@12 | 33.37 / 32.06 | 33.44 / 32.49 | 35.47 / 34.26 |
| overview@12 | 37.58 / 35.94 | 37.50 / 36.45 | 37.47 / 36.19 |
| downtown@12 | 36.87 / 35.65 | 37.16 / 36.01 | 36.81 / 35.83 |
| market@12 | 33.38 / 32.13 | 33.87 / 32.74 | 35.34 / 34.22 |
| street@21.5 | 35.93 / 33.71 | 34.59 / 33.80 | 35.72 / 34.66 |
| overview@21.5 | 41.01 / 39.26 | 40.98 / 39.71 | 41.25 / 40.01 |
| downtown@21.5 | 39.84 / 38.41 | 39.78 / 38.63 | 39.14 / 38.87 |
| market@21.5 | 38.04 / 36.72 | 39.83 / 37.72 | 38.41 / 38.89 |
Dry: +0.1 to +0.6 ms, market@21.5 +1.4 on spread repeats. The storm only costs while it lasts. This table is from before the mirror trims (five taps to three, lower
resolution, one tap on paving). Clean run after them, 3 repeats within 0.1 ms: street@12 storm +1.42, market@12 +1.87. A / B at the market on spread repeats: `?nowetfacade` -0.5 to -1.2,
`?nostreetmirror` 0 to -1.4; the wet patch was then simplified to one sine. An earlier run put the mirror at 1.3 ms at street level; dropping the spray mist above the ground took the overview's storm from +2.8 to about 0.

## Half-rate water mirror in motion
Paired stills, not video: same path, paused clock, 1.2 m per frame (36 m/s at 30 fps), `?noreflhalf` against the default (`shots/detail-light/probe2.mjs`).
Mean difference over the water 1.7–1.9 of 255 at every step; the worst pair shows no visible difference. It stays in place because the lookup uses the matrix of
the camera that drew it. Boats moving in the mirror were not tested (paused clock): they should lag one frame. Nobody has watched it as live video.

## Edits outside my files (small and additive)
- `src/world/roads/materials.ts`: imports, `TH_NO_WET` define in `inject`, spec occlusion line, mirror GLSL and uniforms on asphalt and hard, `emit` on hard.
- `src/world/roads/glsl.ts`: one `rdEmit += rdStreetMirror(...)` line in asphalt and one in hardscape.
- `src/core/time.ts`: the two lamp thresholds. `src/sim/ambient.ts`: the factory chimney emitter's numbers.

## Hand-offs
- people-vehicles: car spray and tyre hiss in rain; umbrellas do appear in rain, check them at uRain = 1.
- ui: the weather button cycles auto / clear / rain; a fourth state calling `setWeather(1)` gives the storm. Thunder: audio should listen to `'lightning'` and delay by distance / 340 m/s.
- buildings: window emission variety.
- vegetation: canopy translucency.
