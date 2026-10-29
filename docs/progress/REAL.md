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
* 2026-10-29 04:50 UTC — merged F4 s2 (print.ts printed newsstand/kiosk/phonebox, ?noprint; phonebox glass; poplar
  clumps fixed) and F2 s2 (9ec2ae1: occupants.ts real seated drivers/passengers within 38 m, ?nooccupants; sheet
  real/f2_s2_people.jpg). tsc OK, pushed. Golden f4 (before these two): overview 0.6, others 2–6 (facade edits).
  F3b granted the pasture block of landscape/shader.ts (toggle + overview eye check). F2c
  session_01XuhAMh8vfAev7DpzP7VknF (sail crew in new cockpit, tractor driver, train occupants, drum, bus windows,
  cost). Open: e-moped boxes (traffic models, unowned), e-scooter.
* 2026-10-29 04:00 UTC — F4 s1 merged (96a271a/6a14a9a: awnings sag, laundry folds+pegs (+1 draw), bunting, sailboat
  cabin/cockpit/rails/sail seams, tractor glass cab, forklift, aged props/quay/site, ?nonightmarket tarps, back yard
  fence/patio/shed/pots/toys; trees through buildings fixed; poplar clumps open; cloth 70k→113k tris, cost
  unmeasured). tsc OK, golden f4 running. F4b session_01XuhAMehKEmHEj5fmKgEJ3K (re-capture blank views, poplars, cost).
  Tractor driver + sail crew forwarded to F2b. E-scooter (W2) → open list.
* 2026-10-29 03:35 UTC — HARNESS FIX: the pumpFrames 8×8 clipped jpeg screenshots made Chromium tile an 8×8 patch over
  later captures (grey stipple; golden harbor 39.7 / oldtown 58.8, F2's "blank views", F3's harbor/westbrook 39/37).
  Pumps are now full-viewport. Golden after F1+F2 (shots/golden/f1b): overview 0.6, harbor 2.0, oldtown 4.1,
  downtown 4.4, westbrook 5.7 — all window interiors/house edits, no breakage. F3 s1 (5a6560a) wrapped →
  F3b session_01XuhAMgSAE5Y4dHDf82na4z (re-capture golden, bench-judge, felt lawn). F3 not merged yet.
* 2026-10-29 03:15 UTC — F1 s1 (aa407fc/99e6016: unique shop names, bookbinder interior, leaf lobby plants, Café Nord
  sign, church soot/streaks, school art+blinds, warehouse sign, porch posts; yard_b sills = not a bug; lawn rim = sun
  shadow leak → OUT OF SCOPE, open) and F2 s1 (4e678f4: actors.ts real posed figures for site/band/kids/boat crews,
  market shoppers, 22 platform passengers, quay workers; ?noactors) merged, tsc OK. Both hit the context cap →
  respawned: F1b session_01XuhAMeyiDquvccZotnrbgd (bench-judge s1, school entrance, church mouldings/rose),
  F2b session_01XuhAMgh2gQQLc7zRmcxRjR (bench-judge actors, vehicle occupants, sailboat crew). F3/F4 still s1.
* 2026-10-29 02:06 UTC — Judge 2 merged (docs/progress/real-judge-2.md: 4 real / 25 almost / 3 not yet (school,
  sailboat, sheep-at-3m); #1 places empty, #2 floating sills in yard_b, #3 primitive vehicle occupants, #4 pixel
  ballast + low-poly cutting, #5 felt lawns + rim, #7 repeated interiors, #8 too new, #9 flat cloth, #10 paving grid).
  Bug hunter 2 merged (real-bugs-2.md: HIGH placeholder box people; barn tree/poplar clumps, barn moiré, station bikes
  in planters, creel tails, laundry through tree, duplicate shop names, herd LOD one-frame lag, station board) + the
  HARNESS CAVEAT: headless renders only during screenshots → bench/capture-set/shot now pump 4 frames (c43100c).
  Final fix round F1 facades, F2 people everywhere, F3 ground/track/rock, F4 cloth/age/bugs launched (briefs in
  real-briefs.md "Final fix round"). Then: judge 3 + bug hunter 3 → final report.
* 2026-10-29 01:20 UTC — Merged W8 s5 (084f5db: Holstein-proportioned cows, 5 breeds, herd spacing fixed, sheep
  fleece locks/dirty belly/knees, tractor bonnet/grille/lamps, lacy umbels; animal cost +337k tris → caps 28/12 @ 40 m
  (re-measure open); golden 0.0, invariants {}). Golden of W6 s2 merge: overview 0.5 / downtown 4.4. Waiting on
  judge 2 + bug hunter 2 → final fix round.
* 2026-10-29 00:13 UTC — Merged W6 s2 (8f826b9: back-yard "floating" door/sills were a camera-inside-lot culling
  artefact — not a bug; wall set (door/step/mat, meter, downpipe + butt, AC, apron) placed from footprints; parasols +
  stall canopies sway with the shared wind ?nosway ?nostallwind; market stock 22 → 73 (stalls rejected their own
  stock); kerb cafés use the bistro set). Golden of this merge running (shots/golden/w6). W6 paused for judge 2.
  Running: W8 (needs respawn), judge 2, bug hunter 2.
* 2026-10-29 00:04 UTC — Merged W8 s1–4 (8fe65bf: near-LOD sheep/cows animals.ts ?noanimaldetail, real tractor
  + cultivator + tracks ?notractordetail (field moved to ~230 m), farmsteads farmstead.ts ?nofarmdetail, flower heads
  by species ?noflowerdetail; lead golden check: overview 0.5 / downtown 3.1 / oldtown 3.8 / harbor 1.8 (boat forms) / westbrook 5.6 (garages), console clean, invariants {}) and W1 s6 (c72dfe1: apartment glass
  root cause = flat opposite-row band in bhOpp → shop fronts/awnings/cars, 29 % bare rooms; office blinds/notices,
  curtain-wall mullions/spandrels, framed fascias + swan-neck lamps). Judge 2 + bug hunter 2 launched on the merged
  tree. Running: W6(2), W8 (stopped at 320k → respawn after judge), judge 2, bug hunter 2.
* 2026-10-28 23:32 UTC — Merged W7 s2 (21e8f3d: rounded/raked deckhouses + flared bows + glass, sagging mooring ropes
  with spliced eyes, varied/worn fish boxes + wet patches, site pipes/rebar/pallets/mud/tyre tracks, tactile blisters,
  canopy soffit; noquaylife −172k tris). W7 brief done (open: platform people need benches on the ped graph).
  Next: when W1(6) and W6(2) report → judge 2 + bug hunter 2 over the whole merged tree, then a final fix round.
  Running: W1(6), W6(2), W8.
* 2026-10-28 23:20 UTC — Merged W2 s6 (da7a583: train window gaskets/recess, livery doors + green button, lettering
  atlas ?notraindecals, roof kit, dirt/rain streaks, cab wipers/rails/steps; car paint F0 0.09 → dark reflections on
  white; novehlod0 cost within noise). W2 brief done (open: cab windscreen plain, lamp boxes flat, loco unlettered).
  W8 countryside + small nature spawned (sheep/cows/tractor/flowers/farms). W6(2) traced the floating beige back-yard
  planks to buildings-sills instances (W1 winGeo) — await its note. Running: W1(6), W6(2), W7(2), W8.
* 2026-10-28 23:00 UTC — Merged W7 s1 (bc46ee6: boat plating/welds/rust/fittings ?noboatdetail, new fish quay
  harbor/quay.ts with moored crabber + dinghy ?noquaylife, building site kit ?nositedetail, platform kit; golden
  overview 0.03). W7(2) spawned: boat form, rope sag, quay wear, site, platform canopy/people, perf.
* 2026-10-28 22:58 UTC — Merged W4 s6 (a5d6417: the crouch was a real bug — after a time scrub non-joggers caught up
  at 2.1–2.8 m/s in the jog gait; gait.ts now poses only joggers above 1.9 m/s (scripts/ped-crouch.mjs); trouser
  folds ?nofolds; hair locks all round; separated fingers, hands out of the shadow proxy (dot-grid acne); children on
  chairs). W4 brief done. W1(6) spawned in its slot: apartment glass, facade repetition, old-town render, tower
  curtain wall, shop fascias. Running: W1(6), W2(6), W6(2), W7. Next: when W6/W7/W2 finish → judge 2 + bug hunter 2.
* 2026-10-28 22:29 UTC — Merged W2 s5 (c0cdb24: train bench poses, saloon interior ?notraininterior, turned wheels,
  conformal police band, curvature-bent street reflection in car paint). W2(6) spawned: train body realism (window
  seals, plug doors, livery/lettering, grime, roof kit, cab), Fresnel on pale paint, perf re-measure.
  .gitattributes: real-requests.md merges as union (it conflicted on every merge).
* 2026-10-28 22:25 UTC — Merged W6 s1 (9dcad08: props/places.ts market life + bunting + pigeons, terrace bistro
  chairs/waiter station, back yard + animated laundry; ?nomarketlife ?noterracelife ?nobackyard; W3 leftovers OK).
  W6(2) spawned: back-yard floating door/planks (bug if default), wall-mounted set, parasol/awning wind sway, market
  density, perf. Running: W2(5), W4(6), W6(2), W7.
* 2026-10-28 22:30 UTC — Lawn rim FIXED at the source by W1 s5 addendum (2936151: shell walls start 10 cm below
  ground → no shadow-map gap; rim gone at the bench apartment 3 m). Lead's sdbias probe dropped (sky.ts unchanged).
  W1 lineage paused (open: apartment glass uniform grey → next judge decides).
* 2026-10-28 22:20 UTC — Merged W1 s5 (7c4d9eb: slant-crown grid bug 4 fixed, stronger reveal shadow + glass mask,
  sectional door in relief; apartment glass still open). Lawn rim: normalBias rejected by W1; next suspect the depth
  bias (peter-panning) — lead added `?sdbias=<mult>` (sky.ts tune.dbias) and is probing 1 / 0.15 / 0 at apartment +
  house 3 m (shots/lead/bias_*). W7 dense places II launched in W1's slot. Running: W2(5), W4(6), W6, W7.
* 2026-10-28 22:16 UTC — Merged W4 s5 (4148b82: lidded off-white eyes, anisotropic hair sheen + tapered locks,
  face-edge fade, fabric relief (rib/jersey/twill), pockets/placket/buttons, idle weight shift). W4(6) spawned: the
  "deep jog crouch" seen in a group (possible live bug — root-cause first), trouser folds, hair from behind, hands,
  seated people. W7 still waiting for a slot.
* 2026-10-28 22:00 UTC — Merged W3 s4 (f80a675: bus-stop flag/timetable/posters, newsstand fascia + covers, stall
  goods no-repeat, market heap jitter + scale + backdrop folds + clutter, kiosk hatch + interior, playground tiles,
  contact grime ×1.8; console clean, invariants {}). W4 vendor fix merged (2749347). W3 brief done → wave 3 starts:
  W6 dense places I (market/terrace/back yard + wind mechanics; also W3 leftovers) launched. W7 (quay+boats, site,
  platform) waits for the next free slot. Running: W1(5), W2(5), W4(5), W6.
* 2026-10-28 21:36 UTC — Merged W4 s4 (108bd6a: rounded jaw/cheeks/nose/lips in form, 40-side hair cap with whorl
  strands, long hair/ponytail/bun/fringe, gait by build/sex, crowd variety, forearm stripes fixed). W4(5) spawned:
  glowing sclera, plaster long hair, face-edge line, fabric micro-texture, idle people.
* 2026-10-28 21:32 UTC — Merged W5 s2 (8cc4ea6: near-cell detail lamps/nearCells.ts ?nonearcut, W5 now ≈ +60k tris
  / +7 draw calls (re-measure pending); utility lid decal redrawn; kerb units ?nokerbdetail; STOP plate rim + street
  blades + signal back plates; worn tree patches in groundcover). Lawn rim root cause = shadow leak (shell starts at
  y 0, lawn at −0.04 → 4 cm gap in the shadow map; normalBias texel*1.1) → W1(5) extends walls below ground. W5 brief
  done (leftovers → next judge). W3(4) furniture fix round launched in its slot. Running: W1(5), W2(5), W3(4), W4(4).
* 2026-10-28 21:26 UTC — Merged W1 s4 (c9f9035: garage doors face the street, hotel flags, frame AO/reveal returns,
  per-pane glass, louvred shutters, scalloped awnings, roller shutters, box cladding, school + church portal, tower
  entrance). Lead-verified: bench docs/progress/real/w1_s4_lead.jpg, golden overview 0.3 / westbrook 5.3 (garages),
  invariants {}, console clean. W1(5) spawned: tower-crown speckle, reveal shadow, lawn-rim probe, apartment glass,
  roller door relief. Running: W1(5), W2(5), W4(4), W5(2). Waiting for a slot: W3(4) furniture fix round.
* 2026-10-28 21:12 UTC — Merged W2 s4 (1db2f0e: SUV rails, two-layer paint + fleet palette ?nocarpaint, estate/MPV
  parked bodies, mirror stalks, sill/tyre dust, bus AC packs + hatches, pallet loads; trains coded, unjudged
  ?notraingrime). W2(5) spawned: trains (framing + judgment), police livery, paint reflection, perf.
* 2026-10-28 20:44 UTC — Bug hunter 1 merged (docs/progress/real-bugs-1.md, ~230 views: HIGH vendors dressed as
  workers → W4(4); garage doors side-on to driveways, tower-crown speckle, hotel flags → W1; SUV roof rails → W2;
  bus-stop flag reads No Entry, blank ads/timetable, newsstand placeholder sign, duplicate HONEY stalls → W3 fix).
  Fix round launched: W1(4) facades, W2(4) vehicles + trains. W3(4) furniture fix waits for a free slot (after W5(2)).
  Running: W1(4), W2(4), W4(4), W5(2).
* 2026-10-28 20:42 UTC — Merged W4 s3 (bf2b7f2: speed spikes fixed at the source in rail.ts placeOnRail — smoothed
  tangent + slot clamp, scripts/ped-velocity.mjs; hairline ?nohairline; dress notch; umbrella/cup/briefcase/bag).
  W4(4) spawned: head form, hair volume, walk weight, crowd variation, arm banding.
* 2026-10-28 20:10 UTC — Merged W5 s1 (003e799: bark/soil trunk foot, tree grates/guards/verge pits, lamp posts,
  kerb joints, legible manholes, picket fences + gates, brick walls, hedge foot, sign/signal fixings; ?notreebase
  ?nolampdetail ?nofencedetail ?nosigndetail; +214k tris eye level). W5(2) spawned: cost per toggle, dark patch
  at the gate, kerb units, sign plates, the lawn/wall bright rim. Running: W4(3), W5(2), bug hunter.
* 2026-10-28 20:00 UTC — Judge 1 merged (docs/progress/real-judge-1.md: only bench/bike rack "real"; repetition is
  now the main tell; school/church/industrial doors/newsstand/kiosk/playground "not yet"; lawn/wall bright rim;
  car paint/flat sides; bus roof pillows). Lead fixed the drift motes (backlit only; verified shots/lead/motes).
  W4 m1+s2 merged (c294282: squat = crowd speed spikes 8.8 m/s, gait capped; skirts, hats, eyes). W4(3) spawned
  (root-cause the speed spikes in the crowd sim, hairline, carried things). Waiting: bug hunter, W5.
* 2026-10-28 19:20 UTC — W4 m1 (4214304: close LOD < 15 m with sculpted faces, fingers, seams, laces; ?nopeopledetail,
  ?pedlod=close) NOT merged: after sheets show frog-squat/bow-legged close-LOD stances, split skirts, hats over the
  eyes — W4(2) spawned to rule out/fix these first. Briefs: workers must measure their context (get_session).
* 2026-10-28 18:37 UTC — Merged W2 m3 (adcbf66: van/lorry lofted cabs + cargo bodies, bus rear, car flank, parked
  hash). Wave 1 complete → fresh judge + fresh bug hunter launched on the merged tree. When both report: one fix
  round per owner (W1(4), W2(4) incl. trains, W3(4)) with the judge's notes + the bugs, then wave 3.
* 2026-10-28 18:35 UTC — Merged W1 m3 (6c49c11: albedo>1 root cause = stacked multipliers on pale walls → soft
  headroom; precast panels + joints, render sand/mottle, rivulets, splash zone; window street reflections
  ?nowinrefl; office mullions/spandrels, clad columns ?nocolumndetail; porch). W1 paused pending the wave-1 judge.
  W5 street (trees/kerbs/fences/signs/lamps) spawned in its slot. Running: W2(3), W4, W5. Next: when W2(3) reports,
  run the wave-1 judge (fresh session, all notes at once) over facades + vehicles + furniture.
* 2026-10-28 18:15 UTC — Merged W3(3) (6273dd3: sculpted bronze statue (landmarks/sculpt.ts), draped market cloth +
  goods variety, turned columns, trailing planter plants, bench fixings, phone-box interior). W3 brief essentially
  done → W3 slot goes to wave 2: W4 people (brief W4 in real-briefs.md). W3 remaining polish (scales, queue) folds
  into the wave-1 judge's notes.
* 2026-10-28 17:55 UTC — Merged W2 m2 (942cf5e: car nose/tail loft, wrap bumper, mirrors, gaps; busBody.ts).
  Respawned W2(3): van/lorry cabs + cargo bodies, bus rear, car tumblehome, variation, then trains.
* 2026-10-28 17:30 UTC — Merged W3(2) (992ef14: invariants 0, contact grime props/contact.ts ?nocontact, planter,
  newsstand, bin, market cloth/crates, flagpole, gazebo planks, statue, EPDM). Respawned W3(3): statue figure,
  market variety + cloth, columns, planter plants, bench framing bug.
* 2026-10-28 17:26 UTC — Merged W1 m2 (ad780c1: specks clamped, near-LOD sill/surround geometry winGeo.ts, render
  cracks/string courses, curtains, porch). Respawned W1(3): find the albedo>1 root cause, make wall texture visible
  at 3 m, glass, office upper floors/columns. W2(2), W3(2) running.
* 2026-10-28 17:20 UTC — Merged tree (W1 m1 + W2 m1 + W3 s1) checked: golden diffs overview 0.1 / downtown 0.8 /
  harbor 0.5 / oldtown 1.9 / westbrook 1.8 — only window detail and eave/gutter lines change, overview intact
  (shots/golden/m1/diff.png); console clean; only invariant = the W3 statue plinth (sent to W3(2)).
* 2026-10-28 16:47 UTC — Merged W2 milestone 1 (d420fe9; bench conflict: LOS + --yaw/--pitch + --yaws) and W1's
  final log (64bb54f). Respawned W2(2) (verdict: car body FORM still blocky → loft rework first; mirrors, handles,
  visible gaps, bus ends, grime; then trains). All three wave-1 workers now on session 2. Golden + invariant
  check of the merged tree pending (shots/golden/w1, then rerun after W2 merge).
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
| W2 vehicles (2) | session_01XuhAMhDfBCdfsCA6CmBeaq | claude/real-w2-vehicles | real-w2.md |
| W1 facades (3) | session_01XuhAMcx7gK1B9gZ9EGE9xQ | claude/real-w1-facades | real-w1.md |
| W3 furniture (3) | session_01XuhAMeApwGfPUjpqKr3AnB | claude/real-w3-furniture | real-w3.md |
| W2 vehicles (3) | session_01XuhAMe5xExG1WawepdoR9X | claude/real-w2-vehicles | real-w2.md |
| W4 people (wave 2) | session_01XuhAMeyte9jJ7Urx2TCj88 | claude/real-w4-people | real-w4.md |
| W5 street (wave 2) | session_01XuhAMfn7zBT6TiYEhJcwgB | claude/real-w5-street | real-w5.md |
| Judge wave 1 | session_01XuhAMgGczMy7sfzCU6RcAu | claude/real-judge-1 | real-judge-1.md |
| Bug hunter wave 1 | session_01XuhAMcksFRcEEAyiC8Nzad | claude/real-bugs-1 | real-bugs-1.md |
| W4 people (2) | session_01XuhAMgJdXw8Zhx235CcTVt | claude/real-w4-people | real-w4.md |
| W4 people (3) | session_01XuhAMdkF4v6CvZSXJCtb2b | claude/real-w4-people | real-w4.md |
| W5 street (2) | session_01XuhAMfzqigKeecGnEpbAX9 | claude/real-w5-street | real-w5.md |
| W4 people (4) | session_01XuhAMfbva5MB3tKtm4gmaJ | claude/real-w4-people | real-w4.md |
| W1 facades (4) fix | session_01XuhAMdcvHbn3H1SbqTowe7 | claude/real-w1-facades | real-w1.md |
| W2 vehicles (4) fix+trains | session_01XuhAMcn3h3epGYAH3YGANo | claude/real-w2-vehicles | real-w2.md |
| W2 vehicles (5) trains | session_01XuhAMgyB2W9jUZxdx3Xczd | claude/real-w2-vehicles | real-w2.md |
| W1 facades (5) | session_01XuhAMfq46wtUdASmLq8DJE | claude/real-w1-facades | real-w1.md |
| W3 furniture (4) fix | session_01XuhAMd9YGYmQMvVwVAtFgj | claude/real-w3-furniture | real-w3.md |
| W4 people (5) | session_01XuhAMdn2ycTg2UuHNd4iQo | claude/real-w4-people | real-w4.md |
| W6 dense places I (wave 3) | session_01XuhAMghDM8g45i46Lja4QH | claude/real-w6-places | real-w6.md |
| W4 people (6) | session_01XuhAMghSjS3RWFqyHibd7f | claude/real-w4-people | real-w4.md |
| W7 dense places II (wave 3) | session_01XuhAMe8MqhfeVaXdzcfB9U | claude/real-w7-quay | real-w7.md |
| W6 dense places I (2) | session_01XuhAMdo2WChq7WcNcuJPxV | claude/real-w6-places | real-w6.md |
| W2 vehicles (6) trains | session_01XuhAMhTqxMzNfQqVnLRdFs | claude/real-w2-vehicles | real-w2.md |
| W1 facades (6) | session_01XuhAMevUWbiYT7AVmkzbyB | claude/real-w1-facades | real-w1.md |
| W7 dense places II (2) | session_01XuhAMgnc3LjfR6ehMUGwBc | claude/real-w7-quay | real-w7.md |
| W8 countryside (wave 3) | session_01XuhAMgEAANGwU4gDyorawb | claude/real-w8-country | real-w8.md |
| Judge 2 | session_01XuhAMhWPFfC36vewCePr9j | claude/real-judge-2 | real-judge-2.md |
| Bug hunter 2 | session_01XuhAMerLUHGUUS7BTCdeQe | claude/real-bugs-2 | real-bugs-2.md |
| W8 countryside (2) | session_01XuhAMfNhLR1sNFxZPZJ7Yq | claude/real-w8-country | real-w8.md |
| F1 facades final | session_01XuhAMdr8nYgjcxQjFGE8r6 | claude/real-f1-facades | real-w1.md (F1 section) |
| F2 people everywhere | session_01XuhAMdWkDieoT1KiyUQATj | claude/real-f2-people | real-f2.md |
| F3 ground/track/rock | session_01XuhAMh42VLib5eEhrkwmHb | claude/real-f3-ground | real-f3.md |
| F4 cloth/age/bugs | session_01XuhAMeuCcFFs8EDE6dvZYc | claude/real-f4-cloth | real-f4.md |
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
