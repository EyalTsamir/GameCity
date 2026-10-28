# W7 — Dense real places II: harbour quay + boats, building site, station platform

Session session_01XuhAMe8MqhfeVaXdzcfB9U, branch `claude/real-w7-quay` (from claude/pensive-gates-bim12i @ 8a2f18e).
Owned: src/world/harbor/** + harbor.ts, src/sim/boats/** + boats.ts, src/world/landmarks/construction.ts,
src/sim/rail/station.ts + staticMaterial.ts. Order: boats → quay → site → platform.

## Resume here
* s1 started: log skeleton. Next: baseline captures of boats / quay / site / platform.

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
* site: plan.ts genMidtown east half (lot 'construction', footprint inset 4/5/3/12 m, towercrane feature).

## Done

## Tried and rejected

## Toggles / tiers / costs

## Sheets
