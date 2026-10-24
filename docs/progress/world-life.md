# world-life — wind consumers, smoke, birds, small motion (world round)

## Resume here
* 2026-10-24 09:40 — m3d judged (shots/world/life/m3d/s1.png): chimney plume now a proper wispy, bending
  column (harbroof_18h6 — fbm puff atlas + rate/opacity), bunting keeps its colours backlit (otsun_18h6),
  swift party visible against the sky (otup_18h6), market without laundry. Old-town "band" pinned to
  roads/buildings + camera near plane (lead passed it to wear; not life).
* Just changed (not yet re-shot): motes (box 18 m, gain 0.22, hg cap 6, bigger) — they were invisible
  against the bright sky near the sun; insects prefer the 4 nearest flower patches in front of the camera.
* Running: insect probe shot shots/world/life/dbg/ins.png/.json (prints in-view insect count).
* Next: verify motes + insects; full-city milestone set (overview + POIs, 11/18.2/21.5, failedModules
  empty); draw calls/tris with ?nolife-style A/B (`skip=life`); message lead; final report.

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
1. [x] M1 cloth system (`life/glsl.ts`, `cloth.ts`): one instanced cloth draw (+ shadow) — hinged pieces on
   catenary lines that swing about the chord with the cross wind (`thWindAt` at the line middle), pieces
   stream out (`thWindAt` at the hinge), flutter waves growing to the free edge, per-piece twist, thin-cloth
   translucency (RE_Direct wrapper: back light × (0.35 + 1.6·forward lobe)), lamp light at night; wires
   (instanced strip, ≥ 0.9 px up close, vanish beyond ~150 m), festoon bulbs (emissive with the street
   lights, ≥ 1.2 px at night). `decor.ts`: street lines from facing street facades in old town + market
   (several per facade pair, zig-zags, tree/lamp avoidance, ≥ 4.27 m clearance), bunting / prayer flags /
   festoons. `extras.ts`: market "star" (2 masts between the back-to-back stall rows, 14 radiating lines),
   café string lights (MST over parasol tops), lifeguard + hotel flags. Landmark flags on the gust field
   with calm droop (FLAG mode in landmarks/shaders.ts). Shots: shots/world/life/m2a/market_*.png,
   otstreet_*.png, m3b/otsun_18h6.png (backlit), m3b/otsun_21h5.png (festoons at night).
2. [~] M2 smoke (`sim/ambient/smoke.ts`): `windAt` gusts + power-law shear, HG forward scatter rim (thin
   edges glow), erosion, dither, soft particles from `postfx.softDepth()` (`?nosoftsmoke`), emitter distance
   LOD, `opacity`, prewarm 14 s at start + every time jump, budget 2000. `life/chimneys.ts`: 83 chimneys
   (heat / cook / cold profiles by hour + per-day dice + slow swells), hotel boilers, works vents, 7
   bakery/kitchen flues, 15 garden BBQs (evening events). Factory plumes verified (dbg/a.png); house plumes
   were too faint/discrete → rate 3.4–4/s, opacity 0.9 (re-judging in m3c).
3. [x] M3 laundry: courtyard lines (wear's court spans), balcony lines (wear's `laundry`, static hidden),
   rotary dryers (props.washing, static hidden). Shot: shots/world/life/band/s.png (courtyard).
4. [~] M4 birds (`sim/ambient/birds.ts`): pigeons hop aside (≤ 1.35 m) / whole group lifts (crowd within
   3.2 m or repeated startles) via `pedestrians.near`; swift screaming parties over old town + market at
   dawn/dusk (leader trail ring buffer); gulls perch on waterfront ridges/parapets facing the wind.
5. [~] M5 drift (`life/drift.ts`): leaves in gusts near the camera (+ 8 s prewarm on view/time jumps),
   butterflies (2 wing instances) + bees at groundcover flower patches, dust motes (HG g 0.75 vs. the low
   sun), moths at the 12 nearest lamps.
6. [ ] Final: full-city set, soak, perf variants (draw calls / tris), final report.

## Requests to other areas
* wear — DONE: `ctx.services.buildings` (chimneys, balconies, facades, spans, perches, laundry, vents,
  setStaticLaundry) and `ctx.services.props` (cafes, bbqs, washing, setStaticLaundry). Open (optional):
  shop awning valances / market parasols could ripple with `thWindAt` (vertex offset on the valance strip).
* streetlife — DONE: `pedestrians.near(x, z, r)`.
* air — DONE: `postfx.softDepth()`.
* foliage (optional): a per-tree `blossom` / species flag in `vegetation.trees` would let petals fall only
  from blossoming trees (today ~8 % of falling leaves are petals everywhere).

## Changes outside my area
* `src/world/landmarks/shaders.ts` — FLAG vertex mode only (grant): local wind from `thWindAt(pivot)`,
  calm droop, WIND_GLSL include.

## Toggles
(see Design)

## Best views
(pending)
