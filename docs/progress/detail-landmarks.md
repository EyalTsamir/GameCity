# Detail round: landmarks and harbour (port 5202)

Branch `claude/detail-landmarks-28de6d`. Shared rules: `DETAIL-ROUND.md`. Switches: `src/core/lmdetail.ts` (`?nolmdetail` = all off,
`?no<name>` one family).

## Resume here
Round 1 in progress: hero interiors. Dev server: `npx vite --port 5202 --strictPort --host 127.0.0.1`.
Scratch tools (session scratchpad, may be gone): `ev.mjs` (named eye→look captures through the shared browser lock), `walk1.mjs`
(real keys in walk mode), `sheet.py`, `shoot.sh`. Run captures in the background: the browser queue is shared by six sessions and a
run can wait more than 10 minutes.

State:
- DONE, seen by eye (`shots/dl/c2`): room engine `landmarks/rooms.ts`, St Mary's room `landmarks/churchRoom.ts` (`?noherochurch`), walker
  hook in `ui/camera/walkSurface.ts` (`ctx.services.rooms`: 2 small additive checks).
- WRITTEN, NOT YET SEEN: apse lining offset, door leaves swinging inward, organ case rebuilt, triptych redrawn, shaft tuning (capture
  `shots/dl/c3`), and the real walk from the street to the chancel (`walk1.mjs`, `shots/dl/w1`). Check these first.
- Not measured yet: perf, triangles of the room, `hitch.mjs`, ui-test.

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

## Hand-offs
None yet.

## Edits outside my files
`src/ui/camera/walkSurface.ts`: asks `ctx.services.rooms` first in `heightAt` and `solidAt`.
