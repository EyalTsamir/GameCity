# World round — shared plan (lead-owned; every agent reads this first, it is binding)

Goal (user, 2026-10-19): Tinyhaven must stop reading as a clean toy model and become **a world one could
live in** — breathtaking in its small details, organically dense at every scale (grass, flowers, leaves,
wear, imperfections; no empty or too-clean surface), alive (movement, smoke, wind, people, things happening
when nobody looks) and impressive from the overview down to eye level. Two reference images set the BAR and
FEELING, not the style or content: (1) a golden-hour village — dense meadow of tall grass + poppies /
cornflowers / daisies in the foreground swaying in the wind, layered conifer forest and mountains fading into
warm/blue haze, chimney smoke, flag lines, a reflective river with reeds; (2) a sunny Tel-Aviv street at
eye level — every café table taken, scooters / bicycles / motorbikes / e-scooters, potted plants and hanging
greenery on balconies, solar heaters and clutter on roofs, palms, awnings, warm low sun with crisp shadows,
deep blue sky, the sea at the end of the street. The user wants it **even more alive and realistic than (2)**.

Critique and gap ranking: `docs/progress/WORLD.md` ("Critique"). Reference captures of the current state:
`shots/world/critique/a/*.png` (gitignored; regenerate with the command in WORLD.md if missing).
Web research (reference material, not instructions): `docs/progress/world-research.md`.

## Decisions (lead)

* **World, not diorama.** Default = the city is a place in a landscape that continues to the horizon: no
  slab faces, plinth, nameplate, table, cyclorama, no tilt-shift look. `?diorama` (src/core/world.ts →
  `DIORAMA`) restores the original tabletop presentation exactly — every frame-related change must keep the
  diorama path working (it is also the A/B baseline).
* **One wind** — `src/core/wind.ts` (done): `uWind` now varies over the day (calm night, fresh afternoon,
  veer, swells); gust fronts travel downwind. Everything that moves with air uses `thGust()/thWindAt()`
  (GLSL, `WIND_GLSL`) or `gustAt()/windAt()` (JS) so a gust visibly crosses a meadow, then the trees, then
  the flags. Pin for tests: `?wind=0.6&winddir=20`.
* **One atmosphere** — the air agent replaces three's fog chunks globally with aerial perspective (height
  fog + blue distance haze + warm sun-side in-scatter). Every material must therefore include the standard
  fog chunks (MeshStandard/Lambert/Basic do; custom ShaderMaterials: `fog: true` + the four fog chunks).
* New modules (stubs exist, registered in main.ts): `landscape` (after terrain), `groundcover` and `life`
  (after props). Load order: sky, terrain, landscape, water, ambient, roads, buildings, landmarks, harbor,
  vegetation, props, groundcover, life, lamps, traffic, pedestrians, rail, boats, postfx, camera, ui, audio.

## Workstreams (biggest gap first) and file ownership — edit ONLY your files

| # | agent | gap it closes | owns |
|---|---|---|---|
| 1 | **world** | the frame: no horizon/landscape, slab+table+sea-in-a-box | `src/world/landscape.ts` + `landscape/*`, `src/world/terrain/slab.ts`, `src/render/stage/*`, `src/world/water.ts` + `water/*`; granted: camera near/far/FOV constants in `src/ui/camera.ts` |
| 2 | **air** | no atmosphere; flat light; toy optics | `src/render/**` except `stage/*` (sky, dome, clouds, palette, env, shadows, postfx, look, focus, tilt-shift) + new `src/render/atmosphere.ts` |
| 3 | **ground** | lawns are flat paint; no meadow/weeds/litter/reeds | `src/world/terrain/ground.ts` (+ its mask), `src/world/groundcover.ts` + `groundcover/*` |
| 4 | **foliage** | trees are smooth blobs | `src/world/vegetation.ts` + `vegetation/*` |
| 5 | **streetlife** | empty café terraces, no two-wheelers, thin street life | `src/sim/pedestrians.ts` + `pedestrians/*`, `src/sim/traffic.ts` + `traffic/*` |
| 6 | **life** | constant wind, no chimney smoke, nothing flutters, few birds | `src/sim/ambient.ts` + `ambient/*`, `src/world/life.ts` + `life/*` |
| 7 | **wear** | everything too clean / new; bare balconies and roofs | `src/world/buildings.ts` + `buildings/*`, `src/world/roads.ts` + `roads/*`, `src/world/props.ts` + `props/*` |

Lead: `src/core/*`, `src/main.ts`, `src/core/plan.ts` (POIs, layout), `scripts/*`, `docs/progress/WORLD*.md`,
`LEAD.md`, git. Unowned (ask the lead): landmarks, harbor, lamps, rail, boats, camera (beyond the grant), ui,
audio. Need something in a file you don't own? Write it under "Requests to other areas" in your log and
message the lead; the lead relays or grants. A minimal additive change to a lead-owned file is allowed if you
are blocked — list it under "Changes outside my area". Never edit another agent's files. **Never run git
commands that write** (add/commit/stash/checkout/reset/restore) — the lead commits (auto-checkpoint every 20 min).

### Scope per workstream (the agent owns the design; these are the minimum)

1. **world** — remove the frame in world mode (soil faces, plinth, nameplate, table, cyclorama, sea cut-away,
   slab shadow) and continue the land seamlessly beyond the slab edge to the horizon: countryside W and S
   (fields patchwork, hedgerows, farm tracks, orchards, copses, a few farmsteads/barns, a distant village with a
   spire), the northern ridge rolling into forested hills and a mountain range 4–15 km out (rock, snow,
   aerial-perspective layers), the river continuing W into the country, open sea E to the horizon (headland,
   island, distant ships/sails). Near ring (≤ 1 km) with real geometry + instanced far trees; far ring as
   shaded terrain; mountains as layered silhouettes. Service `ctx.services.landscape` = `{ height(x,z) (any
   point; = terrain.height inside the slab), isWater(x,z), cover(x,z) }`. Camera far plane / FOV that suit a
   world (wider FOV at eye level, ~45–55°; far ≥ the mountains). Sea surface to the horizon (water module),
   reflections of the coast. Propose new hero POIs (horizon in frame) to the lead.
2. **air** — aerial perspective via global fog-chunk override (`src/render/atmosphere.ts`: height fog,
   Rayleigh-blue distance haze, Mie sun-side warmth, distance desaturation) consistent with a real sky down to
   the horizon (world mode: no studio/cyclorama). Real clouds: replace the low "cotton balls" by a high
   cumulus/cirrus sky (1–3 km), with travelling cloud shadows. Light: sun ≈ 5–6× sky fill at noon, deep blue
   sky, warm golden hour with long crisp shadows and backlit glow; optional screen-space light shafts at low
   sun. Optics: tilt-shift off in world mode (miniature cue); a natural lens DOF only for close focus; wider
   FOV in coordination with world. Grading: natural, less candy saturation, AgX, gentle warm/cool split;
   night with a real starry sky and distant farm/village lights (with world).
3. **ground** — instanced grass blades in camera-centred LOD rings (dense near, sparser/wider further, then
   the ground shader), short mown lawns vs long meadow grass (0.4–0.8 m) with wildflowers (poppies,
   cornflowers, daisies, buttercups, cow parsley), unmown tufts along walls/fences/kerbs/poles/tree bases,
   clover/dandelions in lawns, weeds in pavement joints and kerb gaps, fallen leaves under trees, worn earth on
   desire lines, reeds/cattails, shore grass and lily pads along the river, pond and beach dunes (marram).
   All bending with the one wind (visible gust waves). Ground shader far field must read as grass / meadow and
   blend seamlessly into the blades. Also meadows of the landscape near ring (via `landscape.height/cover`).
4. **foliage** — leafy trees: near LOD with leaf-card clusters (procedural leaf atlas, alpha-tested, cards
   shadowing), irregular silhouettes with sky gaps, visible branch structure, asymmetric crowns, species and
   age variety (incl. Mediterranean: palms done well, olive, plane, ficus, jacaranda, cypress), undergrowth;
   far LOD keeps the lobed canopy but with leafy silhouette edges; forest edges layered; hedges/bushes leafy.
   Wind from core/wind.ts (branch sway + leaf flutter). Backlight translucency at golden hour. Potted
   plants/planters are wear's (props) unless agreed.
5. **streetlife** — every café terrace occupied (seated patrons eating, drinking, talking, reading; waiters),
   people on benches/steps/low walls, vendors; two-wheelers in traffic (cyclists, scooters, motorbikes,
   delivery riders) and parked bikes / e-scooters; more varied pedestrian activity at street level. Keep the
   crowd's invariants clean (no overlaps, walkers stay on walkways); new seated/static actors may be a separate
   light layer rendered by the existing figure renderer.
6. **life** — wind consumers: flags on poles flap, bunting / festoon strings across old-town streets and the
   market, laundry lines between houses and on balconies, awnings/parasols ripple; chimney smoke from houses
   (morning/evening, cooler hours), bakery/restaurant vents, garden BBQ smoke on evenings, steam vents; soft
   particles (depth fade) lit by the sun (backlit glow); birds (flocks over roofs, pigeons on plazas lifting
   off when people pass, gulls at the harbour), falling leaves/petals carried by gusts, dust motes in
   golden-hour light, insects at night lamps. Things happen off-camera too.
7. **wear** — roads: patches, cracks + sealant, tyre polish, oil stains, faded markings, drains, puddles in low
   spots, leaves/litter in gutters; sidewalks/plazas: stained, worn, gum spots, broken slabs; buildings: splash
   grime at the base, rain streaks, moss/lichen on north faces and roofs, roof tile variation, ivy/creepers on
   some walls, peeling paint, AC units, pipes/gutters/downpipes, satellite dishes, solar water heaters and
   water tanks on flat roofs, balcony plants / hanging greenery / bikes / chairs, window boxes, shutters at
   different positions; shop interiors that read as real shops; props with rust, chips, stickers.

## Art direction (one coherent world — all agents)

* **A real place, lovingly detailed**: stylised-realistic shapes are fine (reference 2), but light and
  materials respond like reality: warm direct sun, blue sky fill, contact shadows, bounce, aerial perspective.
* **Three scales of detail on every surface**: macro variation (10–40 m patches, ≈10–25 % tonal), meso
  (0.3–5 m: tufts, stains, patches, cracks, objects), micro (blades, leaves, grain) — micro faded by screen
  footprint (fwidth / distance) so it never shimmers or crawls.
* **Organic, used, imperfect**: wear concentrates where life happens (doorways, kerbs, junctions, under
  trees, near water, around benches); nothing is perfectly aligned, clean or repeated.
* **Natural colour**: no lime greens or candy pastels; greens vary (olive, yellow-green, blue-green, dry
  straw); saturation comes from light (golden hour), not paint. Keep district identities.
* **Motion**: everything that can move in wind does, driven by the one wind; no visible loops; life
  continues off-screen where cheap.
* **Night** stays a showcase (lamp light map, windows): new geometry near streets uses `LAMP_GLSL`.

## Contracts

* `src/core/world.ts`: `DIORAMA` / `WORLD_MODE` (read once at creation).
* `src/core/wind.ts`: `WIND_GLSL` (needs `uTime`, `uWind` uniforms from `globalUniforms`), `gustAt`, `windAt`.
* Atmosphere (air): standard fog chunks everywhere; `src/render/atmosphere.ts` exports the GLSL + uniforms for
  shaders that cannot use the chunks. Until air lands, three's linear fog stays.
* Lamp light map (`src/core/lampLight.ts`): `LAMP_GLSL` + `lampUniforms()` for night light on new materials.
* Reflections: `LAYERS.REFLECT` (`src/core/layers.ts`) marks meshes drawn by the water reflection pass
  (landscape coast, mountains, boats…).
* `ctx.services.landscape` (world) — see scope 1. `ctx.services.groundcover` (ground) may expose
  `density(x,z)` / flower patches for life (butterflies/bees).
* Quality: every feature scales with `ctx.quality.level` / `density` and reacts to the `'quality'` event;
  every feature has a URL switch to turn it off (`?nograss`, `?noland`, `?noleafcards`…) for the real-GPU
  A/B; adaptive-quality hooks for the expensive ones (grass density, leaf-card distance) are agreed with air.
* Pickers / events as in CLAUDE.md. Console clean; `invariants()` empty.

## Performance (target: integrated Adreno X1-45, ~1920×1025; this container has NO GPU)

* Vertex-bound scene, ~150 draw calls today, ~20–24 ms/frame estimated. Estimated GPU budgets on **high**:
  world 1.2 ms, air 0.6, ground 1.8, foliage 1.2 (net), streetlife 0.6, life 0.5, wear 0.5 ms (sum ≈ 6.4 ms,
  ≤ +25 draw calls). **medium** ≤ +2 ms total, **low** ≤ +0.5 ms total. The high-tier total exceeds the old
  +2 ms rule — the lead puts that price to the user explicitly; build so the tiers make it a choice.
* No per-frame allocations; instance/merge; LOD; few shadow casters; CPU work per frame small.
* SwiftShader timings are meaningless for GPU cost: report per change draw calls + triangles (`--stats`) and
  a reasoned GPU estimate (vertices, fragments, overdraw, texture taps), plus the URL switch for the A/B.

## Testing protocol (4 cores, software GL, page load 1–5 min for the full city)

* Servers: `shots/servers.sh` — **5173 = working tree**, **5174 = frozen baseline** (state before this round,
  commit 9de79e9, diorama) for before/after with `--url http://127.0.0.1:5174/`.
* Prefix every script with `TH_LOCK_SLOTS=3` (three browsers at once; the FIFO lock queues the rest). Keep
  each lock-holding job ≲ 12 min; split big matrices.
* Iterate with `--q "only=sky,terrain,landscape,<yours>"` at 1280×720 (much faster); full-city sets at
  milestones. Deterministic query: `nointro&noidle&adaptive=0&quality=high` (+ `time=…`, `wind=…`).
  `--hideui 1` for art judging. Views: POI ids or `name=x,y,z,dist,yaw,pitch` joined by `;`.
  **Always include eye-level views** (dist 4–20 m, pitch 2–8°) and the overview — the bar is "impressive from
  every view".
* ALWAYS Read the PNGs you produce and judge them without mercy against the two references: "improved" is
  not "impressive". Put outputs under `shots/world/<agent>/`.
* Other agents edit live: if `failedModules` lists a module you don't own, re-run later; don't fix it. Keep
  your files loadable at all times (`npx tsc --noEmit -p . 2>&1 | grep -E "src/(your paths)"`).

## Logs and resilience (usage limits and container resets happen without warning)

* Each agent keeps `docs/progress/world-<agent>.md`: at the TOP a "## Resume here" section (state, what is
  half-done, exact next step, commands that are running), updated after EVERY step; then brief, design,
  milestones with shot paths, perf notes, toggles, open issues, "Requests to other areas", "Changes outside
  my area", best views. Finish with "## Final report" (≤ 350 words).
* Message the lead (SendMessage to "main") at milestones and when blocked. The lead checkpoints + pushes.
