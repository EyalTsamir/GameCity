# F2 — People everywhere (final fix round)

Branch `claude/real-f2-people` (from `claude/pensive-gates-bim12i` e1c9780). Brief: real-briefs.md "F2".

## Resume here
* 2026-10-29 session 1 STARTED. Reading done: riders.ts is the pattern (extra Members posed by animate.ts, passed
  to `CrowdRenderer.write(.., extra, nExtra)`). Plan: `pedestrians/actors.ts` = a module-level registry other
  modules feed (person() / figure() / vehicles), drawn as extra posed Members.

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

## Tried and rejected (why)

## Toggles / tiers / costs

## Next
