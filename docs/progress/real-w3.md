# W3 — street furniture, park structures, market stall ("real things" round)

Branch `claude/real-w3-furniture` (from `claude/pensive-gates-bim12i`). Brief: docs/progress/real-briefs.md "W3".

## Resume here
* 2026-10-28 — Session 1 ends (context). Committed + pushed. Bench after-sheets: docs/progress/real/w3_after_1.jpg
  (bin, planter, phonebox, newsstand, bench, statue) and w3_after_2.jpg (gazebo, kiosk, playground, picnic,
  market stall, flagpole) — before = audit_3..5.jpg. Judged at 3 m: phone box, statue pedestal, gazebo
  roof/balustrade, picnic table, market produce and kiosk chairs now read as real objects.
  **Not yet verified:** the `shot.mjs --view downtown --invariants --stats` check did not run (the dev server
  died with the worker restart: ERR_CONNECTION_REFUSED). The two bench runs were clean (no console/page/frame
  errors, no failed modules) but invariants are unchecked → run it first in session 2.
  Code: furniture.ts bench :168, bin :233, phonebox :337, newsstand :417, planterBox :499, bollard :565;
  props/shapes.ts (cbox, lathe, poly, bolts, ring); props/legacy.ts (old builders); props.ts `simple` flag;
  park.ts facetLathe :18, genStatue :29, genGazebo :139, genKiosk :330, genPlayground :432, genPicnic :631;
  civic.ts genFlagpole :12, slatCrate :58, produce :71, genMarketStall :112 (`richStall`); props/material.ts
  WEAR_GLSL (new steel / ceramic branches, aggregate specks). Bench LOS: scripts/bench.mjs (`los` block).
  **Next (session 2), in order:**
  1. Re-bench the 10 m newsstand (front not yet seen: LOS had to swing to its back; per-class widths now fixed)
     and the modern bin (reads as a dark box — consider a brighter stainless default + visible liner).
  2. Gazebo floor reads flat brown (PLANKS not visible on the cyl top: give the floor a plank uv / radial boards).
  3. Statue figure itself (still a lathe "frock coat"; bronze flat teal — darker bronze with verdigris streaks).
  4. Contact: ground dirt ring around prop bases needs a decal layer (transparent) — not done; foot grime on
     the props themselves exists (wear shader). Coordinate with the wave-2 ground-contact worker.
  5. Mailbox / hydrant / bike rack untouched (audit: good/fair). Bus shelter untouched (good).
  6. Measure cost: `node scripts/perf.mjs --view downtown --variants ";nopropdetail"` and
     `--view oldtown --variants ";nomarketdetail"` (software GL: compare within one run).
  7. tokens.py summary.

## Done
* **scripts/bench.mjs — line of sight** (REAL.md "bench framing faults"): before each capture the camera swings
  around the object (yaw +18, −18, ±55, ±95, ±140, 180, then the same at 0.6 × arm) until a ray from the object's
  middle to the camera hits nothing in either direction (both directions: one-sided roofs/walls are only hit from
  their front; glass counts, billboards/sky/water don't). `report.json` captures carry `los: {dy, arm, blocked?}`.
  Not fixed: tree crowns whose instances are placed in the shader are invisible to the raycaster (picnic 10 m),
  moving objects are not yet restricted to open road (W2's classes).
* Playground safety tiles: tried bright green → read as astroturf; now red EPDM with CONCRETE pattern.
* `src/world/props/shapes.ts` (new): `cbox` (45° chamfered box, 26 faces), `lathe` (profile revolve with crisp
  mouldings), `poly`, `boltY/boltZ`, `ring`.
* furniture.ts: **bin** (classic: cast-iron slatted round bin — base moulding, 18 slats over a dark core, hoop
  bands, rolled rim, liner bag folded over the rim with an uneven hem, crest; colour/bag variants; modern: stainless
  bin on a bolted base plate, posting slot under an overhanging cap, door seams, keyhole, hinges, sticker);
  **bollard** (steel: collar, tapered tube, domed cap, two reflective bands; stone: chamfered foot, dished cap;
  new iron cannon bollard for the station); **phone box** (K6: concrete plinth, chamfered posts, raised kick
  panels, 3 × 8 glazing bars in relief over real transparent glass (props glass mesh), sign bands with letters,
  square dome + crown, door handle, telephone/shelf/ceiling light inside); **newsstand** (plinth, real front
  opening with depth, shelves of covers inside, counter with paper stacks, coiled roll shutter, raised panels,
  wire racks with tilted covers, overhanging pitched roof, sign); **planter** (hollow trough: shadow-gap foot,
  chamfers, rim frame, inner walls, soil 8 cm down with clods; terracotta lip, timber boards between posts,
  steel folded lip); **bench** (chamfered slats, classic: armrests + carriage bolts).
* park.ts: **statue** pedestal = moulded square lathe (plinth, cove, die, cornice, capping) + chamfered octagonal
  steps + recessed side panels; **gazebo** turned columns, floor nosing, real balustrade (rails + balusters),
  boarded roof underside with 16 rafters (open eave ring); **kiosk** corner posts, dado rail, frieze, recessed
  hatch with frame, propped shutter with stays, counter on brackets with cake stand/napkins/tip jar, bistro
  chairs (tube legs, round seat, hoop back) and tables (base, rim); **picnic table** boards with gaps, seat boards,
  A-frames, bearers, braces, carriage bolts; **playground** rubber safety tiles, swing A-frames with footings,
  head castings, hanger clamps, link chains, sagging strap seats, round ladder rungs, handrails, S-curve stainless
  chute with run-out, see-saw A-bracket + handles + tyre stops, climbing-frame ball clamps + footings, coil-spring
  riders with rounded animals.
* civic.ts: **flagpole** granite plinth, base plate + 8 bolts, foot sleeve, halyard, cleat; **market stall**
  steel pole frame on foot plates, cloth canopy sagging between rails (metric stripes), scalloped valance, folded
  back cloth, trestle table with skirt, slatted crates with individual produce (per goods: fruit, loaves, cheese
  wheels, fish, jars, flowers), price cards, scales, back shelf, stacked crates, cardboard, hand truck.

## Tried and rejected
* LOS with transparent meshes excluded: the camera ended inside curtain-wall glass (phonebox/newsstand 40 m).
* LOS ray from the object only: misses roofs seen from below (playground 40 m ended inside a shed roof).

## Toggles / tiers / costs
* `?nopropdetail` — old primitive bins/planters/phone boxes/newsstands/bollards (props/legacy.ts). Also the
  **low** quality tier (boot-time `ctx.quality.level === 'low'`).
* `?nomarketdetail` — market stalls without individual produce, price cards, scales, ground clutter (crates
  become gravel slabs). Also the **low** tier.
* Landmark small parts route to the landmarks detail LOD automatically (< 25 cm / thin rods) or via forceDetail.
* Props detail lives in the fine (near-only, < 300 m) furniture meshes except phone box / newsstand (coarse).
* Cost: not measured yet (see Resume step 6).
* Shader: props wear gained galvanised-steel mottling + foot grime, concrete aggregate specks, terracotta salt
  bloom; painted-metal stickers made ~5× rarer (were confetti on large panels). `?nowear` still disables all.

## Sheets
* shots/w3/los/sheet_1.png — framing check.
