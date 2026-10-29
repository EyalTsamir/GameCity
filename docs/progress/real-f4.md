# F4 — Cloth, age and the small bugs (final fix round)

Branch `claude/real-f4-cloth` (from `claude/pensive-gates-bim12i` @ e1c9780). Brief: docs/progress/real-briefs.md "F4".
Owned: src/world/props/**, life/**, harbor/** + boats/** (except figure()), landscape/farmstead.ts + farmlife.ts,
sim/rail/station.ts.

## Resume here
* Session 1 WIP (code written, judging in progress — shots/f4/b1 = first batch, mostly pre-change code).
  Written: all bugs 2–6, 8, 9; cloth (awning, laundry drape + pegs, bunting); sailboat cabin/cockpit/rails + sail
  seams/battens; tractor see-through cab + interior; forklift rebuilt; painted-metal age; night-market shroud.
  Not yet: back yard as a place; quay apron stains; site mud/ruts (construction.ts); newsstand font/titles.

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

## Tried and rejected

## Toggles / tiers / costs
* `?nonightmarket` (off on low). Others ride existing toggles (`?nostallwind` keeps the cloth static).

## Code pointers (learned this session)
