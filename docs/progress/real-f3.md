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

## Done

## Tried and rejected

## Toggles / tiers / costs

## Next
