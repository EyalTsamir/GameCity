# world-wear — weathering and lived-in clutter (world round)

## Resume here
* M1 DONE (services live, typecheck clean, invariants {}, lead messaged). Verification dump:
  shots/world/wear/m1_eval.json (counts: chimneys 88, balconies 204, facades 89, spans street 4 / court 26,
  perches 61, laundry 15, vents 7, cafes 31 / 94 seats, bbqs 15, dryers 17).
* NOW: M2 eye-level buildings — start with balcony life + hanging greenery (new `buildings/green.ts`: leaf-card
  mesh + canvas leaf atlas + wind), then shutters at varied positions, facade AC/dishes/downpipes, more balconies.
* Capture note: subsets with terrain/vegetation currently fail (other agents' shader errors) → use
  `only=sky,roads,buildings,props` for now.

## Brief (from WORLD-PLAN.md scope 7 + briefs "### wear")
Roads: patches, cracks + sealant, tyre polish, oil stains, faded markings, drains, puddles in low spots (mirror
lamps at night), leaves/litter in gutters. Sidewalks/plazas: stained, worn, gum spots, broken slabs. Buildings:
splash grime at the base, rain streaks, moss/lichen on north faces and roofs, roof tile variation, ivy/creepers,
peeling paint, AC units, pipes/gutters/downpipes, satellite dishes, solar water heaters and water tanks on flat
roofs, balcony plants / hanging greenery / bikes / chairs, window boxes, shutters at different positions; shop
interiors that read as real shops; props with rust, chips, stickers. Priority: (1) eye level in old town /
downtown / beach street (reference 2: Tel-Aviv street), (2) roofs from the overview, (3) road/sidewalk wear.
FIRST milestone: `ctx.services.buildings` (chimney tops, balcony anchors, facade spans for laundry/bunting) and
`ctx.services.props` café seats (position, yaw, height, table) for streetlife and life.
Owns: `src/world/buildings.ts` + `buildings/*`, `src/world/roads.ts` + `roads/*`, `src/world/props.ts` + `props/*`.
Budget (high): 0.5 ms GPU, share of ≤ +25 draw calls total (I aim ≤ +3).

## What exists (survey)
* Shell shader (materials.ts) already has macro weathering: coping dirt washing down, sill rain streaks, splash
  base, corner darkening, blotches, per-floor drift; roofs: membranes/gravel/drains/moss, tile patches/lichen.
  It is tuned for 100–300 m and reads as clean at eye level (dt_street_11, ot_street_11).
* Shop windows: `bhRoom` style 6 = generic coloured shelves — no shop identity.
* Old town: shutters always flat-open, flower boxes (boxes of cubes), 32 % of townhouses get one first-floor
  balcony with 2 pots + sphere plants; flat roofs: hatch + skylight + 2 vents + AC + dish; awnings static.
* Apartments (houses.ts genApartment) have balconies "with life"; hotel balconies; towers rooftop(): water tank.
* Roads (roads/glsl.ts ASPHALT2/HARD2): resurfacing patchwork, sealed cracks, trench cuts, patches, wheel
  polish, lane oil, gutter band; paving bands/bonds; markings with paint wear. No puddles, no litter.
* Props: café sets (`kit.ts cafe`) placed by scatter.ts — chair positions random inside the kit (not exposed).

## Design
Services (M1):
* `ctx.services.buildings` (type `BuildingsService` exported from `src/world/buildings/anchors.ts`):
  `chimneys[]` (top-of-pot world xyz, flue size, lot id, district, kind), `balconies[]` (floor centre world xyz,
  outward normal, width, depth, rail top, lot id, district), `facades[]` (street-facing exposed facade spans:
  base endpoints, outward normal, eave height, first upper-floor height, floors, lot id, district, kind),
  `spans[]` (precomputed across-street / across-courtyard pairs in old town + market for bunting & laundry:
  world endpoints on both facades, kind 'street' | 'court'), `perches[]` (ridge / parapet lines for birds),
  plus the existing `setDebug`, `houses`.
* `ctx.services.props` (type `PropsService` exported from `src/world/props/kit.ts`… → `props/service.ts`):
  `cafeSeats[]` (seat centre world xyz at seat height, yaw facing the table, table index) and `cafeTables[]`
  (centre, top height, radius, parasol flag, seat indices).
Buildings eye level (M2+): balcony life + hanging greenery (new leaf-card mesh `buildings-green`, one draw call,
procedural canvas leaf atlas, wind from core/wind.ts, alpha-test near only), shutters at varied positions,
facade AC units / dishes / downpipes, more balconies in old town / beach / midtown; shop interiors per shop
type (encoded in the wall pattern attribute); facade wear at eye level (peeling render, damp + efflorescence,
north-face moss/algae, posters/tags at street level, ivy masks); roofs: solar water heaters, tanks, AC, antennas
on flat roofs, per-building roof tone/age, moss on north slopes. Roads: puddles in low spots (mirror lamps at
night), gutter litter/leaves, stronger tyre polish + braking marks at stop lines, faded markings, sidewalk
stains/gum/broken slabs. Props: rust / chips / stickers in the furniture material.
Toggles (planned): `?nowear` (all new wear masks off), `?nogreen` (balcony greenery mesh), `?noclutter`
(new facade / roof clutter), `?nopuddles`.

## Milestones
* [x] M1 services (buildings anchors + café seats) → lead messaged. Life/streetlife requests folded in:
  laundry wires, kitchen vents, bbqs, rotary dryers, discs, cafes in streetlife's shape, setStaticLaundry().
* [ ] M2 balconies / greenery / shutters / facade clutter (eye level old town + beach street)
* [ ] M3 roofs (solar heaters, tanks, AC, antennas; roof tone/moss) — overview
* [ ] M4 shop interiors
* [ ] M5 facade wear at eye level (peeling, damp, moss, ivy, posters)
* [ ] M6 roads + sidewalks (puddles mirroring lamps, litter, wear)
* [ ] M7 props wear; final report

## Requests to other areas
* (none yet)

## Changes outside my area
* (none yet)
