# Detail round: streets and ground level

Branch `claude/detail-streets-a131eb`, cut from pensive-gates 1643fe6. Shared rules: `DETAIL-ROUND.md`. Dev server
`npx vite --port 5203 --strictPort --host 127.0.0.1`; harness from the main checkout. For timing, build a frozen copy so
that edits cannot leak into a run: `npx vite build --outDir shots/ds/perfdist`, `npx vite preview --outDir shots/ds/perfdist
--port 5213 --strictPort --host 127.0.0.1`, then `perf.mjs --url http://127.0.0.1:5213/`.

## Resume here
Rounds 1-2 (ground, street kit, shop fronts, works) committed and measured within budget (see Perf, run 3). Seen by eye and
good: guard rails (52 after the placement fix), poster columns, fruit stand, clothes rail, sacks, cardboard, works. Tar fixed:
weathered grey, continuous strips (separate quads read as ant trails from afar), thinner overbanding, old digs a broken saw cut.

Next: golden-hour + night audit (`shots/ds/r3b`), independent judge on an image sheet, then the places items (lower-quay
waterline and coping: bed, weed fringe, fenders; cliff seams), plot edges (retaining walls, fences, hedges), mid-distance
check at 30-60 m, re-measure, final checks from `DETAIL-ROUND.md`, before/after sheets in `docs/progress/detail/streets/`, report.

Audit tool: `services.props.streetKit` lists every kit item `{k, x, z}` (scratch `kitpos.mjs`; note `wheelStop` reports the
last claim, not its own place). Shots in `shots/ds/`. When aiming at a shop item stand on the pavement side.

## Perf
Budget: at most +1 ms in overview, downtown, street, market; at most +250 k triangles in a full-city view.
Run 1, commit c6e94d9, frozen build, AC, `;nostreetdetail`, 2 repeats (market off: one outlier of 39.3 dropped):
| view | on ms | off ms | delta | triangles on / off |
|---|---|---|---|---|
| overview | 38.5, 37.6 | 37.9, 37.0 | +0.6 | 2.81-3.17 M / 2.75 M (noisy with the shadow fit) |
| street | 36.5, 36.2 | 35.1, 35.0 | +1.3 | 3.38-3.60 M / 3.26-3.48 M |
| market | 35.1, 35.2 | 34.1 | +1.1 | 3.36-3.49 M / 3.41 M |
| downtown | 37.4, 38.2 | 36.7, 36.8 | +1.1 | 3.41 M / 3.13-3.16 M (+260 k) |
Looked over budget, but this run and the per-family run 2 (street base 34.9, master off 33.1, families not additive) were
dominated by figures: pedestrians near the camera differ with the variant (the kit claims change their stream).
Run 3, commit 4f5757c, frozen build, AC, `hide=traffic,pedestrians` (so only static + ground), 3 repeats:
| view | base | master off | ground off (kerb, cover, junction, slabs, path) | kit off | shop, works, odds, parking off |
|---|---|---|---|---|---|
| street | 31.36, 31.34, 30.48 | 30.73, 30.63, 29.77 (+0.67) | 30.73, 30.72, 29.71 (-0.67) | 31.38, 31.38, 30.57 (0) | 31.23, 31.31, 30.36 (-0.1) |
| market | 29.16, 29.10, 28.21 | 28.65, 28.40, 27.80 (+0.5) | 28.89, 28.67, 27.86 (-0.35) | 29.00, 29.12, 28.22 (0) | 29.17, 28.99, 28.05 (-0.05) |
Within budget: all of the cost is the ground (hardscape vertices with their heavy format plus markings), the kit is effectively
free. Whole-city static triangles (`__city.stats()`): roads +64 k (kerb stones 36 k, cover kit 19 k), props +35 k, near cells
+28 k: about +127 k, half the budget. The triangle counter itself flips by 220 k between runs (shadow fit): never read it from
one sample.
**Measuring a static feature: use `hide=traffic,pedestrians`.** Without it the figures near the camera outweigh the feature.

## Toggles (`src/core/streetdetail.ts`, master `?nostreetdetail`, all off on low unless noted)
| switch | what | files |
|---|---|---|
| `?nokerbstones` | kerb as separate granite units: each proud and tilted its own way, worn arris, knocked corners; continuous kerb stays as a backing | `roads/streets.ts` |
| `?noliftedslabs` | slabs rocked on one edge or corner, root heave round street trees, on the shader's grid | `roads/paving.ts` |
| `?nojunctionwear` | junction box: rubber arcs, dust between wheels, oily middle, sealed crack map | `roads/glsl.ts` |
| `?nocoverkit` | manholes in a raised frame with a tar collar and the square of the old dig; tar snakes; valve boxes; telecom chambers; ghost stop lines | `roads/markings.ts` |
| `?nopathedge` | park paths: no dark wall; granite soldier course, skirt following the ground, soil bank with grass | `roads/covers.ts` |
| `?nosignalback` | signal heads from behind: galvanised plate, rails, conduit (additive edit in the people session's file) | `sim/traffic/signals.ts` |
| `?nostreetsigns` | regulation sign posts, printed faces, galvanised backs, sub-plates, stickers, locked bikes | `props/streetkit.ts`, `streetlife.ts` |
| `?nocabinets` | utility + signal-controller cabinets with tags and notices | same |
| `?noguardrails` | pedestrian guard rails on the approaches in the busy districts | same |
| `?nopostercolumn` | poster columns on the plazas with pasted bills | same |
| `?nopostnotices` | paper notices cable-tied to lamp posts (near only) | same |
| `?noshopfront` | doormats, cellar flaps, pavement lights, goods at the kerb (fruit, flowers, books, clothes, postcards) | same |
| `?noroadworks` | works sites in the furniture band: sand bed, slabs on a pallet, barriers, cones, sign | same |
| `?nokerbsideodds` | sacks and cardboard put out at the kerb | same |
| `?noparkingkit` | wheel stops, engine drips in the car parks | same |

Always on (bug fixes): pavement stain edge softened (it drew 2 m tan lenses with an outline), no standing water away from the
gutter on a dry road, tar overbanding less mirror-like. The print material now alpha-tests (round sign plates).

## Hand-offs
- **nature** (`groundcover/mask.ts`): pavement weeds at eye level are the loudest thing on the ground: blades too long and
  too wide, combs along every wall foot and kerb. A third of the length, thinner, mostly at joints.
- **light**: at eye level the shadow edge on paving shows a regular dither pattern.
- **people**: signal head fixings touched in `sim/traffic/signals.ts` (additive block, one line in the repeater).

## Log
- 2026-10-31 audit: 16 eye-level noon views (`shots/ds/a1`), own look. Ranked: 1 black outline round park paths; 2 blank
  junctions; 3 dead straight kerbs; 4 flat paving without any moved slab; 5 lens puddles and tan stains; 6 no utilities, signs
  or paper at street level; 7 signal backs; 8 nothing outside shop doors. Already done by earlier rounds and left alone: tree
  pits and grates, push buttons, kerb shader, litter.
