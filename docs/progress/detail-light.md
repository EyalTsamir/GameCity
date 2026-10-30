# Detail round: light, sky, water, weather (branch claude/detail-light-4be02a, port 5206)

Shared rules: `docs/progress/DETAIL-ROUND.md`. Switches: `src/core/detaillight.ts` (`?nodetaillight`, `?no<name>`).

## Resume here
Dev server: `npx vite --port 5206 --strictPort --host 127.0.0.1`. Harness from the main checkout with `--url http://127.0.0.1:5206/`.
Baseline captures: `shots/detail-light/base` (overview, harbor, beach, street, quay, bay × 18.2 / 19.2 / 21.5).
Round 1 in progress: the storm. Built: band model, rain, splashes, lightning, wet surfaces, street mirror, rainbow. Not yet priced.
Next in order: tune the storm by eye, water in the storm, thunder hand-off, sea fog, then golden hour, blue hour, clouds, smoke.

## Storm: how it works
`src/render/sky/weather.ts` (`?nostorm` = the old even shower). A storm is a band of deck cloud carried along the wind; `lead` and
`trail` are its edges in metres from the town. Overcast, rain, sun, rainbow all derive from them. Test with `?weather=storm`
(held), `?weather=rain`, `?weather=clear`, `?weather=passage` (loops), `?stormfront=<km>` (pins the lead edge; width 26 km).
Schedule: day 1 none; day 2 the showpiece (trail passes at 17.3 h, so sun under the deck and a rainbow); later days random.
- Sky, deck and shadows share `uStorm` / `uStormK` / `clStorm()` (`sky/cloudLayer.ts`); the haze ring follows per azimuth (`atmoDrive.horizonAt`).
- `sky/rain.ts`: streak quads, near box + wide box, lamp-lit per streak in the vertex shader; splashes on a baked 1 m ground map.
- `sky/lightning.ts`: flash pulses, ribbon bolt, emits `'lightning'` ({ distance, power }). `?strike=<ms>` forces one.
- `sky/wetSurfaces.ts` (`?nowetfacade`): global patch of the physical chunk, gated by one uniform.
- `water/streetMirror.ts` (`?nostreetmirror`): the water's planar pass moves to the road while wet, low and with no water in view.

## Edits outside my files (small and additive)
- `src/world/roads/materials.ts`: imports, `TH_NO_WET` define in `inject`, spec occlusion line, mirror GLSL and uniforms on asphalt and hard, `emit` on hard.
- `src/world/roads/glsl.ts`: one `rdEmit += rdStreetMirror(...)` line in asphalt and one in hardscape.

## Hand-offs
- people-vehicles: car spray and tyre hiss streaks in rain; umbrellas already appear above uRain, check them at uRain = 1.
- ui: the weather button cycles auto / clear / rain; a fourth state calling `setWeather(1)` gives the storm. Thunder: audio should listen to `'lightning'` and delay by distance / 340 m/s.
- vegetation: canopy translucency.
