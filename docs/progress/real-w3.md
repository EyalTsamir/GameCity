# W3 — street furniture, park structures, market stall ("real things" round)

Branch `claude/real-w3-furniture` (from `claude/pensive-gates-bim12i`). Brief: docs/progress/real-briefs.md "W3".

## Resume here
* 2026-10-28 — **Session 4 ends (context ~250k, over the 170k rule: the session API reported used_tokens 0,
  counted from the token budget instead).** Base claude/pensive-gates-bim12i @ b10714f. All pushed.
  Judged on the bench (shots/w3/s4a = busstop, newsstand, marketstall 2.5/6 m; shots/w3/s4b = kiosk, playground,
  marketstall, bin, bench 3/10 m; pedestrians hidden). Done this session:
  - **Bugs 2/6 (bus stop):** the disc + white bar (= No Entry on red routes) is now a rectangular white flag
    across the footway line with a route-coloured head band, "BUS" / "STOP" lettering and a yellow H roundel
    (furniture.ts busShelter). Timetable = steel case, route-coloured head ("LINE"/"ROUTE"), 3 printed columns,
    glass cover. Ad panel = `poster()` (5 themes in POSTERS: photo with sky/ground/product/sun, headline in the
    pixel font, small print, brand band), emissive in its own colours (night = lit image, not a white glow).
  - **Bug 7 + newsstand:** fascia sign under the eaves (NEWS / PRESS / KIOSK / TABAC + strap line, lit), the
    roof-top placeholder board removed, the roof sheet's underside closed (no daylight between roof and slab).
    Every rack/shelf cover = `cover()`: paper colour, photo (portrait / car / dish), masthead in the pixel font,
    cover lines, price corner; covers behind the front one are plain (colour + masthead band).
  - **Bug 8:** civic.ts `stallGoods()` — greedy per plan, never the goods of a stall within 14 m, then the
    least-used kind; GOODS + EGGS (pulp trays) + OLIVES (glazed bowls).
  - **Market:** heap = per-item tint (HSL jitter, 18 % from the next colour), size 0.78–1.18, squash, random
    tip/turn (shared unit sphere `_ball` via geoM), patchy upper layers (holes rising to the rim), layer height
    jitter; honey jars two sizes, two lid colours. Dial scale (enamel base, dial with 20 ticks + needle + bezel,
    dished pan, brass weights, paper bag). Back cloth = `shell` drape (pleats at the rail opening into deep
    folds, uneven hem, tucked corner) + curtain rings. Ground: flattened boxes leaning on one table end, a box
    with open flaps at the front corner, sack truck leaning on the other end (always, rich tier).
  - **Kiosk (park.ts genKiosk) rebuilt:** six wall faces as boards (green skirt with fielded panels, cream
    board-and-batten), corner posts on the real corners (they stood on the face centres, one in front of the
    hatch), a real opening into a lit interior (side walls, ceiling, shelf of jars, cups, espresso machine,
    chalk menu), roller-shutter box + guides, canvas awning sagging on arms with valance and cheeks.
  - **Playground:** tiles each their own tone + replaced dark tile + wear band along the swing path; bearing
    hangers, swivel eyes and a chain core line (reads at 10 m); head-casting bolts; roundabout = deck in
    painted sectors worn to steel, rim + skirt, concrete ring, 6 bent grab rails + ring rail + hub knob.
  - **Contact grime:** contact.ts gain 1.9 → 3.4, dirt colour darker, cap 0.72 (it only darkened ~15 % and
    vanished in the paving; verified by forcing NormalBlending: quads render, alpha was tiny).
  - **Step 6:** bin hood skirt (hemmed lip, bead, dark underside, worn strip) + "LITTER" label; planter soil
    5 cm under the rim with damp edge, dry middle, clods, bark chips, splash on the rim, stronger stains;
    gazebo soffit (16 boarded panels per rafter bay, own tones, water marks, purlin rings, ceiling boss) + rail
    wear (grey timber on hand-rail tops, algae on bottom rails); statue steps with nosing + shadow line,
    vertex-colour damp/algae at riser feet, worn front treads, dirt in the step joint, block joints, lichen.
  - New `shapes.ts pixelText()` (3 × 5 box font, runs merged, thin print = front face only).
  Downtown shot after the last fix: console clean, invariants {} (market clutter pulled inside r = 1.3).
  Sheets: docs/progress/real/w3_s4_busstop.jpg, w3_s4_newsstand.jpg, w3_s4_market.jpg, w3_s4_kiosk.jpg (pre-fix kiosk).
  **Not yet judged on the bench (next session first):** kiosk after the shutter/coffee-machine fix, playground
  10 m + roundabout close-up, marketstall pick 1, bin/bench grime at 3 m, planter, gazebo soffit, statue steps
  (bench `--classes kiosk,playground,planter,gazebo,statue,bin --dists 3,10 --q hide=pedestrians`).
  **Next:** (1) judge the above; (2) phone box (uniform panes, paint chips), picnic wood grain, flagpole halyard
  at 3 m; (3) perf: newsstand covers (~20 quads per cover, ~75 covers per stand, coarse kit) and market produce
  — `perf.mjs --variants ";nopropdetail"` / `";nomarketdetail"`.
* 2026-10-28 — **Session 3 ends (context cap).** All pushed. Sheets: docs/progress/real/w3_after_5.jpg (market,
  gazebo, bench, bin, planter, bike rack at 3/10 m), w3_after_6.jpg (2.5 m, pedestrians hidden),
  w3_statue_2.jpg (bronze figure side view), w3_planter.jpg (trailing petunias). Downtown shot: console clean,
  invariants {} (0). Judged: statue now a clear human silhouette (head, shoulders, pointing arm, coat skirt,
  stride) in dark bronze + verdigris + brass toe; market cloth drapes in folds, produce heaped, chalk prices,
  crates under; stalls differ (goods/awning/cloth); gazebo columns turned; planters spill over the rim.
  **Next (session 4), in order:** (1) plinth streaks: check at 3 m after the strength bump (shade hides them at
  9 m); (2) statue: queue still a small bump at the back of the head; tricorn in the left hand reads as a pot
  from behind — give it a real three-cornered brim (`shell` with the brim turned up); leg/boot cuffs read as
  bands; (3) market scales still white blocks (dial face, pan, weights); produce pyramids too regular (jitter
  layer heights, drop a few, one item on the cloth); (4) gazebo inner bench rebuilt (boards on bearers) —
  verify at 3 m; (5) bench framing: pedestrians block close captures — run classes without people via
  `--q hide=pedestrians` (works); bin 10 m now outside the shelter but near a panel → new 0.9 m lens probe
  added (unverified); (6) bench fixings / bike locks / phone-box interior added but not yet judged at 2 m
  (bench 2.5 m sheet shows a modern bench from too far to see bolts — use `--dists 1.5 --pitch 25`);
  (7) perf: measure `?nopropdetail` / `?nomarketdetail` (market produce grew ~3×: forceDetail = near only).
  Session 3 tokens.py: TOTAL weighted 3.1M (cache read 81 %, write 8 %, output 11 %), 133 calls, ctx median
  195k / max 255k; system+brief 37 %, Bash read/grep 14.5 %, images 5.3 %.
* Session 3 progress (WIP pushed): new **src/world/landmarks/sculpt.ts** — `surface` (param grid, smooth
  normals), `shell` (thin solid: outer/inner skins + rims), `body` (lathe-like superellipse with a bump fn),
  `blob` (deformed ellipsoid), `capsule` (tapered, a→b), `paint` (vertex colours from pos/normal), `hash1`.
  Landmark builder multiplies vertex `color` by the Mat colour (M('#ffffff') + paint = per-vertex albedo;
  paint values are LINEAR unless `setRGB(..., THREE.SRGBColorSpace)`). **Statue** (park.ts genStatue): figure
  rebuilt from sculpt parts — capsule legs/boots (left foot forward, right heel up), open coat-skirt shell with
  folds + back vent, superellipse torso with lapel ridges, face carved into a blob (nose/brow/sockets/mouth/
  chin), hair cap + queue, right arm pointing to sea, left hand holding the tricorn; patina in vertex colours
  (dark bronze, verdigris on up-faces + streaks, dark undersides, brass-rubbed toe). Plinth: deeper cornice
  (undercut soffit, corona 0.745) + torus base; die faces carry 56×14 vertex-colour grids of green-grey run-off
  streaks; capping tinted. Close-up script: scratchpad stat.sh = capture-set views a..e around (-45, 3.7, 17.5).
  **Market** (civic.ts): tablecloth = `shell` drape (top + rolled edge + folded front drop, end drops), 6 cloth
  colours; produce in 2–3 layers, goods-specific (fish rows on crushed ice + lemon, flowers in zinc buckets,
  loaves heaped + baguettes, spice cones in bowls, carrots, aubergines, big cabbages, stacked cheese wheels with
  rind band); chalk price cards (`priceCard`, atlas text); crates + stock under the table; plain vs striped
  awning by id. **Columns**: gazebo turned profile (torus, scotia, vase swell, astragal, echinus; 16 seg),
  bandstand cast-iron lathe columns, kiosk post plinths + caps. **Planters** (props.ts slot case): trailing
  ivy/petunia leaf cards over 1–3 sides + tall grass/lavender accent (GreenKit; `?nogreen` off).
  **Benches**: foot plates + anchor bolts, centre bearers, screws (all 3 styles). **Bike rack**: flanges +
  bolts, D-lock / cable lock per bike. **Phone box**: cord, coin box, card, directories, flyer, stickers.
  **bench.mjs LOS**: meshes collected with traverse() (culled chunks were invisible to traverseVisible → bin
  10 m ended inside a culled bus shelter). Requests: docs/progress/real-requests.md (vendor faces backwards).
* 2026-10-28 — **Session 3 started.** Merged lead (9708a9f). Lead order: (1) statue figure silhouette at 10 m
  (head, shoulders, arm gesture, coat folds) + patina streaks onto plinth + deeper mouldings; (2) market stall cloth
  folds, higher produce + price cards, crates beside/under, stalls differ (awning colours, goods); (3) gazebo/kiosk
  column base/capital; (4) planter plants varied + overhanging; (5) bench `bin 10m` framing bug; (6) bench fixings
  + wear at 3 m; then phone box interior, bike rack with locked bike.
* 2026-10-28 — **Session 2 status** (see "Session 2 progress" below). Downtown invariants 0, console clean
  (after fixing statue steps + market canopy radius). Sheets: docs/progress/real/w3_after_3.jpg / _4.jpg.
  **Next (session 3), in order:** (1) statue figure: face still mask-like (brow/nose boxes), lapels read as
  straps — sculpt with lathed/ellipsoid parts; (2) planter plants are cone mounds — use leaf cards
  (GreenKit) or bushier clumps; (3) kiosk + picnic + mailbox/hydrant/bike rack: contact + wear pass;
  (4) contact decal: tune per surface (lawn vs paving) — on lawn it should be worn grass/soil, not grime;
  coordinate with the wave-2 ground-contact worker (props/contact.ts can be shared: `queueContact`);
  (5) gazebo worn strip tone check at 3 m; (6) bench `bin 10m` STILL frames from inside a bus shelter even
  with the 5-probe enclosure test (both ray directions) — debug: log the probe hits for that capture.
  Steel planters are now corten (weathering steel, `iron` wear: rust bloom + streaks) — reads real at 3 m.
  Statue figure close-up: docs/progress/real/w3_statue_figure.jpg.
  Session 2 tokens.py: TOTAL weighted 2.8M (cache read 79 %, write 8 %, output 13 %), 126 calls, ctx median
  176k / max 246k; system+brief 39 %, Bash read/grep 16 %, output 13 %, images 3.5 %.
* 2026-10-28 — **Session 2 started.** Merged lead branch (a907524). Lead verdict on session 1: progress, not yet
  "real" at 3 m. Session-2 order: (0) downtown invariants check; (1) ground dirt ring at prop bases (every class);
  (2) planter bevel/frame + soil + drainage stains; (3) newsstand roof overhang depth, shutter, racks; (4) market
  counter: trestle legs, cloth folds, slatted crates; (5) gazebo plank floor + worn path; (6) flagpole base plate,
  bolts, halyard, cleat (session 1 claimed done — verify visibility); (7) playground safety surface + swing chains;
  (8) statue figure + plinth; (9) bench LOS: `bin 10m` ended inside a bus shelter; (10) perf ?nopropdetail.
* Session 2 progress (WIP commits pushed): **downtown invariants** run → 1 fault (statue steps' octagon corners
  7 cm outside r = 1.5: facetLathe puts corners at r / cos(π/8)) → fixed (`Rs` in genStatue). Console clean.
  New `src/world/props/contact.ts` (ground grime decals: rounded-rect SDF band, multiply blend, fades 45–70 m;
  `queueContact`/`queueContactLocal` for landmarks, built by props.ts `spot()` → mesh `props-contact`;
  `?nocontact`, off on low). Spots: lamps, benches (feet + scuff), bins, hydrant, bike rack, planter, mailbox,
  phone box, newsstand (+ trodden patch), bus shelter, bollards; statue, gazebo, kiosk, picnic, flagpole,
  market stall poles + table. Planter: 4 cm chamfer, weep holes + wash, tapered run-off streaks (furniture.ts
  planterBox). Newsstand: deep roof (fascia, soffit, drip), shutter housing + rails + part-lowered slatted
  curtain, tiered rack trays with stacked covers, back panels + lit poster case + kick plate. Market: cloth
  with folds over the front/ends (trestles show), 3-slat crates with gaps and slatted bottoms. Flagpole:
  square plinth, square plate, 4 studs (washer/nut/thread), sleeve with door, horn cleat + coiled halyard.
  Gazebo: plank boards with gaps over a dark sub-floor + worn strip. Statue: new figure (boots, breeches,
  coat with tails/lapels/buttons, face, queue, hands, scroll, tricorn; PAT.RUST on verdigris = brown streaks),
  bold mouldings, sunk side panels, incised name. Playground: EPDM crumb tiles (PAT.GRAVEL) over the swing
  arc, kerb, scuffed tiles under seats; torus chain links.
* 2026-10-28 — Session 1 ends (context). Committed + pushed. Bench after-sheets: docs/progress/real/w3_after_1.jpg
  (bin, planter, phonebox, newsstand, bench, statue) and w3_after_2.jpg (gazebo, kiosk, playground, picnic,
  market stall, flagpole) — before = audit_3..5.jpg. Judged at 3 m: phone box, statue pedestal, gazebo
  roof/balustrade, picnic table, market produce and kiosk chairs now read as real objects.
  **Not yet verified:** the `shot.mjs --view downtown --invariants --stats` check did not run (the dev server
  died with the worker restart: ERR_CONNECTION_REFUSED). The two bench runs were clean (no console/page/frame
  errors, no failed modules) but invariants are unchecked → run it first in session 2.
  Code: furniture.ts bench :168, bin :233, phonebox :337, newsstand :417, planterBox :499, bollard :565;
  props/shapes.ts (cbox, lathe, poly, bolts, ring); props/legacy.ts (old builders); props.ts `simple` flag;
  park.ts facetLathe :18, genStatue :29, genGazebo :139, genKiosk :330, genPlayground :432, genPicnic :631;
  civic.ts genFlagpole :12, slatCrate :58, produce :71, genMarketStall :112 (`richStall`); props/material.ts
  WEAR_GLSL (new steel / ceramic branches, aggregate specks). Bench LOS: scripts/bench.mjs (`los` block).
  **Next (session 2), in order:**
  1. Re-bench the 10 m newsstand (front not yet seen: LOS had to swing to its back; per-class widths now fixed)
     and the modern bin (reads as a dark box — consider a brighter stainless default + visible liner).
  2. Gazebo floor reads flat brown (PLANKS not visible on the cyl top: give the floor a plank uv / radial boards).
  3. Statue figure itself (still a lathe "frock coat"; bronze flat teal — darker bronze with verdigris streaks).
  4. Contact: ground dirt ring around prop bases needs a decal layer (transparent) — not done; foot grime on
     the props themselves exists (wear shader). Coordinate with the wave-2 ground-contact worker.
  5. Mailbox / hydrant / bike rack untouched (audit: good/fair). Bus shelter untouched (good).
  6. Measure cost: `node scripts/perf.mjs --view downtown --variants ";nopropdetail"` and
     `--view oldtown --variants ";nomarketdetail"` (software GL: compare within one run).
  7. tokens.py summary.

## Done
* **scripts/bench.mjs — line of sight** (REAL.md "bench framing faults"): before each capture the camera swings
  around the object (yaw +18, −18, ±55, ±95, ±140, 180, then the same at 0.6 × arm) until a ray from the object's
  middle to the camera hits nothing in either direction (both directions: one-sided roofs/walls are only hit from
  their front; glass counts, billboards/sky/water don't). `report.json` captures carry `los: {dy, arm, blocked?}`.
  Not fixed: tree crowns whose instances are placed in the shader are invisible to the raycaster (picnic 10 m),
  moving objects are not yet restricted to open road (W2's classes).
* Playground safety tiles: tried bright green → read as astroturf; now red EPDM with CONCRETE pattern.
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
* Statue vertex colours given as plain numbers: they are LINEAR → the bronze read light salmon. Use
  `setRGB(r, g, b, THREE.SRGBColorSpace)` for albedo; multipliers (streaks) stay linear.
* Planter trailing cards at hx = along/2 − 0.04: hidden inside the trough wall. Cards start at the outer face.
* Gazebo inner bench as `K.beam(w 0.32, h 0.06)`: the beam cross-section turned on end on some sides.
* Contact band at strength ×1.25 / squared fall-off: invisible at 3 m in bench shots (looked like no decal at
  all; verified by switching to normal blending: the quads were there). Now ×1.9, linear-ish fall-off.
* Enclosure probe (camera inside a bus shelter) with one-way rays: missed single-sided glass from inside.
* LOS with transparent meshes excluded: the camera ended inside curtain-wall glass (phonebox/newsstand 40 m).
* LOS ray from the object only: misses roofs seen from below (playground 40 m ended inside a shed roof).

## Toggles / tiers / costs
* Planter trailing plants: props-green leaf cards (`?nogreen` off; near-only mesh); off with `?nopropdetail`/low.
* Statue sculpt figure, plinth streak grids (4 × 56 × 14 quads), tablecloth shells: always on (boot geometry).
* `?nopropdetail` — old primitive bins/planters/phone boxes/newsstands/bollards (props/legacy.ts). Also the
  **low** quality tier (boot-time `ctx.quality.level === 'low'`).
* `?nomarketdetail` — market stalls without individual produce, price cards, scales, ground clutter (crates
  become gravel slabs). Also the **low** tier.
* Landmark small parts route to the landmarks detail LOD automatically (< 25 cm / thin rods) or via forceDetail.
* Props detail lives in the fine (near-only, < 300 m) furniture meshes except phone box / newsstand (coarse).
* `?nocontact` — ground grime decals at prop bases (props/contact.ts; also off on **low**). 648 spots in the
  city, one draw call, 4 verts each, multiply blend, collapsed beyond 70 m.
* Cost (perf.mjs downtown 12 h, software GL, one run): baseline 802 / 780 ms, `nopropdetail` 763 ms
  (−38 k tris, ≈ −3 %, at the noise level), `nocontact` 839 ms (noise; −1 draw call, −1.3 k tris).
  Real GPU numbers still needed on the target.
* Shader: props wear gained galvanised-steel mottling + foot grime, concrete aggregate specks, terracotta salt
  bloom; painted-metal stickers made ~5× rarer (were confetti on large panels). `?nowear` still disables all.

## Sheets
* shots/w3/los/sheet_1.png — framing check.
