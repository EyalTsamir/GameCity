# W6 — Dense real places I: market square, café terrace, back yard ("real things" round)

Branch `claude/real-w6-places` (from `claude/pensive-gates-bim12i` @ d30138d). Brief: docs/progress/real-briefs.md "W6".
Owned: src/world/props/** + props.ts, src/world/life/**, src/sim/pedestrians/cafes.ts + tableware.ts (presentation),
and (inherited from W3) the market stall in src/world/landmarks/civic.ts.

## Resume here
* 2026-10-29 00:50 — **Session 2 ends (context cap).** Commits 2be38b1 + final. Console clean, invariants {}.
  - **Lead's s1 "bugs" were camera artefacts:** s1 views `76.5,…,yaw 90|250` put the camera INSIDE lot 64
    (camera = target − dir·d; yaw 270 looks −X from the yard), its rear wall culled → the door seemed free-standing
    and W1's window sills (buildings-sills/-surrounds, y 0.95, x 73.84 = footprint − 0.16) seemed to float. Proven
    by A/B (they stay with ?nobackyard/skip=life/skip=props, go with skip=buildings) + instance probe; from inside
    the yard they sit on the wall. Use the yard-side views below for the back yard.
  - **Back-yard wall set ON (no gate):** wall line from lot footprints (townhouses of the block whose yard side lies
    on the court edge, wall face = footprint − 0.16; `walls[]` in edge coords; `wallItem()` checks a disc r + 0.1
    out). Rear windows from a probed rule (bay = L/3.4, 3 windows; request to W1 for a real export): door + step +
    mat + herb pots in the 1.67 m corner gap, gas meter between windows below the sills, broom, downpipe + water butt
    at the far end of the house (height = floors·3.3), AC high between windows of the second house, apron 1.4 m
    with hairline cracks, weeds, damp edge + splash dirt. Judged real at 4.5 m (shots/w6/s2/wall2.png).
  - **Wind:** parasols (props casters mesh, aSway pivot+flex, furnitureMaterial sway variant; `?nosway`) and market
    stall canopies + valances (landmarks kinetic kit, new ANIM.CANOPY = 3: billow zero on the rails, overhang flap;
    `?nostallwind`), both off on low. Verified by A/B frame diffs at speed 1 (shots/w6/s2/sx.png; at speed 0 uTime
    stops — nothing moves). Shadows of parasols stay static (props casters depth material; ~4 cm).
  - **Market:** 22 → 73 items. Cause: stock 1.75 m behind a stall with r 0.5 failed its OWN 1.3 m feature disc →
    `free(x, z, r, ignore)`; now per stall: stock under the trestle table (boxes/crates), 2–3 back groups (crate
    stacks, box piles, cardboard, sacks on pallet, trolley, nested empties) at local z −1.05…−1.9, side item 75 %.
  - **Kerb café:** kerbCafe() = pedestal table + 2 bistro chairs pulled out/angled + cups on saucers, sugar, menu.
    Row of four at x 51.1, z 73.6–84.7 (next to the market).
  - Judged (docs/progress/real/w6_s2_places.jpg, w6_s2_backyard.jpg, w6_s2_sway.jpg): market 10 m crowded with stock
    at every stall back, kerb café bistro set real at 3.5 m, back door real; terrace frame `-38.3,1.2,-77,6,200,8` is
    blocked by a pillar (framing, not a fault). Perf:
    shots/w6/s2/perf.log (see Toggles).
  **Next (session 3):** judge shots/w6/s2/judge if the lead hasn't; delivery van (W2 body request); terrace extras
  frame from the plaza side; awning sway on shop awnings is W1's (buildings) — request if wanted; golden overview.
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
  Session 1 tokens.py: TOTAL weighted 2.1M (cache read 72 %, write 12 %, output 16 %), 88 calls, ctx median 166k /
  max 246k (over the 170k cap: get_session reported used_tokens 0 again — use tokens.py ctxMax instead), 0 cold.
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
* Wall items with `free()` centred 0.45 m out and r 0.7: the disc reaches into the BUILDING cells → door rejected.
* Sway test at `speed=0`: uTime is sim time → no motion; test at speed ≥ 1 with an on/off control.
* Back-yard wall line from the courtyard rect edge (+ `occ BUILDING` 0.6 m behind): occupancy passes but the
  visible wall is elsewhere → door free-standing. Disabled (`?w6wall`).

## Toggles / tiers / costs
* `?nomarketlife`, `?noterracelife`, `?nobackyard` (all off on **low**); `?nosway` (parasols), `?nostallwind`
  (stall canopies) — both off on low. (`?w6wall` removed: the wall set is always on with the back yard.)
  Big items in KF (fine < 300 m), small ones in KD near cells (< 30 m). Cost not measured yet.
* Café table/chair upgrade has no toggle yet (always on).
* **perf.mjs s2** (market view `27.5,1,78.5,16,200,28`, 12 h, 1280×720, software GL — ms are noise ±15 %, judge
  tris/draws): draw calls 148 in every variant (no new draws: all in existing kits; sway = 1 extra program on the
  casters mesh, canopy in the landmarks kinetic mesh). Triangles in view: market life +42 k, terrace life +15 k,
  back yard +33 k (of 3.67 M). ms: base 1183, nomarketlife 1035, noterracelife 1208, nobackyard 1370, all off 1208
  → no measurable cost in software GL; measure on the target GPU.

## Sheets
* shots/w6/w3left/sheet_1.png (W3 leftovers), shots/w6/p1 (capture-set views: market "27.5,1.3,76,9,0|180,6",
  "27.5,1,78.5,16,200,28"; terrace "-38.3,1.1,-78.6,7,30|210,7"; back yard "76.5,1.2,17.5,6,90|270,8",
  "76.5,1,17.5,12,250,30"), shots/w6/terrace2.png.
