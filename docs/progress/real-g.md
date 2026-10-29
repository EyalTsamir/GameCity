# Last fix round (G1–G3) — shared log

## G2 — Ground, track, water (branch claude/real-g2-ground)
### Resume here
* 10:25 UTC start. Base = claude/pensive-gates-bim12i @ 2dac266. Order: downtown pavement (judge 3 #2) → ballast/
  cutting (#6) → fountain (#5) → church gablet rod.
### Code pointers
* Paving shader: `src/world/roads/glsl.ts` ~l.340–420 (hand-laid courses: `hand`, `qy` wander, jittered joints;
  uniform `uRdHand` ← `?nohandlaid` in `roads/materials.ts:431`).
### Done
### Tried and rejected
### Toggles / tiers
