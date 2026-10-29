# Real round — fresh bug hunt, wave 2 (2026-10-29)

Fresh session, branch `claude/real-bugs-2` (from `claude/pensive-gates-bim12i` @ 2e201e8, the merged tree after
W1 s6 / W7 s2 / W8). No game code changed. Software GL (SwiftShader, ~10 fps) in a Linux container.

## Method
* `shot.mjs --view downtown --invariants --validate` → invariants `{}`, validate `[]`; every capture-set batch
  below reported 0 console errors/warnings, 0 page errors, 0 failed modules, 0 frame errors, invariants `{}`.
* Plan probe (scratch `scripts/.probe-bugs2.mjs`, not committed): areas, features, slots, lots, the 3 near
  farmsteads, 731 herd animals, 13 boats, café seats → coordinates for targeted views.
* Targeted views (`shots/bugs/A`, `B`, `C`): the six dense places (market, café terraces ×2, old-town back yard,
  fish quay + moored crabber, building site, station platform), herds near the slab edge, the near farmsteads,
  seated people, bus stops, car parks, platform train, house fronts/fences, townhouse fascias.
* Seeded street-level sweep (seed 20261029, 44 points from slots/features/areas/lot edges, one point per 25 m
  cell, camera 3.5–7.5 m, pitch 4–18°, camera kept out of lot footprints) → `shots/bugs/R1..R4`.
* 7 views at 21.5 h (`shots/bugs/N`).
* View strings are `x,y,z,distance,yawDeg,pitchDeg` (`--view` / `capture-set --views name=…`);
  camera = target + distance·(sin yaw·cos pitch, sin pitch, cos yaw·cos pitch).

## Findings (most severe first)

| # | Sev | What | Where / view | Evidence | Owner |
|---|-----|------|--------------|----------|-------|
| 1 | **high** | **Placeholder "box people" next to the real crowd.** The building-site workers, the boat crews and passengers (ferry deck, tour boat), and the playground kids are the old primitive mannequins — a box torso, box legs, a cube/ball head, no arms or hands (hi-vis yellow block with a white hard hat on the site; a yellow oilskin block with a brown ball head on the crabber's deck). A pedestrian with a face, hair and fingers walks past them. Same helper family: `person()` (`src/world/landmarks/parts.ts:202`) used by the 5 site workers (`construction.ts:438-445`), the bandstand band + conductor and the playground kids (`park.ts:557,568,790`); `figure()` (`src/sim/boats/models.ts:628`, 10 calls: ferry, tour boat, sail/motor crews, rowers, the crabber's deckhand `:1429`). | site `bs2=-71.5,1.2,-28,6,270,10`; crabber `mb1=136,1.0,-123,6,60,10` (`shots/bugs/A`) | `docs/progress/real/bugs2_box_workers.jpg`, `bugs2_box_people_more.jpg` (ferry `fe1=147,2,-14,10,250,10`, seesaw `pg1=-29.5,0.8,28.3,6,180,14`, `shots/bugs/D`) | W4 (people) with landmarks/parts.ts + sim/boats/models.ts — reuse the pedestrian body (static pose) or retire these figures |
| 2 | med | **Tree growing through a barn roof; leaf clumps floating above poplars.** At the farmstead (−381.5, 131.9) a broadleaf crown pokes up through the barn's corrugated roof (the trunk is inside the barn). Behind it the tops of the slim poplars end in single leaf clumps hanging 1–3 m above the rest of the crown with nothing connecting them (also in `fs2`). Both persist after 6 frames (`shots/bugs/M/fs1_f5`). Landscape tree scatter does not clear the farmstead footprints; poplar crown card stacking leaves gaps. | `fs1=-381.5,6.5,131.9,35,60,12`, `fs2=…,240,10` (`shots/bugs/B`) | `docs/progress/real/bugs2_barn_tree.jpg` | W8 — src/world/landscape (settlements.ts / farmstead.ts clearing; tree scatter) |
| 3 | med | **Moiré on the corrugated barn roof.** The red barn at the third farmstead shows a coarse swirling moiré (pale/brown blotches) over the whole roof at 30 m — the corrugation period is far below a pixel and is not filtered. Persists after 6 frames (`shots/bugs/M/fs3_f5`). | `fs3=-284.3,7,341.9,30,150,10` (`shots/bugs/B`) | `docs/progress/real/bugs2_barn_moire.jpg` | W8 — src/world/landscape/farmstead.ts (galv/sheet surface: fade the ribs with distance / fwidth) |
| 4 | med | **Bikes parked through the planters on the station concourse, and the rack bikes have no visible wheels.** In the concourse row (`planter, bikeRack, bikeRack, planter, …`) the parked bikes stick ~0.5–0.8 m out of the 2.8 m rack slot along the row, so wheels and frames stand inside the neighbouring planters' ferns and box walls (both ends of the row). The bikes in these racks (and in the rack at the station front, `r38`) show only the coloured frame triangles, saddles and bars — the wheels read as thin dark slanted strips or are missing, while the free-standing bike elsewhere (`r16`, `R2`) has full spoked wheels. Persists after 6 frames (`shots/bugs/M/pl1_f5`). | concourse behind the platform, `pl1=-10,1.4,-146.3,6,60,8`, `pl2=20,1.4,-146,6,300,10` (`shots/bugs/A`) | `docs/progress/real/bugs2_bikes_planter.jpg` (A, 6th frame, station-front rack) | src/world/props/scatter.ts:420-431 (spacing vs `SIZE.bikeRack`); furniture.ts `bikeRack()`/`bike()` :969-1040 (wheel discs) |
| 5 | low-med | **Creel rope tails hang in mid-air.** Each creel may get "a tail of the back rope hanging off one end" (`quay.ts:235-246`) whose last points are at y = 0.012 *in the creel's own frame* — on the stacked creels (lev 1–3, 0.37 m apart) the tails stick out horizontally from the stack 0.4–1.1 m above the ground instead of dropping to the concrete. | fish quay, `fq1=131,1.2,-131,6,90,12` (`shots/bugs/A`) | `docs/progress/real/bugs2_creel_ropes.jpg` | W7 — src/world/harbor/quay.ts creel() (drop the tail to ground level, or only on the bottom creel) |
| 6 | low | **Washing line strung through a tree.** In the old-town back yard the laundry line passes through the crown and past the trunk of the yard tree; garments hang inside the foliage. | back yard (81.5, 17.5), `by1=81.5,1.2,17.5,6,250,12` (`shots/bugs/A`) | `docs/progress/real/bugs2_laundry_tree.jpg` | W6 — src/world/props/places.ts backyard() (keep the line clear of vegetation slots, or skip the tree there) |
| 7 | low | **The same shop twice in one street view: two "Fish & Chips"** (red fascia at the old-town corner (78.9, 50), green fascia at (44, 48.9), ~35 m apart, both visible from the market end). Old-town shop names are picked by `SHOPS[(shopCounter*7 + lot.seed % 5) % 35]` (`oldtown.ts:296`) — the per-lot seed offset breaks the stride, so repeats are possible; the "Tailor" also appears twice (r03, r21). | `r12=78.9,1.5,50.0,7.2,208,14`, `r14=44.0,1.2,48.9,6.6,204,17` (`shots/bugs/R2`) | `docs/progress/real/bugs2_fishchips_twice.jpg` | W1 — src/world/buildings/oldtown.ts (draw names without replacement) |
| 8 | low (+ **harness caveat**) | **Near-herd LOD is one render late: after a camera jump the first frame shows the coarse herd.** First seen as "coarse animals at 3–6 m" in 4 of 6 herd views (`shots/bugs/B`: blob bodies, slab legs, box heads; the cows read as tables). Root cause found with a frame probe: the selector in `herd.onBeforeRender` (`farmlife.ts:386`) runs with the right camera (only the main camera calls it), but the instance attributes and the coarse mesh's `iN` mask upload with the *next* render, so frame 0 after `view()` still shows the old set. By the 6th frame the detailed Holsteins with shadows are there (`shots/bugs/M/hd3_f0` vs `hd3_f5`). In game at 60 fps this is a one-frame pop on camera jumps/fast moves — low. **Harness caveat (affects every reviewer):** in headless Chromium the page only renders while a screenshot is taken (`__city.frames()` stays constant through `waitForTimeout`), so `capture-set --settle` renders nothing and each capture is the *first frame after the camera jump*. Anything that is selected one frame late (near herds, near cells, leaf LOD…) can look wrong in capture-set shots. Take ≥ 4 screenshots per view (scratch `scripts/.probe-multi.mjs` did this) before calling an LOD bug. | `hd3=-101.9,0.9,172.9,6,180,8` (also `hd1`, `hd4`, `hd6`) | `docs/progress/real/bugs2_coarse_herd.jpg` (left frame 0, right frame 5) | W8 farmlife.ts (select before the draw, e.g. from `frame()` with the main camera) + scripts/capture-set.mjs (pump a few frames before the shot) |
| 9 | low | **Station name board cut by the canopy column.** The blue "Tinyhaven Central" board hangs on the far side of a canopy column, so from the concourse and the platform the column cuts through the name ("Tinyh… Central"), day and night. Move the board between columns or hang it below the beam on the near face. | platform, `pl1=-10,1.4,-146.3,6,60,8` (`shots/bugs/A`), `n5` (`shots/bugs/N`, 21.5 h) | `docs/progress/real/bugs2_station_board.jpg` | W7 platform kit (canopy name boards) |

Finding 8 (herd LOD) carries the **harness caveat**: capture-set shots are first frames after a camera jump.
Findings 2, 3 and 4 were re-checked over 6 frames (`shots/bugs/M`) and persist.

## Re-checked from round 1 (no regressions seen)
Market vendors now wear plain clothes/aprons (mk2, mk3); the bus-stop flag is a lettered plate (no longer a No-Entry disc) and
the shelters carry posters ("NEW PHONE", "ZOO OPEN"); stalls in one row show different goods (BREAD, VEGETABLES,
HONEY, CHEESE, FRUIT); SUV roof rails stand on feet (r30); house driveways lead to the street (r35, r42).
Tower crown, hotel flags and the newsstand were not revisited.

## Looked at and found sound
Café terraces (seated people on chairs, waiter, parasols, string lights by day and night), market lanes (stalls,
crates, sack trucks, pigeons, bunting), old-town back yard (table, bins, rotary line, wall laundry), fish quay
(store, oilskins, hose reel, fish boxes, forklift, net heap), crabber mooring lines reach the quay bollards, building
site (scaffold, rebar on sleepers, pipes, cable drum, hoarding), platform (benches, bins, railings, train with
lettering), farmstead buildings, bales and fences, herds over 6 frames, bus shelters (correct orientation, posters),
car parks, kerbs, tree pits/planters, hydrants, lamp posts, signal poles, crosswalks, road text ("STOP" reads right
for the approaching driver), picket fences and gates, shop fascias and window interiors, footbridge, jetty pontoon.
Night (21.5 h): lit windows, platform and terrace lighting, no black/NaN/blown pixels, no daytime-only emissives.

## Noted, not logged (low confidence / probably harness)
* A dithered, half-transparent person beside the café window at 21.5 h (`shots/bugs/N/n2_21h5.png`) — most likely
  the crowd fade-in after the `setHours` jump caught in a first frame.
* Allotment beds with plain green pyramids as vegetables (`R4/r34`); rowing boats at the jetty lie beside the
  pontoon with no painter lines (`D/jt1`); the bandstand plinth vents are flat black panels (`R3/r28`).
* Free-camera captures inside footprints (fq2 container, bs1 site building, mk1 awning, r33 forest) were skipped.

## Not covered
Moving traffic up close at junctions (only incidental), boats under way, trains in motion, the countryside
beyond the three near farmsteads, quality tiers other than auto:high.
