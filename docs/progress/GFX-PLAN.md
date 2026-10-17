# Graphics overhaul — shared plan (lead-owned; every agent reads this first)

Source: the visual audit of 2026-10-17 (reference "before" captures in `shots/baseline/`, the three
labelled evidence sheets `shots/baseline/audit_*.png`). Goal: a clearly visible, polished upgrade in
all ten areas below — not token tweaks — while keeping the Adreno X1-45 performance target.

## The ten items → workstreams

| # | Audit finding (short) | Workstream (agent) |
|---|---|---|
| 1 | Flat, fill-dominated daylight; shadows soft blue smudges at mid/far range; golden hour ≈ noon | **stage** |
| 2 | Night is not a showcase: navy day-for-night, additive "polka-dot" lamp discs, city doesn't glow from afar | **night** (emitters, light map) + **stage** (night ambient/backdrop) + **buildings** (far-field window glow) |
| 3 | Model floats in a grey void; backdrop ignores time of day; aircraft blur smudges in the hero view | **stage** |
| 4 | Water = flat plastic: no reflections, ignores sunset/night lights, grey river, no hull foam, confetti wakes | **water** |
| 5 | Glass towers = flat wallpaper (tint noise, cold blue at sunset, no glint/horizon, blind moiré) | **buildings** |
| 6 | Trees = smooth plastic blobs; faceted cone conifers clash | **vegetation** |
| 7 | Large empty hardscape (forecourts, plazas, quays, yards, court); detail too faint | **hardscape** |
| 8 | Facades/roofs flat at normal distance; daytime windows = dark stickers | **buildings** |
| 9 | Bare back gardens; repeated house massing | **hardscape** (garden props) + **buildings** (house massing) |
| 10 | Cliffs = smooth tan walls; flat lawns; stadium shell a plain box | **terrain** |
| + | (user request) Human figures: more realistic anatomy, clothing, gait | **people-review** → **people** |

## File ownership (edit ONLY your files; the tree is shared and served live)

| agent | owns |
|---|---|
| lead | `src/core/*`, `src/main.ts`, `scripts/*`, `docs/progress/LEAD.md`, this file, git |
| stage | `src/render/**` (sky, sky/*, postfx, postfx/*, look, focus), `src/world/terrain/slab.ts`, aircraft routes in `src/sim/ambient/vehicles.ts` |
| night | `src/world/lamps.ts` (+ new files under `src/world/lamps/`), `src/core/lampLight.ts` internals (keep the API), `src/world/props/glow.ts`, `src/world/terrain/glow.ts`, `src/world/landmarks/glows.ts`, `src/world/landmarks/shaders.ts`, `src/world/landmarks/materials.ts`, glow/floodlight parts of `src/world/harbor.ts` + `src/world/harbor/material.ts` |
| water | `src/world/water.ts`, `src/world/water/*`, `src/sim/boats.ts`, `src/sim/boats/*` |
| buildings | `src/world/buildings.ts`, `src/world/buildings/*` |
| vegetation | `src/world/vegetation.ts`, `src/world/vegetation/*` |
| hardscape | `src/world/roads.ts`, `src/world/roads/*`, `src/world/props.ts`, `src/world/props/*` except `glow.ts` |
| terrain | `src/world/terrain.ts`, `src/world/terrain/*` except `slab.ts`/`glow.ts`, `src/world/landmarks.ts`, `src/world/landmarks/*` except `glows.ts`/`shaders.ts`/`materials.ts` (stadium shell etc.) |
| people (added later: realistic human figures) | `src/sim/pedestrians/figure.ts`, `render.ts`, `looks.ts`; render/pose plumbing only in `src/sim/pedestrians.ts` and `crowd.ts` (never movement logic). A read-only reviewer writes `docs/progress/people-review.md` first. |

Need something in a file you don't own? Write it under "Requests to other areas" in your log; the
lead relays it. A minimal additive change to a lead-owned file is allowed if you are blocked — list it
under "Changes outside my area". Never edit another agent's files. Never run git commands that write
(add/commit/stash/checkout/reset) — the lead commits.

## Contracts

* **Lamp light map** (`src/core/lampLight.ts`): register static lights with `addLampLights()` during
  module creation; the lamps module bakes them after `'modules:ready'` into `uLampMap`; shaders include
  `LAMP_GLSL` + `lampUniforms()` and add `albedo * thLampLight(worldPos, worldNormal)` to outgoing
  radiance (see the file header). Material owners integrate it in their own materials: ground
  (terrain), roads + props furniture (hardscape), facades (buildings), trees (vegetation),
  landmarks + harbour (night). The map is black until baked, so integrate early.
* **Reflections**: `LAYERS.REFLECT` (`src/core/layers.ts`) marks meshes the water reflection pass draws.
  The water module may enable it on other modules' meshes at `'modules:ready'` by name.
  `ctx.services.water.setReflectionQuality(0|1|2)` — the stage agent's adaptive ladder calls it.
* **Events**: `'modules:ready'` fires once after every module is created, before the first frame.
* **Palette ownership**: `src/render/sky/palette.ts` (all keys incl. NIGHT) belongs to stage. The night
  ambient is stage's job; emitters (lamps, windows) belong to night/buildings. Stage publishes the new
  day key first (milestone S1) so everyone tunes against the final lighting.

## Art direction (keep it one coherent diorama)

* "Painted tabletop miniature": matte, gently saturated, soft warm key + cooler fill, crisp contact
  shadows and AO sell the scale; tilt-shift stays. Use `PALETTE` (`core/gfx.ts`) and existing
  district identities (glassy downtown, pastel old town, brick industry, cosy suburbs, sandy beach,
  steel-and-rust harbour).
* Detail must survive viewing distance: the audit's recurring flaw is variation of ±3–8 % that
  vanishes beyond ~50 m. Aim for readable macro variation (≈10–25 % tonal) at 100–300 m, with fine
  detail box-filtered (fwidth) so it fades instead of sparkling. No moiré, no shimmer, no noise that
  crawls when the camera moves.
* Procedural only (no image files, URLs, CDNs); no new dependencies; keep the build single-file.
* Night palette: warm sodium `#ffb866`/`#ffc979` (old town, suburbs, parks), neutral LED `#fff1d6`
  (downtown, plazas), cool `#d6e6ff` floodlights (harbour, stadium), windows `#ffd59a`-ish with
  variety. Light must multiply surface colour; never paint flat additive discs.

## Performance (target: integrated Adreno X1-45, ~1920×1025, currently ~18–22 ms/frame)

* Scene is vertex-bound: ≈145 draw calls. Budget for ALL new work: ≤ +2 ms on `high`, ≤ +0.5 ms on
  `medium`/`low`, ≤ +6 draw calls total. Per workstream: stage ≤ 0.3 ms (any extra shadow pass only on
  `high`, and as an adaptive step), night ≤ 0.3 ms net, water ≤ 1.5 ms reflection (high only + adaptive
  step) + ≤ 0.2 ms rest, buildings ≤ 0.3, vegetation ≤ 0.3, hardscape ≤ 0.4 (+ ≤ 2 draw calls),
  terrain ≤ 0.3 (+ ≤ 1 draw call).
* No per-frame allocations; instance/merge; LOD what is small; keep shadow casters few.
* This container has no GPU: the scripts run SwiftShader (software). Its absolute timings mean nothing
  and its cost profile is fragment-heavy. Report per change: draw calls + triangles (`--stats`), a
  SwiftShader A/B from ONE `perf.mjs` run (relative), and a reasoned GPU estimate (passes, vertices,
  texture fetches, ALU). Prefer a URL switch that turns your new feature off (e.g. `?nowaterrefl`) so
  A/B variants run in the same build.

## Testing protocol (shared machine: 4 cores, software GL ≈ 10 fps, page load 1–3 min)

* `shots/servers.sh` (re)starts the dev servers: **5173 = working tree**, **5174 = frozen baseline**
  (original code) for before/after with `--url http://127.0.0.1:5174/`.
* Prefix every script with `TH_LOCK_SLOTS=2` (two browsers may run at once; the lock queues the rest).
* Batch: one `capture-set.mjs` session for many views/hours beats many `shot.mjs` runs. Iterate with
  `--q "only=<modules you need>"` (loads much faster) at 1280×720; full-city sets at milestones.
  Deterministic query: `nointro&noidle&adaptive=0&quality=high` (+ `time=…`).
* Hide the HUD for judging art: `shot.mjs --hideui` / `capture-set.mjs --hideui 1`. Views for capture-set: POI ids or `name=x,y,z,dist,yaw,pitch` joined by `;`.
* ALWAYS Read the PNGs you produce. Put outputs under `shots/<agent>/`.
* Other agents edit live: if `failedModules` lists a module you don't own, re-run later; don't fix it.
  Keep YOUR files loadable at all times (typecheck after each significant edit:
  `npm run typecheck 2>&1 | grep -E "src/(your|paths)"`).
* Console must stay clean (diagnostics only behind `?debug`); `invariants()` must stay empty.

## Logs

Each agent keeps `docs/progress/gfx-<agent>.md`: brief, design, milestones done, before/after shot
paths, perf numbers, toggles, open issues, "Requests to other areas", "Changes outside my area",
best views. Update it after every milestone (runs here have been cut off before).
