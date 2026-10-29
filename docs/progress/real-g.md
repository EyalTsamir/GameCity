# Last fix round (G1–G3) — shared log

## G2 — Ground, track, water (branch claude/real-g2-ground)
### Resume here
* 11:00 UTC: pushed straight-slab fix; in flight (uncommitted until judged): litter footprint fix (glsl.ts rdLitter),
  arcade floor 0.02→0.005 (buildings/towers.ts, harmless, kept), fountain jets/pool (?nofountainfx), ballast bed
  relief (?nobedrelief). Captures: shots/g2/{b1 (ballast+fountain), p6 (office 3 m)}.
* 10:25 UTC start. Base = claude/pensive-gates-bim12i @ 2dac266. Order: downtown pavement (judge 3 #2) → ballast/
  cutting (#6) → fountain (#5) → church gablet rod.
### Findings
* Judge 3 #2 "dashed acne line along every colonnade" + "barcode": NOT shadow acne, NOT hand-laid paving, NOT
  groundcover (probe hide:groundcover keeps it; noshadow hides it only because it brightens the arcade). It is the
  hardscape litter (`rdLitter`, glsl.ts): 5 mm cigarette butts / gum faded by the geometric-mean pixel footprint,
  which at grazing views is far smaller than the long axis → sub-pixel items alias into rows of dark dashes, densest
  in the wall band (lat 5.9–6.5) = along every frontage and under arcades. Fix: fade by the larger footprint axis.
* Wavy joints: F3 hand-laid course wander (±0.25 × course height) also applied to 0.6–1.2 m sawn slabs.
* The arcade floor (towers.ts, y 0.02) is coplanar with the block paving (Y.cover 0.02) — ray picks hit both at the
  same distance; moved to 0.005 (under the paving).
### Code pointers
* Paving shader: `src/world/roads/glsl.ts` ~l.340–420 (hand-laid courses: `hand`, `qy` wander, jittered joints;
  uniform `uRdHand` ← `?nohandlaid` in `roads/materials.ts:431`).
### Done
### Tried and rejected
### Toggles / tiers
