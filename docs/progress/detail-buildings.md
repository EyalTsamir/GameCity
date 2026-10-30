# Detail round: buildings (`src/world/buildings*`, port 5201)

Branch `claude/detail-buildings-67bbbf`. Shared rules: `DETAIL-ROUND.md`. Switches: `src/core/detailbuildings.ts`,
`?nodetailb` all off, `?no<name>` one family.

## Resume here
Round 1 in progress. Done and committed: real lobbies (`lobby.ts`), ground-floor joinery, arcade soffits, facade relief,
glazed slant crown, roof membrane / pavers. Next: industrial wall services + dock seals, homes (side services, back
doors), perf measure (`perf.mjs --variants ";nodetailb"`), hitch, final checks, sheets in `docs/progress/detail/buildings/`.

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

## Best views
Lobbies: `38.8,2.2,-58,8,215,-3` (office 31) and Haven Tower `-27.5,2.2,-32.5,8,30,-3` at 18.2 and 21.5.
Slant crown: `-39.5,82,-97.5,110,-55,30`.

## Hand-offs
None yet.
