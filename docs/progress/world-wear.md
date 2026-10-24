# world-wear — weathering and lived-in clutter (world round)

## Resume here
* FINISHED (2026-10-24). Lead-review fixes verified in it12 (invariants {}, console clean): apartments without
  violet slabs / barcode streaks, Seaview hotel sea facade clean with sparse green touches. Nothing running.

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

## Iterations (captures under shots/world/wear/)
* before / before2 = baseline 5174 (same subset). it1/it2 partial (it2 invalid: TDZ bug → townhouses threw).
* it3 (old town, 11 + 21.5): big step at eye level — window boxes with trailing petunias/ivy, Juliet
  balconies, balconies with pots / palms / bougainvillea, hanging pot brackets, shutters, dishes, downpipes,
  kerbside café tables (21) + A-frames, shop interiors readable by day (Tailor shelves), hotel balconies all
  green from the overview, ivy on side walls. Problems found → fixed: footprint violations (climbers past the
  corners, palm clumps 1.7 m out, back-wall downpipes on non-inset walls), peeling render = round "polka dots"
  (now ragged, concentrated at the foot / under copings), shop windows blown out at night (toned), night test
  subset lacked the `lamps` module (no lamp map → no pools, no puddle glints).
* it4 running: same views + downtown plaza, with `lamps`.

## Perf notes (it3 stats, full old-town subset)
* buildings: trim 140.3k → 203.7k tris (+63k: railings, plants pots, chairs, bikes, AC, dishes, pipes, roof
  clutter), new `buildings-green` 14.9k tris (alpha-tested cards, +1 dc + shadow pass), `buildings-laundry`
  (+1 dc until life hides it). props: −4k (planter blobs → cards), new `props-green` (+1 dc, no shadow),
  `props-laundry` (+1 dc until hidden). Draw calls otfac 69 → 72 (other agents' changes included).
* GPU estimate (Adreno X1-45, high): vertex ≈ +0.1 ms (≈ +80k tris main + shadow), wall wear +1 fetch +ALU
  on facade pixels ≈ +0.05–0.1 ms, shop interiors only on shop glass, road litter/puddles/wear ALU on near
  ground pixels ≈ +0.1 ms → ≈ 0.3–0.4 ms (budget 0.5).

## Milestones
* [x] M1 services (buildings anchors + café seats) → lead messaged. Life/streetlife requests folded in:
  laundry wires, kitchen vents, bbqs, rotary dryers, discs, cafes in streetlife's shape, setStaticLaundry().
* [x] M2 balconies / greenery / shutters / facade clutter (eye level old town) — it3/it4, lead messaged
* [x] M3 roofs (solar heaters, tanks, AC, antennas; roof age tone / north moss; chimney aerials)
* [x] M4 shop interiors (bhShop) + roller shutters — iterating
* [x] M5 facade wear (damp + salt line, algae, peeling render, macro age / sun / eave grime, ivy climbers)
* [x] M6 roads + sidewalks (puddles + lamp glints, litter, sealant, patches, paint wear, slab wear, stains)
* [x] M7 props wear (rust, chips, stickers, lichen, greying), terrace lights, kerbside cafés; final report

## Requests to other areas
* (none yet)

## Changes outside my area
* (none yet)

## Final report
**What changed** (owned files only; invariants {} and a clean console in every capture since it4, incl. the full city):
* *Buildings* — `buildings/green.ts`: one alpha-tested leaf-card mesh (procedural atlas uploaded with colour bled
  into transparent texels so mips stay green; wind sway, mip-alpha, back-light, lamp light). `buildings/clutter.ts`:
  window boxes with trailing flowers, balconies with life (pots, palms, bougainvillea, hooked boxes, chairs, bikes,
  racks, AC, dishes), Juliet balconies, iron railings, climbers, four shutter states, downpipes, cables, kitchen
  flues, flat-roof kit (solar water heaters, tanks, AC, aerials); sparse `hotel` mode. Shell shader: shop interiors
  per shop type + office lobbies, roller shutters with graffiti, eye-level and macro wall wear, roof age + moss.
* *Roads* — `roads/puddles.ts` (wetness model, lamp reflections followed to lamp height), worn asphalt (wheel
  paths, patches, sealant, overbanding, braking marks, sediment gutter, worn paint), litter, slab wear, stains.
* *Props* — wear shader (rust, chips, stickers, lichen, greying), planted planters, 21 kerbside café tables +
  A-frames, terrace lights (parasol lamps, lanterns, lamp-map lights).
* *Services* — `ctx.services.buildings` (chimneys, balconies, facades, spans, perches, laundry, vents, shops,
  setStaticLaundry), `ctx.services.props` (cafes incl. 'sidewalk', discs, bbqs, washing, setStaticLaundry).

**Toggles:** `?noclutter ?nogreen ?nowear ?nopuddles ?noterracelights`, `?wet=0..1`.

**Shots:** shots/world/wear/sheets/ba_street.png, ba_beach_oldtown.png, ba_close.png, streets_night.png;
final/sheet.png (full city), finalw/otst_21h5.png (wet night).

**Cost** (otfac 11 h, toggles on vs off): draw calls 71 → 74 (green + its shadow pass, props-green; the two
static-laundry meshes disappear once life hides them), triangles 1.025 M → 1.125 M. GPU estimate (Adreno X1-45):
≈ 0.1–0.2 ms vertex + ≈ 0.2 ms fragment → ≈ 0.35–0.45 ms of the 0.5 ms budget.

**Review fixes (it12/sheet.png):** apartment balcony fronts are muted weathered concrete / frosted glass / slim
metal railings per building with a drip edge; sill rain streaks vary per window (no barcode); the seafront hotel's
balconies use greens, white and pale canvas only.

**Open:** puddle glare streaks a little regular; kerbside tables only at old-town cafés/bakeries; glass towers
barely weather (by design); plaza tree planters are vegetation's.

## Addendum (after the final report)
* Courtyard "band" (life's camera 82,1.6,20,14,40,4): not a stray object or wire. A scene probe (triangles
passing < 2 m from the eye, shots/world/wear/band/probe.json) shows the camera at (90.86, 4.03, 30.56) is *inside*
the Seaview Hotel (rear wall at x = 90.3, footprint x 90–103.5). The ribbon is the hotel's rear string course
(white trim, 4.25–4.5 m, 0.18 m deep, pre-existing) seen from below 0.6 m away through the back-face-culled wall;
`bdbg=notrim` removes it, and dist 8 (camera in the courtyard) renders clean (band/sheet.png). Camera-side issue
(free orbit can enter footprints) → lead/camera.
