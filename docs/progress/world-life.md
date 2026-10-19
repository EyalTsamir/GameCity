# world-life — wind consumers, smoke, birds, small motion (world round)

## Resume here
* 2026-10-19 ~15:00 — Survey done, log written, requests sent to the lead. No code edited yet.
  Next: before-captures on 5174 (shots/world/life/before/), then M1 (cloth system: bunting + festoons
  across old-town / market streets, flags) in `src/world/life.ts` + `life/*`.
* Running commands: none.

## Brief (from WORLD-PLAN.md §6 + briefs)
Wind consumers: flags on poles flap, bunting / festoon strings across old-town streets and the market,
laundry lines between houses and on balconies, awnings/parasols ripple; chimney smoke from houses
(morning/evening, cooler hours), bakery/restaurant vents, garden BBQ smoke on evenings, steam vents; soft
particles (depth fade) lit by the sun (backlit glow, erosion, bending with height); birds (flocks over
roofs, pigeons on plazas lifting off when people pass, gulls at the harbour), falling leaves/petals carried
by gusts, dust motes in golden-hour light, insects at night lamps. Things happen off-camera too.
Everything moving with air reads `src/core/wind.ts` (`thWindAt`/`thGust` GLSL, `windAt`/`gustAt` JS).
Owns: `src/sim/ambient.ts` + `ambient/*`, `src/world/life.ts` + `life/*`; grant: flag cloth in
`src/world/landmarks/*` (the FLAG vertex mode only). Budget (high): ≈ 0.5 ms GPU, ≤ ~4 draw calls.

## Design
**Data sources** (all read-only, null-checked, lazily where the owner loads later):
* `ctx.services.buildings` (wear, in progress — `src/world/buildings/anchors.ts`): `chimneys`, `balconies`,
  `facades`, `spans` (street + court lines), `perches`. Fallback when absent: plan-derived street spans
  (facing front footprints across a street, same rule as anchors.ts) and no chimneys.
* plan: features (factory chimneys, flagpoles), areas (gardens, market, plaza), lots (shopfronts → vents).
* `ctx.services.vegetation.trees` (leaf fall sources), `lampLights()` (moths at lamp heads, after bake),
  pedestrians (pigeons flee people; via a small query service requested from streetlife).

**Cloth** (`life/cloth.ts`, ONE InstancedMesh + its depth material for shadows): every hinged piece
(pennant, rectangular flag, laundry item, pole flag) is an instance of a 4×4-segment grid. Per instance:
line endpoints P0/P1 + sag + param s (the hinge rides on the line), size/shape/colour/phase. Vertex
shader (MeshStandard via onBeforeCompile → shadows, fog/atmosphere, lamp light for free):
* the line: parabola sag rotated about the chord by φ = atan(drag·w⊥/weight) (whole line swings with a
  cross wind), plus a small oscillation at the line's own pendulum frequency; wind = `thWindAt(mid)`;
* the piece: free direction F = normalize(perp_H(−Y·weight + w·drag)), travelling flutter wave whose
  amplitude grows toward the free edge, frequency ∝ local wind speed; per-instance phase;
* pole flags: same code with a vertical hinge, droop shear when calm;
* fragment: shape mask (triangle pennant, shirt / trousers / sheet / towel silhouettes), thin-cloth
  translucency (sun behind the cloth → albedo-tinted glow, HG-like lobe), lamp light at night.
Wires: ONE instanced strip mesh (instance = line, 24 segments, crossed ribbons ~1.5 cm), same line math.
Festoon bulbs: ONE instanced low-poly bulb mesh, emissive by `uLights` (bloom), same line math.

**Smoke** (`sim/ambient/smoke.ts` upgrade + `life/chimneys.ts`): puffs follow `windAt()` (gust fronts)
with a height shear `(h/10)^0.14`-like profile; HG forward-scatter rim weighted by thinness ("silver
lining"), wrap/bent normals, sky-coloured shadow side; erosion over life (alpha = smoothstep of the puff
density against a rising threshold) instead of a plain fade; dithered alpha; soft fade near the ground
under the puff (analytic) — depth-texture soft particles requested from air (see Requests). Emitter LOD:
distant emitters emit fewer, larger puffs; budget raised moderately. House chimneys from the buildings
service with a per-chimney schedule (morning 6–10 h + evening 17–23 h, night embers, a few cold,
slowly varying rates; pale blue-grey wood smoke), bakery / restaurant vents (steam: bakery 4–10 h,
kitchens 11–14 h + 18–23 h), garden BBQs in the evening (props bbq positions), steam vents downtown.

**Birds** (`sim/ambient/birds.ts`): pigeons lift off when people walk through (individual hop-flutter at
1.5 m, the whole group at 3+ intruders or a cyclist), land on roof perches (buildings perches) and come
back; evening swifts screaming over the old-town roofs at golden hour; starling flocks bigger and using
perches; gulls perched on bollards / harbour roofs / lamp posts and following boats.

**Small motion** (`life/drift.ts`, ONE instanced mesh for leaves + petals, ONE points mesh for motes and
moths): camera-local pools (only near the camera — off-screen they need not exist), leaves shed from
nearby trees in gusts, carried by `windAt`, tumbling, landing and resting a while, then fading; petals
from blossom trees in the park; dust motes visible only against the low sun (forward-scatter weight);
moths circling the nearest lamp heads at night.

**Quality tiers**: high = everything; medium = half the pieces in camera-local pools, no cloth shadows on
far lines; low = cloth without shadows, no motes/moths, smoke budget ×0.6. URL switches: `?nolife`
(module skipped via ?skip=life also works), `?nocloth`, `?nobunting`, `?nolaundry`, `?nodrift`,
`?nochimneys`, `?lifedebug`.

**GPU estimate (high)**: cloth ≈ 1.2k instances × 25 verts = 30k verts main + shadow (≈ 0.1 ms on the
target), wires/bulbs ≈ 10k verts (≈ 0.03 ms), smoke overdraw +30 % puffs but smaller (≈ 0.1–0.2 ms
golden hour), drift ≤ 600 tiny quads (≈ 0.03 ms). Total ≈ 0.3–0.4 ms; +4 draw calls (+1 shadow).

## Milestones
1. [ ] M1 cloth system + bunting/festoons across old-town and market streets + new flags + landmark flags
   on the gust field.
2. [ ] M2 smoke: shader (rim, erosion, soft fade), wind/gusts/shear, house chimneys + vents + BBQs.
3. [ ] M3 laundry: courtyard lines, balcony lines, garden rotary dryers.
4. [ ] M4 birds: pigeons react to people, perches, swifts at dusk, gulls perched.
5. [ ] M5 drift: leaves/petals in gusts, dust motes at golden hour, moths at lamps.
6. [ ] Final: soak, perf variants, final report.

## Requests to other areas
* **wear** (buildings): `ctx.services.buildings` = `src/world/buildings/anchors.ts` as drafted (chimneys,
  balconies, facades, spans, perches) is exactly what I need — thank you. Additions: (a) for balcony laundry
  (houses.ts ~l.470) expose the line ends `laundry: {ax,ay,az,bx,by,bz}[]` and drop the static boxes (I hang
  animated cloth); (b) for shopfront lots a roof vent point (`vents: {x,y,z,lot,kind:'bakery'|'kitchen'}`)
  or I place vents at chimneys of shopfront lots.
* **wear** (props): `ctx.services.props` with `bbqs: {x,y,z}[]` (grill top, world) and `washing:
  {x,y,z,yaw0,R,H}[]` (rotary dryers); drop the static laundry boxes in GK.washing so I hang animated pieces.
* **streetlife**: a stable query `ctx.services.pedestrians.near(x, z, r, out?)` → count (or forEachNear)
  for pigeons; until then I read `_crowd.parties[].members[]` (read-only, every 0.3 s).
* **air**: for soft particles, `ctx.services.postfx.softDepth()` → `{ texture, linear: boolean, near, far }`
  of the previous frame's scene depth (N8AO's half-res depth is fine) or null. I fall back to an analytic
  ground/roof fade without it.

## Changes outside my area
(none yet)

## Toggles
(see Design)

## Best views
(pending)
