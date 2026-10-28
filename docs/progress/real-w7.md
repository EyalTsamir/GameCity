# W7 — Dense real places II: harbour quay + boats, building site, station platform

Session session_01XuhAMe8MqhfeVaXdzcfB9U, branch `claude/real-w7-quay` (from claude/pensive-gates-bim12i @ 8a2f18e).
Owned: src/world/harbor/** + harbor.ts, src/sim/boats/** + boats.ts, src/world/landmarks/construction.ts,
src/sim/rail/station.ts + staticMaterial.ts. Order: boats → quay → site → platform.

## Resume here
* s1 (23:05): all four places coded, quay + boats seen once, site + platform not yet seen.
  Bench: `node scripts/bench.mjs --classes quay,quaysea,site,siteyard,platform,crabber,dinghy,ferry,tug --dists 5,14`
  (PLACES table in bench.mjs). Golden ref of the base commit: shots/golden/ref (captured from the base worktree
  ../gc-base on port 5174); compare with `scripts/agent-tools/golden.sh w7` style capture + diff.
  Note: the dinghy hides under the quay edge from land views (it is drawn — checked: small mesh count 9, no NaN);
  judge it from the water (`quaysea`).
* Next: judge shots/w7/p1 (site/platform first look), fix, golden + downtown invariants, commit, note to lead.
  Then (next session): site excavator/cabins detail, platform people (request to pedestrians owner), boats
  tour/sail/motor round 2, quay rail end-stops (yellow boxes) and crane rail buffers.

## Code pointers
* boats: sim/boats/models.ts (lofted hulls, big = ferry/tug/tour, small = yacht/motorboat/scull), material.ts
  (shader: tint, sails, oars, emissive), render.ts, fleet.ts (pilots), boats.ts (module, fleet set-up).
* harbour: harbor/geo.ts HB builder; material.ts patterns (PAT) + emission modes; ship.ts (cargo ship + quay edge,
  mooring); harbor.ts meshes harbor-north (quay rails, bollards, fenders), -yards, -beach, -river, -animated.
* site: landmarks/construction.ts genConstruction(env, lot) — K.box(M(colour, PAT, rough, metal…)), wall(),
  railing(), person(); scaffold = cutout quad PAT.SCAFFOLD + plank decks. Lot = plan.ts genMidtown east half.
* platform: sim/rail/station.ts (platform, canopy, benches, bins, lamps, clock, signs), staticMaterial.ts kinds.
* bench: scripts/bench.mjs classes jetty, boat (ray-picked); W7 added ferry/tug/tourboat/yacht/motorboat/scull
  (fleet by type, aimed at the starboard side) and place classes (PLACES table in the locate step).
* quay: plan.ts genQuay — quay strip x 116.5..136 (QUAY_X 136), z ≈ −142..−6; gantry rails x 128..135 z −122..−24;
  container stack x 118..125 z −118..−24; harbour master lot x 117.5..127.5 z −18..−8; ferry dock 136–144 × −18..−10.
  props/scatter.ts (W6) puts ≤ 16 fishing-gear items at the quay ENDS (z < −119, z > −23). Ladders + quay wall =
  terrain/masonry.ts (not ours; ladders at x 136, z −131/−97/−58/−31/−2). Quay furniture: harbor/ship.ts
  buildQuayEdge (bollards every 13 m from z −138, hanging fenders, pneumatic fenders by the ship), buildMooring.
* site: lot rect x −81.5..−61.5, z −58.5..−16.5 (gate on the east side, world z ≈ −26..−20.5). plan.ts genMidtown east half (lot 'construction', footprint inset 4/5/3/12 m, towercrane feature).

## Done
* Boats (material.ts): surface classes HC (tag + 20·class): STEEL hull (1.05 m strakes, staggered butts, frame
  dishing bump, weld beads, paint touch-ups, scuppers + rust streaks, chipped deck edge, waterline growth), GRP
  (scum line, fender scuffs), SUPER deckhouse walls (panel seams, dirt streaks from window corners), DECK (plate
  grid, worn walkways, rust pits). Bump via screen-space derivative of bH. WINDOW panes: fake saloon interior
  (seat backs, heads, ceiling strip; aExtra = pane bottom/top). NET tag: discarded mesh holes < 25 m.
  Near fade 18–45 m. ?noboatdetail / quality low → off (uniform uBoatDetail).
* Boats (models.ts): paneFrame, deckhouse rewrite (framed panes, eyebrow, roof coaming, 3-pane wheelhouse front
  with wipers), torus, ropeCoil, cleat, bitts (+ figure-eight rope), vent, anchor, life ring (torus + tape + grab
  line + bracket), railing (3 rails + toe board + post feet); ferry: bitts, cleats, coils, anchors, vents, rings on
  the rail; tug: hanging tyre tori on lines, coils, bitts, cleats, vents, anchors, darker deck; motorboat: real
  outboard (cowl, leg, cavitation plate, prop), wheel, cleats, grab rails, coil.
* boats.ts: moored pilot (surge/sway only), berth obstacles in nav, moored boats exempt from the open-water
  invariant (water only); renderer capacity from the fleet; picker names Crabber / Dinghy. ?noquaylife removes them.
* harbor: PAT.NET / RUST / STAIN (geo.ts ids, material.ts patterns); castBollard (lathe, bolted flange, worn band)
  replaces the mushroom bollard everywhere; quay.ts fish quay (store, net heap, creels, fish boxes with catch,
  pallets, forklift, hose reel, rope eyes, wall tyres, stains, litter; 2nd net on a pallet, chilled fish
  container with reefer, oil drums, hawser coil, empty box stacks).
* Site (construction.ts): tube-and-fitting scaffold (standards, sole boards, base plates, ledgers, transoms, guard
  rails, toe boards, façade braces), tapered skip with ribs/lugs/rubble, mixer, wheelbarrows, cement bags, block
  pallets, cable drum, dumpy bag, cones + barrier, moulded portable toilet, fly-posters on the street hoardings,
  mud tracks out of the gate onto the pavement.
* Platform (station.ts): yellow safety line, column base plates + bolts, detailed ticket machine, help point,
  CCTV domes, PA horns, timetable case (printed sheets behind glass), luggage (wheeled case, holdall, rucksack),
  coffee cup, newspaper.

## Tried and rejected
* Bench aiming a boat at its centre (camera inside the hull / on the sails) → aim at the starboard side ¼ L ahead.

## Toggles / tiers / costs
* `?noboatdetail` (and quality low): boat shader surface detail off (uBoatDetail).
* `?noquaylife`: no fish quay (harbor/quay.ts) and no moored crabber / dinghy; quality low: fish quay without the
  small things (stains, litter).
* `?nositedetail` (and quality low): construction site keeps the old cutout scaffold planes, no clutter / mud.
* Costs: not measured yet (perf.mjs --view harbor --variants ";noquaylife;noboatdetail").

## Sheets
