# "Real things" round — every object a convincing physical thing (started 2026-10-28)

User brief (Hebrew, 2026-10-28; full text in docs/progress/NEXT-PROMPT.md): make the world truly real through
the things themselves. Every class (house, vehicle, person, tree, bench, fence, sign, …) climbs the ladder
form/proportion → construction → material (relief + wear) → contact → signs of life → variation → mechanics,
plus a few dense real places (market, harbour quay, café terrace, back yard, building site, station platform).
Out of scope: lighting, shadows, reflections, fog/atmosphere, sky, post (touch only when an object needs it).
Judge in plain daylight; night = regression check. Method: docs/progress/NEXT-ROUND.md (binding).
Overview must stay at least as impressive as now. Every feature: quality tiers + URL toggle. No silent compromises.

Lead session: session_01XuhAMczW3iK25AAWnf3qog, branch `claude/pensive-gates-bim12i`.

## Resume here (keep current)
* 2026-10-28 16:37 UTC — Merged W3 milestone (10067eb; golden views unchanged, console clean, 1 invariant: statue
  plinth 7 cm outside r=1.5 → sent to W3(2)) and W1 milestone 1 (18be1ae; bench.mjs conflict resolved: W3 LOS +
  W1 --yaw/--pitch). Respawned W3(2) and W1(2) with the lead's verdicts. W2 has not answered yet (still on its
  wrap-up). W1 ignored the stop and ran to 338k — cap restated in its new prompt.
* 2026-10-28 16:10 UTC — All 3 wave-1 workers hit the account 5-h usage limit at ~15:50 (35 min in; 255–280k
  context each, mostly code reading; W1/W2 had pushed nothing). Sent each: write log, commit WIP, push, stop.
  Next: when their notes arrive, respawn fresh sessions from the logs (briefs now say: log early, commit every
  ~30 min, ≤120k for reading). Lesson: 3 parallel heavy sessions burn the shared 5-h limit in ~35 min — the
  account limit, not CPU, is the binding constraint; keep contexts small so each call is cheap.
* 2026-10-28 15:18 UTC — Audit written (below; sheets docs/progress/real/audit_*.jpg). Wave 1 launched: W1 facades,
  W2 vehicles, W3 furniture as sibling sessions (table "Workers"). Lead now waits for milestone notes; on each:
  fetch the branch, look at its sheets, merge into claude/pensive-gates-bim12i when sound, respawn per the rule.
* 2026-10-28 14:10 UTC — Lead: object bench `scripts/bench.mjs` built and committed (one page load, classes ×
  distances, sheets of 6 classes). Full audit capture running → shots/audit/all (≈45 min software GL).
  Next: write the audit (ranked table + photo tests) below, then launch wave 1 as sibling cloud sessions.
  Scheduled: hourly watchdog trig_01CiV41L5Hg1nJEasChWKp9Q, reset wake trig_01Kvk1fdjRY56tn14p7Vik8j (16:03 UTC).
  Delete both at the end.

## Machine restore (fresh container)
```bash
cd /home/user/GameCity && git pull origin claude/pensive-gates-bim12i
npm ci
mkdir -p shots/tools && cp scripts/agent-tools/{checkpoint.sh,autocheckpoint.sh,sheet.py} shots/tools/ && cp scripts/agent-tools/servers.sh shots/
(setsid nohup npm run dev > shots/dev.log 2>&1 < /dev/null &)
(setsid nohup shots/tools/autocheckpoint.sh 20 >/dev/null 2>&1 < /dev/null &)
```
Capture cost here (4 CPUs, SwiftShader): page load ≈ 100 s, then ≈ 25 s per 1280×720 capture. A bench run of
≈ 5 classes × 3 distances stays under 4 min.

## Tools
* `node scripts/bench.mjs --classes house,bench,car --dists 3,10,40 --out shots/bench/x [--pick n] [--q "skip=..."]`
  — the object bench. Moving classes are ray-picked and the sim paused. `--pick n` = n-th instance (variation).

## Workers
Wave 1 (launched 2026-10-28 15:17 UTC, sibling cloud sessions, briefs in real-briefs.md):
| worker | session | branch | log |
|---|---|---|---|
| W1 facades | session_01XuhAMgUxQGzZU9Z87GpQzS | claude/real-w1-facades | real-w1.md |
| W2 vehicles | session_01XuhAMfjoLtHnvYp6xNGDNE | claude/real-w2-vehicles | real-w2.md |
| W3 furniture | session_01XuhAMfy5Z4Xrnt2757Pifp | claude/real-w3-furniture | real-w3.md |
| W3 furniture (2) | session_01XuhAMfeZKD1WY6snNxJEiK | claude/real-w3-furniture | real-w3.md |
| W1 facades (2) | session_01XuhAMdw5hH6dJAf2ubL3JX | claude/real-w1-facades | real-w1.md |
Respawn rule: when a worker stops (milestone note, ~200k context, or a usage stop), create a NEW session on the
same branch with the same brief + "resume from docs/progress/real-wN.md Resume here"; archive the old one.

## Audit (2026-10-28, lead; sheets shots/audit/all/sheet_1..6.png = the "before" of the round)
Object bench, 11 h, 1280×720, 36 classes × 3 / 10 / 40 m, console clean, invariants 0. Score = screen presence
(1–5: how much of an average street/overview frame it fills) × primitiveness (1–5: how much it reads as a
primitive/flat colour at 3 m). Ranked:

| # | class | pres | prim | score | what breaks it at 3 m | code |
|---|---|---|---|---|---|---|
| 1 | facades of houses / apartments / offices (walls, windows, doors, base) | 5 | 4 | 20 | windows are flat painted rectangles (no reveal, no sill, no glass depth); brick = large flat tiles without mortar relief; plaster/concrete a flat tint; doors flat slabs; wall meets lawn/pavement with a hard clean line (no plinth, no splash dirt); house porch rails flat; apartment = plain slab with stuck-on balconies; no gutters/downpipes on most; no house numbers, letterboxes, curtains variety | buildings/materials.ts (shell shader), homes.ts, houses.ts, gen.ts, towers.ts, oldtown.ts, clutter.ts, anchors.ts |
| 2 | cars, vans, trucks, bus | 4 | 4 | 16 | soft blobby bodies without panel gaps, door lines, handles, mirrors, plates, wipers; flat window tint; bus = a box with window bands, no frames/doors/bumpers; wheels fair | sim/traffic/models.ts, carBody.ts, vehicleMaterial.ts, specs.ts |
| 3 | small street furniture: bin, planter, newsstand, phonebox, statue plinth, flagpole base, bollard | 3 | 5 | 15 | plain boxes/cylinders in one colour: bin = grey box, planter = black box, newsstand = blue box, phonebox panes flat, statue plinth stepped boxes; no fixings, no wear, no ground anchoring | world/props/furniture.ts, kit.ts, material.ts; statue/kiosk/gazebo/playground: world/landmarks/park.ts, civic.ts |
| 4 | people | 4 | 3 | 12 | smooth figurines; blank faces, mitten hands, clothes without folds/seams; good gait and silhouettes | sim/pedestrians/body.ts, shader.ts, looks.ts, animate.ts |
| 5 | market stalls (+ crates, produce) | 3 | 4 | 12 | flat canvas panels, crates are boxes, produce blobs; no tables/trestles, scales, price boards | world/landmarks (marketstall), props/kit.ts |
| 6 | industrial sheds, warehouse/factory doors | 3 | 3 | 9 | roller doors flat yellow/red with painted slots; corrugation OK; no bolts, kick plates, bollards at doors | buildings/industry.ts, materials.ts |
| 7 | trains | 2 | 4 | 8 | smooth tube, flat windows, no bogies/underframe/gangway detail at 3 m | sim/rail/trainModels.ts, trainMaterial.ts |
| 8 | boats (ferry, small craft) | 2 | 4 | 8 | box superstructure, flat windows, plain rails | sim/boats/models.ts, harbor/ship.ts |
| 9 | park structures: gazebo, kiosk, playground, picnic table | 2 | 4 | 8 | plain cylinders, flat brown floor, untextured boards, playground = coloured sticks | world/landmarks/park.ts, civic.ts |
| 10 | trees (trunk/base) | 4 | 2 | 8 | good crowns; trunk bases meet ground cleanly (no root flare / tree pit grate wear) | world/vegetation/*.ts |
| 11 | ground contact everywhere | 5 | 2 | 10 | lawn → wall, pavement → wall and props → pavement: perfect seams, no dirt/damp band, no settle | per family + a shared contact chunk |
| 12 | jetty / beach gear / lifeguard | 1 | 4 | 4 | planks OK, sunbeds and screens are flat slabs | harbor/beach.ts, pier.ts |

Good already (keep): bus shelter, bike rack, hydrant, mailbox (fair), fountain, church stone, townhouse rows with
awnings, school, crowns, café sets.

Bench framing faults seen (fix in bench.mjs before relying on it): the camera can end inside a building or a tree
crown (tree 10 m, train 40 m, jetty, phonebox/newsstand 40 m) — add a line-of-sight step (shorten the arm or swing
the yaw until a ray from the camera reaches the object), and pick moving objects that are on open road.

## Photo tests (what the real thing has; acceptance = all of it visible at 3 m, the silhouette right at 10 m,
## and the overview at least as good as before)
* **House / townhouse:** walls on a plinth (stone/render course 30–60 cm, darker, splash dirt); brick with mortar
  joints in relief and per-brick tone, or render with trowel texture and hairline cracks; windows set back 8–15 cm
  in a reveal with a protruding sill (drip edge), frames 5–8 cm with muntins, glass that reflects and shows
  curtains/blinds behind; door in a frame with step, handle, letterbox, house number, a lamp or bell; gutters and
  downpipes to the ground with a shoe/drain; eaves with fascia and visible rafter tails or soffit; roof tiles in
  rows with ridge tiles and moss at the eaves; chimney with flashing and pots. Neighbours differ.
* **Apartment / office / tower:** floor slab lines, window reveals with sills, spandrels, ground floor with
  entrance canopy, intercom panel, mailboxes, bike parking; AC units, vents, drainpipes; curtain walls with mullions
  in relief and per-pane reflection variance; plinth and dirt at the foot.
* **Car:** bevelled body with crease lines, panel gaps (doors, bonnet, boot), door handles, mirrors, wipers, number
  plates front/rear, badges; head/tail lamp clusters with lens depth; bumpers in a different finish; tyres with
  sidewall + tread, hubcaps/rims with spokes and nuts; tinted glass with visible interior (seats, headrest);
  sits on the road (tyre contact flattening, shadow), dust on the lower body. No two parked cars identical.
* **Bus:** framed windows in rubber seals, folding doors with glass, front with destination display, wipers,
  mirrors on arms, bumper, wheel arches, grille; roof units; route number; dirt behind wheels.
* **Bin:** real form (round or square with a lid/rim, liner bag edge, emptying hinge, post/base bolts), painted
  metal with chips and grime at the foot, a sticker. **Planter:** concrete/timber with edge bevel, soil + plants,
  drainage stains. **Newsstand:** kiosk with shutter, roof overhang, magazine racks with covers, sign. **Phone
  box:** glazing bars in relief, crown, door handle, interior phone. **Statue:** carved stone plinth with mouldings,
  bronze figure with patina, inscription. **Flagpole:** tapered pole, base plate + bolts, halyard, cleat.
  **Bollard:** cast-iron with collar and ring, or steel with reflective band.
* **Person:** face with eyes/brows/nose/mouth shading, hair with strands/volume, hands with fingers at close LOD,
  clothing seams/folds/collar/pockets, shoe soles; weight shift in the walk; carried things.
* **Market stall:** trestle tables with legs, a frame of poles with an awning cloth that sags and moves, crates of
  slatted wood with produce piles of individual fruit, price boards, scales, a stallholder; ground: boxes,
  cardboard, a hand truck.
* **Tree:** root flare into the ground, bark furrows, tree pit with grate/soil/fallen leaves in streets.
* **Train / boat:** bogies and underframe, couplers, door seals, wipers / hull plating seams, fenders, bollards,
  rails with stanchions, ropes, life rings, rust streaks.
* **Contact (all):** a 5–30 cm darkened/dirty band where anything meets the ground, damp at wall feet, nothing
  floating (check with the bench at 2–3 m, pitch 5°).

## Plan (waves; ≤ 3 heavy workers at a time, each its own cloud session and branch)
* **Wave 1** — W1 **facades** (audit #1, #6, #11 for buildings); W2 **vehicles** (#2, then #7 trains if time);
  W3 **street furniture + park structures + market stall** (#3, #5, #9, contact for props).
* **Wave 2** — people (#4); trees + ground contact + kerbs/fences/signs (#10, #11); boats/harbour quay/jetty (#8, #12).
* **Wave 3** — dense places (market, quay, café terrace, back yard, building site, station platform) + mechanics
  (doors/shutters/awnings in the wind, car pitch on braking).
* After each wave: fresh judge (all notes at once) → fixes → fresh bug-hunter free-camera sweep → `tokens.py`.
