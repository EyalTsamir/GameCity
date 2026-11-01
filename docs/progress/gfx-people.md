# gfx-people — realistic human figures (pedestrians)

Owner: **people** agent. Spec: `docs/progress/people-review.md` (§4 target spec, §7 milestones P1–P6).
Files: `src/sim/pedestrians/{figure,render,looks}.ts` + new `rig.ts`, `body.ts`, `shader.ts`, `pose.ts`,
`gait.ts`, `animate.ts`, `legacy/{figure,render}.ts`; plumbing in `src/sim/pedestrians.ts` (renderer switch,
stats) and `crowd.ts` (2 lines: stride formula → `gaitCycle()`, phase-settle only for legacy). Movement,
routes, speeds, avoidance and `invariants()` are untouched.

## Resume here (updated 2026-10-19 04:10 — FIX ROUND DONE, report sent)
* Fix round from the re-review: all three items done and verified; results in "### Fix round (re-review)" under
  "## Final report"; evidence in `shots/people/fix/`. Nothing half-done; no jobs running from me. The
  before-tree dev server (scratchpad `before/`, port 5175) was only for the comparisons and can die.
* If resumed for more: candidates are the 135° landing glide (6 cm, body yaw snaps 20°/frame), the ~1.5 KB per
  frame of three.js update-range arrays (fixed cost, not per figure), and trouser/leg interpenetration at the
  passing moment of the swing leg (not visible at ≥ 10 m).

## Toggles
* `?legacypeople` — original figures + original stride formula (frozen copies in `pedestrians/legacy/`).
* `?pedlod=0|1|2|3` forced level (3 = pin), `?hide=pedestrians` — as before. Runtime: `services.pedestrians._renderer.forceLod`.
* Tools only: `poseDebug.idle / .bench` (animate.ts) force an idle / bench variant; `gaitConfig.legacy` (rig.ts).

## Architecture (new)
* **Morph targets** (rig.ts → body.ts): one procedural builder makes every LOD four times — average man,
  woman, 7-year-old boy, heavy build — with identical topology; per-vertex deltas packed in `aMorph`
  (uvec4, 16-bit fixed). Per figure `w` (femininity), `c` (childness, from age/stature), `b` (build, from
  girth), `s` (±4 % scale) from `bodyParams(look)`; teens between, elderly `old` factor (stoop, gait). Pivots
  morph the same way (uniform table `uPedPiv`, 11 pivots × 4 targets).
* **Attributes** (14/16 slots): position, normal, aMorph, aData (bone | region | feature | tint, hem h,
  skin weight, aux) + per instance iRoot (vec4 float) + iP0–iP5 (48 pose values, 16-bit fixed pairs)
  + iC0–iC2 (12 colour words: rgb24 + garment parameter bytes, feature mask). Mesh = plain `Mesh` with
  `InstancedBufferGeometry` (no instanceMatrix), custom culling in `write()`.
* **Shader** (shader.ts): morph → parametric garments (skirt/dress/coat tail length + flare carried by the
  thighs/shins, long-hair length, hair volume for curls, ponytail swing (pose `spare2`), hat style dome/brim/visor) → FK chain leaf→pelvis
  with 2-bone LBS per joint, finger grip curl → pelvis / body pitch / root offsets → scale, yaw, world.
  Colours per region + nearest hem boundary, picked per pixel in the FS (crisp sleeves, trousers, tops,
  jacket V-front, boots, soles, vest & towel stripes). Paint (P6): per-figure garment jitter ±4 %, value
  ramp (light tops / dark undersides, darker lower legs), warmer faces; Lambert with wrap for skin/hair and a
  faint sheen for hair/shoes/bags; night: `patchLampMaterial()` (lamp light map, granted exception) + the old
  0.07 emissive lift.
* **Rig / IK** (pose.ts): JS FK mirror of the shader chain, analytic 2-bone leg IK, arm IK with pole vector
  and residual refinement (< 1 mm), grip point, chest-frame transforms.
* **Gait** (gait.ts): phase from the crowd (cycle = `gaitCycle(look, v)`, dynamic similarity from leg
  length); per leg stance (planted in world space, exact rigid rolling heel→flat→forefoot→toe on the sole
  polygon, foot heading held by an ankle yaw with analytic heading correction) or swing (heel lifts behind,
  toes up, curvature-aware landing); pelvis bob target + reach clamp, pelvis yaw/list/sway, chest
  counter-rotation, head stabilisation, arm/elbow curves, running with flight. Stand mode keeps feet planted,
  finishes the last step, re-steps on drift and turns (step-turns).
* **Poses** (animate.ts): idle variants held 6–18 s (relaxed, hands in pockets, arms crossed, hand on hip,
  hands behind back, phone, coffee cup; weights by age), weight shift; bench (5 variants: hands on thighs,
  lean forward, arm along the backrest, legs crossed, hands in lap; feet on the ground via leg IK, hips on
  the seat top, back on the backrest; reading with both hands), pram bar / cane / wave / umbrella / bags /
  angler via arm IK, sand sitting (hug knees, lean back on hands), lying (3 variants), dogs on a leash from
  the posed hand.
* **Looks** (looks.ts): calmer palettes (≈55 % neutrals, denim ≥ 35 % of trousers, ≈15 % accents) with
  the *same RNG draws* (`rngcheck.ts`: 11 970 looks, 0 mismatches) + `style` from a private RNG (hair style /
  length / volume / fringe / beard, 7 hat styles, sleeve / top / trouser hems, jacket / coat / blazer /
  hoodie, skirt / dress / coat tail, legwear, soles, boots, turtleneck, collar / tie / lapels, vest).
  `styleFromFlags()` for hand-built looks (the reviewer's lineup driver still works).
* **Renderer** (render.ts): LOD0 < 40 m, lo < 110 m, tiny < 300 m, pin beyond (930 px ref, ±3 m
  hysteresis); shadow proxy = tiny mesh for all figures < 150 m, drawn only into shadow maps
  (`intersectsFrustum` declines the live main-camera frustum); LOD0/lo/tiny/pin cast none. Blob α 0.28 with
  shadow maps. Per-member render state (LOD, gait plants) in a WeakMap; hot loops allocation-free.
  Dog: new lofted body (329 v) with trot legs, wagging tail, head bob, sit.

## Numbers
* Vertices / triangles per level (`measure.ts`): LOD0 1346 / 2203 (778 always posed, rest feature-gated:
  hidden features exit after one test), lo 458 / 748 (290 always), tiny 261 / 400 (161), pin 101 / 136 (66).
  Typical posed vertices per figure: LOD0 ≈ 900, lo ≈ 330, tiny ≈ 185, pin ≈ 80. Old: 1778 / 801 / 241.
* LOD census (renderer `write()` at 1920×1025, noon population ≈ 440, final code, `city_final2/report_final2.json`) —
  vertices main pass + shadow pass, today vs the reviewer's census of the old figures:
  square 20 m 15/24/31 (LOD0/lo/tiny) 39.3 k + 17.2 k (old 49 k + 49 k) · plaza 16 m 5/60/109: 62.7 k + 28.2 k
  (old 98 k + 98 k) · street 40 m 25.7 k + 15.9 k (old 48 k + 48 k) · beach 45 m 23.8 k + 12.5 k (old 66 k + 66 k)
  · old-town POI 66.2 k + 33.7 k (old 65–97 k + same) · overview 438 pins 44.2 k, no shadow pass (old 98 k).
* Draw calls: 4 figure levels + 1 shadow proxy + pram + dog + blob (old: 3 levels + pram + dog + blob, each
  level also in the shadow pass).
* Gait acceptance (`gaitfk.ts`, node FK of the real pose code, final 2026-10-18): walking 0.6–1.6 m/s for man /
  woman / boy / girl / teen / elderly: stance slide 0.12–0.35 cm, sole hover −0.0…+0.1 cm, knee peak 60° @1.3
  (kids 63–64°, elderly 46°), hip +32/−17°, bob 4.0 cm @1.3, cadence 109 spm @1.3, mid-swing clearance
  1.5–1.6 cm; running 2.75–3.0: slide 0.60 cm, knee 87°, flight; stop-go 0.46 cm; accel 0.34 cm; turning
  40°/s 0.80 cm (hover ≤ 0.2 cm); 90°/s ≈ 5 cm (the planted foot pivots on heel / ball beyond ±0.6 rad of
  twist — intended); standing turn 1.7 cm. Crowd-style corners (`cornerfk.ts`: rails round corners with 4
  straight segments, heading snaps followed at rate 9/s): 4-segment rail corner 2.6–4.2 cm slide, no crouch
  (bob ≤ 6 cm); instantaneous 90° snaps (bevelled dead-end turns) drag the planted foot (17–35 cm) instead
  of teleporting it. Teleported / re-placed members re-plant (moves > 1.5 m per frame, stand plants > 0.6 m off).
  Key fixes: the foot yaw turns about the vertical through the ankle (shader + fkPoint), not the tilted
  shin (that tipped the sole by up to 5 cm); plants far off the gait law are dragged, never dropped; the
  pelvis never drops more than 4.5 cm below its gait curve (an out-of-reach foot is pulled in instead).
* Corners after the fix round (2026-10-19, `cornerfk.ts` / `gaitfk.ts`; before → after): 4-segment rail 90°
  @1.3 4.15 → 1.88 cm, @0.9 2.56 → 2.23; bevelled 2-segment 90° 18.8 → 3.63; hard 90° snap @1.3 34.7 → 2.50,
  @0.9 → 2.90; 45° snap 9.4 → 1.78; 135° @1.1 → 6.12 (landing glide while the body yaws 20°/frame); 90°/s
  turning 4.7 → 1.75; 40°/s 0.85; straight walking / running unchanged (0.30 / 0.60 cm). Trailing hip extension
  −40° (sustained) → ≤ −36° for ≤ 4 frames at the sharpest corners, normal walking −16°; 1.6 m/s −28 → −25°.
  Mechanisms (gait.ts): smoothed gait root (sx/sz) that the figure is drawn at; quick re-step (0.2 s lift, only
  if it lands before toe-off); heel-raise for reach (bisection on the rolling pitch); pivots about the actual
  contact point (heel / ball / toe tip) with heel-up / toes-up pitch; early toe-off of an over-stretched trailing
  foot during double support; swing catch-up and ~30° swing cap. "stance sole … 6 cm" in cornerfk = the quick
  re-step's lift (intended).
* CPU: `computePose` ≈ 2.2 µs per figure (`bench.ts`, 150 figures 0.33 ms/frame; was 3.1 µs).
* Garbage (fix round, `bench.ts` — the tool of the 2 KB figure, now with median / 90th pct and a harness-only
  pass): median 39 B per figure-frame = exactly the harness's own 39 B (member motion), i.e. computePose ≈ 0 B
  steady; mean 120–140 B over frames 12–32 s (V8 re-optimising after the first idle variants appear), mean
  42 B (≈ 3 B net) after 100 s; per type (walk / stand / sit / pram / cane) 0–3 B. Before: ≈ 2.1 KB (and 7.8 KB
  earlier). Causes and fixes: see the helper note at the top of gait.ts (boxed doubles at un-inlined call
  boundaries, module `let` doubles, cold-branch helper calls, megamorphic keyed pose reads in render.ts).
  Later the same day: rigOf allocated a 56 B context on every call (closures of the rig build captured its
  locals) → build split out; the harness's 39 B was that → bench median now 2 B total, 16 B mean after warm-up.
* Garbage in Chrome (`tools/chrome_heapprof.mjs`, tight in-page crowd.update + renderer.write() loop at the
  square 20 m view, 12 000 warm-up steps, 12 windows of 600): 1.0–2.7 KB per write for ~20 gait-posed figures
  (+ about as many tiny / pin) = 50–140 B per gait figure including fixed per-write costs (≈ 1.5 KB of three.js
  update-range arrays re-grown after the renderer empties them); before this round 1.8–2.3 KB per gait figure.
  Fixed on the way (found with the CDP sampling heap profiler): for-of iterators and three's
  Frustum.intersectsSphere in write(), per-call closures, update-range objects, rigOf's context.
* Real-city foot slide (`tools/city_slide.mjs`: every walker shadow-posed with the build's own modules, sole
  points through fkPoint, ~10 s of sim at 1/40 s per frame, ≈ 2 400 stances per build), new vs before:
  straight stances median 0.18 / 0.18 cm, p99 2.4 / 6.0, max 15 / 46; turning 15–45° (150 / 120 stances)
  median 1.1 / 1.4, p90 3.2 / 9.1, p99 19 / 43; sharp > 45° (47 / 44) median 1.8 / 6.3, p90 4.2 / 15.8,
  max 11 / 61 cm, stances > 6 cm 2 / 24.

## Tools (shots/people/tools/)
* `node build.mjs <file.ts>` bundles + runs node checks: `measure.ts` (verts/tris per LOD and feature),
  `rngcheck.ts` (makeLook draw parity), `gaitfk.ts` (gait acceptance; `-v`, case filter), `cornerfk.ts` /
  `cornerdbg.ts` (crowd-style corners), `bench.ts` (CPU cost), `ikparity.ts`, `gaitdbg*.ts`, `turndbg.ts`, `armchk.ts` (arm IK error), `heavychk.ts`, `hairdbg.ts`, `dogchk.ts`.
* CPU previews without a browser: `preview.ts` (scenes lineupA/B, gen<seed>, gait, sit, poses, idle, bench,
  misc) → `vsmirror.ts` (JS mirror of the vertex shader) → `raster.py` (numpy rasteriser).
* Browser: `lab.html`/`lab.ts` (real renderers, no city) + `lab_driver.mjs <specs.json> <outDir>`;
  `city_driver.mjs <outDir> [query] [--legacy] [--census]` (crowd views × hours, picker check, invariants
  after a 4× sim run, LOD census via `write()`); `lineup_people.mjs` (copy of the reviewer's lineup driver);
  `run_locked.mjs <cmds.json>` (one lock ticket for several drivers).
* Fix round: `allocmicro.ts` (garbage per call of the IK / FK functions), `allocpose.ts <walk|stand|sit|pram|
  cane>` (computePose per figure type, median and warm-up blocks), `bench.ts` (MODE=walk|stand|sit|ws|wsit,
  WARM=frames), `animparity.ts` (pose parity vs `ref/animate_ref.ts`, the pre-inlining copy: 5.18 M values,
  max diff 0), `vcount.ts` (verts per LOD), `turbo_box.py <dir> <bundle> <fn,…>` (lists ChangeFloat64ToTagged /
  Call nodes per function from `node --trace-turbo --trace-turbo-path=<dir>` dumps — how the boxing sites were
  found), `inline_helpers.py` (the helper-inlining transformer, exact a + (b − a)·t form);
  browser: `corner_driver.mjs <outDir> [corners] [frames]` (predicts kerb corners from party rails, slows the
  sim, follows the walker with crops), `strips.py`, `city_slide.mjs <out.json> [s]` (real-city stance slide per
  build: shadow-poses every walker with that build's modules + fkPoint, bins by heading change),
  `gc_driver.mjs <out.json>` (garbage of renderer.write() in a tight in-page loop, performance.memory).

## Status
- [x] P1 data model + proportions — morph rig, 4 targets, packed attributes, shadow proxy, palette.
- [x] P2 gait — node acceptance above.
- [x] P3 sculpted body + skinning — lofted torso (superellipse, bust, shoulder blades), head with jaw/nose/
      ears, hands with thumb, shoe last; LBS per joint; CPU previews checked (gaps when seated/waving fixed).
- [x] P4 clothing & hair — wardrobes + parametric hems/tails/hair/hats (CPU previews `cpu_sheet*.png`).
- [x] P5 poses — idle variants, bench variants, pram IK, cane, wave, reading, sand, lying.
- [x] P6 shading + polish — lamp light, value ramp, wrap/sheen, blob, LOD hysteresis + 0.4 s dithered
      cross-fade (complementary Bayer cells; skipped on camera jumps, `renderer.xfade` off for tools), dog upgrade.
- [x] GPU verification round 1 (2026-10-17 23:00): shaders compile, console clean, full-city invariants empty
      after a 4× run, pickers 25/25, LOD census (below). Evidence: `shots/people/lab1/` (lab), `lineup/` (reviewer
      lineup re-shot), `city_new/` vs `city_legacy/` (same crowd, `?legacypeople`).
- [x] Visual iteration rounds 2–3 (2026-10-18): fixes from round 1 — stale foot plants after a member is moved
      (teleport / far-plant snap), lampshade skirts (flare halved, front drapes over the forward thigh, seated hem
      follows the thighs), shadow proxy shrunk 1 cm (jagged self-shadow bands on hems), lower hairline + fuller
      hair, crotch ring raised, rounder shoe toes, tucked shoulder caps, coarse beard at lo, stronger eye band,
      backpack against the lumbar curve, dog sits on its haunches. Runs: `lab2/`, `lineup2/`, `city2/`.
      Round 2 showed the real cause of the open-fronted skirts: the parametric skirt rings share one rest height,
      so their quads were degenerate at rest and got random winding (front panels back-face culled; the dark
      "hoop" was the hem lining seen through the gap) — buildTail now bridges with stand-in heights
      (`tools/tailwind.ts` checks the winding). Round 3: `lab3/` — standing skirts now closed A-lines.
- [x] Round 4 (2026-10-18), verified in `lab4/`: skirt/brim normals came from the degenerate rest geometry
      (dark gradient on the lower skirt, black brims) → builder stand-in positions for normals
      (`MeshBuilder.standIn`, `withStandIns`; `tools/tailnrm.ts`) — skirts and fedora brims now evenly lit; the
      hem lining was a sliver z-fighting the skirt → flat ring 10 % inside at the hem, facing down — no flicker,
      no "hoop"; seated skirts follow the thighs fully (k = 1 for the parametric rings, 0.45 at the hip ring) —
      laps covered to the knee from front / side / ¾ (`lab4/sit_*`, `tools/sitskirt.ts`); briefcase handle /
      cane crook were zero-width sticks (limbFrame along Z) — crook visible, handle inside the fist
      (`lab4/B_heads`, `A_case`, `tools/windchk.ts`).
- [x] LOD budgets (2026-10-18): lo 485 → 458 (no hem lining, brim or umbrella underside at lo: seen from above
      from 40 m on), pin 109 → 101 total / 66 always / ≈ 71 for a figure with hair (no neck: the head sits on the
      torso, sub-pixel at > 300 m). No visible change in `lab4/lod*`.

## Evidence (final, 2026-10-18)
* Before/after sheets in `shots/people/`: `sheet_lineups.png` (lineups A/B front/side/¾), `sheet_gait.png` (walk,
  skirt walk, jog, elderly + cane), `sheet_poses.png` (bench ¾/front, ground poses, dog + pram),
  `sheet_distance_lod.png` (16 / 40 m, LOD0 / lo / tiny at 9 m) — after = `lineup4/`, before =
  `shots/people-review/lineup/`; `sheet_city_day.png`, `sheet_city_night.png` — after = `city_final2/`, before =
  `city_final_legacy/` (same crowd with `?legacypeople`); lamp light on figures: `city_final2/sqwide_21h5_lampzoom.png`.
* Full city (final code): console clean, invariants `{}` after a 4× run, pickers 25/25 (earlier run), census above.

## Open issues / next
* Sharp crowd corners still drag the planted foot a few cm (rail corners) and more at bevelled 90° snaps.
* lo 458 vertices total (spec ≤ ~450; ~330 posed for a typical figure); pin 101 total / ≈ 71 typical (spec ≈ 70).
* Faces stay mannequin-like at < 8 m (nose, chin, soft eye band only) — fine at the 12–60 m viewing range.
* No heels / headscarves / braids yet.

## Perf variants for lead
* Variants (same query base, people-dense views — square `27,0,17,20,30,18` and plaza `0,0,-65,16,200,16`, 12:00):
  `;legacypeople;hide=pedestrians` — new figures vs the old ones vs no people drawn (simulation still runs).
  Optional level isolation: `;pedlod=1;pedlod=2` (all figures forced to lo / tiny).

## Requests to other areas
* none.

## Changes outside my area
* `patchLampMaterial()` call on the people / pram / dog materials (granted exception, render.ts).

## Final report
People (realistic pedestrians) — done. Files: `src/sim/pedestrians/{figure,render,looks}.ts` + new `rig`, `body`,
`shader`, `pose`, `gait`, `animate`, `legacy/`; plumbing in `pedestrians.ts` and two lines in `crowd.ts` (stride →
`gaitCycle`). Movement and invariants untouched. Toggles: `?legacypeople` (old figures), `?pedlod=0–3`.

* P1 morph-target body (man/woman/child/heavy), packed per-instance data (14/16 slots), cheap shadow proxy,
  calmer palettes (same RNG draws).
* P2 planted-foot gait: heel-to-toe roll, vertical-axis foot yaw, pelvis/torso/arms, running with flight,
  stop/turn steps, re-planting after teleports.
* P3 lofted body, face, hands with thumb, shoes, per-joint skinning.
* P4 parametric hems; skirts/dresses/coats drape over the thighs (seated too); hair length/volume, swinging
  ponytail, 7 hat styles.
* P5 idle variants, 5 bench poses, pram/cane/wave/reading/sand/lying via arm/leg IK.
* P6 lamp light, painted value ramp, wrap/sheen, 0.4 s dithered LOD cross-fade, new dog.

Four browser iteration rounds fixed: stale foot plants after moves, inside-out/dark skirts and brims (degenerate
rest geometry → stand-in winding and normals), proxy self-shadow bands, hairline, crotch, shoes, shoulders, lo
beard, eye band, backpack, sitting dog, zero-width handle/crook.

Numbers: vertices per level 1346/458/261/101 (typical posed ≈ 900/330/185/71). Census vs old (main + shadow):
square 20 m 39k + 17k (49k + 49k), plaza 63k + 28k (98k + 98k), overview 44k (98k). Draw calls: 4 levels + 1 proxy
+ pram/dog/blob. Gait (node FK): walking slide 0.12–0.35 cm, hover ≤ 0.1 cm, knee 60°, running 0.60 cm, 40°/s
turns 0.8 cm. Full city: console clean, invariants `{}`, pickers 25/25. CPU ≈ 3 µs/figure, ≈ 2 KB garbage per
figure-frame.

Perf: SwiftShader A/B inconclusive (noise); variants for the consolidated run: `;legacypeople;hide=pedestrians`
(optional `;pedlod=1;pedlod=2`).

Evidence: `shots/people/sheet_{lineups,gait,poses,distance_lod,city_day,city_night}.png`.

Open: route corners drag a planted foot 2–4 cm (bevelled 90° snaps more); faces mannequin-like under 8 m; no
heels/headscarves/braids; lo 458 vs ~450 target.

### Fix round (re-review)
All three items from the re-review are done and verified. Files touched: `gait.ts`, `animate.ts`, `pose.ts`, `render.ts`,
`rig.ts`, `body.ts`, `shader.ts`, `looks.ts`, plus one plumbing line in `crowd.ts` (`gaitCycle` → `gaitCycleOf`, same
formula). Movement, routes and `invariants()` are unchanged.

1. **Corners** (`gait.ts`; `render.ts` draws at the gait's smoothed root). New mechanisms:
   * a smoothed gait root;
   * a quick 0.2 s re-step instead of dragging a foot, used only if it lands before toe-off;
   * a heel raise onto ball/toe for reach, with exact rolling;
   * pivots about the actual contact point (heel/ball/toe tip) with the heel or toes lifted;
   * an early toe-off of an over-stretched trailing foot during double support;
   * a swing catch-up and a ~30° swing cap.

   Node checks, before → after:
   * rail 90° corners: 4.15 → 1.88 cm and 2.56 → 2.23 cm
   * bevelled 90°: 18.8 → 3.63 cm
   * hard 90° snap: 34.7 → 2.50 cm (2.90 at 0.9 m/s)
   * 45° snap: 9.4 → 1.78 cm
   * 90°/s turning: 4.7 → 1.75 cm
   * straight walking and running: unchanged
   * trailing hip extension: was −40° sustained, now ≤ −36° for at most 4 frames (normal walking −16°)
   * still outside target: the 135° corner at 6.1 cm

   Real city (`city_slide.mjs`, every walker, about 2,400 stances per build), new vs before:
   * sharp turns (> 45°): median 1.8 vs 6.3 cm, p90 4.2 vs 15.8 cm, max 11 vs 61 cm
   * 15–45° turns: median 1.1 vs 1.4 cm, p90 3.2 vs 9.1 cm

   City capture at 22 m (`fix/sheet_corners_before_new.png`, same walkers at the same corners): the 110° kerb corner
   loses the over-long split stride and the flung trailing leg.
2. **Garbage**. Causes: doubles boxed at call boundaries that are not inlined, double writes to module-level `let`
   variables, helper calls in cold branches (TurboFan never inlines below `--min-inlining-frequency`), megamorphic
   keyed pose reads, and per-call contexts and closures (rigOf).

   Fixes: input fields and typed-array slots instead of arguments, `legIKa`/`armIKa`/`computePoseA` entry points (old
   signatures kept as wrappers), helpers written out inline, `packPose`, and matrices written directly.
   `animparity.ts` confirms poses are bit-identical (5.18 M values).

   Results:
   * `bench.ts`: median 2 B per figure-frame (was ≈ 2.1 KB); mean 16 B after warm-up.
   * Chrome, `renderer.write()` loop: 50–140 B per gait figure, including ≈ 1.5 KB per frame of fixed three.js
     update-range cost (before: 1.8–2.3 KB).
   * Also fixed: a latent bug where an initial scratch value leaked into the first `planWalk`.
3. **Trousers and shoes**, with no new vertices (vertex counts per level still 1346/458/261/101).
   * New `Style.trouserFit`: 0 for leggings, 0.6 jeans, 0.8 default, 0.85 suits, 1 workwear, 0.95 shorts. It is
     derived from the outfit with no extra RNG draw.
   * The vertex shader pushes leg vertices from mid-thigh down out to a straight drape: 6.1 cm at the ankle, 6.8 at
     the knee.
   * The toe box is taller and wider, and LOD0 uses its redundant ring 3 for the toe instead.
   * At 10 m (`fix/legs_lineup{A,B}_{34,front}_10m_before_after.png`): trousers read as straight trouser legs, jeans
     are straighter, shorts are looser, and toes are blunter. Dog, pram and sitting checks are in `fix/lineup_new2/`.

Typecheck is clean; the console is clean and `invariants()` returns `{}` (city shot and corner runs). Tools are listed
under Tools.
