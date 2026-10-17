# gfx-water — audit item 4: water that reads as water

Owner files: `src/world/water.ts`, `src/world/water/*`, `src/sim/boats.ts`, `src/sim/boats/*`.
Brief: GFX-PLAN.md (W1 planar reflections, W2 shading, W3 hull contact + wakes, W4 verification).

## Design

### W1 planar reflection (`water/reflection.ts`)
* Mirrored copy of the main camera about y = WATER_LEVEL (sea + river share the plane; pond = analytic only).
* Runs from `scene.onBeforeRender` when the main camera renders → sees THIS frame's camera (camera
  module updates after water), lands inside postfx's GPU timer (adaptive controller sees the cost) and
  inside renderer.info (draw-call stats). Armed once per frame by `water.frame()` (`request()`).
* Oblique near plane = water plane (no clip-plane shader variants → no recompiles). Camera layers =
  `LAYERS.REFLECT` only; ALL lights get the REFLECT layer at attach (else materials compile an unlit variant).
* HalfFloat RGBA target, mipmapped, cleared to transparent black; water composites it as premultiplied
  colour over its own analytic sky (texture alpha = coverage). Level 2 = 1/3 drawing-buffer res, level 1 = 1/4.5.
* State restored: render target/face/mip, clear colour/alpha, autoClear, `shadowMap.autoUpdate` (off during
  the pass), `scene.background` (null during the pass), `scene.matrixWorldAutoUpdate` (off during the pass).
* Opt-in by mesh name at `'modules:ready'`:
  base (all levels): buildings-shell/-lights/-signs, harbor-north/beach/river/animated/rides/glows,
  landmarks-lights/-glows, terrain-glows, props-glows, boats-big/-small/-lights, ambient-vehicles/-waterfowl,
  terrain-masonry. Level 2 only: buildings-trim chunks whose bbox can appear in the water (height-aware
  proximity test against the water field), terrain-railings (same test), veg-trees-far forced visible for the
  pass (near tree chunks forced off; restored after).
* Service: `ctx.services.water.setReflectionQuality(0|1|2)`, `reflectionQuality()`.

### W2 shading (`water/surface.ts`, `water/noise.ts`)
* Own tileable textures (independent of terrain noise): ripple normal map (integer-wavevector plane waves,
  mipmapped → Toksvig variance → roughness) + macro fBm (wind streaks, patches, lace, sparkle hash).
* Macro "ruff" field (glassy slicks ↔ ruffled streaks, 60–250 m) drives ripple strength, reflection blur,
  glitter width → readable from the overview. River: flow streaks along +x.
* Sky = dome gradient + sun-side glow (dome uniforms copied each frame) → sea follows time of day.
* Fresnel F0 0.2 sea / 0.26 river / 0.3 pond → 0.92 grazing. Composite out = body·α(1−F) + refl·F + glints.
* Sun glitter (GGX, roughness from variance/wind) shadowed via the key light's visibility; crest sparkles
  fade by pixel footprint; moon glint; lamp-map streaks when the reflection pass is off.
* Body: depth bands (soft-stepped), colour patches, night indigo tint, lamp map light.

### W3 contact (`water/hulls.ts`) — wakes: TODO
* Up to 16 oriented waterline footprints (ship from ctx.services.harbor, fleet boats), frustum-culled per
  frame → contact shadow + lacy foam line (heavier at the bow / with speed).

## URL switches
`?nowaterrefl` (analytic only), `?waterrefl=0|1|2` (force level), `?nohullfoam`, `?wakes=puffs` (old puff
wakes), `?waterdebug=refl` (water shows only its reflection term), `?refldbg` (reflection pass draws one
opted-in mesh at a time, console markers — for attributing driver warnings).

## State / milestones
* 2026-10-17 ~19:30 — W1 pass + W2 shader + hull contact implemented, typecheck clean; first captures running
  (`shots/water/it1`). Next: judge frames, tune, wakes (Kelvin ribbons), boat reflection culling (mirrored
  frustum test in boats/render.ts), before/after sheets, perf.

* ~20:45 — it2 captures (`shots/water/it2`, harbor/shipw/pier at 11/18.2/21.5): reflections work (ship
  superstructure, cranes, tug, sailboat, pier pilings; night windows + pier lamps + wheel streaks). Reflection
  pass at 1280x720: 427x240, 14 draw calls, ~209k tris (pier night). Fixes after review: body palette darkened
  (S1 sun made the diffuse-lit body as bright as the sky → reflections washed out), Beckmann glitter lobe
  (GGX tails covered the sea at sunset), narrower hull foam ring on the big ship (it hid the hull reflection),
  F0 0.3/0.34/0.32, slick/ruffle Fresnel modulation, night-only emitter meshes skipped by day, wake ribbons
  (sim/boats/ribbons.ts) replace bow/stern puffs (`?wakes=puffs` = old A/B), puffs only for prop wash + spray,
  boats get the lamp light map (night agent's patchLampMaterial, dynamic import), `?waterdebug=refl`.
* Lead's river view "-30,0,118,32,20,18" is blocked by trees → use river2=-30,-1.6,118,45,180,30.
  Lead's ship view "128,2,-78,42,70,16" only shows containers → use shipw=160,-1.6,-80,60,100,24.

* ~21:55 — it3 (`shots/water/it3`): river now mirrors bank trees + quay wall; ship hull reflection visible
  after the ring fix. GL warning "Mismatch between texture format and sampler type" WAS mine: found with
  `?refldbg` (draws one opted-in mesh at a time with console markers) — the pass ran before three had
  (re)created the sun's shadow map (first frame / after a shadow-map size change) → three's placeholder for
  the shadow sampler is invalid. Fix: skip the pass while a shadow-casting light has no map. NaN bounding
  sphere error = wake ribbons with negative sample age after a backwards time jump → clamped + stale tracks
  reset. Tuning: F0 0.38/0.42/0.34, glassy wind slicks (long lanes along the wind: calmer, more reflective),
  stronger colour patches, fine ripple octave fades with pixel footprint (no distant dash noise), softer moon
  glint, wall-reflection band for the analytic (no-pass) mode, ribbon spacing adapts to speed (track covers
  the whole wake life), lace foam with ragged edges.
* Queued: it4 (8 views × 3 hours), baseline 5174 set at the same views/size (`shots/water/base`), perf A/B.

## Open issues / notes
* Depends (read-only) on the sky dome's uniform names: uZenith, uHorizon, uGlow, uGlowI, uSunCol, uSunVis,
  uMoonDir, uMoonVis, uOvercast (mesh name `sky-dome`). Missing → fixed day colours.
* `scene.onBeforeRender` is chained (previous handler is called first) — other modules may also hook it.

## Requests to other areas
* (none yet)

## Changes outside my area
* (none)
