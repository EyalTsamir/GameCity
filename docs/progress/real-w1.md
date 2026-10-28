# W1 — Facades (real-things round)

Branch `claude/real-w1-facades` (from `claude/pensive-gates-bim12i`). Brief: docs/progress/real-briefs.md "W1".

## Resume here
* 16:45 UTC — Milestone 1 (priorities 1–4 + part of 5) coded, judged on the bench, committed. Running: night
  regression (shots/w1/night_dt.png), perf A/B (shots/w1-perf.log), final after-bench → docs/progress/real/w1_*.jpg.
* **OPEN REGRESSION (fix first):** 1–3 small bright specks (4×4 bloom blocks = an Inf/NaN or very hot pixel) on
  some glass panes since the window-depth change (after sheet: apartment 3 m, office 3 m, townhouse 10 m; base had
  none). Suspects in `bhWall`'s window-depth block: glass pixels at the reveal corner where `sEx.x ≈ sEx.y`, `f`
  rewritten from the shifted `pm` (feeds `Np` / bhRoom / bhShop), or the jamb normal when `kd.x → 0`. Bisect with
  `?nowinreveal` / `?nowallrelief` and clamp `emit` / guard NaN.
* Next (fresh session): (a) reveal still subtle head-on/in shade — consider a painted/rendered reveal on some brick
  houses and a frame with real thickness (shadow line on the glass along the frame); (b) shader sill speckle on the
  top face is a bit salty; (c) the old "salt tide line" now sits on the plinth top and reads as a white smear on
  some walls (materials.ts `salt`) — tone it down or tie it to the plinth ledge; (d) priority 5/6 for townhouses,
  towers and offices (intercoms, AC on office backs, curtain-wall mullions in relief); (e) contact: dirt where
  downpipe shoes / door steps meet the ground; (f) bench framing for back sides (`--yaw 150` lands inside lots).
* Debug: `?bdbg=reveal` colours reveal hits (red jamb, green head, blue inner sill, yellow sill box).

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
