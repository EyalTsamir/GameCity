# Pedestrian sim polish — "people never walk through each other"

Owner: simulation engineer (src/sim/pedestrians.ts + src/sim/pedestrians/{crowd,places,rail}.ts).
Render files (render.ts / figure.ts / looks.ts) untouched. Backups of the originals: session scratchpad `peds-orig/`.
Headless harness (no browser, no lock): scratchpad `pedsim/` — `node build.mjs && ./suite.sh <tag>` bundles
core + Crowd with rolldown and runs 3 variants (3 min @4x 30fps from 16:15, 3 min @4x 55fps from 07:00,
2 min @1x from 11:00); prints overlap episodes (<0.35 m), pair-seconds, stuck dumps, corner overflow, sim ms.
`--snap x,z,half --snapat t1,t2` writes top-down PNG + legend of a spot (great for corner jams).

## Status
- [x] M0 reproduce (11:50)
- [x] M1 avoidance rewrite (walk state) — on disk, typechecks, loadable
- [x] M2 doors / bus stops / corners / free motion / jam fallbacks — on disk, typechecks (15:10)
- [x] M3 verification (soak 4x, shot 1x, close-ups, tsc, simMs) — DONE 16:10, task complete

## Baseline (before)
- `node scripts/soak.mjs --minutes 3 --speed 4 --every 20` (full city): 9 overlap invariant hits in 9 samples
  (dogwalker/dogwalker sidewalk+park, jogger/dogwalker, crosswalk dogwalker/student, family walk vs tourist act),
  fps 44-60, pedestrians simMs 1.4-2.6 ms at 4x with 350-420 people. Console clean.
- `shot.mjs --wait 60000 --invariants --stats` (1x): 424 people, simMs 1.27, invariants empty at that instant.
- Harness variant a (3 min @4x): overlap episodes 2210, >2.5 s: 82, >10 s: 2, pair-seconds 1522,
  body contact (<0.45 m) 2638 s, dog-through-person 640 s.

## Root causes found
1. Follower speed cap = leader speed when already overlapping (gap<0 -> vCap = mvf): never drops back.
2. Single-obstacle lateral "pick" ignores the rest (dog/member pairs, crowds) -> oscillation / stalemates.
3. Dog walkers: symmetric 0.42 span on both sides -> only 0.76 m lateral range on a sidewalk: can't pass anyone.
4. `squeeze` mode (after 3.2 s blocked) ignored all caps = deliberately walked through people (hid deadlocks).
5. Free-motion states (toWait/fromWait/approach/leave/board/fadein) had no avoidance at all.
6. Bus-stop queue spots in the middle of the walking band (passers-by had to squeeze through the queue).
7. Single-file door legs (front-garden paths up to 6-12 m) used in both directions at once -> head-on deadlocks.
8. Corner wait spots on the corner node / in the arrival lane of the crossings -> arrivals blocked on the zebra.
9. Wait-spot re-entry points clamped to the band -> two groups stepping onto the same point.

## Done (M1/M2, crowd.ts + places.ts)
- avoid(): party footprint (members side by side / file, dog on the left as 2 discs, pram as 2 discs); every
  obstacle disc blocks a lateral interval; free band = bounds minus conflicts (most urgent first); steer to the
  nearest free offset, consistent sides (head-on: both keep right; otherwise away / split by id), side memory,
  never slide sideways across someone alongside (SIDE / TOUCH reachability); speed caps: follow (gap P-control,
  drops back when too close), stop before standing/oncoming people, arrive no earlier than the sidestep ends;
  rear party yields in overlaps; parties close into single file to let others pass; no overtaking on zebras.
- Dog walkers use asymmetric extents (dog on the left): lateral range on a sidewalk 0.76 -> 1.28 m.
- squeeze removed -> "relaxed" mode after 3.2 s blocked (0.8 s on a crossing): shoulder-brush clearance and may
  step up to 0.8 m beyond the band onto free pavement (occupancy SIDEWALK/PATH, no furniture/buildings).
- Avoidance runs every sub-step (large dt at 4x); facing follows the rail (no sideways turning when dodging).
- Door legs: one direction at a time; people going in have priority, people coming out wait inside (unseen).
  Train passengers retry a busy station door instead of being dropped.
- Bus stops: waiting spots under the shelter, along its front at the kerb edge and beside it (furniture checked).
- Corner waiting: right half only, 2 kerb rows (no spot on the corner node), clear of furniture/poles,
  re-entry points claimed (no two groups step onto the same point); places.furnitureNear() helper.
- Free walks (toWait/fromWait/approach/leave/board/fadein) wait for people in the way (4 s timeout).

## Harness results (same scenarios, orig -> now @15:20; invariant samples now all empty)
| variant | pair-s overlap | episodes >2.5 s | >10 s | contact s | dog-thru s | stuck inv |
|---|---|---|---|---|---|---|
| a 3 min 4x 30fps from 16:15 | 1522 -> 156 | 82 -> 12 | 2 -> 1 | 2638 -> 581 | 640 -> 90 | 0 -> 0 |
| b 3 min 4x 55fps from 07:00 | 2398 -> 167 | 164 -> 7 | 3 -> 2 | 3956 -> 428 | 886 -> 204 | 0 -> 0 |
| c 2 min 1x 60fps from 11:00 | 301 -> 2 | 26 -> 0 | 0 -> 0 | 460 -> 25 | 4 -> 0 | 0 -> 0 |
sim cost in node, back to back at 1x: orig 0.54 ms, new 0.54-0.56 ms (4x/30fps: parity after avoidance throttle).

## More done (M2, after resume)
- crossing paths: whoever reaches the crossing point first goes, the other slows to pass behind (no sidestep)
- keep-right for head-on (|lateral| < 0.3), stronger side penalty; unresolvable oncoming -> edge over to own side
- reach check uses the party's actual offset (could be outside a narrowed band)
- free walks steer round people (turn right first, walkable ground only), no walk-through timeout;
  leavers join a walkway politely (wait at its edge); viewpoint visitors on paths set off from where they
  stand (positional ease, no jump); corner groups stuck > 3 s rejoin their walk
- queueing at a kerb/doorway: stand behind whoever waits ahead; unresolved overlap alongside -> single file
- jam ladder: squeeze (3.2 s) -> press past (shoulder contact, >= 0.35 m) -> turn round and go another way

- browser soak (code of 15:12): 0 invariant hits in 9 samples (orig 9), fps 50-60, simMs 0.1-1.2 @4x (orig 0.2-2.6)
- later: jam ladder on lack of progress, queue shuffle-back, one group per door per 1.4 s, pier-end spots
  along the railings, sea-facing pier benches skipped, no bus spots in front of doors, stuck-in-doorway -> back in

- browser soak #2 (code of 15:24): found bus alighting overlaps (all passengers on one door point) -> fixed
  (queued 1.1 s apart, only when the door spot is clear, no waiting spot near the bus door), plus kerb-queue /
  zebra own-half rule, road jam level, staggered beach departures, safe rejoin (landing spot must be free)

## M3 results (browser, full city)
- final soak (code of 15:36) 3 min @4x: 0 invariant hits in 9 samples (orig 9), console clean, fps 46-60.
- shot 1x 60 s: 417 people, invariants {}, console clean (orig 424 people).
- close-ups @11:00 (plaza 27,0,25 / junction 0,0,-65 / park -60,0,17), 2 frames each 1.5 s apart: natural motion,
  couples/trios side by side, pram, dogs, groups at the fountain/statue disperse; no interpenetration; the
  junction was simply quiet at that moment (harness: 4-9 people within 14 m in orig and new alike).
- after the close-ups: bench filter relaxed (only the 2 sea-facing pier benches dropped: 42/44 benches),
  bus stops 6 -> ~9 spots (shelter front corners + further along the kerb).

- final confirmation on the FINAL code (16:05): soak 3 min @4x 0 invariant hits (9/9 samples clean), console
  clean, fps 45-60, simMs 0.23-1.52 @4x (orig 0.18-2.6); shot 1x: 420 people, invariants {}, console clean,
  sitting 32 / beach 29 / bus 19 / crossings 115 / boarded 21 (orig 25 / 34 / 18 / 81 / 19).
- CPU (node, back to back, 1x 60 fps, 11:00, ~420 people): orig 0.67-0.76 ms, new 0.58 ms.

## Next
- nothing open for this task. Possible follow-ups: sitting on the bus-shelter bench; more corner capacity.

## Known issues
- Corner capacity: about a third of the groups that must wait at a kerb find no free spot (spots only on their own
  right half, out of every crossing's arrival lane, clear of poles); they queue on their own walk before the
  corner instead (natural, but queues reach back along the sidewalk at busy junctions in the rush hours).
- Free walks never walk through anyone now: people stepping off a bench/stop/viewpoint wait at the walkway edge
  for a gap (up to 8 s) and steer round others; after 10 s stuck they set off from where they stand (only if that
  spot is free). Hemmed in for 30 s, a group quietly fades out (last resort, ~8 per 12 game hours city-wide).
- Bus stops hold ~9 waiting spots (was 16, some in the middle of the walkway).
- Jams use shoulder-contact clearance (0.35-0.43 m between centres) for a few seconds before someone turns round;
  the 0.35 m invariant is not tripped by that, but contact is visible in the densest morning corners (west park).
- Headless harness has no cars/buses (stop-sign gaps and bus boarding only verified in the browser runs).
