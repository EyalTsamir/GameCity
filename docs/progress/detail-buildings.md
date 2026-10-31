# Detail round: buildings (`src/world/buildings*`, port 5201)

Branch `claude/detail-buildings-67bbbf`. Shared rules: `DETAIL-ROUND.md`. Switches: `src/core/detailbuildings.ts`,
`?nodetailb` all off, `?no<name>` one family.

## Resume here
Round 1 and a short round 2 committed. Round 2: every tower side a shop of its own (blank cream panes gone, under `?nogroundfit`), party walls, Grand Hotel foyer.
Checks on f5da77b: perf below, hitch prog+0 geo+0 freeze 0 (overview, downtown, hotel x 12, 21.5), invariants `{}`, validate `[]`, ui-test 70 passed
+ `kinds` alone 1/1, build 4.09 MB, opening film sheet looks right (`--mode seek`, no building out of place), sheet `detail/buildings/round1_before_after.jpg`.
Next round, ranked: house repetition (owners), apartment entrances, Seaview hotel foyer, kiosk slab. Blocked: L-shaped hall (footprint rule forbids docks and annexes outside the lot).
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
| Hotel foyer | `?nolobby3d` | Grand Hotel: deco palette, revolving door, its name on the wall, behind the marquee | |

Also: sign atlas height 1024 → 1280 (always on), new mesh `buildings-glass`, `Gen.glass`.

## Cost (`perf.mjs`, 1920x1025, noon, `;nodetailb`, 2 repeats, power guard: on AC throughout)
| view | on (ms) | `?nodetailb` (ms) | change | triangles |
|---|---|---|---|---|
| overview | 36.94, 36.75 | 36.70, 36.65 | +0.2 | +88 k |
| downtown | 36.09, 35.90 | 36.07, 36.12 | -0.1 | +87 k |
| street `5,1.5,-65,9,0,6` | 33.53, 33.29 | 34.49, 34.55 | **-1.1** (real lobby pixels replace facade pixels) | +120 k (LOD state varies between passes) |
| market `27.5,1,78.5,16,200,28` | 33.14, 32.98 | 33.18, 33.29 | -0.2 | +15 k |

Final code, f5da77b. Within budget (+1 ms, +250 k). Draw calls +1 (glass) on most views.

## Best views
Lobbies: `38.8,2.2,-58,8,215,-3` (office 31) and Haven Tower `-27.5,2.2,-32.5,8,30,-3` at 18.2 and 21.5.
Slant crown: `-39.5,82,-97.5,110,-55,30`.

## Hand-offs
None yet.
