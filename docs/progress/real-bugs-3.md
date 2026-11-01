# Real round — fresh bug hunt, wave 3 (2026-10-29)

Fresh session, branch `claude/real-bugs-3` (from `claude/pensive-gates-bim12i` @ cade43c, the merged tree after
F1–F4 incl. F2 s3). No game code changed. Software GL (SwiftShader, ~10 fps), 4 CPUs.

## Method
* Driver `shots/b3/drive.mjs` (scratch, not committed): one page load, `view()` + 2–3 full-viewport pump frames
  before every capture (`frames:2` = two consecutive captures to tell transients from bugs). Throughput here is
  ≈100–150 s per view, so the sweep is 2 views per district at street level + 1 at mid height, not a dense grid.
* **11 h**: 11 regression views from real-bugs-2; street level (camera 1.5 m, 9 m behind the target, pitch 6°)
  looking along the nearest N-S and E-W street in all 13 districts + hills + country + farmstead (29 views);
  mid height (55 m, pitch 28°) over all 13 districts + 8 hills/countryside views (21 views).
* **21.5 h and 6.5 h**: 15 views each (8 street, 5 mid, platform, old-town café).
* Targeted re-checks with 2 consecutive frames: market bus stop/A-board, platform passengers, back-yard laundry.
* Ray-picks (`shots/f4/pick.mjs`) for anything that looked wrong before calling it.
* View strings are `x,y,z,distance,yawDeg,pitchDeg` (camera = target + distance·(sin yaw·cos pitch, sin pitch,
  cos yaw·cos pitch)).

## Checks
| check | result |
|---|---|
| `invariants()` at 11 h, 21.5 h, 6.5 h | `{}` all three |
| `validate()` / `?validate` at 21.5 h and 6.5 h | `[]` (0 issues), no `[validate]` warnings |
| `frameErrors` | `[]` at every check |
| console during all capture sessions (≈ 100 captures, 5 page loads) | 0 errors, 0 warnings, 0 page errors |
| soak `--minutes 4 --speed 4` | 0 console/page/frame errors, 0 failed modules, invariant hits `{}`, expired peds/occupants 0; heap 699 → 703 MB over 24 samples (flat), geometries 130 → 131, textures 69 → 69. **Caveat:** at ~10 fps the game clock only ran 16:16 → 16:32 (not a full day), so night/dawn transitions were not soaked here. |

## Findings (most severe first)

No HIGH findings this round.

| # | Sev | What | Where / view | Evidence | Suspected file |
|---|-----|------|--------------|----------|----------------|
| 1 | med | **Barn corrugated roof still reads as camouflage/moiré at 30 m** (real-bugs-2 #3 not resolved). F4 added a `fwidth` fade of the 76 mm waves, and the swirl is gone, but the whole white roof is now covered by coarse slanted pale/brown slashes that do not follow the fall line and read as aliasing, not rust. Likely the rust term (`fsN(u*4, p.y*0.35)` + `fsN(u*11, …)`) seen at a grazing angle, or the lap term (`fract(u/0.9)`) still aliasing. | `fs3=-284.3,7,341.9,30,150,10` at 11 h, pumped 3 frames | `docs/progress/real/bugs3_barn_moire.jpg` | src/world/landscape/farmstead.ts:433-443 (sf == 2) |
| 2 | low | **The same window interior repeated across a whole ground floor in one frame.** The bank on the avenue shows the same beige wall + potted plant in ~8 bays side by side; the bookshop on the opposite corner shows the same shelf image in 3 bays. Visible from the street at every hour. | `downtown_ns=5,1.5,-65,9,0,6` (11 h and 6.5 h) | `docs/progress/real/bugs3_window_repeat.jpg` | src/world/buildings/materials.ts / towers.ts (interior pick per bay) |
| 3 | low | **Empty, flat-lit room behind a tower's curtain wall at night.** Seen 5 m from the glass (25 m up), a lit floor reads as a bare pale-cyan box (no furniture, ceiling or lights) spanning a full panel. Only from close up and high; from the street it reads as lit glass. | `downtown_mid=0,2,-65,55,35,28` at 21.5 h, glass hit at (23.7, 25.5, −27.0) | `docs/progress/real/bugs3_tower_room_night.jpg` (left third) | src/world/buildings/towers.ts (interior mapping) |
| 4 | low (unconfirmed) | **Smoke puffs rising from a bare factory roof.** At Northgate a smoke plume starts on a flat roof; the ray-pick at its base hits only `buildings-shell` at (−93.3, 13.4, −105.5), with no stack or vent. Might be a vent too small to see at 55 m. | `northgate_mid=-120,2,-110,55,35,28` at 11 h (`shots/b3/m11/northgate_mid_11.jpg`, right side) | — | smoke emitters (`smoke.addEmitter` callers for industrial lots) vs buildings chimney anchors |

## Re-checked from real-bugs-2 (all at 11 h, pumped)
| real-bugs-2 # | status |
|---|---|
| 1 box people (site workers, boat crews, ferry, playground kids) | **fixed**: real posed figures (bs2, mb1, fe1, pg1) |
| 2 tree through barn roof / floating poplar clumps | **fixed** (fs1) |
| 3 barn roof moiré | **not fixed**: see #1 above |
| 4 station bikes in planters / no wheels | **fixed**: wheels visible, racks clear of the planters (pl1) |
| 5 creel rope tails in mid-air | **fixed**: tails drop to the quay (fq1) |
| 6 laundry line through tree | **fixed**: line clear of both crowns (`by2=79,1.6,17.5,6,200,5`) |
| 7 duplicate shop names | **fixed**: not seen again (r12) |
| 8 herd LOD one frame late | with pumped frames the near herd is detailed (hd3) |
| 9 station board cut by a column | **fixed** (pl1, also 21.5 h) |
Sheet: `docs/progress/real/bugs3_regression_ok.jpg`.

## Looked at and found sound
Street level in every district: kerbs, crosswalks, tactile paving, signals, lamps, benches, bus shelters (posters,
flags, waiting passengers, pram), café terraces (seated people, waiter), shopfronts, scaffold and hoarding, harbour
quay (containers, forklift, fish boxes, hose reel), beach (towels, sunbathers, umbrellas, pier rail), riverside
promenade, park (statue, bandstand, playground), stadium (players, scoreboard shows the clock), market lane stalls,
Westbrook houses, driveways and parked cars, farmstead buildings/bales, herds, orchards, tractor at work, river
banks, lighthouse and sea. Vehicles: drivers in cars/taxis/bus/van, bus passengers, cyclists, e-moped with rider;
traffic on the right-hand lane in every case I could check. Night (21.5 h): lit windows, lamps, bus-stop posters,
headlights, train saloon lit, no black/NaN/blown pixels. Dawn (6.5 h): long shadows, chimney smoke, no regressions.

## Noted, not logged (transient / harness / judgement)
* Platform passengers drawn as a dither/stipple in one 11 h capture (`shots/b3/reg/pl1_11.jpg`); two later
  consecutive frames (`shots/b3/t/pl1_11_f0/f1`) show them solid → crowd fade-in, not a bug.
* Black box + black bars at the near farmstead from `fs1_st=-381.5,1.8,131.9,12,200,6`: the ray-pick puts the
  camera inside the barn (`land-farmstead` hits at 6–11 m) → walls culled, harness.
* Captures with the camera inside a lot/tree (harbor_ew container, station_ns building, hills_st and hills_mid
  forest) were skipped.
* The same waiting passenger (white shirt, backpack) at the Town Square stop at 6.5, 11 and 21.5 h: a static
  waiting actor; reads oddly only if you watch all day.
* A dark, nearly black cypress against the sky in `station_ew` at 11 h (backlit); normal at 6.5 h. The ray-pick
  hits nothing there (instanced trees are not raycast), so it is not confirmed either way.
* The ground-floor ashlar on the Town Square building (`civic_ew`) has very large blocks for its window size (taste).

## Not covered
Moving traffic up close through a whole junction cycle, boats under way, trains in motion, quality tiers other
than auto:high, a full-day soak (the clock only advanced 16 min at ~10 fps).
