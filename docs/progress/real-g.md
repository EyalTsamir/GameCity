# Last fix round (G1–G3) — logs

## G3 — Places, people, small props (branch claude/real-g3-places)

### Resume here
Fixes 1–3 coded + typechecked; verification shots in progress (shots/g3/shot.mjs = warm-up harness: 30 frames at
320×180 per view, optional wait for a standing train).

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

### Toggles
`?noplatformstay`, `?noboardmap`, `?nobikespokes` (quality low = no spokes).

### Code pointers
* platform actors: `sim/pedestrians/actors.ts placeCrowds()` (group 1 = platform), `sync()` visibility, events in
  `sim/pedestrians.ts:64-68`; train dwell 8–11 s (`sim/rail/trains.ts:197`).
* info boards: `props/scatter.ts:357,405` (station west plaza x −47..−26, z −142..−126.5) → `props.ts:366`.
* rack bikes: `props.ts:169 bikeRack` (street slots) → `furniture.ts bike()`; station rows `kit.ts bikeRow/bikeLite`.
