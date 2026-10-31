# Detail round: streets and ground level

Branch `claude/detail-streets-a131eb`, cut from pensive-gates 1643fe6. Shared rules: `DETAIL-ROUND.md`. Dev server
`npx vite --port 5203 --strictPort --host 127.0.0.1`; harness from the main checkout. For timing, build a frozen copy so
that edits cannot leak into a run: `npx vite build --outDir shots/ds/perfdist`, `npx vite preview --outDir shots/ds/perfdist
--port 5213 --strictPort --host 127.0.0.1`, then `perf.mjs --url http://127.0.0.1:5213/`.

## Resume here
Five rounds done and committed; the ranked list has nothing left in these files worth its cost (see Left). Measured within
budget, final checks at the end of this file's Log. Nothing is merged or pushed.

Audit tool: `services.props.streetKit` lists every kit item `{k, x, z}` (scratch `kitpos.mjs`, a page with
`only=terrain,landscape,roads,buildings,landmarks,harbor,vegetation,props,camera`). Stand on the road side when aiming at a
kit item: goods turn their face to the pavement. Shots in `shots/ds/`. Sheets in `docs/progress/detail/streets/`.

## Best view for each thing
| what | view (`--view` / hour) |
|---|---|
| kerb stones, tar, cover in its collar | `-137,1,36,14,0,4` noon; `-128.7,0.2,-7,3,175,18` noon |
| road at 30-60 m (streaks, wheel paths, patches) | `-110,1.5,20,30,0,2` noon; `0,1.5,-92,30,0,1.5` noon, 18.2 |
| lower quay (tide stain, coping blocks, ladder, rubbing posts) | `-45,-1.2,114,8,25,8` noon, 18.2; `-30,-1,114,5,-20,4` noon |
| guard rail, sign backs | `-69,0.8,-68.9,6,30,12` noon |
| poster column | `-47,1.4,-77.3,6,30,6` noon, 18.2 |
| road works | `85.9,0.5,-6.1,5,-110,14` noon, 21.5 |
| bins out, bottle crates, sacks | `-128.7,0.6,-6.1,3.5,165,10`; `3.9,0.6,75.9,3,-70,10`; `20,0.3,-68.9,3,15,14` noon |
| park path edge | `-58,0.3,20,12,30,8` noon |

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
Run 4, final, commit 5c81e25, frozen build, AC under power-guard, `hide=traffic,pedestrians`, `;nostreetdetail`, 3 repeats:
| view | on ms | off ms | delta | triangles on / off, same shadow state |
|---|---|---|---|---|
| overview | 34.19, 34.82, 34.49 | 33.60, 34.11, 34.30 | +0.50 | 2.84 / 2.77 M (+77 k) |
| downtown | 34.61, 34.82, 34.66 | 33.80, 33.99, 33.79 | +0.84 | 3.17 / 3.05 M (+118 k) |
| street | 31.48, 31.48, 31.44 | 30.77, 30.73, 30.82 | +0.70 | 3.23 / 3.12 M (+103 k) |
| market | 29.29, 29.24, 29.31 | 28.76, 28.78, 28.79 | +0.50 | 3.01 / 2.91 M (+101 k) |
Within budget in all four. The on and off rows are paired by draw call count so that both have the same shadow fit.
**Measuring a static feature: use `hide=traffic,pedestrians`.** Without it the figures near the camera outweigh the feature.

## Toggles (`src/core/streetdetail.ts`, master `?nostreetdetail`, all off on low unless noted)
| switch | what | files |
|---|---|---|
| `?nokerbstones` | kerb as separate granite units: each proud and tilted its own way, worn arris, knocked corners; continuous kerb stays as a backing | `roads/streets.ts` |
| `?noliftedslabs` | slabs rocked on one edge or corner, root heave round street trees, on the shader's grid | `roads/paving.ts` |
| `?nojunctionwear` | junction box: rubber arcs, dust between wheels, oily middle; also long streaks, stronger wheel paths, grimier gutter, more trench scars on all road | `roads/glsl.ts` |
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
| `?nokerbsideodds` | sacks and cardboard at the kerb, wheelie bins on residential streets | same |
| `?noparkingkit` | wheel stops, engine drips in the car parks | same |
| `?nogutterdrift` | grit, leaves, butts and scraps against the kerb, near cells only (+18 k triangles in all, drawn within 30 m) | same |
| `?noquaywear` | lower quay: water face in stacked tide tones, coping as separate blocks with knocked corners, rust, iron ladders, tarred rubbing posts | `terrain/places.ts` |

Always on (bug fixes): cracks and overbanding thinner and greyer, more road patches, cutting wall foot in stacked tones instead of a straight band, pilasters shallower, weather across ashlar at the scale of metres, pavement stain edge softened (it drew 2 m tan lenses with an outline), no standing water away from the
gutter on a dry road, tar overbanding less mirror-like. The print material now alpha-tests (round sign plates).

## Hand-offs
- **nature** (`groundcover/mask.ts`): pavement weeds at eye level are the loudest thing on the ground: blades too long and
  too wide, combs along every wall foot and kerb. A third of the length, thinner, mostly at joints. Both judges also saw the
  razor-straight edge between pavement and lawn: grass should lap over it.
- **light**: at eye level the shadow edge on paving shows a regular dither pattern.
- **people**: signal head fixings touched in `sim/traffic/signals.ts` (additive block, one line in the repeater). Market
  stalls under their evening tarps read as lumpy blobs in `27.5,1,78.5,16,200,28` at 18.2 (`sim/scenes/market.ts`).
- **water**: a sharp-edged teal shape on the river surface off the lower quay, `-45,-1.2,114,8,25,8` at noon.

## Left, not worth its cost here
- Cliff lobes above the cutting wall (`-20,1.8,-162,14,25,6`) read as sculpted at 8 m: geometry work, far from most walks.
- Black side faces on the cutting-wall pilasters: cause not found (plain dressing quads came out black too), made narrow by
  making the pilasters shallower.
- Wet-band tones on the quay show fine steps at under 5 m: invisible from the promenade.

## Log
- 2026-10-31 audit: 16 eye-level noon views (`shots/ds/a1`), own look. Ranked: 1 black outline round park paths; 2 blank
  junctions; 3 dead straight kerbs; 4 flat paving without any moved slab; 5 lens puddles and tan stains; 6 no utilities, signs
  or paper at street level; 7 signal backs; 8 nothing outside shop doors. Already done by earlier rounds and left alone: tree
  pits and grates, push buttons, kerb shader, litter.
- 2026-10-31 rounds 2-5. Kit first looked over budget (+1.8 ms street): figures, see Perf. Guard rails placed nothing until
  they searched the kerb for a free run. Shop goods slide along the kerb (8 items to 20). Judge 1 (6.5/10): clean asphalt, ant
  trails on the junction, works with no trench. Ant trails took four attempts: strips, footprint fade, dissolve, then the cause:
  a sliver's derivatives faded its long triangles to the pale base and left its short ones dark; hairlines now skip that fade and
  stop at a pixel. Judge 2 (6.5/10, with weeds and facades out of scope): gutters and carriageway too clean: gutter drift, grimier
  band, more trench scars.
- 2026-10-31 final checks on 5c81e25: typecheck and build clean (4.1 MB single file). Invariants `{}`, validate `[]`, no console
  errors (7 D3D compile warnings from rail, boats, landscape, buildings and postfx shaders, none from these files). `hitch.mjs`: prog+0 geo+0 tex+0 in every window. `ui-test.mjs --q noidle`: 71 passed, 0 failed. `?diorama`,
  `?quality=medium`, `?quality=low`: no errors, street view looked at. Opening film looked at (seek sheet; the dark frame at 45 s is the dip between shots). Perf run 4 above.
