# Close hand: what the eye checks at a door or a wall

Stage 3 of `CLOSE-ROUND.md`. Branch `claude/great-nightingale-12938a`, port 5216. Switches: `src/core/closehand.ts`.

## Resume here
Dev server: `npx vite --port 5216 --strictPort --host 127.0.0.1`. System: `src/world/handheight.ts` (placement by kind of building, layers, materials), `src/world/handheight/{sink,doors,walls,entry,ballast}.ts`. The generators note doors, walls, lamps, pipes and fittings in `buildings/anchors.ts` (`handDoors`, `handWalls`, `handPipes`, `handSpots`, `handSteps`, `doorLamps`).
Sampling views: scratchpad `handviews.json`/`handset.mjs` (the test set's script, browser lock from the main checkout), area `hand`: doors and walls of every kind of building.

## Log
Round 1 in progress.
