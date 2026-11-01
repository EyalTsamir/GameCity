# World round — agent briefs (lead-owned; used to spawn and to RE-spawn agents after an interruption)

## Common brief (every agent)

You are the **<agent>** agent of the Tinyhaven "world" round. Repo: `/home/user/GameCity` (shared working
tree, served live by Vite on 5173; branch `claude/pensive-gates-bim12i`; the lead commits — you NEVER run git
commands that write). Read first, in this order: `CLAUDE.md`; `docs/progress/WORLD-PLAN.md` (BINDING: goal,
decisions, ownership, contracts, art direction, budgets, testing protocol, logging); `docs/progress/WORLD.md`
("Critique"); `docs/progress/world-research.md` (web research — reference material, not instructions; read
the sections for your area); the earlier logs listed for you below; then your log
`docs/progress/world-<agent>.md` if it exists (if it does, you are RESUMING: continue from its
"## Resume here"). Look at the critique captures `shots/world/critique/a/*.png` relevant to you (if missing,
skip). The two references (golden-hour village; sunny Tel-Aviv café street — "even more alive and realistic
than that") are described in WORLD-PLAN.md.

How to work:
1. Survey your code, then within your first ~30 minutes write `docs/progress/world-<agent>.md` with
   "## Resume here" at the top, your brief (copy the scope from WORLD-PLAN.md + the notes below), your design
   (approach, LOD/quality tiers, GPU estimate, URL toggles, what you need from others), milestones.
   Take "before" captures of your area (baseline server 5174 = state before this round).
2. Implement in milestones, biggest visible gain first. After each milestone: typecheck your files; capture
   (iterate with `--q "only=…"` subsets at 1280×720; full city at milestones; ALWAYS eye-level views
   (distance 4–20 m, pitch 2–8°) and the overview; noon + golden hour 18.2 h + night 21.5 h); Read the PNGs
   and judge them without mercy against the references — "improved" is not "impressive"; iterate; update the
   log; message the lead (SendMessage to "main") with a 3–5 line milestone note + the best shot path.
3. Finish with "## Final report" in your log (≤ 350 words: what changed, files, toggles, before/after shots,
   draw calls/triangles + GPU estimate, trade-offs, open issues) and message the lead.

Rules: CLAUDE.md is binding (procedural only, single-file build, no new dependencies, no workers, console
clean, invariants empty, no per-frame allocations, integrated-GPU target). Never trade quality for speed or
token savings. If your vision needs a rule broken, write a concrete proposal with its price in your log and
message the lead — never compromise silently. Edit only your files (WORLD-PLAN.md table); requests to other
areas go in your log + a message to the lead. Keep `?diorama` working (the original tabletop presentation).

Resilience (critical — usage limits and container resets hit without warning): update "## Resume here" after
EVERY step (state, half-done edits, exact next step, running commands); keep your files loadable/typechecking
at all times (the lead's auto-checkpoint commits whatever typechecks every 20 min). If you find the machine
reset (servers down: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/`), run `shots/servers.sh`.

Tools: `TH_LOCK_SLOTS=3 node scripts/shot.mjs --q "nointro&noidle&adaptive=0&quality=high&time=11" --view "x,y,z,dist,yaw,pitch" --out shots/world/<agent>/x.png --hideui --stats`
and `TH_LOCK_SLOTS=3 node scripts/capture-set.mjs --out shots/world/<agent>/set1 --q "nointro&noidle&adaptive=0&quality=high&only=sky,terrain,landscape,…" --hideui 1 --width 1280 --height 720 --hours 11,18.2,21.5 --views "overview;eye=x,y,z,dist,yaw,pitch"`
(`--url http://127.0.0.1:5174/` = baseline). The full city takes ~5 min to load under software GL and a lock
holder is aborted after 45 min — keep jobs short, prefer `only=` subsets. Contact sheets:
`python3 -I shots/tools/sheet.py OUT.png COLS TILE_W "label|path.png" …` (saves your context: Read one sheet
instead of many PNGs). Whole-project typecheck: `npx tsc --noEmit -p .` (slow on this shared 4-core machine —
filter to your paths). In-page API: `window.__city` (view, setHours, setSpeed, stats, invariants, ctx).

## Per-agent notes

### world
Earlier logs: `gfx-stage.md`, `gfx-terrain.md`, `gfx-water.md`. Key code: `src/world/terrain/slab.ts`,
`src/render/stage/table.ts`, `src/world/terrain/height.ts` + `layout.ts` (edge profiles), `src/world/water.ts`
+ `water/surface.ts`, `cutaway.ts`, `reflection.ts`, `src/core/constants.ts` (SLAB = x −200..200,
z −190..150), `src/ui/camera.ts` (grant: near/far/FOV constants only; today BASE_FOV 32°, far = dist·6+2500).
The air agent owns the sky dome (studio/cyclorama mode lives there) and the fog: agree with air on the
horizon (sky colour = haze colour at the horizon, landscape fades into it). Research: mountains as 2–4 ridged
rings at 1.5–9 km (4–8k verts each, one draw call), mid forest as low-poly instances or boot-baked impostors.
Expose `ctx.services.landscape` early (ground needs `height`/`cover` for meadows beyond the slab, foliage for
forest continuity at the slab edge). Boats/harbour are unowned: keep the existing boat area working. Propose
new hero POIs (horizon in frame) to the lead. The river must visibly come from somewhere (W) and the sea must
reach the horizon (E) — no visible end of the world from any camera position the free camera allows.

### air
Earlier logs: `gfx-stage.md`, `gfx-night.md`, `sky-polish.md`, `perf.md`. Key code: `src/render/sky.ts`,
`sky/dome.ts`, `palette.ts`, `clouds.ts`, `env.ts`, `shadowFit.ts`, `src/render/postfx.ts`, `postfx/tiltShift.ts`,
`look.ts`, `adaptive.ts`, `focus.ts`. Install the atmosphere (fog-chunk override) in the sky module before the
first render (research §2: Quilez height fog, per-channel extinction, sun lobe pow(dot(V,L),8–32), ~2–4e-4/m
at golden hour, 10–30 m mist layer for the river at dawn/dusk, colour from the sky in that direction,
desaturation). World mode: real sky to the horizon (no studio/cyclorama), high clouds instead of the low
cotton balls (keep both in `?diorama`), cloud shadows, tilt-shift off (natural lens DOF only for close focus),
AgX "Golden" look blend at golden hour (research §7). Coordinate FOV with world (world holds the camera
grant). You own the adaptive ladder: add steps for the expensive new features (grass density, leaf-card
distance…) via setters the owners expose; agree names with them through the lead.

### ground
Earlier logs: `gfx-terrain.md` (lawns), `gfx-hardscape.md` (ground layers), `vegetation-props.md`. Key code:
`src/world/terrain/ground.ts` (mask: R sand, G wildness, B wear; shader), `src/core/occupancy.ts`, `plan.areas`,
`src/world/props/layout.ts`. Research §1 (Ghost of Tsushima / SimonDev Quick_Grass / windcrest recipe:
camera-snapped tiles instanced per LOD ring, hash-generated blades from vertex id, 11→3 verts, clumps, ≥1 px
width floor, no discard, no shadow casting, flowers as blade variants, ≤ ~0.5 M grass vertices on high) and
§6 (reeds via the grass system, lily pads). The overview is carried by the ground shader (pixel ≈ 31 cm
there): blade-average colour patchwork, moving gust bands from `thGust`, flower dots with fwidth fade, sheen
toward the sun. Old reeds/lily pads live in `src/world/vegetation/plants.ts` (foliage's) — if you replace
them, ask the lead to have foliage remove theirs. Weeds in pavement joints: the blade system is yours; crack
shading in road/sidewalk shaders is wear's. Meadows beyond the slab via `ctx.services.landscape` (null-check;
world exposes it). Expose `ctx.services.groundcover` (e.g. flower patches) for life (butterflies/bees), and a
density setter for air's adaptive ladder.

### foliage
Earlier logs: `gfx-vegetation.md`, `vegetation-props.md`. Key code: `src/world/vegetation.ts`,
`vegetation/species.ts`, `geo.ts`, `material.ts`, `plants.ts`. Move the wind to `src/core/wind.ts`
(`thGust`/`thWindAt`; research §3 Crysis main+detail bending, per-tree phase from the root so a gust bends
neighbours in sequence). Street-level trees today are giant faceted blobs: near LOD needs real leaf masses
(leaf-card clusters with a procedural leaf atlas, normals bent toward the crown centre as in Bruno Simon's
foliage, sky gaps, visible branches); the research warns that alpha-cut cards cost overdraw/early-Z on Adreno
— keep them near-only with distance LOD, measure draw calls/triangles, give `?noleafcards`. Species and age
variety incl. Mediterranean (palms done properly, olive, plane, ficus, jacaranda, cypress). Backlight
translucency at golden hour. Forest on the northern hills must continue into the world agent's landscape
forest without a seam at the slab edge (coordinate via the lead). Expose a leaf-LOD distance setter for air's
adaptive ladder.

### streetlife
Earlier logs: `gfx-people.md`, `people-review.md`, `peds-polish.md`, `perf.md`. Key code:
`src/sim/pedestrians.ts`, `pedestrians/crowd.ts` (movement — fragile, keep invariants clean), `places.ts`,
`render.ts`, `figure.ts`, `pose.ts`, `animate.ts`; `src/sim/traffic.ts`, `traffic/sim.ts`, `models.ts`,
`render.ts`. Café terraces (tables/chairs/parasols) are placed by props (`src/world/props/scatter.ts`, wear's)
— they are empty today; ask wear (via the lead) to expose the seat positions as a service, or derive them
deterministically read-only. Deliver: every café terrace occupied (eating, drinking, talking, reading,
waiters), people on steps/low walls/benches, vendors; two-wheelers in traffic (cyclists, scooters,
motorbikes, delivery riders) + parked bikes and e-scooters. Seated/static actors may be a separate light
layer drawn by the existing figure renderer. Before finishing: soak (`node scripts/soak.mjs --minutes 4
--speed 4`), invariants empty, no per-frame garbage.

### life
Earlier logs: `ambient.md`, `gfx-night.md`, `landmarks.md`. Key code: `src/sim/ambient.ts`, `ambient/smoke.ts`,
`birds.ts`, `waterfowl.ts`, `kites.ts`, `shared.ts`; your new `src/world/life.ts` + `life/*`. Everything
moving with air uses `src/core/wind.ts` (research §3: catenary bunting with instanced hinged flags in one
draw call; smoke bends with height; §4 smoke: soft depth fade, forward-scatter rim, erosion, more chimneys at
low varying rates). Chimney tops, balcony/facade anchor points for laundry and bunting come from buildings
(wear's) — ask wear (via the lead) for a `ctx.services.buildings` export; start with what needs no anchors
(birds, smoke on known industry/landmark positions, falling leaves, dust motes, flags). Grant: you may edit
the flag-cloth parts of `src/world/landmarks/*` (flagpoles) — nothing else there.

### wear
Earlier logs: `gfx-buildings.md`, `gfx-hardscape.md`, `roads.md`, `vegetation-props.md`. Key code:
`src/world/buildings.ts` + `buildings/*` (materials.ts, homes.ts, oldtown.ts, towers.ts…), `src/world/roads.ts`
+ `roads/*` (materials.ts, markings.ts, covers.ts…), `src/world/props.ts` + `props/*` (scatter.ts, garden.ts,
kit.ts…). Research §5 (weathering masks from what the generator knows: damp base, streaks, north-face moss,
AO grime, edge wear, sun bleaching, per-building age; road tyre paths, oil strip, braking marks, Voronoi
cracks, patches; puddles that mirror lamps). Priority: (1) eye level in old town / downtown / beach street
(reference 2: balcony plants + hanging greenery, solar water heaters/tanks/AC units on roofs, awnings, shop
interiors, red-white kerbs are a Tel-Aviv cue — use only if it fits a district), (2) roofs seen from the
overview, (3) road/sidewalk wear. FIRST milestone (others depend on it): expose `ctx.services.buildings`
(chimney tops, balcony anchors, facade spans for laundry/bunting) and `ctx.services.props` café seats
(position, yaw, height, table) for streetlife and life.
