# world — streetlife (café terraces, street sitters, vendors, two-wheelers)

## Resume here
* 2026-10-24 09:40 UTC — M4 (cars) + lead note 5 (gloss) done and judged: m4h (v7: coat gain 2.4, glass
  3.6, chrome 1.5, clearcoatRoughness 0.1, skyline / horizon-shaped street reflections) — backlit golden
  hour now sparkles (roofs, rear glass, boot lids), noon glass reflects the sky, flanks stay deep.
  Perf counts (downtown 1920×1025, 12:30): vehicles 44.5 k → 63.8 k tris (+19 k), vehicle draw calls 20
  (unchanged), invariants {} (`perf_m4.json`).
* Running: `final/` (overview, downtown, tables, street, buskerA/B × 12 / 18.2 / 21.5 h, all modules) and
  `diorama.png/json`. Next: judge them → milestones / perf / best views / open issues → final report →
  SubagentHandback.

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

## Best views

## Open issues
