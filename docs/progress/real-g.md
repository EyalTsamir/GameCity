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
