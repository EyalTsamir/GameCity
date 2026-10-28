# QA fixes (findings 3, 5, 8, 11 of shots/qa/REPORT.md)

## Resume here
- Done in code (typecheck clean), awaiting after-captures / commit: 3, 5, 8, 11 (details below).
- Before captures: `shots/qa/fix/before/*.png`; after captures: `shots/qa/fix/after/*.png` (capture-set, 11 h, high).
- Next: read the after PNGs, check invariants / ?validate (`shots/qa/fix/inv_check.json`), commit only own hunks
  (plan.ts is also being edited by the lead: commit just the `genApartments` car-park hunk).

## 3 — Westbrook apartment car park had no access
- `src/core/plan.ts` (end of the Westbrook apartment generator): stalls in one row along the north edge (noses
  south), aisle along the south edge, plus an asphalt `driveway` area from the aisle to the east street (x = −116.5).
- `src/world/roads/covers.ts`: a `driveway` with surface `asphalt` renders as car-park asphalt (house driveways stay pavers).
- `src/world/roads/streets.ts`: every `driveway` area that opens onto a segment sidewalk gets a dropped kerb
  (`DRIVE`: kerb lowered 11 cm to ~2.5 cm upstand, ramp inside the first 0.86 m row, 0.5 m flares); the walking
  band stays level. Stat `roads.driveKerbs`.

## 5 — bare earth wedge between road-portal wing walls and the ridge rock
- `src/world/terrain/height.ts` applyPortal: road portals dig the approach along the full wing wall
  (fade reach − 0.4 … reach + 1.4 instead of reach − 6 … reach).
- `src/world/terrain/cliffs.ts`: ridge rock skipped only to reach − 0.25 (inside the end pier), and a rock column is
  placed exactly on each skip boundary (bisection) so the rock is flush with the wall end.

## 8 — downtown shop windows didn't match their signs
- `shopType(name)` moved from oldtown.ts to `src/world/buildings/materials.ts` (shared), extended: Bank → 8 (office
  lobby), Deli → 2, Boutique → 5, Espresso/Coffee → 1, Optic(s/ian) → 6 (light shelves instead of clothes rails).
- `src/world/buildings/towers.ts` buildLobby: picks the shop name first and passes `WALLPAT.SMOOTH + 16 × type`.
- `src/world/buildings/special.ts` kiosks (ICE CREAM, NEWS · COFFEE) get the café interior instead of a random one.

## 11 — Westbrook gates opened onto lawn
- `src/world/props/gardenPlan.ts`: `GardenPlan.front` = 1 m walk from the lot's street edge to the front door
  (only when the door faces the lot front and misses the driveway).
- `src/world/roads/covers.ts`: drawn like the patios (same slab/paver/brick material; decking houses get slabs), 4.5 cm.
- `src/world/groundcover/mask.ts`: no grass blades on it.
