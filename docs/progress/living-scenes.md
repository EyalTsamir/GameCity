# Living scenes — small stories with a beginning, middle and end

Branch `claude/living-scenes-2a2bcc` (cut from `claude/pensive-gates-bim12i` @ 078430f). Dev server port 5189, harness
from the main checkout (`node C:/Projects/GameCity/scripts/<x>.mjs --url http://127.0.0.1:5189/`).

## Resume here
- See "Status" at the bottom of this section; every scene is committed separately.

### Status
- [x] audit (below)
- [ ] scene system + scenes (see the table once built)

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
