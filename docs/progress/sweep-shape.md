# Sweep: no naked shapes

Stage 4 of the sweep (`SWEEP.md`): take away the rectangles, cones and plain shapes that say nobody thought about this. Work list: the `shape` section of `sweep-findings.md` on `claude/gifted-goldwasser-f1fa64`.

Master switch `?nosweepshape` (`src/core/sweepshape.ts`). Below medium quality the edge term is off; geometry stays, it is near-only or distance-culled.

## The fix for every box in the city

`box(` is called about 2,850 times, `cyl(` 770. Rebuilding them is not an option on a vertex-bound GPU, so the first fix is in the picture: `src/render/postfx/edgeWear.ts`, one step of the final merged pass, `?noedgewear`.

- Raw depth is linear across the screen on a flat surface, so second differences find creases, with a tent profile for free. Silhouettes are rejected by slope, shallow facets by angle.
- A convex corner catches the light and loses paint where world noise says so, a concave seam holds dirt. Radius 9 mm, 14 px at most, fades with distance, so it only acts up close.
- It runs before TAA, with a static dither, so it gives TAA nothing to shimmer on.

Cost, measured by switching `live` in one page (`abprof`, 6 cycles, ms, on mains): overview -0.01 ±0.26, market -0.17 ±0.24, street +0.18 ±1.18, close wall +0.10 ±0.64, downtown +1.61 ±4.41. Nothing readable except that it is small; downtown's window was too noisy to say more.

## By kind (a switch each)

| switch | what |
|---|---|
| `?noshapecrops` | allotment crops: cabbages, lettuce, carrots, beans, corn, sunflowers, pumpkins, on soil ridges (`vegetation/cropkit.ts`) |
| `?noshapecarts` | vendor carts: rounded bodies, real wheels, domed parasols, tubs and scoops |
| `?noshapekiosk` | kiosk keeper and ice-cream tubs |
| `?noshapeboards` | rescue boards with nose lift, rails, skeg |
| `?noshapebandstand` | bentwood chairs and music stands, iron grilles |
| `?noshapebench` | modern benches on a welded frame with wooden backs (they had taken the screws' colour), cast curved bench ends, a real water butt |
| `?noshapedrums` | spun steel drums on the quay |
| `?noshapecontainer` | corrugated container skin, castings, door gear, near only |
| `?noshapefowl` | swans and ducks in one smooth skin, folded wings, shaped head and bill |
| `?noshapetowels` | towels with lumps, a crease, a lifted corner, fringes; sunbathers' towels too |
| `?noshapecrossing` | crossing booms in a soft section, cast counterweights, drive housing door, round lamps |
| `?noshapemachines` | pay machine, charging post, bottle banks, near only |
| `?noshapeforklift` | forklift bodywork, near only |
| `?noshapemarket` | honey jars and cheese wheels off a lathe |
| `?noshapeturbine` | turbine door, landing and stair |
| `?noshapegarden` | gas grills, ride-on toys, sandpits, shed water butts, playhouses with shiplap, windows, a heart in the door and a flag, kennels with an arched door, name and bowl, trampolines with a soft pad, fire pits in split stone with stumps, parasols, patio chairs and tables, inflatable pools, loungers, wheelie bin mouldings, compost bins |
| `?noshapeladders` | round iron ladders with bends, stand-offs, flanges, a tide line |
| `?noshapemast` | harbour floodlight masts in spun sections with collars, door and bolted foot |
| `?noshapereefer` | also: oilskins on the store as a hanging jacket and bib-and-brace with boots, not two slabs; tyres on the quay wall round with tread and a chain, cast bollards at 24 sides; the fish quay's chilled container: door leaves with gaskets, ribs, kick plates and hinges, round locking rods with cams and handles; fan guards, louvres, controller and mains lead on the unit |
| `?noshapefingerpost` | fingerpost: cast post painted black and white, collars, finial, rimmed arms with real letters |
| `?noshapelamp` | lamp columns near only: rounder skin, weld seam, chipped and rusting foot, tape and staples of old notices, survey marks |
| `?noshapenotice` | notices on lamp posts: ties that go round the post, a lifted corner, a strip of an older notice |
| `?noshapebike` | parked and ridden bikes up close: a real saddle, a swept bar, a round lamp; bikes in tube rather than bar, one round tyre and rim, saddles and grips; bike-row hoops as one bent tube on flanges |
| `?noshapereel` | cable reels: planked flanges with battens, a bushed axle hole, the cable's loose end on the ground |
| `?noshapetimber` | timber stacks: boards with ends and seams; the wrap with soft edges, folds, wrinkles, steel bands and a label instead of a blue block |
| `?noshapegas` | gas bottles off a press with foot ring, shoulder band and valve guard, a chain across the cage |
| `?noshapefishbox` | also: crushed ice in chips and whole fish with a back, belly, tail and eye in the iced boxes; fish boxes moulded, ribbed, handles cut, the top of a stack open |
| `?noshapeskip` | skips: stiffeners, skids, chain lugs, scrapes, a hire firm's name, near only |
| `?noshapelighthouse` | lighthouse plinth round at last, joints, cast round uplighters; tetrapods with a chamfered foot |
| `?noshapeboard` | info boards: **the real town map, drawn from the plan** (streets, blocks, water, district names, bus lines), and each board's pin is where that board stands; soft posts, a hood |
| `?noshapeplanter` | planters with a moulded foot and rolled rim, soil below the lip |
| `?noshapeshed` | shed roofs in lapped felt with nails, fascia, drip edge and moss, near only; pots off a wheel |
| `?noshapevan` | the ice-cream van's hatch: framed, a sliding pane, a counter on brackets, lit wall, tubs, cones, a price board |
| `?noshapeboat` | every boat's navigation lamps round instead of coloured cubes; the crabber's roof: scanner, rail, hatch, vents, life raft |
| `?noshapebirds` | gulls and every bird: rounder body, smooth head, wings with a bowed leading edge and a feathered trailing edge, no gap at the elbow |
| `?noshapestones` | headstones with shaped heads, a cut border, a roundel and lines of inscription |
| `?noshapebooks` | book spines on the cart with gilt bands or small labels |
| `?noshapepapers` | kiosk newspapers: printed front pages, the fold down the edge, twine |
| `?noshaperooms` | boxes on shop shelves in four designs rather than one white label, record bins with sleeves; **shop windows**: each trade its own display in the room atlas (`buildingrooms/windows.ts`): a chemist's show globes where the blue and green cones stood, pump bottles, a board; an optician's busts in glasses, an eye chart and giant glasses on wires; a rocking horse, alphabet blocks and a bear, a dolls' house, a kite and a train in toy shops; hats on stands; shoes on steps; spade, fork, hose, watering can and steps at the hardware shop; parcels and a pillar box at the post office; a bronze head, a pierced stone and an easel, a glazed jar and a bowl in galleries; a mantel clock, candlesticks and a globe in antiques; sleeves and a record player in record shops; mannequins with a waist and hats with brims. Round outlines in the whole atlas at twice the faces. All of it is drawn once at boot: no triangles per frame |
| `?noshapepit` | tree pits: setts flush with the paving in worn granite on a mortar bed, no white cubes standing proud |
| `?noshapekayak` | beach kayaks: a rockered hull with a section and a crowned deck, a coaming round a real cockpit, seat, deck lines, a paddle with blades |
| `?noshapehydrant` | hydrants off a casting: flanges with a section, a round dome, an iron pentagon nut, bolts, chains of links |
| `?noshapevending` | vending machines: soft body; near only a door in its frame, shelves of cans and bottles, keys, a slot, a push flap, feet |
| `?noshapeibc` | liquid tanks: near only a cage of round bars, tank ribs, feet, valve, filler with clips, a label |
| `?noshapedumpster` | dumpsters: soft body, round castors; near only pressed ribs, rolled rim, trunnions, fork pockets, lid ribs and handles, a number, scrapes |
| `?noshaperope` | rope coils: a heap from afar, turn by turn near with the free end across the ground |
| `?noshapepots` | crab pots open cages of hoops and line, netting and an entrance eye near, no solid block of colour; net heaps with folds and a float line |
| `?noshapepipes` | pipe stacks round with flanges and a bore in shade, wedges; used sleepers near: checks, end splits, plate marks, bolt holes |
| `?noshapetrolley` | luggage trolleys in bent tube and wire, a handle, four wheels |

The sacks (filled, `softBlob`) sit under the older `?nohandyard`.

## What it costs in triangles

Per-mesh diff of the whole scene against `?nosweepshape`, before the garden pass: visible at overview about 70 k (vendors 28 k, trimmed afterwards; kiosks 12 k, waterfowl 9 k); near and distance-culled meshes carry the rest (crops 187 k, only within 180 m of the allotments; furniture 76 k; near detail 30 k; market 18 k).

The first perf run showed +500 k triangles and +31 draws at overview. The per-mesh diff finds nothing like that drawn there, so it was a state difference between the two page loads, not these props. The reversed run checks it: at `702477a`, rebaked, on mains, `?nosweepshape` first and then the baseline (ms, triangles, draws):

| view | off | on |
|---|---|---|
| overview | 35.25, 3.652 M, 259 | 34.14, 3.744 M, 259 |
| market | 37.66, 3.991 M, 286 | 37.62, 4.100 M, 286 |
| street (5, 1.5, -65) | 39.41, 3.907 M, 344 | 38.77, 4.646 M, 383 |

No time cost readable within the noise (the earlier baseline-first market 51.71 against 37.58 was cold-page bias). Street's +739 k triangles and +39 draws are near and fine cells coming in; at 2.5 ns they would be about 1.8 ms by estimate although not seen in this run, so it is measured again at the end.

Measured again at `241fc22`, rebaked, on mains, `?nosweepshape` first and then the baseline, one run per view (ms, triangles, draws):

| view | off | on | difference | budget |
|---|---|---|---|---|
| overview | 33.47, 3.212 M, 228 | 34.16, 3.907 M, 259 | +0.69 ms, +694 k | +0.2 |
| downtown | 31.84, 4.057 M, 255 | 32.20, 4.143 M, 239 | +0.36 ms, +85 k | +0.2 |
| market | 38.34, 3.991 M, 286 | 37.08, 4.212 M, 286 | -1.26 ms, +221 k | +0.7 |
| street (5, 1.5, -65) | 37.20, 4.487 M, 383 | 37.75, 4.858 M, 383 | +0.55 ms, +371 k | +0.7 |

Overview and downtown are over the budget in this run. Not settled: reloads carry ±1-2 ms, and the draw counts differ in opposite directions (overview 31 more with the switch on, downtown 16 fewer), so part of it is page state again, as in the first run. The triangles at market and street are the real cost, about 0.55 and 0.9 ms at 2.5 ns. An `abprof.mjs` A/B cannot be used for this switch, it acts at build time; the way to settle it is several reversed runs per view.

Same run: invariants `{}`, validate `[]`, no console errors at overview, `?diorama`, medium and low; `hitch.mjs` 0 new programs everywhere, one 100 ms frame arriving at overview 21.5.

Stopped before the end on 2026-11-02 (the machine was needed): `ui-test.mjs`, `npm run build` and the last look at rope, iced fish, vending front, IBC and sleepers after their last edits did not run.

## Not a defect

`feat-floodlight`: the sweep's camera stands inside a closed stair tower (the mast rises out of its roof) and sees the stair windows from behind. Nobody can stand there. Raycast from the page: `landmarks-static-stadium`, `landmarks-kinetic`.

## Left on the list

Hedges and lawns are the foliage and ground families. People are the people session's (`ped-*`, and the people in `veh-*`). Still plain, from the `shape` list: `room-office` (left: from below it is a ceiling grid and glass tinted by the sky, a glass and lighting matter, its desks are atlas pages already), palm trunks (faceted: the shared instanced wood cylinder, more sides would cost every tree), boat fenders, the river tour boat's helm and stool, the lorry cab's side, the promenade railing's square post, freight-yard footings, the named buildings' parts, greenhouse plants, the cat and pigeon.

Scripts used, worth keeping in mind: a raycast from the page (import three from the resource list, `mesh.raycast`, print the mesh name) names what a frame shows faster than reading code.
