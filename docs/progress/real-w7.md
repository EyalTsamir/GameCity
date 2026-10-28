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
* bench: scripts/bench.mjs classes jetty, boat (ray-picked).

## Done

## Tried and rejected

## Toggles / tiers / costs

## Sheets
