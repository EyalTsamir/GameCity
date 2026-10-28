# W8 — Countryside and small nature (real things round)

Branch `claude/real-w8-country` (from claude/pensive-gates-bim12i @ 5137562). Brief: docs/progress/real-briefs.md "W8".

## Resume here
* s0 (2026-10-28): bench classes `sheep, cow, tractor, flowerbed, wildflower, farm` added to scripts/bench.mjs
  (herd + tractor read from `scene.getObjectByName('land-farmlife').userData.herd / .tractor`, set in farmlife.ts).
  Before sheet: shots/w8/s0 (sheet_1.png).
* s1 (WIP, coded, judging): near-LOD sheep + cow models (animals.ts), real tractor (tractor.ts, field moved to
  ~140 m from the slab so the camera can reach it), real farmsteads for farms < 420 m from the slab (farmstead.ts
  via settlements.ts). Probe script scripts/agent-tools/w8probe.mjs (load once, eval async snippets).

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

## Tried and rejected
(none yet)

## Toggles / tiers / costs
(none yet)
