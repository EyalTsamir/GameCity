# Last fix round (G1–G3)

## G1 — glass and interiors (branch claude/real-g1-glass)
### Resume here
Fixes 1–8 below pushed (typecheck, console clean, invariants {} at the bugs-3 bank view). Before: shots/g1/before
(first page load, pre-edit) + `?noglassvar` / `?novehglass&notrainglass` runs; after: shots/g1/after, after2.
Bench cost here ≈ 2 min / capture (the 7-class 3 m run needs > 15 min — use `ONLYPOSE=cab_6m node scripts/.g1bench.mjs`
style filters, local copy, not committed).

### Judged (3 m bench, 11 h)
* Shop reflection floor 0.24–0.34 first try: overshot — bakery and Café Nord washed to a pale mirror, the warm
  interior the judge liked was gone. Re-tuned to 0.11–0.16 + interior ×0.82 by day (after2).
* Car glass: halving the diffuse base changed nothing visible — the veil is the clear-coat street reflection at
  gain 3.6; now ×0.6 on glass (after2).
* Apartment: fewer / softer car posters — reads better, the panes now differ.
* Bus side glass: the panes over the real seated passengers are fully see-through, so the saloon reads open-air.
  **Open**: needs a blended reflection-only overlay draw of the flank window quads (one more instanced draw in
  traffic render) — the opaque vehicle material cannot put a reflection over figures drawn later.

### Code pointers
* Facade glass: `src/world/buildings/materials.ts` `bhWall` (~1066–1925): cell = floor(vFac), r1..r3 per room (1453);
  interior pick at ~1662 (`bhShop` for SHOP + tower lobby, `bhRoom` otherwise); glass composite ~1880
  (`glass = interior*(1-Fs)*transTint + refl*Fs…`, `glassAlb`). `bhShop` 562 (T>7.5 lobby plant 770), `bhRoom` 834.
* Vehicle glass: `src/sim/traffic/vehicleMaterial.ts` 164 (cls 2 car, 4 bus, 5 van cab): `thInterior` + clearcoat street refl.
* Train glass: `src/sim/rail/trainMaterial.ts`.

### Done (all behind toggles; before = same URL + the toggle)
1. **Shop / bank / lobby interiors vary per bay** (`?noglassvar`, facade near detail `uDetail` = quality tier):
   the wall cell grid restarts per emitted segment, so `cell.x` repeated; the bay id is now the world position of
   the cell along the wall + facing (`bayId`/`bayH` in bhWall). Shop keeps one type (resolved from the seed first).
2. **Facade glass as a material** (`?noglassvar`): shop + lobby panes get a daytime reflection floor (0.24–0.34)
   and a 30 % dimmer interior by day (the bakery read as an open hole); per-pane float-glass tint (green / neutral
   / warm, ±6 % strength); thin bright glazing-edge line inside the frame (near detail only).
3. **Apartment "poster" reflections** (`?noglassvar`): bhOpp parked cars in fewer panes (ch > 0.5) and at
   55–85 % coverage instead of a crisp full-strength car in every ground-floor pane.
4. **Office / tower rooms furnished** (`?noglassvar`, bugs-3 #3): ceiling light panels in a 0.6 m tile grid, carpet
   tiles, a desk row (top, modesty panel, monitors, some screens lit) as a parallax layer at 32–54 % room depth.
5. **Café counter** (`?noglassvar`, judge #9 Café Nord): bar counter along the back wall + espresso machine
   (two group heads, cups on top) in every café (shop type 1).
6. **Car / van / bus glass** (`?novehglass`, inside the cabin-interior tier `uVehDetail.x`): diffuse of the pane
   0.25 → 0.05 (the milky "smoked plastic" veil was the sun-lit diffuse base), cabin seen through a faint green
   tint, slightly more contrast.
7. **Bus saloon tyre arch** (`?novehglass`, F2 open): with seated passengers the flank depth ray stops at the
   saloon floor, so the far wheels no longer show through the seat rows.
8. **Train cab windscreen** (`?notrainglass`; cab/desk/wipers only when `uTrInt` = not quality low): stylised
   sky / skyline / ground reflection by the reflected direction in the car frame (Fresnel, floor 0.2), dim cab
   with the desk, two parked wipers — no longer a black void.
