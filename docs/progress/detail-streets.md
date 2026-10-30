# Detail round: streets and ground level

Branch `claude/detail-streets-a131eb`, cut from pensive-gates 1643fe6. Shared rules: `DETAIL-ROUND.md`. Dev server
`npx vite --port 5203 --strictPort --host 127.0.0.1`; harness from the main checkout. For timing, build a frozen copy so
that edits cannot leak into a run: `npx vite build --outDir shots/ds/perfdist`, `npx vite preview --outDir shots/ds/perfdist
--port 5213 --strictPort --host 127.0.0.1`, then `perf.mjs --url http://127.0.0.1:5213/`.

## Resume here
Round 1 (ground) and round 2 (street kit, shop fronts) committed. A perf A/B of commit c6e94d9 was started from a frozen
build (`shots/ds/perfdist`, port 5213, output `shots/ds/perf1`, `;nostreetdetail`, overview / street / market / downtown):
read its result, it does not yet include road works, parking kit, sacks, or the café / bakery / hardware goods.

NOT yet looked at by eye: road works, wheel stops, sacks, cardboard, locked bikes, guard rails (the count was 0 before the
check moved to the band centre: confirm it is > 0 now), bottle / bread crates, brooms, clothes rail after the fan fix, tar
snakes and stronger junction wear. Camera aiming: read `services.props.streetKit` with scratch `kitpos.mjs` (a page with
`only=terrain,landscape,roads,buildings,landmarks,harbor,vegetation,props,camera`, evaluate
`__city.ctx.services.props.streetKit`, group by `k`). When aiming at a shop item stand on the pavement side: several of
the first shots ended up inside shops.

Next after that: golden-hour + night audit (rule: noon, 18.2, 21.5), independent judge on an image sheet, then the places
items (lower-quay waterline and coping: bed, weed fringe, fenders; cliff seams), plot edges (retaining walls, fences,
hedges), mid-distance check at 30-60 m, re-measure, final checks from `DETAIL-ROUND.md`, before/after sheets in
`docs/progress/detail/streets/`, report.

Audit tool: `services.props.streetKit` lists every kit item `{k, x, z}` (read it in the page to aim the camera). Shots in
`shots/ds/`.

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
