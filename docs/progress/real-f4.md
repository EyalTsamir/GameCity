# F4 — Cloth, age and the small bugs (final fix round)

Branch `claude/real-f4-cloth` (from `claude/pensive-gates-bim12i` @ e1c9780). Brief: docs/progress/real-briefs.md "F4".
Owned: src/world/props/**, life/**, harbor/** + boats/** (except figure()), landscape/farmstead.ts + farmlife.ts,
sim/rail/station.ts.

## Resume here
* 2026-10-29 s2 (session 2) — merged pensive-gates (harness pump fix). Re-captured: newsstand 3 m / 10 m and phone
  box 3 m render fine now (shots/f4/s2b1, s2b2). Fixed: newsstand pixel mastheads → printed covers
  (props/print.ts canvas atlas, one issue per title, `?noprint`), kiosk fascia + phone-box "TELEPHONE" printed (lit
  at night via aGlow·uLights); phone-box glass tint #c3d3da → #4d5a60 (two light panes read as milk glass; phone now
  visible). Poplar floating clumps (bug 2b): cause = leaf cards squashed in y by KIND_ASPECT 0.35 → top masses only
  ±0.02 tall at a 0.075 step; step now 1.5·0.35·r (11 masses). Back yard eye level (shots/f4/s2/yard1.png) reads.
  Captures here are slow (~2–3 min each incl. pumps; page load ~100 s): keep batches ≤ 3 captures.
  Not mine: the parked e-moped next to the phone box (sim/traffic models) still reads as boxes.
* s2 later — judged: forklift 6 m (s2c1/fk_11) real; poplar fs1 (s2c2/fs1_11) continuous column after a 2nd pass (tip
  masses ≥ 0.055, step 1.25·0.35·r, 9 masses — the 1st pass still left loose dots up the spire); back yard from above
  (s2c2/yh_11): fence, shed, lines, pots read; the "floating planks" there were buildings-trim with the camera inside
  a building (ray-picked with shots/f4/pick.mjs — handy for any "what is that" question). Night market (s2c3): the
  shrouds read as black monoliths with the goods visible through the open backs → lighter weathered tarp set, a
  ridge over the middle bow, a back face, warm festoon spill (emissive · uLights, tops 1, faces 0.15–0.7).
* 2026-10-29 03:55 — **Session 1 ends (context cap).** All pushed. Console clean, invariants {} (shots/f4/b4/report.json:
  by_shed 1, by_fence 16 panels; cloth 113k tris; 163 draws in the b4 overview session). Overview unchanged
  (shots/f4/b4/overview_11.png).
  **Next (session 2), in order:** (1) judge the back yard at eye level (shed, fence, pots, sandpit, ball, kid's bike —
  views ending inside geometry are a harness/camera problem, below); (2) night market at 21.5 h (mkn frame came out
  blank); (3) forklift + sailboat cabin/rails at 3/10 m (bench boat 10 m and fk views were blank); (4) quay oil stains
  after toning; (5) site mud/ruts at eye level; (6) perf.mjs `;nonightmarket` and cloth before/after;
  (7) poplar floating clumps (bug 2b) — try `?nodrift`, `?landtrees=0`; (8) phone box / newsstand age at 3 m.
  **Harness problem (for the lead):** ~half of capture-set / bench views come out as one flat colour with a fine dot
  pattern (b1 fq1 before most F4 code loaded; b2 by1/by2/mk1/fk; b3 ye/mk/fk; bench newsstand 3 m, phonebox 3 m,
  boat 10 m; b4 yt + mkn although the same yt view worked in b3). Not framing in the usual sense (yt is 26 m up at
  pitch 70). **Cause (lead, 03:30):** pumpFrames' 8×8 clipped screenshots make Chromium tile an 8×8 patch over the
  capture. Local fix before capturing: remove `, clip: { x: 0, y: 0, width: 8, height: 8 }` from the pump screenshot in
  scripts/bench.mjs, capture-set.mjs, shot.mjs (not committed here — the lead owns the harness). All blank F4 frames
  are this artefact, not faults: re-capture them.
## Done
* Bug 2 (tree through barn roof): settlements.ts now returns `blocked(x,z,r)` (building rects + 1 m, barns + 6 m
  for the silo, incl. the near-farm buildings spliced out for farmstead.ts); trees.ts Builder skips a tree whose
  crown disc (w·0.35) touches one; landscape.ts passes it to placeTrees. Poplar crown 7 → 9 overlapping masses.
* Bug 3 (barn roof moiré): farmstead.ts corrugation `sf == 2` fades the 76 mm waves by their own phase change per
  pixel (`fwidth(u)·82.7`) and the laps by theirs.
* Bug 4: SK.bikeRow bikeLite tyres were open cylinder bands, invisible side-on → 10-segment tube rings + 3 spoke
  bars (kit.ts). furniture.ts bikeRack: bikes on the end hoops shifted in (×0.6), hoop patterns so two bikes never
  share a side.
* Bug 5: quay.ts creel(…, lift): a stacked pot's tail drops down the stack side to the ground; inner stacked pots
  have no tail (lift −1); only the outer column (col 0, tails point −z) keeps them.
* Bug 6: places.ts washing line: searches offsets (dist from wall × shift along it) whose segment clears every
  `services.vegetation.trees` crown by r + 0.6 m.
* Bug 8: farmlife.ts selection moved from herd.onBeforeRender to `FarmLife.select(camera)`, called from
  landscape.ts frame() (snap views set the camera immediately via flyTo(…,0) → applyCamera).
* Bug 9: station.ts columns are at cx0 + k·8.8 (−22…22) — the boards/clock were ON columns. Name boards ±17.6,
  departure board −8.8, clock 0 (mid-bay); speakers moved onto the ±13.2 columns.
* Cloth: market awning (civic.ts genMarketStall) 16×6 grid sagging into two bays either side of a new middle bow,
  drooping overhang, corner tension folds, per-stall slack; valance follows the hem droop + ripple, stitched binding.
  Laundry (life/cloth.ts + glsl.ts): PieceOpts.drape → aCol2.w; vertical folds deepening to the hem, top sag between
  pegs, hem gathered; pegs = SHAPE.PEG pieces (2, sheets 3) auto-added; cloth grid 4×4 → 8×5. Market bunting:
  uneven spacing/size/weight, flutter 1.3–1.8.
* Sailboat (boats/models.ts sailboat()): coachroof with raked front + sloped sides, 3 portlights a side, teak grab
  rails, sliding hatch, washboards, sprayhood, cockpit coamings with teak capping, seats, grating, tiller, winches,
  stanchions + 2 lifelines, pulpit/pushpit, cleats, anchor, halyards. Sails (material.ts boatSurface top): seams,
  laps, tapes, corner patches, 4 batten pockets, insignia (main), telltales (jib), crinkle.
* Tractor (tractor.ts): glass to its own transparent mesh (+1 draw when on screen), seat with headrest/armrests,
  dash + binnacle, right console with levers. Driver: waits for F2's seated figure.
* Forklift (quay.ts): extruded side-profile body, LPG bottle, real seat, wheel + spinner, levers, raked guard, channel
  mast with chains, tilt rams, backrest, tapered forks, cushion tyres on rims, lamps.
* Age: props material.ts painted metal (mtl 0.15–0.3): UV chalking, more chips (primer / metal / rust) with lifted
  rims, rust bleed, dust on tops, heavier foot grime. (cache key props-furniture-6)
* Night market: life/nightmarket.ts tarp shroud over every market stall from 19:45 to 6:45 (`?nonightmarket`, off low).

## Judged (shots/f4/b3, bench1)
* Tractor 3 m: cab glass now see-through — seat + headrest, wheel, levers, dash visible (bench1/tractor_3m.png). Real-ish.
* Sail 3 m: seams, laps, telltale, tapes read (bench1/boat_3m.png). boat 10 m = camera inside geometry (framing).
* Market awning close (b3/mkc): sags into two bays either side of the bow, folds; reads as canvas.
* Quay mid-apron (b3/qy): oil stains were black splats → toned (#4e4c46, softer scale); recheck.
* Barn roof fs3: moiré gone; rust now streaks along the fall line.
* Back yard top (b3/yt): line clear of the trees, patio by the door; fence/shed/pots not visible → shed search
  widened (grid of spots, clear of tree trunks), counters `by_shed`, `by_fence` in props stats.

## Tried and rejected
* Bench / capture views that end inside geometry (newsstand 3 m, phonebox 3 m, boat 10 m, mk1, by1, fk, fq1): framing,
  not faults (seen in b1 before most F4 code loaded) — use high-pitch views (yt, mkc, qy patterns).
* Poplar "floating clumps" (bug 2b): more crown masses (7 → 9) did not change it; the bits at fs1 are not the crown
  spacing — next suspect: impostor/near swap or drift leaves (`?nodrift`).

## Toggles / tiers / costs
* Cloth cost: pieces 2207 (incl. ~1000 pegs). Before F4 one 4×4 mesh ≈ 70k tris; single 8×5 mesh was 188k →
  split into plain 4×4 + draped 8×5 (+1 draw, +1 shadow draw) ≈ 50k + 52k.
* Market stall canopy 8×4 → 16×6 + hem: ≈ +0.45k tris/stall (20 stalls ≈ +9k).
* Rack bikes (bikeLite) tube tyres: +~160 tris per bike.
* `?nonightmarket` (off on low). Others ride existing toggles (`?nostallwind` keeps the cloth static).
* s2 costs (counted, not timed — perf.mjs on this SwiftShader box gives 1–2 frames per variant, no signal):
  night market ≈ 1.05k tris/stall (top 120, 4 faces ≈ 920) × stalls in the square, 1 draw + 1 shadow draw, night
  only. props-print: 2 tris per cover/sign (≈ 75 covers per newsstand), +1 draw within the near gate, one 1024²
  canvas texture (≈ 5.3 MB with mips) — `?noprint` / low tier = old pixel boxes. Poplar: 9 masses as before (card
  count unchanged within ±10 %). Measure on the target with `perf.mjs --variants ";noprint;nonightmarket;nocloth"`.

## Code pointers (learned this session)

## tokens.py (s1)
TOTAL weighted 6.1M  (cache read 84%, cache write 7%, output 10%)
agent               calls   w(M)    %  ctxMed  ctxMax cold coldW%  idle>5min: warm/cold
