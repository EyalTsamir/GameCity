# F2 — People everywhere (final fix round)

Branch `claude/real-f2-people` (from `claude/pensive-gates-bim12i` e1c9780). Brief: real-briefs.md "F2".

## Resume here
* 2026-10-29 SESSION 3 (session_01XuhAMh8vfAev7DpzP7VknF) STARTED: merged origin/claude/pensive-gates-bim12i (b713343).
  Tasks: sail crew into F4 cockpit + tractor driver; train occupants; band drum detail; bus black side windows;
  re-judge swing/see-saw hands; cost note ;nooccupants/;noactors.
  2284ad0: sail crew perched on the F4 cockpit coamings (CrewSeat.seatH; figure() arg), JUDGED GOOD s3a 5/7 m;
  tractor driver = `RIDES` (actorDefs: a seat on a moving Object3D; tractor.ts registers its group; role farmer,
  flat cap) JUDGED GOOD s3a; band side drum rebuilt in landmarks/park.ts (shell, navy hoops, 8 brass rods+lugs,
  worn head, 3-leg stand; moved to z −0.12 off the drummer's knees); train occupants coded (occupants.ts
  syncTrains/seatCar: back-to-back on the k·1.9 seat-back planes, x ±0.62/±1.06, skip doors; car.seated →
  aInst2.y = 2; trainMaterial: heads skipped, trHitT → gl_FragDepth, cache key v8). f2shot: kinds train /
  tractor, spec `waittrain`.
* 2026-10-29 ~05:00 UTC — SESSION 2 ENDED (tokens.py ctxMax 264k > rule). Pushed. Typecheck clean; console
  clean and invariants {} in every f2shot run (q2–q4 reports).
  DONE s2: vehicle occupants for cars / vans / lorries / buses (`?nooccupants`, see "Vehicle occupants");
  judged GOOD: car driver + passengers (q3), bus driver + passengers through the windscreen (q4), band at 17 h
  (q5), market, fish quay, site worker, sailboat crew (real seated figures; hull/sails are F4's).
  Fixed: swing kids' hands on the chains / see-saw on the handle (not re-judged).
  HARNESS: flat single-colour captures are an intermittent pipeline glitch (the SAME view once fine, once flat
  green: q4) — not camera placement. f2shot.mjs now loads with `adaptive=0` (suspect: adaptive quality
  resizing targets); unconfirmed. Use scripts/agent-tools/f2shot.mjs (≈ 2 min per capture here), not bench.mjs
  (≈ 3–5 min per capture; 25-min background limit). Kill helper must not match its own command line.
  LEAD (after s2 ended): flat captures = pumpFrames' 8×8 clipped screenshots (Chromium tiles the patch) — clip
  removed in bench.mjs + f2shot.mjs (lead pushes the same to pensive-gates). F4 (pensive-gates 96a271a) rebuilt
  the tractor glass cab (seat/wheel/levers) and the sailboat cabin/cockpit: MERGE claude/pensive-gates-bim12i
  FIRST, then seat a tractor driver and move the sail crew into the new cockpit (positions: real-f4.md,
  real-requests.md) — do this before the train occupants.
  NEXT, in order: (1) bus side windows render as opaque black panes (q5 01_bus) — check on ?nooccupants whether
  pre-existing (side panes not ray-traced?) — if so the side passengers are hidden: give the flank panes the
  cabin Det / ask W2; (2) train occupants (plan in "Vehicle occupants"); (3) perf.mjs `;nooccupants` and
  `;noactors` (gl_FragDepth = no early-z on vehicles); (4) re-judge swing kid at 3 m; (5) judge-2 walker notes.
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

## Vehicle occupants (s2: cars / vans / lorries / buses DONE; trains TODO)
* occupants.ts `Occupants.sync(list, n)` after actors in pedestrians.ts frame(); per Vehicle (not twoWheel) within
  NEAR 38 m and onScreen, ≤ MAX 64 figures: seats from `CABIN[spec.model]` (models.ts, the glass Det: c 2 car
  a=[hw, belt, roof, zd] b=[zr, fz(front seat back z), rz(rear seat back)], c 4 bus, c 5 van/lorry cab); driver
  at x = +hw/2 (+X = the car's LEFT), hips fz + 0.2, hands on the wheel (barY belt+0.04, barZ zd−0.6, barX 0.16);
  front passenger 35 %, rear 20 %; bus driver (hw−0.62, zd−0.95) in operator shirt, passengers on the 0.82 m
  rows at ±hw·0.62 / ±0.52 (32 % by day). Colours dimmed (`dim()`: cabin shade, glass not drawn over them).
  NEVER set m.stopped (rider pose puts the left foot on the road).
* traffic: `Vehicle.occupants/seated`, render a2.w = 2 when seated (all shader uses of aInst2.w / vCamObj.w are
  min(…,1)); vehicleMaterial: `vSeated` skips the shader's own driver / bus passengers; glass writes
  gl_FragDepth of the traced hit (`thHitT`, fragment declares `uniform mat4 projectionMatrix`), every other
  fragment gl_FragCoord.z. Judged q2/q3/q4: car driver + passengers through windscreen and side glass GOOD;
  bus front (driver, passengers) GOOD. Open: bus rear-¾ side windows came out black once (q3 bus_0_8_155) —
  check (AO on pushed-back depth?) — q5 bus side view.
* Trains TODO (plan): rail/trainRender.ts update() composes each car (c.x, c.y, rail.z, yaw ±π/2 by tr.dir·flip,
  pitch −s·c.pitch, roll); passenger cars have aInst2.y = 1 (used as an emissive multiplier → use min()); saloon
  in trainMaterial.ts trInterior(): floor FL 1.13, seat backs on z = bay·1.9 planes, heads at |x| 0.95, y 2.4
  (skip those heads when seated, aInst2.y = 2); same gl_FragDepth trick on T.WINDOW / DOORWIN glass.

## (old) Vehicle occupants plan
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
* `?nooccupants` — no real vehicle occupants (the glass shader's ray-traced ones everywhere). Cost not measured
  (≤ 64 extra figures, only within 38 m; gl_FragDepth disables early-z on the vehicle material — measure).
* `?noactors` — the old box figures (person() / figure() build their boxes again) and no Actors class at all
  (no market / platform / quay crowds). Cost: not measured yet (≈ 60 extra figures in a downtown frame stats,
  mostly pin/tiny LOD beyond 40 m; capacity shared with the crowd's 720).

## Next

## Tokens (session 2, tokens.py)
```
agent               calls   w(M)    %  ctxMed  ctxMax
LEAD                  166    3.6100.0    185k    268k
```

## Tokens (session 1, tokens.py)
```
agent               calls   w(M)    %  ctxMed  ctxMax cold coldW%  idle>5min: warm/cold
LEAD                  121    2.8100.0    195k    257k    0     0%  2/0

```

## Sheets
* docs/progress/real/f2_s2_people.jpg — s2: car occupants, bus driver + passengers, band 17 h, market, quay, sailboat crew.
* docs/progress/real/f2_quay_s1.jpg — fish quay 11 h: a fisher in oilskins at the creel stack (real figure).
* capture-set report shots/f2/a2/report.json: console clean, invariants {}, frameErrors [].
