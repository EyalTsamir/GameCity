# F3 — Ground, track and rock (final fix round)

## Resume here
* 2026-10-29 session 2 — golden m3 (fresh ref from base e1c9780, both 1280×720 pumped): ALL ≈0 (harbor 0.4 =
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
* ?notrackfix (fixings; off on low, 22 m medium, 38 m high), ?nohandlaid (paving). Rock bump / ballast: no toggle
  yet (?legacyterrain disables the masonry flat path). Costs NOT measured yet (perf.mjs to do: station view with
  ;notrackfix and downtown with ;nohandlaid).

## Next
