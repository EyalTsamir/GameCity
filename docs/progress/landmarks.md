# Landmarks module — progress log

Owner: landmarks builder. Files: `src/world/landmarks.ts`, `src/world/landmarks/*`.
STATE: COMPLETE. All lots/features built, tsc clean, console clean, invariants clean, within perf budget.

## Architecture
- `builder.ts` MeshBuilder: typed arrays; per-vertex aPuv + aMat (pattern, rough/metal, glow, flood+seed);
  `raw` aMat for lights; kinetic variant adds aPivot/aAxis/aAnim. Routing: ornament patterns (clock/flag/rose/
  stained) → kinetic mesh; small trims (<25 cm, thin rods, `forceDetail` sections) → detail mesh; triangle soups
  (ExtrudeGeometry etc.) are welded (mergeVertices) — the vertex stage was the measured bottleneck.
  ANIM: SPIN, SWING, CRANE_SLEW/TROLLEY/HOOK (cable stretch), FLAG, SPIN_U (uSpin), VIS (uVis gate + sway).
- `kit.ts` shapes (coreBox = interior filler without top/bottom), `facade.ts` walls with real openings,
  `parts.ts` palette & parts, `signs.ts` atlas 1024×1536 (keyed cache, first-fit, overflow → invariant), `glows.ts`,
  `env.ts` (frames, checks, picks, updaters), `shaders.ts` (patterns with explicit pixel footprints, far mode,
  cutouts, lights/LED scoreboard, glows), `materials.ts` (Lambert + analytic sky reflection/sun glint;
  `?lmstandard=1` = MeshStandard for comparison; detail material collapses primitives beyond 100 m at the top of
  the vertex shader).
- Meshes (by day ~10 objects): static (52.5k tris), detail (34k, LOD, no shadow), kinetic (10.6k, DoubleSide,
  cutouts, custom depth mat), lights (4.5k), signs, glows (hidden by day), fountain water/spray/drops,
  crowd (hidden when empty), players + ball.
- Debug params (my module): `?lmskip=static,detail,kinetic,lights,signs,glows,fountain,crowd,players`,
  `?lmnokinds=<kinds>`, `?lmstandard=1`. stats(): tris, meshTris (t/v), trisBy kind, atlasFill, match score.

## Done (verified in screenshots)
Station · Town Hall (bell swings on 'hour') · fountain · plaza flagpoles · church · stadium + life (matches 15:00 &
19:30 with goals/scoreboard, training 9:30–13:30, crowd fill/sway/wave/cheer, floodlights) · TV tower (rotating
restaurant ring, chase ring, aviation lights) · construction site + tower crane loop · water tower · chimneys
(rim at plan height + 0.35; ambient plume at +0.4) · tanks · founder statue · downtown sculpture · gazebo ·
bandstand (band 16–21) · Park Café · playground (swings/see-saw/roundabout/spring riders; kids by day) ·
picnic tables · 20 market stalls (+ vendors 7:30–14:30) · school-court hoops · 4 wind turbines.

## Performance (1300×930, noon, full city; perf.mjs interleaved pairs, medians)
- Final: downtown ≈ 0–0.5 ms, park ≈ 0.73 ms, overview ≈ 0 (≤ noise). Draw calls +9 (main+shadow).
- History: 2.2 ms → (derivatives out of branches, far mode, Lambert, coreBox, tread-only stands, glows hidden by
  day) ~1.2 ms → (detail LOD + welding + packed varyings + early-out) ≤ 0.75 ms.
- Key finding: at quarter resolution the module still cost ~1.9 ms → vertex-stage bound (Lambert VS × many
  unwelded vertices × varyings on a tiled GPU), not fill. GPU timer probe: scratchpad gpuprobe.js.

## Notes for other modules
- Stadium goals at the north/south ends (match roads' painted pitch, lines 1.2 m inside the field).
- Court hoops at the x ends of the court (match roads' basketball markings).

## Best views
- station POI; town hall `27,0,10,70,0,25`; tower `27,14,4,62,35,12`; church `75,0,80,60,-30,30`
- stadium `-27.5,0,72.5,70,-20,45` @15.6 (match) / `stadium` @20.6 (night match); TV pod `39,95,-103,95,25,6`
- construction `-60,0,-35,90,30,30`, wide `-67,28,-35,120,40,18`; park `park`, close `-29,0,17,34,10,38`
- bandstand concert `-94,1.5,30,18,30,25` @18.3; statue `-45,1.5,17.5,13,15,18`; market `27,0,74,34,0,42` @10
- playground `-29.5,0,28.25,22,20,40` @10.5; industry `-140,8,-100,95,-35,28`; water tower `-171,9,-134.5,38,20,14`
- turbine `20,36,-178,75,15,12`; night town square `27,0,10,70,0,25` @21.5; station night `0,4,-134,95,190,28`
