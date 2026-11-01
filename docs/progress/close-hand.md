# Close hand: what the eye checks at a door or a wall

Stage 3 of `CLOSE-ROUND.md`. Branch `claude/great-nightingale-12938a`, port 5216. Switches: `src/core/closehand.ts`.

## Resume here
Dev server: `npx vite --port 5216 --strictPort --host 127.0.0.1`. System: `src/world/handheight.ts` (placement by kind of building, layers, materials), `src/world/handheight/{sink,doors,walls,entry,ballast}.ts`. The generators note doors, walls, lamps, pipes and fittings in `buildings/anchors.ts` (`handDoors`, `handWalls`, `handPipes`, `handSpots`, `handSteps`, `doorLamps`).
Sampling views: scratchpad `handviews.json`/`handset.mjs` (the test set's script, browser lock from the main checkout), area `hand`: doors and walls of every kind of building.

## What it is
A module loaded before `lettering` (it hands it word plates through `propSpots`). All geometry lives in the near bubble: five merged layers per cell (`handBig` R 42, `handMid`, `handFine`, `handStain` a multiply pass at renderOrder -79, `handCoat` the door's paint with a stronger polygon offset), plus instanced ballast stones (`handBallast` R 7.5). Nothing is drawn from afar. Placement comes from the building's own data, not scatter: a pipe's foot gets a gully because the pipe ends there, a mat lies where a door meets paving, a block of flats gets a panel with one button per flat, a letter box goes on the wall only when the door has no plate.

Where the old merged trim had the same thing, `handDoorsLive()` leaves it out of the merge (lever, escutcheon, bell, pipe shoes and brackets), and `uHandPaint` fades the painted pull bars of glass doors up close.

## Files touched outside this area
- `buildings/anchors.ts`, `gen.ts`, `clutter.ts`, `homes.ts`, `houses.ts`, `services.ts`, `industry.ts`, `lobby.ts`, `buildings.ts`: notes for the system; old boxes skipped when the kit is live.
- `buildings/materials.ts`: `dayLook` of the unlit door lamps, `uHandPaint` (shell text changed, so a rebake is needed).
- `lettering.ts`, `lettering/spots.ts`, `lettering/paint.ts`: spot kinds `bellplate`, `wallsign`.
- `groundcover/mask.ts`: no pavement weeds on a door's mat.
- `main.ts`: module registered before `lettering`.

## What goes where (each with a reason, by the building's own data)
- **Solid doors** (`doors.ts`): one coat over the leaf (`leafCoat`, own layer `handCoat`: stiles and fields are one paint, carrying closemat's dust at the same height), raised fields with bevels, lever or knob by the door's metal, keyhole, night latch, letter plate, knocker on old doors, bell push, hinge knuckles, a stop and gap round the leaf, weather bar or kick plate, chips by the lock and at the foot.
- **Glass doors, lobbies**: real pull bars in the door's own metal, closer, floor lock, threshold. **Garage**: T handle. **Roller door**: lock, staple, controls and conduit beside it, KEEP CLEAR plate.
- **Lanterns** round the lit boxes of `doorLamps`: coach or modern, glass by day, glow at night.
- **Rainwater**: every `handPipes` pipe gets clips, shoe, gully where paved, damp and streaks. Walls of flats, terraces, hotels, schools and houses with no pipe get one (near only, with a hopper up to the real wall top, `handTops`), never within 1.6 m of another.
- **Entrance by kind** (`entry.ts`): flats and hotels an entry panel with a name per flat (lettering) and a bank of letter boxes; offices and schools a card reader; works a keypad; a house door with no plate a wall box; offices and hotels a dry riser inlet; lids in the first paving out from a door, cast iron with worn paint and the word WATER or GAS.
- **Walls** (`walls.ts`): air bricks on old masonry, vents on plaster, grilles beside flats' windows, meter cupboards and gas boxes on terraces and flats with stickers and labels, telephone drop, alarm box, CCTV with its plate, louvre, flue, overflow, tap on sides and backs, old fixings, isolator and conduit on works, shutter irons on every shutter leaf, clipped cable along terrace fronts, brick joints on piers and plinths that were one flat colour, fire points with two extinguishers.
- **Shops**: riser vent and stickers, awning hook and winding pole on the pilaster, a cellar flap in the pavement on one in four.
- **Life** (`life.ts`, `?nohandlife`): by the door a boot scraper, milk, wellingtons on a deck, a broom, a parcel, the paper on the mat; a broom or boots at a home's back door; a smokers' stand at offices, a sand bucket and NO SMOKING at works; hose on a hook and a can by a tap; dog, cold caller and neighbourhood watch plates.
- **Mats** wherever a door meets paving, a step or a deck. No pavement weeds on them (`groundcover/mask.ts`).
- **Ballast** (`ballast.ts`): real stones within 7.5 m of the eye, 260/m², on the bed's profile, off the sleepers and crossing decks, brown by the rails.
- **Metal** looks round: `handMaterial` darkens the flanks by view angle. Painted steel is written as paint (rough), not metal: metal reflects the sky and goes dark in shade.

## Fixed along the way (outside the new system)
- A shed office's glass door stood behind the shed's wall (`industry.ts`, depth 0.25 to 0.06): it read as a rusty sheet with bars on it.
- The old flat panel and letter box stack of flats overlapped the new kit: left out when the kit is live (`houses.ts`).
- Unlit door lamps were beige rectangles by day (`dayLook` in `materials.ts`).
- Doors whose stiles turned brown from about 2 m, with a diagonal edge, and at 1 m did not (also the "pale mullion" of `hd-house-0`): closemat's multiply pass on the old trim behind the leaf is drawn after the coat and is pulled forward by a polygon offset that grows with distance, past a coat 0.9 mm proud. The coat and the whole of each panel are now their own layer with a stronger offset (lips in another layer than the bands round them showed as a dashed line); `handStain` went from -2/-4 to -5/-10 to stay above it.
- Ground asked for right against a wall: the raster is 0.5 m, so the wall's own cell reads BUILDING and scrapers, stands, buckets and many mats were never placed. `pavedOut` and `groundOut` ask 0.55 m out.
- Panel cladding was removed: no wall of that kind exists (every smooth office or works wall has windows).

## Switches
`?nohand` all; `?nohanddoors ?nohandlamps ?nohandpipes ?nohandwalls ?nohandstains ?nohandballast ?nohandlife`; layers `?nohandBig ?nohandMid ?nohandFine ?nohandStain ?nohandCoat`. Quality: off on low (the old boxes stay), full on medium and high. `?handspots`: `__city.ctx.services.handspots` lists where each kind of thing went: how every kind gets looked at.

## How it was judged
Sampling scripts in the session scratchpad, not kept: `handset.mjs` (the test set with extra viewpoints), `mkmarks.mjs` (two places for each kind from `?handspots`), `mkrandom.mjs` (doors and walls drawn at random). Doing it again takes `?handspots` and a few lines round `closeset.mjs`.

## Cost (behind the power guard, baked, same page A/B hiding the layers, base = hidden)
Overview +0.05 ±0.23 ms, downtown +0.02 ±0.09, street 5,1.5,-65 -0.16 ±0.77 (base 34.8), market -0.21 ±0.22 (base 33.8): nothing measurable, inside the budget. Walking 25 s with real keys: 38.97 ms with, 38.96 with `?nohand`, 0 freezes either way, slowest cell 4.2 ms once in an earlier run, 2.2 frame build in the last. Triangles in view: overview and downtown 0, market 92 K, old town at 3 m 128 K, on the track 9 K. `hitch.mjs`: 0 new programs mid-run. Far views draw nothing of this. **Perf pending for the last commits:** these numbers are from `759310f`. After it came a few more items at back doors and the coat layer (one more draw per near cell with a door, so up to a few draws at a street), not timed: the coordinator measures at the merge.

## Checks at the last commit
On the last commit: typecheck and build pass. `shot.mjs --view overview --speed 4 --wait 20000`: no console, frame or module errors, invariants {}, validate []. `?diorama` and `?quality=medium` at downtown: the same, invariants {}. A few commits back (`4343f05`): `?quality=low` no errors, invariants {}; `ui-test --q noidle` 73 passed, `kinds` failed. `ui-test --q noidle --steps kinds` alone, rerun just before the last commit (on the coat layer, before the panels moved into it): passed 1, failed 0, so it was the known flake. The full ui-test was not rerun on the last commit; the last changes touch only door geometry and two polygon offsets.

## Left
- Low and medium were checked only for errors, not by eye.
- A very faint dashed line can still show at the edge of a door's panels from 3 m; gone at 1 m. Not chased, the user's machine went off AC. The stronger `handStain` offset was looked at on doors only, not on every stain over a thin fitting.
- The boot scraper (2 in the city) was not seen by eye. Cables are on only a handful of terrace fronts.
- An earlier walk under other load showed 46.85 ms and 24 freezes, and `hitch.mjs` one 116.7 ms freeze on the cut to street; not investigated, the later clean runs showed neither.
- Not done: roofs up close, crates and pallets at works (flat at 1 m, another module), gutter brackets at the eaves.

## Log
Round 1: kits, then door fields, ballast, painted pulls. Round 2: fresh sample of ordinary places, then life, irons, flaps, cables, every kind looked at once. Round 3: doors and walls at random, then the leaf coat, brick joints, fire points, the hidden office door. Round 4: every kind found by its marks, which showed the zero placements above, then the brown stiles.
