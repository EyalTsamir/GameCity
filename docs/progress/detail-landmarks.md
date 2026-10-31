# Detail round: landmarks and harbour (port 5202)

Branch `claude/detail-landmarks-28de6d`. Shared rules: `DETAIL-ROUND.md`. Switches: `src/core/lmdetail.ts` (`?nolmdetail` = all off,
`?no<name>` one family).

## Resume here
Rounds 1 to 5 are committed (2cbd27c the lighthouse, the commit after it the tower lift). Each round from a fresh look at eye level:
1. hero interiors (church, Town Hall, station); 2. the working quay lit at night, the ship's house, the breakwater as a walk; 3. rock skin on the armour stones, the ship's
name and marks, the lighthouse floodlit, the tractor up close; 4. up the lighthouse on foot; 5. up the Skyline Tower by lift.
Candidates left, in order of wow per ms: the stadium from the stands (no way in yet), a café interior, station platform door panels, the pier's ferris wheel as a ride, the
film in real time. Dev server: `npx vite --port 5202 --strictPort --host 127.0.0.1`.
Scratch tools (session scratchpad, may be gone): `ev.mjs` (named eye to look captures through the shared browser lock), `walk2.mjs` (real keys in walk mode),
`walk3.mjs` / `walk4.mjs` (the lighthouse climb and the lift, with real mouse drags to look round), `sheet.py`, `shoot.sh`. Run captures in the background: the browser queue is
shared by six sessions and a run can wait more than 10 minutes.

State:
- DONE, seen by eye (`shots/dl/c2`): room engine `landmarks/rooms.ts`, St Mary's room `landmarks/churchRoom.ts` (`?noherochurch`), walker
  hook in `ui/camera/walkSurface.ts` (`ctx.services.rooms`: 2 small additive checks).
- DONE, seen by eye (`shots/dl/c3`): church apse, doors, triptych, shafts. The organ faced the wrong way (pipes behind its own panel): turned round.
- DONE, seen by eye (`shots/dl/t1`): Town Hall hall `landmarks/townhallRoom.ts` (`?noherotownhall`): marble hall, imperial stair, galleries,
  stained laylight, wings with portraits, the city as a table model, enquiries counter, reception room, the balcony over the fountain.
  Floors by level: `Room.core` + `Rooms.feet` (one line each in `firstPerson.ts`: enter and before moving).
- DONE, seen by eye (`shots/dl/s2`): station hall `landmarks/stationRoom.ts` (`?noherostation`): street door to platform in a straight line, glass
  vault with the rib shadow on the floor, compass mosaic, booking office, café, departures, people waiting.
- DONE, seen (`shots/dl/x3`): `?noquaylife2` container quay clutter (`harbor/quayLife.ts`), `?nohorses` galloper horses + canopy bulbs, `?nobandroof`
  bandstand roof; always on: real-size bricks (25 × 9.5 cm, `shaders.ts`), hazard bands on the crane legs (`?nocranekit`), lifeguard rails, shutters, lifebuoy (`?nobeachkit`).
- Real-key walks (`walk2.mjs`): church door → altar rail; town hall square → stair → gallery → balcony and back; station street → hall → platform.
- Round 1 checks done, see Results. Not done: a café interior, breakwater armour stones (blocky at eye level), richer tractor cab.

## The room engine
Near-only mesh per room (`Room.near`, nothing drawn in wide views), own ShaderMaterial, same surface patterns plus `RP.*` (flags, encaustic,
stars, plaster + stencil, oak, glass, pictures from the room atlas, flames, marble, parquet, mosaic, brass).
- Sky and lamps baked per vertex at boot (`aBake`): subdivide with `Room.grid` / `Room.wall`, or the bake has nothing to hold.
- Sun per fragment: `glassAlong` intersects the ray to the sun with the window plane (x = ±X, periodic in z) and reads the pane from the
  atlas, so a stained window throws its own picture; the mirror ray reflects the panes in polished floors. `uRoof` = glass roof plane.
- Shafts: additive sheets swept along the sun (`addShafts`); motes light up only inside the sun; halos also show by day.
- Winding: `Room.wall/grid` default normal is e_u × e_v. A lining facing the wrong way is culled and the old stone wall shows behind it:
  that was the "dark blocky wall" in the first captures. `splay` orients itself.
- The lining must sit in front of the outer walls' inner lids; on non-axis faces offset along the normal (`offsetApse`), not radially.

## Plan for the rest of the round (ranked)
1. Town hall: remove the core boxes on the ground floor; atrium over the centre (|x| < 5.6) to a stained laylight (`uRoof`), imperial stair,
   galleries, the reception room behind the balcony, centre French window open onto the balcony over the square (the destination at golden
   hour); chequered marble mirroring the laylight; a table model of the city built from `plan.lots`. Needs floors by level: give the walker a
   feet hint (`Rooms.height/solid(x, z, feet)`, one line in `firstPerson.ts`). The sun is always on the +z side here: paint the whole front
   wall as one mask cell, swap axes in `glassAlong` (`uWinSwap`).
2. Station booking hall: walk in from the forecourt, across, out to the platform; glass vault ribs on the floor through `uRoof`.
3. A few seated figures in the nave, near-only.
4. Exteriors and harbour (not started): bandstand, lifeguard tower, harbour stairs slot (geometry-hunt #8 says fixed: check), film shots.

## Results (2026-10-31, high, 1920x1025, on AC, power guard clean)
| view | ms, this branch | ms, `?nolmdetail` | delta | triangles delta |
|---|---|---|---|---|
| overview | 35.77 | 35.45 | +0.32 | +124 k |
| downtown | 35.31 | 34.95 | +0.36 | +71 k |
| street | 33.18 | 32.83 | +0.35 | +22 k |
| market | 32.85 | 32.94 | -0.09 | +52 k |

Second repeat of each pair; the first baseline row of a run is cold (fewer triangles uploaded, 1-2 ms noisier), so it is not used. Budget: +1 ms, +250 k. Inside the station
hall: 31.7 ms, 305 draws, 5.87 M triangles in that view (room plus the city behind it; the room's own share was not isolated).
`hitch.mjs`: prog+0 geo+0 tex+0 in every window (it flies the overview only); moving from far away into each room and the pier: `renderer.info.programs` stays at 150, so nothing compiles on entry. `shot --invariants --validate`: {} and []. ui-test: 71 passed, 0 failed. `npm run build` fine. `?diorama`, `?quality=medium` (all rooms
on), `?quality=low` (rooms off, old exteriors) seen. Opening film sheet seen (`--mode seek` only, not real time); no shot goes through a changed room.
Sheets: `docs/progress/detail/landmarks/heroes.jpg`, `before-after.jpg`.

## Lighthouse (round 4, `?nolhroom`)
From the quay's north end a galvanised stair (`harbor/breakwater.ts`) climbs to the walkway, 45 m along the breakwater past the anglers, in at the green door, 85 iron treads in 5.8
turns (`landmarks/lighthouseRoom.ts`), up through the floor of the lantern beside a Fresnel lens, out by the open face onto a gallery widened to 2.5 m. Walked with real keys up
and down, on the outer and the inner line.
The floors are functions of the plan position and the walker's own feet (`Rooms.feet`): a helix has a floor on every turn at the same (x, z); the function takes the turn nearest
the feet and clamps to +-0.6 so the far side of the body counts as the same turn. The lens only stops the body on the top floor, or the last treads trap anyone on the inner line.
The lantern's halo fades as you come up beside it (`material.ts`, mode 6 only).

## Skyline Tower lift (round 5, `?notvlift`)
`landmarks/tvLift.ts`. An open cage on a white lattice mast runs all day on the south side of the tower, so from anywhere in town a lit box climbs it. Step in from the side on the
plaza when the amber gate is down, and the town opens up on the way to the balcony at 103.7 m: the whole town ahead, harbour on the left. 16 s up at 5.5 m/s. On the balcony: coin
telescopes and people looking out; through the doors, a deck round a walnut core, boards naming the view, benches, downlights. Ridden there and back with real keys.
- The cage is in the kinetic mesh (`ANIM.LIFT`, uniform `uLift`): no draw call of its own, shadows included. Gates are the same mode with a drop distance; the landing's stays up top (`b`), the side gate works on the ground only (`c`).
- The walker: the floor is `sticky` while riding (any distance from the feet), and `Rooms.carry` adds the floor's rate to the feet before the spring, or the eye lags 0.5 m at speed.
- `Room.skyFrom`: above that height off the floors is solid; below it the city still answers, so the plaza keeps its own furniture and collisions inside the room's rectangle.
- Timing is a small state machine on real time: someone on board or waiting shortens the wait; someone who arrived on board gets 14 s to step off.
- The balcony went from r 6.6 to r 7.2 (a walker's body is 0.84 wide), so its overhang is excused from the footprint check (`env.endChecks` / `checkLot` round it).
- The glazing has real door openings; through one you see the walnut core (static, drawn from any distance), so no sky shows through from far away.

## Best views
Church nave 18.2 from the door; Town Hall stair from the door at noon, laylight from the gallery, the balcony at 18.2, the table model in the west wing; station from the street
through the open door with a train behind it, compass floor and rib shadows at 11; carousel at 21.5; bandstand at noon; quay lane at 10-12.
Lift: ride at 18.2 looking south and slightly down, at about 40 m and 80 m; again at 21.5 with the quay lit below. Balcony at 18.2, and through the door from the deck with the balloon.
Lighthouse: the gallery at 18.2 looking at the ship and cranes (`gallery_city`, 182.3,19.8,-141.2 to 100,4,-55), the lens at 21.5, the stair from the door at noon; from outside `lh_night` 160,3,-138 to 184,12,-142 at 21.5, and the door at noon.
Harbour: the ship's name on the transom reflected in the water at noon (135,6,-14 to 145,1,-28); container quay under its masts at 21.5.

## Toggles
`?nolmdetail` all; `?noherochurch`, `?noherotownhall`, `?noherostation`, `?noquaylife2`, `?nohorses`, `?nobandroof`. Rounds 2 to 5: `?noshipkit`, `?nobwlife` (also takes the lighthouse room), `?norockskin`, `?nolhroom`, `?notvlift`. Always on: bricks 25 x 9.5 cm (`shaders.ts`, every brick landmark).

## Hand-offs
None to other sessions. In `quayLife.ts` the big pieces are solid for the walker; cones and the manhole are not.

## Edits outside my files
`src/ui/camera/walkSurface.ts`: asks `ctx.services.rooms` first in `heightAt` and `solidAt`.
`src/ui/camera/firstPerson.ts`: tells `ctx.services.rooms.feet` where the feet are (on entering, and before each move); adds `rooms.carry` (the lift's rate) to the feet.
