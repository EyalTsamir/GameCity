# W6 — Dense real places I: market square, café terrace, back yard ("real things" round)

Branch `claude/real-w6-places` (from `claude/pensive-gates-bim12i` @ d30138d). Brief: docs/progress/real-briefs.md "W6".
Owned: src/world/props/** + props.ts, src/world/life/**, src/sim/pedestrians/cafes.ts + tableware.ts (presentation),
and (inherited from W3) the market stall in src/world/landmarks/civic.ts.

## Resume here
* 2026-10-28 22:30 — Session 1 WIP. W3 leftovers judged (shots/w6/w3left/sheet_1.png): kiosk, playground,
  gazebo, statue, planter read real at 3/10 m; remaining nits: kiosk dark box sticking out at the bottom corner of
  the plinth; `bin 10m` bench framing still ends inside a glass box (newsstand/shelter) — bench fault, not the bin.
  Perf of covers/produce NOT measured yet.
  New **src/world/props/places.ts** (`buildPlaces`, called in props.ts before the meshes section; `free()` /
  `claim()` / `spot()` closures there; placed items are checked by props invariants). Places found at runtime:
  market (27.5, 78.5), terrace = biggest plaza café cluster (-38.3, -78.6, yaw 0), back yard = old-town courtyard
  nearest the oldtown POI, back wall facing yaw π/2 (yard centre 76.5, 17.5). Downtown: console clean, invariants {}.
  Back-yard washing line: service.lines → life/extras.ts dryers() hangs animated shirts/trousers/towels/socks/sheets.
  First eye-level capture: shots/w6/p1 (capture-set, views in the log below). Counts: market 22 items (low —
  many stall backs fail `free()`: check why), terrace 6, back yard 5 (some of ~10 placements fail `wallAt`/free).
  **Next:** judge p1; debug failing placements (log rejects with ?debug); café table/chair upgrade in kit.ts cafe()
  (tube bistro chairs, pedestal table, tableware, angled chairs, bag/jacket); parasol + awning wind sway
  (furnitureMaterial `sway` option with aSway pivot attribute, separate props-sway mesh); measure perf.

## Code map (learned this session — do not re-read)
(see real-w3.md "Done" for furniture/park/civic pointers)
* props.ts: kits KC (coarse) / KF (fine, < 300 m, per W/E chunk: `KF[chunkOf(x)]`) / KD NearCells (near-only cells,
  cut 30 m) / KS casters / KL static laundry; `spot()` contact grime; `layout.furniture` keep-clear discs;
  scatter loop (case 'cafe' → SK.cafe(kf, KS, …) + service.cafes seats) ~l.315; kerb cafés ~l.520–560.
* Kit (furniture.ts:33) `m(col, mat)` / `e(col, glow, k)`; Shaper (vegetation/geo.ts:264): frame/local/push/pop,
  box, post, cyl(cx,y0,cz,r0,r1,h,sides,caps), disc, cone, ellipsoid, beam, tube(a,b,r0,r1,sides); shapes.ts
  cbox/lathe/ring/pixelText.
* SK.cafe (kit.ts:31) = primitive boxes (chairs) + cylinder table; GK.parasol (garden.ts:124) 8 panels.
* Market: plan.ts genMarket ~l.988 (area kind 'market', 2 aisles N-S, stalls 2.6 m off the aisles, radius 1.3);
  stall in landmarks/civic.ts genMarketStall :303; life/extras.ts market() = masts + festoon star.
* Courtyards: plan oldtown → area 'courtyard' (grass) between building rows; scatter.ts :605 puts bins/bikes/table;
  life/decor.ts :104 hangs laundry across courtyards from building spans.
* Wind GLSL: core/wind.ts WIND_GLSL (`thWindAt(xz)`, needs uTime + uWind); props material = material.ts:114.

## Done

## Tried and rejected

## Toggles / tiers / costs

## Sheets
