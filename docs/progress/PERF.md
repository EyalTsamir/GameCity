# PERF — local GPU round (Adreno X1-45, 1920x1025): smooth, no hitches

Branch `claude/pensive-gates-bim12i`. Budget file: `perf-results.txt` (repo root). Earlier perf rounds are kept below
("Earlier round: render-performance pass").

## Resume here
- Baseline measured (see perf-results.txt). Fix list in priority order is below; the first unchecked item is next.
- A frozen copy of the round's starting code (8718d0f) can be served for same-run before/after:
  `git worktree add --detach <dir> 8718d0f`, junction its `node_modules` to this repo's, then
  `node node_modules/vite/bin/vite.js --config vite.base.config.mjs` (port 5174, own deps cache) and pass
  `--url http://127.0.0.1:5174/` to perf.mjs / hitch.mjs / drawprof.mjs.

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
