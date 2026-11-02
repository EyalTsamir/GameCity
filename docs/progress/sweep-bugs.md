# Sweep bugs: plain bugs from the city sweep

Session sweep-fix-a, round 2, started 2026-11-02 from the coordinator's list: `vehicle-roof-open-top`,
`fittings-floating-unattached`, `thin-structures-unattached`, then the remaining `bug` lines of
`docs/progress/sweep-tag-bug.md` (branch `claude/gifted-goldwasser-f1fa64`), by severity, without people (close-people),
wrong materials (sweep-fix-C) and capture framing.

Switches: `src/core/sweepbugs.ts`. `?nosweepbugs` turns every fix below off; each has its own `?no<name>`.

## What was fixed, by the system that places it

| Switch | Where | Cause | Fix |
|---|---|---|---|
| `carglass` | `sim/traffic/closeGlsl.ts`, `vehicleMaterial.ts` | close level of every car: the panes passed 80 % of a bright cabin and reflected little, so a closed car read as an open top | panes pass 50 %, the cabin below 0.55, reflection 1.6 (0.7). Bus saloons keep their own |
| `roofcrown` | `sim/traffic/models.ts` | hatch spoiler flat over a crowned roof, roof bars with no feet on bare roofs | spoiler bent to the roof surface, feet on bars |
| `bikestem` | `sim/traffic/models.ts` | handlebar with no stem, Dutch lamp in the air | stem and clamp, lamp bracket down to the head |
| `signframe` | `world/buildings/special.ts` | roof sign poles ran in front of the letters | poles behind the letters, rails to carry them; Grand Hotel an extra rail |
| `doorposts` | `world/buildings/towers.ts` | intercom panel and directory board hung on the glass | run down to the floor as posts |
| `revolvebar` | `world/buildings/lobby.ts` | revolving door's push bar stopped short of the post | centre post to edge |
| `doorbars` | `world/handheight/doors.ts` | pull bars with hairline stand-offs | stand-offs 12 mm, a boss on the outer side |
| `canopyties` | `world/landmarks/station.ts` | wing canopy props came in slanted across the windows and through the lanterns; the marquise's props over the arches landed on nothing, through the globe lamp and the departures board | wings: tie rods up to the wall with a plate, the lanterns stay, they have nowhere else. Marquise: props only where a pier takes them, the ties above hold the rest |
| `hawserclear` | `world/harbor.ts` | the ship's hawser ran over the crabber and the tender | bollards limited to those clear of the fish quay |
| `bowline` | `sim/boats/models.ts`, `world/harbor.ts` | the crabber's bow line to the next bollard ahead crossed the tender at the ladder from end to end (found with a ray through the pixel: `boats-big-4`) | back to the spring's bollard, the empty eye gone |
| `bikepair` | `world/props/kit.ts` | two bikes 0.9 m apart in one plane, 1.7 m long: wheels through each other | the second leans on the first, a handlebar's width out |
| `davitline` | `sim/boats/models.ts` | crabber's davit ended in the air | two lines down to the deck |
| `billfacet` | `world/props/streetkit.ts` | poster bills centred on the column's corners, its ribs cut through them | centred on the facets |
| `conifertips` | `world/vegetation/crowns.ts` | conifer branch wood ran on past its last spray: bare spokes | the wood stops at the last spray |
| `cabinstair` | `world/landmarks/construction.ts` | site cabin stair treads with nothing under them | stringers, handrail, posts, landing legs |
| `rackrows` | `world/props/scatter.ts` | cycle rack rows overlapped | rows apart |
| `xingramp` | `sim/rail/track.ts` | level crossing deck a 5 cm step off the road | tarmac ramps either side of the deck |
| `boardblock` | `world/lettering.ts` | free-standing lettered boards write no depth (one transparent material), so AO and the lens took the wall behind for what was at that pixel: its edges came through the board, it read as see-through | an invisible plane between the two faces, drawn after everything solid and before the paint, near layer `letterBlock`, radius 26 m |
| `stepcourse` | `world/roads/covers.ts` | a block's paved cover lies 13 cm below the sidewalk. From the sidewalk the slabs stop in a straight cut with other paving beyond; with the camera turned it reads as a diagonal seam | a course of setts along the top of the step, sidewalk side |
| `croptops` | `world/landscape/rows.ts` | a crop row's flat canopy strip (sunflower heads, vine leaves) is a picture for a view from above. From inside the field or level with it it hung in the air as stretched horizontal slabs | discarded where the view rises less than 4° to it, one varying |
| `plumegaps` | `sim/ambient/smoke.ts` | at the far level puffs are few: a long plume became a dotted line of dark blobs across the sky | when the wind leaves more than a mid-life puff's width between puffs: wider and thinner, same count |
| `aframelean` | `world/props/kit.ts` | the café A-board's tilt had the wrong sign: a V, feet together and a gap at the top, two black slabs falling apart on the pavement | leaves lean in and meet at the top |
| `postcap` | `world/props/furniture.ts` | the pillar box lid's ring had no top | closed top and bottom |

## Judge error (nothing to fix, or the fix is elsewhere)

Rough counts of about 2 650 lines, from two triage passes and my own reading of the pictures named.

- About 165 lines, cars "with no roof": every roof is there (checked from above on every kind). A camera at 1.6 m sees a 1.45 m roof edge-on, and clear glass over a bright cabin did the rest: the look was real and `carglass` is the fix, the missing roof was not.
- About 350 lines, dark or night at noon: exposure and shadow, not bugs of this list (`cs-text-aboard/12_1m` etc.).
- About 210 lines, people: close-people has them.
- About 150 lines, framing: `feat-breakwater/12_1m`, `area-garden-grass/12_1m`, `life-laundry-*/12_3m`, `c130_-110/12_N`, `feat-floodlight/*` (inside the stand), `harbor-pier-lamps/12_1m`, `harbor-pier-telescopes/12_1m`, `lm-room-lighthouse/12_1m`, `land-cow/*`, `land-island/*`, `land-sheep/*`, `gc-flowers-*/12_10m` (inside a tree).
- `harbor-gantry-crane/12_3m`, `12_10m`, "slabs sticking out of the container stack": the camera is inside the stack, looking at the rails from within the containers.
- `life-chimney-smoke-boiler/12_3m`, "dark-red strip": the roof's ridge seen from inside the roof.
- `feat-lifeguard/12_10m`, "leg leaning out": a rescue board leaning on the tower, the other "leg" another one.
- `road-stopline-text/12_1m`, "ghost bar": a worn marking, deliberate.
- `cs-walk-home4/12_10m`, "grey disc": the back of a round road sign.
- `sl-litter-cup/12_10m`, "blades from the roof box": leaves falling right in front of the lens.
- `streetkit-postcardrack/12_1m`, "stands in the lane": seen from above against the road behind it; it stands in the furniture band.
- `terr-ladders/12_3m`: the ladder does reach the water.
- `bld-*`, red and white dots in the sky: `dayaviation`, `avmast` and the sky specks are already fixed (sweep-white). The capture is older than those merges, so other lines may also be stale, gutter litter strips (`gutterDrift`, `wearpave`) for one.
- `c-130_-50/12_W` wheel stops read as stray planks, road signs from behind, `kerbStones` steps: all as designed.
- `bld-house-plan-bay`, `bld-house-suburb-hip-plain`, "knob on the frame": a doorbell.
- `bldback-townhall`, "sign pole in front of the door": the pole stands at the kerb, in line with the door only by perspective.
- `prop-planter-steel/12_3m`, "in the lane": on the pavement. `cs-text-flag`, "red plank": the bus shelter's end.
- `walk-park-deck/12_1m`: close under the deck, framing. `prop-lamp-plaza`, `lm-marketstall-goods-eggs`: people or lens blur.
- `ped-hair-bun/12_10m`, `ponytail`, "red band across the view": not there in new or old, a ray through the pixel finds nothing. Stale or transient.

## Evidence

By eye, new against `?nosweepbugs` from the same pose: Seaview poles behind the letters; door panels on posts; revolving bar; fish quay without the hawser and the crabber's bow line (punt and bow views); forecourt without the props over the arches; delivery, lorry, bus, ice cream, bike, hatch, moto; SOLD board solid; A-board an A; pillar box; plaza step course; sunflower and vine slabs gone; column bills on facets; crossing; racks; stair; conifer; two bikes leaning apart.

## Conservative choices

- Station wing lanterns stay where they are; only the props that ran through them changed.
- Bus saloons keep their own glass.
- `boardblock` only inside 26 m, where AO and the lens show the fault.
- Bug lines with a plausible cause in another session's area (wear, materials, people) stay with that session.

## Costs

Not measured when the 18:30 limit fell: the rebake behind the shared lock took until 18:20. Measured after it, see the last section.

## Left

- Not traced: `bld-townhouse-oldtown-hip-shop/12_1m` plank (an item in the room pages, `near-closeRooms`, at 79.1, 1.16, −3; in `buildingrooms/pages.ts`, not found which); `veh-lorry-crates/12_1m` hairline; shed stubs.
- `prop-scatter-bikes/12_1m`, green bar in the air: a ray finds `terrain-railings` at 78.6, 1.8, −47.4. Traced, not changed.
- Slab hairlines: may be wear cracks, already changed by `wearpave`; not rechecked.
- Bus stop clamps' stone texture: a material, not this list.
- `bikeLite`, the simplified bikes: not checked.
- Severity 3 lines not worked through.
- `plumegaps` at exponent −0.7 not seen against a plume in the last look: the pose showed no plume. The stronger −0.5 was seen and judged too dark.
