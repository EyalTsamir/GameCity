# Requests to other owners ("real things" round)

* **W3 → pedestrians owner (src/sim/pedestrians/vendors.ts, marketStalls):** the stallholder stands behind the
  table facing the back cloth (bench `marketstall 3m`, shots/w3/s3base/marketstall_3m.png): turn the vendor to
  face the aisle (stall front = feature yaw, local +Z).
* **W3 → vegetation owner (src/world/vegetation.ts "planter slots"):** street-planter fill is still a shrub + 4
  flower clumps; props now adds trailing ivy/petunias over the rim and a tall accent (props.ts planter case,
  leaf cards). If the fill is reworked, keep 10 cm free along the rim for the trailing cards.
* **W5 → ground-cover owner (src/world/groundcover/mask.ts):** `ctx.services.vegetation.trees[i].worn` (radius, m)
  now marks park / square trees with a trodden bare-earth patch at the foot (vegetation/plants.ts `wornPatch`, drawn
  1.5 cm above the ground). Please clear blade density inside `worn` (and skip the "unmown edge tufts" disc there),
  so grass does not grow through the patch. **Done by W5 s2** (lead's go-ahead): mask.ts `worn` raster clears
  blade density (soft last 30 %), no edge-tuft disc for worn trees.
* **W5 → W3 / props owner (FYI, done in your files):** `lamp()` in props/furniture.ts takes an optional near kit
  `kf` (W5 lamp-post detail); `picketFence(.., rng?)`, `gateLeaf`, `lowWall` coping, MAT.brick (+ props/material.ts
  brick branch) and the gate placement in the props.ts fence loop are W5 changes.

* **W1 → lead / sky (render/sky.ts) or terrain owner — bright lawn rim at wall feet (judge-1 item 3):** the thin
  yellow-green line along the foot of house / apartment walls persists with `?nograss`
  (shots/w1/rim_nograss/apartment_3m.png on claude/real-w1-facades) → not the groundcover blades. terrain/ground.ts
  already darkens the lawn along walls, so the rim is not the ground mask. Hypothesis: a sun-lit leak strip from the
  shadow normal offset (`sun.shadow.normalBias = texel·0.8·tune.bias`) lifting the wall's shadow off the contact
  line; it shows on walls in their own shade. Probe: `shot.mjs --eval "__city.ctx.services.sky.tune.bias=0; …"` vs
  default at the bench apartment (−137.5, 0.6, −56.5, 4 m, yaw front+18, pitch 10). Buildings already add a dark
  splash zone / plinth on the wall side.
* **W1 → plan owner (core/plan.ts placeHouse):** the driveway runs beside the house; buildings now face garage doors
  to the street (bug 3), but the drive does not lead into them. If wanted: extend the driveway paving across the
  front setback of the footprint's drive-side 3.6 m strip (or flag `lot.garage` so buildings picks the garage plan).
* **W5 → sky / lighting owner (src/render/sky.ts shadows) + W1 (buildings shell), the "lawn-to-wall seam"
  (judge-1 §3, apartment_3m / house_3m):** not grass, not contact decals — still there with `?nograss`,
  `skip=groundcover` and `?nocontact` (shots/w5/seam_*). Raycast probe (bench `--probe`, shots/w5/probe/report.json):
  the bright line (pixel rgb 61,82,41 vs lawn 7,29,13) is `terrain-ground` (lawn at y −0.04) within 3–10 cm of a
  north-facing `buildings-shell` wall whose own lawn is in the building's shadow. I.e. the ground at the wall foot
  is NOT shadowed: a shadow leak at the contact line — sky.ts sets `normalBias = texel * 1.1` (l.393) on the
  fitted frustum, which on a horizontal receiver next to a vertical caster lets the first texel or two through,
  and/or the shell starts at y ≈ 0 while the lawn lies at −0.04 (4 cm open gap under the wall in the shadow map).
  Suggested fixes: extend the shell walls ~10 cm below ground (W1, free) and test a smaller normalBias with slope
  bias on the ground only (sky owner); the contact band W1 wants at wall feet (darker/damp) then reads.

* **W1 s5 → lead / sky owner — lawn rim RESULT (probe run; lighting, not ours, nothing changed by W1):**
  bench apartment at 3 m, 11 h (shots/w1/s5/rim_*.png on claude/real-w1-facades):
  - `sky.tune.bias` (normalBias) 0 / 1 / 3 → rim unchanged ⇒ **normalBias is NOT the cause** (hypothesis rejected).
  - `?noao` → the rim widens into a ~0.4–0.6 m **sun-lit lawn band** along the wall foot; the rest of the lawn is in
    the building's shadow. With AO on, AO darkens most of that band and leaves the thin bright line at the contact.
  - `?noao` + `tune.pcf = 0.3` → the band stays, with a **sharp** outer edge ⇒ not PCF blur either.
  - Cause established: the building's cast shadow on the ground begins ~0.5 m out from its own wall foot. The
    buildings use the default shadow side (BackSide), so the shaded facade itself is the caster — the remaining
    offset term is the depth bias `sun.shadow.bias = -(texel * 0.3 + 0.02) / range` (render/sky.ts l.404): a
    NEGATIVE bias pulls the receiver toward the light (peter-panning), and the shadow is offset along the ground by
    bias / tan(sun elevation) — with the fitted texel at 3 m framing this can reach decimetres.
  - Proposed one-line fix (unverified — I have no hook to change it at runtime): l.404
    `sun.shadow.bias = -(texel * 0.05 + 0.004) / range;` and check acne on roofs / lawns at 11 h and 17 h; if acne
    returns, keep the bias and instead set `shadowSide = THREE.DoubleSide` on the buildings shell material (the
    contact then has a caster at the wall plane from both sides). Falsifying probe: add `tune.dbias` (multiplier on
    that line) and run `--eval "__city.ctx.services.sky.tune.dbias=0"` at the same view.
* **W2 → plan / station owner:** the platform edge stands 2.0 m from the track centre (`plan.ts` station
  `platform: rect(-46, RAIL_Z + 2.0, …)`) while the EMU body side is at 1.45 m, so a 0.55 m gap with sleepers shows
  between platform and train at 3 m (real: 0.1–0.25 m; UK/EU platform edges ≈ 1.6–1.7 m from the centre). Suggest
  `RAIL_Z + 1.65` if the platform face / copers and rail clearances allow it (freight wagons are ≤ 1.45 m wide too).

* **W7 → pedestrians owner (src/sim/pedestrians/**):** the station platform (x −46..46, z −153..−149, top y 0.95,
  benches at x ±8.8/±17.6/±30.5, z ≈ −150.2) has no waiting people between trains; a few standing / seated waiting
  passengers (some with the luggage W7 placed: wheeled case at x −7.7, holdall x 17.2, rucksack on the bench x −17.2)
  would complete the "station platform" dense place. Same for the fish quay (x 127..136, z −140..−122): one or two
  workers (oilskins) at the creels / fish boxes, a man mending nets on the bench at the store (x ≈ 130.8, z −139).

## W6 → W1 (buildings): export rear ground-floor window spans (2026-10-29)
* The W6 back yard hangs a door, gas meter, downpipe + butt and an AC on the old-town rear walls. Without the window
  layout they land on windows; places.ts now uses a rule probed on lots 64/65 (bay = L/3.4, windows at
  a0 + bay·(0.48 + i), 1.1 m + 0.11 surrounds) — fragile if the facade grid changes.
* Ask: `services.buildings.windows(lot)` (or a `ground` list on FacadeSpan incl. rear walls) → [{s0, s1, y0, y1}] for
  ground-floor openings, from Builder.winRec before it is released (buildings.ts:245).
* FYI (no bug): "beige planks at ~1 m" in the lead's s1 back-yard frames = buildings-sills / -surrounds seen with the
  camera INSIDE lot 64 (its rear wall culled); from the yard they sit correctly on the wall.

## F2 (people everywhere) — call-site touches in other owners' files (2026-10-29)
* `src/sim/boats/models.ts`: figure() (F2-owned) records crew seats; `buildBigBoats` / `buildSmallBoats` got two
  lines each (`crewBuild.pool = …; CREW.<pool>.length = 0`) so the seats know their mesh pool.
* `src/world/harbor/quay.ts` buildFishQuay: four `addActor()` calls (fish-quay workers) + the import.
* `src/world/landmarks/parts.ts` person() (F2-owned) now registers a real figure; its callers are unchanged.
* For F4 / harbor: the crabber deckhand and the quay people are now pedestrians-module figures; if the quay
  layout moves, move the `addActor` spots with it.
## F4 requests (final fix round)
* **W2 / traffic.ts** — "e-scooter of boxes" (judge 2 #8) lives in src/sim/traffic.ts parked two-wheelers; not F4's file.
* **F2** — tractor driver (seat at tractor.ts body-local (0, 2.06, −0.7), wheel at (0, 2.28, −0.12)) and the sailboat
  crew (models.ts sailboat(): figure() calls at (−0.4, 0.62, −1.6) and (0.45, 0.62, −2.5), cockpit seats at x ±0.6).
* **Props kit** — the newsstand fascia ("NEWS"/"PRESS") is pixelText geometry; a real serif sign needs a canvas-texture
  sign mesh in the props module (none exists; landmarks has signQuad). Not done: price ≈ 1 draw + 1 texture.
