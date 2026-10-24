# world — streetlife (café terraces, street sitters, vendors, two-wheelers)

## Resume here
* 2026-10-24 08:35 UTC — resumed after the session-limit stop (tree at 9399c3f). Glossy-car work state:
  `vehicleMaterial.ts` v6 = MeshPhysical clearcoat + `thStreetRefl()` (stylised street reflection: dark
  asphalt below a lifted horizon, blocky facade skyline, bright haze band, sky) scaling the coat / chrome
  reflections; gains coat 1.8 / glass 3.2 / chrome 1.4; chrome window seal + handles on sedan / SUV
  (`carBody` region 'seal'); hatch got roofDrop + raked rear (m4d: reads as a hatchback now).
  m4e (gain 1.35) too weak, m4f (gain 3) = uniform hazy sheen (reads as dust) → v6 skyline shaping;
  m4g (v6) captured before the stop — judge it next.
* 2026-10-24 03:50 UTC — resumed after the weekly usage-limit stop (tree clean at 582500f). Judged before the
  stop: m3d (night terraces with wear's lamps: pass), soak1 (4 min @4×, software GL: invariants 0, heap flat
  353–358 MB, no errors; only ~14 game min covered at 10 fps), m4b / m4c (lofted cars at all 3 LODs: pass;
  compact reshaped, hatch still estate-like → roofDrop + raked rear window added).
* **Lead note 5 (glossy cars)** in progress: `vehicleMaterial.ts` is now a MeshPhysicalMaterial with
  per-part finishes packed in aMeta.w (= rough + 4 × class): 1 clear-coated paint (sharp Fresnel sky
  reflection), 2 glass (coat over near-mirror base), 3 chrome (metallic: CHROME / RIM colours); `models.ts`
  PartOpts.finish (default: paint → coat, GLASS → glass, CHROME/RIM → chrome). Typechecks.
  Running: `m4d` (lineup + street at 13 h / 18.2 h).
* M4 so far: `traffic/carBody.ts` lofts compact / hatch / sedan / SUV (tumblehome greenhouse, rounded nose /
  tail, wheel arches over dark wells, trim B/C pillars + belt seal, SUV cladding); `models.ts loftBody()`
  (mirrors on arms, door seams + handles at LOD0), 5-spoke alloys on cars; underside faces culled.
  Tris per car L0/L1/L2 ≈ 3.5k/1.0k/0.45k (was 2.1k/0.6k/0.24k); draw calls unchanged.
* Next: judge m4d → tune finishes; eye-level + overview finals (12 / 18.2 / 21.5 h); `?diorama`; tri counts
  at downtown (perf.mjs counts only — this container is software GL); final report.

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
- [~] M3 rim sitters, standing groups (plazas + pavement chats), vendors (carts + market stalls); buskers skipped
- [ ] M4 polish: filtering scooters, delivery stops, night behaviour, perf pass, soak

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
