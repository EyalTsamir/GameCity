# W7 — Dense real places II: harbour quay + boats, building site, station platform

Session session_01XuhAMe8MqhfeVaXdzcfB9U, branch `claude/real-w7-quay` (from claude/pensive-gates-bim12i @ 8a2f18e).
Owned: src/world/harbor/** + harbor.ts, src/sim/boats/** + boats.ts, src/world/landmarks/construction.ts,
src/sim/rail/station.ts + staticMaterial.ts. Order: boats → quay → site → platform.

## Resume here
* s2 END: (1)–(5) coded and seen once at 4 / 12 m (docs/progress/real/w7_s2.jpg); (6) perf below. Downtown console
  clean, invariants {}. Open, in order: crabber line from bollard still reads fairly straight at 4 m (the cleat is
  higher than the coping — lower the cleat end or add slack); wheelhouse side doors + more side panes on tug /
  crabber; tour boat + motorboat superstructure still boxy (not deckhouse()); quay people + platform passengers
  (needs pedNetwork platform benches — core/pedestrians owner); site posters/PPE board not yet seen at 3 m; wet
  patches only read if the harbor north mesh is not the lambert variant (check at 3 m).
* s2 START (session_01XuhAMgnc3LjfR6ehMUGwBc): lead verdict s1 → priorities (1) boat FORM (raked wheelhouse fronts,
  rounded deckhouse corners, sheer, flared bow, glazed not black windows), (2) catenary mooring ropes + bollard loop,
  (3) fish box / creel variation + wet patches, (4) site posters/mud/tracks/rebar/pallets+bricks, (5) platform canopy
  form + tactile texture + seated people, (6) one perf.mjs run.
* s1 END (23:00 UTC): all four places coded and seen once at 5 / 14 m (docs/progress/real/w7_places_s1.jpg,
  w7_boats_s1.jpg). Golden: overview 0.03, harbor 0.47 (new quay items) vs base; downtown console clean,
  invariants {}. NOT yet seen: the mud-track redraw at the site gate (dashes), ferry deck pits after toning down,
  site skip / mixer / toilet / posters close up (only 14 m), motorboat round 2.
* Verdict s1: fish quay from the water (quaysea) reads real — crabber with tyres + lines, dinghy at the ladder
  with its painter, creels, boxes, store, forklift. Quay from land: creels/hose real; the concrete apron west of
  x 127 still empty (props scatter zone, W6). Site: tube scaffold reads; first mud was dark rectangles (fixed,
  unseen). Platform: ticket machine, yellow line + tactile, column bolts, timetable case read; no people (request).
* Next session, in order: (1) bench `--classes quay,quaysea,site,siteyard,platform --dists 3,8` + `crabber,ferry,
  tug,motorboat,tourboat --dists 3,10` and judge; (2) site: skip/mixer/toilet/poster close-ups, excavator form
  (boxy), cabins (doors, steps, windows); (3) boats round 2: motorboat foredeck/windscreen (toy-like), tour boat,
  yacht deck fittings, crabber name/registration on the bow (needs a canvas decal), ferry name; (4) quay: crane
  rail end-stops (crude yellow boxes, harbor), store detail; (5) perf.mjs harbor/station/downtown with
  `;noquaylife;noboatdetail;nositedetail`.
* Token note: this session ran at a median 238k / max 358k context (system prompt + brief are large):
  get_session's used_tokens read 0 — use tokens.py ctxMax instead, and wrap up earlier.

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

## Done s2
* Boat form (models.ts): deckhouse() now a rounded-plan loft (roundRing, radius default 0.2) + roof slab/coaming on
  the same plan, then warped (tumblehome 3.5 %, `rake` m at roof: workboat wheelhouses lean forward +0.3, ferry
  saloon swept back −0.35) with inverse-transpose normals; wheelhouses get a sun visor on brackets. hull(): flared
  bow (waterline entry 0.42·fl finer than the deck forward of t 0.45).
* Glass (material.ts boatGlass): Fresnel sky/shore reflection by reflected-ray elevation (× uDaylight) over the
  dim interior; GLASS wheelhouse panes get a console band + far-window light; WINDOW saloon keeps the seat interior
  under it. bN = vNormal set in main (vNormal is declared after FRAG_PARS). Front panes now carry aExtra (sill/top).
* Ropes: models.ts rope() = round twisted tube, parabolic dip ≥ 5 % span; crabber lines now end at the coping edge
  (QUAY_TOP + 0.035, harbor.ts lines.boat y 0.155) instead of 0.45 m in the air. quay.ts ropeEye(): loop dipping on
  the far side, two legs + whipped splice, radius param. ship.ts buildMooring: eye on each bollard + hawser from
  1.15 m out, sag 0.35 + 3.5 % L, clamped onto the quay top.
* Quay (quay.ts): fishBoxStack owner colour + strays (BOX_COLS), fade/dirt, rim + lugs, stencil band, skew / turned
  boxes, PAT.GRIME (11, harbor material.ts: scuffs + low grime); creel() hashed variation (net colour/fade, hoop
  height, sag, weed, rope tail, base rust); wet() PAT.WET (10: glossy pool + drops) ×6 by boxes/creels/edge.
* Site (construction.ts): rebar bundles of bars on bearers + ties + tags + strays, concrete pipe pyramid with
  sockets on chocked bearers, orange ducting, real pallets (blocks/bearers/deck) with strapped + hooded brick packs
  (two opened), empty pallet stack, wet mud apron + ruts inside the gate, dual tyre tracks wet→dry onto the
  pavement and road (kerb at SX+3 assumed), clods, splash band on the hoarding feet, poster set on the east
  hoarding (z −11), PPE board by the gate. All `fine` = !nositedetail && quality ≠ low.
* Platform: staticMaterial K.TACTILE = offset blister domes (66.5 mm grid, normal bump rlG via
  normal_fragment_maps) + 400 mm slab joints; K.BOARDS (27) soffit boards on the canopy underside; station.ts
  purlins (3 + wall plate a side).
* People request: NOT done — platform benches are not on the pedestrian graph (places.ts takes peds.benches from
  core pedNetwork), so seated passengers mean core + pedestrians changes, not small. Static box figures rejected.

## Tried and rejected
* Bench aiming a boat at its centre (camera inside the hull / on the sails) → aim at the starboard side ¼ L ahead.

## Toggles / tiers / costs
* `?noboatdetail` (and quality low): boat shader surface detail off (uBoatDetail).
* `?noquaylife`: no fish quay (harbor/quay.ts) and no moored crabber / dinghy; quality low: fish quay without the
  small things (stains, litter).
* `?nositedetail` (and quality low): construction site keeps the old cutout scaffold planes, no clutter / mud.
* Costs (s2, perf.mjs --view harbor 1280×720, SwiftShader, one run — noise ≈ ±80 ms/frame, see nositedetail
  which is off-screen): baseline 558 ms, noquaylife 504 (−172 k tris, −4 %), noboatdetail 523 (shader only),
  nositedetail 476 (noise). Draw calls unchanged (180). Needs a real-GPU run to price quaylife / boatdetail.

## Sheets

## Sheets
* docs/progress/real/w7_places_s1.jpg (quay 5 m, quay from the water 14 m, site gate 5 m, site yard 14 m,
  platform 5 / 14 m), docs/progress/real/w7_boats_s1.jpg (crabber 3/10 m, dinghy, ferry 3 m).

## tokens.py (s2)
tool:mcp__claude-code-remote__get_session       0.0M   0.3%
  messages in                                     0.0M   0.0%
  Bash:other                                      0.0M   0.0%
  Bash:typecheck/build                            0.0M   0.0%

## tokens.py (s1)
TOTAL weighted 5.0M (cache read 79%, write 8%, output 13%); 166 calls, ctx median 238k, max 358k, cold 0.
