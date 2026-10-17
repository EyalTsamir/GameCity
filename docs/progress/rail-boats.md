# rail + boats — progress (builder agent, round 2)

State: both modules load; tsc clean for src/sim/rail* and src/sim/boats*.

## Files
- rail: src/sim/rail.ts + src/sim/rail/{geo,profile,staticMaterial,track,station,crossingGear,signs,glows,trainMaterial,trainModels,trains,trainRender}.ts
- boats: src/sim/boats.ts + src/sim/boats/{nav,material,models,fleet,wakes,render}.ts (+ reuses rail/geo.ts, rail/glows.ts)

## Done (rail) — verified visually (shots/rail_08c_x0.png, rail_11_grid.png, rail_13_night_pass.png, rail_14_grid.png, rail_15.png)
- geo.ts: Geo accumulator (pos/normal/color/aKind/aAnim/aExtra, frame stack, box/beam/cyl/rod/sphere/prism/fan/shape, `variant(v)` → aKind += 100·v)
- profile.ts: rail head 0.30, sinks to 0.062 flush at crossings (deck ±3.75 m, ramps 10.5 m)
- track.ts buildTrack(gFlat, gTall, gDeck=gFlat, …): ballast, sleepers, rails, crossing decks, catenary masts/cantilevers + wires (LineSegments), south fence, 4 signals (ids 0 W-home, 1 E-home, 2 W-starter, 3 E-starter), location cases
- station.ts: platform (brick, coping, tactile, stairs x=0, ramps ±33.5..43.5), canopy x≈−23.4..23.4 (dagger valance, strip lights), benches, bins, 6 lamps, GPU clock, sign frames; signs.ts canvas atlas (name boards, platform "1", LED departure board redrawn on change)
- crossingGear.ts: half barriers (booms rotate in shader via aAnim ±1/±2), St Andrew's crosses, alternating lamps, boom lamps; glows follow booms (rail.ts frame)
- staticMaterial.ts: kinds (ballast grain, paving, brick, wood, tactile, lamps, crossing flash, signals, clock); bed mesh uses polygonOffset (−2/−6) so decks beat road markings (roads markings use −2/−4)
- trainModels.ts: buildEmu() ONE geometry for cab+middle cars (variant 1 cab nose/wedge, variant 2 middle front/pantograph; aInst2.z=1 → cab), buildLoco(), buildWagon() (40ft / 2×20ft / 1×20ft / empty)
- trainMaterial.ts: livery via instanceColor, wheel rotation, platform-side doors, container ribs, emissive windows/head/tail/dest, tunnel clip (discard outside uClip) also in depth material; tags decoded as aKind % 100
- trains.ts RailSim: service queue (gap 25–45 s, ×1.9 night, freight 22% day / 45% night), jerk-limited kinematics, exact stop (dwell 13.5 s), events train:arrive/depart, crossing FSM (ETA≤14 s → warn 4 s → lower 5 s → down → tail+2 s → raise 4.2 s), hold short of occupied/unclosed crossing, signals, board rows, picker text
  debug URL params: `railkind=regional|freight&railx=<head x>&raildir=1|-1` (default: regional dwelling at the platform)
- trainRender.ts: pools emu/loco/wagon (InstancedMesh), head/tail halos + headlight pool in shared Glows batch
- rail.ts: meshes, glows (hidden by day unless flashing), picker (kind 'train'), service ctx.services.rail = { trains(), sim }, stats, invariants (occupied/open crossing under train, booms not down, stop accuracy, overspeed, >1 train)

## Done (boats) — resumed session
- nav.ts: 1 m NavField (water depth ≥0.9, harbour obstacles from ctx.services.harbor + fireworks barge, slab margin) + chamfer clearance; strict isOpenWater for invariants
- models.ts: lofted hulls (smooth normals, sheer, rake, transom, boot top); big mesh = ferry/tug/tour boat, small mesh = yacht/motorboat/double scull (variant collapse via aKind/100)
- material.ts: tint/accent, sail boom rotation + camber + luffing, jib rotates about the forestay axis, oars sweep/feather, rowers swing, flags wave, emissive windows + nav lamps
- fleet.ts: RoutePilot (paths w/ curvature speed limit, dwell, pivot, reverse, crab yaw), FreePilot (yacht tacking/polar/trim/heel, motorboat planing; helm samples clearance + predicted boats), blockedAhead (+18 s deadlock breaker), capsule gap
- boats.ts: ferry (crab off/on the pontoon berth from ctx.services.harbor.ferryBerth, 12.5 s boarding, bay loop), tug (push bow/stern of the cargo ship, back off), tour boat (z=118.25, pivots at x=-178/110, under footbridges), 2 sculls on a loop x 38..82 (wait for the tour boat before crossing), 4 yachts (2 S sea, 1 N sea, 1 bay), 2 motorboats; poses from water.waveHeight; foam wakes; nav lights; funnel smoke; picker 'boat'; invariants (hull on open water, overlaps, route validation)
- wakes.ts: 1100-puff ring buffer, lacy foam shader riding WAVES_GLSL swell
- verified: shots/boats_01.png (bay), boats_02_ferry.png, boats_06_grid.png, boats_08_grid.png (foam), long 4x run no invariant issues

## Perf (perf.mjs, 1300×930, variants ";skip=rail,boats", 2–3 reps)
- station ≈ 0.55–0.68 ms · harbor ≈ 0.54 ms · overview ≈ 0.25–0.40 ms  (budget 1.0 ms ✓)
- rail: 7 draws (bed+decks, furniture, wires, signs, emu/loco/wagon pools) + shadows; JS ≈ 0.03 ms
- boats: 2 instanced meshes (+shadows), foam (culled when no boat near view), lights (night only); JS ≈ 0.07–0.09 ms

## Next (priority order)
- DONE — final report delivered. Optional future polish: merge sign faces into the furniture mesh (−1 draw), platform passengers (pedestrians module could route walkers up the stairs x=0 / ramps x=±33.5..43.5)
   - nav grid 1 m over water from ctx.services.water.depth (+ shoreDistance) minus obstacles from plan.features (pier rect z 55.5–68.5 x121–190, breakwater z−142 x134–181 w7, lighthouse r3.5 @184,−142, cargo ship x138.5–151.5 z−115..−41, ferrydock rect 136–144 × −18..−10, jetty x91 z121–126, footbridges x −82.5/27.5 (low boats only)), distance transform → clearance
   - zones: ferry loop x152–194 z−36..44 (deep only x>158 for z>5); sailboats S sea x158–196 z72–146 + N sea x140–197 z−186..−148; tug basin x152–196 z−138..−44 around ship; motorboats S sea / basin; river tour boat z≈118 x −185..108 (pivot turns), 2 rowing shells near jetty x60–110 z112–116
   - models via Geo (+variant collapse): big = ferry/tug/tourboat, small = sailboat hull/motorboat/rowing; sails separate instanced mesh (heel, sheet angle, luff flutter in shader)
   - bob/pitch/roll from water.waveHeight at 4 hull points; wakes = instanced foam puffs with birth time (age-based fade in shader, y via WAVES_GLSL from src/world/water/waves.ts × field amp); nav lights via rail/glows.ts Glows
   - picker kind 'boat'; invariants: hull outline on water (plan.isWater + depth), no overlaps
   - optional smoke: ctx.services.smoke (read signature at top of src/sim/ambient.ts; guard absence)
4. Platform passengers (optional), final full-city checks at 12 / 21.5 h, --speed 4 --wait 40000 --invariants

## Late fixes (resumed session)
- tour boat redesigned as an open launch (benches + passengers, striped awning, festoon bulbs), max height < 2 m (seated skipper), beam 3.0
- sculls: lanes z 113.4 / 122.85, half-span 2.72 m; blockedAhead ignores near-parallel boats; 18 s deadlock breaker for higher-priority route boats
- foam: lacy shader, dimmer at night; softer yacht wakes; foam/glow batches culled when no boat is near the view; station sign faces hidden > 260 m
- safety hold verified: forced crossing[0].occupied=1 → regional stops 5 m short (shots/rail_22_hold.png), no invariant

## Known issues / notes
- Full-city views from the SOUTH of the station are blocked by downtown towers (camera slides in along the arm) → use crossing views or side/north views
- Vegetation places conifers 4–6 m north of the track right at catenary masts (request: keep ~5 m clear north of z −158)
- perf runs show 2 console errors from another module (present with skip=rail too)
- At pause time src/world/roads/materials.ts (other agent) had a syntax error

## Verified (resumed session)
- cab close-up rail_17_cab.png; board rail_18_board.png (DEPARTURES list readable); night freight crossing rail_19_xnight_2.png; east portal rail_21_grid.png
- boats: ferry crab-off sequence boats_10_grid.png; open tour boat boats_13_tour.png; night harbour boats_11_night.png / rb_long_night.png; overview rb_overview_day/night.png
- pickers: train ("Regional to Easton Bay", info 3 lines), boats (ferry/yacht/tour/scull) via camera.pickAt
- long runs (--speed 4 --wait 40000, 12 h and 21.5 h, full city): no rail/boats invariant violations, clean console

## Best views
- crossing 0: --view "-110,0,-150,50,20,35"; crossing 1: "55,0,-150,50,-20,35" (+ --speed 2 --shots 4 --interval 2500)
- freight: --q "railkind=freight&railx=-225&raildir=1" --view "-110,0,-150,50,20,35" --hours 15
- night train: --q "railkind=regional&railx=-60&raildir=1" --view "-75,2,-155,45,-25,28" --hours 21.5
- platform close: --q "only=sky,terrain,water,rail,postfx" --view "-30,2,-153,26,-55,14"
- harbour/bay: --view "160,0,-40,150,90,30" (day) / "165,0,-30,120,100,32" --hours 21.5 (night)
- follow a boat: --eval "window.__F='River Lark,22,0,48,210'" --eval "$(cat <scratchpad>/follow.js)" (sets the view every 100 ms)
