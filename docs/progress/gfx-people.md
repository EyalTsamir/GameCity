# gfx-people — realistic human figures (pedestrians)

Owner: **people** agent. Spec: `docs/progress/people-review.md` (§4 target spec, §7 milestones P1–P6).
Files: `src/sim/pedestrians/{figure,render,looks}.ts` + new `rig.ts`, `body.ts`, `shader.ts`, `pose.ts`,
`gait.ts`, `animate.ts`, `legacy/{figure,render}.ts`; plumbing in `src/sim/pedestrians.ts` (renderer switch)
and `crowd.ts` (2 lines: stride formula → `gaitCycle()`, phase-settle only for legacy).

## Toggles
* `?legacypeople` — original figures + original stride formula (frozen copies in `pedestrians/legacy/`).
* `?pedlod=0|1|2` (forced level), `?hide=pedestrians` — as before. Runtime: `services.pedestrians._renderer.forceLod`.

## Architecture (new)
* **Morph targets** (rig.ts → body.ts): one procedural builder makes every LOD four times — average man,
  woman, 7-year-old boy, heavy build — with identical topology; per-vertex deltas packed in `aMorph`
  (uvec4, 16-bit fixed). Per figure `w` (femininity), `c` (childness, from age), `b` (build, from girth),
  `s` (±4 % scale) from `bodyParams(look)`. Pivots morph the same way (uniform table `uPedPiv`).
* **Attributes** (14/16 slots): position, normal, aMorph, aData (bone | region | feature | tint, hem h,
  skin weight, aux) + per instance iRoot (vec4 float) + iP0–iP5 (48 pose values, 16-bit fixed pairs)
  + iC0–iC2 (12 colour words: rgb24 + garment parameter bytes, feature mask). Mesh is a plain `Mesh` with
  `InstancedBufferGeometry` (no instanceMatrix).
* **Shader** (shader.ts): morph → parametric garments (skirt/coat tail length+flare, long-hair length, hat
  style dome/brim/visor) → FK chain leaf→pelvis with 2-bone LBS per joint → pelvis / body pitch / root
  offsets → scale, yaw, world. Colours resolved per region + nearest hem boundary, picked per pixel in
  the FS (crisp sleeves/trousers/tops, vest & towel stripes). Night: `patchLampMaterial()` (lamp map).
* **Gait** (gait.ts): phase from the crowd (cycle = `gaitCycle(look, v)`, dynamic similarity from hip
  height); per leg stance (planted in world space, exact rigid rolling heel→flat→forefoot→toe on the
  sole polygon, foot heading held by an ankle yaw with an analytic heading correction) or swing (heel
  lifts behind, toes up, curvature-aware landing); pelvis bob from a target curve + reach clamp, pelvis
  yaw/list/sway, chest counter-rotation, head stabilisation, arm/elbow curves, running with flight.
  Stand mode keeps feet planted, finishes the last step, re-steps on drift and turns (step-turns);
  walk/stand foot targets are blended in task space, then 2-bone IK + abduction.
* **Looks** (looks.ts): calmer palettes (≈55 % neutrals, denim ≥ 35 % of trousers, ≈15 % accents) with
  the *same RNG draws* (checked: `shots/people/tools/rngcheck.ts`, 11 970 looks, 0 mismatches) + `style`
  (hair style/length/fringe/beard, hat style, sleeve/top/trouser hems, jacket/coat/blazer/hoodie,
  skirt/dress/coat tail, legwear, soles, boots, turtleneck, vest) from a private RNG seeded by a hash of
  the main draws. `styleFromFlags()` for hand-built looks (reviewer's lineup driver still works).
* **Renderer** (render.ts): LOD0 < 40 m, lo < 110 m, tiny beyond (930 px ref, ±3 m hysteresis);
  shadow proxy = tiny mesh, all figures < 150 m, shadow pass only (LOD0/lo/tiny cast none); blob α 0.28
  with shadow maps; per-member render state (LOD, gait plants) in a WeakMap.

## Tools (shots/people/tools/)
* `node build.mjs <file.ts>` bundles + runs node checks: `measure.ts` (verts/tris per LOD and feature),
  `rngcheck.ts` (makeLook draw parity vs baseline), `gaitfk.ts` (gait acceptance: per-stance slide, sole
  hover/sink, knee/hip peaks, bob, cadence, mid-swing clearance; `-v` per-frame), `gaitdbg*.ts`, `turndbg.ts`.
* `lab.html` + `lab.ts` (served by the dev server at /shots/people/tools/lab.html) and
  `lab_driver.mjs <specs.json> <outDir>`: real renderers/shaders without the city (lineups, gait strips,
  bench, poses, forced LODs, legacy A/B).

## Status
- [x] P1 data model + proportions — code complete (morph rig, 4 targets, packed attributes, shadow proxy,
      palette). Mesh counts: LOD0 1322 verts / 2179 tris, lo 462 / 746, tiny 250 / 378. Visual check pending.
- [x] P2 gait — node acceptance (gaitfk.ts, 2026-10-17):
      walking 0.6–1.6 m/s, man/woman/boy/girl/teen/elderly: stance slide 0.18–0.70 cm, sole −0.0…+0.3 cm,
      knee peak 60° (1.3 m/s; kids 64°, elderly 46°), hip +32/−17°, bob 4.0 cm @1.3, cadence 109 spm;
      running 2.75–3.0: slide ≈1.1 cm, knee 87°, flight phase; stop-go 0.5 cm; accel 0.66 cm;
      tight turns (40–90°/s) 1.5–2.3 cm (open). Visual strips pending.
- [ ] P3 sculpted body + skinning (body.ts already lofted/skinned; refine after visual review)
- [ ] P4 clothing & hair (geometry + shader parameters in place; wardrobes in looks.ts)
- [ ] P5 poses (idle variants, bench fixes, pram IK, cane, bags)
- [ ] P6 shading + polish (lamp light integrated via patchLampMaterial; ramp/sheen/LOD fade pending)

## Open issues / next
* Visual verification of everything (lab + city) — browser lock is heavily contended.
* Turning gait slide at very tight turns; running slide ≈1.1 cm.

## Changes outside my area
* none (crowd.ts lines are pose plumbing as allowed).
