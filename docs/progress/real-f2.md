# F2 — People everywhere (final fix round)

Branch `claude/real-f2-people` (from `claude/pensive-gates-bim12i` e1c9780). Brief: real-briefs.md "F2".

## Resume here
* 2026-10-29 ~03:25 UTC — SESSION 2 (session_01XuhAMgh2gQQLc7zRmcxRjR). 57286e8: vehicle occupants coded
  (pedestrians/occupants.ts, `?nooccupants`; traffic Vehicle.occupants/seated, render aInst2.w = 2 when seated,
  vehicleMaterial: vSeated skips shader occupants + glass writes gl_FragDepth of the traced cabin hit; models.ts
  `CABIN[kind]` = the glass Det recorded at build). bench.mjs: `actor-<role>` classes (window.__actors = ACTORS).
  Paths here: /home/user/gamecity (lowercase).
  JUDGED s2 (shots/f2/b1, b2): site worker stooped at the brick pallet (10 m) OK; swing kid 3 m OK but hands
  in front of the chest → fixed (02c8010: swing hands on the chains, see-saw on the handle bar); market 8 m
  (shopper at the cheese counter, queue, browsers) GOOD; fish quay 3/8 m (creel stacker, box sorter, crabber
  crew) GOOD. Several bench captures came out as a flat colour (camera inside something / 1st capture) —
  bench.mjs costs ~3 min per capture here (5 renders each) and the 25-min background limit killed b2.
  → scripts/agent-tools/f2shot.mjs: lean one-load captures (960×540, no LOS search) for car/bus/boat/actor.
* 2026-10-29 ~03:10 UTC — session 1 ENDED at the context rule (tokens.py ctxMax > 170k; get_session reads 0).
  Pushed. Code done (below) and typechecks; console clean in every run (0 errors / warnings / frame errors).
  JUDGED ONLY ONE VIEW: shots/f2/a2/quay_11.png — a real figure in oilskins working at the creel stack (was
  nobody). NOT YET JUDGED: site workers' work poses (bs2), market shoppers (mkt), platform passengers (plat),
  playground kids on swing/seesaw (pg1), crabber / ferry / sail / rowing crews (mb1, fe1), band (16–21 h).
  HARNESS PROBLEM (not caused by F2 — reproduced with `?legacypeople&noactors`): in this container the first
  capture after `setHours` is a blank page colour (shot.mjs `--hours 11` → always blank, capture-set → first
  view blank), and some capture-set views came out a flat fog colour (mkt, plat at 11 h). Use `?time=11` in
  `--q` and no `--hours` with shot.mjs (bs2.png rendered that way); with capture-set put a throw-away first view.
  Next, in order: (1) judge every place above at eye level + 10 m, fix poses (stoop depth, hands; kids' seat
  heights on swing/seesaw; boat seat floor = seat − 0.42 m guess; standing crew use rider mode 3 = hands on a
  rail); (2) perf.mjs `--variants ";noactors"` at harbor / downtown; golden.sh overview; (3) vehicle occupants
  (judge 2 #3) — NOT STARTED, see "Vehicle occupants plan"; (4) walkers clip through the static market
  shoppers? (they stand in the aisle; crowd has no obstacle for them) — check, else add them as occupancy /
  avoid discs; (5) judge 2 pedestrian notes (lockstep groups, flat clothes) last.

## Code pointers
* riders.ts: `Riders.sync()` per frame → `list`/`n` → render.write extra. Member fields: rideG (RideGeom seated
  pose: mode 2 = seated, feet on a floor, hands at bar ±barX,barY,barZ), sit/seatH (bench), forceIdle (IDLE
  0 relaxed … 8 guitar, animate.ts:78), chat, carry (waiter), faceYaw.
* person(): landmarks/parts.ts:202 (calls: construction.ts:445 workers, park.ts:557 band, :568 conductor, :790 kids).
* Vehicle occupants are ray-traced in the glass shader: traffic/vehicleMaterial.ts `thInterior` (~l.357; bus
  passengers ~l.382, bus driver ~l.392, car driver ~l.434); trains rail/trainMaterial.ts ~l.239.

## Done
* `pedestrians/actorDefs.ts` (import-free registry: `addActor()`, `ACTORS`, `CREW` boat seats, `?noactors`) and
  `pedestrians/actors.ts` (`Actors`: one Member per actor, appended after the riders into the crowd renderer's
  extra list; `sync()` per frame: landmark vis group / hours / 20-min presence hash `p` / fade, swing rotation
  from the landmark anim, boat crews carried by the boat matrix; seated = rider pose mode 2 via `seatGeom()`,
  standing on a deck = mode 3 `standGeom()`; rowers' hands follow `rowPhase`).
* person() (landmarks/parts.ts) registers an actor (world pos from `K.b.frame`, anim from `K.b.anim`) instead of
  boxes; figure() (boats/models.ts) records a `CREW[pool][variant]` seat (pool set in buildBig/SmallBoats).
* Work poses: `Member.work` 1 stooped (hands down into a crate/creel) / 2 bench height, animate.ts (torso bend
  block after headRoll + reachFig hands before the waiter block). Site workers get work by seed.
* Dense places (actors.ts `placeCrowds`): market — counter customer (TALK), browser, queuer per stall
  (8–14.5 h, p 0.8/0.5/0.35, 40 % with shop bags); platform — 16 standing along the edge + 5 on benches +
  the wheeled case's owner (group 1: hidden while a train stands in, back by `delay` s after it left).
  Fish quay (call site in harbor/quay.ts): creel stacker, box sorter, net mender on the store bench, one
  talking to the boat (5–15 h).

## Vehicle occupants plan (judge 2 #3, not started)
* Cars / buses: occupants are ray-traced in the glass shader (traffic/vehicleMaterial.ts `thInterior`, called
  from FRAG_DETAIL ~l.157 with `occupied` = aInst2.w (the lights-on factor!)). Train: rail/trainMaterial.ts ~l.239.
* Plan: real figures as extra Members (like riders.ts: car driver = rider pose mode 2, seat + wheel as bar, feet
  forward; bus passengers mode 2 hands on the knees), only within ~40 m of the camera; the glass shader returns
  the interior hit distance and writes gl_FragDepth of that hit (write gl_FragCoord.z for every other fragment),
  so a figure inside the cabin depth-tests against the ray-traced seats/dash; the shader's own driver /
  passengers are skipped for vehicles that have real ones (a flag per instance). Open: figures show without the
  glass reflection over them (consider a cabin-shade factor in the people shader), early-z loss on the vehicle
  material (measure).

## Tried and rejected (why)

## Toggles / tiers / costs
* `?noactors` — the old box figures (person() / figure() build their boxes again) and no Actors class at all
  (no market / platform / quay crowds). Cost: not measured yet (≈ 60 extra figures in a downtown frame stats,
  mostly pin/tiny LOD beyond 40 m; capacity shared with the crowd's 720).

## Next

## Tokens (session 1, tokens.py)
```
agent               calls   w(M)    %  ctxMed  ctxMax cold coldW%  idle>5min: warm/cold
LEAD                  121    2.8100.0    195k    257k    0     0%  2/0

```

## Sheets
* docs/progress/real/f2_quay_s1.jpg — fish quay 11 h: a fisher in oilskins at the creel stack (real figure).
* capture-set report shots/f2/a2/report.json: console clean, invariants {}, frameErrors [].
