# Box hunt — find and fix what still reads as "a box with a triangle on top"

Branch `claude/box-hunt-af5a80` (based on `claude/pensive-gates-bim12i` a200754). Dev server for this worktree:
`npx vite --port 5187 --strictPort`; harness scripts run from the main checkout (shared browser lock):
`node C:/Projects/GameCity/scripts/capture-set.mjs --url http://127.0.0.1:5187/ …`. Shots: `shots/bh/` (gitignored);
before/after crops kept for the log live in `docs/progress/boxhunt/`.

## Resume here
**Round 2 (overnight, 2026-10-30) DONE** (see "Round 2" at the end: fixes, perf, smoothness, checks, hand-offs; sheet `docs/progress/boxhunt/round2_before_after.jpg`) — merged `claude/pensive-gates-bim12i` (083a507) first. Backlog in
order: (1) ranked list #14–30 minus hand-offs, (2) REAL-REPORT objects, (3) interiors through glass, (4) re-audit
with walk mode / free camera and fix the next 10, repeat. Every feature: `boxHunt(ctx, name)` switch.
- **Latest (7033144)**: walk re-audit 2 (16 views `shots/bh2/walk2`, 2 judges) → picket board edges in the near
  cells (`?nopicketedge`, verified `shots/bh2/picket`), beach toys (`?nobeachtoys`, verify `shots/bh2/toys`); reredos
  + stadium lobby verified (`ver5`). Perf A/B (`perf2`, 4 views × 2, `;noboxhunt` = rounds 1+2): +1.2–1.6 ms,
  +8–10 % triangles, same draw calls → per-toggle attribution (`perf3`): container kit −54 k, yard kit −54 k, quay
  wall −24 k, barge −20 k, two-wheelers −16/−49 k, carousel −20 k (harbour) → trims in 7033144 (motorbike/scooter
  LOD 2 back to the light body, yard small parts near-only, castings outer faces). Pending: `perf4` (same A/B after
  the trims), `hitch.mjs` (mid-run compiles must be 0), toys check, round-2 sheet (`sheet_r2.py`), final log
  section (draft in scratch `r2_log.md`), build. Judge items owned elsewhere → hand-offs (see Round 2 section).
- Done + committed (f3945ad … 6fe85cf): e-moped / e-scooter / motorbike sculpted (`?no2wdetail`, traffic
  models.ts `loftZ`), school railings + gates + Sheffield stands (`?noschoolrail`, civic.ts `schoolBounds`),
  fish-quay reefer as a real container (`?noquaykit`), sail draft + finer cloth + tiller extension (`?nosailkit`),
  band instruments (`?nobandbrass`, park.ts `bandInstruments`), deli goods / chilled counter / hanging sausages
  (`?nointeriors`, buildings/materials.ts `uBhInt`, one line in buildings.ts), bus-shelter barrel roof
  (`?noshelterroof`), breakwater quarried armour + wet line (`?noarmour`, geo.ts `HB.stone`), round ferris
  gondolas (`?nogondola`), church nave / station booking hall / town hall furnished (`?nointeriors`:
  `churchInterior`, `stationInterior`, `townhallInterior`, all in the detail kit `env.D`).
- 4a611aa: **env.D bug** — primitives added straight to the detail kit had their LOD pivot at the world origin, so
  everything in `env.D` vanished once the camera was > 100 m from (0,0,0) (all three interiors, school rails);
  fixed with `MeshBuilder.autoPivot` (set on every region's detail sink in env.ts). Carved carousel horses
  (`?nocarousel`, pier.ts `horseCarved`), church sanctuary dais + rail + painted reredos (the chancel behind the
  nave wall is closed), fireworks barge kit (`?nobarge`, vehicleModels.ts `bargeKit`, VB.geo), ferry pontoon
  fit-out: guide piles, tyre fenders, cleats, ladder, lifebuoy, barrel roof, gangway slats (`?noferrydock`).
- Verified visually (A/B): two-wheelers, school, reefer, sails, band, deli, shelters, armour, gondolas, carousel,
  church / station / town hall interiors (`shots/bh2/int3`). Pending: barge + ferry dock (`shots/bh2/harb`),
  reredos + town hall council (`shots/bh2/int4`, also fountain / stadium front / quay wall "after" for #18/#20/#23).
- 4a53758 / 0ea412a: quay-wall furniture (`?noquaywall`, masonry.ts `wallFurniture`: rings, outfalls + stains,
  sea-wall fender baulks — verified), slimmer ferry piles; **walk re-audit** (28 eye-level views at ped-network
  nodes by farthest-point sampling, scratch `v_walk.js`, 2 sonnet judges) → fixes: stadium turnstile vestibules
  behind the gate arches (`?nostadiumgate`), containers: corner castings, door seam, hinges, handles, plate +
  trapezoidal corrugation in the harbour shader (`?nocontainerkit`, define HB_TRAP), Victorian pier ticket booth
  (`?nopierbooth`), EUR pallets / drums / forklift / 16-seg rack-bike tyres (`?noyardkit`, props/kit.ts),
  station posters + WAY OUT + ticket machines, town hall draped flags, printed shop packaging (shelf kind 0).
  Checked, no change: car glass (G1 already reads as glass), fountain (#20), STOP sign (rim/blank/rails exist),
  hedges (near-LOD leaf skin exists), kiosks on the pier deck. Hand-offs: poppy heads (#30: needs a discard in the
  shared grass shader — early-Z risk, groundcover owner), beach ice-cream kiosk (buildings/special.ts — massing
  owner), picket-fence board edges (cost ~30-60k tris city-wide), close-up pedestrian heads / hats (faceted).
- Verified: station posters / machines (`ver2`), containers + booth (`ver3`, invariants {}). Stadium gates: the
  first vestibule (2.7 m deep) was buried in the stand's stepped mass — the stand starts right behind the 0.5 m
  wall, the arch showed red seat risers; 211f493 fits a shallow lit lobby into the reveal instead (panel, dark
  tunnel, pay sign, two turnstiles, gate leaves folded open). Reredos was inside the 0.6 m end wall (its inner
  face is nz0 + 0.6: `wall()` extrudes inward from the outer face) — moved. Re-check: `ver5`.
- Pending: `ver4` (yard props, rack bikes, shop goods), `ver5`, perf A/B (`;noboxhunt`, 4 views × 2), walk round 2
  (`v_walk2.js`: 24 eye-level + 6 mid-height views ≥ 38 m from round 1) → judges → fixes. Build OK (3.85 MB).
- Edit scripts: never pre-convert inserted text to CRLF and then pass it through `R()` again (made `
`).
- Already done by earlier rounds (F4, checked in code): building-site mud / ruts / mixer / excavator, quay oil
  stains. Car glass `?novehglass` (real-g) — still to re-check visually.
- Next: car glass check; ranked #18 stadium front, #20 fountain, #23 quay wall, #30 poppies, #26 pier kiosks;
  then the walk-mode re-audit; perf A/B + build at the end. Scratch tools: `evalshots.mjs` (eval-driven views,
  before/after variants under one lock) + `v_*.js` view scripts in the session scratchpad.
- Never run `npx prettier` here (no project config: it reformats whole files).

Round 1: **DONE (2026-10-29 23:20)** — audit, ranked list, 10 fixes with switches, before/after sheet
(`docs/progress/boxhunt/before_after.jpg`), perf A/B, typecheck, build, invariants. Remaining ideas under
"Still open". The notes below are the history of the round.

### History
- Step 1 (audit) DONE: 59 noon views (15 POIs, 30 eye-level, 14 mid-height) + 12 night views + object bench
  (24 classes × 5/15 m) in `shots/bh/{noon,night,bench}`; 5 sonnet judges + own verification on crops.
  Crops of the top 16: `docs/progress/boxhunt/audit_top16.jpg`.
- Step 2 (fixes) in progress — order = ranked list. Switch helper `src/core/boxhunt.ts` (`boxHunt(ctx, name)`:
  on at medium/high, off on low, `?no<name>`, `?noboxhunt` = all off).
- Code-verified that several judge items are already detailed (no change): modern street bin, back-yard close-board
  fence, platform canopy, portaloo/site cabins, storage tanks (caged ladder, catwalks, pipes). See "Re-scored".
- Written + committed (cf89e10 and later): signals `?nosigvisor`, promenade + footbridge/landing lanterns
  `?nopromlamp`, garden wheelie bins `?nowheeliebin`, plaza sculptures `?nosculpt`, parasols + lifeguard hut
  `?nobeachkit`, kite flyer `?nokiteflyer`, countryside house variants `?nolandvariants`, TV-tower shaft
  `?notvshaft`. Verified visually: promenade lamp, signal visors (fix1). Pending: fix2 A/B (beach, villages,
  sculpture, bins), footbridge lanterns, kite flyer, TV tower, then perf + build.
- A/B capture helper: scratch `run_ab.sh <name> "<views>" [hour]` → `shots/bh/<name>/{before,after}` (before =
  `?noboxhunt`).

## How the audit views were made
`"name=tx,ty,tz,dist,yaw,pitch"` specs generated from eye→target pairs (scratch `views.mjs`; camera eye =
target + d·(sin yaw·cos p, sin p, cos yaw·cos p), yaw 0 = camera south of the target). Eye-level views used here
(1.6 m eye): e_street `5,1.5,-65,9,0,0.6` · e_footbridge `28,2,118,18.4,-130.6,-1.2` · e_oldtown
`82,3,0,32,0,-2.5` · e_beach `134,2,30,18.9,-32,-1.2` · e_quay `136,8,-78,25.2,-125,-14.7` · e_midtown
`-82,3,-50,22,0,-3.6` · e_lighthouse `184,10,-142,42.2,-54.8,-9.5` · e_church_e `70,10,80,28.5,126,-17.2` ·
e_stadium `-27,9,60,23.2,180,-18.6` · e_townhall `28,8,4,30.7,0,-12` · e_portal `55,4,-164,16.2,0,-8.5` ·
e_farm1 `-382,4,97,32.8,113.4,-4.2`; mid: m_stadium `-27,5,73,57.6,128.5,30.2` · m_industry
`-135,5,-105,56.4,45,28.6`; bench = `scripts/bench.mjs --classes … --dists 5,15` (patched copy: the script's
`/@fs` import is broken on Windows — `'/@fs' + 'C:\…'` needs `'/@fs/' + posix path`).

## Ranked list
Score = V (how often / how large it is seen, 1–5) × P (how primitive it reads, 1–5). Owner = file to change.
"✔" = fixed in this round (see Fixes), "≈" = re-scored after reading the code (already detailed, see Re-scored).

| # | object | where seen (view / file) | V | P | score | what reads primitive | owner |
|---|---|---|---|---|---|---|---|
| 1 ✔ | traffic + pedestrian signal heads / poles | e_street, bench signal_5m, night e_street | 5 | 4 | 20 | black slab heads on a stick, no visors/backplates/lens depth; ped pole = thick tube + box | `sim/traffic/signals.ts` |
| 2 ✔ | riverside promenade lamps | e_footbridge (row of ~20 along the river wall) | 4 | 5 | 20 | cream cube on a square post, box caps | `world/terrain/railings.ts` |
| 3 ≈ | street litter bins | bench bin_5m, every street | 4 | 4 | 16 | tall dark box with a tiny lid | `world/props` |
| 4 ✔ | countryside villages, hamlets, far farms, church towers | overview, vista, country, riverbend | 3 | 5 | 15 | literally the instanced unit "box + prism"; church = box + 4-sided pyramid | `world/landscape/settlements.ts` |
| 5 ✔ | downtown plaza "abstract" sculpture | bench bench_15m (plaza at −36,−25) | 3 | 5 | 15 | three stacked cubes on a slab — reads as a placeholder | `world/landmarks/park.ts genStatue` |
| 6 ≈ | farmland patchwork without field boundaries | overview, vista | 5 | 3 | 15 | tinted rectangles, few hedgerows / tracks / walls between parcels | `world/landscape/fields.ts` |
| 7 ✔ | back-yard plank fence + wheelie bins | e_oldtown | 3 | 4 | 12 | fence = one flat painted slab with 3 rails; bins = plain boxes | `world/life` (backyard) |
| 8 ✔ | beach umbrellas | e_beach, bench umbrellas | 3 | 4 | 12 | oversized flat 8-sided cone on a bare pole, no ribs / valance | `world/harbor/beach.ts` |
| 9 ≈ | station platform canopy | station, m_station | 3 | 4 | 12 | flat slab over the platform, no columns/brackets/valance | `world/landmarks/station.ts` |
| 10 ≈ | harbour gantry cranes | e_quay, harbor | 4 | 3 | 12 | all members solid square sections; no lattice boom, cab, stairs | `world/harbor/cranes.ts` |
| 11 ✔ | lifeguard tower, beach cabins, sandcastle | e_beach, bench umbrellas_5m | 3 | 4 | 12 | stacked boxes on stilts, flat-roof box cabin, cylinder castle | `world/harbor/beach.ts` |
| 12 ✔ | kite flyer on the beach | e_beach (right edge) | 2 | 5 | 10 | the last box mannequin: cube head, box limbs | `sim/ambient/kites.ts` |
| 13 ≈ | construction site cabin + portaloo | e_midtown | 2 | 5 | 10 | white box on a translucent blue box, no door/window/steps | `world/landmarks/construction.ts` |
| 14 | harbour pontoons, small barge | harbor, night harbor | 2 | 4 | 8 | plank slab + cube hut, no floats/cleats/fenders | `world/harbor` |
| 15 | breakwater armour stones | e_lighthouse | 3 | 3 | 9 | flat-shaded low-poly blobs, one size, no wet line | `world/harbor/breakwater.ts` |
| 16 ≈ | factory chimneys | m_industry, e_industry | 3 | 3 | 9 | straight shafts, no cap / corbel / rod | `world/landmarks/industry.ts` |
| 17 ≈ | church nave "buttresses" | e_church_e | 3 | 3 | 9 | pale flat quads between the windows read as stray slabs | `world/landmarks/church.ts` |
| 18 | stadium street front | e_stadium, m_stadium | 3 | 3 | 9 | flat grey placeholder plaques, black gate arches, floating roof trusses | `world/landmarks/stadium*.ts` |
| 19 | orchard / hedge trees in the fields | country | 3 | 3 | 9 | identical flat-topped pillows on sticks | `world/landscape/trees.ts` |
| 20 | town-square fountain (judge B; not re-checked) | e_townhall | 3 | 3 | 9 | tiers read as plain stacked discs | `world/landmarks/fountain.ts` |
| 21 ≈ | industrial tanks / silos | m_industry | 2 | 4 | 8 | white cylinders + cone lids, no ladder/cage/catwalk/pipes | `world/landmarks/industry.ts` |
| 22 ✔ | TV tower shaft | downtown, station, overview | 4 | 2 | 8 | 150 m tower on a 5.8 m shaft: reads as a pipe at distance | `world/landmarks/tvtower.ts` |
| 23 | river / quay wall furniture | e_boathouse, riverside | 4 | 2 | 8 | long plain coping, few rings / fenders / bollards | `world/terrain`, `world/harbor/quay.ts` |
| 24 | bus shelters | bench busstop, e_depot | 4 | 2 | 8 | flat slab roof on glass panels | `world/props` |
| 25 | delivery van box body | e_street | 4 | 2 | 8 | box body without seams / rear doors / bumper | `sim/traffic/models.ts` |
| 26 | pier substructure, kiosks, carousel horses | e_pier, m_pier | 3 | 2 | 6 | piles without bracing; box kiosks; blocky horses | `world/harbor/pier.ts` |
| 27 | ferris-wheel gondolas | m_pier | 3 | 2 | 6 | small coloured boxes | `world/harbor/pier.ts` |
| 28 | tunnel portals | e_portal, m_portal | 2 | 3 | 6 | flat ashlar slab, round arch, no voussoirs / keystone | `world/terrain/masonry.ts` |
| 29 | water tower | m_industry | 2 | 3 | 6 | plain tank | `world/landmarks/industry.ts` |
| 30 | field poppies | e_farm1, e_farm2 | 3 | 2 | 6 | oversized identical cones on straight stalks | `world/groundcover` |

Checked and fine (judges over-scored them): the near farmsteads (boards, doors, shutters, chimney, silo — only the
yard is bare), the harbour lighthouse (gallery, lantern, dome, vane), the station front, the container ship,
parked bicycles, the classic street lamp, planters, wind turbines (real towers are plain tubes). The red
"half-pipe" in e_industry is the camera standing inside a parked car.

## Re-scored after reading the code (judges over-scored these from distance; no change made)
| # | object | why it stays |
|---|---|---|
| 3 | street litter bin | already a detailed model (`props/furniture.ts bin`: fluted body, hood with skirt, liner, door seams) — a square bin reads square; P 4 → 2 |
| 6 | farmland | hedgerows and farm tracks already run on the parcel borders (`landscape/fields.ts`, `trees.ts`); they read small from 600 m; P 3 → 2 |
| 7 | back-yard fence | a real close-board fence (posts, gravel board, 14 boards, rails, capping); only the garden/courtyard wheelie bins were boxes (fixed) |
| 9 | platform canopy | a Victorian canopy on cast-iron columns with brackets, rafters and purlins (`sim/rail/station.ts`); flat only from above |
| 10 | gantry cranes | box-girder legs and boom are what real STS cranes have; P 3 → 2 |
| 13 | site cabin / portaloo | stacked cabins with a stair and a moulded, ribbed portaloo with a vented door (`landmarks/construction.ts`); the audit camera stood in an alley |
| 17 | church "slabs" | real buttresses (body + sloped weathering cap in pale trim); P 3 → 2 |
| 16 | factory chimneys | octagonal pedestal with a stone cap, tapered segments with proud bands, corbelled top with soot (`genChimney`) |
| 21 | storage tanks | caged ladder, catwalk bridges with railings, pipe rack, valves, bund wall (`landmarks/industry.ts genTanks`) |

## Fixes
All switches: `src/core/boxhunt.ts` — on at medium/high, off on `?quality=low`, each with `?no<name>`, all off with
`?noboxhunt`. Before/after sheets: `docs/progress/boxhunt/` (made with `?noboxhunt` vs default).

| # | object | change | switch | files |
|---|---|---|---|---|
| 1 | traffic + ped signals | tunnel visors (8-sided open hood, outer + inner shell, 216° wrap) round every lens: main head, pole repeater, both ped heads (the flat hood plates + cheeks are gone) | `?nosigvisor` | `sim/traffic/signals.ts` |
| 2 | promenade lamps | cast-iron lamp: moulded plinth, tapering 8-sided post with collars, ladder arm with ball ends, four-pane lantern widening upwards (glass emissive), corner frames, top band, pyramid cap, finial | `?nopromlamp` | `world/terrain/railings.ts`, `terrain/masonry.ts` |
| 2b | footbridge + jetty-landing lamps | same lantern family on a moulded foot and collared post (they were the same cube heads) | `?nopromlamp` | `world/harbor/river.ts`, `harbor.ts` |
| 4 | countryside villages / hamlets / far farms | the instanced unit gains hip ends (30 % full hips, 12 % steep hips, barns 30 % half-hips), a 0.6 m chimney stack over the ridge (75 % of houses) and an L-wing at the back (32 %, big houses 55 %, barns 30 %) — all per-instance in the vertex shader, still ONE instanced mesh; a matching shadow-depth material so shadows follow the shape | `?nolandvariants` | `world/landscape/settlements.ts`, `landscape.ts` |
| 5 | plaza public art | moulded plinth (base step, chamfered die, capping, bronze plaque); stacked cubes → three balanced polished stones; box twist → double-helix steel spiral with a polished ball; the ring stands in a cast shoe | `?nosculpt` | `world/props/kit.ts`, `props.ts` |
| 7 | garden / courtyard wheelie bins | 240 l bin: tapered moulded body, rim, lid on a rear hinge bar (some ajar, bag showing), handle brackets, axle + wheels, lifting comb, label | `?nowheeliebin` | `world/props/garden.ts`, `props.ts` |
| 8 | beach parasols | two-part pole with tilt collar, runner + 8 stretchers, 8 ribs, domed canopy whose panels sag between the ribs, scalloped valance, finial; 20 % smaller (real 1.8–2.3 m span) | `?nobeachkit` | `world/harbor/beach.ts`, `harbor.ts` |
| 11 | lifeguard tower | hipped roof with fascia and ridge cap instead of the slab; X-bracing on all four sides | `?nobeachkit` | `world/harbor/beach.ts` |
| 12 | kite flyer | the last box mannequin rebuilt as a person: tapered legs with knees, sneakers, shorts, waisted torso, neck, head + hair cap, arms with elbows (string hand at the old anchor), smooth normals | `?nokiteflyer` | `sim/ambient/kites.ts` |
| 22 | TV tower shaft | stout foot (r 3.85 m, was 2.9) flaring like a trumpet onto the pavilion, stronger taper to r 2.3 m, denser lathe | `?notvshaft` | `world/landmarks/tvtower.ts` |

Verified in captures (`shots/bh/fix1..3`): promenade lantern, parasols, lifeguard roof, kite flyer, signal visors
(subtle — the old flat hoods already gave a cap silhouette at 4 m), bridge lanterns. The countryside variants are
real but small on screen: the units sit 0.5–2 km out, mostly behind trees, from every standard view. The TV-tower
shaft is stouter but still reads as a plain concrete tube from the street (real ones do too) — a modest change.

## Perf (Adreno X1-45, 1920×1025, `perf.mjs --gpu 1 --seconds 3 --repeat 2`, noon, A/B in one run)
`node scripts/perf.mjs --url http://127.0.0.1:5187/ --q "nointro&noidle" --views "overview;street=5,1.5,-65,9,0,6" --hours 12 --width 1920 --height 1025 --variants ";noboxhunt" --repeat 2 --gpu 1 --seconds 3`

| view | ms/frame on (2 runs) | ms/frame `?noboxhunt` | GPU total on / off | draw calls on / off | triangles on / off |
|---|---|---|---|---|---|
| overview | 49.0, 48.2 (48.6) | 48.3, 48.8 (48.6) | 48.4 / 48.3 | 250 / 250 | 4.33 M / 4.24 M (+89 k, +2.1 %) |
| street `5,1.5,-65,9,0,6` | 45.0, 45.1 (45.0) | 45.3, 45.1 (45.2) | 41.6 / 41.9 | 232 / 232 | 3.81 M / 3.73 M (+76 k, +2.0 %) |

No measurable frame cost (differences are inside the run-to-run noise), no extra draw calls (every feature lives in
an existing merged / instanced mesh; the countryside variants are per-instance shader work in the same instanced mesh
plus a matching shadow-depth material). The triangle growth is mostly the parasols (~30 × ~600), the signal visors
(statics, ~13 k) and the countryside unit (~370 instances × ~40). No per-frame allocations were added (all build-time).

## Checks (final)
- `npm run typecheck` clean; `npm run build` OK (`dist/index.html` 3.76 MB).
- `shot.mjs --invariants --validate` overview at 11:00 and 21:30: invariants `{}`, validate `[]`, console errors 0,
  frame errors 0. Capture reports: 0 errors; the 7 console warnings are pre-existing D3D shader-compiler notes
  (`f_trLivery`, `f_boatSurface`, `f_fCropKind` …) — identical with `?noboxhunt`.
- Overview not worse: same draw calls, same frame time; the overview A/B differs only in tiny far details.
- Night (21:30): the new lanterns glow with their halos centred on the glass (`shots/bh/night_after`).

## Files touched (for the merge)
`src/core/boxhunt.ts` (new) · `src/sim/traffic/signals.ts` · `src/sim/ambient/kites.ts` · `src/world/terrain/railings.ts`
· `src/world/terrain/masonry.ts` (1 line: switch) · `src/world/harbor.ts` (switch setters) · `src/world/harbor/beach.ts`
· `src/world/harbor/river.ts` · `src/world/props.ts` (2 lines) · `src/world/props/garden.ts` · `src/world/props/kit.ts`
· `src/world/landscape.ts` (1 line) · `src/world/landscape/settlements.ts` · `src/world/landmarks/tvtower.ts` ·
`docs/progress/box-hunt.md`, `docs/progress/boxhunt/*.jpg`. Nothing in `src/world/buildings/*`, `src/core/plan.ts`,
`src/main.ts`, camera / HUD.

## Still open (mine, not done this round)
- Breakwater armour stones (#15): flat-shaded low-poly blobs of one size — mix sizes, a darker wet band.
- Stadium street front (#18): flat grey plaques, black gate arches — posters, gates with turnstiles.
- Pier substructure / kiosks / carousel horses (#26), ferris-wheel gondolas (#27), tunnel-portal voussoirs (#28),
  orchard "pillow" trees (#19), poppies (#30), harbour pontoons (#14).
- Signal heads seen from behind / at night are black silhouettes (the visors help from the front only).
- The countryside variants are hard to see from the standard views (units 0.5–2 km out behind trees); a nearer
  view of a village would show them — or they can be dropped from the cost list if not wanted.

## Handoff (sibling-owned findings, not fixed here)
**massing** (`src/world/buildings/*`):
- Rooftop plant on the downtown towers: plain grey cuboids, no fans/grilles/ducts/railings — V4 × P5 = 20, the most
  visible box left in every high view (downtown, overview). A rooftop kit (fan cylinders + grille, ducts, lift room
  with a door, parapet rail, cooling tower) would be the biggest single win.
- Warehouse / factory sheds (e_industry, e_depot): one corrugated slab wall — no loading dock, downpipes, roof vents,
  plinth. Harbour master's office (e_harbmaster): box + hip roof, no porch / steps.
- Westbrook porch posts are flat slabs, porch roof a thin plate (e_westbrook); midtown colonnade = identical square
  columns on flat bases next to a blank wall (e_midtown).

**places** (`src/core/plan.ts` layout, level changes):
- Station: no entrance steps between the road and the doors (e_station); platform edge without coping / tactile
  strip, vertical rock cut behind the platform (e_platform).
- Old-town back-yard gap ends at a fence with no gate/path (e_oldtown); river wall straight with no steps/slipways
  (e_boathouse); tunnel portals on a flat green terrain patch with no cut/embankment (e_portal); the town stops at a
  hedge line with no lanes or field tracks (e_edge).

**other**: a seated pedestrian rendered as a pure black silhouette on the bench in e_street (people/shadow);
bandstand / gazebo, phone box, newsstand, kiosk, market stalls, tractor, cars, bus read well.

## Round 2 (overnight 2026-10-30) — fixes, perf, checks, hand-offs
Base `083a507` (pensive-gates merged). Backlog done in order: ranked list #14–30 (minus hand-offs), REAL-REPORT
objects, interiors through glass, then two walk-mode re-audits (eye-level views at pedestrian-network nodes, 2 sonnet
judges each, own verification on crops). Every feature has a `boxHunt(ctx, name)` switch (off on low, `?no<name>`,
`?noboxhunt` = rounds 1 + 2 off).

| object | change | switch | files |
|---|---|---|---|
| e-moped / e-scooter / motorbike | lofted, sculpted bodies (`loftZ`): seat, fairings, forks, mudguards, lamps | `?no2wdetail` | `sim/traffic/models.ts`, `render.ts` |
| school frontage | railings with gates along the run, Sheffield bike stands | `?noschoolrail` | `landmarks/civic.ts` |
| fish-quay reefer | a real reefer container (machinery end, ribs, doors) instead of a box | `?noquaykit` | `harbor/quay.ts` |
| sailing dinghies | sail draft (camber), finer cloth, tiller extension to the helm's hand | `?nosailkit` | `sim/boats/{material,models,render}.ts` |
| bandstand band | brass instruments at the players' hands | `?nobandbrass` | `landmarks/park.ts` |
| shop interiors | deli goods, chilled counter, hanging sausages; printed packaging on shelves (label band, logo, shading) | `?nointeriors` | `buildings/materials.ts` (`uBhInt`), 1 line in `buildings.ts` |
| bus shelter | barrel roof on ribs | `?noshelterroof` | `props/furniture.ts` |
| breakwater | quarried armour blocks of mixed size with a wet line | `?noarmour` | `harbor/geo.ts`, `breakwater.ts` |
| ferris wheel | round domed gondolas | `?nogondola` | `harbor/pier.ts` |
| church / station / town hall | furnished interiors seen through the glass: pews, aisle runner, pulpit, chandeliers, sanctuary dais + communion rail + painted reredos; booking hall with board, benches, posters, ticket machines, WAY OUT; town hall entrance hall (columns, portraits, desk, draped flags) + council chamber | `?nointeriors` | `landmarks/{church,station,townhall}.ts` |
| **bug** | primitives added straight to the detail kit `env.D` had their LOD pivot at the world origin → collapsed whenever the camera was > 100 m from (0,0,0) (all interiors, school rails): `MeshBuilder.autoPivot` | — | `landmarks/builder.ts`, `env.ts` |
| carousel | carved horses (ellipsoid body, neck, head, legs in gallop, saddle, pole) | `?nocarousel` | `harbor/pier.ts` |
| fireworks barge | raked hull, strakes, fenders, bitts, rail, mortar racks, firing desk, wheelhouse, mast | `?nobarge` | `sim/ambient/vehicleModels.ts`, `vehicles.ts` |
| ferry pontoon | guide piles in hoops, tyre fenders, cleats, ladder, lifebuoy cabinet, weed line, barrel-roofed shelter + timetable, slatted gangway on rollers | `?noferrydock` | `harbor/beach.ts` |
| quay walls | mooring rings, drain outfalls with stains, sea-wall timber fender baulks | `?noquaywall` | `terrain/masonry.ts` |
| stadium gate arches | a lit lobby in the 0.5 m reveal: pay sign, dark tunnel, two turnstiles, folded gate leaves | `?nostadiumgate` | `landmarks/stadiumShell.ts` |
| shipping containers | corner castings, door seam, hinges, handles, data plate; trapezoidal corrugation in the harbour shader (`HB_TRAP`) | `?nocontainerkit` | `harbor/containers.ts`, `material.ts` |
| pier ticket booth | Victorian booth: plinth, panels, pilasters, cornice, lit window, price board, flared roof, finial | `?nopierbooth` | `harbor/pier.ts` |
| yard props | EUR pallets (blocks, stringers, boards), drums (chime, hoops, bungs), forklift (mast channels, chain, rams, LPG bottle, tyres with rims), rounder rack-bike tyres | `?noyardkit` | `props/kit.ts`, `furniture.ts` |
| picket fences | the boards' sawn edges (24 mm) in the near-only prop cells | `?nopicketedge` | `props/furniture.ts`, `props.ts` |
| beach toys | smooth six-gore ball with valve caps; moulded sandcastle (ribbed bucket towers, crenellations, slits, curtain walls, keep + door, wet moat + rim, shells, flag, bucket with handle, spade); towels rumpled with hem, pinstripes, tassels | `?nobeachtoys` | `harbor/beach.ts` |

Checked, no change (judges over-scored, or already detailed in code): car glass, fountain, STOP sign back, hedges,
pier deck kiosks, flatbed cargo (taped cartons, crates, straps exist), modern street lamps (tapered column, flange,
shroud), bandstand roof (bell lathe), lifeguard tower, parasols.

Walk re-audit 2 also logged one pedestrian invariant hit (two promenade walkers overlapping 13.7 s at (−160, 109)
while the capture paused the sim) — pedestrian sim, not this round's code; not seen in the other runs.

### Efficiency trims (7033144, after the per-toggle attribution)
- Scooter + motorbike: the sculpted bodies only on LOD 0–1; LOD 2 (> 150 m) is the light old body again (LOD 1/2
  were 2306 / 1508 triangles vs 708 / 432 before — counted with a tsc build of `models.ts`).
- Yard kit: the small parts (drum chimes / hoops / bung + vent caps; forklift chain, tilt rams, valve, steering
  column + wheel, rims, hubs, guard lamps) moved from the always-drawn / shadow-casting kits into the near-only prop
  cells (`KD`, 48 m cells, 30 m cut, no shadow pass), the same mechanism as the lamp detail and the picket edges.
  Pallets lose the hidden centre block and the ground-side faces; forklift tyres 16 → 14 sides.
- Containers: corner castings draw only their outer faces, hinges no top face (−~60 triangles per container).
- Barge kit counted (2.9 k triangles × 4 instances): left as is (splitting the instanced mesh would add a draw call).

### Perf (Adreno X1-45, 1920×1025, noon, `perf.mjs --variants ";noboxhunt" --repeat 2`, rounds 1 + 2 together)
| view | ms/frame on (2 runs) | ms/frame `?noboxhunt` | Δ ms | draw calls on / off | triangles on / off |
|---|---|---|---|---|---|
| downtown@12 | 55.6, 55.7 (55.6) | 54.4, 55.0 (54.7) | +0.9 | 238 / 238 | 4.64 M / 4.33 M (+302 k, +7.0 %) |
| harbor@12 | 49.2, 49.0 (49.1) | 47.6, 47.6 (47.6) | +1.5 | 248 / 248 | 4.74 M / 4.40 M (+347 k, +7.9 %) |
| beach@12 | 52.1, 51.8 (52.0) | 50.4, 50.3 (50.3) | +1.6 | 249 / 249 | 4.75 M / 4.35 M (+399 k, +9.2 %) |
| street@12 | 47.7, 46.7 (47.2) | 45.9, 46.3 (46.1) | +1.1 | 236 / 234 | 4.11 M / 3.81 M (+296 k, +7.8 %) |

Before the trims (`perf2`, same views): +1.2–1.6 ms, +305–436 k triangles (+8–10 %).

### Smoothness (`hitch.mjs`, overview / harbor / beach / stadium / station / downtown × 12:00 + 21:30, 6 s each)
25 windows (boot + arrive + steady): **0 mid-run shader compiles** (140 programs, all compiled by the boot warm-up),
0 freezes > 100 ms, 0 long tasks, console / page errors none, invariants `{}`, boot 20.6 s. Longest frame 100 ms =
the night camera cut to the overview (arrive window, no compile, no long task).

### Checks
- `npm run typecheck` clean; `npm run build` OK (`dist/index.html` 3.86 MB).
- Every evalshots / hitch run: invariants `{}`, console errors 0, frame errors 0 (one exception: walk2 logged a
  13.7 s overlap of two promenade walkers at (−160, 109) — pedestrian sim, unrelated, not reproduced).

### Files touched in round 2 (for the merge)
`src/sim/traffic/{models,render}.ts` · `src/sim/boats/{material,models,render}.ts` ·
`src/sim/ambient/{vehicleModels,vehicles}.ts` · `src/world/landmarks/{builder,env,church,station,townhall,civic,park,stadiumShell}.ts`
· `src/world/harbor.ts` + `harbor/{beach,breakwater,geo,material,pier,quay,containers}.ts` · `src/world/props.ts` +
`props/{furniture,kit}.ts` · `src/world/terrain/masonry.ts` · `src/world/buildings.ts` (1 line) +
`src/world/buildings/materials.ts` (`uBhInt` shop-interior goods — perf-wins also touched one `bhShop` /
`bhShelves` call site there: merge by hand) · docs. Nothing in `plan.ts`, `main.ts`, camera / HUD.

### Still open (mine)
- Lifeguard tower: no deck railing / shutters; bandstand reads as a plain cone from 30 m up (the bell lathe is
  there; ribs / a scalloped fascia would carry it); signal heads from behind are black silhouettes.
- The fine prop cells (benches, bins, fences, pallets…) draw to any distance while the camera is low; a distance
  cut (~250 m) would save more triangles than any single kit, but needs a no-pop check (fences read far away).

### Handoff (round 2, sibling-owned)
- **places** (`src/world/terrain/places.ts` `quayIron` + the bollard lights along the lower river quay): the mooring
  bollards are octagonal boxes with a slab cap and the bollard lights square posts with a lamp box — judged the
  crudest objects at the river (v08). A lathed cast-iron bollard like `harbor/quay.ts castBollard` and round
  bollard lights with a louvred head would fix both.
- **massing** (`src/world/buildings/*`): shopfront glazing reads as blank reflective panels at some angles (bank,
  v02); flat roller shutters and entrance canopy wedges on industrial units (v10); flat recessed warehouse doors on
  the harbour street (v00); awnings as flat planes (v05); window boxes as pink blobs from the air (m05); the beach
  ice-cream kiosk.
- **people**: close-up pedestrians (capsule limbs, mitten hands, flat hair) and the boat passengers (v08) were the
  judges' #1 in both walk rounds.
- **groundcover**: poppy heads need a discard in the shared grass shader (early-Z risk).
