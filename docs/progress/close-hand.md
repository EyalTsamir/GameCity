# Close hand: what the eye checks at a door or a wall

Stage 3 of `CLOSE-ROUND.md`. Branch `claude/great-nightingale-12938a`, port 5216. Switches: `src/core/closehand.ts`.

## Resume here
Dev server: `npx vite --port 5216 --strictPort --host 127.0.0.1`. System: `src/world/handheight.ts` (placement by kind of building, layers, materials), `src/world/handheight/{sink,doors,walls,entry,ballast}.ts`. The generators note doors, walls, lamps, pipes and fittings in `buildings/anchors.ts` (`handDoors`, `handWalls`, `handPipes`, `handSpots`, `handSteps`, `doorLamps`).
Sampling views: scratchpad `handviews.json`/`handset.mjs` (the test set's script, browser lock from the main checkout), area `hand`: doors and walls of every kind of building.

## What it is
A module loaded before `lettering` (it hands it word plates through `propSpots`). All geometry lives in the near bubble: four merged layers per cell (`handBig` R 42, `handMid`, `handFine`, `handStain` a multiply pass at renderOrder -79), plus instanced ballast stones (`handBallast` R 7.5). Nothing is drawn from afar. Placement comes from the building's own data, not scatter: a pipe's foot gets a gully because the pipe ends there, a mat lies where a door meets paving, a block of flats gets a panel with one button per flat, a letter box goes on the wall only when the door has no plate.

Where the old merged trim had the same thing, `handDoorsLive()` leaves it out of the merge (lever, escutcheon, bell, pipe shoes and brackets), and `uHandPaint` fades the painted pull bars of glass doors up close.

## Files touched outside this area
- `buildings/anchors.ts`, `gen.ts`, `clutter.ts`, `homes.ts`, `houses.ts`, `services.ts`, `industry.ts`, `lobby.ts`, `buildings.ts`: notes for the system; old boxes skipped when the kit is live.
- `buildings/materials.ts`: `dayLook` of the unlit door lamps, `uHandPaint` (shell text changed, so a rebake is needed).
- `lettering.ts`, `lettering/spots.ts`, `lettering/paint.ts`: spot kinds `bellplate`, `wallsign`.
- `groundcover/mask.ts`: no pavement weeds on a door's mat.
- `main.ts`: module registered before `lettering`.

## Log
Round 1 in progress.
