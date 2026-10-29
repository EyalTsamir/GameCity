# Last fix round (G1–G3)

## G1 — glass and interiors (branch claude/real-g1-glass)
### Resume here
Started 10:15 UTC, deadline 11:50. Before bench: shots/g1/before (townhouse, office, tower, apartment, car, bus, train @3 m).

### Code pointers
* Facade glass: `src/world/buildings/materials.ts` `bhWall` (~1066–1925): cell = floor(vFac), r1..r3 per room (1453);
  interior pick at ~1662 (`bhShop` for SHOP + tower lobby, `bhRoom` otherwise); glass composite ~1880
  (`glass = interior*(1-Fs)*transTint + refl*Fs…`, `glassAlb`). `bhShop` 562 (T>7.5 lobby plant 770), `bhRoom` 834.
* Vehicle glass: `src/sim/traffic/vehicleMaterial.ts` 164 (cls 2 car, 4 bus, 5 van cab): `thInterior` + clearcoat street refl.
* Train glass: `src/sim/rail/trainMaterial.ts`.

### Done
