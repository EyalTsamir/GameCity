# Judge 2 (fresh eyes) — 2026-10-29

Scope: everything merged on `claude/pensive-gates-bim12i` @ feb549b: W1 s6 facades, W2 s6 vehicles and trains, W3 s4
furniture, W4 s6 people, W5 s2 street, W6 s1 market/terrace/yard, W7 s2 quay/site/platform/boats, W8 s4 countryside.
I judged against the **REAL.md photo tests** and compared with `real-judge-1.md` to see what moved. I read no worker
logs.

Verdict scale: **real** = passes the photo test at 3 m and 10 m · **almost** = one or two things missing ·
**not yet** = still reads as a model or primitive at 3 m.

## Captures (11 h, 1280×720, software GL; console clean in every run: 0 page/frame errors, 0 failed modules, no missing classes)
| set | contents | path |
|---|---|---|
| a | house, townhouse, apartment, office, tower, warehouse @ 3/10 m | shots/j2/a/ → **docs/progress/real/judge2_facades.jpg** (with church/school) |
| b | church, school, car, bus, train (platform/door/track/roof/cab), boat, pedestrian | shots/j2/b/ → **judge2_vehicles_rail.jpg** |
| c, d | bin, planter, newsstand, phonebox, statue, bench / busstop, kiosk, playground, marketstall, gazebo, tree | shots/j2/c, d/ → **judge2_furniture_country.jpg** |
| e | lamp, sheep, cow, tractor, flowerbed, kerb | shots/j2/e/ (in the furniture/country sheet) |
| p1–p3 | car picks 1, 2 (yaw 0/150), pedestrian picks 1–3 | shots/j2/p1..p3/ |
| f | quay, quaysea, site, siteyard, platform, farm (bench places) | shots/j2/f/ |
| free | market ×2, terrace ×2, back yard ×2, quay ×2, site, platform, old-town, downtown and Westbrook streets, overview | shots/j2/free/ → **judge2_places.jpg**, **judge2_street_night.jpg** |
| night | downtown POI, downtown street, market @ 21.5 h | shots/j2/night/ |

The capture-set frames include the UI because I forgot `--hideui`. It does not affect what they show.

## Ranked findings (impact = how often it is on screen × how hard it breaks the illusion)

1. **The dense places are dressed, but nobody is in them, except the terrace.** This is now the biggest gap between
   "a good model" and "a real place". At 11 h:
   - The **market** has ~14 stalls with goods but no shoppers. There are only stallholders and one or two passers-by.
   - The **quay** has no fisherman, no forklift driver and nobody on the crabber.
   - The **platform** has zero people while a train stands at it with its doors open. A lone suitcase stands by a
     column with no owner, which reads as a bug.
   - The **site** has two hi-vis workers, both standing still, and no machine.

   The props are now good enough that the emptiness is what the eye registers. Every place needs a crowd that fits
   it: queues and browsers at the stalls, people working the quay, waiting passengers spread along the platform edge
   (*known: platform people need benches on the ped graph*). At night the market stays fully stocked and open, with no
   one under the festoon lights. Stalls should be shut, shrouded or packed away.
2. **The back yard is still not a place, and it has a live floating-geometry bug.** In `free/yard_b`, three long thin
   beige/grey slabs shaped like window sills float about 0.4 m above the lawn in the open yard, in the default build.
   These are the "floating planks" traced to the buildings-sills instances; they are not fixed on the merged tree.
   The yard itself is an open lawn rectangle in a big cobbled court with no wall or fence (old-town street view). It
   has one laundry line of flat cards hanging dead straight (no sag, no pegs, no drape), bins, bikes and a table. A
   visitor would not stop. The laundry wires strung across the façades above read better than the yard below them.
3. **Primitive people sit inside the vehicles.** The street people's close LOD is now good, but:
   - The car **driver** (pick 1, 3 m) is a white snowman: a ball head with a dark cap, a blob torso and mitten hands.
   - **Bus passengers** are bald peach balls on blob bodies.
   - **Train passengers** are grey, faceless head ovals.
   - The **sailboat crew** is Lego: a box torso and a ball head on a block, with no arms.

   You see these through every windscreen and window at 3–10 m, often in the same frame as a detailed pedestrian, so
   the gap in quality is obvious. This is the most primitive human geometry left in the game.
4. **Rail track bed: the ballast is a pixel mosaic.** At 3 m (track, door and platform views) the ballast between the
   sleepers is a grid of roughly 10 cm grey squares. It looks like a magnified, nearest-filtered low-res texture, a
   "Minecraft" look. The saloon floor seen through the open door has the same mosaic. The sleepers are flat dark boxes
   and the rails have no chairs or clips. The train body itself has moved a lot (door gaskets, pictograms, bogie
   springs, roof kit), so the track now spoils it. The rock cutting beside the platform and behind the quay is
   stacked low-poly slabs with flat green ledges and faceted boulders. It is the backdrop of two of the six dense
   places, and it reads as a video game at 6–15 m.
5. **Lawns and the lawn/wall seam.**
   - At the apartment (3 m and 10 m) the strip of lawn along the wall is still flat saturated "felt", with no blade
     texture at 3 m.
   - A **thin bright yellow-green rim line** still runs along the whole wall/lawn seam. Judge 1 found it; it is not
     gone in the default view.
   - Park lawn strips at 10 m have a paler centre band and a darker rim, so they read as painted bands.
   - The pasture (sheep/cow) is a flat lime plane with sparse dark blade cards, like hair on felt.

   Grass is on screen in almost every frame.
6. **Sheep at 3 m show the far LOD.** The bench (sheep 3 m) shows hexagonal-prism bodies, black box heads and four
   black stick legs, and the whole flock is identical. The cow at 3 m is the sculpted near model, so the sheep's near
   LOD (`land-sheep-near`) is either not selected at this pose or not built. **Suspected bug:** check the near
   selection for species 1 with the sim paused, and compare against `?noanimaldetail`.
7. **The same interior is repeated behind the glass.**
   - Office upper floors (10 m): every pane shows the same pale beige room with the same dark boxes and no reflection.
     It reads as wallpaper.
   - Tower and downtown office lobbies: the same pot with a **pixelated** low-res bush, plus coloured square
     "stickers", in every pane, on both sides of the downtown street.
   - The old-town "Books" and "Bookbinder" shops use the identical bookshelf interior.
   - "CAFÉ NORD" has wine shelves at 3 m and bookshelves at 10 m behind it, and its lettering runs behind a column
     ("AFÉ").
   - School windows all show the same reflected-street strip at the same height.

   Judge 1's "identical glass" problem moved from the glass itself to the rooms behind it.
8. **Everything is brand new.** The wear and weathering are uneven:
   - The church ashlar is uniform cream with crisp even joints, with no soot or green at the foot. It reads as a new
     CG model, though the church should be the dirtiest building in town.
   - Warehouse sectional door: spotless, saturated yellow.
   - The site ground is clean beige paving (no mud, gravel or puddles), with clean white hoarding.
   - The quay apron is clean concrete.
   - The newsstand, phone box, kiosk and playground have spotless paint.
   - Tractor and bus bodies have no road or field dirt.

   Meanwhile rivulets and stains on precast and render are strong. Objects of different "ages" still sit side by side.
9. **Flat cloth.** The market awnings are dead-flat planes with crisp stripes and no sag, billow or hem. The
   foreground canopies fill a quarter of both market frames. Laundry is flat cards, sails are flat sheets, and the
   bunting is evenly spaced with no visible flutter. Judge 1 asked for awning valance, sag and movement; the
   scalloped valance is there now, but the canvas is still a board.
10. **Paving regularity.** Old-town and townhouse pavers form one perfectly regular grid with wide, uniformly dark
    joints. There is no colour variance, settling, wear path or litter under the stalls. In street-level frames this
    fills the bottom third. The cobbled market court and old-town court are endless uniform texture.
11. **Bench framing faults**, so these classes could not be judged at the stated distance:
    - bin 10 m: still blocked by a bus-shelter glass panel (same as judge 1);
    - lamp 3 m: the lamp is about 8 m away; lamp 10 m: the camera is inside a street-tree crown;
    - tree 3 m: the trunk is about 8 m away, so bark cannot be judged;
    - playground 3 m: a climbing-dome rail across the foreground;
    - farm 3 m: the camera is inside the farmhouse wall, giving a full-frame render; at 10 m it hugs the wall.

## Classes

### Buildings
| class | verdict | moved since judge 1 | top remaining defects (distance) |
|---|---|---|---|
| **house** | almost (+) | sills + boxes, porch deck + balusters, house number, dark plinth band, curtains @ 10 m | (1) ground-floor glass flat dark grey, reveal still shallow at 3 m oblique; (2) porch posts and beam are plain white boxes with no base, capital or soffit detail; (3) no door step, letterbox or lamp visible at 3 m; (4) the gable at 10 m is one big uniform brick field with no weathering; only one corner downpipe |
| **townhouse** | almost (+), best street frontage | bookshop front: gilded fascia, scalloped awning, parallax shelves, stall riser, spot lamps; louvred shutters; ivy balcony | (1) shop door is a flat pale glass slab with no handle or push bar; (2) shutter louvres read as faint lines at 10 m; (3) the paving grid dominates (see #10) |
| **apartment** | almost | glass varied (blinds/curtains/bare/street reflection), so judge 1's repetition is fixed | (1) bright lawn rim + felt lawn (#5); (2) plinth is a smudgy gradient, not a stone course; (3) street reflections in ground-floor panes read as flat posters at 3 m; (4) mailbox and intercom are plain black boxes |
| **office / shop** | almost | clad columns with joints + dark base, intercom and notice at the door | (1) the same interior in every upper pane (#7); (2) sign/interior mismatch, sign behind column; (3) heavy flat black frames; no reflection on the shop glass at 3 m |
| **tower** | almost | entrance canopy, number 86, intercom, downlights; lobby visible (judge 1 item done) | (1) pixelated lobby plants repeated per pane; (2) the curtain wall is uniform blue with no per-pane tint at 10 m; (3) ragged dashed shadow-acne line on the pavement along the colonnade at 10 m |
| **warehouse / industrial** | almost (was not yet) | sectional door panels in relief, vision windows, guide rails, handle, bollards, personnel door + canopy, base course | (1) spotless new door and cladding, no dents, kick marks or rust; (2) the door canopy slab overlaps the bottom of the NORTHGATE sign board, two parts in one plane (10 m); (3) sign lettering has a soft drop shadow, so it reads as screen typography; (4) corrugation is shaded stripes with no profile at the corner |
| **church** | almost (was not yet) | plank doors with strap hinges and ring pulls, stone step, plinth | (1) uniform new ashlar, no weathering (#8); (2) arch surround and pediment are plain extrusions with no moulding; (3) the rose window is a saturated flat wheel with no tracery depth or leading; (4) door planks have no grain |
| **school** | **not yet** (moved little) | brick + plinth + lintels | (1) the entrance is plain aluminium double glass under a slab canopy: no handles, noticeboard, gate, railings, bike stands or children's work in the windows. Only the sign says "school"; (2) the same reflected strip in every window; (3) the sign panel has no fixings; (4) the street tree in front has a smooth black cylinder trunk with **no bark at 3 m** |

### Vehicles and boats
| class | verdict | moved | top remaining defects |
|---|---|---|---|
| **car** (picks 0–2) | almost (strong; paint was "not yet") | clear-coat street reflections; sedan/estate/MPV/SUV mix in the parked row; roof box/rails; stalk mirrors; plates; alloys | (1) tyres are uniformly brown-dusty over the whole sidewall, like suede; real tyres are black with grey dust only low; (2) side glass reads as hazy frosted plastic, with no sky-reflection gradient; (3) snowman driver (#3); (4) bonnet reflections show a tiled window-grid strip; (5) flanks still flat between beltline and sill; car-park asphalt is a vast flat slab (10 m) |
| **van / lorry** | almost (+) | slatted crates, cartons, orange straps, pallets, plastic crates (judge 1's "pillow crates" fixed) | cab front is a flat plate with a grille texture |
| **bus** | almost (strong) | front: black bumper, grille, lamps, plate, wipers, destination blind, arm mirrors; roof AC pack with edges | (1) ball passengers (#3); (2) windscreen is a flat pale grey sheet, driver invisible; (3) spotless sides, no dirt behind the wheels; (4) mirror heads are plain black boxes |
| **train** | almost | door leaves with gaskets, pictograms, button, step; bogie springs/axlebox; livery lettering; roof kit; cab number + destination | (1) pixel ballast + mosaic floor (#4); (2) faceless passengers; interior back wall flat white; far windows are pale cards; (3) body side is one flat red sheet with no panel seams; bogie clean matte grey, a black blob in shade; (4) cab windscreen is a flat black void (no reflection, driver or wipers), lamp clusters are flat plates (*known*) |
| **boat** (sailboat, pick 0) | **not yet** | ferry and crabber improved (wheelhouse, fenders, ropes) | (1) Lego crew (#3); (2) cabin is a rounded box with one black slot window; coaming is two planks; (3) sails are flat sheets with no battens, seams or draft; mast is a plain pole with one stay; no boom hardware; (4) no cleats, stanchions or fenders at 3 m. Water and reflections are superb, which makes the boat look worse. |

### Street furniture and park
| class | verdict | moved | remaining |
|---|---|---|---|
| **bench** | real | — | — |
| **bus stop** | real | flag, timetable, poster; a pram user waiting | — |
| **kerb** | real | kerb units with joints, gutter, weeds | — |
| **market stall** | almost (+), closest to real | jars of varied heights, tags, dial scale, draped tablecloth, crates + cardboard underneath, curtain folds, stallholder | stallholder stiff, arms hanging; cardboard untextured; flat awning (#9) |
| **statue** | almost (+) | cap moulding, carved name, plaque | plinth steps are clean CG blocks with no streaks |
| **planter** | almost (+) | rusty box, trailing flowers | soil not visible, no stains on the paving |
| **flowerbed** | almost (+) | stone ring, soil, species | flower heads uniform in size |
| **newsstand** | almost (was not yet) | covers with mastheads and images, wire racks | (1) mastheads in a blocky **pixel font**; (2) repeated titles (BIKE ×2, HOME ×2); (3) no vendor, hatch or shutter; it is a closed cabinet; spotless paint |
| **kiosk** | almost (was not yet) | open hatch, coffee machine, cups, counter, scalloped awning, bistro set | flat green panels, plain white side board, no menu or prices |
| **phone box** | almost (unchanged) | — | panes milky white, still **no phone visible inside at 3 m**; pixel sign text; no chips. The e-scooter parked beside it is made of primitive white boxes (new eyesore) |
| **bin** | almost (unchanged) | — | not re-judged at 10 m (framing) |
| **gazebo** | almost (unchanged) | — | soffit ribs plain, rails new white |
| **playground** | almost − (was not yet) | chains + seats, rubber-tile mat, climbing frame | tubes have no clamps or bolts; no wear under the swings; carousel is a flat colour-pie disc (10 m); surround is a plain beige slab |
| **tree** | almost | grates/pits at the foot | the school street tree has a smooth black trunk at 3 m; the bench could not frame bark (#11) |
| **lamp** | not judged at 3 m (framing) | post bases with door/collar look right in other shots | bloom balls at night (pre-existing) |

### People and countryside
| class | verdict | moved | remaining |
|---|---|---|---|
| **pedestrian** (picks 0–3) | almost | faces, hairline, fingers, hats, bags, natural gait; crowds at 10 m read as people | at 3 m clothes are one flat colour with no folds or sheen; the navy dress is a smooth cone; the bald man's head is uniform peach with faint features; a woman in beige trousers matching her skin tone reads as a mannequin (church 3 m); walking groups go single-file in lockstep along a wall |
| **cow** | almost | sculpted head/ears/udder, joints, hide | near-black flat coat; the white patch reads as a blanket on the back at 10 m; uniform shin cylinders, no tail or hooves |
| **sheep** | **not yet** at 3 m (far LOD shown, #6) | — | hex-prism body, box head, stick legs; identical flock |
| **tractor** | almost − | lugged tyres, hub nuts, curved mudguard, louvres, exhaust, cultivator + roller, soil tracks | (1) the **cab is an opaque black box**: no glass, seat, wheel or driver. The glass cab is a tractor's signature; (2) no mud on tyres or guards; (3) no steps or handrails |
| **farm** | not judged (framing, #11) | — | — |

## Dense places: would a visitor stop and look?
| place | stop? | why / why not |
|---|---|---|
| **café terrace** | **yes** | The most alive place: ~14 seated guests in pairs, a waiter in black gesturing, two bistro chair styles, parasols, festoon lights, waiter station, ivy planters. What breaks it: it sits in front of a navy office lobby with pixel plants, with no café name, awning, menu board, A-frame or bar, so nothing shows where the coffee comes from. Tables are nearly bare (no plates, saucers, menus or bags under chairs). Guests are evenly spread, static, some facing nowhere, and nobody arrives or leaves. |
| **market** | yes, for three seconds | Rows of named stalls, bunting, festoon lights, sack trucks, flower buckets, bread baskets and pigeons make a lovely composition, until you notice there are **no shoppers** (#1). Flat awnings (#9), an identical stall kit in different colours, a uniform cobble grid with no litter or wear, perfectly spaced bunting. At night: open, stocked and unmanned. |
| **harbour quay** | briefly | The best still-life: crabber against the wall with fenders, ladder, bollard and spliced sagging rope; stacks of netted pots; fish boxes; coiled rope on a pallet; tarp bundle; containers and gantries behind. But nobody works it. The apron is vast clean concrete between equally spaced prop islands. The forklift is boxes (yellow block, bar mast, slab seat). The white ice store is a featureless corrugated cube (the bench angle shows a panel with two black circles, like a loudspeaker). Low-poly breakwater and cliff behind. |
| **building site** | a glance | From inside the scaffold, the plank deck, tube rails, crane on ballast blocks, cable drum (with cable here), ducts and kerb units on pallets read well. But it is tidy like a showroom: clean beige ground; "tyre tracks" are two crisp dark straight bands that read as painted rails or tape, not ruts; clean hoarding with no posters; no machine (digger, mixer, skip); workers static. |
| **station platform** | **no** | Canopy with valance and trusses, amber departure boards, ticket machine with screen and keypad, bike row, planters, train standing with an open door. But **zero people** and an ownerless suitcase. Blank white info board. Pixel ballast and a low-poly cutting beside it. |
| **back yard** | **no** | An open lawn in a court with no enclosure, one line of flat-card laundry, bins, bikes, a table, and the **floating sill slabs** (#2). Nothing of yard life: no shed, paving, pots, toys, chairs or hose. |

## Cross-cutting
* **Life over objects.** Wave 3 made places, but places are judged by the people using them. The object ladder
  (form → material → contact) is largely climbed for the common classes. The next unit of realism is **who is there
  and what they are doing**. Street pavements in downtown at 11 h are also sparse.
* **Repetition** moved from glass to interiors (#7), from car silhouettes to tyres (all brown-dusty), and to the
  market stall kit. The parked car row now passes. The fruit-pyramid problem is gone.
* **Contact.** Mostly good: dark plinth bands on houses and church, a foot band on the warehouse, shadows under cars,
  weeds in joints. Remaining: the bright lawn rim (#5), the floating slabs in the yard (#2) and the lone suitcase
  (logical rather than physical contact).
* **Scale.** OK everywhere I looked. The newsstand roof slab and bus roof pods that judge 1 found oversized are fixed.
* **Material consistency.** See #8: new-clean civic, industrial, site and quay surfaces next to strongly weathered
  precast and render.
* **Low-res texture magnification** is a new class of tell at 3 m: ballast, saloon floor, lobby plants, pixel-font
  magazine mastheads and phone-box sign. Each one is a texture sampled far below its screen size (or nearest-filtered).
* **Out of scope but visible.** Chimney smoke in Westbrook is grey hard-edged **square** sprites (worse than judge
  1's "cotton puffs"; ambient). The low-poly rock cutting and breakwater (landscape/harbour) sit right behind the
  platform and quay.
* **Overview:** intact and still impressive (bay, fields, forest, mountains, balloon, airship, ferris wheel). No
  regression.
* **Night (21.5 h):** no regression. Lit windows, tail lamps, the lit station clock and the market festoon lights
  all work. Lamp heads still have large white bloom balls (pre-existing). The market stays open and stocked at night
  (#1).

## Regressions / bugs found
1. **Floating sill-shaped slabs in the back yard** (`free/yard_b`, about (76.5, 17.5) looking west from x+9): still
   present on the merged tree in the default build.
2. **Sheep near LOD not shown at 3 m** (bench `sheep --dists 3`): the coarse model appears; cows are fine.
3. **Lone ownerless suitcase** on the platform by a canopy column (`free/platform_a`).
4. **Bright lawn rim** along apartment walls is still visible (judge 1 item; the lead's log says it is fixed at the
   bench apartment 3 m. My apartment 3 m and 10 m frames show it along the whole facade).
5. Shadow acne: a ragged dashed black line on the pavement along the tower colonnade shadow (`a/tower_10m`).
6. "CAFÉ NORD" sign runs behind a column and does not match its interior.

None of these break the console or invariants (all reports: 0 errors).

## Verdict table (judge 1 → judge 2)
| class | J1 | J2 | top defect now |
|---|---|---|---|
| house | almost | almost + | plain porch boxes, flat ground-floor glass |
| townhouse | almost | almost + | shop door slab, paving grid |
| apartment | almost | almost | bright lawn rim + felt lawn |
| office / shop | almost | almost | same room in every upper pane |
| tower | almost | almost | pixel lobby plants, uniform curtain wall |
| warehouse | not yet | almost | brand-new door, canopy overlaps sign |
| church | not yet | almost | uniform new ashlar |
| school | not yet | **not yet** | bare entrance, nothing says school |
| car | almost / not yet | almost (strong) | brown suede tyres, snowman drivers |
| van / lorry | almost | almost + | flat cab front |
| bus | almost | almost (strong) | ball passengers, blank windscreen |
| train | — | almost | pixel ballast, faceless passengers |
| boat (sailboat) | — | **not yet** | Lego crew, box cabin, flat sails |
| pedestrian | — | almost | flat single-colour clothes at 3 m |
| bin | almost | almost | (not re-framed at 10 m) |
| planter | almost | almost + | no soil visible |
| newsstand | not yet | almost | pixel-font mastheads, repeats, no vendor |
| phone box | almost | almost | still no phone inside |
| statue | almost | almost + | clean plinth steps |
| bench | real | real | — |
| bus stop | good | real | — |
| kiosk | not yet | almost | flat panels, no menu |
| playground | not yet | almost − | no fittings, pie-disc carousel |
| market stall | almost | almost + | flat awning, stiff vendor |
| gazebo | almost | almost | new white rails |
| tree | — | almost | bark not seen (framing); smooth trunk at the school |
| lamp | — | n/j | framing |
| kerb | — | real | — |
| flowerbed | — | almost + | uniform heads |
| cow | — | almost | flat dark coat |
| sheep | — | **not yet** | far LOD at 3 m (bug?) |
| tractor | — | almost − | opaque cab box |

**Summary:** 4 real (bench, bus stop, kerb; bike rack from judge 1), 25 almost and 3 not yet (school, sailboat, sheep).
Judge 1 had 2 real, 14 almost and 7 not yet out of 23. The objects have mostly arrived. What separates the town from
real now is **life in the places** (#1), the **primitive people inside vehicles** (#3), the **track bed** (#4),
**grass** (#5) and **wear on new-looking classes** (#8).
