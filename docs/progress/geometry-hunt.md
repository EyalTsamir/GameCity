# Geometry hunt — shape only: meshes, silhouettes, joints, ground contact, triangle efficiency

Branch `claude/geometry-hunt-506dcc` (cut from `claude/pensive-gates-bim12i` @ 078430f). Dev server
`npx vite --port 5191 --strictPort --host 127.0.0.1`; harness from the main checkout (shared lock):
`node C:/Projects/GameCity/scripts/<script>.mjs --url http://127.0.0.1:5191/ …`. The audit tool lives in this worktree:
`node scripts/geomaudit.mjs --harness C:/Projects/GameCity/scripts --url http://127.0.0.1:5191/ --out <abs path> [--census] [--tris "…"] [--drill "…"]`.
Switches: `src/core/geomhunt.ts`, `?nogeomhunt` = the old geometry, `?no<name>` one family (see "Toggles").

## Resume here
Round 1 (triangle efficiency) done and committed. Baseline → now in the table below. Next: visual audit (subagents) →
defects (track A), crude shapes (track B) paid for by the savings.

## Triangles per frame (all passes, 1920×1025, noon, `geomaudit --tris`)
| view | baseline 078430f | after round 1 |
|---|---|---|
| overview | 4.731 M, 251 dc | 3.168 M, 225 dc |
| street `5,1.5,-65,9,0,6` | 3.926 M, 220 dc | 3.452 M, 213 dc |
| downtown | 4.732 M, 238 dc | 3.424 M, 214 dc |
| harbor | 4.858 M, 248 dc | 3.476 M, 233 dc |

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

## Toggles
`?nogeomhunt` (all) · `?nomarketlod` · `?noshadowlod` · `?noboatsplit` · `?nofinecut`.
