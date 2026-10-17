# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Tinyhaven** — a self-running miniature-city diorama (traffic, pedestrians, trains, boats, day/night) in
Three.js r186 + TypeScript, built with Vite 8. Everything is procedural (geometry, canvas textures, WebAudio
synthesis): no external assets, URLs or CDNs. Runtime deps are only `three`, `postprocessing`, `n8ao`.

Deeper reference: `docs/ARCHITECTURE.md`. Project history and per-module status / next steps:
`docs/progress/LEAD.md` and `docs/progress/<module>.md` — read these first when resuming work, and keep them
updated after each milestone (work here has repeatedly been cut off by account usage limits; the logs are how
an interrupted task is resumed without loss).

## Commands

- `npm run dev` — dev server at http://127.0.0.1:5173 (strict port). The verification scripts below expect it running.
- `npm run typecheck` — `tsc --noEmit` (TypeScript 7 native compiler). The only static check: no linter, no unit-test framework.
- `npm run build` — Vite + `vite-plugin-singlefile` → one self-contained `dist/index.html` (~2.2 MB) that also runs from `file://`.
- `npm start` — `scripts/serve.mjs`: serve `dist/` on 127.0.0.1:4173 (next free port) and open the browser.
  `Launch Tinyhaven.cmd` = build if `dist/` is missing, then serve (or open the file directly when Node is absent).

### Verification harness (in place of unit tests)

All scripts drive the system Chrome headlessly via `playwright-core` (`channel: 'chrome'`, ANGLE/D3D11 → the real
GPU), serialize on the lock dir `scripts/.shotlock` (one browser at a time — safe to call from parallel agents),
and swallow Vite's HMR websocket so a test page never reloads mid-run. Always Read the PNGs they produce.

- `node scripts/shot.mjs --q "only=sky,roads&time=21" --view downtown --out shots/x.png --stats --invariants --validate`
  — screenshot + JSON report (console errors/warnings, failed modules, frame errors, stats, invariants).
  `--view` = a POI id from `plan.pois` (overview, downtown, harbor, beach, park, oldtown, station, riverside,
  stadium, westbrook, industry) or `"x,y,z,distance,yawDeg,pitchDeg"`; also `--hours`, `--speed`, `--eval`, `--shots/--interval`, `--wait`.
- `node scripts/capture-set.mjs --views overview,downtown --hours 11,18.2,21.5 --out shots/set` — view × time matrix in one session.
- `node scripts/perf.mjs --view downtown --hours 12 --width 1920 --height 1025 --variants ";skip=buildings"` — real frame cost
  (vsync and frame cap disabled, adaptive quality off); the difference between variants is a module's cost.
  The fps reported by shot.mjs is capped at 60 and says nothing about cost. GPU clocks make numbers noisy:
  compare variants within one run and repeat.
- `node scripts/soak.mjs --minutes 4 --speed 4` — long run sampling fps, heap, module stats and invariant violations
  (4 min at 4× ≈ one game day).
- `node scripts/ui-test.mjs` — real mouse/keyboard tests of camera/UI/audio; run one step with `--steps follow` (see its header for the list).

"Running a single test" = `shot.mjs --q "only=<module>" --invariants`, a single `ui-test.mjs --steps <name>`, or `?validate`.

### Useful URL parameters

`?only=a,b` / `?skip=a,b` (module names from `src/main.ts`), `?debug` (per-module update ms in stats, validation),
`?validate` (static world checks → console), `?planview[=x0,z0,x1,z1][&layers=lots,peds,lanes,…]` (2D map of the
plan and graphs), `?time=21.5`, `?speed=4`, `?quality=low|medium|high`, `?seed=…`, `?adaptive=0` (freeze adaptive
quality), `?nointro` (skip the opening camera glide), `?noidle` (no auto-tour after 2 idle minutes),
`?hide=traffic,pedestrians` (simulate without drawing). Modules have more debug switches, listed in their progress logs.
In the page, `window.__city` exposes `view()`, `setHours()`, `setSpeed()`, `stats()`, `invariants()`, `validate()`, `frameErrors`, `ctx`.

## Architecture

**Data first, three.js second.** `src/core/` is three-free data plus engine services, built once at boot in `src/main.ts`:

- `plan.ts` — `generatePlan()`: districts, blocks, lots (building footprints, doors, kinds), ground-cover areas,
  features (landmarks/props), street-furniture slots, walk paths, benches, road topology, bus lines, rail, water,
  POIs, `heightAt()` / `isWater()`. **Changing the city layout means editing plan.ts**; every renderer and simulation derives from it.
- `roadNetwork.ts` — lanes, movement curves through junctions, conflict sets, crosswalks, signal / stop-sign positions,
  level crossings, bus routes.
- `occupancy.ts` — 0.5 m raster (ROAD/SIDEWALK/BUILDING/WATER/SOLID/PATH/RAIL/PAVED) used for placement and invariants.
- `pedNetwork.ts` — walkway graph (edges carry a lateral `halfWidth`), A* routing, doors, bus-stop nodes, benches.
- `intersections.ts` — `IntersectionManager`, the single arbiter for junctions: signal phases (with an exclusive
  pedestrian "scramble" phase), stop-sign first-come-first-served, vehicle reservations
  (`approach → canEnter → enter → leave`) and crosswalk claims (`canCross → beginCross → endCross`).
- `time.ts` (compressed day, sun/moon, night/dusk factors), `uniforms.ts` (`globalUniforms` shared by all shaders),
  `events.ts`, `context.ts` (module contract, `Services`, `Picker`), `gfx.ts` (PALETTE + geometry helpers).

**Modules.** Each subsystem is a file default-exporting `create(ctx) → CityModule`
(`update(simDt)`, `frame(realDt)`, `stats()`, `invariants()`), with helpers in a same-named folder. `main.ts` loads
them by dynamic import in this order, each fault-isolated (a module that throws is skipped and the city still runs):
sky, terrain, water, ambient, roads, buildings, landmarks, harbor, vegetation, props, traffic, pedestrians, rail,
boats, postfx, camera, ui, audio. A module may rely only on services of modules loaded before it; anything from
later modules (e.g. camera state used by sky/postfx) is looked up lazily every frame and null-checked.
`simDt` is scaled by `clock.speed` (0 when paused, up to ~0.8 s at 8×): simulations sub-step.

**Cross-module contracts**

- `ctx.services`: `terrain.height(x,z)` (rendered ground incl. local refinements — prefer it over `plan.heightAt`),
  `terrain.portals/rocks/promenadeLamps`; `water.waveHeight/surfaceY`; `smoke.addEmitter` (ambient — signature at the
  top of `src/sim/ambient.ts`); `camera` (`flyTo(view, 0)` snaps — used by `__city.view`); `postfx.setEnabled`;
  `boats.fleet.boats`; harbour obstacles for boat navigation.
- Level crossings (`ctx.roads.crossings`): rail writes `closed`/`gate`, traffic writes `occupied`; trains hold for an
  occupied crossing, vehicles never stop inside `[s0, s1]`.
- Events: `bus:stop`, `train:arrive` / `train:depart` (pedestrian crowds, audio), `crossing`, `hour` (bells),
  `fireworks`, `lights`, `quality`.
- `ctx.pickers` feed click-to-follow and info cards (kinds vehicle/bus/pedestrian/train/boat/building/landmark/other=aircraft).
- Hard-coded couplings: the fireworks barge footprint at (180, −58) is a nav obstacle in `boats.ts`; chimney smoke
  plumes start at plan height + 0.4 (the landmark stacks end at + 0.35).

**Rendering.** `postfx` replaces `ctx.render` with a pmndrs postprocessing pipeline on HalfFloat targets (kept for HDR
bloom and a banding-free sky): N8AO computed at half resolution but applied inside the final merged effect pass
(`postfx/aoApply.ts`), a custom depth-aware tilt-shift DOF (focus = camera target distance), bloom, SMAA, grading.
`postfx/adaptive.ts` steps quality down (AO first, then render scale) from async GPU timer queries — never a
synchronous `readPixels` probe (that once forced the image to 0.6 scale). `sky` owns the sun/moon light, shadow-frustum
fitting around the camera focus, and clouds on planned paths that frame (not cover) the hero overview, with
screen-space cloud shadows. three r186 removed `PCFSoftShadowMap`: use `PCFShadowMap` + `light.shadow.radius`.

## Conventions

- 1 unit = 1 m, Y up, north = −Z, east = +X. Yaw rotates a +Z-facing model to face (sin yaw, cos yaw) — `Path2.yaw`
  and `DIR_YAW` follow this.
- Heights (`core/constants.ts`): asphalt `ROAD_Y` 0, sidewalk tops `SIDEWALK_Y` 0.15, lots/lawns `GROUND_Y` 0, sea/river
  `WATER_LEVEL` −1.6, park pond −0.3; keep ≥ 2–3 cm or polygonOffset between coplanar layers. Right-hand traffic, one
  lane each way: road ±3.5 m, sidewalk to ±6.5 (furniture band at 3.9, walking band at 5.4); crosswalks 4–7 m and the
  stop line 7.5 m from junction centres.
- Pedestrians stay inside walkways because they move along `pedNetwork` edges within ±`halfWidth`; vehicles follow
  lanes/movements; both are checked by `invariants()` against the occupancy grid. Lots: building geometry stays inside
  `footprint` (overhangs ≤ 1.2 m and only above 2.4 m).
- Performance target is an integrated Qualcomm Adreno X1-45 at ~1920×1025 device px. The scene pass is largely
  vertex-bound: merge/instance (≈145 draw calls total), distance LODs, few shadow casters, no per-frame allocations.
  Measure with `perf.mjs` before and after.
- Keep the console clean (diagnostics only behind `?debug`) and keep the build single-file: no web workers, no
  runtime-fetched assets, no new dependencies.
