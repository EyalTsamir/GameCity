# gfx-water — audit item 4: water that reads as water

## Resume here
* State (2026-10-18 22:10): W1–W3 implemented and tuned; all files typecheck. chain3 COMPLETED (16:46):
  `shots/water/final/<poi>_<11|18h2|21h5>.png` (full city 1600×900: harbor, beach, riverside, overview, park),
  `shots/water/it6/` (module subset 1280×720: harbor, shipw, river2, pier, bay × 3 h), `shots/water/med2/`
  (quality=medium + wakes) — all reports: 0 console errors/warnings, invariants empty, no failed modules.
  Reflection stats after the last cuts (`shots/water/stats_full3.json`, full city 1280×720, calls/tris of the
  pass, day · night): harbour 7/129k · 13/138k, overview 8/157k · 14/168k, beach 9/163k · 15/174k,
  riverside 6/143k · 11/154k, park 4/70k · 9/81k, shipw 7/109k · 13/120k, river2 4/101k · 12/123k,
  pier 6/97k · 12/108k, bay 8/129k · 14/140k → all < 0.2 M.
* Reviewed: final POI sheets `shots/water/sheets_final/ba_{harbor,beach,riverside,overview,park}.png` (full city)
  + custom views `ba_{shipw,river2,pier,bay}.png`, `ba_harbor_subset.png`: night indigo OK, turquoise shallows OK,
  pond consistent. White blobs in medium frames = ambient swans/ducks (not foam).
* NOW (PRIORITY from lead/night): at 02:00 the moon glint on the sea is a huge clipped white patch with sparkle
  clusters (evidence shots/night/final2/beach_2.png). Target: narrow, sparse silvery moon path, peak ≈ sRGB
  200–220, almost nothing above the night bloom threshold (0.88), weaker than the sun path. Fix in surface.ts
  (`moon` term + point glints at night): scale by moon light vs sun, tighter lobe, fewer glints, clamp HDR.
  Check beach/harbor/riverside/overview at 2 h and 21.5 h after the fix.
  - DONE in code (22:30): cause = moon term with a broad sparkle lobe (`wSparkle·pow(md,40)`) + strong core on
    rippled normals. New: Beckmann moon path (a2 0.0008–0.02, core 0.26 + sheen 0.025 + pins 0.7, min(…,0.75),
    × moonVis × night × (1−0.7 river) × (1−0.9 overcast)); glint cells at night 2.5 % (step 0.975).
  - Verifying: `scratchpad/water_moon.sh` (log shots/water/moon.log) → shots/water/moon/{beach,harbor}_{2,21h5}.png,
    shots/water/moonB/{riverside,overview}_{2,21h5}.png; compare with shots/night/final2/beach_2.png.
* Next: (1) tune if the review finds problems (re-capture only the affected views, ≤15 min jobs);
  (2) sheets: POIs final vs `shots/baseline/<poi>_<h>.png` (sheet.py, → `shots/water/sheets_final/`),
  custom views it6 vs `shots/water/base` (`scratchpad/water_sheets.sh shots/water/it6 shots/water/sheets_final
  harbor shipw river2 pier bay`); (3) "## Final report" here + SubagentHandback.

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
* ~22:40 — it4 (`shots/water/it4`, 8 views × 11/18.2/21.5, subset of modules): 0 console errors/warnings,
  invariants clean. Harbour/ship: cranes, superstructure, hull band and tug mirrored; golden hour warm sky
  streaks + lit cranes; beach night: wheel colours, pier lamps, hotel windows streak on the water; river mirrors
  bank trees + quay walls. Lead budget steer (≲0.2 M tris): mesh set trimmed (facade trim chunks, railings,
  signs, aircraft, waterfowl dropped; far trees only while the river is in view) → e.g. bay night 14 calls /
  139k tris. Tweaks after it4: ripples −20 %, river F0 0.3 + greener body, daytime sky reflection deepened 22 %
  toward the zenith (studio horizon is near-white → milky grazing water), shallows more turquoise, wake foam
  dimmed at night. river2 view moved to x=20 (scoreboard of the stadium blocked x=-30).
* Lock etiquette (lead): runs ≲15 min → chain of short runs (`scratchpad/chain1.sh`): it5a/b/c (mine),
  base11/18/21 (5174, same views), full-city stats (`shots/water/stats_full.json`, scratchpad/wstats.mjs),
  perf harbour/overview A/B, medium-quality + wakes.

* 2026-10-18 ~00:10 — chain1 completed before the usage stop: `shots/water/it5` (mine, module subset,
  8 views × 3 h), `shots/water/base` (5174, harbor/shipw/river2/pier/bay × 3 h, same size/subset),
  perf + stats. Before/after sheets: `shots/water/sheets_it5/ba_{harbor,shipw,river2,pier,bay,overview,beach,
  riverside}.png` (overview/beach/riverside "before" = the original full-city shots/baseline frames, "after"
  = module subset without roads/props → those three are only indicative; full-city finals pending).
* ~03:10 — reflection numbers, full city, 1280×720, level 2 (427×240 target), `shots/water/stats_full2.json`
  (day / night, draw calls + triangles of the pass): harbour 7/129k · 14/138k, overview 8/157k · 15/169k,
  beach 10/209k · 17/220k, riverside 6/143k · 12/154k, shipw 8/155k · 15/166k, river2 4/101k · 12/114k,
  pier 6/97k · 13/108k, bay 8/129k · 15/140k. Then (after the lead's budget steer) far views (orbit
  distance > 330 m: overview) skip small boats + bank trees, bank trees only while the camera target is
  within 45 m of the river (beach no longer pays 45k for a glimpse of the river mouth) → re-measure pending.
* SwiftShader perf A/B (perf.mjs, one run each, full city 1280×720, noon): harbour 314.7 ms (refl on) vs
  287.4 ms (?nowaterrefl) = +9.5 %; overview 573 vs 713 ms (noise-dominated, inverted) → inconclusive.
* ~03:20 polish: night sea lifted to a deep readable indigo (mirrors the night horizon, not the black zenith);
  turquoise shallows keep their colour (F × 0.62 over the sandy shelf); moon glitter on the river softened;
  scratchpad scripts renamed `water_*` (the scratchpad is shared — another agent overwrote my sheets.sh).
* Mesh survey of the current tree (night): the opted-in names still exist (buildings-shell/-lights,
  harbor-*, landmarks-lights/-glows, terrain-masonry (now 38k tris), terrain-glows, props-glows,
  boats-*, veg-trees-far 45k). No new emitter meshes from other agents to opt in.

* 2026-10-18 ~10:30 — PAUSED by the user (budget). State at the pause:
  - Code: all files typecheck; last edit = point glints (sun/moon sparkles are now random facets on a
    0.35 m grid, ~1–2 px, faded by footprint — the crest-texel sparkles read as foam blobs in the medium
    run `shots/water/med/sheet_med.png`). Not yet captured.
  - `scratchpad/water_chain2.sh` (final verification chain) was started and KILLED during its first step
    (stats). Nothing of it ran. Resume = re-run it as is (each step ≲15 min lock):
    stats → `shots/water/stats_full3.json` (re-measure after the far-view / near-river trims), full-city
    finals at 1600×900 (harbor, beach, riverside, overview, park × 11/18.2/21.5 → `shots/water/final`, compare
    with `shots/baseline/*`), fresh custom views (`shots/water/it6`, compare with `shots/water/base`), perf A/B
    harbour + overview (?nowaterrefl), medium quality + wakes (`shots/water/med2`).
  - Then: build sheets (`scratchpad/water_sheets.sh NEWDIR OUTDIR views…` for custom views; POI sheets vs
    shots/baseline via sheet.py), check pond (park), glints, night indigo, shallows; final report.

* 2026-10-18 resume (branch afdbf92): perf timing runs removed from the chain (lead runs one consolidated
  A/B) → `scratchpad/water_chain3.sh`: stats, full-city finals (1600×900) for harbor/beach/riverside/overview/
  park × 3 h, custom views it6 × 3 h, medium + wakes. Night emitters (lead's question b): 7 meshes from 5
  modules / 4 shader types (window quads, glow sprites, landmark-light shader, boat halos) — one merged
  reflect-only mesh would be a new proxy representation, not cheap → documented; cheap cut instead:
  `landmarks-glows` dropped (entirely inland) → night adds 6 calls, not 7.

## Perf variants for lead
`;nowaterrefl;waterrefl=1` (default high = level 2). Optional, wakes/contact (cheap):
`;nohullfoam;wakes=puffs`. GPU expectation: level 2 ≈ +0.1–0.2 M vertices (one extra pass of
the opted-in meshes) + 1/9 of the screen in fragments (+ mip generation of a 427×240 HalfFloat target) →
≈ 0.6–1.2 ms on the Adreno X1-45; level 1 ≈ half the fill, same vertices minus trees.

## Open issues / notes
* Depends (read-only) on the sky dome's uniform names: uZenith, uHorizon, uGlow, uGlowI, uSunCol, uSunVis,
  uMoonDir, uMoonVis, uOvercast (mesh name `sky-dome`). Missing → fixed day colours.
* `scene.onBeforeRender` is chained (previous handler is called first) — other modules may also hook it.

## Requests to other areas
* (none yet)

## Changes outside my area
* (none)
