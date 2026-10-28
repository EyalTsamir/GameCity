# Worker briefs — "real things" round

Read first: `CLAUDE.md`, `docs/progress/NEXT-ROUND.md` (token rules + principles: binding), `docs/progress/REAL.md`
(audit, photo tests, plan). The "before" sheets of the audit are `docs/progress/real/audit_1..6.jpg`.

## Common rules (every worker)
* **You are a sibling cloud session** with your own container, CPU, dev server and branch. Start:
  `npm ci; (setsid nohup npm run dev > shots/dev.log 2>&1 < /dev/null &)`; then work on your branch, created from
  `claude/pensive-gates-bim12i`. Own only the files listed in your brief; anything outside → write the request in
  `docs/progress/real-requests.md` (on your branch) and mention it in your milestone message.
* **Bench, not tours.** Judge with `node scripts/bench.mjs --classes <yours> --out shots/<you>/<step>` (one page
  load; ≈ 100 s load + 25 s per capture in this software-GL container; ≈ 5 classes × 3 distances < 4 min).
  Use `--pick 1,2…` for variation, `--q "time=…"`, `--dists 2,5,15`. Never block > 4 min on a command: start long
  ones with `run_in_background` and keep working. Before/after: run the bench on the base commit in a
  `git worktree` (port 5174: `npx vite --port 5174 --strictPort`, `--url http://127.0.0.1:5174/`).
  If you fix bench framing faults (REAL.md "Bench framing faults"), commit that first and say so.
* **The ladder per class, in order:** form & proportion (real dimensions, bevels) → construction (frames, fixings,
  sills, gutters…) → material (procedural relief: normal/roughness from courses/grain, wear where use and weather
  put it; near-only fade) → contact (dirt/damp at the base, nothing floating or clipping) → signs of life (near
  LOD only) → variation (no two neighbours alike) → mechanics. Each step must pass the photo test in REAL.md at
  3 m; the overview must stay at least as good (check with `node scripts/shot.mjs --view overview`).
* **Judge without mercy:** "improved" ≠ "real". Put a real-world reference in your head and compare at 3 m.
* **Performance:** detail near the camera (instancing, merged geometry, distance LOD); shader detail where it reads
  the same as triangles; no per-frame allocations; measure with `node scripts/perf.mjs --view <poi> --variants
  ";<your toggle>"` (software GL: compare variants within one run only). Every feature: a quality tier
  (`ctx.quality` low/medium/high) and a URL toggle `?no<feature>`; list them in your log. If a rule must break,
  propose it with its price — never compromise silently.
* **Out of scope:** lighting, shadows, reflections, fog/atmosphere, sky, post. Judge at 11 h; check 21.5 h only for
  regressions (night windows, emissives).
* **Checks before every commit:** `npm run typecheck`; one `shot.mjs --view downtown --invariants --stats` (console
  clean, invariants 0). Commit + push your branch at every milestone (`git push -u origin <branch>`).
* **Log** `docs/progress/real-<you>.md`: "## Resume here" at the top (updated after every step), done, **tried and
  rejected (why)**, toggles + tiers + costs, sheet paths (copy final before/after sheets as JPEG ≤ 600 KB into
  `docs/progress/real/<you>_*.jpg` so the lead sees them), next steps.
* **Context:** when your context nears ~200k tokens, or a milestone ends, write the log, commit, push and send the
  lead (`send_message` to session `session_01XuhAMczW3iK25AAWnf3qog`) a ≤ 120-word milestone note: branch, commit,
  what changed, sheet path, toggles, open items, "continue" or "done". Then stop — the lead spawns a fresh session
  from your log. Read code with `grep -n` + targeted ranges; small Edit hunks; batch independent tool calls.
* **Log early, commit early.** Wave 1 workers read ~250k tokens of code in 35 min and hit the account usage
  limit with nothing pushed. Rules: write your log skeleton + push within your first ~15 tool calls; after each
  reading burst, write the code pointers you learned into the log (so the next session never re-reads them);
  commit + push WIP that typechecks at least every ~30 min. Read with `grep -n` and ≤ 80-line ranges — never whole
  files over 300 lines. Budget: ~120k context for reading + design, the rest for edits and bench judgments.
* **Measure your context, don't guess it.** After every bench judgment call `get_session` (claude-code-remote
  MCP, no session_id) and read `external_metadata.context_usage.used_tokens`. At ≥ 170k: wrap up (log, commit,
  push, note). Every wave-1/2 worker overshot (255–338k) because nobody looked.
* At the end of your session run `python3 scripts/agent-tools/tokens.py` (no args → this session) and paste the
  summary into your log.

## W1 — Facades (buildings)
Audit #1 (+ #6 industrial doors, #11 contact for buildings). Owned: `src/world/buildings/**`, `src/world/buildings.ts`.
Photo tests: "House / townhouse", "Apartment / office / tower", contact. Priorities, highest impact first:
1. Windows with real depth: reveal (8–15 cm set-back), protruding sill with drip edge, frame + muntin relief, glass
   with curtains/blinds (varied per window; keep the existing interior mapping at night). Geometry where it reads
   (near LOD, merged/instanced), shader parallax where it reads the same.
2. Wall materials as physical surfaces: brick with mortar joints in relief and per-brick tone/chips, render with
   trowel texture and hairline cracks, stone ashlar, concrete with formwork lines; weathering streaks under sills,
   a darker plinth course with splash dirt and damp, near-only detail fade.
3. Doors and entrances: frame, step, handle, letterbox, house number (legible), bell/lamp; roller and
   warehouse doors with slats in relief, kick plates, bollards.
4. Gutters + downpipes + shoe; eaves with fascia/soffit; roof tile rows with ridge tiles, moss at the eaves.
5. Signs of life on facades: pots on sills, varied curtains, AC units, satellite dishes, letterboxes, intercoms.
6. Variation: no two neighbouring houses identical (tint, trim colour, door type/colour, curtain state).
Toggles e.g. `?nowinreveal`, `?nowallrelief`, `?nofacadelife`.

## W2 — Vehicles
Audit #2 (then #7 trains if time remains; trains are owned by W2 only after the cars/bus pass). Owned:
`src/sim/traffic/**` (models.ts, carBody.ts, vehicleMaterial.ts, specs.ts, render.ts), `src/sim/ambient/vehicleModels.ts`;
for trains `src/sim/rail/trainModels.ts`, `trainMaterial.ts`, `trainRender.ts`. Keep the sim untouched except
pure presentation hooks. Photo tests: "Car", "Bus", "Train / boat" (train part).
1. Bodies: crease lines and bevelled edges, panel gaps (doors, bonnet, boot) via geometry or shader, door handles,
   mirrors, wipers, plates (legible random numbers), badges; bumpers in a separate finish; lamp clusters with lens
   depth (keep the existing emissive behaviour).
2. Glass: tint with a visible interior (seats, headrests, dashboard) — at least for the near LOD.
3. Wheels: tyre sidewall + tread, rims with spokes and nuts (they spin already); wheel arches with liner.
4. Contact and wear: tyre contact (slight flattening / dark contact), dust on lower body and behind wheels,
   per-vehicle wear (some clean, some dirty, a dent or a mismatched panel).
5. Bus: framed windows in seals, glazed folding doors, front with destination display, mirrors on arms, roof units.
6. Variation: models × colours × wear × state (window down, roof box, parked with door open is a bonus).
7. Mechanics: body pitch on braking / roll in turns if the sim exposes acceleration (presentation only).
Toggles e.g. `?nocarinterior`, `?nopanelgaps`, `?novehiclewear`.

## W3 — Street furniture, park structures, market stall
Audit #3, #5, #9 (+ contact for props). Owned: `src/world/props/**`, `src/world/props.ts`,
`src/world/landmarks/park.ts`, `src/world/landmarks/civic.ts` (statue, kiosk, gazebo, playground, flagpole, market
stall — confirm by grep where `marketstall` is built; take only those builders), `src/world/life/**` only if a prop
lives there. Photo tests: "Bin … Bollard", "Market stall", contact.
1. Replace every box/cylinder prop with the real object: bins (lid, rim, liner bag, post/bolts), planters
   (bevelled concrete/timber, soil + plants, stains), newsstand (shutter, overhang, magazine racks), phone box
   (glazing bars in relief, crown, interior), bollards (cast iron collar), flagpole (taper, base plate, halyard,
   cleat), statue plinth (mouldings, inscription, bronze patina), benches (check fixings + wear).
2. Park structures: gazebo (turned columns with base/capital, plank floor, balusters, roof boards), kiosk (boarded
   walls, counter, shutters), playground (real swing chains/seats, slide with rails, climbing frame joints,
   safety surface), picnic tables (planks with gaps, bolts).
3. Market stall: trestle tables, pole frame with sagging cloth awning, slatted crates with individual produce,
   price boards, scales, boxes and cardboard on the ground.
4. Materials: one shared props material family per finish (painted metal with chips + rust at the foot, galvanised,
   cast iron, timber with grain + grey weathering, concrete with aggregate + stains) through props/material.ts.
5. Contact: base plates bolted, dirt ring where props meet paving, nothing floating.
6. Variation: paint/wear per instance; states (bin lid ajar, bag beside, sticker).
Toggles e.g. `?nopropdetail`, `?nomarketdetail`.

## W4 — People (wave 2)
Audit #4. Owned: `src/sim/pedestrians/**` (body.ts, shader.ts, looks.ts, animate.ts, gait.ts, pose.ts, rig.ts,
render.ts, vendors.ts, cafes.ts, riders.ts, tableware.ts) — not crowd.ts/places.ts logic beyond presentation.
History: docs/progress/gfx-people.md, docs/progress/people-review.md (§4 spec) — read only their summaries/"next".
Photo test: "Person" in REAL.md. Bench: `--classes pedestrian --pick 0..5 --dists 2,4,10` (sim paused).
1. Faces at the near LOD: eye sockets/brows/nose/mouth/ears by shader shading on the head (no texture files), skin
   tone variation, age cues; hair with volume and strand shading, hairline.
2. Hands: fingers readable at ≤ 3 m (near LOD), relaxed curl; mitten hands only at far LODs.
3. Clothing as fabric: seams, collars, pockets, hems, buttons/zips, folds at elbows/knees/waist that move with
   the pose; fabric-specific shading (denim, knit, cotton, leather shoes with soles).
4. Weight in the walk: heel strike, hip sway, shoulder counter-swing, head bob; idle weight shift; age differences.
5. Carried things & life: bags with straps, phones, umbrellas, dogs on leads (if present), shopping.
6. Vendors face the aisle (request from W3, real-requests.md); café sitters hold cups.
7. Variation: no two neighbours identical (build, height, clothing palette, hair).
Performance: people are many — near-LOD detail only within ~15 m; measure with perf.mjs `;nopeopledetail`.
Toggles e.g. `?nofaces`, `?nopeopledetail`.

## W5 — Trees, ground contact, kerbs, fences, signs, lamps (wave 2)
Audit #10, #11 and the street "hardscape" not yet covered. Owned: `src/world/vegetation/**` + `src/world/vegetation.ts`
(trunks, bases, tree pits only — leave crowns/leaf cards as they are), `src/world/roads/**` + `src/world/roads.ts`
(kerbs, drains, manholes, road markings wear), `src/world/lamps.ts` + `src/world/lamps/**` (lamp posts as objects —
not their light), garden fences/hedges/gates in `src/world/props/garden.ts` + `gardenPlan.ts` (coordinate: W3 owned
props/** in wave 1 and has finished), `src/sim/traffic/signals.ts` (traffic signs/signals as objects; W2 does not
touch it). Photo tests: "Tree" + "Contact" in REAL.md, plus:
* **Kerb:** granite/concrete kerb stones in 1 m units with joints, a chamfered arris, dropped kerbs at crossings,
  gully grates in the channel, wear and dirt in the gutter line.
* **Fence/gate:** posts set in the ground, rails, pickets with gaps and weathered paint, a gate with hinges and a latch;
  hedges with gaps and woody bases.
* **Sign / signal:** pole with base and clamps, sign plate with a back, rim and bolts, legible text, slight tilt or
  sticker on some; signal heads with visors and back plates.
* **Lamp post:** base with door and bolts, tapered pole, joints, a lantern with glass and a cap.
1. Tree bases: root flare into the soil, bark furrows near the ground, street tree pits (grate or soil + leaf
   litter), guard rails on young trees; park trees with grass worn at the base.
2. Kerbs and gutters (above), drain grates, manhole covers with legible castings.
3. Fences/hedges/gates in gardens (above); 4. signs and signals (above); 5. lamp posts (above).
6. Contact: every object you own sits in the ground (no hovering edge, soil/grime at the base).
Toggles e.g. `?notreebase`, `?nokerbdetail`, `?nofencedetail`, `?nosigndetail`.

## W6 — Dense real places I: market square, café terrace, back yard (wave 3)
Plan item 8 of NEXT-ROUND.md ("Dense real places"). Owned: `src/world/props/**` + `props.ts` (scatter, kit, layout,
gardenPlan — keep W5's fence/lamp changes), `src/world/life/**` (decor, cloth, extras), `src/sim/pedestrians/cafes.ts`
+ `tableware.ts` (presentation only). First finish W3's leftovers from docs/progress/real-w3.md "Resume here"
(re-bench kiosk/playground/gazebo/statue/planter after its last edits; measure the cost of magazine covers and
produce with perf.mjs). Then make three places so dense with real things that a visitor stops to look — each
verified like a POI (a fixed camera at eye level + a 10 m view + the overview unchanged):
1. **Market square:** stalls packed with goods and life — crates stacked behind, empty boxes and cardboard, a
   hand truck, a delivery van being unloaded, bunting/string lights between stalls, chalk boards, bins overflowing a
   little, dropped leaves and paper, pigeons; vary stall types (fish on ice, flowers in buckets, bread, cheese).
2. **Café terrace:** tables with real tableware (cups, saucers, glasses, menus, a newspaper, a bag on a chair),
   chairs at angles not a grid, a chalk A-board, planters dividing the terrace, an awning or parasols, a waiter
   station, cigarette stubs near the kerb; people mid-gesture.
3. **Back yard / alley:** bins and recycling crates, a washing line with clothes (the shared wind), a bicycle
   leaning, stacked pallets, a drainpipe with a water butt, weeds in cracks, a back door with step and mat, an AC
   unit, a gas meter box, a small herb pot garden.
Mechanics in these places: awnings, parasols, bunting and washing move with core/wind.ts (open item "awnings and
parasols are static"). Toggles e.g. `?nomarketlife`, `?noterracelife`, `?nobackyard`; quality tiers; measure cost.

## W7 — Dense real places II: harbour quay + boats, building site, station platform (wave 3)
Audit #8 (boats), #12 (jetty/beach gear) and plan item 8. Owned: `src/world/harbor/**` + `harbor.ts`,
`src/sim/boats/**` + `boats.ts`, `src/world/landmarks/construction.ts`, `src/sim/rail/station.ts` +
`staticMaterial.ts` (platform furniture; W2 owns trainModels/trainMaterial/trainRender). Photo test "Train / boat"
(boat part) in REAL.md. Bench classes boat, jetty (add quay/site/platform views to bench.mjs if useful).
1. **Boats:** hull plating seams and weld lines, rubbing strakes and fenders, deck fittings (cleats, bollards,
   winches), railings with stanchions, wheelhouse with framed windows and wipers, life rings, ropes, rust streaks
   from scuppers, waterline grime; small craft with oars, tarps, outboards.
2. **Harbour quay:** cast-iron bollards with ropes to moored boats, coiled ropes, fishing nets, lobster pots, fish
   boxes, pallets, a forklift, rusted ladders down the quay wall, tyre fenders, weed and wet line on the wall,
   puddles and stains.
3. **Building site:** hoarding with posters and a gate, scaffolding with boards and toe-boards, stacked materials
   (bricks on pallets, rebar, sand heap, timber), a skip, a portable toilet, a mixer, cones and barriers, mud on the
   pavement at the gate.
4. **Station platform:** platform edge with tactile strip and yellow line, benches, a timetable board, a clock,
   ticket machine, bins, canopy columns with fixings, signage with legible station names, luggage, waiting people.
Toggles e.g. `?noquaylife`, `?nositedetail`, `?noplatformdetail`, `?noboatdetail`; quality tiers; measure cost.

## W8 — Countryside and small nature: animals, tractor, farm buildings, flowers (wave 3)
The objects outside the town that nobody owned yet (open items in NEXT-ROUND.md: "sheep look faceted under 5 m",
"flower heads are crude under 2 m"). Owned: `src/world/landscape/farmlife.ts` (herds, tractor),
`src/world/landscape/settlements.ts` + `fleet.ts` (far farms/villages as objects near the slab edge), the flower-head
geometry/shading in `src/world/groundcover/**` (blades/flowers only — no density/mask changes beyond what an object
needs), `src/world/vegetation/plants.ts` flower/shrub cards if flower beds live there. Not crowns, not terrain.
Photo test (write it into your log first): a sheep at 3 m (wool volume and fleece breakup, face and legs darker,
ears, legs with knees and hooves, weight on the ground, grazing pose variety); a cow (bone structure at hips and
shoulders, udder, tail with switch, patches with soft edges); a tractor (big rear tyres with lugs, cab with glass and
frame, exhaust stack, hitch and implement, mud); flowers at 1–2 m (petals with count/shape per species, centres,
stems with leaves, droop, colour variation); a farm building at 10–40 m (barn with boarding, doors, roof sheeting,
silo, fences, gates, hay bales). Contact: hooves and tyres sit in the grass, tracks in the field.
Bench: add `sheep`, `cow`, `tractor`, `flowerbed` classes to scripts/bench.mjs (commit that first).
Toggles e.g. `?noanimaldetail`, `?noflowerdetail`, `?nofarmdetail`; tiers; measure cost (herds can be many).
