# W8 — Countryside and small nature (real things round)

Branch `claude/real-w8-country` (from claude/pensive-gates-bim12i @ 5137562). Brief: docs/progress/real-briefs.md "W8".

## Resume here
* **s1–s4 (2026-10-29 00:30 UTC), session 1 ends here.** All four classes have a first real version; judged on
  the bench (sheets shots/w8/s3/sheet_1.png, s4/, s4b/, s2f/farm_*.png; copies in docs/progress/real/w8_*.jpg).
  Next session, in order:
  1. Cow: still reads long/low at 10 m (pig-like) — check s4 after the barrel/leg thinning; consider a higher
     withers line, slimmer neck, a visibly longer leg below the belly; Holstein patches OK; black cows read flat.
  2. Sheep: good at 3 and 10 m. Check the coarse/near switch distance (cap raised to 40/16 on high) and lying poses.
  3. Tractor: reads as a tractor at 3/10 m. Open: bonnet is a plain box (add a rounded nose / side panels / decals),
     mud barely visible, check wheel tracks (land-wheeltracks) on the field, dust trail position.
  4. Flowers: park beds read as petunias/tulips (geometry heads); wildflower blades got petal rosettes in the fragment
     (uFlDetail) — judge at 1.5 m (s4b). Leaves of the bed plants are still big flat diamonds.
  4b. Wildflower bench framing: at 1.5 m the heads are still tiny in frame — move the target onto a dense meadow
     patch (or a lower pitch) before judging the petal rosettes.
  5. Farms: farmstead reads real at 25/45 m. Fixed after s2f: fence through the house (clear-side search), bales in
     the river, barn touching the house. Re-check; then barn interior when a door is open, a yard track, a dung heap.
  6. Measure: perf.mjs variants `;noanimaldetail` `;notractordetail` `;nofarmdetail` `;noflowerdetail` at a farm view
     and downtown; golden overview (scripts/agent-tools/golden.sh); downtown --invariants; night 21.5 regression.
  Bench note: use `--settle 4000` (near-herd selection is one frame late; software GL runs ~1 fps).
* s0 (2026-10-28): bench classes `sheep, cow, tractor, flowerbed, wildflower, farm` added to scripts/bench.mjs
  (herd + tractor read from `scene.getObjectByName('land-farmlife').userData.herd / .tractor`, set in farmlife.ts).
  Before sheet: shots/w8/s0 (sheet_1.png) → docs/progress/real/w8_before.jpg.

## Photo tests (acceptance at 3 m; silhouette at 10 m; overview at least as good)
* **Sheep 3 m:** wool volume with fleece breakup (lumpy, not a smooth blob), face and legs darker (black/brown
  face breeds or white), ears sticking out sideways, legs with knee/hock and small hooves, the body's weight on
  the ground (legs reach into the grass), grazing pose variety (head down / up / turned, some lying).
* **Cow 3 m:** bone structure — hip bones (hooks) and pin bones, shoulder/withers, spine line, deep ribcage,
  dewlap; udder between the hind legs; tail hanging from the pin bones with a dark switch; head with muzzle,
  ears, (short horns optional); patches with soft edges (Holstein), solid coats (brown / black / red).
* **Tractor 3 m:** big rear tyres with chevron lugs and rims, smaller front tyres, bonnet with grille + vents,
  cab frame with glass panes and pillars, roof, exhaust stack beside the bonnet, steps, mudguards, rear
  three-point hitch with the implement (cultivator tines / plough), mud on tyres and lower body; tyre tracks.
* **Flowers 1–2 m:** petals with count and shape per species (daisy many white ray petals + yellow disc, poppy 4
  red cupped petals + dark centre, cornflower blue ragged, tulip cup, buttercup 5 glossy yellow), centres,
  stems with leaves, droop/nod, colour variation between heads.
* **Farm building 10–40 m:** barn with vertical boarding (board + batten), big doors (sliding/hinged with
  bracing), roof sheeting (corrugated / tiles) with eaves overhang and barge boards, silo, fences and gates,
  hay bales (round, wrapped), muck/track at the yard, contact with the ground (plinth, dirt).
* **Contact:** hooves and tyres sit in the grass; wheel tracks in the field.

## Code pointers (so nobody re-reads)
* `src/world/landscape/farmlife.ts` — `animalGeometry()` (L15: one ~54-tri unit cow, icosa body + box head + 3-sided
  legs, aPart 0/1/2), `tractorGeometry()` (L101, 8 boxes into the shared `Fleet`), `createFarmLife()` herd placement
  (pasture fields, inst stride 7: x,y,z,yaw,species 0 cow/1 sheep,tint,phase; max 720×density), one
  InstancedBufferGeometry `land-herds` with shader scaling for sheep (0.6) + head-bob grazing, castShadow false.
  Tractor: serpentine over a stubble/ploughed field ~330 m from the slab (score), fleet.set per frame; dust via smoke.
* `src/world/landscape/fleet.ts` — CPU-transformed vertex-coloured templates in one dynamic mesh (country cars,
  ships, tractor). `add(tpl)` → id, `set(id,x,y,z,yaw)`, `commit()`.
* `src/world/landscape/settlements.ts` — `placeSite` (farm = house + barn + optional shed), `gableGeometry` (unit
  body+roof), `buildingMaterial` (shader windows, palette WALLS/ROOFS), one InstancedMesh `land-buildings`.
  Sites from `model.sites` (services.landscape.model).
* `src/world/vegetation/plants.ts` — `petal()` 4-tri star, `mound()`, `flowerClump()`, `tallFlower()`, `flowerBed()`;
  callers in `src/world/vegetation.ts` ~L900 (tree pits), 1002, 1112 (park hub beds around founder statue, 7.4 m),
  1125, 1150, 1176. Merged fine plant mesh (`fineSink`), wind via `Wind.at`.
* `src/world/groundcover/field.ts` — blade shader; flowers L301–366: head = camera-facing diamond on the stem,
  colours `flowerCols` L512 (gcFl), ring A 7-vertex blades (levels 0,1/3,2/3,tip).

* `src/world/landscape/animals.ts` (new) — `Builder.tube/blob` (indexed, sections ⟂ path, disp callback), `sheepGeometry`,
  `cowGeometry` (aMat: coat/skin/hoof/dark/pink/horn/switch, aBend neck weight), `POSE_GLSL` (herdLying/herdGraze/herdLie
  shared with the coarse mesh), `createNearHerd` (instanced, cap N, iA/iB copied by the selector in farmlife.ts;
  fleece/hide in the fragment: hnNoise, bump via dFdx; shadow via customDepthMaterial).
* Camera targets are clamped to slab ± 320 m (`src/ui/camera.ts` WORLD_TARGET_MARGIN): anything farther can never be
  seen at 3 m.
* Selection runs in `herd.onBeforeRender` (camera from the call; the water reflection also renders the scene — the
  check is by camera movement, harmless).
* `src/world/landscape/tractor.ts` (new) — `Sink` (merged non-indexed builder: col, aRM rough/metal, aSurf, mud by
  height `base/mudTop/mudSpan`), body + lugged wheels (2 InstancedMesh, roll by distance), `createTractor`.
* `src/world/landscape/farmstead.ts` (new) — house/barn/shed/silo/bales/fence/gate builders, `farmMaterial` (aSurf
  procedural: 1 boards, 2 corrugated, 3 tiles, 4 render, 5 brick, 6 galvanised, 7 wrap, 8 straw, 9 concrete).
  settlements.ts `placeSite(..., farms)`: near farms skip the instanced boxes, `placeFarm()` holds the old layout.

## Done
* s0: bench classes.
* Herds: near-LOD sheep (~1.5k tris: lumpy two-scale fleece, black or mottled faces, ears out sideways, eyes, nose,
  wool cap, jointed legs with knee/hock, hooves, docked tail) and cow (~2.5k tris: boxy rump, hook/pin bones,
  withers, spine ridge, ribs, dewlap, head with muzzle pad, ears, eyes, horn buds, two-claw hooves, udder + teats,
  tail with switch; Holstein soft-edged patches / brown / black / red), the nearest 40 sheep + 16 cows (high) within
  55 m, cast shadows; neck bends to graze (skinning weight), head turns; ~18 % / 20 % lie down (also in the coarse
  mesh); mud on the feet. Coarse mesh hides the near ones (iN).
* Tractor: own model (body merged ~6k tris + 2 instanced wheel meshes with chevron lugs that roll), pitch from the
  ground, wheel tracks along the passes, field chosen ≤ ~230 m from the slab (was 420 m, unreachable).
  Bug fixed: the field scan stopped when the herd cap was reached, so the tractor never saw the near fields.
* Farms < 420 m from the slab: farmstead.ts (house, barn, shed, silo, bales, fence, gate, aprons).
* Flowers: plants.ts heads by species (daisy / marigold / geranium / petunia, tulip cup), stems, leaf rosette;
  groundcover field.ts petal rosette + eye in the fragment on the camera-facing head (count per species).

## Tried and rejected
* Flower heads as near-cell-only geometry (lamps/nearCells.ts) with the coarse heads hidden: would need either
  ~30–40 extra per-cell draw calls or a near-collapse flag in the shared plant shader (vegetation.ts, not owned).
  Rejected for now: heads are geometry everywhere in the fine plant mesh (drawn only when lod.near()); measure cost.
* Discard-based petal silhouettes in the grass shader: discard would disable early-z/LRZ for the whole blade draw
  on Adreno. Petals are drawn by colour (gaps shaded like sepals) instead.

## Toggles / tiers / costs
* `?noanimaldetail` — coarse herd mesh only. Tiers (density): high 40 sheep + 16 cows within 55 m, medium 24 + 10
  within 42 m, low 10 + 5 within 30 m. Cost: unmeasured (≈ 40×1.5k + 16×2.5k ≈ 100k tris + shadow pass, only when
  a herd is within 55 m).
* `?notractordetail` — the old box tractor in the landscape fleet, no tracks.
* `?nofarmdetail` — farms as instanced boxes again.
* `?noflowerdetail` — old star-petal clumps (plants.ts) and plain diamond heads (field.ts uFlDetail).

## Token report (session 1, tokens.py)
TOTAL weighted 3.6M (cache read 72%, cache write 9%, output 19%); 123 calls, ctx median 209k, max 323k, 0 cold.
The system prompt + brief alone is ~1.1M lifetime (30%): the base context of this session type is large, so the
next session should wrap after ~60 calls.
