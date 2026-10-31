# Detail round: buildings (`src/world/buildings*`, port 5201)

Branch `claude/detail-buildings-67bbbf`. Shared rules: `DETAIL-ROUND.md`. Switches: `src/core/detailbuildings.ts`,
`?nodetailb` all off, `?no<name>` one family.

## Resume here
Rounds 1 to 3 committed. Round 2: every tower side a shop of its own (blank cream panes gone, under `?nogroundfit`), party walls, Grand Hotel foyer. Round 3: owner marks on the 26 houses, real kiosk interiors, Seaview foyer.
Checks on 7b78d73: perf below, hitch prog+0 geo+0 freeze 0, invariants `{}`, validate `[]`, diorama and quality medium / low clean, ui-test 70 passed
+ `kinds` alone (known flake), build, opening film sheet looks right (`--mode seek`).
Round 3 audit also looked at townhouses (rich already: shops, awnings, shutters, plinths), schools, harbour master, boathouse, depot from eye level and low flight: nothing there beat its cost. Only 2 apartment lots, so their entrances stay as they are. Blocked: L-shaped hall (footprint rule forbids docks and annexes outside the lot).
Heredocs over ~7 KB are cut by the Bash tool: write patch scripts with Write.

## Audit (round 1, 84 views at noon: eye level, 45 m air, back; own look)
Ranked by wow per ms: 1 identical blank office / tower ground floors; 2 slant crown a bare blue plane from the air; 3 flat
ribbon and curtain facades at eye level; 4 flat tower roofs; 5 sheds: long blank cladding, no services; 6 houses: plain
back and side walls; 7 factory roof bare from the air.

## What was added
| family | switch | what | cost |
|---|---|---|---|
| Real lobbies | `?nolobby3d` | front of every tower and office: a real room behind real glass (one new thin glass program, `buildings-glass`). Room is unlit geometry in the existing `lights` mesh with lighting baked in vertex colours: tiled floor with light pools, stone wall, feature wall with the firm's name, desk, lift bank, speed gates, columns, sofa, plants, art. Four palettes; revolving door on towers over 60 m; four canopies (steel blade, glass, bronze marquee, stone portal) | see below |
| Ground-floor joinery | `?nogroundfit` | stall riser + cap, real mullions, transom, head rail, up-down lights on the shader bays; arcade soffit beams and lanterns | |
| Facade relief | `?nofacadedepth` | curtain walls: pressure caps on every mullion, floor rails. Ribbons: sill nosing, sun shelf on brackets (2 of 3 sides) | |
| Roofscape | `?noroofscape` | slant crown: rafters, purlins, gutter, ridge cap, cat ladder, cradle and track, rail. Tower roofs: membrane strips, patches, pavers, drains, lightning rods | |
| Wall services | `?noservices` | sheds: dock seals, bumpers, chevrons, stencilled bay numbers, conduit, switch cabinets, extract louvres + stains, fire points, risers. Homes: meter boxes, hose reel, soil stack with branches, vents with stains | |
| Sawtooth + awnings | `?noroofscape`, `?noawnings` | sawtooth: standing seams, ridge capping, glazing bars. Apartments: striped drop-arm awnings on 16 % of balconies | |
| Party walls | `?nopartywalls` | above a lower neighbour: chimney breast, iron tie plates with rust runs, scar of a vanished neighbour's gable, bricked-up window or a render repair | |
| Hotel foyers | `?nolobby3d` | Grand Hotel: deco palette, revolving door, its name on the wall, behind the marquee. Seaview: glass doors, its name, under the teal canopy | |
| Owner marks | `?noowners` | houses: fish-scale, half-timber or board-and-batten gables, corner boards, stone quoins, brick dentils, roof windows, vent pipes, weather vanes, aerials, dishes, a hoop over the garage, hanging baskets, water butts, pots by the door, a rose on the front | |
| Kiosks | `?nokiosks` | the hatch of both kiosks opens into a real room with a keeper: magazines on three shelves, coffee machine, stacks of papers and street bills; ice-cream tubs under a sneeze glass, cones, a menu board | |

Also: sign atlas height 1024 → 1280 (always on), new mesh `buildings-glass`, `Gen.glass`.

## Cost (`perf.mjs`, 1920x1025, noon, `;nodetailb`, 2 repeats, power guard: on AC throughout)
Final code, 7b78d73. Two runs with the order swapped (on first, then off first), two passes each; change = mean on - mean off. Noise between passes of one variant is up to ±1 ms, so read the whole frame as a range. `g_scene` is the GPU timer of the scene pass, the steadier figure (mean of all four passes per variant).
| view | run 1 on (ms) | run 1 off | change | run 2 on | run 2 off | change | `g_scene` change | triangles |
|---|---|---|---|---|---|---|---|---|
| overview | 36.79, 35.61 | 35.57, 35.51 | +0.66 | 37.94, 36.86 | 37.31, 36.69 | +0.40 | +0.56 | +107 k |
| downtown | 36.32, 35.03 | 35.00, 35.14 | +0.61 | 36.24, 37.19 | 36.31, 36.34 | +0.39 | 0 | +96 k |
| street `5,1.5,-65,9,0,6` | 33.73, 32.41 | 33.54, 33.53 | -0.47 | 34.03, 36.05 | 34.88, 35.08 | +0.06 | **-1.3** (real lobby pixels replace facade pixels) | +120 to +165 k |
| market `27.5,1,78.5,16,200,28` | 32.25, 32.09 | 32.13, 34.01 | -0.90 (the 34.01 is an outlier) | 33.10, 33.27 | 33.37, 33.35 | -0.18 | 0 | +40 to +68 k |

Within budget (+1 ms, +250 k) on the means; no run mean reaches +1 ms. 107 k static triangles at 400 k/ms predict about +0.27 ms at overview. Draw calls +1 (glass). The street gain is clear in `g_scene` (-1.35, -1.25 per run) and only partly reaches the whole frame.
Hitch on the final code: prog+0 geo+0 freeze 0 (overview, downtown, kiosk, houses x 12, 21.5).

Reading `stats()` triangles: the value is the last frame's, and only some frames run the water reflection pass. At overview that frame has +363 k triangles and +28 draws (3.23 M / 238 on, 3.12 M / 237 off, against 2.87 M / 210 and 2.76 M / 209), seen in both variants. A hook on `renderBufferDirect` shows all of it in the 427x240 target: harbour, land, boats, 12 shell chunks; nothing here adds to it. Compare frames of the same kind by draw count, or a single reading can look like +470 k. The earlier note that this was an LOD state was wrong.

## Best views
Lobbies: `38.8,2.2,-58,8,215,-3` (office 31) and Haven Tower `-27.5,2.2,-32.5,8,30,-3` at 18.2 and 21.5.
Slant crown: `-39.5,82,-97.5,110,-55,30`.
News kiosk: `-31,1.7,-129.5,4,-15,0` (day and 21.5). Ice cream: `117.1,1.7,22.5,4,-105,0`. Seaview foyer: `103.5,2.2,17.5,8,110,-2`.
Owner marks: shingled gable, quoins and dentils on house 4 `-153.2,3,1.7,12,200,8`; low flight `-153.2,5,6.2,34,210,28`.
Sheets: `detail/buildings/round1_before_after.jpg`, `detail/buildings/round3_before_after.jpg`.

## Hand-offs
All sessions: `triangles` and `drawCalls` in a `perf.mjs` table flip with the reflection pass (see Cost); this reads like a variant difference when it is not. `shot.mjs --eval` runs before the view has rendered, so `stats()` read inside it describes the previous view: use `--stats`.
Props / ground cover: the footprint rule keeps kiosk goods inside the lot, so a newspaper stand, stools at the ice-cream counter and a cone sign on the pavement are theirs if wanted. Same for water butts and mailboxes in the gardens of houses whose walls sit on the footprint edge.
