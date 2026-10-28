# Real round — fresh bug hunt, wave 1 (2026-10-28)

Fresh session, branch `claude/real-bugs-1` (from `claude/pensive-gates-bim12i` @ df7a5cf). No game code changed.

## Method
* `shot.mjs --view downtown --invariants --validate` → console clean (0 errors/warnings), 0 failed modules,
  0 frame errors, invariants `{}`, validate `[]`.
* Seeded free-camera sweep (scratch generator, seed 12345): 56 points chosen from `window.__city.ctx.plan`
  (12 street-furniture slots, 10 lot fronts + 6 back yards, 16 features incl. 3 market stalls, gazebo, bandstand,
  statues, fountain, kiosk, playground, picnic, flagpole, court, lifeguard, ferry dock, jetty; 12 areas incl.
  2 car parks, market, quay, platform, garden, yard, courtyard, plaza, driveway, allotment, schoolyard),
  3 yaws each, distance 4–7 m, pitch 4–18°, 11 h → 168 views (`shots/bugs/b1..b7`, sheets in `*/sheets/`).
  Plus 7 views at 21.5 h (`shots/bugs/bn`) and a targeted batch (`shots/bugs/b8`: 6 parked cars ×2,
  12 building kinds × eave corner + mid-height corner).
* View strings are `x,y,z,distance,yawDeg,pitchDeg` for `--view` / `capture-set --views name=…`.
  Camera = target + distance·(sin yaw·cos pitch, sin pitch, cos yaw·cos pitch).
* Caveat: 29 of the 168 sweep views put the camera inside a building footprint (free camera has no collision);
  what is seen through the culled wall there (sills lying on the grass, awnings from behind) is not logged as a bug.

## Findings (most severe first)

| # | Sev | What | Where / view | Evidence | Owner |
|---|-----|------|--------------|----------|-------|
| 1 | **high** | **Market and cart vendors dressed as construction workers.** Every stall's vendor is spawned with `makeParty(rng.chance(0.5) ? 'worker' : 'shopper')` (`src/sim/pedestrians/crowd.ts:3202`); persona `worker` always gets a hi-vis vest and 70 % a hard hat (`looks.ts:328-335`). Result: the honey/bread/spices sellers in the market square (and the juice/ice-cream/flower carts) stand behind their stalls in orange/yellow hard hats and hi-vis vests. Café waiters get `dressWaiter()`; vendors need the same (apron / plain clothes). | market square, `p46market=26.2,1.5,72.6,5.8,106,17` and `…,346,17`; also p28/p29/p30 (market stalls) | `docs/progress/real/bugs1_vendor_hardhat.jpg`, `shots/bugs/b6/p46markety106_11.png` | src/sim/pedestrians (crowd.ts vendors spawn) |
| 2 | med | **Bus-stop flag reads as a "No Entry" sign.** The stop pole carries a disc in the route colour with a horizontal white bar on both faces (`busShelter()`, `src/world/props/furniture.ts:886-892`). On red routes this is exactly the European No-Entry sign (red disc, white bar) standing at the kerb of a working bus stop. Needs a real bus-stop flag (e.g. rectangular plate / ring with "BUS" bar, or a different colour scheme). The timetable plate under it (`#e8e3d6`, y 1.9) is also blank. | bus stop at (-3.9, -91), `p01busstop=-3.9,1.2,-91.0,5.3,14,16` | `docs/progress/real/bugs1_busstop_noentry.jpg` | src/world/props (furniture.ts) |
| 3 | med-high | **Garage door in the side wall, at right angles to the driveway.** For every house plan except `'garage'`, `sideRun()` cuts a 2.7 m garage door into the *side* wall that faces the driveway (`garageInSide`, `src/world/buildings/homes.ts:166,236-241`). The driveway is a 3 m strip running front-to-back along that side, and the parked car (plan `Stall`, yaw along the strip) stands side-on in front of its own garage door — no car could turn 90° into it. Same class as last round's "shelter built backwards". The garage door must face the street (front wall or a set-back garage wing) with the driveway leading straight into it. | Westbrook houses, e.g. lot 82 driveway (-176.8, 8.4): `p53driveway=-178.5,1.5,7.8,4.2,88,9`; overhead `g1drive82=-176.8,0,8.4,16,90,55` (b9) | `docs/progress/real/bugs1_garage_side.jpg` | src/world/buildings (homes.ts) |
| 4 | med-high | **Speckled noise band on the glass towers' crowns.** The top ~4–6 m of the curtain-wall towers (lot 23 at (-39.5,-97.5), h 82 m, and its neighbour) render as a dark band of high-frequency dotted/striped noise instead of glass or a solid parapet/screen. Not the window reflections: identical with `?nowinrefl`. Visible from close orbit and still from 45 m (`tw2`), i.e. whenever the free camera is near the skyline. Likely the crown/plant-screen band's texture or procedural pattern aliasing (no mip / too fine a period). | `tw1=-30.5,81.3,-113.5,8,155,18`, `tw2=-35,70,-105,45,155,8` (`shots/bugs/b10`, `b10n` = `?nowinrefl`) | `docs/progress/real/bugs1_tower_crown_noise.jpg` (left: 45 m; right: `?nowinrefl`) | src/world/buildings (tower crown / curtain-wall shader, materials.ts) |
| 5 | med | **SUV roof rails float above the roof.** The rails are 6 cm boxes at `c.topY - 0.01` inset only 8 cm from the roof edge (`suv()`, `src/sim/traffic/models.ts:1294-1295`); the lofted roof crowns/tumbles down towards its edges, so from 3–5 m the rails read as two black bars hovering over the roof with daylight under them and no feet. Same on parked and moving SUVs. Needs rail feet (4 posts) sitting on the roof surface, or rails following the roof curve. | station car park (-87.7, -146.4): `q5parkb=-87.7,0.8,-146.4,4.5,125,20` | `docs/progress/real/bugs1_roofrails.jpg` | src/sim/traffic (models.ts) |
| 6 | low | **Lit bus-shelter advertising panel is a blank white glow at night** (no poster image; by day it is a plain red/white slab). Same for the small timetable plate on the stop pole (blank by day and night). | `p00busstop=-84.0,1.2,-68.9,4.6,227,17` at 21.5 h (`shots/bugs/bn/p00busstopy227_21h5.png`) | `shots/bugs/bn/sheet.png` (top-left) | src/world/props (furniture.ts busShelter) |
| 7 | low | **Newsstand roof sign is a placeholder**: red bar with five cream squares ("■■■■■", `furniture.ts:611-613`) next to shop signs that carry real lettering ("Toy Shop", "Hardware", "BOOKS & CO"). Reads as an unfinished texture at 3–5 m. | newsstand slot, `p10newsstand y72` (b2) | `shots/bugs/b2/p10newsstandy72_11.png` | src/world/props (furniture.ts newsstand) |
| 8 | low | **Market goods repeat side by side**: 8 goods kinds for 20 stalls picked by `(f.id*7+3) % 8` (`civic.ts:228`) — two HONEY stalls face each other in the same row (and CHEESE/FLOWERS repeat within one glance). Shuffle without repeats per row, or add kinds (eggs, olives, plants, crafts, clothes, books). | market, `p29marketstall=28.7,1.3,83.6,7.0,92,16` | `shots/bugs/b4/p29marketstally92_11.png` | src/world/landmarks/civic.ts |
| 9 | low | **Rigid flag boards jut diagonally from the hotel front** — a blank teal board with a gold border and a red/white/blue board stick out of the first-floor facade at ~45°, flat and unhanging, no pole visible from the side; reads as a broken sign. | hotel lot west side, `e2hotelmid=-103.5,6.0,-16.5,6,295,8` (b8) | `docs/progress/real/bugs1_hotel_flags.jpg` | src/world/buildings (hotel / signs) |

## Looked at and found sound (so the next hunter can skip or re-check after changes)
Bus shelters face the kerb correctly (glass back on the pavement side, bench facing the road). Benches, bins,
hydrants, phone boxes, planters, mailboxes, bike racks, newsstand body sit on the pavement with no float/sink.
Lot fronts/back yards (townhouse, house, office, warehouse): sills, downpipes, ivy, lanterns, awnings, patios,
garden sets, sheds, greenhouses, rotary dryers all attached and grounded. Market stalls (cloth, goods, signs),
gazebo, bandstand, statue plinths, fountain, kiosk, playground, picnic tables, sports courts, lifeguard tower,
ferry dock, jetty, quay bollards, station platform, allotment, schoolyard: no z-fighting, holes or floating parts
seen. Parked cars sit inside their bays and on the ground; junction traffic showed no overlaps. Eave corners of
12 building kinds (tower … harbour master) close cleanly. Night (21.5 h): no black/NaN/blown pixels apart from #6.
Downtown `--invariants --validate`: console clean, invariants `{}`, validate `[]`.

## Not covered
People (W4 in progress: bald egg heads were seen everywhere but are W4's known state), trains up close
(one platform view only), boats/harbour water, terrain/landscape beyond the slab, overview-scale views.
