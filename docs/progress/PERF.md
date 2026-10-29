# PERF — local GPU round (Adreno X1-45, 1920x1025): smooth, no hitches

Branch `claude/pensive-gates-bim12i`. Budget file: `perf-results.txt` (repo root). Earlier perf rounds are kept below
("Earlier round: render-performance pass").

## Resume here (updated 2026-10-29 ~19:00 — written so a context reset loses nothing)
**Task (user, Hebrew prompt docs/progress/NEXT-PROMPT-PERF.md):** smooth city on the Adreno, no freezes, zero/minimal
quality loss; measure first; perf-results.txt = budget; fix by impact; prove each fix (same-run A/B, golden.sh +
street-level shots, clean console, invariants {}, typecheck); commit+push after each improvement; this log; final report
IN HEBREW: before/after table per view (mean frame time, outlier frames, freezes), what was fixed, what cost quality,
what is open. Visible trade-offs only behind a switch, with their measured price.

**Pushed (measured):** c45a8c9 batch 1, b52144b batch 2, 237a97c batch 3 (see Log 3–5).
**Committed locally, not yet measured/pushed:** fd69368 (trees slot 2.5, big landmarks own meshes), c0399b9 (fine
furniture cells), f594b6a (parallel warm-up compileAsync + garbage fixes: wind, shadowFit, crowd director loops),
f3b0b78 (census skips crowd picker), cf30424 (departure board refresh only < 45 m — a minimal visible change: the
board keeps its last state beyond 45 m where its text is unreadable; ?fps=30 optional cap), 5274c61 (ped layer names,
?pednear=far A/B). Push each once its A/B shows no regression: `git push origin <sha>:claude/pensive-gates-bim12i`.

**Frozen copies** (scratchpad worktrees, each `node node_modules/vite/bin/vite.js --config vite.base.config.mjs`):
base 8718d0f :5174 · cand2 b52144b :5176 · cand4 c0399b9 :5178 · cand5 f594b6a :5179 · cand6 5274c61 :5180
(cand1 :5175 and cand3 :5177 retired). Scratchpad = C:/Users/eyalt/AppData/Local/Temp/claude/C--Users-eyalt--claude-
spares-spare-Iu4xkp/edff2af5-8a31-4305-8fd4-d223bad6e749/scratchpad. Outputs: shots/perf2/*.txt|json (gitignored).
**Queued when written:** ab2_sw (cand2 drawsort=0 / vehfd=1), ab4_c4 (cand4 perf), boot_c5 + hitch_c5 + alloc_c5
(queue9), retained_c5 (JS heap after boot ~730 MB: who holds it), progprobe_c5 (materials re-deriving programs/frame).

**Current numbers (ms/frame uncapped, 12 h; orig → cand3):** overview 69.7 → 48.6, street 54.2 → 46.8, market 58.8 →
51.5, harbour 65.0 → 48.3, platform 38.4 → 31.6 (21.5 h similar: 72.7→52.6, 55.6→47.2, 60.9→48.5, 69.3→52.9, 44.6→35.6).
Stutter: no shader compiles mid-run any more (hitch_new1); boot was 59 s = 9 s modules + 50 s serial compile.

**Next, in order:**
1. Read ab4_c4 / boot_c5 / hitch_c5 / alloc_c5 / retained_c5 / progprobe_c5; push what is proven.
2. Market crowd 10.7 ms + landmarks 10 ms (cand3 hide A/B): measure cand6 with `--targets "peds-near;peds-close;
   peds-far;..."` and perf variant `pednear=far` (upper bound of a leaner near program; that variant itself is NOT
   shippable — near faces are ~20 px). Landmarks are vertex-bound (half-res ratio 1.3) → culling, not shading.
3. Facades: remaining cost is visible detail (interiors 4–5 ms, bhOpp 3.7, reveal 2.0, glassvar 1.9 at street) →
   price the LOD option (uDetailPx 0.15/0.4 and 0.1/0.25: hideprof js: targets, shots/perf2/lod_targets.txt) and
   offer it as a switch (+ maybe an adaptive-ladder step before the resolution drops), not as a default.
4. Remaining garbage (poses / crowd step paths: V8 boxing, lower yield), JS heap size.
5. Final verification on the last candidate: golden.sh (GOLDEN_URL), streetset.sh <url> <tag> base, hitch.mjs
   (vsync, adaptive on), soak.mjs 4 min x4, console/invariants (note: base also reports intermittent pedestrian
   'overlapping' invariants — pre-existing), typecheck, `npm run build` + boot of dist/index.html; perf-results.txt
   "after" section; final Hebrew report (docs/progress/PERF-REPORT.md + chat).

## Tools (new this round, all in scripts/, all lock-serialised)
- `perf.mjs --views "a;name=x,y,z,d,yaw,pitch" --hours 12,21.5 --gpu 1` — uncapped ms/frame for several views in ONE
  page load, plus per-pass GPU ms from timer queries (shadow / scene / refl = ctx.scene with another camera / post).
- `drawprof.mjs` — every main-view draw call wrapped in a TIME_ELAPSED query, ranked (read the ranking, not the sum:
  on this tiler ~10–20 % of the scene pass is not attributable to single draws).
- `hideprof.mjs` — marginal cost by hiding a target at runtime (object / name prefix, or `js:label=apply|restore`
  code for a uniform A/B): the drop of the whole frame incl. shadow casting and early-z effects.
- `hitch.mjs` — what a viewer sees with vsync: every frame interval per view x hour (boot, arrival after a camera cut,
  steady, `--fly s` camera flights): mean / p99 / max, jank > 25 ms, hitch > 50 ms, freeze > 100 ms, long tasks,
  GC drops, allocation rate, shader programs compiled during the window (names).
- `soak.mjs` now also records the frame intervals per sample window (same counters).
- `framerec.mjs` — the shared in-page instruments.

## Views
overview (POI) · street = `5,1.5,-65,9,0,6` (downtown at eye level) · market = `27.5,1,78.5,16,200,28` ·
harbor (POI) · platform = `-10,1.4,-146.3,6,60,8` (station platform, eye level); 12:00 and 21:30.

## Log

### 1. Baseline (8718d0f, AC power, other apps closed) → perf-results.txt
- 37–73 ms/frame uncapped (14–27 fps) in the five views; GPU-bound everywhere (JS 5–9 ms with vsync).
- Scene pass 29–76 ms of it; post 5–6, shadow 2–3, water reflection 0.7–4.2. Half resolution halves the scene pass
  → ~70 % per-pixel (huge uber-shaders over big screen areas), ~30 % geometry (2.7–3.0 M main-view tris).
- Per-draw ranking (drawprof): land-ground 14 ms (overview), buildings-shell 5–13 ms (all views, 3.9 k tris → pure
  fragment), pedestrians 5–7 ms (overview pins = vertex; market near figures), land-trees-far 6 ms, landmarks static
  + detail 5.5 ms in EVERY view (685 k tris in two city-wide meshes: never culled), hardscape 2–8 ms, water 4 ms.
- `;nooccupants` changes nothing measurable — but it does not remove the unconditional `gl_FragDepth` write either.
- Stutter: shaders compile on first draw (no warm-up): 1.87 s freeze arriving at street level (8 programs incl. DOF
  passes, grass blades), 0.78 s at night (night market, glows, beam), 0.42 s market, 0.98 s boot, 0.46 s / 0.26 s in
  flights; at dusk in the soak 0.3 / 0.49 s. JS allocates 6.5–20 MB/s (≈1.4 MB/frame) → 245 GC drops per game day.
- Adaptive quality cannot help: it walks to refl-low / grass-0.7 and stays (each step itself a hitch).
- hideprof (hiding at runtime) turned out too noisy here (±4 ms: GPU clocks follow the load) — use it only for
  the big items or runtime uniform A/B with long samples; confirm every fix with perf.mjs A/B on frozen copies.


### 2. Facade shader A/B (runtime uniforms, hideprof js: targets, 4 s samples, candidate c45a8c9)
| drop when off (ms) | street 12 h (58.5) | market (62.3) | overview (76.5) |
|---|---|---|---|
| whole buildings-shell hidden | 18.6 | 13.4 | 12.3 |
| uDetail = 0 (interiors, opposite-row reflections, frames…) | 11.6 | 2.9 | 5.5 |
| uDetail = 0.4 (the 'low' tier) | 4.8 | 1.8 | 5.8 |
| uWinRefl (bhOpp: the street mirrored per pane) | 3.7 | 1.9 | 0.3 |
| uWinDepth (reveal / sill ray-trace) | 2.0 | 0 | 0.7 |
| uGlassVar | 1.9 | 2.1 | 1.9 |
| uWallRelief / uPlinth / uWear | 0.9 / 0 / ±3 noise | noise | noise |
| traffic hidden (for the gl_FragDepth question) | 3.5 | 1.0 | 4.6 (its draws sum ≈ 2.5) |
- Near detail is ALU-bound (skipping the branches removes it) → exact early-outs / LOD fades help, a register-light
  far program would not be needed for that part.
- At the market the shell costs 13.4 ms but its detail only 2.9: the rest is base wall shading of pixels that end up
  hidden — the city-wide merged meshes all sit at the origin, tie in three's depth sort and draw in creation order
  (facades / ground before the stalls, crowd, landmarks, vehicles in front of them) → fix 3 (draw order).
- The window-depth / interior LOD thresholds are in window-bay pixels (reveal on below ~5 px per bay ≈ 1 km away at
  1025 px), so the overview runs the near path almost everywhere.

### 3. Fix batch 1 — c45a8c9 (pushed): warm-up, landmark cells, far pedestrian program
Same-run A/B, original (5174) vs candidate (5175), perf.mjs uncapped, 1920x1025, ms/frame:
| view | 12 h before → after | 21.5 h before → after |
|---|---|---|
| overview | 69.7 → 61.1 (−8.6) | 72.7 → 66.3 (−6.4) |
| street | 54.2 → 50.9 (−3.3) | 55.6 → 50.9 (−4.7) |
| market | 58.8 → 58.9 (0) | 60.9 → 59.4 (−1.5) |
| harbor | 65.0 → 57.8 (−7.3) | 69.3 → 63.0 (−6.3) |
| platform | 38.4 → 34.0 (−4.4) | 44.6 → 41.2 (−3.5) |
Main-view triangles −0.4…−0.9 M, draw calls +4…+11 (landmark cells). Re-measured later: within ±1 ms.
Experiments on the candidate (overview / market, 12 h): constant land albedo −13.7 / −1.0 ms (the land
albedo function itself is the cost, not its lighting); constant far-tree colour −1.2 / 0 (the trees cost
raster / overdraw, not shading → sort them); `pedfar=0` (full program on tiny / pin) +3.8 / +0.6.

### 4. Fix batch 2 — b52144b (pushed): opaque draw order, vehicle far LODs, exact early-outs
Same-run A/B (original 5174 / cand1 5175 / cand2 5176), ms/frame uncapped:
| view | orig 12 h | cand1 | cand2 | orig 21.5 h | cand1 | cand2 |
|---|---|---|---|---|---|---|
| overview | 69.7 | 62.7 | 52.4 | 72.7 | 66.3 | 55.7 |
| street | 54.2 | 50.0 | 47.1 | 55.6 | 51.3 | 48.3 |
| market | 58.8 | 58.6 | 52.0 | 60.9 | 59.1 | 49.6 |
| harbor | 65.0 | 57.6 | 48.3 | 69.3 | 63.6 | 52.7 |
| platform | 38.4 | 34.0 | 31.5 | 44.6 | 38.7 | 36.4 |
- lateDraws (main.ts): the merged city meshes tie at the origin in three's depth sort and drew in creation order:
  facades / roads / ground first, then the stalls, crowd, vehicles, trees covering them. Market hardscape 6.2 → 2.0 ms,
  market shell 8.1 → 6.1, street shell 12.2 → 9.3 (drawprof). Side effect found: the far impostor trees then
  drew before the facades (street 0.9 → 2.9 ms) → own slot 2.5 (commit fd69368).
- Land sections after it (exp copy, uLandCut A/B): fields 2.2, banks/sand/rock 2.0, meadow detail 0.1, forest ≈ 0 ms
  in the overview — the 14 ms of the baseline were mostly the sea floor (now an exact early return) and hidden pixels.

- Attribution of batch 2 (cand2 with one switch reverted, 12 h, ms/frame): `drawsort=0` +4.2 overview, +3.4 street,
  +6.2 market, +8.0 harbour, +1.0 platform; `vehfd=1` (gl_FragDepth on every vehicle LOD) +0.8 / +1.3 / ±noise /
  +1.5 / +0.2 → the known suspect was worth ~1 ms; the rest of the batch is the sea-bed early return.

### 5. Batch 3 — a200a65 / 0726126 / 237a97c (pushed): far trees near→far, facade chunks, warm-up visibility pin
Same run, cand2 → cand3 (ms/frame): overview 52.4 → 48.6 (12 h), 55.7 → 52.6 (21.5 h) = the tree sort; street −0.3 /
−1.1, market −0.5 / −1.0, harbour / platform ±0.2. The facade chunks drawn nearest first gain little: the shell's cost
is the visible facade pixels (interiors ~4–5 ms, bhOpp 3.7, reveal 2.0, glass variation 1.9 at street level), not
buildings hidden behind buildings → further facade savings are visible trade-offs (priced switches).
Boot (bootprobe.mjs, fresh profile, cand2): modules 9 s, warm-up 50 s for 135 programs (≈ 0.35 s each, serial);
without warm-up the first frame comes at 64 s anyway (it compiles 107 programs) → f594b6a compiles in parallel
(compileAsync on a 1x1 linear target) before the warm-up frame. Allocation profile (original, street): 1.48 MB of
garbage per frame — crowd director for…of scans, shadowFit literals / Math.hypot, wind table, census pickers, poses.

### 6. Batch 4 — fd69368 / c0399b9 (pushed): far trees slot 2.5, big landmarks own meshes, fine furniture cells
cand3 → cand4 (ms/frame, 12 h / 21.5 h): overview +0.7 / −1.9, street −2.2 / +0.3, market −1.7 / +1.3, harbour −0.4 /
−0.2, platform −1.3 / +0.1 — small, ±1.5 ms noise; triangles unchanged (4.24 M overview): at street level the
furniture / landmark cells behind the buildings are still inside the view frustum — the missing piece is occlusion,
which three does not do (a home-made ray test against the lot boxes would pop: rejected). +10…19 draw calls.

### 7. Boot / heap (cand5 f594b6a)
- bootprobe (fresh profile): first frame 36.9 s with the parallel warm-up (warm-up 27.1 s, 138 programs) vs 59.2 s
  serial (cand2) and 54.2 s without a warm-up (then a 943 ms freeze in the first seconds). Modules build in ~9 s.
- allocprof --retained: the sampler attributes 58 MB of the 743 MB JS heap (builder arrays kept after building:
  roads 10.8, harbour 3.7, night market 3.4, winRec 1.7 MB…); the rest is outside its view — left as is (not a
  frame-time problem).

---

# Earlier round: render-performance pass


Owner: graphics perf engineer (render side of traffic, pedestrians, buildings). Sim logic untouched.

## Status
- [ ] baseline measurements (perf.mjs, 3 views) + reference screenshots (shots/perf/ref_*.png)
- [ ] traffic optimisations
- [ ] pedestrian optimisations
- [ ] buildings (second priority)

## Method
Stable comparison base (other modules being built in parallel are skipped):
`S=skip=roads,vegetation,props,landmarks,harbor,rail,boats,ambient`
(main.ts reads only the FIRST `skip=` param, so every variant repeats the whole list.)

## Baseline (before any change) — base S, noon, 1300x930, ms/frame uncapped
| view | all | skip traffic | skip peds | skip both |
|---|---|---|---|---|
| downtown | 16.46 ms · 1.47 M tris · 70 dc | 9.85 · 0.55 M · 51 | 15.77 · 1.40 M · 65 | 9.78 · 0.48 M · 46 |
| overview | 17.27 · 1.67 M · 70 | 11.24 · 0.75 M · 51 | 15.65 · 1.40 M · 66 | 9.69 · 0.48 M · 47 |
| junction 0,0,-65,60,30,45 | 14.73 · 1.42 M · 72 | 8.90 · 0.50 M · 53 | 14.31 · 1.40 M · 65 | 8.93 · 0.48 M · 46 |

=> traffic ≈ 6–6.6 ms and ~0.92 M tris in EVERY view (all instances, full detail, both passes, no culling);
pedestrians 0.4 ms (junction) .. 1.6 ms (overview: 449 figures x 588-tri far LOD = 264 k tris).
Cost drivers found:
- vehicle models are NON-indexed and heavy: sedan ≈ 3 000 tris (variant parts are only collapsed in the shader),
  cars ≈ 2 100 avg (RoundedBox seg 2 bodies = 300 tris, 16-seg wheels + hubs + spokes = 136/wheel, 7 rounded boxes for lights/bumpers…).
  ~97 moving + 65 parked, all drawn in the main AND the shadow pass, frustumCulled=false, no LOD.
- traffic CPU (renderMs) is only ~0.1 ms → it is all GPU vertex/raster load.
- signal lamps: 480 instances x 168-tri spheres (back half hidden inside the housings).
- pedestrians: far LOD (588 tris) used out to any distance.
Reference screenshots: shots/perf/ref_{junction,oldtown,night,overview,close}.png (full city, --wait 4000).

## Milestone 1 — traffic LOD + culling (DONE, loadable)
Changes (src/sim/traffic/models.ts, render.ts, traffic.ts wiring only):
- models.ts: `buildModel(kind, lod)` builds 3 levels with the same builder code; shape helpers simplify per level
  (rbox → 2-facet RoundedBox / new 44-tri `bevelBox` with blended normals / plain box; thin parts → one outer quad;
  wheels → 10/6-sided tread + outer sidewall + hub disc, no spokes; sub-2.5 cm / sub-12 cm parts dropped; lights & decals kept).
  Merged geometry is now INDEXED (mergeVertices): LOD0 compact 6 384 → 1 616 shaded vertices, same triangles.
  Tris per model LOD0/1/2: compact 2128/608/240, sedan 3000/608/264, bus 2340/728/296, lorry 3004/752/420.
- render.ts: one InstancedMesh per (kind, level); per frame each vehicle/parked car is frustum-culled (radius grown by the
  sun/moon shadow length, ≤ 26 m, so off-screen casters still shadow the view) and bucketed by camera distance
  (62 m / 150 m at 930 px & 32° fov, scaled with drawing-buffer height and fov); only used ranges uploaded.
  Sim-facing fields (V.onScreen, V.visible, isVisible) computed exactly as before.
- `?tlineup=lods` shows the showroom lineup at all three levels (blocks at z = 22 / 50 / 78).
Visual check: shots/perf/cmp_62.png (LOD0 vs LOD1 at 62 m) and cmp_150.png (LOD1 vs LOD2 at 150 m) — indistinguishable.

| view (base S) | before | after M1 | traffic cost before → after |
|---|---|---|---|
| downtown | 16.46 ms · 1.47 M | 10.15 ms · 0.72 M · 68 dc | 6.6 → 0.5 ms |
| overview | 17.27 ms · 1.67 M | 11.55 ms · 0.96 M · 70 dc | 6.0 → 0.6 ms |
| junction | 14.73 ms · 1.42 M | 9.87 ms · 0.65 M · 60 dc | 5.8 → 0.9 ms |

## Milestone 2 — signal lenses + tiny pedestrian LOD (DONE, loadable)
- signals.ts: lenses are front half-domes (back half was inside the housing): 168 → 84 tris near, 18 tris beyond 70 m;
  frustum-culled and re-bucketed only when the camera moves; per-frame Map/object allocations removed.
- pedestrians: new `buildTinyPersonGeometry()` (figure.ts, ~200 tris vs 588 `lo`) used beyond 130 m (≤ 22 px tall;
  distances scale with drawing-buffer height / fov like traffic). Same parts/slots/feature bits → same shader & poses.
  Debug: `?pedlod=0|1|2` forces a level; `services.pedestrians._renderer.forceLod` at runtime.
  Check: shots/perf/cmp_ped130.png (lo vs tiny at 130 m: same), cmp_pedc2.png (all three at ~15 m, tiny only meant for far).

| view (base S) | before | after M2 | traffic+peds (skip delta, incl. their sim CPU) |
|---|---|---|---|
| downtown | 16.46 ms · 1.47 M | 10.02 ms · 0.60 M · 68 dc | 6.7 → ~0 ms (noise ±0.3) |
| overview | 17.27 ms · 1.67 M | 11.18 ms · 0.72 M · 70 dc | 7.6 → 1.6 ms |
| junction | 14.73 ms · 1.42 M | 9.13 ms · 0.57 M · 60 dc | 5.8 → ~0 ms |

### Visual + invariant verification after M2
- Pairs (left = before, right = after; other agents' roads/vegetation/harbor appeared meanwhile):
  shots/perf/pair_{junction,oldtown,night,overview,close}.png, zooms zoom_night.png / zoom_oldtown.png —
  vehicles, headlight pools, signal lenses and people look the same.
- Invariants (`shot.mjs --speed 4 --wait 20000 --invariants --stats`, full city), original code vs new code:
  traffic: none / none (spawned 113, despawned 2, tunnelIn 11 — identical counters);
  pedestrians: pre-existing crowd-sim "overlapping" reports in both runs (beachgoers at 128,96) — sim side, untouched.
  Console clean (0 errors / 0 warnings) both. Full-city overview tris 2.29 M → 1.29 M (same 93 draw calls).
- Pure render cost now (S vs S&hide=traffic,pedestrians — new debug hook `?hide=traffic,pedestrians`):
  downtown 0.59 ms, overview 0.79 ms, junction 0.42 ms (was ~6–7 ms).

## Milestone 3 — buildings (DONE, loadable)
Cost split measured with new debug toggles `?bdbg=noshell,notrim,nocast,nodetail` (buildings.ts):
downtown buildings ≈ 2.7 ms = shell (facade shader, fragment-bound, 8 k tris) 1.35 + trim (139 k tris x 2 passes) 1.0 + shadow casting 0.24.
Changes:
- materials.ts (facade shader): two exactly-equivalent early-outs — close-up wall pixels (`edge < 0 && detail >= 0.999`)
  return before the per-room hashes / sky reflection / occupancy they never use; window pixels with `detail == 0` take
  the averaged result directly without the interior mapping. Shell cost: downtown 1.35 → 1.16 ms, junction 1.96 → 1.28 ms.
  Check: shots/perf/pair_bld_{day,night,oldt}.png (before/after identical).
- buildings.ts: trim split into ≤ 16 spatial chunks (110 m grid) → frustum culling in main + shadow pass.
  Trim cost junction 0.82 → 0.31 ms (tris 480 k → 345 k); downtown/overview see nearly everything (no gain, +~20 dc).
Tried and rejected: shell depth pre-pass (no gain on Adreno: +0.3 ms in overview); dropping thin trim at distance
(pieces < 8 cm are 29 % of trim but only invisible beyond ~260 m → ~0.2 ms in overview for +32 meshes: not worth it).

## PAUSED (usage limit) — exact state
All edits complete, loadable and typechecking (no half-done edit; src/world/buildings/mesh.ts was restored to the original
after a temporary instrumentation run). Files changed so far:
- src/sim/traffic/models.ts (LOD builder, bevelBox, thinQuad, indexed geometry), render.ts (per-(kind,LOD) InstancedMeshes,
  frustum+shadow-reach culling, distance LOD, ranged uploads, `?tlineup=lods`), signals.ts (half-dome lenses, 2 LODs, culling,
  no per-frame allocations), traffic.ts (wiring: stats drawn/lod/vehicleTris, `?hide=traffic`).
- src/sim/pedestrians/figure.ts (`buildTinyPersonGeometry`), render.ts (tiny layer, resolution-scaled LOD distances, forceLod),
  pedestrians.ts (wiring: pxHeight, `?pedlod=`, `?hide=pedestrians`, `_renderer` debug handle, tinyLod stat).
- src/world/buildings/materials.ts (2 exact early-outs in bhWall), src/world/buildings.ts (trim chunks, invariant cap 6+16,
  `?bdbg=noshell,notrim,nocast,nodetail`).
Full-city numbers now (all modules incl. others' new ones; uncapped ms/frame · tris · draw calls):
  downtown 14.30 ms · 1.46 M · 129 dc (traffic+peds 0.9–1.0 ms, buildings 2.0 ms)
  overview 15.64 ms · 1.67 M · 147 dc (traffic+peds 1.26 ms, buildings 1.2 ms, postfx 2.96 ms)
  junction 11.06 ms · 1.19 M · 103 dc (traffic+peds 0.35 ms, buildings 1.33 ms)
Postfx component probe (its own debug params, full city): downtown noao −1.0 ms, others ≈ noise; overview fbtype=u8 −2.9 ms
(= skip=postfx!) → the half-float scene target is the overview's postfx cost on this GPU; noao −0.4, no tilt −0.4, no bloom −0.3.
Next steps (priority):
1. Final before/after in the CURRENT full city: temporarily swap in scratchpad orig/ files (traffic, pedestrians, buildings),
   run perf on downtown/overview/junction, swap back, run again (see the invariants procedure used earlier).
2. Optional: ~60-tri "pin" pedestrian for ≥ 400 m (overview 449 figures x 200 tris); signal-pole far LOD (23 k tris x 2).
3. Final report: recommend to postfx owner — investigate HalfFloat RT cost (u8 equals no-postfx in overview), AO (≈1 ms downtown).
## Milestone 4 — postfx at 1920x1025 (IN PROGRESS, loadable)
New scope: src/render/postfx.ts + src/render/postfx/*. Tooling: per-pass GPU timer queries (EXT_disjoint_timer_query_webgl2
is exposed in plain Chrome) — scratchpad gputime.mjs; runtime A/B switches for pixel diffs (postfxInternals.setAOPath,
clouds.setMapSize) because separate page loads differ (camera settle, adaptive steps — always use adaptive=0 for A/B).
Baseline per-pass GPU ms (overview / downtown, 1920x1025): N8AO 2.2/2.9 (its full-res compositer alone 1.0/1.37 + copy 0.22),
SMAA 1.05/1.29, tilt 0.75/0.52, bloom 0.66/0.66, cloud map 0.37, final merged pass 0.93/1.0 → postfx ≈ 6.0/6.7 ms.
HalfFloat finding re-checked with timers: u8 buffers do NOT make the post passes cheaper (only bloom −0.2 ms); the earlier
"u8 = −2.9 ms" was scene-pass noise. Kept HalfFloat (HDR bloom + sky gradient); R11G11B10 rejected (5-bit blue mantissa → sky banding).
Changes so far:
- postfx/aoApply.ts (new): AO applied inside the merged effect pass (after SMAA): half-res prep pass packs (AO, view distance)
  into RG16F; final pass does a 4-fetch depth-aware bilinear upsample + N8AO's tint/pow/fog maths. N8AO's own full-res
  compositer, copy and accumulation passes are stubbed (needsSwap=false, its full-size targets shrunk to 1x1).
  Tilt-shift prefilter applies the same AO (bilinear) to the blurred field. AO total 2.2/2.9 → ~1.3/1.6 ms.
  A/B (same frame, adaptive=0): mean |diff| 0.5/0.8 of 255, p99 5/8 — SMAA-edge speckle on fine detail, no halos (zoom crops identical).
- postfx/cloudShadow.ts: exact early reject in the map shader + map 512² → 256² (A/B mean diff 0.019 vs temporal noise 0.001).
- postfx/adaptive.ts: synchronous readPixels probe (measured 70–90 ms in headless → always "GPU-bound" → walked to scale-0.6)
  replaced by async per-frame GPU timer queries; every step down is verified (undone + stand-down with back-off if it did not
  help); step-ups only when current GPU ms + the step's measured saving fits (no ping-pong).
Observation: at 1920x1025 the frame is ~16–17 ms GPU in the overview (scene ~10 ms is largely vertex-bound; render-scale steps
give little) — buildings shader/trim next (landmarks agent tip: hoist fwidth/dFdx out of branches).

### Milestone 4 result (postfx, 1920x1025, per-pass GPU timer queries)
| pass (overview / downtown noon) | before | after |
|---|---|---|
| N8AO (AO + denoise + compositer + copy) | 2.22 / 2.88 | 0.95 / 1.31 (+ prep 0.06) |
| SMAA edges + weights | 1.05 / 1.29 | 1.08 / 1.33 (unchanged) |
| tilt-shift prefilter + blurs | 0.75 / 0.52 | 0.76 / 0.55 |
| bloom | 0.66 / 0.66 | 0.67 / 0.69 |
| cloud-shadow map | 0.37 / 0.37 | 0.09 / 0.09 |
| final merged pass (now incl. AO apply) | 0.93 / 1.00 | 1.09 / 1.26 |
| **postfx total** | **5.98 / 6.72** | **4.69 / 5.29** |
Visual proof (runtime A/B in ONE page load, settled camera, adaptive=0, `before` = N8AO path + 512² map):
shots/perf/pfx_{ov,night,beach,tilt}_{before,after,before2}.png, diffs pfxd_*.png, crops cmp_pfx_ov.png / cmp_pfx_night.png /
pair_pfx_beach.png. Mean |diff| 0.68 / 0.85 / 0.78 / 0.07 (of 255; temporal noise 0.003–0.03), p99 8–11 on fine detail only
(SMAA edges now detected before AO): no halos, bloom / sky gradient / tilt-shift identical at 2–3x zoom.
Also tried: depth pre-pass for the building shell — −6.9 ms with only buildings on screen but +3.5..+11 ms in the full city
on this GPU (Adreno LRZ / colour-masked draw pathology) → rejected. Facade-shader fwidth hoisting (landmarks tip): no
measurable change here, kept (correct + cheaper on GPUs that flatten derivative branches).
Note: shadow-map pass is now 2.1–2.4 ms at 1920x1025 (was 1.0–1.2 before other modules landed) — not postfx.

## Wrap-up (session 3)
- Facade fwidth hoist: reverted (no measurable gain on this GPU; keeps the screenshot-verified early-out version).
- Adaptive controller at 1920x1025 (vsync'd headless, other GPU clients active): OLD walked full → scale-0.6 in 35 s on
  70–90 ms "probes"; NEW (GPU timer queries + verified steps): full → no-ao → scale-0.85 when GPU ≥ 14 ms and fps < 49,
  then reverts useless steps (scale-0.72 undone, stand-down 60→120→… s), no ping-pong. Note vsync quantisation: at ~15–17 ms
  GPU the page sits at 30 fps — 60 fps at 1920x1025 needs our GPU frame ≲ 14 ms (overview is ~16.8: shadow 2.1, scene 10, post 4.7).
- A full-city before/after with swapped files (all my files original vs current) was attempted but is NOT usable: the machine
  was heavily loaded during it (baseline 24–32 ms vs ~14–17 ms earlier; the AFTER half ran under even more load). Triangle
  counts from it are valid: 1300x930 downtown 2.33 M → 1.43 M, overview 2.49 M → 1.54 M, junction 2.17 M → 1.17 M.
  Per the lead, no more file swapping — final numbers below are current-code only.
## FINAL (current code, full city incl. all other modules, 1920x1025, pixelRatio 1)
| view | ms/frame (perf.mjs, uncapped) | GPU timers: shadow + scene + post = sum | draw calls · tris |
|---|---|---|---|
| overview 12:00 | 33.8 / 35.7 (run under heavy machine load, cpu 55 ms — not representative) | 1.04 + 9.76 + 4.70 = 15.5 ms | 144 · 1.55 M |
| downtown 21:30 | 17.7 / 17.6 (lead measured ~21 before the postfx work) | 1.16 + 11.56 + 4.81 = 17.5 ms | 139 · 1.51 M |
| junction 0,0,-65,60,30,45 12:00 | 12.3 / 12.9 | 0.93 + 5.32 + 4.56 = 10.8 ms | 96 · 1.18 M |
Traffic + pedestrians render cost (S vs ?hide=traffic,pedestrians, downtown night): 0.7 ms incl. headlight pools/flares.
Final invariants (shot.mjs --speed 4 --wait 20000 --invariants --stats): {} (none), 0 console errors/warnings, no failed
modules; traffic counters identical to the pre-change run (spawned 113 / despawned 2 / tunnelIn 11); postfx stayed at 'full'.
Remaining hot spots: scene pass 9.8–11.6 ms (largely vertex-bound per landmarks agent), postfx 4.6–4.8 (SMAA 0.9–1.1,
N8AO internals 0.9–1.2, final 1.1–1.2, tilt 0.4–0.8, bloom 0.65), shadow map 0.9–1.2 (2.1–2.4 in some earlier runs).
