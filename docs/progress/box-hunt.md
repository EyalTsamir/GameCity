# Box hunt — find and fix what still reads as "a box with a triangle on top"

Branch `claude/box-hunt-af5a80` (based on `claude/pensive-gates-bim12i` a200754). Dev server for this worktree:
`npx vite --port 5187 --strictPort`; harness scripts run from the main checkout (shared browser lock):
`node C:/Projects/GameCity/scripts/capture-set.mjs --url http://127.0.0.1:5187/ …`. Shots: `shots/bh/` (gitignored);
before/after crops kept for the log live in `docs/progress/boxhunt/`.

## Resume here
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
"✔" = fixed in this round (see Fixes), "→" = handed off.

| # | object | where seen (view / file) | V | P | score | what reads primitive | owner |
|---|---|---|---|---|---|---|---|
| 1 | traffic + pedestrian signal heads / poles | e_street, bench signal_5m, night e_street | 5 | 4 | 20 | black slab heads on a stick, no visors/backplates/lens depth; ped pole = thick tube + box | `sim/traffic/signals.ts` |
| 2 | riverside promenade lamps | e_footbridge (row of ~20 along the river wall) | 4 | 5 | 20 | cream cube on a square post, box caps | `world/terrain/railings.ts` |
| 3 | street litter bins | bench bin_5m, every street | 4 | 4 | 16 | tall dark box with a tiny lid | `world/props` |
| 4 | countryside villages, hamlets, far farms, church towers | overview, vista, country, riverbend | 3 | 5 | 15 | literally the instanced unit "box + prism"; church = box + 4-sided pyramid | `world/landscape/settlements.ts` |
| 5 | downtown plaza "abstract" sculpture | bench bench_15m (plaza at −36,−25) | 3 | 5 | 15 | three stacked cubes on a slab — reads as a placeholder | `world/landmarks/park.ts genStatue` |
| 6 | farmland patchwork without field boundaries | overview, vista | 5 | 3 | 15 | tinted rectangles, few hedgerows / tracks / walls between parcels | `world/landscape/fields.ts` |
| 7 | back-yard plank fence + wheelie bins | e_oldtown | 3 | 4 | 12 | fence = one flat painted slab with 3 rails; bins = plain boxes | `world/life` (backyard) |
| 8 | beach umbrellas | e_beach, bench umbrellas | 3 | 4 | 12 | oversized flat 8-sided cone on a bare pole, no ribs / valance | `world/harbor/beach.ts` |
| 9 | station platform canopy | station, m_station | 3 | 4 | 12 | flat slab over the platform, no columns/brackets/valance | `world/landmarks/station.ts` |
| 10 | harbour gantry cranes | e_quay, harbor | 4 | 3 | 12 | all members solid square sections; no lattice boom, cab, stairs | `world/harbor/cranes.ts` |
| 11 | lifeguard tower, beach cabins, sandcastle | e_beach, bench umbrellas_5m | 3 | 4 | 12 | stacked boxes on stilts, flat-roof box cabin, cylinder castle | `world/harbor/beach.ts` |
| 12 | kite flyer on the beach | e_beach (right edge) | 2 | 5 | 10 | the last box mannequin: cube head, box limbs | `sim/ambient/kites.ts` |
| 13 | construction site cabin + portaloo | e_midtown | 2 | 5 | 10 | white box on a translucent blue box, no door/window/steps | `world/landmarks/construction.ts` |
| 14 | harbour pontoons, small barge | harbor, night harbor | 2 | 4 | 8 | plank slab + cube hut, no floats/cleats/fenders | `world/harbor` |
| 15 | breakwater armour stones | e_lighthouse | 3 | 3 | 9 | flat-shaded low-poly blobs, one size, no wet line | `world/harbor/breakwater.ts` |
| 16 | factory chimneys | m_industry, e_industry | 3 | 3 | 9 | straight shafts, no cap / corbel / rod | `world/landmarks/industry.ts` |
| 17 | church nave "buttresses" | e_church_e | 3 | 3 | 9 | pale flat quads between the windows read as stray slabs | `world/landmarks/church.ts` |
| 18 | stadium street front | e_stadium, m_stadium | 3 | 3 | 9 | flat grey placeholder plaques, black gate arches, floating roof trusses | `world/landmarks/stadium*.ts` |
| 19 | orchard / hedge trees in the fields | country | 3 | 3 | 9 | identical flat-topped pillows on sticks | `world/landscape/trees.ts` |
| 20 | town-square fountain (judge B; not re-checked) | e_townhall | 3 | 3 | 9 | tiers read as plain stacked discs | `world/landmarks/fountain.ts` |
| 21 | industrial tanks / silos | m_industry | 2 | 4 | 8 | white cylinders + cone lids, no ladder/cage/catwalk/pipes | `world/landmarks/industry.ts` |
| 22 | TV tower shaft | downtown, station, overview | 4 | 2 | 8 | 150 m tower on a 5.8 m shaft: reads as a pipe at distance | `world/landmarks/tvtower.ts` |
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
real but small on screen: the units sit 0.5–2 km out, mostly behind trees, from every standard view.

## Perf
(pending)

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
