# Buildings massing round — log

Branch `claude/buildings-massing-f65621` (based on `claude/pensive-gates-bim12i`; merged it again at 6150b5f to pick
up perf-wins). Goal: ordinary buildings read as architecture, not "a box with a triangle on top" — break the volume.
Landmarks are not in scope (boxhunt session); plan.ts layout untouched (places session); materials.ts untouched.

## Round 2 — Resume here (overnight backlog from the coordinator)
- Backlog: 1 tower rooftop plant · 2 industrial halls / depot / harbour master · 3 Westbrook porches, midtown
  colonnade · 4 apartment loggias, glass-tower crowns · 5 eye-level audit → fix the 10 weakest, repeat.
- Done (code, typecheck clean): 1 `roofplant.ts` (verified in shots: `shots/r2plant/sheet.jpg`, ?noroofplant);
  2 industry head office / roof monitor / downpipes / plinth (?noannex ?nomonitor), harbour-master recessed porch
  (?noporch); 3 lean-to porch roofs + turned posts (?noporch), classical arcade columns + shopfronts behind arcades
  (?nocolonnade). Items 2–3 NOT yet verified in shots.
- Bug fixed after 2af8c6f: `masonry` was used by buildLobby before its `const` (lots 18 and 23 threw) — moved up.
- 4 coded (uncommitted until verified): apartment loggias on the back (houses.ts `loggia()`, ?nologgias), glass-tower
  crown of fins + ring beam + mid rail (towers.ts `glassCrown()`, under ?nocrowns; curtain schemes, not slant/screen/twin).
- Verification set: `shots/r2v/{after,before}` (before = ?noannex&nomonitor&noporch&nocolonnade&nologgias).
- Harness note: capture-set `--out` relative paths resolve to the MAIN checkout — always pass absolute paths.
- Next: verify 2–4 → commit → item 5 (eye-level audit) → perf/checks.

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
