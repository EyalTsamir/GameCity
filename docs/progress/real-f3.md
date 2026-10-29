# F3 — Ground, track and rock (final fix round)

## Resume here
* 2026-10-29 — started. Branch claude/real-f3-ground (from e1c9780). Reading code; nothing changed yet.

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

## Done

## Tried and rejected

## Toggles / tiers / costs

## Next
