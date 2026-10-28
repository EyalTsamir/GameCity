# W3 — street furniture, park structures, market stall ("real things" round)

Branch `claude/real-w3-furniture` (from `claude/pensive-gates-bim12i`). Brief: docs/progress/real-briefs.md "W3".

## Resume here
* 2026-10-28 — Session 1. Bench framing fix committed first (line-of-sight). First pass of real-object builders
  written for every class in the brief (see Done); typecheck clean. Next: bench all W3 classes at 3/10 m, judge,
  fix, commit; then materials (brief #4) and variation.

## Done
* **scripts/bench.mjs — line of sight** (REAL.md "bench framing faults"): before each capture the camera swings
  around the object (yaw +18, −18, ±55, ±95, ±140, 180, then the same at 0.6 × arm) until a ray from the object's
  middle to the camera hits nothing in either direction (both directions: one-sided roofs/walls are only hit from
  their front; glass counts, billboards/sky/water don't). `report.json` captures carry `los: {dy, arm, blocked?}`.
  Not fixed: tree crowns whose instances are placed in the shader are invisible to the raycaster (picnic 10 m),
  moving objects are not yet restricted to open road (W2's classes).
* `src/world/props/shapes.ts` (new): `cbox` (45° chamfered box, 26 faces), `lathe` (profile revolve with crisp
  mouldings), `poly`, `boltY/boltZ`, `ring`.
* furniture.ts: **bin** (classic: cast-iron slatted round bin — base moulding, 18 slats over a dark core, hoop
  bands, rolled rim, liner bag folded over the rim with an uneven hem, crest; colour/bag variants; modern: stainless
  bin on a bolted base plate, posting slot under an overhanging cap, door seams, keyhole, hinges, sticker);
  **bollard** (steel: collar, tapered tube, domed cap, two reflective bands; stone: chamfered foot, dished cap;
  new iron cannon bollard for the station); **phone box** (K6: concrete plinth, chamfered posts, raised kick
  panels, 3 × 8 glazing bars in relief over real transparent glass (props glass mesh), sign bands with letters,
  square dome + crown, door handle, telephone/shelf/ceiling light inside); **newsstand** (plinth, real front
  opening with depth, shelves of covers inside, counter with paper stacks, coiled roll shutter, raised panels,
  wire racks with tilted covers, overhanging pitched roof, sign); **planter** (hollow trough: shadow-gap foot,
  chamfers, rim frame, inner walls, soil 8 cm down with clods; terracotta lip, timber boards between posts,
  steel folded lip); **bench** (chamfered slats, classic: armrests + carriage bolts).
* park.ts: **statue** pedestal = moulded square lathe (plinth, cove, die, cornice, capping) + chamfered octagonal
  steps + recessed side panels; **gazebo** turned columns, floor nosing, real balustrade (rails + balusters),
  boarded roof underside with 16 rafters (open eave ring); **kiosk** corner posts, dado rail, frieze, recessed
  hatch with frame, propped shutter with stays, counter on brackets with cake stand/napkins/tip jar, bistro
  chairs (tube legs, round seat, hoop back) and tables (base, rim); **picnic table** boards with gaps, seat boards,
  A-frames, bearers, braces, carriage bolts; **playground** rubber safety tiles, swing A-frames with footings,
  head castings, hanger clamps, link chains, sagging strap seats, round ladder rungs, handrails, S-curve stainless
  chute with run-out, see-saw A-bracket + handles + tyre stops, climbing-frame ball clamps + footings, coil-spring
  riders with rounded animals.
* civic.ts: **flagpole** granite plinth, base plate + 8 bolts, foot sleeve, halyard, cleat; **market stall**
  steel pole frame on foot plates, cloth canopy sagging between rails (metric stripes), scalloped valance, folded
  back cloth, trestle table with skirt, slatted crates with individual produce (per goods: fruit, loaves, cheese
  wheels, fish, jars, flowers), price cards, scales, back shelf, stacked crates, cardboard, hand truck.

## Tried and rejected
* LOS with transparent meshes excluded: the camera ended inside curtain-wall glass (phonebox/newsstand 40 m).
* LOS ray from the object only: misses roofs seen from below (playground 40 m ended inside a shed roof).

## Toggles / tiers / costs
(to measure)

## Sheets
* shots/w3/los/sheet_1.png — framing check.
