# Close hand: what the eye checks at a door or a wall

Stage 3 of `CLOSE-ROUND.md`. Branch `claude/great-nightingale-12938a`, port 5216. Switches: `src/core/closehand.ts`.

## Resume here
Work is complete for this round and waits for the coordinator's merge. `materials.ts` shell text changed: rebake before measuring.
Dev server: `npx vite --port 5216 --strictPort --host 127.0.0.1`. System: `src/world/handheight.ts` (placement by kind of building, layers, materials), `src/world/handheight/{sink,doors,walls,entry,ballast}.ts`. The generators note doors, walls, lamps, pipes and fittings in `buildings/anchors.ts` (`handDoors`, `handWalls`, `handPipes`, `handSpots`, `handSteps`, `doorLamps`).
Sampling views: scratchpad `handviews.json`/`handset.mjs` (the test set's script, browser lock from the main checkout), area `hand`: doors and walls of every kind of building.

## What it is
A module loaded before `lettering` (it hands it word plates through `propSpots`). All geometry lives in the near bubble: four merged layers per cell (`handBig` R 42 cell 28, which since round 2 also holds what `handMid` held; `handFine` cell 8; `handStain` a multiply pass at renderOrder -79, cell 40; `handCoat` the door's paint with a stronger polygon offset, cell 28), plus instanced ballast stones (`handBallast` R 7.5). Nothing is drawn from afar. Placement comes from the building's own data, not scatter: a pipe's foot gets a gully because the pipe ends there, a mat lies where a door meets paving, a block of flats gets a panel with one button per flat, a letter box goes on the wall only when the door has no plate.

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
`?nohand` all; `?nohanddoors ?nohandlamps ?nohandpipes ?nohandwalls ?nohandstains ?nohandballast ?nohandlife ?nohandroofs ?nohandyard`; layers `?nohandBig ?nohandFine ?nohandStain ?nohandCoat`. Quality: off on low (the old boxes stay), full on medium and high. `?handspots`: `__city.ctx.services.handspots` lists where each kind of thing went: how every kind gets looked at.

## How it was judged
Sampling scripts in the session scratchpad, not kept: `handset.mjs` (the test set with extra viewpoints), `mkmarks.mjs` (two places for each kind from `?handspots`), `mkrandom.mjs` (doors and walls drawn at random). Doing it again takes `?handspots` and a few lines round `closeset.mjs`.

## Cost (round 2, `d244ceb`, behind the power guard, baked; abprof in one page, hidden minus shown, so -0.26 means the layers cost 0.26 ms)
All layers: overview -0.10 ±0.31 ms, downtown +0.37 ±0.73 (noise), market -0.26 ±0.11 (base 35.6), street 5,1.5,-65 -0.36 ±0.29 (base 35.2). Stains alone at market -0.27 ±0.19: nearly all of it. `perf.mjs` market: 37.04 ms, 36.67 with `?nohand`. All inside the budget.
Draw calls (`bfd0206` then now): market 298 to 290, of which hand 17 to 9; old town at 3 m 457 to 400, of which hand 19 to 12; street 348 and 348, hand 1; overview and downtown hand 0. Triangles in view: market about 103 K, old town at 3 m about 124 K, street 1.3 K, far views 0. `perf.mjs` counts 99 K for hand at market.
Walking 85 m with real keys: 40.99 ms, 41.02 with `?nohand`, 0 freezes and 0 long tasks both ways, no new programs. Slowest `handBig` cell 10.7 ms after cuts through street, market and old town, 7.2 ms while walking (a cell is built in one go, and the merge made them bigger; `cmMasonry` has 20.9 ms).
`hitch.mjs` at 12 and 21.5: 0 new programs. A cut to street or market holds one long task of about 370 to 475 ms; with `?nohand` it is 337 to 366, so it is not this layer's (about +30 ms of it may be), and walking never meets it.

## Checks at the last commit
Typecheck and build pass. `shot.mjs --view overview --speed 4 --wait 20000`: no console, frame or module errors, invariants {}, validate []. `?diorama`, `?quality=medium` and `?quality=low`: the same, invariants {} (on `d244ceb`; the last commit only adds the one fire point to a wall and this log). `ui-test --q noidle --hmr 1`: 74 passed, 0 failed.

**Without `--hmr 1`, `ui-test` fails here:** since the build stamp (`8d7fe8c`), `ui.ts` reads `__BUILD_ID__`, which in dev comes from `/@vite/env`. `ui-test.mjs` replaces `/@vite/client` with a stub unless `--hmr` has a value, so `ui` throws on load, and the hover, click and `kinds` steps fail with a `getComputedStyle` harness error that stops the run after 15 passes. That comes from the stamp and the script, not this module; it is not fixed here.

## Left
- Sacks: rounder than before, but from 3 m and 1 m they read as faceted pillows with flat bevels, not filled cloth. Replacing them means real rounding across the sack, not a larger chamfer.
- Moss: its last darkening was not seen in a usable view (the one try landed a hand from the slope, out of focus). The version before it was fine at 3 m.
- Yard wrapped loads have square brass marks on their sides that read as studs; not chased.
- Low and medium were checked only for errors, not by eye.
- The stronger `handStain` offset was looked at on doors only, not on every stain over a thin fitting. Cables are on only a handful of terrace fronts.
- Rooftop kit on flat roofs (AC units, water tanks) is still low-poly, and parapets were not looked at.
- The cream wash at `wall-oldtown` 3 m, 21.5: A/B with `?nodoorlamps` is nearly the same picture and the hand lanterns are emissive only, so it is the street lamp about 3 m from that wall. Not changed: it would alter the whole night look. Door lamps: `lamps.ts` radius 3.6, intensity 0.5.
- Seen, not this module's: white star-like sparkles in the blue noon sky near the sun (`eave-house-hip` 3 m); a jagged stepped edge where paving meets a plinth (`m-scraper-1` 1 m).

## Round 2
- Draws: `handMid` went into `handBig` (one mesh per cell; `?nohandMid` no longer exists), stains went to cells of 40 and the coat to 28.
- The dashed line at panel edges from 3 m: the old far door's box edge in the merged trim stood just under the new lip and won the depth test in steps. The lip is now two rings that clear it.
- Gutters: straps every 80 cm, a sleeve every 3 m, stop ends, streak stains at the joints (`buildings.handGutters`, skipped above 12 m).
- Tiles and slate up close (`uHandRoof`, `?nohandroofs`, a shader term in `bhRoof`, faded in where a pixel is under about a centimetre): grit, a butt edge that is not ruled, the dark lap, moss in it, sparse lichen. The first lichen was polka dots: rarer, smaller, gathered.
- Yard goods (`?nohandyard`, in `props/kit.ts` through `yardNear`): crates of boards, film over loads, packs of bricks, cartons, sacks, drums with a round shell, reels.
- Boot scraper: moved clear of the architrave, rough paint instead of metal (it rendered black).
- A wall could get several fire points in a row (`services.ts`, four on one wall in the works yard): one to a wall now. The random stream is unchanged, so nothing else moved.

## Log
Round 1: kits, then door fields, ballast, painted pulls. Round 2: fresh sample of ordinary places, then life, irons, flaps, cables, every kind looked at once. Round 3: doors and walls at random, then the leaf coat, brick joints, fire points, the hidden office door. Round 4: every kind found by its marks, which showed the zero placements above, then the brown stiles. Second assignment: fewer draws first, then roofs, yard goods, gutters, the lip and the scraper.
