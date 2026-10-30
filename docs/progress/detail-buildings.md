# Detail round: buildings (`src/world/buildings*`, port 5201)

Branch `claude/detail-buildings-67bbbf`. Shared rules: `DETAIL-ROUND.md`. Switches: `src/core/detailbuildings.ts`,
`?nodetailb` all off, `?no<name>` one family.

## Resume here
Round 1 built and committed up to 024b4e7. Perf A/B (`;nodetailb`, 4 views, 2 repeats) is running: output in the session
scratchpad `perf1/out.txt`. Then: verify awnings and sawtooth by eye, invariants must be `{}` again (the sign atlas
overflow is fixed by SIZE_H 1280, recheck), hitch, final checks of DETAIL-ROUND.md, before/after sheet in
`docs/progress/detail/buildings/`, a fresh audit for round 2. Round-2 ideas: houses' repetition (owners), party walls, apartment
entrances, kiosk slab, L-shaped hall. Watch: heredocs over ~7 KB are cut by the Bash tool, write patch scripts with Write.

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

Also: sign atlas height 1024 → 1280 (always on), new mesh `buildings-glass`, `Gen.glass`.

## Cost (`perf.mjs`, 1920x1025, noon, `;nodetailb`, 2 repeats, power guard: on AC throughout)
| view | on (ms) | `?nodetailb` (ms) | change | triangles |
|---|---|---|---|---|
| overview | 37.71, 37.05 | 37.32, 36.70 | +0.4 | +84 k |
| downtown | 36.16, 36.39 | 36.17, 36.23 | +0.1 | +85 k |
| street `5,1.5,-65,9,0,6` | 33.56, 33.57 | 34.61, 34.51 | **-1.0** (real lobby pixels replace facade pixels) | +117 k (first pass read +347 k, a different LOD state) |
| market `27.5,1,78.5,16,200,28` | 33.35, 33.38 | 33.33, 33.36 | 0 | ~+40 k (first pass +183 k) |

Within budget (+1 ms, +250 k). Draw calls +1 (glass) on most views.

## Best views
Lobbies: `38.8,2.2,-58,8,215,-3` (office 31) and Haven Tower `-27.5,2.2,-32.5,8,30,-3` at 18.2 and 21.5.
Slant crown: `-39.5,82,-97.5,110,-55,30`.

## Hand-offs
None yet.
