# W1 — Facades (real-things round)

Branch `claude/real-w1-facades` (from `claude/pensive-gates-bim12i`). Brief: docs/progress/real-briefs.md "W1".

## Resume here
* Session 3 (10-28, from ~17:35 UTC). Merged pensive-gates (2d94d84); golden ref recaptured = shots/golden/ref
  (this container). Lead's m2 verdict, priorities: (1) albedo>1 root cause, (2) apartment/office walls visible
  texture at 3 m (render/cracks/string course contrast, streaks, splash zone), (3) apartment glass variety
  (street reflection, curtains, depth), (4) office upper floors (mullion relief, spandrels, slab lines) + ground
  columns (base, capital shadow gap, cladding joints), (5) house porch thin at 3 m. Industrial door: leave.
* Probe `?bdbg=src` (uBhDebug 5, before the clamp): pixels with albedo > 1 / < 0 / NaN (saturated colour) or emit
  > 6 / NaN / < 0 (pastel) coloured by the code path that wrote them (`bhSrc`: white 0 early wall returns, red 1
  reveal/sill, green 2 wall branch, blue 3 far wall, yellow 4 far window, cyan 5 shutter, magenta 6 glass,
  orange 7 roof). Runs p1 (apartment/office/house pick 0, 3/10 m) and p2 (pick 1, + tower): **no flagged
  pixel** — the faint grey single-pixel dots left are not facade pixels (also on trim canopies/soffits).
* Session 3 work (WIP, uncommitted until bench s1 judged): panel grid `bhPG` (one bay × one storey on gridded
  walls, from vFac/csz/uSign) used by bhPanelH + the PANELS pattern (sealant joints + chamfers, energy-kept AA,
  per-panel tone/tint, aggregate speckle, blow holes, drip line under each joint); render near detail in the
  PLASTER pattern (sand speckle, patchy tone) + stronger trowel/grit slope; sill streaks split into rivulets +
  dark drip band under the sill; splash zone (bottom 25–45 cm, all walls); longer/darker window-corner cracks;
  office PANELS walls: spandrel / window-band joints, slab nosing, shadow line; frame + mullion bevel normals
  (inner arrises); `bhOpp` street reflection in punched windows (`?nowinrefl`, uWinRefl); sash tilt wob 1.3;
  towers.ts `arcadeColumn` (granite base + chamfer step, clad courses with recessed joints, shadow gap, cap;
  `?nocolumndetail`); homes.ts classic porch: post plinth/cap, 15 cm posts, header beam + drip board, front step.
* Session 2 (10-28, from 16:40 UTC). Merged pensive-gates; golden ref = shots/golden/ref (ecef462).
* **Specks fixed:** NOT the GGX sun highlight (glass roughness → 0.5 alone did not cure it) and not life's
  dust motes (`skip=life` kept them). `?bdbg=nan` (colour flags: red NaN albedo, green NaN/Inf emit, blue emit
  > 6, yellow albedo ≥ 1, cyan NaN normal; emit zeroed otherwise) shows isolated single pixels with albedo ≫ 1
  inside the glass (random spots, not only corners). Fix: clamp facade albedo to [0, 1], emit ≤ 16, NaN → 0 in
  the main chunk after bhWall/bhRoof — no specks in shots/w1/s15. The source term is still unidentified
  (suspect: the reveal-return ratio `albedo / max(baseAlb * pattern(q), 1e-3)` or a glass branch); harmless now.
* Done this session (commit after 'W1 facades: near-LOD sill…'): winGeo near-LOD sills + surrounds, rendered-wall
  repairs / hairline cracks / string course, richer daylight curtains, porch balustrades + plank decks,
  trim / frame variety. Bench iterations shots/w1/s8 (sills), s10 (all), s12, s15 (speck fix), milestone sheet shots/w1/m2.
  Also: apartments 55 % rendered (PLASTER) / 45 % panels; punched-window reflection × 0.78, home glass albedo
  × 1.18; plinth ledge highlight and salt line toned down; grimier wall foot.
* Milestone 2 checks: golden.sh m2 vs ref = downtown 0.6 / harbor 0.2 / oldtown 0.6 / overview 0.1 / westbrook 2.2
  (all ≪ 8: overview unchanged); downtown shot console clean; invariants: only `landmarks` (statue founder
  vertices 0.07 m outside r — W3's, from the merged base, not buildings). Sheet docs/progress/real/w1_m2.jpg.
* Lead's open points not yet real: apartment glass still reads greyish (reflection vs room), panel-walled
  apartments have no string course / cracks (the block runs on PLASTER/SMOOTH only), office upper floors flat.
* Next: judge s12; string course only on PLASTER/SMOOTH (apartment fronts in the bench are PANELS → none
  there: consider adding panel-joint slab lines); stronger daylight glass variety (reflection still dominates
  on apartments); offices (curtain-wall mullion relief); dirtier foot on apartments; golden.sh before push.

## Code map (file:line at 18be1ae+; session 2 additions)
* `buildings/winGeo.ts` (new): window records from `Builder.wall()` (`Builder.winRec`, mesh.ts `recordWindows`),
  16 m bins, 2 InstancedMeshes (sill profile with drip groove; unit box for surround jambs/head), refilled when the
  camera moves > 3 m; writes `uGeoWin` (centre, range); the shader skips its sill box on wall() quads (vD.w>0)
  inside it (keeps the sill's sun shadow). Range low 22 / medium 32 / high 42 m. `?nowingeo`.
* homes.ts `porchRail` / `porchDeck` helpers (balusters, newels, moulded handrail; boards + joist frame + nosing).
* materials.ts: rendered-wall block (repairs, cracks, string course) after the rain streaks in the `edge < 0`
  branch; curtain variety in the `homey` branch; `?bdbg=nan` after bhWall/bhRoof in the main chunk.
* `buildings/materials.ts`: `bhBrick` / `bhBrickH` 328 (brick bonds), `bhWallSlope` 369 (relief per pattern),
  `uSign` 874 (window-cell u vs tangent T), plinth 895, window-depth block `depthK` 1022 (sill box + reveal trace,
  `dSurf`, `sunShade`, reveal shading + `?bdbg=reveal` debug), roof cotangent frame 1420 + tile relief in the tile
  branch, normal override injection (`bhNW` → `normal`) 1709. Uniforms uWinDepth / uWallRelief / uPlinth set from
  URL in `buildings.ts` createMaterials call.
* `buildings/gen.ts`: `eaveGutter` 538 (called from `gableRoof`, `hipRoof`; `g.roofPipes = false` in homes /
  oldtown), `houseNumber` 651, `doorNiche` 690 (joinery, ironmongery, bell, number).
* `buildings/industry.ts` `rollupDoor` 148; `buildings/houses.ts` genApartment life 387 + core intercom / letter boxes.
* Design: everything flat-wall is shader (one chunk lifts all buildings, near-only fade by pixel size); things that
  stick out at eye level (doors, gutters, pipes, bollards, boxes) are trim geometry, kept inside the footprint
  below 2.4 m (validate checks it).

## Done
* **Window depth (shader parallax, `?nowinreveal`, medium/high: needs uDetail ≥ 0.5)** — in `bhWall`, per window
  cell: the view ray is traced into a reveal (14 cm houses, 10 cm industrial, 9 cm shop, 7 cm doors, 6 cm ribbon,
  0 curtain walls): jambs / head / inner sill hits get the wall surface with depth AO and their own normal
  (`bhNW`, a world-space normal override injected after `normal_fragment_maps`); otherwise the glass point moves to
  the back of the reveal (frame, panes, curtains and the interior mapping shift with the view). A stone sill box
  (6.5 cm thick, 6 cm proud, 5 cm past the jambs, drip groove underneath) is ray-traced in front of the wall for
  window styles PLAIN / MUNTIN / INDUSTRIAL / ARCHED (not on corrugated walls; metal-ish on panel/smooth walls).
  Sun shading: the reveal shades the glass and jambs, the sill shades the wall below (albedo × 0.45–0.5 · daylight).
  Fades with the cell's pixel size (px 0.05–0.2) before the far-field LOD.
* **Wall relief (`?nowallrelief`, medium/high)** — `bhWallSlope` → normal: brick joints (real 215×65 mm bricks,
  10 mm joints, stretcher / Flemish / English bond per building, burnt headers on some Flemish walls, chipped
  arrises, per-brick tilt), ashlar chamfers + pillowed faces, panel joints, lap-board lean, corrugation ribs,
  render trowel undulation + grit. Each fades out where unresolved.

* **Plinth (`?noplinth`)** — shader course at the wall foot (30–62 cm; 0.7–1.2 m concrete upstand under
  corrugated sheds): grey render / stone blocks / darker same material, splash speckles + damp, lit ledge.
* **Roof tile relief** (with `?nowallrelief`) — course butts, pantile roll, per-tile tilt via a derivative cotangent
  frame in `bhRoof`.
* **Doors (`gen.ts doorNiche`, all generators)** — 4 joinery types (2-panel, 6-panel, half-glazed with bars,
  ledged boards), raised fields in moulded frames, lever on back plate + key escutcheon (brass / black / chrome),
  letter plate, kick plate on some, bell push on the architrave, legible house number plate above the door
  (blue enamel / white ceramic / brass digits, sign atlas `hn:*`); `?nodoorlife` drops number + bell.
* **Gutters + downpipes (`eaveGutter`, from `gableRoof` / `hipRoof`)** — box gutter with belly, bead and dark
  channel on every eave, hip corners closed; downpipes (swan neck, brackets, shoe, gully) where the footprint has
  ≥ 13 cm room, low buildings only; generators with their own pipes set `g.roofPipes = false` (homes, oldtown).
  `?nogutters`.
* **Apartments (`houses.ts genApartment`)** — AC condensers / dishes on the back, gable-end downpipes, intercom
  panel at each entrance, letter-box bank on the stair core side.
* **Industrial roll-up doors (`industry.ts`)** — sectional door (≈0.55 m sections, dark joints, pressed ribs,
  scuffed bottom section), guide rails, rubber seal, lift handle; yellow/black steel bollards at the door posts.

## Tried and rejected
* Assuming window-cell u runs along the shader tangent T: wrong for some walls → u direction now from screen
  derivatives (`uSign`). (The first "jamb on the wrong side" reading was the bench camera standing to the right.)
* Reveal returns using the wall pattern at the wall coordinates: the bricks ran on across the arris, no corner
  read → pattern turned 90° on the returns + depth AO, frame contact line, pale worn arris.

## Toggles / tiers / costs
* `?nowingeo` (sill + surround geometry; range by tier). Rendered-wall details ride on `?nowallrelief`.
* `?nowinreveal` (uWinDepth), `?nowallrelief` (uWallRelief, also roof tile relief), `?noplinth` (uPlinth); shader
  features off on `quality=low` (uDetail 0.4).
* Cost (SwiftShader, downtown 12 h, 1280×720, one run): baseline 666 ms vs all three shader features off 702 ms
  — inside the noise, no measurable cost here; 169 draw calls unchanged, triangles +4 from the toggles (geometry
  features are not toggled by that variant). Needs the Adreno run (`perf.mjs --variants ";nowinreveal&nowallrelief&noplinth;nogutters&nodoorlife"`).
* `?nodoorlife` (house numbers + bells), `?nogutters` (eave gutters + roof-builder downpipes). Geometry, all tiers.

## Sheets
* base: shots/w1/base/sheet_1.png (yaw 18). Iterations shots/w1/s1…s7 (s5 fronts 2.5/12 m, s6 roof, s7 industrial).
* Overview after: shots/w1/ov_after.png (console clean, invariants {}, validate []). Night: shots/w1/night_dt.png
  (21.5 h downtown, clean, invariants {}).
* Before / after (yaw 18, 3 / 10 m): docs/progress/real/w1_before.jpg, w1_after.jpg; close-ups w1_details.jpg.

## Tokens (session 1, `tokens.py`)
TOTAL weighted 4.4M (cache read 80%, cache write 8%, output 11%); 148 calls, ctx median 248k / max 338k, 0 cold
calls, idle>5 min warm 1 / cold 0 (the main-session 1 h cache holds). Over the ~200k context target: the next
milestone should start fresh from this log.

## Tokens (session 2, `tokens.py`)
TOTAL weighted 2.5M (cache read 78%, write 9%, output 13%); 115 calls, ctx median 176k / max 235k (over the
200k cap → stopped at milestone 2). Next session starts fresh from this log.
