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
See "State" at the end.

## What was found about zoom
**Magnifying exposes poor versions, in one way or another, for the levels picked by plain distance.** People, vehicles, far facades, far land and the bubble already divide by the field of view or go by pixels. Plain distance, not lens-aware before: `NearCells` (lamp-post kit, signal fixings, tree guards), leaf clusters, fine plants, landmark trims, props near/far, grass rings. All now follow `nearLens.zoom`; the grass rings centre where the same picture would be seen from without a lens (`uGcEye`). With the lens at 1, all of this is exactly what it was.
**Close focus was wrong at the closest range:** the autofocus had a floor of 2.5 m, so everything at 1 m was out of focus, walls and people first. Now it focuses on what the ray meets, down to 0.5 m, including people and cars (a pick twice a second, only in this close state).
**The aperture was too open for a town at street level:** f/1.6 in a 35 mm equivalent gave blur of 3.6 px at infinity with focus at 3 m, which read as a model. Now f/2.8 by default (`?lensN=1.6` restores it): sharp at 3 m, a real close-focus look at 1 m. Photo mode starts at f/2.8 too and its slider still goes to f/0.5. The film sets its own apertures, unchanged.
Not done, on purpose: an optical zoom on the orbit wheel. It would change how the wheel has always worked.
