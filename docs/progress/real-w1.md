# W1 — Facades (real-things round)

Branch `claude/real-w1-facades` (from `claude/pensive-gates-bim12i`). Brief: docs/progress/real-briefs.md "W1".

## Resume here
* **Session 5 (10-28) — DONE, next session starts here:** sheet docs/progress/real/w1_s5.jpg (tower crown, house window
  3 m / 45° in sun, warehouse sectional door, apartment). Checks: downtown console clean, invariants {}; overview OK.
  - **Lawn rim FIXED (lead's request, W5's trace):** mesh.ts `wall()` lowers ground-standing shell walls (|y0| < 2 cm,
    facade builder only) by 10 cm, so the shadow map has no gap under the wall (lawn at −0.04). shots/w1/s5/rim_after.png
    vs rim_b1.png: the bright line is gone (a faint blade fringe remains). Downtown clean, invariants {}, validate [].
  **Open, in order:** (a) apartment glass still uniform grey at 3 m — the glassAlb × 0.62 / homey reflection × 1.1
  changes are visible on houses but NOT on apartments (bench apartment pick 0, shaded front) → the grey comes from
  another term: probe the pane terms one at a time (`interior`, `refl`/`bhOpp`, the pale blind/net layer in the homey
  branch ~l.1557, far-path `avgAlb` if detail < 1) with a debug view before changing anything; (b) bench window shots need a
  sunlit facade — bench house pick 0 faces N; use the scratch `__city.view` framing above (or add `--front S` to bench);
  (c) `?bdbg=reveal` / `?bdbg=ret` debug views still in the code (cheap; remove when the round ends);
  (d) roller-shutter variant (50 %) unchanged from s4 and reads well; sectional glazed openings could take a reflection.
  - **Bug 4 FIXED:** lot 23 is the SLANT crown (H 82.1, walls to 89.6 at the back), not stepped. slantTop used
    edgeGrid (m = floors − 1) so everything above H was outside the grid (plain dark wall + a speckled row).
    towers.ts slantTop: `gr.m = ceil((highY − v0) / ch)` → the curtain wall runs up to the slope (shots/w1/s5/tw_fix.png).
    Probe tip: the shell mesh is ONE indexed geometry `buildings-shell` (iterate index.count, not position.count).
  - **Window reveal (item 2):** the parallax was right all along (`?bdbg=reveal` now paints, inside the opening,
    R = sunOn, G = sun-shadow mask). The bench house pick 0 faces N (never sunlit; at 16 h the sun grazes it and lights
    the far jamb return — physically right); judge on a S-facing house: scratch script shots via
    `__city.view({target: front + 2.2 m, distance 3.2, yaw 40, pitch 6})` (shots/w1/s5/sunS_norev / sunS / sunS2).
    Fix: reveal sun shade 0.62 → 0.78 (shadow keeps only the sky light), sill shadow 0.5 → 0.68, and the glass gets its
    own mask `sunShadeG` 4.5 cm behind the frame face (the frame's own return shadow on the pane). Result: head + jamb
    shadow on the frame reads at 3 m / 45°.
  - **Lawn rim (item 3):** probe done → lighting (not ours). normalBias 0/1/3 no change; `?noao` reveals a ~0.5 m
    sunlit band along the wall foot with a sharp edge (`tune.pcf` 0.3) → the building's ground shadow starts ~0.5 m
    out. Cause + one-line fix proposal in real-requests.md (depth bias `sun.shadow.bias`, render/sky.ts l.404).
  - **Apartment glass (item 4):** homey `glassAlb` × 0.95 → × 0.62 (a room by day is far darker than the facade);
    homey reflection boost × 1.6 → × 1.1 (offices/shops keep 1.6).
  - **Roller door (item 5):** industry.ts sectional branch rebuilt: profiled sections (shaded foot bevel, lit nose,
    dark joint), two pressed ribs per section as sloped faces, glazed section with real openings (posts between,
    reveal sill, glass 2 cm back with sky-lit upper half, black gasket frames), galvanised tracks with a dark slot
    and bolt heads, aluminium bottom bar + flared rubber lip, scuffs, lift handle + lock; the dock bumpers that
    floated on the leaf at ground-level doors removed.
* **Session 4 stopped by the lead at the context cap (WIP pushed, nothing judged as final).** Next session, in order:
  1. **Bug 4 tower crown (lot 23 twin towers, stepped crown, scheme 1 wall #3d4854):** `?bdbg=ret` (shots/w1/tw/f_ret.png)
     paints the crown band GREEN = pixels with `cell` outside the grid (`cell.y >= vB.y` etc., materials.ts ~l.1140),
     speckled with in-grid pixels → the band (≈ last storey + parapet, y ≈ 81.7–83.1) flips per pixel between
     glass and the plain-wall return. Probe queued but killed: dump shell vertices (uv.y, aB.x/y, aD.w) of the tower
     top (scratchpad script idea: traverse `buildings-shell`, x −52…−27, z −110…−85, y > 70; console.warn). Suspects:
     uv v ≈ m at the top tier wall (v0 = gH, m = floors − 1 → v = m exactly at H), or a coplanar second wall quad
     (tierRoof parapet / tier walls) overlapping. Fix candidates: clamp cell.y to m − 1 when v − m < 0.02, or give the
     parapet its own solid look; don't extend slantTop grids (not this tower).
  2. **Lawn rim:** persists with `?nograss` (shots/w1/rim_nograss/apartment_3m.png) → NOT groundcover blades.
     terrain/ground.ts already DARKENS grass along walls (edge canvas, `edge` l.706). Current hypothesis: a sun-lit
     leak strip at the wall foot from the shadow normal offset (render/sky.ts `sun.shadow.normalBias = texel·0.8·tune.bias`,
     the wall's shadow lifted off the contact line; the rim shows on walls in their own shade). Probe (scripted, not
     run): `shot.mjs --eval` setting `__city.ctx.services.sky.tune.bias = 0` vs 1 at the bench apartment
     (target −137.5,0.6,−56.5, yaw = front + 18, 4 m, pitch 10) — if the rim vanishes it is lighting (sky owner),
     else terrain ground shader. Written to real-requests.md.
  3. Judge on the bench (not yet seen): s2 classes tower, warehouse, factory, church, school (`--dists 3,10`);
     re-run s1 (house, townhouse, apartment, office) for the darker reveal returns + paint patina + box cladding.
  4. Then remaining from judge-1: tower upper curtain wall still flat blue; window reveal at an oblique 3 m view
     (returns now ×0.74 jamb / ×0.6 head — verify); old-town render at 3 m (relief reduced — verify).
  - s1 bench (shots/w1/s1/sheet_1.png): awnings read (scallops, bar, sag), shutters ribbed at 10 m, glass variety
    better at 10 m; house window still flush-looking frontal (before the return darkening).
  - Temporary debug kept: `?bdbg=ret` (uBhDebug 7) in materials.ts / buildings.ts.
* **Session 4 (10-28, fix round after judge-1 / bugs-1)** — order: bugs 3/4/9 → lawn rim → reveal shadow →
  per-pane glass variety → townhouse walls/shutters/awnings → roller doors → church/school → tower ground floor.
  - bug 3 (garage at 90° to the drive): homes.ts `sideRun` puts a plain side entrance (Op.plain, no number/bell:
    `DoorOpts.plain`) on the driveway side instead of a garage door; 'garage' plan: door on the wing's street face,
    small window on the drive side. Driveway still runs beside the wing (plan.ts placeHouse, not ours) → request.
  - bug 9 (hotel flag boards): special.ts `hotelFlag` — wall bracket, raked pole ≤ 1.16 m out, finial, banded
    double-sided cloth hanging from the pole with ripples (3 designs).
  - bug 4 (tower crown noise): NOT shadows (castShadow off: same), NOT the wall relief / reveal / plinth / refl /
    trim / other modules; it is in bhWall after the `?bdbg=wallinfo` return (l.~1117) → suspect the early
    returns at `cell.y >= vB.y` (rows above the grid on crown walls). Debug `?bdbg=ret` (uBhDebug 7: red = no grid,
    green = outside the grid) added for that. towers.ts: `slantTop` walls use edgeGrid (m = floors−1) up to
    yTop+7.5; stepped tiers also reuse edgeGrid.
  - lawn rim: groundcover/mask.ts §2 "unmown edge tufts" stroke the lot footprints (0.9 m, length 120) and the
    tip colour (palette.ts gcTipColor ×1.16–1.3) lights them — suspected source (not ours); bench `?nograss` to confirm.
  - reveal: materials.ts frame AO (`aoF`, after the recess block): frame darker under the head / beside the
    jambs, scaled by revD; reveal sun shadow 0.55 → 0.62.
  - glass variety: far path (`detail < 1`) per pane / per block `pv`: dark room / pale blinds / tinted curtains /
    plain → avgAlb × factor, `paneRefl` on the far reflection; curtain/ribbon reflK per pane 0.82–1.18.
  - render relief (PLASTER) in bhWallSlope: 5 cm term 0.009 → 0.0035, grit 0.5 → 0.22, trowel 0.06 → 0.075; speckle 0.2 → 0.12.
  - clutter.ts `louvredLeaf` (stiles, rails, raked louvres over a dark back) for open + closed shutters.
  - oldtown.ts `awning`: 4 slope segments with sag between the arms, scalloped valance (4 quads per stripe, both
    faces), front roller bar.
  - industry.ts roller shutter variant (50 %): 77 mm slats (lit roll + shaded underside), dents, bottom bar +
    rubber + lock, U guide channels, coil hood.
  - special.ts school: `dressings` (stone lintels with a joint line), carved name tablet (letterSign on a moulded
    stone panel). landmarks/church.ts (not in the brief's files; the lead assigned church): portal door strap
    hinges + nails, meeting stile, ring pulls, threshold; plinth course (`plinthRun`) on tower + nave.
  - towers.ts lobby doors: canopy fascia lip, hanger rods, lit number, intercom, tenant board, letter plate.
* **Milestone 3 (session 3) done** — sheet docs/progress/real/w1_m3.jpg (shots/w1/m3). golden m3 vs ref:
  downtown 1.2 / harbor 0.4 / oldtown 0.7 / overview 0.1 / westbrook 0.6; downtown console clean; invariants:
  only the W3 statue (landmarks). Next (open): apartment punched glass still reads light where nets/blinds
  cover it (street reflection reads on offices/shops, weakly on apartments — more sky/trees in the image or
  fewer pale nets); render walls (PLASTER) could take map cracks; columns: trim material is flat (no grain);
  porch step only where the footprint has ≥ 34 cm in front (not on the bench house); perf on Adreno for
  `;nowinrefl&nocolumndetail`.
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
* **Albedo > 1 (lead item 1):** probe runs p1/p2/p4 (`?bdbg=src`, BEFORE the clamp; 20 captures over
  apartment/office/house/tower/shop/townhouse/school, picks 0/1/2, 3–10 m) show **zero** out-of-range pixels
  on this base — the m2 specks do not reproduce. Analysis: the only way to exceed 1 is multiplicative stacking
  on pale bases (white render / panels ≈ 0.8 × pattern ≤ 1.36 × macro ≤ 1.22 × sun bleach 1.08 × arris 1.18 …):
  rare coincident peaks → isolated pixels, exactly the m2 symptom (reveal arrises / walls around glass). Root
  fix: `bhHeadroom(a, base)` soft-compresses the upside of the modulation stack into the base colour's headroom
  (h = 0.92/base − 1) at the wall exits (after weathering, reveal returns, wall branch). The [0,1] clamp stays
  only as a NaN/Inf guard. Mid/dark walls unchanged.
* Session 3 work (benches s1–s4, s4b pick 1): panel grid `bhPG` (one bay × one storey on gridded
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
* `?nowinrefl` (uWinRefl: street / opposite-row reflection in punched windows, near path only, medium/high),
  `?nocolumndetail` (clad arcade columns → plain boxes). `?bdbg=src` / `?bdbg=refl` debug views (see Resume).
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

## Tokens (session 3, `tokens.py`)
TOTAL weighted 3.4M (cache read 79%, write 8%, output 12%). Stopped at milestone 3 (~150k context).

## Tokens (session 4, `tokens.py`)
TOTAL weighted 4.9M (cache read 84%, write 7%, output 9%). Stopped by the lead at ~317k context (over the cap: too many
waits on the slow shot lock inside one session).

## Tokens (session 5, `tokens.py`)
TOTAL weighted 2.5M (cache read 80%, write 9%, output 12%); 123 calls, ctx median 171k / max 236k — over the 170k cap:
get_session's context_usage reads 0 in this container, so run tokens.py for the real figure instead.
