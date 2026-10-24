# world — streetlife (café terraces, street sitters, vendors, two-wheelers)

## Resume here
* 2026-10-24 10:05 UTC — **done**. All milestones M0–M4 complete; final set `final/` + `final_sheet.png`
  (6 views × 12 / 18.2 / 21.5 h: no console errors, no failed modules, invariants {}), `diorama.png` OK,
  typecheck clean. See "## Final report". Nothing running.

## Brief (WORLD-PLAN.md workstream 5 + world-briefs.md notes)
Gap: at eye level the city is thinly populated compared to reference 2 (sunny Tel-Aviv café street — every
table taken, scooters / bicycles / motorbikes / e-scooters weave through, people chat on the pavement); the
user wants "even more alive and realistic than that". Deliver: every café terrace occupied (seated patrons
eating, drinking, talking, reading; waiters), people on benches / steps / low walls, vendors, more varied
street activity; two-wheelers in traffic (cyclists, scooters, motorbikes, delivery riders) and parked bikes /
e-scooters. Keep the crowd invariants clean (no overlaps, walkers stay on walkways); seated / static actors
may be a separate light layer drawn by the existing figure renderer. Budget (high): ≈ 0.6 ms GPU, part of
≤ +25 draw calls for all agents. Owns `src/sim/pedestrians.ts` + `pedestrians/*`, `src/sim/traffic.ts` +
`traffic/*`. Before finishing: soak 4 min @4×, invariants empty, no per-frame garbage.

## Design

### As built (supersedes the plan below where they differ)
* No separate street-actor layer: café patrons, waiters, rim / bench sitters, hangout groups, vendors and
  the busker are ordinary crowd parties with new goals / states (`crowd.ts`: goal 'cafe', state 'serve',
  hangouts, stalls, pavement chat / phone stops), so the crowd invariants cover them; drawn by the same
  figure renderer (0 extra draw calls). Café seats come from wear's `ctx.services.props.cafes/discs`
  (`pedestrians/cafes.ts`: entry points on walk edges, per-seat paths via a multi-source Dijkstra on a
  0.25 m grid, waiter paths). Table settings: `pedestrians/tableware.ts` (1 instanced draw, candle glow).
  Vendors / carts / busker: `pedestrians/vendors.ts` (+ market-stall vendors). Riders:
  `pedestrians/riders.ts` (pillion on every 4th Vespa). Attention-weighted spawning near the camera focus.
* Two-wheelers: kinds 'bike' / 'moto' with variants (bicycle, courier bike, e-scooter, Vespa, delivery
  scooter, motorbike) in `traffic/models.ts`, bit-mask variant parts, crank spin; 27 % of regular traffic.
  Parked rows in the furniture band (`traffic.ts buildParked2W`).
* Cars (lead notes 4–5): `traffic/carBody.ts` lofted bodies; vehicle material = MeshPhysical clearcoat with
  per-part finishes (aMeta.w = rough + 4 × class) and a stylised street reflection (`thStreetRefl`).
* Toggles: `?nocafe ?nohang ?novendors ?norim ?no2w ?noparked2w ?nofocus`, debug `?tlineup[=lods]`.

### Architecture
* **Street actors layer** (`pedestrians/street.ts`, new): Member objects that the crowd does NOT simulate
  (one dummy Party per group, never in `crowd.parties`) — café patrons, waiters, sitters on steps / low walls /
  fountain rims, standing conversation groups, vendors, buskers. Cheap per-step timers drive their
  activity; the existing `CrowdRenderer.write()` draws them after the crowd's parties (same 4 LOD layers +
  shadow proxy → **0 extra draw calls** for figures). Placement only off the walk bands (walk mask + pads),
  so walkers never meet them; invariants: none inside buildings / road / water, no walker within 0.35 m.
* **Café seats**: from `ctx.services.props.cafes` when wear exposes it (requested); meanwhile derived
  read-only: `planScatter()` re-run with the same inputs + a replica of the `cafe()` chair draws (seat = chair
  centre + 0.11 m towards the table so the bench-sit IK, backrest 0.30 m behind the seat spot, fits the
  bistro chair's backrest 0.19 m behind its centre). Park Café / station kiosk tables likewise.
* **Café poses** (`animate.ts`, new branch after the bench sit): seat height parameter (bistro 0.458 vs bench
  0.467), forearms / hands on the table, activities cycling per patron: sip coffee (cup to the mouth), eat
  (fork to the mouth, plate), talk (gestures from the elbow, head turned to the companion, nods), listen,
  read (newspaper exists), phone (exists), laugh (head back). Table-top items (cups, saucers, plates,
  glasses, bottle, menu) as one instanced mesh per item kind group (merged), only on occupied tables.
* **Waiters**: walk between the café door side of the terrace and tables (paths checked against the walk
  mask and the table discs), stand at a table taking an order, carry a tray (new FB? → reuse CUP/plate prop
  or a small tray mesh in the table-items layer).
* **Two-wheelers** (traffic): new model kinds `bicycle`, `scooter` (Vespa-type), `motorbike`, `delivery`
  scooter with top box, `escooter` (standing). They are ordinary lane vehicles (IDM, junction reservations,
  crossings — all invariants unchanged), ride 0.5–0.7 m right of the lane centre, cyclists 4.5–6.5 m/s.
  Mesh: one InstancedMesh per kind per LOD in traffic/render.ts. **Riders** are Members fed to the
  pedestrian renderer through `ctx.services.traffic.riders` (traffic loads before pedestrians): ride poses
  (pedalling with leg IK to the crank, hands on the bars, torso lean per vehicle, whole-body lean in turns via
  pelvisRoll + rootX compensation). Helmets via the hat styles. Optional later: scooters filtering past a
  stopped queue on the kerb side.
* **Parked bikes / e-scooters**: static instanced meshes (same two-wheeler geometry) in the furniture band
  next to lamps / trees / racks, outside cafés and at the station — off the walking band (furniture slots /
  walk mask), e-scooters slightly askew, some fallen over.

### LOD / quality / toggles
* Patrons scale with time of day (breakfast, lunch peak, evening peak, empty after ~23 h) and
  `quality.density`; low quality: fewer actors, no table items beyond 60 m.
* Toggles: `?nostreet` (no street actors), `?nocafe`, `?no2w` (no two-wheelers in traffic), `?noparked2w`.

### GPU estimate (to be measured)
* Figures: + ~150–250 visible actors in dense views; café patrons sit (shadow proxy only < 150 m); most of
  them at lo / tiny LOD; ≈ +60–120 k vertices at a busy plaza view → ≈ 0.2–0.35 ms on the Adreno.
* Two-wheelers: 5 kinds × 3 LOD instanced meshes (+ up to 15 draw calls when all kinds visible — will merge
  into one mesh per LOD with a kind attribute if needed, ≤ 3) ≈ 30–60 k vertices.
* Table items: 1 draw call. Target total ≤ 0.6 ms, ≤ +6 draw calls.

## Milestones
- [x] M0 survey, log (before captures: the critique set + baseline 5174 at the same views, pending)
- [x] M1 café terraces occupied (patrons + activities + table items + waiters)
- [x] M2 two-wheelers in traffic (models, sim, riders posed) + parked bikes / e-scooters (rider close-ups pending)
- [x] M3 rim sitters, standing groups (plazas + pavement chats + market hangouts), vendors (carts + market
  stalls, packing up after 14:30), busker with an audience, attention-weighted spawning, soak
- [x] M4 (lead notes 4–5) lofted car bodies (`traffic/carBody.ts`) + glossy finishes (clear-coated paint,
  reflective glass, chrome) in the existing vehicle material

## Requests to other areas
* wear (props): `ctx.services.props.cafes = [{ x, z, yaw, tableY, seats: [{ x, z, yaw, seatY }], parasol,
  source }]` + `ctx.services.props.discs` (keep-clear discs of every placed item incl. scatter) — sent to the
  lead 15:05. Until then I derive the same data read-only (planScatter + cafe() chair replica).

## Changes outside my area
* `src/world/landmarks/civic.ts` (lead's grant, 2026-10-19 ~21:10): removed the old toy `person()` vendor (and
  its two `env.anim` lines) behind the 20 market counters, in the same change that puts real vendor
  figures there (`pedestrians/vendors.ts` marketStalls + crowd stepVendor). Imports left untouched.

## Perf notes
* Downtown POI, 1920×1025, 12:30 (counts; this container renders with software GL, so timings are not
  meaningful here): all street life on vs off (M1–M3): 165 vs 161 draw calls, +73 k tris (figures 60.8 k vs
  39.4 k verts, vehicles 44.5 k vs 28.7 k tris) — `perf_on|off.json`. M4 lofted cars: vehicles 44.5 k →
  63.8 k tris, vehicle draw calls 20 unchanged (`perf_m4.json`). Per car L0/L1/L2 ≈ 3.5 k / 1.0 k / 0.45 k
  tris (was 2.1 k / 0.6 k / 0.24 k); the flat underside is not generated.
* GPU estimate on the Adreno X1-45: ≈ +110 k tris / verts over the pre-round scene (≈ 4 % of 2.4–2.5 M)
  ≈ 0.25–0.35 ms vertex; clearcoat adds one specular lobe on vehicle pixels only (≈ 0.05 ms); total within
  the 0.6 ms budget, +4 draw calls.
* CPU: crowd features ≈ +6 % crowd update, population +27 % (BASE_POP 560); no per-frame allocations
  (typed-array pose slots, pooled tableware writes). Soak 4 min @4× (software GL): invariants 0, heap flat
  353–358 MB, no console errors.

## Best views
* Café terraces: `tables=-38,0.8,-77.5,5.5,20,28`, `tables2=-16,0.8,-109,6,190,24` (12 h, 21.5 h).
* Street with two-wheelers / parked e-scooters: `street=-38,1,-65,14,60,6` (12 h, 18.2 h).
* Busker + fountain rim sitters + gelato cart: `buskerA=40,1.2,21,10,20,16`, `buskerB=40,1.2,21,10,200,16`.
* Car lineup (debug): `?tlineup` + `a=-9,0.7,22,8,60,12`, backlit gloss `b=-9,0.7,22,8,240,12` at 18.2 h.

## Open issues
* Car reflections are stylised (sky PMREM + a procedural street skyline), not true reflections of the
  neighbours; frontlit cars at noon read satin rather than mirror-glossy (backlit / golden hour sparkles).
* Pre-existing traffic transient: a bus rear axle briefly at (58.7, −68.6) after a junction (not mine).
* The night plaza is thin after 21 h (by design of the hourly curves).
* Delivery-rider stops at doors and scooters filtering past queues were not done.

## Final report
**Changes.** Café terraces are full (about 90 % of seats). Patrons eat, drink, talk, read and use phones;
table settings appear once served; waiters take orders and carry trays; terraces are lit at night by wear's
lamps.

People sit on benches and fountain rims, chat on pavements and squares, and carry takeaway cups. Plaza carts
and market-stall vendors serve shoppers and pack up at 16:30. A busker plays to an audience. More walkers
appear near the camera focus.

Six two-wheeler types make up 27 % of traffic, with riders that pedal, lean into turns and put a foot down
when stopped. Bikes and e-scooters are parked in rows, some fallen over.

Following the lead's notes, the four car types now have rounded bodies with wheel arches, framed glass,
mirrors and alloys. Their paint, glass and chrome are glossy.

**Files.**
- `src/sim/pedestrians.ts`, and in `pedestrians/`: `crowd.ts`, `animate.ts`, `render.ts`, `places.ts`; new `cafes.ts`, `tableware.ts`, `riders.ts`, `vendors.ts`.
- `src/sim/traffic.ts`, and in `traffic/`: `specs.ts`, `sim.ts`, `models.ts`, `render.ts`, `vehicleMaterial.ts`; new `carBody.ts`.
- Granted: `src/world/landmarks/civic.ts` (old toy vendor removed).

**Toggles.** `?nocafe ?nohang ?novendors ?norim ?no2w ?noparked2w ?nofocus`, debug `?tlineup[=lods]`.

**Before / after.** `perf_off.png` vs `perf_on.png`, `m3b_sheet*.png`, `m3c`/`m3d` (terraces day and night),
`m4a`–`m4h` (cars), `final_sheet.png`.

**Cost** (downtown, 1920×1025).
- Street life: +4 draw calls, +73 k triangles.
- New cars: vehicle triangles 44.5 k → 63.8 k, same draw calls.

Estimated 0.3–0.4 ms on the Adreno, inside the 0.6 ms budget. This container renders in software, so these
are counts, not timings.

**Checks.** Invariants empty in every capture set; 4-minute soak clean with flat heap; `?diorama` works; no
per-frame allocations.

**Trade-offs.**
- Car reflections are stylised (sky plus a generated street skyline); cars sparkle most when backlit.
- About 27 % more crowd CPU.

**Open.**
- Delivery riders don't stop at doors; scooters don't filter past queues.
- The plaza is quiet after 21:00.
- An older traffic glitch: a bus rear axle briefly at (58.7, −68.6).
