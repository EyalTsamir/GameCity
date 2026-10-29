# Judge 3 (fresh eyes) — 2026-10-29

Scope: the merged tree `claude/pensive-gates-bim12i` @ cade43c (F1–F4 closed). I judged against the REAL.md photo
tests at 11 h, compared with `real-judge-2.md`, and read no worker logs. All captures are 1600×900, software GL. The
lead time-boxed the run at 10:13 UTC: classes I did not reach are listed as **not judged** at the end. No new
captures were made after the stop.

Verdict scale: **real** = passes the photo test at 3 m and 10 m · **almost** = one or two things missing ·
**not yet** = still reads as a model at 3 m.

## Sheets (docs/progress/real/)
| sheet | contents |
|---|---|
| `judge3_facades.jpg` | house, townhouse, apartment, office/Café Nord, tower, warehouse, church, school |
| `judge3_vehicles_people.jpg` | car, bus, train track + cab, sailboat, tractor, crabber, pedestrian group |
| `judge3_places.jpg` | market (warmed), terrace, back yard, quay, site, platform at 10 m |
| `judge3_vs_judge2_places.jpg` | judge 2's places sheet beside mine |
| `judge3_furniture.jpg` | bin, bus stop, phone box, newsstand, fountain, statue, playground, kiosk |
| `judge3_bugs.jpg` | the harness ghost artifact before/after, plus each bug below |

Raw frames are in `shots/j3/{a,a2,b,c,d,places,verify}/` (not committed).

## Harness findings (read before the next judge)
1. **Placed people look like stippled ghosts unless you warm up.** `actors.ts` fades each actor by ±0.04 per
   *rendered frame*. Headless only renders on screenshots, so right after `setHours` the market, platform and stall
   vendors show as screen-door "ghosts" (12–24 % opaque). With 40 cheap 320×180 frames first, they are solid
   (`judge3_bugs.jpg`, first two tiles). Any capture of the places or actors needs ≥ 25 warm frames after a time
   jump. `shots/j3/places.mjs` does this. In the game this is a 0.4–1.3 s fade-in, so it is not a game bug. The fade
   is per frame rather than per second, though, so it depends on the frame rate.
2. **Bench framing faults are still common at 3 m.** In these the camera ends up ~6–8 m away or inside something:
   - house, lamp and tree all end up 6–8 m away;
   - lamp 10 m is inside a tree crown;
   - bin 10 m is inside a shop window;
   - bus 40 m is inside a tree;
   - crabber 40 m is inside the quay wall;
   - the free back-yard 40 m frame is blocked by a facade.
3. Each capture costs ≈ 2.8 min with 4 pump frames and ≈ 1.6 min with 2, so a full 3/10/40 run of all classes takes
   about 5 h here. Budget for that.

## Ranked findings (screen presence × how hard it breaks the illusion)
1. **Glass is the weakest material in the game now.**
   - Townhouse shop windows have no reflection at all and read as open holes.
   - The shop door is still two pale slabs with no handle.
   - Car side glass is hazy smoked plastic, with interior shapes as grey blobs.
   - Bus side glass is invisible, so the saloon reads as open-air.
   - The train cab windscreen is a flat black void with no reflection, driver or wipers.
   - The apartment panes repeat the same flat "poster" of a red car.

   The office/Café Nord glass shows that the good version already exists: street reflection mixed with a warm
   interior is convincing at 3 m.
2. **Pavement artifacts in every downtown street frame.**
   - A dashed shadow-acne line runs along the foot of every colonnade (tower and Café Nord, at 3 m and 10 m; still
     there from judge 2).
   - A long "barcode" of black vertical dashes runs along the downtown pavement (tree 3 m frame).
   - Wavy, wandering joint lines cross square slabs.
   - Old-town pavers are still one regular grid.
3. **Everything is still brand new.** Nothing shows wear:
   - the warehouse and factory doors and cladding;
   - the statue plinth, fountain bowls and gazebo;
   - the bus, train and tractor bodies (no road or field dirt);
   - the newsstand and mailbox paint;
   - the site hoarding, which has no posters.

   One new tell: soft dark soot "halos" pasted on the warehouse cladding around both doors.
4. **The platform is deserted whenever a train stands at it.** By design, group-1 passengers board while a train is in,
   so at 11:26 there is one traveller next to a full train. Real platforms have people getting off and lingering. The
   white info board on posts is still blank.
5. **The fountain on the civic square.**
   - The jets are glossy white glass tubes with bead ends.
   - The cascade is a frosted plastic skirt.
   - The basin is flat swimming-pool cyan with no ripple, reflection or depth.

   Next to the superb sea and pond water, it reads as a toy.
6. **The track bed.** The pixel mosaic is gone, and the ballast now has stones and the sleepers have clips. But the
   stones are a flat cobble/voronoi *paving* texture with no relief, and the bed is dead level with the sleeper tops.
   The cutting has a good strata + moss texture, but its geometry is still stacked slab ledges with straight edges.
7. **People at 3 m.**
   - Clothes are still one flat colour with no folds.
   - The pram is a faceted beige low-poly lump.
   - Family groups interpenetrate (a backpack merges into the next person).
   - On the terrace, a suited man's shirt front is a white jagged star or bib (clothing texture glitch).
   - The bus driver's arm hangs limp outside the seat.
   - At 10 m, crowds read well everywhere.
8. **Parked bikes at 3 m.** The bike in the rack has solid grey disc wheels inside thick 9–10-sided black polygon tyres,
   with no spokes or hub, on a thin gold frame. The bike beside the hydrant has real spoked wheels, so the rack bike is
   either a far LOD shown at 3 m or a separate crude model. This costs the bike rack its "real" from judge 1.
9. **Repeated or wrong interiors.**
   - Tower lobby: every pane shows the same leafy plant in the same pot at the same spot, plus the same coloured paper
     squares. The pixelated plant is fixed, but the repetition is not.
   - Café Nord: the interior is shelves of bottles and books, with no counter, coffee machine or tables. The terrace in
     front of the tower lobby still has no café front.
   - The shop seen from the bin-10 m frame is a flat mosaic of colour squares.
10. **Trees up close.**
    - Street-tree trunks are smooth dark cylinders with no bark at about 5 m (judge 2 item, unchanged).
    - From inside a crown (lamp 10 m), the branches are flat black shard cards and floating twig planes.
    - The back-yard tree is the exception: it has root flare and bark.

Also seen:
- **Church gablet:** the right raking moulding overshoots diagonally past the base cornice, as a stray rod
  (`judge3_bugs.jpg`).
- **Chimney smoke:** white cotton-ball puff chains crossing the tower (40 m) and around the brickworks.
- **Lens DOF at 3 m:** blurs the stall right in front of the camera in the market, so near detail is hidden.
- **Bus saloon:** the wheel-arch dome inside the saloon shows tyre texture (known open item).

## Classes
### Buildings
| class | J2 | J3 | what moved | still missing (distance) |
|---|---|---|---|---|
| house | almost+ | almost+ | porch posts with base and capital, plank deck, balusters, house no., handle, lamp | brick is flat with no relief; window flush (no reveal depth); glass dark and flat; porch roof plain slab; no letterbox; flower heads flat blobs (3 m) |
| townhouse | almost+ | almost+ | bakery interior with bread shelves, A-board, weeds in joints | door = 2 pale slabs, no handle; shop glass has no reflection; paving grid; A-board text is white bars |
| apartment | almost | almost+ | lawn strip has blades (felt gone); no bright rim in my frames | repeated "poster" reflections; mailbox is a black box; plinth is a smudge, not a course |
| office / shop | almost | almost+ | glass with street reflection + warm interior = convincing; CAFÉ NORD sign whole | colonnade acne line; no café interior; heavy black frames |
| tower | almost | almost | real leaf plants; per-pane curtain-wall tint at 40 m | same plant in every pane; hazy glass; acne line |
| warehouse | almost | almost | sign clear of the canopy | spotless yellow door; soot halos; canopy plain slab |
| factory | — | almost | roller shutter relief, sectional door, bollards, painted name | all clean; cotton-puff smoke |
| church | almost | almost+ | archivolts, rose tracery, gablet with trefoil, soot/green at the foot | door planks flat with no grain; ashlar clean above the foot; stretched texture on buttress sides; stray gablet rod |
| school | **not yet** | **almost** | noticeboard with notices, ALL VISITORS sign, intercom, pull handles, art + blinds | no railings, gate or bike stands; plain slab canopy; leaf litter as black flecks |

### Vehicles and boats
| class | J2 | J3 | moved | still missing |
|---|---|---|---|---|
| car | almost (strong) | almost | body mix, rails/box, handles, mirrors, plates; drivers now real people | smoked-plastic glass; some tyres still brown-dusty all over; flat flanks; car park a flat slab |
| bus | almost (strong) | almost (strong) | **real seated passengers** (balls gone) | invisible side glass; tyre arch in the saloon; limp driver arm; spotless; box mirror head |
| train | almost | almost | passengers on the platform (when no train) and in the saloon; ballast stones + clips; cutting texture | black-void cab glass, flat lamp discs; flat ballast; flat open-door aperture; flat red sheet with no seams |
| sailboat | **not yet** | **almost** | real crew, cabin with ports, stanchions + lifelines, teak cockpit, winch, sail seams | flat sails (no draft); plain hull; helm hand not on the tiller |
| crabber | (good) | almost | a fisher works the creels, another at the fish boxes | wheelhouse a clean white box; flat hull; mooring rope a fat clean hose |
| tractor | almost− | almost+ | glass cab with seat and driver | no mud; uniform glossy red; no steps |
| pedestrian | almost | almost | 10 m groups read as families | 3 m: flat clothes, crude pram, interpenetration, terrace bib glitch |

### Street furniture and park
| class | J2 | J3 | note |
|---|---|---|---|
| bench | real | **real** | — |
| bus stop | real | **real** | waiting people inside, timetable, poster |
| hydrant | — | **real** | caps, collar, base at 3 m |
| bin | almost | almost+ | lid, slot, door, LITTER plate, bolted base plate; only lacks wear/liner. 10 m not judged (framing) |
| bike rack | real (J1) | almost− | the polygon-wheel bike (#8) |
| planter | almost+ | almost+ | no soil visible, no stains |
| mailbox | — | almost+ | spotless; no plate or collection times |
| phone box | almost | almost+ | clear panes, bars, crown; phone not seen at this angle; the e-moped beside it is now a real scooter |
| newsstand | almost | almost+ | clean mastheads, 9 distinct titles; still a closed cabinet with no vendor |
| kiosk | almost | almost+ | hatch, coffee machine, cups, awning, bistro set; no menu or price board |
| statue | almost+ | almost+ | people stop and look; plinth still clean CG |
| gazebo | almost | almost | new white paint; plain soffit |
| playground | almost− | almost | kids on seesaw/swings; carousel is still a pie disc; no wear under the swings |
| fountain | — | almost− | #5 |
| market stall | almost+ | almost+ | jars, curtains, crates, scales, sagging patterned awnings; vendors present |
| tree | almost | almost | grate + weeds + leaves; smooth trunk; shard branches inside the crown |
| lamp | n/j | n/j | framing (from 8 m: cast post with fluted base, fine) |

## Dense places (11 h): would a visitor stop?
| place | J2 | J3 | why |
|---|---|---|---|
| **market** | 3 s | **yes** | Busy with about 40 shoppers browsing the aisles and stalls (warmed capture), vendors, sagging awnings, bunting, festoon lights, flower buckets, sack trucks. Remaining: the 3 m lens blur, a regular cobble grid, and no litter on the ground. |
| **café terrace** | yes | yes | About 16 guests in pairs, 2 waiters, cups and a dessert on the tables, parasols, festoon lights, a flower cart. Still in front of the tower lobby (same plant in every pane) with no café front, menu or A-frame. Guests are static. White bib glitch. |
| **harbour quay** | briefly | **yes** | The forklift now has a driver, a fisher works the creels and another the fish boxes; the crabber sits at the wall, with containers and gantries behind. Remaining: the ice store is a blank white box with 3 slots; the apron is clean pale concrete (no oil stains); the creel netting is a large printed diamond pattern. |
| **building site** | a glance | yes, briefly | Mud ruts and spoil, cones, cable drum, pipes, a hi-vis worker; at 40 m a concrete frame with starter bars, scaffold, crane, block pallets and a sand heap. Remaining: no machine (digger or mixer), clean hoarding, plain-cylinder pipes. |
| **station platform** | no | no (while a train stands) | Canopy, valance, the departure board with real times, and passengers in the saloon. But the platform empties whenever a train is in (#4), and the info board is blank. |
| **back yard** | no | almost | Laundry drapes with folds, pegs and sag; tree with root flare; water butt, watering can, broom, back door with lamp, picnic table. No floating slabs seen. The 40 m frame is blocked, so I did not see the enclosure. |
| night market 21.5 | — | **not judged** | stopped before capture |

## Not judged (time-box)
umbrellas, picnic, flagpole and jetty (captured, not reviewed); treebase, lampbase, kerb, fence, hedge, wall, sign,
signal, junction, parktree, flowerbed, wildflower, sheep, cow and farm (not captured); the bench place frames
(quaysea, siteyard, ballast, cutting, parklawn); actor close-ups; car and pedestrian picks 1–2; the night market at
21.5 h; lamp at 3 m (framing).

## Counts (classes judged: 32)
**3 real** (bench, bus stop, hydrant; kerb not re-judged), **29 almost**, **0 not yet**. Judge 2 had 4 real, 25 almost
and 3 not yet (school, sailboat, sheep).
- School and sailboat moved up to almost; sheep was not judged.
- Bike rack fell from real to almost− because of its parked bike.
- Places: market and quay are now "yes" (judge 2: 3 s and briefly); the platform is still "no" while a train stands.

The round fixed judge 2's top three:
- life in the places: the market, quay and site are peopled;
- primitive vehicle occupants: real drivers, passengers and crew;
- the pixel ballast: stones and clips.

What separates the town from real now is **materials and finish**: glass (#1), the pavement artifacts (#2) and wear
(#3). Those are on screen in nearly every street frame.
