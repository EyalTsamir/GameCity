# Geometry hunt — shape only: meshes, silhouettes, joints, ground contact, triangle efficiency

Branch `claude/geometry-hunt-506dcc` (cut from `claude/pensive-gates-bim12i` @ 078430f). Dev server
`npx vite --port 5191 --strictPort --host 127.0.0.1`; harness from the main checkout (shared lock):
`node C:/Projects/GameCity/scripts/<script>.mjs --url http://127.0.0.1:5191/ …`. The audit tool lives in this worktree:
`node scripts/geomaudit.mjs --harness C:/Projects/GameCity/scripts --url http://127.0.0.1:5191/ --out <abs path> [--census] [--tris "…"] [--drill "…"]`.
Switches: `src/core/geomhunt.ts`, `?nogeomhunt` = the old geometry, `?no<name>` one family (see "Toggles").

## Resume here
Rounds 1 (triangle efficiency), 2 (visual audit, defects) and 3 (hidden triangles, crude shapes) committed. Next, if anyone continues: the open
lines of "Ranked findings" and "Left for later". Before / after: `docs/progress/geometry/round2_before_after.jpg`.

## Triangles per frame (all passes, 1920×1025, noon, `geomaudit --tris`)
| view | baseline 078430f | after round 1 | final |
|---|---|---|---|
| overview | 4.731 M, 251 dc | 3.168 M, 225 dc | **3.133 M, 225 dc** |
| street `5,1.5,-65,9,0,6` | 3.926 M, 220 dc | 3.452 M, 213 dc | **3.409 M, 213 dc** |
| downtown | 4.732 M, 238 dc | 3.424 M, 214 dc | **3.379 M, 214 dc** |
| harbor | 4.858 M, 248 dc | 3.476 M, 233 dc | **3.435 M, 233 dc** |
| stadium | 4.343 M (mid round 1) | 4.092 M, 263 dc | **4.050 M, 264 dc** |

Everything added for shape (lunettes, plates, edge boards, turned bollards) is included: net −1.6 M overview, −0.5 M street, −1.35 M downtown, −1.4 M harbor.

## Perf (`perf.mjs`, 1920×1025, noon, `?nogeomhunt` → on, two repeats, siblings sharing the machine; measured just before the last correction of #6, +16 k triangles)
| view | off | on | gain | g_shadow off → on |
|---|---|---|---|---|
| overview | 50.4 ms | 48.2 ms | −2.2 ms | 2.4 → 0.9 |
| street | 47.3 ms | 46.7 ms | −0.5 ms | 2.8 → 2.6 |
| downtown | 58.3 ms | 53.5 ms | −4.8 ms | 2.2 → 1.3 |
| harbor | 51.6 ms | 47.8 ms | −3.8 ms | 2.4 → 1.35 |

`?nogeomhunt` still keeps the always-on bug fixes (cells that never culled), so street "off" is below the true baseline.

## Audit counts (`geomaudit`, whole city)
| | baseline | final |
|---|---|---|
| degenerate | 23511 | 5457 (in meshes the pass leaves alone) |
| ground-contact bottoms | 12714 | 2395 |
| back-to-back coincident | 58793 | 16550 |
| flipped without a twin | 4356 (a3) | 2555 |
| floating parts | 1138 | 1012 (ships, birds, aircraft and pier gear by far the most) |
| sunk parts | 1730 | 1729 (tunnel veils, piles, bridge piers: no visible case found) |
| buried triangles | 27124 (a3) | 26822, deliberately left: see #6 |

Verification: typecheck clean, build OK, `invariants {}`, `validate []`, `hitch` prog +0, `ui-test` 54/54, console clean.

Roughly half of the frame's triangles were the shadow pass (one 2048² map fitted around the camera focus: 181 m wide at
street level, 1825 m at the overview).

## The audit tool (`scripts/geomaudit.mjs`)
Walks the live scene (modules are tagged in main.ts: `userData.module`). Output `<out>.json` + `<out>.md`:
- per mesh: triangles × instances, shadow caster flag, degenerate, sliver, flipped (winding against the vertex normals,
  without a coincident twin: two-sided panels are fine), coincident triangles same winding (z-fight) / opposite winding
  (internal or two-sided), buried (≥ 8 cm under `terrain.height`; ground and water sheets excluded), bottom (facing down
  on the ground);
- per connected part (welded at 1 cm), city-wide: floating (no ground and no other part within 3 cm), sunk, inside a
  building footprint (occupancy grid);
- `--census`: renders every static mesh with triangle ids from pedestrian nodes, lanes, POI fly-overs and an aerial grid,
  then reports per mesh and per part family what was never rasterised (`--census-points`, `--census-spacing`,
  `--census-res`, `--census-skip`). Coverage is only as dense as the ped nodes: "never seen" near the market or the track
  means "no node there", check before deleting;
- `--drill <regex>`: what a merged mesh is made of (families of connected parts by triangle count + size, with positions);
  this found the market;
- `--tris "<views>" [--shadow-list]`: triangles and draw calls per view, the shadow pass's casters and map area.

Baseline output: `docs/progress/geometry/audit_baseline.md`.

## Fixes (triangles saved are for full-city views, all passes)
| # | what | saved | switch | files |
|---|---|---|---|---|
| 1 | **Market stalls**: 20 stalls were half a million triangles (static 190 k, cast shadows, detail 322 k): table cloth on a 3 cm grid (4736 tris each), back drape 3536, 90-triangle plums, 22-box crates, 12-triangle dial ticks. Domes for what lies in a heap (35 tris; the bottom layer 15), olives 8, cloth grids 32×6 / 36×4 with non-uniform rows, no cloth rims, crates as quads over a dark core (50 tris, 264 before), own detail mesh (it was drawn whenever anything in the 150 m cell was near) | −330 k overview / −670 k downtown, market view −550 k | `?nomarketlod` | `landmarks/civic.ts`, `sculpt.ts` (`shell` rims), `kit.ts` (`cylOn`), `env.ts` (`ownDetail`), `landmarks.ts` |
| 2 | **Shadow pass LOD**: casters whose parts are thinner than a couple of texels stop casting once the fit is coarse (0.2 m/texel: trim, signal poles, props, rail furniture, bikes, railings, life; 0.42 m/texel: cars, small craft, kinetic parts, harbour kit, farm life). Compared at overview, downtown, harbour, old town, stadium, mid-height: no visible change | −0.9 M overview, −0.5 M downtown / harbour, also −20–40 draw calls | `?noshadowlod` | `render/shadowLod.ts`, `main.ts` |
| 3 | **Boats per type**: `boats-big` / `boats-small` were one merged geometry per pool: every boat drew the vertices of all four types and collapsed three in the shader (ferry 30 k for a 10 k boat). One instanced mesh per type | −300 k harbour / overview | `?noboatsplit` | `sim/boats/{models,render}.ts` |
| 4 | **Bug: split cells never culled.** `splitByCells` called `computeBoundingBox()` on geometries sharing the whole position buffer, so every 120 m cell had the city's box and was drawn in every view | −300 k street, −12 dc | always | `props/layout.ts` |
| 5 | **Fine furniture / plants cut by distance**: 240 m (benches, bins, racks: a dozen pixels and hidden by traffic), plants split into 150 m cells, 180 m | included in #4 | `?nofinecut` | `props.ts`, `vegetation.ts` |
| 6 | **Hidden triangle pass at boot**: one walk over the finished static meshes drops degenerate triangles and faces looking down on the ground they stand on. Index only. **Not "buried"**: `terrain.height` is the walking surface, so tunnel linings and the stair wall counted as under ground and A/B showed daylight through the tunnels. Pixel-identical in 10 views at `speed=0` after that (footbridge and pier from the water, tunnel mouths, stairs, market, fountain, station) | −27 k | `?nohiddencull` | `render/geomCull.ts`, `main.ts` |
| 7 | **The field tractor** was 52 k triangles for one object: 300 per small rounded box, wheels with 132 / 96 stations and 3 extra tread rows. Box segments 1, 4 stations per lug, tread 2 | about −25 k | `?notractorlod` | `landscape/tractor.ts` |
| 8 | Anchor bolts 6 → 4 sides | −5 k | always | `props/shapes.ts` |

## Ranked findings (round 2 visual audit: 161 close-ups, four judges; every line checked against the image and the code)
"False" = the judge's claim did not survive a look at full resolution. Rank = how often and how large it is on screen.
| rank | what | track | where | status |
|---|---|---|---|---|
| 1 | Open back on gable dormers: ridge stops short of the main slope, under 45° a white arrow stands on the roof | A | `buildings/{homes,houses,oldtown}.ts` | **fixed** |
| 2 | Armour stones at the waterline read as plates lying on the water, knife-edged facets everywhere | A/B | `harbor/geo.ts stone` | **fixed** `?noarmoursoft` |
| 3 | "HAVEN BRICKWORKS" letters hang across the window heads | A | `buildings/industry.ts` | **fixed** `?nobrickboard` |
| 4 | Square bollards at the lower quay and the station forecourt | B | `terrain/places.ts` | **fixed** `?noroundiron` |
| 5 | Tree trunks "4-5 sided" | B | judges 4 | false: ≥ 8 sides with flare and bark, dark side reads flat |
| 6 | Kerb-ramp wedge, ramp handrail in mid-air, picket gate | A | judge 4 | false: correct shapes, confusing perspective through a fence |
| 7 | Serrated fringe on stone reveals | A | judge 3 | not geometry (half-res AO / shadow edge on the smooth reveal): out of scope |
| 8 | Harbour stairs: dark slot beside the treads, the flight stood 30 cm off the sea wall (the open item) | A | `terrain/places.ts` | **fixed** |
| 9 | Barrel sheds: "lunette" was a bare dark rectangle on the end wall | A/B | `buildings/industry.ts` | **fixed** `?nolunette` |
| 10 | Door and dock canopies: slabs hanging from nothing | B | `buildings/industry.ts` | **fixed** `?nocanopyplates` |
| 11 | Boardwalk: razor-sharp slab edge | B | `roads/covers.ts` | **fixed** `?nodecklip` |
| 12 | Gambrel dormers: ridge through the upper slope | A | `buildings/homes.ts` | **fixed** |
| 13 | Hedges: lumpy slab on a dark foot | B | `veg-plants` | by design (woody foot, clipped body), left |
| 14 | Beach umbrella 12-gon with a sharp rib | B | `harbor/beach.ts` | open |
| 15 | Stadium aisle blocks, "straight" station palm | B | false at full size: stepped aisles read as steps; a Washingtonia is that straight | - |
| 16 | Rock plates on the rail-portal slope; hard black V joints between cliff blocks (harbour view) | A/B | `terrain/cliffs.ts` | open |
| 17 | Kiosks: plain box under a knife-edged slab | B | `buildings` | open |

## Toggles
`?nogeomhunt` (all) · `?nomarketlod` · `?noshadowlod` · `?noboatsplit` · `?nofinecut` · `?nohiddencull` · `?notractorlod` · `?noarmoursoft` · `?nobrickboard` · `?noroundiron` · `?nolunette` · `?nocanopyplates` · `?nodecklip`.

## Hand-offs (not touched: other sessions own these)
- `src/sim/pedestrians/`: `peds-tiny` costs 98–200 k triangles in the frame, a far LOD would pay.
- `src/world/life/`: `life-night-market` tents are 728 triangles each; `life-cloth` 91 k.
- `src/sim/ambient/`: `ambient-vehicles` 612 flipped triangles, waterfowl (swans) are smooth blobs without wing or tail.

## Left for later
- `terrain-ground` ~20 k up-facing triangles under buildings: not removed, pilotis, arcades and the stadium make a blanket cut wrong; needs a per-lot-kind list.
- Station bike racks: about 60 k in `props-furniture-fine` (spoked wheels 180–230 triangles), a far wheel would halve it.
- `harbor-north` 27 k never seen (stacked containers' inner faces): only the box-level census says so, check before cutting.
- Vite's watcher can miss an edit under load: curl the served module when a change seems to have no effect (this hid the #6 correction through one A/B).
- Fine-cut pop (`?nofinecut`, 240 m / 180 m) not checked on a long avenue at eye level: benches and flowers can appear at that distance.
