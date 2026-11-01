# Last fix round (G1–G3) — logs

## G3 — Places, people, small props (branch claude/real-g3-places)

### Resume here
All 8 items pushed. Verified: platform with a standing train keeps ~6–8 people (`real/g3_platform_train_in.jpg`,
forced `train:arrive`), rack bike spoked wheels + drive side (`real/g3_bikerack_3m.jpg`), downtown console clean +
invariants {} (11:10 code). Not verified by capture (software GL ≈ 8–12 min per warmed view here): info-board
faces, pram, shirt V, group gap, bark. Northgate smoke: NOT fixed for that roof (see item 4). Next: capture those
(shots/g3/shot.mjs `out.png "x,y,z,d,yaw,pitch|…" hours q mode`, mode 2 = force a standing train) and tune.

### Done
1. **Platform no longer empties when a train stands** (judge 3 #4) — `sim/pedestrians/actors.ts` `onPlatform()`:
   ~45 % of standing passengers (60 % of the seated) wait on (other line / meeting someone); the rest board one by
   one 2–7 s into the dwell (doors open at 1.2 s) instead of all vanishing at `train:arrive`. Toggle
   `?noplatformstay` (old behaviour). Cost: none (same actors).
2. **Info board printed** (judge 3 #4 "blank board") — `props/kit.ts infoBoard()`: header band with title lines,
   street-grid blocks, main road, rail dashes, a legend column with coloured keys + printed lines, a pin on the
   "you are here" dot. Toggle `?noboardmap`. ~+60 boxes per board face (a handful of boards in the city).
3. **Bike wheels** (judge 3 #8) — `props/furniture.ts spokedWheel()` (tyre ring, rim, hub, crossed spokes) used by
   `bike()` (street racks: 16 segments / 16 spokes) and `kit.ts bikeLite()` (station rows: 12 / 10). Toggle
   `?nobikespokes`; quality low keeps the old disc wheels on `bike()` (setBikeSpokes in props.ts).
4. **Smoke from a bare roof** (bugs-3 #4) — the emitter is an industrial roof vent (`buildings/industry.ts vents()` →
   `anchors.chimney` → `life/chimneys.ts` 'works'). Vents were placed at one height anywhere on a gable/barrel
   roof, so near the ridge the vent was inside the roof and only the smoke showed. Now `vents()` takes the roof
   height at the vent spot (slope / barrel profile). NB: buildings/** is G1's area — one-function change.
   **Still OPEN:** the after-capture (`real/g3_northgate_smoke_open.jpg`, view −120,2,−110,55,35,28 at 11 h) still
   shows puffs over the low-pitch grey roof on the right with no vent visible, so that plume has another source
   (or the vent geometry is missing there). Trim chunks are frustum-culled only (no distance LOD), and
   `gen.ts chimney()` always builds its stack, so next: ray-pick / log `ctx.services.buildings.chimneys` near
   (−93.3, −105.5) (lot kind + which call site) and compare with the roof generator of that lot.

5. **Shirt "bib / jagged star"** (judge 3 #7) — `sim/pedestrians/shader.ts` torso: with a jacket the shirt V was
   chosen per vertex (`up = top` when aux.x < vw; the neck-cap apex counts as front) → colour interpolation drew a
   jagged white star. Now the V is the signed boundary `s = |angle| − (h − 0.5)·1.6` (A = jacket, B = shirt),
   which FRAG_COLOR resolves per pixel (fwidth). Only for rings > 0.12 above the jacket hem. No toggle (bug fix).
6. **Groups interpenetrate** (judge 3 #7) — `crowd.ts` party offsets: +0.03 per adult, +0.05 per bag / rucksack /
   briefcase carrier (pairs 0.6 → 0.66–0.76 m, trios 1.1 → up to 1.26 m). Toggle `?nogroupgap`.
7. **Pram** (judge 3 #7) — `figure.ts buildPramGeometry()`: rounded 5-ring bassinet (16 sides), piped rim, apron +
   blanket edge, ribbed 10-segment hood, chrome chassis with folding joints, black tyres with hub discs and axle
   caps (rear 0.14 / front 0.12 m), basket. Toggle `?nopramdetail` (old mesh). ~4× the old triangles on a few
   instanced prams.

8. **Street-tree bark** (judge 3 #10, time-boxed) — `vegetation/material.ts` furrow branch of the in-shader bark:
   ridges of the existing furrow noise now tilt the normal (gradient × 0.045, near-only fade) and ridge plates
   lighten / furrows darken. Knob `foliageKnobs.bark` (uThBark): `?nobarkrelief`, quality low off. Not done: the
   flat shard branch cards seen from inside a crown.

9. **Rack bike drive side** — `bike()`: chainring, chain runs, crank arms + pedals (with the spokes; off on low).

### Harness notes
* `shots/g3/shot.mjs`: warm-up = 26 screenshots at 320×180 per view; mode 1 waits for `train:arrive` (never came
  within 150 s at 4× — even with `railx=-90&raildir=1`), mode 2 emits `train:arrive` itself (works).
* The initial dwell at load emits no `train:arrive`, so platform actors are all there then (unchanged).
* Resizing the viewport logs a `glBlitFramebuffer … not all the same size` WebGL warning (harness only).

### Toggles
`?noplatformstay`, `?noboardmap`, `?nobikespokes` (quality low = no spokes), `?nogroupgap`, `?nopramdetail`, `?nobarkrelief` (quality low = off).

### Code pointers
* platform actors: `sim/pedestrians/actors.ts placeCrowds()` (group 1 = platform), `sync()` visibility, events in
  `sim/pedestrians.ts:64-68`; train dwell 8–11 s (`sim/rail/trains.ts:197`).
* info boards: `props/scatter.ts:357,405` (station west plaza x −47..−26, z −142..−126.5) → `props.ts:366`.
* rack bikes: `props.ts:169 bikeRack` (street slots) → `furniture.ts bike()`; station rows `kit.ts bikeRow/bikeLite`.

# Last fix round (G1–G3) — shared log

## G2 — Ground, track, water (branch claude/real-g2-ground)
### Resume here
* 11:37 UTC FINAL (time-box). Colonnade dots also survive uRdWear=0 (shots/g2/cmp5.png) → they come from the base
  slab pattern in the joint/edge branch of glsl.ts ~l.340–400 (joint rdLine / chamfer darkening / per-stone rdN
  tilt `rdN = … * 0.06 * hd`) on the plaza:2 forecourt slabs (frame 1) in the shaded arcade. Next session: A/B
  that block (set rdN = 0, then hd = 0) at office 3 m with shots/g2/probe.mjs (one load, `~`-separated variants;
  roads materials expose userData.rdUniforms), and widen the joint filter (rdLine width vs fq) if it is the joint.
* 11:33 UTC checks: typecheck clean; downtown shot invariants {} + console clean; golden vs base worktree (port
  5174, 1280×720, 11 h): overview 0.0, downtown 0.02. Colonnade dots: hide:roads-hardscape removes them (arcade
  floor is plain) → they ARE in the hardscape shader, not litter (A/B with uRdWear=0 → shots/g2/p10).
* 11:18 UTC: pushed fountain + ballast (judged, sheet docs/progress/real/g2_fountain_ballast.jpg), straight slabs
  (judged office 3/10 m), litter max-footprint + arcade floor 0.005 (NOT effective on the colonnade dots — see
  Findings). Golden overview/downtown vs base worktree (port 5174) running → shots/g2/gold_{base,now}.
* 11:00 UTC: pushed straight-slab fix; in flight (uncommitted until judged): litter footprint fix (glsl.ts rdLitter),
  arcade floor 0.02→0.005 (buildings/towers.ts, harmless, kept), fountain jets/pool (?nofountainfx), ballast bed
  relief (?nobedrelief). Captures: shots/g2/{b1 (ballast+fountain), p6 (office 3 m)}.
* 10:25 UTC start. Base = claude/pensive-gates-bim12i @ 2dac266. Order: downtown pavement (judge 3 #2) → ballast/
  cutting (#6) → fountain (#5) → church gablet rod.
### Findings
* UPDATE 11:15: the litter fix did NOT remove the dotted rows under the Café Nord arcade (office 3 m, cmp
  shots/g2/cmp3.png) — so the cause below is wrong for that frame (litter fade kept: harmless hygiene, may still be
  the judge's "barcode" in the tree 3 m frame — unverified). Still to try: probe with hide:roads-hardscape
  (shots/g2/q8.sh) — if the dots vanish they are in the hardscape joint/edge shading (plaza:2 forecourt slabs,
  frame 1), else in buildings (shopfront base / arcade floor).
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
* Straight courses on sawn slabs: hand-laid wander/jittered lengths only for units < 0.35 m (setts, pavers);
  per-stone tone/tilt (hd) unchanged for < 1.3 m. Office 3/10 m: joints straight, no wavy lines.
* Fountain (?nofountainfx, all tiers — a few ALU on small surfaces): jets = aerated water (dense streaky core,
  feathered edges instead of a bright fresnel rim, tearing + fading before landing); drops small and soft (were
  white beads); pool = shallow water over a pale stone floor with moving caustics, deep teal in the middle, extra
  wind chop, roughness 0.06→0.1. Judged at fountain 3 m: no longer flat cyan / glass tubes.
* Ballast bed (?nobedrelief, all tiers; ≈ +14 tris/m of track): cross-section profile instead of a flat top —
  cribs 4–5 cm below the sleeper tops (sleeper sides show), shoulders heaped 2 cm over the sleeper ends, rolling
  off to the slope; per-vertex jitter ±1.1 cm every 0.33 m; shoulders stepped with the top (no cracks). Ballast 3 m
  judged: sleepers now sit IN the bed. Stone texture itself (voronoi) unchanged.
### Tried and rejected
### Open (not done)
* Colonnade dotted rows (cause unidentified, see Findings), cutting slab ledges (#6), church gablet rod
  (landmarks/church.ts ~l.84–118: the two raking roofFace slabs are symmetric in code — the rod may be another part;
  needs a ray pick at the judge view), ballast stone relief (still a flat voronoi texture).
### Toggles / tiers
* ?nofountainfx, ?nobedrelief (all tiers). Debug handle: roads materials expose `material.userData.rdUniforms`
  (lets one page load A/B uRdHand / uRdWear).
# Last fix round (G1–G3)

## G1 — glass and interiors (branch claude/real-g1-glass)
### Resume here
**Done for this round (11:38 UTC).** Sheet: `docs/progress/real/g1_glass.jpg` (left = before, right = after:
bakery, Café Nord, tower lobby, apartment, car; last row = bank/bookshop bays before (top) / after, train cab after).
Fixes 1–10 below pushed (typecheck, console clean, invariants {} at the bugs-3 bank view). Before: shots/g1/before
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

* Train cab: reflective glass with sky / skyline and parked wipers (after2/train_cab_6m) — reads as glass; the
  desk behind is barely visible under the reflection (fine at 6 m).
* Checks: typecheck; `shot.mjs --view downtown --invariants` console clean, invariants {} (11:37).

### Toggles / tiers / cost
`?noglassvar` (facade: 1–5, 9, 10; all inside the near-detail path `uDetail`, i.e. the facade quality tier),
`?novehglass` (6, 7; inside `uVehDetail.x` = cabin-interior tier), `?notrainglass` (8; reflection all tiers, cab +
wipers only when `uTrInt`, off on low). Cost: fragment ALU only on glass pixels (one extra plane intersect for the
desk row, one for the café counter is on the back-wall path); no draws, no textures. **Not measured with perf.mjs**
(no time in the box — software GL here can only compare variants in one run anyway).

### Open
* Bus side glass over real seated passengers: needs a blended reflection-only overlay draw (see above).
* Shop door: handles added, but the door is still a glazed pane pair (no kick plate / push plate).
* Tower lobby terrace has no café front (judge #9) — layout, not glass (plan / props).
* Bookshop bays still all books (different shelves per bay now, same type by design).

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
9. **Lobby plants in two species** (`?noglassvar`): broad-leaved rubber plant or upright snake plant per pane
   (judge #9: same plant in every pane; verified after3).
10. **Pull handles on glazed doors** (`?noglassvar`, near detail): steel bars beside the meeting stiles, door-width
   openings (< 2.3 m) only — the first try also put them on every tall lobby pane.
8. **Train cab windscreen** (`?notrainglass`; cab/desk/wipers only when `uTrInt` = not quality low): stylised
   sky / skyline / ground reflection by the reflected direction in the car frame (Fresnel, floor 0.2), dim cab
   with the desk, two parked wipers — no longer a black void.
