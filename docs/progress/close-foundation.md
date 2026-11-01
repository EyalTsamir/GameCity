# Close foundation: the tools of the close-up round

Stage 1 of `CLOSE-ROUND.md`. Branch `claude/zen-jepsen-ea40f7`, port 5211. The nine later sessions build on this.

## How to use the tools (read this first)

### The test set: `scripts/closeset.mjs`
39 ordinary viewpoints spread over the city (`scripts/closeset-views.json`), each seen from 1, 3 and 10 m at the eye height of someone standing there, at noon, 18.2 and 21.5, in one page load. Contact sheets per hour, one row per viewpoint. Clock stopped, UI hidden, adaptive off.
```
node C:/Projects/GameCity/scripts/closeset.mjs --url http://127.0.0.1:<port>/ --out shots/close --area walls --d 3 --hours 12
```
- Areas: `walls doors shops ground furniture trees vehicles people rail water country`. `--ids wall-tower,furn` picks viewpoints (a prefix works). `--list` prints them.
- `--d 1,3` and `--hours 12,21.5` narrow it. 40 shots at one distance and hour take 90 s, all 351 about 15 min.
- `--q "x"` adds URL parameters. `--ab "noxxx"` loads a second page with those, and each pair lands side by side on the sheets (`B` in the label): the way to judge your switch.
- `--lens 4` magnifies ×4 and stands 4× further off, so the picture has the same size as without. What differs from the plain shot is a level of detail that ignores the lens.
- Reads: `<out>/sheet_<hour>_p<n>.png`, full frames `<out>/<id>_<d>m_<hour>.jpg`. `report.json`: triangles and draws per shot, console and frame errors, invariants.
- Adding a viewpoint: one line in the JSON. `x`, `z`, the point's height (`y` absolute or `h` above ground), `yaw` = the side the camera stands on (0 = +Z, 90 = +X). `dyn: "person" | "car" | "parked"` frames the nearest one to the anchor at that moment.

### The bubble: `src/core/nearDetail.ts`, `nearOf(ctx)`
Fine detail that exists only around the camera, for any module. Cells of a world grid are built on demand by a budgeted queue, ahead of the camera, shown inside a radius, dropped behind it. Far views: nothing built, nothing drawn. Shader compiled at boot (the boot warm-up sees every layer), so no compile when it appears.
```ts
const near = nearOf(ctx);
// one instanced draw over the cells on show; the nearest win when over capacity
near.addScatter({ name: 'pebbles', radius: 12, cell: 6, geometry, material, capacity: 3000, colors: true,
  fill(cell, out) { out.put(x, y, z, yaw, size); } });
// a merged mesh per cell (build returns null for an empty cell)
near.addMeshes({ name: 'doorHandles', radius: nearRadiusFor(0.03), cell: 16, top: 3, material, build(cell) { return geometryOrNull; } });
// anything else per cell: a texture, a few animals
near.addCells({ name: 'cats', cell: 48, radius: 40, make(cell) { return item; }, show(item, on) {}, drop(item) {} });
// work that should not cost a frame (drawing one menu into an atlas): one at a time, inside the same budget
near.job(() => drawOne());
```
- **Radius:** `nearRadiusFor(sizeInMetres)` is the distance where that size falls to one pixel: appearing there can't be seen. The reference is 50° at 1025 px; the camera's real magnification scales it (`nearLens.value`: 0.72 walking, 1 orbiting close, more through the lens). So through the lens the detail comes in further out without any work from you. A layer has a `top` (how high the detail stands, default 4 m): the camera's height above that counts as distance, so from the air nothing is on show.
- **Fade:** `nearGrow(material, radius)` for instances (they grow out of nothing from 100 % to 70 % of the radius, and vertices beyond collapse), `nearDither(material, radius)` for near-only meshes. Same radius as the layer.
- **In a shader:** `NEAR_GLSL` gives `thNearK(worldPos, radius)`, and `uNearEye` stays the main camera during shadow and reflection passes. But program size costs on this GPU even for the path not taken (baking.md): prefer geometry that exists only here, or a separate program chosen by geometry (`buildings-shell-far` is the pattern), over a branch in a city-wide shader. Measure.
- **Keep a build short:** the budget is 1 ms per frame (10 ms for 12 frames after a camera cut). One cell should build in under 2 ms; `__city.near.stats()` shows each layer's slowest build and the worst frame. The same cell always gets the same `cell.seed`; `nearRandom(cell.seed)` is a small stream: it looks the same when you come back.
- **Older distance limits:** multiply them by `nearLens.zoom` (only the magnification the user asked for, 1 otherwise): that changes nothing unless the lens is in use.
- **Switches:** `?nonear` everything, `?no<layer name>` one layer, `min:` in the spec the lowest quality tier (default medium), `?nearr=<k>` scales every radius (to find the edge), `?neardebug` paints the layers magenta. `__city.view()` builds everything at once, so harness shots never catch a half-filled bubble.
- Layers shadow nothing unless `castShadow`, and don't enter the reflection passes (they aren't in `LAYERS.REFLECT`).
- First users: `src/world/near.ts` (`nearGrit`, `nearStones`). A layer that belongs to no module can go there; better in your own module.

### Stutter while walking: `scripts/walkhitch.mjs`
Real keys (V, Shift+W) along a pavement, frame intervals, new shader programs and geometries, what the bubble built. Compare against your switch: `--q noxxx`. Use behind `scripts/power-guard.mjs`.

### Zoom
- **Wheel, orbit camera:** moves the camera, as before. Everything by distance works.
- **Wheel and + − while walking (new), Zoom slider in photo mode (new):** a real lens, ×1 to ×8, `camera.setLens(k, seconds?)`, `camera.lensNow()`, `?nolens` turns the walker's off. In your code: `nearLens.zoom` (see above).

## Resume here
Done: bubble, test set, zoom, audit (below), final checks. Nothing is required of this session. Later sessions: the tools above, the audit below for your area.

## What was found about zoom
**Magnifying exposes poor versions, in one way or another, for the levels picked by plain distance.** People, vehicles, far facades, far land and the bubble already divide by the field of view or go by pixels. Plain distance, not lens-aware before: `NearCells` (lamp-post kit, signal fixings, tree guards), leaf clusters, fine plants, landmark trims, props near/far, grass rings. All now follow `nearLens.zoom`; the grass rings centre where the same picture would be seen from without a lens (`uGcEye`). With the lens at 1, all of this is exactly what it was.
**Close focus was wrong at the closest range:** the autofocus had a floor of 2.5 m, and it read a height field with 2 m cells, so everything at 1 m was out of focus, walls and people first. Now it focuses on what the ray meets, down to 0.5 m: walls exactly (footprint boxes), people and cars by a pick twice a second, only in this close state. Things no height field or pick knows (a bench, a bin, a lamp post) still focus on what lies behind them.
**The aperture was too open for a town at street level:** f/1.6 in a 35 mm equivalent gave blur of 3.6 px at infinity with focus at 3 m, which read as a model. Now f/2.8 by default (`?lensN=1.6` restores it): sharp at 3 m, a real close-focus look at 1 m. Photo mode starts at f/2.8 too and its slider still goes to f/0.5. The film sets its own apertures, unchanged.
Not done, on purpose: an optical zoom on the orbit wheel. It would change how the wheel has always worked.

## Audit: what reads as fake up close
Full test set, 351 shots, read by two independent eyes (noon; 18.2 and 21.5), no code causes guessed. Ids are viewpoints of the test set: rerun with `--ids <id> --d <d> --hours <h>` to see one. Viewpoints were moved a little after this reading to fix blocked views (bins and hydrant now seen from the road side, rail and river wall now show rail and wall), so an id may frame the flaw slightly differently. Traffic and people change per run. Night and dusk items are marked (18.2) / (21.5).

### Top of the list, across areas
1. **People's faces, hair, limbs** (`tree-street` 10 m, `furn-hydrant` 3 m, `person-*` 1 m, `veh-moving` 1 m): faceted faces, drawn-on wrinkles, a seam at the neck, polygon hair, braids with white dotted seams, a sleeve stretched into a ribbon, claw hands, moiré cloth. Same straw-hat figures in matching groups. At night oxblood-to-black skin with a hard face shadow.
2. **Shop glass** (`shop-oldtown` 1 m, `shop-market` 1 and 3 m, `person-street` 1 m): a milky wash over a blocky interior; reflections are a placeholder street of dark boxes pasted over the room, at dusk an opaque sepia. A knife-shaped sliver floats in one window. Stock is a pixel mosaic.
3. **Night windows** (`wall-oldtown` 3 m, `wall-factory` 1 m, `wall-suburb` 1 m at 21.5): flat cream, a grey square in the pane, no depth.
4. **Light stays at its source** (21.5): sconces light nothing (`wall-house`), lobbies spill nothing on the paving (`ground-plaza` 10 m), lawn under lamps unlit (`ground-lawn` 3 m), car parks and gardens pure black (`ground-parking`, `ground-garden`). Where it does land it is uniform apricot or blown white, without shadows (`ground-quay`, `water-riverwall`, `furn-bench`).
5. **Tree trunks** (`tree-street` 1 m): a faceted prism of stacked shells with flat camouflage patches, no bark. Black slab at night.
6. **Grass and bare ground** (`ground-lawn` 1 m, `ground-garden` 1 m, `country-field` 1 m, `country-forest` 1 m): flat olive meeting textured grass at a hard edge, a repeated grass pattern painted flat, soil as square tiles, an empty forest floor. Flat confetti leaves and paper squares (`ground-kerb` 1 m).
7. **Flat walls** (`wall-oldtown` 3 m, `rail-platform` 10 m): brick as wallpaper with bright uniform mortar, ruler-straight striped stains under sills, a hairline seam across a window and a pillar.
8. **Cars** (`veh-parked` 3 m, `door-office` 10 m): soap bodies, flat tail-lights; back seats grey boxes with ball heads. At night headlights are flat haze discs with a detached central blob (`ground-road` 3 m).

### By area, worst first
**Walls and facades** (close-materials, close-windows): wallpaper brick; sill stains as straight stripes; seams through a window and pillar; porch lamp a tan box (`wall-oldtown` 3 m); roller and garage doors blank (`wall-warehouse` 1 m, also black at 18.2/21.5); night windows flat (see above); wall evenly lit at night, sills cast no shadow.
**Shop fronts and doors** (close-windows, close-text): glass, reflections and stock as in the top list; a stray diagonal line across the glass (`shop-oldtown` 3 m); bookshop interior a stretched repeat (`shop-downtown` 1 m); vertical hot bar at dusk (`shop-downtown` 1 m 18.2).
**Ground and paving** (close-materials, close-nature): half-buried crate with a black slit at its base and a beam with a detached square shadow, pale hard-edged patches (`ground-quay` 3 m); blank surfaces (`ground-parking`, `ground-beach`, `ground-plaza` 1 m), evenly spaced dark smudges on the beach; blocky stain (`veh-parked` 1 m); paper squares and flat blotches read as stickers (`ground-kerb`, `ground-sidewalk` 1 m); shade saturated navy with no grain (18.2).
**Street furniture** (close-hand): rubbish bags are faceted black rocks, planter on a floating black base (`furn-planter` 3 m); trailing plants shatter into dithered flecks, a dark mat in the air, pentagon flowers, floating plank chips (`furn-planter` 1 m); blown-out white bin lid (`furn-bin` 1 m); blunt hydrant with a white cube cap (`furn-hydrant` 1 m); blank noticeboard (`rail-platform` 10 m). Nothing casts a lamp shadow at night (`furn-bench`).
**Trees and plants** (close-nature): trunks as above; torn root polygons (`ground-lawn` 1 m); a bush as a tent of big dark cards with no ground contact (`country-forest` 3 and 10 m); understorey black at night.
**Vehicles** (close-vehicles): as above; SUV seems lifted off the road (`furn-planter` 3 m); dark cars black with no street reflection at night; car shadow splits into stripes at dusk (`ground-road` 3 m).
**People** (close-people): as above; figures black while their towels stay saturated (`ground-beach` 3 m 21.5); no warmth from shop glass 1 m away (`person-street` 1 m 21.5).
**Shadows, also my own reading** (close-light): sun shadow edges at 1 m show a woven dither in the penumbra (`ground-kerb` 1 m). Soft blur with a visible pattern, at noon, on every pavement.
**Rail** (close-materials): bogie untextured grey boxes (`rail-platform` 10 m); station floodlit in hard arcs from nothing, platform navy, no platform lamps (21.5).
**Water** (close-nature, close-light): bold scribbled loop lines on opaque teal, no depth (`water-riverbank` 1 and 3 m); angular stepped bank; at night flat, no lights or moon glitter; amber sparks hang in daylight (18.2).
**Countryside** (close-nature): earth as a square-tile mosaic, blades with no root, daisies with grey card corners, poppies as dark triangles (`country-field` 1 m); inverted at night, the track glows blue-grey and blades go pure black; ghost-white trunks under black canopies (`country-forest` 10 m 21.5); no lit window at the farm.

### What the audit could not judge
Wall detail at 1 m: the first audit ran with an autofocus that could still miss a wall by a metre. Fixed since (see above); walls at 1 m deserve a fresh look. Motion: all of this is stills, nobody has watched the bubble, the lens or the people moving.

## Measured
Final state, 1920×1025, high, AC behind `power-guard.mjs`, fresh bake.
**The bubble with its two grit layers, on and off in one page (`abprof`, 4 cycles), ms per frame:**
| view | noon | 21.5 |
|---|---|---|
| overview | +0.06 ±0.11 | −0.03 ±0.15 |
| downtown | +0.09 ±0.13 | +0.5 ±0.94 |
| street | −0.3 ±0.4 | −0.3 ±0.45 |
| market | +0.01 ±0.42 | −0.09 ±0.67 |
Nothing distinguishable from zero. Far views: nothing built, one short test per frame. That A/B hides the group, so `update()` still runs on both sides; separate page loads with `?nonear` (`perf.mjs`, noon, one repeat) read overview 31.8 / 31.7, downtown 29.9 / 29.9, street 35.1 / 34.8, market 33.5 / 33.4, within what loads differ by. Triangles: at most 7000 × 8 + 1200 × 20 = 80 k, within 8–18 m of the camera. The lens: no cost at ×1 (same limits). Through the lens the frame costs more, not measured, because everything there is drawn at a higher level of detail. f/2.8 against f/1.6: no difference in frame time.
Walking 68 m at a jog in 20 s (`walkhitch`): 0 new programs, 0 new geometries (scatter layers fill a fixed pool), 0 freezes, worst frame of building 0.6 ms, slowest cell 0.9 ms, mean 37.5 ms. An A/B of this walk with only the first, smaller grit layer: 38.7 / 38.7 on, 38.7 / 38.5 off. The final two layers were not compared on this walk.
**Current frame times (runtime, near on):** noon overview 31.4, downtown 29.3, street 33.1, market 32.9; night 32.5, 31.4, 32.5, 34.2.

## Checks on the final state
- Typecheck and build OK (4.46 MB).
- `ui-test --q noidle`: 73 of 74, the failure is `kinds` (the known flake), which passes alone. New step `lens`.
- `shot` overview at speed 4, 20 s: invariants `{}`, validate `[]`, console errors none (the known D3D compile warnings).
- `hitch` overview and street at 12 and 21.5: 0 mid-run programs, 0 freezes, slowest frame 83 ms at boot.
- `?diorama`, `?quality=medium`, `?quality=low`: invariants `{}`, no console errors, images right. Low has no bubble layers (tier medium and up).
- The full test set ran 351 shots with no frame errors and invariants `{}`.
Not checked: anything in motion by a human eye (the lens, grit growing in at its edge); the lens's cost; a phone. The film keeps its own apertures; its sheet was not rerun, because nothing it uses changed except `lensBase`, which it overrides per shot.

## Files outside what this session owns (small additive edits)
`src/main.ts` (bubble creation, update before render, `near` module, `__city.near`), `src/core/uniforms.ts` (`uNearEye`, `uNearLens`), `src/world/lamps/nearCells.ts`, `src/world/vegetation.ts`, `src/world/landmarks.ts`, `src/world/props/layout.ts`, `src/world/groundcover/field.ts` (each: the limit times `nearLens.zoom`), `src/sim/traffic.ts` (`parked()` for the test set), `src/render/postfx.ts` (default aperture), `src/ui/ui.ts`, `src/ui/hud/photo.ts`, `src/ui/hud/walkHud.ts`, `src/ui/shared.ts`, `scripts/ui-test.mjs`.

## Left for others
- Grit is only a start and a proof of the bubble. close-nature or close-materials may take it over: `src/world/near.ts`. It stays on the slab (nothing in the country yet).
- Nothing uses `addMeshes`, `addCells`, `job` or `nearDither` yet, so those paths have run only through typecheck and the shared core: the first session to use one should look at `stats()` and at `walkhitch`.
- Autofocus at 1 m on small things (bench, bin) focuses behind them. A depth read-back would fix it, not attempted: a synchronous read is forbidden here and an asynchronous one needs its own colour pass.
