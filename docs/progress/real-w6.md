# W6 — Dense real places I: market square, café terrace, back yard ("real things" round)

Branch `claude/real-w6-places` (from `claude/pensive-gates-bim12i` @ d30138d). Brief: docs/progress/real-briefs.md "W6".
Owned: src/world/props/** + props.ts, src/world/life/**, src/sim/pedestrians/cafes.ts + tableware.ts (presentation),
and (inherited from W3) the market stall in src/world/landmarks/civic.ts.

## Resume here
* 2026-10-28 23:05 — **Session 1 ends (context cap).** All pushed. Judged (sheets docs/progress/real/w6_s1_places.jpg
  = market eye ×2 / market 16 m / terrace / back yard eye ×2 / back yard 12 m / terrace 2;
  w6_s1_terrace_chairs.jpg). Console clean, invariants {} (terrace view, hide=pedestrians).
  - **Market:** reads alive at eye level: crate stacks behind stalls, sack trucks, boxes, pigeon flocks, litter,
    bunting (life). Still missing vs brief: delivery van being unloaded (needs a W2 vehicle body → request),
    string lights between stalls exist (life/extras); only 22 items placed — many stall backs fail `free()`
    (likely the stall row backs touch OCC.SIDEWALK/PATH or the 1.3 m feature discs of the back-to-back row;
    log rejects and try local z −1.5…−2.2 / sideways).
  - **Terrace:** SK.cafe now = pedestal table (4 splayed feet, lathe column, rimmed top) + bent-tube bistro chairs
    (hoop back, 2 rails, woven or slatted seat), chairs pulled out / turned (15 % swung right round; seats follow),
    menu stand, sugar, cruets, ashtray. Judged real at 6 m. kerbCafe() still has the old box chairs → switch it
    to bistroChair/bistroTable. Terrace extras (hedge planters, waiter station, chair stack, dog bowl, stubs,
    A-board) placed (6 items) but not yet seen in a frame — capture from the plaza side (yaw 180–210, 8 m).
  - **Back yard:** washing line on two T-posts with animated laundry (life/extras.ts, service.lines) reads well;
    bins/recycling/bike/pallets/chair placed. **BUG found + disabled:** the courtyard rect edge is not the building
    face (back door stood free in the yard, apron "cracks" read as floating tan bars). Wall-mounted set (apron,
    door + step + mat + lamp, herbs, broom, meter box, downpipe + butt, AC) is now behind `?w6wall` until fixed:
    find the real wall line by stepping out from the yard until `occ.has(BUILDING)` per sample (not from the
    rect edge), or use buildings service footprints; re-check the crack decal sizes.
  **Next (session 2), in order:** (1) back-yard wall line fix → enable the wall set; (2) market placement rejects;
  (3) kerbCafe upgrade; (4) mechanics: parasol / awning sway — furnitureMaterial(u, wear, sway) option: attribute
  aSway (pivot xyz + flex), WIND_GLSL thWindAt(pivot.xz) lean ∝ h², canopy flutter; parasols into a props-sway
  kit (SK.cafe's `ks` and GK.parasol callers); market stall canopies live in landmarks/civic.ts (W3 inherited);
  (5) perf.mjs `;nomarketlife,noterracelife,nobackyard` and W3's `;nopropdetail` / `;nomarketdetail`;
  (6) bench views of the three places + golden overview (scripts/agent-tools/golden.sh).
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
* places.ts builders: woodCrate, plasticCrate, cardBox (closed/open), flatCardboard, sackTruck, platformTrolley,
  pallet (EUR), sack, pigeon (3 morphs, pecking pose), litter (leaves, paper, tomato, peel, sticks, cups),
  marketBin (1100 l, lid propped on bags), dogBowl, stubs, hedgePlanter, waiterStation, chairStack, bicycle,
  backDoor, meterBox, acUnit, downpipeButt, herbPots (rosemary/basil/chives/geranium), wheelieBin, recycleBox,
  weeds, broom, linePost. kit.ts: bistroChair, bistroTable.

## Tried and rejected
* Back-yard wall line from the courtyard rect edge (+ `occ BUILDING` 0.6 m behind): occupancy passes but the
  visible wall is elsewhere → door free-standing. Disabled (`?w6wall`).

## Toggles / tiers / costs
* `?nomarketlife`, `?noterracelife`, `?nobackyard` (all off on **low**); `?w6wall` (debug: wall-mounted back-yard set).
  Big items in KF (fine < 300 m), small ones in KD near cells (< 30 m). Cost not measured yet.
* Café table/chair upgrade has no toggle yet (always on) — add one with the perf run.

## Sheets
* shots/w6/w3left/sheet_1.png (W3 leftovers), shots/w6/p1 (capture-set views: market "27.5,1.3,76,9,0|180,6",
  "27.5,1,78.5,16,200,28"; terrace "-38.3,1.1,-78.6,7,30|210,7"; back yard "76.5,1.2,17.5,6,90|270,8",
  "76.5,1,17.5,12,250,30"), shots/w6/terrace2.png.
