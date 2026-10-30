# Living scenes — small stories with a beginning, middle and end

Branch `claude/living-scenes-2a2bcc` (cut from `claude/pensive-gates-bim12i` @ 078430f). Dev server port 5189, harness
from the main checkout (`node C:/Projects/GameCity/scripts/<x>.mjs --url http://127.0.0.1:5189/`).

## Resume here
All scenes built and committed; remaining work is listed under "Status". Cheap ways to look at a scene: the table below
(view + hour); `__city.ctx.services.scenes.scenes` holds the scene objects (private fields readable from `--eval`).

### Status
- [x] audit (below)
- [x] framework: `src/sim/scenes.ts`, `scenes/kit.ts`, `scenes/cast.ts`, `KerbStop` in `sim/traffic/sim.ts`
- [x] market day, delivery stops, wedding, musician audience + sound, park life, balcony life + window cradle
- [x] box-hunt hand-offs: garments + washing hours, hand-tied bunting (stack smoke: see "Stack smoke" below)
- [x] pedestrian bugs (see "Pedestrian bugs")
- [x] verified by eye: every scene from eye level, market / wedding / musician in walk mode, wedding from mid-distance, stack smoke from the air
- [x] checks: see "Verification" (perf A/B numbers go there last)

## What was added
| scene | story | toggle | quality | best view (`--view`) + hour |
|---|---|---|---|---|
| Market day | van turns in over the pavement ~6:20, tarps hauled off stall by stall, vendors + 2 porters stack crates, van reverses out 7:30; 14:30 pack-up, van back 15:45, crates cleared, tarps on 17:00–17:40, van leaves | `?nomarketday` | low: tarps + van, no crates / porters | `27.5,1,78.5,16,200,28` at 6.4–7.5 and 15.8–17.6 |
| Delivery stops | any delivery van passing an open stop (7 planned in front of shops) pulls half onto the pavement, hazards on; driver opens up, wheels a trolley of crates into the shop, comes back, shuts up, rejoins; a van is sent if none for 75 s | `?nodelivery` | on | 6:24–16:30; e.g. `106.1,1,-39.1,11,235.6,9`; delivery `.stops` lists the places |
| Wedding | 10:45 at St. Mary's: car waiting, 16 guests line up, couple out to confetti, photo on the steps, bouquet thrown, walk to the decorated car, drive off (tins + ribbons), guests wave and drift off; confetti stays ~70 s | `?nowedding` | off on low | `70,1.2,95.2,7,-12,6` from 10.7 (100 s) |
| Musician | up to 9 extra listeners in 2 arcs, joining and drifting off; song ends every 52 s: applause (wave + sound); finger-picked guitar + clapping via `ui/audio/synth.ts`, heard within ~40 m | `?nomusician` | off on low | `40.8,1,20,14,110,12` at 12–21 |
| Park life | ball game in a ring, tag from 12:30 (a second ball game from 15:00 only where the lawn has room for a third ring: today it has not), 3 picnics ~11:15–15:30 (rug shaken out, sit, eat, pack up) | `?noparklife` | off on low | `-32.4,1,9.6,12,30,12` (ball) 9:30–18:30, `-56.4,1,27.6,11,-30,12` (tag) from 12:30 |
| Balcony life | washing hung 7:24–10 / taken in 17:24–19:36 (cloth shader hides each piece by its own hours; ~10% stay out overnight) with someone on the balcony; watering 7:12–9:18 and 17:48–19:48; leaning with a cup; pool of 7 near the camera | `?nobalconylife` | off on low | `-132,8,-56,22,180,4` at 18.6 |
| Window cradle | two cleaners in a cradle on office lot 29, working down bay by bay 8:36–16:36 | `?nobalconylife` | off on low | `39,18,-70,20,90,8` |

`?noscenes` removes all of it (and the kerb stops, tarp haul, laundry hours). People are crowd figures (no new draw calls);
props: one InstancedMesh per kind (`scenes/kit.ts`), only drawn while one is out, one shared program compiled at warm-up.

## Contracts added
- `traffic/sim.ts` **KerbStop**: a vehicle brakes to the stop like a bus, then **leaves the lane lists entirely** (`sim.offLane`, pose driven along `pathIn`) so traffic flows past: no junction or crossing can be held up by a scene (`control`/`integrate` skip it). It rejoins when `kerbGap()` holds; from the moment it sets off it holds its lane place, so followers brake behind it. Stops are planned with ≥ 15 m from the lane start, ≥ 13 m from the stop line, no level-crossing lanes.
- `Crowd.extraObs`: discs the walkers go round (scene people, a van's flank). Scene people themselves follow scripts.
- `look.pram.fabric < 0`: both hands on a bar, no pram drawn (trolley, carried crate).
- `world/life/cloth.ts` piece option `hang: [out, in]` + `uLifeHours`; `decor.ts laundryWindow()` shared with `scenes/balcony.ts`.
- `nightmarket.ts`: `TARP_MORNING / TARP_EVENING / TARP_STAGGER`, shared with `scenes/market.ts`; vendor hours in `vendors.ts marketStalls` (6:24–17:36).

## Pedestrian bugs (fixed at the cause, checks not weakened)
1. **Fade-outs after `setHours`**: (a) `beginFadeOut` ended a crossing and faded the party on the zebra: it now waits until across (`fadeAfterCross`); (b) the excess cull in `warmStart` faded out vendors and waiters where they stood (inside the stall's SOLID cell): staff are no longer culled, and a vendor sent home fades at its counter without tripping the check (`p.stall` exemption is now independent of state, it never moves).
2. **Rare overlap at an activity spot (−160, 109.3)**: neighbouring attractions could offer the same ground (the statue ring and duck-pond shore had 18 pairs of spots within 0.38 m): `places.ts` drops the duplicates; and a person stopped or walking free who is on top of someone for > 0.8 s takes small steps apart (`trackOverlaps`).
3. **Paused group overlap (48.9, 63)**: rail stops had no check for someone already standing there: `pauseTaken()` makes the second group walk on.

Found by the day-long soak, all three also on the base commit (6 min at 4x, `shots/ls/dump_*.json`, not committed):
4. **Knots on crossings**: on a corner where everyone yields to someone else no way round is left; such a knot held a crossing for minutes, until the reservations expired (one run: 7 parties for 200 s at node 19). A party without progress for 14 s on a crossing, 28 s elsewhere, now walks on through for 3.5 s (`knotT`).
5. **Cafe-goers leaving the walk in the middle of a zebra**: arrival fired on a crossing (standing in the road, and the crossing stayed reserved through the coffee). Arrival now waits until across.

| 6 min at 4x, samples | crossing w/o reservation | overlaps | in the road | stuck |
|---|---|---|---|---|
| base 078430f | 43 | 26 | 7 | 0 |
| this branch, before 4 + 5 | 277 | 150 | 5 | 219 |
| this branch, after | 0 | 13 | 2 | 0 |

One run each, and the crowd is chaotic: the 277 / 219 row was one long knot and does not show the branch made knots more likely. Left open: the 2 in-the-road samples (cafe 37 at (92.7, 48.5): its seat path runs along the kerb line of the raster, and (96.1, 44.2)); the hot corners of the overlaps are the park's (-115, -5) and (-105, 40), as on the base. Boats also on the base: "Tinyhaven Belle overlaps Halcyon" (-0.16 m), "hull off open water" samples.

## Stack smoke
From the air (`-116,20,-98,300,-30,48`) the works stacks read white-grey at noon and warm cream in the 18:00 light, not brown: no change made. (Why they differ from the box-hunt note was not looked into.)

## Verification
PERF_PLACEHOLDER

## Time scale (read this first)
One game day = 16 real minutes at 1× (1 game hour = 40 real / sim seconds). People walk in real seconds, so a scene that
"lasts 90 s" plays over ~2.2 game hours. Scenes are scheduled in hours but timed in sim seconds.

## Audit: what already lives (2026-10-30)
| where | what | notes for the scenes |
|---|---|---|
| `pedestrians/crowd.ts` | ~420–560 walkers in parties on `pedNetwork`, benches, beach, bus queues, cafés (waiters), hang-outs, rail stops, dog walkers + prams (`look.dog/pram`), joggers | Avoidance only sees grid obstacles from parties (`rebuildGrid`): scene people must register discs or walkers go through them |
| `pedestrians/vendors.ts` | 7 carts (`serve` vendor + 2 customer spots), **busker** at (40.8, 20), 4 listener spots (`theme: 'busker'`, 15–45 s), guitar + open case in the merged cart mesh, `IDLE.GUITAR` | No sound, no applause, only ≤ 4 listeners: extend rather than duplicate |
| `pedestrians/vendors.ts marketStalls` + `actors.placeCrowds` | 20 market stalls (`marketstall` features, rows z 70.5–87.3, x 21.4–33.6): vendor 7:30–16:30 (from 14:30 turns back and forth "packing"), 3 shopper actors per stall 8–14:30 | No arrival, no set-up, no van |
| `world/life/nightmarket.ts` | tarp shroud merged mesh, snaps on/off at 19:45 / 6:45 | Becomes the morning / evening story: tarps haul off stall by stall |
| `pedestrians/actors.ts` + `actorDefs.ts` | Static placed figures (site workers, band, playground kids on swings/see-saw, boat crews, platform crowd, farmer on tractor) drawn as extras of the crowd renderer | Pattern for extras: `sync(list, n)`; no walking |
| `pedestrians/riders.ts`, `occupants.ts` | Two-wheeler riders, people seated in vehicles near the camera (`svc.vehicles()`) | Vans pulled off the lane are outside `vehicles()`: driver not drawn while out |
| `pedestrians/render.ts` | 5 instanced LODs + shadow proxy, prams, dogs (`look.dog`), blob shadows, tableware | Extras are posed + gaited if `rideG === null`; `look.pram` gives both hands on a push bar (reuse for trolley, no new pose) |
| `world/life/cloth.ts`, `decor.ts`, `extras.ts` | Instanced cloth + wires + bulbs: bunting, prayer flags, festoons, court + balcony laundry, dryers, W6 garden lines, pole flags | Laundry is there 24 h a day: nobody hangs it or takes it in |
| `world/life/chimneys.ts`, `ambient/smoke.ts` | Chimney / boiler / vent / barbecue smoke | Works stacks read as brown blobs from the air (box-hunt hand-off) |
| `ambient/*` | Birds (flocks, gulls, pigeons, butterflies), waterfowl, kites, fireflies, fireworks, balloon, plane, blimp | Nothing to add here |
| `landmarks/stadiumLife.ts` | Match-day / concert crowd + floodlights on the stadium | Nothing to add here |
| `sim/traffic/sim.ts` | IDM + reservations, buses with `dwell` (blocks its lane 6–9 s), ice-cream van that only drives, `delivery` model ~3 vans city-wide | Nothing ever stops at a kerb except buses |
| `world/buildings/anchors.ts` | 216 balconies (oldtown 97, residential 88, midtown 20, market 11), 16 balcony laundry lines, facades, spans | Empty balconies: nobody ever on them |

Not there at all: weddings or any set-piece event; deliveries; children's games on grass (only playground fixtures);
picnics; window cleaning; laundry routine; anyone appearing on a balcony.

## Key positions (live data)
- Church door (70, 92.5) facing S; sidewalk z 93.5–96.5 (door node 600 → side 601 (70, 94.6)), road centre z ≈ 100.
- Market area x 18.5–36.5, z 63.5–93.5; aisles x ≈ 24 and x ≈ 31.
- Park lawn x −103.5…−6.5, z −3.5…38.5; pond x −92…−64, z 9…26; bandstand (−94, 30); statue (−45, 17.5); playground x −37.5…−21.5, z 23…33.5.
- Busker (40.8, 20) yaw 0.
