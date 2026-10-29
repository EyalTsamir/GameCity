# F3 — Ground, track and rock (final fix round)

## Resume here
* 2026-10-29 06:10 session 2 WRAPPED (context cap; last: lawn blade upK +0.48 kept, judged at parklawn 3 m).
  Open: pasture (needs lead OK), lawn blades still a bit darker than the sward. Session 2 summary (all pushed): golden m5 after all changes: overview 0.0, downtown 0.3,
  oldtown 0.1, westbrook 0.3, harbor 1.1 (cliff faults, intended); console clean; downtown invariants {}.
* session 2 — golden m3 (fresh ref from base e1c9780, both 1280×720 pumped): ALL ≈0 (harbor 0.4 =
  cliff skin behind the quay, westbrook 0.1) → m2's 39.7/37.2 was a stale/broken ref, NOT a regression.
  Bench judgments (960×540, `/tmp/claude-0/run.sh <out> <classes> <dists>` wrapper; ~2.5 min/capture here):
  - rock bump (session 1) = per-pixel SPECKLE at 10 m (octaves of 3–6 mm texels) → fixed: octaves resized, fine
    ones faded by footprint; then pitted "lunar" look at 2 m → terraced fracture planes + bedding laminae + per-plane
    weathering tone (mTerr). Cliff pose fixed: bench class `cliff` (old `cutting` 10 m = inside the parked train).
  - ballast = crazy paving (uniform grout lines) → faceted crushed stones (3–5 faces), voids only where a
    packing noise opens them; bed raised (BALLAST_DROP 0.15→0.125) so sleepers sit 2.5 cm proud, not on top.
  - lawn felt: (a) the track verge north of the bed was a bladeless "mown" strip (groundcover allow cut at
    RAIL_Z−3.5) → allow/meadow now reach the shoulder toe (−2.45); (b) sward texture in ground.ts (uGcSward,
    ?nosward): 3 layers of blade-tip dashes oriented along the view direction, fade to mean coverage.
  - lawn felt (c): blades read as dark stubble over pale suede → mown blades 1.8× wider, +16 % brighter, upK +0.32
    (sky-lit like the ground), aoRoot 0.84; under-blade ground dark green (no thatch brown) at 0.58; sward v3:
    scales 30/24/11 per m, fade by the LATERAL footprint (fLat) and depth (fpx), gaps dark green, normalised 0.88.
  - paving: sand-filled joints (lighter than a shadow line, 25 % narrower), ±8 % per-stone luminance.
  - cliffs: faults every 7–18 m with 0.45–1.05 m throws (was 12–30 / 0.3–0.7): shelves no longer a layer cake at 40 m.
  - HARNESS LESSON: editing a src file while a capture runs breaks the following captures (golden m4 downtown =
    a flat green frame, 34.1; same cause as session 1's m2). Never edit src/ while bench/golden/perf runs.
  - perf (SwiftShader 960×540, noisy): station POI notrackfix ±0 (fixings culled at that range); park POI sward
    ≈ 5 % of frame before the far-skip → now skipped beyond its fade (swVis computed first).
  Bench poses: `cliff` 3 m ok (10 m lands in the lineside fence), `tracklawn` 3/10 ok, `parklawn` 3 m ok (moved to
  −64, 6; 10 m inside a building). `townhouse` 3 m = paving reference.
* 2026-10-29 03:20 — session 1 wrapped up (context cap). ALL CODE BELOW IS UNJUDGED: no clean after-bench yet
  (the first after-captures were black because of a hardscape compile error, fixed in the last commit). FIRST STEP
  for F3b: `scripts/agent-tools/golden.sh m3` (ref = base e1c9780 already in shots/golden/ref — but shots/ is not
  in git; if missing, recapture ref from a base worktree, see pointers) then
  `node scripts/bench.mjs --classes ballast,cutting,quay,apartment,sheep,townhouse,marketstall --dists 3,10
  --out shots/f3/a2` and compare with shots/f3/before (base; also not in git — recapture from a base worktree on
  5174 if gone). Base cutting_3m was black (pose inside the hill) → pose fixed since; base parklawn was inside
  something → judge lawns via apartment/sheep instead.
* golden m2 (after the compile fix): console clean; downtown 0.1, oldtown 0.1, overview 0.0, but harbor 39.7 and
  westbrook 37.2 (m1 had them at 0.9 / 6.6 with only the hardscape shader differing → probably capture variance,
  harbor m2 is bluer: sea/sky?). LOOK at shots/golden/m2/diff.png before anything else.
* Then: lawn felt at 3 m (not started), pasture (landscape/shader.ts ck==3, ~l.320: unowned file — lime plane),
  cliff geometry (ledge shape / boulders) if the shader pass is not enough, perf.mjs cost of fixings + bump.

## Brief
Judge 2 #4 (pixel ballast, bare sleepers, low-poly rock cutting beside platform + behind quay), #5 (felt lawns,
pale centre band in park strips, lime pasture), #10 (paving grid regularity). Owner files: src/sim/rail/track.ts +
staticMaterial.ts (track bed), src/world/terrain/**, src/world/groundcover/**, src/world/roads/surfaces.ts.

## Code pointers
* Ballast: staticMaterial.ts FRAG_COLOR `K.BALLAST`/`K.GRAVEL` = `rlHash(floor(wp*9))` → 11 cm flat squares (the
  mosaic). Bed geometry track.ts ~l.69 (trapezoid, top at prof.top−0.15, half 1.62/2.4). Sleepers track.ts ~l.102:
  plain boxes 0.24×0.12×2.5 every 0.65 m, K.WOOD. Rails: web/foot/head quads. Everything in one Geo (one draw).
  rail.ts builds gFlat (bed, polygonOffset bedMat) + gTall (furniture). Track x = SPUR_W_X..SPUR_E_X, z = RAIL_Z −155.
* Cliffs: terrain/cliffs.ts (strata → blocks, merged into the masonry mesh); shading masonry.ts `masonryColor`
  kind > 5.5 (cliff), kind 3 = boulders/rock; masonry material is flatShading (TH_FLATN: normals from dFdx/dFdy).
  Lighting normal = three's flat normal unless overridden in normal_fragment_maps.
* Paving: roads/glsl.ts `rdHard` (tile pattern; non-herringbone branch), rdN = per-stone world normal tilt (applied
  in materials.ts nrm). Table of surfaces: roads/surfaces.ts. Shared uniforms: materials.ts ~l.431.
* Lawn tone: terrain/ground.ts ~l.360 mask alpha = mowing stripes (canvas) − edge darkening (E canvas, strokes at
  kerbs/walls); shader ~l.700 (stripe, edge). Under-ring thatch ~l.800. Blade rings: groundcover/field.ts specs l.60.
* Bench: F3 PLACES added in scripts/bench.mjs (ballast, cutting, parklawn). Base worktree /home/user/gc-base on 5174
  (node_modules = `cp -al` hard links; a symlink 403s in vite).

## Done (unjudged, all typecheck)
* Ballast/gravel (staticMaterial.ts): jittered Voronoi stones (4.8 cm ballast / 2.6 cm gravel), elongated + rotated,
  per-stone grey (some warm / blue), dark voids, rounded-top normal bump (rlG), fade to mean once a stone < ~2–4 px,
  brake-dust brown crib between the rails (RAIL_Z).
* Sleepers: new K.SLEEPER (28) — grain along z, drying checks, ballast dust on top (vWNy = world normal y varying
  added), oily dark under the rails; geometry jitter (spacing ±2.5 cm, yaw ±0.6°, length/width), 18 % greyer old ones.
* Rail fastenings: track.ts buildTrackFixings() (baseplate, 2 chair jaws, 3-bar spring clip, 2 screw heads per rail
  per sleeper) in 24 m chunks; rail.ts shows chunks within 38 m (high) / 22 m (medium) / none (low). ?notrackfix.
* Rock (masonry.ts, TH_FLATN only, kinds rock 3 + cliff 6): flat normal leaned 70 % to the shared-vertex normal
  (rounder boulders, softer facets) + ridged-noise fracture bump (Mikkelsen surface gradient, fades by footprint),
  applied as the lighting normal in normal_fragment_maps (mNb); NaN guard. Cliff: worm-crack contour lines 0.3→0.1,
  pale lichen specks 0.4→0.22, moss only on n.y > 0.6, patchy with soil/grit between cushions, olive not lime.
* Paving (roads/glsl.ts rdHard + materials.ts uRdHand; ?nohandlaid): for units < 1.3 m (not kerbs): wandering
  courses, jittered joint positions (stone lengths vary), drifting bond offset, per-stone joint width, sanded joints
  (grit colour), per-stone warm/cool tone + settled edge darkening, per-stone tilt (rdN); worn walking line on
  sidewalks (vS.x ≈ 1.9 m from the kerb, polished, darker, desaturated).
* Lawn tone (ground.ts stripes()): strips < 14 m across get 0.12–0.35 of the mowing-stripe amplitude (pale centre
  band, judge 2 #5) — unjudged; the dark rim may instead be the E canvas edge darkening (strokeRect at kerbs).
* bench.mjs: PLACES ballast / cutting / parklawn (parklawn pose bad), LOS skip regex ignores `fixings`.

## Tried and rejected
* (none judged yet.) Harness lessons: `pkill -f`/`pgrep -f` with a pattern that appears in your own command kills
  your own shell (exit 144) — kill by PID from `ps`. Two browsers at once in this container ≈ 3× slower each.
* Not done: litter under market stalls (stall positions are F4's props) — request if wanted.

## Toggles / tiers / costs
* ?notrackfix (fixings; off on low, 22 m medium, 38 m high), ?nohandlaid (paving), ?nosward (lawn sward texture,
  all tiers; skipped per pixel beyond its fade ~8–10 m). Rock bump / ballast: replacements, no toggle
  (?legacyterrain disables the masonry flat path).
* Measured (perf.mjs, SwiftShader 960×540, compare within run only): near-track view "-40,0.3,-155,7,20,30":
  fixings = +2 draw calls, +19 k triangles, ms within noise (315 vs 346 — the toggle-off run was slower);
  sward ≈ 2 % there (315 vs 322); park POI before the far-skip ≈ 5 %. Station POI: fixings culled (0).
* Sheets: docs/progress/real/f3_session2_before_after.jpg (rows: ballast 2→3 m, park lawn 3 m, rock 10 m
  speckle → 3 m terraces, cutting 40 m, paving 3 m; left = before, right = after).

## Session 2 tokens
* tokens.py: TOTAL weighted 3.9M, 195 calls, ctx median 177k / max 237k (system+brief 40 %).

## Next
* Pasture (landscape/shader.ts ck==3, unowned) — asked the lead for permission (session 2); not touched.
* Lawn: blades still read darker than the sward at 3 m in full sun (side-lit cards) — next lever is blade count on
  mown lawns (ring A 576/tile; cost) or a blade normal that follows the ground normal for short blades.
* Ballast at 2 m still shows some cell outlines; stones are flat (no parallax) — acceptable from 3 m.
* Bench 10 m poses for cliff/parklawn land inside fence/building (use 3 m and ballast 40 m).
