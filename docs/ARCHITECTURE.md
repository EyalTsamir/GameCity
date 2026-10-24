# Tinyhaven — architecture & conventions

A living miniature city (tabletop diorama) in Three.js r186 + TypeScript, built with Vite.
`npm run dev` → http://127.0.0.1:5173 · `npm run build` → single self-contained `dist/index.html`.

## 1. Big picture

```
src/main.ts            bootstrap: renderer, plan/graphs, module loader (fault-isolated), main loop, window.__city API
src/core/              shared, three-free data + small engine services (OWNED BY THE LEAD — see §9)
  constants.ts         all physical dimensions (road widths, heights, slab, grid lines…)
  geom.ts              P2/Rect/Dir, Path2 (arc-length polyline), bezier, helpers
  plan.ts              CityPlan: districts, blocks, lots(buildings), areas, features(landmarks/props),
                       street slots (furniture), walk paths, benches, roads topology, bus lines, rail, water,
                       POIs, heightAt()/isWater()
  roadNetwork.ts       lanes, movements (turn curves), conflicts, crosswalks, signal/stop-sign positions,
                       level crossings, bus routes
  intersections.ts     IntersectionManager: signal phases, stop-sign FCFS, vehicle reservations,
                       pedestrian crosswalk arbitration
  pedNetwork.ts        pedestrian walkway graph + A* routing, doors, bus-stop nodes, benches
  occupancy.ts         0.5 m raster of ROAD/SIDEWALK/BUILDING/WATER/SOLID/PATH/RAIL/PAVED
  time.ts              WorldClock: time of day, sun/moon dirs, daylight/night/dusk factors, lightsOn
  uniforms.ts          globalUniforms (uTime, uNight, uLights, uWind, uSunDir, …) shared by shaders
  events.ts            EventBus (event names listed in the file header)
  context.ts           CityContext, CityModule contract, Services, PickHit/Picker, QualityState
  gfx.ts               PALETTE (art direction), paint()/merge()/box(), glowTexture(), canvasTexture()
  rng.ts               seeded Rng (+ fork(label)), hash01()
src/render/sky.ts      lights, sky, sun/moon/stars, clouds, fog, shadow fitting       (module "sky")
src/render/postfx.ts   post-processing, tone mapping, adaptive quality              (module "postfx")
src/world/*.ts         static world renderers: terrain, landscape (beyond the slab), water, roads, buildings, landmarks,
                       harbor, vegetation, props, groundcover (grass/meadows), life (cloth, chimneys, drift), lamps
src/sim/*.ts           dynamic life: ambient, traffic, pedestrians, rail, boats
src/ui/*.ts            camera, ui (HTML overlay), audio
src/debug/             validate.ts (static checks), planView.ts (2D map: ?planview)
scripts/shot.mjs       headless screenshot + console/invariant report (real GPU)
```

Load order (main.ts): sky, terrain, landscape, water, ambient, roads, buildings, landmarks, harbor, vegetation, props,
groundcover, life, lamps, traffic, pedestrians, rail, boats, postfx, camera, ui, audio. (sky/postfx run before the camera module exists:
look services up lazily every frame, e.g. `ctx.services.camera?.getState()`.) A module may use services registered by
modules **earlier** in the list (always null-check: a module can fail or be excluded with `?only=`).

## 2. Module contract

```ts
// src/<area>/<name>.ts
import type { CityContext, CityModule } from '../core/context';
export default function create(ctx: CityContext): CityModule | Promise<CityModule> {
  // build meshes once, add to ctx.scene, register services/pickers…
  return {
    name: '<name>',
    update(dt, ctx) { /* sim step; dt = scaled sim seconds (0 when paused, up to ~0.8 at 8x → sub-step!) */ },
    frame(realDt, ctx) { /* real-time per-frame work (camera, UI, purely visual easing) */ },
    resize(w, h, ctx) {},
    stats() { return { vehicles: 123 }; },        // shows in __city.stats()
    invariants() { return ['car 12 overlaps car 40']; }, // self-checks for automated tests
  };
}
```
Helper files go in a sub-folder named after the module (e.g. `src/sim/traffic/vehicleModels.ts`).
A module that throws during creation is skipped (logged) — the rest of the city still runs.

## 3. World conventions

* 1 unit = 1 m. **Y up.** Ground plane X/Z. **North = −Z** (back of the default view), south = +Z, east = +X.
* Yaw: rotation about +Y; a model built facing **+Z** rotated by `yaw` faces `(sin yaw, cos yaw)`.
  `Path2.yaw(s)` returns exactly this. `DIR_YAW` maps N/E/S/W to yaws.
* Heights: asphalt `ROAD_Y = 0` (draw at ~0.01), lane markings on top with polygonOffset,
  sidewalks are raised slabs with top at `SIDEWALK_Y = 0.15`, block interiors / lots / lawns / plazas at
  `GROUND_Y = 0` (buildings stand at 0 and may add a ≤0.15 plinth), park paths ~0.03,
  sea & river surface `WATER_LEVEL = -1.6`, park pond surface −0.3. Hills: `plan.heightAt(x,z)`.
* Road geometry: two lanes, right-hand traffic. Road centre ±3.5 asphalt, ±3.5..6.5 sidewalk
  (curb-side 0.8 m = furniture band at offset 3.9; inner 2.2 m = walking band at offset 5.4).
  Crosswalk zebras span 4..7 m from each junction centre; stop line at 7.5 m.
* Scale references: person 1.75 m, door 2.2 m, storey 3.2–3.6 m, car 4.3×1.8×1.45, bus 11×2.5×3.1,
  street lamp 6–7 m, mature tree 7–11 m.

## 4. The plan (src/core/plan.ts) — what's where

* `plan.blocks[]` interior rectangles with `kind` (district) and default `surface`.
* `plan.lots[]` buildings: `footprint` (stay inside it; overhangs ≤1.2 m only above 2.4 m), `height`,
  `floors`, `kind`, `front` (street side), `doors[]`, `roof`, `style`, `shopfront`, `seed`, `name`.
* `plan.areas[]` ground-cover rectangles (lawn, garden, plaza, parking+stalls, courtyard, pond(ellipse),
  field, playground, beach, boardwalk, promenade, allotment, yards…) with `greenery` (0..1 tree density
  allowed) and `layer` (higher draws over lower when overlapping).
* `plan.features[]` landmarks/props with position, yaw, optional `rect`, `a`/`b` endpoints, `radius`
  (solid footprint), `params`.
* `plan.slots[]` street-furniture slots in the sidewalk furniture band, pre-assigned: lamp, tree, bench,
  bin, hydrant, busstop, bikerack, planter, mailbox, phonebox, newsstand, empty. `yaw` faces away from the road.
* `plan.paths[]` walkways outside the sidewalk system (park/plaza/market/boardwalk/pier/bridge/
  promenade/riverbank/beach) with width, surface, y, `draw` (should the ground renderer draw it).
* `plan.benches[]` bench seats (+ the walkway point in front of them).
* `plan.water`, `plan.rail`, `plan.busStops`, `plan.busRoutes`, `plan.pois` (camera views), `plan.districts`.
* `?planview` (optionally `?planview=x0,z0,x1,z1&layers=lots,peds,…`) draws the plan as a 2D map.

## 5. Simulation services

* **Roads** `ctx.roads`: `lanes[]` (Path2, speed, `out`/`in` movements, `crossing`, `busStops`, sink/source),
  `movements[]` (curve Path2, turn, speed, `conflicts`, `crosswalks`), `intersections[]` (control,
  arms, crosswalk rects, `signals`/`stopSigns` pole positions, offset), `crossings[]` (level crossings:
  `closed`, `gate`, `occupied`), `busRoutes[]`.
* **IntersectionManager** `ctx.intersections` (see header comment in intersections.ts for the protocol):
  `aspect(node, arm)`, `pedAspect(node)`, `phase(node)`, `approach()`, `canEnter()`, `enter()`, `leave()`,
  `forgetVehicle()`, `canCross()`, `beginCross()`, `endCross()`. Signals use an exclusive pedestrian phase.
* **Pedestrian graph** `ctx.peds`: nodes/edges with `halfWidth` (lateral offset limit → stays inside the
  walkway), `edgeY(e,t)` for the surface height, `route(a,b)` A*, `doorNodes`, `stationDoorNodes`,
  `busStopNodes`, `benches`, `leisureNodes`.
* **Occupancy** `ctx.occupancy.has(x, z, OCC.BUILDING | …)` for placement and invariant checks.
* **Clock** `ctx.clock`: `hours`, `speed`, `night`, `daylight`, `dusk`, `lightsOn`, `sunDir`, `moonDir`.
* **Uniforms** `ctx.uniforms` = `globalUniforms`: plug them straight into custom shaders.
* **Events** `ctx.events.on/emit` — e.g. `'train:arrive'`, `'bus:stop'`, `'crossing'`, `'lights'`.
* **Pickers** `ctx.pickers.push({ name, pick(ray) })` → camera follow / info card (PickHit in context.ts).
* **Services** `ctx.services.<name>` (typed in context.ts): camera, sky, postfx, traffic, pedestrians,
  rail, audio, ui, and anything else a module wants to expose (`ctx.services.smoke` etc.).

## 6. Art direction — "a world, not a model" (since 2026-10; the tabletop look lives on as `?diorama`)

The city must read as a **place one could live in**, from the hero overview down to eye level
(binding brief + references: `docs/progress/WORLD-PLAN.md`; critique and history: `docs/progress/WORLD.md`):
* it sits in a landscape that continues to the horizon — farmland patchwork, hedgerows, villages, forested hills,
  mountain ranges in blue aerial perspective, the river arriving from the W, open sea and an island to the E;
  no slab, plinth, table or visible end of the world from any camera position;
* organic density at every scale: grass blades, wildflower meadows, reeds, weeds in pavement joints, leaf-card trees
  with sky gaps, balcony greenery, weathering (damp, streaks, moss, worn asphalt, puddles) — no clean flat surface;
* light like the references: golden hour = warm sunlit faces, cool blue shade, long raking shadows, backlit
  foliage / bunting / meadows; physical sky with real cumulus; haze that separates depth layers;
* life everywhere, all moved by one wind (`core/wind.ts`): gusts through meadows and trees, flags, bunting, laundry,
  chimney smoke, birds, insects, leaves; busy café terraces, two-wheelers, vendors, buskers;
* night stays a showcase: warm windows, street-light pools, terrace string lights, puddle reflections, town glow;
* keep each district's identity (glassy downtown, pastel old town, brick industry, cosy suburbs, green park,
  sandy beach, harbour); procedural only (canvas / data textures, no photo assets).
In `?diorama` the original painted-tabletop presentation applies (slab, plinth, oak table, cyclorama, tilt-shift).

## 7. Performance budget (target: 60 fps on an integrated Adreno X1-45 at ~1300×930 px)

* Whole scene < ~350 draw calls including the shadow pass; < ~2.5 M triangles in view.
  Merge static geometry per material (`merge()`), use `InstancedMesh` for repeated things; share materials.
* Per-module CPU per frame: < 1 ms for static modules, < 3 ms for traffic / pedestrians.
* No allocations in per-frame hot loops (reuse Vector3/Matrix4/Quaternion scratch objects).
* Shadows: big things cast; tiny props don't (`castShadow = false`). Ground/roads only receive.
* Procedural textures are generated once at init via canvas (small sizes, ≤1024², reuse!).
* Prefer `MeshStandardMaterial` (high roughness, metalness≈0) or `MeshLambertMaterial` for small stuff;
  inject effects (night windows, wind sway) with `onBeforeCompile` so materials keep fog + shadows.
* Avoid z-fighting: never put coplanar surfaces closer than ~3 cm; for decals use polygonOffset.

## 8. Testing

```
node scripts/shot.mjs --q "only=sky,roads&time=11" --view downtown --out shots/roads_1.png --stats --invariants
node scripts/shot.mjs --view "0,0,-60,120,30,35" --hours 21.5 --wait 4000 --out shots/night.png
```
`--view` takes a POI id (`plan.pois`: overview, downtown, harbor, beach, park, oldtown, station, riverside,
stadium, westbrook, industry) or `x,y,z,distance,yawDeg,pitchDeg`. The JSON report lists console errors,
page errors, failed modules, stats and invariants. **Then Read the PNG to look at it.** Only one browser
runs at a time (shared lock) — keep runs short, don't loop endlessly. The dev server is already running at
http://127.0.0.1:5173 (Vite HMR); don't start another one. Other modules are being built in parallel, so
use `?only=sky,<your modules>` while iterating (the sky module provides lighting; if it is not ready the
fallback lights are used). Errors from modules you don't own are not your problem — mention them in your report.

## 9. Rules for builder agents

* Edit only the files you own (your module files + your own sub-folder). `src/core/*`, `src/main.ts`,
  `src/debug/*`, `index.html`, `package.json` belong to the lead. If you truly need a core change, keep it
  minimal and **additive** (new optional field/helper), never change existing behaviour, and report it.
* No new npm dependencies, no external URLs/CDNs/assets. Everything procedural (canvas textures,
  generated geometry, WebAudio synthesis). Available: `three` (+ `three/examples/jsm/*`), `postprocessing`, `n8ao`.
* Console must stay clean in normal operation: no errors, no warnings, no log spam
  (gate diagnostics behind `ctx.debug.enabled`).
* `npx tsc --noEmit -p .` must pass for your files.
* Implement `stats()` and, for simulations, meaningful `invariants()`.
