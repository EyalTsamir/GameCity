# gfx-people — realistic human figures (pedestrians)

Owner: **people** agent. Spec: `docs/progress/people-review.md` (§4 target spec, §7 milestones P1–P6).
Files: `src/sim/pedestrians/{figure,render,looks}.ts` + new `rig.ts`, `body.ts`, `shader.ts`, `pose.ts`,
`gait.ts`, `animate.ts`, `legacy/{figure,render}.ts`; plumbing in `src/sim/pedestrians.ts` (renderer switch,
stats) and `crowd.ts` (2 lines: stride formula → `gaitCycle()`, phase-settle only for legacy). Movement,
routes, speeds, avoidance and `invariants()` are untouched.

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
* LOD census (renderer `write()` at 1920×1025, noon population 442, `city_new/report_night.json`) — vertices
  main pass + shadow pass, today vs the reviewer's census of the old figures:
  square 20 m 17/30/29 (LOD0/lo/tiny) 44.7 k + 19.3 k (old 49 k + 49 k) · plaza 16 m 8/55/106: 64.5 k + 26.9 k
  (old 98 k + 98 k) · street 40 m 24.6 k + 14.4 k (old 48 k + 48 k) · beach 45 m 25.1 k + 13.8 k (old 66 k + 66 k)
  · old-town POI 54.5 k + 27.7 k · park POI 44.7 k + 30.3 k · overview 442 pins 48.2 k, no shadow (old 98 k).
* Draw calls: 4 figure levels + 1 shadow proxy + pram + dog + blob (old: 3 levels + pram + dog + blob, each
  level also in the shadow pass).
* Gait acceptance (`gaitfk.ts`, node FK of the real pose code, 2026-10-17 late): walking 0.6–1.6 m/s for man /
  woman / boy / girl / teen / elderly: stance slide 0.12–0.42 cm, sole hover −0.0…+0.1 cm, knee peak 60° @1.3
  (kids 63–64°, elderly 46°), hip +32/−17°, bob 4.0 cm @1.3, cadence 109 spm @1.3, mid-swing clearance
  1.5–1.6 cm; running 2.75–3.0: slide 0.60 cm, knee 87°, flight; stop-go 0.46 cm; accel 0.34 cm; turning
  40°/s 0.82 cm (hover ≤ 0.2 cm); 90°/s ≈ 5 cm (the planted foot pivots on heel / ball beyond ±0.6 rad of
  twist — intended); standing turn 1.6 cm. Crowd-style corners (`cornerfk.ts`: rails round corners with 4
  straight segments, heading snaps followed at rate 9/s): 4-segment rail corner 2.6–4.2 cm slide, no crouch
  (bob ≤ 6 cm); instantaneous 90° snaps (bevelled dead-end turns) drag the planted foot (17–35 cm) instead
  of teleporting it.
  Key fixes: the foot yaw turns about the vertical through the ankle (shader + fkPoint), not the tilted
  shin (that tipped the sole by up to 5 cm); plants far off the gait law are dragged, never dropped; the
  pelvis never drops more than 4.5 cm below its gait curve (an out-of-reach foot is pulled in instead).
* CPU: `computePose` ≈ 3.1 µs per figure with gait state on this (loaded) container (`bench.ts`, 150 figures
  0.46 ms/frame). Garbage ≈ 2 KB per figure-frame (boxed doubles in the big pose functions; was 7.8 KB: the
  pose objects were dictionary-mode — now built from literals — plus Object.assign / Math.hypot / per-call
  vectors in the arm IK, whose rest-pose constants are now cached per rig).

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
