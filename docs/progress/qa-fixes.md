# QA fixes (findings 3, 5, 8, 11 of shots/qa/REPORT.md)

## Resume here
- All four fixes are in (typecheck clean, invariants {}, ?validate [] , console clean — `shots/qa/fix/inv_check.json`).
  The code landed in the shared checkpoint commits (c8c7e07, dcf29ea, 6e935d4, 1ba829e); this log is committed separately.
- Before: `shots/qa/fix/before/b*_11.png`; after: `shots/qa/fix/after/a*_11.png`, car park re-check `shots/qa/fix/after2/`.
- Open: tiny (< 1 m) earth sliver left at the foot of the rock beside each road-portal wing end (was a full-height
  band + a 3–4 m wedge); acceptable, could shrink by ending the front dig at reach + 0.8 instead of + 1.4.

## 3 — Westbrook apartment car park had no access
- `src/core/plan.ts` (end of the Westbrook apartment generator): stalls in one row along the north edge (noses
  south), aisle along the south edge, plus an asphalt `driveway` area from the aisle to the east street (x = −116.5).
- `src/world/roads/covers.ts`: a `driveway` with surface `asphalt` renders as car-park asphalt (house driveways stay pavers).
- `src/world/roads/streets.ts`: every `driveway` area that opens onto a segment sidewalk gets a dropped kerb
  (`DRIVE`: kerb lowered 11 cm to ~2.5 cm upstand, ramp inside the first 0.86 m row, 0.5 m flares); the walking
  band stays level. Stat `roads.driveKerbs` (25 in the city).
- `src/world/props/scatter.ts` car parks: the access drive's band across the car park (= the aisle) is kept clear —
  the bottle banks / EV chargers had moved into the new aisle mouth.

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
