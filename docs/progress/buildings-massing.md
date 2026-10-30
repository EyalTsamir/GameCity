# Buildings massing round — log

Branch `claude/buildings-massing-f65621` (based on `claude/pensive-gates-bim12i`; merged it again at 6150b5f to pick
up perf-wins). Goal: ordinary buildings read as architecture, not "a box with a triangle on top" — break the volume.
Landmarks are not in scope (boxhunt session); plan.ts layout untouched (places session); materials.ts untouched.

## Round 3 — Resume here (after the usage-limit reset) — DONE
- Done: sheets `docs/progress/massing/r2_before_after.jpg` (round-2 off vs on), `r2_overall.jpg` (?nomassing vs all on),
  `r2_night.jpg`; fresh `npm run build` OK (3.82 MB); ui-test `--q "noidle&camdebug" --steps freecam,explore,building`
  7/7, 0 errors, invariants {} (`shots/perf/uitest2.txt`; without `--q noidle` the script tests a stand-in city and
  skips building/explore — that was the "passed 1" of round 2).
- Glass crown (1f71dde): a curtain-wall glass screen between the fins (both faces, `PROF.NEVER` panes) — it read as
  a white railing / cage from mid distance; now glass carried past the roof, dark with the lit accent line at night.
- Audit 2 (sonnet, `shots/audit2`, 24 views) checked against the images — accepted and fixed (61ac540, b8b0329):
  industrial name board cut by the brick pilasters (bug) → board proud of them; porch bench in front of the door
  (bug) → bench on the side with room (or none), slatted with arms; oriel corbel ran into the window head below and
  read as a plain tray → stepped corbel table (two mouldings) + a two-step console under each front corner, within
  0.38 m of the floor line (low keeps the old corbel); steel column cover strips at the bay lines of clad sheds
  (?nomonitor); shopfronts: carved consoles at the fascia ends, capped cornice, panelled stall risers + sills
  (?noshopfront, new). Rejected: house ridge caps / verges (already there — gableRoof barge boards + ridge cap),
  apartment solid balconies (period style), Haven Tower (landmark, other session), hotel flag poles (props).
- Industrial head office (ffb5fff): the firm's name in raised letters over the top window row (depot: TINYHAVEN
  TRANSIT), lit at night; names shared with the hall's board (`FIRMS` in industry.ts).
- Harness: run perf / hitch / captures with the MAIN checkout's scripts (`node C:/Projects/GameCity/scripts/…
  --url http://127.0.0.1:5185/`) — their lock dir is shared with the sibling sessions; the worktree's own scripts
  lock only this worktree, and a first round-3 A/B overlapped another session's Chrome (numbers 40–100 % off, discarded).
- Cost (perf.mjs, main checkout, 1300×930, adaptive=0, 2 passes; `docs/progress/massing/perf-r3.txt`): shopfronts ≈ 0
  (GPU 31.1 vs 31.2 ms old-town street; +7–10k triangles); everything of rounds 1–3 vs `?nomassing`: GPU +0.3–0.4 ms
  (overview 38.7 vs 38.3, old-town street 31.15 vs 30.85, downtown 37.7 vs 37.4, industry 23.6 vs 23.2); draw calls
  unchanged; triangles +0.4–0.6 %.
- Smoothness (hitch.mjs, main checkout): mid-run program compiles 0, geometry uploads 0 in every window. The arrival
  long tasks after a camera jump (60–176 ms) are the same with `?nomassing` (interleaved A/B `shots/perf/hitchA*/B*`:
  old-town arrival 169 / 176 vs 160 ms, industry 114 / 127 vs 116 ms) — not from this work (a second `?nomassing`
  pass ran under outside load, all doubled; ignored). The machine ran ~3× the round-2 CPU frame time throughout
  (sibling sessions), so absolute hitch numbers are worse than round 2's for everyone.
- typecheck clean; `npm run build` OK (3.82 MB); captures 0 console / page errors; ui-test (main checkout,
  `--q "noidle&camdebug" --steps freecam,explore,building`) 7/7 after all round-3 changes (`shots/perf/uitest3.txt`).
- Round 3 DONE (last commit see git log). Possible follow-ups: apartment slab end walls (stair-core window strip),
  hotel flag brackets (props), a dusk / night eye-level audit pass.

## Round 2 — Resume here (overnight backlog from the coordinator)
- Backlog: 1 tower rooftop plant · 2 industrial halls / depot / harbour master · 3 Westbrook porches, midtown
  colonnade · 4 apartment loggias, glass-tower crowns · 5 eye-level audit → fix the 10 weakest, repeat.
- Done (code, typecheck clean): 1 `roofplant.ts` (verified in shots: `shots/r2plant/sheet.jpg`, ?noroofplant);
  2 industry head office / roof monitor / downpipes / plinth (?noannex ?nomonitor), harbour-master recessed porch
  (?noporch); 3 lean-to porch roofs + turned posts (?noporch), classical arcade columns + shopfronts behind arcades
  (?nocolonnade). Items 2–3 NOT yet verified in shots.
- Bug fixed after 2af8c6f: `masonry` was used by buildLobby before its `const` (lots 18 and 23 threw) — moved up.
- 2–4 verified (b7cef76, 0295250): sheet `docs/progress/massing/r2_items234.jpg`; loggias (houses.ts `loggia()`,
  ?nologgias) carry the balcony kit (plants, laundry) via an inset side geometry; glass crown = louvred fins every
  half cell + ring beam + lit accent line (towers.ts `glassCrown()`, ?nocrowns; curtain schemes, not slant/screen/twin).
- 5 audit (sonnet, `shots/audit1`, 42 views): accepted #1 bare industrial roofs → rooflight strips + ridge ventilator
  (industry.ts `rooflights()` / `ridgeVent()`, ?norooflights); #6 flat masonry office grids → piers between window
  columns + corner piers (towers.ts tierWalls, ?nopiers); head office: glazed stair tower rising over the roof
  (?noannex). Rejected: shopfront variety (blade signs exist; shop shader is the boot's long pole), glass overexposure
  (material, not massing), apartment solid parapets (period-correct).
- Verification sets: `shots/r2v`, `shots/r2c` (crown day/dusk, loggias), `shots/r2d` (rooflights/piers, before =
  ?norooflights&nopiers).
- Harness note: capture-set `--out` relative paths resolve to the MAIN checkout — always pass absolute paths.
- DONE (cut off by the usage limit before the last polish): perf, hitch, ui-test, captures `shots/r2f/{r2on,r2off,on,off,night}`
  all ran — see "Round 2 — cost / checks". NOT done: before/after sheets from `shots/r2f` (r2off vs r2on: t28, depfront,
  dep, find, o18; ?nomassing vs on: overview, downtown, industry, street, oldtown), a fresh `npm run build` after adf11df
  (typecheck is clean; last build before the final edits: OK, 3.82 MB), ui-test re-run to confirm all steps (the log
  only shows `"passed": 1`).

## Round 2 — what changed
- Towers (towers.ts + new `roofplant.ts`): a real rooftop plant on every tower / office roof, varied by type (glass /
  panel / masonry): lift-motor room with louvres, door, canopy, ladder; fan units with grilles; duct runs on stands;
  a cooling tower; flues; cable trays; plant screen; guard rail. Curtain-wall towers end in a louvred fin crown
  (a fin every half cell, ring beam, lit accent line at night). Punched masonry towers / offices get piers between
  the window columns and wider corner piers. Classical arcade columns (plinth, torus, tapering shaft, echinus,
  abacus, entablature) on masonry offices, and shopfronts behind every arcade.
- Industry (industry.ts): head office annex at the exposed end of long gable / barrel halls (ribbon windows, entrance
  canopy, floor bands, roof kit) with a glazed stair tower rising over its roof; roof monitor (lantern) on ~65 % of
  gable sheds; rooflight strips down gable and barrel roofs; a louvred ridge ventilator on gable sheds without a
  monitor; downpipes every second bay on the eave sides; brick plinth.
- Harbour master (special.ts): recessed front porch — back wall with the door 1.5 m in, return walls, soffit, timber
  deck with two steps, columns with base and capital, balustrade.
- Westbrook houses (homes.ts): lean-to porch roofs with a deep fascia, drip board, header beam, gutter, turned posts.
- Apartment slabs (houses.ts): loggias cut into the back (French window per storey, cheeks, slabs, parapet or bars)
  with the balcony kit (plants, flower boxes, laundry, chairs) inside.

## Round 2 — cost / checks
- perf.mjs (1300×930, adaptive=0, 2 passes; `docs/progress/massing/perf-r2.txt`): overview 39.10 ms all on vs 39.28 round-2
  off vs 39.08 ?nomassing; street 31.18 / 31.23 / 31.16; industry 26.91 / 26.66 / 26.45 → round-2 cost ≤ ~0.3 ms
  (industry), noise elsewhere. Draw calls identical; triangles +32k overview, +34k street, +14k industry (< 1 %).
- hitch.mjs (overview, street, industry, downtown × 12:00 / 21:30): new programs 0, new geometries 0, freezes > 100 ms 0
  in every window; one 55 ms long task on the street arrival (texture uploads, pre-existing).
- Captures: 0 console / page errors. Invariants: buildings clean; the hitch run logged a pedestrian overlap on a crosswalk
  (pedestrians module, not this round).
- No new materials or shader programs (140 programs, same as before); all geometry merged into the existing chunks.

## Round 2 — toggles (all on by default; `?nomassing` turns everything off)
`?noroofplant` · `?noannex` (head office + stair tower) · `?nomonitor` (roof monitor, downpipes, brick plinth) ·
`?noporch` (harbour master porch, house porch roofs) · `?nocolonnade` · `?nologgias` · `?norooflights` (rooflights,
ridge ventilator) · `?nopiers` · `?nocrowns` (now also the glass fin crown + glass screen) · `?noshopfront` (round 3). Quality: the roof plant is off on low
(like the roof kit); the rest is cheap geometry and stays on every tier.

## Round 1 — Resume here
- DONE. Verified: typecheck clean, `npm run build` OK (3.77 MB), console clean (0 errors in every capture),
  `invariants()` `{}` (incl. the footprint rule for every lot), perf measured. ui-test freecam/explore/building: see
  "Checks" below.
- Possible follow-ups (not done): industrial halls (office annex / roof monitors — needs an L-shaped hall),
  loggias on apartment slabs, a set-back roof storey on apartments, glass-tower crowns (fins / lanterns).

## What changed
- `src/world/buildings/massing.ts` (new) — the kit: `oriel` (box / canted bay, storey-aligned windows on every face,
  corbel, string bands, hip / lean / flat cap), `turret` (octagonal, corbelled, windowed faces, frieze cornice,
  cone / bell / dome cap + finial), `crossGable` (knee wall + gable + its own roof meeting the main slope),
  `notchPoly` / `notchCap` (re-entrant tower corners), `crownCornice` (frieze, bed moulding, corona on modillions),
  roof furniture (`roofKit`: plant room, timber water tank on a stand, vents, PV rows facing south, roof garden with
  pergola, ridge skylight), `massTiers` (setbacks for the explore rooms), `massRng` (own RNG stream).
- Townhouses (oldtown.ts): corner turret on ~70 % of corner houses; oriel on ~60 % of fronts (25 % next to a turret;
  shops from the 2nd floor); cross gable on ~55 % of side-gabled roofs (80 % with an oriel — centred on it) instead of
  dormers; carved eave brackets under the front eave / mansard cornice on ~70 %; flat roofs get the roof kit.
  Window grids, trims, balconies and downpipes keep clear of turrets / oriels.
- Towers & offices (towers.ts): flat / screen / low stepped crowns get a massing variant — masonry: wedding-cake
  setbacks (H > 30) or a set-back top storey; glass: asymmetric setback / notched corners / set-back top storey.
  Masonry tiers end in a deep bracketed cornice. Setback roofs get terraces / gardens / plant (roof kit).
  Twin towers, Haven Tower and the slant / tall stepped schemes keep their own crowns.
- Grand Hotel (special.ts): domed corner pavilions on the exposed front corners.
- Apartment slabs (houses.ts): roof kit (lift / plant room, tank, garden, PV) before the roof clutter.
- Explore (src/ui/camera/explore.ts): `volumeAt(lot, y)` — rooms and `lotAt` use the storey's tier rect from
  `services.buildings.massTiers` (also fits the pre-existing stepped crowns).

## Toggles (all on by default)
`?nomassing` (all off = the old massing, same build) · `?nooriels` · `?noturrets` · `?nocrossgables` ·
`?nosetbacks` · `?nocrowns` (tower cornices + townhouse eave brackets) · `?noroofkit`.
Quality: low keeps the massing (it carries the skyline, few triangles) and drops the roof kit; cornice brackets only
from medium. Massing decisions use `massRng(g)`, so a toggle never reshuffles the rest of a building.

## Cost (perf.mjs, Adreno X1-45, 1920×1025, high, 12:00, `--variants ";nomassing" --repeat 2 --gpu 1`)
Full table: `docs/progress/massing/perf-results.txt`.

| view | ms/frame massing | ms/frame ?nomassing | Δ (pass 1) | triangles Δ | draw calls Δ |
|---|---|---|---|---|---|
| overview | 48.8 | 47.5 | +1.4 | +3.5k | 0 |
| street 5,1.5,-65 | 43.2 | 42.6 | +0.5 | +24k | +2 |
| old-town row | 59.4 | 59.0 | +0.5 | ±0 | 0 |
| skyline (dsky) | 44.4 | 44.7 | −0.3 | +10k | 0 |

Pass 2 was inverted by thermal noise (?nomassing 2–8 ms slower), so the real cost is ≲ 1.5 ms and mostly inside the
noise; triangles +0.1–0.6 %. No shader changes, no new materials, no per-frame work (all geometry is built once into
the existing chunked shell / trim meshes).

## Sheets
`docs/progress/massing/street_before_after.jpg` (eye level: old-town rows, market row, downtown street),
`docs/progress/massing/overview_before_after.jpg` (overview, old town, downtown, skyline, downtown avenue).
Earlier round: `v1_street.jpg`, `v1_overview.jpg`. Before = `?nomassing` on the same build.

## Checks
- typecheck clean; build OK; captures: 0 console errors / page errors; invariants `{}`.
- `ui-test.mjs --steps freecam,explore,building`: 7/7 OK (incl. "a room inside an office building"), 0 errors.

## Files touched (for the merge)
src/world/buildings/massing.ts (new), src/world/buildings/oldtown.ts, towers.ts, houses.ts, special.ts,
anchors.ts (service type: `massTiers`), src/world/buildings.ts (setMassing / resetMassing / service),
src/ui/camera/explore.ts (`volumeAt`), docs/progress/buildings-massing.md, docs/progress/massing/*.
